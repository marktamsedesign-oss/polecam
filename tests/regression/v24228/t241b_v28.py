"""(v2.42.28 copy: What to export and Plan settings on the Drawing.)
v2.42.24 copy: the spans linked in capture order by the test hook (the route screen's button now makes cables). v2.42.21 copy: Route opens with Route tools and linking by pairs (the route card as before v2.42.21).
v2.41.0: the NAP and the hybrid closure are on the pole (no NAP or closure element in the record's element list).
 1. the element list of a new record has no NAP and no Closure
 2. a pole with a Dummy NAP: the size (12C by default) and New / Existing in small dropdowns; its ID offered as PLA ID_C01_D01
    (MIN123_C01_D01); with a hybrid closure 48C Existing and its ID as typed
 3. another pole with a NAP: ID typed DVO_003_L913_N01; NAP (1x8) New
 4. the BOQ: Dummy NAP 12C New, NAP 1x8 New, Closure 48C Existing, with their IDs
 5. the plan DXF: the dummy NAP and the NAP on their poles (the template's models), the closure EXISTING with CL-77, the IDs as typed;
    the route check counts the dummy NAP; phone screenshots of the record, the Drawing and the style; no page errors"""
import asyncio, sys, os, shutil, json, zipfile, io, re, time
# v2.42.8: the plan DXF is written with CRLF line ends (AutoCAD's own); ezdxf.read() on a text stream expects universal newlines
class _UStringIO(io.StringIO):
    def __init__(self, s='', *a, **k): super().__init__(s.replace('\r\n', '\n') if isinstance(s, str) else s, *a, **k)
io.StringIO = _UStringIO
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from common import newproj, skipscan, sheet_companies
from playwright.async_api import async_playwright
import ezdxf, openpyxl
BASE = os.environ.get('BASE', 'http://localhost:8765')
D = S + '/v241'; OUT = S + '/v24228/out_241b_v28'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'; LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:1200], flush=True)
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 250)
async def capture(pg, cur, lat, lon):
    cur.update({'latitude': lat, 'longitude': lon, 'accuracy': 3}); await W(pg, 1300)
    await pg.click('#captureBtn'); await W(pg, 1300)
    await pg.click('#shutter'); await W(pg, 2500); await skipscan(pg)
    await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 900)
async def save(pg):
    await pg.evaluate("() => [...document.querySelectorAll('#edSave, #edSaveTop')].find(e => e.getClientRects().length).click()")
    await pg.wait_for_selector('#editor', state='hidden', timeout=15000); await W(pg, 700)
async def export(pg, sel, name):
    await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate(f"window.__polecam.showExport('{sel}')"); await W(pg, 400)
    await pg.evaluate(f"document.getElementById('{sel}').click()")
    for _ in range(1200):
        if await pg.locator('#resultBox:not([hidden])').count(): break
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
        await W(pg, 250)
    async with pg.expect_download(timeout=120000) as d: await pg.click('#resSave')
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f); await close_sheets(pg); return f
POLES = [(7.10000, 125.60000), (7.10030, 125.60020), (7.10060, 125.60040), (7.10090, 125.60060)]
async def main():
    async def sheet(route):
        req = route.request
        if req.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(req.url).query)
        if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
        out = {'ok': True, 'name': common.SHEET_MOCK['name'], 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    async with async_playwright() as p:
        geo = {'latitude': POLES[0][0], 'longitude': POLES[0][1], 'accuracy': 3}
        ctx = await p.chromium.launch_persistent_context(OUT + '/ud', executable_path=common.CHROME, viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
            permissions=['geolocation', 'camera'], geolocation=geo, accept_downloads=True, service_workers='block',
            args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={S}/v17/vid/h_cc.mjpeg'])
        for u in ('https://tile.openstreetmap.org/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**', 'https://basemaps.cartocdn.com/**'): await ctx.route(u, lambda r: r.abort())
        await ctx.route('https://script.google.com/**', sheet)
        await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS); await ctx.add_init_script(common.ADM_OPEN_JS)
        cur = dict(geo)
        async def hb():
            while True:
                try: await ctx.set_geolocation(cur)
                except Exception: return
                await asyncio.sleep(1)
        task = asyncio.create_task(hb())
        pg = ctx.pages[0]; errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(BASE + '/index.html'); await W(pg, 1500)
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
        await pg.fill('#admWriteKey', 'ADMIN-KEY-TEST'); await pg.fill('#admDxfSeed', LINK1); await pg.click('#admSave')
        await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
        if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
        for _ in range(3):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        await newproj(pg, 'survey', 'PLAN_41', purpose='As-plan'); await close_sheets(pg)
        await pg.evaluate("() => { const m = __polecam.S.meta['PLAN_41']; m.plaId = 'MIN123'; }")
        for k, ll in enumerate(POLES[:2]):
            await capture(pg, cur, *ll); await pg.fill('#poleId', f'CC-000{k + 1}')
            if k == 0:
                opts = await pg.evaluate("[...document.getElementById('elemSel').options].map((o) => o.value)")
                check('1. the element list of a new record has no NAP and no Closure (they are on the pole)', 'NAP' not in opts and 'Closure' not in opts and 'Pole' in opts and 'Handhole' in opts, opts)
            await save(pg)
        await close_sheets(pg); await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 400); await pg.evaluate('__polecam.capLinks()'); await W(pg, 400); await pg.click('#rbDone'); await W(pg, 600)
        # 2. a pole with a dummy NAP and a hybrid closure
        await capture(pg, cur, *POLES[2]); await pg.fill('#poleId', 'CC-0003')
        await pg.evaluate("document.getElementById('atNap').click()"); await W(pg, 200)
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#napTypeSel'); await pg.select_option('#napTypeSel', 'Dummy NAP'); await W(pg, 300)
        a = await pg.evaluate("({ id: document.getElementById('napId').value, sz: document.getElementById('napSzSel').value, szVis: document.getElementById('napSzSel').getClientRects().length > 0, st: document.getElementById('napStSel').value, szOpts: [...document.getElementById('napSzSel').options].map((o) => o.value) })")
        await pg.evaluate("document.getElementById('atClosure').click()"); await W(pg, 200); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#cloSzSel'); await pg.select_option('#cloSzSel', '48C'); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#cloStSel'); await pg.select_option('#cloStSel', 'Existing'); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#closureId'); await pg.fill('#closureId', 'CL-77'); await W(pg, 200)
        await pg.evaluate("document.getElementById('poleAttach').scrollIntoView({ block: 'center' })"); await W(pg, 400)
        await pg.screenshot(path=OUT + '/record_attach.png')
        await save(pg)
        r3 = await pg.evaluate("(() => { const p = __polecam.points.find((x) => x.poleId === 'CC-0003'); return { nap: p.nap, napId: p.napId, closure: p.closure, closureId: p.closureId, boq: p.boq }; })()")
        check('2. a dummy NAP: size 12C (12C to 288C) and New in small dropdowns, its ID offered as MIN123_C01_D01; a hybrid closure 48C Existing, CL-77; all kept on the pole',
              a['id'] == 'MIN123_C01_D01' and a['sz'] == '12C' and a['szVis'] and a['st'] == 'New' and a['szOpts'][1:] == ['12C', '24C', '48C', '72C', '144C', '288C']
              and r3['nap'] and r3['napId'] == 'MIN123_C01_D01' and r3['closure'] and r3['closureId'] == 'CL-77' and r3['boq'].get('napType') == 'Dummy NAP' and r3['boq'].get('napSz') == '12C' and r3['boq'].get('napSt') == 'New' and r3['boq'].get('clo') == '48C' and r3['boq'].get('cloSt') == 'Existing', (a, r3))
        # 3. a NAP with its typed ID
        await capture(pg, cur, *POLES[3]); await pg.fill('#poleId', 'CC-0004')
        await pg.evaluate("document.getElementById('atNap').click()"); await W(pg, 200)
        b = await pg.evaluate("({ type: document.getElementById('napTypeSel').value, szVis: document.getElementById('napSzSel').getClientRects().length > 0, ph: document.getElementById('napId').placeholder, sug: !document.getElementById('napIdSug').hidden })")
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#napId'); await pg.fill('#napId', 'DVO_003_L913_N01'); await save(pg)
        r4 = await pg.evaluate("(() => { const p = __polecam.points.find((x) => x.poleId === 'CC-0004'); return { napId: p.napId, boq: p.boq }; })()")
        check('3. a NAP (1x8) on another pole: no size, no offered ID (typed: DVO_003_L913_N01), New', b['type'] == 'NAP 1x8' and not b['szVis'] and 'DVO_003_L913_N01' in b['ph'] and not b['sug'] and r4['napId'] == 'DVO_003_L913_N01' and r4['boq'].get('napType') == 'NAP 1x8' and r4['boq'].get('napSt') == 'New', (b, r4))
        await close_sheets(pg); await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 400); await pg.evaluate('__polecam.capLinks()'); await W(pg, 400); await pg.click('#rbDone'); await W(pg, 600)
        # 4. the BOQ
        fb = await export(pg, 'doBoq', 'boq.xlsx')
        wb = openpyxl.load_workbook(fb, read_only=True); rows = [[c for c in r] for ws in wb.worksheets for r in ws.iter_rows(values_only=True) if r and r[0] in ('Dummy NAP', 'NAP', 'Closure')]
        check('4. the BOQ: Dummy NAP 12C New (MIN123_C01_D01), NAP 1x8 New (DVO_003_L913_N01), Closure 48C Existing (CL-77)',
              any(r[0] == 'Dummy NAP' and r[1] == '12C' and r[2] == 'New' and 'MIN123_C01_D01' in str(r[4]) for r in rows) and any(r[0] == 'NAP' and r[1] == 'NAP 1x8' and 'DVO_003_L913_N01' in str(r[4]) for r in rows)
              and any(r[0] == 'Closure' and r[1] == '48C' and r[2] == 'Existing' and 'CL-77' in str(r[4]) for r in rows), rows)
        # 5. the plan
        f = await export(pg, 'doDxf', 'plan.zip'); z = zipfile.ZipFile(f)
        doc = ezdxf.read(io.StringIO(z.read([n for n in z.namelist() if n.endswith('.dxf')][0]).decode('utf-8', 'replace')))
        seedh = {e.dxf.handle for e in ezdxf.read(io.StringIO(SEED)).modelspace()}
        msp = [e for e in doc.modelspace() if e.dxf.handle not in seedh]
        ins = [e.dxf.name for e in msp if e.dxftype() == 'INSERT']
        joint = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name == 'P-Joint']
        jt = {a.dxf.tag: a.dxf.text for e in joint for a in e.attribs}
        texts = [e.dxf.text for e in msp if e.dxftype() == 'TEXT']
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1800)
        for _ in range(4): await pg.click('#drawCanvas', position={'x': 195, 'y': 380}); await pg.mouse.wheel(0, -400); await W(pg, 200)
        await pg.click('#drawLegend summary'); await W(pg, 300)
        await pg.screenshot(path=OUT + '/drawing_phone.png')
        await pg.click('#drawWhat'); await W(pg, 300); await pg.screenshot(path=OUT + '/drawing_what_phone.png'); await pg.click('#mxClose'); await W(pg, 200)  # v2.42.28: What to export
        await pg.click('#drawMap'); await W(pg, 300); await pg.screenshot(path=OUT + '/drawing_map_phone.png'); await pg.click('#drawMap'); await W(pg, 200)
        await pg.click('#drawSetBtn'); await W(pg, 500); await pg.screenshot(path=OUT + '/plan_settings_phone.png'); await pg.click('#psStyle'); await W(pg, 600); await pg.screenshot(path=OUT + '/style_phone.png')  # v2.42.28: Drawing style in Plan settings
        await close_sheets(pg)
        tags = await pg.evaluate("(() => { const d = __polecam.drw; return null; })()")
        check('5. the plan: the dummy NAP and the NAP drawn on their poles with the template\'s models, the closure EXISTING with CL-77, the IDs as typed; no page errors',
              'dummy nap' in ins and 'proposed NAP' in ins and jt.get('JT_ID') == 'EXISTING' and jt.get('JOINT') == 'CL-77' and 'MIN123_C01_D01' in texts and 'DVO_003_L913_N01' in texts and not errs,
              (sorted(set(ins))[:20], jt, [t for t in texts if re.search(r'MIN123|DVO_', t or '')], errs[:3]))
        task.cancel(); await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
