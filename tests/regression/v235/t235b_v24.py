"""v2.42.24 copy: the spans linked in capture order by the test hook (the route screen's button now makes cables). v2.42.21 copy: Route opens with Route tools and linking by pairs (the route card as before v2.42.21).
v2.35: road packs (tools/osm-pack) — the plan drawing takes its roads, landmarks, cities / municipalities and barangays from a
road pack on the phone, with no internet (OpenStreetMap / Overpass blocked); the admin pastes packs.txt (# lines skipped, more
than 30 packs); a road pack is imported like a map pack but is not a map (no Use / Show, the offline map unchanged); the ROW
AREA COVERAGE table is filled (the real Davao Region pack: Davao City; a synthetic pack with a PSA-like barangay file: the
barangays, a long name made smaller to stay on one line); the vicinity route is 3 x wider; the title sheet has the logo."""
import asyncio, sys, os, shutil, json, zipfile, re, io, urllib.parse, math, glob
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, skipscan, sheet_companies, SHEET_MOCK
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_b'; os.makedirs(OUT, exist_ok=True)
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
POLES = json.load(open(PRIV + '/fx/poles_user.json'))
REAL = PRIV + '/roads_psa/G-eSAA roads - Davao Region - 2026-08-19.roadpack'
SYN = glob.glob(D + '/synth/out/*.roadpack')[0]
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900])
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(p_):
    for _ in range(8):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 250)
async def capture(pg, cur, lat, lon):
    cur.update({'latitude': lat, 'longitude': lon, 'accuracy': 3}); await W(pg, 1300)
    await pg.click('#captureBtn'); await W(pg, 1300)
    await pg.click('#shutter'); await W(pg, 2500); await skipscan(pg)
    await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 700)
async def save(pg):
    if await pg.evaluate("document.getElementById('editor').classList.contains('kbfield')"): await pg.click('#kbDone'); await W(pg, 300)
    await pg.evaluate("() => [...document.querySelectorAll('#edSave, #edSaveTop')].find(e => e.getClientRects().length).click()")
    await pg.wait_for_selector('#editor', state='hidden', timeout=15000); await W(pg, 400)
async def after_save(pg):
    await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
    if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
    for _ in range(3):
        if not await pg.locator('#askBox:not([hidden])').count(): break
        b = pg.locator('#askBox button:has-text("OK")')
        await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
async def dl(pg, click, path):
    async with pg.expect_download(timeout=180000) as d: await click()
    v = await d.value; await v.save_as(path); return path
def recs_of(txt):
    L = txt.splitlines(); P = [(L[i].strip(), L[i + 1]) for i in range(0, len(L) - 1, 2)]; recs = []; cur = None
    for c, v in P:
        if c == '0': cur = [(c, v)]; recs.append(cur)
        elif cur is not None: cur.append((c, v))
    return recs
g = lambda r, c: next((v for k, v in r if k == c), None)
ga = lambda r, c: [v for k, v in r if k == c]
ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'
LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'

async def export(pg, name):
    await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate("window.__polecam.showExport('doDxf')"); await W(pg, 300)
    await pg.click('#doDxf'); await pg.wait_for_selector('#resultBox:not([hidden])', timeout=180000); await W(pg, 300)
    f = await dl(pg, lambda: pg.click('#resSave'), f'{OUT}/{name}.zip'); await close_sheets(pg)
    z = zipfile.ZipFile(f); dxfn = [n for n in z.namelist() if n.endswith('.dxf')][0]
    txt = z.read(dxfn).decode('utf-8'); open(f'{OUT}/{name}.dxf', 'w', encoding='utf-8', newline='').write(txt)
    return txt, z.read('README.txt').decode(), z.namelist()

def row_texts(txt):
    R = recs_of(txt); out = {}
    # v2.36: the table may have moved beside the plan: its window follows its title (14845.4, 16665.0 in the template)
    t = next((r for r in R if r[0][1] == 'MTEXT' and 'RIGHT OF WAY AREA COVERAGE' in (''.join(ga(r, '3')) + (g(r, '1') or ''))), None)
    dx, dy = (float(g(t, '10')) - 14845.38577952316, float(g(t, '20')) - 16665.00402233983) if t else (0, 0)
    for r in R:
        if r[0][1] == 'MTEXT' and g(r, '8') == 'POST LABLE' and 14500 + dx < float(g(r, '10') or 0) < 15200 + dx and 16500 + dy < float(g(r, '20') or 0) < 16700 + dy:
            out[(round(float(g(r, '10'))), round(float(g(r, '20'))))] = (''.join(ga(r, '3')) + (g(r, '1') or ''), float(g(r, '40')), float(g(r, '41')))
    return out

async def import_pack(pg, path):
    await close_sheets(pg)
    await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 1200)
    await pg.set_input_files('#packFileInput', path); await W(pg, 2500)
    for _ in range(40):
        if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): break
        await W(pg, 500)
    await W(pg, 600)

async def main():
    st = {'overpass': 0, 'cur': ID1}
    async def sheet(route):
        req = route.request
        if req.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query)
        if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
        out = {'ok': True, 'name': SHEET_MOCK['name'], 'companies': SHEET_MOCK['companies'], 'admins': SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    async def overpass(route): st['overpass'] += 1; await route.fulfill(status=504, body='timeout')
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_b', ignore_errors=True)
        ctx, pg, errs, cur, st0, tk = await launch(p, f'{D}/ud_b', S + '/v17/vid/h_cc.mjpeg', project=False, geo={'latitude': POLES[0]['ll'][0], 'longitude': POLES[0]['ll'][1], 'accuracy': 3})
        await ctx.route('https://script.google.com/**', sheet)
        await ctx.route('https://overpass-api.de/**', overpass)
        for u in ('https://tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', 'https://server.arcgisonline.com/**', 'https://*.tile.openstreetmap.org/**'): await ctx.route(u, lambda r: r.abort())
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
        await pg.fill('#admWriteKey', 'ADMIN-KEY-TEST'); await pg.fill('#admDxfSeed', LINK1)
        # ===== 1. the admin pastes packs.txt (with its # lines) and more than 30 packs
        lines = ['# G-eSAA road packs (OpenStreetMap 2026-08-19). Upload each file to Google Drive (sharing: Anyone with the link),', '# then in G-eSAA: ...']
        lines += [f'Roads · Region {i:02d} | https://drive.google.com/file/d/1RoadPack{i:02d}xxxxxxxxxxxxxxxxxxxxxxxx/view | {4 + i % 7}.{i % 10}' for i in range(18)]
        many = lines + [f'Map pack {i:02d} | https://drive.google.com/file/d/1MapPack{i:02d}yyyyyyyyyyyyyyyyyyyyyyyyy/view | 150' for i in range(15)]
        await pg.fill('#admPacks', '\n'.join(many)); await pg.dispatch_event('#admPacks', 'change'); await W(pg, 200)
        info33 = await pg.text_content('#admPacksInfo')
        lines += [f'Map pack {i:02d} | https://drive.google.com/file/d/1MapPack{i:02d}yyyyyyyyyyyyyyyyyyyyyyyyy/view | 150' for i in range(10)]
        await pg.fill('#admPacks', '\n'.join(lines)); await pg.dispatch_event('#admPacks', 'change'); await W(pg, 200)
        info = await pg.text_content('#admPacksInfo')
        await pg.click('#admSave'); await after_save(pg)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        np_ = await pg.evaluate("(__polecam.S.team && __polecam.S.team.pol && __polecam.S.team.pol.packs || []).length")
        check('admin: packs.txt pasted as is (its # lines skipped): 18 road packs + 10 map packs kept; more than 30: the admin is told which are left out',
              np_ == 28 and info.startswith('28 map packs') and 'not a Google Drive link' not in info and 'only the first 30 are kept (3 left out)' in info33, (np_, info, info33))
        # ===== 2. a road pack file imported: a road pack, not a map
        await import_pack(pg, REAL)
        pk = await pg.evaluate("Object.values(__polecam.S.packs).map((p) => ({ id: p.id, name: p.name, kind: p.kind, done: p.done, bbox: p.bbox, date: p.date, counts: p.counts, region: p.region }))")
        rows = await pg.evaluate("[...document.querySelectorAll('#packList .area-card')].filter((r) => /Davao/.test(r.textContent)).map((r) => ({ t: r.textContent, btns: [...r.querySelectorAll('button')].map((b) => b.textContent) }))")
        act = await pg.evaluate("__polecam.S.activePack || null")
        await pg.screenshot(path=f'{OUT}/a1_packs.png')
        rp = [x for x in pk if x['kind'] == 'roads']
        check('a .roadpack file imports as a road pack (region, date, counts, bounds read from it); the pack list says what it is, with no Use / Show; it is not made the offline map',
              len(rp) == 1 and rp[0]['done'] and rp[0]['region'] == 'Davao Region' and rp[0]['date'] == '20260819' and rp[0]['counts']['roads'] > 100000 and rp[0]['bbox'][0] < 125.62 < rp[0]['bbox'][2]
              and rows and 'road pack for the plan drawings' in rows[0]['t'] and 'roads' in rows[0]['t'] and not any(b in ('Use', 'Show') for b in rows[0]['btns']) and act is None,
              (pk, rows, act))
        await close_sheets(pg)
        # ===== 3. survey and export with no OpenStreetMap: roads, landmarks, Davao City from the pack
        await newproj(pg, 'survey', 'PLAN_35', purpose='As-plan'); await close_sheets(pg)
        for P in POLES:
            await capture(pg, cur, *P['ll']); await pg.fill('#poleId', P['id']); await save(pg)
        await close_sheets(pg)
        await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 400); await pg.evaluate('__polecam.capLinks()'); await W(pg, 400); await pg.click('#rbDone'); await W(pg, 600)
        txt, readme, names = await export(pg, 'plan_real')
        R = recs_of(txt)
        streets = set(g(r, '1') for r in R if r[0][1] == 'TEXT' and g(r, '8') == 'STREET NAME')
        roadln = [l for l in readme.splitlines() if l.startswith('Roads:')]; rowln = [l for l in readme.splitlines() if l.startswith('Right of way')]
        check('no internet for roads (OpenStreetMap blocked, never asked): the roads, street names and landmarks come from the road pack, said in the README',
              st['overpass'] == 0 and roadln and 'from the road pack Davao Region (OpenStreetMap 2026-08-19)' in roadln[0] and {'WATUSI STREET', 'SAN GABRIEL STREET'} <= streets, (st['overpass'], roadln, sorted(streets)[:12]))
        rt = row_texts(txt); vals = [v[0] for v in rt.values()]
        check('ROW AREA COVERAGE with the PSA / NAMRIA barangays (HDX file): DAVAO CITY, BUHANGIN (POB.), TOTAL - 1 and TOTAL - 1; the README names the barangay file',
              'DAVAO CITY' in vals and 'BUHANGIN (POB.)' in vals and vals.count('TOTAL - 1') == 2 and rowln and 'Davao City: Buhangin (Pob.)' in rowln[0] and 'phl_admin_boundaries.shp.zip' in rowln[0] and 'no barangay boundary' not in rowln[0], (sorted(vals), rowln))
        vic = [r for r in R if r[0][1] == 'LWPOLYLINE' and g(r, '8') == 'G-ESAA VICINITY' and g(r, '43') and float(g(r, '43')) > 0 and g(r, '6') == 'DASHED']  # v2.36: the route (not its white band, the pole dots or the area circle)
        check('the vicinity route wide (v2.40: 1.1 % of the map, 16.5 m on a 1.5 km map; v2.37: 15 m) with its dashes scaled to match (v2.42.10: a dash 3 times the line\'s width on the sheet: 26.4)', vic and all(abs(float(g(r, '43')) - 16.5) < 0.01 and abs(float(g(r, '48') or 0) - 26.4) < 0.05 for r in vic), [(g(r, '43'), g(r, '48'), g(r, '6')) for r in vic][:4])
        # ===== 4. a pack with barangay boundaries (synthetic, from a PSA-like file): the barangays, a long name on one line
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 1200)
        await pg.locator('#packList .area-card:has-text("Davao") button:has-text("Delete")').click(); await W(pg, 300)
        await pg.locator('#packList .area-card:has-text("Davao") button:has-text("Confirm")').click(); await W(pg, 1500)
        left = await pg.evaluate("Object.keys(__polecam.S.packs).length")
        await close_sheets(pg)
        await import_pack(pg, SYN); await close_sheets(pg)
        txt2, readme2, _ = await export(pg, 'plan_syn')
        rt2 = row_texts(txt2); v2 = {k: v for k, v in rt2.items()}; vals2 = [v[0] for v in rt2.values()]
        rowln2 = [l for l in readme2.splitlines() if l.startswith('Right of way')]
        longn = [v for v in rt2.values() if v[0].startswith('SAN ANTONIO DE PADUA')]
        shortn = [v for v in rt2.values() if v[0] == 'BARANGAY SOUTH (TEST)']
        check('road pack deleted from the list (Delete, Confirm); a pack made with a barangay file fills the barangays along the route: DAVAO CITY (from the file), both barangays, TOTAL - 2',
              left == 0 and 'DAVAO CITY' in vals2 and longn and shortn and 'TOTAL - 1' in vals2 and 'TOTAL - 2' in vals2 and rowln2 and 'brgy_test.zip' in rowln2[0], (left, sorted(vals2), rowln2))
        check('a long barangay name stays on one line of its row: smaller text, its box as wide as the cell; a short one keeps the template size',
              longn and longn[0][1] < 9 and longn[0][2] > 200 and shortn and shortn[0][1] == 9, (longn, shortn))
        tl = [r for r in recs_of(txt2) if r[0][1] == 'LAYOUT' and ga(r, '1')[-1] == 'TITLE']
        check('no JS errors', not [e for e in errs if 'favicon' not in e], errs[:5])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} checks passed')

asyncio.run(main())
