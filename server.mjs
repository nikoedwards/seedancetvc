import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data", "projects");
const outputDir = path.join(__dirname, "outputs");
const uploadsDir = path.join(__dirname, "uploads");
const port = Number(process.env.PORT || 4317);

mkdirSync(dataDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });
mkdirSync(uploadsDir, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".txt": "text/plain; charset=utf-8",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON body: ${detail}`);
  }
}

function safeJoin(root, target) {
  const resolved = path.resolve(root, target);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error("Path escapes workspace");
  }
  return resolved;
}

function hasExecutable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { windowsHide: true, encoding: "utf8" });
  return result.status === 0;
}

function slug(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "project";
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickText(inputs = [], maxLength = 12000) {
  const joined = inputs
    .map((item) => {
      const title = item.relativePath || item.name || "material";
      const content = item.text || item.excerpt || "";
      return `# ${title}\n${content}`;
    })
    .join("\n\n")
    .slice(0, maxLength);
  return joined || "No readable source text was provided.";
}

function splitIntoChunks(totalSeconds, maxSeconds) {
  const total = clampNumber(totalSeconds, 60, 5, 300);
  const max = clampNumber(maxSeconds, 15, 4, 15);
  const chunks = [];
  let cursor = 0;
  while (cursor < total) {
    const remaining = total - cursor;
    const duration = Math.min(max, remaining);
    chunks.push({
      start: cursor,
      end: cursor + duration,
      duration
    });
    cursor += duration;
  }
  return chunks;
}

function secondsLabel(seconds) {
  const whole = Math.round(seconds);
  const min = Math.floor(whole / 60);
  const sec = String(whole % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function buildDemoPlan(project) {
  const productName = project.basics?.productName || "3C Product";
  const audience = project.basics?.audience || "young urban professionals";
  const tone = project.visual?.tone || "premium, precise, cinematic";
  const productFacts = pickText(project.materials?.knowledge || [], 2000)
    .replace(/\s+/g, " ")
    .slice(0, 450);
  const outline = pickText(project.materials?.scripts || [], 1500)
    .replace(/\s+/g, " ")
    .slice(0, 360);
  const chunks = splitIntoChunks(project.timing?.totalSeconds, project.timing?.maxClipSeconds);
  const beats = [
    {
      title: "产品初见",
      action: "极近景掠过产品边缘和关键材质，光线从轮廓切入，建立高级质感。",
      value: "建立品牌质感和产品可信度。"
    },
    {
      title: "核心卖点",
      action: "用清晰的镜头运动展示核心功能，搭配微距细节和使用场景切换。",
      value: "让观众快速理解最重要的产品能力。"
    },
    {
      title: "真实场景",
      action: "把产品放进生活或办公场景，人物自然操作，突出效率、便携和稳定体验。",
      value: "连接用户日常需求和产品优势。"
    },
    {
      title: "情绪升级",
      action: "镜头节奏跟随 BGM 加快，展示多场景 montage，产品始终保持清晰中心位置。",
      value: "把功能转化为情绪记忆点。"
    },
    {
      title: "品牌收束",
      action: "产品 hero shot 定格，出现干净的品牌收尾画面和一句短促有力的主张。",
      value: "留下明确购买记忆和品牌识别。"
    }
  ];

  const shots = chunks.map((chunk, index) => {
    const beat = beats[Math.min(index, beats.length - 1)];
    const reference = index === 0
      ? "以产品主参考图、品牌视觉规范和全局色调作为起点。"
      : "承接上一段最后一帧的构图、光线方向、产品朝向和景深关系。";
    const prompt = [
      `${productName} ${beat.title}，${beat.action}`,
      `画面风格：${tone}。`,
      `受众：${audience}。`,
      `产品信息依据：${productFacts || "以输入知识库为准，避免虚构规格。"}`,
      `脚本依据：${outline || "围绕产品卖点做 TVC 节奏表达。"}`,
      "产品外观、Logo、颜色、接口位置必须保持一致；避免多余文字、水印、畸变手部和错误品牌。"
    ].join(" ");

    return {
      id: `shot-${String(index + 1).padStart(2, "0")}`,
      index: index + 1,
      title: beat.title,
      start: chunk.start,
      end: chunk.end,
      duration: chunk.duration,
      beat: project.timing?.bgmNotes || `BGM ${secondsLabel(chunk.start)}-${secondsLabel(chunk.end)} 节奏点`,
      visualGoal: beat.value,
      action: beat.action,
      continuity: reference,
      prompt,
      negativePrompt: project.visual?.negativePrompt || "logo distortion, product deformation, extra text, watermark, low quality, wrong proportions",
      referenceImageUrl: "",
      expectedOutput: `outputs/${project.id}/${String(index + 1).padStart(2, "0")}-${slug(beat.title)}.mp4`
    };
  });

  return {
    source: "local-demo-planner",
    summary: `${productName} ${project.timing?.totalSeconds || 60}s TVC execution plan`,
    logline: `以 ${tone} 的商业影像语言，把 ${productName} 的产品价值转化为连续的 Seedance 分段视频。`,
    globalPrompt: [
      "cinematic product commercial, premium 3C product TVC, consistent product identity, consistent lighting direction, clean brand-safe composition",
      project.visual?.globalPrompt || ""
    ].filter(Boolean).join(", "),
    productionRules: [
      "每段不超过 Seedance 单次请求上限。",
      "后一段必须承接前一段最后一帧的产品朝向、光线和景别。",
      "所有镜头都必须围绕真实产品资料，不能编造规格。",
      "生成后保留每段末帧，作为下一段参考输入。"
    ],
    shots
  };
}

function normalizePlan(project, plan) {
  const fallback = buildDemoPlan(project);
  const shots = Array.isArray(plan?.shots) && plan.shots.length ? plan.shots : fallback.shots;
  return {
    source: plan?.source || "llm",
    summary: plan?.summary || fallback.summary,
    logline: plan?.logline || fallback.logline,
    globalPrompt: plan?.globalPrompt || fallback.globalPrompt,
    productionRules: Array.isArray(plan?.productionRules) ? plan.productionRules : fallback.productionRules,
    shots: shots.map((shot, index) => {
      const chunk = fallback.shots[index] || fallback.shots[fallback.shots.length - 1];
      return {
        id: shot.id || `shot-${String(index + 1).padStart(2, "0")}`,
        index: Number(shot.index || index + 1),
        title: shot.title || chunk.title,
        start: Number.isFinite(Number(shot.start)) ? Number(shot.start) : chunk.start,
        end: Number.isFinite(Number(shot.end)) ? Number(shot.end) : chunk.end,
        duration: clampNumber(shot.duration ?? chunk.duration, chunk.duration, 1, 15),
        beat: shot.beat || chunk.beat,
        visualGoal: shot.visualGoal || shot.goal || chunk.visualGoal,
        action: shot.action || chunk.action,
        continuity: shot.continuity || chunk.continuity,
        prompt: shot.prompt || chunk.prompt,
        negativePrompt: shot.negativePrompt || chunk.negativePrompt,
        referenceImageUrl: shot.referenceImageUrl || "",
        expectedOutput: shot.expectedOutput || chunk.expectedOutput
      };
    })
  };
}

function buildPlanningPrompt(project) {
  const totalSeconds = clampNumber(project.timing?.totalSeconds, 60, 5, 300);
  const maxClipSeconds = clampNumber(project.timing?.maxClipSeconds, 15, 4, 15);
  const shotCount = Math.ceil(totalSeconds / maxClipSeconds);
  const scripts = pickText(project.materials?.scripts || [], 9000);
  const knowledge = pickText(project.materials?.knowledge || [], 12000);
  return [
    "You are a senior TVC director and AI video pipeline planner.",
    "Create a JSON-only execution plan for Seedance segmented video generation.",
    "The output must be valid JSON with this shape:",
    JSON.stringify({
      summary: "string",
      logline: "string",
      globalPrompt: "string",
      productionRules: ["string"],
      shots: [
        {
          id: "shot-01",
          index: 1,
          title: "string",
          start: 0,
          end: 15,
          duration: 15,
          beat: "BGM cue",
          visualGoal: "string",
          action: "string",
          continuity: "string",
          prompt: "Seedance prompt in Chinese or English",
          negativePrompt: "string"
        }
      ]
    }, null, 2),
    `Make exactly ${shotCount} shots. Each shot duration must be <= ${maxClipSeconds}s and the total must be ${totalSeconds}s.`,
    "The TVC must be grounded in the product facts. Do not invent specs.",
    "Each prompt must preserve product identity, logo, color, proportions, and lighting continuity.",
    "For shot 2 and later, write continuity instructions that bridge from the previous last frame.",
    "",
    "Project:",
    JSON.stringify({
      basics: project.basics,
      timing: project.timing,
      visual: project.visual
    }, null, 2),
    "",
    "Script materials:",
    scripts,
    "",
    "Product knowledge:",
    knowledge
  ].join("\n");
}

async function callLLM(project, llm = {}) {
  const endpoint = llm.endpoint || process.env.LLM_ENDPOINT;
  const apiKey = llm.apiKey || process.env.LLM_API_KEY;
  const model = llm.model || process.env.LLM_MODEL || "gpt-4.1";
  if (!endpoint || !apiKey || llm.mode === "mock") {
    return buildDemoPlan(project);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return only valid JSON. You plan product TVC videos for AI video generation."
        },
        {
          role: "user",
          content: buildPlanningPrompt(project)
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || data.output_text || data.content;
  if (!content) throw new Error("LLM response did not include content");
  const plan = extractJson(content);
  return normalizePlan(project, plan);
}

function extractJson(content) {
  if (typeof content !== "string") return content;
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Could not parse JSON from LLM response");
  }
}

function getByPath(object, expression) {
  if (!expression) return undefined;
  const parts = String(expression)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current = object;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function applyTemplate(template, values) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    return value == null ? "" : String(value);
  });
}

function buildSeedancePayload(config, values) {
  if (config.payloadTemplate?.trim()) {
    const rendered = applyTemplate(config.payloadTemplate, values);
    return JSON.parse(rendered);
  }
  return {
    model: config.model || process.env.SEEDANCE_MODEL || "seedance-1-0-pro",
    prompt: values.prompt,
    duration: values.duration,
    aspect_ratio: values.aspectRatio,
    resolution: values.resolution,
    seed: values.seed,
    image: values.referenceImageUrl || undefined,
    negative_prompt: values.negativePrompt || undefined
  };
}

async function pollSeedance(taskId, config, values) {
  const endpoint = applyTemplate(config.pollEndpointTemplate, { ...values, taskId });
  const intervalMs = clampNumber(config.pollIntervalMs, 5000, 1000, 60000);
  const maxAttempts = clampNumber(config.pollMaxAttempts, 60, 1, 300);
  const success = String(config.successStatus || "succeeded").toLowerCase();
  const failure = String(config.failureStatus || "failed").toLowerCase();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const response = await fetch(endpoint, {
      method: config.pollMethod || "GET",
      headers: buildHeaders(config)
    });
    if (!response.ok) {
      throw new Error(`Seedance poll failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    const status = String(getByPath(data, config.statusPath) || "").toLowerCase();
    if (status === success) return data;
    if (status === failure) {
      throw new Error(`Seedance task failed: ${JSON.stringify(data)}`);
    }
  }
  throw new Error(`Seedance task ${taskId} did not finish before polling timeout`);
}

function buildHeaders(config) {
  const headers = { "content-type": "application/json" };
  const apiKey = config.apiKey || process.env.SEEDANCE_API_KEY;
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (config.extraHeaders?.trim()) {
    const parsed = JSON.parse(config.extraHeaders);
    Object.assign(headers, parsed);
  }
  return headers;
}

async function downloadToFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${await response.text()}`);
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath);
    response.body.pipeTo(new WritableStream({
      write(chunk) {
        stream.write(Buffer.from(chunk));
      },
      close() {
        stream.end(resolve);
      },
      abort(error) {
        stream.destroy(error);
        reject(error);
      }
    })).catch(reject);
  });
}

function escapeXml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapSvgText(input, max = 58, lines = 5) {
  const words = String(input || "").replace(/\s+/g, " ").split(" ");
  const result = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > max) {
      result.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
    if (result.length === lines) break;
  }
  if (result.length < lines && current) result.push(current);
  return result.slice(0, lines);
}

async function createMockAsset(project, shot, outDir) {
  const fileName = `${String(shot.index).padStart(2, "0")}-${slug(shot.title)}.svg`;
  const filePath = path.join(outDir, fileName);
  const colors = ["#0f766e", "#7c3aed", "#be123c", "#2563eb", "#ca8a04", "#475569"];
  const color = colors[(shot.index - 1) % colors.length];
  const lines = wrapSvgText(shot.prompt);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#101418"/>
  <rect x="54" y="54" width="1172" height="608" rx="18" fill="#171d23" stroke="#2d3742" stroke-width="2"/>
  <rect x="90" y="92" width="190" height="42" rx="4" fill="${color}"/>
  <text x="112" y="120" fill="#ffffff" font-family="Arial, sans-serif" font-size="22" font-weight="700">SHOT ${String(shot.index).padStart(2, "0")}</text>
  <text x="90" y="198" fill="#f8fafc" font-family="Arial, sans-serif" font-size="46" font-weight="700">${escapeXml(shot.title)}</text>
  <text x="90" y="252" fill="#a7b0bb" font-family="Arial, sans-serif" font-size="24">${escapeXml(secondsLabel(shot.start))} - ${escapeXml(secondsLabel(shot.end))} / ${escapeXml(shot.duration)}s</text>
  ${lines.map((line, index) => `<text x="90" y="${330 + index * 38}" fill="#dce3ea" font-family="Arial, sans-serif" font-size="25">${escapeXml(line)}</text>`).join("\n  ")}
  <text x="90" y="604" fill="#8ea0b4" font-family="Arial, sans-serif" font-size="22">Mock asset. Configure Seedance API to generate real video.</text>
</svg>`;
  await writeFile(filePath, svg, "utf8");
  return `/outputs/${project.id}/${fileName}`;
}

async function callSeedance(project, plan, config = {}) {
  const outDir = path.join(outputDir, project.id);
  mkdirSync(outDir, { recursive: true });
  const useMock = config.mode === "mock" || !config.endpoint;
  let previousReference = config.firstReferenceImageUrl || "";
  const results = [];

  for (const shot of plan.shots) {
    const prompt = [
      plan.globalPrompt,
      shot.prompt,
      shot.continuity,
      previousReference ? `Use this previous-frame reference for continuity: ${previousReference}` : ""
    ].filter(Boolean).join("\n\n");
    const values = {
      model: config.model || process.env.SEEDANCE_MODEL || "seedance-1-0-pro",
      prompt,
      duration: shot.duration,
      aspectRatio: project.timing?.aspectRatio || "16:9",
      resolution: project.timing?.resolution || "1080p",
      seed: project.visual?.seed || 20260605,
      shotIndex: shot.index,
      referenceImageUrl: shot.referenceImageUrl || previousReference,
      negativePrompt: shot.negativePrompt || project.visual?.negativePrompt || "",
      productName: project.basics?.productName || "",
      tone: project.visual?.tone || ""
    };

    if (useMock) {
      const assetUrl = await createMockAsset(project, shot, outDir);
      previousReference = assetUrl;
      results.push({
        shotId: shot.id,
        index: shot.index,
        status: "mocked",
        prompt,
        videoUrl: "",
        localAssetUrl: assetUrl,
        nextReferenceImageUrl: previousReference
      });
      continue;
    }

    const payload = buildSeedancePayload(config, values);
    const response = await fetch(config.endpoint || process.env.SEEDANCE_ENDPOINT, {
      method: config.method || "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Seedance request failed for shot ${shot.index}: ${response.status} ${await response.text()}`);
    }
    let data = await response.json();
    const taskId = getByPath(data, config.taskIdPath);
    if (!getByPath(data, config.resultPath) && taskId && config.pollEndpointTemplate) {
      data = await pollSeedance(taskId, config, values);
    }
    const videoUrl = getByPath(data, config.resultPath || config.pollResultPath || "video.url")
      || getByPath(data, "data.video_url")
      || getByPath(data, "video_url")
      || getByPath(data, "output[0].url");
    if (!videoUrl) {
      throw new Error(`Seedance response for shot ${shot.index} did not include a video URL`);
    }
    const extension = path.extname(new URL(videoUrl).pathname) || ".mp4";
    const fileName = `${String(shot.index).padStart(2, "0")}-${slug(shot.title)}${extension}`;
    const filePath = path.join(outDir, fileName);
    await downloadToFile(videoUrl, filePath);
    previousReference = videoUrl;
    results.push({
      shotId: shot.id,
      index: shot.index,
      status: "generated",
      prompt,
      providerResponse: data,
      videoUrl,
      localAssetUrl: `/outputs/${project.id}/${fileName}`,
      nextReferenceImageUrl: previousReference
    });
  }

  await writeFile(path.join(outDir, "generation-results.json"), JSON.stringify(results, null, 2), "utf8");
  return results;
}

async function createProject(payload) {
  const id = `${Date.now()}-${slug(payload.basics?.productName || "tvc")}-${randomUUID().slice(0, 8)}`;
  const project = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    basics: payload.basics || {},
    timing: payload.timing || {},
    visual: payload.visual || {},
    materials: payload.materials || { scripts: [], knowledge: [] }
  };
  const projectDir = path.join(dataDir, id);
  mkdirSync(projectDir, { recursive: true });
  await writeFile(path.join(projectDir, "project.json"), JSON.stringify(project, null, 2), "utf8");
  return project;
}

async function saveProjectArtifact(projectId, name, payload) {
  const projectDir = safeJoin(dataDir, projectId);
  mkdirSync(projectDir, { recursive: true });
  await writeFile(path.join(projectDir, name), JSON.stringify(payload, null, 2), "utf8");
}

async function listProjects() {
  const entries = await readdir(dataDir, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await readFile(path.join(dataDir, entry.name, "project.json"), "utf8");
      projects.push(JSON.parse(raw));
    } catch {
      // Ignore incomplete local folders.
    }
  }
  return projects.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function readProject(id) {
  const file = safeJoin(dataDir, path.join(id, "project.json"));
  return JSON.parse(await readFile(file, "utf8"));
}

async function compose(project, results = [], options = {}) {
  const outDir = path.join(outputDir, project.id);
  mkdirSync(outDir, { recursive: true });
  const clips = results
    .map((item) => item.localAssetUrl)
    .filter((url) => url && url.endsWith(".mp4"))
    .map((url) => path.join(__dirname, url.replace(/^\//, "").replace(/\//g, path.sep)));
  const concatList = clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n");
  const concatPath = path.join(outDir, "concat.txt");
  await writeFile(concatPath, concatList || "# No mp4 clips generated yet\n", "utf8");

  const editPlan = {
    projectId: project.id,
    createdAt: new Date().toISOString(),
    ffmpegAvailable: hasExecutable("ffmpeg"),
    bgm: options.bgm || project.timing?.bgmNotes || "",
    clips: results.map((item, index) => ({
      index: index + 1,
      shotId: item.shotId,
      asset: item.localAssetUrl,
      prompt: item.prompt,
      nextReferenceImageUrl: item.nextReferenceImageUrl
    })),
    concatFile: `/outputs/${project.id}/concat.txt`,
    output: `/outputs/${project.id}/final.mp4`
  };
  await writeFile(path.join(outDir, "edit-plan.json"), JSON.stringify(editPlan, null, 2), "utf8");

  if (editPlan.ffmpegAvailable && clips.length > 0) {
    const args = ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", path.join(outDir, "final.mp4")];
    const result = spawnSync("ffmpeg", args, { encoding: "utf8", windowsHide: true });
    editPlan.ffmpegStatus = result.status;
    editPlan.ffmpegStdout = result.stdout;
    editPlan.ffmpegStderr = result.stderr;
    await writeFile(path.join(outDir, "edit-plan.json"), JSON.stringify(editPlan, null, 2), "utf8");
  }
  return editPlan;
}

function buildWaterPipeHeaders(config = {}) {
  const headers = {
    "content-type": "application/json"
  };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  if (config.wpTitle) headers["x-wp-title"] = config.wpTitle;
  if (config.extraHeaders?.trim()) {
    const extra = JSON.parse(config.extraHeaders);
    Object.assign(headers, extra);
  }
  return headers;
}

async function testWaterPipeConnection(config = {}) {
  const endpoint = config.createEndpoint || "https://agent-api.shuiditech.com/api/v1/contents/generations/tasks";
  if (!config.apiKey) {
    return {
      ok: false,
      mode: "mock",
      message: "请先填写 API Key。未填写时仍可使用 Mock 预览。"
    };
  }
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildWaterPipeHeaders(config),
      signal: AbortSignal.timeout(10000)
    });
    const text = await response.text().catch(() => "");
    const reachable = response.status < 500;
    return {
      ok: reachable && response.status !== 401 && response.status !== 403,
      reachable,
      status: response.status,
      message: reachable
        ? `端点可达，HTTP ${response.status}。如果返回 404/405，通常表示服务在线但该地址只接受 POST 创建任务。`
        : `端点返回 HTTP ${response.status}，请检查地址或网络。`,
      bodyPreview: text.slice(0, 500)
    };
  } catch (error) {
    return {
      ok: false,
      reachable: false,
      message: `连接失败：${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function testImage2Connection(config = {}) {
  const endpoint = config.endpoint || "https://agent-api.shuiditech.com/api/v1/images/generations";
  if (!config.apiKey) {
    return {
      ok: false,
      mode: "mock",
      message: "请先填写 API Key。未填写时仍可使用 Mock 预览。"
    };
  }
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildWaterPipeHeaders(config),
      signal: AbortSignal.timeout(10000)
    });
    const text = await response.text().catch(() => "");
    const reachable = response.status < 500;
    return {
      ok: reachable && response.status !== 401 && response.status !== 403,
      reachable,
      status: response.status,
      message: reachable
        ? `端点可达，HTTP ${response.status}。如果返回 404/405，通常表示服务在线但该地址只接受 POST 创建任务。`
        : `端点返回 HTTP ${response.status}，请检查地址或网络。`,
      bodyPreview: text.slice(0, 500)
    };
  } catch (error) {
    return {
      ok: false,
      reachable: false,
      message: `连接失败：${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function normalizeWaterPipeRequest(requestBody = {}) {
  const normalized = {
    ...requestBody,
    content: Array.isArray(requestBody.content)
      ? requestBody.content.map((item) => {
          if (item?.type !== "text") return item;
          const { role, ...textItem } = item;
          return textItem;
        })
      : requestBody.content
  };
  return normalized;
}

function parseProviderError(data = {}) {
  const gatewayError = data.error || {};
  const metadata = gatewayError.metadata || {};
  let rawError = null;
  if (metadata.raw) {
    try {
      rawError = JSON.parse(metadata.raw)?.error || null;
    } catch {
      rawError = null;
    }
  }
  const code = rawError?.code || gatewayError.code || "";
  const message = rawError?.message || gatewayError.message || "";
  const providerName = metadata.provider_name || "";
  const privacyImageBlocked =
    String(code).includes("InputImageSensitiveContentDetected") ||
    /input image may contain real person/i.test(message);
  const userMessage = privacyImageBlocked
    ? "输入图片触发了上游隐私/真人内容安全拦截。请换一张不含真实人物、证件、联系方式或其他隐私信息的参考图；如果需要人物一致性，建议使用授权素材、虚拟人物或先生成一张非真人角色图。"
    : `Seedance create failed: ${message || JSON.stringify(data)}`;
  const suggestions = privacyImageBlocked
    ? [
        "删除或替换首帧、尾帧、参考图中可能出现真实人物脸部的图片。",
        "避免上传身份证件、手机号码、地址、聊天截图、工牌等隐私信息。",
        "如果这是 3C 产品 TVC，优先使用产品图、场景图、手部局部图，或用虚拟模特参考图。"
      ]
    : [];
  return {
    code,
    message,
    param: rawError?.param || "",
    type: rawError?.type || "",
    providerName,
    userMessage,
    suggestions,
    raw: data
  };
}

function makeSeedanceError(kind, status, data) {
  const details = parseProviderError(data);
  const error = new Error(details.userMessage || `Seedance ${kind} failed: ${status} ${JSON.stringify(data)}`);
  error.details = details;
  error.upstreamStatus = status;
  return error;
}

async function createWaterPipeTask(config = {}, requestBody = {}) {
  const normalizedRequestBody = normalizeWaterPipeRequest(requestBody);
  if (config.mode === "mock") {
    return {
      id: `mock-${randomUUID().slice(0, 10)}`,
      status: "pending",
      mock: true,
      request: normalizedRequestBody
    };
  }
  const endpoint = config.createEndpoint || "https://agent-api.shuiditech.com/api/v1/contents/generations/tasks";
  if (!config.apiKey) throw new Error("Seedance API Key is required for real API mode");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildWaterPipeHeaders(config),
    body: JSON.stringify(normalizedRequestBody)
  });
  const data = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    throw makeSeedanceError("create", response.status, data);
  }
  return data;
}

async function pollWaterPipeTask(config = {}, taskId) {
  if (!taskId) throw new Error("taskId is required");
  if (config.mode === "mock") {
    return {
      id: taskId,
      status: "succeeded",
      mock: true,
      content: {
        video_url: `mock://seedance/${taskId}.mp4`,
        last_frame_image: `mock://seedance/${taskId}-last-frame.png`
      },
      usage: {
        total_tokens: 0
      }
    };
  }
  if (!config.apiKey) throw new Error("Seedance API Key is required for real API mode");
  const endpointTemplate = config.pollEndpoint || "https://agent-api.shuiditech.com/api/v1/contents/generations/tasks/{{taskId}}?model={{model}}";
  const endpoint = applyTemplate(endpointTemplate, {
    taskId,
    model: config.model || "seedance-2-0"
  });
  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildWaterPipeHeaders(config)
  });
  const data = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    throw makeSeedanceError("poll", response.status, data);
  }
  return data;
}

function normalizeImage2Request(requestBody = {}) {
  const { response_format, style, input_reference, ...rest } = requestBody;
  return rest;
}

async function createMockImage2Asset(requestBody = {}) {
  const outDir = path.join(outputDir, "image2");
  mkdirSync(outDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}.svg`;
  const filePath = path.join(outDir, fileName);
  const prompt = escapeXml(String(requestBody.prompt || "Image2 mock image").slice(0, 220));
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#111827"/>
  <rect x="72" y="72" width="880" height="880" rx="28" fill="#f8fafc"/>
  <circle cx="780" cy="220" r="96" fill="#f59e0b" opacity="0.88"/>
  <path d="M112 762 C240 610 352 610 496 760 C620 890 758 848 912 668 L912 952 L112 952 Z" fill="#0f766e"/>
  <path d="M112 650 C236 536 356 520 488 642 C620 762 744 760 912 564 L912 952 L112 952 Z" fill="#2563eb" opacity="0.75"/>
  <text x="112" y="164" fill="#111827" font-family="Arial, sans-serif" font-size="42" font-weight="700">Image2 Mock</text>
  <foreignObject x="112" y="214" width="760" height="260">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 30px; color: #334155; line-height: 1.35;">${prompt}</div>
  </foreignObject>
</svg>`;
  await writeFile(filePath, svg, "utf8");
  return `/outputs/image2/${fileName}`;
}

async function createImage2Generation(config = {}, requestBody = {}) {
  const normalizedRequestBody = normalizeImage2Request(requestBody);
  if (config.mode === "mock") {
    const imageUrl = await createMockImage2Asset(normalizedRequestBody);
    return {
      id: `mock-image2-${randomUUID().slice(0, 10)}`,
      status: "succeeded",
      mock: true,
      content: { image_url: imageUrl },
      request: normalizedRequestBody,
      usage: { total_tokens: 0 }
    };
  }
  const endpoint = config.endpoint;
  if (!config.apiKey) throw new Error("Image2 API Key is required for real API mode");
  if (!endpoint) throw new Error("Image2 endpoint is required for real API mode");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildWaterPipeHeaders(config),
    body: JSON.stringify(normalizedRequestBody)
  });
  const data = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    throw makeSeedanceError("image2", response.status, data);
  }
  const b64 = data.data?.[0]?.b64_json;
  let imageUrl = data.data?.[0]?.url || "";
  if (b64) {
    const format = normalizedRequestBody.output_format || "png";
    const outDir = path.join(outputDir, "image2");
    mkdirSync(outDir, { recursive: true });
    const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}.${format}`;
    await writeFile(path.join(outDir, fileName), Buffer.from(b64, "base64"));
    imageUrl = `/outputs/image2/${fileName}`;
  }
  return {
    id: `image2-${randomUUID().slice(0, 10)}`,
    status: "succeeded",
    content: { image_url: imageUrl },
    data: data.data || [],
    usage: data.usage || null,
    raw: data
  };
}

function splitBuffer(buffer, separator) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);
  while (index !== -1) {
    parts.push(buffer.slice(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }
  parts.push(buffer.slice(start));
  return parts;
}

function sanitizeFileName(fileName) {
  const ext = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, "") || ".bin";
  const base = path.basename(fileName, path.extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "asset";
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${base}${ext}`;
}

async function saveMultipartAssets(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!boundaryMatch) throw new Error("Missing multipart boundary");
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const separator = Buffer.from(`--${boundary}`);
  const assets = [];
  for (let part of splitBuffer(body, separator)) {
    if (part.length < 8) continue;
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (part.subarray(0, 2).toString() === "--") continue;
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const headers = part.subarray(0, headerEnd).toString("utf8");
    let fileData = part.subarray(headerEnd + 4);
    if (fileData.subarray(fileData.length - 2).toString() === "\r\n") {
      fileData = fileData.subarray(0, fileData.length - 2);
    }
    const fileNameMatch = headers.match(/filename="([^"]+)"/);
    if (!fileNameMatch || !fileData.length) continue;
    const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
    const originalName = fileNameMatch[1];
    const savedName = sanitizeFileName(originalName);
    const filePath = path.join(uploadsDir, savedName);
    await writeFile(filePath, fileData);
    assets.push({
      name: originalName,
      url: `/uploads/${savedName}`,
      type: contentTypeMatch?.[1] || "application/octet-stream",
      size: fileData.length
    });
  }
  return assets;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const root = url.pathname.startsWith("/outputs/") || url.pathname.startsWith("/uploads/") ? __dirname : publicDir;
  const target = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = safeJoin(root, decodeURIComponent(target.replace(/^\//, "")));
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const file = await readFile(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(file);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        node: process.version,
        ffmpeg: hasExecutable("ffmpeg"),
        dataDir,
        outputDir
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/assets") {
      const assets = await saveMultipartAssets(req);
      sendJson(res, 200, { assets });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/seedance/test") {
      const payload = await readJson(req);
      const result = await testWaterPipeConnection(payload.config || {});
      sendJson(res, 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/image2/test") {
      const payload = await readJson(req);
      const result = await testImage2Connection(payload.config || {});
      sendJson(res, 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/seedance/tasks") {
      const payload = await readJson(req);
      const task = await createWaterPipeTask(payload.config || {}, payload.requestBody || {});
      sendJson(res, 200, { task });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/seedance/poll") {
      const payload = await readJson(req);
      const task = await pollWaterPipeTask(payload.config || {}, payload.taskId);
      sendJson(res, 200, { task });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/image2/generate") {
      const payload = await readJson(req);
      const result = await createImage2Generation(payload.config || {}, payload.requestBody || {});
      sendJson(res, 200, { result });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/projects") {
      sendJson(res, 200, { projects: await listProjects() });
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/projects/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      sendJson(res, 200, { project: await readProject(id) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/projects") {
      const payload = await readJson(req);
      sendJson(res, 200, { project: await createProject(payload) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/plan") {
      const payload = await readJson(req);
      const project = payload.project?.id ? payload.project : await createProject(payload.project || payload);
      const plan = await callLLM(project, payload.llm || {});
      await saveProjectArtifact(project.id, "plan.json", plan);
      sendJson(res, 200, { project, plan });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/generate") {
      const payload = await readJson(req);
      const project = payload.project;
      const plan = normalizePlan(project, payload.plan);
      const results = await callSeedance(project, plan, payload.seedance || {});
      await saveProjectArtifact(project.id, "generation-results.json", results);
      sendJson(res, 200, { results });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/compose") {
      const payload = await readJson(req);
      const editPlan = await compose(payload.project, payload.results || [], payload.options || {});
      sendJson(res, 200, { editPlan });
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, {
      error: message,
      details: error?.details || null,
      upstreamStatus: error?.upstreamStatus || null
    });
  }
}

createServer(route).listen(port, () => {
  console.log(`Seedance Canvas Studio demo running at http://localhost:${port}`);
});
