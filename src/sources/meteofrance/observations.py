"""Météo-France Package Observations fetch + IDW interpolation: real-time station wind grid.

Package Observations' `/paquet/stations/infrahoraire-6m` returns every station's latest 6-min
observation nationwide in one GeoJSON request. Wind isn't reported at every point on a
regular grid like a model would give us, so we interpolate the sparse station readings
(inverse-distance weighting) onto the app's existing wind grid.
"""

import logging
import math
from datetime import UTC, datetime, timedelta

import requests

from config import MF_OBS_BASE_URL, MF_PACKAGE_OBS_API_KEY

log = logging.getLogger(__name__)

_HEADERS = {"apikey": MF_PACKAGE_OBS_API_KEY} if MF_PACKAGE_OBS_API_KEY else {}

WIND_LATS = [round(58.0 - i * 1.0, 2) for i in range(19)]  # N → S: 58 … 40
WIND_LONS = [round(-10.0 + i * 1.0, 2) for i in range(31)]  # W → E: -10 … 20

_PUBLISH_DELAY_MIN = 12  # observed lag between validity_time and data actually landing
_IDW_POWER = 2
_LON_SCALE = math.cos(math.radians(47.0))  # mid-latitude correction so lon/lat degrees compare


def _latest_valid_time() -> datetime:
    """Most recent 6-min-aligned timestamp (date param must land exactly on one)."""
    now = datetime.now(tz=UTC) - timedelta(minutes=_PUBLISH_DELAY_MIN)
    return now.replace(minute=(now.minute // 6) * 6, second=0, microsecond=0)


def _fetch_stations(valid_time: datetime) -> list[dict] | None:
    """Fetch the nationwide station snapshot (GeoJSON features) for one 6-min timestamp."""
    try:
        r = requests.get(
            f"{MF_OBS_BASE_URL}/paquet/stations/infrahoraire-6m",
            params={"date": valid_time.strftime("%Y-%m-%dT%H:%M:00Z"), "format": "geojson"},
            headers=_HEADERS,
            timeout=30,
        )
        if r.status_code == 200:
            data = r.json()
            return data["features"] if isinstance(data, dict) else data
        log.error("MF obs paquet: HTTP %d %s", r.status_code, r.text[:200])
    except (requests.RequestException, ValueError, KeyError) as e:
        log.error("MF obs paquet: %s", e)
    return None


def _station_wind(feature: dict) -> tuple[float, float, float, float] | None:
    """(lon, lat, u, v) for one station feature, or None if it didn't report wind."""
    props = feature["properties"]
    ff, dd = props.get("ff"), props.get("dd")
    if ff is None or dd is None:
        return None
    lon, lat = feature["geometry"]["coordinates"]
    rad = math.radians(dd)
    return lon, lat, -ff * math.sin(rad), -ff * math.cos(rad)


def _station_point(feature: dict) -> dict | None:
    """Needs temp + altitude-corrected `pmer` (not raw `pres`); ~200/1900 stations qualify."""
    props = feature["properties"]
    t, pmer = props.get("t"), props.get("pmer")
    if t is None or pmer is None:
        return None
    lon, lat = feature["geometry"]["coordinates"]
    return {
        "lon": lon,
        "lat": lat,
        "temp_c": round(t - 273.15, 1),
        "pressure_hpa": round(pmer / 100, 1),
    }


def _idw_interpolate(
    stations: list[tuple[float, float, float, float]], lats: list[float], lons: list[float]
) -> tuple[list[float], list[float]]:
    """Inverse-distance-weighted wind field on the given lat/lon grid."""
    u_data, v_data = [], []
    for lat in lats:
        for lon in lons:
            weighted_u = weighted_v = weight_sum = 0.0
            for slon, slat, su, sv in stations:
                dist = math.hypot((lon - slon) * _LON_SCALE, lat - slat)
                if dist < 1e-6:
                    weighted_u, weighted_v, weight_sum = su, sv, 1.0
                    break
                w = 1.0 / dist**_IDW_POWER
                weighted_u += w * su
                weighted_v += w * sv
                weight_sum += w
            u_data.append(round(weighted_u / weight_sum, 2))
            v_data.append(round(weighted_v / weight_sum, 2))
    return u_data, v_data


def fetch_wind_grid() -> tuple[list, list[dict]] | None:
    """(wind grid, station points) from one shared fetch of MF's nationwide station
    network (6-min obs): the interpolated wind grid, and the raw temp/pressure per
    station (unlike wind, these are real point measurements — not interpolated)."""
    valid_time = _latest_valid_time()
    features = _fetch_stations(valid_time)
    if not features:
        return None

    stations = [w for f in features if (w := _station_wind(f)) is not None]
    if not stations:
        log.error("MF obs paquet: no station reported valid wind at %s", valid_time)
        return None

    points = [p for f in features if (p := _station_point(f)) is not None]

    u_data, v_data = _idw_interpolate(stations, WIND_LATS, WIND_LONS)
    log.info(
        "MF obs wind grid: %d/%d stations with wind, %d with temp/pressure, %d pts (t=%s)",
        len(stations),
        len(features),
        len(points),
        len(WIND_LATS) * len(WIND_LONS),
        valid_time,
    )
    hdr_base = {
        "parameterCategory": 2,
        "dx": 1.0,
        "dy": 1.0,
        "la1": max(WIND_LATS),
        "lo1": min(WIND_LONS),
        "la2": min(WIND_LATS),
        "lo2": max(WIND_LONS),
        "nx": len(WIND_LONS),
        "ny": len(WIND_LATS),
        "refTime": valid_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    wind_json = [
        {
            "header": {
                **hdr_base,
                "parameterUnit": "m.s-1",
                "parameterNumber": 2,
                "parameterNumberName": "eastward_wind",
            },
            "data": u_data,
        },
        {
            "header": {
                **hdr_base,
                "parameterUnit": "m.s-1",
                "parameterNumber": 3,
                "parameterNumberName": "northward_wind",
            },
            "data": v_data,
        },
    ]
    return wind_json, points
