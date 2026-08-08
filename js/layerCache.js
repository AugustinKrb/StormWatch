// LRU-ish cache for Leaflet layers keyed by string — evicts oldest first, never evicts
// the currently-displayed layer. Shared by the RainViewer and OPERA/MF/PIAF tile sources.

export function touchCache(map, cache, order, max, key, currentLayer) {
  var idx = order.indexOf(key);
  if (idx !== -1) order.splice(idx, 1);
  order.push(key);
  while (order.length > max) {
    var evict = order[0];
    if (cache[evict] === currentLayer) break; // never evict the frame on screen
    order.shift();
    map.removeLayer(cache[evict]);
    delete cache[evict];
  }
}

// Removes cached layers whose key isn't in `validKeys` (object used as a set).
export function pruneCache(map, cache, order, validKeys) {
  Object.keys(cache).forEach(function (key) {
    if (!validKeys[key]) {
      map.removeLayer(cache[key]);
      delete cache[key];
      var idx = order.indexOf(key);
      if (idx !== -1) order.splice(idx, 1);
    }
  });
}
