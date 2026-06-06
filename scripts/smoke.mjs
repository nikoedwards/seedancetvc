const baseUrl = process.env.DEMO_URL || "http://127.0.0.1:4317";

async function post(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || `${path} failed with ${response.status}`);
  }
  return data;
}

const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
if (!health.ok) throw new Error("health check failed");

const requestBody = {
  model: "seedance-2-0",
  content: [
    {
      type: "text",
      text: "镜头缓慢拉近，主体轻抬眼眸，发丝随风轻拂",
    },
    {
      type: "image_url",
      image_url: { url: "https://your-cdn.example/first-frame.png" },
      role: "first_frame"
    }
  ],
  ratio: "16:9",
  duration: 5,
  resolution: "720p",
  generate_audio: true,
  camera_fixed: false,
  watermark: false,
  return_last_frame: true
};

const { task: created } = await post("/api/seedance/tasks", {
  config: {
    mode: "mock",
    model: "seedance-2-0",
    createEndpoint: "https://agent-api.shuiditech.com/api/v1/contents/generations/tasks",
    pollEndpoint: "https://agent-api.shuiditech.com/api/v1/contents/generations/tasks/{{taskId}}?model={{model}}",
    wpTitle: "demo-app"
  },
  requestBody
});

if (!created.id) throw new Error("mock create did not return task id");

const { task: polled } = await post("/api/seedance/poll", {
  config: {
    mode: "mock",
    model: "seedance-2-0"
  },
  taskId: created.id
});

if (polled.status !== "succeeded") throw new Error(`expected succeeded, got ${polled.status}`);

const { result: image2 } = await post("/api/image2/generate", {
  config: {
    mode: "mock",
    model: "gpt-image-2"
  },
  requestBody: {
    model: "gpt-image-2",
    prompt: "画一张清晨湖边的插画，电影感光影",
    size: "1024x1024",
    quality: "high",
    n: 1,
    output_format: "png"
  }
});

if (!image2.content?.image_url) throw new Error("mock image2 did not return image url");

console.log(JSON.stringify({
  ok: true,
  page: `${baseUrl}/`,
  createTaskId: created.id,
  pollStatus: polled.status,
  videoUrl: polled.content.video_url,
  image2Url: image2.content.image_url,
  ffmpegAvailable: health.ffmpeg
}, null, 2));
