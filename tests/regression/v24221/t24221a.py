"""v2.42.21 (synthetic data only): drawing the cable route on the map.
 Route mode: a small bar; a drag on the map moves it; a drag from a pole draws a fiber (snap 10 m: the poles across the street stay off);
 drag again from its end goes on; a tap on the next pole goes on (the points on the line come in); a tap on a pole on it: the cable only
 passes (spans redone); again: put back; right-click and the bar's ↶ undo; the whole fiber's cable: existing 48C (its spans go), back to
 proposed 72C; ✓ with no other cable: no question; a branch from the middle of Fiber 1 and ✓: the closure question; Add closure (the pole's
 record) and Undo; tap a fiber's end: you are on it; Esc finishes; a pole's options; a new existing 24C fiber by taps; Done. Touch (CDP):
 one finger moves the map, one finger from a pole draws; the page does not scroll."""
import asyncio, sys, os, shutil, json, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
OUT = S + '/v24221/out_a'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:1500], flush=True)
W = lambda pg, ms: pg.wait_for_timeout(ms)
R_E = 6371008.8; LAT, LON0 = 7.1036, 125.6180
def at(dx, dy=0.0): return (LAT + dy / (R_E * math.pi / 180), LON0 + dx / (R_E * math.cos(math.radians(LAT)) * math.pi / 180))
def synth():
    recs = [{'k': 'ODF1', 'element': 'ODF', 'poleId': 'ODF-01', 'xy': (-60, 0)}]
    recs += [{'k': f'A{i}', 'element': 'Pole', 'poleId': f'CC-{1000 + i}', 'xy': (50 * i, 0)} for i in range(11)]
    recs += [{'k': f'B{i}', 'element': 'Pole', 'poleId': f'CC-{2000 + i}', 'xy': (25 + 50 * i, 30)} for i in range(10)]  # across the street
    recs += [{'k': f'V{k}', 'element': 'Pole', 'poleId': f'CC-{3000 + k}', 'xy': (500, -50 * k)} for k in range(1, 7)]
    recs += [{'k': f'W{k}', 'element': 'Pole', 'poleId': f'CC-{4000 + k}', 'xy': (350, -50 * k)} for k in range(1, 4)]
    recs += [{'k': f'R{k}', 'element': 'Pole', 'poleId': f'CC-{5000 + k}', 'xy': (500 + 50 * k, -300)} for k in range(1, 7)]
    recs[-1]['x'] = {'closure': True, 'closureId': 'CL-0009'}; recs[-1]['boq'] = {'cloSt': 'Existing', 'clo': '24C'}
    for r in recs:
        r['lat'], r['lon'] = at(*r['xy']); r['status'] = 'Existing'; r['poleType'] = 'Concrete' if r['element'] == 'Pole' else ''
        if r['element'] == 'Pole': r['boq'] = {'owner': 'Electric', **r.get('boq', {})}
    return recs
ADD = """([proj, recs]) => { const P = __polecam.points, ids = {}, t0 = Date.parse('2026-11-07T01:00:00Z');
  recs.forEach((r, i) => { const id = proj + '_' + r.k; ids[r.k] = id; const t = new Date(t0 + i * 1000).toISOString();
    P.push({ id, project: proj, created: t, takenAt: t, updated: t, source: 'map', poleId: r.poleId, poleType: r.poleType || '', lat: r.lat, lon: r.lon, element: r.element, status: r.status,
      remarks: '', closureId: '', boxes: 0, details: [], marks: [], boq: r.boq || {}, ...(r.x || {}), by: 'Test surveyor', updatedBy: 'Test surveyor' }); });
  const S = __polecam.S; S.meta[proj] = { ...(S.meta[proj] || {}), links: [], fibers: [] }; __polecam.persist(); __polecam.renderPoles(); return ids; }"""
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 250)
async def sheet(route):
    if route.request.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'name': 'Test sheet', 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False}))

async def setup(p, udir, vw, vh, mobile=False):
    ctx = await p.chromium.launch_persistent_context(udir, executable_path=common.CHROME, viewport={'width': vw, 'height': vh}, has_touch=mobile, is_mobile=mobile, service_workers='block')
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
    await common.newproj(pg, 'survey', 'ROUTE_DRAW', purpose='As-plan'); await close_sheets(pg)
    recs = synth(); ids = await pg.evaluate(ADD, ['ROUTE_DRAW', recs])
    return ctx, pg, errs, ids, {r['k']: r for r in recs}

async def main():
    async with async_playwright() as p:
        ctx, pg, errs, ids, RK = await setup(p, OUT + '/ud', 1000, 900)
        kof = {v: k for k, v in ids.items()}
        F = lambda: pg.evaluate("__polecam.fibers()")
        ST = lambda: pg.evaluate("__polecam.rtState()")
        names = lambda path: [kof[x] for x in path]
        def xy(k, dx=0, dy=0):  # screen point of a synthetic place
            la, lo = at(RK[k]['xy'][0] + dx, RK[k]['xy'][1] + dy); return pg.evaluate("([a, b]) => __polecam.mapPt(a, b)", [la, lo])
        async def drag(pts, steps=6):
            P = [await q for q in pts]
            await pg.mouse.move(*P[0]); await pg.mouse.down()
            for a, b in zip(P, P[1:]):
                for i in range(1, steps + 1): await pg.mouse.move(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps); await W(pg, 12)
            await pg.mouse.up(); await W(pg, 250)
        async def tap(k, button='left'):
            x, y = await xy(k); await pg.mouse.click(x, y, button=button); await W(pg, 250)
        async def view(k, z=18.3):
            la, lo = at(*RK[k]['xy']); await pg.evaluate("([a, b, z]) => __polecam.mapView(a, b, z)", [la, lo, z]); await W(pg, 400)
        links = lambda: pg.evaluate("__polecam.S.meta.ROUTE_DRAW.links")
        lk = lambda L: sorted(tuple(sorted((kof[l[0]], kof[l[1]]))) for l in L)

        await pg.click('#routeBtn'); await W(pg, 900)
        bh = await pg.evaluate("document.getElementById('rtBar').getBoundingClientRect().height")
        check('B1. Route: one small bar (no Route tools card), Drag from a pole to draw', bh < 110 and await pg.locator('#rtBar').is_visible() and not await pg.locator('#routeBar').is_visible() and 'Drag from a pole to draw' in await pg.inner_text('#rtBar'), bh)
        await view('A4')
        c0 = await pg.evaluate("__polecam.map.getCenter()") if await pg.evaluate("!!__polecam.map") else None
        cen = lambda: pg.evaluate("(() => { const c = __polecam.mapCenter ? __polecam.mapCenter() : null; return c; })()")
        z0 = await pg.evaluate("__polecam.mapPt(%f, %f)" % at(*RK['A4']['xy']))
        await drag([xy('A4', 0, -70), xy('A4', -60, -20)])
        z1 = await pg.evaluate("__polecam.mapPt(%f, %f)" % at(*RK['A4']['xy']))
        check('B2. a drag on the map (not on a pole) moves it, and draws nothing', abs(z1[0] - z0[0]) > 30 and not await F(), (z0, z1))
        await view('A3')
        await pg.click('#rtBar [data-p="new"]'); await W(pg, 200); await pg.click('#rtPop [data-snap="10"]'); await W(pg, 250); await pg.keyboard.press('Escape'); await W(pg, 200)
        st = await ST(); check('B3. the snap (in ＋, and ◎ on a fiber): 10 m, kept on this phone', st['snap'] == 10 and await pg.evaluate("__polecam.S.routeSnap") == 10 and not st['pop'], st)
        await drag([xy('ODF1'), xy('A1', 0, -3), xy('A3', 0, 3), xy('A5', 0, -2)])
        f = await F(); st = await ST()
        check('B4. a drag from ODF-01 along the poles: Fiber 1 on ODF-01, CC-1000…CC-1005 (the poles across the street stay off), its spans made; you are on it',
              len(f) == 1 and names(f[0]['path']) == ['ODF1', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'] and st['fibAdd'] == 1 and len(await links()) == 6, (f and names(f[0]['path']), st))
        await pg.screenshot(path=OUT + '/b4.png')
        await view('A7')
        await drag([xy('A5'), xy('A7', 0, 3), xy('A10', 0, -2)])
        f = await F(); check('B5. a drag from its end (the ring) goes on to CC-1010', names(f[0]['path'])[-1] == 'A10' and len(f[0]['path']) == 12, names(f[0]['path']))
        await view('V3')
        await tap('V1'); f = await F()
        check('B6. a tap on the next pole goes on (a new span)', names(f[0]['path'])[-1] == 'V1', names(f[0]['path'])[-3:])
        await tap('V5'); f = await F()
        check('B7. a tap further on: the points on the line come in (CC-3002…CC-3005), each step its span', names(f[0]['path'])[-4:] == ['V2', 'V3', 'V4', 'V5'] and ('V3', 'V4') in lk(await links()), names(f[0]['path'])[-5:])
        await view('A3')
        await tap('A3'); f = await F(); L = lk(await links())
        check('B8. a tap on a pole on it: the cable only passes CC-1003 (off the fiber; CC-1002 → CC-1004 one span)', 'A3' not in names(f[0]['path']) and ('A2', 'A4') in L and ('A2', 'A3') not in L and ('A3', 'A4') not in L, L[:8])
        lab = await pg.evaluate("[...document.querySelectorAll('.rt-pass')].length")
        check('B9. CC-1003 shows "passes"', lab >= 1, lab)
        await tap('A3'); f = await F(); L = lk(await links())
        check('B10. a tap on it again: back on the fiber between CC-1002 and CC-1004', names(f[0]['path'])[2:6] == ['A1', 'A2', 'A3', 'A4'] and ('A2', 'A3') in L and ('A2', 'A4') not in L, names(f[0]['path'])[:7])
        x, y = await xy('A6', 0, -40); await pg.mouse.click(x, y, button='right'); await W(pg, 300); f = await F()
        check('B11. a right-click undoes (CC-1003 off again)', 'A3' not in names(f[0]['path']), names(f[0]['path'])[:6])
        await pg.click('#rtUndo'); await W(pg, 300); f = await F()
        check('B12. the bar\'s ↶ undoes too (CC-1003 back)', 'A3' in names(f[0]['path']), names(f[0]['path'])[:6])
        await pg.click('#rtBar [data-p="cab"]'); await W(pg, 200); await pg.click('#rtPop [data-fkind="e"]'); await W(pg, 200)
        await pg.screenshot(path=OUT + '/b13.png')
        await pg.click('#rtPop [data-fcores="48"]'); await W(pg, 300); f = await F()
        check('B13. the whole fiber an existing 48C: drawn only, its spans go', f[0]['ex'] and f[0]['cores'] == 48 and len(await links()) == 0 and 'Existing 48C' in await pg.inner_text('#rtBar'), (f[0].get('ex'), f[0].get('cores'), len(await links())))
        await pg.click('#rtBar [data-p="cab"]'); await W(pg, 200); await pg.fill('#fCoreIn', '36'); await pg.click('#rtPop [data-coreset="f"]'); await W(pg, 300); f = await F()
        check('B14. another size typed: 36C', f[0]['ex'] and f[0]['cores'] == 36, f[0].get('cores'))
        await pg.click('#rtBar [data-p="cab"]'); await W(pg, 200); await pg.click('#rtPop [data-fkind="p"]'); await W(pg, 200); await pg.click('#rtPop [data-fcab="F72"]'); await W(pg, 300); f = await F()
        check('B15. back to proposed, Fig-8 72C: its spans again, one a step', not f[0]['ex'] and f[0]['cab'] == 'F72' and len(await links()) == len(f[0]['path']) - 1, (f[0]['cab'], len(await links())))
        await pg.click('#rtFinish'); await W(pg, 300); st = await ST()
        check('B16. ✓ finishes it; no other cable at its ends: no closure question', st['fibAdd'] is None and not st['pend'], st)
        await view('W2')
        await drag([xy('A7'), xy('W1', 3, 0), xy('W3', 2, 0)])
        f = await F(); st = await ST()
        check('B17. a drag from CC-1007 (the middle of Fiber 1): Fiber 2 branches from it', len(f) == 2 and names(f[1]['path']) == ['A7', 'W1', 'W2', 'W3'] and st['fibAdd'] == 2 and f[1]['cab'] == 'L12', (names(f[1]['path']) if len(f) > 1 else f, st))
        await pg.keyboard.press('Escape'); await W(pg, 300); st = await ST()
        check('B18. Esc finishes it: the bar asks whether to add a closure at CC-1007 (Fiber 1 passes there)', st['fibAdd'] is None and st['pend'] == ['CC-1007'] and 'Add a closure at CC-1007?' in await pg.inner_text('#rtBar'), (st, await pg.inner_text('#rtBar')))
        await pg.screenshot(path=OUT + '/b18.png')
        await pg.click('#rtBar [data-rt="askadd"]'); await W(pg, 600)
        rec = await pg.evaluate("(id) => __polecam.points.find((p) => p.id === id)", ids['A7'])
        check('B19. Add closure: the pole\'s record has a closure (new), no ID or size yet', rec['closure'] is True and rec['boq'].get('cloSt') == 'New' and not (await ST())['pend'], (rec.get('closure'), rec.get('boq')))
        await pg.click('#rtUndo'); await W(pg, 600)
        rec = await pg.evaluate("(id) => __polecam.points.find((p) => p.id === id)", ids['A7'])
        check('B20. ↶: the closure comes off the record again', not rec.get('closure'), rec.get('closure'))
        await view('V5')
        await tap('V5'); st = await ST()
        check('B21. a tap on a fiber\'s end (CC-3005, Fiber 1): you are on Fiber 1, going on from there', st['fibAdd'] == 1 and st['fibAt'] == 'end', st)
        await pg.keyboard.press('Escape'); await W(pg, 300); st = await ST()
        check('B22. Esc with nothing changed: finished, no question', st['fibAdd'] is None and not st['pend'], st)
        await view('A2')
        await tap('A2'); t = await pg.inner_text('#rtBar')
        check('B23. a tap on a pole: its options in the bar (F1 only passes, ＋ Closure, ＋ New fiber here, Spans)', 'F1 only passes' in t and 'Closure' in t and 'New fiber here' in t and 'Spans' in t, t.replace('\n', ' | '))
        await pg.screenshot(path=OUT + '/b23.png')
        await pg.click('#rtBar [data-rt="spans"]'); await W(pg, 400)
        check('B24. Spans ›: Route tools open with its spans', await pg.locator('#routeBar').is_visible() and await pg.locator('#rbSpans').is_visible(), await pg.inner_text('#rbSpans') if await pg.locator('#rbSpans').count() else '')
        await pg.click('#rbToolsClose'); await W(pg, 300); await pg.click('#rtBar [data-rt="unsel"]'); await W(pg, 200)
        await view('R3')
        await pg.click('#rtBar [data-p="new"]'); await W(pg, 200); await pg.click('#rtPop [data-nkind="e"]'); await W(pg, 200); await pg.click('#rtPop [data-ncores="24"]'); await W(pg, 300)
        await tap('R1'); await tap('R6'); f = await F(); st = await ST()
        check('B25. ＋ an existing 24C, then two taps: Fiber 3 on CC-5001…CC-5006 (the points on the line), drawn only (no span)', len(f) == 3 and names(f[2]['path']) == ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] and f[2]['ex'] and f[2]['cores'] == 24 and st['fibAdd'] == 3
              and not any('R' in a or 'R' in b for a, b in lk(await links())), (f[-1], st))
        await pg.click('#rtFinish'); await W(pg, 300); st = await ST()
        check('B26. ✓: its end CC-5006 has a closure (CL-0009): no question', not st['pend'], st)
        # the fiber card in Route tools: its end and the existing size are kept; Done adding finishes it and keeps the card open
        await pg.evaluate("__polecam.routeTools(true)"); await W(pg, 400)
        await pg.click('#rbFibers button[data-fb="3"]'); await W(pg, 300)
        await pg.select_option('#rbFib select[data-fa="toSt"]', 'Existing'); await W(pg, 300)
        await pg.select_option('#rbFib select[data-fa="cores"]', '48'); await W(pg, 300)
        await pg.select_option('#rbFib select[data-fa="fromSt"]', 'New'); await W(pg, 300)
        f = await F()
        check('B26b. the fiber card: To end Existing, From end New, size 48C, all kept on Fiber 3', f[2].get('toSt') == 'Existing' and f[2].get('fromSt') == 'New' and f[2].get('cores') == 48, f[2])
        await pg.click('#rbFib [data-fa="add"]'); await W(pg, 300); a1 = (await ST())['fibAdd']
        await pg.click('#rbFib [data-fa="add"]'); await W(pg, 300); st = await ST()
        check('B26c. + Add points, then Done adding: finished, the card stays open', a1 == 3 and st['fibAdd'] is None and await pg.locator('#rbFib').is_visible() and 'Fiber 3' in await pg.inner_text('#rbFib'), (a1, st))
        await pg.click('#rbToolsClose'); await W(pg, 300)
        await pg.click('#rtDone'); await W(pg, 500)
        check('B27. Done: Route closed (the bar gone)', not await pg.locator('#rtBar').is_visible() and await pg.evaluate("!document.body.classList.contains('routing')"), '')
        check('B28. no page errors', not errs, errs[:3])
        await ctx.close()

        # touch (CDP): one finger moves the map; one finger from a pole draws; the page does not scroll
        ctx, pg, errs, ids, RK = await setup(p, OUT + '/ud2', 412, 860, mobile=True)
        kof = {v: k for k, v in ids.items()}
        cdp = await ctx.new_cdp_session(pg)
        async def touch(pts, steps=7):
            P = [await q for q in pts]
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': P[0][0], 'y': P[0][1]}]})
            for a, b in zip(P, P[1:]):
                for i in range(1, steps + 1): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': a[0] + (b[0] - a[0]) * i / steps, 'y': a[1] + (b[1] - a[1]) * i / steps}]}); await W(pg, 16)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await W(pg, 300)
        await pg.click('#routeBtn'); await W(pg, 900)
        la, lo = at(*RK['A3']['xy']); await pg.evaluate("([a, b, z]) => __polecam.mapView(a, b, z)", [la, lo, 18.2]); await W(pg, 400)
        p0 = await pg.evaluate("__polecam.mapPt(%f, %f)" % at(*RK['A3']['xy'])); sy0 = await pg.evaluate("scrollY")
        await touch([xy('A3', 0, -60), xy('A3', -50, -20)])
        p1 = await pg.evaluate("__polecam.mapPt(%f, %f)" % at(*RK['A3']['xy']))
        check('C1. touch: one finger off the poles moves the map; nothing drawn; the page does not scroll', abs(p1[0] - p0[0]) > 25 and not await pg.evaluate("__polecam.fibers()") and await pg.evaluate("scrollY") == sy0, (p0, p1))
        await pg.evaluate("__polecam.S.routeSnap = 10"); await pg.evaluate("([a, b, z]) => __polecam.mapView(a, b, z)", [la, lo, 18.2]); await W(pg, 400)
        await touch([xy('A1'), xy('A2', 0, 3), xy('A4', 0, -2)])
        f = await pg.evaluate("__polecam.fibers()")
        check('C2. touch: one finger from CC-1001 draws Fiber 1 to CC-1004', len(f) == 1 and [kof[x] for x in f[0]['path']] == ['A1', 'A2', 'A3', 'A4'], f and [kof[x] for x in f[0]['path']])
        await pg.screenshot(path=OUT + '/c2_phone.png')
        la, lo = at(*RK['A5']['xy']); await pg.evaluate("([a, b, z]) => __polecam.mapView(a, b, z)", [la, lo, 18.2]); await W(pg, 400)
        x, y = await xy('A6'); await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]}); await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await W(pg, 400)
        f = await pg.evaluate("__polecam.fibers()")
        check('C3. touch: a tap on CC-1006 goes on (CC-1005 on the line comes in)', [kof[x] for x in f[0]['path']][-2:] == ['A5', 'A6'], [kof[x] for x in f[0]['path']])
        check('C4. no page errors (touch)', not errs, errs[:3])
        await ctx.close()
    print(f'\n{sum(checks)}/{len(checks)} passed')

asyncio.run(main())
