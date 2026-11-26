import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("Work uses real evidence without repetitive result and learning scaffolding", () => {
  const html = read("work/index.html");
  assert.doesNotMatch(html, /id="work-memory"/);
  assert.doesNotMatch(html, /Learned:|Result:|placeholder\.svg|thumb\.svg/);
  assert.match(html, /Combination Outlier Detection/);
});

test("case studies render learning sections from content", () => {
  const caseScript = read("case-study.js");

  ["case-study-chanel.html", "case-study-forvia.html"].forEach((path) => {
    const html = read(path);
    assert.match(html, /id="case-learning-role"/);
    assert.match(html, /id="case-learning-decisions"/);
    assert.match(html, /id="case-learning-tradeoffs"/);
    assert.match(html, /id="case-learning-lessons"/);
  });

  assert.match(caseScript, /renderLearning/);
});

test("interview client sends compact memory instead of full chat history", () => {
  const script = read("interview/app.js");

  assert.match(script, /MAX_HISTORY_MESSAGES = 8/);
  assert.match(script, /buildConversationMemory/);
  assert.match(script, /conversationSummary/);
});

test("AI-lexandre system page retains architecture and the current functional test set", () => {
  const html = read("ai-lexandre-system.html");

  assert.match(html, /System Architecture/);
  assert.match(html, /Functional Test Set/);
  assert.match(html, /mock mode/);
  assert.match(html, /V2 Regression Suite/);
  assert.equal(html.match(/class="test-status test-pass"/g)?.length, 19);
});
