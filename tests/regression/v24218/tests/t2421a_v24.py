"""v2.42.24 copy: the spans linked in capture order by the test hook (the route screen's button now makes cables). v2.42.21 copy: Route opens with Route tools and linking by pairs (the route card as before v2.42.21).
v2.42.1 / v2.42.2 (phone): the pole details of an electric pole, and the telco arm on the plan.
 1. a Concrete (electric) pole: + Add detail offers Transformer and Telco arm only (no Other…); with both added the list is gone
 2. the same record turned Globe: the full list again (Streetlight, Other…); back to Concrete: the two
 3. saved with Telco arm and Transformer; a Globe pole with a Streetlight; the CSV's pole_details says them
 4. the plan: the G-ESAA TELCO ARM block (seen from above) at the Concrete pole, from its face toward the cable (layer G-ESAA TELCO
    ARM), its name TELCO ARM beside it; none at the Globe pole; no page errors
 5. v2.42.2 (design H1): the block's channel filled white (a SOLID, colour 255, drawn first), TELCO on it in red bold Arial (style
    G-ESAA BOLD, arialbd.ttf) between the pole plate and the clamp; the twin G-ESAA TELCO ARM R with TELCO turned round; the insert
    uses the one that reads the right way up; its name 0.8 m high; the DXF audits clean"""
import asyncio, sys, os, shutil, json, zipfile, io, re, math, csv as csvmod
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
from ezdxf import bbox as BB
BASE = os.environ.get('BASE', 'http://localhost:8765')
D = S + '/v242'; OUT = S + '/v24218/tests/out_2421v18'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'; LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:1400], flush=True)
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
OPTS = "[...document.getElementById('svDetailAdd').options].map((o) => o.value)"
POLES = [(7.10000, 125.60000), (7.10030, 125.60020), (7.10060, 125.60040)]
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
        await newproj(pg, 'survey', 'PLAN_421', purpose='As-plan'); await close_sheets(pg)
        # 1. a concrete pole
        await capture(pg, cur, *POLES[0]); await pg.select_option('#typeSel', 'Concrete'); await W(pg, 300); await pg.fill('#poleId', 'CC-0001')
        o1 = await pg.evaluate(OPTS)
        await pg.select_option('#svDetailAdd', 'Telco arm'); await W(pg, 300); o1b = await pg.evaluate(OPTS)
        await pg.select_option('#svDetailAdd', 'Transformer'); await W(pg, 300)
        gone = await pg.evaluate("document.getElementById('svDetailAdd').getClientRects().length === 0")
        chips = await pg.evaluate("[...document.querySelectorAll('#svDetails .pdrow .t')].map((x) => x.textContent)")
        await pg.evaluate("document.getElementById('svDetailsBox').scrollIntoView({ block: 'center' })"); await W(pg, 300); await pg.screenshot(path=OUT + '/elec_details.png')
        check('1. a Concrete (electric) pole: + Add detail offers Transformer and Telco arm only (no Other…); with both added the list is gone',
              o1 == ['', 'Transformer', 'Telco arm'] and o1b == ['', 'Transformer'] and gone and chips == ['Telco arm', 'Transformer'], (o1, o1b, gone, chips))
        # 2. Globe then Concrete again
        await pg.select_option('#typeSel', 'Globe'); await W(pg, 300); o2 = await pg.evaluate(OPTS)
        await pg.select_option('#typeSel', 'Concrete'); await W(pg, 300); o3 = await pg.evaluate(OPTS); vis3 = await pg.evaluate("document.getElementById('svDetailAdd').getClientRects().length > 0")
        await pg.fill('#poleId', 'CC-0001')
        check('2. turned Globe: the full list (Streetlight, Other…); back to Concrete: Transformer and Telco arm only (both on the pole: nothing left to add)',
              'Streetlight' in o2 and '__other' in o2 and 'Crossarm' in o2 and o3 == [''] and not vis3, (o2, o3, vis3))
        await save(pg)
        await capture(pg, cur, *POLES[1]); await pg.select_option('#typeSel', 'Globe'); await W(pg, 300); await pg.fill('#poleId', 'GT-0002')
        await pg.select_option('#svDetailAdd', 'Streetlight'); await W(pg, 200); await save(pg)
        await capture(pg, cur, *POLES[2]); await pg.select_option('#typeSel', 'Concrete'); await W(pg, 300); await pg.fill('#poleId', 'CC-0003'); await save(pg)
        await close_sheets(pg); await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 400); await pg.evaluate('__polecam.capLinks()'); await W(pg, 400); await pg.click('#rbDone'); await W(pg, 600)
        # 3. records and CSV
        recs = await pg.evaluate("__polecam.points.filter((x) => x.project === 'PLAN_421').map((x) => [x.poleId, x.poleType, (x.details || []).map((d) => d.item)])")
        fc = await export(pg, 'doCsv', 'pts.csv'); raw = open(fc, 'rb').read()
        ctext = zipfile.ZipFile(io.BytesIO(raw)).read([n for n in zipfile.ZipFile(io.BytesIO(raw)).namelist() if n.endswith('.csv')][0]).decode('utf-8-sig') if raw[:2] == b'PK' else raw.decode('utf-8-sig')
        cr = list(csvmod.reader(io.StringIO(ctext))); h = cr[0]; pdx = h.index('pole_details'); pdv = {r[h.index('pole_id')]: r[pdx] for r in cr[1:] if r} # v2.42.18: the first column is the pole number (no)
        check('3. saved: CC-0001 with Telco arm and Transformer, GT-0002 with a Streetlight; the CSV pole_details says them',
              ['CC-0001', 'Concrete', ['Telco arm', 'Transformer']] in recs and ['GT-0002', 'Globe', ['Streetlight']] in recs and 'Telco arm: 1 pc' in pdv.get('CC-0001', '') and 'Transformer: 1 pc' in pdv.get('CC-0001', '') and 'Streetlight' in pdv.get('GT-0002', ''), (recs, pdv))
        # 4. the plan
        f = await export(pg, 'doDxf', 'plan.zip'); z = zipfile.ZipFile(f)
        doc = ezdxf.read(io.StringIO(z.read([n for n in z.namelist() if n.endswith('.dxf')][0]).decode('utf-8', 'replace')))
        msp = doc.modelspace(); ta = [e for e in msp.query('INSERT') if e.dxf.name in ('G-ESAA TELCO ARM', 'G-ESAA TELCO ARM R')]
        blk = doc.blocks.get('G-ESAA TELCO ARM'); nlines = len([e for e in blk if e.dxftype() == 'LWPOLYLINE']) if blk else 0
        names = [e for e in msp.query('TEXT') if e.dxf.text == 'TELCO ARM' and e.dxf.layer == 'G-ESAA TELCO ARM']
        cen = lambda e: (lambda b: ((b.extmin.x + b.extmax.x) / 2, (b.extmin.y + b.extmax.y) / 2))(BB.extents(e.virtual_entities()))
        poles = [(e.dxf.layer, cen(e)) for e in msp.query('INSERT') if e.dxf.layer in ('ELECTRIC POLE', 'GT-POLE') and abs(e.dxf.insert.x) > 1000]
        c = (ta[0].dxf.insert.x, ta[0].dxf.insert.y) if ta else None
        near = sorted((math.dist(c, q), ly) for ly, q in poles) if c else []
        d1 = near[0][0] if near else None; d2 = near[0][1] if near else None
        nm = (lambda e: (e.dxf.align_point.x, e.dxf.align_point.y))(names[0]) if names else None
        dn = math.dist(c, nm) if c and nm else None
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1800)
        for _ in range(4): await pg.click('#drawCanvas', position={'x': 195, 'y': 380}); await pg.mouse.wheel(0, -400); await W(pg, 200)
        await pg.screenshot(path=OUT + '/drawing_ta.png'); await close_sheets(pg)
        check('4. the plan: one G-ESAA TELCO ARM (from above: the channel, its band and clamp) at the face of the electric pole CC-0001, its name TELCO ARM beside it (layer G-ESAA TELCO ARM); none at the Globe pole; no page errors',
              len(ta) == 1 and ta[0].dxf.layer == 'G-ESAA TELCO ARM' and nlines >= 5 and d1 is not None and d1 < 3 and d2 == 'ELECTRIC POLE' and len(names) == 1 and dn is not None and dn < 12 and not errs,
              (len(ta), ta[0].dxf.layer if ta else None, nlines, d1, d2, len(names), dn, errs[:3]))
        # 5. v2.42.2: design H1
        def tdesc(b):
            ents = list(b) if b else []; sol = [e for e in ents if e.dxftype() == 'SOLID']; tx = [e for e in ents if e.dxftype() == 'TEXT']
            st = doc.styles.get(tx[0].dxf.style) if tx and doc.styles.has_entry(tx[0].dxf.style) else None
            return dict(first=ents[0].dxftype() if ents else None, solid=[e.dxf.color for e in sol], fill=[sorted(round(v.x, 2) for v in (e.dxf.vtx0, e.dxf.vtx1, e.dxf.vtx2, e.dxf.vtx3)) for e in sol],
                        text=[(e.dxf.text, e.dxf.color, e.dxf.style, round(e.dxf.height, 2), round(e.dxf.rotation) % 360, round(e.dxf.align_point.x, 2)) for e in tx], font=st.dxf.font if st else None)
        b0, b1 = tdesc(doc.blocks.get('G-ESAA TELCO ARM')), tdesc(doc.blocks.get('G-ESAA TELCO ARM R'))
        rd = lambda a: (lambda d: d - 180 if 90 < d <= 270 else d)(a % 360)
        want = (('G-ESAA TELCO ARM' if abs((rd(ta[0].dxf.rotation) - ta[0].dxf.rotation) % 360) < 1 else 'G-ESAA TELCO ARM R') if ta else None)
        aud = doc.audit(); nh = round(names[0].dxf.height, 2) if names else None
        def good(b, rot):
            return (b['first'] == 'SOLID' and b['solid'] == [255] and b['fill'] and b['fill'][0][0] >= 0.1 and b['fill'][0][-1] >= 3.5 and len(b['text']) == 1
                    and b['text'][0][:4] == ('TELCO', 1, 'G-ESAA BOLD', 0.44) and b['text'][0][4] == rot and 0.12 < b['text'][0][5] < 2.48 and (b['font'] or '').lower() == 'arialbd.ttf')
        check('5. v2.42.2 (H1): the channel filled white (SOLID 255, first), TELCO in red bold Arial on it; the twin ...ARM R with TELCO turned round; the insert reads the right way up; the name 0.8 m; the DXF audits clean',
              good(b0, 0) and good(b1, 180) and ta and ta[0].dxf.name == want and nh == 0.8 and not aud.has_errors,
              (b0, b1, ta[0].dxf.name if ta else None, ta[0].dxf.rotation if ta else None, want, nh, [str(x.message) for x in aud.errors][:3]))
        task.cancel(); await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
