"""v2.43.0 beta 3.3, QA-09 (synthetic data only): an accepted task on the field partner's phone, and a late update on the
coordinator's. Juan (coordinator) and Pedro (field partner) of DEMO CONTRACTOR, with the REAL sheet and mailbox scripts on their
stand-ins (e2e/servers.js). After Accept: a record opens with no Save, delete, a new pin and the route tools are refused with the
camera's message, and the record's saved time does not change; Export and Share stay. An update Pedro sent before he saw the
acceptance: Juan is asked; Cancel changes nothing and the update stays in the mailbox."""
import asyncio, sys, os, json, re, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v243/t2433c.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v243/out_c3'", "OUT = S + '/v243/out_qa09'")
exec(compile(src, 't2433c_head', 'exec'))
PROJ = 'DEMO SITE ACCEPTED'

async def main():
    open(OUT + '/asplan.kml', 'w').write(KML)
    srv = subprocess.Popen(['node', S + '/v243/e2e/servers.js'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT); time.sleep(1.5)
    try:
        async with async_playwright() as p:
            ca, A, ea = await new_ctx(p, OUT + '/ud_juan'); await setup(A, 'Juan Dela Cruz', JUAN)
            cb, B, eb = await new_ctx(p, OUT + '/ud_pedro'); await setup(B, 'Pedro Santos', PEDRO)
            await open_team(A); await confirm_email(A, JUAN); await role(A, 'Coordinator')
            await A.click('#tmMbxSetup'); await W(A, 500); await A.fill('#mbxUrl', MBX_URL); await A.click('#mbxSave'); await idle(A, 40000); await W(A, 400)
            await open_team(B); await confirm_email(B, PEDRO); await role(B, 'Field Partner')
            await B.locator('#tmCoList .tmrow', has_text='Juan Dela Cruz').locator('[data-join]').click(); await idle(B)
            await open_team(A); await A.locator('#tmMemList [data-accept]').first.click(); await idle(A); await W(A, 300)
            if await B.is_visible('#tmRefresh'): await B.click('#tmRefresh'); await idle(B)
            # the task, Pedro's 3 poles, update 1, merged and accepted
            await close_sheets(A); await A.click('#projectBtn'); await W(A, 300); await A.click('#newProjBtn'); await W(A, 300)
            await A.select_option('#npCat', 'survey'); await W(A, 200); await A.select_option('#npPurpose', 'As-plan'); await A.fill('#npName', PROJ); await A.set_input_files('#npKmzInput', OUT + '/asplan.kml'); await W(A, 300)
            await A.click('#npAssign .chip:has-text("Pedro Santos")'); await A.click('#npCreate'); await idle(A, 40000); await W(A, 500)
            await projects(B); await dl(B, ms=40000); await W(B, 400)
            await mbx(B, 'seed', PROJ, 3, {}); await send_sheet(B); await send_go(B, 40000); await W(B, 300)
            await projects(A); await dl(A, ms=40000); await W(A, 400)
            await A.click('#curTeam [data-ct="accept"]'); await answer(A, 'Accept'); await idle(A, 30000); await W(A, 400)
            check('C0 Juan merged update 1 (3 poles) and accepted', len(await mbx(A, 'recs', PROJ)) == 3 and 'Accepted on' in await txt(A, '#curTeam'), await txt(A, '#curTeam'))
            # ---------- a late update: Pedro has not opened the acceptance yet, adds a pole and sends
            await close_sheets(B); await mbx(B, 'seed', PROJ, 1, {}); await B.click('#projectBtn'); await W(B, 300); await send_sheet(B); sg = await send_go(B, 40000); await W(B, 300)
            check('L0 Pedro (before he sees the acceptance) sends update 2', 'Sent to Juan' in sg['line'], {k: v for k, v in sg.items() if k != 'seen'})
            recs0 = sorted((r['poleId'], r.get('updated', '')) for r in await mbx(A, 'recs', PROJ))
            await projects(A); ia = await inbox(A); files0 = sorted(e2e('/drive'))
            await A.locator('#mbxIn [data-mbxopen]').first.click(); t = await ask_text(A)
            check('L1 Juan is asked before it merges into the accepted project', 'is accepted' in t and 'Merge it into the accepted project anyway' in t and 'stays in the team mailbox' in t, t)
            await answer(A, 'Cancel'); await idle(A); await W(A, 300)
            recs1 = sorted((r['poleId'], r.get('updated', '')) for r in await mbx(A, 'recs', PROJ))
            check('L2 Cancel: the project is unchanged (3 records, the same saved times), still accepted', recs1 == recs0 and len(recs1) == 3 and 'Accepted on' in await txt(A, '#curTeam'), (recs0, recs1))
            await projects(A); ib1 = await inbox(A)
            check('L3 Cancel: the update is still in the mailbox (his inbox and the mailbox folder)', len(ib1) == 1 and 'Update 2 from Pedro Santos' in ib1[0] and sorted(e2e('/drive')) == files0, (ia, ib1))
            await A.locator('#mbxIn [data-mbxopen]').first.click(); await answer(A, 'Merge anyway'); await idle(A, 40000); await W(A, 600)
            check('L4 Merge anyway: the 4th pole merges', len(await mbx(A, 'recs', PROJ)) == 4, len(await mbx(A, 'recs', PROJ)))
            # ---------- Pedro opens the acceptance: his task is view only
            await projects(B); await open_in(B); await W(B, 400); ctB = await txt(B, '#curTeam')
            check('V0 Pedro\'s task: accepted by Juan', 'Accepted by Juan Dela Cruz' in ctB, ctB)
            await close_sheets(B)
            r0 = [r for r in await mbx(B, 'recs', PROJ)][0]
            rid = await B.evaluate("(pid) => (__polecam.points.find((x) => x.poleId === pid) || {}).id", r0['poleId'])
            await B.evaluate("(id) => __polecam.openEditorFor(id)", rid); await W(B, 900)
            ed = await B.evaluate("""() => ({ save: !!document.getElementById('edSave').offsetParent, done: !!document.getElementById('edDone').offsetParent, trash: !!document.getElementById('edTrash').offsetParent,
              note: document.getElementById('edLock').hidden ? '' : document.getElementById('edLock').textContent, id: document.getElementById('poleId').disabled })""")
            await B.screenshot(path=f'{OUT}/v_record.png')
            check('V1 a record opens view only: no Save, no delete bin, Close shown, the ID cannot be typed, and the note says why', not ed['save'] and not ed['trash'] and ed['done'] and ed['id'] and 'was accepted by Juan Dela Cruz' in ed['note'], ed)
            await B.evaluate("() => { const b = document.getElementById('edSave'); b.click(); }"); await W(B, 500)
            tst = await toast(B)
            check('V2 Save (even if forced) refuses with the camera\'s message', 'was accepted by Juan Dela Cruz' in tst, tst)
            await B.evaluate("() => document.getElementById('edTrash').click()"); await W(B, 400)
            check('V3 delete refused with the same message; the record is still there', 'was accepted by Juan Dela Cruz' in await toast(B) and not await B.is_visible('#askBox') and len(await mbx(B, 'recs', PROJ)) == 4, await toast(B))
            await B.click('#edDone'); await W(B, 400); await close_sheets(B)
            r1 = [r for r in await mbx(B, 'recs', PROJ) if r['poleId'] == r0['poleId']][0]
            check('V4 the record\'s saved time did not change', r1.get('updated') == r0.get('updated'), (r0.get('updated'), r1.get('updated')))
            await B.click('#routeBtn'); await W(B, 400)
            check('V5 the route tools are refused with the same message', 'was accepted by Juan Dela Cruz' in await toast(B) and not await B.evaluate("() => document.getElementById('routeBtn').getAttribute('aria-pressed') === 'true'"), await toast(B))
            await B.click('#pinAddBtn'); await W(B, 400)
            check('V6 adding a pin is refused with the same message', 'was accepted by Juan Dela Cruz' in await toast(B) and not await B.is_visible('#askBox'), await toast(B))
            await B.click('#captureBtn'); await W(B, 400)
            check('V7 the camera is refused as before', 'was accepted by Juan Dela Cruz' in await toast(B) and await B.is_hidden('#camera'), await toast(B))
            await B.click('#projectBtn'); await W(B, 400); tools = await B.eval_on_selector_all('#curTools .tmtool', "(d) => d.map((x) => x.dataset.tool)")
            await close_sheets(B); await B.click('#exportBtn'); await W(B, 500); exp = await B.is_visible('#exportTitle')
            check('V8 Share and Export stay available', 'share' in tools and exp, (tools, exp))
            await close_sheets(B)
            check('Z1 no page errors', not (ea + eb), ea + eb)
            for c in (ca, cb): await c.close()
    finally:
        srv.terminate()
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed' + (f': {bad}' if bad else ''))
asyncio.run(main())
