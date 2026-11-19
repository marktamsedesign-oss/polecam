"""v2.29 (b): download the area on the map for offline use, cut from a Protomaps build by range requests (served here from a
real Protomaps extract of Florence), written as a PMTiles v3 pack on the phone; the pack reads back tile for tile; leaf
directories for big packs; Cancel; a source that does not answer; the admin's own source."""
import asyncio, sys, os, shutil, json, re, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
from common import launch, sheet_companies
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out_b'; os.makedirs(OUT, exist_ok=True)
SRC = open(S + '/fixtures/maps/firenze.pmtiles', 'rb').read()  # z0-15, bbox 11.221144,43.745121,11.287543,43.789306
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:900])
async def W(pg, ms): await pg.wait_for_timeout(ms)
LOG = {'req': [], 'mode': 'ok', 'delay': 0}
CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length, ETag'}
async def build(route):
    r = route.request; LOG['req'].append((r.method, r.url, r.headers.get('range')))
    if r.method == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
    if LOG['mode'] == 'down': return await route.fulfill(status=404, headers=CORS, body='not found')
    if LOG['mode'] == 'whole': return await route.fulfill(status=200, headers={**CORS, 'Content-Type': 'application/octet-stream'}, body=SRC[:200000])
    if not re.search(r'/\d{8}\.pmtiles$|/own\.pmtiles$', r.url): return await route.fulfill(status=404, headers=CORS, body='')
    m = re.match(r'bytes=(\d+)-(\d+)', r.headers.get('range') or '')
    if not m: return await route.fulfill(status=200, headers=CORS, body=SRC)
    a, b = int(m.group(1)), min(int(m.group(2)), len(SRC) - 1)
    if LOG['delay']: await asyncio.sleep(LOG['delay'])
    await route.fulfill(status=206, headers={**CORS, 'Content-Range': f'bytes {a}-{b}/{len(SRC)}', 'Content-Type': 'application/octet-stream', 'ETag': '"firenze"'}, body=SRC[a:b + 1])
VIEW = "try { const k='polecam.settings'; const s=JSON.parse(localStorage.getItem(k)||'{}'); if (!s.view29) { s.view = { lat: 43.7700, lon: 11.2550, z: 15 }; s.view29 = 1; localStorage.setItem(k, JSON.stringify(s)); } } catch (e) {}"

async def main():
    async with async_playwright() as p:
        shutil.rmtree(f'{D}/ud_b', ignore_errors=True)
        ctx, pg, errs, cur, st0, tk = await launch(p, f'{D}/ud_b', S + '/v17/vid/h_cc.mjpeg', project=False, geo={'latitude': 43.77, 'longitude': 11.255, 'accuracy': 5})
        await ctx.route('https://build.protomaps.com/**', build); await ctx.route('https://maps.example.com/**', build)
        await ctx.add_init_script(VIEW); await pg.reload(); await W(pg, 1500)
        await pg.fill('#pfName', 'Mark Tamse'); await pg.fill('#pfMobile', '09171234567'); await pg.fill('#pfEmail', 'mark@example.com')
        await pg.click('#pfCreateBox summary'); await pg.click('#pfCreate'); await W(pg, 400); await pg.fill('#admPin', '1234'); await pg.fill('#admPin2', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admName', 'Globe OSP'); await sheet_companies(pg, ['GLOBE'], admins=['GLOBE'])
        await pg.click('#admSave'); await pg.wait_for_selector('#qrShow:not([hidden])'); await W(pg, 300); await pg.click('#qrClose'); await W(pg, 300)
        await pg.select_option('#pfCompany', 'GLOBE'); await pg.click('#pfSave'); await W(pg, 900)
        for _ in range(6):
            if await pg.locator('section.sheet:not([hidden])').count() == 0: break
            await pg.go_back(); await W(pg, 250)
        # ===== 1. the download
        urls = await pg.evaluate("__polecam.pmBuildUrls()")
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 800)
        o0 = await pg.evaluate("({ btn: document.getElementById('areaDl').textContent, vis: !!document.getElementById('areaDl').getClientRects().length, info: document.getElementById('areaDlInfo').textContent })")
        await pg.screenshot(path=f'{OUT}/b1_offline_sheet.png')
        await pg.click('#areaDl'); await W(pg, 500)
        q = await pg.evaluate("({ title: (document.querySelector('#askBox h3, #askTitle') || {}).textContent, text: (document.querySelector('#askBox p, #askText') || {}).textContent, btns: [...document.querySelectorAll('#askBox button')].map(b => b.textContent) })")
        await pg.screenshot(path=f'{OUT}/b2_ask.png')
        t0 = time.time(); LOG['req'].clear()
        # beta 3.3 (QA-02): every text the progress screen shows is noted as it changes (no fixed wait): the check reads the
        # progress line (tiles and MB) whenever it showed, even when the download ends quickly
        await pg.evaluate("() => { window.__busySeen = []; const b = document.getElementById('busyText'); new MutationObserver(() => window.__busySeen.push(b.textContent)).observe(b, { childList: true, characterData: true, subtree: true }); }")
        await pg.click('#askBox button:has-text("The map view")')
        await pg.wait_for_function("() => (window.__busySeen || []).some((t) => /tiles/.test(t) && /MB/.test(t)) || Object.values(__polecam.S.packs || {}).some(p => /^area-/.test(p.id) && p.done)", timeout=120000)
        prog = await pg.evaluate("() => (window.__busySeen || []).filter((t) => /tiles/.test(t) && /MB/.test(t)).pop() || document.getElementById('busyText').textContent")
        await pg.screenshot(path=f'{OUT}/b3_progress.png')
        await pg.wait_for_function("Object.values(__polecam.S.packs || {}).some(p => /^area-/.test(p.id) && p.done)", timeout=120000)
        await W(pg, 800)
        pk = await pg.evaluate("Object.values(__polecam.S.packs).find(p => /^area-/.test(p.id))")
        toast = await pg.text_content('#toast')
        await pg.screenshot(path=f'{OUT}/b4_done.png')
        reqs = [x for x in LOG['req'] if 'build.protomaps.com' in x[1]]
        check('Offline maps: “Download an area for offline use” with a note; it asks the map view or (with a project) the project’s area, with the size in km',
              'Download an area' in o0['btn'] and o0['vis'] and 'Protomaps' in o0['info'] and 'Download an area' in (q['title'] or '') and 'km' in (q['text'] or '') and q['btns'] == ['Cancel', 'The map view'], (o0, q))
        check('the newest daily build is used (build.protomaps.com/YYYYMMDD.pmtiles, today first), read only by range requests; progress shown in tiles and MB',
              urls[0].startswith('https://build.protomaps.com/') and len(urls) == 10 and all(r[2] and r[2].startswith('bytes=') for r in reqs if r[0] == 'GET') and reqs and reqs[0][1] == urls[0] and 'tiles' in (prog or '') and 'MB' in (prog or ''),
              (urls[:2], len(reqs), reqs[:3], prog))
        check('the area is saved as an offline map pack (ready toast, in the list, active)', pk and pk['done'] and pk['size'] > 10000 and pk['maxzoom'] == 15 and 'ready' in (toast or ''), (pk, toast))
        # ===== 2. the pack reads back tile for tile against the source
        rb = await pg.evaluate("""async (id) => { const P = window.protomapsL.PMTiles;
          class Src { constructor(u) { this.u = u; } getKey() { return this.u; } async getBytes(o, l) { const r = await fetch(this.u, { headers: { Range: `bytes=${o}-${o + l - 1}` } }); return { data: await r.arrayBuffer() }; } }
          const a = new P(new __polecam.PackSource(id)), b = new P(new Src(__polecam.pmBuildUrls()[0]));
          const ha = await a.getHeader(), hb = await b.getHeader(), st = __polecam.S.packs[id], tiles = __polecam.areaTiles(st.bbox, 15);
          let same = 0, diff = 0, missing = 0, extra = 0, both = 0; const eq = (x, y) => { if (x.byteLength !== y.byteLength) return false; const u = new Uint8Array(x), v = new Uint8Array(y); for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false; return true; };
          for (const [z, x, y] of tiles) { const ta = await a.getZxy(z, x, y), tb = await b.getZxy(z, x, y);
            if (ta && tb) { both++; if (eq(ta.data, tb.data)) same++; else diff++; } else if (tb && !ta) missing++; else if (ta && !tb) extra++; }
          const meta = await a.getMetadata();
          return { tiles: tiles.length, both, same, diff, missing, extra, ha: { v: ha.specVersion, tt: ha.tileType, tc: ha.tileCompression, ic: ha.internalCompression, minZ: ha.minZoom, maxZ: ha.maxZoom, clustered: ha.clustered, addressed: ha.numAddressedTiles, entries: ha.numTileEntries, contents: ha.numTileContents, leafLen: ha.leafDirectoryLength },
            src: { tt: hb.tileType, tc: hb.tileCompression }, desc: meta.description, layers: (meta.vector_layers || []).length, bbox: meta['g-esaa:bbox'] }; }""", pk['id'])
        check('the pack reads back with the PMTiles reader: every tile of the area identical to the source build; v3, vector (MVT), gzip, clustered, zoom 0-15, the source metadata kept',
              rb['both'] > 20 and rb['same'] == rb['both'] and rb['missing'] == 0 and rb['extra'] == 0 and rb['ha']['v'] == 3 and rb['ha']['tt'] == 1 and rb['ha']['tc'] == 2 and rb['ha']['clustered'] and rb['ha']['maxZ'] == 15
              and rb['ha']['addressed'] == rb['both'] and rb['layers'] > 3 and 'G-eSAA area pack' in (rb['desc'] or ''), rb)
        # ===== 3. the map draws from it offline
        await pg.evaluate("document.getElementById('offline').hidden = true"); await W(pg, 200)
        sel = await pg.evaluate("""(() => { const b = [...document.querySelectorAll('#offline button, #offline input')].map(e => e.id).filter(Boolean); return b.slice(0, 40); })()""")
        await ctx.set_offline(True); await W(pg, 500)
        await pg.evaluate("(() => { const s = __polecam.S; s.base = 'offline'; })()")
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 800)
        used = await pg.evaluate("""(() => [...document.querySelectorAll('#packList .area-card')].map(e => e.textContent.slice(0, 160)))()""")
        await pg.screenshot(path=f'{OUT}/b5_pack_listed.png')
        await ctx.set_offline(False)
        check('the area pack is listed in Offline maps', any(('Area' in u) for u in used), used[:6])
        await pg.evaluate("document.getElementById('offline').hidden = true"); await W(pg, 200)
        # ===== 4. big pack: leaf directories, run-length of identical tiles, read back
        big = await pg.evaluate("""async () => { const gz = async (u) => new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
          const tiles = [], raw = new Map(); let n = 0, seed = 12345; const same = new Uint8Array([7, 7, 7, 7, 1, 2, 3]); const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
          while (raw.size < 60000) { const x = Math.floor(rnd() * 65536), y = Math.floor(rnd() * 65536), k = `16/${x}/${y}`; if (raw.has(k)) continue;
            const L = 3 + Math.floor(rnd() * 40), u = n % 7 === 0 ? same : Uint8Array.from({ length: L }, () => Math.floor(rnd() * 256)); n++; raw.set(k, u); tiles.push({ z: 16, x, y, data: u }); } // not gzipped: tile compression none
          for (let x = 0; x < 64; x++) { const k = `16/${x}/0`; if (!raw.has(k)) { raw.set(k, same); tiles.push({ z: 16, x, y: 0, data: same }); } } // a run of identical tiles
          const blob = await __polecam.buildPmtiles(tiles, [0, 0, 1, 1], 16, 16, { name: 'synthetic' });
          class B { constructor(b) { this.b = b; } getKey() { return 'b'; } async getBytes(o, l) { return { data: await this.b.slice(o, o + l).arrayBuffer() }; } }
          const P = new window.protomapsL.PMTiles(new B(blob)), h = await P.getHeader();
          let ok = 0, bad = 0, i = 0; for (const [k, u] of raw) { if (i++ % 20 && !k.endsWith('/0')) continue; const [z, x, y] = k.split("/").map(Number); /* every 20th tile and the run */ const t = await P.getZxy(z, x, y); const v = t && new Uint8Array(t.data); if (v && v.length === u.length && v.every((q, i) => q === u[i])) ok++; else bad++; }
          let none = true; for (let x = 100; x < 140; x++) { const k = `16/${x}/1`; if (!raw.has(k) && await P.getZxy(16, x, 1)) none = false; }
          return { size: blob.size, n: raw.size, read: ok + bad, ok, bad, none, rootLen: h.rootDirectoryLength, leafLen: h.leafDirectoryLength, entries: h.numTileEntries, contents: h.numTileContents, addressed: h.numAddressedTiles, tc: h.tileCompression }; }""")
        check('a big pack (60,000+ scattered tiles): root directory within the first 16 KB, leaf directories, identical tiles stored once (a run of them as one entry); the tiles read back (every 20th and the run), tiles not in it are absent; ungzipped tiles flagged so',
              big['ok'] == big['read'] and big['read'] > 3000 and big['bad'] == 0 and big['none'] and big['leafLen'] > 0 and 127 + big['rootLen'] <= 16384 and big['addressed'] == big['n'] and big['contents'] < big['addressed'] and big['entries'] < big['addressed'] and big['tc'] == 1, big)
        tid = await pg.evaluate("[[0,0,0],[1,0,0],[1,0,1],[1,1,1],[1,1,0],[2,0,0],[12,3423,1763]].map(([z,x,y]) => __polecam.pmTileId(z,x,y))")
        check('tile IDs follow the PMTiles Hilbert curve (spec examples)', tid[:6] == [0, 1, 2, 3, 4, 5] and tid[6] > 0, tid)
        # ===== 5. Cancel
        LOG['delay'] = 0.6
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 700)
        n0 = await pg.evaluate("Object.keys(__polecam.S.packs).length")
        await pg.click('#areaDl'); await W(pg, 400); await pg.click('#askBox button:has-text("The map view")'); await W(pg, 2500)
        busyOn = await pg.evaluate("!document.getElementById('busy').hidden && !document.getElementById('busyCancel').hidden")
        await pg.click('#busyCancel'); await W(pg, 3000)
        c1 = await pg.evaluate("({ busy: !document.getElementById('busy').hidden, n: Object.keys(__polecam.S.packs).length, toast: document.getElementById('toast').textContent })")
        LOG['delay'] = 0
        check('Cancel on the progress screen stops the area download: nothing half-saved', busyOn and not c1['busy'] and c1['n'] == n0 and 'stopped' in c1['toast'].lower(), (busyOn, c1, n0))
        # ===== 6. no source answers / the whole file sent
        LOG['mode'] = 'down'
        await pg.click('#areaDl'); await W(pg, 400); await pg.click('#askBox button:has-text("The map view")'); await W(pg, 6000)
        t6 = await pg.text_content('#toast')
        LOG['mode'] = 'whole'
        await pg.click('#areaDl'); await W(pg, 400); await pg.click('#askBox button:has-text("The map view")'); await W(pg, 6000)
        t7 = await pg.text_content('#toast'); LOG['mode'] = 'ok'
        check('a source that does not answer: “No Protomaps build answered …” (after trying the last days); a server that ignores ranges is refused (not downloaded whole)',
              'No Protomaps build answered' in t6 and ('whole file' in t7 or 'No Protomaps build answered' in t7), (t6, t7))
        # ===== 7. the admin's own source
        await pg.evaluate("document.getElementById('offline').hidden = true")
        for _ in range(6):
            if await pg.locator('section.sheet:not([hidden])').count() == 0: break
            await pg.go_back(); await W(pg, 250)
        await pg.evaluate("document.getElementById('goAdmin').click()"); await W(pg, 800)
        if await pg.is_visible('#admPin'):
            await pg.fill('#admPin', '1234'); await pg.click('#admUnlock'); await W(pg, 600)
        await pg.fill('#admAreaSrc', 'https://maps.example.com/own.pmtiles')
        await pg.click('#admSave'); await W(pg, 800)
        if await pg.is_visible('#qrShow'): await pg.click('#qrClose'); await W(pg, 300)
        own = await pg.evaluate("__polecam.S.team.pol.areaSrc")
        for _ in range(6):
            if await pg.locator('section.sheet:not([hidden])').count() == 0: break
            await pg.go_back(); await W(pg, 250)
        LOG['req'].clear()
        await pg.evaluate("document.getElementById('offlineBtn').click()"); await W(pg, 700)
        await pg.click('#areaDl'); await W(pg, 400); await pg.click('#askBox button:has-text("The map view")')
        await pg.wait_for_function("Object.values(__polecam.S.packs || {}).filter(p => /^area-/.test(p.id) && p.done).length >= 2", timeout=120000)
        hosts = sorted({re.sub(r'^https://([^/]+)/.*', r'\1', u) for _, u, _ in LOG['req']})
        check('Administration → area download source (https): the area is cut from the company’s own copy instead of the Protomaps build', own == 'https://maps.example.com/own.pmtiles' and hosts == ['maps.example.com'], (own, hosts))
        bad = [e for e in errs if 'PAGEERROR' in e or 'TypeError' in e or 'ReferenceError' in e]
        check('no page errors', not bad, bad[:5])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} checks passed')
asyncio.run(main())
