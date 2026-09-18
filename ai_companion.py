"""小玲 · AI 个性陪伴模块

基于心情判断层给出的 mood + 上下文（当前平台、停留时长、时段等），
调用大模型生成个性化陪伴回复与建议。

设计要点：
- 默认使用 DeepSeek（OpenAI 兼容接口），可通过环境变量切换任意兼容供应商
- 未配置 API Key 时返回 None，调用方自动回退到预设话术库
- 所有异常（网络、超时）都会降级为 None，绝不把错误抛给前端打断陪伴流程
"""

import os

# OpenAI 兼容 Chat Completions 接口
API_BASE_URL = os.environ.get("XIAOLING_AI_BASE_URL", "https://api.deepseek.com/v1")
API_KEY = os.environ.get("XIAOLING_AI_API_KEY", "")
MODEL = os.environ.get("XIAOLING_AI_MODEL", "deepseek-chat")
TIMEOUT = float(os.environ.get("XIAOLING_AI_TIMEOUT", "15"))

_SYSTEM_PROMPT = """你是一位温柔、善解人意的陪伴助手「小玲」，人称"反差萌大姐姐"。
工作时逻辑清晰、正式；日常聊天亲切软萌、带点撒娇感，像可靠的学姐。
当前用户在电脑前使用多媒体平台，系统检测到他的心情状态。请根据给定的心情和上下文，
用一句温暖的话回应他，并给出一条简短、可执行的建议。
要求：
- 语气自然口语化，不要像客服，不要用"我们"这类突兀词
- 建议要具体、可落地（例如"关掉抖音，去做 10 个深蹲"），不要空泛
- 总字数控制在 80 字以内，输出 JSON 格式
严格只输出 JSON，不要输出任何其他文字，格式如下：
{"greeting": "你的回应语", "advice": "你的建议"}
"""

_CONTEXT_HINT = {
    "深夜emo刷手机": "深夜还在刷短视频，可能有点低落、舍不得放下手机",
    "无聊打发时间": "长时间刷视频且频繁切换，像是无聊想打发时间",
    "听歌沉浸低落": "长时间听歌，可能沉浸在情绪里，有点低落",
    "注意力分散焦虑": "短时间内频繁切换多个平台，注意力分散、可能焦虑",
    "发呆疲惫": "长时间没有操作，可能是发呆或疲惫",
    "正常状态": "状态正常，情绪平稳",
}


def is_configured() -> bool:
    """是否已配置可用的 API Key。"""
    return bool(API_KEY.strip())


def _build_user_prompt(mood: str, status: dict) -> str:
    now_desc = _CONTEXT_HINT.get(mood, "状态未知")
    platform = status.get("current_platform") or "其他"
    dwell = status.get("dwell_minutes", 0)
    switch = status.get("switch_count", 0)
    return (
        f"当前心情：{mood}（{now_desc}）\n"
        f"当前平台：{platform}，已停留 {dwell:.0f} 分钟，本次共切换 {switch} 次。\n"
        f"请以「小玲」的身份温柔陪伴我。"
    )


def generate_companion(mood: str, status: dict):
    """生成个性化陪伴回复。未配置 Key 或失败时返回 None。

    返回：{"mood", "message"(greeting), "advice", "source": "ai"} 或 None
    """
    if not is_configured():
        return None
    try:
        import httpx

        resp = httpx.post(
            f"{API_BASE_URL.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}"},
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": _build_user_prompt(mood, status)},
                ],
                "temperature": 0.9,
                "max_tokens": 120,
                "response_format": {"type": "json_object"},
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        parsed = _parse_json(content)
        if parsed and parsed.get("greeting"):
            return {
                "mood": mood,
                "message": parsed["greeting"],
                "advice": parsed.get("advice", ""),
                "source": "ai",
            }
    except Exception:
        # 任何异常都静默降级，由调用方回退到预设话术
        return None
    return None


def _parse_json(text: str) -> dict:
    """容忍模型返回时带 ```json 包裹或首尾空白。"""
    import json
    import re

    text = text.strip()
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        text = m.group(0)
    try:
        return json.loads(text)
    except Exception:
        return {}