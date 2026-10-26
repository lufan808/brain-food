// calendar.js
// ---------------------------------------------------------------------------
// The only file in the extension that talks to your calendar. It does three
// things:
//   1. Ask when you're busy over the next couple of weeks.
//   2. Find which days already have a reading block (so we never book two).
//   3. Create the "Brain food" event in the free slot we found.
//
// IMPORTANT CHANGE FROM THE GOOGLE VERSION:
// A Chrome extension can't safely talk to Feishu directly (Feishu has no
// built-in browser login, and its secret key must never live inside an
// extension). So instead of calling a calendar API ourselves, we talk to a
// tiny HELPER program running on your own Mac (see the /helper folder). The
// helper, using `lark-cli`, does the real Feishu work and hands the answers
// back. From this file's point of view it's just a few small web requests to
// localhost.
//
// The slot-picking decision still lives in slots.js (pure, tested logic). This
// file is just the messenger between the extension and the helper.
// ---------------------------------------------------------------------------

import { findNextFreeSlot, localDateKey } from "./slots.js";

// The private local address the helper listens on. 127.0.0.1 means "this
// machine only" — nothing leaves your computer.
const HELPER = "http://127.0.0.1:8787";
// Feishu's free/busy endpoint rejects ranges longer than 14 days.
const MAX_LOOKAHEAD_DAYS = 14;

// Keep calendar query times in the Mac's local timezone. The scheduler also
// interprets the user's windowStart/windowEnd in local time, so sending the
// same offset avoids lark-cli's UTC-vs-local-time warning.
function toLocalISO(date) {
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    `${pad(date.getMilliseconds(), 3)}${offset}`
  );
}

// --- Talking to the local helper --------------------------------------------

// A small wrapper around fetch that POSTs JSON to the helper and returns the
// parsed reply. If the helper isn't running, fetch throws a network error; we
// catch that and turn it into a clear, human message so the extension can tell
// you what to do.
async function callHelper(path, body) {
  let res;
  try {
    res = await fetch(`${HELPER}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  } catch (_) {
    throw new Error(
      "Can't reach the Brain food helper. Make sure it's running on your Mac " +
        "(open the helper folder and run it), then try again."
    );
  }

  // The helper always replies with JSON: { ok: true, ... } or { ok: false, error }.
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Helper error (${res.status}).`);
  }
  return data;
}

// --- The public functions the rest of the app uses --------------------------

/**
 * Find a free slot from the user's preferences and book a Brain food reading block.
 * @param {Array} batchItems  The configured batch of saved items; {url, title}.
 * @param {Object} settings   The user's preferences (from storage).
 * @param {Object} [opts]
 * @param {Date}   [opts.now=new Date()]  Injectable clock for testing.
 * @returns {Promise<{event, slot}>}
 * @throws if no free slot exists in the lookahead window, or the helper errors.
 */
export async function scheduleReadingBlock(batchItems, settings, opts = {}) {
  const now = opts.now || new Date();
  const calendarId = settings.calendarId || "primary";

  // Older settings may contain a larger value because the UI used to allow up
  // to 60 days. Clamp it here as well so those saved settings cannot recreate
  // the illegal Feishu query range.
  const requestedLookahead = Number(settings.lookaheadDays);
  const lookaheadDays = Number.isFinite(requestedLookahead)
    ? Math.min(MAX_LOOKAHEAD_DAYS, Math.max(1, Math.floor(requestedLookahead)))
    : MAX_LOOKAHEAD_DAYS;

  // The time window we search: from now to lookaheadDays ahead.
  const timeMin = new Date(now);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + lookaheadDays);

  const startISO = toLocalISO(timeMin);
  const endISO = toLocalISO(timeMax);

  // 1. Ask the helper when we're busy across the window.
  const fb = await callHelper("/freebusy", { start: startISO, end: endISO });
  const busy = fb.busy || [];

  // 2. Ask the helper for events in the window, and pick out the days that
  //    already hold one of OUR reading blocks (matched by the event title), so
  //    we never put two reading blocks on the same day.
  const title = settings.eventTitle || "Brain food";
  const ev = await callHelper("/events", { start: startISO, end: endISO });
  const blockedDays = new Set();
  for (const e of ev.events || []) {
    if (e.summary !== title) continue; // only count our own blocks
    if (e.start) blockedDays.add(localDateKey(e.start));
  }

  // 3. Use our tested brain to pick the slot, skipping any taken day.
  const slot = findNextFreeSlot(busy, { ...settings, lookaheadDays }, now, blockedDays);
  if (!slot) {
    throw new Error(
      `No free ${settings.blockMinutes}-minute slot found on a free day in your ` +
        `preferred window over the next ${lookaheadDays} days.`
    );
  }

  // 4. Build the event (the 5 links go in the description) and ask the helper
  //    to create it on Feishu.
  const description = buildDescription(batchItems);
  const created = await callHelper("/create", {
    summary: title,
    description,
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    calendarId,
    reminderMinutes: 10,
  });

  // Keep the same return shape the rest of the app already expects: an object
  // with an `id`, plus the chosen slot.
  return { event: { id: created.eventId }, slot };
}

// Delete a reading-block event (used when the user clicks Undo on a booking).
export async function deleteReadingEvent(eventId, settings, _opts = {}) {
  const calendarId = settings.calendarId || "primary";
  await callHelper("/delete", { eventId, calendarId });
}

// Format the saved items into a tidy, clickable description block.
function buildDescription(items) {
  const lines = items.map((it, i) => `${i + 1}. ${it.title}\n   ${it.url}`);
  return ["Your reading list for this session:", "", ...lines, "", "Booked by Brain food"].join("\n");
}
