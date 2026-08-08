"""Météo-France data-source fetchers, re-exported for convenience."""

from .aromepi import fetch_cape_grid
from .observations import fetch_wind_grid
from .piaf import fetch_piaf_frames
from .radar import fetch_mf_accumulation
from .shear import fetch_shear_grids
from .vigilance import fetch_vigilance

__all__ = [
    "fetch_cape_grid",
    "fetch_mf_accumulation",
    "fetch_piaf_frames",
    "fetch_shear_grids",
    "fetch_vigilance",
    "fetch_wind_grid",
]
