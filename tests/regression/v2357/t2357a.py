"""v2.35.7: map packs saved by an iPhone browser. Safari 26/27 (every iPhone browser) writes a view's whole buffer
(FileSystemWritableFileStream.write ignores byteOffset/byteLength): emulated here in Chromium (webkitbug.py).
 A. v2.35.6 on the emulated iPhone: the NCR map pack and the Davao road pack are saved wrongly (parts larger than 8 MB,
    the bytes differ from the file), the map is blank close up.
 B. v2.35.7 opens the same phone: both packs are found damaged ("Repair", a toast); a repair stopped half way (storage
    error) goes on after a restart; repaired packs are byte-identical to the files; the map draws close up.
 C. v2.35.7 on a fresh emulated iPhone: importing saves both packs byte-identical, nothing is flagged.
 D. data damaged another way (part of a pack overwritten): found as DAMAGED, download again (no Repair)."""
import asyncio, sys, os, shutil, hashlib, subprocess, time, io
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/v2357')
import common
from webkitbug import WEBKIT_BUG_JS, PARTS_JS, HASH_JS
from playwright.async_api import async_playwright
from PIL import Image
D = S + '/v2357'; OUT = D + '/out_a'; os.makedirs(OUT, exist_ok=True)
NCR = PRIV + '/large/ncr.pmtiles'; ROAD = PRIV + '/roads/G-eSAA roads - Davao Region - 2026-08-19.roadpack'
H_NCR = hashlib.sha256(open(NCR, 'rb').read()).hexdigest(); H_ROAD = hashlib.sha256(open(ROAD, 'rb').read()).hexdigest()
LL = (14.5995, 120.9842); P8 = 8 * 1024 * 1024
OLD = PRIV + '/old/v2.35.6'; NEW = APP
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900], flush=True)
async def W(pg, ms): await pg.wait_for_timeout(ms)
def server(root):
    pr = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5); return pr
def blank(png):
    im = Image.open(io.BytesIO(png)).convert('RGB'); w, h = im.size; im = im.crop((0, int(h * 0.15), w, int(h * 0.7)))
    from collections import Counter
    c = Counter(im.getdata()); bg, n = c.most_common(1)[0]
    return round(n / (im.size[0] * im.size[1]), 3)  # share of the most common colour (1.0: one flat colour, nothing drawn)
async def phone(p, udir, bug=True):
    ctx = await p.chromium.launch_persistent_context(udir, executable_path=common.CHROME, viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True, service_workers='block')
    for u in ('https://tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', 'https://server.arcgisonline.com/**', 'https://*.tile.openstreetmap.org/**', 'https://script.google.com/**', 'https://overpass-api.de/**'): await ctx.route(u, lambda r: r.abort())
    await ctx.add_init_script(common.TEST_PROJECT_JS); await ctx.add_init_script(common.NO_DRAFT_JS); await ctx.add_init_script(common.NO_SAVECHECK_JS); await ctx.add_init_script(common.NO_SAMPLE_JS)
    if bug: await ctx.add_init_script(WEBKIT_BUG_JS)
    pg = ctx.pages[0]; errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    await pg.goto('http://localhost:8765/index.html'); await W(pg, 1800)
    return ctx, pg, errs
async def idle(pg, n=240):
    for _ in range(n):
        if not await pg.evaluate("!!document.querySelector('#busy:not([hidden])')"): return
        await W(pg, 500)
async def imp(pg, f):
    await pg.evaluate("document.querySelectorAll('section.sheet').forEach((s) => { s.hidden = true; }); document.getElementById('offlineBtn').click()"); await W(pg, 600)
    await pg.set_input_files('#packFileInput', f); await W(pg, 2000); await idle(pg)
    return await pg.text_content('#toast')
async def ids(pg):
    return await pg.evaluate("Object.fromEntries(Object.values(__polecam.S.packs).map((p) => [p.kind === 'roads' ? 'road' : 'map', p.id]))")
async def offline_at(pg, z, errs, shot=None):
    await pg.evaluate("document.querySelectorAll('section.sheet').forEach((s) => { s.hidden = true; })")
    for _ in range(4):
        if await pg.evaluate("__polecam.S.base") == 'offline': break
        await pg.evaluate("document.getElementById('layerBtn').click()"); await W(pg, 400)
    n0 = len(errs)
    await pg.evaluate(f"__polecam.map.invalidateSize(); __polecam.map.setView([{LL[0]}, {LL[1]}], {z}, {{ animate: false }})"); await W(pg, 3500)
    await pg.evaluate("document.getElementById('toast').hidden = true; document.getElementById('busy').hidden = true")  # B6 called planRoads directly (no export step to close its busy note)
    png = await pg.screenshot()
    if shot: open(shot, 'wb').write(png)
    return len([e for e in errs[n0:] if 'Failed to fetch' in e or 'Decode' in e]), blank(png)
async def card(pg, pid):
    await pg.evaluate("document.querySelectorAll('section.sheet').forEach((s) => { s.hidden = true; }); document.getElementById('offlineBtn').click()"); await W(pg, 900)
    return await pg.evaluate("""(id) => { const name = __polecam.S.packs[id].name; const c = [...document.querySelectorAll('#packList .area-card')].find((x) => x.querySelector('.t').textContent === name);
      return c ? { s: c.querySelector('.s').textContent, b: [...c.querySelectorAll('button')].map((b) => b.textContent) } : null; }""", pid)
async def tap(pg, pid, label):
    await card(pg, pid)
    await pg.evaluate("""([id, label]) => { const name = __polecam.S.packs[id].name; const c = [...document.querySelectorAll('#packList .area-card')].find((x) => x.querySelector('.t').textContent === name);
      [...c.querySelectorAll('button')].find((b) => b.textContent === label).click(); }""", [pid, label])
    await W(pg, 1500); await idle(pg)
    return await pg.text_content('#toast')
async def main():
    async with async_playwright() as p:
        ud = f'{D}/ud_a'; shutil.rmtree(ud, ignore_errors=True)
        # ---- A. v2.35.6 on the emulated iPhone
        srv = server(OLD)
        try:
            ctx, pg, errs = await phone(p, ud)
            ver = await pg.evaluate("document.querySelector('.ver, #appVer') ? document.querySelector('.ver, #appVer').textContent : ''")
            t1 = await imp(pg, NCR); t2 = await imp(pg, ROAD); I = await ids(pg)
            parts = await pg.evaluate(PARTS_JS)
            hm = await pg.evaluate(HASH_JS, I['map']); hr = await pg.evaluate(HASH_JS, I['road'])
            e15, b15 = await offline_at(pg, 15, errs, f'{OUT}/a_before_z15.png'); e16, b16 = await offline_at(pg, 16, errs, f'{OUT}/a_before_z16.png')
            print('A', ver, t1, '|', t2, parts, e15, b15, e16, b16)
            check('A. v2.35.6 on an iPhone browser (emulated write bug): both packs import "ready", but the parts are larger than 8 MB, the bytes differ from the files and the map is blank close up (zoom 16)',
                  any(v > P8 for v in parts.values()) and hm != H_NCR and hr != H_ROAD and e16 > 0 and b16 > 0.9, (parts, e15, b15, e16, b16))
            await ctx.close()
        finally: srv.terminate(); srv.wait()
        # ---- B. v2.35.7 opens the same phone
        srv = server(NEW)
        try:
            ctx, pg, errs = await phone(p, ud)
            await W(pg, 4500)  # checkPacks runs 2.5 s after start
            t = await pg.text_content('#toast')
            st = await pg.evaluate("Object.values(__polecam.S.packs).map((p) => ({ id: p.id, damaged: p.damaged, chkv: p.chkv }))")
            log = await pg.evaluate("JSON.parse(localStorage.getItem('polecam.log') || '[]').filter((x) => /^pack\\./.test(x.e)).map((x) => x.e + ' ' + JSON.stringify(x.d || {}).slice(0, 160))")
            print('B start', t, st, log)
            check('B1. v2.35.7 finds both packs saved wrongly: marked damaged (parts), a toast says Maps → Repair (no download), the App log says pack.damaged with the part sizes',
                  all(x['damaged'] == 'parts' for x in st) and len(st) == 2 and 'Repair' in (t or '') and 'iPhone' in t and sum('pack.damaged' in l for l in log) == 2, (t, st))
            I = await ids(pg)
            cm = await card(pg, I['map']); cr = await card(pg, I['road']); print(cm, cr)
            await pg.screenshot(path=f'{OUT}/b_list.png')
            check('B2. Maps lists each as DAMAGED with a Repair button', cm and 'DAMAGED' in cm['s'] and 'Repair' in cm['b'] and cr and 'DAMAGED' in cr['s'] and 'Repair' in cr['b'], (cm, cr))
            # a repair stopped half way: the phone's storage fails after two parts
            await pg.evaluate("""() => { window.__cw = 0; const o = FileSystemFileHandle.prototype.createWritable; window.__cwo = o;
              FileSystemFileHandle.prototype.createWritable = function (...a) { if (++window.__cw > 2) return Promise.reject(new Error('test: storage stopped')); return o.apply(this, a); }; }""")
            t3 = await tap(pg, I['map'], 'Repair')
            fx = await pg.evaluate("(id) => __polecam.S.packs[id].fix || null", I['map']); parts3 = await pg.evaluate(PARTS_JS)
            print('B3', t3, fx, parts3)
            check('B3. a repair stopped by a storage error says so ("Tap Repair again") and keeps its plan; two parts are already right',
                  'Not repaired' in (t3 or '') and 'Repair again' in t3 and fx and len(fx['pre']) == 6 and sum(1 for k, v in parts3.items() if k.startswith(I['map']) and v == P8) >= 2, (t3, fx))
            # the app is closed and opened again; storage works again
            await pg.reload(); await W(pg, 4500)
            t4 = await tap(pg, I['map'], 'Repair')
            parts4 = await pg.evaluate(PARTS_JS); hm = await pg.evaluate(HASH_JS, I['map'])
            st4 = await pg.evaluate("(id) => { const p = __polecam.S.packs[id]; return { damaged: p.damaged || null, fix: p.fix || null }; }", I['map'])
            print('B4', t4, parts4, st4)
            check('B4. after a restart Repair goes on from its plan: "repaired", every part exactly 8 MB (the last the rest), the pack is byte-identical to the file',
                  'repaired' in (t4 or '') and hm == H_NCR and all(v == P8 for k, v in parts4.items() if k.startswith(I['map'] + '.') and not k.endswith('.5')) and not st4['damaged'] and not st4['fix'], (t4, st4))
            t5 = await tap(pg, I['road'], 'Repair'); hr = await pg.evaluate(HASH_JS, I['road']); cr = await card(pg, I['road'])
            print('B5', t5, cr)
            check('B5. the road pack is repaired too: byte-identical to the file, no longer DAMAGED', 'repaired' in (t5 or '') and hr == H_ROAD and 'DAMAGED' not in cr['s'] and 'Repair' not in cr['b'], (t5, cr))
            r = await pg.evaluate("async () => { const R = await __polecam.planRoads([7.060, 125.580, 7.090, 125.620], [7.065, 125.585, 7.085, 125.615]); return { note: R.note, n: R.roads.length }; }")
            check('B6. the plan drawing reads its roads from the repaired road pack', r['n'] > 20 and 'road pack' in r['note'], r)
            res = {}
            for z in (13, 14, 15, 16, 18):
                res[z] = await offline_at(pg, z, errs, f'{OUT}/b_after_z{z}.png')
            print('B7', res)
            check('B7. the map draws close up again (zoom 13 to 18): no unreadable tiles, the screen is not one flat colour', all(e == 0 and b < 0.85 for e, b in res.values()), res)
            log = await pg.evaluate("JSON.parse(localStorage.getItem('polecam.log') || '[]').filter((x) => /^pack\\.repair/.test(x.e)).map((x) => x.e + ' ' + JSON.stringify(x.d || {}).slice(0, 200))")
            print('\n'.join(log))
            check('B8. the App log records each repair (its check and the result)', sum('pack.repaired' in l for l in log) == 2 and any('pack.repair.fail' in l for l in log), log[-4:])
            bad = [e for e in errs if 'PAGEERROR' in e]
            check('B9. no page errors', not bad, bad[:4])
            await ctx.close()
            # ---- C. v2.35.7 on a fresh emulated iPhone
            ud2 = f'{D}/ud_c'; shutil.rmtree(ud2, ignore_errors=True)
            ctx, pg, errs = await phone(p, ud2)
            t1 = await imp(pg, NCR); t2 = await imp(pg, ROAD); I = await ids(pg)
            parts = await pg.evaluate(PARTS_JS); hm = await pg.evaluate(HASH_JS, I['map']); hr = await pg.evaluate(HASH_JS, I['road'])
            st = await pg.evaluate("Object.values(__polecam.S.packs).map((p) => ({ damaged: p.damaged || null, chkv: p.chkv, done: p.done }))")
            e16, b16 = await offline_at(pg, 16, errs, f'{OUT}/c_z16.png')
            print('C', t1, '|', t2, parts, st, e16, b16)
            check('C. v2.35.7 imports on the same iPhone browser correctly: parts exactly 8 MB, both packs byte-identical to the files, nothing flagged, the map draws at zoom 16',
                  hm == H_NCR and hr == H_ROAD and all(v <= P8 for v in parts.values()) and all(x['done'] and not x['damaged'] and x['chkv'] == 2 for x in st) and e16 == 0 and b16 < 0.85 and 'ready' in (t1 or '') and 'ready' in (t2 or ''), (t1, t2, st, e16, b16))
            # ---- D. data damaged another way: a part overwritten (same size)
            await pg.evaluate("""async (id) => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('mappacks'); const h = await d.getFileHandle(id + '.3');
              const n = (await h.getFile()).size, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = (i * 2654435761) >>> 24;
              const w = await h.createWritable(); await w.write(u.buffer); await w.close();
              const s = JSON.parse(localStorage.getItem('polecam.settings')); s.packs[id].chkv = 1; localStorage.setItem('polecam.settings', JSON.stringify(s)); }""", I['map'])
            await pg.reload(); await W(pg, 4500)
            t = await pg.text_content('#toast'); cm = await card(pg, I['map'])
            print('D', t, cm)
            check('D. a pack whose data cannot be read for another reason: DAMAGED, download it again (no Repair), a toast says so',
                  cm and 'cannot be read' in cm['s'] and 'Repair' not in cm['b'] and ('How to fix' in cm['b'] or 'Download again' in cm['b']) and 'Download again' in (t or ''), (t, cm))
            await ctx.close()
        finally: srv.terminate(); srv.wait()
    ims = [Image.open(f'{OUT}/{n}.png').convert('RGB') for n in ('a_before_z16', 'b_after_z16', 'b_after_z18')]
    w, h = ims[0].size; s = 0.4; g = Image.new('RGB', (int(w * s) * 3, int(h * s)), 'white')
    for i, im in enumerate(ims): g.paste(im.resize((int(w * s), int(h * s))), (i * int(w * s), 0))
    g.save(f'{OUT}/before_after.png')
    print(f'{sum(checks)}/{len(checks)} passed')
asyncio.run(main())
