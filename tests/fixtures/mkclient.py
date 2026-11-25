"""(beta 7.15, Client templates) Made-up "DEMO CLIENT" drawing templates, as another client might send them, for the DXF synthesizer's tests
(vendor/synth/dxfsynth.js: tests/dxf-synth.test.cjs, tests/client-templates.spec.cjs). Nothing here comes from any company or client: every name, text,
number and drawing is made up. Made with ezdxf (tests/requirements.txt):

    python3 tests/fixtures/mkclient.py tests/fixtures      (writes the three files below)

  client-a-made-up.dxf  (a) A1 in millimetres, model space in metres. Sheets PLAN (the drawing's active sheet: a frame, a main viewport that
                        is not square, a legend viewport, the title block) and LEGEND. The title block is a BLOCK with attributes (PROJECT_NAME,
                        DWG_NO, SHEET, DATE, SCALE, DRAWN_BY, CHECKED_BY, APPROVED_BY, REV) beside its labels; a ROMANS (SHX) text style and a
                        bold one; layers FO-CABLE-PROP (0.50 mm), FO-CABLE-EXIST (0.35, dashed), POLE (0.35), TEXT, ROAD…; symbol blocks
                        POLE-NEW, POLE-EXIST, SPLICE-CLOSURE (attributes CL_ID, CL_TYPE) and HANDHOLE; a sample route in model space and a legend.
  client-b-made-up.dxf  (b) A3 in millimetres, model space in millimetres. One sheet, A3 SHEET (the active one). The title block is plain TEXT on
                        the sheet: labels and their value texts ("PROJECT:" / "XXXX"), some labels with no value text (PREPARED BY, CHECKED BY,
                        APPROVED BY); an Arial Narrow (TTF) text style; one symbol block, NAP-BOX, drawn in millimetres.
  client-c-made-up.dxf  (c) Paper in inches, model space in feet. Two sheets: PLAN (ANSI D) and KEY PLAN (ANSI B, the active one); no symbol
                        blocks; labels and values in one text ("DRAWN: JD", "SHEET 1 OF 2"), a label with its value under it (PROJECT TITLE)."""
import sys, os, math, ezdxf

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))


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
        t.set_placement((x, y), align=align)
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


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (('client-a-made-up.dxf', client_a), ('client-b-made-up.dxf', client_b), ('client-c-made-up.dxf', client_c)):
        p = os.path.join(OUT, name); fn(p); print('written', p, os.path.getsize(p), 'bytes')
