"""(v2.43.0 beta 3.2 copy: 17 admin topics, with Switch Team on for a company.) v2.35.1: the admin guide covers every admin setting and how to remove it: the Google Drive API key step by step (with this
website's address filled in), a 'To remove' step in each admin topic, and one topic with every removal; search finds them."""
import asyncio, sys, os, shutil
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, sheet_companies
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_d'; os.makedirs(OUT, exist_ok=True)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:700])
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(p_):
    for _ in range(8):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 250)
async def open_tut(pg, admin=True):
    await close_sheets(pg); await pg.click('#tutorialBtn'); await W(pg, 300)
    if admin: await pg.click('#tutAud [data-aud="admin"]'); await W(pg, 200)
async def main():
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_d', ignore_errors=True)
        ctx, pg, errs, cur, state, tk = await launch(p, f'{D}/ud_d', S + '/v17/vid/h_cc.mjpeg', project=False)
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
        await pg.click('#admSave'); await pg.wait_for_selector('#qrShow:not([hidden])'); await W(pg, 300); await pg.click('#qrClose'); await W(pg, 300)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 600); await close_sheets(pg)
        # 1. the admin guide lists every admin topic, with the two new ones
        await open_tut(pg)
        ids = await pg.evaluate("[...document.querySelectorAll('#tutList .tuttopic')].map((b) => b.dataset.topic)")
        T = await pg.evaluate("GESAA_TUTORIAL.topics.filter((t) => t.aud === 'admin').map((t) => ({ id: t.id, rm: t.steps.some((s) => /\\*\\*To (remove|cancel|untie|change|go back)/.test(s.t)) }))")
        need_rm = [t['id'] for t in T if t['id'] not in ('adm-inspect', 'adm-approve', 'adm-remove') and not t['rm']]
        check('the admin guide lists 17 topics (v2.43: Stable and beta; beta 3.2: Switch Team on for a company), the Google Drive API key and "Remove or undo admin settings" among them; every setting topic says how to remove or undo it',
              len(ids) == 17 and 'adm-beta' in ids and 'adm-team' in ids and 'adm-drivekey' in ids and ids[-1] == 'adm-remove' and not need_rm, (ids, need_rm))
        # 2. the API key topic: the website address for the Google Cloud restriction filled in (the site part, then /*)
        await pg.evaluate("window.POLECAM_SITE = 'https://marktamsedesign-oss.github.io/polecam/'")
        await pg.click('#tutList .tuttopic[data-topic="adm-drivekey"]'); await W(pg, 300)
        steps = await pg.evaluate("[...document.querySelectorAll('#tutSteps li > div')].map((d) => ({ t: d.textContent, b: [...d.querySelectorAll('b')].map((x) => x.textContent), i: [...d.querySelectorAll('i')].map((x) => x.textContent) }))")
        await pg.screenshot(path=f'{OUT}/d1_drivekey.png', full_page=False)
        site = next((s for s in steps if 'Application restrictions' in s['t']), None)
        check('Google Drive API key topic: 12 steps from Google Cloud to removal; the Websites entry is this site\'s address ending in /* (bold), never …/polecam/*, with no stray markup',
              len(steps) == 12 and site and 'https://marktamsedesign-oss.github.io/*' in site['b'] and '{site}' not in site['t'] and '**' not in ''.join(s['t'] for s in steps)
              and not any('polecam' in x for x in site['i']) and 'site part only' in site['t'] and 'Google Drive API' in ''.join(steps[3]['b']) and 'Delete' in ''.join(steps[-1]['b']), (len(steps), site))
        # the tour tip shows the same address
        await pg.locator('#tutSteps .show').first.click(); await W(pg, 1200)
        await pg.click('#tutTip button:has-text("Back to the tutorial")'); await W(pg, 400)
        # 3. a phone that does not know its website: a placeholder, not a wrong address
        await pg.evaluate("window.POLECAM_SITE = ''")
        await open_tut(pg); await pg.click('#tutList .tuttopic[data-topic="adm-drivekey"]'); await W(pg, 300)
        t3 = await pg.evaluate("[...document.querySelectorAll('#tutSteps li > div')].map((d) => d.textContent).find((x) => x.includes('Application restrictions'))")
        check('a phone that does not know its website shows a placeholder for the address', 'https://<your website>/*' in t3, t3)
        # 4. search finds the removal topic and the key topic
        await open_tut(pg)
        await pg.fill('#tutQ', 'remove'); await pg.dispatch_event('#tutQ', 'input'); await W(pg, 300)
        r4 = await pg.evaluate("[...document.querySelectorAll('#tutList .tuttopic')].map((b) => b.dataset.topic)")
        await pg.fill('#tutQ', 'api key'); await pg.dispatch_event('#tutQ', 'input'); await W(pg, 300)
        r5 = await pg.evaluate("[...document.querySelectorAll('#tutList .tuttopic')].map((b) => b.dataset.topic)")
        check('search "remove" lists "Remove or undo admin settings" first (and the topics with a removal step); "api key" finds the key topic',
              r4 and r4[0] == 'adm-remove' and len(r4) >= 10 and r5 and r5[0] == 'adm-drivekey', (r4, r5))
        # 5. the all-in-one removal topic: one step per setting, ending with Save
        await pg.fill('#tutQ', ''); await pg.dispatch_event('#tutQ', 'input'); await W(pg, 200)
        await open_tut(pg); await pg.click('#tutList .tuttopic[data-topic="adm-remove"]'); await W(pg, 300)
        rm = await pg.evaluate("[...document.querySelectorAll('#tutSteps li > div')].map((d) => d.textContent)")
        await pg.screenshot(path=f'{OUT}/d2_remove.png', full_page=False)
        keys = ['List name', 'A company', 'Admin company', 'An admin user', 'admin PIN', 'invites', 'A logo', 'Form wording', 'Checklist', 'Field standards', 'Who records', 'KMZ lock', 'map pack', 'Area download source', 'Google Drive API key', 'Drawing template', 'Online sheet', 'org.json']
        miss = [k for k in keys if not any(k in x for x in rm)]
        check('"Remove or undo admin settings": every admin setting has its removal step, ending with Save and share the list', not miss and 'Save and share the list' in rm[-1], (len(rm), miss))
        bad = [e for e in errs if 'PAGEERROR' in e]
        check('no page errors', not bad, bad[:5])
        tk.cancel(); await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
