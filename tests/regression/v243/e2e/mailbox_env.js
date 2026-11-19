/* e2e: the real mailbox Code.gs on the Drive stand-in of mailbox/stub_test.js (lines 1-248, copied; real clock). */
// Runs the G-eSAA Mailbox Code.gs against an in-memory stand-in for the Drive REST API and the Apps Script
// services it uses. No network. Synthetic data only. Prints PASS/FAIL per check; exits 1 on any failure.
//   node stub_test.js
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const DIR = require('path').join(__dirname, '../mailbox');

// ---------------------------------------------------------------------------------------------- results
let passed = 0, failed = 0;
function check(name, cond, info) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (info !== undefined ? '  -> ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : '')); }
}
function section(s) { console.log('\n== ' + s); }

// ---------------------------------------------------------------------------------------------- fake clock
const realNow = Date.now; let NOW = realNow(); setInterval(() => { NOW = realNow(); }, 100).unref();
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
/** v2.43 beta 2: Google's chunked resumable upload. range = the Content-Range header. Returns { status, got, file }:
 *  308 with got = bytes Google has (the next piece starts there), 200 with the file once complete. "bytes *\/N" asks the state. */
function phoneChunk(url, range, buf) {
  const s = DRIVE.sessions[new URL(url).searchParams.get('upload_id')];
  if (!s) return { status: 404 };
  if (!s.parts) s.parts = [];
  if (!s.got) s.got = 0;
  if (s.file) return { status: 200, file: s.file, got: s.size };
  const q = /^bytes \*\/(\d+)$/.exec(range || '');
  if (q) return { status: 308, got: s.got };
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range || '');
  if (!m) return { status: 400 };
  const a = +m[1], b = +m[2], tot = +m[3];
  if (tot !== s.size || b - a + 1 !== buf.length) return { status: 400 };
  if (a > s.got) return { status: 400 };                 // a gap: Google refuses
  const fresh = buf.subarray(s.got - a);                  // bytes Google already has are skipped (overlap)
  s.parts.push(Buffer.from(fresh)); s.got += fresh.length;
  if (s.got >= s.size) { s.file = mkFile(s.meta, Buffer.concat(s.parts)); return { status: 200, file: s.file, got: s.size }; }
  return { status: 308, got: s.got };
}
/** v2.43 beta 2 (tests): make a transfer look `days` older (its files and its status), as if a week went by. */
function age(tid, days) {
  const ms = days * 24 * 3600e3; let n = 0;
  Object.values(DRIVE.files).forEach((f) => { if (f.name && f.name.startsWith(tid + '.')) { f.createdTime = new Date(Date.parse(f.createdTime) - ms).toISOString(); n++; } });
  const k = 's.' + tid; if (props[k]) { const [st, at] = String(props[k]).split('|'); props[k] = st + '|' + new Date(Date.parse(at) - ms).toISOString(); }
  Object.keys(props).filter((x) => /clean/i.test(x)).forEach((x) => { delete props[x]; }); // the next list or status runs the clean-up
  return n;
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
module.exports = { G, DRIVE, phoneUpload, phoneChunk, age, raw, props };
