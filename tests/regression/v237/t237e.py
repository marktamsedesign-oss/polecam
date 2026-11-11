"""v2.37.0 engine checks (the design review, rounds 1 and 2), on the company template, with node building the samples:
 the 6 m rule; NAP kinds, ODC (double LCP), handhole / manhole / service box ON the cable with the cable meeting their sides and the
 ID below; a NAP pin drawn on its pole; the loop on the cable, its text readable; the closure on the cable; guys (side guy never
 into the road, head guy against the pull, pole-to-pole to the chosen pole + a head guy there); grounding (loop poles + marked,
 half size); riser at aerial → underground; HDD where the underground cable crosses a road; underground green; a new tower red;
 an OLT site; the vicinity circle, label box; the cable name as small as the span lengths; small coordinates of the other points."""
import sys, os, json, math, subprocess
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/ext/ezdxf/src')
import ezdxf
from ezdxf import bbox
D = S + '/v237'
checks = []
def check(name, ok, info=''):
    checks.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name, '|', str(info)[:700], flush=True)
JS = r'''
const fs = require('fs'); const T = require(process.env.GESAA_APP + '/dxftpl.js');
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
'''
open(D + '/t237e_build.cjs', 'w').write(JS)
SEED = PRIV + '/template/seed.dxf'
for v in ('west', 'east', 'olt'):
    r = subprocess.run(['node', D + '/t237e_build.cjs', SEED, f'{D}/t237e_{v}.dxf', v], capture_output=True, text=True)
    if r.returncode: print(r.stderr[-2000:]); raise SystemExit(1)
E0, N0 = 789000, 785500
def load(v):
    doc = ezdxf.readfile(f'{D}/t237e_{v}.dxf'); info = json.load(open(f'{D}/t237e_{v}.dxf.json')); return doc, doc.modelspace(), info
doc, msp, info = load('west')
C = info['counts']
near = lambda e, x, y, d: math.hypot(center(e)[0] - x, center(e)[1] - y) < d
def geo(e):  # the block's own drawing (no attributes)
    return bbox.extents(list(e.virtual_entities()) if e.dxftype() == 'INSERT' else [e], fast=True)
def center(e):
    b = geo(e); return (b.center.x, b.center.y)
def inroute(e, m=None):
    c = center(e); return E0 - 110 < c[0] < E0 + 430 and N0 - 70 < c[1] < N0 + 70
ins = lambda name, m=None: [e for e in (m or msp).query('INSERT') if e.dxf.name == name and inroute(e)]
cab = [e for e in msp.query('LWPOLYLINE') if e.dxf.layer in ('PROPOSED FOC AERIAL 6 CORE', 'Proposed foc duct') and all(abs(x - E0) < 600 and abs(y - N0) < 200 for x, y in e.get_points('xy'))]
segs = [((a[0], a[1]), (b[0], b[1])) for e in cab for a, b in zip(list(e.get_points('xy')), list(e.get_points('xy'))[1:])]
def dseg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy or 1e-9; t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
dcab = lambda p: min(dseg(p, a, b) for a, b in segs)
ends = [pt for e in cab for pt in (tuple(e.get_points('xy'))[0][:2], tuple(e.get_points('xy'))[-1][:2])]
# --- inline blocks
want = {'proposed NAP': 'NAP-0001', 'dummy nap': 'DN-0001', '1_16NAP': 'NAP-0005', 'proposed Double NAP': 'NAP-0009', 'G-ESAA ODC': 'ODC-0001', 'PROPOSED MAN HOLE': 'MH-0001', 'proposed service box': 'SB-0001', 'proposed Handhole': 'HH-0001'}
got = {}
for b, lab in want.items():
    L = ins(b)
    got[b] = [(round(center(e)[0] - E0, 1), round(center(e)[1] - N0, 1), round(e.dxf.rotation, 1)) for e in L]
cab_ok = {}
for b in want:
    for e in ins(b):
        from ezdxf.disassemble import recursive_decompose
        c = center(e); bb = bbox.extents([x for x in recursive_decompose([e]) if x.dxftype() in ('LINE', 'LWPOLYLINE', 'ARC', 'CIRCLE', 'POLYLINE')], fast=True) # its lines (the texts' boxes vary by font)
        # the cable runs up to its two sides (an end of a cable piece within 1.5 m of the block's box, left and right) and not through it
        inside = [pt for a, bpt in segs for pt in (a, bpt) if bb.extmin.x + 1 < pt[0] < bb.extmax.x - 1 and bb.extmin.y - 1 < pt[1] < bb.extmax.y + 1] # none inside its lines
        tb = geo(e); touch = [pt for pt in ends if tb.extmin.x - 2.5 <= pt[0] <= tb.extmax.x + 2.5 and tb.extmin.y - 2 <= pt[1] <= tb.extmax.y + 2] # at its sides, its texts included
        cab_ok[b] = (round(dcab(c), 1), len(touch), len(inside))
check('E1. every kind on the cable: NAP 1x8, dummy NAP, NAP 1:16, double NAP (a NAP pin, drawn on its pole), the ODC (v2.41: G-eSAA isometric ODC block, not the LCP model), manhole, service box, handhole',
      all(len(v) == 1 for v in got.values()) and C.get('napsOnPoles') == 1, (got, C.get('napsOnPoles')))
check('E2. the cable meets each block\'s sides (cable pieces end at the block, none runs through it)',
      all(v[1] >= 1 and v[2] == 0 for v in cab_ok.values()) and all(v[1] >= 2 for k, v in cab_ok.items() if k not in ('G-ESAA ODC',)), cab_ok)
# NAP turned along the cable, its input side toward the homing (west here: rotation about 0)
rots = {b: got[b][0][2] for b in ('proposed NAP', 'dummy nap', '1_16NAP')}
check('E3. a NAP is turned along the cable with its input side toward the homing (homing west: about 0°)', all(abs(((r + 180) % 360) - 180) < 20 for r in rots.values()), rots)
# the IDs below their blocks
lab_ok = {}
for b, lab in want.items():
    e = ins(b)[0]; c = center(e); t = [x for x in msp.query('TEXT') if x.dxf.text == lab]
    if t: tp = t[0].dxf.align_point if t[0].dxf.hasattr('align_point') else t[0].dxf.insert; lab_ok[lab] = round(tp.y - c[1], 1)
check('E4. each ID below its block', len(lab_ok) == len(want) and all(v < -2 for v in lab_ok.values()), lab_ok)
# the pole beside its NAP, not under it
cc2 = [e for e in msp.query('INSERT') if e.dxf.name == 'existing electric pole' and near(e, E0 + 45, N0 + 8, 12)]
nap = ins('proposed NAP')[0]; nb = geo(nap)
check('E5. the pole symbol stands clear of its NAP', cc2 and not (nb.extmin.x < center(cc2[0])[0] < nb.extmax.x and nb.extmin.y < center(cc2[0])[1] < nb.extmax.y), (cc2 and center(cc2[0]), nb.extmin, nb.extmax))
# the 6 m rule: PP-0001 (by hand, 8.5 m from the road edge) kept; CC-0006 (by hand, about 1 m from the edge) tidied
pp = [e for e in msp.query('INSERT') if e.dxf.name == 'P-POLE' and near(e, E0 + 90, N0 + 11.5, 4)]
cc6 = [e for e in msp.query('INSERT') if e.dxf.name == 'existing electric pole' and near(e, E0 - 55, N0 + 6, 8)]
PT = {q['poleId']: q for q in info['pts']}
check('E6. the 6 m rule: a pin by hand 8.5 m from the road edge stays (PP-0001); one about 1 m from it is tidied beside the road (CC-0006)',
      PT['PP-0001']['kept'] and PT['PP-0001']['moved'] == 0 and not PT['CC-0006']['kept'] and PT['CC-0006']['moved'] > 0.3, (PT['PP-0001'], PT['CC-0006']))  # v2.39: a pole 2.5 m from the edge (its pin was 2 m from it)
# loop on the cable, its text readable
lp = ins('loopp'); lt = [x for x in msp.query('TEXT') if 'LOOP' in x.dxf.text and abs(x.dxf.insert.x - E0) < 300]
if lp:
    lb = geo(lp[0]); top = ((lb.extmin.x + lb.extmax.x) / 2, lb.extmax.y)
check('E7. the loop on the cable right in front of its pole (v2.41; its line on the cable); its text readable',
      lp and dcab(top) < 1.2 and abs((lb.extmin.x + lb.extmax.x) / 2 - E0) < 3 and lt and -90 < (((lt[0].dxf.rotation + 180) % 360) - 180) <= 90, (lp and round(dcab(top), 2), lt and lt[0].dxf.rotation))
cl = ins('P-Joint')
cl = ins('P-Joint')
ci = cl and center(cl[0])
check('E8. the closure on the cable at its pole (beside the NAP on that pole)', cl and dcab(ci) < 2.5 and abs(ci[0] - E0 - 90) < 30, cl and (round(dcab(ci), 1), round(ci[0] - E0, 1)))
# guys
sg = [e for e in msp.query('INSERT') if e.dxf.name == 'G-ESAA SG' and near(e, E0, N0 + 7, 15)]
p2p = [e for e in msp.query('INSERT') if e.dxf.name == 'G-ESAA P2P']
hgs = [e for e in msp.query('INSERT') if e.dxf.name == 'G-ESAA HG']
def tipdir(e):
    a = math.radians(e.dxf.rotation); return (math.cos(a), math.sin(a))
check('E9. the side guy points away from the road (its cable side is the road side)', sg and tipdir(sg[0])[1] > 0.2, sg and sg[0].dxf.rotation)
gt = ins('existing telecom pole')
hg_gt = [e for e in hgs if gt and near(e, center(gt[0])[0], center(gt[0])[1], 11)]
pb = p2p and geo(p2p[0])
check('E10. the pole-to-pole guy runs from CC-0005 to the chosen pole (GT-0001), with a head guy at GT-0001 pointing on away from it',
      p2p and gt and pb.extmin.x < center(gt[0])[0] + 3 and pb.extmax.x > E0 + 150 and hg_gt and tipdir(hg_gt[0])[0] < -0.8 and C.get('poleToPole') == 1, (pb and (pb.extmin.x - E0, pb.extmax.x - E0), [h.dxf.rotation for h in hg_gt]))
hg2 = [e for e in hgs if near(e, E0 + 45, N0 + 8, 10)]
check('E11. the head guy on CC-0002 (spans both ways) points away from the longer span, in line with the cable', hg2 and abs(tipdir(hg2[0])[1]) < 0.3, [h.dxf.rotation for h in hg2])
gr = ins('proposed grounding')
check('E12. grounding at the loop pole (CC-0001) and the marked pole (GT-0001), half the legend\'s size', len(gr) == 2 and all(abs(e.dxf.xscale - 0.39) < 0.01 for e in gr), [(round(e.dxf.insert.x - E0), round(e.dxf.xscale, 3)) for e in gr])
rs = ins('proposed riser')
check('E13. a riser where the cable goes from aerial to underground (CC-0005), on the cable just past its NAP', len(rs) == 1 and dcab(center(rs[0])) < 1.5 and abs(center(rs[0])[0] - E0 - 168) < 35, rs and (round(center(rs[0])[0] - E0, 1), round(dcab(center(rs[0])), 2)))
hdd = ins('proposed HDD Directional Boring')
check('E14. directional boring where the underground cable crosses a road: CROSS STREET (centred on it) and SAMPLE STREET (the cable goes to its other side)', len(hdd) == 2 and any(abs(center(h)[0] - E0 - 200) < 2 for h in hdd) and any(abs(center(h)[1] - N0) < 2 for h in hdd) and all(dcab(center(h)) < 1.5 for h in hdd), [center(h) for h in hdd])
ug = [e for e in cab if e.dxf.layer == 'Proposed foc duct']
check('E15. the underground cable solid and green (AutoCAD colour 3)', ug and all(e.dxf.color == 3 and e.dxf.linetype in ('Continuous', 'CONTINUOUS', 'BYLAYER') for e in ug), [(e.dxf.color, e.dxf.linetype) for e in ug])
tw = ins('G-ESAA P-BTS')
red = tw and all(x.dxf.color == 1 for x in doc.blocks['G-ESAA P-BTS'] if x.dxftype() in ('LINE', 'LWPOLYLINE', 'CIRCLE', 'ARC', 'POLYLINE'))
check('E16. a new tower is drawn red (its own copy of the tower block)', tw and red, (len(tw), red))
# the cable name as small as the span lengths, along the cable
sp = [x for x in msp.query('TEXT') if x.dxf.layer == 'Distance Data' and abs(x.dxf.insert.x - E0) < 430 and abs(x.dxf.insert.y - N0) < 70]
cn = [x for x in msp.query('TEXT') if 'PROPOSED 12C LIGHT CABLE' in x.dxf.text]
check('E17. the cable\'s name has the span lengths\' size, close along the cable (v2.39.1: within 8 m; the one fallback may sit a little further out to keep off a street name)', cn and sp and abs(cn[0].dxf.height - sp[0].dxf.height) < 0.01 and dcab((cn[0].dxf.align_point.x, cn[0].dxf.align_point.y) if cn[0].dxf.hasattr('align_point') else (cn[0].dxf.insert.x, cn[0].dxf.insert.y)) < 8, (cn and cn[0].dxf.height, sp and sp[0].dxf.height))
ll = [x for x in msp.query('MTEXT') if x.dxf.layer == 'LATLONG' and abs(x.dxf.insert.x - E0) < 600 and x.dxf.char_height < 1.5]
check('E18. the coordinates of the other points are small (1.2) and do not cover the blocks', len(ll) >= 5, len(ll))
# the vicinity: the circle the app gives, thicker; the label on a framed box
vic = sorted([e for e in msp.query('LWPOLYLINE') if e.dxf.layer == 'G-ESAA VICINITY' and e.closed and len(e) == 2], key=lambda e: -abs(e.get_points('xy')[0][0] - e.get_points('xy')[1][0]))
circ = info['circle']; vk = 1500 / 1500
check('E19. the vicinity circle is the app\'s circle (E, N, radius), 7 × thicker line; PROJECT AREA on a framed dark box',
      vic and abs(abs(vic[0].get_points('xy')[0][0] - vic[0].get_points('xy')[1][0]) / 2 - circ[2]) < 0.5 and abs(vic[0].dxf.const_width - 7 * vk) < 0.01
      and any(x.plain_text() == 'PROJECT AREA' and x.dxf.get('bg_fill', 0) for x in msp.query('MTEXT')), (vic and vic[0].dxf.const_width, circ))
# homing in the east: the NAPs turned round (input side still toward the homing)
doc2, msp2, info2 = load('east')
r2 = [e.dxf.rotation for e in msp2.query('INSERT') if e.dxf.name in ('proposed NAP', 'dummy nap', '1_16NAP') and inroute(e)]
check('E20. with the homing in the east the NAPs are turned round (about 180°), input side toward the homing', len(r2) == 3 and all(abs(((r + 360) % 360) - 180) < 20 for r in r2), r2)
doc3, msp3, info3 = load('olt')
olt = [e for e in msp3.query('INSERT') if e.dxf.name == 'OLT1' and inroute(e)]
oname = [x for x in msp3.query('TEXT') if x.dxf.text == 'HOMING SITE']
check('E21. an OLT site is drawn with the OLT model (existing: OLT1, blue) and its name beside it; no tower', olt and oname and not [e for e in msp3.query('INSERT') if e.dxf.name in ('X-BTS', 'G-ESAA P-BTS') and inroute(e)], (len(olt), len(oname)))
print(json.dumps(C))
print(f'{sum(checks)}/{len(checks)} passed')
