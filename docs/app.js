/* Dead Center — app logic.
   Pure view layer over window.SEATS (see seats.js). No dependencies.
   The DATA is the asset; this file is disposable. */
(function () {
  'use strict';
  var STALE_MONTHS = 18;
  var VC = {'SWEET SPOT':'var(--z-sweet)','good':'var(--z-good)','too close':'var(--z-close)','too far':'var(--z-far)'};
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
    renderBest();
  }

  /* ---------- "Best way to see it" ranking ---------- */
  // Presentation quality score per premium format. Standard Laser / RealD 3D are
  // excluded (they're not premium presentations and float between rooms).
  var PRES = { 'IMAX (very large)': 100, 'IMAX': 82, '70mm': 76,
               'Dolby Cinema': 72, 'PRIME': 66, 'SCREENX': 60, 'XL': 55 };
  var bestSort = 'presentation';
  function renderBest() {
    var el = document.getElementById('best'); if (!el) return;
    var list = DATA.rooms.filter(function (r) { return PRES[r.format] != null; }).slice();
    list.sort(function (a, b) {
      return bestSort === 'nearest'
        ? (a.miles - b.miles) || (PRES[b.format] - PRES[a.format])
        : (PRES[b.format] - PRES[a.format]) || (a.miles - b.miles);
    });
    el.innerHTML = list.map(function (r, i) {
      var disp = r.format === 'IMAX (very large)' ? 'IMAX' : r.format;
      var tag = r.format === 'IMAX (very large)' ? ' · <span class="btag">★ large-format</span>'
              : r.format === 'IMAX' ? ' · <span class="btag dim">digital</span>' : '';
      return '<li><button class="brow" type="button" data-t="' + esc(r.theater) + '" data-f="' + esc(r.format) + '">' +
        '<span class="brank">' + (i + 1) + '</span>' +
        '<span class="bmeta"><b>' + esc(disp) + tag + '</b><span>' + esc(r.short) + '</span></span>' +
        '<span class="bnum">' + r.total + ' seats<br>' + r.miles + ' mi</span></button></li>';
    }).join('');
  }
  (function () {
    var tog = document.getElementById('besttoggle');
    if (tog) tog.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      bestSort = b.dataset.s;
      Array.prototype.forEach.call(this.children, function (c) {
        c.setAttribute('aria-pressed', String(c === b)); });
      renderBest();
    });
    var lst = document.getElementById('best');
    if (lst) lst.addEventListener('click', function (e) {
      var b = e.target.closest('.brow'); if (!b) return;
      var pt = $('#pt'), pf = $('#pf'), pa = $('#pa');
      pt.value = b.dataset.t; pt.dispatchEvent(new Event('change', { bubbles: true }));
      pa.value = '';
      pf.value = b.dataset.f; pf.dispatchEvent(new Event('change', { bubbles: true }));
      var w = document.getElementById('bestwrap'); if (w) w.open = false;
      var ans = $('#answer'); if (ans && ans.scrollIntoView) ans.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  })();

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
    var t = this.value, pf = $('#pf'), pa = $('#pa');
    $('#answer').innerHTML = '';
    pa.value = '';
    pa.disabled = !(t && DATA.auditoriums && DATA.auditoriums[t]);
    if (!t) { pf.disabled = true; pf.innerHTML = '<option value="">—</option>'; return; }
    var fs = formatsFor(t);
    pf.disabled = false;
    pf.innerHTML = '<option value="">Choose a format…</option>' + fs.map(function (x) {
      return '<option value="' + esc(x.f) + '">' + esc(x.f) +
             (x.ok ? '' : '  — not captured') + '</option>'; }).join('');
    if (fs.length === 1) { pf.value = fs[0].f; showAnswer(); }
  });
  // Format picker and auditorium number are two ways in; using one clears the other.
  $('#pf').addEventListener('change', function () { $('#pa').value = ''; showAnswer(); });
  $('#pa').addEventListener('input', function () { if (this.value !== '') $('#pf').value = ''; showAuditorium(); });

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

  function seatMap(room, pickNum, hzRows) {
    var rows = room.rows.map(function (r) {
      var pick = r.r === room.bestRow;
      var haz = hzRows && hzRows[r.r];
      var seats = '';
      for (var i = 1; i <= r.n; i++) {
        seats += '<span class="s' + (pick && i === pickNum ? ' pick' : '') + '"></span>';
      }
      return '<div class="maprow' + (haz ? ' haz' : '') + '" data-v="' + esc(r.v) + '"' +
        (haz ? ' title="' + esc(hzRows[r.r]) + '"' : '') + '><span class="lb">' + esc(r.r) +
        (haz ? ' ⚠' : '') + '</span><span class="seats">' + seats + '</span></div>';
    }).join('');
    return '<div class="map"><div class="mapinner">' +
      '<div class="screen"></div><div class="screenlbl">SCREEN</div>' + rows +
      '<div class="maplegend">Schematic — row lengths and the marked seat are measured, ' +
      'but aisle positions within a row are not drawn.</div></div></div>';
  }

  // One-line, honest description of what each format is.
  var EXPLAIN = {
    'IMAX': 'IMAX — a tall, high-impact screen and big sound; the frame is larger top-to-bottom than a standard house.',
    'IMAX (very large)': 'IMAX — a true large-format, 70mm-capable screen (CityWalk’s is ~7 stories); the biggest presentation here.',
    'Dolby Cinema': 'Dolby Cinema — dual-laser HDR projection with deep contrast, Dolby Atmos sound, and powered recliners.',
    '70mm': '70mm — film-print projection: a wide, film-grain image prized by enthusiasts.',
    'XL': 'XL at AMC — AMC’s extra-large standard screen with Dolby Atmos; bigger than a normal house.',
    'PRIME': 'PRIME at AMC — AMC’s large-format brand: a big wall-to-wall screen, laser projection, Atmos and recliners.',
    'SCREENX': 'SCREENX — a 270° presentation that extends onto the side walls for select scenes; sit dead-center.',
    'Standard Laser': 'Standard Laser — a regular auditorium with laser projection. A representative sample, not a fixed room.',
    'RealD 3D': 'RealD 3D — polarized 3D in a standard auditorium; the room varies by showtime.'
  };

  // "Check availability" (AMC) + "Directions" (Maps) link-out for a theatre.
  function linksFor(t) {
    var info = DATA.theatreInfo && DATA.theatreInfo[t];
    var out = '<div class="links">';
    if (info && info.slug) {
      out += '<a href="https://www.amctheatres.com/movie-theatres/' + esc(info.slug) +
             '" target="_blank" rel="noopener">Check availability on AMC ↗</a>';
    }
    out += '<a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(t) +
           '" target="_blank" rel="noopener">Directions ↗</a></div>';
    return out;
  }

  // "Report a correction" — opens a prefilled GitHub issue. Zero backend; starts
  // the maintenance loop so wrong seat counts / moved formats get flagged.
  function reportLink(context) {
    var repo = DATA.config && DATA.config.repo;
    if (!repo) return '';
    var title = 'Correction: ' + context;
    var body = 'What looks wrong (seat count, optimal seat, format, room closed, etc.):\n\n\n' +
      '— Context: ' + context + '\n— Page: ' + location.href;
    var url = 'https://github.com/' + repo + '/issues/new?title=' +
      encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
    return '<a class="report" href="' + url + '" target="_blank" rel="noopener">' +
      'Spot an error? Report a correction ↗</a>';
  }

  // Sightline-hazard report — the crowd-sourced obstruction layer. Prefills a
  // GitHub issue labeled "sightline"; approved reports get added to HAZARDS.
  function sightlineLink(room) {
    var repo = DATA.config && DATA.config.repo;
    if (!repo) return '';
    var title = 'Sightline: ' + room.short + ' · ' + room.format;
    var body = 'Which row, and what blocks the view (railing, walkway, handrail, pillar)?\n\n' +
      'Row:\nWhat you see:\n\n— ' + room.short + ' · ' + room.format + '\n— Page: ' + location.href;
    var url = 'https://github.com/' + repo + '/issues/new?labels=sightline&title=' +
      encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
    return '<a class="report" href="' + url + '" target="_blank" rel="noopener">Report a blocked sightline ↗</a>';
  }

  function rateBox(room) {
    return '<div class="rate"><label>Rate a seat in this room ' +
      '<input class="ratein" type="text" data-room="' + esc(room.id) + '" autocomplete="off" ' +
      'placeholder="e.g. ' + esc(room.seat) + '"></label><div class="ratered" aria-live="polite"></div></div>';
  }

  // The inner markup for a mapped room (optimal seat + diagram + rationale + quirks).
  // Shared by the format picker and the auditorium-number lookup.
  function roomAnswerInner(room) {
    var adj = screenAdjust(room);
    var shown = adj.row + adj.seat;
    var hz = (DATA.hazards && DATA.hazards[room.id]) || [];
    var hzRows = {}; hz.forEach(function (h) { hzRows[h.row] = h.note; });
    var feelStr = room.feel
      ? [room.feel.seat, room.feel.sound, room.feel.light].filter(Boolean).map(esc).join(' · ') : '';
    return '<div class="bigseat"><span class="num' + (room.inband ? '' : ' off') + '">' + esc(shown) + '</span>' +
      '<span class="sub"><b>' + esc(room.short) + ' · ' + esc(room.format) + '</b>' +
      'Row ' + esc(room.bestRow) + ' · ' + room.lo + '–' + room.hi + '% back · ' +
      esc(room.seatType) + '<br>' + room.total + ' seats across ' + room.rows.length + ' rows · captured ' +
      esc(room.date) + (room.rep ? ' · <b class="inline">representative sample</b>' : '') +
      '</span></div>' +
      (room.tier ? '<div class="tier"><span class="tierbadge">' + esc(room.tier.label) + '</span>' +
                   esc(room.tier.detail) + '</div>' : '') +
      (feelStr ? '<p class="feel">' + feelStr + '</p>' : '') +
      (EXPLAIN[room.format] ? '<p class="fmtnote">' + esc(EXPLAIN[room.format]) + '</p>' : '') +
      (adj.note ? '<p class="warn mt0">' + esc(adj.note) + '</p>' : '') +
      seatMap(room, adj.seat, hzRows) +
      '<p class="why mt">' + esc(room.why) + '</p>' +
      '<ul class="quirks">' + room.quirks.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') +
      '</ul>' +
      (hz.length ? '<div class="hazards"><b>⚠ Sightline notes (from moviegoers)</b><ul>' +
        hz.map(function (h) { return '<li>Row ' + esc(h.row) + ' — ' + esc(h.note) + '</li>'; }).join('') +
        '</ul></div>' : '') +
      rateBox(room) +
      linksFor(room.theater) +
      '<div class="reports">' + reportLink(room.short + ' · ' + room.format) + sightlineLink(room) + '</div>';
  }

  // Live "rate my seat" — delegated so it works for every dynamically rendered answer.
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains('ratein')) return;
    var room = DATA.rooms.filter(function (r) { return r.id === el.dataset.room; })[0];
    var out = el.closest('.rate').querySelector('.ratered');
    if (!room || !out) return;
    var v = (el.value || '').trim().toUpperCase();
    if (!v) { out.className = 'ratered'; out.textContent = ''; return; }
    var m = v.match(/^([A-Z]{1,2})(\d{1,3})$/);
    if (!m) { out.className = 'ratered bad'; out.textContent = 'Enter a seat like ' + room.seat + '.'; return; }
    var letter = m[1], num = parseInt(m[2], 10);
    var row = room.rows.filter(function (r) { return r.r === letter; })[0];
    if (!row) { out.className = 'ratered bad'; out.textContent = 'There’s no row ' + letter + ' in this room.'; return; }
    if (num < 1 || num > row.n) {
      out.className = 'ratered bad'; out.textContent = 'Row ' + letter + ' has seats 1–' + row.n + '.'; return;
    }
    var off = num - row.c;
    // horizontal position as a share of the half-row-width: 0% = dead center,
    // 100% = the end seat. Even-spacing estimate (doesn't model aisle gaps).
    var half = Math.max(1, (row.n - 1) / 2);
    var pct = Math.min(100, Math.round(Math.abs(off) / half * 100));
    var horiz = off === 0 ? 'dead-center in its row (0% off-center)'
      : '~' + pct + '% off-center — ' + Math.abs(off) + ' seat' + (Math.abs(off) === 1 ? '' : 's') +
        ' from the row’s center (seat ' + row.c + ')';
    var cls = { 'SWEET SPOT': 'good', 'good': 'ok', 'too close': 'warn', 'too far': 'warn' }[row.v];
    var rowWord = row.v === 'SWEET SPOT' ? 'a sweet-spot row' : row.v === 'good' ? 'a good row' : 'a ' + row.v + ' row';
    out.className = 'ratered ' + cls;
    out.innerHTML = '<b>' + esc(letter + num) + '</b> is in ' + rowWord + ' (' + row.d + '% back) and ' + horiz +
      '. This room’s optimal is <b>' + esc(room.seat) + '</b>.' +
      (off === 0 ? '' : '<span class="rq">Off-center % assumes even seat spacing.</span>');
  });

  function theatreShort(t) {
    var r = DATA.rooms.filter(function (x) { return x.theater === t; })[0];
    return r ? r.short : t;
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
    out.innerHTML = '<div class="answer">' + roomAnswerInner(room) + '</div>';
  }

  // Auditorium-number lookup: capacity + format for any auditorium, plus the
  // optimal seat when that auditorium is a premium room I actually mapped.
  var CONF = {
    high:  'matches my measured seat counts',
    good:  'within a few seats of my measured counts',
    approx:'differs noticeably from my measured counts — treat as approximate'
  };
  function showAuditorium() {
    var t = $('#pt').value, out = $('#answer'), raw = $('#pa').value;
    if (!t || raw === '') { showAnswer(); return; }   // no number → fall back to format flow
    var num = parseInt(raw, 10);
    var A = DATA.auditoriums && DATA.auditoriums[t];
    if (!A) {
      out.innerHTML = '<div class="answer"><div class="notcaptured"><b>No auditorium list</b>' +
        '<p>I don’t have per-auditorium capacity for ' + esc(theatreShort(t)) + '.</p></div></div>';
      return;
    }
    var src = 'Capacity from Cinema Treasures (' + esc(A.source) + ', ' + esc(A.asOf) + ') — ' + CONF[A.conf] + '.';
    var a = A.list.filter(function (x) { return x.n === num; })[0];
    if (!a) {
      out.innerHTML = '<div class="answer"><div class="notcaptured"><b>Auditorium ' + num + ' not listed</b>' +
        '<p>The capacity list for ' + esc(theatreShort(t)) + ' doesn’t include auditorium ' + num +
        ' — it may be incomplete. ' + src + '</p></div></div>';
      return;
    }
    var head = '<div class="bigseat"><span class="num cap">' + a.seats + '</span>' +
      '<span class="sub"><b>Auditorium ' + a.n + (a.fmt ? ' · ' + esc(a.fmt) : '') + '</b>' +
      esc(theatreShort(t)) + ' · ' + a.seats + ' seats<br>' + src +
      (a.inf ? ' Format identified by matching capacity to my seat map, not stated by the source.' : '') +
      '</span></div>';
    var body;
    if (a.mapped) {
      var room = DATA.rooms.filter(function (r) { return r.id === a.mapped; })[0];
      body = '<p class="why mt0">This is the ' + esc(a.fmt) + ' house — here’s its optimal seat.</p>' +
             roomAnswerInner(room);
    } else {
      // capacity-only (premium-but-unmapped, or standard) — these branches need
      // their own report link since they don't go through roomAnswerInner.
      var ctx = theatreShort(t) + ' · Auditorium ' + num;
      if (a.fmt) {
        body = '<p class="warn mt0">This is the ' + esc(a.fmt) + ' house, but I don’t have a measured seat map ' +
               'for it (no showtime in that format during capture) — capacity only.</p>' +
               (EXPLAIN[a.fmt] ? '<p class="fmtnote">' + esc(EXPLAIN[a.fmt]) + '</p>' : '');
      } else {
        body = '<p class="warn mt0">Standard auditorium — capacity only. Standard screens float between rooms, ' +
               'so there’s no fixed optimal seat here.</p>';
      }
      body += linksFor(t) + reportLink(ctx);
    }
    out.innerHTML = '<div class="answer">' + head + body + '</div>';
  }

  $('#gaps').innerHTML = DATA.gaps.map(function (g) {
    return '<dt>' + esc(g.theater) + ' — ' + esc(g.format) + '</dt><dd>' + esc(g.note) + '</dd>';
  }).join('');

  render();
  renderBest();
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
