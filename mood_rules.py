"""小玲 · 心情规则引擎

输入用户在某平台停留的时长、当前时间段、切换频率等特征，
输出一个心情状态 key，供前端匹配陪伴话术。
纯规则、零依赖、可测试。
"""

import random


def _hour_of_day():
    from datetime import datetime
    return datetime.now().hour


def judge_mood(platform, dwell_minutes, switch_count, idle_minutes, hour=None):
    """根据使用特征推断心情状态。

    参数：
        platform      当前平台: "netease" | "douyin" | "bilibili" | "other"/None
        dwell_minutes 在当前平台累计停留分钟数
        switch_count  监控期间平台切换次数
        idle_minutes  无操作/空闲分钟数
        hour          当前小时（不传则取系统时间，便于测试注入）
    """
    if hour is None:
        hour = _hour_of_day()

    # 1. 长时间无操作 → 发呆 / 疲惫
    if idle_minutes >= 8:
        return "发呆疲惫"

    # 2. 深夜刷短视频 → 深夜 emo
    is_night = hour >= 23 or hour < 5
    if is_night and platform == "douyin" and dwell_minutes >= 40:
        return "深夜emo刷手机"

    # 3. 长时间刷长视频且频繁切换 → 无聊打发时间
    if platform == "bilibili" and dwell_minutes >= 60 and switch_count >= 4:
        return "无聊打发时间"

    # 4. 长时间听歌 → 听歌沉浸 / 低落
    if platform == "netease" and dwell_minutes >= 45:
        return "听歌沉浸低落"

    # 5. 短时间内频繁跳平台 → 注意力分散 / 焦虑
    if switch_count >= 5 and dwell_minutes < 15:
        return "注意力分散焦虑"

    # 6. 其他 → 正常
    return "正常状态"


def pick_companion(mood_library, mood_key):
    """从话术库里为某种心情随机挑选一条小玲的话（保持两个状态之间不同）。"""
    data = mood_library.get(mood_key) or mood_library["正常状态"]
    message = random.choice(data["messages"])
    return {
        "mood": mood_key,
        "message": message,
        "advice": data["advice"],
        "color": data.get("color", "#27c08a"),
    }