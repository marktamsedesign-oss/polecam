#!/usr/bin/env node
/*
 * sheet_stub_test_v24518.js — offline test of PoleCam-online-sheet_v2.45.18.gs (no network, synthetic data only).
 * v2.45.18 (beta 7.16, Permissions): the tab "User permissions" (one row per user email, one column per feature, Yes / No, TRUE / FALSE
 * or a ticked box; blank = what a user not listed has) and Settings → "User permissions" (No until the admin turns it on).
 *   - setup adds the tab (its header, Yes / No drop-downs on the feature columns) and the setting, once; nothing else.
 *   - G-eSAA before 2.45.18 (no pv) gets exactly what v2.43.2 sends (every read compared, the time left out).
 *   - A phone's read (pv=1, its email): { on, row (only the cells filled in), at }; a row of another company (company keys) does not
 *     count; with User permissions on, a user not listed is added at their first sync (not the admin company; once; 2000 rows at most).
 *   - The admin phone (Admin key): the whole tab (perms); setPerms writes the rows (a new row at once, only the changed cells of an
 *     existing one, Updated, by whom), clears the rows of users put back to the default, sets the setting; never a formula in a cell.
 *
 *   node sheet_stub_test_v24518.js        (GS_FILE: test another copy)
 *
 * Uses the stand-ins of ../e2e/sheet_env.js (the in-memory spreadsheet and the Apps Script services of sheet_stub_test.js).
 * Prints PASS / FAIL per check; exits 1 when any check fails.
 */
'use strict';
const path = require('path');
process.env.GS_FILE = process.env.GS_FILE || path.join(__dirname, 'PoleCam-online-sheet_v2.45.18.gs');
const env = require('../e2e/sheet_env.js');
const { world } = env;
const BASE_GS = path.join(__dirname, 'PoleCam-online-sheet_v2.43.2.gs');

let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (info !== undefined ? '\n      got: ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function section(t) { console.log('\n== ' + t); }
process.on('uncaughtException', (e) => { console.log('FAIL  stopped by an exception: ' + ((e && e.stack) || e)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed (stopped early)'); process.exit(1); });

/* ------------------------------------------------------------------ data (synthetic) */
const CO_A = 'DEMO CONTRACTOR', CO_B = 'SAMPLE BUILDERS', CO_ADMIN = 'DEMO TELCO';
const KEY_A = 'DMCA-7KQ4-MX2P', KEY_B = 'SMPB-9TRW-4HJK', KEY_ADMIN = 'TLCO-3XYZ-8PQR';
const JUAN = 'juan@demo-contractor.example', PEDRO = 'pedro@demo-contractor.example', MARIA = 'maria@demo-contractor.example';
const ANA = 'ana@sample-builders.example', INSPECTOR = 'inspector@demo-telco.example';
const HEAD = ['Email', 'Company', 'KMZ export', 'Plan drawing', 'Other exports', 'CEF plan', 'Drawing editing', 'Client templates', 'Team admin', 'Updated', 'Notes'];
const tab = (n) => world.ss.getSheetByName(n);
const header = (n) => { const sh = tab(n); return sh ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : null; };
function rowsOf(n) { const sh = tab(n); if (!sh || sh.getLastRow() < 2) return []; const h = header(n); return sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues().map((r) => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; }); }
const rowOf = (e) => rowsOf('User permissions').find((r) => String(r.Email).toLowerCase() === e) || null;
function setting(k, v) { const st = tab('Settings'), L = st.getRange(1, 1, st.getLastRow(), 2).getValues(), i = L.findIndex((r) => r[0] === k); if (i >= 0) st.getRange(i + 1, 2).setValue(v); else st.appendRow([k, v, '']); }
const settingRows = (k) => tab('Settings').rowsAsText().filter((r) => r[0] === k);
/** A cell of a user's row, by its header (as the admin types it in the sheet). */
function cell(e, head, v) { const sh = tab('User permissions'), h = header('User permissions'), c = h.indexOf(head), L = sh.getRange(1, 1, sh.getLastRow(), h.length).getValues(), r = L.findIndex((x, i) => i && String(x[h.indexOf('Email')]).toLowerCase() === e); if (r < 0 || c < 0) throw new Error('no cell ' + e + ' ' + head); sh.getRange(r + 1, c + 1).setValue(v); }
const strip = (o) => { const x = JSON.parse(JSON.stringify(o)); delete x.updated; return x; };

/* ================================================================== run */
const base = env.load(BASE_GS);
const gs = env.load(env.NEW_GS);
const post = (g, b) => env.post(g, b), get = (g, p) => env.get(g, p);

section('setup (a v2.43.2 sheet, then v2.45.18)');
base.setup();
check('v2.43.2 setup: no User permissions tab, no setting', !tab('User permissions') && !settingRows('User permissions').length);
tab('Companies').getRange(2, 1, 3, 1).setValues([[CO_A], [CO_B], [CO_ADMIN]]);
tab('CompanyKeys').getRange(2, 1, 3, 4).setValues([[CO_A, KEY_A, 'No', 'Yes'], [CO_B, KEY_B, 'No', ''], [CO_ADMIN, KEY_ADMIN, 'Yes', '']]);
tab('Tasks').getRange(2, 1, 2, 9).setValues([['T-A0000001', 'Demo Survey Poblacion', 'Survey', 'SITE-001', CO_A, 'Field Engineer 1', CO_A, 'Active', ''],
  ['T-B0000001', 'Sample PAT Riverside', 'PAT', 'SITE-002', CO_B, 'Field Engineer 2', CO_B, 'Active', '']]);
tab('Admin users').getRange(2, 1, 1, 5).setValues([[INSPECTOR, 'Demo Inspector', 'ID-001', '0917-000-0000', 'PAT/FAT inspector']]);
const READ = gs.settings_()['Read key'], ADMIN = gs.settings_()['Admin key'];
const sheetsBefore = world.ss.getNumSheets(), settingsBefore = tab('Settings').getLastRow();
gs.setup();
check('v2.45.18 setup adds the tab "User permissions" with its header', eq(header('User permissions'), HEAD), header('User permissions'));
check('its header bold, row 1 frozen, no other row', tab('User permissions').frozen === 1 && HEAD.every((_, i) => tab('User permissions').bold['1,' + (i + 1)] === true) && tab('User permissions').getLastRow() === 1);
check('one tab added, nothing else', world.ss.getNumSheets() === sheetsBefore + 1, world.ss.getSheets().map((s) => s.name));
check('Settings → User permissions added: No (off until the admin turns it on)', eq(settingRows('User permissions').map((r) => r[1]), ['No']) && tab('Settings').getLastRow() === settingsBefore + 1, settingRows('User permissions'));
check('Yes / No drop-downs on the 7 feature columns (C to I)', [3, 4, 5, 6, 7, 8, 9].every((c) => tab('User permissions').validations.some((v) => v.c === c && eq(v.rule.list, ['Yes', 'No']))) && !tab('User permissions').validations.some((v) => v.c === 1 || v.c === 2 || v.c > 9));
gs.setup();
check('setup again: no second setting row, no second tab', settingRows('User permissions').length === 1 && world.ss.getNumSheets() === sheetsBefore + 1);
check('the keys are not changed by setup', gs.settings_()['Read key'] === READ && gs.settings_()['Admin key'] === ADMIN);

section('G-eSAA before 2.45.18 (no pv): the answers of v2.43.2');
const READS = [{ key: READ, company: CO_A, email: JUAN, v: '2.45.17' }, { ckey: KEY_A, company: '', email: JUAN, v: '2.45.17' }, { ckey: KEY_B, email: ANA, v: '2.43.0' },
  { ckey: KEY_ADMIN, email: INSPECTOR, v: '2.45.17' }, { key: READ, company: '', akey: ADMIN, v: '2.45.17' }, { key: READ, company: CO_A }, { key: 'wrong' }, { probe: '1' }];
setting('User permissions', 'Yes');
READS.forEach((p, i) => { const a = strip(get(base, p)), b = strip(get(gs, p)); check(`read ${i + 1} (${Object.keys(p).join(', ')}): the same as v2.43.2, no perm`, eq(a, b) && b.perm === undefined && b.perms === undefined, { a, b }); });
check('no user added by an older G-eSAA (no pv), even with User permissions on', tab('User permissions').getLastRow() === 1);
setting('User permissions', 'No');

section('a phone of G-eSAA 2.45.18 (pv=1): its own row');
let r = get(gs, { ckey: KEY_A, company: '', email: JUAN, pv: '1', v: '2.45.18' });
check('User permissions off (No): perm { on: false }, nobody listed', eq(r.perm, { on: false }), r.perm);
check('off: the user is not added to the tab', tab('User permissions').getLastRow() === 1);
setting('User permissions', 'Yes');
r = get(gs, { ckey: KEY_A, company: '', email: JUAN, pv: '1', v: '2.45.18' });
check('on, not listed: perm { on: true } (no row: what a user not listed has)', eq(r.perm, { on: true }), r.perm);
let J = rowOf(JUAN);
check('on: the user is added at the first sync (Email, Company from the key, feature cells blank)', !!J && J.Company === CO_A && HEAD.slice(2, 9).every((h) => J[h] === '') && /^Added by G-eSAA \d{4}-\d\d-\d\d \(first sync\)$/.test(J.Notes), J);
get(gs, { ckey: KEY_A, company: '', email: JUAN.toUpperCase(), pv: '1' });
check('a second sync (the email in capitals): not added twice', rowsOf('User permissions').filter((x) => String(x.Email).toLowerCase() === JUAN).length === 1);
r = get(gs, { ckey: KEY_ADMIN, company: '', email: INSPECTOR, pv: '1' });
check('the admin company (sees all tasks): answered, not added (admin users have everything)', eq(r.perm, { on: true }) && !rowOf(INSPECTOR), r.perm);
r = get(gs, { ckey: KEY_B, company: '', email: ANA, pv: '1' });
check('another company\'s key: added with that company', eq(r.perm, { on: true }) && rowOf(ANA) && rowOf(ANA).Company === CO_B);
r = get(gs, { key: READ, company: CO_B, email: MARIA, pv: '1' });
check('company keys used: a read without one is refused as before (no perm)', r.ok === false && r.error === 'company key' && r.perm === undefined && !rowOf(MARIA), r);
check('not an email: no perm', get(gs, { ckey: KEY_A, email: 'not-an-email', pv: '1' }).perm === undefined && get(gs, { ckey: KEY_A, email: '=HYPERLINK("x")@a.bc', pv: '1' }).perm === undefined);
check('locks released', world.lockHeld === 0);

cell(JUAN, 'Plan drawing', 'Yes'); cell(JUAN, 'KMZ export', 'No'); cell(JUAN, 'CEF plan', true); cell(JUAN, 'Drawing editing', false); cell(JUAN, 'Team admin', 'TRUE'); cell(JUAN, 'Other exports', 'maybe');
r = get(gs, { ckey: KEY_A, company: '', email: JUAN, pv: '1' });
check('the admin types in the tab: the row as typed (Yes / No, a ticked box, TRUE; blank and "maybe" left out)', eq(r.perm, { on: true, row: { kmz: false, plan: true, cef: true, edit: false, admin: true } }), r.perm);
cell(ANA, 'Plan drawing', 'y'); cell(ANA, 'Other exports', 'n');
r = get(gs, { ckey: KEY_B, company: '', email: ANA, pv: '1' });
check('y / n understood', eq(r.perm.row, { plan: true, exp: false }), r.perm);
r = get(gs, { ckey: KEY_B, company: '', email: JUAN, pv: '1' });
check('company keys: a row of another company does not count (as a user not listed), and is not added again', eq(r.perm, { on: true }) && rowsOf('User permissions').filter((x) => String(x.Email).toLowerCase() === JUAN).length === 1, r.perm);
setting('User permissions', 'No');
r = get(gs, { ckey: KEY_A, company: '', email: JUAN, pv: '1' });
check('off again: on false (the row still said; the phone does not use it while off)', r.perm.on === false && r.perm.row && r.perm.row.plan === true, r.perm);
setting('User permissions', 'Yes');
{ // the admin moves the columns: found by their names
  const sh = tab('User permissions'), n = sh.getLastRow(), lc = sh.getLastColumn(), v = sh.getRange(1, 1, n, lc).getValues(), order = [2, 0, 3, 4, 1, 5, 6, 7, 8, 9, 10];
  sh.getRange(1, 1, n, lc).setValues(v.map((row) => order.map((k) => row[k])));
  r = get(gs, { ckey: KEY_A, company: '', email: JUAN, pv: '1' });
  check('columns moved by the admin: still found by their names', eq(r.perm.row, { kmz: false, plan: true, cef: true, edit: false, admin: true }) && rowsOf('User permissions').filter((x) => String(x.Email).toLowerCase() === JUAN).length === 1, r.perm);
}

section('the admin phone (Admin key)');
r = get(gs, { key: READ, company: '', akey: ADMIN, email: 'admin@demo-telco.example', pv: '1' });
const pj = (r.perms || []).find((x) => x.e === JUAN);
check('a read with the Admin key and pv: the whole tab (perms)', Array.isArray(r.perms) && r.perms.length === 2 && pj && eq(pj.f, { kmz: false, plan: true, cef: true, edit: false, admin: true }) && pj.c === CO_A && /first sync/.test(pj.n), r.perms);
check('without pv (an older admin phone): no perms', get(gs, { key: READ, company: '', akey: ADMIN }).perms === undefined);
check('with a company key only: no perms', get(gs, { ckey: KEY_A, email: JUAN, pv: '1' }).perms === undefined);
check('setPerms without the Admin key: refused (key)', eq(post(gs, { action: 'setPerms', key: READ, users: [{ e: PEDRO, f: { plan: true } }] }), { ok: false, error: 'key' }) && eq(post(gs, { action: 'setPerms', ckey: KEY_A, users: [] }), { ok: false, error: 'key' }) && !rowOf(PEDRO));
const W0 = tab('User permissions').writes;
r = post(gs, { action: 'setPerms', key: ADMIN, by: 'admin@demo-telco.example', users: [
  { e: PEDRO, c: CO_A, f: { kmz: true, plan: true, exp: false, cef: false, edit: true, tpl: false, admin: false } },
  { e: JUAN, c: CO_A, f: { kmz: false, plan: false, exp: false, cef: true, edit: false, tpl: false, admin: true } },
  { e: '=cmd@evil.example', f: { plan: true } }, { e: 'not an email', f: { plan: true } }, { e: ANA, c: '=HYPERLINK("http://x")', f: { tpl: true } }] });
check('setPerms (Admin key): ok, 3 rows written (2 bad emails skipped)', r.ok === true && r.n === 3 && r.on === true, r);
const P = rowOf(PEDRO);
check('a new user: a row with every cell (Yes / No), Updated, by whom', !!P && P.Company === CO_A && P['KMZ export'] === 'Yes' && P['Plan drawing'] === 'Yes' && P['Other exports'] === 'No' && P['Drawing editing'] === 'Yes' && P['Team admin'] === 'No' && /^\d{4}-\d\d-\d\dT/.test(P.Updated) && P.Notes === 'Set in G-eSAA by admin@demo-telco.example', P);
J = rowOf(JUAN);
check('an existing user: only the changed cells written (Plan drawing No; Other exports, Client templates set; KMZ export No kept; CEF plan as it was)', J['Plan drawing'] === 'No' && J['KMZ export'] === 'No' && J['CEF plan'] === true && J['Other exports'] === 'No' && J['Client templates'] === 'No' && J['Team admin'] === 'TRUE' && /^\d{4}-/.test(J.Updated), J);
check('never a formula in a cell: the leading = left out of a company; an email starting with = skipped', !rowsOf('User permissions').some((x) => Object.values(x).some((v) => /^=/.test(String(v)))) && rowOf(ANA).Company === CO_B && !rowOf('=cmd@evil.example'));
check('the cells written one by one, only those that change (an existing row), a new row at once', tab('User permissions').writes - W0 <= 16, tab('User permissions').writes - W0);
r = get(gs, { ckey: KEY_A, company: '', email: PEDRO, pv: '1' });
check('the phone reads what the admin phone wrote', eq(r.perm.row, { kmz: true, plan: true, exp: false, cef: false, edit: true, tpl: false, admin: false }) && /^\d{4}-/.test(r.perm.at), r.perm);
r = post(gs, { action: 'setPerms', key: ADMIN, users: [{ e: PEDRO, f: { kmz: true, plan: true, exp: false, cef: false, edit: true, tpl: false, admin: false } }] });
check('nothing changed: n 0, Updated kept', r.ok && r.n === 0 && rowOf(PEDRO).Updated === P.Updated, r);
r = post(gs, { action: 'setPerms', key: ADMIN, by: 'admin@demo-telco.example', gone: [JUAN, 'nobody@demo-contractor.example'] });
J = rowOf(JUAN);
check('gone: the feature cells cleared (what a user not listed has), the row kept, said in Notes', r.ok && r.n === 1 && HEAD.slice(2, 9).every((h) => J[h] === '') && /^Back to what a user not listed has, in G-eSAA by admin@demo-telco\.example$/.test(J.Notes), J);
check('the phone then gets an empty row', eq(get(gs, { ckey: KEY_A, company: '', email: JUAN, pv: '1' }).perm.row, {}));
r = post(gs, { action: 'setPerms', key: ADMIN, on: false });
check('on: false: Settings → User permissions = No', r.ok && r.on === false && eq(settingRows('User permissions').map((x) => x[1]), ['No']));
r = post(gs, { action: 'setPerms', key: ADMIN, on: true });
check('on: true: Yes', r.ok && r.on === true && eq(settingRows('User permissions').map((x) => x[1]), ['Yes']));
world.lockBusy = true; r = post(gs, { action: 'setPerms', key: ADMIN, users: [{ e: MARIA, f: { plan: true } }] }); world.lockBusy = false;
check('another request holds the lock: busy, nothing written', eq(r, { ok: false, error: 'busy' }) && !rowOf(MARIA));
world.lockBusy = true; r = get(gs, { ckey: KEY_A, company: '', email: MARIA, pv: '1' }); world.lockBusy = false;
check('a first sync while the lock is held: answered, the user added at the next sync', eq(r.perm, { on: true }) && !rowOf(MARIA) && (get(gs, { ckey: KEY_A, company: '', email: MARIA, pv: '1' }), !!rowOf(MARIA)));

section('a sheet set up before (no setting row, the tab made by hand) and the cap');
{
  const st = tab('Settings'), L = st.getRange(1, 1, st.getLastRow(), 3).getValues().filter((x) => x[0] !== 'User permissions');
  st.data = []; st.getRange(1, 1, L.length, 3).setValues(L);
  r = get(gs, { ckey: KEY_A, company: '', email: PEDRO, pv: '1' });
  check('no "User permissions" setting: off', r.perm.on === false);
  r = post(gs, { action: 'setPerms', key: ADMIN, on: true });
  check('setPerms on: the setting row added (Yes)', r.ok && r.on === true && eq(settingRows('User permissions').map((x) => x[1]), ['Yes']));
  const sh = tab('User permissions'), n0 = rowsOf('User permissions').length, fill = [];
  for (let i = n0; i < 2000; i++) fill.push([`user${i}@demo-contractor.example`, CO_A, '', '', '', '', '', '', '', '', '']);
  const h = header('User permissions'); sh.getRange(sh.getLastRow() + 1, 1, fill.length, 11).setValues(fill.map((x) => { const o = []; HEAD.forEach((k, j) => { o[h.indexOf(k)] = x[j]; }); return o; }));
  r = get(gs, { ckey: KEY_A, company: '', email: 'late@demo-contractor.example', pv: '1' });
  check('2000 users in the tab: a new one is answered, not added', eq(r.perm, { on: true }) && !rowOf('late@demo-contractor.example') && rowsOf('User permissions').length === 2000);
  check('the admin phone gets 2000 rows at most', get(gs, { key: READ, company: '', akey: ADMIN, pv: '1' }).perms.length === 2000);
}
section('a sheet without company keys (each phone says its company)');
{
  const ck = tab('CompanyKeys'), keep = ck.getRange(2, 1, 3, 4).getValues(); ck.getRange(2, 1, 3, 4).clearContent();
  r = get(gs, { key: READ, company: CO_B, email: JUAN, pv: '1' });
  check('a row of another company counts (the sheet cannot tell who is who without keys)', r.ok && r.perm.on === true && eq(r.perm.row, {}), r.perm);
  r = get(gs, { key: READ, company: CO_B, email: 'zed@sample-builders.example', pv: '1' });
  check('a new user is answered (the tab is full: not added)', eq(r.perm, { on: true }));
  r = get(gs, { key: READ, company: '', email: 'nobody@sample-builders.example', pv: '1' });
  check('no company yet: no tasks, answered', r.ok && eq(r.perm, { on: true }) && r.tasks.length === 0);
  ck.getRange(2, 1, 3, 4).setValues(keep);
}
check('all locks released', world.lockHeld === 0);

section('the v2.43.2 tests, run on v2.45.18');
{
  const { spawnSync } = require('child_process'), run = (f) => spawnSync(process.execPath, [path.join(__dirname, f)], { env: { ...process.env, GS_FILE: env.NEW_GS }, encoding: 'utf8', timeout: 300000 }).stdout || '';
  const out = run('sheet_stub_test_v2432.js'), fails = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(6).trim()), m = /(\d+) passed, (\d+) failed/.exec(out);
  check('sheet_stub_test_v2432.js: every check passes but the two that count the tabs (one more: User permissions)', !!m && +m[1] >= 190 && eq(fails, ['3 tabs added, nothing else', 'setup again: no new tab']), { m: m && m[0], fails });
  const qa = run('sheet_qa08_qa18_test.js'), mq = /(\d+) passed, (\d+) failed/.exec(qa);
  check('sheet_qa08_qa18_test.js: every check passes', !!mq && +mq[1] >= 45 && mq[2] === '0', mq && mq[0]);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
