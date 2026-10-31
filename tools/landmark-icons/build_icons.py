#!/usr/bin/env python3
"""G-eSAA landmark icons (v2.35.6): the icons of the OpenStreetMap street map (OpenStreetMap Carto) and, where it has none,
Mapbox Maki. Both are public domain (CC0 1.0).

Makes, in vendor/icons/:
  landmarks.js         which icon and colour each kind of place gets (OpenStreetMap / Protomaps kinds and the Geofabrik
                       classes of the road packs), and where each icon is in the picture below
  landmarks.png        all icons in their colours, 32 x 32 px each (the offline map draws them at 16 px)
  landmark-blocks.js   each icon as solid fills (outlines with holes), for the AutoCAD blocks of the plan drawing
  LICENSE-icons.txt    where the icons come from and their licence

Needs: Python 3.8+, and for the picture Playwright with Chromium (pip install playwright).
  git clone --depth 1 https://github.com/gravitystorm/openstreetmap-carto.git
  git clone --depth 1 https://github.com/mapbox/maki.git
  python3 build_icons.py --carto openstreetmap-carto --maki maki --out ../../vendor/icons
"""
import argparse, json, math, os, re, sys, xml.etree.ElementTree as ET

# ---------------------------------------------------------------- the colours (as on openstreetmap.org)
GROUPS = {
    'health': '#BF0000', 'public': '#734A08', 'religion': '#000000', 'transport': '#0092DA',
    'food': '#C77400', 'shop': '#AC39AC', 'leisure': '#1F8A3B', 'other': '#666666',
}
# ---------------------------------------------------------------- kind -> (icon, group). c: = Carto symbols/<path>, m: = Maki icons/<name>
K = {}
def put(group, icon, *kinds):
    for k in kinds: K[k] = (icon, group)
# health
put('health', 'c:amenity/hospital', 'hospital')
put('health', 'c:amenity/doctors', 'clinic', 'doctors', 'health_post', 'healthcare', 'laboratory', 'birthing_centre')
put('health', 'c:amenity/dentist', 'dentist')
put('health', 'c:amenity/pharmacy', 'pharmacy')
put('health', 'c:shop/chemist', 'chemist', 'herbalist', 'nutrition_supplements')
put('health', 'c:amenity/veterinary', 'veterinary')
put('health', 'c:shop/medical_supply', 'medical_supply', 'therapy_device')
put('health', 'c:shop/hearing_aids', 'hearing_aids')
put('health', 'm:blood-bank', 'blood_bank', 'blood_donation')
# public services, money, education
put('public', 'c:amenity/town_hall', 'townhall', 'town_hall', 'administrative', 'public_building', 'government')
put('public', 'c:amenity/police', 'police')
put('public', 'c:amenity/firestation', 'fire_station', 'rescue_station')
put('public', 'c:amenity/post_office', 'post_office')
put('public', 'c:amenity/post_box', 'post_box')
put('public', 'c:amenity/courthouse', 'courthouse')
put('public', 'c:amenity/community_centre', 'community_centre', 'social_centre', 'events_venue', 'conference_centre')
put('public', 'c:amenity/library', 'library')
put('public', 'c:amenity/social_facility', 'social_facility', 'nursing_home')
put('public', 'c:amenity/prison', 'prison')
put('public', 'c:office/embassy', 'embassy')
put('public', 'c:office/consulate', 'consulate')
put('public', 'c:amenity/bank', 'bank')
put('public', 'c:amenity/atm', 'atm')
put('public', 'c:amenity/bureau_de_change', 'bureau_de_change', 'money_transfer', 'payment_centre', 'pawnbroker', 'money_lender')
put('public', 'c:amenity/toilets', 'toilets')
put('public', 'm:school', 'school', 'kindergarten', 'childcare', 'prep_school', 'education', 'language_school', 'music_school',
    'dancing_school', 'driving_school', 'training')
put('public', 'm:college', 'college', 'university')
# religion (a place of worship takes its religion's icon; see RELIGION)
put('religion', 'c:amenity/place_of_worship', 'place_of_worship', 'monastery', 'religious', 'shrine')
put('other', 'm:cemetery', 'cemetery', 'grave_yard', 'graveyard')
# transport, lodging
put('transport', 'c:amenity/fuel', 'fuel')
put('transport', 'c:amenity/parking', 'parking')
put('transport', 'c:amenity/bus_station', 'bus_station', 'terminal')
put('transport', 'c:highway/bus_stop', 'bus_stop')
put('transport', 'c:amenity/taxi', 'taxi', 'taxi_rank')
put('transport', 'c:amenity/car_wash', 'car_wash')
put('transport', 'c:amenity/charging_station', 'charging_station')
put('transport', 'c:amenity/rental_car', 'car_rental', 'rental')
put('transport', 'c:amenity/ferry', 'ferry_terminal')
put('transport', 'c:amenity/aerodrome', 'aerodrome', 'airport')
put('transport', 'c:amenity/vehicle_inspection', 'vehicle_inspection')
put('transport', 'm:rail', 'station', 'railway_station')
put('transport', 'c:amenity/drinking_water', 'drinking_water')
put('transport', 'c:tourism/office', 'information')
put('transport', 'c:tourism/hotel', 'hotel')
put('transport', 'c:tourism/guest_house', 'guest_house', 'guesthouse')
put('transport', 'c:tourism/hostel', 'hostel', 'dormitory', 'Dormitory', 'student_accommodation')
put('transport', 'c:tourism/motel', 'motel')
put('transport', 'c:tourism/apartment', 'apartment')
put('transport', 'c:tourism/camping', 'camp_site')
put('transport', 'c:leisure/beach_resort', 'beach_resort')
# food
put('food', 'c:amenity/restaurant', 'restaurant', 'food_court', 'caterer')
put('food', 'c:amenity/fast_food', 'fast_food')
put('food', 'c:amenity/cafe', 'cafe')
put('food', 'c:amenity/bar', 'bar', 'lounge')
put('food', 'c:amenity/pub', 'pub')
put('food', 'c:amenity/ice_cream', 'ice_cream')
put('food', 'c:amenity/internet_cafe', 'internet_cafe')
put('food', 'c:amenity/nightclub', 'nightclub')
put('food', 'm:karaoke', 'karaoke_box', 'karaoke')
# shops
for k, icon in {
    'convenience': 'convenience', 'supermarket': 'supermarket', 'frozen_food': 'supermarket', 'department_store': 'department_store',
    'mall': 'department_store', 'marketplace': 'marketplace', 'market_place': 'marketplace', 'bakery': 'bakery', 'baking_supplies': 'bakery',
    'pastry': 'confectionery', 'confectionery': 'confectionery', 'chocolate': 'confectionery', 'hardware': 'diy', 'doityourself': 'diy',
    'trade': 'trade', 'wholesale': 'trade', 'metal_construction': 'trade', 'glaziery': 'trade', 'hvac': 'trade', 'roofer': 'trade',
    'plumber': 'trade', 'electrician': 'trade', 'tiles': 'trade', 'plastic': 'trade', 'hydraulic': 'trade', 'locksmith': 'trade',
    'key_cutter': 'trade', 'repair': 'trade', 'car_parts': 'car_parts', 'car_repair': 'car_repair', 'tyres': 'tyres', 'vulcanizing': 'tyres',
    'car': 'car', 'car_dealership': 'car', 'truck': 'car', 'motorcycle': 'motorcycle', 'motorcycle_repair': 'motorcycle_repair',
    'bicycle': 'bicycle', 'bicycle_shop': 'bicycle', 'laundry': 'laundry', 'dry_cleaning': 'laundry', 'beauty': 'beauty', 'beauty_shop': 'beauty',
    'cosmetics': 'perfumery', 'perfumery': 'perfumery', 'hairdresser': 'hairdresser', 'massage': 'massage', 'clothes': 'clothes',
    'fashion': 'clothes', 'boutique': 'clothes', 'tailor': 'clothes', 'fashion_accessories': 'bag', 'bag': 'bag', 'shoes': 'shoes',
    'shoe_shop': 'shoes', 'shoe_repair': 'shoes', 'electronics': 'electronics', 'electronics_repair': 'electronics', 'appliance': 'electronics',
    'electrical': 'electronics', 'lighting': 'electronics', 'hifi': 'hifi', 'computer': 'computer', 'computer_shop': 'computer',
    'printer_ink': 'computer', 'mobile_phone': 'mobile_phone', 'mobile_phone_shop': 'mobile_phone', 'furniture': 'furniture',
    'furniture_shop': 'furniture', 'interior_decoration': 'interior_decoration', 'kitchen': 'houseware', 'houseware': 'houseware',
    'copyshop': 'copyshop', 'printing': 'copyshop', 'bookbinder': 'copyshop', 'stationery': 'stationery', 'books': 'stationery',
    'newsagent': 'newsagent', 'greengrocer': 'greengrocer', 'butcher': 'butcher', 'seafood': 'seafood', 'dairy': 'dairy', 'deli': 'deli',
    'variety_store': 'variety_store', 'jewelry': 'jewelry', 'jeweller': 'jewelry', 'watches': 'jewelry', 'pet': 'pet', 'pet_grooming': 'pet',
    'florist': 'florist', 'garden_centre': 'garden_centre', 'plant_nursery': 'garden_centre', 'gift': 'gift', 'gift_shop': 'gift',
    'party': 'gift', 'toys': 'toys', 'toy_shop': 'toys', 'games': 'video_games', 'video_games': 'video_games', 'travel_agency': 'travel_agency',
    'travel_agent': 'travel_agency', 'paint': 'paint', 'e-cigarette': 'tobacco', 'tobacco': 'tobacco', 'lottery': 'bookmaker',
    'gambling': 'bookmaker', 'bookmaker': 'bookmaker', 'alcohol': 'alcohol', 'wine': 'alcohol', 'beverages': 'beverages', 'tea': 'tea',
    'coffee': 'coffee', 'photo': 'photo', 'photographer': 'photo', 'video': 'video', 'video_shop': 'video', 'music': 'music',
    'musical_instrument': 'musical_instrument', 'sports': 'sports', 'sports_shop': 'sports', 'outdoor': 'outdoor', 'outdoor_shop': 'outdoor',
    'fabric': 'fabric', 'canvas': 'fabric', 'second_hand': 'second_hand', 'charity': 'charity', 'art': 'art', 'frame': 'art', 'craft': 'art',
    'pottery': 'art', 'gallery': 'art', 'collector': 'art', 'ticket': 'ticket', 'optician': 'optician', 'carpet': 'carpet', 'florist_shop': 'florist',
}.items(): K[k] = ('c:shop/' + icon, 'shop')
put('shop', 'm:grocery', 'rice', 'food', 'eggs', 'health_food', 'nuts', 'grocery')
put('shop', 'm:drinking-water', 'water')
put('shop', 'm:farm', 'agrarian', 'agricultural_engines')
put('shop', 'm:shop', 'general', 'yes', 'kiosk', 'gas', 'shop', 'boutique_general')
# leisure, sport, culture
put('leisure', 'm:basketball', 'sports_hall', 'sports_centre')
put('leisure', 'm:pitch', 'pitch')
put('leisure', 'm:stadium', 'stadium')
put('leisure', 'c:leisure/fitness', 'fitness_centre', 'dojo', 'gym')
put('leisure', 'c:leisure/dance', 'dance')
put('leisure', 'c:leisure/playground', 'playground')
put('leisure', 'm:park', 'park', 'recreation_ground')
put('leisure', 'm:garden', 'garden')
put('leisure', 'c:leisure/golf', 'golf_course')
put('leisure', 'm:swimming', 'swimming_pool', 'scuba_diving', 'dive_centre')
put('leisure', 'c:leisure/sauna', 'sauna')
put('leisure', 'c:leisure/bowling_alley', 'bowling_alley')
put('leisure', 'c:leisure/amusement_arcade', 'amusement_arcade')
put('leisure', 'm:zoo', 'zoo')
put('leisure', 'm:horse-riding', 'horse_riding')
put('leisure', 'm:racetrack', 'motorsports')
put('leisure', 'c:amenity/recycling', 'recycling')
put('public', 'c:amenity/theatre', 'theatre')
put('public', 'c:amenity/cinema', 'cinema')
put('public', 'c:amenity/casino', 'casino')
put('public', 'c:amenity/arts_centre', 'arts_centre')
put('public', 'c:tourism/museum', 'museum')
put('public', 'm:attraction', 'attraction')
put('public', 'c:tourism/artwork', 'artwork')
put('public', 'c:historic/memorial', 'memorial')
put('public', 'c:historic/monument', 'monument')
put('transport', 'c:tourism/viewpoint', 'viewpoint')
put('other', 'c:natural/peak', 'peak')
RELIGION = {'christian': 'c:religion/christian', 'muslim': 'c:religion/muslim', 'buddhist': 'c:religion/buddhist', 'taoist': 'c:religion/taoist',
            'hindu': 'c:religion/hinduist', 'jewish': 'c:religion/jewish', 'sikh': 'c:religion/sikhist', 'shinto': 'c:religion/shintoist'}
AREAS = ['residential', 'commercial', 'industrial', 'retail', 'farm', 'farmyard', 'construction', 'military', 'forest', 'place', 'allotments']
SKIP = ['crossing', 'turning_circle', 'traffic_signals', 'tree', 'For Sale', 'unclassified', 'navigationaid']

# ---------------------------------------------------------------- SVG geometry
def mat_mul(a, b):
    return (a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1], a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3], a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5])
I6 = (1, 0, 0, 1, 0, 0)
def parse_transform(t):
    m = I6
    for name, args in re.findall(r'(\w+)\s*\(([^)]*)\)', t or ''):
        v = [float(x) for x in re.findall(r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?', args)]
        if name == 'matrix': n = tuple(v[:6])
        elif name == 'translate': n = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == 'scale': n = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == 'rotate':
            a = math.radians(v[0]); c, s = math.cos(a), math.sin(a); n = (c, s, -s, c, 0, 0)
            if len(v) == 3: n = mat_mul(mat_mul((1, 0, 0, 1, v[1], v[2]), n), (1, 0, 0, 1, -v[1], -v[2]))
        else: raise ValueError('transform ' + name)
        m = mat_mul(m, n)
    return m
def apply(m, p): return (m[0]*p[0] + m[2]*p[1] + m[4], m[1]*p[0] + m[3]*p[1] + m[5])

NUM = re.compile(r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')
SEP = re.compile(r'[\s,]*')
def path_polys(d, tol=0.02):
    """SVG path data -> list of polylines [(x, y), ...] (closed ones end on their start), curves flattened (tolerance in icon units).
    Read character by character: arc flags may be glued to what follows ("a1 1 0 01-1 1")."""
    pos = 0; n = len(d); polys = []; cur = []; x = y = 0.0; sx = sy = 0.0; cmd = None; lc = None; lq = None
    def skip():
        nonlocal pos; pos = SEP.match(d, pos).end()
    def at_number():
        skip(); return pos < n and (d[pos].isdigit() or d[pos] in '+-.')
    def num():
        nonlocal pos; skip(); m = NUM.match(d, pos)
        if not m: raise ValueError('number expected at %d in %r' % (pos, d[max(0, pos - 10):pos + 10]))
        pos = m.end(); return float(m.group(0))
    def flag():
        nonlocal pos; skip()
        if pos < n and d[pos] in '01': pos += 1; return int(d[pos - 1])
        raise ValueError('arc flag expected')
    def cubic(p0, p1, p2, p3):
        k = max(2, min(64, int(math.ceil(math.sqrt((math.dist(p0, p1) + math.dist(p1, p2) + math.dist(p2, p3)) / tol / 2)))))
        out = []
        for j in range(1, k + 1):
            t = j / k; u = 1 - t
            out.append((u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]))
        return out
    def arc(p0, rx, ry, phi, fa, fs, p1):
        if rx == 0 or ry == 0 or p0 == p1: return [p1]
        rx, ry = abs(rx), abs(ry); ph = math.radians(phi); c, s_ = math.cos(ph), math.sin(ph)
        dx, dy = (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2; x1, y1 = c*dx + s_*dy, -s_*dx + c*dy
        lam = x1*x1/(rx*rx) + y1*y1/(ry*ry)
        if lam > 1: r = math.sqrt(lam); rx *= r; ry *= r
        nu = rx*rx*ry*ry - rx*rx*y1*y1 - ry*ry*x1*x1; de = rx*rx*y1*y1 + ry*ry*x1*x1
        co = math.sqrt(max(0, nu / de)) * (-1 if fa == fs else 1)
        cx1, cy1 = co*rx*y1/ry, -co*ry*x1/rx
        cx, cy = c*cx1 - s_*cy1 + (p0[0] + p1[0]) / 2, s_*cx1 + c*cy1 + (p0[1] + p1[1]) / 2
        ang = lambda ux, uy, vx, vy: math.atan2(ux*vy - uy*vx, ux*vx + uy*vy)
        t1 = ang(1, 0, (x1 - cx1)/rx, (y1 - cy1)/ry); dt = ang((x1 - cx1)/rx, (y1 - cy1)/ry, (-x1 - cx1)/rx, (-y1 - cy1)/ry)
        if not fs and dt > 0: dt -= 2*math.pi
        elif fs and dt < 0: dt += 2*math.pi
        k = max(4, min(96, int(math.ceil(abs(dt) * math.sqrt(max(rx, ry) / tol) / 2))))
        out = []
        for j in range(1, k + 1):
            t = t1 + dt * j / k; ex, ey = rx*math.cos(t), ry*math.sin(t)
            out.append((c*ex - s_*ey + cx, s_*ex + c*ey + cy))
        out[-1] = p1
        return out
    while True:
        skip()
        if pos >= n: break
        if d[pos].isalpha(): cmd = d[pos]; pos += 1
        elif cmd is None: raise ValueError('path starts with a number')
        rel = cmd.islower(); C = cmd.upper()
        if C == 'Z':
            if cur: cur.append(cur[0]); polys.append(cur); cur = []
            x, y = sx, sy; lc = lq = None
            if at_number(): cmd = 'l' if rel else 'L'  # (not valid SVG, but harmless)
            continue
        if C == 'M':
            if cur: polys.append(cur)
            nx, ny = num(), num()
            if rel: nx += x; ny += y
            x, y = sx, sy = nx, ny; cur = [(x, y)]; cmd = 'l' if rel else 'L'; lc = lq = None; continue
        if not cur: cur = [(x, y)]
        if C == 'L':
            nx, ny = num(), num()
            if rel: nx += x; ny += y
            x, y = nx, ny; cur.append((x, y)); lc = lq = None
        elif C == 'H':
            v = num(); x = v + x if rel else v; cur.append((x, y)); lc = lq = None
        elif C == 'V':
            v = num(); y = v + y if rel else v; cur.append((x, y)); lc = lq = None
        elif C in 'CS':
            if C == 'C': x1, y1 = num(), num()
            x2, y2, nx, ny = num(), num(), num(), num()
            if rel:
                if C == 'C': x1 += x; y1 += y
                x2 += x; y2 += y; nx += x; ny += y
            if C == 'S': x1, y1 = (2*x - lc[0], 2*y - lc[1]) if lc else (x, y)
            cur += cubic((x, y), (x1, y1), (x2, y2), (nx, ny)); lc = (x2, y2); lq = None; x, y = nx, ny
        elif C in 'QT':
            if C == 'Q':
                qx, qy = num(), num()
                if rel: qx += x; qy += y
            else: qx, qy = (2*x - lq[0], 2*y - lq[1]) if lq else (x, y)
            nx, ny = num(), num()
            if rel: nx += x; ny += y
            cur += cubic((x, y), (x + 2/3*(qx - x), y + 2/3*(qy - y)), (nx + 2/3*(qx - nx), ny + 2/3*(qy - ny)), (nx, ny)); lq = (qx, qy); lc = None; x, y = nx, ny
        elif C == 'A':
            rx, ry, phi = num(), num(), num(); fa = flag(); fs = flag(); nx, ny = num(), num()
            if rel: nx += x; ny += y
            cur += arc((x, y), rx, ry, phi, fa, fs, (nx, ny)); x, y = nx, ny; lc = lq = None
        else: raise ValueError('command ' + cmd)
    if cur: polys.append(cur)
    return polys

def area(p): return sum(p[k][0]*p[k+1][1] - p[k+1][0]*p[k][1] for k in range(len(p) - 1)) / 2
def inside(pt, poly):
    x, y = pt; c = False
    for k in range(len(poly) - 1):
        (x1, y1), (x2, y2) = poly[k], poly[k + 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def winding(pt, poly):
    x, y = pt; w = 0
    for k in range(len(poly) - 1):
        (x1, y1), (x2, y2) = poly[k], poly[k + 1]
        if y1 <= y < y2 and (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0: w += 1
        elif y2 <= y < y1 and (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0: w -= 1
    return w
def probe(poly):
    """A point just inside a loop, on its left (positive area) or right side."""
    a = area(poly); sgn = 1 if a > 0 else -1
    best = None
    for k in range(len(poly) - 1):
        (x1, y1), (x2, y2) = poly[k], poly[k + 1]; L = math.hypot(x2 - x1, y2 - y1)
        if L < 1e-6: continue
        if best is None or L > best[0]: best = (L, k)
    L, k = best; (x1, y1), (x2, y2) = poly[k], poly[k + 1]
    nx, ny = -(y2 - y1) / L * sgn, (x2 - x1) / L * sgn  # toward the inside
    return ((x1 + x2) / 2 + nx * 0.01, (y1 + y2) / 2 + ny * 0.01)
def regions(loops, rule):
    """Loops of one shape -> filled regions [(outer, [holes])] by the shape's fill rule (nonzero or evenodd)."""
    loops = [l if l[0] == l[-1] else l + [l[0]] for l in loops if len(l) >= 3]
    loops = [l for l in loops if abs(area(l)) > 1e-4]
    filled = []
    for L in loops:
        p = probe(L)
        inner = sum(winding(p, M) for M in loops) if rule != 'evenodd' else sum(1 for M in loops if inside(p, M))
        # the side of L just inside: is it filled? (and just outside it)
        filled.append((inner % 2 == 1) if rule == 'evenodd' else inner != 0)
    # each filled loop is an outer boundary; holes = loops directly inside it that are not filled
    out = []
    for i, L in enumerate(loops):
        if not filled[i]: continue
        holes = []
        for j, M in enumerate(loops):
            if i == j or filled[j]: continue
            if inside(M[0], L) and abs(area(M)) < abs(area(L)):
                # directly inside L: no other filled loop between them
                if not any(k != i and filled[k] and inside(M[0], loops[k]) and inside(loops[k][0], L) for k in range(len(loops))):
                    holes.append(M)
        out.append((L, holes))
    return out

def color_of(el, parent_fill):
    st = dict(re.findall(r'([\w-]+)\s*:\s*([^;]+)', el.get('style', '')))
    f = st.get('fill', el.get('fill', parent_fill))
    op = float(st.get('opacity', el.get('opacity', st.get('fill-opacity', el.get('fill-opacity', '1')))))
    rule = st.get('fill-rule', el.get('fill-rule', 'nonzero'))
    return f, op, rule

def shapes(svgfile):
    """The filled shapes of an icon: [(fill, opacity, rule, loops)] in the icon's units, and its size."""
    t = ET.parse(svgfile); root = t.getroot(); ns = '{http://www.w3.org/2000/svg}'
    vb = [float(v) for v in NUM.findall(root.get('viewBox', ''))] or [0, 0, float(root.get('width')), float(root.get('height'))]
    out = []
    def walk(el, m, fill):
        tag = el.tag.replace(ns, '')
        if tag in ('defs', 'clipPath', 'metadata', 'title', 'desc', 'mask'): return
        m = mat_mul(m, parse_transform(el.get('transform')))
        f, op, rule = color_of(el, fill)
        loops = None
        if tag == 'path': loops = path_polys(el.get('d', ''))
        elif tag == 'rect':
            x, y, w, h = (float(el.get(a, 0)) for a in ('x', 'y', 'width', 'height')); rx = float(el.get('rx', el.get('ry', 0)) or 0); ry = float(el.get('ry', rx) or rx)
            if rx or ry:
                rx = min(rx, w / 2); ry = min(ry, h / 2)
                d = f'M{x+rx},{y} H{x+w-rx} A{rx},{ry} 0 0 1 {x+w},{y+ry} V{y+h-ry} A{rx},{ry} 0 0 1 {x+w-rx},{y+h} H{x+rx} A{rx},{ry} 0 0 1 {x},{y+h-ry} V{y+ry} A{rx},{ry} 0 0 1 {x+rx},{y} Z'
            else: d = f'M{x},{y} H{x+w} V{y+h} H{x} Z'
            loops = path_polys(d)
        elif tag in ('circle', 'ellipse'):
            cx, cy = float(el.get('cx', 0)), float(el.get('cy', 0)); rx = float(el.get('r', el.get('rx', 0))); ry = float(el.get('r', el.get('ry', rx)))
            loops = path_polys(f'M{cx-rx},{cy} A{rx},{ry} 0 1 0 {cx+rx},{cy} A{rx},{ry} 0 1 0 {cx-rx},{cy} Z')
        elif tag in ('polygon', 'polyline'):
            v = [float(a) for a in NUM.findall(el.get('points', ''))]; pts = list(zip(v[0::2], v[1::2])); loops = [pts + [pts[0]]]
        if loops is not None and f not in ('none', 'transparent') and op > 0.01:
            out.append((f, op, rule, [[apply(m, p) for p in l] for l in loops]))
        for ch in el: walk(ch, m, f)
    walk(root, (1, 0, 0, 1, -vb[0], -vb[1]), None)
    return out, vb[2], vb[3]

def is_white(f): return str(f).lower() in ('#fff', '#ffffff', 'white')
CARTO_INK = ('#0092da', '#ac39ac', '#734a08', '#bf0000', '#c77400')
def is_ink(f):
    """The icon's own colour (black, near black or a street-map category colour): it takes the category colour."""
    f = str(f or '').strip().lower()
    if f in ('', 'none', 'black', 'currentcolor') or f in CARTO_INK: return f != 'none'
    m = re.fullmatch(r'#([0-9a-f]{3}|[0-9a-f]{6})', f)
    if not m: return True
    h = m.group(1); h = ''.join(c * 2 for c in h) if len(h) == 3 else h
    return max(int(h[i:i + 2], 16) for i in (0, 2, 4)) < 0x50
def hatches(svgfile, color):
    """Solid fills for an AutoCAD block: [{c, loops}] painted in order; white shapes become holes in what they cover."""
    sh, w, h = shapes(svgfile)
    out = []
    for f, op, rule, loops in sh:
        regs = regions(loops, rule)
        if is_white(f):  # cut it out of the colour fills under it (a white symbol on a coloured badge)
            for outer, holes in regs:
                for hh in out:
                    if hh['c'] != '#FFFFFF' and any(inside(outer[0], L) for L in hh['loops'][:1]):
                        hh['loops'] += [outer] + holes
            continue
        c = color if (f is None or is_ink(f)) else f.upper()
        if op < 0.99:  # a faded part: its colour mixed with white
            cc = int(c[1:], 16); r, g, b = cc >> 16, (cc >> 8) & 255, cc & 255
            c = '#%02X%02X%02X' % tuple(round(v * op + 255 * (1 - op)) for v in (r, g, b))
        for outer, holes in regs: out.append({'c': c, 'loops': [outer] + holes})
    return out, w, h

def simplify(L, tol=0.025):
    """Douglas-Peucker on a closed loop (first == last), in icon units."""
    if len(L) < 5: return L
    def rdp(pts):
        a, b = pts[0], pts[-1]; dx, dy = b[0] - a[0], b[1] - a[1]; dd = math.hypot(dx, dy)
        best, bi = -1, 0
        for i in range(1, len(pts) - 1):
            p = pts[i]
            d = abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / dd if dd > 1e-9 else math.hypot(p[0] - a[0], p[1] - a[1])
            if d > best: best, bi = d, i
        if best <= tol: return [a, b]
        return rdp(pts[:bi + 1])[:-1] + rdp(pts[bi:])
    far = max(range(len(L)), key=lambda i: math.dist(L[0], L[i]))
    out = rdp(L[:far + 1])[:-1] + rdp(L[far:])
    return out if len(out) >= 4 else L
def raster(hs, w, h, S=64):
    """Paint the fills (odd-even per fill, as an AutoCAD hatch) to a mask, for checking against the original."""
    from PIL import Image, ImageDraw
    im = Image.new('L', (S, S), 0)
    for hh in hs:
        m = Image.new('1', (S, S), 0); dr = ImageDraw.Draw(m)
        for L in hh['loops']:
            lm = Image.new('1', (S, S), 0); ImageDraw.Draw(lm).polygon([(x / w * S, y / h * S) for x, y in L], fill=1)
            m = Image.fromarray(__import__('numpy').logical_xor(__import__('numpy').array(m), __import__('numpy').array(lm)))
        im.paste(255, mask=m)
    return im

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--carto', required=True); ap.add_argument('--maki', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--no-atlas', action='store_true'); a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    def path_of(ref): return os.path.join(a.carto, 'symbols', ref[2:] + '.svg') if ref.startswith('c:') else os.path.join(a.maki, 'icons', ref[2:] + '.svg')
    used = {}
    for k, (ref, g) in K.items(): used.setdefault(ref, g)
    for r in RELIGION.values(): used.setdefault(r, 'religion')
    missing = [r for r in used if not os.path.exists(path_of(r))]
    if missing: sys.exit('missing icons: %s' % missing)
    ids = sorted(used); idx = {r: i for i, r in enumerate(ids)}
    blocks = {}; report = []
    for r in ids:
        hs, w, h = hatches(path_of(r), GROUPS[used[r]])
        q = lambda v: round(v, 2)
        blocks[r] = {'w': w, 'h': h, 'f': [{'c': hh['c'], 'l': [[q(c) for p in simplify(L)[:-1] for c in p] for L in hh['loops']]} for hh in hs]}  # the closing point left out
    kinds = {k: [idx[ref], g] for k, (ref, g) in K.items()}
    rel = {k: idx[v] for k, v in RELIGION.items()}
    icons = [{'ref': r, 'g': used[r]} for r in ids]
    js = ('/* G-eSAA landmark icons (tools/landmark-icons/build_icons.py): OpenStreetMap Carto and Mapbox Maki icons, both CC0 1.0 (public domain).\n'
          '   kinds: kind -> [icon index, colour group]; icon i is cell i of landmarks.png (32 px cells, COLS per row). */\n'
          'self.GESAA_LANDMARKS = ' + json.dumps({'cols': 16, 'cell': 32, 'groups': GROUPS, 'icons': icons, 'kinds': kinds, 'religion': rel,
                                                    'areas': AREAS, 'skip': SKIP}, separators=(',', ':')) + ';\n')
    open(os.path.join(a.out, 'landmarks.js'), 'w').write(js)
    bjs = ('/* G-eSAA landmark icons as solid fills for the AutoCAD blocks (tools/landmark-icons/build_icons.py). Icon units, y down;\n'
           '   each fill: colour and loops (the first the outline, the next its holes, filled odd-even like a hatch). CC0 1.0. */\n'
           'self.GESAA_LANDMARK_BLOCKS = ' + json.dumps([blocks[r] for r in ids], separators=(',', ':')) + ';\n')
    open(os.path.join(a.out, 'landmark-blocks.js'), 'w').write(bjs)
    open(os.path.join(a.out, 'LICENSE-icons.txt'), 'w').write(
        'Landmark icons of G-eSAA (landmarks.png, landmark-blocks.js)\n\n'
        'OpenStreetMap Carto symbols, https://github.com/gravitystorm/openstreetmap-carto (symbols/): CC0 1.0 Universal.\n'
        'Mapbox Maki icons, https://github.com/mapbox/maki (icons/): CC0 1.0 Universal.\n'
        'https://creativecommons.org/publicdomain/zero/1.0/\n\nIcons used:\n' + ''.join(f'  {i:3d} {r}\n' for i, r in enumerate(ids)))
    if not a.no_atlas: atlas(ids, used, path_of, os.path.join(a.out, 'landmarks.png'))
    print(len(ids), 'icons;', len(kinds), 'kinds;', 'js', os.path.getsize(os.path.join(a.out, 'landmarks.js')), 'blocks', os.path.getsize(os.path.join(a.out, 'landmark-blocks.js')))
    return ids, used, path_of, blocks

def svg_colored(path, color):
    s = open(path).read(); s = re.sub(r'<\?xml[^>]*\?>', '', s)
    s = re.sub(r'fill="([^"]*)"', lambda m: f'fill="{color}"' if m.group(1).lower() != 'none' and is_ink(m.group(1)) else m.group(0), s)
    s = re.sub(r'fill:\s*([^;"]+)', lambda m: f'fill:{color}' if m.group(1).strip().lower() != 'none' and is_ink(m.group(1)) else m.group(0), s)
    return re.sub(r'<svg\b', f'<svg fill="{color}"', s, count=1)
def atlas(ids, used, path_of, out):
    import asyncio
    from playwright.async_api import async_playwright
    cols, cell = 16, 32; rows = (len(ids) + cols - 1) // cols
    cells = ''.join(f'<div style="position:absolute;left:{(i % cols) * cell}px;top:{(i // cols) * cell}px;width:{cell}px;height:{cell}px">'
                    + re.sub(r'<svg\b([^>]*)>', lambda m: '<svg' + re.sub(r'\s(width|height)="[^"]*"', '', m.group(1)) + f' width="{cell}" height="{cell}">', svg_colored(path_of(r), GROUPS[used[r]]), count=1) + '</div>'
                    for i, r in enumerate(ids))
    page = f'<!doctype html><html><body style="margin:0;background:transparent"><div style="position:relative;width:{cols*cell}px;height:{rows*cell}px">{cells}</div></body></html>'
    async def run():
        async with async_playwright() as p:
            exe = os.environ.get('CHROME')
            b = await p.chromium.launch(**({'executable_path': exe} if exe else {}))
            pg = await b.new_page(viewport={'width': cols * cell, 'height': rows * cell}, device_scale_factor=1)
            await pg.set_content(page); await pg.wait_for_timeout(300)
            await pg.screenshot(path=out, omit_background=True, clip={'x': 0, 'y': 0, 'width': cols * cell, 'height': rows * cell}); await b.close()
    asyncio.run(run())

if __name__ == '__main__':
    main()
