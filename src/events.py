"""Generic pub/sub for push notifications to the frontend via SSE.

Every job in jobs.py calls publish(type) right after refreshing its cache — the frontend
listens instead of guessing a poll interval that has to be kept in sync with the backend's
cron cadence by hand (that drift is exactly what caused the vigilance 2min/5min mismatch).
Only the type name travels over the wire; the client re-fetches the matching /api/* endpoint
itself, so the payload shape for each endpoint still lives in exactly one place.

lightning.py uses the same pubsub.Listeners, but on its own dedicated stream — it pushes
real strike data, not just a "go refetch" signal.
"""

from pubsub import Listeners

_listeners = Listeners(maxsize=100)
register_listener = _listeners.register
unregister_listener = _listeners.unregister


def publish(event_type: str) -> None:
    """Notify clients fresh data is ready for `event_type` (matches the /api/* to re-fetch)."""
    _listeners.broadcast(event_type)
