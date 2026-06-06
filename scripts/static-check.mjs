import { readFile } from "node:fs/promises";

const [html, app, workflow] = await Promise.all([
  readFile("public/index.html", "utf8"),
  readFile("public/app.js", "utf8"),
  readFile(".github/workflows/pages.yml", "utf8")
]);

const elementBlock = app.match(/const els = \{([\s\S]*?)\n\};/)?.[1] || "";
const referencedIds = [...elementBlock.matchAll(/#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]);
const missingIds = [...new Set(referencedIds)].filter((id) => !new RegExp(`id=["']${id}["']`).test(html));
const localApiCalls = [...app.matchAll(/fetch\(["']\/api\//g)].map((match) => match[0]);
const rootAssets = [...html.matchAll(/(?:href|src)=["']\/(?:app|styles)\./g)].map((match) => match[0]);

if (missingIds.length) {
  throw new Error(`Missing DOM ids: ${missingIds.join(", ")}`);
}
if (localApiCalls.length) {
  throw new Error(`Static app still calls local API routes: ${localApiCalls.join(", ")}`);
}
if (rootAssets.length) {
  throw new Error(`Static app uses root-relative assets that break project Pages: ${rootAssets.join(", ")}`);
}
if (!workflow.includes("actions/deploy-pages")) {
  throw new Error("GitHub Pages workflow is missing deploy-pages.");
}

console.log(JSON.stringify({
  ok: true,
  referencedIds: new Set(referencedIds).size,
  pagesWorkflow: true,
  localApiCalls: 0,
  rootRelativeAssets: 0
}, null, 2));
