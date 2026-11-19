"""v2.43.0 beta 3.3, QA-06 (synthetic data only): two field partners on one project, on simulated phones of DEMO CONTRACTOR with the REAL
sheet script and mailbox script on their stand-ins (e2e/servers.js). Juan (coordinator) assigns one project to Pedro and Maria.
R: each surveys 3 poles and links 2 spans; Juan merges both (4 spans), then Pedro's second update (5), then Pedro removes one of his
   spans (only that one goes); Juan's update reaches Maria while she has an unsent span (it stays).
C: each adds a cable (RUN 1 on both phones): on Juan's phone Maria's becomes RUN 2 (said in the merge line); the partners take the
   coordinator's numbers at his next update; the DXF, KMZ, route Excel and BOQ agree on each RUN's number and length.
D: both record CC-1011 to CC-1013: listed at the merge; All: keep the first: 3 records, the BOQ counts 3, the spans moved to the kept
   records; Maria's copies deleted on her phone at Juan's next send; combine the photos / keep both (not asked again).
V: a Share file made by the real v2.42.28 app opens; its next update removes only the span it removed."""
import asyncio, sys, os, json, re, time, zipfile, io, subprocess, shutil
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v243/t2433c.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v243/out_c3'", "OUT = S + '/v243/out_qa06'")
exec(compile(src, 't2433c_head', 'exec'))
import openpyxl
SEED = PRIV + '/template/seed.dxf'  # the plan template (never in a zip or the repository): the DXF part is skipped without it
OLD_APP = PRIV + '/old/v2.42.28'; OLD_PORT = 8767
P1, P2 = 'DEMO SITE TWO PARTNERS', 'DEMO SITE TWICE'

async def make_task(A, name, who):
    await close_sheets(A); await A.click('#projectBtn'); await W(A, 300); await A.click('#newProjBtn'); await W(A, 300)
    await A.select_option('#npCat', 'survey'); await W(A, 200); await A.select_option('#npPurpose', 'As-plan'); await A.fill('#npName', name); await A.set_input_files('#npKmzInput', OUT + '/asplan.kml'); await W(A, 300)
    for w in who: await A.click(f'#npAssign .chip:has-text("{w}")')
    await A.click('#npCreate'); await idle(A, 40000); await W(A, 500)
async def get_task(pg):
    await projects(pg); j, _ = await dl(pg, ms=40000); await W(pg, 300); return j
async def send_up(pg, ms=60000):
    await close_sheets(pg); await pg.click('#projectBtn'); await W(pg, 300); await send_sheet(pg); st = await send_go(pg, ms); await W(pg, 300); return st
async def merge_from(pg, who, ms=60000):
    """Juan: Download and merge the update from that person (the inbox row with his name)."""
    await projects(pg); rows = await inbox(pg); i = next((k for k, r in enumerate(rows) if who in r), None)
    if i is None: return {'line': f'no update from {who} in {rows}', 'sub': ''}
    j, _ = await dl(pg, i, ms=ms); return j or {}
async def send_to(pg, only, ms=60000):
    """The coordinator's Send of the open project: only the changes, to the partners named."""
    await close_sheets(pg); await pg.click('#projectBtn'); await W(pg, 300); await pg.click('#curTools .tmtool[data-tool="send"]'); await W(pg, 500)
    for lab in await pg.locator('#mbxTo label').all():
        t = await lab.text_content(); box = lab.locator('input')
        if any(o in t for o in only): await box.check()
        else: await box.uncheck()
    await W(pg, 200); return await send_go(pg, ms)
async def route(pg, name): return await mbx(pg, 'route', name)
def spans(r): return sorted('-'.join(sorted(x[:2])) for x in r['links'])
async def export_file(pg, sel, name):
    await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate(f"window.__polecam.showExport('{sel}')"); await W(pg, 400); await pg.click('#' + sel)
    for _ in range(2000):
        if await pg.locator('#resultBox:not([hidden])').count(): break
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
        await W(pg, 250)
    async with pg.expect_download(timeout=180000) as d: await pg.click('#resSave')
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f); await close_sheets(pg); return f
async def dup_state(pg):
    return await pg.evaluate("""() => ({ open: !document.getElementById('dupSheet').hidden, sub: document.getElementById('dupSub').textContent,
      groups: [...document.querySelectorAll('#dupList .dupg')].map((g) => ({ head: g.querySelector('b').textContent, opts: [...g.querySelectorAll('.dupo')].map((o) => o.textContent) })) })""")
async def wait_dup(pg, ms=8000):
    t = time.time()
    while time.time() - t < ms / 1000:
        if await pg.is_visible('#dupSheet'): await W(pg, 300); return True
        await W(pg, 150)
    return False
async def recs(pg, name): return sorted(r['poleId'] for r in await mbx(pg, 'recs', name))

# ---- the v2.42.28 phone (the real v2.42.28 app, served apart)
ADD_OLD = """([proj, recs, links, fib]) => { const P = __polecam.points, ids = {}, t0 = Date.now() - 600000;
  recs.forEach((r, i) => { const id = 'old_' + r.k; ids[r.k] = id; const t = new Date(t0 + i * 1000).toISOString();
    P.push({ id, project: proj, created: t, takenAt: t, updated: t, source: 'map', poleId: r.poleId, poleType: 'Concrete', lat: r.lat, lon: r.lon, element: 'Pole', status: 'Existing',
      remarks: '', closureId: '', boxes: 0, details: [], marks: [], boq: {}, by: 'Pedro Santos · DEMO CONTRACTOR', updatedBy: 'Pedro Santos' }); });
  const S = __polecam.S; S.meta[proj] = { ...(S.meta[proj] || {}), links: links.map(([a, b, c]) => [ids[a], ids[b], c]), linksAt: new Date().toISOString(), fibers: fib.map((f) => ({ ...f, path: f.path.map((k) => ids[k]) })) };
  __polecam.persist(); __polecam.renderPoles(); return ids; }"""
async def old_ctx(p):
    ctx = await p.chromium.launch_persistent_context(OUT + '/ud_old', executable_path=common.CHROME, viewport={'width': 1100, 'height': 900}, accept_downloads=True, service_workers='block')
    async def sheet(route):  # the online sheet as v2.42.28 reads it (the companies; a write answered ok)
        if route.request.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'name': 'Test sheet', 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False}))
    await ctx.route('https://script.google.com/**', sheet)
    for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**', 'https://build.protomaps.com/**'): await ctx.route(u, lambda r: r.abort())
    for js in (common.NO_DRAFT_JS, common.NO_SAVECHECK_JS, common.NO_SAMPLE_JS, common.ADM_OPEN_JS): await ctx.add_init_script(js)
    pg = ctx.pages[0]; errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    await pg.goto(f'http://localhost:{OLD_PORT}/index.html'); await W(pg, 1500)
    await pg.fill('#pfName', 'Pedro Santos'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'pedro.old@demo-contractor.example')
    await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
    await pg.fill('#admName', 'Globe OSP'); await common.sheet_companies(pg, ['GLOBE', 'DEMO CONTRACTOR'], admins=['GLOBE'])
    await pg.click('#admSave'); await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
    if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
    for _ in range(3):
        if not await pg.locator('#askBox:not([hidden])').count(): break
        b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
    await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
    return ctx, pg, errs
async def share_get(pg, choice, name):
    await pg.evaluate("() => { __polecam.shareProject(); }")
    await pg.wait_for_selector('#askBox:not([hidden])', timeout=20000); await W(pg, 300)
    await pg.locator('#askBox button', has_text=choice).first.click()
    await pg.wait_for_selector('#sendBox:not([hidden])', timeout=60000); await W(pg, 300)
    btn = '#sendSave2' if await pg.is_visible('#sendSave2') else '#sendSave'
    async with pg.expect_download(timeout=60000) as d: await pg.click(btn)
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f)
    if await pg.is_visible('#sendNo'): await pg.click('#sendNo')
    await W(pg, 300); return f
async def open_file(pg, f):
    await close_sheets(pg)
    await pg.set_input_files('#sharedInput', f); await pg.wait_for_selector('#askBox:not([hidden])', timeout=30000); await W(pg, 300)
    await pg.locator('#askBox button.primary').first.click()
    for _ in range(60):
        if not await pg.locator('#askBox:not([hidden])').count() and not await pg.locator('#busy:not([hidden])').count(): break
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
        await W(pg, 250)
    await W(pg, 500); return await pg.evaluate("document.getElementById('toast').textContent")

async def main():
    open(OUT + '/asplan.kml', 'w').write(KML)
    srv = subprocess.Popen(['node', S + '/v243/e2e/servers.js'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    old = subprocess.Popen([sys.executable, '-m', 'http.server', str(OLD_PORT), '--bind', '127.0.0.1', '--directory', OLD_APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) if os.path.isdir(OLD_APP) else None; time.sleep(1.5)
    try:
        async with async_playwright() as p:
            ca, A, ea = await new_ctx(p, OUT + '/ud_juan', 1100); await setup(A, 'Juan Dela Cruz', JUAN)
            cb, B, eb = await new_ctx(p, OUT + '/ud_pedro'); await setup(B, 'Pedro Santos', PEDRO)
            cm, M, em = await new_ctx(p, OUT + '/ud_maria'); await setup(M, 'Maria Garcia', MARIA)
            await open_team(A); await confirm_email(A, JUAN); await role(A, 'Coordinator')
            await A.click('#tmMbxSetup'); await W(A, 500); await A.fill('#mbxUrl', MBX_URL); await A.click('#mbxSave'); await idle(A, 40000); await W(A, 400)
            for pg, em_ in ((B, PEDRO), (M, MARIA)):
                await open_team(pg); await confirm_email(pg, em_); await role(pg, 'Field Partner')
                await pg.locator('#tmCoList .tmrow', has_text='Juan Dela Cruz').locator('[data-join]').click(); await idle(pg)
            await open_team(A)
            for _ in range(2):
                if await A.locator('#tmMemList [data-accept]').count(): await A.locator('#tmMemList [data-accept]').first.click(); await idle(A); await W(A, 300)
            for pg in (B, M):
                if await pg.is_visible('#tmRefresh'): await pg.click('#tmRefresh'); await idle(pg)
            # ================= R. the route, two partners
            await make_task(A, P1, ['Pedro Santos', 'Maria Garcia'])
            await get_task(B); await get_task(M)
            await mbx(B, 'seed', P1, 3, {'from': 10}); await mbx(B, 'link', P1, [['CC-1011', 'CC-1012'], ['CC-1012', 'CC-1013']])
            await mbx(M, 'seed', P1, 3, {'from': 20, 'prefix': 'MG-'}); await mbx(M, 'link', P1, [['MG-1021', 'MG-1022'], ['MG-1022', 'MG-1023']])
            sb = await send_up(B); sm = await send_up(M)
            check('R0 Pedro and Maria each survey 3 poles, link 2 spans and send only the changes', 'Sent to Juan' in sb['line'] and 'Sent to Juan' in sm['line'], (sb['line'], sm['line']))
            jb = await merge_from(A, 'Pedro Santos'); jm = await merge_from(A, 'Maria Garcia')
            rA = await route(A, P1); await A.screenshot(path=f'{OUT}/r1_juan.png')
            check('R1 after both merges Juan has 6 records and 4 spans (each partner\'s 2, each kept as whose it is)',
                  len(await recs(A, P1)) == 6 and spans(rA) == ['CC-1011-CC-1012', 'CC-1012-CC-1013', 'MG-1021-MG-1022', 'MG-1022-MG-1023']
                  and sorted(x[3] for x in rA['links']) == [MARIA, MARIA, PEDRO, PEDRO], (await recs(A, P1), rA['links']))
            check('R1b each merge line says what happened to the route: "3 records · the route: 2 spans added, 0 removed"',
                  '3 records · the route: 2 spans added, 0 removed' in jb.get('sub', '') and '3 records · the route: 2 spans added, 0 removed' in jm.get('sub', ''), (jb.get('sub'), jm.get('sub')))
            await mbx(B, 'seed', P1, 1, {'from': 13}); await mbx(B, 'link', P1, [['CC-1013', 'CC-1014']]); await send_up(B)
            j2 = await merge_from(A, 'Pedro Santos'); rA = await route(A, P1)
            check('R2 Pedro\'s second update (1 pole, 1 span): Juan has 5 spans; Maria\'s 2 are still there; the line says 1 span added, 0 removed',
                  len(rA['links']) == 5 and 'MG-1021-MG-1022' in spans(rA) and 'MG-1022-MG-1023' in spans(rA) and 'the route: 1 span added, 0 removed' in j2.get('sub', ''), (spans(rA), j2.get('sub')))
            await mbx(B, 'unlink', P1, 'CC-1011', 'CC-1012'); await send_up(B)
            j3 = await merge_from(A, 'Pedro Santos'); rA = await route(A, P1)
            check('R3 Pedro removes one of his spans and sends: on Juan\'s phone only that span goes (4 left: Pedro\'s other 2, Maria\'s 2); "0 spans added, 1 removed"',
                  spans(rA) == ['CC-1012-CC-1013', 'CC-1013-CC-1014', 'MG-1021-MG-1022', 'MG-1022-MG-1023'] and 'the route: 0 spans added, 1 removed' in j3.get('sub', ''), (spans(rA), j3.get('sub')))
            await mbx(M, 'link', P1, [['MG-1021', 'MG-1023']])  # Maria's unsent span
            st = await send_to(A, ['Maria Garcia'])
            jM = await merge_from(M, 'Juan Dela Cruz'); rM = await route(M, P1)
            check('R4 Juan sends his update to Maria while she has an unsent span: her span stays; she gets Pedro\'s spans (not the one he removed)',
                  'Sent to Maria' in st['line'] and 'MG-1021-MG-1023' in spans(rM) and spans(rM) == sorted(['CC-1012-CC-1013', 'CC-1013-CC-1014', 'MG-1021-MG-1022', 'MG-1022-MG-1023', 'MG-1021-MG-1023'])
                  and [x[3] for x in rM['links'] if x[:2] in (['MG-1021', 'MG-1023'], ['MG-1023', 'MG-1021'])] == [MARIA], (st['line'], spans(rM), jM.get('sub')))
            # ================= C. cables from both partners: RUN numbers
            nB = await mbx(B, 'cable', P1, ['CC-1012', 'CC-1013', 'CC-1014'], 'L12'); nM = await mbx(M, 'cable', P1, ['MG-1021', 'MG-1022', 'MG-1023'], 'F72')
            check('C0 each partner adds a cable: RUN 1 on both phones', nB == 1 and nM == 1, (nB, nM))
            await send_up(B); await send_up(M)
            jb = await merge_from(A, 'Pedro Santos'); jm = await merge_from(A, 'Maria Garcia'); rA = await route(A, P1)
            fA = {f['n']: (f['o'], f['path'], f['cab']) for f in rA['fibers']}
            check('C1 on Juan\'s phone the two cables never share a number: Pedro\'s stays RUN 1, Maria\'s is RUN 2, and the merge line says so; her unsent span came too (5 spans)',
                  fA.get(1) == (PEDRO, ['CC-1012', 'CC-1013', 'CC-1014'], 'L12') and fA.get(2) == (MARIA, ['MG-1021', 'MG-1022', 'MG-1023'], 'F72') and len(fA) == 2
                  and '1 cable added' in jb.get('sub', '') and 'Maria Garcia’s RUN 1 is RUN 2 here' in jm.get('sub', '') and len(rA['links']) == 5, (fA, jb.get('sub'), jm.get('sub')))
            await send_to(A, ['Pedro Santos', 'Maria Garcia'])
            jM = await merge_from(M, 'Juan Dela Cruz'); jP = await merge_from(B, 'Juan Dela Cruz')
            rM = await route(M, P1); rB = await route(B, P1)
            num = lambda r: sorted((f['n'], f['fid']) for f in r['fibers'])
            check('C2 at Juan\'s next update the partners take his numbers: Maria\'s cable is RUN 2 on her phone ("your RUN 1 is RUN 2 now"), Pedro\'s is RUN 1 on all three phones',
                  num(rM) == num(rA) == num(rB) and len(num(rA)) == 2 and 'your RUN 1 is RUN 2 now' in jM.get('sub', ''), (num(rA), num(rM), num(rB), jM.get('sub')))
            # the exports on Juan's phone: each RUN's number and length the same
            await open_proj(A, P1); await close_sheets(A)
            model = {f['n']: f['len'] for f in (await A.evaluate("__polecam.fibModel()"))['list']}
            fk = await export_file(A, 'doKmz', 'two.kmz'); z = zipfile.ZipFile(fk); kml = z.read([n for n in z.namelist() if n.endswith('.kml')][0]).decode('utf-8')
            kmz = {int(m.group(1)): float(m.group(2)) for m in re.finditer(r'<name>RUN (\d+)[^<]*? · (\d+) m', kml)}
            fx = await export_file(A, 'doRouteXlsx', 'two_route.xlsx'); wb = openpyxl.load_workbook(fx)
            xl = {int(r[0].split()[1]): (float(r[10]), float(r[13])) for r in ([c.value for c in row] for row in wb['Fibers'].iter_rows()) if isinstance(r[0], str) and r[0].startswith('Fiber ')}
            runs = sorted({r[3] for r in ([c.value for c in row] for row in wb['Spans'].iter_rows()) if isinstance(r[3], str) and r[3].startswith('F')})
            fbq = await export_file(A, 'doBoq', 'two_boq.xlsx'); wq = openpyxl.load_workbook(fbq)
            bq = {}
            for ws in wq.worksheets:
                for row in ws.iter_rows():
                    v = [c.value for c in row]
                    if v and isinstance(v[0], str) and re.match(r'^FIBER_\d+$', v[0]):
                        m_ = re.search(r'spans ([\d.]+) m', str(v[3])); bq[int(v[0][6:])] = (float(v[1]), float(m_.group(1)) if m_ else None)
            agree = sorted(model) == [1, 2] and sorted(kmz) == [1, 2] and sorted(xl) == [1, 2] and sorted(bq) == [1, 2] and runs == ['F1', 'F2'] \
                and all(abs(kmz[n] - round(model[n])) <= 1 and abs(xl[n][0] - model[n]) < 0.2 and abs(bq[n][1] - model[n]) < 0.2 and abs(bq[n][0] - xl[n][1]) < 0.2 for n in (1, 2))
            check('C3 KMZ, route Excel and BOQ: RUN 1 and RUN 2, each with the same length (the KMZ to the metre; the Excel\'s cable = the BOQ\'s FIBER_n)', agree, (model, kmz, xl, bq, runs))
            if os.path.exists(SEED):
                await A.set_input_files('#dxfTplFile', SEED); await idle(A, 60000); await W(A, 500); await close_sheets(A)
                await A.evaluate("""() => { const wrap = (T) => { if (!T || T.__w) return T; const ob = T.build; T.__ob = ob; T.build = function (seed, job) { window.__job = { spans: job.spans.map((s) => ({ ia: s.ia, ib: s.ib, len: s.len, tags: s.tags || '' })) }; return ob.apply(this, arguments); }; T.__w = true; return T; };
                  if (window.GeDxfTpl) wrap(window.GeDxfTpl); else { let v; Object.defineProperty(window, 'GeDxfTpl', { configurable: true, get: () => v, set: (x) => { v = wrap(x); } }); } }""")
                await A.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
                fd = await export_file(A, 'doDxf', 'two_dxf.zip'); job = await A.evaluate("window.__job")
                zd = zipfile.ZipFile(fd); raw = '\n'.join(zd.read(n).decode('utf-8', 'replace') for n in zd.namelist() if n.endswith('.dxf'))
                dx = {n: sum(s['len'] for s in job['spans'] if f'R{n}' in s['tags'].split('+')) for n in (1, 2)}
                check('C4 DXF: the cables labelled RUN 1 and RUN 2, and the spans of each RUN add up to the same length', '(RUN 1)' in raw and '(RUN 2)' in raw and all(abs(dx[n] - model[n]) < 0.2 for n in (1, 2)), (dx, model, '(RUN 1)' in raw, '(RUN 2)' in raw))
            else:
                print('SKIP C4 DXF: the plan template (seed.dxf) is not on this computer; it is never in the zip or the repository', flush=True)
            # ================= D. the same pole twice
            await make_task(A, P2, ['Pedro Santos', 'Maria Garcia'])
            await get_task(B); await get_task(M)
            await mbx(B, 'seed', P2, 3, {'from': 10}); await mbx(B, 'link', P2, [['CC-1011', 'CC-1012']])
            await mbx(M, 'seed', P2, 3, {'from': 10}); await mbx(M, 'link', P2, [['CC-1012', 'CC-1013']])
            await send_up(B); await send_up(M)
            jb = await merge_from(A, 'Pedro Santos'); first = await wait_dup(A, 2500)
            jm = await merge_from(A, 'Maria Garcia'); shown = await wait_dup(A); ds = await dup_state(A); await A.screenshot(path=f'{OUT}/d1_dup.png')
            check('D1 the 3 doubled poles are listed at the merge (not at the first partner\'s): CC-1011, CC-1012, CC-1013, each the same ID, with keep one / combine / keep both',
                  not first and shown and [g['head'] for g in ds['groups']] == ['CC-1011 · the same ID · the same spot', 'CC-1012 · the same ID · the same spot', 'CC-1013 · the same ID · the same spot']
                  and all(len(g['opts']) == 4 and g['opts'][0].startswith('Keep only Pedro Santos’s') and g['opts'][1].startswith('Keep only Maria Garcia’s') and g['opts'][2].startswith('Combine') and g['opts'][3].startswith('Keep both') for g in ds['groups'])
                  and 'within 10 m' in ds['sub'], ds)
            await A.click('#dupAll [data-all="pick"]'); await W(A, 200); await A.click('#dupApply'); await W(A, 1200)
            rr = await mbx(A, 'recs', P2); rA = await route(A, P2)
            await open_proj(A, P2); fbq = await export_file(A, 'doBoq', 'twice_boq.xlsx'); wq = openpyxl.load_workbook(fbq)
            pt = [v for ws in wq.worksheets for v in ([c.value for c in row] for row in ws.iter_rows()) if v and v[0] == 'POLES_TOTAL']
            byid = {r['id']: r for r in rr}
            check('D2 after "pick one" (All: keep the first) the project has 3 records (Pedro\'s), the BOQ counts 3 poles, and Maria\'s span moved to the kept poles (2 spans)',
                  sorted(r['poleId'] for r in rr) == ['CC-1011', 'CC-1012', 'CC-1013'] and all('Pedro' in (r.get('by') or '') for r in rr) and pt and pt[0][1] == 3
                  and spans(rA) == ['CC-1011-CC-1012', 'CC-1012-CC-1013'], ([(r['poleId'], r.get('by')) for r in rr], pt, spans(rA)))
            await send_to(A, ['Maria Garcia']); await merge_from(M, 'Juan Dela Cruz'); rm = await mbx(M, 'recs', P2)
            check('D3 at Juan\'s next send Maria\'s copies are deleted on her phone: she has the 3 kept records', sorted(r['poleId'] for r in rm) == ['CC-1011', 'CC-1012', 'CC-1013'] and all('Pedro' in (r.get('by') or '') for r in rm),
                  [(r['poleId'], r.get('by')) for r in rm])
            # combine the photos; keep both (not asked again)
            await mbx(B, 'seed', P2, 2, {'from': 30}); await mbx(M, 'seed', P2, 2, {'from': 30, 'prefix': 'MG-'})
            await send_up(B); await send_up(M)
            await merge_from(A, 'Pedro Santos'); await wait_dup(A, 2500); await close_sheets(A)
            await merge_from(A, 'Maria Garcia'); shown = await wait_dup(A); ds = await dup_state(A)
            check('D4 a pole recorded under two IDs at the same spot (CC-1031 and MG-1031, CC-1032 and MG-1032) is listed too (within 10 m)', shown and [g['head'] for g in ds['groups']] == ['CC-1031 and MG-1031 · the same spot', 'CC-1032 and MG-1032 · the same spot'], ds)
            await A.locator('#dupList .dupg').nth(0).locator('input[value="comb"]').check(); await A.locator('#dupList .dupg').nth(1).locator('input[value="both"]').check()
            await A.click('#dupApply'); await W(A, 1200)
            rr = {r['poleId']: r for r in await mbx(A, 'recs', P2)}
            phs = len((rr.get('CC-1031') or {}).get('photos') or [])
            sizes = [await mbx(A, 'photo', x['pid']) for x in (rr.get('CC-1031') or {}).get('photos') or []]
            check('D5 combine: CC-1031 keeps both photos (Maria\'s too, on the phone), MG-1031 is deleted; keep both: CC-1032 and MG-1032 stay', phs == 2 and all(s > 0 for s in sizes) and 'MG-1031' not in rr and 'CC-1032' in rr and 'MG-1032' in rr, (sorted(rr), phs, sizes))
            await mbx(M, 'edit', P2, 'MG-1032', 'MG-1032'); await send_up(M); await merge_from(A, 'Maria Garcia'); again = await wait_dup(A, 2500)
            check('D6 a pair kept on purpose is not asked again when one of them comes again', not again)
            await close_sheets(A); await A.click('#settingsBtn'); await W(A, 300); await A.click('#goCamera'); await W(A, 400)
            v0 = await A.input_value('#setDupM'); await A.fill('#setDupM', '25'); await A.dispatch_event('#setDupM', 'change'); await W(A, 200); v1 = await mbx(A, 'dupM')
            await A.fill('#setDupM', ''); await A.dispatch_event('#setDupM', 'change'); await W(A, 200); v2 = await mbx(A, 'dupM'); await close_sheets(A)
            check('D7 Settings → Camera: the distance is 10 m by default, adjustable (25), empty = 10 again', v0 == '10' and v1 == 25 and v2 == 10, (v0, v1, v2))
            # ================= V. a Share file from the real v2.42.28 app
            if not os.path.isfile(OLD_APP + '/app.js'):
                print('SKIP V1, V2 v2.42.28 files: the v2.42.28 build is not on this computer (an older build, not in the repository)', flush=True); co, eo = None, []
            else:
                co, O, eo = await old_ctx(p)
                ver = (await O.text_content('#brandVer') or '').strip()
                await common.newproj(O, 'survey', 'DEMO SITE OLD', purpose='As-plan'); await close_sheets(O)
                la = lambda k: (7.10 + k * 0.0004, 125.62 + k * 0.0004)
                RO = [{'k': f'K{i}', 'poleId': f'CC-20{i:02d}', 'lat': la(i)[0], 'lon': la(i)[1]} for i in range(3)]
                await O.evaluate(ADD_OLD, ['DEMO SITE OLD', RO, [['K0', 'K1', 'L12'], ['K1', 'K2', 'L12']], [{'n': 1, 'cab': 'L12', 'side': 'auto', 'ex': False, 'path': ['K0', 'K1', 'K2'], 'fromSt': '', 'toSt': ''}]])
                f1 = await share_get(O, 'The whole project', 'old1.zip')
                await A.evaluate("() => __polecam.team.patchS({ user: { ...__polecam.S.user, company: 'DEMO CONTRACTOR' } })")  # (the company key's company: the profile is complete, a file opens)
                t1 = await open_file(A, f1); rA = await route(A, 'DEMO SITE OLD')
                check('V1 a Share file from the real v2.42.28 app (whole project) opens: 3 records, its 2 spans and its cable RUN 1', ver == 'v2.42.28' and len(await recs(A, 'DEMO SITE OLD')) == 3 and spans(rA) == ['CC-2000-CC-2001', 'CC-2001-CC-2002'] and [f['n'] for f in rA['fibers']] == [1] and 'the route: 2 spans added, 0 removed; 1 cable added, 0 removed' in t1, (ver, t1, rA))
                await mbx(A, 'seed', 'DEMO SITE OLD', 1, {'from': 0, 'prefix': 'JD-'})
                await mbx(A, 'link', 'DEMO SITE OLD', [['CC-2002', 'JD-1001']])
                await O.evaluate("() => { const S = __polecam.S, m = S.meta['DEMO SITE OLD']; S.meta['DEMO SITE OLD'] = { ...m, links: m.links.filter((l) => !(l.includes('old_K0') && l.includes('old_K1'))), linksAt: new Date().toISOString() }; __polecam.persist(); }")
                f2 = await share_get(O, 'Only the changes', 'old2.zip')
                t2 = await open_file(A, f2); rA = await route(A, 'DEMO SITE OLD')
                check('V2 its next update (only the changes, one span removed): only that span goes; Juan\'s own span stays; the cable stays RUN 1', spans(rA) == ['CC-2001-CC-2002', 'CC-2002-JD-1001'] and [f['n'] for f in rA['fibers']] == [1] and '0 spans added, 1 removed' in t2, (t2, spans(rA)))
            check('Z1 no page errors', not (ea + eb + em + eo), ea + eb + em + eo)
            for c in (ca, cb, cm, co):
                if c: await c.close()
    finally:
        srv.terminate()
        if old: old.terminate()
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed' + (f': {bad}' if bad else ''))
asyncio.run(main())
