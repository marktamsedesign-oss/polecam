"""G-eSAA: one-time preparation of the company drawing template (AutoCAD 2018 DXF) into the "seed" the app's DXF export fills.

    python3 -I make_seed.py template.dxf seed.dxf fields.json

What it does (every other byte of the template is copied as it is):
  * Model space: keeps only the static tables (legend, right-of-way coverage, project management information) and removes
    the sample route, the sheet grid, the base map, the placeholder labels and stray symbol copies (the app draws its own,
    in UTM 51N metres). Objects owned only by removed entities go too; pointers to them are taken out of groups,
    dictionaries, reactors and the draw-order table; groups left empty are removed.
  * VICINITY MAP: removes the embedded sample picture (OLE object); the app cannot rebuild it.
  * The preview picture (THUMBNAILIMAGE) is dropped: it showed the sample.
  * Marks every field the app fills with a token  @@NAME@@  and adds the value texts the template only has labels for
    (network, drawing number, issue number, scale, signatories, exporter), on each sheet that has the title block.
  * GEO sheets: viewports set to 1:1100 (view height 440 for the 400-unit viewport = 440 m), the scale chosen for the plan.
  * Writes fields.json: each token, where it is (sheet or block, entity handle) and what fills it.
Standard library only. The template is read as data; nothing in it is executed."""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extents import Extents

ENC = 'utf-8'  # DXF 2007 and later (this template: AC1032) is UTF-8
ZONE = (13000.0, 16200.0, 16700.0, 17000.0)  # model space kept: the legend, ROW and PMI tables (x0, y0, x1, y1)
GEO_LAYOUTS = ('GEO', 'GEO (2)', 'GEO (3)', 'GEO (4)')
GEO_VIEW_HEIGHT = 440.0  # 1:1100 in drawing units (400-unit viewport)
HANDLE_CODES = set(range(320, 370)) | {390}


# ---------------------------------------------------------------- reading / writing
def read_pairs(path):
    with open(path, 'r', encoding=ENC, newline='') as f:
        raw = f.read()
    nl = '\r\n' if '\r\n' in raw[:4096] else '\n'
    lines = raw.split(nl)
    if lines and lines[-1] == '': lines.pop()
    if len(lines) % 2: raise SystemExit('odd number of lines: not an ASCII DXF')
    return [[int(lines[i].strip()), lines[i + 1]] for i in range(0, len(lines), 2)], nl


def code_str(c):
    return f'{c:>3}' if c < 1000 else str(c)


def write_pairs(path, pairs, nl):
    with open(path, 'w', encoding=ENC, newline='') as f:
        f.write(nl.join(f'{code_str(c)}{nl}{v}' for c, v in pairs) + nl)


def records(pairs, a, b):
    """Split pairs[a:b] into records starting at each code 0: [(start, end)]."""
    out, s = [], None
    for i in range(a, b):
        if pairs[i][0] == 0:
            if s is not None: out.append((s, i))
            s = i
    if s is not None: out.append((s, b))
    return out


def sections(pairs):
    sec, i = {}, 0
    while i < len(pairs):
        if pairs[i] == [0, 'SECTION']:
            j = i + 2
            while pairs[j] != [0, 'ENDSEC']: j += 1
            sec[pairs[i + 1][1]] = (i, j)  # index of 0/SECTION and of 0/ENDSEC
            i = j + 1
        else:
            i += 1
    return sec


def rec_get(pairs, r, code, default=None):
    for c, v in pairs[r[0] + 1:r[1]]:
        if c == code: return v
    return default


def rec_all(pairs, r, code):
    return [v for c, v in pairs[r[0] + 1:r[1]] if c == code]


def rec_owner(pairs, r):
    """The owner: the 330 outside the 102 {...} groups (reactors, extension dictionary)."""
    depth = 0
    for c, v in pairs[r[0] + 1:r[1]]:
        if c == 102: depth = 1 if v.startswith('{') else 0; continue
        if c == 330 and not depth: return v
    return None


def I(v):
    return f'{int(v):>6}'


def Fl(v):
    return repr(float(v))


class Dxf:
    def __init__(self, path):
        self.pairs, self.nl = read_pairs(path)
        P = self.pairs
        self.S = sections(P)
        self.recs = {n: records(P, self.S[n][0] + 2, self.S[n][1]) for n in ('TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS') if n in self.S}
        self.by_handle = {}
        for n, rs in self.recs.items():
            for r in rs:
                h = rec_get(P, r, 105) if P[r[0]][1] == 'DIMSTYLE' else rec_get(P, r, 5)
                if h: self.by_handle[h] = r
        self.br = {rec_get(P, r, 5): rec_get(P, r, 2) for r in self.recs['TABLES'] if P[r[0]][1] == 'BLOCK_RECORD'}
        self.br_by_name = {v: k for k, v in self.br.items()}
        self.layouts = {}  # layout name -> block record handle
        for r in self.recs['OBJECTS']:
            if P[r[0]][1] == 'LAYOUT': self.layouts[rec_all(P, r, 1)[-1]] = rec_all(P, r, 330)[-1]
        self.blocks = {}  # block name -> {'ents': [records], 'endblk': record}
        cur = None
        for r in self.recs['BLOCKS']:
            t = P[r[0]][1]
            if t == 'BLOCK': cur = rec_get(P, r, 2); self.blocks[cur] = {'ents': [], 'endblk': None}; continue
            if t == 'ENDBLK': self.blocks[cur]['endblk'] = r; cur = None; continue
            if cur is not None: self.blocks[cur]['ents'].append(r)

    def typ(self, r): return self.pairs[r[0]][1]
    def get(self, r, c, d=None): return rec_get(self.pairs, r, c, d)
    def all(self, r, c): return rec_all(self.pairs, r, c)
    def owner(self, r): return rec_owner(self.pairs, r)
    def text(self, r): return ''.join(self.all(r, 3)) + (self.get(r, 1) or '')

    def layout_ents(self, name):
        bn = self.br[self.layouts[name]]
        if bn == '*Paper_Space':  # the active layout's entities live in ENTITIES
            return [r for r in self.recs['ENTITIES'] if self.get(r, 67, '0').strip() == '1']
        return self.blocks[bn]['ents']


# ---------------------------------------------------------------- the seed
def make_seed(src, dst, fields_path):
    d = Dxf(src)
    P = d.pairs
    hs_i = next(i for i in range(*d.S['HEADER']) if P[i] == [9, '$HANDSEED'])
    seed0 = int(P[hs_i + 1][1], 16)
    nexth = [seed0]

    def new_handle():
        h = format(nexth[0], 'X'); nexth[0] += 1; return h

    model_h = d.br_by_name['*Model_Space']
    pspace_h = d.br_by_name['*Paper_Space']
    stats = {}
    removed = set()  # handles
    remove_at = set()  # record start indexes

    def drop(r):
        h = d.get(r, 5)
        if h: removed.add(h)
        remove_at.add(r[0])

    # 1. model space outside the tables. Where an entity is drawn: its extents (an INSERT through its block: the legend
    #    symbols' blocks have their geometry far from the base point), or, for an INSERT, its insertion point (some
    #    legend symbol blocks also hold far-away stray geometry).
    E = Extents(d)

    def inside(x0, y0, x1, y1):
        return x0 >= ZONE[0] and x1 <= ZONE[2] and y0 >= ZONE[1] and y1 <= ZONE[3]

    def in_zone(r):
        bb = E.bbox(r)
        if not bb: return True
        if inside(*bb): return True
        if d.typ(r) == 'INSERT':
            x, y = float(d.get(r, 10, 0)), float(d.get(r, 20, 0))
            return inside(x, y, x, y)
        return False

    kept = gone = 0
    for r in d.recs['ENTITIES']:
        if d.owner(r) != model_h or d.get(r, 67, '0').strip() == '1': continue
        if in_zone(r): kept += 1
        else: drop(r); gone += 1
    stats['model_space_kept'] = kept
    stats['model_space_removed'] = gone
    # 2. the sample picture on VICINITY MAP
    for r in d.layout_ents('VICINITY MAP'):
        if d.typ(r) == 'OLE2FRAME': drop(r); stats['vicinity_picture_removed'] = d.get(r, 5)
        elif d.get(r, 8) == 'BASEMAP': drop(r); stats['vicinity_basemap_removed'] = d.get(r, 5)  # a sample road line that lay under the picture
    # 3. whatever they owned (attributes, vertices, extension dictionaries, ...), until nothing changes
    every = [r for n in ('BLOCKS', 'ENTITIES', 'OBJECTS') for r in d.recs[n]]
    while True:
        more = [r for r in every if r[0] not in remove_at and d.owner(r) in removed]
        if not more: break
        for r in more: drop(r)
    # groups left without members
    for r in d.recs['OBJECTS']:
        if d.typ(r) == 'GROUP' and r[0] not in remove_at:
            mem = d.all(r, 340)
            if mem and all(h in removed for h in mem): drop(r); stats['empty_groups_removed'] = stats.get('empty_groups_removed', 0) + 1
    stats['records_removed'] = len(remove_at)

    # 4. tokens
    fields, edits, adds = [], {}, {}  # adds: block name or '*ENTITIES' -> [record pairs]
    field_warn = []

    def note(token, where, handle, fills, new=False):
        fields.append({'token': token, 'where': where, 'handle': handle, 'fills': fills, **({'new': True} if new else {})})

    def has_field(r):
        for c, v in P[r[0] + 1:r[1]]:
            if c == 360:
                x = d.by_handle.get(v)
                if x and d.typ(x) == 'DICTIONARY' and 'ACAD_FIELD' in d.all(x, 3): return True
        return False

    def set_text(h, text, token, where, fills):
        r = d.by_handle[h]
        if has_field(r): field_warn.append(h)
        rec = [p[:] for p in P[r[0]:r[1]]]
        if d.typ(r) == 'MTEXT':
            out, done = [], False
            for c, v in rec:
                if c == 3 and not done: continue  # old text chunks (before the 1)
                if c == 1 and not done:
                    chunks = [text[i:i + 250] for i in range(0, len(text), 250)] or ['']
                    out.extend([3, ch] for ch in chunks[:-1]); out.append([1, chunks[-1]]); done = True
                    continue
                out.append([c, v])
        else:
            out = [[c, text] if c == 1 else [c, v] for c, v in rec]
        edits[r[0]] = out
        for t in re.findall(r'@@\w+@@', token): note(t, where, h, fills)

    def need(h, typ, block=None):
        r = d.by_handle.get(h)
        ok = r is not None and d.typ(r) in (typ if isinstance(typ, tuple) else (typ,)) and (block is None or d.owner(r) == d.br_by_name.get(block))
        if not ok: raise SystemExit(f'template changed: {typ} {h} not found{" in " + block if block else ""}; the seed tool needs updating')

    def owner_of(layout):
        bh = d.layouts[layout]; bn = d.br[bh]
        return bh, (bn == '*Paper_Space'), ('*ENTITIES' if bn == '*Paper_Space' else bn)

    def new_mtext(layout_or_block, x, y, h, text, attach, layer, color=None, style='Standard', width=0.0):
        if layout_or_block in d.layouts: oh, paper, key = owner_of(layout_or_block)
        else: oh, paper, key = d.br_by_name[layout_or_block], False, layout_or_block
        hd = new_handle()
        rec = [[0, 'MTEXT'], [5, hd], [330, oh], [100, 'AcDbEntity']] + ([[67, I(1)]] if paper else []) + [[8, layer]] + ([[62, I(color)]] if color is not None else [])
        rec += [[100, 'AcDbMText'], [10, Fl(x)], [20, Fl(y)], [30, '0.0'], [40, Fl(h)], [41, Fl(width)], [71, I(attach)], [72, I(1)], [1, text], [7, style], [73, I(1)], [44, '1.0']]
        adds.setdefault(key, []).append(rec)
        return hd

    def new_text(layout_or_block, x, y, h, text, layer, color=None, style='Standard', halign=0):
        if layout_or_block in d.layouts: oh, paper, key = owner_of(layout_or_block)
        else: oh, paper, key = d.br_by_name[layout_or_block], False, layout_or_block
        hd = new_handle()
        rec = [[0, 'TEXT'], [5, hd], [330, oh], [100, 'AcDbEntity']] + ([[67, I(1)]] if paper else []) + [[8, layer]] + ([[62, I(color)]] if color is not None else [])
        rec += [[100, 'AcDbText'], [10, Fl(x)], [20, Fl(y)], [30, '0.0'], [40, Fl(h)], [1, text], [7, style]]
        if halign: rec += [[72, I(halign)], [11, Fl(x)], [21, Fl(y)], [31, '0.0']]
        rec += [[100, 'AcDbText']]
        adds.setdefault(key, []).append(rec)
        return hd

    for h in ('D518', '15547', '16EBA', '161B0', '161AF', '16196', '1750E', '17516', '1751A', '1751E', '17522', '17526', '1752A', '1752E', '17532', '1753A', '17536',
              '17542', '1753E', '17546', '1754A', '1754E', '17552', '193F5', '19458', '193B7', '193BB', '193BF', '193C3', '19459', '1945A', '1945B', '1945C', '1945D'):
        need(h, ('TEXT', 'MTEXT'))
    # 4a. cover sheet (TITLE)
    W = 'sheet TITLE'
    set_text('D518', '{\\fArial|b1|i0|c0|p34;@@PROJECT_TYPE@@^J\\H0.74632x;@@LOCATION@@\\P@@PROJECT_CODE@@\\P\\fArial|b0|i0|c0|p34;(@@SITE_NAME@@)}',
             '@@PROJECT_TYPE@@ @@LOCATION@@ @@PROJECT_CODE@@ @@SITE_NAME@@', W,
             'project type · location, barangay_municipality_province (the line breaks before the province, as in the template) · project code · site name / PLA ID')
    set_text('15547', '@@COMPANY_NAME@@', '@@COMPANY_NAME@@', W, 'vendor company name; the logo itself is added in CAD')
    set_text('16EBA', '@@TITLE_CABLE@@', '@@TITLE_CABLE@@', W, 'the proposed cable(s) of the route, e.g. PROPOSED 12C LIGHT CABLE (my reading of the template text: confirm)')
    # 4b. the title block (block PAGING, inserted on 9 sheets): the texts that are the same on every sheet
    W = 'block PAGING (all sheets)'
    pg = {d.text(r): d.get(r, 5) for r in d.blocks['PAGING']['ents'] if d.typ(r) in ('TEXT', 'MTEXT')}
    need('1B3B2', 'MTEXT', 'PAGING'); need('1B3A2', 'MTEXT', 'PAGING')
    set_text('1B3B2', '\\pxqc;{\\fArial|b1|i0|c0|p34;\\C256;@@LOCATION@@\\P@@SITE_ID@@}', '@@LOCATION@@ @@SITE_ID@@', W,
             'location (the line breaks before the province, as in the template) · site ID')
    set_text('1B3A2', '\\pxqc;DETAILED DRAWING DESIGN\\P@@PROJECT_TYPE@@', '@@PROJECT_TYPE@@', W, 'project type')
    set_text(pg['ADD COMPANY NAME AND LOGO'], '@@COMPANY_NAME@@', '@@COMPANY_NAME@@', W, 'vendor company name; the logo itself is added in CAD')
    # 4c. every sheet with the title block: sheet number and date (template texts), the values the template has no text for
    paging_sheets = [L for L in d.layouts if L != 'Model' and any(d.typ(r) == 'INSERT' and d.get(r, 2) == 'PAGING' for r in d.layout_ents(L))]
    stats['title_block_sheets'] = paging_sheets
    idx_x = (6860.142453257418, 6872.386943697458, 6884.545321518961)
    idx_y = (-6075.490882673041, -6087.641044932195, -6099.791207191349)
    idx_tok = (('IDX_TL', 'IDX_T', 'IDX_TR'), ('IDX_L', 'IDX_C', 'IDX_R'), ('IDX_BL', 'IDX_B', 'IDX_BR'))
    per_sheet = [  # token, x, y (paper), height, attachment (7 bottom left, 8 bottom centre), what fills it
        ('NETWORK', 6806.4, -6195.13, 2.0, 8, 'network (template: none given)'),
        ('ISSUE_NO', 6891.9, -6195.13, 2.0, 8, 'issue number (short: the cell is narrow)'),
        ('DWG_NO', 6825.0, -6201.94, 2.0, 8, 'drawing number'),
        ('SIG_JUNIOR_ENGINEER', 6804.9, -6123.6, 1.45, 8, 'junior engineer (name)'),
        ('SIG_CSE_LEAD', 6865.4, -6123.6, 1.45, 8, 'CSE lead (name)'),
        ('SIG_DESIGN_ENGINEER', 6794.8, -6061.2, 1.45, 8, 'design engineer (name)'),
        ('SIG_PROJECT_ENGINEER', 6835.1, -6061.2, 1.45, 8, 'project engineer (name)'),
        ('SIG_HEAD_CABLE_ENGINEERING', 6875.4, -6061.2, 1.45, 8, 'head, cable engineering (name)'),
        ('EXPORTED_BY', 6478.0, -6209.5, 1.6, 7, "exported by: name, mobile, email; app version and export date (backtracking)"),
    ]
    for L in paging_sheets:
        W = f'sheet {L}'
        for r in d.layout_ents(L):
            if d.typ(r) != 'MTEXT': continue
            v = d.text(r); h = d.get(r, 5)
            if re.fullmatch(r'\{\\C256;\d+ OF \d+\}', v): set_text(h, '{\\C256;@@SHEET_NO@@}', '@@SHEET_NO@@', W, 'n OF total, counted within the sheet type')
            elif re.fullmatch(r'\{\\C256;[A-Z]+ \d+, \d{4}\}', v): set_text(h, '{\\C256;@@DATE@@}', '@@DATE@@', W, 'date issued (export date, e.g. OCTOBER 29, 2026)')
        for tok, x, y, hgt, att, fills in per_sheet:
            note(f'@@{tok}@@', W, new_mtext(L, x, y, hgt, '{\\C256;@@' + tok + '@@}', att, 'Post Label', color=1), fills, new=True)
        # the scale sits where the template's (hidden) SCALE attribute is: right-aligned, CGOMEGA, green
        note('@@SCALE@@', W, new_text(L, 6856.85, -6101.08, 1.210036491531793, '@@SCALE@@', '0', color=3, style='CGOMEGA', halign=2),
             '1 : 1,100 METERS on GEO sheets; KEYMAP: from its viewport; other sheets: blank unless you choose a wording', new=True)
        if L in GEO_LAYOUTS:
            have = {}
            for r in d.layout_ents(L):
                if d.typ(r) == 'TEXT' and d.get(r, 8) == 'MISC':
                    x, y = float(d.get(r, 10)), float(d.get(r, 20))
                    have[(min(range(3), key=lambda i: abs(idx_y[i] - y)), min(range(3), key=lambda i: abs(idx_x[i] - x)))] = d.get(r, 5)
            for ri in range(3):
                for ci in range(3):
                    tok = '@@' + idx_tok[ri][ci] + '@@'
                    fills = 'the grid cell of this sheet' if ri == ci == 1 else 'the neighbouring grid cell in that direction when another GEO sheet covers it, else blank'
                    if (ri, ci) in have: set_text(have[(ri, ci)], tok, tok, W, fills)
                    else: note(tok, W, new_text(L, idx_x[ci], idx_y[ri], 4.645800803985909, tok, 'MISC', color=1 if ri == ci == 1 else 0), fills, new=True)  # template: centre red, neighbours BYBLOCK
            for r in d.layout_ents(L):
                if d.typ(r) == 'VIEWPORT' and abs(float(d.get(r, 40, '0')) - 400) < 1 and abs(float(d.get(r, 41, '0')) - 400) < 1:
                    edits[r[0]] = [[c, Fl(GEO_VIEW_HEIGHT)] if c == 45 else [c, v] for c, v in P[r[0]:r[1]]]
                    note('(viewport)', W, d.get(r, 5), 'view centre = this sheet\'s grid cell centre; view height 440 = 1:1100')
    # 4d. table of contents
    W = 'sheet TOC'
    set_text('161B0', '@@TOC_GEO@@', '@@TOC_GEO@@', W, 'number of GEO sheets')
    set_text('161AF', '@@TOC_LEGEND@@', '@@TOC_LEGEND@@', W, 'number of legend sheets (template says 2 but has one legend sheet)')
    set_text('16196', '@@TOC_TOTAL@@ SHEETS', '@@TOC_TOTAL@@', W, 'total number of sheets')
    # 4e. model space tables
    W = 'model space · PMI table (sheet PMI)'
    pmi = [('1750E', 'LOCATION', 'location (one line)'), ('17516', 'PMI_TOTAL_CABLE_LENGTH', 'total cable length, m'), ('1751A', 'PMI_AERIAL_CABLE_LENGTH', 'aerial cable length, m'),
           ('1751E', 'PMI_EXISTING_GT_POLE', 'existing GT poles'), ('17522', 'PMI_PROPOSED_POLE', 'proposed poles'), ('17526', 'PMI_RTA_CONVERGE', 'RTA Converge'),
           ('1752A', 'PMI_RTA_LOCAL_COOP', 'RTA local coop'), ('1752E', 'PMI_RTA_OTHER_PLDT', 'RTA other (PLDT pole)'), ('17532', 'PMI_UG_CABLE_LENGTH', 'underground cable length, m'),
           ('1753A', 'PMI_PROPOSED_HDD', 'proposed HDD'), ('17536', 'PMI_OPEN_TRENCH', 'proposed open trench'), ('17542', 'PMI_MICRO_TRENCH', 'proposed micro trench'),
           ('1753E', 'PMI_MAXCELL', 'maxcell inner duct'), ('17546', 'PMI_MANHOLE', 'proposed manhole'), ('1754A', 'PMI_SERVICE_BOX', 'proposed service box'),
           ('1754E', 'PMI_FIBER_TERMINATION', 'fiber termination'), ('17552', 'PMI_HYBRID_CLOSURE', 'proposed hybrid closure')]
    for h, tok, fills in pmi:
        v = d.get(d.by_handle[h], 1) or ''
        m = re.match(r'^((?:\\[pA][^;]*;|\{\\f[^;]*;(?:\\H[^;]*;)?)*)', v)  # keep the leading formatting
        pre = m.group(1) if m else ''
        set_text(h, pre + '@@' + tok + '@@' + ('}' * pre.count('{')), '@@' + tok + '@@', W, fills)
    W = 'model space · right-of-way table (sheet ROW AREA COVERAGE)'
    row = [('193F5', 'ROW_MUNICIPALITY_1'), ('19458', 'ROW_MUNICIPALITY_2'), ('193B7', 'ROW_BARANGAY_1'), ('193BB', 'ROW_BARANGAY_2'), ('193BF', 'ROW_BARANGAY_3'),
           ('193C3', 'ROW_BARANGAY_4'), ('19459', 'ROW_BARANGAY_5'), ('1945A', 'ROW_BARANGAY_6'), ('1945B', 'ROW_BARANGAY_7')]
    for h, tok in row:
        v = d.get(d.by_handle[h], 1) or ''; m = re.match(r'^((?:\\[pA][^;]*;|\{\\f[^;]*;(?:\\H[^;]*;)?)*)', v); pre = m.group(1) if m else ''
        set_text(h, pre + '@@' + tok + '@@' + ('}' * pre.count('{')), '@@' + tok + '@@', W,
                 'municipality / barangays the route crosses (rows 1-4 under municipality 1, rows 5-7 under municipality 2, as the template table is drawn)')
    for h, tok in (('1945C', 'ROW_MUNICIPALITIES'), ('1945D', 'ROW_BARANGAYS')):
        v = d.get(d.by_handle[h], 1) or ''
        set_text(h, v.replace(re.search(r'TOTAL - \d+', v).group(0), 'TOTAL - @@' + tok + '@@'), '@@' + tok + '@@', W, 'how many municipalities / barangays')

    # 5. write: removals, edits, additions (before ENDBLK of their block, or at the end of ENTITIES)
    endblk_at = {b['endblk'][0]: n for n, b in d.blocks.items() if b['endblk'] and n in adds}
    ent_end = d.S['ENTITIES'][1]
    thumb = d.S.get('THUMBNAILIMAGE')
    starts = {r[0]: r[1] for n in d.recs for r in d.recs[n]}
    out, i = [], 0
    while i < len(P):
        if thumb and i == thumb[0]: i = thumb[1] + 1; continue
        if i == ent_end:
            for rec in adds.get('*ENTITIES', []): out.extend(rec)
        if i in starts:
            e = starts[i]
            if i in endblk_at:
                for rec in adds[endblk_at[i]]: out.extend(rec)
            if i in remove_at: pass
            elif i in edits: out.extend(edits[i])
            else: out.extend(P[i:e])
            i = e; continue
        out.append(P[i]); i += 1
    # 6. pointers to removed things
    fix = {'dictionary_entries': 0, 'sortents_entries': 0, 'group_members': 0, 'reactors': 0, 'block_insert_refs': 0}
    left = []
    S2 = sections(out)
    st2 = {r[0]: r[1] for n in ('TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS') for r in records(out, S2[n][0] + 2, S2[n][1])}
    final, i = [], 0
    while i < len(out):
        if i not in st2: final.append(out[i]); i += 1; continue
        e = st2[i]; rec = out[i:e]; t = rec[0][1]
        if not any(c in HANDLE_CODES and v in removed for c, v in rec[1:]):
            final.extend(rec); i = e; continue
        new, j, grp = [rec[0]], 1, None
        while j < len(rec):
            c, v = rec[j]
            if c == 102: grp = v if v.startswith('{') else None
            dead = c in HANDLE_CODES and v in removed
            if t == 'DICTIONARY' and c == 3 and j + 1 < len(rec) and rec[j + 1][0] in (350, 360) and rec[j + 1][1] in removed:
                fix['dictionary_entries'] += 1; j += 2; continue
            if t == 'SORTENTSTABLE' and c == 331 and dead:
                fix['sortents_entries'] += 1; j += 2 if j + 1 < len(rec) and rec[j + 1][0] == 5 else 1; continue
            if t == 'GROUP' and c == 340 and dead: fix['group_members'] += 1; j += 1; continue
            if t == 'BLOCK_RECORD' and c == 331 and dead: fix['block_insert_refs'] += 1; j += 1; continue  # the block's list of its inserts
            if grp == '{ACAD_REACTORS' and c == 330 and dead: fix['reactors'] += 1; j += 1; continue
            if dead: left.append([t, rec_get(rec, (0, len(rec)), 5), c, v])
            new.append([c, v]); j += 1
        if t == 'GROUP':  # member count is not stored; nothing more to fix
            pass
        final.extend(new); i = e
    S3 = sections(final)
    for i in range(*S3['HEADER']):
        if final[i] == [9, '$HANDSEED']: final[i + 1][1] = format(nexth[0], 'X'); break
    write_pairs(dst, final, d.nl)
    stats.update(fix)
    stats['pointers_left_to_removed'] = left
    stats['new_entities'] = nexth[0] - seed0
    stats['texts_with_fields'] = field_warn
    stats['thumbnail_removed'] = bool(thumb)
    json.dump({'template': src.replace('\\', '/').split('/')[-1], 'plan_scale': '1:1100 on GEO sheets (view height 440 in the 400-unit viewport)',
               'grid_cell_m': 440, 'stats': stats, 'fields': fields}, open(fields_path, 'w'), indent=1)
    return stats, fields


if __name__ == '__main__':
    if len(sys.argv) != 4: raise SystemExit(__doc__)
    st, fl = make_seed(*sys.argv[1:])
    print(json.dumps(st, indent=1))
    print(len(fl), 'field entries,', len({f['token'] for f in fl}), 'distinct tokens')
