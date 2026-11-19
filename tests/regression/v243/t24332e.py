"""v2.43.0 beta 3.2, QA-17 (synthetic data only): Team is switched on per company in the online sheet (CompanyKeys → Team, sheet
script v2.43.1), on the STABLE address (no beta channel). Company A = DEMO CONTRACTOR (Team: Yes): Juan (coordinator) and Pedro
(field partner). Company B = DEMO CONTRACTOR B (Team: blank): Ana. The app talks to the REAL v2.43.1 sheet script and the REAL
mailbox script on their stand-ins (e2e/servers.js). Then A is switched to No with a task in progress, and back to Yes."""
import asyncio, sys, os, json, re, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v243/t2433c.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v243/out_c3'", "OUT = S + '/v243/out_e32'")
exec(compile(src, 't2433c_head', 'exec'))
PROJ = 'DEMO SITE TEAMSWITCH'; CKEY_B = 'DMCB4HJK9TRW'; ANA_B = 'ana@demo-contractor-b.example'
ACTS = ['teamCode', 'teamVerify', 'team', 'teamRole', 'teamJoin', 'teamAnswer', 'teamRemove', 'teamLeave', 'mailboxSet', 'mailboxKey']

async def new_ctx_stable(p, udir, w=412):
    """As t2433c's new_ctx, without the beta channel: the stable address (G-eSAA)."""
    ctx = await p.chromium.launch_persistent_context(udir, executable_path=common.CHROME, viewport={'width': w, 'height': 900}, service_workers='block')
    await ctx.route('https://script.google.com/**', google)
    for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**', 'https://build.protomaps.com/**'): await ctx.route(u, lambda r: r.fulfill(status=404, body=''))
    for js in (common.NO_DRAFT_JS, common.NO_SAMPLE_JS, common.NO_SAVECHECK_JS, common.ADM_OPEN_JS): await ctx.add_init_script(js)
    pg = ctx.pages[0]; errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    return ctx, pg, errs
async def setup_co(pg, name, email, ckey, co):
    await setup(pg, name, email)  # t2433c's: the list, the profile, DEMO CONTRACTOR's key, a sync
    if ckey != CKEY:
        await pg.evaluate("(a) => __polecam.team.patchS({ companyKey: a[0], keyCompany: a[1], cloud: null })", [ckey, co])
        await pg.evaluate("() => __polecam.team.sync()"); await W(pg, 300)
async def sync(pg):
    await close_sheets(pg); await pg.evaluate("() => __polecam.team.sync()"); await W(pg, 500)
async def team_row(pg):
    await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 400)
    v = await pg.is_visible('#goTeam'); t = await txt(pg, '#teamSub') if v else ''
    await close_sheets(pg); return v, t
async def np_state(pg):
    """New project with Survey picked: Assign to shown?, Survey option [disabled, text]."""
    await close_sheets(pg); await pg.click('#projectBtn'); await W(pg, 300); await pg.click('#newProjBtn'); await W(pg, 300)
    so = await pg.evaluate("() => { const o = document.querySelector('#npCat option[value=survey]'); return [o.disabled, o.textContent]; }")
    if not so[0]: await pg.select_option('#npCat', 'survey'); await W(pg, 250)
    a = await pg.is_visible('#npAssignBox'); await close_sheets(pg); return a, so
async def proj_state(pg):
    """Projects: the mailbox box, the project's team card (text), the project tools."""
    await close_sheets(pg); await pg.click('#projectBtn'); await W(pg, 400)
    o = {'box': await pg.is_visible('#mbxBox'), 'card': await pg.is_visible('#curTeam'), 'cardText': await txt(pg, '#curTeam') if await pg.is_visible('#curTeam') else '',
         'tools': await pg.eval_on_selector_all('#curTools .tmtool', "(d) => d.map((x) => x.dataset.tool)"), 'dot': await pg.evaluate(DOT_JS)}
    await close_sheets(pg); return o
async def kept(pg):
    """What the phone keeps (nothing of it may be deleted when Team is off)."""
    return await pg.evaluate("""(p) => ({ projects: (__polecam.S.projects || []).length, recs: __polecam.points.filter((x) => x.project === p).length,
      team: JSON.stringify((__polecam.S.meta[p] || {}).team || null), state: JSON.stringify(__polecam.team.state()) })""", PROJ)
def sheet_post(body): return e2e('/sheet', body)

async def main():
    open(OUT + '/asplan.kml', 'w').write(KML)
    srv = subprocess.Popen(['node', S + '/v243/e2e/servers.js'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT); time.sleep(1.5)
    try:
        async with async_playwright() as p:
            ca, A, ea = await new_ctx_stable(p, OUT + '/ud_juan'); await setup_co(A, 'Juan Dela Cruz', JUAN, CKEY, 'DEMO CONTRACTOR')
            cb, B, eb = await new_ctx_stable(p, OUT + '/ud_pedro'); await setup_co(B, 'Pedro Santos', PEDRO, CKEY, 'DEMO CONTRACTOR')
            cn, N, en = await new_ctx_stable(p, OUT + '/ud_ana_b'); await setup_co(N, 'Ana Reyes', ANA_B, CKEY_B, 'DEMO CONTRACTOR B')
            bt = [await pg.evaluate("() => __polecam.team.beta().BETA") for pg in (A, B, N)]
            check('W1 three phones on the STABLE address (no beta channel); the sheet says Team on for A, off for B', bt == [False, False, False]
                  and [await pg.evaluate("() => (__polecam.S.cloud || {}).teamOn") for pg in (A, B, N)] == [True, True, False], bt)
            # ---------- company B (Team blank): nothing of Team
            v, t = await team_row(N)
            check('B1 Ana (company B): no Team row in Settings', not v, t)
            a, so = await np_state(N)
            check('B2 Ana: New project → Survey: no Assign to; Survey is hers to make', not a and so == [False, 'Survey'], (a, so))
            ps = await proj_state(N)
            check('B3 Ana: no team mailbox box in Projects, no dot', not ps['box'] and not ps['dot'], ps)
            r = await N.evaluate("() => __polecam.team.load().then((x) => x === null ? 'not asked' : 'asked', (e) => e.code || String(e))")
            check('B4 Ana\'s phone does not ask the sheet for a team (Team is off for B)', r == 'not asked', r)
            ans = [sheet_post({'action': a_, 'ckey': CKEY_B, 'email': ANA_B, 'role': 'Coordinator', 'url': MBX_URL, 'key': 'k' * 30, 'code': '123456', 'coordinator': JUAN, 'member': PEDRO}) for a_ in ACTS]
            check('B5 every team and mailbox request with company B\'s key answers off (10 of 10)', all(x == {'ok': False, 'error': 'off'} for x in ans), ans)
            check('B6 no code was emailed to Ana', e2e('/mail?to=' + ANA_B)['code'] is None)
            # ---------- company A (Team Yes): works as before
            v, t = await team_row(A)
            check('A1 Juan (company A): Settings → Team is there', v, t)
            await open_team(A); await confirm_email(A, JUAN); await role(A, 'Coordinator')
            await A.click('#tmMbxSetup'); await W(A, 500); await A.fill('#mbxUrl', MBX_URL); await A.click('#mbxSave'); await idle(A, 40000); await W(A, 400)
            await open_team(B); await confirm_email(B, PEDRO); await role(B, 'Field Partner')
            await B.locator('#tmCoList .tmrow', has_text='Juan Dela Cruz').locator('[data-join]').click(); await idle(B)
            await open_team(A); await A.locator('#tmMemList [data-accept]').first.click(); await idle(A); await W(A, 300)
            if await B.is_visible('#tmRefresh'): await B.click('#tmRefresh'); await idle(B)
            st = [await pg.evaluate("() => __polecam.team.state()") for pg in (A, B)]
            check('A2 Juan coordinator with the mailbox; Pedro in his team with the mailbox', all(x['mbx'] and x['mbx']['url'] == MBX_URL for x in st) and [m['status'] for m in st[0]['snap']['members']] == ['in'], [bool(x['mbx']) for x in st])
            await close_sheets(A); await A.click('#projectBtn'); await W(A, 300); await A.click('#newProjBtn'); await W(A, 300)
            await A.select_option('#npCat', 'survey'); await W(A, 200); await A.select_option('#npPurpose', 'As-plan'); await A.fill('#npName', PROJ); await A.set_input_files('#npKmzInput', OUT + '/asplan.kml'); await W(A, 300)
            ab = await A.is_visible('#npAssignBox'); await A.click('#npAssign .chip:has-text("Pedro Santos")'); await W(A, 200)
            await A.click('#npCreate'); await idle(A, 40000); await W(A, 600)
            check('A3 Assign to on Juan\'s phone; the task went to Pedro', ab and 'sent to Pedro' in await toast(A), await toast(A))
            await projects(B); await dl(B, ms=40000); await W(B, 400)
            await mbx(B, 'seed', PROJ, 3, {}); await W(B, 300)
            ctB = await txt(B, '#curTeam'); a, so = await np_state(B)
            check('A4 Pedro has the task (3 poles surveyed, not sent yet); Survey is from his coordinator', 'Task from Juan Dela Cruz' in ctB and len(await mbx(B, 'recs', PROJ)) == 3 and so == [True, 'Survey (from your coordinator)'], (ctB, so))
            kA0, kB0 = await kept(A), await kept(B)
            await A.screenshot(path=f'{OUT}/a_on.png'); await B.screenshot(path=f'{OUT}/b_on.png')
            # ---------- A switched to No, with the task in progress
            e2e('/teamswitch?co=DEMO%20CONTRACTOR&v=No')
            mid = [await pg.evaluate("() => (__polecam.S.cloud || {}).teamOn") for pg in (A, B)]
            # Pedro, before his next sync, still has Settings → Team: Refresh asks the sheet, which answers off
            await open_team(B); await B.click('#tmRefresh'); await idle(B); await W(B, 300)
            er = await txt(B, '#tmErr'); await close_sheets(B); vB, _ = await team_row(B)
            check('O0 a team request after the switch answers off: the app says why and hides Team at once (before any sync)', mid == [True, True] and 'Team is not switched on for your company' in er and not vB
                  and await B.evaluate("() => __polecam.S.cloud.teamOn") is False, (mid, er, vB))
            await sync(A); await sync(B)
            check('O0b after their next sync, the sheet says off on both phones', [await pg.evaluate("() => __polecam.S.cloud.teamOn") for pg in (A, B)] == [False, False])
            vA, _ = await team_row(A); vB, _ = await team_row(B)
            check('O1 no Team row on Juan\'s or Pedro\'s phone', not vA and not vB)
            pA, pB = await proj_state(A), await proj_state(B)
            check('O2 no mailbox box, no team card, no mailbox or Send icon (Share, KMZ, Delete stay)', not pA['box'] and not pB['box'] and not pA['card'] and not pB['card']
                  and 'mbx' not in pA['tools'] + pB['tools'] and 'send' not in pA['tools'] + pB['tools'] and 'share' in pB['tools'], (pA, pB))
            aA, _ = await np_state(A); aB, soB = await np_state(B)
            check('O3 New project: no Assign to for Juan; Pedro may make a survey again (the role rule is off)', not aA and soB == [False, 'Survey'], (aA, soB))
            kA1, kB1 = await kept(A), await kept(B)
            check('O4 nothing deleted: the projects, Pedro\'s 3 records, each project\'s team state, the role, the teams and the mailbox are kept', kA1 == kA0 and kB1 == kB0, {'A': [kA0, kA1], 'B': [kB0, kB1]})
            sl = await B.get_attribute('#syncBtn', 'aria-label') or ''
            r = await B.evaluate("() => __polecam.team.load().then((x) => x === null ? 'not asked' : 'asked', (e) => e.code || String(e))")
            check('O5 Pedro\'s phone no longer asks for its team, and Sync no longer checks the mailbox', r == 'not asked' and 'mailbox' not in sl, (r, sl))
            await A.screenshot(path=f'{OUT}/a_off.png'); await B.screenshot(path=f'{OUT}/b_off.png')
            # ---------- A switched back to Yes
            e2e('/teamswitch?co=DEMO%20CONTRACTOR&v=Yes')
            await sync(A); await sync(B); await W(A, 800); await idle(A); await idle(B)
            vA, tA = await team_row(A); vB, tB = await team_row(B)
            check('N1 the Team row is back, with its state: Juan coordinator with 1 field partner and the mailbox; Pedro in Juan\'s team', vA and vB and tA.startswith('Coordinator · 1 field partner') and 'mailbox ready' in tA and 'Juan' in tB and tB.startswith('Field Partner'), (tA, tB))
            pA, pB = await proj_state(A), await proj_state(B)
            check('N2 the mailbox box and the team cards are back: Assigned to Pedro; Task from Juan Dela Cruz', pA['box'] and pB['box'] and 'Assigned to' in pA['cardText'] and 'Pedro Santos' in pA['cardText'] and 'Task from Juan Dela Cruz' in pB['cardText'] and 'send' in pB['tools'], (pA, pB))
            aA, _ = await np_state(A); aB, soB = await np_state(B)
            check('N3 Assign to back for Juan; Survey from his coordinator again for Pedro', aA and soB == [True, 'Survey (from your coordinator)'], (aA, soB))
            check('N4 the records and team state are as before', (await kept(B))['recs'] == 3 and (await kept(B))['team'] == kB0['team'])
            await open_proj(B, PROJ); await close_sheets(B); await B.click('#projectBtn'); await W(B, 300); await send_sheet(B)
            sg = await send_go(B, 40000); await W(B, 400)
            await projects(A); j, stg = await dl(A, ms=40000); await W(A, 400)
            check('N5 the task carries on: Pedro sends his 3 poles, Juan downloads and merges them', 'Sent to Juan' in sg['line'] and j and j['stage'] == 'done' and len(await mbx(A, 'recs', PROJ)) == 3, ({k: v for k, v in sg.items() if k != 'seen'}, j))
            await A.screenshot(path=f'{OUT}/a_back.png'); await B.screenshot(path=f'{OUT}/b_back.png')
            check('Z1 no page errors', not (ea + eb + en), ea + eb + en)
            for c in (ca, cb, cn): await c.close()
    finally:
        srv.terminate()
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed' + (f': {bad}' if bad else ''))
asyncio.run(main())
