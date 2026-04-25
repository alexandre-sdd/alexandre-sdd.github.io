import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("portfolio renders learning snippets without a duplicate work memory section", () => {
  const html = read("index.html");
  const script = read("main.js");

  assert.doesNotMatch(html, /id="work-memory"/);
  assert.doesNotMatch(script, /renderWorkMemory/);
  assert.match(script, /learning-note/);
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

test("AI-lexandre system page documents architecture audit and functional tests", () => {
  const html = read("ai-lexandre-system.html");

  assert.match(html, /Architecture Audit/);
  assert.match(html, /Functional Test Set/);
  assert.match(html, /deterministic mock mode/);
  assert.equal(html.match(/class="test-status test-pass"/g)?.length, 12);
});
