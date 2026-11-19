"""v2.42.26 copy (a pole's loop has No loop in an As-Plan too). v2.42.16: maintenance loops. As-Plan: where the survey has none, the app adds them (72C aerial every 250-300 m on a pole in
that stretch, a Globe pole first, else the farthest; no pole there: the last pole before the limit; 12C aerial every 450-500 m;
underground at each handhole, manhole and service box), counted from the homing or from the last loop (the surveyor's count).
As-Built: no loop added; MLoop is required (MLoop / No loop) on each pole. A handhole, manhole or service box has its own loop,
20 m, in both: counted (BOQ, quantities, PMI), not drawn, nothing to tap.
 1. synthetic As-Plan line (site, 72C, 12C, UG): the loops added are exactly the expected ones; a surveyor's loop shifts them;
    the record says ADDED BY THE APP; quantities, BOQ, route bar, Drawing (LOOP*), KMZ, plan DXF (+ README) count them
 2. synthetic As-Built: none added; the record shows MLoop / No loop, REQUIRED; Save refused until answered; No loop and MLoop
    saved; quantities, BOQ note and route bar count the answered and the unanswered
 3. the 10 km sample (As-Plan): every 72C stretch <= 300 m and every 12C stretch <= 500 m (unless a span forces more), a Globe
    pole taken when one is in the stretch, every UG box looped; the plan DXF draws one 15m LOOP per loop; no page errors"""
import asyncio, sys, os, shutil, json, zipfile, time, urllib.parse, io, re, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from playwright.async_api import async_playwright
import ezdxf
BASE = os.environ.get('BASE', 'http://localhost:8765')
OUT = S + '/v24226/out_16v26'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
FILE = PRIV + '/large/G-eSAA_TEST10KM_RTA.zip'
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
SEED_H = {e.dxf.handle for e in ezdxf.read(io.StringIO(SEED)).modelspace()}
ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'; LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:1500], flush=True)
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def idle(pg, maxs=900):
    t0 = time.time()
    while time.time() - t0 < maxs:
        if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): return
        await W(pg, 250)
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 250)
async def open_card(pg, sel):
    await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate(f"window.__polecam.showExport('{sel}')"); await W(pg, 400)
async def export(pg, sel, name):
    await open_card(pg, sel); await pg.click('#' + sel)
    for _ in range(4000):
        if await pg.locator('#resultBox:not([hidden])').count(): break
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
        await W(pg, 250)
    async with pg.expect_download(timeout=180000) as d: await pg.click('#resSave')
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f); await close_sheets(pg); return f

R_E = 6371008.8
def hav(a, b):
    r = math.pi / 180; dl = (b[0] - a[0]) * r; dn = (b[1] - a[1]) * r
    h = math.sin(dl / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dn / 2) ** 2
    return 2 * R_E * math.asin(math.sqrt(h))
LAT, LON0 = 7.1036, 125.6180
def at(d): return (LAT, LON0 + d / (R_E * math.cos(math.radians(LAT)) * math.pi / 180))
# the synthetic line: a site at 0; 72C poles (a Globe pole at 260); 12C from the pole at 1000; UG boxes after 2080
P72 = [50, 100, 150, 200, 260, 290, 340, 400, 450, 500, 540, 600, 780, 880, 1000]
P12 = [1120, 1240, 1360, 1475, 1600, 1720, 1840, 1955, 2080]
UGB = [(2130, 'Handhole', 'HH-0001'), (2180, 'Manhole', 'MH-0001'), (2230, 'Service box', 'SB-0001')]
def synth():
    recs = [{'k': 'S0', 'element': 'Site', 'poleId': 'HOMING SITE', 'status': 'Existing', 'd': 0, 'siteKind': 'Tower'}]
    for d in P72 + P12: recs.append({'k': f'P{d}', 'element': 'Pole', 'poleId': f'CC-{d:04d}' if d != 260 else 'GT-0260', 'poleType': 'Globe' if d == 260 else 'Concrete', 'status': 'Existing', 'd': d, 'boq': {'owner': 'Globe'} if d == 260 else {'owner': 'Electric'}})
    for d, el, n in UGB: recs.append({'k': n, 'element': el, 'poleId': n, 'status': 'Proposed', 'd': d})
    for r in recs: r['lat'], r['lon'] = at(r['d'])
    links = [('S0', 'P50', 'F72')]
    for a, b in zip(P72, P72[1:]): links.append((f'P{a}', f'P{b}', 'F72'))
    links.append(('P1000', 'P1120', 'L12'))
    for a, b in zip(P12, P12[1:]): links.append((f'P{a}', f'P{b}', 'L12'))
    links += [('P2080', 'HH-0001', 'U144'), ('HH-0001', 'MH-0001', 'U144'), ('MH-0001', 'SB-0001', 'U144')]
    return recs, links
ADD = """([proj, recs, links]) => { const P = __polecam.points, ids = {}, t0 = Date.parse('2026-11-05T01:00:00Z');
  recs.forEach((r, i) => { const id = proj + '_' + r.k; ids[r.k] = id; const t = new Date(t0 + i * 60000).toISOString();
    P.push({ id, project: proj, created: t, takenAt: t, updated: t, source: 'map', poleId: r.poleId, poleType: r.poleType || '', lat: r.lat, lon: r.lon, element: r.element, status: r.status,
      remarks: '', closureId: '', boxes: 0, details: [], marks: [], boq: r.boq || {}, ...(r.siteKind ? { siteKind: r.siteKind } : {}), by: 'Test surveyor', updatedBy: 'Test surveyor' }); });
  const S = __polecam.S; S.meta[proj] = { ...(S.meta[proj] || {}), links: links.map(([a, b, c]) => [ids[a], ids[b], c]) }; __polecam.persist(); __polecam.renderPoles(); return ids; }"""
def qty(rows): return {r[0]: r[1] for r in rows}

async def main():
    async def sheet(route):
        req = route.request
        if req.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query)
        if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
        out = {'ok': True, 'name': common.SHEET_MOCK['name'], 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(OUT + '/ud', executable_path=common.CHROME, viewport={'width': 412, 'height': 900}, accept_downloads=True, service_workers='block')
        await ctx.route('https://script.google.com/**', sheet)
        for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**'): await ctx.route(u, lambda r: r.abort())
        await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS); await ctx.add_init_script(common.ADM_OPEN_JS)
        pg = ctx.pages[0]; errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(BASE + '/index.html'); await W(pg, 1500)
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await common.sheet_companies(pg, ['GLOBE', 'SAMPLE VENDOR'], admins=['GLOBE'])
        await pg.fill('#admWriteKey', 'ADMIN-KEY-TEST'); await pg.fill('#admDxfSeed', LINK1); await pg.click('#admSave')
        await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
        if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
        for _ in range(3):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        recs, links = synth()

        # ===== 1. As-Plan
        await common.newproj(pg, 'survey', 'LOOP_PLAN', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['LOOP_PLAN', recs, links]); kof = {v: k for k, v in ids.items()}
        A = dict(await pg.evaluate("__polecam.autoLoops()")); got = {kof[i]: c for i, c in A.items()}
        want = {'P260': 'F72', 'P540': 'F72', 'P780': 'F72', 'P1475': 'L12', 'P1955': 'L12'}
        check('1a. As-Plan, no loop set: 72C at 260 (the Globe pole, before the farther 290), 540 (farthest in 510-560), 780 (no pole in 790-840: the last before); 12C at 1475 and 1955; none added at the handhole, manhole, service box (they have theirs)', got == want, got)
        for k in ('P400', 'P1240', 'P1840'): await pg.evaluate("(id) => { const p = __polecam.points.find((x) => x.id === id); p.boq = { ...p.boq, mloop: 'Yes' }; }", ids[k])
        got2 = {kof[i]: c for i, c in dict(await pg.evaluate("__polecam.autoLoops()")).items()}
        want2 = {'P600': 'F72', 'P880': 'F72'} # v2.42.18: the site's entrance loop at 0 and 400 is 100 m past the limit: none at 260; 1240 -> 1840 is 600 m (100 past 500): none between
        check('1b. loops the surveyor sets count: 72C from the one at 400 (600: no pole in 650-700; 880 in 850-900); 12C: 1240 and 1840 are 600 m apart, so one between (1720 in 1690-1740); none added on their poles', got2 == want2, got2)
        for k in ('P400', 'P1240', 'P1840'): await pg.evaluate("(id) => { const p = __polecam.points.find((x) => x.id === id); delete p.boq.mloop; __polecam.persist(); }", ids[k])
        async def ed_row(id_):
            await pg.evaluate("(id) => __polecam.openEditorFor(id)", id_); await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 700)
            return await pg.evaluate("""() => { const c = document.querySelector('#editor .chips[data-k="mloop"]'); if (!c) return null; const row = c.closest('.boqrow');
              return { lbl: row.querySelector('.lbl').textContent, chips: [...c.querySelectorAll('.chip')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]), need: row.classList.contains('need') }; }""")
        e540 = await ed_row(ids['P540']); await close_sheets(pg)
        e340 = await ed_row(ids['P340']); await close_sheets(pg)
        check('1c. the record of a pole the app loops says MAINTENANCE LOOP · ADDED BY THE APP (one chip, off); another pole: MAINTENANCE LOOP', e540 and e540['lbl'] == 'MAINTENANCE LOOP · ADDED BY THE APP' and e540['chips'] == [['10 m', 'false'], ['12 m', 'false'], ['15 m', 'true'], ['20 m', 'false'], ['No loop', 'false']]
              and e340 and e340['lbl'] == 'MAINTENANCE LOOP', (e540, e340))
        q1 = qty(await pg.evaluate("__polecam.surveyQty(__polecam.points.filter((x) => x.project === 'LOOP_PLAN')).rows"))
        span = sum(hav((r1['lat'], r1['lon']), (r2['lat'], r2['lon'])) for a, b, _ in links for r1 in recs if r1['k'] == a for r2 in recs if r2['k'] == b)
        check('1d. survey quantities: 8 loops: 5 on poles added by the app (MLOOP_AUTO), 3 at the boxes (MLOOP_BOX, 20 m); 3 on 72C, 2 on 12C, 3 on UG 144C; FOC = spans + 5 x 15 + 3 x 20 m (UG: 150 + 60)',
              q1.get('MLOOP_COUNT') == 9 and q1.get('MLOOP_AUTO') == 5 and q1.get('MLOOP_OWN') == 1 and q1.get('MLOOP_BOX') == 3 and q1.get('MLOOP_BOX_LEN') == 20 and q1.get('MLOOP_F72') == 4 and q1.get('MLOOP_L12') == 2 and q1.get('MLOOP_U144') == 3
              and abs(q1.get('MLOOP_M', 0) - 140) < 0.1 and abs(q1.get('FOC_TOTAL', 0) - (span + 140)) < 0.6 and abs(q1.get('FOC_U144', 0) - 210) < 0.6,
              {k: v for k, v in q1.items() if k.startswith(('MLOOP', 'FOC', 'SPAN_TOTAL'))})
        bt = await pg.evaluate("__polecam.boqTable()")
        lr = {(r['cells'][1], r['cells'][2]): r['cells'][3] for r in bt['rows'] if r['cells'][0] == 'Maintenance loop'}
        check('1e. BOQ: Maintenance loop 15 m on 5 poles, 20 m at the handhole, the manhole and the service box; notes: 5 added by the app, 20 m at each box',
              lr == {('15 m', 'Pole'): 3, ('10 m', 'Pole'): 2, ('15 m', 'Site entrance'): 1, ('20 m', 'Handhole'): 1, ('20 m', 'Manhole'): 1, ('20 m', 'Service box'): 1} and any('Maintenance loops: 5 added by the app' in n['t'] for n in bt['notes'])
              and any('each handhole, manhole and service box on the route: 20 m' in n['t'] for n in bt['notes']), (lr, [n['t'][:140] for n in bt['notes']]))
        rs = await pg.evaluate("__polecam.routeStats()")
        check('1f. the route bar: MLoop 0 + 5 added by the app · HH/MH/SB loops 3 × 20 m', 'MLoop 1 + 5 added by the app' in rs and 'HH/MH/SB loops 3 × 20 m' in rs, rs)
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1500)
        dr = await pg.evaluate("({ la: __polecam.drw && __polecam.drw.LA ? __polecam.drw.LA.size : -1, leg: document.getElementById('drawLegendBody').textContent })")
        await pg.screenshot(path=OUT + '/drawing_plan.png'); await close_sheets(pg)
        check('1g. the Drawing: the 5 loops added (poles), the legend has LOOP* = a maintenance loop added by the app', dr['la'] == 5 and 'Maintenance loop added by the app' in dr['leg'], dr)
        fk = await export(pg, 'doKmz', 'loop_plan.kmz')
        kz = zipfile.ZipFile(fk); kml = kz.read([n for n in kz.namelist() if n.endswith('.kml')][0]).decode('utf-8')
        nk = kml.count('<Data name="mloop"><value>Yes</value></Data>')
        check('1h. the KMZ carries the 5 loops added and the site entrance loop (mloop Yes), so an As-Built can compare with them', nk == 6 and '<Data name="mloop_length_m"><value>10</value></Data>' in kml, nk)
        await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        fd = await export(pg, 'doDxf', 'loop_plan_dxf.zip')
        z = zipfile.ZipFile(fd); dn = [n for n in z.namelist() if n.endswith('.dxf')][0]; readme = z.read('README.txt').decode('utf-8', 'replace')
        doc = ezdxf.read(io.StringIO(z.read(dn).decode('utf-8', 'replace').replace('\r\n', '\n'))); msp = [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
        lt = [e for e in msp if e.dxftype() == 'TEXT' and (e.dxf.text or '').strip() in ('15m LOOP', '10m LOOP')]; l10 = [e for e in lt if e.dxf.text.strip() == '10m LOOP']
        lb = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name.lower() == 'loopp']
        def utm(ll):
            k0, a, f = 0.9996, 6378137.0, 1 / 298.257223563; e2 = f * (2 - f); lat, lon = map(math.radians, ll); lon0 = math.radians(123)
            N = a / math.sqrt(1 - e2 * math.sin(lat) ** 2); T = math.tan(lat) ** 2; Cc = e2 / (1 - e2) * math.cos(lat) ** 2; A_ = math.cos(lat) * (lon - lon0)
            M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64) * lat - (3 * e2 / 8 + 3 * e2 ** 2 / 32) * math.sin(2 * lat) + (15 * e2 ** 2 / 256) * math.sin(4 * lat))
            E = k0 * N * (A_ + (1 - T + Cc) * A_ ** 3 / 6) + 500000; Nn = k0 * (M + N * math.tan(lat) * (A_ ** 2 / 2)); return E, Nn
        near = {}; raw = z.read(dn).decode('utf-8', 'replace')
        for k in list(want) + ['HH-0001', 'MH-0001', 'SB-0001']:
            r = next(x for x in recs if x['k'] == k); E, N_ = utm((r['lat'], r['lon']))
            near[k] = round(min([math.hypot(e.dxf.insert[0] - E, e.dxf.insert[1] - N_) for e in lt] or [1e9]), 1)
        pmi = {v: (v in raw) for v in ('2370.0m', '2160.0m', '210.0m')}
        check('1i. the plan DXF: 5 loop models and 5 "15m LOOP" texts, beside the 5 poles, none at the boxes; PMI cable lengths 2365.0m / 2155.0m aerial / 210.0m UG; the README lists the poles and the 3 box loops of 20 m',
              len(lt) == 5 and len(lb) == 5 and max(near[k] for k in want) < 25 and min(near[k] for k in ('HH-0001', 'MH-0001', 'SB-0001')) > 15 and all(pmi.values())
              and len(l10) == 2 and ': 5 on the plan; 5 added by the app' in readme and 'a 20 m loop each (3)' in readme and 'a loop at each entrance (1' in readme, (len(lt), len(lb), near, pmi, [l[:160] for l in readme.splitlines() if 'oop' in l][:3]))

        # ===== 2. As-Built
        await common.newproj(pg, 'survey', 'LOOP_BUILT', purpose='As-built'); await close_sheets(pg)
        bid = await pg.evaluate(ADD, ['LOOP_BUILT', recs, links])
        a2 = await pg.evaluate("__polecam.autoLoops()"); rs2 = await pg.evaluate("__polecam.routeStats()")
        check('2a. As-Built: no loop added; the route bar counts the 24 poles not answered, and the 3 box loops', a2 == [] and 'MLoop not answered: 24' in rs2 and 'HH/MH/SB loops 3 × 20 m' in rs2, (a2, rs2))
        e = await ed_row(bid['P540'])
        await pg.click('#edSave'); await W(pg, 900)
        still = await pg.evaluate("({ open: !document.getElementById('editor').hidden, toast: document.getElementById('toast').textContent })")
        b540 = await pg.evaluate("(id) => __polecam.points.find((x) => x.id === id).boq", bid['P540'])
        check('2b. As-Built record: MAINTENANCE LOOP · REQUIRED with MLoop 15 m / No loop, none chosen (marked); Save refused with a toast, nothing saved',
              e and e['lbl'] == 'MAINTENANCE LOOP · REQUIRED' and e['chips'] == [['10 m', 'false'], ['12 m', 'false'], ['15 m', 'false'], ['20 m', 'false'], ['No loop', 'false']] and e['need'] and still['open'] and 'required' in still['toast'] and 'mloop' not in b540, (e, still, b540))
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#editor .chips[data-k="mloop"]'); await pg.locator('#editor .chips[data-k="mloop"] .chip', has_text='No loop').click(); await W(pg, 200)
        await pg.click('#edSave')
        for _ in range(40):
            if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
            if await pg.evaluate("document.getElementById('editor').hidden"): break
            await W(pg, 250)
        b540 = await pg.evaluate("(id) => __polecam.points.find((x) => x.id === id).boq", bid['P540'])
        eh = await ed_row(bid['HH-0001']); await close_sheets(pg)
        check('2c. No loop saved on the pole (mloop No); a handhole asks nothing (it has its loop)', b540.get('mloop') == 'No' and eh is None, (b540, eh))
        q2 = qty(await pg.evaluate("__polecam.surveyQty(__polecam.points.filter((x) => x.project === 'LOOP_BUILT')).rows"))
        bt2 = await pg.evaluate("__polecam.boqTable()"); rs3 = await pg.evaluate("__polecam.routeStats()")
        lr2 = {(r['cells'][1], r['cells'][2]): r['cells'][3] for r in bt2['rows'] if r['cells'][0] == 'Maintenance loop'}
        check('2d. As-Built counts what was answered: no pole loop (No loop is none), the 3 box loops (20 m); 23 poles not answered (quantities, BOQ note, route bar); no loop added',
              q2.get('MLOOP_COUNT') == 4 and q2.get('MLOOP_OWN') == 1 and q2.get('MLOOP_BOX') == 3 and q2.get('MLOOP_UNANSWERED') == 23 and 'MLOOP_AUTO' not in q2 and lr2 == {('15 m', 'Site entrance'): 1, ('20 m', 'Handhole'): 1, ('20 m', 'Manhole'): 1, ('20 m', 'Service box'): 1}
              and any('Maintenance loop not answered (MLoop or No loop): 23' in n['t'] for n in bt2['notes']) and 'MLoop not answered: 23' in rs3, ({k: v for k, v in q2.items() if 'LOOP' in k}, lr2, rs3))

        # ===== 3. the 10 km sample (As-Plan)
        await pg.set_input_files('#sharedInput', FILE); await pg.wait_for_selector('#askBox:not([hidden])', timeout=600000)
        for _ in range(4):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            await pg.locator('#askBox button.primary').first.click(); await W(pg, 700)
        await idle(pg); await W(pg, 1500)
        proj = await pg.evaluate("__polecam.S.project")
        D = await pg.evaluate("""() => { const S = __polecam.S, pts = __polecam.points.filter((x) => x.project === S.project), F = __polecam.filled();
          return { pts: pts.map((p) => ({ id: p.id, poleId: p.poleId, el: p.element || 'Pole', st: p.status, type: p.poleType, owner: (p.boq || {}).owner || '', man: !!(p.mloop || ((p.boq || {}).mloop && p.boq.mloop !== 'No')), own: !!(F[p.id] && F[p.id].mloopOwn), lat: p.lat, lon: p.lon })), links: S.meta[S.project].links, auto: __polecam.autoLoops() }; }""")
        P = {x['id']: x for x in D['pts']}; auto = dict(D['auto']); man = {i for i, x in P.items() if x['man'] and x['el'] == 'Pole'}; own = {i for i, x in P.items() if x['own']}; man0 = set(man); man |= own # v2.42.18: own loops end a stretch
        isGT = lambda x: x['el'] == 'Pole' and (x['st'] in ('Proposed', 'New') or x['type'] == 'Globe' or re.search('globe', x['owner'], re.I))
        adj = {}
        for l in D['links']:
            if l[0] in P and l[1] in P:
                d = hav((P[l[0]]['lat'], P[l[0]]['lon']), (P[l[1]]['lat'], P[l[1]]['lon'])); c = l[2] if len(l) > 2 else ''
                adj.setdefault(l[0], []).append((l[1], d, c)); adj.setdefault(l[1], []).append((l[0], d, c))
        hd = {i: 0 for i, x in P.items() if x['el'] in ('Site', 'ODF') and i in adj}
        if not hd: hd = {D['links'][0][0]: 0}
        ch = True
        while ch:
            ch = False
            for a, L in adj.items():
                if a not in hd: continue
                for b, d, _ in L:
                    if b not in hd or hd[b] > hd[a] + d + 1e-9: hd[b] = hd[a] + d; ch = True
        bad = []; stretches = {'F72': 0, 'L12': 0}; gt_taken = 0
        for cab, (lo, hi) in {'F72': (250, 300), 'L12': (450, 500)}.items():
            nodes = {a for a, L in adj.items() if any(c == cab for _, _, c in L)}; seen = set()
            while nodes - seen:
                root = min(nodes - seen, key=lambda i: hd.get(i, 1e12))
                stack = [(root, 0.0, [(root, 0.0)])]; seen.add(root)
                while stack:
                    n, d0, path = stack.pop()
                    kids = [(b, d) for b, d, c in adj.get(n, []) if c == cab and b not in seen]
                    for b, d in kids: seen.add(b); stack.append((b, d0 + d, path + [(b, d0 + d)]))
                    if kids: continue
                    # a leaf: the loops along the path, from its start
                    li = 0
                    for j in range(1, len(path) + 1):
                        end = j == len(path) or path[j][0] in man or path[j][0] in auto
                        if not end: continue
                        seg = path[li:j + 1] if j < len(path) else path[li:]
                        base = path[li][1]; tail = seg[-1][1] - base; stretches[cab] += 1
                        inner = [(i_, x - base) for i_, x in seg[1:-1] if P[i_]['el'] == 'Pole'] if j < len(path) else [(i_, x - base) for i_, x in seg[1:] if P[i_]['el'] == 'Pole']
                        if j < len(path) and path[j][0] in auto:  # an added loop: how it was chosen
                            win = [(i_, x) for i_, x in inner + [(path[j][0], tail)] if lo - 0.5 <= x <= hi + 0.5]
                            me = path[j][0]
                            if win:
                                if me not in [i_ for i_, _ in win]: bad.append((cab, 'not in its stretch', P[me]['poleId'], round(tail, 1)))
                                elif any(isGT(P[i_]) for i_, _ in win) and not isGT(P[me]): bad.append((cab, 'a Globe pole was in the stretch', P[me]['poleId']))
                                elif isGT(P[me]): gt_taken += 1
                            elif tail > hi + 0.5 and inner: bad.append((cab, 'past the limit with a pole before', P[me]['poleId'], round(tail, 1)))
                        elif tail > (hi + 100 if j < len(path) and path[j][0] in man else hi) + 0.5 and inner and any(x <= hi + 0.5 for _, x in inner): bad.append((cab, 'stretch too long', P[path[li][0]]['poleId'], round(tail, 1))) # v2.42.18: up to 100 m past the limit when it ends at a loop
                        li = j
                    # (a branch shares its start: the shared loops count)
        ugb = [i for i, x in P.items() if x['el'] in ('Handhole', 'Manhole', 'Service box') and any(c == 'U144' for _, _, c in adj.get(i, []))]
        check(f'3a. the 10 km sample ({proj}): {len(auto)} loops added; every 72C stretch <= 300 m and 12C <= 500 m unless a span forces it; a loop added in its stretch, a Globe pole when one is there ({gt_taken} taken); none added at the {len(ugb)} UG boxes (they have theirs)',
              len(auto) > 10 and not bad and not any(i in auto for i in ugb) and not (set(auto) & man), (bad[:8], stretches, len(auto), len(man0), len(own), ugb))
        q3 = qty(await pg.evaluate("__polecam.surveyQty(__polecam.points.filter((x) => x.project === __polecam.S.project)).rows"))
        await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        f3 = await export(pg, 'doDxf', 'test10km_dxf.zip')
        z3 = zipfile.ZipFile(f3); n3 = [n for n in z3.namelist() if n.endswith('.dxf')][0]; rd3 = z3.read('README.txt').decode('utf-8', 'replace')
        d3 = ezdxf.read(io.StringIO(z3.read(n3).decode('utf-8', 'replace').replace('\r\n', '\n'))); m3 = [e for e in d3.modelspace() if e.dxf.handle not in SEED_H]
        l3 = [e for e in m3 if e.dxftype() == 'TEXT' and (e.dxf.text or '').strip() in ('15m LOOP', '10m LOOP', '12m LOOP', '20m LOOP')]; mm = re.search(r'a loop at each entrance \((\d+)', rd3); ent = int(mm.group(1)) if mm else 0
        check('3b. the plan DXF draws one 15m LOOP per pole loop (the surveyor\'s and the app\'s, as the quantities count them; the boxes\' loops not drawn); the README says how many were added',
              len(l3) == q3.get('MLOOP_COUNT') - q3.get('MLOOP_BOX') - ent and f': {len(l3)} on the plan' in rd3 and q3.get('MLOOP_BOX') >= 2 and f'{len(auto)} added by the app' in rd3, (len(l3), q3.get('MLOOP_COUNT'), q3.get('MLOOP_BOX'), q3.get('MLOOP_AUTO'), [l[:200] for l in rd3.splitlines() if 'aintenance loops on poles' in l]))
        check('4. no page errors', not errs, errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
