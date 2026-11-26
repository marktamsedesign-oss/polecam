"""(beta 7.15, CEF template) A made-up client's CEF template for tests (tests/fixtures/cef-seed-made-up.dxf): the "CEF seed" the app makes
from a client's own DXF, as the contract's section 4 describes it, with nothing from any client. Made with ezdxf (tests/requirements.txt):
    python3 tests/fixtures/mkcefseed.py tests/fixtures/cef-seed-made-up.dxf
- a sheet (layout) CEF, A3 landscape in millimetres: a client-like frame (a heavy border on a layer of its own), a title block along the foot
  with its labels and its fields (@@NAME@@) as TEXT, MTEXT, block attributes (a names block, DEMO_TB_NAMES) and a text inside a block
  (DEMO_STAMP: the sheet's title, which differs from sheet to sheet), a made-up logo (a block, DEMO_CLIENT_LOGO, and a linked picture,
  demo_client_logo.png, not supplied), the drawing area (the largest viewport, 400 x 236 mm) and a small key plan viewport in the title block;
  the line of who exported under the frame (@@EXPORTED_BY@@)
- the text styles G-ESAA TEXT (romans.shx) and G-ESAA TEXT BOLD (romand.shx); client layers with their own line weights
- the look as section 3 has it: the root dictionary's XRECORD G-ESAA_LOOK, its JSON in group 1 strings of at most 250 characters (text style,
  bold, size factor 1.1, line weights unlike the CEF's own, CEF-TEXT put on the client's DEMO-TEXT layer)
- model space empty; the drawing's first sheet is ezdxf's Layout1 (empty), so CEF is not the paper space every drawing has
--active: CEF is that first sheet (Layout1 renamed), as a template saved with its CEF sheet open:
    python3 tests/fixtures/mkcefseed.py --active tests/fixtures/cef-seed-made-up-active.dxf
--plain: no look and no G-ESAA TEXT style (a template made before the look was written): the CEF's own fonts and weights on the client's sheet
  (not kept in the repository: tests/cef-template.test.cjs takes the look out of the made-up template itself)"""
import sys, json, ezdxf

active = '--active' in sys.argv
plain = '--plain' in sys.argv
out = [a for a in sys.argv[1:] if not a.startswith('--')][0]
doc = ezdxf.new('R2013', setup=True)
doc.header['$INSUNITS'] = 6  # model space in metres, as the CEF's DXF
doc.header['$MEASUREMENT'] = 1
for name, color, lw in (('DEMO-BORDER', 7, 70), ('DEMO-TITLE', 7, 35), ('DEMO-TEXT', 7, 18), ('DEMO-LOGO', 5, 25), ('DEMO-VPORT', 8, 13)):
    doc.layers.add(name, color=color, lineweight=lw)
if not plain:
    doc.styles.add('G-ESAA TEXT', font='romans.shx')
    doc.styles.add('G-ESAA TEXT BOLD', font='romand.shx')
doc.styles.add('DEMO LABEL', font='romans.shx')

if active:
    doc.layouts.rename('Layout1', 'CEF')
    lay = doc.layouts.get('CEF')
else:
    lay = doc.layouts.new('CEF')
lay.page_setup(size=(420, 297), margins=(0, 0, 0, 0), units='mm')

TX = {'layer': 'DEMO-TEXT', 'style': 'DEMO LABEL'}
def label(s, x, y, h=1.8):
    lay.add_text(s, dxfattribs={**TX, 'height': h, 'insert': (x, y)})
def field(s, x, y, h=2.5, style='G-ESAA TEXT'):
    lay.add_text(s, dxfattribs={'layer': 'DEMO-TEXT', 'style': style if not plain else 'DEMO LABEL', 'height': h, 'insert': (x, y)})
def line(a, b, layer='DEMO-TITLE'):
    lay.add_line(a, b, dxfattribs={'layer': layer})

# the frame: a heavy border, and the title block along its foot (10 to 45 mm up the sheet)
lay.add_lwpolyline([(10, 10), (410, 10), (410, 287), (10, 287)], close=True, dxfattribs={'layer': 'DEMO-BORDER'})
line((10, 45), (410, 45))
for x in (70, 130, 220, 300, 350):
    line((x, 10), (x, 45))
for y in (21.67, 33.33):
    line((130, y), (410, y))

# the client's logo: a made-up block, and a linked picture beside it (its file is not supplied)
logo = doc.blocks.new('DEMO_CLIENT_LOGO')
logo.add_circle((0, 0), 6, dxfattribs={'layer': 'DEMO-LOGO'})
logo.add_lwpolyline([(-4, -3), (4, -3), (0, 4)], close=True, dxfattribs={'layer': 'DEMO-LOGO'})
logo.add_text('DEMO CLIENT', dxfattribs={'layer': 'DEMO-LOGO', 'style': 'DEMO LABEL', 'height': 2.2, 'insert': (8, -1)})
lay.add_blockref('DEMO_CLIENT_LOGO', (18, 36), dxfattribs={'layer': 'DEMO-LOGO'})
img = doc.add_image_def(filename='demo_client_logo.png', size_in_pixel=(200, 80))
lay.add_image(img, insert=(14, 13), size_in_units=(30, 12), dxfattribs={'layer': 'DEMO-LOGO'})

# the key plan: a small viewport in the title block (the drawing area is the largest one)
lay.add_viewport(center=(100, 27.5), size=(56, 31), view_center_point=(0, 0), view_height=100, dxfattribs={'layer': 'DEMO-VPORT'})

# the fields: project, site, location (TEXT; the site in an MTEXT box), the sheet's title in a block of its own (DEMO_STAMP), serial,
# coordinates, the plan kind; the names as the attributes of a block; sheet, date, scale, drawing number and issue
label('PROJECT', 131.5, 41.5); field('@@LINK@@', 131.5, 35.5, 2.8, 'G-ESAA TEXT BOLD')
label('SITE', 131.5, 29.8)
lay.add_mtext('@@SITE_ID@@ @@SITE_NAME@@', dxfattribs={'layer': 'DEMO-TEXT', 'style': 'G-ESAA TEXT' if not plain else 'DEMO LABEL', 'char_height': 2.5, 'insert': (131.5, 28.2), 'width': 60, 'attachment_point': 1})
label('LOCATION', 131.5, 18.1); field('@@LOCATION@@', 131.5, 12.5, 2.2)
stamp = doc.blocks.new('DEMO_STAMP')
stamp.add_text('DRAWING TITLE', dxfattribs={'layer': 'DEMO-TEXT', 'style': 'DEMO LABEL', 'height': 1.8, 'insert': (0, 8)})
stamp.add_mtext('{\\fArial|b1|i0|c0|p34;@@SHEET_TITLE@@}', dxfattribs={'layer': 'DEMO-TEXT', 'char_height': 3, 'insert': (0, 5), 'width': 70, 'attachment_point': 1})
stamp.add_text('@@PLAN_KIND@@ - @@PROJECT_TYPE@@', dxfattribs={'layer': 'DEMO-TEXT', 'style': 'DEMO LABEL', 'height': 1.8, 'insert': (0, -4)})
lay.add_blockref('DEMO_STAMP', (222, 36))
label('SERIAL', 221.5, 18.1); field('@@SERIAL@@', 221.5, 12.5, 2.2)
label('COORDINATES (WGS84)', 301.5, 18.1); field('@@COORDINATES@@', 301.5, 12.5, 1.9)
label('CONTRACTOR', 301.5, 41.5); field('@@COMPANY_NAME@@', 301.5, 36, 2.2)
names = doc.blocks.new('DEMO_TB_NAMES')
for i, (tag, cap) in enumerate((('PREPARED', 'PREPARED BY'), ('CHECKED', 'CHECKED BY'), ('APPROVED', 'APPROVED BY'))):
    names.add_text(cap, dxfattribs={'layer': 'DEMO-TEXT', 'style': 'DEMO LABEL', 'height': 1.5, 'insert': (0, -i * 3.9 + 1.2)})
    names.add_attdef(tag, insert=(18, -i * 3.9 + 1.2), dxfattribs={'layer': 'DEMO-TEXT', 'style': 'G-ESAA TEXT' if not plain else 'DEMO LABEL', 'height': 1.8})
ref = lay.add_blockref('DEMO_TB_NAMES', (301.5, 30))
for tag in ('PREPARED', 'CHECKED', 'APPROVED'):
    ref.add_attrib(tag, '@@%s_BY@@' % tag, insert=(0, 0))
for a, (tag, _) in zip(ref.attribs, (('PREPARED', 0), ('CHECKED', 1), ('APPROVED', 2))):
    i = ('PREPARED', 'CHECKED', 'APPROVED').index(tag)
    a.dxf.insert = (319.5, 30 - i * 3.9 + 1.2); a.dxf.height = 1.8; a.dxf.layer = 'DEMO-TEXT'; a.dxf.style = 'G-ESAA TEXT' if not plain else 'DEMO LABEL'
    a.dxf.owner = ref.dxf.handle  # (an attribute belongs to its insert, as AutoCAD writes it)
label('SHEET', 351.5, 41.5); field('@@SHEET_NO@@', 351.5, 36, 2.5)
label('DATE', 381.5, 41.5); field('@@DATE@@', 381.5, 36, 2.2)
label('SCALE', 351.5, 29.8); field('@@SCALE@@', 351.5, 24.2, 2.2)
label('DWG NO.', 351.5, 18.1); field('@@DWG_NO@@', 351.5, 12.5, 2.2)
label('REV', 391.5, 18.1); field('@@ISSUE_NO@@', 391.5, 12.5, 2.2)
for x in (380, 390):
    line((x, 33.33 if x == 380 else 10), (x, 45 if x == 380 else 21.67))
lay.add_text('@@EXPORTED_BY@@', dxfattribs={'layer': 'DEMO-TEXT', 'style': 'DEMO LABEL', 'height': 1.2, 'insert': (410, 6)}).set_placement((410, 6), align=ezdxf.enums.TextEntityAlignment.BOTTOM_RIGHT)

# the drawing area: the largest viewport, over the frame above the title block (model space is empty: the app aims it at each page)
lay.add_viewport(center=(210, 166.5), size=(398, 239), view_center_point=(0, 0), view_height=239, dxfattribs={'layer': 'DEMO-VPORT'})

if not plain:  # the look (section 3)
    look = {'v': 1, 'name': 'DEMO CLIENT A3', 'made': '2026-11-25T00:00:00Z', 'from': 'demo-client-template.dxf',
            'text': {'style': 'G-ESAA TEXT', 'bold': 'G-ESAA TEXT BOLD', 'scale': 1.1},
            'lw': {'cable': 80, 'cableExisting': 35, 'pole': 53, 'symbol': 40, 'leader': 9, 'road': 5},
            'layers': {'CEF-TEXT': 'DEMO-TEXT'}, 'blocks': {}}
    js = json.dumps(look, separators=(',', ':'))
    xr = doc.rootdict.add_xrecord('G-ESAA_LOOK')
    xr.extend([(1, js[i:i + 250]) for i in range(0, len(js), 250)])
doc.saveas(out)
print('CEF template written', out)
