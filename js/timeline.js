// Radar timeline widget: ruler rendering, drag/keyboard seek, thumb + label placement.
// Radar-source-specific facts (which frames exist, which one is "live", the past grid step)
// are supplied via callbacks — this module only knows about the bar geometry and DOM.

// First index whose getTimeMs(i) is >= targetMs, or the last index if none qualify.
export function ceilIndex(count, getTimeMs, targetMs) {
  for (var i = 0; i < count; i++) {
    var t = getTimeMs(i);
    if (t != null && t >= targetMs) return i;
  }
  return Math.max(0, count - 1);
}

// callbacks: getFrameTimes(), getLiveDataMs(), getPastStepMin(), getLabelStepMin(), getCurrentIndex(), seekToIndex(i)
export function initTimeline(callbacks) {
  var getFrameTimes = callbacks.getFrameTimes;
  var getLiveDataMs = callbacks.getLiveDataMs;
  var getPastStepMin = callbacks.getPastStepMin;
  var getLabelStepMin = callbacks.getLabelStepMin || getPastStepMin;
  var getCurrentIndex = callbacks.getCurrentIndex;
  var seekToIndex = callbacks.seekToIndex;

  // Index (0..count-1) whose getTimeMs(i) is closest to targetMs.
  function closestIndex(count, getTimeMs, targetMs) {
    var best = 0, bestDiff = Infinity;
    for (var i = 0; i < count; i++) {
      var t = getTimeMs(i);
      if (t == null) continue;
      var diff = Math.abs(t - targetMs);
      if (diff < bestDiff) { best = i; bestDiff = diff; }
    }
    return best;
  }

  // "Live" always sits at LIVE_PCT of the bar width. The bar is pivoted on the source's own
  // getLiveDataMs() (its actual latest fetched frame), not wall-clock time — sources that publish
  // with a delay (e.g. CAPE, ~20 min) still anchor cleanly at LIVE_PCT instead of drifting left.
  var LIVE_PCT = 70;
  var FUTURE_STEP_MIN = 60;
  var pastWindowH = parseFloat(localStorage.getItem('sw_timeline_past_h')) || 2;
  var futureWindowH = parseFloat(localStorage.getItem('sw_timeline_future_h')) || 6;

  // ms → bar %, linear in real elapsed time within [0,LIVE_PCT] (past) / [LIVE_PCT,100] (future).
  function _posForTime(ms, nowMs) {
    var diffMin = (ms - nowMs) / 60000;
    if (diffMin <= 0) return Math.max(0, LIVE_PCT * (1 + diffMin / (pastWindowH * 60)));
    return Math.min(100, LIVE_PCT + (diffMin / (futureWindowH * 60)) * (100 - LIVE_PCT));
  }

  // Inverse of _posForTime, used to resolve a drag/click position back to a timestamp.
  function _timeForPos(pct, nowMs) {
    if (pct <= LIVE_PCT) {
      var frac = LIVE_PCT > 0 ? pct / LIVE_PCT : 1;
      return nowMs - (1 - frac) * pastWindowH * 3600000;
    }
    var frac2 = (pct - LIVE_PCT) / (100 - LIVE_PCT);
    return nowMs + frac2 * futureWindowH * 3600000;
  }

  // Epoch-ms grid alignment — no timezone handling needed, frame timestamps are UTC.
  function _floorToStep(ms, stepMin) {
    var stepMs = stepMin * 60000;
    return Math.floor(ms / stepMs) * stepMs;
  }

  var track = document.getElementById('timeline-track');
  var thumb = document.getElementById('timeline-thumb');
  var emptyPast = document.getElementById('timeline-empty-past');
  var emptyFuture = document.getElementById('timeline-empty-future');

  // The bar's pivot: the source's real latest frame, falling back to wall-clock if unknown.
  function _pivotMs() {
    var liveDataMs = getLiveDataMs();
    return liveDataMs != null ? liveDataMs : Date.now();
  }

  function setThumb(ms, index, total) {
    var pct = ms != null ? _posForTime(ms, _pivotMs()) : LIVE_PCT;
    thumb.style.left = pct + '%';
    thumb.setAttribute('aria-valuenow', String(index));
    thumb.setAttribute('aria-valuemax', String(Math.max(0, total - 1)));
  }

  function timeLabel(ms) {
    return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  }

  // Draws the fixed H-x/H+x ruler + real-data sub-ticks + empty zones, pivoted on the source's live data.
  function render() {
    var container = document.getElementById('timeline-ticks');
    container.innerHTML = '';

    var liveDataMs = getLiveDataMs();
    var pivotMs = liveDataMs != null ? liveDataMs : Date.now();
    var pastStartMs = pivotMs - pastWindowH * 3600000;
    var futureEndMs = pivotMs + futureWindowH * 3600000;
    var liveDataPct = LIVE_PCT; // the pivot itself, by construction
    var pastStepMin = getPastStepMin();
    var labelStepMin = getLabelStepMin();
    var GAP_TOLERANCE = 1.5; // a data point within one normal step of an edge counts as "no gap"

    var dataTimes = getFrameTimes() || [];
    track.classList.toggle('is-disabled', dataTimes.length === 0);

    var liveSplitMs = pivotMs;
    var pastDataTimes = dataTimes.filter(function (t) { return t >= pastStartMs && t <= liveSplitMs; });
    var futureDataTimes = dataTimes.filter(function (t) { return t > liveSplitMs && t <= futureEndMs; });

    // Greys from the window edge to where real data starts/ends, unless that gap is within one
    // normal step (e.g. CAPE's hourly cadence always leaves <1h before the first archived point).
    var pastDataStartMs = pastDataTimes.length ? Math.min.apply(null, pastDataTimes) : liveSplitMs;
    var pastGreyPct = _posForTime(pastDataStartMs, pivotMs);
    var pastGapMs = pastDataStartMs - pastStartMs;
    emptyPast.style.display = pastGapMs > pastStepMin * 60000 * GAP_TOLERANCE ? '' : 'none';
    emptyPast.style.left = '0%';
    emptyPast.style.width = pastGreyPct + '%';

    var futureDataEndMs = futureDataTimes.length ? Math.max.apply(null, futureDataTimes) : liveSplitMs;
    var futureGreyPct = _posForTime(futureDataEndMs, pivotMs);
    var futureGapMs = futureEndMs - futureDataEndMs;
    emptyFuture.style.display = futureGapMs > FUTURE_STEP_MIN * 60000 * GAP_TOLERANCE ? '' : 'none';
    emptyFuture.style.left = futureGreyPct + '%';
    emptyFuture.style.width = (100 - futureGreyPct) + '%';

    function drawTick(ms, cls) {
      var el = document.createElement('div');
      el.className = cls;
      el.style.left = _posForTime(ms, pivotMs) + '%';
      container.appendChild(el);
      return el;
    }
    function drawLabel(ms, pct, cls, edge) {
      var el = document.createElement('div');
      el.className = cls;
      el.textContent = timeLabel(ms);
      if (edge === 'left')       { el.style.left = '0'; }
      else if (edge === 'right') { el.style.right = '0'; el.style.left = 'auto'; }
      else                       { el.style.left = pct + '%'; el.style.transform = 'translateX(-50%)'; }
      container.appendChild(el);
      return el;
    }

    drawTick(pastStartMs, 't-tick t-grid');
    var leftLabelEl = drawLabel(pastStartMs, 0, 't-label', 'left');
    drawTick(futureEndMs, 't-tick t-grid');
    var rightLabelEl = drawLabel(futureEndMs, 100, 't-label', 'right');

    var pastMarks = [];
    for (var pm = _floorToStep(pastStartMs, pastStepMin) + pastStepMin * 60000; pm < pivotMs; pm += pastStepMin * 60000) {
      pastMarks.push(pm);
    }
    var futureMarks = [];
    for (var fm = _floorToStep(pivotMs, FUTURE_STEP_MIN) + FUTURE_STEP_MIN * 60000; fm < futureEndMs; fm += FUTURE_STEP_MIN * 60000) {
      futureMarks.push(fm);
    }

    var gridLabels = [];
    function drawGridMark(ms) {
      var pct = _posForTime(ms, pivotMs);
      var isMajor = Math.round(ms / 60000) % labelStepMin === 0;
      drawTick(ms, isMajor ? 't-tick t-grid' : 't-tick t-grid t-minor');
      if (isMajor) gridLabels.push(drawLabel(ms, pct, 't-label'));
    }
    pastMarks.forEach(drawGridMark);
    var liveLabelEl = null;
    if (liveDataMs != null) {
      drawTick(liveDataMs, 't-tick t-now');
      liveLabelEl = drawLabel(liveDataMs, liveDataPct, 't-label t-now-label');
    }
    futureMarks.forEach(drawGridMark);

    // Subtle marker for real wall-clock time when it outpaces the live frame by more than 5 min.
    var realNowMs = Date.now();
    var lagMin = (realNowMs - pivotMs) / 60000;
    if (lagMin > 5) {
      var realNowPct = _posForTime(realNowMs, pivotMs);
      if (realNowPct <= 100) {
        var realNowEl = drawTick(realNowMs, 't-tick t-realnow');
        realNowEl.title = 'Heure réelle ' + timeLabel(realNowMs) + ' — données à J-' + Math.round(lagMin) + ' min';
      }
    }

    var MIN_GAP_PX = 5;
    function _tooClose(a, b) {
      return Math.min(a.right, b.right) - Math.max(a.left, b.left) > -MIN_GAP_PX;
    }
    var keyRects = [leftLabelEl, rightLabelEl].concat(liveLabelEl ? [liveLabelEl] : [])
      .map(function (el) { return el.getBoundingClientRect(); });
    gridLabels = gridLabels.filter(function (label) {
      var r = label.getBoundingClientRect();
      var tooClose = keyRects.some(function (kr) { return _tooClose(r, kr); });
      if (tooClose) container.removeChild(label);
      return !tooClose;
    });
    var lastKeptRect = null;
    gridLabels.forEach(function (label) {
      var r = label.getBoundingClientRect();
      if (lastKeptRect && _tooClose(r, lastKeptRect)) { container.removeChild(label); return; }
      lastKeptRect = r;
    });

    // Real data points finer than the fixed grid — smaller/dimmer sub-ticks, no label.
    var TOL_MS = 30000;
    function isNearGrid(ms) {
      if (liveDataMs != null && Math.abs(ms - liveDataMs) <= TOL_MS) return true;
      if (Math.abs(ms - pastStartMs) <= TOL_MS || Math.abs(ms - futureEndMs) <= TOL_MS) return true;
      var stepMs = (ms <= pivotMs ? pastStepMin : FUTURE_STEP_MIN) * 60000;
      return Math.abs(ms - Math.round(ms / stepMs) * stepMs) <= TOL_MS;
    }
    dataTimes.forEach(function (t) {
      if (t < pastStartMs || t > futureEndMs || isNearGrid(t)) return;
      drawTick(t, 't-tick t-sub');
    });

    // Grey out interior gaps too, not just the window edges.
    var sortedData = dataTimes.slice().sort(function (a, b) { return a - b; });
    for (var gi = 1; gi < sortedData.length; gi++) {
      var prevT = sortedData[gi - 1], curT = sortedData[gi];
      if (curT < pastStartMs || prevT > futureEndMs) continue;
      var gapStepMs = (curT <= pivotMs ? pastStepMin : FUTURE_STEP_MIN) * 60000;
      if (curT - prevT <= gapStepMs * GAP_TOLERANCE) continue;
      var gapStartPct = _posForTime(Math.max(prevT, pastStartMs), pivotMs);
      var gapEndPct = _posForTime(Math.min(curT, futureEndMs), pivotMs);
      var gapEl = document.createElement('div');
      gapEl.className = 'timeline-empty';
      gapEl.style.left = gapStartPct + '%';
      gapEl.style.width = (gapEndPct - gapStartPct) + '%';
      track.appendChild(gapEl);
    }
  }

  function _pctFromClientX(clientX) {
    var rect = track.getBoundingClientRect();
    if (!rect.width) return LIVE_PCT;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }

  var dragging = false;

  function _handleDrag(evt) {
    if (!dragging) return;
    var times = getFrameTimes();
    if (!times.length) return;
    var pct = _pctFromClientX(evt.clientX);
    var targetMs = _timeForPos(pct, _pivotMs());
    seekToIndex(closestIndex(times.length, function (i) { return times[i]; }, targetMs));
  }

  track.addEventListener('pointerdown', function (evt) {
    dragging = true;
    _handleDrag(evt);
    evt.preventDefault();
  });
  window.addEventListener('pointermove', _handleDrag);
  window.addEventListener('pointerup', function () { dragging = false; });

  thumb.addEventListener('keydown', function (evt) {
    var times = getFrameTimes();
    if (!times.length) return;
    if (evt.key === 'ArrowLeft')  { seekToIndex(Math.max(0, getCurrentIndex() - 1)); evt.preventDefault(); }
    if (evt.key === 'ArrowRight') { seekToIndex(Math.min(times.length - 1, getCurrentIndex() + 1)); evt.preventDefault(); }
  });

  return { render: render, setThumb: setThumb, timeLabel: timeLabel };
}
