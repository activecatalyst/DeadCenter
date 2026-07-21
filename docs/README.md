# Dead Center

The best seat in every premium-format auditorium across Southern California.
Installable PWA. No framework, no bundler, no backend.

## Files (this folder is the deployable site)

    index.html    markup — hand-edited
    styles.css    styles — hand-edited
    app.js        view logic — hand-edited, lintable JS (no logic lives in the build)
    seats.js      THE DATA — generated from data.json by build.py
    manifest.json PWA metadata
    sw.js         offline service worker
    _headers      CSP + security headers (Netlify / Cloudflare Pages)
    test.mjs      data-contract test (node, zero deps)
    icon-*.png / apple-touch-icon.png / og.png   generated assets

The source lives one level up: `data.json`, `common.py`, `src/*`, `build.py`.
Running `python3 build.py` regenerates everything in this folder.

## Deploy

Drag this folder onto **app.netlify.com/drop**, or push to **GitHub Pages** /
**Vercel**. Must be served over **https** for the service worker, install prompt,
geolocation, and `_headers` to take effect. Opening `index.html` from disk works
too — it just runs without offline caching or geolocation.

## Test

    node test.mjs

Asserts the invariants the reference depends on: unique ids, every room has
coordinates and non-empty rows, the recommended seat is inside its row, rows run
front-to-back — and, most importantly, that nothing in `missing` is also a real
seated room. Run it after any edit to `data.json`.

## The one rule

`seats.js` has a `missing` array: (theatre, format) pairs that could NOT be
measured because no showtime in that format existed in the browsable window.

**Never fill one in with an estimate.** Fabricated geometry is indistinguishable
from measured geometry once it's in a table, and it poisons the whole reference.
Re-measure from a live AMC seat map or leave it in `missing`. `test.mjs` fails if
a missing entry ever collides with a real room. This is the failure mode to watch
for if you point an AI coding tool at the project.

## Editing

- **Change the data** → edit `data.json`, run `python3 build.py`, run `node test.mjs`,
  then bump `CACHE` in `src/sw.js` (`deadcenter-v5` → `v6`) so installed clients update.
- **Change the UI** → edit `src/app.js` / `src/styles.css` / `src/index.html`, rebuild.
- The theatre/room counts in the copy are templated (`{{THEATRES}}`, `{{ROOMS}}`),
  so they never drift from the data.

## How the data was measured

Each seat on an AMC seat map is `<input name="A15">` inside a `<label>`; the input
has zero width, so position comes from the label's bounding rect.

- **Center axis** = midpoint of min/max seat x, checked against the SCREEN label.
  One room (Tyler Galleria IMAX) is genuinely off-center — see `screenOffset`.
- **Depth %** = `(row y − front y) / (back y − front y)`; 0 % front, 100 % back.
- **Most-central seat** = the non-accessible seat nearest the axis.

## Depth targets

| Format | Target | Why |
|---|---|---|
| IMAX | 60–68% | Tall screen — sit back so the frame fits without craning |
| IMAX (very large) | 66–68% | CityWalk's 6–7 story screen; back of the band |
| 70mm | 50–58% | Wide, not tall — close is fine |
| SCREENX | 50–60% | Side walls frame your periphery without wrapping too hard |
| Dolby / XL / PRIME | 55–63% | Reference position just behind midpoint |
| Standard Laser | 55–65% | Conventional room reference position |

## Fixed rooms vs representative samples

IMAX, Dolby, PRIME, XL, 70mm and SCREENX are each one dedicated auditorium per
theatre, so those maps are exact. Standard Laser and RealD 3D **float** across many
standard auditoriums; those entries are `rep: true` and the room you get varies by
showtime.

## Distances

Straight-line miles from downtown San Diego by default; the "Sort by my location"
button re-centers on the device's GPS position (coordinates never leave the device).
Venue coordinates are in `build.py` (`GEO`).

## Security

`_headers` sets a Content-Security-Policy with `script-src 'self'` (no inline
script — that's why the JS is external). `style-src` keeps `'unsafe-inline'`
because a few dynamic values (seat-bar widths, verdict colors) are inline style
attributes; style injection is far lower risk than script injection.

## Attribution

Independent reference. Not affiliated with or endorsed by AMC Theatres. Seat
layouts are factual measurements of publicly viewable pages; the UI, the depth
model and the analysis are original.
