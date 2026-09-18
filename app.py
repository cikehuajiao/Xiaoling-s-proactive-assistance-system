"""小玲 · FastAPI 后端入口

运行：python app.py  →  http://localhost:7788

提供 REST API 给前端调用：
  POST /api/companion/start    开启主动陪伴
  POST /api/companion/stop     关闭主动陪伴
  GET  /api/companion/status   当前监控状态
  POST /api/launch            启动平台 {platform: netease|douyin|bilibili}
  GET  /api/mood              当前心情 + 小玲陪伴话术
"""

import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from monitor import WindowMonitor
from launcher import launch
from mood_rules import judge_mood, pick_companion
from companion_data import MOOD_LIBRARY
from ai_companion import generate_companion, is_configured
from session_log import log_event, get_timeline, get_reports, clear_log


def _poll_loop():
    """后台线程：持续轮询前台窗口并推进状态机。"""
    while True:
        try:
            if monitor.state.running:
                monitor.poll()
        except Exception:
            pass
        time.sleep(monitor.interval)


monitor = WindowMonitor(interval=2.0)
_running = {"last_mood": "正常状态"}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    t = threading.Thread(target=_poll_loop, daemon=True)
    t.start()
    yield


app = FastAPI(title="小玲 XiaoLing", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/companion/start")
def start_companion():
    monitor.start()
    return {"ok": True, "ai_enabled": is_configured(), **monitor.get_status()}


@app.post("/api/companion/stop")
def stop_companion():
    monitor.stop()
    return {"ok": True}


@app.get("/api/companion/status")
def status():
    return monitor.get_status()


@app.post("/api/launch")
def launch_platform(payload: dict):
    platform = payload.get("platform", "")
    return launch(platform)


@app.get("/api/mood")
def get_mood():
    s = monitor.get_status()
    mood = judge_mood(
        platform=s["current_platform"],
        dwell_minutes=s["dwell_minutes"],
        switch_count=s["switch_count"],
        idle_minutes=round(s["idle_seconds"] / 60, 1),
        expression=s["expression"],
    )

    # 优先使用 AI 个性化陪伴；未配置 Key 或调用失败时回退预设话术
    ai = generate_companion(mood, s) if is_configured() else None
    base = pick_companion(MOOD_LIBRARY, mood)
    if ai:
        resp = {"mood": mood, "message": ai["message"], "advice": ai["advice"], "source": "ai"}
    else:
        resp = {**base, "source": "rule"}

    # 心情变化时才记录日志，并更新 last_mood
    if _running.get("last_mood") != mood:
        _running["last_mood"] = mood
        log_event(
            mood=mood,
            platform=s["current_platform"],
            expression=s["expression"],
            source=resp["source"],
            advice=resp.get("advice", ""),
        )

    resp["status"] = s
    resp["ai_enabled"] = is_configured()
    return resp


@app.get("/api/logs")
def logs(limit: int = 50):
    """最近陪伴事件时间线。"""
    return {"events": get_timeline(limit)}


@app.get("/api/reports")
def reports(days: int = 7):
    """陪伴周报聚合统计。"""
    return get_reports(days)


@app.post("/api/logs/clear")
def logs_clear():
    """清空陪伴日志。"""
    clear_log()
    return {"ok": True}


@app.post("/api/face")
def report_expression(payload: dict):
    """接收前端识别的表情，作为心情判断的补充信号。"""
    expr = payload.get("expression", "")
    valid = {"happy", "sad", "angry", "neutral", "surprised", "fearful", "disgusted"}
    if expr not in valid:
        return {"ok": False, "detail": "invalid expression"}
    monitor.state.expression = expr
    return {"ok": True, "expression": expr}


# 托管前端静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def index():
    from fastapi.responses import FileResponse
    return FileResponse("static/index.html")


@app.get("/reports.html")
def reports_page():
    from fastapi.responses import FileResponse
    return FileResponse("static/reports.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=7788)