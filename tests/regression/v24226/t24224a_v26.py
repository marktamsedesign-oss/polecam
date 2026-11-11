"""v2.42.24 (synthetic data only): cable sizes on the plan and the Drawing, the closure on the cable, labels that cover nothing, the
closure's size. A made-up route (a tower, 11 poles, 2 handholes; IDs and places made up): RUN 1 Fig-8 144C tower → closure pole,
RUN 2 Light 12C beside it on two spans, RUN 3 Fig-8 72C, RUN 4 Fig-8 48C, RUN 5 Fig-8 24C, RUN 6 UG 288C, all from the closure pole;
a dummy NAP on the second pole. Checks: the 8 cable types; each cable's line weight by its size (0.30 … 0.70 mm); each cable's label
with size, type and run; no cable label or span length over another text; leaders (if any) end on a cable with their arrow; the closure
as the P-Joint block on the cable with PROPOSED / its ID and the cables meeting its sides (an existing closure: a blue pentagon and its
ID); the closure's size from its largest cable (288C), in the BOQ, kept once chosen by hand; the Drawing: the DN and the closure on the
cable, the closure's size, no two labels over each other."""
import asyncio, sys, os, shutil, json, math, zipfile, io, re
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v24220/t24220b.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v24220/out_b'", "OUT = S + '/v24226/out_24a'")
exec(compile(src, 't24220b_head', 'exec'))  # common, ezdxf, check, checks, W, close_sheets, export, new_ctx, setup, SEED_H, ADD
H23 = open(S + '/v24223/t24223a.py').read().split('\nasync def main():')[0].split('# ---- geometry')[1]
exec(compile(H23, 't24223a_geo', 'exec'))  # rect, sat, seg_hits_rect, dseg, dline
WRAP = open(S + '/v24223/t24223a.py').read().split('WRAP = """')[1].split('"""')[0]
R_E = 6371008.8; LAT, LON0 = 7.0921, 125.6045
def ll(dx, dy): return (LAT + dy / (R_E * math.pi / 180), LON0 + dx / (R_E * math.cos(math.radians(LAT)) * math.pi / 180))
P = {'T': (10, 30, 'SYN-T01', 'tower'), 'P1': (0, 0, 'CC-9101', 'pole'), 'P2': (6, -34, 'CC-9102', 'pole'), 'P3': (16, -92, 'CC-9103', 'pole'), 'P4': (-24, -100, 'CC-9104', 'pole'),
     'P5': (-27, -91, 'CC-9105', 'pole'), 'P6': (62, -86, 'CC-9106', 'pole'), 'P7': (108, -80, 'CC-9107', 'pole'), 'P8': (156, -74, 'CC-9108', 'pole'), 'P10': (204, -68, 'CC-9110', 'pole'),
     'P13': (196, -112, 'CC-9113', 'pole'), 'P9': (112, -34, 'CC-9109', 'pole'), 'H1': (111, -120, 'HH-01', 'hh'), 'H2': (114, -160, 'HH-02', 'hh')}
RUNS = [(1, 'F144', ['T', 'P1', 'P2', 'P3', 'P6', 'P7']), (2, 'L12', ['P1', 'P2', 'P3', 'P4', 'P5']), (3, 'F72', ['P7', 'P8', 'P10']), (4, 'F48', ['P7', 'P8', 'P13']), (5, 'F24', ['P7', 'P9']), (6, 'U288', ['P7', 'H1', 'H2'])]
LBL = {1: 'PROPOSED 144C FIG-8 AE (RUN 1)', 2: 'PROPOSED 12C LIGHT AE (RUN 2)', 3: 'PROPOSED 72C FIG-8 AE (RUN 3)', 4: 'PROPOSED 48C FIG-8 AE (RUN 4)', 5: 'PROPOSED 24C FIG-8 AE (RUN 5)', 6: 'PROPOSED 288C UG (RUN 6)'}  # (v2.42.26: AE for an aerial cable; UG once)
LW = {1: 60, 2: 30, 3: 50, 4: 40, 5: 35, 6: 70}
FAR = {1: 'P6', 2: 'P4', 3: 'P10', 4: 'P13', 5: 'P9', 6: 'H2'}  # a pole only that cable reaches
def recs():
    out = []
    for k, (x, y, pid, kind) in P.items():
        la, lo = ll(x, y)
        if kind == 'tower': out.append({'k': k, 'poleId': pid, 'lat': la, 'lon': lo, 'element': 'Site', 'status': 'New', 'boq': {}, 'x': {'siteKind': 'Tower'}})
        elif kind == 'hh': out.append({'k': k, 'poleId': pid, 'lat': la, 'lon': lo, 'element': 'Handhole', 'status': 'New', 'boq': {}})
        else:
            b = {'owner': 'Electric', 'ownerName': 'DLPC'}; x = {}
            if k == 'P1': b.update({'napType': 'Dummy NAP', 'napSt': 'New'}); x = {'nap': True, 'napId': 'DN-01'}
            if k == 'P7': b.update({'cloSt': 'New'}); x = {'closure': True, 'closureId': 'CL-0001'}
            out.append({'k': k, 'poleId': pid, 'poleType': 'Concrete', 'lat': la, 'lon': lo, 'element': 'Pole', 'status': 'Existing', 'boq': b, 'x': x})
    return out
links, seen = [], set()
for n, cab, path in RUNS:
    for a, b in zip(path, path[1:]):
        k = tuple(sorted((a, b)))
        if k not in seen: seen.add(k); links.append([a, b, cab])
FIB = [{'n': n, 'cab': cab, 'side': 'auto', 'ex': False, 'path': path, 'fromSt': '', 'toSt': ''} for n, cab, path in RUNS]

def tbox(t, shrink=0.9):  # a TEXT's or ATTRIB's box: its alignment, its rotation (Arial about 0.62 h a character)
    h = t.dxf.height; w = max(1, len(t.dxf.text)) * 0.62 * h * shrink; hh = h * shrink; rot = t.dxf.get('rotation', 0); a = math.radians(rot); ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux
    ha, va = t.dxf.get('halign', 0), t.dxf.get('valign', 0)
    q = t.dxf.align_point if (ha or va) and t.dxf.hasattr('align_point') else t.dxf.insert
    dx = {0: w / 2, 1: 0, 2: -w / 2, 4: 0}.get(ha, 0); dy = {0: h / 2, 1: h / 2, 2: 0, 3: -h / 2}.get(va, 0)
    cx, cy = q.x + ux * dx + vx * dy, q.y + uy * dx + vy * dy
    return rect(cx, cy, w, hh, rot)

async def main():
    async with async_playwright() as p:
        ctx, pg, errs = await new_ctx(p, OUT + '/ud'); await setup(pg, 'Juan Dela Cruz', 'juan.delacruz@example.com')
        await common.newproj(pg, 'survey', 'SIZES_TEST', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['SIZES_TEST', recs(), links, FIB]); kof = {v: k for k, v in ids.items()}
        cab = await pg.evaluate("() => Object.fromEntries(Object.entries(window.PoleCore.CABLES || {}).map(([k, c]) => [k, [c.cores, c.fam, c.lw]]))")
        check('A1. 8 cable types: Light 12C; Figure 8 12C, 24C, 48C, 72C, 144C; UG 144C, 288C; line weights 0.30 … 0.70 by size',
              cab == {'L12': [12, 'light', 0.3], 'F12': [12, 'fig8', 0.3], 'F24': [24, 'fig8', 0.35], 'F48': [48, 'fig8', 0.4], 'F72': [72, 'fig8', 0.5], 'F144': [144, 'fig8', 0.6], 'U144': [144, 'ug', 0.6], 'U288': [288, 'ug', 0.7]}, cab)
        # the closure's size follows its largest cable (the route set as Route does)
        await pg.evaluate("() => __polecam.setFibers(__polecam.fibers())"); await W(pg, 1500)
        b7 = await pg.evaluate("(id) => __polecam.points.find((x) => x.id === id).boq", ids['P7'])
        check('B1. the new closure with no size: 288C, its largest cable\'s (UG 288C starts there), marked as the app\'s', b7.get('clo') == '288C' and b7.get('cloAuto') is True, b7)
        bt = await pg.evaluate("__polecam.boqTable()")
        crow = [r['cells'] for r in bt['rows'] if 'losure' in str(r['cells'][0])]
        check('B2. the BOQ: the closure 288C', any('288C' in [str(c) for c in r] for r in crow), crow)
        # the plan DXF
        await pg.evaluate(WRAP); await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        fd = await export(pg, 'doDxf', 'sizes.zip'); job = await pg.evaluate("window.__job")
        z = zipfile.ZipFile(fd); dn = sorted(n for n in z.namelist() if n.endswith('.dxf'))[0]
        doc = ezdxf.read(io.StringIO(z.read(dn).decode('utf-8', 'replace').replace('\r\n', '\n'))); msp = [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
        XY = {kof.get(q['id'], q['id']): (q['E'], q['N']) for q in job['pts']}
        foc = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and 'foc' in e.dxf.layer.lower()]
        pl = [([(float(x), float(y)) for x, y, *_ in e.get_points()], e.dxf.get('lineweight', None), e) for e in foc]
        near = lambda q, k, m: math.hypot(q[0] - XY[k][0], q[1] - XY[k][1]) <= m
        got = {}
        for n, far in FAR.items():
            ws = sorted({w for pts, w, _ in pl if any(near(q, far, 6) for q in pts)}); got[n] = ws
        check('C1. each cable\'s line weight by its size: 144C 0.60, 12C 0.30, 72C 0.50, 48C 0.40, 24C 0.35, UG 288C 0.70 mm', all(got[n] == [LW[n]] for n in LW), got)
        T = [e for e in msp if e.dxftype() == 'TEXT']
        cl = [e for e in T if e.dxf.layer == 'G-ESAA CABLE LABEL']
        names = sorted({e.dxf.text for e in cl})
        check('C2. each cable\'s label: size, type, AE / UG and run (PROPOSED 24C FIG-8 AE (RUN 5), PROPOSED 12C LIGHT AE (RUN 2), PROPOSED 288C UG (RUN 6)…)', names == sorted(LBL.values()), names)
        lens = [e for e in T if re.fullmatch(r'\d+m', e.dxf.text)]
        others = [e for e in T if e not in cl] + [a for e in msp if e.dxftype() == 'INSERT' for a in e.attribs if not (a.dxf.get('flags', 0) & 1)]  # (v25: an invisible attribute is not drawn)
        others = [e for e in others if any(near((e.dxf.insert.x, e.dxf.insert.y), k, 60) for k in P)]
        bad = []
        for e in cl + lens:
            A_ = tbox(e)
            for o in cl + others:
                if o is e or not o.dxf.text.strip(): continue
                if sat(A_, tbox(o)): bad.append((e.dxf.text, o.dxf.text))
        bad = sorted(set(tuple(sorted(x)) for x in bad))
        check('C3. no cable label or span length over another text (labels, lengths, pole IDs, the closure\'s texts)', not bad, bad[:8])
        led = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and e.dxf.layer == 'G-ESAA CABLE LABEL']; sol = [e for e in msp if e.dxftype() == 'SOLID' and e.dxf.layer == 'G-ESAA CABLE LABEL']
        def tip_ok(e):
            q = [(float(x), float(y)) for x, y, *_ in e.get_points()][0]
            return min(dline(q, pts) for pts, _, _ in pl if len(pts) > 1) <= 0.6 and any(math.hypot(s.dxf.vtx0.x - q[0], s.dxf.vtx0.y - q[1]) < 0.05 for s in sol)
        check(f'C4. leaders ({len(led)}): each from its label to a point on a cable, with its arrow there', len(led) == len(sol) and all(tip_ok(e) for e in led), (len(led), len(sol)))
        ins = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name == 'P-Joint']
        c7 = [e for e in ins if near((e.dxf.insert.x, e.dxf.insert.y), 'P7', 8)]
        at = {a.dxf.tag: a.dxf.text for a in c7[0].attribs} if c7 else {}
        ends = 0; thru = 0
        if c7:
            c = (c7[0].dxf.insert.x, c7[0].dxf.insert.y)
            for pts, _, _ in pl:
                for q in (pts[0], pts[-1]):
                    d = math.hypot(q[0] - c[0], q[1] - c[1])
                    if 0.8 <= d <= 4.6: ends += 1
                if any(math.hypot(q[0] - c[0], q[1] - c[1]) < 0.8 for q in pts): thru += 1
        check('D1. the closure ON the cable at CC-9107: the P-Joint block (PROPOSED, CL-0001); the 5 cables there (RUN 1 ends, RUN 3–6 start) end at its sides (none through its middle)', len(c7) == 1 and at.get('JT_ID') == 'PROPOSED' and at.get('JOINT') == 'CL-0001' and ends == 5 and thru == 0, (len(c7), at, ends, thru))
        lpx = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name == 'loopp']
        ld = sorted(round(math.hypot(e.dxf.insert.x - c[0], e.dxf.insert.y - c[1]), 2) for e in lpx) if c7 else []
        near_l = [x for x in ld if x < 25]
        rs = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name == 'proposed riser']
        rd = sorted(round(math.hypot(e.dxf.insert.x - c[0], e.dxf.insert.y - c[1]), 2) for e in rs) if c7 else []
        check('D2. the loop mark and the riser at the closure lie past its pentagon, not over it (the loop 4.35 m + half a loop out or more; the riser 4.35 m + 2.5 m)', c7 and near_l and min(near_l) >= 4.35 + 2.5 and rd and min(rd) >= 4.35 + 2.5, (ld[:4], rd))
        # chosen by hand: it stays
        await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids['P7']); await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 900)
        opt = await pg.evaluate("() => { const s = document.getElementById('cloSzSel'); return s ? [s.value, [...s.options].find((o) => o.value === s.value)?.textContent || ''] : null; }")
        check('E1. the record form: the closure\'s size 288C, said to be its largest cable\'s', opt is not None and opt[0] == '288C' and 'auto' in opt[1], opt)
        await pg.evaluate("() => { const s = document.getElementById('cloSzSel'); s.value = '144C'; s.dispatchEvent(new Event('change', { bubbles: true })); }"); await W(pg, 300)
        await pg.evaluate("() => [...document.querySelectorAll('#edSave, #edSaveTop')].find(e => e.getClientRects().length).click()"); await W(pg, 1500); await close_sheets(pg)
        await pg.evaluate("() => __polecam.setFibers(__polecam.fibers())"); await W(pg, 1500)
        b7 = await pg.evaluate("(id) => __polecam.points.find((x) => x.id === id).boq", ids['P7'])
        check('E2. chosen by hand (144C): it stays when the route changes (no longer the app\'s)', b7.get('clo') == '144C' and not b7.get('cloAuto'), b7)
        # the Drawing screen
        await pg.click('#drawBtn'); await W(pg, 2500)
        bl = await pg.evaluate("() => [...(__polecam.drw.blocks || new Map()).entries()].map(([k, b]) => [k, b.kind, b.cid, b.size || '', !!b.old])")
        check('F1. the Drawing: the dummy NAP (DN) at CC-9101 and the closure at CC-9107 (CL-0001 · 144C) on the cable', sorted([kof.get(k, k), kd, c, s_] for k, kd, c, s_, _ in bl) == [['P1', 'dn', 'DN-01', ''], ['P7', 'clo', 'CL-0001', '144C']], bl)
        xy = await pg.evaluate("() => Object.fromEntries(__polecam.drw.items.map((it) => [it.p.poleId, it.xy]))")
        res = []
        for nm, k, sc in [('all', None, 3.4), ('dn', 'CC-9101', 9), ('clo', 'CC-9107', 7), ('mid', 'CC-9106', 5)]:
            if k: await pg.evaluate("([cx, cy, sc]) => { const v = __polecam.drw.view; v.cx = cx; v.cy = cy; v.sc = sc * (window.devicePixelRatio || 1); }", [xy[k][0], xy[k][1] - 15, sc])
            else: m = ((xy['SYN-T01'][0] + xy['CC-9113'][0]) / 2, (xy['SYN-T01'][1] + xy['CC-9113'][1]) / 2); await pg.evaluate("([cx, cy, sc]) => { const v = __polecam.drw.view; v.cx = cx; v.cy = cy; v.sc = sc * (window.devicePixelRatio || 1); }", [m[0], m[1], sc])
            await pg.click('#drawLabels'); await W(pg, 120); await pg.click('#drawLabels'); await W(pg, 400)
            L = await pg.evaluate("() => __polecam.drw.lastLbl"); B = L['boxes']
            def ob(b):
                cx, cy, hw, hh, ux, uy, _ = b; vx, vy = -uy, ux
                return [(cx + ux * hw * sx * 0.95 + vx * hh * sy * 0.95, cy + uy * hw * sx * 0.95 + vy * hh * sy * 0.95) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            ov = [(B[i][6], B[j][6]) for i in range(len(B)) for j in range(i + 1, len(B)) if sat(ob(B[i]), ob(B[j]))]
            res.append((nm, len(B), L['leaders'], ov[:3]))
            await pg.locator('#drawCanvas').screenshot(path=f'{OUT}/draw_{nm}.png')
        txts = set()
        check('F2. the Drawing at 4 zooms: labels, span lengths and the closure\'s texts placed, none over another', all(n_ > 0 and not ov for _, n_, _, ov in res), res)
        # an existing closure: a blue outline and its ID on the plan; its size not the app's
        await pg.evaluate("(id) => { const p = __polecam.points.find((x) => x.id === id); p.boq = { ...p.boq, cloSt: 'Existing', clo: '48C' }; delete p.boq.cloAuto; __polecam.renderPoles(); }", ids['P7'])
        await close_sheets(pg)
        fd2 = await export(pg, 'doDxf', 'sizes2.zip'); z2 = zipfile.ZipFile(fd2); dn2 = sorted(n for n in z2.namelist() if n.endswith('.dxf'))[0]
        doc2 = ezdxf.read(io.StringIO(z2.read(dn2).decode('utf-8', 'replace').replace('\r\n', '\n'))); m2 = [e for e in doc2.modelspace() if e.dxf.handle not in SEED_H]
        pj = [e for e in m2 if e.dxftype() == 'INSERT' and e.dxf.name == 'P-Joint' and near((e.dxf.insert.x, e.dxf.insert.y), 'P7', 8)]
        pent = [e for e in m2 if e.dxftype() == 'LWPOLYLINE' and e.closed and len(list(e.get_points())) == 5 and all(near((float(x), float(y)), 'P7', 9) for x, y, *_ in e.get_points())]
        idt = [e for e in m2 if e.dxftype() == 'TEXT' and e.dxf.text == 'CL-0001']
        check('G1. an existing closure: a blue pentagon outline on the cable (no red block) and its ID', not pj and len(pent) == 1 and pent[0].dxf.get('color', 256) == 5 and len(idt) == 1, (len(pj), len(pent), [e.dxf.get('color', 256) for e in pent], len(idt)))
        print('errors', errs[:4]); check('H1. no page errors', not errs, errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
