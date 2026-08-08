"""Shared Météo-France WCS 2.0.1 client helpers (GetCapabilities/GetCoverage with retry).

Used by every MF WCS product (AROME-PI CAPE, PIAF precip) — they all sit
behind the same flaky gateway that occasionally 502s on the heavier GetCapabilities calls.
"""

import logging
import time
import xml.etree.ElementTree as ET
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import requests
from rasterio.io import MemoryFile

log = logging.getLogger(__name__)

_WCS_NS = "http://www.opengis.net/wcs/2.0"


@dataclass(frozen=True)
class WcsEndpoint:
    """One WCS 2.0.1 product endpoint (base URL, auth header, coverage path)."""

    base_url: str
    headers: dict
    coverage_path: str
    label: str  # for log messages, e.g. "AROME-PI", "PIAF"


def capability_ids(endpoint: WcsEndpoint) -> list[str] | None:
    """Fetch every CoverageId in a WCS GetCapabilities document, retrying once on 502/503/504."""
    for attempt in range(2):
        try:
            r = requests.get(
                f"{endpoint.base_url}{endpoint.coverage_path}/GetCapabilities",
                params={"service": "WCS", "version": "2.0.1", "language": "eng"},
                headers=endpoint.headers,
                timeout=60,
            )
            if r.status_code == 200:
                tag = f"{{{_WCS_NS}}}CoverageId"
                return [el.text for el in ET.fromstring(r.content).iter(tag) if el.text]
            if r.status_code in (502, 503, 504) and attempt == 0:
                log.warning("%s GetCapabilities: HTTP %d, retry", endpoint.label, r.status_code)
                time.sleep(3)
                continue
            log.error("%s GetCapabilities: HTTP %d", endpoint.label, r.status_code)
            break
        except (requests.RequestException, ET.ParseError, ValueError) as e:
            if attempt == 0:
                log.warning("%s GetCapabilities: %s, retrying", endpoint.label, e)
                time.sleep(3)
                continue
            log.error("%s GetCapabilities: %s", endpoint.label, e)
    return None


def get_coverage(
    endpoint: WcsEndpoint,
    coverage_id: str,
    subsets: list[str],
    fmt: str = "image/tiff",
) -> bytes | None:
    """Fetch one coverage slice via WCS GetCoverage, retrying once on 502/503/504."""
    label = f"{endpoint.label} {coverage_id} {subsets}"
    for attempt in range(2):
        try:
            r = requests.get(
                f"{endpoint.base_url}{endpoint.coverage_path}/GetCoverage",
                params={
                    "service": "WCS",
                    "version": "2.0.1",
                    "coverageid": coverage_id,
                    "format": fmt,
                    "subset": subsets,
                },
                headers=endpoint.headers,
                timeout=60,
            )
            if r.status_code == 200:
                return r.content
            if r.status_code == 404:
                # A fresh run hasn't published this lead time yet — callers skip and summarize.
                log.debug("GetCoverage %s: HTTP 404 (not published yet)", label)
                break
            if r.status_code in (502, 503, 504) and attempt == 0:
                log.warning("GetCoverage %s: HTTP %d, retrying", label, r.status_code)
                time.sleep(3)
                continue
            log.error("GetCoverage %s: HTTP %d %s", label, r.status_code, r.text[:200])
            break
        except requests.RequestException as e:
            if attempt == 0:
                log.warning("GetCoverage %s: %s, retrying", label, e)
                time.sleep(3)
                continue
            log.error("GetCoverage %s: %s", label, e)
    return None


def resolve_layer(
    ids: list[str], candidates: list[str], run_fmt: str
) -> tuple[str, datetime] | None:
    """Find which candidate name is actually present in `ids` and return it with its latest run."""
    for name in candidates:
        prefix = f"{name}___"
        runs = [
            datetime.strptime(i[len(prefix) :], run_fmt).replace(tzinfo=UTC)
            for i in ids
            if i.startswith(prefix)
        ]
        if runs:
            return name, max(runs)
    return None


def fetch_frames(
    endpoint: WcsEndpoint,
    coverage_id: str,
    run: datetime,
    lead_times: Iterable[int],
    unit: str,
    spatial_subset: list[str],
    time_fmt: str,
) -> Iterator[tuple[bytes, datetime]]:
    """Yield (tiff, valid_time) per lead time; lead times with no published data are skipped."""
    for lead in lead_times:
        valid_time = run + timedelta(**{unit: lead})
        subsets = [f"time({valid_time.strftime(time_fmt)})", *spatial_subset]
        tiff = get_coverage(endpoint, coverage_id, subsets)
        if tiff is not None:
            yield tiff, valid_time


def grid_response(lats: list[float], lons: list[float], frames: list[dict]) -> dict:
    """Build the {la1,lo1,la2,lo2,nx,ny,dx,dy,frames} envelope shared by point-sampled WCS grids."""
    return {
        "la1": max(lats),
        "lo1": min(lons),
        "la2": min(lats),
        "lo2": max(lons),
        "nx": len(lons),
        "ny": len(lats),
        "dx": 0.25,
        "dy": 0.25,
        "frames": frames,
    }


def sample_grid(
    tiff_bytes: bytes, lats: list[float], lons: list[float]
) -> list[list[float | None]]:
    """Point-sample a GeoTIFF band onto the given lat/lon grid; out-of-coverage points → null."""
    with MemoryFile(tiff_bytes) as mem, mem.open() as ds:
        nodata = ds.nodata
        bounds = ds.bounds
        points = [(lon, lat) for lat in lats for lon in lons]
        in_bounds = [
            i
            for i, (lon, lat) in enumerate(points)
            if bounds.left <= lon <= bounds.right and bounds.bottom <= lat <= bounds.top
        ]
        values: list[float | None] = [None] * len(points)
        if in_bounds:
            sampled = ds.sample([points[i] for i in in_bounds], indexes=1)
            for i, val in zip(in_bounds, sampled, strict=True):
                v = float(val[0])
                values[i] = None if (nodata is not None and v == nodata) else v
    nx = len(lons)
    return [values[i : i + nx] for i in range(0, len(values), nx)]
