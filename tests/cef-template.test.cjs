/* beta 7.15 (CEF template) (the owner: "dxf for asplan and cef must be based from a template dxf. Context: client requires a different
   template with a different text font style, drawing style size and thickness. By changing the template dxf, the app can now accomodate plan
   creation from different clients using its template."): the CEF plan's DXF and PDF on a client's CEF template, in Node: the CEF plan's
   engine (vendor/cef 30_core.js, 40_iso.js, 50_export.js, as the editor's page runs it) with the plan builder's DXF reader (dxftpl.js) and
   the app's DXF printer (dxfpdf.js). Run: node --test tests/cef-template.test.cjs (or python3 tests/run_all.py --only cef-template).
   The made-up CEF templates (tests/fixtures/mkcefseed.py): cef-seed-made-up.dxf (its sheet CEF beside the drawing's first sheet, an empty
   Layout1) and cef-seed-made-up-active.dxf (CEF is the drawing's first sheet). Made-up CEF plans: the engine's sample site, named and with
   photos.
   - On the template: a sheet (layout) for each page of the CEF plan, in its order, each a copy of the template's CEF sheet (its frame, title
     block, logo block and picture, key plan), the drawing area aimed at its page at the page's scale (1:100 on paper for a 1:100 view), the
     other viewport still looking at nothing; the fields of each sheet filled (n OF N, date, scale, sheet title (in a block of the template:
     a copy for each sheet), the site, coordinates, the names as attributes, who exported); the CEF's texts in G-ESAA TEXT (bold in G-ESAA
     TEXT BOLD) at the look's size factor, its layers at the look's line weights (a layer the look puts on the client's layer: on it).
   - AutoCAD's rules: tools/dxf-seed/check_plan.py's checks (all but the plan's own placement check), ezdxf's audit (when Python has ezdxf),
     and the same checks here (handles, pointers, owners, the attributes, the layouts and their dictionary, the pictures).
   - The PDF (dxfpdf.js): a page for each sheet, on the template's paper (A3 landscape), with the fields as filled.
   - A template without its look (the CEF's own fonts and weights on the client's sheet); one the CEF cannot be printed on: why.
   - The sheet's own viewport told from the drawing area as AutoCAD writes a sheet not open (its number 0), or added when there is none.
   - With the synthesizer (dxfsynth.js) beside it: the CEF seeds it makes of its made-up clients (tests/fixtures/client-{a,b,c}-made-up.dxf: A1,
     A3 with a narrow drawing area, a sheet in inches), each page on the client's sheet at its scale (skipped without them).
   - Without a template: the CEF's DXF (with its layout tabs, and of the older kind), its PDF, its sheets and KML exactly as beta 7.13
     made them (SHA-256 of beta 7.13's output, the engine of 933ad3b on the same made-up plans).
   Every name, number and place is made up. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const T = require('../dxftpl.js');
const PDF = require('../dxfpdf.js');

const root = path.resolve(__dirname, '..');
const SEED = fs.readFileSync(path.join(__dirname, 'fixtures', 'cef-seed-made-up.dxf'), 'utf8');
const SEED_ACTIVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'cef-seed-made-up-active.dxf'), 'utf8');
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAMABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDasbfTXs0a4aMSnO7dLg9T2zWZcBFuJRHjYHIXBzxnio6K9GhhZ0qs6jqOSl0ey16HnVKqnBRUUrde5//Z';
const FOOT = 'EXPORTED BY JUAN DELA CRUZ - 09170000001 - DEMO CONTRACTOR - G-eSAA TEST';
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : Buffer.from(x)).digest('hex').slice(0, 16);

/* the engine as the editor's page loads it, in a context of its own: a fixed clock and made-up random numbers, so its output can be compared */
const FIXED = Date.UTC(2026, 10, 25, 4, 0, 0);
class FDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FIXED); } static now() { return FIXED; } }
function engine() {
  const ctx = vm.createContext({ console, Date: FDate, Math: Object.create(Math), TextEncoder, TextDecoder, Uint8Array, setTimeout, clearTimeout, Promise, atob, btoa });
  ctx.self = ctx; ctx.window = ctx;
  let seed = 7; ctx.Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'pdf-lib', 'pdf-lib.min.js'), 'utf8'), ctx, { filename: 'pdf-lib.min.js' });
  for (const f of ['30_core.js', '40_iso.js', '50_export.js']) vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'cef', f), 'utf8'), ctx, { filename: f });
  ctx.T = T;
  return ctx;
}
/* the made-up CEF plans: the engine's sample site; named (not sample); with photos; nearly empty; an unfenced site without coordinates */
const SKETCHES = `(() => {
  const out = {}, a = sampleSite(); out.sample = a;
  const b = sampleSite(); b.sample = false; Object.assign(b.site, { link: 'DEMO PROJECT', serial: 'OWO-0000-001', org: 'DEMO CONTRACTOR', by: 'Juan Dela Cruz', chk: 'Maria Santos', apr: 'Pedro Reyes' }); out.named = b;
  const c = JSON.parse(JSON.stringify(b)); c.photos = [{ id: 'p1', w: 16, h: 12, placed: true, x: 6, y: 5, dir: 30, cap: 'DEMO GATE' }, { id: 'p2', w: 16, h: 12, placed: false, cap: 'DEMO TOWER BASE' }, { id: 'p3', w: 12, h: 16, placed: true, x: 14, y: 12, dir: 200, cap: '' }]; out.photos = c;
  const d = blank(); Object.assign(d.site, { name: 'DEMO EMPTY', id: 'DEMO-0001', lat: 7.07, lon: 125.6 }); out.empty = d;
  const e = JSON.parse(JSON.stringify(b)); e.site.kind = 'unfenced'; e.site.lat = ''; out.unfenced = e;
  return JSON.parse(JSON.stringify(out));
})()`;
const E = engine(), SK = vm.runInContext(SKETCHES, E);
const DIMS = { 'photos/photo_01.jpg': [16, 12], 'photos/photo_02.jpg': [16, 12], 'photos/photo_03.jpg': [12, 16] };
/** The CEF plan sk on a template (text): { text (the DXF), sheets (each page's name, scale and title block), sd (the template as read) }. The
    sheets are laid out once for a plan and a drawing area, size factor and fields (the engine takes seconds): the two made-up templates share them. */
function onTpl(text, sk, o) {
  o = o || {}; E.ARG = { text, sk: JSON.parse(JSON.stringify(sk)), key: JSON.stringify([sk, o.opt || {}]), look: o.look === undefined ? null : o.look, opt: o.opt || {}, foot: FOOT, dims: o.dims || DIMS };
  return JSON.parse(vm.runInContext(`JSON.stringify((() => { const A = ARG, sd = CefTpl.seed(A.text, T, A.look, { name: 'DEMO CLIENT A3', foot: A.foot }), info = { W: sd.W, H: sd.H, u: sd.u, txk: sd.txk, style: sd.style, bold: sd.bold, has: [...sd.has].sort() };
    const C = globalThis.CACHE || (globalThis.CACHE = {}), key = A.key + JSON.stringify([sd.W, sd.H, sd.txk, sd.has.has('EXPORTED_BY')]), sheets = C[key] || (C[key] = tplSheets(A.sk, sd, A.opt)), text = CefTpl.write(sheets, sd, T, { dims: A.dims, fields: tb => cefFields(A.sk, tb, { foot: A.foot }) });
    return { text, sd: info, sheets: sheets.map(s => ({ name: s.name, N: s.N, s: s.s, tb: s.prims.tb, images: s.images.map(i => i.file) })), last: CefTpl.write.last }; })())`, E));      /* (as plain data of this context's) */
}

/* ---- the DXF read back ---- */
const typ = (r) => r[0][1], get = (r, c, d) => { for (let i = 1; i < r.length; i++) if (r[i][0] === c) return r[i][1]; return d; }, all = (r, c) => r.filter((p, i) => i > 0 && p[0] === c).map((p) => p[1]);
const num = (r, c, d) => { const v = parseFloat(get(r, c)); return Number.isFinite(v) ? v : d; };
const owner = (r) => { let g = 0; for (let i = 1; i < r.length; i++) { const [c, v] = r[i]; if (c === 102) { g = String(v).startsWith('{') ? 1 : 0; continue; } if (c === 330 && !g) return v; } return null; };
const textOf = (r) => (typ(r) === 'MTEXT' ? all(r, 3).join('') : '') + String(get(r, 1, ''));
function read(text) {
  const d = new T.Doc(text), S = T.structure(d), sheets = S.layouts.filter((L) => L.name !== 'Model').sort((a, b) => +get(a.rec, 71) - +get(b.rec, 71)).map((L) => {
    const br = S.br.get(L.brh), bn = get(br, 2), ents = bn === '*Paper_Space' ? S.E.filter((e) => String(get(e, 67, '0')).trim() === '1') : S.blocks.get(bn).ents;
    const vps = ents.filter((e) => typ(e) === 'VIEWPORT'), ins = ents.filter((e) => typ(e) === 'INSERT');
    const inBlocks = (names, seen = new Set()) => { const out = []; for (const nm of names) { if (seen.has(nm)) continue; seen.add(nm); const b = S.blocks.get(nm); if (!b) continue; out.push(...b.ents); out.push(...inBlocks(b.ents.filter((e) => typ(e) === 'INSERT').map((e) => get(e, 2)), seen)); } return out; };
    const texts = ents.concat(inBlocks(ins.map((e) => get(e, 2)))).filter((e) => ['TEXT', 'MTEXT', 'ATTRIB'].includes(typ(e))).map(textOf);
    return { name: L.name, tab: +get(L.rec, 71), rec: L.rec, bn, ents, vps, ins: ins.map((e) => get(e, 2)), texts, layers: [...new Set(ents.map((e) => get(e, 8)))] };
  });
  const model = S.E.filter((e) => owner(e) === S.modelH && String(get(e, 67, '0')).trim() !== '1');
  const layer = (nm) => S.T.find((r) => typ(r) === 'LAYER' && get(r, 2) === nm);
  return { d, S, sheets, model, layer };
}
/** AutoCAD's rules, the ones tools/dxf-seed/check_plan.py checks that are not the plan's own: problems in plain words. */
function rules(text) {
  const R = read(text), { d, S } = R, P = [], recs = [];
  for (const nm of ['TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) for (const r of d.sec(nm).recs) recs.push([nm, r]);
  const hOf = (r) => (typ(r) === 'DIMSTYLE' ? get(r, 105) : get(r, 5)), live = new Map();
  for (const [, r] of recs) { const h = hOf(r); if (!h) continue; if (live.has(h)) P.push(`duplicate handle ${h}`); live.set(h, r); }
  for (const [, r] of recs) for (let i = 1; i < r.length; i++) { const [c, v] = r[i]; if (((c >= 320 && c <= 369) || c === 390) && String(v).trim() !== '0' && !live.has(String(v).trim())) P.push(`${typ(r)} ${hOf(r)}: ${c} -> ${v} missing`); }
  const seed = parseInt(d.headerVar('$HANDSEED')[1], 16), mx = Math.max(...[...live.keys()].map((h) => parseInt(h, 16)));
  if (!(seed > mx)) P.push(`$HANDSEED ${seed.toString(16)} not above ${mx.toString(16)}`);
  const vp = S.T.filter((r) => typ(r) === 'VPORT'); if (vp.length !== 1 || !/^\*ACTIVE$/i.test(get(vp[0], 2))) P.push('VPORT: one *Active wanted');
  const brName = new Map([...S.br].map(([h, r]) => [h, get(r, 2)])), paperH = get(S.brByName.get('*Paper_Space'), 5);
  let cur = null; for (const r of d.sec('BLOCKS').recs) { const t = typ(r); if (t === 'BLOCK') { cur = get(r, 2); continue; } if (t === 'ENDBLK') { cur = null; continue; } if (cur && !['ATTRIB', 'SEQEND', 'VERTEX'].includes(t) && brName.get(owner(r)) !== cur) P.push(`${t} ${get(r, 5)} in block ${cur} owned by ${owner(r)}`); }
  const ES = d.sec('ENTITIES').recs;
  ES.forEach((r, k) => {
    const t = typ(r); if (['ATTRIB', 'SEQEND', 'VERTEX'].includes(t)) return;
    const want = String(get(r, 67, '0')).trim() === '1' ? paperH : S.modelH; if (owner(r) !== want) P.push(`${t} ${get(r, 5)} owner ${owner(r)} (its space: ${want})`);
    if (t === 'INSERT' && String(get(r, 66, '0')).trim() === '1') { let j = k + 1; while (j < ES.length && typ(ES[j]) === 'ATTRIB') { if (owner(ES[j]) !== get(r, 5)) P.push(`ATTRIB ${get(ES[j], 5)} not its INSERT's`); j++; } if (typ(ES[j]) !== 'SEQEND') P.push(`INSERT ${get(r, 5)}: no SEQEND`); }
  });
  for (const nm of ['BLOCKS', 'ENTITIES']) { const A = d.sec(nm).recs; A.forEach((r, k) => { if (typ(r) === 'ATTRIB' && !['INSERT', 'ATTRIB'].includes(typ(A[k - 1]))) P.push(`stray ATTRIB ${get(r, 5)}`); }); }
  const O = d.sec('OBJECTS').recs, root = O[0], entry = (nm) => { const k = root.findIndex((p) => p[0] === 3 && p[1] === nm); return k > 0 ? live.get(root[k + 1][1]) : null; };
  const LD = entry('ACAD_LAYOUT'), names = []; for (let i = 1; i < LD.length; i++) if (LD[i][0] === 3) names.push(LD[i][1]);
  for (const L of S.layouts) { if (!names.includes(L.name)) P.push(`layout ${L.name} not in ACAD_LAYOUT`); const br = S.br.get(L.brh); if (!br || get(br, 340) !== get(L.rec, 5)) P.push(`layout ${L.name}: its block record does not name it`); }
  if (new Set(R.sheets.map((s) => s.tab)).size !== R.sheets.length || R.sheets.some((s, i) => s.tab !== i + 1)) P.push(`tab order ${R.sheets.map((s) => s.tab)}`);
  if (new Set(R.sheets.map((s) => s.bn)).size !== R.sheets.length || R.sheets.filter((s) => s.bn === '*Paper_Space').length !== 1) P.push('each sheet its own paper space block');
  const ID = entry('ACAD_IMAGE_DICT'), named = new Set(ID ? all(ID, 350) : []);
  for (const r of O) if (typ(r) === 'IMAGEDEF' && !named.has(get(r, 5))) P.push(`IMAGEDEF ${get(r, 5)} not in ACAD_IMAGE_DICT`);
  for (const [, r] of recs) if (typ(r) === 'IMAGE') { const df = live.get(get(r, 340)), rx = live.get(get(r, 360)); if (!df || typ(df) !== 'IMAGEDEF') P.push(`IMAGE ${get(r, 5)}: no IMAGEDEF`); if (!rx || typ(rx) !== 'IMAGEDEF_REACTOR' || owner(rx) !== get(r, 5)) P.push(`IMAGE ${get(r, 5)}: not its own reactor`); }
  for (const [, r] of recs) if (['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(typ(r)) && /@@\w+@@/.test(textOf(r))) P.push(`${typ(r)} ${get(r, 5)}: field left ${textOf(r)}`);
  return P;
}
function checkPlan(text) {      /* tools/dxf-seed/check_plan.py (standard library only): its findings by kind */
  const py = spawnSync('python3', ['-c', 'import sys'], { encoding: 'utf8' }); if (py.error || py.status) return null;
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gesaa-ceft-')), 'cef.dxf'); fs.writeFileSync(f, text);
  const r = spawnSync('python3', ['-I', path.join(root, 'tools', 'dxf-seed', 'check_plan.py'), f, '--list', '5'], { encoding: 'utf8' }); fs.rmSync(path.dirname(f), { recursive: true, force: true });
  const out = {}; for (const m of r.stdout.matchAll(/^ {2}(\w+)\s+(OK|\d+ problem\(s\))/gm)) out[m[1]] = m[2]; out.text = r.stdout; return out;
}
function audit(text) {      /* ezdxf's audit, with a Python that has ezdxf (GESAA_PY, else python3; none: null) */
  for (const py of [process.env.GESAA_PY, 'python3'].filter(Boolean)) {
    if (spawnSync(py, ['-c', 'import ezdxf'], { encoding: 'utf8' }).status !== 0) continue;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gesaa-ceft-')), f = path.join(dir, 'cef.dxf'); fs.writeFileSync(f, text);
    const r = spawnSync(py, ['-I', '-c', 'import sys, ezdxf\nfrom ezdxf import recover\ndoc, a = recover.readfile(sys.argv[1])\nb = doc.audit()\nprint(len(a.errors), len(b.errors), len(b.fixes))\nfor e in b.errors[:5]: print(e.message)', f], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true }); return r.stdout.trim();
  }
  return null;
}

test('on the template: a sheet for each page, a copy of its CEF sheet with its frame and fields, the drawing area aimed at the page at its scale', () => {
  for (const [tn, tpl] of [['beside Layout1', SEED], ['the first sheet', SEED_ACTIVE]]) {
    const r = onTpl(tpl, SK.named), R = read(r.text), N = r.sheets.length;
    assert.deepEqual(r.sd, { W: 398, H: 239, u: 1, txk: 1.1, style: 'G-ESAA TEXT', bold: 'G-ESAA TEXT BOLD', has: ['APPROVED_BY', 'CHECKED_BY', 'COMPANY_NAME', 'COORDINATES', 'DATE', 'DWG_NO', 'EXPORTED_BY', 'ISSUE_NO', 'LINK', 'LOCATION', 'PLAN_KIND', 'PREPARED_BY', 'PROJECT_TYPE', 'SCALE', 'SERIAL', 'SHEET_NO', 'SHEET_TITLE', 'SITE_ID', 'SITE_NAME'] }, tn);
    assert.deepEqual(R.sheets.map((s) => s.name), ['COVER PAGE', 'CONTENTS', 'LEGEND', 'ISOMETRIC', 'TOP VIEW', 'DETAILS'], `${tn}: a sheet for each page, in its order (the template's own sheets left out)`);
    assert.deepEqual(r.sheets.map((s) => s.name), ['COVER', 'CONTENTS', 'LEGEND', 'ISOMETRIC', 'TOP VIEW', 'DETAILS']);
    R.sheets.forEach((s, i) => {
      const P = r.sheets[i], want = { SHEET: `${i + 1} OF ${N}`, DATE: vm.runInContext('isoDate()', E), TITLE: P.tb.sheet, SCALE: P.tb.scale, PROJECT: 'DEMO PROJECT', SITE: 'MIN0000 SAMPLE SITE', LOCATION: 'SAMPLE SITE_MIN0000', SERIAL: 'OWO-0000-001', COORD: "7°06'36.00\"N 124°49'48.00\"E", BY: 'JUAN DELA CRUZ', CHK: 'MARIA SANTOS', APR: 'PEDRO REYES', ORG: 'DEMO CONTRACTOR', KIND: 'AS-PLAN - DEMO PROJECT', FOOT: FOOT };
      const has = (v) => s.texts.some((t) => t.replace(/%%d/g, '°').replace(/\\{|\\}|\{\\fArial\|b1\|i0\|c0\|p34;|\}/g, '').includes(v));
      for (const [k, v] of Object.entries(want)) if (v) assert.ok(has(v), `${tn}, ${s.name}: ${k} ${v} (${s.texts.join(' | ')})`);
      assert.ok(s.layers.includes('DEMO-BORDER') && s.layers.includes('DEMO-TITLE') && s.layers.includes('DEMO-LOGO'), `${tn}, ${s.name}: the client's frame, title block and logo`);
      assert.ok(s.ins.includes('DEMO_CLIENT_LOGO') && s.ins.includes('DEMO_TB_NAMES') && s.ents.some((e) => typ(e) === 'IMAGE'), `${tn}, ${s.name}: its logo block, names block and logo picture`);
      assert.ok(s.ins.some((n) => /^DEMO_STAMP_CEF\d+$/.test(n)) && !s.ins.includes('DEMO_STAMP'), `${tn}, ${s.name}: a copy of the block with the sheet's title, its own`);
      // the drawing area (the largest viewport) looks at its page, straight down, at the page's scale; the key plan at nothing
      const [page, ...vps] = s.vps, area = vps.sort((a, b) => num(b, 40) * num(b, 41) - num(a, 40) * num(a, 41))[0], key = vps[1];
      assert.ok(page && area && key && num(page, 40) > num(area, 40), `${tn}, ${s.name}: the sheet's own viewport first, then the drawing area and the key plan`);
      assert.deepEqual([num(area, 40), num(area, 41), num(area, 10), num(area, 20)], [398, 239, 210, 166.5]);
      const k = P.N ? 1 / P.s : 1 / r.sheets.find((q) => q.name === 'TOP VIEW').s, vh = num(area, 45), cx = num(area, 12), cy = num(area, 22);
      assert.ok(Math.abs(vh - 239 * k) < 1e-4 && Math.abs(cy - 239 * k / 2) < 1e-4, `${tn}, ${s.name}: view height ${vh}, the page's ${239 * k}`);
      if (P.N) assert.ok(Math.abs(num(area, 41) / vh - 1000 / P.N) < 1e-6, `${tn}, ${s.name}: 1:${P.N} on paper (${1000 / P.N} mm a metre)`);
      const inView = R.model.filter((e) => ['LINE', 'LWPOLYLINE', 'TEXT', 'INSERT', 'CIRCLE'].includes(typ(e))).filter((e) => Math.abs(num(e, 10, 1e9) - cx) < num(area, 40) * k / 2 && Math.abs(num(e, 20, 1e9) - cy) < vh / 2);
      assert.ok(inView.length > 5, `${tn}, ${s.name}: its page is what its drawing area shows (${inView.length} things)`);
      const kx = num(key, 12), kh = num(key, 45), kw = kh * num(key, 40) / num(key, 41);
      assert.ok(!R.model.some((e) => Math.abs(num(e, 10, 1e9) - kx) < kw / 2 && Math.abs(num(e, 20, 1e9) - num(key, 22)) < kh / 2), `${tn}, ${s.name}: the key plan still looks at nothing`);
    });
    assert.equal(R.sheets.filter((s) => s.bn === '*Paper_Space').map((s) => s.name).join(), 'COVER PAGE', `${tn}: the first sheet on the paper space every drawing has`);
    // the scales: the top view at 1:100 as the app's frame has it, the isometric at its own; the scale fields say so
    assert.deepEqual(r.sheets.filter((s) => s.N).map((s) => [s.name, s.tb.scale]), [['ISOMETRIC', '1:200 ALONG AXES'], ['TOP VIEW', '1:100']], tn);
    assert.equal(r.last.fields, 19 * N, `${tn}: every field of every sheet filled`);
  }
});

test('the look: the CEF\'s texts in G-ESAA TEXT (bold in G-ESAA TEXT BOLD) at its size factor, its layers at its line weights, CEF-TEXT on the client\'s layer', () => {
  const r = onTpl(SEED, SK.named), R = read(r.text), texts = R.model.filter((e) => typ(e) === 'TEXT');
  const blockTexts = []; for (const [nm, b] of R.S.blocks) if (!/^\*|^DEMO_/.test(nm)) blockTexts.push(...b.ents.filter((e) => typ(e) === 'TEXT'));
  const styles = new Set(texts.concat(blockTexts).map((e) => get(e, 7)));
  assert.deepEqual([...styles].sort(), ['G-ESAA TEXT', 'G-ESAA TEXT BOLD'], 'every text of the CEF in the template\'s styles');
  assert.ok(texts.some((e) => get(e, 1) === 'TOP VIEW' && get(e, 7) === 'G-ESAA TEXT'), 'the view title');
  assert.ok(texts.some((e) => get(e, 1) === 'CEF TABLE' && get(e, 7) === 'G-ESAA TEXT BOLD'), 'a bold heading in the bold style');
  // the size factor 1.1: the view title, 5 mm on the app's sheet, 5.5 mm on paper (in model units, at the top view's scale)
  const top = r.sheets.find((s) => s.name === 'TOP VIEW'), k = 1 / top.s, title = texts.find((e) => get(e, 1) === 'TOP VIEW' && Math.abs(num(e, 40) - 5 * 1.1 * k) < 1e-6);
  assert.ok(title, `TOP VIEW at 5.5 mm on paper: ${texts.filter((e) => get(e, 1) === 'TOP VIEW').map((e) => num(e, 40) / k)}`);
  // line weights: the look's classes (cable 80, pole 53, symbol 40, leader 9); a layer with none at the CEF's own (CEF-TEXT-PROPOSED 0.15 mm)
  for (const [nm, lw] of [['P-UG_FOC', 80], ['P-AERIAL_FOC', 80], ['CEF-PROPOSED', 53], ['ODC', 40], ['CEF-TOWER', 40], ['CEF-FRAME', 40], ['CEF-DIM', 9], ['CEF-LENGTH', 9], ['CEF-TEXT-PROPOSED', 15]]) {
    const L = R.layer(nm); assert.ok(L, `layer ${nm}`); assert.equal(+get(L, 370), lw, `${nm}: ${lw / 100} mm`);
  }
  assert.equal(R.layer('CEF-TEXT'), undefined, 'CEF-TEXT: the client\'s DEMO-TEXT instead');
  assert.ok(texts.some((e) => get(e, 8) === 'DEMO-TEXT') && !texts.some((e) => get(e, 8) === 'CEF-TEXT'));
  assert.equal(get(R.layer('CEF-LOT'), 6), 'CEF-DASHED', 'a dashed layer: the CEF\'s own dashes (the template\'s DASHED may be another)');
});

test('AutoCAD\'s rules: the checks of tools/dxf-seed/check_plan.py, ezdxf\'s audit and the same checks here, on both templates and every made-up plan', () => {
  const PLANS = [['named', {}], ['photos', {}], ['empty', {}], ['named', { details: false, photos: false }]];
  for (const [tn, tpl] of [['beside Layout1', SEED], ['the first sheet', SEED_ACTIVE]]) for (const [sn, opt] of PLANS) { const sk = SK[sn];
    const r = onTpl(tpl, sk, { opt }), label = `${tn}, ${sn}, ${JSON.stringify(opt)}`;
    assert.deepEqual(rules(r.text), [], label);
    const cp = checkPlan(r.text);
    if (cp) for (const k of ['file', 'handles', 'tables', 'attributes', 'entities', 'objects', 'images', 'texts']) {
      /* (the photos and logos in their folders, photos/ and logos/ beside the DXF, as the CEF's DXF has them since beta 4.3: the plan's
         own rule is a file name with no folder) */
      const own = k === 'images' ? cp.text.split('\n').filter((x) => /^ {6}IMAGEDEF/.test(x)).every((x) => /file name with a folder: (photos|logos)\/\w+\.(jpg|png)$/.test(x)) : false;
      if (!own) assert.equal(cp[k], 'OK', `${label}: check_plan.py ${k}\n${cp.text}`);
    }
    if (sn === 'photos') assert.ok((r.text.match(/\r\n {2}0\r\nIMAGEDEF\r\n/g) || []).length === 3 + 1 && r.text.includes('photos/photo_01.jpg'), `${label}: the photos (and the template's logo) as linked pictures`);
  }
  const a = audit(onTpl(SEED, SK.photos).text), b = audit(onTpl(SEED_ACTIVE, SK.named).text);
  if (a != null) { assert.match(a, /^0 0 \d+/, `ezdxf: ${a}`); assert.match(b, /^0 0 \d+/, `ezdxf: ${b}`); }
});

test('the PDF (dxfpdf.js): a page for each sheet on the template\'s paper, with its fields as filled, the photos printed', async () => {
  const jpg = Buffer.from(JPG.split(',')[1], 'base64'), r = onTpl(SEED, SK.photos), pdf = await PDF.toPdf(r.text, { images: { 'photo_01.jpg': jpg, 'photo_02.jpg': jpg, 'photo_03.jpg': jpg }, title: 'DEMO CEF' });
  const s = Buffer.from(pdf).toString('latin1'), N = r.sheets.length;
  assert.deepEqual(pdf.report.sheets, ['COVER PAGE', 'CONTENTS', 'LEGEND', 'ISOMETRIC', 'TOP VIEW', 'DETAILS', 'PHOTOS 1']);
  assert.deepEqual(pdf.report.missing, ['demo_client_logo.png'], 'only the template\'s own logo file (not supplied) missing');
  assert.equal((s.match(/\/MediaBox \[0 0 1190\.55 841\.89\]/g) || []).length, N, 'A3 landscape, the template\'s paper');
  for (let i = 1; i <= N; i++) assert.ok(s.includes(`(${i} OF ${N}) Tj`), `${i} OF ${N}`);
  for (const t of ['(COVER PAGE) Tj', '(TOP VIEW) Tj', '(1:100) Tj', '(DEMO CLIENT) Tj', '(OWO-0000-001) Tj', '(DEMO GATE) Tj']) assert.ok(s.includes(t), t);
  assert.ok(!s.includes('GENERIC FRAME'), 'not the app\'s generic frame');
  assert.ok(pdf.report.pictures >= 2, `the photos printed: ${pdf.report.pictures}`);
});

test('a template without its look: the CEF\'s own fonts and weights on the client\'s sheet; one the CEF cannot be printed on says why', () => {
  const plain = SEED.replace(/\r?\n\s*3\r?\nG-ESAA_LOOK\r?\n\s*350\r?\n[0-9A-F]+\r?\n/, '\n'), r = onTpl(plain, SK.named), R = read(r.text), texts = R.model.filter((e) => typ(e) === 'TEXT');
  assert.ok(plain !== SEED && r.sd.txk === 1 && r.sd.style === null, 'no look read');
  assert.deepEqual([...new Set(texts.map((e) => get(e, 7)))].sort(), ['CEF-BOLD', 'Standard']);
  assert.equal(+get(R.layer('P-UG_FOC'), 370), 60, 'the CEF\'s own 0.60 mm'); assert.ok(R.layer('CEF-TEXT'), 'its own text layer');
  assert.deepEqual(rules(r.text), []);
  assert.ok(R.sheets.length === 6 && R.sheets.every((s) => s.layers.includes('DEMO-BORDER')), 'still the client\'s sheet');
  const err = (text) => { try { onTpl(text, SK.named); return ''; } catch (e) { return e.message; } };
  assert.equal(err(SEED.replace(/\nCEF\r?\n/g, '\nNOT CEF\n')), 'the template has no CEF sheet');
  assert.equal(err(SEED.replace(/\n 40\r?\n398\.0\r?\n 41\r?\n239\.0\r?\n/, '\n 40\n120.0\n 41\n80.0\n')), 'its drawing area (120 x 80 mm) is too small for the CEF sheets');
});

test('the sheet\'s own viewport: as AutoCAD writes a sheet that was not open (its number 0) it is still not the drawing area; a sheet without one gets one, so the PDF prints the drawing area', async () => {
  const variant = (f) => { const d = new T.Doc(SEED), S = T.structure(d), L = S.layouts.find((q) => q.name === 'CEF'), ents = S.blocks.get(get(S.br.get(L.brh), 2)).ents, v = ents.find((e) => typ(e) === 'VIEWPORT'); f(d, ents, v); return d.text(); };
  const zero = variant((d, ents, v) => { v.find((p) => p[0] === 69)[1] = '     0'; }), none = variant((d, ents, v) => { ents.splice(ents.indexOf(v), 1); const B = d.sec('BLOCKS').recs; B.splice(B.indexOf(v), 1); d.index(); });
  for (const [tn, text] of [['its number 0', zero], ['none', none]]) {
    const r = onTpl(text, SK.named), R = read(r.text);
    assert.deepEqual([r.sd.W, r.sd.H], [398, 239], `${tn}: the drawing area`);
    assert.deepEqual(rules(r.text), [], tn);
    const k0 = 1 / r.sheets.find((q) => q.name === 'TOP VIEW').s;
    R.sheets.forEach((s, i) => { const [page, ...vps] = s.vps, area = vps.find((v) => num(v, 40) === 398), k = r.sheets[i].N ? 1 / r.sheets[i].s : k0;
      assert.ok(page && area && num(page, 40) > 420 && Math.abs(num(area, 45) - 239 * k) < 1e-6, `${tn}, ${s.name}: the sheet's own viewport first, the drawing area aimed at its page`); });
    const pdf = await PDF.toPdf(r.text, { images: {} }), str = Buffer.from(pdf).toString('latin1');
    assert.equal(pdf.report.sheets.length, 6); assert.ok(str.includes('(TOP VIEW) Tj') && str.includes('(CEF TABLE) Tj'), `${tn}: the drawing area printed`);
  }
});

/* the synthesizer's own CEF seeds (dxfsynth.js, its made-up clients' templates: tests/fixtures/client-{a,b,c}-made-up.dxf; skipped where they
   are not): A1 in millimetres, A3 with a narrow drawing area, and a sheet in inches */
const SYNTH = fs.existsSync(path.join(root, 'dxfsynth.js')) && ['a', 'b', 'c'].every((c) => fs.existsSync(path.join(__dirname, 'fixtures', `client-${c}-made-up.dxf`)));
test('on the synthesizer\'s CEF seeds of its made-up clients: every page on the client\'s sheet, its fields filled, at its scale, AutoCAD\'s rules, printed', { skip: !SYNTH && 'needs dxfsynth.js and its made-up clients (tests/fixtures/client-a-made-up.dxf …)' }, async () => {
  const G = require('../dxfsynth.js');
  for (const c of ['a', 'b', 'c']) {
    const src = fs.readFileSync(path.join(__dirname, 'fixtures', `client-${c}-made-up.dxf`), 'utf8'), dg = G.digest(src, `client-${c}-made-up.dxf`), made = G.make(src, G.proposal(dg), dg);
    assert.ok(made && made.cef, `client ${c}: a CEF seed`);
    const r = onTpl(made.cef, SK.named), R = read(r.text), N = r.sheets.length, mm = ((G.lookOf(made.cef) || {}).sheet || {}).mm;
    assert.equal(r.sd.u, mm, `client ${c}: its paper unit (${mm} mm)`);
    assert.deepEqual(R.sheets.map((s) => s.name), ['COVER PAGE', 'CONTENTS', 'LEGEND', 'ISOMETRIC', 'TOP VIEW', 'DETAILS'], `client ${c}`);
    assert.deepEqual(rules(r.text), [], `client ${c}`);
    const cp = checkPlan(r.text); if (cp) for (const k of ['file', 'handles', 'tables', 'attributes', 'entities', 'objects', 'texts']) assert.equal(cp[k], 'OK', `client ${c}: check_plan.py ${k}\n${cp.text}`);
    R.sheets.forEach((s, i) => { if (r.sd.has.includes('SHEET_NO')) assert.ok(s.texts.some((t) => t.includes(`${i + 1} OF ${N}`)), `client ${c}, ${s.name}: ${i + 1} OF ${N}`); });
    const top = r.sheets.find((q) => q.name === 'TOP VIEW'), area = R.sheets[4].vps.slice(1).sort((a, b) => num(b, 40) * num(b, 41) - num(a, 40) * num(a, 41))[0];
    assert.ok(Math.abs(num(area, 41) * mm / num(area, 45) - 1000 / top.N) < 1e-6, `client ${c}: the top view at 1:${top.N} on the client's paper`);
    const pdf = await PDF.toPdf(r.text, { images: {} }); assert.equal(pdf.report.sheets.length, N, `client ${c}: a page for each sheet`);
  }
});

test('without a template: the CEF\'s DXF (with its layout tabs, and of the older kind), its PDF, sheets and KML as beta 7.13 made them, byte for byte', async () => {
  // [plan, file, SHA-256 (first 16) of what beta 7.13 (933ad3b: vendor/cef/30_core.js, 40_iso.js, 50_export.js) made of it, in this same context: each plan's
  // sheets made twice (every page; no details or photo pages), its DXFs, sheets and PDF made of them, in this order]
  const WANT = [['sample', 'dxf all', 'a5e50ee95f0f657e'], ['sample', 'dxf no det/ph', '07102190d85fe5e9'], ['sample', 'dxf R12', 'fe84abd3967f748c'], ['sample', 'sheets json', '1f1cdbc6e2dbd801'], ['sample', 'pdf', 'a1aca5ae042228d8'], ['sample', 'kml', '76a27737b1944030'],
    ['named', 'dxf all', '8bbc7c17440f648a'], ['named', 'dxf no det/ph', '735dbb2d8bfef23c'], ['named', 'dxf R12', 'b383ab795f986a26'], ['named', 'sheets json', '5611d28833b1c2a4'], ['named', 'pdf', '6bc3aaf261e91732'], ['named', 'kml', '76a27737b1944030'],
    ['photos', 'dxf all', 'be9185ea2f731c4c'], ['photos', 'dxf no det/ph', '26dd351102275f8c'], ['photos', 'dxf R12', '023fddf19ed04719'], ['photos', 'sheets json', 'daf8372bfbb74b81'], ['photos', 'pdf', '76b60c4e21fd5356'], ['photos', 'kml', '366c93bf16ce004e'],
    ['empty', 'dxf all', 'e011696164a4dc5e'], ['empty', 'dxf no det/ph', 'e011696164a4dc5e'], ['empty', 'dxf R12', '061d7de859da70ee'], ['empty', 'sheets json', '3b254214dc8fc0df'], ['empty', 'pdf', '876026df87dd4c8b'], ['empty', 'kml', '079675d22df2e5f4'],
    ['unfenced', 'dxf all', '1c90d55a9638804c'], ['unfenced', 'dxf no det/ph', '65899f0c7366587d'], ['unfenced', 'dxf R12', 'f29f731e06764839'], ['unfenced', 'sheets json', '06e8bb88353106c3'], ['unfenced', 'pdf', 'd12afa0ef291b3c0'], ['unfenced', 'kml', '3973e022e93220f9']];
  const X = engine(), sk = vm.runInContext(SKETCHES, X), JOBS = {
    'dxf all': `(S1 = buildSheets(SK, {}), S2 = buildSheets(SK, { details: false, photos: false }), sheetsDXF(S1, { dims: { 'photos/photo_01.jpg': [16, 12], 'photos/photo_03.jpg': [12, 16] } }))`, 'dxf no det/ph': `sheetsDXF(S2, { dims: {} })`,
    'dxf R12': `sheetsDXF(S2, { old: true })`, 'sheets json': `JSON.stringify(S1)`, pdf: `toPDF(S1, IMG, SK)`, kml: `(() => { const g = geo(SK); return g ? toKML(SK, g) : '-'; })()` };
  const got = []; vm.runInContext('var S1, S2;', X);
  for (const [pn, what] of WANT) { if (what === 'dxf all') { X.SK = JSON.parse(JSON.stringify(sk[pn])); X.IMG = { p1: JPG, p2: JPG, p3: JPG }; } got.push([pn, what, sha(await vm.runInContext(JOBS[what], X))]); }
  assert.deepEqual(got, WANT, 'as beta 7.13 made them');
});
