#!/usr/bin/env node
/*
 * sheet_stub_test_v2437.js — offline test of PoleCam-online-sheet_v2.43.7.gs (no network, synthetic data only).
 * v2.43.7 (stage 11, templates: the plan templates published from the admin phone): v2.43.6 plus publishTemplate (the Admin key), the
 * Drive folder "G-eSAA templates", the Settings rows following the newest template, and dxfseed=1 / cefseed=1 read from the script's Drive.
 *   - setup (on a v2.43.6 sheet): nothing added to the tabs or Settings; the folder "G-eSAA templates" made once (Google Drive allowed).
 *   - Every read answers as v2.43.6 did (the time and the script's version left out) while nothing is published.
 *   - publishTemplate: refused without the Admin key (the Read key, a company key, a wrong key), a wrong kind, an empty file, a file that is
 *     not the kind (a CEF template as the plan template, a plan template as the CEF), a file over 12 MB; done: the file in the folder (not
 *     shared), Settings → Plan template / CEF template its link, the answer (id, name, size, when, by whom, link); published again: the one
 *     before kept, renamed "… (replaced <date>)"; a 10 MB template.
 *   - dxfseed=1 / cefseed=1: the published file read from the script's Drive (no public link, no UrlFetch), with who published it and when;
 *     an older app (2.45.18: v=2.45.18, no pv) gets the published plan template through the same request, and the list's answer names it.
 *   - The newest wins: a link typed in Settings wins; a new link sent with the list (setList) writes the Settings row; the same link again
 *     does not; a link removed from the list clears the row only when the row held it; a publish after that wins again.
 *   - Drive not allowed yet (setup not run again): the reads as v2.43.6 (the public link through UrlFetch); publish says why.
 *   - The v2.43.6 tests, run on v2.43.7: no check fails that passes on v2.43.6 (the version aside).
 *
 *   node sheet_stub_test_v2437.js        (GS_FILE: test another copy)
 *
 * Uses the stand-ins of ../e2e/sheet_env.js (world.drive: the script owner's Google Drive; world.urlFetch: public links). Prints PASS / FAIL
 * per check; exits 1 when any check fails.
 */
'use strict';
const path = require('path'), fs = require('fs');
process.env.GS_FILE = process.env.GS_FILE || path.join(__dirname, 'PoleCam-online-sheet_v2.43.7.gs');
const env = require('../e2e/sheet_env.js');
const { world } = env;
const BASE_GS = path.join(__dirname, 'PoleCam-online-sheet_v2.43.6.gs'); // (the script the owner runs before this one)
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const CEF = fs.readFileSync(path.join(ROOT, 'vendor', 'cef', 'cef-template-generic.dxf'), 'utf8');          // the app's own generic CEF template
const PLAN = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'plan-seed-made-up-square.dxf'), 'utf8'); // a made-up plan template
const PLAN2 = PLAN.replace(/\n999\n[^\n]*\n/, '\n999\nDEMO PLAN TEMPLATE v2\n').replace('SECTION', 'SECTION'); // (a second made-up one: its text differs)

let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (info !== undefined ? '\n      got: ' + (typeof info === 'string' ? info : JSON.stringify(info).slice(0, 400)) : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function section(t) { console.log('\n== ' + t); }
process.on('uncaughtException', (e) => { console.log('FAIL  stopped by an exception: ' + ((e && e.stack) || e)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed (stopped early)'); process.exit(1); });

/* ------------------------------------------------------------------ data (synthetic) */
const CO_A = 'DEMO CONTRACTOR', KEY_A = 'DMCA-7KQ4-MX2P', JUAN = 'juan@demo-contractor.example', ANA = 'ana@demo-telco.example';
const PUB_ID = '1DemoPublicPlanTemplate00000000001', PUB_CEF = '1DemoPublicCefTemplate000000000001';
const tab = (n) => world.ss.getSheetByName(n);
function setting(k, v) { const st = tab('Settings'), L = st.getRange(1, 1, st.getLastRow(), 2).getValues(), i = L.findIndex((r) => r[0] === k); if (i >= 0) st.getRange(i + 1, 2).setValue(v); else st.appendRow([k, v, '']); }
const settingOf = (k) => { const r = tab('Settings').rowsAsText().find((x) => x[0] === k); return r ? r[1] : undefined; };
const settingRows = () => tab('Settings').rowsAsText().map((r) => r[0]);
const strip = (o) => { const x = JSON.parse(JSON.stringify(o)); delete x.updated; delete x.sv; return x; };
const link = (id) => `https://drive.google.com/file/d/${id}/view`;
/** Google Drive's public links, as the script fetches them (v2.43.6's way): a file by its id. */
let PUBLIC = {}; const fetched = [];
world.urlFetch = (u) => {
  fetched.push(u); const id = (/[?&]id=([A-Za-z0-9_-]+)/.exec(u) || [])[1], f = PUBLIC[id];
  const resp = (code, text, head) => ({ getResponseCode: () => code, getContentText: () => text, getHeaders: () => head || {} });
  if (!f) return resp(404, 'Not Found');
  return resp(200, f.text, f.name ? { 'Content-Disposition': `attachment; filename="${f.name}"` } : {});
};
const folderFiles = () => Object.entries(world.drive.files).filter(([, f]) => world.drive.folders[f.folder] && world.drive.folders[f.folder].name === 'G-eSAA templates').map(([id, f]) => ({ id, name: f.name, size: f.text.length }));

/* ================================================================== run */
const base = env.load(BASE_GS);
const gs = env.load(env.NEW_GS);
const post = (g, b) => env.post(g, b), get = (g, p) => env.get(g, p);

section('setup (a v2.43.6 sheet, then v2.43.7)');
base.setup();
tab('Companies').getRange(2, 1, 1, 1).setValues([[CO_A]]);
tab('CompanyKeys').getRange(2, 1, 1, 4).setValues([[CO_A, KEY_A, 'No', 'Yes']]);
tab('Tasks').getRange(2, 1, 1, 9).setValues([['T-A0000001', 'Demo Survey Poblacion', 'Survey', 'SITE-001', CO_A, 'Field Engineer 1', CO_A, 'Active', '']]);
const READ = gs.settings_()['Read key'], ADMIN = gs.settings_()['Admin key'];
const sheetsBefore = world.ss.getNumSheets(), rowsBefore = settingRows();
check('v2.43.6 setup: no Drive folder', !Object.keys(world.drive.folders).length);
world.drive.denied = true; gs.setup(); world.drive.denied = false;
check('setup while Drive is not allowed: runs, says so in the log, no folder', !Object.keys(world.drive.folders).length && world.logs.some((l) => /Plan templates \(Google Drive\)/.test(l)));
gs.setup();
check('v2.43.7 setup: the folder "G-eSAA templates" made, its id kept', Object.values(world.drive.folders).map((f) => f.name).join() === 'G-eSAA templates' && !!world.props['tpl.folder'] && world.logs.some((l) => /is ready in your Drive/.test(l)));
check('no tab nor Settings row added', world.ss.getNumSheets() === sheetsBefore && eq(settingRows(), rowsBefore));
gs.setup();
check('setup again: still one folder', Object.keys(world.drive.folders).length === 1);
check('the keys are not changed by setup', gs.settings_()['Read key'] === READ && gs.settings_()['Admin key'] === ADMIN);

section('every read as v2.43.6 while nothing is published');
const READS = [{ key: READ, company: CO_A, email: JUAN, v: '2.45.17' }, { ckey: KEY_A, company: '', email: JUAN, v: '2.45.19', pv: '1' }, { key: READ, company: '', akey: ADMIN, email: ANA, v: '2.45.19' },
  { key: READ, company: CO_A }, { key: 'wrong' }, { probe: '1', v: '2.45.17' }, { dxfseed: '1', key: READ }, { cefseed: '1', ckey: KEY_A }];
READS.forEach((p, i) => { const a = strip(get(base, p)), b = strip(get(gs, p)); check(`read ${i + 1} (${Object.keys(p).join(', ')}): the same as v2.43.6`, eq(a, b), { a, b }); });
check('the script says its version 2.43.7', get(gs, { ckey: KEY_A, email: JUAN, v: '2.45.19' }).sv === '2.43.7');
// a public link (v2.43.6's way) still served as before
PUBLIC = { [PUB_ID]: { text: PLAN, name: 'DEMO public plan template.dxf' }, [PUB_CEF]: { text: CEF, name: 'DEMO public CEF.dxf' } };
setting('Plan template', link(PUB_ID)); setting('CEF template', link(PUB_CEF));
for (const p of [{ dxfseed: '1', key: READ }, { cefseed: '1', ckey: KEY_A }]) { const a = strip(get(base, p)), b = strip(get(gs, p)); check(`${Object.keys(p)[0]}=1 with a public link (not in the script's Drive): as v2.43.6, through UrlFetch`, eq(a, b) && b.ok === true && fetched.length > 0, { a: { ...a, text: (a.text || '').length }, b: { ...b, text: (b.text || '').length } }); }
setting('Plan template', ''); setting('CEF template', ''); fetched.length = 0;

section('publishTemplate: the admin phone only, the right kind of file');
const pub = (b) => post(gs, { action: 'publishTemplate', ...b });
let r = pub({ key: READ, kind: 'geo', name: 'x.dxf', text: PLAN });
check('the Read key: refused (key), nothing saved', eq(r, { ok: false, error: 'key' }) && !folderFiles().length, r);
r = pub({ ckey: KEY_A, kind: 'geo', name: 'x.dxf', text: PLAN });
check('a company key: refused (key)', eq(r, { ok: false, error: 'key' }), r);
r = pub({ key: 'wrong', kind: 'geo', name: 'x.dxf', text: PLAN });
check('a wrong key: refused (key)', eq(r, { ok: false, error: 'key' }), r);
r = pub({ key: ADMIN, kind: 'plan', name: 'x.dxf', text: PLAN });
check('a wrong kind: refused (kind)', eq(r, { ok: false, error: 'kind' }), r);
r = pub({ key: ADMIN, kind: 'geo', name: 'x.dxf', text: '' });
check('no file: refused', eq(r, { ok: false, error: 'no file' }), r);
r = pub({ key: ADMIN, kind: 'geo', name: 'x.dxf', text: CEF });
check('a CEF template as the plan template: refused, saying why', r.ok === false && /not the prepared plan template/.test(r.error) && /^this file/.test(r.error), r);
r = pub({ key: ADMIN, kind: 'cef', name: 'x.dxf', text: PLAN });
check('a plan template as the CEF template: refused, saying why', r.ok === false && /not a CEF template/.test(r.error), r);
r = pub({ key: ADMIN, kind: 'geo', name: 'x.dxf', text: PLAN + ' '.repeat(12 * 1024 * 1024) });
check('over 12 MB: refused (too large), nothing saved', r.ok === false && /too large/.test(r.error) && !folderFiles().length, r);
check('all locks released', world.lockHeld === 0);

section('published: the file in the folder, the Settings row, the phones get it from the script\'s Drive');
r = pub({ key: ADMIN, kind: 'geo', name: 'DEMO TELCO plan template.dxf', text: PLAN, by: 'Ana Reyes <ana@demo-telco.example>', client: 'DEMO CLIENT A' });
const G1 = r.id;
check('published: its id, name, size, when, by whom, link', r.ok === true && !!G1 && r.kind === 'geo' && r.name === 'DEMO TELCO plan template.dxf' && r.size === PLAN.length && /^\d{4}-\d\d-\d\dT/.test(r.at) && r.by === 'Ana Reyes <ana@demo-telco.example>' && r.link === link(G1) && r.replaced === '', r);
check('in the folder "G-eSAA templates" of the owner\'s Drive', eq(folderFiles(), [{ id: G1, name: 'DEMO TELCO plan template.dxf', size: PLAN.length }]), folderFiles());
check('Settings → Plan template: its link (the row the phones\' requests read)', settingOf('Plan template') === link(G1), settingOf('Plan template'));
check('the script properties: its id and details', world.props['tpl.geo.id'] === G1 && world.props['dxfseed.id'] === G1 && world.props['tpl.geo.client'] === 'DEMO CLIENT A' && world.props['tpl.geo.by'] === 'Ana Reyes <ana@demo-telco.example>');
fetched.length = 0;
r = get(gs, { dxfseed: '1', ckey: KEY_A, company: '', v: '2.45.19' });
check('dxfseed=1: the published file, from the script\'s Drive (no public link, no UrlFetch), who and when', r.ok === true && r.id === G1 && r.text === PLAN && r.name === 'DEMO TELCO plan template.dxf' && r.pub === true && r.by === 'Ana Reyes <ana@demo-telco.example>' && r.client === 'DEMO CLIENT A' && /^\d{4}-/.test(r.at) && !fetched.length, { ...r, text: (r.text || '').length, fetched });
r = get(gs, { dxfseed: '1', key: READ, v: '2.45.18', company: CO_A });
check('an older app (2.45.18, the Read key): the published plan template through the same request', r.ok === true && r.id === G1 && r.text === PLAN, { ...r, text: (r.text || '').length });
r = get(gs, { ckey: KEY_A, company: '', email: JUAN, v: '2.45.18' });
check('the older app\'s read names it (dxfSeed: the published file\'s id)', r.dxfSeed === G1, r.dxfSeed);
check('dxfseed=1 without a key: refused', eq(get(gs, { dxfseed: '1', key: 'nope' }), { ok: false, error: 'key' }));
r = pub({ key: ADMIN, kind: 'cef', name: 'DEMO TELCO CEF template.dxf', text: CEF, by: 'Ana Reyes' });
const C1 = r.id;
check('the CEF template published: in the folder, Settings → CEF template its link', r.ok === true && settingOf('CEF template') === link(C1) && folderFiles().length === 2 && world.props['cefseed.id'] === C1 && world.props['tpl.cef.client'] === undefined, r);
r = get(gs, { cefseed: '1', ckey: KEY_A, company: '', v: '2.45.19' });
check('cefseed=1: the published CEF template from the script\'s Drive', r.ok === true && r.id === C1 && r.text === CEF && r.pub === true && r.by === 'Ana Reyes' && !fetched.length, { ...r, text: (r.text || '').length });
check('the list\'s answer names both (dxfSeed, cefSeed)', (() => { const a = get(gs, { ckey: KEY_A, email: JUAN, v: '2.45.19' }); return a.dxfSeed === G1 && a.cefSeed === C1; })());

section('published again: the one before kept, renamed; a 10 MB template');
const BIG = PLAN.replace('\nEOF', `\n999\n${'D'.repeat(200)}\n`.repeat(10 * 1024 * 1024 / 206) + 'EOF');
r = pub({ key: ADMIN, kind: 'geo', name: 'DEMO TELCO plan template v2', text: BIG, by: 'Ana Reyes' });
const G2 = r.id, day = new Date().toISOString().slice(0, 10);
check('a 10 MB plan template published (".dxf" added to its name)', r.ok === true && G2 !== G1 && r.name === 'DEMO TELCO plan template v2.dxf' && r.size === BIG.length && BIG.length > 10 * 1000 * 1000, { ...r, big: BIG.length });
check('the one before: kept in the folder, renamed "… (replaced <date>)"', world.drive.files[G1] && world.drive.files[G1].name === `DEMO TELCO plan template (replaced ${day}).dxf` && r.replaced === world.drive.files[G1].name, world.drive.files[G1] && world.drive.files[G1].name);
check('Settings → Plan template: the newest one', settingOf('Plan template') === link(G2) && world.props['tpl.geo.client'] === undefined);
r = get(gs, { dxfseed: '1', key: READ });
check('dxfseed=1: the newest one', r.ok === true && r.id === G2 && r.text.length === BIG.length && r.client === undefined);
setting('Plan template', link(G1));
r = get(gs, { dxfseed: '1', key: READ });
check('going back: the replaced one\'s link typed in Settings → served (its renamed name; not "published" any more)', r.ok === true && r.id === G1 && r.text === PLAN && r.name === `DEMO TELCO plan template (replaced ${day}).dxf` && r.pub === undefined, { ...r, text: 0 });
setting('Plan template', link(G2));
check('all locks released', world.lockHeld === 0);

section('the newest wins: Settings typed by hand, a new link with the list, a publish');
const LIST = 'PCT1:demoListPayloadAAAA';
r = post(gs, { action: 'setList', key: ADMIN, list: LIST, id: 'demo-list-1', rev: 1, dxfSeed: link(G2), cefSeed: link(C1) });
check('the list sent with the published links (the admin phone after a publish): saved, the Settings rows as they were', r.ok === true && settingOf('Plan template') === link(G2) && settingOf('CEF template') === link(C1));
setting('Plan template', PUB_ID); PUBLIC[PUB_ID] = { text: PLAN2, name: 'typed by hand.dxf' };
r = post(gs, { action: 'setList', key: ADMIN, list: LIST, id: 'demo-list-1', rev: 2, dxfSeed: link(G2), cefSeed: link(C1) });
check('a link typed in Settings by hand wins while the list\'s link does not change', r.ok === true && settingOf('Plan template') === PUB_ID && get(gs, { dxfseed: '1', key: READ }).id === PUB_ID);
r = post(gs, { action: 'setList', key: ADMIN, list: LIST, id: 'demo-list-1', rev: 3, dxfSeed: `https://drive.google.com/file/d/${G1}/view?usp=sharing`, cefSeed: link(C1) });
check('a new link sent with the list (or paste a Google Drive link): the Settings row follows it (the newest wins)', r.ok === true && settingOf('Plan template') === link(G1) && get(gs, { dxfseed: '1', key: READ }).id === G1);
r = post(gs, { action: 'setList', key: ADMIN, list: LIST, id: 'demo-list-1', rev: 4, dxfSeed: '' });
check('the list\'s link removed: the row that held it cleared; the CEF template (not sent) kept', r.ok === true && settingOf('Plan template') === '' && !world.props['dxfseed.id'] && settingOf('CEF template') === link(C1) && eq(get(gs, { dxfseed: '1', key: READ }), { ok: false, error: 'no plan template' }));
setting('CEF template', PUB_CEF);
r = post(gs, { action: 'setList', key: ADMIN, list: LIST, id: 'demo-list-1', rev: 5, dxfSeed: '', cefSeed: '' });
check('a link removed from the list does not clear a row typed by hand', r.ok === true && settingOf('CEF template') === PUB_CEF && !world.props['cefseed.id']);
r = pub({ key: ADMIN, kind: 'cef', name: 'DEMO TELCO CEF template v2.dxf', text: CEF.replace('\n999\n', '\n999\nv2 ') , by: 'Ana Reyes' });
check('a publish after that wins again (the row its link)', r.ok === true && settingOf('CEF template') === link(r.id) && get(gs, { cefseed: '1', key: READ }).id === r.id);
check('all locks released', world.lockHeld === 0);

section('Google Drive not allowed yet (the script updated, setup not run again)');
world.drive.denied = true; fetched.length = 0;
r = pub({ key: ADMIN, kind: 'geo', name: 'x.dxf', text: PLAN });
check('publish: refused, saying to run setup and allow Google Drive; nothing changed; the lock released', world.lockHeld === 0 && r.ok === false && /run setup once more and allow Google Drive/.test(r.error) && settingOf('Plan template') === '', r);
r = get(gs, { cefseed: '1', key: READ });
check('cefseed=1 while Drive is not allowed: the published file cannot be read, said (no crash)', r.ok === false && /HTTP 404/.test(r.error), r);
setting('CEF template', PUB_CEF); fetched.length = 0;
r = get(gs, { cefseed: '1', key: READ });
check('a public link while Drive is not allowed: through UrlFetch, as v2.43.6', r.ok === true && r.id === PUB_CEF && fetched.length > 0 && r.pub === undefined, { ...r, text: (r.text || '').length });
world.drive.denied = false;
check('all locks released', world.lockHeld === 0);

section('the v2.43.6 tests, run on v2.43.7');
{
  const { spawnSync } = require('child_process'), run = (f, gsf) => spawnSync(process.execPath, [path.join(__dirname, f)], { env: { ...process.env, GS_FILE: gsf }, encoding: 'utf8', timeout: 300000 }).stdout || '';
  const res = (out) => ({ fails: out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(6).trim()), m: /(\d+) passed, (\d+) failed/.exec(out) });
  const A = res(run('sheet_stub_test_v2436.js', BASE_GS)), B = res(run('sheet_stub_test_v2436.js', env.NEW_GS));
  const only = (L) => L.filter((x) => !/its version 2\.43\.6|v2\.43\.5 tests/.test(x)); // (the script says 2.43.7)
  check('sheet_stub_test_v2436.js: on v2.43.7 no check fails that passes on v2.43.6 (the version aside)', !!A.m && !!B.m && +B.m[1] >= 25 && eq(only(B.fails), only(A.fails)), { A: A.m && A.m[0], B: B.m && B.m[0], fails: B.fails.slice(0, 6) });
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
