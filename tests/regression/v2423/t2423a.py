"""v2.42.3: Invite a coworker where the online sheet uses company keys (strict), from a phone with no company key (the admin's,
which reads the sheet with its Admin key). The video of 3 Nov 2026: the QR named GLOBE but carried no key, so the new phone said
"This phone already has the latest list (version 15)" and stayed at "No invite yet", with Save blocked.
 1. the admin phone (GLOBE, Admin key, no company key): Invite a coworker asks the sheet for an invite for GLOBE; the QR link says
    co=GLOBE and the invite code (iv=)
 2. a new phone opening it: no "No invite yet" dead end: GLOBE is fixed from the invite (the company box shown, the key box not)
 3. Save: no admin PIN asked; the sheet hands over GLOBE's key with the code; the phone reads with it (company fixed: GLOBE); not
    a list admin
 4. that phone's own Invite a coworker passes the key on (ci=), as before
 5. an old invite (co=GLOBE, no code; what v2.42.2 made) on a keyed phone, scanned when the list is already there: it says what is
    wrong and what to do (no key in the invite: ask for a new one), not only "already has the latest list"
 6. the admin phone without its Admin key: Invite a coworker explains why no invite can be made (no QR code that cannot work);
    no page errors"""
import asyncio, sys, os, shutil, json, re
from urllib.parse import urlparse, parse_qs
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, SHEET_URL
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_a'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900], flush=True)
READ, AKEY = 'READ-KEY-TEST', 'ADMIN-KEY-TEST'
KEYS = {'GLOBE': ('ZYTP-EE6P-3QY2', True), 'FADI': ('7SPB-8BF2-6NTW', False)}
GN = re.sub('[^A-Z0-9]', '', KEYS['GLOBE'][0])
nk = lambda k: re.sub('[^A-Z0-9]', '', str(k).upper())
SHEET = {'list': None, 'rev': 0, 'asks': [], 'posts': [], 'invites': {}}
SITE = 'https://example.test/g/'
async def reply(route, body): await route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
async def strict_sheet(route):
    """PoleCam-online-sheet.gs with company keys (strict), with makeInvite / redeemInvite (script v2.42)."""
    req = route.request
    if req.method == 'POST':
        b = json.loads(req.post_data or '{}'); SHEET['posts'].append(b)
        if b.get('action') == 'redeemInvite':
            cos = SHEET['invites'].get(str(b.get('code', '')).upper())
            if cos is None: return await reply(route, {'ok': False, 'error': 'invite'})
            co = str(b.get('company', '')).strip().upper()
            if co not in [c.upper() for c in cos] or co not in KEYS: return await reply(route, {'ok': False, 'error': 'company'})
            return await reply(route, {'ok': True, 'key': KEYS[co][0], 'you': co})
        if b.get('key') != AKEY: return await reply(route, {'ok': False, 'error': 'key'})
        if b.get('action') == 'setList': SHEET['list'] = b['list']; SHEET['rev'] = b['rev']
        if b.get('action') == 'makeInvite':
            code = f'GINV{len(SHEET["invites"]) + 1:04d}XYZW'; SHEET['invites'][code] = list(b.get('cos') or [])
            return await reply(route, {'ok': True, 'code': code, 'until': '2026-11-17'})
        return await reply(route, {'ok': True})
    q = {k: v[0] for k, v in parse_qs(urlparse(req.url).query, keep_blank_values=True).items()}
    SHEET['asks'].append(q)
    if 'probe' in q: return await reply(route, {'ok': True, 'strict': True})
    ck = nk(q.get('ckey', '')); owner = next((c for c, (k, a) in KEYS.items() if len(ck) >= 8 and nk(k) == ck), None)
    if q.get('key') != READ and not owner: return await reply(route, {'ok': False, 'error': 'company key' if q.get('ckey') else 'key'})
    base = {'ok': True, 'name': 'Test sheet', 'packs': [], 'admins': ['GLOBE'], 'strict': True, 'tasks': []}
    if SHEET['list']: base['list'] = SHEET['list']; base['listRev'] = SHEET['rev']
    if q.get('akey') == AKEY: return await reply(route, {**base, 'companies': list(KEYS), 'scope': 'all'})
    if owner: return await reply(route, {**base, 'companies': [owner], 'scope': 'company', 'you': owner})
    if q.get('company'): return await reply(route, {'ok': False, 'error': 'company key'})  # as access_(): a company without its key
    return await reply(route, {**base, 'companies': [], 'scope': 'none'})
async def phone(p, tag):
    shutil.rmtree(f'{D}/ud_{tag}', ignore_errors=True)
    r = await launch(p, f'{D}/ud_{tag}', S + '/v17/vid/h_cc.mjpeg', project=False)
    await r[0].route('https://script.google.com/**', strict_sheet)
    await r[1].evaluate(f"window.POLECAM_SITE = '{SITE}'")
    return r
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def open_link(p_, link):
    await p_.goto('http://localhost:8765/index.html' + link[link.index('#'):]); await W(p_, 3000)
    await p_.evaluate(f"window.POLECAM_SITE = '{SITE}'")
async def close_sheets(p_):
    for _ in range(6):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 300)
async def details(p_, n, m, e):
    await p_.fill('#pfName', n); await p_.fill('#pfMobile', m); await p_.fill('#pfEmail', e)
VIEW = """() => ({ prof: !document.getElementById('profile').hidden, keyBox: !document.getElementById('pfKeyBox').hidden, coBox: !document.getElementById('pfCoBox').hidden,
  state: document.getElementById('pfKeyState').textContent, info: document.getElementById('pfKeyInfo').textContent, co: document.getElementById('pfCompany').value,
  cos: [...document.getElementById('pfCompany').options].map((o) => o.value).filter(Boolean), toast: document.getElementById('toast').textContent,
  err: document.getElementById('pfErr').hidden ? '' : document.getElementById('pfErr').textContent, team: !!__polecam.S.team, note: document.getElementById('pfTeam').textContent })"""

async def main():
    async with async_playwright() as p:
        # ===== A: the admin phone (GLOBE, the Admin key, no company key)
        ctx, pg, errs, cur, state, task = await phone(p, 'A')
        await details(pg, 'Mark Tamse', '09171234567', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP Mindanao'); await pg.fill('#admUrl', SHEET_URL); await pg.fill('#admReadKey', READ); await pg.fill('#admWriteKey', AKEY)
        await pg.click('#admCoRefresh'); await W(pg, 800)
        await pg.click('#admSave'); await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=20000); await W(pg, 500)
        if await pg.is_visible('#askBox'): await pg.click('#askBox button:has-text("OK")'); await W(pg, 300)
        else: await pg.click('#qrClose'); await W(pg, 300)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900)
        await close_sheets(pg)
        a0 = await pg.evaluate("({ key: __polecam.S.companyKey || '', co: __polecam.S.user && __polecam.S.user.company, akey: !!__polecam.S.onlineAdminKey })")
        # 1. Invite a coworker
        n0 = len(SHEET['posts'])
        await pg.click('#settingsBtn'); await W(pg, 400); await pg.click('#inviteBtn'); await pg.wait_for_selector('#qrShow:not([hidden]), #askBox:not([hidden])', timeout=15000); await W(pg, 600)
        invA = await pg.evaluate("__polecam.lastQr"); titleA = await pg.text_content('#qrTitle'); noteA = await pg.text_content('#qrText')
        postA = next((b for b in SHEET['posts'][n0:] if b.get('action') == 'makeInvite'), None)
        await pg.screenshot(path=f'{OUT}/a1_admin_invite_coworker.png')
        ivA = (re.search(r'&iv=([A-Z0-9]+)', invA or '') or [None, None])[1]
        check('1. the admin phone (GLOBE, Admin key, no company key): Invite a coworker asks the sheet for an invite for GLOBE; the QR link says co=GLOBE and the code',
              a0['co'] == 'GLOBE' and not a0['key'] and a0['akey'] and postA and postA.get('cos') == ['GLOBE'] and postA.get('key') == AKEY and '&co=GLOBE' in (invA or '') and ivA and ivA in SHEET['invites'] and 'GLOBE' in titleA,
              (a0, postA, (invA or '')[-60:], titleA, noteA[-160:]))
        await close_sheets(pg)

        # ===== B: a new phone opens that invite
        ctxB, pgB, errsB, curB, stB, taskB = await phone(p, 'B')
        await open_link(pgB, invA)
        for _ in range(3):
            if not await pgB.is_visible('#askBox'): break
            await pgB.click('#askBox button.primary'); await W(pgB, 800)
        vB = await pgB.evaluate(VIEW)
        await pgB.screenshot(path=f'{OUT}/b1_new_phone_invite.png')
        check('2. a new phone with that invite: the list is there, GLOBE fixed from the invite (company box shown, no "No invite yet" key box; it says no admin PIN is needed)',
              vB['prof'] and vB['team'] and not vB['keyBox'] and vB['coBox'] and vB['co'] == 'GLOBE' and 'no admin PIN' in vB['note'], vB)
        await details(pgB, 'Jose Rizal', '09181111111', 'jr@globe.example')
        nB = len(SHEET['posts']); await pgB.click('#pfSave'); await W(pgB, 2500)
        pin = await pgB.is_visible('#pinBox')
        if pin: await pgB.click('#pinNo'); await W(pgB, 500)
        sB = await pgB.evaluate("({ kc: __polecam.S.keyCompany, key: __polecam.S.companyKey, co: __polecam.S.user && __polecam.S.user.company, admin: !!__polecam.S.adminKey, code: __polecam.S.inviteCode || '', prof: !document.getElementById('profile').hidden })")
        red = next((b for b in SHEET['posts'][nB:] if b.get('action') == 'redeemInvite'), None)
        readsB = [q for q in SHEET['asks'] if nk(q.get('ckey', '')) == GN]
        await W(pgB, 1500); await pgB.screenshot(path=f'{OUT}/b2_saved.png')
        check('3. Save: no admin PIN asked; the sheet hands over GLOBE\'s key with the code; the phone reads with it, its company fixed (GLOBE); not a list admin',
              not pin and red and red.get('code') == ivA and red.get('company') == 'GLOBE' and sB['kc'] == 'GLOBE' and nk(sB['key']) == GN and sB['co'] == 'GLOBE' and not sB['admin'] and not sB['code'] and not sB['prof'] and readsB,
              (pin, red, sB, len(readsB)))
        # 4. B's own coworker invite passes the key on
        await close_sheets(pgB); await pgB.click('#settingsBtn'); await W(pgB, 400); await pgB.click('#inviteBtn'); await pgB.wait_for_selector('#qrShow:not([hidden])', timeout=10000); await W(pgB, 400)
        invB = await pgB.evaluate("__polecam.lastQr")
        check('4. that phone\'s Invite a coworker passes the key on (ci=, the key masked), as before', '&ci=k' in invB and GN not in nk(invB), invB[-50:])
        await close_sheets(pgB)

        # ===== C: the video: an old invite (co=GLOBE, no code) on a keyed phone that already has the list
        old = re.sub(r'&iv=[A-Z0-9]+', '', invA)
        ctxC, pgC, errsC, curC, stC, taskC = await phone(p, 'C')
        await open_link(pgC, old)
        for _ in range(3):
            if not await pgC.is_visible('#askBox'): break
            await pgC.click('#askBox button.primary'); await W(pgC, 800)
        vC0 = await pgC.evaluate(VIEW)
        await pgC.evaluate("() => { try { navigator.clipboard.readText = () => Promise.reject(new Error('no')); } catch (e) {} }")
        await pgC.click('#pfKeyPaste'); await pgC.wait_for_selector('#promptBox:not([hidden])', timeout=5000); await pgC.fill('#promptInput', old); await pgC.click('#promptYes')
        toasts = []
        for _ in range(16):
            t = await pgC.evaluate("document.getElementById('toast').textContent");
            if t and t not in toasts: toasts.append(t)
            await W(pgC, 250)
        vC = await pgC.evaluate(VIEW)
        await pgC.screenshot(path=f'{OUT}/c1_old_invite.png')
        msg = (vC['info'] + ' ' + ' '.join(toasts))
        check('5. an old invite (co=GLOBE, no code): a new phone opening it, and the same phone scanning it again with the list there: it says the invite has no company key and to ask for a new one (not "No invite yet" alone, not only "already has the latest list")',
              vC0['keyBox'] and 'no company key' in vC0['state'] and 'new invite' in vC0['info'] and vC['keyBox'] and re.search(r'no company key', msg, re.I) and re.search(r'new invite', msg, re.I)
              and not any(x.startswith('Invite received') for x in toasts), (vC0['state'], vC0['info'][:60], vC['state'], vC['info'], toasts))

        # ===== D: the admin phone without its Admin key
        await pg.evaluate("() => { __polecam.S.onlineAdminKey = ''; }")
        await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 400); await pg.click('#inviteBtn'); await W(pg, 1200)
        dD = await pg.evaluate("({ ask: !document.getElementById('askBox').hidden, title: document.getElementById('askTitle').textContent, text: document.getElementById('askText').textContent, qr: !document.getElementById('qrShow').hidden })")
        await pg.screenshot(path=f'{OUT}/d1_no_admin_key.png')
        allerrs = [e for e in errs + errsB + errsC if 'PAGEERROR' in e]
        check('6. the admin phone without its Admin key: Invite a coworker explains (Admin key / ask for an invite), no QR code that cannot work; no page errors',
              dD['ask'] and not dD['qr'] and re.search(r'Admin key', dD['text']) and not allerrs, (dD, allerrs[:3]))
        for t in (task, taskB, taskC): t.cancel()
        for c in (ctx, ctxB, ctxC): await c.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
