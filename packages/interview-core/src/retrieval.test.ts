import test from "node:test";
import assert from "node:assert/strict";

import { loadPortfolioContent } from "./corpus.js";
import { ROLE_PRESETS } from "./presets.js";
import { buildCorpusFromContent } from "./corpus.js";
import { retrieveEvidence } from "./retrieval.js";

test("buildCorpusFromContent creates a non-trivial chunk set", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  assert.ok(corpus.chunkCount >= 20);
  assert.equal(corpus.chunkCount, corpus.chunks.length);
});

test("AI engineering query retrieves Tomorrow You evidence near the top", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  const matches = retrieveEvidence(corpus, "Tell me about your best AI engineering project with agents and voice.", {
    roleId: "ai-engineer",
    topK: 5
  });

  assert.ok(matches.length > 0);
  assert.equal(matches[0]?.chunk.projectId, "tomorrow-you");
});

test("all role presets are backed by at least one priority project", () => {
  const content = loadPortfolioContent();
  const projectIds = new Set(content.projects.map((project) => project.id).concat(content.caseStudies.map((item) => item.id)));

  ROLE_PRESETS.forEach((preset) => {
    assert.ok(
      preset.priorityProjectIds.some((projectId) => projectIds.has(projectId)),
      `Preset ${preset.id} has no matching project ids in the corpus`
    );
  });
});
