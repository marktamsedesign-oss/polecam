"""v2.37.0 (the design review, rounds 1 and 2), in the app:
 1. the pin menu offers Tower, OLT and ODC only; a pin being placed shows its model; the map shows a tower / OLT / ODC as its model;
 2. the record: no Save inside the photo box, the legend symbol beside the photo; the project's other points (and route) on its map;
    the new settings: NAP kind (NAP pin), double LCP (ODC), grounding and riser (pole), the pole a pole-to-pole guy goes to;
    manhole and service box records; editing a record keeps its sizes (BOQ) and a site's kind;
 3. the plan DXF has them (inline blocks, pole-to-pole guy, grounding, riser, double LCP, the OLT after the site is changed to OLT);
    the vicinity picture grey and darker outside the PROJECT AREA circle;
 4. the route check: a dummy NAP recommended before 2 km of 12C; a dummy NAP on a 72C cable flagged;
 5. the other exports still work; no page errors."""
import asyncio, sys, os, shutil, json, zipfile, io, urllib.parse, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
from common import launch, newproj, skipscan, sheet_companies, SHEET_MOCK
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
import ezdxf
from ezdxf import bbox
OUT = S + '/v24218/tests/out_237v18'; os.makedirs(OUT, exist_ok=True)
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
POLES = json.load(open(PRIV + '/fx/poles_user.json'))
MAPPACK = S + '/fixtures/maps/davao_watusi_test.pmtiles'
ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'; LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900], flush=True)
async def W(pg, ms): await pg.wait_for_timeout(ms)
def img_bytes(color, fmt, road=False):
    im = Image.new('RGB', (256, 256), color)
    if road: ImageDraw.Draw(im).line([(0, 128), (256, 128)], fill=(255, 255, 255), width=10)
    b = io.BytesIO(); im.save(b, fmt); return b.getvalue()
STREET = img_bytes((236, 229, 210), 'PNG', True); SAT = img_bytes((40, 90, 40), 'JPEG')
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
async def run_export(pg, sel, name):
    await close_sheets(pg)
    await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate(f"window.__polecam.showExport('{sel}')"); await W(pg, 300)
    await pg.click('#' + sel); await pg.wait_for_selector('#resultBox:not([hidden]), #askBox:not([hidden])', timeout=180000); await W(pg, 300)
    if await pg.locator('#askBox:not([hidden])').count():
        t = await pg.text_content('#askBox'); await pg.locator('#askBox button').first.click(); await W(pg, 300); await close_sheets(pg); raise Exception('asked: ' + t[:300])
    f = await dl(pg, lambda: pg.click('#resSave'), f'{OUT}/{name}'); await close_sheets(pg); return f
def recs_of(txt):
    L = txt.splitlines(); P = [(L[i].strip(), L[i + 1]) for i in range(0, len(L) - 1, 2)]; recs = []; cur = None
    for c, v in P:
        if c == '0': cur = [(c, v)]; recs.append(cur)
        elif cur is not None: cur.append((c, v))
    return recs
g = lambda r, c: next((v for k, v in r if k == c), None)
ga = lambda r, c: [v for k, v in r if k == c]
def utm51(lat, lon):  # WGS84 UTM zone 51N (as core.js)
    a = 6378137.0; f = 1 / 298.257223563; k0 = 0.9996; e2 = f * (2 - f); ep2 = e2 / (1 - e2); lon0 = math.radians(123)
    phi = math.radians(lat); lam = math.radians(lon); N = a / math.sqrt(1 - e2 * math.sin(phi) ** 2); T = math.tan(phi) ** 2; Cc = ep2 * math.cos(phi) ** 2; A = math.cos(phi) * (lam - lon0)
    e4 = e2 * e2; e6 = e4 * e2
    M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi) + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi) - (35 * e6 / 3072) * math.sin(6 * phi))
    E = 500000 + k0 * N * (A + (1 - T + Cc) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * Cc - 58 * ep2) * A ** 5 / 120)
    Nn = k0 * (M + N * math.tan(phi) * (A * A / 2 + (5 - T + 9 * Cc + 4 * Cc * Cc) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * Cc - 330 * ep2) * A ** 6 / 720))
    return E, Nn
async def add_pin(pg, choice, lat, lon, name=None, status=None, color=None, closure=None):
    await close_sheets(pg)
    await pg.click('#pinAddBtn'); await W(pg, 300)
    await pg.locator('#askBox button', has_text=choice).click(); await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 900)
    info = await pg.evaluate("""() => ({ title: document.getElementById('editorTitle').textContent, thumb: !document.getElementById('edPhoto').closest('.thumbwrap').hidden,
      retake: document.getElementById('edRetake').textContent, colors: !document.getElementById('svColorBox').hidden, id: document.getElementById('poleId').value, status: document.getElementById('svStatus').value })""")
    if status: await pg.select_option('#svStatus', status); await W(pg, 200)
    if name: await pg.fill('#poleId', name)
    if color: await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#svColors'); await pg.click(f'#svColors .sw[data-c="{color}"]'); await W(pg, 150)
    if closure:
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#svClosureBox'); 
        if not await pg.is_checked('#svCloOn'): await pg.click('#svCloOn'); await W(pg, 150)
        await pg.fill('#svClosureId', closure)
    await pg.evaluate(f"__polecam.pinMap.setView([{lat}, {lon}], 19, {{ animate: false }})"); await W(pg, 500)
    await save(pg)
    return info
def canvas_share(png, color, tol=40, box=None):
    im = Image.open(io.BytesIO(png)).convert('RGB')
    if box: im = im.crop(box)
    px = list(im.getdata()); n = sum(1 for p in px if all(abs(p[i] - color[i]) <= tol for i in range(3)))
    return round(n / len(px), 3)


async def boq_chip(pg, k, text):
    await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", f'#editor .chips[data-k="{k}"]'); await pg.locator(f'#editor .chips[data-k="{k}"] button', has_text=text).first.click(); await W(pg, 200)
async def main():
    async def sheet(route):
        req = route.request
        if req.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query)
        if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
        out = {'ok': True, 'name': SHEET_MOCK['name'], 'companies': SHEET_MOCK['companies'], 'admins': SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    tiles = {'street': 0, 'sat': 0}
    async def street(route): tiles['street'] += 1; await route.fulfill(status=200, content_type='image/png', body=STREET, headers={'Access-Control-Allow-Origin': '*'})
    async def sat(route): tiles['sat'] += 1; await route.fulfill(status=200, content_type='image/jpeg', body=SAT, headers={'Access-Control-Allow-Origin': '*'})
    async with async_playwright() as p:
        shutil.rmtree(f'{S}/v237/ud_a', ignore_errors=True)
        ctx, pg, errs, cur, st0, tk = await launch(p, f'{S}/v237/ud_a', S + '/v17/vid/h_cc.mjpeg', project=False, geo={'latitude': POLES[0]['ll'][0], 'longitude': POLES[0]['ll'][1], 'accuracy': 3})
        await ctx.route('https://script.google.com/**', sheet)
        await ctx.route('https://overpass-api.de/**', lambda r: r.fulfill(status=504, body='timeout'))
        for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**'): await ctx.route(u, street)
        await ctx.route('https://server.arcgisonline.com/**', sat)
        await ctx.route('**/World_Street_Map/**', street)
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
        await pg.fill('#admWriteKey', 'ADMIN-KEY-TEST'); await pg.fill('#admDxfSeed', LINK1)
        await pg.click('#admSave'); await after_save(pg)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 1200)
        await pg.set_input_files('#packFileInput', MAPPACK); await W(pg, 2500)
        for _ in range(40):
            if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): break
            await W(pg, 500)
        await close_sheets(pg)
        await newproj(pg, 'survey', 'PLAN_237', purpose='As-plan'); await close_sheets(pg)
        # ===== 2. the poles, by camera, with the new settings
        ids = {}
        ed_info = None
        for i, P in enumerate(POLES[:5]):
            await capture(pg, cur, *P['ll']); await pg.fill('#poleId', P['id'])
            if i == 0:
                ed_info = await pg.evaluate("""() => ({ saveTop: !!document.getElementById('edSaveTop'), sym: !document.getElementById('edSym').hidden && !!document.querySelector('#edSym svg'), cap: document.getElementById('edSymCap').textContent,
                  cross: !document.getElementById('crossSym').hidden, others: document.querySelectorAll('.leaflet-tooltip.oth').length })""")
                await boq_chip(pg, 'mloop', '15 m') # v2.42.18: the loop's length chips
            if i == 1:
                await boq_chip(pg, 'guy', 'Pole-to-pole guy')
                opts = await pg.evaluate("[...document.querySelectorAll('.boqsel[data-k=\"p2p\"] option')].map((o) => [o.value, o.textContent])")
                tgt = next((v for v, t in opts if t.startswith(POLES[0]['id'] + ' ')), None)
                if tgt: await pg.select_option('.boqsel[data-k="p2p"]', tgt); await W(pg, 200)
                ids['p2p_opts'] = opts
            if i == 3: await boq_chip(pg, 'ground', 'Grounding')
            if i == 4: await boq_chip(pg, 'riser', 'Riser')
            if i == 2:
                ed_info2 = await pg.evaluate("document.querySelectorAll('.leaflet-tooltip.oth').length")
            await save(pg)
        recs = await pg.evaluate("__polecam.points.filter((x) => x.project === 'PLAN_237').map((p) => ({ id: p.id, poleId: p.poleId, boq: p.boq || {} }))")
        byp = {r['poleId']: r for r in recs}
        check('2a. the record: no Save inside the photo box; the legend symbol beside the photo ("Existing electric pole"); no model on the pin for a pole',
              not ed_info['saveTop'] and ed_info['sym'] and ed_info['cap'] == 'Existing electric pole' and not ed_info['cross'], ed_info)
        check('2b. the record\'s map shows the project\'s other points as a guide (named, not tappable)', ed_info2 >= 2, ed_info2)
        b1 = byp[POLES[1]['id']]['boq']
        check('2c. pole settings saved: loop, grounding, riser; the pole-to-pole guy and the pole it goes to (chosen from the nearest poles)',
              byp[POLES[0]['id']]['boq'].get('mloop') == 'Yes' and byp[POLES[3]['id']]['boq'].get('ground') == 'Yes' and byp[POLES[4]['id']]['boq'].get('riser') == 'Yes'
              and 'Pole-to-pole guy' in b1.get('guy', '') and b1.get('p2p') == byp[POLES[0]['id']]['id'], ([r['boq'] for r in recs], ids.get('p2p_opts', [])[:4]))
        # editing a pole keeps its sizes (BOQ)
        await pg.evaluate(f"__polecam.map.setView([{POLES[1]['ll'][0]}, {POLES[1]['ll'][1]}], 19, {{ animate: false }})"); await W(pg, 600)
        await pg.locator('.leaflet-tooltip.pole-label', has_text=POLES[1]['id']).first.click(force=True); await W(pg, 300)
        if not await pg.locator('#editor:not([hidden])').count():
            await pg.evaluate("(n) => { const m = Object.values(__polecam.map._layers).find((l) => l.getTooltip && l.getTooltip() && l.getTooltip().getContent().startsWith(n)); if (m) m.fire('click'); }", POLES[1]['id'])
        await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 900)
        shown = await pg.evaluate("[...document.querySelectorAll('#editor .chip[aria-pressed=\"true\"]')].map((c) => c.textContent).concat([...document.querySelectorAll('#editor .boqsel')].map((s) => s.dataset.k + '=' + s.value))")
        await save(pg)
        b1b = (await pg.evaluate(f"__polecam.points.find((x) => x.poleId === '{POLES[1]['id']}').boq || {{}}"))
        check('2d. editing a record shows its sizes and keeps them when saved (they were lost before)', 'Pole-to-pole guy' in shown and b1b.get('p2p') == b1.get('p2p') and b1b.get('guy') == b1.get('guy'), (shown, b1b))
        # the proposed pole, placed by hand inside the property
        p0 = POLES[0]['ll']; dN, dE = 31 * math.cos(math.radians(43.6)), 31 * math.sin(math.radians(43.6))
        PPLL = (p0[0] + dN / 110574, p0[1] + dE / (111320 * math.cos(math.radians(p0[0]))))
        await capture(pg, cur, *p0); await pg.select_option('#svStatus', 'Proposed'); await W(pg, 300)
        cap_pp = await pg.text_content('#edSymCap')
        await pg.evaluate(f"__polecam.pinMap.setView([{PPLL[0]}, {PPLL[1]}], 19, {{ animate: false }})"); await W(pg, 500); await save(pg)
        # ===== 1. pins on the map: Tower / OLT / ODC only
        await close_sheets(pg); await pg.click('#pinAddBtn'); await W(pg, 300)
        menu = await pg.evaluate("[...document.querySelectorAll('#askBox button')].map((b) => b.textContent.trim())")
        await pg.locator('#askBox button', has_text='Cancel').click(); await W(pg, 300)
        last = POLES[4]['ll']; SITELL = (last[0] - 18 / 110574, last[1] - 6 / 110000)
        await close_sheets(pg); await pg.click('#pinAddBtn'); await W(pg, 300)
        await pg.locator('#askBox button', has_text='Tower (site)').click(); await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 900)
        await pg.select_option('#svStatus', 'Existing'); await W(pg, 200)
        tw = await pg.evaluate("""() => ({ title: document.getElementById('editorTitle').textContent, cross: !document.getElementById('crossSym').hidden && !!document.querySelector('#crossSym svg'), kind: document.getElementById('siteKindSel').value,
          kindShown: !document.getElementById('siteKindBox').hidden, cap: document.getElementById('edSymCap').textContent })""")
        await pg.fill('#poleId', 'HOMING DVO-123'); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#svColors'); await pg.click('#svColors .sw[data-c="navy"]'); await W(pg, 150)
        await pg.evaluate(f"__polecam.pinMap.setView([{SITELL[0]}, {SITELL[1]}], 19, {{ animate: false }})"); await W(pg, 500); await save(pg)
        ODCLL = (POLES[1]['ll'][0], POLES[1]['ll'][1] + 14 / 110000)
        await close_sheets(pg); await pg.click('#pinAddBtn'); await W(pg, 300)
        await pg.locator('#askBox button', has_text='ODC (cabinet)').click(); await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 900)
        await pg.fill('#poleId', 'ODC-0001'); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#svColors'); await pg.click('#svColors .sw[data-c="green"]'); await W(pg, 150)
        odc_cap = await pg.text_content('#edSymCap')
        await pg.evaluate(f"__polecam.pinMap.setView([{ODCLL[0]}, {ODCLL[1]}], 19, {{ animate: false }})"); await W(pg, 500); await save(pg)
        check('1a. the pin menu: Tower (site), OLT (site), ODC (cabinet) only; placing a tower: "New tower on the map", its model on the pin, Site type Tower',
              menu == ['Tower (site)', 'OLT (site)', 'ODC (cabinet)', 'Cancel'] and tw['title'] == 'New tower on the map' and tw['cross'] and tw['kind'] == 'Tower' and tw['kindShown'] and tw['cap'] == 'Existing tower', (menu, tw))
        check('1b. the symbol follows the record: a proposed pole, a new ODC (v2.41: the cabinet, not an LCP)', cap_pp == 'Proposed pole' and odc_cap == 'New ODC (cabinet)', (cap_pp, odc_cap))
        # NAP (dummy), manhole, service box, handhole by camera
        async def rec(el, ll, name, extra=None):
            await capture(pg, cur, *ll); await pg.select_option('#elemSel', el); await W(pg, 400); await pg.fill('#poleId', name)
            if extra: await extra()
            await save(pg)
        nap_ll = (POLES[3]['ll'][0] + 4 / 110574, POLES[3]['ll'][1])
        # v2.41: the NAP is on the pole (no NAP element in the record any more): a dummy NAP on the fourth pole
        await pg.evaluate("(n) => { const p = __polecam.points.find((x) => x.poleId === n); p.nap = true; p.napId = 'DN-0001'; p.boq = { ...(p.boq || {}), napType: 'Dummy NAP', napSz: '12C', napSt: 'New' }; }", POLES[3]['id'])
        lat4, lon4 = POLES[4]['ll']; k = 1 / (111320 * math.cos(math.radians(lat4)))
        await rec('Manhole', (lat4 - 20 / 110574, lon4 + 15 * k), 'MH-0001')
        await rec('Service box', (lat4 - 35 / 110574, lon4 + 25 * k), 'SB-0001')
        await rec('Handhole', (lat4 - 50 / 110574, lon4 + 35 * k), 'HH-0001')
        await close_sheets(pg)
        mk = await pg.evaluate("[...document.querySelectorAll('.svsym')].length")
        els = await pg.evaluate("__polecam.points.filter((x) => x.project === 'PLAN_237').map((p) => [p.poleId, p.element, p.siteKind || '', JSON.stringify(p.boq || {})])")
        check('1c. the map shows the tower and the ODC as their models; NAP kind, manhole, service box and handhole saved', mk >= 2 and any(e[1] == 'Manhole' for e in els) and any(e[1] == 'Service box' for e in els)
              and any(e[1] == 'Pole' and 'Dummy NAP' in e[3] for e in els) and any(e[1] == 'Site' and e[2] == 'Tower' for e in els), (mk, els))
        # the route: site → PP → poles (12C) → manhole → service box → handhole (UG) → ODC
        await pg.evaluate("""(P) => { const pts = __polecam.points.filter((x) => x.project === 'PLAN_237'), id = (n) => pts.find((x) => x.poleId === n).id;
          const L = [['HOMING DVO-123', P[4], 'L12'], [P[4], P[3], 'L12'], [P[3], P[2], 'L12'], [P[2], P[1], 'L12'], [P[1], P[0], 'L12'], [P[0], 'PP-0001', 'L12'],
                     [P[4], 'MH-0001', 'U144'], ['MH-0001', 'SB-0001', 'U144'], ['SB-0001', 'HH-0001', 'U144'], ['HH-0001', 'ODC-0001', 'U144']];
          const S = __polecam.S; S.meta = S.meta || {}; S.meta.PLAN_237 = { ...(S.meta.PLAN_237 || {}), links: L.map(([a, b, c]) => [id(a), id(b), c]) }; __polecam.persist(); __polecam.renderPoles(); }""", [P['id'] for P in POLES[:5]])
        await W(pg, 600)
        # ===== 3. the plan DXF
        f = await run_export(pg, 'doDxf', 'plan_237.zip')
        z = zipfile.ZipFile(f); dxfn = [n for n in z.namelist() if n.endswith('.dxf')][0]; txt = z.read(dxfn).decode('utf-8'); open(f'{OUT}/plan_237.dxf', 'w', encoding='utf-8', newline='').write(txt)
        readme = z.read('README.txt').decode()
        doc = ezdxf.readfile(f'{OUT}/plan_237.dxf'); msp = doc.modelspace()
        E, N = utm51(*POLES[2]['ll'])
        def geoc(e):
            b = bbox.extents(list(e.virtual_entities()), fast=True); return (b.center.x, b.center.y)
        inr = [e for e in msp.query('INSERT') if (lambda c: abs(c[0] - E) < 600 and abs(c[1] - N) < 600)(geoc(e))]
        names = {}
        for e in inr: names[e.dxf.name] = names.get(e.dxf.name, 0) + 1
        print('blocks', names)
        want = ['dummy nap', 'G-ESAA ODC', 'PROPOSED MAN HOLE', 'proposed service box', 'G-ESAA P2P', 'proposed grounding', 'proposed riser', 'X-BTS']
        check('3a. the plan has the dummy NAP (on its pole), the ODC (v2.41: its isometric block), manhole, service box, handhole on the cable; the pole-to-pole guy; grounding at the loop poles (v2.42.17: + the dummy NAP and riser poles\' own loops) and the marked pole; the riser; the existing tower (not red)',
              all(names.get(w) for w in want) and (names.get('HANDHOLE') or names.get('proposed Handhole')) and names.get('proposed grounding') == 3 and names.get('loopp') == 3 and not names.get('G-ESAA P-BTS'), names)  # v2.42.17: the dummy NAP pole and the riser pole have their own loop (with its grounding): loops at poles 0, 3, 4
        vic = Image.open(io.BytesIO(z.read('VICINITY_MAP.jpg'))).convert('RGB'); W0, H0 = vic.size; vic.save(f'{OUT}/vicinity.jpg')
        cpx = vic.getpixel((W0 // 2, H0 // 2)); kpx = vic.getpixel((10, 10))
        check('3b. the vicinity picture is grey and darker outside the PROJECT AREA circle, as it was inside (the satellite mock is green)',
              cpx[1] > cpx[0] + 25 and abs(kpx[0] - kpx[1]) < 8 and abs(kpx[1] - kpx[2]) < 8 and kpx[1] < cpx[1] * 0.8, (cpx, kpx))
        rl = [l for l in readme.splitlines() if l.startswith('On the cable')]
        check('3c. the README says what is drawn on the cable, the grounding, risers, HDD, the tower / OLT', rl and 'Grounding' in rl[0] and 'Risers' in rl[0], rl)
        # the site changed to an OLT: the map shows the OLT, the plan the OLT model
        await pg.evaluate("(n) => { const p = __polecam.points.find((x) => x.poleId === n); __polecam.map.setView([p.lat, p.lon], 19, { animate: false }); }", 'HOMING DVO-123'); await W(pg, 600)
        await pg.evaluate("(n) => { const m = Object.values(__polecam.map._layers).find((l) => l.getTooltip && l.getTooltip() && l.getTooltip().getContent().startsWith(n)); if (m) m.fire('click'); }", 'HOMING DVO-123')
        await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 800)
        k0 = await pg.evaluate("document.getElementById('siteKindSel').value")
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#siteKindSel'); await pg.select_option('#siteKindSel', 'OLT'); await W(pg, 300)
        olt_ui = await pg.evaluate("({ title: document.getElementById('editorTitle').textContent, cap: document.getElementById('edSymCap').textContent })")
        await save(pg)
        f2 = await run_export(pg, 'doDxf', 'plan_237_olt.zip')
        z2 = zipfile.ZipFile(f2); txt2 = z2.read([n for n in z2.namelist() if n.endswith('.dxf')][0]).decode('utf-8'); open(f'{OUT}/plan_237_olt.dxf', 'w', encoding='utf-8', newline='').write(txt2)
        doc2 = ezdxf.readfile(f'{OUT}/plan_237_olt.dxf'); msp2 = doc2.modelspace()
        n2 = [e.dxf.name for e in msp2.query('INSERT') if (lambda c: abs(c[0] - E) < 600 and abs(c[1] - N) < 600)(geoc(e))]
        check('3d. the site changed to an OLT: the record keeps the kind (Edit OLT site, Existing OLT); the plan draws the OLT model, not the tower',
              k0 == 'Tower' and olt_ui['title'] == 'Edit OLT site' and olt_ui['cap'] == 'Existing OLT' and 'OLT1' in n2 and 'X-BTS' not in n2, (k0, olt_ui, [x for x in n2 if x in ('OLT1', 'X-BTS')]))
        # ===== 4. the route check
        adv0 = await pg.evaluate("__polecam.routeAdvice()")
        await pg.evaluate("""() => { const S = __polecam.S, pts = __polecam.points, base = pts.find((x) => x.poleId === 'HOMING DVO-123'), out = [];
          for (let k = 1; k <= 12; k++) out.push({ id: 'adv' + k, project: 'PLAN_237', kind: 'survey', element: 'Pole', poleId: 'ADV-' + String(k).padStart(4, '0'), lat: base.lat + k * 250 / 110574, lon: base.lon, status: 'Existing', created: new Date().toISOString() });
          out.push({ id: 'advn', project: 'PLAN_237', kind: 'survey', element: 'NAP', poleId: 'DN-0099', lat: base.lat + 3 * 250 / 110574 + 2 / 110574, lon: base.lon, status: 'Proposed', boq: { napType: 'Dummy NAP' }, created: new Date().toISOString() });
          pts.push(...out);
          const L = S.meta.PLAN_237.links.slice(); L.push([base.id, 'adv1', 'L12']); for (let k = 1; k < 12; k++) L.push(['adv' + k, 'adv' + (k + 1), 'L12']);
          S.meta.PLAN_237.links = L; }""")
        adv = await pg.evaluate("__polecam.routeAdvice()")
        print('advice', adv0, adv)
        check('4. the route check: none on the short route; on a long 12C run a dummy NAP is recommended at the last pole before 2 km, counted from the dummy NAP DN-0099 at ADV-0003 (ADV-0010: ADV-0011 is 2.01 km on)',
              not [x for x in adv0 if x['kind'] != 'flag'] and [x['text'] for x in adv0] == ['loop at NPT is 15 m from the ODC entrance loop at ODC-0001: kept as set'] and [a['poleId'] for a in adv if a['kind'] == 'dnap'] == ['ADV-0010'], (adv0, adv)) # v2.42.18: the loop set 15 m from the ODC's entrance loop is flagged
        await pg.evaluate("() => { const pts = __polecam.points; for (let i = pts.length - 1; i >= 0; i--) if (String(pts[i].id).startsWith('adv')) pts.splice(i, 1); const S = __polecam.S; S.meta.PLAN_237.links = S.meta.PLAN_237.links.filter((l) => !String(l[0]).startsWith('adv') && !String(l[1]).startsWith('adv')); }")
        # ===== 5. the other exports
        made = {}
        for sel, nm in (('doKmz', 'pins.kmz'), ('doCsv', 'pins.csv'), ('doRouteXlsx', 'route.xlsx')):
            try: fx = await run_export(pg, sel, nm); made[sel] = os.path.getsize(fx)
            except Exception as e: made[sel] = 'FAILED ' + str(e)[:120]; await close_sheets(pg)
        kml_ok = csv_ok = None
        try:
            kz = zipfile.ZipFile(f'{OUT}/pins.kmz'); kml = kz.read([n for n in kz.namelist() if n.endswith('.kml')][0]).decode()
            kml_ok = '<Data name="nap_type"><value>Dummy NAP</value>' in kml and '<Data name="nap_size"><value>12C</value>' in kml and '<Data name="grounding">' in kml and 'MH-0001' in kml and 'SB-0001' in kml
            csv = open(f'{OUT}/pins.csv', encoding='utf-8-sig').read(); csv_ok = all(h in csv.splitlines()[0] for h in ('nap_type', 'nap_size', 'nap_status', 'lcp', 'grounding', 'riser'))
        except Exception as e: kml_ok = str(e)
        check('5a. KMZ, CSV and the route Excel are made (manholes and service boxes in them); the KMZ and CSV carry the new sizes (NAP type, LCP, grounding, riser)', all(isinstance(v, int) and v > 500 for v in made.values()) and kml_ok is True and csv_ok, (made, kml_ok, csv_ok))
        await pg.screenshot(path=f'{OUT}/map.png')
        bad = [e for e in errs if 'PAGEERROR' in e]
        check('5b. no page errors', not bad, bad[:5])
        tk.cancel(); await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
