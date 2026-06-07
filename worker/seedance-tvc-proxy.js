const DEFAULT_ALLOWED_ORIGIN = "https://nikoedwards.github.io";

function allowedOrigin(request, env = {}) {
  const origin = request.headers.get("origin") || "";
  const configured = String(env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!origin) return "*";
  if (configured.includes("*") || configured.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  return configured[0] || DEFAULT_ALLOWED_ORIGIN;
}

function corsHeaders(request, env = {}) {
  return {
    "access-control-allow-origin": allowedOrigin(request, env),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-wp-title",
    "access-control-max-age": "86400"
  };
}

function jsonResponse(request, env, status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "content-type": "application/json; charset=utf-8"
    }
  });
}

async function readJson(request) {
  return request.json().catch(() => ({}));
}

function apiHeaders(config = {}) {
  const headers = {
    "content-type": "application/json"
  };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  if (config.wpTitle) headers["x-wp-title"] = config.wpTitle;
  if (config.extraHeaders && String(config.extraHeaders).trim()) {
    Object.assign(headers, JSON.parse(config.extraHeaders));
  }
  return headers;
}

function applyTemplate(template, values = {}) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => encodeURIComponent(values[key] ?? ""));
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
    output[key] = key === "b64_json" && typeof item === "string"
      ? `[base64:${item.length}]`
      : stripBase64Payloads(item, depth + 1);
  }
  return output;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mockImage2DataUrl(requestBody = {}) {
  const prompt = escapeXml(String(requestBody.prompt || "Image2 mock image").slice(0, 220));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#f8fafc"/>
  <circle cx="780" cy="220" r="96" fill="#0f766e" opacity="0.85"/>
  <path d="M112 760 C240 610 352 610 496 760 C620 890 758 848 912 668 L912 952 L112 952 Z" fill="#2563eb" opacity="0.78"/>
  <text x="112" y="164" fill="#111827" font-family="Arial, sans-serif" font-size="42" font-weight="700">Image2 Mock</text>
  <foreignObject x="112" y="214" width="760" height="260">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 30px; color: #334155; line-height: 1.35;">${prompt}</div>
  </foreignObject>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function readProviderJson(response) {
  return response.json().catch(async () => ({ raw: await response.text() }));
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
  const privacyImageBlocked =
    String(code).includes("InputImageSensitiveContentDetected") ||
    /input image may contain real person/i.test(message);
  const unsupportedImageFormat =
    String(code).includes("UnsupportedImageFormat") ||
    /image format is not supported/i.test(message);
  const frameReferenceConflict =
    /first\/last frame content cannot be mixed with reference media content/i.test(message);
  const userMessage = privacyImageBlocked
    ? "输入图片触发了上游隐私/真人内容安全拦截。请换一张不含真实人物、证件、联系方式或其他隐私信息的参考图。"
    : unsupportedImageFormat
      ? "Seedance 不支持当前图片输入格式。请使用可公网访问的常规图片 URL，并优先使用 jpg / jpeg / png。"
      : frameReferenceConflict
        ? "首帧/尾帧模式不能同时混用参考媒体。请在首帧/尾帧和参考图/参考视频/参考音频之间选一种输入方式。"
        : message || JSON.stringify(data);
  return {
    code,
    message,
    param: rawError?.param || "",
    type: rawError?.type || "",
    providerName: metadata.provider_name || "",
    userMessage,
    raw: data
  };
}

async function testEndpoint(config = {}, endpoint) {
  if (!config.apiKey) {
    return { ok: false, mode: "mock", message: "请先填写 API Key。未填写时仍可使用 Mock 预览。" };
  }
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: apiHeaders(config)
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

async function createSeedanceTask(config = {}, requestBody = {}) {
  if (config.mode === "mock") {
    return {
      id: `mock-${crypto.randomUUID().slice(0, 10)}`,
      status: "pending",
      mock: true,
      request: normalizeSeedanceRequest(requestBody)
    };
  }
  if (!config.apiKey) throw new Error("Seedance API Key is required for real API mode");
  const response = await fetch(config.createEndpoint, {
    method: "POST",
    headers: apiHeaders(config),
    body: JSON.stringify(normalizeSeedanceRequest(requestBody))
  });
  const data = await readProviderJson(response);
  if (!response.ok) {
    const details = parseProviderError(data);
    const error = new Error(details.userMessage);
    error.details = details;
    error.upstreamStatus = response.status;
    throw error;
  }
  return data;
}

async function pollSeedanceTask(config = {}, taskId) {
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
      usage: { total_tokens: 0 }
    };
  }
  if (!config.apiKey) throw new Error("Seedance API Key is required for real API mode");
  const endpoint = applyTemplate(config.pollEndpoint, {
    taskId,
    model: config.model || "seedance-2-0"
  });
  const response = await fetch(endpoint, {
    method: "GET",
    headers: apiHeaders(config)
  });
  const data = await readProviderJson(response);
  if (!response.ok) {
    const details = parseProviderError(data);
    const error = new Error(details.userMessage);
    error.details = details;
    error.upstreamStatus = response.status;
    throw error;
  }
  return data;
}

async function createImage2Generation(config = {}, requestBody = {}) {
  const normalizedRequestBody = normalizeImage2Request(requestBody);
  if (config.mode === "mock") {
    return {
      id: `mock-image2-${crypto.randomUUID().slice(0, 10)}`,
      status: "succeeded",
      mock: true,
      content: { image_url: mockImage2DataUrl(normalizedRequestBody) },
      request: normalizedRequestBody,
      usage: { total_tokens: 0 }
    };
  }
  if (!config.apiKey) throw new Error("Image2 API Key is required for real API mode");
  if (!config.endpoint) throw new Error("Image2 endpoint is required for real API mode");
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: apiHeaders(config),
    body: JSON.stringify(normalizedRequestBody)
  });
  const data = await readProviderJson(response);
  if (!response.ok) {
    const details = parseProviderError(data);
    const error = new Error(details.userMessage);
    error.details = details;
    error.upstreamStatus = response.status;
    throw error;
  }
  const b64 = data.data?.[0]?.b64_json || "";
  const outputFormat = normalizedRequestBody.output_format || "png";
  const imageUrl = b64 ? `data:image/${outputFormat};base64,${b64}` : data.data?.[0]?.url || "";
  return {
    id: `image2-${crypto.randomUUID().slice(0, 10)}`,
    status: "succeeded",
    content: { image_url: imageUrl },
    data: stripBase64Payloads(data.data || []),
    usage: data.usage || null,
    raw: stripBase64Payloads(data)
  };
}

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (request.method === "GET" && url.pathname === "/api/health") {
    return jsonResponse(request, env, 200, {
      ok: true,
      runtime: "cloudflare-worker",
      message: "Seedance TVC proxy is online."
    });
  }
  if (request.method !== "POST") return jsonResponse(request, env, 404, { error: "Not found" });

  const payload = await readJson(request);
  if (url.pathname === "/api/seedance/test") {
    const config = payload.config || {};
    return jsonResponse(request, env, 200, await testEndpoint(config, config.createEndpoint));
  }
  if (url.pathname === "/api/image2/test") {
    const config = payload.config || {};
    return jsonResponse(request, env, 200, await testEndpoint(config, config.endpoint));
  }
  if (url.pathname === "/api/seedance/tasks") {
    const task = await createSeedanceTask(payload.config || {}, payload.requestBody || {});
    return jsonResponse(request, env, 200, { task });
  }
  if (url.pathname === "/api/seedance/poll") {
    const task = await pollSeedanceTask(payload.config || {}, payload.taskId);
    return jsonResponse(request, env, 200, { task });
  }
  if (url.pathname === "/api/image2/generate") {
    const result = await createImage2Generation(payload.config || {}, payload.requestBody || {});
    return jsonResponse(request, env, 200, { result });
  }
  return jsonResponse(request, env, 404, { error: "Not found" });
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      return jsonResponse(request, env, error.upstreamStatus || 500, {
        error: error instanceof Error ? error.message : String(error),
        details: error.details || null
      });
    }
  }
};
