"""Speed limits: how many requests one network or one install may make."""
import threading
import time


class RateLimiter:
    """Allows at most `limit` events per `window_seconds` for each key.

    Uses simple fixed time windows: the count for a key resets when a new
    window starts. Memory stays bounded because old keys are dropped.
    """

    def __init__(self, limit, window_seconds, clock=time.monotonic, max_keys=200_000):
        self.limit = limit
        self.window_seconds = window_seconds
        self._clock = clock
        self._max_keys = max_keys
        self._counts = {}  # key -> (window number, events in that window)
        self._lock = threading.Lock()

    def allow(self, key):
        with self._lock:
            window = int(self._clock() // self.window_seconds)
            started, count = self._counts.get(key, (window, 0))
            if started != window:
                count = 0
            if count >= self.limit:
                return False
            self._counts[key] = (window, count + 1)
            if len(self._counts) > self._max_keys:
                self._forget_old_windows(window)
            return True

    def _forget_old_windows(self, current_window):
        stale = [key for key, (window, _) in self._counts.items() if window != current_window]
        for key in stale:
            del self._counts[key]
        # Still too many keys inside one window (a flood): start over. This
        # briefly loosens limits but never lets memory grow without bound.
        if len(self._counts) > self._max_keys:
            self._counts.clear()
