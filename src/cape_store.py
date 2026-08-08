"""On-disk archive of past CAPE (H+0) frames, used to build job_cape()'s history timeline."""

import json
import logging
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import config

log = logging.getLogger(__name__)

CAPE_DIR = Path(config.FRAMES_DIR) / "cape"
CAPE_DIR.mkdir(parents=True, exist_ok=True)

_META_PATH = CAPE_DIR / "meta.json"
_TS_RE = re.compile(r"(\d{8}T\d{6}Z)")

MAX_HISTORY_AGE_MIN = 180  # ~3h of real history, matched to the fixed timeline anchor


def _load_meta() -> list[str]:
    if _META_PATH.exists():
        try:
            return json.loads(_META_PATH.read_text())
        except (OSError, ValueError):
            pass
    return []


def _save_meta(entries: list[str]) -> None:
    _META_PATH.write_text(json.dumps(entries))


def _frame_datetime(fname: str) -> datetime | None:
    m = _TS_RE.search(fname)
    if not m:
        return None
    return datetime.strptime(m.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)


def push(time: str, values: list) -> None:
    """Archive the live (H+0) CAPE frame for future polls — never a forecast step."""
    fname = time.replace("-", "").replace(":", "") + ".json"
    (CAPE_DIR / fname).write_text(json.dumps({"time": time, "values": values}))

    entries = [f for f in _load_meta() if (CAPE_DIR / f).exists()]
    if fname not in entries:
        entries.append(fname)
    entries.sort()

    cutoff = datetime.now(tz=UTC) - timedelta(minutes=MAX_HISTORY_AGE_MIN)
    kept = []
    for f in entries:
        dt = _frame_datetime(f)
        if dt is not None and dt < cutoff:
            (CAPE_DIR / f).unlink(missing_ok=True)
        else:
            kept.append(f)

    _save_meta(kept)
    log.info("CAPE history: archived %s (%d frames kept)", time, len(kept))


def load() -> list[dict]:
    """Archived history frames, chronological oldest-first — strictly past, no current/forecast."""
    frames = []
    for f in _load_meta():
        try:
            frames.append(json.loads((CAPE_DIR / f).read_text()))
        except (OSError, ValueError):
            continue
    return frames
