# Seedance Canvas Studio Demo

A local-first demo for configuring generation nodes and composing multimodal video-generation inputs on a canvas.

It is intentionally lightweight: no npm dependencies, no database, and no external service calls unless you switch the UI from Mock mode to live mode.

## What It Does

- Shows a Figma-like canvas with multiple canvases and draggable workflow nodes.
- Provides a compact API manager for runtime-provided generation services.
- Prepares multimodal generation inputs from prompt, image, video, and audio assets.
- Validates key provider constraints before creating a task.
- Runs as a static browser app for GitHub Pages, with the local Node server kept for development utilities.
- Stores the workspace in IndexedDB, keeps a small localStorage fallback, and supports project import/export.

## Run

```powershell
npm start
```

Open:

```text
http://localhost:4317
```

## Smoke Test

With the local server running:

```powershell
node scripts/smoke.mjs
```

The test runs Seedance task creation and polling in mock mode.

## GitHub Pages

The repository includes a GitHub Actions workflow that publishes the `public/` folder as a static site.

One-time setup in GitHub:

1. Open repository Settings.
2. Go to Pages.
3. Set Source to GitHub Actions.
4. Push to `main`, then wait for the Pages deployment workflow to finish.

The static app stores project data in the browser. Use export/import for important project backups, especially before clearing browser data or changing devices.
