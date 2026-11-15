"""The rules of the service, separate from HTTP so they are easy to test.

How a video gets an answer:
1. A viewer's extension asks "do you know this video?" (lookup). If enough
   different viewers have already confirmed an answer, it is returned at once.
2. Otherwise the extension sends the transcript (submit). The answer for that
   exact transcript is returned if we already have it; if not, an AI check is
   started, within strict money and speed limits.
3. Every viewer who sends the same transcript counts as a confirmation. Only
   when enough different installs on different networks agree does the
   answer become visible to people who have not sent a transcript.

So a fake transcript only ever fools the person who sent it.
"""
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from .detector import DetectionFailed
from .transcript import BadSubmission
from .youtube import YouTubeUnavailable

log = logging.getLogger("shield")

POLL_AFTER_SECONDS = 4
FAILED_RETRY_SECONDS = 10 * 60
# Answers that blur more than this share of a video are held back (not shared
# with everyone) because they are more likely to be a planted fake. Anyone
# who sends the same transcript still gets them.
MAX_SHARE_OF_VIDEO = 0.4
MAX_PARTS_TO_SHARE = 15
# A transcript may run this far past the real end of the video (outro captions).
TRANSCRIPT_GRACE_SECONDS = 120


def ready(parts):
    return {"status": "ready", "segments": parts}


def working(transcript_hash):
    return {"status": "working", "transcript": transcript_hash, "retryAfter": POLL_AFTER_SECONDS}


def unavailable(reason):
    # Reasons: ai_off, budget, video_limit, busy, failed, youtube.
    return {"status": "unavailable", "reason": reason}


class ShieldService:
    def __init__(self, settings, store, youtube, detect, now=time.time):
        """`detect(title, lines, description, paid_label)` returns a Detection."""
        self._settings = settings
        self._store = store
        self._youtube = youtube
        self._detect = detect
        self._now = now
        self._pool = ThreadPoolExecutor(max_workers=settings.max_parallel_ai_jobs, thread_name_prefix="ai")
        self._jobs_in_flight = 0
        self._jobs_lock = threading.Lock()
        store.forget_unfinished_jobs()

    def close(self):
        self._pool.shutdown(wait=True)

    # --- what the HTTP layer calls -------------------------------------------

    def lookup(self, video_id, transcript_hash=None):
        if transcript_hash:
            own = self._store.result_for(video_id, transcript_hash)
            if own:
                return self._describe(own)
        shared = self._store.shared_result(video_id, self._settings.confirmations_needed)
        return ready(shared.parts) if shared else {"status": "unknown"}

    def submit(self, submission, install_code, network_code):
        video_id, transcript_hash = submission.video_id, submission.transcript_hash

        existing = self._store.result_for(video_id, transcript_hash)
        recently_failed = (existing and existing.status == "failed"
                           and self._now() - existing.updated_at < FAILED_RETRY_SECONDS)
        if existing and (existing.status != "failed" or recently_failed):
            self._store.add_vote(video_id, transcript_hash, install_code, network_code)
            return self._describe(existing)

        reason = self._reason_not_to_run()
        if reason:
            return unavailable(reason)
        if self._store.ai_runs_today(video_id) >= self._settings.max_ai_runs_per_video_per_day:
            return unavailable("video_limit")

        try:
            info = self._youtube.video_info(video_id)
        except YouTubeUnavailable:
            return unavailable("youtube")
        if info is None:
            raise BadSubmission("video not found on YouTube")
        if info.duration_seconds and submission.last_line_seconds > info.duration_seconds + TRANSCRIPT_GRACE_SECONDS:
            raise BadSubmission("transcript is longer than the video")

        if not self._reserve_job_slot():
            return unavailable("busy")
        if not self._store.start_job(video_id, transcript_hash):
            self._release_job_slot()  # Another viewer started this same check a moment ago.
        else:
            self._store.count_ai_run(video_id)
            self._pool.submit(self._run_job, submission, info)
        self._store.add_vote(video_id, transcript_hash, install_code, network_code)
        return working(transcript_hash)

    # --- helpers -------------------------------------------------------------

    def _describe(self, result):
        if result.status == "done":
            return ready(result.parts)
        if result.status == "working":
            return working(result.transcript_hash)
        return unavailable("failed")

    def _reason_not_to_run(self):
        if not self._store.ai_enabled():
            return "ai_off"
        if self._store.spent_today() >= self._settings.daily_budget_usd:
            return "budget"
        return None

    def _reserve_job_slot(self):
        limit = self._settings.max_parallel_ai_jobs + self._settings.max_waiting_ai_jobs
        with self._jobs_lock:
            if self._jobs_in_flight >= limit:
                return False
            self._jobs_in_flight += 1
            return True

    def _release_job_slot(self):
        with self._jobs_lock:
            self._jobs_in_flight -= 1

    def _run_job(self, submission, info):
        video_id, transcript_hash = submission.video_id, submission.transcript_hash
        try:
            detection = self._detect(info.title, submission.lines, submission.description, submission.paid_label)
        except DetectionFailed as error:
            log.warning("AI check failed for %s: %s", video_id, error)
            self._store.fail_job(video_id, transcript_hash, str(error), error.cost_usd)
            self._store.add_spending(error.cost_usd)
            return
        except Exception:  # A bug must not leave the job "working" forever.
            log.exception("AI check crashed for %s", video_id)
            self._store.fail_job(video_id, transcript_hash, "internal error", 0.0)
            return
        finally:
            self._release_job_slot()

        duration = info.duration_seconds or submission.last_line_seconds
        held = self._looks_suspicious(detection.parts, duration)
        cost = detection.usage.cost_usd
        self._store.finish_job(video_id, transcript_hash, detection.parts, held, detection.why, cost)
        self._store.add_spending(cost)
        log.info("checked %s: %d part(s), %.1fs, $%.4f%s", video_id, len(detection.parts),
                 detection.seconds, cost, " (held)" if held else "")

    @staticmethod
    def _looks_suspicious(parts, duration_seconds):
        if len(parts) > MAX_PARTS_TO_SHARE:
            return True
        flagged = sum(part["end"] - part["start"] for part in parts)
        return duration_seconds > 0 and flagged > MAX_SHARE_OF_VIDEO * duration_seconds
