import json, os
D = json.load(open(os.path.join(os.path.dirname(__file__), 'data.json')))
BANDS = D['bands']

def band(fmt):
    return BANDS[fmt]

def verdict(depth, fmt):
    lo, hi = band(fmt)
    if lo <= depth <= hi: return 'SWEET SPOT'
    if depth < lo:
        return 'good' if depth >= lo - 15 else 'too close'
    return 'good' if depth <= hi + 15 else 'too far'

def optimal(room):
    """Pick the row whose depth is closest to the band midpoint; tie-break on
    how central its most-central seat is. Rows that are accessible ledges or
    grossly off-axis are still eligible but noted in quirks."""
    lo, hi = band(room['format'])
    mid = (lo + hi) / 2
    rows = room['rows']
    inband = [r for r in rows if lo <= r[1] <= hi]
    pool = inband if inband else rows
    best = min(pool, key=lambda r: abs(r[1] - mid))
    return best, bool(inband)

def opt_str(room):
    best, inband = optimal(room)
    return f"{best[0]}{best[2]}", best, inband

def reason(room):
    best, inband = optimal(room)
    lo, hi = band(room['format'])
    f = room['format']
    why = {
        'IMAX': "IMAX screens are tall; sitting back lets the full frame sit in your field of view without craning",
        'IMAX (very large)': "a 6-7 story screen needs the very back of the IMAX band or you will be panning your head to follow the frame",
        '70mm': "70mm is wide rather than tall, so sitting closer preserves the format's immersion without geometric distortion",
        'SCREENX': "the 270-degree side panels only resolve symmetrically on the dead-center axis; this depth lets the side walls sit in your periphery as intended",
        'Dolby Cinema': "Dolby's reference viewing position sits just behind the room's midpoint, where the Atmos bed and the screen geometry both converge",
        'XL': "XL rooms are wide; just behind midpoint keeps the whole screen in view while staying inside the main speaker coverage",
        'PRIME': "PRIME's calibrated audio and screen geometry target just behind the room's midpoint",
        'Standard Laser': "just behind the midpoint is the standard reference position for a conventional room",
        'RealD 3D': "3D separation is cleanest just behind midpoint, where convergence errors at the screen edges are minimised",
    }[f]
    s = (f"Row {best[0]} sits at {best[1]}% depth, inside the {lo}-{hi}% band for {f}, "
         f"and seat {best[2]} is the seat closest to this room's center axis. {why[0].upper() + why[1:]}.")
    if not inband:
        s = (f"No row lands inside the {lo}-{hi}% band in this room (only {len(room['rows'])} rows, "
             f"so depth jumps in large steps). Row {best[0]} at {best[1]}% is the closest available, "
             f"seat {best[2]} is most central. {why[0].upper() + why[1:]}.")
    return s
