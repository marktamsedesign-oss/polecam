/* e2e: the real v2.43 sheet script on the in-memory spreadsheet of sheet_stub_test.js (lines 14-191, copied). */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const DIR = require('path').join(__dirname, '../sheet');
const NEW_GS = process.env.GS_FILE || path.join(DIR, 'PoleCam-online-sheet_v2.43.gs'); // GS_FILE: test another copy
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
function post(gs, body) {
  const out = gs.doPost({ postData: { contents: JSON.stringify(body) } });
  if (world.lockHeld !== 0) throw new Error('lock not released after ' + body.action);
  return JSON.parse(out.getContent());
}
function get(gs, params) { return JSON.parse(gs.doGet({ parameter: params }).getContent()); }

module.exports = { world, resetWorld, load, post, get, NEW_GS, advance };
