import { CAPE_LEGEND } from './cape.js';
import { STP_LEGEND, EHI_LEGEND, HAIL_LEGEND } from './shear.js';

// Palettes mirrored from converter.py — for the legend.
// 'rv' colors come from RainViewer's own published color table for scheme 2
// (rainviewer.com/api/color-schemes.html — "Universal Blue", rain column).
export var LEGENDS = {
  rv: {
    unit: 'dBZ',
    items: [
      { label: '5',   rgb: '146,136,113' },
      { label: '10',  rgb: '206,192,135' },
      { label: '15',  rgb: '136,221,238' },
      { label: '20',  rgb: '0,163,224'   },
      { label: '25',  rgb: '0,119,170'   },
      { label: '30',  rgb: '0,85,136'    },
      { label: '35',  rgb: '255,238,0'   },
      { label: '40',  rgb: '255,170,0'   },
      { label: '45',  rgb: '255,68,0'    },
      { label: '50',  rgb: '193,0,0'     },
      { label: '55',  rgb: '255,170,255' },
      { label: '60+', rgb: '255,119,255' },
    ],
  },
  dbzh: {
    unit: 'dBZ',
    items: [
      { label: '5',   rgb: '100,180,255' },
      { label: '10',  rgb: '50,140,255'  },
      { label: '15',  rgb: '0,220,100'   },
      { label: '20',  rgb: '0,180,0'     },
      { label: '25',  rgb: '80,210,0'    },
      { label: '30',  rgb: '230,230,0'   },
      { label: '35',  rgb: '255,180,0'   },
      { label: '40',  rgb: '255,100,0'   },
      { label: '45',  rgb: '230,30,0'    },
      { label: '50',  rgb: '180,0,0'     },
      { label: '55',  rgb: '160,0,180'   },
      { label: '60+', rgb: '255,0,255'   },
    ],
  },
  acrr: {
    unit: 'mm/h',
    items: [
      { label: '0.1', rgb: '180,230,180' },
      { label: '0.5', rgb: '120,200,120' },
      { label: '1',   rgb: '60,170,60'   },
      { label: '2',   rgb: '0,130,0'     },
      { label: '4',   rgb: '180,210,0'   },
      { label: '7',   rgb: '255,220,0'   },
      { label: '12',  rgb: '255,140,0'   },
      { label: '20',  rgb: '220,40,0'    },
      { label: '30',  rgb: '160,0,0'     },
      { label: '50+', rgb: '160,40,200'  },
    ],
  },
  rate: {
    unit: 'mm/h',
    items: [
      { label: '0.1',  rgb: '180,230,180' },
      { label: '1',    rgb: '120,200,120' },
      { label: '2.5',  rgb: '60,170,60'   },
      { label: '5',    rgb: '180,210,0'   },
      { label: '10',   rgb: '255,220,0'   },
      { label: '20',   rgb: '255,140,0'   },
      { label: '40',   rgb: '220,40,0'    },
      { label: '80',   rgb: '160,0,0'     },
      { label: '150+', rgb: '160,40,200'  },
    ],
  },
  cape: CAPE_LEGEND,
  stp: STP_LEGEND,
  ehi: EHI_LEGEND,
  hail: HAIL_LEGEND,
};

// acrr_mf (Météo-France) and acrr (OPERA) are both mm/h cumulative rain, same color scale.
LEGENDS.acrr_mf = LEGENDS.acrr;
// PIAF is a rate forecast (mm/h), same physical quantity as OPERA RATE — same palette.
LEGENDS.piaf = LEGENDS.rate;
