"""v2.25.1: the tutorial's guided tour goes on from step to step: tapping the ringed button does it and the tip follows on the
next screen (camera, ID step, record…); dialogs pause it; every topic can be walked with Next to the end."""
import asyncio, sys, os, shutil, json
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, sheet_companies, pick
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out'; os.makedirs(OUT, exist_ok=True)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:600])
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(p_):
    for _ in range(8):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 250)
TIP = """(sel) => { const tip = document.getElementById('tutTip'), spot = document.getElementById('tutSpot');
  if (!tip) return { tip: false };
  const head = tip.querySelector('.tuthead span').textContent, shown = tip.style.display !== 'none';
  let around = null;
  if (sel && spot) { const t = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length && !e.closest('[hidden]'));
    if (t) { const a = t.getBoundingClientRect(), b = spot.getBoundingClientRect(); around = b.left <= a.left + 1 && b.right >= a.right - 1 && b.top <= a.top + 1 && b.bottom >= a.bottom - 1; } }
  const open = tip.querySelector('.tutopen');
  return { tip: true, head, shown, spot: !!spot, around, open: !!open && !open.hidden, top: [...document.querySelectorAll('section.sheet:not([hidden])')].map(s => s.id).pop() || 'map' }; }"""
async def tip(pg, sel=None): return await pg.evaluate(TIP, sel)
async def start(pg, topic, aud='user'):
    await close_sheets(pg); await pg.click('#tutorialBtn'); await W(pg, 250)
    if aud == 'admin': await pg.click('#tutAud [data-aud="admin"]'); await W(pg, 150)
    await pg.click(f'#tutList .tuttopic[data-topic="{topic}"]'); await W(pg, 250)
    await pg.click('#tutTour'); await W(pg, 1200)
async def main():
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_tour', ignore_errors=True)
        ctx, pg, errs, cur, state, tk = await launch(p, f'{D}/ud_tour', S + '/v17/vid/h_cc.mjpeg', project=False)
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP Mindanao'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
        await pg.click('#admSave'); await pg.wait_for_selector('#qrShow:not([hidden])'); await W(pg, 300); await pg.click('#qrClose'); await W(pg, 300)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 600)
        await newproj(pg, 'survey', 'TOUR_SURVEY'); await close_sheets(pg)

        # ===== 1. Capture poles: tap the ringed controls one after the other
        n0 = await pg.evaluate("__polecam.points.length")
        await start(pg, 'capture'); s1 = await tip(pg, '#captureBtn')
        await pg.click('#captureBtn'); await W(pg, 1800); s2 = await tip(pg, '#shutter')
        await pg.screenshot(path=f'{OUT}/r1_camera_step.png')
        await pg.click('#shutter')
        await pg.wait_for_function("() => { const k = document.getElementById('scanSkip'); return (k && k.getClientRects().length && !k.closest('[hidden]')) || !document.getElementById('editor').hidden; }", timeout=20000); await W(pg, 900)
        skip_shown = await pg.evaluate("(() => { const k = document.getElementById('scanSkip'); return !!(k && k.getClientRects().length && !k.closest('[hidden]')); })()")
        s3 = await tip(pg, '#scanSkip'); await pg.screenshot(path=f'{OUT}/r2_id_step.png')
        if skip_shown: await pg.click('#scanSkip')
        else: await W(pg, 2500)  # the ID was read by itself: the record is open and the tour moves on by itself
        await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 1200); s4 = await tip(pg, '#snapGps')
        await pg.screenshot(path=f'{OUT}/r3_record_step.png')
        await pg.click('#snapGps'); await W(pg, 900); s5t = await tip(pg, '#edTabs button')  # v2.42.17: the record's tabs
        await pg.click('#edTabs [data-tab="acc"]'); await W(pg, 900); s5 = await tip(pg, '#edSave, #edSaveTop')
        await pg.evaluate("() => { const b = [...document.querySelectorAll('#edSave, #edSaveTop')].find(e => e.getClientRects().length); b.click(); }")
        await pg.wait_for_selector('#editor', state='hidden', timeout=15000); await W(pg, 1200); s6 = await tip(pg, '#mapSummary')
        await pg.screenshot(path=f'{OUT}/r4_after_save.png')
        n1 = await pg.evaluate("__polecam.points.length")
        await pg.click('#tutTip button:has-text("Done")'); await W(pg, 400); end = await tip(pg)
        print('capture tour', s1, s2, s3, s4, s5, s6, sep='\n  ')
        check('capture tour: step 1 rings Capture; tapping it opens the camera and the tip goes on to step 2 round the shutter',
              s1['head'].endswith('step 1 of 7') and s1['around'] and s2['head'].endswith('step 2 of 7') and s2['around'] and s2['top'] == 'camera', (s1, s2))
        check('capture tour: shutter → step 3 rings Skip (ID step); Skip → step 4 rings Reset to GPS in the record; → step 5 rings the tabs (v2.42.17); a tab → step 6 rings Save',
              s3['head'].endswith('step 3 of 7') and (s3['around'] if skip_shown else True) and s4['head'].endswith('step 4 of 7') and s4['around'] and s4['top'] == 'editor' and s5t['head'].endswith('step 5 of 7') and s5t['around'] and s5['head'].endswith('step 6 of 7') and s5['around'], (s3, s4, s5t, s5))
        check('capture tour: Save → the record is saved, step 6 rings Records on the map; Done ends the tour',
              n1 == n0 + 1 and s6['head'].endswith('step 7 of 7') and s6['around'] and s6['top'] == 'map' and not end['tip'], (n0, n1, s6, end))

        # ===== 2. A dialog pauses the tour; the next screen opens only with Open it ›
        await newproj(pg, 'PAT', 'TOUR_PAT'); await close_sheets(pg)
        await start(pg, 'pat'); p1 = await tip(pg, '#curMore')
        await pg.click('#tutTip button:has-text("Next")'); await W(pg, 1500); p2 = await tip(pg, '#captureBtn')
        await pg.click('#captureBtn'); await W(pg, 1800); p3 = await tip(pg, '#shutter')
        await pg.click('#shutter'); await W(pg, 3500)
        if await pg.is_visible('#scanSkip'): await pg.click('#scanSkip'); await W(pg, 1500)
        p4 = await tip(pg, '#defAdd')
        await pg.screenshot(path=f'{OUT}/r5_defect_step.png')
        await pick(pg, '#defCatSel', 'Pole'); await pg.click('#defItems .chip >> nth=0'); await pick(pg, '#defSevSel', 'Major')
        await pg.click('#defAdd'); await W(pg, 1200); p5 = await tip(pg, '#addDefBtn')
        await pg.click('#tutTip button:has-text("Next")'); await W(pg, 900); p6 = await tip(pg, '#edSave, #edSaveTop')
        await pg.evaluate("() => { const b = [...document.querySelectorAll('#edSave, #edSaveTop')].find(e => e.getClientRects().length); b.click(); }")
        await W(pg, 2000)
        if await pg.is_visible('#askBox'): await pg.click('#askBox button.primary'); await W(pg, 800)
        p7 = await tip(pg)
        print('pat tour', p1, p2, p3, p4, p5, p6, p7, sep='\n  ')
        check('PAT tour: details → Next opens the map round Capture → camera (shutter) → the defect form rings Add to punchlist → + Add → Save → last step',
              p1['around'] and p2['around'] and p2['top'] == 'map' and p3['around'] and p4['around'] and p4['head'].endswith('step 4 of 7') and p5['around'] and p6['around'] and p7['head'].endswith('step 7 of 7'), [x.get('head') for x in (p1, p2, p3, p4, p5, p6, p7)])
        await pg.click('#tutTip .tutx'); await W(pg, 300)

        # patdone: Mark complete asks (dialog): the tip hides, then comes back with Open it ›
        await start(pg, 'patdone'); d1 = await tip(pg, '#doneBtn')
        await pg.click('#doneBtn'); await W(pg, 800); d2 = await tip(pg)
        ask_open = await pg.is_visible('#askBox')
        await pg.click('#askBox button.primary'); await W(pg, 900); d3 = await tip(pg, '#doPdf')
        await pg.click('#tutTip .tutopen'); await W(pg, 1500); d4 = await tip(pg, '#doPdf')
        print('patdone', d1, d2, d3, d4, sep='\n  ')
        check('a dialog pauses the tour (tip hidden); after it the next step waits with Open it ›, which opens Export round the PDF button',
              d1['around'] and ask_open and not d2['shown'] and d3['shown'] and d3['head'].endswith('step 2 of 4') and d3['open'] and d3['top'] == 'projects' and d4['top'] == 'export' and d4['around'] and not d4['open'], (d2, d3, d4))
        await pg.click('#tutTip .tutx'); await W(pg, 300)

        # ===== 2b. the defect cleanup on this phone: the pin card, Photo of the fix, the camera, Next pin
        await close_sheets(pg); await pg.click('#projectBtn'); await W(pg, 300)
        print('before cleanup', await pg.evaluate("(() => { const m = __polecam.S.meta[__polecam.S.project] || {}; const b = document.getElementById('startCleanup'); return { p: __polecam.S.project, done: m.completedAt, stage: m.stage, hidden: b.hidden, acts: document.getElementById('accActs').hidden, top: [...document.querySelectorAll('section.sheet:not([hidden])')].map(s => s.id) }; })()"))
        if not await pg.evaluate("!!(__polecam.S.meta[__polecam.S.project] || {}).completedAt"):
            await pg.evaluate("document.getElementById('curMore').open = true")
            for sel, val in (('#mSite', 'TOUR SITE'), ('#mContractor', 'FADI')): await pg.fill(sel, val); await pg.dispatch_event(sel, 'change')
            await pg.click('#doneBtn'); await W(pg, 600)
            for _ in range(3):
                if not await pg.is_visible('#askBox'): break
                b = pg.locator('#askBox button:has-text("Complete and lock")')
                await (b.first.click() if await b.count() else pg.click('#askBox button.primary')); await W(pg, 600)
        await pg.click('#startCleanup', timeout=8000); await W(pg, 1200)
        for _ in range(3):
            if not await pg.is_visible('#askBox'): break
            await pg.click('#askBox button.primary'); await W(pg, 900)
        await W(pg, 1500); await close_sheets(pg)
        if not await pg.is_visible('#visitCard'):
            await pg.evaluate("() => { const m = document.getElementById('mapSummary'); m && m.click(); }"); await W(pg, 900)
        card = await pg.is_visible('#visitCard')
        await pg.click('#tutorialBtn'); await W(pg, 250); await pg.click('#tutList .tuttopic[data-topic="cleanup"]'); await W(pg, 250)
        await pg.click('#tutSteps li:nth-child(2) .show'); await W(pg, 1200); c2 = await tip(pg, '#visitCard')
        await pg.click('#tutTip button.primary'); await W(pg, 900); c3 = await tip(pg, '#vcItems .acts .btn.primary')
        await pg.screenshot(path=f'{OUT}/r6_card_step.png')
        await pg.click('#vcItems .acts .btn.primary'); await W(pg, 1800); c4 = await tip(pg, '#shutter')
        await pg.click('#shutter'); await W(pg, 4500); c5 = await tip(pg, '#vcNext')
        print('cleanup tour', card, c2, c3, c4, c5, sep='\n  ')
        check('cleanup tour on the pin card: card → Photo of the fix (ringed) → camera (shutter) → after the photo, step 5 (Next pin)',
              card and c2['around'] and c3['around'] and c3['head'].endswith('step 3 of 6') and c4['around'] and c4['top'] == 'camera' and c5['head'].endswith('step 5 of 6'), [c2.get('head'), c3.get('around'), c4.get('top'), c5.get('head'), c5.get('around')])
        await pg.click('#tutTip .tutx'); await W(pg, 300)

        # ===== 3. every topic (user and admin) walked with Next from step 1 to Done
        topics = await pg.evaluate("GESAA_TUTORIAL.topics.map(t => ({ id: t.id, aud: t.aud, n: t.steps.length }))")
        bad, rings, total = [], 0, 0
        for t in topics:
            await start(pg, t['id'], t['aud'])
            for k in range(t['n']):
                st = await tip(pg)
                total += 1; rings += 1 if st.get('spot') else 0
                if not st.get('tip') or not st['head'].endswith(f"step {k + 1} of {t['n']}"):
                    bad.append((t['id'], k + 1, st)); break
                if st['shown'] is False:  # a dialog of the app: close it
                    await pg.click('#askBox button:has-text("Cancel")') if await pg.is_visible('#askBox') else None; await W(pg, 400)
                await pg.click('#tutTip button.primary'); await W(pg, 1100 if k < t['n'] - 1 else 500)
            else:
                if (await tip(pg))['tip']: bad.append((t['id'], 'did not end', None))
        print('steps', total, 'rings', rings, 'bad', bad)
        check('every topic walks with Next from step 1 to Done (tip on each step, the tour ends at Done)', not bad, bad[:4])
        print('errors', errs[:5])
        check('no page errors', not errs, errs[:3])
        tk.cancel(); await ctx.close()
        print(f'\n{sum(checks)}/{len(checks)} checks passed')
asyncio.run(main())
