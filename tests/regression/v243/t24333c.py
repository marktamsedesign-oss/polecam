"""v2.43.0 beta 3.3, QA-10 (synthetic data only): the team mailbox at Google's limits, on the REAL mailbox script's stand-in
(e2e/servers.js), which can refuse for some seconds (Google's own HTML error page, or rate / busy), force an answer, limit the calls
at once, and say the Drive is nearly full. Every message in plain words; a refusal for 30 s: the send and the download complete by
themselves; 10 phones download at once from a stand-in that refuses above 30 calls at once: all complete, none lost."""
import asyncio, sys, os, json, re, time, concurrent.futures
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v243/t2433c.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v243/out_c3'", "OUT = S + '/v243/out_qa10'")
exec(compile(src, 't2433c_head', 'exec'))
PROJ = 'DEMO SITE LIMITS'
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=96)
def lim(q): return e2e('/mbxlimit?' + q)
def lim_read_reset(): st = lim('x=1'); lim('reset=1'); return st
async def google_async(route):
    """As google(), without blocking: many phones' calls reach the stand-in at once (the 10-phone part)."""
    rq = route.request; url = rq.url; loop = asyncio.get_event_loop()
    if url.startswith(MBX_URL):
        def go():
            try: return urllib.request.urlopen(urllib.request.Request(E2E + '/mbx', data=(rq.post_data or '{}').encode(), method='POST'), timeout=120).read()
            except Exception as e: return json.dumps({'ok': False, 'error': 'server'}).encode()
        body = await loop.run_in_executor(POOL, go)
        ct = 'text/html' if body[:1] == b'<' else 'application/json'
        return await route.fulfill(status=200, content_type=ct, body=body, headers={'Access-Control-Allow-Origin': '*'})
    return await google(route)
async def send_err(pg, ms=150000):
    st = await send_go(pg, ms); err = (await txt(pg, '#mbxSendErr')) if await pg.is_visible('#mbxSendErr') else (st['line'] if st.get('back') and not st.get('done') else '')
    return st, err

async def main():
    open(OUT + '/asplan.kml', 'w').write(KML)
    srv = subprocess.Popen(['node', S + '/v243/e2e/servers.js'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT); time.sleep(1.5)
    try:
        async with async_playwright() as p:
            ca, A, ea = await new_ctx(p, OUT + '/ud_juan'); await setup(A, 'Juan Dela Cruz', JUAN)
            cb, B, eb = await new_ctx(p, OUT + '/ud_pedro'); await setup(B, 'Pedro Santos', PEDRO)
            await open_team(A); await confirm_email(A, JUAN); await role(A, 'Coordinator')
            await A.click('#tmMbxSetup'); await W(A, 500); await A.fill('#mbxUrl', MBX_URL); await A.click('#mbxSave'); await idle(A, 40000); await W(A, 400)
            await open_team(B); await confirm_email(B, PEDRO); await role(B, 'Field Partner')
            await B.locator('#tmCoList .tmrow', has_text='Juan Dela Cruz').locator('[data-join]').click(); await idle(B)
            await open_team(A); await A.locator('#tmMemList [data-accept]').first.click(); await idle(A); await W(A, 300)
            if await B.is_visible('#tmRefresh'): await B.click('#tmRefresh'); await idle(B)
            await close_sheets(A); await A.click('#projectBtn'); await W(A, 300); await A.click('#newProjBtn'); await W(A, 300)
            await A.select_option('#npCat', 'survey'); await W(A, 200); await A.select_option('#npPurpose', 'As-plan'); await A.fill('#npName', PROJ); await A.set_input_files('#npKmzInput', OUT + '/asplan.kml'); await W(A, 300)
            await A.click('#npAssign .chip:has-text("Pedro Santos")'); await A.click('#npCreate'); await idle(A, 40000); await W(A, 500)
            await projects(B); await dl(B, ms=40000); await W(B, 400)
            # ---------- 1. the words
            W_ = {c: await B.evaluate("(c) => __polecam.team.mbx.why(c)", c) for c in ['full', 'rate', 'gone', 'closed', 'unclaimed', 'busy', 'drive', 'server', 'nojson']}
            open(OUT + '/messages.json', 'w').write(json.dumps(W_, indent=1, ensure_ascii=False))
            check('M1 a plain sentence for each of full, rate, gone, closed, unclaimed, busy, drive, server and an answer that is not JSON (never the code alone)',
                  all(len(v) > 25 and v.strip() != c for c, v in W_.items()) and W_['nojson'] == 'Google is busy: try again in a minute'
                  and 'Juan Dela Cruz, who set up the mailbox, frees space in that Google account' in W_['full'] and 'Drive, Gmail or Photos' in W_['full'], W_)
            # ---------- 2. the Drive nearly full: the send stops before it starts, with the reason
            await mbx(B, 'seed', PROJ, 3, {}); lim('free=500000'); w0 = len([o for o in await mbx(B, 'out') if o['st'] == 'waiting']); files0 = sorted(e2e('/drive'))
            await close_sheets(B); await B.click('#projectBtn'); await W(B, 300); await send_sheet(B); st, err = await send_err(B, 60000)
            await B.screenshot(path=f'{OUT}/m2_full.png')
            check('M2 Drive nearly full: Not sent, with who frees the space and how much is needed; nothing reached the mailbox',
                  "Google Drive is full: Juan Dela Cruz, who set up the mailbox, frees space" in err and 'free and this send needs' in err and sorted(e2e('/drive')) == files0
                  and len([o for o in await mbx(B, 'out') if o['st'] == 'waiting']) == w0, err)
            lim('free=-1')
            if await B.is_visible('#mbxBack'): await B.click('#mbxBack'); await W(B, 300)
            await close_sheets(B)
            # ---------- 3. a refusal for 30 s (Google's HTML page): the send completes by itself
            lim('refuse=30&how=html'); t0 = time.time()
            await B.click('#projectBtn'); await W(B, 300); await send_sheet(B); st, err = await send_err(B, 150000); dt = time.time() - t0
            stats = lim_read_reset()
            check('M3 the mailbox refuses for 30 s (not JSON): the send waits and tries again by itself, then is sent (no message to the user)', 'Sent to Juan' in st['line'] and not err and dt >= 30 and stats['refused'] > 0,
                  ({k: v for k, v in st.items() if k != 'seen'}, err, round(dt), stats['refused']))
            seen = ' '.join(x[1] + ' ' + x[2] for x in st['seen'])
            check('M3b meanwhile the Send screen said so in plain words', 'Google is busy: trying again in' in seen, seen[-300:])
            # ---------- 4. a refusal for 30 s (rate): the download completes by itself
            await projects(A)
            lim('refuse=30&how=rate'); t0 = time.time()
            j, stg = await dl(A, ms=150000); dt = time.time() - t0; stats = lim_read_reset()
            check('M4 the mailbox answers rate for 30 s: the download waits and tries again by itself, then merges (3 records)', j and j['stage'] == 'done' and len(await mbx(A, 'recs', PROJ)) == 3 and dt >= 30 and stats['refused'] > 0, (j, round(dt), stats))
            # ---------- 5. a file no longer there: plain words, nothing lost, the next try works
            await close_sheets(B); await mbx(B, 'seed', PROJ, 1, {'from': 10}); await B.click('#projectBtn'); await W(B, 300); await send_sheet(B); await send_go(B, 60000); await W(B, 300)
            lim('fail=gone&n=1&action=get'); await projects(A); j, stg = await dl(A, ms=60000); line = (j or {}).get('line', '')
            check('M5 a download that meets "gone": Not downloaded, in plain words; it stays in the inbox', line.startswith('Not downloaded: that file is no longer in the mailbox') and len(await inbox(A)) == 1, (j, await inbox(A)))
            await projects(A); j, stg = await dl(A, ms=60000)
            check('M5b the next try downloads and merges it (4 records)', j and j['stage'] == 'done' and len(await mbx(A, 'recs', PROJ)) == 4, j)
            # ---------- 6. 10 phones download at once; the stand-in refuses above 30 calls at once
            await close_sheets(B); await mbx(B, 'seed', PROJ, 6, {'from': 20, 'px': 1400, 'noise': True}); await B.click('#projectBtn'); await W(B, 300); await send_sheet(B); st = await send_go(B, 120000); await W(B, 300)
            outB = await mbx(B, 'out'); tid = outB[0]['tid']; size = outB[0].get('size', 0)
            check('M6a Pedro sends a big update (several 2 MB pieces)', 'Sent to Juan' in st['line'] and size > 6 * 1048576, (st['line'], size))
            state = await ca.storage_state()
            br = await p.chromium.launch(executable_path=common.CHROME)
            phones = []
            for k in range(10):
                c = await br.new_context(storage_state=state, viewport={'width': 412, 'height': 900}, service_workers='block')
                await c.route('https://script.google.com/**', google_async)
                for u in ('https://tile.openstreetmap.org/**', 'https://*.tile.openstreetmap.org/**', 'https://basemaps.cartocdn.com/**', '**/World_Street_Map/**', 'https://server.arcgisonline.com/**', 'https://overpass-api.de/**', 'https://build.protomaps.com/**'): await c.route(u, lambda r: r.fulfill(status=404, body=''))
                for js in (common.NO_DRAFT_JS, common.NO_SAMPLE_JS): await c.add_init_script(js)
                await c.add_init_script("window.GESAA_CHANNEL='beta'")
                pg = await c.new_page(); await pg.goto(BASE + '/index.html'); phones.append((c, pg))
            await asyncio.sleep(4)
            lim('reset=1'); lim('max=30&delay=400')
            res = await asyncio.gather(*[pg.evaluate("(t) => __polecam.team.mbx.download(t)", tid) for c, pg in phones])
            stats = lim_read_reset()
            open(OUT + '/ten_phones.json', 'w').write(json.dumps({'res': res, 'stats': stats}, indent=1))
            check('M6 10 phones download the same update at once from a stand-in that refuses above 30 calls at once: all 10 complete, the right size, none lost',
                  len(res) == 10 and all(r.get('ok') and r.get('size') == size for r in res) and stats['refused'] > 0, ([{k: r.get(k) for k in ('ok', 'size', 'par', 'why')} for r in res], stats))
            check('M6b the phones that met a refusal went to fewer calls at once', any(r.get('par', 4) < 4 for r in res), [r.get('par') for r in res])
            for c, pg in phones: await c.close()
            await br.close()
            check('Z1 no page errors', not (ea + eb), ea + eb)
            for c in (ca, cb): await c.close()
    finally:
        srv.terminate()
    bad = [n for n, ok in checks if not ok]
    print(f'{len(checks) - len(bad)} passed, {len(bad)} failed' + (f': {bad}' if bad else ''))
asyncio.run(main())
