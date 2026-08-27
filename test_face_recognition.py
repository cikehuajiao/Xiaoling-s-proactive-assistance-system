"""小玲 · 表情识别心情融合测试。

运行：python -m unittest test_face_recognition -v
覆盖：
- 消极表情优先于长时规则触发对应心情
- 无表情时不触发表情心情
- /api/face 校验合法/非法表情
"""

import unittest


class TestExpressionMood(unittest.TestCase):
    def test_sad_overrides_longtime(self):
        from mood_rules import judge_mood
        # 即使满足"发呆疲惫"（idle>=8），表情 sad 也应优先触发倾诉
        self.assertEqual(
            judge_mood(platform="bilibili", dwell_minutes=10, switch_count=2,
                       idle_minutes=20, hour=15, expression="sad"),
            "心情低落想倾诉",
        )

    def test_angry_mood(self):
        from mood_rules import judge_mood
        self.assertEqual(
            judge_mood(platform="netease", dwell_minutes=5, switch_count=1,
                       idle_minutes=0, hour=15, expression="angry"),
            "有点烦躁",
        )

    def test_no_expression_falls_back(self):
        from mood_rules import judge_mood
        # 无表情时不应进入表情心情
        m = judge_mood(platform="douyin", dwell_minutes=5, switch_count=1,
                       idle_minutes=0, hour=15, expression="")
        self.assertNotIn(m, ("心情低落想倾诉", "有点烦躁", "感到不安"))

    def test_happy_is_neutral_signal(self):
        from mood_rules import judge_mood
        # happy 不触发表情心情，当作无信号
        m = judge_mood(platform="netease", dwell_minutes=5, switch_count=1,
                       idle_minutes=0, hour=15, expression="happy")
        self.assertEqual(m, "正常状态")

    def test_face_endpoint_valid(self):
        import app as app_module
        r = app_module.monitor
        # 直接调用路由函数（FastAPI 依赖/响应可剥离验证）
        resp = app_module.report_expression({"expression": "sad"})
        self.assertTrue(resp["ok"])
        # 非法表情
        bad = app_module.report_expression({"expression": "zzz"})
        self.assertFalse(bad["ok"])


if __name__ == "__main__":
    unittest.main()