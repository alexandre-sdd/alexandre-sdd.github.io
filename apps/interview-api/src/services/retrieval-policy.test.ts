/**
 * Retrieval policy unit tests — pure functions only, no corpus, no I/O.
 *
 * Tests use minimal mock RetrievalMatch objects. Each test group maps to a
 * specific refinement scenario from docs/ai-lexandre-v2-prep.md Phase 2.
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { RetrievalMatch } from "@portfolio/interview-core";
import {
  buildRetrievalPolicy,
  refineEducationCoursework,
  refineEducationSchools,
  refineExperienceSpecific,
  refineOptimizationTechnical,
  refineRoleFit,
  refineWithExclusion
} from "./retrieval-policy.js";
import { planInterviewTurn } from "./intent-planner.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMatch(
  overrides: Partial<RetrievalMatch["chunk"]> & { score?: number }
): RetrievalMatch {
  const { score = 10, ...chunkFields } = overrides;
  return {
    chunk: {
      id: chunkFields.title ?? "test-id",
      sourceType: chunkFields.sourceType ?? "project",
      sourceId: chunkFields.sourceId ?? chunkFields.title ?? "test-source",
      projectId: chunkFields.projectId,
      title: chunkFields.title ?? "Test Source",
      section: chunkFields.section ?? "Summary",
      text: chunkFields.text ?? "Some evidence text.",
      citationLabel: chunkFields.title ?? "Test",
      publicUrl: "/test",
      keywords: chunkFields.keywords ?? [],
      roleTags: chunkFields.roleTags ?? [],
      evidenceStrength: chunkFields.evidenceStrength ?? "supporting"
    },
    score,
    reasons: ["test"]
  };
}

// ─── refineEducationSchools ───────────────────────────────────────────────────

test("refineEducationSchools: base records rank before coursework sections", () => {
  const coursework = makeMatch({ title: "Columbia", section: "Coursework - Machine Learning", sourceType: "education" });
  const base = makeMatch({ title: "Columbia", section: "Summary", sourceType: "education" });

  const result = refineEducationSchools([coursework, base]);

  assert.equal(result[0]?.chunk.section, "Summary");
  assert.ok(result[1]?.chunk.section.startsWith("Coursework -"));
});

test("refineEducationSchools: multiple base records all rank before coursework", () => {
  const cw1 = makeMatch({ title: "Columbia", section: "Coursework - Stats", sourceType: "education" });
  const cw2 = makeMatch({ title: "Centrale", section: "Coursework - Optimization", sourceType: "education" });
  const b1 = makeMatch({ title: "Columbia", section: "Summary", sourceType: "education" });
  const b2 = makeMatch({ title: "Centrale", section: "Education", sourceType: "education" });

  const result = refineEducationSchools([cw1, cw2, b1, b2]);

  // First two results should be base records
  assert.ok(!result[0]?.chunk.section.startsWith("Coursework -"), "first should be base");
  assert.ok(!result[1]?.chunk.section.startsWith("Coursework -"), "second should be base");
  assert.ok(result[2]?.chunk.section.startsWith("Coursework -"), "third should be coursework");
  assert.ok(result[3]?.chunk.section.startsWith("Coursework -"), "fourth should be coursework");
});

test("refineEducationSchools: no-op when all matches are base records", () => {
  const b1 = makeMatch({ title: "Columbia", section: "Summary", sourceType: "education" });
  const b2 = makeMatch({ title: "Centrale", section: "Education", sourceType: "education" });
  const result = refineEducationSchools([b1, b2]);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.chunk.title, "Columbia");
});

// ─── refineEducationCoursework ────────────────────────────────────────────────

test("refineEducationCoursework: coursework sections rank before base records", () => {
  const base = makeMatch({ title: "Columbia", section: "Summary", sourceType: "education" });
  const cw = makeMatch({ title: "Columbia", section: "Coursework - ML", sourceType: "education" });

  const result = refineEducationCoursework([base, cw], []);

  assert.ok(result[0]?.chunk.section.startsWith("Coursework -"), "coursework first");
  assert.equal(result[1]?.chunk.section, "Summary");
});

test("refineEducationCoursework: CentraleSupelec coursework ranks first when entity present", () => {
  const columbiaBase = makeMatch({ title: "Columbia University", section: "Summary", sourceType: "education" });
  const columbiaCw = makeMatch({ title: "Columbia University", section: "Coursework - ML", sourceType: "education" });
  const centraleCw = makeMatch({
    title: "CentraleSupelec",
    section: "Coursework - Optimization",
    sourceType: "education",
    sourceId: "CentraleSupelec:MEng"
  });

  const result = refineEducationCoursework([columbiaBase, columbiaCw, centraleCw], ["CentraleSupelec"]);

  // CentraleSupelec coursework should be first
  assert.match(result[0]?.chunk.title ?? "", /[Cc]entrale/);
  // Columbia coursework second
  assert.ok(result[1]?.chunk.section.startsWith("Coursework -"));
  // Base last
  assert.equal(result[2]?.chunk.section, "Summary");
});

test("refineEducationCoursework: no CentraleSupelec entity → regular coursework-first order", () => {
  const base = makeMatch({ title: "Columbia", section: "Summary", sourceType: "education" });
  const cw = makeMatch({ title: "Columbia", section: "Coursework - Stats", sourceType: "education" });

  const result = refineEducationCoursework([base, cw], []);

  assert.ok(result[0]?.chunk.section.startsWith("Coursework -"));
  assert.equal(result[1]?.chunk.section, "Summary");
});

// ─── refineExperienceSpecific ─────────────────────────────────────────────────

test("refineExperienceSpecific: CHANEL chunks rank before unrelated experience", () => {
  const sigma = makeMatch({ title: "SIGMA Group", sourceType: "experience" });
  const chanel = makeMatch({ title: "CHANEL Europe", sourceType: "experience", text: "CHANEL CRAFT analytics" });

  const result = refineExperienceSpecific([sigma, chanel], ["CHANEL"]);

  assert.ok(/chanel/i.test(result[0]?.chunk.title ?? ""), "CHANEL first");
  assert.ok(/sigma/i.test(result[1]?.chunk.title ?? ""), "SIGMA second");
});

test("refineExperienceSpecific: no entities → no reordering", () => {
  const m1 = makeMatch({ title: "SIGMA Group", sourceType: "experience" });
  const m2 = makeMatch({ title: "CHANEL Europe", sourceType: "experience" });

  const result = refineExperienceSpecific([m1, m2], []);

  assert.equal(result[0]?.chunk.title, "SIGMA Group");
  assert.equal(result[1]?.chunk.title, "CHANEL Europe");
});

// ─── refineRoleFit ────────────────────────────────────────────────────────────

test("refineRoleFit: experience first, then project/case-study, then education, then skills", () => {
  const skill = makeMatch({ title: "Skills", sourceType: "skills" });
  const edu = makeMatch({ title: "Columbia", sourceType: "education" });
  const proj = makeMatch({ title: "Tomorrow You", sourceType: "project" });
  const exp = makeMatch({ title: "CHANEL", sourceType: "experience" });

  const result = refineRoleFit([skill, edu, proj, exp]);

  assert.equal(result[0]?.chunk.sourceType, "experience");
  assert.equal(result[1]?.chunk.sourceType, "project");
  assert.equal(result[2]?.chunk.sourceType, "education");
  assert.equal(result[3]?.chunk.sourceType, "skills");
});

test("refineRoleFit: multiple experience entries all rank above any project", () => {
  const exp1 = makeMatch({ title: "CHANEL", sourceType: "experience" });
  const exp2 = makeMatch({ title: "SIGMA", sourceType: "experience" });
  const proj = makeMatch({ title: "Tomorrow You", sourceType: "project" });

  const result = refineRoleFit([proj, exp2, exp1]);

  assert.equal(result[0]?.chunk.sourceType, "experience");
  assert.equal(result[1]?.chunk.sourceType, "experience");
  assert.equal(result[2]?.chunk.sourceType, "project");
});

// ─── refineWithExclusion ──────────────────────────────────────────────────────

test("refineWithExclusion: removes matches whose title appears in excludeTitles", () => {
  const chanel = makeMatch({ title: "CHANEL Europe", sourceType: "experience" });
  const sigma = makeMatch({ title: "SIGMA Group", sourceType: "experience" });

  const result = refineWithExclusion([chanel, sigma], ["CHANEL Europe"]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.chunk.title, "SIGMA Group");
});

test("refineWithExclusion: falls back to all matches when exclusion would leave empty set", () => {
  const chanel = makeMatch({ title: "CHANEL Europe", sourceType: "experience" });

  const result = refineWithExclusion([chanel], ["CHANEL Europe"]);

  assert.equal(result.length, 1, "fallback preserves all matches");
});

test("refineWithExclusion: no-op with empty excludeTitles", () => {
  const m = makeMatch({ title: "Tomorrow You", sourceType: "project" });
  const result = refineWithExclusion([m], []);
  assert.equal(result.length, 1);
});

test("refineWithExclusion: uses partial/substring title matching", () => {
  // The stored title might be longer than what compact memory parsed
  const nantes = makeMatch({
    title: "Data & Operations Consultant at Nantes University Hospital",
    sourceType: "experience"
  });
  const sigma = makeMatch({ title: "SIGMA Group", sourceType: "experience" });

  // Compact memory might store a shorter version
  const result = refineWithExclusion([nantes, sigma], ["Nantes University Hospital"]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.chunk.title, "SIGMA Group");
});

// ─── refineOptimizationTechnical ─────────────────────────────────────────────

test("refineOptimizationTechnical: moves work/project to front and excludes primary recent source", () => {
  const nantes = makeMatch({ title: "Nantes University Hospital", sourceType: "experience", score: 60 });
  const childcare = makeMatch({ title: "Childcare Deserts NYC", sourceType: "case-study", score: 40 });
  const columbia = makeMatch({ title: "Columbia", sourceType: "education", score: 30 });

  const result = refineOptimizationTechnical([nantes, childcare, columbia], ["Nantes University Hospital"]);

  // Fresh work/project (Childcare) leads; Nantes (recently cited) is moved to remainder.
  // Remainder preserves original match order: [Nantes, Columbia].
  assert.equal(result[0]?.chunk.title, "Childcare Deserts NYC");
  assert.equal(result[1]?.chunk.title, "Nantes University Hospital");
  assert.equal(result[2]?.chunk.title, "Columbia");
});

test("refineOptimizationTechnical: no-op when no recent titles", () => {
  const m = makeMatch({ title: "Childcare Deserts NYC", sourceType: "case-study" });
  const result = refineOptimizationTechnical([m], []);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.chunk.title, "Childcare Deserts NYC");
});

test("refineOptimizationTechnical: falls back to original when all work matches are the recent one", () => {
  const nantes = makeMatch({ title: "Nantes University Hospital", sourceType: "experience" });
  const edu = makeMatch({ title: "Columbia", sourceType: "education" });
  // Both work matches are excluded; fall back to original order
  const result = refineOptimizationTechnical([nantes, edu], ["Nantes University Hospital"]);
  // edu is the only fresh work match... but it's education not work/project
  // → workAndProject is empty → falls back to original
  assert.equal(result[0]?.chunk.title, "Nantes University Hospital");
});

// ─── buildRetrievalPolicy integration ────────────────────────────────────────

test("buildRetrievalPolicy: education-schools topK = baseTopK, sourceTypes=['education']", () => {
  const plan = planInterviewTurn({ question: "what schools did you go to" });
  const policy = buildRetrievalPolicy(plan, 6, "what schools did you go to");

  assert.equal(policy.retrievalOptions.topK, 6);
  assert.deepEqual(policy.retrievalOptions.sourceTypes, ["education"]);
});

test("buildRetrievalPolicy: education-schools refine puts base before coursework", () => {
  const plan = planInterviewTurn({ question: "what schools did you go to" });
  const policy = buildRetrievalPolicy(plan, 6, "what schools did you go to");

  const cw = makeMatch({ section: "Coursework - ML", sourceType: "education" });
  const base = makeMatch({ section: "Summary", sourceType: "education" });
  const result = policy.refine([cw, base]);

  assert.equal(result[0]?.chunk.section, "Summary");
});

test("buildRetrievalPolicy: experience-list topK >= 10, sourceTypes exclude education", () => {
  const plan = planInterviewTurn({ question: "do you have any work or internship experience" });
  const policy = buildRetrievalPolicy(plan, 6, "do you have any work or internship experience");

  assert.ok((policy.retrievalOptions.topK ?? 0) >= 10);
  assert.ok(!(policy.retrievalOptions.sourceTypes ?? []).includes("education"));
});

test("buildRetrievalPolicy: healthcare question clears sourceTypes restriction", () => {
  const plan = planInterviewTurn({ question: "Have you built projects in the medical field?" });
  const policy = buildRetrievalPolicy(plan, 6, "Have you built projects in the medical field?");

  assert.equal(policy.retrievalOptions.maxPerSource, 1, "healthcare forces maxPerSource=1");
});

test("buildRetrievalPolicy: inventory topK >= 14", () => {
  const plan = planInterviewTurn({ question: "Give me an overview of all my projects." });
  const policy = buildRetrievalPolicy(plan, 6, "Give me an overview of all my projects.");

  assert.ok((policy.retrievalOptions.topK ?? 0) >= 14);
});

test("buildRetrievalPolicy: role-fit topK >= 16", () => {
  const plan = planInterviewTurn({ question: "could you do something outside AI engineering?" });
  const policy = buildRetrievalPolicy(plan, 6, "could you do something outside AI engineering?");

  assert.ok((policy.retrievalOptions.topK ?? 0) >= 16);
});

test("buildRetrievalPolicy: role-fit refine puts experience before projects", () => {
  const plan = planInterviewTurn({ question: "could you do something outside AI engineering?" });
  const policy = buildRetrievalPolicy(plan, 6, "could you do something outside AI engineering?");

  const proj = makeMatch({ title: "Tomorrow You", sourceType: "project" });
  const exp = makeMatch({ title: "CHANEL", sourceType: "experience" });
  const result = policy.refine([proj, exp]);

  assert.equal(result[0]?.chunk.sourceType, "experience");
  assert.equal(result[1]?.chunk.sourceType, "project");
});

test("buildRetrievalPolicy: technical-depth + optimization applies freshness filter", () => {
  const memory = "Recent sources in order: 1. Nantes University Hospital. Earlier interviewer topics: quant.";
  const plan = planInterviewTurn({
    question: "Can you tell me about optimization?",
    compactMemory: memory
  });
  const policy = buildRetrievalPolicy(plan, 6, "Can you tell me about optimization?");

  const nantes = makeMatch({ title: "Nantes University Hospital", sourceType: "experience", score: 60 });
  const childcare = makeMatch({ title: "Childcare Deserts NYC", sourceType: "case-study", score: 40 });
  const result = policy.refine([nantes, childcare]);

  // Childcare (fresh work) should rank before Nantes (most recently mentioned)
  assert.equal(result[0]?.chunk.title, "Childcare Deserts NYC");
});

test("buildRetrievalPolicy: CHANEL experience-specific ranks CHANEL chunks first", () => {
  const plan = planInterviewTurn({ question: "when were you at CHANEL?" });
  const policy = buildRetrievalPolicy(plan, 6, "when were you at CHANEL?");

  const sigma = makeMatch({ title: "SIGMA Group", sourceType: "experience", score: 50 });
  const chanel = makeMatch({
    title: "CHANEL Europe",
    sourceType: "experience",
    score: 30,
    text: "CHANEL CRAFT analytics pipeline"
  });
  const result = policy.refine([sigma, chanel]);

  assert.ok(/chanel/i.test(result[0]?.chunk.title ?? ""), "CHANEL should rank first despite lower score");
});

test("buildRetrievalPolicy: 'any other project' excludes recent source from compact memory", () => {
  const memory = "Recent sources in order: 1. Tomorrow You. Earlier interviewer topics: AI projects.";
  const history = [{ role: "user" as const, content: "tell me about Tomorrow You" }];
  const plan = planInterviewTurn({
    question: "any other project you can talk to me about",
    history,
    compactMemory: memory
  });
  const policy = buildRetrievalPolicy(plan, 6, "any other project you can talk to me about");

  const tomorrow = makeMatch({ title: "Tomorrow You", sourceType: "project" });
  const codebase = makeMatch({ title: "Codebase Analyzer", sourceType: "project" });
  const result = policy.refine([tomorrow, codebase]);

  assert.equal(result[0]?.chunk.title, "Codebase Analyzer", "Tomorrow You should be excluded");
});
