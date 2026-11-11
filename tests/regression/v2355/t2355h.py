"""v2.35.5: landmarks. The offline map draws the pack's named places (schools, churches, markets, banks, shops… with a coloured
dot by kind, from the zoom each belongs to; subdivision names in grey italics); the plan drawing takes its landmarks from the
pack's most detailed level (zoom 15: about 4 times the places of zoom 14), schools, churches, health and government first;
a part of the offline map that cannot be drawn is reported on screen."""
import asyncio, sys, os, shutil, io
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_h'; os.makedirs(OUT, exist_ok=True)
PACK = S + '/fixtures/maps/davao_watusi_test.pmtiles'; LL = (7.1030, 125.6170)
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900])
async def W(pg, ms): await pg.wait_for_timeout(ms)
async def main():
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_h', ignore_errors=True)
        ctx = await p.chromium.launch_persistent_context(f'{D}/ud_h', executable_path=common.CHROME, viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
            permissions=['geolocation'], geolocation={'latitude': LL[0], 'longitude': LL[1], 'accuracy': 3})
        for u in ('https://tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', 'https://server.arcgisonline.com/**', 'https://*.tile.openstreetmap.org/**', 'https://script.google.com/**'): await ctx.route(u, lambda r: r.abort())
        await ctx.route('https://overpass-api.de/**', lambda r: r.fulfill(status=504, body='timeout'))
        await ctx.add_init_script(common.TEST_PROJECT_JS); await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS)
        pg = ctx.pages[0]; errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
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
        res = {}
        for z in (15, 16, 17, 18, 19):
            await pg.evaluate(f"__polecam.map.invalidateSize(); __polecam.map.setView([{LL[0]}, {LL[1]}], {z}, {{ animate: false }})"); await W(pg, 3500)
            await pg.evaluate("document.getElementById('toast').hidden = true")
            await pg.screenshot(path=f'{OUT}/z{z}.png')
            res[z] = await pg.evaluate("""() => { const m = __polecam.map, L0 = Object.values(m._layers).find((l) => l.paintRules), lb = L0.labelers.labelers.get(m.getZoom()), b = m.getPixelBounds();
              const ri = L0.labelRules.findIndex((r) => r.dataLayer === 'pois'), rs = ri + 1;
              const seen = new Set(), out = { dots: 0, areas: 0 };
              for (const e of lb ? lb.index.tree.all() : []) { const l = e.indexedLabel; if (seen.has(l) || !(e.maxX > b.min.x && e.minX < b.max.x && e.maxY > b.min.y && e.minY < b.max.y)) continue; seen.add(l); if (l.order === ri) out.dots++; else if (l.order === rs) out.areas++; }
              return out; }""")
            print(z, res[z])
        check('the offline map shows landmarks close up (a dot and the name), more as you zoom in; subdivision names too', res[17]['dots'] >= 3 and res[18]['dots'] >= 3 and res[16]['areas'] + res[17]['areas'] >= 1, res)
        # the plan drawing's landmarks from the map pack (no road pack, OpenStreetMap not answering)
        r = await pg.evaluate("""async () => { const R = await __polecam.planRoads([7.090, 125.600, 7.115, 125.635], [7.095, 125.605, 7.110, 125.630]);
          return { note: R.note, n: R.pois.length, names: R.pois.map((q) => q.name), kinds: R.pois.map((q) => q.kind) }; }""")
        print(r['note'], r['n'])
        check('the plan drawing takes the landmarks from zoom 15 of the map pack: places that only zoom 15 holds are there (e.g. Fatima de Davao School, Fly-O-Grill)',
              r['n'] > 100 and 'Fatima de Davao School' in r['names'] and 'Fly-O-Grill' in r['names'] and 'offline map' in r['note'] and not any(k in ('crossing', 'turning_circle') for k in r['kinds']), (r['n'], r['note'], r['names'][:12]))
        # a part of the offline map that cannot be drawn is said on screen (forced: the pack's data made unreadable)
        await pg.evaluate("""() => { const L0 = Object.values(__polecam.map._layers).find((l) => l.paintRules); for (const v of L0.views.values()) v.tileCache.cache.clear();
          window.__breakPack = true; const id = __polecam.S.activePack; }""")
        await pg.evaluate("""() => { const L0 = Object.values(__polecam.map._layers).find((l) => l.paintRules); for (const v of L0.views.values()) { const tc = v.tileCache; tc.source.get = async () => { throw new Error('test: the tile could not be read'); }; } }""")
        await pg.evaluate(f"__polecam.map.setView([{LL[0] + 0.01}, {LL[1] + 0.01}], 18, {{ animate: false }})"); await W(pg, 3000)
        t = await pg.text_content('#toast'); log = await pg.evaluate("JSON.stringify(localStorage.getItem('polecam.log') || '').slice(0, 0)")
        check('a part of the offline map that cannot be drawn: the reason is shown on screen with "send Settings → App log"', 'could not draw' in (t or '') and 'App log' in t and 'test: the tile could not be read' in t, t)
        check('no page errors', not [e for e in errs if 'PAGEERROR' in e], errs[:4])
        await ctx.close()
    from PIL import Image
    ims = [Image.open(f'{OUT}/z{z}.png').convert('RGB') for z in (16, 17, 18, 19)]
    w, h = ims[0].size; s = 0.42; g = Image.new('RGB', (int(w * s) * 4, int(h * s)), 'white')
    for i, im in enumerate(ims): g.paste(im.resize((int(w * s), int(h * s))), (i * int(w * s), 0))
    g.save(f'{OUT}/grid.png')
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
