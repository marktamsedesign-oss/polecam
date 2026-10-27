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
      { tag: 0x0131, type: 2, bytes: ascii('PoleCam') },        // Software
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
  function buildKml(points, opts) {
    const o = opts || {};
    const styles = [], marks = [];
    for (const p of points) {
      const sid = 's_' + p.id;
      const href = o.photoIcons && p.iconName ? `files/${p.iconName}` : 'http://maps.google.com/mapfiles/kml/paddle/red-circle.png';
      styles.push(`<Style id="${sid}"><IconStyle><scale>${o.photoIcons ? 1.4 : 1.0}</scale><Icon><href>${xmlEsc(href)}</href></Icon></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle></Style>`);
      const img = p.photoName ? `<img src="files/${xmlEsc(p.photoName)}" width="480"/>` : '';
      // The balloon title is already the Pole ID; lines the stamped photo already shows are not repeated under it.
      const onPhoto = new Set(p.photoName && o.stamped ? (o.stampFields || ['id', 'coords', 'utm', 'time', 'by', 'project']) : []);
      const lines = [];
      if (!onPhoto.has('id') && p.poleType) lines.push(`${xmlEsc(p.poleType)} pole`);
      if (!onPhoto.has('coords')) lines.push(`${p.lat.toFixed(7)}, ${p.lon.toFixed(7)}${Number.isFinite(p.accuracy) ? ` (GPS ±${p.accuracy.toFixed(1)} m${p.adjusted ? ', pin adjusted' : ''})` : ''}`);
      if (!onPhoto.has('time') && fmtDate(p.takenAt)) lines.push(`Captured ${xmlEsc(fmtDate(p.takenAt))}`);
      const desc = img + (img && lines.length ? '<br/>' : '') + lines.join('<br/>');
      marks.push(`<Placemark><name>${xmlEsc(p.poleId)}</name><styleUrl>#${sid}</styleUrl>` +
        `<description><![CDATA[${desc.replace(/]]>/g, ']]&gt;')}]]></description>` +
        `<ExtendedData><Data name="pole_id"><value>${xmlEsc(p.poleId)}</value></Data><Data name="pole_type"><value>${xmlEsc(p.poleType)}</value></Data>` +
        `<Data name="captured"><value>${xmlEsc(p.takenAt)}</value></Data><Data name="accuracy_m"><value>${Number.isFinite(p.accuracy) ? p.accuracy.toFixed(1) : ''}</value></Data></ExtendedData>` +
        `<Point><coordinates>${p.lon.toFixed(8)},${p.lat.toFixed(8)},0</coordinates></Point></Placemark>`);
    }
    let route = '';
    if (o.spans && o.spans.length) {
      styles.push('<Style id="span_ok"><LineStyle><color>ffe6a01c</color><width>3</width></LineStyle></Style>',
        '<Style id="span_long"><LineStyle><color>ff2a2ac9</color><width>4</width></LineStyle></Style>');
      const lines = o.spans.map((s) => `<Placemark><name>${s.len.toFixed(1)} m</name><styleUrl>#${s.long ? 'span_long' : 'span_ok'}</styleUrl>` +
        `<description>${xmlEsc(`${s.from} → ${s.to}: ${s.len.toFixed(1)} m${s.long ? ' (longer than the maximum span)' : ''}`)}</description>` +
        `<LineString><tessellate>1</tessellate><coordinates>${s.a.lon.toFixed(8)},${s.a.lat.toFixed(8)},0 ${s.b.lon.toFixed(8)},${s.b.lat.toFixed(8)},0</coordinates></LineString></Placemark>`);
      route = `<Folder><name>Route (${o.spans.length} spans, ${o.spans.reduce((t, s) => t + s.len, 0).toFixed(0)} m)</name>\n${lines.join('\n')}\n</Folder>\n`;
    }
    const by = o.exportedBy ? `<description>${xmlEsc(o.exportedBy)}</description><ExtendedData><Data name="exported_by"><value>${xmlEsc(o.exportedBy)}</value></Data></ExtendedData>\n` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(o.project || 'PoleCam')}</name>\n${by}${styles.join('\n')}\n${route}<Folder><name>Poles</name>\n${marks.join('\n')}\n</Folder></Document></kml>\n`;
  }

  /* ---------------- DXF (R12 ASCII) ---------------- */
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

  /**
   * points: [{poleId, poleType, lat, lon}], roads: [{cls, name, coords:[[lat,lon],...]}]
   * opts: {zone, symbolSize (m), textHeight (m)}
   */
  function buildDxf(points, opts, roads) {
    const o = Object.assign({ zone: 51, symbolSize: 1, textHeight: 1.5 }, opts || {});
    const L = []; const g = (code, val) => { L.push(String(code), String(val)); };
    const pr = (pts) => pts.map(({ lat, lon }) => utmForward(lat, lon, o.zone, lat < 0));
    const xy = pr(points);
    const roadXY = (roads || []).map((r) => ({ ...r, xy: r.coords.map(([lat, lon]) => utmForward(lat, lon, o.zone, lat < 0)) }));
    const spanXY = (o.spans || []).map((s) => ({ ...s, A: utmForward(s.a.lat, s.a.lon, o.zone, s.a.lat < 0), B: utmForward(s.b.lat, s.b.lon, o.zone, s.b.lat < 0) }));
    const all = xy.concat(...roadXY.map((r) => r.xy));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of all) { minX = Math.min(minX, p.E); minY = Math.min(minY, p.N); maxX = Math.max(maxX, p.E); maxY = Math.max(maxY, p.N); }
    if (!all.length) { minX = minY = 0; maxX = maxY = 1; }

    const types = [...new Set(points.map((p) => p.poleType || 'UNSPECIFIED'))];
    const roadClasses = [...new Set(roadXY.map((r) => r.cls))];
    // colors: ACI
    const palette = [1, 5, 3, 6, 4, 30, 2, 140];
    const layers = [['0', 7], ['POLE_LABEL', 7], ['ROAD_NAME', 8], ...(o.exportedBy ? [['EXPORT_INFO', 8]] : [])];
    types.forEach((t, i) => layers.push([blockName(t), palette[i % palette.length]]));
    const roadColor = { OSM_ROAD_MAJOR: 9, OSM_ROAD_MINOR: 8, OSM_ROAD_PATH: 253 };
    roadClasses.forEach((c) => layers.push([c, roadColor[c] || 8]));
    if (spanXY.length) layers.push(['CABLE_ROUTE', 4], ['SPAN_LONG', 1], ['SPAN_LENGTH', 7]);

    if (o.exportedBy) g(999, dxfText(o.exportedBy)); // a comment line: who exported the drawing
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
    g(9, '$EXTMIN'); g(10, minX.toFixed(3)); g(20, minY.toFixed(3)); g(30, 0);
    g(9, '$EXTMAX'); g(10, maxX.toFixed(3)); g(20, maxY.toFixed(3)); g(30, 0);
    g(9, '$LUNITS'); g(70, 2); g(9, '$LUPREC'); g(70, 3);
    g(0, 'ENDSEC');

    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0.0);
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
    for (const [name, color] of layers) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
    g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0.0); g(41, 1.0); g(50, 0.0); g(71, 0); g(42, 2.5); g(3, 'txt'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');

    // Blocks: one per pole type (redefine in AutoCAD to swap in your own pole model)
    const r = o.symbolSize;
    g(0, 'SECTION'); g(2, 'BLOCKS');
    types.forEach((t, i) => {
      const bn = blockName(t);
      g(0, 'BLOCK'); g(8, '0'); g(2, bn); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, bn);
      g(0, 'CIRCLE'); g(8, '0'); g(10, 0); g(20, 0); g(30, 0); g(40, r);
      const style = i % 4;   // distinguish types visually until replaced
      if (style === 1 || style === 3) { g(0, 'LINE'); g(8, '0'); g(10, -r); g(20, 0); g(30, 0); g(11, r); g(21, 0); g(31, 0); g(0, 'LINE'); g(8, '0'); g(10, 0); g(20, -r); g(30, 0); g(11, 0); g(21, r); g(31, 0); }
      if (style === 2 || style === 3) { g(0, 'CIRCLE'); g(8, '0'); g(10, 0); g(20, 0); g(30, 0); g(40, r / 2); }
      g(0, 'ENDBLK'); g(8, '0');
    });
    g(0, 'ENDSEC');

    g(0, 'SECTION'); g(2, 'ENTITIES');
    if (o.exportedBy) { g(0, 'TEXT'); g(8, 'EXPORT_INFO'); g(10, minX.toFixed(3)); g(20, (minY - o.textHeight * 4).toFixed(3)); g(30, 0); g(40, o.textHeight.toFixed(3)); g(1, dxfText(o.exportedBy)); } // below the drawing, on its own layer
    for (const rd of roadXY) {
      if (rd.xy.length < 2) continue;
      g(0, 'POLYLINE'); g(8, rd.cls); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 0);
      for (const p of rd.xy) { g(0, 'VERTEX'); g(8, rd.cls); g(10, p.E.toFixed(3)); g(20, p.N.toFixed(3)); g(30, 0); }
      g(0, 'SEQEND'); g(8, rd.cls);
      if (rd.name) {
        const m = Math.floor((rd.xy.length - 1) / 2), a = rd.xy[m], b = rd.xy[m + 1];
        let ang = Math.atan2(b.N - a.N, b.E - a.E) * 180 / Math.PI;
        if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        g(0, 'TEXT'); g(8, 'ROAD_NAME'); g(10, ((a.E + b.E) / 2).toFixed(3)); g(20, ((a.N + b.N) / 2).toFixed(3)); g(30, 0);
        g(40, (o.textHeight * 0.8).toFixed(3)); g(1, dxfText(rd.name)); g(50, ang.toFixed(2));
      }
    }
    for (const s of spanXY) {
      const lay = s.long ? 'SPAN_LONG' : 'CABLE_ROUTE';
      g(0, 'LINE'); g(8, lay); g(10, s.A.E.toFixed(3)); g(20, s.A.N.toFixed(3)); g(30, 0); g(11, s.B.E.toFixed(3)); g(21, s.B.N.toFixed(3)); g(31, 0);
      let ang = Math.atan2(s.B.N - s.A.N, s.B.E - s.A.E) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const t = `${s.len.toFixed(1)}m`, th = o.textHeight * 0.75, rad = ang * Math.PI / 180;
      const mx = (s.A.E + s.B.E) / 2, my = (s.A.N + s.B.N) / 2, half = t.length * th * 0.3;
      // centred on the span, lifted off the line
      const x = mx - Math.cos(rad) * half - Math.sin(rad) * th * 0.6, y = my - Math.sin(rad) * half + Math.cos(rad) * th * 0.6;
      g(0, 'TEXT'); g(8, 'SPAN_LENGTH'); g(10, x.toFixed(3)); g(20, y.toFixed(3)); g(30, 0); g(40, th.toFixed(3)); g(1, t); g(50, ang.toFixed(2));
    }
    points.forEach((p, i) => {
      const { E, N } = xy[i], bn = blockName(p.poleType || 'UNSPECIFIED');
      g(0, 'INSERT'); g(8, bn); g(2, bn); g(10, E.toFixed(3)); g(20, N.toFixed(3)); g(30, 0);
      g(0, 'TEXT'); g(8, 'POLE_LABEL'); g(10, (E + r * 1.3).toFixed(3)); g(20, (N + r * 0.3).toFixed(3)); g(30, 0);
      g(40, o.textHeight.toFixed(3)); g(1, dxfText(p.poleId));
    });
    g(0, 'ENDSEC'); g(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }

  /* ---------------- CSV ---------------- */
  function buildCsv(points, zone, exportedBy) {
    const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['pole_id', 'pole_type', 'latitude', 'longitude', `utm${zone}n_easting`, `utm${zone}n_northing`, 'gps_accuracy_m', 'pin_adjusted', 'captured', 'photo', 'surveyed_by', ...(exportedBy ? ['exported_by'] : [])]];
    for (const p of points) {
      const u = utmForward(p.lat, p.lon, zone, p.lat < 0);
      rows.push([p.poleId, p.poleType, p.lat.toFixed(8), p.lon.toFixed(8), u.E.toFixed(3), u.N.toFixed(3),
        Number.isFinite(p.accuracy) ? p.accuracy.toFixed(1) : '', p.adjusted ? 'yes' : 'no', p.takenAt, p.photoName || '', p.by || '', ...(exportedBy ? [exportedBy] : [])]);
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
  function analyzeRoute(points, links, o) {
    const by = {}; points.forEach((p) => { by[p.id] = p; });
    const nb = {}; points.forEach((p) => { nb[p.id] = []; });
    const spans = [];
    for (const [ia, ib] of links || []) {
      const a = by[ia], b = by[ib];
      if (!a || !b || ia === ib) continue;
      const len = distM(a, b);
      spans.push({ ia, ib, a, b, from: a.poleId, to: b.poleId, len, long: len > o.maxSpan });
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
    let best = null;
    for (const L of [...new Set(KNOWN_PREFIX.map((k) => k.length))].sort((a, b) => b - a)) {
      if (s.length <= L) continue;
      const rawNum = s.slice(L), misread = (rawNum.match(/[A-Z]/g) || []).length;
      if (!/[0-9]/.test(rawNum) || misread * 2 > rawNum.length) continue; // the number must be mostly real digits (SPOT is not SP-0001)
      const pre = s.slice(0, L).split('').map((c) => (/[0-9]/.test(c) ? (TO_LETTER[c] || c) : c)).join('');
      const num = rawNum.split('').map((c) => (/[A-Z]/.test(c) ? (TO_DIGIT[c] || c) : c)).join('');
      if (!/^[0-9]{1,6}$/.test(num)) continue;
      let p = KNOWN_PREFIX.includes(pre) ? pre : null, fuzzy = false;
      if (!p) { // one misread letter, e.g. GC -> CC, FOU -> FDU (only when it points to a single known prefix)
        let near = KNOWN_PREFIX.filter((k) => k.length === L && [...k].filter((ch, i) => ch !== pre[i]).length === 1);
        if (near.length > 1) near = near.filter((k) => [...k].every((ch, i) => ch === pre[i] || LOOKALIKE.includes(pre[i] + ch)));
        if (near.length === 1) { p = near[0]; fuzzy = true; }
      }
      if (!p) continue;
      const id = p === 'FDU' ? `FDU_${num}` : `${p}-${PAD4.includes(p) ? num.padStart(4, '0') : num}`;
      const padded = PAD4.includes(p) && num.length < 4; // zeros added: a digit may have been missed
      if (!best || (best.fuzzy && !fuzzy)) best = { id, prefix: p, fuzzy, padded };
    }
    return best;
  }
  /**
   * results: [{words:[{text, conf, line}], stacked?}] (one per OCR pass); lastId: previous ID in the project (may be '').
   * stacked = the ID is a column of upright characters, read top to bottom.
   * -> [{id, conf, fits}] best first, at most 5.
   */
  function idCandidates(results, lastId) {
    const target = lastId ? shapeOf(lastId.toUpperCase()) : '';
    const sep = (lastId || '').match(/[-/_ ]/);
    const joiner = sep ? sep[0].trim() || '-' : '-';
    const found = new Map();
    const put = (id, conf, fits, score, exact) => { const prev = found.get(id); if (!prev || prev.score < score) found.set(id, { id, conf: Math.round(conf), fits, score, exact: !!exact }); };
    const add = (raw, conf, bonus = 0) => {
      let s = raw.toUpperCase().replace(/[^A-Z0-9\-/_]/g, '').replace(/^[-/_]+|[-/_]+$/g, '');
      if (s.length < 2 || s.length > 20) return;
      const k = knownId(s);
      if (k) put(k.id, conf, true, conf + bonus + (k.fuzzy ? 8 : 18), !k.fuzzy && !k.padded); // exact: a known prefix and every digit read as they are
      if (!/[0-9]/.test(s)) return;
      const fitted = fitShape(s, target), id = fitted || s, fits = !!fitted;
      put(id, conf, fits, conf + bonus + (fits ? 15 : 0) + (/[A-Z]/.test(id) ? 2 : 0));
    };
    for (const r of results || []) {
      const good = (r.words || []).filter((w) => w.conf >= 20);
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
      const score = Math.min(dens, 0.4) * Math.sqrt(box) * Math.min(1, aspect / 2.5) / (1 + (focus ? 6 : 3) * d);
      if (!best || score > best.score) best = { x: bx, y: by, w: bw, h: bh, score: Math.round(score * 100) / 100 };
    }
    return best;
  }

  const api = { parseCsv, companiesFromCsv, utmForward, analyzeRoute, autoLinks, distM, deflection, idCandidates, fitShape, knownId, setPolePrefixes, buildExif, insertExif, readExif, parseExifDate, crc32, makeZip, makeZipParts, readZip,
    buildKml, buildDxf, buildCsv, roadsFromOverpass, overpassQuery, nextPoleId, safeName, xmlEsc, blockName, findIdBox };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PoleCore = api;
})(typeof self !== 'undefined' ? self : this);
