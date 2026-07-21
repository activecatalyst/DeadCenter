#!/usr/bin/env python3
"""Dead Center build.

Sources of truth:
  data.json   raw measured geometry
  common.py   optimal-seat model (bands, verdicts, reason text)
  src/*       hand-maintained HTML/CSS/JS/manifest/sw

This script ONLY:
  1. computes the per-room view model and writes  docs/seats.js
  2. copies src/* into docs/, templating the theatre/room counts into index.html
  3. renders the app icons and the og:image

GitHub Pages serves the docs/ folder. There is NO application logic here — that
lives in src/app.js as real, lintable JS. Run:  python3 build.py
"""
import os, json, math, shutil, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import D, band, verdict, optimal, reason

SRC = os.path.join(HERE, 'src')
SITE = os.path.join(HERE, 'docs')
os.makedirs(SITE, exist_ok=True)

# ---------------------------------------------------------------- geography
SD = (32.7157, -117.1611)   # downtown San Diego — the default distance origin
GEO = {
    'AMC Mission Valley 20':          (32.7660, -117.1520),
    'AMC UTC 14':                     (32.8710, -117.2110),
    'AMC Plaza Bonita 14':            (32.6670, -117.0450),
    'AMC Fashion Valley 18':          (32.7675, -117.1680),
    'AMC La Jolla 12':                (32.8670, -117.2290),
    'AMC Poway 10':                   (32.9630, -117.0360),
    'AMC Tustin 14 @ The District':   (33.7010, -117.8300),
    'AMC Tyler Galleria 16':          (33.9160, -117.4550),
    'AMC Orange 30':                  (33.8080, -117.8880),
    'AMC Anaheim GardenWalk 6':       (33.8030, -117.9120),
    'AMC Fullerton 20':               (33.8650, -117.9230),
    'Universal Cinema AMC at CityWalk Hollywood': (34.1370, -118.3530),
    'AMC Burbank 16':                 (34.1830, -118.3080),
}

def miles(theater, origin=SD):
    la1, lo1 = map(math.radians, origin)
    la2, lo2 = map(math.radians, GEO[theater])
    dla, dlo = la2 - la1, lo2 - lo1
    a = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return round(2 * 3958.8 * math.asin(math.sqrt(a)))

# Signed screen-vs-seat-block offset in seat-widths (+ toward higher numbers).
# 37 of 38 rooms measured screen == seat-block center; only this one differed.
SCREEN_OFFSET = {('AMC Tyler Galleria 16', 'IMAX'): -0.5}

# (theatre, format) pairs that could NOT be measured — kept explicit so the
# picker answers them with "not captured", never with a fabricated seat.
MISSING = [
    ('AMC UTC 14', 'PRIME',
     'Listed as a PRIME house, but no PRIME showtimes appeared on 24 or 25 Jul 2026. '
     'Verify whether UTC still operates a PRIME auditorium.'),
    ('AMC Orange 30', 'PRIME',
     'Listed as a PRIME house, but no PRIME showtimes on 24 or 31 Jul 2026, while IMAX, '
     'Dolby, XL, Laser and RealD 3D all appeared normally. Verify whether Orange 30 still runs PRIME.'),
    ('AMC Plaza Bonita 14', 'XL',
     'No XL at AMC showtimes on 24 or 28 Jul 2026 — only IMAX, Dolby and standard Laser.'),
    ('Universal Cinema AMC at CityWalk Hollywood', 'XL',
     'No XL at AMC showtimes on 24 Jul 2026, though IMAX, PRIME, 70mm and Laser all appeared. '
     'Worth re-checking on another date.'),
    ('AMC Plaza Bonita 14', 'RealD 3D',
     'No RealD 3D showtimes in the sampled window. Use the standard Laser room as a stand-in.'),
    ('AMC Fashion Valley 18', 'RealD 3D',
     'No RealD 3D showtimes in the sampled window. Use the standard Laser room as a stand-in.'),
    ('AMC La Jolla 12', 'RealD 3D',
     'No RealD 3D showtimes in the sampled window. Use the standard Laser room as a stand-in.'),
    ('AMC Poway 10', 'RealD 3D',
     'No RealD 3D showtimes in the sampled window. Use the standard Laser room as a stand-in.'),
]

def slug(s):
    s = (s.replace('Universal Cinema AMC at CityWalk Hollywood', 'CityWalk Universal')
          .replace('@ The District', '').replace('AMC ', ''))
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s.lower())).strip('-')

# ---------------------------------------------------------------- view model
rooms = []
for r in D['rooms']:
    lo, hi = band(r['format'])
    best, inband = optimal(r)
    rooms.append({
        'id': slug(r['theater']) + '/' + slug(r['format']),
        'theater': r['theater'],
        'short': r['theater'].replace('Universal Cinema AMC at CityWalk Hollywood', 'CityWalk (Universal)'),
        'region': r['region'].replace(' (discovered)', ''),
        'format': r['format'], 'fmtLabel': r['fmtLabel'], 'seatType': r['seatType'],
        'total': r['total'], 'date': r['date'], 'rep': r['rep'], 'centerOk': r['centerOk'],
        'lo': lo, 'hi': hi, 'seat': f'{best[0]}{best[2]}', 'bestRow': best[0], 'inband': inband,
        'why': reason(r), 'quirks': r['quirks'],
        'miles': miles(r['theater']),
        'lat': GEO[r['theater']][0], 'lon': GEO[r['theater']][1],
        'screenOffset': SCREEN_OFFSET.get((r['theater'], r['format']), 0),
        'rows': [{'r': x[0], 'd': x[1], 'c': x[2], 'n': x[3], 'v': verdict(x[1], r['format'])} for x in r['rows']],
    })
rooms.sort(key=lambda r: r['miles'])   # stable: formats keep capture order within a theater

missing = [{'theater': t, 'format': f, 'note': n} for t, f, n in MISSING]
THEATRES = len({r['theater'] for r in rooms})
payload = {'rooms': rooms, 'gaps': D['gaps'], 'missing': missing}

SEATS_JS = (
    "/* Dead Center — seat geometry. THE DATA IS THE ASSET.\n"
    "   Generated by build.py from data.json; edit that, not this file.\n"
    "\n"
    "   CONTRACT: `missing` = rooms that could NOT be measured. They must render as\n"
    "   'not captured' and must never be assigned a seat. Fabricated geometry is\n"
    "   indistinguishable from measured geometry in a table and poisons the reference.\n"
    "   Re-measure from a live seat map or leave it in `missing`. test.mjs enforces this. */\n"
    "window.SEATS = " + json.dumps(payload, indent=1) + ";\n"
)
open(os.path.join(SITE, 'seats.js'), 'w').write(SEATS_JS)

# ---------------------------------------------------------------- static files
for name in ['app.js', 'styles.css', 'manifest.json', 'sw.js', '_headers', 'test.mjs', 'README.md']:
    shutil.copyfile(os.path.join(SRC, name), os.path.join(SITE, name))

html = open(os.path.join(SRC, 'index.html')).read()
html = html.replace('{{THEATRES}}', str(THEATRES)).replace('{{ROOMS}}', str(len(rooms)))
open(os.path.join(SITE, 'index.html'), 'w').write(html)

# GitHub Pages otherwise runs Jekyll and can drop files/folders; disable it.
open(os.path.join(SITE, '.nojekyll'), 'w').write('')

# ---------------------------------------------------------------- assets
from PIL import Image, ImageDraw, ImageFont
NAVY = (31, 56, 100); SEAT = (255, 255, 255); DIM = (108, 132, 176); PICK = (198, 224, 180)

def app_icon(size, maskable=False):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, S, S], fill=NAVY); inset = S * 0.20
    else:
        d.rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=NAVY); inset = S * 0.16
    w = S - inset * 2
    sw = w * 0.86; sx = inset + (w - sw) / 2; sy = inset + w * 0.06
    d.rounded_rectangle([sx, sy, sx + sw, sy + w * 0.055], radius=w * 0.028, fill=PICK)
    cols, rows_n = 5, 4
    gap = w * 0.055; cell = (w - gap * (cols - 1)) / cols; top = sy + w * 0.19
    for rr in range(rows_n):
        for c in range(cols):
            x = inset + (w - (cell * cols + gap * (cols - 1))) / 2 + c * (cell + gap)
            y = top + rr * (cell + gap)
            if c == 2 and rr == 2:
                pad = cell * 0.16
                d.rounded_rectangle([x - pad, y - pad, x + cell + pad, y + cell + pad], radius=cell * 0.30, fill=PICK)
            else:
                d.rounded_rectangle([x, y, x + cell, y + cell], radius=cell * 0.24, fill=SEAT if rr < 2 else DIM)
    return img.resize((size, size), Image.LANCZOS)

app_icon(192).save(os.path.join(SITE, 'icon-192.png'))
app_icon(512).save(os.path.join(SITE, 'icon-512.png'))
app_icon(512, maskable=True).save(os.path.join(SITE, 'icon-maskable-512.png'))
a = app_icon(180); flat = Image.new('RGB', (180, 180), NAVY); flat.paste(a, (0, 0), a)
flat.save(os.path.join(SITE, 'apple-touch-icon.png'))

FP = '/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf'
def f(sz, b=False):
    return ImageFont.truetype(FP % ('-Bold' if b else ''), sz)
og = Image.new('RGB', (1200, 630), NAVY); d = ImageDraw.Draw(og)
ic = app_icon(200); og.paste(ic, (90, 215), ic)
d.text((330, 250), 'Dead Center', font=f(92, True), fill=(255, 255, 255))
d.text((334, 356), 'The best seat in every premium-format', font=f(34), fill=(182, 196, 220))
d.text((334, 400), 'auditorium across Southern California', font=f(34), fill=(182, 196, 220))
sx0, sy0, sz, gp = 334, 470, 26, 10
for i in range(14):
    x = sx0 + i * (sz + gp)
    col = PICK if i == 7 else (74, 96, 140)
    d.rounded_rectangle([x, sy0, x + sz, sy0 + sz], radius=7, fill=col)
og.save(os.path.join(SITE, 'og.png'))

print('seats.js  :', len(rooms), 'rooms,', len(missing), 'missing,', THEATRES, 'theatres')
print('docs/     :', ', '.join(sorted(os.listdir(SITE))))
