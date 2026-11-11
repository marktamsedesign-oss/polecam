
const fs = require('fs'); const T = require('/home/claude/polecam/dxftpl.js');
const seed = fs.readFileSync(process.argv[2], 'utf8'), out = process.argv[3], V = process.argv[4];
const E0 = 789000, N0 = 785500, flip = V === 'east', OLT = V === 'olt';
const X = (x) => (flip ? E0 + 300 - x : E0 + x); // the same route mirrored: the homing in the east
const roads = [{ hw: 'residential', name: 'SAMPLE STREET', pts: [[E0 - 80, N0], [E0 + 400, N0]] }, { hw: 'residential', name: 'CROSS STREET', pts: [[X(200), N0 - 120], [X(200), N0 + 120]] }];
const P = [
  { poleId: 'CC-0001', status: 'Existing', mat: 'CC', armType: 'Single arm', guy: 'Side guy', mloop: true },
  { poleId: 'CC-0002', status: 'Existing', mat: 'CC', guy: 'Head guy', nap: true, napId: 'NAP-0001' },
  { poleId: 'PP-0001', status: 'Proposed', label1: 'PROP.POLE PP-0001', height: '9.14m', clamp: '8-9', closure: true, closureId: 'CL-0001', adjusted: true, dN: 4 },
  { poleId: 'GT-0001', status: 'Existing', telco: true, mat: '', nap: true, napId: 'DN-0001', napType: 'Dummy NAP', ground: true },
  { poleId: 'CC-0005', status: 'Existing', mat: 'CC', dE: -12, guy: 'Pole-to-pole guy', p2pTo: 4, nap: true, napId: 'NAP-0005', napType: 'NAP 1x16' },
  { poleId: 'CC-0006', status: 'Existing', mat: 'CC', adjusted: true, dE: -280, dN: -3.5, nap: true, napId: 'NAP-0006', napType: 'NAP changed to 1:16' },
];
const pts = P.map((p, k) => ({ id: k + 1, el: 'Pole', tag: p.poleId, label1: p.label1 || '', telco: !!p.telco, size: '', height: p.height || '', clamp: p.clamp || '', E: X(k * 45 + (p.dE || 0)), N: N0 + 7.5 + (k % 2 ? 1 : 0) + (p.dN || 0), lat: 7.1 + k * 0.0004, lon: 125.6 + k * 0.0004, ...p }));
pts.push({ id: 7, el: 'Site', status: OLT ? 'Existing' : 'New', siteKind: OLT ? 'OLT' : 'Tower', poleId: 'HOMING SITE', siteName: 'HOMING SITE', E: X(-40), N: N0 + 28, lat: 7.1, lon: 125.6 });
pts.push({ id: 8, el: 'Manhole', status: 'Proposed', poleId: 'MH-0001', E: X(238), N: N0 - 9, lat: 7.1, lon: 125.6 });
pts.push({ id: 9, el: 'Service box', status: 'Proposed', poleId: 'SB-0001', E: X(272), N: N0 - 8, lat: 7.1, lon: 125.6 });
pts.push({ id: 10, el: 'Handhole', status: 'Proposed', poleId: 'HH-0001', E: X(306), N: N0 - 9, lat: 7.1, lon: 125.6 });
pts.push({ id: 11, el: 'ODC', status: 'Proposed', poleId: 'ODC-0001', lcp: 'Double LCP', E: X(352), N: N0 - 16, lat: 7.1, lon: 125.6, color: 'red', adjusted: true });
pts.push({ id: 12, el: 'NAP', status: 'Proposed', poleId: 'NAP-0009', napType: 'Double NAP', E: X(92), N: N0 + 20, lat: 7.1, lon: 125.6 });
const L = (a, b, cable) => { const A = pts.find((p) => p.id === a), B = pts.find((p) => p.id === b); return { ia: a, ib: b, a: [A.E, A.N], b: [B.E, B.N], len: Math.hypot(B.E - A.E, B.N - A.N), cable, long: false }; };
// CC-0006 (the last pole, moved by hand 3.5 m toward the road: tidied) is linked between PP-0001 and GT-0001? no: a branch from CC-0002
const spans = [L(7, 1, 'L12'), L(1, 2, 'L12'), L(2, 3, 'L12'), L(3, 4, 'L12'), L(4, 5, 'L12'), L(5, 8, 'U144'), L(8, 9, 'U144'), L(9, 10, 'U144'), L(10, 11, 'U144')];
const job = { pts, spans, runs: [{ cable: 'L12', label: 'PROPOSED 12C LIGHT CABLE' }, { cable: 'U144', label: 'PROPOSED 144C AIR-BLOWN UG FOC' }], roads, pois: [], photos: {}, roadsNote: 'test', values: { COMPANY_NAME: 'SAMPLE' }, planTitle: 'AFI PLAN', logo: null, vicImage: null,
  mloopLen: 15, maxSpan: 200, vicinity: [E0 + 150, N0, 1500], date: new Date(2026, 10, 1), debug: true };
job.vicCircle = T.vicCircle(pts.map((p) => [p.E, p.N]), 1500);
const r = T.build(seed, job);
fs.writeFileSync(out, r.text);
fs.writeFileSync(out + '.json', JSON.stringify({ counts: r.report.counts, circle: job.vicCircle, pts: r.report.pts, inline: r.report.inline }));
