// The 4 logo marks available in settings — animated SVG injected into .sweep containers.
// Ring/crosshair strokes are thickened vs. the original mockup so they survive down to a
// 16px favicon (thin single-px strokes disappear at that size; verified by rendering both).
/* exported STORM_LOGOS, STORM_LOGO_IDS, applyLogo, applyFavicon */
var STORM_LOGOS = {
  balayage: {
    label: 'Radar balayage',
    svg:
      '<svg viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="4"/>' +
      '<circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" stroke-width="3" opacity="0.7"/>' +
      '<circle cx="50" cy="50" r="14" fill="none" stroke="currentColor" stroke-width="3" opacity="0.55"/>' +
      '<line x1="8" y1="50" x2="92" y2="50" stroke="currentColor" stroke-width="2" opacity="0.35"/>' +
      '<line x1="50" y1="8" x2="50" y2="92" stroke="currentColor" stroke-width="2" opacity="0.35"/>' +
      '<g class="logo-sweep-rotor">' +
      '<path d="M50 50 L50 8 A42 42 0 0 1 79.7 20.3 Z" fill="currentColor" opacity="0.35"/>' +
      '<g transform="rotate(-18 50 50)"><path d="M50 50 L50 8 A42 42 0 0 1 79.7 20.3 Z" fill="currentColor" opacity="0.16"/></g>' +
      '<g transform="rotate(-36 50 50)"><path d="M50 50 L50 8 A42 42 0 0 1 79.7 20.3 Z" fill="currentColor" opacity="0.07"/></g>' +
      '</g>' +
      '<circle class="logo-blip" cx="72" cy="30" r="3.5" fill="currentColor"/>' +
      '</svg>',
  },
  entonnoir: {
    label: 'Tornade',
    svg:
      '<svg viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="3"/>' +
      '<path class="logo-band1" d="M22 24 Q50 18 78 24 Q60 30 50 30 Q40 30 30 32" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
      '<path class="logo-band2" d="M28 38 Q50 34 72 38 Q58 43 50 43 Q42 43 34 44" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
      '<path class="logo-band3" d="M34 52 Q50 49 66 52 Q56 56 50 56 Q44 56 40 57" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>' +
      '<path class="logo-band4" d="M40 65 Q50 63 60 65 Q54 68 50 68 Q46 68 44 69" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
      '<path class="logo-band5" d="M45 77 Q50 76 55 77" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
      '</svg>',
  },
  badge: {
    label: 'Orage',
    svg:
      '<svg viewBox="0 0 100 100">' +
      '<circle cx="50" cy="58" r="34" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.5"/>' +
      '<circle cx="50" cy="58" r="20" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>' +
      '<path d="M30 40 a10 10 0 0 1 19 -4 a8 8 0 0 1 15 3 a9 9 0 0 1 -2 17 H33 a11 11 0 0 1 -3 -16z" fill="currentColor"/>' +
      '<path class="logo-bolt-badge" d="M47 56 L38 71 L44 71 L42 85 L53 68 L46 68 Z" fill="currentColor"/>' +
      '<line class="logo-rain1" x1="30" y1="60" x2="27" y2="72" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>' +
      '<line class="logo-rain2" x1="58" y1="58" x2="55" y2="70" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>' +
      '<line class="logo-rain3" x1="66" y1="62" x2="63" y2="74" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>' +
      '</svg>',
  },
  echo: {
    label: 'Radar écho',
    svg:
      '<svg viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="3" opacity="0.9"/>' +
      '<circle cx="50" cy="50" r="27" fill="none" stroke="currentColor" stroke-width="2.6" opacity="0.7"/>' +
      '<circle cx="50" cy="50" r="14" fill="none" stroke="currentColor" stroke-width="2.6" opacity="0.5"/>' +
      '<circle class="logo-wave" cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle class="logo-wave logo-wave2" cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle class="logo-dot" cx="50" cy="50" r="4" fill="currentColor"/>' +
      '<circle cx="68" cy="34" r="10" fill="none" stroke="currentColor" stroke-width="2.2" opacity="0.55"/>' +
      '<circle class="logo-wave-echo" cx="68" cy="34" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle cx="68" cy="34" r="4" fill="currentColor" opacity="0.9"/>' +
      '</svg>',
  },
};

var STORM_LOGO_IDS = ['entonnoir', 'balayage', 'badge', 'echo'];

// Injects the chosen logo's SVG into every .sweep container on the page.
function applyLogo(id) {
  var logo = STORM_LOGOS[id] || STORM_LOGOS.entonnoir;
  document.querySelectorAll('.sweep').forEach(function (el) { el.innerHTML = logo.svg; });
}

// data: URI for the favicon — static (no animation classes) since browser tabs render favicons
// as a fixed frame, and swapping the color lets it follow the current accent like the header mark.
function applyFavicon(id, color) {
  var logo = STORM_LOGOS[id] || STORM_LOGOS.entonnoir;
  var svg = logo.svg.replace('<svg ', '<svg style="color:' + color + '" ');
  var link = document.getElementById('favicon-link');
  if (link) link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}
