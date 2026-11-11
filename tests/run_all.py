#!/usr/bin/env python3
"""G-eSAA tests: one command runs every test file and prints n of n for each.

    python3 tests/run_all.py                    everything (t229b 20 times, t2357a alone at the end)
    python3 tests/run_all.py --only t229b       the files whose name has this part (several: --only a b)
    python3 tests/run_all.py --list             the files, and what each needs that is not in the repository
    python3 tests/run_all.py --private DIR      a folder of private inputs (see tests/README.md); also GESAA_PRIVATE

A file that needs a private input (the company plan template, a road pack made from your files, large test files, an older
build) is skipped with a line that says what it needs. Results: tests/results/ (one log per file, summary.md).
Setup once: pip install -r tests/requirements.txt; python -m playwright install chromium; npm install --prefix tests."""
import argparse, os, re, socket, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HERE); WS = os.path.join(HERE, 'regression')
RES = os.path.join(HERE, 'results'); PORT = 8765

WHY = {
    'template': 'the company plan template (seed.dxf), which never goes into the repository',
    'roads': 'a road pack made from your own files', 'roads_psa': 'a road pack made from your own files', 'roads_v235': 'a road pack made from your own files',
    'fx': 'pole positions taken from your own survey', 'arm': 'drawings made from the company template',
    'large': 'large test files (about 45 to 80 MB each), kept out of the repository',
    'old': 'an older G-eSAA build, for a before / after check',
}
# The test files, in this order: quick ones first; the 4-phone team tests; the rest as the release notes list them; t2357a last,
# alone (it serves the app on port 8765 itself). What each needs from the private folder is read from its code (PRIV + '/…').
TESTS = ['image-preparation.test.cjs', 'photo-save.spec.cjs', 'dxf-cleanup.test.cjs'] + ['regression/' + f for f in (
    'v243/sheet/sheet_stub_test.js v243/sheet/sheet_stub_test_v2431.js v243/sheet/sheet_stub_test_v2432.js v243/sheet/sheet_qa08_qa18_test.js '
    'v243/mailbox/stub_test.js v243/t24333a.py v243/t24333c.py v243/t24333d.py v243/t24333e.py v243/t24333b.py v243/t24332e.py v243/t2433d.py '
    'v243/t2433c.py v243/smoke21.py v243/t243a.py v243/t24228a_v243.py v24228/t24227a_v28.py v24228/t24226a_v28.py v24226/t24225a_v26.py '
    'v24226/t24224a_v26.py v24224/t24224b.py v24228/t24223a_v28.py v24226/t24223b_v26.py v24224/t24222a_v24.py v24228/t24221b_v28.py '
    'v24225/t24220a_v25.py v24225/t24220b_v25.py v24227/t24219a_v27.py v24219/t24219b.py v24228/t24218a_v28.py v24218/tests/t24217a_v18.py '
    'v24226/t24216a_v26.py v24228/t24214a_v28.py v24228/t24212a_v28.py v24212/t24212b.py v24223/t24210a_v23.py v2428/t2429a.py v2428/t2428a.py '
    'v2427/t2427a.py v2427/t2427c.py v24228/t2427d_v28.py v2427/t2427e.py v2425/t2425a.py v2425/t2425b.py v2424/t2424a_v24.py v2423/t2423a.py '
    'v226/t226b.py v24218/tests/t2421a_v24.py v24218/tests/t242a_v24.py v24228/t241a_v28.py v24228/t241b_v28.py v24218/tests/t239a_v18.py '
    'v237/t237e.py v24218/tests/t237a_v18.py v2356/t2356a.py v2356/t2356b_v24.py v2355/t2355h.py v2355/t2355i.py v2351/t2354f.py v2351/t2353e.py '
    'v243/t2351d_v2432.py v235/t235c.py v24226/t229a_v26.py v229/t229b.py v235/t235a_v24.py v235/t235b_v24.py v234/t234a_v24.py v225/tutall.py '
    'v225/tour.py v2357/t2357a.py').split()]
SELF_SKIPS = {'t24333e': {'template/seed.dxf', 'old/v2.42.28'}}  # parts it skips by itself, with a SKIP line (see its log)
DXF_USE = re.compile(r"doDxf|SEED\b|dxfseed|plan_export|dxfTpl|GeDxfTpl")

def needs(f):
    """What a test file needs from the private folder: PRIV + '/…' in its code and in the test heads it reads (S + '/….py'); a
    head that loads the template only for its helpers does not count when the file itself exports no plan."""
    if not f.startswith('regression/') or not f.endswith('.py'): return []
    seen, out = set(), set()
    def walk(rel):
        if rel in seen or not os.path.isfile(os.path.join(WS, rel)): return
        seen.add(rel); t = open(os.path.join(WS, rel), encoding='utf-8').read()
        for m in re.finditer(r"PRIV \+ '/([^']+)'", t): out.add(m.group(1))
        for m in re.finditer(r"S \+ '/([^']+\.py)'", t): walk(m.group(1))
    rel = f[len('regression/'):]; walk(rel)
    own = open(os.path.join(WS, rel), encoding='utf-8').read()
    if 'template/seed.dxf' in out and 'template/seed.dxf' not in own and not DXF_USE.search(own.split('\nasync def main():', 1)[-1]): out.discard('template/seed.dxf')
    out = {x for x in out if not (x.startswith('fx/') or x.startswith('large/') or x.startswith('roads')) or x.count('/') == 1}
    return sorted(out - SELF_SKIPS.get(name_of(f), set()))
ALONE = {'t2357a'}; REPEAT_FULL = {'t229b': 20}; TIMEOUT = 1800

def name_of(f): return os.path.basename(f).split('.')[0] if not f.endswith(('.cjs', '.js')) else os.path.basename(f)

def counts(text, kind):
    """(passed, total, failed check names) from a test's output; None: no result line."""
    bad = [l[5:].split('  ←')[0].split(' | ')[0].strip()[:120] for l in text.split('\n') if l.startswith('FAIL ')]
    if kind == 'node-test':
        p = re.findall(r'^# pass (\d+)', text, re.M); f = re.findall(r'^# fail (\d+)', text, re.M)
        if not p: return None
        bad = [l.split(' - ', 1)[-1][:120] for l in text.split('\n') if l.startswith('not ok ')]
        return int(p[-1]), int(p[-1]) + int(f[-1] if f else 0), bad
    m = re.findall(r'(\d+) passed, (\d+) failed', text)
    if m: ok, no = map(int, m[-1]); return ok, ok + no, bad
    m = re.findall(r'(\d+)/(\d+) (?:checks )?passed', text)
    if m: ok, n = map(int, m[-1]); return ok, n, bad
    m = re.findall(r'FAILED (\d+) of (\d+)', text)
    if m: no, n = map(int, m[-1]); return n - no, n, bad
    if 'PASS every' in text: k = len(re.findall(r"^\('", text, re.M)) or 1; return k, k, bad
    if 'all passed' in text:
        k = len(re.findall(r'^PASS ', text, re.M)); return k, k + len(bad), bad
    ps = len(re.findall(r'^PASS ', text, re.M))
    if ps or bad: return ps, ps + len(bad), bad
    return None

def port_free(port):
    with socket.socket() as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)  # (as the app's server: a closed connection waiting to time out does not count)
        try: s.bind(('127.0.0.1', port)); return True
        except OSError: return False

def chromium():
    if os.environ.get('GESAA_CHROME'): return os.environ['GESAA_CHROME']
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p: path = p.chromium.executable_path
        return path if os.path.exists(path) else ''
    except Exception: return ''

def node_path():
    if os.path.isdir(os.path.join(HERE, 'node_modules', 'playwright')): return os.path.join(HERE, 'node_modules')
    try:
        g = subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True, timeout=30).stdout.strip()
        if g and os.path.isdir(os.path.join(g, 'playwright')): return g
    except Exception: pass
    return ''

def setup_check(priv):
    miss = []
    for mod in ('playwright', 'openpyxl', 'ezdxf', 'PIL', 'numpy'):
        try: __import__(mod)
        except Exception: miss.append(mod)
    if miss: sys.exit(f'Missing Python packages: {", ".join(miss)}. Run: pip install -r tests/requirements.txt')
    ch = chromium()
    if not ch: sys.exit('No Chromium for Playwright. Run: python -m playwright install chromium')
    try: subprocess.run(['node', '--version'], capture_output=True, check=True)
    except Exception: sys.exit('Node.js is needed (18 or later): https://nodejs.org')
    vid = os.path.join(WS, 'v17', 'vid', 'h_cc.mjpeg')
    if not os.path.exists(vid):  # the made-up camera video (a pole with CC-0123), made here, not stored
        os.makedirs(os.path.dirname(vid), exist_ok=True)
        r = subprocess.run([sys.executable, '-c', "import sys; sys.path.insert(0, sys.argv[1]); import gen; gen.write(sys.argv[2], gen.build('h_cc'))", os.path.join(WS, 'v17'), vid], capture_output=True, text=True)
        if r.returncode: sys.exit('Could not make the test camera video: ' + r.stderr[-500:])
    return ch

def main():
    ap = argparse.ArgumentParser(description='G-eSAA: run every test file and print n of n for each.')
    ap.add_argument('--only', nargs='*', default=None); ap.add_argument('--list', action='store_true')
    ap.add_argument('--private', default=os.environ.get('GESAA_PRIVATE') or (os.path.join(HERE, 'private') if os.path.isdir(os.path.join(HERE, 'private')) else ''))
    ap.add_argument('--repeat', nargs='*', default=None, help='name=n, e.g. t229b=20 (a full run: t229b=20)')
    a = ap.parse_args()
    priv = os.path.abspath(a.private) if a.private else ''
    sel = [(f, needs(f)) for f in TESTS if a.only is None or any(o in f for o in a.only)]
    rep = dict(REPEAT_FULL) if a.only is None else {}
    for r in a.repeat or []: k, v = r.split('='); rep[k] = int(v)
    if a.list:
        for f in TESTS: n = needs(f); print(f'{f:58s} {"needs: " + ", ".join(n) if n else ""}')
        return 0
    ch = setup_check(priv); np_ = node_path(); os.makedirs(RES, exist_ok=True)
    # the full Chromium for every test (Playwright's default for a headless launch is a lighter "headless shell", which behaves
    # differently in places: the tests were written on the full one)
    env = dict(os.environ, GESAA_WS=WS, GESAA_APP=REPO, GESAA_PRIVATE=priv or '/nonexistent-private', GESAA_CHROME=ch, CHROME_PATH=os.environ.get('CHROME_PATH') or ch, PYTHONUNBUFFERED='1')
    if np_: env['NODE_PATH'] = np_ + (os.pathsep + env['NODE_PATH'] if env.get('NODE_PATH') else '')
    print(f'G-eSAA tests · app: {REPO} · private inputs: {priv or "none (the files that need them are skipped)"}', flush=True)
    srv = None
    def start():
        nonlocal srv
        if srv: return
        if not port_free(PORT): sys.exit(f'Port {PORT} is in use: close what uses it (the tests serve the app there).')
        srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', REPO], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.2)
    def stop():
        nonlocal srv
        if srv: srv.terminate(); srv.wait(); srv = None; time.sleep(0.5)
    rows = []; t_all = time.time()
    order = [x for x in sel if name_of(x[0]) not in ALONE] + [x for x in sel if name_of(x[0]) in ALONE]
    try:
        for f, need in order:
            nm = name_of(f); path = os.path.join(HERE, f)
            missing = [n for n in need if not (priv and os.path.exists(os.path.join(priv, n)))]
            if missing:
                why = sorted({WHY[m.split('/')[0]] for m in missing})
                rows.append((nm, 'SKIP', 0, 0, '; '.join(why), 0)); print(f'SKIP       {nm}: needs {"; ".join(why)}', flush=True); continue
            kind = 'node-test' if f.endswith(('.test.cjs', '.spec.cjs')) and f != 'dxf-cleanup.test.cjs' else 'node' if f.endswith(('.js', '.cjs')) else 'py'
            if kind == 'py':
                if nm in ALONE: stop()
                else: start()
            runs = rep.get(nm, 1); res = []; t0 = time.time()
            for k in range(runs):
                cmd = ['node', '--test', path] if kind == 'node-test' else ['node', path] if kind == 'node' else [sys.executable, path]
                log = os.path.join(RES, f'{nm}{f"_{k + 1}" if runs > 1 else ""}.log')
                try:
                    r = subprocess.run(cmd, cwd=REPO, env=env, capture_output=True, text=True, timeout=TIMEOUT, errors='replace'); out = r.stdout + r.stderr; rc = r.returncode
                except subprocess.TimeoutExpired as e:
                    out = (e.stdout or '') + (e.stderr or '') if isinstance(e.stdout, str) else ''; out += f'\nTIMEOUT after {TIMEOUT} s'; rc = -9
                open(log, 'w', encoding='utf-8').write(out)
                c = counts(out, kind); crashed = rc != 0 or 'Traceback (most recent call last)' in out
                res.append((c, crashed, out))
            ok_runs = sum(1 for c, cr, _ in res if c and c[0] == c[1] and not cr)
            c, cr, out = res[-1] if ok_runs == runs else next((x for x in res if not (x[0] and x[0][0] == x[0][1] and not x[1])))
            dt = time.time() - t0; part = len(re.findall(r'^SKIP ', out, re.M))
            if ok_runs == runs:
                st = 'PASS'; line = f'{c[0]} of {c[1]}' + (f' ({runs} of {runs} runs)' if runs > 1 else '') + (f' · {part} part{"s" if part > 1 else ""} skipped (see its log)' if part else '')
            else:
                st = 'FAIL'; line = (f'{c[0]} of {c[1]}' if c else 'no result') + (f' ({ok_runs} of {runs} runs passed)' if runs > 1 else '') + (' · stopped with an error' if cr else '') + (f' · failed: {"; ".join(c[2][:4])}' if c and c[2] else '')
                tail = '\n'.join(out.strip().split('\n')[-6:])
            rows.append((nm, st, c[0] if c else 0, c[1] if c else 0, line, dt))
            print(f'{st:10s} {nm}: {line}  [{dt:.0f} s]', flush=True)
            if st == 'FAIL': print('           ' + tail.replace('\n', '\n           ')[:1500], flush=True)
    finally:
        stop()
    p = sum(1 for r in rows if r[1] == 'PASS'); fl = sum(1 for r in rows if r[1] == 'FAIL'); sk = sum(1 for r in rows if r[1] == 'SKIP')
    ok = sum(r[2] for r in rows if r[1] != 'SKIP'); n = sum(r[3] for r in rows if r[1] != 'SKIP')
    tot = f'{p} files passed, {fl} failed, {sk} skipped · {ok} of {n} checks · {(time.time() - t_all) / 60:.0f} min'
    print('\n' + tot, flush=True)
    md = ['| Test file | Result |', '|---|---|'] + [f'| {r[0]} | {"✅ " + r[4] if r[1] == "PASS" else "❌ " + r[4] if r[1] == "FAIL" else "⏭ skipped: needs " + r[4]} |' for r in rows] + ['', f'**{tot}**']
    open(os.path.join(RES, 'summary.md'), 'w', encoding='utf-8').write('# G-eSAA tests\n\n' + '\n'.join(md) + '\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'): open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8').write('# G-eSAA tests\n\n' + '\n'.join(md) + '\n')
    return 1 if fl else 0

if __name__ == '__main__':
    sys.exit(main())
