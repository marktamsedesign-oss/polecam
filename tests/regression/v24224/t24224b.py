"""v2.42.24 (synthetic data only): drawing cables. A made-up street (a tower, 6 poles in a row, a branch of 2 poles; IDs and places made
up), a closure on the 3rd pole. Route: the bar (＋ New cable, Cables · n, Done); the New cable sheet (the types by family, Draw or
Follow the capture order); a cable started, drawn by taps, ✓ Finish; with no cable in the bar a tap on a pole opens the sheet from it
(never extends a cable) and a line opens it with the poles drawn; ✕ Cancel takes back everything since the start; a cable with one point
is not kept; the closure's size follows the largest cable at it; the list of cables (Continue, type, Details, Delete with its spans);
Follow the capture order makes cables; More; an older project's spans become cables once when opened (split at the junction and where
the type changes); an approved project's closure is not changed on opening; RUN n in the texts."""
import asyncio, sys, os, math, json
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v24220/t24220b.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v24220/out_b'", "OUT = S + '/v24224/out_b'")
exec(compile(src, 't24220b_head', 'exec'))
R_E = 6371008.8; LAT, LON0 = 7.0921, 125.6045
def ll(dx, dy): return (LAT + dy / (R_E * math.pi / 180), LON0 + dx / (R_E * math.cos(math.radians(LAT)) * math.pi / 180))
PL = {'T': (-30, 4), **{f'P{i}': (i * 40 - 40, 0) for i in range(1, 7)}, 'B1': (160, -40), 'B2': (160, -80)}
NAME = {'T': 'SYN-T01', **{f'P{i}': f'CC-77{i}0' for i in range(1, 7)}, 'B1': 'CC-7810', 'B2': 'CC-7820'}
def recs(clo_size=''):
    out = []
    for k, (x, y) in PL.items():
        la, lo = ll(x, y)
        if k == 'T': out.append({'k': k, 'poleId': NAME[k], 'lat': la, 'lon': lo, 'element': 'Site', 'status': 'New', 'boq': {}, 'x': {'siteKind': 'Tower'}})
        else:
            out.append({'k': k, 'poleId': NAME[k], 'poleType': 'Concrete', 'lat': la, 'lon': lo, 'element': 'Pole', 'status': 'Existing', 'boq': {'owner': 'Electric', **({'cloSt': 'New', **({'clo': clo_size} if clo_size else {})} if k == 'P3' else {})}, 'x': {'closure': True, 'closureId': 'CL-01'} if k == 'P3' else {}})
    return out
async def main():
    async with async_playwright() as p:
        ctx, pg, errs = await new_ctx(p, OUT + '/ud', 420); await setup(pg, 'Juan Dela Cruz', 'juan.delacruz@example.com')
        await pg.set_viewport_size({'width': 400, 'height': 820})
        await common.newproj(pg, 'survey', 'ROUTE_TEST', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['ROUTE_TEST', recs(), [], None]); kof = {v: k for k, v in ids.items()}
        F = lambda: pg.evaluate("__polecam.fibers().map((f) => [f.n, f.cab, f.path.length, !!f.ex])")
        FP = lambda: pg.evaluate("__polecam.fibers().map((f) => [f.n, f.cab, f.path])")
        Lk = lambda: pg.evaluate("(__polecam.S.meta[__polecam.S.project].links || []).length")
        clo = lambda: pg.evaluate("(id) => __polecam.points.find((x) => x.id === id).boq", ids['P3'])
        await pg.click('#routeBtn'); await W(pg, 900)
        la, lo = ll(60, 0); await pg.evaluate("([a, b]) => __polecam.mapView(a, b, 18.3)", [la, lo]); await W(pg, 900)
        async def pt(k): x, y = PL[k]; la, lo = ll(x, y); return await pg.evaluate("([a, b]) => __polecam.mapPt(a, b)", [la, lo])
        async def tap(k): q = await pt(k); await pg.mouse.click(q[0], q[1]); await W(pg, 450)
        async def drag(ks):
            P0 = [await pt(k) for k in ks]; await pg.mouse.move(*P0[0]); await pg.mouse.down()
            for a, b in zip(P0, P0[1:]):
                for i in range(1, 7): await pg.mouse.move(a[0] + (b[0] - a[0]) * i / 6, a[1] + (b[1] - a[1]) * i / 6); await W(pg, 15)
            await pg.mouse.up(); await W(pg, 600)
        async def noask():
            while await pg.locator('#rtBar [data-rt="askno"]').count(): await pg.click('#rtBar [data-rt="askno"]'); await W(pg, 350)
        bar = await pg.evaluate("() => ({ nw: !!document.querySelector('#rtBar #rtNewCab'), cab: (document.querySelector('#rtBar #rtCables') || {}).textContent || '', done: !!document.querySelector('#rtBar #rtDone'), chips: document.querySelectorAll('#rtBar .fchip').length })")
        check('A1. the Route bar: ＋ New cable, Cables · 0, Done; no fiber chips', bar == {'nw': True, 'cab': 'Cables · 0', 'done': True, 'chips': 0}, bar)
        await pg.click('#rtNewCab'); await W(pg, 500)
        sh = await pg.evaluate("() => { const e = document.getElementById('rtPop'); return { open: !e.hidden, lbl: (e.querySelector('.lbl') || {}).textContent || '', groups: [...e.querySelectorAll('.lbl2')].map((x) => x.textContent), types: [...e.querySelectorAll('[data-ncab]')].map((x) => x.dataset.ncab), how: [...e.querySelectorAll('input[name=rtHow]')].map((x) => x.value), start: !!e.querySelector('#rtSheetStart') }; }")
        check('A2. ＋ New cable: the sheet, RUN 1; its type first, by family (Light cable, Figure 8, UG air-blown: 8 types); Draw or Follow the capture order; Start',
              sh['open'] and 'NEW CABLE · RUN 1' in sh['lbl'] and sh['groups'] == ['Light cable', 'Figure 8', 'UG air-blown'] and sh['types'] == ['L12', 'F12', 'F24', 'F48', 'F72', 'F144', 'U144', 'U288'] and sh['how'] == ['draw', 'cap'] and sh['start'], sh)
        await pg.screenshot(path=OUT + '/1_sheet.png')
        await pg.click('#rtPop [data-ncab="F24"]'); await W(pg, 250); await pg.click('#rtSheetStart'); await W(pg, 500)
        f0 = await F(); pen = await pg.evaluate("() => !!document.querySelector('#rtBar [data-rt=mode][data-v=draw][aria-pressed=true]')")
        check('B1. Start: RUN 1 (Fig-8 24C) in the bar, no points yet, ✎ Draw on', f0 == [[1, 'F24', 0, False]] and pen, (f0, pen))
        for k in ['T', 'P1', 'P2', 'P3']: await tap(k)
        txt = await pg.evaluate("() => document.getElementById('rtBar').textContent")
        check('B2. taps add the poles: RUN 1 has 4; the bar says RUN 1, with ✕ Cancel and ✓ Finish', (await F()) == [[1, 'F24', 4, False]] and 'RUN 1' in txt and await pg.locator('#rtCancel').count() == 1 and await pg.locator('#rtFinish').count() == 1, (await F(), txt[:80]))
        await pg.click('#rtFinish'); await W(pg, 600); await noask()
        check('B3. ✓ Finish: RUN 1 saved, 3 spans', (await F()) == [[1, 'F24', 4, False]] and await Lk() == 3, (await F(), await Lk()))
        await W(pg, 700); b = await clo()
        check('C1. the closure on CC-7730 (no size): 24C, its largest cable\'s', b.get('clo') == '24C' and b.get('cloAuto') is True, b)
        await tap('P3')
        lbl = await pg.evaluate("() => { const e = document.getElementById('rtPop'); return e.hidden ? '' : (e.querySelector('.lbl') || {}).textContent; }")
        check('D1. no cable in the bar: a tap on a pole (RUN 1\'s end) opens the New cable sheet from it, RUN 2 (RUN 1 not extended)', 'RUN 2' in lbl and 'FROM CC-7730' in lbl and (await F()) == [[1, 'F24', 4, False]], (lbl, await F()))
        hw = await pg.evaluate("() => document.querySelectorAll('#rtPop input[name=rtHow]').length")
        check('D2. from a pole: no capture order choice (Draw only)', hw == 0, hw)
        await pg.click('#rtPop [data-ncab="F72"]'); await W(pg, 200); await pg.click('#rtSheetStart'); await W(pg, 500)
        await drag(['P3', 'P4', 'P5', 'P6']); await pg.click('#rtFinish'); await W(pg, 600); await noask()
        check('D3. RUN 2 (Fig-8 72C) drawn from the closure pole along 3 more poles; RUN 1 unchanged', (await F()) == [[1, 'F24', 4, False], [2, 'F72', 4, False]] and await Lk() == 6, (await F(), await Lk()))
        await W(pg, 700); b = await clo()
        check('C2. the closure follows: 72C (RUN 2 starts there)', b.get('clo') == '72C' and b.get('cloAuto') is True, b)
        await drag(['P6', 'B1', 'B2'])
        lbl = await pg.evaluate("() => { const e = document.getElementById('rtPop'); return e.hidden ? '' : (e.querySelector('.lbl') || {}).textContent; }")
        check('E1. a line from RUN 2\'s end with no cable in the bar: the sheet with the 3 poles drawn (RUN 2 not extended)', 'RUN 3' in lbl and '3 POLES DRAWN' in lbl and (await F()) == [[1, 'F24', 4, False], [2, 'F72', 4, False]], (lbl, await F()))
        await pg.keyboard.press('Escape'); await W(pg, 400)
        hid = await pg.evaluate("() => document.getElementById('rtPop').hidden")
        check('E2. Esc closes the sheet: nothing made', hid and (await F()) == [[1, 'F24', 4, False], [2, 'F72', 4, False]] and await Lk() == 6, (hid, await F()))
        await drag(['P6', 'B1', 'B2']); await pg.click('#rtPop [data-ncab="L12"]'); await W(pg, 200); await pg.click('#rtSheetStart'); await W(pg, 500)
        f3 = await F(); l3 = await Lk()
        await pg.click('#rtCancel'); await W(pg, 600)
        check('E3. Save this cable: RUN 3 (Light 12C, 3 poles, 2 new spans) in the bar; ✕ Cancel takes it all back', f3 == [[1, 'F24', 4, False], [2, 'F72', 4, False], [3, 'L12', 3, False]] and l3 == 8 and (await F()) == [[1, 'F24', 4, False], [2, 'F72', 4, False]] and await Lk() == 6, (f3, l3, await F(), await Lk()))
        await pg.click('#rtNewCab'); await W(pg, 300); await pg.click('#rtSheetStart'); await W(pg, 400); await tap('B1'); await pg.click('#rtFinish'); await W(pg, 500)
        check('E4. a cable with one point is not kept', (await F()) == [[1, 'F24', 4, False], [2, 'F72', 4, False]], await F())
        # the list of cables
        await pg.click('#rtCables'); await W(pg, 600)
        cards = await pg.evaluate("() => [...document.querySelectorAll('#rbFibers .ccard')].map((c) => [c.querySelector('.cc-t b').textContent, c.querySelector('.cc-t span').textContent, c.querySelector('.cc-m').textContent, [...c.querySelectorAll('[data-cc]')].map((x) => x.dataset.cc)])")
        check('F1. Cables: a card for each (RUN 1 AE Figure 8 24C, RUN 2 AE Figure 8 72C) with its length and ends; Continue, type, Details, Delete',
              len(cards) == 2 and cards[0][0] == 'RUN 1' and '24C' in cards[0][1] and 'SYN-T01 → CC-7730' in cards[0][2] and cards[1][0] == 'RUN 2' and 'CC-7730 → CC-7760' in cards[1][2] and all(c[3] == ['cont', 'type', 'det', 'del'] for c in cards), cards)
        more = await pg.evaluate("() => { const m = document.getElementById('rbMore'); return m ? [m.querySelector('summary').textContent, !!m.querySelector('#rbPairs'), !!m.querySelector('#rbClear'), !!m.querySelector('#rbAdviceBox'), !!document.getElementById('rbAuto')] : null; }")
        check('F2. More: route check, link two poles without a cable, clear all (no Link in capture order button)', more and more[1] and more[2] and more[3] and not more[4] and 'More' in more[0], more)
        await pg.select_option('#rbFibers select[data-n="1"]', 'F48'); await W(pg, 500)
        check('F3. a cable\'s type from the list: RUN 1 → Fig-8 48C (the whole cable)', (await F())[0] == [1, 'F48', 4, False], await F())
        await pg.click('#rbFibers [data-cc="det"][data-n="2"]'); await W(pg, 400)
        det = await pg.evaluate("() => { const c = document.getElementById('rbFib'); return c.hidden ? '' : c.textContent; }")
        check('F4. Details: RUN 2\'s ends, side, Continue, Reverse', 'RUN 2' in det and 'Reverse' in det and 'Continue' in det and 'From' in det, det[:160])
        await pg.click('#rbFibers [data-cc="del"][data-n="2"]'); await W(pg, 300)
        armed = await pg.evaluate("() => document.querySelector('#rbFibers [data-cc=del][data-n=\"2\"]').textContent")
        await pg.click('#rbFibers [data-cc="del"][data-n="2"]'); await W(pg, 700)
        check('F5. Delete (tap again): RUN 2 and its 3 spans no other cable uses are gone', armed == 'Tap again to delete' and (await F()) == [[1, 'F48', 4, False]] and await Lk() == 3, (armed, await F(), await Lk()))
        await W(pg, 700); b = await clo()
        check('C3. the closure follows: 48C (RUN 1 now 48C, RUN 2 gone)', b.get('clo') == '48C', b)
        await pg.click('#rbUndo'); await W(pg, 600)
        check('F6. Undo brings RUN 2 and its spans back', (await F()) == [[1, 'F48', 4, False], [2, 'F72', 4, False]] and await Lk() == 6, (await F(), await Lk()))
        await pg.click('#rbFibers [data-cc="cont"][data-n="1"]'); await W(pg, 500)
        st = await pg.evaluate("() => [__polecam.fibState().fibAdd, document.getElementById('routeBar').hidden]")
        await tap('B1'); f_ = await F()
        await pg.click('#rtCancel'); await W(pg, 500)
        check('G1. Continue on RUN 1 (the list closes, RUN 1 in the bar): a tap adds CC-7810; ✕ Cancel takes it back', st == [1, True] and f_[0][2] >= 5 and (await F()) == [[1, 'F48', 4, False], [2, 'F72', 4, False]] and await Lk() == 6, (st, f_, await F(), await Lk()))
        la0 = await pg.evaluate("__polecam.S.meta[__polecam.S.project].linksAt")
        await pg.click('#rtCables'); await W(pg, 400); await pg.click('#rbFibers [data-cc="cont"][data-n="1"]'); await W(pg, 400); await pg.click('#rtCancel'); await W(pg, 400)
        la1 = await pg.evaluate("__polecam.S.meta[__polecam.S.project].linksAt"); tt = await pg.evaluate("document.getElementById('toast').textContent")
        check('G2. Continue, then ✕ with nothing changed: nothing saved (the route\'s time unchanged)', la0 == la1 and 'nothing changed' in tt, (la0, la1, tt))
        await pg.click('#rtNewCab'); await W(pg, 300); await pg.click('#rtPop [data-ncab="L12"]'); await W(pg, 200); await pg.check('#rtPop input[value="cap"]'); await pg.click('#rtSheetStart'); await W(pg, 800)
        fp = await FP(); fp = [[n, c, [kof.get(x, x) for x in path]] for n, c, path in fp]
        check('H1. Follow the capture order (Light 12C): RUN 3 along the poles not yet on a cable (CC-7760 → CC-7810 → CC-7820: within the 120 m gap)', fp[:2] == [[1, 'F48', ['T', 'P1', 'P2', 'P3']], [2, 'F72', ['P3', 'P4', 'P5', 'P6']]] and fp[2:] == [[3, 'L12', ['P6', 'B1', 'B2']]] and await Lk() == 8, fp)
        await pg.click('#rtNewCab'); await W(pg, 300); await pg.click('#rtSheetStart'); await W(pg, 300); n_open = len(await F())
        await pg.click('#rtBar [data-rt="tools"]'); await W(pg, 400); await pg.click('#rbDone'); await W(pg, 600)
        check('E5. a new cable started with no points, then Done (⋯ → Done): not kept', n_open == 4 and len(await F()) == 3, (n_open, await F()))
        # an older project: its spans on no cable become cables, once
        await common.newproj(pg, 'survey', 'MIG_TEST', purpose='As-plan'); await close_sheets(pg)
        LK = [['T', 'P1', 'F72'], ['P1', 'P2', 'F72'], ['P2', 'P3', 'F72'], ['P3', 'P4', 'L12'], ['P4', 'P5', 'L12'], ['P5', 'B1', 'L12'], ['B1', 'B2', 'L12'], ['P5', 'P6', 'L12']]
        ids2 = await pg.evaluate(ADD, ['MIG_TEST', recs(), LK, None]); kof2 = {v: k for k, v in ids2.items()}
        await pg.evaluate("() => { const S = __polecam.S; delete S.meta.MIG_TEST.cables24; S.project = 'ROUTE_TEST'; __polecam.renderPoles(); S.project = 'MIG_TEST'; __polecam.renderPoles(); }"); await W(pg, 1500)
        fp = [[n, c, [kof2.get(x, x) for x in path]] for n, c, path in await FP()]
        flag = await pg.evaluate("() => __polecam.S.meta.MIG_TEST.cables24")
        check('I1. an older project opened: its spans become cables: RUN 1 72C tower → CC-7730, then 12C split at CC-7750 (a junction): RUN 2 → CC-7750, RUN 3 → CC-7760, RUN 4 → CC-7820',
              fp == [[1, 'F72', ['T', 'P1', 'P2', 'P3']], [2, 'L12', ['P3', 'P4', 'P5']], [3, 'L12', ['P5', 'P6']], [4, 'L12', ['P5', 'B1', 'B2']]] and flag is True, (fp, flag))
        await pg.evaluate("() => { const S = __polecam.S; S.project = 'ROUTE_TEST'; __polecam.renderPoles(); S.project = 'MIG_TEST'; __polecam.renderPoles(); }"); await W(pg, 1200)
        check('I2. opened again: nothing more made', len(await FP()) == 4, len(await FP()))
        b = await pg.evaluate("(id) => __polecam.points.find((x) => x.id === id).boq", ids2['P3'])
        check('I3. its closure (no size) takes 72C on opening', b.get('clo') == '72C' and b.get('cloAuto') is True, b)
        await common.newproj(pg, 'survey', 'RING_TEST', purpose='As-plan'); await close_sheets(pg)
        ids4 = await pg.evaluate(ADD, ['RING_TEST', recs(), [['T', 'P1', 'L12'], ['P1', 'P2', 'L12'], ['P2', 'B1', 'L12'], ['B1', 'P1', 'L12']], None]); kof4 = {v: k for k, v in ids4.items()}
        await pg.evaluate("() => { const S = __polecam.S; delete S.meta.RING_TEST.cables24; S.project = 'ROUTE_TEST'; __polecam.renderPoles(); S.project = 'RING_TEST'; __polecam.renderPoles(); }"); await W(pg, 1200)
        fp = [[n, c, [kof4.get(x, x) for x in path]] for n, c, path in await FP()]
        check('I4. a stretch that comes back to the junction it left (CC-7710 → CC-7720 → CC-7810 → CC-7710): no RUN passes a pole twice; every span on a RUN once', all(len(p) == len(set(p)) for _, _, p in fp) and sorted(tuple(sorted(x)) for _, _, p in fp for x in zip(p, p[1:])) == sorted([('P1', 'T'), ('P1', 'P2'), ('B1', 'P2'), ('B1', 'P1')]), fp)
        await common.newproj(pg, 'survey', 'APMIG_TEST', purpose='As-plan'); await close_sheets(pg)
        await pg.evaluate(ADD, ['APMIG_TEST', recs(), [['T', 'P1', 'L12'], ['P1', 'P2', 'L12']], None])
        await pg.evaluate("() => { const S = __polecam.S; delete S.meta.APMIG_TEST.cables24; S.meta.APMIG_TEST.approval = { at: '2026-11-06T01:00:00Z', by: 'Juan Dela Cruz' }; S.project = 'ROUTE_TEST'; __polecam.renderPoles(); S.project = 'APMIG_TEST'; __polecam.renderPoles(); }"); await W(pg, 1200)
        m = await pg.evaluate("() => { const m = __polecam.S.meta.APMIG_TEST; return [(m.fibers || []).length, !!m.cables24, !!m.approval]; }")
        check('J2. an approved older project opened: its spans are left as they are (no cables made), the approval stays', m == [0, False, True], m)
        # an approved project: not changed on opening
        await common.newproj(pg, 'survey', 'APPR_TEST', purpose='As-plan'); await close_sheets(pg)
        ids3 = await pg.evaluate(ADD, ['APPR_TEST', recs(), [], None])
        F3 = [{'n': 1, 'cab': 'F144', 'side': 'auto', 'ex': False, 'path': [ids3[k] for k in ['T', 'P1', 'P2', 'P3']], 'fromSt': '', 'toSt': ''}]
        await pg.evaluate("([F, L]) => { const S = __polecam.S; S.meta.APPR_TEST = { ...S.meta.APPR_TEST, fibers: F, links: L, approval: { at: '2026-11-06T01:00:00Z', by: 'Juan Dela Cruz' } }; S.project = 'ROUTE_TEST'; __polecam.renderPoles(); S.project = 'APPR_TEST'; __polecam.renderPoles(); }", [F3, [[ids3['T'], ids3['P1'], 'F144'], [ids3['P1'], ids3['P2'], 'F144'], [ids3['P2'], ids3['P3'], 'F144']]]); await W(pg, 1200)
        b = await pg.evaluate("(id) => __polecam.points.find((x) => x.id === id).boq", ids3['P3'])
        ap = await pg.evaluate("() => !!__polecam.S.meta.APPR_TEST.approval")
        check('J1. an approved project opened: its closure with no size is left as it is, the approval stays', not b.get('clo') and ap, (b, ap))
        await common.newproj(pg, 'survey', 'LOOPS_TEST', purpose='As-plan'); await close_sheets(pg)
        R5 = [{'k': f'L{i}', 'poleId': f'CC-79{i:02d}', 'poleType': 'Concrete', 'lat': ll(i * 40, 0)[0], 'lon': ll(i * 40, 0)[1], 'element': 'Pole', 'status': 'Existing', 'boq': {'owner': 'Electric'}} for i in range(13)]
        ids5 = await pg.evaluate(ADD, ['LOOPS_TEST', R5, [[f'L{i}', f'L{i + 1}', 'F24'] for i in range(12)], [{'n': 1, 'cab': 'F24', 'side': 'auto', 'ex': False, 'path': [f'L{i}' for i in range(13)], 'fromSt': '', 'toSt': ''}]]); kof5 = {v: k for k, v in ids5.items()}
        al = sorted(kof5.get(x[0] if isinstance(x, list) else x, str(x)) for x in await pg.evaluate("__polecam.autoLoops()"))
        check('K2. the app\'s loops along a figure 8 24C cable, as along a 72C (every 250–300 m): one at 280 m (CC-7907)', al == ['L7'], al)
        # RUN n in the texts
        tut = await pg.evaluate("() => fetch('tutorial.js').then((r) => r.text()).then((x) => { const i = x.indexOf(\"id: 'route'\"); return i < 0 ? '' : x.slice(i, x.indexOf('] },', i)); })")
        check('K1. the tutorial: ＋ New cable, the type first, ✓ Finish never extends, ✕ Cancel, Continue, More, Follow the capture order', all(w in tut for w in ['New cable', 'type first', 'never goes on with it', 'Cancel', 'Continue', 'More', 'Follow the capture order']), tut[:200])
        print('errors', errs[:4]); check('L1. no page errors', not errs, errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
