import { onEvent } from './events.js';

export function initWind(map) {

  // leaflet-velocity@1.9.2 hardcodes a 750ms debounce before redrawing the wind
  // field after a pan/zoom. Override with a shorter one; CDN URL is version-pinned.
  if (L.VelocityLayer) {
    L.VelocityLayer.prototype.onDrawLayer = function () {
      var self = this;
      if (!this._windy) { this._initWindy(this); return; }
      if (!this.options.data) return;
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(function () { self._startWindy(); }, 50);
    };
  }

  var _WIND_ON = false, _WIND_LAYER = null;

  function _applyVelocityData(data) {
    if (!_WIND_ON) return;
    if (_WIND_LAYER) { map.removeLayer(_WIND_LAYER); _WIND_LAYER = null; }
    _WIND_LAYER = L.velocityLayer({
      displayValues: false,
      data: data,
      maxVelocity: 25,        // m/s → upper color bound
      velocityScale: 0.007,   // apparent particle speed
      particleAge: 80,        // lifetime (frames)
      lineWidth: 1.4,
      particleMultiplier: 0.0035,  // density
      colorScale: [
        'rgba(200,200,200,0.2)',
        'rgba(210,210,210,0.5)',
        'rgba(225,225,225,0.75)',
        'rgba(240,240,240,0.9)',
        'rgba(255,255,255,1.0)',
      ],
      opacity: 1,
    }).addTo(map);
  }

  function _refreshWind(btn) {
    fetch('/api/wind')
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (data) {
        if (!_WIND_ON) return;
        _applyVelocityData(data);
        if (btn) { btn.textContent = '💨 vent · on'; btn.style.color = 'var(--cyan)'; btn.disabled = false; }
      })
      .catch(function () {
        if (btn) { btn.textContent = '💨 vent'; btn.style.color = ''; btn.disabled = false; }
        _WIND_ON = false;
        localStorage.removeItem('sw_wind_on');
      });
  }

  document.getElementById('wind-btn').addEventListener('click', function () {
    var btn = this;
    _WIND_ON = !_WIND_ON;
    localStorage.setItem('sw_wind_on', _WIND_ON ? '1' : '');

    if (!_WIND_ON) {
      if (_WIND_LAYER) { map.removeLayer(_WIND_LAYER); _WIND_LAYER = null; }
      btn.textContent = '💨 vent';
      btn.style.color = '';
      return;
    }

    btn.textContent = '💨 chargement…';
    btn.disabled = true;
    _refreshWind(btn);
  });

  // Re-enable wind automatically if it was on before navigating away (e.g. to settings.html).
  if (localStorage.getItem('sw_wind_on')) document.getElementById('wind-btn').click();

  onEvent('wind', function () { if (_WIND_ON) _refreshWind(null); });

  return {
    refreshOnWake: function () { if (_WIND_ON) _refreshWind(null); }
  };
}
