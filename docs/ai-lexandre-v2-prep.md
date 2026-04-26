# AI-lexandre V2 Prep

## Goal

V2 should make AI-lexandre behave less like a clever prompt wrapper and more like a structured interview system over portfolio evidence.

The target is not "add a vector database." The target is:

- classify the interviewer intent before retrieval
- extract named entities like Columbia, CentraleSupelec, CHANEL, SIGMA, CUIMC, Nantes, and project names
- restrict retrieval by source type when the question clearly asks for schools, courses, work experience, projects, or fit
- preserve conversational context without letting previous sources pollute the next answer
- make source chips match both the answer and the intent
- keep the response natural enough for an interview

## Why V2 Is Needed

Recent failures show that the current system can retrieve good evidence, but it does not always plan the answer correctly.

Examples:

- "what schools did you go to" retrieved projects instead of education.
- "What about Columbia and CentraleSupelec?" failed to confirm schools even though both are in `content.json`.
- "do you have any work or internship experience" returned education chips alongside work evidence.
- "what else" and "what other experiences" reused the wrong context because the system did not track the active topic.
- "when were you at chanel?" could answer the work, but not the dates, because date evidence is not strongly represented in the retrieval contract.

These are not primarily model-quality problems. They are planning, routing, and source-control problems.

## Current Architecture Assessment

The current architecture is still reasonable:

- Static GitHub Pages frontend.
- Fastify API on Railway.
- `content.json` as the source of truth.
- Generated local corpus.
- Lexical retrieval with role and domain boosts.
- OpenAI generation with deterministic fallback.
- API-side source filtering and follow-up generation.

The system-level architecture is not too complex. The drift risk is inside `apps/interview-api/src/services/interview-service.ts`, where fixes have accumulated as intent-specific branches. That is acceptable for a v1, but v2 should move those branches into an explicit planner and policy layer.

## V2 Principle

Use structured retrieval first, semantic retrieval second.

For this corpus, many questions have obvious source-type constraints:

- school questions should search education
- coursework questions should search education coursework
- work and internship questions should search experience
- project questions should search projects and case studies
- "what else" should stay within the active topic and exclude sources already used

Embeddings can help later for vague topic matching, but embeddings will not fix a planner that allows a school question to retrieve LinkedIn Note Copilot.

## Target Request Pipeline

```text
question + recent history + compact memory
  -> answer planner
  -> structured retrieval policy
  -> retrieval
  -> evidence selector
  -> answer generation
  -> source-chip filter
  -> functional eval checks
```

## Proposed Modules

### `intent-planner.ts`

Owns the first decision about what the user is asking.

Inputs:

- current question
- last 6-8 chat messages
- compact memory summary
- selected role preset

Outputs:

- `intent`
- `sourceTypes`
- `entities`
- `topic`
- `excludeSources`
- `retrievalQuery`
- `answerPolicy`

Example shape:

```ts
type InterviewIntent =
  | "education-schools"
  | "education-coursework"
  | "experience-list"
  | "experience-specific"
  | "project-list"
  | "project-specific"
  | "role-fit"
  | "technical-depth"
  | "behavioral"
  | "follow-up";

type SourceType = "project" | "case-study" | "experience" | "education" | "skills" | "overview";

interface PlannedInterviewTurn {
  intent: InterviewIntent;
  sourceTypes: SourceType[];
  entities: string[];
  topic: "education" | "experience" | "projects" | "fit" | "technical" | "general";
  excludeSources: string[];
  retrievalQuery: string;
  answerPolicy: {
    preferDirectAnswer: boolean;
    allowCourseworkSupport: boolean;
    allowProjectSupport: boolean;
    maxPrimarySources: number;
  };
}
```

### `entity-aliases.ts`

Centralizes aliases instead of scattering them across retrieval and service logic.

Initial aliases:

- Columbia: `Columbia`, `Columbia University`, `MSBA`, `Business Analytics`
- CentraleSupelec: `Centrale`, `CentraleSupelec`, `Centrale Supelec`, `Supelec`, `CS`
- CHANEL: `Chanel`, `CHANEL`, `CRAFT`, `Advanced Analytics`
- SIGMA: `Sigma`, `SIGMA Group`, `Commercial Excellence`
- CUIMC: `CUIMC`, `Columbia Medical`, `Columbia University Irving Medical Center`
- Nantes: `Nantes`, `Nantes University Hospital`, `hospital in Nantes`, `respiratory`

### `retrieval-policy.ts`

Turns the planner output into retrieval options.

Examples:

- `education-schools`: sourceTypes = `["education"]`, sections = base education records
- `education-coursework`: sourceTypes = `["education"]`, prefer sections starting with `Coursework -`
- `experience-list`: sourceTypes = `["experience"]`, diversify by experience
- `experience-specific` with entity CHANEL: sourceTypes = `["experience", "case-study"]`, entity filter CHANEL
- `project-list`: sourceTypes = `["project", "case-study"]`, diversify by title
- vague follow-up: inherit `topic` from compact memory

### `memory-state.ts`

The client already sends recent history plus a compact summary. V2 should make that summary more structured.

Current summary:

```text
Recent sources in order: 1. Tomorrow You; 2. Codebase Analyzer.
Earlier interviewer topics: ...
```

V2 summary:

```json
{
  "activeTopic": "experience",
  "recentSources": [
    { "title": "CHANEL Europe", "sourceType": "experience" },
    { "title": "SIGMA Group", "sourceType": "experience" }
  ],
  "askedEntities": ["CHANEL", "SIGMA"],
  "lastIntent": "experience-specific"
}
```

This does not need a database. It can remain client-side for v2.

### `answer-policy.ts`

Keeps style rules separate from retrieval mechanics.

Examples:

- Education question: answer school/course directly first; do not mention projects unless asked for application.
- Experience question: list work experiences first; do not cite education as a primary source.
- "What else?": continue the same topic and exclude sources already used.
- Role-fit question: use work/projects first and coursework second.
- Unknown evidence: say what is missing, but only after checking structured entities and source types.

## Data Model Prep

### Add Dates As First-Class Evidence

Problem: "when were you at chanel?" should answer dates directly.

Tasks:

- Ensure every `experience` has exact or approximate date fields.
- Add `dates` to experience corpus chunks.
- Add date-focused chunks or keywords for experiences.
- Add tests for CHANEL, SIGMA, Nantes, and CUIMC dates.

### Add Experience Type

Add a normalized field:

```json
{
  "experienceType": "internship | consulting | research | analytics | operations"
}
```

Use this for prompts like:

- internships
- analytics team
- research experience
- other work experience

### Add Entity Aliases To Content Or Core

Either:

- add `aliases` directly to each content record, or
- keep aliases in `packages/interview-core/src/entity-aliases.ts`

Prefer content-level aliases for portfolio facts and code-level aliases for generic spelling variants.

### Add Source Priority By Intent

For each source type, define whether it can be primary or supporting by intent.

Example:

| Intent | Primary source types | Supporting source types |
| --- | --- | --- |
| school list | education | none |
| coursework | education | project, experience |
| internship list | experience | case-study |
| project overview | project, case-study | skills |
| role fit | experience, project, case-study | education, skills |

## Detailed TODO List

### Phase 0: Freeze Current Behavior

- [ ] Keep the functional scenario test set in `apps/interview-api/src/app.test.ts`.
- [ ] Add the failing examples from the school/experience transcript as regression tests.
- [ ] Add tests for source-chip source types, not only answer text.
- [ ] Add a test that "what schools did you go to" retrieves only education.
- [ ] Add a test that "What about Columbia and CentraleSupelec?" confirms both schools.
- [ ] Add a test that "do you have any work or internship experience" retrieves only experience/case-study as primary evidence.
- [ ] Add a test that "what else" after experience stays inside experience.
- [ ] Add a test that "what other experiences" excludes the last mentioned experience.
- [ ] Add a test that "when were you at chanel?" answers date evidence directly.

### Phase 1: Planner Skeleton

- [ ] Create `apps/interview-api/src/services/intent-planner.ts`.
- [ ] Move intent helper functions out of `interview-service.ts`.
- [ ] Define `PlannedInterviewTurn`.
- [ ] Add planner tests independent of retrieval.
- [ ] Implement entity extraction for Columbia, CentraleSupelec, CHANEL, SIGMA, CUIMC, Nantes, and project titles.
- [ ] Implement topic inference from question and compact memory.
- [ ] Add `sourceTypes` to planner output.
- [ ] Add `excludeSources` to planner output.

### Phase 2: Structured Retrieval Policy

- [ ] Create `apps/interview-api/src/services/retrieval-policy.ts`.
- [ ] Let planner output filter allowed source types before evidence scoring.
- [ ] Support section filters for education base records vs coursework records.
- [ ] Support entity filters for named schools, companies, and projects.
- [ ] Preserve broad retrieval for inventory questions.
- [ ] Preserve healthcare-specific boosts, but route healthcare questions through policy instead of ad hoc branches.
- [ ] Add a result diversifier that works per source type and intent.

### Phase 3: Memory State

- [ ] Replace string-only compact memory with a structured memory object.
- [ ] Keep backward compatibility with the existing string summary during transition.
- [ ] Store `activeTopic`.
- [ ] Store `lastIntent`.
- [ ] Store `recentSources` with source type.
- [ ] Store `askedEntities`.
- [ ] Use active topic for vague prompts like "what else" and "anything else?"
- [ ] Use recent sources for exclusion when the interviewer asks "other" or "another."

### Phase 4: Answer Policy

- [ ] Create `apps/interview-api/src/services/answer-policy.ts`.
- [ ] Define answer rules by intent.
- [ ] Make education answers direct and short.
- [ ] Make experience answers list work first, then optionally explain lessons.
- [ ] Make role-fit answers work-first, coursework-second.
- [ ] Make follow-up answers avoid reintroducing project summaries.
- [ ] Add a "missing evidence" policy that only triggers after structured retrieval fails.
- [ ] Ensure follow-up chips match the active source type.

### Phase 5: Source Chips And Citations

- [ ] Filter chips by planned source type unless the final answer explicitly mentions a supporting source.
- [ ] For education answers, do not show project chips.
- [ ] For experience answers, do not show education chips unless coursework is explicitly part of the answer.
- [ ] For dates, show the exact experience citation.
- [ ] Add tests where the LLM answer mentions only one source but retrieval returns many.
- [ ] Add tests where the answer mentions CHANEL and SIGMA and source chips show both.

### Phase 6: Content Improvements

- [ ] Add exact dates or approximate date ranges to CHANEL, SIGMA, Nantes, CUIMC, and other experiences.
- [ ] Add aliases for each school, company, and project.
- [ ] Add `experienceType`.
- [ ] Add short `interviewFacts` per record for high-confidence factual answers.
- [ ] Add `sensitive` or `sanitized` flags where relevant.
- [ ] Add `canMention` notes for CHANEL and hospital-related work.
- [ ] Add source-backed evidence for Sigma and other non-featured experiences.

### Phase 7: Functional Evals

- [ ] Move scenario data out of `app.test.ts` into a fixture file if it grows.
- [ ] Add pass/fail criteria for each scenario.
- [ ] Track expected primary source titles.
- [ ] Track expected source types.
- [ ] Track forbidden source titles.
- [ ] Add live-model smoke tests manually before deployment.
- [ ] Add a short write-up update whenever a new scenario is added.

### Phase 8: Optional Hybrid Retrieval

Only after the planner is stable:

- [ ] Add embeddings for vague topic matching.
- [ ] Keep structured source-type filters before semantic search.
- [ ] Store embeddings in generated JSON first, not a managed vector DB.
- [ ] Compare lexical, structured, and hybrid retrieval on the eval set.
- [ ] Add vector DB only if generated local embeddings become too slow or large.

## Functional Test Matrix To Add First

| Scenario | Prompt | Expected |
| --- | --- | --- |
| School list | what schools did you go to | Columbia and CentraleSupelec from education evidence |
| School entity follow-up | What about Columbia and CentraleSupelec? | confirms both schools, no project fallback |
| Coursework | what courses have you taken? | education/coursework evidence from both schools |
| Work list | do you have any work or internship experience | experience evidence, not education primary |
| Experience continuation | what else | another experience, same topic |
| More experiences | what other experiences | excludes recently cited experience |
| CHANEL date | when were you at chanel? | date range or explicitly missing date from experience evidence |
| SIGMA | what about sigma | SIGMA experience |
| Analytics work | any analytics team or other work experience? | CHANEL, SIGMA, possibly case-study support |
| Healthcare | did you work in a hospital or medical setting? | Nantes and/or CUIMC direct evidence |
| Project inventory | what projects have you built? | all project/case-study sources |
| Role fit | could you do something outside AI engineering? | work/projects first, coursework support |

## Definition Of Done For V2

V2 is ready when:

- school and coursework questions never retrieve project evidence as primary support
- experience questions never retrieve education as primary support
- named entities route to the right source records
- vague follow-ups keep the active topic
- "other" and "another" exclude recently used sources
- source chips reflect answer intent and answer text
- deterministic scenario tests pass
- live OpenAI responses pass a manual smoke test with the same scenario list

## What Not To Do First

- Do not start by adding LangChain, LangGraph, or a vector DB.
- Do not add a database for chat sessions.
- Do not keep adding one-off regex branches to `interview-service.ts`.
- Do not let prompt instructions compensate for bad source selection.
- Do not make the public UI show implementation complexity.

## Suggested First PR

Scope:

- Add `intent-planner.ts`.
- Add entity aliases.
- Add planner tests for education, experience, projects, role fit, and follow-ups.
- Wire planner output into retrieval source-type filters.
- Add regression tests for the school and work-experience transcript.

Expected files:

- `apps/interview-api/src/services/intent-planner.ts`
- `apps/interview-api/src/services/retrieval-policy.ts`
- `apps/interview-api/src/services/interview-service.ts`
- `apps/interview-api/src/app.test.ts`
- `packages/interview-core/src/types.ts` if shared types are useful

Avoid:

- changing the UI
- changing OpenAI prompts beyond what the planner requires
- adding embeddings

