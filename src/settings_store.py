"""Persisted user settings — only what jobs.py reads to decide what to fetch (mono-user app)."""

import json
import os
import tempfile
from pathlib import Path

import config

_PATH = Path(config.FRAMES_DIR) / "settings.json"


_BOOL_KEYS = {"refl", "accr", "rate", "cape", "shear", "piaf", "vigilance_enabled"}
_SOURCE_CHOICES = {"refl_source": {"rv", "dbzh"}, "accr_source": {"acrr", "acrr_mf"}}


def _defaults() -> dict:
    """Backend-relevant settings only — the rest (region/theme/logo/tools) lives in localStorage."""
    return {
        "refl": True,
        "refl_source": "rv",
        "accr": True,
        "accr_source": "acrr_mf" if config.MF_RADAR_API_KEY else "acrr",
        "rate": True,
        "cape": True,
        "shear": True,
        "piaf": True,
        "vigilance_enabled": True,
    }


def _valid(key: str, value) -> bool:
    if key in _BOOL_KEYS:
        return isinstance(value, bool)
    if key in _SOURCE_CHOICES:
        return value in _SOURCE_CHOICES[key]
    return False


def load() -> dict:
    """Load saved settings, filled in with defaults for any missing key."""
    defaults = _defaults()
    if _PATH.exists():
        try:
            data = json.loads(_PATH.read_text())
            return {**defaults, **{k: v for k, v in data.items() if _valid(k, v)}}
        except (OSError, ValueError):
            pass
    return defaults


def save(patch: dict) -> dict:
    """Merge a partial update into the saved settings and persist the result atomically."""
    current = load()
    merged = {**current, **{k: v for k, v in patch.items() if _valid(k, v)}}
    _PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=_PATH.parent, prefix=".settings-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(json.dumps(merged))
        os.replace(tmp_path, _PATH)
    except BaseException:
        os.unlink(tmp_path)
        raise
    return merged
