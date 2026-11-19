"""v2.26: short invites (the list from the online sheet): a small QR code, and the invited user joins straight from the link;
an Android browser offers to open the link in the G-eSAA app; the APK takes a gesaa:// link."""
import asyncio, sys, os, shutil, json, re, base64
from urllib.parse import urlparse, parse_qs
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, SHEET_URL
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out'; os.makedirs(OUT, exist_ok=True)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:400])
READ, AKEY = 'READ-KEY-TEST', 'ADMIN-KEY-TEST'
KEYS = {'GLOBE': ('ZYTP-EE6P-3QY2', True), 'FADI': ('7SPB-8BF2-6NTW', False)}
FKEY = KEYS['FADI'][0]; FN = re.sub('[^A-Z0-9]', '', FKEY)
nk = lambda k: re.sub('[^A-Z0-9]', '', str(k).upper())
SHEET = {'list': None, 'rev': 0, 'asks': []}
SITE = 'https://example.test/g/'
async def reply(route, body): await route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
async def strict_sheet(route):
    """Like PoleCam-online-sheet.gs with company keys (strict): a key alone is enough; with the read key and no key, no tasks."""
    req = route.request
    if req.method == 'POST':
        b = json.loads(req.post_data or '{}')
        if b.get('key') != AKEY: return await reply(route, {'ok': False, 'error': 'key'})
        if b.get('action') == 'setList': SHEET['list'] = b['list']; SHEET['rev'] = b['rev']
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
    return await reply(route, {**base, 'companies': [], 'scope': 'none'})
ANDROID_JS = "Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });"
async def phone(p, tag, android=False):
    shutil.rmtree(f'{D}/ud_{tag}', ignore_errors=True)
    r = await launch(p, f'{D}/ud_{tag}', S + '/v17/vid/h_cc.mjpeg', project=False)
    if android: await r[0].add_init_script(ANDROID_JS)
    await r[0].route('https://script.google.com/**', strict_sheet)
    await r[1].evaluate(f"window.POLECAM_SITE = '{SITE}'")
    return r
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def leaks(pg):
    """Every place a person could read the key: the page text, every field, the QR note."""
    return await pg.evaluate("""k => { const n = k.replace(/-/g, ''), seen = [];
      const txt = document.body.innerText; if (txt.includes(k) || txt.includes(n)) seen.push('text');
      document.querySelectorAll('input, textarea, select').forEach(e => { const v = String(e.value || ''); if (v.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(n)) seen.push('field ' + (e.id || e.name)); });
      return seen; }""", FKEY)
def link_has_key(link): return FN in nk(link) or FKEY in link
async def open_link(p_, link):
    await p_.goto('http://localhost:8765/index.html' + link[link.index('#'):]); await W(p_, 2500)
    await p_.evaluate(f"window.POLECAM_SITE = '{SITE}'")
async def close_sheets(p_):
    for _ in range(6):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 300)
async def details(p_, n, m, e):
    await p_.fill('#pfName', n); await p_.fill('#pfMobile', m); await p_.fill('#pfEmail', e)

async def main():
    async with async_playwright() as p:
        # ===== A: the admin makes the list with the online sheet (company keys)
        ctx, pg, errs, cur, state, task = await phone(p, 'A')
        await details(pg, 'Mark Tamse', '09171234567', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP Mindanao'); await pg.fill('#admUrl', SHEET_URL); await pg.fill('#admReadKey', READ); await pg.fill('#admWriteKey', AKEY)
        await pg.click('#admCoRefresh'); await W(pg, 800)
        await pg.click('#admSave'); await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=20000); await W(pg, 500)  # v2.28: with the sheet, no QR after Save
        if await pg.is_visible('#askBox'): await pg.click('#askBox button:has-text("OK")'); await W(pg, 300)
        else: await pg.click('#qrClose'); await W(pg, 300)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 600)
        await close_sheets(pg)
        await pg.click('#settingsBtn'); await W(pg, 300); await pg.click('#goAdmin'); await W(pg, 300)
        if await pg.is_visible('#admPin'): await pg.fill('#admPin', '1234'); await pg.click('#admUnlock'); await W(pg, 800)
        await pg.fill('#admInvKey', FKEY); await pg.click('#admInvMake'); await pg.wait_for_selector('#qrShow:not([hidden])', timeout=8000); await W(pg, 500)
        inv = await pg.evaluate("__polecam.lastQr")
        qr = await pg.evaluate("({ svg: !!document.querySelector('#qrImg svg'), size: +document.getElementById('qrImg').dataset.size || 0, msg: document.getElementById('qrImg').textContent })")
        await pg.screenshot(path=f'{OUT}/i1_admin_short_invite.png')
        check('admin invite: a short link (#jq= list from the sheet + &ci= masked key), a small QR code (not “too much”), no key in it',
              '#jq=' in inv and '&ci=k' in inv and '#join=' not in inv and len(inv) < 500 and qr['svg'] and qr['size'] <= 57 and not link_has_key(inv), f'len {len(inv)} | {qr} | {inv[:90]}')
        await pg.click('#qrClose'); await W(pg, 300)

        # ===== B: a FADI user opens the invite link: no QR / paste question, straight to the details
        ctxB, pgB, errsB, curB, stB, taskB = await phone(p, 'B')
        await open_link(pgB, inv)
        stB0 = await pgB.evaluate("({ prof: !document.getElementById('profile').hidden, state: document.getElementById('pfKeyState').textContent, team: !!__polecam.S.team, joinBox: document.getElementById('pfJoin') ? !document.getElementById('pfJoin').hidden : null, ask: !document.getElementById('askBox').hidden })")
        await pgB.screenshot(path=f'{OUT}/i2_invite_received.png')
        check('B: the link alone is enough: company list downloaded, “Invite received”, no scan / paste step, no question',
              stB0['prof'] and stB0['team'] and 'Invite received' in stB0['state'] and not stB0['ask'], stB0)
        await details(pgB, 'Rico Lasaya', '09181111111', 'rl@fadi.example'); await pgB.click('#pfSave'); await W(pgB, 2500)
        if await pgB.is_visible('#askBox'): await pgB.click('#askBox button.primary'); await W(pgB, 800)
        sB = await pgB.evaluate("({ co: __polecam.S.keyCompany, user: __polecam.S.user && __polecam.S.user.company, at: !!__polecam.S.sheetListAt })")
        check('B: Save → signed in as FADI', sB['co'] == 'FADI' and sB['user'] == 'FADI' and sB['at'], sB)
        await close_sheets(pgB); await pgB.click('#settingsBtn'); await W(pgB, 300); await pgB.click('#inviteBtn'); await pgB.wait_for_selector('#qrShow:not([hidden])'); await W(pgB, 400)
        invB = await pgB.evaluate("__polecam.lastQr"); qrB = await pgB.evaluate("!!document.querySelector('#qrImg svg')")
        check('B: Invite a coworker is short too (QR code drawn)', '#jq=' in invB and '&ci=k' in invB and len(invB) < 500 and qrB, f'len {len(invB)}')
        await pgB.click('#qrClose'); await W(pgB, 300)

        # ===== C: Android browser: “Open in the G-eSAA app?” → Continue in this browser → invite received
        ctxC, pgC, errsC, curC, stC, taskC = await phone(p, 'C', android=True)
        await pgC.goto('about:blank'); await pgC.goto('http://localhost:8765/index.html' + invB[invB.index('#'):]); await W(pgC, 2000)
        askC = await pgC.evaluate("[!document.getElementById('askBox').hidden, document.getElementById('askTitle').textContent, [...document.querySelectorAll('#askBox button')].map(b => b.textContent)]")
        await pgC.screenshot(path=f'{OUT}/i3_android_ask.png')
        await pgC.click('#askBox button:has-text("Continue in this browser")'); await W(pgC, 2500)
        stC0 = await pgC.evaluate("({ state: document.getElementById('pfKeyState').textContent, web: !!__polecam.S.linkWeb })")
        check('C (Android browser): asks “Open in the G-eSAA app?”; Continue in this browser → Invite received',
              askC[0] and askC[1] == 'Open in the G-eSAA app?' and sorted(askC[2]) == ['Continue in this browser', 'Open in the G-eSAA app'] and 'Invite received' in stC0['state'] and stC0['web'], (askC, stC0))
        await details(pgC, 'Ana Cruz', '09182222222', 'ac@fadi.example'); await pgC.click('#pfSave'); await W(pgC, 2500)
        if await pgC.is_visible('#askBox'): await pgC.click('#askBox button.primary'); await W(pgC, 800)
        check('C: Save → FADI', await pgC.evaluate("__polecam.S.keyCompany") == 'FADI')

        # ===== D: Android browser → Open in the G-eSAA app: an intent:// link to the app with the invite, the web page as fallback
        ctxD, pgD, errsD, curD, stD, taskD = await phone(p, 'D', android=True)
        navs = []
        pgD.on('console', lambda m: navs.append(m.text) if 'intent://' in m.text else None)
        pgD.on('framenavigated', lambda f: navs.append(f.url) if 'intent://' in f.url else None)
        cdp = await ctxD.new_cdp_session(pgD); await cdp.send('Page.enable')
        cdp.on('Page.frameRequestedNavigation', lambda e: navs.append(e.get('url', '')))
        await pgD.goto('about:blank'); await pgD.goto('http://localhost:8765/index.html' + invB[invB.index('#'):]); await W(pgD, 2000)
        await pgD.click('#askBox button:has-text("Open in the G-eSAA app")'); await W(pgD, 2500)
        it = next((n for n in navs if 'intent://' in n), '')
        m = re.search(r'intent://open\?h=([^#\s\']+)#Intent;scheme=gesaa;package=com\.marktamse\.polecam;S\.browser_fallback_url=([^;\s\']+);end', it)
        from urllib.parse import unquote
        h = unquote(m.group(1)) if m else ''; fb = unquote(m.group(2)) if m else ''
        print('intent', it[:160])
        check('D: Open in the G-eSAA app → intent:// to com.marktamse.polecam carrying the invite; fallback = this page with ?web=1',
              bool(m) and 'jq=' in h and 'ci=k' in h, (h[:80], fb[:120]))
        check('D: the fallback page opens the invite here without asking again', fb.startswith('http://localhost:8765/index.html?web=1#') and 'ci=k' in fb, fb[:100])
        # ===== N: the APK gets gesaa://open?h=… (SharedFile plugin → sharedLink) → the same invite flow
        ctxN, pgN, errsN, curN, stN, taskN = await phone(p, 'N')
        await pgN.evaluate("u => __polecam.linkFromNative({ url: u })", 'gesaa://open?h=' + (m.group(1) if m else '')); await W(pgN, 2500)
        stN0 = await pgN.evaluate("({ state: document.getElementById('pfKeyState').textContent, prof: !document.getElementById('profile').hidden })")
        check('APK: gesaa://open?h=<invite> → Invite received (no scan / paste)', stN0['prof'] and 'Invite received' in stN0['state'], stN0)
        await pgN.evaluate("u => __polecam.linkFromNative({ url: u })", 'gesaa://open?h=nothing'); await W(pgN, 500)
        tN = await pgN.evaluate("document.getElementById('toast').textContent")
        check('APK: a link without an invite is refused with a hint', 'could not be read' in tN, tN)
        # ===== a desktop browser is never asked
        check('desktop / iPhone browser (A, B): never asked to open the app', not stB0['ask'])
        allerr = {'A': errs[:3], 'B': errsB[:3], 'C': errsC[:3], 'D': [e for e in errsD if 'intent://' not in e][:3], 'N': errsN[:3]}
        print('errors', allerr)
        check('no page errors', not any(allerr.values()), allerr)
        for t in (task, taskB, taskC, taskD, taskN): t.cancel()
        for c in (ctx, ctxB, ctxC, ctxD, ctxN): await c.close()
        print(f'\n{sum(checks)}/{len(checks)} checks passed')
asyncio.run(main())
