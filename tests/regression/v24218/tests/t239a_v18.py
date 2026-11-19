"""v2.39.0: the pole's CLAMP TYPE (CA, GCA, 2A, DEG, RL; several at once; optional). Left blank, the plan picks it from the route,
the guys and the arm; the plan writes the clamps with the clamp size (no more CA on every pole); the KMZ and CSV carry clamp_type.
On the 10 km sample (260 records), in a laptop-sized browser.
 1. the app's clamps for every pole match the rules worked out here independently (end 2A, corner DEG, straight GCA with a guy /
    CA without, a branch adds 2A; arm 26/44 CA+RL, 10-pin CA+CA, other arm CA; side / sidewalk guy GCA, head / down / pole-to-pole 2A)
 2. the record shows CLAMP TYPE with the five types; ticking DEG on a straight pole keeps it (the plan uses it)
 3. the plan DXF writes each pole's clamps and size (the labels match the app's, poles one for one); no label starts with CA where
    the pole is an end; the edited pole reads DEG <size>
 4. the KMZ and the CSV have clamp_type (the edited pole: DEG)"""
import asyncio, sys, os, shutil, json, zipfile, time, urllib.parse, io, math, re, collections
# v2.42.8: the plan DXF is written with CRLF line ends (AutoCAD's own); ezdxf.read() on a text stream expects universal newlines
class _UStringIO(io.StringIO):
    def __init__(self, s='', *a, **k): super().__init__(s.replace('\r\n', '\n') if isinstance(s, str) else s, *a, **k)
io.StringIO = _UStringIO
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from playwright.async_api import async_playwright
D = S + '/v239'; OUT = S + '/v24218/tests/out_39v18'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
FILE = PRIV + '/large/G-eSAA_TEST10KM_Survey.zip'
ROAD = PRIV + '/roads/G-eSAA roads - Davao Region - 2026-08-19.roadpack'
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'; LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900], flush=True)
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def idle(pg, maxs=900):
    t0 = time.time()
    while time.time() - t0 < maxs:
        if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): return
        await W(pg, 250)
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 250)
async def export(pg, sel, name):
    await close_sheets(pg)
    await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate(f"window.__polecam.showExport('{sel}')"); await W(pg, 300)
    await pg.click('#' + sel)
    for _ in range(1200):
        if await pg.locator('#resultBox:not([hidden])').count(): break
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
        await W(pg, 250)
    async with pg.expect_download(timeout=180000) as d: await pg.click('#resSave')
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f); await close_sheets(pg); return f

# ---- the rules, worked out here from the file itself ----
def expected(points, links):
    by = {p['id']: p for p in points}; aer = collections.defaultdict(list); at = collections.Counter(); n12 = collections.Counter(); nOth = collections.Counter()
    for a, b, *rest in links:
        cab = rest[0] if rest else ''
        if cab == 'L12': n12[a] += 1; n12[b] += 1; continue # v2.42.18: a 12C span holds no pole clamp (retractors and span clamps)
        if cab != 'U144': nOth[a] += 1; nOth[b] += 1
        at[a] += 1; at[b] += 1
        if cab == 'U144': continue
        if by[b]['element'] == 'Pole': aer[a].append(by[b])
        if by[a]['element'] == 'Pole': aer[b].append(by[a])
    def defl(P, A, B):
        k = math.cos(math.radians(P['lat'])); v1 = ((A['lon'] - P['lon']) * k, A['lat'] - P['lat']); v2 = ((B['lon'] - P['lon']) * k, B['lat'] - P['lat'])
        n = math.hypot(*v1) * math.hypot(*v2)
        return 0 if not n else 180 - math.degrees(math.acos(max(-1, min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / n))))
    out = {}
    for p in points:
        if p['element'] != 'Pole': continue
        if any(re.fullmatch(r'telco\s*arm', str((d or {}).get('item', '')).strip(), re.I) for d in (p.get('details') or [])) or (n12[p['id']] and not nOth[p['id']]): out[p['id']] = ''; continue # v2.42.18: no pole clamps
        b = p.get('boq', {}); guys = [g for g in (b.get('guy') or '').split(' + ') if g]; arm = b.get('arm') or ''; n = aer[p['id']]
        if at[p['id']] and len(n) <= 1: cab = ['2A']
        elif len(n) >= 2:
            st = min(defl(p, n[i], n[j]) for i in range(len(n)) for j in range(i + 1, len(n)))
            cab = ['DEG' if st > 90 else 'CA' if st >= 15 else ('GCA' if guys else 'CA')] + (['2A'] if at[p['id']] > 2 else [])
        else: cab = []
        armT = ['CA', 'RL'] if re.search('extension|26|44|10.?pin|alley', arm, re.I) else ['CA'] if arm else []
        if armT: cab = [t for t in cab if t not in ('CA', 'GCA')]
        o = cab + armT
        def add(t):
            if t not in o: o.append(t)
        for g in guys:
            ts = ['2A', 'CA', 'RL'] if re.search('sidewalk head', g, re.I) else ['GCA', 'CA', 'RL'] if re.search('sidewalk guy', g, re.I) else ['2A'] if re.search('head guy|down guy|pole.?to.?pole', g, re.I) else ['GCA'] if re.search('side guy', g, re.I) else []
            for t in ts: add(t)
        if any(q is not p and (q.get('boq') or {}).get('p2p') == p['id'] and re.search('pole.?to.?pole', (q.get('boq') or {}).get('guy', ''), re.I) for q in points): add('2A')
        out[p['id']] = '+'.join(o)
    return out

async def main():
    z = zipfile.ZipFile(FILE); data = json.loads(z.read('p1/points.json')); pts = data['points']; links = data['meta']['links']
    exp = expected(pts, links); byid = {p['id']: p for p in pts}
    async def sheet(route):
        req = route.request
        if req.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query)
        if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
        out = {'ok': True, 'name': common.SHEET_MOCK['name'], 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(OUT + '/ud', executable_path=common.CHROME, viewport={'width': 1366, 'height': 768}, accept_downloads=True, service_workers='block')
        await ctx.route('https://script.google.com/**', sheet)
        for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**'): await ctx.route(u, lambda r: r.abort())
        await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS); await ctx.add_init_script(common.ADM_OPEN_JS)
        pg = ctx.pages[0]; errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto('http://localhost:8765/index.html'); await W(pg, 1500)
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await common.sheet_companies(pg, ['GLOBE', 'SAMPLE VENDOR'], admins=['GLOBE'])
        await pg.fill('#admWriteKey', 'ADMIN-KEY-TEST'); await pg.fill('#admDxfSeed', LINK1); await pg.click('#admSave')
        await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
        if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
        for _ in range(3):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 800)
        await pg.set_input_files('#packFileInput', ROAD); await W(pg, 1500); await idle(pg); await close_sheets(pg)
        await pg.set_input_files('#sharedInput', FILE); await pg.wait_for_selector('#askBox:not([hidden])', timeout=600000)
        for _ in range(4):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            await pg.locator('#askBox button.primary').first.click(); await W(pg, 700)
        await idle(pg); await W(pg, 1500)
        # 1. the rules
        app = await pg.evaluate("__polecam.clamps()")
        diff = [(byid[i]['poleId'], app.get(i), e) for i, e in exp.items() if app.get(i) != e]
        cnt = collections.Counter(exp.values())
        print('v18: poles without pole clamps', sum(1 for v in exp.values() if v == ''), flush=True)
        check('1a. the clamps of all 232 poles match the rules of the OSP guideline (worked out independently here): ends 2A, bends up to 90° CA, sharper DEG, straight GCA/CA, arms CA+RL, sidewalk guys +CA+RL, pole-to-pole 2A at both poles', len(app) == 232 and not diff, (len(app), diff[:8], cnt.most_common(8)))
        poles = [p for p in pts if p['element'] == 'Pole']
        first = poles[0]; hh = next(p for p in pts if p['poleId'] == 'HH-0001'); before_hh = next(byid[a] for a, b2, c in links if b2 == hh['id'])
        corner_sg = next((p for p in poles if (p.get('boq') or {}).get('guy') == 'Side guy'), None)  # (every corner of the sample has an arm)
        straight = next(p for p in poles if not (p.get('boq') or {}).get('guy') and not (p.get('boq') or {}).get('arm') and app[p['id']] == 'CA' and (p.get('boq') or {}).get('clamp'))
        ext = next((p for p in poles if re.search('Extension', (p.get('boq') or {}).get('arm', '')) and app[p['id']].startswith('CA+RL')), None)
        sw = next((p for p in poles if (p.get('boq') or {}).get('guy') == 'Sidewalk guy'), None)
        check('1b. examples: the first pole 2A; the last pole before the underground (riser) 2A; a corner with a side guy has GCA; a straight pole CA; arm 26/44 CA+RL; a sidewalk guy on a straight run GCA+CA+RL',
              app[first['id']] == '2A' and app[before_hh['id']] == exp[before_hh['id']] and corner_sg and 'GCA' in app[corner_sg['id']].split('+') and app[straight['id']] == 'CA' and ext and sw and app[sw['id']] == 'GCA+CA+RL',
              (app[first['id']], before_hh['poleId'], app[before_hh['id']], corner_sg and (corner_sg['poleId'], app[corner_sg['id']]), straight['poleId'], ext and (ext['poleId'], app[ext['id']]), sw and app[sw['id']]))
        # 2. the record: CLAMP TYPE, tick DEG on the straight pole
        await pg.evaluate(f"__polecam.map.setView([{straight['lat']}, {straight['lon']}], 20, {{ animate: false }})"); await W(pg, 800)
        await pg.evaluate("(n) => { const m = Object.values(__polecam.map._layers).find((l) => l.getTooltip && l.getTooltip() && l.getTooltip().getContent().startsWith(n)); if (m) m.fire('click'); }", straight['poleId'])
        await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 900)
        await pg.evaluate("document.querySelectorAll('#editor details').forEach((d) => { d.open = true; })")
        row = await pg.evaluate("""() => { const c = document.querySelector('#editor .chips[data-k="clampType"]'); return c ? { label: c.closest('.boqrow').querySelector('.lbl').textContent, chips: [...c.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]) } : null; }""")
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#editor .chips[data-k="clampType"]'); await pg.locator('#editor .chips[data-k="clampType"] button', has_text='DEG').first.click(); await W(pg, 200)
        await pg.evaluate("() => [...document.querySelectorAll('#edSave')].find(e => e.getClientRects().length).click()")
        await pg.wait_for_selector('#editor', state='hidden', timeout=15000); await W(pg, 600)
        saved = await pg.evaluate(f"(__polecam.points.find((x) => x.id === '{straight['id']}').boq || {{}})")
        app2 = await pg.evaluate("__polecam.clamps()")
        check('2. the record has CLAMP TYPE (CA, GCA, 2A, DEG, RL, none ticked: blank); ticking DEG keeps it and the plan uses it, not CA',
              row and [c[0] for c in row['chips']] == ['CA', 'GCA', '2A', 'DEG', 'RL'] and all(c[1] == 'false' for c in row['chips']) and saved.get('clampType') == 'DEG' and app2[straight['id']] == 'DEG' and saved.get('clamp') == (straight.get('boq') or {}).get('clamp'),
              (row, saved, app2[straight['id']]))
        # 3. the plan DXF
        t0 = time.time(); f = await export(pg, 'doDxf', 'plan.zip'); tdxf = round(time.time() - t0, 1)
        zz = zipfile.ZipFile(f); txt = zz.read([n for n in zz.namelist() if n.endswith('.dxf')][0]).decode('utf-8', 'replace')
        import ezdxf
        doc = ezdxf.read(io.StringIO(txt)); msp = doc.modelspace()
        RX = re.compile(r'^(?:CA|GCA|2A|DEG|RL)(?:\+(?:CA|GCA|2A|DEG|RL))*(?: \S+)?$')
        found = []
        for e in msp:
            if e.dxftype() in ('TEXT', 'MTEXT'):
                t = (e.dxf.text if e.dxftype() == 'TEXT' else e.plain_text()).strip()
                if RX.match(t): found.append(t)
        hwn = await pg.evaluate("__polecam.hw()"); nocl = {i for i, h in hwn.items() if h['noClamp']}
        want = collections.Counter(' '.join(x for x in (app2[p['id']], (p.get('boq') or {}).get('clamp', '')) if x) for p in poles if p['id'] not in nocl or (p.get('boq') or {}).get('clampType')) # v2.42.18: no clamp label where no pole clamp
        got = collections.Counter(found)
        check('3a. the plan writes every pole\'s clamps and clamp size, as the app picks them (232 labels, the same set)', got == want, (sum(got.values()), (got - want).most_common(5), (want - got).most_common(5), tdxf))
        st_size = (straight.get('boq') or {}).get('clamp')
        check('3b. labels follow the app (CA only where the clamps are CA); the edited pole reads DEG ' + str(st_size),
              got[f'DEG {st_size}'] >= 1 and sum(v for k, v in got.items() if k.startswith('CA ')) == sum(v for k, v in want.items() if k.startswith('CA ')) and not errs, (got.most_common(10), errs[:3]))
        # 4. KMZ and CSV
        fk = await export(pg, 'doKmz', 'plan.kmz'); kz = zipfile.ZipFile(fk); kml = kz.read([n for n in kz.namelist() if n.endswith('.kml')][0]).decode('utf-8', 'replace')
        fc = await export(pg, 'doCsv', 'plan.csv'); raw = open(fc, 'rb').read()
        if raw[:2] == b'PK': cz = zipfile.ZipFile(io.BytesIO(raw)); csv = cz.read([n for n in cz.namelist() if n.endswith('.csv')][0]).decode('utf-8', 'replace')
        else: csv = raw.decode('utf-8', 'replace')
        hdr = csv.splitlines()[0].split(','); row_ = next((l for l in csv.splitlines() if straight['poleId'] in l), '')
        check('4. the KMZ and the CSV carry clamp_type (the edited pole: DEG)', 'clamp_type' in kml and re.search(r'name="clamp_type">\s*<value>DEG<', kml) and 'clamp_type' in hdr and 'DEG' in row_.split(','),
              ('clamp_type' in kml, hdr[-6:], row_[:200]))
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
