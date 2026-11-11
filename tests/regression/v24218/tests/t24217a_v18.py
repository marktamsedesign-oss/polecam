"""v2.42.17: the survey record in tabs; a closure in a handhole, manhole or service box; the loops of closures, dummy NAPs and risers
(15 m on a pole, aerial; a box keeps its one 20 m loop); existing GT poles are Globe's; the PMI loop setting.
 A. synthetic As-Plan line with a hybrid closure (340), a dummy NAP (1360) and a riser (1720) on poles and a closure in the handhole:
    their poles have their own loop (not added by the app, the app's loops measured from them); quantities (MLOOP_OWN), BOQ,
    route bar, KMZ, Drawing, plan DXF (15m LOOP at 6 poles); PMI with and without the loops (the setting); the box closure in
    the BOQ (existing) and the quantities; the records: WITH THE CLOSURE, the handhole's closure block. As-Built: those poles
    are not asked (21 not answered, not 24).
 B. the form, by the camera: tabs, top row, ID prefix and number pad, the pin's label, the line of what is set, Next / Back /
    swipe, the map small on scroll and back on a tap (the pin keeps its spot), no coordinates box, the check at Save (Set the …,
    Save anyway, the setting), an existing GT pole's owner, the bin, a handhole's closure saved, NPT, a PAT record on one page;
    no page errors"""
import asyncio, sys, os, shutil, json, zipfile, time, urllib.parse, io, re, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from playwright.async_api import async_playwright
import ezdxf
BASE = os.environ.get('BASE', 'http://localhost:8765')
OUT = S + '/v24218/tests/out_17v18'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
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
      remarks: '', closureId: '', boxes: 0, details: [], marks: [], boq: r.boq || {}, ...(r.siteKind ? { siteKind: r.siteKind } : {}), ...(r.x || {}), by: 'Test surveyor', updatedBy: 'Test surveyor' }); });
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
        # the closure, dummy NAP and riser poles, and the handhole's closure (v2.42.17)
        R = {r['k']: r for r in recs}
        R['P340']['x'] = {'closure': True, 'closureId': 'CL-0340'}; R['P340']['boq'] = {**R['P340']['boq'], 'clo': '48C'}
        R['P1360']['x'] = {'nap': True, 'napId': 'MIN123_C01_D01'}; R['P1360']['boq'] = {**R['P1360']['boq'], 'napType': 'Dummy NAP', 'napSz': '12C', 'napSt': 'New'}
        R['P1720']['boq'] = {**R['P1720']['boq'], 'riser': 'Yes'}
        R['HH-0001']['x'] = {'closure': True, 'closureId': 'CL-0001'}; R['HH-0001']['boq'] = {'clo': '24C', 'cloSt': 'Existing'}
        OWN = ('P340', 'P1360', 'P1720')
        # ===== A. As-Plan
        await common.newproj(pg, 'survey', 'OWN_PLAN', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['OWN_PLAN', recs, links]); kof = {v: k for k, v in ids.items()}
        got = {kof[i]: c for i, c in dict(await pg.evaluate("__polecam.autoLoops()")).items()}
        want = {'P600': 'F72', 'P880': 'F72'} # v2.42.18: the site's entrance loop at 0 and the closure's at 340 (100 m past 300 at most): none at 260
        check('A1. the closure (340), dummy NAP (1360) and riser (1720) poles have their own loop: the app adds none there and measures from them: 72C at 260 (Globe), 600 (590-640 after 340), 880; 12C none (1360 and 1720 are 360 m apart)', got == want, got)
        q = qty(await pg.evaluate("__polecam.surveyQty(__polecam.points.filter((x) => x.project === 'OWN_PLAN')).rows"))
        span = sum(hav((r1['lat'], r1['lon']), (r2['lat'], r2['lon'])) for a, b, _ in links for r1 in recs if r1['k'] == a for r2 in recs if r2['k'] == b)
        ug = sum(hav((r1['lat'], r1['lon']), (r2['lat'], r2['lon'])) for a, b, c in links if c == 'U144' for r1 in recs if r1['k'] == a for r2 in recs if r2['k'] == b)
        check('A2. survey quantities: 9 loops (3 by the app, 3 own: MLOOP_OWN, 3 at the boxes; the handhole\'s closure adds none); 4 on 72C, 2 on 12C, 3 on UG; FOC = spans + 6 x 15 + 3 x 20 m; the new closure 48C counted, the existing 24C not',
              q.get('MLOOP_COUNT') == 9 and q.get('MLOOP_AUTO') == 2 and q.get('MLOOP_OWN') == 4 and q.get('MLOOP_BOX') == 3 and q.get('MLOOP_F72') == 4 and q.get('MLOOP_L12') == 2 and q.get('MLOOP_U144') == 3
              and abs(q.get('MLOOP_M', 0) - 140) < 0.1 and abs(q.get('FOC_TOTAL', 0) - (span + 140)) < 0.6 and q.get('CLOSURE_NEW_48C') == 1 and 'CLOSURE_NEW_24C' not in q,
              {k: v for k, v in q.items() if k.startswith(('MLOOP', 'FOC_TOTAL', 'CLOSURE'))})
        bt = await pg.evaluate("__polecam.boqTable()")
        lr = {(r['cells'][1], r['cells'][2]): r['cells'][3] for r in bt['rows'] if r['cells'][0] == 'Maintenance loop'}
        cl = {(r['cells'][1], r['cells'][2]): r['cells'][3] for r in bt['rows'] if r['cells'][0] == 'Closure'}
        check('A3. BOQ: Maintenance loop 15 m on 6 poles (3 own + 3 by the app), 20 m at each box; closures: 48C New (the pole) and 24C Existing (in the handhole, its own choice)',
              lr == {('15 m', 'Pole'): 3, ('10 m', 'Pole'): 2, ('15 m', 'Site entrance'): 1, ('20 m', 'Handhole'): 1, ('20 m', 'Manhole'): 1, ('20 m', 'Service box'): 1} and cl == {('48C', 'New'): 1, ('24C', 'Existing'): 1}, (lr, cl))
        rs = await pg.evaluate("__polecam.routeStats()")
        check('A4. the route bar: MLoop 3 + 3 added by the app', 'MLoop 4 + 2 added by the app' in rs, rs)
        async def ed_info(id_):
            await pg.evaluate("(id) => __polecam.openEditorFor(id)", id_); await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 800)
            return await pg.evaluate("""() => { const c = document.querySelector('#editor .chips[data-k="mloop"]'), row = c && c.closest('.boqrow');
              return { tabs: __polecam.edTabs(), lbl: row ? row.querySelector('.lbl').textContent : null, chips: c ? [...c.querySelectorAll('.chip')].map((b) => [b.textContent, b.getAttribute('aria-pressed'), b.disabled]) : null,
                sum: [...document.querySelectorAll('#edSum button')].map((b) => b.textContent), miss: __polecam.edMissing(),
                clo: { on: document.getElementById('svCloOn').checked, box: !document.getElementById('svClosureBox').hidden, sz: document.getElementById('svCloSz').value, st: document.getElementById('svCloSt').value, id: document.getElementById('svClosureId').value, lbl: document.getElementById('svCloLbl').textContent } }; }""")
        e340 = await ed_info(ids['P340']); await close_sheets(pg)
        e1720 = await ed_info(ids['P1720']); await close_sheets(pg)
        ehh = await ed_info(ids['HH-0001']); await close_sheets(pg)
        check('A5. the closure pole: MAINTENANCE LOOP · WITH THE CLOSURE, MLoop 15 m on and not tappable, in the line of what is set; the riser pole: WITH THE RISER',
              e340['lbl'] == 'MAINTENANCE LOOP · WITH THE CLOSURE' and e340['chips'] == [['10 m', 'false', False], ['12 m', 'false', False], ['15 m', 'true', False], ['20 m', 'false', False]] and 'MLoop 15 m (closure)' in e340['sum'] and e1720['lbl'] == 'MAINTENANCE LOOP · WITH THE RISER', (e340, e1720['lbl']))
        check('A6. the handhole: Photo/Model and Details only; CLOSURE IN THIS HANDHOLE ticked, 24C, Existing, CL-0001; the line says Closure 24C Existing CL-0001 · Loop 20 m',
              ehh['tabs'] == ['photo', 'details'] and ehh['clo'] == {'on': True, 'box': True, 'sz': '24C', 'st': 'Existing', 'id': 'CL-0001', 'lbl': 'CLOSURE IN THIS HANDHOLE'} and ehh['sum'] == ['Closure 24C Existing CL-0001', 'Loop 20 m'], ehh)
        fk = await export(pg, 'doKmz', 'own_plan.kmz')
        kz = zipfile.ZipFile(fk); kml = kz.read([n for n in kz.namelist() if n.endswith('.kml')][0]).decode('utf-8')
        nk = kml.count('<Data name="mloop"><value>Yes</value></Data>')
        check('A7. the KMZ: mloop Yes on the 6 poles; the handhole\'s closure ID, size and status', nk == 6 and '<Data name="closure_id"><value>CL-0001</value></Data>' in kml and '<Data name="closure_status"><value>Existing</value></Data>' in kml, nk)
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1500)
        tags = await pg.evaluate("() => [...document.querySelectorAll('.leaflet-marker-pane *, .leaflet-tooltip-pane *')].map((e) => e.textContent).join(' ')")
        await pg.screenshot(path=OUT + '/drawing_own.png'); await close_sheets(pg)
        await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        fd = await export(pg, 'doDxf', 'own_plan_dxf.zip')
        z = zipfile.ZipFile(fd); dn = [n for n in z.namelist() if n.endswith('.dxf')][0]; readme = z.read('README.txt').decode('utf-8', 'replace'); raw = z.read(dn).decode('utf-8', 'replace')
        doc = ezdxf.read(io.StringIO(raw.replace('\r\n', '\n'))); msp = [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
        lt = [e for e in msp if e.dxftype() == 'TEXT' and (e.dxf.text or '').strip() in ('15m LOOP', '10m LOOP')]; l10 = [e for e in lt if e.dxf.text.strip() == '10m LOOP']
        def utm(ll):
            k0, a, f = 0.9996, 6378137.0, 1 / 298.257223563; e2 = f * (2 - f); lat, lon = map(math.radians, ll); lon0 = math.radians(123)
            N = a / math.sqrt(1 - e2 * math.sin(lat) ** 2); T = math.tan(lat) ** 2; Cc = e2 / (1 - e2) * math.cos(lat) ** 2; A_ = math.cos(lat) * (lon - lon0)
            M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64) * lat - (3 * e2 / 8 + 3 * e2 ** 2 / 32) * math.sin(2 * lat) + (15 * e2 ** 2 / 256) * math.sin(4 * lat))
            E = k0 * N * (A_ + (1 - T + Cc) * A_ ** 3 / 6) + 500000; Nn = k0 * (M + N * math.tan(lat) * (A_ ** 2 / 2)); return E, Nn
        near = {}
        for k in list(want) + list(OWN):
            E, N_ = utm((R[k]['lat'], R[k]['lon'])); near[k] = round(min([math.hypot(e.dxf.insert[0] - E, e.dxf.insert[1] - N_) for e in lt] or [1e9]), 1)
        ae = span - ug; m1 = lambda v: f'{round(v, 1):.1f}m'
        pmi_on = {v: (v in raw) for v in (m1(span + 140), m1(ae + 80), m1(ug + 60))}
        check('A8. the plan DXF: 6 "15m LOOP" (3 own, 3 by the app) beside their poles; PMI with the loops (setting ticked): total, aerial, UG = spans + loops; README: 3 of them with a closure, a dummy NAP or a riser',
              len(lt) == 5 and len(l10) == 2 and max(near.values()) < 30 and all(pmi_on.values()) and '3 of them with a NAP, an LCP, a hybrid closure, a dummy NAP or a riser' in readme and 'a loop at each entrance (1' in readme and 'spans + maintenance loops' in readme, (len(lt), near, pmi_on))
        # the setting off: the PMI from the spans only (Settings → AutoCAD DXF)
        await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 500)
        await pg.evaluate("() => { const c = document.getElementById('pmiLoops2'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }"); await W(pg, 300); await close_sheets(pg)
        st = await pg.evaluate("[__polecam.S.exp.pmiLoops, document.getElementById('pmiLoops').checked]")
        fd2 = await export(pg, 'doDxf', 'own_plan_dxf_noloops.zip')
        z2 = zipfile.ZipFile(fd2); dn2 = [n for n in z2.namelist() if n.endswith('.dxf')][0]; raw2 = z2.read(dn2).decode('utf-8', 'replace'); rd2 = z2.read('README.txt').decode('utf-8', 'replace')
        pmi_off = {v: (v in raw2) for v in (m1(span), m1(ae), m1(ug))}
        check('A9. the PMI setting unticked (Settings, and the DXF card follows): the PMI cable lengths are the spans only; the README says so; still 6 loops drawn',
              st == [False, False] and all(pmi_off.values()) and m1(span + 140) not in raw2 and 'spans only' in rd2 and raw2.count('15m LOOP') == raw.count('15m LOOP'), (st, pmi_off))
        await pg.evaluate("() => { const c = document.getElementById('pmiLoops2'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }")
        # As-Built: the own-loop poles are not asked
        await common.newproj(pg, 'survey', 'OWN_BUILT', purpose='As-built'); await close_sheets(pg)
        bid = await pg.evaluate(ADD, ['OWN_BUILT', recs, links])
        q2 = qty(await pg.evaluate("__polecam.surveyQty(__polecam.points.filter((x) => x.project === 'OWN_BUILT')).rows")); rs2 = await pg.evaluate("__polecam.routeStats()")
        e2 = await ed_info(bid['P1360'])
        await pg.click('#edSave')
        for _ in range(40):
            if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
            if await pg.evaluate("document.getElementById('editor').hidden"): break
            await W(pg, 250)
        saved = await pg.evaluate("document.getElementById('editor').hidden")
        check('A10. As-Built: 21 poles not answered (the closure, dummy NAP and riser poles have their loop: 3 counted); the dummy NAP pole is not asked (WITH THE DUMMY NAP) and saves',
              q2.get('MLOOP_UNANSWERED') == 21 and q2.get('MLOOP_OWN') == 4 and q2.get('MLOOP_COUNT') == 7 and 'MLoop not answered: 21' in rs2 and e2['lbl'] == 'MAINTENANCE LOOP · WITH THE DUMMY NAP' and not any(m.startswith('!') for m in e2['miss']) and saved,
              ({k: v for k, v in q2.items() if 'LOOP' in k}, rs2, e2['lbl'], e2['miss'], saved))
        check('A11. no page errors (synthetic part)', not errs, errs[:5])
        await ctx.close()

    # ===== B. the form, with the camera (the check at Save on)
    async with async_playwright() as p:
        ctx, pg, errs, cur, st0, task = await common.launch(p, OUT + '/ud_b', S + '/v17/vid/h_cc.mjpeg', project=False, save_check=True)
        await ctx.route('https://script.google.com/**', sheet)
        for u in ('https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://overpass-api.de/**'): await ctx.route(u, lambda r: r.abort())
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
        await common.newproj(pg, 'survey', 'FORM_PLAN', purpose='As-plan'); await close_sheets(pg)
        async def capture(dlat=0.0004):
            cur['latitude'] += dlat; await W(pg, 1300)
            await pg.click('#captureBtn'); await W(pg, 1300); await pg.click('#shutter'); await W(pg, 2200); await common.skipscan(pg)
            await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 900)
        INFO = """() => ({ tabs: __polecam.edTabs(), cur: __polecam.edCur(), id: document.getElementById('poleId').value, raw: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(document.getElementById('poleId')),
          pfx: document.getElementById('idPfx').hidden ? null : document.getElementById('idPfx').textContent, inputmode: document.getElementById('poleId').getAttribute('inputmode'), label: document.getElementById('pinLabel').textContent,
          miss: __polecam.edMissing(), sum: [...document.querySelectorAll('#edSum button')].map((b) => b.textContent), nav: [...document.querySelectorAll('#edTabs button')].map((b) => b.textContent),
          top: [...document.getElementById('edTop').querySelectorAll('select')].filter((s) => s.getClientRects().length).map((s) => s.id), three: document.getElementById('elemTypeRow').classList.contains('three'),
          mini: document.getElementById('pinMapWrap').classList.contains('mini'), trash: !document.getElementById('edTrash').hidden, coords: getComputedStyle(document.getElementById('coordBox')).display,
          pane: [...document.querySelectorAll('#editor .edbody>[data-pane]')].filter((g) => getComputedStyle(g).display !== 'none').map((g) => g.dataset.pane), next: document.getElementById('paneNav').textContent,
          owner: (document.querySelector('#editor .chips[data-k=owner] .chip[aria-pressed=true]') || {}).textContent || (document.querySelector('#editor select.boqsel[data-k=owner]') || {}).value || '' })"""
        await capture(0)
        i1 = await pg.evaluate(INFO); await pg.screenshot(path=OUT + '/b1_open.png')
        check('B1. a new pole opens on Details: the tabs Photo/Model, Details, Accessories, On the pole, AE to UG; Status, Element, Type on top in one row; the ID prefix in its button and the number on the number pad; the pin shows the ID; no coordinates box; Next: Accessories',
              i1['tabs'] == ['photo', 'details', 'acc', 'onpole', 'ug'] and i1['cur'] == 'details' and i1['pane'] == ['details'] and i1['top'] == ['svStatus', 'elemSel', 'typeSel'] and i1['three']
              and i1['pfx'] == 'CC-' and i1['id'] == 'CC-' + i1['raw'] and i1['inputmode'] == 'numeric' and i1['label'] in (i1['id'], 'no ID yet') and i1['coords'] == 'none' and 'Next: Accessories' in i1['next'] and not i1['trash'], i1)
        await pg.fill('#poleId', '4302652'); await W(pg, 300); i2 = await pg.evaluate(INFO)
        await pg.fill('#poleId', 'GT-1234'); await W(pg, 400); i3 = await pg.evaluate(INFO)
        check('B2. the number typed: CC-4302652, on the pin too; a whole ID typed (GT-1234): the prefix button takes GT-, the type Globe, its owner Globe by itself (not asked)',
              i2['id'] == 'CC-4302652' and i2['label'] == 'CC-4302652' and i3['pfx'] == 'GT-' and i3['raw'] == '1234' and i3['label'] == 'GT-1234' and await pg.input_value('#typeSel') == 'Globe' and i3['owner'] == 'Globe' and 'details:owner' not in i3['miss'], (i2, i3))
        await pg.click('#idPfx'); await W(pg, 200); menu = await pg.evaluate("[...document.querySelectorAll('#idPfxMenu .chip')].map((b) => b.textContent)")
        await pg.locator('#idPfxMenu .chip', has_text='CC-').click(); await W(pg, 400); i4 = await pg.evaluate(INFO)
        check('B3. the prefix button: CC- WP- SP- GT- BT- PP-; CC- chosen: CC-1234, the type Concrete, the Globe owner taken away again (to be set)',
              menu[:5] == ['CC-', 'WP-', 'SP-', 'GT-', 'BT-'] and 'PP-' in menu and i4['id'] == 'CC-1234' and await pg.input_value('#typeSel') == 'Concrete' and i4['owner'] == '' and 'details:owner' in i4['miss'], (menu, i4))
        await pg.locator('#editor .chips[data-k=owner] .chip', has_text='PLDT').click(); await W(pg, 300)
        await pg.click('#paneNav .next'); await W(pg, 400); i5 = await pg.evaluate(INFO)
        # swipe left: the next tab; right: back
        sw = "(dx) => { const b = document.querySelector('#editor .edbody'), r = b.getBoundingClientRect(), y = r.top + 200, x0 = r.left + 200; const t = (x) => new Touch({ identifier: 1, target: b, clientX: x, clientY: y });"
        sw += " b.dispatchEvent(new TouchEvent('touchstart', { touches: [t(x0)], changedTouches: [t(x0)], bubbles: true })); b.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(x0 + dx)], bubbles: true })); return __polecam.edCur(); }"
        s1 = await pg.evaluate(sw, -120); s2 = await pg.evaluate(sw, 120)
        check('B4. Next › goes to Accessories (Details ✓ once the owner is set); a swipe left goes on (On the pole), a swipe right back (Accessories)', i5['cur'] == 'acc' and i5['pane'] == ['acc'] and i5['nav'][1] == 'Details✓' and s1 == 'onpole' and s2 == 'acc', (i5['cur'], i5['nav'], s1, s2))
        await pg.click('#edSave'); await W(pg, 700)
        ask1 = await pg.evaluate("() => ({ vis: !document.getElementById('askBox').hidden, t: document.getElementById('askTitle').textContent, b: [...document.querySelectorAll('#askBox button')].map((b) => b.textContent) })")
        await pg.locator('#askBox button', has_text='Set the clamp size').click(); await W(pg, 900)
        i6 = await pg.evaluate(INFO); fl = await pg.evaluate("!!document.querySelector('#editor .boqrow[data-k=clamp].flash')")
        check('B5. Save with the clamp size not set: "Not set yet", Set the clamp size / Save anyway / Back to the form; Set goes to Accessories and the clamp row flashes; the editor stays open',
              ask1['vis'] and ask1['t'] == 'Not set yet' and ask1['b'] == ['Set the clamp size', 'Save anyway', 'Back to the form'] and i6['cur'] == 'acc' and fl and not await pg.evaluate("document.getElementById('editor').hidden"), (ask1, i6['cur'], fl))
        # the map: small once the form is scrolled, back on a tap; the pin keeps its spot
        c0 = await pg.evaluate("(() => { const c = __polecam.pinMap.getCenter(); return [c.lat, c.lng]; })()")
        await pg.evaluate("() => { const b = document.querySelector('#editor .edbody'); b.dispatchEvent(new WheelEvent('wheel')); b.scrollTop = 300; }"); await W(pg, 700)
        h1 = await pg.evaluate("[document.getElementById('pinMapWrap').classList.contains('mini'), document.getElementById('pinMapWrap').getBoundingClientRect().height]")
        c1 = await pg.evaluate("(() => { const c = __polecam.pinMap.getCenter(); return [c.lat, c.lng]; })()")
        await pg.screenshot(path=OUT + '/b2_mini.png')
        bx = await pg.locator('#pinMap').bounding_box(); await pg.mouse.click(bx['x'] + bx['width'] * 0.3, bx['y'] + bx['height'] / 2); await W(pg, 700)
        h2 = await pg.evaluate("[document.getElementById('pinMapWrap').classList.contains('mini'), document.getElementById('pinMapWrap').getBoundingClientRect().height, document.querySelector('#editor .edbody').scrollTop]")
        c2 = await pg.evaluate("(() => { const c = __polecam.pinMap.getCenter(); return [c.lat, c.lng]; })()")
        mv = max(hav(c0, c1), hav(c0, c2))
        check('B6. the map small (96 px) once the form is scrolled, its full size again on a tap (the form back at the top); the pin keeps its spot (< 0.5 m)', h1[0] and abs(h1[1] - 96) < 2 and not h2[0] and h2[1] > 200 and h2[2] == 0 and mv < 0.5, (h1, h2, round(mv, 3)))
        await pg.select_option('#editor select.boqsel[data-k=clamp]', '5-7'); await W(pg, 300)
        await pg.click('#edTabs [data-tab=onpole]'); await W(pg, 200); await pg.click('#atClosure'); await W(pg, 300)
        await pg.click('#edTabs [data-tab=acc]'); await W(pg, 300); i7 = await pg.evaluate(INFO)
        ml = await pg.evaluate("(document.querySelector('#editor .boqrow[data-k=mloop] .lbl') || {}).textContent")
        check('B7. a hybrid closure on the pole: its loop (MAINTENANCE LOOP · WITH THE CLOSURE, MLoop 15 m (closure) in the line); On the pole counts 1; the closure size now asked', ml == 'MAINTENANCE LOOP · WITH THE CLOSURE' and 'MLoop 15 m (closure)' in i7['sum'] and 'On the pole1' in i7['nav'] and 'onpole:clo' in i7['miss'], (ml, i7))
        await pg.click('#edSave'); await W(pg, 600); await pg.locator('#askBox button', has_text='Save anyway').click(); await W(pg, 1200)
        r1 = await pg.evaluate("__polecam.points.find((x) => x.poleId === 'CC-1234')")
        check('B8. Save anyway: saved CC-1234, owner PLDT, clamp 5-7, closure on the pole', r1 and r1['boq'].get('owner') == 'PLDT' and r1['boq'].get('clamp') == '5-7' and r1.get('closure') and await pg.evaluate("document.getElementById('editor').hidden"), r1 and r1.get('boq'))
        # a handhole with a closure
        await capture(); await pg.select_option('#elemSel', 'Handhole'); await W(pg, 400); h = await pg.evaluate(INFO)
        await pg.click('#svCloOn'); await W(pg, 200); await pg.select_option('#svCloSz', '24C'); await pg.select_option('#svCloSt', 'Existing'); await pg.fill('#svClosureId', 'cl-0009'); await W(pg, 300)
        await pg.screenshot(path=OUT + '/b3_hh.png'); hs = await pg.evaluate(INFO)
        await pg.fill('#poleId', 'HH-0009'); await pg.click('#edSave'); await W(pg, 1200)
        rh = await pg.evaluate("__polecam.points.find((x) => x.poleId === 'HH-0009')")
        check('B9. a handhole: Photo/Model and Details, Status and Element on top (no type), no prefix button; its closure ticked, 24C Existing CL-0009, saved with it (no question: all set)',
              h['tabs'] == ['photo', 'details'] and h['top'] == ['svStatus', 'elemSel'] and not h['three'] and h['pfx'] is None and 'Closure 24C Existing CL-0009' in hs['sum']
              and rh and rh.get('closure') and rh.get('closureId') == 'CL-0009' and rh['boq'] == {'clo': '24C', 'cloSt': 'Existing'}, (h, hs['sum'], rh and {k: rh.get(k) for k in ('closure', 'closureId', 'boq')}))
        # NPT, and a pole ID turned into a handhole's
        await capture(); await pg.click('#nptBtn'); await W(pg, 300); n1 = await pg.evaluate(INFO)
        await pg.fill('#poleId', 'MH-0003'); await W(pg, 400); n2 = await pg.evaluate(INFO); el2 = await pg.input_value('#elemSel')
        check('B10. No tag: NPT, the pin says NPT, no prefix button; MH-0003 typed: the record is a manhole (no prefix button, its tabs)', n1['id'] == 'NPT' and n1['label'] == 'NPT' and n1['pfx'] is None and el2 == 'Manhole' and n2['pfx'] is None and n2['tabs'] == ['photo', 'details'] and n2['label'] == 'MH-0003', (n1, n2, el2))
        await pg.go_back(); await W(pg, 600)
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button', has_text='Discard').first.click(); await W(pg, 600)
        # the bin
        await pg.evaluate("(id) => __polecam.openEditorFor(__polecam.points.find((x) => x.poleId === id).id)", 'CC-1234'); await W(pg, 1200)
        t1 = await pg.evaluate(INFO); await pg.click('#edTrash'); await W(pg, 400)
        da = await pg.evaluate("() => [document.getElementById('askTitle').textContent, [...document.querySelectorAll('#askBox button')].map((b) => b.textContent)]")
        await pg.screenshot(path=OUT + '/b4_bin.png')
        await pg.locator('#askBox button', has_text='Delete').click(); await W(pg, 1200)
        gone = await pg.evaluate("!__polecam.points.some((x) => x.poleId === 'CC-1234') && document.getElementById('editor').hidden")
        check('B11. an opened record: the red bin at the upper right (not on a new one); it asks "Delete CC-1234?" (Cancel / Delete); Delete removes it', t1['trash'] and not i1['trash'] and da == ['Delete CC-1234?', ['Cancel', 'Delete']] and gone, (t1['trash'], da, gone))
        # the check at Save turned off (Settings)
        await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 400)
        await pg.evaluate("() => { const c = document.getElementById('setSaveCheck'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }"); await close_sheets(pg)
        await capture(); await pg.fill('#poleId', 'CC-7777'); await pg.click('#edSave'); await W(pg, 1200)
        r7 = await pg.evaluate("!!__polecam.points.find((x) => x.poleId === 'CC-7777') && document.getElementById('editor').hidden && document.getElementById('askBox').hidden")
        check('B12. Settings → Saving a record unticked: a pole with nothing set saves with no question', r7, r7)
        # PAT: one page as before
        await close_sheets(pg); await common.newproj(pg, 'PAT', 'PAT_FORM'); await close_sheets(pg)
        await capture()
        pa = await pg.evaluate("() => ({ tabs: document.getElementById('editor').classList.contains('tabs'), top: document.getElementById('edTop').hidden, nav: document.getElementById('edTabs').hidden, inId: document.getElementById('idGroup').contains(document.getElementById('elemTypeRow')), st: document.getElementById('idGroup').contains(document.getElementById('svStatusBox')), pfx: document.getElementById('idPfx').hidden, label: document.getElementById('pinLabel').textContent, off: document.querySelectorAll('#editor .off').length })")
        await pg.screenshot(path=OUT + '/b5_pat.png')
        check('B13. a PAT record: one page as before (no tabs, the fields in Element details), no prefix button; the pin shows its label', not pa['tabs'] and pa['top'] and pa['nav'] and pa['inId'] and pa['st'] and pa['pfx'] and pa['label'] == 'no ID yet' and pa['off'] == 0, pa)
        check('B14. no page errors (the form)', not [e for e in errs if 'PAGEERROR' in e or 'TypeError' in e], errs[:5])
        task.cancel(); await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
