"""v2.42.24 copy: the spans linked in capture order by the test hook (the route screen's button now makes cables). v2.42.21 copy: Route opens with Route tools and linking by pairs (the route card as before v2.42.21).
v2.42.4 (phone): fixes from the full review of 3 Nov 2026 that a phone test can show.
 1. editing a record keeps its altitude (Save wrote alt: null)
 2. an edited pole with a 2nd box, left unsaved and the page reloaded: "Open it" brings the 2nd box and its ID back, and Save keeps it
 3. the CSV's photo column names each photo as the Photos export does (naming "ID + time"); the KMZ's Size line has the 2nd box
 4. a site name with a line break (Alt+Enter in a sheet cell) no longer breaks the plan DXF (it opens and audits clean)
 5. the app log has no name, email or mobile number (the Saved toast had them)
 6. restoring an older backup keeps the records changed on the phone since (it put the old ones back)
 7. no page errors"""
import asyncio, sys, os, shutil, json, zipfile, io, re, csv as csvmod
# v2.42.8: the plan DXF is written with CRLF line ends (AutoCAD's own); ezdxf.read() on a text stream expects universal newlines
class _UStringIO(io.StringIO):
    def __init__(self, s='', *a, **k): super().__init__(s.replace('\r\n', '\n') if isinstance(s, str) else s, *a, **k)
io.StringIO = _UStringIO
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from common import newproj, skipscan, sheet_companies
from playwright.async_api import async_playwright
import ezdxf
BASE = os.environ.get('BASE', 'http://localhost:8765')
D = S + '/v2424'; OUT = D + '/out_a'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
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
async def open_rec(pg, pid):
    await close_sheets(pg); await pg.evaluate("document.getElementById('listBtn').click()"); await W(pg, 500)
    await pg.fill('#listSearch', pid); await pg.evaluate("document.getElementById('listSearch').dispatchEvent(new Event('input'))"); await W(pg, 500)
    await pg.locator('#listItems button', has_text=pid).first.click(); await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 900)
POLES = [(7.10000, 125.60000), (7.10030, 125.60020), (7.10060, 125.60040)]
REC = "(id) => { const p = __polecam.points.find((x) => x.poleId === id); return p ? JSON.parse(JSON.stringify(p)) : null; }"
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
        await ctx.add_init_script(common.NO_SAMPLE_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.ADM_OPEN_JS)
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
        await newproj(pg, 'survey', 'PLAN_44', purpose='As-plan'); await close_sheets(pg)
        for k, ll in enumerate(POLES):
            await capture(pg, cur, *ll); await pg.fill('#poleId', f'CC-000{k + 1}'); await save(pg)
        await close_sheets(pg); await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 400); await pg.evaluate('__polecam.capLinks()'); await W(pg, 400); await pg.click('#rbDone'); await W(pg, 600)
        # 1. altitude
        await pg.evaluate("() => { const p = __polecam.points.find((x) => x.poleId === 'CC-0001'); p.alt = 42.5; }")
        await open_rec(pg, 'CC-0001'); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#svRemarks'); await pg.fill('#svRemarks', 'checked again'); await save(pg)
        r1 = await pg.evaluate(REC, 'CC-0001')
        check('1. editing a record keeps its altitude (42.5 m), the change saved', r1 and r1.get('alt') == 42.5 and r1.get('remarks') == 'checked again', (r1 or {}).get('alt'))
        # 2. an unsaved edit with a 2nd box survives a reload
        await open_rec(pg, 'CC-0002')
        await pg.evaluate("document.getElementById('atNap').click()"); await W(pg, 200)
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#napTypeSel'); await pg.select_option('#napTypeSel', 'LCP 1x4'); await W(pg, 200); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#napId'); await pg.fill('#napId', 'DVO_003_L913_L01')
        await pg.evaluate("document.getElementById('nap2Add').click()"); await W(pg, 300); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#nap2Id'); await pg.fill('#nap2Id', 'DVO_003_L913_N02')
        await pg.evaluate("document.getElementById('nap2Id').dispatchEvent(new Event('input', { bubbles: true }))"); await W(pg, 2000)
        await pg.reload(); await W(pg, 2500)
        asked = await pg.is_visible('#askBox'); txt = await pg.text_content('#askText') if asked else ''
        if asked: await pg.click('#askBox button:has-text("Open it")'); await pg.wait_for_selector('#editor:not([hidden])', timeout=10000); await W(pg, 1200)
        v2 = await pg.evaluate("({ row: !document.getElementById('nap2Row').hidden && !document.getElementById('poleAttach').hidden, /* v2.42.17: in the On the pole tab */ id2: document.getElementById('nap2Id').value, type2: document.getElementById('nap2TypeSel').value, nap: document.getElementById('atNap').checked })")
        await pg.screenshot(path=OUT + '/restored_2nd_box.png')
        if asked: await save(pg)
        r2 = await pg.evaluate(REC, 'CC-0002')
        check('2. an unsaved edit with a 2nd box, page reloaded, "Open it": the 2nd box and its ID are back; Save keeps them',
              asked and v2['row'] and v2['id2'] == 'DVO_003_L913_N02' and v2['nap'] and r2 and r2.get('nap2') and r2.get('nap2Id') == 'DVO_003_L913_N02', (asked, txt[:80], v2, r2 and {k: r2.get(k) for k in ('nap', 'napId', 'nap2', 'nap2Id')}))
        # 3. CSV photo names (ID + time) and the 2nd box in the KMZ Size line
        await pg.evaluate("() => { __polecam.S.exp.naming = 'id_time'; __polecam.persist(); }")
        fc = await export(pg, 'doCsv', 'pts.csv'); raw = open(fc, 'rb').read()
        ctext = zipfile.ZipFile(io.BytesIO(raw)).read([n for n in zipfile.ZipFile(io.BytesIO(raw)).namelist() if n.endswith('.csv')][0]).decode('utf-8-sig') if raw[:2] == b'PK' else raw.decode('utf-8-sig')
        cr = list(csvmod.reader(io.StringIO(ctext))); h = cr[0]; pc = h.index('photo') if 'photo' in h else -1
        photos = {r[0]: r[pc] for r in cr[1:] if r and pc >= 0}
        fp = await export(pg, 'doPhotos', 'photos.zip'); zn = [n for n in zipfile.ZipFile(fp).namelist() if n.endswith('.jpg')]
        fk = await export(pg, 'doKmz', 'pts.kmz'); kz = zipfile.ZipFile(fk); kml = kz.read([n for n in kz.namelist() if n.endswith('.kml')][0]).decode('utf-8', 'replace')
        pm = re.search(r'<Placemark><name>CC-0002</name>(?:(?!</Placemark>).)*?</Placemark>', kml, re.S); pm = pm.group(0) if pm else ''
        check('3. the CSV photo column = the Photos export names (ID + time: CC-0001_20261103_…jpg); the KMZ Size line of CC-0002 has the LCP 1x4 and the NAP 1x16',
              photos and all(re.match(r'CC-000\d_\d{8}_\d{6}\.jpg$', v) for v in photos.values()) and set(photos.values()) == set(zn)
              and 'LCP 1x4' in pm and 'NAP 1x16' in pm, (photos, zn, re.findall(r'(?:LCP|NAP) 1x\d+[^<·]*', pm)[:4]))
        # 4. a line break in the site name
        await pg.evaluate("() => { const m = __polecam.S.meta['PLAN_44']; m.siteName = 'POBLACION\\nKABACAN'; m.plaId = 'MIN123'; __polecam.persist(); }")
        f = await export(pg, 'doDxf', 'plan.zip'); z = zipfile.ZipFile(f); txt4 = z.read([n for n in z.namelist() if n.endswith('.dxf')][0]).decode('utf-8', 'replace')
        ok4, info4 = False, ''
        try:
            doc = ezdxf.read(io.StringIO(txt4)); aud = doc.audit(); has = 'POBLACION KABACAN' in txt4
            ok4 = not aud.has_errors and has; info4 = (len(aud.errors), has)
        except Exception as e: info4 = 'not readable: ' + str(e)[:200]
        check('4. a site name with a line break: the plan DXF opens and audits clean, the name on one line (POBLACION KABACAN)', ok4, info4)
        # 5. the app log
        lg = await pg.evaluate("localStorage.getItem('polecam.log') || ''")
        leaks = [w for w in ('Mark Tamse', 'mark@example.com', '09171234567') if w in lg]
        check('5. the app log has no name, email or mobile number (the Saved toast is logged without them)', not leaks and '[you]' in lg, (leaks, len(lg)))
        # 6. restore an older backup
        fb = await export(pg, 'doBackup', 'backup.zip')
        await W(pg, 1200); await open_rec(pg, 'CC-0003'); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#svRemarks'); await pg.fill('#svRemarks', 'changed after the backup'); await save(pg)
        await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 400)
        await pg.set_input_files('#restoreInput', fb); await W(pg, 3000)
        for _ in range(3):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            await pg.locator('#askBox button.primary').first.click(); await W(pg, 1200)
        r6 = await pg.evaluate(REC, 'CC-0003'); t6 = await pg.evaluate("document.getElementById('toast').textContent")
        n6 = await pg.evaluate("__polecam.points.filter((p) => p.project === 'PLAN_44').length")
        check('6. restoring an older backup keeps CC-0003 as changed since (“kept”), nothing doubled', r6 and r6.get('remarks') == 'changed after the backup' and n6 == 3 and 'kept' in t6, ((r6 or {}).get('remarks'), n6, t6))
        task.cancel(); await ctx.close()
        check('no page errors', not errs, errs[:3])
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
