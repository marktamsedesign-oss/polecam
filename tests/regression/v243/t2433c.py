"""v2.43.0 beta 3 (synthetic data only; from t2432c, beta 2.2): the fixes now go as a fix list over the map: projects through the company mailbox, end to end, on four phones of DEMO CONTRACTOR:
Juan and Ana (coordinators), Pedro and Maria (field partners). The app talks to the REAL v2.43 sheet script and the REAL mailbox
Code.gs on their in-memory stand-ins (e2e/servers.js); direct uploads go to the local upload server, which answers as Google's
resumable upload does (308 and Range per 4 MB piece) and can drop a connection mid-piece or refuse the direct send."""
import asyncio, sys, os, json, shutil, subprocess, urllib.request, urllib.parse, time, re
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765'; E2E = 'http://127.0.0.1:8781'; OUT = S + '/v243/out_c3'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
SHEET_ID = 'TEST'; MBX_URL = 'https://script.google.com/macros/s/AKfycbE2EMailboxDemoContractor01/exec'
CKEY = 'DMCA7KQ4MX2P'; JUAN = 'juan@demo-contractor.example'; PEDRO = 'pedro@demo-contractor.example'
MARIA = 'maria@demo-contractor.example'; ANA = 'ana@demo-contractor.example'; PROJ = 'DEMO SITE MINTAL'
W = lambda pg, ms: pg.wait_for_timeout(ms)
checks = []
def check(name, ok, info=''):
    checks.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  ← {str(info)[:500]}'), flush=True)
def e2e(path, body=None):
    req = urllib.request.Request(E2E + path, data=(json.dumps(body).encode() if body is not None else None), method='POST' if body is not None else 'GET')
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
TEAM_ACTIONS = {'teamCode', 'teamVerify', 'team', 'teamRole', 'teamJoin', 'teamAnswer', 'teamRemove', 'teamLeave', 'mailboxSet', 'mailboxKey', 'teamApprove', 'teamCoords', 'teamCoordSet'}  # (beta 3.3: approvals)
def sheet_read(url, mock):  # beta 3.2 (QA-17): the REAL sheet script's answer to this read says whether Team is on; merged into the mock
    q = url.split('?', 1)[1] if '?' in url else ''
    try: r = json.loads(urllib.request.urlopen(E2E + '/sheet?' + q, timeout=20).read().decode())
    except Exception: r = {}
    if isinstance(r.get('teamOn'), bool): mock['teamOn'] = r['teamOn']
    return mock
async def google(route):
    rq = route.request; url = rq.url
    if '/macros/s/' + SHEET_ID + '/' in url:
        if rq.method == 'POST':
            body = json.loads(rq.post_data or '{}')
            if body.get('action') in TEAM_ACTIONS:
                r = urllib.request.urlopen(urllib.request.Request(E2E + '/sheet', data=rq.post_data.encode(), method='POST'), timeout=20).read()
                return await route.fulfill(status=200, content_type='application/json', body=r, headers={'Access-Control-Allow-Origin': '*'})
            return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}', headers={'Access-Control-Allow-Origin': '*'})
        return await route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(sheet_read(url, {'ok': True, 'name': 'Test sheet', 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False})))
    if url.startswith(MBX_URL):
        r = urllib.request.urlopen(urllib.request.Request(E2E + '/mbx', data=(rq.post_data or '{}').encode(), method='POST'), timeout=60).read()
        return await route.fulfill(status=200, content_type='application/json', body=r, headers={'Access-Control-Allow-Origin': '*'})
    return await route.fulfill(status=404, body='{}')
async def new_ctx(p, udir, w=412):
    ctx = await p.chromium.launch_persistent_context(udir, executable_path=common.CHROME, viewport={'width': w, 'height': 900}, service_workers='block')
    await ctx.route('https://script.google.com/**', google)
    for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**', 'https://build.protomaps.com/**'): await ctx.route(u, lambda r: r.abort())
    for js in (common.NO_DRAFT_JS, common.NO_SAVECHECK_JS, common.NO_SAMPLE_JS, common.ADM_OPEN_JS): await ctx.add_init_script(js)
    await ctx.add_init_script("window.GESAA_CHANNEL='beta'")
    pg = ctx.pages[0]; errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    return ctx, pg, errs
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button').first.click(); await W(pg, 250); continue
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 250)
async def setup(pg, name, email):
    await pg.goto(BASE + '/index.html'); await W(pg, 1500)
    await pg.fill('#pfName', name); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', email)
    await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
    await pg.fill('#admName', 'Globe OSP'); await common.sheet_companies(pg, ['GLOBE', 'DEMO CONTRACTOR'], admins=['GLOBE'])
    await pg.click('#admSave'); await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
    if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
    for _ in range(3):
        if not await pg.locator('#askBox:not([hidden])').count(): break
        b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
    await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
    await pg.evaluate("(k) => __polecam.team.patchS({ companyKey: k, keyCompany: 'DEMO CONTRACTOR' })", CKEY)
    await pg.evaluate("() => __polecam.team.sync()"); await W(pg, 300)  # beta 3.2 (QA-17): the sheet says Team is on for DEMO CONTRACTOR
async def answer(pg, label, ms=15000):
    await pg.wait_for_selector('#askBox:not([hidden])', timeout=ms); await W(pg, 200)
    await pg.locator('#askBox button', has_text=label).first.click(); await W(pg, 400)
async def ask_text(pg, ms=15000):
    await pg.wait_for_selector('#askBox:not([hidden])', timeout=ms); await W(pg, 150)
    return (await pg.text_content('#askTitle') or '') + ' | ' + (await pg.text_content('#askText') or '')
async def idle(pg, ms=30000):
    t = time.time(); await W(pg, 120)
    while time.time() - t < ms / 1000:
        if not await pg.locator('#busy:not([hidden])').count(): return
        await W(pg, 150)
async def open_team(pg):
    await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 500)
    await pg.click('#goTeam'); await W(pg, 800); await idle(pg)
async def confirm_email(pg, email):
    await pg.click('#tmSend'); await idle(pg); await W(pg, 300)
    code = e2e('/mail?to=' + email)['code']
    await pg.fill('#tmCode', code); await pg.click('#tmVerify'); await idle(pg); await W(pg, 400)
async def role(pg, r):
    await pg.click(f'#tmRole .chip[data-v="{r}"]'); await idle(pg); await W(pg, 300)
    if r == 'Coordinator':  # beta 3.3 (QA-08): a coordinator is approved first: the admin types Yes in the Team tab; the phone reads its team again
        em = await pg.evaluate("() => (__polecam.S.user || {}).email || ''")
        e2e('/teamyes?email=' + urllib.parse.quote(em)); await pg.click('#tmRefresh'); await idle(pg); await W(pg, 300)
async def txt(pg, sel): return (await pg.text_content(sel) or '').strip()
async def mbx(pg, fn, *a): return await pg.evaluate(f"(a) => __polecam.team.mbx.{fn}(...a)", list(a))
async def projects(pg, check_mail=True):
    await close_sheets(pg); await pg.click('#projectBtn'); await W(pg, 400)
    if check_mail: await pg.click('#mbxCheckIn'); await idle(pg); await W(pg, 300)
async def inbox(pg): return await pg.eval_on_selector_all('#mbxIn .tmrow', "(d) => d.map((x) => x.textContent)")
async def open_in(pg, i=0): await pg.locator('#mbxIn [data-mbxopen]').nth(i).click(); await W(pg, 300)
async def toast(pg): return await txt(pg, '#toast')
async def open_proj(pg, name):
    if await pg.evaluate("__polecam.S.project") != name: await common.pick_project(pg, name)
async def send_sheet(pg): await pg.click('#curTeam [data-ct="send"]'); await W(pg, 500)
PROG_JS = """() => ({ prog: !document.getElementById('mbxProg').hidden, pct: document.getElementById('mbxPct').textContent, line: document.getElementById('mbxLine').textContent,
  sub: document.getElementById('mbxSub').textContent, steps: document.getElementById('mbxSteps').textContent, done: !!document.getElementById('mbxDone'), back: !!document.getElementById('mbxBack'), err: !document.getElementById('mbxSendErr').hidden })"""
async def send_go(pg, ms=60000):
    """Send in the Send screen (beta 2.1): its progress shows there; wait for Done (or Back), note what it showed, tap Done."""
    t = time.time(); seen = []; await pg.click('#mbxGo'); st = {}
    while time.time() - t < ms / 1000:
        st = await pg.evaluate(PROG_JS); seen.append((st['pct'], st['line'], st['sub']))
        if st['done'] or st['back'] or (st['err'] and not st['prog']): break
        if not st['prog'] and time.time() - t > 3: break
        await W(pg, 80)
    st['seen'] = seen
    if st.get('done'): await pg.click('#mbxDone'); await W(pg, 400)
    return st
async def dl(pg, i=0, ms=60000, card=False):
    """Download and merge (beta 2.1): from the inbox, or from the project's card; its progress shows in place. The job at the end."""
    if card: await pg.locator('#curTeam [data-ct="dl"]').nth(i).click()
    else: await pg.locator('#mbxIn [data-mbxopen]').nth(i).click()
    t = time.time(); stages = set(); j = None
    while time.time() - t < ms / 1000:
        j = await pg.evaluate("() => __polecam.team.mbx.job()")
        if j: stages.add(j['stage'])
        if not j or j['stage'] in ('done', 'fail'): break
        await W(pg, 60)
    await idle(pg, 20000); await W(pg, 300)
    return j, stages
ACC_JS = "() => { const b = document.querySelector('#curTeam [data-ct=\"accept\"]'); return b ? b.disabled : null; }"
ICON_JS = "() => { const b = document.querySelector('#curTools .tmtool[data-tool=\"mbx\"]'); return b ? [b.classList.contains('wait'), (b.querySelector('.bdg') || {}).textContent || '', !!b.querySelector('.okd')] : null; }"
DOT_JS = "() => !document.getElementById('mbxDot').hidden"
FXJ = "(a) => __polecam.team.mbx.fx[a[0]](...a.slice(1))"
async def fxh(pg, fn, *a): return await pg.evaluate(FXJ, [fn, *a])
async def fxclick(pg, k): await pg.click(f'#fxBody [data-fx="{k}"]'); await W(pg, 250)
async def fxitem(pg, pid, why, note):
    await fxh(pg, 'tap', pid); await W(pg, 300); await pg.click(f'#fxBody .fx-tile[data-w="{why}"]')
    if note: await pg.fill('#fxItemNote', note)
    await fxclick(pg, 'save')
def drive_names(prefix=''): return [f for f in e2e('/drive') if f.startswith(prefix)]

KML = """<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>AS-PLAN</name>
<Placemark><name>Route</name><LineString><coordinates>125.6,7.07,0 125.602,7.072,0 125.604,7.074,0</coordinates></LineString></Placemark>
<Placemark><name>P1</name><Point><coordinates>125.6,7.07,0</coordinates></Point></Placemark>
<Placemark><name>P2</name><Point><coordinates>125.604,7.074,0</coordinates></Point></Placemark></Document></kml>"""
KML2 = KML.replace('<name>AS-PLAN</name>', '<name>AS-PLAN REV 2</name>').replace('</Document>', '<Placemark><name>Spur</name><LineString><coordinates>125.602,7.072,0 125.603,7.0705,0</coordinates></LineString></Placemark></Document>')

async def main():
    open(OUT + '/asplan.kml', 'w').write(KML); open(OUT + '/asplan2.kml', 'w').write(KML2)
    srv = subprocess.Popen(['node', S + '/v243/e2e/servers.js'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT); time.sleep(1.5)
    try:
        async with async_playwright() as p:
            ca, A, ea = await new_ctx(p, OUT + '/ud_juan'); await setup(A, 'Juan Dela Cruz', JUAN)
            cb, B, eb = await new_ctx(p, OUT + '/ud_pedro'); await setup(B, 'Pedro Santos', PEDRO)
            cm, M, em = await new_ctx(p, OUT + '/ud_maria'); await setup(M, 'Maria Garcia', MARIA)
            cn, N, en = await new_ctx(p, OUT + '/ud_ana'); await setup(N, 'Ana Reyes', ANA)
            # ---------- the team, as in beta 1
            await open_team(A); await confirm_email(A, JUAN); await role(A, 'Coordinator')
            await A.click('#tmMbxSetup'); await W(A, 500); await A.fill('#mbxUrl', MBX_URL); await A.click('#mbxSave'); await idle(A, 40000); await W(A, 400)
            await open_team(N); await confirm_email(N, ANA); await role(N, 'Coordinator')
            for pg, em_ in ((B, PEDRO), (M, MARIA)):
                await open_team(pg); await confirm_email(pg, em_); await role(pg, 'Field Partner')
                await pg.locator('#tmCoList .tmrow', has_text='Juan Dela Cruz').locator('[data-join]').click(); await idle(pg)
            await open_team(A)
            for _ in range(2): await A.locator('#tmMemList [data-accept]').first.click(); await idle(A); await W(A, 300)
            for pg in (B, M, N): await pg.click('#tmRefresh') if await pg.is_visible('#tmRefresh') else None; await idle(pg)
            st = [await pg.evaluate("() => __polecam.team.state()") for pg in (A, B, M, N)]
            check('S1 four phones: Juan has the mailbox and two field partners; Pedro, Maria and Ana have the mailbox', all(x['mbx'] and x['mbx']['url'] == MBX_URL for x in st) and len([m for m in st[0]['snap']['members'] if m['status'] == 'in']) == 2, [bool(x['mbx']) for x in st])
            # ---------- 0. a field partner in a team does not start surveys
            await close_sheets(B); await B.click('#projectBtn'); await W(B, 300); await B.click('#newProjBtn'); await W(B, 300)
            so = await B.evaluate("() => { const o = document.querySelector('#npCat option[value=survey]'); return [o.disabled, o.textContent]; }")
            check('N1 Pedro (field partner in Juan\'s team): Survey is off, from your coordinator; the screen says so', so == [True, 'Survey (from your coordinator)'] and await B.is_visible('#npFpInfo') and await B.evaluate("() => !document.querySelector('#npCat option[value=Cleanup]').disabled"), so)
            await B.evaluate("() => { const o = document.querySelector('#npCat option[value=survey]'); o.disabled = false; document.getElementById('npCat').value = 'survey'; }"); await B.fill('#npName', 'PEDRO OWN'); await B.click('#npCreate'); await W(B, 400)
            check('N2 and Create refuses a survey even if picked', 'Surveys come from your coordinator' in await toast(B) and 'PEDRO OWN' not in await B.evaluate("__polecam.S.projects"), await toast(B))
            await close_sheets(B)
            # ---------- 1. Juan: New project → Assign to Pedro and Maria, with an As-Plan KMZ
            await close_sheets(A); await A.click('#projectBtn'); await W(A, 300); await A.click('#newProjBtn'); await W(A, 300)
            check('A0 Assign to is hidden until the category is Survey', not await A.is_visible('#npAssignBox'))
            await A.select_option('#npCat', 'survey'); await W(A, 200)
            chips = await A.eval_on_selector_all('#npAssign .chip', "(d) => d.map((x) => [x.textContent, x.getAttribute('aria-pressed')])")
            check('A1 Assign to: Me (chosen), Pedro Santos, Maria Garcia; the button says Create project', chips == [['Me', 'true'], ['Pedro Santos', 'false'], ['Maria Garcia', 'false']] and await txt(A, '#npCreate') == 'Create project', chips)
            await A.select_option('#npPurpose', 'As-plan'); await A.fill('#npName', PROJ); await A.set_input_files('#npKmzInput', OUT + '/asplan.kml'); await W(A, 300)
            await A.click('#npAssign .chip:has-text("Pedro Santos")'); await A.click('#npAssign .chip:has-text("Maria Garcia")'); await W(A, 200)
            check('A2 two partners chosen: Me off, Create and send', await A.get_attribute('#npAssign .chip:has-text("Me")', 'aria-pressed') == 'false' and await txt(A, '#npCreate') == 'Create and send' and '2 field partners' in await txt(A, '#npAssignInfo'), await txt(A, '#npAssignInfo'))
            await A.screenshot(path=f'{OUT}/a_newproj.png')
            await A.click('#npCreate'); await idle(A, 40000); await W(A, 600)
            out = await mbx(A, 'out')
            check('A3 sent: two tasks waiting (Pedro, Maria), with the project\'s KMZ', sorted(o['to'] for o in out if o['kind'] == 'task' and o['st'] == 'waiting') == sorted([PEDRO, MARIA]) and 'sent to Pedro and Maria' in await toast(A), (out, await toast(A)))
            files = e2e('/drive'); man = [f for f in files if f.endswith('.json') and f.startswith('g')]
            check('A4 the mailbox holds one complete transfer per partner (whole file + manifest)', len(man) == 2 and len([f for f in files if f.endswith('.gesaa')]) == 2, files)
            refsA = await mbx(A, 'refs')
            check('A5 Juan\'s project keeps its KMZ (1 line, 2 pins)', PROJ in refsA and refsA[PROJ]['n']['lines'] == 1 and refsA[PROJ]['n']['pins'] == 2, refsA)
            await close_sheets(A); await A.click('#projectBtn'); await W(A, 400)
            ct = await txt(A, '#curTeam')
            check('A6 Juan\'s project: Assigned to Pedro and Maria, task waiting; Ask for fixes; no Accept before an update is merged, and it says so', 'Assigned to' in ct and 'Pedro Santos: task waiting' in ct and 'Maria Garcia: task waiting' in ct and await A.is_visible('#curTeam [data-ct="fix"]') and not await A.is_visible('#curTeam [data-ct="accept"]') and 'Waiting for Pedro and Maria’s first update' in ct, ct)
            check('A7 the project tools (icons): the mailbox (✓, nothing waiting), Send, Share, KMZ, Delete', await A.eval_on_selector_all('#curTools .tmtool', "(d) => d.map((x) => x.dataset.tool)") == ['mbx', 'send', 'share', 'ref', 'del'] and await A.evaluate(ICON_JS) == [False, '', True], await A.eval_on_selector_all('#curTools .tmtool', "(d) => d.map((x) => x.dataset.tool)"))
            # ---------- 2. Pedro downloads his task
            await projects(B)
            ib = await inbox(B); await B.screenshot(path=f'{OUT}/p_inbox.png')
            check('P1 Pedro\'s Team mailbox: Task from Juan Dela Cruz, with Download', len(ib) == 1 and 'Task from Juan Dela Cruz' in ib[0] and 'Download' in ib[0] and PROJ in ib[0], ib)
            await dl(B, ms=40000); await W(B, 500)
            tB = await mbx(B, 'team', PROJ); refsB = await mbx(B, 'refs')
            check('P2 the task is on Pedro\'s phone, open, from Juan, with the KMZ reference', await B.evaluate("__polecam.S.project") == PROJ and tB and tB['role'] == 'fp' and tB['by'] == JUAN and PROJ in refsB and refsB[PROJ]['n']['lines'] == 1, (tB, refsB, await toast(B)))
            check('P3 its mailbox copy is deleted for good (Maria\'s is still there)', len([f for f in e2e('/drive') if f.endswith('.json') and f.startswith('g')]) == 1, e2e('/drive'))
            ct = await txt(B, '#curTeam')
            check('P4 Pedro\'s card: Task from Juan Dela Cruz, Send to coordinator; Juan marks it complete', 'Task from Juan Dela Cruz' in ct and await B.is_visible('#curTeam [data-ct="send"]') and not await B.is_visible('#doneBtn') and 'Juan marks this task complete' in await txt(B, '#doneHint'), (ct, await txt(B, '#doneHint')))
            # ---------- 3. Pedro surveys 3 poles and sends only the changes
            await mbx(B, 'seed', PROJ, 3, {})
            await send_sheet(B)
            to = await B.eval_on_selector_all('#mbxTo label', "(d) => d.map((x) => [x.textContent, x.querySelector('input').checked])")
            what = await B.eval_on_selector_all('#mbxWhat label', "(d) => d.map((x) => [x.textContent, x.querySelector('input').checked, x.querySelector('input').disabled])")
            check('U1 To: Juan (sent you this task) chosen; Ana listed as another coordinator who takes it over', len(to) == 2 and 'Juan Dela Cruz' in to[0][0] and 'sent you this task' in to[0][0] and to[0][1] and 'Ana Reyes' in to[1][0] and 'takes it over' in to[1][0], to)
            await B.screenshot(path=f'{OUT}/p_send.png')
            check('U2 What: Only the changes (3 new · 3 photos, since the task arrived) chosen; The whole project', len(what) == 2 and what[0][1] and '3 new' in what[0][0] and '3 photos' in what[0][0] and 'since the task arrived' in what[0][0] and 'The whole project' in what[1][0], what)
            sg = await send_go(B, 40000); await W(B, 400)
            tb = await toast(B); outB = await mbx(B, 'out')
            check('S1 the Send screen showed the send: the stages, 100 %, then Sent to Juan with Done', 'Sent to Juan' in sg['line'] and sg['pct'] == '100%' and any('Packing' in x[1] or 'Sending' in x[1] for x in sg['seen']) and 'Saving in the mailbox' in sg['steps'], {k: v for k, v in sg.items() if k != 'seen'})
            check('U3 Update 1 sent to Juan straight to Google', 'Update 1 sent to Juan: 3 records' in tb and outB[0]['kind'] == 'update' and outB[0]['n'] == 1 and outB[0]['how'] == 'direct' and outB[0]['st'] == 'waiting', (tb, outB[:1]))
            # ---------- beta 2.2: on a computer, the Projects pane checks the team mailbox
            await close_sheets(A); await A.set_viewport_size({'width': 1440, 'height': 900}); await W(A, 800)
            vis = await A.is_visible('#ppMbx'); await A.click('#ppMbx'); await W(A, 300)
            for _ in range(80):
                if not await A.evaluate("document.getElementById('ppMbx').classList.contains('spin')"): break
                await W(A, 200)
            await W(A, 700)
            st = await A.evaluate("() => ({ n: document.getElementById('ppMbxN').textContent, nh: document.getElementById('ppMbxN').hidden, wait: document.getElementById('ppMbx').classList.contains('wait'), proj: !document.getElementById('projects').hidden, box: !document.getElementById('mbxBox').hidden })")
            tA = await toast(A); await A.screenshot(path=f'{OUT}/j_pane_mbx.png')
            check('H1 Juan on a computer: Check the team mailbox in the Projects pane finds update 1 (1 waiting) and opens the Team mailbox', vis and st['n'] == '1' and not st['nh'] and st['wait'] and st['proj'] and st['box'] and 'one thing waits' in tA, (vis, st, tA))
            row = await A.evaluate("(n) => { const r = [...document.querySelectorAll('#ppRows .pp-row')].find((x) => x.dataset.name === n); const b = r && r.querySelector('.ppi.mbx'); return b ? [b.classList.contains('wait'), (b.querySelector('.bdg') || {}).textContent || ''] : null; }", PROJ)
            check('H2 the project\'s row in the pane shows 1 waiting too', row == [True, '1'], row)
            await close_sheets(A); await A.set_viewport_size({'width': 412, 'height': 900}); await W(A, 600)
            # ---------- 4. Juan downloads and merges
            await projects(A)
            ia = await inbox(A)
            check('J1 Juan\'s Team mailbox: Update 1 from Pedro Santos · 3 records, Download and merge', len(ia) == 1 and 'Update 1 from Pedro Santos' in ia[0] and '3 records' in ia[0] and 'Download and merge' in ia[0], ia)
            await close_sheets(A); await A.click('#projectBtn'); await W(A, 400)
            ct = await txt(A, '#curTeam'); acc = await A.evaluate(ACC_JS); mt = await A.evaluate(ICON_JS); dot = await A.evaluate(DOT_JS)
            await A.locator('#wfBox').screenshot(path=f'{OUT}/j_card_waiting.png')
            check('G1 Juan\'s card: Update 1 from Pedro is waiting, with its own Download and merge; Accept is off until it is merged', 'Update 1 from Pedro is waiting' in ct and await A.is_visible('#curTeam [data-ct="dl"]') and acc is True and 'Merge the waiting update first' in ct, (ct, acc))
            check('G2 the project\'s mailbox icon shows 1 waiting, and the dot is on Projects', mt == [True, '1', False] and dot, (mt, dot))
            j, stg = await dl(A, ms=40000, card=True); await A.locator('#wfBox').screenshot(path=f'{OUT}/j_card_merged.png')
            jb = await txt(A, '#curTeam .mbxjob') if await A.locator('#curTeam .mbxjob').count() else ''
            check('G3 Download and merge on the card: done in place (Merged, Show on the map)', j and j['stage'] == 'done' and j['line'].startswith('Merged:') and 'Show on the map' in jb and 'Merged' in jb, (j, stg, jb))
            recsA = await mbx(A, 'recs', PROJ); ph = await mbx(A, 'photo', recsA[0]['id']) if recsA else 0
            check('J2 merged: 3 records with their photos on Juan\'s phone', len(recsA) == 3 and ph > 0 and 'Update 1 from Pedro merged' in await toast(A), (recsA, ph, await toast(A)))
            ct = await txt(A, '#curTeam'); await A.locator('#wfBox').screenshot(path=f'{OUT}/j_card.png')
            check('J3 Juan\'s card: Pedro has it, update 1 merged; Maria\'s task still waiting', 'Pedro Santos: has it' in ct and 'update 1 merged' in ct and 'Maria Garcia: task waiting' in ct, ct)
            acc = await A.evaluate(ACC_JS); mt = await A.evaluate(ICON_JS); dot = await A.evaluate(DOT_JS)
            check('G4 merged: Accept is on; the mailbox icon shows ✓; no dot on Projects', acc is False and mt == [False, '', True] and not dot, (acc, mt, dot))
            # ---------- 5. Ask for fixes
            await A.click('#curTeam [data-ct="fix"]'); await W(A, 800)
            await fxitem(A, 'CC-1001', 'Owner', 'CC-1001: owner name'); await fxitem(A, 'CC-1003', 'Delete it', 'wrong pole, delete it')
            chips = await A.eval_on_selector_all('#fxBody .fx-to .chip', "(d) => d.map((x) => [x.textContent, x.getAttribute('aria-pressed')])")
            await A.screenshot(path=f'{OUT}/j_fix.png')
            check('F1 Ask for fixes: the fix list over the map; To: Pedro (has it) ticked, Maria (no project yet) not', await A.is_visible('#fixPanel') and len(await fxh(A, 'draft', PROJ)) == 2 and chips == [['Pedro Santos', 'true'], ['Maria Garcia (no project yet)', 'false']], chips)
            await fxclick(A, 'send'); await idle(A, 60000); await W(A, 400)
            check('F2 sent: 2 fixes to Pedro', '2 fixes sent to Pedro' in await toast(A) and not await A.is_visible('#fixPanel'), await toast(A))
            await close_sheets(B); sb = await B.is_visible('#syncBtn'); lbl = await B.get_attribute('#syncBtn', 'aria-label') or ''
            await B.click('#syncBtn'); await W(B, 300)
            for _ in range(80):
                if not await B.evaluate("document.getElementById('syncBtn').classList.contains('spin')"): break
                await W(B, 200)
            await W(B, 300); tb = await toast(B); dot = await B.evaluate(DOT_JS)
            check('Y1 Pedro\'s Sync (top bar) checks the team mailbox too: 1 waiting, and the dot on Projects', sb and 'check the team mailbox' in lbl and 'team mailbox: 1 waiting' in tb and dot, (sb, lbl, tb, dot))
            await projects(B); ib = await inbox(B)
            check('F3 Pedro: Fixes asked by Juan Dela Cruz, Open', len(ib) == 1 and 'Fixes asked by Juan Dela Cruz' in ib[0] and 'Open' in ib[0], ib)
            await open_in(B); await idle(B, 30000); await W(B, 800)
            t = await txt(B, '#fxBody')
            await close_sheets(B); await B.click('#projectBtn'); await W(B, 400)
            check('F4 Open: the fix list opens over the map with Juan’s note; the card keeps it until it is done', 'CC-1001: owner name' in t and 'Fixes from Juan · 0 of 2 done' in await txt(B, '#curTeam'), (t, await txt(B, '#curTeam')))
            # ---------- 6. Pedro fixes (one edited, one deleted) and sends update 2
            await mbx(B, 'edit', PROJ, 'CC-1001', 'CC-1001A'); await mbx(B, 'del', PROJ, 'CC-1003'); await W(B, 200)
            await send_sheet(B)
            what = await B.eval_on_selector_all('#mbxWhat label', "(d) => d.map((x) => [x.textContent, x.querySelector('input').checked])")
            check('U4 Only the changes: 1 record changed · 1 deleted, since update 1', what[0][1] and '1 record changed' in what[0][0] and '1 deleted' in what[0][0] and 'since update 1' in what[0][0], what)
            sg = await send_go(B, 40000); await W(B, 400)
            check('U5 update 2 sent; the fixes note is cleared on Pedro\'s card', 'Update 2 sent to Juan' in await toast(B) and 'Fixes asked' not in await txt(B, '#curTeam'), (await toast(B), await txt(B, '#curTeam')))
            await projects(A); await dl(A, ms=40000); await W(A, 400)
            ids = sorted(r['poleId'] for r in await mbx(A, 'recs', PROJ))
            check('J4 update 2 merged: CC-1001A changed, CC-1003 deleted on Juan\'s phone too', ids == ['CC-1001A', 'CC-1002'], ids)
            # ---------- 6b. Juan adds a pole and a new KMZ: only the changes to Pedro; Maria's waiting task is replaced by the whole project
            await mbx(A, 'seed', PROJ, 1, {'from': 60, 'prefix': 'JD-'})
            mt0 = [o for o in await mbx(A, 'out') if o['to'] == MARIA and o['kind'] == 'task'][0]
            await close_sheets(A); await A.click('#projectBtn'); await W(A, 300); await close_sheets(A)
            await A.set_input_files('#refInput', OUT + '/asplan2.kml'); t = await ask_text(A, 20000)
            check('C1 a new KMZ on a sent project: Juan is asked to send it to Pedro and Maria, with the changes', 'Send the new KMZ' in t and 'Pedro and Maria' in t and 'changes since your last send' in t, t)
            await answer(A, 'Send'); await idle(A, 60000); await W(A, 400)
            out = await mbx(A, 'out'); toP = [o for o in out if o['to'] == PEDRO][0]; toM = [o for o in out if o['to'] == MARIA]
            check('C2 to Pedro: only the changes (update 2: 1 record, the KMZ); to Maria: the whole project again, the waiting task replaced', toP['kind'] == 'update' and not toP['full'] and toP['n'] == 2 and toP['recs'] == 1 and toM[0]['kind'] == 'task' and toM[0]['full'] and [o['st'] for o in toM if o['tid'] == mt0['tid']] == ['replaced'], (toP, toM[:2]))
            check('C3 the replaced task left the mailbox', not [f for f in e2e('/drive') if f.startswith(mt0['tid'])], e2e('/drive'))
            await projects(B); ib = await inbox(B)
            check('C4 Pedro: Update 2 from Juan Dela Cruz · 1 record, Download and merge', len(ib) == 1 and 'Update 2 from Juan Dela Cruz' in ib[0] and '1 record' in ib[0] and 'Download and merge' in ib[0], ib)
            j, stg = await dl(B, ms=40000); await B.locator('#mbxBox').screenshot(path=f'{OUT}/p_merged.png')
            refsB = await mbx(B, 'refs'); tB = await mbx(B, 'team', PROJ); ct = await txt(B, '#curTeam')
            check('C5 merged on Pedro\'s phone: JD-1061 and the new KMZ (2 lines); still his task from Juan; the card says update 2 merged', any(r['poleId'] == 'JD-1061' for r in await mbx(B, 'recs', PROJ)) and refsB[PROJ]['n']['lines'] == 2 and tB['role'] == 'fp' and tB['by'] == JUAN and 'Update 2 from Juan merged' in ct and j and j['stage'] == 'done', (refsB.get(PROJ), tB and tB.get('role'), ct, j))
            check('C6 the inbox row showed the download in place: Merged, Show on the map', 'Merged' in (await txt(B, '#mbxIn')) and await B.is_visible('#mbxIn [data-jobgo]'), await txt(B, '#mbxIn'))
            cg = await fxh(B, 'chg', PROJ); ct = await txt(B, '#curTeam')
            check('C6b what changed works both ways: Pedro sees Juan\'s update 2 (JD-1061 new) on his card', cg and cg['n'] == 2 and any(x['kind'] == 'new' and 'JD-1061' in str(x) for x in cg['items']) and 'Last update from Juan' in ct and 'What changed' in ct, (cg, ct))
            await mbx(A, 'seed', PROJ, 1, {'from': 61, 'prefix': 'JD-'})
            await close_sheets(A); await A.click('#projectBtn'); await W(A, 300); await A.click('#curTools .tmtool[data-tool="send"]'); await W(A, 500)
            to = await A.eval_on_selector_all('#mbxTo label', "(d) => d.map((x) => [x.textContent, x.querySelector('input').checked])")
            what = await A.eval_on_selector_all('#mbxWhat label', "(d) => d.map((x) => [x.textContent, x.querySelector('input').checked, x.querySelector('input').disabled])")
            info = await txt(A, '#mbxSendInfo'); await A.screenshot(path=f'{OUT}/j_send_changes.png')
            check('C7 Juan\'s Send: Pedro and Maria chosen; What: Only the changes (1 new, since your last send) by default; Maria gets the whole project in place of the waiting one', len(to) == 2 and all(x[1] for x in to) and what and what[0][1] and 'Only the changes' in what[0][0] and '1 new' in what[0][0] and 'since your last send' in what[0][0] and 'Maria has not downloaded it yet' in info and 'in place of the one still waiting' in info and 'Pedro: only the changes' in info, (to, what, info))
            await A.locator('#mbxTo label', has_text='Maria Garcia').locator('input').uncheck(); await W(A, 200)
            sg = await send_go(A, 60000)
            check('C8 sent in the Send screen: Sent to Pedro, Done', 'Sent to Pedro' in sg['line'] and sg['pct'] == '100%', {k: v for k, v in sg.items() if k != 'seen'})
            await projects(B); j, stg = await dl(B, ms=40000)
            check('C9 Pedro merges update 3 from Juan: JD-1062', any(r['poleId'] == 'JD-1062' for r in await mbx(B, 'recs', PROJ)), await mbx(B, 'recs', PROJ))
            # ---------- 7. A bigger update, 4 MB pieces, the line drops in the middle of the second piece
            await mbx(B, 'seed', PROJ, 4, {'noise': True, 'px': 1100, 'from': 10})
            e2e('/chunks?reset=1&drop=2')
            await send_sheet(B); sg = await send_go(B, 90000); await W(B, 400)
            ch = e2e('/chunks'); outB = await mbx(B, 'out'); big = outB[0]
            pcts = [int(x[0].rstrip('%')) for x in sg['seen'] if x[0].endswith('%')]
            check('B0 the Send screen counted it up (between 0 and 100 %) and said the signal dropped and it carried on', any(0 < v < 100 for v in pcts) and any('Signal dropped: carrying on from' in x[2] for x in sg['seen']) and sg['done'], (sorted(set(pcts))[:12], [x[2] for x in sg['seen'] if 'Signal' in x[2]][:2]))
            check('B1 update 3 (about %.1f MB) went straight to Google in 4 MB pieces, and carried on after the dropped piece' % (big['size'] / 1048576), big['n'] == 3 and big['how'] == 'direct' and big['size'] > 5 * 1048576 and ch['puts'] >= 3 and ch['dropAt'] == 0 and ch['probes'] >= 1, (big, ch))
            await projects(A); await dl(A, ms=90000); await W(A, 400)
            recsA = await mbx(A, 'recs', PROJ); recsB = await mbx(B, 'recs', PROJ)
            szA = [await mbx(A, 'photo', r['id']) for r in recsA if r['poleId'] in ('CC-1011', 'CC-1014')]; szB = [await mbx(B, 'photo', r['id']) for r in recsB if r['poleId'] in ('CC-1011', 'CC-1014')]
            check('B2 Juan downloads it in 2 MB ranges (4 at once), checked, merged: the same photos, byte for byte', len(recsA) == 8 and szA == szB and min(szA) > 300000, (len(recsA), szA, szB))
            # ---------- 8. Google refuses the direct send on Pedro's phone: in pieces through the script
            e2e('/direct?on=0'); await mbx(B, 'edit', PROJ, 'CC-1002', 'CC-1002A')
            await send_sheet(B); sg = await send_go(B, 60000); await W(B, 400)
            outB = await mbx(B, 'out')
            check('D1 refused: update 4 goes through the mailbox script and says so', outB[0]['n'] == 4 and outB[0]['how'] == 'script' and 'through the mailbox script' in await toast(B), (outB[0], await toast(B)))
            e2e('/direct?on=1'); await mbx(B, 'noDirect', False)
            # Google's Range header hidden from the page and a dropped piece: Pedro cannot tell what arrived, so the script takes over
            e2e('/chunks?reset=1&drop=2&range=0'); await mbx(B, 'edit', PROJ, 'CC-1011', 'CC-1011A'); await mbx(B, 'seed', PROJ, 3, {'noise': True, 'px': 1100, 'from': 20})
            await send_sheet(B); sg = await send_go(B, 120000); await W(B, 400)
            outB = await mbx(B, 'out'); ch = e2e('/chunks?range=1&drop=0&reset=1')
            check('D2 a dropped piece with no Range to read: the send starts again through the script and arrives', outB[0]['n'] == 5 and outB[0]['how'] == 'script' and outB[0]['st'] == 'waiting' and ch['probes'] >= 1, (outB[0], ch))
            await mbx(B, 'noDirect', False)
            await projects(A)
            for _ in range(2): await dl(A, ms=120000); await W(A, 300)
            ids = sorted(r['poleId'] for r in await mbx(A, 'recs', PROJ))
            check('D3 Juan merges updates 4 and 5: identical to Pedro\'s project', ids == sorted(r['poleId'] for r in await mbx(B, 'recs', PROJ)) and 'CC-1002A' in ids and 'CC-1011A' in ids and 'JD-1062' in ids and len(ids) == 11, ids)
            check('D4 nothing of Pedro\'s left in the mailbox (pieces, whole files, manifests)', not [f for f in e2e('/drive') if f.startswith('g') and not any(f.startswith(o['tid']) for o in await mbx(A, 'out') if o['to'] == MARIA)], e2e('/drive'))
            # ---------- 9. Juan is away: Pedro sends to Ana, who takes it over and accepts
            await send_sheet(B); await B.locator('#mbxTo label', has_text='Ana Reyes').locator('input').check(); await W(B, 300)
            what = await B.eval_on_selector_all('#mbxWhat label', "(d) => d.map((x) => [x.textContent, x.querySelector('input').checked])")
            check('T1 to Ana: only The whole project (she has not had it), and the app says why', len(what) == 1 and 'The whole project' in what[0][0] and what[0][1] and 'Ana has not had this project from you' in await txt(B, '#mbxSendInfo'), (what, await txt(B, '#mbxSendInfo')))
            sg = await send_go(B, 60000); await W(B, 300)
            await projects(N); ib = await inbox(N)
            check('T2 Ana: Update 1 (the whole project) from Pedro Santos', len(ib) == 1 and 'Update 1 (the whole project) from Pedro Santos' in ib[0], ib)
            await dl(N, ms=60000); await W(N, 400)
            ct = await txt(N, '#curTeam')
            check('T3 Ana has the project (11 records), taken over from Juan Dela Cruz, with Accept (on: the update is merged)', len(await mbx(N, 'recs', PROJ)) == 11 and 'taken over from Juan Dela Cruz' in ct and await N.is_visible('#curTeam [data-ct="accept"]') and await N.evaluate(ACC_JS) is False, ct)
            await N.click('#curTeam [data-ct="accept"]'); t = await ask_text(N); await answer(N, 'Accept'); await idle(N, 30000); await W(N, 300)
            check('T4 Accept tells Pedro, and Juan that Ana took it over; the card says Accepted on the date and time', 'Pedro' in t and 'Juan' in t and 'took it over' in t and re.search(r'Accepted on \w{3} \d{1,2}, \d{1,2}:\d{2}', await txt(N, '#curTeam')), (t, await txt(N, '#curTeam')))
            await projects(B); ib = await inbox(B)
            check('T5 Pedro: Ana Reyes accepted your survey', len(ib) == 1 and 'Ana Reyes accepted your survey' in ib[0], ib)
            await open_in(B); await W(B, 400)
            ct = await txt(B, '#curTeam'); tools = await B.eval_on_selector_all('#curTools .tmtool', "(d) => d.map((x) => x.dataset.tool)")
            check('T6 Pedro\'s task: accepted by Ana Reyes (with the date and time), done; no Send, no Mark task complete (the coordinator completes it)', re.search(r'Accepted by Ana Reyes on \w{3} \d{1,2}, \d{1,2}:\d{2}', ct) and 'send' not in tools and not await B.is_visible('#curTeam [data-ct="send"]') and not await B.is_visible('#doneBtn'), (ct, tools))
            await close_sheets(B); await B.click('#captureBtn'); await W(B, 400)
            check('T7 the camera does not open on an accepted task', 'was accepted by Ana Reyes' in await toast(B) and await B.is_hidden('#camera'), await toast(B))
            await projects(A); ia = await inbox(A)
            check('T8 Juan: Note from Ana Reyes', len(ia) == 1 and 'Note from Ana Reyes' in ia[0], ia)
            await open_in(A); t = await ask_text(A); await answer(A, 'OK')
            check('T9 the note says Ana took it over and accepted it', 'took over' in t and PROJ in t, t)
            # ---------- 10. Maria never downloads: 7 days later, Juan resends
            mt = [o for o in await mbx(A, 'out') if o['to'] == MARIA and o['kind'] == 'task'][0]
            e2e(f"/age?tid={mt['tid']}&days=8")
            await projects(A); await A.click('#mbxOutBox summary'); await W(A, 300)
            ot = await A.eval_on_selector_all('#mbxOut .tmrow', "(d) => d.map((x) => x.textContent)")
            row = [r for r in ot if 'Task → Maria Garcia' in r]; await A.locator('#mbxBox').screenshot(path=f'{OUT}/j_sent.png')
            check('E1 Juan\'s Sent: Maria\'s task not picked up in 7 days, removed, with Resend', row and 'not picked up in 7 days' in row[0] and 'Resend' in row[0], ot)
            check('E2 the mailbox removed it (clean-up)', not [f for f in e2e('/drive') if f.startswith(mt['tid'])], e2e('/drive'))
            await A.locator('#mbxOut .tmrow', has_text='Task → Maria Garcia').locator('[data-mbxresend]').click(); await idle(A, 60000); await W(A, 300)
            await projects(M); ib = await inbox(M)
            check('E3 Resend: Maria gets the task again (now the whole project, 11 records)', len(ib) == 1 and 'Task from Juan Dela Cruz' in ib[0] and '11 records' in ib[0], ib)
            # ---------- 11. Maria downloads, surveys one pole, then leaves Juan's team: the task goes back first
            await dl(M, ms=60000); await W(M, 400)
            await mbx(M, 'seed', PROJ, 1, {'from': 40, 'prefix': 'MG-'})
            await open_team(M); await M.locator('#tmCoList .tmrow', has_text='Juan Dela Cruz').locator('[data-leave]').click()
            await answer(M, 'Leave the team'); t = await ask_text(M)
            check('L1 leaving: the app offers to send the unfinished task back to Juan first', 'Send your tasks back to Juan' in t and PROJ in t, t)
            await answer(M, 'Send back and leave'); await idle(M, 60000); await W(M, 500)
            stM = await M.evaluate("() => __polecam.team.state()")
            check('L2 Maria left the team (the sheet says so), after sending', 'Left' in await txt(M, '#tmCoList') and (await mbx(M, 'out'))[0]['kind'] == 'update', await txt(M, '#tmCoList'))
            await close_sheets(M); await M.click('#projectBtn'); await W(M, 300); await M.click('#newProjBtn'); await W(M, 300)
            check('N3 Maria, out of every team, can start a survey again', await M.evaluate("() => !document.querySelector('#npCat option[value=survey]').disabled") and not await M.is_visible('#npFpInfo'))
            await close_sheets(M)
            await projects(A); ia = await inbox(A)
            check('L3 Juan: Update 1 (the whole project) from Maria Garcia · left the team', len(ia) == 1 and 'from Maria Garcia' in ia[0] and 'left the team' in ia[0], ia)
            await dl(A, ms=60000); await W(A, 300)
            t = await ask_text(A); await answer(A, 'OK')
            ct = await txt(A, '#curTeam')
            check('L4 merged (MG-1041 on Juan\'s phone); the card says Maria left the team', any(r['poleId'] == 'MG-1041' for r in await mbx(A, 'recs', PROJ)) and 'left the team' in ct and 'left the team' in t, (ct, t))
            # ---------- 12. Take back, and the start-up reminder
            await A.click('#curTeam [data-ct="fix"]'); await W(A, 800)
            await fxitem(A, 'CC-1002A', 'New photo', 'One more photo, please.'); await fxclick(A, 'send'); await idle(A, 60000); await W(A, 300)
            await close_sheets(B); await mbx(B, 'startCheck'); await W(B, 400)
            check('R1 at start, Pedro is told something waits in the team mailbox', 'waits for you in the team mailbox' in await toast(B), await toast(B))
            await projects(A, check_mail=False)
            if not await A.evaluate("document.getElementById('mbxOutBox').open"): await A.click('#mbxOutBox summary'); await W(A, 200)
            await A.locator('#mbxOut .tmrow', has_text='Fixes → Pedro Santos').first.locator('[data-mbxback]').click(); await answer(A, 'Take back'); await idle(A); await W(A, 300)
            ot = await A.eval_on_selector_all('#mbxOut .tmrow', "(d) => d.map((x) => x.textContent)")
            await projects(B); ib = await inbox(B)
            check('K1 Take back: the fixes note is gone from Pedro\'s mailbox; Juan\'s Sent says taken back', not ib and any('Fixes → Pedro Santos' in r and 'taken back' in r for r in ot), (ib, ot))
            dr = await fxh(A, 'draft', PROJ); fo = await fxh(A, 'out', PROJ)
            check('K2 the taken-back fix goes back to Juan\'s draft (New photo); the fixes Pedro has stay, round 1', len(dr) == 1 and dr[0]['why'] == ['New photo'] and fo and fo['round'] == 1 and len(fo['items']) == 2 and not any(x['k'] == dr[0]['k'] for x in fo['items']), (dr, fo))
            ct = await txt(A, '#curTeam'); nd = await A.locator('#curTeam [data-fxr="drop"]').count()
            for _ in range(nd): await A.locator('#curTeam [data-fxr="drop"]').first.click(); await answer(A, 'Not needed'); await W(A, 300)
            ct2 = await txt(A, '#curTeam'); fo = await fxh(A, 'out', PROJ)
            await A.screenshot(path=f'{OUT}/k_notneeded.png')
            check('K3 Not needed: the 2 fixes still with Pedro stop holding up Accept', nd == 2 and all(x['review'] == 'ok' and x.get('dropped') for x in fo['items']) and ct2.count('Not needed') == 2 and 'Check each fix answer first' not in ct2, (nd, ct, ct2))
            # ---------- 13. Me: a coordinator surveys himself, nothing through the mailbox
            n0 = len(await mbx(A, 'out'))
            await common.newproj(A, name='DEMO SITE TORIL'); await idle(A); await W(A, 400)
            check('M1 Assign to → Me: no transfer, no team line', len(await mbx(A, 'out')) == n0 and await mbx(A, 'team', 'DEMO SITE TORIL') is None)
            # ---------- 14. layout, errors
            for pg, nm in ((A, 'juan'), (B, 'pedro')):
                await projects(pg); ov = await pg.evaluate("() => document.documentElement.scrollWidth - innerWidth")
                await pg.screenshot(path=f'{OUT}/{nm}_projects.png', full_page=False)
                check(f'W1 {nm}: Projects with the team mailbox fits the phone width', ov <= 0, ov)
            await open_proj(B, PROJ)
            check('Z1 no page errors', not (ea + eb + em + en), ea + eb + em + en)
            for c in (ca, cb, cm, cn): await c.close()
    finally:
        srv.terminate()
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed' + (f': {bad}' if bad else ''))
asyncio.run(main())
