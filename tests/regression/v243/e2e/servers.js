/* e2e: the v2.43 sheet script and the mailbox script, each on its stand-in, behind one local HTTP server (port 8781).
   POST /sheet → sheet doPost · POST /mbx → mailbox doPost (its upload addresses point to /upload here) · PUT /upload → the
   phone's direct upload · GET /mail?to= → the last code emailed · GET /drive → the mailbox folder's files (names). */
const http = require('http');
// beta 3.2 (QA-17): the sheet script v2.43.1 (Team per company). GS_FILE picks another copy; TEAM_A: DEMO CONTRACTOR's Team cell (default Yes)
process.env.GS_FILE = process.env.GS_FILE || require('path').join(__dirname, '../sheet/PoleCam-online-sheet_v2.43.2.gs'); // beta 3.3: v2.43.2 (coordinators approved)
const sheet = require('./sheet_env.js');
const gs = sheet.load(sheet.NEW_GS);
gs.setup();
const tab = (n) => sheet.world.ss.getSheetByName(n);
tab('Companies').getRange(2, 1, 3, 1).setValues([['GLOBE'], ['DEMO CONTRACTOR'], ['DEMO CONTRACTOR B']]);
const ckHead = tab('CompanyKeys').getRange(1, 1, 1, tab('CompanyKeys').getLastColumn()).getValues()[0];
if (ckHead.length >= 4) tab('CompanyKeys').getRange(2, 1, 2, 4).setValues([['DEMO CONTRACTOR', 'DMCA7KQ4MX2P', 'No', process.env.TEAM_A === undefined ? 'Yes' : process.env.TEAM_A], ['DEMO CONTRACTOR B', 'DMCB4HJK9TRW', 'No', '']]);
else tab('CompanyKeys').getRange(2, 1, 2, 3).setValues([['DEMO CONTRACTOR', 'DMCA7KQ4MX2P', 'No'], ['DEMO CONTRACTOR B', 'DMCB4HJK9TRW', 'No']]); // an older script (GS_FILE): no Team column
{ const st = tab('Settings'), rows = st.getRange(1, 1, st.getLastRow(), 2).getValues(); rows.forEach((r, i) => { if (r[0] === 'Mailbox script link') st.getRange(i + 1, 2).setValue('https://script.google.com/home/projects/DEMO-MAILBOX-SCRIPT'); }); }
const mbx = require('./mailbox_env.js');
const PORT = Number(process.env.PORT || 8781);
const readBody = (req) => new Promise((res) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });
const send = (res, code, body, extra) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT, POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Range, Content-Type', ...(extra || {}) }); res.end(body); };
let directOk = process.env.DIRECT !== 'no'; // DIRECT=no: the upload server refuses, as a browser that Google turns away
// beta 2: chunked uploads. range: expose Google's Range header to the page (its CORS); drop: the Nth piece PUT from now is
// taken in part (half its bytes) and the connection dropped, as on a weak signal; puts: the piece PUTs seen
let exposeRange = true, dropAt = 0, puts = 0, chunked = 0, probes = 0, dropRange = '';
const LIM = { max: 0, delay: 0, refuseUntil: 0, how: 'html', fail: [], free: null, calls: 0, refused: 0, inflight: 0, maxInflight: 0 }; // beta 3.3 (QA-10) // dropRange: the browser's own retry of the dropped piece fails too
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const b = await readBody(req);
  try {
    if (u.pathname === '/sheet' && req.method === 'GET') { const out = gs.doGet({ parameter: Object.fromEntries(u.searchParams) }); return send(res, 200, out.getContent()); } // beta 3.2: the read (sync)
    if (u.pathname === '/sheet') { const out = gs.doPost({ postData: { contents: b.toString('utf8') } }); return send(res, 200, out.getContent()); }
    if (u.pathname === '/teamyes') { // beta 3.3 (QA-08): the admin types Yes / No / blank in the Team tab's Approved column for an email
      const sh = tab('Team'), e = String(u.searchParams.get('email') || '').toLowerCase(), v = u.searchParams.get('v') == null ? 'Yes' : u.searchParams.get('v');
      if (!sh || sh.getLastRow() < 2) return send(res, 404, JSON.stringify({ ok: false }));
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], ci = head.indexOf('Approved (Yes / No)'), ei = head.indexOf('Email'), rows = sh.getRange(1, 1, sh.getLastRow(), head.length).getValues();
      let n = 0; rows.forEach((r, i) => { if (i && String(r[ei]).toLowerCase() === e && ci >= 0) { sh.getRange(i + 1, ci + 1).setValue(v); n++; } });
      return send(res, 200, JSON.stringify({ ok: n > 0, n }));
    }
    if (u.pathname === '/setting') { // beta 3.3: a value in the Settings tab (as the admin types it)
      const st = tab('Settings'), k = u.searchParams.get('k'), v = u.searchParams.get('v') || '', rows = st.getRange(1, 1, st.getLastRow(), 2).getValues(), i = rows.findIndex((r) => r[0] === k);
      if (i >= 0) st.getRange(i + 1, 2).setValue(v); else st.appendRow([k, v, '']);
      return send(res, 200, JSON.stringify({ ok: true }));
    }
    if (u.pathname === '/adminkey') return send(res, 200, JSON.stringify({ key: gs.settings_()['Admin key'] || '' })); // beta 3.3: for the admin phone of a test
    if (u.pathname === '/teamswitch') { // beta 3.2 (QA-17): the admin types Yes / No / blank in CompanyKeys → Team for a company
      const sh = tab('CompanyKeys'), co = u.searchParams.get('co'), v = u.searchParams.get('v') || '', rows = sh.getRange(1, 1, sh.getLastRow(), 4).getValues();
      const i = rows.findIndex((r) => r[0] === co); if (i < 1) return send(res, 404, JSON.stringify({ ok: false }));
      sh.getRange(i + 1, 4).setValue(v); return send(res, 200, JSON.stringify({ ok: true, co, team: v }));
    }
    if (u.pathname === '/mbx') {
      // beta 3.3 (QA-10): Google's limits on the stand-in: a refusal for some seconds, the next answers forced, calls at once
      let act = ''; try { act = JSON.parse(b.toString('utf8')).action || ''; } catch (e) { act = ''; }
      LIM.calls++; LIM.inflight++; LIM.maxInflight = Math.max(LIM.maxInflight, LIM.inflight);
      try {
        const html = () => { LIM.refused++; res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }); res.end('<!DOCTYPE html><html><body>There are too many scripts running simultaneously for this Google user account.</body></html>'); };
        if (LIM.max && LIM.inflight > LIM.max) return html();
        if (LIM.refuseUntil > Date.now()) { if (LIM.how === 'html') return html(); LIM.refused++; return send(res, 200, JSON.stringify({ ok: false, error: LIM.how })); }
        const f = LIM.fail.findIndex((x) => !x.action || x.action === act);
        if (f >= 0) { const x = LIM.fail[f]; if (--x.n <= 0) LIM.fail.splice(f, 1); LIM.refused++; if (x.code === 'html') return html(); return send(res, 200, JSON.stringify({ ok: false, error: x.code })); }
        if (act === 'space' && LIM.free != null) return send(res, 200, JSON.stringify({ ok: true, limit: 16106127360, usage: 16106127360 - LIM.free, inDrive: 0, inTrash: 0 }));
        if (LIM.delay) await new Promise((r) => setTimeout(r, LIM.delay));
      } finally { if (res.writableEnded) LIM.inflight--; }
      LIM.inflight--;
      const out = mbx.G.doPost({ postData: { contents: b.toString('utf8') } }); let t = out.t;
      t = t.replace(/https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/g, `http://127.0.0.1:${PORT}/upload?`);
      return send(res, 200, t);
    }
    if (u.pathname === '/upload' && req.method === 'PUT') {
      if (!directOk) { res.destroy(); return; }
      const gurl = 'https://www.googleapis.com/upload/drive/v3/files?' + u.searchParams.toString(), cr = req.headers['content-range'] || '';
      const one = /^bytes 0-(\d+)\/(\d+)$/.exec(cr);
      if (!cr || (one && +one[1] + 1 === +one[2] && !/\*/.test(cr) && b.length === +one[2] && !dropAt)) { // the whole file in one PUT (as beta 1)
        const f = mbx.phoneUpload(gurl, b); return send(res, 200, JSON.stringify({ id: f.id, name: f.name }));
      }
      if (!/\*/.test(cr)) { puts++; chunked++; } else probes++;
      if (dropRange && cr === dropRange) { res.destroy(); return; }
      if (dropAt && !/\*/.test(cr) && --dropAt === 0) { // half of this piece reaches Google, then the line drops
        const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr), half = Math.floor(b.length / 2);
        mbx.phoneChunk(gurl, `bytes ${m[1]}-${+m[1] + half - 1}/${m[3]}`, b.subarray(0, half)); dropRange = cr; res.destroy(); return;
      }
      const r = mbx.phoneChunk(gurl, cr, b);
      if (r.status === 200) return send(res, 200, JSON.stringify({ id: r.file.id, name: r.file.name }));
      if (r.status === 308) return send(res, 308, '', r.got ? { Range: `bytes=0-${r.got - 1}`, ...(exposeRange ? { 'Access-Control-Expose-Headers': 'Range' } : {}) } : {});
      return send(res, r.status, '{}');
    }
    if (u.pathname === '/chunks') { if (u.searchParams.has('drop')) dropAt = +u.searchParams.get('drop'); if (u.searchParams.has('range')) exposeRange = u.searchParams.get('range') !== '0'; const o = { puts: chunked, dropAt, exposeRange, probes }; if (u.searchParams.has('reset')) { chunked = 0; probes = 0; dropRange = ''; } return send(res, 200, JSON.stringify(o)); }
    if (u.pathname === '/age') return send(res, 200, JSON.stringify({ n: mbx.age(u.searchParams.get('tid'), +u.searchParams.get('days') || 8) }));
    if (u.pathname === '/props') return send(res, 200, JSON.stringify(mbx.props));
    if (u.pathname === '/mail') { const to = u.searchParams.get('to'); const m = sheet.world.mail.filter((x) => x.to === to).pop(); const k = m && /\b(\d{6})\b/.exec(m.subject); return send(res, 200, JSON.stringify({ code: k ? k[1] : null, n: sheet.world.mail.length })); }
    if (u.pathname === '/drive') return send(res, 200, JSON.stringify(Object.values(mbx.DRIVE.files).filter((f) => !f.trashed).map((f) => f.name)));
    if (u.pathname === '/rows') { const sh = tab(u.searchParams.get('tab')); return send(res, 200, JSON.stringify(sh && sh.getLastRow() > 0 ? sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues() : [])); }
    if (u.pathname === '/mbxlimit') { // ?max=30&delay=300 · ?refuse=30&how=html|rate|busy · ?fail=code&n=1&action=get · ?free=bytes (-1: off) · ?reset=1
      const q = u.searchParams;
      if (q.has('max')) LIM.max = +q.get('max'); if (q.has('delay')) LIM.delay = +q.get('delay');
      if (q.has('refuse')) { LIM.refuseUntil = Date.now() + 1000 * +q.get('refuse'); LIM.how = q.get('how') || 'html'; }
      if (q.has('fail')) LIM.fail.push({ code: q.get('fail'), n: +(q.get('n') || 1), action: q.get('action') || '' });
      if (q.has('free')) LIM.free = +q.get('free') < 0 ? null : +q.get('free');
      if (q.has('reset')) Object.assign(LIM, { max: 0, delay: 0, refuseUntil: 0, fail: [], free: null, calls: 0, refused: 0, maxInflight: 0 });
      return send(res, 200, JSON.stringify({ ...LIM, now: Date.now() }));
    }
    if (u.pathname === '/direct') { directOk = u.searchParams.get('on') !== '0'; return send(res, 200, JSON.stringify({ directOk })); }
  } catch (e) { return send(res, 500, JSON.stringify({ ok: false, error: 'server', detail: String((e && e.stack) || e) })); }
  send(res, 404, '{}');
}).listen(PORT, '127.0.0.1', () => console.log('e2e servers on', PORT));
