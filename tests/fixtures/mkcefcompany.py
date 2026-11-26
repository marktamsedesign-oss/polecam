"""(templates, CEF template kit) A made-up company CEF template for tests (tests/fixtures/cef-company-made-up.dxf): G-eSAA's own generic CEF
template (vendor/cef/cef-template-generic.dxf) edited as a drafter might edit it into a company's standard, with nothing from any company:
- the frame's company box says DEMO TELCO STANDARD (a plain text added on the CEF sheet);
- CEF BODY 3 mm high in romans.shx, CEF VIEW TITLE 6 mm, P-UG_FOC 1.00 mm and green;
- its STYLE KEY sheet deleted and purged: the style CEF NOTICE, the layer CEF-PHOTO and the block CEF NORTH ARROW are gone (the app's
  Download puts them back, with a STYLE KEY, GeCefKit.complete).
Made with ezdxf (tests/requirements.txt):
    python3 tests/fixtures/mkcefcompany.py vendor/cef/cef-template-generic.dxf tests/fixtures/cef-company-made-up.dxf"""
import sys, ezdxf

src, out = sys.argv[1], sys.argv[2]
doc = ezdxf.readfile(src)
doc.layouts.delete('STYLE KEY')
doc.blocks.delete_block('CEF NORTH ARROW', safe=False)
doc.styles.remove('CEF NOTICE')
doc.layers.remove('CEF-PHOTO')
doc.styles.get('CEF BODY').dxf.font = 'romans.shx'
doc.styles.get('CEF BODY').dxf.height = 3.0
doc.styles.get('CEF VIEW TITLE').dxf.height = 6.0
ug = doc.layers.get('P-UG_FOC'); ug.dxf.lineweight = 100; ug.color = 3; ug.rgb = (0, 160, 0)
cef = doc.layouts.get('CEF')
cef.add_text('DEMO TELCO STANDARD', height=2.0, dxfattribs={'layer': 'CEF-TEXT', 'style': 'CEF TITLE BLOCK TEXT'}).set_placement((322, 12))
doc.saveas(out)
print('made-up company CEF template written', out)
