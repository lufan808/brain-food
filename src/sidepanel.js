import { addItem, getItemByUrl, updateItemNotes } from "./lib/storage.js";
import { CATEGORY_OPTIONS, normalizeCategory } from "./lib/categories.js";

let currentItem = null;
let saveTimer = null;
const fields = ["thoughts", "highlights", "questions", "actions"];

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

function populateCategories(selected) {
  const select = document.getElementById("category");
  select.replaceChildren();
  CATEGORY_OPTIONS.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    option.selected = category === normalizeCategory(selected);
    select.appendChild(option);
  });
}

function renderItem(item) {
  currentItem = item;
  setVisible("empty-state", false);
  setVisible("notes-state", true);
  document.getElementById("article-title").textContent = item.title || item.url;
  document.getElementById("article-url").textContent = item.url;
  populateCategories(item.category);
  const notes = item.notes || {};
  fields.forEach((field) => {
    document.getElementById(field).value = notes[field] || "";
  });
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
  const notes = Object.fromEntries(fields.map((field) => [field, document.getElementById(field).value]));
  currentItem = await updateItemNotes(currentItem.id, {
    category: document.getElementById("category").value,
    notes,
  });
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
fields.forEach((field) => document.getElementById(field).addEventListener("input", scheduleSave));
document.getElementById("category").addEventListener("change", scheduleSave);

loadForCurrentTab().catch(() => setSaveState("加载失败"));
