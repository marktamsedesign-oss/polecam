"""v2.42.24 copy: the spans linked in capture order by the test hook (the route screen's button now makes cables). v2.42.21 copy: Route opens with Route tools and linking by pairs (the route card as before v2.42.21).
v2.35.6 (from t235a): landmark icons as AutoCAD blocks. v2.35: road packs (tools/osm-pack) — the plan drawing takes its roads, landmarks, cities / municipalities and barangays from a
road pack on the phone, with no internet (OpenStreetMap / Overpass blocked); the admin pastes packs.txt (# lines skipped, more
than 30 packs); a road pack is imported like a map pack but is not a map (no Use / Show, the offline map unchanged); the ROW
AREA COVERAGE table is filled (the real Davao Region pack: Davao City; a synthetic pack with a PSA-like barangay file: the
barangays, a long name made smaller to stay on one line); the vicinity route is 3 x wider; the title sheet has the logo."""
import asyncio, sys, os, shutil, json, zipfile, re, io, urllib.parse, math, glob
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, skipscan, sheet_companies, SHEET_MOCK
from playwright.async_api import async_playwright
D = S + '/v235'; OUT = S + '/v2356/out_b'; os.makedirs(OUT, exist_ok=True)
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
POLES = json.load(open(PRIV + '/fx/poles_user.json'))
REAL = PRIV + '/roads_v235/G-eSAA roads - Davao Region - 2026-08-19.roadpack'
MAPPACK = S + '/fixtures/maps/davao_watusi_test.pmtiles'
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
    for r in R:
        if r[0][1] == 'MTEXT' and g(r, '8') == 'POST LABLE' and 14500 < float(g(r, '10') or 0) < 15200 and 16500 < float(g(r, '20') or 0) < 16700:
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
        shutil.rmtree(f'{S}/v2356/ud_b', ignore_errors=True)
        ctx, pg, errs, cur, st0, tk = await launch(p, f'{S}/v2356/ud_b', S + '/v17/vid/h_cc.mjpeg', project=False, geo={'latitude': POLES[0]['ll'][0], 'longitude': POLES[0]['ll'][1], 'accuracy': 3})
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

        # ===== 2. a plan with the road pack: its landmarks (Geofabrik classes) with their icons as blocks
        await import_pack(pg, REAL); await close_sheets(pg)
        await newproj(pg, 'survey', 'PLAN_36', purpose='As-plan'); await close_sheets(pg)
        for P in POLES:
            await capture(pg, cur, *P['ll']); await pg.fill('#poleId', P['id']); await save(pg)
        await close_sheets(pg)
        await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 400); await pg.evaluate('__polecam.capLinks()'); await W(pg, 400); await pg.click('#rbDone'); await W(pg, 600)
        txt, readme, names = await export(pg, 'plan_icons_roadpack')
        open(OUT + '/plan_icons_roadpack.readme.txt', 'w').write(readme)
        res = analyse(txt, 'roadpack')
        lmln = [l for l in readme.splitlines() if 'Building and place names' in l]
        check('road pack: the landmarks get their icon as an AutoCAD block (GESAA_LM_…, solid hatches in their colours) inserted on layer G-ESAA LANDMARK, the name beside it; the README says so',
              res['inserts'] >= 3 and res['blocks'] >= 2 and res['hatches'] >= res['blocks'] and not res['problems'] and lmln and 'with their icon' in lmln[0], (res, lmln))
        # ===== 3. the same with the map pack only (no road pack): the map pack's places, religions included
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 1200)
        await pg.locator('#packList .area-card:has-text("Davao") button:has-text("Delete")').click(); await W(pg, 300)
        await pg.locator('#packList .area-card:has-text("Davao") button:has-text("Confirm")').click(); await W(pg, 1500)
        await close_sheets(pg)
        await import_pack(pg, MAPPACK); await close_sheets(pg)
        txt2, readme2, _ = await export(pg, 'plan_icons_mappack')
        res2 = analyse(txt2, 'mappack')
        check('map pack only: landmarks from the pack with their icons as blocks (each icon block made once, used by its inserts)',
              res2['inserts'] >= 3 and res2['blocks'] >= 2 and not res2['problems'] and 'offline map' in [l for l in readme2.splitlines() if l.startswith('Roads:')][0], res2)
        check('no JS errors', not [e for e in errs if 'favicon' not in e], errs[:5])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} checks passed')

def analyse(txt, tag):
    """The DXF's landmark icons: blocks, hatches, inserts; structural checks; and a picture of the icons as placed (with their names)."""
    R = recs_of(txt); problems = []
    hs = [g(r, '5') for r in R if g(r, '5')]
    if len(hs) != len(set(hs)): problems.append('duplicate handles %d' % (len(hs) - len(set(hs))))
    brs = {g(r, '2'): g(r, '5') for r in R if r[0][1] == 'BLOCK_RECORD'}
    blocks = {}; cur = None
    for r in R:
        t = r[0][1]
        if t == 'BLOCK': cur = g(r, '2'); blocks[cur] = []
        elif t == 'ENDBLK': cur = None
        elif cur is not None: blocks[cur].append(r)
    lm = {k: v for k, v in blocks.items() if k.startswith('GESAA_LM_')}
    nh = 0
    for k, ents in lm.items():
        if k not in brs: problems.append('no block record ' + k)
        for e in ents:
            if e[0][1] != 'HATCH': problems.append('not a hatch in ' + k); continue
            nh += 1
            if g(e, '330') != brs.get(k): problems.append('owner ' + k)
            codes = [c for c, v in e]; n91 = int(g(e, '91'))
            if codes.count('92') != n91 or codes.count('97') != n91: problems.append('loops ' + k)
            # each loop: 93 = its vertex count
            i = 0; vals = e
            for j, (c, v) in enumerate(vals):
                if c == '93':
                    m = int(v); xs = [vv for cc, vv in vals[j + 1:j + 1 + 2 * m] if cc == '10']
                    if len(xs) != m: problems.append('vertices ' + k)
            if not g(e, '420'): problems.append('no true colour ' + k)
    tbl = [r for r in R if r[0][1] == 'TABLE' and g(r, '2') == 'BLOCK_RECORD']
    if tbl and len(brs) != int(g(tbl[0], '70')): problems.append('block table count %s for %d records (v2.42.8: the cleanup sets each table count to its records)' % (g(tbl[0], '70'), len(brs)))
    ins = [r for r in R if r[0][1] == 'INSERT' and (g(r, '2') or '').startswith('GESAA_LM_')]
    for r in ins:
        if g(r, '2') not in lm: problems.append('insert of a missing block')
        if g(r, '8') != 'G-ESAA LANDMARK': problems.append('layer ' + str(g(r, '8')))
    lay = [r for r in R if r[0][1] == 'LAYER' and g(r, '2') == 'G-ESAA LANDMARK']
    if ins and not lay: problems.append('no layer G-ESAA LANDMARK')
    # a picture: each icon as placed (its hatches, odd-even) with the nearest name
    try:
        import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
        from matplotlib.path import Path as MP; from matplotlib.patches import PathPatch
        names = [(float(g(r, '10')), float(g(r, '20')), (''.join(ga(r, '3')) + (g(r, '1') or '')).replace('\\P', ' ')) for r in R if r[0][1] == 'MTEXT' and g(r, '8') in ('House Number', 'MISC')]
        k = min(9, len(ins)); fig, axs = plt.subplots(3, 3, figsize=(9, 9))
        for a, r in zip(axs.flat, ins[:k]):
            x0, y0, sc = float(g(r, '10')), float(g(r, '20')), float(g(r, '41'))
            for e in lm[g(r, '2')]:
                verts = []; codes = []; vals = e
                for j, (c, v) in enumerate(vals):
                    if c == '93':
                        m = int(v); xy = [float(vv) for cc, vv in vals[j + 1:j + 1 + 2 * m]]
                        pts = list(zip(xy[0::2], xy[1::2]))
                        verts += [(x0 + px * sc, y0 + py * sc) for px, py in pts] + [(0, 0)]; codes += [MP.MOVETO] + [MP.LINETO] * (len(pts) - 1) + [MP.CLOSEPOLY]
                rgb = int(g(e, '420')); a.add_patch(PathPatch(MP(verts, codes), facecolor='#%06x' % rgb, edgecolor='none'))
            nm = min(names, key=lambda t: (t[0] - x0) ** 2 + (t[1] - y0) ** 2) if names else None
            a.set_xlim(x0 - 6, x0 + 18); a.set_ylim(y0 - 9, y0 + 9); a.set_aspect('equal'); a.set_title((g(r, '2')[9:] + '\n' + (nm[2][:28] if nm else '')), fontsize=8)
            if nm: a.text(nm[0], nm[1], nm[2][:24], fontsize=6, va='center')
        for a in axs.flat: a.set_xticks([]); a.set_yticks([])
        fig.tight_layout(); fig.savefig(f'{OUT}/icons_{tag}.png', dpi=110); plt.close(fig)
    except Exception as e: problems.append('picture: %s' % e)
    return {'blocks': len(lm), 'hatches': nh, 'inserts': len(ins), 'kinds': sorted(set(g(r, '2')[9:] for r in ins))[:14], 'problems': problems[:8]}

asyncio.run(main())
