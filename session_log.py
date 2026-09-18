"""小玲 · 陪伴日志模块

将每次"心情变化"事件持久化到本地 JSON 文件，供周报页可视化。
纯本地存储，零云端依赖；文件损坏时自动重建，不打断陪伴流程。
"""

import json
import os
import threading
import time
from collections import Counter, defaultdict
from datetime import datetime

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "companion_log.json")

_lock = threading.Lock()


def _ensure_file():
    d = os.path.dirname(LOG_FILE)
    if not os.path.isdir(d):
        os.makedirs(d, exist_ok=True)
    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            json.dump({"events": []}, f, ensure_ascii=False, indent=2)


def _load():
    _ensure_file()
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("events", [])
    except Exception:
        return []


def log_event(mood, platform="", expression="", source="rule", advice=""):
    """记录一次陪伴事件（心情变化时调用）。"""
    with _lock:
        events = _load()
        events.append(
            {
                "ts": time.time(),
                "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "mood": mood,
                "platform": platform or "",
                "expression": expression or "",
                "source": source,
                "advice": advice or "",
            }
        )
        # 只保留最近 1000 条，避免无限膨胀
        events = events[-1000:]
        _ensure_file()
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            json.dump({"events": events}, f, ensure_ascii=False, indent=2)
    return True


def get_timeline(limit=50):
    """最近的事件时间线（新的在前）。"""
    events = _load()
    return list(reversed(events[-limit:]))


def get_reports(days=7):
    """聚合统计：
    - mood_dist: 心情出现次数分布
    - platform_seconds: 各平台累计停留秒数
    - daily: 每日事件数
    - expr_dist: 表情出现次数
    - total: 总事件数 / 首次记录时间 / 最近记录时间
    """
    events = _load()
    now = time.time()
    cutoff = now - days * 86400

    recent = [e for e in events if e["ts"] >= cutoff]
    mood_dist = Counter(e["mood"] for e in recent)
    expr_dist = Counter(e["expression"] for e in recent if e.get("expression"))
    daily = defaultdict(int)
    platform_seconds = defaultdict(float)
    prev = None
    for e in recent:
        day = e["time"][:10]
        daily[day] += 1
        # 粗略统计平台停留：以相邻事件时间差近似
        if prev is not None and prev["platform"]:
            platform_seconds[prev["platform"]] += e["ts"] - prev["ts"]
        prev = e

    total_events = len(events)
    first_ts = events[0]["ts"] if events else None
    last_ts = events[-1]["ts"] if events else None

    return {
        "days": days,
        "mood_dist": dict(mood_dist),
        "expr_dist": dict(expr_dist),
        "daily": {k: daily[k] for k in sorted(daily)},
        "platform_seconds": {k: round(v) for k, v in platform_seconds.items()},
        "total_events": total_events,
        "first_time": datetime.fromtimestamp(first_ts).strftime("%Y-%m-%d %H:%M") if first_ts else "",
        "last_time": datetime.fromtimestamp(last_ts).strftime("%Y-%m-%d %H:%M") if last_ts else "",
    }


def clear_log():
    """清空日志（调试/重置用）。"""
    with _lock:
        _ensure_file()
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            json.dump({"events": []}, f, ensure_ascii=False, indent=2)
    return True
