// review.js — the little checklist that pops up when a reading block ends.
// For each item in the block, you tick "finished" or leave it for next time.

import {
  getReview,
  getItems,
  getSettings,
  setItems,
  setSettings,
  removeReview,
} from "./lib/storage.js";

// Which review are we showing? The window was opened with ?rid=<id>.
const rid = new URLSearchParams(location.search).get("rid");

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function init() {
  const review = await getReview(rid);
  const allItems = await getItems();
  // The block's items that still exist (some may have been deleted since).
  const items = review ? allItems.filter((it) => review.itemIds.includes(it.id)) : [];

  const listEl = document.getElementById("review-list");
  const doneBtn = document.getElementById("done");

  // Nothing left to review (deleted, or already cleaned up): just offer to close.
  if (items.length === 0) {
    document.getElementById("intro").textContent = "Nothing to review here.";
    doneBtn.textContent = "Close";
    doneBtn.addEventListener("click", async () => {
      if (rid) await removeReview(rid);
      window.close();
    });
    return;
  }

  // Build a checkbox row per item. Default checked = whatever its read state is,
  // so anything you already marked read shows as finished.
  const boxes = new Map();
  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "review-row";

    const label = document.createElement("label");
    label.className = "review-rowlabel";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!it.read;
    boxes.set(it.id, cb);

    const body = document.createElement("span");
    body.className = "review-body";
    const title = document.createElement("span");
    title.className = "review-itemtitle";
    title.textContent = it.title;
    const meta = document.createElement("span");
    meta.className = "review-itemmeta";
    meta.textContent = domainOf(it.url);
    body.append(title, meta);

    label.append(cb, body);
    li.append(label);
    listEl.append(li);
  });

  doneBtn.addEventListener("click", async () => {
    doneBtn.disabled = true;
    const status = document.getElementById("review-status");
    status.textContent = "正在整理阅读回顾…";
    const completedAt = new Date().toISOString();

    // Apply every change in a single write.
    const updated = allItems.map((it) => {
      const cb = boxes.get(it.id);
      if (!cb) return it; // not part of this block
      if (cb.checked) {
        // Finished: mark read (stays out of future blocks).
        return { ...it, read: true, reviewedAt: it.reviewedAt || completedAt };
      }
      // Not finished: back to waiting (unread + un-batched) so it can be
      // scheduled into a future block.
      return { ...it, read: false, batchedAt: null };
    });
    await setItems(updated);

    // Keep every article that has ever been completed in the single history
    // document, even if the user later marks it unread for another pass.
    const reviewedItems = updated.filter((item) => item.reviewedAt);
    if (reviewedItems.length) {
      try {
        const settings = await getSettings();
        const res = await fetch("http://127.0.0.1:8787/review-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: settings.reviewDocumentId || null,
            documentUrl: settings.reviewDocumentUrl || null,
            items: reviewedItems,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `Helper error (${res.status})`);
        }
        await setSettings({
          ...settings,
          reviewDocumentId: data.documentId,
          reviewDocumentUrl: data.url || settings.reviewDocumentUrl || null,
        });
      } catch (error) {
        status.textContent = `阅读状态已保存，但回顾文档同步失败：${error.message}`;
        doneBtn.disabled = false;
        return;
      }
    }

    if (rid) await removeReview(rid);
    window.close();
  });
}

init();
