import { addItem, getItemByUrl, updateItemNotes } from "./lib/storage.js";
import { extractNotes, displayRawNotes } from "./lib/note-extractor.js";

let currentItem = null;
let saveTimer = null;

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function setVisible(id, visible) {
  document.getElementById(id).hidden = !visible;
}

function setSaveState(text) {
  document.getElementById("save-state").textContent = text;
}

function updateAutoSummary(item, raw) {
  const extracted = extractNotes(raw);
  const sections = [
    ["想法", extracted.thoughts],
    ["重点", extracted.highlights],
    ["疑问", extracted.questions],
    ["行动", extracted.actions],
  ]
    .filter(([, value]) => value)
    .map(([label]) => label);
  const detail = sections.length ? "已识别：" + sections.join("、") : "会在你输入后自动提炼";
  document.getElementById("auto-summary").textContent =
    "自动分类：" + (item.category || "其他") + " · " + detail;
}

function renderItem(item) {
  currentItem = item;
  setVisible("empty-state", false);
  setVisible("notes-state", true);
  document.getElementById("article-title").textContent = item.title || item.url;
  document.getElementById("article-url").textContent = item.url;
  const notes = item.notes || {};
  const raw = displayRawNotes(notes);
  document.getElementById("raw-notes").value = raw;
  updateAutoSummary(item, raw);
  setSaveState("已加载");
}

async function loadForCurrentTab() {
  const tab = await activeTab();
  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    setVisible("empty-state", true);
    setVisible("notes-state", false);
    setSaveState("请打开文章页面");
    return;
  }

  const item = await getItemByUrl(tab.url);
  if (item) {
    renderItem(item);
  } else {
    setVisible("empty-state", true);
    setVisible("notes-state", false);
    setSaveState("未保存");
  }
}

async function saveCurrent() {
  const tab = await activeTab();
  if (!tab?.url || !/^https?:/i.test(tab.url)) return;
  renderItem(await addItem({ url: tab.url, title: tab.title }));
}

async function persistNotes() {
  if (!currentItem) return;
  const raw = document.getElementById("raw-notes").value;
  currentItem = await updateItemNotes(currentItem.id, {
    notes: { raw },
  });
  updateAutoSummary(currentItem, raw);
  setSaveState("已自动保存");
}

function scheduleSave() {
  setSaveState("保存中…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistNotes().catch(() => setSaveState("保存失败")), 350);
}

document.getElementById("save-current").addEventListener("click", () => {
  saveCurrent().catch(() => setSaveState("保存失败"));
});
document.getElementById("raw-notes").addEventListener("input", scheduleSave);

loadForCurrentTab().catch(() => setSaveState("加载失败"));
