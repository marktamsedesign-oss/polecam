"""v2.43.0 beta 1.1, as of beta 3.3 (synthetic data only): the beta website at …/polecam/beta/ beside the users' website at …/polecam/,
on the same address (as GitHub Pages will serve them). Real service workers, real storage, offline.
Stable = the v2.42.28 build; beta = this build; laid out the way the new deploy-site.yml lays them out."""
import asyncio, sys, os, shutil, subprocess, time, json, re
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17')
import common
from playwright.async_api import async_playwright
OUT = S + '/v243/out_b'; SITE = OUT + '/site'; PORT = 8766; BASE = f'http://localhost:{PORT}'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
STABLE = PRIV + '/old/v2.42.28'; BETA = APP
ign = shutil.ignore_patterns('.git', '.github', 'tests', '*.pmtiles', '__pycache__')
shutil.copytree(STABLE, SITE + '/polecam', ignore=ign)
shutil.copytree(BETA, SITE + '/polecam/beta', ignore=ign)
m = open(SITE + '/polecam/beta/manifest.json').read()   # what deploy-site.yml does with sed
open(SITE + '/polecam/beta/manifest.json', 'w').write(m.replace('"name": "G-eSAA"', '"name": "G-eSAA Beta"').replace('"short_name": "G-eSAA"', '"short_name": "G-eSAA Beta"'))
shutil.copytree(BETA, SITE + '/apk', ignore=ign)        # the beta APK's files sit at the root of their own app
W = lambda pg, ms: pg.wait_for_timeout(ms)
checks = []
def check(name, ok, info=''):
    checks.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  ← {str(info)[:400]}'), flush=True)
LS = "() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))"
CK = "async () => (await caches.keys()).sort()"
SWREADY = "async () => { const r = await navigator.serviceWorker.ready; return r.scope; }"
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', SITE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.2)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=common.CHROME)
            ctx = await b.new_context(viewport={'width': 1280, 'height': 860})
            for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**', 'https://build.protomaps.com/**', 'https://fonts.googleapis.com/**'): await ctx.route(u, lambda r: r.abort())
            pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
            # 1. the users' website
            await pg.goto(BASE + '/polecam/index.html'); await W(pg, 2500)
            sc = await pg.evaluate(SWREADY); await W(pg, 2500)
            ver = (await pg.text_content('#brandVer') or '').strip()
            await pg.evaluate("() => localStorage.setItem('polecam.settings', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('polecam.settings') || '{}'), { testMark: 'stable-user' })))")
            ls0 = await pg.evaluate(LS); ck0 = await pg.evaluate(CK)
            check('S1 the users\' website runs v2.42.28 with its own offline copy', ver == 'v2.42.28' and sc.endswith('/polecam/') and 'polecam-v2.42.28' in ck0, (ver, sc, ck0))
            # 2. the beta website, same address
            await pg.goto(BASE + '/polecam/beta/index.html'); await W(pg, 2500)
            sc = await pg.evaluate(SWREADY); await W(pg, 3000)
            info = await pg.evaluate("() => ({ beta: __polecam.team.beta(), tag: (document.querySelector('.betatag') || {}).textContent || '', title: document.title, box: !document.getElementById('betaBox').hidden })")
            check('B1 …/beta/ is G-eSAA Beta 3.3: BETA tag, title, the beta card', info['beta']['BETA'] and info['beta']['VER_LABEL'] == '2.43.0 beta 3.3' and info['tag'] == 'BETA 3.3' and info['title'] == 'G-eSAA Beta' and info['box'], info)
            check('B2 its service worker covers only …/polecam/beta/', sc.endswith('/polecam/beta/'), sc)
            await pg.evaluate("() => __polecam.team.patchS({ testMark: 'beta-tester' })"); await W(pg, 300)
            ls1 = await pg.evaluate(LS)
            new = sorted(k for k in ls1 if k not in ls0)
            check('B3 the beta keeps its settings under its own names (polecam-beta.…)', new and all(k.startswith('polecam-beta.') for k in new) and 'beta-tester' in ls1.get('polecam-beta.settings', ''), new)
            check('B4 the users\' settings in this browser are untouched', ls1.get('polecam.settings') == ls0.get('polecam.settings') and 'stable-user' in ls1.get('polecam.settings', ''))
            dbs = await pg.evaluate("async () => (await indexedDB.databases()).map((d) => d.name).sort()")
            check('B5 the beta\'s projects database is its own (polecam-beta)', 'polecam-beta' in dbs, dbs)
            ck1 = await pg.evaluate(CK)
            check('B6 the beta\'s offline copy is its own, and the users\' copy is still there', 'polecam-beta-v2.43.0-b3.3' in ck1 and 'polecam-v2.42.28' in ck1, ck1)
            # 3. offline: each address opens its own app from its own copy
            await ctx.set_offline(True)
            await pg.goto(BASE + '/polecam/beta/index.html'); await W(pg, 2500)
            t_b = await pg.title(); v_b = (await pg.text_content('#brandVer') or '').strip()
            await pg.goto(BASE + '/polecam/index.html'); await W(pg, 2500)
            t_s = await pg.title(); v_s = (await pg.text_content('#brandVer') or '').strip()
            await ctx.set_offline(False)
            check('O1 offline, …/beta/ opens G-eSAA Beta and …/polecam/ opens G-eSAA', t_b == 'G-eSAA Beta' and v_b == 'v2.43.0' and v_s == 'v2.42.28' and t_s != 'G-eSAA Beta', (t_b, v_b, t_s, v_s))
            ls2 = await pg.evaluate(LS)
            check('O2 back on the users\' website, it reads its own settings (not the beta\'s)', 'stable-user' in ls2.get('polecam.settings', '') and 'beta-tester' not in ls2.get('polecam.settings', ''), ls2.get('polecam.settings', '')[:200])
            # 4. a beta-made invite link points at the beta website
            base = await pg.evaluate("() => location.href")  # stable page now; go back to beta and read its link base
            await pg.goto(BASE + '/polecam/beta/index.html'); await W(pg, 1500)
            # (webBase on localhost is the APK path; on https it is location: check the rule directly)
            rule = await pg.evaluate("() => location.origin + location.pathname.replace(/index\\.html$/, '')")
            check('L1 on the beta website, links are made from …/polecam/beta/', rule.endswith('/polecam/beta/'), rule)
            m2 = json.load(open(SITE + '/polecam/beta/manifest.json'))
            check('L2 installed from …/beta/, it is called G-eSAA Beta', m2['name'] == 'G-eSAA Beta' and m2['short_name'] == 'G-eSAA Beta')
            await ctx.close()
            # 5. the beta APK (files at the root of its own app, channel flag): the usual names, so beta 1 testers keep their data
            ctx2 = await b.new_context(viewport={'width': 412, 'height': 860}, service_workers='block')
            await ctx2.add_init_script("window.GESAA_CHANNEL='beta'")
            for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**', 'https://build.protomaps.com/**'): await ctx2.route(u, lambda r: r.abort())
            q = await ctx2.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
            await q.goto(BASE + '/apk/index.html'); await W(q, 2500)
            await q.evaluate("() => __polecam.team.patchS({ testMark: 'apk' })")
            ks = await q.evaluate("() => Object.keys(localStorage)")
            bi = await q.evaluate("() => __polecam.team.beta()")
            check('A1 the beta APK keeps the usual storage names (beta 1 testers keep their projects)', 'polecam.settings' in ks and not any(k.startswith('polecam-beta') for k in ks) and bi['BETA'], (ks, bi))
            check('E1 no page errors', not errs, errs)
            await b.close()
    finally:
        srv.terminate()
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed' + (f': {bad}' if bad else ''))
asyncio.run(main())
