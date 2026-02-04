# alexandre-sdd.github.io

Single-page portfolio site built for GitHub Pages.

## How to edit content
Update `content.json`. The site pulls from this file at runtime, so changes publish without rebuilding.

If JavaScript is disabled, the static HTML in `index.html` is shown. If you want perfect no-JS parity, keep `index.html` aligned with `content.json`.

## How to deploy on GitHub Pages
This repository is set up to serve from the root (`/`) of the `main` branch.

1. Go to the repository Settings.
2. Open Pages.
3. Under Build and deployment, set Source to "Deploy from a branch".
4. Select `main` branch and `/ (root)` folder.
5. Save. GitHub Pages will publish the site.

## Local preview
Open `index.html` in a browser or use a simple static file server.
