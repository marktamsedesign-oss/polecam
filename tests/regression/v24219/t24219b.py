"""v2.42.19 (synthetic data only): site details typed in when there is no site of the sheet; with the sheet's Site required on, the filled
fields are locked and the empty ones can be filled in (New project and Project details); New project: Cancel."""
import asyncio, sys, os, shutil, json, urllib.parse
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
OUT = S + '/v24219/out_b'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:1500], flush=True)
W = lambda pg, ms: pg.wait_for_timeout(ms)
COLS = [['Project Name', 'FOC RELOC'], ['Serial Number', 'TRS-PSOW25-2699'], ['PLA ID', ''], ['SearchRing Name/Site Name/Segment Name', 'AGDAO-POI 1 (AGDAO)']]
TASK = {'id': 'T-0001', 'project': 'AGDAO-POI 1 (AGDAO)', 'category': '', 'site': '', 'contractor': 'SAMPLE VENDOR', 'company': '', 'status': 'Active', 'region': 'MIN', 'territory': 'T1', 'cols': COLS, 'extra': []}
SH = {'siteRequired': None}
async def sheet(route):
    if route.request.method == 'POST': return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    out = {'ok': True, 'name': 'Test sheet', 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [TASK], 'packs': [], 'scope': 'all', 'strict': False}
    if SH['siteRequired'] is not None: out['siteRequired'] = SH['siteRequired']
    return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 250)
FIELDS = """() => { const b = document.getElementById('npSiteFields'); return { vis: !b.hidden, head: (b.querySelector('b') || {}).textContent, rows: [...b.querySelectorAll('.sf')].map((r) => [r.querySelector('span').textContent, r.querySelector('input').value, r.querySelector('input').readOnly]), note: (b.querySelector('.hint') || {}).textContent }; }"""
CUR = FIELDS.replace("npSiteFields", "curSiteFields")
async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(OUT + '/ud', executable_path=common.CHROME, viewport={'width': 412, 'height': 900}, accept_downloads=True, service_workers='block')
        await ctx.route('https://script.google.com/**', sheet)
        for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**'): await ctx.route(u, lambda r: r.abort())
        for js in (common.NO_DRAFT_JS, common.NO_SAVECHECK_JS, common.NO_SAMPLE_JS, common.ADM_OPEN_JS): await ctx.add_init_script(js)
        pg = ctx.pages[0]; errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(BASE + '/index.html'); await W(pg, 1500)
        await pg.fill('#pfName', 'Juan Dela Cruz'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'juan.delacruz@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await common.sheet_companies(pg, ['GLOBE', 'SAMPLE VENDOR'], admins=['GLOBE'])
        await pg.click('#admSave'); await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
        if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
        for _ in range(3):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        await pg.evaluate("() => { const S = __polecam.S; S.user = { ...S.user, regions: ['MIN'], terrs: ['T1'] }; __polecam.persist(); }")
        await pg.evaluate("__polecam.cloudSync(true)"); await W(pg, 800)
        # 1. Cancel
        n0 = await pg.evaluate("__polecam.S.projects.length")
        await pg.click('#projectBtn'); await W(pg, 400); await pg.click('#newProjBtn'); await W(pg, 500)
        foot = await pg.evaluate("[...document.querySelectorAll('#newProj .foot button')].map((b) => b.textContent)")
        await pg.select_option('#npCat', 'survey'); await pg.fill('#npName', 'NOT_MADE'); await pg.click('#npCancel'); await W(pg, 500)
        c1 = await pg.evaluate("({ open: !document.getElementById('newProj').hidden, n: __polecam.S.projects.length })")
        await pg.click('#newProjBtn'); await W(pg, 500); again = await pg.evaluate("[document.getElementById('npName').value, document.getElementById('npCat').value]")
        check('1. New project: Cancel beside Create project; Cancel closes it without a project; opened again, the form is empty', foot == ['Cancel', 'Create project'] and c1 == {'open': False, 'n': n0} and again == ['', ''], (foot, c1, again))
        # 2. no site of the sheet, Site required off: the details typed in (the sheet's columns)
        f0 = await pg.evaluate(FIELDS)
        await pg.select_option('#npCat', 'survey'); await pg.select_option('#npPurpose', 'As-plan'); await pg.fill('#npName', 'OWN_SITE')
        vals = ['MY PROJECT', 'TRS-TEST-0001', 'MIN9999', 'MY SITE']
        for i, v in enumerate(vals): await pg.fill(f'#npSiteFields input[data-i="{i}"]', v)
        await pg.screenshot(path=OUT + '/np_typed.png'); await pg.click('#npCreate'); await W(pg, 900)
        m = await pg.evaluate("(() => { const m = __polecam.S.meta.OWN_SITE || {}; return { F: m.siteFields, siteName: m.siteName, plaId: m.plaId, serial: m.serial }; })()")
        check('2. no site chosen (Site required off): SITE DETAILS with the sheet\'s columns, empty and editable; typed in, they are kept with the project (and its title-block fields)',
              f0['vis'] and f0['head'] == 'Site details' and [r[0] for r in f0['rows']] == [c[0] for c in COLS] and all(r[1] == '' and not r[2] for r in f0['rows'])
              and m['F'] == [[c[0], v] for c, v in zip(COLS, vals)] and m['siteName'] == 'MY SITE' and m['plaId'] == 'MIN9999' and m['serial'] == 'TRS-TEST-0001', (f0, m))
        await close_sheets(pg)
        # 3. Site required on: the site's filled fields locked, the empty one (PLA ID) typed in
        SH['siteRequired'] = True; await pg.evaluate("__polecam.cloudSync(true)"); await W(pg, 800)
        await pg.click('#projectBtn'); await W(pg, 400); await pg.click('#newProjBtn'); await W(pg, 600)
        await pg.click('#npSitesBtn'); await W(pg, 400); await pg.locator('#npSiteList button').first.click(); await W(pg, 500)
        f1 = await pg.evaluate(FIELDS)
        await pg.select_option('#npCat', 'survey'); await pg.select_option('#npPurpose', 'As-plan'); await W(pg, 200)
        await pg.fill('#npSiteFields input[data-i="2"]', 'MIN2463')
        nm = await pg.input_value('#npName'); await pg.screenshot(path=OUT + '/np_locked.png'); await pg.click('#npCreate'); await W(pg, 900)
        m2 = await pg.evaluate("(n) => (__polecam.S.meta[n] || {}).siteFields", nm)
        check('3. Site required on, a site of the sheet: its filled fields are locked (Project Name, Serial Number, site name), the empty PLA ID can be typed in; kept with the project',
              [r[2] for r in f1['rows']] == [True, True, False, True] and 'filled fields are locked' in (f1['note'] or '') and m2 == [['Project Name', 'FOC RELOC'], ['Serial Number', 'TRS-PSOW25-2699'], ['PLA ID', 'MIN2463'], ['SearchRing Name/Site Name/Segment Name', 'AGDAO-POI 1 (AGDAO)']], (f1, nm, m2))
        await close_sheets(pg)
        # 4. Project details: locked while Site required is on; editable again when off
        await pg.click('#projectBtn'); await W(pg, 400); await pg.evaluate("document.getElementById('curMore').open = true"); await W(pg, 300)
        d1 = await pg.evaluate(CUR); await close_sheets(pg)
        SH['siteRequired'] = False; await pg.evaluate("__polecam.cloudSync(true)"); await W(pg, 800)
        await pg.click('#projectBtn'); await W(pg, 400); await pg.evaluate("document.getElementById('curMore').open = true"); await W(pg, 300)
        d2 = await pg.evaluate(CUR)
        await pg.fill('#curSiteFields input[data-i="0"]', 'FOC RELOC 2'); await W(pg, 200)
        m3 = await pg.evaluate("(n) => (__polecam.S.meta[n] || {}).siteFields[0]", nm)
        check('4. Project details: with Site required on every filled field is locked; off, all can be changed (and the change is kept)',
              all(r[2] for r in d1['rows']) and not any(r[2] for r in d2['rows']) and m3 == ['Project Name', 'FOC RELOC 2'], (d1['rows'], d2['rows'], m3))
        check('5. no page errors', not errs, errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
