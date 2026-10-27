import { test } from "node:test";
import assert from "node:assert/strict";
import { extractNotes } from "../src/lib/note-extractor.js";

test("free-form notes are kept and lightly structured by cue words", () => {
  const result = extractNotes(
    "这篇文章让我想到一个新的产品方向。\n重点：预约应该足够简单。\n问题：如何验证用户是否真的读完？\n下一步：先做一个小范围测试。"
  );
  assert.equal(result.thoughts, "这篇文章让我想到一个新的产品方向。");
  assert.equal(result.highlights, "预约应该足够简单。");
  assert.equal(result.questions, "如何验证用户是否真的读完？");
  assert.equal(result.actions, "先做一个小范围测试。");
});

test("plain notes are preserved as thoughts", () => {
  const result = extractNotes("我喜欢这篇文章的节奏，也想把它分享给团队。");
  assert.equal(result.raw, "我喜欢这篇文章的节奏，也想把它分享给团队。");
  assert.equal(result.thoughts, result.raw);
});
