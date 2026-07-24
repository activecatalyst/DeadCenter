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

# ---------------------------------------------------------------- auditorium capacity
# Per-auditorium seat counts from Cinema Treasures (crowd-sourced). Each entry:
#   (auditorium number, seats, format-token, inferred?)
# format-token '' = standard house. inferred=True means the format wasn't stated by
# Cinema Treasures — I matched it to one of my seat maps by capacity. Per theatre we
# also record who posted it, when, and a confidence grade from how well its premium
# rooms matched my independently-counted seat maps:
#   'high'  = premium capacities matched my maps exactly (contributor: Nothing But Cinema)
#   'good'  = within a few seats
#   'approx'= one or more premium rooms differ notably from my measured counts
# fmt tokens: IMAX, Dolby, 70mm, XL, PRIME, SCREENX  (mapped to room formats on emit)
AUD = {
 'AMC Mission Valley 20': ('ridethectrain', 'Mar 2026', 'good', [
   (1,139,'',0),(2,137,'',0),(3,131,'',0),(4,203,'IMAX',0),(5,114,'',0),(6,102,'',0),
   (7,112,'',0),(8,149,'',0),(9,252,'',0),(10,176,'',0),(11,175,'',0),(12,88,'',0),
   (13,244,'',0),(14,235,'',0),(15,122,'',0),(16,297,'',0),(17,143,'Dolby',0),
   (18,301,'XL',1),(19,282,'',0),(20,296,'70mm',0)]),
 'AMC UTC 14': ('ridethectrain', 'Mar 2026', 'good', [
   (1,48,'',0),(2,41,'',0),(3,39,'',0),(4,113,'Dolby',0),(5,98,'',0),(6,61,'',0),
   (7,91,'PRIME',0),(8,29,'',0),(9,86,'',0),(10,41,'',0),(11,92,'',0),(12,92,'',0),
   (13,41,'',0),(14,55,'',0)]),
 'AMC Plaza Bonita 14': ('ridethectrain', 'Mar 2026', 'approx', [
   (1,266,'IMAX',0),(2,130,'',0),(3,88,'',0),(4,124,'Dolby',0),(5,294,'XL',0),(6,99,'',0),
   (7,247,'',0),(8,204,'',0),(9,139,'',0),(10,165,'',0),(11,139,'',0),(12,99,'',0),
   (13,204,'',0),(14,130,'',0)]),
 'AMC Orange 30': ('Nothing But Cinema', 'Mar 2026', 'high', [
   (1,97,'',0),(2,161,'',0),(3,161,'',0),(4,110,'',0),(5,190,'',0),(6,235,'',0),
   (7,275,'XL',0),(8,178,'',0),(9,159,'',0),(10,94,'',0),(11,97,'',0),(12,139,'',0),
   (13,97,'',0),(14,405,'XL',0),(15,227,'Dolby',0),(16,317,'IMAX',0),(17,405,'',0),
   (18,97,'',0),(19,139,'',0),(20,97,'',0),(21,97,'',0),(22,159,'',0),(23,178,'',0),
   (24,275,'',0),(25,235,'',0),(26,190,'',0),(27,110,'',0),(28,161,'',0),(29,161,'',0),(30,97,'',0)]),
 'AMC Burbank 16': ('Nothing But Cinema', 'Mar 2026', 'high', [
   (1,348,'IMAX',0),(2,145,'',0),(3,145,'70mm',0),(4,147,'',0),(5,85,'',0),(6,128,'',0),
   (7,238,'SCREENX',0),(8,241,'XL',0),(9,99,'',0),(10,82,'',0),(11,145,'',0),(12,146,'',0),
   (13,146,'',0),(14,273,'Dolby',0),(15,401,'',0),(16,228,'PRIME',0)]),
 'Universal Cinema AMC at CityWalk Hollywood': ('Nothing But Cinema', 'Apr 2026', 'high', [
   (1,173,'PRIME',0),(2,86,'',0),(3,86,'',0),(4,86,'',0),(5,118,'70mm',0),(6,63,'',0),
   (7,62,'',0),(8,62,'',0),(9,63,'',0),(10,116,'XL',0),(11,86,'',0),(12,86,'',0),
   (13,86,'',0),(14,173,'',0),(15,54,'',0),(16,49,'',0),(17,55,'',0),(18,49,'',0),(19,376,'IMAX',0)]),
 'AMC Tyler Galleria 16': ('ridethectrain', 'Dec 2025', 'approx', [
   (1,271,'IMAX',0),(2,99,'',0),(3,139,'',0),(4,165,'',0),(5,139,'',0),(6,99,'',0),
   (7,215,'',0),(8,294,'XL',0),(9,294,'XL',0),(10,215,'',0),(11,99,'',0),(12,139,'',0),
   (13,165,'',0),(14,139,'',0),(15,99,'',0),(16,128,'Dolby',0)]),
 'AMC Tustin 14 @ The District': ('Nothing But Cinema', 'Sep 2024', 'high', [
   (1,164,'PRIME',0),(2,149,'',0),(3,137,'',0),(4,96,'',0),(5,81,'',0),(6,96,'',0),
   (7,70,'',0),(8,160,'Dolby',0),(9,154,'IMAX',0),(10,137,'',0),(11,98,'',0),(12,81,'',0),
   (13,70,'',0),(14,81,'',0)]),
 'AMC Fashion Valley 18': ('ridethectrain', 'Mar 2026', 'good', [
   (1,127,'',0),(2,81,'',0),(3,83,'',0),(4,72,'',0),(5,72,'',0),(6,72,'',0),(7,72,'',0),
   (8,72,'',0),(9,82,'',0),(11,74,'',0),(12,92,'',0),(13,83,'',0),(14,74,'',0),(15,93,'',0),
   (16,83,'',0),(17,83,'',0),(18,83,'',0)]),  # aud 10 not listed by contributor
 'AMC La Jolla 12': ('ridethectrain', 'Mar 2026', 'good', [
   (1,40,'',0),(2,38,'',0),(3,90,'',0),(4,149,'',0),(5,149,'',0),(6,51,'',0),(7,51,'',0),
   (8,44,'',0),(9,154,'',0),(10,50,'',0),(11,117,'',0),(12,53,'',0)]),
 'AMC Poway 10': ('ridethectrain', 'May 2026', 'good', [
   (1,72,'',0),(2,70,'',0),(3,70,'',0),(4,70,'',0),(5,82,'',0),(6,73,'',0),(7,72,'',0),
   (8,72,'',0),(9,100,'',0),(10,130,'',0)]),
 'AMC Anaheim GardenWalk 6': ('ridethectrain', 'Mar 2025', 'good', [
   (1,54,'',0),(2,48,'',0),(3,79,'',0),(4,58,'',0),(5,80,'',0),(6,139,'',0)]),
 'AMC Fullerton 20': ('ridethectrain', 'Jul 2025', 'good', [
   (1,109,'',0),(2,112,'',0),(3,141,'',0),(4,87,'',0),(5,62,'',0),(6,73,'',0),(7,73,'',0),
   (8,62,'',0),(9,89,'',0),(10,128,'',0),(11,68,'',0),(12,46,'',0),(13,54,'',0),(14,54,'',0),
   (15,112,'',0),(16,76,'',0),(17,32,'',0),(18,32,'',0),(19,32,'',0),(20,42,'',0)]),
}

# amctheatres.com slug per theatre, for the "Check availability" link-out.
AMC_SLUG = {
    'AMC Mission Valley 20': 'amc-mission-valley-20',
    'AMC UTC 14': 'amc-utc-14',
    'AMC Plaza Bonita 14': 'amc-plaza-bonita-14',
    'AMC Fashion Valley 18': 'amc-fashion-valley-18',
    'AMC La Jolla 12': 'amc-la-jolla-12',
    'AMC Poway 10': 'amc-poway-10',
    'AMC Orange 30': 'amc-orange-30',
    'AMC Tustin 14 @ The District': 'amc-tustin-14-at-the-district',
    'AMC Fullerton 20': 'amc-fullerton-20',
    'AMC Anaheim GardenWalk 6': 'amc-anaheim-gardenwalk-6',
    'AMC Tyler Galleria 16': 'amc-tyler-galleria-16',
    'AMC Burbank 16': 'amc-burbank-16',
    'Universal Cinema AMC at CityWalk Hollywood': 'universal-cinema-an-amc-theatre',
}

# Map a Cinema Treasures format token to the room format used in seats.js.
def room_format(theater, tok):
    if not tok:
        return None
    if tok == 'IMAX':
        return 'IMAX (very large)' if 'CityWalk' in theater else 'IMAX'
    return {'Dolby': 'Dolby Cinema', '70mm': '70mm', 'XL': 'XL',
            'PRIME': 'PRIME', 'SCREENX': 'SCREENX'}.get(tok)

# ---------------------------------------------------------------- view model
# IMAX tier — the "real IMAX vs LieMAX" distinction avid moviegoers care about.
# Derived from the room format: CityWalk is the only true large-format house here.
def imax_tier(fmt):
    if fmt == 'IMAX (very large)':
        return {'label': 'True large-format IMAX',
                'detail': '70mm-film and 1.43:1 capable (~7-story screen) — one of only ~25 IMAX 70mm houses in the US.'}
    if fmt == 'IMAX':
        return {'label': 'Digital IMAX with Laser',
                'detail': 'A standard 1.90:1 multiplex IMAX — not the giant 1.43 large-format screen.'}
    return None

# "Room feel" — comfort / sound / brightness a moviegoer cares about. Only claims
# what the format or seat type guarantees; leaves the rest blank rather than guess.
def room_feel(fmt, fmt_label, seat_type):
    st = seat_type or ''
    if 'Heated' in st and 'Recliner' in st: seat = 'Heated recliners'
    elif 'Recliner' in st: seat = 'Recliners'
    elif 'Club Rocker' in st: seat = 'Plush rockers'
    elif 'Traditional' in st: seat = 'Traditional seats'
    else: seat = None
    # Sound — only where AMC's format definitionally guarantees it
    if fmt in ('Dolby Cinema', 'PRIME', 'XL'): sound = 'Dolby Atmos'
    elif fmt.startswith('IMAX'): sound = 'IMAX sound system'
    else: sound = None                       # 70mm / SCREENX / standard / 3D vary — don't claim
    # Projection / brightness
    if fmt == 'Dolby Cinema': light = 'Dual 4K laser · Dolby Vision HDR'
    elif fmt == '70mm': light = '70mm film print'
    elif fmt == 'PRIME': light = 'Laser projection'
    elif 'Laser' in (fmt_label or ''): light = 'Laser projection'
    else: light = None
    return {'seat': seat, 'sound': sound, 'light': light}

# Crowd-sourced sightline hazards (railings, walkways, obstructions), keyed by room id.
# Starts EMPTY by design — it fills from moviegoer reports, reviewed before adding.
# Each: { 'room-id': [ {'row': 'K', 'note': 'handrail along the cross-aisle'} ] }
HAZARDS = {}

rooms = []
for r in D['rooms']:
    lo, hi = band(r['format'])
    best, inband = optimal(r)
    rooms.append({
        'tier': imax_tier(r['format']),
        'feel': room_feel(r['format'], r['fmtLabel'], r['seatType']),
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

# Build the auditorium lookup: theatre -> {source, list of auditoriums}. Each
# auditorium links to a mapped room id when its format matches a seat map I have.
room_by_key = {(r['theater'], r['format']): r['id'] for r in rooms}
auditoriums = {}
for theater, (src, asof, conf, lst) in AUD.items():
    items = []
    for num, seats, tok, inferred in lst:
        rf = room_format(theater, tok)
        mapped = room_by_key.get((theater, rf)) if rf else None
        items.append({
            'n': num, 'seats': seats,
            'fmt': rf or '',            # room-format string, '' if standard
            'mapped': mapped,           # room id if I have its seat map, else None
            'inf': bool(inferred),      # format inferred by capacity, not stated by CT
        })
    auditoriums[theater] = {'source': src, 'asOf': asof, 'conf': conf, 'list': items}

theatre_info = {}
for r in rooms:
    if r['theater'] not in theatre_info:
        theatre_info[r['theater']] = {'slug': AMC_SLUG.get(r['theater'], ''), 'short': r['short']}

payload = {'rooms': rooms, 'gaps': D['gaps'], 'missing': missing,
           'auditoriums': auditoriums, 'theatreInfo': theatre_info,
           'hazards': {rid: HAZARDS[rid] for rid in HAZARDS},
           # repo powers the "report a correction" link (prefilled GitHub issue).
           'config': {'repo': 'activecatalyst/DeadCenter'}}

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
