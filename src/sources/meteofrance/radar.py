"""Météo-France Données radar accumulation (LAME_D_EAU product) fetch, HDF5/TAR unpacking."""

import gzip
import io
import logging
import tarfile
import zlib
from datetime import UTC, datetime
from types import SimpleNamespace

import h5py
import requests

from config import MF_RADAR_API_KEY, MF_RADAR_BASE_URL

log = logging.getLogger(__name__)

_MF_RADAR_HEADERS: dict[str, str] = {"apikey": MF_RADAR_API_KEY} if MF_RADAR_API_KEY else {}
_zone_cache = SimpleNamespace(value=None)

_METROPOLE_KEYWORDS = ("metropole", "metropolitan", "metro", "france")
_H5_PREFER = ("METROPOLE", "COMP", "MAX", "LAME")


def _unpack_response(raw: bytes, label: str = "") -> bytes | None:
    """Decompress gzip if needed, extract the first HDF5 file from a TAR archive."""
    content = raw
    if content[:2] == b"\x1f\x8b":
        try:
            content = gzip.decompress(content)
        except (OSError, EOFError, zlib.error) as e:
            log.warning("%s gzip: %s", label, e)
            return None

    if content[:4] == b"\x89HDF":
        return content

    if content[:4] == b"BUFR":
        log.debug("%s → BUFR (ignored)", label)
        return None

    try:
        h5_files: list[tuple[str, bytes]] = []
        with tarfile.open(fileobj=io.BytesIO(content)) as tf:
            for m in tf.getmembers():
                if m.name.lower().endswith((".h5", ".hdf5", ".hdf")):
                    fobj = tf.extractfile(m)
                    if fobj:
                        h5_files.append((m.name, fobj.read()))
        if not h5_files:
            log.error("%s TAR: no HDF5 file found", label)
            return None
        for fname, data in h5_files:
            if any(kw in fname.upper() for kw in _H5_PREFER):
                return data
        return h5_files[0][1]
    except (tarfile.TarError, OSError) as e:
        log.debug("%s not a TAR: %s", label, e)

    log.error("%s unknown format (magic=%s)", label, content[:8].hex())
    return None


# ── Météo-France Données radar — zone and observations ─────────────────────────


def _mf_radar_zone() -> str:
    if _zone_cache.value:
        return _zone_cache.value
    try:
        r = requests.get(f"{MF_RADAR_BASE_URL}/mosaiques", headers=_MF_RADAR_HEADERS, timeout=10)
        if r.status_code == 200:
            candidates = []
            for link in r.json().get("links", []):
                href = link.get("href", "")
                title = link.get("title", "").lower()
                if "/mosaiques/" in href:
                    name = href.split("/mosaiques/")[-1].split("/")[0]
                    if name:
                        score = sum(kw in (name + title).lower() for kw in _METROPOLE_KEYWORDS)
                        candidates.append((score, name))
            if candidates:
                candidates.sort(reverse=True)
                _zone_cache.value = candidates[0][1]
                log.info("Données radar zone: %s", _zone_cache.value)
                return _zone_cache.value
    except (requests.RequestException, ValueError, AttributeError, TypeError, KeyError) as e:
        log.warning("Données radar zone discovery: %s", e)
    _zone_cache.value = "METROPOLE"
    return _zone_cache.value


# ── Météo-France accumulation (LAME_D_EAU product, 500m) ───────────────────────


def fetch_mf_accumulation() -> tuple[bytes, datetime] | None:
    """Fetch MF rain accumulation (HDF5 500m, ~5 min) via Données radar."""
    if not MF_RADAR_API_KEY:
        return None
    zone = _mf_radar_zone()
    url = f"{MF_RADAR_BASE_URL}/mosaiques/{zone}/observations/LAME_D_EAU/produit?maille=500"
    try:
        r = requests.get(url, headers=_MF_RADAR_HEADERS, timeout=20)
        if r.status_code == 200:
            h5 = _unpack_response(r.content, "MF accumulation")
            if h5 is None:
                return None
            dt = _parse_hdf5_datetime(h5)
            if dt is None:
                now = datetime.now(tz=UTC)
                dt = now.replace(minute=(now.minute // 5) * 5, second=0, microsecond=0)
                log.warning("MF accumulation: no HDF5 timestamp, guessing %s", dt.strftime("%H:%M"))
            log.info("MF accumulation: %d KB (slot %s)", len(h5) // 1024, dt.strftime("%H:%M"))
            return h5, dt
        log.error("MF accumulation: HTTP %d", r.status_code)
    except requests.RequestException as e:
        log.error("MF accumulation: %s", e)
    return None


def _parse_hdf5_datetime(data: bytes) -> datetime | None:
    """Read date/time from the ODIM-H5 root 'what' attrs (date=YYYYMMDD, time=HHMMSS)."""
    try:
        with h5py.File(io.BytesIO(data), "r") as f:
            what = f.get("what")
            if what is None:
                return None
            date_s = what.attrs.get("date", "")
            time_s = what.attrs.get("time", "")
            if isinstance(date_s, bytes):
                date_s = date_s.decode()
            if isinstance(time_s, bytes):
                time_s = time_s.decode()
            if len(date_s) == 8 and len(time_s) == 6:
                return datetime.strptime(f"{date_s}T{time_s}", "%Y%m%dT%H%M%S").replace(tzinfo=UTC)
    except (OSError, ValueError, KeyError, AttributeError):
        pass
    return None
