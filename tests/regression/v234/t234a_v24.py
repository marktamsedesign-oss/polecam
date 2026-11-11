"""v2.42.24 copy: the spans linked in capture order by the test hook (the route screen's button now makes cables). v2.42.21 copy: Route opens with Route tools and linking by pairs (the route card as before v2.42.21).
v2.34 (from v2.33: one size for poles, labels, photos and spans; photos beside their pole with no line; the cable 2 m outside the road edge; street names per sheet; title blocks from the project details; the company logo shared through the sheet; the vicinity street map drawn from the roads when no tiles come. From v2.32 a; v2.33: the pole label as material / tag without the material / latitude / longitude in one stack): the plan template comes by itself through the online sheet (website too: no tap), and a newer one from the admin
replaces it by itself; the plan ZIP carries the pole photos and the vicinity street map (tiles turned to the UTM grid), the DXF
links them; the cable is a broken line (aerial), red; the vicinity viewport shows only the map and the route.
Uses the user's own sample (6 poles, their roads)."""
import asyncio, sys, os, shutil, json, zipfile, re, subprocess, io, urllib.parse, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, skipscan, sheet_companies, SHEET_MOCK
from playwright.async_api import async_playwright
from PIL import Image
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_a'; os.makedirs(OUT, exist_ok=True)
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
OVP = open(PRIV + '/fx/overpass_user.json').read()
POLES = json.load(open(PRIV + '/fx/poles_user.json'))
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
ID1, ID2 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456', '1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543'
LINK1, LINK2 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing', f'https://drive.google.com/file/d/{ID2}/view?usp=sharing'
BOQ = {'NPT': {'guy': 'Head guy'}, 'CC-XX30643': {'arm': 'Single arm', 'guy': 'Side guy'}, 'CC-0430621': {'mloop': 'Yes'},
       'PP-0001': {'guy': 'Head guy', 'height': '9.14m', 'clamp': '8-9'}, 'CC-X4X0652': {'arm': 'Extension arm 26"'}}
def tile_rgb(x, y): return ((x * 37) % 200 + 30, (y * 53) % 200 + 30, ((x + y) * 17) % 200 + 30)
TILES = {}
def tile_png(x, y):
    k = (x, y)
    if k not in TILES:
        b = io.BytesIO(); Image.new('RGB', (256, 256), tile_rgb(x, y)).save(b, 'PNG'); TILES[k] = b.getvalue()
    return TILES[k]
def recs_of(txt):
    L = txt.splitlines(); P = [(L[i].strip(), L[i + 1]) for i in range(0, len(L) - 1, 2)]; recs = []; cur = None
    for c, v in P:
        if c == '0': cur = [(c, v)]; recs.append(cur)
        elif cur is not None: cur.append((c, v))
    return recs
g = lambda r, c: next((v for k, v in r if k == c), None)
ga = lambda r, c: [v for k, v in r if k == c]

async def main():
    st = {'seedGets': 0, 'listGets': 0, 'drive': 0, 'tiles': [], 'tilesBlocked': False, 'cur': '', 'posted': [], 'logos': []}
    async def sheet(route):
        req = route.request
        if req.method == 'POST':
            try: b = json.loads(req.post_data or '{}')
            except Exception: b = {}
            if b.get('action') == 'setList' and 'dxfSeed' in b: st['posted'].append(b['dxfSeed']); st['cur'] = b['dxfSeed'] or ''
            if b.get('action') == 'setLogo': st['logos'].append(b)
            return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query)
        if q.get('dxfseed'):
            st['seedGets'] += 1
            if not st['cur']: return await route.fulfill(status=200, content_type='application/json', body='{"ok":false,"error":"no plan template"}')
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': st['cur'], 'name': f'G-eSAA_seed_{st["cur"][:4]}.dxf', 'size': len(SEED), 'text': SEED}))
        st['listGets'] += 1
        out = {'ok': True, 'name': SHEET_MOCK['name'], 'companies': SHEET_MOCK['companies'], 'admins': SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False}
        if st['cur']: out['dxfSeed'] = st['cur']
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    async def drive(route): st['drive'] += 1; await route.fulfill(status=200, body=SEED, headers={'Access-Control-Allow-Origin': '*'})
    async def tiles(route):  # any street map server the app is using (OSM, CARTO: z/x/y.png; Esri: z/y/x)
        u = route.request.url; m = re.search(r'/tile/(\d+)/(\d+)/(\d+)', u)
        if m: z, y, x = map(int, m.groups())
        else:
            m = re.search(r'/(\d+)/(\d+)/(\d+)\.png', u)
            if not m: return await route.abort()
            z, x, y = map(int, m.groups())
        if st['tilesBlocked']: return await route.abort()
        st['tiles'].append((z, x, y))
        await route.fulfill(status=200, body=tile_png(x, y), headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/png'})
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_a', ignore_errors=True)
        ctx, pg, errs, cur, st0, tk = await launch(p, f'{D}/ud_a', S + '/v17/vid/h_cc.mjpeg', project=False, geo={'latitude': POLES[0]['ll'][0], 'longitude': POLES[0]['ll'][1], 'accuracy': 3})
        await ctx.route('https://script.google.com/**', sheet)
        await ctx.route('https://drive.usercontent.google.com/**', drive)
        for u in ('https://tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/**'): await ctx.route(u, tiles)
        await ctx.route('https://overpass-api.de/**', lambda r: r.fulfill(status=200, body=OVP, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}))
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
        await pg.fill('#admWriteKey', 'ADMIN-KEY-TEST')
        await pg.fill('#admDxfSeed', LINK1)
        await pg.click('#admSave'); await after_save(pg)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        # ===== 1. the template comes by itself (website, through the online sheet), no tap
        seed = None
        for _ in range(40):
            seed = await pg.evaluate("__polecam.S.dxfSeed || null")
            if seed: break
            await W(pg, 500)
        await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate("window.__polecam.showExport('doDxf')"); await W(pg, 400)
        c1 = await pg.evaluate("({ mode: document.getElementById('dxfMode').value, info: document.getElementById('dxfTplInfo').textContent, ok: document.getElementById('dxfTplInfo').classList.contains('ok'), get: !document.getElementById('dxfTplGet').hidden, load: document.getElementById('dxfTplLoad').textContent })")
        await pg.screenshot(path=f'{OUT}/a1_card_ready.png')
        check('website: the admin’s plan template arrives by itself through the online sheet (no tap, no Drive request from the browser); the card says it is ready',
              seed and seed['from'] == 'drive' and seed['id'] == ID1 and st['seedGets'] >= 1 and st['drive'] == 0 and c1['mode'] == 'tpl' and c1['info'].startswith('✓ Plan template ready') and c1['ok'] and not c1['get'],
              (seed, {k: st[k] for k in ('seedGets', 'listGets', 'drive', 'posted')}, c1))
        check('the admin phone tells the sheet which template goes with the list (setList carries the Drive id)', ID1 in st['posted'], st['posted'])
        await close_sheets(pg)
        # ===== 2. survey with photos, route, export
        await newproj(pg, 'survey', 'PLAN_32', purpose='As-plan'); await close_sheets(pg)
        for P in POLES:
            await capture(pg, cur, *P['ll']); await pg.fill('#poleId', P['id']); await save(pg)
        await pg.evaluate("""(B) => { const pts = __polecam.points.filter((x) => x.project === 'PLAN_32');
          for (const p of pts) { const b = B[p.poleId]; if (b) p.boq = Object.assign({}, p.boq || {}, b); if (p.poleId === 'PP-0001') { p.status = 'Proposed'; p.poleType = 'Globe'; } } }""", BOQ)
        await close_sheets(pg)
        await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 400); await pg.evaluate('__polecam.capLinks()'); await W(pg, 400); await pg.click('#rbDone'); await W(pg, 600)
        n0 = st['seedGets']; st['tiles'].clear()
        await pg.evaluate("() => { const m = __polecam.S.meta['PLAN_32']; m.siteName = 'SITE A (TEST)'; m.plaId = 'PLA-TEST'; m.serial = 'SN-TEST'; }")
        await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate("window.__polecam.showExport('doDxf')"); await W(pg, 300)
        lb = io.BytesIO(); Image.new('RGB', (900, 300), (20, 70, 160)).save(lb, 'PNG'); open(f'{OUT}/logo_in.png', 'wb').write(lb.getvalue())
        await pg.set_input_files('#dxfLogoFile', f'{OUT}/logo_in.png'); await W(pg, 2500)
        lg = await pg.evaluate("({ info: document.getElementById('dxfLogoInfo').textContent, img: !document.getElementById('dxfLogoImg').hidden, li: __polecam.S.logoInfo })")
        await pg.screenshot(path=f'{OUT}/a2_logo_card.png')
        check('Add company logo: kept on the phone (shown on the DXF card) and sent to the online sheet for the company’s users (made small: ≤ 600 × 220 px, < 34 KB)',
              lg['img'] and '✓' in lg['info'] and lg['li'] and lg['li']['px'] <= 600 and lg['li']['py'] <= 220 and st['logos'] and st['logos'][0]['type'] in ('image/png', 'image/jpeg') and len(st['logos'][0]['data']) < 48000,
              (lg, [(x.get('company'), x.get('type'), len(x.get('data', ''))) for x in st['logos']]))
        await pg.click('#doDxf'); await pg.wait_for_selector('#resultBox:not([hidden])', timeout=180000); await W(pg, 300)
        f = await dl(pg, lambda: pg.click('#resSave'), f'{OUT}/plan_dxf.zip'); await close_sheets(pg)
        z = zipfile.ZipFile(f); names = z.namelist(); dxfn = [n for n in names if n.endswith('.dxf')][0]
        txt = z.read(dxfn).decode('utf-8'); open(f'{OUT}/plan.dxf', 'w', encoding='utf-8', newline='').write(txt); readme = z.read('README.txt').decode()
        jpgs = sorted(n for n in names if n.lower().endswith('.jpg') and not n.startswith('COMPANY_LOGO')); poleJ = [n for n in jpgs if n != 'VICINITY_MAP.jpg']
        for n in jpgs: open(f'{OUT}/{n}', 'wb').write(z.read(n))
        zs = sorted(set(t[0] for t in st['tiles']))
        check('the plan ZIP: the DXF, a photo of each of the 6 poles, the vicinity street map, and a README that says to keep them in one folder',
              len(poleJ) == 6 and 'VICINITY_MAP.jpg' in jpgs and 'UNZIP EVERYTHING INTO ONE FOLDER' in readme and ('Pole photos: 6 of 6' in readme or __import__('re').search(r'Beside the points: their photo \(6 of \d+', readme)) and 'VICINITY_MAP.jpg' in readme and st['seedGets'] == n0,
              (names, readme[:600]))
        check('the vicinity map: at most 64 street tiles, one zoom level ≤ 17', 0 < len(st['tiles']) <= 64 and len(zs) == 1 and zs[0] <= 17, (len(st['tiles']), zs))
        chk = subprocess.run([sys.executable, '-I', APP + '/tools/dxf-seed/check_dxf.py', f'{OUT}/plan.dxf', PRIV + '/template/template.dxf'], capture_output=True, text=True).stdout
        R = recs_of(txt)
        imgs = [r for r in R if r[0][1] == 'IMAGE' and (g(r, '8') or '').startswith('G-ESAA')]; used = set(g(r, '340') for r in imgs)
        files = sorted(g(r, '1') for r in R if r[0][1] == 'IMAGEDEF' and g(r, '5') in used)
        check('the DXF links the 7 pictures by file name (6 pole photos on G-ESAA POLE PHOTO, the map on G-ESAA VICINITY MAP), AutoCAD-ready structure',
              'new problems: 0' in chk and len(imgs) == 7 and files == sorted(jpgs) and sum(g(r, '8') == 'G-ESAA POLE PHOTO' for r in imgs) == 6 and sum(g(r, '8') == 'G-ESAA VICINITY MAP' for r in imgs) == 1,
              (chk.splitlines()[:2], files, [g(r, '8') for r in imgs]))
        Y0 = min(float(g(r, '20')) for r in R if r[0][1] == 'IMAGE' and g(r, '8') == 'G-ESAA POLE PHOTO') - 300  # v2.36: the template's tables now sit below the plan (UTM too)
        ours = lambda r: float(g(r, '10') or 0) > 100000 and float(g(r, '20') or 0) > Y0
        cab = [r for r in R if r[0][1] == 'LWPOLYLINE' and g(r, '8') == 'PROPOSED FOC AERIAL 6 CORE' and ours(r)]  # ours (UTM), not the template's sample
        check('the aerial cable: a broken line (DASHED, linetype scale 7, continuous over the vertices), red (new)',
              cab and all(g(r, '6') == 'DASHED' and float(g(r, '48') or 0) == 7.0 and g(r, '62').strip() == '1' and int(g(r, '70')) & 128 for r in cab), [(g(r, '6'), g(r, '48'), g(r, '62'), g(r, '70')) for r in cab])
        # v2.34: the logo in the title block (PAGING, every sheet), the site details, one size of a kind, no photo lines, street names
        brp = {g(r, '2'): g(r, '5') for r in R if r[0][1] == 'BLOCK_RECORD'}
        lgimg = [r for r in R if r[0][1] == 'IMAGE' and g(r, '330') == brp.get('PAGING')]
        lgdef = [g(r, '1') for r in R if r[0][1] == 'IMAGEDEF' and lgimg and g(r, '5') == g(lgimg[0], '340')]
        logoZ = [n for n in names if n.startswith('COMPANY_LOGO.')]
        check('the company logo in the title block of every sheet (an image in the PAGING block, the file next to the DXF)', len(lgimg) == 1 and lgdef and logoZ and lgdef[0] == logoZ[0], (len(lgimg), lgdef, logoZ))
        tbr = [ga(r, '330')[-1] for r in R if r[0][1] == 'LAYOUT' and ga(r, '1') and ga(r, '1')[-1] == 'TITLE']
        tlimg = [r for r in R if r[0][1] == 'IMAGE' and tbr and g(r, '330') == tbr[0]]
        check('the company logo on the title sheet too (top right, the same picture), in place of the company name',
              len(tlimg) == 1 and lgimg and g(tlimg[0], '340') == g(lgimg[0], '340'), (tbr, len(tlimg)))
        check('title blocks: SITENAME_PLAID and the serial number; the title sheet: site name, PLA ID and serial number on three lines, and AFI PLAN (As-Plan)',
              'SITE A (TEST)_PLA-TEST' in txt and 'SN-TEST' in txt and 'SITE A (TEST)\\PPLA-TEST\\PSN-TEST' in txt and '(SITE A' not in txt and 'AFI PLAN' in txt, [x for x in ('SITE A (TEST)_PLA-TEST', 'SN-TEST', 'SITE A (TEST)\\PPLA-TEST\\PSN-TEST') if x not in txt])
        spanH = sorted(set(round(float(g(r, '40')), 3) for r in R if r[0][1] == 'TEXT' and g(r, '8') == 'Distance Data' and ours(r)))
        photoW = sorted(set(round(float(g(r, '11')) * float(g(r, '13')), 2) for r in R if r[0][1] == 'IMAGE' and g(r, '8') == 'G-ESAA POLE PHOTO'))
        leaders = [r for r in R if r[0][1] == 'LWPOLYLINE' and g(r, '8') == 'G-ESAA POLE PHOTO' and len(ga(r, '10')) == 2]
        tagH = sorted(set(round(float(g(r, '40')), 3) for r in R if r[0][1] == 'TEXT' and g(r, '1') in ('0282310', 'XX30643', 'X4X0652', '0430621', 'NPT') and ours(r)))
        check('one size of a kind: every span length, every photo and every pole ID the same size; no line from a photo to its pole',
              len(spanH) == 1 and len(photoW) == 1 and len(tagH) == 1 and not leaders, (spanH, photoW, tagH, len(leaders)))
        streets = set(g(r, '1') for r in R if r[0][1] == 'TEXT' and g(r, '8') == 'STREET NAME')
        check('the roads along the route are named on the sheet (OpenStreetMap names)', streets and any(n in streets for n in ('WATUSI STREET', 'SAN GABRIEL STREET')), sorted(streets)[:20])
        def dseg(p, a, b):
            dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy; t = 0 if not L else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])
        cv = [list(zip(map(float, ga(r, '10')), map(float, ga(r, '20')))) for r in cab]
        dps = []
        for i, r in enumerate(R):
            if r[0][1] == 'INSERT' and g(r, '2') in ('P-POLE', 'existing electric pole') and i + 1 < len(R) and R[i + 1][0][1] == 'ATTRIB' and ours(R[i + 1]):
                vals = []; j = i + 1
                while R[j][0][1] == 'ATTRIB': vals.append(g(R[j], '1') or ''); j += 1
                dps.append((vals, (float(g(R[i + 1], '10')), float(g(R[i + 1], '20')))))
        gaps = [(v, round(min(dseg(p, a, b) for c in cv for a, b in zip(c, c[1:])), 1)) for v, p in dps]
        noarm = [d for v, d in gaps if not any(x in ('XX30643', 'X4X0652') for x in v)]  # those two have an arm in the test
        check('the cable close to each pole without an arm (v2.39: as the company plans, the pole 2.5 m outside the road edge and the cable 1.4 m inside it: about 4 m)', noarm and max(noarm) < 5.5 and min(noarm) > 1.5 and sum(1 for d in noarm if 3.5 <= d <= 4.5) >= 2, gaps)  # a pole kept at its pin or off the roads: the cable close by
        vroute = [r for r in R if r[0][1] == 'LWPOLYLINE' and g(r, '8') == 'G-ESAA VICINITY' and (g(r, '62') or '').strip() != '255' and not (len(ga(r, '10')) == 2 and g(r, '42')) and (g(r, '70') or '').strip() not in ('1', '129')]  # v2.36: the route, not its white band, the pole dots or the area circle; v2.37: nor the label's frame (closed)
        check('vicinity: the route a broken line, no PROPOSED FIBER ROUTE label', vroute and all(g(r, '6') == 'DASHED' for r in vroute) and 'PROPOSED FIBER ROUTE' not in txt, [(g(r, '6'), g(r, '43')) for r in vroute])
        # the labels: values in hidden attributes, the visible text all in one direction per pole
        ins = [i for i, r in enumerate(R) if r[0][1] == 'INSERT' and g(r, '2') in ('P-POLE', 'existing electric pole') and i + 1 < len(R) and R[i + 1][0][1] == 'ATTRIB' and ours(R[i + 1])]  # an insert's base point may lie far from its symbol: its attribute shows where it is
        hid = []
        for i in ins:
            j = i + 1
            while j < len(R) and R[j][0][1] == 'ATTRIB': hid.append(int(g(R[j], '70') or 0) & 1); j += 1
        texts = [r for r in R if r[0][1] == 'TEXT' and g(r, '1') in ('0282310', 'XX30643', 'X4X0652', '0430621', 'PROP.POLE', 'NPT') and ours(r)]
        prefixed = [g(r, '1') for r in R if r[0][1] == 'TEXT' and re.match(r'^CC-', g(r, '1') or '')]
        lls = [r for r in R if r[0][1] == 'MTEXT' and g(r, '8') == 'LATLONG' and ours(r)]
        stack = []
        for t in texts:
            if g(t, '1') == 'PROP.POLE': continue
            tx, ty = float(g(t, '11') or g(t, '10')), float(g(t, '21') or g(t, '20')); rot = float(g(t, '50') or 0)
            m = min(lls, key=lambda r: math.hypot(float(g(r, '10')) - tx, float(g(r, '20')) - ty))
            ang = math.degrees(math.atan2(float(g(m, '21')), float(g(m, '11')))) % 360
            stack.append((g(t, '1'), round(math.hypot(float(g(m, '10')) - tx, float(g(m, '20')) - ty), 1), round(abs((ang - rot + 180) % 360 - 180), 1)))
        check('pole labels as your example: CC / 0282310 (no CC- before the tag) / latitude / longitude, the coordinates right under the tag in the same direction; attributes hidden',
              len(ins) == 6 and hid and all(hid) and len(texts) >= 5 and not prefixed and stack and all(d < 6 and a < 1 for _, d, a in stack), (len(ins), [g(r, '1') for r in texts], prefixed, stack))
        # the vicinity viewport: only the map and the route; the GEO sheet: no vicinity layers
        lay = {g(r, '5'): g(r, '2') for r in R if r[0][1] == 'LAYER'}
        lays = {g(r, '5'): g(r, '1') for r in R if r[0][1] == 'LAYOUT'}
        vps = {}
        for r in R:
            if r[0][1] == 'VIEWPORT': vps.setdefault(g(r, '330'), []).append([lay.get(h) for h in (ga(r, '331') + ga(r, '341'))])
        brl = {}  # block record handle -> layout name
        for r in R:
            pass
        def frozen(name):
            for r in R:
                if r[0][1] == 'LAYOUT' and ga(r, '1')[-1] == name:
                    br = [v for k, v in r if k == '330'][-1]
                    return max(vps.get(br, [[]]), key=len)
            return None
        fv, fg = frozen('VICINITY MAP') or [], frozen('GEO') or []
        vx = [float(v) for r in R if r[0][1] == 'IMAGE' and g(r, '8') == 'G-ESAA VICINITY MAP' for k, v in r if k == '10']
        cabx = [float(v) for r in cab for k, v in r if k == '10']
        check('in model space the vicinity map lies beside the plan (east of the route, not over it)', vx and cabx and vx[0] > max(cabx) + 200, (vx, cabx and max(cabx)))
        check('VICINITY MAP shows only the street map and the route (the drawing’s other layers frozen there); GEO and KEYMAP do not show them',
              'ROAD PAVEMENT' in fv and 'PROPOSED FOC AERIAL 6 CORE' in fv and 'G-ESAA VICINITY' not in fv and 'G-ESAA VICINITY MAP' not in fv and 'G-ESAA VICINITY' in fg and 'G-ESAA VICINITY MAP' in fg and 'ROAD PAVEMENT' not in fg,
              (sorted(x for x in fv if x)[:12], fg))
        # the map picture lies where it should: sample the picture against the tiles (each tile one colour)
        vic = await pg.evaluate("""async () => {
          const C = window.PoleCore, pts = __polecam.points.filter((x) => x.project === 'PLAN_32'), U = pts.map((p) => C.utmForward(p.lat, p.lon, 51, false));
          const xs = U.map((u) => u.E), ys = U.map((u) => u.N), size = Math.max(1500, 3 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
          const cE = (Math.max(...xs) + Math.min(...xs)) / 2, cN = (Math.max(...ys) + Math.min(...ys)) / 2;
          const v = await __polecam.vicinityJpeg(cE, cN, size, 51, false); if (!v) return null;
          const bm = await createImageBitmap(new Blob([v.jpg], { type: 'image/jpeg' })), cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
          const g = cv.getContext('2d'); g.drawImage(bm, 0, 0); const n = 256 * 2 ** v.z, out = [];
          for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
            const px = i / 12 * v.px, py = j / 12 * v.py, E = cE - size / 2 + px / v.px * size, N = cN + size / 2 - py / v.py * size;
            const [la, lo] = C.utmInverse(E, N, 51, false), s = Math.sin(la * Math.PI / 180), mx = (lo + 180) / 360 * n, my = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
            const fx = mx % 256, fy = my % 256; if (fx < 6 || fx > 250 || fy < 6 || fy > 250) continue;
            const d = g.getImageData(Math.round(px), Math.round(py), 1, 1).data; out.push({ tx: Math.floor(mx / 256), ty: Math.floor(my / 256), rgb: [d[0], d[1], d[2]] });
          }
          return { z: v.z, px: v.px, n: out.length, out };
        }""")
        good = sum(1 for o in (vic or {}).get('out', []) if all(abs(a - b) <= 24 for a, b in zip(o['rgb'], tile_rgb(o['tx'], o['ty'])))) if vic else 0
        check('the vicinity picture is placed on the UTM grid: sampled points show the tile they belong to (≥ 95 %)', vic and vic['n'] > 60 and good >= 0.95 * vic['n'], (vic and {'z': vic['z'], 'n': vic['n'], 'good': good}))
        # ===== 3. no internet for the map: the tiles this phone already has make the picture; none at all: the roads instead
        st['tilesBlocked'] = True; st['tiles'].clear()
        await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate("window.__polecam.showExport('doDxf')"); await W(pg, 300)
        await pg.click('#doDxf'); await pg.wait_for_selector('#resultBox:not([hidden])', timeout=180000); await W(pg, 300)
        f2 = await dl(pg, lambda: pg.click('#resSave'), f'{OUT}/plan_dxf_cached.zip'); await close_sheets(pg)
        n2 = zipfile.ZipFile(f2).namelist()
        await pg.evaluate("() => new Promise((res) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { try { const t = r.result.transaction('tiles', 'readwrite'); t.objectStore('tiles').clear(); t.oncomplete = () => res(1); t.onerror = () => res(0); } catch (e) { res(0); } }; r.onerror = () => res(0); })")
        src0 = await pg.evaluate("__polecam.S.streetSrc || 'auto'")
        await pg.evaluate("() => { __polecam.S.meta['PLAN_32'].purpose = 'As-built'; }")
        await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate("window.__polecam.showExport('doDxf')"); await W(pg, 300)
        await pg.click('#doDxf'); await pg.wait_for_selector('#resultBox:not([hidden])', timeout=180000); await W(pg, 300)
        f3 = await dl(pg, lambda: pg.click('#resSave'), f'{OUT}/plan_dxf_nomap.zip'); await close_sheets(pg)
        z3 = zipfile.ZipFile(f3); n3 = z3.namelist(); r3 = z3.read('README.txt').decode(); t3 = z3.read([n for n in n3 if n.endswith('.dxf')][0]).decode('utf-8')
        R3 = recs_of(t3)
        check('map server unreachable: the tiles already on this phone still make the vicinity picture', 'VICINITY_MAP.jpg' in n2, n2)
        if 'VICINITY_MAP.jpg' in n3: open(f'{OUT}/vicinity_drawn.jpg', 'wb').write(z3.read('VICINITY_MAP.jpg'))
        vim = Image.open(io.BytesIO(z3.read('VICINITY_MAP.jpg'))) if 'VICINITY_MAP.jpg' in n3 else None
        check('no map tiles at all: the vicinity street map is drawn from the OpenStreetMap roads (README says so), the plan is made',
              vim is not None and vim.size == (1800, 1800) and 'drawn from the OpenStreetMap roads' in r3 and sum(1 for r in R3 if r[0][1] == 'IMAGE' and (g(r, '8') or '').startswith('G-ESAA')) == 7, (n3, r3[:400]))
        check('As-Built: the title sheet says AS-BUILT PLAN', 'AS-BUILT PLAN' in t3, '')
        # ===== 4. the admin shares a newer template: it replaces the old one by itself
        await pg.click('#settingsBtn'); await W(pg, 400); await pg.click('#teamManage'); await W(pg, 300)
        if await pg.locator('#admPin').is_visible(): await pg.fill('#admPin', '1234'); await pg.click('#admUnlock'); await W(pg, 900)
        st['posted'].clear(); n4 = st['seedGets']
        await pg.fill('#admDxfSeed', LINK2); await pg.click('#admSave'); await after_save(pg); ok_save = True
        seed2 = None
        for _ in range(40):
            seed2 = await pg.evaluate("__polecam.S.dxfSeed || null")
            if seed2 and seed2['id'] == ID2: break
            await W(pg, 500)
        check('the admin shares a newer template: phones replace theirs by themselves (through the sheet)', ok_save and seed2 and seed2['id'] == ID2 and st['seedGets'] > n4 and st['drive'] == 0, (ok_save, seed2, st['posted'], st['seedGets'], n4))
        await close_sheets(pg)
        badp = [e for e in errs if 'PAGEERROR' in e or 'TypeError' in e or 'ReferenceError' in e]
        check('no page errors', not badp, badp[:5])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} checks passed')
asyncio.run(main())
