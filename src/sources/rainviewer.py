"""RainViewer API fetch: tile host + past/nowcast frame metadata."""

import logging

import requests

from config import RAINVIEWER_API_URL

log = logging.getLogger(__name__)


def fetch_rainviewer_frames() -> dict | None:
    """Fetch RainViewer's frame metadata (tile host + past/nowcast frame list)."""
    try:
        r = requests.get(RAINVIEWER_API_URL, timeout=10)
        if r.status_code == 200:
            return r.json()
        log.error("RainViewer: HTTP %d", r.status_code)
    except (requests.RequestException, ValueError) as e:
        log.error("RainViewer: %s", e)
    return None
