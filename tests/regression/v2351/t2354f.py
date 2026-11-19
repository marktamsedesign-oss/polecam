"""v2.35.4: a map pack cut short (a download that stopped part way, or a file that arrived incomplete and was imported) shows
the map up to zoom 15 but is blank close up, because zoom 15 (used for every closer zoom) fills the end of the file. Now:
an incomplete file is refused at import; a pack already on the phone is checked once, marked INCOMPLETE with Download again,
and the user is told; whole packs (map and road) are not flagged."""
import asyncio, sys, os, shutil, io
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from playwright.async_api import async_playwright
from PIL import Image
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_g'; os.makedirs(OUT, exist_ok=True)
FULL, CUT = PRIV + '/large/ncr.pmtiles', PRIV + '/large/ncr_cut.pmtiles'
ROAD = PRIV + '/roads_v235/G-eSAA roads - Davao Region - 2026-08-19.roadpack'
LL = (14.6322, 121.0352)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:700])
async def W(pg, ms): await pg.wait_for_timeout(ms)
def drawn(png):  # share of the map area that is not the plain background
    im = Image.open(io.BytesIO(png)).convert('RGB'); w, h = im.size; im = im.crop((0, int(h * 0.1), int(w * 0.8), int(h * 0.75)))
    px = list(im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()); from collections import Counter
    return round(1 - Counter(px).most_common(1)[0][1] / len(px), 3)
async def busy_wait(pg):
    await W(pg, 1200)
    for _ in range(80):
        if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): break
        await W(pg, 500)
async def open_maps(pg):
    await pg.evaluate("document.querySelectorAll('section.sheet').forEach((s) => { s.hidden = true; }); document.getElementById('offlineBtn').click()"); await W(pg, 1200)
async def rows(pg):
    return await pg.evaluate("[...document.querySelectorAll('#packList .area-card')].map((r) => ({ t: r.querySelector('.t').textContent, s: r.querySelector('.s').textContent, btns: [...r.querySelectorAll('button')].map((b) => b.textContent) }))")
async def show_at(pg, z):
    await pg.evaluate("document.querySelectorAll('section.sheet').forEach((s) => { s.hidden = true; })")
    for _ in range(4):
        if await pg.evaluate("__polecam.S.base") == 'offline': break
        await pg.evaluate("document.getElementById('layerBtn').click()"); await W(pg, 400)
    await pg.evaluate(f"__polecam.map.invalidateSize(); __polecam.map.setView([{LL[0]}, {LL[1]}], {z}, {{ animate: false }})"); await W(pg, 3500)
    await pg.evaluate("document.getElementById('toast').hidden = true"); await W(pg, 100)
    return await pg.screenshot()
async def main():
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_g', ignore_errors=True)
        ctx = await p.chromium.launch_persistent_context(f'{D}/ud_g', executable_path=common.CHROME, viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
            permissions=['geolocation'], geolocation={'latitude': LL[0], 'longitude': LL[1], 'accuracy': 3})
        for u in ('https://tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', 'https://server.arcgisonline.com/**', 'https://*.tile.openstreetmap.org/**', 'https://script.google.com/**'): await ctx.route(u, lambda r: r.abort())
        await ctx.add_init_script(common.TEST_PROJECT_JS); await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS)
        pg = ctx.pages[0]; errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto('http://localhost:8765/index.html'); await W(pg, 1500)
        # 1. an incomplete file is refused at import, with the reason
        await open_maps(pg)
        await pg.set_input_files('#packFileInput', CUT); await W(pg, 1500)
        t1 = await pg.text_content('#toast'); n1 = await pg.evaluate("Object.keys(__polecam.S.packs).length")
        check('an incomplete .pmtiles file (25% of it) is refused at import: "That file is incomplete: 10.5 MB of 42 MB … download it again"', 'That file is incomplete' in (t1 or '') and '42 MB' in t1 and n1 == 0, (t1, n1))
        # 2. whole packs are not flagged (map pack and road pack)
        await pg.set_input_files('#packFileInput', FULL); await busy_wait(pg)
        await pg.set_input_files('#packFileInput', ROAD); await busy_wait(pg)
        pk = await pg.evaluate("Object.values(__polecam.S.packs).map((p) => ({ id: p.id, done: p.done, short: !!p.short, checked: p.checked === p.size, store: p.store, size: p.size }))")
        r2 = await rows(pg)
        check('whole packs are not flagged: the NCR map pack and the Davao road pack import and are marked checked, not incomplete', len(pk) == 2 and all(x['done'] and not x['short'] and x['checked'] for x in pk) and not any('INCOMPLETE' in r['s'] for r in r2), (pk, r2))
        full17 = drawn(await show_at(pg, 17))
        # 3. a pack saved by an older version that was cut short: stored data trimmed to 25% (as an interrupted download leaves it)
        mid = [x for x in pk if x['id'].startswith('file-ncr')][0]['id']
        cut = await pg.evaluate("""async (id) => { const st = __polecam.S.packs[id], P = 8 * 1048576, keep = Math.floor(st.size * 0.25);
          const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('mappacks', { create: false }).catch(() => null);
          const root = dir || await navigator.storage.getDirectory(); const names = []; for await (const n of root.keys()) if (n.startsWith(id + '.')) names.push(n);
          for (const n of names) { const i = +n.split('.').pop(); if (i * P >= keep) await root.removeEntry(n); else if ((i + 1) * P > keep) { const w = await (await root.getFileHandle(n)).createWritable({ keepExistingData: true }); await w.truncate(keep - i * P); await w.close(); } }
          st.size = keep; st.bytes = keep; delete st.checked; localStorage.setItem('polecam.settings', JSON.stringify(__polecam.S)); return { keep, names }; }""", mid)
        print('cut', cut)
        await pg.reload(); await W(pg, 1500)
        await pg.evaluate("document.querySelectorAll('section.sheet').forEach((s) => { s.hidden = true; })")
        toast3 = ''
        for _ in range(20):
            toast3 = await pg.text_content('#toast') or ''
            if 'incomplete' in toast3: break
            await W(pg, 400)
        st3 = await pg.evaluate(f"(() => {{ const p = __polecam.S.packs['{mid}']; return {{ short: !!p.short, have: p.have, need: p.need }}; }})()")
        cut14 = drawn(await show_at(pg, 14)); cut17 = drawn(await show_at(pg, 17))
        await pg.screenshot(path=f'{OUT}/g1_cut_z17.png')
        check('the cut pack shows the map up to zoom 15 but is blank close up (zoom 17): the fault the user saw', cut14 > 0.2 and cut17 < 0.05 and full17 > 0.2, (cut14, cut17, full17))
        check('a pack already on the phone is checked after start: marked incomplete (have / need) and the user is told what to do',
              st3['short'] and st3['need'] == os.path.getsize(FULL) and st3['have'] == cut['keep'] and 'incomplete' in toast3 and 'Download again' in toast3, (st3, toast3))
        await open_maps(pg); r4 = await rows(pg)
        await pg.screenshot(path=f'{OUT}/g2_list.png')
        rr = [r for r in r4 if 'INCOMPLETE' in r['s']]
        check('the pack list says INCOMPLETE (10.5 MB of 42 MB) and offers the way to fix it; the whole road pack is not flagged',
              len(rr) == 1 and '42 MB' in rr[0]['s'] and ('How to fix' in rr[0]['btns'] or 'Download again' in rr[0]['btns']) and 'Delete' in rr[0]['btns'], r4)
        check('no page errors', not [e for e in errs if 'PAGEERROR' in e], errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
