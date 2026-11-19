"""v2.25: every "Show me" of every tutorial topic (admin phone, a survey project and a PAT project): the screen opens, the ring
or the "when" note shows, Back to the tutorial returns to the topic, and no page error.
beta 6.7 (UX step 2; critic: every step passed, whatever it showed): a step lands only when its ring shows, or its own "when"
note (not any hint of the tip), or, for a step with a screen and no control, when that screen is on top. The walk runs in an
As-Plan survey (every topic, the admin guide too) and again in a PAT (the user guide)."""
import asyncio, sys, os, shutil, json
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, openproj, sheet_companies
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
        await newproj(pg, 'survey', 'TUT_PLAN', purpose='As-plan'); await close_sheets(pg)  # beta 6.7: the survey first, then the PAT
        topics = await pg.evaluate("GESAA_TUTORIAL.topics.map(t => ({ id: t.id, aud: t.aud, steps: t.steps.filter(s => s.go || s.hl).map(s => ({ go: s.go || '', hl: s.hl || '' })) }))")
        # the screen (sheet id) each go opens: '' = the map (no sheet); planstyle/planset: Plan settings or Drawing style
        SCREEN = {'map': '', 'projects': 'projects', 'newProject': 'newProj', 'projectDetails': 'projects', 'records': 'list', 'export': 'export', 'settings': 'settings', 'profile': 'profile',
                  'camera': 'setCamera', 'exports': 'setExports', 'maps': 'offline', 'storage': 'setStorage', 'log': 'logSheet', 'admin': 'admin', 'team': 'teamSheet', 'mbxset': 'mbxSetSheet'}
        res, bad = [], []
        walks = [(pt, t) for pt in ('TUT_PLAN', 'TUT_PAT') for t in topics if pt == 'TUT_PLAN' or t['aud'] == 'user']
        cur_proj = 'TUT_PLAN'
        for pt, t in walks:
            if pt != cur_proj: await close_sheets(pg); await openproj(pg, pt); await close_sheets(pg); cur_proj = pt
            for k, step in enumerate(t['steps']):
                await close_sheets(pg); await pg.click('#tutorialBtn'); await W(pg, 250)
                if t['aud'] == 'admin': await pg.click('#tutAud [data-aud="admin"]'); await W(pg, 150)
                elif await pg.is_visible('#tutAud [data-aud="user"]'): await pg.click('#tutAud [data-aud="user"]'); await W(pg, 150)  # beta 6.7: the PAT walk comes after the admin guide
                await pg.click(f'#tutList .tuttopic[data-topic="{t["id"]}"]'); await W(pg, 250)
                await pg.locator('#tutSteps .show').nth(k).click(); await W(pg, 1300)
                st = await pg.evaluate("""() => { const tip = document.getElementById('tutTip'), spot = document.getElementById('tutSpot'), w = tip && tip.querySelector('p.tutwhen');
                  const sh = [...document.querySelectorAll('section.sheet:not([hidden])')].sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0)).map(s => s.id);
                  return { tip: !!tip, spot: !!spot && spot.style.display !== 'none', when: !!w && !w.hidden, sheets: sh, top: sh.length ? sh[sh.length - 1] : '' }; }""")
                g = step['go'].split(':')[0]
                on_go = st['top'] in ('planSet', 'drwStyle') if g in ('planstyle', 'planset') else st['top'] == SCREEN.get(g, '?')
                ok = st['tip'] and ((st['spot'] or st['when']) if step['hl'] else on_go)
                res.append((t['id'], k, st['spot'], st['when'], st['sheets'], pt))
                if not ok: bad.append((t['id'], k, pt, step, st))
                if st['tip']:
                    await pg.click('#tutTip button:has-text("Back to the tutorial")'); await W(pg, 500)
                    back = await pg.evaluate("!document.getElementById('tutTopic').hidden && !document.getElementById('tutTip')")
                    if not back: bad.append((t['id'], k, pt, 'back'))
        for r in res: print(r)
        print('shows', len(res), '| rings', sum(1 for r in res if r[2]), '| when notes', sum(1 for r in res if r[3]), '| screen only (no control to ring)', [r[:2] for r in res if not r[2] and not r[3]])
        print('bad', bad); print('errors', errs[:5])
        print('PASS' if not bad and not errs else 'FAIL', 'every Show me works')
        tk.cancel(); await ctx.close()
asyncio.run(main())
