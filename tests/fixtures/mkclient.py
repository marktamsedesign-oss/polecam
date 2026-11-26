"""(beta 7.15, Client templates) Made-up "DEMO CLIENT" drawing templates, as another client might send them, for the DXF synthesizer's tests
(vendor/synth/dxfsynth.js: tests/dxf-synth.test.cjs, tests/client-templates.spec.cjs). Nothing here comes from any company or client: every name, text,
number and drawing is made up. Made with ezdxf (tests/requirements.txt):

    python3 tests/fixtures/mkclient.py tests/fixtures      (writes the files below; "… tests/fixtures d": only (d))

  client-a-made-up.dxf  (a) A1 in millimetres, model space in metres. Sheets PLAN (the drawing's active sheet: a frame, a main viewport that
                        is not square, a legend viewport, the title block) and LEGEND. The title block is a BLOCK with attributes (PROJECT_NAME,
                        DWG_NO, SHEET, DATE, SCALE, DRAWN_BY, CHECKED_BY, APPROVED_BY, REV) beside its labels; a ROMANS (SHX) text style and a
                        bold one; layers FO-CABLE-PROP (0.50 mm), FO-CABLE-EXIST (0.35, dashed), POLE (0.35), TEXT, ROAD…; symbol blocks
                        POLE-NEW, POLE-EXIST, SPLICE-CLOSURE (attributes CL_ID, CL_TYPE) and HANDHOLE; a sample route in model space and a legend.
  client-b-made-up.dxf  (b) A3 in millimetres, model space in millimetres. One sheet, A3 SHEET (the active one). The title block is plain TEXT on
                        the sheet: labels and their value texts ("PROJECT:" / "XXXX"), some labels with no value text (PREPARED BY, CHECKED BY,
                        APPROVED BY); an Arial Narrow (TTF) text style; one symbol block, NAP-BOX, drawn in millimetres.
  client-c-made-up.dxf  (c) Paper in inches, model space in feet. Two sheets: PLAN (ANSI D) and KEY PLAN (ANSI B, the active one); no symbol
                        blocks; labels and values in one text ("DRAWN: JD", "SHEET 1 OF 2"), a label with its value under it (PROJECT TITLE).
  client-d-made-up-plan.dxf  (d) (templates, Digester) a client's FINISHED as-plan, as a client would send one to learn from: A3 in mm, model
                        space in metres (made-up UTM 51N places near Davao). Sheets COVER (the active one: the project's name, place and date),
                        LEGEND, LOCATION MAP (a vicinity picture: an IMAGE in model space), KEY PLAN, PLAN-1 and PLAN-2 (the route, at 1:1200,
                        each with a title block of plain texts: PROJECT, LOCATION, SHEET 1 OF 2…), PMI and ROW (their tables in model space).
                        The drawn plan: 14 poles (DEMO-POLE-NEW / DEMO-POLE-EXIST), their IDs, numbers in circles and lat / long, the
                        proposed cable and a stretch of an existing one, span lengths, the cable's name, a loop, a closure and its label,
                        the road and its name, the sheet grid; a PMI table and a ROW table with their values; a legend. Every value made up."""
import sys, os, math, ezdxf
from ezdxf.enums import TextEntityAlignment

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
ONLY = set(sys.argv[2:])  # (templates, Digester) e.g. "d": only those files (ezdxf writes new ids each run: the others stay as committed)


def new_doc(insunits):
    doc = ezdxf.new('R2018', setup=False)
    doc.header['$INSUNITS'] = insunits
    doc.header['$MEASUREMENT'] = 0 if insunits in (1, 2) else 1
    doc.linetypes.add('DASHED', pattern=[0.75, 0.5, -0.25], description='Dashed __ __ __')
    return doc


def rect(sp, x0, y0, x1, y1, layer, **kw):
    return sp.add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], close=True, dxfattribs={'layer': layer, **kw})


def text(sp, s, x, y, h, layer, style='Standard', align=None, **kw):
    t = sp.add_text(s, dxfattribs={'layer': layer, 'height': h, 'style': style, **kw})
    if align:
        t.set_placement((x, y), align=TextEntityAlignment[align] if isinstance(align, str) else align)
    else:
        t.dxf.insert = (x, y)
    return t


# ---------------------------------------------------------------- (a) A1, a title block with attributes, symbols, a sample route
def client_a(path):
    doc = new_doc(6)  # model space in metres
    doc.styles.add('CLIENT ROMANS', font='romans.shx')
    doc.styles.add('CLIENT ROMANS BOLD', font='romand.shx')
    L = doc.layers
    L.add('FO-CABLE-PROP', color=1, lineweight=50)
    L.add('FO-CABLE-EXIST', color=5, lineweight=35, linetype='DASHED')
    L.add('POLE', color=3, lineweight=35)
    L.add('TEXT', color=7, lineweight=18)
    L.add('ROAD', color=8, lineweight=13)
    L.add('LEGEND', color=7, lineweight=25)
    L.add('TB-FRAME', color=7, lineweight=70)
    L.add('TB-TEXT', color=7, lineweight=25)
    L.add('VPORT', color=8).dxf.plot = 0
    # the client's symbols (metres)
    b = doc.blocks.new('POLE-NEW'); b.add_circle((0, 0), 0.9); b.add_line((-0.9, 0), (0.9, 0)); b.add_line((0, -0.9), (0, 0.9))
    b = doc.blocks.new('POLE-EXIST'); b.add_circle((0, 0), 0.9); b.add_circle((0, 0), 0.35)
    b = doc.blocks.new('SPLICE-CLOSURE'); b.add_lwpolyline([(-1.5, -0.8), (1.5, -0.8), (1.5, 0.8), (-1.5, 0.8)], close=True); b.add_line((-1.5, -0.8), (1.5, 0.8))
    b.add_attdef('CL_ID', insert=(1.8, 0.2), text='CL-000', dxfattribs={'height': 0.7, 'style': 'CLIENT ROMANS'})
    b.add_attdef('CL_TYPE', insert=(1.8, -0.8), text='24F', dxfattribs={'height': 0.5, 'style': 'CLIENT ROMANS'})
    b = doc.blocks.new('HANDHOLE'); b.add_lwpolyline([(-0.6, -0.6), (0.6, -0.6), (0.6, 0.6), (-0.6, 0.6)], close=True); b.add_line((-0.6, 0.6), (0.6, -0.6))
    b = doc.blocks.new('NORTH-A'); b.add_lwpolyline([(0, 12), (-4, -4), (0, 0), (4, -4)], close=True); text(b, 'N', -1.6, 14, 4, '0', 'CLIENT ROMANS')
    b = doc.blocks.new('DEMO-LOGO-A'); b.add_circle((9, 9), 8); text(b, 'DEMO', 3, 8, 3.2, '0', 'CLIENT ROMANS BOLD'); text(b, 'CLIENT A', 20, 8, 5, '0', 'CLIENT ROMANS BOLD')
    # the title block: a grid of cells, a label in each, the value an attribute (paper millimetres)
    tb = doc.blocks.new('DEMO-TB-A1')
    W, H = 190.0, 120.0
    rect(tb, 0, 0, W, H, 'TB-FRAME')
    rows = [(0, 12), (12, 24), (24, 36), (36, 48), (48, 66), (66, 84), (84, 102)]
    for y0, y1 in rows:
        tb.add_line((0, y1), (W, y1), dxfattribs={'layer': 'TB-FRAME'})
    tb.add_line((95, 0), (95, 48), dxfattribs={'layer': 'TB-FRAME'})
    tb.add_line((63.3, 66), (63.3, 84), dxfattribs={'layer': 'TB-FRAME'}); tb.add_line((126.6, 66), (126.6, 84), dxfattribs={'layer': 'TB-FRAME'})
    tb.add_blockref('DEMO-LOGO-A', (6, 103), dxfattribs={'layer': 'TB-TEXT'})
    text(tb, 'DEMO CLIENT A - TELECOM DIVISION', 60, 108, 3.5, 'TB-TEXT', 'CLIENT ROMANS BOLD')
    cells = [  # label, its place, the attribute tag, its sample value, its place
        ('PROJECT', (2, 99), 'PROJECT_NAME', 'SAMPLE FIBER PROJECT', (4, 89)),
        ('DRAWN BY', (2, 81), 'DRAWN_BY', 'J. SAMPLE', (4, 70)),
        ('CHECKED BY', (65.3, 81), 'CHECKED_BY', 'K. SAMPLE', (67.3, 70)),
        ('APPROVED BY', (128.6, 81), 'APPROVED_BY', 'L. SAMPLE', (130.6, 70)),
        ('DWG NO.', (2, 45), 'DWG_NO', 'DCA-0000', (4, 38.5)),
        ('SHEET', (97, 45), 'SHEET', '1 OF 1', (99, 38.5)),
        ('DATE', (2, 33), 'DATE', '01 JAN 2026', (4, 26.5)),
        ('SCALE', (97, 33), 'SCALE', '1:1000', (99, 26.5)),
        ('REV', (2, 21), 'REV', '0', (4, 14.5)),
        ('STATUS', (97, 21), None, 'FOR APPROVAL', (99, 14.5)),
    ]
    for lab, (lx, ly), tag, val, (vx, vy) in cells:
        text(tb, lab, lx, ly, 2.0, 'TB-TEXT', 'CLIENT ROMANS')
        if tag:
            tb.add_attdef(tag, insert=(vx, vy), text=val, dxfattribs={'height': 3.0, 'style': 'CLIENT ROMANS', 'layer': 'TB-TEXT'})
        else:
            text(tb, val, vx, vy, 3.0, 'TB-TEXT', 'CLIENT ROMANS')
    text(tb, 'THIS DRAWING IS THE PROPERTY OF DEMO CLIENT A.', 2, 3, 1.8, 'TB-TEXT', 'CLIENT ROMANS')
    # model space: a sample route (the client's sample drawing) and a legend far from it
    msp = doc.modelspace()
    X0, Y0 = 1000.0, 2000.0
    pts = [(X0 + i * 40, Y0 + (i % 2) * 3) for i in range(8)]
    for i, p in enumerate(pts):
        msp.add_blockref('POLE-NEW' if i % 3 else 'POLE-EXIST', p, dxfattribs={'layer': 'POLE'})
        text(msp, f'P-{i + 1:02d}', p[0] + 1.5, p[1] + 1.5, 1.8, 'TEXT', 'CLIENT ROMANS')
    msp.add_lwpolyline(pts, dxfattribs={'layer': 'FO-CABLE-PROP'})
    msp.add_lwpolyline([(X0 - 20, Y0 - 12), (X0 + 320, Y0 - 12)], dxfattribs={'layer': 'FO-CABLE-EXIST'})
    for dy in (-8, 8):
        msp.add_line((X0 - 30, Y0 + dy - 4), (X0 + 330, Y0 + dy - 4), dxfattribs={'layer': 'ROAD'})
    text(msp, 'SAMPLE ROAD', X0 + 100, Y0 - 4.6, 2.5, 'TEXT', 'CLIENT ROMANS')
    cl = msp.add_blockref('SPLICE-CLOSURE', (X0 + 120, Y0 + 6), dxfattribs={'layer': 'POLE'})
    cl.add_auto_attribs({'CL_ID': 'CL-001', 'CL_TYPE': '48F'})
    msp.add_blockref('HANDHOLE', (X0 + 200, Y0 - 6), dxfattribs={'layer': 'POLE'})
    LX, LY = 5000.0, 5000.0  # the legend
    rect(msp, LX, LY, LX + 120, LY + 90, 'LEGEND')
    text(msp, 'LEGEND', LX + 45, LY + 80, 5, 'LEGEND', 'CLIENT ROMANS BOLD')
    for k, (blk, words) in enumerate((('POLE-NEW', 'PROPOSED POLE'), ('POLE-EXIST', 'EXISTING POLE'), ('SPLICE-CLOSURE', 'SPLICE CLOSURE'), ('HANDHOLE', 'HANDHOLE'))):
        y = LY + 65 - k * 15
        msp.add_blockref(blk, (LX + 15, y), dxfattribs={'layer': 'LEGEND', 'xscale': 3, 'yscale': 3})
        text(msp, words, LX + 35, y - 1.5, 3.5, 'LEGEND', 'CLIENT ROMANS')
    msp.add_line((LX + 5, LY + 5), (LX + 25, LY + 5), dxfattribs={'layer': 'FO-CABLE-PROP'}); text(msp, 'PROPOSED FIBER CABLE', LX + 35, LY + 3.5, 3.5, 'LEGEND', 'CLIENT ROMANS')
    # the sheets: PLAN (the active one) and LEGEND
    doc.layouts.rename('Layout1', 'PLAN')
    lay = doc.layouts.get('PLAN')
    lay.page_setup(size=(841, 594), margins=(0, 0, 0, 0), units='mm')
    rect(lay, 10, 10, 831, 584, 'TB-FRAME')
    lay.add_line((641, 10), (641, 584), dxfattribs={'layer': 'TB-FRAME'})
    lay.add_viewport(center=(325.5, 297), size=(620, 564), view_center_point=(X0 + 140, Y0), view_height=564 * 1.0).dxf.layer = 'VPORT'
    lay.add_viewport(center=(736, 470), size=(180, 140), view_center_point=(LX + 60, LY + 45), view_height=140 * 0.7).dxf.layer = 'VPORT'
    text(lay, 'NOTES:', 646, 380, 3, 'TB-TEXT', 'CLIENT ROMANS BOLD')
    for k, s in enumerate(('1. ALL DIMENSIONS ARE IN METRES UNLESS NOTED.', '2. CABLE ROUTE TO BE VERIFIED ON SITE.', '3. SAMPLE NOTE FOR TESTS ONLY.')):
        text(lay, s, 646, 372 - k * 6, 2.2, 'TB-TEXT', 'CLIENT ROMANS')
    lay.add_blockref('NORTH-A', (800, 400), dxfattribs={'layer': 'TB-TEXT'})
    ref = lay.add_blockref('DEMO-TB-A1', (641, 10), dxfattribs={'layer': 'TB-TEXT'})
    ref.add_auto_attribs({'PROJECT_NAME': 'SAMPLE FIBER PROJECT', 'DWG_NO': 'DCA-0001', 'SHEET': '1 OF 2', 'DATE': '01 JAN 2026', 'SCALE': '1:1000',
                          'DRAWN_BY': 'J. SAMPLE', 'CHECKED_BY': 'K. SAMPLE', 'APPROVED_BY': 'L. SAMPLE', 'REV': '0'})
    leg = doc.layouts.new('LEGEND')
    leg.page_setup(size=(420, 297), margins=(0, 0, 0, 0), units='mm')
    rect(leg, 10, 10, 410, 287, 'TB-FRAME')
    leg.add_viewport(center=(210, 160), size=(300, 230), view_center_point=(LX + 60, LY + 45), view_height=230 * 0.45).dxf.layer = 'VPORT'
    text(leg, 'LEGEND SHEET', 20, 20, 5, 'TB-TEXT', 'CLIENT ROMANS BOLD')
    doc.saveas(path)


# ---------------------------------------------------------------- (b) A3, a title block of plain texts, Arial Narrow
def client_b(path):
    doc = new_doc(4)  # model space in millimetres
    doc.styles.add('NARROW', font='arialn.ttf')
    L = doc.layers
    L.add('FOC', color=6, lineweight=60)
    L.add('POLES', color=2, lineweight=30)
    L.add('ANNO', color=7, lineweight=18)
    L.add('BORDER', color=7, lineweight=50)
    L.add('TITLE', color=7, lineweight=25)
    L.add('VIEWPORTS', color=8).dxf.plot = 0
    # one symbol, drawn in millimetres (5 m wide in the world)
    b = doc.blocks.new('NAP-BOX'); b.add_lwpolyline([(-2500, -1200), (2500, -1200), (2500, 1200), (-2500, 1200)], close=True)
    text(b, 'NAP', -1500, -600, 1200, '0', 'NARROW')
    msp = doc.modelspace()
    X0, Y0 = 250000.0, 400000.0  # a sample route in millimetres
    pts = [(X0 + i * 35000, Y0 + (i % 3) * 2000) for i in range(6)]
    msp.add_lwpolyline(pts, dxfattribs={'layer': 'FOC'})
    for i, p in enumerate(pts):
        msp.add_circle(p, 1200, dxfattribs={'layer': 'POLES'})
        text(msp, f'B-{i + 1}', p[0] + 2000, p[1] + 2000, 2500, 'ANNO', 'NARROW')
    msp.add_blockref('NAP-BOX', (X0 + 70000, Y0 + 6000), dxfattribs={'layer': 'POLES'})
    lay = doc.layouts.get('Layout1')
    doc.layouts.rename('Layout1', 'A3 SHEET')
    lay = doc.layouts.get('A3 SHEET')
    lay.page_setup(size=(420, 297), margins=(0, 0, 0, 0), units='mm')
    rect(lay, 10, 10, 410, 287, 'BORDER')
    lay.add_viewport(center=(150, 150), size=(270, 250), view_center_point=(X0 + 90000, Y0), view_height=250 * 1000).dxf.layer = 'VIEWPORTS'
    # the title block: cells x 290 .. 410, each row 10 mm; label at the left of its cell, its value right of it
    X1, X2 = 290.0, 410.0
    lay.add_line((X1, 10), (X1, 287), dxfattribs={'layer': 'BORDER'})
    rows = [('PROJECT:', 'XXXX'), ('LOCATION:', 'XXXX'), ('DWG NO:', 'XX-000'), ('SHEET:', '1 OF 1'), ('DATE:', 'DD/MM/YYYY'), ('SCALE:', '1:XXX'),
            ('PREPARED BY:', None), ('CHECKED BY:', None), ('APPROVED BY:', None), ('REV:', 'A'), ('CLIENT:', 'DEMO CLIENT B')]
    y = 10.0 + 10 * len(rows)
    lay.add_line((X1, y), (X2, y), dxfattribs={'layer': 'TITLE'})
    for lab, val in rows:
        y0 = y - 10
        lay.add_line((X1, y0), (X2, y0), dxfattribs={'layer': 'TITLE'})
        text(lay, lab, X1 + 2, y0 + 3.5, 2.5, 'TITLE', 'NARROW')
        if val is not None:
            text(lay, val, X1 + 32, y0 + 3.5, 3.0, 'TITLE', 'NARROW')
        y = y0
    text(lay, 'DEMO CLIENT B ENGINEERING', X1 + 10, 250, 5, 'TITLE', 'NARROW')
    text(lay, 'MADE-UP TEMPLATE FOR TESTS', X1 + 10, 240, 3, 'TITLE', 'NARROW')
    doc.saveas(path)


# ---------------------------------------------------------------- (c) inches, two sheets, no symbols
def client_c(path):
    doc = new_doc(2)  # model space in feet
    doc.styles.add('SIMPLEX', font='simplex.shx')
    L = doc.layers
    L.add('E-FIBER', color=4, lineweight=40)
    L.add('E-POLE', color=3, lineweight=25)
    L.add('E-ANNO', color=7, lineweight=13)
    L.add('G-BORDER', color=7, lineweight=60)
    L.add('G-TTLB', color=7, lineweight=25)
    msp = doc.modelspace()
    X0, Y0 = 3000.0, 6000.0  # feet
    pts = [(X0 + i * 120, Y0 + (i % 2) * 15) for i in range(7)]
    msp.add_lwpolyline(pts, dxfattribs={'layer': 'E-FIBER'})
    for i, p in enumerate(pts):
        msp.add_circle(p, 3, dxfattribs={'layer': 'E-POLE'})
        text(msp, f'C{i + 1}', p[0] + 5, p[1] + 5, 6, 'E-ANNO', 'SIMPLEX')
    sheets = (('PLAN', (34, 22), 0.5, (1.0, 1.0, 26.0, 21.0)), ('KEY PLAN', (17, 11), 0.25, (0.5, 0.5, 12.0, 10.5)))
    doc.layouts.rename('Layout1', 'KEY PLAN')
    doc.layouts.new('PLAN')
    for name, (w, h), m, vp in sheets:
        lay = doc.layouts.get(name)
        lay.page_setup(size=(w, h), margins=(0, 0, 0, 0), units='inch')
        rect(lay, m, m, w - m, h - m, 'G-BORDER')
        x1 = vp[2] + 0.25
        lay.add_line((x1, m), (x1, h - m), dxfattribs={'layer': 'G-BORDER'})
        lay.add_viewport(center=((vp[0] + vp[2]) / 2, (vp[1] + vp[3]) / 2), size=(vp[2] - vp[0], vp[3] - vp[1]), view_center_point=(X0 + 360, Y0), view_height=(vp[3] - vp[1]) * 60)
        k = (w - m - x1) / 7.5  # the title block's column scaled to the sheet
        tx = x1 + 0.2 * k
        text(lay, 'DEMO CLIENT C UTILITIES', tx, h - m - 0.8 * k, 0.35 * k, 'G-TTLB', 'SIMPLEX')
        text(lay, 'PROJECT TITLE', tx, 5.0 * k, 0.15 * k, 'G-TTLB', 'SIMPLEX')
        lay.add_mtext('SAMPLE PROJECT TITLE', dxfattribs={'layer': 'G-TTLB', 'style': 'SIMPLEX', 'char_height': 0.22 * k, 'insert': (tx, 4.75 * k), 'attachment_point': 1, 'width': 6 * k})
        for yy in (5.4, 4.0, 3.0, 2.0, 1.0):
            lay.add_line((x1, yy * k), (w - m, yy * k), dxfattribs={'layer': 'G-TTLB'})
        text(lay, 'DWG. NO.', tx, 3.65 * k, 0.15 * k, 'G-TTLB', 'SIMPLEX'); text(lay, 'C-100' if name == 'PLAN' else 'C-101', tx + 2.2 * k, 3.35 * k, 0.25 * k, 'G-TTLB', 'SIMPLEX')
        text(lay, 'DRAWN: JD', tx, 2.4 * k, 0.18 * k, 'G-TTLB', 'SIMPLEX'); text(lay, 'DATE: 01/01/26', tx + 3.6 * k, 2.4 * k, 0.18 * k, 'G-TTLB', 'SIMPLEX')
        text(lay, f'SHEET {1 if name == "PLAN" else 2} OF 2', tx, 1.4 * k, 0.22 * k, 'G-TTLB', 'SIMPLEX')
        text(lay, name, tx, 0.4 * k + m, 0.3 * k, 'G-TTLB', 'SIMPLEX')
    doc.layouts.set_active_layout('KEY PLAN')
    doc.saveas(path)


# ---------------------------------------------------------------- (d) (templates, Digester) a client's finished as-plan
def client_d(path):
    doc = new_doc(6)  # metres
    doc.styles.add('D-LABELS', font='arialn.ttf')
    doc.styles.add('D-SMALL', font='romans.shx', dxfattribs={'width': 0.8})  # (ROMANS narrowed, as drafters often have it: the kit takes its width factor)
    doc.styles.add('D-TITLE', font='arialbd.ttf')
    L = doc.layers
    for name, color, lw, lt in (('D-POLES', 3, 35, None), ('D-POLE-ID', 2, 18, None), ('D-POLE-NO', 1, 25, None), ('D-LATLONG', 8, 13, None),
                                ('D-FOC-PROPOSED', 1, 50, None), ('D-FOC-EXISTING', 5, 35, 'DASHED'), ('D-SPAN', 7, 13, None), ('D-CABLE-LABEL', 1, 18, None),
                                ('D-LOOP', 1, 25, None), ('D-CLOSURE', 1, 35, None), ('D-ROAD', 8, 18, None), ('D-STREET', 8, 13, None), ('D-GRID', 6, 25, None),
                                ('D-VICINITY', 8, 13, None), ('D-TABLE', 7, 25, None), ('D-TABLE-TEXT', 7, 18, None), ('D-LEGEND', 7, 18, None),
                                ('D-BORDER', 7, 50, None), ('D-TITLEBLOCK', 7, 25, None), ('D-VPORT', 8, 13, None)):
        ly = L.add(name, color=color, lineweight=lw)
        if lt: ly.dxf.linetype = lt
    L.get('D-VPORT').dxf.plot = 0
    b = doc.blocks.new('DEMO-POLE-NEW'); b.add_circle((0, 0), 1.0); b.add_line((-1, 0), (1, 0)); b.add_line((0, -1), (0, 1))
    b = doc.blocks.new('DEMO-POLE-EXIST'); b.add_circle((0, 0), 1.0); b.add_circle((0, 0), 0.4)
    b = doc.blocks.new('DEMO-CLOSURE'); b.add_lwpolyline([(-1.6, -0.9), (1.6, -0.9), (1.6, 0.9), (-1.6, 0.9)], close=True)
    b.add_attdef('CL_ID', insert=(2, 0), text='CL-00', dxfattribs={'height': 0.8, 'style': 'D-LABELS'})
    b = doc.blocks.new('DEMO-LOOP'); b.add_circle((0, -1.5), 1.5)
    b = doc.blocks.new('DEMO-LOGO-D'); b.add_lwpolyline([(0, 0), (30, 0), (30, 12), (0, 12)], close=True); text(b, 'DEMO CLIENT D', 2, 4, 3.5, '0', 'D-TITLE')
    msp = doc.modelspace()
    E0, N0 = 787300.0, 786100.0
    P = [(E0 + i * 40, N0) for i in range(8)] + [(E0 + 7 * 40, N0 + k * 40) for k in range(1, 7)]
    existing = {3, 9, 12}
    for i, (x, y) in enumerate(P):
        msp.add_blockref('DEMO-POLE-EXIST' if i in existing else 'DEMO-POLE-NEW', (x, y), dxfattribs={'layer': 'D-POLES'})
        up = i < 8
        tx, ty = (x - 3, y + 6) if up else (x + 6, y + 1)
        text(msp, f'CC-{9001 + i}', tx, ty, 2.2, 'D-POLE-ID', 'D-LABELS')
        text(msp, f'{7.1 + (y - N0) / 110574:.6f}%%d', tx, ty - 2.0, 1.2, 'D-LATLONG', 'D-SMALL')
        text(msp, f'{125.6 + (x - E0) / 110400:.6f}%%d', tx, ty - 3.6, 1.2, 'D-LATLONG', 'D-SMALL')
        cx, cy = (x + 4, y - 5) if up else (x - 6, y - 2)
        msp.add_circle((cx, cy), 2.2, dxfattribs={'layer': 'D-POLE-NO'})
        text(msp, str(i + 1), cx - 0.8 * len(str(i + 1)), cy - 1.2, 2.5, 'D-POLE-NO', 'D-LABELS')
    msp.add_lwpolyline(P, dxfattribs={'layer': 'D-FOC-PROPOSED'})
    msp.add_lwpolyline([(E0 - 60, N0 - 3), (E0 + 120, N0 - 3)], dxfattribs={'layer': 'D-FOC-EXISTING'})
    for a, c in zip(P[:-1], P[1:]):
        mx, my = (a[0] + c[0]) / 2, (a[1] + c[1]) / 2
        ang = math.degrees(math.atan2(c[1] - a[1], c[0] - a[0]))
        t = text(msp, f'{math.hypot(c[0] - a[0], c[1] - a[1]):.0f}m', mx + (1.5 if ang else -2), my + (1.2 if not ang else 0), 1.8, 'D-SPAN', 'D-SMALL')
        t.dxf.rotation = ang
    text(msp, 'PROPOSED 24C ADSS FOC', E0 + 60, N0 + 2.5, 2.5, 'D-CABLE-LABEL', 'D-LABELS')
    msp.add_blockref('DEMO-LOOP', (E0 + 80, N0 - 1), dxfattribs={'layer': 'D-LOOP'}); text(msp, '20m LOOP', E0 + 76, N0 - 8, 2.0, 'D-LOOP', 'D-LABELS')
    cl = msp.add_blockref('DEMO-CLOSURE', (E0 + 200, N0 + 1.5), dxfattribs={'layer': 'D-CLOSURE'}); cl.add_auto_attribs({'CL_ID': 'CL-01'})
    text(msp, 'PROPOSED CLOSURE CL-01', E0 + 186, N0 + 12, 2.0, 'D-CLOSURE', 'D-LABELS')
    for dy in (-6, 6):
        msp.add_lwpolyline([(E0 - 80, N0 + dy - 2), (E0 + 7 * 40 + dy - 2, N0 + dy - 2), (E0 + 7 * 40 + dy - 2, N0 + 280)], dxfattribs={'layer': 'D-ROAD'})
    text(msp, 'DEMO STREET', E0 + 120, N0 - 1.5, 3.0, 'D-STREET', 'D-SMALL')
    t = text(msp, 'DEMO AVENUE', E0 + 7 * 40 + 2, N0 + 150, 3.0, 'D-STREET', 'D-SMALL'); t.dxf.rotation = 90
    G0 = (E0 - 20, N0 - 140)
    for k in range(2):
        x0, y0 = G0[0] + k * 300, G0[1]
        rect(msp, x0, y0, x0 + 300, y0 + 300, 'D-GRID')
        text(msp, f'A-{k + 1}', x0 + 6, y0 + 270, 20, 'D-GRID', 'D-SMALL')
    # the vicinity map: a picture and the roads round it, far east of the plan
    VX, VY = E0 + 2500, N0
    img = doc.add_image_def(filename='DEMO_VICINITY.jpg', size_in_pixel=(640, 480))
    msp.add_image(img, insert=(VX, VY), size_in_units=(1200, 900), dxfattribs={'layer': 'D-VICINITY'})
    msp.add_circle((VX + 600, VY + 450), 150, dxfattribs={'layer': 'D-VICINITY'})
    text(msp, 'PROJECT AREA', VX + 520, VY + 620, 30, 'D-VICINITY', 'D-SMALL')
    # the PMI table, far from the plan (the client keeps its tables there)
    TX, TY = E0 + 5000, N0 + 600
    rows = [('TOTAL CABLE LENGTH', '552.0m'), ('AERIAL CABLE LENGTH', '552.0m'), ('UNDERGROUND CABLE LENGTH', '0.0m'), ('PROPOSED POLE', '11'), ('EXISTING GT POLE', '3'), ('PROPOSED HYBRID CLOSURE', '1')]
    W1, W2, RH = 220.0, 90.0, 16.0
    rect(msp, TX, TY - RH * (len(rows) + 1), TX + W1 + W2, TY, 'D-TABLE')
    text(msp, 'PROJECT MANAGEMENT INFORMATION', TX + 30, TY - 11, 7, 'D-TABLE-TEXT', 'D-TITLE')
    for k, (lab, val) in enumerate(rows):
        y = TY - RH * (k + 1)
        msp.add_line((TX, y), (TX + W1 + W2, y), dxfattribs={'layer': 'D-TABLE'})
        text(msp, lab, TX + 6, y - 11, 6, 'D-TABLE-TEXT', 'D-LABELS'); text(msp, val, TX + W1 + 8, y - 11, 6, 'D-TABLE-TEXT', 'D-LABELS')
    msp.add_line((TX + W1, TY - RH), (TX + W1, TY - RH * (len(rows) + 1)), dxfattribs={'layer': 'D-TABLE'})
    # the ROW table (as the company's: a municipality over its barangays' rows, totals)
    X0, XC, X1 = TX, TX + 340, TX + 680
    YT = TY - 400; YTI, YH, RH2 = YT - 36, YT - 67, 15.0
    YB = YH - 7 * RH2; YF = YB - RH2
    LA = {'layer': 'D-TABLE'}
    for y in (YT, YTI, YH, YH - 4 * RH2, YB, YF):
        msp.add_line((X0, y), (X1, y), dxfattribs=LA)
    for k in (1, 2, 3, 5, 6):
        msp.add_line((XC, YH - k * RH2), (X1, YH - k * RH2), dxfattribs=LA)
    for x, y1 in ((X0, YT), (X1, YT), (XC, YTI)):
        msp.add_line((x, YF), (x, y1), dxfattribs=LA)
    def mt(txt, x, y, h, att, w):
        msp.add_mtext(txt, dxfattribs={'layer': 'D-TABLE-TEXT', 'insert': (x, y), 'char_height': h, 'attachment_point': att, 'width': w, 'style': 'D-LABELS'})
    mt('RIGHT OF WAY AREA COVERAGE', (X0 + X1) / 2, (YT + YTI) / 2, 14, 5, 600)
    mt('MUNICIPALITY', (X0 + XC) / 2, (YTI + YH) / 2, 9, 5, 300)
    mt('BARANGAY', (XC + X1) / 2, (YTI + YH) / 2, 9, 5, 300)
    for k, (y1, y0, nm) in enumerate(((YH, YH - 4 * RH2, 'DEMO CITY'), (YH - 4 * RH2, YB, 'DEMO TOWN'))):
        mt(nm, X0 + 12, (y1 + y0) / 2 + 4.5, 9, 1, XC - X0 - 24)
    for k in range(6):
        mt(f'DEMO BRGY {k + 1}', XC + 122, YH - k * RH2 - 3, 9, 1, 200)
    mt('TOTAL - 2', X0 + 140, YB - 3, 9, 1, 120)
    mt('TOTAL - 6', XC + 126, YB - 3, 9, 1, 120)
    # the legend
    LX, LY = TX + 900, TY
    rect(msp, LX, LY - 200, LX + 300, LY, 'D-LEGEND')
    text(msp, 'LEGEND', LX + 110, LY - 20, 12, 'D-LEGEND', 'D-TITLE')
    for k, (blk, words) in enumerate((('DEMO-POLE-NEW', 'PROPOSED POLE'), ('DEMO-POLE-EXIST', 'EXISTING POLE'), ('DEMO-CLOSURE', 'SPLICE CLOSURE'))):
        y = LY - 50 - k * 35
        msp.add_blockref(blk, (LX + 30, y), dxfattribs={'layer': 'D-LEGEND', 'xscale': 6, 'yscale': 6})
        text(msp, words, LX + 70, y - 4, 9, 'D-LEGEND', 'D-LABELS')
    msp.add_line((LX + 15, LY - 160), (LX + 50, LY - 160), dxfattribs={'layer': 'D-FOC-PROPOSED'}); text(msp, 'PROPOSED FOC', LX + 70, LY - 164, 9, 'D-LEGEND', 'D-LABELS')
    # the sheets (A3, mm)
    def frame_tb(lay, values):
        rect(lay, 10, 10, 410, 287, 'D-BORDER')
        lay.add_line((300, 10), (300, 287), dxfattribs={'layer': 'D-BORDER'})
        lay.add_blockref('DEMO-LOGO-D', (305, 268), dxfattribs={'layer': 'D-TITLEBLOCK'})
        y = 10.0 + 10 * len(values)
        lay.add_line((300, y), (410, y), dxfattribs={'layer': 'D-TITLEBLOCK'})
        for lab, val in values:
            y0 = y - 10
            lay.add_line((300, y0), (410, y0), dxfattribs={'layer': 'D-TITLEBLOCK'})
            text(lay, lab, 302, y0 + 3.5, 2.2, 'D-TITLEBLOCK', 'D-LABELS')
            if val:
                text(lay, val, 330, y0 + 3.5, 2.8, 'D-TITLEBLOCK', 'D-LABELS')
            y = y0
    def tbv(sheet_no, title, scale):
        return [('PROJECT:', 'DEMO FIBER ROUTE 2026'), ('LOCATION:', 'DEMO CITY'), ('CLIENT:', 'DEMO CLIENT D TELECOM'), ('TITLE:', title), ('SHEET:', sheet_no),
                ('SCALE:', scale), ('DATE:', '12 NOV 2026'), ('DRAWN BY:', 'D. DRAFTER'), ('CHECKED BY:', 'E. CHECKER')]
    doc.layouts.rename('Layout1', 'COVER')
    sheets = ['COVER', 'LEGEND', 'LOCATION MAP', 'KEY PLAN', 'PLAN-1', 'PLAN-2', 'PMI', 'ROW']
    for nm in sheets[1:]:
        doc.layouts.new(nm)
    for nm in sheets:
        doc.layouts.get(nm).page_setup(size=(420, 297), margins=(0, 0, 0, 0), units='mm')
    cov = doc.layouts.get('COVER')
    rect(cov, 10, 10, 410, 287, 'D-BORDER')
    cov.add_blockref('DEMO-LOGO-D', (20, 255), dxfattribs={'layer': 'D-TITLEBLOCK', 'xscale': 1.5, 'yscale': 1.5})
    text(cov, 'FIBER OPTIC CABLE AS-PLAN', 210, 190, 12, 'D-TITLEBLOCK', 'D-TITLE', align='MIDDLE_CENTER')
    text(cov, 'DEMO FIBER ROUTE 2026', 210, 160, 9, 'D-TITLEBLOCK', 'D-TITLE', align='MIDDLE_CENTER')
    text(cov, 'DEMO CITY', 210, 140, 6, 'D-TITLEBLOCK', 'D-LABELS', align='MIDDLE_CENTER')
    text(cov, 'PREPARED FOR DEMO CLIENT D TELECOM', 210, 110, 4, 'D-TITLEBLOCK', 'D-LABELS', align='MIDDLE_CENTER')
    text(cov, '12 NOV 2026', 210, 95, 4, 'D-TITLEBLOCK', 'D-LABELS', align='MIDDLE_CENTER')
    def vp(lay, c, size, view_c, view_h):
        lay.add_viewport(center=c, size=size, view_center_point=view_c, view_height=view_h).dxf.layer = 'D-VPORT'
    lg = doc.layouts.get('LEGEND'); frame_tb(lg, tbv('1 OF 1', 'LEGEND', 'NTS')); vp(lg, (155, 150), (270, 250), (LX + 150, LY - 100), 230)
    lm = doc.layouts.get('LOCATION MAP'); frame_tb(lm, tbv('1 OF 1', 'LOCATION MAP', 'NTS')); vp(lm, (155, 150), (270, 250), (VX + 600, VY + 450), 1000)
    kp = doc.layouts.get('KEY PLAN'); frame_tb(kp, tbv('1 OF 1', 'KEY PLAN', '1:3000')); vp(kp, (155, 150), (270, 250), (G0[0] + 300, G0[1] + 150), 750)
    for k in range(2):
        pl = doc.layouts.get(f'PLAN-{k + 1}'); frame_tb(pl, tbv(f'{k + 1} OF 2', 'ROUTE PLAN', '1:1200'))
        vp(pl, (155, 150), (270, 250), (G0[0] + 150 + k * 300, G0[1] + 150), 300)
    pm = doc.layouts.get('PMI'); frame_tb(pm, tbv('1 OF 1', 'PMI', 'NTS')); vp(pm, (155, 150), (270, 250), (TX + 155, TY - 56), 330)
    rw = doc.layouts.get('ROW'); frame_tb(rw, tbv('1 OF 1', 'RIGHT OF WAY', 'NTS')); vp(rw, (155, 150), (270, 250), ((X0 + X1) / 2, (YT + YF) / 2), 700)
    doc.layouts.set_active_layout('COVER')
    doc.saveas(path)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for key, name, fn in (('a', 'client-a-made-up.dxf', client_a), ('b', 'client-b-made-up.dxf', client_b), ('c', 'client-c-made-up.dxf', client_c), ('d', 'client-d-made-up-plan.dxf', client_d)):
        if ONLY and key not in ONLY: continue
        p = os.path.join(OUT, name); fn(p); print('written', p, os.path.getsize(p), 'bytes')
