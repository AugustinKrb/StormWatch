import { initRadar } from './radar.js';
import { initWind } from './wind.js';
import { initObsPoints } from './obsPoints.js';
import { initGPS } from './gps.js';
import { initLightning } from './lightning.js';
import { initVigilance } from './vigilance.js';
import { initDocs } from './docs.js';
import { onEvent } from './events.js';

(function () {

  var region;
  try { region = JSON.parse(localStorage.getItem('sw_region') || 'null'); } catch {}
  if (!region || !region.depts) { location.replace('settings.html'); return; }

  document.title = 'StormWatch — ' + region.name;
  document.getElementById('region-name').textContent = region.name;
  document.getElementById('region-sub').textContent = region.sublabel;

  function tick() {
    var now = new Date();
    document.getElementById('clock-time').textContent =
      now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Paris' });
    document.getElementById('clock-date').textContent =
      now.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'Europe/Paris' });
  }
  tick(); setInterval(tick, 1000);

  var map = L.map('radar-map', { zoomControl: true, attributionControl: true })
    .setView([region.lat, region.lon], region.zoom);
  map.zoomControl.setPosition('bottomright'); // top-left is taken by the overlay panel

  var basemaps = {
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd', maxZoom: 19,
    }),
    voyager: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?lang=fr', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd', maxZoom: 19,
    }),
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }),
  };

  var basemapId = localStorage.getItem('sw_basemap') || 'dark';
  if (!basemaps[basemapId]) basemapId = 'dark';
  basemaps[basemapId].addTo(map);

  var basemapBtn = document.getElementById('basemap-btn');
  var basemapMenu = document.getElementById('basemap-menu');
  function setActiveBasemapOpt() {
    basemapMenu.querySelectorAll('.basemap-opt').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.basemap === basemapId);
    });
  }
  setActiveBasemapOpt();

  basemapBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    basemapMenu.style.display = basemapMenu.style.display === 'none' ? 'flex' : 'none';
  });
  document.addEventListener('click', function (e) {
    if (!basemapMenu.contains(e.target) && e.target !== basemapBtn) basemapMenu.style.display = 'none';
  });
  basemapMenu.querySelectorAll('.basemap-opt').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.dataset.basemap;
      if (id === basemapId) { basemapMenu.style.display = 'none'; return; }
      map.removeLayer(basemaps[basemapId]);
      basemapId = id;
      basemaps[basemapId].addTo(map);
      localStorage.setItem('sw_basemap', basemapId);
      setActiveBasemapOpt();
      basemapMenu.style.display = 'none';
    });
  });

  var radar = initRadar(map);
  var wind = initWind(map);
  var obsPoints = initObsPoints(map);
  initGPS(map);
  var lightning = initLightning(map);
  var vigilance = initVigilance(map, region);
  initDocs();

  document.getElementById('change-region-btn').addEventListener('click', function () {
    location.href = 'settings.html';
  });

  document.getElementById('overlay-collapse-btn').addEventListener('click', function () {
    document.getElementById('map-overlay').classList.toggle('is-collapsed');
  });

  document.getElementById('timeline-collapse-btn').addEventListener('click', function () {
    document.getElementById('radar-timeline').classList.toggle('is-collapsed');
  });

  var radarShell = document.getElementById('radar-shell');
  var fullscreenBtn = document.getElementById('fullscreen-btn');
  fullscreenBtn.addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else radarShell.requestFullscreen();
  });
  function _syncControlInset() {
    var zoomEl = document.querySelector('.leaflet-control-zoom');
    var mapEl = document.getElementById('radar-map');
    if (!zoomEl || !mapEl) return;
    var inset = mapEl.getBoundingClientRect().bottom - zoomEl.getBoundingClientRect().bottom;
    if (inset > 0) document.documentElement.style.setProperty('--leaflet-bottom-inset', inset + 'px');
  }

  document.addEventListener('fullscreenchange', function () {
    var isFs = document.fullscreenElement === radarShell;
    fullscreenBtn.title = isFs ? 'Quitter le plein écran' : 'Plein écran';
    fullscreenBtn.classList.toggle('is-on', isFs);
    if (isFs && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
    else if (!isFs && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    setTimeout(function () { map.invalidateSize(); _syncControlInset(); }, 50);
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { map.invalidateSize(); _syncControlInset(); }, 150);
  });

  map.whenReady(function () { setTimeout(_syncControlInset, 50); });

  // Separate timeouts: lightning MQTT should connect almost instantly, job_cape/job_shear's initial fetch can take minutes.
  // Re-checks are event-driven (wind/cape/shear/lightning pushes), not polled — the two timeouts below are just a ceiling.
  (function initBannerWatcher() {
    var banner = document.getElementById('init-banner');
    var startedAt = Date.now();
    var LIGHTNING_TIMEOUT_MS = 20 * 1000;
    var DATA_TIMEOUT_MS = 8 * 60 * 1000;
    var settings = { cape: true, shear: true }; // settings unreachable: fall back to waiting on everything

    function check() {
      fetch('/api/status')
        .then(function (r) { return r.json(); })
        .then(function (s) {
          var elapsed = Date.now() - startedAt;
          var lightningReady = s.lightning || elapsed > LIGHTNING_TIMEOUT_MS;
          // Only wait on a layer if its settings toggle is actually on — a disabled layer never reports ready.
          var capeReady = !settings.cape || s.cape;
          var shearReady = !settings.shear || (s.stp && s.ehi && s.hail);
          var dataReady = (s.wind && capeReady && shearReady) || elapsed > DATA_TIMEOUT_MS;
          if (lightningReady && dataReady) banner.classList.add('init-banner-hidden');
        })
        .catch(function () {
          if (Date.now() - startedAt > DATA_TIMEOUT_MS) banner.classList.add('init-banner-hidden');
        });
    }

    ['wind', 'cape', 'shear', 'lightning'].forEach(function (evt) { onEvent(evt, check); });
    setTimeout(check, LIGHTNING_TIMEOUT_MS + 500);
    setTimeout(check, DATA_TIMEOUT_MS + 500);

    fetch('/api/settings')
      .then(function (r) { return r.json(); })
      .then(function (s) { settings = s; check(); })
      .catch(check);
  }());

  // Browsers throttle setInterval on hidden tabs — force a refresh when visible again.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    radar.refreshOnWake();
    wind.refreshOnWake();
    obsPoints.refreshOnWake();
    lightning.refreshOnWake();
    vigilance.refreshOnWake();
  });

}());
