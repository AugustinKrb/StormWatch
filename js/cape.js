import { initShear } from './shear.js';

// Color ramp (J/kg) mirrored in CAPE_LEGEND below.
var _CAPE_STOPS = [
  { v: 0,    c: [20,  30,  70,   0] },
  { v: 100,  c: [30,  100, 190,  140] },
  { v: 300,  c: [30,  160, 120,  170] },
  { v: 700,  c: [90,  190, 50,   195] },
  { v: 1200, c: [225, 205, 30,   215] },
  { v: 2000, c: [230, 110, 20,   230] },
  { v: 3500, c: [200, 25,  25,   240] },
  { v: 5000, c: [195, 30,  160,  250] },
];

export var CAPE_LEGEND = {
  unit: 'J/kg',
  items: [
    { label: '0',     rgb: '20,30,70'   },
    { label: '100',   rgb: '30,100,190' },
    { label: '300',   rgb: '30,160,120' },
    { label: '700',   rgb: '90,190,50'  },
    { label: '1200',  rgb: '225,205,30' },
    { label: '2000',  rgb: '230,110,20' },
    { label: '3500',  rgb: '200,25,25'  },
    { label: '5000+', rgb: '195,30,160' },
  ],
};

// Same fetch/render contract as shear.js's initShear — one grid (bounds/nx/ny) with several forecast `frames` (one per hour).
export function initCape(map) {
  return initShear(map, '/api/cape', _CAPE_STOPS);
}
