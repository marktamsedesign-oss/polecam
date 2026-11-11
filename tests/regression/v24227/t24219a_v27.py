"""v2.42.24 copy: part A on a made-up 260-point route (synthetic IDs and places; a new project, so its spans stay spans), not an imported project. v2.42.21 copy: Route opens with Route tools and linking by pairs (the route card as before v2.42.21).
v2.42.19 (synthetic data only):
 A. the 10 km sample on a desktop window: the record's map changes size at most twice in a scroll down and up (it flipped 30+ times in
    v2.42.18 on a window where the form is only a little taller); a long form on a phone still makes the map small and big again;
    the record's map draws the pole's own spans from its pin and they follow the pin; Route: a tap redraws only what changed (time),
    a selected pole lists its spans, one tapped opens its runs, a run added; no page errors.
 B. the photo: Straighten on at first: a wobbly L-shaped FOC route becomes 3 points (its corner kept), a wobbly straight one 2;
    Straighten off with the route selected: back as drawn; the choice kept; a route drawn then stays as drawn."""
import asyncio, sys, os, shutil, json, time, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
OUT = S + '/v24227/out_219v27'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
ADD = open(S + '/v24220/t24220a.py').read().split('ADD = """')[1].split('"""')[0]
def synth260():  # a made-up winding route of 260 poles, 40 m apart (about 10 km), linked in order (Fig-8 72C)
    R_E = 6371008.8; LAT, LON = 7.1036, 125.6180; out = []; x = y = 0.0; ang = 0.0
    for i in range(260):
        if i: ang += math.radians(14 if (i // 18) % 2 else -14) if i % 9 == 0 else 0; x += 40 * math.cos(ang); y += 40 * math.sin(ang)
        la = LAT + y / (R_E * math.pi / 180); lo = LON + x / (R_E * math.cos(math.radians(LAT)) * math.pi / 180)
        out.append({'k': f'Q{i}', 'poleId': f'CC-{8000 + i}', 'poleType': 'Concrete', 'lat': la, 'lon': lo, 'element': 'Pole', 'status': 'Existing', 'boq': {'owner': 'Electric', 'ownerName': 'DLPC'}})
    return out, [[f'Q{i}', f'Q{i + 1}', 'F72'] for i in range(259)]
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:1500], flush=True)
W = lambda pg, ms: pg.wait_for_timeout(ms)
async def sheet(route):
    if route.request.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    out = {'ok': True, 'name': 'Test sheet', 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False}
    return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 250)
async def admin(pg):
    await pg.fill('#pfName', 'Juan Dela Cruz'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'juan.delacruz@example.com')
    await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
    await pg.fill('#admName', 'Globe OSP'); await common.sheet_companies(pg, ['GLOBE', 'SAMPLE VENDOR'], admins=['GLOBE'])
    await pg.click('#admSave'); await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
    if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
    for _ in range(3):
        if not await pg.locator('#askBox:not([hidden])').count(): break
        b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
    await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
MINI = """() => { window.__mini = []; const w = document.getElementById('pinMapWrap'); if (window.__mo) window.__mo.disconnect(); window.__mo = new MutationObserver(() => window.__mini.push(w.classList.contains('mini'))); window.__mo.observe(w, { attributes: true, attributeFilter: ['class'] }); }"""
async def scroll_count(pg, step=8, n=90):
    await pg.evaluate(MINI)
    b = await pg.locator('#editor .edbody').bounding_box(); await pg.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] - 120)
    for i in range(n): await pg.mouse.wheel(0, step); await W(pg, 16)
    down = await pg.evaluate("window.__mini.slice()")
    for i in range(n): await pg.mouse.wheel(0, -step); await W(pg, 16)
    await W(pg, 600)
    return down, await pg.evaluate("window.__mini.slice()"), await pg.evaluate("() => { const b = document.querySelector('#editor .edbody'); return [b.scrollHeight, b.clientHeight, b.scrollTop]; }")
async def main():
    async with async_playwright() as p:
        # ======================= A. the 10 km sample, desktop window
        ctx = await p.chromium.launch_persistent_context(OUT + '/ud_a', executable_path=common.CHROME, viewport={'width': 1470, 'height': 1100}, accept_downloads=True, service_workers='block')
        await ctx.route('https://script.google.com/**', sheet)
        for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**'): await ctx.route(u, lambda r: r.abort())
        for js in (common.NO_DRAFT_JS, common.NO_SAVECHECK_JS, common.NO_SAMPLE_JS, common.ADM_OPEN_JS): await ctx.add_init_script(js)
        pg = ctx.pages[0]; errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(BASE + '/index.html'); await W(pg, 1500); await admin(pg)
        await common.newproj(pg, 'survey', 'SYN260', purpose='As-plan'); await close_sheets(pg)
        rr, ll_ = synth260(); await pg.evaluate(ADD, ['SYN260', rr, ll_, None])
        la_ = [r['lat'] for r in rr]; lo_ = [r['lon'] for r in rr]
        await pg.evaluate("([a, b]) => __polecam.map.fitBounds([[a[0], a[1]], [b[0], b[1]]])", [[min(la_), min(lo_)], [max(la_), max(lo_)]]); await W(pg, 800)
        for _ in range(600):
            if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): break
            await W(pg, 250)
        await W(pg, 1500)
        R = await pg.evaluate("__polecam.route()")
        P = await pg.evaluate("Object.fromEntries(__polecam.points.filter((x) => x.project === __polecam.S.project).map((x) => [x.id, [x.lat, x.lon, x.poleId]]))")
        deg = {}
        for s in R['spans']: deg[s['ia']] = deg.get(s['ia'], 0) + 1; deg[s['ib']] = deg.get(s['ib'], 0) + 1
        pid = next(i for i, d in deg.items() if d == 2 and P[i][2].startswith(('CC-', 'GT-')))
        # 1. the scroll
        await pg.evaluate("(id) => __polecam.openEditorFor(id)", pid); await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 1200)
        res = {}
        for tab in ('details', 'acc'):
            await pg.evaluate(f"__polecam.edTab('{tab}')"); await W(pg, 500)
            res[tab] = await scroll_count(pg)
        check('A1. the record on a desktop window where the form is only a little taller: the map changes size at most twice in a scroll down and back up (it flipped 30+ times in v2.42.18)',
              all(len(v[1]) <= 2 for v in res.values()), {k: (len(v[0]), len(v[1]), v[2]) for k, v in res.items()})
        # 2. the pole's own spans on the record's map, following the pin
        own = await pg.evaluate("__polecam.pinOwn()"); c0 = await pg.evaluate("__polecam.pinCenter()")
        ends = sorted(o['to'] for o in own); want = sorted([s['ib'] if s['ia'] == pid else s['ia'] for s in R['spans'] if pid in (s['ia'], s['ib'])])
        await pg.evaluate("__polecam.pinMap.panBy([60, 40], { animate: false })"); await W(pg, 400)
        own2 = await pg.evaluate("__polecam.pinOwn()"); c1 = await pg.evaluate("__polecam.pinCenter()")
        follow = all(abs(o['ll'][0][0] - c1[0]) < 1e-9 and abs(o['ll'][0][1] - c1[1]) < 1e-9 for o in own2) and c1 != c0
        await pg.screenshot(path=OUT + '/a_record_map.png')
        check('A2. the record\'s map draws the open pole\'s 2 spans from its pin to the poles it is linked to, and they follow the pin when it moves',
              ends == want and len(own) == 2 and all(abs(o['ll'][0][0] - c0[0]) < 1e-9 for o in own) and follow, (ends, want, follow))
        await pg.evaluate("() => { const e = document.getElementById('editor'); }"); await close_sheets(pg)
        for _ in range(3):
            if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button', has_text='Discard').first.click() if await pg.locator('#askBox button', has_text='Discard').count() else await pg.locator('#askBox button').first.click(); await W(pg, 400)
        await close_sheets(pg)
        # 3. Route: a tap redraws what changed; a selected pole lists its spans; one opens its runs
        await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 1500)
        await pg.evaluate("""() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask' }); }""")
        taps = 0; hits = 0; t0 = time.time()
        for s in R['spans'][::7][:24]:
            a = P[s['ia']]; xy = await pg.evaluate("([la, lo]) => __polecam.mapPt(la, lo)", [a[0], a[1]])
            if not (0 < xy[0] < 1470 and 60 < xy[1] < 700): continue
            await pg.mouse.click(xy[0], xy[1]); await W(pg, 150); taps += 1
            if 'selected' in await pg.evaluate("document.getElementById('rbHint').textContent"): hits += 1
            await pg.mouse.click(xy[0], xy[1]); await W(pg, 150); taps += 1 # unselect
        lt = await pg.evaluate("window.__lt")
        check('A3. Route on 260 points: selecting and unselecting poles (the pole is selected, not the span under it: at least 80 % of the taps, the others land on a NAP pin or a nearby pole at this zoom; no long redraws: no task over 150 ms, and in total under 1 s; v2.42.18 took 70–450 ms a tap)',
              taps >= 10 and hits >= 0.8 * taps / 2 and max(lt or [0]) < 150 and sum(lt) < 1000, (taps, hits, len(lt), sum(lt), max(lt or [0])))
        a = P[pid]; await pg.evaluate("([la, lo]) => __polecam.mapView(la, lo, 18)", [a[0], a[1]]); await W(pg, 700)
        xy = await pg.evaluate("([la, lo]) => __polecam.mapPt(la, lo)", [a[0], a[1]])
        await pg.mouse.click(xy[0], xy[1]); await W(pg, 400)
        hint = await pg.evaluate("document.getElementById('rbHint').textContent")
        sp = await pg.evaluate("() => ({ vis: !document.getElementById('rbSpans').hidden, lbl: (document.querySelector('#rbSpans .lbl') || {}).textContent, btns: [...document.querySelectorAll('#rbSpans button')].map((b) => b.textContent) })")
        await pg.screenshot(path=OUT + '/a_route_spans.png')
        await pg.locator('#rbSpans button').first.click(); await W(pg, 500)
        pan = await pg.evaluate("() => ({ vis: !document.getElementById('rbSpan').hidden, t: (document.querySelector('#rbSpan .rs-head b') || {}).textContent, spans: !document.getElementById('rbSpans').hidden })")
        await pg.click('#rbSpan button[data-rs=add]'); await W(pg, 400)
        lk = await pg.evaluate("(id) => __polecam.S.meta[__polecam.S.project].links.filter((l) => (l[0] === id || l[1] === id) && l.length === 4)", pid)
        sel = await pg.evaluate("document.querySelectorAll('#map path.leaflet-interactive[stroke=\"#17202a\"]').length")
        await pg.screenshot(path=OUT + '/a_route_runs.png')
        check(f'A4. Route: tapping {P[pid][2]} lists its 2 spans ("SPANS AT … · TAP ONE FOR ITS RUNS", → pole · length · cable); tapping one opens its runs; + Add a run adds Run 2; the pole is no longer drawn as selected',
              hint.startswith(P[pid][2] + ' selected') and sp['vis'] and 'TAP ONE FOR ITS RUNS' in (sp['lbl'] or '') and len(sp['btns']) == 2 and all(b.startswith('→ ') for b in sp['btns']) and pan['vis'] and not pan['spans'] and len(lk) == 1 and sel == 0,
              (hint[:60], sp, pan, lk, sel))
        await pg.click('#rbDone'); await W(pg, 500)
        check('A5. no page errors (A)', not errs, errs[:4])
        await ctx.close()

        # ======================= A6. a long form on a phone: the map still goes small and comes back at the top
        ctx, pg, errs, cur, st0, task = await common.launch(p, OUT + '/ud_b', S + '/v17/vid/h_cc.mjpeg', project=False)
        await ctx.route('https://script.google.com/**', sheet)
        await admin(pg)
        await common.newproj(pg, 'survey', 'STRAIGHT', purpose='As-plan'); await close_sheets(pg)
        cur['latitude'] += 0.0004; await W(pg, 1300)
        await pg.click('#captureBtn'); await W(pg, 1300); await pg.click('#shutter'); await W(pg, 2200); await common.skipscan(pg)
        await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 900)
        await pg.evaluate("__polecam.edTab('acc')"); await W(pg, 400)
        await pg.evaluate(MINI)
        await pg.evaluate("() => { const b = document.querySelector('#editor .edbody'); b.dispatchEvent(new WheelEvent('wheel', { deltaY: 60 })); b.scrollTop = 200; }"); await W(pg, 700)
        small = await pg.evaluate("document.getElementById('pinMapWrap').classList.contains('mini')")
        await pg.evaluate("() => { const b = document.querySelector('#editor .edbody'); b.dispatchEvent(new WheelEvent('wheel', { deltaY: -60 })); b.scrollTop = 0; }"); await W(pg, 200)
        await pg.evaluate("() => { const b = document.querySelector('#editor .edbody'); b.dispatchEvent(new WheelEvent('wheel', { deltaY: -60 })); }"); await W(pg, 700)
        still = await pg.evaluate("document.getElementById('pinMapWrap').classList.contains('mini')")
        bx = await pg.locator('#pinMap').bounding_box(); await pg.mouse.click(bx['x'] + bx['width'] * 0.3, bx['y'] + bx['height'] / 2); await W(pg, 500)
        big = not await pg.evaluate("document.getElementById('pinMapWrap').classList.contains('mini')")
        sh = await pg.evaluate("() => { const b = document.querySelector('#editor .edbody'); return [b.scrollHeight, b.clientHeight]; }")
        check('A6. a long form on a phone: scrolled down, the map goes small; back at the top it stays small (v2.42.27: an iPhone\'s glide made it flip); a tap on it: big again', small and still and big, (small, still, big, sh))
        # ======================= B. Straighten on the photo
        await pg.evaluate("__polecam.edTab('photo')"); await W(pg, 300)
        await pg.click('#edPhoto'); await W(pg, 600); await pg.click('#pvBox'); await pg.wait_for_selector('#boxer:not([hidden])'); await W(pg, 800)
        await pg.click('#boxModeFoc'); await W(pg, 300)
        st = await pg.evaluate("() => ({ vis: !document.getElementById('boxStraight').hidden, on: document.getElementById('boxStraight').getAttribute('aria-pressed'), t: document.getElementById('boxStraight').textContent, hint: document.getElementById('boxHint').textContent })")
        cb = await pg.locator('#boxCanvas').bounding_box()
        X = lambda f: cb['x'] + cb['width'] * f; Y = lambda f: cb['y'] + cb['height'] * f
        async def draw(path):
            await pg.mouse.move(X(path[0][0]), Y(path[0][1])); await pg.mouse.down()
            for (x0, y0), (x1, y1) in zip(path, path[1:]):
                for k in range(1, 11):
                    t = k / 10; wob = 0.006 * math.sin(k * 1.9 + x0 * 40)
                    await pg.mouse.move(X(x0 + (x1 - x0) * t + wob), Y(y0 + (y1 - y0) * t - wob)); await W(pg, 8)
            await pg.mouse.up(); await W(pg, 300)
        await draw([(0.15, 0.25), (0.55, 0.30), (0.60, 0.75)]) # an L with a wobble
        m1 = await pg.evaluate("__polecam.boxMarks()")
        await draw([(0.15, 0.85), (0.50, 0.86), (0.85, 0.84)]) # a wobbly straight line
        m2 = await pg.evaluate("__polecam.boxMarks()")
        await pg.screenshot(path=OUT + '/b_straight.png')
        check('B1. the FOC route tool shows Straighten: on (on at first); a wobbly L-shaped route becomes 3 points (its corner kept), a wobbly straight route 2',
              st['vis'] and st['on'] == 'true' and st['t'] == 'Straighten: on' and 'Straighten is on' in st['hint'] and len(m1[-1]['pts']) == 3 and m1[-1]['raw'] and len(m2[-1]['pts']) == 2, (st, m1[-1], m2[-1]))
        await pg.click('#boxStraight'); await W(pg, 400)
        m3 = await pg.evaluate("__polecam.boxMarks()"); s3 = await pg.evaluate("[__polecam.S.focStraight, document.getElementById('boxStraight').textContent]")
        await draw([(0.20, 0.55), (0.45, 0.58), (0.70, 0.52)])
        m4 = await pg.evaluate("__polecam.boxMarks()")
        check('B2. Straighten off with the route selected: it goes back as drawn (more points); the choice is kept; a route drawn then stays as drawn',
              len(m3[-1]['pts']) > 4 and not m3[-1]['raw'] and s3 == [False, 'Straighten: off'] and len(m4[-1]['pts']) > 4 and not m4[-1]['raw'], (len(m3[-1]['pts']), s3, len(m4[-1]['pts'])))
        await pg.click('#boxDone'); await W(pg, 1200)
        check('B3. no page errors (B)', not errs, errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
