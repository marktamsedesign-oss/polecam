/* PoleCam reports: XLSX writer, PDF writer (Helvetica + JPEG photos), acceptance KML, CSV.
   No dependencies; uses PoleCore.makeZip / makeZipParts. Works in browser (window.PoleReports) and Node. */
(function (root) {
  'use strict';
  const Core = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.PoleCore;

  /* ---------------- shared helpers ---------------- */
  const xmlEsc = (s) => String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  function csv(rows) {
    const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
  }

  /* ================= XLSX ================= */
  function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  const STYLES = { normal: 0, title: 1, header: 2, cell: 3, label: 4, bad: 5, good: 6, coord: 7, center: 8, info: 9 };
  /* Cell styles are built from a registry: the ten fixed ones above plus any registered with xstyle(). */
  const fonts = [], fills = ['<patternFill patternType="none"/>', '<patternFill patternType="gray125"/>'], borders = ['<left/><right/><top/><bottom/><diagonal/>'], xfs = [];
  const numFmts = { '0.0000000': 164, '0.00': 2, '0': 1, 'mmm d, yyyy': 165 };
  const dedupe = (arr, xml) => { const i = arr.indexOf(xml); if (i >= 0) return i; arr.push(xml); return arr.length - 1; };
  function fontId(f) {
    const o = f || {};
    return dedupe(fonts, `${o.b ? '<b/>' : ''}${o.i ? '<i/>' : ''}<sz val="${o.sz || 10}"/>${o.color ? `<color rgb="${o.color}"/>` : ''}<name val="${o.name || 'Arial'}"/><family val="2"/>`);
  }
  function fillId(rgb) { return rgb ? dedupe(fills, `<patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill>`) : 0; }
  function borderId(b) {
    if (!b) return 0;
    const side = (k) => { const st = typeof b === 'string' ? b : b[k]; return st ? `<${k} style="${st}"><color rgb="${(typeof b === 'object' && b.color) || 'FF000000'}"/></${k}>` : `<${k}/>`; };
    return dedupe(borders, `${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/>`);
  }
  /** Registers a cell style {font:{b,i,sz,color,name}, fill:'FFRRGGBB', border:'thin'|{left,right,top,bottom,color}, align:{h,v,wrap,rotate}, numFmt} and returns its index. */
  function xstyle(spec) {
    const o = spec || {}, al = o.align || {};
    const nf = o.numFmt ? numFmts[o.numFmt] : 0;
    const alXml = (al.h || al.v || al.wrap || al.rotate || al.indent) ? `<alignment${al.h ? ` horizontal="${al.h}"` : ''}${al.v ? ` vertical="${al.v}"` : ''}${al.wrap ? ' wrapText="1"' : ''}${al.rotate ? ` textRotation="${al.rotate}"` : ''}${al.indent ? ` indent="${al.indent}"` : ''}/>` : '';
    const xml = `<xf numFmtId="${nf || 0}" fontId="${fontId(o.font)}" fillId="${fillId(o.fill)}" borderId="${borderId(o.border)}" xfId="0"${nf ? ' applyNumberFormat="1"' : ''} applyFont="1"${o.fill ? ' applyFill="1"' : ''}${o.border ? ' applyBorder="1"' : ''}${alXml ? ' applyAlignment="1"' : ''}>${alXml}</xf>`;
    return dedupe(xfs, xml);
  }
  // the ten fixed styles, in STYLES order
  xstyle({});
  xstyle({ font: { b: 1, sz: 14 } });
  xstyle({ font: { b: 1 }, fill: 'FFDDE2E6', border: { left: 'thin', right: 'thin', top: 'thin', bottom: 'thin', color: 'FFB0B7BD' }, align: { h: 'center', v: 'center', wrap: 1 } });
  xstyle({ border: { left: 'thin', right: 'thin', top: 'thin', bottom: 'thin', color: 'FFB0B7BD' }, align: { v: 'top', wrap: 1 } });
  xstyle({ font: { b: 1 } });
  xstyle({ font: { b: 1, color: 'FFC92A2A' }, fill: 'FFFDE4E3', border: { left: 'thin', right: 'thin', top: 'thin', bottom: 'thin', color: 'FFB0B7BD' }, align: { v: 'top', wrap: 1 } });
  xstyle({ font: { b: 1, color: 'FF2B8A3E' }, fill: 'FFE3F4E6', border: { left: 'thin', right: 'thin', top: 'thin', bottom: 'thin', color: 'FFB0B7BD' }, align: { v: 'top', wrap: 1 } });
  xstyle({ numFmt: '0.0000000', border: { left: 'thin', right: 'thin', top: 'thin', bottom: 'thin', color: 'FFB0B7BD' }, align: { v: 'top' } });
  xstyle({ border: { left: 'thin', right: 'thin', top: 'thin', bottom: 'thin', color: 'FFB0B7BD' }, align: { h: 'center', v: 'top' } });
  xstyle({ font: { color: 'FF5A6570' } });
  const stylesXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0000000"/><numFmt numFmtId="165" formatCode="mmm d, yyyy"/></numFmts>
<fonts count="${fonts.length}">${fonts.map((f) => `<font>${f}</font>`).join('')}</fonts>
<fills count="${fills.length}">${fills.map((f) => `<fill>${f}</fill>`).join('')}</fills>
<borders count="${borders.length}">${borders.map((b) => `<border>${b}</border>`).join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function sheetXml(sh, drawingRid) {
    const rows = sh.rows.map((row, ri) => {
      if (!row) return '';
      const cells = row.map((cell, ci) => {
        if (cell == null || cell === '') {
          return (cell && cell.s != null) ? `<c r="${colName(ci)}${ri + 1}" s="${cell.s}"/>` : '';
        }
        const c = typeof cell === 'object' ? cell : { v: cell };
        const ref = `${colName(ci)}${ri + 1}`, s = c.s != null ? ` s="${c.s}"` : '';
        if (c.v == null || c.v === '') return c.s != null ? `<c r="${ref}"${s}/>` : '';
        if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
      }).join('');
      const ht = sh.heights && sh.heights[ri] ? ` ht="${sh.heights[ri]}" customHeight="1"` : '';
      return `<row r="${ri + 1}"${ht}>${cells}</row>`;
    }).join('');
    const cols = (sh.cols || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const pane = sh.freezeRow ? `<pane ySplit="${sh.freezeRow}" topLeftCell="A${sh.freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freezeRow + 1}" sqref="A${sh.freezeRow + 1}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="13.2"/>
${cols ? `<cols>${cols}</cols>` : ''}
<sheetData>${rows}</sheetData>
${sh.autoFilter ? `<autoFilter ref="${sh.autoFilter}"/>` : ''}
${sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
${(() => { const p = sh.page || {}, m = p.margins || {}; return `<pageMargins left="${m.left ?? 0.4}" right="${m.right ?? 0.4}" top="${m.top ?? 0.5}" bottom="${m.bottom ?? 0.5}" header="0.3" footer="0.3"/>
<pageSetup paperSize="${p.paper || 9}" orientation="${p.orientation || 'landscape'}" fitToWidth="${p.fitToWidth ?? 1}" fitToHeight="${p.fitToHeight ?? 0}"/>`; })()}
${sh.rowBreaks && sh.rowBreaks.length ? `<rowBreaks count="${sh.rowBreaks.length}" manualBreakCount="${sh.rowBreaks.length}">${sh.rowBreaks.map((r) => `<brk id="${r}" max="16383" man="1"/>`).join('')}</rowBreaks>` : ''}
${drawingRid ? `<drawing r:id="${drawingRid}"/>` : ''}
</worksheet>`;
  }
  /** images: [{bytes, ext:'jpeg'|'png', from:{col,row,colOff,rowOff}, to:{col,row,colOff,rowOff}}] (offsets in EMU; 1 px ≈ 9525) */
  function drawingXml(images) {
    const anchor = (a) => `<xdr:col>${a.col}</xdr:col><xdr:colOff>${a.colOff || 0}</xdr:colOff><xdr:row>${a.row}</xdr:row><xdr:rowOff>${a.rowOff || 0}</xdr:rowOff>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${images.map((im, i) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from>${anchor(im.from)}</xdr:from><xdr:to>${anchor(im.to)}</xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Picture ${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`).join('\n')}
</xdr:wsDr>`;
  }
  function safeSheetName(n) { return String(n).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Sheet'; }
  /** sheets: [{name, cols, rows, merges, freezeRow, autoFilter, heights, page, rowBreaks, images}] -> zip parts (Uint8Array[]) */
  function buildXlsxParts(sheets) {
    const names = sheets.map((s) => safeSheetName(s.name));
    const files = [];
    let mediaN = 0;
    const drawings = sheets.map((s, i) => (s.images && s.images.length ? { sheet: i, n: i + 1 } : null)).filter(Boolean);
    files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${drawings.map((d) => `<Override PartName="/xl/drawings/drawing${d.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` });
    files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
    const defined = sheets.map((s, i) => s.autoFilter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i].replace(/'/g, "''")}'!${s.autoFilter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : '').join('');
    files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}</workbook>` });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    files.push({ name: 'xl/styles.xml', data: stylesXml() });
    sheets.forEach((s, i) => {
      const dr = drawings.find((d) => d.sheet === i);
      files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, dr ? 'rId1' : null) });
      if (!dr) return;
      files.push({ name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${dr.n}.xml"/></Relationships>` });
      files.push({ name: `xl/drawings/drawing${dr.n}.xml`, data: drawingXml(s.images) });
      const rels = s.images.map((im, k) => { mediaN++; files.push({ name: `xl/media/image${mediaN}.${im.ext || 'jpeg'}`, data: im.bytes }); return `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${mediaN}.${im.ext || 'jpeg'}"/>`; });
      files.push({ name: `xl/drawings/_rels/drawing${dr.n}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>` });
    });
    return Core.makeZipParts(files);
  }

  /* ================= PDF ================= */
  const HV = '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500'.split(',').map(Number);
  const HB = '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556'.split(',').map(Number);
  const WIN = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  function winCode(ch) { const c = ch.codePointAt(0); if (c >= 32 && c < 127) return c; if (c >= 160 && c <= 255) return c; return WIN[c] || 63; }
  function textWidth(s, size, bold) {
    const t = bold ? HB : HV; let w = 0;
    for (const ch of String(s ?? '')) w += t[winCode(ch) - 32] || 556;
    return w * size / 1000;
  }
  function wrapText(s, width, size, bold) {
    const out = [];
    for (const para of String(s ?? '').split(/\r?\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (let w of words) {
        while (textWidth(w, size, bold) > width) { // break very long tokens
          let k = w.length; while (k > 1 && textWidth(w.slice(0, k), size, bold) > width) k--;
          if (line) { out.push(line); line = ''; }
          out.push(w.slice(0, k)); w = w.slice(k);
        }
        const tryL = line ? line + ' ' + w : w;
        if (textWidth(tryL, size, bold) <= width) line = tryL; else { if (line) out.push(line); line = w; }
      }
      out.push(line);
    }
    return out.length ? out : [''];
  }
  function pdfEsc(s) {
    let o = '';
    for (const ch of String(s ?? '')) {
      const c = winCode(ch);
      if (c === 40 || c === 41 || c === 92) o += '\\' + String.fromCharCode(c);
      else o += String.fromCharCode(c);
    }
    return o;
  }
  function jpegInfo(b) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
      }
      i += 2 + len;
    }
    throw new Error('Unreadable JPEG');
  }
  const latin1 = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  const f2 = (n) => (Math.round(n * 100) / 100).toString();

  const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
  class Pdf {
    constructor(o) { const sz = PAGE_SIZES[(o && o.size) || 'a4'] || PAGE_SIZES.a4; this.W = sz[0]; this.H = sz[1]; this.pages = []; this.images = []; this.page = null; this.files = []; }
    /** v2.23: a file embedded in the PDF (the attachments panel of the PDF reader), with an optional click target on a page.
        o.page: page index; o.rect: [x, y, w, h] from the top-left, in pt (v2.24: drawn by the page itself, see attachStamp). */
    attach(name, bytes, o = {}) { this.files.push({ name: String(name), bytes, mime: o.mime || 'application/octet-stream', desc: o.desc || '', page: o.page, rect: o.rect }); }
    addPage() { this.page = { ops: [] }; this.pages.push(this.page); return this.page; }
    op(s) { this.page.ops.push(s); }
    color(c, stroke) { const [r, g, b] = c; return `${f2(r)} ${f2(g)} ${f2(b)} ${stroke ? 'RG' : 'rg'}`; }
    /** y = top of the text box; size in pt */
    text(x, y, s, o = {}) {
      const size = o.size || 9, bold = !!o.bold;
      let tx = x;
      if (o.align === 'right') tx = x - textWidth(s, size, bold);
      if (o.align === 'center') tx = x - textWidth(s, size, bold) / 2;
      this.op(`BT ${this.color(o.color || [0.1, 0.13, 0.16])} /${bold ? 'F2' : 'F1'} ${size} Tf ${f2(tx)} ${f2(this.H - y - size * 0.8)} Td (${pdfEsc(s)}) Tj ET`);
    }
    rect(x, y, w, h, o = {}) {
      const parts = [];
      if (o.fill) parts.push(this.color(o.fill));
      if (o.stroke) parts.push(this.color(o.stroke, true), `${f2(o.lw || 0.5)} w`);
      parts.push(`${f2(x)} ${f2(this.H - y - h)} ${f2(w)} ${f2(h)} re ${o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'}`);
      this.op('q ' + parts.join(' ') + ' Q');
    }
    line(x1, y1, x2, y2, o = {}) {
      this.op(`q ${this.color(o.color || [0.6, 0.64, 0.68], true)} ${f2(o.lw || 0.5)} w ${f2(x1)} ${f2(this.H - y1)} m ${f2(x2)} ${f2(this.H - y2)} l S Q`);
    }
    addImage(bytes) { const info = jpegInfo(bytes); this.images.push({ bytes, ...info }); return this.images.length - 1; }
    imgSize(idx) { const im = this.images[idx]; return { w: im.w, h: im.h }; }
    image(idx, x, y, w, h) { this.op(`q ${f2(w)} 0 0 ${f2(h)} ${f2(x)} ${f2(this.H - y - h)} cm /Im${idx} Do Q`); }
    /** draw image fitted (contain) into a box; returns drawn rect */
    imageFit(idx, x, y, bw, bh) {
      const { w, h } = this.imgSize(idx), s = Math.min(bw / w, bh / h), dw = w * s, dh = h * s;
      const dx = x + (bw - dw) / 2, dy = y + (bh - dh) / 2;
      this.image(idx, dx, dy, dw, dh);
      return { x: dx, y: dy, w: dw, h: dh };
    }
    output(info) {
      const parts = []; let pos = 0; const offsets = [];
      const push = (x) => { const u = typeof x === 'string' ? latin1(x) : x; parts.push(u); pos += u.length; };
      const nImg = this.images.length, firstImg = 5, firstPage = firstImg + nImg;
      // v2.23: each embedded file takes 4 objects (the file stream, its file specification, its annotation, v2.24: an empty
      // appearance for the annotation, so that every reader shows the stamp drawn on the page and no icon of its own over it)
      const firstFile = firstPage + this.pages.length * 2, fileObj = (i, k) => firstFile + i * 4 + k;
      const nObj = firstFile + this.files.length * 4; // the info dict
      const infoObj = nObj;
      const d = new Date(), p2 = (x) => String(x).padStart(2, '0');
      const pdfDate = `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
      push(this.files.length ? '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n' : '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
      const fsRefs = this.files.map((_, i) => `${fileObj(i, 1)} 0 R`);
      const names = this.files.map((f, i) => `(${pdfEsc(f.name)}) ${fsRefs[i]}`).join(' ');
      // the attachments panel opens by itself (PageMode /UseAttachments) where the reader supports it
      obj(1, () => push(this.files.length ? `<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [${names}] >> >> /AF [${fsRefs.join(' ')}] /PageMode /UseAttachments >>` : '<< /Type /Catalog /Pages 2 0 R >>'));
      const kids = this.pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(' ');
      obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`));
      obj(3, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
      obj(4, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
      this.images.forEach((im, i) => obj(firstImg + i, () => {
        const cs = im.comps === 1 ? '/DeviceGray' : im.comps === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
        push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`);
        push(im.bytes); push('\nendstream');
      }));
      const xo = this.images.map((_, i) => `/Im${i} ${firstImg + i} 0 R`).join(' ');
      this.pages.forEach((pg, i) => {
        const pn = firstPage + i * 2, cn = pn + 1;
        const annots = this.files.map((f, k) => (f.page === i && f.rect ? `${fileObj(k, 2)} 0 R` : '')).filter(Boolean);
        obj(pn, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${cn} 0 R${annots.length ? ` /Annots [${annots.join(' ')}]` : ''} >>`));
        const content = latin1(pg.ops.join('\n'));
        obj(cn, () => { push(`<< /Length ${content.length} >>\nstream\n`); push(content); push('\nendstream'); });
      });
      this.files.forEach((f, i) => {
        const mime = f.mime.replace(/[^A-Za-z0-9.+-]/g, (c) => `#${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
        obj(fileObj(i, 0), () => { push(`<< /Type /EmbeddedFile /Subtype /${mime} /Length ${f.bytes.length} /Params << /Size ${f.bytes.length} /ModDate (${pdfDate}) >> >>\nstream\n`); push(f.bytes); push('\nendstream'); });
        obj(fileObj(i, 1), () => push(`<< /Type /Filespec /F (${pdfEsc(f.name)}) /UF (${pdfEsc(f.name)}) /Desc (${pdfEsc(f.desc)}) /AFRelationship /Data /EF << /F ${fileObj(i, 0)} 0 R /UF ${fileObj(i, 0)} 0 R >> >>`));
        const r = f.rect || [0, 0, 0, 0];
        obj(fileObj(i, 2), () => push(f.page != null && f.rect
          ? `<< /Type /Annot /Subtype /FileAttachment /Rect [${f2(r[0])} ${f2(this.H - r[1] - r[3])} ${f2(r[0] + r[2])} ${f2(this.H - r[1])}] /FS ${fsRefs[i]} /Name /Paperclip /Contents (${pdfEsc(f.desc || f.name)}) /T (G-eSAA) /C [0.1 0.44 0.76] /F 4 /AP << /N ${fileObj(i, 3)} 0 R >> >>`
          : '<< >>'));
        obj(fileObj(i, 3), () => push(`<< /Type /XObject /Subtype /Form /BBox [0 0 ${f2(Math.max(1, r[2]))} ${f2(Math.max(1, r[3]))}] /Resources << >> /Length 0 >>\nstream\n\nendstream`));
      });
      obj(infoObj, () => push(`<< /Title (${pdfEsc(info && info.title || '')}) /Producer (G-eSAA) /CreationDate (${pdfDate}) >>`));
      const xref = pos;
      let x = `xref\n0 ${infoObj + 1}\n0000000000 65535 f \n`;
      for (let n = 1; n <= infoObj; n++) x += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
      push(x);
      push(`trailer\n<< /Size ${infoObj + 1} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      return parts;
    }
  }

  /** v2.23: the two logos (the admin's, else the bundled ones) at the top right of a report's first page, above the subtitle. */
  function headLogos(pdf, logos, M, y) {
    if (!logos) return;
    const add = (b) => { if (!b) return null; try { return pdf.addImage(b); } catch (e) { return null; } };
    const r = add(logos.right), l = add(logos.left), H = 24, top = y - 8;
    let x = pdf.W - M;
    if (r != null) { const { w, h } = pdf.imgSize(r), dw = Math.min(90, (w / h) * H); pdf.imageFit(r, x - dw, top, dw, H); x -= dw + 10; }
    if (l != null) { const { w, h } = pdf.imgSize(l), dw = Math.min(110, (w / h) * H); pdf.imageFit(l, x - dw, top, dw, H); }
  }

  /* ---------------- punchlist PDF layout ---------------- */
  const RED = [0.79, 0.16, 0.16], GREEN = [0.17, 0.54, 0.24], BLUE = [0.1, 0.44, 0.76], MUTED = [0.35, 0.4, 0.44], INK = [0.09, 0.13, 0.16], ACCENT = [0.11, 0.23, 0.42];
  const statusColor = (s) => (s === 'Open' || s === 'With deficiency' ? RED : s === 'Rectified' ? BLUE : s === 'Note' ? MUTED : GREEN);

  /**
   * model: {title, stageLong, project, footer, info:[[k,v]], summary:[[label,value]], items:[...], elements:[...], signers:[...], includePhotos}
   * items: {no, loc, element, cat, item, notes, sev, status, found, fixed, remarks}
   * elements: {title, status, details:[[k,v]], photos:[{jpeg, caption}], defs:[{no, text, sev, status, jpeg, after}]}
   */
  function punchlistPdf(model) {
    const pdf = new Pdf(), M = 36, CW = pdf.W - 2 * M, BOTTOM = pdf.H - 46;
    const add = (b) => { if (!b) return null; try { return pdf.addImage(b); } catch (e) { return null; } };
    if (model.includePhotos) for (const el of model.elements) {
      el.photos.forEach((p) => { p.img = add(p.jpeg); });
      el.defs.forEach((d) => { d.img = add(d.jpeg); d.afterImg = add(d.after); });
    }
    let y = 0;
    const newPage = () => { pdf.addPage(); y = M; };
    const need = (h) => { if (y + h > BOTTOM) { newPage(); return true; } return false; };

    newPage();
    // ---- header
    pdf.rect(M, y, 5, 40, { fill: ACCENT });
    pdf.text(M + 14, y + 2, model.title, { size: 17, bold: true, color: INK });
    pdf.text(M + 14, y + 24, model.stageLong, { size: 11, color: MUTED });
    y += 54;
    // ---- info grid (2 columns)
    const colW = (CW - 16) / 2;
    for (let i = 0; i < model.info.length; i += 2) {
      let rowH = 0;
      [model.info[i], model.info[i + 1]].forEach((kv, j) => {
        if (!kv) return;
        const x = M + j * (colW + 16);
        pdf.text(x, y, kv[0].toUpperCase(), { size: 7, bold: true, color: MUTED });
        const lines = wrapText(kv[1] || '—', colW, 10, false);
        lines.forEach((l, k) => pdf.text(x, y + 10 + k * 12, l, { size: 10 }));
        rowH = Math.max(rowH, 12 + lines.length * 12);
      });
      y += rowH + 6;
    }
    y += 4;
    // ---- summary boxes
    const n = model.summary.length, gap = 8, bw = (CW - gap * (n - 1)) / n;
    model.summary.forEach(([label, value, tone], i) => {
      const x = M + i * (bw + gap);
      pdf.rect(x, y, bw, 46, { stroke: [0.8, 0.83, 0.85], fill: [0.97, 0.97, 0.96] });
      pdf.text(x + 8, y + 7, String(value), { size: 18, bold: true, color: tone === 'bad' ? RED : tone === 'good' ? GREEN : INK });
      wrapText(label, bw - 16, 7, true).slice(0, 2).forEach((l, k) => pdf.text(x + 8, y + 29 + k * 8, l.toUpperCase(), { size: 6.5, bold: true, color: MUTED }));
    });
    y += 60;

    // ---- punchlist table
    pdf.text(M, y, 'PUNCHLIST', { size: 11, bold: true }); y += 16;
    const cols = [
      ['#', 22], ['Location', 64], ['Element', 44], ['Deficiency', 179], ['Severity', 40], ['Status', 50], ['Found', 32], ['Rectified / remarks', 0],
    ];
    cols[cols.length - 1][1] = CW - cols.slice(0, -1).reduce((s, c) => s + c[1], 0);
    const header = () => {
      pdf.rect(M, y, CW, 16, { fill: [0.87, 0.89, 0.9] });
      let x = M; cols.forEach(([t, w]) => { pdf.text(x + 4, y + 4, t, { size: 7.5, bold: true }); x += w; });
      y += 16;
    };
    if (!model.items.length) {
      pdf.rect(M, y, CW, 34, { fill: [0.89, 0.96, 0.9] });
      pdf.text(M + 10, y + 11, 'No deficiencies recorded. All inspected elements passed.', { size: 10, bold: true, color: GREEN });
      y += 46;
    } else {
      header();
      model.items.forEach((it, idx) => {
        const cells = [
          [String(it.no)], wrapText(it.loc, cols[1][1] - 8, 8), wrapText(it.element, cols[2][1] - 8, 8),
          null, [it.sev || ''], [it.status], [it.found || ''], wrapText([it.fixed, it.remarks].filter(Boolean).join(' · '), cols[7][1] - 8, 8),
        ];
        const head = wrapText(`${it.cat}: ${it.item}`, cols[3][1] - 8, 8, true);
        const notes = it.notes ? wrapText(it.notes, cols[3][1] - 8, 8) : [];
        const lines = Math.max(head.length + notes.length, ...cells.filter(Boolean).map((c) => c.length));
        const h = lines * 10 + 8;
        if (need(h)) header();
        if (idx % 2) pdf.rect(M, y, CW, h, { fill: [0.975, 0.977, 0.97] });
        let x = M;
        cells.forEach((c, ci) => {
          const w = cols[ci][1];
          if (ci === 3) {
            head.forEach((l, k) => pdf.text(x + 4, y + 4 + k * 10, l, { size: 8, bold: true }));
            notes.forEach((l, k) => pdf.text(x + 4, y + 4 + (head.length + k) * 10, l, { size: 8, color: MUTED }));
          } else {
            const color = ci === 5 ? statusColor(it.status) : ci === 4 && it.sev === 'Major' ? RED : INK;
            c.forEach((l, k) => pdf.text(x + 4, y + 4 + k * 10, l, { size: 8, bold: ci === 5 || ci === 1, color }));
          }
          x += w;
        });
        pdf.line(M, y + h, M + CW, y + h, { color: [0.82, 0.85, 0.87] });
        y += h;
      });
      y += 14;
    }

    // ---- sign-off
    need(150);
    pdf.text(M, y, 'SIGN-OFF', { size: 11, bold: true }); y += 14;
    pdf.text(M, y, 'Signed below to confirm the punchlist above as inspected on site.', { size: 8.5, color: MUTED }); y += 18;
    const sg = model.signers, sw = (CW - 16 * (sg.length - 1)) / sg.length;
    sg.forEach((role, i) => {
      const x = M + i * (sw + 16);
      pdf.rect(x, y, sw, 112, { stroke: [0.75, 0.78, 0.8] });
      wrapText(role, sw - 16, 8.5, true).slice(0, 2).forEach((l, k) => pdf.text(x + 8, y + 8 + k * 10, l, { size: 8.5, bold: true }));
      ['Name', 'Signature', 'Date'].forEach((lab, k) => {
        const ly = y + 46 + k * 22;
        pdf.text(x + 8, ly - 9, lab, { size: 7, color: MUTED });
        pdf.line(x + 8, ly + 6, x + sw - 8, ly + 6, { color: [0.5, 0.53, 0.56] });
      });
    });
    y += 124;

    // ---- element pages
    if (model.includePhotos && model.elements.length) {
      newPage();
      pdf.text(M, y, 'ELEMENT PHOTOS AND DETAILS', { size: 11, bold: true }); y += 20;
      for (const el of model.elements) {
        const detailLines = [];
        el.details.forEach(([k, v]) => detailLines.push(...wrapText(`${k}: ${v}`, CW - 16, 8.5)));
        need(30 + detailLines.length * 11 + (el.photos.length ? 150 : 0));
        // header bar
        pdf.rect(M, y, CW, 22, { fill: [0.93, 0.94, 0.93] });
        pdf.rect(M, y, 4, 22, { fill: statusColor(el.status) });
        pdf.text(M + 12, y + 6, el.title, { size: 10.5, bold: true });
        pdf.text(M + CW - 8, y + 7, el.status, { size: 9, bold: true, color: statusColor(el.status), align: 'right' });
        y += 28;
        detailLines.forEach((l) => { pdf.text(M + 8, y, l, { size: 8.5, color: INK }); y += 11; });
        y += 4;
        // photos, 3 per row
        const per = 3, g = 8, pw = (CW - g * (per - 1)) / per, ph = pw * 0.75;
        for (let i = 0; i < el.photos.length; i += per) {
          need(ph + 18);
          el.photos.slice(i, i + per).forEach((p, j) => {
            const x = M + j * (pw + g);
            pdf.rect(x, y, pw, ph, { fill: [0.92, 0.93, 0.92] });
            if (p.img != null) pdf.imageFit(p.img, x, y, pw, ph);
            pdf.text(x, y + ph + 3, wrapText(p.caption, pw, 7.5)[0], { size: 7.5, color: MUTED });
          });
          y += ph + 16;
        }
        // deficiencies with photos
        for (const d of el.defs) {
          const thumbs = [d.img, d.afterImg].filter((v) => v != null);
          const tw = 96, th = 72, textW = CW - 16 - thumbs.length * (tw + 6);
          const lines = wrapText(`#${d.no}  ${d.text}`, textW, 8.5, true);
          const meta = wrapText(d.meta, textW, 8);
          const h = Math.max(lines.length * 11 + meta.length * 10 + 8, thumbs.length ? th + 14 : 0);
          need(h + 4);
          pdf.rect(M, y, 3, h - 4, { fill: statusColor(d.status) });
          lines.forEach((l, k) => pdf.text(M + 10, y + k * 11, l, { size: 8.5, bold: true }));
          meta.forEach((l, k) => pdf.text(M + 10, y + lines.length * 11 + k * 10, l, { size: 8, color: statusColor(d.status) }));
          thumbs.forEach((im, k) => {
            const x = M + CW - (thumbs.length - k) * (tw + 6) + 6;
            pdf.rect(x, y, tw, th, { fill: [0.92, 0.93, 0.92] });
            pdf.imageFit(im, x, y, tw, th);
            pdf.text(x, y + th + 2, k === 0 && d.img != null ? 'Defect' : 'After rectification', { size: 6.5, color: MUTED });
          });
          y += h + 4;
        }
        y += 10;
      }
    }

    // ---- footers
    reportFooters(pdf, model, M);
    return pdf;
  }

  /* ================= acceptance KML ================= */
  /**
   * recs: [{id, title, name, status, lat, lon, detailsHtml, photos:[name], defs:[{no,text,sev,status}]}]
   * icons: {Open:'icons/open.png', OK:'icons/ok.png', Rectified:'icons/rect.png'} (paths inside files/)
   */
  function acceptanceKml(recs, o) {
    const label = { Open: 'With open deficiency', Rectified: 'Rectified · awaiting verification', Verified: 'All deficiencies verified', OK: 'Passed (no deficiency)' };
    const stColor = { Open: '#c92a2a', Rectified: '#1971c2', Verified: '#0b7285', Note: '#868e96' };
    const styles = Object.entries(o.icons).map(([k, href]) =>
      `<Style id="st_${k}"><IconStyle><scale>1.1</scale><Icon><href>files/${href}</href></Icon></IconStyle><LabelStyle><scale>0.85</scale></LabelStyle></Style>`).join('\n');
    const own = recs.filter((r) => r.icon).map((r) => // photo icons: one style per element, over the status colour
      `<Style id="ic_${xmlEsc(String(r.id))}"><IconStyle><scale>1.3</scale><Icon><href>files/${xmlEsc(r.icon)}</href></Icon></IconStyle><LabelStyle><scale>0.85</scale></LabelStyle></Style>`).join('\n');
    const folders = ['Open', 'Rectified', 'Verified', 'OK'].map((st) => {
      const list = recs.filter((r) => r.status === st);
      if (!list.length) return '';
      const marks = list.map((r) => {
        const defs = r.defs.length ? `<br/><b>Deficiencies</b><ol>${r.defs.map((d) => `<li value="${d.no}"><b>${xmlEsc(d.text)}</b> — ${xmlEsc(d.sev)} · <span style="color:${stColor[d.status] || '#c92a2a'}">${xmlEsc(d.status)}</span></li>`).join('')}</ol>` : '<br/><b style="color:#2b8a3e">No deficiency</b>';
        const pics = r.photos.map((p) => `<img src="files/${xmlEsc(p)}" width="360"/><br/>`).join('');
        const desc = `<b>${xmlEsc(r.title)}</b><br/>${r.detailsHtml}${defs}<br/>${pics}`;
        return `<Placemark><name>${xmlEsc(r.name)}</name><styleUrl>#${r.icon ? 'ic_' + xmlEsc(String(r.id)) : 'st_' + st}</styleUrl><description><![CDATA[${desc.replace(/]]>/g, ']]&gt;')}]]></description>` +
          `<Point><coordinates>${r.lon.toFixed(8)},${r.lat.toFixed(8)},0</coordinates></Point></Placemark>`;
      }).join('\n');
      return `<Folder><name>${label[st]} (${list.length})</name>\n${marks}\n</Folder>`;
    }).join('\n');
    const by = o.exportedBy ? `<description>${xmlEsc(o.exportedBy)}</description><ExtendedData><Data name="exported_by"><value>${xmlEsc(o.exportedBy)}</value></Data></ExtendedData>\n` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(o.name)}</name>\n${by}${styles}\n${own}\n${folders}\n</Document></kml>\n`;
  }

  /* ================= rectification report PDF ================= */
  /**
   * model: {title, stageLong, footer, info:[[k,v]], summary:[[label,value,tone]], note,
   *   progress:[{date, count, cum, pct}], rectified:[item], open:[item], signers:[...]}
   * item: {head, defect, right, rightTone, before:{jpeg, lines:[]}|null, after:{jpeg, lines:[]}|null, missingAfter:[l1,l2], remarks}
   */
  function rectificationPdf(model) {
    const pdf = new Pdf(), M = 36, CW = pdf.W - 2 * M, BOTTOM = pdf.H - 46;
    const add = (b) => { if (!b) return null; try { return pdf.addImage(b); } catch (e) { return null; } };
    model.rectified.concat(model.open).forEach((it) => {
      if (it.before) it.before.img = add(it.before.jpeg);
      if (it.after) it.after.img = add(it.after.jpeg);
    });
    let y = 0;
    const newPage = () => { pdf.addPage(); y = M; };
    const need = (h) => { if (y + h > BOTTOM) { newPage(); return true; } return false; };
    const section = (t, sub) => {
      need(40);
      pdf.text(M, y, t, { size: 11, bold: true }); y += 15;
      if (sub) { wrapText(sub, CW, 8.5).forEach((l) => { pdf.text(M, y, l, { size: 8.5, color: MUTED }); y += 11; }); y += 3; }
    };

    newPage();
    headLogos(pdf, model.logos, M, y);
    pdf.rect(M, y, 5, 40, { fill: BLUE });
    pdf.text(M + 14, y + 2, model.title, { size: 17, bold: true });
    pdf.text(M + 14, y + 24, model.stageLong, { size: 11, color: MUTED });
    y += 54;
    const colW = (CW - 16) / 2;
    for (let i = 0; i < model.info.length; i += 2) {
      let rowH = 0;
      [model.info[i], model.info[i + 1]].forEach((kv, j) => {
        if (!kv) return;
        const x = M + j * (colW + 16);
        pdf.text(x, y, kv[0].toUpperCase(), { size: 7, bold: true, color: MUTED });
        const lines = wrapText(kv[1] || '—', colW, 10);
        lines.forEach((l, k) => pdf.text(x, y + 10 + k * 12, l, { size: 10 }));
        rowH = Math.max(rowH, 12 + lines.length * 12);
      });
      y += rowH + 6;
    }
    y += 4;
    const n = model.summary.length, gap = 8, bw = (CW - gap * (n - 1)) / n;
    model.summary.forEach(([label, value, tone], i) => {
      const x = M + i * (bw + gap);
      pdf.rect(x, y, bw, 46, { stroke: [0.8, 0.83, 0.85], fill: [0.97, 0.97, 0.96] });
      pdf.text(x + 8, y + 7, String(value), { size: 18, bold: true, color: tone === 'bad' ? RED : tone === 'good' ? GREEN : tone === 'blue' ? BLUE : INK });
      wrapText(label, bw - 16, 7, true).slice(0, 2).forEach((l, k) => pdf.text(x + 8, y + 29 + k * 8, l.toUpperCase(), { size: 6.5, bold: true, color: MUTED }));
    });
    y += 54;
    if (model.note) {
      model.note.forEach((t) => {
        const lines = wrapText(t.text, CW - 14, 8.5, !!t.bold);
        pdf.rect(M, y, 3, lines.length * 11, { fill: t.tone === 'bad' ? RED : MUTED });
        lines.forEach((l, k) => pdf.text(M + 10, y + k * 11, l, { size: 8.5, bold: !!t.bold, color: t.tone === 'bad' ? RED : INK }));
        y += lines.length * 11 + 6;
      });
      y += 6;
    }

    // ---- progress by date
    if (model.progress.length) {
      section('RECTIFICATION PROGRESS BY DATE', 'Based on the time each item was marked rectified (the after-photo time when there is one).');
      const cols = [['Date', 120], ['Items rectified', 90], ['Cumulative', 80], ['Share of all items cleared', CW - 290]];
      const head = () => { pdf.rect(M, y, CW, 16, { fill: [0.87, 0.89, 0.9] }); let x = M; cols.forEach(([t, w]) => { pdf.text(x + 4, y + 4, t, { size: 7.5, bold: true }); x += w; }); y += 16; };
      head();
      model.progress.forEach((p, i) => {
        if (need(16)) head();
        if (i % 2) pdf.rect(M, y, CW, 16, { fill: [0.975, 0.977, 0.97] });
        let x = M;
        pdf.text(x + 4, y + 4, p.date, { size: 8.5 }); x += cols[0][1];
        pdf.text(x + 4, y + 4, String(p.count), { size: 8.5, bold: true }); x += cols[1][1];
        pdf.text(x + 4, y + 4, String(p.cum), { size: 8.5 }); x += cols[2][1];
        const bwid = cols[3][1] - 60;
        pdf.rect(x + 4, y + 5, bwid, 6, { fill: [0.88, 0.9, 0.91] });
        pdf.rect(x + 4, y + 5, Math.max(0.5, bwid * p.pct), 6, { fill: BLUE });
        pdf.text(x + bwid + 10, y + 4, `${Math.round(p.pct * 100)}%`, { size: 8.5, bold: true });
        y += 16;
      });
      y += 14;
    }

    // ---- rectified items: before / after
    const pw = (CW - 12) / 2, ph = 150;
    const photoBox = (x, side, missing, labelText, tone) => {
      pdf.text(x, y, labelText, { size: 7, bold: true, color: tone });
      const by = y + 11;
      if (side && side.img != null) {
        pdf.rect(x, by, pw, ph, { fill: [0.92, 0.93, 0.92] });
        pdf.imageFit(side.img, x, by, pw, ph);
      } else {
        const bad = !!missing;
        pdf.rect(x, by, pw, ph, { fill: bad ? [0.99, 0.92, 0.92] : [0.94, 0.95, 0.94], stroke: bad ? RED : [0.8, 0.83, 0.85] });
        const ml = (missing || ['No photo']).flatMap((l, k) => wrapText(l, pw - 16, k ? 8 : 9.5, !k).map((t) => [t, k]));
        ml.forEach(([l, k], j) => pdf.text(x + pw / 2, by + ph / 2 - ml.length * 6 + j * 12, l, { size: k ? 8 : 9.5, bold: !k, color: bad ? RED : MUTED, align: 'center' }));
      }
      return (side ? side.lines : []).reduce((yy, l) => { wrapText(l, pw, 7.5).forEach((w) => { pdf.text(x, yy, w, { size: 7.5, color: MUTED }); yy += 9.5; }); return yy; }, by + ph + 4);
    };
    const itemBlock = (it) => {
      const dl = wrapText(it.defect, CW - 120, 8.5);
      const capLines = (s) => (s ? s.lines.reduce((t, l) => t + wrapText(l, pw, 7.5).length, 0) : 0);
      const rem = it.remarks ? wrapText(`Remarks: ${it.remarks}`, CW, 8) : [];
      const h = 14 + dl.length * 11 + 11 + ph + 6 + Math.max(capLines(it.before), capLines(it.after)) * 9.5 + rem.length * 10 + 16;
      need(h);
      pdf.text(M, y, it.head, { size: 10, bold: true });
      pdf.text(M + CW, y + 1, it.right, { size: 9, bold: true, color: it.rightTone === 'bad' ? RED : BLUE, align: 'right' });
      y += 14;
      dl.forEach((l) => { pdf.text(M, y, l, { size: 8.5 }); y += 11; });
      y += 3;
      const y1 = photoBox(M, it.before, null, 'BEFORE · DEFECT', RED);
      const y2 = it.after || it.missingAfter ? photoBox(M + pw + 12, it.after, it.missingAfter, 'AFTER · RECTIFIED', BLUE) : y1;
      y = Math.max(y1, y2) + 2;
      rem.forEach((l) => { pdf.text(M, y, l, { size: 8, color: INK }); y += 10; });
      y += 6; pdf.line(M, y, M + CW, y, { color: [0.82, 0.85, 0.87] }); y += 10;
    };
    if (model.rectified.length) {
      newPage();
      section(`RECTIFIED ITEMS (${model.rectified.length})`, 'Each item shows the defect photo from inspection and the after photo taken when it was cleared, with the time, place and person recorded by the app at the moment each photo was taken.');
      model.rectified.forEach(itemBlock);
    }

    // ---- still open
    if (model.open.length) {
      need(120);
      section(`STILL OPEN (${model.open.length})`, 'Not yet rectified at the time of this report.');
      const tw = 120, th = 90;
      model.open.forEach((it) => {
        const textW = CW - tw - 12;
        const hl = wrapText(it.head, textW, 9.5, true), dl = wrapText(it.defect, textW, 8.5);
        const ml = (it.before ? it.before.lines : []).concat(it.remarks ? [`Remarks: ${it.remarks}`] : []).flatMap((l) => wrapText(l, textW, 8));
        const h = Math.max(th, hl.length * 12 + dl.length * 11 + 12 + ml.length * 10) + 12;
        need(h);
        pdf.rect(M, y, tw, th, { fill: [0.92, 0.93, 0.92] });
        if (it.before && it.before.img != null) pdf.imageFit(it.before.img, M, y, tw, th);
        else pdf.text(M + tw / 2, y + th / 2 - 5, 'No defect photo', { size: 8, color: MUTED, align: 'center' });
        let ty = y; const tx = M + tw + 12;
        hl.forEach((l) => { pdf.text(tx, ty, l, { size: 9.5, bold: true }); ty += 12; });
        dl.forEach((l) => { pdf.text(tx, ty, l, { size: 8.5 }); ty += 11; });
        pdf.text(tx, ty, it.right, { size: 8.5, bold: true, color: RED }); ty += 12;
        ml.forEach((l) => { pdf.text(tx, ty, l, { size: 8, color: MUTED }); ty += 10; });
        y += h; pdf.line(M, y - 6, M + CW, y - 6, { color: [0.82, 0.85, 0.87] });
      });
      y += 8;
    }

    // ---- sign-off
    need(150);
    pdf.text(M, y, 'SIGN-OFF', { size: 11, bold: true }); y += 14;
    pdf.text(M, y, 'Signed below to confirm the rectification status shown in this report.', { size: 8.5, color: MUTED }); y += 18;
    const sg = model.signers, sw = (CW - 16 * (sg.length - 1)) / sg.length;
    sg.forEach((role, i) => {
      const x = M + i * (sw + 16);
      pdf.rect(x, y, sw, 112, { stroke: [0.75, 0.78, 0.8] });
      wrapText(role, sw - 16, 8.5, true).slice(0, 2).forEach((l, k) => pdf.text(x + 8, y + 8 + k * 10, l, { size: 8.5, bold: true }));
      ['Name', 'Signature', 'Date'].forEach((lab, k) => {
        const ly = y + 46 + k * 22;
        pdf.text(x + 8, ly - 9, lab, { size: 7, color: MUTED });
        pdf.line(x + 8, ly + 6, x + sw - 8, ly + 6, { color: [0.5, 0.53, 0.56] });
      });
    });
    y += 124;

    reportFooters(pdf, model, M);
    return pdf;
  }

  /**
   * Task completion report (v2.11): page 1 says the task is complete; photo pages follow (v2.12).
   * model: {title, stageLong, statement, info:[[k,v]], summary:[[label,value,tone]], details:[[k,v]], signers:[{role, name, note}], footer, footer2,
   *         approval:{title, lines:[]} (v2.28, approved on site with a signed QR code),
   *         photos:[{title, sub, count, layout:'collage'|'chain', items}]}
   * collage (survey poles): 3 × 4 photos a page; items [{jpeg, head, lines:[], warn}].
   * chain (PAT / cleanup / FAT): one punchlist item per block, its photos side by side (as found → rectified → verified);
   *   items [{head, right, rightTone, notes:[], photos:[{label, tone, jpeg, lines:[]}]}]. Items with one photo share a row.
   */
  function completionPdf(model) {
    const pdf = new Pdf(), M = 36, CW = pdf.W - 2 * M, BOTTOM = pdf.H - 46;
    pdf.addPage(); let y = M;
    headLogos(pdf, model.logos, M, y);
    pdf.rect(M, y, 5, 40, { fill: GREEN });
    pdf.text(M + 14, y + 2, model.title, { size: 17, bold: true });
    pdf.text(M + 14, y + 24, model.stageLong, { size: 11, color: MUTED });
    y += 56;
    pdf.rect(M, y, CW, 34, { fill: [0.92, 0.97, 0.93], stroke: [0.6, 0.8, 0.64] });
    wrapText(model.statement, CW - 20, 10.5, true).slice(0, 2).forEach((l, k) => pdf.text(M + 10, y + 7 + k * 13, l, { size: 10.5, bold: true, color: GREEN }));
    y += 48;
    const colW = (CW - 16) / 2;
    for (let i = 0; i < model.info.length; i += 2) {
      let rowH = 0;
      [model.info[i], model.info[i + 1]].forEach((kv, j) => {
        if (!kv) return;
        const x = M + j * (colW + 16);
        pdf.text(x, y, kv[0].toUpperCase(), { size: 7, bold: true, color: MUTED });
        const lines = wrapText(kv[1] || '—', colW, 10).slice(0, 3);
        lines.forEach((l, k) => pdf.text(x, y + 10 + k * 12, l, { size: 10 }));
        rowH = Math.max(rowH, 12 + lines.length * 12);
      });
      y += rowH + 6;
    }
    y += 4;
    if (model.summary.length) {
      const n = model.summary.length, gap = 8, bw = (CW - gap * (n - 1)) / n;
      model.summary.forEach(([label, value, tone], i) => {
        const x = M + i * (bw + gap);
        pdf.rect(x, y, bw, 46, { stroke: [0.8, 0.83, 0.85], fill: [0.97, 0.97, 0.96] });
        pdf.text(x + 8, y + 7, String(value), { size: 18, bold: true, color: tone === 'bad' ? RED : tone === 'good' ? GREEN : tone === 'blue' ? BLUE : INK });
        wrapText(label, bw - 16, 7, true).slice(0, 2).forEach((l, k) => pdf.text(x + 8, y + 29 + k * 8, l.toUpperCase(), { size: 6.5, bold: true, color: MUTED }));
      });
      y += 60;
    }
    if (model.details.length) {
      pdf.text(M, y, 'DETAILS', { size: 11, bold: true }); y += 16;
      model.details.forEach(([k, v]) => {
        const lines = wrapText(v || '—', CW - 170, 9).slice(0, 3);
        pdf.text(M, y, k, { size: 9, bold: true, color: MUTED });
        lines.forEach((l, i) => pdf.text(M + 170, y + i * 11, l, { size: 9 }));
        y += Math.max(1, lines.length) * 11 + 5;
      });
      y += 8;
    }
    if (model.approval) { // v2.28: approved on site with the inspector's signed QR code: the report stands without a written signature
      const A = model.approval, lines = A.lines.flatMap((l) => wrapText(l, CW - 24, 8.5).slice(0, 2)).slice(0, 7), h = 24 + lines.length * 11;
      if (y + h + 10 > pdf.H - 46 - 150) { pdf.addPage(); y = M; } // the sign-off follows on the next page
      pdf.rect(M, y, CW, h, { fill: [0.92, 0.97, 0.93], stroke: [0.6, 0.8, 0.64] });
      pdf.text(M + 10, y + 7, A.title, { size: 9.5, bold: true, color: GREEN });
      lines.forEach((l, k) => pdf.text(M + 10, y + 21 + k * 11, l, { size: 8.5 }));
      y += h + 10;
    }
    y = Math.max(y, pdf.H - 46 - 150);
    pdf.text(M, y, 'SIGN-OFF', { size: 11, bold: true }); y += 18;
    const sg = model.signers, sw = (CW - 16 * (sg.length - 1)) / sg.length;
    sg.forEach((s, i) => {
      const x = M + i * (sw + 16);
      pdf.rect(x, y, sw, 112, { stroke: [0.75, 0.78, 0.8] });
      wrapText(s.role, sw - 16, 8.5, true).slice(0, 2).forEach((l, k) => pdf.text(x + 8, y + 8 + k * 10, l, { size: 8.5, bold: true }));
      ['Name', 'Signature', 'Date'].forEach((lab, k) => {
        const ly = y + 46 + k * 22;
        pdf.text(x + 8, ly - 9, lab, { size: 7, color: MUTED });
        if (k === 0 && s.name) pdf.text(x + 40, ly - 6, s.name, { size: 9 });
        if (k === 1 && s.note) pdf.text(x + 52, ly - 6, wrapText(s.note, sw - 64, 7.5)[0], { size: 7.5, color: GREEN }); // v2.28: approved on site
        pdf.line(x + 8, ly + 6, x + sw - 8, ly + 6, { color: [0.5, 0.53, 0.56] });
      });
    });

    // ---- photo pages (v2.12): survey poles as a collage; PAT / cleanup / FAT the deficiency photos (v2.12.1)
    const one = (s, w, size, bold) => { const l = wrapText(s, w, size, bold); return l.length > 1 ? `${l[0].replace(/\s*\S$/, '')}…` : l[0]; };
    const addImg = (j) => { try { return j ? pdf.addImage(j) : null; } catch (e) { return null; } };
    const TONE = { bad: RED, blue: BLUE, good: GREEN, muted: MUTED };
    const secs = (model.photos || []).map((sec) => ({ ...sec,
      items: sec.layout === 'collage'
        ? sec.items.map((it) => ({ ...it, jpeg: null, img: addImg(it.jpeg) })).filter((it) => it.img != null)
        : sec.items.map((it) => ({ ...it, photos: (it.photos || []).map((p) => ({ ...p, jpeg: null, img: addImg(p.jpeg) })).filter((p) => p.img != null) })) })).filter((sec) => sec.items.length);
    const headH = (sec, cont) => (cont || !sec.sub ? 24 : 36);
    /** Section title: on a new page, or under the previous section when its first row fits. */
    const head = (sec, cont, firstRow) => {
      if (firstRow != null && y + 10 + headH(sec, cont) + firstRow <= BOTTOM + 6) y += 10; else { pdf.addPage(); y = M; }
      pdf.rect(M, y, 5, headH(sec, cont) - 10, { fill: sec.layout === 'collage' ? ACCENT : BLUE });
      pdf.text(M + 12, y + 1, `PHOTOS · ${sec.title.toUpperCase()}${cont ? ' (continued)' : sec.count ? ` (${sec.count})` : ` (${sec.items.length})`}`, { size: 11, bold: true });
      if (sec.sub && !cont) pdf.text(M + 12, y + 15, one(sec.sub, CW - 12, 8), { size: 8, color: MUTED });
      y += headH(sec, cont);
    };
    const tile = [0.92, 0.93, 0.92];
    const COLS = 3, CGAP = 8, TW = (CW - CGAP * (COLS - 1)) / COLS, TH = 140, CROW = TH + 40; // collage
    const GAP = 12, HALF = (CW - GAP) / 2, THIRD = (CW - 2 * GAP) / 3; // deficiency items
    /** One deficiency: title, status, notes for steps without a photo, then its photos side by side (as found → rectified → verified). */
    const cellOf = (it, w) => {
      const n = Math.max(1, it.photos.length), pw = it.photos.length >= 3 ? THIRD : it.photos.length === 2 ? HALF : Math.min(w, HALF);
      const bh = pw > 200 ? 250 : 210;
      const title = wrapText(it.head, w, 9, true).slice(0, 3), notes = (it.notes || []).flatMap((t) => wrapText(t, w, 7.5));
      const caps = it.photos.map((p) => (p.lines || []).flatMap((l) => wrapText(l, pw, 7)).slice(0, 6));
      const capH = caps.length ? Math.max(...caps.map((c) => c.length)) * 8.5 : 0;
      const h = title.length * 11 + 11 + notes.length * 9.5 + (it.photos.length ? 4 + 10 + bh + 4 + capH : 0) + 14;
      return { it, w, n, pw, bh, title, notes, caps, h };
    };
    const chainRows = (items) => {
      const rows = [];
      for (let i = 0; i < items.length;) {
        const a = items[i], b = items[i + 1];
        if (a.photos.length <= 1 && b && b.photos.length <= 1) { rows.push([cellOf(a, HALF), cellOf(b, HALF)]); i += 2; } else { rows.push([cellOf(a, a.photos.length <= 1 ? HALF : CW)]); i += 1; }
      }
      return rows.map((cells) => ({ cells, h: Math.max(...cells.map((c) => c.h)) }));
    };
    const drawCell = (c, x0) => {
      let ty = y;
      c.title.forEach((l) => { pdf.text(x0, ty, l, { size: 9, bold: true }); ty += 11; });
      pdf.text(x0, ty, one(c.it.right || '', c.w, 7.5, true), { size: 7.5, bold: true, color: TONE[c.it.rightTone] || INK }); ty += 11;
      c.notes.forEach((l) => { pdf.text(x0, ty, l, { size: 7.5, color: MUTED }); ty += 9.5; });
      if (!c.it.photos.length) return;
      ty += 4;
      c.it.photos.forEach((p, j) => {
        const x = x0 + j * (c.pw + GAP);
        pdf.text(x, ty, one(p.label, c.pw, 7, true), { size: 7, bold: true, color: TONE[p.tone] || INK });
        pdf.rect(x, ty + 10, c.pw, c.bh, { fill: tile });
        pdf.imageFit(p.img, x, ty + 10, c.pw, c.bh);
        c.caps[j].forEach((l, k) => pdf.text(x, ty + 10 + c.bh + 4 + k * 8.5, l, { size: 7, color: MUTED }));
      });
    };
    // ---- v2.26.1: tables after page 1 (the BOQ / BOM of an As-Plan or As-Built), before the photo pages
    (model.tables || []).forEach((tb) => {
      const fr = tb.widths || tb.head.map(() => 1), tot = fr.reduce((a, b) => a + b, 0), ws = fr.map((f) => (f / tot) * CW);
      const xs = ws.map((w, i) => M + ws.slice(0, i).reduce((a, b) => a + b, 0));
      const title = (cont) => { pdf.addPage(); y = M; pdf.rect(M, y, 5, 14, { fill: ACCENT }); pdf.text(M + 12, y + 1, `${tb.title.toUpperCase()}${cont ? ' (continued)' : ''}`, { size: 11, bold: true }); y += 18;
        if (tb.sub && !cont) { wrapText(tb.sub, CW, 8).slice(0, 2).forEach((l) => { pdf.text(M, y, l, { size: 8, color: MUTED }); y += 10; }); } y += 6; };
      const headRow = () => {
        const ls = tb.head.map((h, i) => wrapText(String(h), ws[i] - 8, 8, true).slice(0, 2)), h = Math.max(...ls.map((l) => l.length)) * 10 + 8;
        pdf.rect(M, y, CW, h, { fill: [0.11, 0.2, 0.36] });
        ls.forEach((l, i) => l.forEach((t, k) => pdf.text(xs[i] + 4, y + 4 + k * 10, t, { size: 8, bold: true, color: [1, 1, 1] })));
        y += h;
      };
      title(false); headRow();
      tb.rows.forEach((r, ri) => {
        const ls = r.cells.map((v, i) => wrapText(String(v ?? ''), ws[i] - 8, 8.5, !!(r.tones && r.tones[i])).slice(0, 8)), h = Math.max(1, ...ls.map((l) => l.length)) * 10.5 + 7;
        if (y + h > BOTTOM) { title(true); headRow(); }
        if (ri % 2) pdf.rect(M, y, CW, h, { fill: [0.96, 0.97, 0.98] });
        ls.forEach((l, i) => l.forEach((t, k) => pdf.text(xs[i] + 4, y + 4 + k * 10.5, t, { size: 8.5, bold: !!(r.tones && r.tones[i]), color: TONE[r.tones && r.tones[i]] || INK })));
        pdf.line(M, y + h, M + CW, y + h, { color: [0.85, 0.87, 0.89] });
        y += h;
      });
      y += 10;
      (tb.notes || []).forEach((n) => {
        const ls = wrapText(n.t, CW, 8.5, n.tone === 'bad');
        if (y + ls.length * 11 > BOTTOM) title(true);
        ls.forEach((l) => { pdf.text(M, y, l, { size: 8.5, bold: n.tone === 'bad', color: n.tone === 'bad' ? RED : MUTED }); y += 11; });
        y += 4;
      });
    });
    secs.forEach((sec, si) => {
      if (sec.layout === 'collage') {
        head(sec, false, si ? CROW : null);
        sec.items.forEach((it, i) => {
          const c = i % COLS;
          if (c === 0 && i > 0) { y += CROW; if (y + CROW > BOTTOM + 6) head(sec, true); }
          const x = M + c * (TW + CGAP);
          pdf.rect(x, y, TW, TH, { fill: tile });
          pdf.imageFit(it.img, x, y, TW, TH);
          let ty = y + TH + 4;
          pdf.text(x, ty, one(it.head, TW, 8, true), { size: 8, bold: true }); ty += 10;
          (it.lines || []).slice(0, 1).forEach((l) => { pdf.text(x, ty, one(l, TW, 7), { size: 7, color: MUTED }); ty += 9; });
          if (it.warn) pdf.text(x, ty, one(it.warn, TW, 7, true), { size: 7, bold: true, color: RED });
        });
        y += CROW;
        return;
      }
      const rows = chainRows(sec.items);
      head(sec, false, si ? rows[0].h : null);
      rows.forEach(({ cells, h }, ri) => {
        if (ri && y + h > BOTTOM + 6) head(sec, true);
        cells.forEach((c, j) => drawCell(c, M + j * (HALF + GAP)));
        y += h;
        if (ri < rows.length - 1) pdf.line(M, y - 7, M + CW, y - 7, { color: [0.85, 0.87, 0.89] });
      });
    });

    reportFooters(pdf, model, M);
    return pdf;
  }

  /** v2.23: the last page names the KMZ embedded in this PDF, what it holds and its SHA-256, with a paperclip to open it.
      o: { name, mb, sha256, title, lines: [text], note } */
  /* ---------------- v2.24: the attached KMZ as a small stamp at the lower right of the first page ---------------- */
  /** h: the stamp's height; maxText: the widest line in it (pt) */
  const STAMP = { h: 23, maxText: 200 };
  /** a line of text cut to a width, with an ellipsis */
  const fitLine = (str, w, size, bold) => { let t = String(str || ''); if (textWidth(t, size, bold) <= w) return t; while (t.length > 1 && textWidth(t + '\u2026', size, bold) > w) t = t.slice(0, -1); return t.replace(/\s+$/, '') + '\u2026'; };
  /** A footer line in the width left of the stamp: smaller type (down to 5.5 pt), else two lines. */
  function footerLines(str, w, size) {
    const t = String(str || '');
    for (let z = size; z >= 5.5; z -= 0.5) if (textWidth(t, z) <= w) return { lines: [t], size: z };
    const ls = wrapText(t, w, 5.5); // two lines (an extremely long one is cut at the end of the second)
    return { lines: ls.length <= 2 ? ls : [ls[0], fitLine(ls.slice(1).join(' '), w, 5.5)], size: 5.5 };
  }
  /** The footer of every report page; v2.24: on the first page, the KMZ stamp at the lower right, with the footer line and the
      page number ending just before it. */
  function reportFooters(pdf, model, M) {
    const total = pdf.pages.length, sb = model.attach ? attachStamp(pdf, model.attach.bytes, model.attach, pdf.W - M, pdf.H - 38) : null;
    pdf.pages.forEach((pg, i) => {
      pdf.page = pg;
      const right = i === 0 && sb ? sb.x - 8 : pdf.W - M, pn = `Page ${i + 1} of ${total}`;
      pdf.line(M, pdf.H - 34, i === 0 && sb ? sb.x - 6 : pdf.W - M, pdf.H - 34, { color: [0.82, 0.85, 0.87] });
      pdf.text(M, pdf.H - 28, fitLine(model.footer, right - M - textWidth(pn, 7.5) - 12, 7.5), { size: 7.5, color: MUTED });
      pdf.text(right, pdf.H - 28, pn, { size: 7.5, color: MUTED, align: 'right' });
      if (model.footer2) { // who exported the file
        const f = i === 0 && sb ? footerLines(model.footer2, right - M, 6.5) : { lines: [model.footer2], size: 6.5 };
        f.lines.forEach((l, k) => pdf.text(M, pdf.H - (f.lines.length > 1 ? 20 : 19) + k * 6.5, l, { size: f.size, color: MUTED }));
      }
    });
  }
  /** a small paperclip, 5.8 x 12.8 units of s pt, at x, y (top-left) */
  function clipIcon(pdf, x, y, s, color) {
    const k = 0.5523, P = (u, v) => `${f2(x + u * s)} ${f2(pdf.H - (y + v * s))}`;
    const top = (cx, cy, r) => `${P(cx - r, cy - k * r)} ${P(cx - k * r, cy - r)} ${P(cx, cy - r)} c ${P(cx + k * r, cy - r)} ${P(cx + r, cy - k * r)} ${P(cx + r, cy)} c`;
    const bot = (cx, cy, r) => `${P(cx + r, cy + k * r)} ${P(cx + k * r, cy + r)} ${P(cx, cy + r)} c ${P(cx - k * r, cy + r)} ${P(cx - r, cy + k * r)} ${P(cx - r, cy)} c`;
    pdf.op(`q ${pdf.color(color, true)} ${f2(0.75 * s)} w 1 J 1 j ${P(2.2, 9.5)} m ${P(2.2, 3.2)} l ${top(3.2, 3.2, 1)} ${P(4.2, 11)} l ${bot(2.4, 11, 1.8)} ${P(0.6, 2.6)} l ${top(3.2, 2.6, 2.6)} ${P(5.8, 9)} l S Q`);
  }
  /** v2.24: the KMZ of this report, embedded in the PDF and shown as a low-profile stamp at the lower right of the first page:
      the file name and size, what it holds (o.short) and its SHA-256, in small text. The whole stamp is the file's click target
      (Adobe Acrobat Reader, Foxit, Firefox); the PDF also opens on its attachments panel where the reader supports it.
      right: the stamp's right edge; top: its top (pt, from the top-left). */
  function attachStamp(pdf, bytes, o, right, top) {
    const keep = pdf.page; pdf.page = pdf.pages[0];
    const T = STAMP.maxText, ell = '\u2026', fit = (str, size, bold) => fitLine(str, T, size, bold);
    const head = 'KMZ ATTACHED', gap = textWidth(head + ' ', 6, true), tail = ` \u00b7 ${o.mb} MB`;
    let name = String(o.name || 'map.kmz');
    if (gap + textWidth(name + tail, 6) > T) { // a long name: keep its start and its end (the date, .kmz), shorten the middle
      const n0 = name; let k = n0.length - 1;
      const cut = (k) => n0.slice(0, Math.ceil(k / 2)) + ell + n0.slice(n0.length - Math.floor(k / 2));
      while (k > 8 && gap + textWidth(cut(k) + tail, 6) > T) k--;
      name = cut(k);
    }
    const l2 = fit(o.short, 5.5, false), l3 = fit(`SHA-256 ${o.sha256 || ''}`, 5, false);
    const pad = 4, icon = 9, h = STAMP.h;
    const w = pad + icon + Math.max(gap + textWidth(name + tail, 6), textWidth(l2, 5.5), textWidth(l3, 5)) + pad, x = right - w, y = top;
    pdf.rect(x, y, w, h, { fill: [0.955, 0.97, 0.99], stroke: [0.62, 0.71, 0.82], lw: 0.5 });
    clipIcon(pdf, x + pad, y + (h - 12.8 * 0.95) / 2, 0.95, BLUE);
    const tx = x + pad + icon;
    pdf.text(tx, y + 3.2, head, { size: 6, bold: true, color: ACCENT });
    pdf.text(tx + gap, y + 3.2, name + tail, { size: 6, color: INK });
    pdf.text(tx, y + 10, l2, { size: 5.5, color: INK });
    pdf.text(tx, y + 16.2, l3, { size: 5, color: MUTED });
    const desc = `${o.desc || `KMZ for Google Earth: ${o.name}`}. Open or save it from the attachments (paperclip) in Adobe Acrobat Reader, Foxit or Firefox. SHA-256 ${o.sha256 || ''}`;
    pdf.attach(o.name, bytes, { mime: 'application/vnd.google-earth.kmz', desc, page: 0, rect: [x, y, w, h] });
    pdf.page = keep;
    return { x, y, w, h };
  }

  const api = { attachStamp, STAMP, fitLine, footerLines, buildXlsxParts, xstyle, Pdf, punchlistPdf, rectificationPdf, completionPdf, acceptanceKml, csv, textWidth, wrapText, jpegInfo, pdfEsc, STYLES, colName, RED, GREEN, BLUE, MUTED, INK, ACCENT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PoleReports = api;
})(typeof self !== 'undefined' ? self : this);
