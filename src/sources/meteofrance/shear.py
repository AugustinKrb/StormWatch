"""Météo-France AROME-PI severe-weather composites (STP, EHI, hail) via WCS GetCoverage,
one HTTP call per 2D time-slice."""

import logging

from config import MF_AROMEPI_API_KEY, MF_AROMEPI_BASE_URL
from sources.meteofrance import wcs
from sources.meteofrance.aromepi import CAPE_LATS, CAPE_LONS

log = logging.getLogger(__name__)

_HEADERS = {"apikey": MF_AROMEPI_API_KEY} if MF_AROMEPI_API_KEY else {}
_RUN_FMT = "%Y-%m-%dT%H.%M.%SZ"  # coverageId suffix (dots, per MF's WCS)
_TIME_FMT = "%Y-%m-%dT%H:%M:%SZ"  # subset=time(...) value

# Unlike CAPE, STP/EHI/hail only exist on the 0025° grid, not the 001° grid.
_SHEAR_PATH = "/wcs/MF-NWP-HIGHRES-AROMEPI-0025-FRANCE-WCS"
_ENDPOINT = wcs.WcsEndpoint(MF_AROMEPI_BASE_URL, _HEADERS, _SHEAR_PATH, "AROME-PI shear")

# Confirmed via DescribeCoverage: this endpoint's native time axis is 15-min steps H+0…H+6
# (25 frames), unlike CAPE which stays hourly — its 0.01° grid is ~6x heavier per call.
_LEAD_TIMES_MIN = list(range(0, 361, 15))

# MF's WCS catalog intermittently renames fields (verbose ↔ short internal code) — try both.
_STP_LAYER_CANDIDATES = ["DIAG_STP__GROUND_OR_WATER_SURFACE", "DIAG_STP__GROUND"]
_EHI_LAYER_CANDIDATES = ["DIAG_EHI__GROUND_OR_WATER_SURFACE", "DIAG_EHI__GROUND"]
_HAIL_LAYER_CANDIDATES = ["DIAG_GRELE__GROUND_OR_WATER_SURFACE", "DIAG_GRELE__GROUND"]

# Same output grid as AROME-PI's CAPE so all three overlays share one frontend contract.
_SOURCE_LON = (-12.0, 16.0)
_SOURCE_LAT = (37.5, 55.4)
_SPATIAL_SUBSET = [
    f"long({_SOURCE_LON[0]},{_SOURCE_LON[1]})",
    f"lat({_SOURCE_LAT[0]},{_SOURCE_LAT[1]})",
]


def _fetch_forecast_grid(ids: list[str], candidates: list[str], label: str) -> dict | None:
    """15-min-step forecast frames (H+0…H+6, 25 frames) for one diagnostic layer."""
    resolved = wcs.resolve_layer(ids, candidates, _RUN_FMT)
    if resolved is None:
        log.error("AROME-PI %s: none of %s found (%d ids)", label, candidates, len(ids))
        return None
    layer, run = resolved
    coverage_id = f"{layer}___{run.strftime(_RUN_FMT)}"

    frames = [
        {"time": vt.strftime(_TIME_FMT), "values": wcs.sample_grid(tiff, CAPE_LATS, CAPE_LONS)}
        for tiff, vt in wcs.fetch_frames(
            _ENDPOINT, coverage_id, run, _LEAD_TIMES_MIN, "minutes", _SPATIAL_SUBSET, _TIME_FMT
        )
    ]

    if not frames:
        return None
    log.info(
        "AROME-PI %s grid: %d pts, %d frames (run %s)",
        label,
        len(CAPE_LATS) * len(CAPE_LONS),
        len(frames),
        run,
    )
    return wcs.grid_response(CAPE_LATS, CAPE_LONS, frames)


def fetch_shear_grids() -> dict:
    """STP, EHI and hail grids (H+0…H+6 forecast each), one GetCapabilities call for all three."""
    ids = wcs.capability_ids(_ENDPOINT)
    if ids is None:
        return {"stp": None, "ehi": None, "hail": None}
    return {
        "stp": _fetch_forecast_grid(ids, _STP_LAYER_CANDIDATES, "STP"),
        "ehi": _fetch_forecast_grid(ids, _EHI_LAYER_CANDIDATES, "EHI"),
        "hail": _fetch_forecast_grid(ids, _HAIL_LAYER_CANDIDATES, "HAIL"),
    }
