"""v2.35.3: the offline map close up (a real G-eSAA NCR map pack, iPhone-sized screen at 3x): past zoom 18 the roads keep
widening like real roads and street names stay on screen up to zoom 21; zoom 15-18 look as before; canvases at 2x."""
import asyncio, sys, os, shutil, io, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from playwright.async_api import async_playwright
from PIL import Image
D = os.path.dirname(os.path.abspath(__file__)); PACK = PRIV + '/large/ncr.pmtiles'; OUT = D + '/out_e'; os.makedirs(OUT, exist_ok=True)
LL = (14.6345, 121.0425)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900])
async def W(pg, ms): await pg.wait_for_timeout(ms)
def road_px(png):  # share of the map area in pure white (the road fill of the light style)
    im = Image.open(io.BytesIO(png)).convert('RGB'); w, h = im.size; im = im.crop((0, int(h * 0.1), int(w * 0.8), int(h * 0.75)))
    px = im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()
    px = list(px); return round(sum(1 for c in px if c[0] > 250 and c[1] > 250 and c[2] > 250) / len(px), 3)
async def main():
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_e', ignore_errors=True)
        ctx = await p.chromium.launch_persistent_context(f'{D}/ud_e', executable_path=common.CHROME, viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
            permissions=['geolocation'], geolocation={'latitude': LL[0], 'longitude': LL[1], 'accuracy': 3})
        for u in ('https://tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', 'https://server.arcgisonline.com/**', 'https://*.tile.openstreetmap.org/**', 'https://script.google.com/**'): await ctx.route(u, lambda r: r.abort())
        await ctx.add_init_script(common.TEST_PROJECT_JS); await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS)
        pg = ctx.pages[0]; errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html'); await W(pg, 1500)
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 800)
        await pg.set_input_files('#packFileInput', PACK); await W(pg, 2500)
        for _ in range(60):
            if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): break
            await W(pg, 500)
        await pg.evaluate("document.querySelectorAll('section.sheet').forEach((s) => { s.hidden = true; })")
        for _ in range(4):
            if await pg.evaluate("__polecam.S.base") == 'offline': break
            await pg.evaluate("document.getElementById('layerBtn').click()"); await W(pg, 400)
        await pg.evaluate(f"__polecam.map.invalidateSize(); __polecam.map.setView([{LL[0]}, {LL[1]}], 15, {{ animate: false }})"); await W(pg, 3000)
        res = {}
        for z in range(15, 22):
            t0 = time.time()
            await pg.evaluate("__polecam.map.zoomIn(1)") if z > 15 else None
            await W(pg, 3500)
            png = await pg.screenshot(); open(f'{OUT}/z{z}.png', 'wb').write(png)
            r = await pg.evaluate("""() => { const m = __polecam.map, L0 = Object.values(m._layers).find((l) => l.paintRules);
              const lb = L0.labelers.labelers.get(m.getZoom()), b = m.getPixelBounds();
              const names = lb ? [...new Set(lb.index.tree.all().filter((e) => e.maxX > b.min.x && e.minX < b.max.x && e.maxY > b.min.y && e.minY < b.max.y).map((e) => e.indexedLabel && e.indexedLabel.deduplicationKey).filter(Boolean))] : [];
              const t = [...document.querySelectorAll('.leaflet-tile-pane canvas')];
              return { z: m.getZoom(), names, side: t[0] ? t[0].width : 0, mb: +(t.reduce((s, c) => s + c.width * c.height * 4, 0) / 1048576).toFixed(1),
                minorW: (() => { const r = L0.paintRules.find((x) => x.dataLayer === 'roads' && x.filter && x.filter(m.getZoom(), { props: { kind: 'minor_road' } })); return r ? r.symbolizer.width.get(m.getZoom()) : null; })() }; }""")
            r['white'] = road_px(png); res[z] = r
            print(z, r)
        check('zoom 15-18 as before: the road widths of the style unchanged (minor road 8 px at 18)', res[18]['minorW'] == 8 and res[15]['minorW'] < 8, [(z, res[z]['minorW']) for z in res])
        check('past zoom 18 the roads keep widening like real roads (x2 per zoom: 16, 32, 64 px)', res[19]['minorW'] == 16 and res[20]['minorW'] == 32 and res[21]['minorW'] == 64, [(z, res[z]['minorW'], res[z]['white']) for z in res])
        check('street names stay on screen at every zoom up to 21 (they were gone at 20-21)', all(len(res[z]['names']) >= 1 for z in range(16, 22)), [(z, res[z]['names'][:4]) for z in res])
        check('an iPhone (3x screen) draws the map at 2x: tiles of 512 px, not 768', all(res[z]['side'] == 512 for z in res), [(z, res[z]['side'], res[z]['mb']) for z in res])
        check('no page errors', not [e for e in errs if 'PAGEERROR' in e or 'Canvas' in e], errs[:5])
        await ctx.close()
    from PIL import Image as I2
    ims = [I2.open(f'{OUT}/z{z}.png').convert('RGB') for z in (17, 18, 19, 20, 21)]
    w, h = ims[0].size; s = 0.34; g = I2.new('RGB', (int(w * s) * 5, int(h * s)), 'white')
    for i, im in enumerate(ims): g.paste(im.resize((int(w * s), int(h * s))), (i * int(w * s), 0))
    g.save(f'{OUT}/grid.png')
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
