"""OPERA EUMETNET public S3 fetch (DBZH reflectivity + ACRR rain accumulation)."""

import logging
from datetime import UTC, datetime, timedelta

import requests

from config import OPERA_S3_BASE

log = logging.getLogger(__name__)


# ── OPERA EUMETNET — public S3 (DBZH + ACRR) ──────────────────────────────────


def _opera_url(dt: datetime, product: str) -> str:
    return (
        f"{OPERA_S3_BASE}/{dt.year:04d}/{dt.month:02d}/{dt.day:02d}"
        f"/OPERA/COMP/OPERA@{dt.strftime('%Y%m%dT%H%M')}@0@{product}.h5"
    )


def _current_slot(now: datetime | None = None) -> datetime:
    now = now or datetime.now(tz=UTC)
    return now.replace(minute=(now.minute // 5) * 5, second=0, microsecond=0)


def fetch_opera_hdf5(product: str) -> tuple[bytes, datetime] | None:
    """Fetch the most recent OPERA HDF5 file (30 min window)."""
    slot = _current_slot()
    for i in range(6):
        dt = slot - timedelta(minutes=5 * i)
        try:
            r = requests.get(_opera_url(dt, product), timeout=20)
            if r.status_code == 200:
                log.info(
                    "OPERA %s: %s (%d KB)", product, dt.strftime("%H:%M"), len(r.content) // 1024
                )
                return r.content, dt
        except requests.RequestException as e:
            log.warning("OPERA %s %s: %s", product, dt.strftime("%H:%M"), e)
    log.error("OPERA %s: no slot found within 30 min", product)
    return None


def fetch_opera_history(product: str, n_slots: int) -> list[tuple[bytes, datetime]]:
    """Fetch the last n_slots OPERA time slots from S3 (bootstrap)."""
    slot = _current_slot()
    results: list[tuple[bytes, datetime]] = []
    # 3x margin: ACRR/RATE only land 1-in-3 5-min slots (15-min cadence) vs DBZH's every slot.
    for i in range(n_slots * 3 + 6):
        if len(results) >= n_slots:
            break
        dt = slot - timedelta(minutes=5 * i)
        try:
            r = requests.get(_opera_url(dt, product), timeout=20)
            if r.status_code == 200:
                results.append((r.content, dt))
        except requests.RequestException:
            pass
    results.reverse()
    log.info("OPERA %s bootstrap: %d/%d frames", product, len(results), n_slots)
    return results
