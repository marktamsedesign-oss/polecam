/* PoleCam core: UTM projection, EXIF read/write, ZIP, KMZ, DXF, CSV.
   No dependencies. Works in the browser (window.PoleCore) and in Node (module.exports). */
(function (root) {
  'use strict';

  /* ---------------- UTM (WGS84, Krüger series) ---------------- */
  const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
  const K0 = 0.9996;

  function utmForward(lat, lon, zone, south) {
    const { a, f } = WGS84;
    const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
    const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64);
    const al = [0,
      n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180,
      13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440,
      61 * n3 / 240 - 103 * n4 / 140,
      49561 * n4 / 161280];
    const lon0 = (zone * 6 - 183) * Math.PI / 180;
    const phi = lat * Math.PI / 180, dl = lon * Math.PI / 180 - lon0;
    const c = 2 * Math.sqrt(n) / (1 + n);
    const s = Math.sin(phi);
    const t = Math.sinh(Math.atanh(s) - c * Math.atanh(c * s));
    const xi = Math.atan2(t, Math.cos(dl));
    const eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
    let E = eta, N = xi;
    for (let j = 1; j <= 4; j++) {
      E += al[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
      N += al[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    }
    return { E: 500000 + K0 * A * E, N: (south ? 10000000 : 0) + K0 * A * N };
  }

  /* ---------------- small binary helpers ---------------- */
  const enc = (s) => new TextEncoder().encode(s);
  function concat(parts) {
    let len = 0; for (const p of parts) len += p.length;
    const out = new Uint8Array(len); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function ascii(s) { // EXIF ASCII: keep 7-bit only
    const b = new Uint8Array(s.length + 1);
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i] = c < 128 ? c : 63; }
    return b;
  }
  function ucs2(s) { // XP* tags: UCS-2 LE, null-terminated
    const b = new Uint8Array((s.length + 1) * 2);
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i * 2] = c & 255; b[i * 2 + 1] = c >> 8; }
    return b;
  }

  /* ---------------- EXIF writer (little-endian TIFF) ---------------- */
  // types: 1 BYTE, 2 ASCII, 3 SHORT, 4 LONG, 5 RATIONAL, 7 UNDEFINED
  const TSIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };
  function rationals(pairs) {
    const b = new Uint8Array(pairs.length * 8), dv = new DataView(b.buffer);
    pairs.forEach(([nu, de], i) => { dv.setUint32(i * 8, nu, true); dv.setUint32(i * 8 + 4, de, true); });
    return b;
  }
  function dms(deg) {
    deg = Math.abs(deg);
    const d = Math.floor(deg), mf = (deg - d) * 60, m = Math.floor(mf);
    const s = Math.round((mf - m) * 60 * 10000);
    return rationals([[d, 1], [m, 1], [s, 10000]]);
  }
  function ifdSize(entries) {
    let data = 0;
    for (const e of entries) { if (e.bytes.length > 4) data += e.bytes.length + (e.bytes.length & 1); }
    return 2 + entries.length * 12 + 4 + data;
  }
  function writeIFD(entries, offset) {
    entries = entries.slice().sort((x, y) => x.tag - y.tag);
    const size = ifdSize(entries), out = new Uint8Array(size), dv = new DataView(out.buffer);
    dv.setUint16(0, entries.length, true);
    let dataOff = 2 + entries.length * 12 + 4;
    entries.forEach((e, i) => {
      const p = 2 + i * 12;
      dv.setUint16(p, e.tag, true); dv.setUint16(p + 2, e.type, true);
      dv.setUint32(p + 4, e.bytes.length / TSIZE[e.type], true);
      if (e.bytes.length <= 4) out.set(e.bytes, p + 8);
      else {
        dv.setUint32(p + 8, offset + dataOff, true);
        out.set(e.bytes, dataOff);
        dataOff += e.bytes.length + (e.bytes.length & 1);
      }
    });
    dv.setUint32(2 + entries.length * 12, 0, true); // no next IFD
    return out;
  }
  const u16 = (v) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; };
  const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
  function exifDate(d) {
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /** Build an Exif APP1 TIFF block with GPS + description. */
  function buildExif(meta) {
    const date = exifDate(meta.date || new Date());
    const desc = meta.description || '';
    const ifd0 = [
      { tag: 0x010E, type: 2, bytes: ascii(desc) },            // ImageDescription
      { tag: 0x0131, type: 2, bytes: ascii('G-eSAA') },        // Software
      { tag: 0x0132, type: 2, bytes: ascii(date) },             // DateTime
      ...(meta.artist ? [{ tag: 0x013B, type: 2, bytes: ascii(meta.artist) }] : []), // Artist: who exported the photo
      { tag: 0x9C9B, type: 1, bytes: ucs2(meta.title || '') },   // XPTitle (Windows)
      { tag: 0x9C9C, type: 1, bytes: ucs2(desc) },               // XPComment (Windows)
      { tag: 0x8769, type: 4, bytes: u32(0) },                  // Exif IFD ptr (patched)
      { tag: 0x8825, type: 4, bytes: u32(0) },                  // GPS IFD ptr (patched)
    ];
    const uc = concat([new Uint8Array([65, 83, 67, 73, 73, 0, 0, 0]), ascii(desc).slice(0, -1)]);
    const exif = [
      { tag: 0x9000, type: 7, bytes: enc('0232') },              // ExifVersion
      { tag: 0x9003, type: 2, bytes: ascii(date) },              // DateTimeOriginal
      { tag: 0x9286, type: 7, bytes: uc },                       // UserComment
    ];
    const gps = [
      { tag: 0x0000, type: 1, bytes: new Uint8Array([2, 3, 0, 0]) },
      { tag: 0x0001, type: 2, bytes: ascii(meta.lat >= 0 ? 'N' : 'S') },
      { tag: 0x0002, type: 5, bytes: dms(meta.lat) },
      { tag: 0x0003, type: 2, bytes: ascii(meta.lon >= 0 ? 'E' : 'W') },
      { tag: 0x0004, type: 5, bytes: dms(meta.lon) },
      { tag: 0x0012, type: 2, bytes: ascii('WGS-84') },
    ];
    if (Number.isFinite(meta.alt)) {
      gps.push({ tag: 0x0005, type: 1, bytes: new Uint8Array([meta.alt < 0 ? 1 : 0, 0, 0, 0]).slice(0, 1) });
      gps.push({ tag: 0x0006, type: 5, bytes: rationals([[Math.round(Math.abs(meta.alt) * 100), 100]]) });
    }
    if (Number.isFinite(meta.accuracy)) {   // GPSHPositioningError
      gps.push({ tag: 0x001F, type: 5, bytes: rationals([[Math.round(meta.accuracy * 100), 100]]) });
    }
    const o0 = 8, o1 = o0 + ifdSize(ifd0), o2 = o1 + ifdSize(exif);
    ifd0.find((e) => e.tag === 0x8769).bytes = u32(o1);
    ifd0.find((e) => e.tag === 0x8825).bytes = u32(o2);
    const head = new Uint8Array([0x49, 0x49, 0x2A, 0x00, 8, 0, 0, 0]);
    return concat([head, writeIFD(ifd0, o0), writeIFD(exif, o1), writeIFD(gps, o2)]);
  }

  /** Return JPEG bytes with any existing APP0/APP1 removed and a fresh Exif APP1 inserted. */
  function insertExif(jpeg, meta) {
    if (jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) throw new Error('Not a JPEG');
    const tiff = buildExif(meta);
    const segLen = 2 + 6 + tiff.length;
    if (segLen > 65535) throw new Error('EXIF too large');
    const app1 = concat([new Uint8Array([0xFF, 0xE1, segLen >> 8, segLen & 255]), enc('Exif\0\0'), tiff]);
    // walk segments, drop APP0 (JFIF) and APP1 (old Exif/XMP)
    const keep = [];
    let i = 2;
    while (i < jpeg.length) {
      if (jpeg[i] !== 0xFF) break;
      const m = jpeg[i + 1];
      if (m === 0xDA) break; // start of scan: rest is image data
      const len = (jpeg[i + 2] << 8) | jpeg[i + 3];
      if (m !== 0xE0 && m !== 0xE1) keep.push(jpeg.subarray(i, i + 2 + len));
      i += 2 + len;
    }
    return concat([new Uint8Array([0xFF, 0xD8]), app1, ...keep, jpeg.subarray(i)]);
  }

  /* ---------------- EXIF reader ---------------- */
  function readExif(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    let i = 2;
    while (i + 4 < b.length && b[i] === 0xFF) {
      const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (m === 0xDA) break;
      if (m === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
        try { return parseTiff(b, i + 10); } catch (e) { return null; }
      }
      i += 2 + len;
    }
    return null;
  }
  function parseTiff(b, t) {
    const dv = new DataView(b.buffer, b.byteOffset);
    const le = b[t] === 0x49;
    const r16 = (o) => dv.getUint16(t + o, le), r32 = (o) => dv.getUint32(t + o, le);
    function ifd(off) {
      const out = {}; const n = r16(off);
      for (let k = 0; k < n; k++) {
        const p = off + 2 + k * 12, tag = r16(p), type = r16(p + 2), cnt = r32(p + 4);
        const size = (TSIZE[type] || 1) * cnt;
        const vo = size <= 4 ? p + 8 : r32(p + 8);
        out[tag] = { type, cnt, vo };
      }
      return out;
    }
    const str = (e) => { let s = ''; for (let k = 0; k < e.cnt; k++) { const c = b[t + e.vo + k]; if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
    const rat = (e, k) => r32(e.vo + k * 8) / (r32(e.vo + k * 8 + 4) || 1);
    const xp = (e) => { let s = ''; for (let k = 0; k + 1 < e.cnt; k += 2) { const c = b[t + e.vo + k] | (b[t + e.vo + k + 1] << 8); if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
    const res = {};
    const i0 = ifd(r32(4));
    if (i0[0x010E]) res.description = str(i0[0x010E]);
    if (i0[0x9C9C]) res.xpComment = xp(i0[0x9C9C]);
    if (i0[0x9C9B]) res.xpTitle = xp(i0[0x9C9B]);
    if (i0[0x0132]) res.dateTime = str(i0[0x0132]);
    if (i0[0x8769]) {
      const ex = ifd(r32(i0[0x8769].vo));
      if (ex[0x9003]) res.dateTimeOriginal = str(ex[0x9003]);
      if (ex[0x9286] && ex[0x9286].cnt > 8) {
        const e = ex[0x9286]; let s = '';
        for (let k = 8; k < e.cnt; k++) { const c = b[t + e.vo + k]; if (!c) break; s += String.fromCharCode(c); }
        res.userComment = s.trim();
      }
    }
    if (i0[0x8825]) {
      const g = ifd(r32(i0[0x8825].vo));
      if (g[2] && g[4]) {
        let lat = rat(g[2], 0) + rat(g[2], 1) / 60 + rat(g[2], 2) / 3600;
        let lon = rat(g[4], 0) + rat(g[4], 1) / 60 + rat(g[4], 2) / 3600;
        if (g[1] && str(g[1]) === 'S') lat = -lat;
        if (g[3] && str(g[3]) === 'W') lon = -lon;
        if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) { res.lat = lat; res.lon = lon; }
      }
      if (g[6]) { let alt = rat(g[6], 0); if (g[5] && b[t + g[5].vo] === 1) alt = -alt; res.alt = alt; }
    }
    return res;
  }
  function parseExifDate(s) {
    const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(s || '');
    return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
  }

  /* ---------------- ZIP (store) writer + reader ---------------- */
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(d) { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function dosTime(d) {
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  /** files: [{name, data:Uint8Array|string}] -> Uint8Array zip */
  function makeZip(files, when) { return concat(makeZipParts(files, when)); }
  /** Same as makeZip but returns the list of byte chunks (wrap in a Blob to avoid copying large photos). */
  function makeZipParts(files, when) {
    const { time, date } = dosTime(when || new Date());
    const locals = [], centrals = []; let offset = 0;
    for (const f of files) {
      const data = typeof f.data === 'string' ? enc(f.data) : f.data;
      const name = enc(f.name), crc = crc32(data);
      const lh = new Uint8Array(30), l = new DataView(lh.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true);
      l.setUint16(8, 0, true); l.setUint16(10, time, true); l.setUint16(12, date, true);
      l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true);
      l.setUint16(26, name.length, true); l.setUint16(28, 0, true);
      const ch = new Uint8Array(46), c = new DataView(ch.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      locals.push(lh, name, data); centrals.push(ch, name);
      offset += 30 + name.length + data.length;
    }
    const cd = concat(centrals);
    const eo = new Uint8Array(22), e = new DataView(eo.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cd.length, true); e.setUint32(16, offset, true);
    return [...locals, cd, eo];
  }
  /** Reads a zip. Returns [{name, method, data(raw)}]; method 8 needs inflating by caller. */
  function readZip(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = b.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Not a zip file');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const out = [], dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const lo = dv.getUint32(p + 42, true), name = dec.decode(b.subarray(p + 46, p + 46 + nl));
      const lnl = dv.getUint16(lo + 26, true), lel = dv.getUint16(lo + 28, true);
      const start = lo + 30 + lnl + lel;
      out.push({ name, method, data: b.subarray(start, start + csize) });
      p += 46 + nl + el + cl;
    }
    return out;
  }

  /* ---------------- text helpers ---------------- */
  const xmlEsc = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  function safeName(s) {
    return String(s || 'point').replace(/[\u2010-\u2015]/g, '-').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_?-_?/g, '-').replace(/_+/g, '_').replace(/^[_-]+|[_-]+$/g, '').slice(0, 60) || 'point';
  }
  function fmtDate(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(); }

  /* ---------------- KML / KMZ ---------------- */
  /**
   * points: [{id, poleId, poleType, lat, lon, alt, accuracy, takenAt, photoName, iconName}]
   * opts: {project, photoIcons:boolean, stamped:boolean (balloon photos carry the caption band), stampFields:[...]}
   */
  /* Survey points other than poles (v2.13): their folder in Google Earth and their pin when there is no photo icon. */
  const KML_EL = { Pole: ['Poles', 'red-circle'], PoleProposed: ['Poles — proposed', 'wht-circle'], PoleNew: ['Poles — new', 'ylw-circle'], Site: ['Sites', 'purple-stars'], ODC: ['ODC', 'grn-square'],
    ODF: ['ODF', 'blu-square'], NAP: ['NAP', 'ylw-diamond'], Closure: ['Closures (POI)', 'pink-diamond'], Handhole: ['Handholes', 'wht-square'] };
  function buildKml(points, opts) {
    const o = opts || {};
    const styles = [], marks = {};
    for (const p of points) {
      const sid = 's_' + p.id, el = KML_EL[p.element] ? p.element : 'Pole';
      const fk = el === 'Pole' && (p.status === 'Proposed' || p.status === 'New') ? `Pole${p.status}` : el; // proposed and new poles get their own folder
      const href = o.photoIcons && p.iconName ? `files/${p.iconName}` : `http://maps.google.com/mapfiles/kml/paddle/${KML_EL[fk][1]}.png`;
      styles.push(`<Style id="${sid}"><IconStyle><scale>${o.photoIcons ? 1.4 : 1.0}</scale><Icon><href>${xmlEsc(href)}</href></Icon></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle></Style>`);
      const img = p.photoName ? `<img src="files/${xmlEsc(p.photoName)}" width="480"/>` : '';
      // The balloon title is already the Pole ID; lines the stamped photo already shows are not repeated under it.
      const onPhoto = new Set(p.photoName && o.stamped ? (o.stampFields || ['id', 'coords', 'utm', 'time', 'by', 'project']) : []);
      const lines = [];
      if (el !== 'Pole') lines.push(xmlEsc([el, p.statusLabel || p.status, p.closureId ? `closure ${p.closureId}` : ''].filter(Boolean).join(' · ')));
      if (!onPhoto.has('id') && p.poleType) lines.push(`${xmlEsc(p.poleType)} pole${el === 'Pole' && p.status ? ` · ${xmlEsc(p.statusLabel || p.status)}` : ''}`);
      else if (el === 'Pole' && p.status) lines.push(xmlEsc(p.statusLabel || p.status));
      if (p.boqText) lines.push(`Size: ${xmlEsc(p.boqText)}`);
      if (p.detailsText) lines.push(`Details: ${xmlEsc(p.detailsText)}`);
      if (p.remarks) lines.push(xmlEsc(p.remarks));
      if (p.boxes) lines.push('Red box marked on the photo');
      if (!onPhoto.has('coords')) lines.push(`${p.lat.toFixed(7)}, ${p.lon.toFixed(7)}${Number.isFinite(p.accuracy) ? ` (GPS ±${p.accuracy.toFixed(1)} m${p.adjusted ? ', pin adjusted' : ''})` : ''}`);
      if (!onPhoto.has('time') && fmtDate(p.takenAt)) lines.push(`Captured ${xmlEsc(fmtDate(p.takenAt))}`);
      const desc = img + (img && lines.length ? '<br/>' : '') + lines.join('<br/>');
      (marks[fk] = marks[fk] || []).push(`<Placemark><name>${xmlEsc(p.poleId)}</name><styleUrl>#${sid}</styleUrl>` +
        `<description><![CDATA[${desc.replace(/]]>/g, ']]&gt;')}]]></description>` +
        `<ExtendedData><Data name="pole_id"><value>${xmlEsc(p.poleId)}</value></Data><Data name="pole_type"><value>${xmlEsc(p.poleType)}</value></Data>` +
        `<Data name="element"><value>${xmlEsc(el)}</value></Data><Data name="status"><value>${xmlEsc(p.status || '')}</value></Data>` +
        (p.closureId ? `<Data name="closure_id"><value>${xmlEsc(p.closureId)}</value></Data>` : '') + (p.remarks ? `<Data name="remarks"><value>${xmlEsc(p.remarks)}</value></Data>` : '') +
        (p.detailsText ? `<Data name="pole_details"><value>${xmlEsc(p.detailsText)}</value></Data>` : '') +
        BOQ_COLS.filter((c) => p.boq && p.boq[c[0]]).map((c) => `<Data name="${c[1]}"><value>${xmlEsc(p.boq[c[0]])}</value></Data>`).join('') +
        `<Data name="captured"><value>${xmlEsc(p.takenAt)}</value></Data><Data name="accuracy_m"><value>${Number.isFinite(p.accuracy) ? p.accuracy.toFixed(1) : ''}</value></Data></ExtendedData>` +
        `<Point><coordinates>${p.lon.toFixed(8)},${p.lat.toFixed(8)},0</coordinates></Point></Placemark>`);
    }
    let route = '';
    if (o.spans && o.spans.length) {
      styles.push('<Style id="span_ok"><LineStyle><color>ffe6a01c</color><width>3</width></LineStyle></Style>',
        '<Style id="span_long"><LineStyle><color>ff2a2ac9</color><width>4</width></LineStyle></Style>',
        ...Object.entries(CABLES).map(([k, c]) => `<Style id="cable_${k}"><LineStyle><color>${c.kml}</color><width>3</width></LineStyle></Style>`)); // v2.29: one colour per cable type
      // v2.28: the route as continuous lines (one per run between ends and junctions), not one line per span; each line lists
      // its spans; spans longer than the maximum are drawn again in red on top
      const chains = routeChains(o.spans), ll = (p) => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},0`;
      const lines = chains.map((c, i) => `<Placemark><name>${xmlEsc(`${chains.length > 1 ? `Route ${i + 1}` : 'Route'}: ${c.pts[0].poleId || ''} → ${c.pts[c.pts.length - 1].poleId || ''} · ${c.len.toFixed(0)} m${CABLES[c.cable] ? ` · ${CABLES[c.cable].short}` : ''}`)}</name><styleUrl>#${CABLES[c.cable] ? `cable_${c.cable}` : 'span_ok'}</styleUrl>` +
        `<description>${xmlEsc(`${c.spans.length} span${c.spans.length === 1 ? '' : 's'}, ${c.len.toFixed(1)} m\n${c.spans.map((s) => `${s.from} → ${s.to}: ${s.len.toFixed(1)} m${s.long ? ' (longer than the maximum span)' : ''}`).join('\n')}`)}</description>` +
        `<ExtendedData><Data name="length_m"><value>${c.len.toFixed(1)}</value></Data><Data name="spans"><value>${c.spans.length}</value></Data>${CABLES[c.cable] ? `<Data name="cable"><value>${xmlEsc(CABLES[c.cable].label)}</value></Data><Data name="method"><value>${CABLES[c.cable].method}</value></Data>` : ''}</ExtendedData>` +
        `<LineString><tessellate>1</tessellate><coordinates>${c.pts.map(ll).join(' ')}</coordinates></LineString></Placemark>`);
      const longs = o.spans.filter((s) => s.long).map((s) => `<Placemark><name>${xmlEsc(`${s.from} → ${s.to}: ${s.len.toFixed(1)} m (long span)`)}</name><styleUrl>#span_long</styleUrl>` +
        `<LineString><tessellate>1</tessellate><coordinates>${ll(s.a)} ${ll(s.b)}</coordinates></LineString></Placemark>`);
      route = `<Folder><name>Route (${o.spans.length} spans, ${o.spans.reduce((t, s) => t + s.len, 0).toFixed(0)} m)</name>\n${lines.join('\n')}\n${longs.length ? `<Folder><name>Long spans (${longs.length})</name>\n${longs.join('\n')}\n</Folder>\n` : ''}</Folder>\n`;
    }
    const by = o.exportedBy ? `<description>${xmlEsc(o.exportedBy)}</description><ExtendedData><Data name="exported_by"><value>${xmlEsc(o.exportedBy)}</value></Data></ExtendedData>\n` : '';
    const folders = Object.keys(KML_EL).filter((k) => marks[k]).map((k) => `<Folder><name>${KML_EL[k][0]}</name>\n${marks[k].join('\n')}\n</Folder>`).join('\n') || '<Folder><name>Poles</name>\n</Folder>';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(o.project || 'G-eSAA')}</name>\n${by}${styles.join('\n')}\n${route}${folders}</Document></kml>\n`;
  }

  /* ---------------- DXF: R2000 with the photo beside each point (v2.14), or R12 without photos ---------------- */
  function dxfText(s) {
    let out = '';
    for (const ch of String(s ?? '')) {
      const c = ch.codePointAt(0);
      out += c < 128 ? ch : '\\U+' + c.toString(16).toUpperCase().padStart(4, '0');
    }
    return out.replace(/[\r\n]+/g, ' ');
  }
  function dxfLayerName(s) { return String(s).toUpperCase().replace(/[^A-Z0-9_\-$]/g, '_').slice(0, 31) || 'LAYER'; }
  const blockName = (type) => dxfLayerName('POLE_' + (type || 'UNSPECIFIED'));
  /** Layer of a point: POLE_<type> (…_PROPOSED / …_NEW) for poles, <ELEMENT>_<STATUS> for the other survey points (e.g. ODF_PROPOSED). */
  const pointLayer = (p) => (!p.element || p.element === 'Pole'
    ? dxfLayerName(`POLE_${p.poleType || 'UNSPECIFIED'}${p.status === 'Proposed' || p.status === 'New' ? `_${p.status}` : ''}`)
    : dxfLayerName(`${p.element}_${p.status || 'UNSPECIFIED'}`));
  const EL_COLOR = { Site: 6, ODC: 3, ODF: 5, NAP: 2, Closure: 210, Handhole: 8 };

  /**
   * Drawing content in UTM metres, shared by both DXF versions.
   * points: [{id, poleId, poleType, element, status, lat, lon, detailsText}], roads: [{cls, name, coords:[[lat,lon],…]}]
   * opts: {zone, symbolSize, textHeight, spans, exportedBy, focPct (FOC allowance %, default 10), photos: {id: {file, px, py}}, photoW (m)}
   */
  /** Does the segment (x1,y1)-(x2,y2) cross the rectangle [rx1,rx2]×[ry1,ry2]? (Liang–Barsky clipping) */
  function segHitsRect(x1, y1, x2, y2, rx1, ry1, rx2, ry2) {
    let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
    for (const [pp, q] of [[-dx, x1 - rx1], [dx, rx2 - x1], [-dy, y1 - ry1], [dy, ry2 - y1]]) {
      if (pp === 0) { if (q < 0) return false; continue; }
      const t = q / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t0 <= t1;
  }
  function dxfGeom(points, opts, roads) {
    const o = opts, r = o.symbolSize, th = o.textHeight, pct = Math.max(0, Number.isFinite(+o.focPct) ? +o.focPct : 10);
    const U = (lat, lon) => utmForward(lat, lon, o.zone, lat < 0);
    const layers = new Map(), ents = [], palette = [1, 5, 3, 6, 4, 30, 2, 140];
    const lay = (name, color) => { if (!layers.has(name)) layers.set(name, color != null ? color : palette[layers.size % palette.length]); return name; };
    lay('0', 7);
    if (o.exportedBy) lay('EXPORT_INFO', 8);
    const roadColor = { OSM_ROAD_MAJOR: 9, OSM_ROAD_MINOR: 8, OSM_ROAD_PATH: 253 };
    for (const rd of roads || []) {
      const pts = rd.coords.map(([lat, lon]) => U(lat, lon)); if (pts.length < 2) continue;
      ents.push({ t: 'pline', l: lay(rd.cls, roadColor[rd.cls] || 8), pts: pts.map((p) => [p.E, p.N]) });
      if (rd.name) {
        const m = Math.floor((pts.length - 1) / 2), a = pts[m], b = pts[m + 1];
        let ang = Math.atan2(b.N - a.N, b.E - a.E) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        ents.push({ t: 'text', l: lay('ROAD_NAME', 8), x: (a.E + b.E) / 2, y: (a.N + b.N) / 2, h: th * 0.8, s: rd.name, a: ang });
      }
    }
    // the linked FOC route: span lines, and the FOC length (span + allowance) along each span
    for (const s of o.spans || []) {
      const A = U(s.a.lat, s.a.lon), B = U(s.b.lat, s.b.lon);
      const cab = CABLES[s.cable]; // v2.29: a layer per cable type
      ents.push({ t: 'line', l: lay(s.long ? 'SPAN_LONG' : cab ? cab.layer : 'CABLE_ROUTE', s.long ? 1 : cab ? cab.aci : 4), x1: A.E, y1: A.N, x2: B.E, y2: B.N });
      let ang = Math.atan2(B.N - A.N, B.E - A.E) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const t = `${(s.len * (1 + pct / 100)).toFixed(1)}m`, h = th * 0.75, rad = ang * Math.PI / 180, half = t.length * h * 0.3;
      const mx = (A.E + B.E) / 2, my = (A.N + B.N) / 2;
      ents.push({ t: 'text', l: lay('FOC_LENGTH', 7), x: mx - Math.cos(rad) * half - Math.sin(rad) * h * 0.6, y: my - Math.sin(rad) * half + Math.cos(rad) * h * 0.6, h, s: t, a: ang });
    }
    // points: a circle for each pole, a symbol for the other elements, the ID beside it, pole details under it, the photo above it
    const near = new Map(), addNb = (x, y) => { if (x && y && x.id != null) { if (!near.has(x.id)) near.set(x.id, []); near.get(x.id).push(y); } };
    for (const s of o.spans || []) { addNb(s.a, s.b); addNb(s.b, s.a); }
    for (const p of points) {
      const { E, N } = U(p.lat, p.lon), el = p.element && p.element !== 'Pole' ? p.element : 'Pole', L = lay(pointLayer(p), el === 'Pole' ? (p.status === 'Proposed' ? 1 : null) : EL_COLOR[el]);
      const ln = (x1, y1, x2, y2) => ents.push({ t: 'line', l: L, x1: E + x1, y1: N + y1, x2: E + x2, y2: N + y2 });
      const poly = (pts) => pts.forEach((a, k) => { const b = pts[(k + 1) % pts.length]; ln(a[0], a[1], b[0], b[1]); });
      const sq = (k) => poly([[-k, -k], [k, -k], [k, k], [-k, k]]);
      if (el === 'Pole') ents.push({ t: 'circle', l: L, x: E, y: N, r });
      else if (el === 'Site') { sq(r * 1.4); ln(-r * 1.4, -r * 1.4, r * 1.4, r * 1.4); ln(-r * 1.4, r * 1.4, r * 1.4, -r * 1.4); }
      else if (el === 'ODC') sq(r * 1.2);
      else if (el === 'ODF') { sq(r * 1.2); sq(r * 0.6); }
      else if (el === 'NAP') poly([[0, r * 1.2], [r * 1.1, -r * 0.8], [-r * 1.1, -r * 0.8]]);
      else if (el === 'Closure') poly([[0, r * 1.2], [r * 1.2, 0], [0, -r * 1.2], [-r * 1.2, 0]]);
      else { sq(r * 1.2); ln(-r * 1.2, -r * 1.2, r * 1.2, r * 1.2); } // handhole
      const tx = E + r * 1.5;
      ents.push({ t: 'text', l: lay('POLE_LABEL', 7), x: tx, y: N - th * 0.4, h: th, s: p.poleId });
      if (p.detailsText) ents.push({ t: 'text', l: lay('POLE_DETAILS', 8), x: tx, y: N - th * 1.6, h: th * 0.65, s: p.detailsText });
      const ph = o.photos && o.photos[p.id];
      if (ph && ph.px > 0 && ph.py > 0) {
        const w = Math.max(0.5, +o.photoW || 6), h = w * ph.py / ph.px, lx = E - r * 1.5 - w;
        // above-right of the point by default; else the corner the linked spans do not cross
        const spots = [[tx, N + th * 0.9], [lx, N + th * 0.9], [lx, N - th * 0.9 - h], [tx, N - th * (p.detailsText ? 2.3 : 1.4) - h]];
        const nb = (near.get(p.id) || []).map((q) => U(q.lat, q.lon)), hits = ([x, y]) => nb.filter((B) => segHitsRect(E, N, B.E, B.N, x, y, x + w, y + h)).length;
        let best = spots[0], bh = hits(best);
        for (const sp of spots.slice(1)) { if (!bh) break; const k = hits(sp); if (k < bh) { best = sp; bh = k; } }
        ents.push({ t: 'image', l: lay('POINT_PHOTO', 7), x: best[0], y: best[1], w, h, px: ph.px, py: ph.py, file: ph.file });
      }
    }
    if (o.exportedBy) ents.push({ t: 'text', l: 'EXPORT_INFO', h: th, s: o.exportedBy + (o.spans && o.spans.length ? ` | FOC length = span + ${pct}%` : ''), x: null, y: null, info: true });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
    ents.forEach((e) => {
      if (e.t === 'circle') { grow(e.x - e.r, e.y - e.r); grow(e.x + e.r, e.y + e.r); }
      else if (e.t === 'line') { grow(e.x1, e.y1); grow(e.x2, e.y2); }
      else if (e.t === 'pline') e.pts.forEach(([x, y]) => grow(x, y));
      else if (e.t === 'image') { grow(e.x, e.y); grow(e.x + e.w, e.y + e.h); }
      else if (e.t === 'text' && !e.info) grow(e.x, e.y);
    });
    if (minX === Infinity) { minX = minY = 0; maxX = maxY = 1; }
    const info = ents.find((e) => e.info); if (info) { info.x = minX; info.y = minY - th * 4; grow(info.x, info.y); } // below the drawing
    return { layers: [...layers.entries()], ents, ext: { minX, minY, maxX, maxY } };
  }
  const f3 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

  /** DXF R12 (AC1009): opens in every CAD program; no photos (R12 has no images). */
  function dxfR12(G) {
    const L = [], g = (c, v) => { L.push(String(c), String(v)); }, { minX, minY, maxX, maxY } = G.ext;
    g(999, 'G-eSAA DXF R12');
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
    g(9, '$EXTMIN'); g(10, f3(minX)); g(20, f3(minY)); g(30, 0);
    g(9, '$EXTMAX'); g(10, f3(maxX)); g(20, f3(maxY)); g(30, 0);
    g(9, '$LUNITS'); g(70, 2); g(9, '$LUPREC'); g(70, 3);
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0.0);
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, G.layers.length);
    for (const [name, color] of G.layers) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
    g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0.0); g(41, 1.0); g(50, 0.0); g(71, 0); g(42, 2.5); g(3, 'txt'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (const e of G.ents) {
      if (e.t === 'circle') { g(0, 'CIRCLE'); g(8, e.l); g(10, f3(e.x)); g(20, f3(e.y)); g(30, 0); g(40, f3(e.r)); }
      else if (e.t === 'line') { g(0, 'LINE'); g(8, e.l); g(10, f3(e.x1)); g(20, f3(e.y1)); g(30, 0); g(11, f3(e.x2)); g(21, f3(e.y2)); g(31, 0); }
      else if (e.t === 'text') { g(0, 'TEXT'); g(8, e.l); g(10, f3(e.x)); g(20, f3(e.y)); g(30, 0); g(40, f3(e.h)); g(1, dxfText(e.s)); if (e.a) g(50, e.a.toFixed(2)); }
      else if (e.t === 'pline') {
        g(0, 'POLYLINE'); g(8, e.l); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 0);
        for (const [x, y] of e.pts) { g(0, 'VERTEX'); g(8, e.l); g(10, f3(x)); g(20, f3(y)); g(30, 0); }
        g(0, 'SEQEND'); g(8, e.l);
      }
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }

  /* Fixed records of a DXF R2000 drawing (tables, layouts, materials, styles), taken from a reference file written by ezdxf
     and checked with its audit. Handles below 0x40 are these records; everything the app adds is numbered from 0x100. */
  const R2K = {"classes":[["0","CLASS","1","ACDBDICTIONARYWDFLT","2","AcDbDictionaryWithDefault","3","ObjectDBX Classes","90","0","280","0","281","0"],["0","CLASS","1","SUN","2","AcDbSun","3","SCENEOE","90","1153","280","0","281","0"],["0","CLASS","1","VISUALSTYLE","2","AcDbVisualStyle","3","ObjectDBX Classes","90","4095","280","0","281","0"],["0","CLASS","1","MATERIAL","2","AcDbMaterial","3","ObjectDBX Classes","90","1153","280","0","281","0"],["0","CLASS","1","SCALE","2","AcDbScale","3","ObjectDBX Classes","90","1153","280","0","281","0"],["0","CLASS","1","TABLESTYLE","2","AcDbTableStyle","3","ObjectDBX Classes","90","4095","280","0","281","0"],["0","CLASS","1","MLEADERSTYLE","2","AcDbMLeaderStyle","3","ACDB_MLEADERSTYLE_CLASS","90","4095","280","0","281","0"],["0","CLASS","1","DICTIONARYVAR","2","AcDbDictionaryVar","3","ObjectDBX Classes","90","0","280","0","281","0"],["0","CLASS","1","CELLSTYLEMAP","2","AcDbCellStyleMap","3","ObjectDBX Classes","90","1152","280","0","281","0"],["0","CLASS","1","MENTALRAYRENDERSETTINGS","2","AcDbMentalRayRenderSettings","3","SCENEOE","90","1024","280","0","281","0"],["0","CLASS","1","ACDBDETAILVIEWSTYLE","2","AcDbDetailViewStyle","3","ObjectDBX Classes","90","1025","280","0","281","0"],["0","CLASS","1","ACDBSECTIONVIEWSTYLE","2","AcDbSectionViewStyle","3","ObjectDBX Classes","90","1025","280","0","281","0"],["0","CLASS","1","RASTERVARIABLES","2","AcDbRasterVariables","3","ISM","90","0","280","0","281","0"],["0","CLASS","1","ACDBPLACEHOLDER","2","AcDbPlaceHolder","3","ObjectDBX Classes","90","0","280","0","281","0"],["0","CLASS","1","LAYOUT","2","AcDbLayout","3","ObjectDBX Classes","90","0","280","0","281","0"],["0","CLASS","1","IMAGE","2","AcDbRasterImage","3","ISM","90","2175","280","0","281","1"],["0","CLASS","1","IMAGEDEF","2","AcDbRasterImageDef","3","ISM","90","0","280","0","281","0"],["0","CLASS","1","IMAGEDEF_REACTOR","2","AcDbRasterImageDefReactor","3","ISM","90","1","280","0","281","0"]],"vport":["0","VPORT","5","23","330","8","100","AcDbSymbolTableRecord","100","AcDbViewportTableRecord","2","*Active","70","0","10","0.0","20","0.0","11","1.0","21","1.0","12","0.0","22","0.0","13","0.0","23","0.0","14","0.5","24","0.5","15","0.5","25","0.5","16","0.0","26","0.0","36","1.0","17","0.0","27","0.0","37","0.0","40","1000.0","41","1.34","42","50.0","43","0.0","44","0.0","50","0.0","51","0.0","71","0","72","1000","73","1","74","3","75","0","76","0","77","0","78","0","281","0","65","0","146","0.0"],"ltypes":[["0","LTYPE","5","24","330","2","100","AcDbSymbolTableRecord","100","AcDbLinetypeTableRecord","2","ByBlock","70","0","3","","72","65","73","0","40","0.0"],["0","LTYPE","5","25","330","2","100","AcDbSymbolTableRecord","100","AcDbLinetypeTableRecord","2","ByLayer","70","0","3","","72","65","73","0","40","0.0"],["0","LTYPE","5","26","330","2","100","AcDbSymbolTableRecord","100","AcDbLinetypeTableRecord","2","Continuous","70","0","3","","72","65","73","0","40","0.0"]],"layer0":["0","LAYER","5","27","330","1","100","AcDbSymbolTableRecord","100","AcDbLayerTableRecord","2","0","70","0","62","7","6","Continuous","370","-3","390","13"],"layerDef":["0","LAYER","5","28","330","1","100","AcDbSymbolTableRecord","100","AcDbLayerTableRecord","2","Defpoints","70","0","62","7","6","Continuous","290","0","370","-3","390","13"],"style":["0","STYLE","5","29","330","5","100","AcDbSymbolTableRecord","100","AcDbTextStyleTableRecord","2","Standard","70","0","40","0.0","41","1.0","50","0.0","71","0","42","2.5","3","txt","4",""],"appid":["0","APPID","5","2A","330","3","100","AcDbSymbolTableRecord","100","AcDbRegAppTableRecord","2","ACAD","70","0"],"dimstyleTable":["0","TABLE","2","DIMSTYLE","5","4","330","0","100","AcDbSymbolTable","70","1","100","AcDbDimStyleTable"],"dimstyle":["0","DIMSTYLE","105","2B","330","4","100","AcDbSymbolTableRecord","100","AcDbDimStyleTableRecord","2","Standard","70","0","3","","4","","40","1.0","41","2.5","42","0.625","43","3.75","44","1.25","45","0.0","46","0.0","47","0.0","48","0.0","140","2.5","141","2.5","142","0.0","143","0.03937007874","144","1.0","145","0.0","146","1.0","147","0.625","148","0.0","71","0","72","0","73","0","74","0","75","0","76","0","77","1","78","8","79","3","170","0","171","3","172","1","173","0","174","0","175","0","176","0","177","0","178","0","179","2","271","2","272","2","273","2","274","3","275","0","276","0","277","2","278","44","279","0","280","0","281","0","282","0","283","0","284","8","285","0","286","0","288","0","289","3","371","-2","372","-2"],"blocks":[["0","BLOCK","5","18","330","17","100","AcDbEntity","8","0","100","AcDbBlockBegin","2","*Model_Space","70","0","10","0.0","20","0.0","30","0.0","3","*Model_Space","1",""],["0","ENDBLK","5","19","330","17","100","AcDbEntity","8","0","100","AcDbBlockEnd"],["0","BLOCK","5","1C","330","1B","100","AcDbEntity","8","0","100","AcDbBlockBegin","2","*Paper_Space","70","0","10","0.0","20","0.0","30","0.0","3","*Paper_Space","1",""],["0","ENDBLK","5","1D","330","1B","100","AcDbEntity","8","0","100","AcDbBlockEnd"]],"static":[["0","DICTIONARY","5","B","330","A","100","AcDbDictionary","281","1"],["0","DICTIONARY","5","C","330","A","100","AcDbDictionary","281","1"],["0","DICTIONARY","5","D","330","A","100","AcDbDictionary","281","1","3","Model","350","1A","3","Layout1","350","1E"],["0","DICTIONARY","5","E","330","A","100","AcDbDictionary","281","1","3","ByBlock","350","1F","3","ByLayer","350","20","3","Global","350","21"],["0","DICTIONARY","5","F","330","A","100","AcDbDictionary","281","1","3","Standard","350","2C"],["0","DICTIONARY","5","10","330","A","100","AcDbDictionary","281","1","3","Standard","350","22"],["0","DICTIONARY","5","11","330","A","100","AcDbDictionary","281","1"],["0","ACDBDICTIONARYWDFLT","5","12","330","A","100","AcDbDictionary","281","1","3","Normal","350","13","100","AcDbDictionaryWithDefault","340","13"],["0","ACDBPLACEHOLDER","5","13","330","12"],["0","DICTIONARY","5","14","330","A","100","AcDbDictionary","281","1"],["0","DICTIONARY","5","15","330","A","100","AcDbDictionary","281","1"],["0","DICTIONARY","5","16","330","A","100","AcDbDictionary","281","1"],["0","LAYOUT","5","1A","330","D","100","AcDbPlotSettings","1","","4","A3","6","","40","7.5","41","20.0","42","7.5","43","20.0","44","420.0","45","297.0","46","0.0","47","0.0","48","0.0","49","0.0","140","0.0","141","0.0","142","1.0","143","1.0","70","1024","72","1","73","0","74","5","7","","75","16","76","0","77","2","78","300","147","1.0","148","0.0","149","0.0","100","AcDbLayout","1","Model","70","1","71","0","10","0.0","20","0.0","11","420.0","21","297.0","12","0.0","22","0.0","32","0.0","14","1e+20","24","1e+20","34","1e+20","15","-1e+20","25","-1e+20","35","-1e+20","146","0.0","13","0.0","23","0.0","33","0.0","16","1.0","26","0.0","36","0.0","17","0.0","27","1.0","37","0.0","76","1","330","17"],["0","LAYOUT","5","1E","330","D","100","AcDbPlotSettings","1","","4","A3","6","","40","7.5","41","20.0","42","7.5","43","20.0","44","420.0","45","297.0","46","0.0","47","0.0","48","0.0","49","0.0","140","0.0","141","0.0","142","1.0","143","1.0","70","0","72","1","73","0","74","5","7","","75","16","76","0","77","2","78","300","147","1.0","148","0.0","149","0.0","100","AcDbLayout","1","Layout1","70","1","71","1","10","0.0","20","0.0","11","420.0","21","297.0","12","0.0","22","0.0","32","0.0","14","1e+20","24","1e+20","34","1e+20","15","-1e+20","25","-1e+20","35","-1e+20","146","0.0","13","0.0","23","0.0","33","0.0","16","1.0","26","0.0","36","0.0","17","0.0","27","1.0","37","0.0","76","1","330","1B"],["0","MATERIAL","5","1F","102","{ACAD_REACTORS","330","E","102","}","330","E","100","AcDbMaterial","1","ByBlock","2","","70","0","40","1.0","71","1","41","1.0","91","-1023410177","42","1.0","72","1","3","","73","1","74","1","75","1","44","0.5","73","0","45","1.0","46","1.0","77","1","4","","78","1","79","1","170","1","48","1.0","171","1","6","","172","1","173","1","174","1","140","1.0","141","1.0","175","1","7","","176","1","177","1","178","1","143","1.0","179","1","8","","270","1","271","1","272","1","145","1.0","146","1.0","273","1","9","","274","1","275","1","276","1","42","1.0","72","1","3","","73","1","74","1","75","1","94","63"],["0","MATERIAL","5","20","102","{ACAD_REACTORS","330","E","102","}","330","E","100","AcDbMaterial","1","ByLayer","2","","70","0","40","1.0","71","1","41","1.0","91","-1023410177","42","1.0","72","1","3","","73","1","74","1","75","1","44","0.5","73","0","45","1.0","46","1.0","77","1","4","","78","1","79","1","170","1","48","1.0","171","1","6","","172","1","173","1","174","1","140","1.0","141","1.0","175","1","7","","176","1","177","1","178","1","143","1.0","179","1","8","","270","1","271","1","272","1","145","1.0","146","1.0","273","1","9","","274","1","275","1","276","1","42","1.0","72","1","3","","73","1","74","1","75","1","94","63"],["0","MATERIAL","5","21","102","{ACAD_REACTORS","330","E","102","}","330","E","100","AcDbMaterial","1","Global","2","","70","0","40","1.0","71","1","41","1.0","91","-1023410177","42","1.0","72","1","3","","73","1","74","1","75","1","44","0.5","73","0","45","1.0","46","1.0","77","1","4","","78","1","79","1","170","1","48","1.0","171","1","6","","172","1","173","1","174","1","140","1.0","141","1.0","175","1","7","","176","1","177","1","178","1","143","1.0","179","1","8","","270","1","271","1","272","1","145","1.0","146","1.0","273","1","9","","274","1","275","1","276","1","42","1.0","72","1","3","","73","1","74","1","75","1","94","63"],["0","MLINESTYLE","5","22","102","{ACAD_REACTORS","330","10","102","}","330","10","100","AcDbMlineStyle","2","Standard","70","0","3","","62","256","51","90.0","52","90.0","71","2","49","0.5","62","256","6","BYLAYER","49","-0.5","62","256","6","BYLAYER"],["0","MLEADERSTYLE","5","2C","102","{ACAD_REACTORS","330","F","102","}","330","F","100","AcDbMLeaderStyle","179","2","170","2","171","1","172","0","90","2","40","0.0","41","0.0","173","1","91","-1056964608","92","-2","290","1","42","2.0","291","1","43","8.0","3","Standard","44","4.0","300","","342","29","174","1","175","1","176","0","178","1","93","-1056964608","45","4.0","292","0","297","0","46","4.0","94","-1056964608","47","1.0","49","1.0","140","1.0","294","1","141","0.0","177","0","142","1.0","295","0","296","0","143","3.75","271","0","272","9","273","9"]]};
  /** DXF R2000 (AC1015, AutoCAD 2000 or newer): adds an IMAGE beside each point, linked to the JPEG next to the DXF. */
  function dxfR2000(G) {
    const L = [], g = (c, v) => { L.push(String(c), String(v)); }, put = (arr) => { for (let i = 0; i < arr.length; i += 2) g(arr[i], arr[i + 1]); };
    let next = 0x100; const H = () => (next++).toString(16).toUpperCase();
    const { minX, minY, maxX, maxY } = G.ext, imgs = G.ents.filter((e) => e.t === 'image');
    // handles: layers, entities, then one IMAGEDEF and one IMAGEDEF_REACTOR per photo
    const layerH = G.layers.filter(([n]) => n !== '0').map(([n, c]) => [n, c, H()]);
    G.ents.forEach((e) => { e.hd = H(); }); // handle (e.h is a height)
    const defs = new Map(); // one IMAGEDEF per file
    imgs.forEach((e) => { if (!defs.has(e.file)) defs.set(e.file, { h: H(), px: e.px, py: e.py, users: [] }); e.def = defs.get(e.file); e.reactor = H(); e.def.users.push(e); });
    const seed = H();
    // HEADER: the few variables AutoCAD needs; the drawing is in metres
    g(999, 'G-eSAA DXF R2000');
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1015'); g(9, '$ACADMAINTVER'); g(70, 6); g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252');
    g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
    g(9, '$EXTMIN'); g(10, f3(minX)); g(20, f3(minY)); g(30, 0);
    g(9, '$EXTMAX'); g(10, f3(maxX)); g(20, f3(maxY)); g(30, 0);
    g(9, '$LUNITS'); g(70, 2); g(9, '$LUPREC'); g(70, 3); g(9, '$INSUNITS'); g(70, 6); g(9, '$MEASUREMENT'); g(70, 1);
    g(9, '$HANDSEED'); g(5, seed);
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'CLASSES'); R2K.classes.forEach(put); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    // VPORT: open zoomed to the drawing
    const vp = R2K.vport.slice(), setv = (code, val) => { const i = vp.findIndex((x, k) => k % 2 === 0 && x === String(code)); if (i >= 0) vp[i + 1] = String(val); };
    setv(12, f3((minX + maxX) / 2)); setv(22, f3((minY + maxY) / 2)); setv(40, f3(Math.max(10, (maxY - minY) * 1.15))); setv(41, '1.5');
    g(0, 'TABLE'); g(2, 'VPORT'); g(5, '8'); g(330, '0'); g(100, 'AcDbSymbolTable'); g(70, 1); put(vp); g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(5, '2'); g(330, '0'); g(100, 'AcDbSymbolTable'); g(70, 3); R2K.ltypes.forEach(put); g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(5, '1'); g(330, '0'); g(100, 'AcDbSymbolTable'); g(70, layerH.length + 2); put(R2K.layer0); put(R2K.layerDef);
    for (const [name, color, h] of layerH) { g(0, 'LAYER'); g(5, h); g(330, '1'); g(100, 'AcDbSymbolTableRecord'); g(100, 'AcDbLayerTableRecord'); g(2, name); g(70, 0); g(62, color); g(6, 'Continuous'); g(370, -3); g(390, '13'); }
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(5, '5'); g(330, '0'); g(100, 'AcDbSymbolTable'); g(70, 1); put(R2K.style); g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'VIEW'); g(5, '7'); g(330, '0'); g(100, 'AcDbSymbolTable'); g(70, 0); g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'UCS'); g(5, '6'); g(330, '0'); g(100, 'AcDbSymbolTable'); g(70, 0); g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'APPID'); g(5, '3'); g(330, '0'); g(100, 'AcDbSymbolTable'); g(70, 1); put(R2K.appid); g(0, 'ENDTAB');
    put(R2K.dimstyleTable); put(R2K.dimstyle); g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'BLOCK_RECORD'); g(5, '9'); g(330, '0'); g(100, 'AcDbSymbolTable'); g(70, 2);
    g(0, 'BLOCK_RECORD'); g(5, '17'); g(330, '9'); g(100, 'AcDbSymbolTableRecord'); g(100, 'AcDbBlockTableRecord'); g(2, '*Model_Space'); g(340, '1A');
    g(0, 'BLOCK_RECORD'); g(5, '1B'); g(330, '9'); g(100, 'AcDbSymbolTableRecord'); g(100, 'AcDbBlockTableRecord'); g(2, '*Paper_Space'); g(340, '1E');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'BLOCKS'); R2K.blocks.forEach(put); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    const head = (type, e) => { g(0, type); g(5, e.hd); g(330, '17'); g(100, 'AcDbEntity'); g(8, e.l); };
    for (const e of G.ents) {
      if (e.t === 'circle') { head('CIRCLE', e); g(100, 'AcDbCircle'); g(10, f3(e.x)); g(20, f3(e.y)); g(30, 0); g(40, f3(e.r)); }
      else if (e.t === 'line') { head('LINE', e); g(100, 'AcDbLine'); g(10, f3(e.x1)); g(20, f3(e.y1)); g(30, 0); g(11, f3(e.x2)); g(21, f3(e.y2)); g(31, 0); }
      else if (e.t === 'text') { head('TEXT', e); g(100, 'AcDbText'); g(10, f3(e.x)); g(20, f3(e.y)); g(30, 0); g(40, f3(e.h)); g(1, dxfText(e.s)); if (e.a) g(50, e.a.toFixed(2)); g(100, 'AcDbText'); }
      else if (e.t === 'pline') { head('LWPOLYLINE', e); g(100, 'AcDbPolyline'); g(90, e.pts.length); g(70, 0); for (const [x, y] of e.pts) { g(10, f3(x)); g(20, f3(y)); } }
      else if (e.t === 'image') {
        head('IMAGE', e); g(100, 'AcDbRasterImage'); g(90, 0);
        g(10, f3(e.x)); g(20, f3(e.y)); g(30, 0);
        g(11, (e.w / e.px).toPrecision(10)); g(21, 0); g(31, 0); // one pixel along the width, in metres
        g(12, 0); g(22, (e.h / e.py).toPrecision(10)); g(32, 0); // one pixel along the height
        g(13, e.px); g(23, e.py); g(340, e.def.h); g(70, 3); g(280, 0); g(281, 50); g(282, 50); g(283, 0); g(360, e.reactor);
        g(71, 1); g(91, 2); g(14, -0.5); g(24, -0.5); g(14, e.px - 0.5); g(24, e.py - 0.5);
      }
    }
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'OBJECTS');
    g(0, 'DICTIONARY'); g(5, 'A'); g(330, '0'); g(100, 'AcDbDictionary'); g(281, 1);
    [['ACAD_COLOR', 'B'], ['ACAD_GROUP', 'C'], ['ACAD_LAYOUT', 'D'], ['ACAD_MATERIAL', 'E'], ['ACAD_MLEADERSTYLE', 'F'], ['ACAD_MLINESTYLE', '10'], ['ACAD_PLOTSETTINGS', '11'],
      ['ACAD_PLOTSTYLENAME', '12'], ['ACAD_SCALELIST', '14'], ['ACAD_TABLESTYLE', '15'], ['ACAD_VISUALSTYLE', '16'], ...(defs.size ? [['ACAD_IMAGE_VARS', '32'], ['ACAD_IMAGE_DICT', '33']] : [])]
      .forEach(([k, h]) => { g(3, k); g(350, h); });
    R2K.static.forEach(put);
    if (defs.size) {
      g(0, 'RASTERVARIABLES'); g(5, '32'); g(102, '{ACAD_REACTORS'); g(330, 'A'); g(102, '}'); g(330, 'A'); g(100, 'AcDbRasterVariables'); g(90, 0); g(70, 0); g(71, 1); g(72, 3);
      g(0, 'DICTIONARY'); g(5, '33'); g(330, 'A'); g(100, 'AcDbDictionary'); g(281, 1);
      for (const [file, d] of defs) { g(3, file.replace(/\.[^.]+$/, '')); g(350, d.h); }
      for (const [file, d] of defs) {
        g(0, 'IMAGEDEF'); g(5, d.h); g(102, '{ACAD_REACTORS'); g(330, '33'); d.users.forEach((u) => g(330, u.reactor)); g(102, '}'); g(330, '33');
        g(100, 'AcDbRasterImageDef'); g(90, 0); g(1, file); g(10, d.px); g(20, d.py); g(11, 0.01); g(21, 0.01); g(280, 1); g(281, 0);
      }
      for (const e of imgs) { g(0, 'IMAGEDEF_REACTOR'); g(5, e.reactor); g(330, e.hd); g(100, 'AcDbRasterImageDefReactor'); g(90, 2); g(330, e.hd); }
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }

  /** opts.version 'R2000' (default when photos are given) or 'R12'. See dxfGeom for the other options. */
  function buildDxf(points, opts, roads) {
    const o = Object.assign({ zone: 51, symbolSize: 1, textHeight: 1.5, focPct: 10 }, opts || {});
    const G = dxfGeom(points, o, roads);
    return (o.version || (o.photos ? 'R2000' : 'R12')) === 'R2000' ? dxfR2000(G) : dxfR12(G);
  }

  /* v2.26: the BOQ / BOM sizes of a point (p.boq) in the CSV and the KMZ data */
  const BOQ_COLS = [['owner', 'pole_owner'], ['clamp', 'clamp_size'], ['height', 'new_pole_size'], ['cls', 'pole_class'], ['odf', 'odf_size'], ['conn', 'odf_connector'], ['clo', 'closure_size'], ['cloSt', 'closure_status'], ['arm', 'new_arm'], ['guy', 'guying'], ['mloop', 'mloop']]; // v2.29: arm, guying, maintenance loop
  /* ---------------- CSV ---------------- */
  function buildCsv(points, zone, exportedBy) {
    const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['pole_id', 'pole_type', 'latitude', 'longitude', `utm${zone}n_easting`, `utm${zone}n_northing`, 'gps_accuracy_m', 'pin_adjusted', 'captured', 'photo', 'surveyed_by',
      'element', 'status', 'closure_id', 'remarks', 'red_box', 'pole_details', ...BOQ_COLS.map((c) => c[1]), ...(exportedBy ? ['exported_by'] : [])]];
    for (const p of points) {
      const u = utmForward(p.lat, p.lon, zone, p.lat < 0);
      rows.push([p.poleId, p.poleType, p.lat.toFixed(8), p.lon.toFixed(8), u.E.toFixed(3), u.N.toFixed(3),
        Number.isFinite(p.accuracy) ? p.accuracy.toFixed(1) : '', p.adjusted ? 'yes' : 'no', p.takenAt, p.photoName || '', p.by || '',
        p.element || 'Pole', p.status || '', p.closureId || '', p.remarks || '', p.boxes ? 'yes' : 'no', p.detailsText || '', ...BOQ_COLS.map((c) => (p.boq && p.boq[c[0]]) || ''), ...(exportedBy ? [exportedBy] : [])]);
    }
    return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
  }

  /* ---------------- OSM roads (Overpass JSON -> road list) ---------------- */
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
  const MINOR = new Set(['residential', 'unclassified', 'service', 'living_street', 'road']);
  function roadsFromOverpass(json) {
    const out = [];
    for (const el of (json.elements || [])) {
      if (el.type !== 'way' || !el.geometry || !el.tags || !el.tags.highway) continue;
      const h = el.tags.highway;
      const cls = MAJOR.has(h) ? 'OSM_ROAD_MAJOR' : MINOR.has(h) ? 'OSM_ROAD_MINOR' : 'OSM_ROAD_PATH';
      out.push({ cls, name: el.tags.name || el.tags.ref || '', coords: el.geometry.map((g) => [g.lat, g.lon]) });
    }
    return out;
  }
  function overpassQuery(points, bufferM) {
    let s = 90, w = 180, n = -90, e = -180;
    for (const p of points) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); }
    const dLat = bufferM / 111320, dLon = bufferM / (111320 * Math.cos(((s + n) / 2) * Math.PI / 180));
    return `[out:json][timeout:60];way["highway"](${(s - dLat).toFixed(6)},${(w - dLon).toFixed(6)},${(n + dLat).toFixed(6)},${(e + dLon).toFixed(6)});out geom;`;
  }

  /* ---------------- Pole ID helper ---------------- */
  function nextPoleId(prev) {
    const m = /^(.*?)(\d+)(\D*)$/.exec(prev || '');
    if (!m) return '';
    const num = String(parseInt(m[2], 10) + 1).padStart(m[2].length, '0');
    return m[1] + num + m[3];
  }

  /* ---------------- route analysis ---------------- */
  function distM(a, b) {
    const R = 6371008.8, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  /** Deflection (degrees) of the route at P between neighbours A and B: 0 = straight through, 90 = right angle. */
  function deflection(P, A, B) {
    const k = Math.cos(P.lat * Math.PI / 180);
    const v1 = [(A.lon - P.lon) * k, A.lat - P.lat], v2 = [(B.lon - P.lon) * k, B.lat - P.lat];
    const n = Math.hypot(...v1) * Math.hypot(...v2);
    if (!n) return 0;
    const cos = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / n));
    return 180 - Math.acos(cos) * 180 / Math.PI;
  }
  /**
   * points: [{id, poleId, lat, lon}], links: [[idA, idB]], o: {maxSpan, angleDeg}
   * -> {spans:[{a,b,from,to,len,long}], poles:{id:{degree, deflection, role}}, total, long, angle, terminal, junction, inline, off}
   */
  /** v2.29: the FOC cable types a span can carry: label, short label, method (AE aerial / UG underground), KML colour (aabbggrr),
      DXF layer and colour. A span without a type is "cable not set". */
  const CABLES = {
    F72: { label: 'AE Figure 8 72C FOC', short: 'Fig-8 72C', method: 'AE', kml: 'ffe8487f', css: '#7f48e8', layer: 'FOC_AE_FIG8_72C', aci: 6 },
    L12: { label: 'Light cable 12C', short: 'Light 12C', method: 'AE', kml: 'ffe6a01c', css: '#1c7ed6', layer: 'FOC_AE_LIGHT_12C', aci: 4 },
    U144: { label: 'UG 144C air-blown fiber', short: 'UG 144C', method: 'UG', kml: 'ff449e2f', css: '#2f9e44', layer: 'FOC_UG_144C', aci: 3 },
  };
  function analyzeRoute(points, links, o) {
    const by = {}; points.forEach((p) => { by[p.id] = p; });
    const nb = {}; points.forEach((p) => { nb[p.id] = []; });
    const spans = [];
    for (const [ia, ib, cab] of links || []) { // v2.29: a link may carry its cable type (CABLES key)
      const a = by[ia], b = by[ib];
      if (!a || !b || ia === ib) continue;
      const len = distM(a, b);
      spans.push({ ia, ib, a, b, from: a.poleId, to: b.poleId, len, long: len > o.maxSpan, cable: CABLES[cab] ? cab : '' });
      nb[ia].push(b); nb[ib].push(a);
    }
    const poles = {}; const cnt = { long: 0, angle: 0, terminal: 0, junction: 0, inline: 0, off: 0 };
    for (const p of points) {
      const n = nb[p.id], degree = n.length;
      let role = 'Not on route', defl = null;
      if (degree === 1) role = 'Terminal';
      else if (degree === 2) { defl = deflection(p, n[0], n[1]); role = defl >= o.angleDeg ? 'Angle' : 'Inline'; }
      else if (degree >= 3) role = 'Junction';
      poles[p.id] = { degree, deflection: defl, role };
      cnt[{ 'Not on route': 'off', Terminal: 'terminal', Inline: 'inline', Angle: 'angle', Junction: 'junction' }[role]]++;
    }
    cnt.long = spans.filter((s) => s.long).length;
    return { spans, poles, total: spans.reduce((t, s) => t + s.len, 0), ...cnt };
  }
  /** v2.28: the route's spans joined into continuous runs: from an end or a junction to the next end or junction (a loop as one
      run). Each run: its points in order, its spans and its length. */
  function routeChains(spans) {
    const adj = {}, used = new Array(spans.length).fill(false), node = {};
    spans.forEach((s, i) => { (adj[s.ia] = adj[s.ia] || []).push(i); (adj[s.ib] = adj[s.ib] || []).push(i); node[s.ia] = s.a; node[s.ib] = s.b; });
    const walk = (start, first) => {
      const pts = [node[start]], sp = []; let cur = start, e = first;
      for (;;) {
        used[e] = true; const s = spans[e], nx = String(s.ia) === String(cur) ? s.ib : s.ia; pts.push(node[nx]); sp.push(s); cur = nx; // ids as text (object keys)
        if (String(cur) === String(start) || adj[cur].length !== 2) break;
        const ne = adj[cur].find((k) => !used[k] && (spans[k].cable || '') === (s.cable || '')); if (ne == null) break; e = ne; // v2.29: one run per cable type
      }
      return { pts, spans: sp, len: sp.reduce((t, s) => t + s.len, 0), cable: sp[0].cable || '' };
    };
    const out = [], ends = (id) => adj[id].length !== 2 || (spans[adj[id][0]].cable || '') !== (spans[adj[id][1]].cable || ''); // a change of cable ends a run
    Object.keys(adj).filter(ends).forEach((id) => adj[id].forEach((e) => { if (!used[e]) out.push(walk(id, e)); }));
    spans.forEach((s, e) => { if (!used[e]) out.push(walk(s.ia, e)); }); // loops
    return out;
  }
  /** Link poles in capture order, skipping jumps longer than maxLink metres (a new street, a gap in the survey). */
  function autoLinks(points, maxLink) {
    const out = [];
    for (let i = 1; i < points.length; i++) if (distM(points[i - 1], points[i]) <= maxLink) out.push([points[i - 1].id, points[i].id]);
    return out;
  }

  /* ---------------- Pole ID candidates from OCR ---------------- */
  const shapeOf = (s) => s.replace(/[A-Z]/g, 'A').replace(/[0-9]/g, '9');
  const TO_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', T: '1', Z: '2', S: '5', G: '6', B: '8' };
  const TO_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' };
  /** Bend a reading towards the shape of the project's last ID (e.g. AAA-9999), fixing O/0, I/1, S/5 mix-ups. */
  function fitShape(s, target) {
    if (!target || s.length !== target.length) return null;
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], t = target[i];
      if (t === '9') out += /[0-9]/.test(ch) ? ch : (TO_DIGIT[ch] || ch);
      else if (t === 'A') out += /[A-Z]/.test(ch) ? ch : (TO_LETTER[ch] || ch);
      else out += /[-/]/.test(ch) ? t : ch;
    }
    return shapeOf(out) === target ? out : null;
  }
  /* Known ID formats: poles PREFIX-number — CC-0001 / WP-0001 / SP-0001 (concrete, wood, steel, 4 digits), GT- (Globe),
     BT- (Bayantel) and any prefix added by the admin or the user (e.g. PLDT-), numbers as painted — and ODFs FDU_100. */
  let POLE_PREFIX = ['CC', 'WP', 'SP', 'GT', 'BT'];
  const PAD4 = ['CC', 'WP', 'SP'];
  let KNOWN_PREFIX = POLE_PREFIX.concat('FDU');
  /** The app tells the reader which pole prefixes exist (built-in + admin + user). */
  function setPolePrefixes(list) {
    POLE_PREFIX = [...new Set((list || []).map((x) => String(x).toUpperCase()).filter((x) => /^[A-Z]{2,6}$/.test(x) && x !== 'FDU'))];
    KNOWN_PREFIX = POLE_PREFIX.concat('FDU');
  }
  // letters OCR mixes up on stencils: a one-letter misread is only corrected along these pairs when several prefixes are near
  const LOOKALIKE = ['CG', 'GC', 'OD', 'DO', 'OQ', 'QO', 'IL', 'LI', 'IT', 'TI', 'UV', 'VU', 'PR', 'RP', 'BE', 'EB', 'BP', 'PB', 'WV', 'VW', 'SB', 'BS', 'MN', 'NM', 'TJ', 'JT'];
  function knownId(raw) {
    const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (/^[0-9]+$/.test(s)) return null; // a number alone is a number-only ID, not a prefix misread as digits (88123 is not BT-123)
    let best = null;
    for (const L of [...new Set(KNOWN_PREFIX.map((k) => k.length))].sort((a, b) => b - a)) {
      if (s.length <= L) continue;
      const rawNum = s.slice(L), misread = (rawNum.match(/[A-Z]/g) || []).length;
      if (!/[0-9]/.test(rawNum)) continue;
      const pre = s.slice(0, L).split('').map((c) => (/[0-9]/.test(c) ? (TO_LETTER[c] || c) : c)).join('');
      let p = KNOWN_PREFIX.includes(pre) ? pre : null, fuzzy = false;
      if (!p) { // one misread letter, e.g. GC -> CC, FOU -> FDU (only when it points to a single known prefix)
        let near = KNOWN_PREFIX.filter((k) => k.length === L && [...k].filter((ch, i) => ch !== pre[i]).length === 1);
        if (near.length > 1) near = near.filter((k) => [...k].every((ch, i) => ch === pre[i] || LOOKALIKE.includes(pre[i] + ch)));
        if (near.length === 1) { p = near[0]; fuzzy = true; }
      }
      if (!p) continue;
      // a letter in the number is a misread digit only between digits, or an O, Q or D before them (CCO457); v2.18: an ID
      // may end or begin with a real letter (GT-0123B), which then stays as it is
      let mapped = 0;
      const num = rawNum.split('').map((c, i, a) => { if (!/[A-WYZ]/.test(c) || !TO_DIGIT[c]) return c;
        if ((i > 0 && i < a.length - 1 && /[0-9]/.test(a[i - 1]) && /[0-9]/.test(a[i + 1])) || (i === 0 && 'OQD'.includes(c) && /[0-9]/.test(a[1] || ''))) { mapped++; return TO_DIGIT[c]; } return c; }).join('');
      // up to 8 digits: owner tags such as 0430621 (v2.16); X = a character that could not be read, at most 2 (v2.18)
      const hidden = (num.match(/X/g) || []).length;
      if (!/^[0-9X]{1,8}$/.test(num) || hidden > 2 || (num.length - hidden < 3 && hidden)) {
        // v2.18: a known prefix and an ID of letters and digits (GT-0123B), as written; never "exact"
        if (!fuzzy && p !== 'FDU' && /^[A-Z0-9]{2,10}$/.test(rawNum) && (rawNum.match(/[0-9]/g) || []).length >= 2 && misread * 2 <= rawNum.length && !best)
          best = { id: `${p}-${rawNum}`, prefix: p, fuzzy: false, padded: false, hidden: 0, alnum: true };
        continue;
      }
      if (misread - mapped > 0 && misread * 2 > rawNum.length) continue; // the number must be mostly real digits (SPOT is not SP-0001)
      const id = p === 'FDU' ? `FDU_${num}` : `${p}-${PAD4.includes(p) ? num.padStart(4, '0') : num}`;
      const padded = PAD4.includes(p) && num.length < 4; // zeros added: a digit may have been missed
      if (!best || best.alnum || (best.fuzzy && !fuzzy)) best = { id, prefix: p, fuzzy, padded, hidden, mapped };
    }
    return best;
  }
  /**
   * results: [{words:[{text, conf, line}], stacked?}] (one per OCR pass); lastId: previous ID in the project (may be '').
   * stacked = the ID is a column of upright characters, read top to bottom.
   * opts.numPrefix: poles painted with a number only (v2.15) are saved as that type prefix + the number (GT-123456).
   * -> [{id, conf, fits}] best first, at most 5.
   */
  function idCandidates(results, lastId, opts) {
    const numPrefix = opts && /^[A-Z]{2,6}$/.test(opts.numPrefix || '') ? opts.numPrefix : '';
    const target = lastId ? shapeOf(lastId.toUpperCase()) : '';
    const sep = (lastId || '').match(/[-/_ ]/);
    const joiner = sep ? sep[0].trim() || '-' : '-';
    const found = new Map();
    const put = (id, conf, fits, score, exact) => { const prev = found.get(id); if (!prev || prev.score < score) found.set(id, { id, conf: Math.round(conf), fits, score, exact: !!exact }); };
    const add = (raw, conf, bonus = 0) => {
      let s = raw.toUpperCase().replace(/[^A-Z0-9\-/_]/g, '').replace(/^[-/_]+|[-/_]+$/g, '');
      if (s.length < 2 || s.length > 20) return;
      const k = knownId(s);
      if (k) put(k.id, k.hidden || k.alnum ? conf * 0.9 : conf, true, conf + bonus + (k.fuzzy ? 8 : 18) - (k.hidden ? 6 : 0) - (k.alnum ? 6 : 0), !k.fuzzy && !k.padded && !k.hidden && !k.alnum && !k.mapped); // exact: a known prefix and every digit read as they are
      let digits = s.replace(/[-/_]/g, '');
      // v2.18: a number read with one or two look-alike letters (O for 0, S for 5, G for 6…) inside it: those become digits.
      // An ID may mix letters and digits (S0123B), so only a letter between digits (or an O, Q or D before them) is changed,
      // and the reading as written stays one of the choices
      if (numPrefix && /[A-Z]/.test(digits.replace(/X/g, '')) && !k) {
        const isD = (ch) => /[0-9X]/.test(ch || ''); let n = 0;
        const m = [...digits].map((c, i, a) => { if (!/[A-WYZ]/.test(c) || !TO_DIGIT[c]) return c;
          if ((i > 0 && i < a.length - 1 && isD(a[i - 1]) && isD(a[i + 1])) || (i === 0 && 'OQD'.includes(c) && isD(a[1]))) { n++; return TO_DIGIT[c]; } return c; }).join('');
        if (n && n <= 2 && /^[0-9X]+$/.test(m) && m.length - n >= 3) { put(s, conf * 0.85, false, conf * 0.85 + bonus); digits = m; conf *= 0.95; bonus -= 4; }
      }
      if (owned.has(digits)) return; // the owner's name was read with it: not the type prefix (v2.18)
      if (numPrefix && /^[0-9]{3,8}$/.test(digits)) { // a number-only pole ID: the type prefix + the number as painted
        const num = PAD4.includes(numPrefix) ? digits.padStart(4, '0') : digits;
        put(`${numPrefix}-${num}`, conf, true, conf + bonus + (digits.length >= 4 ? 20 : 6), digits.length >= 4 && digits === s.replace(/[-/_]/g, ''));
        return;
      }
      // v2.18: a number with one or two hidden characters (X: covered by a cable, faded): kept with the X, never "exact"
      const nx = (digits.match(/X/g) || []).length;
      if (numPrefix && nx && nx <= 2 && /^[0-9X]{4,8}$/.test(digits) && digits.length - nx >= 3) {
        put(`${numPrefix}-${digits}`, conf, true, conf + bonus + 12, false); // not "exact": two matching readings are needed
        return;
      }
      // a number with a stray mark after it (the star under a tag's number read as a letter): the number, scored lower (v2.16)
      const tail = numPrefix && !k ? /^([0-9]{4,8})[A-Z]{1,2}$/.exec(digits) : null;
      if (tail) { put(`${numPrefix}-${PAD4.includes(numPrefix) ? tail[1].padStart(4, '0') : tail[1]}`, conf * 0.9, true, conf * 0.9 + bonus + 8, false); return; }
      if (!/[0-9]/.test(s)) return;
      const fitted = fitShape(s, target), id = fitted || s, fits = !!fitted;
      put(id, conf, fits, conf + bonus + (fits ? 15 : 0) + (/[A-Z]/.test(id) ? 2 : 0));
    };
    // v2.18: an owner's name read with the number (an embossed GLOBE tag: "GLOBE" over "962574") gives that owner's prefix
    const names = opts && opts.names ? opts.names : null, owned = new Set(); // {GLOBE: 'GT', BAYANTEL: 'BT', …}; numbers given an owner's prefix
    const nameHit = (t) => {
      if (!names) return null; const u = t.replace(/0/g, 'O');
      if (names[u]) return { p: names[u], exact: true };
      for (const [n, p] of Object.entries(names)) if (n.length >= 5 && u.length === n.length && [...n].filter((c, i) => c !== u[i]).length === 1) return { p, exact: false };
      return null;
    };
    const ownerNumber = (good) => {
      const ws = good.map((w) => ({ t: String(w.text).toUpperCase().replace(/[^A-Z0-9]/g, ''), conf: w.conf, line: w.line })).filter((w) => w.t);
      for (const w of ws) {
        const h = nameHit(w.t); if (!h) continue;
        const byLine = {}; ws.filter((x) => x !== w).forEach((x) => { (byLine[x.line] = byLine[x.line] || []).push(x); });
        for (const xs of Object.values(byLine)) {
          const raw = xs.map((x) => x.t).join(''), cf0 = (w.conf + xs.reduce((t, x) => t + x.conf, 0) / xs.length) / 2;
          let n = 0; const num = raw.replace(/[A-Z]/g, (c) => { if (!TO_DIGIT[c]) return c; n++; return TO_DIGIT[c]; });
          if (/^[0-9]{3,8}$/.test(raw) || (/^[0-9]{3,8}$/.test(num) && n <= 2 && raw.length - n >= 3)) {
            const cf = cf0 * (n ? 0.9 : 1);
            put(`${h.p}-${PAD4.includes(h.p) ? num.padStart(4, '0') : num}`, cf, true, cf + 22, h.exact && !n && num.length >= 4); owned.add(num); owned.add(raw);
          }
          // an ID of letters and digits under the name (GLOBE / KV0123): kept as written, with the owner's prefix
          if (/^[A-Z0-9]{3,12}$/.test(raw) && /[A-Z]/.test(raw) && (raw.match(/[0-9]/g) || []).length >= 2) { put(`${h.p}-${raw}`, cf0 * 0.95, true, cf0 * 0.95 + 18, false); owned.add(raw); }
        }
      }
    };
    for (const r of results || []) {
      const good = (r.words || []).filter((w) => w.conf >= 20);
      ownerNumber(good);
      if (r.stacked) { // one character (or a few) per line: the ID is the lines joined top to bottom
        if (good.length) add(good.map((w) => w.text).join(''), good.reduce((t, w) => t + w.conf, 0) / good.length, 1);
        continue;
      }
      const lines = {};
      for (const w of good) (lines[w.line] = lines[w.line] || []).push(w);
      const lineList = Object.values(lines);
      for (const ws of lineList) {
        const mean = ws.reduce((t, w) => t + w.conf, 0) / ws.length;
        ws.forEach((w) => add(w.text, w.conf));
        if (ws.length > 1) { add(ws.map((w) => w.text).join(joiner), mean, 3); add(ws.map((w) => w.text).join(''), mean, 1); }
      }
      if (lineList.length === 2) { // two-line stencils, e.g. "CC" over "0123"
        const all = lineList.flat(), mean = all.reduce((t, w) => t + w.conf, 0) / all.length;
        add(lineList.map((ws) => ws.map((w) => w.text).join('')).join(joiner), mean, 2);
      }
    }
    return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  }

  /* ---------------- CSV (company list import) ---------------- */
  /** RFC-4180-style CSV parse; also accepts semicolon or tab separated files (detected from the first line). */
  function parseCsv(text) {
    const t = String(text || '').replace(/^﻿/, '');
    const first = t.split(/\r?\n/, 1)[0] || '';
    const counts = { ',': (first.match(/,/g) || []).length, ';': (first.match(/;/g) || []).length, '\t': (first.match(/\t/g) || []).length };
    const sep = Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }
  /** Company names from a CSV: the column headed Company / Vendor / Contractor / Name, else the first column. */
  function companiesFromCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim().toLowerCase());
    let col = head.findIndex((h) => /^(company|company name|vendor|vendor name|contractor|name)$/.test(h)), start = 1;
    if (col < 0) { col = 0; start = /^(company|vendor|contractor|name)/.test(head[0] || '') ? 1 : 0; }
    const seen = new Set(), out = [];
    for (const r of rows.slice(start)) {
      const v = String(r[col] || '').trim().replace(/\s+/g, ' ').slice(0, 100);
      if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
    }
    return out;
  }


  /* ---------------- live ID finder (camera) ---------------- */
  /** Closing along one direction (dilate, then erode) with running sums: strokes of one painted ID merge into one blob. */
  function closeLine(src, W, H, r, vertical) {
    const n = vertical ? H : W, lines = vertical ? W : H, at = vertical ? (l, k) => k * W + l : (l, k) => l * W + k;
    const d = new Uint8Array(src.length), out = new Uint8Array(src.length), ps = new Int32Array(n + 1);
    for (let l = 0; l < lines; l++) {
      for (let k = 0; k < n; k++) ps[k + 1] = ps[k] + src[at(l, k)];
      for (let k = 0; k < n; k++) d[at(l, k)] = ps[Math.min(n, k + r + 1)] - ps[Math.max(0, k - r)] > 0 ? 1 : 0;
      for (let k = 0; k < n; k++) ps[k + 1] = ps[k] + d[at(l, k)];
      for (let k = 0; k < n; k++) { const a = Math.max(0, k - r), b = Math.min(n, k + r + 1); out[at(l, k)] = ps[b] - ps[a] === b - a ? 1 : 0; }
    }
    return out;
  }
  /**
   * The most ID-like region of a small camera frame: a row (orient 'h') or column ('v') of short high-contrast strokes.
   * rgba: RGBA bytes W×H. focus: {x, y} 0..1 (a tap) or null (the centre). Returns {x, y, w, h, score} in frame pixels, or null.
   */
  function findIdBox(rgba, W, H, orient, focus) {
    const N = W * H, g = new Uint8Array(N), m = new Uint8Array(N), hist = new Uint32Array(256), vert = orient === 'v';
    for (let i = 0, j = 0; i < N; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    for (let y = 1; y < H - 1; y++) for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
      const gx = Math.abs(g[i + 1] - g[i - 1]), gy = Math.abs(g[i + W] - g[i - W]), v = gx > gy ? gx : gy;
      m[i] = v; hist[v]++;
    }
    let acc = 0, t = 255; const lim = N * 0.1; // the strongest 10 % of edges, but never faint texture
    for (let v = 255; v > 0; v--) { acc += hist[v]; if (acc >= lim) { t = v; break; } }
    t = Math.max(30, t);
    const e = new Uint8Array(N); for (let i = 0; i < N; i++) e[i] = m[i] >= t ? 1 : 0;
    // long straight edges are not text: pole sides, cables, the horizon, a sign's border
    const dropRuns = (vertical, max) => {
      const n = vertical ? H : W, lines = vertical ? W : H;
      for (let l = 0; l < lines; l++) {
        let k = 0;
        while (k < n) {
          const i0 = vertical ? k * W + l : l * W + k; if (!e[i0]) { k++; continue; }
          let k1 = k; while (k1 < n && e[vertical ? k1 * W + l : l * W + k1]) k1++;
          if (k1 - k > max) for (let q = k; q < k1; q++) e[vertical ? q * W + l : l * W + q] = 0;
          k = k1;
        }
      }
    };
    dropRuns(true, Math.max(12, H * 0.25)); dropRuns(false, Math.max(12, W * 0.6));
    { // thin lines at any angle (cables crossing the pole): long, sparse chains of edges
      const seen = new Uint8Array(N), st = new Int32Array(N), members = new Int32Array(N);
      for (let s0 = 0; s0 < N; s0++) {
        if (!e[s0] || seen[s0]) continue;
        let sp = 0, cnt = 0, x0 = W, y0 = H, x1 = 0, y1 = 0; st[sp++] = s0; seen[s0] = 1;
        while (sp) {
          const i = st[--sp], x = i % W, y = (i - x) / W; members[cnt++] = i;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx; if (e[j] && !seen[j]) { seen[j] = 1; st[sp++] = j; }
          }
        }
        const ext = Math.max(x1 - x0 + 1, y1 - y0 + 1);
        if (ext > Math.max(W, H) * 0.15 && (cnt / ext < 2.6 || cnt / ((x1 - x0 + 1) * (y1 - y0 + 1)) < 0.08)) for (let q = 0; q < cnt; q++) e[members[q]] = 0;
      }
    }
    const along = Math.max(2, Math.round((vert ? H : W) / 60));
    const c = closeLine(closeLine(e, W, H, along, vert), W, H, 1, !vert);
    const across = (p) => p.c1 - p.c0 + 1;
    const at = (a, c) => (vert ? a * W + c : c * W + a);
    /** A piece joined to a cable or a border is cut back to its densest band of edges (the text). */
    const trim = (p) => {
      const prof = (from, to, o0, o1, alongAxis) => {
        const out = new Float32Array(to - from + 1);
        for (let k = from; k <= to; k++) { let n = 0; for (let o = o0; o <= o1; o++) n += alongAxis ? e[at(k, o)] : e[at(o, k)]; out[k - from] = n; }
        return out;
      };
      const band = (pr, frac, gap) => { // the run around the peak, bridging gaps (between characters) up to `gap`
        let mi = 0; for (let k = 1; k < pr.length; k++) if (pr[k] > pr[mi]) mi = k;
        const lim = pr[mi] * frac; let lo = mi, hi = mi;
        for (let k = mi - 1, miss = 0; k >= 0 && miss <= gap; k--) { if (pr[k] >= lim) { lo = k; miss = 0; } else miss++; }
        for (let k = mi + 1, miss = 0; k < pr.length && miss <= gap; k++) { if (pr[k] >= lim) { hi = k; miss = 0; } else miss++; }
        return [lo, hi];
      };
      const [c0, c1] = band(prof(p.c0, p.c1, p.a0, p.a1, false), 0.3, 1).map((k) => k + p.c0);
      const [a0, a1] = band(prof(p.a0, p.a1, c0, c1, true), 0.12, Math.max(3, Math.round((c1 - c0 + 1) * 0.8))).map((k) => k + p.a0);
      let edges = 0; for (let a2 = a0; a2 <= a1; a2++) for (let c2 = c0; c2 <= c1; c2++) edges += e[at(a2, c2)];
      return { a0, a1, c0, c1, area: p.area, edges };
    };
    // pieces: characters or groups of characters
    const lab = new Int32Array(N), stack = new Int32Array(N), pieces = []; let nl = 0;
    for (let s0 = 0; s0 < N; s0++) {
      if (!c[s0] || lab[s0]) continue;
      nl++; let sp = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0, edges = 0;
      stack[sp++] = s0; lab[s0] = nl;
      while (sp) {
        const i = stack[--sp], x = i % W, y = (i - x) / W;
        area++; edges += e[i];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && c[i - 1] && !lab[i - 1]) { lab[i - 1] = nl; stack[sp++] = i - 1; }
        if (x < W - 1 && c[i + 1] && !lab[i + 1]) { lab[i + 1] = nl; stack[sp++] = i + 1; }
        if (y > 0 && c[i - W] && !lab[i - W]) { lab[i - W] = nl; stack[sp++] = i - W; }
        if (y < H - 1 && c[i + W] && !lab[i + W]) { lab[i + W] = nl; stack[sp++] = i + W; }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, box = bw * bh;
      if (bw < 3 || bh < 3) continue;
      let p = { a0: vert ? y0 : x0, a1: vert ? y1 : x1, c0: vert ? x0 : y0, c1: vert ? x1 : y1, area, edges };
      if (box > N * 0.25 || area / box < 0.3 || edges / box < 0.08) { // joined to a cable or a border: keep its densest band
        if (box > N * 0.7) continue;
        p = trim(p); const tb = (p.a1 - p.a0 + 1) * across(p); p.area = tb;
        if (tb > N * 0.25 || p.edges / tb < 0.08) continue;
      }
      if (p.edges / ((p.a1 - p.a0 + 1) * across(p)) > 0.75) continue;
      pieces.push(p);
    }
    pieces.sort((p, q) => q.area - p.area); pieces.length = Math.min(pieces.length, 300);
    // join pieces lying on one line, close together and of similar height: one ID
    for (let merged = true; merged;) {
      merged = false;
      for (let a = 0; a < pieces.length && !merged; a++) for (let b = a + 1; b < pieces.length; b++) {
        const p = pieces[a], q = pieces[b], hp = across(p), hq = across(q), hmax = Math.max(hp, hq), hmin = Math.min(hp, hq);
        const ov = Math.min(p.c1, q.c1) - Math.max(p.c0, q.c0) + 1, gap = Math.max(p.a0, q.a0) - Math.min(p.a1, q.a1);
        if (ov < hmin * 0.5 || hmax > hmin * 2.2 || gap > hmax * 1.2) continue;
        pieces[a] = { a0: Math.min(p.a0, q.a0), a1: Math.max(p.a1, q.a1), c0: Math.min(p.c0, q.c0), c1: Math.max(p.c1, q.c1), area: p.area + q.area, edges: p.edges + q.edges };
        pieces.splice(b, 1); merged = true; break;
      }
    }
    let best = null; const fx = focus ? focus.x : 0.5, fy = focus ? focus.y : 0.45, A = vert ? H : W, Cn = vert ? W : H;
    for (let p of pieces) {
      if (across(p) > Cn * 0.35 || (p.a1 - p.a0 + 1) / across(p) < 1.5) p = trim(p);
      const long = p.a1 - p.a0 + 1, short = across(p), box = long * short, aspect = long / short, dens = p.edges / box;
      if (short < 4 || long < A * 0.07 || short > Cn * 0.35 || long > A * 0.95 || aspect < 1.5 || aspect > 16 || dens < 0.06) continue;
      const bx = vert ? p.c0 : p.a0, by = vert ? p.a0 : p.c0, bw = vert ? short : long, bh = vert ? long : short;
      const d = Math.hypot((bx + bw / 2) / W - fx, (by + bh / 2) / H - fy);
      // an ID being aimed at is wholly in view: a region running off the picture (leaves, the pole, cables) counts less (v2.16)
      const cut = (p.a0 <= 1 ? 1 : 0) + (p.a1 >= A - 2 ? 1 : 0);
      const score = Math.min(dens, 0.4) * Math.sqrt(box) * Math.min(1, aspect / 2.5) / (1 + (focus ? 6 : 3) * d) * (cut ? 0.55 : 1);
      if (!best || score > best.score) best = { x: bx, y: by, w: bw, h: bh, score: Math.round(score * 100) / 100 };
    }
    return best;
  }
  /**
   * An ID painted as a column of upright characters, one per line (a pole tag reading 0-4-3-0-6-2-1 downwards):
   * the characters' boxes, top to bottom (v2.16). Ink is what is darker than its surroundings (light = true: lighter);
   * the pieces of a stencil character are joined; cables, the pole's edges and the tag's border are left out.
   * rgba: RGBA W×H (the guide-box crop). -> {rows: [{x0, y0, x1, y1}], ink: Uint8Array W×H (1 = a character's ink), medH} or null.
   */
  function stackRows(rgba, W, H, light) {
    const N = W * H, g = new Uint8Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) { const v = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8; g[i] = light ? 255 - v : v; }
    // dark against the local mean of a window about a character wide (shadows on a round pole stay out)
    const r = Math.max(4, Math.round(Math.min(W, H / 3) * 0.35)), W1 = W + 1, ii = new Float64Array(W1 * (H + 1));
    for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) { s += g[y * W + x]; ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + s; } }
    const ink = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      const ya = Math.max(0, y - r), yb = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const xa = Math.max(0, x - r), xb = Math.min(W, x + r + 1);
        const mean = (ii[yb * W1 + xb] - ii[ya * W1 + xb] - ii[yb * W1 + xa] + ii[ya * W1 + xa]) / ((xb - xa) * (yb - ya));
        ink[y * W + x] = g[y * W + x] < mean - Math.max(14, mean * 0.15) ? 1 : 0;
      }
    }
    const lab = new Int32Array(N), st = new Int32Array(N), comps = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (!ink[s0] || lab[s0]) continue;
      const id = comps.length + 1; let sp = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0;
      st[sp++] = s0; lab[s0] = id;
      while (sp) {
        const i = st[--sp], x = i % W, y = (i - x) / W; area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx; if (ink[j] && !lab[j]) { lab[j] = id; st[sp++] = j; }
        }
      }
      comps.push({ id, x0, y0, x1, y1, area });
    }
    // character-sized pieces: not specks, cables, the pole's edges or the tag's border
    const pc = comps.filter((c) => {
      const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
      return c.area >= Math.max(8, N * 0.0001) && h <= H * 0.4 && w <= W * 0.8 && !(h > w * 7 && h > H * 0.12) && w <= h * 4 && c.area / (w * h) > 0.1;
    });
    if (pc.length < 3) return null;
    // the column where the pieces line up (each piece adds its height across its width); cables beside a tag can add up to
    // more, so the strongest few columns are tried and the one holding the most characters of one size is kept
    const prof = new Float32Array(W);
    for (const c of pc) for (let x = c.x0; x <= c.x1; x++) prof[x] += c.y1 - c.y0 + 1;
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
    const chainIn = (b0, b1) => {
      let sel = pc.filter((c) => { const cx = (c.x0 + c.x1) / 2; return cx >= b0 && cx <= b1; }).sort((a, b) => a.y0 - b.y0);
      // a piece far bigger than the column's characters (a cable or the tag's edge crossing it) is left out, so the characters
      // beside it stay apart; the character it covers is counted as hidden below (v2.17). Sizes from the larger pieces (not dirt).
      const big = sel.slice().sort((a, b) => b.area - a.area).slice(0, Math.max(3, Math.ceil(sel.length / 2)));
      const ph = med(big.map((c) => c.y1 - c.y0 + 1)), pw = med(big.map((c) => c.x1 - c.x0 + 1));
      if (big.length >= 4) sel = sel.filter((c) => c.y1 - c.y0 + 1 <= ph * 1.9 && c.x1 - c.x0 + 1 <= Math.max(pw * 2.6, ph * 1.6));
      // pieces off the column's line (the tag's edge, a cable beside it) are left out too; the line may slant with the pole
      if (big.length >= 4) {
        // a robust line (median of the slopes between pieces, median offset): the star or dirt below the tag does not pull it
        const P = big.map((c) => [(c.y0 + c.y1) / 2, (c.x0 + c.x1) / 2]), my = med(P.map((q) => q[0])), sls = [];
        for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const dy = P[j][0] - P[i][0]; if (Math.abs(dy) >= ph * 0.5) sls.push((P[j][1] - P[i][1]) / dy); }
        const sl = sls.length ? Math.max(-0.35, Math.min(0.35, med(sls))) : 0, mx = med(P.map((q) => q[1] - sl * (q[0] - my)));
        // only thin upright slivers beside it (the tag's edge) and pieces well away from it go; a stencil's fragments stay
        sel = sel.filter((c) => { const d = Math.abs((c.x0 + c.x1) / 2 - (mx + sl * ((c.y0 + c.y1) / 2 - my))), w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
          return d <= Math.max(4, pw * 0.75, ph * 0.5) || (d <= Math.max(6, pw * 1.3, ph * 0.9) && !(h >= ph * 0.6 && w <= pw * 0.35)); });
      }
      // pieces overlapping top to bottom are one character; then fragments (a stencil's cut) join their neighbour
      let rows = [];
      for (const c of sel) {
        const q = rows[rows.length - 1];
        if (q && c.y0 <= q.y1) { q.x0 = Math.min(q.x0, c.x0); q.x1 = Math.max(q.x1, c.x1); q.y1 = Math.max(q.y1, c.y1); q.ids.push(c.id); }
        else rows.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, ids: [c.id] });
      }
      let medH = med(rows.map((q) => q.y1 - q.y0 + 1));
      const charH = big.length >= 4 ? Math.max(medH, ph) : medH; // a stencil cut into halves: its pieces are not the character's height
      for (let i = 1; i < rows.length; i++) {
        const p = rows[i - 1], q = rows[i];
        if (q.y0 - p.y1 <= Math.max(2, charH * 0.2) && q.y1 - p.y0 + 1 <= charH * 1.3) {
          p.x0 = Math.min(p.x0, q.x0); p.x1 = Math.max(p.x1, q.x1); p.y1 = Math.max(p.y1, q.y1); p.ids.push(...q.ids); rows.splice(i, 1); i--;
        }
      }
      medH = med(rows.map((q) => q.y1 - q.y0 + 1));
      const medW = med(rows.filter((q) => q.y1 - q.y0 + 1 >= medH * 0.55).map((q) => q.x1 - q.x0 + 1));
      rows = rows.filter((q) => { // specks and dirt between the characters go; a dash (CC-0457 painted downwards) stays
        const w = q.x1 - q.x0 + 1, h = q.y1 - q.y0 + 1;
        return h >= medH * 0.55 || (h >= 2 && h <= medH * 0.5 && w >= medW * 0.35 && w <= medW * 1.6 && w >= h * 1.5);
      });
      // the longest run of characters without a big gap or a mark of another size (the star under a tag, a crack, a sticker).
      // v2.17: a character hidden by a cable or dirt leaves a gap of one or two characters in the column's rhythm; when the
      // column goes on after it, the gap is kept as hidden characters (q.hidden = how many before q, read as X)
      const cy = (q) => (q.y0 + q.y1) / 2, odd = (q) => q.y1 - q.y0 + 1 > medH * 1.5 || q.x1 - q.x0 + 1 > Math.max(medW * 2.2, medH * 1.6);
      const steps = []; { const ok = rows.filter((q) => !odd(q)); for (let i = 1; i < ok.length; i++) if (ok[i].y0 - ok[i - 1].y1 <= medH * 0.6) steps.push(cy(ok[i]) - cy(ok[i - 1])); }
      const pitch = steps.length >= 2 ? med(steps) : 0;
      // after a hidden character the column goes on with characters of its size, in line with the one before the gap (a
      // leaning pole slants the line a little); not the star or the tag's end
      const like = (q, p) => Math.abs(q.y1 - q.y0 + 1 - medH) <= medH * 0.3 && q.x1 - q.x0 + 1 <= medW * 1.35
        && (!p || Math.abs((q.x0 + q.x1) / 2 - (p.x0 + p.x1) / 2) <= Math.max(3, medW * 0.6) + Math.abs(cy(q) - cy(p)) * 0.15);
      let run = [], cur = [];
      const realN = (r) => r.length; // characters seen (a row marked hidden is a seen character after the hidden ones)
      for (const q of rows) {
        delete q.hidden;
        if (odd(q)) continue; // left out; a hidden character is found from the gap it leaves
        if (cur.length) {
          const last = cur[cur.length - 1], gap = q.y0 - last.y1, d = cy(q) - cy(last), k = pitch ? Math.round(d / pitch) - 1 : 0;
          if (gap > medH * 0.6 && k >= 1 && k <= 2 && Math.abs(d - (k + 1) * pitch) < pitch * 0.35 && like(q, last) && like(last)) q.hidden = k;
          else if (gap > medH * 1.2) cur = [];
        }
        cur.push(q);
        if (realN(cur) > realN(run)) run = cur.slice();
      }
      // a hidden character needs two or more characters after it (one mark after a gap is the star under a tag, not the ID)
      for (let i = run.length - 1; i >= 0; i--) if (run[i].hidden && (run.length - i < 2 || !like(run[i + 1], run[i]))) { run = run.slice(0, i); break; }
      if (run.length && run[0].hidden) delete run[0].hidden;
      const mh = med(run.map((q) => q.y1 - q.y0 + 1)), even = run.filter((q) => Math.abs(q.y1 - q.y0 + 1 - mh) <= mh * 0.35).length;
      return { run, even };
    };
    let best = [];
    for (let k = 0, bestEven = -1; k < 4; k++) {
      let pk = 0; for (let x = 1; x < W; x++) if (prof[x] > prof[pk]) pk = x;
      if (!(prof[pk] > 0)) break;
      let b0 = pk, b1 = pk; const lim = prof[pk] * 0.3;
      while (b0 > 0 && prof[b0 - 1] >= lim) b0--;
      while (b1 < W - 1 && prof[b1 + 1] >= lim) b1++;
      const c = chainIn(b0, b1);
      if (c.even > bestEven || (c.even === bestEven && c.run.length > best.length)) { best = c.run; bestEven = c.even; }
      for (let x = b0; x <= b1; x++) prof[x] = 0; // the next strongest column
    }
    if (best.length < 3) return null;
    const keep = new Set(); best.forEach((q) => q.ids.forEach((id) => keep.add(id)));
    // every piece of ink inside a character's box is drawn (a stencil's loose fragment set aside while finding the column)
    for (const c of comps) if (!keep.has(c.id) && best.some((q) => c.x0 >= q.x0 - 1 && c.x1 <= q.x1 + 1 && c.y0 >= q.y0 - 1 && c.y1 <= q.y1 + 1)) keep.add(c.id);
    const out = new Uint8Array(N); for (let i = 0; i < N; i++) if (lab[i] && keep.has(lab[i])) out[i] = 1;
    const medH = med(best.map((q) => q.y1 - q.y0 + 1));
    return { rows: best.map(({ x0, y0, x1, y1, hidden }) => (hidden ? { x0, y0, x1, y1, hidden } : { x0, y0, x1, y1 })), ink: out, medH, even: best.filter((q) => Math.abs(q.y1 - q.y0 + 1 - medH) <= medH * 0.35).length,
      hidden: best.reduce((t, q) => t + (q.hidden || 0), 0) };
  }
  /**
   * v2.16: a tag painted downwards in a small camera frame: four or more characters of one size, one above the other, near
   * the centre (or the tap). Cables and leaves beside it do not join it, as they can in findIdBox. rgba: RGBA W×H.
   * -> {x, y, w, h, n (characters), score} in frame pixels, or null.
   */
  function findStack(rgba, W, H, focus, whole) {
    const rw = whole ? W : Math.max(16, Math.round(W * 0.44)), rh = whole ? H : Math.max(16, Math.round(H * 0.8)); // whole: rgba is already the part to search
    const cx = (focus ? focus.x : 0.5) * W, cy = (focus ? focus.y : 0.45) * H;
    const x0 = Math.max(0, Math.min(W - rw, Math.round(cx - rw / 2))), y0 = Math.max(0, Math.min(H - rh, Math.round(cy - rh / 2)));
    const sub = new Uint8Array(rw * rh * 4);
    for (let y = 0; y < rh; y++) sub.set(rgba.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + rw) * 4), y * rw * 4);
    const avg = (a) => a.reduce((t, v) => t + v, 0) / a.length;
    let best = null;
    for (const light of [false, true]) {
      const r = stackRows(sub, rw, rh, light); if (!r || r.rows.length < 4 || r.medH < 5) continue;
      const full = r.rows.filter((q) => Math.abs(q.y1 - q.y0 + 1 - r.medH) <= r.medH * 0.35);
      if (full.length < Math.max(4, Math.ceil(r.rows.length * 0.7))) continue; // characters of one size
      const ws = full.map((q) => q.x1 - q.x0 + 1).sort((a, b) => a - b), medW = ws[ws.length >> 1];
      // one above the other along a straight line (a leaning pole slants it), not a line of text or leaves
      const ys = full.map((q) => (q.y0 + q.y1) / 2), xs = full.map((q) => (q.x0 + q.x1) / 2), my = avg(ys), mx = avg(xs);
      const vy = avg(ys.map((y) => (y - my) ** 2)), slope = vy ? avg(ys.map((y, i) => (y - my) * (xs[i] - mx))) / vy : 0;
      const sd = Math.sqrt(avg(xs.map((x, i) => (x - mx - slope * (ys[i] - my)) ** 2)));
      if (Math.abs(slope) > 0.35 || sd > Math.max(1.5, medW * 0.45, r.medH * 0.2) || medW > r.medH * 1.6) continue;
      const bx0 = Math.min(...r.rows.map((q) => q.x0)), bx1 = Math.max(...r.rows.map((q) => q.x1)), by0 = r.rows[0].y0, by1 = r.rows[r.rows.length - 1].y1;
      const score = Math.round((full.length * 2 + Math.sqrt((bx1 - bx0 + 1) * (by1 - by0 + 1)) / 4) * 100) / 100;
      if (!best || score > best.score) best = { x: x0 + bx0, y: y0 + by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1, n: r.rows.length, score };
    }
    return best;
  }

  /* ---------------- glyph reader (v2.20) ----------------
     A small neural network (3 convolution layers, 2 dense) trained on painted, stencilled and embossed characters, run
     on each character the app cuts out of the picture. Characters as small as 8 px read, in a few milliseconds each.
     The trained weights are in glyphs.js (setGlyphModel). */
  const GS = 24, GCLASSES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ~'; // ~ = not a character
  let glyphModel = null, gnet = null;
  function setGlyphModel(m) { glyphModel = m || null; gnet = null; }
  function b64bytes(s) {
    if (typeof atob === 'function') { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    return Uint8Array.from(Buffer.from(s, 'base64')); // node (tests)
  }
  function glyphNet() {
    if (gnet || !glyphModel) return gnet;
    try {
      const L = {};
      for (const [k, t] of Object.entries(glyphModel.w)) {
        const q = new Int8Array(b64bytes(t.q).buffer), sc = new Float32Array(b64bytes(t.s).buffer), cols = t.shape[1], w = new Float32Array(q.length);
        for (let i = 0; i < q.length; i++) w[i] = q[i] * sc[i % cols];
        L[k] = w;
      }
      for (const [k, t] of Object.entries(glyphModel.b)) L[k] = new Float32Array(b64bytes(t).buffer);
      gnet = { L, ch: glyphModel.ch, hid: glyphModel.hid };
    } catch (e) { // a damaged model file: the reader falls back to the text reader instead of failing every scan (v2.21)
      if (typeof console !== 'undefined') console.warn('glyph model not loaded', e);
      glyphModel = null; gnet = null;
    }
    return gnet;
  }
  const glyphReady = () => !!glyphNet();
  /** Gray (0..255, float) of RGBA bytes. */
  function grayOf(rgba, W, H) { const g = new Float32Array(W * H); for (let i = 0, j = 0; i < W * H; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) / 256; return g; }
  /** The network's input for one character box (x0, y0, x1, y1 inclusive) of a gray picture: a square around it, 24×24,
      contrast-normalised with the ink positive, plus its edge strength. Must match the training (glyphlib.patch). */
  function glyphPatch(g, W, H, box) {
    const [x0, y0, x1, y1] = box, bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.max(bw, bh) * 1.25;
    const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, left = cx - side / 2, top = cy - side / 2, step = side / GS;
    const n = Math.min(6, Math.max(2, Math.ceil(step))), v = new Float32Array(GS * GS);
    const at = (y, x) => {
      y = Math.min(H - 1, Math.max(0, y)); x = Math.min(W - 1, Math.max(0, x));
      const ya = Math.floor(y), xa = Math.floor(x), yb = Math.min(ya + 1, H - 1), xb = Math.min(xa + 1, W - 1), fy = y - ya, fx = x - xa;
      const a = g[ya * W + xa] * (1 - fx) + g[ya * W + xb] * fx, b = g[yb * W + xa] * (1 - fx) + g[yb * W + xb] * fx;
      return a * (1 - fy) + b * fy;
    };
    for (let i = 0; i < GS; i++) for (let j = 0; j < GS; j++) {
      let s = 0;
      for (let a = 0; a < n; a++) { const y = top + (i + (a + 0.5) / n) * step - 0.5; for (let b = 0; b < n; b++) s += at(y, left + (j + (b + 0.5) / n) * step - 0.5); }
      v[i * GS + j] = s / (n * n);
    }
    let m = 0; for (let i = 0; i < v.length; i++) m += v[i]; m /= v.length;
    let sd = 0; for (let i = 0; i < v.length; i++) sd += (v[i] - m) ** 2; sd = Math.sqrt(sd / v.length);
    const z = new Float32Array(GS * GS); for (let i = 0; i < v.length; i++) z[i] = (v[i] - m) / (sd + 8);
    let ring = 0, rn = 0;
    for (let i = 0; i < GS; i++) for (let j = 0; j < GS; j++) if (i < 2 || i >= GS - 2 || j < 2 || j >= GS - 2) { ring += z[i * GS + j]; rn++; }
    if (ring / rn > 0) for (let i = 0; i < z.length; i++) z[i] = -z[i];
    const out = new Float32Array(2 * GS * GS); out.set(z, 0);
    const zz = (y, x) => z[Math.min(GS - 1, Math.max(0, y)) * GS + Math.min(GS - 1, Math.max(0, x))];
    const mag = new Float32Array(GS * GS); let mm = 0;
    for (let y = 0; y < GS; y++) for (let x = 0; x < GS; x++) {
      const gx = zz(y - 1, x + 1) + 2 * zz(y, x + 1) + zz(y + 1, x + 1) - zz(y - 1, x - 1) - 2 * zz(y, x - 1) - zz(y + 1, x - 1);
      const gy = zz(y + 1, x - 1) + 2 * zz(y + 1, x) + zz(y + 1, x + 1) - zz(y - 1, x - 1) - 2 * zz(y - 1, x) - zz(y - 1, x + 1);
      const v2 = Math.sqrt(gx * gx + gy * gy); mag[y * GS + x] = v2; mm += v2;
    }
    mm /= mag.length; let ms = 0; for (let i = 0; i < mag.length; i++) ms += (mag[i] - mm) ** 2; ms = Math.sqrt(ms / mag.length);
    for (let i = 0; i < mag.length; i++) out[GS * GS + i] = (mag[i] - mm) / (ms + 1e-3);
    return out;
  }
  let gcols = new Float32Array(0);
  /** 3×3 convolution (padding 1) + ReLU: the patches as rows (im2col), then rows × weights; output channel-first F×H×W. */
  function convRelu(x, C, H, W, w, b, F) {
    const HW = H * W, K = C * 9;
    if (gcols.length < HW * K) gcols = new Float32Array(HW * K);
    const cols = gcols;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const r = (y * W + xx) * K;
      for (let c = 0; c < C; c++) for (let ki = 0; ki < 3; ki++) {
        const sy = y + ki - 1, o = r + c * 9 + ki * 3;
        if (sy < 0 || sy >= H) { cols[o] = 0; cols[o + 1] = 0; cols[o + 2] = 0; continue; }
        const base = c * HW + sy * W + xx;
        cols[o] = xx > 0 ? x[base - 1] : 0; cols[o + 1] = x[base]; cols[o + 2] = xx < W - 1 ? x[base + 1] : 0;
      }
    }
    const acc = new Float32Array(F), out = new Float32Array(F * HW);
    for (let p = 0; p < HW; p++) {
      for (let f = 0; f < F; f++) acc[f] = b[f];
      const r = p * K;
      for (let k = 0; k < K; k++) { const v = cols[r + k]; if (v === 0) continue; const wr = k * F; for (let f = 0; f < F; f++) acc[f] += v * w[wr + f]; }
      for (let f = 0; f < F; f++) out[f * HW + p] = acc[f] > 0 ? acc[f] : 0;
    }
    return out;
  }
  function pool2(x, C, H, W) {
    const h = H >> 1, w = W >> 1, out = new Float32Array(C * h * w);
    for (let c = 0; c < C; c++) for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const i = c * H * W + 2 * y * W + 2 * xx;
      out[c * h * w + y * w + xx] = Math.max(x[i], x[i + 1], x[i + W], x[i + W + 1]);
    }
    return out;
  }
  /** Class probabilities (GCLASSES order) for one patch. */
  function glyphProbs(p) {
    const N = glyphNet(); if (!N) return null;
    const { L, ch, hid } = N; let x = p, H = GS, W = GS;
    for (let i = 0; i < 3; i++) { x = pool2(convRelu(x, ch[i], H, W, L[`c${i}w`], L[`c${i}b`], ch[i + 1]), ch[i + 1], H, W); H >>= 1; W >>= 1; }
    const C = ch[3], flat = new Float32Array(C * H * W);
    for (let c = 0; c < C; c++) for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) flat[(y * W + xx) * C + c] = x[c * H * W + y * W + xx];
    const a = new Float32Array(hid);
    for (let j = 0; j < hid; j++) a[j] = L.f0b[j];
    for (let i = 0; i < flat.length; i++) { const v = flat[i]; if (!v) continue; const r = i * hid; for (let j = 0; j < hid; j++) a[j] += v * L.f0w[r + j]; }
    const nc = GCLASSES.length, o = new Float32Array(nc);
    for (let k = 0; k < nc; k++) o[k] = L.f1b[k];
    for (let j = 0; j < hid; j++) { const v = a[j] > 0 ? a[j] : 0; if (!v) continue; const r = j * nc; for (let k = 0; k < nc; k++) o[k] += v * L.f1w[r + k]; }
    let mx = -Infinity; for (let k = 0; k < nc; k++) mx = Math.max(mx, o[k]);
    let s = 0; for (let k = 0; k < nc; k++) { o[k] = Math.exp(o[k] - mx); s += o[k]; }
    for (let k = 0; k < nc; k++) o[k] /= s;
    return o;
  }
  // look-alikes: in a number a letter is the digit it looks like (O 0, I 1…), in a word the other way round
  const LOOK_D = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', J: '1', T: '7', Z: '2', S: '5', G: '6', B: '8', A: '4', Y: '4', E: '3', P: '9' };
  const LOOK_L = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' };
  /** Best character of a probability vector: {ch, p, digit: {ch, p}, noise}. A digit's probability includes its look-alike letters. */
  function glyphPick(pr) {
    let best = -1, bp = -1; for (let k = 0; k < GCLASSES.length - 1; k++) if (pr[k] > bp) { bp = pr[k]; best = k; }
    const dp = new Float32Array(10); for (let d = 0; d < 10; d++) dp[d] = pr[d];
    for (const [l, d] of Object.entries(LOOK_D)) dp[+d] += pr[GCLASSES.indexOf(l)];
    let bd = 0; for (let d = 1; d < 10; d++) if (dp[d] > dp[bd]) bd = d;
    const lp = (ch) => pr[GCLASSES.indexOf(ch)] + (Object.entries(LOOK_L).find(([, l]) => l === ch) ? pr[+Object.entries(LOOK_L).find(([, l]) => l === ch)[0]] : 0);
    return { ch: GCLASSES[best], p: bp, digit: { ch: String(bd), p: Math.min(1, dp[bd]) }, letterP: lp, noise: pr[GCLASSES.length - 1], pr };
  }
  /** A character box read twice, as cut and with a little more room round it; the two readings averaged (a character the
      network is not steady about comes out unsure). */
  const glyphOf = (g, W, H, box) => {
    const a = glyphProbs(glyphPatch(g, W, H, box)); if (!a) return null;
    const [x0, y0, x1, y1] = box, px = (x1 - x0 + 1) * 0.08, py = (y1 - y0 + 1) * 0.08, b = glyphProbs(glyphPatch(g, W, H, [x0 - px, y0 - py, x1 + px, y1 + py]));
    for (let k = 0; k < a.length; k++) a[k] = (a[k] + b[k]) / 2;
    return glyphPick(a);
  };
  /** Picked characters as ID text: a run of two or more letters at the start is the prefix (CC, GT, an owner's name);
      after it every character is a digit (a letter read there is the digit it looks like: O 0, S 5…) unless it is clearly a
      letter. -> {text, conf (0..100, the least sure character), alts: [{text, conf}]} */
  function glyphText(picks) {
    const dmax = (q) => Math.max(...q.pr.subarray(0, 10)), isL = (q) => !q.hidden && !q.dash && q.ch >= 'A';
    let pre = 0; while (pre < picks.length && isL(picks[pre])) pre++;
    if (pre < 2) pre = 0;
    const chars = picks.map((q, i) => {
      if (q.dash) return { ch: '-', p: 1, fixed: true };
      if (q.hidden) return { ch: 'X', p: 1, fixed: true };
      if (i < pre || (q.ch >= 'A' && q.p >= 0.85 && dmax(q) < 0.05 && !LOOK_D[q.ch])) return { ch: q.ch, p: Math.min(1, q.letterP(q.ch)), alt: q.pr, letter: true };
      return { ch: q.digit.ch, p: q.digit.p, alt: q.pr };
    });
    const real = chars.filter((c) => !c.fixed), conf = real.length ? Math.round(100 * Math.min(...real.map((c) => c.p))) : 0;
    const text = chars.map((c) => c.ch).join(''), alts = [];
    // the least sure character's next choice, as a second reading
    const weak = chars.map((c, i) => [c, i]).filter(([c]) => !c.fixed && c.p < 0.9).sort((a, b) => a[0].p - b[0].p)[0];
    if (weak) {
      const [c, i] = weak, order = [...c.alt.keys()].filter((k) => k < GCLASSES.length - 1 && GCLASSES[k] !== c.ch && (c.letter ? k >= 10 : k < 10)).sort((a, b) => c.alt[b] - c.alt[a]);
      if (order.length) { const k = order[0], t = text.slice(0, i) + GCLASSES[k] + text.slice(i + 1); alts.push({ text: t, conf: Math.round(100 * Math.min(c.alt[k], ...real.filter((r) => r !== c).map((r) => r.p))) }); }
    }
    return { text, conf, alts };
  }
  /** Connected parts (8-neighbour) of a 0/1 map: [{x0, y0, x1, y1, n}] */
  function blobs(map, W, H, minN) {
    const lab = new Int32Array(W * H), st = new Int32Array(W * H), out = [];
    for (let i = 0; i < W * H; i++) {
      if (!map[i] || lab[i]) continue;
      const id = out.length + 1; let sp = 0, n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0; st[sp++] = i; lab[i] = id;
      while (sp) {
        const k = st[--sp], y = (k / W) | 0, x = k - y * W; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
          const j = yy * W + xx; if (map[j] && !lab[j]) { lab[j] = id; st[sp++] = j; }
        }
      }
      if (n >= (minN || 1)) out.push({ x0, y0, x1, y1, n });
    }
    return out;
  }
  /** The q-quantile of non-negative values (a 2048-bin histogram: no sort). */
  function quantile(a, q) {
    let mx = 0; for (let i = 0; i < a.length; i++) if (a[i] > mx) mx = a[i];
    if (!mx) return 0;
    const h = new Uint32Array(2048), k = 2047 / mx; for (let i = 0; i < a.length; i++) h[Math.floor(a[i] * k)]++;
    let n = 0; const want = a.length * q; for (let i = 0; i < 2048; i++) { n += h[i]; if (n >= want) return i / k; }
    return mx;
  }
  /** Ink maps of a crop: dark paint, light paint, and the edges of raised (embossed) or faint characters. */
  function inkMaps(g, W, H, r) {
    const W1 = W + 1, ii = new Float64Array(W1 * (H + 1));
    for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) { s += g[y * W + x]; ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + s; } }
    const dark = new Uint8Array(W * H), light = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const ya = Math.max(0, y - r), yb = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const xa = Math.max(0, x - r), xb = Math.min(W, x + r + 1), mean = (ii[yb * W1 + xb] - ii[ya * W1 + xb] - ii[yb * W1 + xa] + ii[ya * W1 + xa]) / ((xb - xa) * (yb - ya));
        const v = g[y * W + x], t = Math.max(14, mean * 0.15);
        if (v < mean - t) dark[y * W + x] = 1; else if (v > mean + Math.max(14, (255 - mean) * 0.15)) light[y * W + x] = 1;
      }
    }
    // edges: Sobel strength above most of the crop, closed so a raised character's outline is one piece
    const mag = new Float32Array(W * H), at = (y, x) => g[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const gx = at(y - 1, x + 1) + 2 * at(y, x + 1) + at(y + 1, x + 1) - at(y - 1, x - 1) - 2 * at(y, x - 1) - at(y + 1, x - 1);
      const gy = at(y + 1, x - 1) + 2 * at(y + 1, x) + at(y + 1, x + 1) - at(y - 1, x - 1) - 2 * at(y - 1, x) - at(y - 1, x + 1);
      mag[y * W + x] = Math.abs(gx) + Math.abs(gy);
    }
    const t = Math.max(40, quantile(mag, 0.8));
    const edge = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) edge[i] = mag[i] > t ? 1 : 0;
    return { dark, light, edge };
  }
  /** Lines of character boxes in a crop: each line [{x0, y0, x1, y1}] left to right, plus a dash where one is. */
  function textLines(map, W, H) {
    const minH = Math.max(6, H * 0.1);
    let cs = blobs(map, W, H, 6).filter((c) => { const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1; return (h >= minH || (h >= 3 && w >= h * 1.2 && w >= minH * 0.5)) && h <= H * 0.98 && w <= W * 0.6 && w <= Math.max(h * 2.6, minH * 1.6) && c.n >= w * h * 0.08; });
    if (cs.length > 80) cs = cs.sort((a, b) => b.n - a.n).slice(0, 80); // a busy picture: the biggest pieces
    // pieces of one character above each other (a stencil's cut, the dot of a broken stroke) or inside each other: one box
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < cs.length && !merged; i++) for (let j = i + 1; j < cs.length && !merged; j++) {
        const a = cs[i], b = cs[j], ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1, mw = Math.min(a.x1 - a.x0, b.x1 - b.x0) + 1;
        const gap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1), hh = Math.max(a.y1 - a.y0, b.y1 - b.y0) + 1;
        const inside = a.x0 <= b.x0 && a.x1 >= b.x1 && a.y0 <= b.y0 && a.y1 >= b.y1 || b.x0 <= a.x0 && b.x1 >= a.x1 && b.y0 <= a.y0 && b.y1 >= a.y1;
        if (inside || (ov >= mw * 0.6 && gap <= hh * 0.3)) { cs[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n }; cs.splice(j, 1); merged = true; }
      }
    }
    const lines = [], used = new Set(), cy = (c) => (c.y0 + c.y1) / 2, hh = (c) => c.y1 - c.y0 + 1;
    const order = cs.map((c, i) => i).sort((a, b) => hh(cs[b]) - hh(cs[a]));
    for (const s of order) {
      if (used.has(s) || lines.length >= 3) continue;
      const c = cs[s], band = cs.map((d, i) => i).filter((i) => !used.has(i) && Math.abs(cy(cs[i]) - cy(c)) <= hh(c) * 0.3 && hh(cs[i]) >= hh(c) * 0.55 && hh(cs[i]) <= hh(c) * 1.5).sort((a, b) => cs[a].x0 - cs[b].x0);
      // the longest run with no gap over 1.3 character heights
      let runs = [[]];
      band.forEach((i) => { const r = runs[runs.length - 1], p = r.length ? cs[r[r.length - 1]] : null; if (p && cs[i].x0 - p.x1 > hh(c) * 1.3) runs.push([i]); else r.push(i); });
      const run = runs.filter((r) => r.includes(s))[0] || [];
      if (run.length < 2) continue;
      run.forEach((i) => used.add(i));
      const items = run.map((i) => cs[i]), lh = items.map(hh).sort((a, b) => a - b)[items.length >> 1], ly = items.map(cy).sort((a, b) => a - b)[items.length >> 1];
      // a dash between two characters: short, wide, in the middle of the line
      cs.forEach((d, i) => {
        if (used.has(i)) return; const w = d.x1 - d.x0 + 1;
        if (hh(d) <= lh * 0.4 && w >= hh(d) * 1.2 && w <= lh * 1.2 && Math.abs(cy(d) - ly) <= lh * 0.25 && d.x0 > items[0].x0 && d.x1 < items[items.length - 1].x1) { items.push({ ...d, dash: true }); used.add(i); }
      });
      items.sort((a, b) => a.x0 - b.x0);
      lines.push({ items, h: lh, y: ly });
    }
    return lines.sort((a, b) => a.y - b.y);
  }
  /** Lines of characters found by their edges (raised letters on a plate of the same colour, faint paint). The edges of a
      line of letters run together, so the line is cut where its edges thin out between letters (the cuts that do not read
      as characters are joined again by readLine). Same form as textLines. */
  function edgeLines(edge, W, H) {
    // the lines: the closed edge map's big pieces, grouped by height
    const big = blobs(closeLine(closeLine(edge, W, H, 3, false), W, H, 3, true), W, H, 30).filter((c) => c.y1 - c.y0 + 1 >= 8 && c.y1 - c.y0 + 1 <= H * 0.95);
    big.sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0));
    const bands = [];
    for (const c of big) {
      const ch = c.y1 - c.y0 + 1, b = bands.find((q) => Math.min(q.y1, c.y1) - Math.max(q.y0, c.y0) + 1 >= Math.min(ch, q.y1 - q.y0 + 1) * 0.5);
      if (b) { b.y0 = Math.min(b.y0, c.y0); b.y1 = Math.max(b.y1, c.y1); b.x0 = Math.min(b.x0, c.x0); b.x1 = Math.max(b.x1, c.x1); b.hs.push(ch); }
      else if (bands.length < 3) bands.push({ y0: c.y0, y1: c.y1, x0: c.x0, x1: c.x1, hs: [ch] });
    }
    const lines = [];
    for (const b of bands) {
      const bh = b.y1 - b.y0 + 1, w = b.x1 - b.x0 + 1; if (w < bh * 1.2) continue; // one blob: no line of characters
      const P = new Float32Array(w); for (let x = 0; x < w; x++) { let s = 0; for (let y = b.y0; y <= b.y1; y++) s += edge[y * W + b.x0 + x]; P[x] = s; }
      const r = Math.max(1, Math.round(bh * 0.03)), Q = new Float32Array(w);
      for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { s += P[k]; n++; } Q[x] = s / n; }
      // cuts: empty columns, and the low points between letters that touch
      const on = (x) => Q[x] > bh * 0.06, cuts = new Set([0, w]), win = Math.max(2, Math.round(bh * 0.08)), far = Math.max(4, Math.round(bh * 0.4));
      for (let x = 1; x < w; x++) if (on(x) !== on(x - 1)) cuts.add(x);
      for (let x = 1; x < w - 1; x++) {
        if (!on(x)) continue; let lo = true, hiL = 0, hiR = 0;
        for (let k = Math.max(0, x - win); k <= Math.min(w - 1, x + win); k++) if (Q[k] < Q[x]) { lo = false; break; }
        if (!lo) continue;
        for (let k = Math.max(0, x - far); k < x; k++) hiL = Math.max(hiL, Q[k]);
        for (let k = x + 1; k <= Math.min(w - 1, x + far); k++) hiR = Math.max(hiR, Q[k]);
        if (Q[x] < Math.min(hiL, hiR) * 0.9) cuts.add(x);
      }
      // cuts closer than a stroke apart: one of them (the lower) is enough
      const cs0 = [...cuts].sort((a, c) => a - c), minGap = Math.max(2, Math.round(bh * 0.1)), cs = [];
      for (const x of cs0) { const p = cs[cs.length - 1]; if (p != null && x - p < minGap && x !== w && p !== 0) { if (Q[Math.min(w - 1, x)] < Q[Math.min(w - 1, p)]) cs[cs.length - 1] = x; } else cs.push(x); }
      const items = [];
      for (let i = 0; i + 1 < cs.length; i++) {
        const xa = cs[i], xb = cs[i + 1] - 1; if (xb < xa || !on(Math.round((xa + xb) / 2)) && Math.max(...Q.subarray(xa, xb + 1)) <= bh * 0.06) continue;
        let y0 = -1, y1 = -1;
        for (let y = b.y0; y <= b.y1; y++) { let s = 0; for (let x = xa; x <= xb; x++) s += edge[y * W + b.x0 + x]; if (s) { if (y0 < 0) y0 = y; y1 = y; } }
        if (y0 < 0 || y1 - y0 + 1 < bh * 0.3) continue;
        // a piece wider than a character (letters run together): cut in narrow strips; the reading joins the right ones again
        const ch = y1 - y0 + 1, n = xb - xa + 1 > ch * 0.75 ? Math.ceil((xb - xa + 1) / (ch * 0.15)) : 1, sw = (xb - xa + 1) / n;
        for (let k = 0; k < n; k++) items.push({ x0: b.x0 + xa + Math.round(k * sw), y0, x1: b.x0 + xa + Math.round((k + 1) * sw) - 1, y1 });
      }
      const ih = items.map((q) => q.y1 - q.y0 + 1).sort((a, c) => a - c)[items.length >> 1]; // the characters' height (the band may hold more)
      if (items.length >= 2 && items.length <= Math.max(10, (w / ih) * 7)) lines.push({ items, h: ih, y: (b.y0 + b.y1) / 2, pieces: true });
    }
    return lines.sort((a, c) => a.y - c.y);
  }
  /** Reads one line: neighbouring pieces are joined into one character when that reads better (a stencil's two halves). */
  function readLine(g, W, H, line) {
    const it = line.items, n = it.length, h = line.h;
    const box = (a, b) => { let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1; for (let k = a; k <= b; k++) { x0 = Math.min(x0, it[k].x0); y0 = Math.min(y0, it[k].y0); x1 = Math.max(x1, it[k].x1); y1 = Math.max(y1, it[k].y1); } return [x0, y0, x1, y1]; };
    const best = new Float64Array(n + 1).fill(-Infinity), from = new Int32Array(n + 1), pick = new Array(n + 1); best[0] = 0;
    for (let i = 0; i < n; i++) {
      if (best[i] === -Infinity) continue;
      for (let k = 1; k <= (line.pieces ? 7 : 3) && i + k <= n; k++) {
        if (it.slice(i, i + k).some((q) => q.dash) && k > 1) break;
        const b = box(i, i + k - 1); if (k > 1 && b[2] - b[0] + 1 > h * 1.05) break;
        let s, q;
        if (it[i].dash) { s = 0; q = { dash: true }; } else {
          q = glyphOf(g, W, H, b); if (!q) return null;
          // each character read counts for itself (else fewer, wider boxes would always win); a piece that is no character is left out, at a cost
          s = q.noise > 0.5 ? Math.log(q.noise) - 1.5 : Math.log(Math.max(1e-4, Math.max(q.p, q.digit.p))) + 0.6;
          if (q.noise > 0.5) q = { skip: true };
        }
        if (best[i] + s > best[i + k]) { best[i + k] = best[i] + s; from[i + k] = i; pick[i + k] = { q, b }; }
      }
    }
    const out = []; for (let i = n; i > 0; i = from[i]) out.unshift(pick[i]);
    return out.filter((o) => !o.q.skip);
  }
  /** Reads the ID in a crop with the glyph network. orient 'v': a column of upright characters (stackRows); else lines.
      -> results in the text reader's form for idCandidates ({words: [{text, conf, line}], stacked}), or null. */
  function glyphRead(rgba, W, H, orient, quick) {
    if (!glyphNet()) return null;
    const g = grayOf(rgba, W, H), results = [];
    if (orient === 'v') {
      const rd = stackRows(rgba, W, H, false), rl = stackRows(rgba, W, H, true);
      const r = !rd ? rl : !rl ? rd : (rl.even > rd.even || (rl.even === rd.even && rl.rows.length > rd.rows.length)) ? rl : rd;
      if (r && r.rows.length >= 3) {
        // the column's centre line (a stencil's half-character box would put the window off centre)
        const ys = r.rows.map((q) => (q.y0 + q.y1) / 2), xs = r.rows.map((q) => (q.x0 + q.x1) / 2), n = ys.length, my = ys.reduce((a, b) => a + b) / n, mx = xs.reduce((a, b) => a + b) / n;
        let sxy = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (ys[i] - my) * (xs[i] - mx); syy += (ys[i] - my) ** 2; }
        const sl = syy ? sxy / syy : 0, xAt = (y) => mx + sl * (y - my);
        const cyOf = (q) => (q.y0 + q.y1) / 2, steps = [];
        for (let i = 1; i < r.rows.length; i++) steps.push((cyOf(r.rows[i]) - cyOf(r.rows[i - 1])) / (1 + (r.rows[i].hidden || 0)));
        const pitch = steps.sort((a, b) => a - b)[steps.length >> 1];
        const raw = inkMaps(g, W, H, Math.max(4, Math.round(Math.min(W, H / 3) * 0.35)))[r === rl ? 'light' : 'dark']; // all the ink, not only the characters'
        const parts = blobs(raw, W, H, 3);
        const inkIn = (ya, yb, xa, xb) => { let n = 0, a = 0; for (let y = Math.max(0, ya); y <= Math.min(H - 1, yb); y++) for (let x = Math.max(0, xa); x <= Math.min(W - 1, xb); x++) { a++; n += raw[y * W + x]; } return a ? n / a : 0; };
        let cx0 = Math.min(...r.rows.map((q) => q.x0)), cx1 = Math.max(...r.rows.map((q) => q.x1)), cw = cx1 - cx0 + 1;
        /** The character at a slot of the column (centre yc), read from the ink there if it makes one clear character. */
        const readSlot = (yc) => {
          const xc = xAt(yc), mine = parts.filter((c) => { const h = c.y1 - c.y0 + 1, cy = (c.y0 + c.y1) / 2, cx = (c.x0 + c.x1) / 2; return Math.abs(cy - yc) <= r.medH * 0.45 && h <= r.medH * 1.5 && Math.abs(cx - xc) <= cw * 0.6; });
          if (!mine.length) return null;
          const bx = [Math.min(...mine.map((c) => c.x0)), Math.min(...mine.map((c) => c.y0)), Math.max(...mine.map((c) => c.x1)), Math.max(...mine.map((c) => c.y1))];
          if (bx[2] - bx[0] + 1 > cw * 1.6 || bx[3] - bx[1] + 1 < r.medH * 0.6 || bx[3] - bx[1] + 1 > r.medH * 1.5) return null;
          const p = glyphOf(g, W, H, bx);
          return p && p.noise < 0.3 && Math.max(p.p, p.digit.p) >= 0.6 ? p : null;
        };
        // each row read; a character the column search took as hidden is read if it shows after all (else an X: under a cable)
        let picks = [];
        r.rows.forEach((q, qi) => {
          for (let k = 0; k < (q.hidden || 0); k++) {
            const prev = r.rows[qi - 1], yc = prev ? cyOf(prev) + (cyOf(q) - cyOf(prev)) * (k + 1) / (q.hidden + 1) : cyOf(q) - pitch * (q.hidden - k);
            picks.push(readSlot(yc) || { hidden: true });
          }
          const qh = q.y1 - q.y0 + 1, qw = q.x1 - q.x0 + 1;
          if (qh < r.medH * 0.45 && qw >= qh * 1.3) { picks.push({ dash: true, row: q }); return; } // CC-0457 painted downwards
          const c = xAt((q.y0 + q.y1) / 2), hw = (q.x1 - q.x0) / 2, p = glyphOf(g, W, H, [c - hw, q.y0, c + hw, q.y1]);
          picks.push(p.noise > 0.5 ? { hidden: true, junk: true, row: q } : { ...p, row: q });
        });
        // Something left out that may be a character (an unsure one, a hidden one, a mark above the number) makes the reading
        // partial: shown, never taken as sure. Only a mark under the number (the star) is left out freely.
        const weakEnd = (q) => q && (q.junk || (q.hidden && !q.row) || (!q.hidden && !q.dash && Math.max(q.p, q.digit.p) < 0.5));
        let partial = false;
        const trim = () => {
          while (picks.length && weakEnd(picks[0])) { partial = true; picks.shift(); }
          while (picks.length && weakEnd(picks[picks.length - 1])) { if (!picks[picks.length - 1].junk) partial = true; picks.pop(); }
        };
        trim();
        // after a mark that is no character (the star under the number), at most one more piece: the number ends at the mark
        const jn = picks.findIndex((q) => q.junk);
        if (jn > 0 && picks.length - jn - 1 <= 1) { picks = picks.slice(0, jn); trim(); }
        // beyond each end, step by step: a character the column search missed (read if clear), or one under a cable (X: ink
        // across the column that runs on beyond it); stops at the first slot with neither. At most two X in all.
        const rowsIn = picks.filter((q) => q.row).map((q) => q.row);
        if (rowsIn.length >= 3) {
          cx0 = Math.min(...rowsIn.map((q) => q.x0)); cx1 = Math.max(...rowsIn.map((q) => q.x1)); cw = cx1 - cx0 + 1;
          let xs = picks.filter((q) => q.hidden).length;
          const slot = (yc) => {
            const ya = Math.round(yc - r.medH / 2), yb = Math.round(yc + r.medH / 2);
            if (ya < 0 || yb > H - 1) return null; // outside the crop: nothing to say
            const p = readSlot(yc); if (p) return p;
            if (inkIn(ya, yb, cx0, cx1) < 0.25) return null;
            const across = Math.max(inkIn(ya, yb, cx0 - cw, cx0 - 1), inkIn(ya, yb, cx1 + 1, cx1 + cw));
            if (across < 0.25 || xs >= 2) return null;
            xs++; return { hidden: true, end: true };
          };
          const first = rowsIn[0], last = rowsIn[rowsIn.length - 1];
          if (picks[0].row === first) for (let k = 1; k <= 3; k++) { const q = slot(cyOf(first) - pitch * k); if (!q) break; picks.unshift(q); }
          if (picks[picks.length - 1].row === last) for (let k = 1; k <= 2; k++) { const q = slot(cyOf(last) + pitch * k); if (!q) break; picks.push(q); }
        }
        if (picks.filter((q) => !q.hidden).length >= 3) {
          const kr = picks.filter((q) => q.row).map((q) => q.row), t = glyphText(picks), cut = !!kr.length && (kr[0].y0 <= 1 || kr[kr.length - 1].y1 >= H - 2);
          // a dash belongs after the prefix's letters (CC-0457 painted downwards); anywhere else it is a mark, not part of the ID
          const di = picks.findIndex((q) => q.dash);
          if (di >= 0 && (di === 0 || picks.slice(0, di).some((q) => q.hidden || !(q.ch >= 'A')))) partial = true;
          const k = partial ? 0.5 : 1; // a partial reading: well under the "sure" marks
          results.push({ ok: true, stacked: true, glyph: true, cut, partial, chars: picks.length, words: [{ text: t.text, conf: Math.round(t.conf * k), line: 0 }] });
          t.alts.forEach((a) => results.push({ ok: true, stacked: true, glyph: true, alt: true, partial, words: [{ text: a.text, conf: Math.round(a.conf * k), line: 0 }] }));
        }
      }
      return results;
    }
    // a dark or flat picture: its contrast stretched first, so the paint stands out as it does in daylight
    const lo = quantile(g, 0.01), hi = quantile(g, 0.99);
    if (hi - lo > 8 && hi - lo < 160) { const k = 255 / (hi - lo); for (let i = 0; i < g.length; i++) g[i] = Math.min(255, Math.max(0, (g[i] - lo) * k)); }
    const r = Math.max(4, Math.round(Math.min(H, W / 3) * 0.35)), maps = inkMaps(g, W, H, r);
    let bestSet = null;
    for (const kind of ['dark', 'light', 'relief']) {
      if (kind === 'relief' && (quick || (bestSet && Math.min(...bestSet.words.map((w) => w.conf)) >= 80))) break; // painted characters read clearly (or a live reading: no time)
      const lines = kind === 'relief' ? edgeLines(maps.edge, W, H) : textLines(maps[kind], W, H); if (!lines.length) continue;
      const words = []; let score = 0;
      lines.forEach((ln, li) => {
        const read = readLine(g, W, H, ln); if (!read || read.filter((o) => !o.q.dash).length < 2) return;
        let picks = read.map((o) => ({ ...o.q, box: o.b }));
        while (picks.length && !picks[0].dash && picks[0].p < 0.5) picks = picks.slice(1);
        while (picks.length && !picks[picks.length - 1].dash && picks[picks.length - 1].p < 0.5) picks = picks.slice(0, -1);
        if (picks.filter((q) => !q.dash).length < 2) return;
        const t = glyphText(picks), n = picks.filter((q) => !q.dash).length;
        if (n < 4 && /[0-9]/.test(t.text)) return; // a number of one to three characters is no pole ID (a bolt, a scratch, part of a line)
        if (kind === 'relief') { t.conf = Math.min(t.conf, 75); t.alts.forEach((a) => { a.conf = Math.min(a.conf, 75); }); } // raised letters: offered, to be checked
        words.push({ text: t.text, conf: t.conf, line: `g${li}`, alts: t.alts, n, boxes: picks.map((q) => q.box) });
        score += t.conf * n;
      });
      if (words.length && (!bestSet || score > bestSet.score)) bestSet = { kind, words, score };
    }
    if (!bestSet) return results;
    results.push({ ok: true, glyph: true, how: bestSet.kind, words: bestSet.words.map(({ text, conf, line }) => ({ text, conf, line })), boxes: bestSet.words.map((w) => w.boxes) });
    bestSet.words.forEach((w, i) => w.alts.forEach((a) => results.push({ ok: true, glyph: true, alt: true, words: bestSet.words.map((x, j) => (j === i ? { text: a.text, conf: a.conf, line: x.line } : { text: x.text, conf: x.conf, line: x.line })) })));
    return results;
  }

  const api = { CABLES, parseCsv, companiesFromCsv, utmForward, analyzeRoute, routeChains, autoLinks, distM, deflection, idCandidates, fitShape, knownId, setPolePrefixes, buildExif, insertExif, readExif, parseExifDate, crc32, makeZip, makeZipParts, readZip,
    buildKml, buildDxf, buildCsv, roadsFromOverpass, overpassQuery, nextPoleId, safeName, xmlEsc, blockName, findIdBox, stackRows, findStack,
    setGlyphModel, glyphReady, glyphRead, glyphPatch, glyphProbs, GCLASSES, _glyph: { inkMaps, textLines, edgeLines, grayOf, glyphText, readLine } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PoleCore = api;
})(typeof self !== 'undefined' ? self : this);
