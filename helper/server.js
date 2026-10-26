// server.js — the Brain food "helper" that runs on YOUR Mac.
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// A Chrome extension lives inside the browser's sandbox. It can talk to the
// public internet, but it cannot run programs on your computer, and it cannot
// safely hold the secret key your Feishu app needs. Feishu (unlike Google) has
// no built-in browser login.
//
// So we split the work in two:
//   - The EXTENSION (in the browser) decides WHEN to book and WHAT to book.
//   - This HELPER (a tiny program on your Mac) does the actual Feishu calendar
//     work, by handing requests to `lark-cli`, which is already logged in to
//     your Feishu account.
//
// The extension whispers to this helper over localhost (a private phone line
// that never leaves your machine). Your Feishu login and app secret stay safely
// inside lark-cli's config on your Mac — they never enter the browser.
//
// This file has NO external dependencies — it only uses things that ship with
// Node.js — so there is nothing to `npm install`.
// ---------------------------------------------------------------------------

import http from "node:http";
import { execFile } from "node:child_process";

// The private phone line. 127.0.0.1 means "this machine only" — no other
// computer on your network (or the internet) can reach it.
const HOST = "127.0.0.1";
const PORT = 8787;

// Where to find lark-cli. It's normally on your PATH, so just "lark-cli" works.
// You can override it by setting the LARK_CLI environment variable if needed.
const LARK_CLI = process.env.LARK_CLI || "lark-cli";

// ---------------------------------------------------------------------------
// Talking to lark-cli
// ---------------------------------------------------------------------------

// Run a lark-cli command and return its parsed JSON output.
//
// SECURITY NOTE: we use execFile with an ARRAY of arguments (not a single
// string fed to a shell). That means things like article titles or URLs are
// passed as plain data and can never be interpreted as commands — there is no
// shell to trick. This is the safe way to call an external program.
function lark(args, stdinText = null) {
  return new Promise((resolve, reject) => {
    // Every call runs as the logged-in user and asks for machine-readable JSON.
    const fullArgs = [...args, "--as", "user", "--format", "json"];
    const child = execFile(
      LARK_CLI,
      fullArgs,
      { maxBuffer: 10 * 1024 * 1024 }, // allow up to 10MB of output (calendars can be chatty)
      (err, stdout, stderr) => {
        // execFile errors when lark-cli exits non-zero. Surface a useful message.
        if (err && !stdout) {
          reject(new Error(`lark-cli failed: ${stderr || err.message}`));
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(stdout);
        } catch (_) {
          reject(new Error(`Could not understand lark-cli output: ${stdout.slice(0, 300)}`));
          return;
        }
        // lark-cli marks failures with ok:false and an error object.
        if (parsed && parsed.ok === false) {
          const msg = parsed.error?.message || JSON.stringify(parsed.error || parsed);
          reject(new Error(`Feishu error: ${msg}`));
          return;
        }
        resolve(parsed);
      }
    );
    if (stdinText !== null) child.stdin.end(stdinText);
  });
}

// Feishu's "primary" calendar has a real ID that looks like an email
// (e.g. you@company.com). The extension just says "primary"; we translate that
// into the real ID once and remember it for as long as the helper runs.
let cachedPrimaryId = null;
async function resolveCalendarId(calendarId) {
  // If the user pasted a real ID (anything that isn't the word "primary"), use it.
  if (calendarId && calendarId !== "primary") return calendarId;
  if (cachedPrimaryId) return cachedPrimaryId;

  const res = await lark(["calendar", "calendars", "primary"]);
  // Shape: { data: { calendars: [ { calendar: { calendar_id, ... } } ] } }
  const entry = res?.data?.calendars?.[0];
  const id = entry?.calendar?.calendar_id || entry?.calendar_id;
  if (!id) throw new Error("Couldn't find your primary Feishu calendar.");
  cachedPrimaryId = id;
  return id;
}

// Turn an ISO time string (what the browser sends) into Unix SECONDS as a
// string, which is what Feishu's event API wants. Date.parse understands the
// browser's ISO strings exactly, so this conversion is precise.
function isoToUnixSeconds(iso) {
  return String(Math.floor(new Date(iso).getTime() / 1000));
}

// ---------------------------------------------------------------------------
// The four jobs the extension asks for
// ---------------------------------------------------------------------------

// 1. When am I busy between two times? (so we can find a free slot)
async function getFreeBusy({ start, end }) {
  const res = await lark(["calendar", "+freebusy", "--start", start, "--end", end]);
  // Older lark-cli versions returned the busy intervals directly in data.
  // Current versions wrap them in data.users[].busy. Accept both shapes so
  // the helper remains compatible with the installed CLI.
  const users = Array.isArray(res.data) ? res.data : res.data?.users || [];
  const intervals = Array.isArray(res.data)
    ? users
    : users.flatMap((user) => user.busy || []);
  const busy = intervals.map((b) => ({
    start: b.start_time,
    end: b.end_time,
  }));
  return { busy };
}

// 2. Which events do I already have in this window? (so we never book two
//    reading blocks on the same day). We return title + start + id; the
//    extension filters to the ones that are actually OUR reading blocks.
async function getEvents({ start, end }) {
  const res = await lark(["calendar", "+agenda", "--start", start, "--end", end]);
  const events = (res.data || []).map((ev) => ({
    summary: ev.summary || "",
    // agenda gives start_time as { datetime, timezone }; datetime is a real
    // ISO timestamp we can compare directly.
    start: ev.start_time?.datetime || ev.start_time || null,
    eventId: ev.event_id || null,
  }));
  return { events };
}

// 3. Create the reading block. We use the full event API (rather than the
//    +create shortcut) on purpose: it lets us mark the time as "busy", set a
//    10-minute reminder, and — importantly — NOT attach a video call, which
//    the shortcut would do. A solo reading block needs no meeting room.
async function createEvent({ summary, description, start, end, calendarId, reminderMinutes }) {
  const calId = await resolveCalendarId(calendarId);
  const data = {
    summary: summary || "Brain food",
    description: description || "",
    start_time: { timestamp: isoToUnixSeconds(start) },
    end_time: { timestamp: isoToUnixSeconds(end) },
    free_busy_status: "busy",
    reminders: [{ minutes: typeof reminderMinutes === "number" ? reminderMinutes : 10 }],
  };
  const res = await lark([
    "calendar",
    "events",
    "create",
    "--params",
    JSON.stringify({ calendar_id: calId }),
    "--data",
    JSON.stringify(data),
  ]);
  // Shape: { data: { event: { event_id } } } (sometimes { data: { event_id } })
  const eventId = res?.data?.event?.event_id || res?.data?.event_id || null;
  if (!eventId) throw new Error("Feishu created the event but returned no ID.");
  return { eventId };
}

// 4. Delete a reading block (used when you click "Undo" on a booking).
async function deleteEvent({ eventId, calendarId }) {
  const calId = await resolveCalendarId(calendarId);
  await lark([
    "calendar",
    "events",
    "delete",
    "--params",
    JSON.stringify({ calendar_id: calId, event_id: eventId, need_notification: false }),
  ]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// One shared reading-review document
// ---------------------------------------------------------------------------

const REVIEW_CATEGORIES = [
  "技术与工具",
  "营销与业务",
  "学习与研究",
  "行业与趋势",
  "生活与灵感",
  "其他",
];

function escapeMarkdownText(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("$", "\\$")
    .replaceAll("~", "\\~")
    .replaceAll("<", "\\<")
    .split("\n")
    .map((line) => (/^\s*[#+\->]/.test(line) ? `\\${line}` : line))
    .join("\n");
}

function escapeMarkdownUrl(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function buildReviewMarkdown(items) {
  const sorted = [...items].sort(
    (a, b) => new Date(a.reviewedAt || a.savedAt || 0) - new Date(b.reviewedAt || b.savedAt || 0)
  );
  const groups = new Map(REVIEW_CATEGORIES.map((category) => [category, []]));
  sorted.forEach((item) => {
    const category = REVIEW_CATEGORIES.includes(item.category) ? item.category : "其他";
    groups.get(category).push(item);
  });

  const lines = [
    "# 我的阅读回顾",
    "",
    "所有读完的文章都集中在这里，按文章类型分类，并在每个分类内按完成时间排序。",
    "",
  ];

  for (const [category, categoryItems] of groups) {
    if (!categoryItems.length) continue;
    lines.push(`## ${escapeMarkdownText(category)}`, "");
    for (const item of categoryItems) {
      const date = new Date(item.reviewedAt || item.savedAt || Date.now()).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const title = item.title || item.url;
      const notes = item.notes || {};
      lines.push(
        `### ${escapeMarkdownText(date)} · ${escapeMarkdownText(title)}`,
        "",
        `原文名称：[${escapeMarkdownText(title)}](${escapeMarkdownUrl(item.url)})`,
        `原文链接：${escapeMarkdownText(item.url)}`,
        "",
        "#### 回顾与自己的想法",
        escapeMarkdownText(notes.thoughts) || "（未填写）",
        "",
        "#### 重点摘录",
        escapeMarkdownText(notes.highlights) || "（未填写）",
        "",
        "#### 疑问",
        escapeMarkdownText(notes.questions) || "（未填写）",
        "",
        "#### 下一步行动",
        escapeMarkdownText(notes.actions) || "（未填写）",
        "",
        "---",
        ""
      );
    }
  }
  return lines.join("\n");
}

async function updateReviewDocument({ documentId, documentUrl, items }) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("No completed reading items to write.");
  }
  const markdown = buildReviewMarkdown(items);
  if (documentId) {
    await lark(
      [
        "docs",
        "+update",
        "--doc",
        documentId,
        "--command",
        "overwrite",
        "--doc-format",
        "markdown",
        "--content",
        "-",
      ],
      markdown
    );
    return { documentId, url: documentUrl || `https://feishu.cn/docx/${documentId}` };
  }

  const created = await lark(
    ["docs", "+create", "--doc-format", "markdown", "--content", "-"],
    markdown
  );
  const document = created?.data?.document;
  const id = document?.document_id;
  if (!id) throw new Error("Feishu created the review document but returned no document ID.");
  return { documentId: id, url: document.url || `https://feishu.cn/docx/${id}` };
}

// ---------------------------------------------------------------------------
// The little web server that the extension talks to
// ---------------------------------------------------------------------------

// Only our own browser extension (or a local tool like curl with no Origin)
// may use this helper. A normal website's request carries an https:// Origin,
// which we reject — so no random page you visit can quietly book calendar
// events through this helper.
function isAllowedOrigin(origin) {
  if (!origin) return true; // e.g. curl / health checks from your own terminal
  return origin.startsWith("chrome-extension://");
}

function setCors(res, origin) {
  // Echo back the caller's origin only if we trust it.
  res.setHeader("Access-Control-Allow-Origin", origin && origin.startsWith("chrome-extension://") ? origin : "null");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJSON(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(text);
}

// Read the full request body and parse it as JSON.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Request body was not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

// Map each URL path to the function that handles it.
const ROUTES = {
  "/freebusy": getFreeBusy,
  "/events": getEvents,
  "/create": createEvent,
  "/delete": deleteEvent,
  "/review-document": updateReviewDocument,
};

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  setCors(res, origin);

  // Browsers send a preflight OPTIONS request before a real POST. Answer it.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // A simple "are you alive?" check the extension can use.
  if (req.url === "/health") {
    sendJSON(res, 200, { ok: true, service: "reading-block-helper", port: PORT });
    return;
  }

  if (!isAllowedOrigin(origin)) {
    sendJSON(res, 403, { ok: false, error: "Only the Brain food extension may use this helper." });
    return;
  }

  const handler = ROUTES[req.url];
  if (!handler || req.method !== "POST") {
    sendJSON(res, 404, { ok: false, error: `Unknown request: ${req.method} ${req.url}` });
    return;
  }

  try {
    const body = await readBody(req);
    const result = await handler(body);
    sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    // Log on the helper side (visible in the terminal) and tell the extension.
    console.error(`[reading-block-helper] ${req.url} error:`, err.message);
    sendJSON(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Brain food helper is running.`);
  console.log(`  Listening on http://${HOST}:${PORT}`);
  console.log(`  It uses lark-cli ("${LARK_CLI}") to reach your Feishu calendar.`);
  console.log(`  Leave this window open while you use the extension. Press Ctrl+C to stop.\n`);
});

// If the port is already taken, it almost always means the helper is already
// running in another window — say so plainly instead of crashing cryptically.
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n  Port ${PORT} is already in use.\n` +
        `  The Brain food helper is probably already running in another window.\n` +
        `  You don't need to start it twice.\n`
    );
    process.exit(1);
  }
  throw err;
});
