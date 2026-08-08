import { ceilIndex } from './timeline.js';
import { touchCache, pruneCache } from './layerCache.js';
import { onEvent } from './events.js';

// RainViewer world tile mosaic: past frames + short nowcast, tile host comes from its own
// API response. getOpacity is a live getter (the opacity slider mutates it after creation).
export function initRainViewerSource(map, timeline, getOpacity) {
  var radarLayer = null, frames = [], radarHost = 'https://tilecache.rainviewer.com';
  var radarLayerCache = {};   // frame path → L.tileLayer, kept warm for instant frame switching
  var radarLayerOrder = [];   // paths, least-recently-shown first (LRU eviction)
  var RADAR_CACHE_MAX = 8;    // caps concurrent tile layers so pan/zoom doesn't reload N× tile grids at once
  var pastCount = 0, frameIndex = 0;
  var _rvGen = 0;             // bumped on every call; discards a response if a newer call has since started
  var _unsubscribe = null;

  // "frames" is past + nowcast concatenated; "now" is the last past frame, not frames[frames.length-1] (that's a nowcast slot).
  function liveIndex() {
    return pastCount > 0 ? pastCount - 1 : frames.length - 1;
  }

  function _getLayer(f) {
    var layer = radarLayerCache[f.path];
    if (!layer) {
      layer = L.tileLayer(radarHost + f.path + '/256/{z}/{x}/{y}/2/1_1.png',
        { opacity: 0, maxNativeZoom: 7, maxZoom: 19 }).addTo(map);
      radarLayerCache[f.path] = layer;
    }
    touchCache(map, radarLayerCache, radarLayerOrder, RADAR_CACHE_MAX, f.path, radarLayer);
    return layer;
  }

  function _syncCache() {
    var valid = {};
    frames.forEach(function (f) { valid[f.path] = true; });
    pruneCache(map, radarLayerCache, radarLayerOrder, valid);
  }

  function showFrame(i) {
    if (!frames.length) return;
    frameIndex = ((i % frames.length) + frames.length) % frames.length;
    var f = frames[frameIndex];
    var layer = _getLayer(f);
    if (radarLayer && radarLayer !== layer) radarLayer.setOpacity(0);
    layer.setOpacity(getOpacity());
    radarLayer = layer;
    var liveIdx    = liveIndex();
    var isLive     = frameIndex === liveIdx;
    document.getElementById('frame-time').textContent = '';
    timeline.setThumb(f.time * 1000, frameIndex, frames.length);
    var liveBtn = document.getElementById('live-btn');
    if (isLive) liveBtn.classList.add('is-live');
    else        liveBtn.classList.remove('is-live');
  }

  // mode: omitted = silent refresh (stay on live only if already there); {live:true} = force live; {seekMs:N} = closest frame to N.
  function refresh(mode) {
    var gen = ++_rvGen;
    fetch('/api/rainviewer/frames')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        if (gen !== _rvGen) return;
        if (data.host) radarHost = data.host;
        var past    = data.radar && data.radar.past    ? data.radar.past    : [];
        var nowcast = data.radar && data.radar.nowcast ? data.radar.nowcast : [];
        var oldLiveIdx = liveIndex();
        var atEnd   = !frames.length || frameIndex >= oldLiveIdx;
        var lastTs  = frames.length ? frames[oldLiveIdx].time : 0;
        pastCount = past.length;
        frames = past.concat(nowcast);
        _syncCache();
        if (!frames.length) {
          document.getElementById('frame-time').textContent = 'indisponible';
          timeline.render();
          return;
        }
        timeline.render();
        if (mode && mode.seekMs != null) {
          showFrame(ceilIndex(frames.length, function (i) { return frames[i].time * 1000; }, mode.seekMs));
        } else if (mode && mode.live) {
          showFrame(liveIndex());
        } else {
          var newLiveIdx = liveIndex();
          var newLastTs = frames[newLiveIdx].time;
          if (atEnd || newLastTs !== lastTs) showFrame(newLiveIdx);
        }
      })
      .catch(function () { if (gen === _rvGen) document.getElementById('frame-time').textContent = 'indisponible'; });
  }

  // RainViewer is only ever used for the "refl" category — DBZH publishes the same event.
  function startPolling() {
    _unsubscribe = onEvent('refl', function () { refresh(); });
  }

  function stopPolling() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  }

  function hide() {
    if (radarLayer) { radarLayer.setOpacity(0); radarLayer = null; }
  }

  function setOpacity(v) {
    if (radarLayer) radarLayer.setOpacity(v);
  }

  return {
    frameTimes: function () { return frames.map(function (f) { return f.time * 1000; }); },
    liveDataMs: function () { return frames.length ? frames[liveIndex()].time * 1000 : null; },
    liveIndex: liveIndex,
    frameIndex: function () { return frameIndex; },
    frameAt: function (i) { return frames[i]; },
    length: function () { return frames.length; },
    showFrame: showFrame,
    refresh: refresh,
    startPolling: startPolling,
    stopPolling: stopPolling,
    hide: hide,
    setOpacity: setOpacity,
  };
}
