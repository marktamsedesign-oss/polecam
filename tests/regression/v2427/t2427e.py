"""v2.42.7: Settings → User credits on the admin phone (the real sheet script on 8791), and what the vendor B sees:
 1. the button on the admin phone only; the list shows B (listed at its sync) with 0 m left
 2. Add credits 500: the list and the sheet say 500 m; B's Settings and the upper right of its Export screen say 500 m after a sync
 3. Make unlimited until 2099-12-31: B sees "unlimited until 2099-12-31"; Make limited again, Set the balance 50: B sees 50 m
 4. Add a user (a new email, its company chosen) with 300 m: listed; every change in the Credit log by the admin; no page errors"""
import asyncio, sys, os, shutil, json, re, subprocess, time, urllib.request
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, xclick, skipscan
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_e'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
DEP = 'AKfycbzQ7xLm2Rk9vT4pWnE8sYbH3cJ6uFgA1dK5oZiN0qMwXeVrB2tCyU7hLj4sPaD9fGk3'[:72]
URL = f'https://script.google.com/macros/s/{DEP}/exec'
READ, AKEY = 'a3f9c2e7b1d84f6e9a0c', 'ADMINKEY0123456789ab'
SITE = 'https://marktamse.github.io/g-esaa/'
SRV = 'http://127.0.0.1:8791'
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
    shutil.rmtree(f'{D}/ude_{tag}', ignore_errors=True)
    r = await launch(p, f'{D}/ude_{tag}', S + '/v17/vid/h_cc.mjpeg', project=False)
    await r[0].route('https://script.google.com/**', to_sheet)
    await r[1].evaluate(f"window.POLECAM_SITE = '{SITE}'"); return r
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(p_):
    for _ in range(6):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 300)
async def open_link(p_, link):
    await p_.goto('http://localhost:8769/index.html' + link[link.index('#'):]); await W(p_, 3500)
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

async def phone2(p, tag):
    r = await phone(p, tag); await r[1].goto('http://localhost:8769/index.html'); await W(r[1], 1500); await r[1].evaluate(f"window.POLECAM_SITE = '{SITE}'"); return r
async def draw_dxf(p_):
    await close_sheets(p_); await p_.click('#drawBtn'); await W(p_, 1200)
    dpill = await p_.evaluate("(() => { const b = document.getElementById('drawCredit'), r = b.getBoundingClientRect(); return b.hidden ? '' : b.textContent + (b.classList.contains('low') ? ' [low]' : '') + (r.right > innerWidth * 0.6 && r.top < 80 ? ' [upper right]' : ''); })()")
    await p_.click('#drawDxf'); await W(p_, 1200)
    xpill = await p_.evaluate("(() => { const b = document.getElementById('exportCredit'), r = b.getBoundingClientRect(); return b.hidden ? '' : b.textContent + (b.classList.contains('low') ? ' [low]' : '') + (r.right > innerWidth * 0.6 && r.top < 80 ? ' [upper right]' : ''); })()")
    picked = await p_.evaluate("[...document.querySelectorAll('#xMultiList input:checked')].map((c) => c.value)")
    info = await p_.evaluate("document.getElementById('creditInfo').hidden ? '' : document.getElementById('creditInfo').textContent")
    await p_.click('#doDxf')
    for _ in range(60):
        await W(p_, 500)
        if await p_.is_visible('#resultBox') or await p_.is_visible('#askBox'): break
    made = await p_.is_visible('#resultBox')
    res = await p_.evaluate("document.getElementById('resultCredit').hidden ? '' : document.getElementById('resultCredit').textContent")
    ask = await p_.evaluate("document.getElementById('askBox').hidden ? '' : document.getElementById('askTitle').textContent")
    toast = await p_.text_content('#toast') or ''
    if ask: await p_.click('#askBox button.primary'); await W(p_, 300)
    if made: await p_.evaluate("document.getElementById('resultBox').hidden = true")
    await close_sheets(p_)
    return {'picked': picked, 'made': made, 'ask': ask, 'toast': toast, 'info': info, 'res': res, 'dpill': dpill, 'xpill': xpill}
async def sync_settings(p_):
    await sync(p_); await close_sheets(p_); await p_.click('#settingsBtn'); await W(p_, 500)
    t = await p_.evaluate("document.getElementById('creditMe').hidden ? '' : document.getElementById('creditMe').textContent"); await close_sheets(p_)
    await p_.click('#exportBtn'); await W(p_, 500)
    x = await p_.evaluate("document.getElementById('exportCredit').hidden ? '' : document.getElementById('exportCredit').textContent"); await close_sheets(p_)
    return t, x
async def open_credits(pg):
    await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 500); await pg.click('#creditsBtn'); await W(pg, 2000)
async def row_text(pg, email):
    return await pg.evaluate("(e) => { const b = [...document.querySelectorAll('#crList .crrow')].find((x) => x.querySelector('b').textContent === e); return b ? b.textContent : ''; }", email)
async def edit(pg, email, choice, value=None, choice2=None):
    await pg.locator('#crList .crrow', has_text=email).first.click(); await pg.wait_for_selector('#askBox:not([hidden])'); await W(pg, 200)
    await pg.click(f'#askBox button:has-text("{choice}")'); await W(pg, 400)
    if choice2: await pg.wait_for_selector('#askBox:not([hidden])'); await pg.click(f'#askBox button:has-text("{choice2}")'); await W(pg, 400)
    if value is not None: await pg.wait_for_selector('#promptBox:not([hidden])'); await pg.fill('#promptInput', value); await pg.click('#promptYes')
    await W(pg, 2000)
async def main():
    web = subprocess.Popen([sys.executable, '-m', 'http.server', '8769', '--bind', '127.0.0.1'], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sheet = subprocess.Popen(['node', D + '/sheetsrv.cjs', D + '/gs/PoleCam-online-sheet.gs', '8791'], stdout=subprocess.DEVNULL, stderr=open(OUT + '/sheet.err', 'w')); time.sleep(1.5)
    try:
        async with async_playwright() as p:
            ctx, pg, errs, cur, state, task = await phone2(p, 'A')
            await details(pg, 'Mark Tamse', '09171234567', 'mark@globe.example'); await pg.fill('#pfIdNo', '123456')
            await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
            await pg.fill('#admName', 'Globe OSP Mindanao'); await pg.fill('#admUrl', URL); await pg.fill('#admReadKey', READ); await pg.fill('#admWriteKey', AKEY)
            await pg.click('#admCoRefresh'); await W(pg, 1200)
            await pg.click('#admSave'); await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=20000); await W(pg, 800)
            if await pg.is_visible('#askBox'): await pg.click('#askBox button:has-text("OK")'); await W(pg, 300)
            if await pg.is_visible('#qrShow'): await pg.click('#qrClose'); await W(pg, 300)
            await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 1200); await close_sheets(pg)
            await pg.evaluate(f"window.POLECAM_SITE = '{SITE}'")
            await settings_btn(pg, '#inviteVendor'); await pg.locator('#pickMList label', has_text='FADI').locator('input').check(); await pg.click('#pickMYes')
            await pg.wait_for_selector('#qrShow:not([hidden])', timeout=15000); await W(pg, 400); linkB = await pg.evaluate("__polecam.lastQr"); await close_sheets(pg)
            ctxB, pgB, errsB, curB, stB, taskB = await phone2(p, 'B')
            await open_link(pgB, linkB); await details(pgB, 'Rico Lasaya', '09181111111', 'rl@fadi.example')
            if await pgB.locator('#pfCompany option[value="FADI"]').count(): await pgB.select_option('#pfCompany', 'FADI')
            await pgB.click('#pfSave'); await W(pgB, 2500); await close_sheets(pgB)
            ctl({'op': 'set', 'k': 'Credits', 'v': 'Yes'})
            await newproj(pgB, 'survey', 'SV_CRADM', purpose='As-built'); await close_sheets(pgB)
            b0 = await sync_settings(pgB)
            await close_sheets(pgB); await pgB.click('#settingsBtn'); await W(pgB, 400); btnB = await pgB.evaluate("document.getElementById('creditsBtn').hidden"); await close_sheets(pgB)
            await open_credits(pg); info = await pg.evaluate("document.getElementById('crInfo').textContent"); r1 = await row_text(pg, 'rl@fadi.example')
            check('1. User credits: on the admin phone only (hidden on B); Credits are ON; B listed (its sync) with 0 m left; B sees 0 m in Settings and Export',
                  btnB and 'Credits are ON' in info and '0 m left' in r1 and 'FADI' in r1 and b0[0].startswith('Credits: 0 m left') and b0[1] == 'Credits: 0 m', (btnB, info[:60], r1, b0))
            await edit(pg, 'rl@fadi.example', 'Add credits', '500'); r2 = await row_text(pg, 'rl@fadi.example'); t2 = await pg.text_content('#toast')
            b2 = await sync_settings(pgB); c2 = crow('rl@fadi.example')
            await close_sheets(pgB); await pgB.click('#exportBtn'); await W(pgB, 600); await pgB.screenshot(path=OUT + '/export_pill.png'); await close_sheets(pgB)
            check('2. Add credits 500: the list and the sheet say 500 m; after a sync B sees 500 m in Settings and at the upper right of Export',
                  '500 m left' in r2 and 'Saved' in t2 and c2[2] == 500 and b2[0].startswith('Credits: 500 m left') and b2[1] == 'Credits: 500 m', (r2, t2, c2, b2))
            await edit(pg, 'rl@fadi.example', 'Make unlimited', '2099-12-31', 'Until a date'); r3 = await row_text(pg, 'rl@fadi.example'); b3 = await sync_settings(pgB)
            await edit(pg, 'rl@fadi.example', 'Make limited again'); await edit(pg, 'rl@fadi.example', 'Set the balance', '50'); r4 = await row_text(pg, 'rl@fadi.example'); b4 = await sync_settings(pgB)
            check('3. Make unlimited until 2099-12-31: listed so, B sees "unlimited until 2099-12-31"; Make limited again, Set the balance 50: B sees 50 m',
                  'Unlimited until 2099-12-31' in r3 and 'unlimited until 2099-12-31' in b3[0] and b3[1] == 'Unlimited to 2099-12-31' and '50 m left' in r4 and b4[0].startswith('Credits: 50 m left') and b4[1] == 'Credits: 50 m', (r3, b3, r4, b4))
            await pg.click('#crAdd'); await pg.wait_for_selector('#promptBox:not([hidden])'); await pg.fill('#promptInput', 'new.tech@nokia.example'); await pg.click('#promptYes'); await W(pg, 500)
            if await pg.is_visible('#pickBox'): await pg.select_option('#pickSel', 'NOKIA'); await pg.click('#pickYes'); await W(pg, 400)
            await pg.wait_for_selector('#askBox:not([hidden])'); await pg.click('#askBox button:has-text("Add credits")'); await W(pg, 300)
            await pg.wait_for_selector('#promptBox:not([hidden])'); await pg.fill('#promptInput', '300'); await pg.click('#promptYes'); await W(pg, 2000)
            r5 = await row_text(pg, 'new.tech@nokia.example'); c5 = crow('new.tech@nokia.example'); info5 = await pg.evaluate("document.getElementById('crInfo').textContent")
            adm = [r for r in dump()['sheets'].get('Credit log', [])[1:] if r[3] == '(admin)']
            allerr = [e for e in errs + errsB if 'PAGEERROR' in e]
            check('4. Add a user (new email, NOKIA chosen) with 300 m: listed and in the sheet; every change in the Credit log by the admin; no page errors',
                  '300 m left' in r5 and '2 users' in info5 and 'NOKIA' in r5 and c5 and c5[1] == 'NOKIA' and c5[2] == 300 and len(adm) == 5 and all(r[7].endswith('by mark@globe.example') for r in adm) and not allerr, (r5, c5, [r[7] for r in adm], allerr[:3]))
            await pg.screenshot(path=OUT + '/user_credits.png')
            for t in (task, taskB): t.cancel()
            for c in (ctx, ctxB): await c.close()
    finally:
        sheet.terminate(); web.terminate()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
