"""(v2.42.28 copy: the owner groups are rows of What to export.)
v2.42.21 copy: Route opens with Route tools and linking by pairs (the route card as before v2.42.21).
v2.42.18 (synthetic data only):
 A. plan features on a synthetic As-Plan line (a site, 72C poles with a telco arm and a junction where a 12C crosses, a 72C -> 12C
    change, 12C poles with a NAP, runs on two spans, owner names): 12C and telco-arm hardware, no clamp size where none is needed,
    loop lengths (own NAP loop on 12C 10 m, a site's entrance loop, a record's own length), a surveyor's loop near the NAP loop flagged,
    several runs (route model, quantities, spans Excel, KMZ, plan DXF, Drawing), owner names (filled, CSV, DXF, drawing groups),
    pole numbers (CSV first column = the plan's numbers; whole project / per owner; keep / renumber), the runs panel in Route.
 B. Share: surveyor phone -> team leader phone: the whole project first, then only the changes (an edit, a new record, a deletion,
    a route change with a run added), numbered updates, a missing update said, a record newer on the leader's phone kept, the whole
    project again; Project details lists who sent which update.
 C. A GLOBE user added by the sheet's Admin users tab only: the emailed code (a wrong try, then the right one), the jobs from the row
    and their change at the next read, the approval QR accepted by a phone whose list does not name the user, the row deleted ->
    GLOBE removed; the sheet's Site required (Yes / No / blank) and the admin box read-only."""
import asyncio, sys, os, shutil, json, zipfile, time, urllib.parse, io, re, math, csv
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from playwright.async_api import async_playwright
import ezdxf, openpyxl
BASE = os.environ.get('BASE', 'http://localhost:8765')
OUT = S + '/v24228/out_218a_v28'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
SEED_H = {e.dxf.handle for e in ezdxf.read(io.StringIO(SEED)).modelspace()}
ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'; LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:1500], flush=True)
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 250)
async def open_card(pg, sel):
    await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate(f"window.__polecam.showExport('{sel}')"); await W(pg, 400)
async def export(pg, sel, name):
    await open_card(pg, sel); await pg.click('#' + sel)
    for _ in range(4000):
        if await pg.locator('#resultBox:not([hidden])').count(): break
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
        await W(pg, 250)
    async with pg.expect_download(timeout=180000) as d: await pg.click('#resSave')
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f); await close_sheets(pg); return f

R_E = 6371008.8
LAT, LON0 = 7.1036, 125.6180
def at(dx, dy=0.0):
    return (LAT + dy / (R_E * math.pi / 180), LON0 + dx / (R_E * math.cos(math.radians(LAT)) * math.pi / 180))
P72 = [50, 100, 150, 200, 250, 300, 350, 400]
P12 = [520, 640, 760, 880, 940, 1000, 1120, 1240, 1360, 1480, 1600, 1720, 1840, 1960]
def synth():
    recs = [{'k': 'S0', 'element': 'Site', 'poleId': 'HOMING SITE', 'status': 'Existing', 'x0': 0, 'siteKind': 'Tower'}]
    for d in P72 + P12:
        b = {'owner': 'Electric'}
        if d == 50: b['ownerName'] = 'CLPC'
        if d == 100: b['ownerName'] = 'DLPC'
        if d == 150: b = {'owner': 'PLDT'}
        r = {'k': f'P{d}', 'element': 'Pole', 'poleId': f'CC-{d:04d}', 'poleType': 'Concrete', 'status': 'Existing', 'x0': d, 'boq': b}
        if d == 200: r['x'] = {'details': [{'item': 'Telco arm', 'qty': 1}]}
        if d == 880: r['x'] = {'nap': True, 'napId': 'NAP-0880'}; r['boq'] = {**b, 'napType': 'NAP 1x8', 'napSz': '8', 'napSt': 'New'}
        recs.append(r)
    recs += [{'k': 'Q1', 'element': 'Pole', 'poleId': 'CC-Q001', 'poleType': 'Concrete', 'status': 'Existing', 'x0': 300, 'y0': 80, 'boq': {'owner': 'Electric', 'ownerName': 'DLPC'}},
             {'k': 'Q2', 'element': 'Pole', 'poleId': 'CC-Q002', 'poleType': 'Concrete', 'status': 'Existing', 'x0': 300, 'y0': -80, 'boq': {'owner': 'Electric', 'ownerName': 'DLPC'}}]
    for r in recs: r['lat'], r['lon'] = at(r['x0'], r.get('y0', 0))
    links = [('S0', 'P50', 'F72', None)]
    for a, b in zip(P72, P72[1:]): links.append((f'P{a}', f'P{b}', 'F72', ['L12', 'L12'] if a == 150 else None))
    links.append(('P400', 'P520', 'L12', None))
    for a, b in zip(P12, P12[1:]): links.append((f'P{a}', f'P{b}', 'L12', ['L12'] if a == 520 else None))
    links += [('Q1', 'P300', 'L12', None), ('P300', 'Q2', 'L12', None)]
    return recs, links
ADD = """([proj, recs, links, t0s]) => { const P = __polecam.points, ids = {}, t0 = Date.parse(t0s || '2026-11-05T01:00:00Z');
  recs.forEach((r, i) => { const id = proj + '_' + r.k; ids[r.k] = id; const t = new Date(t0 + i * 1000).toISOString();
    P.push({ id, project: proj, created: t, takenAt: t, updated: t, source: 'map', poleId: r.poleId, poleType: r.poleType || '', lat: r.lat, lon: r.lon, element: r.element, status: r.status,
      remarks: '', closureId: '', boxes: 0, details: [], marks: [], boq: r.boq || {}, ...(r.siteKind ? { siteKind: r.siteKind } : {}), ...(r.x || {}), by: 'Test surveyor', updatedBy: 'Test surveyor' }); });
  const S = __polecam.S; if (links) S.meta[proj] = { ...(S.meta[proj] || {}), links: links.map(([a, b, c, m]) => (m ? [ids[a], ids[b], c, m] : [ids[a], ids[b], c])) }; __polecam.persist(); __polecam.renderPoles(); return ids; }"""
def qty(rows): return {r[0]: r[1] for r in rows}
def hav(a, b):
    r = math.pi / 180; dl = (b[0] - a[0]) * r; dn = (b[1] - a[1]) * r
    h = math.sin(dl / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dn / 2) ** 2
    return 2 * R_E * math.asin(math.sqrt(h))

# ---- the online sheet (mock): companies, admin users (code by email), site rule
SH = {'adminRows': {'mark@example.com': {'e': 'mark@example.com', 'n': 'Mark Tamse', 'i': '100001', 'm': '09171234567', 'j': 'PAT/FAT inspector, As-Plan approver'},
                    'juan.delacruz@example.com': {'e': 'juan.delacruz@example.com', 'n': 'Juan Dela Cruz', 'i': '200777', 'm': '09170000000', 'j': 'PAT/FAT inspector'}},
      'codes': {}, 'sent': [], 'siteRequired': None, 'posts': []}
JUAN = SH['adminRows'].pop('juan.delacruz@example.com') # added to the tab only after the company list is saved (part C)
CODE = '482913'
async def sheet(route):
    req = route.request; q = urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query)
    if req.method == 'POST':
        try: body = json.loads(req.post_data or '{}')
        except Exception: body = {}
        SH['posts'].append(body.get('action'))
        if body.get('action') == 'adminCode':
            e = str(body.get('email', '')).lower(); ok_key = body.get('key') == 'READ-KEY-TEST'
            if not ok_key: return await route.fulfill(status=200, content_type='application/json', body='{"ok":false,"error":"key"}')
            if e not in SH['adminRows']: return await route.fulfill(status=200, content_type='application/json', body='{"ok":true,"sent":false}')
            SH['codes'][e] = {'c': CODE, 't': 0}; SH['sent'].append(e)
            return await route.fulfill(status=200, content_type='application/json', body='{"ok":true,"sent":true}')
        if body.get('action') == 'adminVerify':
            e = str(body.get('email', '')).lower(); c = SH['codes'].get(e)
            if not c: return await route.fulfill(status=200, content_type='application/json', body='{"ok":false,"error":"expired"}')
            if body.get('code') != c['c']:
                c['t'] += 1; return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': False, 'error': 'code', 'left': 5 - c['t']}))
            del SH['codes'][e]
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'token': 'TOK-' + e, 'user': SH['adminRows'][e]}))
        return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
    out = {'ok': True, 'name': common.SHEET_MOCK['name'], 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}
    if q.get('akey'): out['adminUsers'] = list(SH['adminRows'].values())
    aem = (q.get('aem') or [''])[0].lower()
    if aem: out['adminMe'] = ({'bad': True} if (q.get('atok') or [''])[0] != 'TOK-' + aem else SH['adminRows'].get(aem) or {'gone': True})
    if SH['siteRequired'] is not None: out['siteRequired'] = SH['siteRequired']
    return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))

async def new_ctx(p, udir, w=412):
    ctx = await p.chromium.launch_persistent_context(udir, executable_path=common.CHROME, viewport={'width': w, 'height': 900}, accept_downloads=True, service_workers='block')
    await ctx.route('https://script.google.com/**', sheet)
    for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**'): await ctx.route(u, lambda r: r.abort())
    await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS); await ctx.add_init_script(common.ADM_OPEN_JS)
    pg = ctx.pages[0]; errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    return ctx, pg, errs

async def admin_setup(pg, name, email, users_text):
    await pg.goto(BASE + '/index.html'); await W(pg, 1500)
    await pg.fill('#pfName', name); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', email); await pg.fill('#pfIdNo', '100001')
    await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
    await pg.fill('#admName', 'Globe OSP'); await common.sheet_companies(pg, ['GLOBE', 'SAMPLE VENDOR'], admins=['GLOBE'])
    await pg.fill('#admWriteKey', 'ADMIN-KEY-TEST'); await pg.fill('#admDxfSeed', LINK1)
    if users_text is not None: await pg.fill('#admUsers', users_text)
    await pg.click('#admSave')
    await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
    q = await pg.evaluate("__polecam.lastQr")
    if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
    for _ in range(3):
        if not await pg.locator('#askBox:not([hidden])').count(): break
        b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
    await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
    return q

async def share_get(pg, choice, name):
    """Projects → Share on the open project: pick the choice, save the file (the website's 3 steps) and return its path and the dialog."""
    await pg.evaluate("() => { __polecam.shareProject(); }")
    await pg.wait_for_selector('#askBox:not([hidden])', timeout=20000); await W(pg, 300)
    dlg = await pg.evaluate("() => ({ t: document.getElementById('askTitle').textContent, x: document.getElementById('askText').textContent, b: [...document.querySelectorAll('#askBox button')].map((b) => b.textContent) })")
    await pg.locator('#askBox button', has_text=choice).first.click()
    await pg.wait_for_selector('#sendBox:not([hidden])', timeout=60000); await W(pg, 300)
    btn = '#sendSave2' if await pg.is_visible('#sendSave2') else '#sendSave'
    async with pg.expect_download(timeout=60000) as d: await pg.click(btn)
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f)
    if await pg.is_visible('#sendNo'): await pg.click('#sendNo')
    await W(pg, 300)
    return f, dlg

async def open_file(pg, f, button=None):
    await pg.set_input_files('#sharedInput', f); await pg.wait_for_selector('#askBox:not([hidden])', timeout=30000); await W(pg, 300)
    dlg = await pg.evaluate("() => ({ t: document.getElementById('askTitle').textContent, x: document.getElementById('askText').textContent, b: [...document.querySelectorAll('#askBox button')].map((b) => b.textContent) })")
    if button: await pg.locator('#askBox button', has_text=button).first.click()
    else: await pg.locator('#askBox button.primary').first.click()
    for _ in range(40):
        if not await pg.locator('#askBox:not([hidden])').count() and not await pg.locator('#busy:not([hidden])').count(): break
        await W(pg, 250)
    await W(pg, 600)
    toast = await pg.evaluate("document.getElementById('toast').textContent")
    return dlg, toast

async def main():
    async with async_playwright() as p:
        # ======================= A. the plan features
        ctx, pg, errs = await new_ctx(p, OUT + '/ud_a')
        qr = await admin_setup(pg, 'Mark Tamse', 'mark@example.com', 'mark@example.com PAT/FAT inspector, As-Plan approver')
        recs, links = synth(); R = {r['k']: r for r in recs}
        await common.newproj(pg, 'survey', 'RUNS_PLAN', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['RUNS_PLAN', recs, links, None]); kof = {v: k for k, v in ids.items()}
        hw = {kof[i]: v for i, v in (await pg.evaluate("__polecam.hw()")).items()}
        cl = {kof[i]: v for i, v in (await pg.evaluate("__polecam.clamps()")).items()}
        H = lambda k: [tuple(x) for x in hw[k]['items']]
        check('A1. hardware: 12C pole Retractor 2 + Span clamp 2 and no pole clamp; 12C end 1 + 1; 72C -> 12C pole 1 + 1 with its 72C clamps; the 72C pole a 12C crosses 2 + 2 with clamps; telco arm on 72C: Suspension clamp 1, no pole clamp',
              H('P520') == [('Retractor', 2, '12C'), ('Span clamp', 2, '12C')] and hw['P520']['noClamp'] and cl['P520'] == ''
              and H('P1960') == [('Retractor', 1, '12C'), ('Span clamp', 1, '12C')] and hw['P1960']['noClamp'] and H('Q1') == [('Retractor', 1, '12C'), ('Span clamp', 1, '12C')]
              and H('P400') == [('Retractor', 1, '12C'), ('Span clamp', 1, '12C')] and not hw['P400']['noClamp'] and cl['P400'] != ''
              and H('P300') == [('Retractor', 2, '12C'), ('Span clamp', 2, '12C')] and not hw['P300']['noClamp'] and cl['P300'] != ''
              and H('P200') == [('Suspension clamp', 1, '72C · telco arm')] and hw['P200']['noClamp'] and cl['P200'] == '' and H('P250') == [] and cl['P250'] != '',
              {k: (H(k), hw[k]['noClamp'], cl[k]) for k in ('P520', 'P1960', 'Q1', 'P400', 'P300', 'P200', 'P250')})
        bt = await pg.evaluate("__polecam.boqTable()")
        hs = {}
        for r in bt['rows']:
            if r['cells'][0] in ('Retractor', 'Span clamp', 'J-hook', 'Suspension clamp'): hs[r['cells'][0]] = hs.get(r['cells'][0], 0) + (r['cells'][3] or 0)
        qh = {k: v for k, v in qty(await pg.evaluate("__polecam.surveyQty(__polecam.points.filter((x) => x.project === 'RUNS_PLAN')).rows")).items() if k.startswith('HW_')}
        check('A1b. the BOQ counts the hardware: Retractor 32, Span clamp 32 (13 x 2 on the 12C line, 2 at the crossing, 1 at each 12C end and at the 72C -> 12C pole), Suspension clamp 1 (telco arm); the survey quantities too (HW_ rows)',
              hs == {'Retractor': 32, 'Span clamp': 32, 'Suspension clamp': 1} and sum(v for k, v in qh.items() if 'RETRACTOR' in k) == 32, (hs, qh))
        # the editor of a 12C pole: no clamp size asked, the hardware shown
        async def ed_info(k):
            await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids[k]); await pg.wait_for_selector('#editor:not([hidden])'); await W(pg, 700)
            await pg.evaluate("__polecam.edTab('acc')"); await W(pg, 300)
            return await pg.evaluate("""() => { const t = (k) => { const r = document.querySelector(`#editor .boqrow[data-k="${k}"]`); return r ? r.textContent : null; };
              const lc = document.querySelector('#editor .chips[data-k="mloop"]'); return { clamp: t('clamp'), hw: t('hw'), loop: t('mloop'), miss: __polecam.edMissing(),
              lens: lc ? [...lc.querySelectorAll('.chip')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]) : null }; }""")
        e520 = await ed_info('P520'); await close_sheets(pg)
        e200 = await ed_info('P200'); await close_sheets(pg)
        e880 = await ed_info('P880'); await close_sheets(pg)
        check('A2. the record: a 12C pole says the clamp is not needed and asks no clamp size; its hardware row (Retractor, Span clamp); the telco-arm pole: TELCO ARM hardware; the NAP pole: its loop WITH THE NAP, 10 m pressed (12C)',
              e520['clamp'] and 'Not needed' in e520['clamp'] and not any('clamp' in m and 'Type' not in m for m in e520['miss']) and e520['hw'] and 'Retractor' in e520['hw'] and 'Span clamp' in e520['hw']
              and e200['hw'] and 'TELCO ARM' in e200['hw'] and 'Suspension clamp' in e200['hw'] and e880['loop'] and 'WITH THE NAP' in e880['loop'] and ['10 m', 'true'] in (e880['lens'] or []),
              (e520, e200['hw'], e880['loop'], e880['lens']))
        # loops: lengths
        fl = {kof[i]: v for i, v in (await pg.evaluate("__polecam.filled()")).items()}
        la = {kof[i]: c for i, c in dict(await pg.evaluate("__polecam.autoLoops()")).items()}
        print('auto loops', la, flush=True)
        l12 = sorted([int(k[1:]) for k, c in la.items() if c == 'L12' and k.startswith('P')])
        check('A3. loops: the NAP pole has its own loop on the 12C, 10 m; the site its entrance loop (72C, 15 m); the app\'s 12C loops 10 m and at most 500 + 100 m apart from the NAP loop or each other',
              fl['P880'].get('mloopM') == '10' and fl['S0'].get('mloopM') == '15' and all(fl[f'P{d}'].get('mloopM') == '10' for d in l12)
              and all(abs(b - a) <= 600 for a, b in zip([880] + [d for d in l12 if d > 880], [d for d in l12 if d > 880])) and 880 not in l12,
              ({k: fl[k].get('mloopM') for k in ['S0', 'P880'] + [f'P{d}' for d in l12]}, la))
        # a surveyor's loop 60 m from the NAP loop: kept and flagged; a record's own loop length
        await pg.evaluate("""([a, b]) => { const P = __polecam.points; const p = P.find((x) => x.id === a), q = P.find((x) => x.id === b);
          p.boq = { ...p.boq, mloop: 'Yes' }; q.boq = { ...q.boq, mloop: 'Yes', mloopM: '20' }; __polecam.persist(); __polecam.renderPoles(); }""", [ids['P940'], ids['P1480']])
        adv = await pg.evaluate("__polecam.routeAdvice()")
        flag = [a['text'] for a in adv if a['kind'] == 'flag']
        fl2 = {kof[i]: v for i, v in (await pg.evaluate("__polecam.filled()")).items()}
        check('A4. a loop set by the surveyor 60 m from the NAP loop is kept and flagged ("loop at CC-0940 is 60 m from the NAP loop at …: kept as set"); a loop set to 20 m keeps its 20 m',
              any('CC-0940 is 60 m from the NAP loop' in t and 'kept as set' in t for t in flag) and fl2['P940'].get('mloopM') == '10' and fl2['P1480'].get('mloopM') == '20', (flag, fl2['P940'].get('mloopM'), fl2['P1480'].get('mloopM')))
        # runs: the route model and the quantities
        rt = await pg.evaluate("__polecam.route()")
        q = qty(await pg.evaluate("__polecam.surveyQty(__polecam.points.filter((x) => x.project === 'RUNS_PLAN')).rows"))
        span = rt['total']; extra = rt['cableTotal'] - rt['total']
        check('A5. several runs: two spans with more runs (50 m x 3, 120 m x 2): cable on the spans = route + 220 m; quantities: RUNS_EXTRA 3, RUNS_EXTRA_M 220, DE = the cable; SPAN_L12 counts the extra 12C runs',
              abs(extra - 220) < 0.6 and q.get('RUNS_EXTRA') == 3 and abs(q.get('RUNS_EXTRA_M', 0) - 220) < 0.6 and abs(q.get('DE', 0) - rt['cableTotal']) < 0.2
              and q.get('SPAN_L12', 0) > 0, (span, rt['cableTotal'], {k: v for k, v in q.items() if k.startswith(('RUNS', 'DE', 'SPAN_', 'FOC_TOTAL'))}))
        # the runs panel in Route: tap the span, add a run, change its cable, remove it
        await close_sheets(pg); await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 1200)
        a, b = R['P640'], R['P760']
        await pg.evaluate("([la, lo]) => __polecam.mapView(la, lo, 18)", [(a['lat'] + b['lat']) / 2, (a['lon'] + b['lon']) / 2]); await W(pg, 600)
        pt = await pg.evaluate("([la, lo]) => __polecam.mapPt(la, lo)", [(a['lat'] * 3 + b['lat']) / 4, (a['lon'] * 3 + b['lon']) / 4])
        await pg.mouse.click(pt[0], pt[1]); await W(pg, 700)
        p1 = await pg.evaluate("() => ({ vis: !document.getElementById('rbSpan').hidden, t: document.getElementById('rbSpan').textContent, runs: [...document.querySelectorAll('#rbSpan select')].map((s) => s.value) })")
        await pg.click('#rbSpan button[data-rs=add]'); await W(pg, 500)
        await pg.select_option('#rbSpan select[data-i="1"]', 'F72'); await W(pg, 500)
        p2 = await pg.evaluate("() => ({ runs: [...document.querySelectorAll('#rbSpan select')].map((s) => s.value), title: document.getElementById('rbTitle').textContent, lbl: [...document.querySelectorAll('.span-label')].map((e) => e.textContent).filter((t) => t.includes('×')) })")
        await pg.screenshot(path=OUT + '/a_runs_panel.png')
        lk = await pg.evaluate("(a) => __polecam.S.meta.RUNS_PLAN.links.find((l) => l[0] === a)", ids['P640'])
        await pg.click('#rbSpan button[data-rs=del][data-i="1"]'); await W(pg, 400)
        lk2 = await pg.evaluate("(a) => __polecam.S.meta.RUNS_PLAN.links.find((l) => l[0] === a)", ids['P640'])
        await pg.click('#rbSpan button[data-rs=add]'); await W(pg, 300); await pg.select_option('#rbSpan select[data-i="1"]', 'F72'); await W(pg, 300) # keep it for the exports
        await pg.click('#rbSpan button[data-rs=close]'); await W(pg, 300)
        p3 = await pg.evaluate("() => !document.getElementById('rbSpan').hidden")
        await pg.click('#rbDone'); await W(pg, 500)
        check('A6. Route: tapping a span shows its runs (Run 1 Light 12C); + Add a run, its cable changed to 72C: the link keeps it ([.., L12, [F72]]); the map label says ×2; the title adds the cable length; ✕ removes it; Close hides the panel',
              p1['vis'] and 'CC-0640' in p1['t'] and p1['runs'] == ['L12'] and p2['runs'] == ['L12', 'F72'] and lk[2:] == ['L12', ['F72']] and len(lk2) == 3 and not p3 and any('×2' in t for t in p2['lbl']) and 'cable' in p2['title'],
              (p1, p2, lk, lk2, p3))
        # exports: spans Excel, KMZ, CSV, plan DXF (numbers), Drawing
        fx = await export(pg, 'doRouteXlsx', 'spans.xlsx')
        if zipfile.is_zipfile(fx) and not fx.endswith('.xlsx'): pass
        wb = openpyxl.load_workbook(fx, data_only=True); ws = wb['Spans']; hdr = [c.value for c in ws[1]]; rows = [[c.value for c in r] for r in ws.iter_rows(min_row=2)]
        runs_rows = [r for r in rows if r[1] == 'CC-0150' and r[2] == 'CC-0200']
        check('A7. spans Excel: a Run column after To; the 3-run span is 3 rows (Run 1 72C, Run 2 and 3 Light 12C), same span number; the 640-760 span 2 rows',
              hdr[:5] == ['No.', 'From', 'To', 'Run', 'Length (m)'] and [r[3] for r in runs_rows] == [1, 2, 3] and len({r[0] for r in runs_rows}) == 1
              and [r[6] for r in runs_rows] == ['AE Figure 8 72C FOC', 'Light cable 12C', 'Light cable 12C'] and len([r for r in rows if r[1] == 'CC-0640' and r[2] == 'CC-0760']) == 2, (hdr, runs_rows))
        fk = await export(pg, 'doKmz', 'runs.kmz')
        kz = zipfile.ZipFile(fk); kml = kz.read([n for n in kz.namelist() if n.endswith('.kml')][0]).decode('utf-8')
        check('A8. KMZ: the folder "Other runs on a span (4)"; each extra run its own line with run and cable; the owner name and the loop length in each pole\'s data',
              'Other runs on a span (4)' in kml and '<Data name="run"><value>3</value></Data>' in kml and '<Data name="pole_owner_name"><value>DLPC</value></Data>' in kml and '<Data name="mloop_length_m"><value>10</value></Data>' in kml,
              re.findall(r'<name>[^<]*run \d[^<]*</name>', kml)[:6])
        await pg.evaluate("__polecam.setNumCfg({ mode: 'project', keep: true })")
        fc = await export(pg, 'doCsv', 'table.csv')
        if zipfile.is_zipfile(fc):
            z = zipfile.ZipFile(fc); fc_t = z.read([n for n in z.namelist() if n.endswith('.csv')][0]).decode('utf-8-sig')
        else: fc_t = open(fc, encoding='utf-8-sig').read()
        cr = list(csv.reader(io.StringIO(fc_t))); ch = cr[0]; cd = {r[ch.index('pole_id')] if 'pole_id' in ch else r[1]: r for r in cr[1:]}
        nums = {kof[i]: n for i, n in (await pg.evaluate("__polecam.poleNums()")).items()}
        csv_no = {kof[ids_k]: int(r[0]) for ids_k in ids.values() for pid, r in cd.items() if pid == R[kof[ids_k]]['poleId'] and r[0]}
        oc = ch.index('pole_owner_name') if 'pole_owner_name' in ch else -1
        check('A9. Table · CSV: the first column is no, the pole numbers the plan uses (whole project, 1… along the route from the site); pole_owner_name DLPC / CLPC / PLDT',
              ch[0] == 'no' and csv_no == nums and nums.get('S0') == 1 and nums.get('P50') == 2 and oc > 0 and cd['CC-0100'][oc] == 'DLPC' and cd['CC-0050'][oc] == 'CLPC' and cd['CC-0150'][oc] == 'PLDT',
              (ch[:4], sorted(nums.items(), key=lambda x: x[1])[:6], oc))
        # plan DXF: the job's numbers, the runs, the owner names
        await pg.evaluate("""() => { const wrap = (T) => { if (!T || T.__w) return T; const ob = T.build; T.build = function (seed, job) { window.__job = { seqOf: job.seqOf, more: job.spans.filter((s) => (s.more || []).length).map((s) => s.more), owners: job.pts.filter((p) => p.ownerName).map((p) => [p.id, p.ownerName]) }; return ob.apply(this, arguments); }; T.__w = true; return T; };
          if (window.GeDxfTpl) wrap(window.GeDxfTpl); else { let v; Object.defineProperty(window, 'GeDxfTpl', { configurable: true, get: () => v, set: (x) => { v = wrap(x); } }); } }""")
        await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        fd = await export(pg, 'doDxf', 'runs_plan_dxf.zip')
        job = await pg.evaluate("window.__job")
        z = zipfile.ZipFile(fd); dn = [n for n in z.namelist() if n.endswith('.dxf')]; raw = z.read(dn[0]).decode('utf-8', 'replace')
        doc = ezdxf.read(io.StringIO(raw.replace('\r\n', '\n'))); msp = [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
        texts = [(e.dxf.text if e.dxftype() == 'TEXT' else e.text) for e in msp if e.dxftype() in ('TEXT', 'MTEXT')]
        seq_ok = all(job['seqOf'].get(ids[k]) == n for k, n in nums.items())
        check('A10. plan DXF: the plan uses the CSV\'s numbers; the extra runs go to the plan (3 spans with more runs); (v2.42.23) the span lengths are the length only (no RUNS), each run its own cable label; the owner names DLPC, CLPC, PLDT beside existing poles',
              seq_ok and len(job['more']) == 3 and not any('RUNS)' in t for t in texts) and sum(t.startswith('PROPOSED') for t in texts) >= 3 + 2 * 2 and {'DLPC', 'CLPC', 'PLDT'} <= {o for _, o in job['owners']} and any(t.strip() == 'DLPC' for t in texts),
              (seq_ok, job['more'], [t for t in texts if 'RUNS' in t][:4], sorted({o for _, o in job['owners']})))
        # per owner: the electric poles of each coop from 1
        await pg.evaluate("__polecam.setNumCfg({ mode: 'owner', keep: true })")
        on = {kof[i]: n for i, n in (await pg.evaluate("__polecam.poleNums()")).items()}
        grp = await pg.evaluate("() => __polecam.mxGroups().map((g) => g.name).join(' | ')")  # v2.42.28: the rows of What to export
        check('A11. per pole owner: DLPC poles 1, 2, 3 (P100, Q1, Q2 along the route), CLPC 1, PLDT 1; What to export has a row per owner name',
              on.get('P50') == 1 and on.get('P150') == 1 and sorted([on.get('P100'), on.get('Q1'), on.get('Q2')]) == [1, 2, 3] and 'DLPC' in grp and 'CLPC' in grp, ({k: on.get(k) for k in ('P50', 'P100', 'Q1', 'Q2', 'P150')}, grp[:300]))
        await pg.evaluate("__polecam.setNumCfg({ mode: 'project', keep: true })")
        # keep vs renumber: a new pole between P50 and P100 keeps the others' numbers; renumber gives the route order
        nid = await pg.evaluate(ADD, ['RUNS_PLAN', [{'k': 'N75', 'element': 'Pole', 'poleId': 'CC-0075', 'poleType': 'Concrete', 'status': 'Existing', 'lat': at(75)[0], 'lon': at(75)[1], 'boq': {'owner': 'Electric', 'ownerName': 'DLPC'}}], None, '2026-11-05T05:00:00Z'])
        await pg.evaluate("""([a, b, n]) => { const S = __polecam.S, L = S.meta.RUNS_PLAN.links, i = L.findIndex((l) => l[0] === a && l[1] === b); L.splice(i, 1, [a, n, 'F72'], [n, b, 'F72']); __polecam.persist(); __polecam.renderPoles(); }""", [ids['P50'], ids['P100'], nid['N75']])
        k1 = await pg.evaluate("__polecam.poleNums()")
        await pg.evaluate("__polecam.setNumCfg({ keep: false })"); k2 = await pg.evaluate("__polecam.poleNums()")
        check('A12. keep numbers: a pole added between 50 and 100 takes the next free number and the others keep theirs; renumber: 1, 2, 3… along the route again',
              k1[ids['P100']] == nums['P100'] and k1[nid['N75']] == max(nums.values()) + 1 and k2[nid['N75']] == 3 and k2[ids['P100']] == 4, (k1[nid['N75']], k1[ids['P100']], k2[nid['N75']], k2[ids['P100']]))
        await pg.evaluate("__polecam.setNumCfg({ keep: true })")
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1800); await pg.screenshot(path=OUT + '/a_drawing.png'); await close_sheets(pg)
        check('A13. no page errors (A)', not errs, errs[:5])
        await ctx.close()

        # ======================= B. Share: surveyor -> team leader
        cS, pS, eS = await new_ctx(p, OUT + '/ud_s'); qS = await admin_setup(pS, 'Juan Dela Cruz', 'juan.delacruz@example.com', None)
        cT, pT, eT = await new_ctx(p, OUT + '/ud_t'); qT = await admin_setup(pT, 'Ana Reyes', 'ana.reyes@example.com', None)
        await common.newproj(pS, 'survey', 'SHARE_PLAN', purpose='As-plan'); await close_sheets(pS)
        small = [r for r in recs if r['k'] in ('S0', 'P50', 'P100', 'P150', 'P200', 'P250')]
        sids = await pS.evaluate(ADD, ['SHARE_PLAN', small, [l for l in links if l[0] in ('S0', 'P50', 'P100', 'P150', 'P200') and l[1] in ('P50', 'P100', 'P150', 'P200', 'P250')], None])
        f1, d1 = await share_get(pS, 'The whole project', 'share1.zip')
        z1 = zipfile.ZipFile(f1); b1 = json.loads(z1.read('bundle.json')); pj1 = json.loads(z1.read('p1/points.json'))
        m1 = await pS.evaluate("__polecam.S.meta.SHARE_PLAN.shares")
        check('B1. the first share: only "The whole project" (the first share of a project is whole); the file is update 1, whole, all 6 records; the surveyor\'s phone keeps update 1 as shared; the sender\'s share count is not in the file',
              'first share' in d1['x'] and d1['b'] == ['Cancel', 'The whole project'] and b1.get('update', {}).get('n') == 1 and b1['update']['full'] and len(pj1['points']) == 6 and m1['n'] == 1 and 'shares' not in pj1['meta'], (d1, b1.get('update'), m1))
        g1, t1 = await open_file(pT, f1)
        tp = await pT.evaluate("__polecam.points.filter((x) => x.project === 'SHARE_PLAN').length")
        check('B2. the team leader opens it: "Project from Juan Dela Cruz", update 1 · the whole project; Open the project; 6 records; the toast names the update',
              g1['t'] == 'Project from Juan Dela Cruz' and 'update 1 · the whole project' in g1['x'] and 'Open the project' in g1['b'] and tp == 6 and 'update 1' in t1, (g1, t1, tp))
        # the surveyor works: an edit, a new record, a deletion (the bin), a run added on a span (Route)
        await pS.evaluate("(id) => { const p = __polecam.points.find((x) => x.id === id); p.remarks = 'leaning, check'; p.updated = new Date().toISOString(); __polecam.persist(); }", sids['P100'])
        await pS.evaluate(ADD, ['SHARE_PLAN', [{'k': 'P300', 'element': 'Pole', 'poleId': 'CC-0300', 'poleType': 'Concrete', 'status': 'Existing', 'lat': at(300)[0], 'lon': at(300)[1], 'boq': {'owner': 'Electric', 'ownerName': 'DLPC'}}], None, '2030-01-01T00:00:00Z'])
        await pS.evaluate("(id) => __polecam.openEditorFor(id)", sids['P250']); await pS.wait_for_selector('#editor:not([hidden])'); await W(pS, 600)
        await pS.click('#edTrash'); await pS.wait_for_selector('#askBox:not([hidden])'); await pS.locator('#askBox button', has_text='Delete').click(); await W(pS, 900)
        await close_sheets(pS); await pS.click('#routeBtn'); await pS.wait_for_timeout(500); await pS.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pS, 1200)
        a, b = R['P50'], R['P100']; await pS.evaluate("([la, lo]) => __polecam.mapView(la, lo, 18)", [(a['lat'] + b['lat']) / 2, (a['lon'] + b['lon']) / 2]); await W(pS, 600)
        pt = await pS.evaluate("([la, lo]) => __polecam.mapPt(la, lo)", [(a['lat'] + b['lat']) / 2, (a['lon'] * 3 + b['lon']) / 4])
        await pS.mouse.click(pt[0], pt[1]); await W(pS, 600); await pS.click('#rbSpan button[data-rs=add]'); await W(pS, 400); await pS.click('#rbDone'); await W(pS, 400)
        f2, d2 = await share_get(pS, 'Only the changes', 'share2.zip')
        z2 = zipfile.ZipFile(f2); b2 = json.loads(z2.read('bundle.json')); pj2 = json.loads(z2.read('p1/points.json'))
        check('B3. the second share offers Only the changes · for your team leader (1 record changed · 1 new · 1 deleted · the route; update 2) and The whole project; the file has the 2 records, the deletion and the route with its run',
              d2['b'][0] == 'Only the changes · for your team leader' and 'The whole project' in d2['b'] and '1 record changed' in d2['x'] and '1 new' in d2['x'] and '1 deleted' in d2['x'] and 'the route' in d2['x'] and 'This is update 2' in d2['x']
              and b2['update'] == {'n': 2, 'full': False, 'sender': 'juan.delacruz@example.com'} and len(pj2['points']) == 2 and sids['P250'] in pj2['meta'].get('gone', {}) and any(len(l) == 4 for l in pj2['meta'].get('links', [])),
              (d2, b2.get('update'), len(pj2['points'])))
        g2, t2 = await open_file(pT, f2)
        st = await pT.evaluate("""(ids) => { const P = __polecam.points.filter((x) => x.project === 'SHARE_PLAN'), m = __polecam.S.meta.SHARE_PLAN;
          return { n: P.length, rem: (P.find((x) => x.id === ids[0]) || {}).remarks, gone: !P.some((x) => x.id === ids[1]), runs: (m.links || []).filter((l) => l.length === 4).length, nLinks: (m.links || []).length,
            recv: m.recv, up: (m.updates || []).map((u) => [u.n, u.full, u.from, u.recs, u.gone, u.route]) }; }""", [sids['P100'], sids['P250']])
        check('B4. the leader applies the changes ("Changes from Juan Dela Cruz", update 2: 1 record changed · 1 new · 1 deleted · the route; Apply changes): the edit is there, the new pole, the deleted pole gone, the route with its run (and without the deleted pole\'s span)',
              g2['t'] == 'Changes from Juan Dela Cruz' and 'update 2' in g2['x'] and '1 record changed' in g2['x'] and '1 new' in g2['x'] and '1 deleted' in g2['x'] and 'the route' in g2['x'] and 'Apply changes' in g2['b']
              and st['n'] == 6 and st['rem'] == 'leaning, check' and st['gone'] and st['runs'] == 2 and st['nLinks'] == 4 and st['up'][-1][:2] == [2, False], (g2, t2, st))
        # update 3 is made but not sent to the leader; update 4 is opened: the leader's phone says update 3 is missing
        await pS.evaluate("(id) => { const p = __polecam.points.find((x) => x.id === id); p.remarks = 'u3'; p.updated = new Date().toISOString(); __polecam.persist(); }", sids['P150'])
        f3, d3 = await share_get(pS, 'Only the changes', 'share3.zip')
        await W(pS, 1100)
        # the leader edits P200 (newer there); the surveyor edits P200 and P50 before update 4
        await pS.evaluate("(ids) => ids.forEach((id) => { const p = __polecam.points.find((x) => x.id === id); p.remarks = 'u4 surveyor'; p.updated = new Date().toISOString(); }) || __polecam.persist()", [sids['P200'], sids['P50']])
        await W(pS, 1100)
        await pT.evaluate("(id) => { const p = __polecam.points.find((x) => x.id === id); p.remarks = 'leader edit'; p.updated = new Date(Date.now() + 60000).toISOString(); __polecam.persist(); }", sids['P200'])
        f4, d4 = await share_get(pS, 'Only the changes', 'share4.zip')
        g4, t4 = await open_file(pT, f4)
        st4 = await pT.evaluate("(ids) => ids.map((id) => (__polecam.points.find((x) => x.id === id) || {}).remarks)", [sids['P200'], sids['P50'], sids['P150']])
        check('B5. update 4 opened without update 3: "Update 3 from Juan has not been opened on this phone … share The whole project once"; the record edited later on the leader\'s phone is newer there and stays; the other change applied; update 3\'s change is not there',
              'update 4' in g4['x'] and 'Update 3 from Juan has not been opened' in g4['x'] and 'The whole project' in g4['x'] and '1 record is newer on this phone' in g4['x'] and st4 == ['leader edit', 'u4 surveyor', ''], (g4, t4, st4))
        f5, d5 = await share_get(pS, 'The whole project', 'share5.zip')
        g5, t5 = await open_file(pT, f5)
        st5 = await pT.evaluate("(ids) => ids.map((id) => (__polecam.points.find((x) => x.id === id) || {}).remarks)", [sids['P150']])
        await pT.click('#projectBtn'); await W(pT, 500); await pT.evaluate("document.getElementById('curMore').open = true"); await W(pT, 300)
        lines = await pT.evaluate("document.getElementById('curUpdates').textContent"); await pT.screenshot(path=OUT + '/b_leader_details.png'); await close_sheets(pT)
        check('B6. the whole project (update 5) fills the gap (no warning; update 3\'s change is there now); Project details lists the updates received, with who sent them',
              'not been opened' not in g5['x'] and 'the whole project' in g5['x'] and st5 == ['u3'] and 'Received: update 5 (the whole project) from Juan Dela Cruz' in lines and 'update 4 from Juan Dela Cruz' in lines, (g5['x'][:300], st5, lines))
        # the leader deletes a pole; the surveyor's next whole project does not bring it back
        await pT.evaluate("(id) => __polecam.openEditorFor(id)", sids['P150']); await pT.wait_for_selector('#editor:not([hidden])'); await W(pT, 600)
        await pT.click('#edTrash'); await pT.wait_for_selector('#askBox:not([hidden])'); await pT.locator('#askBox button', has_text='Delete').click(); await W(pT, 900); await close_sheets(pT)
        f6, d6 = await share_get(pS, 'The whole project', 'share6.zip')
        g6, t6 = await open_file(pT, f6)
        st6 = await pT.evaluate("(id) => __polecam.points.some((x) => x.id === id)", sids['P150'])
        check('B6b. a pole the leader deleted after the surveyor\'s last change stays deleted when the whole project comes again ("1 record deleted on this phone since: it stays deleted")',
              '1 record deleted on this phone since: it stays deleted' in g6['x'] and not st6, (g6['x'][:400], st6))
        log = await pT.evaluate("JSON.stringify(__polecam.LOG.all())")
        check('B7. no page errors (B); the App log has share.update.open (5 times) without the sender\'s name', not eS and not eT and log.count('share.update.open') == 5 and 'Juan' not in log, (eS[:3], eT[:3], log.count('share.update.open')))
        await cS.close(); await cT.close()

        # ======================= C. a GLOBE user from the sheet's Admin users tab
        cA, pA, eA = await new_ctx(p, OUT + '/ud_ca')
        await admin_setup(pA, 'Mark Tamse', 'mark@example.com', 'mark@example.com PAT/FAT inspector, As-Plan approver')
        await pA.click('#settingsBtn'); await W(pA, 400); await pA.click('#inviteAdminStaff'); await pA.wait_for_selector('#qrShow:not([hidden])', timeout=15000); await W(pA, 400)
        inv = await pA.evaluate("__polecam.lastQr"); await close_sheets(pA); print('invite', inv[:200], flush=True)
        SH['adminRows']['juan.delacruz@example.com'] = dict(JUAN) # the admin adds the row after the list was saved: no new list
        cG, pG, eG = await new_ctx(p, OUT + '/ud_cg', w=390)
        if '#' in inv: await pG.goto(BASE + '/index.html' + inv[inv.index('#'):]); await W(pG, 3000)
        else:
            await pG.goto(BASE + '/index.html'); await W(pG, 1500); await pG.click('#pfPaste'); await pG.wait_for_selector('#promptBox:not([hidden])')
            await pG.fill('#promptInput', inv); await pG.click('#promptYes'); await W(pG, 1500)
        for _ in range(3):
            if not await pG.is_visible('#askBox'): break
            await pG.click('#askBox button.primary'); await W(pG, 800)
        await pG.fill('#pfName', 'Juan Dela Cruz'); await pG.fill('#pfMobile', '09170000000'); await pG.fill('#pfEmail', 'juan.delacruz@example.com'); await pG.fill('#pfIdNo', '200777')
        await pG.click('#pfSave'); await pG.wait_for_selector('#pinBox:not([hidden])', timeout=30000); await W(pG, 400)
        c1 = await pG.evaluate("() => ({ t: document.getElementById('pinTitle').textContent, type: document.getElementById('pinInput').type })")
        await pG.fill('#pinInput', '111111'); await pG.click('#pinYes'); await W(pG, 900)
        c2 = await pG.evaluate("() => ({ t: document.getElementById('pinTitle').textContent, vis: !document.getElementById('pinBox').hidden, toast: document.getElementById('toast').textContent })")
        await pG.fill('#pinInput', CODE); await pG.click('#pinYes'); await W(pG, 1200)
        c3 = await pG.evaluate("() => ({ t: document.getElementById('pinTitle').textContent, vis: !document.getElementById('pinBox').hidden, me: __polecam.S.adminMe && { e: __polecam.S.adminMe.e, jobs: __polecam.S.adminMe.jobs, tok: __polecam.S.adminMe.tok } })")
        if c3['vis'] and 'PIN' in c3['t']: await pG.fill('#pinInput', '1234'); await pG.click('#pinYes'); await W(pG, 1500)
        c4 = await pG.evaluate("() => ({ co: __polecam.S.user && __polecam.S.user.company, ok: __polecam.adminOk(), jobs: __polecam.jobsOf('juan.delacruz@example.com') })")
        check('C1. a GLOBE user not in the company list: the sheet emails a code (the address is on its Admin users tab), the code is shown as typed; a wrong code: try again (4 tries left); the right one: that row and its job (PAT/FAT inspector); then the admin PIN; saved as GLOBE',
              'Code sent to juan.delacruz@example.com' in c1['t'] and c1['type'] == 'text' and 'Code sent' in c2['t'] and c2['vis'] and '4 tries left' in c2['toast']
              and c3['me'] == {'e': 'juan.delacruz@example.com', 'jobs': ['acc'], 'tok': 'TOK-juan.delacruz@example.com'} and c4 == {'co': 'GLOBE', 'ok': True, 'jobs': ['acc']} and SH['sent'] == ['juan.delacruz@example.com'],
              (c1, c2, c3, c4, SH['sent'], SH['posts']))
        # the job changed in the tab: the phone follows at its next read
        SH['adminRows']['juan.delacruz@example.com']['j'] = 'PAT/FAT inspector, As-Plan approver'
        await pG.evaluate("__polecam.cloudSync(true)"); await W(pG, 800)
        j2 = await pG.evaluate("__polecam.jobsOf('juan.delacruz@example.com')")
        # the approval QR, scanned by the admin phone whose list names only mark@example.com: accepted for an As-Plan task (sv)
        txt = await pG.evaluate("__polecam.apprText()")
        await common.newproj(pA, 'survey', 'APPR_PLAN', purpose='As-plan'); await close_sheets(pA)
        ap = await pA.evaluate("(t) => __polecam.readApproval(t, 'APPR_PLAN').then((r) => ({ ok: true, n: r.n, job: r.job }), (e) => ({ ok: false, e: e.message }))", txt)
        listed = await pA.evaluate("__polecam.adminOk('juan.delacruz@example.com')")
        check('C2. the job changed in the Admin users tab: the phone follows at its next read (PAT/FAT inspector + As-Plan approver); its approval QR is accepted for an As-Plan task by a phone whose list does not name the user (signed with the list key, from the sheet)',
              sorted(j2) == ['As-plan', 'acc'] and ap.get('ok') and ap.get('job') == 'As-plan' and not listed, (j2, ap, listed))
        # the row deleted: GLOBE removed from the phone
        del SH['adminRows']['juan.delacruz@example.com']
        await pG.evaluate("__polecam.cloudSync(true)"); await W(pG, 1200)
        c5 = await pG.evaluate("() => ({ co: __polecam.S.user && __polecam.S.user.company, gone: !!(__polecam.S.adminMe && __polecam.S.adminMe.gone), prof: !document.getElementById('profile').hidden, err: document.getElementById('pfErr').textContent })")
        check('C3. the row deleted from the Admin users tab: at the next read the phone is no longer GLOBE (Your details opens: choose your own company)', c5['co'] == '' and c5['gone'] and c5['prof'] and 'GLOBE' in c5['err'], c5)
        # an address not on the tab: no code, said
        await pG.fill('#pfEmail', 'someone@example.com'); await pG.evaluate("() => { const s = document.getElementById('pfCompany'); if ([...s.options].some((o) => o.value === 'GLOBE')) { s.value = 'GLOBE'; s.dispatchEvent(new Event('change', { bubbles: true })); } }")
        await pG.click('#pfSave'); await W(pG, 1500)
        c6 = await pG.evaluate("document.getElementById('pfErr').textContent")
        check('C4. an address that is not on the Admin users tab: no code sent, the phone says to ask the admin to add a row', 'not on the Admin users tab' in c6 and SH['sent'] == ['juan.delacruz@example.com'], c6)
        # the site rule from the sheet
        SH['siteRequired'] = True; await pA.evaluate("__polecam.cloudSync(true)"); await W(pA, 800); s1 = await pA.evaluate("__polecam.siteReq()")
        await pA.click('#settingsBtn'); await W(pA, 300)
        await pA.evaluate("() => document.getElementById('teamManage').click()"); await W(pA, 500)
        if await pA.is_visible('#admPin'): await pA.fill('#admPin', '1234'); await pA.click('#admUnlock'); await W(pA, 700)
        bx = await pA.evaluate("() => ({ c: document.getElementById('admSiteReq').checked, d: document.getElementById('admSiteReq').disabled, n: document.getElementById('admSiteReqNote').textContent })")
        await close_sheets(pA)
        SH['siteRequired'] = False; await pA.evaluate("__polecam.cloudSync(true)"); await W(pA, 800); s2 = await pA.evaluate("__polecam.siteReq()")
        SH['siteRequired'] = None; await pA.evaluate("__polecam.cloudSync(true)"); await W(pA, 800); s3 = await pA.evaluate("__polecam.siteReq()")
        check('C5. Site required from the sheet: Yes -> required on the phone, the admin box ticked and read-only ("Set in the online sheet … Yes"); No -> not required; blank -> the list\'s setting (not set: no)',
              s1 is True and bx['c'] and bx['d'] and 'Site required = Yes' in bx['n'] and s2 is False and s3 is False, (s1, bx, s2, s3))
        check('C6. no page errors (C)', not eA and not eG, (eA[:3], eG[:3]))
        await cA.close(); await cG.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)

asyncio.run(main())
