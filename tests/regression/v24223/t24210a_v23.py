"""v2.42.9 / v2.42.10 / v2.42.11 (10: the street names black, slanted; the tower's name smaller, covering nothing): the plan's sheets as a PDF, the MTEXT AutoCAD turned or laid out from its corner, and the plan's details. On the 10 km sample with its photos (the private seed).
 1. the DXF card: "Also the sheets as a PDF" ticked (kept in the settings); Export DXF: the ZIP has <name>_SHEETS.pdf beside the DXF,
    the README names it
 2. the PDF: one A3 page per sheet of the DXF (32), in the tab order; the photos and the vicinity map in it as pictures
 3. its texts: the cover's DETAILED DESIGN DRAWINGS, the legend's descriptions, the title block (GEOGRAPHICAL PLAN, the date, n OF 25),
    the PMI table, pole IDs
 4. the DXF: check_plan.py no problem (with: no MTEXT whose embedded object has its direction and insertion swapped); ezdxf audit clean
 5. the title block: the index keys fit their cells, the date on one line (its box as wide as the date); the Exported by line after
    the CONFIDENTIAL line; no page errors
 6. (v2.42.10) the cover's cable list and the PMI / ROW titles: no embedded object left (AutoCAD laid them out from their corner),
    the cable list's box not widened (it wraps); no font AutoCAD may not have (the table of contents in Arial bold)
 7. the vicinity map: the aerial route a red broken line with dashes about 3 times its width on the sheet, underground solid red
 8. the keymap: each cell's name large in its centre over a dark shadow, on a layer frozen on the GEO sheets; the small corner names
    frozen on the keymap
 9. the cable's name on every GEO sheet the route crosses (25 m or more of it); the site's name inside its GEO sheet; the names of
    places 2 m high at most"""
import asyncio, sys, os, shutil, json, zipfile, time, urllib.parse, io, re, collections, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from playwright.async_api import async_playwright
import ezdxf
BASE = os.environ.get('BASE', 'http://localhost:8765')
D = S + '/v2428'; OUT = S + '/v24223/out_24210'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
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
        # 6. the cover, the titles, the fonts
        allm = [e for e in doc.entitydb.values() if e.dxftype() == 'MTEXT']
        def raw_has_emb(h):
            return False
        txtraw = open(dp, encoding='utf-8', newline='').read()
        recs = txtraw.split('\r\n  0\r\n')
        emb = [r for r in recs if r.startswith('MTEXT\r\n') and '\r\n101\r\nEmbedded Object' in r]
        cab = [e for e in allm if 'FIGURE 8 FOC' in e.plain_text() and e.dxf.char_height > 100]
        fonts = [(st.dxf.name, st.dxf.font) for st in doc.styles]
        badf = [f for f in fonts if re.search(r'vinet|swisscbo|simsun|sasb|hand1|superos', f[1] or '', re.I)]
        bold = doc.styles.get('BOLD')
        tocw = [e.dxf.width for e in doc.layouts.get('TOC') if e.dxftype() == 'TEXT' and e.dxf.style == 'BOLD' and e.dxf.text in ('PROJECT MANAGEMENT INFORMATION', 'COVER PAGE', 'TOTAL')] # (the condensed font's texts narrowed: 0.95 x 0.78)
        check('6. the cover\'s cable list and the PMI / ROW titles: no embedded object left; the cable list\'s box not widened (it wraps); no font AutoCAD may not have (the table of contents in Arial bold, narrowed to the condensed font\'s width)',
              not emb and cab and all(abs(e.dxf.width - 12666.76) < 1 for e in cab) and not badf and bold and bold.dxf.font.lower() == 'arialbd.ttf' and abs(bold.dxf.width - 0.78) < 1e-6 and tocw and all(abs(w - 0.741) < 1e-3 for w in tocw), (len(emb), [round(e.dxf.width) for e in cab], badf[:4], bold and (bold.dxf.font, bold.dxf.width), tocw[:3]))
        # 7. the vicinity route
        msp = doc.modelspace()
        vr = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and e.dxf.layer == 'G-ESAA VICINITY' and e.dxf.get('const_width', 0) > 0 and e.dxf.get('color', 256) in (1, 5)]
        vic = doc.layouts.get('VICINITY MAP'); vvp = sorted([v for v in vic.query('VIEWPORT')][1:], key=lambda v: -v.dxf.width * v.dxf.height)[0]
        kv = vvp.dxf.height / vvp.dxf.view_height
        ae = [e for e in vr if e.dxf.get('linetype', 'BYLAYER') == 'DASHED']; ug = [e for e in vr if e.dxf.get('linetype', 'BYLAYER') != 'DASHED']
        ratios = [e.dxf.get('ltscale', 1) * 0.5 / (e.dxf.const_width * kv) for e in ae]
        check('7. the vicinity map: the aerial route a red broken line, its dashes about 3 times its width on the sheet; underground solid red',
              ae and all(2.5 < q < 3.5 for q in ratios) and all(e.dxf.get('color', 256) == 1 for e in ae + ug), (len(ae), len(ug), [round(q, 2) for q in ratios][:4]))
        # 8. the keymap
        km = [e for e in msp if e.dxf.layer == 'G-ESAA KEYMAP GRID' and e.dxftype() == 'MTEXT']
        cells = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and e.dxf.layer == 'GRIDS']
        kml = doc.layers.get('G-ESAA KEYMAP GRID'); grl = doc.layers.get('GRIDNO.')
        def bigvp(name):
            L = doc.layouts.get(name); vs = [v for v in L.query('VIEWPORT')][1:]; return sorted(vs, key=lambda v: -v.dxf.width * v.dxf.height)[0]
        frz = lambda v: set(v.frozen_layers) if hasattr(v, 'frozen_layers') else set()
        geo_ok = all('G-ESAA KEYMAP GRID' in frz(bigvp(n)) for n in [l for l in doc.layouts.names() if re.fullmatch(r'GEO( \(\d+\))?', l)])
        km_ok = 'GRIDNO.' in frz(bigvp('KEYMAP')) and 'G-ESAA KEYMAP GRID' not in frz(bigvp('KEYMAP'))
        cols = sorted({e.dxf.get('color', 256) for e in km})
        check('8. the keymap: each cell\'s name large in its centre over a dark shadow (2 texts a cell), on a layer frozen on the GEO sheets; the small corner names frozen on the keymap',
              len(km) == 2 * len(cells) and cols == [2, 250] and geo_ok and km_ok, (len(km), len(cells), cols, geo_ok, km_ok))
        # 9. cable names, the site's name, the places' names
        names = [e for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer in ('MISC', 'G-ESAA CABLE LABEL') and re.match(r'PROPOSED|EXISTING', e.dxf.text or '')] # (v2.42.23: its own labels, or its long name where it has none)
        dup = [e.dxf.text for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer == 'MISC' and re.match(r'PROPOSED|EXISTING', e.dxf.text or '')]
        runs = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and re.search(r'FOC|CABLE|FIBER', e.dxf.layer, re.I) and e.dxf.get('color', 256) != 7]
        miss = []
        for nm in [l for l in doc.layouts.names() if re.fullmatch(r'GEO( \(\d+\))?', l)]:
            v = bigvp(nm); c = v.dxf.view_center_point; h = v.dxf.view_height; w = h * v.dxf.width / v.dxf.height; Wn = (c.x - w / 2, c.y - h / 2, c.x + w / 2, c.y + h / 2)
            if not [e for e in names if Wn[0] <= e.dxf.insert.x <= Wn[2] and Wn[1] <= e.dxf.insert.y <= Wn[3]]: miss.append(nm)
        site = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name in ('X-BTS', 'G-ESAA P-BTS')]
        out = []; cellb = [(min(p[0] for p in e.get_points('xy')), min(p[1] for p in e.get_points('xy')), max(p[0] for p in e.get_points('xy')), max(p[1] for p in e.get_points('xy'))) for e in cells]
        for s0 in site:
            x, y = s0.dxf.insert.x, s0.dxf.insert.y; cb = next((b for b in cellb if b[0] <= x <= b[2] and b[1] <= y <= b[3]), None)
            for a in s0.attribs:
                if not a.dxf.text or not cb: continue
                ha = a.dxf.get('halign', 0); va = a.dxf.get('valign', 0); ax = (a.dxf.align_point.x if (ha or va) else a.dxf.insert.x); w = len(a.dxf.text) * a.dxf.height * 0.95
                lo, hi = (ax, ax + w) if ha == 0 else (ax - w / 2, ax + w / 2) if ha in (1, 4) else (ax - w, ax)
                out.append((a.dxf.text, cb[0] <= lo and hi <= cb[2]))
        pois = [e for e in msp if e.dxftype() == 'MTEXT' and e.dxf.layer in ('House Number', 'MISC') and e.dxf.style == 'PDF Arial' and e.dxf.handle not in SEED_H] # (the template's own sample)
        check('9. (v2.42.23) the cable named on every GEO sheet the route crosses (its own labels there, its long name only where it has none); the site\'s name kept inside its sheet; the places\' names 2 m high at most',
              not miss and out and all(o[1] for o in out) and pois and max(e.dxf.char_height for e in pois) <= 2.0 + 1e-6, (miss, len(dup), out[:3], len(pois), sorted({round(e.dxf.char_height, 2) for e in pois})))
        exec(open(S + '/v24210/chk10.py').read(), globals()); check10(doc, msp, SEED_H, check)
        pg2 = subprocess.run(['pdftoppm', '-r', '50', '-png', pp, OUT + '/pg'], capture_output=True)
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
