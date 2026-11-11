"""(v2.42.28 copy: Drawing style opens from Plan settings on the Drawing.)
v2.42.26 copy (the labels read AE: PROPOSED 12C LIGHT AE (RUN n); the style summary as of v2.42.26) of the v2.42.24 copy of the v2.42.23 test (labels: size and type, PROPOSED 12C LIGHT AE (RUN n); a label with no room beside its cable has a leader to it; boxes by the text's alignment). v2.42.23 (synthetic data only): the plan's fibers in their lanes and their labels.
 A tower, a pole with a new dummy NAP, two spans two fibers share, a corner where one ends and the other turns, two more poles (IDs and
 places made up). The plan DXF: each fiber one continuous line (F1 broken only by the DN block, F2 one line); on the shared spans the
 lanes 2.6 m apart (no overlap); at the DN both fibers leave the block's side side by side; F1 ends beside the corner pole while F2
 turns there; the span lengths only (29m, no (F1+F2)); each cable its own label with its run (PROPOSED 12C LIGHT AE (RUN 1), (RUN 2)) beside its
 own line, parallel to it, none on the span length, another label or a cable; no second tag (the cable's long name) unless the labels are
 off. The Drawing (no errors); the style sheet (no two-of-one-cable wording)."""
import asyncio, sys, os, shutil, json, math, zipfile, io, re
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v24220/t24220b.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v24220/out_b'", "OUT = S + '/v24228/out_223a_v28'")
exec(compile(src, 't24220b_head', 'exec'))  # common, ezdxf, check, checks, W, close_sheets, export, new_ctx, setup, SEED_H, at
R_E = 6371008.8; LAT, LON0 = 7.0921, 125.6045
def ll(dx, dy): return (LAT + dy / (R_E * math.pi / 180), LON0 + dx / (R_E * math.cos(math.radians(LAT)) * math.pi / 180))
PLACES = {'T': (15, 26), 'P1': (0, 0), 'P2': (6, -33), 'P3': (17, -91), 'P4': (-23, -99), 'P5': (-25, -90)}
def recs():
    out = []
    for k, (x, y) in PLACES.items():
        la, lo = ll(x, y)
        if k == 'T': out.append({'k': k, 'poleId': 'SYN-T01', 'poleType': '', 'lat': la, 'lon': lo, 'element': 'Site', 'status': 'New', 'boq': {}, 'x': {'siteKind': 'Tower'}})
        else: out.append({'k': k, 'poleId': f'CC-90{k[1]}0{k[1]}', 'poleType': 'Concrete', 'lat': la, 'lon': lo, 'element': 'Pole', 'status': 'Existing', 'boq': {'owner': 'Electric', 'ownerName': 'DLPC', **({'napType': 'Dummy NAP', 'napSt': 'New'} if k == 'P1' else {})}, 'x': {'nap': True} if k == 'P1' else {}})
    return out
LINKS = [['T', 'P1', 'L12'], ['P1', 'P2', 'L12'], ['P2', 'P3', 'L12'], ['P3', 'P4', 'L12'], ['P4', 'P5', 'L12']]
FIB = [{'n': 1, 'cab': 'L12', 'side': 'auto', 'ex': False, 'path': ['T', 'P1', 'P2', 'P3'], 'fromSt': '', 'toSt': ''},
       {'n': 2, 'cab': 'L12', 'side': 'auto', 'ex': False, 'path': ['P1', 'P2', 'P3', 'P4', 'P5'], 'fromSt': '', 'toSt': ''}]
WRAP = """() => { const wrap = (T) => { if (!T || T.__w) return T; const ob = T.build; T.build = function (seed, job) { window.__job = { pts: job.pts.map((p) => ({ id: p.id, poleId: p.poleId, E: p.E, N: p.N })), spans: job.spans.map((s) => ({ ia: s.ia, ib: s.ib, len: s.len })), fibs: job.fibs }; return ob.apply(this, arguments); }; T.__w = true; return T; };
  if (window.GeDxfTpl) wrap(window.GeDxfTpl); else { let v; Object.defineProperty(window, 'GeDxfTpl', { configurable: true, get: () => v, set: (x) => { v = wrap(x); } }); } }"""
# ---- geometry
def rect(cx, cy, w, h, deg):
    a = math.radians(deg); ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux
    return [(cx + ux * w / 2 * sx + vx * h / 2 * sy, cy + uy * w / 2 * sx + vy * h / 2 * sy) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
def sat(A, B):
    for P in (A, B):
        for i in range(4):
            x1, y1 = P[i]; x2, y2 = P[(i + 1) % 4]; nx, ny = y1 - y2, x2 - x1
            pa = [nx * x + ny * y for x, y in A]; pb = [nx * x + ny * y for x, y in B]
            if max(pa) < min(pb) or max(pb) < min(pa): return False
    return True
def seg_hits_rect(p, q, R, margin):
    cx = sum(x for x, _ in R) / 4; cy = sum(y for _, y in R) / 4
    ux, uy = R[1][0] - R[0][0], R[1][1] - R[0][1]; w = math.hypot(ux, uy); ux, uy = ux / w, uy / w
    vx, vy = R[3][0] - R[0][0], R[3][1] - R[0][1]; h = math.hypot(vx, vy); vx, vy = vx / h, vy / h
    loc = lambda t: ((t[0] - cx) * ux + (t[1] - cy) * uy, (t[0] - cx) * vx + (t[1] - cy) * vy)
    (x0, y0), (x1, y1) = loc(p), loc(q); hw, hh = w / 2 + margin, h / 2 + margin; t0, t1 = 0.0, 1.0; dx, dy = x1 - x0, y1 - y0
    for pp, qq in ((-dx, x0 + hw), (dx, hw - x0), (-dy, y0 + hh), (dy, hh - y0)):
        if pp == 0:
            if qq < 0: return False
        else:
            r = qq / pp
            if pp < 0: t0 = max(t0, r)
            else: t1 = min(t1, r)
            if t0 > t1: return False
    return True
def dseg(pt, a, b):
    ax, ay = a; bx, by = b; px, py = pt; L2 = (bx - ax) ** 2 + (by - ay) ** 2
    u = 0 if not L2 else max(0, min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2)); return math.hypot(px - ax - u * (bx - ax), py - ay - u * (by - ay))
def dline(pt, line): return min(dseg(pt, line[i], line[i + 1]) for i in range(len(line) - 1))

async def main():
    async with async_playwright() as p:
        ctx, pg, errs = await new_ctx(p, OUT + '/ud'); await setup(pg, 'Juan Dela Cruz', 'juan.delacruz@example.com')
        await common.newproj(pg, 'survey', 'LANES_TEST', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['LANES_TEST', recs(), LINKS, FIB]); kof = {v: k for k, v in ids.items()}
        await pg.evaluate(WRAP); await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        fd = await export(pg, 'doDxf', 'lanes.zip'); job = await pg.evaluate("window.__job")
        F = {f['n']: f for f in job['fibs']}
        check('A1. the job: each fiber, its way and its lane on each step (the shared steps 2 lanes), its own label with its run: PROPOSED 12C LIGHT AE (RUN 1), PROPOSED 12C LIGHT AE (RUN 2)',
              [kof[x] for x in F[1]['path']] == ['T', 'P1', 'P2', 'P3'] and [kof[x] for x in F[2]['path']] == ['P1', 'P2', 'P3', 'P4', 'P5'] and [s['n'] for s in F[1]['steps']] == [1, 2, 2] and [s['n'] for s in F[2]['steps']] == [2, 2, 1, 1]
              and sorted([F[1]['steps'][1]['k'], F[2]['steps'][0]['k']]) == [0, 1] and F[1]['lbl'] == 'PROPOSED 12C LIGHT AE (RUN 1)' and F[2]['lbl'] == 'PROPOSED 12C LIGHT AE (RUN 2)', job['fibs'])
        z = zipfile.ZipFile(fd); dn = sorted(n for n in z.namelist() if n.endswith('.dxf'))[0]
        doc = ezdxf.read(io.StringIO(z.read(dn).decode('utf-8', 'replace').replace('\r\n', '\n'))); msp = [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
        XY = {kof.get(q['id'], q['id']): (q['E'], q['N']) for q in job['pts']}
        near = lambda pt, m: min(math.hypot(pt[0] - x, pt[1] - y) for x, y in XY.values()) <= m
        cab = [[(float(x), float(y)) for x, y, *_ in e.get_points()] for e in msp if e.dxftype() == 'LWPOLYLINE' and 'FOC' in e.dxf.layer.upper()]
        cab = [l for l in cab if all(near(q, 30) for q in l)]
        f2 = [l for l in cab if math.hypot(l[-1][0] - XY['P5'][0], l[-1][1] - XY['P5'][1]) < 6 or math.hypot(l[0][0] - XY['P5'][0], l[0][1] - XY['P5'][1]) < 6]
        f1a = [l for l in cab if near(l[0], 0) is False and (math.hypot(l[0][0] - XY['T'][0], l[0][1] - XY['T'][1]) < 8 or math.hypot(l[-1][0] - XY['T'][0], l[-1][1] - XY['T'][1]) < 8)]
        f1b = [l for l in cab if l not in f2 and l not in f1a]
        check('B1. the cables: 3 lines on the route: F1 from the tower to the DN, F1 from the DN to the corner, F2 from the DN to its end (each one continuous line)', len(cab) == 3 and len(f2) == 1 and len(f1a) == 1 and len(f1b) == 1, [len(l) for l in cab])
        if len(f2) == 1 and len(f1b) == 1:
            F2, F1 = f2[0], f1b[0]
            if math.hypot(F2[0][0] - XY['P5'][0], F2[0][1] - XY['P5'][1]) < 6: F2 = F2[::-1]
            if math.hypot(F1[0][0] - XY['P3'][0], F1[0][1] - XY['P3'][1]) < 10: F1 = F1[::-1]
            m23 = ((XY['P2'][0] + XY['P3'][0]) / 2, (XY['P2'][1] + XY['P3'][1]) / 2); a = min(F1, key=lambda q: math.hypot(q[0] - m23[0], q[1] - m23[1]))
            pa = min(((F1[i][0] + t * (F1[i + 1][0] - F1[i][0]), F1[i][1] + t * (F1[i + 1][1] - F1[i][1])) for i in range(len(F1) - 1) for t in [k / 50 for k in range(51)]), key=lambda q: math.hypot(q[0] - m23[0], q[1] - m23[1]))
            gap = dline(pa, F2)
            check('B2. on the shared 59 m span the two lanes one lane apart (1.8–2.6 m by the plan\'s scale: clearly apart on paper, no overlap)', 1.7 <= gap <= 2.7, round(gap, 2))
            s1, s2 = F1[0], F2[0]; a1 = f1a[0][-1] if math.hypot(f1a[0][-1][0] - XY['T'][0], f1a[0][-1][1] - XY['T'][1]) > 8 else f1a[0][0]
            dnb = [(e.dxf.insert.x, e.dxf.insert.y) for e in msp if e.dxftype() == 'INSERT' and e.dxf.name.lower() == 'dummy nap']; mid = ((a1[0] + s1[0]) / 2, (a1[1] + s1[1]) / 2)
            check('B3. at the DN both fibers leave the block side by side (their first points one lane apart), F1 comes in at its other end (the block between F1\'s two lines)', abs(math.hypot(s1[0] - s2[0], s1[1] - s2[1]) - gap) <= 0.4 and len(dnb) == 1 and math.hypot(mid[0] - dnb[0][0], mid[1] - dnb[0][1]) <= 3.0, (s1, s2, a1, dnb))
            v3 = min(F2, key=lambda q: math.hypot(q[0] - XY['P3'][0], q[1] - XY['P3'][1])); e1 = F1[-1]
            check('B4. at the corner F1 ends beside it (abreast, one lane away) while F2 turns there: no hook', abs(math.hypot(e1[0] - v3[0], e1[1] - v3[1]) - gap) <= 0.4 and len(F1) <= 4, (e1, v3, len(F1)))
        T = [e for e in msp if e.dxftype() == 'TEXT']; txt = lambda e: e.dxf.text
        lens = [e for e in T if re.fullmatch(r'\d+m', txt(e)) and near((e.dxf.align_point.x, e.dxf.align_point.y), 40)]
        want = sorted(f"{round(s['len'])}m" for s in job['spans'])
        check('C1. the span lengths only: ' + ', '.join(want) + ' (no (F1+F2), no tags)', sorted(txt(e) for e in lens) == want and not any('(F' in txt(e) for e in T), [txt(e) for e in lens])
        cl = [e for e in T if e.dxf.layer == 'G-ESAA CABLE LABEL']
        own = {'PROPOSED 12C LIGHT AE (RUN 1)': f1a + f1b, 'PROPOSED 12C LIGHT AE (RUN 2)': f2}
        check('C2. (v2.42.25) each cable its own label with its run, once on this short route (one grid): RUN 1 and RUN 2; no PROPOSED 2×12C', sorted(txt(e) for e in cl) == ['PROPOSED 12C LIGHT AE (RUN 1)', 'PROPOSED 12C LIGHT AE (RUN 2)'] and not any('2×12C' in txt(e) or '12C ×2' in txt(e) for e in T), [txt(e) for e in cl])
        def box(e, shrink=0.92):  # (v2.42.24 copy: by its alignment)
            h = e.dxf.height; w = len(txt(e)) * 0.62 * h * shrink; hh = h * shrink; rot = e.dxf.get('rotation', 0); a = math.radians(rot); ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux
            ha, va = e.dxf.get('halign', 0), e.dxf.get('valign', 0); q = e.dxf.align_point if (ha or va) else e.dxf.insert
            dx = {0: w / 2, 1: 0, 2: -w / 2, 4: 0}.get(ha, 0); dy = {0: h / 2, 1: h / 2, 2: 0, 3: -h / 2}.get(va, 0)
            return rect(q.x + ux * dx + vx * dy, q.y + uy * dx + vy * dy, w, hh, rot)
        LED = [[(float(x), float(y)) for x, y, *_ in e.get_points()] for e in msp if e.dxftype() == 'LWPOLYLINE' and e.dxf.layer == 'G-ESAA CABLE LABEL']
        def leader_of(e):  # a label in free space: the leader whose shoulder ends at it
            q = e.dxf.align_point; w = len(txt(e)) * 0.62 * e.dxf.height
            L = [l for l in LED if math.hypot(l[-1][0] - q.x, l[-1][1] - q.y) <= w / 2 + 2.5]
            return min(L, key=lambda l: math.hypot(l[-1][0] - q.x, l[-1][1] - q.y)) if L else None
        par = []
        for e in cl:
            if leader_of(e): continue  # (v2.42.24: a leader's label is level, its arrow on the cable)
            q = e.dxf.align_point; best = None
            for l in cab:
                for i in range(len(l) - 1):
                    d = dseg((q.x, q.y), l[i], l[i + 1])
                    if best is None or d < best[0]: best = (d, math.degrees(math.atan2(l[i + 1][1] - l[i][1], l[i + 1][0] - l[i][0])))
            diff = abs(((e.dxf.rotation - best[1]) + 90) % 180 - 90); par.append((round(best[0], 2), round(diff, 1)))
        nled = sum(1 for e in cl if leader_of(e))
        check(f'C3. each cable label parallel to its cable (within 3°), beside it (0.9–4 m from it); or ({nled}) level in free space with a leader to it', par and all(dd <= 3 and 0.9 <= d0 <= 4.0 for d0, dd in par) and len(par) + nled == len(cl), (par, nled))
        tgt = []
        for e in cl:
            ld = leader_of(e); q = ld[0] if ld else (e.dxf.align_point.x, e.dxf.align_point.y); mine = min(dline(q, l) for l in own.get(txt(e), [])) if own.get(txt(e)) else 99  # (v2.42.24: a leader's arrow)
            other = min([dline(q, l) for l in cab if l not in own.get(txt(e), [])] or [99]); tgt.append((txt(e)[-6:], round(mine, 2), round(other, 2)))
        check('C2b. each label targeted (beside it, or its leader\'s arrow on it): nearer its own run\'s line than any other cable (by 1 m or more)', all(m + 1.0 <= o for _, m, o in tgt), tgt)
        bx = [(e, box(e)) for e in cl + lens]
        ov = [(txt(a), txt(b)) for i, (a, A) in enumerate(bx) for (b, B) in bx[i + 1:] if sat(A, B)]
        check('C4. no cable label on a span length or on another cable label', not ov, ov)
        nm = [e for e in T if e.dxf.layer == 'MISC' and 'CABLE' in txt(e)]
        hits = [txt(e) for e, B in bx + [(e, box(e)) for e in nm] if any(seg_hits_rect(l[i], l[i + 1], B, 0.15) for l in cab for i in range(len(l) - 1))]
        check('C5. no label on a cable line (the cable labels, the span lengths); no second tag for the same cable (no PROPOSED 12C LIGHT CABLE along the route)', not hits and not nm, (hits, [txt(e) for e in nm]))
        others = [e for e in T if e not in cl and e not in lens and near(((e.dxf.align_point if e.dxf.get('halign', 0) or e.dxf.get('valign', 0) else e.dxf.insert).x, (e.dxf.align_point if e.dxf.get('halign', 0) or e.dxf.get('valign', 0) else e.dxf.insert).y), 30) and txt(e).strip()]
        ov2 = [(txt(a), txt(b)) for a, A in bx for b in others if sat(A, box(b, 0.85))]
        check('C6. no cable label or span length on the other texts round the route (pole labels, loop, coordinates)', not ov2, ov2[:6])
        lp = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name == 'loopp']; lres = []
        for e in lp:
            for v in e.virtual_entities():
                if v.dxftype() != 'LINE': continue
                p0, p1 = (v.dxf.start.x, v.dxf.start.y), (v.dxf.end.x, v.dxf.end.y); ang = math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0]))
                l = min(cab, key=lambda l: max(dline(p0, l), dline(p1, l))); mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); i = min(range(len(l) - 1), key=lambda i: dseg(mid, l[i], l[i + 1]))
                best = (max(dline(p0, l), dline(p1, l)), math.degrees(math.atan2(l[i + 1][1] - l[i][1], l[i + 1][0] - l[i][0])))
                lres.append((round(best[0], 2), round(abs(((ang - best[1]) + 90) % 180 - 90), 1)))
        check('C7. the loop at the DN lies on the cable as drawn: its straight line on a fiber\'s lane (each end within 0.6 m: under the 0.70 mm line at 1 : 1100) and along it (within 4°)', len(lp) == 1 and lres and all(d0 <= 0.6 and da <= 4 for d0, da in lres), (len(lp), lres))
        # ---- the Drawing, the style sheet
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1500); await pg.screenshot(path=OUT + '/drawing.png')
        await pg.click('#drawSetBtn'); await W(pg, 500); await pg.click('#psStyle'); await W(pg, 600); sm = await pg.inner_text('#stSum')
        check('D1. the Drawing opens; the style sheet: cable labels on, each cable its own with its run (no two-of-one-cable wording)', not await pg.locator('#stCabWord').count() and 'up to 3 for each cable in a grid' in sm and 'PROPOSED 72C FIG-8 AE (RUN 1)' in sm, sm[:240])
        # ---- the cable labels off: no run labels; the cable's name along the route again (the only tag then)
        await pg.evaluate("() => { const S = __polecam.S; S.plStyle = { ...(S.plStyle || {}), cab: { on: false, word: 'a' } }; __polecam.persist(); }")
        fd2 = await export(pg, 'doDxf', 'lanes_off.zip'); z2 = zipfile.ZipFile(fd2); d2 = sorted(n for n in z2.namelist() if n.endswith('.dxf'))[0]
        m2 = [e for e in ezdxf.read(io.StringIO(z2.read(d2).decode('utf-8', 'replace').replace('\r\n', '\n'))).modelspace() if e.dxf.handle not in SEED_H]
        t2 = [e.dxf.text for e in m2 if e.dxftype() == 'TEXT']
        check('D1b. cable labels off: no cable label; the cable\'s name along the route (its only tag)', not any(e.dxf.layer == 'G-ESAA CABLE LABEL' for e in m2) and 'PROPOSED 12C LIGHT CABLE' in t2, [t for t in t2 if 'PROPOSED' in t])
        check('D2. no page errors', not errs, errs[:3])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
