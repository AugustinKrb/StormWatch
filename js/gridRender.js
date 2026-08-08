// Shared canvas renderer for AROME-PI grid layers (CAPE/STP/EHI/hail) — bilinear-interpolates
// an (nx × ny) value grid onto an upsampled canvas, Mercator-correct on Y so Leaflet's linear
// imageOverlay stretch lands each row at its true latitude instead of drifting north.

function _colorFor(stops, v) {
  if (v <= stops[0].v) return stops[0].c;
  for (var i = 1; i < stops.length; i++) {
    if (v <= stops[i].v) {
      var a = stops[i - 1], b = stops[i];
      var t = (v - a.v) / (b.v - a.v);
      return [
        a.c[0] + (b.c[0] - a.c[0]) * t,
        a.c[1] + (b.c[1] - a.c[1]) * t,
        a.c[2] + (b.c[2] - a.c[2]) * t,
        a.c[3] + (b.c[3] - a.c[3]) * t,
      ];
    }
  }
  return stops[stops.length - 1].c;
}

function _mercY(latDeg) {
  var phi = latDeg * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + phi / 2));
}

function _invMercY(y) {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
}

export function renderGridCanvas(stops, nx, ny, rawValues, la1, la2) {
  var values = rawValues.map(function (row) {
    return row.map(function (v) { return v == null ? 0 : v; });
  });
  var SCALE = 10;
  var w = (nx - 1) * SCALE + 1, h = (ny - 1) * SCALE + 1;
  var yNorth = _mercY(la1), ySouth = _mercY(la2);

  var canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  var ctx = canvas.getContext('2d');
  var img = ctx.createImageData(w, h);

  for (var py = 0; py < h; py++) {
    var yMerc = yNorth - (py / (h - 1)) * (yNorth - ySouth);
    var trueLat = _invMercY(yMerc);
    var fy = (la1 - trueLat) / (la1 - la2) * (ny - 1);
    var y0 = Math.min(Math.floor(fy), ny - 2 >= 0 ? ny - 2 : 0);
    var ty = fy - y0;
    var y1 = Math.min(y0 + 1, ny - 1);

    for (var px = 0; px < w; px++) {
      var fx = px / SCALE;
      var x0 = Math.min(Math.floor(fx), nx - 2 >= 0 ? nx - 2 : 0);
      var tx = fx - x0;
      var x1 = Math.min(x0 + 1, nx - 1);

      var v00 = values[y0][x0], v10 = values[y0][x1];
      var v01 = values[y1][x0], v11 = values[y1][x1];
      var vTop = v00 + (v10 - v00) * tx;
      var vBot = v01 + (v11 - v01) * tx;
      var v = vTop + (vBot - vTop) * ty;

      var rgba = _colorFor(stops, v);
      var idx = (py * w + px) * 4;
      img.data[idx] = rgba[0];
      img.data[idx + 1] = rgba[1];
      img.data[idx + 2] = rgba[2];
      img.data[idx + 3] = rgba[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
