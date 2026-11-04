"""AutoCAD acceptance check of a plan DXF exported by G-eSAA (v2.42.8; v2.42.9: MTEXT embedded objects; v2.42.10: viewport frozen layers). Standard library only; nothing in the file is executed.
    python3 -I check_plan.py plan.dxf [--margin 2000] [--list 20]
Exit status 0 when no problem is found, 1 otherwise.

What AutoCAD for Mac refused in the LibreDWG-made template, and what the export must get right (the team's task list, section 5):
  file       UTF-8, CRLF line ends, group codes and values of the right type, ends with EOF
  handles    no duplicate; every pointer (320-369, 390) resolves, in the header too; $HANDSEED above the largest handle
  tables     one VPORT only, named *Active
  attributes INSERT (66 1) then its ATTRIBs then SEQEND; an ATTRIB has only AcDbEntity / AcDbText / AcDbAttribute (no AcDbXrecord)
  entities   no REGION / 3DSOLID / BODY without an ACDSDATA section; no MULTILEADER; owners are their space or block; a
             VIEWPORT's frozen layers under 331 (not 341)
  objects    no GEODATA, SUN, VISUALSTYLE, TABLESTYLE, MLEADERSTYLE...; SORTENTSTABLE has its block record (330) right after
             its subclass marker
  images     every IMAGEDEF used by an IMAGE and named in ACAD_IMAGE_DICT, with a plain file name (no folder); each IMAGE
             points to its IMAGEDEF (340) and its own IMAGEDEF_REACTOR (360)
  texts      no MTEXT whose width (41) is below 20 % of its text's width; no ^J in MTEXT; an MTEXT's embedded object (101) as
             AutoCAD reads it (10 its direction: LibreDWG swaps it with the insertion; none with one column, which AutoCAD lays out
             from its corner); no @@ field left; no sample project
             text ("NSB PROJECT", "LittleBaguio"...); no Vineta BT font
  placement  model space within the plan (grid and vicinity map) plus the margin, drawn geometry and insertion points both;
             $EXTMIN / $EXTMAX round the plan; the *Active VPORT opens on it
"""
import sys, math, re, collections, argparse

DROP_OBJ = {'GEODATA', 'SUN', 'VISUALSTYLE', 'TABLESTYLE', 'MLEADERSTYLE', 'ACDBSECTIONVIEWSTYLE', 'ACDBDETAILVIEWSTYLE',
            'ACDB_DYNAMICBLOCKPURGEPREVENTER_VERSION'}
OLD_TEXT = re.compile(r'NSB PROJECT|LITTLE ?BAGUIO|DAVAO ?OCCIDENTAL|MARAND_MIN\d', re.I)
PTR = lambda c: 320 <= c <= 369 or c == 390


def kind(c):  # the value type of a group code (DXF reference)
    if 0 <= c <= 9 or c in (100, 102, 105, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419,
                            430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 999) or 1000 <= c <= 1009:
        return 'str'
    if 10 <= c <= 59 or 110 <= c <= 149 or 210 <= c <= 239 or 460 <= c <= 469 or 1010 <= c <= 1059: return 'float'
    if 60 <= c <= 99 or 160 <= c <= 179 or 270 <= c <= 299 or 370 <= c <= 389 or 400 <= c <= 409 or 420 <= c <= 429 or 440 <= c <= 459 or 1060 <= c <= 1071: return 'int'
    if 310 <= c <= 319 or 1004 == c: return 'hex'
    if PTR(c) or c in (480, 481): return 'handle'
    return 'str'


def load(path, probs):
    raw = open(path, 'rb').read()
    try: text = raw.decode('utf-8')
    except UnicodeDecodeError as e: probs['file'].append(f'not UTF-8: {e}'); text = raw.decode('utf-8', 'replace')
    if '\r\n' not in text: probs['file'].append('line ends are not CRLF')
    elif text.count('\n') != text.count('\r\n'): probs['file'].append(f'{text.count(chr(10)) - text.count(chr(13) + chr(10))} line(s) end with LF only')
    L = text.replace('\r\n', '\n').split('\n')
    if L and L[-1] == '': L.pop()
    if len(L) % 2: probs['file'].append('odd number of lines')
    P = []
    for i in range(0, len(L) - 1, 2):
        try: c = int(L[i])
        except ValueError: probs['file'].append(f'line {i + 1}: group code {L[i]!r}'); continue
        v = L[i + 1]; k = kind(c)
        try:
            if k == 'float': float(v)
            elif k == 'int': int(v)
            elif k == 'hex' and v.strip(): int(v.strip(), 16)
            elif k == 'handle' and v.strip(): int(v.strip(), 16)
        except ValueError:
            if len(probs['file']) < 50: probs['file'].append(f'line {i + 2}: code {c} value {v[:30]!r} is not {k}')
        P.append((c, v))
    if not P or P[-1] != (0, 'EOF'): probs['file'].append('does not end with 0 EOF')
    secs, cur, sec = {}, None, None
    for c, v in P:
        if c == 0:
            if v == 'SECTION': sec = None; cur = None; continue
            if v == 'ENDSEC': sec = None; cur = None; continue
            if v == 'EOF': break
            cur = [(c, v)]; secs[sec].append(cur)
        elif c == 2 and sec is None and cur is None: sec = v; secs[sec] = []; cur = None
        elif cur is not None: cur.append((c, v))
        elif sec is not None:  # HEADER / CLASSES: one pseudo record of pairs
            if not secs[sec]: secs[sec].append([(0, '#' + sec)])
            secs[sec][0].append((c, v))
    return secs


def g(r, c, d=None): return next((v for k, v in r[1:] if k == c), d)
def ga(r, c): return [v for k, v in r[1:] if k == c]
def gf(r, c, d=0.0):
    v = g(r, c)
    try: return float(v) if v is not None else d
    except ValueError: return d
def typ(r): return r[0][1]
def handle(r): return (g(r, 105) if typ(r) == 'DIMSTYLE' else g(r, 5))
def owner(r):
    grp = False
    for c, v in r[1:]:
        if c == 102: grp = v.startswith('{'); continue
        if c == 330 and not grp: return v
    return None
def text_of(r): return ''.join(ga(r, 3)) + (g(r, 1) or '')
def mtext_lines(s):
    s = re.sub(r'\\\\', '\\\\', s); s = re.sub(r'\\[{}]', 'x', s); s = re.sub(r'\\p[^;]*;', '', s); s = re.sub(r'\\[fFcCHhWwAaQqTt][^;]*;', '', s)
    s = re.sub(r'\\S([^;]*);', lambda m: re.sub(r'[\^#/]', ' ', m.group(1)), s); s = re.sub(r'\\[LlOoKk]', '', s); s = re.sub(r'\\[PN]', '\n', s)
    s = s.replace('\\~', ' ').replace('{', '').replace('}', '').replace('^J', '\n').replace('^I', ' ')
    return s.split('\n')
def mtext_own(r, c):  # a code of the MTEXT itself (before its embedded object)
    k = next((i for i, p in enumerate(r) if p == (100, 'AcDbMText')), None)
    if k is None: return None
    for cc, v in r[k + 1:]:
        if cc in (100, 101): return None
        if cc == c: return v
    return None


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('dxf'); ap.add_argument('--margin', type=float, default=2000); ap.add_argument('--list', type=int, default=12)
    A = ap.parse_args()
    probs = collections.defaultdict(list)
    S = load(A.dxf, probs)
    for n in ('HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'):
        if n not in S: probs['file'].append(f'section {n} missing')
    H = S.get('HEADER', [[(0, '#')]])[0]
    hvars = {}
    for i, (c, v) in enumerate(H):
        if c == 9: hvars[v] = i
    def hv(name):
        i = hvars.get(name)
        if i is None: return []
        out = []
        for c, v in H[i + 1:]:
            if c == 9: break
            out.append((c, v))
        return out
    RECS = [(n, r) for n in ('TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS') for r in S.get(n, [])]
    # handles
    seen = collections.Counter(handle(r) for n, r in RECS if handle(r))
    for h, k in seen.items():
        if k > 1: probs['handles'].append(f'duplicate handle {h} ({k} times)')
    live = set(seen)
    for n, r in RECS:
        for c, v in r[1:]:
            if PTR(c) and v.strip() not in ('0', '') and v.strip() not in live: probs['handles'].append(f'{typ(r)} {handle(r)}: code {c} -> {v} missing')
    for name, i in hvars.items():
        for c, v in hv(name):
            if PTR(c) and v.strip() not in ('0', '') and v.strip() not in live: probs['handles'].append(f'header {name}: code {c} -> {v} missing')
    hs = hv('$HANDSEED'); mx = max((int(h, 16) for h in live), default=0)
    if not hs or int(hs[0][1], 16) <= mx: probs['handles'].append(f'$HANDSEED {hs[0][1] if hs else "missing"} not above the largest handle {mx:X}')
    # tables
    vps = [r for r in S.get('TABLES', []) if typ(r) == 'VPORT']
    if len(vps) != 1 or (g(vps[0], 2) or '').upper() != '*ACTIVE': probs['tables'].append(f'VPORT records: {[g(r, 2) for r in vps]} (one *Active wanted)')
    br = {handle(r): g(r, 2) for r in S.get('TABLES', []) if typ(r) == 'BLOCK_RECORD'}; br_by = {v: k for k, v in br.items()}
    model_h, paper_h = br_by.get('*Model_Space'), br_by.get('*Paper_Space')
    if not model_h or not paper_h: probs['tables'].append('*Model_Space or *Paper_Space block record missing')
    # attributes, entities, owners
    has_acds = 'ACDSDATA' in S
    blocks = {}; cur = None; blk_of = {}
    for r in S.get('BLOCKS', []):
        t = typ(r)
        if t == 'BLOCK': cur = {'name': g(r, 2), 'base': (gf(r, 10), gf(r, 20)), 'ents': []}; blocks[cur['name']] = cur; continue
        if t == 'ENDBLK': cur = None; continue
        if cur is not None: cur['ents'].append(r); blk_of[id(r)] = cur['name']
    for n in ('BLOCKS', 'ENTITIES'):
        rs = S.get(n, [])
        for k, r in enumerate(rs):
            t = typ(r)
            if t in ('REGION', '3DSOLID', 'BODY') and not has_acds: probs['entities'].append(f'{t} {handle(r)} without an ACDSDATA section')
            if t == 'MULTILEADER': probs['entities'].append(f'MULTILEADER {handle(r)}')
            if t == 'VIEWPORT' and any(c == 341 for c, v in r):  # v2.42.10: frozen layers go under 331; AutoCAD reads none under 341
                probs['entities'].append(f'VIEWPORT {handle(r)}: frozen layers under 341 (AutoCAD reads 331: nothing frozen on that sheet)')
            if t in ('ATTRIB', 'ATTDEF'):
                subs = [v for c, v in r[1:] if c == 100]
                if 'AcDbXrecord' in subs: probs['attributes'].append(f'{t} {handle(r)} holds AcDbXrecord')
                if t == 'ATTRIB' and [s for s in subs if s not in ('AcDbEntity', 'AcDbText', 'AcDbAttribute')]: probs['attributes'].append(f'ATTRIB {handle(r)} subclasses {subs}')
            if t == 'INSERT' and (g(r, 66) or '').strip() == '1':
                j = k + 1
                while j < len(rs) and typ(rs[j]) == 'ATTRIB':
                    if owner(rs[j]) != handle(r): probs['attributes'].append(f'ATTRIB {handle(rs[j])} not owned by its INSERT {handle(r)}')
                    j += 1
                if j >= len(rs) or typ(rs[j]) != 'SEQEND': probs['attributes'].append(f'INSERT {handle(r)}: attributes not closed by SEQEND')
            if t == 'ATTRIB' and (k == 0 or typ(rs[k - 1]) not in ('INSERT', 'ATTRIB')): probs['attributes'].append(f'stray ATTRIB {handle(r)}')
            if t in ('ATTRIB', 'SEQEND', 'VERTEX', 'BLOCK', 'ENDBLK'): continue
            want = (paper_h if (g(r, 67) or '0').strip() == '1' else model_h) if n == 'ENTITIES' else br_by.get(blk_of.get(id(r)))
            if owner(r) != want: probs['entities'].append(f'{t} {handle(r)} owner {owner(r)} (its space or block: {want})')
    # objects
    byh = {handle(r): r for n, r in RECS if handle(r)}
    for r in S.get('OBJECTS', []):
        t = typ(r)
        if t in DROP_OBJ: probs['objects'].append(f'{t} {handle(r)}')
        if t == 'SORTENTSTABLE':
            k = next((i for i, p in enumerate(r) if p == (100, 'AcDbSortentsTable')), None)
            if k is None or k + 1 >= len(r) or r[k + 1][0] != 330 or typ(byh.get(r[k + 1][1], [(0, '')])) != 'BLOCK_RECORD':
                probs['objects'].append(f'SORTENTSTABLE {handle(r)}: no block record (330) after its subclass marker')
    # images
    root = S.get('OBJECTS', [[(0, '')]])[0]
    pairs = list(zip(ga(root, 3), ga(root, 350) + ga(root, 360))) if typ(root) == 'DICTIONARY' else []
    idict = byh.get(dict(pairs).get('ACAD_IMAGE_DICT'))
    named = set(ga(idict, 350) + ga(idict, 360)) if idict else set()
    images = [r for n in ('BLOCKS', 'ENTITIES') for r in S.get(n, []) if typ(r) == 'IMAGE']
    used = set(g(r, 340) for r in images)
    for r in S.get('OBJECTS', []):
        if typ(r) != 'IMAGEDEF': continue
        h = handle(r); f = g(r, 1) or ''
        if h not in used: probs['images'].append(f'IMAGEDEF {h} ({f}) not used by any IMAGE')
        if h not in named: probs['images'].append(f'IMAGEDEF {h} ({f}) not named in ACAD_IMAGE_DICT')
        if re.search(r'[\\/:]', f): probs['images'].append(f'IMAGEDEF {h}: file name with a folder: {f}')
    for r in images:
        d0 = byh.get(g(r, 340)); rx = byh.get(g(r, 360))
        if not d0 or typ(d0) != 'IMAGEDEF': probs['images'].append(f'IMAGE {handle(r)}: 340 is not an IMAGEDEF')
        if not rx or typ(rx) != 'IMAGEDEF_REACTOR' or owner(rx) != handle(r): probs['images'].append(f'IMAGE {handle(r)}: 360 is not its IMAGEDEF_REACTOR')
    # texts
    for n in ('BLOCKS', 'ENTITIES'):
        for r in S.get(n, []):
            t = typ(r)
            if t not in ('TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'): continue
            s = text_of(r)
            if '@@' in s and re.search(r'@@\w+@@', s): probs['texts'].append(f'{t} {handle(r)}: field left: {s[:50]!r}')
            if OLD_TEXT.search(s): probs['texts'].append(f'{t} {handle(r)}: sample project text: {s[:60]!r}')
            if t != 'MTEXT': continue
            if '^J' in s: probs['texts'].append(f'MTEXT {handle(r)}: ^J in its text')
            k = next((i for i, p in enumerate(r) if p[0] == 101), None)
            if k is not None:  # its embedded object as AutoCAD reads it: 10 = the text's direction (a unit vector), 11 = its insertion point
                emb = [(c, v) for c, v in r[k + 1:] if c < 1000]; eg = lambda c: next((float(v) for cc, v in emb if cc == c), 0.0)
                if abs(math.hypot(eg(10), eg(20), eg(30)) - 1) > 1e-3:
                    probs['texts'].append(f'MTEXT {handle(r)}: embedded object with its direction / insertion swapped (AutoCAD turns and moves it): {s[:30]!r}')
                elif int(eg(71)) and int(eg(72)) <= 1:  # v2.42.10: one column: AutoCAD lays it out from the column's upper left corner, not its attachment point
                    probs['texts'].append(f'MTEXT {handle(r)}: one-column embedded object (AutoCAD lays it out from its corner, off its attachment point): {s[:30]!r}')
            if re.search(r'\\f\s*Vineta', s, re.I): probs['texts'].append(f'MTEXT {handle(r)}: Vineta BT font')
            w = mtext_own(r, 41); h = gf(r, 40)
            need = h * 0.6 * max([0] + [len(x.strip()) for x in mtext_lines(s)])
            try: w = float(w) if w is not None else 0.0
            except ValueError: w = 0.0
            if w > 0 and need > 0 and w < 0.2 * need: probs['texts'].append(f'MTEXT {handle(r)}: width 41={w:g} below 20 % of its text ({need:.1f}): {s[:40]!r}')
    for r in S.get('TABLES', []):
        if typ(r) == 'STYLE' and (re.search('vinet', g(r, 3) or '', re.I) or any(re.match(r'\s*Vineta', v, re.I) for v in ga(r, 1000))): probs['texts'].append(f'STYLE {g(r, 2)}: Vineta BT font')
    # placement: where model space draws
    memo = {}
    def pts(e):
        t = typ(e)
        if t == 'LINE': return [(gf(e, 10), gf(e, 20)), (gf(e, 11), gf(e, 21))]
        if t in ('CIRCLE', 'ARC'): x, y, q = gf(e, 10), gf(e, 20), gf(e, 40); return [(x - q, y - q), (x + q, y + q)]
        if t == 'IMAGE':
            x, y = gf(e, 10), gf(e, 20); ux, uy = gf(e, 11) * gf(e, 13), gf(e, 21) * gf(e, 13); vx, vy = gf(e, 12) * gf(e, 23), gf(e, 22) * gf(e, 23)
            return [(x, y), (x + ux + vx, y + uy + vy), (x + ux, y + uy), (x + vx, y + vy)]
        if t in ('VIEWPORT', 'SEQEND', 'ATTDEF'): return []
        if t in ('TEXT', 'MTEXT', 'ATTRIB', 'POINT', 'INSERT', 'ELLIPSE'): return [(gf(e, 10), gf(e, 20))]  # (an MTEXT's embedded object has points of its own)
        xs = [float(v) for c, v in e[1:] if c == 10]; ys = [float(v) for c, v in e[1:] if c == 20]
        if t == 'HATCH': xs, ys = xs[1:], ys[1:]
        return list(zip(xs, ys))
    def box(name, depth=0):
        if name in memo: return memo[name]
        b = blocks.get(name)
        if not b or depth > 8: return None
        xs, ys = [], []
        for e in b['ents']:
            q = drawn(e, depth + 1) if typ(e) == 'INSERT' else None
            for x, y in ([(q[0], q[1]), (q[2], q[3])] if q else pts(e)): xs.append(x); ys.append(y)
        res = (min(xs) - b['base'][0], min(ys) - b['base'][1], max(xs) - b['base'][0], max(ys) - b['base'][1]) if xs else None
        memo[name] = res; return res
    def drawn(r, depth=0):
        if typ(r) != 'INSERT':
            q = pts(r)
            return (min(x for x, y in q), min(y for x, y in q), max(x for x, y in q), max(y for x, y in q)) if q else None
        bb = box(g(r, 2), depth); x0, y0 = gf(r, 10), gf(r, 20)
        if not bb: return (x0, y0, x0, y0)
        sx, sy, a = gf(r, 41, 1.0), gf(r, 42, 1.0), math.radians(gf(r, 50)); c, s = math.cos(a), math.sin(a)
        T = [(x0 + u * sx * c - v * sy * s, y0 + u * sx * s + v * sy * c) for u, v in ((bb[0], bb[1]), (bb[2], bb[1]), (bb[0], bb[3]), (bb[2], bb[3]))]
        return (min(t[0] for t in T), min(t[1] for t in T), max(t[0] for t in T), max(t[1] for t in T))
    E = S.get('ENTITIES', [])
    model = [r for r in E if owner(r) == model_h and (g(r, 67) or '0').strip() != '1']
    ins_h = {handle(r) for r in model if typ(r) == 'INSERT'}
    model += [r for r in E if typ(r) == 'ATTRIB' and owner(r) in ins_h]
    plan = [drawn(r) for r in model if (g(r, 8) or '') == 'GRIDS' or (g(r, 8) or '').upper().startswith('G-ESAA VICINITY')]
    plan = [b for b in plan if b]
    ext = (lambda a, b: (gf([(0, '')] + a, 10), gf([(0, '')] + a, 20), gf([(0, '')] + b, 10), gf([(0, '')] + b, 20)))(hv('$EXTMIN'), hv('$EXTMAX'))
    if plan: PB = (min(b[0] for b in plan), min(b[1] for b in plan), max(b[2] for b in plan), max(b[3] for b in plan))
    else: PB = ext; probs['placement'].append('no GRIDS layer in model space: the plan box is taken from $EXTMIN / $EXTMAX')
    M = A.margin
    out = lambda x, y: x < PB[0] - M or x > PB[2] + M or y < PB[1] - M or y > PB[3] + M
    nfar = 0
    for r in model:
        b = drawn(r)
        if not b: continue
        bad = out(b[0], b[1]) or out(b[2], b[3])
        if typ(r) == 'INSERT' and out(gf(r, 10), gf(r, 20)): bad = True
        if bad:
            nfar += 1
            if nfar <= 25: probs['placement'].append(f'{typ(r)} {handle(r)} ({g(r, 8)}{", " + g(r, 2) if typ(r) == "INSERT" else ""}) at ({gf(r, 10):.0f}, {gf(r, 20):.0f}) drawn {tuple(round(v) for v in b)}: more than {M:.0f} m from the plan')
    if nfar > 25: probs['placement'].append(f'... {nfar} in all')
    if out(ext[0], ext[1]) or out(ext[2], ext[3]): probs['placement'].append(f'$EXTMIN / $EXTMAX {tuple(round(v) for v in ext)} reach more than {M:.0f} m beyond the plan {tuple(round(v) for v in PB)}')
    if plan and (ext[0] > PB[0] + 1 or ext[1] > PB[1] + 1 or ext[2] < PB[2] - 1 or ext[3] < PB[3] - 1): probs['placement'].append(f'$EXTMIN / $EXTMAX {tuple(round(v) for v in ext)} do not hold the plan {tuple(round(v) for v in PB)}')
    if vps:
        v = vps[0]; cx, cy, vh = gf(v, 12), gf(v, 22), gf(v, 40)
        if not (ext[0] <= cx <= ext[2] and ext[1] <= cy <= ext[3]): probs['placement'].append(f'*Active VPORT centre ({cx:.0f}, {cy:.0f}) not inside the extents')
        if not (ext[3] - ext[1] - 1 <= vh <= 3 * max(ext[2] - ext[0], ext[3] - ext[1], 1)): probs['placement'].append(f'*Active VPORT height {vh:.0f} does not frame the extents')
    # report
    total = sum(len(v) for v in probs.values())
    print(f'{A.dxf}: {sum(len(v) for v in S.values())} records; plan box {tuple(round(v) for v in PB)}; extents {tuple(round(v) for v in ext)}')
    for k in ('file', 'handles', 'tables', 'attributes', 'entities', 'objects', 'images', 'texts', 'placement'):
        L = probs.get(k, [])
        print(f'  {k:<11} {"OK" if not L else f"{len(L)} problem(s)"}')
        for p in L[:A.list]: print('     ', p)
    print('no problems' if not total else f'{total} problem(s)')
    sys.exit(1 if total else 0)


if __name__ == '__main__':
    main()
