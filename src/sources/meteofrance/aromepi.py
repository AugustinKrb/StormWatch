"""Météo-France AROME-PI fetch: CAPE grid via WCS GetCoverage, one HTTP call per 2D time-slice."""

import logging

from config import MF_AROMEPI_API_KEY, MF_AROMEPI_BASE_URL
from sources.meteofrance import wcs

log = logging.getLogger(__name__)

_HEADERS = {"apikey": MF_AROMEPI_API_KEY} if MF_AROMEPI_API_KEY else {}
_RUN_FMT = "%Y-%m-%dT%H.%M.%SZ"  # coverageId suffix (dots, per MF's WCS)
_TIME_FMT = "%Y-%m-%dT%H:%M:%SZ"  # subset=time(...) value and frontend-facing time

# Output grid matches the app's existing bounds/resolution so the frontend contract never changes.
CAPE_LATS = [round(58.0 - i * 0.25, 2) for i in range(73)]  # N → S: 58 … 40
CAPE_LONS = [round(-10.0 + i * 0.25, 2) for i in range(121)]  # W → E: -10 … 20
CAPE_FORECAST_HOURS = 6  # H+0 … H+6, sampled from AROME-PI's 15-min axis hourly

# AROME-PI's domain ("France élargie") is narrower than our grid; outside points sample as null.
_SOURCE_LON = (-12.0, 16.0)
_SOURCE_LAT = (37.5, 55.4)

_CAPE_PATH = "/wcs/MF-NWP-HIGHRES-AROMEPI-001-FRANCE-WCS"
_ENDPOINT = wcs.WcsEndpoint(MF_AROMEPI_BASE_URL, _HEADERS, _CAPE_PATH, "AROME-PI")

# MF's WCS catalog intermittently renames fields (verbose ↔ short internal code) — try both.
_CAPE_LAYER_CANDIDATES = [
    "CONVECTIVE_AVAILABLE_POTENTIAL_ENERGY__GROUND_OR_WATER_SURFACE",
    "CAPE_INS__GROUND",
]

_SPATIAL_SUBSET = [
    f"long({_SOURCE_LON[0]},{_SOURCE_LON[1]})",
    f"lat({_SOURCE_LAT[0]},{_SOURCE_LAT[1]})",
]


def fetch_cape_grid() -> dict | None:
    """AROME-PI CAPE grid with hourly forecast frames (H+0…H+CAPE_FORECAST_HOURS)."""
    ids = wcs.capability_ids(_ENDPOINT)
    if ids is None:
        return None
    resolved = wcs.resolve_layer(ids, _CAPE_LAYER_CANDIDATES, _RUN_FMT)
    if resolved is None:
        log.error("AROME-PI CAPE: none of %s found (%d ids)", _CAPE_LAYER_CANDIDATES, len(ids))
        return None
    layer, run = resolved  # pylint: disable=duplicate-code
    coverage_id = f"{layer}___{run.strftime(_RUN_FMT)}"

    frames = [
        {"time": vt.strftime(_TIME_FMT), "values": wcs.sample_grid(tiff, CAPE_LATS, CAPE_LONS)}
        for tiff, vt in wcs.fetch_frames(
            _ENDPOINT,
            coverage_id,
            run,
            range(CAPE_FORECAST_HOURS + 1),
            "hours",
            _SPATIAL_SUBSET,
            _TIME_FMT,
        )
    ]
    # pylint: enable=duplicate-code

    if not frames:
        return None
    log.info(
        "AROME-PI CAPE grid: %d pts, %d frames (run %s)",
        len(CAPE_LATS) * len(CAPE_LONS),
        len(frames),
        run,
    )
    return wcs.grid_response(CAPE_LATS, CAPE_LONS, frames)
