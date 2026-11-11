"""v2.35.1: one-tap Download of Google Drive packs on the website / iPhone. The admin pastes a Google Drive API key once
(Administration -> Offline map packs); the website then downloads each Drive pack through the Drive API (files/ID?alt=media&key=)
in resumable pieces and puts it to use: a road pack for the plan drawings, a map pack as the offline map in use.
Google's real answers cannot be reached from the test machine: www.googleapis.com is mocked here with CORS headers,
once exposing Content-Range (ranged pieces), once not (the app falls back to one stream)."""
import asyncio, sys, os, shutil, json, urllib.parse, re
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, sheet_companies, SHEET_MOCK
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_c'; os.makedirs(OUT, exist_ok=True)
ROAD = open(PRIV + '/roads_v235/G-eSAA roads - Davao Region - 2026-08-19.roadpack', 'rb').read()
MAP = open(S + '/fixtures/maps/PoleCam_mindanao_20261025.pmtiles', 'rb').read()
IDR, IDM, IDX = '1RoadDavaoAAAAAAAAAAAAAAAAAAAAAAAA', '1MapMindanaoBBBBBBBBBBBBBBBBBBBBBB', '1DeniedCCCCCCCCCCCCCCCCCCCCCCCCCCC'
KEY = 'AIzaSyTEST-key_0123456789abcdefghijklm'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900])
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(p_):
    for _ in range(8):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 250)
async def after_save(pg):
    await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
    if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
    for _ in range(3):
        if not await pg.locator('#askBox:not([hidden])').count(): break
        b = pg.locator('#askBox button:has-text("OK")')
        await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
async def open_maps(pg):
    await close_sheets(pg); await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 1200)
async def rows(pg):
    return await pg.evaluate("[...document.querySelectorAll('#packList .area-card')].map((r) => ({ t: r.querySelector('.t').textContent, s: r.querySelector('.s').textContent, btns: [...r.querySelectorAll('button')].map((b) => b.textContent) }))")
def row(rs, name): return next((r for r in rs if r['t'] == name), None)
async def tap(pg, name, label):
    await pg.evaluate("([n, l]) => [...document.querySelectorAll('#packList .area-card')].find((r) => r.querySelector('.t').textContent === n).querySelectorAll('button').forEach((b) => { if (b.textContent === l) b.click(); })", [name, label])
async def wait_job(pg):
    await W(pg, 600)
    for _ in range(120):
        if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): break
        await W(pg, 500)
    await W(pg, 300)
async def admin(pg, key):
    await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 400); await pg.click('#teamManage'); await W(pg, 300)
    if await pg.locator('#admPin').is_visible(): await pg.fill('#admPin', '1234'); await pg.click('#admUnlock'); await W(pg, 900)
    await pg.fill('#admDriveKey', key); await pg.click('#admSave'); await after_save(pg); await close_sheets(pg)

async def main():
    st = {'api': [], 'toasts': []}
    async def sheet(route):
        req = route.request
        if req.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        out = {'ok': True, 'name': SHEET_MOCK['name'], 'companies': SHEET_MOCK['companies'], 'admins': SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False}
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    async def drive_api(route):
        req = route.request; u = urllib.parse.urlparse(req.url); q = urllib.parse.parse_qs(u.query)
        fid = u.path.rsplit('/', 1)[-1]; rng = req.headers.get('range', '')
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'range', 'Access-Control-Allow-Methods': 'GET'}
        if req.method == 'OPTIONS': return await route.fulfill(status=204, headers=cors)
        st['api'].append({'id': fid, 'key': q.get('key', [''])[0], 'alt': q.get('alt', [''])[0], 'range': rng})
        if q.get('key', [''])[0] != KEY or fid == IDX or fid not in (IDR, IDM):
            return await route.fulfill(status=403 if fid != 'nope' else 404, headers=cors, content_type='application/json', body='{"error":{"code":403,"message":"The caller does not have permission"}}')
        data = ROAD if fid == IDR else MAP
        expose = fid == IDR  # the map pack: Content-Range not readable by the page -> the app reads the file in one stream
        m = re.match(r'bytes=(\d+)-(\d+)?$', rng)
        if m:
            a = int(m.group(1)); b = min(len(data) - 1, int(m.group(2) or len(data) - 1))
            h = {**cors, 'Content-Range': f'bytes {a}-{b}/{len(data)}', 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream'}
            if expose: h['Access-Control-Expose-Headers'] = 'Content-Range, Content-Length'
            return await route.fulfill(status=206, headers=h, body=data[a:b + 1])
        return await route.fulfill(status=200, headers={**cors, 'Content-Type': 'application/octet-stream'}, body=data)
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_c', ignore_errors=True)
        ctx, pg, errs, cur, st0, tk = await launch(p, f'{D}/ud_c', S + '/v17/vid/h_cc.mjpeg', project=False)
        await ctx.route('https://script.google.com/**', sheet)
        await ctx.route('https://www.googleapis.com/drive/v3/files/**', drive_api)
        pg.on('console', lambda m: st['toasts'].append(m.text) if 'toast' in m.text else None)
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
        await pg.fill('#admWriteKey', 'ADMIN-KEY-TEST')
        lines = [f'Roads · Davao Region · 2026-08-19 | https://drive.google.com/file/d/{IDR}/view?usp=sharing | 8.3',
                 f'Mindanao | https://drive.google.com/file/d/{IDM}/view?usp=sharing | 0.8',
                 f'Visayas | https://drive.google.com/file/d/{IDX}/view?usp=sharing | 130']
        await pg.fill('#admPacks', '\n'.join(lines)); await pg.dispatch_event('#admPacks', 'change'); await W(pg, 200)
        await pg.click('#admSave'); await after_save(pg)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        # ===== 1. no key: as before (Open in Drive, then Import a pack file)
        await open_maps(pg); r1 = await rows(pg)
        check('no Drive API key: the website keeps Open in Drive (no Download) for each Drive pack, as in v2.35.0',
              len(r1) == 3 and all(r['btns'] == ['Open in Drive'] for r in r1), r1)
        # ===== 2. a mistyped key is not kept
        await admin(pg, 'not a key!')
        k2 = await pg.evaluate("(__polecam.S.team.pol || {}).driveKey || null")
        check('a mistyped key (spaces, !) is not saved into the list', k2 is None, k2)
        # ===== 3. the key: one tap Download on each Drive pack
        await admin(pg, KEY)
        k3 = await pg.evaluate("(__polecam.S.team.pol || {}).driveKey || null")
        await open_maps(pg); r3 = await rows(pg)
        await pg.screenshot(path=f'{OUT}/c1_download_buttons.png')
        check('the key travels in the signed company list; each Drive pack now shows one Download button (no Open in Drive)',
              k3 == KEY and len(r3) == 3 and all(r['btns'] == ['Download'] for r in r3), (k3, r3))
        # ===== 4. road pack: one tap -> downloaded in pieces through the Drive API and ready for the plan drawings
        st['api'].clear()
        await tap(pg, 'Roads · Davao Region · 2026-08-19', 'Download'); await wait_job(pg)
        rp = await pg.evaluate(f"(() => {{ const p = __polecam.S.packs['drive-{IDR}']; return p ? {{ kind: p.kind, done: p.done, size: p.size, region: p.region, roads: p.counts && p.counts.roads }} : null; }})()")
        act4 = await pg.evaluate("__polecam.S.activePack || null")
        api4 = list(st['api']); r4 = row(await rows(pg), 'Roads · Davao Region · 2026-08-19')
        check('road pack: one tap downloads it from the Drive API (alt=media, the key) in 4 MB pieces and makes it ready for the plan drawings; the offline map is not changed',
              rp and rp['kind'] == 'roads' and rp['done'] and rp['size'] == len(ROAD) and rp['region'] == 'Davao Region' and rp['roads'] > 100000 and act4 is None
              and len(api4) == 3 and all(a['id'] == IDR and a['key'] == KEY and a['alt'] == 'media' and a['range'].startswith('bytes=') for a in api4)
              and r4 and 'on this phone' in r4['s'] and r4['btns'] == ['Delete'], (rp, act4, api4, r4))
        # ===== 5. map pack: one tap -> downloaded (one stream when the range answer is not readable) and made the map in use
        st['api'].clear()
        await tap(pg, 'Mindanao', 'Download'); await wait_job(pg)
        mp = await pg.evaluate(f"(() => {{ const p = __polecam.S.packs['drive-{IDM}']; return p ? {{ kind: p.kind || '', done: p.done, size: p.size, maxzoom: p.maxzoom }} : null; }})()")
        act5 = await pg.evaluate("__polecam.S.activePack || null"); toast5 = await pg.text_content('#toast')
        api5 = list(st['api']); r5 = row(await rows(pg), 'Mindanao')
        await pg.screenshot(path=f'{OUT}/c2_after_downloads.png')
        check('map pack: one tap downloads it (a Range answer the page cannot read -> one stream) and makes it the offline map in use',
              mp and mp['done'] and mp['size'] == len(MAP) and not mp['kind'] and act5 == f'drive-{IDM}' and 'now uses it' in (toast5 or '')
              and any(not a['range'] for a in api5) and r5 and 'in use' in r5['s'] and 'Show' in r5['btns'], (mp, act5, toast5, api5, r5))
        # the offline map really draws from it
        await close_sheets(pg)
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 800)
        await tap(pg, 'Mindanao', 'Show'); await W(pg, 2500)
        base = await pg.evaluate("__polecam.S.base")
        await pg.screenshot(path=f'{OUT}/c3_offline_map.png')
        check('Show puts the downloaded map pack on screen as the offline map', base == 'offline', base)
        # ===== 6. a file Google refuses: a plain message, and Open in Drive comes back as the way around
        await open_maps(pg); st['api'].clear()
        await tap(pg, 'Visayas', 'Download'); await W(pg, 2500); await wait_job(pg)
        toast6 = await pg.text_content('#toast'); inst6 = await pg.evaluate(f"!!__polecam.S.packs['drive-{IDX}']"); r6 = row(await rows(pg), 'Visayas')
        await pg.screenshot(path=f'{OUT}/c4_refused.png')
        check('a file Google refuses (HTTP 403): the user is told why in plain words (sharing / API key), nothing half-saved, and Open in Drive is offered again',
              'Google Drive refused the download (HTTP 403)' in (toast6 or '') and 'Anyone with the link' in toast6 and not inst6 and r6 and r6['btns'] == ['Download', 'Open in Drive'], (toast6, inst6, r6))
        # ===== 7. validation on the receiving phone
        v = await pg.evaluate(f"""(() => {{ const t = __polecam.S.team; return {{ ok: !!t && t.pol.driveKey === '{KEY}' }}; }})()""")
        bad = [e for e in errs if 'PAGEERROR' in e]
        check('no page errors', not bad and v['ok'], bad[:5])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')

asyncio.run(main())
