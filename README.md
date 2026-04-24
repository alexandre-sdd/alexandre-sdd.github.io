# alexandre-sdd.github.io

Portfolio site hosted on GitHub Pages, with AI-lexandre as a static interview frontend and a separate API for grounded interview answers.

## Main Areas

- `index.html`, `main.js`, `styles.css`, `content.json`: main portfolio site
- `interview/`: static AI-lexandre recruiter interview page
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

If JavaScript is disabled, the static HTML in `index.html` is shown. If you want perfect no-JS parity, keep `index.html` aligned with `content.json`.

## AI-lexandre

AI-lexandre lives at `./interview/` and expects a backend API.

Local setup:

1. Install dependencies with `npm install`.
2. Build the corpus and packages with `npm run build`.
3. Start the API with `npm run dev:api`.
4. Open the site and visit `/interview/`.

By default the frontend expects the API at `http://127.0.0.1:8787`. You can change that in `interview/config.js` or from the page settings form.

## How to Deploy on GitHub Pages

This repository is set up to serve from the root (`/`) of the `main` branch.

1. Go to repository Settings.
2. Open Pages.
3. Under Build and deployment, set Source to `Deploy from a branch`.
4. Select `main` branch and `/ (root)` folder.
5. Save.

The static interview page will publish with the portfolio. The API should be hosted separately, for example on Railway.

## Useful Commands

- `npm run clean`: remove generated build artifacts
- `npm run build:corpus`: regenerate the interview corpus from `content.json`
- `npm run build`: build the shared package and API
- `npm run dev:api`: run the interview API locally
- `npm test`: run retrieval and API tests
