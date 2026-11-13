'use strict';
/* ---------- basics ---------- */
const D2R = Math.PI / 180, C30 = Math.cos(Math.PI / 6);
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const f0 = v => String(Math.round(v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = v => Math.round(v * 10) / 10;
const uid = () => 'e' + Math.random().toString(36).slice(2, 8);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f2 = v => String(Math.round(v * 100) / 100);
const r3 = v => Math.round(v * 1000) / 1000;
const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
const HELV = [278,278,355,556,556,889,667,222,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,222,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const CAP = 0.718;
/* width of a text whose capital letters are h high */
function textW(s, h) { let w = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); w += (c >= 32 && c <= 126) ? HELV[c - 32] : 600; } return w / 1000 * h / CAP; }
function wrap(s, n) { const out = []; for (const para of String(s).split('\n')) { let cur = ''; for (const w of para.split(' ')) { if (cur && (cur + ' ' + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } out.push(cur); } return out; }

/* ---------- layers: [DXF name, AutoCAD colour, dashed, screen colour variable, PDF rgb, line weight mm] ---------- */
const LAYERS = {
  dt: ['CEF-DETAIL', 9, 0, '--d-dim', [0.55, 0.59, 0.65], 0.10],
  bl: ['BLDG_LAYOUT', 7, 0, '--d-ink', [0.10, 0.13, 0.17], 0.30],
  tw: ['CEF-TOWER', 8, 0, '--d-tower', [0.25, 0.29, 0.36], 0.18],
  eq: ['ODC', 161, 0, '--d-exis', [0.14, 0.40, 0.78], 0.30],
  ex: ['CEF-EXISTING', 5, 0, '--d-exis', [0.14, 0.40, 0.78], 0.30],
  ld: ['LADDER', 3, 0, '--d-ladder', [0.13, 0.52, 0.34], 0.18],
  pp: ['CEF-PROPOSED', 1, 0, '--d-prop', [0.82, 0.19, 0.16], 0.35],
  ug: ['P-UG_FOC', 12, 0, '--d-prop', [0.82, 0.19, 0.16], 0.60],
  ae: ['P-AERIAL_FOC', 12, 1, '--d-prop', [0.82, 0.19, 0.16], 0.50],
  tx: ['CEF-TEXT', 7, 0, '--d-ink', [0.10, 0.13, 0.17], 0.15],
  tp: ['CEF-TEXT-PROPOSED', 1, 0, '--d-prop', [0.82, 0.19, 0.16], 0.15],
  dm: ['CEF-DIM', 8, 0, '--d-dim', [0.42, 0.46, 0.53], 0.13],
  ln: ['CEF-LENGTH', 1, 0, '--d-prop', [0.82, 0.19, 0.16], 0.15],          /* the length of a piece of a proposed cable, conduit or trench: in red, as all that is proposed (beta 4.2; green before) */
  ph: ['CEF-PHOTO', 6, 0, '--d-photo', [0.48, 0.27, 0.84], 0.25],
  fr: ['CEF-FRAME', 7, 0, '--d-ink', [0.10, 0.13, 0.17], 0.35],
  lot: ['CEF-LOT', 8, 1, '--d-dim', [0.42, 0.46, 0.53], 0.18],
  hd: ['CEF-BELOW-GROUND', 5, 1, '--d-exis', [0.14, 0.40, 0.78], 0.13],
  hp: ['CEF-BELOW-GROUND-PROP', 1, 1, '--d-prop', [0.82, 0.19, 0.16], 0.13],
  fh: ['P-FOC-BEHIND', 12, 1, '--d-prop', [0.82, 0.19, 0.16], 0.25],
  nd: ['CEF-INSIDE', 5, 1, '--d-exis', [0.14, 0.40, 0.78], 0.18],             /* inside a cabin, seen through its walls */
  np: ['CEF-INSIDE-PROP', 1, 1, '--d-prop', [0.82, 0.19, 0.16], 0.18]
};

/* drawn on the screen only, never exported: what is outside a cabin while its inside is sketched, and what is inside it on the site sketch */
const SLAY = { gh: ['', 8, 1, '--d-ghost', [0.6, 0.65, 0.71], 0.16] };

/* ---------- what can be placed ---------- */
const UGD = 1.5, EXH = 0.4;                    /* the usual depth of anything buried; how far an exit conduit stands out of the ground */
/* Dimensions read from the OSP standard drawings, in metres.
   Closure on a pole: the messenger wire is 5.5 m above ground on a 9.14 m pole that stands 1.5 m in the ground. The loop, 0.4 m across at most, sits in its holder 0.1 m above the wire; the closure, 0.45 m high, stands 0.1 m above the loop.
   Riser: concrete encasement 0.406 m above ground and 1.32 m below, 100 mm of concrete on each side of the 270 mm pole; G.I. pipe held by stainless straps 0.585, 0.838 and 0.838 m apart; above it a U-guard with a strap pipe every 0.6 m; the bend below ground has a 1 m radius.
   Conduit, as on the hand-made CEF plans (2022 to 2026): two runs of 114.3 mm PVC, concrete encased, each with four 32 mm HDPE sub-ducts; the G.I. riser pipe is 114.3 mm too.
   Where the conduit comes out of the ground: a concrete block with the pipe the cable is in and the spare pipe, which is closed with a blank duct plug. */
const STD = { msg: 5.5, poleUp: 7.64, poleIn: 1.5, loopD: 0.4, gap: 0.1, cloH: 0.45, cloR: 0.095, encUp: 0.406, encDn: 1.32, encW: 0.47, gi: [0.585, 0.838, 0.838], ugd: [0.6, 0.6, 0.6, 0.6], bendR: 1, hdpe: 0.1143, sub: 0.032, sleeve: 0.114, exitW: 0.42 };
const LOOPZ = STD.gap + STD.loopD / 2, CLOZ = 2 * STD.gap + STD.loopD, bendR = d => Math.min(STD.bendR, Math.max(0.05, d - 0.03));      /* the bend below a riser or an exit conduit: 1 m radius where the depth allows it */      /* above the wire: the middle of the loop, and the bottom of the closure */
/* service boxes of the standard: the frame as it shows at ground level, how deep the box goes, its inside size in mm, and how deep its conduit comes in */
const SBOX = { A1: { w: 0.8, d: 0.8, dp: 0.85, inn: '500x500x700', cd: 0.1 }, A2: { w: 0.8, d: 0.8, dp: 0.85, inn: '500x500x700', cd: 0.2 }, B1: { w: 1, d: 0.75, dp: 0.65, inn: '700x500x500', cd: 0.1 }, B2: { w: 1, d: 0.75, dp: 0.65, inn: '700x500x500', cd: 0.2 } };
/* the riser on a pole whose cable is zc above the datum and whose ground is at g: where the encasement ends, where the G.I. pipe ends and the U-guard ends, and the heights of their straps */
function riserParts(g, zc) {
  const e = g + STD.encUp, gi = [], ug = []; let z = e; for (const q of STD.gi) { z += q; gi.push(z); }
  const giTop = Math.max(e + 0.2, Math.min(z, zc - 1)); let t = giTop; for (const q of STD.ugd) { t += q; ug.push(t); }
  const ugTop = Math.max(giTop, Math.min(t + 0.1, zc - 0.3));
  return { e, giTop, ugTop, gi: gi.filter(q => q <= giTop + 1e-6), ug: ug.filter(q => q <= ugTop - 0.04) };
}
const TYPES = {
  t3: { n: '3-legged tower', s: 'Tower', g: 'tower', w: 5, d: 5, th: 45 },
  t4: { n: '4-legged tower', s: 'Tower', g: 'tower', w: 6, d: 6, th: 50 },
  guy: { n: 'Guyed mast', s: 'Guyed mast', g: 'tower', w: 0.7, d: 0.7, th: 60, ar: 8 },
  mono: { n: 'Monopole', s: 'Monopole', g: 'tower', w: 1.2, d: 1.2, th: 30, rd: 1 },
  tad: { n: 'Tadpole', s: 'Tadpole', g: 'tower', w: 0.5, d: 0.5, th: 15, rd: 1 },      /* beta 4.2 (22:24): asked for as a kind of monopole. No drawing of one was to be found: it is drawn as its name says, a slim pole with a wider head for the antennas */
  palm: { n: 'Palm-tree tower', s: 'Palm tower', g: 'tower', w: 0.9, d: 0.9, th: 25, rd: 1 },
  ezm: { n: 'Easy macro pole', s: 'Easy macro', g: 'tower', w: 0.3, d: 0.3, th: 10, rd: 1 },
  rtp: { n: 'Rooftop pole', s: 'Rooftop pole', g: 'tower', w: 0.2, d: 0.2, th: 6, rd: 1 },
  rtt: { n: 'Rooftop mini tower', s: 'Mini tower', g: 'tower', w: 1.5, d: 1.5, th: 9 },
  cow: { n: 'Cell on wheels', s: 'COW', g: 'tower', w: 2.4, d: 6, th: 15 },
  pad: { n: 'Base pad', s: 'Base pad', g: 'equip', w: 4, d: 2.5, h: 0.3 },
  odc: { n: 'Outdoor cabinet', s: 'ODC', g: 'equip', w: 0.8, d: 0.8, h: 1.9, cn: 'ODC', num: 1 },
  cabin: { n: 'Cabin', s: 'Cabin', g: 'equip', w: 3, d: 4, h: 2.8, num: 1 },
  gen: { n: 'Genset', s: 'Genset', g: 'equip', w: 2.4, d: 1.1, h: 1.4 },
  tank: { n: 'Fuel tank', s: 'Fuel tank', g: 'equip', w: 2.2, d: 1, h: 1.6 },
  box: { n: 'Other structure', s: 'Structure', g: 'equip', w: 1, d: 1, h: 1, cn: 'STRUCTURE' },
  epole: { n: 'Existing pole', s: 'Pole', g: 'equip', w: 0.27, d: 0.27, h: STD.poleUp, rd: 1, cn: 'POLE' },
  hh: { n: 'Hand hole', s: 'Hand hole', g: 'equip', w: 1, d: 1, h: 0.05, dp: UGD, cn: 'HH' },
  rpole: { n: 'Riser pole', s: 'Riser pole', g: 'foc', w: 0.27, d: 0.27, h: STD.poleUp, rd: 1, st: 'P' },
  odf: { n: 'ODF', s: 'ODF', g: 'foc', w: 0.5, d: 0.4, h: 0.4, st: 'P', size: '48F', ru: 2 },
  clo: { n: 'Hybrid closure', s: 'Closure', g: 'foc', w: 0.5, d: 0.3, h: 0.3, st: 'P', z: 0 },
  sbox: { n: 'Service box', s: 'Service box', g: 'foc', w: 0.6, d: 0.6, h: 0.1, dp: UGD, st: 'P' },
  exit: { n: 'Exit conduit', s: 'Exit conduit', g: 'foc', w: STD.exitW, d: STD.exitW, h: EXH, st: 'P', cn: 'EXIT CONDUIT' },
  enc: { n: 'Concrete encasement', s: 'Encasement', g: 'foc', w: 0.6, d: 0.6, h: 0.6, st: 'P' },
  /* inside a cabin */
  rack: { n: 'Equipment rack', s: 'Rack', g: 'room', w: 0.6, d: 0.6, h: 2.05, num: 1 },
  runit: { n: 'Rack equipment', s: 'Equipment', g: 'room', w: 0.48, d: 0.4, h: 0.09, ru: 2 },
  port: { n: 'Porthole', s: 'Porthole', g: 'room', w: 0.5, d: 0.1, h: 0.36, z: 2.35 },
  ac: { n: 'Aircon unit', s: 'Aircon', g: 'room', w: 0.8, d: 0.3, h: 0.6, z: 1.7, cn: 'AIRCON' }          /* the outdoor unit, on the outside of a cabin wall; z: its bottom above the floor */
};
/* how a piece of fiber runs. The AE fiber is always aerial. The UG fiber takes its run from what is drawn under it, or from what is set by hand. */
const LEG = {
  aerial: { n: 'Aerial (AE)', lay: 'ae' },
  ug: { n: 'Underground, new conduit (open trench)', lay: 'ug' },
  xug: { n: 'Underground, existing conduit', lay: 'ug' },
  ladder: { n: 'On cable ladder', lay: 'ug' },
  open: { n: 'In the open, nothing carries it', lay: 'ug' },
  liquid: { n: 'Liquid-tight flexible conduit', lay: 'ug' },
  wall: { n: 'On wall, with wall strap', lay: 'ug' }
};
/* lines the surveyor draws: z = usual height above ground, w = usual width or pipe size, dp = usual depth when buried */
const RUNS = {
  ladder: { n: 'Cable ladder', cap: 'CABLE LADDER', z: 2.2, w: 0.4 },
  conduit: { n: 'Conduit pipe', cap: 'CONDUIT', z: 0, w: STD.hdpe, dp: UGD },
  encase: { n: 'Concrete-encased conduit', cap: 'ENCASED CONDUIT', z: 0, w: 0.4, dp: UGD },
  trench: { n: 'Open trench', cap: 'OPEN TRENCH', z: 0, w: 0.4, dp: UGD },
  part: { n: 'Partition wall', cap: 'PARTITION', z: 0, w: 0.1, room: 1 }          /* inside a cabin only: a wall from floor to ceiling that divides the room. It carries no cable. */
};
const runLayer = r => r.kind === 'part' ? 'bl' : r.st === 'P' ? 'pp' : r.kind === 'ladder' ? 'ld' : 'ex';
function runLen(r) { let s = 0; for (let i = 0; i + 1 < r.pts.length; i++) s += Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]); return s; }
/* a trench is always below ground; a conduit is buried unless it is given a height above ground */
const buried = r => r.kind === 'trench' || (r.kind !== 'ladder' && r.kind !== 'part' && num(r.z, 0) < 0.01);
const runDepth = r => buried(r) ? Math.max(0.1, num(r.dp, UGD)) : 0;
/* The hand-made plans draw what is buried at ground level: a narrow strip for the conduit with the cable in it, a flat box for a service box, no depth. The isometric does the same unless the site asks for depth.
   The model keeps the real depth, and so do the lengths and the tables: only the drawing is flat. While FLAT is set, what is buried is drawn just under the ground line: 0.3 m, which is still deep enough for the route to tell where a cable comes out of the ground. */
const LONGNAME = 28;                             /* a name longer than this is written in a few lines in clear space, with a leader */
let FLAT = false;
const FLATD = 0.3, flatD = d => FLAT ? Math.min(d, FLATD) : d, runDepthD = r => flatD(runDepth(r)), flatOn = S => !S.room && (S.site || {}).below === 'flat';      /* (beta 4.2: with its depth unless the plan says at ground level) */
const PVC_MM = '114.3', SHALLOW = 1;      /* a trench less than 1 m deep is a shallow trench */
/* beta 4.2 (19:25): r.n = 1 or 2 runs (2 unless said), r.dia = 32, 50 or 114.3 mm (114.3 unless said), r.conc === false = no concrete round the conduit */
const runN = r => num(r.n, 2) === 1 ? 1 : 2, runMM = r => { const d = num(r.dia, 114.3); return Math.abs(d - 32) < 0.5 ? '32' : Math.abs(d - 50) < 0.5 ? '50' : PVC_MM; }, runConc = r => r.conc !== false, runShallow = r => r.kind === 'trench' && runDepth(r) < SHALLOW - 1e-6;
/* labels say as little as possible: the name, and a depth only when it is not the usual one */
const deepNote = d => Math.abs(d - UGD) > 0.04 ? ' ' + f1(d) + ' m DEEP' : '';
const runCap = r => r.name ? String(r.name).toUpperCase() : r.kind === 'trench' ? (runShallow(r) ? 'SHALLOW TRENCH' : 'OPEN TRENCH') + deepNote(runDepth(r)) : (r.kind === 'conduit' || r.kind === 'encase') && (r.n != null || r.dia != null) ? runN(r) + ' RUN ' + RUNS[r.kind].cap + ' ' + runMM(r) + 'mm' : (RUNS[r.kind] || RUNS.ladder).cap;
/* on the drawing a proposed run says so, and a proposed trench is named as on the hand-made plans */
const runLabel = r => r.name || r.st !== 'P' || r.kind === 'part' ? runCap(r) : r.kind === 'trench' ? 'PROPOSED ' + (runShallow(r) ? 'SHALLOW' : 'OPEN') + ' TRENCH' + (runConc(r) ? ', CONCRETE ENCASED' : '') + deepNote(runDepth(r)) : 'PROPOSED ' + runCap(r);
/* Several proposed trenches carry the same conduit: only the longest is named, so that the long name of the hand-made plans is written once. One with a depth of its own still says so. */
function runName(S, r) { if (r.name || r.kind !== 'trench' || r.st !== 'P') return runLabel(r); let best = null; for (const q of S.runs) if (q.kind === 'trench' && q.st === 'P' && !q.name && q.pts.length > 1 && (!best || runLen(q) > runLen(best) + 1e-6)) best = q; return best === r || !best ? runLabel(r) : deepNote(runDepth(r)) ? runCap(r) : ''; }
function newRun(kind, pts) { const K = RUNS[kind] || RUNS.ladder, r = { id: uid(), kind, pts, z: K.z, w: K.w, st: kind === 'trench' ? 'P' : 'E', name: '' }; if (K.dp) r.dp = K.dp; return r; }
const CABLES = ['12C LIGHT', '24C FIG. 8', '48C FIG. 8', '72C FIG. 8', '144C FIG. 8', '12C DUCT', '24C DUCT', '48C DUCT', '72C DUCT', '144C DUCT'];

function blank() {
  return {
    v: 2, sample: false,
    site: { name: '', id: '', lat: '', lon: '', anchor: 'tower', bearing: 0, kind: 'fenced', L: 20, W: 16, fence: 'chb', fh: 2.4, post: 3, wire: 1, bh: 12, by: '', link: '', towerShow: '' },
    gates: [], els: [], runs: [], photos: [], iso: 0, lab: {},
    /* two fibers on one plan: AE on poles, UG in the ground and on the ladder. They meet in the closure on the riser pole. */
    route: { ae: { pts: [], cable: '72C FIG. 8' }, ug: { pts: [], legs: [], cable: '72C DUCT' }, aerialH: STD.msg, endRise: 1, note: '<<< TO INSERTION POINT OF PRIMARY & PROTECTION' }
  };
}
function newEl(t, x, y) {
  const T = TYPES[t], e = { id: uid(), t, x: snap(x), y: snap(y), w: T.w, d: T.d, h: T.h || 0, rot: 0, st: T.st || 'E', name: '' };
  if (T.th) e.th = T.th; if (T.ar) e.ar = T.ar; if (T.size) e.size = T.size; if (T.z != null) e.z = T.z; if (T.dp) e.dp = T.dp; if (T.ru) e.ru = T.ru;
  return e;
}
function sampleSite() {
  const S = blank(); S.sample = true;
  Object.assign(S.site, { name: 'SAMPLE SITE', id: 'MIN0000', lat: 7.11, lon: 124.83, bearing: 24, by: 'Sample surveyor' });
  S.gates.push({ side: 'S', off: 13, w: 4 });
  const add = (t, x, y, o) => { const e = Object.assign(newEl(t, x, y), o || {}); S.els.push(e); return e; };
  add('t3', 13.2, 9.6, { w: 5, th: 45 });
  add('pad', 5.5, 3.6, { w: 5, d: 2.4 });
  add('odc', 4.3, 3.6); add('odc', 6, 3.6);
  add('odf', 6, 3.6);
  add('pad', 4.3, 11.6, { w: 3.6, d: 2.2, h: 0.2 });
  add('gen', 4.3, 11.6);
  add('rpole', 1.4, 14.6);
  add('hh', 16.5, 2.2, { w: 0.8, d: 0.8 });
  add('exit', 8.6, 2.2, { st: 'E' });
  add('exit', 2.6, 3.6, { st: 'P' });      /* (19:25: the app no longer makes up a riser pipe where the cable comes out of the trench; the sample has its exit conduit drawn) */
  S.runs.push(Object.assign(newRun('ladder', [[3.4, 3.6], [12, 3.6], [12, 8.5]]), { z: 2.5 }));
  S.runs.push(newRun('conduit', [[16.5, 2.2], [8.6, 2.2]]));
  S.runs.push(newRun('trench', [[1.4, 14.6], [1.4, 3.6], [2.6, 3.6]]));
  S.route.ae.pts = [{ x: -6, y: 14.6, loop: 0 }, { x: 1.4, y: 14.6, loop: 15 }];
  S.route.ug.pts = [{ x: 1.4, y: 14.6 }, { x: 2.6, y: 3.6 }, { x: 3.4, y: 3.6 }, { x: 6, y: 3.6 }];
  S.route.ug.legs = [{ type: 'auto' }, { type: 'auto' }, { type: 'auto' }];
  return S;
}

/* ---------- plan geometry ---------- */
const rot2 = (x, y, a) => { const c = Math.cos(a * D2R), s = Math.sin(a * D2R); return [x * c - y * s, x * s + y * c]; };
function loc(el, lx, ly) { const q = rot2(lx, ly, el.rot || 0); return [el.x + q[0], el.y + q[1]]; }
function rectAt(c, w, d, rot) { return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(p => { const q = rot2(p[0], p[1], rot || 0); return [c[0] + q[0], c[1] + q[1]]; }); }
const sqr = (c, half, rot) => rectAt(c, half * 2, half * 2, rot);
function elPoly(el) {
  const hull = towerHull(el); if (hull && hull.length === 3) return hull;   /* three-legged footprints are triangles */
  if (TYPES[el.t].rd) { const r = Math.max(el.w / 2, 0.12), o = []; for (let i = 0; i < 16; i++) { const a = i * 22.5 * D2R; o.push([el.x + r * Math.cos(a), el.y + r * Math.sin(a)]); } return o; }
  return rectAt([el.x, el.y], el.w, el.d, el.rot);
}
function polyBox(P) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of P) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } return [x0, y0, x1, y1]; }
function inPoly(p, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function segSeg(a, b, c, d) { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b); return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)); }
function segPoly(a, b, P) { if (inPoly([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], P)) return true; for (let i = 0; i < P.length; i++) if (segSeg(a, b, P[i], P[(i + 1) % P.length])) return true; return false; }
function distSeg(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; const t = l ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l, 0, 1) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }

function sideG(S, side) { const L = S.site.L, W = S.site.W; return { S: { a: [0, 0], u: [1, 0], n: [0, -1], len: L }, N: { a: [0, W], u: [1, 0], n: [0, 1], len: L }, W: { a: [0, 0], u: [0, 1], n: [-1, 0], len: W }, E: { a: [L, 0], u: [0, 1], n: [1, 0], len: W } }[side]; }
function sideSpans(S, side) {
  const g = sideG(S, side);
  const gs = S.gates.filter(q => q.side === side).map(q => [clamp(num(q.off, 0), 0, g.len), clamp(num(q.off, 0) + num(q.w, 0), 0, g.len)]).filter(q => q[1] > q[0] + 0.05).sort((a, b) => a[0] - b[0]);
  const spans = []; let c = 0;
  for (const q of gs) { if (q[0] > c + 1e-6) spans.push([c, q[0]]); c = Math.max(c, q[1]); }
  if (c < g.len - 1e-6) spans.push([c, g.len]);
  return { g, spans, gates: gs };
}
function roofZ(S) { return S.site.kind === 'rooftop' ? Math.max(0, num(S.site.bh, 0)) : 0; }
function inSite(S, p) { return p[0] >= -1e-6 && p[0] <= S.site.L + 1e-6 && p[1] >= -1e-6 && p[1] <= S.site.W + 1e-6; }
function groundZ(S, p) { return S.site.kind === 'rooftop' && inSite(S, p) ? roofZ(S) : 0; }
function baseZ(S, el) {
  let z = groundZ(S, [el.x, el.y]);
  if (el.t !== 'pad') for (const q of S.els) if (q.t === 'pad' && q !== el && inPoly([el.x, el.y], elPoly(q))) { z += q.h; break; }
  return z;
}
/* beta 4.2 (19:25): a cable ladder stands on what it runs over. Its height (r.z) is measured from the top of the base pad it passes over (the highest, when it
   passes over several) and from the ground when it passes over none; the whole ladder is at one level. The user changes r.z as before. */
function padTop(S, p) { let h = 0; for (const q of S.els) if (q.t === 'pad' && inPoly(p, elPoly(q))) h = Math.max(h, Math.max(0, num(q.h, 0))); return h; }
function ladBase(S, r) {
  if (!r || r.kind !== 'ladder' || !S || S.room || !r.pts || r.pts.length < 2 || !S.els.some(e => e.t === 'pad')) return 0; let b = 0;
  for (let i = 0; i + 1 < r.pts.length; i++) { const a = r.pts[i], c = r.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 0.2)); for (let k = 0; k <= n; k++) b = Math.max(b, padTop(S, [a[0] + (c[0] - a[0]) * k / n, a[1] + (c[1] - a[1]) * k / n])); }
  return b;
}
function hostOf(S, p, skip) { for (const q of S.els) if (q !== skip && (q.t === 'odc' || q.t === 'cabin' || q.t === 'rack') && inPoly(p, elPoly(q))) return q; return null; }
/* ---------- racks: an outdoor cabinet, or a rack in a cabin, holds rack-mounted items, each at its own rack units ---------- */
/* beta 4.2: the usual sizes of an outdoor cabinet: key, name, width, depth, height (m). A start: the real cabinet is typed in. */
const ODC_SIZES = [['S', 'Small', 0.6, 0.55, 1.05], ['M', 'Medium', 0.7, 0.7, 1.5], ['L', 'Large', 0.8, 0.8, 1.9]];
const odcSize = e => { const q = ODC_SIZES.find(k => Math.abs(num(e.w, 0) - k[2]) < 0.006 && Math.abs(num(e.d, 0) - k[3]) < 0.006 && Math.abs(num(e.h, 0) - k[4]) < 0.006); return q ? q[0] : ''; };
const RU = 0.04445;                                   /* one rack unit, in metres */
const inRack = e => e.t === 'odf' || e.t === 'runit';
/* beta 4.2 (22:24): an ODF is as tall as its fibre count needs: one rack unit for every 24 fibres (24F 1U, 48F 2U, 72F 3U, 96F 4U, 144F 6U), read from its size.
   A height that was typed (e.ruSet, or one that is not the usual 2 in an older plan) stays. */
const odfRu = e => { const m = /(\d+)/.exec(String(e.size == null ? '' : e.size)), f = m ? +m[1] : 0; return f > 0 ? clamp(Math.ceil(f / 24), 1, 12) : 2; };
const ruTyped = e => !!e.ruSet || (e.ru != null && e.ru !== '' && Math.round(num(e.ru, 2)) !== 2);
const units = e => clamp(Math.round(e.t === 'odf' && !ruTyped(e) ? odfRu(e) : num(e.ru, TYPES[e.t].ru || 2)), 1, 30);
/* the rack space of a host: zb = bottom of unit 1 above the base of the host, n = how many units it has, hw = half the width between the rails */
function rackOf(host) {
  const h = Math.max(0.3, num(host.h, 2)), w = Math.max(0.2, num(host.w, 0.6));
  const zb = host.t === 'odc' ? Math.min(0.1, h * 0.1) + 0.07 : 0.09, zu = host.t === 'odc' ? h - Math.min(0.07, h * 0.08) - 0.06 : h - 0.06;
  return { zb, n: Math.max(1, Math.floor((zu - zb) / RU)), hw: Math.max(0.08, Math.min(0.2413, w / 2 - 0.07)) };
}
function rackHost(S, e) { if (!inRack(e)) return null; for (const q of S.els) if (q !== e && (q.t === 'odc' || q.t === 'rack') && inPoly([e.x, e.y], elPoly(q))) return q; return null; }
function rackItems(S, host) { return S.els.filter(e => inRack(e) && rackHost(S, e) === host); }
/* every item of a rack with the unit it starts at, counted from the bottom: no two share a unit. One whose place was never set sits near the top, under what is already there. */
function rackSlots(S, host) {
  const R = rackOf(host), its = rackItems(S, host), out = [], taken = [], set = e => e.u != null && e.u !== '' && isFinite(+e.u);
  const free = (u, ru) => u >= 1 && u + ru - 1 <= R.n && !taken.some(t => u <= t[1] && u + ru - 1 >= t[0]);
  const seat = (e, want) => { const ru = Math.min(units(e), R.n), max = R.n - ru + 1; want = clamp(Math.round(want) || 1, 1, max); let u = want; for (let d = 0; d <= R.n; d++) { if (free(want - d, ru)) { u = want - d; break; } if (free(want + d, ru)) { u = want + d; break; } } taken.push([u, u + ru - 1]); out.push({ e, u, ru }); };
  for (const e of its) if (set(e)) seat(e, +e.u);
  for (const e of its) if (!set(e)) seat(e, R.n - units(e) - 1);
  return out;
}
function uOf(S, host, e) { const q = rackSlots(S, host).find(k => k.e === e); return q ? q.u : 1; }
/* the free place for an item nearest to the unit asked for; null when every place is taken */
function slotFor(S, host, e, want) {
  const R = rackOf(host), ru = Math.min(units(e), R.n), max = R.n - ru + 1, taken = rackSlots(S, host).filter(q => q.e !== e).map(q => [q.u, q.u + q.ru - 1]);
  const free = u => u >= 1 && u <= max && !taken.some(t => u <= t[1] && u + ru - 1 >= t[0]);
  want = clamp(Math.round(want) || 1, 1, max);
  for (let d = 0; d <= R.n; d++) { if (free(want - d)) return want - d; if (free(want + d)) return want + d; }
  return null;
}
/* write down the place of every rack item, so that it stays where it is when others come and go */
function seatItems(S) { for (const h of S.els) if (h.t === 'odc' || h.t === 'rack') for (const q of rackSlots(S, h)) q.e.u = q.u; }
const uText = q => 'U' + q.u + (q.ru > 1 ? '-' + (q.u + q.ru - 1) : '');
/* ---------- the porthole: where cables go through the wall of a cabin ---------- */
/* the wall of a w x d room a point is nearest to, and the point on that wall. face and u: the same place as the cabin's faces count it */
function wallOf(w, d, x, y) {
  const c = [[x, 'W'], [w - x, 'E'], [y, 'S'], [d - y, 'N']].sort((p, q) => p[0] - q[0])[0][1], m = Math.min(0.3, w / 2, d / 2);
  const px = c === 'W' ? 0 : c === 'E' ? w : clamp(x, m, w - m), py = c === 'S' ? 0 : c === 'N' ? d : clamp(y, m, d - m), lx = px - w / 2, ly = py - d / 2;
  return { side: c, x: px, y: py, n: c === 'W' ? [-1, 0] : c === 'E' ? [1, 0] : c === 'S' ? [0, -1] : [0, 1], face: c === 'S' ? 'F' : c === 'N' ? 'B' : c === 'E' ? 'R' : 'L', u: c === 'S' ? lx : c === 'N' ? -lx : c === 'E' ? ly : -ly };
}
/* a cabin's aircon units, as wall points of the inside sketch (x, y on a wall, with that wall's side, n and face), their size, the height of their bottom, and where they stand on the site (at: the middle of the unit, outside the wall). With no inside sketch: one on the right wall, as before. */
function cabinAcs(el) {
  const w = el.w, d = el.d, h = Math.max(1, num(el.h, 2.8)), I = el.inside;
  const list = I && I.acInit && Array.isArray(I.els) ? I.els.filter(e => e.t === 'ac') : h > 1.6 ? [{ x: w, y: d * 0.7, z: h - 1.1, st: el.st }] : [];
  return list.map(e => { const k = wallOf(w, d, e.x, e.y), aw = num(e.w, 0.8), ad = num(e.d, 0.3), ah = num(e.h, 0.6), o = 0.02 + ad / 2, lc = [k.x - w / 2 + k.n[0] * o, k.y - d / 2 + k.n[1] * o];
    return Object.assign(k, { w: aw, d: ad, h: ah, z: clamp(num(e.z, h - 1.1), 0, Math.max(0, h - ah)), st: e.st || el.st || 'E', id: e.id || null, hz: k.side === 'S' || k.side === 'N', at: loc(el, lc[0], lc[1]), wall: loc(el, k.x - w / 2, k.y - d / 2) }); });
}
/* a cabin's portholes: taken from the sketch of its inside when there is one, else one near the front end of its right wall, which the usual isometric shows */
function cabinPorts(el) {
  const w = el.w, d = el.d, h = Math.max(1, num(el.h, 2.8)), ins = el.inside, P = ins && Array.isArray(ins.els) ? ins.els.filter(e => e.t === 'port') : null;
  const list = P ? P.map(e => ({ x: e.x, y: e.y, z: num(e.z, h - 0.45), st: e.st })) : [{ x: w, y: Math.min(0.4, d / 2), z: h - 0.45, st: el.st }];
  return list.map(q => { const k = wallOf(w, d, q.x, q.y); return Object.assign(k, { z: clamp(q.z, 0.3, Math.max(0.3, h - 0.2)), st: q.st || 'E', at: loc(el, k.x - w / 2, k.y - d / 2) }); });
}
/* a point of the site sketch as the sketch of the inside of a cabin has it, and back */
/* What stands inside a cabin, for the drawings of the site: its racks, the ODF at its rack units, and the cable from the porthole. All in site coordinates, heights above the datum. */
function cabinInside(S, el) {
  const I = el.inside; if (!I || !I.site || !Array.isArray(I.els)) return null;
  const F = p => fromRoom(el, p), zf = baseZ(S, el), out = { racks: [], odfs: [], legs: [], walls: [], fh: Math.max(1.5, num(el.h, 2.8)) };
  for (const r of I.runs || []) if (r.kind === 'part' && r.pts && r.pts.length > 1) { const hw = Math.max(0.03, num(r.w, RUNS.part.w)) / 2; out.walls.push({ pts: r.pts.map(F), sides: [offsetPath(r.pts, hw).map(F), offsetPath(r.pts, -hw).map(F)], z0: zf, z1: zf + out.fh }); }
  for (const q of I.els) {
    if (q.t === 'rack') out.racks.push({ key: 'in' + q.id, s: elLabel(I, q), st: q.st, poly: elPoly(q).map(F), front: [loc(q, -q.w / 2, -q.d / 2 + 0.08), loc(q, q.w / 2, -q.d / 2 + 0.08)].map(F), z0: zf, z1: zf + Math.max(0.3, num(q.h, 2)) });
    if (q.t === 'odf') {
      const h = rackHost(I, q), K = h ? rackOf(h) : null, zb = h ? zf + K.zb + (uOf(I, h, q) - 1) * RU : zf, base = h ? rectAt([h.x, h.y], Math.min(h.w - 0.04, 2 * K.hw + 0.04), Math.max(0.1, h.d - 0.12), h.rot) : elPoly(q);
      out.odfs.push({ key: 'in' + q.id, s: elLabel(I, q), st: q.st, poly: base.map(F), z0: zb, z1: zb + (h ? units(q) * RU : Math.max(0.05, num(q.h, 0.4))) });
    }
  }
  const g = routeGeom(I);
  for (const l of g.legs) { const d = l.plan || 1, ux = (l.b[0] - l.a[0]) / d, uy = (l.b[1] - l.a[1]) / d; if (l.plan - l.ta - l.tb < 0.02) continue; const a = F([l.a[0] + ux * l.ta, l.a[1] + uy * l.ta]), b = F([l.b[0] - ux * l.tb, l.b[1] - uy * l.tb]); out.legs.push({ a: [a[0], a[1], zf + l.za], b: [b[0], b[1], zf + l.zb] }); }
  for (const v of g.verts) { const p = F(v.at); out.legs.push({ a: [p[0], p[1], zf + v.z0], b: [p[0], p[1], zf + v.z1] }); }
  return out;
}
/* the pieces of a path that lie outside every hand hole and service box: an open trench stops at the wall of the box and starts again behind it */
function outsidePits(S, P) {
  const pits = S.els.filter(e => e.t === 'hh' || e.t === 'sbox').map(elPoly); if (!pits.length || !P || P.length < 2) return [P];
  const out = []; let cur = []; const flush = () => { if (cur.length > 1) out.push(cur); cur = []; };
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], cuts = [], add = (t0, t1) => { const p0 = [a[0] + dx * t0, a[1] + dy * t0], p1 = [a[0] + dx * t1, a[1] + dy * t1]; if (!cur.length) cur.push(p0); cur.push(p1); };
    if (Math.abs(dx) + Math.abs(dy) < 1e-9) continue;
    for (const q of pits) { const c = clipConvex(a, dx, dy, q); if (c && c[1] - c[0] > 1e-6) cuts.push(c); }
    cuts.sort((p, q) => p[0] - q[0]); let t = 0;
    for (const c of cuts) { if (c[0] > t + 1e-6) add(t, c[0]); flush(); t = Math.max(t, c[1]); }
    if (t < 1 - 1e-6) add(t, 1);
  }
  flush();
  return out.filter(q => { let l = 0; for (let i = 0; i + 1 < q.length; i++) l += Math.hypot(q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1]); return l > 0.05; });
}
/* the buried pieces of the UG cable that have no conduit drawn under them (a trench only, or nothing): the app takes a conduit there, and draws it */
function ownConduit(rg) { return rg.legs.filter(l => l.f === 'ug' && (l.type === 'ug' || l.type === 'xug') && (!l.run || l.run.kind === 'trench') && l.za < l.g - 0.2 && l.plan - l.ta - l.tb > 0.02).map(l => { const d = l.plan || 1, ux = (l.b[0] - l.a[0]) / d, uy = (l.b[1] - l.a[1]) / d; return { l, a: [l.a[0] + ux * l.ta, l.a[1] + uy * l.ta], b: [l.b[0] - ux * l.tb, l.b[1] - uy * l.tb], open: !!l.run, st: l.type === 'xug' ? 'E' : 'P' }; }); }
function toRoom(el, p) { const q = rot2(p[0] - el.x, p[1] - el.y, -(el.rot || 0)); return [q[0] + el.w / 2, q[1] + el.d / 2]; }
function fromRoom(el, p) { return loc(el, p[0] - el.w / 2, p[1] - el.d / 2); }
/* is a point of the site sketch inside a cabin, further in than mg from its walls? */
function inCabin(el, p, mg) { const q = toRoom(el, p); return q[0] > mg && q[0] < el.w - mg && q[1] > mg && q[1] < el.d - mg; }
/* the part of the piece a to b that lies in a box [x0, y0, x1, y1]: where it starts and ends along the piece (0 to 1), or null */
function clipT(a, b, B) {
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - B[0]], [dx, B[2] - a[0]], [-dy, a[1] - B[1]], [dy, B[3] - a[1]]]) { if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; } const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
  return t1 - t0 > -1e-12 ? [t0, t1] : null;
}
/* What stands and runs outside a cabin, for the sketch of its inside: the drawn runs, the fibers and the outlines of what is near, all in the cabin's own directions.
   lines: on the floor plan, out to mg metres from the walls. lines3: ladders and fibers with their height above the cabin floor, for the inside isometric.
   marks: where a cable ladder or the UG fiber of the site meets a wall of the cabin. That is where a porthole belongs. */
function outsideOf(SITE, el, mg) {
  const w = el.w, d = el.d, B = [-mg, -mg, w + mg, d + mg], B3 = [-1.2, -1.2, w + 1.2, d + 1.2], z0 = baseZ(SITE, el), T = p => toRoom(el, p), lines = [], lines3 = [], marks = [];
  const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const add = (P, kind) => { for (let i = 0; i + 1 < P.length; i++) { const c = clipT(P[i], P[i + 1], B); if (c && c[1] - c[0] > 1e-9) lines.push({ a: at(P[i], P[i + 1], c[0]), b: at(P[i], P[i + 1], c[1]), kind }); } };
  const add3 = (a, b, za, zb, kind) => { const c = clipT(a, b, B3); if (c) { const p = at(a, b, c[0]), q = at(a, b, c[1]); lines3.push({ a: [p[0], p[1], za + (zb - za) * c[0] - z0], b: [q[0], q[1], za + (zb - za) * c[1] - z0], kind }); } };
  const put = (x, y, z, kind) => { const k = wallOf(w, d, x, y); if (!marks.some(m => Math.hypot(m.x - k.x, m.y - k.y) < 0.08)) marks.push({ x: k.x, y: k.y, side: k.side, kind, z }); };
  /* where a line meets the walls: each place it goes through one, and an end that stops at one */
  const meet = (P, kind, zf) => {
    for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], c = clipT(a, b, [0, 0, w, d]); if (!c) continue; if (c[0] > 1e-6) { const p = at(a, b, c[0]); put(p[0], p[1], zf(i, c[0]), kind); } if (c[1] < 1 - 1e-6) { const p = at(a, b, c[1]); put(p[0], p[1], zf(i, c[1]), kind); } }
    for (const [p, i, t] of [[P[0], 0, 0], [P[P.length - 1], P.length - 2, 1]]) { const k = wallOf(w, d, p[0], p[1]), out = p[0] < 0 || p[0] > w || p[1] < 0 || p[1] > d; if (Math.hypot(k.x - p[0], k.y - p[1]) < (out ? 0.6 : 0.15)) put(p[0], p[1], zf(i, t), kind); }
  };
  for (const r of SITE.runs) {
    if (!r.pts || r.pts.length < 2) continue; const hw = Math.max(0.05, num(r.w, (RUNS[r.kind] || RUNS.ladder).w)) / 2;
    if (r.kind === 'ladder') {
      const ST = ladPath(r), lb = ladBase(SITE, r), zs = ST.map(q => groundZ(SITE, q.p) + lb + num(r.z, RUNS.ladder.z));
      for (const sg of [-1, 1]) { const R = ST.map(q => T([q.p[0] + q.n[0] * q.k * hw * sg, q.p[1] + q.n[1] * q.k * hw * sg])); add(R, 'ladder'); for (let i = 0; i + 1 < R.length; i++) add3(R[i], R[i + 1], zs[i], zs[i + 1], 'ladder'); }
      if (ST.length > 1) meet(ST.map(q => T(q.p)), 'ladder', (i, t) => zs[i] + (zs[i + 1] - zs[i]) * t - z0);
    }
    else { add(offsetPath(r.pts, hw).map(T), r.kind); add(offsetPath(r.pts, -hw).map(T), r.kind); }
  }
  const g = routeGeom(SITE), U = g.legs.filter(l => l.f === 'ug');
  for (const l of g.legs) { const a = T(l.a), b = T(l.b); add([a, b], 'foc'); add3(a, b, l.za, l.zb, 'foc'); }
  for (const v of g.verts) { const p = T(v.at); add3(p, p, v.z0, v.z1, 'foc'); }
  if (U.length) meet([T(U[0].a)].concat(U.map(l => T(l.b))), 'foc', (i, t) => U[i].za + (U[i].zb - U[i].za) * t - z0);
  for (const e of SITE.els) { if (e === el || e.t === 'odf' || e.t === 'runit' || e.t === 'clo') continue; const H = TYPES[e.t].g === 'tower' ? towerHull(e) : null, P = (H && H.length > 2 ? H : elPoly(e)).map(T); add(P.concat([P[0]]), 'el'); }
  { const si = SITE.site; add([[0, 0], [si.L, 0], [si.L, si.W], [0, si.W], [0, 0]].map(T), 'site'); }
  return { lines, lines3, marks };
}
/* a cabin's doors: where the sketch of its inside has them, else one in the middle of the front */
function cabinDoors(el) {
  const I = el.inside; if (!I || !Array.isArray(I.gates)) return [{ face: 'F', u: 0, w: Math.min(0.9, el.w) }];      /* the inside sketch holds the doors; it may have none */
  return I.gates.map(q => { const hz = q.side === 'S' || q.side === 'N', len = hz ? el.w : el.d, w = clamp(num(q.w, 0.9), 0.3, len), c = clamp(num(q.off, 0), 0, len - w) + w / 2 - len / 2; return { face: { S: 'F', N: 'B', E: 'R', W: 'L' }[q.side] || 'F', u: q.side === 'S' || q.side === 'E' ? c : -c, w }; });
}
/* beta 4.2: the stairs of a raised base pad. el.steps: [{ side: 'S', 'N', 'E' or 'W' (of the pad before it is turned), off: metres from the left or bottom end
   of that side, w: width }]. Each as { face, u (its middle, along the face), w, n (steps below the top of the pad), rise, tread }. A pad lower than 0.25 m has none. */
const STEP_MIN = 0.25;
function padSteps(el) {
  const h = Math.max(0, num(el.h, 0)); if (el.t !== 'pad' || h < STEP_MIN || !Array.isArray(el.steps)) return [];
  const nr = Math.max(2, Math.round(h / 0.18)), rise = h / nr, tread = 0.28;
  return el.steps.map(q => { const hz = q.side === 'S' || q.side === 'N', len = hz ? el.w : el.d, w = clamp(num(q.w, 1), 0.4, len), c = clamp(num(q.off, 0), 0, len - w) + w / 2 - len / 2; return { face: { S: 'F', N: 'B', E: 'R', W: 'L' }[q.side] || 'F', u: q.side === 'S' || q.side === 'E' ? c : -c, w, n: nr - 1, rise, tread }; });
}
/* a point on the plan at a side of a box-shaped element: u along the side, inset towards the middle */
function faceXY(el, side, u, inset) { return side === 'F' ? loc(el, u, -el.d / 2 + inset) : side === 'B' ? loc(el, -u, el.d / 2 - inset) : side === 'R' ? loc(el, el.w / 2 - inset, u) : loc(el, -el.w / 2 + inset, -u); }
/* the porthole of a cabin that a point of the site sketch sits on */
function portAt(S, p, tol) { for (const e of S.els) if (e.t === 'cabin') for (const q of cabinPorts(e)) if (Math.hypot(q.at[0] - p[0], q.at[1] - p[1]) < (tol || 0.4)) return { cabin: e, port: q, z: baseZ(S, e) + q.z }; return null; }
/* ---------- the inside of a cabin is a sketch of its own: the floor from above, in the cabin's own directions, door at the bottom ---------- */
function syncRoom(R, el) {
  R.room = true; const si = R.site; si.kind = 'room'; si.L = el.w; si.W = el.d; si.fh = Math.max(1.5, num(el.h, 2.8));
  /* A new inside gets one door and one aircon unit, as a cabin has them. After that they are the user's to add, move and remove, down to none. */
  if (!R.doorInit) { if (!Array.isArray(R.gates) || !R.gates.length) R.gates = [{ side: 'S', off: Math.max(0, el.w / 2 - 0.45), w: Math.min(0.9, el.w) }]; R.doorInit = true; }
  if (!R.acInit) { if (si.fh > 1.6 && !R.els.some(e => e.t === 'ac')) R.els.push(Object.assign(newEl('ac', si.L, si.W * 0.7), { x: si.L, y: Math.round(si.W * 0.7 * 100) / 100, z: Math.round((si.fh - 1.1) * 10) / 10, rot: 90, st: el.st || 'E' })); R.acInit = true; }
  return R;
}
function newRoom(el) { const R = blank(); R.route.note = ''; R.els.push(Object.assign(newEl('port', el.w, Math.min(0.4, el.d / 2)), { z: Math.round((Math.max(1.5, num(el.h, 2.8)) - 0.45) * 10) / 10, rot: 90 })); return syncRoom(R, el); }
/* the detail drawings a plan has: the inside of each cabin that has something in it, and each outdoor cabinet that holds rack items */
function details(S) {
  const out = [];
  for (const e of S.els) {
    const I = e.t === 'cabin' ? e.inside : null;
    if (I && I.site && ((I.els || []).some(q => q.t !== 'port' && q.t !== 'ac') || (I.runs || []).length || (((I.route || {}).ug || {}).pts || []).length > 1)) out.push({ k: 'cabin', el: e, title: 'INSIDE OF ' + elLabel(S, e) });
    if (e.t === 'odc' && rackItems(S, e).length) out.push({ k: 'odc', el: e, title: elLabel(S, e) + ', DOOR OPEN' });
  }
  return out;
}
/* how much of a tower the isometric shows: all of a low one, the lower half of a tall one, or up to the height set for the site */
function towerShown(S, el) { const hr = Math.max(1, num(el.th, 10)), want = num(S.site.towerShow, 0); if (['ezm', 'rtp', 'rtt', 'cow'].indexOf(el.t) >= 0) return hr; return Math.min(hr, want > 0 ? Math.max(3, want) : hr <= 15 ? hr : Math.max(15, hr / 2)); }
/* The ladder on a lattice tower. There is one, and it is the tower's own: a cable ladder that reaches the tower joins it, the app does not draw a second one.
   el.lad: 'auto' = it stands where a cable ladder comes through a side of the tower (else in the middle of side 1), a side number, or 'none'. el.ladT: where along that side, 0 to 1. */
const hasLad = el => el.t === 't3' || el.t === 't4';
function towerLad(S, el) {
  if (!hasLad(el) || el.lad === 'none') return null;
  const H = towerHull(el), n = H.length, side = (i, t) => { const a = H[i], b = H[(i + 1) % n]; return { i, t, foot: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }; };
  if (el.lad != null && el.lad !== 'auto' && el.lad !== '' && isFinite(+el.lad)) return side(((+el.lad | 0) % n + n) % n, clamp(num(el.ladT, 0.5), 0.12, 0.88));
  let best = null;
  for (const r of S.runs) {
    if (r.kind !== 'ladder' || r.pts.length < 2) continue;
    for (const [e, p] of [[r.pts[r.pts.length - 1], r.pts[r.pts.length - 2]], [r.pts[0], r.pts[1]]]) {
      const ins = inPoly(e, H);
      for (let i = 0; i < n; i++) {
        const a = H[i], b = H[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], rx = e[0] - p[0], ry = e[1] - p[1], den = rx * dy - ry * dx;
        if (ins && Math.abs(den) > 1e-9) {                 /* the piece that ends inside the tower comes through this side */
          const t = ((a[0] - p[0]) * dy - (a[1] - p[1]) * dx) / den, u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (!best || best.d > 0)) best = { d: 0, i, t: u };
        }
        const u = clamp(((e[0] - a[0]) * dx + (e[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1), d = Math.hypot(e[0] - a[0] - dx * u, e[1] - a[1] - dy * u) + 0.01;
        if ((ins || d < 1) && (!best || d < best.d)) best = { d, i, t: u };      /* or it ends close to this side */
      }
    }
  }
  return best ? Object.assign(side(best.i, clamp(best.t, 0.12, 0.88)), { auto: 1, joined: 1 }) : Object.assign(side(0, 0.5), { auto: 1 });
}
/* sand: dots scattered over the opening of an excavation, the same ones every time it is drawn. put(point) gets each dot; a, b, c, d are the corners in order */
function sandDots(a, b, c, d, put) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), wd = Math.hypot(d[0] - a[0], d[1] - a[1]), N = Math.min(1500, Math.round(len * wd * 46));
  let s = (Math.abs(Math.round((a[0] * 131 + a[1] * 71 + b[0] * 37 + b[1] * 17) * 10)) % 2147483000) + 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < N; k++) { const u = rnd(), v = 0.06 + rnd() * 0.88, p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], q = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u]; put([p[0] + (q[0] - p[0]) * v, p[1] + (q[1] - p[1]) * v]); }
}
const SAND_R = 0.012;
const isPole = e => e.t === 'rpole' || e.t === 'epole';
/* Names on the drawings of the site. A CEF plan is about the fiber, so the names of what belongs to the tower site are left out unless the user turns them on.
   [key, what the Site tab calls it, written by default] */
const NAMES = [['tid', 'Site name and ID on the tower', 1], ['th', 'Tower height', 0], ['cabin', 'Cabin', 0], ['ladder', 'Cable ladder', 0], ['port', 'Porthole', 0], ['gate', 'Gate', 0], ['site', 'Genset, base pad, tank, structure', 1], ['dim', 'Length of each leg: FOC, conduit, trench', 1], ['shade', 'Outline on a base pad under a raised ladder', 1]];
function nameOn(S, k) { if (S.room) return k !== 'tid'; const n = S.site && S.site.names, d = NAMES.find(q => q[0] === k); return n && n[k] != null ? !!n[k] : !d || !!d[2]; }
/* The site name and ID, written as a title beside the top of the tower: bold, capitals, larger than the other names. '' when it is turned off or there is no name. */
function siteTitle(S) { if (S.room || !nameOn(S, 'tid')) return ''; const si = S.site || {}; return labText(S, 'tid', [si.name, si.id].map(v => String(v || '').trim().toUpperCase()).filter(Boolean).join('\n')); }
const titleLines = S => siteTitle(S).split('\n').filter(Boolean);            /* the site name on one line, the ID on the next */
const titleTower = S => siteTitle(S) ? S.els.find(q => TYPES[q.t] && TYPES[q.t].g === 'tower') || null : null;
const TITLE_K = [1.5, 1.3, 1.15, 1];
const nameGrp = el => el.t === 'cabin' ? 'cabin' : el.t === 'gen' || el.t === 'tank' || el.t === 'pad' || el.t === 'box' ? 'site' : null;
/* the size of the names: 'auto' (a name that finds no room is written smaller, down to what is still easy to read, before it gets a leader), or a percentage that the user set */
const txAuto = S => !(S.site && S.site.txt != null && S.site.txt !== '' && S.site.txt !== 'auto');
const txK = S => txAuto(S) ? 1 : clamp(num(S.site.txt, 100), 50, 250) / 100;
const TXS = [1, 0.91, 0.83];                       /* the steps a name is tried at when the size is automatic: 2.2, 2.0 and 1.8 mm on the sheet. 1.8 mm is the usual least height of text on a drawing. */
/* a pole tapers to 0.7 of its foot at the top: its radius dz above its foot. What is fastened to it lies against it at that height. */
const poleR = (pole, dz) => Math.max(pole.w / 2, 0.1) * (1 - 0.3 * clamp(dz / Math.max(0.02, num(pole.h, 0.02)), 0, 1));
const GIR = 0.057;                                  /* half the width of the G.I. riser pipe */
/* the side of a pole that takes the loop holder and the closure: square to the aerial cable, and the riser's side when the pole has a riser */
function poleSide(rg, pole, u) { let n = [-u[1], u[0]]; const r = pole ? rg.risers.find(q => q.pole === pole) : null; if (r && n[0] * r.u[0] + n[1] * r.u[1] < -0.01) n = [-n[0], -n[1]]; return n; }
/* the buried conduit that ends at an exit conduit which no cable uses yet: the way it runs from there, and how deep its lower pipe lies */
function exitRun(S, el) {
  let b = null;
  for (const r of S.runs) if (r.kind !== 'ladder' && r.kind !== 'trench' && buried(r)) for (const e of [0, 1]) {
    const P = r.pts, E = e ? P[P.length - 1] : P[0], N = e ? P[P.length - 2] : P[1], d = Math.hypot(E[0] - el.x, E[1] - el.y), len = Math.hypot(N[0] - E[0], N[1] - E[1]);
    if (d < 0.5 && len > 0.1 && (!b || d < b.d)) b = { d, u: [(N[0] - E[0]) / len, (N[1] - E[1]) / len], dp: runDepthD(r) - STD.hdpe / 2 };
  }
  return b;
}
function poleAt(S, p, r) { for (const e of S.els) if (isPole(e) && Math.hypot(e.x - p[0], e.y - p[1]) < (r || 0.45)) return e; return null; }
/* the aerial cable that meets a point: which way it leaves, and how high it is there */
function aerialAt(rg, p) { for (const l of rg.legs) if (l.type === 'aerial' && l.plan > 0.05) { const da = Math.hypot(l.a[0] - p[0], l.a[1] - p[1]), db = Math.hypot(l.b[0] - p[0], l.b[1] - p[1]); if (Math.min(da, db) < 0.45) { const s = da < db ? 1 : -1; return { u: [(l.b[0] - l.a[0]) / l.plan * s, (l.b[1] - l.a[1]) / l.plan * s], z: da < db ? l.za : l.zb }; } } return null; }
/* a closure put on a pole stands upright on its side, above the loop: its bottom, where the cables go in, is z */
function cloMount(S, rg, el) {
  const pole = poleAt(S, [el.x, el.y], 0.6); if (!pole) return null;
  const ae = aerialAt(rg, [pole.x, pole.y]), u = ae ? ae.u : rot2(1, 0, el.rot || 0), zc = ae ? ae.z : baseZ(S, pole) + (num(el.z, 0) > 0.5 ? num(el.z, 0) : Math.max(0.5, num(S.route.aerialH, STD.msg))), n = poleSide(rg, pole, u), off = poleR(pole, zc + CLOZ - baseZ(S, pole)) + STD.cloR + 0.005;
  return { pole, u, n, z: zc + CLOZ, c: [pole.x + n[0] * off, pole.y + n[1] * off] };
}
function elLayer(el) { const T = TYPES[el.t]; return el.st === 'P' ? 'pp' : T.g === 'tower' ? 'tw' : (el.t === 'epole' || el.t === 'hh') ? 'ex' : 'eq'; }
/* the hand hole or service box a point lies in */
function pitAt(S, p, skip) { for (const e of S.els) if (e !== skip && (e.t === 'hh' || e.t === 'sbox') && Math.hypot(e.x - p[0], e.y - p[1]) < Math.max(e.w, e.d) / 2 + 0.1) return e; return null; }
/* how deep the buried run at a point lies, or the usual depth where none is drawn */
function depthAt(S, p) { let d = 0; for (const r of S.runs) if (buried(r) && onRun(r, p, 0.3)) d = Math.max(d, runDepthD(r)); return d || flatD(UGD); }
/* ---------- label text: the name only. What the user typed replaces it. ---------- */
/* the name of a cable on the drawing: what it is and how long, as on the hand-made plans ("Proposed Duct Single Mode FOC, 72 Fibers: 50.0m") */
function focName(S, rg, f) { const c = String((S.route[f] || {}).cable || '').trim(), L = f === 'ae' ? rg.sum.ae : rg.sum.ugt; return 'PROPOSED ' + (c ? c + ' ' : '') + 'FOC ' + f.toUpperCase() + (L > 0.05 ? ': ' + f1(L) + 'm' : ''); }
function elLabel(S, el) {
  const s = elLabel0(S, el), T = TYPES[el.t]; if (el.name || el.st !== 'P' || !T || T.g === 'tower') return s;      /* a proposed item says so, as on the hand-made plans */
  if (el.t === 'odf') { const h = hostOf(S, [el.x, el.y], el); return 'PROPOSED ' + (el.size ? el.size + ' ' : '') + 'ODF' + (h && h.st !== 'P' && h.t !== 'cabin' ? ' @EXISTING ' + elLabel0(S, h) : ''); }
  return 'PROPOSED ' + s;
}
function elLabel0(S, el) {
  const T = TYPES[el.t]; if (el.name) return String(el.name).toUpperCase();
  const nm = (T.cn || T.s).toUpperCase();
  if (T.g === 'tower') return nm + (nameOn(S, 'th') ? ' ' + f2(Math.round(num(el.th, 0) * 10) / 10) + ' m' : '');      /* its height only when the user asks for it */
  if (el.t === 'sbox' && SBOX[el.ty]) return nm + ' ' + el.ty;                 /* a box of the standard: its type says its size and depth */
  if (el.t === 'hh' || el.t === 'sbox') return nm + deepNote(num(el.dp, UGD));
  if (T.num) { const same = S.els.filter(q => q.t === el.t), i = same.findIndex(q => q.id === el.id); if (same.length > 1 && i >= 0) return nm + ' ' + (i + 1); }       /* ODC 1, ODC 2: so that a detail can say which one it shows */
  return nm;
}
const labRec = (S, key) => (S.lab && S.lab[key]) || null;
function labText(S, key, def) { const r = labRec(S, key); return r && r.t ? String(r.t).toUpperCase() : def; }
/* where the user dragged a label to, measured from its item. v: 'p' on the plan, 'i0' to 'i3' in the isometric, one for each way it can be turned */
function labOff(S, key, v) { const r = labRec(S, key); return r && Array.isArray(r[v]) && isFinite(r[v][0]) && isFinite(r[v][1]) ? r[v] : null; }

/* ---------- FOC route: legs, the vertical parts the app adds, loops, lengths, clashes ---------- */
function edgeCross(S, a, b) {
  const L = S.site.L, W = S.site.W, ts = [], E = [[[0, 0], [L, 0]], [[L, 0], [L, W]], [[L, W], [0, W]], [[0, W], [0, 0]]];
  for (const [c, d] of E) {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) continue;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    if (t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1) ts.push(t);
  }
  return ts.sort((x, y) => x - y);
}
/* The line a cable ladder follows: its drawn points, with each corner turned into a bend, the way a ladder is built.
   Each station has its point p, the direction n square to the ladder (to the left of the way it runs), k: how far the rails stand from p along n as a factor of half the width
   (1 on a straight and in a bend, more at a corner too tight to bend, which is mitred), and c: 1 at the middle of a corner. */
const LADC = new WeakMap();
function ladPath(r) {
  const key = JSON.stringify(r.pts) + '|' + r.w, hit = LADC.get(r); if (hit && hit.key === key) return hit.st;
  const Q = [], st = []; for (const p of r.pts || []) if (!Q.length || Math.hypot(p[0] - Q[Q.length - 1][0], p[1] - Q[Q.length - 1][1]) > 0.02) Q.push([p[0], p[1]]);
  const hw = Math.max(0.05, num(r.w, RUNS.ladder.w)) / 2, n = Q.length, dir = i => { const dx = Q[i + 1][0] - Q[i][0], dy = Q[i + 1][1] - Q[i][1], l = Math.hypot(dx, dy); return [dx / l, dy / l, l]; };
  if (n > 1) {
    const d0 = dir(0); st.push({ p: Q[0], n: [-d0[1], d0[0]], k: 1 });
    for (let i = 1; i < n - 1; i++) {
      const a = dir(i - 1), b = dir(i), turn = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]), half = Math.abs(turn) / 2;      /* turn: to the left is positive */
      if (half < 0.015) { st.push({ p: Q[i], n: [-a[1], a[0]], k: 1 }); continue; }
      /* the radius of the middle line: 0.28 m at the inside rail, but the bend never leaves the drawn corner by more than 0.2 m, and never takes more than 0.45 of a side */
      const rc = Math.min(hw + 0.28, 0.2 / (1 / Math.cos(half) - 1), 0.45 * Math.min(a[2], b[2]) / Math.tan(half));
      if (rc < hw + 0.05 || half > 1.4) { const bx = -a[1] - b[1], by = a[0] + b[0], bl = Math.hypot(bx, by) || 1; st.push({ p: Q[i], n: [bx / bl, by / bl], k: Math.min(3, 1 / Math.max(0.2, Math.cos(half))), c: 1 }); continue; }
      const T = rc * Math.tan(half), sg = turn > 0 ? 1 : -1, t0 = [Q[i][0] - a[0] * T, Q[i][1] - a[1] * T], C = [t0[0] - a[1] * sg * rc, t0[1] + a[0] * sg * rc];
      const m = Math.max(2, Math.ceil(Math.abs(turn) / (Math.PI / 12))), a0 = Math.atan2(t0[1] - C[1], t0[0] - C[0]);
      for (let j = 0; j <= m; j++) { const an = a0 + turn * j / m, rx = Math.cos(an), ry = Math.sin(an); st.push({ p: [C[0] + rx * rc, C[1] + ry * rc], n: [-rx * sg, -ry * sg], k: 1, c: j === Math.round(m / 2) ? 1 : 0 }); }
    }
    const dl = dir(n - 2); st.push({ p: Q[n - 1], n: [-dl[1], dl[0]], k: 1 });
  }
  LADC.set(r, { key, st }); return st;
}
/* along a ladder path: its length, and the place at a distance s from its start: the point p, and v from p to the left rail */
function ladWalk(ST, hw) {
  const D = [0]; for (let i = 1; i < ST.length; i++) D.push(D[i - 1] + Math.hypot(ST[i].p[0] - ST[i - 1].p[0], ST[i].p[1] - ST[i - 1].p[1]));
  const tot = D[D.length - 1] || 0;
  return { D, tot, at: q => { let i = 1; while (i < ST.length - 1 && D[i] < q) i++; const a = ST[i - 1], b = ST[i], t = clamp((q - D[i - 1]) / Math.max(1e-9, D[i] - D[i - 1]), 0, 1), L = (u, v) => u + (v - u) * t; return { p: [L(a.p[0], b.p[0]), L(a.p[1], b.p[1])], v: [L(a.n[0] * a.k, b.n[0] * b.k) * hw, L(a.n[1] * a.k, b.n[1] * b.k) * hw], i: i - 1, t }; } };
}
/* the line a fiber follows on a run: a ladder with its bends, anything else as it was drawn */
const runLine = r => r.kind === 'ladder' ? ladPath(r).map(q => q.p) : r.pts;
/* where a point lies on a drawn run: how far along it, on which piece, and the point itself */
function onRun(r, p, tol) {
  let best = null, acc = 0; const RP = runLine(r);
  for (let i = 0; i + 1 < RP.length; i++) {
    const a = RP[i], b = RP[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); if (l < 1e-6) continue;
    const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (l * l), 0, 1), q = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d <= tol && (!best || d < best.d - 1e-9)) best = { d, s: acc + t * l, i, q };
    acc += l;
  }
  return best;
}
/* the way from a to b along a run that both lie on, corners and all */
function pathOn(r, a, b, tol) {
  const A = onRun(r, a, tol), B = onRun(r, b, tol); if (!A || !B || Math.abs(A.s - B.s) < 0.05) return null;
  const fw = A.s < B.s, lo = fw ? A : B, hi = fw ? B : A, P = [lo.q], RP = runLine(r);
  for (let i = lo.i + 1; i <= hi.i; i++) P.push(RP[i]);
  P.push(hi.q);
  const out = P.filter((p, i) => !i || Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) > 0.02);
  if (!fw) out.reverse();
  return out.length > 1 ? out : null;
}
/* what carries a piece of fiber between two points: a ladder first, then a new trench, a new conduit, an existing conduit */
function carrier(S, a, b, want) {
  let best = null; const skip = r => r.kind === 'part' || (want === 'ladder' ? r.kind !== 'ladder' : want ? r.kind === 'ladder' : false), rank = r => r.kind === 'ladder' ? 4 : r.kind === 'trench' ? 3 : r.st === 'P' ? 2 : 1;
  for (const r of S.runs) {
    if (skip(r)) continue;
    const P = pathOn(r, a, b, 0.3); if (!P) continue;
    const k = rank(r);
    if (!best || k > best.k) best = { r, P, k };
  }
  if (best) return best;
  /* no single run carries it: the two points may be on two runs that meet, end to end or in the same hand hole or service box. The cable then runs through both. */
  const R = S.runs.filter(r => !skip(r) && r.pts && r.pts.length > 1), ends = r => [r.pts[0], r.pts[r.pts.length - 1]], near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const meet = (p, q) => { if (near(p, q) < 0.35) return true; const x = pitAt(S, p), y = pitAt(S, q); return !!x && x === y; };
  for (const r1 of R) { if (!onRun(r1, a, 0.3)) continue; for (const r2 of R) { if (r2 === r1 || !onRun(r2, b, 0.3)) continue;
    for (const e1 of ends(r1)) for (const e2 of ends(r2)) if (meet(e1, e2)) {
      const P1 = near(a, e1) < 0.06 ? null : pathOn(r1, a, e1, 0.3), P2 = near(e2, b) < 0.06 ? null : pathOn(r2, e2, b, 0.3); if (!P1 && !P2) continue;
      const parts = []; if (P1) parts.push({ r: r1, P: P1 }); if (near(e1, e2) > 0.05) parts.push({ r: P1 ? r1 : r2, P: [e1, e2] }); if (P2) parts.push({ r: r2, P: P2 });
      let len = 0; for (const k of parts) for (let i = 0; i + 1 < k.P.length; i++) len += near(k.P[i], k.P[i + 1]);
      if (!best || len < best.len) best = { parts, len, r: parts[0].r, P: parts[0].P };
    } } }
  return best;
}
/* beta 4.2: the way of the UG cable from a to b along what is drawn: trenches, conduits and cable ladders, from one to the next where they meet or come
   close. The points to give the fiber: a, where it comes onto each run and where it leaves it, b. null when nothing drawn leads there (it then goes straight). */
function followRuns(S, a, b) {
  const R = (S.runs || []).filter(r => r.kind !== 'part' && r.pts && r.pts.length > 1), d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]); if (!R.length || d2(a, b) < 0.1) return null;
  const JT = 1.5, AT = 1.2, N = [{ p: a, r: -1, s: 0 }, { p: b, r: -1, s: 0 }], E = [], on = R.map(() => []);      /* JT: a step from one run to another; AT: from an end of the cable onto a run */
  const proj = (r, p) => { let best = null, s0 = 0; for (let i = 0; i + 1 < r.pts.length; i++) { const u = r.pts[i], v = r.pts[i + 1], L = d2(u, v); if (L < 1e-6) continue; const t = clamp(((p[0] - u[0]) * (v[0] - u[0]) + (p[1] - u[1]) * (v[1] - u[1])) / (L * L), 0, 1), q = [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t], d = d2(p, q); if (!best || d < best.d) best = { d, q, s: s0 + t * L }; s0 += L; } return best; };
  const node = (ri, q, s) => { const k = on[ri].find(i => Math.abs(N[i].s - s) < 0.02); if (k != null) return k; N.push({ p: [q[0], q[1]], r: ri, s }); on[ri].push(N.length - 1); return N.length - 1; };
  const edge = (i, j, w) => { if (i !== j) E.push([i, j, w]); };
  const len = R.map(r => { let L = 0; for (let i = 0; i + 1 < r.pts.length; i++) L += d2(r.pts[i], r.pts[i + 1]); return L; }), ends = R.map((r, ri) => [node(ri, r.pts[0], 0), node(ri, r.pts[r.pts.length - 1], len[ri])]);
  R.forEach((r, ri) => {
    for (const k of [0, 1]) { const q = proj(r, N[k].p); if (q && q.d < AT) edge(k, node(ri, q.q, q.s), q.d * 1.5 + 0.05); }      /* the two ends of the cable, onto this run */
    R.forEach((r2, rj) => { if (rj === ri) return; for (const e of ends[rj]) { const q = proj(r, N[e].p); if (!q) continue; const same = pitAt(S, N[e].p) && pitAt(S, N[e].p) === pitAt(S, q.q); if (q.d < JT || same) edge(e, node(ri, q.q, q.s), q.d < 0.06 || same ? q.d + 0.01 : q.d * 3 + 0.3); } });      /* an end of another run that comes close to this one; in the same hand hole or service box they are joined */
  });
  on.forEach(L => { L.sort((i, j) => N[i].s - N[j].s); for (let i = 0; i + 1 < L.length; i++) edge(L[i], L[i + 1], N[L[i + 1]].s - N[L[i]].s); });      /* along each run */
  edge(0, 1, 2.5 * d2(a, b) + 1);
  const D = N.map(() => 1e18), prev = N.map(() => -1), done = N.map(() => false), adj = N.map(() => []); for (const [i, j, w] of E) { adj[i].push([j, w]); adj[j].push([i, w]); }
  D[0] = 0;
  for (;;) { let u = -1; for (let i = 0; i < N.length; i++) if (!done[i] && (u < 0 || D[i] < D[u])) u = i; if (u < 0 || D[u] > 1e17 || u === 1) break; done[u] = true; for (const [v, w] of adj[u]) if (D[u] + w < D[v]) { D[v] = D[u] + w; prev[v] = u; } }
  if (prev[1] < 0 || prev[1] === 0) return null;
  const path = []; for (let u = 1; u >= 0; u = prev[u]) path.unshift(u);
  const out = [], r2 = v => Math.round(v * 100) / 100;
  path.forEach((u, i) => { const pv = path[i - 1], nx = path[i + 1]; if (pv != null && nx != null && N[u].r >= 0 && N[pv].r === N[u].r && N[nx].r === N[u].r) return;      /* a point in the middle of a stretch along one run is left out: the run carries the cable */
    const p = u < 2 ? N[u].p : [r2(N[u].p[0]), r2(N[u].p[1])], l = out[out.length - 1]; if (!l || d2(l, p) > 0.05) out.push(p); else if (u === 1) out[out.length - 1] = p; });
  return out.length > 2 ? out : null;
}
/* a line drawn for the whole FOC route, in its order: its points on poles are at the poles. The last pole on the way is the riser pole: up to it the cable is
   aerial (AE), from it on it is underground (UG) and follows what is drawn. With no pole on the way all of it is UG; ending on a pole all of it is AE. */
function layFoc(S, pts, how) {
  /* beta 4.2 (19:25). how: 'ae' all of it aerial; 'ug' all of it underground, following what is drawn; else the app decides, by the user's rule:
     a piece that runs along a trench, a conduit or a cable ladder (or starts in a hand hole, a service box or an exit conduit) is underground, and so is
     all that follows it to the ODF; what comes before is aerial. The cable goes underground at the riser pole: the last pole before what carries it.
     Nothing drawn carries it: aerial all the way. A line drawn from the ODF outwards is read the other way round. Points closer than 12 cm are one point. */
  const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]), P = [];
  for (const p of pts) { const e = poleAt(S, p), q = e ? [e.x, e.y] : [p[0], p[1]], l = P[P.length - 1]; if (!l || d2(l, q) > 0.12) P.push(q); else if (e || !poleAt(S, l)) P[P.length - 1] = q; }
  const lay = U => { const out = []; for (let i = 0; i + 1 < U.length; i++) { const F = carrier(S, U[i], U[i + 1]) ? null : followRuns(S, U[i], U[i + 1]); (F || [U[i], U[i + 1]]).forEach((q, k) => { if (i > 0 && k === 0) return; const l = out[out.length - 1]; if (!l || d2(l, q) > 0.12) out.push(q); else if (out.length > 1 && !poleAt(S, l)) out[out.length - 1] = q; }); } return out.length > 1 ? out : []; };
  if (how === 'ae') return { ae: P.length > 1 ? P : [], ug: [], how: 'ae' };
  if (how === 'ug') return { ae: [], ug: lay(P), how: 'ug' };
  const atOdf = p => { const h = hostOf(S, p); return !!(h && h.t === 'cabin') || S.els.some(e => e.t === 'odf' && (d2([e.x, e.y], p) < 0.45 || (h && inPoly([e.x, e.y], elPoly(h))))); };
  if (P.length > 1 && atOdf(P[0]) && !atOdf(P[P.length - 1])) P.reverse();
  const under = p => !!pitAt(S, p) || S.els.some(e => e.t === 'exit' && d2([e.x, e.y], p) < 0.5);
  let k = -1; for (let i = 0; i + 1 < P.length; i++) if (under(P[i]) || carrier(S, P[i], P[i + 1]) || followRuns(S, P[i], P[i + 1])) { k = i; break; }
  if (k < 0) return { ae: P.length > 1 ? P : [], ug: [], how: 'none' };
  let r = k; for (let i = k; i >= 0; i--) if (poleAt(S, P[i])) { r = i; break; }
  const ae = P.slice(0, r + 1);
  return { ae: ae.length > 1 ? ae : [], ug: lay(P.slice(r)), how: 'auto' };
}
/* the poles, hand holes, service boxes and exit conduits that a drawn line passes close to become points of it, in the order it passes them */
function viaItems(S, P, reach) {
  const out = [], T = ['rpole', 'epole', 'hh', 'sbox', 'exit'], r = reach || 0.5;
  for (let i = 0; i < P.length; i++) { out.push(P[i]); if (i + 1 >= P.length) break; const a = P[i], b = P[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) continue; const hit = [];
    for (const e of S.els) { if (T.indexOf(e.t) < 0) continue; const t = ((e.x - a[0]) * (b[0] - a[0]) + (e.y - a[1]) * (b[1] - a[1])) / (L * L); if (t <= 0.02 || t >= 0.98) continue; const d = Math.hypot(a[0] + (b[0] - a[0]) * t - e.x, a[1] + (b[1] - a[1]) * t - e.y); if (d < r && Math.hypot(e.x - a[0], e.y - a[1]) > 0.1 && Math.hypot(e.x - b[0], e.y - b[1]) > 0.1) hit.push({ t, p: [e.x, e.y] }); }
    hit.sort((p, q) => p.t - q.t).forEach(h => out.push(h.p)); }
  return out;
}
/* a closure that lies in a hand hole or a service box, or on the ground: its two ends, where the cables go in, and the height of its middle */
function cloLie(S, el) {
  const r = Math.max(0.06, Math.min(el.d, Math.max(0.02, num(el.h, 0.3))) / 2), pit = pitAt(S, [el.x, el.y]);
  return { r, pit, zc: pit ? baseZ(S, pit) - flatD(Math.max(0.1, num(pit.dp, UGD))) + r + 0.05 : baseZ(S, el) + Math.max(0, num(el.z, 0)) + r, ends: [loc(el, -el.w / 2 - 0.05, 0), loc(el, el.w / 2 + 0.05, 0)] };
}
/* an ODF that stands inside a cabin (in the sketch of its inside), near a point of the site: where it is and how high */
function odfInCabin(S, p, tol) {
  if (S.room) return null; let b = null;
  for (const c of S.els) if (c.t === 'cabin' && c.inside && Array.isArray(c.inside.els)) for (const q of c.inside.els) if (q.t === 'odf') {
    const at = fromRoom(c, [q.x, q.y]), d = Math.hypot(at[0] - p[0], at[1] - p[1]); if (d > (tol || 0.4) || (b && d >= b.d)) continue;
    const h = rackHost(c.inside, q), K = h ? rackOf(h) : null; b = { d, at, cabin: c, z: baseZ(S, c) + (h ? K.zb + (uOf(c.inside, h, q) - 1 + units(q) / 2) * RU : num(q.h, 0.4) / 2) };
  }
  return b;
}
/* beta 4.2 (19:25): where the cable goes into an outdoor cabinet, and where on that face. One rule for the plan, the isometric, the details and the lengths.
   el.cab.in: 'T' through the roof, 'B' through the base, 'L' 'R' 'K' through the left, the right or the back wall (as seen from the door). Anything else: the app
   chooses by how the cable arrives: at the height of the roof or above it (a ladder over the cabinet) it comes down through the roof; from lower it goes down
   the outside and in through the base. el.cab.iu, iv, iz: where on that face (across, front to back, height above the foot); not set: nearest to where the
   cable arrives. arr: { a: [x, y], z }, where the plan's cable comes from; null when none arrives. */
function odcPort(S, el, arr) {
  const cb = el.cab || {}, w = el.w, d = el.d, h = Math.max(0.02, num(el.h, 0.02)), z0 = baseZ(S, el) + (el.z != null ? Math.max(0, num(el.z, 0)) : 0), has = v => v != null && v !== '' && isFinite(+v);
  const q = arr ? rot2(arr.a[0] - el.x, arr.a[1] - el.y, -(el.rot || 0)) : null, zr = arr ? arr.z - z0 : null, man = typeof cb.in === 'string' && cb.in.length === 1 && 'TBLRK'.indexOf(cb.in) >= 0;
  const f = man ? cb.in : arr && zr >= h - 0.05 ? 'T' : 'B', cx = v => clamp(v, -w / 2 + 0.05, w / 2 - 0.05), cy = v => clamp(v, -d / 2 + 0.05, d / 2 - 0.05);
  const sd = cb.side === 'R' ? 1 : -1, col = sd * (w / 2 - 0.05 - clamp(num(cb.off, 0.03), 0.01, Math.max(0.01, w / 2 - 0.07)));
  let lx = man && has(cb.iu) ? +cb.iu : null, ly = man && has(cb.iv) ? +cb.iv : null, iz = man && has(cb.iz) ? +cb.iz : arr ? zr : 0.3;
  if (f === 'T') { lx = cx(lx != null ? lx : q ? clamp(q[0], -w / 2 + 0.12, w / 2 - 0.12) : col); ly = cy(ly != null ? ly : q ? clamp(q[1], -d / 2 + 0.12, d / 2 - 0.12) : 0); }
  else if (f === 'B') { const tx = lx != null ? lx : q ? q[0] : col, ty = ly != null ? ly : q ? q[1] : -d / 2; let b = null, bd = 1e9; for (const k of cabHoles(el)) { const dd = Math.hypot(k.x - tx, k.y - ty); if (dd < bd) { bd = dd; b = k; } } lx = b ? b.x : cx(tx); ly = b ? b.y : cy(ty); }      /* through the base it is one of the holes in the floor */
  else if (f === 'K') { lx = cx(lx != null ? lx : q ? q[0] : 0); ly = cy(ly != null ? ly : 0); }
  else { ly = cy(ly != null ? ly : q ? q[1] : 0); lx = cx(lx != null ? lx : 0); }
  iz = clamp(iz, Math.min(0.15, h / 2), Math.max(0.15, h - 0.2));
  const t = f === 'L' ? loc(el, -w / 2, ly) : f === 'R' ? loc(el, w / 2, ly) : f === 'K' ? loc(el, lx, d / 2) : loc(el, lx, ly);
  return { f, lx, ly, iz, auto: !man, col, z0, h, p: [t[0], t[1], f === 'T' ? z0 + h : f === 'B' ? z0 : z0 + iz], X: arr ? { p: [arr.a[0], arr.a[1], arr.z], lay: 'ug' } : null };
}
/* Both fibers as pieces in space.
   legs: straight pieces { f: 'ae' | 'ug', i: leg number, a, b, type, za, zb, ta, tb (how much is cut off at each end for a bend) }
   verts: upright pieces { at, z0, z1, kind: 'riser' on a pole, 'exit' out of the ground, 'drop' anything else, R and u: the bend at its foot }
   exits, risers: what the app draws for them. join: where AE and UG meet. loops: on the AE fiber only. */
function routeGeom(S) {
  const R = S.route, out = { legs: [], verts: [], loops: [], exits: [], bare: [], risers: [], links: [], warn: [], notes: [], ports: {}, join: null, sum: { aerial: 0, ug: 0, xug: 0, ladder: 0, open: 0, liquid: 0, wall: 0, vert: 0, loop: 0, nloop: 0, ae: 0, ugt: 0, total: 0 } };
  const un2 = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }, d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const onPole = p => { const e = poleAt(S, p); return e ? [e.x, e.y] : p; };            /* a point of the aerial cable that sits on a pole is at the pole itself */
  const A = ((R.ae && R.ae.pts) || []).map(p => onPole([p.x, p.y])), U = ((R.ug && R.ug.pts) || []).map(p => [p.x, p.y]);
  const aeZ = pt => { const z = groundZ(S, pt); return z > 0 ? z + 0.5 : num(R.aerialH, STD.msg); };
  /* ----- AE: pole to pole, with its loops ----- */
  if (A.length > 1) {
    for (let i = 0; i + 1 < A.length; i++) { const a = A[i], b = A[i + 1], za = aeZ(a), zb = aeZ(b), plan = d2(a, b); out.legs.push({ f: 'ae', i, a, b, type: 'aerial', za, zb, plan, len: Math.hypot(plan, zb - za), ta: 0, tb: 0, warn: [] }); }
    R.ae.pts.forEach((p, i) => { const lp = num(p.loop, 0); if (lp > 0) { const ae = aerialAt(out, A[i]), u = ae ? ae.u : [1, 0], pl = poleAt(S, A[i]), off = pl ? Math.max(pl.w / 2, 0.1) + 0.03 : 0, zw = ae ? ae.z : aeZ(A[i]); out.loops.push({ i, at: A[i], c: [A[i][0] - u[1] * off, A[i][1] + u[0] * off], zw, z: zw + LOOPZ, len: lp, u }); } });      /* the loop in its holder, on the side of the pole, above the wire */
  }
  const aeEnd = A.length > 1 ? A[A.length - 1] : null, n2 = U.length - 1;
  /* ----- UG ----- */
  if (U.length > 1) {
    const n = U.length - 1, raw = [], above = t => t === 'ladder' || t === 'liquid' || t === 'wall' || t === 'open';
    for (let i = 0; i < n; i++) {
      const a = U[i], b = U[i + 1], want = (R.ug.legs[i] || {}).type, man = want && want !== 'auto' && want !== 'aerial' && LEG[want] ? want : null;
      const c = man ? (man === 'ladder' || man === 'ug' || man === 'xug' ? carrier(S, a, b, man) : null) : carrier(S, a, b);
      let type = man, run = null, path = [a, b];
      const tyOf = r => r.kind === 'ladder' ? 'ladder' : r.kind === 'trench' ? 'ug' : r.st === 'E' ? 'xug' : 'ug'; let parts = null;
      if (c) { run = c.r; path = c.P; if (!man) type = tyOf(c.r); if (c.parts) parts = c.parts.map(k => ({ run: k.r, path: k.P, type: man || tyOf(k.r), a: k.P[0], b: k.P[k.P.length - 1] })); }      /* parts: through two runs that meet */
      if (man === 'ladder' && !run) out.notes.push('UG leg ' + (i + 1) + ' is set to run on a cable ladder, but no ladder is drawn under it. It is drawn on the ground.');
      raw.push({ i, a, b, type, run, path, man: !!man, parts });
    }
    const hostEnd = hostOf(S, U[n]) || S.els.some(e => (e.t === 'odf' || e.t === 'port') && d2([e.x, e.y], U[n]) < 0.6) || portAt(S, U[n]) || odfInCabin(S, U[n]);
    /* a short piece next to a ladder, or into the cabinet, has nothing under it: the cable is in the open there. Anything else is new conduit. */
    if (S.room) for (const l of raw) if (!l.type || l.type === 'ug' || l.type === 'xug') l.type = 'open';     /* inside a cabin nothing is buried: off the ladder the cable is in the open */
    for (let pass = 0; pass < 2; pass++) for (const l of raw) if (!l.type) {
      const pv = raw[l.i - 1], nx = raw[l.i + 1], up = (pv && pv.type && above(pv.type)) || (nx && nx.type && above(nx.type)) || (l.i === n - 1 && hostEnd);
      if (pass === 0) { if (up && d2(l.a, l.b) < 4) l.type = 'open'; } else { l.type = 'ug'; if (groundZ(S, [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]) < 0.01) out.notes.push('UG leg ' + (l.i + 1) + ' has no trench or conduit drawn under it. It counts as new conduit in an open trench, ' + f1(UGD) + ' m deep.'); }
    }
    const P = [];
    for (const l0 of raw) for (const l of l0.parts ? l0.parts.map(k => Object.assign({ i: l0.i }, k)) : [l0]) {
      let segs = []; for (let k = 0; k + 1 < l.path.length; k++) segs.push([l.path[k], l.path[k + 1]]);
      if (S.site.kind === 'rooftop' && !l.run) { const ts = edgeCross(S, l.a, l.b); if (ts.length) { segs = []; let prev = l.a; for (const tt of ts) { const m = [l.a[0] + (l.b[0] - l.a[0]) * tt, l.a[1] + (l.b[1] - l.a[1]) * tt]; segs.push([prev, m]); prev = m; } segs.push([prev, l.b]); } }
      for (const [p, q] of segs) {
        const g = groundZ(S, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]), t = l.type, r = l.run; let z = null;
        if (t === 'ladder') z = g + (r ? ladBase(S, r) + Math.max(0, num(r.z, RUNS.ladder.z)) : 0) + 0.03;
        else if (t === 'ug' || t === 'xug') z = r && !buried(r) ? g + num(r.z, 0) + STD.hdpe / 2 : g > 0.01 ? g + 0.06 : g - (r ? runDepthD(r) : flatD(UGD)) + STD.hdpe / 2;      /* in the lower of the two pipes, the black one */
        else if (t === 'liquid') z = g + 0.3; else if (t === 'wall') z = g + 1.2;
        P.push({ f: 'ug', i: l.i, a: p, b: q, type: t, run: r, za: z, zb: z, g, plan: d2(p, q), ta: 0, tb: 0, warn: [] });
      }
    }
    /* what an end of the UG fiber goes to: the closure on the pole, the AE cable, or the ODF in its cabinet */
    const endT = (p, from) => {
      const g = groundZ(S, p), pole = poleAt(S, p), atAE = !!aeEnd && d2(aeEnd, p) < 0.45;
      if (pole) return { z: (atAE ? aeZ(aeEnd) : baseZ(S, pole) + num(R.aerialH, STD.msg)) + CLOZ, pole, atAE };            /* up to the bottom of the closure, which stands above the loop */
      if (atAE) return { z: aeZ(aeEnd), atAE };
      const cl = S.els.find(e => e.t === 'clo' && d2([e.x, e.y], p) < 0.6);          /* a closure in a hand hole or service box, or on the ground: the cable goes to its entrance, the end it arrives at */
      if (cl) { const K = cloLie(S, cl), f = from || p, e = d2(K.ends[0], f) <= d2(K.ends[1], f) ? K.ends[0] : K.ends[1]; return { z: K.zc, link: e, clo: cl }; }
      const oc = odfInCabin(S, p); if (oc) return { z: oc.z, at: oc.at };                                                                       /* the ODF in the sketch of the inside of a cabin */
      const pe = S.els.find(e => e.t === 'port' && d2([e.x, e.y], p) < 0.35); if (pe) return { z: g + num(pe.z, 2.3) };              /* inside a cabin: its porthole */
      const pa = portAt(S, p); if (pa) return { z: pa.z };                                                                              /* on the site: the porthole of a cabin */
      const it = S.els.find(e => e.t === 'odf' && d2([e.x, e.y], p) < 0.6), rh = it ? rackHost(S, it) : null;
      if (rh) { const K = rackOf(rh), z = baseZ(S, rh) + K.zb + (uOf(S, rh, it) - 1 + units(it) / 2) * RU; return rh.t === 'rack' ? { z, at: loc(rh, 0, -rh.d / 2 - 0.02), level: 1 } : { z, odc: rh.t === 'odc' ? rh : null }; }      /* the ODF at its own rack units. On a rack the cable comes down its front. */
      const h = hostOf(S, p); if (h || it) return { z: (h ? baseZ(S, h) : g) + num(R.endRise, 1) };
      return null;
    };
    for (const q of P) for (const k of ['a', 'b']) { const e = poleAt(S, q[k]); if (e && (q[k][0] !== e.x || q[k][1] !== e.y)) { q[k] = [e.x, e.y]; q.plan = d2(q.a, q.b); } }      /* a piece that ends on a pole ends at the pole itself, so the riser lies against it */
    const T0 = endT(U[0], P.length ? P[0].b : null), T1 = endT(U[n], P.length ? P[P.length - 1].a : null);
    if (T0 && T0.at && P.length) { const l = P[0]; l.a = T0.at; l.plan = d2(l.a, l.b); }
    if (T1 && T1.at && P.length) { const l = P[P.length - 1]; l.b = T1.at; l.plan = d2(l.a, l.b); }
    for (let k = 0; k < P.length; k++) if (P[k].type === 'open') {          /* a piece in the open goes straight from where the one before ends to where the next begins */
      const q = P[k], pv = P[k - 1], nx = P[k + 1];
      q.za = pv ? (pv.zb < pv.g - 0.05 ? groundZ(S, q.a) + EXH : pv.zb) : T0 ? T0.z : q.g + 0.05;
      q.zb = nx ? q.za : T1 ? T1.z : q.g + 0.05;      /* (19:25) in the open it runs level: where the height changes, the upright piece made below takes it straight up or down at the start of the next piece */
      if (!pv && T0 && T0.level && nx) { q.zb = nx.type === 'open' ? q.zb : nx.za < nx.g - 0.05 ? groundZ(S, q.b) + EXH : nx.za; q.za = q.zb; } if (!nx && T1 && T1.level) q.zb = q.za;      /* level to the rack, then straight down to the ODF */
    }
    /* beta 4.2 (19:25): into an outdoor cabinet the cable goes through the entry of that cabinet (odcPort): the one the user chose, or the one the app chooses.
       Outside it runs level, or straight up or down, and never through the cabinet: over the roof, down the outside of a wall, along the foot (hop: the
       cabinet). Inside (inside: 1) a piece runs from the entry to over or under the ODF; the upright piece made next takes the cable to the ODF. */
    { const c = T1 && T1.odc; let q = P[P.length - 1];
      if (q && c) {
        const poly = elPoly(c), zb0 = baseZ(S, c) + (c.z != null ? Math.max(0, num(c.z, 0)) : 0), roof = zb0 + Math.max(0.02, num(c.h, 0.02)), zf = zb0 + 0.08, O = q.b, iL = q.i, hw = c.w / 2, hd = c.d / 2;
        while (P.length > 1 && q.type === 'open' && P[P.length - 2].type === 'open' && inPoly(q.a, poly)) { P.pop(); q = P[P.length - 1]; }      /* points tapped inside the cabinet: the last one outside it counts */
        let a, zA;
        if (q.type === 'open') { P.pop(); a = q.a; zA = q.za; }      /* a hop in the open: led to the entry from where it starts */
        else { a = q.b; zA = q.zb;
          if (zA > zb0 + 0.25 && zA < roof - 0.05 && !inPoly(q.a, poly) && inPoly(q.b, poly)) {      /* a ladder or a pipe lower than the roof stops at the wall */
            let t0 = 0, t1 = 1; const at = t => [q.a[0] + (q.b[0] - q.a[0]) * t, q.a[1] + (q.b[1] - q.a[1]) * t]; for (let k = 0; k < 30; k++) { const m = (t0 + t1) / 2; if (inPoly(at(m), poly)) t1 = m; else t0 = m; }
            a = at(t0); q.b = a; q.plan = d2(q.a, a); } }
        const pt = odcPort(S, c, { a, z: zA }), G = [pt.p[0], pt.p[1]], inA = inPoly(a, poly); out.ports[c.id] = pt;
        const mk = (p1, p2, z, x) => { if (d2(p1, p2) > 0.02) P.push(Object.assign({ f: 'ug', i: iL, a: p1, b: p2, type: 'open', run: null, za: z, zb: z, g: groundZ(S, p1), plan: d2(p1, p2), ta: 0, tb: 0, warn: [], hop: c.id }, x || {})); };
        let zin = zf;
        if (pt.f === 'T') { mk(a, G, Math.max(zA, roof + 0.15)); zin = roof - 0.06; }
        else if (pt.f === 'B') {
          if (inA && zA <= zf + 0.2) zin = null;               /* it comes up under the cabinet: straight up to the ODF */
          else if (zA <= zf + 0.2) mk(a, G, zf);                /* from the ground: along the foot and in */
          else {                                               /* from higher: level to the nearest wall, down its outside, in at the foot */
            const lc = rot2(a[0] - c.x, a[1] - c.y, -(c.rot || 0)); let ex = clamp(lc[0], -hw, hw), ey = clamp(lc[1], -hd, hd);
            if (Math.abs(lc[0]) < hw && Math.abs(lc[1]) < hd) { if (hw - Math.abs(lc[0]) < hd - Math.abs(lc[1])) ex = lc[0] < 0 ? -hw : hw; else ey = lc[1] < 0 ? -hd : hd; }
            const E = loc(c, ex + (Math.abs(ex) > hw - 1e-9 ? Math.sign(ex) * 0.06 : 0), ey + (Math.abs(ey) > hd - 1e-9 ? Math.sign(ey) * 0.06 : 0));
            mk(a, E, zA); mk(E, G, zf, { gland: 1 }); }
        }
        else { const Oo = pt.f === 'L' ? loc(c, -hw - 0.1, pt.ly) : pt.f === 'R' ? loc(c, hw + 0.1, pt.ly) : loc(c, pt.lx, hd + 0.1), gz = pt.p[2];
          mk(a, Oo, zA < roof + 0.05 && (inA || segPoly(a, Oo, poly)) ? roof + 0.15 : zA); mk(Oo, G, gz, { gland: 1 }); zin = gz; }      /* the cabinet in the way: over its roof */
        if (zin != null) mk(G, O, zin, { inside: 1 });
      } }
    for (let k = 0; k <= P.length; k++) {                                  /* the upright piece at every place where the height changes */
      const pv = P[k - 1] || null, nx = P[k] || null, at0 = nx ? nx.a : pv.b, T = !pv ? T0 : !nx ? T1 : null;
      const zp = pv ? pv.zb : T ? T.z : null, zn = nx ? nx.za : T ? T.z : null;
      if (zp == null || zn == null || Math.abs(zp - zn) < 0.05) continue;
      const g = groundZ(S, at0), pole = poleAt(S, at0), z0 = Math.min(zp, zn), z1 = Math.max(zp, zn), below = z0 < g - 0.2;
      const bp = pv && zp === z0 && zp < g - 0.05 ? pv : nx && zn === z0 && zn < g - 0.05 ? nx : null, adj = bp || nx || pv;
      const v = { f: 'ug', at: at0, z0, z1, g, kind: pole ? 'riser' : below && z1 > g + 0.05 && !pitAt(S, at0) ? 'exit' : 'drop', R: 0, u: null };
      if (adj) {
        const atA = adj === nx; v.u = atA ? un2(adj.b[0] - adj.a[0], adj.b[1] - adj.a[1]) : un2(adj.a[0] - adj.b[0], adj.a[1] - adj.b[1]);
        let off = pole ? poleR(pole, 0) + GIR : 0, Rb = bp && below ? Math.min(bendR(g - z0), z1 - z0) : 0; if (Rb < 0.3) Rb = 0;      /* a bend needs the height to turn in: a small step up, as into a closure in a pit, has none */      /* on a pole the pipe lies against it, no gap */
        if (adj.plan < off + Rb + 0.1) { const room = adj.plan - off - 0.1; if (room > 0.25) Rb = room; else { off = 0; Rb = Math.min(Rb, adj.plan * 0.4); } }
        v.at = [at0[0] + v.u[0] * off, at0[1] + v.u[1] * off]; v.R = Rb;
        if (pole && off > 0) { const o2 = poleR(pole, z1 - baseZ(S, pole)) + GIR; v.at2 = [at0[0] + v.u[0] * o2, at0[1] + v.u[1] * o2]; }      /* the pole tapers and the pipe follows it: where it is at the top */
        if (off + Rb > 0) { if (atA) adj.ta = off + Rb; else adj.tb = off + Rb; }
      }
      if (pv && pv.inside) v.inside = 1; if ((pv && pv.hop) || (nx && nx.hop)) v.hop = (pv && pv.hop) || nx.hop;      /* (19:25) part of the way into a cabinet */
      out.verts.push(v);
      if (v.kind === 'riser') out.risers.push({ at: v.at, at2: v.at2 || v.at, pole, g, z0, z1, u: v.u || [1, 0], R: v.R, dp: below ? g - z0 : 0 });
      if (v.kind === 'exit') { const ex = S.els.find(e => e.t === 'exit' && d2([e.x, e.y], at0) < 0.5); if (!ex && !hostOf(S, at0)) out.bare.push({ at: v.at });      /* (19:25: where the cable comes out of the ground with no exit conduit drawn, none is made up; the place is kept for a check line) */
        if (ex) out.exits.push({ at: v.at, st: ex ? ex.st : bp && bp.type === 'xug' ? 'E' : 'P', g, h: ex ? Math.max(0.1, num(ex.h, EXH)) : clamp(z1 - g, 0.1, EXH), u: v.u || [1, 0], R: v.R, dp: g - z0, el: ex ? ex.id : null }); }
    }
    for (const q of P) { q.len = Math.hypot(q.plan, q.zb - q.za); out.legs.push(q); }
    /* where the two fibers meet: the closure stands on the side of the pole above the loop, and the UG cable comes up the riser to its bottom */
    const jn = [[U[0], T0], [U[n], T1]].find(q => q[1] && q[1].atAE);
    if (jn) {
      const p = jn[0], T = jn[1], ae = aerialAt(out, aeEnd), pole = T.pole || null, u = ae ? ae.u : [-1, 0], nn = poleSide(out, pole, u), off = pole ? poleR(pole, T.z - baseZ(S, pole)) + STD.cloR + 0.005 : 0, pc = pole ? [pole.x, pole.y] : p;
      const vt = out.verts.find(v => d2(v.at, p) < 0.6 && Math.abs(v.z1 - T.z) < 0.01), top = vt ? vt.at2 || vt.at : p;
      const hasClo = !!pole && S.els.some(e => e.t === 'clo' && d2([e.x, e.y], [pole.x, pole.y]) < 0.6), noClo = (S.site || {}).clo === 'none';      /* the design may need no closure on the riser pole: then the cable is one length, up the riser and on as aerial cable */
      out.join = { pole, at: pc, z: T.z, u, n: nn, c: [pc[0] + nn[0] * off, pc[1] + nn[1] * off], auto: !!pole && !hasClo && !noClo, none: !!pole && !hasClo && noClo };
      if (pole && !out.join.none) out.links.push({ a: [top[0], top[1], T.z], b: [out.join.c[0], out.join.c[1], T.z] });
    }
    for (const [p, T] of [[U[0], T0], [U[n], T1]]) if (T && T.link) out.links.push({ a: [p[0], p[1], T.z], b: [T.link[0], T.link[1], T.z] });      /* into the closure at its entrance */
    for (const [p, T] of [[U[0], T0], [U[n], T1]]) if (T && T.pole && !T.atAE) {      /* a pole with a closure and no aerial cable yet: the UG cable still ends in the closure */
      const ce = S.els.find(e => e.t === 'clo' && d2([e.x, e.y], [T.pole.x, T.pole.y]) < 0.6), vt = ce ? out.verts.find(v => d2(v.at, [T.pole.x, T.pole.y]) < 0.6 && Math.abs(v.z1 - T.z) < 0.01) : null, m = vt ? cloMount(S, out, ce) : null;
      if (m) { const top = vt.at2 || vt.at; out.links.push({ a: [top[0], top[1], T.z], b: [m.c[0], m.c[1], T.z] }); }
    }
    /* buried pieces that run through something standing on the site */
    const block = ['pad', 'odc', 'cabin', 'gen', 'tank', 'box', 'cow', 't3', 't4', 'rtt'], W = {};
    for (const l of P) {
      if (l.type !== 'ug' && l.type !== 'xug' && l.type !== 'liquid') continue;
      for (const e of S.els) { if (block.indexOf(e.t) < 0) continue; const poly = elPoly(e); if (inPoly(U[0], poly) || inPoly(U[n], poly)) continue; if (segPoly(l.a, l.b, poly)) { const nm = e.name || TYPES[e.t].s, w = W[l.i] || (W[l.i] = []); if (w.indexOf(nm) < 0) w.push(nm); } }
    }
    for (const k in W) out.warn.push({ leg: +k, names: W[k] });
  }
  for (const l of out.loops) { const pl = poleAt(S, l.at); if (pl) { const n = poleSide(out, pl, l.u), off = poleR(pl, l.z - baseZ(S, pl)) + 0.02; l.c = [l.at[0] + n[0] * off, l.at[1] + n[1] * off]; } }      /* on a riser pole the loop holder is on the riser's side */
  if (A.length > 1 && !poleAt(S, aeEnd)) out.notes.push('The AE fiber does not end on a pole. End it on the riser pole.');
  if (A.length > 1 && U.length > 1 && !out.join) out.notes.push('The AE and UG fibers do not meet. End the AE fiber and start the UG fiber on the same riser pole.');
  for (const e of S.els) if (e.t === 'clo' && !poleAt(S, [e.x, e.y], 0.6) && !pitAt(S, [e.x, e.y])) out.notes.push('A closure is loose on the ground. Put it on a pole, or in a hand hole or service box.');
  const s = out.sum;
  for (const l of out.legs) s[l.type] += l.len;
  for (const v of out.verts) s.vert += v.z1 - v.z0;
  for (const k of out.links) s.vert += Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
  for (const l of out.loops) { s.loop += l.len; s.nloop++; }
  s.inside = 0;                                         /* the same UG cable carries on inside a cabin, from the porthole to the ODF */
  if (!S.room) for (const e of S.els) if (e.t === 'cabin' && e.inside && e.inside.route && e.inside.route.ug && e.inside.site) {
    const add = routeGeom(e.inside).sum.ugt; s.inside += add;
    if (add > 0.05 && U.some(p => inCabin(e, p, 0.15))) out.notes.push('The UG fiber goes on into ' + elLabel(S, e).toLowerCase() + ' on the site sketch, and cable is also drawn in the sketch of its inside, so that length is counted twice. End the UG fiber on the porthole.');
    if (add > 0.05 && !U.some(p => inPoly(p, elPoly(e)) || cabinPorts(e).some(q => d2(q.at, p) < 0.5))) out.notes.push('Cable is drawn inside ' + elLabel(S, e).toLowerCase() + ' and counts in the UG length, but the UG fiber on the site does not reach the porthole of that cabin.');
  }
  if (!S.room) for (const e of S.els) if (e.t === 'cabin' && S.runs.some(r => r.kind === 'ladder' && (r.pts || []).some(p => inCabin(e, p, 0.15)))) out.notes.push('A cable ladder is drawn into ' + elLabel(S, e).toLowerCase() + ' on the site sketch. A ladder outside ends on the porthole; the ladder inside is drawn in the sketch of the inside.');
  if (S.room && U.length > 1 && !S.els.some(e => e.t === 'port' && (d2([e.x, e.y], U[0]) < 0.35 || d2([e.x, e.y], U[n2]) < 0.35))) out.notes.push('The cable inside the cabin does not start at a porthole.');
  s.ae = s.aerial + s.loop; s.ugt = s.ug + s.xug + s.ladder + s.open + s.liquid + s.wall + s.vert + s.inside; s.total = s.ae + s.ugt;
  return out;
}
function cefTable(S) {
  const rg = routeGeom(S), g = rg.sum, cnt = t => S.els.filter(e => e.t === t).length, odf = S.els.filter(e => e.t === 'odf').concat([].concat.apply([], S.els.filter(e => e.t === 'cabin' && e.inside && Array.isArray(e.inside.els)).map(e => e.inside.els.filter(q => q.t === 'odf'))));
  const RP = rg.risers.map(r => riserParts(r.g, r.z1 - CLOZ)), trench = g.ug + extraTrench(S, rg), pipe = rg.risers.reduce((s, r, i) => s + Math.max(0, RP[i].giTop - r.g), 0), guard = RP.reduce((s, k) => s + Math.max(0, k.ugTop - k.giTop), 0);
  const sbt = Array.from(new Set(S.els.filter(e => e.t === 'sbox' && SBOX[e.ty]).map(e => e.ty))).join(', ');
  const Lm = v => v > 0.05 ? f1(v) + 'm' : '', Q = v => v > 0 ? String(v) : '';
  const cab = c => { c = String(c || ''); const sp = c.indexOf(' '); return sp > 0 ? [c.slice(0, sp), c.slice(sp + 1)] : [c, '']; }, ca = cab(S.route.ae.cable), cu = cab(S.route.ug.cable);
  const dps = Array.from(new Set(S.runs.filter(r => r.kind === 'trench' && r.st === 'P').map(r => f1(runDepth(r))))), deep = trench > 0.05 ? (dps.length > 1 ? 'SEE PLAN' : (dps[0] || f1(UGD)) + 'm DEEP') : '';
  const TR = S.runs.filter(r => r.kind === 'trench' && r.st === 'P'), TT = Array.from(new Set(S.runs.filter(r => (r.kind === 'conduit' || r.kind === 'encase') && r.st === 'P' && buried(r)).map(r => runN(r) + '-' + runMM(r) + 'mm')));      /* (22:24) the proposed conduits that are drawn say the runs and the size; with none drawn, the standard */
  const nclo = cnt('clo') + (rg.join && rg.join.auto ? 1 : 0), nexit = rg.exits.length + S.els.filter(e => e.t === 'exit' && !rg.exits.some(x => x.el === e.id)).length;
  return [
    ['ODF', odf.length ? Array.from(new Set(odf.map(e => e.size || ''))).join(', ') : '', Q(odf.length), ''],
    ['CLOSURE', nclo ? 'HYBRID' : '', Q(nclo), ''],
    ['RISER POLE (EXISTING)', '', Q(cnt('epole')), ''],
    ['WALL STRAP', '', '', Lm(g.wall)],
    [(TR.length && TR.every(runShallow) ? 'SHALLOW' : 'OPEN') + ' TRENCH CONDUIT' + (deep ? ' (' + deep + ')' : ''), trench > 0.05 ? (TT.length > 1 ? 'SEE PLAN' : (TT[0] || '2-' + PVC_MM + 'mm') + ' PVC') : '', '', Lm(trench)],
    ['PROP. RISER POLE', '', Q(cnt('rpole')), ''],
    ['CONCRETE ENCASEMENT', '', Q(cnt('enc') + cnt('rpole')), ''],
    ['AE ' + ca[0] + ' FOC (W/ LOOP)', g.ae > 0.05 ? ca[1] : '', '', Lm(g.ae)],
    ['UG ' + cu[0] + ' FOC', g.ugt > 0.05 ? cu[1] : '', '', Lm(g.ugt)],
    ['LOOP HOLDER', '', Q(g.nloop), ''],
    ['SERVICE BOX', sbt, Q(cnt('sbox')), ''],
    ['EXIT CONDUIT', nexit ? PVC_MM + 'mm' : '', Q(nexit), ''],
    ['LIQUID TIGHT', '', '', Lm(g.liquid)],
    ['G.I. RISER PIPE', '', '', Lm(pipe)],
    ['EXISTING CONDUIT USED', '', '', Lm(g.xug)],
    ['U-GUARD', '', '', Lm(guard)]
  ];
}
/* how each cable length is made up, one line for AE and one for UG */
function focFormula(S) {
  const g = routeGeom(S).sum, o = [];
  if (g.ae > 0.05) o.push('AE FOC = ' + f1(g.aerial) + ' m RUN + ' + g.nloop + ' LOOP' + (g.nloop === 1 ? '' : 'S') + ' (' + f1(g.loop) + ' m) = ' + f1(g.ae) + ' m');
  if (g.ugt > 0.05) o.push('UG FOC = ' + f1(g.ugt - g.vert - g.inside) + ' m RUN + ' + f1(g.vert) + ' m UP AND DOWN' + (g.inside > 0.05 ? ' + ' + f1(g.inside) + ' m INSIDE THE CABIN' : '') + ' = ' + f1(g.ugt) + ' m');
  return o;
}

/* ---------- drawing primitives (metres, y up) ---------- */
function Gfx() { this.p = []; }
/* beta 4.2 (19:25): while grp is set, what is drawn belongs to that item (g): in the DXF it becomes one block, picked and moved in one piece */
Gfx.prototype.put = function (o) { if (this.grp) o.g = this.grp; this.p.push(o); };
Gfx.prototype.pl = function (pts, lay, close) { if (pts.length > 1) this.put({ k: 'pl', pts, lay, close: !!close }); };
Gfx.prototype.ci = function (c, r, lay) { this.put({ k: 'ci', c, r, lay }); };
Gfx.prototype.ar = function (c, r, a0, a1, lay) { this.put({ k: 'ar', c, r, a0, a1, lay }); };
/* m: text lying on a face of the model. [ux, uy, vx, vy]: where one metre along the line of text, and one metre up from it, land on the drawing. */
Gfx.prototype.tx = function (p, s, h, lay, al, a, b, m) { const t = { k: 'tx', p, s: String(s).replace(/\u00A0/g, ' '), h, lay, al: al || 'l', a: a || 0, b: !!b }; if (m) t.m = m; this.put(t); };
Gfx.prototype.fl = function (pts, lay) { this.put({ k: 'fl', pts, lay }); };
/* the name of the block of every item and line of a plan: its kind and its number among that kind (ODC_2, RPOLE_1, TRENCH_1). GSEQ: one number for each drawing made,
   so that the same item on two drawings of one sheet is two blocks. */
let GSEQ = 0;
function blockNames(S) { const N = {}, cnt = {}, nm = k => { const p = String(k || 'ITEM').toUpperCase().replace(/[^A-Z0-9]+/g, '_'); cnt[p] = (cnt[p] || 0) + 1; return p + '_' + cnt[p]; }; for (const e of S.els || []) N[e.id] = nm(e.t); for (const r of S.runs || []) N[r.id] = nm(r.kind); return N; }
function primBox(prims) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const ex = (x, y) => { if (!isFinite(x) || !isFinite(y)) return; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };      /* (beta 4.2: what is not a number is left out, so one bad piece cannot take the view of the whole drawing away) */
  for (const p of prims) {
    if (p.k === 'pl' || p.k === 'fl') for (const q of p.pts) ex(q[0], q[1]);
    else if (p.k === 'ci' || p.k === 'ar') { ex(p.c[0] - p.r, p.c[1] - p.r); ex(p.c[0] + p.r, p.c[1] + p.r); }
    else if (p.k === 'tx') { const w = textW(p.s, p.h) * (p.b ? 1.06 : 1), c = Math.cos(p.a * D2R), s = Math.sin(p.a * D2R), o = p.al === 'c' ? -w / 2 : p.al === 'r' ? -w : 0, m = p.m || [c, s, -s, c]; for (const [u, v] of [[o, -0.25 * p.h], [o + w, -0.25 * p.h], [o, p.h * 1.1], [o + w, p.h * 1.1]]) ex(p.p[0] + u * m[0] + v * m[2], p.p[1] + u * m[1] + v * m[3]); }
  }
  return x1 < x0 ? [0, 0, 1, 1] : [x0, y0, x1, y1];
}
/* scale, turn (deg, anticlockwise) and move primitives */
function xfPrims(prims, s, rot, dx, dy) {
  const c = Math.cos(rot * D2R), sn = Math.sin(rot * D2R), T = q => [dx + (q[0] * c - q[1] * sn) * s, dy + (q[0] * sn + q[1] * c) * s];
  return prims.map(p => {
    if (p.k === 'pl' || p.k === 'fl') return Object.assign({}, p, { pts: p.pts.map(T) });
    if (p.k === 'ci') return Object.assign({}, p, { c: T(p.c), r: p.r * s });
    if (p.k === 'ar') return Object.assign({}, p, { c: T(p.c), r: p.r * s, a0: p.a0 + rot, a1: p.a1 + rot });
    const q = Object.assign({}, p, { p: T(p.p), h: p.h * s, a: p.a + rot }); if (p.m) q.m = [p.m[0] * c - p.m[1] * sn, p.m[0] * sn + p.m[1] * c, p.m[2] * c - p.m[3] * sn, p.m[2] * sn + p.m[3] * c]; return q;
  });
}

/* ---------- callouts in the margins, each with a leader to what it names ---------- */
function addCallouts(G, A, bb, th, LB) {
  /* beta 4.2: each note takes the place at the edge, as near to the height of its item as it can, from which its leader crosses no other leader and runs
     under no name. Where there is none the note is left out; the number left out is given back. */
  if (!A.length) return 0;
  const cx = (bb[0] + bb[2]) / 2, pitch = th * 1.55, done = [], leads = LB ? LB.leads : [], labs = LB ? LB.labs : []; let lost = 0;
  const items = A.map(a => { const lines = wrap(a.s, 28); return { a, lines, hh: lines.length * pitch, w: Math.max.apply(null, lines.map(s => textW(s, th))) }; }).sort((p, q) => q.a.p[1] - p.a.p[1]);
  for (const it of items) {
    const p = it.a.p, first = p[0] >= cx; let b = null, alt = null, ab = 1e9;
    for (const right of [first, !first]) { for (let k = 0; k <= 90 && !b; k++) for (const sgn of k ? [1, -1] : [1]) {      /* (19:25) the whole height of the drawing, not only near its item */
      const y = p[1] + sgn * k * pitch * 0.75, x = right ? bb[2] + 3.4 * th : bb[0] - 3.4 * th, sx = right ? x - 0.5 * th : x + 0.5 * th, ex = right ? x - 2.2 * th : x + 2.2 * th, e = [ex, y], s = [sx, y];
      if (y - it.hh / 2 < bb[1] - 6 * th || y + it.hh / 2 > bb[3] + 6 * th) continue;
      const xa = right ? x - 0.3 * th : x - it.w - 0.3 * th, xb = right ? x + it.w + 0.3 * th : x + 0.3 * th, box = [[xa, y - it.hh / 2], [xb, y - it.hh / 2], [xb, y + it.hh / 2], [xa, y + it.hh / 2]];
      if (done.some(q => polysHit(q.box, box) || segSeg(p, e, q.p, q.e) || segPoly(p, e, q.box) || segPoly(q.p, q.e, box))) continue;
      if (labs.some(q => polysHit(q, box))) continue;
      const bad = leads.reduce((n, l) => n + (segSeg(p, e, l[0], l[1]) || segSeg(e, s, l[0], l[1]) ? 1 : 0), 0) + labs.reduce((n, q) => n + (segPoly(p, e, q) ? 3 : 0), 0), c = { right, y, x, sx, ex, box, p, e };
      if (!bad) { b = c; break; } if (bad < ab) { ab = bad; alt = c; }
    } if (b) break; }
    if (!b && alt) b = alt;      /* (19:25) every name shows: where no clear way to the edge exists, the way that crosses the least */
    if (!b) { lost++; continue; }
    const lay = it.a.st === 'P' ? 'tp' : 'tx'; G.pl([p, b.e, [b.sx, b.y]], lay);
    const dx = b.ex - p[0], dy = b.y - p[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, s = th * 0.6;
    G.fl([p, [p[0] + ux * s - uy * s * 0.3, p[1] + uy * s + ux * s * 0.3], [p[0] + ux * s + uy * s * 0.3, p[1] + uy * s - ux * s * 0.3]], lay);
    it.lines.forEach((ln, k) => G.tx([b.x, b.y + it.hh / 2 - pitch * (k + 0.5) - th * 0.5], ln, th, lay, b.right ? 'l' : 'r'));
    done.push(b); if (LB) { LB.leads.push([p, b.e], [b.e, [b.sx, b.y]]); LB.labs.push(b.box); }
  }
  return lost;
}

/* ---------- top view ---------- */
function topEl(S, el, G, rg) {
  const lay = elLayer(el), P = elPoly(el), c = [el.x, el.y], lp = (x, y) => loc(el, x, y);
  const cross = (q, r, l) => { G.pl([[q[0] - r, q[1]], [q[0] + r, q[1]]], l); G.pl([[q[0], q[1] - r], [q[0], q[1] + r]], l); };
  const tri = r => [90, 210, 330].map(a => lp(r * Math.cos(a * D2R), r * Math.sin(a * D2R)));
  switch (el.t) {
    case 't3': case 'rtt': case 't4': {                 /* seen from above: the base, the top, and the legs leaning in between them */
      const hw = el.w / 2, lg = el.t === 't4' ? [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]].map(q => lp(q[0], q[1])) : tri(el.w / Math.sqrt(3)), k = Math.min(el.t === 't4' ? 1.5 : el.t === 'rtt' ? 0.5 : 1.2, el.w) / Math.max(el.w, 0.1), inr = lg.map(q => [el.x + (q[0] - el.x) * k, el.y + (q[1] - el.y) * k]);
      G.pl(lg, lay, 1); if (k < 0.95) { G.pl(inr, lay, 1); lg.forEach((q, i) => G.pl([q, inr[i]], lay)); }
      if (el.t !== 'rtt') for (const q of lg) G.pl(sqr(q, clamp(el.w / 9, 0.3, 0.5), el.rot), lay, 1); else G.ci(c, 0.1, lay);
      const TL = towerLad(S, el);
      if (TL) { const a = lg[TL.i], b = lg[(TL.i + 1) % lg.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], f = TL.foot, m = [(lg[0][0] + lg[2 % lg.length][0]) / 2, (lg[0][1] + lg[2 % lg.length][1]) / 2], sg = (c[0] - f[0]) * -u[1] + (c[1] - f[1]) * u[0] > 0 ? 1 : -1, nn = [-u[1] * sg, u[0] * sg];
        const at = (s, t) => [f[0] + u[0] * s + nn[0] * t, f[1] + u[1] * s + nn[1] * t]; G.pl([at(-0.2, 0), at(-0.2, 0.5)], 'ld'); G.pl([at(0.2, 0), at(0.2, 0.5)], 'ld'); for (const t of [0.1, 0.25, 0.4]) G.pl([at(-0.2, t), at(0.2, t)], 'ld'); }
      break;
    }
    case 'guy': { G.pl(tri(el.w / Math.sqrt(3)), lay, 1); for (const q of tri(num(el.ar, 8))) { G.pl([c, q], lay); G.pl(sqr(q, 0.35, el.rot), lay, 1); } break; }
    case 'mono': G.ci(c, el.w / 2, lay); G.ci(c, el.w / 4, lay); cross(c, el.w / 2 + 0.25, lay); break;
    case 'tad': { const rc = Math.max(el.w * 0.95, el.w / 2 + 0.18); G.ci(c, el.w / 2, lay); G.ci(c, rc, lay); cross(c, rc + 0.2, lay); break; }
    case 'palm': G.ci(c, el.w / 2, lay); G.ci(c, 3.2, 'lot'); for (let i = 0; i < 9; i++) { const a = i * 40 * D2R; G.pl([[c[0] + el.w / 2 * Math.cos(a), c[1] + el.w / 2 * Math.sin(a)], [c[0] + 3.2 * Math.cos(a), c[1] + 3.2 * Math.sin(a)]], lay); } break;
    case 'ezm': G.ci(c, Math.max(el.w / 2, 0.15), lay); G.pl(rectAt(lp(0.35, 0), 0.3, 0.5, el.rot), lay, 1); cross(c, 0.4, lay); break;
    case 'rtp': G.ci(c, 0.15, lay); for (const q of tri(1.5)) G.pl([c, q], lay); break;
    case 'cow': G.pl(P, lay, 1); G.pl(rectAt(lp(0, -el.d / 2 + 1.7), el.w, 3.2, el.rot), lay, 1); G.ci(lp(0, el.d / 2 - 0.5), 0.2, lay); break;
    case 'cabin': for (const q of cabinPorts(el)) { const hz = q.face === 'F' || q.face === 'B'; G.pl(rectAt(q.at, hz ? 0.5 : 0.22, hz ? 0.22 : 0.5, el.rot), q.st === 'P' ? 'pp' : lay, 1); }
      G.pl(P, lay, 1); for (const D of cabinDoors(el)) G.pl([faceXY(el, D.face, D.u - D.w / 2, 0), faceXY(el, D.face, D.u - D.w / 2, 0.15), faceXY(el, D.face, D.u + D.w / 2, 0.15), faceXY(el, D.face, D.u + D.w / 2, 0)], lay);      /* each door where it is on its wall */
      for (const A of cabinAcs(el)) { G.pl(rectAt(A.at, A.hz ? A.w : A.d, A.hz ? A.d : A.w, el.rot), A.st === 'P' ? 'pp' : lay, 1); G.ci(A.at, Math.min(A.w, A.d) * 0.36, A.st === 'P' ? 'pp' : lay); }      /* the aircon units, outside their walls */ break;
    case 'gen': G.pl(P, lay, 1); G.pl(rectAt(c, Math.max(0.2, el.w - 0.5), Math.max(0.2, el.d - 0.35), el.rot), lay, 1); break;
    case 'tank': G.pl(P, lay, 1); G.pl([lp(-el.w / 2 + 0.12, -el.d / 2), lp(-el.w / 2 + 0.12, el.d / 2)], lay); G.pl([lp(el.w / 2 - 0.12, -el.d / 2), lp(el.w / 2 - 0.12, el.d / 2)], lay); break;
    case 'hh': case 'enc': G.pl(P, lay, 1); G.pl([P[0], P[2]], lay); G.pl([P[1], P[3]], lay); break;
    case 'epole': G.ci(c, Math.max(el.w / 2, 0.15), lay); cross(c, 0.35, lay); break;
    case 'rpole': G.ci(c, Math.max(el.w / 2, 0.1), lay); G.pl(sqr(c, Math.max(STD.encW, el.w + 0.16) / 2, el.rot), lay, 1); break;      /* the pole in its concrete encasement */
    case 'odf': G.pl(P, lay, 1); G.pl([P[0], P[2]], lay); G.pl([P[1], P[3]], lay); break;
    case 'rack': G.pl(P, lay, 1); G.pl([lp(-el.w / 2, -el.d / 2 + 0.08), lp(el.w / 2, -el.d / 2 + 0.08)], lay); G.pl([lp(-el.w / 2 + 0.06, -el.d / 2), lp(-el.w / 2 + 0.06, -el.d / 2 + 0.08)], lay); G.pl([lp(el.w / 2 - 0.06, -el.d / 2), lp(el.w / 2 - 0.06, -el.d / 2 + 0.08)], lay); break;   /* the double line is its front */
    case 'runit': if (!rackHost(S, el)) { G.pl(P, lay, 1); G.pl([P[0], P[2]], lay); } break;
    case 'ac': { if (!S.room) { G.pl(P, lay, 1); break; } const k = wallOf(S.site.L, S.site.W, el.x, el.y), hz = k.side === 'S' || k.side === 'N', ad = num(el.d, 0.3), aw = num(el.w, 0.8), q = [k.x + k.n[0] * (0.1 + ad / 2), k.y + k.n[1] * (0.1 + ad / 2)]; G.pl(rectAt(q, hz ? aw : ad, hz ? ad : aw, 0), lay, 1); G.ci(q, Math.min(aw, ad) * 0.36, lay); break; }      /* outside the wall, beyond its thickness */
    case 'port': { if (!S.room) { G.pl(P, lay, 1); break; } const k = wallOf(S.site.L, S.site.W, el.x, el.y), hz = k.side === 'S' || k.side === 'N', q = [k.x + k.n[0] * 0.05, k.y + k.n[1] * 0.05], hw = Math.max(0.1, el.w / 2); G.pl(rectAt(q, hz ? 2 * hw : 0.16, hz ? 0.16 : 2 * hw, 0), lay, 1); for (const j of [-0.6, 0, 0.6]) G.ci(hz ? [q[0] + j * hw, q[1]] : [q[0], q[1] + j * hw], 0.035, lay); break; }
    case 'clo': { const m = cloMount(S, rg || routeGeom(S), el); if (m) { G.ci(m.c, STD.cloR * 1.12, lay); G.ci(m.c, STD.cloR * 0.5, lay); } else { G.ci(c, 0.22, lay); cross(c, 0.22, lay); } break; }
    case 'exit': { const x = rg ? rg.exits.find(q => q.el === el.id) : null, er = x ? null : exitRun(S, el), at = x ? x.at : c, u = x ? x.u : er ? er.u : rot2(1, 0, el.rot || 0), hc = [at[0] + u[0] * 0.025, at[1] + u[1] * 0.025]; G.pl(rectAt(hc, el.w, el.d, el.rot), lay, 1); G.ci(hc, STD.sleeve / 2, lay); for (const k of [0, 1]) G.ci([at[0] + u[0] * k * 0.05, at[1] + u[1] * k * 0.05], 0.025, lay); break; }      /* the block, its 114 mm hole and the two 50 mm pipes in it; the cable is in the first one */      /* a square block, the 114 mm pipe in it, and the two 50 mm pipes in that */
    case 'sbox': G.pl(P, lay, 1); G.pl(rectAt(c, el.w * 0.55, el.d * 0.55, el.rot), lay, 1); break;
    default: G.pl(P, lay, 1);
      if (el.t === 'pad') for (const K of padSteps(el)) {      /* beta 4.2: its stairs, seen from above: the outline and the edge of each step */
        const run = K.n * K.tread; G.pl([faceXY(el, K.face, K.u - K.w / 2, 0), faceXY(el, K.face, K.u - K.w / 2, -run), faceXY(el, K.face, K.u + K.w / 2, -run), faceXY(el, K.face, K.u + K.w / 2, 0)], lay);
        for (let i = 1; i < K.n; i++) G.pl([faceXY(el, K.face, K.u - K.w / 2, -i * K.tread), faceXY(el, K.face, K.u + K.w / 2, -i * K.tread)], lay);
      }
  }
}
/* ---------- labels that sit beside what they name, parallel to it, and never on top of anything ---------- */
const readable = a => { a = ((a + 180) % 360 + 360) % 360 - 180; if (a > 90) a -= 180; if (a <= -90) a += 180; return a; };
function hull(P) {
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
/* do two convex outlines overlap? (separating axis test) */
function polysHit(A, B) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], nx = b[1] - a[1], ny = a[0] - b[0]; if (!nx && !ny) continue;
    let a0 = 1e18, a1 = -1e18, b0 = 1e18, b1 = -1e18;
    for (const q of A) { const d = q[0] * nx + q[1] * ny; if (d < a0) a0 = d; if (d > a1) a1 = d; }
    for (const q of B) { const d = q[0] * nx + q[1] * ny; if (d < b0) b0 = d; if (d > b1) b1 = d; }
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}
function obb(c, w, h, a) { const cs = Math.cos(a * D2R), sn = Math.sin(a * D2R), ux = cs * w / 2, uy = sn * w / 2, vx = -sn * h / 2, vy = cs * h / 2; return [[c[0] - ux - vx, c[1] - uy - vy], [c[0] + ux - vx, c[1] + uy - vy], [c[0] + ux + vx, c[1] + uy + vy], [c[0] - ux + vx, c[1] - uy + vy]]; }
function thick(a, b, w) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l * w / 2, ny = (b[0] - a[0]) / l * w / 2; return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]; }
const polyBoxArea = P => { const b = polyBox(P); return (b[2] - b[0]) * (b[3] - b[1]); };
function Labeler(G) { this.G = G; this.obst = []; this.labs = []; this.leads = []; this.out = []; }
/* solid: a thing a leader line should not run across on its way to something else. own: the label key of the item it belongs to */
Labeler.prototype.block = function (poly, solid, own) { if (poly && poly.length > 1) this.obst.push({ p: poly, b: polyBox(poly), s: !!solid, o: own || null }); };
/* on a sheet the drawing and its labels must stay inside the room there is: bb = what is drawn so far, lim = [width, height] allowed */
Labeler.prototype.fit = function (bb, lim, rect) { this.bb = bb.slice(); this.lim = lim || null; this.rect = rect || null; };          /* rect: on a screen, the part of the drawing that is in view */
Labeler.prototype.grow = function (box) { if (this.bb) { const b = polyBox(box); this.bb = [Math.min(this.bb[0], b[0]), Math.min(this.bb[1], b[1]), Math.max(this.bb[2], b[2]), Math.max(this.bb[3], b[3])]; } };
/* own: a label may sit on the item it names */
Labeler.prototype.free = function (box, own) { const b = polyBox(box), r = this.rect; if (r && (b[0] < r[0] || b[1] < r[1] || b[2] > r[2] || b[3] > r[3])) return false; if (this.lim && this.bb && (Math.max(this.bb[2], b[2]) - Math.min(this.bb[0], b[0]) > this.lim[0] || Math.max(this.bb[3], b[3]) - Math.min(this.bb[1], b[1]) > this.lim[1])) return false; for (const o of this.obst) if (!(own && o.o === own) && !(o.b[0] >= b[2] || o.b[2] <= b[0] || o.b[1] >= b[3] || o.b[3] <= b[1]) && polysHit(box, o.p)) return false; return !(this.rs && !own && this.inkHit(box, b)); };      /* (beta 4.2: and on blank paper, unless it is the name of the item it sits on) */
/* beta 4.2: "blank paper". Every line of the drawing is marked on a fine raster. A name that does not sit on its own item takes a place only where the
   raster is empty, so it never lies over a line of anything: not over a hidden bend, a lattice member or a dashed pipe that nothing else keeps it clear of. */
Labeler.prototype.ink = function (prims, h) {
  let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; const sg = [];
  for (const p of prims) { if (p.k !== 'pl' || !p.pts || p.lay === 'gh') continue; const n = p.pts.length; for (let i = 0; i < (p.close ? n : n - 1); i++) { const a = p.pts[i], b = p.pts[(i + 1) % n]; if (!isFinite(a[0] + a[1] + b[0] + b[1])) continue; sg.push(a, b); x0 = Math.min(x0, a[0], b[0]); x1 = Math.max(x1, a[0], b[0]); y0 = Math.min(y0, a[1], b[1]); y1 = Math.max(y1, a[1], b[1]); } }
  if (!sg.length) return;
  const cs = Math.max(0.2 * h, Math.max(x1 - x0, y1 - y0) / 900), nx = Math.ceil((x1 - x0) / cs) + 2, ny = Math.ceil((y1 - y0) / cs) + 2, g = new Uint8Array(nx * ny), W1 = nx + 1, sat = new Int32Array(W1 * (ny + 1));
  for (let i = 0; i < sg.length; i += 2) { const a = sg[i], b = sg[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cs * 0.5))); for (let k = 0; k <= n; k++) g[Math.floor((a[1] + (b[1] - a[1]) * k / n - y0) / cs) * nx + Math.floor((a[0] + (b[0] - a[0]) * k / n - x0) / cs)] = 1; }
  for (let j = 0; j < ny; j++) { let r = 0; for (let i = 0; i < nx; i++) { r += g[j * nx + i]; sat[(j + 1) * W1 + i + 1] = sat[j * W1 + i + 1] + r; } }
  this.rs = { x0, y0, cs, nx, ny, g, sat, W1 };
};
Labeler.prototype.inkHit = function (box, b) {
  const r = this.rs, m = 0.07 * Math.min(b[2] - b[0], b[3] - b[1]);      /* a line may touch the margin round the text */
  if (box.length === 4 && Math.abs(box[0][1] - box[1][1]) < 1e-9 && Math.abs(box[1][0] - box[2][0]) < 1e-9) {      /* level text: the sum over its cells, in one step */
    const i0 = Math.max(0, Math.floor((b[0] + m - r.x0) / r.cs)), i1 = Math.min(r.nx - 1, Math.floor((b[2] - m - r.x0) / r.cs)), j0 = Math.max(0, Math.floor((b[1] + m - r.y0) / r.cs)), j1 = Math.min(r.ny - 1, Math.floor((b[3] - m - r.y0) / r.cs));
    return i1 >= i0 && j1 >= j0 && r.sat[(j1 + 1) * r.W1 + i1 + 1] - r.sat[j0 * r.W1 + i1 + 1] - r.sat[(j1 + 1) * r.W1 + i0] + r.sat[j0 * r.W1 + i0] > 0;
  }
  if (box.length !== 4) return false;
  const c = [(box[0][0] + box[2][0]) / 2, (box[0][1] + box[2][1]) / 2], k = 0.88, P = box.map(p => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
  const ax = [P[1][0] - P[0][0], P[1][1] - P[0][1]], ay = [P[3][0] - P[0][0], P[3][1] - P[0][1]], mx = Math.max(1, Math.ceil(Math.hypot(ax[0], ax[1]) / (r.cs * 0.7))), my = Math.max(1, Math.ceil(Math.hypot(ay[0], ay[1]) / (r.cs * 0.7)));
  for (let j = 0; j <= my; j++) for (let i = 0; i <= mx; i++) { const x = Math.floor((P[0][0] + ax[0] * i / mx + ay[0] * j / my - r.x0) / r.cs), y = Math.floor((P[0][1] + ax[1] * i / mx + ay[1] * j / my - r.y0) / r.cs); if (x >= 0 && y >= 0 && x < r.nx && y < r.ny && r.g[y * r.nx + x]) return true; }
  return false;
};

/* every label that is placed is kept, with its key, its outline, its middle and the point of its item it is measured from: this is what makes a label something the user can pick and drag */
Labeler.prototype.keep = function (key, box, c, ap, x) { this.block(box); this.labs.push(box); this.grow(box); if (key) this.out.push(Object.assign({ key, poly: box, c: c.slice(), ap: (ap || c).slice() }, x || {})); };
const txSize = (lines, h, bold) => { const pitch = h * 1.45; return { pitch, w: Math.max.apply(null, lines.map(s => textW(s, h) * (bold ? 1.06 : 1))) + h * 0.5, hg: (lines.length - 1) * pitch + h * 1.4 }; };
Labeler.prototype.write = function (lines, h, lay, c, a, bold) { const z = txSize(lines, h, bold), sn = Math.sin(a * D2R), cs = Math.cos(a * D2R); lines.forEach((s, k) => { const off = z.hg / 2 - 0.2 * h - k * z.pitch - h; this.G.tx([c[0] - sn * off, c[1] + cs * off], s, h, lay, 'c', a, bold); }); };
/* lines of text as one block. cands(w, h) gives block centres and angles to try, best first. */
Labeler.prototype.place = function (lines, h, lay, cands, bold, key, ap, own) {
  const z = txSize(lines, h, bold);
  for (const c of cands(z.w, z.hg)) {
    const box = obb(c.p, z.w, z.hg, c.a); if (!this.free(box, own)) continue;
    this.write(lines, h, lay, c.p, c.a, bold); this.keep(key, box, c.p, ap, { a: c.a });
    return true;
  }
  return false;
};
/* where the line from c to p leaves the outline around c */
function edgeOut(c, p, box) { let best = 1; for (let i = 0; i < box.length; i++) { const a = box[i], b = box[(i + 1) % box.length], rx = p[0] - c[0], ry = p[1] - c[1], sx = b[0] - a[0], sy = b[1] - a[1], den = rx * sy - ry * sx; if (Math.abs(den) < 1e-12) continue; const t = ((a[0] - c[0]) * sy - (a[1] - c[1]) * sx) / den, u = ((a[0] - c[0]) * ry - (a[1] - c[1]) * rx) / den; if (t > 1e-6 && t < best && u >= 0 && u <= 1) best = t; } return [c[0] + (p[0] - c[0]) * best, c[1] + (p[1] - c[1]) * best]; }
Labeler.prototype.arrow = function (from, p, h, lay) { const dx = from[0] - p[0], dy = from[1] - p[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, s = 1.15 * h; this.G.pl([p, from], lay); this.G.fl([p, [p[0] + ux * s - uy * s * 0.22, p[1] + uy * s + ux * s * 0.22], [p[0] + ux * s + uy * s * 0.22, p[1] + uy * s - ux * s * 0.22]], lay); };
/* a label the user dragged: it stays where it was put, measured from its item. When it is no longer next to its item, a leader joins the two. */
/* like place, but the text may cross the lines of the drawing: it only keeps clear of other names, of leaders and of what avoid holds. Gives the box it took, or null. */
Labeler.prototype.placeLoose = function (lines, h, lay, cands, bold, key, ap, avoid) {
  const z = txSize(lines, h, bold), r = this.rect;
  for (const c of cands(z.w, z.hg)) {
    const box = obb(c.p, z.w, z.hg, c.a), b = polyBox(box);
    if (r && (b[0] < r[0] || b[1] < r[1] || b[2] > r[2] || b[3] > r[3])) continue;
    if (this.lim && this.bb && (Math.max(this.bb[2], b[2]) - Math.min(this.bb[0], b[0]) > this.lim[0] || Math.max(this.bb[3], b[3]) - Math.min(this.bb[1], b[1]) > this.lim[1])) continue;
    if (this.labs.some(q => polysHit(box, q)) || this.leads.some(l => segPoly(l[0], l[1], box)) || (avoid && avoid.some(q => polysHit(box, q)))) continue;
    this.write(lines, h, lay, c.p, c.a, bold); this.keep(key, box, c.p, ap, { a: c.a }); return box;
  }
  return null;
};
Labeler.prototype.fixed = function (key, lines, h, lay, c, a, ap, x) {
  const bold = !!(x && x.bold), z = txSize(lines, h, bold), box = obb(c, z.w, z.hg, a);
  this.write(lines, h, lay, c, a, bold);
  if (ap && !inPoly(ap, box) && Math.hypot(ap[0] - c[0], ap[1] - c[1]) > Math.max(z.w, z.hg) * 0.5 + 1.6 * h) { const e = edgeOut(c, ap, box); this.arrow(e, ap, h, lay); this.leads.push([ap, e]); this.block(thick(ap, e, 0.5 * h)); }
  this.keep(key, box, c, ap, Object.assign({ a, moved: 1 }, x || {}));
};
/* a note close to what it names: level text and a short straight leader with an arrowhead.
   Every free place around the point is scored: a short leader, pointing away from the middle of the drawing,
   that crosses nothing else. Text never sits on anything and leaders never cross each other. o: { ctr, ang, max: how many leader lengths to try } */
const LEAD_R = [1.5, 2.3, 3.2, 4.3, 5.6, 7.2, 9, 11.5, 14.5, 18, 22, 27, 33, 40];
Labeler.prototype.seek = function (p, lines, h, o) {
  o = o || {}; const pitch = h * 1.45, w = Math.max.apply(null, lines.map(s => textW(s, h))) + h * 0.4, hg = (lines.length - 1) * pitch + h * 1.4, land = 0.7 * h;
  const out = o.ctr ? Math.atan2(p[1] - o.ctr[1], p[0] - o.ctr[0]) / D2R : 90, ANG = o.ang || [45, 135, -45, -135, 60, 120, -60, -120, 30, 150, -30, -150];
  let best = null;
  for (let ri = 0; ri < (o.max || LEAD_R.length); ri++) {
    const d = LEAD_R[ri] * h * 1.25; if (best && best.cost < ri * 1.1) break;
    for (const a of ANG) {
      const ux = Math.cos(a * D2R), uy = Math.sin(a * D2R), e = [p[0] + ux * d, p[1] + uy * d], up = Math.abs(ux) < 0.2, sg = ux >= 0 ? 1 : -1;
      const c = up ? [e[0], e[1] + (uy > 0 ? 1 : -1) * (hg / 2 + 0.15 * h)] : [e[0] + sg * (land + 0.25 * h + w / 2), e[1]], box = obb(c, w, hg, 0);
      if (!this.free(box)) continue;
      let bad = false, cross = 0; const e2 = up ? e : [e[0] + sg * land, e[1]];
      for (const l of this.leads) { if (segPoly(l[0], l[1], box)) { bad = true; break; } if (segSeg(p, e, l[0], l[1]) || segSeg(e, e2, l[0], l[1])) { if (o.relax) cross++; else { bad = true; break; } } }
      if (!bad) for (const b of this.labs) if (segPoly(p, e, b)) { bad = true; break; }
      if (bad) continue;
      for (const q of this.obst) if (q.s && !inPoly(p, q.p) && !(q.b[0] > Math.max(p[0], e[0]) || q.b[2] < Math.min(p[0], e[0]) || q.b[1] > Math.max(p[1], e[1]) || q.b[3] < Math.min(p[1], e[1])) && segPoly(p, e, q.p)) cross++;
      const dev = Math.abs(((a - out) % 360 + 540) % 360 - 180), cost = ri * 1.1 + dev / 75 + cross * 4 + (lines.length - 1) * 0.5;
      if (!best || cost < best.cost - 1e-9) best = { cost, p, e, e2, c, box, up, sg, lines, w, hg };
    }
  }
  return best;
};
Labeler.prototype.commit = function (b, h, lay, key) {
  const G = this.G, p = b.p, pitch = h * 1.45, dx = b.e[0] - p[0], dy = b.e[1] - p[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, s = 1.15 * h;
  G.pl(b.up ? [p, b.e] : [p, b.e, b.e2], lay);
  G.fl([p, [p[0] + ux * s - uy * s * 0.22, p[1] + uy * s + ux * s * 0.22], [p[0] + ux * s + uy * s * 0.22, p[1] + uy * s - ux * s * 0.22]], lay);
  b.lines.forEach((t, k) => G.tx([b.up ? b.c[0] : b.c[0] - b.sg * (b.w / 2 - 0.2 * h), b.c[1] + b.hg / 2 - 0.2 * h - k * pitch - h], t, h, lay, b.up ? 'c' : b.sg > 0 ? 'l' : 'r'));
  this.keep(key, b.box, b.c, p, { a: 0 }); this.leads.push([p, b.e]); this.block(thick(p, b.e, 0.5 * h)); if (!b.up) { this.leads.push([b.e, b.e2]); this.block(thick(b.e, b.e2, 0.5 * h)); }
};
Labeler.prototype.callout = function (p, lines, h, lay, o) { const b = this.seek(p, lines, h, o); if (b) this.commit(b, h, lay, o && o.key); return !!b; };
/* a set of notes { key, p, alt, s, st, w }: p is where the arrow lands (alt: other points that would do), w the usual line width in letters.
   Each note may be set narrower or wider. What is proposed goes first. At every step the note with the worst best place is next, so that nobody takes its only room. */
Labeler.prototype.calloutsOld = function (list, h, o) {
  const HS = o && o.hs && o.hs.length ? o.hs : [h], left = list.slice(), fail = [], find = (a, oo) => {
    let b = null; const seen = {};
    for (const wd of [a.w || 18, 14, 28]) { const lines = a.lines && wd === (a.w || 18) ? a.lines : wrap(a.s, wd), key = lines.join('|'); if (seen[key] || (lines.length > 4 && wd !== (a.w || 18))) continue; seen[key] = 1; for (const p of [a.p].concat(a.alt || [])) HS.forEach((hh, j) => { const c = this.seek(p, lines, hh, oo || o); if (c) { c.h = hh; c.cost += j * 0.9; } if (c && (!b || c.cost < b.cost - 0.01)) b = c; }); }      /* a smaller size costs a little: it is taken when it gives a shorter leader */
    return b;
  };
  while (left.length) {
    let pick = null;
    for (let i = left.length - 1; i >= 0; i--) {
      const a = left[i]; if (a.best === undefined) a.best = find(a);
      if (!a.best) { fail.push(a); left.splice(i, 1); continue; }
      const key = a.best.cost + (a.st === 'P' ? 1000 : 0); if (!pick || key > pick.key) pick = { a, key };
    }
    if (!pick) break;
    const b = pick.a.best, ld = thick(b.p, b.e, 0.5 * h), ld2 = b.up ? null : thick(b.e, b.e2, 0.5 * h); this.commit(b, b.h || h, pick.a.lay || (pick.a.st === 'P' ? 'tp' : 'tx'), pick.a.key); left.splice(left.indexOf(pick.a), 1);
    for (const a of left) { const c = a.best; if (c && (polysHit(c.box, b.box) || polysHit(c.box, ld) || (ld2 && polysHit(c.box, ld2)) || segSeg(c.p, c.e, b.p, b.e) || segSeg(c.e, c.e2, b.p, b.e) || segSeg(c.p, c.e, b.e, b.e2) || segPoly(c.p, c.e, b.box))) a.best = undefined; }
  }
  /* still no room: on a phone-size drawing two leaders may cross rather than lose the name. Anywhere else a leader never crosses another (beta 4.2): the name goes to the notes at the edge. */
  if (o && o.lastX) for (let i = fail.length - 1; i >= 0; i--) { const a = fail[i], b = find(a, Object.assign({ relax: 1 }, o)); if (b) { this.commit(b, b.h || h, a.lay || (a.st === 'P' ? 'tp' : 'tx'), a.key); fail.splice(i, 1); } }
  return fail;
};
/* ---------- beta 4.2: the notes are set out together ----------
   ring: every free place a note could take at one leader length round its point, each with what it costs. A short leader that points away from the middle of
   the drawing and runs over clear ground costs least; a long one costs much more; one that runs across another item costs more still. */
const LEAD_ANG = [45, 135, -45, -135, 60, 120, -60, -120, 30, 150, -30, -150];
/* one place of a note: p the point of its arrow, e the end of its leader, T its text { lines, h, w, hg }. Pushed onto out with what it costs, when it is free.
   ri: how long the leader is, on the scale of LEAD_R */
Labeler.prototype.spot = function (p, e, T, o, add, out, ri, ang) {
  const h = T.h, w = T.w, hg = T.hg, land = 0.7 * h, dx = e[0] - p[0], dy = e[1] - p[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, up = Math.abs(ux) < 0.2, sg = ux >= 0 ? 1 : -1;
  const c = up ? [e[0], e[1] + (uy > 0 ? 1 : -1) * (hg / 2 + 0.15 * h)] : [e[0] + sg * (land + 0.25 * h + w / 2), e[1]], box = [[c[0] - w / 2, c[1] - hg / 2], [c[0] + w / 2, c[1] - hg / 2], [c[0] + w / 2, c[1] + hg / 2], [c[0] - w / 2, c[1] + hg / 2]];
  if (!this.free(box)) return;
  const e2 = up ? e : [e[0] + sg * land, e[1]];
  for (const l of this.leads) if (segPoly(l[0], l[1], box) || segSeg(p, e, l[0], l[1]) || segSeg(e, e2, l[0], l[1])) return;
  for (const b of this.labs) if (segPoly(p, e, b)) return;
  let cross = 0, soft = 0; const x0 = Math.min(p[0], e[0]), x1 = Math.max(p[0], e[0]), y0 = Math.min(p[1], e[1]), y1 = Math.max(p[1], e[1]);
  for (const q of this.obst) { if (q.b[0] > x1 || q.b[2] < x0 || q.b[1] > y1 || q.b[3] < y0 || inPoly(p, q.p)) continue; if (segPoly(p, e, q.p)) { if (q.s) cross++; else soft++; } }
  const std = ang !== undefined, a = std ? ang : Math.atan2(uy, ux) / D2R;
  if (!std) { const r = d / (h * 1.25); ri = 0; while (ri < LEAD_R.length - 1 && LEAD_R[ri + 1] <= r) ri++; if (ri < LEAD_R.length - 1) ri += clamp((r - LEAD_R[ri]) / (LEAD_R[ri + 1] - LEAD_R[ri]), 0, 1); }
  const outA = o.ctr ? Math.atan2(p[1] - o.ctr[1], p[0] - o.ctr[0]) / D2R : 90, dev = Math.abs(((a - outA) % 360 + 540) % 360 - 180), m = 0.6 * h;
  out.push({ cost: ri * 1.1 + (ri > 5 ? (ri - 5) * (ri - 5) * 0.3 : 0) + dev / 75 + cross * 8 + Math.min(soft, 12) * 0.5 + (T.lines.length - 1) * 0.5 + (add || 0) + (std ? 0 : 0.5), ri, p, e, e2, c, box, up, sg, lines: T.lines, w, hg, h, ang: std ? ang : Math.round(a / 15) * 15,
    bb: [Math.min(c[0] - w / 2, p[0]) - m, Math.min(c[1] - hg / 2, p[1]) - m, Math.max(c[0] + w / 2, p[0]) + m, Math.max(c[1] + hg / 2, p[1]) + m] });      /* bb: the note with its leader, for a quick "these two are far apart" */
};
const noteText = (lines, h) => ({ lines, h, w: Math.max.apply(null, lines.map(s => textW(s, h))) + h * 0.4, hg: (lines.length - 1) * h * 1.45 + h * 1.4 });
/* the places at one leader length, in the usual directions */
Labeler.prototype.ring = function (p, T, o, ri, add, out) { const d = LEAD_R[ri] * T.h * 1.25; for (const a of o.angs) this.spot(p, [p[0] + Math.cos(a * D2R) * d, p[1] + Math.sin(a * D2R) * d], T, o, add, out, ri, a); };
/* the places close by on a fine grid, with a leader at any angle: what lets several notes of one small item stand in a tidy pile beside it */
Labeler.prototype.grid = function (p, T, o, add, out) { const h = T.h; for (const sx of [1, -1]) for (const kx of [1.4, 3, 5, 7.5]) for (let k = -10; k <= 10; k++) { const dx = sx * kx * h, dy = k * 0.725 * h; if (!k || Math.abs(dy) > Math.abs(dx) * 4.7) continue; this.spot(p, [p[0] + dx, p[1] + dy], T, o, add, out); } };
/* the places of one note that go into the choice: its few best ones, then the best one in every direction that is clear of those, so that a note whose
   best corner is wanted by its neighbours still has somewhere else to go. Every way of breaking its text into lines and every point its arrow may land on
   is tried; a smaller text size close by only. dense: also the fine grid close by. What is found is kept on the note (n.raw), so asking again costs little. */
Labeler.prototype.cands = function (n, h, o, K, dense) {
  const a = n.a, HS = o.hs && o.hs.length ? o.hs : [h], nMax = o.max || LEAD_R.length;
  if (!n.raw) {
    const vars = n.vars = [], seen = {}, out = n.raw = [];
    for (const wd of [a.w || 18, 14, 28]) { const lines = a.lines && wd === (a.w || 18) ? a.lines : wrap(a.s, wd), key = lines.join('|'); if (seen[key] || (lines.length > 4 && wd !== (a.w || 18))) continue; seen[key] = 1; for (const p of [a.p].concat((a.alt || []).slice(0, 5))) vars.push({ p, T: noteText(lines, HS[0]), main: p === a.p && !vars.length }); }
    for (let ri = 0; ri < nMax; ri++) {
      for (const v of vars) if (ri < 6 || v.T.lines === vars[0].T.lines) this.ring(v.p, v.T, o, ri, 0, out);
      if (ri < 3) for (let j = 1; j < HS.length; j++) this.ring(a.p, noteText(vars[0].T.lines, HS[j]), o, ri, j * 0.9, out);      /* a smaller size is worth it only where it lets the note stand close */
      if (ri >= 2 && out.length >= K * 3) { const dirs = {}; for (const c of out) dirs[c.ang] = 1; if (Object.keys(dirs).length >= 9) break; }      /* enough places in enough directions */
    }
  }
  if (dense && !n.dense) { n.dense = 1; const done = []; for (const v of n.vars) { if (done.filter(q => q === v.p).length >= 2 || (v.p !== a.p && done.length >= 4)) continue; done.push(v.p); this.grid(v.p, v.T, o, 0, n.raw); } }
  const out = n.raw.slice().sort((x, y) => x.cost - y.cost), keep = [], far = (c, m) => !keep.some(q => Math.abs(q.c[0] - c.c[0]) + Math.abs(q.c[1] - c.c[1]) < m * c.h);
  for (const c of out) { if (keep.length >= 6) break; if (far(c, 0.8)) keep.push(c); }
  const dir = {}; for (const c of out) { const k = c.ang + '|' + (c.p === a.p ? 0 : 1); if (dir[k] || !far(c, 2.4)) continue; dir[k] = 1; keep.push(c); if (keep.length >= K) break; }
  for (const c of out) { if (keep.length >= K) break; if (far(c, dense ? 0.7 : 1.6)) keep.push(c); }
  return keep.sort((x, y) => x.cost - y.cost);
};
Labeler.prototype.callouts = function (list, h, o) {
  o = o || {}; if (o.quick) return [];      /* while an item is dragged on a slow device: the notes come back when the drag ends */
  if (o.lastX || !list.length) return this.calloutsOld(list, h, o);
  o = Object.assign({}, o, { angs: (o.ang || LEAD_ANG).concat([0, 180]) });
  const K = 22, B = 26, lim = this.lim, N = list.map(a => ({ a })); for (const n of N) n.C = this.cands(n, h, o, K);
  /* two leaders that run side by side read as one line: away from their arrowheads they keep half a text height apart */
  const beside = (a, b) => { const m = 0.55 * Math.min(a.h, b.h); for (const t of [0.35, 0.7, 1]) if (distSeg([a.p[0] + (a.e[0] - a.p[0]) * t, a.p[1] + (a.e[1] - a.p[1]) * t], b.p, b.e) < m || distSeg([b.p[0] + (b.e[0] - b.p[0]) * t, b.p[1] + (b.e[1] - b.p[1]) * t], a.p, a.e) < m) return true; return false; };
  const hit = (a, b) => !(a.bb[0] > b.bb[2] || a.bb[2] < b.bb[0] || a.bb[1] > b.bb[3] || a.bb[3] < b.bb[1]) && (polysHit(a.box, b.box) || segPoly(a.p, a.e, b.box) || segPoly(b.p, b.e, a.box) || segSeg(a.p, a.e, b.p, b.e) || segSeg(a.e, a.e2, b.p, b.e) || segSeg(a.p, a.e, b.e, b.e2) || segSeg(a.e, a.e2, b.e, b.e2) || beside(a, b));
  let id = 0; const memo = new Map(), clash = (a, b) => { const k = a.id < b.id ? a.id * 16384 + b.id : b.id * 16384 + a.id; let v = memo.get(k); if (v === undefined) { v = hit(a, b); memo.set(k, v); } return v; };
  const solve = () => {
    for (const n of N) for (const c of n.C) if (c.id === undefined) c.id = id++;
    const ord = N.slice().sort((x, y) => (y.pr || 0) - (x.pr || 0) || x.C.length - y.C.length || (y.C[0] ? y.C[0].cost : 0) - (x.C[0] ? x.C[0].cost : 0));      /* a note that came off badly last time first; then the note with the fewest places */
    let beam = [{ ch: [], cost: 0, bb: this.bb || null }];
    for (const n of ord) {
      const next = [];
      for (const st of beam) {
        for (const c of n.C) {
          if (st.ch.some(q => q && clash(q, c))) continue;
          let bb = st.bb; if (bb && lim) { const b = c.bb; bb = [Math.min(bb[0], c.c[0] - c.w / 2), Math.min(bb[1], c.c[1] - c.hg / 2), Math.max(bb[2], c.c[0] + c.w / 2), Math.max(bb[3], c.c[1] + c.hg / 2)]; if (bb[2] - bb[0] > lim[0] || bb[3] - bb[1] > lim[1]) continue; }
          next.push({ ch: st.ch.concat([c]), cost: st.cost + c.cost, bb });
        }
        next.push({ ch: st.ch.concat([null]), cost: st.cost + miss(n), bb: st.bb });
      }
      next.sort((x, y) => x.cost - y.cost); beam = next.slice(0, B);
    }
    const m = new Map(); ord.forEach((n, i) => m.set(n, beam[0].ch[i])); return better(m);
  };
  /* the choice is then gone over note by note: a note moves to a cheaper place of its own when that place is clear, or when the one note in its way
     has somewhere else to go and the two together come out cheaper. This is what swaps two notes that stand in each other's way. */
  const miss = n => n.a.st === 'P' ? 90 : 70, within = m => { if (!lim || !this.bb) return true; let b = this.bb; for (const c of m.values()) if (c) b = [Math.min(b[0], c.c[0] - c.w / 2), Math.min(b[1], c.c[1] - c.hg / 2), Math.max(b[2], c.c[0] + c.w / 2), Math.max(b[3], c.c[1] + c.hg / 2)]; return b[2] - b[0] <= lim[0] && b[3] - b[1] <= lim[1]; };
  const better = m => {
    for (let pass = 0, moved = true; moved && pass < 30; pass++) {
      moved = false;
      for (const n of N) {
        const cur = m.get(n), cc = cur ? cur.cost : miss(n);
        for (const c of n.C) {
          if (c.cost >= cc - 1e-6) break; if (c === cur) continue;
          const bl = N.filter(q => q !== n && m.get(q) && clash(m.get(q), c)); if (bl.length > 1) continue;
          if (!bl.length) { m.set(n, c); if (within(m)) { moved = true; break; } m.set(n, cur); continue; }
          const q = bl[0], qc = m.get(q), alt = q.C.find(k => k !== qc && !clash(k, c) && !N.some(r => r !== q && r !== n && m.get(r) && clash(m.get(r), k))) || null;
          if (cc - c.cost - ((alt ? alt.cost : miss(q)) - qc.cost) <= 1e-6) continue;
          m.set(n, c); m.set(q, alt); if (within(m)) { moved = true; break; } m.set(n, cur); m.set(q, qc);
        }
      }
    }
    let cost = 0; for (const n of N) { const c = m.get(n); cost += c ? c.cost : miss(n); } return { m, cost };
  };
  let best = solve();
  /* a note that got a long leader, or none: it and the notes round it are given the fine grid of places close by, it goes to the front of the queue,
     and the choice is made again; the best of the tries is kept */
  const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]); let last = best;
  for (let round = 0; round < 2; round++) {
    const hard = N.filter(n => { const c = last.m.get(n); return !c || c.ri >= 5.5; }); if (!hard.length) break;
    for (const n of hard) n.pr = (n.pr || 0) + 1;
    for (const n of N) if (!n.dense && hard.some(g => d2(g.a.p, n.a.p) < 18 * h)) n.C = this.cands(n, h, o, 44, 1);
    last = solve(); if (last.cost < best.cost - 1e-6) best = last;
  }
  const fail = [];
  for (const n of N) { const b = best.m.get(n); if (b) this.commit(b, b.h, n.a.lay || (n.a.st === 'P' ? 'tp' : 'tx'), n.a.key); else fail.push(n.a); }
  let rest = fail.length ? this.calloutsOld(fail, h, o) : fail;
  if (rest.length && this.rect) { const r = this.rect; this.rect = null; try { rest = this.calloutsOld(rest, h, o); } finally { this.rect = r; } }      /* no place in the part of the drawing that is in view: one outside it */
  return rest;      /* a note that found no place among its best ones takes any free place there is, however far */
};
/* beta 4.2: a length beside its piece and parallel to it. Where the place right beside the piece is taken it moves to the nearest clear place, still
   parallel to the piece, and a thin leader ties it to the piece. It is never written over a line of the drawing or over another name. */
Labeler.prototype.along = function (lines, h, lay, a, b, key, ap, o) {
  o = o || {}; const z = txSize(lines, h), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, ang = readable(Math.atan2(dy, dx) / D2R), gap = o.gap || 0, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], C = [];
  for (let j = 0; j < (o.wide ? 26 : 11); j++) for (let i = (o.wide ? -15 : -7); i <= (o.wide ? 15 : 7); i++) for (const s of [1, -1]) { const u = i * z.w * 0.55, v = s * (gap + z.hg / 2 + j * h * 0.95), on = Math.abs(u) <= Math.max(0, l / 2 - z.w * 0.35) && j < 2; C.push({ u, v, on, d: Math.hypot(u, v) + (on ? 0 : 1.5 * h) }); }
  C.sort((p, q) => p.d - q.d);
  for (const k of C) {
    const c = [m[0] + ux * k.u - uy * k.v, m[1] + uy * k.u + ux * k.v], box = obb(c, z.w, z.hg, ang); if (!this.free(box)) continue;
    let e = null, f = null;
    if (!k.on) { const t = clamp(k.u / l + 0.5, 0.2, 0.8); f = [a[0] + dx * t, a[1] + dy * t]; e = edgeOut(c, f, box); if (this.leads.some(q => segSeg(f, e, q[0], q[1])) || this.labs.some(q => segPoly(f, e, q))) continue; }
    this.write(lines, h, lay, c, ang, false); this.keep(key, box, c, ap || m, { a: ang });
    if (e) { this.arrow(e, f, h * 0.7, lay); this.leads.push([f, e]); this.block(thick(f, e, 0.4 * h)); }
    return true;
  }
  return false;
};
/* places beside the line p-q, parallel to it: on the side `out` points to, or on either side */
/* beta 4.1: which drawn lines carry the length of each straight piece, and whether a cable leg already says that length there */
const dimRun = r => r && r.st === 'P' && (r.kind === 'trench' || r.kind === 'conduit' || r.kind === 'encase');
function legOnSeg(rg, a, b, s) { const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]); return rg.legs.some(l => l.f && l.plan >= 0.3 && f1(l.len) + 'm' === s && ((d(l.a, a) < 0.15 && d(l.b, b) < 0.15) || (d(l.a, b) < 0.15 && d(l.b, a) < 0.15))); }      /* the cable's own number serves there */
/* beta 4.2 (22:24): one length where a cable, a conduit and a trench lie together. The straight piece u-v of the run r is not given a length of its own when a
   cable whose length is written lies along it (over six tenths of it, within 0.3 m), and a piece of a trench also not when a proposed conduit lies along it. */
function lenDup(S, rg, r, u, v, t) {
  if (legOnSeg(rg, u, v, t)) return true; const L = Math.hypot(v[0] - u[0], v[1] - u[1]); if (L < 1e-6) return true;
  const ux = (v[0] - u[0]) / L, uy = (v[1] - u[1]) / L, al = p => (p[0] - u[0]) * ux + (p[1] - u[1]) * uy, of = p => Math.abs((p[1] - u[1]) * ux - (p[0] - u[0]) * uy);
  const cov = (a, b) => of(a) > 0.3 || of(b) > 0.3 ? 0 : Math.max(0, Math.min(L, Math.max(al(a), al(b))) - Math.max(0, Math.min(al(a), al(b))));
  let c = 0; for (const l of rg.legs) if (l.f && l.f !== 'ae' && !l.inside && l.plan >= 0.3) c += cov(l.a, l.b); if (c >= L * 0.6) return true;
  if (r && r.kind === 'trench') { let k = 0; for (const q of S.runs) if (q !== r && dimRun(q) && q.kind !== 'trench' && q.pts) for (let i = 0; i + 1 < q.pts.length; i++) k += cov(q.pts[i], q.pts[i + 1]); if (k >= L * 0.6) return true; }
  return false;
}
/* the key of the length of a cable piece: the leg's own key when the leg is one straight piece (as before), else with the number of the piece */
function lenKeys(legs) { const n = {}, j = {}, out = new Map(); for (const l of legs) if (l.f) n[l.f + l.i] = (n[l.f + l.i] || 0) + 1; for (const l of legs) if (l.f) { const k = l.f + l.i; j[k] = (j[k] || 0) + 1; out.set(l, 'len' + k + (n[k] > 1 ? '_' + (j[k] - 1) : '')); } return out; }
function besideSeg(p, q, out, gap, steps, ts) {
  const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, a = readable(Math.atan2(dy, dx) / D2R), nx = -dy / l, ny = dx / l, sides = out ? [nx * out[0] + ny * out[1] >= 0 ? 1 : -1] : [1, -1];
  const f = (w, h) => { const o = []; for (let j = 0; j < (steps || 3); j++) for (const t of ts || [0.5, 0.3, 0.7]) for (const s of sides) { const d = gap + h / 2 + j * h * 0.9; o.push({ p: [p[0] + dx * t + nx * s * d, p[1] + dy * t + ny * s * d], a }); } return o; };
  f.seg = [p, q]; f.gap = gap; f.ts = ts || null; return f;      /* (beta 4.2: the piece itself, for a length that has to move further out) */
}
/* places around a footprint seen from above: under it, over it, then at either end, text at angle a */
function topCands(P, a, gap) {
  const cs = Math.cos(a * D2R), sn = Math.sin(a * D2R); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const p of P) { const u = p[0] * cs + p[1] * sn, v = -p[0] * sn + p[1] * cs; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const at = (u, v) => ({ p: [u * cs - v * sn, u * sn + v * cs], a }), um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  return (w, h) => { const o = []; for (let j = 0; j < 4; j++) { const d = gap + j * h * 0.8; o.push(at(um, v0 - d - h / 2), at(um, v1 + d + h / 2), at(u1 + d + w / 2, vm), at(u0 - d - w / 2, vm)); if (!j) o.push(at(u1 + d + w / 2, v0 + h / 2), at(u0 - d - w / 2, v1 - h / 2), at(u1 + d + w / 2, v1 - h / 2), at(u0 - d - w / 2, v0 + h / 2)); } return o; };
}

/* places for a name written on the item itself, parallel to it: along its longer side first, in the middle, then towards the edges */
function inCands(el) {
  return (w, hh) => {
    const o = [], r = el.rot || 0, opts = [[r, el.w, el.d], [r + 90, el.d, el.w]].sort((p, q) => q[1] - p[1]);
    for (const [ang, W, D] of opts) {
      if (w > W - 0.08 || hh > D - 0.06) continue;
      const a = readable(ang), dx = Math.cos(a * D2R), dy = Math.sin(a * D2R), sw = (W - w) / 2 - 0.03, sd = (D - hh) / 2 - 0.02;
      for (const t of [0, -0.8, 0.8]) for (const s of [0, 0.8, -0.8]) o.push({ p: [el.x + dx * s * sw - dy * t * sd, el.y + dy * s * sw + dx * t * sd], a });
    }
    return o;
  };
}
/* The top view. o.labels: write the names. Every label has a key: an item's own id, or 'ae', 'ug', 'note', 'loop0'... for what belongs to the fibers.
   A label the user dragged (S.lab[key].p) is put first and stays; the others find their own place: on the item, along it, beside it, or on a short leader. */
/* beta 4.1: a photo set on the drawing, with an arrow from it to what it shows. c: the middle of the picture, tip: where the arrow points,
   w: its width, all in the units of the view. The picture itself is laid in by the screen, the PDF and the DXF from the list `pics`. */
function picOn(LB, ph, i, c, tip, w, th, pics) {
  const ar = ph.w > 0 && ph.h > 0 ? ph.w / ph.h : 4 / 3, h = w / ar, G = LB.G, box = [[c[0] - w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2], [c[0] - w / 2, c[1] + h / 2]];
  G.pl(box, 'ph', 1); { const tt = ph.title != null ? String(ph.title).trim() : 'PHOTO ' + (i + 1); if (tt) G.tx([c[0] - w / 2, c[1] + h / 2 + 0.4 * th], tt, th * 0.8, 'ph', 'l', 0, 1); }      /* beta 4.2: its title can be changed, or left blank */
  if (!inPoly(tip, box)) { const e = edgeOut(c, tip, box); LB.arrow(e, tip, th, 'ph'); LB.leads.push([tip, e]); LB.block(thick(tip, e, 0.5 * th)); }      /* (beta 4.2: no leader crosses the arrow of a picture) */
  LB.block(box); pics.push({ id: ph.id, n: i + 1, x: c[0] - w / 2, y: c[1] - h / 2, w, h, tip: [tip[0], tip[1]] });
}
const picW = (S, q) => num(q && q.w, 0) > 0 ? num(q.w, 0) : Math.max(S.site.L, S.site.W) * 0.3;
function buildTop(S, o) {
  o = o || {}; const G = new Gfx(), si = S.site, L = si.L, W = si.W, th = (o.th || clamp(Math.max(L, W) / 62, S.room ? 0.05 : 0.22, 1.5)) * txK(S);
  if (o.ctx) {                                            /* the inside of a cabin: what is outside it, light, and an arrow on the wall where a cable ladder or the cable arrives */
    for (const l of o.ctx.lines) G.pl([l.a, l.b], 'gh');
    for (const m of o.ctx.marks) { const k = wallOf(L, W, m.x, m.y), t = [-k.n[1], k.n[0]], q = 0.9 * th, tip = [m.x + k.n[0] * 0.13, m.y + k.n[1] * 0.13], bs = [tip[0] + k.n[0] * 1.7 * q, tip[1] + k.n[1] * 1.7 * q]; G.fl([tip, [bs[0] + t[0] * 0.75 * q, bs[1] + t[1] * 0.75 * q], [bs[0] - t[0] * 0.75 * q, bs[1] - t[1] * 0.75 * q]], 'gh'); }
  }
  if (o.inside && !S.room) for (const el of S.els) if (el.t === 'cabin' && el.inside && el.inside.site) {      /* the site: what is sketched inside each cabin, light */
    const I = el.inside, F = p => fromRoom(el, p);
    for (const q of I.els || []) if (q.t !== 'port' && q.t !== 'ac' && q.t !== 'rack' && q.t !== 'odf' && !rackHost(I, q)) G.pl(elPoly(q).map(F), 'gh', 1);      /* the porthole and the aircon units are drawn on the cabin itself */
    for (const r of I.runs || []) if (r.pts && r.pts.length > 1 && r.kind !== 'part') { const hw = Math.max(0.05, num(r.w, (RUNS[r.kind] || RUNS.ladder).w)) / 2; if (r.kind === 'ladder') { const ST = ladPath(r); for (const sg of [-1, 1]) G.pl(ST.map(q => F([q.p[0] + q.n[0] * q.k * hw * sg, q.p[1] + q.n[1] * q.k * hw * sg])), 'gh'); } else for (const sg of [-1, 1]) G.pl(offsetPath(r.pts, hw * sg).map(F), 'gh'); }
  }
  const lab = !!o.labels, LB = new Labeler(G), jobs = [], h = th * 0.9, gap = 0.3 * th, tl = s => s === 'P' ? 'tp' : 'tx';
  const R = [[0, 0], [L, 0], [L, W], [0, W]], ring = (c, r, n) => { const q = []; for (let i = 0; i < n; i++) q.push([c[0] + r * Math.cos(i * 2 * Math.PI / n), c[1] + r * Math.sin(i * 2 * Math.PI / n)]); return q; };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], angOf = (a, b) => readable(Math.atan2(b[1] - a[1], b[0] - a[0]) / D2R);
  let swing = { S: 0, N: 0, E: 0, W: 0 };
  const BN = blockNames(S), gq = ++GSEQ, gk = k => (k || 'ITEM') + '|' + gq; G.grp = gk('SITE');      /* (19:25) the lot, the fence and the gates: one block */
  if (si.kind === 'unfenced') G.pl(R, 'lot', 1);
  else if (si.kind === 'rooftop') { G.pl(R, 'bl', 1); const t = 0.2; G.pl([[t, t], [L - t, t], [L - t, W - t], [t, W - t]], 'bl', 1); }
  else if (si.kind === 'room') {                         /* the walls of a cabin: the sketch is the inside of the room, the wall thickness lies outside it. The door swings in. */
    const t = 0.1; swing = { S: t, N: t, E: t, W: t };
    for (const sd of 'SENW') {
      const { g, spans, gates } = sideSpans(S, sd), pt = (q, off) => [g.a[0] + g.u[0] * q + g.n[0] * (off || 0), g.a[1] + g.u[1] * q + g.n[1] * (off || 0)];
      for (const [s0, s1] of spans) { G.pl([pt(s0), pt(s1)], 'bl'); G.pl([pt(s0 < 1e-6 ? -t : s0, t), pt(s1 > g.len - 1e-6 ? g.len + t : s1, t)], 'bl'); if (s0 > 1e-6) G.pl([pt(s0), pt(s0, t)], 'bl'); if (s1 < g.len - 1e-6) G.pl([pt(s1), pt(s1, t)], 'bl'); }
      gates.forEach(([g0, g1], gi) => {
        const w = g1 - g0, key = 'gate' + sd + gi, c = pt(g0), au = Math.atan2(g.u[1], g.u[0]) / D2R, an = Math.atan2(-g.n[1], -g.n[0]) / D2R, dd = ((an - au) % 360 + 360) % 360, tip = [c[0] - g.n[0] * w, c[1] - g.n[1] * w];
        if (dd <= 180) G.ar(c, w, au, au + dd, 'dt'); else G.ar(c, w, an, an + 360 - dd, 'dt'); G.pl([c, tip], 'bl');
        LB.block([pt(g0), pt(g1), pt(g1, -w), pt(g0, -w)]);
        jobs.push({ o: 6, key, opt: 1, lines: [labText(S, key, 'DOOR')], lay: 'tx', ap: pt((g0 + g1) / 2), a: angOf(pt(g0), pt(g1)), cands: besideSeg(pt(g0, t), pt(g1, t), g.n, gap, 2), st: 'E' });
      });
    }
  }
  else for (const sd of 'SENW') {
    const { g, spans, gates } = sideSpans(S, sd), pt = (t, off) => [g.a[0] + g.u[0] * t + g.n[0] * (off || 0), g.a[1] + g.u[1] * t + g.n[1] * (off || 0)], sp = Math.max(1, num(si.post, 3));
    for (const [s0, s1] of spans) {
      G.pl([pt(s0), pt(s1)], 'bl');
      const ps = [s0, s1]; for (let t = Math.ceil(s0 / sp + 1e-6) * sp; t < s1 - 1e-6; t += sp) ps.push(t);
      for (const t of ps) { if (si.fence === 'chb') G.pl(sqr(pt(t), 0.14, 0), 'bl', 1); else G.ci(pt(t), 0.09, 'bl'); }
    }
    gates.forEach(([g0, g1], gi) => {
      const w = g1 - g0, two = w > 1.6, r = two ? w / 2 : w, key = 'gate' + sd + gi; swing[sd] = Math.max(swing[sd], r);
      const hinge = (t, dir) => { const c = pt(t), au = Math.atan2(g.u[1] * dir, g.u[0] * dir) / D2R, an = Math.atan2(g.n[1], g.n[0]) / D2R, d = ((an - au) % 360 + 360) % 360; if (d <= 180) G.ar(c, r, au, au + d, 'bl'); else G.ar(c, r, an, an + 360 - d, 'bl'); G.pl([c, [c[0] + g.n[0] * r, c[1] + g.n[1] * r]], 'bl'); };
      hinge(g0, 1); if (two) hinge(g1, -1);
      LB.block([pt(g0), pt(g1), pt(g1, r), pt(g0, r)]);
      if (nameOn(S, 'gate')) jobs.push({ o: 2, key, lines: [labText(S, key, w > 1.6 ? 'GATE' : 'DOOR')], lay: 'tx', ap: pt((g0 + g1) / 2), a: angOf(pt(g0), pt(g1)), cands: besideSeg(pt(g0, r), pt(g1, r), g.n, gap, 3), st: 'E' });
    });
  }
  G.grp = null;
  for (let i = 0; i < 4; i++) LB.block(thick(R[i], R[(i + 1) % 4], si.kind === 'fenced' ? 0.5 : 0.25));
  const rg = routeGeom(S);
  for (const el of S.els) if (el.t === 'pad') { G.grp = gk(BN[el.id]); topEl(S, el, G, rg); }
  for (const el of S.els) if (el.t !== 'pad') { G.grp = gk(BN[el.id]); topEl(S, el, G, rg); }
  G.grp = null;
  for (const el of S.els) {
    const T = TYPES[el.t], c = [el.x, el.y], P = elPoly(el), key = el.id, host = el.t === 'odf' ? hostOf(S, c, el) : el.t === 'runit' ? rackHost(S, el) : null, tri = r => [90, 210, 330].map(a => loc(el, r * Math.cos(a * D2R), r * Math.sin(a * D2R)));
    const cm = el.t === 'clo' ? cloMount(S, rg, el) : null, ang = T.rd || T.g === 'tower' ? 0 : readable(el.rot || 0);
    let fp = P, ins = null;
    if (el.t === 'pad' || el.t === 'hh') { for (let i = 0; i < P.length; i++) LB.block(thick(P[i], P[(i + 1) % P.length], 0.14), 0, key); if (el.t === 'hh') LB.block(P, 0, key + '#'); }
    else if (el.t === 'palm') { fp = ring(c, 3.3, 14); LB.block(fp, 1, key); }
    else if (el.t === 'guy') { LB.block(sqr(c, Math.max(el.w, 0.5), 0), 0, key); for (const q of tri(Math.max(1, num(el.ar, 8)))) { LB.block(sqr(q, 0.45, 0), 0, key); LB.block(thick(c, q, 0.2), 0, key); } fp = sqr(c, Math.max(el.w, 0.5), 0); }
    else if (el.t === 't3' || el.t === 't4') { const g2 = clamp(el.w / 9, 0.3, 0.5) + 0.1; fp = hull([].concat.apply([], P.map(q => sqr(q, g2, 0)))); LB.block(fp, 1, key); }
    else if (el.t === 'rtp') { fp = ring(c, 1.55, 10); LB.block(fp, 1, key); }
    else if (el.t === 'mono' || el.t === 'tad' || el.t === 'ezm' || el.t === 'epole' || el.t === 'rpole') { fp = sqr(c, Math.max(el.w / 2 + 0.3, 0.42), 0); LB.block(fp, 1, key); }
    else if (el.t === 'exit') { fp = sqr(c, 0.25, 0); LB.block(fp, 1, key); }
    else if (cm) { fp = sqr(cm.c, 0.4, 0); LB.block(fp, 1, key); }
    else if (host) { LB.block(P, 0, key); fp = elPoly(host); }
    else LB.block(P, 1, key);
    if (['pad', 'cabin', 'odc', 'gen', 'tank', 'box', 'cow', 'rack'].indexOf(el.t) >= 0) ins = inCands(el);
    if (el.t === 'cabin' && nameOn(S, 'port')) cabinPorts(el).forEach((q, i) => { const k2 = 'port' + el.id + '_' + i, hz = q.face === 'F' || q.face === 'B', pp = rectAt(q.at, hz ? 0.5 : 0.22, hz ? 0.22 : 0.5, el.rot); jobs.push({ o: 5, key: k2, opt: 1, lines: [labText(S, k2, 'PORTHOLE')], lay: tl(q.st), ap: q.at, a: 0, cands: topCands(pp, 0, gap), st: q.st }); });
    const s = elLabel(S, el), grp = nameGrp(el), tt = titleTower(S) === el;
    if (tt) { const b = polyBox(fp), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; jobs.push({ o: 0, key: 'tid', bold: 1, hk: 1, lines: titleLines(S), lay: 'tx', ap: [cx, b[3]], a: 0, cands: (w, hh) => { const o = []; for (let j = 0; j < 4; j++) { const d = gap + j * hh * 0.6; o.push({ p: [cx, b[3] + d + hh / 2], a: 0 }, { p: [b[2] + d + w / 2, b[3] - hh / 2], a: 0 }, { p: [b[0] - d - w / 2, b[3] - hh / 2], a: 0 }, { p: [b[2] + d + w / 2, cy], a: 0 }, { p: [b[0] - d - w / 2, cy], a: 0 }, { p: [cx, b[1] - d - hh / 2], a: 0 }); } return o; }, st: 'E' }); }      /* the site name and ID: above the tower first, then beside it */
    if ((!grp || nameOn(S, grp)) && !(tt && !el.name && !nameOn(S, 'th'))) jobs.push({ o: 1, key, own: key, call: host ? 1 : 0, opt: el.t === 'runit' && host ? 1 : 0, area: polyBoxArea(fp), fp, lines: s.length > 18 ? wrap(s, 16) : [s], lay: tl(el.st), ap: cm ? cm.c : c, a: ang, ins, cands: topCands(fp, ang, gap), st: el.st });
  }
  if (!S.room) for (const el of S.els) if (el.t === 'cabin') {             /* inside a cabin: its racks and the ODF, dashed, and the cable from the porthole to the ODF */
    const C = cabinInside(S, el); if (!C) continue; const cp = elPoly(el);
    for (const q of C.walls) for (const sd of q.sides) G.pl(sd, 'nd');      /* partition walls */
    for (const r of C.racks) { const lay = r.st === 'P' ? 'np' : 'nd'; G.pl(r.poly, lay, 1); G.pl(r.front, lay); }
    for (const q of C.odfs) { const lay = q.st === 'P' ? 'np' : 'nd'; G.pl(q.poly, lay, 1); G.pl([q.poly[0], q.poly[2]], lay); G.pl([q.poly[1], q.poly[3]], lay); jobs.push({ o: 1, key: q.key, call: 1, lines: [labText(S, q.key, q.s)], lay: tl(q.st), ap: mid(q.poly[0], q.poly[2]), a: 0, cands: topCands(cp, 0, gap), st: q.st }); }
    for (const l of C.legs) if (Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) > 0.02) G.pl([[l.a[0], l.a[1]], [l.b[0], l.b[1]]], 'fh');
  }
  for (const k of ownConduit(rg)) { const lay = k.st === 'E' ? (k.open ? 'ex' : 'hd') : k.open ? 'pp' : 'hp'; for (const Q of outsidePits(S, [k.l.a, k.l.b])) for (const sg of [-1, 1]) G.pl(offsetPath(Q, 0.07 * sg), lay); }      /* the conduit the app takes under a buried piece of cable: its two edges round the cable. It ends at the wall of a hand hole or service box. */
  for (const r of S.runs) {
    G.grp = null; const K = RUNS[r.kind] || RUNS.ladder, lay = runLayer(r), P = r.pts; if (!P || P.length < 2) continue; G.grp = gk(BN[r.id]);
    const wd = Math.max(r.kind === 'conduit' ? 0.14 : 0.1, num(r.w, K.w)), A1 = offsetPath(P, wd / 2), A2 = offsetPath(P, -wd / 2); let best = 0, bi = 0;
    if (r.kind === 'ladder') {                           /* rails and rungs follow the bends */
      const ST = ladPath(r), Wk = ladWalk(ST, wd / 2), nr = Math.max(1, Math.round(Wk.tot / 0.5));
      for (const sg of [-1, 1]) G.pl(ST.map(q => [q.p[0] + q.n[0] * q.k * wd / 2 * sg, q.p[1] + q.n[1] * q.k * wd / 2 * sg]), lay);
      for (let k = 0; k <= nr; k++) { const q = Wk.at(k * Wk.tot / nr); G.pl([[q.p[0] + q.v[0], q.p[1] + q.v[1]], [q.p[0] - q.v[0], q.p[1] - q.v[1]]], lay); }
    }
    else if (r.kind === 'trench' || r.kind === 'conduit' || r.kind === 'encase') for (const Q of outsidePits(S, P)) {      /* not inside a hand hole or service box: it stops at the wall */
      const B1 = offsetPath(Q, wd / 2), B2 = offsetPath(Q, -wd / 2); G.pl(B1, lay); G.pl(B2, lay);
      if (r.kind !== 'trench') { G.pl([B1[0], B2[0]], lay); G.pl([B1[B1.length - 1], B2[B2.length - 1]], lay); }
    }
    else { G.pl(A1, lay); G.pl(A2, lay); if (r.kind === 'part') { G.pl([A1[0], A2[0]], lay); G.pl([A1[A1.length - 1], A2[A2.length - 1]], lay); } }
    if (r.kind === 'encase') G.pl(P, 'dt');
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.05) continue; if (len > best) { best = len; bi = i; }
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = -uy * wd / 2, ny = ux * wd / 2; LB.block(thick(a, b, wd + 0.12), 0, r.id);
      if (r.kind === 'trench' && !flatOn(S)) { const pits = S.els.filter(e => e.t === 'hh' || e.t === 'sbox').map(elPoly); sandDots([a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], q => { if (!pits.some(k => inPoly(q, k))) G.ci(q, SAND_R, 'dt'); }); }
    }
    if (lab && dimRun(r) && nameOn(S, 'dim')) for (let i = 0; i + 1 < P.length; i++) { const u = P[i], v = P[i + 1], len = Math.hypot(v[0] - u[0], v[1] - u[1]), t = f1(len) + 'm'; if (len < 0.3 || lenDup(S, rg, r, u, v, t)) continue;
      jobs.push({ o: 5, key: 'lenr' + r.id + '_' + i, opt: len < 1 ? 1 : 0, lines: [t], lay: 'ln', ap: mid(u, v), a: angOf(u, v), cands: besideSeg(u, v, null, wd / 2 + gap * 0.6, 2), st: 'P' }); }
    const a = P[bi], b = P[bi + 1], s = runName(S, r);
    if (s && (r.kind !== 'ladder' || nameOn(S, 'ladder'))) jobs.push({ o: 3, key: r.id, lines: s.length > 26 ? wrap(s, 24) : [s], lay: tl(r.st), ap: mid(a, b), a: angOf(a, b), cands: besideSeg(a, b, null, wd / 2 + gap, 4), st: r.st });
  }
  G.grp = null;
  /* the two fibers */
  const grp = {}, long = {};
  for (const l of rg.legs) {
    G.grp = gk(l.f === 'ae' ? 'FOC_AE' : 'FOC_UG'); G.pl([l.a, l.b], l.inside ? 'fh' : LEG[l.type].lay); G.grp = null; LB.block(thick(l.a, l.b, 0.6 * th));
    const k = l.f + l.i, q = grp[k] || (grp[k] = { len: 0, best: l }); q.len += l.len; if (l.plan > q.best.plan) q.best = l;
    if (!long[l.f] || l.plan > long[l.f].plan) long[l.f] = l;
  }
  if (lab && nameOn(S, 'dim')) { const LK = lenKeys(rg.legs); for (const l of rg.legs) { if (!l.f || l.f === 'ae' || l.inside || l.plan < 0.3) continue;      /* beta 4.1: the length of each straight piece of a cable (beta 4.2: not on the aerial cable) */
    jobs.push({ o: 5, key: LK.get(l), opt: l.len >= 1 && l.plan >= 1 ? 0 : 1, lines: [f1(l.len) + 'm'], lay: 'ln', ap: mid(l.a, l.b), a: angOf(l.a, l.b), cands: besideSeg(l.a, l.b, null, gap, 2), st: 'P' }); } }
  else if (lab) for (const k in grp) { const q = grp[k], s = f1(q.len) + 'm', l = q.best; if (l.f !== 'ae' && l.plan > textW(s, h) * 0.9) jobs.push({ o: 5, key: 'len' + k, opt: 1, lines: [s], lay: 'ln', ap: mid(l.a, l.b), a: angOf(l.a, l.b), cands: besideSeg(l.a, l.b, null, gap, 2), st: 'P' }); }
  for (const f of ['ae', 'ug']) { const l = long[f]; if (l) jobs.push({ o: 6, key: f, lines: [labText(S, f, o.short ? 'FOC ' + f.toUpperCase() : focName(S, rg, f))], lay: 'tp', ap: [l.a[0] + (l.b[0] - l.a[0]) * 0.35, l.a[1] + (l.b[1] - l.a[1]) * 0.35], a: angOf(l.a, l.b), cands: besideSeg(l.a, l.b, null, gap, 3, [0.35, 0.65, 0.5]), st: 'P' }); }
  const l0 = rg.legs.find(l => l.f === 'ae' && l.i === 0);
  if (l0) {                                             /* the AE cable carries on outside: an arrow at its first point, and the note that says where to */
    const dl = l0.plan || 1, u = [(l0.a[0] - l0.b[0]) / dl, (l0.a[1] - l0.b[1]) / dl], s = 1.3 * th, note = labText(S, 'note', String(S.route.note || '').trim().toUpperCase());
    G.fl([[l0.a[0] + u[0] * s, l0.a[1] + u[1] * s], [l0.a[0] - u[1] * s * 0.36, l0.a[1] + u[0] * s * 0.36], [l0.a[0] + u[1] * s * 0.36, l0.a[1] - u[0] * s * 0.36]], 'pp'); LB.block(thick(l0.a, [l0.a[0] + u[0] * s, l0.a[1] + u[1] * s], s));
    if (note) jobs.push({ o: 5, key: 'note', lines: wrap(note, 30), lay: 'tp', ap: [l0.a[0] - u[0] * dl * 0.25, l0.a[1] - u[1] * dl * 0.25], a: angOf(l0.a, l0.b), cands: besideSeg(l0.a, l0.b, null, gap, 3, [0.25, 0.4, 0.55]), st: 'P' });
  }
  rg.exits.forEach((x, i) => {
    if (x.el) return; const lay = x.st === 'P' ? 'pp' : 'ex', key = 'exit' + i, fp = sqr(x.at, 0.25, 0), hc = [x.at[0] + x.u[0] * 0.025, x.at[1] + x.u[1] * 0.025]; G.pl(rectAt(hc, STD.exitW, STD.exitW, Math.atan2(x.u[1], x.u[0]) / D2R), lay, 1); G.ci(hc, STD.sleeve / 2, lay); for (const k of [0, 1]) G.ci([x.at[0] + x.u[0] * k * 0.05, x.at[1] + x.u[1] * k * 0.05], 0.025, lay); LB.block(fp, 1, key);
    jobs.push({ o: 4, key, lines: [labText(S, key, x.st === 'P' ? 'PROPOSED RISER PIPE' : 'EXIT CONDUIT')], lay: tl(x.st), ap: x.at, a: 0, cands: topCands(fp, 0, gap), st: x.st });
  });
  if (rg.join && rg.join.auto) { const j = rg.join, fp = sqr(j.c, 0.3, 0); G.ci(j.c, STD.cloR * 1.12, 'pp'); G.ci(j.c, STD.cloR * 0.5, 'pp'); LB.block(fp, 1, 'clo'); jobs.push({ o: 4, key: 'clo', lines: [labText(S, 'clo', 'PROPOSED CLOSURE')], lay: 'tp', ap: j.c, a: 0, cands: topCands(fp, 0, gap), st: 'P' }); }
  G.grp = gk('FOC_UG');
  for (const v of rg.verts) if (v.kind !== 'exit' && !v.hop && !v.inside) G.ci(v.at, S.room ? 0.05 : v.kind === 'riser' ? GIR : 0.2, 'pp');
  if (!S.room) for (const id in rg.ports) { const g = rg.ports[id].p, r = 0.055, k = r * 0.7; G.ci([g[0], g[1]], r, 'pp'); G.pl([[g[0] - k, g[1] - k], [g[0] + k, g[1] + k]], 'pp'); G.pl([[g[0] - k, g[1] + k], [g[0] + k, g[1] - k]], 'pp'); }      /* (19:25) where the cable goes into the cabinet */
  G.grp = null;      /* a riser: the pipe on the pole */
  for (const lp of rg.loops) {
    const c = [lp.at[0] + 0.55, lp.at[1] + 0.55], key = 'loop' + lp.i; G.ci(c, 0.4, 'pp'); G.ci(c, 0.24, 'pp'); LB.block(sqr(c, 0.45, 0), 1, key);
    jobs.push({ o: 4, key, lines: [labText(S, key, 'LOOP HOLDER W/ ' + f2(lp.len) + 'm LOOP')], lay: 'tp', ap: c, a: 0, cands: (w, hh) => [{ p: [c[0] + 0.6 + w / 2, c[1]], a: 0 }, { p: [c[0], c[1] + 0.6 + hh / 2], a: 0 }, { p: [c[0] - 0.6 - w / 2, c[1]], a: 0 }, { p: [c[0], c[1] - 0.6 - hh / 2], a: 0 }, { p: [c[0] + 0.6 + w / 2, c[1] + hh], a: 0 }, { p: [c[0] + 0.6 + w / 2, c[1] - hh], a: 0 }], st: 'P' });
  }
  if (o.dims) {
    const dS = swing.S + 2.2 * th, dW = swing.W + 2.2 * th, tk = 0.4 * th;
    G.pl([[0, -dS], [L, -dS]], 'dm'); G.pl([[0, -0.4 * th], [0, -dS - tk]], 'dm'); G.pl([[L, -0.4 * th], [L, -dS - tk]], 'dm');
    G.pl([[-tk, -dS - tk], [tk, -dS + tk]], 'dm'); G.pl([[L - tk, -dS - tk], [L + tk, -dS + tk]], 'dm'); G.tx([L / 2, -dS + 0.45 * th], f1(L) + ' m', th, 'dm', 'c');
    G.pl([[-dW, 0], [-dW, W]], 'dm'); G.pl([[-0.4 * th, 0], [-dW - tk, 0]], 'dm'); G.pl([[-0.4 * th, W], [-dW - tk, W]], 'dm');
    G.pl([[-dW - tk, -tk], [-dW + tk, tk]], 'dm'); G.pl([[-dW - tk, W - tk], [-dW + tk, W + tk]], 'dm'); G.tx([-dW - 0.45 * th, W / 2], f1(W) + ' m', th, 'dm', 'c', 90);
    LB.block(thick([-tk, -dS + 0.6 * th], [L + tk, -dS + 0.6 * th], 2.4 * th)); LB.block(thick([-dW - 0.6 * th, -tk], [-dW - 0.6 * th, W + tk], 2.4 * th));
    LB.block(thick([0, 0], [0, -dS - tk], 0.2)); LB.block(thick([L, 0], [L, -dS - tk], 0.2)); LB.block(thick([0, 0], [-dW - tk, 0], 0.2)); LB.block(thick([0, W], [-dW - tk, W], 0.2));
  }
  if (o.north && !S.room) { const b = [L + 3 * th + swing.E, W - 1.5 * th], n = [-Math.sin(num(si.bearing, 0) * D2R), Math.cos(num(si.bearing, 0) * D2R)]; northArrow(G, b, n, th); LB.block(obb([b[0] + n[0] * 2.2 * th, b[1] + n[1] * 2.2 * th], 5 * th, 5 * th, 0)); }
  if (o.photos) S.photos.forEach((ph, i) => {
    if (!ph.placed || ph.pin === false) return; const c = [ph.x, ph.y], r = 0.95 * th;      /* (beta 4.2: its number on the plan can be hidden) */ G.ci(c, r, 'ph'); G.tx([c[0], c[1] - 0.36 * th], String(i + 1), th * 0.75, 'ph', 'c', 0, 1);
    for (const s of [-22, 22]) { const a = (num(ph.dir, 0) + s) * D2R; G.pl([[c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r], [c[0] + Math.sin(a) * 3 * r, c[1] + Math.cos(a) * 3 * r]], 'ph'); }
    const d = num(ph.dir, 0) * D2R; LB.block(sqr(c, r, 0)); LB.block(thick(c, [c[0] + Math.sin(d) * 3 * r, c[1] + Math.cos(d) * 3 * r], 2.4 * r));
  });
  const pics = []; if (o.photos && o.pics !== false) S.photos.forEach((ph, i) => { const q = ph.ct; if (!q || !isFinite(q.x) || !isFinite(q.y)) return; picOn(LB, ph, i, [num(q.x, 0), num(q.y, 0)], [num(q.tx, 0), num(q.ty, 0)], picW(S, q), th, pics); });      /* beta 4.1 */
  let far = 0, skipped = 0;
  if (lab) {
    const F = [], late = [], ctr = [L / 2, W / 2]; let lostLen = 0; LB.fit(primBox(G.p), o.box); if (!o.tiny && !S.room) LB.ink(G.p, h);
    for (const jb of jobs) { const off = labOff(S, jb.key, 'p'); if (off) { LB.fixed(jb.key, jb.lines, h * (jb.hk ? TITLE_K[0] : 1), jb.lay, [jb.ap[0] + off[0], jb.ap[1] + off[1]], jb.a || 0, jb.ap, jb.bold ? { bold: 1 } : null); jb.done = 1; } }
    for (let i = jobs.length - 1; i >= 0; i--) if ((labRec(S, jobs[i].key) || {}).off) jobs.splice(i, 1);      /* beta 4.1: a name the user hid */
    jobs.sort((p, q) => p.o - q.o || (p.area || 0) - (q.area || 0));
    /* A name goes on its item or beside it. When the size is automatic and there is no room, it is tried again smaller, down to what is still easy to read. Only then does it get a leader. */
    const HS = txAuto(S) ? TXS.map(k => h * k) : [h];
    /* beta 4.2: the rules for the names. A length and the note of the aerial cable always lie along their line. The name of a proposed run or of a fiber stands
       level with a leader and an arrowhead. The name of an existing item is on its body, or level with a leader. (o.tiny, a phone-size drawing, keeps the old rules: there a name with a leader is often left out.) */
    const isLine = k => k === 'ae' || k === 'ug' || S.runs.some(r => r.id === k), isLen = jb => jb.lay === 'ln' || jb.key === 'note';
    const arrowOnly = jb => !o.tiny && !S.room && !isLen(jb) && jb.key !== 'tid' && !jb.hk && ((jb.st === 'P' && isLine(jb.key)) || (jb.st === 'E' && !!jb.ins));
    for (const jb of jobs) {
      if (jb.done) continue; let put = false; if (arrowOnly(jb)) jb.arrow = 1;
      for (const hh of jb.hk ? (txAuto(S) ? TITLE_K : TITLE_K.slice(0, 1)).map(k => h * k) : HS) { if ((jb.ins && LB.place(jb.lines, hh, jb.lay, jb.ins, false, jb.key, jb.ap, jb.own)) || (!jb.call && !jb.arrow && jb.cands && LB.place(jb.lines, hh, jb.lay, jb.cands, !!jb.bold, jb.key, jb.ap))) { put = true; break; } }
      if (!put && !jb.opt && isLen(jb) && jb.cands && jb.cands.seg && !o.tiny) { for (const hh of HS) if (LB.along(jb.lines, hh, jb.lay, jb.cands.seg[0], jb.cands.seg[1], jb.key, jb.ap, { gap: jb.cands.gap })) { put = true; break; } if (!put && LB.along(jb.lines, HS[HS.length - 1], jb.lay, jb.cands.seg[0], jb.cands.seg[1], jb.key, jb.ap, { gap: jb.cands.gap, wide: 1 })) put = true; }      /* (19:25: further away before it is written beside its piece all the same) */      /* (beta 4.2: to the nearest clear place, still parallel; where there is none it is left out until the user zooms in, never written over other lines) */
      if (!put && !jb.opt && isLen(jb) && jb.cands) { const hh = HS[HS.length - 1], z = txSize(jb.lines, hh), c = jb.cands(z.w, z.hg)[0]; if (c) { LB.fixed(jb.key, jb.lines, hh, jb.lay, c.p, c.a, jb.ap); put = true; } }      /* no free place along its line: it is written there all the same, at the smallest size */
      if (!put && !jb.opt) late.push(jb);
    }
    /* what found no room on or beside its item gets a short leader to the nearest free place */
    /* o.short: a small screen. There a name that finds no room close to its item is left out until the user zooms in. */
    /* Before a leader: level text right beside the item, even where it crosses a line of the drawing. The lines under it are taken away so the name reads clearly. It keeps clear of other names and of the fibers. */
    const fibT = []; for (const q of G.p) if (q.k === 'pl' && (q.lay === 'ug' || q.lay === 'ae')) for (let i = 0; i + 1 < q.pts.length; i++) fibT.push(thick(q.pts[i], q.pts[i + 1], 0.3 * h));
    const wipe = [], late2 = [];
    for (const jb of late) { if (jb.arrow || (jb.lines.length === 1 && jb.lines[0].length > LONGNAME)) { late2.push(jb); continue; } let bx = null; if (jb.cands && o.tiny) for (const hh of HS) { bx = LB.placeLoose(jb.lines, hh, jb.lay, jb.cands, !!jb.bold, jb.key, jb.ap, fibT); if (bx) break; } if (bx) wipe.push(bx); else late2.push(jb); }
    if (wipe.length) { const keepL = { ug: 1, ae: 1, fh: 1, tx: 1, tp: 1 }, ex = [], rest = []; for (const q of G.p) { if (q.k === 'pl' && !keepL[q.lay] && wipe.some(w => { const b = polyBox(w), c = polyBox(q.pts); return !(c[2] < b[0] || c[0] > b[2] || c[3] < b[1] || c[1] > b[3]); })) { for (let i = 0; i + 1 < q.pts.length; i++) ex.push({ k: 'pl', pts: [q.pts[i], q.pts[i + 1]], lay: q.lay, close: false, g: q.g }); if (q.close && q.pts.length > 2) ex.push({ k: 'pl', pts: [q.pts[q.pts.length - 1], q.pts[0]], lay: q.lay, close: false, g: q.g }); } else rest.push(q); } G.p = rest.concat(clipOut(ex, wipe)); }
    const left = LB.callouts(late2.map(jb => ({ key: jb.key, p: jb.ap, alt: jb.arrow && jb.cands && jb.cands.seg ? [0.5, 0.25, 0.75].map(t => [jb.cands.seg[0][0] + (jb.cands.seg[1][0] - jb.cands.seg[0][0]) * t, jb.cands.seg[0][1] + (jb.cands.seg[1][1] - jb.cands.seg[0][1]) * t]) : jb.fp && jb.fp.length > 2 ? jb.fp.map((q, i) => { const n = jb.fp[(i + 1) % jb.fp.length]; return [jb.ap[0] + ((q[0] + n[0]) / 2 - jb.ap[0]) * 0.72, jb.ap[1] + ((q[1] + n[1]) / 2 - jb.ap[1]) * 0.72]; }).concat(jb.fp.slice(0, 1).map(q => [jb.ap[0] + (q[0] - jb.ap[0]) * 0.7, jb.ap[1] + (q[1] - jb.ap[1]) * 0.7])) : null, s: jb.lines.join(' '), lines: jb.lines.length === 1 && jb.lines[0].length > LONGNAME ? null : jb.lines, st: jb.st, lay: jb.lay, w: jb.lines.join(' ').length > LONGNAME ? 30 : 16 })), h, { ctr, max: o.tiny ? 4 : 0, hs: HS, lastX: !!o.tiny, quick: !!o.quick });
    for (const a of left) F.push({ p: a.p, s: a.s, st: a.st });      /* (beta 4.2, 19:25: on a screen too every name shows: what found no place goes to the edge of the drawing) */      /* (beta 4.2: notes at the edge on a sheet only; on a screen the name waits until the user zooms in) */
    skipped += lostLen;
    far = F.length; if (far) { const lost = addCallouts(G, F, primBox(G.p), th, LB); far -= lost; skipped += lost; }
  }
  return { prims: G.p, th, G, far, labs: LB.out, leads: LB.leads, skipped, pics };
}
function northArrow(G, base, n, th) {
  const len = 3.2 * th, d = Math.hypot(n[0], n[1]) || 1, ux = n[0] / d, uy = n[1] / d, tip = [base[0] + ux * len, base[1] + uy * len], s = 0.9 * th;
  G.pl([base, tip], 'tx'); G.fl([tip, [tip[0] - ux * s - uy * s * 0.38, tip[1] - uy * s + ux * s * 0.38], [tip[0] - ux * s + uy * s * 0.38, tip[1] - uy * s - ux * s * 0.38]], 'tx');
  G.tx([tip[0] + ux * 0.9 * th, tip[1] + uy * 0.9 * th - 0.45 * th], 'N', th, 'tx', 'c', 0, 1);
}

/* ---------- drawn runs: outlines, what the fiber follows, what counts as new trench ---------- */
function offsetPath(P, d) {
  const n = P.length, out = [], un = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[Math.min(n - 1, i + 1)], u1 = un(b[0] - a[0], b[1] - a[1]), u2 = un(c[0] - b[0], c[1] - b[1]); let nx, ny;
    if (i === 0) { nx = -u2[1]; ny = u2[0]; } else if (i === n - 1) { nx = -u1[1]; ny = u1[0]; }
    else { const mx = -u1[1] - u2[1], my = u1[0] + u2[0], ml = Math.hypot(mx, my); if (ml < 1e-6) { nx = -u1[1]; ny = u1[0]; } else { const k = 1 / Math.max(0.3, (mx * -u1[1] + my * u1[0]) / ml); nx = mx / ml * k; ny = my / ml * k; } }
    out.push([b[0] + nx * d, b[1] + ny * d]);
  }
  return out;
}
/* how far along segment p-q the piece a-b runs, if it lies on it */
function alongSeg(p, q, a, b) {
  const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); if (l < 0.05) return null;
  const off = t => Math.abs((t[0] - p[0]) * dy - (t[1] - p[1]) * dx) / l, at = t => ((t[0] - p[0]) * dx + (t[1] - p[1]) * dy) / l;
  if (off(a) > 0.15 || off(b) > 0.15) return null;
  const t0 = Math.max(0, Math.min(at(a), at(b))), t1 = Math.min(l, Math.max(at(a), at(b))); return t1 > t0 ? [t0, t1, l] : null;
}
function runUnder(S, a, b) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.3) return null;
  for (const r of S.runs) if (r.kind !== 'part') for (let i = 0; i + 1 < r.pts.length; i++) { const v = alongSeg(r.pts[i], r.pts[i + 1], a, b); if (v && v[1] - v[0] >= 0.6 * L) return r; }
  return null;
}
/* proposed conduit, encasement or trench drawn where no new-conduit fiber leg already counts it */
function extraTrench(S, rg) {
  let sum = 0;
  for (const r of S.runs) {
    if (r.st !== 'P' || r.kind === 'ladder' || r.kind === 'part') continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const p = r.pts[i], q = r.pts[i + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]), iv = []; if (l < 0.05) continue;
      for (const g of rg.legs) if (g.type === 'ug') { const v = alongSeg(p, q, g.a, g.b); if (v) iv.push(v); }
      iv.sort((a, b) => a[0] - b[0]); let cov = 0, e = 0; for (const v of iv) if (v[1] > e) { cov += v[1] - Math.max(v[0], e); e = v[1]; }
      sum += l - cov;
    }
  }
  return sum;
}

/* ---------- freehand strokes: simplify, square up to the sketch axes, snap ---------- */
function rdpIdx(P, eps) {
  const keep = new Array(P.length).fill(0), st = [[0, P.length - 1]], out = []; keep[0] = keep[P.length - 1] = 1;
  while (st.length) { const ab = st.pop(), a = ab[0], b = ab[1]; let m = -1, md = eps; for (let i = a + 1; i < b; i++) { const d = distSeg(P[i], P[a], P[b]); if (d > md) { md = d; m = i; } } if (m > 0) { keep[m] = 1; st.push([a, m], [m, b]); } }
  for (let i = 0; i < P.length; i++) if (keep[i]) out.push(i);
  return out;
}
/* points and straight runs a new stroke may snap to */
function strokeHelpers(S, skip) {
  const pts = [], guides = [];
  for (const e of S.els) { if (['rpole', 'epole', 'odf', 'odc', 'hh', 'clo', 'sbox', 'enc', 'exit', 'port'].indexOf(e.t) >= 0) pts.push([e.x, e.y]); if (e.t === 'cabin' && !S.room) for (const q of cabinPorts(e)) pts.push([Math.round(q.at[0] * 100) / 100, Math.round(q.at[1] * 100) / 100]); }
  for (const f of ['ae', 'ug']) for (const p of S.route[f].pts) if (skip !== f) pts.push([p.x, p.y]);
  for (const r of S.runs) {
    if (r === skip || r.pts.length < 2) continue; pts.push(r.pts[0].slice(), r.pts[r.pts.length - 1].slice());
    for (let i = 0; i + 1 < r.pts.length; i++) { const a = r.pts[i], b = r.pts[i + 1]; if (Math.abs(a[1] - b[1]) < 0.02) guides.push({ c: 'H', v: a[1], a: Math.min(a[0], b[0]), b: Math.max(a[0], b[0]) }); else if (Math.abs(a[0] - b[0]) < 0.02) guides.push({ c: 'V', v: a[0], a: Math.min(a[1], b[1]), b: Math.max(a[1], b[1]) }); }
  }
  return { pts, guides };
}
/* o: tol (how rough the hand may be, metres), align (false keeps free angles), start (fixed first point), pts and guides to snap to */
function tidyStroke(P, o) {
  o = o || {}; const tol = o.tol || 0.3, tolE = o.tolEnd || tol * 2, g1 = v => Math.round(v * 10) / 10;
  const near = q => { let best = null, bd = tolE; for (const a of o.pts || []) { const d = Math.hypot(a[0] - q[0], a[1] - q[1]); if (d < bd) { bd = d; best = a; } } return best; };
  if (P.length < 2) return P.map(p => [g1(p[0]), g1(p[1])]);
  const A0 = o.start || near(P[0]), A1 = near(P[P.length - 1]), idx = rdpIdx(P, tol), M = [];
  for (let k = 0; k + 1 < idx.length; k++) {
    const a = P[idx[k]], b = P[idx[k + 1]], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); if (len < 1e-6) continue;
    const ang = Math.abs(Math.atan2(dy, dx)) / D2R, dev = Math.min(ang, 180 - ang), c = o.align === false ? 'F' : dev <= 20 ? 'H' : dev >= 70 ? 'V' : 'F';
    let sx = 0, sy = 0, n = 0; for (let i = idx[k]; i <= idx[k + 1]; i++) { sx += P[i][0]; sy += P[i][1]; n++; }
    const s = { c, a, b, len, v: c === 'H' ? sy / n : sx / n, lo: c === 'H' ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi: c === 'H' ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]) }, p = M[M.length - 1];
    if (p && c !== 'F' && p.c === c) { p.v = (p.v * p.len + s.v * s.len) / (p.len + s.len); p.len += s.len; p.b = b; p.lo = Math.min(p.lo, s.lo); p.hi = Math.max(p.hi, s.hi); } else M.push(s);
  }
  if (!M.length) return [[g1(P[0][0]), g1(P[0][1])]];
  for (const s of M) {                                   /* pull a straight run onto a drawn run or a point it passes */
    if (s.c === 'F') continue; let hit = null;
    for (const g of o.guides || []) if (g.c === s.c && Math.abs(g.v - s.v) <= tol * 1.3 && Math.min(g.b, s.hi) - Math.max(g.a, s.lo) >= 0.4 * (s.hi - s.lo) && (hit == null || Math.abs(g.v - s.v) < Math.abs(hit - s.v))) hit = g.v;
    if (hit == null) for (const a of o.pts || []) { const al = s.c === 'H' ? a[0] : a[1], v = s.c === 'H' ? a[1] : a[0]; if (Math.abs(v - s.v) <= tol && al >= s.lo - tol && al <= s.hi + tol && (hit == null || Math.abs(v - s.v) < Math.abs(hit - s.v))) hit = v; }
    s.v = hit == null ? g1(s.v) : hit;
  }
  const F = M[0], Z = M[M.length - 1];
  if (A0) { if (F.c === 'H') F.v = A0[1]; else if (F.c === 'V') F.v = A0[0]; else F.a = A0; }
  if (A1) {
    if (M.length === 1 && Z.c !== 'F') { const off = Z.c === 'H' ? A1[1] - Z.v : A1[0] - Z.v; if (Math.abs(off) > 0.05) { if (A0) M.push({ c: Z.c === 'H' ? 'V' : 'H', v: Z.c === 'H' ? A1[0] : A1[1], a: A1, b: A1 }); else Z.v += off; } }
    else if (Z.c === 'H') Z.v = A1[1]; else if (Z.c === 'V') Z.v = A1[0]; else Z.b = A1;
  }
  const line = s => s.c === 'H' ? { p: [0, s.v], d: [1, 0] } : s.c === 'V' ? { p: [s.v, 0], d: [0, 1] } : { p: s.a, d: [s.b[0] - s.a[0], s.b[1] - s.a[1]] };
  const isect = (l1, l2) => { const den = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0]; if (Math.abs(den) < 1e-9) return null; const t = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / den; return [l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t]; };
  const projOn = (l, q) => { const dd = l.d[0] * l.d[0] + l.d[1] * l.d[1] || 1, t = ((q[0] - l.p[0]) * l.d[0] + (q[1] - l.p[1]) * l.d[1]) / dd; return [l.p[0] + l.d[0] * t, l.p[1] + l.d[1] * t]; };
  const Ln = M.map(line), V = [A0 ? [A0[0], A0[1]] : projOn(Ln[0], P[0])], out = [];
  for (let i = 0; i + 1 < Ln.length; i++) V.push(isect(Ln[i], Ln[i + 1]) || projOn(Ln[i], M[i].b));
  V.push(A1 ? [A1[0], A1[1]] : projOn(Ln[Ln.length - 1], P[P.length - 1]));
  V.forEach((p, i) => {
    let x = p[0], y = p[1]; const prev = M[i - 1], next = M[i];
    if (!((i === 0 && A0) || (i === V.length - 1 && A1))) { if (!((prev && prev.c === 'V') || (next && next.c === 'V'))) x = g1(x); if (!((prev && prev.c === 'H') || (next && next.c === 'H'))) y = g1(y); }
    x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100;
    const q = out[out.length - 1]; if (!q || Math.hypot(q[0] - x, q[1] - y) > 0.05) out.push([x, y]);
  });
  for (let i = out.length - 2; i > 0; i--) { const a = out[i - 1], b = out[i], c = out[i + 1]; if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 0.02 * Math.hypot(c[0] - a[0], c[1] - a[1]) && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0) out.splice(i, 1); }
  return out;
}
