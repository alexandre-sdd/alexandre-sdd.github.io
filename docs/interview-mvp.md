# Interview Simulator MVP

## Product Goal

Build a recruiter-facing experience that lets a visitor interview Alexandre through grounded portfolio evidence instead of reading static cards.

The MVP is intentionally narrow:

- Static frontend hosted with the portfolio on GitHub Pages.
- Separate API service that can run locally or on Railway.
- Retrieval-grounded answers with visible citations.
- Deterministic fallback mode when no model key is configured.

## Why This MVP

This is stronger than a generic RAG bot because it demonstrates:

- evidence routing
- role-specific answer framing
- grounded answer generation
- inspectable retrieval traces
- a product UX that matches a real recruiting workflow

## Repo Layout

```text
apps/
  interview-api/        Railway-ready Fastify API
packages/
  interview-core/       Shared corpus builder, role presets, seeded questions, retrieval
docs/
  interview-mvp.md      Product and architecture spec
interview/
  index.html            Static simulator page
  app.js                Frontend logic
  styles.css            Frontend-specific styling
  config.js             API base URL config for local or Railway use
```

## User Flow

1. Visitor opens `/interview/`.
2. Visitor selects a role preset such as `AI Engineer` or `Optimization / Analytics`.
3. Visitor asks a recruiter-style question or starts from a seeded prompt.
4. Frontend sends the question and prior turn history to the API.
5. API retrieves the most relevant portfolio evidence.
6. API produces a grounded answer in `mock` or `openai` mode.
7. Frontend shows:
   - the answer
   - cited evidence
   - project routing
   - retrieval debug trace

## Architecture

### Frontend

- Plain HTML/CSS/JS to match the existing GitHub Pages site.
- Configurable API base URL stored in `localStorage`.
- Evidence panel on the right to make grounding explicit.

### Shared Core

- `content.json` remains the main source of truth.
- `packages/interview-core` converts portfolio content into a chunked interview corpus.
- The same package exports role presets, seeded recruiter questions, and retrieval logic.

### API

- Fastify server in `apps/interview-api`.
- `GET /v1/health` for runtime status.
- `GET /v1/config` for role presets, seeded questions, and corpus metadata.
- `GET /v1/evidence/search` for retrieval debugging.
- `POST /v1/interview/respond` for grounded answer generation.

## Retrieval Strategy

The MVP uses lightweight lexical retrieval with role-aware boosts rather than a vector database.

Why:

- corpus is small and curated
- zero external infra
- easier to inspect and debug
- faster to iterate while shaping the product

Boosting factors:

- title and section matches
- chunk keyword overlap
- role preset keyword overlap
- priority project matches
- project and case-study chunks over lower-signal profile chunks

## Answer Generation

### Mock Mode

When `MOCK_INTERVIEW_RESPONSES=true` or no `OPENAI_API_KEY` is set:

- retrieval still runs normally
- the API returns deterministic grounded answers
- local development and tests remain fully usable

### OpenAI Mode

When `MOCK_INTERVIEW_RESPONSES=false` and `OPENAI_API_KEY` is present:

- the API calls OpenAI through the Responses API
- evidence is passed explicitly in the prompt
- the model is asked for structured JSON:
  - answer
  - citation ids
  - project ids
  - follow-up suggestions
  - confidence

Default model:

- `gpt-5.4-mini`

Rationale:

- good fit for low-latency grounded answering
- cheaper than a frontier model for repeated recruiter queries
- strong enough for concise, evidence-bounded interview responses

## Agile Expansion Path

### Phase 1

- current grounded interviewer MVP
- role presets
- seeded questions
- evidence panel
- retrieval trace

### Phase 2

- better citation validation
- richer follow-up controls such as `push deeper`
- answer variants: concise vs technical
- analytics on top questions and clicked citations

### Phase 3

- embeddings or hybrid retrieval
- per-project answer templates
- interview session export
- eval set with pass/fail criteria

### Phase 4

- voice interview mode
- critic pass for unsupported claims
- recruiter-specific custom presets
- deeper project traces and architecture views

## Local Development

1. Install dependencies with `npm install`.
2. Build the generated corpus with `npm run build:corpus`.
3. Start the API with `npm run dev:api`.
4. Open `interview/index.html` through a static server or GitHub Pages preview.
5. Keep `interview/config.js` pointed at `http://127.0.0.1:8787`.

## Railway Deployment

Good fit because the frontend stays static and the API can be deployed separately.

Minimal service settings:

- root directory: repository root
- start command: `npm run build && npm run start --workspace @portfolio/interview-api`
- env vars from `apps/interview-api/.env.example`

For Railway, set `HOST=0.0.0.0`.

Then set `window.INTERVIEW_CONFIG.apiBaseUrl` in `interview/config.js` to the Railway URL.

## Risks and Intentional Omissions

- No vector DB yet.
- No PDF parsing yet.
- No LangGraph or multi-agent orchestration yet.
- No persisted chat sessions yet.

These are deliberate. The current architecture is optimized for a clean first real MVP, not maximum complexity.
