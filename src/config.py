"""Environment-based app configuration, loaded once from .env at import time."""

import os

from dotenv import load_dotenv

load_dotenv()

# Pinned, not env-overridable: a version bump always requires matching code changes anyway.
# Météo-France Données radar — France HDF5 mosaics
MF_RADAR_API_KEY: str = os.getenv("MF_RADAR_API_KEY", "")
MF_RADAR_BASE_URL = "https://public-api.meteofrance.fr/public/DPRadar/v1"

# Météo-France AROME-PI — CAPE grid (WCS), separate key, hourly-run nowcast model
MF_AROMEPI_API_KEY: str = os.getenv("MF_AROMEPI_API_KEY", "")
MF_AROMEPI_BASE_URL = "https://public-api.meteofrance.fr/public/aromepi/1.0"

# Météo-France Package Observations — nationwide station snapshot (6 min)
MF_PACKAGE_OBS_API_KEY: str = os.getenv("MF_PACKAGE_OBS_API_KEY", "")
MF_OBS_BASE_URL = "https://public-api.meteofrance.fr/public/DPPaquetObs/v2"

# Météo-France PIAF — precipitation-rate nowcast grid (WCS), separate key, run every 5 min
MF_PIAF_API_KEY: str = os.getenv("MF_PIAF_API_KEY", "")
MF_PIAF_BASE_URL = "https://api.meteofrance.fr/pro/piaf/1.0"

# Météo-France Bulletin Vigilance — vigilance bulletin (level/phenomenon per department)
MF_VIGILANCE_KEY: str = os.getenv("MF_VIGILANCE_KEY", "")
MF_VIGILANCE_BASE_URL = "https://public-api.meteofrance.fr/public/DPVigilance/v1"

# OPERA EUMETNET — public S3, no authentication required (CC BY 4.0)
OPERA_S3_BASE = "https://s3.waw3-1.cloudferro.com/openradar-24h"

# RainViewer — public frame-metadata API, no authentication required
RAINVIEWER_API_URL: str = os.getenv(
    "RAINVIEWER_API_URL",
    "https://api.rainviewer.com/public/weather-maps.json",
)

# Blitzortung — public community lightning-detection MQTT broker, no authentication required
BLITZORTUNG_MQTT_HOST: str = os.getenv("BLITZORTUNG_MQTT_HOST", "blitzortung.ha.sed.pl")
BLITZORTUNG_MQTT_PORT: int = int(os.getenv("BLITZORTUNG_MQTT_PORT", "1883"))

FETCH_INTERVAL_SEC: int = int(os.getenv("FETCH_INTERVAL_SEC", "300"))
MAX_FRAMES: int = int(os.getenv("MAX_FRAMES", "24"))
MAX_FRAME_AGE_MIN: int = int(os.getenv("MAX_FRAME_AGE_MIN", "120"))
FRAMES_DIR: str = os.getenv("FRAMES_DIR", "/app/frames")
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "5000"))
