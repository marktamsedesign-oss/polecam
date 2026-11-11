"""v2.42.20 (synthetic data only): fibers (named runs).
 A synthetic As-Plan: ODF-01 -> 72C feeder (Fiber 1) -> closure CL-0001 at a riser pole C0 -> Fiber 2 and Fiber 3 (12C) share
 C0 -> S1 -> S2, then Fiber 2 goes east (right) to the existing closure CL-0007, Fiber 3 west (left) to ODF-02; Fiber 4 an existing
 cable off the new route; one span on no fiber (C0 -> X1).
 Model (cables per span, lanes, sides, ends), loops per fiber (closure: one per fiber; surveyor's: one per fiber; NAP: one; entrance;
 the app's per fiber), hardware (retractors shared, span clamps per 12C fiber, telco arm), quantities, BOQ, flags, map lanes (no
 crossing), Route UI (chips, card, span panel, + Fiber, + Add points following the spans, refuse to unlink a fiber's span, delete and
 undo), exports (KMZ, route Excel, plan DXF job)."""
import asyncio, sys, os, shutil, json, math, zipfile, io, re
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common, openpyxl
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
OUT = S + '/v24220/out_a'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:1800], flush=True)
W = lambda pg, ms: pg.wait_for_timeout(ms)
R_E = 6371008.8; LAT, LON0 = 7.1036, 125.6180
def at(dx, dy=0.0): return (LAT + dy / (R_E * math.pi / 180), LON0 + dx / (R_E * math.cos(math.radians(LAT)) * math.pi / 180))
def synth():
    recs = [{'k': 'ODF1', 'element': 'ODF', 'poleId': 'ODF-01', 'status': 'Existing', 'xy': (-60, 0)}]
    feed = [f'P{x}' for x in range(0, 601, 50)]
    for x in range(0, 601, 50): recs.append({'k': f'P{x}', 'element': 'Pole', 'poleId': f'CC-{1000 + x}', 'xy': (x, 0)})
    recs.append({'k': 'C0', 'element': 'Pole', 'poleId': 'CC-2000', 'xy': (650, 0), 'x': {'closure': True, 'closureId': 'CL-0001'}, 'boq': {'cloSt': 'New', 'clo': '24C', 'riser': 'Yes'}})
    recs += [{'k': 'S1', 'element': 'Pole', 'poleId': 'CC-2001', 'xy': (650, -50), 'x': {'mloop': True}, 'boq': {'mloop': 'Yes'}},
             {'k': 'S2', 'element': 'Pole', 'poleId': 'CC-2002', 'xy': (650, -100), 'x': {'details': [{'item': 'Telco arm', 'qty': 1}]}}]
    for k in range(1, 13):
        r = {'k': f'R{k}', 'element': 'Pole', 'poleId': f'CC-3{k:03d}', 'xy': (650 + 50 * k, -100 - 20 * k)}
        if k == 6: r['x'] = {'nap': True, 'napId': 'NAP-0001'}; r['boq'] = {'napType': 'NAP 1x8', 'napSt': 'New'}
        if k == 12: r['x'] = {'closure': True, 'closureId': 'CL-0007'}; r['boq'] = {'cloSt': 'Existing', 'clo': '24C'}
        recs.append(r)
    for k in range(1, 12): recs.append({'k': f'L{k}', 'element': 'Pole', 'poleId': f'CC-4{k:03d}', 'xy': (650 - 50 * k, -100 - 20 * k)})
    recs.append({'k': 'ODF2', 'element': 'ODF', 'poleId': 'ODF-02', 'status': 'Existing', 'xy': (40, -350)})
    recs += [{'k': 'X1', 'element': 'Pole', 'poleId': 'CC-5001', 'xy': (700, 40)},
             {'k': 'E1', 'element': 'Pole', 'poleId': 'CC-6001', 'xy': (300, 60)}, {'k': 'E2', 'element': 'Pole', 'poleId': 'CC-6002', 'xy': (350, 100)}, {'k': 'E3', 'element': 'Pole', 'poleId': 'CC-6003', 'xy': (400, 140)}]
    for r in recs:
        r['lat'], r['lon'] = at(*r['xy']); r.setdefault('status', 'Existing'); r['poleType'] = 'Concrete' if r['element'] == 'Pole' else ''
        if r['element'] == 'Pole': r['boq'] = {'owner': 'Electric', **r.get('boq', {})}
    F1 = ['ODF1'] + feed + ['C0']; F2 = ['C0', 'S1', 'S2'] + [f'R{k}' for k in range(1, 13)]; F3 = ['C0', 'S1', 'S2'] + [f'L{k}' for k in range(1, 12)] + ['ODF2']
    links = []
    for P, cab in ((F1, 'F72'), (F2, 'L12'), (F3, 'L12')):
        for a, b in zip(P, P[1:]):
            if not any({a, b} == {x, y} for x, y, _ in links): links.append((a, b, cab))
    links.append(('C0', 'X1', 'L12'))
    fib = [{'n': 1, 'cab': 'F72', 'side': 'auto', 'ex': False, 'path': F1}, {'n': 2, 'cab': 'L12', 'side': 'auto', 'ex': False, 'path': F2},
           {'n': 3, 'cab': 'L12', 'side': 'auto', 'ex': False, 'path': F3}, {'n': 4, 'cab': 'L12', 'side': 'auto', 'ex': True, 'path': ['P300', 'E1', 'E2', 'E3']}]
    return recs, links, fib
ADD = """([proj, recs, links, fib]) => { const P = __polecam.points, ids = {}, t0 = Date.parse('2026-11-06T01:00:00Z');
  recs.forEach((r, i) => { const id = proj + '_' + r.k; ids[r.k] = id; const t = new Date(t0 + i * 1000).toISOString();
    P.push({ id, project: proj, created: t, takenAt: t, updated: t, source: 'map', poleId: r.poleId, poleType: r.poleType || '', lat: r.lat, lon: r.lon, element: r.element, status: r.status,
      remarks: '', closureId: '', boxes: 0, details: [], marks: [], boq: r.boq || {}, ...(r.x || {}), by: 'Test surveyor', updatedBy: 'Test surveyor' }); });
  const S = __polecam.S; S.meta[proj] = { ...(S.meta[proj] || {}), links: links.map(([a, b, c]) => [ids[a], ids[b], c]), fibers: fib ? fib.map((f) => ({ ...f, path: f.path.map((k) => ids[k]) })) : undefined };
  __polecam.persist(); __polecam.renderPoles(); return ids; }"""
def qty(rows): return {r[0]: r[1] for r in rows}
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 250)
async def sheet(route):
    if route.request.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'name': 'Test sheet', 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False}))
async def export(pg, sel, name):
    await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate(f"window.__polecam.showExport('{sel}')"); await W(pg, 400); await pg.click('#' + sel)
    for _ in range(2000):
        if await pg.locator('#resultBox:not([hidden])').count(): break
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
        await W(pg, 250)
    async with pg.expect_download(timeout=180000) as d: await pg.click('#resSave')
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f); await close_sheets(pg); return f

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(OUT + '/ud', executable_path=common.CHROME, viewport={'width': 1100, 'height': 1000}, accept_downloads=True, service_workers='block')
        await ctx.route('https://script.google.com/**', sheet)
        for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**'): await ctx.route(u, lambda r: r.abort())
        for js in (common.NO_DRAFT_JS, common.NO_SAVECHECK_JS, common.NO_SAMPLE_JS, common.ADM_OPEN_JS): await ctx.add_init_script(js)
        pg = ctx.pages[0]; errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(BASE + '/index.html'); await W(pg, 1500)
        await pg.fill('#pfName', 'Juan Dela Cruz'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'juan.delacruz@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await common.sheet_companies(pg, ['GLOBE', 'SAMPLE VENDOR'], admins=['GLOBE'])
        await pg.click('#admSave'); await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
        if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
        for _ in range(3):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        recs, links, fib = synth()
        await common.newproj(pg, 'survey', 'FIBERS_PLAN', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['FIBERS_PLAN', recs, links, fib]); kof = {v: k for k, v in ids.items()}; pid = {r['k']: r['poleId'] for r in recs}
        M = await pg.evaluate("__polecam.fibModel()")
        sp = {(kof[s['ia']], kof[s['ib']]): s for s in M['spans']}
        S = lambda a, b: sp.get((a, b)) or sp.get((b, a))
        L = {f['n']: f for f in M['list']}
        check('A1. spans take their fibers: C0 -> S1 carries F2 and F3 (2 runs of 12C), the feeder 72C (F1), C0 -> X1 on no fiber (its own cable); the existing cable (F4) adds no span and no length',
              sorted(S('C0', 'S1')['fibers']) == [2, 3] and S('C0', 'S1')['runs'] == ['L12', 'L12'] and S('P300', 'P350')['runs'] == ['F72'] and S('C0', 'X1')['fibers'] == []
              and not any(kof.get(s['ia'], '').startswith('E') or kof.get(s['ib'], '').startswith('E') for s in M['spans']) and L[4]['ex'] and L[4]['gaps'] == [],
              (S('C0', 'S1'), S('C0', 'X1'), len(M['spans'])))
        RK = {r['k']: r for r in recs}
        def hav(a, b):
            r = math.pi / 180; dl = (b['lat'] - a['lat']) * r; dn = (b['lon'] - a['lon']) * r
            h = math.sin(dl / 2) ** 2 + math.cos(a['lat'] * r) * math.cos(b['lat'] * r) * math.sin(dn / 2) ** 2
            return 2 * R_E * math.asin(math.sqrt(h))
        x1len = hav(RK['C0'], RK['X1'])
        check('A2. cable on the spans = Fiber 1 + Fiber 2 + Fiber 3 (the shared spans twice) + the span on no fiber',
              abs(M['cableTotal'] - (L[1]['len'] + L[2]['len'] + L[3]['len'] + x1len)) < 1 and M['cableTotal'] > M['total'], (M['cableTotal'], M['total'], L[1]['len'], L[2]['len'], L[3]['len'], x1len))
        lane = S('C0', 'S1'); east_first = lane['lanes']
        # the lane order is relative to the span's a -> b; F2 must be on the east side (it goes off east)
        a_is_c0 = kof[lane['ia']] == 'C0'  # going south: the left (higher lane index) is east
        f2_east = (lane['lanes'].index(2) > lane['lanes'].index(3)) == a_is_c0
        check('A3. lanes: on the shared spans Fiber 2 (goes off east) is on the east side of Fiber 3 (west), so they do not cross where they part', f2_east, lane)
        check('A4. sides as on the plan: Fiber 2 right, Fiber 3 left (legs from the same closure); Fiber 1 none; ends: F1 ODF-01 (Existing) -> closure CL-0001 (New); F2 -> closure CL-0007 (Existing); F3 -> ODF-02 (Existing)',
              L[2]['side'] == 'right' and L[3]['side'] == 'left' and L[1]['side'] == ''
              and (L[1]['from']['kind'], L[1]['from']['ref'], L[1]['from']['state']) == ('ODF', 'ODF-01', 'Existing') and (L[1]['to']['kind'], L[1]['to']['ref'], L[1]['to']['state']) == ('Closure', 'CL-0001', 'New')
              and (L[2]['to']['kind'], L[2]['to']['ref'], L[2]['to']['state']) == ('Closure', 'CL-0007', 'Existing') and (L[3]['to']['kind'], L[3]['to']['ref']) == ('ODF', 'ODF-02'),
              {n: (L[n]['side'], L[n]['from'], L[n]['to']) for n in (1, 2, 3)})
        FL = await pg.evaluate("__polecam.fibLoops()"); lp = {r[0]: r[1] for r in FL['list']}
        wh = lambda k: sorted((e[0], e[2], e[3]) for e in lp.get(pid[k], []))
        check('A5. loops per fiber: closure CL-0001 one for each fiber there (F1 15 m, F2 10 m, F3 10 m); the surveyor\'s loop at S1 for F2 and F3; the NAP\'s one (F2); CL-0007 (F2); the entrances ODF-01 (F1) and ODF-02 (F3); the app adds F1 at CC-1200 and CC-1450 (250-300 m; CC-1500 is a hair over 300 m) and F3 at L8 (450-500 m), none on F2 (the NAP loop resets it); 12 loops, 3 by the app',
              wh('C0') == [(1, 15, 'closure'), (2, 10, 'closure'), (3, 10, 'closure')] and wh('S1') == [(2, 10, 'surveyor'), (3, 10, 'surveyor')] and wh('R6') == [(2, 10, 'NAP')]
              and wh('R12') == [(2, 10, 'closure')] and wh('ODF1') == [(1, 15, 'entrance')] and wh('ODF2') == [(3, 10, 'entrance')]
              and wh('P200') == [(1, 15, 'auto')] and wh('P450') == [(1, 15, 'auto')] and wh('L8') == [(3, 10, 'auto')] and FL['n'] == 12 and FL['nAuto'] == 3, FL)
        hw = {k: await pg.evaluate("(p) => __polecam.fibHw(p)", pid[k]) for k in ('S1', 'R1', 'R12', 'S2', 'C0', 'L5')}
        H = lambda k: [tuple(x) for x in hw[k]['items']]
        check('A6. hardware: S1 (F2 and F3 pass) Retractor 2 + Span clamp 4; R1 (F2 passes) 2 + 2; R12 (F2 ends) 1 + 1; S2 with a telco arm: J-hook 2 + Span clamp 4 (2 a fiber); C0 (F2, F3 end; a 12C span on no fiber; the 72C) Retractor 2 + Span clamp 3, with pole clamps',
              H('S1') == [('Retractor', 2, '12C'), ('Span clamp', 4, '12C')] and hw['S1']['noClamp'] and H('R1') == [('Retractor', 2, '12C'), ('Span clamp', 2, '12C')] and H('R12') == [('Retractor', 1, '12C'), ('Span clamp', 1, '12C')]
              and H('S2') == [('J-hook', 2, '12C · telco arm'), ('Span clamp', 4, '12C · telco arm')] and H('C0') == [('Retractor', 2, '12C'), ('Span clamp', 3, '12C')] and not hw['C0']['noClamp'], hw)
        q = qty(await pg.evaluate("__polecam.fibQty()"))
        lm = lambda n: sum(e[2] for r in FL['list'] for e in r[1] if e[0] == n)
        check('A7. quantities: FIBERS 3; FIBER_1/2/3 = spans + that fiber\'s loops; MLOOP_COUNT 12, MLOOP_AUTO 3; FOC_TOTAL = cable on the spans + every loop',
              q.get('FIBERS') == 3 and abs(q['FIBER_1'] - round(L[1]['len'] + lm(1), 1)) < 0.2 and abs(q['FIBER_2'] - round(L[2]['len'] + lm(2), 1)) < 0.2 and abs(q['FIBER_3'] - round(L[3]['len'] + lm(3), 1)) < 0.2
              and q['MLOOP_COUNT'] == 12 and q['MLOOP_AUTO'] == 3 and abs(q['FOC_TOTAL'] - (M['cableTotal'] + sum(lm(n) for n in (1, 2, 3)))) < 0.5 and 'FIBER_4' not in q,
              {k: v for k, v in q.items() if k.startswith(('FIB', 'MLOOP_COUNT', 'MLOOP_AUTO', 'FOC_TOTAL', 'DE'))})
        bq = await pg.evaluate("__polecam.boqRows()")
        loopsB = sorted((r[1], r[2], r[3]) for r in bq if r[0] == 'Maintenance loop')
        hwB = {}
        for r in bq:
            if r[0] in ('Retractor', 'Span clamp', 'J-hook'): hwB[r[0]] = hwB.get(r[0], 0) + r[3]
        check('A8. BOQ: a maintenance loop for each fiber at each point (poles: 15 m x3, 10 m x7; ODF entrances 15 m and 10 m), 12 in all',
              loopsB == sorted([('10 m', 'ODF entrance', 1), ('10 m', 'Pole', 7), ('15 m', 'ODF entrance', 1), ('15 m', 'Pole', 3)]), (loopsB, hwB))
        adv = await pg.evaluate("__polecam.routeAdvice().map((a) => a.text)")
        check('A9. the route check: 1 span on no fiber (C0 -> X1), along each fiber (72C and 12C limits), no false flag for the fibers\' ends',
              any('1 span on no fiber' in a and 'CC-2000 → CC-5001' in a for a in adv) and not any('starts at' in a or 'ends at' in a for a in adv), adv)
        await pg.screenshot(path=OUT + '/a_map.png')
        # ---------------- B. Route UI
        await pg.click('#routeBtn'); await W(pg, 900)
        chips = await pg.evaluate("[...document.querySelectorAll('#rbFibers .fchip')].map((b) => b.textContent)")
        check('B1. Route: the fibers row: All, F1 · 72C, F2 · 12C · right, F3 · 12C · left, F4 · existing, + Fiber', chips == ['All', 'F1 · 72C', 'F2 · 12C · right', 'F3 · 12C · left', 'F4 · existing', '+ Fiber'], chips)
        lanes0 = await pg.evaluate("__polecam.fibLanes()")
        await pg.click('#rbFibers .fchip[data-fb="2"]'); await W(pg, 500)
        card = await pg.evaluate("document.getElementById('rbFib').innerText")
        lanes = await pg.evaluate("__polecam.fibLanes()")
        ln = [l for l in lanes if not l.get('arrow')]
        f2 = [l for l in ln if l['w'] == 6]; dim = [l for l in ln if l['op'] < 0.5]; arrows = [l for l in lanes if l.get('arrow')]
        check('B2. tap F2: its card (Fiber 2 · right, 14 spans, from closure CL-0001 at CC-2000 to closure CL-0007, shares 2 spans with F3), its whole way thick with an arrow on each span, the other fibers faded; the existing cable dashed',
              'Fiber 2 · right' in card and '14 spans' in card and 'Light 12C' in card and 'Closure CL-0001 at CC-2000' in card and 'Closure CL-0007' in card and 'Shares 2 spans' in card and 'with F3' in card
              and len(f2) == 1 and len(dim) == 3 and len(arrows) == 14 and any(l['dash'] for l in ln), (card, len(ln), len(f2), len(dim), len(arrows)))
        # the lanes on the map: F2 east of F3 along the shared spans
        c0, s1 = [r for r in recs if r['k'] == 'C0'][0], [r for r in recs if r['k'] == 'S1'][0]
        def lane_lon(color):
            L2 = [l for l in ln if l['color'] == color][0]['ll']; mid = (c0['lat'] + s1['lat']) / 2
            return min(L2, key=lambda q: abs(q[0] - mid) + 10 * abs(q[1] - c0['lon']))[1]
        col2 = [l['color'] for l in ln if l['w'] == 6][0]; col3 = [l['color'] for l in lanes0 if not l.get('arrow') and l['color'] != col2 and l['color'] not in ('#7048e8',)][0]
        check('B3. the map: on the shared spans the two lanes are apart, Fiber 2 east of Fiber 3 (no crossing where they part)', lane_lon(col2) > lane_lon(col3), (lane_lon(col2), lane_lon(col3)))
        await pg.screenshot(path=OUT + '/b_f2.png')
        # tap the shared span: its fibers
        await pg.evaluate("(ab) => { const s = __polecam.route().spans.find((x) => (x.ia === ab[0] && x.ib === ab[1]) || (x.ia === ab[1] && x.ib === ab[0])); }", [ids['C0'], ids['S1']])
        await pg.click('#rbFibers .fchip[data-fb="all"]'); await W(pg, 300)
        await pg.evaluate("(id) => __polecam.routeTap(id)", ids['C0']); await W(pg, 300)
        clo = await pg.evaluate("(document.querySelector('#rbFibers .clo') || {}).textContent || ''")
        spans_at = await pg.evaluate("[...document.querySelectorAll('#rbSpans button')].map((b) => b.textContent)")
        await pg.locator('#rbSpans button', has_text='CC-2001').first.click(); await W(pg, 400)
        panel = await pg.evaluate("document.getElementById('rbSpan').innerText")
        check('B4. a closure pole selected: "Closure CL-0001 at CC-2000: F1 ends · F2 starts (right) · F3 starts (left)"; its spans with their fibers; the shared span lists Fiber 2 and Fiber 3 with where each goes',
              'Closure CL-0001 at CC-2000' in clo and 'F1 ends' in clo and 'F2 starts (right)' in clo and 'F3 starts (left)' in clo and any('F2 F3' in t for t in spans_at)
              and 'Fiber 2' in panel and 'Fiber 3' in panel and '2 fibers on this span' in panel, (clo, spans_at, panel))
        await pg.locator('#rbSpan button[data-rs="fib"][data-n="3"]').click(); await W(pg, 300)
        st = await pg.evaluate("__polecam.fibState()")
        # a tap on a fiber's span pair does not unlink it
        await pg.evaluate("(id) => __polecam.routeTap(id)", ids['C0']); await W(pg, 200); await pg.evaluate("(id) => __polecam.routeTap(id)", ids['S1']); await W(pg, 300)
        toast = await pg.evaluate("document.getElementById('toast').textContent"); M2 = await pg.evaluate("__polecam.fibModel()")
        check('B5. a fiber in the span panel selects it; tapping the two poles of a fiber\'s span does not unlink it (it carries Fiber 2, Fiber 3)',
              st['fibSel'] == 3 and 'carries Fiber 2, Fiber 3' in toast and len(M2['spans']) == len(M['spans']), (st, toast))
        # + Fiber from the closure pole: follows the spans (shared), then a new span, Done, Delete, Undo
        await pg.evaluate("(id) => __polecam.routeTap(id)", ids['S1']); await W(pg, 200)  # deselect
        await pg.evaluate("(id) => __polecam.routeTap(id)", ids['C0']); await W(pg, 300)
        await pg.click('#rbFibers .fchip[data-fb="new"]'); await W(pg, 400)
        st1 = await pg.evaluate("__polecam.fibState()"); hint = await pg.evaluate("document.getElementById('rbHint').textContent")
        await pg.evaluate("(id) => __polecam.routeTap(id)", ids['R2']); await W(pg, 400)
        t1 = await pg.evaluate("document.getElementById('toast').textContent")
        await pg.evaluate("(id) => __polecam.routeTap(id)", ids['E1']); await W(pg, 400)
        t2 = await pg.evaluate("document.getElementById('toast').textContent")
        F5 = [f for f in await pg.evaluate("__polecam.fibers()") if f['n'] == 5][0]
        M3 = await pg.evaluate("__polecam.fibModel()")
        check('B6. + Fiber from CC-2000: Fiber 5 starts there; tapping CC-3002 follows the spans (+ CC-2001, CC-2002, CC-3001, CC-3002, shared with F2, F3); tapping CC-6001 makes a new span',
              st1 == {'fibSel': 5, 'fibAdd': 5} and 'Adding to Fiber 5' in hint and [kof[x] for x in F5['path']] == ['C0', 'S1', 'S2', 'R1', 'R2', 'E1']
              and 'follows the spans' in t1 and 'CC-2001, CC-2002, CC-3001, CC-3002' in t1 and 'F2' in t1 and 'a new span' in t2 and len(M3['spans']) == len(M['spans']) + 1, (st1, hint, t1, t2, [kof[x] for x in F5['path']]))
        await pg.click('#rbFib button[data-fa="add"]'); await W(pg, 300)
        adv2 = await pg.evaluate("__polecam.routeAdvice().map((a) => a.text)")
        await pg.click('#rbFib button[data-fa="del"]'); await W(pg, 200); await pg.click('#rbFib button[data-fa="del"]'); await W(pg, 400)
        n_del = len(await pg.evaluate("__polecam.fibers()"))
        await pg.click('#rbUndo'); await W(pg, 500)
        n_undo = len(await pg.evaluate("__polecam.fibers()"))
        check('B7. Done adding: the check says Fiber 5 ends at a plain pole; Delete (tap twice) removes it; Undo brings it back', any('Fiber 5 ends at CC-6001' in a for a in adv2) and n_del == 4 and n_undo == 5, (adv2, n_del, n_undo))
        await pg.screenshot(path=OUT + '/b_ui.png')
        # delete Fiber 3 by its card: the later fibers move down a number
        await pg.click('#rbFibers .fchip[data-fb="3"]'); await W(pg, 300)
        await pg.click('#rbFib button[data-fa="del"]'); await W(pg, 200); await pg.click('#rbFib button[data-fa="del"]'); await W(pg, 400)
        ns = sorted(f['n'] for f in await pg.evaluate("__polecam.fibers()"))
        await pg.click('#rbUndo'); await W(pg, 400); await pg.click('#rbUndo'); await W(pg, 400)  # Fiber 3 back, then Fiber 5's last tap, ... (undo twice)
        await pg.evaluate("__polecam.setFibers(__polecam.fibers().filter((f) => f.n <= 4))"); await W(pg, 300)
        check('B8. deleting Fiber 3: the fibers after it move down a number (1, 2, 3, 4 left)', ns == [1, 2, 3, 4], ns)
        await pg.click('#rbDone'); await W(pg, 400)
        # ---------------- C. exports
        kml = await pg.evaluate("__polecam.kmzFibers()")
        check('C1. KMZ: the fibers, each one line from its start to its end (F4 existing)', [f['n'] for f in kml] == [1, 2, 3, 4] and kml[3]['ex'] and kml[1]['side'] == 'right' and len(kml[2]['pts']) == 15, [(f['n'], f['from'], f['to'], len(f['pts'])) for f in kml])
        f = await export(pg, 'doRouteXlsx', 'route.xlsx') if await pg.evaluate("!!document.getElementById('doRouteXlsx')") else None
        if f:
            wb = openpyxl.load_workbook(f); names = wb.sheetnames
            fs = [[c.value for c in r] for r in wb['Fibers'].iter_rows()] if 'Fibers' in names else []
            spr = [[c.value for c in r] for r in wb['Spans'].iter_rows()]
            runs = sorted({r[3] for r in spr[1:]}, key=str)
            check('C2. route Excel: a Fibers sheet (Fiber 1..4, sides, ends, loops, cable) and the Spans sheet\'s Run column F1, F2, F3 (and 1 for the span on no fiber)',
                  'Fibers' in names and [r[0] for r in fs[1:]] == ['Fiber 1', 'Fiber 2', 'Fiber 3', 'Fiber 4'] and fs[2][1] == 'right' and fs[3][1] == 'left' and fs[4][3].startswith('Existing') and fs[1][11] == 4 and set(runs) >= {'F1', 'F2', 'F3'},
                  (names, fs[:5], runs))
        else: check('C2. route Excel button found', False, 'no doRouteXlsx')
        check('C9. no page errors', not errs, errs[:5])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
