"""Scheduled fetch jobs and in-memory caches feeding the /api/* routes."""

import logging
from types import SimpleNamespace

import cape_store
import config
import events
import frames_store
import settings_store
from converter import dbzh_to_png, hdf5_to_png, opera_acrr_to_png, opera_rate_to_png, piaf_to_png
from sources.meteofrance import (
    fetch_cape_grid,
    fetch_mf_accumulation,
    fetch_piaf_frames,
    fetch_shear_grids,
    fetch_vigilance,
    fetch_wind_grid,
)
from sources.opera import fetch_opera_hdf5, fetch_opera_history
from sources.rainviewer import fetch_rainviewer_frames

log = logging.getLogger(__name__)

_cache = SimpleNamespace(
    wind=None,
    obs_points=None,
    cape=None,
    stp=None,
    ehi=None,
    hail=None,
    rainviewer=None,
    vigilance=None,
)


def get_wind() -> list | None:
    """Latest wind grid, or None if job_wind() hasn't completed a fetch yet."""
    return _cache.wind


def get_obs_points() -> list[dict] | None:
    """Latest per-station temp/pressure points, or None if job_wind() hasn't run yet."""
    return _cache.obs_points


def get_cape() -> dict | None:
    """Latest CAPE grid (history + forecast), or None if job_cape() hasn't run yet."""
    return _cache.cape


def get_stp() -> dict | None:
    """Latest STP grid (forecast H+0…H+6), or None if job_shear() hasn't run yet."""
    return _cache.stp


def get_ehi() -> dict | None:
    """Latest EHI grid (forecast H+0…H+6), or None if job_shear() hasn't run yet."""
    return _cache.ehi


def get_hail() -> dict | None:
    """Latest hail-risk grid (forecast H+0…H+6), or None if job_shear() hasn't run yet."""
    return _cache.hail


def get_rainviewer() -> dict | None:
    """Latest RainViewer frame metadata, or None if job_rainviewer() hasn't run yet."""
    return _cache.rainviewer


def get_vigilance() -> dict | None:
    """Latest vigilance bulletin (level/phenomena per department), or None if not fetched/no key."""
    return _cache.vigilance


# ── Jobs ──────────────────────────────────────────────────────────────────────


def job_wind() -> None:
    """Refresh the wind grid and station temp/pressure points caches (one shared fetch)."""
    result = fetch_wind_grid()
    if result:
        _cache.wind, _cache.obs_points = result
        events.publish("wind")
        events.publish("obs")


def job_cape() -> None:
    """Refresh the CAPE grid cache, archiving the live (H+0) frame into cape_store."""
    if not settings_store.load()["cape"]:
        return
    data = fetch_cape_grid()
    if not data:
        return
    frames = data["frames"]  # [H+0 (live), H+1, ..., H+N]
    live_time = frames[0]["time"] if frames else None
    # Repeated polls within the same hour re-fetch the same H+0 — exclude it from
    # "history" so it isn't shown twice (once as past, once as live).
    history = [h for h in cape_store.load() if live_time is None or h["time"] < live_time]
    if frames:
        cape_store.push(frames[0]["time"], frames[0]["values"])
    data["frames"] = history + frames
    data["liveIndex"] = len(history)
    _cache.cape = data
    events.publish("cape")


def job_shear() -> None:
    """Refresh the STP/EHI/hail grid caches (each with its own H+0…H+6 forecast series)."""
    if not settings_store.load()["shear"]:
        return
    grids = fetch_shear_grids()
    if grids["stp"]:
        _cache.stp = grids["stp"]
    if grids["ehi"]:
        _cache.ehi = grids["ehi"]
    if grids["hail"]:
        _cache.hail = grids["hail"]
    if grids["stp"] or grids["ehi"] or grids["hail"]:
        events.publish("shear")


def job_rainviewer() -> None:
    """Refresh the RainViewer frame metadata cache."""
    if not settings_store.load()["refl"]:
        return
    data = fetch_rainviewer_frames()
    if data:
        _cache.rainviewer = data
        events.publish("refl")  # alternate source for the same "reflectivity" category as DBZH


def job_vigilance() -> None:
    """Refresh the vigilance bulletin cache (level/phenomena per department)."""
    if not settings_store.load()["vigilance_enabled"]:
        return
    data = fetch_vigilance()
    if data:
        _cache.vigilance = data
        events.publish("vigilance")


def job_opera_dbzh() -> None:
    """Fetch the latest OPERA DBZH slot and push it to frames_store as a PNG."""
    settings = settings_store.load()
    if not settings["refl"] or settings["refl_source"] != "dbzh":
        return
    result = fetch_opera_hdf5("DBZH")
    if result is None:
        return
    data, dt = result
    try:
        png, bounds = dbzh_to_png(data)
    except (OSError, KeyError, ValueError) as e:
        log.error("OPERA DBZH conversion: %s", e)
        return
    ts = dt.strftime("%Y%m%dT%H%M%SZ")
    frames_store.push_frame("dbzh", f"dbzh_{ts}.png", bounds, png)
    events.publish("refl")


def job_opera_acrr() -> None:
    """Fetch the latest OPERA ACRR slot and push it to frames_store as a PNG."""
    settings = settings_store.load()
    if not settings["accr"] or settings["accr_source"] != "acrr":
        return
    result = fetch_opera_hdf5("ACRR")
    if result is None:
        return
    data, dt = result
    try:
        png, bounds = opera_acrr_to_png(data)
    except (OSError, KeyError, ValueError) as e:
        log.error("OPERA ACRR conversion: %s", e)
        return
    ts = dt.strftime("%Y%m%dT%H%M%SZ")
    frames_store.push_frame("acrr", f"acrr_{ts}.png", bounds, png)
    events.publish("accr")


def job_opera_rate() -> None:
    """Fetch the latest OPERA RATE slot and push it to frames_store as a PNG."""
    if not settings_store.load()["rate"]:
        return
    result = fetch_opera_hdf5("RATE")
    if result is None:
        return
    data, dt = result
    try:
        png, bounds = opera_rate_to_png(data)
    except (OSError, KeyError, ValueError) as e:
        log.error("OPERA RATE conversion: %s", e)
        return
    ts = dt.strftime("%Y%m%dT%H%M%SZ")
    frames_store.push_frame("rate", f"rate_{ts}.png", bounds, png)
    events.publish("rate")


def job_piaf() -> None:
    """Refresh the PIAF precipitation-rate forecast: one PNG per lead time, named by valid
    time so a fresher run naturally overwrites the old forecast for the same future minute."""
    if not settings_store.load()["piaf"]:
        return
    pushed = False
    for data, dt in fetch_piaf_frames():
        try:
            png, bounds = piaf_to_png(data)
        except (OSError, KeyError, ValueError) as e:
            log.error("PIAF conversion: %s", e)
            continue
        ts = dt.strftime("%Y%m%dT%H%M%SZ")
        frames_store.push_frame("piaf", f"piaf_{ts}.png", bounds, png)
        pushed = True
    if pushed:
        events.publish("piaf")


def job_mf_acrr() -> None:
    """Fetch the latest MF accumulation slot and push it to frames_store as a PNG."""
    settings = settings_store.load()
    if not settings["accr"] or settings["accr_source"] != "acrr_mf":
        return
    result = fetch_mf_accumulation()
    if result is None:
        return
    data, dt = result
    try:
        png, bounds = hdf5_to_png(data)
    except (OSError, KeyError, ValueError) as e:
        log.error("MF accumulation conversion: %s", e)
        return
    ts = dt.strftime("%Y%m%dT%H%M%SZ")
    frames_store.push_frame("acrr_mf", f"acrr_mf_{ts}.png", bounds, png)
    events.publish("accr")  # alternate source for the same "accr" category as OPERA ACRR


# ── Bootstrap (startup backfill) ───────────────────────────────────────────────


def bootstrap(product: str, converter) -> None:
    """Backfill missing recent OPERA frames (dbzh/acrr/rate) from S3 history on startup."""
    setting = {"dbzh": "refl", "acrr": "accr", "rate": "rate"}.get(product)
    settings = settings_store.load()
    if not setting or not settings[setting]:
        return
    # dbzh/acrr have a rival source (rv/acrr_mf) — skip backfilling the one not picked.
    source_setting = {"dbzh": "refl_source", "acrr": "accr_source"}.get(product)
    if source_setting and settings[source_setting] != product:
        return
    opera_product = {"dbzh": "DBZH", "acrr": "ACRR", "rate": "RATE"}.get(product)
    if not opera_product:
        return
    frames = fetch_opera_history(opera_product, config.MAX_FRAMES)
    pushed = False
    for data, dt in frames:
        ts = dt.strftime("%Y%m%dT%H%M%SZ")
        fname = f"{product}_{ts}.png"
        if (frames_store.DIRS[product] / fname).exists():
            continue
        try:
            png, bounds = converter(data)
            frames_store.push_frame(product, fname, bounds, png)
            pushed = True
        except (OSError, KeyError, ValueError) as e:
            log.error("Bootstrap %s %s: %s", product, ts, e)
    if pushed:
        events.publish({"dbzh": "refl", "acrr": "accr", "rate": "rate"}[product])
