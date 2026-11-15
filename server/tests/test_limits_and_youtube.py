import io
import unittest
import urllib.error

from shield.limits import RateLimiter
from shield.youtube import VideoInfo, YouTubeChecker, YouTubeUnavailable, parse_iso_duration


class RateLimiterTests(unittest.TestCase):
    def test_allows_up_to_the_limit_then_blocks_until_next_window(self):
        now = [0.0]
        limiter = RateLimiter(limit=2, window_seconds=60, clock=lambda: now[0])
        self.assertEqual([limiter.allow("a"), limiter.allow("a"), limiter.allow("a")], [True, True, False])
        self.assertTrue(limiter.allow("b"))  # Other keys are separate.
        now[0] = 61
        self.assertTrue(limiter.allow("a"))

    def test_memory_stays_bounded(self):
        limiter = RateLimiter(limit=1, window_seconds=60, clock=lambda: 0.0, max_keys=100)
        for number in range(1000):
            limiter.allow(str(number))
        self.assertLessEqual(len(limiter._counts), 100)


def http_error(code):
    return urllib.error.HTTPError("https://example.invalid", code, "error", {}, io.BytesIO(b""))


class YouTubeCheckerTests(unittest.TestCase):
    def test_duration_parsing(self):
        self.assertEqual(parse_iso_duration("PT1H2M3S"), 3723)
        self.assertEqual(parse_iso_duration("PT45S"), 45)
        self.assertEqual(parse_iso_duration("P1DT1S"), 86401)
        self.assertIsNone(parse_iso_duration("P0D"))  # live stream
        self.assertIsNone(parse_iso_duration("junk"))

    def test_existing_video_uses_youtubes_title_and_is_cached(self):
        calls = []

        def fetch(url):
            calls.append(url)
            return {"title": "Real title"}

        checker = YouTubeChecker(fetch_json=fetch)
        self.assertEqual(checker.video_info("dQw4w9WgXcQ"), VideoInfo("Real title", None))
        checker.video_info("dQw4w9WgXcQ")
        self.assertEqual(len(calls), 1)
        self.assertIn("oembed", calls[0])

    def test_missing_video_is_none_and_not_cached(self):
        calls = []

        def fetch(url):
            calls.append(url)
            raise http_error(404)

        checker = YouTubeChecker(fetch_json=fetch)
        self.assertIsNone(checker.video_info("dQw4w9WgXcQ"))
        self.assertIsNone(checker.video_info("dQw4w9WgXcQ"))
        self.assertEqual(len(calls), 2)

    def test_embedding_disabled_still_counts_as_existing(self):
        def fetch(url):
            raise http_error(401)
        self.assertEqual(YouTubeChecker(fetch_json=fetch).video_info("dQw4w9WgXcQ").title, "(untitled)")

    def test_youtube_down_raises_unavailable(self):
        def fetch(url):
            raise http_error(503)
        with self.assertRaises(YouTubeUnavailable):
            YouTubeChecker(fetch_json=fetch).video_info("dQw4w9WgXcQ")

    def test_data_api_key_adds_real_length(self):
        def fetch(url):
            if "googleapis" in url:
                return {"items": [{"contentDetails": {"duration": "PT10M"}}]}
            return {"title": "T"}
        self.assertEqual(YouTubeChecker("key", fetch_json=fetch).video_info("dQw4w9WgXcQ").duration_seconds, 600)


if __name__ == "__main__":
    unittest.main()
