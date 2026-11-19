"""v2.43.0 beta 3.3, QA-08 / QA-18 on simulated phones (synthetic data only): coordinators are approved. The REAL sheet script
v2.43.2 and mailbox script on their stand-ins (e2e/servers.js). Juan asks to be coordinator and waits; the admin approves him from
the admin phone (Administration → Team coordinators); Maria asks and Juan declines; Pedro asks and Juan approves; the admin then
removes Pedro in the sheet (No in the Team tab): at his next sync Pedro has no team and no mailbox. An unconfirmed phone gets no
names; the company's codes for the day used up: a plain message."""
import asyncio, sys, os, json, re, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v243/t2433c.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v243/out_c3'", "OUT = S + '/v243/out_qa08'")
exec(compile(src, 't2433c_head', 'exec'))
async def pick(pg, r): await pg.click(f'#tmRole .chip[data-v="{r}"]'); await idle(pg); await W(pg, 300)  # (no approval: the raw pick)
async def refresh(pg):
    if await pg.is_visible('#tmRefresh'): await pg.click('#tmRefresh'); await idle(pg); await W(pg, 300)
async def team_state(pg):
    return await pg.evaluate("""() => ({ info: document.getElementById('tmRoleInfo').textContent, wait: !!document.querySelector('#tmRole .chip.wait'),
      pressed: [...document.querySelectorAll('#tmRole .chip[aria-pressed=true]')].map((b) => b.dataset.v), co: !document.getElementById('tmCo').hidden,
      setup: !document.getElementById('tmMbxSetup').hidden, mbx: !!__polecam.team.state().mbx, role: ((__polecam.team.state().snap || {}).me || {}).role || '',
      ask: ((__polecam.team.state().snap || {}).me || {}).ask || '', asking: [...document.querySelectorAll('#tmAskList .tmrow')].map((x) => x.textContent) })""")

async def main():
    srv = subprocess.Popen(['node', S + '/v243/e2e/servers.js'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT); time.sleep(1.5)
    try:
        async with async_playwright() as p:
            ca, A, ea = await new_ctx(p, OUT + '/ud_juan'); await setup(A, 'Juan Dela Cruz', JUAN)
            cb, B, eb = await new_ctx(p, OUT + '/ud_pedro'); await setup(B, 'Pedro Santos', PEDRO)
            cm, M, em = await new_ctx(p, OUT + '/ud_maria'); await setup(M, 'Maria Garcia', MARIA)
            cn, N, en = await new_ctx(p, OUT + '/ud_ana'); await setup(N, 'Ana Reyes', ANA)
            # ---------- Juan asks and waits
            await open_team(A); await confirm_email(A, JUAN); await pick(A, 'Coordinator')
            st = await team_state(A); await A.screenshot(path=f'{OUT}/a_asked.png')
            check('Q1 Juan picks Coordinator: asked for, works on his own (no team, no mailbox set-up), and the screen says so', st['ask'] == 'asked' and st['role'] == 'On my own' and st['wait'] and st['pressed'] == ['Coordinator']
                  and 'asked for' in st['info'] and 'Until then you work on your own' in st['info'] and not st['co'] and not st['setup'], st)
            # ---------- the admin phone approves him (Juan's phone is the list's admin phone here)
            await A.evaluate("(k) => __polecam.team.patchS({ onlineAdminKey: k })", e2e('/adminkey')['key'])
            await close_sheets(A); await A.click('#settingsBtn'); await W(A, 300); await A.click('#goAdmin'); await W(A, 400)
            if await A.is_visible('#admPin'): await A.fill('#admPin', '1234'); await A.click('#admUnlock'); await W(A, 600)
            await A.evaluate("() => { const b = document.getElementById('admTeamLoad'); b.scrollIntoView(); }"); await W(A, 200)
            await A.click('#admTeamLoad'); await idle(A); await W(A, 300)
            rows = await A.eval_on_selector_all('#admTeamList .tmrow', "(d) => d.map((x) => x.textContent)")
            await A.screenshot(path=f'{OUT}/admin_list.png')
            check('Q2 Administration → Team coordinators lists Juan as Asking, with Approve', len(rows) == 1 and 'Juan Dela Cruz' in rows[0] and 'Asking' in rows[0] and 'Approve' in rows[0], rows)
            await A.click('#admTeamList [data-cset="1"]'); await idle(A); await W(A, 300)
            rows = await A.eval_on_selector_all('#admTeamList .tmrow', "(d) => d.map((x) => x.textContent)")
            check('Q3 approved from the admin phone: the sheet says Yes', 'Approved' in rows[0] and any(r[1] == JUAN and 'Yes' in r for r in e2e('/rows?tab=Team')), rows)
            await open_team(A); await refresh(A); st = await team_state(A)
            check('Q4 at his next read Juan is Coordinator: his team and the mailbox set-up show', st['role'] == 'Coordinator' and st['ask'] == '' and st['co'] and st['setup'] and not st['wait'], st)
            await A.click('#tmMbxSetup'); await W(A, 500); await A.fill('#mbxUrl', MBX_URL); await A.click('#mbxSave'); await idle(A, 40000); await W(A, 400)
            check('Q5 Juan sets up the mailbox', (await A.evaluate("() => __polecam.team.state()"))['mbx'] is not None)
            # ---------- Maria asks; Juan declines
            await open_team(M); await confirm_email(M, MARIA); await pick(M, 'Coordinator')
            await open_team(A); await refresh(A); st = await team_state(A); await A.screenshot(path=f'{OUT}/a_asking.png')
            check('Q6 Juan (approved) sees Maria asking to be coordinator, with Approve and Decline', len(st['asking']) == 1 and 'Maria Garcia' in st['asking'][0] and 'Approve' in st['asking'][0] and 'Decline' in st['asking'][0], st['asking'])
            await A.click('#tmAskList [data-decl]'); await answer(A, 'Decline'); await idle(A); await W(A, 300)
            await open_team(M); await refresh(M); st = await team_state(M)
            check('Q7 declined: Maria works on her own, no mailbox, and her screen says it was declined', st['ask'] == 'declined' and st['role'] == 'On my own' and not st['mbx'] and 'was declined' in st['info'], st)
            # ---------- Pedro asks; Juan approves; then the admin removes him in the sheet
            await open_team(B); await confirm_email(B, PEDRO); await pick(B, 'Coordinator')
            st = await team_state(B)
            check('Q8 Pedro asks: no mailbox while he waits', st['ask'] == 'asked' and not st['mbx'], st)
            await open_team(A); await refresh(A); await A.click('#tmAskList [data-appr]'); await idle(A); await W(A, 300)
            await open_team(B); await refresh(B); st = await team_state(B)
            check('Q9 Juan approves Pedro: Pedro is Coordinator and gets the mailbox', st['role'] == 'Coordinator' and st['mbx'], st)
            e2e('/teamyes?email=' + PEDRO + '&v=No')
            await open_team(B); await refresh(B); st = await team_state(B)
            await close_sheets(B); await B.click('#projectBtn'); await W(B, 300); box = await B.is_visible('#mbxBox'); await close_sheets(B)
            check('Q10 the admin removes Pedro in the sheet (No): at his next read he works on his own, the mailbox address and key are gone from his phone', st['role'] == 'On my own' and st['ask'] == 'declined' and not st['mbx'] and not box, (st, box))
            # ---------- QA-18: an unconfirmed phone gets no names; the codes of the day used up
            await open_team(N); snap = await N.evaluate("() => __polecam.team.load().then(() => __polecam.team.state().snap)")
            check('Q11 a phone whose email is not confirmed gets no names, emails or teams from the sheet', snap and snap['me'] is None and snap['coordinators'] == [] and snap['members'] == [] and snap['myTeams'] == [] and '@' not in json.dumps(snap.get('coordinators')), snap)
            e2e('/setting?k=' + urllib.parse.quote('Team codes per company per day') + '&v=0')
            await N.click('#tmSend'); await idle(N); await W(N, 300); er = await txt(N, '#tmErr')
            check('Q12 the company\'s codes for the day are used up: Not done, in plain words', 'your company has used today’s email codes for teams' in er, er)
            check('Z1 no page errors', not (ea + eb + em + en), ea + eb + em + en)
            for c in (ca, cb, cm, cn): await c.close()
    finally:
        srv.terminate()
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed' + (f': {bad}' if bad else ''))
asyncio.run(main())
