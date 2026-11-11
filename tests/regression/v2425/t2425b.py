"""v2.42.5 upgrade: phones set up on v2.42.4 (the list with the encrypted admin key inside) update to v2.42.5 (same website):
 1. on v2.42.4: A (admin GLOBE) makes the list; E (GLOBE staff) joins with the PIN; F (vendor FADI) joins
 2. the app updates to v2.42.5; A saves version 2 (the key no longer in it); E and F take version 2 from its join link
 3. E (admin company) keeps the key it had: Manage unlocks with the PIN; F (vendor) no longer has it; no page errors"""
import asyncio, sys, os, shutil, subprocess, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from common import sheet_companies
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_b'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
PORT = 8768; BASE = f'http://localhost:{PORT}'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:600], flush=True)
def serve(dirn):
    p = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=dirn, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.2); return p
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(p_):
    for _ in range(6):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 300)
async def phone(p, tag):
    shutil.rmtree(f'{OUT}/ud_{tag}', ignore_errors=True)
    ctx = await p.chromium.launch_persistent_context(f'{OUT}/ud_{tag}', executable_path=common.CHROME, viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    await ctx.route('https://script.google.com/**', common.sheet_route)
    for u in ('https://tile.openstreetmap.org/**', 'https://server.arcgisonline.com/**'): await ctx.route(u, lambda r: r.abort())
    await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS); await ctx.add_init_script(common.ADM_OPEN_JS)
    pg = ctx.pages[0]; errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    await pg.goto(BASE + '/index.html'); await W(pg, 1500)
    return ctx, pg, errs
async def details(p_, n, m, e): await p_.fill('#pfName', n); await p_.fill('#pfMobile', m); await p_.fill('#pfEmail', e)
async def paste_join(p_, link, btn='#pfPaste'):
    await p_.evaluate("() => { try { navigator.clipboard.readText = () => Promise.reject(new Error('no')); } catch (e) {} }")
    await p_.click(btn); await p_.wait_for_selector('#promptBox:not([hidden])'); await p_.fill('#promptInput', link); await p_.click('#promptYes'); await W(p_, 1200)
    for _ in range(3):
        if not await p_.is_visible('#askBox'): break
        await p_.click('#askBox button.primary'); await W(p_, 900)
KE = "() => { const S = __polecam.S; return { ver: S.team && S.team.rev, apart: !!(S.team && S.team.keyEnc && S.team.keyEnc.apart), kept: !!(S.listKe && S.listKe.ke && S.listKe.ke.data), admin: !!S.adminKey, co: S.user && S.user.company }; }"
async def main():
    srv = serve(PRIV + '/old/v2.42.4')  # v2.42.4
    try:
        async with async_playwright() as p:
            ctx, pg, errs = await phone(p, 'A')
            await details(pg, 'Mark Tamse', '09171234567', 'mark@example.com')
            await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
            await pg.fill('#admName', 'Globe OSP'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
            await pg.click('#admSave'); await pg.wait_for_selector('#qrShow:not([hidden]), #askBox:not([hidden])', timeout=20000); await W(pg, 400)
            if await pg.is_visible('#askBox'): await pg.click('#askBox button:has-text("OK")'); await W(pg, 300)
            if await pg.is_visible('#qrShow'): await pg.click('#qrClose'); await W(pg, 300)
            await pg.evaluate("window.POLECAM_SITE = 'https://example.test/g/'")
            await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 600); await close_sheets(pg)
            await pg.evaluate("window.POLECAM_SITE = 'https://example.test/g/'")
            await pg.click('#settingsBtn'); await W(pg, 400)
            share = '#teamShare' if await pg.is_visible('#teamShare') else '#inviteAdminStaff'
            await pg.click(share); await W(pg, 600)
            if await pg.is_visible('#pickMBox'): await pg.locator('#pickMList label.any input').check() if await pg.locator('#pickMList label.any').count() else None; await pg.click('#pickMYes')
            await pg.wait_for_selector('#qrShow:not([hidden])', timeout=10000); v1 = await pg.evaluate("__polecam.lastQrLink || __polecam.lastQr"); await close_sheets(pg)
            v1 = v1.split('&')[0]  # the list only (a plain join link)
            ctxE, pgE, errsE = await phone(p, 'E'); await details(pgE, 'Ana Reyes', '09182222222', 'ana@globe.example')
            await paste_join(pgE, v1); await pgE.select_option('#pfCompany', 'GLOBE'); await pgE.click('#pfSave'); await W(pgE, 900)
            if await pgE.is_visible('#pinBox'): await pgE.fill('#pinInput', '1234'); await pgE.click('#pinYes'); await W(pgE, 1500)
            ctxF, pgF, errsF = await phone(p, 'F'); await details(pgF, 'Rico Lasaya', '09181111111', 'rl@fadi.example')
            await paste_join(pgF, v1); await pgF.select_option('#pfCompany', 'FADI'); await pgF.click('#pfSave'); await W(pgF, 900)
            e0 = await pgE.evaluate(KE); f0 = await pgF.evaluate(KE)
            hasF = await pgF.evaluate("!!(__polecam.S.team && __polecam.S.team.keyEnc && __polecam.S.team.keyEnc.data && !__polecam.S.team.keyEnc.apart)")
            check('1. on v2.42.4: E joined as GLOBE with the PIN (admin); F as FADI; both lists carry the encrypted admin key (the old format)', e0['co'] == 'GLOBE' and e0['admin'] and f0['co'] == 'FADI' and not e0['apart'] and hasF, (e0, f0, hasF))
            # the website updates
            srv.terminate(); srv.wait(); srv = serve(PRIV + '/old/v2.42.5')
            for x in (pg, pgE, pgF): await x.reload(); await W(x, 2000)
            ver = await pg.evaluate("document.body.innerText.includes('2.42.5') || (window.__polecam && 1)")
            # A saves version 2
            await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 400); await pg.click('#goAdmin'); await W(pg, 600)
            if await pg.is_visible('#admPin'): await pg.fill('#admPin', '1234'); await pg.click('#admUnlock'); await W(pg, 900)
            await pg.fill('#admName', 'Globe OSP v2'); await pg.click('#admSave'); await pg.wait_for_selector('#qrShow:not([hidden]), #askBox:not([hidden])', timeout=20000); await W(pg, 500)
            if await pg.is_visible('#askBox'): await pg.click('#askBox button:has-text("OK")'); await W(pg, 300)
            if await pg.is_visible('#qrShow'): await pg.click('#qrClose'); await W(pg, 300)
            a2 = await pg.evaluate(KE); await close_sheets(pg)
            await pg.evaluate("window.POLECAM_SITE = 'https://example.test/g/'"); await pg.click('#settingsBtn'); await W(pg, 400)
            await pg.click(share); await W(pg, 600)
            if await pg.is_visible('#pickMBox'): await pg.locator('#pickMList label.any input').check() if await pg.locator('#pickMList label.any').count() else None; await pg.click('#pickMYes')
            await pg.wait_for_selector('#qrShow:not([hidden])', timeout=10000); v2 = (await pg.evaluate("__polecam.lastQrLink || __polecam.lastQr")).split('&')[0]; await close_sheets(pg)
            check('2. after the update A saves version 2: the list carries the marker; A keeps the key', a2['ver'] == 2 and a2['apart'] and a2['kept'], a2)
            # E and F take version 2 from its link
            for x in (pgE, pgF):
                await close_sheets(x); await x.click('#settingsBtn'); await W(x, 400); await x.click('#teamUpdate'); await W(x, 500)
                await paste_join(x, v2, btn='#askBox button:has-text("Paste link")')
            e2 = await pgE.evaluate(KE); f2 = await pgF.evaluate(KE)
            await close_sheets(pgE); await pgE.click('#settingsBtn'); await W(pgE, 400); await pgE.click('#goAdmin'); await W(pgE, 600)
            unl = False; noKey = False
            if await pgE.is_visible('#admPin'):
                await pgE.fill('#admPin', '1234'); await pgE.click('#admUnlock'); await W(pgE, 1200)
                noKey = await pgE.is_visible('#askBox') and 'No admin key' in (await pgE.text_content('#askTitle'))
                unl = await pgE.is_hidden('#admLock')
            allerr = [e for e in errs + errsE + errsF if 'PAGEERROR' in e]
            check('3. E (admin company) on version 2 keeps the key it had: Manage unlocks with the PIN; F (vendor) no longer has it; no page errors',
                  e2['ver'] == 2 and e2['apart'] and e2['kept'] and unl and not noKey and f2['ver'] == 2 and not f2['kept'] and not allerr, (e2, unl, noKey, f2, allerr[:3]))
            for c in (ctx, ctxE, ctxF): await c.close()
    finally:
        srv.terminate()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
