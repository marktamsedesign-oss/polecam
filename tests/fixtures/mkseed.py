"""A made-up G-eSAA plan template for tests (tests/fixtures/plan-seed-made-up.dxf): a GEO sheet (viewport + title fields), a KEYMAP
sheet, nothing from any company. Made with ezdxf (tests/requirements.txt): python3 tests/fixtures/mkseed.py tests/fixtures/plan-seed-made-up.dxf
(Drawing preview) --square: the sheets' map viewport square, 260 x 260 mm, as the company template's (the plan aims it at its sheet's cell,
so the PDF's GEO sheets print the plan): python3 tests/fixtures/mkseed.py --square tests/fixtures/plan-seed-made-up-square.dxf
(beta 7.11, Drawing tools) --blocks: also made-up symbols under the block names the plan builder looks for (a pole, a closure's pentagon
with its two attributes, a loop, the guys, a grounding, the arms, a NAP, a riser, a tower and an ODF with their attributes, an OLT, a
handhole), plain shapes drawn here, so the tests can draw the attachments the builder leaves out without them:
python3 tests/fixtures/mkseed.py --square --blocks tests/fixtures/plan-seed-made-up-blocks.dxf"""
import sys, math, ezdxf
square = '--square' in sys.argv
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
