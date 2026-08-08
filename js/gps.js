export function initGPS(map) {
  var gpsMarker = null, gpsAccCircle = null, gpsWatchId = null;
  var autoFollow = !!localStorage.getItem('sw_gps_autofollow');
  var autoBtn = document.getElementById('autofollow-btn');

  // Auto-follow only makes sense while position tracking is on — hidden the rest of the time.
  function _syncAutoBtn() {
    autoBtn.style.display = gpsWatchId !== null ? '' : 'none';
    autoBtn.classList.toggle('is-on', autoFollow);
  }
  _syncAutoBtn();

  autoBtn.addEventListener('click', function () {
    autoFollow = !autoFollow;
    localStorage.setItem('sw_gps_autofollow', autoFollow ? '1' : '');
    _syncAutoBtn();
  });

  document.getElementById('gps-btn').addEventListener('click', function () {
    var btn = this;

    if (gpsWatchId !== null) {
      navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = null;
      if (gpsMarker)    { map.removeLayer(gpsMarker);    gpsMarker = null; }
      if (gpsAccCircle) { map.removeLayer(gpsAccCircle); gpsAccCircle = null; }
      btn.textContent = '📍 position';
      btn.style.color = '';
      _syncAutoBtn();
      return;
    }

    if (!navigator.geolocation) {
      btn.textContent = '📍 non dispo';
      return;
    }

    btn.textContent = '⌛ localisation…';

    gpsWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        var acc = pos.coords.accuracy;

        if (!gpsMarker) {
          var accent = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim();
          gpsAccCircle = L.circle([lat, lon], {
            radius: acc, color: accent, fillColor: accent,
            fillOpacity: 0.08, weight: 1, interactive: false,
          }).addTo(map);
          gpsMarker = L.circleMarker([lat, lon], {
            radius: 7, color: '#fff', fillColor: accent,
            fillOpacity: 1, weight: 2, interactive: false,
          }).addTo(map);
          map.setView([lat, lon], map.getZoom());
          _syncAutoBtn();
        } else {
          gpsMarker.setLatLng([lat, lon]);
          gpsAccCircle.setLatLng([lat, lon]);
          gpsAccCircle.setRadius(acc);
          if (autoFollow) map.panTo([lat, lon]);
        }

        btn.textContent = '📍 suivi actif';
        btn.style.color = 'var(--cyan)';
      },
      function () {
        btn.textContent = '📍 position';
        btn.style.color = '';
        gpsWatchId = null;
        _syncAutoBtn();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  });
}
