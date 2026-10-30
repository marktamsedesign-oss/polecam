#!/usr/bin/env python3
"""G-eSAA road packs: OpenStreetMap roads, landmarks and boundaries for the plan DXF, one file per region.

Source: the Geofabrik "free" shapefile of the Philippines (philippines-YYMMDD-free.shp.zip, or the folder it was
unzipped into): gis_osm_roads_free_1, gis_osm_pois(_a), gis_osm_pofw(_a), gis_osm_transport(_a), gis_osm_adminareas_a.
Optional: a barangay boundary shapefile (e.g. PSA/NAMRIA from HDX) with barangay, city/municipality and province names,
which replaces the OpenStreetMap barangays (OpenStreetMap has only part of them).

    python3 make_road_packs.py SOURCE [--out FOLDER] [--barangays FILE.shp|FILE.zip] [--regions "Davao Region,..."]

Only the Python standard library is needed (Python 3.8 or newer). A whole-country run takes a few minutes. The packs are
written to --out (default: a folder "G-eSAA road packs" beside SOURCE) with packs.txt, the lines to paste in G-eSAA:
Settings -> Administration -> Offline map packs (after uploading the files to Google Drive).

--time-limit SECONDS stops after that long and saves its progress; run the same command again to go on.

The data is OpenStreetMap (c) OpenStreetMap contributors, ODbL 1.0. Keep that credit with the packs.
"""
import argparse, gzip, json, math, os, re, struct, sys, time, zipfile

MAGIC = b'GESAARP1'
CELL = 0.05      # degrees: road and landmark tiles (about 5.5 km)
ACELL = 0.25     # degrees: barangay tiles
GRID = 0.02      # degrees: the region lookup grid
GX0, GY0, GX1, GY1 = 112.0, 4.4, 127.2, 21.4   # the Philippines, with sea round it
LEVELS = {4: 'province', 6: 'city/municipality', 10: 'barangay'}
TRANSPORT_KEEP = {'railway_station', 'railway_halt', 'tram_stop', 'bus_station', 'ferry_terminal', 'airport', 'airfield', 'helipad'}
BATCH = 100000

def log(*a):
    print(*a, flush=True)

# ---------------------------------------------------------------- reading shapefiles (zip or folder)
class Source:
    def __init__(self, path):
        self.path = path; self.zip = None; self.names = {}
        if os.path.isdir(path):
            for n in os.listdir(path): self.names[n.lower()] = os.path.join(path, n)
        elif zipfile.is_zipfile(path):
            self.zip = zipfile.ZipFile(path)
            for n in self.zip.namelist(): self.names[os.path.basename(n).lower()] = n
        else:
            d, b = os.path.split(path)       # a .shp given directly: its folder, that layer
            for n in os.listdir(d or '.'): self.names[n.lower()] = os.path.join(d or '.', n)
    def has(self, name): return name.lower() in self.names
    def open(self, name):
        p = self.names[name.lower()]
        return self.zip.open(p) if self.zip else open(p, 'rb')
    def read(self, name):
        with self.open(name) as f: return f.read()
    def layers(self):
        return sorted({n[:-4] for n in self.names if n.endswith('.shp')})

class Layer:
    """A shapefile layer: records read in order (or from a record number on), with the fields asked for."""
    def __init__(self, src, base):
        self.src, self.base = src, base
        self.shx = src.read(base + '.shx')
        self.n = (len(self.shx) - 100) // 8
        dbf = src.open(base + '.dbf'); h = dbf.read(32); dbf.close()
        self.nrec, self.hlen, self.rlen = struct.unpack('<IHH', h[4:12])
        with src.open(base + '.dbf') as f:
            raw = f.read(self.hlen)
        self.fields = []; o = 32; pos = 1
        while raw[o] != 0x0D:
            name = raw[o:o + 11].split(b'\0')[0].decode('latin-1'); ln = raw[o + 16]
            self.fields.append((name, pos, ln)); pos += ln; o += 32
        cpg = (base + '.cpg')
        self.enc = 'utf-8'
        if src.has(cpg):
            c = src.read(cpg).decode('latin-1').strip().lower()
            if c and c not in ('utf-8', 'utf8', '65001'): self.enc = {'1252': 'cp1252', 'ansi 1252': 'cp1252'}.get(c, c)
        prj = base + '.prj'
        self.prj = src.read(prj).decode('latin-1') if src.has(prj) else ''
    def field(self, *names):
        low = {f[0].lower(): f[0] for f in self.fields}
        for n in names:
            if n.lower() in low: return low[n.lower()]
        return None
    def records(self, want, start=0, stop=None):
        """Yields (i, shapetype, parts, attrs): parts = list of point lists [(x, y), ...]."""
        stop = self.n if stop is None else min(stop, self.n)
        if start >= stop: return
        off0 = struct.unpack('>i', self.shx[100 + 8 * start:104 + 8 * start])[0] * 2
        shp = self.src.open(self.base + '.shp'); dbf = self.src.open(self.base + '.dbf')
        try:
            _skip(shp, off0); _skip(dbf, self.hlen + start * self.rlen)
            fl = [(n, p, l) for n, p, l in self.fields if n in want]
            for i in range(start, stop):
                hdr = shp.read(8); clen = struct.unpack('>i', hdr[4:8])[0] * 2; c = shp.read(clen)
                rec = dbf.read(self.rlen)
                at = {n: rec[p:p + l].decode(self.enc, 'replace').strip() for n, p, l in fl}
                st = struct.unpack_from('<i', c, 0)[0]
                if st in (3, 5, 13, 15, 23, 25):
                    npar, npt = struct.unpack_from('<ii', c, 36)
                    pidx = struct.unpack_from('<%di' % npar, c, 44) + (npt,)
                    xy = struct.unpack_from('<%dd' % (2 * npt), c, 44 + 4 * npar)
                    parts = [list(zip(xy[2 * pidx[k]:2 * pidx[k + 1]:2], xy[2 * pidx[k] + 1:2 * pidx[k + 1]:2])) for k in range(npar)]
                elif st in (1, 11, 21):
                    parts = [[struct.unpack_from('<dd', c, 4)]]
                else:
                    parts = []
                yield i, st, parts, at
        finally:
            shp.close(); dbf.close()

def _skip(f, n):
    try: f.seek(n)
    except Exception:
        while n > 0: b = f.read(min(n, 1 << 20)); n -= len(b)

# ---------------------------------------------------------------- geometry
def scan_fill(grid, nx, ny, parts, val, x0=GX0, y0=GY0, g=GRID):
    """Sets grid cells whose centre is inside the polygon (even-odd over all rings) to val."""
    rows = {}
    for ring in parts:
        n = len(ring)
        for k in range(n):
            ax, ay = ring[k]; bx, by = ring[(k + 1) % n]
            if ay == by: continue
            lo, hi = (ay, by) if ay < by else (by, ay)
            j0 = max(0, int(math.ceil((lo - y0) / g - 0.5))); j1 = min(ny - 1, int(math.floor((hi - y0) / g - 0.5)))
            for j in range(j0, j1 + 1):
                yc = y0 + (j + 0.5) * g
                if lo <= yc < hi: rows.setdefault(j, []).append(ax + (yc - ay) * (bx - ax) / (by - ay))
    for j, xs in rows.items():
        xs.sort(); base = j * nx
        for k in range(0, len(xs) - 1, 2):
            i0 = max(0, int(math.ceil((xs[k] - x0) / g - 0.5))); i1 = min(nx - 1, int(math.floor((xs[k + 1] - x0) / g - 0.5)))
            for i in range(i0, i1 + 1): grid[base + i] = val

def grow(grid, nx, ny, steps):
    """Gives empty cells (sea, gaps) the value of a neighbour, for a few steps: roads on the coast keep their region."""
    for _ in range(steps):
        new = grid[:]; changed = False
        for j in range(ny):
            b = j * nx
            for i in range(nx):
                if grid[b + i] >= 0: continue
                for v in ((grid[b + i - 1] if i > 0 else -1), (grid[b + i + 1] if i < nx - 1 else -1), (grid[b + i - nx] if j > 0 else -1), (grid[b + i + nx] if j < ny - 1 else -1)):
                    if v >= 0: new[b + i] = v; changed = True; break
        grid[:] = new
        if not changed: break

def dp(pts, tol):
    """Douglas-Peucker simplification of one ring (degrees)."""
    n = len(pts)
    if n < 5 or tol <= 0: return pts
    keep = [False] * n; keep[0] = keep[-1] = True; stack = [(0, n - 1)]; t2 = tol * tol
    while stack:
        a, b = stack.pop(); ax, ay = pts[a]; bx, by = pts[b]; dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy
        best, bi = -1.0, -1
        for k in range(a + 1, b):
            px, py = pts[k]
            if L == 0: d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / L; t = 0 if t < 0 else 1 if t > 1 else t
                d = (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2
            if d > best: best, bi = d, k
        if bi >= 0 and best > t2: keep[bi] = True; stack += [(a, bi), (bi, b)]
    out = [p for p, k in zip(pts, keep) if k]
    return out if len(out) >= 4 else pts

def enc_line(pts):
    """[x0, y0, dx1, dy1, ...] in millionths of a degree."""
    out = []; px = py = 0
    for x, y in pts:
        xi, yi = round(x * 1e6), round(y * 1e6)
        out.append(xi - px); out.append(yi - py); px, py = xi, yi
    return out

def jstr(s): return json.dumps(s, ensure_ascii=False)

# ---------------------------------------------------------------- the run
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source'); ap.add_argument('--out'); ap.add_argument('--work')
    ap.add_argument('--barangays', help='barangay boundaries (shapefile or zip) with barangay / city-municipality / province names')
    ap.add_argument('--barangay-field'); ap.add_argument('--municipality-field'); ap.add_argument('--province-field')
    ap.add_argument('--regions', help='only these regions (comma separated names as in the boundaries)')
    ap.add_argument('--date', help='data date YYYY-MM-DD (read from the Geofabrik README otherwise)')
    ap.add_argument('--time-limit', type=float, default=0, help='stop after this many seconds and save the progress (run again to go on)')
    a = ap.parse_args()
    T0 = time.time(); src = Source(a.source)
    if not src.has('gis_osm_roads_free_1.shp'): sys.exit('No gis_osm_roads_free_1.shp in %s: give the Geofabrik .shp.zip or the folder it was unzipped into.' % a.source)
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.source.rstrip('/'))), 'G-eSAA road packs')
    work = a.work or os.path.join(out, '_work'); os.makedirs(out, exist_ok=True); os.makedirs(work, exist_ok=True)
    date = a.date
    if not date and src.has('README'):
        m = re.search(r'as of (\d{4}-\d{2}-\d{2})', src.read('README').decode('utf-8', 'replace')); date = m and m.group(1)
    if not date:
        m = re.search(r'(\d{2})(\d{2})(\d{2})-free', os.path.basename(a.source)); date = m and '20%s-%s-%s' % m.groups()
    date = date or time.strftime('%Y-%m-%d')
    stf = os.path.join(work, 'state.json')
    state = json.load(open(stf)) if os.path.exists(stf) else {}
    if state.get('source') not in (None, os.path.abspath(a.source)) or state.get('barangays', '') != (a.barangays or '') or state.get('regions', '') != (a.regions or ''):
        state = {}
    state.update(source=os.path.abspath(a.source), barangays=a.barangays or '', regions=a.regions or '', date=date)
    def save():
        json.dump(state, open(stf + '.tmp', 'w')); os.replace(stf + '.tmp', stf)
    def out_of_time():
        return a.time_limit and time.time() - T0 > a.time_limit

    nx, ny = int((GX1 - GX0) / GRID), int((GY1 - GY0) / GRID)
    # 1. regions, provinces, cities / municipalities and barangays (OpenStreetMap)
    adm = Layer(src, 'gis_osm_adminareas_a_free_1') if src.has('gis_osm_adminareas_a_free_1.shp') else None
    if not adm: sys.exit('No gis_osm_adminareas_a_free_1 in the source: the regions cannot be found.')
    gfile = os.path.join(work, 'regions.json')
    if not os.path.exists(gfile):
        regions = []; grid = [-1] * (nx * ny)
        for i, st, parts, at in adm.records({'fclass', 'name'}):
            if at['fclass'] == 'admin_level3' and parts:
                regions.append({'name': at['name'], 'bbox': [min(x for r in parts for x, y in r), min(y for r in parts for x, y in r), max(x for r in parts for x, y in r), max(y for r in parts for x, y in r)]})
                scan_fill(grid, nx, ny, parts, len(regions) - 1)
        grow(grid, nx, ny, 25)
        json.dump({'regions': regions, 'grid': grid}, open(gfile, 'w'))
        log('regions: %d (%.0f s)' % (len(regions), time.time() - T0))
    G = json.load(open(gfile)); regions, grid = G['regions'], G['grid']
    want = [r['name'] for r in regions]
    if a.regions:
        ask = [s.strip().lower() for s in a.regions.split(',') if s.strip()]
        want = [r['name'] for r in regions if r['name'].lower() in ask]
        if not want: sys.exit('No region named %s. Regions: %s' % (a.regions, ', '.join(r['name'] for r in regions)))
    wanted = {k for k, r in enumerate(regions) if r['name'] in want}
    def reg_of(x, y):
        i, j = int((x - GX0) / GRID), int((y - GY0) / GRID)
        return grid[j * nx + i] if 0 <= i < nx and 0 <= j < ny else -1
    files = {}
    def tmp(k, kind):
        key = (k, kind)
        if key not in files: files[key] = open(os.path.join(work, '%d.%s' % (k, kind)), 'a', encoding='utf-8')
        return files[key]
    def checkpoint():
        for f in files.values(): f.flush()
        state.setdefault('sizes', {}).update({'%d.%s' % k: f.tell() for k, f in files.items()}); save()
    def restore():  # cut what an interrupted round wrote after its last checkpoint
        for name, size in (state.get('sizes') or {}).items():
            p = os.path.join(work, name)
            if os.path.exists(p) and os.path.getsize(p) > size:
                with open(p, 'r+b') as f: f.truncate(size)
        for n in os.listdir(work):
            if re.match(r'^\d+\.[rpa]$', n) and n not in (state.get('sizes') or {}): os.remove(os.path.join(work, n))
    restore()

    # 2. roads: every road goes to each region and tile it passes through
    roads = Layer(src, 'gis_osm_roads_free_1'); pos = state.get('roads', 0)
    while pos < roads.n:
        if out_of_time(): checkpoint(); log('stopped at road %d of %d: run the same command again to go on' % (pos, roads.n)); return
        end = min(roads.n, pos + BATCH)
        for i, st, parts, at in roads.records({'fclass', 'name', 'bridge', 'tunnel'}, pos, end):
            for line in parts:
                if len(line) < 2: continue
                step = max(1, len(line) // 12); ks = {reg_of(*line[k]) for k in range(0, len(line), step)} | {reg_of(*line[-1])}
                ks = [k for k in ks if k in wanted]
                if not ks: continue
                xs = [p[0] for p in line]; ys = [p[1] for p in line]
                fr = '[%d,%s,%s,%d,%s]' % (i, jstr(at['fclass']), jstr(at['name']), (at['bridge'] == 'T') | ((at['tunnel'] == 'T') << 1), ','.join(map(str, enc_line(line))))
                tiles = ['%d,%d' % (tx, ty) for tx in range(math.floor(min(xs) / CELL), math.floor(max(xs) / CELL) + 1) for ty in range(math.floor(min(ys) / CELL), math.floor(max(ys) / CELL) + 1)]
                for k in ks:
                    f = tmp(k, 'r')
                    for t in tiles: f.write(t + '\t' + fr + '\n')
        pos = end; state['roads'] = pos; checkpoint()
        log('roads %d of %d (%.0f s)' % (pos, roads.n, time.time() - T0))

    # 3. landmarks: named shops, schools, churches, stations… (points, or the middle of an area)
    lays = [l for l in ('gis_osm_pois_free_1', 'gis_osm_pois_a_free_1', 'gis_osm_pofw_free_1', 'gis_osm_pofw_a_free_1', 'gis_osm_transport_free_1', 'gis_osm_transport_a_free_1') if src.has(l + '.shp')]
    done = state.setdefault('pois', {})
    for l in lays:
        if done.get(l) == 'done': continue
        if out_of_time(): checkpoint(); log('stopped before %s: run the same command again to go on' % l); return
        for i, st, parts, at in Layer(src, l).records({'fclass', 'name'}):
            if not parts or not at['name'] or ('transport' in l and at['fclass'] not in TRANSPORT_KEEP): continue
            ring = parts[0]
            if not ring: continue
            x = sum(p[0] for p in ring) / len(ring); y = sum(p[1] for p in ring) / len(ring)
            k = reg_of(x, y)
            if k in wanted: tmp(k, 'p').write('%d,%d\t[%s,%s,%d,%d]\n' % (math.floor(x / CELL), math.floor(y / CELL), jstr(at['fclass']), jstr(at['name']), round(x * 1e6), round(y * 1e6)))
        done[l] = 'done'; checkpoint(); log('%s (%.0f s)' % (l, time.time() - T0))

    # 4. boundaries: provinces and cities / municipalities from OpenStreetMap; barangays from OpenStreetMap or the given file
    if state.get('admin') != 'done':
        def put(level, name, muni, prov, parts, tol):
            rings = [dp(r, tol) for r in parts if len(r) >= 4]
            if not rings: return
            xs = [x for r in rings for x, y in r]; ys = [y for r in rings for x, y in r]
            ks = {reg_of(x, y) for r in rings for x, y in r[::max(1, len(r) // 20)]} | {reg_of(sum(xs) / len(xs), sum(ys) / len(ys))}
            fr = json.dumps([level, name, muni, prov, [round(min(xs) * 1e6), round(min(ys) * 1e6), round(max(xs) * 1e6), round(max(ys) * 1e6)], [enc_line(r) for r in rings]], ensure_ascii=False, separators=(',', ':'))
            for k in ks:
                if k in wanted:
                    if level == 10:
                        for tx in range(math.floor(min(xs) / ACELL), math.floor(max(xs) / ACELL) + 1):
                            for ty in range(math.floor(min(ys) / ACELL), math.floor(max(ys) / ACELL) + 1): tmp(k, 'a').write('%d,%d\t%s\n' % (tx, ty, fr))
                    else: tmp(k, 'a').write('big\t%s\n' % fr)
        bsrc = None
        if a.barangays:
            bsrc = Source(a.barangays)
            def polygons(l):  # the shape type in the .shp header: 5 / 15 / 25 = polygons (a file may also hold points and lines)
                with bsrc.open(l + '.shp') as f: return struct.unpack('<i', f.read(36)[32:36])[0] in (5, 15, 25)
            cand = [l for l in bsrc.layers() if bsrc.has(l + '.dbf') and bsrc.has(l + '.shx') and polygons(l)]
            best = None
            for l in cand:
                L = Layer(bsrc, l); f = a.barangay_field or L.field('ADM4_EN', 'ADM4_NAME', 'BRGY_NAME', 'BARANGAY', 'BRGY', 'NAME_3')
                if f and (best is None or L.n > best[0].n): best = (L, f)
            if not best: sys.exit('No barangay areas with a barangay name field found in %s (polygon layers: %s). Use --barangay-field NAME.' % (a.barangays, '; '.join('%s: %s' % (l, ', '.join(f[0] for f in Layer(bsrc, l).fields)) for l in cand) or 'none'))
            L, bf = best
            if 'PROJCS' in L.prj.upper(): sys.exit('%s is in a projected coordinate system. In QGIS: Export -> Save Features As…, CRS = EPSG:4326 (WGS 84), then use that file.' % a.barangays)
            mf = a.municipality_field or L.field('ADM3_EN', 'ADM3_NAME', 'MUN_NAME', 'CITYMUN', 'MUNICIPALITY', 'CITY_MUN', 'NAME_2')
            pf = a.province_field or L.field('ADM2_EN', 'ADM2_NAME', 'PRO_NAME', 'PROVINCE', 'PROV_NAME', 'NAME_1')
            bpos = state.get('brgy', 0)
            if not bpos: log('barangays from %s (layer %s): %d areas, fields %s / %s / %s' % (a.barangays, L.base, L.n, bf, mf, pf))
            while bpos < L.n:  # in rounds, like the roads: a big file can be stopped and taken up again
                if out_of_time(): checkpoint(); log('stopped at barangay %d of %d: run the same command again to go on' % (bpos, L.n)); return
                end = min(L.n, bpos + 4000)
                for i, st, parts, at in L.records({bf, mf, pf} - {None}, bpos, end):
                    if parts: put(10, at.get(bf, ''), at.get(mf, '') if mf else '', at.get(pf, '') if pf else '', parts, 0.00002)
                bpos = end; state['brgy'] = bpos; checkpoint()
                log('barangays %d of %d (%.0f s)' % (bpos, L.n, time.time() - T0))
        for i, st, parts, at in adm.records({'fclass', 'name'}):
            lv = int(at['fclass'][11:]) if at['fclass'].startswith('admin_level') else 0
            if not parts or lv not in LEVELS or (lv == 10 and bsrc): continue
            put(lv, at['name'], '', '', parts, {4: 0.0005, 6: 0.00005, 10: 0.00001}[lv])
        state['admin'] = 'done'; checkpoint(); log('boundaries (%.0f s)' % (time.time() - T0))
    for f in files.values(): f.close()
    files.clear()

    # 5. one pack per region
    made = state.setdefault('made', {})
    for k in sorted(wanted):
        R = regions[k]; fn = 'G-eSAA roads - %s - %s.roadpack' % (re.sub(r'[^\w .-]+', '', R['name']).strip(), date)
        if made.get(R['name']) == fn and os.path.exists(os.path.join(out, fn)): continue
        if out_of_time(): log('stopped before %s: run the same command again to go on' % R['name']); return
        chunks = {}; counts = {'roads': 0, 'landmarks': 0}; seen = set(); bb = [999, 999, -999, -999]
        def lines(kind):
            p = os.path.join(work, '%d.%s' % (k, kind))
            if os.path.exists(p):
                with open(p, encoding='utf-8') as f:
                    for ln in f: yield ln.rstrip('\n').split('\t', 1)
        for t, fr in lines('r'):
            chunks.setdefault(('t', t), [[], []])[0].append(fr)
            rid = fr[1:fr.index(',')]
            if rid not in seen:
                seen.add(rid); counts['roads'] += 1
        for t, fr in lines('p'):
            chunks.setdefault(('t', t), [[], []])[1].append(fr); counts['landmarks'] += 1
        adm_big, adm_t = [], {}
        lvl = {4: 0, 6: 0, 10: 0}; aseen = set()
        for t, fr in lines('a'):
            if t == 'big': adm_big.append(fr)
            else: adm_t.setdefault(t, []).append(fr)
            if fr not in aseen: aseen.add(fr); lvl[int(fr[1:fr.index(',')])] += 1
        body = []; idx = {}; aidx = {}; off = 0
        def add(data):
            nonlocal off
            z = gzip.compress(data.encode('utf-8'), 6); body.append(z); o = off; off += len(z); return [o, len(z)]
        for (_, t), (rs, ps) in sorted(chunks.items()):
            idx[t] = add('{"r":[%s],"p":[%s]}' % (','.join(rs), ','.join(ps)))
            tx, ty = map(int, t.split(',')); bb = [min(bb[0], tx * CELL), min(bb[1], ty * CELL), max(bb[2], (tx + 1) * CELL), max(bb[3], (ty + 1) * CELL)]
        big = add('{"a":[%s]}' % ','.join(adm_big))
        for t, frs in sorted(adm_t.items()): aidx[t] = add('{"a":[%s]}' % ','.join(frs))
        rb = R['bbox']
        head = {'format': 'gesaa-roadpack', 'v': 1, 'name': 'Roads · %s' % R['name'], 'region': R['name'], 'date': date,
                'source': '© OpenStreetMap contributors, ODbL 1.0 (Geofabrik extract of %s)' % date,
                'barangays': ('%s' % os.path.basename(a.barangays)) if a.barangays else 'OpenStreetMap',
                'bbox': [round(max(bb[0], rb[0] - 0.1), 6), round(max(bb[1], rb[1] - 0.1), 6), round(min(bb[2], rb[2] + 0.1), 6), round(min(bb[3], rb[3] + 0.1), 6)],
                'cell': CELL, 'acell': ACELL, 'counts': {**counts, 'provinces': lvl[4], 'municipalities': lvl[6], 'barangays': lvl[10]},
                'tiles': idx, 'abig': big, 'atiles': aidx}
        # chunk offsets are relative to the end of the header; the app adds the header's size
        hj = json.dumps(head, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        tmpf = os.path.join(out, fn + '.part')
        with open(tmpf, 'wb') as f:
            f.write(MAGIC); f.write(struct.pack('<I', len(hj))); f.write(hj)
            for z in body: f.write(z)
        os.replace(tmpf, os.path.join(out, fn))
        made[R['name']] = fn; save()
        log('%s: %d roads, %d landmarks, %d provinces, %d cities/municipalities, %d barangays, %.1f MB (%.0f s)' % (
            fn, counts['roads'], counts['landmarks'], lvl[4], lvl[6], lvl[10], os.path.getsize(os.path.join(out, fn)) / 1048576, time.time() - T0))

    # 6. the list for the admin
    with open(os.path.join(out, 'packs.txt'), 'w', encoding='utf-8') as f:
        f.write('# G-eSAA road packs (OpenStreetMap %s). Upload each file to Google Drive (sharing: Anyone with the link),\n' % date)
        f.write('# then in G-eSAA: Settings -> Administration -> Offline map packs, one line per pack: name | Drive link | size in MB\n')
        for k in sorted(wanted, key=lambda k: regions[k]['name']):
            fn = made.get(regions[k]['name'])
            if fn and os.path.exists(os.path.join(out, fn)):
                f.write('Roads · %s · %s | PASTE-THE-DRIVE-LINK | %.1f\n' % (regions[k]['name'], date, os.path.getsize(os.path.join(out, fn)) / 1048576))
    state['done'] = True; save()
    log('done: %d packs in %s (%.0f s). The work folder %s can be deleted.' % (len(made), out, time.time() - T0, work))

if __name__ == '__main__':
    main()
