/**
 * Planner unit tests — no corpus, no retrieval, no I/O.
 *
 * Each test group mirrors a scenario from the functional test matrix in
 * docs/ai-lexandre-v2-prep.md so failures point directly to the failing spec.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRetrievalQuery,
  classifyIntent,
  extractEntities,
  parseActiveTopic,
  parseRecentSourceTitles,
  planInterviewTurn
} from "./intent-planner.js";

// ─── Entity extraction ────────────────────────────────────────────────────────

test("extractEntities: detects Columbia by name", () => {
  const entities = extractEntities("What about Columbia and CentraleSupelec?");
  assert.ok(entities.includes("Columbia"), `Expected Columbia in ${entities}`);
});

test("extractEntities: detects CentraleSupelec by 'Centrale'", () => {
  const entities = extractEntities("What courses did you take at Centrale?");
  assert.ok(entities.includes("CentraleSupelec"), `Expected CentraleSupelec in ${entities}`);
});

test("extractEntities: detects CentraleSupelec by 'Supelec'", () => {
  const entities = extractEntities("tell me about your Supelec degree");
  assert.ok(entities.includes("CentraleSupelec"), `Expected CentraleSupelec in ${entities}`);
});

test("extractEntities: detects CHANEL by name", () => {
  const entities = extractEntities("when were you at Chanel?");
  assert.ok(entities.includes("CHANEL"), `Expected CHANEL in ${entities}`);
});

test("extractEntities: detects CHANEL by 'CRAFT'", () => {
  const entities = extractEntities("what did you do on the CRAFT project?");
  assert.ok(entities.includes("CHANEL"), `Expected CHANEL in ${entities}`);
});

test("extractEntities: detects SIGMA by 'SIGMA Group'", () => {
  const entities = extractEntities("what about SIGMA Group?");
  assert.ok(entities.includes("SIGMA"), `Expected SIGMA in ${entities}`);
});

test("extractEntities: detects SIGMA by 'Commercial Excellence'", () => {
  const entities = extractEntities("tell me about your Commercial Excellence role");
  assert.ok(entities.includes("SIGMA"), `Expected SIGMA in ${entities}`);
});

test("extractEntities: detects CUIMC by name", () => {
  const entities = extractEntities("what was your CUIMC work?");
  assert.ok(entities.includes("CUIMC"), `Expected CUIMC in ${entities}`);
});

test("extractEntities: detects Nantes by 'Nantes'", () => {
  const entities = extractEntities("the hospital in Nantes project");
  assert.ok(entities.includes("Nantes"), `Expected Nantes in ${entities}`);
});

test("extractEntities: detects Nantes by 'respiratory'", () => {
  const entities = extractEntities("did you work on respiratory data?");
  assert.ok(entities.includes("Nantes"), `Expected Nantes in ${entities}`);
});

test("extractEntities: handles accented Supélec spelling", () => {
  // Normalisation should strip the accent
  const entities = extractEntities("Supélec coursework");
  assert.ok(entities.includes("CentraleSupelec"), `Expected CentraleSupelec in ${entities}`);
});

test("extractEntities: returns empty array for unrelated question", () => {
  const entities = extractEntities("what projects have you built?");
  assert.deepEqual(entities, []);
});

test("extractEntities: looks back into history for entity context", () => {
  const history = [
    { role: "user" as const, content: "tell me about your work at CHANEL" },
    { role: "assistant" as const, content: "I worked on the CRAFT analytics pipeline..." }
  ];
  // Current question doesn't mention CHANEL but history does
  const entities = extractEntities("how long were you there?", history);
  assert.ok(entities.includes("CHANEL"), `Expected CHANEL in ${entities}`);
});

// ─── Intent classification — education ───────────────────────────────────────

test("classifyIntent: school list question → education-schools", () => {
  const intent = classifyIntent("what schools did you go to", [], [], "");
  assert.equal(intent, "education-schools");
});

test("classifyIntent: school entity without keywords → education-schools", () => {
  // 'What about Columbia and CentraleSupelec?' has no explicit school keywords
  const entities = extractEntities("What about Columbia and CentraleSupelec?");
  const intent = classifyIntent("What about Columbia and CentraleSupelec?", entities, [], "");
  assert.equal(intent, "education-schools");
});

test("classifyIntent: coursework question → education-coursework", () => {
  const intent = classifyIntent("what courses have you taken?", [], [], "");
  assert.equal(intent, "education-coursework");
});

test("classifyIntent: classes question with university keyword → education-coursework (not education-schools)", () => {
  // Coursework check fires before school-keyword routing, so "university" does
  // not override the more specific "classes" signal.
  const intent = classifyIntent("what classes did you take at university?", [], [], "");
  assert.equal(intent, "education-coursework");
});

test("classifyIntent: CentraleSupelec coursework follow-up → education-coursework (not education-schools)", () => {
  // CentraleSupelec is a school entity, but the question explicitly asks for
  // coursework → coursework check fires first.
  const entities = extractEntities("what about your Centrale coursework?");
  const intent = classifyIntent("what about your Centrale coursework?", entities, [], "");
  assert.equal(intent, "education-coursework");
});

// ─── Intent classification — experience ──────────────────────────────────────

test("classifyIntent: work list question → experience-list", () => {
  const intent = classifyIntent("do you have any work or internship experience", [], [], "");
  assert.equal(intent, "experience-list");
});

test("classifyIntent: internship question → experience-list", () => {
  const intent = classifyIntent("what internships have you done?", [], [], "");
  assert.equal(intent, "experience-list");
});

test("classifyIntent: CHANEL entity → experience-specific", () => {
  const entities = extractEntities("when were you at chanel?");
  const intent = classifyIntent("when were you at chanel?", entities, [], "");
  assert.equal(intent, "experience-specific");
});

test("classifyIntent: SIGMA entity → experience-specific", () => {
  const entities = extractEntities("what about sigma group?");
  const intent = classifyIntent("what about sigma group?", entities, [], "");
  assert.equal(intent, "experience-specific");
});

test("classifyIntent: Nantes entity → experience-specific", () => {
  const entities = extractEntities("did you work in a hospital or medical setting?");
  // "respiratory" keyword in the question won't match but "hospital" alone won't either
  // We test Nantes via the medical/hospital question path
  const healthEntities = extractEntities("your work in Nantes?");
  const intent = classifyIntent("your work in Nantes?", healthEntities, [], "");
  assert.equal(intent, "experience-specific");
});

test("classifyIntent: 'other experiences' with history → experience-list", () => {
  const history = [{ role: "user" as const, content: "tell me about CHANEL" }];
  const intent = classifyIntent("what other experiences do you have?", [], history, "");
  assert.equal(intent, "experience-list");
});

// ─── Intent classification — projects ────────────────────────────────────────

test("classifyIntent: project inventory → project-list", () => {
  const intent = classifyIntent("what projects have you built?", [], [], "");
  assert.equal(intent, "project-list");
});

test("classifyIntent: specific project → project-specific", () => {
  // Question must contain a project keyword for the planner to detect it.
  // "tell me about X" without project keywords falls to general in Phase 1;
  // project name entity extraction is a Phase 2 improvement.
  const intent = classifyIntent("walk me through the Codebase Analyzer project", [], [], "");
  assert.equal(intent, "project-specific");
});

// ─── Intent classification — follow-up / continuations ───────────────────────

test("classifyIntent: bare 'what else' → follow-up", () => {
  const history = [{ role: "user" as const, content: "any work experience?" }];
  const intent = classifyIntent("what else", [], history, "");
  assert.equal(intent, "follow-up");
});

test("classifyIntent: 'anything else?' → follow-up", () => {
  const history = [{ role: "user" as const, content: "tell me about CHANEL" }];
  const intent = classifyIntent("anything else?", [], history, "");
  assert.equal(intent, "follow-up");
});

// ─── Intent classification — other intents ───────────────────────────────────

test("classifyIntent: role-fit question → role-fit", () => {
  const intent = classifyIntent("could you do something outside AI engineering?", [], [], "");
  assert.equal(intent, "role-fit");
});

test("classifyIntent: technical depth question → technical-depth", () => {
  const intent = classifyIntent("walk me through the architecture of Tomorrow You", [], [], "");
  assert.equal(intent, "technical-depth");
});

test("classifyIntent: behavioral question → behavioral", () => {
  const intent = classifyIntent("tell me about a time you faced ambiguity", [], [], "");
  assert.equal(intent, "behavioral");
});

// ─── planInterviewTurn: sourceTypes routing ───────────────────────────────────

test("plan: school question restricts sourceTypes to education only", () => {
  const plan = planInterviewTurn({ question: "what schools did you go to" });
  assert.deepEqual(plan.sourceTypes, ["education"]);
});

test("plan: school entity question restricts sourceTypes to education only", () => {
  const plan = planInterviewTurn({ question: "What about Columbia and CentraleSupelec?" });
  assert.deepEqual(plan.sourceTypes, ["education"]);
  assert.ok(plan.entities.includes("Columbia"));
  assert.ok(plan.entities.includes("CentraleSupelec"));
});

test("plan: work/internship question excludes education from primary sourceTypes", () => {
  const plan = planInterviewTurn({ question: "do you have any work or internship experience" });
  assert.ok(!plan.sourceTypes.includes("education"), "education should not be in sourceTypes for experience-list");
  assert.ok(plan.sourceTypes.includes("experience"));
});

test("plan: CHANEL question routes to experience source types", () => {
  const plan = planInterviewTurn({ question: "when were you at chanel?" });
  assert.ok(plan.sourceTypes.includes("experience"));
  assert.ok(!plan.sourceTypes.includes("education"), "education should not appear for CHANEL question");
  assert.equal(plan.intent, "experience-specific");
  assert.ok(plan.entities.includes("CHANEL"));
});

test("plan: SIGMA question routes to experience source types", () => {
  const plan = planInterviewTurn({ question: "what about sigma?" });
  assert.ok(plan.sourceTypes.includes("experience"));
  assert.equal(plan.intent, "experience-specific");
});

test("plan: coursework question restricts to education", () => {
  const plan = planInterviewTurn({ question: "what courses have you taken?" });
  assert.deepEqual(plan.sourceTypes, ["education"]);
});

test("plan: project list exposes project and case-study only", () => {
  const plan = planInterviewTurn({ question: "what projects have you built?" });
  assert.ok(plan.sourceTypes.includes("project"));
  assert.ok(plan.sourceTypes.includes("case-study"));
  assert.ok(!plan.sourceTypes.includes("education"));
});

// ─── planInterviewTurn: topic derivation ──────────────────────────────────────

test("plan: education intent → topic = education", () => {
  const plan = planInterviewTurn({ question: "what schools did you go to" });
  assert.equal(plan.topic, "education");
});

test("plan: experience intent → topic = experience", () => {
  const plan = planInterviewTurn({ question: "tell me about your work history" });
  assert.equal(plan.topic, "experience");
});

test("plan: project intent → topic = projects", () => {
  const plan = planInterviewTurn({ question: "what projects have you built?" });
  assert.equal(plan.topic, "projects");
});

// ─── planInterviewTurn: excludeSources ────────────────────────────────────────

test("plan: 'what else' is a vague continuation — does not exclude recent sources", () => {
  // "what else" inherits active topic but does NOT explicitly ask for a
  // different source. Only "other/another/different" triggers exclusion.
  const history = [{ role: "user" as const, content: "tell me about your work" }];
  const memory = "Recent sources in order: 1. CHANEL Europe; 2. SIGMA Group. Earlier interviewer topics: work experience.";
  const plan = planInterviewTurn({
    question: "what else",
    history,
    compactMemory: memory
  });
  assert.equal(plan.intent, "follow-up");
  assert.deepEqual(plan.excludeSources, []);
});

test("plan: 'what other experiences' with memory excludes recent source", () => {
  const history = [{ role: "user" as const, content: "tell me about CHANEL" }];
  const memory = "Recent sources in order: 1. CHANEL Europe. Earlier interviewer topics: work experience.";
  const plan = planInterviewTurn({
    question: "what other experiences do you have?",
    history,
    compactMemory: memory
  });
  assert.equal(plan.intent, "experience-list");
  assert.ok(
    plan.excludeSources.some((s) => s.toLowerCase().includes("chanel")),
    `Expected CHANEL in excludeSources, got: ${plan.excludeSources}`
  );
});

test("plan: no excludeSources when compact memory is empty", () => {
  const plan = planInterviewTurn({ question: "what other projects do you have?" });
  assert.deepEqual(plan.excludeSources, []);
});

// ─── parseActiveTopic ────────────────────────────────────────────────────────

test("parseActiveTopic: experience keywords → experience", () => {
  const topic = parseActiveTopic("Recent sources in order: 1. CHANEL Europe. Earlier interviewer topics: work experience.");
  assert.equal(topic, "experience");
});

test("parseActiveTopic: education keywords → education", () => {
  const topic = parseActiveTopic("Recent sources in order: 1. Columbia MSBA. Earlier interviewer topics: coursework at Columbia.");
  assert.equal(topic, "education");
});

test("parseActiveTopic: project keywords → projects", () => {
  const topic = parseActiveTopic("Recent sources in order: 1. Tomorrow You. Earlier interviewer topics: AI project.");
  assert.equal(topic, "projects");
});

test("parseActiveTopic: empty memory → general", () => {
  const topic = parseActiveTopic("");
  assert.equal(topic, "general");
});

// ─── parseRecentSourceTitles ─────────────────────────────────────────────────

test("parseRecentSourceTitles: extracts ordered titles", () => {
  const memory = "Recent sources in order: 1. CHANEL Europe; 2. SIGMA Group. Earlier interviewer topics: work.";
  const titles = parseRecentSourceTitles(memory);
  assert.ok(titles.includes("CHANEL Europe"), `Got: ${titles}`);
  assert.ok(titles.includes("SIGMA Group"), `Got: ${titles}`);
});

test("parseRecentSourceTitles: returns empty array for empty memory", () => {
  assert.deepEqual(parseRecentSourceTitles(""), []);
});

// ─── buildRetrievalQuery ──────────────────────────────────────────────────────

test("buildRetrievalQuery: education-schools includes school keywords", () => {
  const query = buildRetrievalQuery("What about Columbia?", "education-schools", ["Columbia"], [], "");
  assert.match(query, /school|education|university/i);
  assert.match(query, /Columbia/i);
});

test("buildRetrievalQuery: education-coursework includes coursework keywords", () => {
  const query = buildRetrievalQuery("what courses?", "education-coursework", [], [], "");
  assert.match(query, /coursework|classes|education/i);
});

test("buildRetrievalQuery: experience-specific includes entity hints and 'dates'", () => {
  const query = buildRetrievalQuery("when were you at CHANEL?", "experience-specific", ["CHANEL"], [], "");
  assert.match(query, /chanel|craft/i);
  assert.match(query, /dates?/i);
});

test("buildRetrievalQuery: follow-up with experience memory includes experience hint", () => {
  const memory = "Recent sources in order: 1. CHANEL Europe. Earlier interviewer topics: work experience.";
  const history = [{ role: "user" as const, content: "any work?" }];
  const query = buildRetrievalQuery("what else?", "follow-up", [], history, memory);
  assert.match(query, /experience|internship|work/i);
});

// ─── Answer policy ────────────────────────────────────────────────────────────

test("plan: education-schools policy does not allow project support", () => {
  const plan = planInterviewTurn({ question: "what schools did you go to" });
  assert.equal(plan.answerPolicy.allowProjectSupport, false);
  assert.equal(plan.answerPolicy.preferDirectAnswer, true);
});

test("plan: experience-list policy does not allow coursework as primary", () => {
  const plan = planInterviewTurn({ question: "do you have work experience?" });
  assert.equal(plan.answerPolicy.allowCourseworkSupport, false);
});

test("plan: role-fit policy allows both coursework and project support", () => {
  const plan = planInterviewTurn({ question: "could you do something outside AI engineering?" });
  assert.equal(plan.answerPolicy.allowCourseworkSupport, true);
  assert.equal(plan.answerPolicy.allowProjectSupport, true);
});
