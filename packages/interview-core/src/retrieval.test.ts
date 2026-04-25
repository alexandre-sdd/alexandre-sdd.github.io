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

test("corpus includes every local portfolio source type used by the interviewer", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  content.projects.forEach((project) => {
    assert.ok(
      corpus.chunks.some((chunk) => chunk.sourceType === "project" && chunk.projectId === project.id),
      `Missing project corpus chunks for ${project.id}`
    );
  });

  content.caseStudies.forEach((caseStudy) => {
    assert.ok(
      corpus.chunks.some((chunk) => chunk.sourceType === "case-study" && chunk.projectId === caseStudy.id),
      `Missing case-study corpus chunks for ${caseStudy.id}`
    );
  });

  content.experience.forEach((experience) => {
    assert.ok(
      corpus.chunks.some(
        (chunk) =>
          chunk.sourceType === "experience" &&
          chunk.sourceId === `${experience.company}:${experience.role}`
      ),
      `Missing experience corpus chunks for ${experience.company}`
    );
  });
});

test("every work item has a learning profile with decisions or lessons", () => {
  const content = loadPortfolioContent();
  const workItems = [...content.projects, ...content.caseStudies, ...content.experience];

  workItems.forEach((item) => {
    assert.ok(item.learning, `Missing learning profile for ${"title" in item ? item.title : item.company}`);
    assert.ok(
      item.learning.decisions.length > 0 || item.learning.lessons.length > 0,
      `Learning profile needs at least one decision or lesson for ${"title" in item ? item.title : item.company}`
    );
    assert.ok(item.learning.role.length > 0);
    assert.ok(item.learning.evidenceNotes.length > 0);
  });
});

test("every project has source-backed repository knowledge", () => {
  const content = loadPortfolioContent();

  content.projects.forEach((project) => {
    assert.ok(project.sourceKnowledge?.length, `Missing source knowledge for ${project.id}`);
    project.sourceKnowledge.forEach((note) => {
      assert.ok(note.source.length > 0);
      assert.ok(note.url.length > 0);
      assert.ok(note.facts.length >= 3, `Expected at least three source facts for ${project.id}`);
    });
  });
});

test("corpus includes learning-specific chunks for every work item", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  content.projects.forEach((project) => {
    assert.ok(
      corpus.chunks.some((chunk) => chunk.id === `project:${project.id}:learning-lessons`),
      `Missing learning chunk for ${project.id}`
    );
  });

  content.caseStudies.forEach((caseStudy) => {
    assert.ok(
      corpus.chunks.some((chunk) => chunk.id === `case-study:${caseStudy.id}:learning-decisions`),
      `Missing case-study learning chunk for ${caseStudy.id}`
    );
  });

  content.experience.forEach((experience, index) => {
    assert.ok(
      corpus.chunks.some((chunk) => chunk.id === `experience:${index}:learning-role`),
      `Missing experience learning chunk for ${experience.company}`
    );
  });
});

test("corpus includes repository knowledge chunks for every project", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  content.projects.forEach((project) => {
    assert.ok(
      corpus.chunks.some((chunk) => chunk.id === `project:${project.id}:source-knowledge`),
      `Missing source knowledge chunk for ${project.id}`
    );
  });
});

test("each project and case-study title retrieves its own local evidence", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  [...content.projects, ...content.caseStudies].forEach((item) => {
    const matches = retrieveEvidence(corpus, item.title, {
      topK: 3
    });

    assert.ok(
      matches.some((match) => match.chunk.projectId === item.id),
      `Expected title query for ${item.id} to retrieve its own evidence`
    );
  });
});

test("learning questions retrieve learning chunks before generic summaries", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  const matches = retrieveEvidence(corpus, "What did you learn from Tomorrow You?", {
    roleId: "ai-engineer",
    topK: 3
  });

  assert.equal(matches[0]?.chunk.projectId, "tomorrow-you");
  assert.equal(matches[0]?.chunk.section, "Failures and lessons");
});

test("implementation-specific questions retrieve repository knowledge", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  const matches = retrieveEvidence(corpus, "How does Zeit store scheduler diagnostics and audit planning decisions?", {
    roleId: "optimization-analytics",
    topK: 4
  });

  assert.equal(matches[0]?.chunk.projectId, "zeit-project");
  assert.equal(matches[0]?.chunk.section, "Repository knowledge");
});

test("failure questions prefer failure and lesson evidence", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  const matches = retrieveEvidence(corpus, "Pick one failure mode you actually had to design around. What did you change?", {
    roleId: "ai-engineer",
    topK: 5
  });

  assert.ok(
    matches.slice(0, 3).some((match) => match.chunk.section === "Failures and lessons"),
    "Expected failure queries to retrieve failures and lessons evidence near the top"
  );
});

test("broad project inventory queries can retrieve every project and case study", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);
  const portfolioItems = [...content.projects, ...content.caseStudies];

  const matches = retrieveEvidence(corpus, "Give me an overview of all my projects.", {
    roleId: "ai-engineer",
    topK: portfolioItems.length + 3,
    maxPerSource: 1
  });
  const retrievedIds = new Set(matches.map((match) => match.chunk.projectId).filter(Boolean));

  portfolioItems.forEach((item) => {
    assert.ok(retrievedIds.has(item.id), `Expected broad project query to retrieve ${item.id}`);
  });
});

test("experience query retrieves CHANEL internship evidence", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  const matches = retrieveEvidence(corpus, "Tell me about your CHANEL internship and finance analytics experience.", {
    roleId: "ml-engineer",
    topK: 5
  });

  assert.ok(
    matches.some((match) => match.chunk.sourceType === "experience" && /CHANEL/i.test(match.chunk.title)),
    "Expected CHANEL experience to be retrievable"
  );
  assert.ok(
    matches.some((match) => match.chunk.projectId === "chanel-europe-analytics-pipeline"),
    "Expected CHANEL case-study evidence to be retrievable"
  );
});

test("work-history queries are not drowned out by project role boosts", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  const matches = retrieveEvidence(corpus, "Tell me about your internships and work experience.", {
    roleId: "ai-engineer",
    topK: 5
  });

  assert.equal(matches[0]?.chunk.sourceType, "experience");
  assert.ok(matches.some((match) => match.chunk.sourceType === "experience"));
});

test("medical field queries retrieve direct healthcare evidence before adjacent AI projects", () => {
  const content = loadPortfolioContent();
  const corpus = buildCorpusFromContent(content);

  const matches = retrieveEvidence(corpus, "Have you built projects in the medical field?", {
    roleId: "ai-engineer",
    topK: 6
  });
  const titles = matches.map((match) => match.chunk.title);

  assert.equal(matches[0]?.chunk.projectId, "appointment-scheduling-dynamics");
  assert.ok(titles.some((title) => /Nantes University Hospital/i.test(title)));
  assert.ok(titles.some((title) => /CUIMC|Appointment Scheduling/i.test(title)));
  assert.ok(
    matches.slice(0, 4).every((match) => /healthcare domain match/.test(match.reasons.join(" "))),
    "Expected direct healthcare evidence to outrank adjacent AI projects"
  );
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
