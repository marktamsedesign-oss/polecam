"""(v2.42.28 copy: the row says "Working on" beside its name; ⋯ starts with Open this project.)
v2.42.27 (synthetic data only): the form's map that stays small until tapped; a pole found in Records stays ringed on the map;
 the arm square to the cable at a street corner; on a computer: keys move the map, Esc closes the pole form, the Projects pane
 (sort, group, show on the map, ⋯ menu, + New, another project's pole lit in the pane).
 Three made-up projects that meet: SAMPLE_STREET_A (v2.42.26's made-up street of 46 poles with a tower and an ODF), RIVERSIDE_B
 (10 poles (CC-9000 to CC-9009) going on east from its end) and HILLTOP_C (6 poles south of its 10th pole, completed). The arm: a made-up corner drawn
 by the builder in Node (the local test template), v2.42.26 beside v2.42.27."""
import asyncio, sys, os, json, math, subprocess, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v24226/t24226a.py').read().split('\nasync def main():')[0].replace("S + '/v24226/out_a'", "S + '/v24228/out_227v28'").replace("/v24226/out_a", "/v24228/out_227v28")
exec(compile(src, 't24226a_head', 'exec'))  # common, check, W, close_sheets, new_ctx, setup, ADD, recs, LINKS, FIB, ll, xy, N, ezdxf
APPDIR = os.environ.get('APPDIR', APP)
OLD = PRIV + '/old/v2.42.26/dxftpl.js'  # v2.42.26, for the before
ARM = PRIV + '/arm'
SEED = PRIV + '/template/seed.dxf'

def recsB():
    x0, y0 = xy(N - 1)
    return [{'k': f'B{i}', 'poleId': f'CC-9{i:03d}', 'poleType': 'Concrete', 'lat': ll(x0 + 40 * (i + 1), y0)[0], 'lon': ll(x0 + 40 * (i + 1), y0)[1], 'element': 'Pole', 'status': 'Existing', 'boq': {}, 'x': {}} for i in range(10)]
def recsC():
    x0, y0 = xy(9)
    return [{'k': f'C{i}', 'poleId': f'CC-8{i:03d}', 'poleType': 'Concrete', 'lat': ll(x0 + 6, y0 - 30 * (i + 1))[0], 'lon': ll(x0 + 6, y0 - 30 * (i + 1))[1], 'element': 'Pole', 'status': 'Existing', 'boq': {}, 'x': {}} for i in range(6)]
def chain(ks, cab='F72'):
    return [[a, b, cab] for a, b in zip(ks, ks[1:])], [{'n': 1, 'cab': cab, 'side': 'auto', 'ex': False, 'path': ks, 'fromSt': '', 'toSt': ''}]

def arm_rot(lib, script, env):
    o = S + '/v24228/out_227v28/arm.dxf'
    subprocess.run(['node', f'{ARM}/{script}', lib, SEED, o], check=True, capture_output=True, env={**os.environ, **env})
    doc = ezdxf.readfile(o); ins = [e for e in doc.modelspace().query('INSERT') if 'ARM' in e.dxf.layer.upper()]
    return round(ins[-1].dxf.rotation, 1), (round(ins[-1].dxf.insert.x, 1), round(ins[-1].dxf.insert.y, 1))  # the last: the pole's (the others: the template's legend)

ROWS = "() => [...document.querySelectorAll('#ppRows > *')].map((r) => r.classList.contains('pp-grp') ? '# ' + r.textContent : r.dataset.name)"
async def main():
    os.makedirs(S + '/v24228/out_227v28', exist_ok=True)
    # ---- the arm (Node, no browser)
    ds = [(2, 7), (3, 7), (6, 7), (8, 9), (20, 7), (40, 7)]  # (along from the cross street, out from the main street's centre line), m
    new = [arm_rot(f'{APPDIR}/dxftpl.js', 'arm_corner.cjs', {'OFF': str(-o), 'SS': str(-d)})[0] for d, o in ds]
    old = [arm_rot(OLD, 'arm_corner.cjs', {'OFF': str(-o), 'SS': str(-d)})[0] for d, o in ds]
    # the street runs at -55°: an arm square to it is turned 125° here (the block points down); along it, 35°
    check('A1. a proposed pole with an arm at a street corner, 2 to 40 m from the cross street: the arm square to the cable (v2.42.26: along it within 8 m)',
          new == [125.0] * 6 and old[:4] == [35.0] * 4 and old[4:] == [125.0, 125.0], {'v2.42.27': new, 'v2.42.26': old})
    tn = [arm_rot(f'{APPDIR}/dxftpl.js', 'arm_turn.cjs', {'TURN': '1', 'OFF': '-7', 'SS': str(-d)}) for d in (6, 9)]
    to = [arm_rot(OLD, 'arm_turn.cjs', {'TURN': '1', 'OFF': '-7', 'SS': str(-d)}) for d in (6, 9)]
    st_n = arm_rot(f'{APPDIR}/dxftpl.js', 'arm_corner.cjs', {'OFF': '-7', 'SS': '-40'}); st_o = arm_rot(OLD, 'arm_corner.cjs', {'OFF': '-7', 'SS': '-40'})
    check('A2. a route that turns at the corner, and a pole far from it: drawn as in v2.42.26 (the same angle and place)', tn == to and st_n == st_o, (tn, to, st_n, st_o))
    cr_n = arm_rot(f'{APPDIR}/dxftpl.js', 'arm_cross.cjs', {'OFF': '-7'}); cr_o = arm_rot(OLD, 'arm_cross.cjs', {'OFF': '-7'})
    check('A3. a cable crossing its street at a pole, another street running the same way 20 m off: the pole keeps its own street (as v2.42.26)', cr_n == cr_o, (cr_n, cr_o))

    async with async_playwright() as p:
        ctx, pg, errs = await new_ctx(p, OUT + '/ud', 1280); await setup(pg, 'Juan Dela Cruz', 'juan.delacruz@example.com')
        await pg.set_viewport_size({'width': 1280, 'height': 860})
        await common.newproj(pg, 'survey', 'SAMPLE_STREET_A', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['SAMPLE_STREET_A', recs(), LINKS, FIB])
        await common.newproj(pg, 'survey', 'RIVERSIDE_B', purpose='As-plan'); await close_sheets(pg)
        lb, fb = chain([f'B{i}' for i in range(10)]); idsB = await pg.evaluate(ADD, ['RIVERSIDE_B', recsB(), lb, fb])
        await common.newproj(pg, 'survey', 'HILLTOP_C', purpose='As-plan'); await close_sheets(pg)
        lc, fc = chain([f'C{i}' for i in range(6)]); idsC = await pg.evaluate(ADD, ['HILLTOP_C', recsC(), lc, fc])
        await pg.evaluate("""() => { const P = __polecam;
          const at = { SAMPLE_STREET_A: '2026-11-07T10:00:00.000Z', RIVERSIDE_B: '2026-11-05T10:00:00.000Z', HILLTOP_C: '2026-10-20T10:00:00.000Z' };
          P.points.forEach((x) => { if (at[x.project]) { x.updated = at[x.project]; x.created = at[x.project]; } });
          P.S.meta.SAMPLE_STREET_A.territory = 'T3'; P.S.meta.RIVERSIDE_B.territory = 'Territory 3'; P.S.meta.HILLTOP_C.territory = 'T5';
          P.S.meta.HILLTOP_C.completedAt = '2026-10-21'; for (const k of ['SAMPLE_STREET_A', 'RIVERSIDE_B', 'HILLTOP_C']) { P.S.meta[k].linksAt = at[k]; }
          P.S.project = 'SAMPLE_STREET_A'; P.persist(); P.renderPoles(); }""")
        await W(pg, 800)
        # ---- the Projects pane (a computer: 1280 px, a mouse)
        lay = await pg.evaluate("() => ({ on: __polecam.paneOn(), w: document.getElementById('projPane').offsetWidth, left: Math.round(document.getElementById('map').getBoundingClientRect().left), rows: [...document.querySelectorAll('#ppRows .pp-row')].map((r) => [r.dataset.name, r.querySelector('input').checked, r.querySelector('input').disabled, r.textContent]) })")
        check('P1. on a computer the Projects pane is at the left of the map (292 px), newest edit first; the project you work on ticked for good ("Working on"); the completed one marked',
              lay['on'] and lay['w'] == 292 and lay['left'] == 292 and [r[0] for r in lay['rows']] == ['SAMPLE_STREET_A', 'RIVERSIDE_B', 'HILLTOP_C'] and lay['rows'][0][1:3] == [True, True] and 'Working on' in lay['rows'][0][3]
              and '✓ Complete' in lay['rows'][2][3] and 'Edited' in lay['rows'][1][3] and not lay['rows'][1][2], lay)
        async def pick(kind, v):  # the Sort and Group icons: a small menu each
            await pg.click(f'#pp{kind}Btn'); await W(pg, 150); await pg.click(f'#ppMenu button[data-v="{v}"]'); await W(pg, 150)
        await pg.click('#ppSortBtn'); await W(pg, 150); sm = await pg.evaluate("() => [...document.querySelectorAll('#ppMenu button')].map((b) => (b.getAttribute('aria-checked') === 'true' ? '✓ ' : '') + b.textContent)"); await pg.keyboard.press('Escape'); await W(pg, 100)
        so = {}
        for v in ('old', 'name'): await pick('Sort', v); so[v] = await pg.evaluate(ROWS)
        await pick('Sort', 'new'); gr = {}
        for v in ('terr', 'cat'): await pick('Group', v); gr[v] = await pg.evaluate(ROWS)
        await pick('Group', 'terr'); await pick('Sort', 'old')
        ic = await pg.evaluate("() => [document.getElementById('ppSortBtn').title, document.getElementById('ppGroupBtn').title, document.getElementById('ppSortBtn').classList.contains('set'), document.getElementById('ppGroupBtn').classList.contains('set')]")
        await pg.evaluate("() => __polecam.renderPoles()"); await W(pg, 200)  # drawn again: from what is kept
        kept = await pg.evaluate("() => { const t = JSON.parse(localStorage.getItem('polecam.settings') || '{}').pane || {}; return [t.sort, t.group]; }"); kr = await pg.evaluate(ROWS)
        check('P2. the Sort and Group icons, each a small menu: sort by oldest edit first, name; group by territory (T3 from "Territory 3" too, T5), category; a dot on an icon not at its default; kept (saved in the settings)',
              so['old'] == ['HILLTOP_C', 'RIVERSIDE_B', 'SAMPLE_STREET_A'] and so['name'] == ['HILLTOP_C', 'RIVERSIDE_B', 'SAMPLE_STREET_A']
              and gr['terr'] == ['# T3 · 2', 'SAMPLE_STREET_A', 'RIVERSIDE_B', '# T5 · 1', 'HILLTOP_C'] and gr['cat'] == ['# SURVEY · 3', 'SAMPLE_STREET_A', 'RIVERSIDE_B', 'HILLTOP_C']
              and kept == ['old', 'terr'] and ic == ['Sort: Last edit, oldest first', 'Group: Territory', True, True] and sm == ['✓ Last edit, newest first', 'Last edit, oldest first', 'Name, A to Z'] and kr == ['# T3 · 2', 'RIVERSIDE_B', 'SAMPLE_STREET_A', '# T5 · 1', 'HILLTOP_C'], (sm, so, gr, kept, ic, kr))
        await pg.click('#ppRows .pp-grp:text-is("T3 · 2")'); await W(pg, 150); f1 = await pg.evaluate(ROWS)
        fs = await pg.evaluate("() => (JSON.parse(localStorage.getItem('polecam.settings') || '{}').pane || {}).fold")
        ex1 = await pg.evaluate("() => [...document.querySelectorAll('#ppRows .pp-grp')].map((b) => b.getAttribute('aria-expanded'))")
        await pg.click('#ppRows .pp-grp:text-is("T3 · 2")'); await W(pg, 150); f2 = await pg.evaluate(ROWS)
        ex2 = await pg.evaluate("() => [...document.querySelectorAll('#ppRows .pp-grp')].map((b) => b.getAttribute('aria-expanded'))")
        check('P2b. a group\'s heading folds it (its projects hidden; kept in the settings) and unfolds it', f1 == ['# T3 · 2', '# T5 · 1', 'HILLTOP_C'] and fs == {'terr:T3': True} and ex1 == ['false', 'true'] and f2 == kr and ex2 == ['true', 'true'], (f1, fs, ex1, f2, ex2))
        await pick('Sort', 'new'); await pick('Group', '')
        # a name: the map goes there, the project stays the same, it is shown on the map
        await pg.click('#ppRows .pp-row[data-name="RIVERSIDE_B"] .pp-name'); await W(pg, 1200)
        r3 = await pg.evaluate("() => { const P = __polecam, b = P.map.getBounds(), pts = P.points.filter((x) => x.project === 'RIVERSIDE_B'); return { proj: P.S.project, inView: pts.every((x) => b.contains([x.lat, x.lon])), shown: !!P.S.pane.show.RIVERSIDE_B, n: P.otherN() }; }")
        check('P3. a project\'s name: the map shows all of it, faded on the map (ticked); the project you work on stays the same', r3['proj'] == 'SAMPLE_STREET_A' and r3['inView'] and r3['shown'] and r3['n'] >= 19, r3)
        await pg.uncheck('#ppRows .pp-row[data-name="RIVERSIDE_B"] input'); await W(pg, 200); n0 = await pg.evaluate("__polecam.otherN()")
        await pg.click('#ppRows .pp-row[data-name="HILLTOP_C"] .pp-name'); await W(pg, 1200); n1 = await pg.evaluate("__polecam.otherN()")
        # another project's pole: a click shows its ID, its project lit in the pane; Esc closes it
        c2 = await pg.evaluate("() => { const x = __polecam.points.find((q) => q.poleId === 'CC-8002'); return __polecam.mapPt(x.lat, x.lon); }")
        await pg.mouse.click(c2[0], c2[1]); await W(pg, 400)
        pop = await pg.evaluate("() => { const e = document.querySelector('.leaflet-popup.pp-pop'); return [e ? e.innerText.replace(/\\s+/g, ' ') : '', [...document.querySelectorAll('#ppRows .pp-row.lit')].map((r) => r.dataset.name), document.getElementById('editor').hidden]; }")
        await pg.keyboard.press('Escape'); await W(pg, 300)
        pop2 = await pg.evaluate("() => [!!document.querySelector('.leaflet-popup.pp-pop'), document.querySelectorAll('#ppRows .pp-row.lit').length]")
        check('P4. untick: gone from the map; a name ticks it again; a click on its pole: its ID and project (and Open this project), the project lit in the pane (no form); Esc closes it',
              n0 == 0 and n1 >= 11 and pop[0] == 'CC-8002 HILLTOP_C Open this project' and pop[1] == ['HILLTOP_C'] and pop[2] and pop2 == [False, 0], (n0, n1, pop, pop2))
        # « closes it to a strip, kept after a reload
        await pg.click('#ppTog'); await W(pg, 400)
        cl = await pg.evaluate("() => [document.body.classList.contains('pp-closed'), document.getElementById('projPane').offsetWidth, Math.round(document.getElementById('map').getBoundingClientRect().left), document.getElementById('ppTog').textContent]")
        cl2 = await pg.evaluate("() => [(JSON.parse(localStorage.getItem('polecam.settings') || '{}').pane || {}).open, document.getElementById('projPane').offsetWidth]")
        await pg.click('#ppTog'); await W(pg, 400); cl3 = await pg.evaluate("() => document.getElementById('projPane').offsetWidth")
        check('P5. « closes the pane to a 48 px strip (the map wider), » opens it; kept in the settings', cl == [True, 48, 48, '»'] and cl2 == [False, 48] and cl3 == 292, (cl, cl2, cl3))
        # ⋯: its items; Esc closes it; Mark complete works on that project (it is opened first) and asks; Esc answers Cancel / OK
        await pg.click('#ppRows .pp-row[data-name="RIVERSIDE_B"] .pp-more'); await W(pg, 200)
        items = await pg.evaluate("() => [...document.querySelectorAll('#ppMenu button')].map((b) => b.textContent)")
        await pg.keyboard.press('Escape'); await W(pg, 150); mh = await pg.evaluate("document.getElementById('ppMenu').hidden")
        await pg.click('#ppRows .pp-row[data-name="RIVERSIDE_B"] .pp-more'); await W(pg, 150); await pg.click('#ppMenu button:text-is("Mark complete…")'); await W(pg, 700)
        mc = await pg.evaluate("() => [__polecam.S.project, !document.getElementById('askBox').hidden, document.getElementById('askTitle').textContent]")
        await pg.keyboard.press('Escape'); await W(pg, 300); mc2 = await pg.evaluate("() => [document.getElementById('askBox').hidden, !!__polecam.S.meta.RIVERSIDE_B.completedAt]")
        check('P6. ⋯: Open this project, Zoom to the project, Share, Export DXF, Mark complete, Delete; Esc closes it. Mark complete opens that project and asks as in Projects; Esc: cancelled',
              items == ['Open this project', 'Zoom to the project', 'Share…', 'Export DXF…', 'Mark complete…', 'Delete…'] and mh and mc[0] == 'RIVERSIDE_B' and mc[1] and mc[2] in ('Mark the task complete?', 'Not ready to complete') and mc2 == [True, False], (items, mh, mc, mc2))
        await pg.evaluate("() => { __polecam.S.project = 'SAMPLE_STREET_A'; __polecam.persist(); __polecam.renderPoles(); }"); await W(pg, 500)
        await pg.click('#ppNew'); await W(pg, 500); npv = await pg.evaluate("!document.getElementById('newProj').hidden"); await close_sheets(pg)
        # ---- keys on the main map
        await pg.evaluate("() => __polecam.mapView(7.0921, 125.6045 + 0.004, 17)"); await W(pg, 500)
        await pg.mouse.click(900, 300); await W(pg, 200); await close_sheets(pg)
        if not await pg.evaluate("document.getElementById('editor').hidden"): await close_sheets(pg)
        async def moved(key):
            c0 = await pg.evaluate("() => { const c = __polecam.map.getCenter(); return [c.lat, c.lng]; }")
            await pg.keyboard.press(key); await W(pg, 450)
            return await pg.evaluate("(c) => { const p = __polecam.map.latLngToContainerPoint(c), z = __polecam.map.getSize(); return [Math.round((z.x / 2 - p.x) / z.x * 100), Math.round((z.y / 2 - p.y) / z.y * 100)]; }", c0)
        mv = {k: await moved(k) for k in ('ArrowRight', 'a', 'w', 'ArrowDown', 'Shift+D')}
        z0 = await pg.evaluate("__polecam.map.getZoom()"); zz = []
        for k in ('e', 'q', '+', '-'): await pg.keyboard.press(k); await W(pg, 450); zz.append(await pg.evaluate("__polecam.map.getZoom()") - z0)
        check('K1. arrows and W A S D move the map a quarter of the screen (Shift: half); E and + zoom in, Q and − out',
              mv == {'ArrowRight': [25, 0], 'a': [-25, 0], 'w': [0, -25], 'ArrowDown': [0, 25], 'Shift+D': [50, 0]} and zz == [1, 0, 1, 0], (mv, zz))
        c0 = await pg.evaluate("() => { const c = __polecam.map.getCenter(); return [c.lat, c.lng]; }")
        await pg.click('#ppQ'); await pg.keyboard.type('wasd'); await W(pg, 300); typed = await pg.input_value('#ppQ'); await pg.fill('#ppQ', ''); await W(pg, 100)
        await pg.click('#mapSummary'); await W(pg, 500); await pg.keyboard.press('ArrowRight'); await W(pg, 400); await close_sheets(pg)
        c1 = await pg.evaluate("() => { const c = __polecam.map.getCenter(); return [c.lat, c.lng]; }")
        check('K2. not while typing in a field (the search got "wasd"), nor with a screen open over the map (Records)', typed == 'wasd' and abs(c1[0] - c0[0]) < 1e-9 and abs(c1[1] - c0[1]) < 1e-9, (typed, c0, c1))
        # the Drawing screen
        await pg.click('#drawBtn'); await W(pg, 1500); v0 = await pg.evaluate("__polecam.drwView()")
        await pg.keyboard.press('ArrowRight'); await W(pg, 150); v1 = await pg.evaluate("__polecam.drwView()")
        await pg.keyboard.press('e'); await W(pg, 150); v2 = await pg.evaluate("__polecam.drwView()")
        await close_sheets(pg)
        check('K3. on the Drawing screen too: → a quarter of it to the right, E zooms in', v0 and abs((v1['cx'] - v0['cx']) * v0['sc'] - v0['w'] * 0.25) < 0.5 and abs(v2['sc'] / v1['sc'] - 1.25) < 1e-6, (v0, v1, v2))
        # ---- Esc on the pole form
        await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids['P5']); await W(pg, 1200)
        await pg.keyboard.press('Escape'); await W(pg, 600); e1 = await pg.evaluate("document.getElementById('editor').hidden")
        await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids['P5']); await W(pg, 1200)
        await pg.fill('#poleId', '6105'); await W(pg, 200)
        await pg.keyboard.press('Escape'); await W(pg, 400); e2 = await pg.evaluate("() => [!document.getElementById('askBox').hidden, document.getElementById('askTitle').textContent]")
        await pg.keyboard.press('Escape'); await W(pg, 400); e3 = await pg.evaluate("() => [document.getElementById('askBox').hidden, !document.getElementById('editor').hidden]")
        await pg.keyboard.press('Escape'); await W(pg, 400); await pg.click('#askBox button:text-is("Discard the changes")'); await W(pg, 700)
        e4 = await pg.evaluate("(id) => [document.getElementById('editor').hidden, (__polecam.points.find((x) => x.id === id) || {}).poleId]", ids['P5'])
        await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids['P3']); await W(pg, 1200)
        await pg.click("#edSum button.need:text-is('Owner *')"); await W(pg, 300); q1 = await pg.evaluate("!document.getElementById('edQuick').hidden")
        await pg.keyboard.press('Escape'); await W(pg, 300); q2 = await pg.evaluate("() => [document.getElementById('edQuick').hidden, !document.getElementById('editor').hidden]")
        await pg.keyboard.press('Escape'); await W(pg, 600); q3 = await pg.evaluate("document.getElementById('editor').hidden")
        check('E1. Esc closes the pole form; with a change not saved it asks first, Esc again keeps you editing; Discard leaves it as it was; Esc closes a chip\'s small sheet first',
              e1 and e2 == [True, 'Leave without saving the changes?'] and e3 == [True, True] and e4 == [True, 'CC-6005'] and q1 and q2 == [True, True] and q3, (e1, e2, e3, e4, q1, q2, q3))
        # Esc never takes a guess: the Unsaved record question (Discard / Open it) stays; Cancel / OK: Cancel; one button: that one
        await pg.evaluate("() => { window.__r = 'pending'; __polecam.ask('Unsaved record', 'A test question', [{ label: 'Discard', value: false }, { label: 'Open it', value: true, primary: true }]).then((v) => { window.__r = v; }); }"); await W(pg, 200)
        await pg.keyboard.press('Escape'); await W(pg, 200); q1 = await pg.evaluate("() => [!document.getElementById('askBox').hidden, window.__r]")
        await pg.click('#askBox button:text-is("Open it")'); await W(pg, 200); q2 = await pg.evaluate("window.__r")
        await pg.evaluate("() => { window.__r = 'pending'; __polecam.ask('A question', 'Go on?').then((v) => { window.__r = v; }); }"); await W(pg, 200); await pg.keyboard.press('Escape'); await W(pg, 200); q3 = await pg.evaluate("() => [document.getElementById('askBox').hidden, window.__r]")
        await pg.evaluate("() => { window.__r = 'pending'; __polecam.ask('Done', 'Saved.', [{ label: 'OK', value: 1, primary: true }]).then((v) => { window.__r = v; }); }"); await W(pg, 200); await pg.keyboard.press('Escape'); await W(pg, 200); q4 = await pg.evaluate("() => [document.getElementById('askBox').hidden, window.__r]")
        check('E2. Esc on a question: never Discard (Discard / Open it stays open); Cancel / OK: Cancel; a single OK: OK', q1 == [True, 'pending'] and q2 is True and q3 == [True, False] and q4 == [True, 1], (q1, q2, q3, q4))
        # Esc with a box over the form (Pole owner → Other…): the box and the form stay
        await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids['P5']); await W(pg, 1200); await pg.evaluate("__polecam.edTab('details')"); await W(pg, 300)
        await pg.click("#editor .chips[data-k=owner] button:has-text('Other')"); await W(pg, 400)
        await pg.keyboard.press('Escape'); await W(pg, 400); b1 = await pg.evaluate("() => [!document.getElementById('promptBox').hidden, !document.getElementById('editor').hidden]")
        await pg.click('#promptBox button:has-text("Cancel")'); await W(pg, 300); await pg.keyboard.press('Escape'); await W(pg, 600)
        b2 = await pg.evaluate("() => [document.getElementById('promptBox').hidden, document.getElementById('editor').hidden, !document.getElementById('askBox').hidden]")
        if b2[2]: await pg.click('#askBox button:text-is("Discard the changes")'); await W(pg, 500)
        check('E3. Esc while a box is open over the form (Pole owner → Other…): the box and the form stay; after it, Esc closes the form', b1 == [True, True] and b2[0] and (b2[1] or b2[2]), (b1, b2))
        # a tick in the pane is not typing: the keys go on moving the map
        await pg.check('#ppRows .pp-row[data-name="RIVERSIDE_B"] input'); await W(pg, 200)
        c0 = await pg.evaluate("() => { const c = __polecam.map.getCenter(); return [c.lat, c.lng]; }"); await pg.keyboard.press('ArrowRight'); await W(pg, 450)
        k4 = await pg.evaluate("(c) => { const p = __polecam.map.latLngToContainerPoint(c), z = __polecam.map.getSize(); return Math.round((z.x / 2 - p.x) / z.x * 100); }", c0)
        check('K4. after a tick in the pane (the focus on the tick box), the arrow keys still move the map', k4 == 25, k4)
        check('P7. + New opens the New project form', npv, npv)
        # Delete… from the pane (asks as in Projects)
        await pg.click('#ppRows .pp-row[data-name="RIVERSIDE_B"] .pp-more'); await W(pg, 150); await pg.click('#ppMenu button:text-is("Delete…")'); await W(pg, 500)
        dq = await pg.evaluate("document.getElementById('askTitle').textContent"); await pg.click('#askBox button:text-is("Delete project")'); await W(pg, 1500)
        dl = await pg.evaluate(ROWS)
        check('P8. Delete… asks first, as in Projects; then the project is gone from the pane', dq == 'Delete “RIVERSIDE_B”?' and dl == ['SAMPLE_STREET_A', 'HILLTOP_C'], (dq, dl))

        # ---- a phone: no pane; Records: the map to the pole, ringed
        await pg.set_viewport_size({'width': 412, 'height': 763}); await W(pg, 800)
        ph = await pg.evaluate("() => [__polecam.paneOn(), getComputedStyle(document.getElementById('projPane')).display, Math.round(document.getElementById('map').getBoundingClientRect().left)]")
        check('P9. a phone (412 px): no pane; the map as before', ph == [False, 'none', 0], ph)
        await pg.evaluate("() => __polecam.mapView(7.08, 125.59, 15)"); await W(pg, 500)
        await pg.click('#mapSummary'); await W(pg, 500); await pg.fill('#listSearch', 'CC-6030'); await W(pg, 500)
        await pg.click('#listItems .card'); await W(pg, 1800)
        r1 = await pg.evaluate("(id) => { const P = __polecam, x = P.points.find((q) => q.id === id), c = P.map.latLngToContainerPoint([x.lat, x.lon]), z = P.map.getSize();"
                               " return { list: document.getElementById('list').hidden, ed: !document.getElementById('editor').hidden, id: document.getElementById('poleId').value, zoom: P.map.getZoom(), off: Math.round(Math.hypot(c.x - z.x / 2, c.y - z.y / 2)), hl: P.hl() === id,"
                               " chip: document.getElementById('hlChip').hidden ? '' : document.getElementById('hlChipId').textContent, rings: document.querySelectorAll('#map .target-ring').length }; }", ids['P30'])
        check('R1. Records: a tap on CC-6030 closes the list, the map goes to it (zoom 19) and rings it, then its form opens', r1['list'] and r1['ed'] and r1['id'].endswith('6030') and r1['zoom'] >= 19 and r1['off'] <= 3 and r1['hl'] and r1['chip'] == 'CC-6030' and r1['rings'] >= 1, r1)
        await pg.click('#edClose'); await W(pg, 700)
        r2 = await pg.evaluate("(id) => { const P = __polecam, x = P.points.find((q) => q.id === id), c = P.map.latLngToContainerPoint([x.lat, x.lon]), z = P.map.getSize(); return [document.getElementById('editor').hidden, P.hl() === id, !document.getElementById('hlChip').hidden, document.querySelectorAll('#map .target-ring').length, Math.round(Math.hypot(c.x - z.x / 2, c.y - z.y / 2))]; }", ids['P30'])
        check('R2. its form closed: on the map at that pole, still ringed, the chip at the top', r2[0] and r2[1] and r2[2] and r2[3] >= 1 and r2[4] <= 3, r2)
        await pg.click('#hlList'); await W(pg, 500); l1 = await pg.evaluate("() => [!document.getElementById('list').hidden, document.getElementById('listSearch').value, document.querySelectorAll('#listItems .card').length]")
        await close_sheets(pg)
        await pg.evaluate("() => __polecam.mapView(7.08, 125.59, 16)"); await W(pg, 400); await pg.click('#hlGo'); await W(pg, 600)
        g1 = await pg.evaluate("(id) => { const P = __polecam, x = P.points.find((q) => q.id === id), c = P.map.latLngToContainerPoint([x.lat, x.lon]), z = P.map.getSize(); return [Math.round(Math.hypot(c.x - z.x / 2, c.y - z.y / 2)), P.map.getZoom()]; }", ids['P30'])
        check('R3. the chip: List opens Records with the search still typed; its ID shows the pole again (close in)', l1[0] and l1[1] == 'CC-6030' and l1[2] == 1 and g1[0] <= 3 and g1[1] >= 18, (l1, g1))
        c9 = await pg.evaluate("(id) => { const x = __polecam.points.find((q) => q.id === id); return __polecam.mapPt(x.lat, x.lon); }", ids['P29'])
        await pg.mouse.click(c9[0], c9[1]); await W(pg, 1200)
        t1 = await pg.evaluate("() => [!document.getElementById('editor').hidden, document.getElementById('poleId').value, __polecam.hl(), document.getElementById('hlChip').hidden, document.querySelectorAll('#map .target-ring').length]")
        await close_sheets(pg)
        await pg.click('#mapSummary'); await W(pg, 400); await pg.fill('#listSearch', 'CC-6030'); await W(pg, 400); await pg.click('#listItems .card'); await W(pg, 1800); await close_sheets(pg)
        await pg.click('#hlX'); await W(pg, 300); x1 = await pg.evaluate("() => [__polecam.hl(), document.getElementById('hlChip').hidden, document.querySelectorAll('#map .target-ring').length]")
        check('R4. a tap on another pole opens it and the ring goes; ✕ stops the ring too', t1[0] and t1[1].endswith('6029') and t1[2] is None and t1[3] and t1[4] == 0 and x1 == [None, True, 0], (t1, x1))
        # ---- the form's map on a phone: small once the form has stopped, scrolled down (not under a finger); big again only on a tap
        cdp = await ctx.new_cdp_session(pg); await cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
        await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids['P5']); await W(pg, 1500)
        FM = """() => { const b = document.querySelector('#editor .edbody'), w = document.getElementById('pinMapWrap'), a = window.__anc || b.firstElementChild; // __anc: what was under the finger
          return { mini: w.classList.contains('mini'), top: Math.round(b.scrollTop), room: b.scrollHeight - b.clientHeight, anchor: Math.round(a.getBoundingClientRect().top), tr: getComputedStyle(w).transitionDuration }; }"""
        TOUCH = """(k) => { const b = document.querySelector('#editor .edbody'), t = new Touch({ identifier: 1, target: b, clientX: 200, clientY: 500 });
          b.dispatchEvent(new TouchEvent(k, { touches: k === 'touchstart' ? [t] : [], changedTouches: [t], bubbles: true, cancelable: true })); }"""
        f0 = await pg.evaluate(FM)
        await pg.evaluate(TOUCH, 'touchstart'); await pg.evaluate("document.querySelector('#editor .edbody').scrollTop = 300"); await W(pg, 200)
        await pg.evaluate("() => { window.__anc = document.elementFromPoint(200, 560); }")  # a part of the form low on the screen (not the tabs, which stay at its top)
        fa = await pg.evaluate(FM); await W(pg, 500); fb2 = await pg.evaluate(FM)
        await pg.evaluate(TOUCH, 'touchend'); await W(pg, 500); fc2 = await pg.evaluate(FM)
        check('F1. the form scrolled down: the map stays big while the finger is on it, goes small once it is lifted and the form stopped; the form does not move on the screen; no height animation',
              f0['tr'] == '0s' and not fa['mini'] and not fb2['mini'] and fc2['mini'] and abs(fc2['anchor'] - fa['anchor']) <= 2 and fc2['top'] < fa['top'], (f0, fa, fb2, fc2))
        await pg.evaluate("document.querySelector('#editor .edbody').scrollTop = 0"); await W(pg, 500)
        await pg.mouse.move(206, 500)
        for _ in range(6): await pg.mouse.wheel(0, -200); await W(pg, 120)
        await W(pg, 400); fd = await pg.evaluate(FM)
        await pg.evaluate(TOUCH, 'touchstart'); await pg.evaluate(TOUCH, 'touchend'); await W(pg, 500); fe = await pg.evaluate(FM)
        await pg.click('#pinMap', position={'x': 60, 'y': 40}); await W(pg, 400); ff = await pg.evaluate(FM)
        check('F2. back at the top, a wheel or a touch there: the map stays small; a tap on it: big again (the form at its top)', fd['mini'] and fd['top'] == 0 and fe['mini'] and not ff['mini'] and ff['top'] == 0, (fd, fe, ff))
        await pg.evaluate("__polecam.edTab('photo')"); await W(pg, 400); await pg.evaluate("document.querySelector('#editor .edbody').scrollTop = 200"); await W(pg, 600); fg = await pg.evaluate(FM)
        check('F3. a tab that would fit with the map small (Photo): the map stays big', not fg['mini'], fg)
        await pg.evaluate("__polecam.edTab('details')"); await W(pg, 300); await pg.evaluate("document.querySelector('#editor .edbody').scrollTop = 110"); await W(pg, 600); fh = await pg.evaluate(FM)
        check('F4. a short scroll (less than the height the map would give up): the map stays big, so the form never jumps', not fh['mini'] and fh['top'] == 110, fh)
        await close_sheets(pg)
        print('errors', errs[:4]); check('H1. no page errors', not [e for e in errs if 'PAGEERROR' in e], errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
