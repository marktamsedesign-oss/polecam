"""(v2.42.28 copy: Drawing style opens from Plan settings on the Drawing.)
v2.42.26 copy (the labels read AE: PROPOSED 12C LIGHT AE, PROPOSED 72C FIG-8 AE, EXISTING 48C AE; the style summary as of v2.42.26) of the v2.42.24 copy (the labels say size and type: PROPOSED 12C LIGHT, PROPOSED 72C FIG-8). v2.42.21 (synthetic data only): clamp types and cable labels on the plan, in the drawing design style.
 The synthetic As-Plan of v2.42.20 (F1 72C ODF-01 -> CL-0001; F2, F3 12C sharing C0 -> S1 -> S2, then east / west; F4 an existing
 cable, here 48C; a span on no fiber). The plan DXF: default (clamp types in the pole label as before, a 12C-only pole's hardware
 RET×2 SC×4 there, a telco arm's JH×2 SC×4; the cable label along each span: PROPOSED 72C, PROPOSED 2×12C on the shared spans,
 PROPOSED 12C on the span on no fiber, EXISTING 48C on the existing cable's steps); a tag (own layer G-ESAA POLE CLAMP, red, boxed,
 not in the label); a callout (a leader line); PROPOSED 12C ×2 wording; cable labels off. The style sheet (the chips, the CA button
 follows, Defaults), the Drawing (no errors)."""
import asyncio, sys, os, shutil, json, math, zipfile, io, re
import os as _os; S = _os.environ.get('GESAA_WS') or _os.path.abspath(__file__).split('/tests/regression/')[0] + '/tests/regression'; APP = _os.environ.get('GESAA_APP') or _os.path.dirname(_os.path.dirname(S)); PRIV = _os.environ.get('GESAA_PRIVATE') or '/nonexistent-private'  # (tests/run_all.py sets these)
sys.path.insert(0, S + '/v17'); sys.path.insert(0, S + '/ext/ezdxf/src')
import common, ezdxf
from playwright.async_api import async_playwright
src = open(S + '/v24220/t24220b.py').read().split('\nasync def main():')[0]
exec(compile(src, 't24220b_head', 'exec'))  # synth, ADD, check, W, close_sheets, export, new_ctx, setup, SEED_H, checks
OUT = S + '/v24228/out_221b_v28'; shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
BASE = os.environ.get('BASE', 'http://localhost:8765')
WRAP = """() => { const wrap = (T) => { if (!T || T.__w) return T; const ob = T.build; T.build = function (seed, job) { window.__job = { spans: job.spans.map((s) => ({ ia: s.ia, ib: s.ib, cabLbl: s.cabLbl })), exSpans: job.exSpans, hw: job.pts.filter((p) => p.hw).map((p) => [p.poleId, p.hw]), cs: job.clampStyle, cl: job.cabLabels, cell: job.cell || 440 }; const out = ob.apply(this, arguments); window.__job.geo = out && out.report && out.report.grid ? out.report.grid.geo : null; return out; }; T.__w = true; return T; };
  if (window.GeDxfTpl) wrap(window.GeDxfTpl); else { let v; Object.defineProperty(window, 'GeDxfTpl', { configurable: true, get: () => v, set: (x) => { v = wrap(x); } }); } }"""
def read_dxf(fd):
    z = zipfile.ZipFile(fd); dn = [n for n in z.namelist() if n.endswith('.dxf')]; raw = z.read(dn[0]).decode('utf-8', 'replace')
    doc = ezdxf.read(io.StringIO(raw.replace('\r\n', '\n'))); return [e for e in doc.modelspace() if e.dxf.handle not in SEED_H]
def txt(e): return e.dxf.text if e.dxftype() == 'TEXT' else e.text

async def main():
    async with async_playwright() as p:
        ctx, pg, errs = await new_ctx(p, OUT + '/ud_a'); await setup(pg, 'Juan Dela Cruz', 'juan.delacruz@example.com')
        recs, links, fib = synth(); fib[3]['cores'] = 48
        await common.newproj(pg, 'survey', 'FIBERS_PLAN', purpose='As-plan'); await close_sheets(pg)
        ids = await pg.evaluate(ADD, ['FIBERS_PLAN', recs, links, fib]); kof = {v: k for k, v in ids.items()}; pid = {r['k']: r['poleId'] for r in recs}
        await pg.evaluate(WRAP); await pg.evaluate("__polecam.setDxfRows([{ pts: ['*'], mode: 'num' }])")
        CL = await pg.evaluate("__polecam.clamps()"); clp = {kof[k]: v for k, v in CL.items()}
        # ---- default: clamp types in the label; the hardware there too; the cable labels
        fd = await export(pg, 'doDxf', 'plan_default.zip'); job = await pg.evaluate("window.__job"); msp = read_dxf(fd)
        L = lambda a, b: [s for s in job['spans'] if {kof[s['ia']], kof[s['ib']]} == {a, b}][0]['cabLbl']
        hw = dict(job['hw'])
        check('F1. the job: the cable labels (C0→S1 PROPOSED 2×12C, the feeder PROPOSED 72C, C0→X1 on no fiber PROPOSED 12C, the existing cable EXISTING 48C once a step); the hardware of the 12C-only poles (S1 RET×2 SC×4, R1 RET×2 SC×2, R12 RET×1 SC×1, the telco arm S2 JH×2 SC×4); none on C0 (pole clamps); the clamp style: in the label',
              L('C0', 'S1') == [{'t': 'PROPOSED 2×12C LIGHT AE', 'ex': False}] and L('P300', 'P350') == [{'t': 'PROPOSED 72C FIG-8 AE', 'ex': False}] and L('C0', 'X1') == [{'t': 'PROPOSED 12C LIGHT AE', 'ex': False}]
              and [s.get('cabLbl') for s in job['exSpans']] == [[{'t': 'EXISTING 48C AE', 'ex': True}]] * 3
              and hw.get(pid['S1']) == 'RET×2 SC×4' and hw.get(pid['R1']) == 'RET×2 SC×2' and hw.get(pid['R12']) == 'RET×1 SC×1' and hw.get(pid['S2']) == 'JH×2 SC×4' and pid['C0'] not in hw
              and job['cs'].get('place') == 'label' and job['cl'] is True, (job['exSpans'], job['hw'], job['cs']))
        cab = [e for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer == 'G-ESAA CABLE LABEL']; ct = [txt(e) for e in cab]
        red = [e for e in cab if txt(e) == 'PROPOSED 72C FIG-8 AE (RUN 1)']; blu = [e for e in cab if txt(e) == 'EXISTING 48C AE (RUN 4)']
        def qpos(e): q = e.dxf.align_point if (e.dxf.get('halign', 0) or e.dxf.get('valign', 0)) else e.dxf.insert; return (q[0], q[1])
        G = job.get('geo'); cel = job.get('cell', 440); per = {}
        for e in cab:
            if G: q = qpos(e); per.setdefault((txt(e), math.floor((q[0] - G[0]) / cel), math.floor((q[1] - G[1]) / cel)), []).append(q)
        over = {k: len(v) for k, v in per.items() if len(v) > 3}  # (v2.42.26: up to 3 by default)
        check('F2. (v2.42.25) the DXF: each cable its own label with its run on its own layer: PROPOSED 12C (RUN 2) and (RUN 3) (no PROPOSED 2×12C), PROPOSED 72C (RUN 1) on the feeder (red), EXISTING 48C (RUN 4) on the existing cable (blue), PROPOSED 12C on the span on no fiber; at most 3 for a cable in a grid (v2.42.26)',
              ct.count('PROPOSED 2×12C') == 0 and len(red) >= 1 and all(e.dxf.color == 1 for e in red) and len(blu) >= 1 and all(e.dxf.color == 5 for e in blu) and ct.count('PROPOSED 12C LIGHT AE (RUN 2)') >= 1 and ct.count('PROPOSED 12C LIGHT AE (RUN 3)') >= 1 and ct.count('PROPOSED 12C LIGHT AE') == 1
              and G and not over and len(ct) < 14 + 3 + 20, ({t_: ct.count(t_) for t_ in set(ct)}, over))
        T = [txt(e) for e in msp if e.dxftype() == 'TEXT']
        check('F3. the pole labels keep their clamp types (e.g. CC-1000\'s), and a 12C-only pole its hardware (RET×2 SC×4); no clamp tags', clp['P0'] in T and 'RET×2 SC×4' in T and 'JH×2 SC×4' in T and not any(e.dxf.layer == 'G-ESAA POLE CLAMP' for e in msp), (clp['P0'], [t for t in T if 'RET' in t or 'JH' in t][:6]))
        # ---- a tag: red, boxed, on its own layer; not in the label
        await pg.evaluate("() => { const S = __polecam.S; S.plStyle = { ...(S.plStyle || {}), clamp: { place: 'tag', pos: 'auto', color: 1, h: 2, box: true, hw: true }, cab: { on: true, word: 'b' } }; __polecam.persist(); }")
        fd = await export(pg, 'doDxf', 'plan_tag.zip'); job = await pg.evaluate("window.__job"); msp = read_dxf(fd)
        tag = [e for e in msp if e.dxf.layer == 'G-ESAA POLE CLAMP']; tt = [txt(e) for e in tag if e.dxftype() == 'TEXT']; boxes = [e for e in tag if e.dxftype() == 'LWPOLYLINE' and e.closed]
        lab = [txt(e) for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer != 'G-ESAA POLE CLAMP']
        ncl = sum(1 for v in clp.values() if v)
        check('F4. a tag: each pole\'s clamp types and each 12C-only pole\'s hardware on layer G-ESAA POLE CLAMP, red, boxed; not in the pole labels any more',
              job['cs']['place'] == 'tag' and clp['P0'] in tt and 'RET×2 SC×4' in tt and all(e.dxf.color == 1 for e in tag) and len(boxes) == len(tt) and len(tt) >= ncl
              and clp['P0'] not in lab and 'RET×2 SC×4' not in lab, (len(tt), ncl, len(boxes), tt[:8]))
        ct = [txt(e) for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer == 'G-ESAA CABLE LABEL']
        check('F5. (v2.42.25) no combined wording whatever the old setting: each cable its own PROPOSED 12C', ct.count('PROPOSED 12C ×2') == 0 and 'PROPOSED 2×12C' not in ct and {'PROPOSED 12C LIGHT AE (RUN 2)', 'PROPOSED 12C LIGHT AE (RUN 3)', 'PROPOSED 12C LIGHT AE'} <= set(ct), {t: ct.count(t) for t in set(ct)})
        # ---- a callout: a leader line each; then the cable labels off
        await pg.evaluate("() => { const S = __polecam.S; S.plStyle = { ...S.plStyle, clamp: { ...S.plStyle.clamp, place: 'callout', color: 0, box: false }, cab: { on: false, word: 'a' } }; __polecam.persist(); }")
        fd = await export(pg, 'doDxf', 'plan_callout.zip'); msp = read_dxf(fd)
        tag = [e for e in msp if e.dxf.layer == 'G-ESAA POLE CLAMP']; tt = [e for e in tag if e.dxftype() == 'TEXT']; lead = [e for e in tag if e.dxftype() == 'LWPOLYLINE' and not e.closed and len(e) == 2]
        check('F6. a callout: a leader line to each pole, no box, by layer; cable labels off: none', len(lead) == len(tt) and len(tt) >= ncl and not any(e.dxftype() == 'LWPOLYLINE' and e.closed for e in tag) and all(e.dxf.color == 256 for e in tt)
              and not any(e.dxf.layer == 'G-ESAA CABLE LABEL' for e in msp), (len(lead), len(tt), [e.dxf.color for e in tt][:4]))
        # ---- the style sheet and the Drawing
        await pg.evaluate("() => { delete __polecam.S.plStyle; __polecam.persist(); }")
        await close_sheets(pg); await pg.click('#drawBtn'); await W(pg, 1500)
        await pg.screenshot(path=OUT + '/drawing.png')
        await pg.click('#drawSetBtn'); await W(pg, 500); await pg.click('#psStyle'); await W(pg, 600)
        await pg.locator('#stCl').scroll_into_view_if_needed(); await pg.screenshot(path=OUT + '/style.png')
        await pg.click('#stClPlace .chip[data-v="callout"]'); await pg.click('#stClPos .chip[data-v="up"]'); await pg.click('#stClCol button[aria-label^="red"]'); await W(pg, 300)
        st = await pg.evaluate("__polecam.S.plStyle")
        sm = await pg.inner_text('#stSum')
        check('G1. the style sheet: callout, above, red kept (the drawing design style); its summary says so; (v2.42.23) no two-of-one-cable wording any more', st['clamp']['place'] == 'callout' and st['clamp']['pos'] == 'up' and st['clamp']['color'] == 1 and 'callout' in sm and 'up to 3 for each cable in a grid' in sm and not await pg.locator('#stCabWord').count(), (st, sm[:200]))
        await pg.screenshot(path=OUT + '/style_callout.png')
        await pg.click('#stClOn .chip[data-v="0"]'); await W(pg, 300)
        off = await pg.evaluate("__polecam.S.exp.dxfClampType")
        await pg.click('#stReset'); await W(pg, 300)
        st2 = await pg.evaluate("[__polecam.S.plStyle || null, __polecam.S.exp.dxfClampType]")
        check('G2. clamp types off from the style (the Drawing\'s CA button the same setting); Defaults: in the label, on again', off is False and st2[0] is None and st2[1] is True, (off, st2))
        await close_sheets(pg); await W(pg, 400)
        await pg.evaluate("() => { const S = __polecam.S; S.plStyle = { clamp: { place: 'tag', pos: 'auto', color: 1, h: 2, box: true, hw: true } }; __polecam.persist(); }")
        await pg.click('#drawBtn'); await W(pg, 1200); await pg.screenshot(path=OUT + '/drawing_tag.png')
        check('G9. no page errors', not errs, errs[:4])
        await ctx.close()
    print(f'{sum(checks)}/{len(checks)} passed' if all(checks) else f'FAILED {len(checks) - sum(checks)} of {len(checks)}', flush=True)
asyncio.run(main())
