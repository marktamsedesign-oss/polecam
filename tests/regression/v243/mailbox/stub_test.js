// Runs the G-eSAA Mailbox Code.gs against an in-memory stand-in for the Drive REST API and the Apps Script
// services it uses. No network. Synthetic data only. Prints PASS/FAIL per check; exits 1 on any failure.
//   node stub_test.js
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const DIR = __dirname;

// ---------------------------------------------------------------------------------------------- results
let passed = 0, failed = 0;
function check(name, cond, info) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (info !== undefined ? '  -> ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : '')); }
}
function section(s) { console.log('\n== ' + s); }

// ---------------------------------------------------------------------------------------------- fake clock
let NOW = Date.parse('2026-11-09T00:00:00.000Z');
const realNow = Date.now;
Date.now = () => NOW;
const H = 3600e3, D = 24 * H;
const iso = (ms) => new Date(ms).toISOString();

// ---------------------------------------------------------------------------------------------- Apps Script stubs
const props = {};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
    setProperty: (k, v) => { props[k] = String(v); return this; },
    deleteProperty: (k) => { delete props[k]; },
    getProperties: () => Object.assign({}, props),
    getKeys: () => Object.keys(props),
  }),
};
const LOCK = { busy: false, held: false, taken: 0, nestedBad: 0 };
global.LockService = {
  getScriptLock: () => ({
    tryLock: () => { if (LOCK.busy) return false; if (LOCK.held) LOCK.nestedBad++; LOCK.held = true; LOCK.taken++; return true; },
    waitLock: () => { throw new Error('waitLock not expected'); },
    releaseLock: () => { LOCK.held = false; },
    hasLock: () => LOCK.held,
  }),
};
global.ScriptApp = { getOAuthToken: () => 'TOKEN' };
const toBuf = (a) => Buffer.from(Array.from(a, (b) => b & 255));
const signed = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
global.Utilities = {
  base64Decode: (s) => signed(Buffer.from(s, 'base64')),
  base64Encode: (a) => toBuf(a).toString('base64'),
  newBlob: (s) => ({ getBytes: () => signed(Buffer.from(s, 'utf8')) }),
  computeDigest: (alg, s, cs) => {
    if (alg !== 'SHA_256' || cs !== 'UTF_8') throw new Error('digest args');
    return signed(crypto.createHash('sha256').update(String(s), 'utf8').digest());
  },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  sleep: () => {},
};
const LOGS = [];
global.Logger = { log: (s) => LOGS.push(String(s)) };
global.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, mime: null, setMimeType(m) { this.mime = m; return this; } }) };

// ---------------------------------------------------------------------------------------------- Drive stand-in
const FOLDER = 'application/vnd.google-apps.folder';
const DRIVE = { files: {}, seq: 0, sessions: {}, pageSize: 7, quota: { limit: '16106127360', usage: '3865470566', usageInDrive: '1181116006', usageInDriveTrash: '10737418' }, failDelete: new Set() };
const CALLS = [];
let maxUrl = 0, badAuth = 0;

function mkFile(meta, data, opts) {
  const seq = ++DRIVE.seq;
  const id = 'Fx' + String(seq).padStart(8, '0') + 'drv';
  DRIVE.files[id] = {
    id, seq, name: meta.name, mimeType: meta.mimeType || 'application/octet-stream',
    parents: meta.parents && meta.parents.length ? meta.parents.slice() : ['MYDRIVEROOT0'],
    createdTime: iso((opts && opts.created) || NOW), data: data || null, trashed: false, foreign: !!(opts && opts.foreign),
  };
  return DRIVE.files[id];
}
function view(f, fields) {
  const all = { id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents, createdTime: f.createdTime, trashed: f.trashed };
  if (f.mimeType !== FOLDER) all.size = String(f.data ? f.data.length : 0);
  const out = {};
  fields.forEach((k) => { if (all[k] !== undefined) out[k] = all[k]; });
  return out;
}
function resp(code, body, hdr) {
  const isBuf = Buffer.isBuffer(body);
  return {
    getResponseCode: () => code,
    getAllHeaders: () => hdr || {},
    getContentText: () => (isBuf ? body.toString('utf8') : typeof body === 'string' ? body : JSON.stringify(body || {})),
    getContent: () => (isBuf ? Array.from(body) : Array.from(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))),
  };
}
const err = (code, reason) => resp(code, { error: { code, message: reason, errors: [{ reason }] } });
const visible = (f) => f && !f.foreign;

function parseQuery(q) {
  const terms = []; let cur = '', inq = false;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (inq && c === '\\') { cur += c + q[i + 1]; i++; continue; }
    if (c === "'") inq = !inq;
    if (!inq && q.startsWith(' and ', i)) { terms.push(cur); cur = ''; i += 4; continue; }
    cur += c;
  }
  if (inq) throw new Error('unbalanced quote in query: ' + q);
  terms.push(cur);
  const S = "'((?:[^'\\\\]|\\\\.)*)'";
  const un = (s) => s.replace(/\\(.)/g, '$1');
  return terms.map((t) => t.trim()).map((t) => {
    let m;
    if ((m = t.match(new RegExp('^' + S + ' in parents$')))) { const v = un(m[1]); return (f) => f.parents.includes(v); }
    if (/^trashed\s*=\s*false$/.test(t)) return (f) => !f.trashed;
    if ((m = t.match(new RegExp('^name\\s*=\\s*' + S + '$')))) { const v = un(m[1]); return (f) => f.name === v; }
    if ((m = t.match(new RegExp('^name contains ' + S + '$')))) { const v = un(m[1]); return (f) => f.name.startsWith(v); }
    if ((m = t.match(new RegExp('^mimeType\\s*(!=|=)\\s*' + S + '$')))) { const op = m[1], v = un(m[2]); return op === '=' ? (f) => f.mimeType === v : (f) => f.mimeType !== v; }
    if ((m = t.match(new RegExp('^createdTime\\s*<\\s*' + S + '$')))) {
      const v = Date.parse(un(m[1])); if (isNaN(v) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(un(m[1]))) throw new Error('bad time ' + m[1]);
      return (f) => Date.parse(f.createdTime) < v;
    }
    throw new Error('unmodelled query term: ' + t);
  });
}

function parseMultipart(o) {
  const b = (o.contentType.match(/^multipart\/related; boundary=(.+)$/) || [])[1];
  if (!b) throw new Error('no boundary');
  const buf = toBuf(o.payload), s = buf.toString('latin1');
  const first = '--' + b + '\r\n';
  if (!s.startsWith(first)) throw new Error('bad start');
  const h1 = s.indexOf('\r\n\r\n') + 4;
  const sep = s.indexOf('\r\n--' + b + '\r\n', h1);
  const meta = JSON.parse(buf.subarray(h1, sep).toString('utf8'));
  const h2 = s.indexOf('\r\n\r\n', sep + 4) + 4;
  const end = s.lastIndexOf('\r\n--' + b + '--');
  if (end !== s.length - ('\r\n--' + b + '--').length) throw new Error('bad tail');
  return { meta, data: Buffer.from(buf.subarray(h2, end)) };
}

global.UrlFetchApp = {
  fetch: (url, o) => {
    CALLS.push({ method: o.method, url, headers: Object.assign({}, o.headers), contentType: o.contentType });
    maxUrl = Math.max(maxUrl, url.length);
    if (url.length > 2048) throw new Error('Limit Exceeded: URLFetch URL Length.');
    if (o.muteHttpExceptions !== true) throw new Error('muteHttpExceptions not set');
    if (!o.headers || o.headers.Authorization !== 'Bearer TOKEN') { badAuth++; return err(401, 'authError'); }
    const u = new URL(url);
    const fields = (u.searchParams.get('fields') || '');
    const m = u.pathname.match(/^\/(upload\/)?drive\/v3\/files\/([^/]+)$/);

    if (o.method === 'get' && u.pathname === '/drive/v3/about') {
      if (fields !== 'storageQuota') return err(400, 'fields');
      return resp(200, { storageQuota: DRIVE.quota });
    }
    if (o.method === 'post' && u.pathname === '/drive/v3/files') { // metadata-only create (folders)
      const meta = JSON.parse(o.payload);
      if (meta.parents && meta.parents.some((p) => !visible(DRIVE.files[p]))) return err(404, 'notFound');
      const f = mkFile(meta, meta.mimeType === FOLDER ? null : Buffer.alloc(0));
      return resp(200, view(f, fields.split(',')));
    }
    if (o.method === 'post' && u.pathname === '/upload/drive/v3/files') {
      const type = u.searchParams.get('uploadType');
      if (type === 'resumable') {
        const meta = JSON.parse(o.payload);
        const len = o.headers['X-Upload-Content-Length'];
        if (!/^\d+$/.test(len || '') || !o.headers['X-Upload-Content-Type']) return err(400, 'missing upload headers');
        if (!meta.parents || !visible(DRIVE.files[meta.parents[0]])) return err(404, 'notFound');
        const uid = 'U' + (++DRIVE.seq);
        DRIVE.sessions[uid] = { meta, size: Number(len), origin: o.headers.Origin || null };
        return resp(200, '', { Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=' + uid });
      }
      if (type === 'multipart') {
        const { meta, data } = parseMultipart(o);
        if (!meta.parents || !visible(DRIVE.files[meta.parents[0]]) || DRIVE.files[meta.parents[0]].mimeType !== FOLDER) return err(404, 'notFound');
        const f = mkFile(meta, data);
        return resp(200, view(f, fields.split(',')));
      }
      return err(400, 'uploadType');
    }
    if (m && !m[1]) {
      const id = decodeURIComponent(m[2]), f = DRIVE.files[id];
      if (!visible(f)) return err(404, 'notFound');
      if (o.method === 'get' && u.searchParams.get('alt') === 'media') {
        if (f.mimeType === FOLDER) return err(403, 'fileNotDownloadable');
        const rg = o.headers.Range;
        if (rg) {
          const mm = rg.match(/^bytes=(\d+)-(\d+)$/); if (!mm) return err(400, 'range');
          const a = Number(mm[1]), b = Number(mm[2]);
          if (a >= f.data.length) return err(416, 'range');
          return resp(206, f.data.subarray(a, Math.min(b, f.data.length - 1) + 1));
        }
        return resp(200, f.data);
      }
      if (o.method === 'get') { if (!fields) return err(400, 'fields'); return resp(200, view(f, fields.split(','))); }
      if (o.method === 'delete') {
        if (DRIVE.failDelete.has(id)) return err(500, 'backendError');
        const kill = (x) => { Object.values(DRIVE.files).filter((c) => c.parents.includes(x)).forEach((c) => kill(c.id)); delete DRIVE.files[x]; };
        kill(id);
        return resp(204, '');
      }
      return err(400, 'unhandled ' + o.method);
    }
    if (o.method === 'get' && u.pathname === '/drive/v3/files') {
      let filters;
      try { filters = parseQuery(u.searchParams.get('q') || ''); } catch (e) { return err(400, e.message); }
      const ob = u.searchParams.get('orderBy');
      if (ob && ob !== 'createdTime') return err(400, 'orderBy');
      const ps = Number(u.searchParams.get('pageSize') || 100);
      if (!(ps >= 1 && ps <= 1000)) return err(400, 'pageSize');
      const fm = fields.match(/^nextPageToken,files\(([^)]+)\)$/);
      if (!fm) return err(400, 'fields ' + fields);
      let list = Object.values(DRIVE.files).filter(visible).filter((f) => filters.every((fn) => fn(f)));
      if (ob) list.sort((a, b) => (a.createdTime < b.createdTime ? -1 : a.createdTime > b.createdTime ? 1 : a.seq - b.seq));
      const start = Number(u.searchParams.get('pageToken') || 0), size = Math.min(ps, DRIVE.pageSize);
      const page = list.slice(start, start + size);
      const out = { files: page.map((f) => view(f, fm[1].split(','))) };
      if (start + size < list.length) out.nextPageToken = String(start + size);
      return resp(200, out);
    }
    if (o.method === 'patch') return err(400, 'PATCH not modelled (not expected)');
    return err(400, 'unhandled ' + o.method + ' ' + url);
  },
};

/** What the phone does with a session address: PUT the bytes straight to Google. */
function phoneUpload(url, buf) {
  const s = DRIVE.sessions[new URL(url).searchParams.get('upload_id')];
  if (!s) throw new Error('no session');
  if (buf.length !== s.size) throw new Error('size differs from X-Upload-Content-Length');
  return mkFile(s.meta, buf);
}

// ---------------------------------------------------------------------------------------------- load Code.gs
const SRC = fs.readFileSync(path.join(DIR, 'Code.gs'), 'utf8');
const G = vm.runInThisContext(SRC + '\n;({ doPost, doGet, setup, resetKey, q_, LIMIT })', { filename: 'Code.gs' });

function post(q) {
  if (q && typeof q === 'object' && 'a' in q) { q = Object.assign({}, q); q.action = q.a; delete q.a; } // the app sends `action`
  return raw(q);
}
function raw(q) {
  const before = CALLS.length;
  const out = G.doPost({ postData: { contents: typeof q === 'string' ? q : JSON.stringify(q) } });
  const r = JSON.parse(out.t);
  r.__calls = CALLS.length - before;
  r.__mime = out.mime;
  return r;
}
const byName = (name) => Object.values(DRIVE.files).filter((f) => f.name === name);
const inFolder = (fid) => Object.values(DRIVE.files).filter((f) => f.parents.includes(fid));
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const rnd = (n) => crypto.randomBytes(n);
const b64 = (buf) => buf.toString('base64');
const errIs = (r, code) => r.ok === false && r.error === code;
const isOutside = (r) => errIs(r, 'id') && r.detail === 'not in the mailbox';

const KEY1 = 'K1-' + 'a'.repeat(30), KEY2 = 'K2-' + 'b'.repeat(30), KEY3 = 'K3-' + 'c'.repeat(30);
let K = KEY1;

// =============================================================================================== static checks
section('Source and manifest');
check('Code.gs parses as a script', (() => { try { new Function(SRC); return true; } catch (e) { return false; } })());
check('no DriveApp / MailApp / GmailApp / triggers in code', !/\b(DriveApp|MailApp|GmailApp|newTrigger)\s*\./.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
const man = JSON.parse(fs.readFileSync(path.join(DIR, 'appsscript.json'), 'utf8'));
check('appsscript.json: timeZone Asia/Manila', man.timeZone === 'Asia/Manila');
check('appsscript.json: runtime V8', man.runtimeVersion === 'V8');
check('appsscript.json: exactly drive.file + script.external_request',
  JSON.stringify((man.oauthScopes || []).slice().sort()) === JSON.stringify(['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/script.external_request']));
check('appsscript.json: the Drive advanced service (only to turn the Drive API on), v3', JSON.stringify((man.dependencies || {}).enabledAdvancedServices) === JSON.stringify([{ userSymbol: 'Drive', serviceId: 'drive', version: 'v3' }]));
check('appsscript.json: web app as deploying user, anyone anonymous', man.webapp && man.webapp.executeAs === 'USER_DEPLOYING' && man.webapp.access === 'ANYONE_ANONYMOUS');
check('q_ escapes quote and backslash for Drive queries', G.q_("a'b\\c") === "a\\'b\\\\c", G.q_("a'b\\c"));

// =============================================================================================== setup / key
section('Setup and key');
G.setup();
const ROOT = props['folder.root'];
check('setup() made the folder "G-eSAA mailbox" in My Drive', ROOT && DRIVE.files[ROOT] && DRIVE.files[ROOT].name === 'G-eSAA mailbox' && DRIVE.files[ROOT].mimeType === FOLDER && DRIVE.files[ROOT].parents[0] === 'MYDRIVEROOT0');
const PROG = props['folder.progress'];
check('setup() made _progress inside it', PROG && DRIVE.files[PROG].name === '_progress' && DRIVE.files[PROG].parents[0] === ROOT);
check('setup() logs "Mailbox ready" and the next step', LOGS.some((l) => /^Mailbox ready/.test(l)) && LOGS.some((l) => /Deploy > New deployment/.test(l)), LOGS);
G.setup();
check('setup() again makes no second folder', byName('G-eSAA mailbox').length === 1 && byName('_progress').length === 1);

let r = post({ a: 'hello' });
check('hello (no key): ok, app, v:1, claimed false, folder name', r.ok && r.app === 'G-eSAA mailbox' && r.v === 1 && r.claimed === false && r.folder === 'G-eSAA mailbox' && !('keyOk' in r), r);
check('hello: answer is JSON and has g = UrlFetch calls made', r.__mime === 'json' && r.g === r.__calls && r.g === 1, r);
check('doGet shows the mailbox without secrets', (() => { const o = JSON.parse(G.doGet().t); return o.ok && o.app === 'G-eSAA mailbox' && o.claimed === false && !JSON.stringify(o).includes('hash'); })());
r = post({ a: 'list', k: KEY1, box: 'a@b.co' });
check('before claim: list -> unclaimed', errIs(r, 'unclaimed') && r.g === 0, r);
r = post({ a: 'claim', k: 'short-key' });
check('claim with a key under 24 chars -> weak', errIs(r, 'weak'), r);
LOCK.busy = true; r = post({ a: 'claim', k: KEY1 }); LOCK.busy = false;
check('claim while the lock is busy -> busy (nothing stored)', errIs(r, 'busy') && !props['key.hash'], r);
const lt = LOCK.taken;
r = post({ a: 'claim', k: KEY1 });
check('claim -> {ok, claimed:true}', r.ok && r.claimed === true, r);
check('claim took the script lock', LOCK.taken > lt);
check("key.hash = SHA-256 hex of the key", props['key.hash'] === sha(KEY1), props['key.hash']);
r = post({ a: 'claim', k: KEY1 });
check('claim again with the same key -> ok', r.ok === true, r);
r = post({ a: 'claim', k: KEY2 });
check('claim with another key -> key', errIs(r, 'key') && props['key.hash'] === sha(KEY1), r);
r = post({ a: 'hello', k: KEY1 });
check('hello with right key -> claimed, keyOk true', r.ok && r.claimed === true && r.keyOk === true, r);
r = post({ a: 'hello', k: 'wrong-key-wrong-key-wrong-key' });
check('hello with wrong key -> keyOk false', r.ok && r.keyOk === false, r);
r = post({ a: 'list', k: 'wrong-key-wrong-key-wrong-key', box: 'a@b.co' });
check('wrong key -> {ok:false, error:"key"}, no Drive call', errIs(r, 'key') && r.g === 0, r);
r = post({ a: 'space', box: 'a@b.co' });
check('missing key -> key', errIs(r, 'key'), r);
r = post({ a: 'rekey', k: KEY1, nk: 'tiny' });
check('rekey with a short new key -> weak', errIs(r, 'weak') && props['key.hash'] === sha(KEY1), r);
r = post({ a: 'rekey', k: 'wrong-key-wrong-key-wrong-key', nk: KEY2 });
check('rekey with a wrong key -> key', errIs(r, 'key') && props['key.hash'] === sha(KEY1), r);
r = post({ a: 'rekey', k: KEY1, nk: KEY2 });
check('rekey -> ok, hash replaced', r.ok && props['key.hash'] === sha(KEY2), r);
check('old key now refused', errIs(post({ a: 'space', k: KEY1 }), 'key'));
check('new key works', post({ a: 'space', k: KEY2 }).ok === true);
G.resetKey();
check('resetKey() clears the key and logs the next step', !props['key.hash'] && LOGS.some((l) => /Team key cleared/.test(l)));
r = post({ a: 'hello' });
check('after resetKey: hello says claimed false', r.ok && r.claimed === false, r);
check('after resetKey: other actions -> unclaimed', errIs(post({ a: 'space', k: KEY2 }), 'unclaimed'));
r = post({ a: 'claim', k: KEY3 });
check('after resetKey: claim with a new key -> ok', r.ok && props['key.hash'] === sha(KEY3), r);
K = KEY3;
check('no nested lock taken anywhere so far', LOCK.nestedBad === 0 && LOCK.held === false);

// =============================================================================================== input checks
section('Input checks');
const BOX = 'field.partner@example.com';
const bad = (q, code, name) => { const x = post(Object.assign({ k: K }, q)); check(name + ' -> ' + code, errIs(x, code), x); };
bad({ a: 'nope' }, 'action', 'unknown action');
bad({ a: 'constructor' }, 'action', 'action "constructor" (prototype name)');
bad({ a: 'hasOwnProperty' }, 'action', 'action "hasOwnProperty"');
check('action in field "action" (as the app and the sheet send it)', raw({ action: 'space', k: K }).ok === true);
check('action in field "a" also accepted', raw({ a: 'space', k: K }).ok === true);
check('no action at all -> action', errIs(raw({ k: K }), 'action'));
check('body that is not JSON -> body', errIs(post('not json{'), 'body'));
check('body that is a JSON array -> body', errIs(post('[1,2]'), 'body'));
check('no postData at all -> body (never throws)', (() => { const o = JSON.parse(G.doPost({}).t); return o.ok === false && o.error === 'body' && o.g === 0; })());
bad({ a: 'put', box: '', tid: 'TIDgood01', n: 1, data: 'AAAA' }, 'box', 'empty box');
bad({ a: 'put', box: '_progress', tid: 'TIDgood01', n: 1, data: 'AAAA' }, 'box', 'box "_progress"');
bad({ a: 'put', box: '.hidden@x.co', tid: 'TIDgood01', n: 1, data: 'AAAA' }, 'box', 'box starting with a dot');
bad({ a: 'put', box: "''", tid: 'TIDgood01', n: 1, data: 'AAAA' }, 'box', 'box of quotes only');
bad({ a: 'put', box: 'x'.repeat(121) + '@x.co', tid: 'TIDgood01', n: 1, data: 'AAAA' }, 'box', 'box over 120 chars');
bad({ a: 'put', box: { x: 1 }, tid: 'TIDgood01', n: 1, data: 'AAAA' }, 'box', 'box not a string');
bad({ a: 'put', box: BOX, tid: 'short', n: 1, data: 'AAAA' }, 'tid', 'tid under 8 chars');
bad({ a: 'put', box: BOX, tid: 'has space 123', n: 1, data: 'AAAA' }, 'tid', 'tid with a space');
bad({ a: 'put', box: BOX, tid: "abc'defgh", n: 1, data: 'AAAA' }, 'tid', 'tid with a quote');
bad({ a: 'put', box: BOX, tid: 'T'.repeat(41), n: 1, data: 'AAAA' }, 'tid', 'tid over 40 chars');
bad({ a: 'put', box: BOX, tid: 12345678, n: 1, data: 'AAAA' }, 'tid', 'tid not a string');
bad({ a: 'put', box: BOX, tid: 'TIDgood01', n: 0, data: 'AAAA' }, 'n', 'n = 0');
bad({ a: 'put', box: BOX, tid: 'TIDgood01', n: 1000, data: 'AAAA' }, 'n', 'n = 1000');
bad({ a: 'put', box: BOX, tid: 'TIDgood01', n: 1.5, data: 'AAAA' }, 'n', 'n = 1.5');
bad({ a: 'put', box: BOX, tid: 'TIDgood01', n: 1, data: 'AA*A' }, 'data', 'data not base64');
bad({ a: 'put', box: BOX, tid: 'TIDgood01', n: 1, data: 'AAA' }, 'data', 'data without padding');
bad({ a: 'put', box: BOX, tid: 'TIDgood01', n: 1, data: '' }, 'data', 'empty data');
bad({ a: 'put', box: BOX, tid: 'TIDgood01', n: 1, data: 'A'.repeat(Math.ceil(50 * 1048576 / 3) * 4 + 4) }, 'size', 'data over 50 MB');
bad({ a: 'session', box: BOX, tid: 'TIDgood01', size: 0 }, 'size', 'session size 0');
bad({ a: 'session', box: BOX, tid: 'TIDgood01', size: -5 }, 'size', 'session size negative');
bad({ a: 'session', box: BOX, tid: 'TIDgood01', size: 2048 * 1048576 + 1 }, 'size', 'session size over 2 GB');
bad({ a: 'session', box: BOX, tid: 'TIDgood01', size: 10, origin: 'javascript:alert(1)' }, 'origin', 'session with a bad origin');
bad({ a: 'session', box: BOX, tid: 'TIDgood01', size: 10, origin: 'https://evil.example/path' }, 'origin', 'origin with a path');
bad({ a: 'done', box: BOX, tid: 'TIDgood01', meta: 'x' }, 'meta', 'meta not an object');
bad({ a: 'done', box: BOX, tid: 'TIDgood01', meta: [1] }, 'meta', 'meta an array');
bad({ a: 'done', box: BOX, tid: 'TIDgood01' }, 'meta', 'meta missing');
bad({ a: 'done', box: BOX, tid: 'TIDgood01', meta: { note: 'x'.repeat(8200) } }, 'meta', 'meta over 8 KB');
bad({ a: 'done', box: BOX, tid: 'TIDgood01', meta: { note: 'ñ'.repeat(4091) } }, 'meta', 'meta over 8 KB in UTF-8 bytes (4091 two-byte chars = 8193 bytes)');
check('meta of exactly 8 KB in UTF-8 passes the size check (fails later on parts)', errIs(post({ k: K, a: 'done', box: BOX, tid: 'TIDgood01', meta: { note: 'ñ'.repeat(4090) + 'x' } }), 'parts'));
bad({ a: 'status', tids: 'TIDgood01' }, 'tids', 'status tids not an array');
bad({ a: 'status', tids: Array.from({ length: 101 }, (_, i) => 'TIDxxxx' + String(i).padStart(3, '0')) }, 'tids', 'status with 101 tids');
bad({ a: 'status', tids: ['TIDgood01', 'bad tid'] }, 'tid', 'status with a bad tid');
bad({ a: 'get', id: '../etc' }, 'id', 'get with a bad id');
bad({ a: 'get', id: 123 }, 'id', 'get with a numeric id');
bad({ a: 'progressPut', project: '!!!', who: 'a@b.co', json: '{}' }, 'project', 'progressPut bad project');
bad({ a: 'progressPut', project: 'P1', who: '', json: '{}' }, 'who', 'progressPut bad who');
bad({ a: 'progressPut', project: 'P1', who: 'a@b.co', json: '{nope' }, 'json', 'progressPut invalid JSON');
bad({ a: 'progressPut', project: 'P1', who: 'a@b.co' }, 'json', 'progressPut without json');
bad({ a: 'progressPut', project: 'P1', who: 'a@b.co', json: JSON.stringify({ x: 'y'.repeat(65536) }) }, 'json', 'progressPut over 64 KB');
check('no box folder was made by refused calls', inFolder(ROOT).length === 1, inFolder(ROOT).map((f) => f.name));
check('errors carry g too', post({ k: K, a: 'put', box: '', tid: 'x', n: 1, data: 'A' }).g === 0);

// =============================================================================================== session
section('Session (direct upload)');
const RAWBOX = '  Field.Partner+1@Example.COM ';
const SBOX = 'field.partner1@example.com';
const ORIGIN = 'https://gesaa.example.app';
const whole = rnd(150000);
r = post({ a: 'session', k: K, box: RAWBOX, tid: 'TIDwhole01', size: whole.length, origin: ORIGIN });
const sesCall = CALLS.filter((c) => /uploadType=resumable/.test(c.url)).pop();
check('session -> {ok, url, name:<tid>.gesaa}', r.ok && /upload_id=/.test(r.url) && r.name === 'TIDwhole01.gesaa', r);
check('session sent X-Upload-Content-Length = size', sesCall && sesCall.headers['X-Upload-Content-Length'] === String(whole.length), sesCall && sesCall.headers);
check('session sent X-Upload-Content-Type', sesCall && sesCall.headers['X-Upload-Content-Type'] === 'application/octet-stream');
check('session sent Origin = origin', sesCall && sesCall.headers.Origin === ORIGIN);
const SBOXID = props['b.' + SBOX];
check('box sanitized: lower-case, [a-z0-9._@-] only', SBOXID && DRIVE.files[SBOXID].name === SBOX && DRIVE.files[SBOXID].parents[0] === ROOT, Object.keys(props));
check('box folder made on demand, once', byName(SBOX).length === 1);
const sess = DRIVE.sessions[new URL(r.url).searchParams.get('upload_id')];
check('session file goes into the box folder with the right name', sess.meta.parents[0] === SBOXID && sess.meta.name === 'TIDwhole01.gesaa');
r = post({ a: 'session', k: K, box: SBOX, tid: 'TIDwhole02', size: 10 });
const ses2 = CALLS.filter((c) => /uploadType=resumable/.test(c.url)).pop();
check('session without origin sends no Origin header', r.ok && !('Origin' in ses2.headers), ses2.headers);
check('session to a cached box makes exactly 1 Drive call', r.g === 1, r);
phoneUpload(post({ a: 'session', k: K, box: SBOX, tid: 'TIDwhole01', size: whole.length, origin: ORIGIN }).url, whole);

// =============================================================================================== put / done / list / get
section('Put, done, list, get');
const T1 = 'TIDpieces01';
const data = rnd(5 * 100000 + 77), PIECE = 200000;
const pieceIds = [];
for (let i = 0; i * PIECE < data.length; i++) {
  r = post({ a: 'put', k: K, box: BOX, tid: T1, n: i + 1, data: b64(data.subarray(i * PIECE, (i + 1) * PIECE)) });
  if (!r.ok) break;
  pieceIds.push(r);
}
check('put 3 pieces -> {ok, id, size}', pieceIds.length === 3 && pieceIds.every((p, i) => p.ok && p.id && p.size === Math.min(PIECE, data.length - i * PIECE)), pieceIds);
check('piece names <tid>.p001..p003', pieceIds.map((p) => DRIVE.files[p.id].name).join() === [T1 + '.p001', T1 + '.p002', T1 + '.p003'].join());
const BOXID = props['b.' + BOX];
check('pieces are in the box folder', pieceIds.every((p) => DRIVE.files[p.id].parents[0] === BOXID));
check('first put to a new box: 3 calls (find, make folder, upload)', pieceIds[0].g === 3, pieceIds[0]);
check('later puts: 1 call each', pieceIds[1].g === 1 && pieceIds[2].g === 1);
check('bytes stored exactly', Buffer.concat(pieceIds.map((p) => DRIVE.files[p.id].data)).equals(data));
// The phone resent piece 2 (it never got the first answer): a duplicate in Drive.
r = post({ a: 'put', k: K, box: BOX, tid: T1, n: 2, data: b64(data.subarray(PIECE, 2 * PIECE)) });
check('duplicate piece accepted', r.ok && byName(T1 + '.p002').length === 2);
r = post({ a: 'done', k: K, box: BOX, tid: 'TIDnothing01', meta: { from: 'c@x.co' } });
check('done for a tid with no parts -> parts (detail: no parts)', errIs(r, 'parts') && r.detail === 'no parts', r);
r = post({ a: 'done', k: K, box: 'nobody@example.com', tid: T1, meta: {} });
check('done in a box that does not exist -> parts (and no folder made)', errIs(r, 'parts') && !props['b.nobody@example.com'], r);
r = post({ a: 'done', k: K, box: BOX, tid: T1, meta: {}, size: data.length + 1 });
check('done with a size that does not match -> parts (detail: size differs)', errIs(r, 'parts') && r.detail === 'size differs', r);
const META = { from: 'coord@example.com', fromName: 'Coordinator Ñiño', to: BOX, kind: 'task', project: { id: 'P-001', name: 'Kabacan loop 3' }, sha256: crypto.createHash('sha256').update(data).digest('hex'), note: 'Survey poles 1–40 ✓' };
NOW += 60e3;
r = post({ a: 'done', k: K, box: BOX, tid: T1, meta: META, size: data.length });
const M1 = r.manifest;
check('done -> {ok, manifest}', r.ok && M1 && M1.tid === T1 && M1.box === BOX, r);
check('manifest.created is ISO now', M1 && M1.created === iso(NOW));
check('manifest.meta kept exactly (incl. non-ASCII)', M1 && JSON.stringify(M1.meta) === JSON.stringify(META));
check('manifest.parts = 3 pieces in order, first copy of the duplicate', M1 && M1.parts.length === 3 && M1.parts.map((p) => p.name).join() === [T1 + '.p001', T1 + '.p002', T1 + '.p003'].join() && M1.parts[1].id === pieceIds[1].id, M1 && M1.parts);
check('manifest.parts carry {id,name,size} and size = total', M1 && M1.parts.every((p) => p.id && typeof p.size === 'number') && M1.size === data.length);
const mf = byName(T1 + '.json');
check('manifest file <tid>.json written in the box', mf.length === 1 && mf[0].parents[0] === BOXID && mf[0].mimeType === 'application/json');
check('manifest file is pure ASCII and reads back the same', mf.length === 1 && /^[\x00-\x7e]*$/.test(mf[0].data.toString('latin1')) && JSON.stringify(JSON.parse(mf[0].data.toString('utf8'))) === JSON.stringify(M1));
r = post({ a: 'done', k: K, box: BOX, tid: T1, meta: META });
check('done again -> same manifest, no second file', r.ok && r.again === true && JSON.stringify(r.manifest) === JSON.stringify(M1) && byName(T1 + '.json').length === 1, r);
check('put to a finished tid -> closed', errIs(post({ a: 'put', k: K, box: BOX, tid: T1, n: 4, data: 'AAAA' }), 'closed'));
check('session for a finished tid -> closed', errIs(post({ a: 'session', k: K, box: BOX, tid: T1, size: 5 }), 'closed'));
// Gap: p001 and p003 only
post({ a: 'put', k: K, box: BOX, tid: 'TIDgap0001', n: 1, data: 'AAAA' });
post({ a: 'put', k: K, box: BOX, tid: 'TIDgap0001', n: 3, data: 'AAAA' });
r = post({ a: 'done', k: K, box: BOX, tid: 'TIDgap0001', meta: {} });
check('done with a missing piece (gap) -> parts (detail: a piece is missing)', errIs(r, 'parts') && r.detail === 'a piece is missing', r);
// Prefix tid: a tid that starts with another tid must not catch its files
post({ a: 'put', k: K, box: BOX, tid: T1 + 'X', n: 1, data: 'BBBB' });
// Whole file transfer in the sanitized box
NOW += 60e3;
r = post({ a: 'done', k: K, box: RAWBOX, tid: 'TIDwhole01', meta: { from: 'fp@example.com', kind: 'update' }, size: whole.length });
check('done with a whole file -> parts = [<tid>.gesaa]', r.ok && r.manifest.parts.length === 1 && r.manifest.parts[0].name === 'TIDwhole01.gesaa' && r.manifest.size === whole.length && r.manifest.box === SBOX, r);
const W1 = r.manifest;
// A second transfer in BOX, later, for ordering
NOW += 60e3;
post({ a: 'put', k: K, box: BOX, tid: 'TIDsecond01', n: 1, data: b64(rnd(1000)) });
const M2 = post({ a: 'done', k: K, box: BOX, tid: 'TIDsecond01', meta: { kind: 'note' } }).manifest;
r = post({ a: 'list', k: K, box: BOX });
check('list -> both complete transfers, oldest first, no incomplete ones', r.ok && r.items.map((m) => m.tid).join() === [T1, 'TIDsecond01'].join(), r.items && r.items.map((m) => m.tid));
check('list items are the manifests', r.ok && JSON.stringify(r.items[0]) === JSON.stringify(M1) && JSON.stringify(r.items[1]) === JSON.stringify(M2));
check('list costs 1 call + 1 per manifest (with page-size 7 paging: box has >7 files)', r.g === Math.ceil(inFolder(BOXID).length / 7) + 2, { g: r.g, files: inFolder(BOXID).length });
r = post({ a: 'list', k: K, box: RAWBOX });
check('list on the sanitized box finds the whole-file transfer', r.ok && r.items.length === 1 && r.items[0].tid === 'TIDwhole01', r);
r = post({ a: 'list', k: K, box: 'empty@example.com' });
check('list of a box that was never used -> [] and no folder made', r.ok && r.items.length === 0 && !props['b.empty@example.com'], r);

const back = Buffer.concat(M1.parts.map((p) => Buffer.from(post({ a: 'get', k: K, id: p.id }).data, 'base64')));
check('get every part without Range -> identical bytes', back.equals(data));
r = post({ a: 'get', k: K, id: M1.parts[0].id });
check('get answer: {ok, data, size}; 2 calls (check + download)', r.ok && r.size === PIECE && r.g === 2 && !('start' in r), { g: r.g, size: r.size });
r = post({ a: 'get', k: K, id: W1.parts[0].id, start: 1000, end: 1999 });
check('get with Range -> exactly those bytes', r.ok && Buffer.from(r.data, 'base64').equals(whole.subarray(1000, 2000)) && r.start === 1000 && r.end === 1999 && r.size === whole.length, r.ok ? { start: r.start, end: r.end } : r);
const rangeCall = CALLS.filter((c) => /alt=media/.test(c.url)).pop();
check('get sent a Range header', rangeCall.headers.Range === 'bytes=1000-1999');
r = post({ a: 'get', k: K, id: W1.parts[0].id, start: 149000 });
check('get with start only -> to the end of the file', r.ok && Buffer.from(r.data, 'base64').equals(whole.subarray(149000)) && r.end === whole.length - 1);
r = post({ a: 'get', k: K, id: W1.parts[0].id, start: 149990, end: 999999 });
check('get with end past the file -> clamped', r.ok && Buffer.from(r.data, 'base64').equals(whole.subarray(149990)) && r.end === whole.length - 1);
check('get with start past the file -> range', errIs(post({ a: 'get', k: K, id: W1.parts[0].id, start: whole.length }), 'range'));
check('get with end < start -> range', errIs(post({ a: 'get', k: K, id: W1.parts[0].id, start: 10, end: 5 }), 'range'));
const bigFile = mkFile({ name: 'TIDbigfile1.gesaa', parents: [BOXID] }, Buffer.alloc(50 * 1048576 + 1));
check('get with a range over 50 MB -> size', errIs(post({ a: 'get', k: K, id: bigFile.id, start: 0, end: 50 * 1048576 }), 'size'));
r = post({ a: 'get', k: K, id: bigFile.id, start: 1, end: 50 * 1048576 });
check('get with a range of exactly 50 MB -> ok', r.ok && Buffer.from(r.data, 'base64').length === 50 * 1048576, r.ok || r);
check('get of a file over 50 MB without Range -> size', errIs(post({ a: 'get', k: K, id: bigFile.id }), 'size'));
delete DRIVE.files[bigFile.id];
const stray = mkFile({ name: 'stray.txt', parents: ['MYDRIVEROOT0'] }, Buffer.from('secret'));
check('get of an app file outside the mailbox -> id (not in the mailbox)', isOutside(post({ a: 'get', k: K, id: stray.id })));
const otherFolder = mkFile({ name: 'Other', mimeType: FOLDER, parents: ['MYDRIVEROOT0'] });
const nested = mkFile({ name: 'x.p001', parents: [otherFolder.id] }, Buffer.from('nope'));
check('get of a file in a folder that is not under the mailbox -> id (not in the mailbox)', isOutside(post({ a: 'get', k: K, id: nested.id })));
const deep = mkFile({ name: 'deeper', mimeType: FOLDER, parents: [BOXID] });
const deepFile = mkFile({ name: 'x.json', parents: [deep.id] }, Buffer.from('{}'));
check('get of a file two levels down (not a box) -> id (not in the mailbox)', isOutside(post({ a: 'get', k: K, id: deepFile.id })));
check('get of the mailbox folder itself -> id (not in the mailbox)', isOutside(post({ a: 'get', k: K, id: ROOT })));
check('get of a box folder -> id (not in the mailbox)', isOutside(post({ a: 'get', k: K, id: BOXID })));
const foreign = mkFile({ name: 'theirs.pdf', parents: [BOXID] }, Buffer.from('x'), { foreign: true });
check('get of a file the script cannot see (drive.file) -> gone', errIs(post({ a: 'get', k: K, id: foreign.id }), 'gone'));
check('get of an id that does not exist -> gone', errIs(post({ a: 'get', k: K, id: 'Fx99999999drv' }), 'gone'));
delete props['b.' + BOX];
r = post({ a: 'get', k: K, id: M1.parts[1].id });
check('get when the box id is not cached: allowed after one parent check (3 calls), id cached again', r.ok && r.g === 3 && props['b.' + BOX] === BOXID, { g: r.g, ok: r.ok, err: r.error });
r = post({ a: 'get', k: K, id: M1.parts[1].id });
check('next get uses the cache again (2 calls)', r.ok && r.g === 2);
check('max URL length stays under 2 KB', maxUrl < 2048, maxUrl);

// =============================================================================================== status / picked
section('Status and picked');
r = post({ a: 'status', k: K, tids: [T1, 'TIDunknown01'] });
check('status before pick: waiting (with at) / unknown', r.ok && r.status[T1] === 'waiting' && r.at[T1] === M1.created && r.status.TIDunknown01 === 'unknown' && !('TIDunknown01' in r.at), r);
const before = inFolder(BOXID).filter((f) => f.name.startsWith(T1 + '.')).length;
r = post({ a: 'picked', k: K, box: BOX, tid: T1 });
check('picked -> {ok, deleted} = every file of the tid (4 pieces incl. duplicate + manifest)', r.ok && r.deleted === 5 && before === 5, { r, before });
check('picked removed all files of that tid for good (DELETE, not trash)', inFolder(BOXID).filter((f) => f.name.startsWith(T1 + '.')).length === 0 && !CALLS.some((c) => c.method === 'patch'));
check('picked left the prefix tid (<tid>X) alone', byName(T1 + 'X.p001').length === 1);
check("status property 's.<tid>' = 'picked|<ISO>'", props['s.' + T1] === 'picked|' + iso(NOW), props['s.' + T1]);
r = post({ a: 'status', k: K, tids: [T1, 'TIDsecond01', 'TIDunknown01'] });
check('status after pick: picked / waiting / unknown', r.ok && r.status[T1] === 'picked' && r.at[T1] === iso(NOW) && r.status.TIDsecond01 === 'waiting' && r.status.TIDunknown01 === 'unknown', r);
check('status reads properties only (0 calls when no clean-up is due)', r.g === 0, r.g);
r = post({ a: 'list', k: K, box: BOX });
check('list after pick shows only the other transfer', r.ok && r.items.map((m) => m.tid).join() === 'TIDsecond01', r.items && r.items.map((m) => m.tid));
check('done for a picked tid -> closed', errIs(post({ a: 'done', k: K, box: BOX, tid: T1, meta: {} }), 'closed'));
r = post({ a: 'picked', k: K, box: BOX, tid: T1 });
check('picked again -> ok, deleted 0', r.ok && r.deleted === 0, r);
// a manifest left behind (its delete failed) must not show in list once picked
post({ a: 'put', k: K, box: BOX, tid: 'TIDfaildel1', n: 1, data: 'AAAA' });
post({ a: 'done', k: K, box: BOX, tid: 'TIDfaildel1', meta: {} });
const fdm = byName('TIDfaildel1.json')[0];
DRIVE.failDelete.add(fdm.id);
r = post({ a: 'picked', k: K, box: BOX, tid: 'TIDfaildel1' });
check('picked with a failing delete -> ok, failed counted, status still picked', r.ok && r.failed === 1 && r.deleted === 1 && /^picked\|/.test(props['s.TIDfaildel1']), r);
check('list hides a picked transfer whose manifest could not be deleted', !post({ a: 'list', k: K, box: BOX }).items.some((m) => m.tid === 'TIDfaildel1'));
DRIVE.failDelete.clear();

// =============================================================================================== cancel
section('Cancel');
const TC = 'TIDcancel01';
const cses = post({ a: 'session', k: K, box: BOX, tid: TC, size: 5000, origin: ORIGIN });
phoneUpload(cses.url, rnd(5000));
post({ a: 'done', k: K, box: BOX, tid: TC, meta: { kind: 'task' } });
r = post({ a: 'cancel', k: K, box: BOX, tid: TC });
check('cancel -> {ok, deleted:2} (whole file + manifest)', r.ok && r.deleted === 2, r);
check('cancel removed the files', inFolder(BOXID).filter((f) => f.name.startsWith(TC + '.')).length === 0);
check("cancel recorded 'cancelled'", /^cancelled\|/.test(props['s.' + TC]) && post({ a: 'status', k: K, tids: [TC] }).status[TC] === 'cancelled');
check('cancel of a picked transfer -> picked', errIs(post({ a: 'cancel', k: K, box: BOX, tid: T1 }), 'picked'));
check('put after cancel -> closed', errIs(post({ a: 'put', k: K, box: BOX, tid: TC, n: 1, data: 'AAAA' }), 'closed'));

// =============================================================================================== progress
section('Progress');
r = post({ a: 'progressPut', k: K, project: 'P-001', who: 'A@Example.com', json: JSON.stringify({ done: 3, of: 40, name: 'José' }) });
check('progressPut -> ok', r.ok === true, r);
let pf = inFolder(PROG);
check('file _progress/<project>__<who>.json', pf.length === 1 && pf[0].name === 'P-001__a@example.com.json', pf.map((f) => f.name));
const firstId = pf[0] && pf[0].id;
NOW += 5000;
r = post({ a: 'progressPut', k: K, project: 'P-001', who: 'a@example.com', json: { done: 7, of: 40, name: 'José' } });
pf = inFolder(PROG);
check('progressPut again replaces the previous file (one file, new content)', r.ok && pf.length === 1 && pf[0].id !== firstId && JSON.parse(pf[0].data.toString('utf8')).done === 7, pf.map((f) => f.name));
check('progressPut: 3 calls (find old, write new, delete old)', r.g === 3, r.g);
post({ a: 'progressPut', k: K, project: 'P-001', who: 'b@example.com', json: '{"done":1}' });
post({ a: 'progressPut', k: K, project: 'P-002', who: 'a@example.com', json: '{"done":9}' });
post({ a: 'progressPut', k: K, project: 'P__003', who: 'a@example.com', json: '{"done":5}' });
check('project "P__003" is stored as "P_003" (no "__" inside a project)', byName('P_003__a@example.com.json').length === 1);
r = post({ a: 'progressGet', k: K, project: 'P-001' });
check('progressGet -> items [{who, json, updated}] for that project only', r.ok && r.items.length === 2 && r.items.map((i) => i.who).join() === 'a@example.com,b@example.com', r);
check('progressGet json is the stored JSON string, newest content', r.ok && typeof r.items[0].json === 'string' && JSON.parse(r.items[0].json).done === 7 && JSON.parse(r.items[0].json).name === 'José');
check('progressGet updated = time of last put', r.ok && r.items[0].updated === iso(NOW));
r = post({ a: 'progressGet', k: K, project: 'P-404' });
check('progressGet for a project with nothing -> []', r.ok && r.items.length === 0);
// a stale duplicate (two phones racing) - the newest wins
mkFile({ name: 'P-002__a@example.com.json', parents: [PROG], mimeType: 'application/json', }, Buffer.from('{"done":2}'), { created: NOW - 60e3 });
r = post({ a: 'progressGet', k: K, project: 'P-002' });
check('progressGet with a leftover older copy -> newest only', r.ok && r.items.length === 1 && JSON.parse(r.items[0].json).done === 9, r);
r = post({ a: 'get', k: K, id: inFolder(PROG)[0].id });
check('get may read a _progress file (inside the tree)', r.ok === true, r);

// =============================================================================================== space
section('Space');
r = post({ a: 'space', k: K });
check('space -> {limit, usage, inDrive, inTrash} as numbers, 1 call', r.ok && r.limit === 16106127360 && r.usage === 3865470566 && r.inDrive === 1181116006 && r.inTrash === 10737418 && r.g === 1, r);
DRIVE.quota = { usage: '5', usageInDrive: '4', usageInDriveTrash: '0' };
r = post({ a: 'space', k: K });
check('space with no limit -> limit null', r.ok && r.limit === null && r.usage === 5, r);

// =============================================================================================== clean-up
section('Lazy clean-up');
// Start from a clean slate in a fresh box, with the clock under control.
const CB = 'clean.box@example.com';
const T0 = NOW = Date.parse('2026-12-01T00:00:00.000Z');
props['clean.last'] = String(T0);             // just cleaned
post({ a: 'put', k: K, box: CB, tid: 'TIDexpire01', n: 1, data: b64(rnd(100)) });
post({ a: 'put', k: K, box: CB, tid: 'TIDexpire01', n: 2, data: b64(rnd(100)) });
post({ a: 'done', k: K, box: CB, tid: 'TIDexpire01', meta: { kind: 'task' } });
post({ a: 'put', k: K, box: CB, tid: 'TIDorphan01', n: 1, data: b64(rnd(100)) }); // never done
const CBID = props['b.' + CB];
const progBefore = inFolder(PROG).length;
NOW = T0 + 2.5 * D;
props['clean.last'] = String(NOW - 1 * H); // cleaned an hour ago
r = post({ a: 'list', k: K, box: CB });
check('clean-up skipped within 6 h of the last one (orphan 2.5 days old still there)', byName('TIDorphan01.p001').length === 1 && r.g === 2, r.g);
NOW = T0 + 2.5 * D + 6 * H + 1;
const lockBefore = LOCK.taken;
r = post({ a: 'list', k: K, box: CB });
check('after 6 h: clean-up ran under the script lock', LOCK.taken > lockBefore && props['clean.last'] === String(NOW));
check('orphan piece older than 2 days (no manifest) removed', byName('TIDorphan01.p001').length === 0);
check('complete transfer 2.5 days old kept (pieces + manifest)', inFolder(CBID).filter((f) => f.name.startsWith('TIDexpire01.')).length === 3);
check('progress files are never touched by clean-up', inFolder(PROG).length === progBefore);
check('list still shows the waiting transfer', r.ok && r.items.length === 1 && r.items[0].tid === 'TIDexpire01');
NOW = T0 + 6 * D;
post({ a: 'put', k: K, box: CB, tid: 'TIDfresh001', n: 1, data: b64(rnd(50)) });
post({ a: 'done', k: K, box: CB, tid: 'TIDfresh001', meta: {} });
NOW = T0 + 6.5 * D;
post({ a: 'put', k: K, box: CB, tid: 'TIDyoungorph', n: 1, data: b64(rnd(50)) }); // orphan, but young
// A transfer past 7 days is hidden from list even before clean-up reaches it.
NOW = T0 + 7 * D + 1 * H;
props['clean.last'] = String(NOW - 1 * H);
r = post({ a: 'list', k: K, box: CB });
check('list hides a transfer older than 7 days even before clean-up', r.ok && r.items.map((m) => m.tid).join() === 'TIDfresh001', r.items && r.items.map((m) => m.tid));
r = post({ a: 'status', k: K, tids: ['TIDexpire01'] });
check('status of a waiting transfer older than 7 days -> expired', r.ok && r.status.TIDexpire01 === 'expired', r);
props['clean.last'] = String(NOW - 7 * H);
r = post({ a: 'hello', k: K });
check('hello (with key) runs the due clean-up', r.ok && r.keyOk && props['clean.last'] === String(NOW), r);
check('transfer whose manifest is older than 7 days deleted (pieces + manifest)', inFolder(CBID).filter((f) => f.name.startsWith('TIDexpire01.')).length === 0);
check("its status became 'expired'", /^expired\|/.test(props['s.TIDexpire01']) && post({ a: 'status', k: K, tids: ['TIDexpire01'] }).status.TIDexpire01 === 'expired');
check('newer transfer (1 day old) kept', inFolder(CBID).filter((f) => f.name.startsWith('TIDfresh001.')).length === 2);
check('young orphan (under 2 days) kept', byName('TIDyoungorph.p001').length === 1);
check('leftover manifest of a picked transfer removed', byName('TIDfaildel1.json').length === 0);
check('cancel-free leftovers: incomplete gap transfer (no manifest, old) removed', byName('TIDgap0001.p001').length === 0 && byName('TIDgap0001.p003').length === 0);
r = post({ a: 'hello' });
check('hello without key does not clean up (no work for strangers)', r.ok && !('keyOk' in r) && r.g === 1);
// Status records older than 30 days are dropped.
NOW = T0 + 40 * D;
props['clean.last'] = String(NOW - 7 * H);
r = post({ a: 'status', k: K, tids: [T1, 'TIDexpire01', TC] });
check("status records older than 30 days dropped -> unknown", r.ok && r.status[T1] === 'unknown' && r.status[TC] === 'unknown' && !props['s.' + T1], r);
check("status with clean-up due ran it first (clean.last updated)", props['clean.last'] === String(NOW));
// Skipped when another request holds the lock.
props['clean.last'] = String(NOW - 7 * H);
LOCK.busy = true;
r = post({ a: 'status', k: K, tids: [] });
LOCK.busy = false;
check('clean-up skipped (not an error) when the lock is busy', r.ok && props['clean.last'] === String(NOW - 7 * H), r);
// Bounded work: 230 old orphans, 200 deletes per pass, the next call carries on.
DRIVE.pageSize = 1000;
for (let i = 0; i < 230; i++) mkFile({ name: 'TIDbulk' + String(i).padStart(4, '0') + '.p001', parents: [CBID] }, Buffer.from('x'), { created: NOW - 3 * D });
props['clean.last'] = String(NOW - 7 * H);
const calls0 = CALLS.length;
r = post({ a: 'list', k: K, box: CB });
const deletes1 = CALLS.slice(calls0).filter((c) => c.method === 'delete').length;
check('bounded: first pass deletes at most 200 files', deletes1 === 200, deletes1);
check('bounded: clean.last not moved, so the next call carries on', props['clean.last'] === String(NOW - 7 * H));
r = post({ a: 'list', k: K, box: CB });
check('bounded: second pass deletes the rest and finishes', Object.values(DRIVE.files).filter((f) => f.name.startsWith('TIDbulk')).length === 0 && props['clean.last'] === String(NOW));
DRIVE.pageSize = 7;
check('no PATCH and no trash used anywhere', !CALLS.some((c) => c.method === 'patch'));

// =============================================================================================== g and plumbing
section('g, auth, recovery');
r = post({ a: 'space', k: K });
check('g counts this request only (reset per request)', r.g === 1 && r.g === r.__calls);
check('every Drive call carried the script token', badAuth === 0);
check('lock never held after a request', LOCK.held === false && LOCK.nestedBad === 0);
// The coordinator deleted the mailbox folder by hand: hello makes it again and forgets the old subfolders.
const kill = (x) => { Object.values(DRIVE.files).filter((c) => c.parents.includes(x)).forEach((c) => kill(c.id)); delete DRIVE.files[x]; };
kill(ROOT);
r = post({ a: 'hello', k: K });
const ROOT2 = props['folder.root'];
check('hello after the folder was deleted: a new folder, old box ids forgotten', r.ok && ROOT2 && ROOT2 !== ROOT && DRIVE.files[ROOT2].name === 'G-eSAA mailbox' && !Object.keys(props).some((k) => k.startsWith('b.')) && !props['folder.progress'], r);
r = post({ a: 'put', k: K, box: BOX, tid: 'TIDafter001', n: 1, data: 'AAAA' });
check('put after that makes the box again inside the new folder', r.ok && DRIVE.files[props['b.' + BOX]].parents[0] === ROOT2, r);
const tmpRoot = props['folder.root'];
const origFetch = UrlFetchApp.fetch;
UrlFetchApp.fetch = () => ({ getResponseCode: () => 500, getAllHeaders: () => ({}), getContentText: () => 'backend', getContent: () => [] });
r = post({ a: 'hello', k: K });
UrlFetchApp.fetch = origFetch;
check('a Drive 500 on hello is an error, not a second folder', errIs(r, 'drive') && props['folder.root'] === tmpRoot && typeof r.detail === 'string', r);
UrlFetchApp.fetch = () => { throw new Error('Service invoked too many times for one day: urlfetch.'); };
r = post({ a: 'space', k: K });
UrlFetchApp.fetch = origFetch;
check('UrlFetch quota exception -> {ok:false, error:"drive"} (never thrown out of doPost)', errIs(r, 'drive') && r.g === 1, r);
UrlFetchApp.fetch = () => ({ getResponseCode: () => 403, getAllHeaders: () => ({}), getContentText: () => '{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}', getContent: () => [] });
r = post({ a: 'put', k: K, box: BOX, tid: 'TIDfull0001', n: 1, data: 'AAAA' });
UrlFetchApp.fetch = origFetch;
check('Drive full -> full', errIs(r, 'full'), r);
{ // v1 (beta 2): setup when Drive refuses says why, in plain words
  const keep = Object.assign({}, props); delete props['folder.root']; delete props['folder.progress'];
  const tok = (sc) => ({ getResponseCode: () => 200, getAllHeaders: () => ({}), getContentText: () => JSON.stringify({ scope: sc }), getContent: () => [] });
  const no = (t) => ({ getResponseCode: () => 403, getAllHeaders: () => ({}), getContentText: () => t, getContent: () => [] });
  LOGS.length = 0;
  UrlFetchApp.fetch = (url) => (/tokeninfo/.test(url) ? tok('https://www.googleapis.com/auth/script.external_request') : no('{"error":{"code":403,"message":"Request had insufficient authentication scopes.","status":"PERMISSION_DENIED","details":[{"reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT"}]}}'));
  let threw = false; try { G.setup(); } catch (e) { threw = e.code === 'drive'; }
  check('setup without the Drive permission: stops, logs Google\'s answer, says appsscript.json was not replaced', threw && LOGS.some((l) => /^Stopped: Drive POST 403/.test(l)) && LOGS.some((l) => /appsscript\.json was not replaced/.test(l)), LOGS);
  LOGS.length = 0;
  UrlFetchApp.fetch = (url) => (/tokeninfo/.test(url) ? tok('https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/script.external_request') : no('{"error":{"code":403,"message":"Google Drive API has not been used in project 123 before or it is disabled.","errors":[{"reason":"accessNotConfigured"}]}}'));
  threw = false; try { G.setup(); } catch (e) { threw = true; }
  check('setup with the Drive API off: says to add the Drive API under Services', threw && LOGS.some((l) => /Drive API is turned off/.test(l) && /Services \(\+\) > Drive API \(v3\) > Add/.test(l)), LOGS);
  LOGS.length = 0;
  UrlFetchApp.fetch = (url) => { if (/tokeninfo/.test(url)) throw new Error('no network'); return no('{"error":{"code":403,"message":"The domain administrators have disabled Drive apps."}}'); };
  threw = false; try { G.setup(); } catch (e) { threw = true; }
  check('setup blocked by a Workspace administrator: says so', threw && LOGS.some((l) => /administrator blocks/.test(l)), LOGS);
  UrlFetchApp.fetch = origFetch; Object.assign(props, keep);
}

// =============================================================================================== the app's own check
section("The app's mailbox check (as team_module.js mbxTest does it)");
function appCheck(box, direct) {
  const key = K, data = rnd(65536), sha = crypto.createHash('sha256').update(data).digest('hex');
  let tid = 'chk' + NOW.toString(36) + 'abc234';
  const h = raw({ action: 'hello', k: key });
  if (h.app !== 'G-eSAA mailbox' || !h.claimed || !h.keyOk) return 'hello ' + JSON.stringify(h);
  const s = raw({ action: 'session', k: key, box, tid, size: data.length, origin: 'https://localhost' });
  if (!s.ok) return 'session ' + JSON.stringify(s);
  if (direct) phoneUpload(s.url, data);
  else { // Google refused the direct send: cancel, new tid, through the script
    if (!raw({ action: 'cancel', k: key, box, tid }).ok) return 'cancel';
    tid = 'chk' + NOW.toString(36) + 'xyz789';
    const p = raw({ action: 'put', k: key, box, tid, n: 1, data: data.toString('base64') });
    if (!p.ok) return 'put ' + JSON.stringify(p);
  }
  const d = raw({ action: 'done', k: key, box, tid, meta: { kind: 'check', from: box, sha256: sha, size: data.length } });
  if (!d.ok) return 'done ' + JSON.stringify(d);
  const L = raw({ action: 'list', k: key, box }), m = (L.items || []).find((x) => x.tid === tid);
  if (!m) return 'list ' + JSON.stringify(L);
  const parts = m.parts.slice().sort((a, b) => (a.name < b.name ? -1 : 1));
  const got = Buffer.concat(parts.map((p) => Buffer.from(raw({ action: 'get', k: key, id: p.id }).data, 'base64')));
  if (crypto.createHash('sha256').update(got).digest('hex') !== sha) return 'not identical';
  const pk = raw({ action: 'picked', k: key, box, tid });
  if (!pk.ok || pk.deleted !== 2) return 'picked ' + JSON.stringify(pk);
  return 'ok';
}
NOW += 1000; check('app check, direct send (box = the phone email)', appCheck('coord@example.com', true) === 'ok', appCheck.last);
NOW += 1000; let ac = appCheck('check', false);
check('app check, fallback through the script (box "check" when the phone has no email)', ac === 'ok', ac);
const kOld = K, kNew = 'n'.repeat(32);
check('app rekey and roll back (as mbxRekeyRun does when the sheet refuses)', raw({ action: 'rekey', k: kOld, nk: kNew }).ok && raw({ action: 'rekey', k: kNew, nk: kOld }).ok && props['key.hash'] === sha(kOld));

// ---------------------------------------------------------------------------------------------- done
Date.now = realNow;
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
