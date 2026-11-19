"""v2.42.28 copy (the export pill measured from the sheet's top). v2.42.7: exports from the Drawing tab with credits on (B, a vendor joined by a short invite; the real sheet script on 8791):
 1. Drawing → Export DXF → the DXF button: refused with 0 credits (Not enough credits), no file
 2. 1000 m given: Drawing → Export DXF: the DXF made and the route charged once
 3. a longer route, KMZ + DXF ticked together (one ZIP): only the new metres, one credit request; then Drawing → Export DXF again: free"""
import asyncio, sys, os, shutil, json, re, subprocess, time, urllib.request
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, xclick, skipscan
from playwright.async_api import async_playwright
D = S + '/v2427'; OUT = os.path.dirname(os.path.abspath(__file__)) + '/out_d28'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
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
    shutil.rmtree(f'{D}/udd_{tag}', ignore_errors=True)
    r = await launch(p, f'{D}/udd_{tag}', S + '/v17/vid/h_cc.mjpeg', project=False)
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
    xpill = await p_.evaluate("(() => { const b = document.getElementById('exportCredit'), r = b.getBoundingClientRect(), t = document.getElementById('export').getBoundingClientRect().top; return b.hidden ? '' : b.textContent + (b.classList.contains('low') ? ' [low]' : '') + (r.right > innerWidth * 0.6 && r.top - t < 80 ? ' [upper right]' : ''); })()")  # v2.42.28: Export the plan sits a little below the top on a phone
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
            ctl({'op': 'set', 'k': 'Credits', 'v': 'Yes'}); await sync(pgB)
            await newproj(pgB, 'survey', 'SV_DRAW', purpose='As-built'); await close_sheets(pgB)
            await pole(pgB, curB, 'CC-0901', 0); await pole(pgB, curB, 'CC-0902', 0.0009)
            n0 = len(credit_posts()); d1 = await draw_dxf(pgB); n1 = len(credit_posts())
            check('1. Drawing → Export DXF opens Export with the DXF picked; its button with 0 credits: Not enough credits, no file; Drawing and Export show "Credits: 0 m" at the upper right, in red',
                  d1['picked'] == ['doDxf'] and not d1['made'] and d1['ask'] == 'Not enough credits' and n1 == n0 + 1 and d1['dpill'] == 'Credits: 0 m [low] [upper right]' and d1['xpill'] == 'Credits: 0 m [low] [upper right]', (d1, n1 - n0))
            ctl({'op': 'credits', 'email': 'rl@fadi.example', 'credits': 1000}); await sync(pgB)
            d2 = await draw_dxf(pgB); n2 = len(credit_posts()); row2 = crow('rl@fadi.example')
            check('2. 1000 m given: Drawing → Export DXF makes the DXF; the route (about 100 m) charged once; the balance at the upper right and on the Export screen; Ready says what it used (not hidden by the DXF\'s own message)',
                  d2['made'] and n2 == n1 + 1 and row2 and 80 <= row2[4] <= 120 and 'Credits: 1,000 m left' in d2['info'] and 'used for the route' in d2['res'] and d2['dpill'] == 'Credits: 1,000 m [upper right]', (d2, n2 - n1, row2))
            await pole(pgB, curB, 'CC-0903', 0.0009)
            await close_sheets(pgB); await pgB.click('#exportBtn'); await W(pgB, 400)
            await pgB.evaluate("() => { document.querySelectorAll('#xMultiList input').forEach((c) => { c.checked = ['doKmz', 'doDxf'].includes(c.value); }); document.getElementById('xMultiList').dispatchEvent(new Event('change', { bubbles: true })); }"); await W(pgB, 300)
            async with pgB.expect_download(timeout=120000) as dlz:
                await pgB.click('#xMultiGo')
                for _ in range(80):
                    await W(pgB, 500)
                    if await pgB.is_visible('#resultBox'): await pgB.click('#resSave'); break
            z = await dlz.value; zp = f'{OUT}/multi.zip'; await z.save_as(zp); await pgB.evaluate("document.getElementById('resultBox').hidden = true"); await close_sheets(pgB)
            import zipfile; names = zipfile.ZipFile(zp).namelist(); n3 = len(credit_posts()); row3 = crow('rl@fadi.example')
            d4 = await draw_dxf(pgB); n4 = len(credit_posts())
            allerr = [e for e in errs + errsB if 'PAGEERROR' in e]
            check('3. a longer route, KMZ + DXF in one ZIP: both files, one credit request, only the new 100 m; then Drawing → Export DXF again: free (no request, no credit line in Ready), the upper right says 800 m; no page errors',
                  any(n.endswith('.kmz') for n in names) and any('DXF' in n or n.endswith('.zip') or n.endswith('.dxf') for n in names) and n3 == n2 + 1 and 180 <= row3[4] <= 220 and d4['made'] and not d4['res'] and n4 == n3 and d4['dpill'] == 'Credits: 800 m [upper right]' and not allerr,
                  (names, n3 - n2, row3, d4['made'], n4 - n3, allerr[:3]))
            for t in (task, taskB): t.cancel()
            for c in (ctx, ctxB): await c.close()
    finally:
        sheet.terminate(); web.terminate()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
