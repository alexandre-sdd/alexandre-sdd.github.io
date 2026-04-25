import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("portfolio renders a work memory surface", () => {
  const html = read("index.html");
  const script = read("main.js");

  assert.match(html, /id="work-memory"/);
  assert.match(html, /id="work-memory-grid"/);
  assert.match(script, /renderWorkMemory/);
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
