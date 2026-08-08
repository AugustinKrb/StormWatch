import { initCape } from './cape.js';
import { initShear, STP_STOPS, EHI_STOPS, HAIL_STOPS } from './shear.js';
import { LEGENDS } from './legends.js';
import { initTimeline, ceilIndex } from './timeline.js';
import { initRainViewerSource } from './radar-rainviewer.js';
import { initTileSource } from './radar-tiles.js';
import { onEvent } from './events.js';

export function initRadar(map) {

  // Categories backed by a forecast grid (bounds/nx/ny + hourly frames) rather than a tile/image sequence.
  var _GRID_CATS = { cape: true, stp: true, ehi: true, hail: true };

  // Past grid step matches each source's real data granularity (grid sources hourly, cumul 5min, rate 15min, refl 10min).
  function _pastStepMin() {
    if (_GRID_CATS[radarSource]) return 60;
    if (_category === 'rate') return 15;
    return _category === 'accr' ? 5 : 10;
  }

  // Ruler labels only every ten minutes for cumul — its 5min in-between marks get a tick, no text.
  function _labelStepMin() {
    return _category === 'accr' ? 10 : _pastStepMin();
  }

  function _currentIndex() {
    if (radarSource === 'rv')          return rvSource.frameIndex();
    if (_GRID_CATS[radarSource])       return gridState[radarSource].frameIndex;
    return tileSource.frameIndex();
  }

  // ms[] of every real frame the active source currently has — feeds the ruler overlay and drag seek.
  function _currentFrameTimes() {
    if (radarSource === 'rv')    return rvSource.frameTimes();
    if (_GRID_CATS[radarSource]) return gridState[radarSource].frames.map(function (f) { return new Date(f.time).getTime(); });
    return tileSource.frameTimes();
  }

  // The actual latest fetched frame's own timestamp, for the "live" tick/label.
  function _liveDataMs() {
    if (radarSource === 'rv') return rvSource.liveDataMs();
    if (_GRID_CATS[radarSource]) {
      var gs = gridState[radarSource];
      return gs.frames.length ? new Date(gs.frames[gs.liveIndex].time).getTime() : null;
    }
    return tileSource.liveDataMs();
  }

  function _seekToIndex(i) {
    if (playing) { playing = false; clearInterval(playTimer); document.getElementById('play-btn').textContent = '▶'; }
    if (radarSource === 'rv')              rvSource.showFrame(i);
    else if (_GRID_CATS[radarSource])      showGridFrame(radarSource, i);
    else                                    tileSource.showFrame(i);
  }

  var timeline = initTimeline({
    getFrameTimes: _currentFrameTimes,
    getLiveDataMs: _liveDataMs,
    getPastStepMin: _pastStepMin,
    getLabelStepMin: _labelStepMin,
    getCurrentIndex: _currentIndex,
    seekToIndex: _seekToIndex,
  });

  // ── State ────────────────────────────────────────────────────────────────

  var playing = false, playTimer = null;

  var radarOpacity = parseFloat(localStorage.getItem('sw_opacity') || '0.6');
  var reflSource = localStorage.getItem('sw_reflectivite') || 'rv';   // 'rv' | 'dbzh'
  var acrrSource = localStorage.getItem('sw_acrr') || 'acrr';         // 'acrr_mf' | 'acrr'
  // category : 'refl' | 'accr' | 'rate' | 'cape' | 'hail' | 'stp' | 'ehi' — selected via the layer buttons, only one area-fill layer shown at a time
  var _CATEGORIES = ['refl', 'accr', 'rate', 'cape', 'hail', 'ehi', 'stp'];
  var _category = localStorage.getItem('sw_category') || 'refl';
  if (_CATEGORIES.indexOf(_category) === -1) _category = 'refl';
  // radarSource : 'rv' | 'dbzh' | 'acrr' | 'acrr_mf' | 'rate' | 'cape' | 'hail' | 'stp' | 'ehi'
  var radarSource = _category === 'accr' ? acrrSource : _GRID_CATS[_category] ? _category : _category === 'rate' ? 'rate' : reflSource;

  var _SRC_LABELS = { rv: 'RainViewer', dbzh: 'OPERA réfl.', acrr: 'OPERA cumul', acrr_mf: 'MF cumul', rate: 'OPERA RATE', cape: 'CAPE Météo-France', stp: 'STP Météo-France', ehi: 'EHI Météo-France', hail: 'Grêle Météo-France' };
  // refl/accr/rate are observed radar data; cape/stp/ehi/hail are computed AROME-PI model indices.
  var _CATEGORY_KIND = { refl: 'Radar', accr: 'Radar', rate: 'Radar', cape: 'Modèle', stp: 'Modèle', ehi: 'Modèle', hail: 'Modèle' };

  // Live getters — both sources read the opacity slider's current value and (for tiles) the
  // active category's label lazily, since both change well after the source is constructed.
  function _getOpacity() { return radarOpacity; }
  function _getSrcLabel() { return _SRC_LABELS[radarSource]; }

  var rvSource = initRainViewerSource(map, timeline, _getOpacity);
  var tileSource = initTileSource(map, timeline, _getOpacity, _getSrcLabel);

  // One controller + one frame-state slot per grid category (cape/stp/ehi/hail) — same forecast-grid
  // contract (bounds/nx/ny + hourly frames), only the endpoint/color ramp differs.
  var gridState = {
    cape: { ctl: initCape(map), grid: null, frames: [], frameIndex: 0, liveIndex: 0 },
    stp: { ctl: initShear(map, '/api/stp', STP_STOPS), grid: null, frames: [], frameIndex: 0, liveIndex: 0 },
    ehi: { ctl: initShear(map, '/api/ehi', EHI_STOPS), grid: null, frames: [], frameIndex: 0, liveIndex: 0 },
    hail: { ctl: initShear(map, '/api/hail', HAIL_STOPS), grid: null, frames: [], frameIndex: 0, liveIndex: 0 },
  };

  onEvent('cape', function () { if (radarSource === 'cape') _loadGrid('cape'); });
  onEvent('shear', function () { if (_GRID_CATS[radarSource] && radarSource !== 'cape') _loadGrid(radarSource); });

  // The layer buttons in the map overlay panel, one per category.
  var _LAYER_BTN_IDS = { refl: 'layer-refl', accr: 'layer-cumul', rate: 'layer-rate', cape: 'layer-cape', stp: 'layer-stp', ehi: 'layer-ehi', hail: 'layer-hail' };
  // Whether each category currently has any data — grays out + hatches the button when false.
  var _available = { refl: true, accr: true, rate: true, cape: true, stp: true, ehi: true, hail: true };
  // Server-side on/off switches (settings page) — disabled sources are never fetched at all.
  // STP, EHI and hail share one toggle ("shear") — same backend job, same AROME-PI key.
  var _sourceEnabled = { refl: true, accr: true, rate: true, cape: true, shear: true };
  var _sourceSettingsLoaded = fetch('/api/settings')
    .then(function (r) { return r.json(); })
    .then(function (s) { _sourceEnabled = s; })
    .catch(function () {});

  function _updatePanelLabel() {
    document.getElementById('radar-category-label').textContent = _CATEGORY_KIND[_category];
    document.getElementById('radar-source-label').textContent = _SRC_LABELS[radarSource];
  }

  function _updateLayerButtons() {
    _CATEGORIES.forEach(function (cat) {
      var btn = document.getElementById(_LAYER_BTN_IDS[cat]);
      btn.classList.toggle('is-active', cat === _category);
      btn.classList.toggle('is-unavailable', !_available[cat]);
      btn.disabled = !_available[cat];
    });
  }

  // Grays out inactive categories with no data yet (CAPE often isn't ready at launch); disabled sources skip the fetch entirely.
  function _checkAvailability() {
    var reflCheck = !_sourceEnabled.refl ? Promise.resolve(false) : reflSource === 'rv'
      ? Promise.resolve(true)
      : fetch('/api/frames/dbzh').then(function (r) { return r.json(); })
          .then(function (l) { return l.length > 0; }).catch(function () { return false; });
    var accrCheck = !_sourceEnabled.accr ? Promise.resolve(false) : fetch('/api/frames/' + acrrSource).then(function (r) { return r.json(); })
      .then(function (l) { return l.length > 0; }).catch(function () { return false; });
    var rateCheck = !_sourceEnabled.rate ? Promise.resolve(false) : fetch('/api/frames/rate').then(function (r) { return r.json(); })
      .then(function (l) { return l.length > 0; }).catch(function () { return false; });
    // cape/stp/ehi/hail all read from the same /api/status snapshot — one fetch covers all four.
    var statusCheck = (_sourceEnabled.cape || _sourceEnabled.shear)
      ? fetch('/api/status').then(function (r) { return r.json(); }).catch(function () { return {}; })
      : Promise.resolve({});

    Promise.all([reflCheck, accrCheck, rateCheck, statusCheck]).then(function (res) {
      var s = res[3];
      _available = {
        refl: res[0], accr: res[1], rate: res[2],
        cape: _sourceEnabled.cape && !!s.cape,
        stp: _sourceEnabled.shear && !!s.stp,
        ehi: _sourceEnabled.shear && !!s.ehi,
        hail: _sourceEnabled.shear && !!s.hail,
      };
      _updateLayerButtons();
    });
  }

  // Top = highest value, evenly spaced stops.
  function updateLegend(source) {
    var el = document.getElementById('radar-legend');
    var pal = LEGENDS[source];
    if (!pal) { el.style.display = 'none'; return; }

    var highToLow = pal.items.slice().reverse();
    var n = highToLow.length;
    var stops = [], labels = '';
    highToLow.forEach(function (item, i) {
      var pct = n > 1 ? (i / (n - 1)) * 100 : 0;
      stops.push('rgb(' + item.rgb + ') ' + pct + '%');
      labels += '<div class="map-legend-label" style="top:' + pct + '%">' + item.label + '</div>';
    });

    el.innerHTML =
      '<div class="map-legend-body">' +
        '<div class="map-legend-gradient" style="background:linear-gradient(to bottom, ' + stops.join(', ') + ')"></div>' +
        '<div class="map-legend-labels">' + labels + '</div>' +
      '</div>' +
      (pal.unit ? '<div class="map-legend-unit">' + pal.unit + '</div>' : '');
    el.style.display = '';
  }

  // category → product supplying the future half of its timeline, if any.
  var _FORECAST_EXT = { rate: 'piaf' };

  function _activeForecastExt(category) {
    var ext = _FORECAST_EXT[category];
    return ext && _sourceEnabled[ext] !== false ? ext : null;
  }

  (function syncOpacityUI() {
    var pct = Math.round(radarOpacity * 100);
    document.getElementById('opacity-slider').value = pct;
    document.getElementById('opacity-val').textContent = pct + '%';
  }());

  // gs.frames = history (strictly past, cape only) + [live, forecast...]; gs.liveIndex marks "now".
  function showGridFrame(cat, i) {
    var gs = gridState[cat];
    if (!gs.frames.length || !gs.grid) return;
    gs.frameIndex = Math.max(0, Math.min(gs.frames.length - 1, i));
    var f = gs.frames[gs.frameIndex];
    gs.ctl.showFrame(gs.grid, f, radarOpacity);
    var isLive = gs.frameIndex === gs.liveIndex;
    document.getElementById('frame-time').textContent = '';
    timeline.setThumb(new Date(f.time).getTime(), gs.frameIndex, gs.frames.length);
    var liveBtn = document.getElementById('live-btn');
    if (isLive) liveBtn.classList.add('is-live'); else liveBtn.classList.remove('is-live');
  }

  // Bilinear-sample the currently shown frame of a grid category at a lat/lng (same interpolation as the render canvas).
  function _gridValueAt(cat, latlng) {
    var gs = gridState[cat];
    if (!gs.grid || !gs.frames.length) return null;
    var values = gs.frames[gs.frameIndex].values;
    var nx = gs.grid.nx, ny = gs.grid.ny;
    var fx = (latlng.lng - gs.grid.lo1) / (gs.grid.lo2 - gs.grid.lo1) * (nx - 1);
    var fy = (gs.grid.la1 - latlng.lat) / (gs.grid.la1 - gs.grid.la2) * (ny - 1);
    if (fx < 0 || fx > nx - 1 || fy < 0 || fy > ny - 1) return null;
    var x0 = Math.max(0, Math.min(nx - 2, Math.floor(fx))), x1 = x0 + 1;
    var y0 = Math.max(0, Math.min(ny - 2, Math.floor(fy))), y1 = y0 + 1;
    var tx = fx - x0, ty = fy - y0;
    var v00 = values[y0][x0], v10 = values[y0][x1];
    var v01 = values[y1][x0], v11 = values[y1][x1];
    if (v00 == null || v10 == null || v01 == null || v11 == null) return null;
    var top = v00 + (v10 - v00) * tx;
    var bot = v01 + (v11 - v01) * tx;
    return top + (bot - top) * ty;
  }

  var probePopup = L.popup({ closeButton: true, className: 'cape-probe-popup' });
  var _PROBE_UNITS = { cape: 'J/kg', stp: 'STP', ehi: 'EHI', hail: 'GRELE' };

  map.on('click', function (e) {
    if (_GRID_CATS[radarSource]) {
      var v = _gridValueAt(radarSource, e.latlng);
      var content = v == null ? 'N/A' : (Math.round(v * 10) / 10) + ' ' + _PROBE_UNITS[radarSource];
      probePopup.setLatLng(e.latlng).setContent(content).openOn(map);
    }
  });

  function _loadGrid(cat, mode) {
    var gs = gridState[cat];
    document.getElementById('frame-time').textContent = cat.toUpperCase() + ' · chargement…';
    // Silent refresh only snaps back to live if we were already there (empty frames counts as "at live").
    var wasAtLive = !gs.frames.length || gs.frameIndex === gs.liveIndex;
    gs.ctl.load().then(function (grid) {
      if (radarSource !== cat) return;
      gs.grid = grid;
      gs.frames = grid.frames || [];
      gs.liveIndex = grid.liveIndex != null ? grid.liveIndex : 0;
      if (!gs.frames.length) {
        document.getElementById('frame-time').textContent = cat.toUpperCase() + ' · indisponible';
        timeline.render();
        return;
      }
      timeline.render();
      var idx;
      if (mode && mode.seekMs != null) {
        idx = ceilIndex(gs.frames.length, function (i) { return new Date(gs.frames[i].time).getTime(); }, mode.seekMs);
      } else if ((mode && mode.live) || wasAtLive) {
        idx = gs.liveIndex;
      } else {
        idx = Math.min(gs.frameIndex, gs.frames.length - 1);
      }
      showGridFrame(cat, idx);
    }).catch(function () {
      if (radarSource === cat) document.getElementById('frame-time').textContent = cat.toUpperCase() + ' · indisponible';
    });
  }

  updateLegend(radarSource);
  _updateLayerButtons();
  _updatePanelLabel();

  if (radarSource === 'rv') {
    rvSource.refresh();
    rvSource.startPolling();
  } else if (_GRID_CATS[radarSource]) {
    _loadGrid(radarSource);
  } else {
    tileSource.load(radarSource, _activeForecastExt(_category));
    tileSource.startPolling(radarSource, _activeForecastExt(_category));
  }

  document.getElementById('play-btn').addEventListener('click', function () {
    playing = !playing;
    this.textContent = playing ? '⏸' : '▶';
    if (playing) {
      playTimer = setInterval(function () {
        if (radarSource === 'rv')              rvSource.showFrame(rvSource.frameIndex() + 1);
        else if (_GRID_CATS[radarSource])      showGridFrame(radarSource, gridState[radarSource].frameIndex + 1);
        else                                    tileSource.showFrame(tileSource.frameIndex() + 1);
      }, 600);
    } else {
      clearInterval(playTimer);
      if (radarSource === 'rv' && rvSource.length())                               rvSource.showFrame(rvSource.liveIndex());
      else if (_GRID_CATS[radarSource] && gridState[radarSource].frames.length)    showGridFrame(radarSource, gridState[radarSource].liveIndex);
      else if (tileSource.length())                                               tileSource.showFrame(tileSource.liveIndex());
    }
  });

  // Same bounded step the timeline thumb's arrow keys already use — no wraparound.
  function _stepFrame(delta) {
    var times = _currentFrameTimes();
    if (!times.length) return;
    _seekToIndex(Math.max(0, Math.min(times.length - 1, _currentIndex() + delta)));
  }
  document.getElementById('frame-prev-btn').addEventListener('click', function () { _stepFrame(-1); });
  document.getElementById('frame-next-btn').addEventListener('click', function () { _stepFrame(1); });

  document.getElementById('live-btn').addEventListener('click', function () {
    if (playing) { clearInterval(playTimer); playing = false; document.getElementById('play-btn').textContent = '▶'; }
    if (radarSource === 'rv') {
      if (rvSource.length()) rvSource.showFrame(rvSource.liveIndex());
      rvSource.refresh({ live: true });
    } else if (_GRID_CATS[radarSource]) {
      var gsLive = gridState[radarSource];
      if (gsLive.frames.length) showGridFrame(radarSource, gsLive.liveIndex);
      _loadGrid(radarSource, { live: true });
    } else {
      if (tileSource.length()) tileSource.showFrame(tileSource.liveIndex());
      tileSource.pollOnce(radarSource, _activeForecastExt(_category));
    }
  });

  function switchCategory(newCategory) {
    if (newCategory === _category || !_available[newCategory]) return;

    // Carries the displayed time to the new source only when scrubbed away from live — on live, land on the new source's own live frame.
    var seekMs = null;
    if (radarSource === 'rv') {
      if (rvSource.length() && rvSource.frameIndex() !== rvSource.liveIndex()) seekMs = rvSource.frameAt(rvSource.frameIndex()).time * 1000;
    } else if (_GRID_CATS[radarSource]) {
      var gsOld = gridState[radarSource];
      if (gsOld.frames.length && gsOld.frameIndex !== gsOld.liveIndex) seekMs = new Date(gsOld.frames[gsOld.frameIndex].time).getTime();
    } else if (tileSource.length() && tileSource.frameIndex() !== tileSource.liveIndex()) {
      var curDt = tileSource.parseTileDate(tileSource.frameAt(tileSource.frameIndex()).fname);
      if (curDt) seekMs = curDt.getTime();
    }

    _category = newCategory;
    localStorage.setItem('sw_category', _category);
    radarSource = _category === 'accr' ? acrrSource : _GRID_CATS[_category] ? _category : _category === 'rate' ? 'rate' : reflSource;

    if (playing) { clearInterval(playTimer); playing = false; document.getElementById('play-btn').textContent = '▶'; }
    // Unconditional resets — every switch clears every source, not just the one we're leaving,
    // so a stale in-flight fetch from any previous source never lands after the switch.
    rvSource.hide();
    rvSource.stopPolling();
    tileSource.clear();
    Object.keys(gridState).forEach(function (cat) {
      var gs = gridState[cat];
      gs.ctl.hide();
      gs.grid = null; gs.frames = []; gs.frameIndex = 0; gs.liveIndex = 0;
    });
    map.closePopup(probePopup);

    _updateLayerButtons();
    updateLegend(radarSource);
    _updatePanelLabel();

    if (radarSource === 'rv') {
      rvSource.refresh(seekMs != null ? { seekMs: seekMs } : { live: true });
      rvSource.startPolling();
    } else if (_GRID_CATS[radarSource]) {
      _loadGrid(radarSource, seekMs != null ? { seekMs: seekMs } : { live: true });
    } else {
      tileSource.load(radarSource, _activeForecastExt(_category), seekMs);
      tileSource.startPolling(radarSource, _activeForecastExt(_category));
    }
  }

  _CATEGORIES.forEach(function (cat) {
    document.getElementById(_LAYER_BTN_IDS[cat]).addEventListener('click', function () {
      switchCategory(cat);
    });
  });

  _sourceSettingsLoaded.then(function () {
    _checkAvailability();
    ['refl', 'accr', 'rate', 'cape', 'shear'].forEach(function (evt) { onEvent(evt, _checkAvailability); });
  });

  document.getElementById('opacity-slider').addEventListener('input', function () {
    radarOpacity = +this.value / 100;
    localStorage.setItem('sw_opacity', radarOpacity);
    document.getElementById('opacity-val').textContent = this.value + '%';
    if (radarSource === 'rv')                                rvSource.setOpacity(radarOpacity);
    if (_GRID_CATS[radarSource])                             gridState[radarSource].ctl.setOpacity(radarOpacity);
    if (radarSource !== 'rv' && !_GRID_CATS[radarSource])    tileSource.setOpacity(radarOpacity);
  });

  // Re-render the live frame and the ruler periodically so both stay pinned to wall-clock now.
  setInterval(function () {
    if (radarSource === 'rv') {
      if (rvSource.length() && rvSource.frameIndex() === rvSource.liveIndex()) rvSource.showFrame(rvSource.frameIndex());
      timeline.render();
    } else if (_GRID_CATS[radarSource]) {
      timeline.render();
    } else {
      if (tileSource.length() && tileSource.frameIndex() === tileSource.liveIndex()) tileSource.showFrame(tileSource.frameIndex());
      tileSource.buildTicks();
    }
  }, 15 * 1000);

  return {
    refreshOnWake: function () {
      if (radarSource === 'rv')              rvSource.refresh();
      else if (_GRID_CATS[radarSource])      _loadGrid(radarSource);
      else                                    tileSource.pollOnce(radarSource, _activeForecastExt(_category));
    }
  };
}
