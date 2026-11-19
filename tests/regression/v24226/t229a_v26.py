"""v2.42.24 copy: the cable for spans linked without a cable is in Route → Cables → More (opened); the 8 cable types. v2.42.21 copy: Route opens with Route tools and linking by pairs (the route card as before v2.42.21).
v2.29 (a): tap G-eSAA to reload (asked; ignored while capturing), no page pinch-zoom, FOC cable type per span (route
builder, map colours, exports), new arm / guying / maintenance loop on poles, MLoop length setting, region suggested from the
GPS and confirmed, survey quantities in the BOQ and route Excel."""
import asyncio, sys, os, shutil, json, zipfile, re, io
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, newproj, skipscan, sheet_companies, xclick
from playwright.async_api import async_playwright
import openpyxl
D = S + '/v229'; OUT = S + '/v24226/out_229v26'; os.makedirs(OUT, exist_ok=True)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900])
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(p_):
    for _ in range(8):
        if await p_.locator('section.sheet:not([hidden])').count() == 0: break
        await p_.go_back(); await W(p_, 250)
async def capture(pg, cur, lat, lon):
    cur.update({'latitude': lat, 'longitude': lon, 'accuracy': 3}); await W(pg, 1300)
    await pg.click('#captureBtn'); await W(pg, 1300)
    await pg.click('#shutter'); await W(pg, 2500); await skipscan(pg)
    await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 800)
async def save(pg):
    await pg.evaluate("() => [...document.querySelectorAll('#edSave, #edSaveTop')].find(e => e.getClientRects().length).click()")
    await pg.wait_for_selector('#editor', state='hidden', timeout=15000); await W(pg, 500)
async def dl(pg, click, path):
    async with pg.expect_download(timeout=90000) as d: await click()
    v = await d.value; await v.save_as(path); return path
async def export(pg, btn, path):
    await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 300); await xclick(pg, btn); await W(pg, 500)
    if await pg.is_visible('#askBox'): await pg.click('#askBox button.primary'); await W(pg, 500)
    await pg.wait_for_selector('#resultBox:not([hidden])', timeout=90000); await W(pg, 200)
    f = await dl(pg, lambda: pg.click('#resSave'), path); await pg.evaluate("document.getElementById('resultBox').hidden = true"); await close_sheets(pg); return f
async def tap_pole(pg, pid):  # (v2.42.24 copy: the pole's own tap, as its pin gives it: the Cables panel with More open covers part of the map)
    ok = await pg.evaluate("(pid) => { const p = __polecam.points.find((x) => x.poleId === pid && x.project === __polecam.S.project); if (!p) return false; __polecam.routeTap(p.id); return true; }", pid)
    if not ok: raise Exception(f'pole {pid} not found')
    await W(pg, 400)
async def tap_pole_map(pg, pid):
    """A pole is a circle marker with its ID in a tooltip on its right: tap the marker nearest the tooltip's left end."""
    xy = await pg.evaluate("""(pid) => { const t = [...document.querySelectorAll('#map .leaflet-tooltip.pole-label')].find(e => e.textContent.split(' ·')[0] === pid); if (!t) return null;
        const r = t.getBoundingClientRect(), tx = r.left, ty = r.top + r.height / 2; let best = null, bd = 1e9;
        document.querySelectorAll('#map path.leaflet-interactive').forEach((e) => { const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2, d = Math.hypot(cx - tx, cy - ty); if (b.width < 40 && d < bd && e.getAttribute('stroke-opacity') !== '0.01') { bd = d; best = [cx, cy]; } }); // v2.42.18: not a span's tap area
        return best; }""", pid)
    if not xy: raise Exception(f'pole {pid} not on the map')
    await pg.mouse.click(xy[0], xy[1]); await W(pg, 400)
async def chip(pg, k, text):
    await pg.evaluate("([k, t]) => [...document.querySelectorAll(`#editor .chips[data-k=${k}] .chip`)].find(c => c.textContent === t).click()", [k, text]); await W(pg, 250)
L1 = (7.04100, 125.08600)  # near Kidapawan (Region 12)
off = lambda L, m: (L[0] + m / 111320.0, L[1])

async def main():
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_a', ignore_errors=True)
        ctx, pg, errs, cur, st0, tk = await launch(p, f'{D}/ud_a', S + '/v17/vid/h_cc.mjpeg', project=False, geo={'latitude': L1[0], 'longitude': L1[1], 'accuracy': 3})
        # ===== 1. page zoom off
        vp = await pg.evaluate("document.querySelector('meta[name=viewport]').content")
        pz = await pg.evaluate("""(() => { const mk = (el) => { const t = (x) => new Touch({ identifier: x, target: el, clientX: 100 + x * 40, clientY: 300 });
            const e = new TouchEvent('touchmove', { touches: [t(1), t(2)], cancelable: true, bubbles: true }); el.dispatchEvent(e); return e.defaultPrevented; };
          const one = (el) => { const e = new TouchEvent('touchmove', { touches: [new Touch({ identifier: 1, target: el, clientX: 100, clientY: 300 })], cancelable: true, bubbles: true }); el.dispatchEvent(e); return e.defaultPrevented; };
          return { body: mk(document.getElementById('welcome') || document.body), map: mk(document.getElementById('map')), oneFinger: one(document.body), ta: getComputedStyle(document.body).touchAction }; })()""")
        check('no accidental page zoom: viewport not scalable; a two-finger move outside the map / photo is blocked, the map keeps its pinch, one finger scrolls',
              'user-scalable=no' in vp and 'maximum-scale=1' in vp and pz['body'] and not pz['map'] and not pz['oneFinger'], (vp, pz))
        # ===== 2. team with an MLoop length of 12 m
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP Mindanao'); await sheet_companies(pg, ['GLOBE', 'FADI'], admins=['GLOBE'])
        a0 = await pg.evaluate("({ ml: document.getElementById('setMloopLen').value, arm: document.getElementById('admBoqArm').value.split('\\n'), guy: document.getElementById('admBoqGuy').value.split('\\n'), src: document.getElementById('admAreaSrc').value })")
        await pg.fill('#setMloopLen', '12')
        await pg.evaluate("document.getElementById('admBoqBox').open = true"); await W(pg, 200)
        await pg.fill('#admBoqGuy', a0['guy'] and '\n'.join(a0['guy'] + ['Storm guy']))
        await pg.fill('#admAreaSrc', 'http://insecure.example/x.pmtiles')
        await pg.click('#admSave'); await pg.wait_for_selector('#qrShow:not([hidden])'); await W(pg, 300); await pg.click('#qrClose'); await W(pg, 300)
        P = await pg.evaluate("__polecam.S.team.pol")
        check('Administration: MLoop length (default 15 m) saved as 12; New arms and Guying lists editable (Storm guy added); a non-https area source is not kept',
              a0['ml'] == '15' and a0['arm'][:2] == ['Single arm', 'Double arm'] and 'Head guy' in a0['guy'] and P.get('mloopLen') == 12 and P.get('boqLists', {}).get('guy', [])[-1:] == ['Storm guy'] and not P.get('areaSrc'), (a0, {k: P.get(k) for k in ('mloopLen', 'areaSrc')}, P.get('boqLists')))
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        # ===== 3. tap the logo: asked first; nothing while the camera is open
        await newproj(pg, 'survey', 'PLAN_29', purpose='As-plan'); await close_sheets(pg)
        await pg.evaluate("window.__mark29 = 1")
        b0 = await pg.evaluate("(() => { const b = document.getElementById('brandBtn'); return { tag: b.tagName, label: b.getAttribute('aria-label') || b.title, ver: document.getElementById('brandVer').textContent }; })()")
        await pg.click('#brandBtn'); await W(pg, 400)
        a1 = await pg.evaluate("({ open: !document.getElementById('askBox').hidden, title: document.querySelector('#askBox h3, #askTitle') ? document.querySelector('#askBox h3, #askTitle').textContent : '', btns: [...document.querySelectorAll('#askBox button')].map(b => b.textContent) })")
        await pg.screenshot(path=f'{OUT}/a1_reload_ask.png')
        await pg.click('#askBox button:has-text("Cancel")'); await W(pg, 400)
        still = await pg.evaluate("window.__mark29")
        cur.update({'latitude': L1[0], 'longitude': L1[1], 'accuracy': 3}); await W(pg, 1200)
        await pg.click('#captureBtn'); await W(pg, 1500)
        await pg.evaluate("document.getElementById('brandBtn').click()"); await W(pg, 500)
        a2 = await pg.evaluate("({ ask: !document.getElementById('askBox').hidden, cam: !document.getElementById('camera').hidden, mark: window.__mark29 })")
        await pg.go_back(); await W(pg, 800); await close_sheets(pg)
        check('logo: G-eSAA is a button; a tap asks “Reload G-eSAA?” (Cancel / Reload); Cancel keeps the app; while the camera is open the tap does nothing',
              b0['tag'] == 'BUTTON' and a1['open'] and 'Reload' in a1['title'] and a1['btns'] == ['Cancel', 'Reload'] and still == 1 and not a2['ask'] and a2['cam'] and a2['mark'] == 1, (b0, a1, still, a2))
        # ===== 4. poles with arm, guying, MLoop
        await capture(pg, cur, *L1); await pg.fill('#poleId', 'CC-0001')
        e1 = await pg.evaluate("""() => ({ labels: [...document.querySelectorAll('#editor .boqrow .lbl')].map(l => l.textContent), arm: [...(document.querySelector('#editor select.boqsel[data-k=arm]') || { options: [] }).options].map(o => o.text),
            guy: [...document.querySelectorAll('#editor .chips[data-k=guy] .chip')].map(c => c.textContent), ml: [...document.querySelectorAll('#editor .chips[data-k=mloop] .chip')].map(c => c.textContent) })""")
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#editor select.boqsel[data-k=arm]'); await pg.select_option('#editor select.boqsel[data-k=arm]', 'Double arm'); await W(pg, 250)
        await chip(pg, 'guy', 'Head guy'); await chip(pg, 'guy', 'Storm guy'); await chip(pg, 'guy', 'Side guy'); await chip(pg, 'guy', 'Storm guy')
        await chip(pg, 'mloop', '12 m')
        e2 = await pg.evaluate("""() => ({ pressed: [...document.querySelectorAll('#editor .chips[data-k=guy] .chip[aria-pressed=true]')].map(c => c.textContent), ml: String(!!document.querySelector('#editor .chips[data-k=mloop] .chip[aria-pressed=true]') && document.querySelector('#editor .chips[data-k=mloop] .chip[aria-pressed=true]').textContent === '12 m') })""")
        await pg.screenshot(path=f'{OUT}/a2_pole_arm_guy_mloop.png', full_page=True)
        await save(pg)
        r1 = await pg.evaluate("__polecam.points.filter(p => p.project === 'PLAN_29').slice(-1)[0].boq")
        check('pole record: NEW ARM (dropdown of 5), NEW GUYING (several: Head + Side; Storm on then off) and MAINTENANCE LOOP (one chip with the 12 m length; No loop beside the lengths since v2.42.26); saved',
              'NEW ARM' in e1['labels'] and any('GUYING' in l for l in e1['labels']) and 'MAINTENANCE LOOP' in e1['labels'] and e1['arm'][:1] == ['— none —'] and len(e1['arm']) == 6
              and e1['guy'][-1] == 'Storm guy' and e1['ml'] == ['10 m', '12 m', '15 m', '20 m', 'No loop'] and e2['pressed'] == ['Head guy', 'Side guy'] and e2['ml'] == 'true'
              and r1.get('arm') == 'Double arm' and r1.get('guy') == 'Head guy + Side guy' and r1.get('mloop') == 'Yes', (e1, e2, r1))
        await capture(pg, cur, *off(L1, 60)); await pg.fill('#poleId', 'CC-0002'); await save(pg)
        await capture(pg, cur, *off(L1, 120)); await pg.fill('#poleId', 'CC-0003'); await chip(pg, 'mloop', '12 m'); await save(pg)
        await capture(pg, cur, *off(L1, 180)); await pg.fill('#poleId', 'CC-0004'); await save(pg)
        await close_sheets(pg)
        # ===== 5. route: cable per span
        await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 600)
        await pg.evaluate("document.getElementById('rbMore').open = true"); await W(pg, 300)  # (v2.42.24: in More)
        c0 = await pg.evaluate("({ opts: [...document.getElementById('rbCable').options].map(o => [o.value, o.text]), v: document.getElementById('rbCable').value })")
        await pg.select_option('#rbCable', 'F72'); await W(pg, 300)
        await tap_pole(pg, 'CC-0001'); await tap_pole(pg, 'CC-0002')
        await pg.select_option('#rbCable', 'L12'); await W(pg, 300); await tap_pole(pg, 'CC-0003')
        await pg.select_option('#rbCable', 'U144'); await W(pg, 300); await tap_pole(pg, 'CC-0004')
        l1 = await pg.evaluate("__polecam.S.meta.PLAN_29.links")
        ids = await pg.evaluate("Object.fromEntries(__polecam.points.filter(p => p.project === 'PLAN_29').map(p => [p.poleId, p.id]))")
        nm = lambda l: [[{v: k for k, v in ids.items()}.get(a), {v: k for k, v in ids.items()}.get(b), (c[0] if c else '')] for a, b, *c in l]
        stats = await pg.text_content('#rbStats')
        strokes = await pg.evaluate("[...document.querySelectorAll('#map path.leaflet-interactive, #map svg path')].map(e => [e.getAttribute('stroke'), e.getAttribute('stroke-dasharray')]).filter(x => x[0])")
        await pg.screenshot(path=f'{OUT}/a3_route_cables.png')
        # a linked pair tapped with another cable chosen: the span takes it; Undo; then Set on all spans; Undo
        await pg.select_option('#rbCable', 'L12'); await W(pg, 300); await tap_pole(pg, 'CC-0003')  # CC-0004 is selected: CC-0004 → CC-0003
        l2 = nm(await pg.evaluate("__polecam.S.meta.PLAN_29.links")); t2 = await pg.text_content('#toast')
        await pg.click('#rbUndo'); await W(pg, 300)
        await pg.click('#rbCableAll'); await W(pg, 300); l3 = nm(await pg.evaluate("__polecam.S.meta.PLAN_29.links"))
        await pg.click('#rbUndo'); await W(pg, 300); l4 = nm(await pg.evaluate("__polecam.S.meta.PLAN_29.links"))
        await pg.click('#rbDone'); await W(pg, 600)
        check('route builder: CABLE choice (AE Figure 8 72C · AE, Light cable 12C · AE, UG 144C air-blown · UG, not set); each new span takes the chosen cable',
              [v for v, _ in c0['opts']] == ['L12', 'F12', 'F24', 'F48', 'F72', 'F144', 'U144', 'U288', ''] and c0['v'] == 'L12' and nm(l1) == [['CC-0001', 'CC-0002', 'F72'], ['CC-0002', 'CC-0003', 'L12'], ['CC-0003', 'CC-0004', 'U144']], (c0, nm(l1)))
        check('route builder: the bar sums each cable (Fig-8 72C, Light 12C, UG 144C); spans drawn in the cable colours, UG dotted',
              all(s in stats for s in ('Fig-8 72C 60 m', 'Light 12C 60 m', 'UG 144C 60 m')) and ['#7f48e8', None] in strokes and ['#1c7ed6', None] in strokes and ['#2f9e44', '2 7'] in strokes, (stats, strokes[:8]))
        check('route builder: tapping a linked pair with another cable chosen changes that span (toast), Undo restores; “Set on all spans” sets every span, Undo restores',
              l2[2] == ['CC-0003', 'CC-0004', 'L12'] and 'Span changed' in t2 and l3 == [['CC-0001', 'CC-0002', 'L12'], ['CC-0002', 'CC-0003', 'L12'], ['CC-0003', 'CC-0004', 'L12']]
              and l4 == nm(l1), (l2, t2, l3, l4))
        # ===== 6. region: suggested from the GPS, confirmed by the user
        await pg.click('#projectBtn'); await W(pg, 500); await pg.evaluate("document.getElementById('curMore').open = true"); await W(pg, 300)
        g0 = await pg.evaluate("({ row: !document.getElementById('curRegionRow').hidden, first: document.getElementById('curRegion').options[0].text, sug: [...document.getElementById('curRegion').options].filter(o => o.text.includes('suggested from GPS')).map(o => o.value), n: document.getElementById('curRegion').options.length, hint: document.getElementById('curRegionHint').textContent, v: document.getElementById('curRegion').value })")
        await pg.select_option('#curRegion', 'R12'); await W(pg, 400)
        g1 = await pg.evaluate("({ m: __polecam.S.meta.PLAN_29.region, hint: document.getElementById('curRegionHint').textContent })")
        await pg.screenshot(path=f'{OUT}/a4_region.png')
        reg = await pg.evaluate("[[14.5995, 120.9842], [10.3157, 123.8854], [7.19, 125.45], [6.9214, 122.079], [16.41, 120.6], [1, 1]].map(([a, b]) => __polecam.regionAt(a, b))")
        await close_sheets(pg)
        check('Project details: REGION (BOQ) not set until chosen; the GPS suggests Region 12 here (SOCCSKSARGEN), 18 regions; choosing saves it',
              g0['row'] and g0['v'] == '' and 'suggested: Region 12' in g0['first'] and g0['sug'] == ['R12'] and g0['n'] == 19 and 'Approximate' in g0['hint'] and g1['m'] == 'R12' and 'Region 12' in g1['hint'], (g0, g1))
        check('region lookup: Manila NCR, Cebu Region 7, Davao Region 11, Zamboanga Region 9, Baguio CAR, outside the Philippines none', reg == ['NCR', 'R7', 'R11', 'R9', 'CAR', ''], reg)
        # ===== 7. survey quantities
        q = await pg.evaluate("Object.fromEntries(__polecam.surveyQty(__polecam.points.filter(p => p.project === 'PLAN_29')).rows.map(r => [r[0], r[1]]))")
        tot = q.get('SPAN_TOTAL', 0)
        check('survey quantities: spans by cable and method, loops (2 × 12 m), FOC = spans + loops, detailed engineering = spans without loops, arms, guying, region',
              abs(tot - 180) < 0.5 and abs(q['SPAN_F72'] - 60) < 0.5 and abs(q['SPAN_L12'] - 60) < 0.5 and abs(q['SPAN_U144'] - 60) < 0.5 and abs(q['SPAN_AE'] - 120) < 0.5 and abs(q['SPAN_UG'] - 60) < 0.5
              and q['MLOOP_LEN'] == 12 and q['MLOOP_COUNT'] == 2 and q['MLOOP_F72'] == 1 and q['MLOOP_L12'] + q['MLOOP_U144'] == 1 and abs(q['FOC_TOTAL'] - (tot + 22)) < 0.5 and abs(q['MLOOP_M'] - 22) < 0.1 and abs(q['DE'] - tot) < 0.5
              and abs(q['FOC_F72'] - 72) < 0.5 and q['ARM_DOUBLE_ARM'] == 1 and q['GUY_HEAD_GUY'] == 1 and q['GUY_SIDE_GUY'] == 1 and q['POLES_TOTAL'] == 4 and q['REGION'] == 'Region 12', q)
        # ===== 8. exports
        f = await export(pg, '#doRouteXlsx', f'{OUT}/route.xlsx')
        wb = openpyxl.load_workbook(f); sh = wb['Spans']; hdr = [c.value for c in sh[1]]
        sp = [[r[1], r[2], r[6], r[7]] for r in sh.iter_rows(min_row=2, values_only=True)] # v2.42.18: + the Run column
        summ = {r[0]: r[1] for r in wb['Summary'].iter_rows(values_only=True) if r and r[0]}
        qs = {r[0]: r[1] for r in wb['Survey quantities'].iter_rows(min_row=5, values_only=True) if r and r[0]} if 'Survey quantities' in wb.sheetnames else {}
        check('Route and spans Excel: Spans has Cable and Method; Summary has the length of each cable; the BOQ and Survey quantities sheets are in it',
              hdr[3] == 'Run' and hdr[6:8] == ['Cable', 'Method'] and sp == [['CC-0001', 'CC-0002', 'AE Figure 8 72C FOC', 'AE'], ['CC-0002', 'CC-0003', 'Light cable 12C', 'AE'], ['CC-0003', 'CC-0004', 'UG 144C air-blown fiber', 'UG']]
              and abs(summ.get('AE Figure 8 72C FOC (AE) (m)', 0) - 60) < 0.5 and abs(summ.get('UG 144C air-blown fiber (UG) (m)', 0) - 60) < 0.5 and 'BOQ' in wb.sheetnames and qs.get('MLOOP_COUNT') == 2 and qs.get('REGION') == 'Region 12',
              (hdr, sp, {k: v for k, v in summ.items() if 'm)' in str(k)}, wb.sheetnames, {k: qs.get(k) for k in ('MLOOP_COUNT', 'REGION', 'FOC_TOTAL')}))
        f = await export(pg, '#doBoq', f'{OUT}/boq.xlsx')
        wb = openpyxl.load_workbook(f); boq = [r[:4] for r in wb['BOQ'].iter_rows(values_only=True) if r and r[0] in ('New arm', 'Guying', 'Maintenance loop')]
        check('BOQ Excel: New arm (Double arm), Guying (Head guy, Side guy), Maintenance loop 12 m × 2; plus the Survey quantities sheet with codes',
              ('New arm', 'Double arm', 'Pole', 1) in [tuple(x) for x in boq] and ('Guying', 'Head guy', 'Pole', 1) in [tuple(x) for x in boq] and ('Guying', 'Side guy', 'Pole', 1) in [tuple(x) for x in boq]
              and ('Maintenance loop', '12 m', 'Pole', 1) in [tuple(x) for x in boq] and ('Maintenance loop', '10 m', 'Pole', 1) in [tuple(x) for x in boq] and 'Survey quantities' in wb.sheetnames, (boq, wb.sheetnames))
        f = await export(pg, '#doKmz', f'{OUT}/plan.kmz')
        kml = zipfile.ZipFile(f).read('doc.kml').decode()
        st = re.findall(r'<Style id="(cable_[A-Z0-9]+)">', kml); runs = re.findall(r'<styleUrl>#(cable_[A-Z0-9]+)</styleUrl>', kml)
        check('KMZ: a line style per cable; the route as runs per cable, each with its cable and method',
              {'cable_F72', 'cable_L12', 'cable_U144'} <= set(st) and sorted(runs) == ['cable_F72', 'cable_L12', 'cable_U144'] and 'UG 144C air-blown fiber' in kml and re.search(r'<Data name="method"><value>UG</value>', kml) is not None and 'new_arm' in kml and 'guying' in kml and 'mloop' in kml,
              (st, runs, re.findall(r'<Data name="(cable|method)"><value>([^<]*)</value>', kml)[:6]))
        f = await export(pg, '#doDxf', f'{OUT}/plan.dxf')
        dxf = open(f, encoding='utf-8', errors='replace').read()
        lay = {L: len(re.findall(r'\n\s*8\r?\n' + L + r'\r?\n', dxf)) for L in ('FOC_AE_FIG8_72C', 'FOC_AE_LIGHT_12C', 'FOC_UG_144C')}
        check('DXF: each cable on its own layer (FOC_AE_FIG8_72C, FOC_AE_LIGHT_12C, FOC_UG_144C) with its span', all(v >= 1 for v in lay.values()), lay)
        # ===== 9. reload for real (the page loads again, data kept)
        await pg.click('#brandBtn'); await W(pg, 400)
        async with pg.expect_navigation(timeout=30000): await pg.click('#askBox button:has-text("Reload")')
        await W(pg, 2500)
        rr = await pg.evaluate("({ mark: window.__mark29 === undefined, n: (__polecam.points || []).filter(p => p.project === 'PLAN_29').length, proj: __polecam.S.project })")
        check('logo → Reload: the app loads again (newest files), projects and records kept', rr['mark'] and rr['n'] == 4 and rr['proj'] == 'PLAN_29', rr)
        bad = [e for e in errs if 'PAGEERROR' in e or 'TypeError' in e or 'ReferenceError' in e]
        check('no page errors', not bad, bad[:5])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} checks passed')
asyncio.run(main())
