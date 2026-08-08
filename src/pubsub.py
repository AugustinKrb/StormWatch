"""Thread-safe bounded-queue pub/sub registry, shared by events.py and lightning.py."""

import queue
import threading


class Listeners:
    """A set of bounded queues that can be broadcast to; full queues are dropped."""

    def __init__(self, maxsize: int) -> None:
        self._maxsize = maxsize
        self._queues: list[queue.Queue] = []
        self._lock = threading.Lock()

    def register(self) -> queue.Queue:
        """Create and register a new subscriber queue."""
        q: queue.Queue = queue.Queue(maxsize=self._maxsize)
        with self._lock:
            self._queues.append(q)
        return q

    def unregister(self, q: queue.Queue) -> None:
        """Remove a subscriber queue, e.g. when its client disconnects."""
        with self._lock:
            if q in self._queues:
                self._queues.remove(q)

    def broadcast(self, payload) -> None:
        """Push payload to every registered queue, dropping any that are full."""
        with self._lock:
            dead = []
            for q in self._queues:
                try:
                    q.put_nowait(payload)
                except queue.Full:
                    dead.append(q)
            for q in dead:
                self._queues.remove(q)
