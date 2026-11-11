"""v2.35.5: a pack kept in the browser's database (as Safari does, in 1 MB pieces) with a piece missing in the middle is found
incomplete after start; a whole one is not."""
import asyncio, sys, os, shutil
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); PACK = PRIV + '/large/ncr.pmtiles'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:600])
async def W(pg, ms): await pg.wait_for_timeout(ms)
NO_OPFS = "try { delete FileSystemFileHandle.prototype.createWritable; } catch (e) {}"
async def main():
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_i', ignore_errors=True)
        ctx = await p.chromium.launch_persistent_context(f'{D}/ud_i', executable_path=common.CHROME, viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        for u in ('https://tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', 'https://server.arcgisonline.com/**', 'https://*.tile.openstreetmap.org/**', 'https://script.google.com/**'): await ctx.route(u, lambda r: r.abort())
        await ctx.add_init_script(common.TEST_PROJECT_JS); await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS); await ctx.add_init_script(NO_OPFS)
        pg = ctx.pages[0]; errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto('http://localhost:8765/index.html'); await W(pg, 1500)
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 800)
        await pg.set_input_files('#packFileInput', PACK); await W(pg, 2500)
        for _ in range(80):
            if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): break
            await W(pg, 500)
        st = await pg.evaluate("Object.values(__polecam.S.packs).map((p) => ({ id: p.id, store: p.store, chunks: p.chunks, done: p.done, short: !!p.short, checked: p.checked === p.size }))")
        check('without OPFS the pack is kept in the database in pieces, whole and checked', len(st) == 1 and st[0]['store'] == 'idb' and st[0]['done'] and not st[0]['short'] and st[0]['checked'], st)
        mid = st[0]['chunks'] // 2
        await pg.evaluate("""async ([id, i]) => { await new Promise((res, rej) => { const r = indexedDB.open('polecam'); r.onsuccess = () => { const db = r.result, t = db.transaction('packs', 'readwrite'); t.objectStore('packs').delete(id + ':' + i); t.oncomplete = () => { db.close(); res(); }; t.onerror = rej; }; r.onerror = rej; });
          const p = __polecam.S.packs[id]; delete p.checked; localStorage.setItem('polecam.settings', JSON.stringify(__polecam.S)); }""", [st[0]['id'], mid])
        await pg.reload(); await W(pg, 1500)
        t = ''
        for _ in range(25):
            t = await pg.text_content('#toast') or ''
            if 'incomplete' in t: break
            await W(pg, 400)
        s2 = await pg.evaluate(f"(() => {{ const p = __polecam.S.packs['{st[0]['id']}']; return {{ short: !!p.short, have: p.have, need: p.need }}; }})()")
        check('a piece missing in the middle: the pack is found INCOMPLETE after start and the user is told', s2['short'] and s2['have'] < s2['need'] and 'incomplete' in t, (s2, t, mid))
        check('no page errors', not [e for e in errs if 'PAGEERROR' in e], errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
