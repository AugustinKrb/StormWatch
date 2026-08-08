// Documentation modal: what each layer is, what it's for, and its unit/data source — pure UI, no state to sync elsewhere.
export function initDocs() {
  var modal = document.getElementById('doc-modal');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.doc-tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.doc-panel'));

  function open() { modal.hidden = false; }
  function close() { modal.hidden = true; }

  function selectTab(id) {
    tabs.forEach(function (t) {
      var active = t.dataset.doc === id;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach(function (p) { p.classList.toggle('is-active', p.dataset.doc === id); });
  }

  document.getElementById('doc-btn').addEventListener('click', open);
  document.getElementById('doc-modal-close').addEventListener('click', close);
  document.querySelector('.doc-modal-backdrop').addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) close();
  });
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { selectTab(t.dataset.doc); });
  });
}
