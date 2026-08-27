"""小玲 · 窗口监控模块

通过 pywin32 轮询前台窗口标题，识别用户当前停留在哪个平台。
纯本地运行，不采集任何隐私内容，仅匹配平台关键词。

若运行在非 Windows 或未安装 pywin32，会自动降级为"模拟模式"，
方便在开发环境调试前端流程。
"""

import time
from dataclasses import dataclass, field

# 平台 → 窗口标题关键词匹配表（可自定义扩展）
PLATFORM_KEYWORDS = {
    "netease": ["网易云", "网易音乐", "cloudmusic", "netease"],
    "douyin": ["抖音", "douyin", "抖音桌面版"],
    "bilibili": ["bilibili", "哔哩哔哩", "b站", "哔哩"],
}


@dataclass
class MonitorState:
    running: bool = False
    current_platform: str = "other"       # netease / douyin / bilibili / other / none
    current_title: str = ""
    dwell_start: float = None             # 当前平台开始停留的时间戳
    dwell_seconds: float = 0
    switch_count: int = 0
    total_seconds: float = 0
    idle_seconds: float = 0               # 累计"无操作"时间（标题无变化）
    seen_platforms: set = field(default_factory=set)


class WindowMonitor:
    def __init__(self, interval=2.0):
        self.interval = interval
        self.state = MonitorState()
        self._simulated = not self._pywin32_available()
        self._last_title = None

    @staticmethod
    def _pywin32_available():
        try:
            import win32gui  # noqa: F401
            return True
        except ImportError:
            return False

    def start(self):
        self.state = MonitorState(running=True)
        return {"ok": True, "mode": "simulated" if self._simulated else "windows"}

    def stop(self):
        self.state.running = False
        return {"ok": True}

    def get_status(self):
        s = self.state
        dwell_min = round(s.dwell_seconds / 60, 1) if s.dwell_start else 0
        return {
            "running": s.running,
            "mode": "simulated" if self._simulated else "windows",
            "current_platform": s.current_platform,
            "current_title": s.current_title,
            "dwell_minutes": dwell_min,
            "switch_count": s.switch_count,
            "total_seconds": round(s.total_seconds, 1),
            "idle_seconds": round(s.idle_seconds, 1),
            "seen_platforms": sorted(s.seen_platforms),
        }

    def _detect_title(self):
        """返回前台窗口标题。模拟模式下按时间轮换演示平台。"""
        if self._simulated:
            demo = [
                "网易云音乐",
                "抖音 - 视频",
                "bilibili (哔哩哔哩) 客户端",
                "微信",
                "网易云音乐",
            ]
            idx = int(time.time() // (4 * self.interval)) % len(demo)
            return demo[idx]
        try:
            import win32gui
            hwnd = win32gui.GetForegroundWindow()
            return win32gui.GetWindowText(hwnd)
        except Exception:
            return ""

    @staticmethod
    def _match_platform(title):
        for platform, kws in PLATFORM_KEYWORDS.items():
            if any(kw in title for kw in kws):
                return platform
        return "other" if title else "none"

    def poll(self):
        """执行一次检测，推进状态机。"""
        if not self.state.running:
            return

        title = self._detect_title()
        platform = self._match_platform(title)
        now = time.time()
        s = self.state

        if s.current_platform is None or platform != s.current_platform:
            # 平台切换/首次
            if s.dwell_start is not None:
                s.dwell_seconds += now - s.dwell_start
                s.switch_count += 1
            s.current_platform = platform
            s.current_title = title
            s.dwell_start = now
            if platform in ("netease", "douyin", "bilibili"):
                s.seen_platforms.add(platform)
            s.idle_seconds = 0
            s._last_title = title if self._simulated else title
        else:
            # 同一窗口，累计空闲判断
            if title != s._last_title:
                s.idle_seconds = 0
            else:
                s.idle_seconds += self.interval
            s._last_title = title

        # 累计总时长（仅从开始到结束整段监控的进程时间）
        # dwell 时长由 dwell_minutes 提供，total 用于前端展示 tips
        return self.get_status()