"""小玲 · 平台启动模块

一键打开网易云 / 抖音 / B 站。
优先尝试桌面客户端（通过常见安装路径），找不到则回退打开网页版。
"""

import os
import subprocess
import webbrowser
import shutil

# 平台 → (候选安装路径, 网页地址)
PLATFORMS = {
    "netease": {
        "name": "网易云音乐",
        "web": "https://music.163.com",
        "paths": [
            r"C:\Program Files\Netease\CloudMusic\cloudmusic.exe",
            r"C:\Program Files (x86)\Netease\CloudMusic\cloudmusic.exe",
        ],
    },
    "douyin": {
        "name": "抖音",
        "web": "https://www.douyin.com",
        "paths": [
            r"C:\Program Files\douyin\Douyin.exe",
            r"C:\Program Files (x86)\douyin\Douyin.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\抖音\Douyin.exe"),
        ],
    },
    "bilibili": {
        "name": "哔哩哔哩",
        "web": "https://www.bilibili.com",
        "paths": [
            r"C:\Program Files\bilibili\Bilibili.exe",
            r"C:\Program Files (x86)\bilibili\Bilibili.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\哔哩哔哩\Bilibili.exe"),
        ],
    },
}


def launch(platform_key):
    """返回 dict: {ok, mode: 'desktop'|'web', detail}"""
    info = PLATFORMS.get(platform_key)
    if not info:
        return {"ok": False, "mode": "none", "detail": f"未知平台 {platform_key}"}

    # 1. 优先桌面端
    for path in info["paths"]:
        if path and os.path.exists(path):
            subprocess.Popen([path])
            return {"ok": True, "mode": "desktop", "detail": path}

    # 2. 回退网页端
    try:
        webbrowser.open(info["web"])
        return {"ok": True, "mode": "web", "detail": info["web"]}
    except Exception as e:
        return {"ok": False, "mode": "web", "detail": str(e)}