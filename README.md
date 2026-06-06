# Seedance Canvas Studio Demo

A local-first demo for configuring Seedance and composing multimodal video-generation inputs on a canvas.

It is intentionally lightweight: no npm dependencies, no database, and no external service calls unless you switch the UI from Mock mode to live mode.

## What It Does

- Shows a Figma-like canvas with multiple canvases and draggable Seedance input nodes.
- Provides a model configuration panel for a runtime-provided video-generation service.
- Prepares multimodal generation inputs from prompt, image, video, and audio assets.
- Validates key provider constraints before creating a task.
- Proxies task creation and polling through the local Node server to avoid browser CORS issues.
- Keeps runtime credentials in the current browser session only. Saved workspaces omit credentials.

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
