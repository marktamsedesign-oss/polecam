/* PoleCam acceptance forms: the "List of Deficiencies" form (PAT / FAT) as PDF pages and as an Excel sheet laid out like the
   office template, plus the photo annexes. Depends on PoleReports (Pdf writer, XLSX styles) and PoleCore. */
(function (root) {
  'use strict';
  const R = (typeof module !== 'undefined' && module.exports) ? require('./reports.js') : root.PoleReports;
  const { wrapText, textWidth } = R;
  const BLACK = [0, 0, 0], WHITE = [1, 1, 1], GREY = [0.5, 0.5, 0.5], LIGHT = [0.93, 0.93, 0.93], RED = [0.79, 0.16, 0.16], BLUE = [0.1, 0.44, 0.76], GREEN = [0.17, 0.54, 0.24], MUTED = [0.35, 0.4, 0.44];

  /** The wording of the form; an admin can change any line (see policy.form in the app). */
  const DEFAULT_FORM = {
    company: 'GLOBE TELECOM INC.',
    address: '12th FLR. WCC BLDG.  7th Ave. cor 30th St., Bonifacio Global City, TAGUIG CITY',
    dept1: 'ACCESS ENGINEERING & PERFORMANCE MANAGEMENT',
    dept2: 'REGIONAL CABLE NETWORK ENGINEERING',
    patTitle: 'PROVISIONAL ACCEPTANCE TEST REPORT', fatTitle: 'FINAL ACCEPTANCE TEST REPORT',
    title: 'LIST OF DEFICIENCIES', subtitle: 'Acceptance Inspection',
    types: ['Physical', 'Grounding', 'Electrical / Optical'],
    colItem: 'Item No.', colCat: 'Category', colRef: 'Item / Reference', colDate: 'Rectified Date', colDateSub: 'OSP CONST',
    legend: 'D = Minor Deficiency          MD = Major Deficiency          N = Note',
    codes: { Major: 'MD', Minor: 'D', Note: 'N' },
    endorsed: 'ENDORSED BY:', accepted: 'ACCEPTED BY:',
    leftTitle: 'CONTRACTOR REPRESENTATIVE', rightTitle: 'GLOBE REPRESENTATIVE',
    rowsPerPage: 15,
  };
  const formText = (f) => ({ ...DEFAULT_FORM, ...(f || {}), codes: { ...DEFAULT_FORM.codes, ...((f && f.codes) || {}) } });

  /* ================= PDF ================= */
  /**
   * model: { form (overrides), logos:{left:jpeg|null, right:jpeg|null}, stage:'PAT'|'FAT', typesChecked:['Physical'],
   *   location, project, vendor, date, pageDate, items:[{no, code, text, rectified}],
   *   signers:{ left:{name, date}, right:{name, date} },
   *   annexA:[{no, loc, element, code, text, status, statusTone, stages:[{label, jpeg|null, lines:[], pending:bool, tone}], remarks}],
   *   annexB:[{jpeg, caption, sub}], photoH, footer }
   */
  function deficiencyFormPdf(model) {
    const F = formText(model.form), pdf = new R.Pdf({ size: 'letter' });
    const ML = 26, MR = 26, MT = 26, W = pdf.W - ML - MR, X0 = ML, X1 = pdf.W - MR;
    const add = (b) => { if (!b) return null; try { return pdf.addImage(b); } catch (e) { return null; } };
    const logoL = add(model.logos && model.logos.left), logoR = add(model.logos && model.logos.right);
    const perPage = F.rowsPerPage || 15, items = model.items || [];
    const formPages = Math.max(1, Math.ceil(items.length / perPage));
    const box = (x, y, s, checked) => { // a tick box like the ones on the printed form
      pdf.rect(x, y, s, s, { fill: WHITE, stroke: BLACK, lw: 1 });
      if (checked) { pdf.line(x + 2, y + 2, x + s - 2, y + s - 2, { color: BLACK, lw: 1.6 }); pdf.line(x + s - 2, y + 2, x + 2, y + s - 2, { color: BLACK, lw: 1.6 }); }
    };
    const fitText = (s, width, size, bold) => { let sz = size; while (sz > 5 && textWidth(s, sz, bold) > width) sz -= 0.5; return sz; };

    for (let pg = 0; pg < formPages; pg++) {
      pdf.addPage();
      let y = MT;
      // ---- header: logos and office lines
      const hh = 64;
      if (logoL != null) pdf.imageFit(logoL, X0 + 6, y + 4, 118, hh - 8);
      if (logoR != null) pdf.imageFit(logoR, X1 - 84, y + 2, 78, hh - 4);
      const cx = X0 + W / 2;
      pdf.text(cx, y + 4, F.company, { size: 13, bold: true, color: BLACK, align: 'center' });
      pdf.text(cx, y + 21, F.address, { size: fitText(F.address, W - 240, 6.5), color: BLACK, align: 'center' });
      pdf.text(cx, y + 34, F.dept1, { size: 8, bold: true, color: BLACK, align: 'center' });
      pdf.text(cx, y + 46, F.dept2, { size: 8, bold: true, color: BLACK, align: 'center' });
      y += hh;
      // ---- PAT / FAT band
      pdf.rect(X0, y, W, 24, { fill: BLACK });
      const half = W / 2;
      [[F.patTitle, model.stage === 'PAT'], [F.fatTitle, model.stage === 'FAT']].forEach(([t, on], i) => {
        const bx = X0 + i * half + 34;
        box(bx, y + 6, 12, on);
        pdf.text(bx + 20, y + 7, t, { size: 9, color: WHITE });
      });
      y += 24 + 12;
      // ---- title bands
      pdf.rect(X0, y, W, 20, { fill: GREY });
      pdf.text(cx, y + 3, F.title, { size: 13, bold: true, color: WHITE, align: 'center' });
      y += 20;
      pdf.text(cx, y + 4, F.subtitle, { size: 11, bold: true, color: BLACK, align: 'center' });
      y += 22;
      // ---- inspection types
      const types = F.types || [], tw = W / Math.max(1, types.length);
      types.forEach((t, i) => {
        const tx = X0 + i * tw + tw / 2 - (textWidth(t, 9) + 18) / 2;
        box(tx, y + 1, 10, (model.typesChecked || []).includes(t));
        pdf.text(tx + 16, y + 1, t, { size: 9, color: BLACK });
      });
      y += 20;
      // ---- location / project / vendor lines
      const infoRow = (label, value, right) => {
        pdf.line(X0, y + 15, X1, y + 15, { color: BLACK, lw: 0.6 });
        pdf.text(X0 + 4, y + 2, label, { size: 9, bold: true, color: BLACK });
        pdf.text(X0 + 4 + textWidth(label, 9, true) + 10, y + 2, value || '', { size: fitText(value || '', right ? W * 0.55 : W - 110, 9, true), bold: true, color: BLACK });
        if (right) {
          pdf.text(X0 + W * 0.66, y + 2, right[0], { size: 9, bold: true, color: BLACK });
          pdf.text(X0 + W * 0.66 + textWidth(right[0], 9, true) + 8, y + 2, right[1] || '', { size: 9, bold: true, color: BLACK });
        }
        y += 16;
      };
      pdf.rect(X0, y, W, 48, { stroke: BLACK, lw: 0.6 });
      infoRow('Location:', model.location, ['Page:', `${pg + 1} of ${formPages}`]);
      infoRow('Project Name:', model.project);
      infoRow('Vendor:', model.vendor, ['Date:', model.date || '']);
      y += 8;
      // ---- table
      const cw = { no: 34, cat: 36, date: 104 }; cw.ref = W - cw.no - cw.cat - cw.date;
      const xNo = X0, xCat = xNo + cw.no, xRef = xCat + cw.cat, xDate = xRef + cw.ref;
      const hdrH = 26, rowH = 26;
      pdf.rect(X0, y, W, hdrH, { stroke: BLACK, lw: 0.8 });
      [xCat, xRef, xDate].forEach((x) => pdf.line(x, y, x, y + hdrH + rowH * perPage, { color: BLACK, lw: 0.6 }));
      pdf.text(xNo + cw.no / 2, y + 3, 'Item', { size: 8.5, bold: true, color: BLACK, align: 'center' });
      pdf.text(xNo + cw.no / 2, y + 14, 'No.', { size: 8.5, bold: true, color: BLACK, align: 'center' });
      pdf.text(xCat + cw.cat / 2, y + 3, 'Cate', { size: 8.5, bold: true, color: BLACK, align: 'center' });
      pdf.text(xCat + cw.cat / 2, y + 14, 'gory', { size: 8.5, bold: true, color: BLACK, align: 'center' });
      pdf.text(xRef + cw.ref / 2, y + 8, F.colRef, { size: 9, bold: true, color: BLACK, align: 'center' });
      pdf.text(xDate + cw.date / 2, y + 2, F.colDate, { size: 9, bold: true, color: BLACK, align: 'center' });
      pdf.line(xDate, y + 13, X1, y + 13, { color: BLACK, lw: 0.6 });
      pdf.text(xDate + cw.date / 2, y + 15, F.colDateSub, { size: 7, color: BLACK, align: 'center' });
      y += hdrH;
      for (let r = 0; r < perPage; r++) {
        const it = items[pg * perPage + r];
        pdf.rect(X0, y, W, rowH, { stroke: BLACK, lw: 0.6 });
        if (it) {
          pdf.text(xNo + cw.no / 2, y + 8, String(it.no), { size: 9, color: BLACK, align: 'center' });
          pdf.text(xCat + cw.cat / 2, y + 8, it.code || '', { size: 9, bold: true, color: it.code === 'MD' ? RED : BLACK, align: 'center' });
          let size = 8.5, lines = wrapText(it.text, cw.ref - 8, size, true);
          if (lines.length > 2) { size = 7.5; lines = wrapText(it.text, cw.ref - 8, size, true); }
          if (lines.length > 3) { size = 6.5; lines = wrapText(it.text, cw.ref - 8, size, true).slice(0, 3); lines[2] = lines[2].replace(/\s*\S*$/, '…'); }
          const lh = size + 1.5, top = y + (rowH - lines.length * lh) / 2;
          lines.forEach((l, k) => pdf.text(xRef + 4, top + k * lh, l, { size, bold: true, color: BLACK }));
          if (it.rectified) pdf.text(xDate + cw.date / 2, y + 8, it.rectified, { size: fitText(it.rectified, cw.date - 6, 8.5, true), bold: true, color: BLACK, align: 'center' });
        }
        y += rowH;
      }
      y += 6;
      // ---- legend
      pdf.text(cx, y + 2, F.legend, { size: 9, bold: true, color: BLACK, align: 'center' });
      y += 18;
      // ---- signatures
      const sh = 58, sw = W / 2, sg = model.signers || {};
      pdf.rect(X0, y, W, sh, { stroke: BLACK, lw: 0.8 });
      pdf.line(X0 + sw, y, X0 + sw, y + sh, { color: BLACK, lw: 0.8 });
      [[F.endorsed, sg.left, F.leftTitle], [F.accepted, sg.right, F.rightTitle]].forEach(([head, who, title], i) => {
        const x = X0 + i * sw;
        pdf.text(x + 6, y + 3, head, { size: 9, bold: true, color: BLACK });
        const dateW = (who && who.date) ? Math.max(70, textWidth(who.date, 8.5)) : 70, dx = x + sw - 6 - dateW; // the date is right-aligned to its own half
        pdf.text(dx - textWidth('DATE: ', 9, true), y + 3, 'DATE:', { size: 9, bold: true, color: BLACK });
        if (who && who.date) pdf.text(dx, y + 3.5, who.date, { size: 8.5, color: BLACK });
        pdf.line(dx - 2, y + 14, x + sw - 6, y + 14, { color: BLACK, lw: 0.5 });
        pdf.text(x + sw / 2, y + 27, (who && who.name) || '', { size: fitText((who && who.name) || '', sw - 16, 9.5, true), bold: true, color: BLACK, align: 'center' });
        pdf.line(x + 6, y + sh - 15, x + sw - 6, y + sh - 15, { color: BLACK, lw: 0.6 });
        pdf.text(x + sw / 2, y + sh - 12, title, { size: 8.5, color: BLACK, align: 'center' });
      });
      y += sh;
      pdf.rect(X0 - 3, MT - 3, W + 6, y - MT + 6, { stroke: BLACK, lw: 1.4 }); // outer frame
      if (model.footer) pdf.text(X0, pdf.H - 20, model.footer, { size: 6.5, color: MUTED });
    }

    // ---- Annex A: photo evidence per item (as found → rectified → verified)
    const photoH = model.photoH || 210, stageN = 3, gap = 8, slotW = (W - gap * (stageN - 1)) / stageN, BOTTOM = pdf.H - 36;
    let y = 0;
    const newPage = (title, sub) => {
      pdf.addPage(); y = MT;
      pdf.rect(X0, y, W, 24, { fill: BLACK });
      pdf.text(X0 + 8, y + 6, title, { size: 10.5, bold: true, color: WHITE });
      pdf.text(X1 - 8, y + 7, `${model.project || ''}${model.location ? ' · ' + model.location : ''}`, { size: 8, color: WHITE, align: 'right' });
      y += 30;
      if (sub) { wrapText(sub, W, 8).forEach((l) => { pdf.text(X0, y, l, { size: 8, color: MUTED }); y += 10; }); y += 6; }
    };
    const toneColor = (t) => (t === 'bad' ? RED : t === 'good' ? GREEN : t === 'blue' ? BLUE : MUTED);
    if (model.annexA && model.annexA.length) {
      model.annexA.forEach((it) => it.stages.forEach((st) => { st.img = add(st.jpeg); }));
      newPage(`ANNEX A · PHOTO EVIDENCE OF DEFICIENCIES (${model.annexA.length})`, 'One block per punchlist item, in the same order as the form. Each photo was taken live in the app; the time, GPS position and the person are recorded at the moment of capture and printed under it.');
      for (const it of model.annexA) {
        const head = wrapText(`ITEM ${it.no}   ${it.loc}${it.element ? ' · ' + it.element : ''}${it.code ? '   [' + it.code + ']' : ''}`, W - 150, 10, true);
        const desc = wrapText(it.text, W - 150, 8.5);
        const capN = Math.max(...it.stages.map((st) => (st.lines || []).reduce((n, l) => n + wrapText(l, slotW, 7).length, 0)), 1);
        const h = 6 + head.length * 12 + desc.length * 10 + 6 + 12 + photoH + 4 + capN * 9 + (it.remarks ? 12 : 0) + 14;
        if (y + h > BOTTOM) newPage('ANNEX A · PHOTO EVIDENCE OF DEFICIENCIES (continued)');
        pdf.rect(X0, y, W, 4 + head.length * 12 + desc.length * 10 + 4, { fill: LIGHT });
        pdf.rect(X0, y, 4, 4 + head.length * 12 + desc.length * 10 + 4, { fill: toneColor(it.statusTone) });
        head.forEach((l, k) => pdf.text(X0 + 10, y + 4 + k * 12, l, { size: 10, bold: true, color: BLACK }));
        desc.forEach((l, k) => pdf.text(X0 + 10, y + 4 + head.length * 12 + k * 10, l, { size: 8.5, color: BLACK }));
        pdf.text(X1 - 8, y + 5, it.status, { size: 9, bold: true, color: toneColor(it.statusTone), align: 'right' });
        y += 4 + head.length * 12 + desc.length * 10 + 4 + 6;
        it.stages.forEach((st, i) => {
          const x = X0 + i * (slotW + gap);
          pdf.text(x, y, st.label, { size: 7.5, bold: true, color: toneColor(st.tone) });
          const by = y + 11;
          if (st.img != null) { pdf.rect(x, by, slotW, photoH, { fill: [0.9, 0.91, 0.92] }); pdf.imageFit(st.img, x, by, slotW, photoH); }
          else {
            const calm = st.pending || st.plain; // pending = not yet due; plain = done without a photo (not an error)
            pdf.rect(x, by, slotW, photoH, { fill: calm ? [0.985, 0.985, 0.98] : [0.99, 0.93, 0.93], stroke: calm ? [0.75, 0.78, 0.8] : RED, lw: 0.6 });
            const msg = wrapText(st.note || (st.pending ? 'Pending' : 'No photo'), slotW - 12, 8, true);
            msg.forEach((l, k) => pdf.text(x + slotW / 2, by + photoH / 2 - msg.length * 5 + k * 10, l, { size: 8, bold: true, color: st.plain ? toneColor(st.tone) : calm ? MUTED : RED, align: 'center' }));
          }
          let cy = by + photoH + 3;
          (st.lines || []).forEach((l) => wrapText(l, slotW, 7).forEach((w) => { pdf.text(x, cy, w, { size: 7, color: MUTED }); cy += 9; }));
        });
        y += 11 + photoH + 4 + capN * 9;
        if (it.remarks) { pdf.text(X0, y, `Remarks: ${wrapText(it.remarks, W - 50, 8)[0]}`, { size: 8, color: BLACK }); y += 12; }
        y += 10; pdf.line(X0, y - 5, X1, y - 5, { color: [0.8, 0.83, 0.85] });
      }
    }
    // ---- Annex B: inspection photo log
    if (model.annexB && model.annexB.length) {
      model.annexB.forEach((p) => { p.img = add(p.jpeg); });
      const per = 3, pw = (W - gap * (per - 1)) / per, ph = model.photoH || 210;
      newPage(`ANNEX B · INSPECTION PHOTO LOG (${model.annexB.length} photos)`, 'Every element photographed during the inspection, with the label chosen in the app and the time it was taken.');
      for (let i = 0; i < model.annexB.length; i += per) {
        if (y + 12 + ph + 24 > BOTTOM) newPage('ANNEX B · INSPECTION PHOTO LOG (continued)');
        model.annexB.slice(i, i + per).forEach((p, j) => {
          const x = X0 + j * (pw + gap);
          pdf.rect(x, y, pw, ph, { fill: [0.9, 0.91, 0.92] });
          if (p.img != null) pdf.imageFit(p.img, x, y, pw, ph);
          pdf.text(x, y + ph + 3, wrapText(p.caption, pw, 8, true)[0], { size: 8, bold: true, color: BLACK });
          if (p.sub) pdf.text(x, y + ph + 13, wrapText(p.sub, pw, 7)[0], { size: 7, color: MUTED });
        });
        y += ph + 28;
      }
    }
    // ---- page numbers on annex pages
    const total = pdf.pages.length;
    pdf.pages.forEach((pg, i) => {
      if (i < formPages) return;
      pdf.page = pg;
      pdf.line(X0, pdf.H - 28, X1, pdf.H - 28, { color: [0.82, 0.85, 0.87] });
      pdf.text(X0, pdf.H - 23, model.footer || '', { size: 7, color: MUTED });
      pdf.text(X1, pdf.H - 23, `Page ${i + 1} of ${total}`, { size: 7, color: MUTED, align: 'right' });
    });
    return pdf;
  }

  /* ================= Excel: the same form, laid out like the office template ================= */
  const px2emu = (px) => Math.round(px * 9525);
  /**
   * Returns a sheet spec for PoleReports.buildXlsxParts: one 43-row block per page of 15 items, with the logos as pictures.
   * model as for deficiencyFormPdf (logos as JPEG bytes).
   */
  function deficiencyFormSheet(model) {
    const F = formText(model.form), xs = R.xstyle;
    const thin = 'thin', med = 'medium';
    const st = {
      company: xs({ font: { b: 1, sz: 16, name: 'Calibri' }, align: { h: 'center', v: 'center' } }),
      addr: xs({ font: { sz: 8 }, align: { h: 'center', v: 'center' } }),
      dept: xs({ font: { b: 1, sz: 11, name: 'Calibri' }, align: { h: 'center', v: 'center', wrap: 1 } }),
      band: xs({ font: { sz: 11, color: 'FFFFFFFF' }, fill: 'FF000000', align: { h: 'center', v: 'center' } }),
      bandBox: xs({ font: { b: 1, sz: 12 }, fill: 'FFFFFFFF', border: { left: med, right: med, top: med, bottom: med }, align: { h: 'center', v: 'center' } }),
      bandFill: xs({ fill: 'FF000000' }),
      title: xs({ font: { b: 1, sz: 16, color: 'FFFFFFFF' }, fill: 'FF808080', align: { h: 'center', v: 'center' } }),
      sub: xs({ font: { b: 1, sz: 14 }, align: { h: 'center', v: 'center' } }),
      types: xs({ font: { sz: 11 }, align: { h: 'center', v: 'center' } }),
      lab: xs({ font: { b: 1, sz: 11 }, align: { v: 'center' } }),
      labC: xs({ font: { b: 1, sz: 11 }, align: { h: 'center', v: 'center' } }),
      lineB: xs({ font: { b: 1, sz: 11 }, border: { bottom: thin }, align: { v: 'center' } }),
      lineBc: xs({ font: { b: 1, sz: 11 }, border: { bottom: thin }, align: { h: 'center', v: 'center' } }),
      th: xs({ font: { b: 1, sz: 11 }, border: thin, align: { h: 'center', v: 'center', wrap: 1 } }),
      thSub: xs({ font: { sz: 9 }, border: thin, align: { h: 'center', v: 'center' } }),
      cellC: xs({ font: { sz: 10 }, border: thin, align: { h: 'center', v: 'center' } }),
      cellCb: xs({ font: { b: 1, sz: 10 }, border: thin, align: { h: 'center', v: 'center' } }),
      cellMD: xs({ font: { b: 1, sz: 10, color: 'FFC92A2A' }, border: thin, align: { h: 'center', v: 'center' } }),
      cellRef: xs({ font: { b: 1, sz: 10 }, border: thin, align: { v: 'center', wrap: 1, indent: 1 } }),
      legend: xs({ font: { b: 1, sz: 11 }, align: { h: 'center', v: 'center' } }),
      sigHead: xs({ font: { b: 1, sz: 11 }, align: { v: 'center' } }),
      sigDate: xs({ font: { b: 1, sz: 9 }, align: { v: 'center', h: 'right' } }),
      sigName: xs({ font: { b: 1, sz: 11 }, align: { h: 'center', v: 'bottom' } }),
      sigTitle: xs({ font: { sz: 11 }, border: { top: thin }, align: { h: 'center', v: 'center' } }),
      frameT: xs({ border: { top: med } }), frameB: xs({ border: { bottom: med } }), frameL: xs({ border: { left: med } }), frameR: xs({ border: { right: med } }),
    };
    const perPage = F.rowsPerPage || 15, items = model.items || [], pages = Math.max(1, Math.ceil(items.length / perPage));
    const BLOCK = 43, rows = [], heights = {}, merges = [], images = [], rowBreaks = [];
    const H = { 1: 14.25, 2: 14.25, 3: 12.75, 4: 14.25, 5: 14.25, 6: 15.75, 7: 14.25, 8: 15, 9: 20.25, 10: 20.25, 11: 20.25, 12: 14.25, 13: 14.25, 14: 14.25, 15: 15, 16: 15, 17: 15.75, 18: 15, 19: 15, 20: 14.25, 36: 45, 37: 14.25, 38: 15, 39: 14.25, 40: 9, 41: 21.95, 42: 14.25, 43: 14.25 };
    const chk = (on) => (on ? '☒' : '☐');
    for (let pg = 0; pg < pages; pg++) {
      const o = pg * BLOCK, row = (n) => o + n - 1; // 1-based row n of this block -> 0-based index
      const set = (n, col, v, s) => { const r = row(n); rows[r] = rows[r] || []; rows[r][col] = { v, s }; };
      const span = (a, b) => merges.push(`${a.replace(/\d+$/, (d) => String(o + +d))}:${b.replace(/\d+$/, (d) => String(o + +d))}`);
      for (let n = 1; n <= BLOCK; n++) { rows[row(n)] = rows[row(n)] || []; if (H[n]) heights[row(n)] = H[n]; else if (n >= 21 && n <= 35) heights[row(n)] = 35.1; }
      set(1, 4, F.company, st.company); span('E1', 'F2');
      set(3, 3, F.address, st.addr); span('D3', 'H3');
      set(4, 3, `${F.dept1}\n${F.dept2}`, st.dept); span('D4', 'H6');
      for (let c = 0; c < 9; c++) { set(7, c, '', st.bandFill); set(8, c, '', st.bandFill); }
      set(7, 1, model.stage === 'PAT' ? 'X' : '', st.bandBox); span('B7', 'B8');
      set(7, 2, F.patTitle, st.band); span('C7', 'E8');
      set(7, 5, model.stage === 'FAT' ? 'X' : '', st.bandBox); span('F7', 'F8');
      set(7, 6, F.fatTitle, st.band); span('G7', 'I8');
      set(10, 0, F.title, st.title); span('A10', 'I10');
      set(11, 0, F.subtitle, st.sub); span('A11', 'I11');
      set(13, 0, (F.types || []).map((t) => `${chk((model.typesChecked || []).includes(t))} ${t}`).join('          '), st.types); span('A13', 'I13');
      set(15, 0, 'Location:', st.lineB); set(15, 1, '', st.lineB); set(15, 2, model.location || '', st.lineB); span('C15', 'F15');
      set(15, 6, `Page: ${pg + 1}`, st.lineB); set(15, 7, 'of', st.lineBc); set(15, 8, String(pages), st.lineB);
      set(16, 0, 'Project Name:', st.lineB); set(16, 1, '', st.lineB); set(16, 2, '', st.lineB); set(16, 3, model.project || '', st.lineB); span('D16', 'F16'); for (let c = 6; c < 9; c++) set(16, c, '', st.lineB);
      set(17, 0, 'Vendor:', st.lineB); set(17, 1, '', st.lineB); set(17, 2, '', st.lineB); set(17, 3, model.vendor || '', st.lineB); span('D17', 'F17');
      set(17, 6, 'Date:', st.lineB); set(17, 7, model.date || '', st.lineB); span('H17', 'I17');
      set(19, 0, F.colItem, st.th); span('A19', 'A20'); set(20, 0, '', st.th);
      set(19, 1, 'Cate gory', st.th); span('B19', 'B20'); set(20, 1, '', st.th);
      set(19, 2, F.colRef, st.th); span('C19', 'G20'); for (let c = 3; c < 7; c++) { set(19, c, '', st.th); set(20, c, '', st.th); } set(20, 2, '', st.th);
      set(19, 7, F.colDate, st.th); span('H19', 'I19'); set(19, 8, '', st.th);
      set(20, 7, F.colDateSub, st.thSub); span('H20', 'I20'); set(20, 8, '', st.thSub);
      for (let r = 0; r < perPage; r++) {
        const n = 21 + r, it = items[pg * perPage + r];
        set(n, 0, it ? it.no : '', st.cellC);
        set(n, 1, it ? it.code || '' : '', it && it.code === 'MD' ? st.cellMD : st.cellCb);
        set(n, 2, it ? it.text : '', st.cellRef); span(`C${n}`, `G${n}`); for (let c = 3; c < 7; c++) set(n, c, '', st.cellRef);
        set(n, 7, it ? it.rectified || '' : '', st.cellCb); span(`H${n}`, `I${n}`); set(n, 8, '', st.cellCb);
      }
      set(36, 0, F.legend.replace(/\s{3,}/g, '          '), st.legend); span('A36', 'I36');
      const sg = model.signers || {};
      set(37, 0, F.endorsed, st.sigHead); span('A37', 'C37'); set(37, 3, `DATE:  ${(sg.left && sg.left.date) || ''}`, st.sigDate); span('D37', 'E37');
      set(37, 5, F.accepted, st.sigHead); span('F37', 'G37'); set(37, 7, `DATE:  ${(sg.right && sg.right.date) || ''}`, st.sigDate); span('H37', 'I37');
      set(38, 0, (sg.left && sg.left.name) || '', st.sigName); span('A38', 'E40');
      set(38, 5, (sg.right && sg.right.name) || '', st.sigName); span('F38', 'I40');
      set(41, 0, F.leftTitle, st.sigTitle); span('A41', 'E41'); for (let c = 1; c < 5; c++) set(41, c, '', st.sigTitle);
      set(41, 5, F.rightTitle, st.sigTitle); span('F41', 'I41'); for (let c = 6; c < 9; c++) set(41, c, '', st.sigTitle);
      if (model.logos && model.logos.left) images.push({ bytes: model.logos.left, ext: 'jpeg', from: { col: 0, row: row(1), colOff: px2emu(14), rowOff: px2emu(4) }, to: { col: 3, row: row(6), colOff: px2emu(40), rowOff: px2emu(2) } });
      if (model.logos && model.logos.right) images.push({ bytes: model.logos.right, ext: 'jpeg', from: { col: 7, row: row(1), colOff: px2emu(10), rowOff: px2emu(3) }, to: { col: 8, row: row(6), colOff: px2emu(58), rowOff: px2emu(4) } });
      if (pg < pages - 1) rowBreaks.push(o + BLOCK);
    }
    return { name: `${model.stage || 'PAT'} Deficiency List`, cols: [5.1, 5.2, 8.43, 21.1, 18, 8.43, 16.8, 10.6, 8.43], rows, heights, merges, images, rowBreaks,
      page: { paper: 1, orientation: 'portrait', fitToWidth: 1, fitToHeight: pages, margins: { left: 0.25, right: 0.26, top: 0.5, bottom: 0.5 } } }; // one form block per printed page, scaled like the office template
  }

  const api = { DEFAULT_FORM, formText, deficiencyFormPdf, deficiencyFormSheet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PoleForms = api;
})(typeof self !== 'undefined' ? self : this);
