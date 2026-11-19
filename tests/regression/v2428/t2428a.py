"""v2.42.8: the plan DXF for AutoCAD, through the app, on the 10 km sample with its photos (the company template: the private seed).
 1. Export DXF (every point with photos): the ZIP holds the DXF, VICINITY_MAP.jpg and the photos, all at the top with plain names;
    every IMAGEDEF names a file of the ZIP; the README says File > Open after unzipping (not drag)
 2. check_plan.py: no problem (one *Active VPORT, no AcDbXrecord, no REGION / MULTILEADER / GEODATA, pointers, SORTENTSTABLE,
    images, MTEXT widths, no old project text, placement within 2 km, extents and opening view); CRLF
 3. ezdxf recover + audit: no error and nothing to fix
 4. the cleanup is idempotent on the export: GeDxfTpl.clean and .repair give the same bytes
 5. every NAP symbol's insertion point is on its symbol (within 100 m of where it is drawn), inside the plan
 6. the legend / ROW / PMI tables lie below everything of the plan and end at the grid's right edge (or start at its left edge when
    wider than the grid); the legend's MTEXT widths are real (UPDATED LEGENDS on one line)
 7. Numbers only: no pole photo in the ZIP; check_plan.py no problem
 8. the tutorial has the File > Open step; no page errors"""
import asyncio, sys, os, shutil, json, zipfile, time, urllib.parse, io, re, collections, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from playwright.async_api import async_playwright
import ezdxf
BASE = os.environ.get('BASE', 'http://localhost:8765')
D = S + '/v2428'; OUT = D + '/out_e2e'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
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

CHECK = S + '/v2428/wk/tools/dxf-seed/check_plan.py'
import subprocess
from ezdxf import recover
def node_idem(path):
    js = "const T=require(process.env.GESAA_APP + '/dxftpl.js'),fs=require('fs');const t=fs.readFileSync(process.argv[1],'utf8');const d=new T.Doc(t);const l=T.clean(d);const r=T.repair(t);console.log(JSON.stringify({clean:d.text()===t,repair:r.text===t,log:l,rlog:r.report.cleanup}))"
    return json.loads(subprocess.run(['node', '-e', js, path], capture_output=True, text=True).stdout)

async def main():
    z = zipfile.ZipFile(FILE); data = json.loads(z.read('p1/points.json')); pts = data['points']
    by_type = collections.Counter(p['poleType'] for p in pts if p['element'] == 'Pole')
    others = collections.Counter(p['element'] for p in pts if p['element'] not in ('Pole', 'NAP', 'Closure'))
    pldt = sorted(p['poleId'] for p in pts if p.get('poleType') == 'PLDT')
    n_el = by_type['Concrete'] + by_type['Wood'] + by_type['Steel']
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
        # 1. every point with photos
        async def photos(pg):
            await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'photo' }], 0)"); await W(pg, 200)  # v2.42.14: the drawings as rows
        f1, toast1 = await export(pg, 'doDxf', 'plan_photos.zip', photos)
        z = zipfile.ZipFile(f1); names = z.namelist(); dxfn = [n for n in names if n.endswith('.dxf')]
        txt = z.read(dxfn[0]).decode('utf-8'); dpath = OUT + '/plan_photos.dxf'; open(dpath, 'w', encoding='utf-8', newline='').write(txt)
        readme = z.read('README.txt').decode('utf-8', 'replace')
        defs = re.findall(r'\r\n  0\r\nIMAGEDEF\r\n(?:.*\r\n)*?  1\r\n(.*)\r\n', txt)
        jpg = [n for n in names if n.lower().endswith('.jpg')]
        check('1. Export DXF (every point with photos): one DXF, VICINITY_MAP.jpg and the photos at the top of the ZIP with plain names; every IMAGEDEF names a file of the ZIP; the README says File > Open after unzipping, not drag',
              len(dxfn) == 1 and 'VICINITY_MAP.jpg' in names and len(jpg) > 100 and not [n for n in names if '/' in n or '\\' in n] and defs and all(d in names for d in defs)
              and 'File > Open' in readme and 'Do not drag the DXF' in readme, (dxfn, len(jpg), len(defs), [d for d in defs if d not in names][:3], [l for l in readme.splitlines() if 'File > Open' in l][:1]))
        # 2. the AutoCAD list
        r2 = subprocess.run(['python3', '-I', CHECK, dpath], capture_output=True, text=True)
        check('2. check_plan.py: no problem; CRLF line ends', r2.returncode == 0 and 'no problems' in r2.stdout and txt.count('\n') == txt.count('\r\n'), r2.stdout[-1500:])
        # 3. ezdxf
        doc, aud = recover.readfile(dpath); a2 = doc.audit()
        check('3. ezdxf recover + audit: no error and nothing to fix', not aud.errors and not aud.fixes and not a2.errors and not a2.fixes, ([(e.code, e.message[:80]) for e in list(aud.errors)[:3] + list(aud.fixes)[:3] + list(a2.errors)[:3] + list(a2.fixes)[:3]]))
        # 4. idempotent
        idem = node_idem(dpath)
        check('4. the cleanup is idempotent on the export (clean and repair give the same bytes)', idem['clean'] and idem['repair'] and not idem['log'], idem)
        # 5. the NAP symbols on their insertion points
        msp = doc.modelspace(); from ezdxf import bbox as _bb
        naps = [e for e in msp if e.dxftype() == 'INSERT' and 'NAP' in e.dxf.layer.upper()]
        far = []
        for e in naps:
            b = _bb.extents([e], fast=True)
            if not b.has_data: continue
            c = b.center; d = math.hypot(c.x - e.dxf.insert.x, c.y - e.dxf.insert.y)
            if d > 100: far.append((e.dxf.handle, e.dxf.name, round(d, 1)))
        check(f'5. every NAP symbol ({len(naps)}) has its insertion point on it (within 100 m of where it is drawn; they were up to 28,000 km away)', naps and not far, far[:6])
        # 6. the tables below the plan, at the grid's right edge
        grid = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and e.dxf.layer == 'GRIDS']
        gb = _bb.extents(grid); seed_h = SEED_H
        legend = [e for e in msp if e.dxftype() == 'MTEXT' and 'LEGENDS' in e.plain_text().replace('\n', ' ')]
        mine = [e for e in msp if e.dxf.handle not in seed_h and e.dxf.layer not in ('GRIDS',) and not e.dxf.layer.upper().startswith('G-ESAA VICINITY')]
        tables = [e for e in msp if e.dxf.handle in seed_h]
        pb = _bb.extents(mine, fast=True); tb = _bb.extents(tables, fast=True)
        wide = tb.extmax.x - tb.extmin.x > gb.extmax.x - gb.extmin.x
        okx = abs(tb.extmin.x - gb.extmin.x) < 300 if wide else tb.extmax.x <= gb.extmax.x + 300
        ul = [e for e in legend if 'UPDATED' in e.plain_text()]
        check('6. the legend, ROW and PMI tables lie below everything of the plan, ending at the grid\'s right edge (or from its left edge when wider); UPDATED LEGENDS has its real width (not one letter per line)',
              tb.extmax.y < pb.extmin.y and okx and ul and all(e.dxf.get('width', 0) == 0 or e.dxf.width > 5 * e.dxf.char_height for e in ul),
              (round(tb.extmax.y), round(pb.extmin.y), [round(v) for v in (tb.extmin.x, tb.extmax.x, gb.extmin.x, gb.extmax.x)], wide, [(round(e.dxf.get('width', 0), 1), round(e.dxf.char_height, 1)) for e in ul]))
        # 7. numbers only
        async def nums(pg):
            await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }], 0)"); await W(pg, 200)  # v2.42.14: the drawings as rows
        f7, _ = await export(pg, 'doDxf', 'plan_numbers.zip', nums)
        z7 = zipfile.ZipFile(f7); n7 = z7.namelist(); d7 = [n for n in n7 if n.endswith('.dxf')][0]; p7 = OUT + '/plan_numbers.dxf'
        open(p7, 'w', encoding='utf-8', newline='').write(z7.read(d7).decode('utf-8'))
        r7 = subprocess.run(['python3', '-I', CHECK, p7], capture_output=True, text=True)
        ph7 = [n for n in n7 if n.lower().endswith('.jpg') and not n.startswith(('VICINITY', 'COMPANY_LOGO'))]
        check('7. Numbers only: no pole photo in the ZIP (a lighter file); check_plan.py no problem', not ph7 and r7.returncode == 0, (n7[:6], r7.stdout[-600:]))
        # 8. the tutorial
        tut = open(APP + '/tutorial.js', encoding='utf-8').read().split("id: 'plandxf'")[1].split("id: 'boq'")[0]
        check('8. the tutorial (Plan DXF on the company template) says unzip, then File → Open, not drag; no page errors', tut and 'File → Open' in tut and 'Do not drag the DXF' in tut and not errs, errs[:3])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
