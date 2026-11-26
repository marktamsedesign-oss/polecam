"""(beta 7.15, CEF template kit) The generic CEF template: the CEF plan's frame, title block and cover page as the app draws them today, as an
AutoCAD drawing to edit into a company's standard (the owner: "Can you give me a dxf from the code generic template as a starting point CEF
template?"; "Iwant this to be the standard for all my clients").
    python3 tools/cef-template/make_cef_template.py vendor/cef/cef-template-generic.dxf
(ezdxf: tests/requirements.txt; node runs tools/cef-template/frame.cjs, which takes the frame from the CEF plan's engine, vendor/cef.)

What is in it (AutoCAD 2018 DXF, millimetres):
- sheet CEF (A3 landscape): the frame and title block of every sheet but the cover, exactly where the app draws them. Each value the app
  fills is a field, @@NAME@@ (an MTEXT whose box is the room the app gives the value: a longer value is made smaller to fit it). The drawing
  area is the viewport on layer CEF-VP-DRAWING; the tables beside the drawing go in the viewport on layer CEF-VP-TABLES. The logo boxes are
  rectangles on layers CEF-LOGO-CLIENT and CEF-LOGO-VENDOR (they do not print): the app puts the client's and the company's logos in them.
- sheet CEF COVER (A3 landscape): the cover page, its fields and logo boxes.
- sheet STYLE KEY: each text style, layer and symbol of the CEF's style kit by name with a sample, and each field with what fills it.
- the style kit (vendor/cef/50_export.js CEF_KIT): text styles (annotative: their height is the printed height in mm), the CEF's layers (their
  colour, line type, line weight as the CEF's PDF prints them), the line type CEF-DASHED, the block CEF NORTH ARROW.
Every name is made up for G-eSAA (our own generic design); nothing of any client's."""
import sys, os, json, subprocess, ezdxf
from ezdxf.enums import TextEntityAlignment, MTextEntityAlignment

HERE = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1]
D = json.loads(subprocess.run(['node', os.path.join(HERE, 'frame.cjs')], check=True, capture_output=True, text=True).stdout)
LW = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211]
near = lambda mm: min(LW, key=lambda v: abs(v - mm * 100))

doc = ezdxf.new('R2018', setup=False)
doc.header['$INSUNITS'] = 6      # model space in metres, as the CEF's DXF (1 unit = 1 m)
doc.header['$MEASUREMENT'] = 1
doc.header['$LTSCALE'] = 1.0
doc.header['$PSLTSCALE'] = 1     # line types in paper millimetres on every sheet, as the CEF's PDF draws its dashes
doc.appids.new('AcadAnnotative')
doc.linetypes.add('CEF-DASHED', pattern=[3.7, 2.4, -1.3], description='CEF dashed __ __ __')

# ---- the layers: the CEF's own (LAYERS), as its PDF prints them; and the template's own (they do not print) ----
L = {}
for k, ly in D['layers'].items():
    lay = doc.layers.add(ly['name'], color=ly['aci'], linetype='CEF-DASHED' if ly['dashed'] else 'Continuous', lineweight=near(ly['mm']))
    if ly['aci'] != 7: lay.rgb = tuple(round(c * 255) for c in ly['rgb'])     # (colour 7 stays: black on paper, white on a dark screen)
    L[k] = ly['name']
for name, color, what in (('CEF-VP-DRAWING', 8, 'The drawing area (its viewport)'), ('CEF-VP-TABLES', 8, 'The tables beside the drawing (its viewport)'),
                          ('CEF-LOGO-CLIENT', 140, 'The box of the client\'s logo'), ('CEF-LOGO-VENDOR', 140, 'The box of the company\'s logo'),
                          ('CEF-STYLE-KEY', 7, 'This STYLE KEY sheet')):
    lay = doc.layers.add(name, color=color, lineweight=near(0.13))
    if name != 'CEF-STYLE-KEY': lay.dxf.plot = 0
EXTRA = [('CEF-VP-DRAWING', 'The drawing area: the viewport where the app draws each sheet (does not print)'), ('CEF-VP-TABLES', 'The viewport where the app puts the tables beside the drawing (does not print)'),
         ('CEF-LOGO-CLIENT', 'The box the app puts the client\'s logo in (does not print; delete it to keep a logo drawn here)'),
         ('CEF-LOGO-VENDOR', 'The box the app puts the company\'s logo in; else the company\'s name in it (does not print)')]

# ---- the text styles of the kit: annotative, their height the printed height in mm ----
st0 = doc.styles.get('Standard'); st0.dxf.font = 'arial.ttf'; st0.set_extended_font_data(family='Arial', italic=False, bold=False)
KIT = {}
for name, font, bold, h, what, who in D['kit']['text']:
    st = doc.styles.add(name, font=font)
    st.dxf.height = h
    st.set_extended_font_data(family='Arial', italic=False, bold=bool(bold))
    st.set_xdata('AcadAnnotative', [(1000, 'AnnotativeData'), (1002, '{'), (1070, 1), (1070, 1), (1002, '}')])
    KIT[name] = (font, bold, h, what, who)

# ---- the symbols: the north arrow, as the drawings have it, in printed mm, pointing up, its base point at its foot ----
na = doc.blocks.new('CEF NORTH ARROW', base_point=(0, 0))
for p in D['north']:
    if p['k'] == 'pl': na.add_line(tuple(p['pts'][0]), tuple(p['pts'][1]), dxfattribs={'layer': '0'})
    elif p['k'] == 'fl': na.add_solid([tuple(q) for q in p['pts']], dxfattribs={'layer': '0'})
    elif p['k'] == 'tx': na.add_text(p['s'], height=p['h'], dxfattribs={'layer': '0', 'style': 'CEF LABEL BOLD'}).set_placement(tuple(p['p']), align=TextEntityAlignment.BOTTOM_CENTER)

ALIGN = {'l': TextEntityAlignment.BOTTOM_LEFT, 'c': TextEntityAlignment.BOTTOM_CENTER, 'r': TextEntityAlignment.BOTTOM_RIGHT}
MALIGN = {'l': MTextEntityAlignment.BOTTOM_LEFT, 'c': MTextEntityAlignment.BOTTOM_CENTER, 'r': MTextEntityAlignment.BOTTOM_RIGHT}
def draw(lay, part, cover):
    """a page's frame, texts and fields as the engine drew them; the fields as MTEXT boxes as wide as the room the app gives them"""
    for ln in part['lines']:
        if ln['close'] or len(ln['pts']) > 2: lay.add_lwpolyline([tuple(q) for q in ln['pts']], close=ln['close'], dxfattribs={'layer': L[ln['lay']]})
        else: lay.add_line(tuple(ln['pts'][0]), tuple(ln['pts'][1]), dxfattribs={'layer': L[ln['lay']]})
    for t in part['texts']:
        s, layer = t['s'], L[t['lay']]
        if s == '@@EXPORTED_BY@@':
            lay.add_text(s, height=t['h'], dxfattribs={'layer': layer, 'style': 'CEF SMALL'}).set_placement(tuple(t['p']), align=ALIGN['r']); continue
        if cover: style = 'CEF COVER TITLE' if t['b'] else 'CEF COVER TEXT'
        elif t['lay'] == 'dm': style = 'CEF CAPTION'
        else: style = 'CEF VALUE' if t['b'] else 'CEF TITLE BLOCK TEXT'
        if '@@' in s:
            m = lay.add_mtext(s, dxfattribs={'layer': layer, 'style': style, 'char_height': t['h'], 'width': round(t['room'], 4), 'insert': tuple(t['p'])})
            m.dxf.attachment_point = MALIGN[t['al']]
        else:
            lay.add_text(s, height=t['h'], dxfattribs={'layer': layer, 'style': style}).set_placement(tuple(t['p']), align=ALIGN[t['al']])
    for a in part['areas']:
        x0, y0, x1, y1 = a['box']; layer = 'CEF-LOGO-CLIENT' if a['key'] == 'client' else 'CEF-LOGO-VENDOR'
        lay.add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], close=True, dxfattribs={'layer': layer})
        lay.add_text('CLIENT LOGO' if a['key'] == 'client' else 'COMPANY LOGO', height=1.5, dxfattribs={'layer': layer, 'style': 'Standard'}).set_placement((x0 + 1, y1 - 2.5))

# ---- sheet CEF: the frame of every sheet; the drawing area and the tables' viewports ----
doc.layouts.rename('Layout1', 'CEF')
cef = doc.layouts.get('CEF'); W, H = D['sheet']['paper']
cef.page_setup(size=(W, H), margins=(0, 0, 0, 0), units='mm')
draw(cef, D['sheet'], False)
for key, layer in (('drawing', 'CEF-VP-DRAWING'), ('tables', 'CEF-VP-TABLES')):
    x0, y0, x1, y1 = D['sheet'][key]
    cef.add_viewport(center=((x0 + x1) / 2, (y0 + y1) / 2), size=(x1 - x0, y1 - y0), view_center_point=(0, 0), view_height=y1 - y0, dxfattribs={'layer': layer})

# ---- sheet CEF COVER: the cover page; the company's name in the company's logo box (the app leaves it out when it puts the logo there) ----
cov = doc.layouts.new('CEF COVER'); cov.page_setup(size=(W, H), margins=(0, 0, 0, 0), units='mm')
draw(cov, D['cover'], True)
va = next(a for a in D['cover']['areas'] if a['key'] == 'vendor')['box']
m = cov.add_mtext('@@COMPANY_NAME@@', dxfattribs={'layer': L['tx'], 'style': 'CEF COVER TEXT', 'char_height': 7, 'width': va[2] - va[0] - 4, 'insert': ((va[0] + va[2]) / 2, (va[1] + va[3]) / 2)})
m.dxf.attachment_point = MTextEntityAlignment.MIDDLE_CENTER

# ---- sheet STYLE KEY: what a drafter edits ----
key = doc.layouts.new('STYLE KEY'); key.page_setup(size=(W, H), margins=(0, 0, 0, 0), units='mm')
KL = {'layer': 'CEF-STYLE-KEY', 'style': 'Standard'}
def tx(s, x, y, h=1.8, **o):
    a = dict(KL); a.update(o); return key.add_text(s, height=h, dxfattribs=a).set_placement((x, y))
def hline(x0, x1, y): key.add_line((x0, y), (x1, y), dxfattribs={'layer': 'CEF-STYLE-KEY'})
key.add_lwpolyline([(8, 8), (412, 8), (412, 289), (8, 289)], close=True, dxfattribs={'layer': 'CEF-STYLE-KEY'})
tx('G-eSAA CEF TEMPLATE - STYLE KEY', 14, 279, 5, style='CEF HEADING')
intro = ['The app copies sheet CEF for every page of a CEF plan (sheet CEF COVER for the cover), fills its fields and draws the plan in the CEF-VP-DRAWING viewport, the tables in the',
         'CEF-VP-TABLES one. Edit the frame, the title block, the cover, the styles, the layers and the symbol as your standard; keep their names. A style\'s height (annotative: the printed',
         'height in mm) sets the size of what the app writes in that style (0: the app\'s own size); the title block\'s and the cover\'s own texts keep the height you give them.']
for i, s in enumerate(intro): tx(s, 14, 272 - i * 3.6, 1.9)
# text styles (left column)
y = 258; tx('TEXT STYLES', 14, y, 2.8, style='CEF HEADING'); y -= 3
for x, s in ((14, 'NAME'), (62, 'SAMPLE'), (122, 'HEIGHT'), (136, 'WHAT IT WRITES')): tx(s, x, y - 3.4, 1.6, style='CEF CAPTION')
y -= 5; hline(14, 205, y)
for name, (font, bold, h, what, who) in KIT.items():
    rh = 7.2; tx(name, 14, y - 4.6, 1.8)
    tx('AaBb 123' if h <= 3 else 'AaBb', 62, y - 5.4, min(h, 5), style=name)
    tx('%g mm' % h, 122, y - 4.6, 1.5)
    words, line, lines = what.split(' '), '', []
    for w in words:
        if len(line) + len(w) + 1 > 52: lines.append(line); line = w
        else: line = (line + ' ' + w).strip()
    lines.append(line)
    if who == 'sheet': lines[-1] += ' (the template\'s own texts)'
    if h > 5: lines.append('(its sample here at 5 mm)')
    for i, s in enumerate(lines[:3]): tx(s, 136, y - 2.8 - i * 2.1, 1.4)
    y -= rh; hline(14, 205, y)
# the symbol
y -= 6; tx('SYMBOLS (BLOCKS)', 14, y, 2.8, style='CEF HEADING'); y -= 4
for name, what in D['kit']['sym']:
    key.add_blockref(name, (24, y - 13), dxfattribs={'layer': L['tx']})
    tx(name, 36, y - 5, 1.8)
    words, line, lines = what.split(' '), '', []
    for w in words:
        if len(line) + len(w) + 1 > 80: lines.append(line); line = w
        else: line = (line + ' ' + w).strip()
    lines.append(line)
    for i, s in enumerate(lines): tx(s, 36, y - 8.5 - i * 2.2, 1.5)
# layers (right column)
y = 258; X0, X1 = 214, 406
tx('LAYERS', X0, y, 2.8, style='CEF HEADING'); y -= 3
for x, s in ((X0, 'NAME'), (X0 + 44, 'SAMPLE'), (X0 + 66, 'COLOUR / LINE / WEIGHT AS THE LAYER HAS THEM: WHAT IT DRAWS')): tx(s, x, y - 3.4, 1.6, style='CEF CAPTION')
y -= 5; hline(X0, X1, y)
rows = [(ly['name'], ly['use']) for ly in D['layers'].values()] + EXTRA
for name, what in rows:
    rh = 4.6; tx(name, X0, y - 3.3, 1.6)
    key.add_line((X0 + 44, y - 2.4), (X0 + 63, y - 2.4), dxfattribs={'layer': name})
    tx(what[:95], X0 + 66, y - 3.3, 1.5)
    y -= rh; hline(X0, X1, y)
# the fields
y -= 5; tx('FIELDS (WHAT THE APP WRITES IN THEM)', X0, y, 2.8, style='CEF HEADING'); y -= 3; hline(X0, X1, y)
FIELDS = [('@@SHEET_NO@@', 'The sheet\'s number: 3 OF 7'), ('@@SHEET_TITLE@@', 'The sheet\'s title: TOP VIEW, ISOMETRIC DETAIL, LEGEND AND NOTES...'), ('@@DATE@@', 'The date the plan was exported: 2026-11-25'),
          ('@@SCALE@@', 'The sheet\'s scale: 1:100, 1:150 ALONG AXES, AS SHOWN, N T S (blank on the cover, contents and legend)'), ('@@DWG_NO@@', 'Project details\' DWG or Drawing no. (blank when none)'),
          ('@@ISSUE_NO@@', 'Project details\' Issue or Revision (blank when none)'), ('@@LINK@@', 'Project details\' Project Name'), ('@@PROJECT_TYPE@@', 'The same: Project details\' Project Name (as the as-plan\'s field)'),
          ('@@SITE_ID@@', 'The site\'s ID (PLA ID)'), ('@@SITE_NAME@@', 'The site\'s name'), ('@@LOCATION@@', 'SITENAME_SITEID, as the as-plan\'s title blocks have it'), ('@@SERIAL@@', 'Project details\' Serial Number'),
          ('@@PLAN_KIND@@', 'The plan\'s kind: AS-PLAN'), ('@@COORDINATES@@', 'The site\'s latitude and longitude: 7%%d06\'36.00"N 125%%d36\'00.00"E'), ('@@PREPARED_BY@@', 'PREPARED BY on the CEF plan (else who exports it)'),
          ('@@CHECKED_BY@@', 'CHECKED BY on the CEF plan (else who accepted the task)'), ('@@APPROVED_BY@@', 'APPROVED BY on the CEF plan'), ('@@COMPANY_NAME@@', 'The company (contractor) of the project'),
          ('@@CLIENT@@', 'Project details\' Client or Customer'), ('@@EXPORTED_BY@@', 'Who exported the plan, the date and the app')]
for tok, what in FIELDS:
    tx(tok, X0, y - 3.2, 1.6); tx(what[:110], X0 + 34, y - 3.2, 1.5); y -= 4.4; hline(X0, X1, y)
tx('A field is @@NAME@@ in a text of the CEF or CEF COVER sheet (it may stand among other words). Its MTEXT box is its room: a longer value is made smaller to fit it.', X0, y - 4, 1.4)

for lay in (cef, cov, key):     # (each sheet's own viewport on layer 0, as AutoCAD has it; its plot window the paper, for the app's PDF printer)
    for vp in lay.viewports():
        if vp.dxf.id == 1: vp.dxf.layer = '0'
    lay.dxf_layout.dxf.plot_window_x1, lay.dxf_layout.dxf.plot_window_y1 = 0, 0
    lay.dxf_layout.dxf.plot_window_x2, lay.dxf_layout.dxf.plot_window_y2 = W, H
for i, lay in enumerate((cef, cov, key)): lay.dxf_layout.dxf.taborder = i + 1     # (the tabs in this order)
doc.layouts.set_active_layout('CEF')
doc.saveas(out)
print('cleanup:', subprocess.run(['node', os.path.join(HERE, 'clean.cjs'), out], check=True, capture_output=True, text=True).stdout.strip())
print('CEF template written', out)
