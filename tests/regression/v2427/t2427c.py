"""v2.42.6: project sharing (PAT → defect cleanup → FAT, and a survey's project file) on phones that joined through the new short
links, with the real sheet script (sheetsrv.cjs) and credits ON:
 1. A (admin GLOBE, inspector) makes the PAT, completes and shares the PAT KMZ: no credit request
 2. B (FADI, joined by a short vendor invite) and C (FADI, joined by B's short coworker invite) both open the sealed PAT KMZ;
    B starts the defect cleanup, fixes the item, completes and shares the cleanup KMZ: no credit request
 3. A opens it, starts the FAT, accepts, completes with its own approval; the FAT completion report prints the approval
 4. B's survey: KMZ charged once (credits on); B shares the project file to C; C opens it (same project key) and exports KMZ and DXF
    with no new charge; C's completion report of the survey too (its KMZ inside)
 5. only that one credit request in the whole run; no page errors"""
import asyncio, sys, os, shutil, json, re, subprocess, time, urllib.request
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, xclick, skipscan
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_c'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
DEP = 'AKfycbzQ7xLm2Rk9vT4pWnE8sYbH3cJ6uFgA1dK5oZiN0qMwXeVrB2tCyU7hLj4sPaD9fGk3'[:72]
URL = f'https://script.google.com/macros/s/{DEP}/exec'
READ, AKEY = 'a3f9c2e7b1d84f6e9a0c', 'ADMINKEY0123456789ab'
SITE = 'https://marktamse.github.io/g-esaa/'
SRV = 'http://127.0.0.1:8790'
checks = []
async def mloop_ans(p_):  # v2.42.16: an As-Built record answers its maintenance loop (No loop) before it is saved
    await p_.evaluate("() => { const c = document.querySelector('#editor .chips[data-k=mloop]'); if (c && c.closest('.boqrow').classList.contains('need')) { const b = [...c.querySelectorAll('.chip')].find((x) => x.textContent === 'No loop'); if (b) b.click(); } }")
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900], flush=True)
def ctl(o): return json.loads(urllib.request.urlopen(urllib.request.Request(SRV + '/ctl', data=json.dumps(o).encode(), method='POST')).read())
def dump(): return json.loads(urllib.request.urlopen(SRV + '/dump').read())
async def to_sheet(route):
    req = route.request; q = req.url.split('?', 1)[1] if '?' in req.url else ''
    try:
        resp = await route.fetch(url=f'{SRV}/exec?{q}', method=req.method, post_data=req.post_data if req.method == 'POST' else None)
        await route.fulfill(response=resp)
    except Exception as e: await route.abort()
async def phone(p, tag):
    shutil.rmtree(f'{D}/udc_{tag}', ignore_errors=True)
    r = await launch(p, f'{D}/udc_{tag}', S + '/v17/vid/h_cc.mjpeg', project=False)
    await r[0].route('https://script.google.com/**', to_sheet)
    await r[1].evaluate(f"window.POLECAM_SITE = '{SITE}'"); return r
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(p_):
    for _ in range(6):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 300)
async def open_link(p_, link):
    await p_.goto('http://localhost:8765/index.html' + link[link.index('#'):]); await W(p_, 3500)
    await p_.evaluate(f"window.POLECAM_SITE = '{SITE}'")
    for _ in range(3):
        if not await p_.is_visible('#askBox'): break
        await p_.click('#askBox button.primary'); await W(p_, 900)
async def details(p_, n, m, e):
    await p_.fill('#pfName', n); await p_.fill('#pfMobile', m); await p_.fill('#pfEmail', e)
QR = "() => ({ link: __polecam.lastQr, send: __polecam.lastQrLink, size: +document.getElementById('qrImg').dataset.size || 0, btn: document.getElementById('qrLinkBtn').hidden ? '' : document.getElementById('qrLinkBtn').textContent, note: document.getElementById('qrText').textContent })"
async def settings_btn(p_, sel):
    await close_sheets(p_); await p_.click('#settingsBtn'); await W(p_, 500); await p_.click(sel); await W(p_, 900)
async def shoot(p_): await W(p_, 1200); await p_.click('#shutter')
async def pole(p_, cur, pid, dlat):
    cur['latitude'] += dlat; await W(p_, 1500)
    await close_sheets(p_); await p_.click('#captureBtn'); await shoot(p_); await skipscan(p_); await p_.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(p_, 700)
    await p_.fill('#poleId', pid); await mloop_ans(p_); await p_.click('#edSave'); await p_.wait_for_selector('#editor', state='hidden', timeout=15000); await W(p_, 600)
async def try_export(p_, btn):
    await close_sheets(p_); await p_.click('#exportBtn'); await W(p_, 400)
    info = await p_.evaluate("document.getElementById('creditInfo').hidden ? '' : document.getElementById('creditInfo').textContent")
    await xclick(p_, btn)
    for _ in range(60):
        await W(p_, 500)
        if await p_.is_visible('#resultBox') or await p_.is_visible('#askBox'): break
    made = await p_.is_visible('#resultBox')
    ask = await p_.evaluate("document.getElementById('askBox').hidden ? '' : document.getElementById('askTitle').textContent + ' | ' + document.getElementById('askText').textContent")
    toast = await p_.text_content('#toast') or ''
    if ask: await p_.click('#askBox button.primary'); await W(p_, 300)
    if made: await p_.evaluate("document.getElementById('resultBox').hidden = true")
    await close_sheets(p_)
    return {'made': made, 'ask': ask, 'toast': toast, 'info': info}
def credit_posts(): return [x for x in dump()['log'] if x.get('action') == 'credit']
def crow(email):
    r = [x for x in dump()['sheets'].get('Credits', []) if x and x[0] == email]; return r[0] if r else None
async def sync(p_):
    await close_sheets(p_); await p_.click('#settingsBtn'); await W(p_, 400)
    if await p_.is_visible('#cloudSyncBtn'): await p_.click('#cloudSyncBtn')
    else: await p_.evaluate("document.getElementById('cloudSyncBtn').click()")
    await W(p_, 2500); await close_sheets(p_)

from common import pick, unfold
async def dl(pg, click, path):
    async with pg.expect_download(timeout=90000) as d: await click()
    v = await d.value; await v.save_as(path); return path
async def open_file(p_, path):
    await close_sheets(p_); await p_.click('#projectBtn'); await W(p_, 300)
    await p_.evaluate("document.getElementById('sharedInput').value = ''"); await p_.set_input_files('#sharedInput', path); await W(p_, 3000)
async def ask_state(p_):
    if not await p_.is_visible('#askBox'): return {'title': '', 'text': (await p_.text_content('#toast')) or '', 'btns': []}
    return await p_.evaluate("({ title: document.getElementById('askTitle').textContent, text: document.getElementById('askText').textContent, btns: [...document.querySelectorAll('#askBox button')].map(b => b.textContent) })")
async def share(p_, path):
    async def go():
        await close_sheets(p_); await p_.click('#projectBtn'); await W(p_, 300); await p_.click('#sendPat'); await W(p_, 700)
        for _ in range(2):
            if await p_.is_visible('#askBox'): await p_.click('#askBox button.primary'); await W(p_, 600)
        await p_.wait_for_selector('#sendBox:not([hidden])', timeout=60000); await p_.click('#sendSave' if await p_.is_visible('#sendSave') else '#sendSave2')
    f = await dl(p_, go, path)
    if await p_.is_visible('#sendNo'): await p_.click('#sendNo'); await W(p_, 300)
    return f
async def join(p, tag, link, name, mobile, email):
    r = await phone(p, tag); pg_ = r[1]
    await open_link(pg_, link); await details(pg_, name, mobile, email)
    if await pg_.locator('#pfCompany option[value="FADI"]').count(): await pg_.select_option('#pfCompany', 'FADI')
    await pg_.click('#pfSave'); await W(pg_, 2500)
    for _ in range(2):
        if await pg_.is_visible('#askBox'): await pg_.click('#askBox button.primary'); await W(pg_, 800)
    await close_sheets(pg_); await pg_.evaluate(f"window.POLECAM_SITE = '{SITE}'")
    return r
async def report(p_, path):
    await close_sheets(p_); await p_.click('#exportBtn'); await W(p_, 300); await xclick(p_, '#doCompletion'); await W(p_, 900)
    for _ in range(3):
        if await p_.is_visible('#askBox'): await p_.click('#askBox button.primary'); await W(p_, 700)
    await p_.wait_for_selector('#resultBox:not([hidden])', timeout=120000)
    f = await dl(p_, lambda: p_.click('#resSave'), path); await p_.evaluate("document.getElementById('resultBox').hidden = true"); await close_sheets(p_)
    return f

async def main():
    sheet = subprocess.Popen(['node', D + '/sheetsrv.cjs', D + '/gs/PoleCam-online-sheet.gs', '8790'], stdout=subprocess.DEVNULL, stderr=open(OUT + '/sheet.err', 'w')); time.sleep(1.2)
    try:
        async with async_playwright() as p:
            ctx, pg, errs, cur, state, task = await phone(p, 'A')
            await details(pg, 'Mark Tamse', '09171234567', 'mark@globe.example'); await pg.fill('#pfIdNo', '123456')
            await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
            await pg.fill('#admName', 'Globe OSP Mindanao'); await pg.fill('#admUrl', URL); await pg.fill('#admReadKey', READ); await pg.fill('#admWriteKey', AKEY)
            await pg.click('#admCoRefresh'); await W(pg, 1200)
            await pg.click('#admSave'); await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=20000); await W(pg, 800)
            if await pg.is_visible('#askBox'): await pg.click('#askBox button:has-text("OK")'); await W(pg, 300)
            if await pg.is_visible('#qrShow'): await pg.click('#qrClose'); await W(pg, 300)
            await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 1200); await close_sheets(pg)
            await pg.evaluate(f"window.POLECAM_SITE = '{SITE}'")
            ctl({'op': 'set', 'k': 'Credits', 'v': 'Yes'})
            # the vendor B by a short vendor invite, C by B's short coworker invite
            await settings_btn(pg, '#inviteVendor'); await pg.locator('#pickMList label', has_text='FADI').locator('input').check(); await pg.click('#pickMYes')
            await pg.wait_for_selector('#qrShow:not([hidden])', timeout=15000); await W(pg, 400); linkB = await pg.evaluate("__polecam.lastQr"); await close_sheets(pg)
            ctxB, pgB, errsB, curB, stB, taskB = await join(p, 'B', linkB, 'Rico Lasaya', '09181111111', 'rl@fadi.example')
            await settings_btn(pgB, '#inviteBtn'); await pgB.wait_for_selector('#qrShow:not([hidden])', timeout=15000); await W(pgB, 400); linkC = await pgB.evaluate("__polecam.lastQr"); await close_sheets(pgB)
            ctxC, pgC, errsC, curC, stC, taskC = await join(p, 'C', linkC, 'Ana Cruz', '09182222222', 'ac@fadi.example')
            kk = [await x.evaluate("({ co: __polecam.S.keyCompany, key: __polecam.S.companyKey })") for x in (pgB, pgC)]
            print('joined', '#i=' in linkB, '#i=' in linkC, kk)
            n0 = len(credit_posts())
            # 1. A: the PAT
            await newproj(pg, 'PAT', 'PAT_SL'); await close_sheets(pg)
            await pg.click('#captureBtn'); await shoot(pg); await pg.wait_for_selector('#editor:not([hidden])', timeout=10000); await W(pg, 500)
            await unfold(pg); await pg.fill('#poleId', 'CC-0701')
            await pick(pg, '#defCatSel', 'NAP'); await pg.click('#defItems .chip:has-text("NAP cover not closed")'); await pick(pg, '#defSevSel', 'Major')
            await mloop_ans(pg); await pg.click('#edSave'); await pg.wait_for_selector('#editor', state='hidden', timeout=15000); await W(pg, 400)
            await pg.click('#projectBtn'); await W(pg, 300); await pg.evaluate("document.getElementById('curMore').open = true")
            for sel, val in (('#mSite', 'AGDAO-POI 1'), ('#mContractor', 'FADI')): await pg.fill(sel, val); await pg.dispatch_event(sel, 'change')
            await pg.click('#doneBtn'); await pg.wait_for_selector('#askBox:not([hidden])'); await pg.click('#askBox button:has-text("Complete and lock")'); await W(pg, 500)
            patkmz = await share(pg, f'{OUT}/pat.kmz')
            check('1. A completes and shares the PAT KMZ; no credit request', os.path.getsize(patkmz) > 1000 and len(credit_posts()) == n0, (os.path.getsize(patkmz), len(credit_posts()) - n0))
            # 2. C and B open it; B does the cleanup
            await open_file(pgC, patkmz); sC = await ask_state(pgC)
            if await pgC.is_visible('#askBox'): await pgC.click('#askBox button:has-text("Cancel")'); await W(pgC, 400)
            await open_file(pgB, patkmz); sB = await ask_state(pgB)
            await pgB.click('#askBox button:has-text("Start the defect cleanup")'); await W(pgB, 3500)
            if await pgB.is_visible('#vcItems'): await pgB.click('#vcItems button:has-text("Fixed, no photo")'); await W(pgB, 1500)
            await close_sheets(pgB); await pgB.click('#projectBtn'); await W(pgB, 300)
            await pgB.click('#doneBtn'); await pgB.wait_for_selector('#askBox:not([hidden])'); await pgB.click('#askBox button.primary'); await W(pgB, 600)
            clB = await pgB.evaluate("(() => { const m = __polecam.S.meta[__polecam.S.project] || {}; return { stage: m.stage, done: !!m.completedAt, name: __polecam.S.project }; })()")
            clk = await share(pgB, f'{OUT}/cleanup.kmz')
            check('2. C and B (joined by short links) open the sealed PAT KMZ (both offered the defect cleanup); B completes the cleanup and shares it; no credit request',
                  'Start the defect cleanup' in sC['btns'] and 'Start the defect cleanup' in sB['btns'] and clB['stage'] == 'Cleanup' and clB['done'] and os.path.getsize(clk) > 1000 and len(credit_posts()) == n0, (sC['title'], sC['btns'], sB['btns'], clB, len(credit_posts()) - n0))
            # 3. A: the FAT
            await open_file(pg, clk); await pg.click('#askBox button:has-text("Start the FAT")'); await W(pg, 3500)
            fat = await pg.evaluate("__polecam.S.project")
            if await pg.is_visible('#vcItems'): await pg.click('#vcItems button:has-text("Accept")'); await W(pg, 1500)
            await close_sheets(pg); await pg.click('#projectBtn'); await W(pg, 300)
            await pg.click('#doneBtn'); await pg.wait_for_selector('#askBox:not([hidden])'); s3 = await ask_state(pg)
            await pg.click('#askBox button:has-text("Complete and approve")'); await W(pg, 3000)
            m3 = await pg.evaluate(f"(() => {{ const m = __polecam.S.meta[{json.dumps(fat)}] || {{}}; return {{ stage: m.stage, done: !!m.completedAt, appr: m.approval ? m.approval.n : '' }}; }})()")
            rep3 = await report(pg, f'{OUT}/fat_completion.pdf'); txt3 = subprocess.run(['pdftotext', '-layout', rep3, '-'], capture_output=True, text=True).stdout
            check('3. A opens the cleanup KMZ, starts the FAT, completes it with its own approval; the FAT completion report prints it; no credit request',
                  m3['stage'] == 'FAT' and m3['done'] and m3['appr'] == 'Mark Tamse' and 'APPROVED ON SITE BY MARK TAMSE' in txt3 and len(credit_posts()) == n0, (s3['title'], m3, 'APPROVED ON SITE' in txt3, len(credit_posts()) - n0))
            # 4. B's survey shared to C
            ctl({'op': 'credits', 'email': 'rl@fadi.example', 'credits': 1000}); await sync(pgB)
            await newproj(pgB, 'survey', 'SV_SHARE', purpose='As-built'); await close_sheets(pgB)
            await pole(pgB, curB, 'CC-0801', 0); await pole(pgB, curB, 'CC-0802', 0.0009)
            eB = await try_export(pgB, '#doKmz'); nB = len(credit_posts())
            cidB = await pgB.evaluate("(__polecam.S.meta.SV_SHARE || {}).cid")
            await close_sheets(pgB); await pgB.click('#projectBtn'); await W(pgB, 300)
            await pgB.click('#bulkShareBtn'); await W(pgB, 600)
            async def go_bs():
                await pgB.click('#bsGo'); await pgB.wait_for_selector('#sendBox:not([hidden])', timeout=60000); await pgB.click('#sendSave' if await pgB.is_visible('#sendSave') else '#sendSave2')
            zipB = await dl(pgB, go_bs, f'{OUT}/sv_share.zip')
            if await pgB.is_visible('#sendNo'): await pgB.click('#sendNo'); await W(pgB, 300)
            await open_file(pgC, zipB)
            for _ in range(3):
                if await pgC.is_visible('#askBox'): await pgC.click('#askBox button.primary'); await W(pgC, 1500)
            await close_sheets(pgC)
            hasC = await pgC.evaluate("__polecam.S.projects.includes('SV_SHARE')")
            if hasC: await pgC.evaluate("() => { __polecam.S.project = 'SV_SHARE'; }"); await pgC.reload(); await W(pgC, 3000); await close_sheets(pgC)
            cidC = await pgC.evaluate("(__polecam.S.meta.SV_SHARE || {}).cid"); proj = await pgC.evaluate("__polecam.S.project")
            eC1 = await try_export(pgC, '#doKmz'); eC2 = await try_export(pgC, '#doDxf'); repC = await report(pgC, f'{OUT}/sv_completion.pdf'); nC = len(credit_posts())
            row = crow('rl@fadi.example'); rowC = crow('ac@fadi.example')
            check('4. B\'s survey: KMZ charged once; its project file opened on C carries the same project key; C\'s KMZ, DXF and completion report: no new charge',
                  eB['made'] and nB == n0 + 1 and cidB and cidC == cidB and proj == 'SV_SHARE' and eC1['made'] and eC2['made'] and os.path.getsize(repC) > 5000 and nC == nB and row and 80 <= row[4] <= 120 and rowC and rowC[4] == 0,  # v2.42.7: C is listed at its first sync, never charged
                  (eB['toast'], nB - n0, cidB, cidC, proj, eC1['made'], eC2['made'], nC - nB, row, rowC))
            allerr = [e for e in errs + errsB + errsC if 'PAGEERROR' in e]
            check('5. one credit request in the whole run (B\'s survey KMZ); no page errors', len(credit_posts()) == n0 + 1 and not allerr, (len(credit_posts()) - n0, allerr[:3]))
            for t in (task, taskB, taskC): t.cancel()
            for c in (ctx, ctxB, ctxC): await c.close()
    finally:
        sheet.terminate()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
