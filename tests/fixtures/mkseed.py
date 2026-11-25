"""A made-up G-eSAA plan template for tests (tests/fixtures/plan-seed-made-up.dxf): a GEO sheet (viewport + title fields), a KEYMAP
sheet, nothing from any company. Made with ezdxf (tests/requirements.txt): python3 tests/fixtures/mkseed.py tests/fixtures/plan-seed-made-up.dxf
(Drawing preview) --square: the sheets' map viewport square, 260 x 260 mm, as the company template's (the plan aims it at its sheet's cell,
so the PDF's GEO sheets print the plan): python3 tests/fixtures/mkseed.py --square tests/fixtures/plan-seed-made-up-square.dxf
(beta 7.11, ROW table) --row: also a ROW AREA COVERAGE sheet and a made-up right-of-way table in model space, far from the plan as a
template keeps its tables (the plan moves them beside it): a title row, a header row MUNICIPALITY | BARANGGAY, two city / municipality
cells over 4 and 3 barangay rows, a TOTAL row and the @@ROW_...@@ fields, its lines drawn as LINEs; the sheet's viewport over most of the
sheet, the table in its upper part; beside the table, a made-up legend on a LEGENDS sheet of its own (its window close to the table's):
python3 tests/fixtures/mkseed.py --row tests/fixtures/row-table-made-up.dxf; --row-cells: the same table drawn as closed LWPOLYLINE
cells (a rectangle round each cell and one round the table): python3 tests/fixtures/mkseed.py --row-cells tests/fixtures/row-table-made-up-cells.dxf
(beta 7.11, Drawing tools) --blocks: also made-up symbols under the block names the plan builder looks for (a pole, a closure's pentagon
with its two attributes, a loop, the guys, a grounding, the arms, a NAP, a riser, a tower and an ODF with their attributes, an OLT, a
handhole), plain shapes drawn here, so the tests can draw the attachments the builder leaves out without them:
python3 tests/fixtures/mkseed.py --square --blocks tests/fixtures/plan-seed-made-up-blocks.dxf"""
import sys, math, ezdxf
square = '--square' in sys.argv
row = '--row' in sys.argv or '--row-cells' in sys.argv
blocks = '--blocks' in sys.argv
out = [a for a in sys.argv[1:] if not a.startswith('--')][0]
doc = ezdxf.new('R2013', setup=True)
msp = doc.modelspace()
for name in ('GEO', 'KEYMAP'):
    lay = doc.layouts.new(name)
    lay.page_setup(size=(420, 297), margins=(10, 10, 10, 10), units='mm')
    if square:
        lay.add_viewport(center=(150, 148), size=(260, 260), view_center_point=(0, 0), view_height=440)
    else:
        lay.add_viewport(center=(180, 148), size=(330, 260), view_center_point=(0, 0), view_height=400)
    lay.add_lwpolyline([(5, 5), (415, 5), (415, 292), (5, 292)], close=True)
    for i, f in enumerate(('@@PROJECT@@', '@@SHEET@@', '@@DATE@@', '@@DRAWN@@')):
        lay.add_text(f, dxfattribs={'height': 3, 'insert': (350, 40 - i * 6)})
if row:
    X0, XC, X1 = 14000.0, 14340.0, 14680.0  # the table's left edge, its column line, its right edge
    YT, YTI, YH, RH = 16600.0, 16564.0, 16533.0, 15.0  # its top, the title row's foot, the header row's foot (the body's top), a body row
    YB = YH - 7 * RH  # the body's foot (the TOTAL row's top)
    YF = YB - RH  # the table's foot
    doc.layers.add('ROW LINES', color=7)
    doc.layers.add('ROW TEXT', color=7)
    LA = {'layer': 'ROW LINES', 'color': 7, 'lineweight': 35}
    if '--row-cells' in sys.argv:
        def rect(x0, y0, x1, y1):
            msp.add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], close=True, dxfattribs=LA)
        rect(X0, YF, X1, YT)  # round the table
        rect(X0, YTI, X1, YT)  # the title
        rect(X0, YH, XC, YTI); rect(XC, YH, X1, YTI)  # the header
        rect(X0, YH - 4 * RH, XC, YH); rect(X0, YB, XC, YH - 4 * RH)  # the two city / municipality cells
        for k in range(7):
            rect(XC, YH - (k + 1) * RH, X1, YH - k * RH)  # the barangay rows
        rect(X0, YF, XC, YB); rect(XC, YF, X1, YB)  # the totals
    else:
        for y in (YT, YTI, YH, YH - 4 * RH, YB, YF):
            msp.add_line((X0, y), (X1, y), dxfattribs=LA)
        for k in (1, 2, 3, 5, 6):
            msp.add_line((XC, YH - k * RH), (X1, YH - k * RH), dxfattribs=LA)
        for x, y1 in ((X0, YT), (X1, YT), (XC, YTI)):
            msp.add_line((x, YF), (x, y1), dxfattribs=LA)
    def mtext(txt, x, y, h, att, w):
        msp.add_mtext(txt, dxfattribs={'layer': 'ROW TEXT', 'insert': (x, y), 'char_height': h, 'attachment_point': att, 'width': w})
    mtext('{\\fArial|b1|i0|c0|p34;RIGHT OF WAY AREA COVERAGE}', (X0 + X1) / 2, (YT + YTI) / 2, 14, 5, 600)
    mtext('{\\fArial|b0|i1|c0|p34;MUNICIPALITY}', (X0 + XC) / 2, (YTI + YH) / 2, 9, 5, 300)
    mtext('{\\fArial|b0|i1|c0|p34;BARANGGAY}', (XC + X1) / 2, (YTI + YH) / 2, 9, 5, 300)
    for k, (y1, y0) in enumerate(((YH, YH - 4 * RH), (YH - 4 * RH, YB))):  # a city / municipality: its paragraph centred in its box
        mtext('\\pxqc;{\\fArial|b0|i0|c0|p34;@@ROW_MUNICIPALITY_%d@@}' % (k + 1), X0 + 12, (y1 + y0) / 2 + 4.5, 9, 1, XC - X0 - 24)
    for k in range(7):  # a barangay: from a third of its row, its top 3 below the row's
        mtext('{\\fArial|b0|i0|c0|p34;@@ROW_BARANGAY_%d@@}' % (k + 1), XC + 122, YH - k * RH - 3, 9, 1, 200)
    mtext('{\\fArial|b0|i0|c0|p34;TOTAL - @@ROW_MUNICIPALITIES@@}', X0 + 140, YB - 3, 9, 1, 120)
    mtext('{\\fArial|b0|i0|c0|p34;TOTAL - @@ROW_BARANGAYS@@}', XC + 126, YB - 3, 9, 1, 120)
    # a made-up legend beside the table (another table of the template, its own sheet)
    LX0, LX1, LY0, LY1 = 14760.0, 15260.0, 16380.0, 16560.0
    for y in (LY0, LY1 - 30) + tuple(LY0 + 30 * k for k in range(1, 5)) + (LY1,):
        msp.add_line((LX0, y), (LX1, y), dxfattribs=LA)
    for x in (LX0, LX1):
        msp.add_line((x, LY0), (x, LY1), dxfattribs=LA)
    mtext('{\\fArial|b1|i0|c0|p34;DEMO LEGEND}', (LX0 + LX1) / 2, LY1 - 15, 12, 5, 400)
    for k in range(5):
        mtext('{\\fArial|b0|i0|c0|p34;DEMO SAMPLE %d}' % (k + 1), LX0 + 20, LY1 - 30 - k * 30 - 10.5, 9, 1, 300)
    for name, size, centre in (('LEGENDS', (300, 270), ((LX0 + LX1) / 2, 16470.0)), ('ROW AREA COVERAGE', (400, 270), ((X0 + X1) / 2, 16504.0))):
        lay = doc.layouts.new(name)
        lay.page_setup(size=(420, 297), margins=(10, 10, 10, 10), units='mm')
        lay.add_viewport(center=(210, 150), size=size, view_center_point=centre, view_height=480)  # (the ROW table's top 30 % down its window)
        lay.add_lwpolyline([(5, 5), (415, 5), (415, 292), (5, 292)], close=True)
if blocks:
    def blk(name):
        return doc.blocks.new(name=name)
    def att(b, tag, x, y, h=0.5):
        b.add_attdef(tag, insert=(x, y), dxfattribs={'height': h})
    def poly(b, pts, close=False):
        b.add_lwpolyline(pts, close=close)
    b = blk('P-POLE'); b.add_circle((0, 0), 1.5); b.add_line((-1.5, 0), (1.5, 0)); b.add_line((0, -1.5), (0, 1.5))
    b = blk('existing electric pole'); b.add_line((-2.6, -2.6), (2.6, 2.6)); b.add_line((-2.6, 2.6), (2.6, -2.6))
    b = blk('existing telecom pole'); b.add_circle((0, 0), 1.2)
    b = blk('P-Joint'); poly(b, [(math.cos(math.radians(90 + 72 * i)), math.sin(math.radians(90 + 72 * i))) for i in range(5)], True); att(b, 'JT_ID', 1.3, 0.3); att(b, 'JOINT', 1.3, -0.5)
    b = blk('loopp'); b.add_line((-1.9, 0), (1.9, 0)); b.add_circle((0, -1.4), 1.4)
    for nm in ('SG', 'HG', 'SW', 'SWH', 'proposed pole to pole guy'):
        b = blk(nm); b.add_line((0, 0), (4, 0)); b.add_circle((4.4, 0), 0.4); b.add_text('SG 6M', dxfattribs={'height': 0.6, 'insert': (1, 0.4)})
    b = blk('proposed grounding'); b.add_line((0, 0), (8, 0)); b.add_line((8, -2), (8, 2)); b.add_line((8.6, -1.3), (8.6, 1.3)); b.add_line((9.2, -0.6), (9.2, 0.6))
    for nm in ('proposed single arm', 'double arm'):
        b = blk(nm); poly(b, [(0, 0), (0, -5)]); b.add_line((-0.6, -5), (0.6, -5))
    for nm in ('10 pin', 'extension 44 arm', 'extension arm 26'):
        b = blk(nm); poly(b, [(0, 0), (6, 0)]); b.add_line((6, -0.6), (6, 0.6))
    for nm in ('proposed NAP', 'existing NAP'):
        b = blk(nm); poly(b, [(-5, -2), (5, -2), (5, 2), (-5, 2)], True); b.add_text('NAP', dxfattribs={'height': 1.5, 'insert': (-1.5, -0.7)})
    b = blk('proposed riser'); b.add_circle((0, 0), 2); b.add_line((0, -2), (0, 2))
    b = blk('X-BTS'); poly(b, [(-5, 0), (0, 20), (5, 0)]); b.add_line((-3, 8), (3, 8)); att(b, 'BTS_NAME', 0, -2, 1); att(b, 'PLA_ID', 0, -3.5, 0.8)
    for nm in ('P-HOST', 'X-HOST'):
        b = blk(nm); poly(b, [(-20, -20), (20, -20), (20, 20), (-20, 20)], True); att(b, 'HST_NAM', 22, 4, 4); att(b, 'HST_COD', 22, -2, 4); att(b, 'HST_LET', -4, -2, 6)
    b = blk('OLT1'); poly(b, [(-3.7, -3.7), (3.7, -3.7), (3.7, 3.7), (-3.7, 3.7)], True); b.add_line((-3.7, -3.7), (3.7, 3.7))
    b = blk('proposed Handhole'); poly(b, [(-2, -1.5), (2, -1.5), (2, 1.5), (-2, 1.5)], True)
doc.saveas(out)
print('seed written', out)
