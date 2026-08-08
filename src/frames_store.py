"""On-disk PNG frame storage + metadata for the OPERA/MF radar products."""

import json
import logging
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import config

log = logging.getLogger(__name__)

FRAMES_DIR = Path(config.FRAMES_DIR)

DIRS: dict[str, Path] = {
    "dbzh": FRAMES_DIR / "dbzh",  # OPERA DBZH (reflectivity)
    "acrr": FRAMES_DIR / "acrr",  # OPERA ACRR (1h Europe accumulation)
    "acrr_mf": FRAMES_DIR / "acrr_mf",  # MF accumulation (France 500m)
    "piaf": FRAMES_DIR / "piaf",  # MF PIAF (France 1km precipitation-rate forecast, 0-3h)
    "rate": FRAMES_DIR / "rate",  # OPERA RATE (instantaneous rain rate, Europe)
}
for d in DIRS.values():
    d.mkdir(parents=True, exist_ok=True)

_FRAME_TS_RE = re.compile(r"(\d{8}T\d{6}Z)")


def _meta_path(product: str) -> Path:
    return DIRS[product] / "meta.json"


def load_meta(product: str) -> dict:
    """Load a product's {frames, bounds} metadata, or defaults if none saved yet."""
    p = _meta_path(product)
    if p.exists():
        try:
            return json.loads(p.read_text())
        except (OSError, ValueError):
            pass
    return {"frames": [], "bounds": [[41.0, -5.5], [51.5, 10.5]]}


def _save_meta(product: str, meta: dict) -> None:
    _meta_path(product).write_text(json.dumps(meta, indent=2))


def _frame_datetime(fname: str) -> datetime | None:
    m = _FRAME_TS_RE.search(fname)
    if not m:
        return None
    return datetime.strptime(m.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)


def push_frame(product: str, fname: str, bounds: list, png: bytes) -> None:
    """Save a new PNG frame to disk and update its product's metadata, pruning old frames."""
    out = DIRS[product] / fname
    out.write_bytes(png)

    meta = load_meta(product)
    meta["bounds"] = bounds
    meta["frames"] = [f for f in meta["frames"] if (DIRS[product] / f).exists()]
    if fname not in meta["frames"]:
        meta["frames"].append(fname)
    meta["frames"].sort()

    # Prune by age first, then cap by count as a backstop.
    cutoff = datetime.now(tz=UTC) - timedelta(minutes=config.MAX_FRAME_AGE_MIN)
    kept = []
    for f in meta["frames"]:
        dt = _frame_datetime(f)
        if dt is not None and dt < cutoff:
            (DIRS[product] / f).unlink(missing_ok=True)
        else:
            kept.append(f)
    meta["frames"] = kept

    while len(meta["frames"]) > config.MAX_FRAMES:
        oldest = DIRS[product] / meta["frames"].pop(0)
        oldest.unlink(missing_ok=True)

    _save_meta(product, meta)
    log.info("[%s] Frame saved: %s  (%d KB)", product.upper(), fname, len(png) // 1024)


def frame_path(product: str, filename: str) -> Path | None:
    """Resolve a frame filename to its on-disk path, or None if unknown/missing/unsafe."""
    if product not in DIRS or "/" in filename or not filename.endswith(".png"):
        return None
    path = DIRS[product] / filename
    return path if path.exists() else None
