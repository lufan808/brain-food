// note-extractor.js — turn one free-form note box into review sections.
//
// This stays local-first: the user's raw note never leaves the browser while
// typing. Explicit cues are extracted when present; otherwise the full note is
// kept as the user's thoughts so no context is silently discarded.

const SECTION_RULES = [
  { field: "highlights", pattern: /^(重点摘录?|重点|摘录|原文|金句)\s*[:：-]?\s*/i },
  { field: "questions", pattern: /^(疑问|问题|待验证|想知道|不确定)\s*[:：-]?\s*/i },
  { field: "actions", pattern: /^(下一步行动|下一步|行动|待办|尝试|我要)\s*[:：-]?\s*/i },
  { field: "thoughts", pattern: /^(我的想法|想法|思考|判断|联想)\s*[:：-]?\s*/i },
];

const QUESTION_CUE = /[？?]|^(为什么|怎么|如何|是否|能否|待验证|问题)/i;
const ACTION_CUE = /^(下一步|行动|待办|尝试|我要|可以试试|接下来)/i;
const HIGHLIGHT_CUE = /^(重点|摘录|原文|金句|关键观点)/i;

function clean(value) {
  return String(value || "").trim();
}

function pushLine(target, line) {
  const value = clean(line);
  if (value) target.push(value);
}

export function extractNotes(raw) {
  const text = clean(raw);
  const result = {
    raw: text,
    thoughts: "",
    highlights: "",
    questions: "",
    actions: "",
  };
  if (!text) return result;

  const buckets = {
    thoughts: [],
    highlights: [],
    questions: [],
    actions: [],
  };
  let activeField = null;

  for (const originalLine of text.split(/\r?\n/)) {
    const line = clean(originalLine);
    if (!line) {
      activeField = null;
      continue;
    }

    const section = SECTION_RULES.find((rule) => rule.pattern.test(line));
    if (section) {
      activeField = section.field;
      const content = line.replace(section.pattern, "");
      if (content) pushLine(buckets[activeField], content);
      continue;
    }

    if (activeField) {
      pushLine(buckets[activeField], line);
      continue;
    }

    if (QUESTION_CUE.test(line)) {
      pushLine(buckets.questions, line);
    } else if (ACTION_CUE.test(line)) {
      pushLine(buckets.actions, line);
    } else if (HIGHLIGHT_CUE.test(line)) {
      pushLine(buckets.highlights, line);
    } else {
      pushLine(buckets.thoughts, line);
    }
  }

  if (!Object.values(buckets).some((lines) => lines.length)) {
    buckets.thoughts.push(text);
  }

  for (const field of Object.keys(buckets)) {
    result[field] = buckets[field].join("\n");
  }
  return result;
}

export function displayRawNotes(notes = {}) {
  if (notes.raw) return notes.raw;
  const legacy = [
    ["我的想法", notes.thoughts],
    ["重点摘录", notes.highlights],
    ["疑问", notes.questions],
    ["下一步行动", notes.actions],
  ]
    .filter(([, value]) => clean(value))
    .map(([label, value]) => label + "：\n" + clean(value))
    .join("\n\n");
  return legacy;
}
