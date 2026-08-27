/**
 * 小玲 · 前端逻辑
 * 负责：开启/关闭陪伴、摄像头预览、平台启动、监控状态轮询、陪伴对话流渲染。
 */

const API = ""; // 同源，直接相对路径

// ---- DOM ----
const btnToggle = document.getElementById("btnToggle");
const btnCam = document.getElementById("btnCam");
const camVideo = document.getElementById("camVideo");
const camPlaceholder = document.getElementById("camPlaceholder");
const camOverlay = document.getElementById("camOverlay");
const faceBadge = document.getElementById("faceBadge");
const faceLabel = document.getElementById("faceLabel");
const chatLog = document.getElementById("chatLog");
const stRunning = document.getElementById("stRunning");
const stPlatform = document.getElementById("stPlatform");
const stDwell = document.getElementById("stDwell");
const stSwitch = document.getElementById("stSwitch");
const stMood = document.getElementById("stMood");
const modeHint = document.getElementById("modeHint");

const PLATFORM_NAME = { netease: "网易云", douyin: "抖音", bilibili: "B站", other: "其他", none: "无" };
// 表情 → 中文名 / 情绪提示（与后端 mood_rules 判据配合）
const EXPR_LABEL = {
  happy: { txt: "开心", icon: "😄" },
  sad: { txt: "难过", icon: "😢" },
  angry: { txt: "生气", icon: "😠" },
  neutral: { txt: "平静", icon: "😐" },
  surprised: { txt: "惊讶", icon: "😮" },
  fearful: { txt: "害怕", icon: "😨" },
  disgusted: { txt: "嫌弃", icon: "🤢" },
};

let companionOn = false;
let camStream = null;
let pollTimer = null;
let lastMood = null; // 用于去重：心情变化时才推送陪伴话术
let faceReady = false; // face-api 模型是否加载完成
let faceLoopId = null; // 表情检测循环 id
let camCtx = null;

// ---- 共通：向聊天区追加气泡 ----
function pushBubble(kind, text, moodTag) {
  const div = document.createElement("div");
  div.className = `bubble bubble-${kind}`;
  if (moodTag) {
    const tag = document.createElement("span");
    tag.className = "mood-tag";
    tag.textContent = moodTag;
    div.appendChild(tag);
    div.appendChild(document.createElement("br"));
  }
  div.appendChild(document.createTextNode(text));
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ---- 摄像头 ----
async function toggleCam() {
  if (camStream) {
    stopCam();
    return;
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    camVideo.srcObject = camStream;
    camVideo.classList.add("on");
    camPlaceholder.classList.add("hide");
    btnCam.textContent = "关闭摄像头";
    initFaceApi(); // 异步加载模型；不阻塞预览
  } catch (e) {
    camPlaceholder.textContent = "摄像头被拒绝或不可用";
    alert("无法访问摄像头，请在浏览器设置中允许权限。");
  }
}

function stopCam() {
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  camVideo.classList.remove("on");
  camPlaceholder.classList.remove("hide");
  camPlaceholder.textContent = "摄像头已关闭";
  btnCam.textContent = "开启摄像头";
  stopFaceLoop();
  faceBadge.hidden = true;
  faceLabel.hidden = true;
  camCtx && camCtx.clearRect(0, 0, camOverlay.width, camOverlay.height);
}
btnCam.addEventListener("click", toggleCam);

// ---- 表情识别（face-api.js 前端推理，数据不出本机）----
async function initFaceApi() {
  if (window.faceapi === undefined) {
    console.warn("face-api.js 未加载，跳过表情识别");
    return;
  }
  faceBadge.hidden = false;
  faceBadge.classList.add("loading");
  faceBadge.textContent = "⏳ 加载表情模型…";
  try {
    const modelUrl = "models";
    faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
    faceapi.nets.faceExpressionNet.loadFromUri(modelUrl);
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
      faceapi.nets.faceExpressionNet.loadFromUri(modelUrl),
    ]);
    faceReady = true;
    faceBadge.classList.remove("loading");
    faceBadge.textContent = "😊 表情识别中";
    faceLabel.hidden = false;
    startFaceLoop();
  } catch (e) {
    console.error("表情模型加载失败", e);
    faceBadge.textContent = "⚠️ 表情识别不可用";
    faceLabel.hidden = true;
  }
}

function startFaceLoop() {
  if (faceLoopId) return;
  camOverlay.width = camOverlay.offsetWidth || 320;
  camOverlay.height = camOverlay.offsetHeight || 240;
  camCtx = camOverlay.getContext("2d");
  const loop = async () => {
    if (!faceReady || !camStream) {
      faceLoopId = null;
      return;
    }
    try {
      if (camVideo.readyState >= 2) {
        const dets = await faceapi
          .detectAllFaces(camVideo, new faceapi.TinyFaceDetectorOptions())
          .withFaceExpressions();
        drawFaces(dets);
        const expr = getDominantExpr(dets);
        if (expr) {
          reportExpression(expr);
          const l = EXPR_LABEL[expr] || { txt: expr, icon: "🙂" };
          faceLabel.innerHTML = `<span class="expr">${l.icon}</span>小玲看到你现在${l.txt}~`;
        } else {
          faceLabel.innerHTML = `<span class="expr">🙈</span>没找到脸，靠近一点~`;
        }
      }
      faceLoopId = setTimeout(loop, 800); // 每 ~0.8s 检测一次，贴近实时
    } catch (e) {
      console.error("表情检测出错", e);
      faceLoopId = setTimeout(loop, 1500);
    }
  };
  loop();
}

function stopFaceLoop() {
  if (faceLoopId) {
    clearTimeout(faceLoopId);
    faceLoopId = null;
  }
  faceReady = false;
}

function drawFaces(dets) {
  camCtx.clearRect(0, 0, camOverlay.height, camOverlay.width);
  if (!dets.length) return;
  // 视频是 object-fit:cover，画布坐标需匹配裁剪；这里做近似比例对齐
  const vw = camVideo.videoWidth, vh = camVideo.videoHeight;
  const cw = camOverlay.width, ch = camOverlay.height;
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (cw - dw) / 2, oy = (ch - dh) / 2;
  camCtx.strokeStyle = "rgba(255,150,200,0.9)";
  camCtx.lineWidth = 2;
  for (const d of dets) {
    const box = d.detection.box;
    const x = box.x * scale + ox, y = box.y * scale + oy;
    const w = box.width * scale, h = box.height * scale;
    camCtx.beginPath();
    camCtx.rect(x, y, w, h);
    camCtx.stroke();
  }
}

function getDominantExpr(dets) {
  if (!dets.length || !dets[0].expressions) return null;
  const exps = dets[0].expressions; // {happy,sad,..} 概率
  let best = null, bestVal = 0;
  for (const [k, v] of Object.entries(exps)) {
    if (v > bestVal) { bestVal = v; best = k; }
  }
  return best; // 返回概率最高的表情
}

// 上报当前表情给后端，作为心情判断的补充信号（节流：表情变化才发）
let lastReportedExpr = null;
function reportExpression(expr) {
  if (expr === lastReportedExpr) return;
  lastReportedExpr = expr;
  fetch(`${API}/api/face`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expression: expr }),
  }).catch(() => {});
}

// ---- 平台启动 ----
document.querySelectorAll(".btn-app").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const platform = btn.dataset.platform;
    try {
      const res = await fetch(`${API}/api/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const data = await res.json();
      pushBubble(
        "ling",
        `好的，我帮你打开${data.mode === "web" ? "网页版" : "桌面版"}啦～${data.detail ? `（${data.detail}）` : ""}`
      );
    } catch (e) {
      pushBubble("ling", "唔，打开失败了，后端好像没连上。检查一下 start.bat 有没有跑起来？");
    }
  });
});

// ---- 主动陪伴开关 ----
async function startCompanion() {
  try {
    const res = await fetch(`${API}/api/companion/start`, { method: "POST" });
    const data = await res.json();
    companionOn = true;
    btnToggle.textContent = "关闭主动陪伴";
    btnToggle.classList.remove("is-off");
    btnToggle.classList.add("is-on");
    stRunning.textContent = "运行中";
    modeHint.textContent = data.mode === "windows"
      ? "已连接 Windows 窗口监控，正在实时检测前台平台…"
      : "当前为模拟模式（非 Windows 或未装 pywin32），按演示数据轮换平台，方便预览。";
    pushBubble("ling", "好～我开始了。你尽管去刷，我会一直看着你，陪着你。");
    startPolling();
  } catch (e) {
    pushBubble("ling", "没连上后端，请先通过 start.bat 或 python app.py 启动服务。");
  }
}

function stopCompanion() {
  stopPolling();
  fetch(`${API}/api/companion/stop`, { method: "POST" }).catch(() => {});
  companionOn = false;
  btnToggle.textContent = "开启主动陪伴";
  btnToggle.classList.remove("is-on");
  btnToggle.classList.add("is-off");
  stRunning.textContent = "未开启";
  stMood.textContent = "—";
  pushBubble("ling", "好啦，我先不看了。想我的时候再叫我～ 💗");
}

btnToggle.addEventListener("click", () => (companionOn ? stopCompanion() : startCompanion()));

// ---- 状态轮询 + 心情判断 ----
function formatMin(min) {
  return (min > 0 ? min.toFixed(1) : "0") + " 分钟";
}

async function pollStatus() {
  try {
    const stRes = await fetch(`${API}/api/companion/status`);
    const st = await stRes.json();
    stPlatform.textContent = st.current_platform ? PLATFORM_NAME[st.current_platform] || st.current_platform : "—";
    stDwell.textContent = formatMin(st.dwell_minutes || 0);
    stSwitch.textContent = st.switch_count ?? 0;

    const moodRes = await fetch(`${API}/api/mood`);
    const mood = await moodRes.json();
    stMood.textContent = mood.mood;
    if (mood.mood !== lastMood) {
      lastMood = mood.mood;
      pushBubble("ling", mood.message, mood.mood);
      pushBubble("advice", "💡 " + mood.advice, mood.mood);
    }
  } catch (e) {
    /* 后端暂时不可达，静默重试即可 */
  }
}

function startPolling() {
  stopPolling();
  pollStatus(); // 立即执行一次
  pollTimer = setInterval(pollStatus, 2000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  lastMood = null;
}