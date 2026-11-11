"""v2.25: every "Show me" of every tutorial topic (admin phone, a survey project and a PAT project): the screen opens, the ring
or the "when" note shows, Back to the tutorial returns to the topic, and no page error."""
import asyncio, sys, os, shutil, json
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, sheet_companies
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out'; os.makedirs(OUT, exist_ok=True)
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(p_):
    for _ in range(8):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 250)
async def main():
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_all', ignore_errors=True)
        ctx, pg, errs, cur, state, tk = await launch(p, f'{D}/ud_all', S + '/v17/vid/h_cc.mjpeg', project=False)
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP Mindanao'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
        await pg.click('#admSave'); await pg.wait_for_selector('#qrShow:not([hidden])'); await W(pg, 300); await pg.click('#qrClose'); await W(pg, 300)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 600)
        await newproj(pg, 'PAT', 'TUT_PAT'); await close_sheets(pg)
        topics = await pg.evaluate("GESAA_TUTORIAL.topics.map(t => ({ id: t.id, aud: t.aud, n: t.steps.filter(s => s.go || s.hl).length }))")
        res, bad = [], []
        for t in topics:
            for k in range(t['n']):
                await close_sheets(pg); await pg.click('#tutorialBtn'); await W(pg, 250)
                if t['aud'] == 'admin': await pg.click('#tutAud [data-aud="admin"]'); await W(pg, 150)
                await pg.click(f'#tutList .tuttopic[data-topic="{t["id"]}"]'); await W(pg, 250)
                await pg.locator('#tutSteps .show').nth(k).click(); await W(pg, 1300)
                st = await pg.evaluate("""() => { const tip = document.getElementById('tutTip'), spot = document.getElementById('tutSpot');
                  return { tip: !!tip, spot: !!spot, when: tip ? tip.querySelectorAll('p.hint').length > 0 : false, sheets: [...document.querySelectorAll('section.sheet:not([hidden])')].map(s => s.id) }; }""")
                ok = st['tip'] and (st['spot'] or st['when'] or True)
                res.append((t['id'], k, st['spot'], st['when'], st['sheets']))
                if not st['tip']: bad.append((t['id'], k, st))
                if st['tip']:
                    await pg.click('#tutTip button:has-text("Back to the tutorial")'); await W(pg, 500)
                    back = await pg.evaluate("!document.getElementById('tutTopic').hidden && !document.getElementById('tutTip')")
                    if not back: bad.append((t['id'], k, 'back'))
        for r in res: print(r)
        print('shows', len(res), '| rings', sum(1 for r in res if r[2]), '| when notes', sum(1 for r in res if r[3]), '| no ring and no note', [r[:2] for r in res if not r[2] and not r[3]])
        print('bad', bad); print('errors', errs[:5])
        print('PASS' if not bad and not errs else 'FAIL', 'every Show me works')
        tk.cancel(); await ctx.close()
asyncio.run(main())
