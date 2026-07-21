# Dead Center

The best seat in every premium-format auditorium at 13 AMC theatres across
Southern California — IMAX, Dolby, PRIME, XL, 70mm and SCREENX — measured from
the actual seat maps. Installable PWA. No framework, no bundler, no backend.

Pick a theatre and format and it tells you the single best seat, with a seat-grid
diagram, a per-row depth table, and the room's quirks. Theatres sort nearest-first
from San Diego, or from your live location.

## Repository layout

    data.json      raw measured geometry — the source of truth
    common.py      the optimal-seat model (depth bands, verdicts, rationale)
    build.py       generates docs/ from data.json + src/
    src/           hand-edited HTML / CSS / JS / manifest / service worker / test
    docs/          BUILT site — this is what GitHub Pages serves (committed)

Application logic lives in `src/app.js` as real, lintable JavaScript. `build.py`
contains no logic — it only computes `seats.js` and copies/templates `src/`.

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch.**
3. Branch: `main`, folder: **`/docs`**. Save.

Your site goes live at `https://<user>.github.io/<repo>/` within a minute. Pages
serves over https, so the service worker, install prompt and geolocation all work.
(`_headers` is a Netlify/Cloudflare-Pages file; GitHub Pages ignores it, so the
CSP applies only if you deploy to those hosts instead.)

Prefer Netlify? Drag the `docs/` folder onto app.netlify.com/drop, or point
Netlify at the repo with publish directory `docs`.

## Develop

    python3 build.py     # regenerate docs/  (needs: pip install pillow)
    node docs/test.mjs   # run the data-contract test (no npm install needed)

- **Change the data** → edit `data.json`, `python3 build.py`, `node docs/test.mjs`,
  then bump `CACHE` in `src/sw.js` (`deadcenter-v5` → `v6`) so installed clients update.
- **Change the UI** → edit `src/app.js` / `src/styles.css` / `src/index.html`, rebuild.

## The one rule

`data.json` (and generated `seats.js`) has a `missing` list: (theatre, format)
pairs that could NOT be measured because no showtime in that format existed in the
browsable window.

**Never fill one in with an estimate.** Fabricated geometry is indistinguishable
from measured geometry once it's in a table, and it poisons the whole reference.
Re-measure from a live AMC seat map or leave it in `missing`. `docs/test.mjs`
fails the build if a missing entry ever collides with a real room — this is the
guardrail against an AI coding tool "helpfully" inventing the rooms that are
deliberately absent.

## License

Code under MIT (see LICENSE). Seat data are factual measurements; the project is
an independent reference and is not affiliated with or endorsed by AMC Theatres.
