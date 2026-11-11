"""(v2.42.28 copy: the plan's options from What to export and Plan settings.)
v2.41.0: the Drawing screen holds the plan's options; several DXFs in one export; the drawing style; the ODC cabinet; the Export
screen without the Format dropdown. On the 10 km sample with 12 PLDT poles (a type added on the phone) and 6 steel poles.
(v2.42.15: the poles grouped by owner: PLDT 34 = 12 PLDT poles + 22 concrete poles owned by PLDT; electric 163; Globe 29 with the proposed.)
 1. Drawing: Fit, Labels, Map and i on the drawing (lower right), the legend (upper left); at the bottom Photos / Numbers / Photos + no.,
    the clamp-type button and the points dropdown (Electric, Globe, PLDT, then ODC, ODF, sites, handholes… with their counts);
    the preview numbers every marked point (the same order as the DXF); the map is Offline by default
 2. on the Drawing: Numbers, only PLDT, clamp types off; Export DXF opens the DXF card: ON THE PLAN says so; the DXF has the numbers
    1-12 only, 3 m high, yellow (2), in a 7 m circle, with leader lines; no clamp types; one DXF in the ZIP
 3. the drawing style (numbers red, 4 m; IDs bold cyan): the DXF's numbers are red and 4 m, the NAP IDs use the bold style in cyan
 4. DRAWINGS IN THIS EXPORT: the Drawing's choice + every point with photos and numbers + only electric poles + only PLDT: one ZIP
    with 4 DXFs, the photos once, the README lists each drawing and its numbers; the both-mode DXF has a number at each photo
    (v2.42.14: the drawings as rows: the Drawing's PLDT numbers, then three added in the DXF card)
 5. the ODC is drawn as its cabinet (layers G-ESAA PROPOSED / EXISTING ODC, ODC written in it), not with the LCP model; the vicinity
    circle is yellow
 6. Export screen: no Format dropdown; FORMATS ticks: one shows its card and button; two show both cards without their buttons and
    one button "Export 2 formats (one ZIP)"; no page errors"""
import asyncio, sys, os, shutil, json, zipfile, time, urllib.parse, io, re, collections
# v2.42.8: the plan DXF is written with CRLF line ends (AutoCAD's own); ezdxf.read() on a text stream expects universal newlines
class _UStringIO(io.StringIO):
    def __init__(self, s='', *a, **k): super().__init__(s.replace('\r\n', '\n') if isinstance(s, str) else s, *a, **k)
io.StringIO = _UStringIO
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from playwright.async_api import async_playwright
import ezdxf
BASE = os.environ.get('BASE', 'http://localhost:8765')
D = S + '/v241'; OUT = S + '/v24228/out_241v28'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
FILE = PRIV + '/large/G-eSAA_TEST10KM_RTA.zip'
ROAD = PRIV + '/roads/G-eSAA roads - Davao Region - 2026-08-19.roadpack'
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
SEED_H = {e.dxf.handle for e in ezdxf.read(io.StringIO(SEED)).modelspace()} # the template's own entities (its legend has an LCP and a number)
ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'; LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:1200], flush=True)
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
async def open_card(pg, sel='doDxf'):
    await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate(f"window.__polecam.showExport('{sel}')"); await W(pg, 400)
async def run_export(pg, sel):
    toast = ''
    await pg.click('#' + sel)
    for _ in range(4000):
        if await pg.locator('#resultBox:not([hidden])').count(): break
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
        t = await pg.text_content('#toast') or ''
        if t.startswith('Plan:'): toast = t
        await W(pg, 250)
    t = await pg.text_content('#toast') or ''
    if t.startswith('Plan:'): toast = t
    return toast
async def save(pg, name):
    async with pg.expect_download(timeout=180000) as d: await pg.click('#resSave')
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f); return f
async def export(pg, sel, name, setup=None):
    await open_card(pg, sel)
    if setup: await setup(pg)
    toast = await run_export(pg, sel); f = await save(pg, name); await close_sheets(pg); return f, toast
def plans(f):
    z = zipfile.ZipFile(f); out = {}
    for n in [n for n in z.namelist() if n.endswith('.dxf')]:
        txt = z.read(n).decode('utf-8', 'replace'); doc = ezdxf.read(io.StringIO(txt)); msp = [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
        imgs = [e for e in msp if e.dxftype() == 'IMAGE' and e.dxf.layer == 'G-ESAA POLE PHOTO']
        nums = [e for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer == 'p-pole' and e.dxf.get('color', 256) != 250 and re.fullmatch(r'\d+', e.dxf.text or '')]
        mnums = [e for e in msp if e.dxftype() == 'MTEXT' and e.dxf.layer == 'p-pole' and re.fullmatch(r'\d+', e.plain_text().strip())]
        circ = [e for e in msp if e.dxftype() == 'CIRCLE' and e.dxf.layer == 'p-pole' and e.dxf.get('color', 256) != 250]
        lead = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and e.dxf.layer == 'p-pole' and e.dxf.get('color', 256) != 250]
        texts = [(e.dxf.text if e.dxftype() == 'TEXT' else e.plain_text()).strip() for e in msp if e.dxftype() in ('TEXT', 'MTEXT')]
        out[n] = {'doc': doc, 'msp': msp, 'imgs': imgs, 'nums': nums, 'mnums': mnums, 'circ': circ, 'lead': lead, 'texts': texts}
    jpgs = [n for n in z.namelist() if n.lower().endswith('.jpg') and not n.startswith('VICINITY') and not n.startswith('COMPANY_LOGO')]
    return out, jpgs, z.read('README.txt').decode('utf-8', 'replace'), z.namelist()
CT = re.compile(r'^(?:CA|GCA|2A|DEG|RL)(?:\+(?:CA|GCA|2A|DEG|RL))* \S+$')

async def main():
    z = zipfile.ZipFile(FILE); data = json.loads(z.read('p1/points.json')); pts = data['points']
    by_type = collections.Counter(p['poleType'] for p in pts if p['element'] == 'Pole')
    others = collections.Counter(p['element'] for p in pts if p['element'] not in ('Pole', 'NAP', 'Closure'))
    pldt = sorted(p['poleId'] for p in pts if p.get('poleType') == 'PLDT')
    # v2.42.15: the poles grouped by owner, as the project management table (a proposed pole: Globe's; an existing pole by its BOQ owner, else its type)
    def mkey(p):
        if p['element'] != 'Pole': return None
        if p.get('status') in ('Proposed', 'New'): return 'GT'
        t = {'Concrete': 'CC', 'Wood': 'WP', 'Steel': 'SP', 'Globe': 'GT', 'Bayantel': 'BT', 'PLDT': 'PLDT'}.get(p['poleType'], '')
        if t == 'GT': return 'GT'
        o = ((p.get('boq') or {}).get('owner') or '').strip()
        if o:
            if re.search('electric|coop|power', o, re.I): return 'ELEC'
            if re.search('globe', o, re.I): return 'GT'
            u = re.sub('[^A-Z0-9]+', '', o.upper()); return {'BAYANTEL': 'BT'}.get(u, u)
        return 'ELEC' if t in ('CC', 'WP', 'SP') else (t or '_none')
    grp = collections.Counter(mkey(p) for p in pts if p['element'] == 'Pole')
    n_el = grp['ELEC']; n_pl = grp['PLDT']
    async def sheet(route):
        req = route.request
        if req.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query)
        if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
        out = {'ok': True, 'name': common.SHEET_MOCK['name'], 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(OUT + '/ud', executable_path=common.CHROME, viewport={'width': 1366, 'height': 768}, accept_downloads=True, service_workers='block')
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
        await pg.evaluate("__polecam.S.myTypes = [{ n: 'PLDT', p: 'PLDT' }]")
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 800)
        await pg.set_input_files('#packFileInput', ROAD); await W(pg, 1500); await idle(pg); await close_sheets(pg)
        await pg.set_input_files('#sharedInput', FILE); await pg.wait_for_selector('#askBox:not([hidden])', timeout=600000)
        for _ in range(4):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            await pg.locator('#askBox button.primary').first.click(); await W(pg, 700)
        await idle(pg); await W(pg, 1500)
        # 1. the Drawing
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 2500)
        d1 = await pg.evaluate("""() => { const q = (s) => document.querySelector(s), inWrap = (id) => !!q('#drawWrap #' + id), vis = (id) => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; };
          const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(), w = q('#drawWrap').getBoundingClientRect(); return [Math.round(b.left - w.left), Math.round(b.top - w.top), Math.round(w.width), Math.round(w.height)]; };
          return { tools: ['drawFit', 'drawLabels', 'drawMap', 'drawInfoBtn'].map((id) => [id, inWrap(id), vis(id), r(id)]), legend: vis('drawLegend') && q('#drawLegend').open, legendRows: q('#drawLegendBody').children.length / 2,
            bar: ['drawWhat', 'drawDxf'].map((id) => [id, !!q('.drwbar #' + id), vis(id)]), mapKind: document.querySelector('input[name=drawMapKind]:checked').value,
            types: __polecam.mxGroups().filter((g) => g.kind === 'pole' || g.kind === 'el').map((g) => [g.k, g.n]), pill: q('#drawPvT').textContent, rows: __polecam.dxfRows() }; }""")
        nseq = await pg.evaluate("(() => { const c = document.getElementById('drawCanvas'); return c.width; })()")
        seq = await pg.evaluate("window.__polecam.drwSeq ? window.__polecam.drwSeq() : null")
        await pg.screenshot(path=OUT + '/drawing_laptop.png')
        want_keys = {**{k: v for k, v in grp.items()}, **{f'el:{k}': v for k, v in others.items()}}
        got = {v: n for v, n in d1['types']}  # v2.42.28: the rows of What to export
        n_all = sum(by_type.values()) + sum(others.values())
        check('1. Drawing: Fit, Labels, Map and i on the drawing at its lower right, the legend open at its upper left; at the bottom What to export and Export (v2.42.28); the map Offline by default',
              all(t[1] and t[2] and t[3][0] > t[3][2] - 90 and t[3][1] > t[3][3] / 2 for t in d1['tools']) and d1['legend'] and d1['legendRows'] >= 4 and all(b[1] and b[2] for b in d1['bar']) and d1['mapKind'] == 'offline', d1)
        check(f'1b. What to export: rows Electric poles {n_el}, Globe, PLDT 12, then the other points by element; one drawing, every point; the preview numbers every point (1 to {n_all}) in the DXF\'s order',
              got == want_keys and d1['pill'] == 'Every point · Photo' and d1['rows'] == [{'pts': ['*'], 'mode': 'photo'}] and seq and seq['n'] == n_all and seq['max'] == n_all, (got, want_keys, d1['pill'], seq))
        # 2. numbers, only PLDT, clamp types off (on the Drawing)
        # v2.42.28: in What to export, PLDT · Number ticked and Every point · Photo unticked; clamp types off in Plan settings
        await pg.evaluate("__polecam.setWhat(true)"); await W(pg, 300)
        async def tick(nm, md):
            gi = await pg.evaluate("(n) => __polecam.mxGroups().findIndex((x) => x.name === n)", nm); await pg.click(f'#mxGrid .mxc[data-g="{gi}"][data-m="{md}"]'); await W(pg, 400)
        await tick('PLDT poles', 'num')
        if await pg.locator('#askBox:not([hidden])').count(): await pg.click('#askBox button:text-is("Whole project")'); await W(pg, 300)
        await tick('Every point', 'photo')
        await pg.evaluate("__polecam.setWhat(false)"); await W(pg, 300)
        await pg.click('#drawSetBtn'); await W(pg, 500); await pg.click('label[for="psCA"]'); await W(pg, 300); await pg.go_back(); await W(pg, 500)
        for _ in range(20):
            seq2 = await pg.evaluate("window.__polecam.drwSeq()")
            if seq2 and seq2['n'] == n_pl: break
            await W(pg, 250)
        sum2 = await pg.text_content('#drawWhatV')
        await pg.click('#drawCanvas', position={'x': 400, 'y': 90}); await W(pg, 200)
        await pg.screenshot(path=OUT + '/drawing_pldt.png')
        await pg.click('#drawDxf'); await W(pg, 900)
        card = await pg.evaluate("({ ca: __polecam.S.exp.dxfClampType, files: [...document.querySelectorAll('#dxfFiles .dxffile > span:nth-child(2)')].map((c) => c.textContent), card: !document.querySelector('#doDxf').closest('.xcard').classList.contains('xoff') })")  # v2.42.28: the drawings listed on the short card
        await pg.screenshot(path=OUT + '/dxf_card.png')
        await pg.evaluate("__polecam.setNumCfg({ mode: 'owner', keep: false })") # v2.42.18: the plan's numbers are the CSV's; per pole owner, PLDT 1 … 12
        toast = await run_export(pg, 'doDxf'); f2 = await save(pg, 'plan_pldt.zip'); await close_sheets(pg)
        P2, jp2, rd2, names2 = plans(f2); p2 = list(P2.values())[0]
        hs = sorted({round(e.dxf.height, 2) for e in p2['nums']}); cols = sorted({e.dxf.get('color', 256) for e in p2['nums']})
        check('2. on the Drawing: What to export PLDT · Number only, clamp types off (Plan settings); Export opens the DXF card listing that drawing; one DXF: the numbers 1 to 12 only, 3 m high, yellow, in 7 m circles with leader lines; no clamp types; no photos',
              sum2 == '1 drawing: PLDT poles · Number' and seq2['n'] == n_pl and card['card'] and card['files'] == [f'PLDT poles {n_pl}'] and card['ca'] is False and len(P2) == 1
              and sorted(int(e.dxf.text) for e in p2['nums']) == list(range(1, n_pl + 1)) and hs == [3.0] and cols == [2] and len(p2['circ']) == n_pl and all(abs(c.dxf.radius - 3.5) < 0.01 for c in p2['circ']) and len(p2['lead']) >= 10
              and not [t for t in p2['texts'] if CT.match(t)] and not p2['imgs'] and not jp2 and f'numbered: only PLDT poles (PLDT) ({n_pl})' in toast,
              (sum2, seq2, card, hs, cols, len(p2['circ']), len(p2['lead']), toast, names2[:4]))
        # 3. the drawing style
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1500); await pg.click('#drawSetBtn'); await W(pg, 500); await pg.click('#psStyle'); await W(pg, 500)  # v2.42.28: Drawing style in Plan settings
        await pg.click('#stNumCol .sw2[aria-label^="red"]'); await W(pg, 150)
        await pg.fill('#stNumH', '4'); await pg.dispatch_event('#stNumH', 'input'); await W(pg, 150)
        await pg.click('#stIdBold .chip[data-v="1"]'); await W(pg, 150); await pg.click('#stIdCol .sw2[aria-label^="cyan"]'); await W(pg, 300)
        await pg.screenshot(path=OUT + '/style.png', full_page=True)
        st = await pg.evaluate("({ sum: document.getElementById('stSum').textContent, pl: __polecam.S.plStyle, svgText: [...document.querySelectorAll('#stPrev text')].map((t) => [t.textContent, t.getAttribute('fill'), t.getAttribute('font-weight')]) })")
        await pg.click('#stDone'); await W(pg, 300); await pg.go_back(); await W(pg, 400)  # (and Plan settings closed)
        await pg.click('#drawDxf'); await W(pg, 900)
        toast = await run_export(pg, 'doDxf'); f3 = await save(pg, 'plan_style.zip'); await close_sheets(pg)
        P3, _, rd3, _ = plans(f3); p3 = list(P3.values())[0]
        nap_ids = [e for e in p3['msp'] if e.dxftype() == 'TEXT' and re.match(r'^NAP-\d+', e.dxf.text or '')]
        check('3. the drawing style: the numbers red and 4 m in the DXF; the NAP IDs bold (style G-ESAA BOLD, arialbd) and cyan; the preview shows them; the README names the style',
              sorted({round(e.dxf.height, 2) for e in p3['nums']}) == [4.0] and {e.dxf.get('color', 256) for e in p3['nums']} == {1} and nap_ids and all(e.dxf.style == 'G-ESAA BOLD' and e.dxf.get('color', 256) == 4 for e in nap_ids)
              and p3['doc'].styles.get('G-ESAA BOLD').dxf.font == 'arialbd.ttf' and any(t[0] == 'NAP-0001' and t[1] == '#00ffff' and t[2] == '800' for t in st['svgText']) and 'Numbers: red, 4 m high' in rd3,
              (st['pl'], len(nap_ids), [(e.dxf.style, e.dxf.get('color', 256)) for e in nap_ids[:3]], [l for l in rd3.splitlines() if l.startswith('Drawing style')]))
        # 4. several drawings in one export
        async def sets(pg):  # v2.42.14: three more drawings added in the DXF card: every point with photos and numbers; electric poles, numbers; PLDT, numbers
            # (v2.42.28: set as the table does: the same four drawings; the PLDT one twice)
            await pg.evaluate("__polecam.setDxfRows([{ pts: ['PLDT'], mode: 'num' }, { pts: ['*'], mode: 'both' }, { pts: ['ELEC'], mode: 'num' }, { pts: ['PLDT'], mode: 'num' }])"); await W(pg, 300)
        f4, toast4 = await export(pg, 'doDxf', 'plan_sets.zip', sets)
        P4, jp4, rd4, names4 = plans(f4)
        dx = sorted(P4)
        both = next((v for k, v in P4.items() if k.endswith('_ALL_PHOTOS_NUMBERS.dxf')), None); elec = next((v for k, v in P4.items() if k.endswith('_ELECTRIC_POLES_NUMBERS.dxf')), None); pl = next((v for k, v in P4.items() if k.endswith('_PLDT_POLES_NUMBERS_2.dxf')), None); sel = next((v for k, v in P4.items() if k.endswith('_PLDT_POLES_NUMBERS.dxf')), None)  # v2.42.14: the Drawing's row (PLDT, numbers) and its twin (_2)
        check(f'4. DRAWINGS IN THIS EXPORT: 4 DXFs in one ZIP (the Drawing\'s choice, every point with photos and numbers, only electric poles {n_el}, only PLDT 12), the photos once; the both-mode DXF has a number on each photo; the README lists each drawing',
              len(dx) == 4 and both and elec and pl and sel and len(both['imgs']) >= n_all - 3 and len(both['mnums']) == len(both['imgs']) and len(elec['nums']) == n_el and not elec['imgs'] and len(pl['nums']) == n_pl
              and len(jp4) >= n_all - 3 and len(set(jp4)) == len(jp4) and '4 plan drawings' in rd4 and rd4.count('Numbers on the plan in ') == 4 and 'Plan: 4 drawings' in toast4,
              (dx, len(both['imgs']) if both else None, len(both['mnums']) if both else None, len(elec['nums']) if elec else None, len(pl['nums']) if pl else None, len(jp4), toast4, rd4.splitlines()[:6]))
        # 5. the ODC cabinet; the vicinity circle
        msp = list(P4.values())[0]['msp']; doc4 = list(P4.values())[0]['doc']
        odc_ly = [e for e in msp if e.dxf.layer in ('G-ESAA PROPOSED ODC', 'G-ESAA EXISTING ODC')]
        lcp_ins = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name in ('proposed LCP', 'existing LCP', 'LCP 2', 'EXISTING DOUBLE LCP')]
        vic = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and e.dxf.layer == 'G-ESAA VICINITY' and e.closed and len(e) == 2]
        check('5. the ODC is drawn with G-eSAA\'s ODC block (an isometric view of the cabinet: plinth, body, two doors, cap, ODC on its plate) on layer G-ESAA … ODC, not with an LCP model (the sample has no LCP); the vicinity map\'s PROJECT AREA circle is yellow',
              others.get('ODC', 0) and [e for e in odc_ly if e.dxftype() == 'INSERT' and e.dxf.name == 'G-ESAA ODC'] and any(e.dxftype() == 'TEXT' and e.dxf.text == 'ODC' for e in doc4.blocks.get('G-ESAA ODC')) and len([e for e in doc4.blocks.get('G-ESAA ODC') if e.dxftype() == 'LWPOLYLINE']) >= 9 and not lcp_ins and vic and vic[0].dxf.get('color', 256) == 2,
              (len(odc_ly), len(lcp_ins), [v.dxf.get('color', 256) for v in vic][:3]))
        # 6. the Export screen
        await open_card(pg, 'doKmz')
        x1 = await pg.evaluate("""() => ({ fmt: !!document.getElementById('xFormat'), ticks: [...document.querySelectorAll('#xMultiList input')].map((c) => [c.value, c.checked]),
          shown: [...document.querySelectorAll('#export .xcard:not(.xoff)')].map((c) => c.querySelector('button[id^=do]').id), ownBtn: document.getElementById('doKmz').getClientRects().length > 0, go: !document.getElementById('xGoBox').hidden })""")
        await pg.check('#xMultiList input[value="doCsv"]'); await W(pg, 300)
        x2 = await pg.evaluate("""() => ({ shown: [...document.querySelectorAll('#export .xcard:not(.xoff)')].map((c) => c.querySelector('button[id^=do]').id), btns: ['doKmz', 'doCsv'].map((id) => document.getElementById(id).getClientRects().length > 0), go: !document.getElementById('xGoBox').hidden, label: document.getElementById('xMultiGo').textContent })""")
        await pg.screenshot(path=OUT + '/export_two.png', full_page=False)
        check('6. Export: no Format dropdown; FORMATS ticks: one (KMZ) shows its card and its button; two (KMZ, CSV) show both cards without their own buttons and one "Export 2 formats (one ZIP)"; no page errors',
              not x1['fmt'] and x1['shown'] == ['doKmz'] and x1['ownBtn'] and not x1['go'] and sorted(x2['shown']) == ['doCsv', 'doKmz'] and x2['btns'] == [False, False] and x2['go'] and x2['label'] == 'Export 2 formats (one ZIP)' and not errs,
              (x1, x2, errs[:3]))
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
