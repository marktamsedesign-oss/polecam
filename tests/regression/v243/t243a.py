"""v2.43.0 beta 1 (synthetic data only): Team (Coordinator / Field Partner) and the company mailbox, end to end.
The app talks to the REAL v2.43 sheet script and the REAL mailbox Code.gs, each running on its in-memory stand-in (e2e/servers.js);
the browser's requests to script.google.com are passed to them, the direct upload goes to the local upload server.
Juan (coordinator) and Pedro (field partner) are two phones of DEMO CONTRACTOR."""
import asyncio, sys, os, json, shutil, subprocess, urllib.request, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765'; E2E = 'http://127.0.0.1:8781'; OUT = S + '/v243/out_a'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
SHEET_ID = 'TEST'; MBX_URL = 'https://script.google.com/macros/s/AKfycbE2EMailboxDemoContractor01/exec'
CKEY = 'DMCA7KQ4MX2P'; JUAN = 'juan@demo-contractor.example'; PEDRO = 'pedro@demo-contractor.example'
W = lambda pg, ms: pg.wait_for_timeout(ms)
checks = []
def check(name, ok, info=''):
    checks.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  ← {str(info)[:400]}'), flush=True)
def e2e(path, body=None):
    req = urllib.request.Request(E2E + path, data=(json.dumps(body).encode() if body is not None else None), method='POST' if body is not None else 'GET')
    return json.loads(urllib.request.urlopen(req, timeout=20).read().decode())
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
        r = urllib.request.urlopen(urllib.request.Request(E2E + '/mbx', data=(rq.post_data or '{}').encode(), method='POST'), timeout=30).read()
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
    # this phone belongs to DEMO CONTRACTOR by its company key (as after a company invite)
    await pg.evaluate("(k) => __polecam.team.patchS({ companyKey: k, keyCompany: 'DEMO CONTRACTOR' })", CKEY)
    await pg.evaluate("() => __polecam.team.sync()"); await W(pg, 300)  # beta 3.2 (QA-17): the sheet says Team is on for DEMO CONTRACTOR
async def answer(pg, label):
    await pg.wait_for_selector('#askBox:not([hidden])', timeout=15000); await W(pg, 200)
    await pg.locator('#askBox button', has_text=label).first.click(); await W(pg, 400)
async def idle(pg, ms=20000):
    t = time.time()
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
    return code
async def state(pg): return await pg.evaluate("() => __polecam.team.state()")
async def txt(pg, sel): return (await pg.text_content(sel) or '').strip()

async def main():
    srv = subprocess.Popen(['node', S + '/v243/e2e/servers.js'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT); time.sleep(1.5)
    try:
        async with async_playwright() as p:
            ca, A, ea = await new_ctx(p, OUT + '/ud_juan'); await setup(A, 'Juan Dela Cruz', JUAN)
            cb, B, eb = await new_ctx(p, OUT + '/ud_pedro'); await setup(B, 'Pedro Santos', PEDRO)
            # --- 1. Juan: Team row, confirm email, Coordinator
            await close_sheets(A); await A.click('#settingsBtn'); await W(A, 600)
            check('T1 Settings shows Team for a phone with a company key and the online sheet', await A.is_visible('#goTeam'))
            check('T1b beta: the BETA tag and the beta card', await A.is_visible('.betatag') and await A.is_visible('#betaBox'))
            await A.click('#goTeam'); await W(A, 800); await idle(A)
            check('T2 before confirming: the roles are locked', await A.locator('#tmRole .chip[disabled]').count() == 3, await txt(A, '#tmRoleInfo'))
            await A.click('#tmSend'); await idle(A); await W(A, 300)
            await A.fill('#tmCode', '000000'); await A.click('#tmVerify'); await idle(A); await W(A, 300)
            check('T3 a wrong code is refused and says how many tries are left', 'wrong code' in await txt(A, '#tmErr') and 'left' in await txt(A, '#tmErr'), await txt(A, '#tmErr'))
            code = e2e('/mail?to=' + JUAN)['code']; await A.fill('#tmCode', code); await A.click('#tmVerify'); await idle(A); await W(A, 400)
            check('T4 the right code confirms the email', (await txt(A, '#tmMailState')).startswith('Confirmed: ' + JUAN), await txt(A, '#tmMailState'))
            await A.click('#tmRole .chip[data-v="Coordinator"]'); await idle(A); await W(A, 400)
            e2e('/teamyes?email=' + JUAN); await A.click('#tmRefresh'); await idle(A); await W(A, 300)  # beta 3.3 (QA-08): the admin approves (Yes in the Team tab)
            st = await state(A); rows = e2e('/rows?tab=Team')
            check('T5 Juan is a Coordinator in the sheet and on his phone', st['snap']['me']['role'] == 'Coordinator' and any(r[1] == JUAN and r[3] == 'Coordinator' for r in rows), rows)
            check('T5b the coordinator sees his empty team and the mailbox set-up button', await A.is_visible('#tmCo') and await A.is_visible('#tmMbxSetup') and not await A.is_visible('#tmMbxCheck'))
            # --- 2. Juan sets up the mailbox
            await A.click('#tmMbxSetup'); await W(A, 600)
            check('M1 the set-up screen links to the mailbox script from the sheet', await A.get_attribute('#mbxScript', 'href') == 'https://script.google.com/home/projects/DEMO-MAILBOX-SCRIPT' and await A.is_visible('#mbxScript'))
            await A.fill('#mbxUrl', 'https://example.com/not-a-script'); await A.click('#mbxSave'); await W(A, 300)
            check('M2 a wrong address is refused before anything is sent', 'Web app URL' in await txt(A, '#mbxErr'), await txt(A, '#mbxErr'))
            await A.fill('#mbxUrl', MBX_URL); await A.click('#mbxSave'); await idle(A, 30000); await W(A, 500)
            res = await A.eval_on_selector_all('#mbxRes > div', "(d) => d.map((x) => x.textContent)")
            check('M3 Check and save: reached, straight to Google, identical, deleted, saved', len(res) == 5 and all(r.startswith('✓') for r in res) and 'straight to Google' in res[1], res)
            st = await state(A); mrows = e2e('/rows?tab=Mailboxes')
            check('M4 the sheet keeps the address and key for DEMO CONTRACTOR; the phone too', st['mbx'] and st['mbx']['url'] == MBX_URL and any(r[1] == MBX_URL and r[2] == st['mbx']['key'] for r in mrows), (st['mbx'], mrows))
            files = e2e('/drive'); check('M5 nothing left in the mailbox after the check', not [f for f in files if f.startswith('chk')], files)
            key1 = st['mbx']['key']
            check('M6 the mailbox refuses another key now that it is claimed', e2e('/mbx', {'action': 'hello', 'k': 'x' * 32}).get('keyOk') is False)
            await close_sheets(A); await open_team(A)
            check('M7 Team shows the mailbox ready (set up by Juan Dela Cruz), with Check now and Change key', 'Ready · set up by Juan Dela Cruz' in await txt(A, '#tmMbxState') and await A.is_visible('#tmMbxCheck') and await A.is_visible('#tmMbxRekey'), await txt(A, '#tmMbxState'))
            # --- 3. Pedro: confirm, Field Partner, ask to join
            await open_team(B); await confirm_email(B, PEDRO)
            await B.click('#tmRole .chip[data-v="Field Partner"]'); await idle(B); await W(B, 400)
            co = await B.eval_on_selector_all('#tmCoList .tmrow', "(d) => d.map((x) => x.textContent)")
            check('P1 Pedro sees Juan in his company\'s coordinators', len(co) == 1 and 'Juan Dela Cruz' in co[0] and 'Ask to join' in co[0], co)
            check('P2 no mailbox for Pedro before he is in a team', (await state(B))['mbx'] is None and 'once a coordinator accepts' in await txt(B, '#tmMbxInfo'), await txt(B, '#tmMbxInfo'))
            await B.click('#tmCoList [data-join]'); await idle(B); await W(B, 300)
            check('P3 asked: his row says Asked, with Cancel', 'Asked' in await txt(B, '#tmCoList') and 'Cancel' in await txt(B, '#tmCoList'), await txt(B, '#tmCoList'))
            # --- 4. Juan accepts
            await A.click('#tmRefresh'); await idle(A); await W(A, 300)
            check('J1 Juan sees Pedro asking, with Accept and Decline', 'Pedro Santos' in await txt(A, '#tmMemList') and await A.locator('#tmMemList [data-accept]').count() == 1)
            await A.click('#tmMemList [data-accept]'); await idle(A); await W(A, 300)
            check('J2 Pedro is in Juan\'s team', 'In your team' in await txt(A, '#tmMemList'))
            await close_sheets(A); await A.click('#settingsBtn'); await W(A, 400)
            check('J3 Settings → Team says Coordinator · 1 field partner · mailbox ready', 'Coordinator · 1 field partner · mailbox ready' in await txt(A, '#teamSub'), await txt(A, '#teamSub'))
            # --- 5. Pedro gets the mailbox and checks it
            await B.click('#tmRefresh'); await idle(B); await W(B, 300)
            st = await state(B)
            check('P4 Pedro is in the team and got the mailbox (same address and key)', 'In the team' in await txt(B, '#tmCoList') and st['mbx'] and st['mbx']['url'] == MBX_URL and st['mbx']['key'] == key1, st['mbx'])
            check('P5 a field partner has Check now but not Set up or Change key', await B.is_visible('#tmMbxCheck') and not await B.is_visible('#tmMbxSetup') and not await B.is_visible('#tmMbxRekey'))
            await B.click('#tmMbxCheck'); await idle(B, 30000); await W(B, 300)
            check('P6 Check now works from Pedro\'s phone, straight to Google', 'straight to Google' in await txt(B, '#toast'), await txt(B, '#toast'))
            # --- 6. Google refuses the direct send: the check goes through the script
            e2e('/direct?on=0')
            await A.click('#tmMbxCheck') if await A.is_visible('#tmMbxCheck') else None
            if not await A.is_visible('#tmMbxCheck'): await open_team(A); await A.click('#tmMbxCheck')
            await idle(A, 30000); await W(A, 300)
            check('D1 direct send refused: the check still passes, through the mailbox script', 'through the mailbox script' in await txt(A, '#toast'), await txt(A, '#toast'))
            e2e('/direct?on=1')
            files = e2e('/drive'); check('D2 nothing left after the refused direct send', not [f for f in files if f.startswith('chk')], files)
            # --- 7. Juan removes Pedro and changes the key
            await open_team(A); await A.click('#tmMemList [data-remove]'); await answer(A, 'Remove'); await idle(A)
            await answer(A, 'Change key'); await idle(A, 30000); await W(A, 300)
            st = await state(A); key2 = st['mbx']['key']
            check('K1 the key changed on Juan\'s phone, in the sheet and in the mailbox', key2 != key1 and any(r[2] == key2 for r in e2e('/rows?tab=Mailboxes')) and e2e('/mbx', {'action': 'hello', 'k': key2}).get('keyOk') is True and e2e('/mbx', {'action': 'hello', 'k': key1}).get('keyOk') is False)
            check('K2 the old key gets nothing from the mailbox', e2e('/mbx', {'action': 'list', 'k': key1, 'box': PEDRO}).get('error') == 'key')
            await B.click('#tmRefresh'); await idle(B); await W(B, 300)
            st = await state(B)
            check('K3 Pedro (removed) no longer has the mailbox', st['mbx'] is None and 'Removed' in await txt(B, '#tmCoList'), (st['mbx'], await txt(B, '#tmCoList')))
            # --- 8. Pedro asks again, is accepted, gets the NEW key; then leaves
            await B.click('#tmCoList [data-join]'); await idle(B); await A.click('#tmRefresh'); await idle(A); await A.click('#tmMemList [data-accept]'); await idle(A)
            await B.click('#tmRefresh'); await idle(B); st = await state(B)
            check('L1 back in the team: Pedro has the new key', st['mbx'] and st['mbx']['key'] == key2)
            await B.click('#tmCoList [data-leave]'); await answer(B, 'Leave the team'); await idle(B); await W(B, 300)
            check('L2 Pedro left: no mailbox, the row says Left', (await state(B))['mbx'] is None and 'Left' in await txt(B, '#tmCoList'))
            # --- 9. layout and the tutorial
            for pg, nm in ((A, 'juan'), (B, 'pedro')):
                ov = await pg.evaluate("() => document.documentElement.scrollWidth - innerWidth")
                await pg.screenshot(path=f'{OUT}/{nm}_team.png', full_page=True)
                check(f'W1 {nm}: the Team screen fits the phone width', ov <= 0, ov)
            await close_sheets(A); await A.click('#tmTitle') if await A.is_visible('#tmTitle') else None
            tut = await A.evaluate("() => (window.GeTutorial || window.PoleTutorial || {}).topics ? 1 : 0")
            check('U1 no page errors', not ea and not eb, ea + eb)
            await ca.close(); await cb.close()
    finally:
        srv.terminate()
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed' + (f': {bad}' if bad else ''))
asyncio.run(main())
