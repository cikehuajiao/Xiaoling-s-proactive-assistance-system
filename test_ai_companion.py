"""小玲 · AI 陪伴模块测试。

运行：python -m unittest test_ai_companion -v
覆盖：
- 未配置 Key 时 generate_companion 返回 None（触发回退）
- _parse_json 能容忍 ```json 包裹
- /api/mood 在无 Key 时正常回退到预设话术（source=rule）
"""

import os
import unittest


class TestAIParser(unittest.TestCase):
    def setUp(self):
        # 确保测试环境无 Key
        self._saved = os.environ.pop("XIAOLING_AI_API_KEY", None)

    def tearDown(self):
        if self._saved:
            os.environ["XIAOLING_AI_API_KEY"] = self._saved

    def test_not_configured_returns_none(self):
        from ai_companion import generate_companion, is_configured
        self.assertFalse(is_configured())
        self.assertIsNone(generate_companion("正常状态", {"current_platform": "netease"}))

    def test_parse_json_handles_codeblock(self):
        from ai_companion import _parse_json
        raw = '```json\n{"greeting": "嗨", "advice": "加油"}\n```'
        parsed = _parse_json(raw)
        self.assertEqual(parsed["greeting"], "嗨")
        self.assertEqual(parsed["advice"], "加油")

    def test_mood_endpoint_falls_back_without_key(self):
        import app as app_module
        resp = app_module.get_mood()
        self.assertEqual(resp["source"], "rule")
        self.assertIn("message", resp)
        self.assertFalse(resp["ai_enabled"])


if __name__ == "__main__":
    unittest.main()