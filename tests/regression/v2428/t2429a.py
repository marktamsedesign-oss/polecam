"""v2.42.9: the plan's sheets as a PDF, and the MTEXT AutoCAD turned. On the 10 km sample with its photos (the private seed).
 1. the DXF card: "Also the sheets as a PDF" ticked (kept in the settings); Export DXF: the ZIP has <name>_SHEETS.pdf beside the DXF,
    the README names it
 2. the PDF: one A3 page per sheet of the DXF (32), in the tab order; the photos and the vicinity map in it as pictures
 3. its texts: the cover's DETAILED DESIGN DRAWINGS, the legend's descriptions, the title block (GEOGRAPHICAL PLAN, the date, n OF 25),
    the PMI table, pole IDs
 4. the DXF: check_plan.py no problem (with: no MTEXT whose embedded object has its direction and insertion swapped); ezdxf audit clean
 5. the title block: the index keys fit their cells, the date on one line (its box as wide as the date); the Exported by line after
    the CONFIDENTIAL line; no page errors"""
import asyncio, sys, os, shutil, json, zipfile, time, urllib.parse, io, re, collections, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from playwright.async_api import async_playwright
import ezdxf
BASE = os.environ.get('BASE', 'http://localhost:8765')
D = S + '/v2428'; OUT = D + '/out_pdf'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
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
        await open_card(pg, 'doDxf')
        await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'photo' }], 0)"); await W(pg, 200)  # v2.42.14: the drawings as rows
        await pg.check('#dxfPdf'); await W(pg, 300)
        kept = await pg.evaluate("__polecam.S.exp.dxfPdf")
        toast = await run_export(pg, 'doDxf'); f1 = await save(pg, 'plan_pdf.zip'); await close_sheets(pg)
        z = zipfile.ZipFile(f1); names = z.namelist(); dxfn = [n for n in names if n.endswith('.dxf')][0]; pdfn = [n for n in names if n.endswith('_SHEETS.pdf')]
        readme = z.read('README.txt').decode('utf-8', 'replace')
        check('1. "Also the sheets as a PDF" ticked and kept; the ZIP has <name>_SHEETS.pdf beside the DXF; the README names it', kept is True and pdfn == [dxfn.replace('.dxf', '_SHEETS.pdf')] and pdfn[0] in readme, (kept, pdfn, [l for l in readme.splitlines() if 'SHEETS.pdf' in l][:1]))
        pp = OUT + '/sheets.pdf'; open(pp, 'wb').write(z.read(pdfn[0])); dp = OUT + '/plan.dxf'; open(dp, 'wb').write(z.read(dxfn))
        info = subprocess.run(['pdfinfo', pp], capture_output=True, text=True).stdout
        pages = int(re.search(r'Pages:\s+(\d+)', info).group(1)); size = re.search(r'Page size:\s+(.*)', info).group(1)
        imgs = subprocess.run(['pdfimages', '-list', pp], capture_output=True, text=True).stdout.splitlines()[2:]
        doc = ezdxf.readfile(dp); lays = [l for l in doc.layouts.names_in_taborder() if l != 'Model']
        jpgs = [n for n in names if n.lower().endswith('.jpg')]
        check(f'2. the PDF: one A3 page per sheet ({len(lays)}), the photos and the vicinity map in it as pictures', pages == len(lays) == 32 and 'A3' in size and len({l.split()[1] for l in imgs if l.split()}) >= 1 and len(imgs) >= len(jpgs), (pages, len(lays), size, len(imgs), len(jpgs)))
        txt = subprocess.run(['pdftotext', '-layout', pp, '-'], capture_output=True, text=True).stdout
        pg_txt = txt.split('\f')
        want = ['DETAILED DESIGN DRAWINGS', 'TABLE OF CONTENTS', 'LEGEND', '10 PIN ALLEY ARM', 'GEOGRAPHICAL PLAN', 'PROJECT MANAGEMENT INFORMATION TABLE', 'RIGHT OF WAY AREA COVERAGE', '1 OF 25', 'CC']
        miss = [w for w in want if w not in txt]
        check('3. its texts: the cover, the table of contents, the legend\'s descriptions, the title block (GEOGRAPHICAL PLAN, 1 OF 25), the PMI and ROW tables, pole IDs', not miss and pg_txt[0].count('DETAILED DESIGN DRAWINGS') == 1, (miss, len(pg_txt)))
        r4 = subprocess.run(['python3', '-I', CHECK, dp], capture_output=True, text=True)
        a4, au = recover.readfile(dp); b4 = a4.audit()
        check('4. the DXF: check_plan.py no problem (no MTEXT with its embedded object\'s direction and insertion swapped); ezdxf audit clean', r4.returncode == 0 and not au.errors and not au.fixes and not b4.errors and not b4.fixes, r4.stdout[-900:])
        geo = doc.layouts.get('GEO'); tb = [e for e in geo if e.dxftype() in ('TEXT', 'MTEXT')]
        idx = [e for e in tb if e.dxftype() == 'TEXT' and re.fullmatch(r'[A-Z]{1,2}-\d+', e.dxf.text or '')]
        date = [e for e in tb if e.dxftype() == 'MTEXT' and re.search(r'\b20\d\d\b', e.plain_text()) and ',' in e.plain_text()]
        exp = [e for e in tb if e.dxftype() == 'MTEXT' and 'Exported by' in e.plain_text()]
        fits = all(len(e.dxf.text) * e.dxf.height * 0.75 <= 12.2 for e in idx)
        dwide = all(e.dxf.width == 0 or e.dxf.width >= len(e.plain_text()) * e.dxf.char_height * 0.8 for e in date)
        check('5. the title block: the index keys fit their cells, the date\'s box as wide as the date (one line), the Exported by line after the CONFIDENTIAL line; no page errors',
              idx and fits and date and dwide and exp and all(abs(e.dxf.insert.x - 6508) < 0.01 for e in exp) and not errs,
              ([(e.dxf.text, round(e.dxf.height, 2)) for e in idx][:4], [(e.plain_text(), round(e.dxf.width, 1)) for e in date][:2], [round(e.dxf.insert.x, 1) for e in exp][:2], errs[:3]))
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
