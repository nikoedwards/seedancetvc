# Seedance Canvas Studio Demo

A local-first demo for configuring Seedance and composing multimodal video-generation inputs on a canvas.

It is intentionally lightweight: no npm dependencies, no database, and no external service calls unless you switch the UI from Mock mode to API mode.

## What It Does

- Shows a Figma-like canvas with multiple canvases and draggable Seedance input nodes.
- Provides a Seedance / Water Pipe model configuration panel.
- Uses `seedance-2-0` as the default model.
- Builds the Water Pipe multimodal request body from Prompt, image, video, and audio inputs.
- Validates the key API constraints before creating a task.
- Proxies task creation and polling through the local Node server to avoid browser CORS issues.
- Keeps API keys in the current browser session only. Saved workspaces omit the API key.

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

## API Notes

The default endpoint is:

```text
POST https://agent-api.shuiditech.com/api/v1/contents/generations/tasks
```

The default poll template is:

```text
GET https://agent-api.shuiditech.com/api/v1/contents/generations/tasks/{{taskId}}?model={{model}}
```

The request body uses:

```text
model: seedance-2-0
content: text / image_url / video_url / audio_url
ratio: 16:9 / 9:16 / 4:3 / 3:4 / 1:1 / 21:9
duration: 4-15
resolution: 480p / 720p
```

Successful results are expected at `content.video_url`; when `return_last_frame` is enabled, the last-frame image is expected at `content.last_frame_image`.
