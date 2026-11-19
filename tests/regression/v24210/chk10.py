# v2.42.11: (10) the street names black and slanted; the tower's name 3 m high at most, covering neither the cable nor another text
def _em(ch):  # Arial Bold widths (em); v2.42.13: the tower's name measured as AutoCAD draws it
    if ch in 'MW': return 0.833 if ch == 'M' else 0.944
    if ch in 'IJ': return 0.278 if ch == 'I' else 0.556
    if ch in 'EFLTZ': return 0.611
    if ch in 'GOQ': return 0.778
    if ch in 'PS': return 0.667
    if ch.isupper(): return 0.722
    if ch.isdigit() or ch == '_': return 0.556
    if ch in ' .,': return 0.278
    return 0.611 if ch.islower() else 0.333
def _tbox(e, cw=0.62, exact=False):
    import math
    t = e.dxf.text or ''; h = e.dxf.height; wf = e.dxf.get('width', 1) or 1
    w = (sum(_em(c) for c in t) * h / 0.716 * wf) if exact else max(1, len(t)) * h * cw * wf
    ha = e.dxf.get('halign', 0); va = e.dxf.get('valign', 0)
    p = e.dxf.align_point if (ha or va) else e.dxf.insert; a = math.radians(e.dxf.get('rotation', 0)); ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux
    du = 0 if ha in (1, 4) else -w / 2 if ha == 2 else w / 2; dv = 0 if va == 2 else -h / 2 if va == 3 else h / 2
    return (p.x + ux * du + vx * dv, p.y + uy * du + vy * dv, w / 2, h / 2, ux, uy)
def _corners(b):
    cx, cy, hw, hh, ux, uy = b; vx, vy = -uy, ux
    return [(cx + ux * hw * s + vx * hh * t, cy + uy * hw * s + vy * hh * t) for s, t in ((1, 1), (1, -1), (-1, -1), (-1, 1))]
def _sat(P, Q):
    for poly in (P, Q):
        for i in range(len(poly)):
            x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % len(poly)]; nx, ny = y1 - y2, x2 - x1
            a = [nx * x + ny * y for x, y in P]; b = [nx * x + ny * y for x, y in Q]
            if max(a) < min(b) or max(b) < min(a): return False
    return True
def check10(doc, msp, SEED_H, check, streets=True):
    st = [e for e in msp if e.dxftype() == 'TEXT' and e.dxf.layer == 'STREET NAME' and e.dxf.handle not in SEED_H]
    towers = [e for e in msp if e.dxftype() == 'INSERT' and e.dxf.name in ('X-BTS', 'G-ESAA P-BTS') and e.dxf.handle not in SEED_H]
    names = [a for t in towers for a in t.attribs if a.dxf.tag == 'BTS_NAME' and (a.dxf.text or '').strip()]
    cable = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and e.dxf.handle not in SEED_H and e.dxf.get('lineweight', -1) == 70]
    roads = [e for e in msp if e.dxftype() == 'LWPOLYLINE' and e.dxf.handle not in SEED_H and e.dxf.layer == 'ROAD PAVEMENT' and e.dxf.get('color', 256) != 8]  # v2.42.13: the road edges
    texts = [e for e in msp if e.dxftype() == 'TEXT' and e.dxf.handle not in SEED_H and e.dxf.layer not in ('STREET NAME',)] + [a for e in msp if e.dxftype() == 'INSERT' and e.dxf.handle not in SEED_H for a in e.attribs if (a.dxf.text or '').strip() and a.dxf.tag != 'BTS_NAME' and not (a.dxf.flags & 1)]
    hits = []
    for a in names:
        B = _corners(_tbox(a, exact=True)); x0 = min(p[0] for p in B) - 60; x1 = max(p[0] for p in B) + 60; y0 = min(p[1] for p in B) - 60; y1 = max(p[1] for p in B) + 60
        for kind, L in (('cable', cable), ('road edge', roads)):
          for c in L:
            pts = [(p[0], p[1]) for p in c.get_points('xy')]
            if c.closed and pts: pts = pts + [pts[0]]
            for i in range(1, len(pts)):
                (ax, ay), (bx, by) = pts[i - 1], pts[i]
                if max(ax, bx) < x0 or min(ax, bx) > x1 or max(ay, by) < y0 or min(ay, by) > y1: continue
                if _sat(B, [(ax, ay), (bx, by)]): hits.append((kind, a.dxf.text)); break
        for t in texts:
            q = t.dxf.align_point if (t.dxf.get('halign', 0) or t.dxf.get('valign', 0)) else t.dxf.insert
            if not (x0 <= q.x <= x1 and y0 <= q.y <= y1): continue
            if _sat(B, _corners(_tbox(t, 0.55))): hits.append(('text', a.dxf.text, t.dxf.text))
    check('10. (v2.42.11, .13) the street names black and slanted 15°; the tower\'s name 3 m high at most, covering neither the cable, a road edge nor another label (its width as AutoCAD draws it)',
          (not streets or (st and all(e.dxf.get('color', 256) == 7 and abs(e.dxf.get('oblique', 0) - 15) < 1e-6 for e in st))) and names and all(a.dxf.height <= 3.0 + 1e-6 for a in names) and not hits,
          (len(st), sorted({(e.dxf.get('color', 256), e.dxf.get('oblique', 0)) for e in st})[:3], [(a.dxf.text, round(a.dxf.height, 2)) for a in names], hits[:5]))
