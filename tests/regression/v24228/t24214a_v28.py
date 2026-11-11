"""(v2.42.28 copy: the drawings are ticks of What to export on the Drawing.)
v2.42.14: the drawings of an export as rows (DXF card → DRAWINGS IN THIS EXPORT): each its points (every point, or groups:
electric poles, PLDT, Globe…, sites…) and what goes beside them (photos, numbers, both); the other points nothing. 10 km sample.
 1. the old choice (As set in the Drawing + Only PLDT · numbers) becomes rows once: Every point · photos, PLDT poles · numbers
 2. + Add a drawing; on it, Electric poles (one tap from Every point: that group only), Photos with their numbers: its line says so
 3. Preview opens the Drawing on that drawing: the drawing chooser shows it, Photos + no., Only electric, the preview numbers the
    electric poles only; Numbers chosen there changes that drawing in the card, then back to Photos + no.
 4. Export: one ZIP, one DXF a drawing (…_ALL_PHOTOS, …_PLDT_POLES_NUMBERS, …_ELECTRIC_POLES_PHOTOS_NUMBERS); in the electric one,
    a photo and a number on each electric pole and on no other pole (no Globe, PLDT); the README names each drawing
 5. Remove a drawing; no page errors"""
import asyncio, sys, os, shutil, json, zipfile, time, urllib.parse, io, re, collections, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from playwright.async_api import async_playwright
import ezdxf
BASE = os.environ.get('BASE', 'http://localhost:8765')
D = S + '/v2428'; OUT = S + '/v24228/out_214a_v28'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
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

CHECK = S + '/v24212/wk/tools/dxf-seed/check_plan.py'
import subprocess
from ezdxf import recover
def node_idem(path):
    js = "const T=require(process.env.GESAA_APP + '/dxftpl.js'),fs=require('fs');const t=fs.readFileSync(process.argv[1],'utf8');const d=new T.Doc(t);const l=T.clean(d);const r=T.repair(t);console.log(JSON.stringify({clean:d.text()===t,repair:r.text===t,log:l,rlog:r.report.cleanup}))"
    return json.loads(subprocess.run(['node', '-e', js, path], capture_output=True, text=True).stdout)



async def main():
    z = zipfile.ZipFile(FILE); data = json.loads(z.read('p1/points.json')); pts = data['points']
    by_type = collections.Counter(p['poleType'] for p in pts if p['element'] == 'Pole')
    def mkey(p):  # v2.42.15: by owner, as the project management table (a proposed pole: Globe's; an existing pole by its BOQ owner, else its type)
        if p['element'] != 'Pole': return None
        if p.get('status') in ('Proposed', 'New'): return 'GT'
        t = {'Concrete': 'CC', 'Wood': 'WP', 'Steel': 'SP', 'Globe': 'GT', 'Bayantel': 'BT', 'PLDT': 'PLDT'}.get(p['poleType'], '')
        if t == 'GT': return 'GT'
        o = ((p.get('boq') or {}).get('owner') or '').strip()
        if o:
            if re.search('electric|coop|power', o, re.I): return 'ELEC'
            if re.search('globe', o, re.I): return 'GT'
            return re.sub('[^A-Z0-9]+', '', o.upper())
        return 'ELEC' if t in ('CC', 'WP', 'SP') else (t or '_none')
    grp = collections.Counter(mkey(p) for p in pts if p['element'] == 'Pole'); n_el = grp['ELEC']; n_pldt = grp['PLDT']
    not_el = {p['poleId'] for p in pts if p['element'] == 'Pole' and mkey(p) != 'ELEC'}  # Globe, the proposed, PLDT and Converge poles (also concrete ones owned by PLDT / Converge)
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
        await pg.set_input_files('#sharedInput', FILE); await pg.wait_for_selector('#askBox:not([hidden])', timeout=600000)
        for _ in range(4):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            await pg.locator('#askBox button.primary').first.click(); await W(pg, 700)
        await idle(pg); await W(pg, 1500)
        # the choice of an older G-eSAA (the Drawing: photos, every point; ticked: As set in the Drawing + Only PLDT · numbers)
        await pg.evaluate("() => { const E = __polecam.S.exp; E.dxfRows = null; E.dxfSets = ['sel', 'g:PLDT:num']; E.dxfMarks = 'photo'; E.dxfNoMarkBy = {}; __polecam.persist(); }")
        await pg.reload(); await W(pg, 2500)
        await open_card(pg, 'doDxf')
        # v2.42.28: the drawings are ticks of What to export (the Drawing); the DXF card lists them
        rows = lambda: pg.evaluate("__polecam.dxfRows().map((r) => ({ on: r.pts, mode: r.mode }))")
        card = lambda: pg.evaluate("[...document.querySelectorAll('#dxfFiles .dxffile > span:nth-child(2)')].map((c) => c.textContent)")
        r1 = await rows(); c1 = await card()
        check('1. the older choice becomes ticks once: Every point · Photo; PLDT poles · Number (the DXF card lists them)', [(r['on'], r['mode']) for r in r1] == [(['*'], 'photo'), (['PLDT'], 'num')] and c1 == ['Every point', f'PLDT poles {n_pldt}'], (r1, c1))
        async def tick(nm, md):
            gi = await pg.evaluate("(n) => __polecam.mxGroups().findIndex((x) => x.name === n)", nm); await pg.click(f'#mxGrid .mxc[data-g="{gi}"][data-m="{md}"]'); await W(pg, 400)
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 2500); await pg.evaluate("__polecam.setWhat(true)"); await W(pg, 300)
        await tick('Electric poles', 'both')
        if await pg.locator('#askBox:not([hidden])').count(): await pg.click('#askBox button:text-is("Whole project")'); await W(pg, 300)
        r2 = await rows()
        check('2. Electric poles · Both ticked: a third drawing, in the table\'s order (Every point, Electric, PLDT)', [(r['on'], r['mode']) for r in r2] == [(['*'], 'photo'), (['ELEC'], 'both'), (['PLDT'], 'num')], r2)
        for _ in range(40):
            seq = await pg.evaluate("__polecam.drwSeq()")
            if seq and seq['n'] == n_el: break
            await W(pg, 250)
        d3 = await pg.evaluate("({ pill: document.getElementById('drawPvT').textContent, sel: __polecam.S.exp.dxfRowSel, seq: __polecam.drwSeq() })")
        await pg.screenshot(path=OUT + '/drawing_row3.png')
        await tick('Electric poles', 'num'); r3a = await rows(); await tick('Electric poles', 'num'); r3b = await rows()
        await pg.evaluate("__polecam.setWhat(false)"); await W(pg, 200)
        await pg.click('#drawDxf'); await W(pg, 900); c3 = await card()
        check('3. the Drawing shows the drawing ticked last (2/3 Electric poles · Both), the preview numbers the electric poles only; Number ticked adds a drawing, unticked takes it out; Export lists the three',
              d3['pill'] == '2/3Electric poles · Both' and d3['sel'] == 1 and d3['seq'] and d3['seq']['n'] == n_el and len(r3a) == 4 and len(r3b) == 3 and c3 == ['Every point', f'Electric poles {n_el}', f'PLDT poles {n_pldt}'], (d3, len(r3a), len(r3b), c3))
        await pg.screenshot(path=OUT + '/dxf_card_rows.png', full_page=False)
        await pg.evaluate("__polecam.setNumCfg({ mode: 'owner', keep: false })") # v2.42.18: the numbers are the CSV's; per pole owner, the electric poles are 1 … 163
        toast = await run_export(pg, 'doDxf'); f1 = await save(pg, 'plan_rows.zip'); await close_sheets(pg)
        zz = zipfile.ZipFile(f1); names = zz.namelist(); dx = sorted(n for n in names if n.endswith('.dxf')); readme = zz.read('README.txt').decode('utf-8', 'replace')
        el = [n for n in dx if n.endswith('_ELECTRIC_POLES_PHOTOS_NUMBERS.dxf')]
        info = {}
        if el:
            t = zz.read(el[0]).decode('utf-8', 'replace').replace('\r\n', '\n').split('\n')
            files = [t[i + 1].strip() for i in range(len(t) - 1) if t[i].strip() == '1' and t[i + 1].strip().lower().endswith('.jpg') and not t[i + 1].strip().startswith(('VICINITY', 'COMPANY'))]
            doc = ezdxf.read(io.StringIO('\n'.join(t))); msp = [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
            imgs = [e for e in msp if e.dxftype() == 'IMAGE' and e.dxf.layer == 'G-ESAA POLE PHOTO']
            mn = [e for e in msp if e.dxftype() == 'MTEXT' and e.dxf.layer == 'p-pole' and re.fullmatch(r'\d+', e.plain_text().strip())]
            tn = [e for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer == 'p-pole' and re.fullmatch(r'\d+', e.dxf.text or '') and e.dxf.get('color', 256) != 250]
            bad = [f for f in files if re.sub(r'(_\d+)?\.jpg$', '', f) in not_el]  # (a photo of a pole that is not the power company's)
            info = {'files': len(files), 'bad': bad[:5], 'imgs': len(imgs), 'mnums': len(mn), 'tnums': len(tn), 'max': max([int(e.plain_text()) for e in mn] + [int(e.dxf.text) for e in tn] + [0])}
        check(f'4. one ZIP, a DXF a drawing (ALL_PHOTOS, PLDT_POLES_NUMBERS, ELECTRIC_POLES_PHOTOS_NUMBERS); in the electric one a photo and a number on each of the {n_el} electric poles and none on a pole of Globe (also the proposed), PLDT or Converge, whatever its material; the README names each drawing',
              len(dx) == 3 and any(n.endswith('_ALL_PHOTOS.dxf') for n in dx) and any(n.endswith('_PLDT_POLES_NUMBERS.dxf') for n in dx) and el and info['files'] > 0 and not info['bad'] and info['imgs'] + info['tnums'] == n_el and info['mnums'] == info['imgs'] and info['max'] == n_el
              and '3 plan drawings' in readme and "only Electric poles (the power company's)" in readme, (dx, info, [l for l in readme.splitlines() if 'drawing' in l.lower()][:6]))
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 2000); await pg.evaluate("__polecam.setWhat(true)"); await W(pg, 300)
        await tick('Every point', 'photo'); r5 = await rows()
        check('5. Every point · Photo unticked: the other drawings stay; no page errors', [(r['on'], r['mode']) for r in r5] == [(['ELEC'], 'both'), (['PLDT'], 'num')] and not errs, (r5, errs[:3]))
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
