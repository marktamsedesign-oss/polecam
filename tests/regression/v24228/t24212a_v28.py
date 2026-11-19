"""(v2.42.28 copy: Change opens the names on the DXF card.)
v2.42.12: the names in the title block (Design Engineer, Project Engineer, Head-Cable Engineering typed in the DXF card; the CSE Lead from
the online sheet's CSE LEAD tab by the project's territory; Junior Engineer blank), the cover's site lines one line up, the site's details fitted
to the title block's box. On the 10 km sample (numbers only).
 1. the DXF card shows NAMES IN THE TITLE BLOCK; after a sync, CSE Lead = the sheet's name for the project's territory (T3), the hint says so
 2. names typed are kept (after a reload too); a CSE Lead typed by hand stays while the sheet is unchanged
 3. a new name in the sheet replaces it at the next sync; a project territory the tab lacks: the hint says so, the name (from the sheet) is cleared
 4. the DXF: every title block has the names above their lines (Junior Engineer blank); long names smaller to fit
 5. the cover: no empty location line (the site's lines one line up); the title block's site details made smaller to fit their box
 6. check_plan no problem, ezdxf audit clean; the PDF has the names; no page errors
 7. (v2.42.13) the numbers over a dark shadow; 10. the street names black and slanted, the tower's name covering nothing"""
import asyncio, sys, os, shutil, json, zipfile, time, urllib.parse, io, re, collections, math
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from playwright.async_api import async_playwright
import ezdxf
BASE = os.environ.get('BASE', 'http://localhost:8765')
D = S + '/v2428'; OUT = S + '/v24228/out_212a_v28'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
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
    CSE = {'rows': [{'t': 'T3', 'n': 'Juan Dela Cruz'}, {'t': 'Territory 5', 'n': 'Maria Santos'}, {'t': 'T5', 'n': 'Pedro Reyes'}]}
    async def sheet(route):
        req = route.request
        if req.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query)
        if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
        out = {'ok': True, 'name': common.SHEET_MOCK['name'], 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}
        if CSE['rows'] is not None: out['cseLeads'] = CSE['rows']
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
        await pg.set_input_files('#sharedInput', FILE); await pg.wait_for_selector('#askBox:not([hidden])', timeout=600000)
        for _ in range(4):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            await pg.locator('#askBox button.primary').first.click(); await W(pg, 700)
        await idle(pg); await W(pg, 1500)
        # the project's site details and territory (as a site from Project Data gives them)
        await pg.evaluate("""() => { const P = __polecam.S, m = P.meta[P.project]; m.territory = 'T3';
          m.siteFields = [['Project Name', 'New Site Build (NSB)'], ['Site name', 'M2EM2_CapSiteBrgyBucana_DavaoCity'], ['PLA ID', 'MIN5550'], ['Serial Number', 'M2EM2-NS-NTG19-AG75']]; __polecam.persist(); }""")
        await pg.evaluate("__polecam.cloudSync(true)"); await W(pg, 1500)
        await open_card(pg, 'doDxf')
        vis = await pg.locator('#sigBox').is_visible(); cse1 = await pg.input_value('#sigCse'); info1 = await pg.text_content('#sigInfo') or ''
        check('1. the DXF card shows NAMES ON THE SHEET; after a sync, CSE Lead = the sheet\'s name for territory T3; the hint says so', vis and cse1 == 'Juan Dela Cruz' and 'territory T3' in info1 and 'Junior Engineer is left blank' in info1, (vis, cse1, info1))
        await pg.click('#sigChange'); await W(pg, 200)  # v2.42.28: the names in one line; Change opens the four fields
        await pg.fill('#sigDesign', 'Ana Reyes'); await pg.fill('#sigProject', 'Maria Clara Santos-Villanueva Esguerra de los Reyes'); await pg.fill('#sigHead', 'Ben Lim'); await pg.fill('#sigCse', 'Carlo Diaz'); await pg.press('#sigCse', 'Tab'); await W(pg, 300)
        await close_sheets(pg); await pg.reload(); await W(pg, 2500); await pg.evaluate("__polecam.cloudSync(true)"); await W(pg, 1500)
        await open_card(pg, 'doDxf')
        vals2 = [await pg.input_value(x) for x in ('#sigDesign', '#sigProject', '#sigHead', '#sigCse')]; info2 = await pg.text_content('#sigInfo') or ''
        check('2. the names typed are kept (after a reload and a sync); the CSE Lead typed by hand stays while the sheet is unchanged (the hint says yours)',
              vals2 == ['Ana Reyes', 'Maria Clara Santos-Villanueva Esguerra de los Reyes', 'Ben Lim', 'Carlo Diaz'] and 'yours' in info2 and 'Juan Dela Cruz' in info2, (vals2, info2))
        CSE['rows'] = [{'t': 'T3', 'n': 'Rosa Lim'}, {'t': 'T3', 'n': 'Tess Go'}, {'t': 'T5', 'n': 'Pedro Reyes'}]
        await close_sheets(pg); await pg.evaluate("__polecam.cloudSync(true)"); await W(pg, 1500); await open_card(pg, 'doDxf')
        cse3 = await pg.input_value('#sigCse')
        await pg.evaluate("() => { const P = __polecam.S; P.meta[P.project].territory = 'T7'; __polecam.renderSig(); }"); cse3b = await pg.input_value('#sigCse'); info3b = await pg.text_content('#sigInfo') or ''
        await pg.evaluate("() => { const P = __polecam.S; P.meta[P.project].territory = 'T3'; __polecam.persist(); __polecam.renderSig(); }"); cse3c = await pg.input_value('#sigCse')
        check('3. a new name in the sheet replaces the one typed (two rows: both names); a territory the tab lacks: the hint says so, the sheet\'s name is cleared; back to T3: the sheet\'s names',
              cse3 == 'Rosa Lim / Tess Go' and cse3b == '' and 'no name for territory T7' in info3b and cse3c == 'Rosa Lim / Tess Go', (cse3, cse3b, info3b, cse3c))
        await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }], 0)"); await W(pg, 200)  # v2.42.14: the drawings as rows
        await pg.check('#dxfPdf'); await W(pg, 300)
        toast = await run_export(pg, 'doDxf'); f1 = await save(pg, 'plan.zip'); await close_sheets(pg)
        z = zipfile.ZipFile(f1); names = z.namelist(); dxfn = [n for n in names if n.endswith('.dxf')][0]; pdfn = [n for n in names if n.endswith('_SHEETS.pdf')][0]
        dp = OUT + '/plan.dxf'; open(dp, 'wb').write(z.read(dxfn)); pp = OUT + '/sheets.pdf'; open(pp, 'wb').write(z.read(pdfn))
        doc = ezdxf.readfile(dp)
        def mts(L): return [e for e in L if e.dxftype() == 'MTEXT']
        lays = [l for l in doc.layouts.names_in_taborder() if l != 'Model']
        sig = {}
        for ln in lays:
            for e in mts(doc.layouts.get(ln)):
                t = e.plain_text().strip(); x = round(e.dxf.insert.x, 1); y = round(e.dxf.insert.y, 1)
                if (x, y) in ((6794.8, -6061.2), (6835.1, -6061.2), (6875.4, -6061.2), (6804.9, -6123.6), (6865.4, -6123.6)): sig.setdefault(ln, {})[(x, y)] = (t, round(e.dxf.char_height, 3))
        want = {(6794.8, -6061.2): 'Ana Reyes', (6835.1, -6061.2): 'Maria Clara Santos-Villanueva Esguerra de los Reyes', (6875.4, -6061.2): 'Ben Lim', (6804.9, -6123.6): '', (6865.4, -6123.6): 'Rosa Lim / Tess Go'}
        okn = sig and all(all(v.get(k, ('?',))[0] == w for k, w in want.items()) for v in sig.values())
        small = all(v[(6835.1, -6061.2)][1] < 1.45 and v[(6794.8, -6061.2)][1] == 1.45 for v in sig.values())
        check('4. every title block has the names above their lines (Junior Engineer blank); the long name made smaller to fit its cell, the others as the template',
              okn and small and len(sig) >= 8, (len(sig), list(sig.values())[:1]))
        cover = [e for e in mts(doc.layouts.get('TITLE')) if 'New Site Build' in e.text]
        loc = [e for ln in lays for e in mts(doc.layouts.get(ln)) if 'M2EM2_CapSiteBrgyBucana_DavaoCity_MIN5550' in e.plain_text()] + [e for b in doc.blocks if b.name == 'PAGING' for e in b if e.dxftype() == 'MTEXT' and 'M2EM2_CapSiteBrgyBucana_DavaoCity_MIN5550' in e.plain_text()]
        ctext = cover[0].text if cover else ''
        check('5. the cover: no empty location line (the site\'s lines one line up); the title block\'s site details smaller to fit their box',
              cover and 'New Site Build (NSB)\\P\\H0.74632x;\\P' in ctext and 'M2EM2_CapSiteBrgyBucana_DavaoCity\\PMIN5550' in ctext and loc and all(e.dxf.char_height < 3.6 for e in loc), (ctext[:160], [round(e.dxf.char_height, 3) for e in loc]))
        r4 = subprocess.run(['python3', '-I', CHECK, dp], capture_output=True, text=True); a4, au = recover.readfile(dp); b4 = a4.audit()
        ptxt = subprocess.run(['pdftotext', pp, '-'], capture_output=True, text=True).stdout
        check('6. check_plan no problem, ezdxf audit clean; the PDF has the names; no page errors', r4.returncode == 0 and not au.errors and not b4.errors and 'Ana Reyes' in ptxt and 'Rosa Lim / Tess Go' in ptxt and 'Ben Lim' in ptxt and not errs, (r4.stdout[-300:], errs[:3]))
        # v2.42.13: (7) the numbers over a dark shadow; (8 = check 10 of t24210a) the tower's name covers nothing
        msp = doc.modelspace()
        nums = [e for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer == 'p-pole' and re.fullmatch(r'\d+', e.dxf.text or '') and e.dxf.handle not in SEED_H]
        fg = [e for e in nums if e.dxf.get('color', 256) != 250]; sh = {(e.dxf.text, round(e.dxf.align_point.x, 2), round(e.dxf.align_point.y, 2)) for e in nums if e.dxf.get('color', 256) == 250}
        miss = [e.dxf.text for e in fg if (e.dxf.text, round(e.dxf.align_point.x + e.dxf.height * 0.08, 2), round(e.dxf.align_point.y - e.dxf.height * 0.08, 2)) not in sh]
        circ = [e for e in msp if e.dxftype() == 'CIRCLE' and e.dxf.layer == 'p-pole' and e.dxf.handle not in SEED_H]
        check('7. (v2.42.13) every number (yellow) over a dark shadow, its circle too', fg and not miss and len(sh) == len(fg) and sum(1 for e in circ if e.dxf.get('color', 256) == 250) == sum(1 for e in circ if e.dxf.get('color', 256) != 250) > 0, (len(fg), len(sh), miss[:5], len(circ)))
        exec(open(S + '/v24210/chk10.py').read(), globals()); check10(doc, msp, SEED_H, check, streets=False) # (no road pack here)
        subprocess.run(['pdftoppm', '-r', '60', '-png', '-f', '7', '-l', '7', pp, OUT + '/g'], capture_output=True)
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
