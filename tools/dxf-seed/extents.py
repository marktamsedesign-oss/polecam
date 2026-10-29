"""Drawing extents of DXF entities (type-aware; INSERTs through their block, nested), for deciding what lies where."""
import math


class Extents:
    def __init__(self, d):
        self.d = d; self.memo = {}
        self.base = {}
        for r in d.recs['BLOCKS']:
            if d.typ(r) == 'BLOCK': self.base[d.get(r, 2)] = (float(d.get(r, 10, 0)), float(d.get(r, 20, 0)))

    def pts(self, r, depth=0):
        d = self.d; P = d.pairs; t = d.typ(r)
        body = P[r[0] + 1:r[1]]
        def pairs_of(cx, cy):
            out, x = [], None
            for c, v in body:
                if c == cx: x = float(v)
                elif c == cy and x is not None: out.append((x, float(v))); x = None
            return out
        if t in ('ATTDEF', 'SEQEND', 'VIEWPORT', 'OLE2FRAME'): return []
        if t == 'LINE': return pairs_of(10, 20) + pairs_of(11, 21)
        if t in ('TEXT', 'ATTRIB', 'MTEXT', 'POINT', 'VERTEX', 'LWPOLYLINE', 'LEADER'): return pairs_of(10, 20)
        if t in ('CIRCLE', 'ARC'):
            (x, y), = pairs_of(10, 20)[:1] or [(0, 0)]; rr = float(d.get(r, 40, 0)); return [(x - rr, y - rr), (x + rr, y + rr)]
        if t == 'ELLIPSE':
            (x, y), = pairs_of(10, 20)[:1]; (mx, my), = pairs_of(11, 21)[:1]; rr = math.hypot(mx, my); return [(x - rr, y - rr), (x + rr, y + rr)]
        if t in ('SOLID', 'TRACE', '3DFACE'): return pairs_of(10, 20) + pairs_of(11, 21) + pairs_of(12, 22) + pairs_of(13, 23)
        if t == 'HATCH': return pairs_of(10, 20)[1:] + pairs_of(11, 21)
        if t == 'SPLINE': return pairs_of(10, 20) + pairs_of(11, 21)
        if t == 'DIMENSION': return pairs_of(10, 20) + pairs_of(11, 21) + pairs_of(13, 23) + pairs_of(14, 24)
        if t == 'MULTILEADER':  # 10/20 include unit vectors; keep points away from the origin
            return [p for p in pairs_of(10, 20) if abs(p[0]) > 2 or abs(p[1]) > 2]
        if t == 'INSERT':
            if depth > 8: return []
            name = d.get(r, 2); bb = self.block(name, depth + 1)
            if not bb: return pairs_of(10, 20)[:1]
            bx, by = self.base.get(name, (0, 0))
            ix, iy = float(d.get(r, 10, 0)), float(d.get(r, 20, 0))
            sx, sy = float(d.get(r, 41, 1)), float(d.get(r, 42, 1)); a = math.radians(float(d.get(r, 50, 0)))
            ez = float(d.get(r, 230, 1)); cs, sn = math.cos(a), math.sin(a)
            out = []
            for X, Y in ((bb[0], bb[1]), (bb[2], bb[1]), (bb[0], bb[3]), (bb[2], bb[3])):
                dx, dy = (X - bx) * sx, (Y - by) * sy
                x, y = ix + dx * cs - dy * sn, iy + dx * sn + dy * cs
                out.append((-x if ez < 0 else x, y))
            return out
        return pairs_of(10, 20)

    def block(self, name, depth=0):
        if name in self.memo: return self.memo[name]
        self.memo[name] = None  # recursion guard
        b = self.d.blocks.get(name)
        if not b: return None
        xs, ys = [], []
        for r in b['ents']:
            for x, y in self.pts(r, depth):
                xs.append(x); ys.append(y)
        bb = (min(xs), min(ys), max(xs), max(ys)) if xs else None
        self.memo[name] = bb
        return bb

    def bbox(self, r):
        p = self.pts(r)
        if not p: return None
        xs = [q[0] for q in p]; ys = [q[1] for q in p]
        return (min(xs), min(ys), max(xs), max(ys))
