"""v2.42.6 / v2.42.7, against the real sheet script (v2427/gs, run by sheetsrv.cjs on port 8790) with a realistic Apps Script address:
 1. A (admin GLOBE) Invite a vendor (FADI): a short link …#i=<sheet>.<code>.<key print>; Send the invite link = the same short link
 2. B opens it: the list and the invite's company (FADI) come from the sheet; Save: B gets FADI's key (Invite log)
 3. B Invite a coworker: the sheet keeps an invite for FADI (made with B's key); C opens it and gets FADI's key
 4. B Move to another phone: …#m=…; D opens it: B's details filled in, the list taken; a second phone opening it: used already
 5. A Share list (any company): …#j=…; F joins with it; an old v2.42.5 jq= link still joins (G)
 6. credits on: B's survey KMZ is refused with 0 credits (Not enough credits); 1000 m given: charged once, the DXF after it free (no
    request), a longer route only the new metres; the balance shows in Export
 7. offline: one export while the balance lasts (counted at the next sync), the next refused; back online: counted (balance below 0)
 8. A (admin company) exports with no credit request; credits off: B exports with no charge; no page errors"""
import asyncio, sys, os, shutil, json, re, subprocess, time, urllib.request
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, xclick, skipscan
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_a'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
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
    shutil.rmtree(f'{D}/ud_{tag}', ignore_errors=True)
    r = await launch(p, f'{D}/ud_{tag}', S + '/v17/vid/h_cc.mjpeg', project=False)
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

async def main():
    sheet = subprocess.Popen(['node', D + '/sheetsrv.cjs', D + '/gs/PoleCam-online-sheet.gs', '8790'], stdout=subprocess.DEVNULL, stderr=open(OUT + '/sheet.err', 'w')); time.sleep(1.2)
    allerr = []
    try:
        async with async_playwright() as p:
            # ===== A: admin GLOBE with the online sheet (Admin key)
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
            # 1. Invite a vendor (FADI)
            await settings_btn(pg, '#inviteVendor')
            await pg.locator('#pickMList label', has_text='FADI').locator('input').check(); await pg.click('#pickMYes')
            await pg.wait_for_selector('#qrShow:not([hidden])', timeout=15000); await W(pg, 400); qI = await pg.evaluate(QR); await close_sheets(pg)
            mI = re.match(r'^https://marktamse\.github\.io/g-esaa/#i=' + DEP + r'\.([A-Z0-9]{14})\.([A-Za-z0-9_-]{12})$', qI['link'] or '')
            check('1. Invite a vendor (FADI): …#i=<sheet>.<code>.<key print> (no company, key or read key in it); Send the invite link sends the same short link',
                  mI and qI['send'] == qI['link'] and qI['btn'] == 'Send the invite link' and READ not in qI['link'] and len(qI['link']) <= 140, (len(qI['link'] or ''), qI['size'], qI['link'], qI['btn']))
            # 2. B opens it
            ctxB, pgB, errsB, curB, stB, taskB = await phone(p, 'B')
            await open_link(pgB, qI['link'])
            preB = await pgB.evaluate("({ team: !!__polecam.S.team, co: __polecam.S.inviteCo, code: __polecam.S.inviteCode, sel: document.getElementById('pfCompany').value })")
            await details(pgB, 'Rico Lasaya', '09181111111', 'rl@fadi.example')
            if await pgB.locator('#pfCompany option[value="FADI"]').count(): await pgB.select_option('#pfCompany', 'FADI')
            await pgB.click('#pfSave'); await W(pgB, 2500)
            for _ in range(2):
                if await pgB.is_visible('#askBox'): await pgB.click('#askBox button.primary'); await W(pgB, 800)
            kB = await pgB.evaluate("({ key: __polecam.S.companyKey, co: __polecam.S.keyCompany, code: __polecam.S.inviteCode })")
            ilog = dump()['sheets'].get('Invite log', [])
            check('2. B opens it: the list and the invite\'s company (FADI) came from the sheet; Save: FADI\'s key from the sheet (Invite log)',
                  preB['team'] and preB['co'] == 'FADI' and preB['code'] == mI.group(1) and kB['key'] == '7SPB-8BF2-6NTW' and kB['co'] == 'FADI' and not kB['code'] and any(r[2] == 'FADI' and r[5] == 'rl@fadi.example' for r in ilog[1:]), (preB, kB, ilog[-1:]))
            # 3. B: Invite a coworker
            await pgB.evaluate(f"window.POLECAM_SITE = '{SITE}'")
            await settings_btn(pgB, '#inviteBtn'); await pgB.wait_for_selector('#qrShow:not([hidden])', timeout=15000); await W(pgB, 400); qC = await pgB.evaluate(QR); await close_sheets(pgB)
            mC = re.match(r'^https://marktamse\.github\.io/g-esaa/#i=' + DEP + r'\.([A-Z0-9]{14})\.([A-Za-z0-9_-]{12})$', qC['link'] or '')
            invRow = [r for r in dump()['sheets']['Invites'] if mC and r[0] == mC.group(1)]
            ctxC, pgC, errsC, curC, stC, taskC = await phone(p, 'C')
            await open_link(pgC, qC['link'] or '#')
            await details(pgC, 'Ana Cruz', '09182222222', 'ac@fadi.example')
            if await pgC.locator('#pfCompany option[value="FADI"]').count(): await pgC.select_option('#pfCompany', 'FADI')
            await pgC.click('#pfSave'); await W(pgC, 2500)
            kC = await pgC.evaluate("({ key: __polecam.S.companyKey, co: __polecam.S.keyCompany })")
            check('3. B (company key) Invite a coworker: the sheet keeps an invite for FADI made by B; a short link; C opens it and gets FADI\'s key',
                  mC and invRow and invRow[0][1] == 'FADI' and invRow[0][7].startswith('rl@fadi.example · key:') and '7SPB' not in qC['link'] and kC['key'] == '7SPB-8BF2-6NTW' and kC['co'] == 'FADI', (qC['link'], invRow, kC))
            await ctxC.close(); taskC.cancel(); allerr += [e for e in errsC if 'PAGEERROR' in e]
            # 3b. B (already FADI, with its key) opens an invite: it says so and keeps its company
            await open_link(pgB, qI['link']); tB = await pgB.text_content('#toast') or ''; kB2 = await pgB.evaluate("({ co: __polecam.S.keyCompany, code: __polecam.S.inviteCode })")
            check('3b. a phone that already has a company key opening an invite: "already belongs to FADI", its key and company kept', 'already belongs to FADI' in tB and kB2['co'] == 'FADI' and not kB2['code'], (tB[:100], kB2))
            await pgB.evaluate(f"window.POLECAM_SITE = '{SITE}'")
            # 4. B: Move to another phone
            await settings_btn(pgB, '#moveBtn'); await pgB.wait_for_selector('#qrShow:not([hidden])', timeout=15000); await W(pgB, 400); qM = await pgB.evaluate(QR); await close_sheets(pgB)
            mM = re.match(r'^https://marktamse\.github\.io/g-esaa/#m=' + DEP + r'\.([A-Z0-9]{14})\.([A-Za-z0-9_-]{12})$', qM['link'] or '')
            ctxD, pgD, errsD, curD, stD, taskD = await phone(p, 'D')
            await open_link(pgD, qM['link'] or '#')
            dD = await pgD.evaluate("({ name: document.getElementById('pfName').value, email: document.getElementById('pfEmail').value, team: __polecam.S.team && __polecam.S.team.name })")
            ctxE, pgE, errsE, curE, stE, taskE = await phone(p, 'E')
            await open_link(pgE, qM['link'] or '#')
            dE = await pgE.evaluate("({ name: document.getElementById('pfName').value })")
            check('4. Move to another phone: …#m=…; D opens it: the details filled in and the list taken; opened again within 10 minutes (a retry, the app after the browser): the details come again',
                  mM and '10 minutes after it is first opened' in qM['note'] and dD['name'] == 'Rico Lasaya' and dD['email'] == 'rl@fadi.example' and dD['team'] == 'Globe OSP Mindanao' and dE['name'] == 'Rico Lasaya', (len(qM['link'] or ''), qM['link'], dD, dE, qM['note'][:120]))
            for c_, t_, e_ in ((ctxD, taskD, errsD), (ctxE, taskE, errsE)): await c_.close(); t_.cancel(); allerr += [e for e in e_ if 'PAGEERROR' in e]
            # 5. the plain join link: …#j=…; an old jq= link
            jl = await pg.evaluate("__polecam.shortJoin()")  # the plain join link (the QR after Save list; Share list where there is no sheet)
            qJ = {'link': jl, 'size': await pg.evaluate("(t) => { const q = window.qrcode(0, 'L'); q.addData(t); q.make(); return q.getModuleCount(); }", jl)}
            mJ = re.match(r'^https://marktamse\.github\.io/g-esaa/#j=' + DEP + r'\.' + READ + r'\.([A-Za-z0-9_-]{12})$', qJ['link'] or '')
            ctxF, pgF, errsF, curF, stF, taskF = await phone(p, 'F'); await open_link(pgF, qJ['link'] or '#')
            fT = await pgF.evaluate("__polecam.S.team && __polecam.S.team.name")
            jq = await pg.evaluate("""(async () => { const t = __polecam.S.team, d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t.key));
              const b = (u) => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
              return b(new TextEncoder().encode(JSON.stringify({ s: '""" + DEP + """', r: '""" + READ + """', i: t.id, f: b(d).slice(0, 16) }))); })()""")
            ctxG, pgG, errsG, curG, stG, taskG = await phone(p, 'G'); await open_link(pgG, f'{SITE}#jq={jq}')
            gT = await pgG.evaluate("__polecam.S.team && __polecam.S.team.name")
            check('5. the plain join link: …#j=<sheet>.<read key>.<key print>; F joins with it; an old v2.42.5 …#jq= link still joins (G)',
                  mJ and fT == 'Globe OSP Mindanao' and gT == 'Globe OSP Mindanao', (len(qJ['link'] or ''), qJ['link'], fT, len(jq) + len(SITE) + 4, gT))
            for c_, t_, e_ in ((ctxF, taskF, errsF), (ctxG, taskG, errsG)): await c_.close(); t_.cancel(); allerr += [e for e in e_ if 'PAGEERROR' in e]
            # 5b. Invite admin staff (GLOBE): a short link without the encrypted admin key; the staff phone gets it from the sheet (GLOBE's key)
            await settings_btn(pg, '#inviteAdminStaff'); await pg.wait_for_selector('#qrShow:not([hidden])', timeout=15000); await W(pg, 400); qS = await pg.evaluate(QR); await close_sheets(pg)
            ctxH, pgH, errsH, curH, stH, taskH = await phone(p, 'H'); await open_link(pgH, qS['link'] or '#')
            await details(pgH, 'Ana Reyes', '09182222222', 'ana@globe.example'); await pgH.fill('#pfIdNo', '200777')
            if await pgH.locator('#pfCompany option[value="GLOBE"]').count(): await pgH.select_option('#pfCompany', 'GLOBE')
            await pgH.click('#pfSave'); await W(pgH, 4000)
            hK = await pgH.evaluate("({ key: __polecam.S.companyKey, co: __polecam.S.keyCompany, ke: !!(__polecam.S.listKe && __polecam.S.listKe.ke && __polecam.S.listKe.ke.data) })")
            await close_sheets(pgH); await pgH.click('#settingsBtn'); await W(pgH, 400); await pgH.click('#goAdmin'); await W(pgH, 700); unlH = False
            if await pgH.is_visible('#admPin'): await pgH.fill('#admPin', '1234'); await pgH.click('#admUnlock'); await W(pgH, 1500); unlH = await pgH.is_hidden('#admLock')
            check('5b. Invite admin staff (GLOBE): …#i=… (no &ke=); H saves as GLOBE with the key from the sheet, then the sheet gives it the encrypted admin key: Manage unlocks with the PIN',
                  re.search(r'#i=' + DEP + r'\.[A-Z0-9]{14}\.', qS['link'] or '') and '&ke=' not in (qS['link'] or '') and hK['key'] == 'ZYTP-EE6P-3QY2' and hK['co'] == 'GLOBE' and hK['ke'] and unlH, (len(qS['link'] or ''), hK, unlH))
            await ctxH.close(); taskH.cancel(); allerr += [e for e in errsH if 'PAGEERROR' in e]
            sizes = {'admin staff (i=)': (len(qS['link']), qS['size']), 'invite (i=)': (len(qI['link']), qI['size']), 'coworker (i=)': (len(qC['link']), qC['size']), 'move (m=)': (len(qM['link']), qM['size']), 'join (j=)': (len(qJ['link']), qJ['size'])}
            print('SIZES', json.dumps(sizes))
            # 6. credits
            ctl({'op': 'set', 'k': 'Credits', 'v': 'Yes'})
            await sync(pgB); await sync(pg)
            listed = crow('rl@fadi.example'); adminListed = crow('mark@globe.example')
            await close_sheets(pgB); await pgB.click('#settingsBtn'); await W(pgB, 500)
            meB = await pgB.evaluate("document.getElementById('creditMe').getClientRects().length ? document.getElementById('creditMe').textContent : ''")
            meA = await pg.evaluate("document.getElementById('creditMe').hidden"); await close_sheets(pgB)
            ctl({'op': 'credits', 'email': 'rl@fadi.example', 'credits': 0, 'unl': '2099-12-31'}); await sync(pgB)
            await close_sheets(pgB); await pgB.click('#settingsBtn'); await W(pgB, 500); meU = await pgB.evaluate("document.getElementById('creditMe').textContent"); await close_sheets(pgB)
            ctl({'op': 'credits', 'email': 'rl@fadi.example', 'credits': 0, 'unl': 'No'}); await sync(pgB)
            check('6. v2.42.7: credits on: B is listed in the Credits tab at its sync ("first sync", before any export), A (admin company) is not; B sees "Credits: 0 m left" in Settings, A sees nothing; unlimited until a date shows that date',
                  listed and listed[1] == 'FADI' and 'first sync' in listed[7] and not adminListed and meB.startswith('Credits: 0 m left') and meA and 'unlimited until 2099-12-31' in meU, (listed, adminListed, meB, meA, meU))
            await newproj(pgB, 'survey', 'SV_CREDIT', purpose='As-built'); await close_sheets(pgB)
            await pole(pgB, curB, 'CC-0001', 0); await pole(pgB, curB, 'CC-0002', 0.0009)
            r0 = await pgB.evaluate("__polecam.S.meta.SV_CREDIT")
            e1 = await try_export(pgB, '#doKmz')
            ctl({'op': 'credits', 'email': 'rl@fadi.example', 'credits': 1000})
            await sync(pgB)
            n0 = len(credit_posts()); e2 = await try_export(pgB, '#doKmz'); n1 = len(credit_posts()); e3 = await try_export(pgB, '#doDxf'); n2 = len(credit_posts())
            row2 = crow('rl@fadi.example'); route2 = credit_posts()[-1].get('route') if credit_posts() else 0
            check('6a. credits on: B\'s first KMZ refused (Not enough credits, 0 m); 1000 m given: the KMZ charged the route once, the DXF after it free (no request); the balance in Export',
                  not e1['made'] and 'Not enough credits' in e1['ask'] and e2['made'] and 80 <= route2 <= 120 and row2 and row2[4] == route2 and n1 == n0 + 1 and e3['made'] and n2 == n1 and 'Credits:' in e2['toast'] and '1,000 m left' in e2['info'],
                  (e1, e2, e3, row2, route2, n0, n1, n2))
            await pole(pgB, curB, 'CC-0003', 0.0009)
            e4 = await try_export(pgB, '#doKmz'); row4 = crow('rl@fadi.example'); route4 = credit_posts()[-1].get('route')
            log = dump()['sheets'].get('Credit log', [])
            check('6b. a longer route: only the new metres are charged; two log rows for the project', e4['made'] and 180 <= route4 <= 220 and row4[4] == route4 and len([r for r in log[1:] if r[3] == 'SV_CREDIT']) == 2, (route4, row4, log[-2:]))
            # 7. offline
            ctl({'op': 'credits', 'email': 'rl@fadi.example', 'credits': route4 + 50}); await sync(pgB)
            await pole(pgB, curB, 'CC-0004', 0.0009)
            await ctxB.set_offline(True); await W(pgB, 500)
            n3 = len(credit_posts()); e5 = await try_export(pgB, '#doKmz'); q5 = await pgB.evaluate("(__polecam.S.creditQ || []).length")
            await pole(pgB, curB, 'CC-0005', 0.0009)
            e6 = await try_export(pgB, '#doKmz'); n4 = len(credit_posts())
            await ctxB.set_offline(False); await W(pgB, 1500); await sync(pgB); await W(pgB, 1500)
            row7 = crow('rl@fadi.example'); q7 = await pgB.evaluate("(__polecam.S.creditQ || []).length"); last = credit_posts()[-1]
            check('7. offline: one export while the balance lasts (counted at the next sync), the next refused (No credits left); back online: counted with allowNeg, the balance below zero',
                  e5['made'] and 'next sync' in e5['toast'] and q5 == 1 and not e6['made'] and 'No credits left' in e6['ask'] and n4 == n3 and q7 == 0 and last.get('allowNeg') and row7[4] > row7[2], (e5, e6, row7, last, q5, q7))
            # 8. the admin company; credits off
            await newproj(pg, 'survey', 'SV_ADMIN', purpose='As-built'); await close_sheets(pg)
            await pole(pg, cur, 'GL-0001', 0); await pole(pg, cur, 'GL-0002', 0.0009)
            n5 = len(credit_posts()); e7 = await try_export(pg, '#doKmz'); n6 = len(credit_posts())
            ctl({'op': 'set', 'k': 'Credits', 'v': 'No'}); await sync(pgB)
            await pole(pgB, curB, 'CC-0006', 0.0009); n7 = len(credit_posts()); e8 = await try_export(pgB, '#doKmz'); n8 = len(credit_posts())
            allerr += [e for e in errs + errsB if 'PAGEERROR' in e]
            check('8. A (admin company) exports with no credit request and no credit line in Export; credits off: B exports with no request; no page errors',
                  e7['made'] and n6 == n5 and not e7['info'] and e8['made'] and n8 == n7 and not e8['info'] and not allerr, (e7, n5, n6, e8, n7, n8, allerr[:3]))
            for c_ in (ctx, ctxB): await c_.close()
            task.cancel(); taskB.cancel()
    finally:
        sheet.terminate()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
