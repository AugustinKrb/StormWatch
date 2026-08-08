import { renderGridCanvas } from './gridRender.js';

// Color ramp (unitless) mirrored in STP_LEGEND/EHI_LEGEND below.
// STP (Significant Tornado Parameter) — SPC convention: <0.5 negligible, ~1 significant, 4+ extreme.
var _STP_STOPS = [
  { v: 0,   c: [20,  30,  70,   0]   },
  { v: 0.5, c: [30,  100, 190,  120] },
  { v: 1,   c: [30,  160, 120,  160] },
  { v: 2,   c: [225, 205, 30,   195] },
  { v: 4,   c: [230, 110, 20,   220] },
  { v: 8,   c: [200, 25,  25,   240] },
];

// EHI (Energy Helicity Index) — rotation strength, not tornado significance: <1 weak, 1-2 moderate, 5+ extreme.
var _EHI_STOPS = [
  { v: 0,   c: [20,  30,  70,   0]   },
  { v: 0.5, c: [30,  100, 190,  120] },
  { v: 1,   c: [30,  160, 120,  160] },
  { v: 2,   c: [225, 205, 30,   195] },
  { v: 3,   c: [230, 110, 20,   220] },
  { v: 5,   c: [200, 25,  25,   240] },
];

export var STP_LEGEND = {
  unit: '',
  items: [
    { label: '0',   rgb: '20,30,70'   },
    { label: '0.5', rgb: '30,100,190' },
    { label: '1',   rgb: '30,160,120' },
    { label: '2',   rgb: '225,205,30' },
    { label: '4',   rgb: '230,110,20' },
    { label: '8+',  rgb: '200,25,25'  },
  ],
};

export var EHI_LEGEND = {
  unit: '',
  items: [
    { label: '0',   rgb: '20,30,70'   },
    { label: '0.5', rgb: '30,100,190' },
    { label: '1',   rgb: '30,160,120' },
    { label: '2',   rgb: '225,205,30' },
    { label: '3',   rgb: '230,110,20' },
    { label: '5+',  rgb: '200,25,25'  },
  ],
};

// DIAG_GRELE is dimensionless — colors sampled from MF's own AROME-PI hail map (via meteociel.fr), no official threshold doc.
var _HAIL_STOPS = [
  { v: 0,  c: [64,  0,   64,  0]   },
  { v: 1,  c: [96,  0,   96,  140] },
  { v: 2,  c: [170, 0,   170, 148] },
  { v: 3,  c: [128, 16,  128, 156] },
  { v: 4,  c: [96,  0,   64,  164] },
  { v: 5,  c: [48,  51,  102, 172] },
  { v: 6,  c: [0,   51,  153, 180] },
  { v: 7,  c: [0,   0,   204, 188] },
  { v: 8,  c: [0,   0,   255, 196] },
  { v: 9,  c: [0,   85,  255, 204] },
  { v: 10, c: [0,   153, 255, 212] },
  { v: 11, c: [51,  204, 255, 220] },
  { v: 12, c: [102, 255, 255, 228] },
  { v: 13, c: [102, 255, 153, 236] },
  { v: 14, c: [102, 255, 102, 244] },
  { v: 15, c: [102, 255, 0,   250] },
  { v: 16, c: [191, 250, 14,  250] },
  { v: 17, c: [255, 255, 9,   250] },
  { v: 18, c: [255, 255, 134, 250] },
  { v: 19, c: [253, 232, 81,  250] },
  { v: 20, c: [255, 204, 0,   250] },
  { v: 21, c: [255, 153, 0,   250] },
  { v: 22, c: [255, 105, 0,   250] },
  { v: 23, c: [255, 77,  51,  250] },
  { v: 24, c: [255, 48,  0,   250] },
  { v: 25, c: [255, 0,   0,   250] },
  { v: 26, c: [229, 0,   0,   250] },
  { v: 27, c: [178, 0,   0,   250] },
  { v: 28, c: [153, 0,   0,   250] },
  { v: 29, c: [108, 0,   0,   250] },
  { v: 30, c: [128, 0,   80,  250] },
  { v: 31, c: [160, 0,   119, 250] },
  { v: 32, c: [204, 0,   204, 250] },
  { v: 33, c: [255, 0,   255, 250] },
  { v: 34, c: [255, 64,  255, 250] },
  { v: 35, c: [255, 128, 255, 250] },
];

export var HAIL_LEGEND = {
  unit: '',
  items: [
    { label: '0',   rgb: '64,0,64'     },
    { label: '5',   rgb: '48,51,102'   },
    { label: '10',  rgb: '0,153,255'   },
    { label: '15',  rgb: '102,255,0'   },
    { label: '20',  rgb: '255,204,0'   },
    { label: '25',  rgb: '255,0,0'     },
    { label: '30',  rgb: '128,0,80'    },
    { label: '35+', rgb: '255,128,255' },
  ],
};

// Fetch + render only, same contract as cape.js's initCape — one grid (bounds/nx/ny)
// with several forecast `frames` (one per hour). apiPath: '/api/stp' or '/api/ehi'.
export function initShear(map, apiPath, stops) {

  var layer = null;

  function load() {
    return fetch(apiPath)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  function showFrame(grid, frame, opacity) {
    if (layer) { map.removeLayer(layer); layer = null; }
    var dataUrl = renderGridCanvas(stops, grid.nx, grid.ny, frame.values, grid.la1, grid.la2);
    var bounds = [[grid.la2, grid.lo1], [grid.la1, grid.lo2]];
    layer = L.imageOverlay(dataUrl, bounds, { opacity: opacity, interactive: false }).addTo(map);
  }

  function hide() {
    if (layer) { map.removeLayer(layer); layer = null; }
  }

  function setOpacity(opacity) {
    if (layer) layer.setOpacity(opacity);
  }

  return { load: load, showFrame: showFrame, hide: hide, setOpacity: setOpacity };
}

export var STP_STOPS = _STP_STOPS;
export var EHI_STOPS = _EHI_STOPS;
export var HAIL_STOPS = _HAIL_STOPS;
