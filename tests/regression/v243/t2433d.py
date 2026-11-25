"""v2.43.0 beta 3 (synthetic data only): fixes per pole and what changed, end to end on two phones of DEMO CONTRACTOR:
Juan (coordinator) and Pedro (field partner), with the REAL sheet and mailbox scripts on their stand-ins (e2e/servers.js).
The app's checks, several poles at once, a spot, the fix list through the mailbox, Pedro's items ticked by the record itself,
can't fix, found something else, send what's done so far, what changed (before → after), OK / Not yet, round 2, Accept."""
import asyncio, sys, os, json, re, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v243/t2433c.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v243/out_c3'", "OUT = S + '/v243/out_d3'")  # beta 3.2: t2433c's header (Team on from the sheet)
exec(compile(src, 't2433c_head', 'exec'))
PROJ = 'DEMO SITE FIXES'
FX = "(a) => __polecam.team.mbx.fx[a[0]](...a.slice(1))"
async def fx(pg, fn, *a): return await pg.evaluate(FX, [fn, *a])
async def body(pg): return await txt(pg, '#fxBody')
async def fxclick(pg, k, extra=''): await pg.click(f'#fxBody [data-fx="{k}"]{extra}'); await W(pg, 250)
async def setrec(pg, pid, patch): return await fx(pg, 'setRec', PROJ, pid, patch)
ITEMS_JS = "(d) => d.map((x) => [x.querySelector('b').textContent, x.classList.contains('ok')])"  # beta 7.8: a fix's items on the field partner's card: what to do, ticked
async def check_in(pg, ms=30000):
    """beta 7.8: Projects → Team mailbox → Check. Since the 12 Nov 2026 upload it brings in what is for a project on this phone (a fix
    list here), as Sync does, and sends nothing. Waits for what it says (Team mailbox: …); returns it."""
    t0 = await toast(pg); await close_sheets(pg); await pg.click('#projectBtn'); await W(pg, 400); await pg.click('#mbxCheckIn'); t = time.time()
    while time.time() - t < ms / 1000:
        tt = await toast(pg)
        if tt != t0 and tt.startswith('Team mailbox:'): break
        await W(pg, 150)
    await idle(pg); await W(pg, 300); return await toast(pg)

async def main():
    srv = subprocess.Popen(['node', S + '/v243/e2e/servers.js'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT); time.sleep(1.5)
    try:
        async with async_playwright() as p:
            ca, A, ea = await new_ctx(p, OUT + '/ud_juan'); await setup(A, 'Juan Dela Cruz', JUAN)
            cb, B, eb = await new_ctx(p, OUT + '/ud_pedro'); await setup(B, 'Pedro Santos', PEDRO)
            await open_team(A); await confirm_email(A, JUAN); await role(A, 'Coordinator')
            await open_mbx(A); await A.click('#tmMbxSetup'); await W(A, 500); await A.fill('#mbxUrl', MBX_URL); await A.click('#mbxSave'); await idle(A, 40000); await W(A, 400)
            await open_team(B); await confirm_email(B, PEDRO); await role(B, 'Field Partner')
            await B.locator('#tmCoList .tmrow', has_text='Juan Dela Cruz').locator('[data-join]').click(); await idle(B)
            await open_team(A); await A.locator('#tmMemList [data-accept]').first.click(); await idle(A); await W(A, 300)
            if await B.is_visible('#tmRefresh'): await B.click('#tmRefresh'); await idle(B)
            # ---------- the task, Pedro's first survey (6 poles; owners on 3, clamps on 2), update 1
            await close_sheets(A); await A.click('#projectBtn'); await W(A, 300); await A.click('#newProjBtn'); await W(A, 300)
            await A.select_option('#npCat', 'survey'); await W(A, 200); await A.select_option('#npPurpose', 'As-plan'); await A.fill('#npName', PROJ)
            await A.click('#npAssign .chip:has-text("Pedro Santos")'); await W(A, 200); await A.click('#npCreate'); await idle(A, 40000); await W(A, 500)
            await projects(B); j, stg = await dl(B, ms=40000)
            await mbx(B, 'seed', PROJ, 6, {})
            for pid, patch in (('CC-1001', {'boq': {'owner': 'Globe', 'clamp': '8-10 in'}}), ('CC-1002', {'boq': {'owner': 'Globe', 'clamp': '6-8 in'}}), ('CC-1003', {'boq': {'owner': 'PLDT'}})):
                await setrec(B, pid, patch)
            await send_sheet(B); sg = await send_go(B, 40000)
            # (beta 7.8: since the 12 Nov 2026 upload (beta 3.4) Sync brings the update in and merges it by itself; the card says Merged by
            # Sync, with What changed, where a download's result said it in place)
            tA, _ = await sync_now(A); await A.click('#projectBtn'); await W(A, 400)
            chg = await fx(A, 'chg', PROJ); ct = await txt(A, '#curTeam')
            check('W1 every merged update says what changed: update 1 from Pedro, 6 new poles, with What changed on the card (Merged by Sync)', f'brought in: update 1 of “{PROJ}” from Pedro' in tA and chg and len(chg['items']) == 6 and all(x['kind'] == 'new' for x in chg['items']) and 'Merged by Sync' in ct and await A.is_visible('#curTeam .ctsync [data-ct="chg"]'), (tA, chg and len(chg['items']), ct))
            await A.click('#curTeam .ctsync [data-ct="chg"]'); await W(A, 500)
            ct = await txt(A, '#chgList'); sub = await txt(A, '#chgSub')
            check('W2 What changed lists them (New), from Pedro, update 1', await A.is_visible('#chgSheet') and ct.count('New') == 6 and 'Update 1 from Pedro Santos' in sub, (sub, ct[:200]))
            await close_sheets(A)
            # ---------- Juan writes the fix list
            await A.click('#projectBtn'); await W(A, 400); await A.click('#curTeam [data-ct="fix"]'); await W(A, 800)
            st = await fx(A, 'state'); ck = await fx(A, 'checks', PROJ)
            # (beta 7.8: the fix list's title says who it is for and the project since the 12 Nov 2026 upload (it said Ask for fixes · project))
            check('F1 Ask for fixes opens the fix list over the map, for Juan’s project (Fixes for Pedro · DEMO SITE FIXES)', st and st['mode'] == 'co' and st['shown'] and await A.is_visible('#fixPanel') and await txt(A, '#fxTitle') == f'Fixes for Pedro · {PROJ}', (st, await txt(A, '#fxTitle')))
            # (beta 7.8: the Checks button of the 10 Nov 2026 upload went in the 12 Nov one: the app's checks are offered at once, one chip each under
            # THE APP FOUND · TAP TO ADD; a tap adds that check's poles, with Undo. Select several went too: a tap on a pole ticks it)
            sug = await A.eval_on_selector_all('#fxBody .fx-sugchip', "(d) => d.map((x) => x.textContent)")
            check('F2 the app’s own checks, offered on the fix list (The app found · tap to add): 3 poles with no owner, 4 with no clamp size', {(c['label'], c['n']) for c in ck} >= {('No owner', 3), ('No clamp size', 4)} and '+ 3 with no owner' in sug and '+ 4 with no clamp size' in sug and 'THE APP FOUND' in (await body(A)).upper(), (ck, sug))
            await A.locator('#fxBody .fx-sugchip', has_text='with no owner').click(); await W(A, 300)
            d = await fx(A, 'draft', PROJ); sug2 = await A.eval_on_selector_all('#fxBody .fx-sugchip', "(d) => d.map((x) => x.textContent)"); bd = await body(A)
            check('F3 tapped “No owner” only: CC-1004, CC-1005, CC-1006 added with Owner (with Undo); No clamp size still offered', sorted(x['name'] for x in d) == ['CC-1004', 'CC-1005', 'CC-1006'] and all(x['why'] == ['Owner'] for x in d) and sug2 == ['+ 4 with no clamp size'] and 'Undo' in bd, (sug, sug2, d, bd[:300]))
            for pid in ('CC-1001', 'CC-1002'): await fx(A, 'tap', pid); await W(A, 150)
            st = await fx(A, 'state')
            check('F4 several poles at once: a tap on each ticks it (two poles ticked)', len(st['sel']) == 2 and '2 poles ticked' in await body(A), (st, await body(A)))
            await fxclick(A, 'add', '[data-w="New photo"]')
            await A.screenshot(path=f'{OUT}/j_multi_tiles.png')
            await fx(A, 'tap', 'CC-1003'); await W(A, 300)
            await fxclick(A, 'add', '[data-w="Delete it"]')
            await A.locator('#fxBody .fx-lbtn', has_text='Pole CC-1003').click(); await W(A, 300)  # its note: the fix on the list, then Save
            await A.fill('#fxItemNote', 'Not a pole: a lamp post'); await fxclick(A, 'save')
            await A.locator('#fxBody .fx-lbtn', has_text='Pole CC-1004').click(); await W(A, 300)  # a pole already on the list: its fix opens
            pressed = await A.eval_on_selector_all('#fxBody .fx-tile[aria-pressed="true"]', "(d) => d.map((x) => x.dataset.w)")
            await A.click('#fxBody .fx-tile[data-w="Pin location"]'); await fxclick(A, 'save')
            await fx(A, 'spot', 7.0900, 125.6200); await W(A, 300)  # (a missing pole at the spot, added at once)
            await A.locator('#fxBody .fx-lbtn', has_text='A spot on the map').click(); await W(A, 300)
            spot_tiles = await A.eval_on_selector_all('#fxBody .fx-tile', "(d) => d.map((x) => x.dataset.w)")
            spot_on = await A.eval_on_selector_all('#fxBody .fx-tile[aria-pressed="true"]', "(d) => d.map((x) => x.dataset.w)")
            await fxclick(A, 'cancel')
            d = await fx(A, 'draft', PROJ); pins = await fx(A, 'pins')
            by = {x['name'] or 'spot': x['why'] for x in d}
            check('F5 one fix per pole: 1001 and 1002 New photo, 1003 Delete it (with its note), 1004 Owner + Pin location, and a spot: Missing pole (7, each with a pin)',
                  len(d) == 7 and by.get('CC-1001') == ['New photo'] and by.get('CC-1002') == ['New photo'] and by.get('CC-1003') == ['Delete it'] and [x['note'] for x in d if x['name'] == 'CC-1003'] == ['Not a pole: a lamp post'] and by.get('CC-1004') == ['Owner', 'Pin location'] and by.get('spot') == ['Missing pole'] and pressed == ['Owner'] and spot_tiles == ['Missing pole', 'Check here', 'Other'] and spot_on == ['Missing pole'] and pins == 7, (d, pressed, spot_tiles, spot_on, pins))
            await A.screenshot(path=f'{OUT}/j_fixlist.png')
            check('F6 the panel fits the phone: no sideways scroll', await A.evaluate("() => document.documentElement.scrollWidth - innerWidth") <= 0)
            await fxclick(A, 'send'); await idle(A, 40000); await W(A, 500)
            out = await fx(A, 'out', PROJ); tA = await toast(A)
            check('F7 sent: 7 fixes to Pedro (round 1), each with the pole as it was', out and out['round'] == 1 and len(out['items']) == 7 and all(x['status'] == 'out' for x in out['items']) and sum(1 for x in out['items'] if x.get('before')) == 6 and '7 fixes sent to Pedro' in tA and not await A.is_visible('#fixPanel'), (tA, out and out['round']))
            # ---------- Pedro works through it
            # (beta 7.8: since the 12 Nov 2026 upload (beta 3.4) Pedro's Sync brings the fix list in by itself; "Open the fix list" on his
            # card opens it, where it waited in the Team mailbox with Open)
            tb, _ = await sync_now(B)
            check('P1 Pedro: the fixes asked by Juan come with his Sync (7 fixes from Juan for “DEMO SITE FIXES”)', f'brought in: 7 fixes from Juan for “{PROJ}”' in tb, tb)
            await B.click('#projectBtn'); await W(B, 400); await B.click('#curTeam [data-ct="fxopen"]'); await idle(B, 30000); await W(B, 900)
            st = await fx(B, 'state'); L = await fx(B, 'list', PROJ); bt = await body(B); its = await B.eval_on_selector_all('#fxBody .fx-item', ITEMS_JS)
            await B.screenshot(path=f'{OUT}/p_fix1.png')
            # (beta 7.8: ✓ Done is always on since the 12 Nov 2026 upload: while the record does not show an item yet, Done asks once,
            # where ✓ Fixed it stayed off; each item ticks itself when the record shows it)
            await fxclick(B, 'done'); ask0 = await txt(B, '#fxBody .fx-ask') if await B.locator('#fxBody .fx-ask').count() else ''
            check('P2 the fix list opens over the map: 7 numbered pins, fix 1 is CC-1004 (Owner, Pin location), neither on the record yet: ✓ Done asks first',
                  st and st['mode'] == 'fp' and len(L['items']) == 7 and await fx(B, 'pins') == 7 and '1 of 7' in bt and 'Pole CC-1004' in bt and its == [['Set the owner', False], ['Move the pin onto the pole', False]] and 'The owner is not set yet' in ask0 and 'Done anyway' in ask0, (st, bt[:300], its, ask0))
            await setrec(B, 'CC-1004', {'boq': {'owner': 'PLDT'}}); await W(B, 400)
            half = await B.eval_on_selector_all('#fxBody .fx-item', ITEMS_JS); bt = await body(B)
            await B.evaluate("""async (n) => { await __polecam.team.mbx.fx.setRec(n, 'CC-1004', { lat: 7.07 + 3 * 0.0004 + 0.00005, lon: 125.6 + 3 * 0.0004 + 0.00003 }); }""", PROJ); await W(B, 400)
            done1 = await B.eval_on_selector_all('#fxBody .fx-item', ITEMS_JS); ask1 = await B.locator('#fxBody .fx-ask').count()
            check('P3 the items tick themselves: Set the owner ✓ PLDT after the owner is set (the pin not yet), then the pin ✓ after it moved: ✓ Done without asking',
                  half == [['Set the owner', True], ['Move the pin onto the pole', False]] and '✓ PLDT' in bt and done1 == [['Set the owner', True], ['Move the pin onto the pole', True]] and not ask1 and await B.is_visible('#fxBody [data-fx="done"]'), (half, done1, ask1, bt[:300]))
            await fxclick(B, 'done')
            bt = await body(B)
            check('P4 next: fix 2, CC-1005 (Owner)', 'Pole CC-1005' in bt, bt[:200])
            # (beta 7.8: Can't do takes a reason to tap and a few words since the 12 Nov 2026 upload)
            await fxclick(B, 'cant'); await fxclick(B, 'cantwhy', '[data-r="No tag on the pole"]'); await B.fill('#fxCantWords', 'owner unknown'); await fxclick(B, 'cantsave')
            await setrec(B, 'CC-1006', {'boq': {'owner': 'Globe'}}); await W(B, 300); await fxclick(B, 'done')
            bt = await body(B); its = await B.eval_on_selector_all('#fxBody .fx-item', ITEMS_JS)
            check('P5 can’t do with a reason (No tag on the pole: owner unknown); CC-1006 done; the next is CC-1001 (Take a new photo, not on the record yet); the answers go to Juan with Sync',
                  'Pole CC-1001' in bt and its == [['Take a new photo', False]] and 'Your answers go to Juan when you Sync' in bt and [x['reply'] for x in (await fx(B, 'list', PROJ))['items'] if x['name'] == 'CC-1005'] == ['No tag on the pole: owner unknown'], bt[:400])
            await B.screenshot(path=f'{OUT}/p_fix4.png')
            # (beta 7.8: the fix list's own Send went in the 12 Nov 2026 upload: what is done goes with Sync, or with Send to coordinator)
            await close_sheets(B); await B.click('#projectBtn'); await W(B, 400); await send_sheet(B)
            what = await B.eval_on_selector_all('#mbxWhat label', "(d) => d.map((x) => [x.textContent, x.querySelector('input').checked])")
            check('P6 Send the done so far (Send to coordinator): the Send screen, Only the changes with 3 fix answers', what and what[0][1] and '3 fix answers' in what[0][0], what)
            sg = await send_go(B, 40000)
            L = await fx(B, 'list', PROJ)
            check('P7 sent: those 3 are marked sent; 4 still to do', sg.get('done') and sum(1 for x in L['items'] if x.get('sent')) == 3 and sum(1 for x in L['items'] if x['status'] == 'open') == 4, (sg.get('line'), [(x['name'], x['status'], x.get('sent')) for x in L['items']]))
            # ---------- Juan: what changed, and each answer (beta 7.8: his Sync brings update 2 in, with the answers)
            tA, _ = await sync_now(A); await A.click('#projectBtn'); await W(A, 400)
            out = await fx(A, 'out', PROJ); chg = await fx(A, 'chg', PROJ)
            ct = await txt(A, '#curTeam')
            ch4 = [x for x in chg['items'] if x['name'] == 'CC-1004']
            check('J1 update 2 merged (Juan\'s Sync brings it in): 3 fix answers to check; What changed has CC-1004: Owner empty → PLDT and the pin moved',
                  f'brought in: update 2 of “{PROJ}” from Pedro (3 fix answers)' in tA and ch4 and any(l['label'] == 'Owner' and l['from'] == 'empty' and l['to'] == 'PLDT' for l in ch4[0]['lines']) and any(l['label'] == 'Pin' for l in ch4[0]['lines']) and '3 to check' in ct, (tA, ch4, ct[:300]))
            await A.locator('#wfBox').screenshot(path=f'{OUT}/j_review1.png')
            rows = await A.eval_on_selector_all('#curTeam .fx-rv', "(d) => d.map((x) => x.textContent)")
            r4 = [r for r in rows if 'CC-1004' in r]; r5 = [r for r in rows if 'CC-1005' in r]
            check('J2 each answer shows what changed: CC-1004 Owner empty → PLDT and Pin moved; CC-1005 “No tag on the pole: owner unknown”; the rest with Pedro',
                  r4 and 'PLDT' in r4[0] and 'moved' in r4[0] and r5 and 'No tag on the pole: owner unknown' in r5[0] and sum(1 for r in rows if 'With the field partner' in r) == 4, rows)
            acc = await A.evaluate(ACC_JS)
            check('J3 Accept is off: answers to check first', acc is True and 'not OK yet' in ct, (acc, ct[-200:]))
            await A.click('#curTeam .fx-rv:has-text("CC-1004") [data-fxr="show"]'); await W(A, 900)
            shown = await A.evaluate("() => ({ chip: !document.getElementById('hlChip').hidden, proj: !document.getElementById('projects').hidden })")
            check('J4 Show on the map: the pole is ringed on the map (with where it was)', shown['chip'] and not shown['proj'], shown)
            await A.screenshot(path=f'{OUT}/j_show.png')
            await A.click('#projectBtn'); await W(A, 400)
            for pid, v in (('CC-1004', 'ok'), ('CC-1005', 'ok'), ('CC-1006', 'again')):
                await A.click(f'#curTeam .fx-rv:has-text("{pid}") [data-fxr="{v}"]'); await W(A, 300)
            await A.fill('#fxAgainNote', 'The owner is Converge'); await A.click('#curTeam [data-fxr="sendagain"]'); await idle(A, 30000); await W(A, 500)
            out = await fx(A, 'out', PROJ); i6 = [x for x in out['items'] if x['name'] == 'CC-1006'][0]
            check('J5 OK, OK, Not yet: CC-1006 goes back as round 2 with Juan’s note', out['round'] == 2 and i6['status'] == 'out' and i6['round'] == 2 and 'Converge' in i6.get('againMsg', ''), (out['round'], i6))
            # ---------- Pedro: the rest, something found, round 2
            await close_sheets(B); await B.click('#projectBtn'); await W(B, 300); await B.click('#curTeam [data-ct="fxopen"]'); await W(B, 700)
            await setrec(B, 'CC-1001', {'takenAt': '2026-11-10T08:00:00.000Z'}); await W(B, 300)
            bt = await body(B); await fxclick(B, 'done')
            await setrec(B, 'CC-1002', {'takenAt': '2026-11-10T08:05:00.000Z'}); await W(B, 300); await fxclick(B, 'done')
            await mbx(B, 'del', PROJ, 'CC-1003'); await W(B, 400)
            bt3 = await body(B); await fxclick(B, 'done')
            await mbx(B, 'seed', PROJ, 1, {'from': 50}); await W(B, 400)
            bt4 = await body(B); await fxclick(B, 'done')
            L = await fx(B, 'list', PROJ); st8 = {x['name'] or x['kind']: x['status'] for x in L['items']}
            # (beta 7.8: a ticked item says what the record shows (✓ New photo, ✓ Deleted, ✓ the new pole's ID) since the 12 Nov 2026 upload)
            check('P8 a new photo, a deleted record and the missing pole (captured at the spot) each tick on the record', 'Pole CC-1001' in bt and '✓ New photo' in bt and 'Pole CC-1003' in bt3 and '✓ Deleted' in bt3 and 'Capture the missing pole here' in bt4 and '✓ CC-1051' in bt4
                  and [st8.get(k) for k in ('CC-1001', 'CC-1002', 'CC-1003', 'spot')] == ['fixed'] * 4, (bt[:160], bt3[:200], bt4[:200], st8))
            await fxclick(B, 'found'); await B.click('#fxBody .fx-tile[data-w="Leaning"]'); await B.fill('#fxFoundNote', 'Leaning toward the road'); await fxclick(B, 'foundsave')
            tb = await check_in(B)  # (beta 7.8: the Team mailbox's Check brings round 2 in, since the 12 Nov 2026 upload; nothing is sent)
            await B.click('#curTeam [data-ct="fxopen"]'); await idle(B, 30000); await W(B, 800)
            bt = await body(B); L = await fx(B, 'list', PROJ)
            check('P9 round 2 arrives (the Team mailbox\'s Check brings it in): CC-1006 open again with Juan’s note; the found item is on the list', f'brought in: 1 fix from Juan for “{PROJ}”' in tb and 'Pole CC-1006' in bt and 'Round 2' in bt and 'Converge' in bt and any(x['kind'] == 'found' for x in L['items']), (tb, bt[:300]))
            await setrec(B, 'CC-1006', {'boq': {'owner': 'Converge'}}); await W(B, 300); await fxclick(B, 'done')
            bt = await body(B)
            # (beta 7.8: all done, the fix list says so and offers Sync now: the answers go with Sync (the 12 Nov 2026 upload))
            check('P10 all checked: All 8 done, they go to Juan at the next Sync (Sync now)', 'All 8 done' in bt and 'They go to Juan at your next Sync' in bt and await B.is_visible('#fxBody [data-fx="sync"]'), bt[:200])
            await fxclick(B, 'sync'); t0 = time.time()
            while time.time() - t0 < 60 and await B.evaluate("document.getElementById('syncBtn').classList.contains('spin')"): await W(B, 150)
            tb = await toast(B)
            # ---------- Juan checks and accepts (beta 7.8: his Sync brings update 3 in, with the answers)
            tA, _ = await sync_now(A); await A.click('#projectBtn'); await W(A, 400)
            rows = await A.eval_on_selector_all('#curTeam .fx-rv', "(d) => d.map((x) => x.textContent)")
            g = lambda k: ([r for r in rows if k in r] or [''])[0]
            check('J6 the answers: CC-1001 new photo, CC-1003 deleted, a new pole CC-1051 at the spot, Pedro found Leaning, CC-1006 Owner → Converge',
                  'new photo' in g('CC-1001') and 'deleted' in g('CC-1003') and 'CC-1051' in g('A spot on the map') and 'Leaning' in g('Found') and 'Converge' in g('CC-1006'), (tb, tA, rows))
            await A.locator('#wfBox').screenshot(path=f'{OUT}/j_review2.png')
            while True:
                b = A.locator('#curTeam [data-fxr="ok"]')
                if not await b.count(): break
                await b.first.click(); await W(A, 250)
            acc = await A.evaluate(ACC_JS)
            check('J7 every answer OK: Accept is on', acc is False, (acc, await txt(A, '#curTeam')))
            await A.click('#curTeam [data-ct="accept"]'); await answer(A, 'Accept'); await idle(A, 30000); await W(A, 400)
            check('J8 accepted', 'Accepted on' in await txt(A, '#curTeam'), await txt(A, '#curTeam'))
            check('Z1 no page errors', not (ea + eb), ea + eb)
            for c in (ca, cb): await c.close()
    finally:
        srv.terminate()
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed' + (f': {bad}' if bad else ''))
asyncio.run(main())
