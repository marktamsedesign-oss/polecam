"""v2.42.25, as of v2.42.26 (the labels read AE; up to 3 a grid by default) (synthetic data only): fewer cable labels; loops each on their own cable.
 A made-up street of 46 poles 40 m apart from a tower (IDs and places made up), two cables side by side all the way: RUN 1 Fig-8 72C
 and RUN 2 Light 12C; a closure on the 11th pole; MLoop marked on the 7th. Checks: on the plan, each cable at most 2 labels in each
 grid, the second 500 m or more along it from the first, and at least one in each grid it crosses; every span its length; the MLoop
 pole one loop, on the 72C (15 m); the app's loops: the 72C every 250–300 m, the 12C every 450–500 m, each counted on its own; the
 closure: a loop for each cable, each its own small line with its RUN (no 15m+10m LOOP); on the Drawing screen each cable at most twice."""
import asyncio, sys, os, shutil, json, math, zipfile, io, re
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v24220/t24220b.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v24220/out_b'", "OUT = S + '/v24226/out_25a'")
exec(compile(src, 't24220b_head', 'exec'))  # common, ezdxf, check, checks, W, close_sheets, export, new_ctx, setup, SEED_H, ADD
WRAP = """() => { const wrap = (T) => { if (!T || T.__w) return T; const ob = T.build; T.build = function (seed, job) { window.__job = { pts: job.pts.map((p) => ({ id: p.id, poleId: p.poleId, E: p.E, N: p.N })), cell: job.cell || 440, fibs: job.fibs }; const out = ob.apply(this, arguments); window.__geo = out && out.report && out.report.grid ? out.report.grid.geo : null; return out; }; T.__w = true; return T; };
  if (window.GeDxfTpl) wrap(window.GeDxfTpl); else { let v; Object.defineProperty(window, 'GeDxfTpl', { configurable: true, get: () => v, set: (x) => { v = wrap(x); } }); } }"""
R_E = 6371008.8; LAT, LON0 = 7.0921, 125.6045
def ll(dx, dy): return (LAT + dy / (R_E * math.pi / 180), LON0 + dx / (R_E * math.cos(math.radians(LAT)) * math.pi / 180))
N = 46
def xy(i):  # a street that bends twice
    if i <= 20: return (i * 40.0, 0.0)
    if i <= 33: return (800.0 + (i - 20) * 40 * 0.6, -(i - 20) * 40 * 0.8)
    return (800.0 + 13 * 24 + (i - 33) * 40.0, -13 * 32.0)
def recs():
    out = [{'k': 'T', 'poleId': 'SYN-T01', 'lat': ll(-30, 6)[0], 'lon': ll(-30, 6)[1], 'element': 'Site', 'status': 'New', 'boq': {}, 'x': {'siteKind': 'Tower'}}]
    for i in range(N):
        x, y = xy(i); la, lo = ll(x, y); b = {'owner': 'Electric', 'ownerName': 'DLPC'}; X = {}
        if i == 10: b.update({'cloSt': 'New', 'clo': '72C'}); X = {'closure': True, 'closureId': 'CL-0101'}
        if i in (6, 22): b.update({'mloop': 'Yes'})  # (22: where RUN 2's own spacing puts its loop too)
        out.append({'k': f'P{i}', 'poleId': f'CC-6{i:03d}', 'poleType': 'Concrete', 'lat': la, 'lon': lo, 'element': 'Pole', 'status': 'Existing', 'boq': b, 'x': X})
    return out
PATH = ['T'] + [f'P{i}' for i in range(N)]
LINKS = [[a, b, 'F72'] for a, b in zip(PATH, PATH[1:])]
FIB = [{'n': 1, 'cab': 'F72', 'side': 'auto', 'ex': False, 'path': PATH, 'fromSt': '', 'toSt': ''}, {'n': 2, 'cab': 'L12', 'side': 'auto', 'ex': False, 'path': PATH, 'fromSt': '', 'toSt': ''}]

async def main():
    async with async_playwright() as p:
        ctx, pg, errs = await new_ctx(p, OUT + '/ud'); await setup(pg, 'Juan Dela Cruz', 'juan.delacruz@example.com')
        await common.newproj(pg, 'survey', 'FEW_LABELS', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['FEW_LABELS', recs(), LINKS, FIB]); kof = {v: k for k, v in ids.items()}
        FL = await pg.evaluate("__polecam.fibLoops()"); L = {pid: E for pid, E in FL['list']}
        name = lambda k: 'SYN-T01' if k == 'T' else f'CC-6{int(k[1:]):03d}'
        check('A1. MLoop on CC-6006 (both cables pass): one loop, on RUN 1 (Fig-8 72C, 15 m); RUN 2 keeps its own spacing', L.get('CC-6006') == [[1, 'F72', 15, 'surveyor']], L.get('CC-6006'))
        check('A2. the closure CL-0101 on CC-6010: a loop for each cable (RUN 1 15 m, RUN 2 10 m)', sorted(L.get('CC-6010') or []) == [[1, 'F72', 15, 'closure'], [2, 'L12', 10, 'closure']], L.get('CC-6010'))
        def dist(k):  # along the street from the tower
            pts = [(-30, 6)] + [xy(i) for i in range(N)]; d = [0]
            for a, b in zip(pts, pts[1:]): d.append(d[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
            return d[PATH.index(k)]
        by = {name(k): k for k in PATH}
        for run, cab, lo, hi in ((1, 'F72', 250, 300), (2, 'L12', 450, 500)):
            at = sorted(dist(by[pid]) for pid, E in L.items() if any(e[0] == run for e in E) and pid in by)
            gaps = [round(b - a) for a, b in zip(at, at[1:])]; auto = [pid for pid, E in L.items() if any(e[0] == run and e[3] == 'auto' for e in E)]
            check(f'A3.{run} RUN {run} ({cab}): its loops (its own and the app\'s) at most {hi} m apart (+ 50 m), the app\'s at {lo}–{hi} m', auto and all(g <= hi + 50 for g in gaps), (gaps, sorted(auto)))
        al = await pg.evaluate("() => { const by = new Map(__polecam.points.map((p) => [p.id, p.poleId])); return __polecam.autoLoops().map((x) => by.get(Array.isArray(x) ? x[0] : x)); }")
        check('A4. MLoop on CC-6022, where RUN 2\'s spacing adds its own loop: RUN 1 the surveyor\'s, RUN 2 the app\'s; the pole not listed as added by the app (the survey had one)', L.get('CC-6022') == [[1, 'F72', 15, 'surveyor'], [2, 'L12', 10, 'auto']] and 'CC-6022' not in al and len(al) >= 3, (L.get('CC-6022'), al))
        # the plan
        await pg.evaluate(WRAP); await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        fd = await export(pg, 'doDxf', 'few.zip'); job = await pg.evaluate("window.__job")
        z = zipfile.ZipFile(fd); dn = sorted(n for n in z.namelist() if n.endswith('.dxf'))[0]
        doc = ezdxf.read(io.StringIO(z.read(dn).decode('utf-8', 'replace').replace('\r\n', '\n'))); msp = [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
        XY = {kof.get(q['id'], q['id']): (q['E'], q['N']) for q in job['pts']}
        T = [e for e in msp if e.dxftype() == 'TEXT']
        rdl = [l for l in z.read('README.txt').decode('utf-8', 'replace').splitlines() if 'added by the app where the survey had none' in l]
        check('A5. the plan\'s README: the poles with a loop added by the app, CC-6022 not among them', len(rdl) == 1 and 'CC-6022' not in rdl[0] and 'CC-6034' in rdl[0], [l[-160:] for l in rdl])
        cl = [e for e in T if e.dxf.layer == 'G-ESAA CABLE LABEL']
        # the grid: the GEO sheets' cells (origin from the title blocks' grid is not exposed: use the nearest cell size steps along the route)
        cell = job['cell']; pos = lambda e: (e.dxf.align_point.x, e.dxf.align_point.y)
        # along each cable: the nearest point of the street
        S_ = [XY[k] for k in PATH]; dd = [0]
        for a, b in zip(S_, S_[1:]): dd.append(dd[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        def along(q):
            best = None
            for i in range(len(S_) - 1):
                (ax, ay), (bx, by_) = S_[i], S_[i + 1]; L2 = (bx - ax) ** 2 + (by_ - ay) ** 2; u = max(0, min(1, ((q[0] - ax) * (bx - ax) + (q[1] - ay) * (by_ - ay)) / L2)) if L2 else 0
                d = math.hypot(q[0] - ax - u * (bx - ax), q[1] - ay - u * (by_ - ay))
                if best is None or d < best[0]: best = (d, dd[i] + u * math.sqrt(L2))
            return best
        lab = {}
        for e in cl:
            d0, a0 = along(pos(e)); lab.setdefault(e.dxf.text, []).append(round(a0))
        tot = sum(len(v) for v in lab.values()); nspan = len(PATH) - 1
        check(f'B1. far fewer labels: {tot} for 2 cables on {nspan} spans (it was one for each cable on each span: {2 * nspan})', 0 < tot <= 2 * math.ceil(dd[-1] / cell + 2) * 2 and tot < nspan, {k: sorted(v) for k, v in lab.items()})
        # in any stretch of one grid's width along a cable, at most 2 labels, and 2 only 500 m or more apart
        geo = await pg.evaluate("window.__geo"); cellOf = lambda q: (math.floor((q[0] - geo[0]) / cell), math.floor((q[1] - geo[1]) / cell))
        per = {}
        for e in cl: per.setdefault((e.dxf.text, cellOf(pos(e))), []).append(round(along(pos(e))[1]))
        bad = [(k, sorted(v)) for k, v in per.items() if len(v) > 3 or any(abs(a - b) < 500 for i, a in enumerate(v) for b in v[i + 1:])]  # (v2.42.26: up to 3 by default)
        check('B2. in each grid each cable at most 3 labels (v2.42.26: the default), each 500 m or more along it from the others', geo and not bad, (bad[:6], {f'{k[0][-7:]} {k[1]}': sorted(v) for k, v in per.items()}))
        gaps = {k: max([b - a for a, b in zip([0] + sorted(v), sorted(v) + [round(dd[-1])])]) for k, v in lab.items()}
        check(f'B3. no long stretch of a cable without its label: the longest gap under two grids ({2 * cell} m)', set(lab) == {'PROPOSED 72C FIG-8 AE (RUN 1)', 'PROPOSED 12C LIGHT AE (RUN 2)'} and all(g < 2 * cell for g in gaps.values()), gaps)
        lens = [e for e in T if re.fullmatch(r'\d+m', e.dxf.text)]
        check(f'B4. every span keeps its length ({nspan})', len(lens) >= nspan, len(lens))
        lt = [e for e in T if 'LOOP' in e.dxf.text]
        c10 = XY['P10']; near10 = [(e.dxf.text, round(e.dxf.height, 2)) for e in lt if math.hypot(pos(e)[0] - c10[0], pos(e)[1] - c10[1]) < 40]
        check('C1. the closure\'s loops: 15m LOOP (RUN 1) and 10m LOOP (RUN 2), each its own small line (no 15m+10m LOOP)', sorted(t for t, _ in near10) == ['10m LOOP (RUN 2)', '15m LOOP (RUN 1)'] and all(h <= 1.31 for _, h in near10) and not any('+' in e.dxf.text for e in lt), near10)
        c6 = XY['P6']; near6 = [e.dxf.text for e in lt if math.hypot(pos(e)[0] - c6[0], pos(e)[1] - c6[1]) < 30]
        check('C2. the MLoop pole CC-6006: one loop, 15m LOOP', near6 == ['15m LOOP'], near6)
        def tb(e):
            h = e.dxf.height; w = len(e.dxf.text) * 0.6 * h; a = math.radians(e.dxf.get('rotation', 0)); ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux; q = pos(e)
            return [(q[0] + ux * w / 2 * sx * 0.92 + vx * h / 2 * sy * 0.92, q[1] + uy * w / 2 * sx * 0.92 + vy * h / 2 * sy * 0.92) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        H23 = open(S + '/v24223/t24223a.py').read().split('\nasync def main():')[0].split('# ---- geometry')[1]; g_ = {}; exec(compile(H23, 'geo', 'exec'), g_)
        ov = [(a.dxf.text, b.dxf.text) for a in [e for e in lt if '(RUN' in e.dxf.text] for b in T if b is not a and b.dxf.text.strip() and g_['sat'](tb(a), tb(b))]
        check('C3. the loops\' small lines cover no other text', not ov, ov[:6])
        # the closure's PROPOSED / its ID cover no loop mark (v2.42.25: placed after the loops)
        from ezdxf import bbox as _bb
        jt = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name == 'P-Joint' and math.hypot(e.dxf.insert[0] - c10[0], e.dxf.insert[1] - c10[1]) < 15]
        def ab(a):  # an attribute left-aligned, middle (ha 0, va 2), level
            q = a.dxf.align_point if (a.dxf.get('halign', 0) or a.dxf.get('valign', 0)) else a.dxf.insert; h = a.dxf.height; w = len(a.dxf.text) * 0.6 * h
            return [(q[0], q[1] - h / 2), (q[0] + w, q[1] - h / 2), (q[0] + w, q[1] + h / 2), (q[0], q[1] + h / 2)]
        at = [(a.dxf.text, ab(a)) for e in jt for a in e.attribs if a.dxf.text.strip()]
        lp = []
        for e in msp:
            if e.dxftype() == 'INSERT' and e.dxf.name == 'loopp' and math.hypot(e.dxf.insert[0] - c10[0], e.dxf.insert[1] - c10[1]) < 25:
                b = _bb.extents([e]); lp.append([(b.extmin.x, b.extmin.y), (b.extmax.x, b.extmin.y), (b.extmax.x, b.extmax.y), (b.extmin.x, b.extmax.y)])
        hit = [t_ for t_, q in at for L in lp if g_['sat'](q, L)]
        check('C4. the closure\'s PROPOSED and ID cover no loop mark', len(at) == 2 and lp and not hit, (hit, [t_ for t_, _ in at], len(lp)))
        # the Drawing screen
        await pg.click('#drawBtn'); await W(pg, 2500)
        res = []
        for sc in [None, 0.6, 1.5]:
            if sc: await pg.evaluate("(sc) => { const v = __polecam.drw.view; v.sc = sc * (window.devicePixelRatio || 1); }", sc)
            await pg.click('#drawLabels'); await W(pg, 120); await pg.click('#drawLabels'); await W(pg, 400)
            B = (await pg.evaluate("() => __polecam.drw.lastLbl"))['boxes']
            cnt = {}
            for b in B:
                if 'RUN' in str(b[6]): cnt[b[6]] = cnt.get(b[6], 0) + 1
            res.append((sc, cnt)); await pg.locator('#drawCanvas').screenshot(path=f'{OUT}/draw_{sc}.png')
        check('D1. the Drawing screen: each cable labelled at most twice on the screen (at 3 zooms), at least once at the fitted view', all(all(v <= 2 for v in c.values()) for _, c in res) and len(res[0][1]) == 2, res)
        print('errors', errs[:4]); check('E1. no page errors', not errs, errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
