/* v2.42.8: the plan DXF cleanup (dxftpl.js clean / repair) on a synthetic drawing with the faults LibreDWG left in the company
   template (no company data: every record here is made up). Checks that each fault is repaired, that nothing drawn moves, that a
   second run changes nothing (byte for byte), and that tools/dxf-seed/check_plan.py finds no problem.
       node tests/dxf-cleanup.test.cjs [out.dxf]      (writes the repaired sample for `ezdxf audit` when a path is given) */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const T = require(path.join(__dirname, '..', 'dxftpl.js'));
let fails = 0;
const ok = (cond, name, info) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info != null ? ` | ${String(info).slice(0, 300)}` : ''}`); if (!cond) fails++; };

// ---- the synthetic drawing (UTM-like coordinates: the plan near E 785000, N 786000) ----
const P = []; const put = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) P.push([pairs[i], pairs[i + 1]]); };
const sec = (name, fn) => { put(0, 'SECTION', 2, name); fn(); put(0, 'ENDSEC'); };
const tbl = (name, h, n, fn) => { put(0, 'TABLE', 2, name, 5, h, 330, '0', 100, 'AcDbSymbolTable', 70, n); fn(); put(0, 'ENDTAB'); };
const rec = (t, h, own, ...rest) => put(0, t, 5, h, 330, own, ...rest);
const vport = (h, name) => rec('VPORT', h, '8', 100, 'AcDbSymbolTableRecord', 100, 'AcDbViewportTableRecord', 2, name, 70, 0, 10, '0.0', 20, '0.0', 11, '1.0', 21, '1.0',
  12, '50.0', 22, '50.0', 13, '0.0', 23, '0.0', 14, '1.0', 24, '1.0', 15, '10.0', 25, '10.0', 16, '0.0', 26, '0.0', 36, '1.0', 17, '0.0', 27, '0.0', 37, '0.0', 40, '100.0', 41, '1.6', 42, '50.0', 43, '0.0', 44, '0.0', 50, '0.0', 51, '0.0', 71, 0, 72, 100, 73, 1, 74, 3, 75, 0, 76, 0, 77, 0, 78, 0, 281, 0, 65, 1, 110, '0.0', 120, '0.0', 130, '0.0', 111, '1.0', 121, '0.0', 131, '0.0', 112, '0.0', 122, '1.0', 132, '0.0', 79, 0, 146, '0.0');
const layer = (h, name, extra) => rec('LAYER', h, '2', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, name, 70, 0, 62, 7, 6, 'Continuous', 370, -3, ...(extra || []));
const ltype = (h, name) => rec('LTYPE', h, '5', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, name, 70, 0, 3, '', 72, 65, 73, 0, 40, '0.0');
const style = (h, name, font, face) => rec('STYLE', h, '3', 100, 'AcDbSymbolTableRecord', 100, 'AcDbTextStyleTableRecord', 2, name, 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, font, 4, '', ...(face ? [1001, 'ACAD', 1000, face, 1071, 34] : []));
const brec = (h, name, layout, extra) => rec('BLOCK_RECORD', h, '1', ...(extra || []), 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, name, 340, layout || '0', 70, 0, 280, 1, 281, 0);
const block = (h, endh, own, name, ents) => { put(0, 'BLOCK', 5, h, 330, own, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockBegin', 2, name, 70, 0, 10, '0.0', 20, '0.0', 30, '0.0', 3, name, 1, ''); ents(); put(0, 'ENDBLK', 5, endh, 330, own, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockEnd'); };
const line = (h, own, lay, x0, y0, x1, y1) => rec('LINE', h, own, 100, 'AcDbEntity', 8, lay, 100, 'AcDbLine', 10, x0, 20, y0, 30, '0.0', 11, x1, 21, y1, 31, '0.0');
const square = (h, own, lay, x, y, s) => rec('LWPOLYLINE', h, own, 100, 'AcDbEntity', 8, lay, 100, 'AcDbPolyline', 90, 4, 70, 1, 43, '0.0', 10, x, 20, y, 10, x + s, 20, y, 10, x + s, 20, y + s, 10, x, 20, y + s);
const layout = (h, name, br, tab) => rec('LAYOUT', h, '1A', 100, 'AcDbPlotSettings', 1, '', 2, 'none_device', 4, '', 6, '', 40, '0.0', 41, '0.0', 42, '0.0', 43, '0.0', 44, '0.0', 45, '0.0', 46, '0.0', 47, '0.0', 48, '0.0', 49, '0.0', 140, '0.0', 141, '0.0', 142, '1.0', 143, '1.0', 70, 0, 72, 0, 73, 0, 74, 0, 7, '', 75, 0, 147, '1.0', 148, '0.0', 149, '0.0',
  100, 'AcDbLayout', 1, name, 70, 1, 71, tab, 10, '0.0', 20, '0.0', 11, '420.0', 21, '297.0', 12, '0.0', 22, '0.0', 32, '0.0', 14, '0.0', 24, '0.0', 34, '0.0', 15, '0.0', 25, '0.0', 35, '0.0', 146, '0.0', 13, '0.0', 23, '0.0', 33, '0.0', 16, '1.0', 26, '0.0', 36, '0.0', 17, '0.0', 27, '1.0', 37, '0.0', 76, 0, 330, br);
const FX = 20000000, FY = 3000000; // the far block is drawn about 20,000 km from its base point, like the template's NAP blocks
put(999, 'LibreDWG 0.14.8641 (synthetic test drawing)');
sec('HEADER', () => put(9, '$ACADVER', 1, 'AC1032', 9, '$DWGCODEPAGE', 3, 'ANSI_1252', 9, '$INSBASE', 10, '0.0', 20, '0.0', 30, '0.0', 9, '$EXTMIN', 10, '-11488.4', 20, '-12308.4', 30, '0.0', 9, '$EXTMAX', 10, '41201.5', 20, '29201.0', 30, '0.0',
  9, '$TILEMODE', 70, 1, 9, '$CMATERIAL', 347, 'EC', 9, '$INTERFEREOBJVS', 345, '70', 9, '$HANDSEED', 5, '30'));
sec('CLASSES', () => {});
sec('TABLES', () => {
  tbl('VPORT', '8', 3, () => { vport('29', '*Active'); vport('2A', '*Multiple'); vport('2B', '*Active'); });
  tbl('LTYPE', '5', 3, () => { ltype('14', 'ByBlock'); ltype('15', 'ByLayer'); ltype('16', 'Continuous'); });
  tbl('LAYER', '2', 4, () => { layer('10', '0', [347, 'EE']); layer('11', 'GRIDS', [347, 'EE']); layer('12', 'G-ESAA VICINITY', [347, 'EE']); layer('13', 'LEGEND', [347, 'EE']); });
  tbl('STYLE', '3', 2, () => { style('17', 'Standard', 'arial.ttf', 'Arial'); style('18', 'MtXpl_Vineta_BT', 'vinet.ttf', 'Vineta BT'); });
  tbl('VIEW', '6', 0, () => {}); tbl('UCS', '7', 0, () => {});
  tbl('APPID', '9', 1, () => rec('APPID', '19', '9', 100, 'AcDbSymbolTableRecord', 100, 'AcDbRegAppTableRecord', 2, 'ACAD', 70, 0));
  put(0, 'TABLE', 2, 'DIMSTYLE', 5, 'A', 330, '0', 100, 'AcDbSymbolTable', 70, 1, 100, 'AcDbDimStyleTable', 71, 0);
  put(0, 'DIMSTYLE', 105, '27', 330, 'A', 100, 'AcDbSymbolTableRecord', 100, 'AcDbDimStyleTableRecord', 2, 'Standard', 70, 0, 176, String(0xC1000000 | 0), 177, String(0xC3000005 | 0), 178, 256); put(0, 'ENDTAB');
  tbl('BLOCK_RECORD', '1', 5, () => { brec('1F', '*Model_Space', '22'); brec('1B', '*Paper_Space', '1E'); brec('40', 'FAR SYMBOL', '0', [102, '{ACAD_XDICTIONARY', 360, '63', 102, '}']); brec('44', 'AUDIT_I_SAMPLE', '0'); brec('48', 'TAGGED', '0'); });
});
sec('BLOCKS', () => {
  block('20', '21', '1F', '*Model_Space', () => {}); block('1C', '1D', '1B', '*Paper_Space', () => {});
  block('41', '4F', '40', 'FAR SYMBOL', () => { line('42', '40', '0', FX, FY, FX + 10, FY + 5);
    rec('HATCH', '43', '40', 100, 'AcDbEntity', 8, '0', 100, 'AcDbHatch', 10, '0.0', 20, '0.0', 30, '0.0', 210, '0.0', 220, '0.0', 230, '1.0', 2, 'SOLID', 70, 1, 71, 0, 91, 1, 92, 2, 72, 0, 73, 1, 93, 4,
      10, FX, 20, FY, 10, FX + 4, 20, FY, 10, FX + 4, 20, FY + 4, 10, FX, 20, FY + 4, 97, 0, 75, 0, 76, 1, 98, 1, 10, FX + 2, 20, FY + 2); });
  block('45', '47', '44', 'AUDIT_I_SAMPLE', () => rec('REGION', '46', '44', 100, 'AcDbEntity', 8, '0', 100, 'AcDbModelerGeometry', 290, 1, 2, '{00000000-0000-0000-0000-000000000000}', 100, 'AcDb3dSolid', 350, '0'));
  block('49', '4C', '48', 'TAGGED', () => { line('4B', '48', '0', -2, 0, 2, 0);
    rec('ATTDEF', '4A', '48', 100, 'AcDbEntity', 8, '0', 100, 'AcDbText', 10, '0.0', 20, '1.0', 30, '0.0', 40, '2.0', 1, '', 100, 'AcDbAttributeDefinition', 280, 0, 3, 'ID', 2, 'ID', 70, 0); });
});
sec('ENTITIES', () => {
  square('50', '1F', 'GRIDS', 785000, 786000, 440);
  rec('INSERT', '51', '1F', 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockReference', 2, 'FAR SYMBOL', 10, 785100 - FX, 20, 786100 - FY, 30, '0.0');
  rec('INSERT', '52', '1F', 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockReference', 66, 1, 2, 'TAGGED', 10, '785200.0', 20, '786200.0', 30, '0.0');
  rec('ATTRIB', '53', '52', 100, 'AcDbEntity', 8, '0', 100, 'AcDbText', 10, '785200.0', 20, '786201.0', 30, '0.0', 40, '2.0', 1, 'CC-0001', 100, 'AcDbAttribute', 280, 0, 2, 'ID', 70, 0, 100, 'AcDbXrecord', 280, 1, 70, 0);
  put(0, 'SEQEND', 5, '54', 330, '52', 100, 'AcDbEntity', 8, '0');
  rec('INSERT', '55', '1F', 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockReference', 2, 'AUDIT_I_SAMPLE', 10, '-46706376.0', 20, '-5564224.0', 30, '0.0');
  rec('MULTILEADER', '56', '1F', 100, 'AcDbEntity', 8, '0', 100, 'AcDbMLeader', 270, 2, 300, 'CONTEXT_DATA{', 40, '1.0', 10, '1.0', 20, '1.0', 30, '0.0', 301, '}');
  rec('REGION', '57', '1F', 100, 'AcDbEntity', 8, '0', 100, 'AcDbModelerGeometry', 290, 1, 2, '{00000000-0000-0000-0000-000000000001}', 100, 'AcDb3dSolid', 350, '0');
  rec('MTEXT', '58', '1F', 100, 'AcDbEntity', 8, 'LEGEND', 100, 'AcDbMText', 10, '785100.0', 20, '785950.0', 30, '0.0', 40, '10.0', 41, '0.0093', 46, '0.0', 71, 1, 72, 1, 1, '{\\fVineta BT|b1|i0|c0|p82;UPDATED^JLEGENDS}', 7, 'MtXpl_Vineta_BT', 73, 1, 44, '1.0',
    101, 'Embedded Object', 70, 1, 10, '1.0', 20, '0.0', 30, '0.0', 11, '785100.0', 21, '785950.0', 31, '0.0', 40, '0.0093', 41, '25.0', 42, '51.5', 43, '25.0', 71, 2, 72, 1, 44, '1.0', 45, '1.0', 73, 0, 74, 0, 46, '0.0');
  rec('IMAGE', '59', '1F', 100, 'AcDbEntity', 8, 'G-ESAA VICINITY', 100, 'AcDbRasterImage', 90, 0, 10, '785600.0', 20, '786000.0', 30, '0.0', 11, '0.25', 21, '0.0', 31, '0.0', 12, '0.0', 22, '0.25', 32, '0.0', 13, '1800.0', 23, '1800.0', 340, '61', 70, 7, 280, 0, 281, 50, 282, 50, 283, 0, 360, '62', 71, 1, 91, 2, 14, '-0.5', 24, '-0.5', 14, '1799.5', 24, '1799.5', 290, 0);
  square('5A', '1F', 'G-ESAA VICINITY', 785600, 786000, 450);
});
sec('OBJECTS', () => {
  rec('DICTIONARY', 'C', '0', 100, 'AcDbDictionary', 281, 1, 3, 'ACAD_GEOGRAPHICDATA', 350, '66', 3, 'ACAD_GROUP', 350, 'D', 3, 'ACAD_IMAGE_DICT', 350, '60', 3, 'ACAD_IMAGE_VARS', 350, '65', 3, 'ACAD_LAYOUT', 350, '1A', 3, 'ACAD_MATERIAL', 350, '6E', 3, 'ACAD_VISUALSTYLE', 350, '6F', 3, 'AcDbVariableDictionary', 350, '1ACD9');
  rec('DICTIONARY', 'D', 'C', 100, 'AcDbDictionary', 281, 1);
  rec('DICTIONARY', '1A', 'C', 100, 'AcDbDictionary', 281, 1, 3, 'Layout1', 350, '1E', 3, 'Model', 350, '22');
  layout('22', 'Model', '1F', 0); layout('1E', 'Layout1', '1B', 1);
  rec('DICTIONARY', '60', 'C', 100, 'AcDbDictionary', 281, 1, 3, 'OLD_PICTURE', 350, '67', 3, 'VICINITY_MAP', 350, '61');
  put(0, 'IMAGEDEF', 5, '61', 102, '{ACAD_REACTORS', 330, '60', 330, '62', 102, '}', 330, '60', 100, 'AcDbRasterImageDef', 90, 0, 1, 'VICINITY_MAP.jpg', 10, '1800.0', 20, '1800.0', 11, '1.0', 21, '1.0', 280, 1, 281, 0);
  rec('IMAGEDEF_REACTOR', '62', '59', 100, 'AcDbRasterImageDefReactor', 90, 2, 330, '59');
  put(0, 'IMAGEDEF', 5, '67', 102, '{ACAD_REACTORS', 330, '60', 102, '}', 330, '60', 100, 'AcDbRasterImageDef', 90, 0, 1, 'C:\\Users\\someone\\Desktop\\viber_image.png', 10, '640.0', 20, '480.0', 11, '1.0', 21, '1.0', 280, 1, 281, 0);
  rec('RASTERVARIABLES', '65', 'C', 100, 'AcDbRasterVariables', 90, 0, 70, 1, 71, 1, 72, 0);
  rec('GEODATA', '66', 'C', 100, 'AcDbGeoData', 90, 3, 70, 2, 40, '0.0');
  rec('DICTIONARY', '6E', 'C', 100, 'AcDbDictionary', 281, 1, 3, 'Global', 350, 'EE');
  rec('DICTIONARY', '6F', 'C', 100, 'AcDbDictionary', 281, 1, 3, 'Realistic', 350, '70');
  rec('VISUALSTYLE', '70', '6F', 100, 'AcDbVisualStyle', 2, 'Realistic', 70, 0);
  rec('DICTIONARY', '63', '40', 100, 'AcDbDictionary', 280, 0, 281, 1, 3, 'ACAD_SORTENTS', 360, '64');
  rec('SORTENTSTABLE', '64', '63', 100, 'AcDbSortentsTable', 331, '42', 5, '42', 331, '9999', 5, '9999');
  rec('BLOCKMOVEACTION', '71', '156A6', 100, 'AcDbEvalExpr', 90, 0);
});
put(0, 'EOF');
const src = P.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + '\n'; // LF, like the template

// ---- before ----
const d0 = new T.Doc(src), S0 = T.structure(d0);
const where0 = Object.fromEntries(['51', '52'].map((h) => [h, T.drawnBox(S0, d0.byHandle.get(h))]));
ok(Math.abs(where0['51'][0] - 785100) < 0.01, 'sample: the far symbol draws on the plan', where0['51']);

// ---- repaired ----
const r1 = T.repair(src), out = r1.text, L = r1.report.cleanup;
const d1 = new T.Doc(out), S1 = T.structure(d1), typ = (r) => r[0][1], get = (r, c) => (r.find((p, i) => i > 0 && p[0] === c) || [])[1];
const recs = d1.secs.filter((s) => s.recs).flatMap((s) => s.recs), of = (t) => recs.filter((r) => typ(r) === t);
ok(/\r\n/.test(out) && !/[^\r]\n/.test(out), 'CRLF line ends');
ok(of('VPORT').length === 1 && get(of('VPORT')[0], 2) === '*Active', '1 one *Active VPORT', of('VPORT').map((r) => get(r, 2)));
ok(!of('ATTRIB').some((r) => r.some((p) => p[0] === 100 && p[1] === 'AcDbXrecord')) && of('ATTRIB').length === 1, '2 ATTRIB without its AcDbXrecord tail');
ok(!of('GEODATA').length && !out.includes('ACAD_GEOGRAPHICDATA'), '3 GEODATA and its dictionary entry gone');
ok(!of('REGION').length && !d1.byHandle.get('55'), '4 REGION dropped (and the insert of the block it left empty)');
ok(!of('MULTILEADER').length, '5 MULTILEADER dropped');
ok(!recs.some((r) => r.some((p) => p[0] === 347)) && !out.includes('$CMATERIAL'), '6 materials pointing to nothing removed');
ok(!out.includes('1ACD9') && !out.includes('Global'), '7 dictionary entries to missing objects removed');
ok(!of('BLOCKMOVEACTION').length, '8 object with a missing owner dropped');
const st = of('SORTENTSTABLE')[0], k = st ? st.findIndex((p) => p[0] === 100 && p[1] === 'AcDbSortentsTable') : -1;
ok(st && st[k + 1][0] === 330 && st[k + 1][1] === '40' && !st.some((p) => p[1] === '9999'), '9 SORTENTSTABLE: its block record after the subclass marker', st && JSON.stringify(st));
ok(!of('VISUALSTYLE').length && !out.includes('$INTERFEREOBJVS'), '10 VISUALSTYLE and the header variable pointing to it gone');
const mt = d1.byHandle.get('58');
ok(mt && Math.abs(parseFloat(get(mt, 41)) - 51.5) < 1e-6 && !/\^J/.test(get(mt, 1)) && /\\P/.test(get(mt, 1)), '12 MTEXT width set to its real width, ^J as \\P', mt && `${get(mt, 41)} ${get(mt, 1)}`);
ok(of('IMAGEDEF').length === 1 && get(of('IMAGEDEF')[0], 1) === 'VICINITY_MAP.jpg' && !out.includes('C:\\Users'), '13 unused IMAGEDEF (absolute path) dropped');
const vst = of('STYLE').find((r) => get(r, 2) === 'MtXpl_Vineta_BT');
ok(vst && get(vst, 3) === 'arial.ttf' && get(vst, 1000) === 'Arial' && !/\\fVineta/i.test(out) && /\\fArial\|/.test(get(mt, 1)), '16 Vineta BT set to Arial (the style keeps its name)', vst && JSON.stringify(vst.slice(-6)));
ok(parseInt(get(of('DIMSTYLE')[0], 176), 10) === 0 && parseInt(get(of('DIMSTYLE')[0], 177), 10) === 5, '14 DIMSTYLE packed colours as colour indexes');
const hs = parseInt(d1.headerVar('$HANDSEED')[1], 16), mx = Math.max(...recs.map((r) => parseInt(get(r, 5) || get(r, 105) || '0', 16)));
ok(hs > mx, '$HANDSEED above every handle', `${hs.toString(16)} > ${mx.toString(16)}`);
const where1 = Object.fromEntries(['51', '52'].map((h) => [h, T.drawnBox(S1, d1.byHandle.get(h))]));
ok(['51', '52'].every((h) => where0[h].every((v, i) => Math.abs(v - where1[h][i]) < 0.001)), '15 nothing drawn moves', JSON.stringify(where1));
const ins = d1.byHandle.get('51');
ok(Math.hypot(parseFloat(get(ins, 10)) - 785105, parseFloat(get(ins, 20)) - 786102.5) < 1, '15 the far symbol\'s insertion point sits on it', `${get(ins, 10)}, ${get(ins, 20)}`);
const em = d1.headerVar('$EXTMIN'), vp = of('VPORT')[0];
ok(parseFloat(get(vp, 12)) > 785000 && parseFloat(get(vp, 12)) < 786050 && parseFloat(get(vp, 40)) < 2000, 'opens on the plan (*Active VPORT)', `${get(vp, 12)}, ${get(vp, 22)}, h ${get(vp, 40)}`);
ok(em && parseFloat(em[1]) > 784000, '$EXTMIN on the plan', em);
// ---- a second run changes nothing ----
const r2 = T.repair(out);
ok(r2.text === out, 'idempotent: a second run gives the same bytes', Object.keys(r2.report.cleanup).join(', ') || 'nothing to do');
const dc = new T.Doc(out); T.clean(dc); ok(dc.text() === out, 'idempotent: clean on its own output changes nothing');
// ---- the validator ----
const dst = process.argv[2] || path.join(os.tmpdir(), `gesaa_clean_${process.pid}.dxf`);
fs.writeFileSync(dst, out);
const srcTmp = path.join(os.tmpdir(), `gesaa_raw_${process.pid}.dxf`); fs.writeFileSync(srcTmp, src);
const check = path.join(__dirname, '..', 'tools', 'dxf-seed', 'check_plan.py');
let res = ''; try { res = execFileSync('python3', ['-I', check, dst], { encoding: 'utf8' }); ok(/no problems/.test(res), 'check_plan.py: no problems on the repaired sample'); } catch (e) { ok(false, 'check_plan.py: no problems on the repaired sample', (e.stdout || '') + (e.stderr || '')); }
try { execFileSync('python3', ['-I', check, srcTmp], { encoding: 'utf8' }); ok(false, 'check_plan.py finds the faults of the raw sample'); } catch (e) { ok(/problem/.test(e.stdout || ''), 'check_plan.py finds the faults of the raw sample', (e.stdout || '').split('\n').filter((x) => /problem/.test(x)).join(' / ')); }
if (!process.argv[2]) fs.unlinkSync(dst);
fs.unlinkSync(srcTmp);
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
