#!/usr/bin/env node
/*
 * sheet_stub_test_v2436.js — offline test of PoleCam-online-sheet_v2.43.6.gs (no network, synthetic data only).
 * v2.43.6 (G-eSAA templates: the company CEF template): v2.43.5 plus Settings → "CEF template" (a Google Drive link) and cefseed=1, the
 * company CEF template for the phones of the list, as v2.32's plan template (dxfseed=1).
 *   - setup (on a v2.43.5 sheet) adds the setting "CEF template", blank, once; nothing else.
 *   - Every read answers as v2.43.5 did (the time and the script's version left out), and names the CEF template when there is one (cefSeed:
 *     its Drive id, from Settings or from the link the admin phone sent with the company list; the setting wins).
 *   - cefseed=1: refused without the Read key or a company key; none set: no cef template; the file from Google Drive (a stand-in here:
 *     made-up DXFs) when it is a DXF with a sheet named CEF; else why not (a plan template, a web page from Drive, Drive's HTTP error).
 *   - setList: cefSeed stored with the list (a link or a Drive id; blank: removed; absent: kept).
 *
 *   node sheet_stub_test_v2436.js        (GS_FILE: test another copy)
 *
 * Uses the stand-ins of ../e2e/sheet_env.js (world.urlFetch: Google Drive). Prints PASS / FAIL per check; exits 1 when any check fails.
 */
'use strict';
const path = require('path'), fs = require('fs');
process.env.GS_FILE = process.env.GS_FILE || path.join(__dirname, 'PoleCam-online-sheet_v2.43.6.gs');
const env = require('../e2e/sheet_env.js');
const { world } = env;
const BASE_GS = path.join(__dirname, 'PoleCam-online-sheet_v2.43.5.gs'); // (the script the owner runs before this one)
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const CEF = fs.readFileSync(path.join(ROOT, 'vendor', 'cef', 'cef-template-generic.dxf'), 'utf8');          // the app's own generic CEF template
const PLAN = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'plan-seed-made-up-square.dxf'), 'utf8'); // a made-up plan template (no CEF sheet)

let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (info !== undefined ? '\n      got: ' + (typeof info === 'string' ? info : JSON.stringify(info).slice(0, 300)) : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function section(t) { console.log('\n== ' + t); }
process.on('uncaughtException', (e) => { console.log('FAIL  stopped by an exception: ' + ((e && e.stack) || e)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed (stopped early)'); process.exit(1); });

/* ------------------------------------------------------------------ data (synthetic) */
const CO_A = 'DEMO CONTRACTOR', KEY_A = 'DMCA-7KQ4-MX2P', JUAN = 'juan@demo-contractor.example';
const ID1 = '1DemoCefTemplate0000000000000001', ID2 = '1DemoCefTemplate0000000000000002', PLAN_ID = '1DemoPlanTemplate000000000000001';
const tab = (n) => world.ss.getSheetByName(n);
function setting(k, v) { const st = tab('Settings'), L = st.getRange(1, 1, st.getLastRow(), 2).getValues(), i = L.findIndex((r) => r[0] === k); if (i >= 0) st.getRange(i + 1, 2).setValue(v); else st.appendRow([k, v, '']); }
const settingRows = (k) => tab('Settings').rowsAsText().filter((r) => r[0] === k);
const strip = (o) => { const x = JSON.parse(JSON.stringify(o)); delete x.updated; delete x.sv; return x; };
/** Google Drive, as the script fetches it: a file by its id (text, or an HTTP code, or a web page). */
let DRIVE = {}; const fetched = [];
world.urlFetch = (u) => {
  fetched.push(u); const id = (/[?&]id=([A-Za-z0-9_-]+)/.exec(u) || [])[1], f = DRIVE[id];
  const resp = (code, text, head) => ({ getResponseCode: () => code, getContentText: () => text, getHeaders: () => head || {} });
  if (!f) return resp(404, 'Not Found');
  if (f.code) return resp(f.code, '');
  return resp(200, f.text, f.name ? { 'Content-Disposition': `attachment; filename="${f.name}"` } : {});
};

/* ================================================================== run */
const base = env.load(BASE_GS);
const gs = env.load(env.NEW_GS);
const post = (g, b) => env.post(g, b), get = (g, p) => env.get(g, p);

section('setup (a v2.43.5 sheet, then v2.43.6)');
base.setup();
check('v2.43.5 setup: no CEF template setting', !settingRows('CEF template').length && !!tab('User permissions'));
tab('Companies').getRange(2, 1, 1, 1).setValues([[CO_A]]);
tab('CompanyKeys').getRange(2, 1, 1, 4).setValues([[CO_A, KEY_A, 'No', 'Yes']]);
tab('Tasks').getRange(2, 1, 1, 9).setValues([['T-A0000001', 'Demo Survey Poblacion', 'Survey', 'SITE-001', CO_A, 'Field Engineer 1', CO_A, 'Active', '']]);
const READ = gs.settings_()['Read key'], ADMIN = gs.settings_()['Admin key'];
const sheetsBefore = world.ss.getNumSheets(), settingsBefore = tab('Settings').getLastRow();
gs.setup();
check('v2.43.6 setup adds Settings → CEF template, blank', eq(settingRows('CEF template').map((r) => r[1]), ['']) && tab('Settings').getLastRow() === settingsBefore + 1);
check('no tab added', world.ss.getNumSheets() === sheetsBefore);
gs.setup();
check('setup again: no second row', settingRows('CEF template').length === 1);
check('the keys are not changed by setup', gs.settings_()['Read key'] === READ && gs.settings_()['Admin key'] === ADMIN);

section('every read as v2.43.5, and the CEF template named when there is one');
const READS = [{ key: READ, company: CO_A, email: JUAN, v: '2.45.17' }, { ckey: KEY_A, company: '', email: JUAN, v: '2.45.18', pv: '1' }, { key: READ, company: '', akey: ADMIN, email: 'admin@demo-telco.example', v: '2.45.18' },
  { key: READ, company: CO_A }, { key: 'wrong' }, { probe: '1', v: '2.45.17' }];
READS.forEach((p, i) => { const a = strip(get(base, p)), b = strip(get(gs, p)); check(`read ${i + 1} (${Object.keys(p).join(', ')}): the same as v2.43.5, no CEF template named`, eq(a, b) && b.cefSeed === undefined, { a, b }); });
check('the script says its version 2.43.6', get(gs, { ckey: KEY_A, email: JUAN, v: '2.45.18' }).sv === '2.43.6');
setting('CEF template', `https://drive.google.com/file/d/${ID1}/view?usp=sharing`);
READS.forEach((p, i) => { const a = strip(get(base, p)), b = strip(get(gs, p)), ok = b.ok !== false && !p.probe; check(`read ${i + 1}: with Settings → CEF template, ${ok ? 'cefSeed its Drive id, the rest as v2.43.5' : 'as before (refused, or the probe)'}`, ok ? b.cefSeed === ID1 && eq({ ...b, cefSeed: undefined }, { ...a, cefSeed: undefined }) : eq(a, b), { a, b }); });

section('cefseed=1: the company CEF template, for the phones of the list');
DRIVE = { [ID1]: { text: CEF, name: 'DEMO TELCO CEF template.dxf' }, [ID2]: { text: PLAN }, [PLAN_ID]: { text: PLAN } };
let r = get(gs, { cefseed: '1', key: 'wrong' });
check('no Read key nor company key: refused (key), Drive not asked', eq(r, { ok: false, error: 'key' }) && !fetched.length, r);
r = get(gs, { cefseed: '1', ckey: KEY_A, company: '', v: '2.45.18' });
check('a company key: the file, its id and name', r.ok === true && r.id === ID1 && r.name === 'DEMO TELCO CEF template.dxf' && r.text === CEF && r.size === CEF.length, { ...r, text: (r.text || '').length });
check('downloaded from Drive by its id only (the request names no file)', fetched.length >= 1 && fetched.every((u) => u.includes(ID1)));
r = get(gs, { cefseed: '1', key: READ, id: ID2 });
check('an id in the request is not used: still the one of Settings', r.ok === true && r.id === ID1);
setting('CEF template', ID2);
r = get(gs, { cefseed: '1', key: READ });
check('a plan template linked instead (no sheet CEF): said, nothing sent', r.ok === false && /not a CEF template/.test(r.error) && !r.text, r);
DRIVE[ID2] = { text: '<!DOCTYPE html><html><body>Sign in</body></html>' };
r = get(gs, { cefseed: '1', key: READ });
check('Drive sends a web page (not shared with anyone with the link): said', r.ok === false && /Anyone with the link/.test(r.error), r);
DRIVE[ID2] = { code: 403 };
r = get(gs, { cefseed: '1', key: READ });
check('Drive answers 403: said', r.ok === false && /HTTP 403/.test(r.error), r);
DRIVE[ID2] = { text: CEF };
r = get(gs, { cefseed: '1', key: READ });
check('no file name from Drive: CEF template.dxf', r.ok === true && r.name === 'CEF template.dxf');
setting('CEF template', '');
r = get(gs, { cefseed: '1', key: READ });
check('none set: no cef template', eq(r, { ok: false, error: 'no cef template' }), r);
check('the plan template\'s dxfseed=1 as before (none set: no plan template)', eq(get(gs, { dxfseed: '1', key: READ }), get(base, { dxfseed: '1', key: READ })));

section('the company list sent by the admin phone carries the CEF template');
const LIST = 'PCT1:demoListPayloadAAAA';
r = post(gs, { action: 'setList', key: ADMIN, list: LIST, id: 'demo-list-1', rev: 1, dxfSeed: '', cefSeed: `https://drive.google.com/file/d/${ID1}/view` });
check('setList with cefSeed: saved', r.ok === true && world.props['cefseed.id'] === ID1, { r, p: world.props['cefseed.id'] });
r = get(gs, { ckey: KEY_A, email: JUAN, v: '2.45.18' });
check('the reads name it (cefSeed), Settings blank', r.cefSeed === ID1);
check('cefseed=1 sends it', get(gs, { cefseed: '1', ckey: KEY_A }).id === ID1);
setting('CEF template', ID2);
check('Settings → CEF template wins over the list\'s', get(gs, { ckey: KEY_A, email: JUAN, v: '2.45.18' }).cefSeed === ID2 && get(gs, { cefseed: '1', ckey: KEY_A }).id === ID2);
setting('CEF template', '');
r = post(gs, { action: 'setList', key: ADMIN, list: LIST, id: 'demo-list-1', rev: 2, dxfSeed: '' });
check('a list sent without cefSeed (an older admin phone): the CEF template kept', r.ok === true && world.props['cefseed.id'] === ID1);
r = post(gs, { action: 'setList', key: ADMIN, list: LIST, id: 'demo-list-1', rev: 3, dxfSeed: '', cefSeed: '' });
check('cefSeed blank: removed', r.ok === true && !world.props['cefseed.id'] && get(gs, { ckey: KEY_A, email: JUAN, v: '2.45.18' }).cefSeed === undefined);
r = post(gs, { action: 'setList', key: ADMIN, list: LIST, id: 'demo-list-1', rev: 4, dxfSeed: '', cefSeed: 'not a link' });
check('not a Drive link: nothing stored', r.ok === true && !world.props['cefseed.id']);
check('all locks released', world.lockHeld === 0);

section('the v2.43.5 tests, run on v2.43.6');
{
  const { spawnSync } = require('child_process'), run = (f, gsf) => spawnSync(process.execPath, [path.join(__dirname, f)], { env: { ...process.env, GS_FILE: gsf }, encoding: 'utf8', timeout: 300000 }).stdout || '';
  const res = (out) => ({ fails: out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(6).trim()), m: /(\d+) passed, (\d+) failed/.exec(out) });
  const A = res(run('sheet_stub_test_v2435.js', BASE_GS)), B = res(run('sheet_stub_test_v2435.js', env.NEW_GS));
  const only = (L) => L.filter((x) => !/Settings → User permissions added|its version 2\.43\.5|v2\.43\.2 tests/.test(x)); // (setup adds the CEF template's row too; the script says 2.43.6)
  check('sheet_stub_test_v2435.js: on v2.43.6 no check fails that passes on v2.43.5 (setup\'s row count and the version aside)', !!A.m && !!B.m && +B.m[1] >= 60 && eq(only(B.fails), only(A.fails)), { A: A.m && A.m[0], B: B.m && B.m[0], fails: B.fails.slice(0, 6) });
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
