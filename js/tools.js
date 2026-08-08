// Quick-access tool links (dashboard "Accès rapide" panel) — editable in settings.
// Blitzortung isn't listed here: its data is already live on the map, an external link would be redundant.
/* exported DEFAULT_TOOLS, renderTools */
var DEFAULT_TOOLS = [
  { name: 'Keraunos', desc: 'Radar, foudre, satellite, radiosondages — le portail le plus complet', url: 'https://www.keraunos.org' },
  { name: 'Infoclimat', desc: 'Modèle AROME 1.3km, réseau StatIC, outil ElectrIC', url: 'https://www.infoclimat.fr' },
  { name: 'Meteociel', desc: 'Indices convectifs détaillés : CAPE, cisaillement, sondages', url: 'https://www.meteociel.fr' },
  { name: 'Météorage', desc: 'Référence professionnelle française de détection foudre', url: 'https://www.meteorage.com' },
  { name: 'Zoom Earth', desc: 'Imagerie satellite globale, suivi des systèmes', url: 'https://zoom.earth' },
  { name: "Chasseurs d'Orages", desc: 'Communauté française, retours de terrain', url: 'https://chasseurs-orages.com' },
  { name: 'Windy (plein écran)', desc: 'Toutes les couches, sondages, mode plein écran', url: 'https://www.windy.com' },
];

// Renders the dashboard's quick-access cards; hides the whole section when disabled or empty.
function renderTools(list, enabled) {
  var section = document.getElementById('tools-section');
  var grid = document.getElementById('tools-grid');
  if (!section || !grid) return;
  if (!enabled || !list || !list.length) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = '';
  list.forEach(function (t) {
    var a = document.createElement('a');
    a.className = 'tool-card';
    a.href = t.url;
    a.target = '_blank';
    a.rel = 'noopener';
    var name = document.createElement('div');
    name.className = 'tool-name';
    name.textContent = t.name;
    var desc = document.createElement('div');
    desc.className = 'tool-desc';
    desc.textContent = t.desc;
    a.appendChild(name);
    a.appendChild(desc);
    grid.appendChild(a);
  });
}
