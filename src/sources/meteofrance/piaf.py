"""Météo-France PIAF (Prévision Immédiate Agrégée Fusionnée) fetch: precipitation-rate
forecast grid (0-3h, 1 km/0.01°) via WCS GetCoverage — one GeoTIFF slice per lead time.

Unlike AROME-PI/AROME (0.25°/0.025° point grids, sampled into JSON), PIAF's native grid
is 1651×1051 (1 km over mainland France) — too fine for point-sampling, so each slice is
kept as a full array and rendered to PNG by converter.piaf_to_png, same as the OPERA/MF
radar layers.
"""

import logging
import time
from datetime import UTC, datetime

from config import MF_PIAF_API_KEY, MF_PIAF_BASE_URL
from sources.meteofrance import wcs

log = logging.getLogger(__name__)

_HEADERS = {"apikey": MF_PIAF_API_KEY} if MF_PIAF_API_KEY else {}
_RUN_FMT = "%Y-%m-%dT%H.%M.%SZ"  # coverageId run timestamp (dots, per MF's WCS)
_TIME_FMT = "%Y-%m-%dT%H:%M:%SZ"  # subset=time(...) value and frontend-facing time

_PIAF_PATH = "/wcs/MF-NWP-HIGHRES-PIAF-001-FRANCE-WCS"
_ENDPOINT = wcs.WcsEndpoint(MF_PIAF_BASE_URL, _HEADERS, _PIAF_PATH, "PIAF")
_LAYER = "TOTAL_PRECIPITATION_RATE__GROUND_OR_WATER_SURFACE"
_DURATION = "PT5M"  # rate averaged over the preceding 5 min — finest-grain variant available

# Lead times to render: denser near-term (most tactically useful), coarser further out.
LEAD_TIMES_MIN = [15, 30, 45, 60, 90, 120, 150, 180]

_SPATIAL_SUBSET = ["long(-6,10.5)", "lat(41,51.5)"]  # PIAF's native domain (mainland France)


def _latest_run(ids: list[str]) -> datetime | None:
    """Latest run timestamp among coverage ids named `{_LAYER}___{run}_{_DURATION}`."""
    prefix = f"{_LAYER}___"
    suffix = f"_{_DURATION}"
    runs = [
        datetime.strptime(i[len(prefix) : -len(suffix)], _RUN_FMT).replace(tzinfo=UTC)
        for i in ids
        if i.startswith(prefix) and i.endswith(suffix)
    ]
    return max(runs) if runs else None


def fetch_piaf_frames() -> list[tuple[bytes, datetime]]:
    """One GeoTIFF slice per LEAD_TIMES_MIN step from the latest run, as (tiff, valid_time)."""
    # MF's WCS catalog intermittently returns a snapshot missing our layer/duration
    # entirely (same flakiness as AROME-PI/AROME) — retry a few times before giving up.
    ids = run = None
    for attempt in range(3):
        ids = wcs.capability_ids(_ENDPOINT)
        if ids is not None:
            run = _latest_run(ids)
            if run is not None:
                break
        if attempt < 2:
            time.sleep(3)
    if run is None:
        log.error("PIAF: %s/%s not found (%d ids)", _LAYER, _DURATION, len(ids or []))
        return []
    coverage_id = f"{_LAYER}___{run.strftime(_RUN_FMT)}_{_DURATION}"

    frames = list(
        wcs.fetch_frames(
            _ENDPOINT, coverage_id, run, LEAD_TIMES_MIN, "minutes", _SPATIAL_SUBSET, _TIME_FMT
        )
    )

    log.info("PIAF: %d/%d frame(s) fetched (run %s)", len(frames), len(LEAD_TIMES_MIN), run)
    return frames
