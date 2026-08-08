// Age steps shared by every palette: fresh → 5min → 15min → 25min (ttl 30min).
var _AGE_STAGES = [
  { at: 0,        opacity: .95, radius: 5 },
  { at: 5 * 60e3,  opacity: .80, radius: 4 },
  { at: 15 * 60e3, opacity: .55, radius: 3 },
  { at: 25 * 60e3, opacity: .30, radius: 3 },
];

// neg = negative polarity (majority) · pos = positive (rare, severe storms)
var _PALETTE = {
  neg: ['#b39dff', '#8a5cff', '#6a3fd6', '#4b2e9e'],
  pos: ['#ffee00', '#ff8800', '#cc2200', '#881100'],
};

export function initLightning(map) {
  var BLITZ = {
    ttl: 30 * 60 * 1000,
    source: null, enabled: false, strikes: [],
  };

  function _stageIndex(ageMs) {
    var idx = 0;
    for (var i = 0; i < _AGE_STAGES.length; i++) if (ageMs >= _AGE_STAGES[i].at) idx = i;
    return idx;
  }

  function _styleFor(pol, ageMs) {
    var fam = pol === 1 ? 'pos' : 'neg';
    var stage = _stageIndex(ageMs);
    var s = _AGE_STAGES[stage];
    return {
      fillColor: _PALETTE[fam][stage],
      fillOpacity: s.opacity, opacity: s.opacity, radius: s.radius,
    };
  }

  function blitzSetStatus(state) {
    document.getElementById('blitz-dot').className = 'blitz-dot ' + state;
    document.getElementById('blitz-label').textContent =
      ({ on: 'connecté', wait: 'connexion…', off: 'hors ligne' })[state];
  }

  function blitzUpdateCount() {
    var cutoff = Date.now() - BLITZ.ttl;
    var n = BLITZ.strikes.filter(function (s) { return s.t > cutoff; }).length;
    document.getElementById('blitz-count').textContent =
      n + ' éclair' + (n !== 1 ? 's' : '') + ' · 30 min';
  }

  function blitzPrune() {
    var cutoff = Date.now() - BLITZ.ttl;
    BLITZ.strikes = BLITZ.strikes.filter(function (s) {
      if (s.t < cutoff) { if (map.hasLayer(s.marker)) map.removeLayer(s.marker); return false; }
      return true;
    });
    blitzUpdateCount();
  }

  function blitzAddStrike(lat, lon, tMs, pol) {
    if (!BLITZ.enabled) return;
    if (isNaN(lat) || isNaN(lon)) return;
    pol = pol === 1 ? 1 : -1;   // not provided by the backend yet → defaults to -1 (negative)
    var init = _styleFor(pol, 0);
    var marker = L.circleMarker([lat, lon], {
      radius: init.radius, color: 'rgba(255,255,255,0.7)', fillColor: init.fillColor,
      fillOpacity: init.fillOpacity, weight: 1.5, opacity: init.opacity, interactive: false,
    }).addTo(map);
    BLITZ.strikes.push({ t: tMs, marker: marker, pol: pol });
    blitzUpdateCount();
    _AGE_STAGES.slice(1).forEach(function (stage) {
      setTimeout(function () {
        if (!map.hasLayer(marker)) return;
        marker.setStyle(_styleFor(pol, Date.now() - tMs));
      }, stage.at);
    });
  }

  function blitzConnect() {
    if (!BLITZ.enabled) return;
    blitzSetStatus('wait');
    BLITZ.source = new EventSource('/api/lightning/stream');
    BLITZ.source.onopen = function () { blitzSetStatus('on'); };
    BLITZ.source.onmessage = function (ev) {
      try {
        var d = JSON.parse(ev.data);
        if (d.ping) return;
        blitzAddStrike(+d.lat, +d.lon, d.t || Date.now(), d.pol);
      } catch {}
    };
    BLITZ.source.onerror = function () {
      blitzSetStatus('wait');
      BLITZ.source.close();
      if (BLITZ.enabled) setTimeout(blitzConnect, 5000);
    };
  }

  function blitzDisconnect() {
    if (BLITZ.source) { BLITZ.source.close(); BLITZ.source = null; }
    BLITZ.strikes.forEach(function (s) { if (map.hasLayer(s.marker)) map.removeLayer(s.marker); });
    BLITZ.strikes = [];
    blitzUpdateCount();
  }

  document.getElementById('blitz-btn').addEventListener('click', function () {
    BLITZ.enabled = !BLITZ.enabled;
    localStorage.setItem('sw_blitz_on', BLITZ.enabled ? '1' : '');
    this.textContent = BLITZ.enabled ? '⚡ foudre · on' : '⚡ foudre';
    this.style.color = BLITZ.enabled ? 'var(--amber)' : '';
    document.getElementById('blitz-status-wrap').style.display = BLITZ.enabled ? '' : 'none';
    if (BLITZ.enabled) { blitzConnect(); }
    else { blitzDisconnect(); blitzSetStatus('off'); }
  });

  // Re-enable lightning automatically if it was on before navigating away.
  if (localStorage.getItem('sw_blitz_on')) document.getElementById('blitz-btn').click();

  setInterval(blitzPrune, 60 * 1000);

  return {
    refreshOnWake: function () {
      if (BLITZ.enabled) { blitzDisconnect(); blitzConnect(); }
    }
  };
}
