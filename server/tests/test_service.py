import unittest

from shield.detector import DetectionFailed
from shield.service import ShieldService
from shield.store import Store
from shield.transcript import BadSubmission, parse_submission
from shield.youtube import VideoInfo, YouTubeUnavailable

from helpers import VIDEO, FakeDetector, FakeYouTube, payload, settings, wait_until


class Clock:
    def __init__(self):
        self.now = 1_800_000_000.0

    def __call__(self):
        return self.now


class ServiceTests(unittest.TestCase):
    def make(self, detector=None, youtube=None, **setting_changes):
        self.clock = Clock()
        self.store = Store(":memory:", now=self.clock)
        self.detector = detector or FakeDetector()
        self.youtube = youtube or FakeYouTube()
        self.service = ShieldService(settings(**setting_changes), self.store, self.youtube, self.detector, now=self.clock)
        self.addCleanup(self.store.close)
        self.addCleanup(self.service.close)
        return self.service

    def submit(self, install="install-aaaaaaaaaaaa", network="net-a", **changes):
        return self.service.submit(parse_submission(payload(install=install, **changes)), install, network)

    def finished(self, answer):
        """Waits for a background AI check, then returns the viewer's answer."""
        wait_until(lambda: self.service.lookup(VIDEO, answer["transcript"])["status"] != "working")
        return self.service.lookup(VIDEO, answer["transcript"])

    def test_first_viewer_gets_their_answer_but_it_is_not_shared_yet(self):
        self.make()
        self.assertEqual(self.service.lookup(VIDEO), {"status": "unknown"})
        first = self.submit()
        self.assertEqual(first["status"], "working")
        self.assertEqual(self.finished(first)["segments"], [{"start": 10.0, "end": 40.0, "brand": "Acme"}])
        self.assertEqual(self.service.lookup(VIDEO), {"status": "unknown"})  # One viewer is not enough.
        self.assertEqual(self.youtube.calls, 1)

    def test_answer_is_shared_after_a_second_viewer_on_another_network(self):
        self.make()
        self.finished(self.submit())
        # Same install again, or another install on the same network: still not shared.
        self.submit(install="install-aaaaaaaaaaaa", network="net-b")
        self.submit(install="install-bbbbbbbbbbbb", network="net-a")
        self.assertEqual(self.service.lookup(VIDEO)["status"], "unknown")
        answer = self.submit(install="install-cccccccccccc", network="net-c")
        self.assertEqual(answer["status"], "ready")
        self.assertEqual(self.service.lookup(VIDEO)["segments"][0]["brand"], "Acme")
        self.assertEqual(len(self.detector.calls), 1)  # The AI ran once for all of them.

    def test_fake_transcript_only_fools_its_sender(self):
        self.make()
        real = self.finished(self.submit())
        self.submit(install="install-bbbbbbbbbbbb", network="net-b")
        self.detector.parts = [{"start": 0.0, "end": 500.0, "brand": "Fake"}]
        fake = self.submit(install="install-eeeeeeeeeeee", network="net-evil",
                           lines=[[0, "sponsored by Fake"], [500, "end"]])
        self.assertEqual(self.finished(fake)["segments"][0]["brand"], "Fake")
        self.assertEqual(self.service.lookup(VIDEO)["segments"], real["segments"])

    def test_answer_covering_most_of_the_video_is_never_shared(self):
        self.make(detector=FakeDetector(parts=[{"start": 0.0, "end": 400.0, "brand": "Acme"}]))
        self.finished(self.submit())
        self.submit(install="install-bbbbbbbbbbbb", network="net-b")
        self.submit(install="install-cccccccccccc", network="net-c")
        self.assertEqual(self.service.lookup(VIDEO), {"status": "unknown"})
        # Viewers who send the same transcript still get it.
        self.assertEqual(self.submit(install="install-dddddddddddd", network="net-d")["status"], "ready")

    def test_daily_budget_stops_new_checks(self):
        self.make(detector=FakeDetector(cost=0.6), daily_budget_usd=1.0)
        self.finished(self.submit(description="one"))
        self.finished(self.submit(description="two"))
        self.assertGreaterEqual(self.store.spent_today(), 1.0)
        self.assertEqual(self.submit(description="three"), {"status": "unavailable", "reason": "budget"})
        self.clock.now += 86400  # Next day.
        self.assertEqual(self.submit(description="three")["status"], "working")

    def test_per_video_limit_on_different_transcripts(self):
        self.make(max_ai_runs_per_video_per_day=2)
        self.finished(self.submit(description="one"))
        self.finished(self.submit(description="two"))
        self.assertEqual(self.submit(description="three"), {"status": "unavailable", "reason": "video_limit"})

    def test_switching_ai_off(self):
        self.make()
        self.store.set_ai_enabled(False)
        self.assertEqual(self.submit(), {"status": "unavailable", "reason": "ai_off"})
        self.assertEqual(len(self.detector.calls), 0)

    def test_failed_check_is_not_retried_for_ten_minutes(self):
        self.make(detector=FakeDetector(error=DetectionFailed("empty", cost_usd=0.002)))
        failed = self.finished(self.submit())
        self.assertEqual(failed, {"status": "unavailable", "reason": "failed"})
        self.assertAlmostEqual(self.store.spent_today(), 0.002)
        self.assertEqual(self.submit()["status"], "unavailable")
        self.clock.now += 601
        self.detector.error = None
        self.assertEqual(self.finished(self.submit())["status"], "ready")

    def test_unknown_or_too_long_video_is_rejected(self):
        self.make(youtube=FakeYouTube(info=None))
        with self.assertRaises(BadSubmission):
            self.submit()
        self.make(youtube=FakeYouTube(info=VideoInfo("T", duration_seconds=100)))
        with self.assertRaises(BadSubmission):
            self.submit()  # Last caption at 600 s, video is 100 s.

    def test_youtube_down_means_try_later(self):
        self.make(youtube=FakeYouTube(error=YouTubeUnavailable("down")))
        self.assertEqual(self.submit(), {"status": "unavailable", "reason": "youtube"})

    def test_rejected_submissions_leave_no_trace(self):
        self.make()
        self.store.set_ai_enabled(False)
        self.submit()
        self.assertEqual(self.store.summary()["answers"], [])

    def test_busy_when_too_many_checks_are_waiting(self):
        import threading
        gate = threading.Event()

        class SlowDetector(FakeDetector):
            def __call__(self, *args):
                gate.wait(5)
                return super().__call__(*args)

        self.make(detector=SlowDetector(), max_parallel_ai_jobs=1, max_waiting_ai_jobs=1)
        self.assertEqual(self.submit(description="1")["status"], "working")
        self.assertEqual(self.submit(description="2")["status"], "working")
        self.assertEqual(self.submit(description="3"), {"status": "unavailable", "reason": "busy"})
        gate.set()


if __name__ == "__main__":
    unittest.main()
