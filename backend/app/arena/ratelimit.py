"""133-arena-ai-judge — a per-process rate limit for the judge endpoint.

The judge spends real tokens and the endpoint has no auth, so "nothing" was not
allowed to win by default. This is a fixed-window counter held in process memory.

**Be honest about its scope**: single-instance is a design property of this app
(constitution §8), so a process-local counter is the right granularity here — but it
is emphatically *not* a defence for a multi-replica public deployment, where each
replica would carry its own window. If this app ever runs with replicas, the guard
must move to shared state.

No `Date.now`-style hidden clock: the clock is injectable so the test is deterministic.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class FixedWindowLimiter:
    """Allow at most ``limit`` calls per ``window_seconds``, counted per process."""

    limit: int
    window_seconds: float = 60.0
    clock: callable[[], float] = field(default=time.monotonic)  # type: ignore[valid-type]
    _window_start: float = field(default=0.0, init=False)
    _count: int = field(default=0, init=False)
    _started: bool = field(default=False, init=False)

    def allow(self) -> bool:
        """Consume one slot; ``False`` when the window is exhausted."""
        if self.limit <= 0:
            return False
        now = self.clock()
        if not self._started or now - self._window_start >= self.window_seconds:
            self._window_start = now
            self._count = 0
            self._started = True
        if self._count >= self.limit:
            return False
        self._count += 1
        return True

    def reset(self) -> None:
        """Drop the current window (tests, and an explicit admin reset)."""
        self._started = False
        self._count = 0
