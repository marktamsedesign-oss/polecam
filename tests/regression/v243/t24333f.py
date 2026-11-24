"""beta 7.9 (synthetic data only): the Team mailbox's Check brings an update in by itself, as Sync does. Before, Check showed its busy
screen and the bring-in read that screen as "a record was open", so it said "1 update at the next Sync (a record was open)" and
merged nothing. Juan (coordinator) gives a project to Pedro; Pedro sends 2 poles and a span; Juan opens Projects and
taps Check in Projects' Team mailbox box: the update comes in, nothing waits, and the line never says a record was open. Real sheet and mailbox scripts on their
stand-ins (e2e/servers.js), as the other team tests."""
import asyncio, sys, os, json, re, time, subprocess
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/none'
src = open(S + '/v243/t2433c.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v243/out_c3'", "OUT = S + '/v243/out_qa_chk'")
exec(compile(src, 't2433c_head', 'exec'))
P1 = 'DEMO SITE CHECK'

async def make_task(A, name, who):
    await close_sheets(A); await A.click('#projectBtn'); await W(A, 300); await A.click('#newProjBtn'); await W(A, 300)
    await A.select_option('#npCat', 'survey'); await W(A, 200); await A.select_option('#npPurpose', 'As-plan'); await A.fill('#npName', name); await A.set_input_files('#npKmzInput', OUT + '/asplan.kml'); await W(A, 300)
    for w in who: await A.click(f'#npAssign .chip:has-text("{w}")')
    await A.click('#npCreate'); await idle(A, 40000); await W(A, 500)
async def get_task(pg):
    await mbx(pg, 'noAuto', True)  # (the task by the manual Download and merge, as the other team tests)
    try: await projects(pg); j, _ = await dl(pg, ms=40000); await W(pg, 300); return j
    finally: await mbx(pg, 'noAuto', False)
async def recs(pg, name): return sorted(r['poleId'] for r in await mbx(pg, 'recs', name))
async def send_up(pg, ms=60000):
    await close_sheets(pg); await pg.click('#projectBtn'); await W(pg, 300); await send_sheet(pg); st = await send_go(pg, ms); await W(pg, 300); return st

async def main():
    open(OUT + '/asplan.kml', 'w').write(KML)
    srv = subprocess.Popen(['node', S + '/v243/e2e/servers.js'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT); time.sleep(1.5)
    try:
        async with async_playwright() as p:
            ca, A, ea = await new_ctx(p, OUT + '/ud_juan', 1100); await setup(A, 'Juan Dela Cruz', JUAN)
            cb, B, eb = await new_ctx(p, OUT + '/ud_pedro'); await setup(B, 'Pedro Santos', PEDRO)
            await open_team(A); await confirm_email(A, JUAN); await role(A, 'Coordinator')
            await open_mbx(A); await A.click('#tmMbxSetup'); await W(A, 500); await A.fill('#mbxUrl', MBX_URL); await A.click('#mbxSave'); await idle(A, 40000); await W(A, 400)
            await open_team(B); await confirm_email(B, PEDRO); await role(B, 'Field Partner')
            await B.locator('#tmCoList .tmrow', has_text='Juan Dela Cruz').locator('[data-join]').click(); await idle(B)
            await open_team(A)
            if await A.locator('#tmMemList [data-accept]').count(): await A.locator('#tmMemList [data-accept]').first.click(); await idle(A); await W(A, 300)
            if await B.is_visible('#tmRefresh'): await B.click('#tmRefresh'); await idle(B)
            await make_task(A, P1, ['Pedro Santos']); await get_task(B)
            await mbx(B, 'seed', P1, 2, {'from': 40}); await mbx(B, 'link', P1, [['CC-1041', 'CC-1042']]); sb = await send_up(B)
            check('T0 Pedro surveys 2 poles, links a span and sends them to Juan', 'Sent to Juan' in sb['line'], sb['line'])
            # Projects checks the mailbox by itself when the last check is over a minute old (and that one did bring in): a fresh
            # listing first (it brings nothing in), so the update is still waiting when Check is tapped
            n0 = len(await recs(A, P1)); await mbx(A, 'refresh'); await projects(A, check_mail=False)
            await A.evaluate("() => { window.__toasts = []; const t = document.getElementById('toast'); new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true }); }")
            await A.click('#mbxCheckIn'); await idle(A, 40000); await W(A, 1200)
            said = ' | '.join(await A.evaluate('window.__toasts')); n1 = len(await recs(A, P1)); left = [r for r in await inbox(A) if 'Pedro' in r]
            check('T1 Check in the Team mailbox brings Pedro\'s update in by itself: 2 more records on Juan\'s phone', n1 == n0 + 2, (n0, n1, said))
            check('T2 it says it was brought in, never "at the next Sync (a record was open)"', 'brought in' in said and 'record was open' not in said, said)
            check('T3 nothing from Pedro waits in the mailbox after the Check', not left, left)
            check('Z1 no page errors', not (ea + eb), ea + eb)
            for c in (ca, cb): await c.close()
    finally:
        srv.terminate()
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed' + (f': {bad}' if bad else ''))
asyncio.run(main())
