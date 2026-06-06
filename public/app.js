const STORAGE_KEY = "seedance-canvas-workspace-v2";

const DEFAULT_CONFIG = {
  createEndpoint: "https://agent-api.shuiditech.com/api/v1/contents/generations/tasks",
  pollEndpoint: "https://agent-api.shuiditech.com/api/v1/contents/generations/tasks/{{taskId}}?model={{model}}",
  model: "seedance-2-0",
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
  }
};

const state = {
  config: { ...DEFAULT_CONFIG },
  canvases: [],
  activeCanvasId: "",
  selectedNodeId: "",
  activeInput: null,
  responseLog: [],
  ui: {
    configCollapsed: false
  }
};

const activePolls = new Set();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  studioLayout: $("#studioLayout"),
  configPanel: $("#configPanel"),
  serverState: $("#serverState"),
  apiKey: $("#apiKey"),
  createEndpoint: $("#createEndpoint"),
  pollEndpoint: $("#pollEndpoint"),
  modelName: $("#modelName"),
  wpTitle: $("#wpTitle"),
  extraHeaders: $("#extraHeaders"),
  toggleConfigBtn: $("#toggleConfigBtn"),
  expandConfigBtn: $("#expandConfigBtn"),
  testApiBtn: $("#testApiBtn"),
  apiTestResult: $("#apiTestResult"),
  newCanvasBtn: $("#newCanvasBtn"),
  addSeedanceNodeBtn: $("#addSeedanceNodeBtn"),
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

function getActiveCanvas() {
  return state.canvases.find((canvas) => canvas.id === state.activeCanvasId) || state.canvases[0];
}

function getSelectedNode() {
  const canvas = getActiveCanvas();
  return canvas?.nodes.find((node) => node.id === state.selectedNodeId) || null;
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
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function updateConfigFromInputs() {
  state.config.apiKey = els.apiKey.value;
  state.config.createEndpoint = els.createEndpoint.value.trim();
  state.config.pollEndpoint = els.pollEndpoint.value.trim();
  state.config.model = els.modelName.value.trim() || "seedance-2-0";
  state.config.wpTitle = els.wpTitle.value.trim() || "demo-app";
  state.config.extraHeaders = els.extraHeaders.value.trim();
}

function syncConfigInputs() {
  els.apiKey.value = state.config.apiKey || "";
  els.createEndpoint.value = state.config.createEndpoint;
  els.pollEndpoint.value = state.config.pollEndpoint;
  els.modelName.value = state.config.model;
  els.wpTitle.value = state.config.wpTitle;
  els.extraHeaders.value = state.config.extraHeaders;
}

function saveWorkspace(showMessage = false) {
  const snapshot = {
    ...state,
    config: { ...state.config, apiKey: "" },
    activeInput: null,
    responseLog: []
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  if (showMessage) pushResponse("workspace.saved", { canvases: state.canvases.length });
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.config = { ...DEFAULT_CONFIG, ...(saved.config || {}), apiKey: "" };
    state.canvases = Array.isArray(saved.canvases) ? saved.canvases : [];
    state.activeCanvasId = saved.activeCanvasId || "";
    state.selectedNodeId = saved.selectedNodeId || "";
    state.ui = { ...state.ui, ...(saved.ui || {}) };
  } catch {
    state.canvases = [];
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
    }
  }
  if (!state.canvases.some((canvas) => canvas.id === state.activeCanvasId)) {
    state.activeCanvasId = state.canvases[0].id;
  }
  const canvas = getActiveCanvas();
  if (!canvas.nodes.some((node) => node.id === state.selectedNodeId)) {
    state.selectedNodeId = canvas.nodes[0]?.id || "";
  }
}

function render() {
  syncConfigInputs();
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
  els.studioLayout.classList.toggle("config-collapsed", Boolean(state.ui.configCollapsed));
  els.toggleConfigBtn.textContent = state.ui.configCollapsed ? "›" : "‹";
  els.toggleConfigBtn.title = state.ui.configCollapsed ? "展开模型配置" : "折叠模型配置";
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
  els.canvasBoard.innerHTML = `${renderConnections(canvas)}${canvas.nodes.map(renderCanvasNode).join("")}`;
  const selectedNode = getSelectedNode();
  els.duplicateNodeBtn.disabled = !selectedNode || selectedNode.type !== "seedance-input";
  els.deleteNodeBtn.disabled = !selectedNode;
  applyCanvasTransform();
}

function renderConnections(canvas) {
  const connections = canvas.connections || [];
  if (!connections.length) return "";
  const paths = connections.map((connection) => {
    const source = canvas.nodes.find((node) => node.id === connection.from);
    const target = canvas.nodes.find((node) => node.id === connection.to);
    if (!source || !target) return "";
    const sourceWidth = source.type === "video-result" ? 360 : 344;
    const targetWidth = target.type === "video-result" ? 360 : 344;
    const x1 = source.x + sourceWidth;
    const y1 = source.y + 118;
    const x2 = target.x;
    const y2 = target.y + 118;
    const dx = Math.max(80, Math.abs(x2 - x1) * 0.45);
    const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    return `<path class="connection-path" d="${path}" />`;
  }).join("");
  return `<svg class="connection-layer" width="2200" height="1400" viewBox="0 0 2200 1400" aria-hidden="true">${paths}</svg>`;
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
  const active = getFieldUrls(node, field).length ? " active" : "";
  return `
    <button class="input-port${active}" type="button" data-input-field="${field}">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(detail)}</span>
    </button>
  `;
}

function renderCanvasNode(node) {
  if (node.type === "video-result") return renderResultCanvasNode(node);
  return renderSeedanceCanvasNode(node);
}

function renderSeedanceCanvasNode(node) {
  const selected = node.id === state.selectedNodeId ? " selected" : "";
  const counts = countAssets(node);
  const promptText = node.prompt || "Prompt is empty";
  return `
    <article class="node${selected}" data-node-id="${node.id}" style="left:${node.x}px; top:${node.y}px;">
      <div class="node-head" data-drag-handle="true">
        <div>
          <strong>${escapeHtml(node.title)}</strong>
          <span>text + image + video + audio -> video</span>
        </div>
        <span class="node-model">${escapeHtml(state.config.model)}</span>
        <button class="node-delete" type="button" data-action="delete-node" title="删除节点">x</button>
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
        <div class="node-actions">
          <button type="button" data-action="create-task">创建任务</button>
          <button class="ghost-btn" type="button" data-action="poll-task" ${node.lastTaskId ? "" : "disabled"}>轮询</button>
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
    <article class="node result-node${selected}" data-node-id="${node.id}" style="left:${node.x}px; top:${node.y}px;">
      <div class="node-head" data-drag-handle="true">
        <div>
          <strong>${escapeHtml(node.title || "视频结果")}</strong>
          <span>${escapeHtml(node.taskId || "未创建任务")}</span>
        </div>
        <span class="status-pill status-${escapeHtml(status)}">${escapeHtml(statusText(status))}</span>
        <button class="node-delete" type="button" data-action="delete-node" title="删除节点">x</button>
      </div>
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
  els.inspectorEmpty.style.display = node ? "none" : "block";
  els.nodeSummary.style.display = node ? "grid" : "none";
  els.paramEditor.style.display = node ? "grid" : "none";
  els.selectedNodeLabel.textContent = node ? node.title : "未选择节点";
  if (!node) {
    els.nodeSummary.innerHTML = "";
    els.paramEditor.innerHTML = "";
    return;
  }

  if (node.type === "video-result") {
    els.paramEditor.style.display = "none";
    els.nodeSummary.innerHTML = `
      <div class="summary-row"><span>Status</span><strong>${escapeHtml(statusText(node.status))}</strong></div>
      <div class="summary-row"><span>Task ID</span><strong>${escapeHtml(node.taskId || "-")}</strong></div>
      <div class="summary-row"><span>Video</span><strong>${node.videoUrl ? "Ready" : "Waiting"}</strong></div>
      <div class="summary-row"><span>Last frame</span><strong>${node.lastFrameImage ? "Ready" : "None"}</strong></div>
      ${node.errorMessage ? `<div class="summary-row"><span>Error</span><strong>${escapeHtml(node.errorDetails?.code || "Failed")}</strong></div>` : ""}
    `;
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
      else if (key === "duration") node.params[key] = Number(input.value);
      else node.params[key] = input.value;
      renderCanvas();
      renderRequestPreview();
      saveWorkspace();
    });
  });
}

function getFieldUrls(node, field) {
  if (field === "firstFrameUrl" || field === "lastFrameUrl") {
    return node[field] ? [node[field]] : [];
  }
  return splitLines(node[field]);
}

function setFieldUrls(node, field, urls) {
  const clean = urls.map((url) => String(url || "").trim()).filter(Boolean);
  if (field === "firstFrameUrl" || field === "lastFrameUrl") {
    node[field] = clean[0] || "";
  } else {
    node[field] = joinLines(clean);
  }
}

function openInputSheet(nodeId, field) {
  const canvas = getActiveCanvas();
  const node = canvas.nodes.find((item) => item.id === nodeId);
  const meta = INPUT_META[field];
  if (!node || !meta) return;
  state.selectedNodeId = node.id;
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
      <strong>拖拽${escapeHtml(meta.typeLabel)}到这里</strong>
      <span>也可以点击按钮从本地上传，上传后会生成本地 URL。</span>
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
    setFieldUrls(node, field, meta.single ? [url] : [...urls, url]);
    input.value = "";
    afterInputMutation(node, field);
  });
  $("#clearAssetsBtn").addEventListener("click", () => {
    setFieldUrls(node, field, []);
    afterInputMutation(node, field);
  });
}

async function uploadAndAttachFiles(files, node, field, meta) {
  if (!files.length) return;
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const response = await fetch("/api/assets", { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok || data.error) {
    pushResponse("asset.upload.error", { error: data.error || `Upload failed: ${response.status}` });
    return;
  }
  const uploadedUrls = (data.assets || []).map((asset) => asset.url);
  const urls = getFieldUrls(node, field);
  setFieldUrls(node, field, meta.single ? uploadedUrls.slice(0, 1) : [...urls, ...uploadedUrls]);
  pushResponse("asset.upload", data);
  afterInputMutation(node, field);
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
      <code title="${escapeHtml(url)}">${escapeHtml(url)}</code>
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
  if (node.firstFrameUrl.trim()) content.push({ type: "image_url", image_url: { url: node.firstFrameUrl.trim() }, role: "first_frame" });
  if (node.lastFrameUrl.trim()) content.push({ type: "image_url", image_url: { url: node.lastFrameUrl.trim() }, role: "last_frame" });
  splitLines(node.referenceImageUrls).forEach((url) => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
  splitLines(node.referenceVideoUrls).forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
  splitLines(node.referenceAudioUrls).forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));

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
  if (!node) {
    els.requestPreview.textContent = "";
    els.validationBox.innerHTML = "";
    els.copyRequestBtn.disabled = true;
    els.createTaskBtn.disabled = true;
    els.pollTaskBtn.disabled = true;
    return;
  }
  if (node.type === "video-result") {
    els.requestPreview.textContent = JSON.stringify({
      taskId: node.taskId,
      status: node.status,
      videoUrl: node.videoUrl,
      lastFrameImage: node.lastFrameImage,
      errorMessage: node.errorMessage,
      errorDetails: node.errorDetails,
      usage: node.usage,
      raw: node.raw
    }, null, 2);
    els.validationBox.innerHTML = `<div class="validation-item">Video result node. Poll it from the canvas to refresh status.</div>`;
    els.copyRequestBtn.disabled = false;
    els.createTaskBtn.disabled = true;
    els.pollTaskBtn.disabled = !node.taskId;
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
  state.responseLog.unshift({ time: new Date().toLocaleTimeString(), label, payload });
  state.responseLog = state.responseLog.slice(0, 12);
  renderResponseLog();
}

function renderResponseLog() {
  els.responseLog.textContent = state.responseLog
    .map((entry) => `[${entry.time}] ${entry.label}\n${JSON.stringify(entry.payload, null, 2)}`)
    .join("\n\n");
}

async function apiJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = new Error(data.error || `Request failed: ${response.status}`);
    error.payload = data;
    throw error;
  }
  return data;
}

function buildRuntimeConfig() {
  updateConfigFromInputs();
  return {
    ...state.config,
    mode: state.config.apiKey ? "api" : "mock"
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testApiConnection() {
  updateConfigFromInputs();
  els.testApiBtn.disabled = true;
  els.testApiBtn.textContent = "测试中";
  els.apiTestResult.className = "hint-text";
  try {
    const result = await apiJson("/api/seedance/test", { config: { ...state.config, mode: state.config.apiKey ? "api" : "mock" } });
    els.apiTestResult.textContent = result.message || "连通性测试完成。";
    els.apiTestResult.className = result.ok ? "hint-text api-result ok" : "hint-text api-result error";
    pushResponse("seedance.test", result);
  } catch (error) {
    els.apiTestResult.textContent = error.message;
    els.apiTestResult.className = "hint-text api-result error";
    pushResponse("seedance.test.error", { error: error.message });
  } finally {
    els.testApiBtn.disabled = false;
    els.testApiBtn.textContent = "测试连通性";
  }
}

async function createTask(nodeId = state.selectedNodeId) {
  const node = getNodeById(nodeId);
  if (!node || node.type !== "seedance-input") return;
  const requestBody = buildRequest(node);
  const validation = validateNode(node, requestBody);
  if (validation.errors.length) return;
  try {
    const result = await apiJson("/api/seedance/tasks", {
      config: buildRuntimeConfig(),
      requestBody
    });
    const taskId = extractTaskId(result);
    if (taskId) node.lastTaskId = taskId;
    const resultNode = createOrUpdateResultNode(node, result);
    state.selectedNodeId = resultNode.id;
    pushResponse("seedance.create", result);
    render();
    if (resultNode.taskId) pollResultNode(resultNode.id, { auto: true });
    saveWorkspace();
  } catch (error) {
    const resultNode = createFailureResultNode(node, error);
    state.selectedNodeId = resultNode.id;
    pushResponse("seedance.create.error", error.payload || { error: error.message });
    render();
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
  state.selectedNodeId = resultNode.id;
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
      const result = await apiJson("/api/seedance/poll", {
        config: buildRuntimeConfig(),
        taskId: resultNode.taskId
      });
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
  state.selectedNodeId = canvas.nodes[0]?.id || "";
  render();
}

function addSeedanceNode() {
  const canvas = getActiveCanvas();
  const offset = canvas.nodes.length * 32;
  const node = defaultNode(160 + offset, 140 + offset);
  node.title = `Seedance 节点 ${canvas.nodes.length + 1}`;
  canvas.nodes.push(node);
  state.selectedNodeId = node.id;
  render();
}

function duplicateNode() {
  const canvas = getActiveCanvas();
  const node = getSelectedNode();
  if (!node || node.type !== "seedance-input") return;
  const copy = JSON.parse(JSON.stringify(node));
  copy.id = uid("seedance");
  copy.title = `${node.title} Copy`;
  copy.x += 36;
  copy.y += 36;
  copy.lastTaskId = "";
  canvas.nodes.push(copy);
  state.selectedNodeId = copy.id;
  render();
}

function deleteNode(nodeId = state.selectedNodeId) {
  const canvas = getActiveCanvas();
  canvas.nodes = canvas.nodes.filter((item) => item.id !== nodeId);
  canvas.connections = (canvas.connections || []).filter((connection) => connection.from !== nodeId && connection.to !== nodeId);
  activePolls.delete(nodeId);
  if (state.selectedNodeId === nodeId) state.selectedNodeId = canvas.nodes[0]?.id || "";
  render();
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

function bindStaticEvents() {
  [els.apiKey, els.createEndpoint, els.pollEndpoint, els.modelName, els.wpTitle, els.extraHeaders].forEach((input) => {
    input.addEventListener("input", () => {
      updateConfigFromInputs();
      renderCanvas();
      renderRequestPreview();
      saveWorkspace();
    });
  });

  els.toggleConfigBtn.addEventListener("click", () => {
    state.ui.configCollapsed = !state.ui.configCollapsed;
    applyUiState();
    saveWorkspace();
  });
  els.expandConfigBtn.addEventListener("click", () => {
    state.ui.configCollapsed = false;
    applyUiState();
    saveWorkspace();
  });
  els.testApiBtn.addEventListener("click", testApiConnection);
  els.newCanvasBtn.addEventListener("click", addCanvas);
  els.addSeedanceNodeBtn.addEventListener("click", addSeedanceNode);
  els.emptyAddNodeBtn.addEventListener("click", addSeedanceNode);
  els.duplicateNodeBtn.addEventListener("click", duplicateNode);
  els.deleteNodeBtn.addEventListener("click", () => deleteNode());
  els.zoomInBtn.addEventListener("click", () => setZoom(getActiveCanvas().view.zoom * 1.15));
  els.zoomOutBtn.addEventListener("click", () => setZoom(getActiveCanvas().view.zoom / 1.15));
  els.resetViewBtn.addEventListener("click", resetView);
  els.saveWorkspaceBtn.addEventListener("click", () => saveWorkspace(true));
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

  els.canvasTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-canvas-id]");
    if (!button) return;
    state.activeCanvasId = button.dataset.canvasId;
    const canvas = getActiveCanvas();
    state.selectedNodeId = canvas.nodes[0]?.id || "";
    render();
  });

  bindCanvasEvents();
}

function bindCanvasEvents() {
  let nodeDrag = null;
  let panDrag = null;

  els.canvasBoard.addEventListener("click", (event) => {
    const nodeEl = event.target.closest(".node");
    if (!nodeEl) return;
    const nodeId = nodeEl.dataset.nodeId;
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
      state.selectedNodeId = nodeId;
      render();
      return;
    }
    state.selectedNodeId = nodeId;
    renderCanvas();
    renderInspector();
    renderRequestPreview();
  });

  els.canvasBoard.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-drag-handle]");
    if (!handle || event.target.closest("button")) return;
    const nodeEl = event.target.closest(".node");
    if (!nodeEl) return;
    const node = getActiveCanvas().nodes.find((item) => item.id === nodeEl.dataset.nodeId);
    if (!node) return;
    state.selectedNodeId = node.id;
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
    if (!nodeDrag) return;
    const canvas = getActiveCanvas();
    const node = canvas.nodes.find((item) => item.id === nodeDrag.nodeId);
    const nodeEl = els.canvasBoard.querySelector(`[data-node-id="${nodeDrag.nodeId}"]`);
    if (!node || !nodeEl) return;
    node.x = Math.max(20, nodeDrag.originalX + (event.clientX - nodeDrag.startX) / canvas.view.zoom);
    node.y = Math.max(20, nodeDrag.originalY + (event.clientY - nodeDrag.startY) / canvas.view.zoom);
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
  });

  els.canvasBoard.addEventListener("pointerup", () => {
    if (!nodeDrag) return;
    nodeDrag = null;
    saveWorkspace();
  });

  els.canvasViewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".node")) return;
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
    if (!panDrag) return;
    const view = getActiveCanvas().view;
    view.panX = panDrag.originalPanX + event.clientX - panDrag.startX;
    view.panY = panDrag.originalPanY + event.clientY - panDrag.startY;
    applyCanvasTransform();
  });

  els.canvasViewport.addEventListener("pointerup", () => {
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
}

async function checkServer() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    els.serverState.textContent = health.ok ? "本地服务可用" : "服务异常";
    els.serverState.classList.toggle("ok", Boolean(health.ok));
  } catch {
    els.serverState.textContent = "连接失败";
    els.serverState.classList.add("error");
  }
}

loadWorkspace();
ensureWorkspace();
bindStaticEvents();
render();
checkServer();
