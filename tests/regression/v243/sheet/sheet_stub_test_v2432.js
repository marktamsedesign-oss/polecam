#!/usr/bin/env node
/*
 * sheet_stub_test_v2432.js — offline test of PoleCam-online-sheet_v2.43.2.gs (no network, synthetic data only).
 * v2.43.2 (QA-08, QA-18): the v2.43.1 checks with the new rules: a Coordinator is approved (here by the admin, at once), the team answer
 * names people only to a confirmed email, and the codes keep emails for the admin. Team requests carry tv: 2 (G-eSAA beta 3.3).
 * The QA-08 / QA-18 cases themselves are in sheet_qa08_test.js.
 * v2.43.1 (QA-17): the v2.43 checks, with Team switched on for the two test companies, and a section on the switch.
 *
 *   node sheet_stub_test.js
 *
 * Loads the .gs (and the v2.42.18 base, for the regression comparison) with stubbed Apps Script services:
 * SpreadsheetApp (in-memory sheets), PropertiesService, CacheService (with expiry), LockService, MailApp (records mail),
 * Utilities (node crypto), ContentService, Session, UrlFetchApp (refuses: no network). Both scripts share the same
 * spreadsheet, properties and cache, like two deployments of one Apps Script project.
 * Prints PASS / FAIL per check; exits 1 when any check fails.
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const DIR = __dirname;
const NEW_GS = process.env.GS_FILE || path.join(DIR, 'PoleCam-online-sheet_v2.43.2.gs'); // GS_FILE: test another copy
const BASE_GS = path.join(DIR, 'base_v2.42.18.gs');

/* ------------------------------------------------------------------ clock */
let offsetMs = 0;
const realNow = Date.now.bind(Date);
Date.now = () => realNow() + offsetMs;
const advance = (sec) => { offsetMs += sec * 1000; };

/* ------------------------------------------------------------------ in-memory spreadsheet */
const MAX_ROWS = 1000, MAX_COLS = 26;
function colNum(letters) { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function parseA1(a1) {
  // 'A1', 'A1:C3', 'A:A', 'C2:C', 'A:B'
  const part = (p) => { const m = /^([A-Z]+)(\d*)$/.exec(p); if (!m) throw new Error('A1 not supported: ' + a1); return { c: colNum(m[1]), r: m[2] ? Number(m[2]) : null }; };
  const [a, b] = a1.toUpperCase().split(':'); const p = part(a), q = b ? part(b) : p;
  const r1 = p.r || 1, r2 = q.r || (b ? MAX_ROWS : r1);
  return { r: r1, c: p.c, nr: r2 - r1 + 1, nc: q.c - p.c + 1 };
}
class Range {
  constructor(sh, r, c, nr, nc) {
    if (!(r >= 1 && c >= 1)) throw new Error('Range out of bounds: row ' + r + ' col ' + c);
    if (!(nr >= 1) || !(nc >= 1)) throw new Error('The number of rows/columns in the range must be at least 1');
    Object.assign(this, { sh, r, c, nr, nc });
  }
  cells(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j, i, j); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); out.push(row); } return out; }
  getDisplayValues() { return this.getValues().map((r) => r.map((v) => (v instanceof Date ? v.toISOString() : String(v)))); }
  getValue() { return this.sh.get(this.r, this.c); }
  setValues(v) {
    if (!Array.isArray(v) || v.length !== this.nr || v.some((row) => !Array.isArray(row) || row.length !== this.nc))
      throw new Error('The number of rows or columns in the data does not match the range (' + this.nr + 'x' + this.nc + ')');
    this.cells((r, c, i, j) => this.sh.set(r, c, v[i][j])); this.sh.writes++; return this;
  }
  setValue(x) { this.cells((r, c) => this.sh.set(r, c, x)); this.sh.writes++; return this; }
  setFormula(f) { return this.setValue(f); }
  clearContent() { this.cells((r, c) => this.sh.set(r, c, '')); return this; }
  setFontWeight(w) { if (this.nr * this.nc <= 5000) this.cells((r, c) => { this.sh.bold[r + ',' + c] = w === 'bold'; }); return this; }
  setNumberFormat(f) { this.sh.formats.push({ r: this.r, c: this.c, nr: this.nr, nc: this.nc, f }); return this; }
  setDataValidation(rule) { this.sh.validations.push({ r: this.r, c: this.c, nr: this.nr, nc: this.nc, rule }); return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; this.frozen = 0; this.bold = {}; this.formats = []; this.validations = []; this.writes = 0; }
  getName() { return this.name; }
  get(r, c) { const row = this.data[r - 1]; const v = row ? row[c - 1] : undefined; return v === undefined || v === null ? '' : v; }
  set(r, c, v) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getLastRow() { for (let i = this.data.length; i >= 1; i--) if (this.data[i - 1].some((v) => v !== '' && v !== undefined && v !== null)) return i; return 0; }
  getLastColumn() { let m = 0; this.data.forEach((row) => row.forEach((v, j) => { if (v !== '' && v !== undefined && v !== null) m = Math.max(m, j + 1); })); return m; }
  getMaxRows() { return MAX_ROWS; }
  getMaxColumns() { return MAX_COLS; }
  getRange(a, b, nr, nc) {
    if (typeof a === 'string') { const p = parseA1(a); return new Range(this, p.r, p.c, p.nr, p.nc); }
    return new Range(this, a, b, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc);
  }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(row) { const r = this.getLastRow() + 1; row.forEach((v, j) => this.set(r, j + 1, v)); return this; }
  setFrozenRows(n) { this.frozen = n; }
  getFrozenRows() { return this.frozen; }
  autoResizeColumns() { return this; }
  // test helpers (not Apps Script)
  rowsAsText() { return this.data.map((r) => r.map((v) => String(v))); }
}
class Spreadsheet {
  constructor(name) { this.name = name; this.sheets = []; }
  getName() { return this.name; }
  getId() { return 'TEST-SPREADSHEET'; }
  getSheets() { return this.sheets.slice(); }
  getNumSheets() { return this.sheets.length; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n, idx) {
    if (this.getSheetByName(n)) throw new Error('A sheet with the name "' + n + '" already exists.');
    const sh = new Sheet(n);
    if (typeof idx === 'number') this.sheets.splice(idx, 0, sh); else this.sheets.push(sh);
    return sh;
  }
}

/* ------------------------------------------------------------------ services */
const world = {};
function resetWorld() {
  world.ss = new Spreadsheet('PoleCam online list (test)');
  world.props = {};
  world.cache = {};
  world.mail = [];
  world.quota = 100;
  world.lockBusy = false;
  world.lockHeld = 0;
  world.logs = [];
}
resetWorld();

const SpreadsheetApp = {
  getActiveSpreadsheet: () => world.ss,
  getActive: () => world.ss,
  openById: () => { throw new Error('openById is not available offline'); },
  newDataValidation: () => {
    const rule = { list: null, allowInvalid: true };
    const b = { requireValueInList(l) { rule.list = l.slice(); return b; }, setAllowInvalid(x) { rule.allowInvalid = x; return b; }, build() { return rule; } };
    return b;
  },
};
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => (Object.prototype.hasOwnProperty.call(world.props, k) ? world.props[k] : null),
    setProperty(k, v) { world.props[k] = String(v); return this; },
    setProperties(o) { Object.keys(o).forEach((k) => { world.props[k] = String(o[k]); }); return this; },
    deleteProperty(k) { delete world.props[k]; return this; },
    getProperties: () => Object.assign({}, world.props),
  }),
};
const CacheService = {
  getScriptCache: () => ({
    get(k) { const x = world.cache[k]; if (!x) return null; if (Date.now() >= x.exp) { delete world.cache[k]; return null; } return x.v; },
    put(k, v, ttl) {
      if (typeof v !== 'string') throw new Error('cache value must be a string');
      const t = Math.min(21600, ttl === undefined ? 600 : ttl); world.cache[k] = { v, exp: Date.now() + t * 1000 };
    },
    remove(k) { delete world.cache[k]; },
  }),
};
const LockService = {
  getScriptLock: () => {
    let mine = false;
    return {
      waitLock() { if (world.lockBusy) throw new Error('Lock timeout: another process was holding the lock for too long.'); mine = true; world.lockHeld++; },
      tryLock() { if (world.lockBusy) return false; mine = true; world.lockHeld++; return true; },
      releaseLock() { if (mine) { mine = false; world.lockHeld--; } },
      hasLock() { return mine; },
    };
  },
};
const MailApp = {
  getRemainingDailyQuota: () => world.quota,
  sendEmail(a, b, c) {
    const m = typeof a === 'object' ? a : { to: a, subject: b, body: c };
    if (world.quota < 1) throw new Error('Service invoked too many times for one day: email.');
    world.quota--; world.mail.push(m);
  },
};
const toBuf = (x) => (Array.isArray(x) ? Buffer.from(x.map((b) => b & 255)) : Buffer.from(String(x), 'utf8'));
const toBytes = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b)); // Apps Script byte[] is signed
const Utilities = {
  DigestAlgorithm: { MD5: 'md5', SHA_1: 'sha1', SHA_256: 'sha256' },
  Charset: { UTF_8: 'utf8', US_ASCII: 'ascii' },
  getUuid: () => crypto.randomUUID(),
  computeDigest: (alg, v) => toBytes(crypto.createHash(alg).update(toBuf(v)).digest()),
  computeHmacSha256Signature: (v, k) => toBytes(crypto.createHmac('sha256', toBuf(k)).update(toBuf(v)).digest()),
  base64Encode: (x) => toBuf(x).toString('base64'),
  base64EncodeWebSafe: (x) => toBuf(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'), // keeps the = padding, like Apps Script
  formatDate: (d) => new Date(d).toISOString().slice(0, 10),
  sleep: () => {},
};
const ContentService = {
  MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
  createTextOutput: (s) => ({ content: s, mime: null, getContent() { return this.content; }, setMimeType(m) { this.mime = m; return this; } }),
};
const Session = { getScriptTimeZone: () => 'Asia/Manila', getEffectiveUser: () => ({ getEmail: () => 'owner@demo-telco.example' }) };
const UrlFetchApp = { fetch: () => { throw new Error('no network in this test'); } };
const quietConsole = { log: (...a) => world.logs.push(a.join(' ')), warn: (...a) => world.logs.push(a.join(' ')), error: (...a) => world.logs.push(a.join(' ')) };

/* ------------------------------------------------------------------ load a .gs */
const EXPORTS = ['setup', 'doGet', 'doPost', 'resetTeamTokens', 'teamToken_', 'settings_', 'normCo_', 'makeCompanyKeys'];
function load(file) {
  const code = fs.readFileSync(file, 'utf8');
  const ret = '\n;return {' + EXPORTS.map((n) => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(', ') + '};';
  const f = new Function('SpreadsheetApp', 'PropertiesService', 'CacheService', 'LockService', 'MailApp', 'Utilities', 'ContentService', 'Session', 'UrlFetchApp', 'console', code + ret);
  return f(SpreadsheetApp, PropertiesService, CacheService, LockService, MailApp, Utilities, ContentService, Session, UrlFetchApp, quietConsole);
}
const TEAM_RE = /^(teamCode|teamVerify|team|teamRole|teamJoin|teamAnswer|teamRemove|teamLeave|mailboxSet|mailboxKey|teamApprove)$/;
function post(gs, body) {
  if (body && TEAM_RE.test(String(body.action)) && body.tv === undefined) body = { ...body, tv: 2 }; // as G-eSAA beta 3.3 sends
  const out = gs.doPost({ postData: { contents: JSON.stringify(body) } });
  if (world.lockHeld !== 0) throw new Error('lock not released after ' + body.action);
  return JSON.parse(out.getContent());
}
function get(gs, params) { return JSON.parse(gs.doGet({ parameter: params }).getContent()); }

/* ------------------------------------------------------------------ checks */
let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (info !== undefined ? '\n      got: ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function section(t) { console.log('\n== ' + t); }
process.on('uncaughtException', (e) => { // a check that throws counts as a failure (and stops the run)
  console.log('FAIL  stopped by an exception: ' + ((e && e.stack) || e));
  console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed (stopped early)');
  process.exit(1);
});

/* ------------------------------------------------------------------ data (synthetic) */
const CO_A = 'DEMO CONTRACTOR', CO_B = 'SAMPLE BUILDERS', CO_ADMIN = 'DEMO TELCO';
const KEY_A = 'DMCA-7KQ4-MX2P', KEY_B = 'SMPB-9TRW-4HJK', KEY_ADMIN = 'TLCO-3XYZ-8PQR';
const JUAN = 'juan@demo-contractor.example', PEDRO = 'pedro@demo-contractor.example', MARIA = 'maria@demo-contractor.example';
const ANA = 'ana@sample-builders.example', INSPECTOR = 'inspector@demo-telco.example';
const URL_A = 'https://script.google.com/macros/s/AKfycbDemoContractorMailbox_123-abc/exec';
const URL_A2 = 'https://script.google.com/macros/s/AKfycbDemoContractorMailbox_456-def/exec';
const URL_B = 'https://script.google.com/macros/s/AKfycbSampleBuildersMailbox_789/exec';
const TKEY_A = 'tk_DemoContractorTeamKey_0001', TKEY_A2 = 'tk_DemoContractorTeamKey_0002-new', TKEY_B = 'tk_SampleBuildersTeamKey_0001';

function lastCode(to) { const m = world.mail.filter((x) => x.to === to).pop(); const k = m && /\b(\d{6})\b/.exec(m.subject); return k ? k[1] : null; }
function tab(name) { return world.ss.getSheetByName(name); }
function header(name) { const sh = tab(name); return sh ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : null; }
function settingsRows(key) { return tab('Settings').rowsAsText().filter((r) => r[0] === key).length; }
function rowsOf(name) { const sh = tab(name); if (!sh || sh.getLastRow() < 2) return []; const h = header(name); return sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues().map((r) => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; }); }

/* ================================================================== run */
const base = load(BASE_GS);
const gs = load(NEW_GS);

section('setup (an existing v2.42.18 sheet, then v2.43)');
base.setup();
check('base setup leaves no Team / TeamLinks / Mailboxes tabs', !tab('Team') && !tab('TeamLinks') && !tab('Mailboxes'));
check('base setup: no "Mailbox script link" setting', settingsRows('Mailbox script link') === 0);
// seed: companies, keys, tasks, an admin user (synthetic)
const sheetCo = tab('Companies'); [CO_A, CO_B, CO_ADMIN].forEach((n, i) => sheetCo.getRange(i + 2, 1).setValue(n));
const sheetKeys = tab('CompanyKeys'); sheetKeys.getRange(2, 1, 3, 3).setValues([[CO_A, KEY_A, 'No'], [CO_B, KEY_B, 'No'], [CO_ADMIN, KEY_ADMIN, 'Yes']]);
tab('Tasks').getRange(2, 1, 3, 9).setValues([
  ['T-A0000001', 'Demo Survey Poblacion', 'Survey', 'SITE-001', CO_A, 'Field Engineer 1', CO_A, 'Active', ''],
  ['T-B0000001', 'Sample PAT Riverside', 'PAT', 'SITE-002', CO_B, 'Field Engineer 2', CO_B, 'Active', ''],
  ['T-X0000001', 'Open Cluster', 'Survey', 'SITE-003', '', '', '', 'Active', ''],
]);
tab('Admin users').getRange(2, 1, 1, 5).setValues([[INSPECTOR, 'Demo Inspector', 'ID-001', '0917-000-0000', 'PAT/FAT inspector']]);
const sheetsBefore = world.ss.getNumSheets();

gs.setup();
const T = ['Team', 'TeamLinks', 'Mailboxes'];
check('v2.43 setup creates Team, TeamLinks, Mailboxes', T.every((n) => !!tab(n)));
check('Team header (v2.43.2: Approved)', eq(header('Team'), ['Company', 'Email', 'Name', 'Role', 'Regions', 'Updated', 'Approved (Yes / No)']), header('Team'));
check('TeamLinks header', eq(header('TeamLinks'), ['Company', 'Coordinator email', 'Member email', 'Status', 'Updated']), header('TeamLinks'));
check('Mailboxes header', eq(header('Mailboxes'), ['Company', 'Web app address', 'Key', 'Set up by', 'Google account', 'Checked', 'Status']), header('Mailboxes'));
check('headers bold and row 1 frozen', T.every((n) => tab(n).frozen === 1 && header(n).every((_, i) => tab(n).bold['1,' + (i + 1)] === true)));
check('only the header row in the new tabs', T.every((n) => tab(n).getLastRow() === 1));
check('"Mailbox script link" added to Settings, blank', settingsRows('Mailbox script link') === 1 && gs.settings_()['Mailbox script link'] === '');
check('Role and Status drop-downs set', tab('Team').validations.some((v) => v.c === 4 && eq(v.rule.list, ['Coordinator', 'Field Partner', 'On my own']))
  && tab('TeamLinks').validations.some((v) => v.c === 4 && eq(v.rule.list, ['asked', 'in', 'declined', 'left', 'removed'])));
check('3 tabs added, nothing else', world.ss.getNumSheets() === sheetsBefore + 3, world.ss.getSheets().map((s) => s.name));
const keysBefore = JSON.stringify(gs.settings_());
gs.setup();
check('setup again: no new tab', world.ss.getNumSheets() === sheetsBefore + 3);
check('setup again: headers not repeated', T.every((n) => tab(n).getLastRow() === 1));
check('setup again: Settings not repeated, keys unchanged', settingsRows('Mailbox script link') === 1 && settingsRows('Read key') === 1 && JSON.stringify(gs.settings_()) === keysBefore);
const S = gs.settings_(), READ_KEY = S['Read key'], ADMIN_KEY = S['Admin key'];
check('Read key and Admin key kept from the base setup', READ_KEY.length === 20 && ADMIN_KEY.length === 20);

section('QA-17: the Team column in CompanyKeys (an existing sheet)');
check('setup adds "Team (Yes / No)" as the 4th header of CompanyKeys', eq(header('CompanyKeys'), ['Company', 'Key (give it only to that company)', 'Sees all tasks (Yes / No)', 'Team (Yes / No)']), header('CompanyKeys'));
check('the company rows are unchanged (keys, Sees all tasks), and Team is blank', eq(tab('CompanyKeys').getRange(2, 1, 3, 4).getValues(), [[CO_A, KEY_A, 'No', ''], [CO_B, KEY_B, 'No', ''], [CO_ADMIN, KEY_ADMIN, 'Yes', '']]), tab('CompanyKeys').getRange(2, 1, 3, 4).getValues());
check('the Team column has a Yes / No drop-down', tab('CompanyKeys').validations.some((v) => v.c === 4 && v.r === 2 && eq(v.rule.list, ['Yes', 'No'])));
check('the header is bold', tab('CompanyKeys').bold['1,4'] === true);
gs.setup();
check('setup again: no second Team column', eq(header('CompanyKeys'), ['Company', 'Key (give it only to that company)', 'Sees all tasks (Yes / No)', 'Team (Yes / No)']), header('CompanyKeys'));
check('blank Team = off: every team action with company A\'s key answers off', ['teamCode', 'teamVerify', 'team', 'teamRole', 'teamJoin', 'teamAnswer', 'teamRemove', 'teamLeave', 'mailboxSet', 'mailboxKey'].every((a) => eq(post(gs, { action: a, ckey: KEY_A, email: JUAN }), { ok: false, error: 'off' })));
check('blank Team: no code was emailed', world.mail.length === 0, world.mail.length);
check('blank Team: the sync answer (G-eSAA 2.43) says teamOn false', get(gs, { ckey: KEY_A, v: '2.43.0' }).teamOn === false);
// the two test companies are switched on for the rest of the v2.43 checks (the admin company stays off)
tab('CompanyKeys').getRange(2, 4, 2, 1).setValues([['Yes'], ['yes']]);
check('Team Yes (or yes): the sync answer says teamOn true', get(gs, { ckey: KEY_A, v: '2.43.0' }).teamOn === true && get(gs, { ckey: KEY_B, v: '2.43.3' }).teamOn === true);

section('teamCode');
check('unknown ckey -> key', eq(post(gs, { action: 'teamCode', ckey: 'ZZZZ-ZZZZ-ZZZZ', email: JUAN }), { ok: false, error: 'key' }));
check('missing ckey -> key', eq(post(gs, { action: 'teamCode', email: JUAN }), { ok: false, error: 'key' }));
check('bad email -> email', eq(post(gs, { action: 'teamCode', ckey: KEY_A, email: 'not-an-email' }), { ok: false, error: 'email' }));
check('formula-like email -> email', eq(post(gs, { action: 'teamCode', ckey: KEY_A, email: '=cmd@demo.example' }), { ok: false, error: 'email' }));
let r = post(gs, { action: 'teamCode', ckey: KEY_A, email: '  Juan@Demo-Contractor.example ' });
check('teamCode sends (email trimmed, lower case)', eq(r, { ok: true, sent: true }) && world.mail.length === 1 && world.mail[0].to === JUAN, r);
const m0 = world.mail[0];
check('mail: 6-digit code in subject and body', /^G-eSAA code \d{6}$/.test(m0.subject) && m0.body.indexOf(lastCode(JUAN)) >= 0);
check('mail: says it confirms the email in Your details → My role', /confirm your email/.test(m0.body) && m0.body.indexOf('Your details → My role') >= 0 && m0.body.indexOf(CO_A) >= 0, m0.body);
check('code works with dashes in the company key (normKey_)', eq(post(gs, { action: 'teamCode', ckey: KEY_A.replace(/-/g, '').toLowerCase(), email: JUAN }), { ok: true, sent: true }));
check('3rd code sent', eq(post(gs, { action: 'teamCode', ckey: KEY_A, email: JUAN }), { ok: true, sent: true }) && world.mail.length === 3);
check('4th code in 10 minutes -> wait (CODE_SENDS)', eq(post(gs, { action: 'teamCode', ckey: KEY_A, email: JUAN }), { ok: false, error: 'wait' }) && world.mail.length === 3);
check('admin-code counter is separate (adminCode for a non-admin email still answers)', eq(post(gs, { action: 'adminCode', ckey: KEY_A, email: JUAN }), { ok: true, sent: false }));
world.quota = 0;
check('mail quota 0 -> mailday (v2.43.2: the last emails are kept for admin codes)', eq(post(gs, { action: 'teamCode', ckey: KEY_A, email: PEDRO }), { ok: false, error: 'mailday' }) && world.mail.length === 3);
world.quota = 100;

section('teamVerify');
const juanCode = lastCode(JUAN), wrong = juanCode === '000000' ? '111111' : '000000';
r = post(gs, { action: 'teamVerify', ckey: KEY_A, email: JUAN, code: wrong });
check('wrong code -> code, left 4', eq(r, { ok: false, error: 'code', left: 4 }), r);
r = post(gs, { action: 'teamVerify', ckey: KEY_A, email: JUAN, code: '12' });
check('short code -> code, left 3', eq(r, { ok: false, error: 'code', left: 3 }), r);
r = post(gs, { action: 'teamVerify', ckey: KEY_B, email: JUAN, code: juanCode });
check('right code with another company\'s key -> expired (codes are per company)', eq(r, { ok: false, error: 'expired' }), r);
r = post(gs, { action: 'teamVerify', ckey: KEY_A, email: JUAN, code: juanCode });
check('right code -> tok', r.ok === true && typeof r.tok === 'string' && r.tok.length > 20 && Object.keys(r).length === 2, r);
const TOK_JUAN = r.tok;
check('tok = HMAC(team|company|email) with team.secret', TOK_JUAN === gs.teamToken_(gs.normCo_(CO_A), JUAN) && !!world.props['team.secret'] && world.props['team.secret'] !== world.props['admin.secret']);
check('same code again -> expired (used once)', eq(post(gs, { action: 'teamVerify', ckey: KEY_A, email: JUAN, code: juanCode }), { ok: false, error: 'expired' }));
// 5 wrong tries
post(gs, { action: 'teamCode', ckey: KEY_A, email: PEDRO });
const pedroCode = lastCode(PEDRO), pw = pedroCode === '999999' ? '888888' : '999999';
let lefts = []; for (let i = 0; i < 5; i++) lefts.push(post(gs, { action: 'teamVerify', ckey: KEY_A, email: PEDRO, code: pw }).left);
check('5 wrong tries: left 4,3,2,1,0', eq(lefts, [4, 3, 2, 1, 0]), lefts);
check('after 5 tries the right code is dead -> expired', eq(post(gs, { action: 'teamVerify', ckey: KEY_A, email: PEDRO, code: pedroCode }), { ok: false, error: 'expired' }));
// expiry (10 minutes)
post(gs, { action: 'teamCode', ckey: KEY_A, email: PEDRO });
const pedroCode2 = lastCode(PEDRO);
advance(601);
check('code after 10 minutes -> expired', eq(post(gs, { action: 'teamVerify', ckey: KEY_A, email: PEDRO, code: pedroCode2 }), { ok: false, error: 'expired' }));
check('send counter expired too: a new code can be sent', eq(post(gs, { action: 'teamCode', ckey: KEY_A, email: JUAN }), { ok: true, sent: true }));
function verify(ckey, email) {
  const s = post(gs, { action: 'teamCode', ckey, email });
  if (!s.ok) { advance(601); post(gs, { action: 'teamCode', ckey, email }); }
  const c = lastCode(email);
  return post(gs, { action: 'teamVerify', ckey, email, code: Number(c) }).tok; // a number works too (leading zeros kept)
}
const TOK_PEDRO = verify(KEY_A, PEDRO), TOK_MARIA = verify(KEY_A, MARIA), TOK_ANA = verify(KEY_B, ANA);
check('verify with the code sent as a number', !!TOK_PEDRO && !!TOK_MARIA && !!TOK_ANA);
world.lockBusy = true;
check('teamVerify while the lock is busy -> busy', eq(post(gs, { action: 'teamVerify', ckey: KEY_A, email: JUAN, code: '123456' }), { ok: false, error: 'busy' }));
world.lockBusy = false;

section('team snapshot (before any role)');
check('team: unknown key -> key', eq(post(gs, { action: 'team', ckey: 'NOPE-NOPE-NOPE', email: JUAN }), { ok: false, error: 'key' }));
check('team: no body fields at all -> key (never throws)', eq(post(gs, { action: 'team' }), { ok: false, error: 'key' }));
check('team: bad email -> email', eq(post(gs, { action: 'team', ckey: KEY_A, email: 'x' }), { ok: false, error: 'email' }));
r = post(gs, { action: 'team', ckey: KEY_A, email: JUAN });
check('team unverified, no rows: shape (teamOn true; v2.43.2: asking)', eq(r, { ok: true, teamOn: true, company: CO_A, verified: false, me: null, coordinators: [], myTeams: [], members: [], asking: [], mailbox: null, mailboxSet: false, scriptLink: '' }), r);
check('team with tok: verified true', post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN }).verified === true);
check('team with another email\'s tok: verified false', post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_PEDRO }).verified === false);

section('teamRole');
check('teamRole without tok -> tok', eq(post(gs, { action: 'teamRole', ckey: KEY_A, email: JUAN, role: 'Coordinator' }), { ok: false, error: 'tok' }));
check('teamRole wrong tok -> tok', eq(post(gs, { action: 'teamRole', ckey: KEY_A, email: JUAN, tok: TOK_PEDRO, role: 'Coordinator' }), { ok: false, error: 'tok' }));
check('teamRole unknown key -> key', eq(post(gs, { action: 'teamRole', ckey: 'BAD', email: JUAN, tok: TOK_JUAN, role: 'Coordinator' }), { ok: false, error: 'key' }));
check('teamRole role "Boss" -> role', eq(post(gs, { action: 'teamRole', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, role: 'Boss' }), { ok: false, error: 'role' }));
check('teamRole missing role -> role', eq(post(gs, { action: 'teamRole', ckey: KEY_A, email: JUAN, tok: TOK_JUAN }), { ok: false, error: 'role' }));
check('nothing written by refused calls', tab('Team').getLastRow() === 1);
r = post(gs, { action: 'teamRole', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, name: 'Juan Dela Cruz', role: 'coordinator', regions: 'MIN' });
check('teamRole Coordinator (any case) -> ok, asked: works as On my own until approved', eq(r, { ok: true, me: { role: 'On my own', regions: 'MIN', name: 'Juan Dela Cruz', ask: 'asked' } }), r);
r = post(gs, { action: 'teamCoordSet', key: ADMIN_KEY, company: CO_A, email: JUAN, approve: true });
check('the admin approves Juan (admin phone)', eq(r, { ok: true, status: 'approved' }), r);
let tr = rowsOf('Team');
check('Team row written: company as CompanyKeys, email, name, role, regions, updated', tr.length === 1 && tr[0].Company === CO_A && tr[0].Email === JUAN && tr[0].Name === 'Juan Dela Cruz'
  && tr[0].Role === 'Coordinator' && tr[0].Regions === 'MIN' && /^\d{4}-\d\d-\d\dT/.test(tr[0].Updated), tr);
r = post(gs, { action: 'teamRole', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, name: 'Juan Dela Cruz', role: 'Coordinator', regions: ['MIN', 'VIS'] });
check('teamRole again: same row updated (regions as a list)', rowsOf('Team').length === 1 && rowsOf('Team')[0].Regions === 'MIN, VIS', rowsOf('Team'));
r = post(gs, { action: 'teamRole', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, name: '=HYPERLINK("http://x")' + 'P'.repeat(200), role: 'Field Partner', regions: 'R'.repeat(100) });
tr = rowsOf('Team').find((x) => x.Email === PEDRO);
check('lengths and formula start sanitized (name <= 80, regions <= 60)', tr && tr.Name.length === 80 && !/^[=+@-]/.test(tr.Name) && tr.Regions.length === 60, tr);
post(gs, { action: 'teamRole', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, name: 'Pedro Santos', role: 'Field Partner', regions: 'MIN' });
post(gs, { action: 'teamRole', ckey: KEY_A, email: MARIA, tok: TOK_MARIA, name: 'Maria Garcia', role: 'On my own', regions: 'MIN' });
check('teamRole without name keeps the name', post(gs, { action: 'teamRole', ckey: KEY_A, email: MARIA, tok: TOK_MARIA, role: 'On my own' }).me.name === 'Maria Garcia');
check('3 Team rows for DEMO CONTRACTOR', rowsOf('Team').length === 3);
check('Team cells written as plain text', tab('Team').formats.some((f) => f.f === '@' && f.r >= 2));

section('teamJoin / teamAnswer');
check('teamJoin to an On my own user -> role', eq(post(gs, { action: 'teamJoin', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, name: 'Pedro Santos', coordinator: MARIA }), { ok: false, error: 'role' }));
check('teamJoin to an unknown email -> role', eq(post(gs, { action: 'teamJoin', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, name: 'Pedro Santos', coordinator: 'nobody@demo-contractor.example' }), { ok: false, error: 'role' }));
check('teamJoin to yourself -> self', eq(post(gs, { action: 'teamJoin', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, coordinator: JUAN }), { ok: false, error: 'self' }));
check('teamJoin without tok -> tok', eq(post(gs, { action: 'teamJoin', ckey: KEY_A, email: PEDRO, coordinator: JUAN }), { ok: false, error: 'tok' }));
r = post(gs, { action: 'teamJoin', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, name: 'Pedro Santos', coordinator: JUAN.toUpperCase() });
check('teamJoin Pedro -> Juan: asked', eq(r, { ok: true, status: 'asked' }), r);
check('TeamLinks row: company, coordinator, member, asked', eq(rowsOf('TeamLinks').map((x) => [x.Company, x['Coordinator email'], x['Member email'], x.Status]), [[CO_A, JUAN, PEDRO, 'asked']]));
post(gs, { action: 'teamJoin', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, name: 'Pedro Santos', coordinator: JUAN });
check('asking again: still one link row', rowsOf('TeamLinks').length === 1);
check('teamAnswer by a Field Partner -> role', eq(post(gs, { action: 'teamAnswer', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, member: PEDRO, accept: true }), { ok: false, error: 'role' }));
check('teamAnswer by On my own -> role', eq(post(gs, { action: 'teamAnswer', ckey: KEY_A, email: MARIA, tok: TOK_MARIA, member: PEDRO, accept: true }), { ok: false, error: 'role' }));
check('teamAnswer unknown member -> link', eq(post(gs, { action: 'teamAnswer', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, member: 'ghost@demo-contractor.example', accept: true }), { ok: false, error: 'link' }));
check('teamAnswer without tok -> tok', eq(post(gs, { action: 'teamAnswer', ckey: KEY_A, email: JUAN, member: PEDRO, accept: true }), { ok: false, error: 'tok' }));

section('mailboxSet');
const mb = (o) => post(gs, Object.assign({ action: 'mailboxSet', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, url: URL_A, key: TKEY_A, account: JUAN }, o));
check('mailboxSet by a Field Partner -> role', eq(mb({ email: PEDRO, tok: TOK_PEDRO }), { ok: false, error: 'role' }));
check('mailboxSet without tok -> tok', eq(mb({ tok: '' }), { ok: false, error: 'tok' }));
check('url http:// -> url', eq(mb({ url: URL_A.replace('https', 'http') }), { ok: false, error: 'url' }));
check('url other host -> url', eq(mb({ url: 'https://example.com/macros/s/abc/exec' }), { ok: false, error: 'url' }));
check('url /dev instead of /exec -> url', eq(mb({ url: URL_A.replace(/exec$/, 'dev') }), { ok: false, error: 'url' }));
check('url with a query -> url', eq(mb({ url: URL_A + '?x=1' }), { ok: false, error: 'url' }));
check('url over 200 characters -> url', eq(mb({ url: 'https://script.google.com/macros/s/' + 'a'.repeat(170) + '/exec' }), { ok: false, error: 'url' }));
check('short team key -> team key', eq(mb({ key: 'short' }), { ok: false, error: 'team key' }));
check('team key over 64 -> team key', eq(mb({ key: 'k'.repeat(65) }), { ok: false, error: 'team key' }));
check('no team key and no row yet -> team key', eq(mb({ key: '' }), { ok: false, error: 'team key' }));
check('no Mailboxes row after refusals', rowsOf('Mailboxes').length === 0);
r = mb({});
check('mailboxSet ok', r.ok === true && r.mailbox.url === URL_A && r.mailbox.key === TKEY_A && r.mailbox.setBy === JUAN && r.mailbox.account === JUAN, r);
let br = rowsOf('Mailboxes');
check('Mailboxes row: company, url, key, set up by, account, checked, working', br.length === 1 && br[0].Company === CO_A && br[0]['Web app address'] === URL_A && br[0].Key === TKEY_A
  && br[0]['Set up by'] === JUAN && br[0]['Google account'] === JUAN && /^\d{4}-/.test(br[0].Checked) && br[0].Status === 'working', br);
r = mb({ url: URL_A2, key: '' });
br = rowsOf('Mailboxes');
check('mailboxSet again (no key sent): upsert, one row, key kept', br.length === 1 && br[0]['Web app address'] === URL_A2 && br[0].Key === TKEY_A, br);

section('team snapshots by role');
r = post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN });
check('Coordinator: me, members (asked), mailbox', r.ok && r.verified && eq(r.me, { role: 'Coordinator', regions: 'MIN, VIS', name: 'Juan Dela Cruz', ask: '' })
  && eq(r.members, [{ email: PEDRO, name: 'Pedro Santos', role: 'Field Partner', regions: 'MIN', status: 'asked' }])
  && r.mailbox && r.mailbox.url === URL_A2 && r.mailbox.key === TKEY_A && r.mailbox.setBy === JUAN && r.mailbox.account === JUAN && !!r.mailbox.checked && r.mailboxSet === true, r);
check('Coordinator: coordinators list', eq(r.coordinators, [{ email: JUAN, name: 'Juan Dela Cruz', regions: 'MIN, VIS' }]));
check('Coordinator unverified: no mailbox, and (v2.43.2) no members either', (() => { const x = post(gs, { action: 'team', ckey: KEY_A, email: JUAN }); return x.mailbox === null && x.mailboxSet === true && x.members.length === 0 && x.me === null; })());
r = post(gs, { action: 'team', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO });
check('Field Partner asked: myTeams asked, no mailbox, mailboxSet true', eq(r.myTeams, [{ coordinator: JUAN, name: 'Juan Dela Cruz', status: 'asked', approved: true }]) && r.mailbox === null && r.mailboxSet === true && eq(r.members, []), r);
r = post(gs, { action: 'teamAnswer', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, member: PEDRO, accept: true });
check('teamAnswer accept -> in', eq(r, { ok: true, status: 'in' }), r);
r = post(gs, { action: 'team', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO });
check('Field Partner in: mailbox with url and key', r.mailbox && r.mailbox.url === URL_A2 && r.mailbox.key === TKEY_A && r.myTeams[0].status === 'in', r);
check('Field Partner in but unverified: no mailbox', post(gs, { action: 'team', ckey: KEY_A, email: PEDRO }).mailbox === null);
r = post(gs, { action: 'team', ckey: KEY_A, email: MARIA, tok: TOK_MARIA });
check('On my own: me, no members, no mailbox', eq(r.me, { role: 'On my own', regions: 'MIN', name: 'Maria Garcia', ask: '' }) && eq(r.members, []) && eq(r.myTeams, []) && r.mailbox === null && r.mailboxSet === true, r);
// declined
post(gs, { action: 'teamJoin', ckey: KEY_A, email: MARIA, tok: TOK_MARIA, name: 'Maria Garcia', coordinator: JUAN });
r = post(gs, { action: 'teamAnswer', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, member: MARIA, accept: false });
check('teamAnswer decline -> declined', eq(r, { ok: true, status: 'declined' }), r);
r = post(gs, { action: 'team', ckey: KEY_A, email: MARIA, tok: TOK_MARIA });
check('declined: myTeams declined, no mailbox', eq(r.myTeams, [{ coordinator: JUAN, name: 'Juan Dela Cruz', status: 'declined', approved: true }]) && r.mailbox === null, r);
check('Coordinator sees both members with status', eq(post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN }).members.map((x) => x.email + ':' + x.status), [PEDRO + ':in', MARIA + ':declined']));
r = post(gs, { action: 'teamJoin', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, name: 'Pedro Santos', coordinator: JUAN });
check('teamJoin when already in -> stays in', eq(r, { ok: true, status: 'in' }) && rowsOf('TeamLinks').find((x) => x['Member email'] === PEDRO).Status === 'in');

section('mailboxKey');
check('mailboxKey by a Field Partner -> role', eq(post(gs, { action: 'mailboxKey', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, key: TKEY_A2 }), { ok: false, error: 'role' }));
check('mailboxKey bad key -> team key', eq(post(gs, { action: 'mailboxKey', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, key: 'x y z' }), { ok: false, error: 'team key' }));
r = post(gs, { action: 'mailboxKey', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, key: TKEY_A2 });
check('mailboxKey ok: key replaced, url kept', eq(r, { ok: true }) && rowsOf('Mailboxes')[0].Key === TKEY_A2 && rowsOf('Mailboxes')[0]['Web app address'] === URL_A2);
check('member sees the new key', post(gs, { action: 'team', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO }).mailbox.key === TKEY_A2);

section('teamRemove / teamLeave');
check('teamRemove by a Field Partner -> role', eq(post(gs, { action: 'teamRemove', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, member: PEDRO }), { ok: false, error: 'role' }));
r = post(gs, { action: 'teamRemove', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, member: PEDRO });
check('teamRemove -> removed', eq(r, { ok: true, status: 'removed' }), r);
r = post(gs, { action: 'team', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO });
check('removed member loses the mailbox', r.mailbox === null && r.myTeams[0].status === 'removed' && r.mailboxSet === true, r);
check('teamAnswer on a removed link -> link (must ask again)', eq(post(gs, { action: 'teamAnswer', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, member: PEDRO, accept: true }), { ok: false, error: 'link' }));
check('ask again -> asked; accept -> in; one link row', post(gs, { action: 'teamJoin', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, coordinator: JUAN }).status === 'asked'
  && post(gs, { action: 'teamAnswer', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, member: PEDRO, accept: 'true' }).status === 'in'
  && rowsOf('TeamLinks').filter((x) => x['Member email'] === PEDRO).length === 1);
check('member back in: mailbox again', !!post(gs, { action: 'team', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO }).mailbox);
check('teamLeave with no such link -> link', eq(post(gs, { action: 'teamLeave', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, coordinator: MARIA }), { ok: false, error: 'link' }));
check('teamLeave without tok -> tok', eq(post(gs, { action: 'teamLeave', ckey: KEY_A, email: PEDRO, coordinator: JUAN }), { ok: false, error: 'tok' }));
r = post(gs, { action: 'teamLeave', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, coordinator: JUAN });
check('teamLeave -> left', eq(r, { ok: true, status: 'left' }), r);
r = post(gs, { action: 'team', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO });
check('left: no mailbox; Coordinator sees left', r.mailbox === null && r.myTeams[0].status === 'left'
  && post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN }).members.find((x) => x.email === PEDRO).status === 'left', r);
// back in, for the isolation checks
post(gs, { action: 'teamJoin', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, coordinator: JUAN });
post(gs, { action: 'teamAnswer', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, member: PEDRO, accept: true });

section('company isolation');
r = post(gs, { action: 'team', ckey: KEY_B, email: JUAN, tok: TOK_JUAN });
check('B key + A\'s email/tok: not verified, no A rows, no A mailbox', r.ok && r.company === CO_B && r.verified === false && r.me === null && eq(r.coordinators, []) && eq(r.myTeams, []) && eq(r.members, []) && r.mailbox === null && r.mailboxSet === false, r);
check('A\'s tok with B\'s key cannot write -> tok', eq(post(gs, { action: 'teamRole', ckey: KEY_B, email: JUAN, tok: TOK_JUAN, role: 'Coordinator' }), { ok: false, error: 'tok' }));
check('Ana (B) becomes Coordinator (asked, then approved by the admin)', post(gs, { action: 'teamRole', ckey: KEY_B, email: ANA, tok: TOK_ANA, name: 'Ana Reyes', role: 'Coordinator', regions: 'VIS' }).me.ask === 'asked'
  && post(gs, { action: 'teamCoordSet', key: ADMIN_KEY, company: CO_B, email: ANA, approve: true }).ok);
check('Ana (B) cannot join Juan (A\'s Coordinator) -> role', eq(post(gs, { action: 'teamJoin', ckey: KEY_B, email: ANA, tok: TOK_ANA, coordinator: JUAN }), { ok: false, error: 'role' }));
check('Ana (B) cannot answer for A\'s member -> link', eq(post(gs, { action: 'teamAnswer', ckey: KEY_B, email: ANA, tok: TOK_ANA, member: PEDRO, accept: true }), { ok: false, error: 'link' }));
r = post(gs, { action: 'team', ckey: KEY_B, email: ANA, tok: TOK_ANA });
check('B Coordinator before B mailbox: sees only B, mailboxSet false', eq(r.coordinators, [{ email: ANA, name: 'Ana Reyes', regions: 'VIS' }]) && eq(r.members, []) && r.mailbox === null && r.mailboxSet === false, r);
r = post(gs, { action: 'mailboxSet', ckey: KEY_B, email: ANA, tok: TOK_ANA, url: URL_B, key: TKEY_B, account: ANA });
check('B mailboxSet: its own row', r.ok && rowsOf('Mailboxes').length === 2 && rowsOf('Mailboxes')[1].Company === CO_B);
check('A still sees only A\'s mailbox', post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN }).mailbox.url === URL_A2);
check('B sees only B\'s mailbox', (() => { const x = post(gs, { action: 'team', ckey: KEY_B, email: ANA, tok: TOK_ANA }); return x.mailbox.url === URL_B && x.mailbox.key === TKEY_B; })());
check('Pedro\'s email with B\'s key: nothing of A', (() => { const x = post(gs, { action: 'team', ckey: KEY_B, email: PEDRO, tok: TOK_PEDRO }); return x.me === null && eq(x.myTeams, []) && x.mailbox === null && JSON.stringify(x).indexOf(URL_A2) < 0 && JSON.stringify(x).indexOf(TKEY_A2) < 0; })());
check('B\'s answers never contain A\'s url, key or people', (() => { const j = JSON.stringify(post(gs, { action: 'team', ckey: KEY_B, email: ANA, tok: TOK_ANA })); return [URL_A, URL_A2, TKEY_A, TKEY_A2, JUAN, PEDRO, MARIA].every((x) => j.indexOf(x) < 0); })());
check('mailboxKey by A does not touch B', post(gs, { action: 'mailboxKey', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, key: TKEY_A }).ok && rowsOf('Mailboxes')[1].Key === TKEY_B);

section('the sheet wins (hand edits) and moved columns');
const team = tab('Team');
const mariaRow = team.rowsAsText().findIndex((x) => x[1] === MARIA) + 1;
team.getRange(mariaRow, 4).setValue('  coordinator ');
check('Role typed by hand "coordinator": asked for until Approved is Yes', (() => { const x = post(gs, { action: 'team', ckey: KEY_A, email: MARIA, tok: TOK_MARIA }).me; return x.role === 'On my own' && x.ask === 'asked'; })());
team.getRange(mariaRow, 7).setValue(' yes ');
check('Role "coordinator" and Approved "yes" typed by hand count as an approved Coordinator (the sheet wins)', post(gs, { action: 'team', ckey: KEY_A, email: MARIA, tok: TOK_MARIA }).me.role === 'Coordinator');
team.getRange(mariaRow, 7).setValue('');
team.getRange(mariaRow, 4).setValue('');
check('blank Role = On my own', post(gs, { action: 'team', ckey: KEY_A, email: MARIA, tok: TOK_MARIA }).me.role === 'On my own');
team.getRange(mariaRow, 1).setValue('Demo Contractor Inc.');
check('Company typed as "Demo Contractor Inc." still matches (normCo_)', post(gs, { action: 'team', ckey: KEY_A, email: MARIA, tok: TOK_MARIA }).me !== null);
const snapBefore = post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN });
// reverse the column order of Team and TeamLinks (the admin moved the columns)
['Team', 'TeamLinks', 'Mailboxes'].forEach((n) => { const sh = tab(n), w = sh.getLastColumn(); sh.data = sh.data.map((row) => { const full = Array.from({ length: w }, (_, i) => (row[i] === undefined ? '' : row[i])); return full.reverse(); }); });
check('columns moved: Team header reversed', header('Team')[0] === 'Approved (Yes / No)' && header('Team')[1] === 'Updated');
const snapAfter = post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN });
check('columns moved: same snapshot', eq(snapBefore, snapAfter), snapAfter);
post(gs, { action: 'teamRole', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, name: 'Pedro Santos', role: 'Field Partner', regions: 'MIN, NCR' });
const pr = rowsOf('Team').find((x) => x.Email === PEDRO);
check('columns moved: teamRole writes the right columns', pr.Regions === 'MIN, NCR' && pr.Role === 'Field Partner' && pr.Name === 'Pedro Santos' && pr.Company === CO_A, pr);
// delete the Updated column of Team (now the second column)
team.data = team.data.map((row) => row.filter((_, i) => i !== 1));
post(gs, { action: 'teamRole', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO, role: 'Field Partner' });
check('a deleted column is added back at the end with its header', header('Team')[header('Team').length - 1] === 'Updated' && /^\d{4}-/.test(rowsOf('Team').find((x) => x.Email === PEDRO).Updated), header('Team'));
check('the other rows are untouched by that', rowsOf('Team').find((x) => x.Email === JUAN).Role === 'Coordinator');

section('missing tabs, lock, robustness');
const savedLinks = world.ss.sheets.find((s) => s.name === 'TeamLinks');
world.ss.sheets = world.ss.sheets.filter((s) => s.name !== 'TeamLinks');
check('team with no TeamLinks tab: answers (empty lists)', (() => { const x = post(gs, { action: 'team', ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO }); return x.ok && eq(x.myTeams, []) && x.mailbox === null; })());
r = post(gs, { action: 'teamJoin', ckey: KEY_A, email: MARIA, tok: TOK_MARIA, coordinator: JUAN });
check('a write makes the missing tab again (with its header)', r.ok && eq(header('TeamLinks'), ['Company', 'Coordinator email', 'Member email', 'Status', 'Updated']) && tab('TeamLinks').frozen === 1, r);
world.ss.sheets = world.ss.sheets.filter((s) => s.name !== 'TeamLinks'); world.ss.sheets.push(savedLinks);
world.lockBusy = true;
check('a write while the lock is busy -> busy', eq(post(gs, { action: 'teamRole', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, role: 'Coordinator' }), { ok: false, error: 'busy' }));
check('a read while the lock is busy still answers', post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN }).ok === true);
world.lockBusy = false;
const realGet = world.ss.getSheetByName;
world.ss.getSheetByName = function (n) { if (n === 'Mailboxes') throw new Error('simulated Sheets failure'); return realGet.call(this, n); };
check('an unexpected error -> server (no throw)', eq(post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN }), { ok: false, error: 'server' }));
world.ss.getSheetByName = realGet;
check('scriptLink comes from Settings', (() => {
  const st = tab('Settings'), i = st.rowsAsText().findIndex((x) => x[0] === 'Mailbox script link') + 1;
  st.getRange(i, 2).setValue('https://script.google.com/d/DemoMasterMailboxScript/edit');
  return post(gs, { action: 'team', ckey: KEY_A, email: PEDRO }).scriptLink === 'https://script.google.com/d/DemoMasterMailboxScript/edit';
})());
gs.resetTeamTokens();
check('resetTeamTokens: old tok no longer verified', post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN }).verified === false
  && eq(post(gs, { action: 'teamRole', ckey: KEY_A, email: JUAN, tok: TOK_JUAN, role: 'Coordinator' }), { ok: false, error: 'tok' }));

section('QA-17: Team switched off and on again (company A, with its teams and mailbox)');
const ACTS = ['teamCode', 'teamVerify', 'team', 'teamRole', 'teamJoin', 'teamAnswer', 'teamRemove', 'teamLeave', 'mailboxSet', 'mailboxKey'];
advance(601); const TOK_J2 = verify(KEY_A, JUAN); // a new confirmation after resetTeamTokens (above)
const snapA = () => post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_J2 });
const tabsNow = () => JSON.stringify(['Team', 'TeamLinks', 'Mailboxes'].map((n) => tab(n).rowsAsText()));
const beforeOff = snapA(), tabsBefore = tabsNow(), mailBefore = world.mail.length;
check('A on: Juan\'s team answer is ok (teamOn true, confirmed, Coordinator, a member, the mailbox)', beforeOff.ok && beforeOff.teamOn === true && beforeOff.verified && beforeOff.me.role === 'Coordinator' && beforeOff.members.length > 0 && !!beforeOff.mailbox && beforeOff.mailbox.url === URL_A2, beforeOff);
const setTeamA = (v) => tab('CompanyKeys').getRange(2, 4).setValue(v);
setTeamA('No');
check('A = No: every team action answers off (with a confirmed email too)', ACTS.every((a) => eq(post(gs, { action: a, ckey: KEY_A, email: JUAN, tok: TOK_JUAN, role: 'Coordinator', member: PEDRO, coordinator: JUAN, url: URL_A, key: TKEY_A, code: '123456' }), { ok: false, error: 'off' })) && eq(post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_J2 }), { ok: false, error: 'off' }));
check('A = No: no mailbox address or key in any answer', ACTS.every((a) => JSON.stringify(post(gs, { action: a, ckey: KEY_A, email: PEDRO, tok: TOK_PEDRO })).indexOf(URL_A) < 0));
check('A = No: no code emailed', world.mail.length === mailBefore);
check('A = No: the Team, TeamLinks and Mailboxes rows are kept as they were', tabsNow() === tabsBefore);
check('A = No: the sync answer says teamOn false; the rest of the read is unchanged', (() => { const g1 = get(gs, { ckey: KEY_A, v: '2.43.0' }); return g1.ok && g1.teamOn === false && g1.you === CO_A && g1.tasks.length === 2; })());
check('A = No: company B is still on', post(gs, { action: 'team', ckey: KEY_B, email: ANA, tok: TOK_ANA }).ok === true);
check('a bad key still answers key (not off)', eq(post(gs, { action: 'team', ckey: 'ZZZZ-ZZZZ-ZZZZ', email: JUAN }), { ok: false, error: 'key' }));
setTeamA('');
check('A blank: off too', eq(post(gs, { action: 'team', ckey: KEY_A, email: JUAN, tok: TOK_JUAN }), { ok: false, error: 'off' }) && get(gs, { ckey: KEY_A, v: '2.43.0' }).teamOn === false);
setTeamA('Yes');
const afterOn = snapA();
check('A = Yes again: Juan\'s team answer is the same as before (role, members, mailbox)', eq(afterOn, beforeOff), { before: beforeOff, after: afterOn });
check('A = Yes again: the sync answer says teamOn true', get(gs, { ckey: KEY_A, v: '2.43.0' }).teamOn === true);
check('the admin company (Team blank): off', eq(post(gs, { action: 'team', ckey: KEY_ADMIN, email: INSPECTOR }), { ok: false, error: 'off' }) && get(gs, { ckey: KEY_ADMIN, v: '2.43.0' }).teamOn === false);
check('the Read key alone (no company key): Team not on', get(gs, { key: READ_KEY, company: CO_A, v: '2.43.0' }).teamOn !== true);
check('a version that is not a number (or none): no teamOn field', !('teamOn' in get(gs, { ckey: KEY_A, v: 'beta' })) && !('teamOn' in get(gs, { ckey: KEY_A })));

section('QA-17: a G-eSAA 2.42.28 phone against v2.43.1 (its own requests: the same answers as v2.42.18 gave)');
{ // the read v2.42.28 sends (cloudRequest): key, v, company, ckey, email, area, logoat, region, terr
  const p28 = { key: READ_KEY, v: '2.42.28', company: CO_A, ckey: KEY_A, email: JUAN, area: '1', logoat: '', region: 'MIN', terr: 'T1' };
  const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.updated; return c; };
  const a = strip(get(base, p28)), b = strip(get(gs, p28));
  check('2.42.28 sync read: the same answer, no teamOn', eq(a, b) && !('teamOn' in b), { base: a, v2431: b });
  const p28b = { key: READ_KEY, v: '2.42.28', company: CO_B, ckey: KEY_B, area: '1', logoat: '' };
  check('2.42.28 sync read (company B): the same answer', eq(strip(get(base, p28b)), strip(get(gs, p28b))));
  check('2.42.28 probe: the same answer', eq(get(base, { probe: '1', v: '2.42.28' }), get(gs, { probe: '1', v: '2.42.28' })));
  const same = (label, body) => { const x = post(base, body), y = post(gs, body); check(label, eq(x, y), { base: x, v2431: y }); };
  same('2.42.28 progress for a task that is not there: the same answer', { action: 'progress', updates: [{ id: 'T-NOPE0001', field: 'surveyStart', date: '2026-11-10' }], ckey: KEY_A });
  same('2.42.28 credit (Credits off): the same answer', { action: 'credit', email: JUAN, ckey: KEY_A, project: 'Demo', pkey: 'k1', m: 120, kind: 'kmz' });
  same('2.42.28 redeemInvite with a wrong code: the same answer', { action: 'redeemInvite', code: 'NOPE1234', company: CO_A });
  same('2.42.28 adminVerify with no code asked: the same answer', { action: 'adminVerify', ckey: KEY_A, email: INSPECTOR, code: '000000' });
  same('2.42.28 setLogo with a bad picture: the same answer', { action: 'setLogo', ckey: KEY_A, company: CO_A, type: 'image/gif', data: 'x' });
  check('2.42.28 makeInvite (coworker, company key): the same shape', (() => { const x = post(base, { action: 'makeInvite', ckey: KEY_A, by: JUAN }), y = post(gs, { action: 'makeInvite', ckey: KEY_A, by: JUAN });
    return x.ok === y.ok && JSON.stringify(Object.keys(x).sort()) === JSON.stringify(Object.keys(y).sort()); })());
}

section('regression: existing actions answer as before (v2.42.18 vs v2.43, same spreadsheet)');
const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.updated; return c; };
const cmpGet = (label, params) => { const a = strip(get(base, params)), b = strip(get(gs, params)); check(label, eq(a, b), { base: a, v243: b }); return b; };
let g = cmpGet('doGet with a company key: same answer', { ckey: KEY_A });
check('doGet with company key A: ok, its own tasks only, you = DEMO CONTRACTOR', g.ok && g.scope === 'company' && g.you === CO_A && g.tasks.every((t) => t.company === CO_A || t.company === '') && g.tasks.length === 2, g);
cmpGet('doGet with company key B: same answer', { ckey: KEY_B, region: 'MIN', terr: 'T1' });
cmpGet('doGet with the admin company key: same answer', { ckey: KEY_ADMIN });
g = cmpGet('doGet with no key: same answer', {});
check('doGet with no key -> key', eq(g, { ok: false, error: 'key' }));
check('doGet with a bad company key -> company key', eq(get(gs, { ckey: 'BADB-ADBA-DBAD' }), { ok: false, error: 'company key' }));
cmpGet('doGet probe: same answer', { probe: '1' });
cmpGet('doGet with the Read key and a company: same answer', { key: READ_KEY, company: CO_A });
cmpGet('doGet with the Admin key (adminUsers): same answer', { key: READ_KEY, akey: ADMIN_KEY });
const cmpPost = (label, body) => { const a = post(base, body), b = post(gs, body); check(label, eq(a, b), { base: a, v243: b }); return b; };
r = cmpPost('adminCode for a non-admin email: same answer', { action: 'adminCode', ckey: KEY_A, email: MARIA });
check('adminCode for a non-admin email -> sent:false, no mail', eq(r, { ok: true, sent: false }));
r = cmpPost('Admin-key action with a wrong key: same answer', { action: 'setPacks', key: 'wrong-admin-key', packs: [] });
check('Admin-key action with a wrong key -> key', eq(r, { ok: false, error: 'key' }));
cmpPost('addCompanies with a wrong key: same answer', { action: 'addCompanies', key: 'nope', companies: ['X'] });
r = cmpPost('unknown action with the Admin key: same answer', { action: 'noSuchAction', key: ADMIN_KEY });
check('unknown action with the Admin key -> action', eq(r, { ok: false, error: 'action' }));
check('bad request body -> bad request (both)', ['{oops', ''].every((c) => JSON.parse(gs.doPost({ postData: { contents: c } }).getContent()).error === 'bad request'
  && JSON.parse(base.doPost({ postData: { contents: c } }).getContent()).error === 'bad request'));
r = cmpPost('setPacks with the Admin key: same answer', { action: 'setPacks', key: ADMIN_KEY, packs: [{ name: 'Demo pack', link: 'https://drive.google.com/file/d/DEMOFILEID1234567890abc/view', sizeMB: 12 }] });
check('setPacks with the Admin key -> ok, 1 pack', eq(r, { ok: true, packs: 1 }));
check('makeMove with a company key: same shape', (() => { const a = post(base, { action: 'makeMove', ckey: KEY_A, mv: 'abcdefgh12345678' }), b = post(gs, { action: 'makeMove', ckey: KEY_A, mv: 'abcdefgh12345678' });
  return a.ok && b.ok && a.code.length === 14 && b.code.length === 14 && a.hours === b.hours; })());
check('older code sends team actions to the Admin-key gate (unchanged there) -> key', eq(post(base, { action: 'team', ckey: KEY_A, email: JUAN }), { ok: false, error: 'key' }));
check('the new tabs do not change what doGet sends', (() => { const a = strip(get(base, { ckey: KEY_A })); return JSON.stringify(a).indexOf('Mailbox') < 0 && JSON.stringify(a).indexOf(TKEY_A) < 0; })());
check('all locks released', world.lockHeld === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
