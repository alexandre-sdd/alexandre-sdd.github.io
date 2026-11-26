# alexandre-sdd.github.io

Portfolio site hosted on GitHub Pages, with AI-lexandre as a static interview frontend and a separate API for grounded interview answers.

## Main Areas

- `index.html`, `interview/`: AI-lexandre at `/`, with `/interview/` as a compatible entry point
- `work/index.html`: full static portfolio at `/work/`
- `base.css`, `styles.css`, `interview/styles.css`: shared typography, portfolio/case studies, and interview styling
- `content.json`, `scripts/build-work.mjs`: source content and static portfolio generator
- `packages/interview-core/`: shared corpus builder, presets, retrieval
- `apps/interview-api/`: Railway-ready Fastify API for grounded answers
- `docs/interview-mvp.md`: product and architecture spec

## Repo Shape

- Root stays GitHub Pages-friendly: all static pages and assets live at the repo root or in top-level static folders.
- `apps/` contains deployable services that are not served by Pages.
- `packages/` contains reusable logic shared by services.
- Generated build output is not committed; rebuild locally with npm scripts.

## How Portfolio Content Works

Update `content.json`. The main site and the interview corpus both derive from it, so the portfolio and AI-lexandre stay aligned.

Run `npm run build:portfolio` after content changes. It rebuilds the complete static Work page and synchronizes the two interview entry points. Work, case studies, and the résumé remain accessible without JavaScript or the interview service. `main.js` forwards former homepage fragments to `/work/` when JavaScript is available.

## AI-lexandre

AI-lexandre is the homepage and expects a backend API. `/interview/` uses the same interface. Drafts, role focus, conversation, evidence disclosure, and reading position persist in session storage for the current tab. Source navigation uses ordinary links.

Local setup:

1. Install dependencies with `npm install`.
2. Build the corpus and packages with `npm run build`.
3. Start the API with `npm run dev:api`.
4. Serve the repository: `python3 -m http.server 8000 --bind 127.0.0.1`.
5. Open `http://127.0.0.1:8000/?api=http://127.0.0.1:8787`.

The published API in `interview/config.js` is the default. Use `?api=` for a local override; it persists only in the current tab. For local mock verification, start the API with:

```sh
MOCK_INTERVIEW_RESPONSES=true CORS_ORIGINS=http://127.0.0.1:8000 RATE_LIMIT_MAX=500 npm run dev:api
```

With both servers running, `npm run test:browser` runs the Playwright/axe checks and writes screenshots plus `docs/redesign/verification.json`. It uses installed Google Chrome by default; `PLAYWRIGHT_CHANNEL=chromium` selects a Playwright-installed Chromium. Desktop, mobile, 320px overflow, mock streaming/follow-ups, fallback, source return, keyboard, no-JavaScript, and reduced motion are covered. Long-answer pacing uses a labeled fixture, not a live-model response. See [the redesign review](docs/redesign/README.md).

## How to Deploy on GitHub Pages

This repository is set up to serve from the root (`/`) of the `main` branch.

1. Go to repository Settings.
2. Open Pages.
3. Under Build and deployment, set Source to `Deploy from a branch`.
4. Select `main` branch and `/ (root)` folder.
5. Save.

The static interview page will publish with the portfolio. The API should be hosted separately, for example on Railway.

Production API defaults are intentionally conservative:

- `CORS_ORIGINS` should include only the published portfolio origin and any explicit local dev origins.
- `ALLOW_WILDCARD_CORS=false` keeps an accidental `CORS_ORIGIN=*` from reopening the API.
- `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW` throttle public API traffic.
- `REQUEST_LOGGING=true` enables Fastify request/error logs in production.

## Useful Commands

- `npm run clean`: remove generated build artifacts
- `npm run build:corpus`: regenerate the interview corpus from `content.json`
- `npm run build`: build the static portfolio, shared package, and API
- `npm run dev:api`: run the interview API locally
- `npm test`: run retrieval, API, content, and navigation tests
- `npm run test:browser`: run local mock browser and accessibility checks
