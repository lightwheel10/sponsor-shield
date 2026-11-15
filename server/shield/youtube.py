"""Asks YouTube itself about a video, so we never rely on what a browser claims.

Two public, official sources are used:
- oEmbed (no key needed): tells us the video exists and gives its real title.
- Data API (optional key): gives the real length, so a fake transcript that is
  much longer than the video can be refused.
"""
import json
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from dataclasses import dataclass

TIMEOUT_SECONDS = 6
CACHE_SIZE = 5_000


class YouTubeUnavailable(RuntimeError):
    """YouTube could not be asked right now; try again later."""


@dataclass(frozen=True)
class VideoInfo:
    title: str
    # Length in seconds, or None when unknown (no Data API key, or a live stream).
    duration_seconds: object = None


def _get_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "SponsorShield/1.0"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.load(response)


def parse_iso_duration(text):
    """'PT1H2M3S' -> 3723. Returns None for anything else (e.g. live 'P0D')."""
    match = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", text or "")
    if not match:
        return None
    days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
    total = days * 86400 + hours * 3600 + minutes * 60 + seconds
    return total or None


class YouTubeChecker:
    def __init__(self, data_api_key="", fetch_json=_get_json):
        self._data_api_key = data_api_key
        self._fetch_json = fetch_json
        self._cache = OrderedDict()  # video id -> VideoInfo (only videos that exist)
        self._lock = threading.Lock()

    def video_info(self, video_id):
        """Returns VideoInfo, or None if the video does not exist (or is private)."""
        with self._lock:
            if video_id in self._cache:
                self._cache.move_to_end(video_id)
                return self._cache[video_id]
        info = self._ask_youtube(video_id)
        if info is None:
            return None  # Not cached: a just-published video may appear soon.
        with self._lock:
            self._cache[video_id] = info
            while len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
        return info

    def _ask_youtube(self, video_id):
        watch_url = "https://www.youtube.com/watch?v=" + video_id
        oembed_url = "https://www.youtube.com/oembed?" + urllib.parse.urlencode({"url": watch_url, "format": "json"})
        try:
            title = str(self._fetch_json(oembed_url).get("title", ""))[:300]
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                title = ""  # Exists, but the owner turned off embedding.
            elif error.code in (400, 404):
                return None
            else:
                raise YouTubeUnavailable(f"oEmbed returned HTTP {error.code}") from error
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            raise YouTubeUnavailable("oEmbed request failed") from error
        return VideoInfo(title=title or "(untitled)", duration_seconds=self._duration(video_id))

    def _duration(self, video_id):
        if not self._data_api_key:
            return None
        url = "https://www.googleapis.com/youtube/v3/videos?" + urllib.parse.urlencode(
            {"part": "contentDetails", "id": video_id, "key": self._data_api_key})
        try:
            items = self._fetch_json(url).get("items", [])
        except (urllib.error.URLError, TimeoutError, ValueError):
            return None  # The length check is a bonus; never block on it.
        if not items:
            return None
        return parse_iso_duration(items[0].get("contentDetails", {}).get("duration"))
