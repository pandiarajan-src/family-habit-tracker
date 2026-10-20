"""In-memory sliding window for wrong passcodes (REQ-001).

Valid while the app runs as one worker (plan: cross-cutting decisions); it resets on restart.
"""

from collections import defaultdict, deque
from datetime import datetime, timedelta
from threading import Lock


class FailureWindow:
    def __init__(self, max_failures: int, window: timedelta) -> None:
        self.max_failures = max_failures
        self.window = window
        self._failures: defaultdict[str, deque[datetime]] = defaultdict(deque)
        self._lock = Lock()

    def is_blocked(self, key: str, now: datetime) -> bool:
        with self._lock:
            failures = self._failures[key]
            while failures and failures[0] <= now - self.window:
                failures.popleft()
            if not failures:
                del self._failures[key]
            return len(failures) >= self.max_failures

    def record_failure(self, key: str, now: datetime) -> None:
        with self._lock:
            self._failures[key].append(now)
