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
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0000000"/></numFmts>
<fonts count="6">
<font><sz val="10"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="14"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFC92A2A"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF2B8A3E"/><name val="Arial"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF5A6570"/><name val="Arial"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDDE2E6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDE4E3"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE3F4E6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFB0B7BD"/></left><right style="thin"><color rgb="FFB0B7BD"/></right><top style="thin"><color rgb="FFB0B7BD"/></top><bottom style="thin"><color rgb="FFB0B7BD"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function sheetXml(sh) {
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
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
  }
  function safeSheetName(n) { return String(n).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Sheet'; }
  /** sheets: [{name, cols, rows, merges, freezeRow, autoFilter, heights}] -> zip parts (Uint8Array[]) */
  function buildXlsxParts(sheets) {
    const names = sheets.map((s) => safeSheetName(s.name));
    const files = [];
    files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` });
    files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
    const defined = sheets.map((s, i) => s.autoFilter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i].replace(/'/g, "''")}'!${s.autoFilter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : '').join('');
    files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}</workbook>` });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    files.push({ name: 'xl/styles.xml', data: stylesXml });
    sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }));
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

  class Pdf {
    constructor() { this.W = 595.28; this.H = 841.89; this.pages = []; this.images = []; this.page = null; }
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
      const nObj = firstPage + this.pages.length * 2 - 1 + 1; // +1 for info dict
      const infoObj = nObj;
      push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
      obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
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
        obj(pn, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${cn} 0 R >>`));
        const content = latin1(pg.ops.join('\n'));
        obj(cn, () => { push(`<< /Length ${content.length} >>\nstream\n`); push(content); push('\nendstream'); });
      });
      const d = new Date(), p2 = (x) => String(x).padStart(2, '0');
      const pdfDate = `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
      obj(infoObj, () => push(`<< /Title (${pdfEsc(info && info.title || '')}) /Producer (PoleCam Survey) /CreationDate (${pdfDate}) >>`));
      const xref = pos;
      let x = `xref\n0 ${infoObj + 1}\n0000000000 65535 f \n`;
      for (let n = 1; n <= infoObj; n++) x += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
      push(x);
      push(`trailer\n<< /Size ${infoObj + 1} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      return parts;
    }
  }

  /* ---------------- punchlist PDF layout ---------------- */
  const RED = [0.79, 0.16, 0.16], GREEN = [0.17, 0.54, 0.24], BLUE = [0.1, 0.44, 0.76], MUTED = [0.35, 0.4, 0.44], INK = [0.09, 0.13, 0.16], ACCENT = [0.11, 0.23, 0.42];
  const statusColor = (s) => (s === 'Open' || s === 'With deficiency' ? RED : s === 'Rectified' ? BLUE : GREEN);

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
    const total = pdf.pages.length;
    pdf.pages.forEach((pg, i) => {
      pdf.page = pg;
      pdf.line(M, pdf.H - 34, pdf.W - M, pdf.H - 34, { color: [0.82, 0.85, 0.87] });
      pdf.text(M, pdf.H - 28, model.footer, { size: 7.5, color: MUTED });
      pdf.text(pdf.W - M, pdf.H - 28, `Page ${i + 1} of ${total}`, { size: 7.5, color: MUTED, align: 'right' });
    });
    return pdf;
  }

  /* ================= acceptance KML ================= */
  /**
   * recs: [{id, title, name, status, lat, lon, detailsHtml, photos:[name], defs:[{no,text,sev,status}]}]
   * icons: {Open:'icons/open.png', OK:'icons/ok.png', Rectified:'icons/rect.png'} (paths inside files/)
   */
  function acceptanceKml(recs, o) {
    const label = { Open: 'With open deficiency', OK: 'Passed (no deficiency)', Rectified: 'All deficiencies rectified' };
    const styles = Object.entries(o.icons).map(([k, href]) =>
      `<Style id="st_${k}"><IconStyle><scale>1.1</scale><Icon><href>files/${href}</href></Icon></IconStyle><LabelStyle><scale>0.85</scale></LabelStyle></Style>`).join('\n');
    const folders = ['Open', 'Rectified', 'OK'].map((st) => {
      const list = recs.filter((r) => r.status === st);
      if (!list.length) return '';
      const marks = list.map((r) => {
        const defs = r.defs.length ? `<br/><b>Deficiencies</b><ol>${r.defs.map((d) => `<li value="${d.no}"><b>${xmlEsc(d.text)}</b> — ${xmlEsc(d.sev)} · <span style="color:${d.status === 'Rectified' ? '#1971c2' : '#c92a2a'}">${xmlEsc(d.status)}</span></li>`).join('')}</ol>` : '<br/><b style="color:#2b8a3e">No deficiency</b>';
        const pics = r.photos.map((p) => `<img src="files/${xmlEsc(p)}" width="360"/><br/>`).join('');
        const desc = `<b>${xmlEsc(r.title)}</b><br/>${r.detailsHtml}${defs}<br/>${pics}`;
        return `<Placemark><name>${xmlEsc(r.name)}</name><styleUrl>#st_${st}</styleUrl><description><![CDATA[${desc.replace(/]]>/g, ']]&gt;')}]]></description>` +
          `<Point><coordinates>${r.lon.toFixed(8)},${r.lat.toFixed(8)},0</coordinates></Point></Placemark>`;
      }).join('\n');
      return `<Folder><name>${label[st]} (${list.length})</name>\n${marks}\n</Folder>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(o.name)}</name>\n${styles}\n${folders}\n</Document></kml>\n`;
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

    const total = pdf.pages.length;
    pdf.pages.forEach((pg, i) => {
      pdf.page = pg;
      pdf.line(M, pdf.H - 34, pdf.W - M, pdf.H - 34, { color: [0.82, 0.85, 0.87] });
      pdf.text(M, pdf.H - 28, model.footer, { size: 7.5, color: MUTED });
      pdf.text(pdf.W - M, pdf.H - 28, `Page ${i + 1} of ${total}`, { size: 7.5, color: MUTED, align: 'right' });
    });
    return pdf;
  }

  const api = { buildXlsxParts, Pdf, punchlistPdf, rectificationPdf, acceptanceKml, csv, textWidth, wrapText, jpegInfo, STYLES, colName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PoleReports = api;
})(typeof self !== 'undefined' ? self : this);
