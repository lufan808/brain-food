// categories.js — lightweight, local-first article categorisation.
// The first pass uses the title and URL so classification works without
// sending article content anywhere. The side panel can always override it.

export const CATEGORY_OPTIONS = [
  "技术与工具",
  "营销与业务",
  "学习与研究",
  "行业与趋势",
  "生活与灵感",
  "其他",
];

const RULES = [
  {
    category: "技术与工具",
    words: [
      "github",
      "developer",
      "api",
      "npm",
      "stackoverflow",
      "代码",
      "编程",
      "开发",
      "软件",
      "工具",
      "技术",
      "ai",
      "人工智能",
      "自动化",
    ],
  },
  {
    category: "营销与业务",
    words: [
      "marketing",
      "growth",
      "sales",
      "brand",
      "广告",
      "营销",
      "增长",
      "品牌",
      "销售",
      "商业",
      "创业",
      "运营",
    ],
  },
  {
    category: "学习与研究",
    words: [
      "research",
      "paper",
      "study",
      "course",
      "tutorial",
      "教程",
      "课程",
      "研究",
      "论文",
      "学习",
      "方法论",
    ],
  },
  {
    category: "行业与趋势",
    words: [
      "news",
      "trend",
      "report",
      "industry",
      "newsletter",
      "新闻",
      "趋势",
      "行业",
      "报告",
      "市场",
      "政策",
    ],
  },
  {
    category: "生活与灵感",
    words: [
      "design",
      "culture",
      "travel",
      "health",
      "生活",
      "设计",
      "文化",
      "旅行",
      "健康",
      "灵感",
      "创意",
    ],
  },
];

export function normalizeCategory(category) {
  return CATEGORY_OPTIONS.includes(category) ? category : "其他";
}

export function classifyArticle({ title = "", url = "", notes = "" } = {}) {
  const text = (title + " " + url + " " + notes).toLowerCase();
  const match = RULES.find((rule) => rule.words.some((word) => text.includes(word)));
  return match?.category || "其他";
}
