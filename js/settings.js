(function () {
  var LS_KEYS = {
    region: 'sw_region',
    refl_source: 'sw_reflectivite',
    accr_source: 'sw_acrr',
    timeline_past_h: 'sw_timeline_past_h',
    timeline_future_h: 'sw_timeline_future_h',
    vigilance_phenomena: 'sw_vigilance_phenomena',
    vigilance_enabled: 'sw_vigilance_enabled',
    vigilance_emojis: 'sw_vigilance_emojis',
    theme: 'sw_theme',
    logo: 'sw_logo',
    tools: 'sw_tools',
    tools_enabled: 'sw_tools_enabled',
  };
  var VIGILANCE_IDS = ['1', '2', '3', '4', '9'];
  var THEME_IDS = ['green', 'purple', 'blue', 'red'];

  var DEFAULT_VIGILANCE_EMOJIS = { '1': '💨', '2': '🌧️', '3': '⛈️', '4': '🏞️', '9': '🌊' };

  var reflPref = 'rv';
  var acrrPref = 'acrr';
  // Everything below is display-only and never read by the backend — localStorage only.
  var selected = null;
  try { selected = JSON.parse(localStorage.getItem(LS_KEYS.region) || 'null'); } catch {}
  var themePref = localStorage.getItem(LS_KEYS.theme) || 'green';
  var logoPref = localStorage.getItem(LS_KEYS.logo) || 'entonnoir';
  var toolsPref = DEFAULT_TOOLS.slice();
  try {
    var storedTools = JSON.parse(localStorage.getItem(LS_KEYS.tools) || 'null');
    if (Array.isArray(storedTools) && storedTools.length) toolsPref = storedTools;
  } catch {}
  var toolEditIndex = null; // null = the modal is adding a new entry, not editing one
  var vigEmojis = Object.assign({}, DEFAULT_VIGILANCE_EMOJIS);
  try {
    var storedEmojis = JSON.parse(localStorage.getItem(LS_KEYS.vigilance_emojis) || 'null');
    if (storedEmojis) vigEmojis = storedEmojis;
  } catch {}

  var pastHInput = document.getElementById('timeline-past-h');
  var futureHInput = document.getElementById('timeline-future-h');
  var toggleVigMaster = document.getElementById('toggle-vig-master');
  var vigilanceList = document.getElementById('vigilance-toggle-list');
  var vigilanceKeyMissing = document.getElementById('vigilance-key-missing');
  var toggleRefl = document.getElementById('toggle-refl');
  var toggleAccr = document.getElementById('toggle-accr');
  var toggleRate = document.getElementById('toggle-rate');
  var toggleCape = document.getElementById('toggle-cape');
  var toggleShear = document.getElementById('toggle-shear');
  var togglePiaf = document.getElementById('toggle-piaf');
  var btn = document.getElementById('save-btn');
  var backendError = document.getElementById('backend-error');

  pastHInput.value = localStorage.getItem(LS_KEYS.timeline_past_h) || 2;
  futureHInput.value = localStorage.getItem(LS_KEYS.timeline_future_h) || 6;
  pastHInput.addEventListener('change', function () {
    localStorage.setItem(LS_KEYS.timeline_past_h, parseFloat(pastHInput.value) || 2);
  });
  futureHInput.addEventListener('change', function () {
    localStorage.setItem(LS_KEYS.timeline_future_h, parseFloat(futureHInput.value) || 6);
  });

  var storedPhenomena = {};
  try { storedPhenomena = JSON.parse(localStorage.getItem(LS_KEYS.vigilance_phenomena) || 'null') || {}; } catch {}
  VIGILANCE_IDS.forEach(function (id) {
    var toggle = document.getElementById('toggle-vig-' + id);
    toggle.checked = storedPhenomena[id] !== false;
    toggle.addEventListener('change', function () {
      var vigPrefs = {};
      VIGILANCE_IDS.forEach(function (id2) { vigPrefs[id2] = document.getElementById('toggle-vig-' + id2).checked; });
      localStorage.setItem(LS_KEYS.vigilance_phenomena, JSON.stringify(vigPrefs));
    });
  });

  // Forces a key-gated toggle off, independent of whatever category it's nested under.
  function lockKeyGated(toggleEl, warningEl) {
    toggleEl.checked = false;
    toggleEl.disabled = true;
    warningEl.style.display = '';
  }

  function applyVigilanceMasterState() {
    vigilanceList.classList.toggle('grid-disabled', !toggleVigMaster.checked);
  }
  toggleVigMaster.addEventListener('change', applyVigilanceMasterState);

  function applySourceToggleState() {
    document.getElementById('grid-refl').classList.toggle('grid-disabled', !toggleRefl.checked);
    document.getElementById('grid-accr').classList.toggle('grid-disabled', !toggleAccr.checked);
  }
  [toggleRefl, toggleAccr, toggleRate, toggleCape, toggleShear, togglePiaf].forEach(function (el) {
    el.addEventListener('change', applySourceToggleState);
  });

  function renderGrid() {
    var grid = document.getElementById('region-grid');
    grid.innerHTML = '';
    REGIONS.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'region-card' + (selected && selected.id === r.id ? ' selected' : '');
      card.innerHTML =
        '<div class="region-name">' + r.name + '</div>' +
        '<div class="region-sub">' + r.sublabel + '</div>';
      card.addEventListener('click', function () {
        selected = r;
        localStorage.setItem(LS_KEYS.region, JSON.stringify(r));
        btn.disabled = false;
        renderGrid();
      });
      grid.appendChild(card);
    });
  }
  btn.disabled = !selected;
  renderGrid();

  function renderReflSources() {
    document.getElementById('src-refl-rv').className   = 'region-card' + (reflPref === 'rv'   ? ' selected' : '');
    document.getElementById('src-refl-dbzh').className = 'region-card' + (reflPref === 'dbzh' ? ' selected' : '');
  }

  function renderAcrrSources() {
    document.getElementById('src-acrr-mf').className    = 'region-card' + (acrrPref === 'acrr_mf' ? ' selected' : '');
    document.getElementById('src-acrr-opera').className = 'region-card' + (acrrPref === 'acrr'    ? ' selected' : '');
  }

  document.getElementById('src-refl-rv').addEventListener('click', function () {
    reflPref = 'rv'; renderReflSources();
  });
  document.getElementById('src-refl-dbzh').addEventListener('click', function () {
    reflPref = 'dbzh'; renderReflSources();
  });
  document.getElementById('src-acrr-mf').addEventListener('click', function () {
    if (this.classList.contains('card-disabled')) return;
    acrrPref = 'acrr_mf'; renderAcrrSources();
  });
  document.getElementById('src-acrr-opera').addEventListener('click', function () {
    acrrPref = 'acrr'; renderAcrrSources();
  });

  // Theme swatches — applied live to the settings page itself so the pick previews instantly.
  function renderThemeCards() {
    THEME_IDS.forEach(function (id) {
      document.querySelector('.theme-card[data-theme-id="' + id + '"]')
        .classList.toggle('selected', themePref === id);
    });
  }
  document.getElementById('theme-grid').addEventListener('click', function (e) {
    var card = e.target.closest('.theme-card');
    if (!card) return;
    themePref = card.dataset.themeId;
    document.documentElement.dataset.theme = themePref;
    localStorage.setItem(LS_KEYS.theme, themePref);
    renderThemeCards();
    applyFavicon(logoPref, getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim());
  });
  renderThemeCards();

  // Logo cards don't need the backend to show their own mark, unlike the region/theme grids.
  STORM_LOGO_IDS.forEach(function (id) {
    var card = document.querySelector('.logo-card[data-logo-id="' + id + '"]');
    card.querySelector('.logo-preview').innerHTML = STORM_LOGOS[id].svg;
  });
  function renderLogoCards() {
    STORM_LOGO_IDS.forEach(function (id) {
      document.querySelector('.logo-card[data-logo-id="' + id + '"]').classList.toggle('selected', logoPref === id);
    });
    applyLogo(logoPref);
    applyFavicon(logoPref, getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim());
  }
  document.getElementById('logo-grid').addEventListener('click', function (e) {
    var card = e.target.closest('.logo-card');
    if (!card) return;
    logoPref = card.dataset.logoId;
    localStorage.setItem(LS_KEYS.logo, logoPref);
    renderLogoCards();
  });
  renderLogoCards();

  // Tools (Accès rapide) management — add/edit/delete/reset, plus a master on/off switch.
  var toggleToolsMaster = document.getElementById('toggle-tools-master');
  var toolsManageGrid = document.getElementById('tools-manage-grid');
  var toolModal = document.getElementById('tool-modal');
  var toolModalTitle = document.getElementById('tool-modal-title');
  var toolFieldName = document.getElementById('tool-field-name');
  var toolFieldDesc = document.getElementById('tool-field-desc');
  var toolFieldUrl = document.getElementById('tool-field-url');
  var toolFieldError = document.getElementById('tool-field-error');
  toggleToolsMaster.checked = localStorage.getItem(LS_KEYS.tools_enabled) !== 'false';

  function persistTools() {
    localStorage.setItem(LS_KEYS.tools, JSON.stringify(toolsPref));
    localStorage.setItem(LS_KEYS.tools_enabled, toggleToolsMaster.checked ? 'true' : 'false');
  }

  function applyToolsMasterState() {
    toolsManageGrid.classList.toggle('grid-disabled', !toggleToolsMaster.checked);
  }
  toggleToolsMaster.addEventListener('change', function () { applyToolsMasterState(); persistTools(); });

  function openToolModal(index) {
    toolEditIndex = index;
    toolFieldError.hidden = true;
    var t = index == null ? { name: '', desc: '', url: '' } : toolsPref[index];
    toolModalTitle.textContent = index == null ? 'Ajouter un outil' : 'Modifier un outil';
    toolFieldName.value = t.name;
    toolFieldDesc.value = t.desc;
    toolFieldUrl.value = t.url;
    toolModal.hidden = false;
    toolFieldName.focus();
  }
  function closeToolModal() { toolModal.hidden = true; }

  function renderToolsManageGrid() {
    toolsManageGrid.innerHTML = '';
    toolsPref.forEach(function (t, i) {
      var card = document.createElement('div');
      card.className = 'tool-manage-card';

      var head = document.createElement('div');
      head.className = 'tool-manage-head';
      var name = document.createElement('div');
      name.className = 'region-name';
      name.textContent = t.name;

      var actions = document.createElement('div');
      actions.className = 'tool-manage-actions-inline';
      var editBtn = document.createElement('button');
      editBtn.type = 'button'; editBtn.className = 'tool-icon-btn'; editBtn.title = 'Modifier'; editBtn.textContent = '✎';
      editBtn.addEventListener('click', function () { openToolModal(i); });
      var delBtn = document.createElement('button');
      delBtn.type = 'button'; delBtn.className = 'tool-icon-btn is-danger'; delBtn.title = 'Supprimer'; delBtn.textContent = '✕';
      delBtn.addEventListener('click', function () { toolsPref.splice(i, 1); persistTools(); renderToolsManageGrid(); });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      head.appendChild(name);
      head.appendChild(actions);

      var desc = document.createElement('div');
      desc.className = 'region-sub';
      desc.textContent = t.desc;

      var url = document.createElement('div');
      url.className = 'tool-manage-url';
      url.textContent = t.url;

      card.appendChild(head);
      card.appendChild(desc);
      card.appendChild(url);
      toolsManageGrid.appendChild(card);
    });
  }

  document.getElementById('tool-add-btn').addEventListener('click', function () { openToolModal(null); });
  document.getElementById('tool-modal-close').addEventListener('click', closeToolModal);
  document.querySelector('.tool-modal-backdrop').addEventListener('click', closeToolModal);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !toolModal.hidden) closeToolModal();
  });

  document.getElementById('tool-field-save').addEventListener('click', function () {
    var name = toolFieldName.value.trim();
    var desc = toolFieldDesc.value.trim();
    var url = toolFieldUrl.value.trim();
    if (!name || !url) {
      toolFieldError.textContent = 'Nom et URL sont obligatoires.';
      toolFieldError.hidden = false;
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toolFieldError.textContent = "L'URL doit commencer par http:// ou https://";
      toolFieldError.hidden = false;
      return;
    }
    var entry = { name: name, desc: desc, url: url };
    if (toolEditIndex == null) toolsPref.push(entry);
    else toolsPref[toolEditIndex] = entry;
    persistTools();
    closeToolModal();
    renderToolsManageGrid();
  });

  document.getElementById('tools-reset-btn').addEventListener('click', function () {
    if (!confirm('Réinitialiser la liste aux outils par défaut ? Tes modifications seront perdues.')) return;
    toolsPref = DEFAULT_TOOLS.slice();
    persistTools();
    renderToolsManageGrid();
  });

  applyToolsMasterState();
  renderToolsManageGrid();

  // Emoji picker modal — one instance shared by every phenomenon's emoji button.
  var emojiModal = document.getElementById('emoji-modal');
  var emojiPicker = document.getElementById('emoji-picker');
  var pendingEmojiPid = null;

  function openEmojiModal(pid) {
    pendingEmojiPid = pid;
    emojiModal.hidden = false;
  }
  function closeEmojiModal() {
    emojiModal.hidden = true;
    pendingEmojiPid = null;
  }

  function persistVigEmojis() {
    localStorage.setItem(LS_KEYS.vigilance_emojis, JSON.stringify(vigEmojis));
  }

  VIGILANCE_IDS.forEach(function (id) {
    document.getElementById('emoji-btn-' + id).textContent = vigEmojis[id];
    document.getElementById('emoji-btn-' + id).addEventListener('click', function () { openEmojiModal(id); });
  });
  document.getElementById('emoji-modal-close').addEventListener('click', closeEmojiModal);
  document.getElementById('emoji-modal-reset').addEventListener('click', function () {
    if (!pendingEmojiPid) return;
    vigEmojis[pendingEmojiPid] = DEFAULT_VIGILANCE_EMOJIS[pendingEmojiPid];
    document.getElementById('emoji-btn-' + pendingEmojiPid).textContent = vigEmojis[pendingEmojiPid];
    persistVigEmojis();
    closeEmojiModal();
  });
  document.querySelector('.emoji-modal-backdrop').addEventListener('click', closeEmojiModal);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !emojiModal.hidden) closeEmojiModal();
  });
  emojiPicker.addEventListener('emoji-click', function (e) {
    if (!pendingEmojiPid) return;
    vigEmojis[pendingEmojiPid] = e.detail.unicode;
    document.getElementById('emoji-btn-' + pendingEmojiPid).textContent = e.detail.unicode;
    persistVigEmojis();
    closeEmojiModal();
  });

  // Tabs
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.settings-tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.settings-panel'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      panels.forEach(function (p) { p.hidden = p.dataset.panel !== tab.dataset.tab; });
    });
  });

  // Only the 9 fields settings_store.py actually persists — everything else was applied at load already.
  function applyState(s) {
    reflPref = s.refl_source;
    acrrPref = s.accr_source;
    toggleVigMaster.checked = s.vigilance_enabled;
    toggleRefl.checked = s.refl;
    toggleAccr.checked = s.accr;
    toggleRate.checked = s.rate;
    toggleCape.checked = s.cape;
    toggleShear.checked = s.shear;
    togglePiaf.checked = s.piaf;
    applyVigilanceMasterState();
    applySourceToggleState();
    renderReflSources();
    renderAcrrSources();
  }

  fetch('/api/settings')
    .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
    .then(function (s) {
      applyState(s);

      // MF availability detection — may override the accr source pick and grey out key-gated toggles.
      fetch('/api/sources')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var badge = document.getElementById('mf-badge');
          var mfCard = document.getElementById('src-acrr-mf');

          if (data.mf_radar) {
            badge.textContent = 'par défaut';
          } else {
            badge.textContent = 'clé manquante';
            mfCard.classList.add('card-disabled');
            if (acrrPref === 'acrr_mf') { acrrPref = 'acrr'; }
          }
          renderAcrrSources();

          if (!data.mf_vigilance) {
            lockKeyGated(toggleVigMaster, vigilanceKeyMissing);
            applyVigilanceMasterState();
          }

          if (!data.mf_piaf) {
            lockKeyGated(togglePiaf, document.getElementById('piaf-key-missing'));
          }

          if (!data.mf_cape) {
            lockKeyGated(toggleCape, document.getElementById('cape-key-missing'));
            lockKeyGated(toggleShear, document.getElementById('shear-key-missing'));
          }
        })
        .catch(function () {
          document.getElementById('mf-badge').textContent = '?';
          renderAcrrSources();
        });
    })
    .catch(function () {
      backendError.style.display = '';
      btn.disabled = true;
    });

  btn.addEventListener('click', function () {
    if (!selected) return;

    var settings = {
      refl: toggleRefl.checked,
      refl_source: reflPref,
      accr: toggleAccr.checked,
      accr_source: acrrPref,
      rate: toggleRate.checked,
      cape: toggleCape.checked,
      shear: toggleShear.checked,
      piaf: togglePiaf.checked,
      vigilance_enabled: toggleVigMaster.checked,
    };

    // Cache locally so the dashboard can read these synchronously without waiting on a fetch.
    localStorage.setItem(LS_KEYS.refl_source, settings.refl_source);
    localStorage.setItem(LS_KEYS.accr_source, settings.accr_source);
    localStorage.setItem(LS_KEYS.vigilance_enabled, settings.vigilance_enabled ? 'true' : 'false');

    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('bad status');
        location.replace('dashboard.html');
      })
      .catch(function () { backendError.style.display = ''; });
  });
}());
