"""小玲 · 陪伴日志模块测试。

运行：python -m unittest test_session_log -v
覆盖：
- log_event 记录与 timeline 读取
- get_reports 聚合统计（心情分布/平台时长/每日）
- clear_log 清空
- 日志文件损坏时优雅重建
"""

import os
import tempfile
import unittest


class TestSessionLog(unittest.TestCase):
    def setUp(self):
        import session_log as sl
        self.sl = sl
        # 指向临时文件，避免污染真实数据
        self._orig = sl.LOG_FILE
        fd, self._tmp = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        sl.LOG_FILE = self._tmp

    def tearDown(self):
        self.sl.LOG_FILE = self._orig
        try:
            os.remove(self._tmp)
        except OSError:
            pass

    def test_log_and_timeline(self):
        self.sl.log_event(mood="深夜emo刷手机", platform="douyin", expression="sad", source="rule")
        self.sl.log_event(mood="正常状态", platform="netease", expression="", source="ai")
        tl = self.sl.get_timeline()
        self.assertEqual(len(tl), 2)
        # timeline 新的在前
        self.assertEqual(tl[0]["mood"], "正常状态")
        self.assertEqual(tl[0]["platform"], "netease")

    def test_reports_aggregation(self):
        self.sl.log_event(mood="深夜emo刷手机", platform="douyin")
        self.sl.log_event(mood="深夜emo刷手机", platform="douyin")
        self.sl.log_event(mood="正常状态", platform="netease")
        rep = self.sl.get_reports(days=7)
        self.assertEqual(rep["total_events"], 3)
        self.assertEqual(rep["mood_dist"].get("深夜emo刷手机"), 2)
        self.assertEqual(rep["mood_dist"].get("正常状态"), 1)
        self.assertIn("douyin", rep["platform_seconds"])
        self.assertTrue(rep["first_time"])
        self.assertTrue(rep["last_time"])

    def test_clear(self):
        self.sl.log_event(mood="有点烦躁")
        self.sl.clear_log()
        self.assertEqual(self.sl.get_timeline(), [])

    def test_corrupt_file_recovers(self):
        with open(self._tmp, "w", encoding="utf-8") as f:
            f.write("{broken json!!")
        # 损坏时 _load 返回空，且 log_event 能重建
        self.sl.log_event(mood="发呆疲惫")
        tl = self.sl.get_timeline()
        self.assertEqual(len(tl), 1)
        self.assertEqual(tl[0]["mood"], "发呆疲惫")


if __name__ == "__main__":
    unittest.main()