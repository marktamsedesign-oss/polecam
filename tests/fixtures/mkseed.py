"""A made-up G-eSAA plan template for tests (tests/fixtures/plan-seed-made-up.dxf): a GEO sheet (viewport + title fields), a KEYMAP
sheet, nothing from any company. Made with ezdxf (tests/requirements.txt): python3 tests/fixtures/mkseed.py tests/fixtures/plan-seed-made-up.dxf
(Drawing preview) --square: the sheets' map viewport square, 260 x 260 mm, as the company template's (the plan aims it at its sheet's cell,
so the PDF's GEO sheets print the plan): python3 tests/fixtures/mkseed.py --square tests/fixtures/plan-seed-made-up-square.dxf"""
import sys, ezdxf
square = '--square' in sys.argv
out = [a for a in sys.argv[1:] if a != '--square'][0]
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
doc.saveas(out)
print('seed written', out)
