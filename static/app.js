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
const chatLog = document.getElementById("chatLog");
const stRunning = document.getElementById("stRunning");
const stPlatform = document.getElementById("stPlatform");
const stDwell = document.getElementById("stDwell");
const stSwitch = document.getElementById("stSwitch");
const stMood = document.getElementById("stMood");
const modeHint = document.getElementById("modeHint");

const PLATFORM_NAME = { netease: "网易云", douyin: "抖音", bilibili: "B站", other: "其他", none: "无" };

let companionOn = false;
let camStream = null;
let pollTimer = null;
let lastMood = null; // 用于去重：心情变化时才推送陪伴话术

// ---- 共通：向聊天区追加气泡 ----
// kind: ling|advice|mine ; moodTag: 心情标签 ; sourceTag: "AI" 或 "小玲"（可选）
function pushBubble(kind, text, moodTag, sourceTag) {
  const div = document.createElement("div");
  div.className = `bubble bubble-${kind}`;
  const meta = document.createElement("span");
  meta.className = "bubble-meta";
  meta.textContent = sourceTag ? `· ${sourceTag}` : "";
  if (moodTag) {
    const tag = document.createElement("span");
    tag.className = "mood-tag";
    tag.textContent = moodTag;
    div.appendChild(tag);
    div.appendChild(meta);
    div.appendChild(document.createElement("br"));
  }
  div.appendChild(document.createTextNode(text));
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ---- 摄像头 ----
async function toggleCam() {
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
    camVideo.classList.remove("on");
    camPlaceholder.classList.remove("hide");
    camPlaceholder.textContent = "摄像头已关闭";
    btnCam.textContent = "开启摄像头";
    return;
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    camVideo.srcObject = camStream;
    camVideo.classList.add("on");
    camPlaceholder.classList.add("hide");
    btnCam.textContent = "关闭摄像头";
  } catch (e) {
    camPlaceholder.textContent = "摄像头被拒绝或不可用";
    alert("无法访问摄像头，请在浏览器设置中允许权限。");
  }
}
btnCam.addEventListener("click", toggleCam);

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
    pushBubble(
      "ling",
      "好～我开始了。你尽管去刷，我会一直看着你，陪着你。" +
        (data.ai_enabled ? "（我已开启 AI 个性陪伴 ✨）" : "（未配置 AI Key，我用内置话术陪你）")
    );
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
      const src = mood.source === "ai" ? "AI 个性回应" : "小玲";
      pushBubble("ling", mood.message, mood.mood, src);
      pushBubble("advice", "💡 " + mood.advice, mood.mood, src);
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