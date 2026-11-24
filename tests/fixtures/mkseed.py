"""A made-up G-eSAA plan template for tests (tests/fixtures/plan-seed-made-up.dxf): a GEO sheet (viewport + title fields), a KEYMAP
sheet, nothing from any company. Made with ezdxf (tests/requirements.txt): python3 tests/fixtures/mkseed.py tests/fixtures/plan-seed-made-up.dxf"""
import sys, ezdxf
doc = ezdxf.new('R2013', setup=True)
msp = doc.modelspace()
for name in ('GEO', 'KEYMAP'):
    lay = doc.layouts.new(name)
    lay.page_setup(size=(420, 297), margins=(10, 10, 10, 10), units='mm')
    lay.add_viewport(center=(180, 148), size=(330, 260), view_center_point=(0, 0), view_height=400)
    lay.add_lwpolyline([(5, 5), (415, 5), (415, 292), (5, 292)], close=True)
    for i, f in enumerate(('@@PROJECT@@', '@@SHEET@@', '@@DATE@@', '@@DRAWN@@')):
        lay.add_text(f, dxfattribs={'height': 3, 'insert': (350, 40 - i * 6)})
doc.saveas(sys.argv[1])
print('seed written', sys.argv[1])
