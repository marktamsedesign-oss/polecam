"""v2.42.24 copy (RUN n: the span tags R2+R3, the route check RUN 3). v2.42.20 (synthetic data only): fibers in the plan DXF, the Drawing and Share.
 The same synthetic As-Plan as t24220a: the plan DXF job (each fiber in its lane, tags on the span lengths, existing cable blue and
 dashed off the new route, a loop for each fiber: "15m+10m+10m LOOP", "10m LOOP x2"); the Drawing (its labels); Share: the whole
 project carries the fibers; only the changes after a fiber is changed carries the new fibers; a sender's record deletion takes the
 point off the fibers."""
import asyncio, sys, os, shutil, json, math, zipfile, io, re
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src'); sys.path.insert(0, S + '/v24220')
import common, ezdxf
from playwright.async_api import async_playwright
import importlib.util
spec = importlib.util.spec_from_file_location('ta', S + '/v24220/t24220a.py')
src = open(S + '/v24220/t24220a.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v24220/out_a'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)", "OUT = S + '/v24225/out_20b'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)")
exec(compile(src, 't24220a_head', 'exec'))  # synth, ADD, check, W, close_sheets, export, at, qty
BASE = os.environ.get('BASE', 'http://localhost:8765')
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
SEED_H = {e.dxf.handle for e in ezdxf.read(io.StringIO(SEED)).modelspace()}
ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'; LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'
import urllib.parse
async def sheet2(route):
    if route.request.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    q = urllib.parse.parse_qs(urllib.parse.urlparse(route.request.url).query)
    if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
    return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'name': 'Test sheet', 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}))
async def new_ctx(p, udir, w=1100):
    ctx = await p.chromium.launch_persistent_context(udir, executable_path=common.CHROME, viewport={'width': w, 'height': 1000}, accept_downloads=True, service_workers='block')
    await ctx.route('https://script.google.com/**', sheet2)
    for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**', 'https://build.protomaps.com/**'): await ctx.route(u, lambda r: r.abort())
    for js in (common.NO_DRAFT_JS, common.NO_SAVECHECK_JS, common.NO_SAMPLE_JS, common.ADM_OPEN_JS): await ctx.add_init_script(js)
    pg = ctx.pages[0]; errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    return ctx, pg, errs
async def setup(pg, name, email):
    await pg.goto(BASE + '/index.html'); await W(pg, 1500)
    await pg.fill('#pfName', name); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', email)
    await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
    await pg.fill('#admName', 'Globe OSP'); await common.sheet_companies(pg, ['GLOBE', 'SAMPLE VENDOR'], admins=['GLOBE'])
    await pg.fill('#admWriteKey', 'ADMIN-KEY-TEST'); await pg.fill('#admDxfSeed', LINK1)
    await pg.click('#admSave'); await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
    if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
    for _ in range(3):
        if not await pg.locator('#askBox:not([hidden])').count(): break
        b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
    await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
async def share_get(pg, choice, name):
    await pg.evaluate("() => { __polecam.shareProject(); }")
    await pg.wait_for_selector('#askBox:not([hidden])', timeout=20000); await W(pg, 300)
    dlg = await pg.evaluate("() => ({ t: document.getElementById('askTitle').textContent, x: document.getElementById('askText').textContent, b: [...document.querySelectorAll('#askBox button')].map((b) => b.textContent) })")
    await pg.locator('#askBox button', has_text=choice).first.click()
    await pg.wait_for_selector('#sendBox:not([hidden])', timeout=60000); await W(pg, 300)
    btn = '#sendSave2' if await pg.is_visible('#sendSave2') else '#sendSave'
    async with pg.expect_download(timeout=60000) as d: await pg.click(btn)
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f)
    if await pg.is_visible('#sendNo'): await pg.click('#sendNo')
    await W(pg, 300); return f, dlg
async def open_file(pg, f):
    await pg.set_input_files('#sharedInput', f); await pg.wait_for_selector('#askBox:not([hidden])', timeout=30000); await W(pg, 300)
    await pg.locator('#askBox button.primary').first.click()
    for _ in range(40):
        if not await pg.locator('#askBox:not([hidden])').count() and not await pg.locator('#busy:not([hidden])').count(): break
        await W(pg, 250)
    await W(pg, 600); return await pg.evaluate("document.getElementById('toast').textContent")

async def main():
    async with async_playwright() as p:
        ctx, pg, errs = await new_ctx(p, OUT + '/ud_a'); await setup(pg, 'Juan Dela Cruz', 'juan.delacruz@example.com')
        recs, links, fib = synth()
        await common.newproj(pg, 'survey', 'FIBERS_PLAN', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['FIBERS_PLAN', recs, links, fib]); kof = {v: k for k, v in ids.items()}
        # ---- the plan DXF
        await pg.evaluate("""() => { const wrap = (T) => { if (!T || T.__w) return T; const ob = T.build; T.build = function (seed, job) { window.__job = { spans: job.spans.filter((s) => s.tags || (s.more || []).length).map((s) => ({ ia: s.ia, ib: s.ib, more: s.more, moreOff: s.moreOff, moreEx: s.moreEx, tags: s.tags })), exSpans: job.exSpans, loops: job.pts.filter((p) => p.mloopL).map((p) => [p.poleId, p.mloopL]) }; return ob.apply(this, arguments); }; T.__w = true; return T; };
          if (window.GeDxfTpl) wrap(window.GeDxfTpl); else { let v; Object.defineProperty(window, 'GeDxfTpl', { configurable: true, get: () => v, set: (x) => { v = wrap(x); } }); } }""")
        await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        fd = await export(pg, 'doDxf', 'fibers_plan_dxf.zip')
        job = await pg.evaluate("window.__job")
        z = zipfile.ZipFile(fd); dn = [n for n in z.namelist() if n.endswith('.dxf')]; raw = z.read(dn[0]).decode('utf-8', 'replace')
        doc = ezdxf.read(io.StringIO(raw.replace('\r\n', '\n'))); msp = [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
        texts = [(e.dxf.text if e.dxftype() == 'TEXT' else e.text) for e in msp if e.dxftype() in ('TEXT', 'MTEXT')]
        blue = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and e.dxf.get('color') == 5]
        sh = [s for s in job['spans'] if {kof[s['ia']], kof[s['ib']]} == {'C0', 'S1'}][0]
        lp = dict((k, v) for k, v in job['loops'])
        check('D1. plan DXF job: the shared spans carry the other fiber in its lane (one lane off the first fiber\'s line) with the tags F2+F3; the existing cable F4 on its own 3 steps; a loop for each fiber at CL-0001 (15, 10, 10); S1\'s surveyed loop on one cable (v2.42.25: 10)',
              sh['tags'] == 'R2+R3' and sh['more'] == ['L12'] and len(sh['moreOff']) == 1 and abs(sh['moreOff'][0]) == 1 and sh['moreEx'] == [False]
              and len(job['exSpans']) == 3 and all(s['off'] == 0 and s['cab'] == 'L12' for s in job['exSpans']) and sorted(lp['CC-2000']) == [10, 10, 15] and lp.get('CC-2001') == [10], job)
        check('D2. (v2.42.25) the DXF: the span lengths are the length only (no (F2+F3)); the closure\'s loops one small line each with its RUN (15m LOOP (RUN 1), 10m LOOP (RUN 2), 10m LOOP (RUN 3)), no 15m+10m+10m or x2; the existing cable drawn blue (one continuous line)',
              sum('(F2+F3)' in t for t in texts) == 0 and texts.count('50m') >= 2 and all(x in texts for x in ('15m LOOP (RUN 1)', '10m LOOP (RUN 2)', '10m LOOP (RUN 3)')) and not any('LOOP' in t and ('+' in t or 'x2' in t) for t in texts) and len(blue) >= 1 and max(len(list(e.get_points())) for e in blue) >= 4,
              ([t for t in texts if 'F2' in t or 'LOOP' in t][:12], len(blue)))
        # ---- the Drawing
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1500)
        dl = await pg.evaluate("(() => { const d = __polecam.drw || null; return null; })()")
        await pg.screenshot(path=OUT + '/drawing.png')
        await close_sheets(pg)
        # ---- Share: the whole project, then a fiber changed (only the changes), then a record deleted
        f1, d1 = await share_get(pg, 'The whole project', 'share1.zip')
        cT, pT, eT = await new_ctx(p, OUT + '/ud_t'); await setup(pT, 'Ana Reyes', 'ana.reyes@example.com')
        t1 = await open_file(pT, f1)
        FT = await pT.evaluate("(__polecam.S.meta.FIBERS_PLAN || {}).fibers || []")
        check('E1. the whole project shared: the other phone has the 4 fibers with their ways', sorted(f['n'] for f in FT) == [1, 2, 3, 4] and [kof.get(x) for x in [f for f in FT if f['n'] == 2][0]['path']][-1] == 'R12', (t1, [(f['n'], len(f['path'])) for f in FT]))
        await pg.evaluate("__polecam.setFibers(__polecam.fibers().map((f) => (f.n === 3 ? { ...f, side: 'right', toSt: 'New' } : f)))"); await W(pg, 300)
        f2, d2 = await share_get(pg, 'Only the changes', 'share2.zip')
        t2 = await open_file(pT, f2)
        F3 = [f for f in await pT.evaluate("(__polecam.S.meta.FIBERS_PLAN || {}).fibers || []") if f['n'] == 3][0]
        check('E2. a fiber changed, only the changes shared: the other phone has it (Fiber 3 set right, its end New)', F3['side'] == 'right' and F3['toSt'] == 'New', (t2, F3.get('side'), F3.get('toSt')))
        await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids['L5']); await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 600)
        await pg.click('#edTrash'); await pg.wait_for_selector('#askBox:not([hidden])'); await pg.locator('#askBox button', has_text='Delete').click(); await W(pg, 900); await close_sheets(pg)
        mine = [f for f in await pg.evaluate("__polecam.fibers()") if f['n'] == 3][0]
        adv = await pg.evaluate("__polecam.routeAdvice().map((a) => a.text)")
        f3, d3 = await share_get(pg, 'Only the changes', 'share3.zip')
        t3 = await open_file(pT, f3)
        F3b = [f for f in await pT.evaluate("(__polecam.S.meta.FIBERS_PLAN || {}).fibers || []") if f['n'] == 3][0]
        check('E3. a pole of Fiber 3 deleted: off the fiber here and on the other phone; the check asks to link its neighbours (CC-4004 → CC-4006)',
              ids['L5'] not in mine['path'] and ids['L5'] not in F3b['path'] and len(F3b['path']) == 14 and any('RUN 3: no span CC-4004 → CC-4006' in a for a in adv), (len(mine['path']), len(F3b['path']), adv))
        check('E9. no page errors', not errs and not eT, (errs[:4], eT[:4]))
        await ctx.close(); await cT.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
