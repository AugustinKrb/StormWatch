"""HDF5/GeoTIFF radar file → PNG conversion: color palettes and Web Mercator reprojection.

Every source grid (MF stereographic, OPERA LAEA, PIAF's own plain lat/lon) is warped onto
a pixel grid evenly spaced in Web Mercator, not in degrees — Leaflet's imageOverlay stretches
the image linearly between its two corners in the map's own CRS (Web Mercator), so a plain
EPSG:4326 (linear-in-degrees) grid displays increasingly north of its true position at higher
latitudes (confirmed empirically: up to ~170km for OPERA's 35-60N span).
"""

import io
import logging

import h5py
import numpy as np
from affine import Affine
from PIL import Image
from pyproj import Transformer
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject

log = logging.getLogger(__name__)

DEFAULT_BOUNDS = [[41.0, -5.5], [51.5, 10.5]]
MF_GRID_SHAPE = (900, 1300)  # (height, width)

OPERA_BOUNDS = [[35.0, -12.0], [60.0, 22.0]]
OPERA_GRID_SHAPE = (1200, 1600)

# ── ACRR rain-rate palette (mm/h) ────────────────────────────────────────────

MIN_RAIN_MM_H = 0.1
_PALETTE_ACRR: list[tuple[float, tuple[int, int, int, int]]] = [
    (0.1, (180, 230, 180, 170)),
    (0.5, (120, 200, 120, 185)),
    (1.0, (60, 170, 60, 195)),
    (2.0, (0, 130, 0, 205)),
    (4.0, (180, 210, 0, 210)),
    (7.0, (255, 220, 0, 215)),
    (12.0, (255, 140, 0, 220)),
    (20.0, (220, 40, 0, 228)),
    (30.0, (160, 0, 0, 235)),
    (50.0, (160, 40, 200, 240)),
]

# ── RATE instantaneous rain-rate palette (mm/h) — wider ceiling than ACRR since a
# single convective-core pixel can spike into the hundreds ────────────────────

MIN_RATE_MM_H = 0.1
_PALETTE_RATE: list[tuple[float, tuple[int, int, int, int]]] = [
    (0.1, (180, 230, 180, 170)),
    (1.0, (120, 200, 120, 185)),
    (2.5, (60, 170, 60, 195)),
    (5.0, (180, 210, 0, 205)),
    (10.0, (255, 220, 0, 212)),
    (20.0, (255, 140, 0, 218)),
    (40.0, (220, 40, 0, 226)),
    (80.0, (160, 0, 0, 234)),
    (150.0, (160, 40, 200, 242)),
]

# ── DBZH reflectivity palette (dBZ) ──────────────────────────────────────────

MIN_DBZ = 5.0  # below this → transparent
_PALETTE_DBZH: list[tuple[float, tuple[int, int, int, int]]] = [
    (5.0, (100, 180, 255, 160)),  # very light blue — drizzle
    (10.0, (50, 140, 255, 175)),  # light blue
    (15.0, (0, 220, 100, 185)),  # light green
    (20.0, (0, 180, 0, 195)),  # green
    (25.0, (80, 210, 0, 205)),  # green-yellow
    (30.0, (230, 230, 0, 210)),  # yellow
    (35.0, (255, 180, 0, 215)),  # yellow-orange
    (40.0, (255, 100, 0, 220)),  # orange
    (45.0, (230, 30, 0, 228)),  # red-orange
    (50.0, (180, 0, 0, 235)),  # dark red
    (55.0, (160, 0, 180, 240)),  # purple
    (60.0, (255, 0, 255, 248)),  # magenta — likely hail
]


def _decode(v: bytes | str) -> str:
    return v.decode() if isinstance(v, bytes) else v


def _source_transform(where: h5py.AttributeManager) -> tuple[str, Affine]:
    """(CRS, north-up affine transform) of an ODIM-H5 grid, from its 'where' attrs."""
    projdef = _decode(where["projdef"])
    xscale, yscale = float(where["xscale"]), float(where["yscale"])
    tr = Transformer.from_crs("EPSG:4326", projdef, always_xy=True)
    ul_x, ul_y = tr.transform(float(where["UL_lon"]), float(where["UL_lat"]))
    return projdef, Affine(xscale, 0, ul_x, 0, -yscale, ul_y)


_TO_WEBMERCATOR = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


def _reproject_to_webmercator(
    values: np.ndarray,
    src_crs: str,
    src_transform: Affine,
    bounds: list[list[float]],
    shape: tuple[int, int],
) -> np.ndarray:
    """Warp a projected float32 grid (NaN = nodata) onto a Web Mercator pixel grid over `bounds`."""
    (south, west), (north, east) = bounds
    height, width = shape
    west_m, south_m = _TO_WEBMERCATOR.transform(west, south)
    east_m, north_m = _TO_WEBMERCATOR.transform(east, north)
    dst = np.full((height, width), np.nan, dtype=np.float32)
    reproject(
        source=values,
        destination=dst,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=from_bounds(west_m, south_m, east_m, north_m, width, height),
        dst_crs="EPSG:3857",
        src_nodata=np.nan,
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
    )
    return dst


def _apply_palette(
    values: np.ndarray,
    palette: list[tuple[float, tuple[int, int, int, int]]],
) -> np.ndarray:
    h, w = values.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    for i, (thr, color) in enumerate(palette):
        next_thr = palette[i + 1][0] if i + 1 < len(palette) else 1e9
        mask = ~np.isnan(values) & (values >= thr) & (values < next_thr)
        if mask.any():
            rgba[mask] = color
    mask = ~np.isnan(values) & (values >= palette[-1][0])
    if mask.any():
        rgba[mask] = palette[-1][1]
    return rgba


def _to_png(rgba: np.ndarray) -> bytes:
    img = Image.fromarray(rgba, "RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ── Public API ────────────────────────────────────────────────────────────────


def hdf5_to_png(data: bytes) -> tuple[bytes, list[list[float]]]:
    """MF accumulation (uint16, gain=0.01, offset=0) → PNG mm."""
    with h5py.File(io.BytesIO(data), "r") as f:
        ds_data = f["dataset1"]["data1"]
        raw = ds_data["data"][:]
        what = ds_data["what"].attrs
        gain = float(what.get("gain", 0.01))
        offset = float(what.get("offset", 0.0))
        nodata = float(what.get("nodata", 65535))
        undetect = float(what.get("undetect", 65534))

        mm = raw.astype(np.float32) * gain + offset
        mm[raw == int(nodata)] = np.nan
        mm[raw == int(undetect)] = np.nan
        mm[mm < MIN_RAIN_MM_H] = np.nan

        src_crs, src_transform = _source_transform(f["where"].attrs)

    grid = _reproject_to_webmercator(mm, src_crs, src_transform, DEFAULT_BOUNDS, MF_GRID_SHAPE)
    rgba = _apply_palette(grid, _PALETTE_ACRR)
    return _to_png(rgba), DEFAULT_BOUNDS


def _opera_float64_to_png(
    data: bytes,
    palette: list[tuple[float, tuple[int, int, int, int]]],
    threshold: float,
) -> tuple[bytes, list[list[float]]]:
    """Decode an OPERA float64 HDF5 file (DBZH, ACRR, or RATE) and reproject it."""
    with h5py.File(io.BytesIO(data), "r") as f:
        ds_data = f["dataset1"]["data1"]
        raw = ds_data["data"][:]
        what = ds_data["what"].attrs
        gain = float(what.get("gain", 1.0))
        offset = float(what.get("offset", 0.0))
        nodata = float(what.get("nodata", -9999000.0))
        undetect = float(what.get("undetect", -8888000.0))

        values = raw.astype(np.float32) * gain + offset
        values[np.isclose(raw, nodata)] = np.nan
        values[np.isclose(raw, undetect)] = np.nan
        values[values < threshold] = np.nan

        src_crs, src_transform = _source_transform(f["where"].attrs)

    grid = _reproject_to_webmercator(values, src_crs, src_transform, OPERA_BOUNDS, OPERA_GRID_SHAPE)
    rgba = _apply_palette(grid, palette)
    return _to_png(rgba), OPERA_BOUNDS


def dbzh_to_png(data: bytes) -> tuple[bytes, list[list[float]]]:
    """OPERA DBZH reflectivity (dBZ) → PNG."""
    return _opera_float64_to_png(data, _PALETTE_DBZH, MIN_DBZ)


def opera_acrr_to_png(data: bytes) -> tuple[bytes, list[list[float]]]:
    """OPERA ACRR rain accumulation (mm/1h) → PNG."""
    return _opera_float64_to_png(data, _PALETTE_ACRR, MIN_RAIN_MM_H)


def opera_rate_to_png(data: bytes) -> tuple[bytes, list[list[float]]]:
    """OPERA RATE instantaneous rain rate (mm/h) → PNG."""
    return _opera_float64_to_png(data, _PALETTE_RATE, MIN_RATE_MM_H)


def piaf_to_png(data: bytes) -> tuple[bytes, list[list[float]]]:
    """PIAF precipitation-rate forecast (mm/h, GeoTIFF, plain EPSG:4326 source) → PNG."""
    with MemoryFile(data) as mem, mem.open() as ds:
        values = ds.read(1).astype(np.float32)
        nodata = ds.nodata
        if nodata is not None:
            values[np.isclose(values, nodata)] = np.nan
        values[values < MIN_RATE_MM_H] = np.nan
        bounds = [[ds.bounds.bottom, ds.bounds.left], [ds.bounds.top, ds.bounds.right]]
        src_transform = ds.transform
        shape = values.shape

    grid = _reproject_to_webmercator(values, "EPSG:4326", src_transform, bounds, shape)
    rgba = _apply_palette(grid, _PALETTE_RATE)
    return _to_png(rgba), bounds
