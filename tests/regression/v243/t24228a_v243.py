"""v2.42.28 (synthetic data only): What to export on the Drawing (pole owners × photo / number / both, each tick one drawing),
 Plan settings, the short DXF card (Export the plan, beside the plan on a computer), the RTA numbers of each owner's drawing equal to
 Table · CSV, and Open in the Projects pane.
 The made-up street of v2.42.26 (46 poles 40 m apart, two cables from an ODF at a made-up tower; the electric coop DLPC's poles, one pole
 with nothing answered, one proposed pole, 8 PLDT poles in a cluster beside the street)."""
import asyncio, sys, os, csv, io, re, zipfile
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v24226/t24226a.py').read().split('\nasync def main():')[0].replace("/v24226/out_a", "/v24228/out_a")
exec(compile(src, 't24226a_head', 'exec'))  # common, check, checks, W, close_sheets, export, new_ctx, setup, ADD, recs, LINKS, FIB, ll, xy, N

def readme_numbers(txt):
    """The README's numbers of each drawing: {file: [(n, id), …]}."""
    out, cur = {}, None
    for line in txt.replace('\r\n', '\n').split('\n'):
        m = re.match(r'Numbers on the plan(?: in (\S+))? \((\d+)', line)
        if m: cur = m.group(1) or '_one'; out[cur] = []; continue
        m = re.match(r'\s+(\d+)\s+(\S+)\s+', line)
        if cur and m: out[cur].append((int(m.group(1)), m.group(2))); continue
        if cur and not line.strip(): cur = None
    return out
def csv_rows(f):
    t = open(f, encoding='utf-8-sig').read(); return {r['pole_id']: r for r in csv.DictReader(io.StringIO(t))}
GRID = "() => [...document.querySelectorAll('#mxGrid .mxr .nm')].map((e) => e.textContent)"
async def tick(pg, name, mode):
    gi = await pg.evaluate("(n) => __polecam.mxGroups().findIndex((x) => x.name === n)", name)
    await pg.click(f'#mxGrid .mxc[data-g="{gi}"][data-m="{mode}"]'); await W(pg, 350)
async def plan_export(pg, name, pdf):
    await pg.click('#drawDxf'); await W(pg, 700)
    if pdf: await pg.check('#dxfPdf')
    else: await pg.uncheck('#dxfPdf')
    await W(pg, 200); await pg.click('#doDxf')
    for _ in range(2400):
        if await pg.locator('#resultBox:not([hidden])').count(): break
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
        await W(pg, 250)
    # v2.43: the list is folded into one line; open it to read the files
    inside = await pg.evaluate("(() => { const b = document.getElementById('resultInsideBox'); if (b.hidden || b.open) return null; const sum = document.getElementById('resultInsideSum').textContent; b.open = true; return sum + '\\n' + document.getElementById('resultInside').innerText; })()")
    async with pg.expect_download(timeout=180000) as d: await pg.click('#resSave')
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f); return f, inside

async def main():
    async with async_playwright() as p:
        ctx, pg, errs = await new_ctx(p, OUT + '/ud', w=1440)
        await setup(pg, 'Juan Dela Cruz', 'juan.delacruz@example.com')
        await common.newproj(pg, 'survey', 'RTA_SYN', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['RTA_SYN', recs(), LINKS, FIB]); kof = {v: k for k, v in ids.items()}
        await pg.set_viewport_size({'width': 1440, 'height': 900}); await W(pg, 600)
        # ---- What to export, on a computer: open beside the plan
        await pg.click('#drawBtn'); await W(pg, 2500)
        st = await pg.evaluate(f"""() => ({{ open: !document.getElementById('drawWhatBox').hidden, side: document.getElementById('drawing').classList.contains('whaton'), pos: getComputedStyle(document.getElementById('drawWhatBox')).position,
          names: ({GRID})(), rows: __polecam.dxfRows(), bar: document.getElementById('drawWhatV').textContent, pill: document.getElementById('drawPvT').textContent, arrows: !document.getElementById('drawPvPrev').hidden,
          gone: ['drawMarks', 'drawCT', 'drawTypesBox', 'drawRow', 'drawStyleBtn', 'dxfSets', 'dxfRowAdd', 'dxfPlanOpts'].filter((i) => document.getElementById(i)),
          wrapW: Math.round(document.getElementById('drawWrap').getBoundingClientRect().width), cvW: document.getElementById('drawCanvas').width }})""")
        check('W1. a computer: What to export sits open beside the plan; rows Every point, the pole owners (Electric, Globe, DLPC, PLDT), ODF, Sites; one drawing ticked (Every point · Photo); the old bar\'s Photos ▾, CA, All points ▾, the drawing picker and the DXF card\'s drawings are gone',
              st['open'] and st['side'] and st['pos'] == 'static' and st['names'] == ['Every point', 'Electric poles', 'Globe poles', 'DLPC poles', 'PLDT poles', 'ODF', 'Sites'] and st['rows'] == [{'pts': ['*'], 'mode': 'photo'}]
              and st['bar'] == '1 · Every point · Photo' and st['pill'] == 'Every point · Photo' and not st['arrows'] and not st['gone'] and st['wrapW'] < 1100, st)
        mig = await pg.evaluate("() => { const E = __polecam.S.exp, keep = E.dxfRows; E.dxfRows = null; E.dxfSets = ['sel', 'g:PLDT:num']; E.dxfMarks = 'photo'; E.dxfNoMarkBy = {}; const r = __polecam.dxfRows(); __polecam.setWhat(true); const names = [...document.querySelectorAll('#mxGrid .mxc[aria-pressed=true]')].map((b) => b.getAttribute('aria-label')); __polecam.setDxfRows(keep, 0); __polecam.setWhat(true); return { r, names }; }")
        check('W0. the drawings set with an older G-eSAA (the Drawing\'s choice + Only PLDT · numbers) become ticks once: Every point · Photo and PLDT poles · Number',
              mig['r'] == [{'pts': ['*'], 'mode': 'photo'}, {'pts': ['PLDT'], 'mode': 'num'}] and mig['names'] == ['Every point: photos', 'PLDT poles: numbers'], mig)
        await tick(pg, 'PLDT poles', 'photo')
        ask0 = await pg.evaluate("!document.getElementById('askBox').hidden")
        await tick(pg, 'PLDT poles', 'num')
        ask1 = await pg.evaluate("!document.getElementById('askBox').hidden && [document.getElementById('askTitle').textContent, [...document.querySelectorAll('#askBox button')].map((b) => b.textContent)]")
        await pg.screenshot(path=f'{OUT}/w2_ask.png')
        await pg.locator('#askBox button.primary').click(); await W(pg, 600)
        st = await pg.evaluate("() => ({ rows: __polecam.dxfRows(), sel: __polecam.S.exp.dxfRowSel, mode: (__polecam.S.meta.RTA_SYN.nums || {}).mode, pill: document.getElementById('drawPvT').textContent, pv: [...document.querySelectorAll('#mxGrid .mxc.pv')].map((b) => b.getAttribute('aria-label')) })")
        check('W2. PLDT · Photo and PLDT · Number ticked: two drawings of PLDT\'s poles; the first Number for an owner asks once (each owner from 1, or the whole project); Each owner from 1 set; the plan shows the one ticked last',
              not ask0 and ask1 and ask1[0] == 'Number each owner’s poles from 1?' and set(ask1[1]) == {'Whole project', 'Each owner from 1'} and st['rows'] == [{'pts': ['*'], 'mode': 'photo'}, {'pts': ['PLDT'], 'mode': 'photo'}, {'pts': ['PLDT'], 'mode': 'num'}]
              and st['sel'] == 2 and st['mode'] == 'owner' and st['pill'] == '3/3PLDT poles · Number' and st['pv'] == ['PLDT poles: numbers'], (ask0, ask1, st))
        await tick(pg, 'DLPC poles', 'num')
        st = await pg.evaluate("() => ({ ask: !document.getElementById('askBox').hidden, rows: __polecam.dxfRows().map((r) => r.pts.join('+') + ':' + r.mode), sel: __polecam.S.exp.dxfRowSel, bar: document.getElementById('drawWhatV').textContent, go: document.getElementById('mxGo').textContent })")
        check('W3. a second owner\'s Number does not ask again; the drawings follow the table\'s order (DLPC before PLDT); the bar and the Export button count 4',
              not st['ask'] and st['rows'] == ['*:photo', 'ELEC:DLPC:num', 'PLDT:photo', 'PLDT:num'] and st['sel'] == 1 and st['bar'] == '4 · Every point · Photo, DLPC poles · Number +2' and st['go'] == 'Done', st)  # beta 6.7 (UX step 3): the panel's button is Done (the bar's Export plan exports)
        for _ in range(40):
            sq = await pg.evaluate("__polecam.drwSeq()")
            if sq and sq['n'] == 44: break
            await W(pg, 250)
        await pg.click('#drawPvNext'); await pg.click('#drawPvNext'); await W(pg, 400)
        for _ in range(40):
            sq2 = await pg.evaluate("__polecam.drwSeq()")
            if sq2 and sq2['n'] == 8: break
            await W(pg, 250)
        pill = await pg.evaluate("document.getElementById('drawPvT').textContent")
        check('W4. ‹ › on the plan go through the drawings: DLPC · Number numbers 44 poles 1 to 44, PLDT · Number 8 poles 1 to 8 (each owner from 1)', sq == {'n': 44, 'max': 44} and sq2 == {'n': 8, 'max': 8} and pill == '4/4PLDT poles · Number', (sq, sq2, pill))
        await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'photo' }], 0)"); await W(pg, 200); await pg.evaluate("__polecam.setWhat(true)"); await W(pg, 200)
        await tick(pg, 'Every point', 'photo')
        one = await pg.evaluate("[__polecam.dxfRows().length, document.getElementById('toast').textContent]")
        await pg.click('#mxMixGo'); await W(pg, 150); await pg.click('#mxMix .chip[data-k="PLDT"]'); await pg.click('#mxMix .chip[data-k="GT"]'); await pg.click('#mxMixAdd'); await W(pg, 300)
        names = await pg.evaluate(GRID)
        await tick(pg, 'Globe poles + PLDT poles', 'both')
        mix = await pg.evaluate("() => ({ rows: __polecam.dxfRows().map((r) => r.pts.join('+') + ':' + r.mode), combos: __polecam.S.exp.dxfCombos })")
        await pg.screenshot(path=f'{OUT}/w5_mix.png')
        gi = await pg.evaluate("__polecam.mxGroups().findIndex((x) => x.name === 'Globe poles + PLDT poles')")
        await pg.click(f'#mxGrid .del[data-del="{gi}"]'); await W(pg, 300)
        gone = await pg.evaluate(f"() => ({{ rows: __polecam.dxfRows().map((r) => r.pts.join('+') + ':' + r.mode), combos: __polecam.S.exp.dxfCombos, names: ({GRID})() }})")
        check('W5. the last drawing cannot be unticked; + Several on one drawing adds a row (Globe + PLDT poles) to tick (Both: one drawing of both owners\' poles); ✕ removes the row and its drawing',
              one[0] == 1 and 'At least one drawing' in one[1] and names[-1] == 'Globe poles + PLDT poles' and mix['rows'] == ['*:photo', 'GT+PLDT:both'] and mix['combos'] == [['GT', 'PLDT']]
              and gone['rows'] == ['*:photo'] and gone['combos'] == [] and 'Globe poles + PLDT poles' not in gone['names'], (one, names, mix, gone))
        # back to the four drawings of W3
        for nm, md in (('DLPC poles', 'num'), ('PLDT poles', 'photo'), ('PLDT poles', 'num')): await tick(pg, nm, md)
        rows4 = await pg.evaluate("__polecam.dxfRows().map((r) => r.pts.join('+') + ':' + r.mode)")
        # ---- Export the plan, beside the plan on a computer
        await pg.click('#drawDxf'); await W(pg, 800)
        await pg.evaluate("document.getElementById('dxfFilesBox').closest('details').open = true")  # beta 6.7 (UX step 3): the files are under More options
        st = await pg.evaluate("""() => { const e = document.getElementById('export'), r = e.getBoundingClientRect();
          return { cls: e.className, body: document.body.classList.contains('drwside'), title: document.getElementById('exportTitle').textContent, w: Math.round(r.width), left: Math.round(r.left),
            formats: getComputedStyle(document.getElementById('xMulti')).display, files: [...document.querySelectorAll('#dxfFiles .dxffile')].map((d) => d.innerText.replace(/\\s+/g, ' ').trim()),
            sum: document.getElementById('dxfSum').innerText, names: document.getElementById('sigLine').innerText, edit: !document.getElementById('sigEdit').hidden, btn: document.getElementById('doDxf').textContent,
            drawing: !document.getElementById('drawing').hidden, cards: [...document.querySelectorAll('#export .xcard')].filter((c) => c.offsetParent).length }; }""")
        await pg.screenshot(path=f'{OUT}/e1_export.png')
        check('E1. Export on the Drawing: Export the plan, a panel at the right of the plan (the Drawing still open); the DXF card only: the project and template, the 4 drawings, the names in one line, the PDF switch, Export 4 drawings',
              rows4 == ['*:photo', 'ELEC:DLPC:num', 'PLDT:photo', 'PLDT:num'] and 'plan' in st['cls'] and 'side' in st['cls'] and st['body'] and st['title'] == 'Export' and st['w'] >= 720 and abs(st['left'] + st['w'] - 1440) <= 1 and st['formats'] == 'none'
              and len(st['files']) == 4 and st['files'][1].startswith('2 DLPC poles 44') and 'Number' in st['files'][1] and 'RTA_SYN' in st['sum'] and '✓ On your company' in st['sum'] and 'Juan' not in st['names'] and not st['edit']
              and st['btn'] == 'Make 4 plan drawings' and st['drawing'] and st['cards'] == 1, st)  # (beta 6.7, UX step 3: Export plan; the button worded like the row) ((Plan style wide): the panel wide by default on a computer, 62 % of 1440; Narrower: 400 px)
        await pg.click('#sigChange'); await pg.fill('#sigDesign', 'Juan Dela Cruz'); await W(pg, 200); await pg.click('#sigChange'); await W(pg, 200)
        sig = await pg.evaluate("[document.getElementById('sigLine').innerText, __polecam.S.sig.design]")
        await pg.keyboard.press('Escape'); await W(pg, 500)
        esc = await pg.evaluate("[document.getElementById('export').hidden, document.body.classList.contains('drwside'), document.getElementById('export').className, !document.getElementById('drawing').hidden]")
        check('E2. Names on the sheet: Change opens the four fields, Done shows them in one line (kept); Esc closes the panel, back on the Drawing', 'Design Engineer' in sig[0] and 'Juan Dela Cruz' in sig[0] and sig[1] == 'Juan Dela Cruz' and esc == [True, False, 'sheet', True], (sig, esc))
        await pg.evaluate("__polecam.setWhat(true)"); await W(pg, 300)
        OPEN = "() => ({ h: history.length, open: [...document.querySelectorAll('section.sheet:not([hidden])')].map((x) => x.id).sort(), top: (() => { const v = [...document.querySelectorAll('section.sheet:not([hidden])')].sort((a, b) => (+getComputedStyle(b).zIndex || 0) - (+getComputedStyle(a).zIndex || 0)); return v[0] && v[0].id; })(), what: !document.getElementById('drawWhatBox').hidden, setVis: (() => { const b = document.getElementById('drawSetBtn').getBoundingClientRect(), e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!e && !!e.closest('#drawSetBtn'); })() })"
        h0 = await pg.evaluate("history.length"); await pg.click('#drawDxf'); await W(pg, 700); await pg.click('#drawDxf'); await W(pg, 700)
        e4a = await pg.evaluate(OPEN)
        await pg.click('#drawSetBtn'); await W(pg, 600); e4b = await pg.evaluate(OPEN)
        await pg.click('#drawDxf'); await W(pg, 900); e4c = await pg.evaluate(OPEN)
        check('E4. a computer: Export tapped again beside its open panel is not opened twice; Plan style stays reachable beside it (the top bar ends where the panel starts); Export from there brings Export back on top',
              e4a['open'] == ['drawing', 'export'] and e4a['top'] == 'export' and e4a['setVis'] and e4b['open'] == ['drawing', 'drwStyle', 'export'] and e4b['top'] == 'drwStyle' and e4c['open'] == ['drawing', 'export'] and e4c['top'] == 'export', (h0, e4a, e4b, e4c))  # (beta 6.7, UX step 4: Plan style, was Plan settings)
        await pg.keyboard.press('Escape'); await W(pg, 500); e5a = await pg.evaluate(OPEN)
        await pg.keyboard.press('Escape'); await W(pg, 500); e5b = await pg.evaluate(OPEN)
        check('E5. Esc closes the Export panel (What to export stays open), then What to export; the Drawing stays', e5a['open'] == ['drawing'] and e5a['what'] and e5b['open'] == ['drawing'] and not e5b['what'], (e5a, e5b))
        await pg.evaluate("__polecam.setWhat(true)"); await W(pg, 300)
        f1, inside = await plan_export(pg, 'plan4.zip', True)
        z = zipfile.ZipFile(f1); nl = z.namelist(); dx = sorted(n for n in nl if n.endswith('.dxf')); pdfs = sorted(n for n in nl if n.endswith('.pdf'))
        suf = sorted(re.sub(r'^.*_PLAN_UTM51N_', '', n) for n in dx)
        check('E3. Export 4 drawings with the PDF: one ZIP with 4 DXF (…_ALL_PHOTOS, …_DLPC_POLES_NUMBERS, …_PLDT_POLES_PHOTOS, …_PLDT_POLES_NUMBERS) and 4 PDF (…_SHEETS.pdf); the screen lists them in plain words',
              suf == ['ALL_PHOTOS.dxf', 'DLPC_POLES_NUMBERS.dxf', 'PLDT_POLES_NUMBERS.dxf', 'PLDT_POLES_PHOTOS.dxf'] and len(pdfs) == 4 and all(x.endswith('_SHEETS.pdf') for x in pdfs)
              and inside and all(re.sub(r'^.*/', '', d) in inside for d in dx) and 'PLDT poles, numbers. Open it in AutoCAD' in inside and inside.count('The sheets on A3, to print') == 4 and 'README.txt' in inside and inside.startswith("What's in the ZIP: 4 DXF · 4 PDF") and inside.split('\n')[0].endswith('README'), (suf, pdfs, (inside or '')[:400]))
        rd = readme_numbers(z.read('README.txt').decode('utf-8', 'replace'))
        await close_sheets(pg); fc = await export(pg, 'doCsv', 'table_owner.csv'); C1 = csv_rows(fc)
        pl = next((v for k, v in rd.items() if k.endswith('_PLDT_POLES_NUMBERS.dxf')), []); dl = next((v for k, v in rd.items() if k.endswith('_DLPC_POLES_NUMBERS.dxf')), [])
        okP = sorted(n for n, _ in pl) == list(range(1, 9)) and all(C1.get(i, {}).get('no') == str(n) and C1[i]['pole_owner'] == 'PLDT' for n, i in pl)
        okD = sorted(n for n, _ in dl) == list(range(1, 45)) and all(C1.get(i, {}).get('no') == str(n) and C1[i]['pole_owner'] == 'Electric' and C1[i]['pole_owner_name'] == 'DLPC' for n, i in dl)
        check('R1. RTA: each owner from 1. The PLDT drawing numbers its 8 poles 1 to 8 and the DLPC drawing its 44 poles 1 to 44; Table · CSV gives each of those poles the same number (column no), with its owner (PLDT; Electric · DLPC)',
              okP and okD, (pl[:9], dl[:4], [(i, C1.get(i, {}).get('no'), C1.get(i, {}).get('pole_owner'), C1.get(i, {}).get('pole_owner_name')) for _, i in pl[:3]]))
        # whole project: one count; the drawings and the CSV still agree
        await pg.click('#drawBtn'); await W(pg, 2000); await pg.click('#mxNumP'); await W(pg, 400)
        f2, _ = await plan_export(pg, 'plan4_project.zip', False)
        rd2 = readme_numbers(zipfile.ZipFile(f2).read('README.txt').decode('utf-8', 'replace'))
        await close_sheets(pg); fc2 = await export(pg, 'doCsv', 'table_project.csv'); C2 = csv_rows(fc2)
        al = next((v for k, v in rd2.items() if k.endswith('_ALL_PHOTOS.dxf')), []); pl2 = next((v for k, v in rd2.items() if k.endswith('_PLDT_POLES_NUMBERS.dxf')), [])
        nums = sorted(n for n, _ in al)
        check('R2. Whole project: the numbers are one count along the cable (each once) and Table · CSV has the same number for every pole of every drawing (the PLDT drawing shows their project numbers)',
              nums == list(range(1, len(nums) + 1)) and len(nums) >= 54 and all(C2.get(i, {}).get('no') == str(n) for n, i in al + pl2) and sorted(n for n, _ in pl2) != list(range(1, 9)), (nums[:5], len(nums), pl2[:3]))
        # ---- Plan style (beta 6.7, UX step 4: Plan settings and Drawing style in one screen; was P1/P2 on Plan settings)
        # (Plan style cards): the main rows (the Basic rows before) in their cards; the 7 cards and the 6 sections of More settings
        BASIC = ['Pole numbers in this project', 'Pole number colours', 'Pole labels', 'Clamp types beside each pole', '20 m loops at boxes', 'Photos on the plan', "Stamp on the plan's photos", 'BOQ table on each map sheet']
        await pg.click('#drawBtn'); await W(pg, 2000); await pg.click('#drawSetBtn'); await W(pg, 600)
        await pg.click('#stPole > summary'); await W(pg, 400)  # (Pole details and span lengths: Clamp types beside each pole)
        st = await pg.evaluate("""() => ({ cls: document.getElementById('drwStyle').className, w: Math.round(document.getElementById('drwStyle').getBoundingClientRect().width), rows: [...document.querySelectorAll('#plCards .plb[data-find]')].map((r) => r.dataset.find),
          secs: [...document.querySelectorAll('#drwStyle details.stsec')].map((d) => d.dataset.find),
          ca: document.getElementById('psCA').checked, num: document.getElementById('numProject').checked, tpl: document.getElementById('psTplSum').textContent, kind: document.getElementById('psKindSum').textContent,
          inside: ['numProject', 'pmiLoops', 'dxfTplInfo', 'dxfTplLoad', 'dxfLogoSet', 'dxfMode', 'setZone'].every((i) => document.getElementById(i).closest('#drwStyle')) })""")
        await pg.screenshot(path=f'{OUT}/p1_settings.png')
        await pg.click('label[for="psCA"]'); await W(pg, 300); ca1 = await pg.evaluate("__polecam.S.exp.dxfClampType"); await pg.click('label[for="psCA"]'); await W(pg, 200); ca2 = await pg.evaluate("__polecam.S.exp.dxfClampType")
        await pg.click('#plMore > summary'); await W(pg, 400); sty = await pg.evaluate("document.getElementById('plMore').open")
        await pg.keyboard.press('Escape'); await W(pg, 400); shut = await pg.evaluate("[document.getElementById('drwStyle').hidden, document.body.classList.contains('drwside')]")
        check('P1. Plan style (its button on the Drawing): beside the plan on a computer; the 8 main rows in their cards, 7 cards and 6 sections in More settings (template, logo, kind of drawing and zone in it); the clamp types switch; Esc closes',
              'side' in st['cls'] and st['w'] >= 720 and st['rows'] == BASIC and len(st['secs']) == 13 and st['ca'] and st['num']
              and st['tpl'].startswith('✓') and st['kind'] == 'Company plan' and st['inside'] and ca1 is False and ca2 is True and sty and shut == [True, False], (st, ca1, ca2, sty, shut))
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1500); await pg.click('#drawSetBtn'); await W(pg, 500)
        await pg.click('#stPole > summary'); await W(pg, 300); await pg.click('label[for="psCA"]'); await W(pg, 300)
        await pg.evaluate("document.getElementById('plMore').open = true; document.getElementById('stCl').open = true"); await W(pg, 300)
        p2 = await pg.evaluate("() => { const w = document.querySelector('#stClPlace').closest('.strow').querySelector('.dimwhy'); return [document.getElementById('psCA').checked, document.getElementById('psCASum').textContent, __polecam.S.exp.dxfClampType, !!w && !w.hidden && w.textContent]; }")
        await pg.evaluate("document.querySelector('#stClPlace').closest('.strow').querySelector('.dimwhy button').click()"); await W(pg, 300)
        p2b = await pg.evaluate("[document.getElementById('psCA').checked, __polecam.S.exp.dxfClampType]")
        check('P2. clamp types off (Pole details and span lengths): More settings › Clamp types is greyed with its reason, and its Switch on turns them on again', p2[0] is False and p2[1].startswith('Off') and p2[2] is False and 'Only with Clamp types beside each pole' in (p2[3] or '') and p2b == [True, True], (p2, p2b))
        await close_sheets(pg)
        # ---- a phone: What to export from the bar, Export the plan from below; the Export screen's DXF card is the same short card
        await close_sheets(pg); await pg.set_viewport_size({'width': 412, 'height': 860}); await W(pg, 600)
        await pg.click('#drawBtn'); await W(pg, 2000)
        m0 = await pg.evaluate("!document.getElementById('drawWhatBox').hidden")
        await pg.click('#drawWhat'); await W(pg, 400)
        m1 = await pg.evaluate("() => { const b = document.getElementById('drawWhatBox'), r = b.getBoundingClientRect(); return { pos: getComputedStyle(b).position, top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight }; }")
        await pg.screenshot(path=f'{OUT}/m1_what.png')
        await pg.click('#mxGo'); await W(pg, 400); await pg.click('#drawDxf'); await W(pg, 700)  # beta 6.7 (UX step 3): the panel's Done closes it; the bar's Export plan opens Export
        m2 = await pg.evaluate("() => ({ cls: document.getElementById('export').className, top: Math.round(document.getElementById('export').getBoundingClientRect().top), w: Math.round(document.getElementById('export').getBoundingClientRect().width) })")
        await pg.screenshot(path=f'{OUT}/m2_export.png')
        await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate("window.__polecam.showExport('doDxf')"); await W(pg, 300)
        m3 = await pg.evaluate("() => ({ cls: document.getElementById('export').className, title: document.getElementById('exportTitle').textContent, formats: getComputedStyle(document.getElementById('xAsk')).display, files: document.querySelectorAll('#dxfFiles .dxffile').length })")  # (beta 6.7, UX step 3: What do you need? and its rows; the ticks are Several at once)
        await pg.click('#dxfSetBtn'); await W(pg, 500)
        m4 = await pg.evaluate("[document.getElementById('drwStyle').className, Math.round(document.getElementById('drwStyle').getBoundingClientRect().width)]")
        check('M1. a phone: Drawings opens from the bar over the lower part of the plan; Export plan comes up from below over the Drawing; Export (bottom bar) → Plan drawing shows the same card; Plan style (Look · Change ›) full screen',
              not m0 and m1['pos'] == 'absolute' and m1['top'] > 150 and m2['cls'] == 'sheet plan' and m2['top'] > 40 and m2['w'] == 412 and m3['cls'] == 'sheet' and m3['title'] == 'Export' and m3['formats'] != 'none' and m3['files'] == 4 and m4 == ['sheet', 412], (m0, m1, m2, m3, m4))
        await close_sheets(pg); await pg.set_viewport_size({'width': 1440, 'height': 900}); await W(pg, 400)
        await common.newproj(pg, 'survey', 'AUDIT_SYN', purpose='Audit'); await close_sheets(pg)
        R2 = [r for r in recs() if r['k'] in ('O', 'P5', 'P6') or r['k'].startswith('Q')]
        await pg.evaluate(ADD, ['AUDIT_SYN', R2, [['O', 'P5', 'F72'], ['P5', 'P6', 'F72']], [{'n': 1, 'cab': 'F72', 'side': 'auto', 'ex': False, 'path': ['O', 'P5', 'P6'], 'fromSt': '', 'toSt': ''}]])
        await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'photo' }], 0)")
        await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate("window.__polecam.showExport('doDxf')"); await W(pg, 500)
        a1 = await pg.evaluate("() => ({ host: !document.getElementById('dxfMxHost').hidden, grid: !!document.querySelector('#dxfMxHost #mxGrid'), what: document.getElementById('dxfWhat').hidden, names: [...document.querySelectorAll('#mxGrid .mxr .nm')].map((e) => e.textContent) })")
        gi = await pg.evaluate("__polecam.mxGroups().findIndex((x) => x.name === 'ODF')"); await pg.click(f'#dxfMxHost .mxc[data-g="{gi}"][data-m="num"]'); await W(pg, 400)
        askO = await pg.evaluate("!document.getElementById('askBox').hidden")
        gi = await pg.evaluate("__polecam.mxGroups().findIndex((x) => x.name === 'PLDT poles')"); await pg.click(f'#dxfMxHost .mxc[data-g="{gi}"][data-m="num"]'); await W(pg, 400)
        askP = await pg.evaluate("!document.getElementById('askBox').hidden")
        if askP: await pg.click('#askBox button:text-is("Whole project")'); await W(pg, 300)
        a1b = await pg.evaluate("() => ({ files: [...document.querySelectorAll('#dxfFiles .dxffile > span:nth-child(2)')].map((c) => c.textContent), rows: __polecam.dxfRows().map((r) => r.pts.join('+') + ':' + r.mode) })")
        await pg.screenshot(path=f'{OUT}/a1_audit.png')
        check('A1. a survey without the Drawing (Audit): the What to export table is on the DXF card; Number for the ODF does not ask about owners; for PLDT it asks; the card lists the 3 drawings',
              a1['host'] and a1['grid'] and a1['what'] and a1['names'][:1] == ['Every point'] and 'PLDT poles' in a1['names'] and not askO and askP and a1b['rows'] == ['*:photo', 'PLDT:num', 'el:ODF:num'] and a1b['files'] == ['Every point', 'PLDT poles 8', 'ODF 1'], (a1, askO, askP, a1b))
        await close_sheets(pg); await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'photo' }], 0)")
        await pg.click('#drawBtn'); await W(pg, 1500)
        a2 = await pg.evaluate("() => ({ drawing: !document.getElementById('drawing').hidden, find: !document.getElementById('find').hidden })")
        await close_sheets(pg); await pg.evaluate("() => { __polecam.S.project = 'RTA_SYN'; __polecam.persist(); __polecam.renderPoles(); }"); await W(pg, 500)
        await pg.click('#drawBtn'); await W(pg, 2000)
        a3 = await pg.evaluate("() => ({ inPanel: !!document.querySelector('#drawWhatBox #mxGrid'), host: document.getElementById('dxfMxHost').hidden })")
        check('A2. the table goes back beside the plan in a project with the Drawing (and an Audit survey has Find, not the Drawing)', not a2['drawing'] and a2['find'] and a3['inPanel'] and a3['host'], (a2, a3))
        await close_sheets(pg)
        # the tutorial: Show me on Pole numbers opens Plan style (beta 6.7, UX step 4: Basic › Pole numbers in this project)
        await pg.click('#tutorialBtn'); await W(pg, 300); await pg.click('#tutList .tuttopic[data-topic="plandxf"]'); await W(pg, 300)
        k = await pg.evaluate("GESAA_TUTORIAL.topics.find((t) => t.id === 'plandxf').steps.filter((x) => x.go || x.hl).findIndex((x) => x.hl === '#psNum')")
        await pg.locator('#tutSteps .show').nth(k).click(); await W(pg, 1500)
        t2 = await pg.evaluate("() => ({ set: !document.getElementById('drwStyle').hidden && document.getElementById('stNum').open, spot: !!document.getElementById('tutSpot'), tip: !!document.getElementById('tutTip') })")
        check('T2. the tutorial\'s Show me on Pole numbers opens Plan style (its Pole numbers card) and rings it', t2['set'] and t2['tip'] and t2['spot'], t2)
        if t2['tip']: await pg.click('#tutTip button:has-text("Back to the tutorial")'); await W(pg, 300)
        await close_sheets(pg)
        # ---- the Projects pane: Open
        await close_sheets(pg); await pg.set_viewport_size({'width': 1440, 'height': 900}); await W(pg, 600)
        await common.newproj(pg, 'survey', 'OTHER_B', purpose='As-plan'); await close_sheets(pg); await W(pg, 500)
        b0 = await pg.evaluate("() => ({ p: __polecam.S.project, rows: [...document.querySelectorAll('#ppRows .pp-row')].map((r) => r.dataset.name + ':' + (r.querySelector('.pp-open') ? 'Open' : r.querySelector('.pp-here') ? r.querySelector('.pp-here').textContent : '?')) })")
        await pg.click('#ppRows .pp-row[data-name="RTA_SYN"] .pp-open'); await W(pg, 900)
        b1 = await pg.evaluate("() => ({ p: __polecam.S.project, show: __polecam.S.pane.show, top: document.querySelector('#projName, .ppill span, #curProj') ? 1 : 0, toast: document.getElementById('toast').textContent })")
        await pg.click('#ppRows .pp-row[data-name="OTHER_B"] .pp-more'); await W(pg, 200)
        menu = await pg.evaluate("[...document.querySelectorAll('#ppMenu button')].map((b) => b.textContent)")
        await pg.click('#ppMenu button.first'); await W(pg, 800)
        b2 = await pg.evaluate("() => ({ p: __polecam.S.project, show: __polecam.S.pane.show })")
        check('O1. the pane: Open beside a project works on it (the top bar, the map); the project left stays on the map (ticked); "Working on" on the one open; ⋯ starts with Open this project',
              b0['p'] == 'OTHER_B' and 'RTA_SYN:Open' in b0['rows'] and 'OTHER_B:Working on' in b0['rows'] and b1['p'] == 'RTA_SYN' and b1['show'].get('OTHER_B') is True and 'RTA_SYN' in b1['toast']
              and menu[0] == 'Open this project' and b2['p'] == 'OTHER_B' and b2['show'].get('RTA_SYN') is True, (b0, b1, menu, b2))
        q = await pg.evaluate("() => { const p = __polecam.points.find((x) => x.project === 'RTA_SYN' && x.poleId === 'CC-6010'); return { id: p.id, lat: p.lat, lon: p.lon }; }")
        await pg.evaluate("(q) => { __polecam.mapView(q.lat, q.lon, 18); return true; }", q); await W(pg, 900)
        xy0 = await pg.evaluate("(q) => __polecam.mapPt(q.lat, q.lon)", q)
        await pg.mouse.click(xy0[0], xy0[1]); await W(pg, 500)
        pop = await pg.evaluate("() => { const b = document.querySelector('.pp-pop .pp-go'); return b ? [b.textContent, b.disabled, document.querySelector('.pp-pop').innerText] : null; }")
        c0 = await pg.evaluate("() => { const c = __polecam.map.getCenter(); return [c.lat, c.lng, __polecam.map.getZoom()]; }")
        await pg.click('.pp-pop .pp-go'); await W(pg, 900)
        b3 = await pg.evaluate("() => { const c = __polecam.map.getCenter(); return { p: __polecam.S.project, c: [c.lat, c.lng, __polecam.map.getZoom()], hl: __polecam.hl(), chip: !document.getElementById('hlChip').hidden, show: __polecam.S.pane.show }; }")
        await pg.screenshot(path=f'{OUT}/o2_pole.png')
        check('O2. another project\'s pole: its ID and project with Open this project; Open works on that project with the map where it was and the pole ringed (the chip shows it)',
              pop and pop[0] == 'Open this project' and not pop[1] and 'CC-6010' in pop[2] and 'RTA_SYN' in pop[2] and b3['p'] == 'RTA_SYN' and abs(b3['c'][0] - c0[0]) < 1e-6 and abs(b3['c'][1] - c0[1]) < 1e-6 and b3['c'][2] == c0[2]
              and b3['hl'] == q['id'] and b3['chip'] and b3['show'].get('OTHER_B') is True, (pop, c0, b3))
        await pg.click('#routeBtn'); await W(pg, 600)
        r1 = await pg.evaluate("() => ({ dis: [...document.querySelectorAll('#ppRows .pp-open')].map((b) => b.disabled), title: (document.querySelector('#ppRows .pp-open') || {}).title })")
        await pg.evaluate("__polecam.ppOpen('OTHER_B')"); await W(pg, 300)
        r2 = await pg.evaluate("[__polecam.S.project, document.getElementById('toast').textContent]")
        await pg.evaluate("() => { const b = document.getElementById('rtDone'); if (b) b.click(); else document.getElementById('routeBtn').click(); }"); await W(pg, 600)
        r3 = await pg.evaluate("[...document.querySelectorAll('#ppRows .pp-open')].map((b) => b.disabled)")
        check('O3. while a cable is drawn, Open waits (greyed, "Finish the cable first"); after Done it works again', len(r1['dis']) == 2 and all(r1['dis']) and 'Finish the cable first' in (r1['title'] or '') and r2[0] == 'RTA_SYN' and 'Finish the cable first' in r2[1] and r3 == [False, False], (r1, r2, r3))
        # ---- the tutorial points at the new places
        tut = await pg.evaluate("""() => { const T = GESAA_TUTORIAL.topics, hl = (id) => (T.find((t) => t.id === id) || { steps: [] }).steps.map((s) => s.hl).filter(Boolean);
          const all = T.flatMap((t) => t.steps.map((s) => s.hl).filter(Boolean)), missing = [...new Set(all)].filter((h) => /^#[\\w-]+$/.test(h) && !document.querySelector(h));
          return { v: GESAA_TUTORIAL.version, drawing: hl('drawing'), plan: hl('plandxf'), missing }; }""")
        check('T1. the tutorial (its version: the app\'s, beta 6.7): the Drawing topic shows Drawings, Plan style and Export plan; the plan DXF topic the card\'s summary, the company template, names, drawings and Pole numbers; every step\'s place exists',
              re.match(r'^2\.\d+\.\d+$', tut['v'] or '') and {'#drawWhat', '#drawSetBtn', '#drawDxf'} <= set(tut['drawing']) and {'#dxfSum', '#psTpl', '#sigBox', '#dxfFilesBox', '#psNum'} <= set(tut['plan']) and not tut['missing'], tut)
        print('errors', errs[:4]); check('H1. no page errors', not [e for e in errs if 'PAGEERROR' in e], errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
