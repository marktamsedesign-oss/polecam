"""v2.42.5 (phones A admin GLOBE, B vendor FADI, C admin staff GLOBE, D an old v2.42.4 phone):
 1. the saved list no longer carries the encrypted admin key (a marker), the admin phone keeps it; B joining by the join link has none
 2. Invite admin staff (GLOBE): the invite has &ke=
 3. C opens the GLOBE invite: it keeps the key; Save as GLOBE asks the PIN, 1234 unlocks it (admin, approval QR offered)
 4. coworker sharing: C's Invite a coworker has &ke=; B's has none
 5. D (v2.42.4) joining by the join link and choosing GLOBE: the PIN is refused (it is not let in without the key)
 6. a completed survey approved on site: a Save with no change keeps the approval; a change cancels it (the task stays complete)
 7. sharing an incomplete PAT asks to complete it first (Cancel: nothing shared, still open)
 8. PAT → cleanup on B → FAT on A: Mark task complete on the FAT asks the inspector's approval (A: its own); completed and approved;
    the completion report prints the approval
 9. a change on the approved FAT cancels the approval and the FAT is no longer complete
10. B's own FAT (started on B): Mark task complete asks for the inspector's approval QR (Cancel: not complete); the completion report
    too; no page errors"""
import asyncio, sys, os, shutil, json, re, subprocess
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, pick, xclick, unfold, sheet_companies, skipscan
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_a'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
OLD = 'http://localhost:8767'  # v2.42.4, served by this test
checks = []
async def mloop_ans(p_):  # v2.42.16: an As-Built record answers its maintenance loop (No loop) before it is saved
    await p_.evaluate("() => { const c = document.querySelector('#editor .chips[data-k=mloop]'); if (c && c.closest('.boqrow').classList.contains('need')) { const b = [...c.querySelectorAll('.chip')].find((x) => x.textContent === 'No loop'); if (b) b.click(); } }")
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:700], flush=True)
async def phone(p, tag):
    shutil.rmtree(f'{D}/ud_{tag}', ignore_errors=True)
    r = await launch(p, f'{D}/ud_{tag}', S + '/v17/vid/h_cc.mjpeg', project=False)
    await r[1].evaluate("window.POLECAM_SITE = 'https://example.test/g/'"); return r
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def shoot(p_): await W(p_, 1200); await p_.click('#shutter')
async def close_sheets(p_):
    for _ in range(6):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 300)
async def dl(pg, click, path):
    async with pg.expect_download(timeout=90000) as d: await click()
    v = await d.value; await v.save_as(path); return path
async def open_file(p_, path):
    await close_sheets(p_); await p_.click('#projectBtn'); await W(p_, 300)
    await p_.evaluate("document.getElementById('sharedInput').value = ''"); await p_.set_input_files('#sharedInput', path); await W(p_, 2500)
async def ask_state(p_):
    if not await p_.is_visible('#askBox'): return {'title': '', 'text': (await p_.text_content('#toast')) or '', 'btns': []}
    return await p_.evaluate("({ title: document.getElementById('askTitle').textContent, text: document.getElementById('askText').textContent, btns: [...document.querySelectorAll('#askBox button')].map(b => b.textContent) })")
async def share(p_, path):
    async def go():
        await close_sheets(p_); await p_.click('#projectBtn'); await W(p_, 300); await p_.click('#sendPat'); await W(p_, 700)
        for _ in range(2):
            if await p_.is_visible('#askBox'): await p_.click('#askBox button.primary'); await W(p_, 600)
        await p_.wait_for_selector('#sendBox:not([hidden])', timeout=60000); await p_.click('#sendSave' if await p_.is_visible('#sendSave') else '#sendSave2') # v2.41: three steps when the browser cannot share a .kmz
    f = await dl(p_, go, path)
    if await p_.is_visible('#sendNo'): await p_.click('#sendNo'); await W(p_, 300)
    return f
async def open_link(p_, base, link):
    await p_.goto(base + '/index.html' + link[link.index('#'):]); await W(p_, 3000)
    await p_.evaluate("window.POLECAM_SITE = 'https://example.test/g/'")
    for _ in range(3):
        if not await p_.is_visible('#askBox'): break
        await p_.click('#askBox button.primary'); await W(p_, 800)
async def details(p_, n, m, e, idno=None):
    await p_.fill('#pfName', n); await p_.fill('#pfMobile', m); await p_.fill('#pfEmail', e)
    if idno: await p_.fill('#pfIdNo', idno)
KE = "() => { const S = __polecam.S; return { apart: !!(S.team && S.team.keyEnc && S.team.keyEnc.apart), inB: !!(S.team && S.team.b && /\"keyEnc\":\\{\"salt\":\"apart\"/.test(S.team.b)), has: !!(S.listKe && S.listKe.ke && S.listKe.ke.data), data: S.listKe && S.listKe.ke ? S.listKe.ke.data : '', admin: !!S.adminKey }; }"
async def pick_cos(p_, names):
    for n in names: await p_.locator('#pickMList label', has_text=n).locator('input').check()
    await p_.click('#pickMYes'); await p_.wait_for_selector('#qrShow:not([hidden])', timeout=10000); await W(p_, 400)
    return await p_.evaluate("__polecam.lastQr")

async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '--bind', '127.0.0.1'], cwd=PRIV + '/old/v2.42.4', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        async with async_playwright() as p:
            # ===== A: admin GLOBE, list without a sheet
            ctx, pg, errs, cur, state, task = await phone(p, 'A')
            await details(pg, 'Mark Tamse', '09171234567', 'mark@example.com', '123456')
            await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
            await pg.fill('#admName', 'Globe OSP Mindanao'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
            await pg.click('#admSave'); await pg.wait_for_selector('#qrShow:not([hidden])'); await W(pg, 400)
            v1 = await pg.evaluate("__polecam.lastQr"); await pg.click('#qrClose'); await W(pg, 300)
            await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 600); await close_sheets(pg)
            kA = await pg.evaluate(KE)
            # ===== B: vendor FADI by the join link
            ctxB, pgB, errsB, curB, stB, taskB = await phone(p, 'B')
            await details(pgB, 'Rico Lasaya', '09181111111', 'rl@fadi.example')
            await pgB.click('#pfPaste'); await pgB.wait_for_selector('#promptBox:not([hidden])'); await pgB.fill('#promptInput', v1); await pgB.click('#promptYes'); await W(pgB, 900)
            await pgB.click('#askBox button:has-text("Use this list")'); await W(pgB, 900)
            await pgB.select_option('#pfCompany', 'FADI'); await pgB.click('#pfSave'); await W(pgB, 600); await close_sheets(pgB)
            kB = await pgB.evaluate(KE)
            check('1. the list carries a marker, not the encrypted admin key; A keeps the key; B (joined by the join link) has none, and the link has none of it',
                  kA['apart'] and kA['inB'] and kA['has'] and kA['admin'] and kB['apart'] and not kB['has'] and kA['data'] not in v1, (kA['apart'], kA['inB'], kA['has'], kB))
            # 2. Invite admin staff (GLOBE): the invite carries the key; the join link (1) and a vendor's invite (4) do not
            await pg.click('#settingsBtn'); await W(pg, 400); await pg.click('#inviteAdminStaff'); await pg.wait_for_selector('#qrShow:not([hidden])', timeout=10000); await W(pg, 400)
            invG = await pg.evaluate("__polecam.lastQr"); await close_sheets(pg)
            check('2. Invite admin staff (GLOBE): the invite carries &ke= (the encrypted admin key)', '&ke=' in invG and '&co=GLOBE' in invG, invG[-90:])
            # 3. C: admin staff by the GLOBE invite
            ctxC, pgC, errsC, curC, stC, taskC = await phone(p, 'C')
            await open_link(pgC, 'http://localhost:8765', invG)
            kC0 = await pgC.evaluate(KE)
            await details(pgC, 'Ana Reyes', '09182222222', 'ana@globe.example', '200777'); await pgC.click('#pfSave'); await W(pgC, 900)
            pin_asked = await pgC.is_visible('#pinBox')
            if pin_asked: await pgC.fill('#pinInput', '1234'); await pgC.click('#pinYes'); await W(pgC, 1500)
            kC = await pgC.evaluate(KE); coC = await pgC.evaluate("__polecam.S.user && __polecam.S.user.company")
            await close_sheets(pgC); await pgC.click('#settingsBtn'); await W(pgC, 400)
            apprC = await pgC.evaluate("document.getElementById('apprShowBtn').getClientRects().length > 0")
            check('3. C opens the GLOBE invite: the key kept; Save as GLOBE asks the PIN; 1234 unlocks it (admin; On-site approval QR offered)',
                  kC0['has'] and pin_asked and kC['admin'] and coC == 'GLOBE' and apprC, (kC0['has'], pin_asked, kC['admin'], coC, apprC))
            # 4. coworker sharing
            await pgC.click('#inviteBtn'); await pgC.wait_for_selector('#qrShow:not([hidden])', timeout=10000); invC = await pgC.evaluate("__polecam.lastQr"); await close_sheets(pgC)
            await pgB.click('#settingsBtn'); await W(pgB, 400); await pgB.click('#inviteBtn'); await pgB.wait_for_selector('#qrShow:not([hidden])', timeout=10000); invB = await pgB.evaluate("__polecam.lastQr"); await close_sheets(pgB)
            check('4. coworker sharing: C (GLOBE staff) passes the key on (&ke=); B (FADI) does not', '&ke=' in invC and '&co=GLOBE' in invC and '&ke=' not in invB and '&co=FADI' in invB, (invC[-70:], invB[-50:]))
            # 5. an old phone (v2.42.4) by the join link, choosing GLOBE
            ctxD, pgD, errsD, curD, stD, taskD = await phone(p, 'D')
            await open_link(pgD, OLD, v1)
            await details(pgD, 'Old Phone', '09183333333', 'old@globe.example'); await pgD.select_option('#pfCompany', 'GLOBE'); await pgD.click('#pfSave'); await W(pgD, 900)
            pinD = await pgD.is_visible('#pinBox')
            if pinD: await pgD.fill('#pinInput', '1234'); await pgD.click('#pinYes'); await W(pgD, 1500)
            errD = await pgD.evaluate("document.getElementById('pfErr').hidden ? '' : document.getElementById('pfErr').textContent")
            dD = await pgD.evaluate("({ admin: !!__polecam.S.adminKey, co: __polecam.S.user && __polecam.S.user.company, ver: (document.body.innerText.match(/2\\.42\\.\\d/) || [''])[0] })")
            check('5. an old v2.42.4 phone choosing GLOBE: asks the PIN and refuses it (not let in as admin staff)', pinD and 'Wrong admin PIN' in errD and not dD['admin'] and dD['co'] != 'GLOBE', (pinD, errD[:80], dD))
            await ctxD.close(); taskD.cancel()

            # 6. approval on a completed survey (A)
            await newproj(pg, 'survey', 'SV_APPR', purpose='As-built'); await close_sheets(pg)
            await pg.click('#captureBtn'); await shoot(pg); await skipscan(pg); await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 600)
            await pg.fill('#poleId', 'CC-0901'); await mloop_ans(pg); await pg.click('#edSave'); await pg.wait_for_selector('#editor', state='hidden', timeout=15000); await W(pg, 500)
            await pg.click('#projectBtn'); await W(pg, 300); await pg.click('#doneBtn'); await pg.wait_for_selector('#askBox:not([hidden])'); await pg.click('#askBox button.primary'); await W(pg, 600)
            await pg.click('#apprSelf'); await pg.wait_for_selector('#askBox:not([hidden])'); await pg.click('#askBox button:has-text("Approve")'); await W(pg, 2500)
            a0 = await pg.evaluate("!!(__polecam.S.meta.SV_APPR || {}).approval")
            async def open_cc(pid):
                await close_sheets(pg); await pg.evaluate("document.getElementById('listBtn').click()"); await W(pg, 500)
                await pg.fill('#listSearch', pid); await pg.evaluate("document.getElementById('listSearch').dispatchEvent(new Event('input'))"); await W(pg, 500)
                await pg.locator('#listItems button', has_text=pid).first.click(); await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 900)
            await open_cc('CC-0901'); await mloop_ans(pg); await pg.click('#edSave'); await W(pg, 1500)
            if await pg.is_visible('#editor'): await pg.click('#edDone') if await pg.is_visible('#edDone') else None
            a1 = await pg.evaluate("!!(__polecam.S.meta.SV_APPR || {}).approval")
            await open_cc('CC-0901'); await unfold(pg); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#svRemarks'); await pg.fill('#svRemarks', 'changed after approval'); await mloop_ans(pg); await pg.click('#edSave'); await pg.wait_for_selector('#editor', state='hidden', timeout=15000); await W(pg, 3500)
            a2 = await pg.evaluate("({ appr: !!(__polecam.S.meta.SV_APPR || {}).approval, done: !!(__polecam.S.meta.SV_APPR || {}).completedAt, toast: document.getElementById('toast').textContent })")
            check('6. a completed survey approved on site: a Save with no change keeps the approval; a change cancels it (still complete), and says so',
                  a0 and a1 and not a2['appr'] and a2['done'] and 'approval is cancelled' in a2['toast'], (a0, a1, a2))

            # 7. PAT on A: sharing it before it is completed
            await close_sheets(pg); await newproj(pg, 'PAT', 'PAT_45'); await close_sheets(pg)
            await pg.click('#captureBtn'); await shoot(pg); await pg.wait_for_selector('#editor:not([hidden])', timeout=10000); await W(pg, 500)
            await unfold(pg); await pg.fill('#poleId', 'CC-0501')
            await pick(pg, '#defCatSel', 'NAP'); await pg.click('#defItems .chip:has-text("NAP cover not closed")'); await pick(pg, '#defSevSel', 'Major')
            await mloop_ans(pg); await pg.click('#edSave'); await pg.wait_for_selector('#editor', state='hidden', timeout=15000); await W(pg, 400)
            await pg.click('#projectBtn'); await W(pg, 300); await pg.evaluate("document.getElementById('curMore').open = true")
            for sel, val in (('#mSite', 'AGDAO-POI 1'), ('#mContractor', 'FADI')): await pg.fill(sel, val); await pg.dispatch_event(sel, 'change')
            await pg.click('#sendPat'); await W(pg, 800); s7 = await ask_state(pg)
            if await pg.is_visible('#askBox'): await pg.click('#askBox button:has-text("Cancel")'); await W(pg, 400)
            done7 = await pg.evaluate("!!(__polecam.S.meta.PAT_45 || {}).completedAt")
            check('7. sharing an incomplete PAT asks to complete it first ("Complete and share"); Cancel: still open, nothing shared',
                  s7['title'] == 'Complete the PAT first' and 'Complete and share' in s7['btns'] and not done7, (s7['title'], s7['btns'], done7))
            await pg.click('#doneBtn'); await pg.wait_for_selector('#askBox:not([hidden])'); await pg.click('#askBox button:has-text("Complete and lock")'); await W(pg, 500)
            patkmz = await share(pg, f'{OUT}/pat.kmz')
            # B: the cleanup, item fixed, completed, shared
            await open_file(pgB, patkmz); await pgB.click('#askBox button:has-text("Start the defect cleanup")'); await W(pgB, 3500)
            if not await pgB.is_visible('#visitCard'):
                await pgB.evaluate("() => { const r = __polecam.points.find((x) => x.project === __polecam.S.project); }")
            await pgB.click('#vcItems button:has-text("Fixed, no photo")'); await W(pgB, 1500)
            await close_sheets(pgB); await pgB.click('#projectBtn'); await W(pgB, 300)
            await pgB.click('#doneBtn'); await pgB.wait_for_selector('#askBox:not([hidden])'); await pgB.click('#askBox button.primary'); await W(pgB, 600)
            clk = await share(pgB, f'{OUT}/cleanup.kmz')
            # A: the FAT
            await open_file(pg, clk); await pg.click('#askBox button:has-text("Start the FAT")'); await W(pg, 3500)
            fat = await pg.evaluate("__polecam.S.project")
            if await pg.is_visible('#vcItems'): await pg.click('#vcItems button:has-text("Accept")'); await W(pg, 1500)
            await close_sheets(pg); await pg.click('#projectBtn'); await W(pg, 300)
            await pg.click('#doneBtn'); await pg.wait_for_selector('#askBox:not([hidden])'); s8 = await ask_state(pg)
            await pg.click('#askBox button:has-text("Complete and approve")'); await W(pg, 3000)
            m8 = await pg.evaluate(f"(() => {{ const m = __polecam.S.meta[{json.dumps(fat)}] || {{}}; return {{ done: !!m.completedAt, appr: m.approval ? m.approval.how + ' ' + m.approval.n : '' }}; }})()")
            await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 300); await xclick(pg, '#doCompletion'); await W(pg, 800)
            for _ in range(3):
                if await pg.is_visible('#askBox'): await pg.click('#askBox button.primary'); await W(pg, 600)
            await pg.wait_for_selector('#resultBox:not([hidden])', timeout=90000)
            rep = await dl(pg, lambda: pg.click('#resSave'), f'{OUT}/fat_completion.pdf'); await pg.evaluate("document.getElementById('resultBox').hidden = true"); await close_sheets(pg)
            txt8 = subprocess.run(['pdftotext', '-layout', rep, '-'], capture_output=True, text=True).stdout
            check('8. Mark task complete on the FAT asks the inspector\'s approval (A, an inspector: its own); completed and approved; the completion report prints it',
                  s8['title'] == 'Complete and approve the FAT?' and m8['done'] and m8['appr'] == 'self Mark Tamse' and 'APPROVED ON SITE BY MARK TAMSE' in txt8, (s8['title'], m8, 'APPROVED ON SITE' in txt8))
            # 9. a change on the approved FAT
            await pg.evaluate(f"() => {{ __polecam.S.project = {json.dumps(fat)}; }}")
            r = await pg.evaluate(f"(() => {{ const r = __polecam.points.find((x) => x.project === {json.dumps(fat)}); return r && r.id; }})()")
            await pg.evaluate("(id) => __polecam.openEditor ? null : null", r)
            await pg.evaluate("document.getElementById('listBtn').click()"); await pg.locator('#listItems button', has_text='CC-0501').first.wait_for(timeout=15000); await pg.locator('#listItems button', has_text='CC-0501').first.click()
            await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 500)  # beta 3.3: waits for the record to open (a fixed 1.2 s missed it on a busy computer)
            if await pg.is_visible('#editor'):
                await unfold(pg); b = pg.locator('#defList button:has-text("Undo verification")')
                if await b.count(): await b.first.click(); await W(pg, 300)
                await mloop_ans(pg); await pg.click('#edSave'); await W(pg, 3500)
            m9 = await pg.evaluate(f"(() => {{ const m = __polecam.S.meta[{json.dumps(fat)}] || {{}}; return {{ done: !!m.completedAt, appr: !!m.approval, toast: document.getElementById('toast').textContent }}; }})()")
            check('9. a change on the approved FAT (acceptance undone): the approval is cancelled and the FAT is no longer complete', not m9['appr'] and not m9['done'] and 'no longer complete' in m9['toast'], m9)
            # 10. B's own FAT: the vendor needs the inspector's QR
            await close_sheets(pgB); await pgB.click('#projectBtn'); await W(pgB, 300); await pgB.click('#startFat'); await W(pgB, 1200)
            for _ in range(2):
                if await pgB.is_visible('#askBox'): await pgB.click('#askBox button.primary'); await W(pgB, 1500)
            await close_sheets(pgB); fatB = await pgB.evaluate("__polecam.S.project")
            await pgB.click('#projectBtn'); await W(pgB, 300); await pgB.click('#doneBtn'); await W(pgB, 800); s10 = await ask_state(pgB)
            if await pgB.is_visible('#askBox'): await pgB.click('#askBox button:has-text("Cancel")'); await W(pgB, 400)
            d10 = await pgB.evaluate(f"!!(__polecam.S.meta[{json.dumps(fatB)}] || {{}}).completedAt")
            await close_sheets(pgB); await pgB.click('#exportBtn'); await W(pgB, 300); await xclick(pgB, '#doCompletion'); await W(pgB, 900); s10b = await ask_state(pgB)
            if await pgB.is_visible('#askBox'): await pgB.click('#askBox button:has-text("Cancel")'); await W(pgB, 400)
            rep10 = await pgB.is_visible('#resultBox')
            allerr = [e for e in errs + errsB + errsC if 'PAGEERROR' in e]
            check('10. B (vendor) on its FAT: Mark task complete asks to scan the inspector\'s approval QR (Cancel: not complete); the completion report asks the same; no page errors',
                  'FAT' in await pgB.evaluate(f"(__polecam.S.meta[{json.dumps(fatB)}] || {{}}).stage || ''") and s10['title'] == 'The inspector approves the FAT' and 'Scan the approval QR' in s10['btns'] and not d10
                  and s10b['title'] == 'The inspector approves the FAT' and not rep10 and not allerr, (fatB, s10['title'], s10['btns'], d10, s10b['title'], rep10, allerr[:3]))
            for t in (task, taskB, taskC): t.cancel()
            for c in (ctx, ctxB, ctxC): await c.close()
    finally:
        srv.terminate()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
