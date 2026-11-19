"""v2.42.24 copy: the spans linked in capture order by the test hook (the route screen's button now makes cables). v2.42.21 copy: Route opens with Route tools and linking by pairs (the route card as before v2.42.21).
v2.42.0 (phone): two boxes on one pole, the reopened pole keeps them, the arm's length on the plan, the vendor invite.
 1. a pole with an LCP 1x4 (DVO_003_L913_L01): + 2nd box offers NAP 1x16, New; ID DVO_003_L913_N02; saved on the pole
 2. reopened from the Records list: NAP ticked, both boxes and their IDs back, the closure ticked; saved again unchanged: all kept
    (v2.41 dropped the NAP and closure of a reopened pole)
 3. the BOQ (LCP 1x4 and NAP 1x16 with their IDs), the CSV (nap_id, nap2_id) and the KMZ (nap2_type, nap2_id)
 4. the plan: the LCP and the NAP 1:16 side by side on the cable at the pole, each with its ID; an extension arm 44.5" drawn at its
    own length (7 m: scale ~2, as v2.37), not ~0.65
 5. Settings on the admin phone: Invite a vendor and Invite admin staff (Share list hidden). Invite a vendor lists FADI and NOKIA, not
    GLOBE (admin); "Let the user choose" asks the sheet for an invite for ['*'] and the QR link says cos=* with the code; one vendor
    (FADI): co=FADI and the code; Invite admin staff: the invite for GLOBE
 6. a new phone opening the any-vendor link: its company list offers FADI and NOKIA only; no page errors"""
import asyncio, sys, os, shutil, json, zipfile, io, re, time, csv as csvmod
# v2.42.8: the plan DXF is written with CRLF line ends (AutoCAD's own); ezdxf.read() on a text stream expects universal newlines
class _UStringIO(io.StringIO):
    def __init__(self, s='', *a, **k): super().__init__(s.replace('\r\n', '\n') if isinstance(s, str) else s, *a, **k)
io.StringIO = _UStringIO
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common
from common import newproj, skipscan, sheet_companies
from playwright.async_api import async_playwright
import ezdxf, openpyxl
BASE = os.environ.get('BASE', 'http://localhost:8765')
D = S + '/v242'; OUT = S + '/v24218/tests/out_242v18'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
SEED = open(PRIV + '/template/seed.dxf', encoding='utf-8').read()
ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'; LINK1 = f'https://drive.google.com/file/d/{ID1}/view?usp=sharing'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:1400], flush=True)
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def close_sheets(pg):
    for _ in range(8):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(pg, 250)
async def capture(pg, cur, lat, lon):
    cur.update({'latitude': lat, 'longitude': lon, 'accuracy': 3}); await W(pg, 1300)
    await pg.click('#captureBtn'); await W(pg, 1300)
    await pg.click('#shutter'); await W(pg, 2500); await skipscan(pg)
    await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 900)
async def save(pg):
    await pg.evaluate("() => [...document.querySelectorAll('#edSave, #edSaveTop')].find(e => e.getClientRects().length).click()")
    await pg.wait_for_selector('#editor', state='hidden', timeout=15000); await W(pg, 700)
async def export(pg, sel, name):
    await close_sheets(pg); await pg.click('#exportBtn'); await W(pg, 300); await pg.evaluate(f"window.__polecam.showExport('{sel}')"); await W(pg, 400)
    await pg.evaluate(f"document.getElementById('{sel}').click()")
    for _ in range(1200):
        if await pg.locator('#resultBox:not([hidden])').count(): break
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click()
        await W(pg, 250)
    async with pg.expect_download(timeout=120000) as d: await pg.click('#resSave')
    v = await d.value; f = f'{OUT}/{name}'; await v.save_as(f); await close_sheets(pg); return f
POLES = [(7.10000, 125.60000), (7.10030, 125.60020), (7.10060, 125.60040), (7.10090, 125.60060)]
POSTS = []
async def main():
    async def sheet(route):
        req = route.request
        if req.method == 'POST':
            try: b = json.loads(req.post_data or '{}')
            except Exception: b = {}
            POSTS.append(b)
            if b.get('action') == 'makeInvite': return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'code': f'INV{len(POSTS):04d}ABCDEFG', 'until': '2026-11-16'}))
            return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(req.url).query)
        if q.get('dxfseed'): return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': ID1, 'name': 'G-eSAA_seed.dxf', 'size': len(SEED), 'text': SEED}))
        out = {'ok': True, 'name': common.SHEET_MOCK['name'], 'companies': common.SHEET_MOCK['companies'], 'admins': common.SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False, 'dxfSeed': ID1}
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    async with async_playwright() as p:
        geo = {'latitude': POLES[0][0], 'longitude': POLES[0][1], 'accuracy': 3}
        ctx = await p.chromium.launch_persistent_context(OUT + '/ud', executable_path=common.CHROME, viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
            permissions=['geolocation', 'camera'], geolocation=geo, accept_downloads=True, service_workers='block',
            args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={S}/v17/vid/h_cc.mjpeg'])
        for u in ('https://tile.openstreetmap.org/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**', 'https://basemaps.cartocdn.com/**'): await ctx.route(u, lambda r: r.abort())
        await ctx.route('https://script.google.com/**', sheet)
        await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS); await ctx.add_init_script(common.ADM_OPEN_JS)
        cur = dict(geo)
        async def hb():
            while True:
                try: await ctx.set_geolocation(cur)
                except Exception: return
                await asyncio.sleep(1)
        task = asyncio.create_task(hb())
        pg = ctx.pages[0]; errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(BASE + '/index.html'); await W(pg, 1500)
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await sheet_companies(pg, ['GLOBE', 'FADI', 'NOKIA'], admins=['GLOBE'])
        await pg.fill('#admWriteKey', 'ADMIN-KEY-TEST'); await pg.fill('#admDxfSeed', LINK1); await pg.click('#admSave')
        await pg.wait_for_selector('#askBox:not([hidden]), #qrShow:not([hidden])', timeout=30000); await W(pg, 500)
        if await pg.locator('#qrShow:not([hidden])').count(): await pg.click('#qrClose'); await W(pg, 300)
        for _ in range(3):
            if not await pg.locator('#askBox:not([hidden])').count(): break
            b = pg.locator('#askBox button:has-text("OK")'); await (b.first if await b.count() else pg.locator('#askBox button').first).click(); await W(pg, 500)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900); await close_sheets(pg)
        await newproj(pg, 'survey', 'PLAN_42', purpose='As-plan'); await close_sheets(pg)
        await pg.evaluate("() => { const m = __polecam.S.meta['PLAN_42']; m.plaId = 'MIN123'; }")
        for k, ll in enumerate(POLES[:2]):
            await capture(pg, cur, *ll); await pg.fill('#poleId', f'CC-000{k + 1}'); await save(pg)
        # 1. two boxes on one pole
        await capture(pg, cur, *POLES[2]); await pg.fill('#poleId', 'CC-0003')
        await pg.evaluate("document.getElementById('atNap').click()"); await W(pg, 200)
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#napTypeSel'); await pg.select_option('#napTypeSel', 'LCP 1x4'); await W(pg, 200); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#napId'); await pg.fill('#napId', 'DVO_003_L913_L01')
        add_vis = await pg.evaluate("document.getElementById('nap2Add').getClientRects().length > 0")
        await pg.evaluate("document.getElementById('nap2Add').click()"); await W(pg, 300)
        d2 = await pg.evaluate("({ row: document.getElementById('nap2Row').getClientRects().length > 0, add: document.getElementById('nap2Add').getClientRects().length > 0, type: document.getElementById('nap2TypeSel').value, st: document.getElementById('nap2StSel').value, szVis: document.getElementById('nap2SzSel').getClientRects().length > 0 })")
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#nap2Id'); await pg.fill('#nap2Id', 'DVO_003_L913_N02')
        await pg.evaluate("document.getElementById('atClosure').click()"); await W(pg, 200); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#cloSzSel'); await pg.select_option('#cloSzSel', '48C'); await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", '#closureId'); await pg.fill('#closureId', 'CL-88')
        await pg.evaluate("document.getElementById('poleAttach').scrollIntoView({ block: 'center' })"); await W(pg, 400); await pg.screenshot(path=OUT + '/two_boxes.png')
        await save(pg)
        r3 = await pg.evaluate("(() => { const p = __polecam.points.find((x) => x.poleId === 'CC-0003'); return { nap: p.nap, napId: p.napId, nap2: p.nap2, nap2Id: p.nap2Id, closure: p.closure, closureId: p.closureId, boq: p.boq }; })()")
        check('1. an LCP 1x4 on the pole, then + 2nd box: NAP 1x16 offered, New, no size; its ID typed; both kept on the pole with the closure',
              add_vis and d2['row'] and not d2['add'] and d2['type'] == 'NAP 1x16' and d2['st'] == 'New' and not d2['szVis']
              and r3['nap'] and r3['napId'] == 'DVO_003_L913_L01' and r3['nap2'] and r3['nap2Id'] == 'DVO_003_L913_N02' and r3['boq'].get('napType') == 'LCP 1x4' and r3['boq'].get('nap2Type') == 'NAP 1x16' and r3['boq'].get('nap2St') == 'New'
              and r3['closure'] and r3['closureId'] == 'CL-88', (add_vis, d2, r3))
        await capture(pg, cur, *POLES[3]); await pg.fill('#poleId', 'CC-0004'); await save(pg)
        await close_sheets(pg); await pg.click('#routeBtn'); await pg.wait_for_timeout(500); await pg.evaluate("document.body.classList.contains('routing') && __polecam.routeTools(true, true)"); await W(pg, 400); await pg.evaluate('__polecam.capLinks()'); await W(pg, 400); await pg.click('#rbDone'); await W(pg, 600)
        # 2. reopen from the Records list, save unchanged
        await close_sheets(pg); await pg.evaluate("document.getElementById('listBtn').click()"); await W(pg, 500); await pg.fill('#listSearch', 'CC-0003'); await pg.evaluate("document.getElementById('listSearch').dispatchEvent(new Event('input'))"); await W(pg, 500)
        await pg.locator('#listItems button:has-text("CC-0003")').first.click(); await pg.wait_for_selector('#editor:not([hidden])', timeout=15000); await W(pg, 900)
        await pg.evaluate("s => window.__polecam.edShow && window.__polecam.edShow(s)", "#napBox"); await W(pg, 200)  # v2.42.17: the On the pole tab
        o = await pg.evaluate("({ nap: document.getElementById('atNap').checked, napId: document.getElementById('napId').value, type: document.getElementById('napTypeSel').value, row: document.getElementById('nap2Row').getClientRects().length > 0, type2: document.getElementById('nap2TypeSel').value, id2: document.getElementById('nap2Id').value, clo: document.getElementById('atClosure').checked, cloId: document.getElementById('closureId').value })")
        await save(pg)
        r3b = await pg.evaluate("(() => { const p = __polecam.points.find((x) => x.poleId === 'CC-0003'); return { nap: p.nap, napId: p.napId, nap2: p.nap2, nap2Id: p.nap2Id, closure: p.closure, closureId: p.closureId, t2: (p.boq || {}).nap2Type }; })()")
        check('2. reopened from the Records list: NAP ticked with its LCP and ID, the 2nd box NAP 1x16 with its ID, the closure ticked; saved unchanged: all kept',
              o['nap'] and o['napId'] == 'DVO_003_L913_L01' and o['type'] == 'LCP 1x4' and o['row'] and o['type2'] == 'NAP 1x16' and o['id2'] == 'DVO_003_L913_N02' and o['clo'] and o['cloId'] == 'CL-88'
              and r3b['nap'] and r3b['nap2'] and r3b['napId'] == 'DVO_003_L913_L01' and r3b['nap2Id'] == 'DVO_003_L913_N02' and r3b['closure'] and r3b['closureId'] == 'CL-88' and r3b['t2'] == 'NAP 1x16', (o, r3b))
        # an extension arm on CC-0002 (its BOQ field), for the plan
        await pg.evaluate("(() => { const p = __polecam.points.find((x) => x.poleId === 'CC-0002'); p.boq = { ...(p.boq || {}), arm: 'Extension arm 44.5\"' }; })()")
        # 3. BOQ, CSV, KMZ
        fb = await export(pg, 'doBoq', 'boq.xlsx')
        wb = openpyxl.load_workbook(fb, read_only=True); rows = [[c for c in r] for ws in wb.worksheets for r in ws.iter_rows(values_only=True) if r and r[0] in ('NAP', 'Dummy NAP')]
        fc = await export(pg, 'doCsv', 'pts.csv'); raw = open(fc, 'rb').read()
        ctext = zipfile.ZipFile(io.BytesIO(raw)).read([n for n in zipfile.ZipFile(io.BytesIO(raw)).namelist() if n.endswith('.csv')][0]).decode('utf-8-sig') if raw[:2] == b'PK' else raw.decode('utf-8-sig')
        cr = list(csvmod.reader(io.StringIO(ctext))); h = cr[0]; row3 = next((r for r in cr[1:] if r and r[h.index('pole_id')] == 'CC-0003'), []) # v2.42.18: the first column is the pole number (no)
        fk = await export(pg, 'doKmz', 'pts.kmz'); kz = zipfile.ZipFile(fk); kml = kz.read([n for n in kz.namelist() if n.endswith('.kml')][0]).decode('utf-8', 'replace')
        check('3. the BOQ: LCP 1x4 New (DVO_003_L913_L01) and NAP 1x16 New (DVO_003_L913_N02); the CSV: nap_id and nap2_id; the KMZ: nap2_type and nap2_id',
              any(r[1] == 'LCP 1x4' and r[2] == 'New' and 'DVO_003_L913_L01' in str(r[4]) for r in rows) and any(r[1] == 'NAP 1x16' and r[2] == 'New' and 'DVO_003_L913_N02' in str(r[4]) for r in rows)
              and 'nap_id' in h and 'nap2_id' in h and row3 and row3[h.index('nap_id')] == 'DVO_003_L913_L01' and row3[h.index('nap2_id')] == 'DVO_003_L913_N02'
              and re.search(r'name="nap2_type"><value>NAP 1x16<', kml) and re.search(r'name="nap2_id"><value>DVO_003_L913_N02<', kml), (rows, h[-8:], row3[:20]))
        # 4. the plan
        f = await export(pg, 'doDxf', 'plan.zip'); z = zipfile.ZipFile(f)
        doc = ezdxf.read(io.StringIO(z.read([n for n in z.namelist() if n.endswith('.dxf')][0]).decode('utf-8', 'replace')))
        seedh = {e.dxf.handle for e in ezdxf.read(io.StringIO(SEED)).modelspace()}
        msp = [e for e in doc.modelspace() if e.dxf.handle not in seedh]
        ins = [e for e in msp if e.dxftype() == 'INSERT']
        lcp = [e for e in ins if e.dxf.name == 'proposed LCP']; n16 = [e for e in ins if e.dxf.name == '1_16NAP']
        arm = [e for e in ins if e.dxf.name == 'extension 44 arm']
        texts = {e.dxf.text: e for e in msp if e.dxftype() == 'TEXT'}
        from ezdxf import bbox as BB
        cen = lambda e: (lambda b: ((b.extmin.x + b.extmax.x) / 2, (b.extmin.y + b.extmax.y) / 2))(BB.extents(e.virtual_entities()))
        gap = (lambda a, b: ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5)(cen(lcp[0]), cen(n16[0])) if lcp and n16 else None
        check('4. the plan: the LCP and the NAP 1:16 side by side on the cable at CC-0003 (one box apart), each with its ID; the extension arm 44.5" at its own length (scale ~2, as v2.37)',
              len(lcp) == 1 and len(n16) == 1 and gap and 12 < gap < 30 and 'DVO_003_L913_L01' in texts and 'DVO_003_L913_N02' in texts and len(arm) == 1 and arm[0].dxf.xscale > 1.6,
              (len(lcp), len(n16), gap, [t for t in texts if 'DVO_' in t], [(round(a.dxf.xscale, 2)) for a in arm]))
        # 5. Settings: the vendor invite
        await pg.evaluate("window.POLECAM_SITE = 'https://example.test/g/'")
        await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 600)
        vis = await pg.evaluate("['inviteVendor', 'inviteAdminStaff', 'teamShare'].map((id) => [id, document.getElementById(id).getClientRects().length > 0])")
        await pg.evaluate("document.getElementById('inviteVendor').scrollIntoView({ block: 'center' })"); await W(pg, 300); await pg.screenshot(path=OUT + '/settings_invite.png')
        await pg.click('#inviteVendor'); await W(pg, 500)
        offered = await pg.evaluate("[...document.querySelectorAll('#pickMList label')].map((l) => l.textContent)")
        await pg.screenshot(path=OUT + '/invite_vendor_pick.png')
        n0 = len(POSTS)
        await pg.locator('#pickMList label.any input').check(); await pg.click('#pickMYes'); await W(pg, 1200)
        any_post = next((b for b in POSTS[n0:] if b.get('action') == 'makeInvite'), None); q_any = await pg.evaluate("window.__polecam.lastQr")
        any_title = await pg.text_content('#qrTitle'); any_note = await pg.text_content('#qrText')
        await pg.screenshot(path=OUT + '/invite_vendor_qr.png')
        long_link = await pg.evaluate("window.__polecam.lastQrFull || window.__polecam.lastQrLink")  # v2.42.6: Send the invite link is the short link; the full one (the list inside) for this offline join
        await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 500)
        n1 = len(POSTS); await pg.click('#inviteVendor'); await W(pg, 400)
        await pg.locator('#pickMList label', has_text='FADI').locator('input').check(); await pg.click('#pickMYes'); await W(pg, 1200)
        one_post = next((b for b in POSTS[n1:] if b.get('action') == 'makeInvite'), None); q_one = await pg.evaluate("window.__polecam.lastQr")
        await close_sheets(pg); await pg.click('#settingsBtn'); await W(pg, 500)
        n2 = len(POSTS); await pg.click('#inviteAdminStaff'); await W(pg, 1200)
        adm_post = next((b for b in POSTS[n2:] if b.get('action') == 'makeInvite'), None); q_adm = await pg.evaluate("window.__polecam.lastQr")
        check('5. Settings on the admin phone: Invite a vendor and Invite admin staff (no Share list); the vendors FADI and NOKIA offered, not GLOBE; any vendor: the sheet asked for [*], the link says cos=* and the code; FADI: co=FADI and the code; admin staff: GLOBE',
              dict(vis) == {'inviteVendor': True, 'inviteAdminStaff': True, 'teamShare': False} and 'FADI' in offered and 'NOKIA' in offered and not any('GLOBE' in x for x in offered) and any('any vendor' in x for x in offered)
              and any_post and any_post.get('cos') == ['*'] and any_post.get('key') == 'ADMIN-KEY-TEST' and '&cos=*' in q_any and re.search(r'&iv=INV\d{4}ABCDEFG', q_any) and 'vendor' in any_title.lower() and 'not the admin company' in any_note
              and one_post and one_post.get('cos') == ['FADI'] and '&co=FADI' in q_one and '&iv=' in q_one
              and adm_post and adm_post.get('cos') == ['GLOBE'] and '&co=GLOBE' in q_adm,
              (vis, offered, any_post, q_any[-60:], any_title, one_post, q_one[-50:], adm_post, q_adm[-50:]))
        # 6. a new phone with the any-vendor link (the full join link: the list and cos=*)
        ctx2 = await p.chromium.launch_persistent_context(OUT + '/ud2', executable_path=common.CHROME, viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
        await ctx2.route('https://script.google.com/**', sheet)
        for u in ('https://tile.openstreetmap.org/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**', 'https://basemaps.cartocdn.com/**'): await ctx2.route(u, lambda r: r.abort())
        await ctx2.add_init_script(common.NO_DRAFT_JS); await ctx2.add_init_script(common.NO_SAVECHECK_JS); await ctx2.add_init_script(common.NO_SAMPLE_JS)
        pg2 = ctx2.pages[0]; errs2 = []; pg2.on('pageerror', lambda e: errs2.append('PAGEERROR ' + str(e)))
        link = long_link or q_any
        await pg2.goto(BASE + '/index.html' + link[link.index('#'):]); await W(pg2, 4000)
        for _ in range(3):
            if not await pg2.locator('#askBox:not([hidden])').count(): break
            await pg2.locator('#askBox button.primary').first.click(); await W(pg2, 800)
        cos2 = await pg2.evaluate("[...document.getElementById('pfCompany').options].map((o) => o.value).filter(Boolean)")
        inv2 = await pg2.evaluate("({ cos: window.__polecam.S.inviteCos, code: window.__polecam.S.inviteCode })")
        await pg2.screenshot(path=OUT + '/join_any_vendor.png')
        check('6. a new phone with the any-vendor invite: it chooses among FADI and NOKIA only (not GLOBE), the invite code kept for its key; no page errors',
              sorted(cos2) == ['FADI', 'NOKIA'] and inv2['cos'] == ['*'] and re.match(r'INV\d{4}ABCDEFG', inv2['code'] or '') and not errs and not errs2, (cos2, inv2, link[:40], errs[:3], errs2[:3]))
        await ctx2.close()
        task.cancel(); await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
