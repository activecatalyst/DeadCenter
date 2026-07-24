/* Dead Center — data-contract test. Zero dependencies.
   Run:  node test.mjs        (from the site directory, next to seats.js)
   Guards the invariants the whole reference depends on — above all, that a
   room in `missing` never also appears as a real, seated room. */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('./seats.js', import.meta.url), 'utf8');
const window = {};
// eslint-disable-next-line no-eval
eval(src);                       // defines window.SEATS
const S = window.SEATS;

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

const VERDICTS = new Set(['SWEET SPOT', 'good', 'too close', 'too far']);
const SEATRE = /^[A-Z]+\d+$/;

ok(S && Array.isArray(S.rooms) && S.rooms.length > 0, 'rooms present');
ok(Array.isArray(S.gaps), 'gaps present');
ok(Array.isArray(S.missing), 'missing present');

// unique ids
const ids = S.rooms.map(r => r.id);
ok(new Set(ids).size === ids.length, 'room ids are unique');

// real (theatre|format) set, for the missing-collision check
const realKey = new Set(S.rooms.map(r => r.theater + '|' + r.format));

for (const r of S.rooms) {
  const at = `${r.theater} / ${r.format}`;
  ok(typeof r.theater === 'string' && r.theater, `${at}: theater`);
  ok(typeof r.format === 'string' && r.format, `${at}: format`);
  ok(Number.isFinite(r.lat) && Number.isFinite(r.lon), `${at}: lat/lon numeric`);
  ok(Number.isFinite(r.miles) && r.miles >= 0, `${at}: miles`);
  ok(Number.isFinite(r.lo) && Number.isFinite(r.hi) && r.lo <= r.hi, `${at}: band lo<=hi`);
  ok(typeof r.screenOffset === 'number', `${at}: screenOffset numeric`);
  ok(SEATRE.test(r.seat), `${at}: seat looks like a seat (${r.seat})`);
  ok(Array.isArray(r.rows) && r.rows.length > 0, `${at}: rows non-empty`);

  // bestRow exists, and the recommended seat's number is within that row
  const br = r.rows.find(x => x.r === r.bestRow);
  ok(br, `${at}: bestRow ${r.bestRow} exists in rows`);
  const seatNum = parseInt(r.seat.replace(/^[A-Z]+/, ''), 10);
  ok(seatNum >= 1 && seatNum <= br.n, `${at}: seat ${r.seat} within row width ${br && br.n}`);

  let prevD = -1;
  for (const x of r.rows) {
    ok(typeof x.r === 'string' && x.r, `${at}: row label`);
    ok(x.d >= 0 && x.d <= 100, `${at}: depth 0..100 (${x.d})`);
    ok(Number.isInteger(x.c) && x.c >= 1 && x.c <= x.n, `${at}: center seat in range (row ${x.r})`);
    ok(Number.isInteger(x.n) && x.n > 0, `${at}: seat count (row ${x.r})`);
    ok(VERDICTS.has(x.v), `${at}: verdict valid (${x.v})`);
    ok(x.d >= prevD, `${at}: rows ordered front->back (row ${x.r})`);
    prevD = x.d;
  }
}

// IMAX tier: every IMAX room carries a tier label; non-IMAX rooms don't.
for (const r of S.rooms) {
  if (r.format.indexOf('IMAX') === 0) {
    ok(r.tier && r.tier.label && r.tier.detail, `${r.theater}: IMAX room has a tier`);
  } else {
    ok(!r.tier, `${r.theater} / ${r.format}: non-IMAX has no tier`);
  }
}

// Sightline hazards (crowd-sourced) must reference a real room and a real row.
if (S.hazards) {
  const byId = new Map(S.rooms.map(r => [r.id, r]));
  for (const [rid, list] of Object.entries(S.hazards)) {
    const room = byId.get(rid);
    ok(room, `hazard room id ${rid} resolves`);
    for (const h of (list || [])) {
      ok(typeof h.note === 'string' && h.note, `${rid} hazard has a note`);
      ok(room.rows.some(x => x.r === h.row), `${rid} hazard row ${h.row} exists`);
    }
  }
}

// THE contract: nothing in `missing` may also be a real seated room
for (const m of S.missing) {
  ok(typeof m.theater === 'string' && typeof m.format === 'string' && typeof m.note === 'string',
     `missing entry well-formed (${m.theater} / ${m.format})`);
  ok(!realKey.has(m.theater + '|' + m.format),
     `MISSING must not collide with a real room: ${m.theater} / ${m.format}`);
}

for (const g of S.gaps) {
  ok(typeof g.theater === 'string' && typeof g.format === 'string' && typeof g.note === 'string',
     'gap entry well-formed');
}

// Auditorium capacity: every mapped id must resolve to a real room, and every
// auditorium's seat count must be a positive integer.
if (S.auditoriums) {
  const ids = new Set(S.rooms.map(r => r.id));
  for (const [theater, A] of Object.entries(S.auditoriums)) {
    ok(typeof A.source === 'string' && A.source, `${theater}: capacity source`);
    ok(['high', 'good', 'approx'].includes(A.conf), `${theater}: confidence grade`);
    ok(Array.isArray(A.list) && A.list.length > 0, `${theater}: auditorium list`);
    for (const a of A.list) {
      ok(Number.isInteger(a.n) && a.n >= 1, `${theater} aud ${a.n}: number`);
      ok(Number.isInteger(a.seats) && a.seats > 0, `${theater} aud ${a.n}: seats`);
      if (a.mapped) ok(ids.has(a.mapped), `${theater} aud ${a.n}: mapped id ${a.mapped} resolves`);
      // a mapped auditorium must name a format
      if (a.mapped) ok(a.fmt, `${theater} aud ${a.n}: mapped implies a format`);
    }
  }
}

console.log(`✓ ${n} assertions passed across ${S.rooms.length} rooms, ` +
            `${S.missing.length} missing, ${S.gaps.length} gaps.`);
