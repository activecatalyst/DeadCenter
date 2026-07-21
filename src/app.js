/* Dead Center — app logic.
   Pure view layer over window.SEATS (see seats.js). No dependencies.
   The DATA is the asset; this file is disposable. */
(function () {
  'use strict';
  var STALE_MONTHS = 18;
  var VC = {'SWEET SPOT':'var(--sweet)','good':'var(--good)','too close':'var(--close)','too far':'var(--far)'};
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };

  // --- install prompt: register before anything else so we never miss the event ---
  var deferredPrompt = null, installBtn = document.getElementById('install');
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferredPrompt = e; if (installBtn) installBtn.hidden = false;
  });
  window.addEventListener('appinstalled', function () {
    if (installBtn) installBtn.hidden = true; deferredPrompt = null;
  });
  if (installBtn) installBtn.addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () { deferredPrompt = null; installBtn.hidden = true; });
  });

  if (!window.SEATS) { $('#list').innerHTML = '<div class="empty">seats.js failed to load.</div>'; return; }
  var DATA = window.SEATS, fFmt = null, originLabel = 'San Diego';

  // dynamic counts so copy never drifts from the data
  var THEATRE_COUNT = Object.keys(DATA.rooms.reduce(function (a, r) { a[r.theater] = 1; return a; }, {})).length;
  $('#q').placeholder = 'Or search all ' + DATA.rooms.length + ' rooms…';

  function monthsOld(d) {
    var t = new Date(d + 'T00:00:00'), n = new Date();
    return (n.getFullYear() - t.getFullYear()) * 12 + (n.getMonth() - t.getMonth());
  }

  var FORMATS = Object.keys(DATA.rooms.reduce(function (a, r) { a[r.format] = 1; return a; }, {})).sort();
  $('#chips').innerHTML = ['All'].concat(FORMATS).map(function (f) {
    return '<button class="chip" type="button" data-f="' + esc(f) + '" aria-pressed="' + (f === 'All') + '">' + esc(f) + '</button>';
  }).join('');

  $('#chips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    fFmt = b.dataset.f === 'All' ? null : b.dataset.f;
    Array.prototype.forEach.call($('#chips').children, function (c) {
      c.setAttribute('aria-pressed', String(c === b)); });
    render();
  });
  $('#q').addEventListener('input', render);

  function diagram(room) {
    var maxN = Math.max.apply(null, room.rows.map(function (r) { return r.n; })), W = 168;
    return '<div class="diagram"><div class="screen"></div><div class="screenlbl">SCREEN</div>' +
      room.rows.map(function (r) {
        var w = Math.max(10, Math.round(r.n / maxN * W)), best = r.r === room.bestRow;
        return '<div class="rowline' + (best ? ' best' : '') + '"><span class="rlbl">' + esc(r.r) +
          '</span><span class="bar" style="width:' + w + 'px;background:' + VC[r.v] + '"></span>' +
          '<span class="rpct">' + (best ? '<b>' + esc(room.seat) + '</b>' : r.d + '%') + '</span></div>';
      }).join('') + '</div>';
  }

  function card(room) {
    var old = monthsOld(room.date) >= STALE_MONTHS;
    var rows = room.rows.map(function (r) {
      return '<tr class="' + (r.r === room.bestRow ? 'best' : '') + '"><td>' + esc(r.r) + '</td><td>' +
        r.d + '%</td><td><span class="v" style="background:' + VC[r.v] + '">' + esc(r.v) +
        '</span></td><td>' + r.c + '</td><td>' + r.n + '</td></tr>';
    }).join('');
    return '<details class="card" id="' + esc(room.id) + '">' +
      '<summary><span class="seat' + (room.inband ? '' : ' off') + '">' + esc(room.seat) + '</span>' +
      '<span class="meta"><b>' + esc(room.format) + '</b><span>' + esc(room.short) + '</span></span>' +
      '<span class="tag">' + room.total + ' seats<br>' + room.lo + '–' + room.hi + '%' +
      (room.rep ? '<span class="dot" title="representative sample"></span>' : '') +
      (old ? '<span class="stale">VERIFY</span>' : '') + '</span></summary>' +
      '<div class="body">' +
      (old ? '<p class="warn"><b>Captured ' + esc(room.date) + '.</b> Over ' + STALE_MONTHS +
             ' months old — AMC recliner conversions change seat counts wholesale, so re-check this ' +
             'room against a live seat map before trusting it.</p>' : '') +
      '<p class="why">' + esc(room.why) + '</p>' +
      '<p class="k"><b>' + esc(room.fmtLabel) + '</b> · ' + esc(room.seatType) + ' · ' + room.total +
      ' seats across ' + room.rows.length + ' rows · captured ' + esc(room.date) + ' · ' +
      (room.rep ? '<b>representative sample</b> — standard screens float between auditoriums'
                : 'fixed dedicated auditorium') +
      (room.centerOk ? '' : ' · <b>screen sits off the seat-block center axis</b>') + '</p>' +
      '<div class="split">' + diagram(room) +
      '<table><thead><tr><th>Row</th><th>Depth</th><th>Zone</th><th>Center seat</th><th>Seats</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      '<ul class="quirks">' + room.quirks.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' +
      '<button class="share" type="button" data-id="' + esc(room.id) + '">Copy link to this room</button>' +
      '</div></details>';
  }

  function render() {
    var q = $('#q').value.trim().toLowerCase();
    var rs = DATA.rooms.filter(function (r) {
      return (!fFmt || r.format === fFmt) && (!q ||
        (r.theater + ' ' + r.region + ' ' + r.format + ' ' + r.seatType).toLowerCase().indexOf(q) > -1);
    });
    var nT = Object.keys(rs.reduce(function (a, r) { a[r.theater] = 1; return a; }, {})).length;
    $('#count').textContent = rs.length + ' auditorium' + (rs.length === 1 ? '' : 's') +
      (rs.length ? ' · ' + nT + ' theatre' + (nT === 1 ? '' : 's') : '');
    if (!rs.length) { $('#list').innerHTML = '<div class="empty">Nothing matches that.</div>'; return; }
    var html = '', theater = null;
    rs.forEach(function (r) {
      if (r.theater !== theater) {
        theater = r.theater;
        html += '<div class="thead"><b>' + esc(r.short) + '</b>' +
          '<span class="rg">' + esc(r.region) + '</span>' +
          '<span class="mi"><b>' + r.miles + '</b> mi from ' + esc(originLabel) + '</span></div>';
      }
      html += card(r);
    });
    $('#list').innerHTML = html;
    // NB: deliberately does NOT re-open the hashed card here — that only happens
    // on initial load and on hashchange, so typing in search never yanks a card open.
  }

  function openFromHash(scroll) {
    var id = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    el.open = true;
    if (scroll && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.share'); if (!b) return;
    var url = location.origin + location.pathname + '#' + b.dataset.id;
    var done = function () { b.textContent = 'Link copied'; setTimeout(function () {
      b.textContent = 'Copy link to this room'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done); else done();
  });

  document.addEventListener('toggle', function (e) {
    if (e.target.tagName === 'DETAILS' && e.target.open && e.target.id) {
      history.replaceState(null, '', '#' + e.target.id);
    }
  }, true);

  window.addEventListener('hashchange', function () { openFromHash(true); });

  /* ---------- picker ---------- */
  var MISSING = DATA.missing || [];

  // Rebuild the theatre dropdown from DATA.rooms' current order (nearest-first),
  // preserving any selection. Called again whenever the origin changes.
  function buildPicker() {
    var chosen = $('#pt').value, seen = [], mi = {};
    DATA.rooms.forEach(function (r) {
      if (seen.indexOf(r.theater) < 0) { seen.push(r.theater); mi[r.theater] = r.miles; }
    });
    $('#pt').innerHTML = '<option value="">Choose a theatre…</option>' + seen.map(function (t) {
      return '<option value="' + esc(t) + '"' + (t === chosen ? ' selected' : '') +
        '>' + esc(t) + '  ·  ' + mi[t] + ' mi</option>'; }).join('');
  }
  buildPicker();

  // ---- distance origin ----
  function haversine(a, b, c, e) {
    function rad(x) { return x * Math.PI / 180; }
    var dLat = rad(c - a), dLon = rad(e - b);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * 3958.8 * Math.asin(Math.sqrt(s)));
  }
  function applyOrigin(lat, lon, label) {
    DATA.rooms.forEach(function (r) { r.miles = haversine(lat, lon, r.lat, r.lon); });
    DATA.rooms.sort(function (x, y) { return x.miles - y.miles; });
    originLabel = label;
    buildPicker();
    render();
  }

  var locBtn = $('#loc'), locMsg = $('#locmsg');
  locBtn.addEventListener('click', function () {
    if (!navigator.geolocation || location.protocol.indexOf('http') !== 0) {
      locMsg.className = 'err';
      locMsg.textContent = 'Location needs the site opened over https — still sorted from San Diego.';
      return;
    }
    locBtn.disabled = true; locMsg.className = ''; locMsg.textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      applyOrigin(pos.coords.latitude, pos.coords.longitude, 'here');
      locBtn.disabled = false; locBtn.textContent = 'Update my location';
      locMsg.className = 'on';
      locMsg.textContent = 'Now sorted from your location. Coordinates stay on your device.';
    }, function (err) {
      locBtn.disabled = false; locMsg.className = 'err';
      // origin is unchanged, so restore the label to match whatever it still is
      locMsg.textContent = err.code === 1
        ? 'Location permission denied — still sorted from ' + originLabel + '.'
        : 'Couldn’t get a fix — still sorted from ' + originLabel + '.';
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  function formatsFor(t) {
    var have = DATA.rooms.filter(function (r) { return r.theater === t; })
      .map(function (r) { return { f: r.format, ok: true }; });
    var lack = MISSING.filter(function (m) { return m.theater === t; })
      .map(function (m) { return { f: m.format, ok: false }; });
    return have.concat(lack);
  }

  $('#pt').addEventListener('change', function () {
    var t = this.value, pf = $('#pf');
    $('#answer').innerHTML = '';
    if (!t) { pf.disabled = true; pf.innerHTML = '<option value="">—</option>'; return; }
    var fs = formatsFor(t);
    pf.disabled = false;
    pf.innerHTML = '<option value="">Choose a format…</option>' + fs.map(function (x) {
      return '<option value="' + esc(x.f) + '">' + esc(x.f) +
             (x.ok ? '' : '  — not captured') + '</option>'; }).join('');
    if (fs.length === 1) { pf.value = fs[0].f; showAnswer(); }
  });
  $('#pf').addEventListener('change', showAnswer);

  // Re-center the recommendation on the SCREEN axis rather than the seat-block
  // axis when a room's screen is measured off-center. Returns the adjusted seat
  // and a human note; a sub-seat offset rounds to no shift but is still disclosed.
  function screenAdjust(room) {
    var m = room.seat.match(/^([A-Z]+)(\d+)$/);
    var letter = m[1], base = parseInt(m[2], 10);
    var off = room.screenOffset || 0;
    if (!off) return { row: letter, seat: base, note: '' };
    var row = null, i;
    for (i = 0; i < room.rows.length; i++) if (room.rows[i].r === letter) row = room.rows[i];
    var shift = Math.round(off);                 // whole seats only
    var seat = base + shift;
    if (row) seat = Math.max(1, Math.min(row.n, seat));
    var dir = off < 0 ? 'toward seat 1' : 'toward the high-numbered end';
    var note = shift
      ? 'Screen sits off the seat-block center — shifted ' + Math.abs(shift) +
        ' seat' + (Math.abs(shift) === 1 ? '' : 's') + ' ' + dir + ' to sit dead-center to the screen.'
      : 'Screen sits about ' + Math.abs(off) + ' of a seat ' + dir +
        ' of the seat-block center — too small to change the seat, but worth knowing this room isn’t symmetric.';
    return { row: letter, seat: seat, note: note };
  }

  function seatMap(room, pickNum) {
    var rows = room.rows.map(function (r) {
      var pick = r.r === room.bestRow;
      var seats = '';
      for (var i = 1; i <= r.n; i++) {
        seats += '<span class="s' + (pick && i === pickNum ? ' pick' : '') + '"></span>';
      }
      return '<div class="maprow" data-v="' + esc(r.v) + '"><span class="lb">' + esc(r.r) +
        '</span><span class="seats">' + seats + '</span></div>';
    }).join('');
    return '<div class="map"><div class="mapinner">' +
      '<div class="screen"></div><div class="screenlbl">SCREEN</div>' + rows +
      '<div class="maplegend">Schematic — row lengths and the marked seat are measured, ' +
      'but aisle positions within a row are not drawn.</div></div></div>';
  }

  function showAnswer() {
    var t = $('#pt').value, f = $('#pf').value, out = $('#answer');
    if (!t || !f) { out.innerHTML = ''; return; }

    var room = DATA.rooms.filter(function (r) { return r.theater === t && r.format === f; })[0];
    if (!room) {
      var m = MISSING.filter(function (x) { return x.theater === t && x.format === f; })[0];
      out.innerHTML = '<div class="answer"><div class="notcaptured"><b>Not captured</b><p>' +
        esc(m ? m.note : 'No seat map was recorded for this combination.') +
        '</p></div></div>';
      return;
    }
    var adj = screenAdjust(room);
    var shown = adj.row + adj.seat;
    out.innerHTML = '<div class="answer">' +
      '<div class="bigseat"><span class="num' + (room.inband ? '' : ' off') + '">' + esc(shown) + '</span>' +
      '<span class="sub"><b>' + esc(room.short) + ' · ' + esc(room.format) + '</b>' +
      'Row ' + esc(room.bestRow) + ' · ' + room.lo + '–' + room.hi + '% back · ' +
      esc(room.seatType) + '<br>' + room.total + ' seats across ' + room.rows.length + ' rows · captured ' +
      esc(room.date) + (room.rep ? ' · <b class="inline">representative sample</b>' : '') +
      '</span></div>' +
      (adj.note ? '<p class="warn mt0">' + esc(adj.note) + '</p>' : '') +
      seatMap(room, adj.seat) +
      '<p class="why mt">' + esc(room.why) + '</p>' +
      '<ul class="quirks">' + room.quirks.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') +
      '</ul></div>';
  }

  $('#gaps').innerHTML = DATA.gaps.map(function (g) {
    return '<dt>' + esc(g.theater) + ' — ' + esc(g.format) + '</dt><dd>' + esc(g.note) + '</dd>';
  }).join('');

  render();
  openFromHash(true);

  /* ---------- iOS install hint ---------- */
  // iOS Safari never fires beforeinstallprompt, so the install button never
  // shows there. Point iOS users at the manual Share -> Add to Home Screen path.
  (function () {
    var ua = navigator.userAgent || '';
    var iOS = /iP(hone|ad|od)/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS masquerades as Mac
    var standalone = window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    var tip = document.getElementById('iostip');
    if (tip && iOS && !standalone) tip.hidden = false;
  })();

  /* ---------- service worker ---------- */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
