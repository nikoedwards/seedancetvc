const STORAGE_KEY = "seedance-canvas-workspace-v2";
const STORAGE_META_KEY = `${STORAGE_KEY}:meta`;
const DB_NAME = "seedance-canvas-local";
const DB_VERSION = 1;
const DB_STORE = "workspace";
const WORKSPACE_RECORD_ID = "current";
const LOCAL_STORAGE_FALLBACK_LIMIT = 1400000;

const DEFAULT_CONFIG = {
  createEndpoint: "https://agent-api.shuiditech.com/api/v1/contents/generations/tasks",
  pollEndpoint: "https://agent-api.shuiditech.com/api/v1/contents/generations/tasks/{{taskId}}?model={{model}}",
  model: "seedance-2-0",
  apiKey: "",
  wpTitle: "demo-app",
  extraHeaders: ""
};

const DEFAULT_IMAGE2_CONFIG = {
  endpoint: "https://agent-api.shuiditech.com/api/v1/images/generations",
  model: "gpt-image-2",
  apiKey: "",
  wpTitle: "demo-app",
  extraHeaders: ""
};

const DEFAULT_NODE_PARAMS = {
  ratio: "16:9",
  duration: 5,
  resolution: "720p",
  generate_audio: true,
  camera_fixed: false,
  watermark: false,
  return_last_frame: true,
  callback_url: "",
  logo_add: "",
  logo_param: ""
};

const DEFAULT_IMAGE2_PARAMS = {
  size: "1024x1024",
  quality: "high",
  n: 1,
  output_format: "png",
  output_compression: "",
  background: "auto",
  moderation: "auto",
  user: ""
};

const IMAGE2_API_LIMITS = {
  referenceImages: 16,
  masks: 1
};

const INPUT_META = {
  prompt: {
    title: "Prompt",
    eyebrow: "必填 text",
    description: "会写入 content 的 text 段。建议每段不超过 200 字符。",
    kind: "text"
  },
  firstFrameUrl: {
    title: "首帧图",
    eyebrow: "role=first_frame",
    description: "控制视频第一帧，最多 1 张。存在首帧时，上游通常会以首帧比例为准。",
    kind: "asset",
    single: true,
    accept: "image/*",
    typeLabel: "图片"
  },
  lastFrameUrl: {
    title: "尾帧图",
    eyebrow: "role=last_frame",
    description: "控制视频最后一帧，最多 1 张。",
    kind: "asset",
    single: true,
    accept: "image/*",
    typeLabel: "图片"
  },
  referenceImageUrls: {
    title: "参考图",
    eyebrow: "role=reference_image",
    description: "用于角色、产品或风格锚定。多张按顺序对应 prompt 中 character1 / character2 / ...。",
    kind: "asset",
    single: false,
    accept: "image/*",
    typeLabel: "图片"
  },
  referenceVideoUrls: {
    title: "参考视频",
    eyebrow: "role=reference_video",
    description: "用于视频续写或风格参考，最多 3 段；不能与首帧或尾帧图片同时提交。",
    kind: "asset",
    single: false,
    accept: "video/*",
    typeLabel: "视频"
  },
  referenceAudioUrls: {
    title: "参考音频",
    eyebrow: "role=reference_audio",
    description: "最多 3 段，必须搭配图片或视频输入，不能单独使用。",
    kind: "asset",
    single: false,
    accept: "audio/*",
    typeLabel: "音频"
  },
  referenceImageUrl: {
    title: "参考图",
    eyebrow: "legacy image input",
    description: "旧版单图输入。新节点会使用多参考图输入，最多 16 张。",
    kind: "asset",
    single: true,
    accept: "image/*",
    typeLabel: "图片"
  },
  image2ReferenceImageUrls: {
    title: "参考图",
    eyebrow: "images",
    description: "用于 Image2 图像参考或编辑，最多 16 张。若同时提供 Mask，Mask 会作用于第一张参考图。",
    kind: "asset",
    single: false,
    maxCount: IMAGE2_API_LIMITS.referenceImages,
    accept: "image/*",
    typeLabel: "图片"
  },
  maskUrl: {
    title: "Mask",
    eyebrow: "mask",
    description: "可选遮罩图，最多 1 张。Mask 不是参考图，只在当前图片模型支持局部重绘或遮罩编辑时生效。",
    kind: "asset",
    single: true,
    accept: "image/*",
    typeLabel: "图片"
  }
};

const state = {
  config: { ...DEFAULT_CONFIG },
  image2Config: { ...DEFAULT_IMAGE2_CONFIG },
  apiProxy: {
    enabled: false,
    baseUrl: ""
  },
  canvases: [],
  activeCanvasId: "",
  selectedNodeId: "",
  selectedConnectionId: "",
  activeInput: null,
  responseLog: [],
  ui: {
    nodeMenuOpen: false,
    connectingFrom: "",
    connectionPreview: null,
    connectionTargetId: "",
    contextMenu: {
      open: false,
      x: 0,
      y: 0,
      canvasX: 180,
      canvasY: 150
    }
  }
};

const activePolls = new Set();
const activeImage2Generations = new Set();
let sameOriginApiBaseUrl = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  studioLayout: $("#studioLayout"),
  serverState: $("#serverState"),
  apiManagerBtn: $("#apiManagerBtn"),
  apiOverlay: $("#apiOverlay"),
  closeApiManagerBtn: $("#closeApiManagerBtn"),
  saveApiConfigBtn: $("#saveApiConfigBtn"),
  apiProxyEnabled: $("#apiProxyEnabled"),
  apiProxyBaseUrl: $("#apiProxyBaseUrl"),
  testSeedanceApiBtn: $("#testSeedanceApiBtn"),
  seedanceApiTestResult: $("#seedanceApiTestResult"),
  testImage2ApiBtn: $("#testImage2ApiBtn"),
  image2ApiTestResult: $("#image2ApiTestResult"),
  image2ApiKey: $("#image2ApiKey"),
  image2Endpoint: $("#image2Endpoint"),
  image2ModelName: $("#image2ModelName"),
  image2WpTitle: $("#image2WpTitle"),
  image2ExtraHeaders: $("#image2ExtraHeaders"),
  apiSeedanceKey: $("#apiSeedanceKey"),
  apiSeedanceCreateEndpoint: $("#apiSeedanceCreateEndpoint"),
  apiSeedancePollEndpoint: $("#apiSeedancePollEndpoint"),
  apiSeedanceModelName: $("#apiSeedanceModelName"),
  apiSeedanceWpTitle: $("#apiSeedanceWpTitle"),
  apiSeedanceExtraHeaders: $("#apiSeedanceExtraHeaders"),
  newCanvasBtn: $("#newCanvasBtn"),
  addNodeMenuBtn: $("#addNodeMenuBtn"),
  nodeAddMenu: $("#nodeAddMenu"),
  addSeedanceNodeBtn: $("#addSeedanceNodeBtn"),
  addImage2NodeBtn: $("#addImage2NodeBtn"),
  emptyAddNodeBtn: $("#emptyAddNodeBtn"),
  saveWorkspaceBtn: $("#saveWorkspaceBtn"),
  duplicateNodeBtn: $("#duplicateNodeBtn"),
  deleteNodeBtn: $("#deleteNodeBtn"),
  zoomInBtn: $("#zoomInBtn"),
  zoomOutBtn: $("#zoomOutBtn"),
  resetViewBtn: $("#resetViewBtn"),
  zoomLabel: $("#zoomLabel"),
  clearResponseBtn: $("#clearResponseBtn"),
  canvasTabs: $("#canvasTabs"),
  canvasViewport: $("#canvasViewport"),
  canvasBoard: $("#canvasBoard"),
  canvasContextMenu: $("#canvasContextMenu"),
  emptyState: $("#emptyState"),
  inspectorEmpty: $("#inspectorEmpty"),
  selectedNodeLabel: $("#selectedNodeLabel"),
  nodeSummary: $("#nodeSummary"),
  paramEditor: $("#paramEditor"),
  requestPreview: $("#requestPreview"),
  validationBox: $("#validationBox"),
  copyRequestBtn: $("#copyRequestBtn"),
  createTaskBtn: $("#createTaskBtn"),
  pollTaskBtn: $("#pollTaskBtn"),
  responseLog: $("#responseLog"),
  persistStorageBtn: $("#persistStorageBtn"),
  storageStatus: $("#storageStatus"),
  exportWorkspaceBtn: $("#exportWorkspaceBtn"),
  importWorkspaceBtn: $("#importWorkspaceBtn"),
  importWorkspaceInput: $("#importWorkspaceInput"),
  exportSecretsToggle: $("#exportSecretsToggle"),
  inputOverlay: $("#inputOverlay"),
  inputSheetEyebrow: $("#inputSheetEyebrow"),
  inputSheetTitle: $("#inputSheetTitle"),
  inputSheetBody: $("#inputSheetBody"),
  closeInputSheetBtn: $("#closeInputSheetBtn")
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultCanvas(index = 1) {
  const canvas = {
    id: uid("canvas"),
    name: `画布 ${index}`,
    view: { zoom: 1, panX: 80, panY: 60 },
    nodes: [],
    connections: []
  };
  canvas.nodes.push(defaultNode(180, 150));
  return canvas;
}

function defaultNode(x = 180, y = 150) {
  return {
    id: uid("seedance"),
    type: "seedance-input",
    title: "Seedance 节点",
    x,
    y,
    prompt: "镜头缓慢拉近，主体轻抬眼眸，发丝随风轻拂",
    negativePrompt: "",
    firstFrameUrl: "",
    lastFrameUrl: "",
    referenceImageUrls: "",
    referenceVideoUrls: "",
    referenceAudioUrls: "",
    params: { ...DEFAULT_NODE_PARAMS },
    lastTaskId: ""
  };
}

function defaultImage2Node(x = 180, y = 150) {
  return {
    id: uid("image2"),
    type: "image2-input",
    title: "Image2 节点",
    x,
    y,
    prompt: "画一张清晨湖边的插画，电影感光影",
    image2ReferenceImageUrls: "",
    referenceImageUrl: "",
    maskUrl: "",
    params: { ...DEFAULT_IMAGE2_PARAMS },
    inputBindings: {}
  };
}

function getActiveCanvas() {
  return state.canvases.find((canvas) => canvas.id === state.activeCanvasId) || state.canvases[0];
}

function getSelectedNode() {
  const canvas = getActiveCanvas();
  return canvas?.nodes.find((node) => node.id === state.selectedNodeId) || null;
}

function getSelectedConnection() {
  const canvas = getActiveCanvas();
  return canvas?.connections.find((connection) => connection.id === state.selectedConnectionId) || null;
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId || "";
  if (nodeId) state.selectedConnectionId = "";
}

function isEditingTarget(target) {
  const element = target instanceof Element ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

function getNodeById(nodeId) {
  const canvas = getActiveCanvas();
  return canvas?.nodes.find((node) => node.id === nodeId) || null;
}

function findNodeRecord(nodeId) {
  for (const canvas of state.canvases) {
    const node = canvas.nodes.find((item) => item.id === nodeId);
    if (node) return { canvas, node };
  }
  return null;
}

function splitLines(value) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^data:[^,]+$/i.test(line) && lines[index + 1] && !looksLikeAssetStart(lines[index + 1])) {
      entries.push(`${line},${lines[index + 1]}`);
      index += 1;
      continue;
    }
    entries.push(...splitAssetLine(line));
  }
  return entries;
}

function splitAssetLine(line) {
  if (/^data:/i.test(line)) return [line];
  return line
    .split(/\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function looksLikeAssetStart(value) {
  return /^(data:|https?:|file-|\/outputs\/|\/uploads\/|mock:\/\/)/i.test(String(value || "").trim());
}

function joinLines(urls) {
  return urls.filter(Boolean).join("\n");
}

function escapeHtml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function syncApiManagerInputs() {
  if (!els.apiOverlay) return;
  els.apiSeedanceKey.value = state.config.apiKey || "";
  els.apiSeedanceCreateEndpoint.value = state.config.createEndpoint || "";
  els.apiSeedancePollEndpoint.value = state.config.pollEndpoint || "";
  els.apiSeedanceModelName.value = state.config.model || "";
  els.apiSeedanceWpTitle.value = state.config.wpTitle || "";
  els.apiSeedanceExtraHeaders.value = state.config.extraHeaders || "";
  els.apiProxyEnabled.checked = Boolean(state.apiProxy?.enabled);
  els.apiProxyBaseUrl.value = state.apiProxy?.baseUrl || "";
  els.image2ApiKey.value = state.image2Config.apiKey || "";
  els.image2Endpoint.value = state.image2Config.endpoint || "";
  els.image2ModelName.value = state.image2Config.model || "";
  els.image2WpTitle.value = state.image2Config.wpTitle || "";
  els.image2ExtraHeaders.value = state.image2Config.extraHeaders || "";
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function updateApiConfigsFromManager() {
  state.config.apiKey = els.apiSeedanceKey.value;
  state.config.createEndpoint = els.apiSeedanceCreateEndpoint.value.trim();
  state.config.pollEndpoint = els.apiSeedancePollEndpoint.value.trim();
  state.config.model = els.apiSeedanceModelName.value.trim() || "seedance-2-0";
  state.config.wpTitle = els.apiSeedanceWpTitle.value.trim() || "demo-app";
  state.config.extraHeaders = els.apiSeedanceExtraHeaders.value.trim();
  state.image2Config.apiKey = els.image2ApiKey.value;
  state.image2Config.endpoint = els.image2Endpoint.value.trim();
  state.image2Config.model = els.image2ModelName.value.trim() || "gpt-image-2";
  state.image2Config.wpTitle = els.image2WpTitle.value.trim() || "demo-app";
  state.image2Config.extraHeaders = els.image2ExtraHeaders.value.trim();
  state.apiProxy = {
    ...(state.apiProxy || {}),
    enabled: Boolean(els.apiProxyEnabled.checked),
    baseUrl: els.apiProxyBaseUrl.value.trim()
  };
}

function serializeWorkspace(options = {}) {
  const snapshot = {
    ...state,
    activeInput: null,
    responseLog: [],
    ui: {
      ...state.ui,
      nodeMenuOpen: false,
      connectingFrom: "",
      connectionPreview: null,
      connectionTargetId: "",
      contextMenu: {
        ...(state.ui.contextMenu || {}),
        open: false
      }
    }
  };
  if (!options.includeSecrets) {
    snapshot.config = { ...snapshot.config, apiKey: "" };
    snapshot.image2Config = { ...snapshot.image2Config, apiKey: "" };
  }
  return snapshot;
}

function lightweightMeta(snapshot) {
  return {
    version: 3,
    savedAt: new Date().toISOString(),
    storage: "indexeddb",
    activeCanvasId: snapshot.activeCanvasId,
    selectedNodeId: snapshot.selectedNodeId,
    selectedConnectionId: snapshot.selectedConnectionId,
    canvasCount: snapshot.canvases?.length || 0,
    nodeCount: (snapshot.canvases || []).reduce((count, canvas) => count + (canvas.nodes?.length || 0), 0)
  };
}

function openWorkspaceDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
  });
}

async function writeWorkspaceToIndexedDb(snapshot) {
  const db = await openWorkspaceDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put({
      id: WORKSPACE_RECORD_ID,
      snapshot,
      savedAt: new Date().toISOString()
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Failed to write workspace."));
  });
  db.close();
}

async function readWorkspaceFromIndexedDb() {
  const db = await openWorkspaceDb();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(WORKSPACE_RECORD_ID);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Failed to read workspace."));
  });
  db.close();
  return record?.snapshot || null;
}

function saveWorkspace(showMessage = false) {
  const snapshot = serializeWorkspace({ includeSecrets: true });
  const meta = lightweightMeta(snapshot);
  try {
    localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
    const raw = JSON.stringify(snapshot);
    if (raw.length <= LOCAL_STORAGE_FALLBACK_LIMIT) {
      localStorage.setItem(STORAGE_KEY, raw);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    pushResponse("workspace.localStorage.warn", { error: error instanceof Error ? error.message : String(error) });
  }
  writeWorkspaceToIndexedDb(snapshot)
    .then(updateStorageStatus)
    .catch((error) => {
      pushResponse("workspace.indexedDB.error", { error: error instanceof Error ? error.message : String(error) });
      updateStorageStatus();
    });
  if (showMessage) pushResponse("workspace.saved", { canvases: state.canvases.length });
}

function applyWorkspaceSnapshot(saved) {
  if (!saved) return false;
  state.config = { ...DEFAULT_CONFIG, ...(saved.config || {}) };
  state.image2Config = { ...DEFAULT_IMAGE2_CONFIG, ...(saved.image2Config || {}) };
  state.apiProxy = { enabled: false, baseUrl: "", ...(saved.apiProxy || {}) };
  state.canvases = Array.isArray(saved.canvases) ? saved.canvases : [];
  state.activeCanvasId = saved.activeCanvasId || "";
  state.selectedNodeId = saved.selectedNodeId || "";
  state.selectedConnectionId = saved.selectedConnectionId || "";
  state.ui = {
    ...state.ui,
    ...(saved.ui || {}),
    nodeMenuOpen: false,
    connectingFrom: "",
    connectionPreview: null,
    connectionTargetId: "",
    contextMenu: { ...state.ui.contextMenu, open: false }
  };
  return true;
}

async function loadWorkspace() {
  try {
    const saved = await readWorkspaceFromIndexedDb();
    if (applyWorkspaceSnapshot(saved)) return;
  } catch (error) {
    pushResponse("workspace.indexedDB.load.warn", { error: error instanceof Error ? error.message : String(error) });
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    applyWorkspaceSnapshot(JSON.parse(raw));
  } catch (error) {
    state.canvases = [];
    pushResponse("workspace.localStorage.load.warn", { error: error instanceof Error ? error.message : String(error) });
  }
}

function ensureWorkspace() {
  if (!state.canvases.length) {
    const canvas = defaultCanvas();
    state.canvases = [canvas];
    state.activeCanvasId = canvas.id;
    state.selectedNodeId = canvas.nodes[0]?.id || "";
  }
  for (const canvas of state.canvases) {
    if (!canvas.view) canvas.view = { zoom: 1, panX: 80, panY: 60 };
    if (!Array.isArray(canvas.connections)) canvas.connections = [];
    for (const node of canvas.nodes) {
      if (!node.type) node.type = "seedance-input";
      if (node.type === "seedance-input") node.params = { ...DEFAULT_NODE_PARAMS, ...(node.params || {}) };
      if (node.type === "image2-input") {
        node.params = { ...DEFAULT_IMAGE2_PARAMS, ...(node.params || {}) };
        node.image2ReferenceImageUrls = node.image2ReferenceImageUrls || node.referenceImageUrls || node.referenceImageUrl || "";
        if (node.generating && !activeImage2Generations.has(node.id)) node.generating = false;
        node.inputBindings = node.inputBindings || {};
      }
    }
  }
  if (!state.canvases.some((canvas) => canvas.id === state.activeCanvasId)) {
    state.activeCanvasId = state.canvases[0].id;
  }
  const canvas = getActiveCanvas();
  if (!canvas.nodes.some((node) => node.id === state.selectedNodeId)) {
    state.selectedNodeId = canvas.nodes[0]?.id || "";
  }
  if (!canvas.connections.some((connection) => connection.id === state.selectedConnectionId)) {
    state.selectedConnectionId = "";
  }
}

function render() {
  renderCanvasTabs();
  renderCanvas();
  renderInspector();
  renderRequestPreview();
  renderResponseLog();
  applyUiState();
  applyCanvasTransform();
  saveWorkspace();
}

function applyUiState() {
  if (els.nodeAddMenu) els.nodeAddMenu.hidden = !state.ui.nodeMenuOpen;
  if (els.canvasContextMenu) {
    els.canvasContextMenu.hidden = !state.ui.contextMenu?.open;
    els.canvasContextMenu.style.left = `${state.ui.contextMenu?.x || 0}px`;
    els.canvasContextMenu.style.top = `${state.ui.contextMenu?.y || 0}px`;
  }
}

function renderCanvasTabs() {
  els.canvasTabs.innerHTML = state.canvases.map((canvas) => {
    const active = canvas.id === state.activeCanvasId ? " active" : "";
    return `<button class="canvas-tab${active}" type="button" data-canvas-id="${canvas.id}">${escapeHtml(canvas.name)}</button>`;
  }).join("");
}

function applyCanvasTransform() {
  const canvas = getActiveCanvas();
  const view = canvas.view;
  els.canvasBoard.style.transform = `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`;
  els.zoomLabel.textContent = `${Math.round(view.zoom * 100)}%`;
}

function renderCanvas() {
  const canvas = getActiveCanvas();
  els.emptyState.style.display = canvas.nodes.length ? "none" : "grid";
  els.canvasBoard.classList.toggle("is-connecting", Boolean(state.ui.connectingFrom));
  els.canvasBoard.innerHTML = `${renderConnections(canvas)}${canvas.nodes.map(renderCanvasNode).join("")}`;
  const selectedNode = getSelectedNode();
  const selectedConnection = getSelectedConnection();
  els.duplicateNodeBtn.disabled = !selectedNode || (selectedNode.type !== "seedance-input" && selectedNode.type !== "image2-input");
  els.deleteNodeBtn.disabled = !selectedNode && !selectedConnection;
  els.deleteNodeBtn.textContent = selectedConnection && !selectedNode ? "删除连线" : "删除";
  applyCanvasTransform();
}

function outputAnchor(node) {
  return {
    x: node.x + nodeWidth(node),
    y: node.y + 118
  };
}

function inputAnchor(node) {
  return {
    x: node.x,
    y: node.y + 118
  };
}

function bezierPath(from, to) {
  const dx = Math.max(80, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

function renderConnections(canvas) {
  const connections = canvas.connections || [];
  const previewSource = state.ui.connectingFrom ? canvas.nodes.find((node) => node.id === state.ui.connectingFrom) : null;
  const previewTarget = previewSource && state.ui.connectionPreview
    ? state.ui.connectionPreview
    : previewSource ? outputAnchor(previewSource) : null;
  const paths = connections.map((connection) => {
    const source = canvas.nodes.find((node) => node.id === connection.from);
    const target = canvas.nodes.find((node) => node.id === connection.to);
    if (!source || !target) return "";
    const from = outputAnchor(source);
    const to = inputAnchor(target);
    const path = bezierPath(from, to);
    const selected = connection.id === state.selectedConnectionId ? " selected" : "";
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    return `
      <g class="connection-item${selected}" data-edge-id="${connection.id}">
        <path class="connection-hit" d="${path}" data-action="select-connection" data-edge-id="${connection.id}" />
        <path class="connection-path" d="${path}" />
        <g class="connection-remove" data-action="delete-connection" data-edge-id="${connection.id}" transform="translate(${midX} ${midY})" aria-label="删除连线">
          <circle r="12" />
          <text text-anchor="middle" dominant-baseline="central">×</text>
        </g>
      </g>
    `;
  }).join("");
  const previewPath = previewSource
    ? `<path class="connection-path connection-preview-path" d="${bezierPath(outputAnchor(previewSource), previewTarget)}" />`
    : "";
  return `<svg class="connection-layer" aria-hidden="true">${paths}${previewPath}</svg>`;
}

function renderConnectionsOnly() {
  const current = els.canvasBoard.querySelector(".connection-layer");
  const nextHtml = renderConnections(getActiveCanvas());
  if (!nextHtml) {
    current?.remove();
    return;
  }
  const template = document.createElement("template");
  template.innerHTML = nextHtml;
  const next = template.content.firstElementChild;
  if (current) current.replaceWith(next);
  else els.canvasBoard.prepend(next);
}

function countAssets(node) {
  return {
    images: Number(Boolean(node.firstFrameUrl)) + Number(Boolean(node.lastFrameUrl)) + splitLines(node.referenceImageUrls).length,
    videos: splitLines(node.referenceVideoUrls).length,
    audios: splitLines(node.referenceAudioUrls).length
  };
}

function renderNode(node) {
  return renderSeedanceCanvasNode(node);
  const selected = node.id === state.selectedNodeId ? " selected" : "";
  const counts = countAssets(node);
  const promptText = node.prompt || "Prompt 为空";
  if (!playable && errorMessage) {
    preview = `<div class="result-empty error-result"><strong>创建失败</strong><span>${escapeHtml(errorMessage)}</span></div>`;
  }
  const errorBlock = errorMessage
    ? `<div class="result-error"><strong>${escapeHtml(node.errorDetails?.code || "Error")}</strong><span>${escapeHtml(errorMessage)}</span></div>`
    : "";
  const suggestionBlock = suggestions.length
    ? `<div class="result-suggestions">${suggestions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";
  if (status === "failed" && errorMessage) {
    preview = `
      <div class="result-empty result-error">
        <strong>${escapeHtml(node.errorDetails?.code || "Generation failed")}</strong>
        <span>${escapeHtml(errorMessage)}</span>
        ${suggestions.length ? `<ul class="suggestion-list">${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </div>
    `;
  }
  return `
    <article class="node${selected}" data-node-id="${node.id}" style="left:${node.x}px; top:${node.y}px;">
      <div class="node-head" data-drag-handle="true">
        <div>
          <strong>${escapeHtml(node.title)}</strong>
          <span>text + image + video + audio -> video</span>
        </div>
        <span class="node-model">${escapeHtml(state.config.model)}</span>
        <button class="node-delete" type="button" data-action="delete-node" title="删除节点">×</button>
      </div>
      <div class="node-body">
        <button class="input-port prompt" type="button" data-input-field="prompt">
          <strong>Prompt / text 必填</strong>
          <span>${escapeHtml(promptText.slice(0, 80))}${promptText.length > 80 ? "..." : ""}</span>
        </button>
        <div class="port-grid">
          ${renderPort(node, "firstFrameUrl", "左侧输入: 首帧图", node.firstFrameUrl ? "已设置" : "点击上传或粘贴 URL")}
          ${renderPort(node, "lastFrameUrl", "右侧输入: 尾帧图", node.lastFrameUrl ? "已设置" : "点击上传或粘贴 URL")}
          ${renderPort(node, "referenceImageUrls", "下方输入: 参考图", `${splitLines(node.referenceImageUrls).length} / 9`)}
          ${renderPort(node, "referenceVideoUrls", "下方输入: 参考视频", `${counts.videos} / 3`)}
          ${renderPort(node, "referenceAudioUrls", "下方输入: 参考音频", `${counts.audios} / 3`)}
          <button class="input-port active" type="button" data-focus-params="true">
            <strong>任务参数</strong>
            <span>${node.params.ratio} / ${node.params.duration}s / ${node.params.resolution}</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderPort(node, field, label, detail) {
  const active = getResolvedFieldUrls(node, field).length ? " active" : "";
  return `
    <button class="input-port${active}" type="button" data-input-field="${field}">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(detail)}</span>
    </button>
  `;
}

function nodeWidth(node) {
  return node?.type === "video-result" || node?.type === "image-result" ? 360 : 344;
}

function connectionClass(node) {
  if (!state.ui.connectingFrom) return "";
  if (state.ui.connectingFrom === node.id) return " connection-source";
  return " connection-candidate";
}

function renderNodeConnector() {
  return `<button class="node-connector" type="button" data-action="connector" title="连接节点" aria-label="连接节点">+</button>`;
}

function renderCanvasNode(node) {
  if (node.type === "video-result") return renderResultCanvasNode(node);
  if (node.type === "image-result") return renderImageResultCanvasNode(node);
  if (node.type === "image2-input") return renderImage2CanvasNode(node);
  return renderSeedanceCanvasNode(node);
}

function renderSeedanceCanvasNode(node) {
  const selected = node.id === state.selectedNodeId ? " selected" : "";
  const counts = countAssets(node);
  const promptText = node.prompt || "Prompt is empty";
  return `
    <article class="node${selected}${connectionClass(node)}" data-node-id="${node.id}" style="left:${node.x}px; top:${node.y}px;">
      <div class="node-head" data-drag-handle="true">
        <div>
          <strong>${escapeHtml(node.title)}</strong>
          <span>text + image + video + audio -> video</span>
        </div>
        <span class="node-model">${escapeHtml(state.config.model)}</span>
        <button class="node-delete" type="button" data-action="delete-node" title="删除节点">x</button>
      </div>
      ${renderNodeConnector(node)}
      <div class="node-body">
        <button class="input-port prompt" type="button" data-input-field="prompt">
          <strong>Prompt / text 必填</strong>
          <span>${escapeHtml(promptText.slice(0, 80))}${promptText.length > 80 ? "..." : ""}</span>
        </button>
        <div class="port-grid">
          ${renderPort(node, "firstFrameUrl", "左侧输入: 首帧图", node.firstFrameUrl ? "已设置" : "点击上传或粘贴 URL")}
          ${renderPort(node, "lastFrameUrl", "右侧输入: 尾帧图", node.lastFrameUrl ? "已设置" : "点击上传或粘贴 URL")}
          ${renderPort(node, "referenceImageUrls", "下方输入: 参考图", `${splitLines(node.referenceImageUrls).length} / 9`)}
          ${renderPort(node, "referenceVideoUrls", "下方输入: 参考视频", `${counts.videos} / 3`)}
          ${renderPort(node, "referenceAudioUrls", "下方输入: 参考音频", `${counts.audios} / 3`)}
          <button class="input-port active" type="button" data-focus-params="true">
            <strong>任务参数</strong>
            <span>${node.params.ratio} / ${node.params.duration}s / ${node.params.resolution}</span>
          </button>
        </div>
        <div class="node-actions">
          <button type="button" data-action="create-task">创建任务</button>
          <button class="ghost-btn" type="button" data-action="poll-task" ${node.lastTaskId ? "" : "disabled"}>轮询</button>
        </div>
      </div>
    </article>
  `;
}

function renderImage2CanvasNode(node) {
  const selected = node.id === state.selectedNodeId ? " selected" : "";
  const promptText = node.prompt || "Prompt is empty";
  const referenceCount = getResolvedFieldUrls(node, "image2ReferenceImageUrls").length;
  const maskCount = getResolvedFieldUrls(node, "maskUrl").length;
  const generating = Boolean(node.generating || activeImage2Generations.has(node.id));
  return `
    <article class="node image2-node${selected}${connectionClass(node)}" data-node-id="${node.id}" style="left:${node.x}px; top:${node.y}px;">
      <div class="node-head" data-drag-handle="true">
        <div>
          <strong>${escapeHtml(node.title)}</strong>
          <span>text + images ${referenceCount}/${IMAGE2_API_LIMITS.referenceImages} + mask ${maskCount}/${IMAGE2_API_LIMITS.masks} -> image</span>
        </div>
        <span class="node-model">${escapeHtml(state.image2Config.model || "gpt-image-2")}</span>
        <button class="node-delete" type="button" data-action="delete-node" title="删除节点">x</button>
      </div>
      ${renderNodeConnector(node)}
      <div class="node-body">
        <button class="input-port prompt" type="button" data-input-field="prompt">
          <strong>Prompt / image text</strong>
          <span>${escapeHtml(promptText.slice(0, 80))}${promptText.length > 80 ? "..." : ""}</span>
        </button>
        <div class="port-grid">
          ${renderPort(node, "image2ReferenceImageUrls", "参考图输入", `${referenceCount} / ${IMAGE2_API_LIMITS.referenceImages}`)}
          ${renderPort(node, "maskUrl", "Mask 输入", `${maskCount} / ${IMAGE2_API_LIMITS.masks}`)}
          <button class="input-port active" type="button" data-focus-params="true">
            <strong>图片参数</strong>
            <span>${node.params.size} / ${node.params.quality} / ${node.params.output_format}</span>
          </button>
        </div>
        <div class="node-actions">
          <button type="button" data-action="create-task" ${generating ? "disabled" : ""}>${generating ? "生成中" : "生成图片"}</button>
        </div>
      </div>
    </article>
  `;
}

function renderResultCanvasNode(node) {
  const selected = node.id === state.selectedNodeId ? " selected" : "";
  const status = node.status || "pending";
  const videoUrl = node.videoUrl || "";
  const playable = videoUrl && !videoUrl.startsWith("mock://");
  const errorMessage = node.errorMessage || node.errorDetails?.message || "";
  const suggestions = node.errorDetails?.suggestions || [];
  let preview = playable
    ? `<video class="video-preview" src="${escapeHtml(videoUrl)}" controls preload="metadata"></video>`
    : `<div class="result-empty"><strong>${escapeHtml(statusText(status))}</strong><span>${escapeHtml(videoUrl || "等待任务返回视频地址")}</span></div>`;
  if (!playable && errorMessage) {
    preview = `<div class="result-empty error-result"><strong>创建失败</strong><span>${escapeHtml(errorMessage)}</span></div>`;
  }
  const errorBlock = errorMessage
    ? `<div class="result-error"><strong>${escapeHtml(node.errorDetails?.code || "Error")}</strong><span>${escapeHtml(errorMessage)}</span></div>`
    : "";
  const suggestionBlock = suggestions.length
    ? `<div class="result-suggestions">${suggestions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";
  return `
    <article class="node result-node${selected}${connectionClass(node)}" data-node-id="${node.id}" style="left:${node.x}px; top:${node.y}px;">
      <div class="node-head" data-drag-handle="true">
        <div>
          <strong>${escapeHtml(node.title || "视频结果")}</strong>
          <span>${escapeHtml(node.taskId || "未创建任务")}</span>
        </div>
        <span class="status-pill status-${escapeHtml(status)}">${escapeHtml(statusText(status))}</span>
        <button class="node-delete" type="button" data-action="delete-node" title="删除节点">x</button>
      </div>
      ${renderNodeConnector(node)}
      <div class="node-body">
        ${renderResultPreview(node, status, videoUrl, playable)}
        ${errorBlock}
        ${suggestionBlock}
        ${node.lastFrameImage ? `<div class="last-frame-link">尾帧: ${escapeHtml(node.lastFrameImage)}</div>` : ""}
        <div class="node-actions">
          <button class="ghost-btn" type="button" data-action="poll-result" ${node.taskId ? "" : "disabled"}>轮询</button>
          ${playable ? `<a class="open-link" href="${escapeHtml(videoUrl)}" target="_blank" rel="noreferrer">打开视频</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderImageResultCanvasNode(node) {
  const selected = node.id === state.selectedNodeId ? " selected" : "";
  const status = node.status || "succeeded";
  const imageUrl = node.imageUrl || "";
  const errorMessage = node.errorMessage || node.errorDetails?.message || "";
  const suggestions = node.errorDetails?.suggestions || [];
  const preview = (() => {
    if (status === "failed" && errorMessage) {
      return `
        <div class="result-empty result-error">
          <strong>${escapeHtml(node.errorDetails?.code || "生成失败")}</strong>
          <span>${escapeHtml(errorMessage)}</span>
          ${suggestions.length ? `<ul class="suggestion-list">${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        </div>
      `;
    }
    if (imageUrl) return `<img class="image-preview" src="${escapeHtml(imageUrl)}" alt="generated image" />`;
    return `<div class="result-empty"><strong>${escapeHtml(statusText(status))}</strong><span>${status === "running" ? "正在生成图片，请稍等。" : "等待图片地址"}</span></div>`;
  })();
  return `
    <article class="node result-node image-result-node${selected}${connectionClass(node)}" data-node-id="${node.id}" style="left:${node.x}px; top:${node.y}px;">
      <div class="node-head" data-drag-handle="true">
        <div>
          <strong>${escapeHtml(node.title || "图片结果")}</strong>
          <span>${escapeHtml(imageUrl || "等待图片地址")}</span>
        </div>
        <span class="status-pill status-${escapeHtml(status)}">${escapeHtml(statusText(status))}</span>
        <button class="node-delete" type="button" data-action="delete-node" title="删除节点">x</button>
      </div>
      ${renderNodeConnector(node)}
      <div class="node-body">
        ${preview}
        <div class="node-actions">
          ${imageUrl ? `<a class="open-link" href="${escapeHtml(imageUrl)}" target="_blank" rel="noreferrer">打开图片</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderResultPreview(node, status, videoUrl, playable) {
  const errorMessage = node.errorMessage || node.errorDetails?.message || "";
  const suggestions = node.errorDetails?.suggestions || [];
  if (status === "failed" && errorMessage) {
    return `
      <div class="result-empty result-error">
        <strong>${escapeHtml(node.errorDetails?.code || "Generation failed")}</strong>
        <span>${escapeHtml(errorMessage)}</span>
        ${suggestions.length ? `<ul class="suggestion-list">${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </div>
    `;
  }
  if (playable) {
    return `<video class="video-preview" src="${escapeHtml(videoUrl)}" controls preload="metadata"></video>`;
  }
  return `<div class="result-empty"><strong>${escapeHtml(statusText(status))}</strong><span>${escapeHtml(videoUrl || "Waiting for video URL")}</span></div>`;
}

function statusText(status) {
  const map = {
    created: "已创建",
    pending: "排队中",
    running: "生成中",
    succeeded: "已完成",
    failed: "失败",
    mocked: "Mock"
  };
  return map[status] || status || "未知";
}

function renderInspector() {
  const node = getSelectedNode();
  const connection = getSelectedConnection();
  els.inspectorEmpty.style.display = node || connection ? "none" : "block";
  els.nodeSummary.style.display = node || connection ? "grid" : "none";
  els.paramEditor.style.display = node ? "grid" : "none";
  els.selectedNodeLabel.textContent = node ? node.title : connection ? "已选择连线" : "未选择节点";
  if (!node && connection) {
    const canvas = getActiveCanvas();
    const source = canvas.nodes.find((item) => item.id === connection.from);
    const target = canvas.nodes.find((item) => item.id === connection.to);
    els.nodeSummary.innerHTML = `
      <div class="summary-row"><span>来源</span><strong>${escapeHtml(source?.title || connection.from)}</strong></div>
      <div class="summary-row"><span>目标</span><strong>${escapeHtml(target?.title || connection.to)}</strong></div>
      <div class="summary-row"><span>映射</span><strong>${escapeHtml(connection.mapping || "未指定")}</strong></div>
    `;
    els.paramEditor.innerHTML = "";
    return;
  }
  if (!node) {
    els.nodeSummary.innerHTML = "";
    els.paramEditor.innerHTML = "";
    return;
  }

  if (node.type === "image-result") {
    els.paramEditor.style.display = "none";
    els.nodeSummary.innerHTML = `
      <div class="summary-row"><span>Status</span><strong>${escapeHtml(statusText(node.status))}</strong></div>
      <div class="summary-row"><span>Result ID</span><strong>${escapeHtml(node.taskId || "-")}</strong></div>
      <div class="summary-row"><span>Output</span><strong>${node.imageUrl ? "Ready" : "Waiting"}</strong></div>
      ${node.errorMessage ? `<div class="summary-row"><span>Error</span><strong>${escapeHtml(node.errorDetails?.code || "Failed")}</strong></div>` : ""}
    `;
    return;
  }

  if (node.type === "video-result") {
    els.paramEditor.style.display = "none";
    els.nodeSummary.innerHTML = `
      <div class="summary-row"><span>Status</span><strong>${escapeHtml(statusText(node.status))}</strong></div>
      <div class="summary-row"><span>Task ID</span><strong>${escapeHtml(node.taskId || "-")}</strong></div>
      <div class="summary-row"><span>Output</span><strong>${node.videoUrl ? "Ready" : "Waiting"}</strong></div>
      <div class="summary-row"><span>Last frame</span><strong>${node.lastFrameImage ? "Ready" : "None"}</strong></div>
      ${node.errorMessage ? `<div class="summary-row"><span>Error</span><strong>${escapeHtml(node.errorDetails?.code || "Failed")}</strong></div>` : ""}
    `;
    return;
  }

  if (node.type === "image2-input") {
    const referenceCount = getResolvedFieldUrls(node, "image2ReferenceImageUrls").length;
    const maskCount = getResolvedFieldUrls(node, "maskUrl").length;
    els.nodeSummary.innerHTML = `
      <label>
        <span>节点名称</span>
        <input data-node-title value="${escapeHtml(node.title)}" />
      </label>
      <div class="summary-row"><span>Prompt</span><strong>${node.prompt.trim() ? "已填写" : "未填写"}</strong></div>
      <div class="summary-row"><span>参考图</span><strong>${referenceCount} / ${IMAGE2_API_LIMITS.referenceImages}</strong></div>
      <div class="summary-row"><span>Mask</span><strong>${maskCount ? "1 / 1" : "0 / 1"}</strong></div>
    `;
    els.paramEditor.innerHTML = `
      ${renderConnectionEditor(node)}
      <div class="two-col">
        <label>
          <span>size</span>
          <select data-param="size">
            ${["1024x1024", "1536x1024", "1024x1536", "auto"].map((value) => `<option ${node.params.size === value ? "selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>quality</span>
          <select data-param="quality">
            ${["high", "medium", "low", "auto"].map((value) => `<option ${node.params.quality === value ? "selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>n</span>
          <input data-param="n" type="number" min="1" max="4" value="${escapeHtml(node.params.n)}" />
        </label>
        <label>
          <span>output_format</span>
          <select data-param="output_format">
            ${["png", "jpeg", "webp"].map((value) => `<option ${node.params.output_format === value ? "selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>background</span>
          <select data-param="background">
            ${["auto", "transparent", "opaque"].map((value) => `<option ${node.params.background === value ? "selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>moderation</span>
          <select data-param="moderation">
            ${["auto", "low"].map((value) => `<option ${node.params.moderation === value ? "selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
      </div>
      <label>
        <span>output_compression</span>
        <input data-param="output_compression" type="number" min="1" max="100" value="${escapeHtml(node.params.output_compression)}" placeholder="jpeg / webp only" />
      </label>
      <label>
        <span>user</span>
        <input data-param="user" value="${escapeHtml(node.params.user)}" />
      </label>
    `;
    bindInspectorInputs();
    return;
  }

  const counts = countAssets(node);
  els.nodeSummary.innerHTML = `
    <label>
      <span>节点名称</span>
      <input data-node-title value="${escapeHtml(node.title)}" />
    </label>
    <div class="summary-row"><span>Prompt</span><strong>${node.prompt.trim() ? "已填写" : "未填写"}</strong></div>
    <div class="summary-row"><span>图片</span><strong>${counts.images} / 9</strong></div>
    <div class="summary-row"><span>视频</span><strong>${counts.videos} / 3</strong></div>
    <div class="summary-row"><span>音频</span><strong>${counts.audios} / 3</strong></div>
  `;

  els.paramEditor.innerHTML = `
    ${renderConnectionEditor(node)}
    <div class="two-col">
      <label>
        <span>ratio</span>
        <select data-param="ratio">
          ${["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"].map((value) => `<option ${node.params.ratio === value ? "selected" : ""}>${value}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>duration</span>
        <input data-param="duration" type="number" min="4" max="15" value="${escapeHtml(node.params.duration)}" />
      </label>
      <label>
        <span>resolution</span>
        <select data-param="resolution">
          ${["480p", "720p"].map((value) => `<option ${node.params.resolution === value ? "selected" : ""}>${value}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>logo_add</span>
        <select data-param="logo_add">
          <option value="" ${node.params.logo_add === "" ? "selected" : ""}>跟随 watermark</option>
          <option value="0" ${node.params.logo_add === "0" ? "selected" : ""}>0 / 关闭</option>
          <option value="1" ${node.params.logo_add === "1" ? "selected" : ""}>1 / 开启</option>
        </select>
      </label>
    </div>
    ${renderSwitch("generate_audio", "generate_audio / 同步音频", node.params.generate_audio)}
    ${renderSwitch("camera_fixed", "camera_fixed / 固定机位", node.params.camera_fixed)}
    ${renderSwitch("watermark", "watermark / AI 水印", node.params.watermark)}
    ${renderSwitch("return_last_frame", "return_last_frame / 返回尾帧", node.params.return_last_frame)}
    <label>
      <span>callback_url</span>
      <input data-param="callback_url" value="${escapeHtml(node.params.callback_url)}" placeholder="https://your-server/callback" />
    </label>
  `;

  bindInspectorInputs();
}

function renderSwitch(field, label, checked) {
  return `
    <label class="switch-row">
      <span>${label}</span>
      <input data-param="${field}" type="checkbox" ${checked ? "checked" : ""} />
    </label>
  `;
}

function getIncomingConnections(nodeId) {
  const canvas = getActiveCanvas();
  return (canvas.connections || []).filter((connection) => connection.to === nodeId);
}

function getNodeOutput(node) {
  if (!node) return { type: "unknown", url: "" };
  if (node.type === "image-result") return { type: "image", url: node.imageUrl || "" };
  if (node.type === "video-result") {
    if (node.lastFrameImage) return { type: "image", url: node.lastFrameImage };
    return { type: "video", url: node.videoUrl || "" };
  }
  return { type: "node", url: "" };
}

function mappingOptionsForConnection(sourceNode, targetNode) {
  const output = getNodeOutput(sourceNode);
  const options = [{ value: "", label: "不引用上游输出" }];
  if (targetNode.type === "seedance-input") {
    if (output.type === "image") {
      options.push(
        { value: "firstFrameUrl", label: "作为首帧图" },
        { value: "lastFrameUrl", label: "作为尾帧图" },
        { value: "referenceImageUrls", label: "作为参考图" }
      );
    }
    if (output.type === "video") options.push({ value: "referenceVideoUrls", label: "作为参考视频" });
  }
  if (targetNode.type === "image2-input" && output.type === "image") {
    options.push(
      { value: "image2ReferenceImageUrls", label: "作为参考图" },
      { value: "maskUrl", label: "作为 Mask" }
    );
  }
  return options;
}

function renderConnectionEditor(node) {
  const incoming = getIncomingConnections(node.id);
  if (!incoming.length) return "";
  const canvas = getActiveCanvas();
  return `
    <section class="connection-editor">
      <h3>上游输入</h3>
      ${incoming.map((connection) => {
        const source = canvas.nodes.find((item) => item.id === connection.from);
        const output = getNodeOutput(source);
        const options = mappingOptionsForConnection(source, node);
        return `
          <label>
            <span>${escapeHtml(source?.title || "上游节点")} · ${escapeHtml(output.url || "暂无输出")}</span>
            <select data-connection-map="${connection.id}">
              ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${connection.mapping === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
            </select>
          </label>
        `;
      }).join("")}
    </section>
  `;
}

function bindInspectorInputs() {
  const titleInput = els.nodeSummary.querySelector("[data-node-title]");
  if (titleInput) {
    titleInput.addEventListener("input", () => {
      const node = getSelectedNode();
      if (!node) return;
      node.title = titleInput.value;
      renderCanvas();
      renderRequestPreview();
      saveWorkspace();
    });
  }
  $$("#paramEditor [data-param]").forEach((input) => {
    input.addEventListener("input", () => {
      const node = getSelectedNode();
      if (!node) return;
      const key = input.dataset.param;
      if (input.type === "checkbox") node.params[key] = input.checked;
      else if (key === "duration" || key === "n") node.params[key] = Number(input.value);
      else node.params[key] = input.value;
      renderCanvas();
      renderRequestPreview();
      saveWorkspace();
    });
  });
  $$("#paramEditor [data-connection-map]").forEach((input) => {
    input.addEventListener("input", () => {
      const canvas = getActiveCanvas();
      const connection = (canvas.connections || []).find((item) => item.id === input.dataset.connectionMap);
      if (!connection) return;
      connection.mapping = input.value;
      renderCanvas();
      renderRequestPreview();
      saveWorkspace();
    });
  });
}

function getFieldUrls(node, field) {
  if (field === "firstFrameUrl" || field === "lastFrameUrl" || field === "referenceImageUrl" || field === "maskUrl") {
    return node[field] ? [node[field]] : [];
  }
  return splitLines(node[field]);
}

function setFieldUrls(node, field, urls) {
  const clean = urls.map((url) => String(url || "").trim()).filter(Boolean);
  if (field === "firstFrameUrl" || field === "lastFrameUrl" || field === "referenceImageUrl" || field === "maskUrl") {
    node[field] = clean[0] || "";
  } else {
    node[field] = joinLines(clean);
  }
}

function getMappedUrls(node, field) {
  const canvas = getActiveCanvas();
  return getIncomingConnections(node.id)
    .filter((connection) => connection.mapping === field)
    .map((connection) => getNodeOutput(canvas.nodes.find((item) => item.id === connection.from)).url)
    .filter(Boolean);
}

function getResolvedFieldUrl(node, field) {
  return getFieldUrls(node, field)[0] || getMappedUrls(node, field)[0] || "";
}

function getResolvedFieldUrls(node, field) {
  return [...getFieldUrls(node, field), ...getMappedUrls(node, field)];
}

function limitUrlsForMeta(urls, meta) {
  if (meta.single) return urls.slice(0, 1);
  if (meta.maxCount) return urls.slice(0, meta.maxCount);
  return urls;
}

function openInputSheet(nodeId, field) {
  const canvas = getActiveCanvas();
  const node = canvas.nodes.find((item) => item.id === nodeId);
  const meta = INPUT_META[field];
  if (!node || !meta) return;
  selectNode(node.id);
  state.activeInput = { nodeId, field };
  els.inputSheetEyebrow.textContent = meta.eyebrow;
  els.inputSheetTitle.textContent = meta.title;
  els.inputOverlay.hidden = false;
  renderInputSheet();
  renderCanvas();
  renderInspector();
  renderRequestPreview();
}

function closeInputSheet() {
  state.activeInput = null;
  els.inputOverlay.hidden = true;
}

function renderInputSheet() {
  const node = getSelectedNode();
  const field = state.activeInput?.field;
  const meta = INPUT_META[field];
  if (!node || !meta) return;

  if (meta.kind === "text") {
    els.inputSheetBody.innerHTML = `
      <p class="hint-text">${escapeHtml(meta.description)}</p>
      <label>
        <span>Prompt / positive text</span>
        <textarea id="sheetPrompt" rows="6">${escapeHtml(node.prompt)}</textarea>
      </label>
      <label>
        <span>Negative text</span>
        <textarea id="sheetNegativePrompt" rows="4">${escapeHtml(node.negativePrompt)}</textarea>
      </label>
      <div class="inline-actions">
        <button id="savePromptBtn" type="button">保存 Prompt</button>
      </div>
    `;
    $("#savePromptBtn").addEventListener("click", () => {
      node.prompt = $("#sheetPrompt").value;
      node.negativePrompt = $("#sheetNegativePrompt").value;
      renderCanvas();
      renderInspector();
      renderRequestPreview();
      saveWorkspace();
    });
    return;
  }

  const urls = getFieldUrls(node, field);
  els.inputSheetBody.innerHTML = `
    <p class="hint-text">${escapeHtml(meta.description)}</p>
    <div id="dropZone" class="drop-zone">
      <strong>拖拽、选择或粘贴${escapeHtml(meta.typeLabel)}</strong>
      <span>支持 Ctrl+V / Cmd+V 粘贴截图或复制的图片。本地文件会保存到浏览器缓存；真实 API 若要求公网资源，请粘贴互联网 URL。</span>
      <input id="assetFileInput" type="file" ${meta.single ? "" : "multiple"} accept="${escapeHtml(meta.accept)}" hidden />
      <button id="pickFileBtn" class="ghost-btn" type="button">选择本地文件</button>
    </div>
    <label>
      <span>互联网 URL</span>
      <input id="internetUrlInput" placeholder="https://example.com/asset.png" />
    </label>
    <div class="inline-actions">
      <button id="addUrlBtn" type="button">添加 URL</button>
      <button id="clearAssetsBtn" class="ghost-btn" type="button">清空当前输入</button>
    </div>
    <div id="assetList" class="asset-list"></div>
  `;
  bindAssetSheet(meta, node, field);
  renderAssetList(node, field);
}

function bindAssetSheet(meta, node, field) {
  const dropZone = $("#dropZone");
  const fileInput = $("#assetFileInput");
  $("#pickFileBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    await uploadAndAttachFiles(Array.from(fileInput.files || []), node, field, meta);
    fileInput.value = "";
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
    await uploadAndAttachFiles(Array.from(event.dataTransfer.files || []), node, field, meta);
  });
  $("#addUrlBtn").addEventListener("click", () => {
    const input = $("#internetUrlInput");
    const url = input.value.trim();
    if (!url) return;
    const urls = getFieldUrls(node, field);
    setFieldUrls(node, field, limitUrlsForMeta(meta.single ? [url] : [...urls, url], meta));
    input.value = "";
    afterInputMutation(node, field);
  });
  $("#clearAssetsBtn").addEventListener("click", () => {
    setFieldUrls(node, field, []);
    afterInputMutation(node, field);
  });
}

async function handleAssetPaste(event) {
  if (els.inputOverlay.hidden) return;
  const { nodeId, field } = state.activeInput || {};
  const node = getNodeById(nodeId);
  const meta = INPUT_META[field];
  if (!node || !meta || meta.kind !== "asset" || !acceptsImage(meta)) return;
  const files = clipboardImageFiles(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  await uploadAndAttachFiles(files, node, field, meta, { source: "clipboard" });
}

function acceptsImage(meta) {
  return String(meta.accept || "").split(",").some((part) => part.trim().toLowerCase().startsWith("image/"));
}

function clipboardImageFiles(clipboardData) {
  const itemFiles = Array.from(clipboardData?.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file) => file?.type?.startsWith("image/"));
  const directFiles = Array.from(clipboardData?.files || [])
    .filter((file) => file?.type?.startsWith("image/"));
  return [...itemFiles, ...directFiles].filter((file, index, files) =>
    files.findIndex((item) => item.name === file.name && item.size === file.size && item.type === file.type) === index
  );
}

async function uploadAndAttachFiles(files, node, field, meta, options = {}) {
  if (!files.length) return;
  const uploadedUrls = await Promise.all(files.map(fileToDataUrl));
  const urls = getFieldUrls(node, field);
  setFieldUrls(node, field, limitUrlsForMeta(meta.single ? uploadedUrls.slice(0, 1) : [...urls, ...uploadedUrls], meta));
  pushResponse("asset.local", {
    source: options.source || "file",
    files: files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    note: "本地文件已写入浏览器缓存；如真实 API 不支持 data URL，请改用公网 URL。"
  });
  afterInputMutation(node, field);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function afterInputMutation(node, field) {
  renderAssetList(node, field);
  renderCanvas();
  renderInspector();
  renderRequestPreview();
  saveWorkspace();
}

function renderAssetList(node, field) {
  const list = $("#assetList");
  if (!list) return;
  const urls = getFieldUrls(node, field);
  if (!urls.length) {
    list.innerHTML = `<div class="validation-item">当前输入为空。</div>`;
    return;
  }
  list.innerHTML = urls.map((url, index) => `
    <div class="asset-row">
      <code title="${escapeHtml(compactDisplayValue(url))}">${escapeHtml(compactDisplayValue(url))}</code>
      <button class="ghost-btn" type="button" data-remove-url="${index}">移除</button>
    </div>
  `).join("");
  list.querySelectorAll("[data-remove-url]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = urls.filter((_, index) => index !== Number(button.dataset.removeUrl));
      setFieldUrls(node, field, next);
      afterInputMutation(node, field);
    });
  });
}

function buildRequest(node) {
  const content = [];
  const prompt = String(node.prompt || "").trim();
  const negative = String(node.negativePrompt || "").trim();
  if (prompt) content.push({ type: "text", text: prompt });
  if (negative) content.push({ type: "text", text: `Negative prompt: ${negative}` });
  const firstFrameUrl = getResolvedFieldUrl(node, "firstFrameUrl");
  const lastFrameUrl = getResolvedFieldUrl(node, "lastFrameUrl");
  if (firstFrameUrl.trim()) content.push({ type: "image_url", image_url: { url: firstFrameUrl.trim() }, role: "first_frame" });
  if (lastFrameUrl.trim()) content.push({ type: "image_url", image_url: { url: lastFrameUrl.trim() }, role: "last_frame" });
  getResolvedFieldUrls(node, "referenceImageUrls").forEach((url) => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
  getResolvedFieldUrls(node, "referenceVideoUrls").forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
  getResolvedFieldUrls(node, "referenceAudioUrls").forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));

  const request = {
    model: state.config.model || "seedance-2-0",
    content,
    ratio: node.params.ratio,
    duration: Number(node.params.duration),
    resolution: node.params.resolution,
    generate_audio: Boolean(node.params.generate_audio),
    camera_fixed: Boolean(node.params.camera_fixed),
    watermark: Boolean(node.params.watermark),
    return_last_frame: Boolean(node.params.return_last_frame)
  };
  if (node.params.callback_url) request.callback_url = node.params.callback_url;
  if (node.params.logo_add !== "") request.logo_add = Number(node.params.logo_add);
  if (node.params.logo_param?.trim()) {
    try {
      request.logo_param = JSON.parse(node.params.logo_param);
    } catch {
      request.logo_param = node.params.logo_param;
    }
  }
  return request;
}

function buildImage2Request(node) {
  const referenceImageUrls = getResolvedFieldUrls(node, "image2ReferenceImageUrls").slice(0, IMAGE2_API_LIMITS.referenceImages);
  const request = {
    model: state.image2Config.model || "gpt-image-2",
    prompt: String(node.prompt || "").trim(),
    size: node.params.size,
    quality: node.params.quality,
    n: Number(node.params.n) || 1,
    output_format: node.params.output_format
  };
  if (node.params.output_compression !== "") request.output_compression = Number(node.params.output_compression);
  if (node.params.background && node.params.background !== "auto") request.background = node.params.background;
  if (node.params.moderation) request.moderation = node.params.moderation;
  if (node.params.user) request.user = node.params.user;
  if (referenceImageUrls.length) request.images = referenceImageUrls.map(imageReferencePayload);
  const maskUrl = getResolvedFieldUrl(node, "maskUrl");
  if (maskUrl) request.mask = imageReferencePayload(maskUrl);
  return request;
}

function imageReferencePayload(url) {
  if (/^file-[a-zA-Z0-9_-]+$/.test(url)) return { file_id: url };
  return { image_url: { url } };
}

function validateImage2Node(node, request) {
  const errors = [];
  const warnings = [];
  const referenceImageUrls = getResolvedFieldUrls(node, "image2ReferenceImageUrls");
  const maskUrls = getResolvedFieldUrls(node, "maskUrl");
  if (!request.prompt) errors.push("Prompt 不能为空。");
  if (!["1024x1024", "1536x1024", "1024x1536", "auto"].includes(request.size)) errors.push("size 不合法。");
  if (!["high", "medium", "low", "auto"].includes(request.quality)) errors.push("quality 不合法。");
  if (!Number.isInteger(request.n) || request.n < 1) errors.push("n 必须是正整数。");
  if (referenceImageUrls.length > IMAGE2_API_LIMITS.referenceImages) errors.push(`参考图不能超过 ${IMAGE2_API_LIMITS.referenceImages} 张。`);
  if (maskUrls.length > IMAGE2_API_LIMITS.masks) errors.push(`Mask 不能超过 ${IMAGE2_API_LIMITS.masks} 张。`);
  if (maskUrls.length && !referenceImageUrls.length) errors.push("Mask 需要搭配至少 1 张参考图，且会作用于第一张参考图。");
  if (request.background === "transparent" && !["png", "webp"].includes(request.output_format)) {
    warnings.push("transparent background 通常需要 png 或 webp。");
  }
  return { errors, warnings };
}

function validateNode(node, request) {
  const errors = [];
  const warnings = [];
  const promptTexts = request.content.filter((item) => item.type === "text");
  const images = request.content.filter((item) => item.type === "image_url");
  const firstLastImages = images.filter((item) => item.role === "first_frame" || item.role === "last_frame");
  const videos = request.content.filter((item) => item.type === "video_url");
  const audios = request.content.filter((item) => item.type === "audio_url");
  if (!promptTexts.some((item) => item.text.trim())) errors.push("至少需要 1 段非空 Prompt text。");
  promptTexts.forEach((item) => {
    if (item.text.length > 200) warnings.push(`${item.role || "text"} 超过 200 字符，建议拆短。`);
  });
  if (images.length > 9) errors.push("image_url 总数不能超过 9 张。");
  if (videos.length > 3) errors.push("video_url 不能超过 3 段。");
  if (audios.length > 3) errors.push("audio_url 不能超过 3 段。");
  if (videos.length && firstLastImages.length) errors.push("reference_video 不能与 first_frame / last_frame 同时提交。");
  if (audios.length && !images.length && !videos.length) errors.push("reference_audio 必须搭配 image_url 或 video_url。");
  if (!Number.isInteger(request.duration) || request.duration < 4 || request.duration > 15) errors.push("duration 必须是 4-15 的整数。");
  return { errors, warnings };
}

function renderRequestPreview() {
  const node = getSelectedNode();
  const connection = getSelectedConnection();
  if (!node && connection) {
    const canvas = getActiveCanvas();
    const source = canvas.nodes.find((item) => item.id === connection.from);
    const target = canvas.nodes.find((item) => item.id === connection.to);
    els.requestPreview.textContent = JSON.stringify({
      connectionId: connection.id,
      from: source?.title || connection.from,
      to: target?.title || connection.to,
      mapping: connection.mapping || ""
    }, null, 2);
    els.validationBox.innerHTML = `<div class="validation-item">已选择连线。点击线上 x、顶部删除，或按 Delete / Backspace 可删除。</div>`;
    els.copyRequestBtn.disabled = false;
    els.createTaskBtn.disabled = true;
    els.pollTaskBtn.disabled = true;
    return;
  }
  if (!node) {
    els.requestPreview.textContent = "";
    els.validationBox.innerHTML = "";
    els.copyRequestBtn.disabled = true;
    els.createTaskBtn.disabled = true;
    els.pollTaskBtn.disabled = true;
    return;
  }
  if (node.type === "video-result" || node.type === "image-result") {
    els.requestPreview.textContent = JSON.stringify({
      taskId: node.taskId,
      status: node.status,
      videoUrl: compactDisplayValue(node.videoUrl),
      imageUrl: compactDisplayValue(node.imageUrl),
      lastFrameImage: compactDisplayValue(node.lastFrameImage),
      errorMessage: node.errorMessage,
      errorDetails: node.errorDetails,
      usage: node.usage,
      raw: sanitizeForDisplay(node.raw)
    }, null, 2);
    els.validationBox.innerHTML = `<div class="validation-item">Video result node. Poll it from the canvas to refresh status.</div>`;
    els.copyRequestBtn.disabled = false;
    els.createTaskBtn.disabled = true;
    els.pollTaskBtn.disabled = !node.taskId;
    return;
  }
  if (node.type === "image2-input") {
    const request = buildImage2Request(node);
    const validation = validateImage2Node(node, request);
    const generating = Boolean(node.generating || activeImage2Generations.has(node.id));
    els.requestPreview.textContent = JSON.stringify(request, null, 2);
    els.validationBox.innerHTML = [
      ...validation.errors.map((text) => `<div class="validation-item error">${escapeHtml(text)}</div>`),
      ...validation.warnings.map((text) => `<div class="validation-item warn">${escapeHtml(text)}</div>`),
      generating ? `<div class="validation-item warn">图片正在生成中，结果会在画布上的 Image result 节点中更新。</div>` : "",
      validation.errors.length || validation.warnings.length || generating ? "" : `<div class="validation-item">图片请求校验通过。参考图最多 ${IMAGE2_API_LIMITS.referenceImages} 张，Mask 最多 ${IMAGE2_API_LIMITS.masks} 张。</div>`
    ].join("");
    els.copyRequestBtn.disabled = false;
    els.createTaskBtn.disabled = Boolean(validation.errors.length || generating);
    els.pollTaskBtn.disabled = true;
    return;
  }
  const request = buildRequest(node);
  const validation = validateNode(node, request);
  els.requestPreview.textContent = JSON.stringify(request, null, 2);
  els.validationBox.innerHTML = [
    ...validation.errors.map((text) => `<div class="validation-item error">${escapeHtml(text)}</div>`),
    ...validation.warnings.map((text) => `<div class="validation-item warn">${escapeHtml(text)}</div>`),
    validation.errors.length || validation.warnings.length ? "" : `<div class="validation-item">请求体校验通过，可以创建任务。</div>`
  ].join("");
  els.copyRequestBtn.disabled = false;
  els.createTaskBtn.disabled = Boolean(validation.errors.length);
  els.pollTaskBtn.disabled = !node.lastTaskId;
}

function pushResponse(label, payload) {
  state.responseLog.unshift({ time: new Date().toLocaleTimeString(), label, payload: sanitizeForDisplay(payload) });
  state.responseLog = state.responseLog.slice(0, 12);
  renderResponseLog();
}

function renderResponseLog() {
  els.responseLog.textContent = state.responseLog
    .map((entry) => `[${entry.time}] ${entry.label}\n${JSON.stringify(entry.payload, null, 2)}`)
    .join("\n\n");
}

function compactDisplayValue(value) {
  if (typeof value !== "string") return value;
  if (value.startsWith("data:") && value.length > 180) {
    return `${value.slice(0, 90)}... [${Math.round(value.length / 1024)} KB data URL]`;
  }
  if (value.length > 900) return `${value.slice(0, 420)}... [${value.length} chars]`;
  return value;
}

function sanitizeForDisplay(value, depth = 0) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return compactDisplayValue(value);
  if (depth > 4) return "[nested object]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeForDisplay(item, depth + 1));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "b64_json" && typeof item === "string") {
      output[key] = `[base64 omitted, ${Math.round(item.length / 1024)} KB]`;
    } else {
      output[key] = sanitizeForDisplay(item, depth + 1);
    }
  }
  return output;
}

async function updateStorageStatus() {
  if (!els.storageStatus) return;
  const meta = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_META_KEY) || "{}");
    } catch {
      return {};
    }
  })();
  const estimate = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => null) : null;
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const usedMb = estimate?.usage ? (estimate.usage / 1024 / 1024).toFixed(1) : "";
  const quotaMb = estimate?.quota ? (estimate.quota / 1024 / 1024).toFixed(0) : "";
  const storageText = usedMb && quotaMb ? `当前约 ${usedMb} MB / ${quotaMb} MB` : "当前浏览器支持本地项目缓存";
  const savedText = meta.savedAt ? `上次保存 ${new Date(meta.savedAt).toLocaleString()}` : "尚未保存项目";
  els.storageStatus.textContent = `${persisted ? "本地缓存已加固" : "本地缓存可用，建议导出备份"}。${storageText}。${savedText}。`;
  const proxyLabel = getApiRuntimeLabel();
  els.serverState.textContent = proxyLabel.text;
  els.serverState.classList.toggle("ok", proxyLabel.ok);
}

function getApiRuntimeLabel() {
  if (state.apiProxy?.enabled && explicitProxyBaseUrl()) {
    return { text: "外部代理", ok: true };
  }
  if (sameOriginApiBaseUrl) {
    return { text: "本地代理可用", ok: true };
  }
  return { text: "静态模式", ok: false };
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) {
    pushResponse("storage.persist.unsupported", { message: "当前浏览器不支持持久化授权，请使用导出项目做备份。" });
    await updateStorageStatus();
    return;
  }
  const granted = await navigator.storage.persist();
  pushResponse("storage.persist", {
    granted,
    message: granted ? "浏览器已尽量保护本站点本地数据。" : "浏览器没有授予持久化权限，请定期导出项目备份。"
  });
  await updateStorageStatus();
}

function downloadTextFile(fileName, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportWorkspace() {
  const includeSecrets = Boolean(els.exportSecretsToggle?.checked);
  const payload = {
    type: "seedance-canvas-project",
    version: 3,
    exportedAt: new Date().toISOString(),
    includesSecrets: includeSecrets,
    workspace: serializeWorkspace({ includeSecrets })
  };
  const date = new Date().toISOString().slice(0, 10);
  downloadTextFile(`seedance-project-${date}.seedance-project.json`, JSON.stringify(payload, null, 2));
  pushResponse("workspace.exported", {
    canvases: state.canvases.length,
    includesSecrets: includeSecrets
  });
}

async function importWorkspaceFile(file) {
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);
  const snapshot = parsed.workspace || parsed;
  applyWorkspaceSnapshot(snapshot);
  ensureWorkspace();
  render();
  saveWorkspace(true);
  pushResponse("workspace.imported", {
    canvases: state.canvases.length,
    source: file.name
  });
}

function parseExtraHeaders(extraHeaders) {
  if (!extraHeaders?.trim()) return {};
  return JSON.parse(extraHeaders);
}

function buildApiHeaders(config = {}) {
  return {
    "content-type": "application/json",
    ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    ...(config.wpTitle ? { "x-wp-title": config.wpTitle } : {}),
    ...parseExtraHeaders(config.extraHeaders || "")
  };
}

function applyTemplate(template, values) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    return value == null ? "" : encodeURIComponent(String(value));
  });
}

async function readResponseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function createClientError(kind, status, data) {
  const details = parseProviderError(data);
  const fallback = data?.error?.message || data?.error || data?.message || JSON.stringify(data);
  const error = new Error(details.userMessage || `${kind} failed: ${status} ${fallback}`);
  error.payload = {
    error: error.message,
    details,
    upstreamStatus: status
  };
  return error;
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
  const message = rawError?.message || gatewayError.message || data.message || "";
  const providerName = metadata.provider_name || "";
  const privacyImageBlocked =
    String(code).includes("InputImageSensitiveContentDetected") ||
    /input image may contain real person/i.test(message);
  return {
    code,
    message,
    param: rawError?.param || "",
    type: rawError?.type || "",
    providerName,
    userMessage: privacyImageBlocked
      ? "输入图片触发了上游隐私/真人内容安全拦截。请换一张不含真实人物、证件、联系方式或其他隐私信息的参考图。"
      : message,
    suggestions: privacyImageBlocked
      ? [
          "删除或替换首帧、尾帧、参考图中可能出现真实人物脸部的图片。",
          "避免上传证件、手机号、地址、聊天截图、工牌等隐私信息。",
          "3C TVC 优先使用产品图、场景图、手部局部图，或先生成一张非真人角色图。"
        ]
      : [],
    raw: data
  };
}

function normalizeSeedanceRequest(requestBody = {}) {
  return {
    ...requestBody,
    content: Array.isArray(requestBody.content)
      ? requestBody.content.map((item) => {
          if (item?.type !== "text") return item;
          const { role, ...textItem } = item;
          return textItem;
        })
      : requestBody.content
  };
}

function normalizeImage2Request(requestBody = {}) {
  const { response_format, style, input_reference, ...rest } = requestBody;
  return rest;
}

function stripBase64Payloads(value, depth = 0) {
  if (value == null || typeof value !== "object") return value;
  if (depth > 8) return "[nested object]";
  if (Array.isArray(value)) return value.map((item) => stripBase64Payloads(item, depth + 1));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "b64_json" && typeof item === "string") {
      output[key] = `[base64 omitted, ${Math.round(item.length / 1024)} KB]`;
    } else {
      output[key] = stripBase64Payloads(item, depth + 1);
    }
  }
  return output;
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createMockImage2Result(requestBody = {}) {
  const prompt = escapeHtml(String(requestBody.prompt || "Image2 mock image").slice(0, 220));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
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
  return {
    result: {
      id: `mock-image2-${uid("task").slice(-7)}`,
      status: "succeeded",
      mock: true,
      content: { image_url: svgDataUrl(svg) },
      request: normalizeImage2Request(requestBody),
      usage: { total_tokens: 0 }
    }
  };
}

async function testEndpointConnection(config = {}, endpoint) {
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
      headers: buildApiHeaders(config),
      signal: AbortSignal.timeout(10000)
    });
    const data = await readResponseJson(response);
    const reachable = response.status < 500;
    return {
      ok: reachable && response.status !== 401 && response.status !== 403,
      reachable,
      status: response.status,
      message: reachable
        ? `端点可达，HTTP ${response.status}。如果返回 404/405，通常表示服务在线但该地址只接受创建任务请求。`
        : `端点返回 HTTP ${response.status}，请检查地址或网络。`,
      bodyPreview: JSON.stringify(data).slice(0, 500)
    };
  } catch (error) {
    const message = error instanceof TypeError
      ? "浏览器无法访问该 API，通常是上游未允许 GitHub Pages 跨域请求。请开启 API 代理模式。"
      : `连接失败：${error instanceof Error ? error.message : String(error)}`;
    return {
      ok: false,
      reachable: false,
      corsBlocked: error instanceof TypeError,
      message
    };
  }
}

function explicitProxyBaseUrl() {
  return normalizeBaseUrl(state.apiProxy?.baseUrl);
}

function proxyBaseUrl() {
  return explicitProxyBaseUrl() || sameOriginApiBaseUrl;
}

function shouldUseProxy() {
  if (sameOriginApiBaseUrl) return true;
  return Boolean(state.apiProxy?.enabled && explicitProxyBaseUrl());
}

function proxyEndpoint(path) {
  return `${proxyBaseUrl()}${path}`;
}

async function postProxyJson(path, payload) {
  const response = await fetch(proxyEndpoint(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await readResponseJson(response);
  if (!response.ok || data.error) {
    const error = new Error(data.error || `Proxy request failed: ${response.status}`);
    error.payload = data;
    throw error;
  }
  return data;
}

function proxyConfigStatus() {
  if (!state.apiProxy?.enabled) return null;
  if (!explicitProxyBaseUrl() && !sameOriginApiBaseUrl) return {
    ok: false,
    mode: "proxy",
    message: "已开启代理模式，但代理地址为空。"
  };
  return null;
}

function uniqueUrls(urls) {
  return Array.from(new Set(urls.map((url) => url.href)));
}

function apiBaseFromHealthUrl(url) {
  return normalizeBaseUrl(url.replace(/\/api\/health(?:[?#].*)?$/, ""));
}

async function detectSameOriginApi() {
  sameOriginApiBaseUrl = "";
  const candidates = uniqueUrls([
    new URL("/api/health", window.location.href),
    new URL("./api/health", window.location.href)
  ]);
  for (const href of candidates) {
    try {
      const response = await fetch(href, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        sameOriginApiBaseUrl = apiBaseFromHealthUrl(href);
        return true;
      }
    } catch {
      // Static hosts usually do not expose the local API routes.
    }
  }
  return false;
}

async function createSeedanceTaskDirect(requestBody) {
  const config = buildRuntimeConfig();
  const normalizedRequestBody = normalizeSeedanceRequest(requestBody);
  if (shouldUseProxy()) {
    return postProxyJson("/api/seedance/tasks", {
      config,
      requestBody: normalizedRequestBody
    });
  }
  if (config.mode === "mock") {
    return {
      task: {
        id: `mock-${uid("task").slice(-10)}`,
        status: "pending",
        mock: true,
        request: normalizedRequestBody
      }
    };
  }
  const response = await fetch(config.createEndpoint, {
    method: "POST",
    headers: buildApiHeaders(config),
    body: JSON.stringify(normalizedRequestBody)
  });
  const data = await readResponseJson(response);
  if (!response.ok) throw createClientError("Seedance create", response.status, data);
  return { task: data };
}

async function pollSeedanceTaskDirect(taskId) {
  const config = buildRuntimeConfig();
  if (shouldUseProxy()) {
    return postProxyJson("/api/seedance/poll", {
      config,
      taskId
    });
  }
  if (config.mode === "mock") {
    return {
      task: {
        id: taskId,
        status: "succeeded",
        mock: true,
        content: {
          video_url: `mock://seedance/${taskId}.mp4`,
          last_frame_image: `mock://seedance/${taskId}-last-frame.png`
        },
        usage: { total_tokens: 0 }
      }
    };
  }
  const endpoint = applyTemplate(config.pollEndpoint, {
    taskId,
    model: config.model || "seedance-2-0"
  });
  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildApiHeaders(config)
  });
  const data = await readResponseJson(response);
  if (!response.ok) throw createClientError("Seedance poll", response.status, data);
  return { task: data };
}

async function createImage2Direct(requestBody) {
  const config = buildImage2RuntimeConfig();
  const normalizedRequestBody = normalizeImage2Request(requestBody);
  if (shouldUseProxy()) {
    return postProxyJson("/api/image2/generate", {
      config,
      requestBody: normalizedRequestBody
    });
  }
  if (config.mode === "mock") return createMockImage2Result(normalizedRequestBody);
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: buildApiHeaders(config),
    body: JSON.stringify(normalizedRequestBody)
  });
  const data = await readResponseJson(response);
  if (!response.ok) throw createClientError("Image2 generate", response.status, data);
  const b64 = data.data?.[0]?.b64_json;
  const outputFormat = normalizedRequestBody.output_format || "png";
  const imageUrl = b64
    ? `data:image/${outputFormat};base64,${b64}`
    : data.data?.[0]?.url || "";
  return {
    result: {
      id: `image2-${uid("task").slice(-10)}`,
      status: "succeeded",
      content: { image_url: imageUrl },
      data: stripBase64Payloads(data.data || []),
      usage: data.usage || null,
      raw: stripBase64Payloads(data)
    }
  };
}

function buildRuntimeConfig() {
  return {
    ...state.config,
    mode: state.config.apiKey ? "api" : "mock"
  };
}

function buildImage2RuntimeConfig() {
  return {
    ...state.image2Config,
    mode: state.image2Config.apiKey ? "api" : "mock"
  };
}

function extractTaskId(payload) {
  const task = payload?.task || payload || {};
  return task.id || task.task_id || task.taskId || task.data?.id || task.data?.task_id || "";
}

function extractTaskPayload(payload) {
  return payload?.task || payload?.result || payload || {};
}

function extractTaskStatus(payload) {
  const task = extractTaskPayload(payload);
  return task.status || payload?.status || "created";
}

function applyTaskResult(resultNode, payload) {
  const task = extractTaskPayload(payload);
  const content = task.content || payload?.content || {};
  resultNode.taskId = resultNode.taskId || extractTaskId(payload);
  resultNode.status = extractTaskStatus(payload) || resultNode.status || "created";
  resultNode.videoUrl = content.video_url || content.videoUrl || resultNode.videoUrl || "";
  resultNode.lastFrameImage = content.last_frame_image || content.lastFrameImage || resultNode.lastFrameImage || "";
  resultNode.usage = task.usage || payload?.usage || resultNode.usage || null;
  resultNode.errorMessage = task.errorMessage || payload?.errorMessage || resultNode.errorMessage || "";
  resultNode.errorDetails = task.errorDetails || payload?.errorDetails || resultNode.errorDetails || null;
  resultNode.raw = task;
}

function getResultNodeForTask(sourceNodeId, taskId) {
  const canvas = getActiveCanvas();
  return canvas.nodes.find((node) =>
    node.type === "video-result" &&
    node.sourceNodeId === sourceNodeId &&
    node.taskId === taskId
  ) || null;
}

function createOrUpdateResultNode(sourceNode, payload) {
  const canvas = getActiveCanvas();
  const taskId = extractTaskId(payload);
  let resultNode = getResultNodeForTask(sourceNode.id, taskId);
  if (!resultNode) {
    resultNode = {
      id: uid("video"),
      type: "video-result",
      title: "Video result",
      sourceNodeId: sourceNode.id,
      taskId,
      status: extractTaskStatus(payload),
      x: sourceNode.x + 520,
      y: sourceNode.y,
      videoUrl: "",
      lastFrameImage: "",
      usage: null,
      errorMessage: "",
      errorDetails: null,
      raw: null
    };
    canvas.nodes.push(resultNode);
  }
  applyTaskResult(resultNode, payload);
  if (!canvas.connections.some((connection) => connection.from === sourceNode.id && connection.to === resultNode.id)) {
    canvas.connections.push({ id: uid("edge"), from: sourceNode.id, to: resultNode.id });
  }
  return resultNode;
}

function normalizeApiError(error) {
  const payload = error?.payload || {};
  const details = payload.details || {};
  return {
    message: payload.error || details.userMessage || error?.message || "Request failed",
    code: details.code || "",
    providerName: details.providerName || "",
    suggestions: Array.isArray(details.suggestions) ? details.suggestions : [],
    raw: payload
  };
}

function createFailureResultNode(sourceNode, error) {
  const canvas = getActiveCanvas();
  const info = normalizeApiError(error);
  const failedCount = canvas.nodes.filter((node) => node.type === "video-result" && node.sourceNodeId === sourceNode.id && node.status === "failed").length;
  const resultNode = {
    id: uid("video"),
    type: "video-result",
    title: "Create failed",
    sourceNodeId: sourceNode.id,
    taskId: "",
    status: "failed",
    x: sourceNode.x + 520,
    y: sourceNode.y + failedCount * 260,
    videoUrl: "",
    lastFrameImage: "",
    usage: null,
    errorMessage: info.message,
    errorDetails: info,
    raw: info.raw
  };
  canvas.nodes.push(resultNode);
  canvas.connections.push({ id: uid("edge"), from: sourceNode.id, to: resultNode.id });
  return resultNode;
}

function createImageResultNode(sourceNode, payload) {
  const canvas = getActiveCanvas();
  const result = payload?.result || payload || {};
  const resultNode = {
    id: uid("image-result"),
    type: "image-result",
    title: "Image result",
    sourceNodeId: sourceNode.id,
    taskId: result.id || "",
    status: result.status || "succeeded",
    x: sourceNode.x + 520,
    y: sourceNode.y,
    imageUrl: result.content?.image_url || result.imageUrl || "",
    usage: result.usage || null,
    raw: result
  };
  canvas.nodes.push(resultNode);
  canvas.connections.push({ id: uid("edge"), from: sourceNode.id, to: resultNode.id, mapping: "" });
  return resultNode;
}

function createPendingImageResultNode(sourceNode, requestBody) {
  const canvas = getActiveCanvas();
  const pendingCount = canvas.nodes.filter((node) =>
    node.type === "image-result" &&
    node.sourceNodeId === sourceNode.id &&
    (node.status === "running" || node.status === "pending")
  ).length;
  const resultNode = {
    id: uid("image-result"),
    type: "image-result",
    title: "Image result",
    sourceNodeId: sourceNode.id,
    taskId: `local-${uid("image-job").slice(-10)}`,
    status: "running",
    x: sourceNode.x + 520,
    y: sourceNode.y + pendingCount * 260,
    imageUrl: "",
    usage: null,
    errorMessage: "",
    errorDetails: null,
    raw: { request: sanitizeForDisplay(requestBody) }
  };
  canvas.nodes.push(resultNode);
  canvas.connections.push({ id: uid("edge"), from: sourceNode.id, to: resultNode.id, mapping: "" });
  return resultNode;
}

function applyImageResult(resultNode, payload) {
  const result = payload?.result || payload || {};
  resultNode.title = "Image result";
  resultNode.taskId = result.id || resultNode.taskId || "";
  resultNode.status = result.status || "succeeded";
  resultNode.imageUrl = result.content?.image_url || result.imageUrl || resultNode.imageUrl || "";
  resultNode.usage = result.usage || null;
  resultNode.errorMessage = "";
  resultNode.errorDetails = null;
  resultNode.raw = result;
}

function applyImageFailure(resultNode, error) {
  const info = normalizeApiError(error);
  resultNode.title = "Image create failed";
  resultNode.status = "failed";
  resultNode.imageUrl = "";
  resultNode.errorMessage = info.message;
  resultNode.errorDetails = info;
  resultNode.raw = info.raw;
}

function clientToCanvas(clientX, clientY) {
  const canvas = getActiveCanvas();
  const rect = els.canvasViewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - canvas.view.panX) / canvas.view.zoom,
    y: (clientY - rect.top - canvas.view.panY) / canvas.view.zoom
  };
}

function viewportCenterCanvasPoint() {
  const rect = els.canvasViewport.getBoundingClientRect();
  return clientToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testSeedanceApiConnection() {
  updateApiConfigsFromManager();
  els.testSeedanceApiBtn.disabled = true;
  els.testSeedanceApiBtn.textContent = "测试中";
  els.seedanceApiTestResult.className = "hint-text";
  try {
    const config = { ...state.config, mode: state.config.apiKey ? "api" : "mock" };
    const proxyStatus = proxyConfigStatus();
    const result = proxyStatus || (shouldUseProxy()
      ? await postProxyJson("/api/seedance/test", { config })
      : await testEndpointConnection(config, state.config.createEndpoint));
    els.seedanceApiTestResult.textContent = result.message || "连通性测试完成。";
    els.seedanceApiTestResult.className = result.ok ? "hint-text api-result ok" : "hint-text api-result error";
    pushResponse("seedance.test", result);
  } catch (error) {
    els.seedanceApiTestResult.textContent = error.message;
    els.seedanceApiTestResult.className = "hint-text api-result error";
    pushResponse("seedance.test.error", { error: error.message });
  } finally {
    els.testSeedanceApiBtn.disabled = false;
    els.testSeedanceApiBtn.textContent = "测试连通性";
    saveWorkspace();
  }
}

async function testImage2ApiConnection() {
  updateApiConfigsFromManager();
  els.testImage2ApiBtn.disabled = true;
  els.testImage2ApiBtn.textContent = "测试中";
  els.image2ApiTestResult.className = "hint-text";
  try {
    const config = { ...state.image2Config, mode: state.image2Config.apiKey ? "api" : "mock" };
    const proxyStatus = proxyConfigStatus();
    const result = proxyStatus || (shouldUseProxy()
      ? await postProxyJson("/api/image2/test", { config })
      : await testEndpointConnection(config, state.image2Config.endpoint));
    els.image2ApiTestResult.textContent = result.message || "连通性测试完成。";
    els.image2ApiTestResult.className = result.ok ? "hint-text api-result ok" : "hint-text api-result error";
    pushResponse("image2.test", result);
  } catch (error) {
    els.image2ApiTestResult.textContent = error.message;
    els.image2ApiTestResult.className = "hint-text api-result error";
    pushResponse("image2.test.error", { error: error.message });
  } finally {
    els.testImage2ApiBtn.disabled = false;
    els.testImage2ApiBtn.textContent = "测试连通性";
    saveWorkspace();
  }
}

async function createTask(nodeId = state.selectedNodeId) {
  const node = getNodeById(nodeId);
  if (!node) return;
  if (node.type === "image2-input") {
    await createImage2Task(node.id);
    return;
  }
  if (node.type !== "seedance-input") return;
  const requestBody = buildRequest(node);
  const validation = validateNode(node, requestBody);
  if (validation.errors.length) return;
  try {
    const result = await createSeedanceTaskDirect(requestBody);
    const taskId = extractTaskId(result);
    if (taskId) node.lastTaskId = taskId;
    const resultNode = createOrUpdateResultNode(node, result);
    selectNode(resultNode.id);
    pushResponse("seedance.create", result);
    render();
    if (resultNode.taskId) pollResultNode(resultNode.id, { auto: true });
    saveWorkspace();
  } catch (error) {
    const resultNode = createFailureResultNode(node, error);
    selectNode(resultNode.id);
    pushResponse("seedance.create.error", error.payload || { error: error.message });
    render();
    saveWorkspace();
  }
}

async function createImage2Task(nodeId = state.selectedNodeId) {
  const node = getNodeById(nodeId);
  if (!node || node.type !== "image2-input") return;
  if (activeImage2Generations.has(node.id)) {
    pushResponse("image2.generate.running", { nodeId: node.id, message: "该 Image2 节点已有生成任务在进行中。" });
    return;
  }
  const requestBody = buildImage2Request(node);
  const validation = validateImage2Node(node, requestBody);
  if (validation.errors.length) {
    selectNode(node.id);
    pushResponse("image2.validation.error", { errors: validation.errors, warnings: validation.warnings });
    renderInspector();
    renderRequestPreview();
    return;
  }
  const resultNode = createPendingImageResultNode(node, requestBody);
  node.generating = true;
  activeImage2Generations.add(node.id);
  selectNode(resultNode.id);
  pushResponse("image2.generate.started", {
    nodeId: node.id,
    resultNodeId: resultNode.id,
    references: getResolvedFieldUrls(node, "image2ReferenceImageUrls").length,
    hasMask: Boolean(getResolvedFieldUrl(node, "maskUrl"))
  });
  render();
  saveWorkspace();
  try {
    const result = await createImage2Direct(requestBody);
    const record = findNodeRecord(resultNode.id);
    if (record?.node?.type === "image-result") {
      applyImageResult(record.node, result);
      selectNode(record.node.id);
    }
    pushResponse("image2.generate", result);
    render();
    saveWorkspace();
  } catch (error) {
    const record = findNodeRecord(resultNode.id);
    if (record?.node?.type === "image-result") {
      applyImageFailure(record.node, error);
      selectNode(record.node.id);
    }
    pushResponse("image2.generate.error", error.payload || { error: error.message });
    render();
    saveWorkspace();
  } finally {
    const sourceRecord = findNodeRecord(node.id);
    if (sourceRecord?.node?.type === "image2-input") sourceRecord.node.generating = false;
    activeImage2Generations.delete(node.id);
    renderCanvas();
    renderInspector();
    renderRequestPreview();
    saveWorkspace();
  }
}

async function pollTask(nodeId = state.selectedNodeId) {
  const node = getNodeById(nodeId);
  if (!node) return;
  if (node.type === "video-result") {
    await pollResultNode(node.id);
    return;
  }
  if (!node.lastTaskId) return;
  const resultNode = getResultNodeForTask(node.id, node.lastTaskId) || createOrUpdateResultNode(node, {
    task: { id: node.lastTaskId, status: "pending" }
  });
  selectNode(resultNode.id);
  render();
  await pollResultNode(resultNode.id);
}

async function pollResultNode(resultNodeId, options = {}) {
  const existing = findNodeRecord(resultNodeId);
  if (!existing?.node?.taskId) return;
  if (activePolls.has(resultNodeId)) return;
  activePolls.add(resultNodeId);
  const maxAttempts = options.auto ? 120 : 1;
  let attempts = 0;
  try {
    while (attempts < maxAttempts) {
      const record = findNodeRecord(resultNodeId);
      if (!record?.node || record.node.type !== "video-result") return;
      const resultNode = record.node;
      const result = await pollSeedanceTaskDirect(resultNode.taskId);
      applyTaskResult(resultNode, result);
      pushResponse("seedance.poll", result);
      saveWorkspace();
      if (record.canvas.id === state.activeCanvasId) {
        renderCanvas();
        renderInspector();
        renderRequestPreview();
      }
      if (resultNode.status === "succeeded" || resultNode.status === "failed") break;
      if (!options.auto) break;
      attempts += 1;
      await sleep(5000);
    }
  } catch (error) {
    const record = findNodeRecord(resultNodeId);
    if (record?.node?.type === "video-result") {
      const info = normalizeApiError(error);
      record.node.status = "failed";
      record.node.errorMessage = info.message;
      record.node.errorDetails = info;
      record.node.raw = info.raw;
    }
    pushResponse("seedance.poll.error", error.payload || { error: error.message });
    renderCanvas();
    renderInspector();
    renderRequestPreview();
    saveWorkspace();
  } finally {
    activePolls.delete(resultNodeId);
  }
}

function addCanvas() {
  const canvas = defaultCanvas(state.canvases.length + 1);
  state.canvases.push(canvas);
  state.activeCanvasId = canvas.id;
  selectNode(canvas.nodes[0]?.id || "");
  render();
}

function addSeedanceNode(position = null) {
  const canvas = getActiveCanvas();
  const offset = canvas.nodes.length * 32;
  const point = position || viewportCenterCanvasPoint();
  const node = defaultNode(point.x + (position ? 0 : offset), point.y + (position ? 0 : offset));
  node.title = `Seedance 节点 ${canvas.nodes.length + 1}`;
  canvas.nodes.push(node);
  selectNode(node.id);
  state.ui.nodeMenuOpen = false;
  closeCanvasContextMenu();
  render();
}

function addImage2Node(position = null) {
  const canvas = getActiveCanvas();
  const offset = canvas.nodes.length * 32;
  const point = position || viewportCenterCanvasPoint();
  const node = defaultImage2Node(point.x + (position ? 0 : offset), point.y + (position ? 0 : offset));
  node.title = `Image2 节点 ${canvas.nodes.length + 1}`;
  canvas.nodes.push(node);
  selectNode(node.id);
  state.ui.nodeMenuOpen = false;
  closeCanvasContextMenu();
  render();
}

function addNodeByType(type, position = null) {
  if (type === "image2") addImage2Node(position);
  else addSeedanceNode(position);
}

function openCanvasContextMenu(clientX, clientY) {
  const rect = els.canvasViewport.getBoundingClientRect();
  const point = clientToCanvas(clientX, clientY);
  state.ui.contextMenu = {
    open: true,
    x: Math.min(Math.max(clientX - rect.left, 8), Math.max(8, rect.width - 196)),
    y: Math.min(Math.max(clientY - rect.top, 8), Math.max(8, rect.height - 112)),
    canvasX: point.x,
    canvasY: point.y
  };
  state.ui.nodeMenuOpen = false;
  applyUiState();
}

function closeCanvasContextMenu() {
  if (!state.ui.contextMenu?.open) return;
  state.ui.contextMenu.open = false;
  applyUiState();
}

function duplicateNode() {
  const canvas = getActiveCanvas();
  const node = getSelectedNode();
  if (!node || (node.type !== "seedance-input" && node.type !== "image2-input")) return;
  const copy = JSON.parse(JSON.stringify(node));
  copy.id = uid(node.type === "image2-input" ? "image2" : "seedance");
  copy.title = `${node.title} Copy`;
  copy.x += 36;
  copy.y += 36;
  copy.lastTaskId = "";
  canvas.nodes.push(copy);
  selectNode(copy.id);
  render();
}

function connectNodes(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const canvas = getActiveCanvas();
  if ((canvas.connections || []).some((connection) => connection.from === fromId && connection.to === toId)) {
    state.ui.connectingFrom = "";
    state.ui.connectionPreview = null;
    state.ui.connectionTargetId = "";
    renderCanvas();
    return;
  }
  const source = canvas.nodes.find((node) => node.id === fromId);
  const target = canvas.nodes.find((node) => node.id === toId);
  if (!source || !target) return;
  const options = mappingOptionsForConnection(source, target).filter((option) => option.value);
  canvas.connections.push({
    id: uid("edge"),
    from: fromId,
    to: toId,
    mapping: options[0]?.value || ""
  });
  state.ui.connectingFrom = "";
  state.ui.connectionPreview = null;
  state.ui.connectionTargetId = "";
  state.selectedConnectionId = "";
  selectNode(toId);
  render();
}

function startConnection(nodeId, event = null) {
  const node = getNodeById(nodeId);
  if (!node) return;
  state.ui.connectingFrom = nodeId;
  state.ui.connectionPreview = event ? clientToCanvas(event.clientX, event.clientY) : outputAnchor(node);
  state.ui.connectionTargetId = "";
  selectNode(nodeId);
  closeCanvasContextMenu();
  renderCanvas();
  renderInspector();
  renderRequestPreview();
  if (event) updateConnectionPreview(event);
}

function cancelConnection() {
  if (!state.ui.connectingFrom) return;
  state.ui.connectingFrom = "";
  state.ui.connectionPreview = null;
  state.ui.connectionTargetId = "";
  renderCanvas();
}

function finishConnection() {
  const fromId = state.ui.connectingFrom;
  const targetId = state.ui.connectionTargetId;
  if (fromId && targetId && fromId !== targetId) {
    connectNodes(fromId, targetId);
    return;
  }
  cancelConnection();
}

function findConnectionTarget(event, sourceId) {
  const canvas = getActiveCanvas();
  const candidates = $$(".node")
    .map((nodeEl) => {
      const nodeId = nodeEl.dataset.nodeId;
      if (!nodeId || nodeId === sourceId) return null;
      const node = canvas.nodes.find((item) => item.id === nodeId);
      if (!node) return null;
      const rect = nodeEl.getBoundingClientRect();
      const pad = 52;
      const inside =
        event.clientX >= rect.left - pad &&
        event.clientX <= rect.right + pad &&
        event.clientY >= rect.top - pad &&
        event.clientY <= rect.bottom + pad;
      if (!inside) return null;
      const closestX = Math.max(rect.left, Math.min(event.clientX, rect.right));
      const closestY = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
      const distance = Math.hypot(event.clientX - closestX, event.clientY - closestY);
      return { node, nodeEl, distance };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
  return candidates[0] || null;
}

function updateConnectionPreview(event) {
  if (!state.ui.connectingFrom) return;
  const canvas = getActiveCanvas();
  const source = canvas.nodes.find((node) => node.id === state.ui.connectingFrom);
  if (!source) {
    cancelConnection();
    return;
  }
  const point = clientToCanvas(event.clientX, event.clientY);
  const target = findConnectionTarget(event, source.id);
  const snapTarget = target ? inputAnchor(target.node) : null;
  state.ui.connectionPreview = snapTarget || point;
  state.ui.connectionTargetId = target?.node.id || "";
  els.canvasBoard.querySelectorAll(".node.connection-hot").forEach((nodeEl) => nodeEl.classList.remove("connection-hot"));
  if (target) target.nodeEl.classList.add("connection-hot");
  const path = els.canvasBoard.querySelector(".connection-preview-path");
  if (path) path.setAttribute("d", bezierPath(outputAnchor(source), state.ui.connectionPreview));
}

function deleteNode(nodeId = state.selectedNodeId) {
  const canvas = getActiveCanvas();
  canvas.nodes = canvas.nodes.filter((item) => item.id !== nodeId);
  canvas.connections = (canvas.connections || []).filter((connection) => connection.from !== nodeId && connection.to !== nodeId);
  if (!canvas.connections.some((connection) => connection.id === state.selectedConnectionId)) state.selectedConnectionId = "";
  activePolls.delete(nodeId);
  activeImage2Generations.delete(nodeId);
  if (state.selectedNodeId === nodeId) selectNode(canvas.nodes[0]?.id || "");
  render();
}

function selectConnection(connectionId) {
  const canvas = getActiveCanvas();
  const connection = (canvas.connections || []).find((item) => item.id === connectionId);
  if (!connection) return;
  state.selectedConnectionId = connection.id;
  state.selectedNodeId = "";
  cancelConnection();
  renderCanvas();
  renderInspector();
  renderRequestPreview();
}

function deleteConnection(connectionId = state.selectedConnectionId) {
  if (!connectionId) return;
  const canvas = getActiveCanvas();
  const before = canvas.connections.length;
  canvas.connections = (canvas.connections || []).filter((connection) => connection.id !== connectionId);
  if (state.selectedConnectionId === connectionId) state.selectedConnectionId = "";
  if (before !== canvas.connections.length) {
    pushResponse("connection.deleted", { connectionId });
    render();
    saveWorkspace();
  }
}

function deleteSelection() {
  if (state.selectedConnectionId) {
    deleteConnection();
    return;
  }
  deleteNode();
}

function setZoom(nextZoom, centerClientX, centerClientY) {
  const canvas = getActiveCanvas();
  const view = canvas.view;
  const oldZoom = view.zoom;
  const zoom = Math.min(2.5, Math.max(0.35, nextZoom));
  const rect = els.canvasViewport.getBoundingClientRect();
  const cx = centerClientX ?? rect.left + rect.width / 2;
  const cy = centerClientY ?? rect.top + rect.height / 2;
  const canvasX = (cx - rect.left - view.panX) / oldZoom;
  const canvasY = (cy - rect.top - view.panY) / oldZoom;
  view.zoom = zoom;
  view.panX = cx - rect.left - canvasX * zoom;
  view.panY = cy - rect.top - canvasY * zoom;
  applyCanvasTransform();
  saveWorkspace();
}

function resetView() {
  const canvas = getActiveCanvas();
  canvas.view = { zoom: 1, panX: 80, panY: 60 };
  applyCanvasTransform();
  saveWorkspace();
}

function openApiManager() {
  syncApiManagerInputs();
  els.apiOverlay.hidden = false;
}

function closeApiManager() {
  els.apiOverlay.hidden = true;
}

function bindStaticEvents() {
  els.addNodeMenuBtn.addEventListener("click", () => {
    state.ui.nodeMenuOpen = !state.ui.nodeMenuOpen;
    els.nodeAddMenu.hidden = !state.ui.nodeMenuOpen;
  });
  els.apiManagerBtn.addEventListener("click", openApiManager);
  els.closeApiManagerBtn.addEventListener("click", closeApiManager);
  els.apiOverlay.addEventListener("click", (event) => {
    if (event.target === els.apiOverlay) closeApiManager();
  });
  els.testSeedanceApiBtn.addEventListener("click", testSeedanceApiConnection);
  els.testImage2ApiBtn.addEventListener("click", testImage2ApiConnection);
  els.saveApiConfigBtn.addEventListener("click", () => {
    updateApiConfigsFromManager();
    renderCanvas();
    renderRequestPreview();
    saveWorkspace(true);
    closeApiManager();
  });
  els.newCanvasBtn.addEventListener("click", addCanvas);
  els.addSeedanceNodeBtn.addEventListener("click", () => addSeedanceNode());
  els.addImage2NodeBtn.addEventListener("click", () => addImage2Node());
  els.emptyAddNodeBtn.addEventListener("click", () => {
    const rect = els.canvasViewport.getBoundingClientRect();
    openCanvasContextMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  els.duplicateNodeBtn.addEventListener("click", duplicateNode);
  els.deleteNodeBtn.addEventListener("click", deleteSelection);
  els.zoomInBtn.addEventListener("click", () => setZoom(getActiveCanvas().view.zoom * 1.15));
  els.zoomOutBtn.addEventListener("click", () => setZoom(getActiveCanvas().view.zoom / 1.15));
  els.resetViewBtn.addEventListener("click", resetView);
  els.saveWorkspaceBtn.addEventListener("click", () => saveWorkspace(true));
  els.persistStorageBtn.addEventListener("click", requestPersistentStorage);
  els.exportWorkspaceBtn.addEventListener("click", exportWorkspace);
  els.importWorkspaceBtn.addEventListener("click", () => els.importWorkspaceInput.click());
  els.importWorkspaceInput.addEventListener("change", async () => {
    await importWorkspaceFile(els.importWorkspaceInput.files?.[0]);
    els.importWorkspaceInput.value = "";
  });
  els.clearResponseBtn.addEventListener("click", () => {
    state.responseLog = [];
    renderResponseLog();
  });
  els.copyRequestBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(els.requestPreview.textContent);
    pushResponse("request.copied", { nodeId: state.selectedNodeId });
  });
  els.createTaskBtn.addEventListener("click", () => createTask());
  els.pollTaskBtn.addEventListener("click", () => {
    const node = getSelectedNode();
    if (node?.type === "video-result") pollResultNode(node.id);
    else pollTask();
  });
  els.closeInputSheetBtn.addEventListener("click", closeInputSheet);
  els.inputOverlay.addEventListener("click", (event) => {
    if (event.target === els.inputOverlay) closeInputSheet();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.key === "Delete" || event.key === "Backspace") && !isEditingTarget(event.target)) {
      if (state.selectedConnectionId || state.selectedNodeId) {
        event.preventDefault();
        deleteSelection();
      }
      return;
    }
    if (event.key === "Escape") {
      cancelConnection();
      closeCanvasContextMenu();
      state.ui.nodeMenuOpen = false;
      applyUiState();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".node-add-menu")) {
      state.ui.nodeMenuOpen = false;
      applyUiState();
    }
    if (!event.target.closest(".canvas-context-menu")) closeCanvasContextMenu();
  });
  document.addEventListener("paste", (event) => {
    handleAssetPaste(event).catch((error) => {
      pushResponse("asset.paste.error", { error: error instanceof Error ? error.message : String(error) });
    });
  });

  els.canvasTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-canvas-id]");
    if (!button) return;
    state.activeCanvasId = button.dataset.canvasId;
    const canvas = getActiveCanvas();
    selectNode(canvas.nodes[0]?.id || "");
    render();
  });

  bindCanvasEvents();
}

function bindCanvasEvents() {
  let nodeDrag = null;
  let panDrag = null;

  els.canvasContextMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-context-add]");
    if (!button) return;
    event.stopPropagation();
    addNodeByType(button.dataset.contextAdd, {
      x: state.ui.contextMenu.canvasX,
      y: state.ui.contextMenu.canvasY
    });
  });

  els.canvasBoard.addEventListener("click", (event) => {
    const deleteEdgeTarget = event.target.closest?.("[data-action='delete-connection']");
    if (deleteEdgeTarget) {
      event.stopPropagation();
      deleteConnection(deleteEdgeTarget.dataset.edgeId);
      return;
    }
    const selectEdgeTarget = event.target.closest?.("[data-action='select-connection']");
    if (selectEdgeTarget) {
      event.stopPropagation();
      selectConnection(selectEdgeTarget.dataset.edgeId);
      return;
    }
    const nodeEl = event.target.closest(".node");
    if (!nodeEl) return;
    const nodeId = nodeEl.dataset.nodeId;
    if (event.target.closest("[data-action='connector']")) {
      event.stopPropagation();
      return;
    }
    if (state.ui.connectingFrom && nodeId !== state.ui.connectingFrom) {
      event.stopPropagation();
      connectNodes(state.ui.connectingFrom, nodeId);
      return;
    }
    if (event.target.closest("[data-action='delete-node']")) {
      event.stopPropagation();
      deleteNode(nodeId);
      return;
    }
    if (event.target.closest("[data-action='create-task']")) {
      event.stopPropagation();
      createTask(nodeId);
      return;
    }
    if (event.target.closest("[data-action='poll-task']")) {
      event.stopPropagation();
      pollTask(nodeId);
      return;
    }
    if (event.target.closest("[data-action='poll-result']")) {
      event.stopPropagation();
      pollResultNode(nodeId);
      return;
    }
    const port = event.target.closest("[data-input-field]");
    if (port) {
      event.stopPropagation();
      openInputSheet(nodeId, port.dataset.inputField);
      return;
    }
    if (event.target.closest("[data-focus-params]")) {
      selectNode(nodeId);
      render();
      return;
    }
    selectNode(nodeId);
    renderCanvas();
    renderInspector();
    renderRequestPreview();
  });

  els.canvasBoard.addEventListener("pointerdown", (event) => {
    const connector = event.target.closest("[data-action='connector']");
    if (connector) {
      const nodeEl = event.target.closest(".node");
      const nodeId = nodeEl?.dataset.nodeId;
      if (!nodeId) return;
      event.preventDefault();
      event.stopPropagation();
      els.canvasViewport.setPointerCapture(event.pointerId);
      startConnection(nodeId, event);
      return;
    }
    const handle = event.target.closest("[data-drag-handle]");
    if (!handle || event.target.closest("button")) return;
    const nodeEl = event.target.closest(".node");
    if (!nodeEl) return;
    const node = getActiveCanvas().nodes.find((item) => item.id === nodeEl.dataset.nodeId);
    if (!node) return;
    selectNode(node.id);
    nodeDrag = {
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originalX: node.x,
      originalY: node.y
    };
    nodeEl.setPointerCapture(event.pointerId);
    renderInspector();
    renderRequestPreview();
  });

  els.canvasBoard.addEventListener("pointermove", (event) => {
    if (state.ui.connectingFrom) updateConnectionPreview(event);
    if (!nodeDrag) return;
    const canvas = getActiveCanvas();
    const node = canvas.nodes.find((item) => item.id === nodeDrag.nodeId);
    const nodeEl = els.canvasBoard.querySelector(`[data-node-id="${nodeDrag.nodeId}"]`);
    if (!node || !nodeEl) return;
    node.x = nodeDrag.originalX + (event.clientX - nodeDrag.startX) / canvas.view.zoom;
    node.y = nodeDrag.originalY + (event.clientY - nodeDrag.startY) / canvas.view.zoom;
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    renderConnectionsOnly();
  });

  els.canvasBoard.addEventListener("pointerup", (event) => {
    if (state.ui.connectingFrom) {
      finishConnection();
      if (els.canvasViewport.hasPointerCapture?.(event.pointerId)) els.canvasViewport.releasePointerCapture(event.pointerId);
      return;
    }
    if (!nodeDrag) return;
    nodeDrag = null;
    saveWorkspace();
  });

  els.canvasViewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".canvas-context-menu")) return;
    if (event.target.closest(".connection-item")) return;
    if (event.target.closest(".node")) return;
    closeCanvasContextMenu();
    if (state.ui.connectingFrom) {
      cancelConnection();
      return;
    }
    panDrag = {
      startX: event.clientX,
      startY: event.clientY,
      originalPanX: getActiveCanvas().view.panX,
      originalPanY: getActiveCanvas().view.panY
    };
    els.canvasViewport.classList.add("panning");
    els.canvasViewport.setPointerCapture(event.pointerId);
  });

  els.canvasViewport.addEventListener("pointermove", (event) => {
    if (state.ui.connectingFrom) updateConnectionPreview(event);
    if (!panDrag) return;
    const view = getActiveCanvas().view;
    view.panX = panDrag.originalPanX + event.clientX - panDrag.startX;
    view.panY = panDrag.originalPanY + event.clientY - panDrag.startY;
    applyCanvasTransform();
  });

  els.canvasViewport.addEventListener("pointerup", (event) => {
    if (state.ui.connectingFrom) {
      finishConnection();
      if (els.canvasViewport.hasPointerCapture?.(event.pointerId)) els.canvasViewport.releasePointerCapture(event.pointerId);
      return;
    }
    if (!panDrag) return;
    panDrag = null;
    els.canvasViewport.classList.remove("panning");
    saveWorkspace();
  });

  els.canvasViewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    setZoom(getActiveCanvas().view.zoom * factor, event.clientX, event.clientY);
  }, { passive: false });

  els.canvasViewport.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    cancelConnection();
    openCanvasContextMenu(event.clientX, event.clientY);
  });
}

async function init() {
  await loadWorkspace();
  await detectSameOriginApi();
  ensureWorkspace();
  bindStaticEvents();
  render();
  await updateStorageStatus();
}

init().catch((error) => {
  pushResponse("app.init.error", { error: error instanceof Error ? error.message : String(error) });
  ensureWorkspace();
  bindStaticEvents();
  render();
});
