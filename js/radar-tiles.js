import { ceilIndex } from './timeline.js';
import { touchCache, pruneCache } from './layerCache.js';
import { onEvent } from './events.js';

// dbzh/acrr/acrr_mf map to the category event shared with their alternate source; rate/piaf map to themselves.
var _CATEGORY_EVENT = { dbzh: 'refl', acrr: 'accr', acrr_mf: 'accr', rate: 'rate', piaf: 'piaf' };

function parseTileDate(fname) {
  var m = fname.match(/(\d{8}T\d{6}Z)/);
  if (!m) return null;
  var ts = m[1];
  return new Date(Date.UTC(+ts.slice(0,4), +ts.slice(4,6)-1, +ts.slice(6,8),
    +ts.slice(9,11), +ts.slice(11,13), +ts.slice(13,15)));
}

// OPERA/MF/PIAF product-tile sources (dbzh/acrr/acrr_mf/rate[+piaf forecast extension]) — one
// PNG image overlay per timestamped frame, served from /frames/<product>/<fname>. getOpacity and
// getSrcLabel are live getters (opacity slider / active category both change after creation).
export function initTileSource(map, timeline, getOpacity, getSrcLabel) {
  var tileLayer = null, tileFrames = [], tilePastCount = 0, tileFrameIndex = 0;
  var tileLayerCache = {};   // "product|fname" → L.imageOverlay, kept warm for instant frame switching
  var tileLayerOrder = [];   // "product|fname" keys, least-recently-shown first (LRU eviction)
  var TILE_CACHE_MAX = 10;   // caps concurrent overlays (OPERA/MF can keep up to MAX_FRAMES=24 frames on disk)
  var _tileInitUnsub = null;
  var _tileGen = 0;          // bumped on every load/clear; async responses check it to discard stale replies
  var _pollUnsubs = [];

  function _tileKey(f) { return f.product + '|' + f.fname; }

  function liveIndex() {
    return tilePastCount > 0 ? tilePastCount - 1 : tileFrames.length - 1;
  }

  function _getLayer(f) {
    var key = _tileKey(f);
    var layer = tileLayerCache[key];
    if (!layer) {
      layer = L.imageOverlay('/frames/' + f.product + '/' + f.fname, f.bounds, { opacity: 0, interactive: false }).addTo(map);
      tileLayerCache[key] = layer;
    }
    touchCache(map, tileLayerCache, tileLayerOrder, TILE_CACHE_MAX, key, tileLayer);
    return layer;
  }

  function _syncCache() {
    var valid = {};
    tileFrames.forEach(function (f) { valid[_tileKey(f)] = true; });
    pruneCache(map, tileLayerCache, tileLayerOrder, valid);
  }

  function buildTicks() {
    timeline.render();
    if (tileFrames.length === 1) {
      var container = document.getElementById('timeline-ticks');
      var hint = document.createElement('div');
      hint.className = 't-label';
      hint.style.cssText = 'left:50%;top:15px;transform:translateX(-50%);font-size:9px;color:var(--text-dim)';
      hint.textContent = 'Timeline en cours d\'accumulation — màj toutes les 5 min';
      container.appendChild(hint);
    }
  }

  function showFrame(i) {
    if (!tileFrames.length) return;
    tileFrameIndex = ((i % tileFrames.length) + tileFrames.length) % tileFrames.length;
    var f = tileFrames[tileFrameIndex];
    var layer = _getLayer(f);
    if (tileLayer && tileLayer !== layer) tileLayer.setOpacity(0);
    layer.setOpacity(getOpacity());
    tileLayer = layer;
    var dt = parseTileDate(f.fname);
    var isLive = tileFrameIndex === liveIndex();
    document.getElementById('frame-time').textContent = '';
    timeline.setThumb(dt ? dt.getTime() : null, tileFrameIndex, tileFrames.length);
    var liveBtn = document.getElementById('live-btn');
    if (isLive) liveBtn.classList.add('is-live'); else liveBtn.classList.remove('is-live');
  }

  // Frame descriptors { fname, product, bounds } for one product, sorted chronologically.
  function _fetchProductFrames(product) {
    return Promise.all([
      fetch('/api/bounds/' + product).then(function (r) { return r.json(); }),
      fetch('/api/frames/' + product).then(function (r) { return r.json(); }),
    ]).then(function (res) {
      var bounds = res[0];
      return res[1].sort().map(function (fname) { return { fname: fname, product: product, bounds: bounds }; });
    });
  }

  function _ceilTileIndex(targetMs) {
    return ceilIndex(tileFrames.length, function (i) {
      var dt = parseTileDate(tileFrames[i].fname);
      return dt ? dt.getTime() : null;
    }, targetMs);
  }

  function pollOnce(product, forecastProduct) {
    var gen = _tileGen;
    Promise.all([
      _fetchProductFrames(product),
      forecastProduct ? _fetchProductFrames(forecastProduct) : Promise.resolve([]),
    ]).then(function (r) {
      if (gen !== _tileGen) return;
      var base = r[0], forecast = r[1];
      if (!base.length && !forecast.length) return;
      var atLive = !tileFrames.length || tileFrameIndex >= liveIndex();
      tilePastCount = forecast.length ? base.length : 0;
      tileFrames = base.concat(forecast);
      buildTicks();
      _syncCache();
      if (atLive) showFrame(liveIndex());
    }).catch(function () {});
  }

  function startPolling(product, forecastProduct) {
    var gen = _tileGen;
    function handler() { if (gen === _tileGen) pollOnce(product, forecastProduct); }
    _pollUnsubs.push(onEvent(_CATEGORY_EVENT[product] || product, handler));
    if (forecastProduct) _pollUnsubs.push(onEvent(_CATEGORY_EVENT[forecastProduct] || forecastProduct, handler));
  }

  function stopPolling() {
    _pollUnsubs.forEach(function (unsub) { unsub(); });
    _pollUnsubs = [];
  }

  // seekMs (optional): land on the frame closest to that timestamp instead of the latest one.
  function load(product, forecastProduct, seekMs) {
    var gen = ++_tileGen;
    if (_tileInitUnsub) { _tileInitUnsub(); _tileInitUnsub = null; }

    function fetchBoth() {
      return Promise.all([
        _fetchProductFrames(product),
        forecastProduct ? _fetchProductFrames(forecastProduct) : Promise.resolve([]),
      ]);
    }

    function apply(base, forecast) {
      if (gen !== _tileGen) return;
      tilePastCount = forecast.length ? base.length : 0;
      tileFrames = base.concat(forecast);
      buildTicks();
      _syncCache();
      showFrame(seekMs != null ? _ceilTileIndex(seekMs) : liveIndex());
    }

    fetchBoth().then(function (r) {
      if (gen !== _tileGen) return;
      if (r[0].length) {
        apply(r[0], r[1]);
      } else {
        document.getElementById('frame-time').textContent = getSrcLabel() + ' · chargement…';
        tileFrames = []; tilePastCount = 0;
        buildTicks();
        _tileInitUnsub = onEvent(_CATEGORY_EVENT[product] || product, function () {
          fetchBoth().then(function (r2) {
            if (gen !== _tileGen || !r2[0].length) return;
            _tileInitUnsub(); _tileInitUnsub = null;
            apply(r2[0], r2[1]);
          }).catch(function () {});
        });
      }
    }).catch(function () {
      if (gen !== _tileGen) return;
      document.getElementById('frame-time').textContent = getSrcLabel() + ' · backend indisponible';
    });
  }

  // Unconditional reset — called on every category switch, not just when leaving a tile source,
  // so a stale in-flight fetch from any previous source never lands after the switch.
  function clear() {
    stopPolling();
    if (_tileInitUnsub) { _tileInitUnsub(); _tileInitUnsub = null; }
    pruneCache(map, tileLayerCache, tileLayerOrder, {});
    tileLayer = null;
    _tileGen++;
    tileFrames = []; tilePastCount = 0;
  }

  function hide() {
    if (tileLayer) { tileLayer.setOpacity(0); tileLayer = null; }
  }

  function setOpacity(v) {
    if (tileLayer) tileLayer.setOpacity(v);
  }

  return {
    frameTimes: function () {
      return tileFrames
        .map(function (f) { var dt = parseTileDate(f.fname); return dt ? dt.getTime() : null; })
        .filter(function (t) { return t != null; });
    },
    liveDataMs: function () {
      if (!tileFrames.length) return null;
      var dt = parseTileDate(tileFrames[liveIndex()].fname);
      return dt ? dt.getTime() : null;
    },
    liveIndex: liveIndex,
    frameIndex: function () { return tileFrameIndex; },
    frameAt: function (i) { return tileFrames[i]; },
    length: function () { return tileFrames.length; },
    showFrame: showFrame,
    load: load,
    pollOnce: pollOnce,
    startPolling: startPolling,
    stopPolling: stopPolling,
    clear: clear,
    hide: hide,
    setOpacity: setOpacity,
    buildTicks: buildTicks,
    parseTileDate: parseTileDate,
  };
}
