/**
 * 小玲 · 陪伴周报前端
 * 拉取 /api/reports 与 /api/logs，用 Canvas 手绘图表（零依赖）。
 */

const API = "";

const MOOD_EMOJI = {
  "深夜emo刷手机": "🌙", "无聊打发时间": "😶", "听歌沉浸低落": "🎧",
  "注意力分散焦虑": "🌀", "发呆疲惫": "🥱", "心情低落想倾诉": "😢",
  "有点烦躁": "😠", "感到不安": "😨", "正常状态": "🙂",
};
const PLATFORM_NAME = { netease: "网易云", douyin: "抖音", bilibili: "B站", other: "其他", none: "无" };
const EXPR_NAME = {
  happy: "😄 开心", sad: "😢 难过", angry: "😠 生气", neutral: "😐 平静",
  surprised: "😮 惊讶", fearful: "😨 害怕", disgusted: "🤢 嫌弃",
};
const PALETTE = ["#ff6f91", "#7c6cf0", "#27c08a", "#4aa8ff", "#ffb020", "#e0c341", "#ff8a5c", "#5cd6c9", "#b388ff"];

// roundRect polyfill（老浏览器不支持）
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (typeof r === "number") r = { tl: r, tr: r, br: r, bl: r };
    else r = r || {};
    const tl = r.tl || 0, tr = r.tr || 0, br = r.br || 0, bl = r.bl || 0;
    this.moveTo(x + tl, y);
    this.arcTo(x + w, y, x + w, y + h, tr);
    this.arcTo(x + w, y + h, x, y + h, br);
    this.arcTo(x, y + h, x, y, bl);
    this.arcTo(x, y, x + w, y, tl);
    this.closePath();
    return this;
  };
}

let reportsData = null;

async function loadAll() {
  try {
    const [rep, logs] = await Promise.all([
      fetch(`${API}/api/reports`).then((r) => r.json()),
      fetch(`${API}/api/logs?limit=50`).then((r) => r.json()),
    ]);
    reportsData = rep;
    renderStats(rep);
    renderMoodChart(rep.mood_dist);
    renderPlatformChart(rep.platform_seconds);
    renderDailyChart(rep.daily);
    renderExprCloud(rep.expr_dist);
    renderTimeline(logs.events);
  } catch (e) {
    console.error("加载周报失败", e);
  }
}

// ---- 统计卡片 ----
function renderStats(r) {
  document.getElementById("stTotal").textContent = r.total_events;
  document.getElementById("stMoods").textContent = Object.keys(r.mood_dist).length;
  document.getElementById("stFirst").textContent = r.first_time || "—";
  document.getElementById("stLast").textContent = r.last_time || "—";
}

// ---- 通用横向条形图 ----
function drawHBar(canvasId, items, labelFn, valueFn) {
  const canvas = document.getElementById(canvasId);
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const entries = Object.entries(items).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    drawEmpty(ctx, w, h, "暂无数据");
    return;
  }
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const rowH = Math.min(34, (h - 30) / entries.length);
  const startY = 20;
  ctx.font = "13px 'PingFang SC', 'Microsoft YaHei', sans-serif";

  entries.forEach(([key, val], i) => {
    const y = startY + i * rowH;
    const color = PALETTE[i % PALETTE.length];
    const barW = Math.max(8, (val / max) * (w - 140));

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.roundRect(6, y + 2, w - 20, rowH - 10, 8);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(6, y + 2, barW, rowH - 10, 8);
    ctx.fill();

    ctx.fillStyle = "#e8eaf2";
    ctx.textAlign = "left";
    ctx.fillText(labelFn(key), w - 128, y + rowH / 2 + 4);

    ctx.fillStyle = "#c9cddd";
    ctx.textAlign = "right";
    ctx.fillText(valueFn ? valueFn(val) : String(val), w - 16, y + rowH / 2 + 4);
  });
}

// ---- 心情分布 ----
function renderMoodChart(dist) {
  drawHBar("moodChart", dist, (k) => `${MOOD_EMOJI[k] || "🎭"} ${k}`);
}

// ---- 平台占比 ----
function renderPlatformChart(seconds) {
  drawHBar("platformChart", seconds, (k) => `${PLATFORM_NAME[k] || k}`, formatDuration);
}

// ---- 每日柱状图 ----
function renderDailyChart(daily) {
  const canvas = document.getElementById("dailyChart");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const days = Object.keys(daily);
  if (!days.length) {
    drawEmpty(ctx, w, h, "暂无数据");
    return;
  }
  const max = Math.max(...Object.values(daily), 1);
  const padL = 26, padB = 26, padT = 14;
  const chartW = w - padL - 10, chartH = h - padT - padB;
  const n = days.length;
  const barW = Math.min(44, (chartW / n) * 0.6);
  const gap = (chartW - barW * n) / (n + 1);

  // Y 轴刻度
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.fillStyle = "#9aa0b5";
  ctx.font = "11px 'PingFang SC', sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 3; i++) {
    const v = Math.round((max / 3) * i);
    const y = padT + chartH - (chartH * i) / 3;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - 10, y); ctx.stroke();
    ctx.fillText(String(v), padL - 6, y + 4);
  }

  days.forEach((day, i) => {
    const x = padL + gap + i * (barW + gap);
    const v = daily[day];
    const bh = Math.max(4, (v / max) * chartH);
    const y = padT + chartH - bh;
    const color = PALETTE[i % PALETTE.length];

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, bh, 6);
    ctx.fill();

    ctx.fillStyle = "#e8eaf2";
    ctx.textAlign = "center";
    ctx.fillText(v, x + barW / 2, y - 6);

    const label = day.slice(5);
    ctx.fillStyle = "#9aa0b5";
    ctx.fillText(label, x + barW / 2, h - 8);
  });
}

// ---- 表情云 ----
function renderExprCloud(dist) {
  const el = document.getElementById("exprCloud");
  const entries = Object.entries(dist);
  if (!entries.length) {
    el.innerHTML = '<span class="empty">暂无表情数据</span>';
    return;
  }
  const max = Math.max(...entries.map(([, v]) => v), 1);
  el.innerHTML = entries
    .map(([k, v]) => {
      const size = 14 + Math.round((v / max) * 18);
      return `<span class="expr-chip" style="font-size:${size}px">${EXPR_NAME[k] || k} · ${v}</span>`;
    })
    .join("");
}

// ---- 时间线 ----
function renderTimeline(events) {
  const el = document.getElementById("timeline");
  if (!events || !events.length) {
    el.innerHTML = '<div class="empty">还没有记录，去主界面开启主动陪伴吧～</div>';
    return;
  }
  el.innerHTML = events
    .map((e) => {
      const emoji = MOOD_EMOJI[e.mood] || "🎭";
      const expr = e.expression ? EXPR_NAME[e.expression] : "";
      const src = e.source === "ai" ? "✨ AI" : "小玲";
      return `<div class="tl-item">
        <span class="tl-time">${e.time}</span>
        <span class="tl-mood">${emoji} ${e.mood}</span>
        ${e.platform ? `<span class="tl-tag">${PLATFORM_NAME[e.platform] || e.platform}</span>` : ""}
        ${expr ? `<span class="tl-tag">${expr}</span>` : ""}
        <span class="tl-tag dim">${src}</span>
      </div>`;
    })
    .join("");
}

function drawEmpty(ctx, w, h, text) {
  ctx.fillStyle = "#9aa0b5";
  ctx.font = "14px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2);
}

function formatDuration(sec) {
  if (sec >= 3600) return `${(sec / 3600).toFixed(1)}h`;
  return `${Math.round(sec / 60)}m`;
}

// ---- 清空日志 ----
document.getElementById("btnClear").addEventListener("click", async () => {
  if (!confirm("确定清空所有陪伴日志吗？此操作不可恢复。")) return;
  await fetch(`${API}/api/logs/clear`, { method: "POST" });
  loadAll();
});
document.getElementById("btnRefresh").addEventListener("click", loadAll);

loadAll();
