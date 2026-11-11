"""(v2.42.28 copy: Drawing style opens from Plan settings on the Drawing.)
v2.42.26 (synthetic data only): Drawing style for cable labels and the tower site; the ODF beside the tower; photos that never
 overlap; the pole form's open answers (chips with *); a tapped cable lit end to end; labels only near the screen; the plan built
 in a worker; the slow-step recorder.
 A made-up street of 46 poles 40 m apart (IDs and places made up), two cables side by side from an ODF at a made-up tower: RUN 1 Fig-8
 72C and RUN 2 Light 12C; a closure on the 11th pole; MLoop on the 7th; a cluster of 8 poles 6 m apart beside the street (for the
 photos); a proposed pole; a pole with nothing answered."""
import asyncio, sys, os, shutil, json, math, zipfile, io, re, time
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
src = open(S + '/v24220/t24220b.py').read().split('\nasync def main():')[0].replace("OUT = S + '/v24220/out_b'", "OUT = S + '/v24228/out_226a_v28'")
exec(compile(src, 't24220b_head', 'exec'))  # common, ezdxf, check, checks, W, close_sheets, export, new_ctx, setup, SEED_H, ADD
H23 = open(S + '/v24223/t24223a.py').read().split('\nasync def main():')[0].split('# ---- geometry')[1]; g_ = {}; exec(compile(H23, 'geo', 'exec'), g_)
sat = g_['sat']
# the builder wrapped to see its job and report (on the page); PH: made-up photos for every pole (file names only: the DXF names them)
WRAP = """() => { const wrap = (T) => { if (!T || T.__w) return T; const ob = T.build; T.__ob = ob; T.build = function (seed, job) {
    if (window.__PH) { job.photos = Object.fromEntries(job.pts.filter((p) => p.el === 'Pole').map((p) => [p.id, { file: `PH_${p.id}.jpg`, px: 800, py: 600 }])); job.markMode = 'photo'; job.markNum = false; }
    job.debug = true; window.__job = { pts: job.pts.map((p) => ({ id: p.id, poleId: p.poleId, el: p.el, E: p.E, N: p.N, ground: p.ground, odfSz: p.odfSz })), cell: job.cell || 440, cabPer: job.cabPer, cabH: job.cabH, siteName: job.siteName, odfPlace: job.odfPlace, odfLbl: job.odfLbl };
    const out = ob.apply(this, arguments); const r = out && out.report; window.__rep = r ? { geo: r.grid ? r.grid.geo : null, odfs: r.odfs, odfLabels: r.odfLabels, marks: r.layout ? r.layout.marks : null } : null; return out; }; T.__w = true; return T; };
  if (window.GeDxfTpl) wrap(window.GeDxfTpl); else { let v; Object.defineProperty(window, 'GeDxfTpl', { configurable: true, get: () => v, set: (x) => { v = wrap(x); } }); } }"""
UNWRAP = "() => { const T = window.GeDxfTpl; if (T.__ob) { T.build = T.__ob; T.__w = false; } }"
R_E = 6371008.8; LAT, LON0 = 7.0921, 125.6045
def ll(dx, dy): return (LAT + dy / (R_E * math.pi / 180), LON0 + dx / (R_E * math.cos(math.radians(LAT)) * math.pi / 180))
N = 46
def xy(i):  # a street that bends twice
    if i <= 20: return (i * 40.0, 0.0)
    if i <= 33: return (800.0 + (i - 20) * 40 * 0.6, -(i - 20) * 40 * 0.8)
    return (800.0 + 13 * 24 + (i - 33) * 40.0, -13 * 32.0)
TW = (-60.0, 6.0); OD = (-52.0, 8.0)  # the tower; the ODF's pin at its foot
def recs():
    out = [{'k': 'T', 'poleId': 'SYN-T01', 'lat': ll(*TW)[0], 'lon': ll(*TW)[1], 'element': 'Site', 'status': 'Existing', 'boq': {}, 'x': {'siteKind': 'Tower'}},
           {'k': 'O', 'poleId': 'ODF-0001', 'lat': ll(*OD)[0], 'lon': ll(*OD)[1], 'element': 'ODF', 'status': 'Existing', 'boq': {'odf': '48F', 'conn': 'APC'}, 'x': {'odf': 'Existing'}}]
    for i in range(N):
        x, y = xy(i); la, lo = ll(x, y); b = {'owner': 'Electric', 'ownerName': 'DLPC', 'clamp': '8-10', 'mloop': 'No', 'ground': 'Yes', 'cloNo': 'Yes'}; X = {}; st = 'Existing'
        if i == 10: b.update({'cloSt': 'New', 'clo': '72C'}); b.pop('cloNo'); X = {'closure': True, 'closureId': 'CL-0101'}
        if i in (6, 22): b.update({'mloop': 'Yes'})
        if i == 3: b = {}  # nothing answered yet
        if i == 20: st = 'Proposed'; b = {}  # a new Globe pole, nothing answered
        out.append({'k': f'P{i}', 'poleId': f'CC-6{i:03d}', 'poleType': 'Concrete', 'lat': la, 'lon': lo, 'element': 'Pole', 'status': st, 'boq': b, 'x': X})
    for j in range(8):  # a cluster beside the street: 8 poles 6 m apart (their photos have no room beside them)
        la, lo = ll(206.0 + j * 6.0, 14.0); out.append({'k': f'Q{j}', 'poleId': f'CC-7{j:03d}', 'poleType': 'Concrete', 'lat': la, 'lon': lo, 'element': 'Pole', 'status': 'Existing', 'boq': {'owner': 'PLDT', 'clamp': '8-10'}, 'x': {}})
    return out
PATH = ['O'] + [f'P{i}' for i in range(N)]
LINKS = [[a, b, 'F72'] for a, b in zip(PATH, PATH[1:])]
FIB = [{'n': 1, 'cab': 'F72', 'side': 'auto', 'ex': False, 'path': PATH, 'fromSt': '', 'toSt': ''}, {'n': 2, 'cab': 'L12', 'side': 'auto', 'ex': False, 'path': PATH, 'fromSt': '', 'toSt': ''}]

def dxf_of(fd):
    z = zipfile.ZipFile(fd); dn = sorted(n for n in z.namelist() if n.endswith('.dxf'))[0]
    doc = ezdxf.read(io.StringIO(z.read(dn).decode('utf-8', 'replace').replace('\r\n', '\n'))); return z, doc, [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
pos = lambda e: (e.dxf.align_point.x, e.dxf.align_point.y) if (e.dxf.get('halign', 0) or e.dxf.get('valign', 0)) else (e.dxf.insert.x, e.dxf.insert.y)
def tb(e):  # a text's box (corners), as AutoCAD draws it (Arial caps about 0.6 of the height wide; centred)
    h = e.dxf.height; w = len(e.dxf.text) * 0.6 * h; a = math.radians(e.dxf.get('rotation', 0)); ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux; q = pos(e)
    ha = e.dxf.get('halign', 0); off = 0 if ha in (1, 4) else w / 2 if ha == 0 else -w / 2
    q = (q[0] + ux * off, q[1] + uy * off)
    return [(q[0] + ux * w / 2 * sx * 0.92 + vx * h / 2 * sy * 0.92, q[1] + uy * w / 2 * sx * 0.92 + vy * h / 2 * sy * 0.92) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
def abox(a):  # an attribute's box (level)
    q = pos(a); h = a.dxf.height; w = len(a.dxf.text) * 0.62 * h; ha = a.dxf.get('halign', 0)
    x0 = q[0] if ha == 0 else q[0] - w if ha == 2 else q[0] - w / 2
    return [(x0, q[1] - h / 2), (x0 + w, q[1] - h / 2), (x0 + w, q[1] + h / 2), (x0, q[1] + h / 2)]
def inside(q, b): return b[0] <= q[0] <= b[2] and b[1] <= q[1] <= b[3]

async def main():
    async with async_playwright() as p:
        ctx, pg, errs = await new_ctx(p, OUT + '/ud'); await setup(pg, 'Juan Dela Cruz', 'juan.delacruz@example.com')
        await common.newproj(pg, 'survey', 'STYLE_SITE', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['STYLE_SITE', recs(), LINKS, FIB]); kof = {v: k for k, v in ids.items()}
        # ---- the pole form: what still needs an answer, a chip with * each, answered there
        await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids['P3']); await W(pg, 1500)
        nd = await pg.evaluate("__polecam.edNeeds()")
        chips = await pg.evaluate("() => [...document.querySelectorAll('#edSum button')].map((b) => [b.className, b.textContent])")
        check('C1. a pole with nothing answered: Owner *, Clamp size *, Loop *, Closure *, Grounding * at the start of the line under the ID', nd == ['owner', 'clamp', 'mloop', 'clo', 'ground'] and [t for c, t in chips[:5]] == ['Owner *', 'Clamp size *', 'Loop *', 'Closure *', 'Grounding *'] and all(c == 'need' for c, _ in chips[:5]), (nd, chips))
        async def answer(chip, opt):
            await pg.click(f"#edSum button.need:text-is('{chip} *')"); await W(pg, 300)
            vis = await pg.evaluate("() => !document.getElementById('edQuick').hidden && [...document.querySelectorAll('#edQuick .opts button')].map((b) => b.textContent)")
            await pg.click(f"#edQuick .opts button:text-is('{opt}')"); await W(pg, 400); return vis
        o1 = await answer('Grounding', 'No grounding')
        nd = await pg.evaluate("__polecam.edNeeds()"); chips = await pg.evaluate("() => [...document.querySelectorAll('#edSum button')].map((b) => b.textContent)")
        check('C2. Grounding * answered right there (Grounding / No grounding): its chip gone, No grounding with the answers', o1 == ['Grounding', 'No grounding'] and 'ground' not in nd and 'No grounding' in chips, (o1, nd, chips))
        o2 = await answer('Closure', 'No closure'); o3 = await answer('Loop', 'No loop'); o4 = await answer('Owner', 'PLDT'); o5 = await answer('Clamp size', '5-7')
        nd = await pg.evaluate("__polecam.edNeeds()"); nocl = await pg.evaluate("document.getElementById('atNoClo').checked")
        check('C3. Closure (Yes / No closure), Loop (Yes / No loop), Owner and Clamp size answered there: nothing left with *; the On pole tab shows No closure', nd == [] and o2 == ['Yes', 'No closure'] and o3[-1] == 'No loop' and 'PLDT' in o4 and '5-7' in o5 and nocl, (nd, o2, o3, o4[:6], o5[:4], nocl))
        await pg.click('#edSave'); await W(pg, 1500)
        if await pg.locator('#askBox:not([hidden])').count(): await pg.locator('#askBox button.primary').first.click(); await W(pg, 800)
        b3 = await pg.evaluate("(id) => (__polecam.points.find((p) => p.id === id) || {}).boq", ids['P3'])
        await close_sheets(pg); await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids['P3']); await W(pg, 1200); nd2 = await pg.evaluate("__polecam.edNeeds()")
        check('C4. saved: grounding No, no closure, loop No, PLDT, 5-7; opened again nothing with *', b3.get('ground') == 'No' and b3.get('cloNo') == 'Yes' and b3.get('mloop') == 'No' and b3.get('owner') == 'PLDT' and b3.get('clamp') == '5-7' and nd2 == [], (b3, nd2))
        await close_sheets(pg); await pg.evaluate("(id) => __polecam.openEditorFor(id)", ids['P20']); await W(pg, 1200); nd3 = await pg.evaluate("__polecam.edNeeds()")
        check('C5. a proposed (new Globe) pole: Pole size * instead of Owner *', nd3[:1] == ['height'] and 'owner' not in nd3 and 'ground' in nd3, nd3)
        await close_sheets(pg)
        # the loop's No in an As-Plan: the app still puts its loop there for the cable's spacing
        al = await pg.evaluate("() => { const by = new Map(__polecam.points.map((p) => [p.id, p.poleId])); return __polecam.autoLoops().map((x) => by.get(Array.isArray(x) ? x[0] : x)); }")
        tgt = sorted(x for x in al if x and x.startswith('CC-6'))[:1]
        no_auto = await pg.evaluate("(pid) => { const p = __polecam.points.find((q) => q.poleId === pid); return p && p.boq && p.boq.mloop; }", tgt[0]) if tgt else None
        check('C6. a pole answered Loop: No in an As-Plan still gets the app\'s loop where its cable\'s spacing needs one', tgt and no_auto == 'No', (tgt, no_auto, sorted(al)[:8]))
        # ---- the plan: default style (labels up to 3 for each cable in a grid; PROPOSED 72C FIG-8 AE (RUN 1)); the ODF beside the tower; photos apart
        await pg.evaluate(WRAP); await pg.evaluate("window.__PH = true"); await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'photo' }])")
        fd = await export(pg, 'doDxf', 'style_a.zip'); job = await pg.evaluate("window.__job"); rp = await pg.evaluate("window.__rep")
        z, doc, msp = dxf_of(fd); T = [e for e in msp if e.dxftype() == 'TEXT']
        XY = {kof.get(q['id'], q['id']): (q['E'], q['N']) for q in job['pts']}
        cl = [e for e in T if e.dxf.layer == 'G-ESAA CABLE LABEL']
        check('A1. the cable labels read PROPOSED 72C FIG-8 AE (RUN 1) and PROPOSED 12C LIGHT AE (RUN 2); the job: up to 3 a grid, height auto, the site name and ODF auto, ID + size', {e.dxf.text for e in cl} == {'PROPOSED 72C FIG-8 AE (RUN 1)', 'PROPOSED 12C LIGHT AE (RUN 2)'} and job['cabPer'] == 3 and not job['cabH'] and job['siteName'] == 'auto' and job['odfPlace'] == 'auto' and job['odfLbl'] == 'size', ({e.dxf.text for e in cl}, job['cabPer'], job['cabH'], job['siteName'], job['odfPlace'], job['odfLbl']))
        S_ = [XY[k] for k in PATH]; dd = [0]
        for a, b in zip(S_, S_[1:]): dd.append(dd[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        def along(q):
            best = None
            for i in range(len(S_) - 1):
                (ax, ay), (bx, by_) = S_[i], S_[i + 1]; L2 = (bx - ax) ** 2 + (by_ - ay) ** 2; u = max(0, min(1, ((q[0] - ax) * (bx - ax) + (q[1] - ay) * (by_ - ay)) / L2)) if L2 else 0
                d = math.hypot(q[0] - ax - u * (bx - ax), q[1] - ay - u * (by_ - ay))
                if best is None or d < best[0]: best = (d, dd[i] + u * math.sqrt(L2))
            return best
        cell = job['cell']; geo = rp['geo']; cellOf = lambda q: (math.floor((q[0] - geo[0]) / cell), math.floor((q[1] - geo[1]) / cell))
        per = {}
        for e in cl: per.setdefault((e.dxf.text, cellOf(pos(e))), []).append(round(along(pos(e))[1]))
        bad = [(k, sorted(v)) for k, v in per.items() if len(v) > 3 or any(abs(a - b) < 500 for i, a in enumerate(v) for b in v[i + 1:])]
        check('A2. in each grid each cable at most 3 labels, each 500 m or more along it from the others', geo and per and not bad, (bad[:4], {f'{k[0][-7:]} {k[1]}': sorted(v) for k, v in per.items()}))
        # the ODF beside the tower: out of the tower's place (26 x 50 m from its foot), on the side its cable comes from (east: right)
        tw = XY['T']; od = XY['O']; TB = (tw[0] - 13, tw[1] - 1, tw[0] + 13, tw[1] + 49)
        hosts = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name in ('X-HOST', 'P-HOST')]
        hq = [(e.dxf.insert.x, e.dxf.insert.y) for e in hosts]
        check('A3. the ODF drawn beside the tower (Auto: the side its cable comes from, right), not over it', rp['odfs'] and rp['odfs'][0]['side'] == 'right' and len(hq) == 1 and hq[0][0] > TB[2] + 2 and not inside(hq[0], TB), (rp['odfs'], hq, TB))
        att = {a.dxf.tag: a for e in hosts for a in e.attribs}
        bts = [a for e in msp if e.dxftype() == 'INSERT' and 'BTS' in e.dxf.name for a in e.attribs if a.dxf.tag == 'BTS_NAME']
        tbx = [(TB[0], TB[1]), (TB[2], TB[1]), (TB[2], TB[3]), (TB[0], TB[3])]
        ob = [abox(att[k]) for k in ('HST_NAM', 'HST_COD') if k in att and att[k].dxf.text.strip()]
        check('A4. its label: ODF-0001 and 48F ODF, beside it, outside the tower and clear of the site name', att.get('HST_NAM') and att['HST_NAM'].dxf.text == 'ODF-0001' and att.get('HST_COD') and att['HST_COD'].dxf.text == '48F ODF' and len(ob) == 2 and not any(sat(b, tbx) for b in ob) and not any(sat(b, abox(x)) for b in ob for x in bts),
              ({k: (a.dxf.text, [round(v, 1) for v in pos(a)]) for k, a in att.items()}, [(x.dxf.text, [round(v, 1) for v in pos(x)]) for x in bts]))
        near = []
        for e in msp:
            if e.dxftype() == 'LWPOLYLINE' and 'PHOTO' not in e.dxf.layer:
                for v in e.get_points('xy'):
                    if math.hypot(v[0] - hq[0][0], v[1] - hq[0][1]) < 7: near.append(e.dxf.layer)
        check('A5. the cables end at the ODF where it is drawn', any('CABLE' in L or 'FOC' in L or 'FIBER' in L or 'ROUTE' in L for L in near), sorted(set(near)))
        # photos: none over another, none over a text; every pole its photo; the ones further out with a line to their pole
        ims = [e for e in msp if e.dxftype() == 'IMAGE']
        def ibox(e):
            q = e.dxf.insert; u = e.dxf.u_pixel; v = e.dxf.v_pixel; sx, sy = e.dxf.image_size[0], e.dxf.image_size[1]
            W_ = math.hypot(u[0], u[1]) * sx; H_ = math.hypot(v[0], v[1]) * sy; return [(q[0], q[1]), (q[0] + W_, q[1]), (q[0] + W_, q[1] + H_), (q[0], q[1] + H_)]
        IB = [ibox(e) for e in ims if 'PHOTO' in e.dxf.layer]
        pp = [(i, j) for i in range(len(IB)) for j in range(i + 1, len(IB)) if sat([(x[0] + (0.05 if k in (0, 3) else -0.05), x[1] + (0.05 if k < 2 else -0.05)) for k, x in enumerate(IB[i])], IB[j])]
        TX = [e for e in T if e.dxf.text.strip() and e.dxf.layer != 'G-ESAA POLE PHOTO']
        pt = [(i, e.dxf.text) for i, b in enumerate(IB) for e in TX if sat([(x[0] + (0.05 if k in (0, 3) else -0.05), x[1] + (0.05 if k < 2 else -0.05)) for k, x in enumerate(b)], tb(e))]
        npole = sum(1 for q in job['pts'] if q['el'] == 'Pole'); lead = [m for m in (rp['marks'] or []) if m.get('lead')]
        check(f'A6. photos: every pole its photo ({npole}), none over another photo or a text; {len(lead)} further out with a line to its pole', len(IB) == npole and not pp and not pt, (len(IB), npole, pp[:5], pt[:5], [m['pid'] for m in lead][:8]))
        gr = {q['poleId']: q['ground'] for q in job['pts'] if q['el'] == 'Pole'}
        check('A7. grounding answered No is not drawn (CC-6003 no grounding; a pole with Yes keeps it)', gr.get('CC-6003') is False and gr.get('CC-6004') is True, (gr.get('CC-6003'), gr.get('CC-6004')))
        # ---- Drawing style changed: 1 a grid, 2.0 m, PROPOSED + size + RUN; the site name on top; the ODF below with its connector
        await pg.evaluate("() => { const S = __polecam.S; S.plStyle = { ...(S.plStyle || {}), cab: { on: true, per: 1, h: 2, w: { prop: true, size: true, type: false, place: false, foc: false, run: true } }, site: { name: 'top' }, odf: { place: 'below', lbl: 'conn' } }; __polecam.persist(); }")
        await pg.evaluate("window.__PH = false"); await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        fd = await export(pg, 'doDxf', 'style_b.zip'); job = await pg.evaluate("window.__job"); rp = await pg.evaluate("window.__rep")
        z, doc, msp = dxf_of(fd); T = [e for e in msp if e.dxftype() == 'TEXT']; cl = [e for e in T if e.dxf.layer == 'G-ESAA CABLE LABEL']; geo = rp['geo']
        per = {}
        for e in cl: per.setdefault((e.dxf.text, cellOf(pos(e))), []).append(e)
        hs = sorted({round(e.dxf.height, 2) for e in cl})
        check('B1. the labels as chosen: PROPOSED 72C (RUN 1) and PROPOSED 12C (RUN 2), one a grid, 2.0 m high (smaller only where 2 m does not fit)', {e.dxf.text for e in cl} == {'PROPOSED 72C (RUN 1)', 'PROPOSED 12C (RUN 2)'} and all(len(v) == 1 for v in per.values()) and hs and hs[-1] == 2.0, ({e.dxf.text for e in cl}, {f'{k[0]} {k[1]}': len(v) for k, v in per.items()}, hs))
        hosts = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name in ('X-HOST', 'P-HOST')]; hq = [(e.dxf.insert.x, e.dxf.insert.y) for e in hosts]; att = {a.dxf.tag: a for e in hosts for a in e.attribs}
        bts = [a for e in msp if e.dxftype() == 'INSERT' and 'BTS' in e.dxf.name for a in e.attribs if a.dxf.tag == 'BTS_NAME']
        check('B2. the ODF below the tower, its label ODF-0001 / 48F ODF APC', rp['odfs'][0]['side'] == 'below' and hq and hq[0][1] < tw[1] - 4 and abs(hq[0][0] - tw[0]) < 13 and att['HST_COD'].dxf.text == '48F ODF APC', (rp['odfs'], hq, {k: a.dxf.text for k, a in att.items()}))
        check('B3. the site name on top of the tower', bts and pos(bts[0])[1] > tw[1] + 49, [(b.dxf.text, [round(v, 1) for v in pos(b)]) for b in bts])
        await pg.evaluate("() => { const S = __polecam.S; S.plStyle = { ...S.plStyle, site: { name: 'bottom' } }; __polecam.persist(); }")
        fd = await export(pg, 'doDxf', 'style_c.zip'); z, doc, msp = dxf_of(fd)
        hosts = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name in ('X-HOST', 'P-HOST')]; att = {a.dxf.tag: a for e in hosts for a in e.attribs}
        bts = [a for e in msp if e.dxftype() == 'INSERT' and 'BTS' in e.dxf.name for a in e.attribs if a.dxf.tag == 'BTS_NAME']
        ylo = min(abox(att[k])[0][1] for k in ('HST_NAM', 'HST_COD'))
        check('B4. the site name at the bottom: below the tower, below its ODF and the ODF\'s label too', bts and pos(bts[0])[1] < tw[1] and abox(bts[0])[2][1] < ylo, ([(b.dxf.text, [round(v, 1) for v in pos(b)]) for b in bts], round(ylo, 1)))
        # two cables whose labels read the same (size, type and RUN off): each its own label in each grid (they no longer share one)
        await pg.evaluate("() => { const S = __polecam.S; S.plStyle = { ...S.plStyle, cab: { on: true, per: 1, h: 0, w: { prop: true, size: false, type: false, place: true, foc: false, run: false } } }; __polecam.persist(); }")
        fd = await export(pg, 'doDxf', 'style_d.zip'); rp = await pg.evaluate("window.__rep"); z, doc, msp = dxf_of(fd); geo = rp['geo']
        cl = [e for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer == 'G-ESAA CABLE LABEL']; per = {}
        for e in cl: per.setdefault(cellOf(pos(e)), []).append(e.dxf.text)
        check('B6. two cables whose labels read the same (PROPOSED AE: size, type and RUN off): each keeps its own label in each grid', {e.dxf.text for e in cl} == {'PROPOSED AE'} and per and all(len(v) == 2 for v in per.values()), {str(k): len(v) for k, v in per.items()})
        # Drawing style: the new rows, what the label reads (a UG cable: UG once), Defaults back to up to 3 and the full words
        await pg.click('#drawBtn'); await W(pg, 2000); await pg.click('#drawSetBtn'); await W(pg, 500); await pg.click('#psStyle'); await W(pg, 800)
        r1 = await pg.inner_text('#stCabReads'); per1 = await pg.evaluate("() => [...document.querySelectorAll('#stCabPer .chip')].map((b) => b.getAttribute('aria-pressed'))")
        await pg.click('#stReset'); await W(pg, 600); r2 = await pg.inner_text('#stCabReads'); per2 = await pg.evaluate("() => [...document.querySelectorAll('#stCabPer .chip')].map((b) => b.getAttribute('aria-pressed'))")
        sn = await pg.evaluate("() => ['stSiteName', 'stOdfPlace', 'stOdfLbl'].map((id) => [...document.querySelectorAll(`#${id} .chip`)].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.v)[0])")
        check('B5. Drawing style: what the label reads as set (PROPOSED AE for the aerial cables, PROPOSED UG for a UG cable, with size, type and RUN off); Defaults: up to 3, PROPOSED 72C FIG-8 AE (RUN 1), PROPOSED 144C UG (RUN 3); Auto, Auto, ID + size',
              r1 == 'Reads: PROPOSED AE · PROPOSED AE · PROPOSED UG' and per1 == ['true', 'false', 'false'] and 'PROPOSED 72C FIG-8 AE (RUN 1)' in r2 and 'PROPOSED 144C UG (RUN 3)' in r2 and 'UG UG' not in r2 and per2 == ['false', 'false', 'true'] and sn == ['auto', 'auto', 'size'], (r1, per1, r2, per2, sn))
        await close_sheets(pg)
        # ---- the plan built in a worker (no wrapper): the same labels; the app log says so
        await pg.evaluate(UNWRAP); await pg.evaluate("localStorage.setItem('polecam.log', '[]')")
        fd = await export(pg, 'doDxf', 'worker.zip'); z, doc, msp = dxf_of(fd); await W(pg, 2000)
        cl = {e.dxf.text for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer == 'G-ESAA CABLE LABEL'}
        lg = await pg.evaluate("() => JSON.parse(localStorage.getItem('polecam.log') || '[]').map((x) => x.e)")
        check('F1. the plan built off the screen\'s thread (the worker): its DXF the same kind (the labels, the ODF), the log says plan.worker', 'plan.worker' in lg and cl == {'PROPOSED 72C FIG-8 AE (RUN 1)', 'PROPOSED 12C LIGHT AE (RUN 2)'} and any(e.dxftype() == 'INSERT' and e.dxf.name in ('X-HOST', 'P-HOST') for e in msp), (cl, [x for x in lg if 'plan' in x]))
        # ---- tap a cable in Route: its whole way lit (the one nearest the tap), the span's cables listed
        await close_sheets(pg); await pg.click('#routeBtn'); await W(pg, 1200)
        if await pg.locator('#rtBar [data-rt="mode"][data-v="move"]').count(): await pg.click('#rtBar [data-rt="mode"][data-v="move"]'); await W(pg, 300)
        fa0 = (await pg.evaluate("__polecam.fibState()"))['fibAdd']
        if fa0 is not None: await pg.keyboard.press('Escape'); await W(pg, 600)  # (no cable being drawn: a tap lights a cable)
        if await pg.locator('#rtBar [data-rt="askno"]').count(): await pg.click('#rtBar [data-rt="askno"]'); await W(pg, 500)
        fa1 = (await pg.evaluate("__polecam.fibState()"))['fibAdd']
        a, b = await pg.evaluate("(ids) => ids.map((id) => { const p = __polecam.points.find((q) => q.id === id); return [p.lat, p.lon]; })", [ids['P4'], ids['P5']])
        await pg.evaluate("([a, b]) => __polecam.mapView(a, b, 20)", [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); await W(pg, 1200)
        got = []
        for s_ in (-4, 4):  # (the map may move to show the span after a tap: its place again before each)
            await pg.evaluate("([a, b]) => { __polecam.mapView(a, b, 20); const m = __polecam.map; m.panBy([0, m.getSize().y * 0.25], { animate: false }); }", [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); await W(pg, 900)  # (the span in the upper part: Route tools cover the lower)
            # in the map's own pixels (as Leaflet takes a tap), then to the page
            A, B, off = await pg.evaluate("""([a, b]) => { const m = __polecam.map, A = m.latLngToContainerPoint(a), B = m.latLngToContainerPoint(b), r = m.getContainer().getBoundingClientRect(), X = r.left + 50, Y = r.top + 50, c = m.mouseEventToContainerPoint({ clientX: X, clientY: Y });
              return [[A.x, A.y], [B.x, B.y], [X - c.x, Y - c.y]]; }""", [a, b])
            dx, dy = B[0] - A[0], B[1] - A[1]; Ln = math.hypot(dx, dy); nx, ny = dy / Ln, -dx / Ln; mx, my = (A[0] + B[0]) / 2 + off[0], (A[1] + B[1]) / 2 + off[1]
            onMap = await pg.evaluate("([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('#map'); }", [mx + nx * s_, my + ny * s_])
            await pg.mouse.click(mx + nx * s_, my + ny * s_); await W(pg, 900)
            st = await pg.evaluate("__polecam.fibState()"); yel = await pg.evaluate("() => document.querySelectorAll('.leaflet-pane path[stroke=\"#fab005\"]').length")
            pr = await pg.evaluate("() => [...document.querySelectorAll('#rbSpan .rs-fib')].map((b) => [b.dataset.n, b.getAttribute('aria-pressed')])")
            got.append((st['fibSel'], yel, pr, onMap))
        check('D1. a tap on a cable in Route lights its whole way: the one nearest the tap (each side of the shared span a different cable), no yellow span; the span lists both, the lit one pressed', sorted(g[0] for g in got) == [1, 2] and all(g[1] == 0 for g in got) and all(len(g[2]) == 2 and [x for x in g[2] if x[1] == 'true'] == [[str(g[0]), 'true']] for g in got), (got, fa0, fa1))
        await pg.click('#routeBtn'); await W(pg, 800); await close_sheets(pg)
        # ---- the Drawing: a tap on a cable away from the points lights its run
        await pg.click('#drawBtn'); await W(pg, 2000)
        await pg.evaluate("() => { const v = __polecam.drw.view; v.sc = v.sc * 4; }"); await pg.click('#drawLabels'); await W(pg, 150); await pg.click('#drawLabels'); await W(pg, 600)
        runs = await pg.evaluate("__polecam.drwRuns()"); box = await pg.locator('#drawCanvas').bounding_box()
        tap = None
        for r in runs:
            for L in r['lines']:
                for i in range(1, len(L)):
                    q = ((L[i - 1][0] + L[i][0]) / 2, (L[i - 1][1] + L[i][1]) / 2)
                    if math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]) > 80 and box['x'] + 30 < q[0] < box['x'] + box['width'] - 30 and box['y'] + 30 < q[1] < box['y'] + box['height'] - 30: tap = (r['n'], q); break
                if tap: break
            if tap: break
        if tap: await pg.mouse.click(*tap[1]); await W(pg, 800)
        sel = await pg.evaluate("__polecam.drwSelRun()"); info = await pg.inner_text('#drawInfo') if await pg.locator('#drawInfo:not([hidden])').count() else ''
        check('D2. the Drawing: a tap on a cable away from the points lights its run; the line says RUN n, its cable, its ends', tap and sel == tap[0] and f'RUN {tap[0]}' in info, (tap and tap[0], sel, info[:120]))
        await close_sheets(pg)
        # ---- only the labels near the screen on the map; none below zoom 16
        P = await pg.evaluate("(ids) => ids.map((id) => { const p = __polecam.points.find((q) => q.id === id); return [p.lat, p.lon]; })", [ids[f'P{i}'] for i in range(N)])
        await pg.evaluate("([a, b]) => __polecam.mapView(a, b, 18)", P[5]); await W(pg, 1500)
        def lbl_state():
            return pg.evaluate("""() => { const m = __polecam.map, b = m.getBounds(), tips = [...document.querySelectorAll('#map .leaflet-tooltip.pole-label')].map((t) => t.textContent);
              const inView = __polecam.points.filter((p) => p.project === __polecam.S.project && b.contains([p.lat, p.lon])).map((p) => p.poleId); return { tips, inView, spans: document.querySelectorAll('#map .span-label').length }; }""")
        s1 = await lbl_state()
        await pg.evaluate("([a, b]) => __polecam.mapView(a, b, 18)", P[40]); await W(pg, 1500); s2 = await lbl_state()
        await pg.evaluate("([a, b]) => __polecam.mapView(a, b, 15)", P[40]); await W(pg, 1500); s3 = await lbl_state()
        ok1 = s1['inView'] and all(any(x in t for t in s1['tips']) for x in s1['inView']) and len(s1['tips']) < N
        ok2 = all(any(x in t for t in s2['tips']) for x in s2['inView']) and not any('CC-6005' in t for t in s2['tips'])
        check('E1. the map: every pole on the screen has its label, the ones far off none (a pan: the new ones come, the old go); below zoom 16 none', ok1 and ok2 and not s3['tips'] and s3['spans'] == 0 and s1['spans'] > 0, ({k: (len(v) if isinstance(v, list) else v) for k, v in s1.items()}, {k: (len(v) if isinstance(v, list) else v) for k, v in s2.items()}, len(s3['tips']), s3['spans']))
        # ---- the slow-step recorder, and a start after the app stopped on the screen
        await pg.evaluate("localStorage.setItem('polecam.log', '[]')")
        await pg.evaluate("() => { setTimeout(() => { const t = Date.now(); while (Date.now() - t < 2300) {} }, 50); }"); await W(pg, 4000)
        lg = await pg.evaluate("() => JSON.parse(localStorage.getItem('polecam.log') || '[]').filter((x) => x.e === 'slow.step').map((x) => x.d)")
        check('G1. a block of 2 s or more goes into the app log with what was being done', lg and lg[0]['ms'] >= 2000 and 'during' in lg[0], lg[:2])
        url = pg.url; pg2 = await ctx.new_page(); await pg.close()
        await pg2.goto(url.split('#')[0].rsplit('/', 1)[0] + '/sw.js'); await pg2.evaluate("() => localStorage.setItem('polecam.alive', JSON.stringify({ t: Date.now() - 60000, act: 'moving the map', vis: true, clean: false }))")
        await pg2.goto(url); await W(pg2, 4000)
        st2 = await pg2.evaluate("() => JSON.parse(localStorage.getItem('polecam.log') || '[]').filter((x) => x.e === 'app.stopped').map((x) => x.d)")
        check('G2. the app stopped while on the screen: the next start writes it in the log, with the last step (moving the map)', st2 and st2[-1].get('during') == 'moving the map', st2[-2:])
        pg = pg2
        print('errors', errs[:4]); check('H1. no page errors', not [e for e in errs if 'PAGEERROR' in e], errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
