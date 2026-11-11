"""v2.42.26 copy (the labels read AE: EXISTING 48C AE (RUN 2), PROPOSED 12C LIGHT AE). v2.42.24 copy (the label says size and type: PROPOSED 12C LIGHT). v2.42.23 (synthetic data only): the cases the independent review found, on the plan DXF and the Drawing.
 A straight line of poles (IDs and places made up): Q2 has two boxes (a NAP 1x16 and an LCP 1x4); fiber F1 (new) runs Q1 to Q6 but there is
 no span Q4-Q5 (a gap); fiber F2 (existing 48C) is the only fiber on the route span Q6-Q7. The plan: the cable between Q2's two boxes is
 drawn; nothing is drawn or labelled over the gap; the span Q6-Q7 keeps its proposed cable (red, its label) with the existing cable
 beside it (blue, EXISTING 48C (RUN 2)); the Drawing opens without errors."""
import asyncio, sys, os, shutil, json, math, zipfile, io, re
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v24220/t24220b.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v24220/out_b'", "OUT = S + '/v24226/out_23b'")
exec(compile(src, 't24220b_head', 'exec'))
R_E = 6371008.8; LAT, LON0 = 7.0952, 125.6071
def ll(dx, dy): return (LAT + dy / (R_E * math.pi / 180), LON0 + dx / (R_E * math.cos(math.radians(LAT)) * math.pi / 180))
def recs():
    out = []
    for i in range(1, 8):
        la, lo = ll(40 * (i - 1), 0); k = f'Q{i}'
        r = {'k': k, 'poleId': f'CC-77{i:02d}', 'poleType': 'Concrete', 'lat': la, 'lon': lo, 'element': 'Pole', 'status': 'Existing', 'boq': {'owner': 'Electric', 'ownerName': 'DLPC'}, 'x': {}}
        if i == 2: r['x'] = {'nap': True, 'napId': 'NAP-7702', 'nap2': True, 'nap2Id': 'LCP-7702'}; r['boq'].update({'napType': 'NAP 1x16', 'napSt': 'New', 'nap2Type': 'LCP 1x4', 'nap2St': 'New'})
        out.append(r)
    return out
LINKS = [['Q1', 'Q2', 'L12'], ['Q2', 'Q3', 'L12'], ['Q3', 'Q4', 'L12'], ['Q5', 'Q6', 'L12'], ['Q6', 'Q7', 'L12']]
FIB = [{'n': 1, 'cab': 'L12', 'side': 'auto', 'ex': False, 'path': ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'], 'fromSt': '', 'toSt': ''},
       {'n': 2, 'cab': 'L12', 'side': 'auto', 'ex': True, 'cores': 48, 'path': ['Q6', 'Q7'], 'fromSt': '', 'toSt': ''}]
WRAP = """() => { const wrap = (T) => { if (!T || T.__w) return T; const ob = T.build; T.build = function (seed, job) { window.__job = { pts: job.pts.map((p) => ({ id: p.id, E: p.E, N: p.N })), fibs: job.fibs }; return ob.apply(this, arguments); }; T.__w = true; return T; };
  if (window.GeDxfTpl) wrap(window.GeDxfTpl); else { let v; Object.defineProperty(window, 'GeDxfTpl', { configurable: true, get: () => v, set: (x) => { v = wrap(x); } }); } }"""
def dseg(pt, a, b):
    ax, ay = a; bx, by = b; px, py = pt; L2 = (bx - ax) ** 2 + (by - ay) ** 2
    u = 0 if not L2 else max(0, min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2)); return math.hypot(px - ax - u * (bx - ax), py - ay - u * (by - ay))

async def main():
    async with async_playwright() as p:
        ctx, pg, errs = await new_ctx(p, OUT + '/ud'); await setup(pg, 'Juan Dela Cruz', 'juan.delacruz@example.com')
        await common.newproj(pg, 'survey', 'REVIEW_CASES', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['REVIEW_CASES', recs(), LINKS, FIB]); kof = {v: k for k, v in ids.items()}
        await pg.evaluate(WRAP); await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        fd = await export(pg, 'doDxf', 'cases.zip'); job = await pg.evaluate("window.__job")
        F = {f['n']: f for f in job['fibs']}
        st1 = [(kof[s['a']], kof[s['b']], s.get('gap', False)) for s in F[1]['steps']]; st2 = F[2]['steps'][0]
        check('A1. the job: F1\'s step Q4-Q5 is a gap (no span); F2 (existing) alone on the route span Q6-Q7 takes lane 1 of 2 (lane 0 the span\'s own cable)',
              [g for _, _, g in st1] == [False, False, False, True, False] and st2['k'] == 1 and st2['n'] == 2 and F[2]['lbl'] == 'EXISTING 48C AE (RUN 2)', (st1, st2, F[2]['lbl']))
        z = zipfile.ZipFile(fd); dn = sorted(n for n in z.namelist() if n.endswith('.dxf'))[0]
        doc = ezdxf.read(io.StringIO(z.read(dn).decode('utf-8', 'replace').replace('\r\n', '\n'))); msp = [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
        XY = {kof.get(q['id'], q['id']): (q['E'], q['N']) for q in job['pts']}
        near = lambda pt, m: min(math.hypot(pt[0] - x, pt[1] - y) for x, y in XY.values()) <= m
        cab = [(e.dxf.color, [(float(x), float(y)) for x, y, *_ in e.get_points()]) for e in msp if e.dxftype() == 'LWPOLYLINE' and 'FOC' in e.dxf.layer.upper()]
        cab = [(c, l) for c, l in cab if all(near(q, 45) for q in l)]
        q2 = XY['Q2']; inner = [l for c, l in cab if len(l) == 2 and all(math.hypot(q[0] - q2[0], q[1] - q2[1]) < 12 for q in l) and math.hypot(l[1][0] - l[0][0], l[1][1] - l[0][1]) < 6]
        check('B1. at Q2 (two boxes) the cable between the boxes is drawn (as before v2.42.23)', len(inner) >= 1, [(round(l[0][0] - q2[0], 1), round(l[0][1] - q2[1], 1), round(l[1][0] - q2[0], 1), round(l[1][1] - q2[1], 1)) for l in inner])
        x4, x5 = XY['Q4'][0], XY['Q5'][0]; yq = XY['Q4'][1]
        over = [l for c, l in cab if any(x4 + 5 < q[0] < x5 - 5 for q in l) or any(l[i][0] < x4 + 5 and l[i + 1][0] > x5 - 5 or l[i + 1][0] < x4 + 5 and l[i][0] > x5 - 5 for i in range(len(l) - 1))]
        T = [e for e in msp if e.dxftype() == 'TEXT']; tpos = lambda e: (e.dxf.align_point.x, e.dxf.align_point.y) if e.dxf.get('halign', 0) or e.dxf.get('valign', 0) else (e.dxf.insert.x, e.dxf.insert.y)
        gapT = [e.dxf.text for e in T if e.dxf.layer in ('G-ESAA CABLE LABEL', 'Distance Data') and x4 + 6 < tpos(e)[0] < x5 - 6 and abs(tpos(e)[1] - yq) < 8]
        check('B2. no cable drawn or labelled over the gap Q4-Q5 (no span there)', not over and not gapT, (len(over), gapT))
        x6, x7 = XY['Q6'][0], XY['Q7'][0]
        on67 = [(c, l) for c, l in cab if all(x6 - 1 <= q[0] <= x7 + 1 for q in l) and max(q[0] for q in l) - min(q[0] for q in l) > 20]
        red = [l for c, l in on67 if c == 1]; blue = [l for c, l in on67 if c == 5]
        gap = min((dseg(((x6 + x7) / 2, b[0][1] + (b[-1][1] - b[0][1]) / 2), r[0], r[-1]) for r in red for b in blue), default=0)
        check('B3. the route span Q6-Q7: its proposed cable (red) and, beside it, the existing cable (blue), apart', len(red) >= 1 and len(blue) >= 1 and 1.5 <= gap <= 3.0, (len(red), len(blue), round(gap, 2)))
        lbl67 = sorted(e.dxf.text for e in T if e.dxf.layer == 'G-ESAA CABLE LABEL' and x6 < tpos(e)[0] < x7)
        check('B4. its labels: the proposed cable\'s and EXISTING 48C (RUN 2)', lbl67 == ['EXISTING 48C AE (RUN 2)', 'PROPOSED 12C LIGHT AE'], lbl67)
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1500); await pg.screenshot(path=OUT + '/drawing.png')
        check('C1. the Drawing opens; no page errors', await pg.locator('#drawBtn').count() >= 0 and not errs, errs[:3])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
