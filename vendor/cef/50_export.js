/* ---------- screen drawing: primitives to SVG (y flipped) ---------- */
function svgPrims(prims) {
  const st = {}, fl = {}, tx = [];
  for (const p of prims) {
    if (p.k === 'pl') { let d = 'M' + r3(p.pts[0][0]) + ' ' + r3(-p.pts[0][1]); for (let i = 1; i < p.pts.length; i++) d += 'L' + r3(p.pts[i][0]) + ' ' + r3(-p.pts[i][1]); if (p.close) d += 'Z'; st[p.lay] = (st[p.lay] || '') + d; }
    else if (p.k === 'ci') { const r = r3(p.r); st[p.lay] = (st[p.lay] || '') + 'M' + r3(p.c[0] - p.r) + ' ' + r3(-p.c[1]) + 'a' + r + ' ' + r + ' 0 1 0 ' + r3(2 * p.r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + r3(-2 * p.r) + ' 0Z'; }
    else if (p.k === 'ar') { const a0 = p.a0 * D2R, a1 = p.a1 * D2R, sw = ((p.a1 - p.a0) % 360 + 360) % 360; st[p.lay] = (st[p.lay] || '') + 'M' + r3(p.c[0] + p.r * Math.cos(a0)) + ' ' + r3(-(p.c[1] + p.r * Math.sin(a0))) + 'A' + r3(p.r) + ' ' + r3(p.r) + ' 0 ' + (sw > 180 ? 1 : 0) + ' 0 ' + r3(p.c[0] + p.r * Math.cos(a1)) + ' ' + r3(-(p.c[1] + p.r * Math.sin(a1))); }
    else if (p.k === 'fl') fl[p.lay] = (fl[p.lay] || '') + 'M' + p.pts.map(q => r3(q[0]) + ' ' + r3(-q[1])).join('L') + 'Z';
    else tx.push(p);
  }
  let o = '';
  for (const l in SLAY) { if (fl[l]) o += '<path class="F-' + l + '" d="' + fl[l] + '"/>'; if (st[l]) o += '<path class="L-' + l + '" d="' + st[l] + '"/>'; }
  for (const l in LAYERS) if (fl[l]) o += '<path class="F-' + l + '" d="' + fl[l] + '"/>';
  for (const l in LAYERS) if (st[l]) o += '<path class="L-' + l + '" d="' + st[l] + '"/>';
  for (const p of tx) o += '<text class="T-' + p.lay + (p.b ? ' tb' : '') + '" transform="' + (p.m ? 'matrix(' + [p.m[0], -p.m[1], -p.m[2], p.m[3], p.p[0], -p.p[1]].map(v => Math.round(v * 1e4) / 1e4).join(' ') + ')' : 'translate(' + r3(p.p[0]) + ' ' + r3(-p.p[1]) + ')' + (p.a ? ' rotate(' + r3(-p.a) + ')' : '')) + '" font-size="' + r3(p.h / CAP) + '" text-anchor="' + (p.al === 'c' ? 'middle' : p.al === 'r' ? 'end' : 'start') + '">' + esc(p.s) + '</text>';
  return o;
}
function layerCSS() {
  let c = 'svg text{font-family:Arial,Helvetica,"Liberation Sans",sans-serif}.tb{font-weight:700}';
  const ALL = Object.assign({}, SLAY, LAYERS);
  for (const k in ALL) { const L = ALL[k], w = clamp(L[5] * 3.6, 0.8, 2.3); c += '.L-' + k + '{fill:none;stroke:var(' + L[3] + ');stroke-width:' + w + 'px;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round' + (L[2] ? ';stroke-dasharray:7 4' : '') + '}.F-' + k + '{fill:var(' + L[3] + ');stroke:none}.T-' + k + '{fill:var(' + L[3] + ')}'; }
  return c;
}

/* ---------- where the site sits on the map ---------- */
function utm51(lat, lon) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
  const Aa = a / (1 + n) * (1 + n2 / 4 + n4 / 64), al = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16, 13 * n2 / 48 - 3 * n3 / 5, 61 * n3 / 240];
  const ph = lat * D2R, la = (lon - 123) * D2R, e = Math.sqrt(f * (2 - f));
  const t = Math.sinh(Math.atanh(Math.sin(ph)) - e * Math.atanh(e * Math.sin(ph)));
  const xi = Math.atan2(t, Math.cos(la)), eta = Math.atanh(Math.sin(la) / Math.sqrt(1 + t * t));
  let x = xi, y = eta; for (let j = 1; j <= 3; j++) { x += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); y += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  return [500000 + k0 * Aa * y, k0 * Aa * x];
}
function geo(S) {
  const si = S.site, lat = parseFloat(si.lat), lon = parseFloat(si.lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  let ax = 0, ay = 0, at = 'BOTTOM-LEFT CORNER OF THE PERIMETER', fallback = false;
  if (si.anchor === 'tower') { const t = S.els.find(e => TYPES[e.t].g === 'tower'); if (t) { ax = t.x; ay = t.y; at = 'TOWER CENTRE'; } else fallback = true; }
  else if (si.anchor === 'pt' && isFinite(parseFloat(si.ax)) && isFinite(parseFloat(si.ay))) { ax = +si.ax; ay = +si.ay; at = 'THE SITE PIN, ' + f2(ax) + ' m FROM THE LEFT SIDE AND ' + f2(ay) + ' m FROM THE BOTTOM SIDE OF THE PERIMETER'; }      /* (14 Nov 16:05) the box moved round the site pin on the map */
  const b = num(si.bearing, 0) * D2R, a = 6378137, e2 = 0.00669437999014, sp = Math.sin(lat * D2R), M = a * (1 - e2) / Math.pow(1 - e2 * sp * sp, 1.5), N = a / Math.sqrt(1 - e2 * sp * sp);
  const ll = (x, y) => { const dx = x - ax, dy = y - ay, E = dx * Math.cos(b) + dy * Math.sin(b), Nn = -dx * Math.sin(b) + dy * Math.cos(b); return [lat + Nn / M / D2R, lon + E / (N * Math.cos(lat * D2R)) / D2R]; };
  return { lat, lon, ax, ay, at, fallback, ll, utm: utm51(lat, lon), zoneOk: lon >= 120 && lon <= 126 };
}
function dms(v, pos, neg) { if (!isFinite(v)) return ''; const h = v < 0 ? neg : pos; v = Math.abs(v); let d = Math.floor(v), m = Math.floor((v - d) * 60), s = (v - d - m / 60) * 3600; if (s >= 59.995) { s = 0; m++; } if (m >= 60) { m = 0; d++; } return d + '°' + String(m).padStart(2, '0') + "'" + s.toFixed(2).padStart(5, '0') + '"' + h; }
function coordText(S) { const la = parseFloat(S.site.lat), lo = parseFloat(S.site.lon); return isFinite(la) && isFinite(lo) ? dms(la, 'N', 'S') + ' ' + dms(lo, 'E', 'W') : ''; }
function isoDate() { const d = new Date(), p = v => String(v).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
const SIDE = { S: 'BOTTOM', N: 'TOP', W: 'LEFT', E: 'RIGHT' };
const FENCE = { chb: 'CONCRETE (CHB) WALL', cyc: 'CYCLONE WIRE', barb: 'BARBED WIRE' };

/* ---------- sheets: A3 landscape in millimetres, origin at the bottom-left corner ---------- */
/* The set and the frame follow the hand-made CEF plans: cover page, table of contents, legend, then the drawings.
   On a drawing sheet the view stands in one frame on the left; a strip on the right carries the title block at its foot, and the room above it takes the table of that sheet. */
const SH = { W: 420, H: 297, M: 8, TB: 141, SW: 92, GAP: 4 };
const FR = { x0: SH.M, x1: SH.W - SH.M - SH.SW - SH.GAP, y0: SH.M, y1: SH.H - SH.M, sx0: SH.W - SH.M - SH.SW, sx1: SH.W - SH.M };
const PAN = { x: FR.sx0 + 2, w: SH.SW - 4, y1: FR.y1 - 2.5, y0: FR.y0 + SH.TB + 2 };       /* the room above the title block */
const AREA = { x0: FR.x0 + 3, x1: FR.x1 - 3, y0: FR.y0 + 3, y1: FR.y1 - 3, tz: 19 };         /* the drawing area. tz: the height the view title takes at its foot */
const PLAN_KIND = 'AS-PLAN';
/* Logos on the cover and in the title block, as on the hand-made plans: the vendor's own and the client's. The sheets only know the size of each picture and where it goes;
   the picture itself is kept by whoever shows or exports the sheets, under the ids logo_vendor and logo_client. No logo is drawn by this code: in the app the client's is a file of the app, and each vendor sets its own. */
let LOGOS = {};
function logoAt(images, key, x, y, w, h) { const L = LOGOS[key]; if (!images || !L || !(L.w > 0) || !(L.h > 0)) return false; const k = Math.min(w / L.w, h / L.h), iw = L.w * k, ih = L.h * k; images.push({ id: 'logo_' + key, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih, file: 'logos/' + key + '_logo.png', logo: 1 }); return true; }
const SCALES = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000];
const DSCALES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];          /* details are drawn larger */
function fitView(make, bw, bh, scales, mm) { let r = null; for (const N of scales || SCALES) { const s = 1000 / N, prims = make((mm || 2.4) / s, [bw / s, bh / s]), bb = primBox(prims); r = { prims, N, s, bb }; if ((bb[2] - bb[0]) * s <= bw && (bb[3] - bb[1]) * s <= bh) break; } return r; }
/* where a view lands in a box: a point of the view (in its own units) goes to [dx + x * s, dy + y * s] on the sheet */
function viewAt(v, box) { const w = (v.bb[2] - v.bb[0]) * v.s, h = (v.bb[3] - v.bb[1]) * v.s; return { dx: (box[0] + box[2]) / 2 - w / 2 - v.bb[0] * v.s, dy: (box[1] + box[3]) / 2 - h / 2 - v.bb[1] * v.s }; }
function placeView(G, v, box) { const t = viewAt(v, box), P = xfPrims(v.prims, v.s, 0, t.dx, t.dy); for (const p of P) G.p.push(p); return P; }
function fitTx(G, p, s, h, maxW, lay, al, b) { const w = textW(s, h) * (b ? 1.08 : 1); if (w > maxW && w > 0) h *= maxW / w; G.tx(p, s, h, lay, al, 0, b); }
const picFile = n => 'photos/photo_' + String(n).padStart(2, '0') + '.jpg';      /* beta 4.1 */
function sheetFrame(S, G, o) {
  const si = S.site, x0 = FR.x0, x1 = FR.x1, y0 = FR.y0, y1 = FR.y1, s0 = FR.sx0, s1 = FR.sx1, up = v => String(v || '').trim().toUpperCase();
  G.pl([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 'fr', 1); G.pl([[s0, y0], [s1, y0], [s1, y1], [s0, y1]], 'fr', 1);
  /* the title block, from the foot of the strip upward */
  let y = y0; const row = h => { y += h; G.pl([[s0, y], [s1, y]], 'fr'); return y - h; }, cap = (x, yb, h, s) => G.tx([x + 1.4, yb + h - 2.6], s, 1.4, 'dm'), val = (x, yb, s, w, hh) => { if (s) fitTx(G, [x + 1.4, yb + 1.9], s, hh || 2.5, w - 2.8, 'tx', 'l', true); }, vl = (x, ya, yb) => G.pl([[x, ya], [x, yb]], 'fr');
  let b = row(8); cap(s0, b, 8, 'DWG. No.'); vl(s0 + 50, b, b + 8); cap(s0 + 50, b, 8, 'SHEET No.'); val(s0 + 50, b, o.n + ' OF ' + o.N, 40);
  b = row(8); cap(s0, b, 8, 'DATE'); val(s0, b, isoDate(), 30); vl(s0 + 30, b, b + 8); cap(s0 + 30, b, 8, 'ISSUE No.'); vl(s0 + 50, b, b + 8); cap(s0 + 50, b, 8, 'SCALE AT A3'); val(s0 + 50, b, o.scale, 40);
  b = row(42);
  { const L = [[up(si.link), 2.6, 0], [[up(si.id), up(si.name)].filter(Boolean).join(' '), 3.2, 1], ['CABLE ENTRANCE FACILITY', 2.8, 0], [up(o.sheet), 2.8, 1], [PLAN_KIND, 2.6, 0]].filter(q => q[0]), pitch = 36 / Math.max(1, L.length); L.forEach((q, i) => fitTx(G, [(s0 + s1) / 2, b + 42 - 3 - pitch * (i + 0.5) - q[1] / 2], q[0], q[1], SH.SW - 6, 'tx', 'c', !!q[2])); }
  b = row(10); cap(s0, b, 10, 'COORDINATES (WGS84)'); val(s0, b, coordText(S), SH.SW, 2.4);
  b = row(14); ['PREPARED BY', 'CHECKED BY', 'APPROVED BY'].forEach((s, i) => { if (i) vl(s0 + 30 * i, b, b + 14); cap(s0 + 30 * i, b, 14, s); }); [si.by, si.chk, si.apr].forEach((v, i) => val(s0 + 30 * i, b + 1.6, up(v), 30, 2.3));      /* (22:24) the three names: si.by, si.chk, si.apr */
  b = row(20); logoAt(o.images, 'client', s0 + 3, b + 2, SH.SW - 6, 16);
  b = row(21); for (let i = 1; i <= 4; i++) G.pl([[s0, b + 21 - 5 - (i - 1) * 4], [s1, b + 21 - 5 - (i - 1) * 4]], 'fr'); vl(s0 + 54, b, b + 21); vl(s0 + 74, b, b + 21);
  [['REVISIONS', 27], ['DATE', 64], ['SIGN', 82]].forEach(q => G.tx([s0 + q[1], b + 21 - 3.6], q[0], 1.6, 'dm', 'c'));
  b = row(18); { const has = logoAt(o.images, 'vendor', s0 + 3, b + 2, SH.SW - 6, 14); if (!has && si.org) fitTx(G, [(s0 + s1) / 2, b + 6.2], up(si.org), 3.2, SH.SW - 8, 'tx', 'c', true); }
  /* the title of the view: at the foot of the drawing, a circle and the name underlined, the scale under it */
  if (o.view) {
    const cx = AREA.x0 + 7.5, cy = AREA.y0 + 8.5, r = 6.5, tx = cx + r + 3, w = textW(o.view, 5);
    G.ci([cx, cy], r, 'fr'); G.pl([[cx - r - 2.5, cy], [tx + w + 5, cy]], 'fr'); G.pl([[cx + r + 0.4, cy - 0.9], [tx + w + 5, cy - 0.9]], 'fr');
    G.tx([tx, cy + 1.7], o.view, 5, 'tx'); if (o.scale) { G.tx([tx, cy - 5.2], 'SCALE:', 2.3, 'tx'); G.tx([tx + 15, cy - 5.2], o.scale, 2.3, 'tx'); }
  }
  G.tx([s1, y0 - 2.6], 'G-eSAA CEF-PLAN DEMO - GENERIC FRAME, NOT THE OFFICIAL TEMPLATE', 1, 'dm', 'r');      /* (22:24) very small, under the frame at the lower right */
  if (S.sample) G.tx([AREA.x0, AREA.y1 - 3.4], 'SAMPLE DATA - NOT A REAL SITE', 2.6, 'tp', 'l', 0, true);
}
function drawTable(G, x, yTop, cols, rows, title, o) {
  o = o || {}; const W = cols.reduce((s, c) => s + c.w, 0), rh = o.rh || 6, hh = o.hh || 7, th = o.th || 2; let y = yTop; const ys = [y];
  if (title) { G.tx([x + W / 2, y - hh / 2 - th * 0.6], title, th * 1.2, 'tx', 'c', 0, true); y -= hh; ys.push(y); }
  const yCols = y, line = (cells, bold, h) => { let cx = x; cells.forEach((s, i) => { const c = cols[i], al = bold ? 'c' : (c.al || 'l'), px = al === 'c' ? cx + c.w / 2 : al === 'r' ? cx + c.w - 1.5 : cx + 1.5; if (s !== '' && s != null) fitTx(G, [px, y - h / 2 - th * 0.475], String(s), bold ? Math.max(Math.min(th, 1.8), th * 0.95) : th, c.w - (th < 1.9 ? 1.6 : 2.4), 'tx', al, bold); cx += c.w; }); y -= h; ys.push(y); };
  line(cols.map(c => c.t), true, hh); for (const r of rows) line(r, false, rh);
  for (const yy of ys) G.pl([[x, yy], [x + W, yy]], 'fr');
  G.pl([[x, yTop], [x, y]], 'fr'); G.pl([[x + W, yTop], [x + W, y]], 'fr');
  let cx = x; cols.forEach((c, i) => { if (i) G.pl([[cx, yCols], [cx, y]], 'fr'); cx += c.w; });
  return y;
}
function para(G, x, y, lines, h, maxW, lay, bold) { const n = Math.max(8, Math.floor(maxW / (h * 0.93))); for (const ln of lines) for (const w of wrap(ln, n)) { y -= h * 1.65; fitTx(G, [x, y], w, h, maxW, lay, 'l', bold); } return y; }
function heading(G, x, y, s, w, h) { h = h || 2.3; G.tx([x, y - h * 1.3], s, h, 'tx', 'l', 0, true); G.pl([[x, y - h * 1.9], [x + (w || 116), y - h * 1.9]], 'fr'); return y - h * 2.2; }
function legend(G, x, y, S, w, h) {
  h = h || 1.9; y = heading(G, x, y, 'LEGEND', w, h * 1.2);
  for (const [lay, s] of [['bl', 'FENCE / BUILDING LINE'], ['tw', 'TOWER'], ['eq', 'EXISTING EQUIPMENT'], ['ld', 'CABLE LADDER'], ['pp', 'PROPOSED ITEM'], ['ae', 'FOC AE (AERIAL)'], ['ug', 'FOC UG (UNDERGROUND, LADDER)'], ['fh', 'FOC BEHIND SOMETHING'], ['hp', 'BELOW GROUND (CONDUIT, PIT, ELBOW), WHERE ITS DEPTH IS DRAWN'], ['ln', 'LENGTH OF A LEG OF THE CABLE']].concat(S && S.els.some(e => e.t === 'cabin' && e.inside && (e.inside.els || []).some(q => q.t === 'rack' || q.t === 'odf')) ? [['nd', 'INSIDE A CABIN (RACK, ODF)']] : [], [['ph', 'PHOTO POSITION AND DIRECTION'], ['lot', 'PART DETAIL: ITS FRAME AND WHERE IT IS ON THE VIEW']])) { y -= h * 2.4; G.pl([[x + 1, y + h * 0.45], [x + 15, y + h * 0.45]], lay); if (lay === 'ln') G.tx([x + 8, y + h * 0.9], '10.0m', h * 0.9, 'ln', 'c'); G.tx([x + 19, y], s, h, 'tx'); }
  return y;
}
/* The detail drawings of a plan, laid out in pages. Each one has its title and its place on the page: x from the left, y from the top, w and h, all as parts of the drawing area.
   A cabin gives its floor plan and its inside view. An outdoor cabinet that holds rack items gives itself with the door open. */
function detailPages(S) {
  const cab = [], odc = [], pages = [], at = (d, x, y, w, h) => Object.assign({ x, y, w, h }, d);
  for (const d of details(S)) {
    if (d.k === 'cabin') { const R = syncRoom(d.el.inside, d.el); cab.push([{ title: d.title + ' - FLOOR PLAN', iso: 0, make: (th, box) => buildTop(R, { th, box, dims: true, labels: true }).prims }, { title: d.title + ' - ISOMETRIC', iso: 1, make: (th, box) => buildIso(R, { th, box }).prims }]); }
    else odc.push({ title: d.title, iso: 1, make: (th, box) => buildIso(S, { th, box, only: d.el.id, clip: 1 }).prims });
  }
  if (cab.length === 1 && odc.length) {                 /* one cabin and some cabinets: the cabin on the left, the cabinets down the right side, which suits their tall shape */
    const o = odc.splice(0, 2), c = cab.pop(), pg = [at(c[1], 0, 0, 0.62, 0.62), at(c[0], 0, 0.62, 0.62, 0.38)];
    o.forEach((d, i) => pg.push(at(d, 0.62, i / o.length, 0.38, 1 / o.length))); pages.push(pg);
  }
  const rows = cab.map(c => [[c[0], 0.4], [c[1], 0.6]]); for (let i = 0; i < odc.length; i += 3) rows.push(odc.slice(i, i + 3).map(d => [d, 1]));
  for (let i = 0; i < rows.length; i += 2) {
    const R = rows.slice(i, i + 2), pg = [];
    R.forEach((row, ri) => { const sum = row.reduce((t, q) => t + q[1], 0); let x = 0; for (const q of row) { pg.push(at(q[0], x, ri / R.length, q[1] / sum, 1 / R.length)); x += q[1] / sum; } });
    pages.push(pg);
  }
  return pages;
}
/* what is mounted where: every rack and cabinet with its items, top unit first */
function rackRows(S) {
  const rows = [], add = (M, pre) => { for (const h of M.els) if (h.t === 'odc' || h.t === 'rack') for (const q of rackSlots(M, h).slice().sort((a, b) => (a.bay || 0) - (b.bay || 0) || b.u - a.u)) rows.push([pre + elLabel0(M, h) + (bayN(h) > 1 ? ' RACK ' + (q.bay + 1) : ''), elLabel0(M, q.e) + (q.e.t === 'odf' && q.e.size && !q.e.name ? ' ' + q.e.size : ''), uText(q), q.e.st === 'P' ? 'PROP.' : 'EXIS.']); };
  add(S, ''); for (const e of S.els) if (e.t === 'cabin' && e.inside && Array.isArray(e.inside.els)) add(e.inside, elLabel0(S, e) + ' / ');
  return rows;
}

/* ---------- part details: the riser pole, the riser pipe at the tower end, the service box ----------
   Enlarged and not to scale, as on the hand-made plans, with the name of every part. Drawn in millimetres on the sheet, from the bottom-left corner of their frame. */
function dEll(c, rx, ry, a0, a1) { const n = Math.max(6, Math.round(Math.abs(a1 - a0) / 15)), P = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * D2R; P.push([c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a)]); } return P; }
/* an upright tube: c the middle of its foot, r its radius, h its height; fill: the layer to fill it with */
function dTube(G, c, r, h, lay, fill) {
  const ry = r * 0.45, top = [c[0], c[1] + h];
  if (fill) G.fl(dEll(c, r, ry, 180, 360).concat(dEll(top, r, ry, 0, 180)), fill);
  G.pl(dEll(top, r, ry, 0, 360), lay, 1); G.pl(dEll(c, r, ry, 180, 360), lay); G.pl([[c[0] - r, c[1]], [c[0] - r, c[1] + h]], lay); G.pl([[c[0] + r, c[1]], [c[0] + r, c[1] + h]], lay);
}
/* a block seen from above at 30 degrees: c the middle of its base, w along the axis that goes up to the right, d along the one that goes up to the left */
function dBlock(G, c, w, d, h, lay) {
  const P = (i, j, z) => [c[0] + (i * w - j * d) * 0.433, c[1] + (i * w + j * d) * 0.25 + z], T = [P(-1, -1, h), P(1, -1, h), P(1, 1, h), P(-1, 1, h)];
  G.pl(T, lay, 1); G.pl([P(-1, 1, 0), P(-1, -1, 0), P(1, -1, 0)], lay); G.pl([P(-1, -1, 0), T[0]], lay); G.pl([P(1, -1, 0), T[1]], lay); G.pl([P(-1, 1, 0), T[3]], lay);
  return P;
}
function dArrow(G, from, p, lay) { const dx = from[0] - p[0], dy = from[1] - p[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, s = 2.1, w = 0.36; G.pl([p, from], lay); G.fl([p, [p[0] + ux * s - uy * w, p[1] + uy * s + ux * w], [p[0] + ux * s + uy * w, p[1] + uy * s - ux * w]], lay); }
/* the names of the parts: a column of text on the right, each with a short level line and an arrow to its part. The rows keep the order of their parts, top to bottom, so no two arrows cross. */
function dNotes(G, x, yTop, yBot, notes, h) {
  const N = notes.filter(Boolean).sort((a, b) => b.to[1] - a.to[1]), pitch = h * 1.4, gap = h * 1.1; let need = 0; for (const n of N) need += n.s.length * pitch + gap;
  let y = Math.min(yTop, Math.max(yBot + need, (N.length ? N[0].to[1] : yTop) + h * 2)); const Y = [];
  for (const n of N) { y = Math.min(y, n.to[1] + (n.s.length - 1) * pitch / 2 + h * 3); Y.push(y); y -= n.s.length * pitch + gap; }
  let lift = Math.max(0, yBot - (y + gap));                                              /* the column ran out under the frame: every row moves up, as far as the rows above let it */
  for (let i = N.length - 1; i >= 0; i--) { const cap = i ? Y[i - 1] + lift - N[i - 1].s.length * pitch - gap : yTop; Y[i] = Math.min(Y[i] + lift, i ? Infinity : yTop); }
  for (let i = 1; i < N.length; i++) Y[i] = Math.min(Y[i], Y[i - 1] - N[i - 1].s.length * pitch - gap);
  N.forEach((n, i) => { const yy = Y[i]; n.s.forEach((t, k) => G.tx([x, yy - h - k * pitch], t, h, 'tx')); const ly = yy - h * 0.55; G.pl([[x - 1, ly], [x - 4, ly]], 'tx'); dArrow(G, [x - 4, ly], n.to, 'tx'); });
}
/* the quadplex plug on the top of a 114.3 mm pipe, the four 32 mm sub-ducts that come through it and their simplex duct plugs. c: the middle of the top of the pipe, r: its radius */
function dPlugs(G, c, r) {
  dTube(G, c, r * 1.14, r * 0.6, 'tx', 'tx');
  const t = [c[0], c[1] + r * 0.6], q = r * 0.4, hs = r * 1.15, S4 = [[-q, q * 0.42], [q, q * 0.42], [-q, -q * 0.42], [q, -q * 0.42]];
  for (const o of S4) { const b = [t[0] + o[0], t[1] + o[1]]; dTube(G, b, r * 0.33, hs, 'tx'); G.fl(dEll([b[0], b[1] + hs], r * 0.33, r * 0.15, 0, 360), 'tx'); G.ci([b[0], b[1] + hs + r * 0.36], r * 0.2, 'tx'); }
  return { collar: [c[0] + r * 1.14, c[1] + r * 0.3], sub: [t[0] + q + r * 0.33, t[1] + hs * 0.45], plug: [t[0] + q + r * 0.2, t[1] + q * 0.42 + hs + r * 0.36], out: [t[0] - q, t[1] + q * 0.42 + hs + r * 0.56] };
}
/* a spare pipe closed with a mechanical blank duct plug: its top, with the cross of the plug */
function dBlank(G, c, r, lay) { G.pl(dEll(c, r, r * 0.45, 0, 360), lay, 1); G.pl(dEll(c, r * 0.55, r * 0.25, 0, 360), lay, 1); G.pl([[c[0] - r, c[1]], [c[0] + r, c[1]]], lay); G.pl([[c[0], c[1] - r * 0.45], [c[0], c[1] + r * 0.45]], lay); }
function dTitle(G, w, s) { G.pl([[0, 0], [w, 0], [w, 8], [0, 8]], 'lot', 1); fitTx(G, [2, 2.7], s, 2.6, w - 16, 'tx', 'l', true); G.tx([w - 2, 2.9], 'N T S', 1.8, 'dm', 'r'); }
/* beta 4.2 (22:24): which part details go on the isometric sheet. S.site.pd: { riser, exit, sbox }, each true or false. Not set: the riser pole and the riser
   pipe detail are left out, the service box detail shows, as before. */
const PART_DETAILS = [['riser', 'Riser pole detail', 0], ['exit', 'Riser pipe detail', 0], ['sbox', 'Service box detail', 1]];
function pdOn(S, k) { const p = S.site && S.site.pd, d = PART_DETAILS.find(q => q[0] === k); return p && p[k] != null ? !!p[k] : !d || !!d[2]; }
function partDetails(S, rg) {
  const out = [], mm = PVC_MM + 'mm';
  const r0 = rg.risers.find(r => r.pole);
  if (r0) {
    const pole = r0.pole, pl = pole.st === 'P' ? 'pp' : 'ex', lp = rg.loops.find(q => Math.hypot(q.at[0] - pole.x, q.at[1] - pole.y) < 0.8), jn = rg.joins.find(q => q.pole === pole), clo = !!jn && (jn.auto || !jn.none), W = 66, H = 124;
    out.push({ key: 'riser', w: W, h: H, at: [r0.at[0], r0.at[1], r0.g + 1.2], draw: G => {
      const cx = 15, yg = 21, bh = 6, px = cx + 7.6, pr = 2.7, yb = yg + bh + 0.6, giT = yb + 26, ugT = giT + 20, lpY = H - 30, top = H - 3;
      G.pl([[0, 0], [W, 0], [W, H], [0, H]], 'lot', 1); dTitle(G, W, 'RISER POLE DETAIL');
      dBlock(G, [cx + 3, yg], 24, 22, bh, pl);
      { const brk = yb + 14, zz = (x0, x1, y) => [[x0, y], [x0 + (x1 - x0) * 0.35, y + 0.9], [x0 + (x1 - x0) * 0.65, y - 0.9], [x1, y]];      /* the pole, with a break: it is not drawn at its full height */
        G.pl([[cx - 4.6, yb - 0.4], [cx - 4.5, brk]], pl); G.pl([[cx - 4.45, brk + 2], [cx - 3.5, top]], pl); G.pl([[cx + 4.6, yb - 0.4], [cx + 4.5, brk]], pl); G.pl([[cx + 4.45, brk + 2], [cx + 3.5, top]], pl);
        G.pl(zz(cx - 5.4, cx + 5.4, brk), pl); G.pl(zz(cx - 5.4, cx + 5.4, brk + 2), pl); G.pl(dEll([cx, top], 3.5, 1.5, 0, 360), pl, 1); }
      dTube(G, [px, yb], pr, giT - yb, 'pp', 'tx');                                 /* the G.I. pipe, dark as on the hand-made plans, and the U-guard above it */
      dTube(G, [px, giT], pr, ugT - giT, 'pp');
      const K = dPlugs(G, [px, ugT], pr), N = [];
      dBlank(G, [cx + 13.6, yg + bh - 1.2], pr, 'pp');
      if (lp) { for (const r of [8.6, 7.7, 6.8]) G.ci([cx, lpY], r, 'pp'); G.pl([K.out, [K.out[0] - 0.6, K.out[1] + 4], [cx + 6, lpY - 10], [cx + 5.2, lpY - 6.9]], 'ae'); N.push({ s: ['LOOP HOLDER W/', f2(lp.len) + 'm LOOP'], to: [cx + 8.3, lpY + 2.2] }); }
      else G.pl([K.out, [K.out[0] - 0.6, K.out[1] + 5], [cx + 5, top - 8]], 'ae');
      if (clo) { const c = [cx - 8.6, lpY + 10.5]; dTube(G, c, 2.3, 9, 'pp'); G.pl(dEll([c[0], c[1] + 9], 2.3, 2.6, 0, 180), 'pp'); N.push({ s: ['CLOSURE'], to: [c[0] + 2.3, c[1] + 6] }); }
      N.push({ s: ['SIMPLEX DUCT-PLUG 32mm', 'W/ GUIDE ROPE'], to: K.plug }, { s: ['SUB-DUCT 4 x 32mm'], to: K.sub }, { s: ['QUADPLEX PLUG'], to: K.collar }, { s: ['U-GUARD'], to: [px + pr, (giT + ugT) / 2] }, { s: ['G.I. PIPE ' + mm], to: [px + pr, yb + (giT - yb) * 0.55] }, { s: ['MECHANICAL BLANK DUCT', 'PLUG 114mm (SPARE)'], to: [cx + 13.6 + pr * 0.8, yg + bh - 1.2] }, { s: ['CONCRETE ENCASEMENT'], to: [cx + 9.5, yg + 1.2] });
      dNotes(G, 35, H - 4, 10, N, 2);
    } });
  }
  const x0 = rg.exits.find(x => x.st === 'P');
  if (x0) {
    const W = 66, H = 70;
    out.push({ key: 'exit', w: W, h: H, at: [x0.at[0], x0.at[1], x0.g + x0.h], draw: G => {
      const c = [17, 21], bh = 8, pr = 3.2, pb = [c[0] - 3.6, c[1] + bh + 0.9];
      G.pl([[0, 0], [W, 0], [W, H], [0, H]], 'lot', 1); dTitle(G, W, 'RISER PIPE DETAIL');
      dBlock(G, c, 26, 20, bh, 'pp'); dBlank(G, [c[0] + 6.2, c[1] + bh + 0.6], pr * 0.9, 'pp');
      dTube(G, pb, pr, 15, 'pp', 'tx'); const K = dPlugs(G, [pb[0], pb[1] + 15], pr);
      G.pl([K.out, [K.out[0] - 0.5, K.out[1] + 5], [K.out[0] + 2.5, K.out[1] + 9.5]], 'ug');
      dNotes(G, 35, H - 4, 10, [{ s: ['SIMPLEX DUCT-PLUG 32mm', 'W/ GUIDE ROPE'], to: K.plug }, { s: ['QUADPLEX PLUG,', 'SUB-DUCT 4 x 32mm'], to: K.collar }, { s: ['G.I. PIPE ' + mm], to: [pb[0] + pr, pb[1] + 7] }, { s: ['MECHANICAL BLANK DUCT', 'PLUG 114mm (SPARE)'], to: [c[0] + 6.2 + pr * 0.8, c[1] + bh + 0.6] }, { s: ['CONCRETE ENCASEMENT'], to: [c[0] + 8, c[1] + 2] }], 2);
    } });
  }
  const sb = S.els.find(e => e.t === 'sbox' && e.st === 'P');
  if (sb) {
    const W = 84, H = 62, ty = SBOX[sb.ty];
    out.push({ key: 'sbox', w: W, h: H, at: [sb.x, sb.y, groundZ(S, [sb.x, sb.y])], draw: G => {
      const c = [23.5, 37], bw = 28, bd = 22, dp = 14, P = (i, j, z) => [c[0] + (i * bw - j * bd) * 0.433, c[1] + (i * bw + j * bd) * 0.25 + z], Q = (i, j, z) => P(i * 0.86, j * 0.84, z);
      G.pl([[0, 0], [W, 0], [W, H], [0, H]], 'lot', 1); dTitle(G, W, 'SERVICE BOX DETAIL');
      G.pl([P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)], 'pp', 1); G.pl([Q(-1, -1, 0), Q(1, -1, 0), Q(1, 1, 0), Q(-1, 1, 0)], 'pp', 1);      /* the frame at ground level; below it the box, seen through the ground */
      for (const [i, j] of [[-1, -1], [1, -1], [-1, 1]]) G.pl([P(i, j, 0), P(i, j, -dp)], 'hp'); G.pl([P(-1, 1, -dp), P(-1, -1, -dp), P(1, -1, -dp)], 'hp');
      G.pl([Q(1, 1, 0), Q(1, 1, -dp + 2)], 'pp'); G.pl([Q(-1, 1, -dp + 2), Q(1, 1, -dp + 2), Q(1, -1, -dp + 2)], 'pp');                                /* the far corner of the inside, and the floor along the two far walls */
      const f = Q(0.15, 0.15, -dp + 2.6); G.pl(dEll(f, 3.4, 1.5, 0, 360), 'pp', 1); for (const o of [[-1.2, 0], [1.2, 0], [0, 0.55], [0, -0.55]]) G.ci([f[0] + o[0], f[1] + o[1]], 0.28, 'pp');      /* the sump pit */
      const e1 = Q(0.35, 1, -5.2), e2 = Q(-0.3, 1, -5.2);                                                                                           /* the two conduits come in through the far left wall */
      for (const e of [e1, e2]) { G.pl(dEll(e, 1.5, 2.3, 0, 360), 'pp', 1); for (const k of [-2.3, 2.3]) G.pl([[e[0], e[1] + k], [e[0] - 7.5, e[1] + k + 4.33]], 'hp'); }
      G.fl(dEll(e1, 1.05, 1.6, 0, 360), 'tx'); G.pl([[e2[0] - 1.1, e2[1] - 1.6], [e2[0] + 1.1, e2[1] + 1.6]], 'pp'); G.pl([[e2[0] - 1.1, e2[1] + 1.6], [e2[0] + 1.1, e2[1] - 1.6]], 'pp');
      const pi = Q(1, 0.2, -4.6); G.pl([[pi[0], pi[1] + 1.4], [pi[0] - 1.6, pi[1] + 0.5], [pi[0] - 1.6, pi[1] - 1.1], [pi[0], pi[1] - 0.2]], 'pp');                    /* the pulling-in iron on the far right wall */
      dNotes(G, 51, H - 4, 10, [{ s: ['2 RUN PVC CONDUIT', mm + ', CONCRETE', 'ENCASED'], to: [e2[0] - 5, e2[1] + 5.2] }, { s: ['QUADPLEX PLUG WITH', 'SUB-DUCTS AND PLUGS'], to: [e1[0] + 1, e1[1] + 0.6] }, { s: ['BLANK DUCT PLUG', '(SPARE RUN)'], to: [e2[0] + 1.2, e2[1] - 0.6] }, { s: ['PULLING-IN IRON'], to: [pi[0] - 0.4, pi[1]] }, { s: ['SUMP PIT'], to: [f[0] + 3.2, f[1]] }, { s: ['SERVICE BOX' + (ty ? ' ' + sb.ty : ''), ty ? ty.inn + ' mm' : ''].filter(Boolean), to: P(0.75, -1, -1.2) }], 2);
    } });
  }
  return out;
}
/* Where the part details go on the isometric sheet: in the room the view leaves at the edges of the drawing, each as near to its item as it finds room, and tied to it with dashed lines.
   P: everything already on the sheet, as primitives in millimetres. The details shrink a little before one is left out; what finds no room is returned. */
const detBlock = k => (k === 'riser' ? 'RISER_POLE_DETAIL' : k === 'exit' ? 'RISER_PIPE_DETAIL' : k === 'sbox' ? 'SERVICE_BOX_DETAIL' : 'PART_DETAIL') + '|d';      /* beta 4.2 (22:24): a part detail is one block: its frame, its drawing and the names of its pieces */
function placeDetails(G, P, D, toSheet, names) {
  const cs = 2, X0 = AREA.x0, Y0 = AREA.y0, nx = Math.ceil((AREA.x1 - X0) / cs), ny = Math.ceil((AREA.y1 - Y0) / cs), occ = new Uint8Array(nx * ny);
  const mark = (x0, y0, x1, y1) => { const a = Math.max(0, Math.floor((x0 - X0) / cs)), b = Math.min(nx - 1, Math.floor((x1 - X0) / cs)), c = Math.max(0, Math.floor((y0 - Y0) / cs)), d = Math.min(ny - 1, Math.floor((y1 - Y0) / cs)); for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) occ[j * nx + i] = 1; };
  for (const p of P) {
    if (p.k === 'pl' || p.k === 'fl') { const Q = p.close || p.k === 'fl' ? p.pts.concat([p.pts[0]]) : p.pts; for (let i = 0; i + 1 < Q.length; i++) { const a = Q[i], b = Q[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / cs)); for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n; mark(x, y, x, y); } } }
    else { const b = primBox([p]); mark(b[0], b[1], b[2], b[3]); }
  }
  mark(X0, Y0, X0 + 120, Y0 + AREA.tz);                                                   /* the title of the view */
  mark(X0, AREA.y1 - 9, X0 + 78, AREA.y1);                                                /* the notice of the sample site */
  let sat = null; const W1 = nx + 1, sum = () => { sat = new Int32Array(W1 * (ny + 1)); for (let j = 0; j < ny; j++) { let r = 0; for (let i = 0; i < nx; i++) { r += occ[j * nx + i]; sat[(j + 1) * W1 + i + 1] = sat[j * W1 + i + 1] + r; } } };
  const free = (x, y, w, h) => { const a = Math.floor((x - X0) / cs), b = Math.floor((x + w - X0) / cs), c = Math.floor((y - Y0) / cs), d = Math.floor((y + h - Y0) / cs); if (a < 0 || c < 0 || b >= nx || d >= ny) return false; return sat[(d + 1) * W1 + b + 1] - sat[c * W1 + b + 1] - sat[(d + 1) * W1 + a] + sat[c * W1 + a] === 0; };
  /* beta 4.2 (19:25): the details are a little smaller, and their places are chosen together: each as near its item as the free room allows, the dashed lines that
     tie a detail to its item short, over as little of the drawing as can be, and never across the lines or the frame of another detail when a place without that exists. */
  const left = [], KS = [0.85, 0.75], NB = names || []; sum();
  const sideTo = (c, A) => [[clamp(A[0], c.x, c.x + c.w), clamp(A[1], c.y, c.y + c.h)]];      /* one line ties a detail to its item, from the nearest point of its frame: two lines from the ends of a side took in a wide wedge of the drawing, and what stood in it was crossed */
  const ink = (a, b) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / cs)); let c = 0; for (let k = 1; k < n - 1; k++) { const i = Math.floor((a[0] + (b[0] - a[0]) * k / n - X0) / cs), j = Math.floor((a[1] + (b[1] - a[1]) * k / n - Y0) / cs); if (i >= 0 && j >= 0 && i < nx && j < ny && occ[j * nx + i]) c++; } return c; };
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), segX = (a, b, c, d) => { const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d); return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)); };
  const segBox = (a, b, q, m) => { const x0 = q.x - m, y0 = q.y - m, x1 = q.x + q.w + m, y1 = q.y + q.h + m, R = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], ins = p => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1; if (ins(a) || ins(b)) return true; for (let i = 0; i < 4; i++) if (segX(a, b, R[i], R[(i + 1) % 4])) return true; return false; };
  const CAND = D.map(d => { const A = toSheet(d.at); let L = [];
    for (const lim of [14, 45]) { for (const k of KS) { const w = d.w * k, h = d.h * k;
        for (let y = Y0 + 2; y + h <= AREA.y1 - 2; y += 3) for (let x = X0 + 2; x + w <= AREA.x1 - 2; x += 3) {
          const edge = Math.min(x - X0, AREA.x1 - x - w, y - Y0, AREA.y1 - y - h); if (edge > lim || !free(x - 1.5, y - 1.5, w + 3, h + 3)) continue;
          const cx = clamp(A[0], x, x + w), cy = clamp(A[1], y, y + h), dist = Math.hypot(A[0] - cx, A[1] - cy); if (dist <= 4) continue;
          const c = { x, y, w, h, k, A, d }; c.T = sideTo(c, A); c.cost = dist + ink(c.T[0], A) * 1.2 + edge * 0.6 + (k < KS[0] ? 22 : 0); L.push(c); } }      /* the smaller size only where it buys a much nearer or clearer place */
      if (L.length) break; }
    L.sort((p, q) => p.cost - q.cost); const seen = {}, out = [];      /* the best place of each part of the sheet, so that the choice has places well apart */
    for (const c of L) { const key = Math.floor(c.x / 18) + '_' + Math.floor(c.y / 18) + '_' + c.k; if (seen[key]) continue; seen[key] = 1; out.push(c); if (out.length >= 40) break; }
    return out; });
  const pair = (p, q) => { if (p.x < q.x + q.w + 3 && q.x < p.x + p.w + 3 && p.y < q.y + q.h + 3 && q.y < p.y + p.h + 3) return Infinity; let c = 0;
    for (const a of p.T) for (const b of q.T) if (segX(a, p.A, b, q.A)) c += 400; for (const a of p.T) if (segBox(a, p.A, q, 1)) c += 250; for (const b of q.T) if (segBox(b, q.A, p, 1)) c += 250; return c; };
  const idx = []; D.forEach((d, i) => { if (CAND[i].length) idx.push(i); else left.push(d); });
  let best = null; const pk = [], go = (i, cost) => { if (best && cost >= best.cost) return; if (i === idx.length) { best = { cost, pk: pk.slice() }; return; }
    for (const c of CAND[idx[i]]) { let add = c.cost; for (let j = 0; j < i && add < Infinity; j++) add += pair(pk[j], c); if (add === Infinity) continue; pk[i] = c; go(i + 1, cost + add); } };
  if (idx.length) go(0, 0);
  if (idx.length && !best) return D.slice();             /* they do not fit side by side: all of them go to the column */
  placeDetails.last = (best ? best.pk : []).map(c => ({ key: c.d.key, x: c.x, y: c.y, w: c.w, h: c.h, k: c.k, T: c.T, A: c.A }));      /* kept for the checks */
  for (const c of best ? best.pk : []) {
    const g = new Gfx(), A = c.A; c.d.draw(g); for (const p of xfPrims(g.p, c.k, 0, c.x, c.y)) { p.g = detBlock(c.d.key); G.p.push(p); }
    /* tied to its item: a small ring on the view, and one dashed line to it from the nearest point of the frame (broken where a name stands) */
    G.ci(A, 2.6, 'lot'); for (const t of c.T) { const dl = Math.hypot(A[0] - t[0], A[1] - t[1]) || 1; for (const q of clipOut([{ k: 'pl', pts: [t, [A[0] - (A[0] - t[0]) / dl * 2.6, A[1] - (A[1] - t[1]) / dl * 2.6]], lay: 'lot', close: false }], NB)) G.p.push(q); }
  }
  return left;
}
function buildSheets(S, opt) {      /* (14 Nov) opt.details === false: no details pages; opt.photos === false: no photo pages. Left out: every page, as before. */
  const out = [], si = S.site, g = geo(S), rg = routeGeom(S), up = v => String(v || '').trim().toUpperCase();
  const ax0 = AREA.x0, ax1 = AREA.x1, ay0 = AREA.y0, ay1 = AREA.y1, top = ay1 - (S.sample ? 8 : 0), vy0 = ay0 + AREA.tz, pw = PAN.w, px = PAN.x;
  const OPT = opt || {}, nPh = OPT.photos === false ? 0 : S.photos.length, DP = OPT.details === false ? [] : detailPages(S), nD = DP.length, nP = Math.ceil(nPh / 6), total = 5 + nD + nP, TS = { rh: 5.4, hh: 6.2, th: 1.8 };      /* the tables in the strip: narrow, so their text is the smallest that still reads well, 1.8 mm */
  let n = 0; const push = (name, G, v, images) => out.push({ name, s: v ? v.s : 1, N: v ? v.N : 0, prims: G.p, images: images || [] });
  { /* 1. the cover page */
    const G = new Gfx(), x0 = SH.M, x1 = SH.W - SH.M, y0 = SH.M, y1 = SH.H - SH.M, cx = SH.W / 2; n++;
    for (const k of [0, 1.6]) G.pl([[x0 + k, y0 + k], [x1 - k, y0 + k], [x1 - k, y1 - k], [x0 + k, y1 - k]], 'fr', 1);
    const cim = [], lc = logoAt(cim, 'client', cx - 150, 212, 110, 52), lv = logoAt(cim, 'vendor', cx + 40, 212, 110, 52);      /* beta 4.1: the two logos side by side at the top, the client's on the left, as on the plan drawings */
    const L = [[lv ? '' : up(si.org), lv || lc ? 5 : 7, 0, lv || lc ? 200 : 232], ['CABLE ENTRANCE FACILITY', 16, 1, lv || lc ? 166 : 176], [up(si.link), 14, 1, lv || lc ? 140 : 150], [[up(si.id), up(si.name)].filter(Boolean).join(' - '), 13, 1, lv || lc ? 100 : 104], [PLAN_KIND, 11, 0, lv || lc ? 70 : 72]];
    for (const q of L) if (q[0]) fitTx(G, [cx, q[3]], q[0], q[1], x1 - x0 - 40, 'tx', 'c', !!q[2]);
    { const ct = coordText(S); if (ct) fitTx(G, [cx, 38], ct, 3, x1 - x0 - 40, 'tx', 'c'); }      /* (beta 4.2, 22:24: no date and no "prepared by" on the cover; the title block of every sheet has them) */
    G.tx([x1, y0 - 2.6], 'G-eSAA CEF-PLAN DEMO - GENERIC FRAME, NOT THE OFFICIAL TEMPLATE', 1, 'dm', 'r');      /* (22:24) very small, under the frame at the lower right; the app writes who exported here */ if (S.sample) G.tx([cx, 52], 'SAMPLE DATA - NOT A REAL SITE', 4, 'tp', 'c', 0, true);
    push('COVER', G, null, cim);
  }
  const toc = new Gfx(); n++; out.push(null);                                           /* 2. the table of contents: filled in when the other sheets are known */
  { /* 3. legend, notes and site data */
    const G = new Gfx(), images = []; sheetFrame(S, G, { view: 'LEGEND AND NOTES', sheet: 'LEGEND AND NOTES', scale: '', n: ++n, N: total, images });
    const cw = 138, xL = ax0 + 6, xR = ax0 + 156, flat = flatOn(S);
    let y = legend(G, xL, top - 6, S, cw, 2.3);
    y = heading(G, xL, y - 9, 'SITE DATA', cw, 2.8);
    const lines = ['SITE TYPE: ' + (si.kind === 'rooftop' ? 'ROOFTOP, BUILDING ' + f1(roofZ(S)) + ' m HIGH' : si.kind === 'unfenced' ? 'UNFENCED GROUND SITE' : 'FENCED GROUND SITE'), 'PERIMETER: ' + f1(si.L) + ' x ' + f1(si.W) + ' m'];
    if (si.kind === 'fenced') { lines.push('FENCE: ' + FENCE[si.fence] + ', ' + f1(num(si.fh, 0)) + ' m HIGH' + (num(si.wire, 0) && si.fence !== 'barb' ? ', BARBED WIRE ON TOP' : '')); S.gates.forEach((q, i) => lines.push('GATE ' + (i + 1) + ': ' + SIDE[q.side] + ' SIDE, ' + f1(num(q.w, 0)) + ' m WIDE, ' + f1(num(q.off, 0)) + ' m FROM THE ' + (q.side === 'S' || q.side === 'N' ? 'LEFT' : 'BOTTOM') + ' CORNER')); }
    lines.push('THE TOP SIDE OF THE TOP VIEW FACES ' + f1(num(si.bearing, 0)) + '° FROM TRUE NORTH.');
    if (g) { lines.push('COORDINATES TAKEN AT: ' + g.at + (g.fallback ? ' (NO TOWER ON THE PLAN)' : '')); lines.push('UTM 51N: E ' + g.utm[0].toFixed(2) + '  N ' + g.utm[1].toFixed(2) + (g.zoneOk ? '' : ' (OUTSIDE ZONE 51)')); }
    y = para(G, xL, y, lines, 2.3, cw, 'tx');
    if (S.runs.length) drawTable(G, xL, y - 8, [{ t: 'NO.', w: 10, al: 'c' }, { t: 'DRAWN RUN', w: 104 }, { t: 'LENGTH', w: 24, al: 'c' }], S.runs.slice(0, 14).map((r, i) => [i + 1, (r.st === 'P' ? 'PROP. ' : 'EXIS. ') + runCap(r) + (buried(r) && r.kind !== 'trench' ? ', BURIED ' + f1(runDepth(r)) + ' m' : ''), f1(runLen(r)) + 'm']), 'LADDERS, CONDUITS, TRENCHES', { rh: 5.6, hh: 6.4, th: 2 });
    let yn = heading(G, xR, top - 6, 'NOTES', cw, 2.8);
    const N = ['ALL DIMENSIONS AND LENGTHS ARE IN METERS.', 'EXISTING ITEMS ARE BLUE OR BLACK. PROPOSED ITEMS ARE RED AND THEIR NAMES START WITH "PROPOSED".', 'A LENGTH IN GREEN IS THE LENGTH OF THE CABLE ALONG THAT LEG.', 'ISOMETRIC AT 30 DEGREES, TRUE TO SCALE ALONG THE THREE AXES. THE PART DETAILS IN DASHED FRAMES ARE ENLARGED AND NOT TO SCALE.', 'TOWERS ARE DRAWN AT TRUE SIZE. A TALL TOWER IS DRAWN FROM THE GROUND UP TO ITS BREAK LINE; THE REST IS NOT SHOWN.',
      flat ? 'CONDUITS, SERVICE BOXES, HAND HOLES AND THE UG CABLE ARE DRAWN AT GROUND LEVEL, WITHOUT THEIR DEPTH. THEY ARE BURIED ' + f1(UGD) + ' m DEEP UNLESS THE CEF TABLE OR A NAME GIVES ANOTHER DEPTH. THE CABLE LENGTHS INCLUDE THE WAY DOWN AND UP.' : 'DASHED LINES ARE BELOW GROUND. TRENCHES, BURIED CONDUITS, HAND HOLES AND SERVICE BOXES ARE ' + f1(UGD) + ' m DEEP UNLESS THE LABEL GIVES ANOTHER DEPTH. DOTS MARK AN EXCAVATION (OPEN TRENCH).',
      rg.join && rg.join.none ? 'THE CABLE IS ONE LENGTH: UP THE RISER (UG) AND ON FROM THE LOOP AS AERIAL CABLE (AE). NO CLOSURE ON THE RISER POLE.' : 'FOC AE AND FOC UG ARE TWO CABLES. THEY MEET IN THE CLOSURE ON THE RISER POLE.', 'POSITIONS COME FROM THE SURVEY SKETCH. VERIFY ON SITE BEFORE BUILDING.',
      si.kind === 'fenced' && si.cut !== 'none' ? 'THE TWO FENCE SIDES NEAREST THE VIEWER ARE NOT DRAWN, SO THAT THE PLAN INSIDE SHOWS. ON SITE THE FENCE IS COMPLETE.' : '', nD ? 'SEE THE DETAILS SHEET FOR THE INSIDE OF A CABIN AND THE RACK UNITS OF THE ODF.' : '', stdNote(S)].filter(Boolean).map((t, i) => (i + 1) + '. ' + t);
    yn = para(G, xR, yn, N, 2.3, cw, 'tx');
    if (rg.warn.length) para(G, xR, yn - 4, rg.warn.map(w => 'CHECK: UG LEG ' + (w.leg + 1) + ' CROSSES ' + w.names.join(', ').toUpperCase() + '.'), 2.3, cw, 'tp', true);
    push('LEGEND', G, null, images);
  }
  { /* 4. the isometric, with the part details in the room it leaves and the CEF table on the right */
    const G = new Gfx(), box = [ax0, vy0, ax1, top], images = []; let iso = null;
    const mk = (th, b) => (iso = buildIso(S, { th, box: b })).prims;
    let v = fitView(mk, box[2] - box[0], box[3] - box[1]), t = viewAt(v, box), P = xfPrims(v.prims, v.s, 0, t.dx, t.dy);
    const D = partDetails(S, rg).filter(d => pdOn(S, d.key)), toSheet = p => { const q = iso.sc.P(p); return [t.dx + q[0] * v.s, t.dy + q[1] * v.s]; };
    sheetFrame(S, G, { view: 'ISOMETRIC DETAIL', sheet: 'ISOMETRIC DETAIL', scale: '1:' + v.N + ' ALONG AXES', n: ++n, N: total, images });
    const names = () => ((iso && iso.labs) || []).map(b => b.poly.map(q => [t.dx + q[0] * v.s, t.dy + q[1] * v.s]));      /* beta 4.2: where the names of the view stand on the sheet */
    let GD = new Gfx(), left = placeDetails(GD, P, D, toSheet, names());
    if (left.length) {                                   /* no room at the edges: the view moves to the right and the details stand in a column on its left */
      const Ht = D.reduce((s, d) => s + d.h, 0) + 3 * (D.length - 1), k = Math.min(0.85, (top - vy0) / Ht), colW = Math.max.apply(null, D.map(d => d.w)) * k + 2; box[0] = ax0 + colW + 2; v = fitView(mk, box[2] - box[0], box[3] - box[1]); t = viewAt(v, box); P = xfPrims(v.prims, v.s, 0, t.dx, t.dy);
      GD = new Gfx(); G.p.length = 0; images.length = 0; sheetFrame(S, G, { view: 'ISOMETRIC DETAIL', sheet: 'ISOMETRIC DETAIL', scale: '1:' + v.N + ' ALONG AXES', n, N: total, images });
      let y = top; const NB = names();
      for (const d of D) { const gg = new Gfx(), A = toSheet(d.at); d.draw(gg); y -= d.h * k; for (const p of xfPrims(gg.p, k, 0, ax0, y)) { p.g = detBlock(d.key); GD.p.push(p); } GD.ci(A, 2.6, 'lot'); for (const q of clipOut([{ k: 'pl', pts: [[ax0 + d.w * k, y + d.h * k / 2], A], lay: 'lot', close: false }], NB)) GD.p.push(q); y -= 3 * k; }
    }
    for (const p of P) G.p.push(p); for (const p of GD.p) G.p.push(p);
    for (const q of (iso && iso.pics) || []) images.push({ id: q.id, x: t.dx + q.x * v.s, y: t.dy + q.y * v.s, w: q.w * v.s, h: q.h * v.s, file: picFile(q.n) });      /* beta 4.1: the photos set on the isometric */
    /* the depth of the open trench is written under the table: in the narrow strip the row has no room for it */
    let deep = ''; const rowsC = cefTable(S).map((r, i) => { const m = /^((?:OPEN|SHALLOW) TRENCH CONDUIT) \((.+)\)$/.exec(r[0]); if (m) deep = m[2]; return [i + 1].concat(m ? [m[1]].concat(r.slice(1)) : r); });
    const colsC = [{ t: 'NO.', w: 7.4, al: 'c' }, { t: 'LIST OF ACTIVITY', w: 38 }, { t: 'TYPE', w: 21, al: 'c' }, { t: 'QTY', w: 8, al: 'c' }, { t: 'LENGTH', w: 13.6, al: 'c' }], deepL = deep ? ['TRENCH CONDUIT: ' + deep.replace(/(\d)m /, '$1 m ')] : [];
    if (rg.parts.filter(p => p.sum.total > 0.05).length > 1) {      /* (14 Nov) more than one cable: each line under the table on one line, the rows a little lower when there are many; lines that still have no room are left to the top view sheet */
      let FF = focFormula(S).concat(deepL); const lh = 1.8 * 1.65, room = n => (PAN.y1 - PAN.y0 - 2 * TS.hh - 2.5 - n * lh) / rowsC.length; if (room(FF.length) < 3.9) FF = deepL;
      let yy = drawTable(G, px, PAN.y1, colsC, rowsC, 'CEF TABLE', Object.assign({}, TS, { rh: clamp(room(FF.length), 3.9, TS.rh) })) - 1.5; for (const ln of FF) { yy -= lh; fitTx(G, [px, yy], ln, 1.8, pw, 'tp', 'l', true); }
    } else {
    const y = drawTable(G, px, PAN.y1, colsC, rowsC, 'CEF TABLE', TS);
    para(G, px, y - 1.5, focFormula(S).concat(deepL), 1.8, pw, 'tp', true);
    }
    push('ISOMETRIC', G, v, images);
  }
  { /* 5. the top view, with the lengths of the two cables on the right */
    let tv = null; const G = new Gfx(), images = [], v = fitView((th, box) => (tv = buildTop(S, { th, box, dims: true, north: true, photos: true, labels: true })).prims, ax1 - ax0, top - vy0);
    sheetFrame(S, G, { view: 'TOP VIEW', sheet: 'TOP VIEW', scale: '1:' + v.N, n: ++n, N: total, images }); placeView(G, v, [ax0, vy0, ax1, top]);
    { const t = viewAt(v, [ax0, vy0, ax1, top]); for (const q of (tv && tv.pics) || []) images.push({ id: q.id, x: t.dx + q.x * v.s, y: t.dy + q.y * v.s, w: q.w * v.s, h: q.h * v.s, file: picFile(q.n) }); }      /* beta 4.1: the photos set on the top view */
    /* (14 Nov) the lengths of each cable: its legs, what the app adds, its two totals. With more than one cable each has its heading. */
    let rows = []; const CB = cables(S), PD = rg.parts.map((p, k) => k).filter(k => rg.parts[k].sum.total > 0.05), many = PD.length > 1, runT = t => LEG[t].n.toUpperCase().replace('UNDERGROUND', 'UG');
    const one = (k, brief) => { const p = rg.parts[k], sm = p.sum, grp = {}, o = [], w = many ? ' ' + (k + 1) : '';
      if (many) o.push(['', 'CABLE ' + (k + 1) + ': ' + [sm.ae > 0.05 ? 'AE ' + CB[k].ae.cable : '', sm.ugt > 0.05 ? 'UG ' + CB[k].ug.cable : ''].filter(Boolean).join(', ').toUpperCase(), '']);
      if (!brief) { for (const l of p.legs) { const kk = l.f + l.i, q = grp[kk] || (grp[kk] = { f: l.f, i: l.i, len: 0, t: {} }); q.len += l.len; q.t[l.type] = 1; }
        for (const kk in grp) { const q = grp[kk]; o.push([q.f.toUpperCase() + ' ' + (q.i + 1), Object.keys(q.t).map(runT).join(' / '), f1(q.len) + 'm']); }
        if (sm.vert > 0.05) o.push(['UG', 'UP AND DOWN (RISER, EXIT, DROPS)', f1(sm.vert) + 'm']); if (sm.inside > 0.05) o.push(['UG', 'IN THE CABIN (PORTHOLE TO ODF)', f1(sm.inside) + 'm']); if (sm.nloop) o.push(['AE', 'LOOPS (' + sm.nloop + ')', f1(sm.loop) + 'm']); }
      if (!many || sm.ae > 0.05) o.push(['', 'TOTAL FOC AE' + w, f1(sm.ae) + 'm']); if (!many || sm.ugt > 0.05) o.push(['', 'TOTAL FOC UG' + w, f1(sm.ugt) + 'm']); return o; };
    for (const k of PD) rows = rows.concat(one(k, false)); if (rows.length > 20 && many) { rows = []; for (const k of PD) rows = rows.concat(one(k, true)); }      /* too many lines for the sheet: the totals of each cable */
    let y = PAN.y1;
    if (rows.length) y = drawTable(G, px, y, [{ t: 'LEG', w: 10, al: 'c' }, { t: 'FOC RUN', w: 63 }, { t: 'LENGTH', w: 15, al: 'c' }], rows.slice(0, 20), 'FOC AE AND FOC UG', TS);
    if (rg.warn.length) para(G, px, y - 2, rg.warn.map(w => 'CHECK: UG LEG ' + (w.leg + 1) + ' CROSSES ' + w.names.join(', ').toUpperCase() + '.'), 1.8, pw, 'tp', true);
    push('TOP VIEW', G, v, images);
  }
  /* details: the inside of the cabin and the open cabinets, each enlarged to its own scale */
  for (let k = 0; k < nD; k++) {
    const G = new Gfx(), AW = ax1 - ax0, AH = top - vy0, images = [];
    sheetFrame(S, G, { view: 'DETAILS', sheet: 'DETAILS' + (nD > 1 ? ' ' + (k + 1) : ''), scale: 'AS SHOWN', n: ++n, N: total, images });
    for (const d of DP[k]) {
      const x = ax0 + d.x * AW, yT = top - d.y * AH, cw = d.w * AW, ch = d.h * AH, v = fitView(d.make, cw - 8, ch - 16, DSCALES, 2.2);
      placeView(G, v, [x + 4, yT - ch + 3, x + cw - 4, yT - 13]);
      fitTx(G, [x + 1, yT - 4], d.title, 2.8, cw - 4, 'tx', 'l', true); G.tx([x + 1, yT - 8.2], 'SCALE 1:' + v.N + (d.iso ? ' ALONG AXES' : ''), 1.9, 'dm');
      if (d.x > 0.01) G.pl([[x - 1, yT - 1], [x - 1, yT - ch + 2]], 'fr'); if (d.y > 0.01) G.pl([[x + 1, yT + 1], [x + cw - 3, yT + 1]], 'fr');
    }
    let y = PAN.y1; const rr = rackRows(S);
    if (rr.length) y = drawTable(G, px, y, [{ t: 'IN', w: 28 }, { t: 'ITEM', w: 28 }, { t: 'RACK UNITS', w: 20, al: 'c' }, { t: '', w: 12, al: 'c' }], (rr.length > 11 ? rr.slice(0, 10).concat([['', '+ ' + (rr.length - 10) + ' MORE: SEE THE SKETCH', '', '']]) : rr), 'RACK SCHEDULE', TS) - 4;
    y = heading(G, px, y, 'NOTES', pw, 2.1);
    para(G, px, y, ['1. RACK UNITS (U) ARE COUNTED FROM THE BOTTOM OF THE RACK. 1 U = 44.45 mm.', '2. A CABIN IS DRAWN FROM INSIDE. THE TWO WALLS NEAREST THE VIEWER ARE CUT DOWN TO A LOW KERB SO THAT THE ROOM SHOWS.', '3. A CABINET IS DRAWN WITH ITS DOOR OPEN. EVERY RACK UNIT IS MARKED ON THE RAILS, EVERY FIFTH ONE IS NUMBERED.', '4. EACH DETAIL HAS ITS OWN SCALE, WRITTEN UNDER ITS TITLE.'].concat(rg.sum.inside > 0.05 ? ['5. THE UG CABLE INSIDE THE CABIN, FROM THE PORTHOLE TO THE ODF, IS ' + f1(rg.sum.inside) + ' m. IT IS PART OF THE UG FOC LENGTH IN THE CEF TABLE.'] : []), 1.7, pw, 'tx');
    push('DETAILS' + (nD > 1 ? ' ' + (k + 1) : ''), G, null, images);
  }
  for (let k = 0; k < nP; k++) {
    const G = new Gfx(), images = []; sheetFrame(S, G, { view: 'SITE PHOTOS', sheet: 'SITE PHOTOS' + (nP > 1 ? ' ' + (k + 1) : ''), scale: 'N T S', n: ++n, N: total, images });
    const cw = (ax1 - ax0) / 3, chh = (top - vy0) / 2;
    S.photos.slice(k * 6, k * 6 + 6).forEach((ph, j) => {
      const i = k * 6 + j, x = ax0 + (j % 3) * cw, yT = top - Math.floor(j / 3) * chh, bw = cw - 6, bh = chh - 22, ar = ph.w && ph.h ? ph.w / ph.h : 4 / 3;
      let w = bw, h = w / ar; if (h > bh) { h = bh; w = h * ar; }
      const ix = x + (cw - w) / 2, iy = yT - 4 - bh + (bh - h) / 2, file = 'photos/photo_' + String(i + 1).padStart(2, '0') + '.jpg';
      G.pl([[ix, iy], [ix + w, iy], [ix + w, iy + h], [ix, iy + h]], 'ph', 1); images.push({ id: ph.id, x: ix, y: iy, w, h, file });
      let y = yT - 4 - bh - 1; G.tx([x + 3, y - 3.4], S.photos[i] && S.photos[i].title != null && String(S.photos[i].title).trim() ? String(S.photos[i].title).trim() : 'PHOTO ' + (i + 1), 2.4, 'ph', 'l', 0, true);
      y = para(G, x + 3, y - 3.6, [String(ph.cap || '').toUpperCase() || '(NO CAPTION)'].concat(ph.placed ? ['TAKEN ' + f1(ph.x) + ' m FROM THE LEFT SIDE, ' + f1(ph.y) + ' m FROM THE BOTTOM SIDE, FACING ' + Math.round(((num(ph.dir, 0) + num(si.bearing, 0)) % 360 + 360) % 360) + '° (TRUE)'] : ['NOT PLACED ON THE PLAN']), 1.8, cw - 8, 'tx');
    });
    push('PHOTOS ' + (k + 1), G, null, images);
  }
  { /* the table of contents, now that every sheet is known */
    const G = toc, images = []; sheetFrame(S, G, { view: 'TABLE OF CONTENTS', sheet: 'TABLE OF CONTENTS', scale: '', n: 2, N: total, images });
    const rows = [['COVER PAGE', 1], ['TABLE OF CONTENTS', 1], ['LEGEND AND NOTES', 1], ['ISOMETRIC DETAIL', 1], ['TOP VIEW', 1]].concat(nD ? [['DETAILS (CABIN, CABINETS)', nD]] : [], nP ? [['SITE PHOTOS', nP]] : []), W = 230, x = (ax0 + ax1 - W) / 2;
    const y = drawTable(G, x, top - 30, [{ t: 'ITEM NO.', w: 40, al: 'c' }, { t: 'TYPE OF DRAWINGS', w: 130 }, { t: 'NO. OF SHEETS', w: 60, al: 'c' }], rows.map((r, i) => [i + 1, r[0], r[1]]).concat([['', 'TOTAL', total + ' SHEETS']]), 'TABLE OF CONTENTS', { rh: 11, hh: 13, th: 3.6 });
    para(G, x, y - 6, ['NOT IN THIS SET: THE VICINITY MAP. THE DEMO HAS NO MAP PICTURE TO PUT ON IT.'], 2.2, W, 'dm');
    out[1] = { name: 'CONTENTS', s: 1, N: 0, prims: G.p, images };
  }
  return out;
}

/* ---------- DXF (R12, ASCII) ---------- */
function dxfStr(s) { let o = ''; for (const ch of String(s)) { const c = ch.codePointAt(0); o += ch === '°' ? '%%d' : c >= 32 && c < 127 ? ch : c > 127 && c < 65536 ? '\\U+' + c.toString(16).toUpperCase().padStart(4, '0') : ' '; } return o; }
function toDXF(prims) {
  const o = [], w = (...a) => { for (let i = 0; i < a.length; i += 2) o.push(String(a[i]).padStart(3, ' '), String(a[i + 1])); }, n = v => { const r = Math.round(v * 1e5) / 1e5; return Number.isInteger(r) ? r + '.0' : String(r); };
  const bb = primBox(prims), names = Object.keys(LAYERS);
  w(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSBASE', 10, '0.0', 20, '0.0', 30, '0.0', 9, '$EXTMIN', 10, n(bb[0]), 20, n(bb[1]), 30, '0.0', 9, '$EXTMAX', 10, n(bb[2]), 20, n(bb[3]), 30, '0.0', 9, '$LTSCALE', 40, '1.0', 0, 'ENDSEC');
  w(0, 'SECTION', 2, 'TABLES');
  w(0, 'TABLE', 2, 'LTYPE', 70, 2, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, '0.0', 0, 'LTYPE', 2, 'DASHED', 70, 0, 3, 'Dashed __ __ __ __', 72, 65, 73, 2, 40, '0.75', 49, '0.5', 49, '-0.25', 0, 'ENDTAB');
  w(0, 'TABLE', 2, 'LAYER', 70, names.length + 1, 0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS');
  for (const k of names) w(0, 'LAYER', 2, LAYERS[k][0], 70, 0, 62, LAYERS[k][1], 6, LAYERS[k][2] ? 'DASHED' : 'CONTINUOUS');
  w(0, 'ENDTAB', 0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '0.2', 3, 'arial.ttf', 4, '', 0, 'ENDTAB', 0, 'ENDSEC');
  /* one thing of the drawing, written ox, oy away from where it is (inside a block: from the point the block is set down on) */
  const ent = (p, ox, oy) => {
    const L = LAYERS[p.lay][0], X = v => n(v - ox), Y = v => n(v - oy);
    if (p.k === 'pl') {
      if (p.pts.length === 2 && !p.close) w(0, 'LINE', 8, L, 10, X(p.pts[0][0]), 20, Y(p.pts[0][1]), 30, '0.0', 11, X(p.pts[1][0]), 21, Y(p.pts[1][1]), 31, '0.0');
      else { w(0, 'POLYLINE', 8, L, 66, 1, 10, '0.0', 20, '0.0', 30, '0.0', 70, p.close ? 1 : 0); for (const q of p.pts) w(0, 'VERTEX', 8, L, 10, X(q[0]), 20, Y(q[1]), 30, '0.0'); w(0, 'SEQEND', 8, L); }
    }
    else if (p.k === 'ci') w(0, 'CIRCLE', 8, L, 10, X(p.c[0]), 20, Y(p.c[1]), 30, '0.0', 40, n(p.r));
    else if (p.k === 'ar') w(0, 'ARC', 8, L, 10, X(p.c[0]), 20, Y(p.c[1]), 30, '0.0', 40, n(p.r), 50, n((p.a0 % 360 + 360) % 360), 51, n((p.a1 % 360 + 360) % 360));
    else if (p.k === 'fl') { for (let i = 1; i + 1 < p.pts.length; i++) { const a = p.pts[0], b = p.pts[i], c = p.pts[i + 1]; w(0, 'SOLID', 8, L, 10, X(a[0]), 20, Y(a[1]), 30, '0.0', 11, X(b[0]), 21, Y(b[1]), 31, '0.0', 12, X(c[0]), 22, Y(c[1]), 32, '0.0', 13, X(c[0]), 23, Y(c[1]), 33, '0.0'); } }
    else if (p.k === 'tx') {
      const s = dxfStr(p.s); if (!s.trim()) return; let hh = p.h, rot = p.a, wf = 0, ob = 0;
      if (p.m) { const ul = Math.hypot(p.m[0], p.m[1]) || 1, ux = p.m[0] / ul, uy = p.m[1] / ul, al = p.m[2] * ux + p.m[3] * uy, up = -p.m[2] * uy + p.m[3] * ux; rot = Math.atan2(uy, ux) / D2R; hh = p.h * up; wf = ul / up; ob = Math.atan2(al, up) / D2R; }
      w(0, 'TEXT', 8, L, 10, X(p.p[0]), 20, Y(p.p[1]), 30, '0.0', 40, n(hh), 1, s); if (wf && Math.abs(wf - 1) > 1e-4) w(41, n(wf)); if (rot) w(50, n((rot % 360 + 360) % 360)); if (ob) w(51, n(ob)); w(7, 'STANDARD'); if (p.al !== 'l') w(72, p.al === 'c' ? 1 : 2, 11, X(p.p[0]), 21, Y(p.p[1]), 31, '0.0'); }
  };
  /* beta 4.2 (19:25): every item of the plan is a block: a tower, a cabinet, a pad, a pole, a trench, a ladder, each cable, the lot with its fence. In AutoCAD a
     click picks the whole item and MOVE takes it in one piece; EXPLODE gives its lines back. The names, the lengths, the notes and the frame of the sheet stay
     loose, so that a text is retyped as before. A block is set down on the middle of its item; its lines keep their own layers. */
  const grp = new Map(), loose = [], used = {}, blocks = [];
  for (const p of prims) { if (!LAYERS[p.lay]) continue; if (p.g) { let q = grp.get(p.g); if (!q) grp.set(p.g, q = []); q.push(p); } else loose.push(p); }
  for (const [key, L] of grp) {
    let nm = String(key).split('|')[0].toUpperCase().replace(/[^A-Z0-9_$-]+/g, '_').slice(0, 24) || 'ITEM'; used[nm] = (used[nm] || 0) + 1; if (used[nm] > 1) nm += '_V' + used[nm];
    const b = primBox(L); if (!isFinite(b[0]) || b[0] > b[2]) { for (const p of L) loose.push(p); continue; }
    blocks.push({ nm, L, x: Math.round((b[0] + b[2]) / 2 * 1e4) / 1e4, y: Math.round((b[1] + b[3]) / 2 * 1e4) / 1e4 });
  }
  w(0, 'SECTION', 2, 'BLOCKS');
  for (const b of blocks) { w(0, 'BLOCK', 8, '0', 2, b.nm, 70, 0, 10, '0.0', 20, '0.0', 30, '0.0', 3, b.nm); for (const p of b.L) ent(p, b.x, b.y); w(0, 'ENDBLK', 8, '0'); }
  w(0, 'ENDSEC');
  w(0, 'SECTION', 2, 'ENTITIES');
  for (const b of blocks) w(0, 'INSERT', 8, '0', 2, b.nm, 10, n(b.x), 20, n(b.y), 30, '0.0');
  for (const p of loose) ent(p, 0, 0);
  w(0, 'ENDSEC', 0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
/* all sheets side by side, each one enlarged so that its view is true size: 1 drawing unit = 1 m. This is the DXF of beta 4.2 (R12): no layout tabs, and a
   frame with the file name where a picture goes. (14 Nov) kept as it was, for a program that does not take the newer DXF. */
function sheetsDXF12(sheets) {
  let all = [], ox = 0; const k0 = 1 / (sheets.find(q => q.name === 'TOP VIEW') || sheets[0]).s, seen = {};
  for (const sh of sheets) {
    const k = sh.N ? 1 / sh.s : k0, G = new Gfx(), t3 = (String(sh.name || 'S').replace(/[^A-Za-z]/g, '').slice(0, 3) || 'S').toUpperCase(); seen[t3] = (seen[t3] || 0) + 1; const tag = t3 + (seen[t3] > 1 ? seen[t3] : '');      /* (19:25) the blocks of a sheet carry its name: ISO_ODC_2, TOP_ODC_2 */
    for (const im of sh.images) { if (im.logo) { G.pl([[im.x, im.y], [im.x + im.w, im.y], [im.x + im.w, im.y + im.h], [im.x, im.y + im.h]], 'ph', 1); fitTx(G, [im.x + im.w / 2, im.y + im.h / 2 - 0.8], 'LOGO: ' + im.file, 1.8, im.w - 2, 'ph', 'c'); continue; } G.pl([[im.x, im.y], [im.x + im.w, im.y + im.h]], 'ph'); G.pl([[im.x, im.y + im.h], [im.x + im.w, im.y]], 'ph'); G.tx([im.x + im.w / 2, im.y + im.h / 2 + 3], 'IMAGE FILE: ' + im.file, 2.4, 'ph', 'c'); }
    all = all.concat(xfPrims(sh.prims.concat(G.p), k, 0, ox, 0).map(p => { if (p.g) p.g = tag + '_' + p.g; return p; })); ox += SH.W * k * 1.06;
  }
  return toDXF(all);
}
/* ---------- (14 Nov) the DXF with a layout tab for each sheet and the pictures attached: AutoCAD 2000 format (AC1015) ----------
   The model holds what the DXF of beta 4.2 held: every sheet, side by side, each enlarged so that its view is true size (1 unit = 1 m), every item a block.
   Each sheet has a layout tab of its own, an A3 page with one viewport that looks at that sheet in the model at the sheet's scale: the tab prints as the
   PDF page does. A photo or a logo is a linked picture (IMAGE) laid over its frame; the files are in the photos and logos folders beside the DXF.
   R2K: the fixed records of such a drawing (tables, the model and the first paper space, the dictionaries), the ones the app's plain plan DXF is written
   with. Handles below 0x40 are theirs; everything added here is numbered from 0x100. */
const R2K = {"classes":[["0","CLASS","1","ACDBDICTIONARYWDFLT","2","AcDbDictionaryWithDefault","3","ObjectDBX Classes","90","0","280","0","281","0"],["0","CLASS","1","SUN","2","AcDbSun","3","SCENEOE","90","1153","280","0","281","0"],["0","CLASS","1","VISUALSTYLE","2","AcDbVisualStyle","3","ObjectDBX Classes","90","4095","280","0","281","0"],["0","CLASS","1","MATERIAL","2","AcDbMaterial","3","ObjectDBX Classes","90","1153","280","0","281","0"],["0","CLASS","1","SCALE","2","AcDbScale","3","ObjectDBX Classes","90","1153","280","0","281","0"],["0","CLASS","1","TABLESTYLE","2","AcDbTableStyle","3","ObjectDBX Classes","90","4095","280","0","281","0"],["0","CLASS","1","MLEADERSTYLE","2","AcDbMLeaderStyle","3","ACDB_MLEADERSTYLE_CLASS","90","4095","280","0","281","0"],["0","CLASS","1","DICTIONARYVAR","2","AcDbDictionaryVar","3","ObjectDBX Classes","90","0","280","0","281","0"],["0","CLASS","1","CELLSTYLEMAP","2","AcDbCellStyleMap","3","ObjectDBX Classes","90","1152","280","0","281","0"],["0","CLASS","1","MENTALRAYRENDERSETTINGS","2","AcDbMentalRayRenderSettings","3","SCENEOE","90","1024","280","0","281","0"],["0","CLASS","1","ACDBDETAILVIEWSTYLE","2","AcDbDetailViewStyle","3","ObjectDBX Classes","90","1025","280","0","281","0"],["0","CLASS","1","ACDBSECTIONVIEWSTYLE","2","AcDbSectionViewStyle","3","ObjectDBX Classes","90","1025","280","0","281","0"],["0","CLASS","1","RASTERVARIABLES","2","AcDbRasterVariables","3","ISM","90","0","280","0","281","0"],["0","CLASS","1","ACDBPLACEHOLDER","2","AcDbPlaceHolder","3","ObjectDBX Classes","90","0","280","0","281","0"],["0","CLASS","1","LAYOUT","2","AcDbLayout","3","ObjectDBX Classes","90","0","280","0","281","0"],["0","CLASS","1","IMAGE","2","AcDbRasterImage","3","ISM","90","2175","280","0","281","1"],["0","CLASS","1","IMAGEDEF","2","AcDbRasterImageDef","3","ISM","90","0","280","0","281","0"],["0","CLASS","1","IMAGEDEF_REACTOR","2","AcDbRasterImageDefReactor","3","ISM","90","1","280","0","281","0"]],"vport":["0","VPORT","5","23","330","8","100","AcDbSymbolTableRecord","100","AcDbViewportTableRecord","2","*Active","70","0","10","0.0","20","0.0","11","1.0","21","1.0","12","0.0","22","0.0","13","0.0","23","0.0","14","0.5","24","0.5","15","0.5","25","0.5","16","0.0","26","0.0","36","1.0","17","0.0","27","0.0","37","0.0","40","1000.0","41","1.34","42","50.0","43","0.0","44","0.0","50","0.0","51","0.0","71","0","72","1000","73","1","74","3","75","0","76","0","77","0","78","0","281","0","65","0","146","0.0"],"ltypes":[["0","LTYPE","5","24","330","2","100","AcDbSymbolTableRecord","100","AcDbLinetypeTableRecord","2","ByBlock","70","0","3","","72","65","73","0","40","0.0"],["0","LTYPE","5","25","330","2","100","AcDbSymbolTableRecord","100","AcDbLinetypeTableRecord","2","ByLayer","70","0","3","","72","65","73","0","40","0.0"],["0","LTYPE","5","26","330","2","100","AcDbSymbolTableRecord","100","AcDbLinetypeTableRecord","2","Continuous","70","0","3","","72","65","73","0","40","0.0"]],"layer0":["0","LAYER","5","27","330","1","100","AcDbSymbolTableRecord","100","AcDbLayerTableRecord","2","0","70","0","62","7","6","Continuous","370","-3","390","13"],"layerDef":["0","LAYER","5","28","330","1","100","AcDbSymbolTableRecord","100","AcDbLayerTableRecord","2","Defpoints","70","0","62","7","6","Continuous","290","0","370","-3","390","13"],"style":["0","STYLE","5","29","330","5","100","AcDbSymbolTableRecord","100","AcDbTextStyleTableRecord","2","Standard","70","0","40","0.0","41","1.0","50","0.0","71","0","42","2.5","3","txt","4",""],"appid":["0","APPID","5","2A","330","3","100","AcDbSymbolTableRecord","100","AcDbRegAppTableRecord","2","ACAD","70","0"],"dimstyleTable":["0","TABLE","2","DIMSTYLE","5","4","330","0","100","AcDbSymbolTable","70","1","100","AcDbDimStyleTable"],"dimstyle":["0","DIMSTYLE","105","2B","330","4","100","AcDbSymbolTableRecord","100","AcDbDimStyleTableRecord","2","Standard","70","0","3","","4","","40","1.0","41","2.5","42","0.625","43","3.75","44","1.25","45","0.0","46","0.0","47","0.0","48","0.0","140","2.5","141","2.5","142","0.0","143","0.03937007874","144","1.0","145","0.0","146","1.0","147","0.625","148","0.0","71","0","72","0","73","0","74","0","75","0","76","0","77","1","78","8","79","3","170","0","171","3","172","1","173","0","174","0","175","0","176","0","177","0","178","0","179","2","271","2","272","2","273","2","274","3","275","0","276","0","277","2","278","44","279","0","280","0","281","0","282","0","283","0","284","8","285","0","286","0","288","0","289","3","371","-2","372","-2"],"blocks":[["0","BLOCK","5","18","330","17","100","AcDbEntity","8","0","100","AcDbBlockBegin","2","*Model_Space","70","0","10","0.0","20","0.0","30","0.0","3","*Model_Space","1",""],["0","ENDBLK","5","19","330","17","100","AcDbEntity","8","0","100","AcDbBlockEnd"],["0","BLOCK","5","1C","330","1B","100","AcDbEntity","8","0","100","AcDbBlockBegin","2","*Paper_Space","70","0","10","0.0","20","0.0","30","0.0","3","*Paper_Space","1",""],["0","ENDBLK","5","1D","330","1B","100","AcDbEntity","8","0","100","AcDbBlockEnd"]],"static":[["0","DICTIONARY","5","B","330","A","100","AcDbDictionary","281","1"],["0","DICTIONARY","5","C","330","A","100","AcDbDictionary","281","1"],["0","DICTIONARY","5","D","330","A","100","AcDbDictionary","281","1","3","Model","350","1A","3","Layout1","350","1E"],["0","DICTIONARY","5","E","330","A","100","AcDbDictionary","281","1","3","ByBlock","350","1F","3","ByLayer","350","20","3","Global","350","21"],["0","DICTIONARY","5","F","330","A","100","AcDbDictionary","281","1","3","Standard","350","2C"],["0","DICTIONARY","5","10","330","A","100","AcDbDictionary","281","1","3","Standard","350","22"],["0","DICTIONARY","5","11","330","A","100","AcDbDictionary","281","1"],["0","ACDBDICTIONARYWDFLT","5","12","330","A","100","AcDbDictionary","281","1","3","Normal","350","13","100","AcDbDictionaryWithDefault","340","13"],["0","ACDBPLACEHOLDER","5","13","330","12"],["0","DICTIONARY","5","14","330","A","100","AcDbDictionary","281","1"],["0","DICTIONARY","5","15","330","A","100","AcDbDictionary","281","1"],["0","DICTIONARY","5","16","330","A","100","AcDbDictionary","281","1"],["0","LAYOUT","5","1A","330","D","100","AcDbPlotSettings","1","","4","A3","6","","40","7.5","41","20.0","42","7.5","43","20.0","44","420.0","45","297.0","46","0.0","47","0.0","48","0.0","49","0.0","140","0.0","141","0.0","142","1.0","143","1.0","70","1024","72","1","73","0","74","5","7","","75","16","76","0","77","2","78","300","147","1.0","148","0.0","149","0.0","100","AcDbLayout","1","Model","70","1","71","0","10","0.0","20","0.0","11","420.0","21","297.0","12","0.0","22","0.0","32","0.0","14","1e+20","24","1e+20","34","1e+20","15","-1e+20","25","-1e+20","35","-1e+20","146","0.0","13","0.0","23","0.0","33","0.0","16","1.0","26","0.0","36","0.0","17","0.0","27","1.0","37","0.0","76","1","330","17"],["0","LAYOUT","5","1E","330","D","100","AcDbPlotSettings","1","","4","A3","6","","40","7.5","41","20.0","42","7.5","43","20.0","44","420.0","45","297.0","46","0.0","47","0.0","48","0.0","49","0.0","140","0.0","141","0.0","142","1.0","143","1.0","70","0","72","1","73","0","74","5","7","","75","16","76","0","77","2","78","300","147","1.0","148","0.0","149","0.0","100","AcDbLayout","1","Layout1","70","1","71","1","10","0.0","20","0.0","11","420.0","21","297.0","12","0.0","22","0.0","32","0.0","14","1e+20","24","1e+20","34","1e+20","15","-1e+20","25","-1e+20","35","-1e+20","146","0.0","13","0.0","23","0.0","33","0.0","16","1.0","26","0.0","36","0.0","17","0.0","27","1.0","37","0.0","76","1","330","1B"],["0","MATERIAL","5","1F","102","{ACAD_REACTORS","330","E","102","}","330","E","100","AcDbMaterial","1","ByBlock","2","","70","0","40","1.0","71","1","41","1.0","91","-1023410177","42","1.0","72","1","3","","73","1","74","1","75","1","44","0.5","73","0","45","1.0","46","1.0","77","1","4","","78","1","79","1","170","1","48","1.0","171","1","6","","172","1","173","1","174","1","140","1.0","141","1.0","175","1","7","","176","1","177","1","178","1","143","1.0","179","1","8","","270","1","271","1","272","1","145","1.0","146","1.0","273","1","9","","274","1","275","1","276","1","42","1.0","72","1","3","","73","1","74","1","75","1","94","63"],["0","MATERIAL","5","20","102","{ACAD_REACTORS","330","E","102","}","330","E","100","AcDbMaterial","1","ByLayer","2","","70","0","40","1.0","71","1","41","1.0","91","-1023410177","42","1.0","72","1","3","","73","1","74","1","75","1","44","0.5","73","0","45","1.0","46","1.0","77","1","4","","78","1","79","1","170","1","48","1.0","171","1","6","","172","1","173","1","174","1","140","1.0","141","1.0","175","1","7","","176","1","177","1","178","1","143","1.0","179","1","8","","270","1","271","1","272","1","145","1.0","146","1.0","273","1","9","","274","1","275","1","276","1","42","1.0","72","1","3","","73","1","74","1","75","1","94","63"],["0","MATERIAL","5","21","102","{ACAD_REACTORS","330","E","102","}","330","E","100","AcDbMaterial","1","Global","2","","70","0","40","1.0","71","1","41","1.0","91","-1023410177","42","1.0","72","1","3","","73","1","74","1","75","1","44","0.5","73","0","45","1.0","46","1.0","77","1","4","","78","1","79","1","170","1","48","1.0","171","1","6","","172","1","173","1","174","1","140","1.0","141","1.0","175","1","7","","176","1","177","1","178","1","143","1.0","179","1","8","","270","1","271","1","272","1","145","1.0","146","1.0","273","1","9","","274","1","275","1","276","1","42","1.0","72","1","3","","73","1","74","1","75","1","94","63"],["0","MLINESTYLE","5","22","102","{ACAD_REACTORS","330","10","102","}","330","10","100","AcDbMlineStyle","2","Standard","70","0","3","","62","256","51","90.0","52","90.0","71","2","49","0.5","62","256","6","BYLAYER","49","-0.5","62","256","6","BYLAYER"],["0","MLEADERSTYLE","5","2C","102","{ACAD_REACTORS","330","F","102","}","330","F","100","AcDbMLeaderStyle","179","2","170","2","171","1","172","0","90","2","40","0.0","41","0.0","173","1","91","-1056964608","92","-2","290","1","42","2.0","291","1","43","8.0","3","Standard","44","4.0","300","","342","29","174","1","175","1","176","0","178","1","93","-1056964608","45","4.0","292","0","297","0","46","4.0","94","-1056964608","47","1.0","49","1.0","140","1.0","294","1","141","0.0","177","0","142","1.0","295","0","296","0","143","3.75","271","0","272","9","273","9"]]};
const DXF_TAB = { COVER: 'COVER PAGE' };      /* a sheet's name on its tab */
function toDXF2K(prims, lay, imgs) {
  const n = v => { const r = Math.round(v * 1e5) / 1e5; return Number.isInteger(r) ? r + '.0' : String(r); };
  const buf = () => { const a = []; const g = (...q) => { for (let i = 0; i < q.length; i += 2) a.push(String(q[i]), String(q[i + 1])); }; g.a = a; g.put = r => { for (let i = 0; i < r.length; i += 2) a.push(String(r[i]), String(r[i + 1])); }; return g; };
  let next = 0x100; const H = () => (next++).toString(16).toUpperCase();
  const names = Object.keys(LAYERS), dashH = H(), boldH = H(), layH = {}; for (const k of names) layH[k] = H();
  /* the items as blocks, as in the older DXF: a block is set down on the middle of its item; names, lengths, notes and the frame stay loose */
  const grp = new Map(), loose = [], used = {}, blocks = [];
  for (const p of prims) { if (!LAYERS[p.lay]) continue; if (p.g) { let q = grp.get(p.g); if (!q) grp.set(p.g, q = []); q.push(p); } else loose.push(p); }
  for (const [key, L] of grp) {
    let nm = String(key).split('|')[0].toUpperCase().replace(/[^A-Z0-9_$-]+/g, '_').slice(0, 24) || 'ITEM'; used[nm] = (used[nm] || 0) + 1; if (used[nm] > 1) nm += '_V' + used[nm];
    const b = primBox(L); if (!isFinite(b[0]) || b[0] > b[2]) { for (const p of L) loose.push(p); continue; }
    blocks.push({ nm, L, x: Math.round((b[0] + b[2]) / 2 * 1e4) / 1e4, y: Math.round((b[1] + b[3]) / 2 * 1e4) / 1e4, br: H(), bb: H(), be: H() });
  }
  /* the tabs: the first one is the paper space every drawing has (*Paper_Space); each of the others has a paper space block of its own */
  const tabs = [], seenT = {};
  (lay || []).forEach((q, i) => { let nm = String(q.name || 'SHEET ' + (i + 1)).replace(/[<>\/\\":;?*|,=`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'SHEET ' + (i + 1); const k0 = nm.toUpperCase(); seenT[k0] = (seenT[k0] || 0) + 1; if (seenT[k0] > 1) nm += ' ' + seenT[k0];
    tabs.push(i === 0 ? { nm, q, br: '1B', lh: '1E', bn: '*Paper_Space' } : { nm, q, br: H(), lh: H(), bb: H(), be: H(), bn: '*Paper_Space' + (i - 1) }); });
  /* the pictures: one definition for each file, one reactor for each picture that shows it */
  const defs = new Map(), pics = [];
  for (const im of imgs || []) { if (!(im.px > 0) || !(im.py > 0) || !(im.w > 0) || !(im.h > 0) || !im.file) continue; let d = defs.get(im.file); if (!d) defs.set(im.file, d = { h: H(), px: Math.round(im.px), py: Math.round(im.py), file: String(im.file), users: [] }); const q = { im, d, hd: H(), re: H() }; d.users.push(q); pics.push(q); }
  /* one thing of the drawing. owner: the block record it belongs to; ps: 1 in the paper space that is shown when the drawing opens */
  const ent = (g, p, ox, oy, owner) => {
    const L = LAYERS[p.lay][0], X = v => n(v - ox), Y = v => n(v - oy), head = t => g(0, t, 5, H(), 330, owner, 100, 'AcDbEntity', 8, L);
    if (p.k === 'pl') {
      if (p.pts.length === 2 && !p.close) { head('LINE'); g(100, 'AcDbLine', 10, X(p.pts[0][0]), 20, Y(p.pts[0][1]), 30, '0.0', 11, X(p.pts[1][0]), 21, Y(p.pts[1][1]), 31, '0.0'); }
      else { head('LWPOLYLINE'); g(100, 'AcDbPolyline', 90, p.pts.length, 70, p.close ? 1 : 0); for (const q of p.pts) g(10, X(q[0]), 20, Y(q[1])); }
    }
    else if (p.k === 'ci') { head('CIRCLE'); g(100, 'AcDbCircle', 10, X(p.c[0]), 20, Y(p.c[1]), 30, '0.0', 40, n(p.r)); }
    else if (p.k === 'ar') { head('ARC'); g(100, 'AcDbCircle', 10, X(p.c[0]), 20, Y(p.c[1]), 30, '0.0', 40, n(p.r), 100, 'AcDbArc', 50, n((p.a0 % 360 + 360) % 360), 51, n((p.a1 % 360 + 360) % 360)); }
    else if (p.k === 'fl') { for (let i = 1; i + 1 < p.pts.length; i++) { const a = p.pts[0], b = p.pts[i], c = p.pts[i + 1]; head('SOLID'); g(100, 'AcDbTrace', 10, X(a[0]), 20, Y(a[1]), 30, '0.0', 11, X(b[0]), 21, Y(b[1]), 31, '0.0', 12, X(c[0]), 22, Y(c[1]), 32, '0.0', 13, X(c[0]), 23, Y(c[1]), 33, '0.0'); } }
    else if (p.k === 'tx') {
      const s = dxfStr(p.s); if (!s.trim()) return; let hh = p.h, rot = p.a, wf = 0, ob = 0;
      if (p.m) { const ul = Math.hypot(p.m[0], p.m[1]) || 1, ux = p.m[0] / ul, uy = p.m[1] / ul, al = p.m[2] * ux + p.m[3] * uy, up = -p.m[2] * uy + p.m[3] * ux; rot = Math.atan2(uy, ux) / D2R; hh = p.h * up; wf = ul / up; ob = Math.atan2(al, up) / D2R; }
      head('TEXT'); g(100, 'AcDbText', 10, X(p.p[0]), 20, Y(p.p[1]), 30, '0.0', 40, n(hh), 1, s); if (rot) g(50, n((rot % 360 + 360) % 360)); if (wf && Math.abs(wf - 1) > 1e-4) g(41, n(wf)); if (ob) g(51, n(ob)); g(7, p.b ? 'CEF-BOLD' : 'Standard');
      if (p.al !== 'l') g(72, p.al === 'c' ? 1 : 2, 11, X(p.p[0]), 21, Y(p.p[1]), 31, '0.0'); g(100, 'AcDbText');
    }
  };
  /* a viewport of a tab. The first one of a paper space is the page itself; the second looks at the sheet in the model. on: this tab is the one shown when the
     drawing opens (its things are in the ENTITIES section and say 67 = 1), as AutoCAD writes it. */
  const vport = (g, t, on, page) => {
    const q = t.q, W = SH.W, Hh = SH.H, cx = W / 2, cy = Hh / 2;
    g(0, 'VIEWPORT', 5, H(), 330, t.br, 100, 'AcDbEntity'); if (on) g(67, 1); g(8, page ? '0' : 'Defpoints', 100, 'AcDbViewport', 10, n(cx), 20, n(cy), 30, '0.0', 40, n(page ? W * 1.1 : W), 41, n(page ? Hh * 1.1 : Hh), 68, on ? (page ? 1 : 2) : 0, 69, on ? (page ? 1 : 2) : 0);
    g(12, n(page ? cx : q.c[0]), 22, n(page ? cy : q.c[1]), 13, '0.0', 23, '0.0', 14, '10.0', 24, '10.0', 15, '10.0', 25, '10.0', 16, '0.0', 26, '0.0', 36, '1.0', 17, '0.0', 27, '0.0', 37, '0.0', 42, '50.0', 43, '0.0', 44, '0.0', 45, n(page ? Hh * 1.1 : q.vh), 50, '0.0', 51, '0.0', 72, 1000, 90, 32768, 1, '', 281, 0, 71, 1, 74, 0);
    g(110, '0.0', 120, '0.0', 130, '0.0', 111, '1.0', 121, '0.0', 131, '0.0', 112, '0.0', 122, '1.0', 132, '0.0', 79, 0, 146, '0.0');
  };
  /* ----- the body first, so that the head can say the last handle ----- */
  const B = buf(); R2K.blocks.forEach(B.put);
  for (const t of tabs.slice(1)) { B(0, 'BLOCK', 5, t.bb, 330, t.br, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockBegin', 2, t.bn, 70, 0, 10, '0.0', 20, '0.0', 30, '0.0', 3, t.bn, 1, ''); vport(B, t, false, true); vport(B, t, false, false); B(0, 'ENDBLK', 5, t.be, 330, t.br, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockEnd'); }
  for (const b of blocks) { B(0, 'BLOCK', 5, b.bb, 330, b.br, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockBegin', 2, b.nm, 70, 0, 10, '0.0', 20, '0.0', 30, '0.0', 3, b.nm, 1, ''); for (const p of b.L) ent(B, p, b.x, b.y, b.br); B(0, 'ENDBLK', 5, b.be, 330, b.br, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockEnd'); }
  const E = buf();
  for (const b of blocks) E(0, 'INSERT', 5, H(), 330, '17', 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockReference', 2, b.nm, 10, n(b.x), 20, n(b.y), 30, '0.0');
  for (const p of loose) ent(E, p, 0, 0, '17');
  for (const q of pics) { const im = q.im;      /* the pictures last: each lies over its frame and the file name written in it */
    E(0, 'IMAGE', 5, q.hd, 330, '17', 100, 'AcDbEntity', 8, LAYERS.ph[0], 100, 'AcDbRasterImage', 90, 0, 10, n(im.x), 20, n(im.y), 30, '0.0', 11, (im.w / q.d.px).toPrecision(10), 21, '0.0', 31, '0.0', 12, '0.0', 22, (im.h / q.d.py).toPrecision(10), 32, '0.0');
    E(13, q.d.px, 23, q.d.py, 340, q.d.h, 70, 3, 280, 0, 281, 50, 282, 50, 283, 0, 360, q.re, 71, 1, 91, 2, 14, '-0.5', 24, '-0.5', 14, n(q.d.px - 0.5), 24, n(q.d.py - 0.5)); }
  if (tabs.length) { vport(E, tabs[0], true, true); vport(E, tabs[0], true, false); }
  const O = buf(), root = [['ACAD_COLOR', 'B'], ['ACAD_GROUP', 'C'], ['ACAD_LAYOUT', 'D'], ['ACAD_MATERIAL', 'E'], ['ACAD_MLEADERSTYLE', 'F'], ['ACAD_MLINESTYLE', '10'], ['ACAD_PLOTSETTINGS', '11'], ['ACAD_PLOTSTYLENAME', '12'], ['ACAD_SCALELIST', '14'], ['ACAD_TABLESTYLE', '15'], ['ACAD_VISUALSTYLE', '16']].concat(defs.size ? [['ACAD_IMAGE_VARS', '32'], ['ACAD_IMAGE_DICT', '33']] : []);
  O(0, 'DICTIONARY', 5, 'A', 330, '0', 100, 'AcDbDictionary', 281, 1); for (const [k, h] of root) O(3, k, 350, h);
  const hOf = r => r[r.indexOf('5') + 1], layout1 = R2K.static.find(r => r[1] === 'LAYOUT' && hOf(r) === '1E');
  for (const r of R2K.static) {
    if (r[1] === 'DICTIONARY' && hOf(r) === 'D') { O(0, 'DICTIONARY', 5, 'D', 330, 'A', 100, 'AcDbDictionary', 281, 1, 3, 'Model', 350, '1A'); if (tabs.length) for (const t of tabs) O(3, t.nm, 350, t.lh); else O(3, 'Layout1', 350, '1E'); continue; }      /* the tabs by name */
    if (r[1] === 'LAYOUT' && hOf(r) === '1E' && tabs.length) {      /* a page for each tab: A3, no margins, the whole page plotted 1:1, in millimetres */
      tabs.forEach((t, i) => { const a = r.slice(); let lay2 = false, c70 = 0, c1 = 0;
        for (let k = 0; k < a.length; k += 2) { const c = a[k];
          if (c === '100' && a[k + 1] === 'AcDbLayout') lay2 = true;
          if (c === '5') a[k + 1] = t.lh;
          else if (!lay2 && (c === '40' || c === '41' || c === '42' || c === '43')) a[k + 1] = '0.0';
          else if (!lay2 && c === '70') a[k + 1] = '688';
          else if (!lay2 && (c === '48' || c === '49')) a[k + 1] = '0.0'; else if (!lay2 && c === '140') a[k + 1] = n(SH.W); else if (!lay2 && c === '141') a[k + 1] = n(SH.H);      /* the plot window: the page */
          else if (lay2 && c === '1') a[k + 1] = t.nm;
          else if (lay2 && c === '71') a[k + 1] = String(i + 1);
          else if (lay2 && (c === '14' || c === '24' || c === '34')) a[k + 1] = '0.0';
          else if (lay2 && c === '15') a[k + 1] = n(SH.W); else if (lay2 && c === '25') a[k + 1] = n(SH.H); else if (lay2 && c === '35') a[k + 1] = '0.0';
          else if (lay2 && c === '330') a[k + 1] = t.br; }
        O.put(a); }); continue; }
    O.put(r);
  }
  if (defs.size) {
    O(0, 'RASTERVARIABLES', 5, '32', 102, '{ACAD_REACTORS', 330, 'A', 102, '}', 330, 'A', 100, 'AcDbRasterVariables', 90, 0, 70, 0, 71, 1, 72, 3);
    O(0, 'DICTIONARY', 5, '33', 330, 'A', 100, 'AcDbDictionary', 281, 1); let di = 0; for (const [file, d] of defs) O(3, 'CEF_' + file.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) + '_' + (++di), 350, d.h);
    for (const [file, d] of defs) { O(0, 'IMAGEDEF', 5, d.h, 102, '{ACAD_REACTORS', 330, '33'); for (const u of d.users) O(330, u.re); O(102, '}', 330, '33', 100, 'AcDbRasterImageDef', 90, 0, 1, file, 10, d.px, 20, d.py, 11, '0.01', 21, '0.01', 280, 1, 281, 0); }
    for (const q of pics) O(0, 'IMAGEDEF_REACTOR', 5, q.re, 330, q.hd, 100, 'AcDbRasterImageDefReactor', 90, 2, 330, q.hd);
  }
  /* ----- the head and the tables ----- */
  const bb = primBox(prims.filter(p => LAYERS[p.lay])), ok = isFinite(bb[0]) && bb[0] <= bb[2], x0 = ok ? bb[0] : 0, y0 = ok ? bb[1] : 0, x1 = ok ? bb[2] : 1, y1 = ok ? bb[3] : 1, seed = H();
  const T = buf();
  T(999, 'G-eSAA CEF DXF R2000', 0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$ACADMAINTVER', 70, 6, 9, '$DWGCODEPAGE', 3, 'ANSI_1252', 9, '$INSBASE', 10, '0.0', 20, '0.0', 30, '0.0', 9, '$EXTMIN', 10, n(x0), 20, n(y0), 30, '0.0', 9, '$EXTMAX', 10, n(x1), 20, n(y1), 30, '0.0');
  T(9, '$LTSCALE', 40, '1.0', 9, '$LUNITS', 70, 2, 9, '$LUPREC', 70, 3, 9, '$INSUNITS', 70, 6, 9, '$MEASUREMENT', 70, 1, 9, '$TILEMODE', 70, 1, 9, '$HANDSEED', 5, seed, 0, 'ENDSEC');
  T(0, 'SECTION', 2, 'CLASSES'); R2K.classes.forEach(T.put); T(0, 'ENDSEC', 0, 'SECTION', 2, 'TABLES');
  /* the view the drawing opens with: the whole of it (zoom extents), on the Model tab */
  { const vp = R2K.vport.slice(), setv = (c, v) => { const i = vp.findIndex((x, k) => k % 2 === 0 && x === String(c)); if (i >= 0) vp[i + 1] = String(v); }, asp = 1.6, w = (x1 - x0) * 1.06, h = (y1 - y0) * 1.06;
    setv(12, n((x0 + x1) / 2)); setv(22, n((y0 + y1) / 2)); setv(40, n(Math.max(h, w / asp, 1))); setv(41, n(asp));
    T(0, 'TABLE', 2, 'VPORT', 5, '8', 330, '0', 100, 'AcDbSymbolTable', 70, 1); T.put(vp); T(0, 'ENDTAB'); }
  T(0, 'TABLE', 2, 'LTYPE', 5, '2', 330, '0', 100, 'AcDbSymbolTable', 70, 4); R2K.ltypes.forEach(T.put);
  T(0, 'LTYPE', 5, dashH, 330, '2', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, 'DASHED', 70, 0, 3, 'Dashed __ __ __ __', 72, 65, 73, 2, 40, '0.75', 49, '0.5', 74, 0, 49, '-0.25', 74, 0, 0, 'ENDTAB');
  T(0, 'TABLE', 2, 'LAYER', 5, '1', 330, '0', 100, 'AcDbSymbolTable', 70, names.length + 2); T.put(R2K.layer0); T.put(R2K.layerDef);
  for (const k of names) T(0, 'LAYER', 5, layH[k], 330, '1', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, LAYERS[k][0], 70, 0, 62, LAYERS[k][1], 6, LAYERS[k][2] ? 'DASHED' : 'Continuous', 370, -3, 390, '13');
  T(0, 'ENDTAB', 0, 'TABLE', 2, 'STYLE', 5, '5', 330, '0', 100, 'AcDbSymbolTable', 70, 2);
  T(0, 'STYLE', 5, '29', 330, '5', 100, 'AcDbSymbolTableRecord', 100, 'AcDbTextStyleTableRecord', 2, 'Standard', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, 'arial.ttf', 4, '', 1001, 'ACAD', 1000, 'Arial', 1071, 34);
  T(0, 'STYLE', 5, boldH, 330, '5', 100, 'AcDbSymbolTableRecord', 100, 'AcDbTextStyleTableRecord', 2, 'CEF-BOLD', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, 'arialbd.ttf', 4, '', 1001, 'ACAD', 1000, 'Arial', 1071, 33554466, 0, 'ENDTAB');
  T(0, 'TABLE', 2, 'VIEW', 5, '7', 330, '0', 100, 'AcDbSymbolTable', 70, 0, 0, 'ENDTAB', 0, 'TABLE', 2, 'UCS', 5, '6', 330, '0', 100, 'AcDbSymbolTable', 70, 0, 0, 'ENDTAB');
  T(0, 'TABLE', 2, 'APPID', 5, '3', 330, '0', 100, 'AcDbSymbolTable', 70, 1); T.put(R2K.appid); T(0, 'ENDTAB'); T.put(R2K.dimstyleTable); T.put(R2K.dimstyle); T(0, 'ENDTAB');
  T(0, 'TABLE', 2, 'BLOCK_RECORD', 5, '9', 330, '0', 100, 'AcDbSymbolTable', 70, 2 + Math.max(0, tabs.length - 1) + blocks.length);
  T(0, 'BLOCK_RECORD', 5, '17', 330, '9', 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, '*Model_Space', 340, '1A', 0, 'BLOCK_RECORD', 5, '1B', 330, '9', 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, '*Paper_Space', 340, '1E');
  for (const t of tabs.slice(1)) T(0, 'BLOCK_RECORD', 5, t.br, 330, '9', 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, t.bn, 340, t.lh);
  for (const b of blocks) T(0, 'BLOCK_RECORD', 5, b.br, 330, '9', 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, b.nm, 340, '0');
  T(0, 'ENDTAB', 0, 'ENDSEC');
  const all = T.a.concat(['0', 'SECTION', '2', 'BLOCKS'], B.a, ['0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'], E.a, ['0', 'ENDSEC', '0', 'SECTION', '2', 'OBJECTS'], O.a, ['0', 'ENDSEC', '0', 'EOF']);
  return all.join('\r\n') + '\r\n';
}
/* o.old: the DXF of beta 4.2 (R12). o.dims: the size in pixels of each picture file, by its name in the ZIP ({ 'photos/photo_01.jpg': [w, h] }); a picture whose
   size is not known keeps its frame and file name only. */
function sheetsDXF(sheets, o) {
  o = o || {}; if (o.old) return sheetsDXF12(sheets);
  let all = [], ox = 0; const k0 = 1 / (sheets.find(q => q.name === 'TOP VIEW') || sheets[0]).s, seen = {}, lay = [], imgs = [], dims = o.dims || {};
  for (const sh of sheets) {
    const k = sh.N ? 1 / sh.s : k0, G = new Gfx(), t3 = (String(sh.name || 'S').replace(/[^A-Za-z]/g, '').slice(0, 3) || 'S').toUpperCase(); seen[t3] = (seen[t3] || 0) + 1; const tag = t3 + (seen[t3] > 1 ? seen[t3] : '');
    for (const im of sh.images) { const d = dims[im.file];
      fitTx(G, [im.x + im.w / 2, im.y + im.h / 2 - 0.8], (im.logo ? 'LOGO: ' : 'PICTURE: ') + im.file, 1.8, im.w - 2, 'ph', 'c');      /* under the picture: it shows when the file is not beside the DXF */
      if (d && d[0] > 0 && d[1] > 0) imgs.push({ file: im.file, px: d[0], py: d[1], x: ox + im.x * k, y: im.y * k, w: im.w * k, h: im.h * k }); }
    all = all.concat(xfPrims(sh.prims.concat(G.p), k, 0, ox, 0).map(p => { if (p.g) p.g = tag + '_' + p.g; return p; }));
    lay.push({ name: DXF_TAB[sh.name] || sh.name, c: [ox + SH.W * k / 2, SH.H * k / 2], vh: SH.H * k }); ox += SH.W * k * 1.06;
  }
  return toDXF2K(all, lay, imgs);
}
function toKML(S, g) {
  const c = p => { const q = g.ll(p[0], p[1]); return q[1].toFixed(8) + ',' + q[0].toFixed(8) + ',0'; }, si = S.site, L = si.L, W = si.W;
  const poly = (name, P, st) => '<Placemark><name>' + esc(name) + '</name><styleUrl>#' + st + '</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>' + P.concat([P[0]]).map(c).join(' ') + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>';
  const line = (name, P, st) => '<Placemark><name>' + esc(name) + '</name><styleUrl>#' + st + '</styleUrl><LineString><coordinates>' + P.map(c).join(' ') + '</coordinates></LineString></Placemark>';
  const sty = (id, col, wd) => '<Style id="' + id + '"><LineStyle><color>' + col + '</color><width>' + wd + '</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>';
  let k = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + esc((si.name || 'CEF plan') + (si.id ? ' ' + si.id : '')) + '</name>' + sty('per', 'ff000000', 2) + sty('ex', 'ffc8621f', 2) + sty('pp', 'ff2a30d1', 2) + sty('foc', 'ff2a30d1', 4) + sty('lad', 'ff578a1b', 2);
  k += poly('Perimeter ' + f1(L) + ' x ' + f1(W) + ' m', [[0, 0], [L, 0], [L, W], [0, W]], 'per');
  for (const el of S.els) k += poly(elLabel(S, el), elPoly(el), el.st === 'P' ? 'pp' : 'ex');
  for (const r of S.runs) if (r.pts.length > 1) k += line(runCap(r), r.pts, r.st === 'P' ? 'pp' : r.kind === 'ladder' ? 'lad' : 'ex');
  { const rg = routeGeom(S), CB = cables(S), many = CB.filter(cableDrawn).length > 1; CB.forEach((R, c) => { const sm = rg.parts[c].sum, w = many ? ' (cable ' + (c + 1) + ')' : ''; if (R.ae.pts.length > 1) k += line('FOC AE ' + R.ae.cable + w + ', ' + f1(sm.ae) + ' m with loops', R.ae.pts.map(p => [p.x, p.y]), 'foc'); if (R.ug.pts.length > 1) k += line('FOC UG ' + R.ug.cable + w + ', ' + f1(sm.ugt) + ' m', R.ug.pts.map(p => [p.x, p.y]), 'foc'); }); }
  S.photos.forEach((ph, i) => { if (ph.placed) k += '<Placemark><name>Photo ' + (i + 1) + '</name><description>' + esc(ph.cap || '') + '</description><Point><coordinates>' + c([ph.x, ph.y]) + '</coordinates></Point></Placemark>'; });
  return k + '</Document></kml>\n';
}

/* ---------- PDF (A3 landscape, one page per sheet) ---------- */
async function toPDF(sheets, IMG, S) {
  const L = PDFLib, K = 72 / 25.4, pdf = await L.PDFDocument.create();
  pdf.setTitle('CEF plan ' + (S.site.name || '') + (S.site.id ? ' ' + S.site.id : '')); pdf.setCreator('G-eSAA CEF-Plan demo'); pdf.setProducer('G-eSAA CEF-Plan demo');
  const fR = await pdf.embedFont(L.StandardFonts.Helvetica), fB = await pdf.embedFont(L.StandardFonts.HelveticaBold);
  for (const sh of sheets) {
    const pg = pdf.addPage([SH.W * K, SH.H * K]);
    for (const im of sh.images) { const src = IMG && IMG[im.id]; if (!src) continue; try { const emb = /^data:image\/png/.test(src) ? await pdf.embedPng(src) : await pdf.embedJpg(src); pg.drawImage(emb, { x: im.x * K, y: im.y * K, width: im.w * K, height: im.h * K }); } catch (e) { } }
    for (const lay in LAYERS) {
      const Ly = LAYERS[lay], col = L.rgb(Ly[4][0], Ly[4][1], Ly[4][2]), ops = [L.pushGraphicsState(), L.setLineWidth(Ly[5] * K), L.setStrokingColor(col), L.setFillingColor(col), L.setLineCap(1), L.setLineJoin(1)];
      if (Ly[2]) ops.push(L.setDashPattern([2.4 * K, 1.3 * K], 0));
      const path = (pts, close) => { ops.push(L.moveTo(pts[0][0] * K, pts[0][1] * K)); for (let i = 1; i < pts.length; i++) ops.push(L.lineTo(pts[i][0] * K, pts[i][1] * K)); if (close) ops.push(L.closePath()); };
      const arc = (c, r, a0, a1) => { const sw = a1 - a0, n = Math.max(6, Math.ceil(Math.abs(sw) / 7)), pts = []; for (let i = 0; i <= n; i++) { const a = (a0 + sw * i / n) * D2R; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } return pts; };
      const texts = [];
      for (const p of sh.prims) {
        if (p.lay !== lay) continue;
        if (p.k === 'pl') { path(p.pts, p.close); ops.push(L.stroke()); }
        else if (p.k === 'ci') { path(arc(p.c, p.r, 0, 360), true); ops.push(L.stroke()); }
        else if (p.k === 'ar') { let sw = ((p.a1 - p.a0) % 360 + 360) % 360; if (sw === 0) sw = 360; path(arc(p.c, p.r, p.a0, p.a0 + sw), false); ops.push(L.stroke()); }
        else if (p.k === 'fl') { path(p.pts, true); ops.push(L.fill()); }
        else texts.push(p);
      }
      ops.push(L.popGraphicsState());
      for (let i = 0; i < ops.length; i += 4000) pg.pushOperators(...ops.slice(i, i + 4000));
      for (const p of texts) {
        const s = p.s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'), f = p.b ? fB : fR, size = p.h / CAP * K, wd = f.widthOfTextAtSize(s, size), sh2 = p.al === 'c' ? wd / 2 : p.al === 'r' ? wd : 0, ca = Math.cos(p.a * D2R), sa = Math.sin(p.a * D2R);
        if (p.m) { pg.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(p.m[0], p.m[1], p.m[2], p.m[3], p.p[0] * K, p.p[1] * K)); pg.drawText(s, { x: -sh2, y: 0, size, font: f, color: col }); pg.pushOperators(L.popGraphicsState()); }
        else pg.drawText(s, { x: p.p[0] * K - sh2 * ca, y: p.p[1] * K - sh2 * sa, size, font: f, color: col, rotate: L.degrees(p.a) });
      }
    }
  }
  return await pdf.save();
}

function baseName(S) { return String(S.site.id || S.site.name || 'CEF').trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'CEF'; }
/* the note that says what follows the OSP standard, when the plan has any of it */
function stdNote(S) {
  const g = routeGeom(S), t = [];
  if (S.runs.some(r => r.kind === 'conduit') || g.exits.length || g.risers.length || g.padx.length) t.push('CONDUIT: 2 RUNS OF ' + PVC_MM + ' mm PVC, CONCRETE ENCASED, EACH WITH 4 x 32 mm HDPE SUB-DUCTS. THE CABLE IS IN ONE SUB-DUCT; THE SPARE RUN IS CLOSED WITH A BLANK DUCT PLUG.');
  if (g.exits.length || S.els.some(e => e.t === 'exit')) t.push('RISER PIPE AT THE TOWER END: G.I. PIPE ' + PVC_MM + ' mm IN A CONCRETE BLOCK.');
  if (g.padx.length) t.push('EXIT PIPE: ' + PVC_MM + ' mm, BUILT INTO THE BASE PAD; THE CABLE COMES UP THROUGH IT.' + (g.padx.some(x => x.n > 1) ? ' THE SPARE PIPE IS CLOSED WITH A BLANK DUCT PLUG.' : ''));      /* (14 Nov 17:00) */
  if (g.risers.length || g.join) t.push(g.join && g.join.none ? 'RISER AND LOOP HOLDER TO THE OSP STANDARD. NO CLOSURE ON THE RISER POLE: THE DESIGN DOES NOT NEED ONE.' : 'RISER, CLOSURE AND LOOP HOLDER TO THE OSP STANDARD.');
  return t.join(' ');
}
function readme(S, base, g, sheets) {
  const si = S.site, n = S.photos.length;
  return ['CEF PLAN - EXPORT FROM THE G-eSAA CEF-PLAN DEMO', 'Exported: ' + isoDate(), 'Site: ' + (si.name || '(no name)') + (si.id ? '  ID: ' + si.id : ''), S.sample ? 'NOTE: this is the made-up sample site, not a real survey.' : '', '',
    'FILES', base + '_CEF_sheets.dxf', '  AutoCAD DXF. The Model tab holds the sheets side by side, in the order of the hand-made plans: cover page, table of contents, legend and notes, isometric with the part details and the CEF table, top view, then the details and photo pages when they were asked for at the export. Each sheet also has a layout tab of its own (an A3 page that shows that sheet).', '  1 drawing unit = 1 metre. The top view measures true. In the isometric, lengths along the three axes measure true.', '  The details sheet is enlarged by the same factor as the top view sheet. Its details are drawn larger than the site, each at the scale written under its title, so they do not measure true in the DXF.', '  Sheet scales at A3: isometric 1:' + ((sheets.find(q => q.name === 'ISOMETRIC') || {}).N || '-') + ', top view 1:' + ((sheets.find(q => q.name === 'TOP VIEW') || {}).N || '-') + '.', '  The photos and the logos are linked pictures: keep the photos and logos folders beside the DXF, as they are in this ZIP. A picture whose file is missing shows its file name.',
    base + '_CEF.pdf', '  The same sheets on A3 landscape, with the photos.',
    g ? base + '_CEF.kml' : '(no KML: latitude and longitude are empty)', g ? '  Perimeter, elements, cable ladders, the AE and UG fibers and photo points for Google Earth.' : '',
    n ? 'photos/  ' + n + ' picture' + (n === 1 ? '' : 's') + ', numbered as on the plan.' : '(no photos added)', base + '_CEF_sketch.json', '  The sketch itself. Open it again in the demo from the Export tab.', '',
    'LAYERS', ...Object.keys(LAYERS).map(k => '  ' + LAYERS[k][0] + '  (colour ' + LAYERS[k][1] + (LAYERS[k][2] ? ', dashed' : '') + ')'), '',
    'LIMITS OF THIS DEMO', '  The sheet frame is generic. It is not the official CEF template.', '  The perimeter is a rectangle. Positions and sizes are whatever was typed or dragged in the sketch.', '  Towers and equipment are models drawn by the app, not the blocks of the template. Towers are drawn at true size. A tower higher than 15 m is drawn from the ground up to half its height, or to the height set for the site, and a break line shows where it is cut. Anything buried is ' + f1(UGD) + ' m deep unless another depth was typed in the sketch. Names written on the bodies of equipment are DXF text with an oblique angle, so that they lie in the isometric plane.', '  The position in the KML is only as good as the coordinates and the compass bearing that were entered.', ''].join('\r\n');
}
