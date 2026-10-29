"""Fill the seed's @@TOKENS@@ from a JSON of values (a test helper; the app does the same in its DXF export).
    python3 -I fill_seed.py seed.dxf values.json out.dxf
values.json: {"PROJECT_TYPE": "…", "SHEET_NO": {"GEO": "1 OF 4", "GEO (2)": "2 OF 4"}, ...}
A value is text, or {sheet name: text}. Missing or empty values leave the field blank (never invented).
@@LOCATION@@ inside the cover / title-block texts breaks the line before the province (after the last "_"), as the
template does; in the PMI table it stays on one line."""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_seed import Dxf, write_pairs

TOK = re.compile(r'@@(\w+)@@')


def mtext_escape(s):
    return s.replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}')


def fill(seed, values, out):
    d = Dxf(seed); P = d.pairs
    sheet_of = {bh: name for name, bh in d.layouts.items()}  # block record handle -> sheet name
    paging = d.br_by_name.get('PAGING')
    used, blank = set(), set()
    edits = {}
    for n in ('BLOCKS', 'ENTITIES'):
        for r in d.recs[n]:
            t = d.typ(r)
            if t not in ('TEXT', 'MTEXT'): continue
            txt = d.text(r)
            if '@@' not in txt: continue
            sheet = sheet_of.get(d.owner(r))
            two_line = t == 'MTEXT' and (sheet == 'TITLE' or d.owner(r) == paging)

            def val(m):
                k = m.group(1); v = values.get(k, '')
                if isinstance(v, dict): v = v.get(sheet, '')
                v = str(v or '')
                used.add(k)
                if not v: blank.add(k)
                if t == 'MTEXT':
                    v = mtext_escape(v)
                    if k == 'LOCATION' and two_line and '_' in v: i = v.rfind('_'); v = v[:i + 1] + '\\P' + v[i + 1:]
                return v
            new = TOK.sub(val, txt)
            rec = [p[:] for p in P[r[0]:r[1]]]
            if t == 'MTEXT':
                outp, done = [], False
                for c, v in rec:
                    if c == 3 and not done: continue
                    if c == 1 and not done:
                        ch = [new[i:i + 250] for i in range(0, len(new), 250)] or ['']
                        outp.extend([3, x] for x in ch[:-1]); outp.append([1, ch[-1]]); done = True; continue
                    outp.append([c, v])
            else:
                outp = [[c, new] if c == 1 else [c, v] for c, v in rec]
            edits[r[0]] = outp
    res, i = [], 0
    ends = {r[0]: r[1] for n in d.recs for r in d.recs[n]}
    while i < len(P):
        if i in edits: res.extend(edits[i]); i = ends[i]; continue
        res.append(P[i]); i += 1
    write_pairs(out, res, d.nl)
    return sorted(used), sorted(blank), sorted(set(values) - used)


if __name__ == '__main__':
    if len(sys.argv) != 4: raise SystemExit(__doc__)
    used, blank, unknown = fill(sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3])
    print('tokens filled:', len(used) - len(blank), '| left blank:', ', '.join(blank) or '-', '| values with no token:', ', '.join(unknown) or '-')
