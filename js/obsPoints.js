import { onEvent } from './events.js';

// Real per-station temp/pressure readings — point markers, not interpolated like wind.
export function initObsPoints(map) {

  var _ON = false, _points = [], _group = null;

  var MIN_MARKER_GAP_PX = 70; // skip a station if it'd overlap one already placed on screen

  function render() {
    if (!_group) return;
    _group.clearLayers();
    var bounds = map.getBounds();
    var placed = []; // screen-space points already shown, to decide what else fits
    _points.forEach(function (p) {
      if (!bounds.contains([p.lat, p.lon])) return;
      var screenPt = map.latLngToContainerPoint([p.lat, p.lon]);
      for (var i = 0; i < placed.length; i++) {
        if (screenPt.distanceTo(placed[i]) < MIN_MARKER_GAP_PX) return;
      }
      placed.push(screenPt);
      var label = p.temp_c.toFixed(1) + '°C · ' + p.pressure_hpa.toFixed(0) + 'hPa';
      var icon = L.divIcon({ className: 'obs-marker', html: label, iconSize: null });
      L.marker([p.lat, p.lon], { icon: icon, interactive: false }).addTo(_group);
    });
  }

  function _refreshObs(btn) {
    fetch('/api/obs-points')
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (data) {
        if (!_ON) return;
        _points = data;
        render();
        if (btn) { btn.textContent = '🌡️ temp/pression · on'; btn.style.color = 'var(--cyan)'; btn.disabled = false; }
      })
      .catch(function () {
        if (btn) { btn.textContent = '🌡️ temp/pression'; btn.style.color = ''; btn.disabled = false; }
        _ON = false;
        localStorage.removeItem('sw_obs_on');
      });
  }

  document.getElementById('obs-btn').addEventListener('click', function () {
    var btn = this;
    _ON = !_ON;
    localStorage.setItem('sw_obs_on', _ON ? '1' : '');

    if (!_ON) {
      if (_group) { map.removeLayer(_group); _group = null; }
      map.off('moveend', render);
      btn.textContent = '🌡️ temp/pression';
      btn.style.color = '';
      return;
    }

    btn.textContent = '🌡️ chargement…';
    btn.disabled = true;
    _group = L.layerGroup().addTo(map);
    map.on('moveend', render);
    _refreshObs(btn);
  });

  // Re-enable automatically if it was on before navigating away (e.g. to settings.html).
  if (localStorage.getItem('sw_obs_on')) document.getElementById('obs-btn').click();

  onEvent('obs', function () { if (_ON) _refreshObs(null); });

  return {
    refreshOnWake: function () { if (_ON) _refreshObs(null); }
  };
}
