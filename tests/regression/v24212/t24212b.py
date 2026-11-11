"""v2.42.12: the Drawing is of the project chosen, with that project's reference only as the map shows it.
 1. project A with a reference KMZ: its Drawing shows the reference (faint, dashed) and the legend names it
 2. the reference hidden on the map (KMZ button → Reference): the Drawing shows none
 3. after the Drawing and Export DXF of A, project B chosen: the old Drawing is let go; B's Drawing has B's points and no reference of A
 4. B with its own reference, its lines hidden on the map: not in the Drawing; no page errors"""
import asyncio, sys, os, json, zipfile, io, shutil, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); import common
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765'); OUT = S + '/v24212/out_b'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
FILE = PRIV + '/large/G-eSAA_TEST10KM_RTA.zip'; SAMPLE = APP + '/sample/G-eSAA_sample.zip'
pts = json.loads(zipfile.ZipFile(FILE).read('p1/points.json'))['points'][:30]
coords = ' '.join(f"{p['lon'] + 0.0004:.7f},{p['lat']:.7f},0" for p in pts)
kml = f'<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>route</name><LineString><coordinates>{coords}</coordinates></LineString></Placemark></Document></kml>'
KMZ = OUT + '/ref.kmz'; zf = zipfile.ZipFile(KMZ, 'w'); zf.writestr('doc.kml', kml); zf.close()
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def idle(pg, maxs=600):
    t0 = time.time()
    while time.time() - t0 < maxs:
        if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): return
        await W(pg, 250)
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 300)
async def imp(pg, f):
    await pg.set_input_files('#sharedInput', f); await pg.wait_for_selector('#askBox:not([hidden])', timeout=600000)
    for _ in range(4):
        if not await pg.locator('#askBox:not([hidden])').count(): break
        await pg.locator('#askBox button.primary').first.click(); await W(pg, 700)
    await idle(pg); await W(pg, 1200); await close_sheets(pg)
STATE = "() => { const P = __polecam.S, d = __polecam.drw; return { project: P.project, drw: d ? { items: d.items.length, ref: d.ref.length, first: d.items[0] && d.items[0].p.poleId } : null, refs: Object.keys(P.refs || {}), sheets: [...document.querySelectorAll('section.sheet:not([hidden])')].map((s) => s.id) }; }"
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read(); ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'; LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'
import urllib.parse
async def sheet(route):
    req = route.request
    if req.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    q = urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query)
    if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
    out = {'ok': True, 'name': common.SHEET_MOCK['name'], 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}
    return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(OUT + '/ud', executable_path=common.CHROME, viewport={'width': 1200, 'height': 800}, service_workers='block')
        await ctx.route('https://script.google.com/**', sheet)
        for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**'): await ctx.route(u, lambda r: r.abort())
        await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS); await ctx.add_init_script(common.ADM_OPEN_JS)
        pg = ctx.pages[0]; errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
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
        await imp(pg, SAMPLE); await imp(pg, FILE)
        A = await pg.evaluate("__polecam.S.project"); print('active after imports', A, await pg.evaluate("__polecam.S.projects"))
        await pg.set_input_files('#refInput', KMZ); await W(pg, 1500); await idle(pg); await close_sheets(pg)
        checks = []
        def check(n, ok, info=''): checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, '|', str(info)[:600], flush=True)
        await pg.click('#drawBtn'); await W(pg, 1800); s1 = await pg.evaluate(STATE); leg1 = await pg.text_content('#drawLegendBody') or ''
        check('1. project A with a reference KMZ: its Drawing shows the reference and the legend names it', s1['drw'] and s1['drw']['ref'] == 1 and 'Reference KMZ of this project (ref.kmz)' in leg1, (s1, leg1[-160:]))
        await close_sheets(pg)
        await pg.click('#refBtn'); await W(pg, 400); await pg.click('#rmRef'); await W(pg, 400); await pg.click('#rmClose'); await W(pg, 300)
        await pg.click('#drawBtn'); await W(pg, 1500); s2 = await pg.evaluate(STATE); leg2 = await pg.text_content('#drawLegendBody') or ''
        check('2. the reference hidden on the map: the Drawing shows none (nor the legend)', s2['drw'] and s2['drw']['ref'] == 0 and 'Reference KMZ' not in leg2, s2)
        await close_sheets(pg); await pg.click('#refBtn'); await W(pg, 400); await pg.click('#rmRef'); await W(pg, 400); await pg.click('#rmClose'); await W(pg, 300)
        await pg.click('#drawBtn'); await W(pg, 1500)
        await pg.click('#drawDxf'); await W(pg, 1200); await close_sheets(pg)
        names = await pg.evaluate("__polecam.S.projects"); B = [n for n in names if n != A][0]
        await pg.click('#projectName'); await W(pg, 800); await pg.click(f'button.task[data-name="{B}"]'); await W(pg, 800); await close_sheets(pg)
        s3 = await pg.evaluate(STATE)
        await pg.click('#drawBtn'); await W(pg, 1500); s3b = await pg.evaluate(STATE)
        check('3. after the Drawing and Export DXF of A, B chosen: the old Drawing let go; B\'s Drawing has B\'s 5 points and no reference', s3['drw'] is None and s3b['drw'] and s3b['drw']['items'] == 5 and s3b['drw']['ref'] == 0 and s3b['drw']['first'] == 'CC-0430621', (s3, s3b))
        await pg.locator('#drawCanvas').screenshot(path=OUT + '/d2.png'); await close_sheets(pg)
        await pg.evaluate("document.getElementById('refInput').value = ''"); await pg.set_input_files('#refInput', KMZ); await W(pg, 1500); await idle(pg); await close_sheets(pg)
        await W(pg, 2500)
        for _ in range(3):
            if await pg.locator('#refMenu:not([hidden])').count(): break
            await pg.click('#refBtn'); await W(pg, 600)
        await pg.click('#rmRefLines'); await W(pg, 400); await pg.click('#rmClose'); await W(pg, 300)
        await pg.click('#drawBtn'); await W(pg, 1500); s4 = await pg.evaluate(STATE)
        check('4. B with its own reference, its lines hidden on the map: none in the Drawing; no page errors', s4['drw'] and s4['drw']['ref'] == 0 and B in s4['refs'] and not errs, (s4, errs[:3]))
        print(f'{sum(checks)}/{len(checks)} passed')
        await ctx.close()
asyncio.run(main())
