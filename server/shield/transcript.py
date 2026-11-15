"""Checks and cleans what a browser sends us, before anything else looks at it.

Everything in a submission comes from a viewer's browser, so none of it is
trusted. This module rejects anything malformed or oversized, and turns the
transcript into one fixed form so that two viewers watching the same video
produce exactly the same fingerprint (hash).
"""
import hashlib
import json
import math
import re
from dataclasses import dataclass

VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
INSTALL_ID = re.compile(r"[A-Za-z0-9-]{16,64}")
LANGUAGE = re.compile(r"[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,3}")
TRANSCRIPT_HASH = re.compile(r"[0-9a-f]{64}")

MAX_LINES = 30_000
MAX_LINE_CHARS = 1_000
# About a 6-hour talk show. Larger transcripts are refused, which also caps
# what any single request can cost us.
MAX_TRANSCRIPT_CHARS = 900_000
MAX_SECONDS = 12 * 60 * 60
MAX_DESCRIPTION_CHARS = 5_000


class BadSubmission(ValueError):
    """The browser sent something we will not process."""


@dataclass(frozen=True)
class Submission:
    video_id: str
    install_id: str
    language: str
    # Each line is (seconds from the start, caption text), sorted by time.
    lines: tuple
    description: str
    # YouTube's "Includes paid promotion" label: True, False, or None (unknown).
    paid_label: object

    @property
    def transcript_hash(self):
        """Same inputs -> same hash, whoever sends them.

        Every input the AI reads is part of the hash (not just the captions).
        Otherwise someone could send the real captions with a fake description,
        get their answer saved first, and have honest viewers "confirm" it.
        """
        canonical = json.dumps([self.video_id, self.lines, self.description, self.paid_label],
                               ensure_ascii=False, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @property
    def last_line_seconds(self):
        return self.lines[-1][0] if self.lines else 0.0


def is_video_id(value):
    return isinstance(value, str) and VIDEO_ID.fullmatch(value) is not None


def is_transcript_hash(value):
    return isinstance(value, str) and TRANSCRIPT_HASH.fullmatch(value) is not None


def _clean_text(value):
    # Collapse all runs of whitespace (including newlines) into single spaces.
    return " ".join(value.split())


def _clean_line(item):
    if not isinstance(item, list) or len(item) != 2:
        raise BadSubmission("each line must be [seconds, text]")
    seconds, text = item
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or not math.isfinite(seconds):
        raise BadSubmission("line time must be a number")
    if not 0 <= seconds <= MAX_SECONDS:
        raise BadSubmission("line time is out of range")
    if not isinstance(text, str) or len(text) > MAX_LINE_CHARS:
        raise BadSubmission("line text is missing or too long")
    return round(float(seconds), 1), _clean_text(text)


def parse_submission(payload):
    """Turns raw JSON from the browser into a Submission, or raises BadSubmission."""
    if not isinstance(payload, dict):
        raise BadSubmission("body must be a JSON object")

    video_id = payload.get("videoId")
    if not is_video_id(video_id):
        raise BadSubmission("invalid video ID")

    install_id = payload.get("installId")
    if not isinstance(install_id, str) or INSTALL_ID.fullmatch(install_id) is None:
        raise BadSubmission("invalid install ID")

    language = payload.get("language")
    if not isinstance(language, str) or LANGUAGE.fullmatch(language) is None:
        raise BadSubmission("invalid language code")

    raw_lines = payload.get("lines")
    if not isinstance(raw_lines, list) or not 1 <= len(raw_lines) <= MAX_LINES:
        raise BadSubmission("lines must be a list of 1 to 30000 entries")
    lines = [_clean_line(item) for item in raw_lines]
    lines = [line for line in lines if line[1]]
    if not lines:
        raise BadSubmission("transcript has no text")
    if sum(len(text) for _, text in lines) > MAX_TRANSCRIPT_CHARS:
        raise BadSubmission("transcript is too long")
    # Sorting here (instead of trusting the order we were sent) keeps the
    # hash identical for every viewer of the same captions.
    lines.sort(key=lambda line: line[0])

    description = payload.get("description", "")
    if not isinstance(description, str):
        raise BadSubmission("description must be text")
    description = description[:MAX_DESCRIPTION_CHARS]

    paid_label = payload.get("paidLabel")
    if paid_label not in (True, False, None):
        raise BadSubmission("paidLabel must be true, false or null")

    return Submission(
        video_id=video_id,
        install_id=install_id,
        language=language,
        lines=tuple(lines),
        description=description,
        paid_label=paid_label,
    )
