"""Structural check of a DXF written by the seed tool or the app (no CAD program needed).
    python3 -I check_dxf.py file.dxf [reference.dxf]
Checks: sections, unique handles, $HANDSEED above every handle, owners exist and match where the entity sits,
handle pointers resolve, attribute sequences, layers / text styles / blocks / line types exist.
With a reference file (the template), problems the reference already has are listed apart, not counted."""
import sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_seed import Dxf, HANDLE_CODES


def problems(path):
    d = Dxf(path); P = d.pairs; out = []
    for n in ('HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'):
        if n not in d.S: out.append(('section missing', n))
    if P[-1] != [0, 'EOF']: out.append(('no EOF', ''))
    seen = collections.Counter()
    for n, rs in d.recs.items():
        for r in rs:
            h = d.get(r, 105) if d.typ(r) == 'DIMSTYLE' else d.get(r, 5)
            if h: seen[h] += 1
    for h, k in seen.items():
        if k > 1: out.append(('duplicate handle', h))
    hs = next(P[i + 1][1] for i in range(*d.S['HEADER']) if P[i] == [9, '$HANDSEED'])
    mx = max(int(h, 16) for h in seen)
    if int(hs, 16) <= mx: out.append(('$HANDSEED not above the largest handle', f'{hs} <= {mx:X}'))
    tables = collections.defaultdict(set)
    for r in d.recs['TABLES']:
        t = d.typ(r)
        if t in ('LAYER', 'STYLE', 'LTYPE', 'BLOCK_RECORD'): tables[t].add(d.get(r, 2))
    model = d.br_by_name['*Model_Space']; paper = d.br_by_name['*Paper_Space']
    for n in ('BLOCKS', 'ENTITIES', 'OBJECTS'):
        for r in d.recs[n]:
            t = d.typ(r); o = d.owner(r)
            if t in ('BLOCK', 'ENDBLK'):
                continue
            if o and o != '0' and o not in d.by_handle: out.append(('owner missing', f'{t} {d.get(r, 5)} -> {o}'))
            if n == 'ENTITIES' and t not in ('ATTRIB', 'SEQEND', 'VERTEX'):
                want = paper if d.get(r, 67, '0').strip() == '1' else model
                if o != want: out.append(('entity owner is not its space', f'{t} {d.get(r, 5)} owner {o}'))
            if n != 'OBJECTS':
                L = d.get(r, 8)
                if L is not None and L not in tables['LAYER']: out.append(('layer missing', f'{t} {d.get(r, 5)} {L}'))
                if t in ('TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'):
                    s = d.get(r, 7)
                    if s and s not in tables['STYLE']: out.append(('text style missing', f'{t} {d.get(r, 5)} {s}'))
                lt = d.get(r, 6)
                if lt and lt not in tables['LTYPE'] and lt.upper() not in ('BYLAYER', 'BYBLOCK', 'CONTINUOUS'): out.append(('line type missing', f'{t} {d.get(r, 5)} {lt}'))
                if t == 'INSERT' and d.get(r, 2) not in d.blocks: out.append(('block missing', f'{d.get(r, 5)} {d.get(r, 2)}'))
            for c, v in P[r[0] + 1:r[1]]:
                if c in HANDLE_CODES and v not in ('0', '') and v not in d.by_handle: out.append(('pointer to nothing', f'{t} {d.get(r, 5)} code {c} -> {v}'))
    for n in ('BLOCKS', 'ENTITIES'):  # INSERT (66=1) ATTRIB... SEQEND
        rs = d.recs[n]
        for k, r in enumerate(rs):
            if d.typ(r) == 'INSERT' and (d.get(r, 66) or '').strip() == '1':
                j = k + 1
                while j < len(rs) and d.typ(rs[j]) == 'ATTRIB':
                    if d.owner(rs[j]) != d.get(r, 5): out.append(('attribute not owned by its insert', d.get(rs[j], 5)))
                    j += 1
                if j >= len(rs) or d.typ(rs[j]) != 'SEQEND': out.append(('attributes not closed by SEQEND', d.get(r, 5)))
            if d.typ(r) == 'ATTRIB' and (k == 0 or d.typ(rs[k - 1]) not in ('INSERT', 'ATTRIB')): out.append(('stray ATTRIB', d.get(r, 5)))
    for name, b in d.blocks.items():
        if not b['endblk']: out.append(('block without ENDBLK', name))
        own = d.br_by_name.get(name)
        for r in b['ents']:
            if d.typ(r) in ('ATTRIB', 'SEQEND', 'VERTEX'): continue
            if d.owner(r) != own: out.append(('block entity owner wrong', f'{name} {d.typ(r)} {d.get(r, 5)}'))
    return out, d


if __name__ == '__main__':
    found, d = problems(sys.argv[1])
    base = set()
    if len(sys.argv) > 2:
        b, _ = problems(sys.argv[2]); base = set(b)
    new = [p for p in found if p not in base]
    old = [p for p in found if p in base]
    kinds = collections.Counter(k for k, _ in new)
    print(f'{sys.argv[1]}: {len(d.pairs)} pairs, {sum(len(v) for v in d.recs.values())} records')
    print('new problems:', len(new), dict(kinds))
    for p in new[:25]: print('  ', *p)
    if base: print('already in the reference:', len(old), dict(collections.Counter(k for k, _ in old)))
    sys.exit(1 if new else 0)
