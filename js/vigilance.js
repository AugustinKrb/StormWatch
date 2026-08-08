import { onEvent } from './events.js';

var BANNER_MS = 90 * 1000;
var BANNER_TRANSITION_MS = 450;

var COLOR_CLASS = { 1: 'vig-green', 2: 'vig-yellow', 3: 'vig-orange', 4: 'vig-red' };
var COLOR_LABEL = { 1: 'VERT', 2: 'JAUNE', 3: 'ORANGE', 4: 'ROUGE' };
var DEFAULT_PHENOMENON_EMOJI = { '1': '💨', '2': '🌧️', '3': '⛈️', '4': '🏞️', '9': '🌊' };

function phenomenonEmoji(pid) {
  var custom = null;
  try { custom = JSON.parse(localStorage.getItem('sw_vigilance_emojis') || 'null'); } catch {}
  return (custom && custom[pid]) || DEFAULT_PHENOMENON_EMOJI[pid] || '';
}

function formatMessage(colorId, phenomenonId, phenomenonName, deptName) {
  var emoji = phenomenonEmoji(phenomenonId);
  var head = emoji + ' VIGILANCE ' + (COLOR_LABEL[colorId] || colorId) + ' — ' + phenomenonName.toUpperCase();
  return deptName ? head + ' (' + deptName + ')' : head;
}

function phenomenonEnabled(pid) {
  var prefs = null;
  try { prefs = JSON.parse(localStorage.getItem('sw_vigilance_phenomena') || 'null'); } catch {}
  return !prefs || prefs[pid] !== false;
}

function vigilanceEnabled() {
  return localStorage.getItem('sw_vigilance_enabled') !== 'false';
}

var GEOJSON_URL = 'js/data/departements.geojson';
var NEUTRAL_COLOR = '#4a5568'; // no tracked phenomenon elevated for this department
var HEX_BY_COLOR = { 2: '#facc15', 3: '#ff9f45', 4: '#ef4444' }; // matches --vig-orange (fixed, not theme-dependent)

// Worst color among tracked phenomena only (or one specific phenomenon if `pid` is set).
function deptContourColor(dept, pid) {
  if (!dept) return NEUTRAL_COLOR;
  var worst = 1;
  if (pid && pid !== 'all') {
    var p = dept.phenomena[pid];
    worst = p ? p.color : 1;
  } else {
    Object.keys(dept.phenomena).forEach(function (id) {
      if (dept.phenomena[id].color > worst) worst = dept.phenomena[id].color;
    });
  }
  return HEX_BY_COLOR[worst] || NEUTRAL_COLOR;
}

export function initVigilance(map, region) {
  var depts = region.depts || [];
  var seen = null; // dept -> phenomenon_id -> {name, color}, from the previous poll

  var banner = document.getElementById('vigilance-banner');
  var badges = document.getElementById('dept-badges');

  // ── Department contours, colored by vigilance level (left panel filter) ──
  var filterBtn = document.getElementById('vigilance-filter-btn');
  var filterMenu = document.getElementById('vigilance-filter-menu');
  var filterLabel = document.getElementById('vigilance-filter-label');
  var phenomenonFilter = localStorage.getItem('sw_vigilance_map_filter') || 'all';
  var contoursLayer = null;

  function setActiveFilterOpt() {
    filterMenu.querySelectorAll('.vig-filter-opt').forEach(function (btn) {
      var isActive = btn.dataset.phenomenon === phenomenonFilter;
      btn.classList.toggle('is-active', isActive);
      if (isActive) filterLabel.textContent = 'Vigilance : ' + btn.dataset.label;
    });
  }
  setActiveFilterOpt();

  function restyleContours() {
    if (!contoursLayer || !seen) return;
    contoursLayer.setStyle(function (feature) {
      return { color: deptContourColor(seen[feature.properties.code], phenomenonFilter) };
    });
  }

  if (depts.length) {
    fetch(GEOJSON_URL)
      .then(function (r) { return r.json(); })
      .then(function (geojson) {
        geojson.features = geojson.features.filter(function (f) { return depts.indexOf(f.properties.code) !== -1; });
        contoursLayer = L.geoJSON(geojson, {
          interactive: false,
          style: function (feature) {
            return {
              color: deptContourColor(seen && seen[feature.properties.code], phenomenonFilter),
              weight: 2,
              fillOpacity: 0,
              opacity: 0.85,
            };
          },
        }).addTo(map);
      })
      .catch(function () {});
  }

  if (filterBtn) {
    filterBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      filterMenu.style.display = filterMenu.style.display === 'none' ? 'flex' : 'none';
    });
    document.addEventListener('click', function (e) {
      if (!filterMenu.contains(e.target) && e.target !== filterBtn) filterMenu.style.display = 'none';
    });
    filterMenu.querySelectorAll('.vig-filter-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        phenomenonFilter = btn.dataset.phenomenon;
        localStorage.setItem('sw_vigilance_map_filter', phenomenonFilter);
        setActiveFilterOpt();
        restyleContours();
        filterMenu.style.display = 'none';
      });
    });
  }

  // ── Banner: one at a time, slides down/up over the radar map ──────────────
  var queue = [];
  var showing = false;
  var hideTimer = null;

  function showNext() {
    if (showing || !queue.length) return;
    showing = true;
    var item = queue.shift();
    banner.textContent = item.text;
    banner.className = 'vigilance-banner ' + COLOR_CLASS[item.colorId];
    requestAnimationFrame(function () { banner.classList.add('is-visible'); });

    hideTimer = setTimeout(dismiss, BANNER_MS);
  }

  function dismiss() {
    clearTimeout(hideTimer);
    banner.classList.remove('is-visible');
    setTimeout(function () { showing = false; showNext(); }, BANNER_TRANSITION_MS);
  }

  banner.addEventListener('click', function () { if (showing) dismiss(); });

  function alert_(colorId, phenomenonId, phenomenonName, deptName) {
    queue.push({ text: formatMessage(colorId, phenomenonId, phenomenonName, deptName), colorId: colorId });
    showNext();
  }

  function diffAndAlert(depts_) {
    if (!seen) return; // first poll: establish baseline, don't alert on pre-existing state
    depts.forEach(function (code) {
      var cur = depts_[code], prev = seen[code];
      if (!cur || !prev) return;
      Object.keys(cur.phenomena).forEach(function (pid) {
        var newP = cur.phenomena[pid], oldP = prev.phenomena[pid];
        if (oldP && newP.color > oldP.color && newP.color >= 2 && phenomenonEnabled(pid)) {
          alert_(newP.color, pid, newP.name, cur.name);
        }
      });
    });
  }

  function renderBadges(depts_) {
    var active = [];
    depts.forEach(function (code) {
      var d = depts_[code];
      if (!d || d.color < 2) return;
      Object.keys(d.phenomena).forEach(function (pid) {
        var p = d.phenomena[pid];
        if (p.color >= 2) active.push({ deptName: d.name, phenomenonId: pid, phenomenonName: p.name, color: p.color });
      });
    });
    if (!active.length) { badges.innerHTML = ''; return; }
    active.sort(function (a, b) { return b.color - a.color; });

    var worst = active[0];
    var emoji = phenomenonEmoji(worst.phenomenonId) || '⛈️';
    var tooltip = active.map(function (a) {
      return a.deptName + ' — ' + a.phenomenonName + ' — ' + COLOR_LABEL[a.color];
    }).join('\n');

    badges.innerHTML = '<div class="map-fab dept-badge ' + COLOR_CLASS[worst.color] + '" title="' + tooltip + '">' + emoji + '</div>';
  }

  function poll() {
    fetch('/api/vigilance')
      .then(function (r) { if (!r.ok) throw new Error('not ready'); return r.json(); })
      .then(function (data) {
        diffAndAlert(data.depts);
        renderBadges(data.depts);
        seen = data.depts;
        restyleContours();
      })
      .catch(function () {});
  }

  if (depts.length && vigilanceEnabled()) {
    poll();
    onEvent('vigilance', poll);
  }

  return {
    refreshOnWake: function () { if (depts.length && vigilanceEnabled()) poll(); }
  };
}
