// Shared push channel: the backend tells us when fresh data exists for a given type
// ("wind", "vigilance", "refl", ...) — modules subscribe instead of guessing a poll
// interval that has to be kept in sync with the backend's own cron cadence by hand.
var _listeners = {}; // type -> [callback, ...]
var _source = null;

function _dispatch(type) {
  (_listeners[type] || []).forEach(function (cb) { cb(); });
}

function _connect() {
  _source = new EventSource('/api/events/stream');
  _source.onmessage = function (ev) {
    try {
      var d = JSON.parse(ev.data);
      if (d.type) _dispatch(d.type);
    } catch {}
  };
  _source.onerror = function () {
    _source.close();
    setTimeout(_connect, 5000);
  };
}
_connect();

// Returns an unsubscribe function.
export function onEvent(type, callback) {
  (_listeners[type] = _listeners[type] || []).push(callback);
  return function () {
    _listeners[type] = _listeners[type].filter(function (cb) { return cb !== callback; });
  };
}
