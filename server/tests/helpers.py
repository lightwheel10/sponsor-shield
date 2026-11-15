"""Shared test helpers: fake settings, fake YouTube, a fake AI."""
import time

from shield.config import Settings
from shield.detector import Detection, Usage
from shield.youtube import VideoInfo

VIDEO = "dQw4w9WgXcQ"
OTHER_VIDEO = "abcdefghijk"


def settings(**changes):
    values = dict(deepseek_api_key="test-key", hash_secret=b"x" * 32, database_path=":memory:",
                  port=0, daily_budget_usd=1.0, max_parallel_ai_jobs=2, max_waiting_ai_jobs=2,
                  max_ai_runs_per_video_per_day=3, confirmations_needed=2)
    values.update(changes)
    return Settings(**values)


def payload(video=VIDEO, install="install-aaaaaaaaaaaa", lines=None, description="desc", paid=None, language="en"):
    return {
        "videoId": video,
        "installId": install,
        "language": language,
        "lines": lines if lines is not None else [[0, "hello"], [10, "this video is sponsored by Acme"], [40, "back to it"], [600, "bye"]],
        "description": description,
        "paidLabel": paid,
    }


class FakeYouTube:
    def __init__(self, info=VideoInfo(title="A video", duration_seconds=None), error=None):
        self.info = info
        self.error = error
        self.calls = 0

    def video_info(self, video_id):
        self.calls += 1
        if self.error:
            raise self.error
        return self.info


class FakeDetector:
    """Returns fixed parts; can be told to fail or to wait."""

    def __init__(self, parts=None, cost=0.01, error=None):
        self.parts = parts if parts is not None else [{"start": 10.0, "end": 40.0, "brand": "Acme"}]
        self.cost = cost
        self.error = error
        self.calls = []

    def __call__(self, title, lines, description, paid_label):
        self.calls.append((title, lines, description, paid_label))
        if self.error:
            raise self.error
        usage = Usage(cache_miss_tokens=int(self.cost * 1_000_000 / 0.30))
        return Detection(parts=[dict(part) for part in self.parts], why="test", usage=usage, seconds=0.0)


def wait_until(condition, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.01)
    raise AssertionError("condition not met in time")
