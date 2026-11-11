// The real PoleCam-online-sheet.gs behind a local HTTP server (mocked Apps Script services), for the app tests.
// GET/POST /exec → doGet / doPost. POST /ctl {op: 'set', k, v} (a Settings value), {op: 'credits', email, company, credits, unl},
// {op: 'invite', code, col, v} (an Invites cell). GET /dump → the tabs, properties and cache.
const fs = require('fs'), crypto = require('crypto'), http = require('http');
const src = fs.readFileSync(process.argv[2], 'utf8'), port = Number(process.argv[3] || 8790);
const sheets = {};
function mkSheet(name, rows) {
  const sh = { name, rows: rows || [], getLastRow() { return this.rows.length; },
    getRange(r, c, nr, nc) { const self = this; nr = nr || 1; nc = nc || 1; return {
      setValues(v) { v.forEach((row, i) => { self.rows[r - 1 + i] = self.rows[r - 1 + i] || []; row.forEach((x, j) => { self.rows[r - 1 + i][c - 1 + j] = x; }); }); return this; },
      setValue(x) { self.rows[r - 1] = self.rows[r - 1] || []; self.rows[r - 1][c - 1] = x; return this; },
      getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((self.rows[r - 1 + i] || [])[c - 1 + j] ?? ''))); },
      getDisplayValues() { return this.getValues().map((row) => row.map(String)); }, setNumberFormat() { return this; }, setFontWeight() { return this; }, setDataValidation() { return this; } }; },
    getDataRange() { const self = this; return { getDisplayValues: () => self.rows.map((r) => r.map((x) => String(x ?? ''))) }; },
    setFrozenRows() {}, autoResizeColumns() {} };
  sheets[name] = sh; return sh;
}
mkSheet('Settings', [['Setting', 'Value', 'Notes'], ['Admin key', 'ADMINKEY0123456789ab'], ['Read key', 'a3f9c2e7b1d84f6e9a0c'], ['Companies tab', 'Companies'], ['List name', 'Globe OSP test']]);
mkSheet('Tasks', [['Task ID', 'Project name', 'Category', 'Site / cluster', 'Contractor', 'Globe representative', 'For company', 'Status', 'Notes']]);
mkSheet('Companies', [['Company name', 'Authorization'], ['GLOBE', 'ADMIN'], ['FADI', 'Vendor'], ['NOKIA', 'Vendor']]);
mkSheet('CompanyKeys', [['Company', 'Key', 'Sees all tasks'], ['GLOBE', 'ZYTP-EE6P-3QY2', 'Yes'], ['FADI', '7SPB-8BF2-6NTW', 'No'], ['NOKIA', 'K4QM-9XRT-2WHD', 'No']]);
const CACHE_M = {}, CACHE = { get: (k) => (k in CACHE_M ? CACHE_M[k] : null), put: (k, v) => { CACHE_M[k] = v; }, remove: (k) => { delete CACHE_M[k]; } };
const P = {}; const PROPS = { getProperty: (k) => (k in P ? P[k] : null), setProperties: (o) => Object.assign(P, o), setProperty: (k, v) => { P[k] = v; }, deleteProperty: (k) => { delete P[k]; } };
const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => mkSheet(n, []), getName: () => 'test' };
const env = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
  Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { MD5: 'md5' }, computeDigest: (alg, t) => [...crypto.createHash('md5').update(String(t)).digest()].map((b) => (b > 127 ? b - 256 : b)), base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url'), formatDate: (d, tz, f) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10), base64Encode: (b) => Buffer.from(b.map ? b.map((x) => x & 255) : b).toString('base64') },
  ContentService: { createTextOutput: (t) => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  PropertiesService: { getScriptProperties: () => PROPS }, Session: { getScriptTimeZone: () => 'Asia/Manila' }, CacheService: { getScriptCache: () => CACHE }, console };
const fn = new Function(...Object.keys(env), src + '\nreturn { doPost, doGet };')(...Object.values(env));
const log = [];
http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
    const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
    try {
      if (u.pathname === '/dump') return send({ sheets: Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, v.rows])), props: Object.keys(P), cache: Object.keys(CACHE_M), log });
      if (u.pathname === '/ctl') {
        const o = JSON.parse(body || '{}');
        if (o.op === 'set') { const r = sheets.Settings.rows.find((x) => x[0] === o.k); if (r) r[1] = o.v; else sheets.Settings.rows.push([o.k, o.v]); }
        if (o.op === 'credits') { const C = sheets.Credits || mkSheet('Credits', [['Email', 'Company', 'Credits (m)', 'Unlimited', 'Used (m)', 'Balance (m)', 'Last export', 'Notes']]); const r = C.rows.find((x) => x[0] === o.email); if (r) { r[2] = o.credits; if (o.unl !== undefined) r[3] = o.unl; } else C.rows.push([o.email, o.company || '', o.credits, o.unl || 'No', 0, '', '', '']); }
        if (o.op === 'invite') { const r = (sheets.Invites || { rows: [] }).rows.find((x) => x[0] === o.code); if (r) r[o.col] = o.v; }
        return send({ ok: true });
      }
      const q = Object.fromEntries(u.searchParams.entries());
      if (req.method === 'POST') { const b = JSON.parse(body || '{}'); log.push({ m: 'POST', action: b.action, at: Date.now(), ...(b.action === 'credit' ? { route: b.route, allowNeg: !!b.allowNeg, kind: b.kind } : {}) }); return send(fn.doPost({ postData: { contents: body } }).t); }
      log.push({ m: 'GET', q: Object.keys(q).filter((k) => !/^(v|logoat|area|region|terr)$/.test(k)).sort().join(','), at: Date.now() });
      return send(fn.doGet({ parameter: q }).t);
    } catch (e) { send({ ok: false, error: 'server: ' + (e && e.message) }); console.error(e); }
  });
}).listen(port, '127.0.0.1', () => console.log('sheet on ' + port));
