# DXF seed tools (stage 1 of the plan drawing export)

The company drawing template stays private: it is **not** in this repository, and neither is the seed made from it.
These tools only read a template you give them.

| Tool | What it does |
|---|---|
| `make_seed.py template.dxf seed.dxf fields.json` | Removes the sample route, grid, base map and placeholder labels from model space (keeps the legend, ROW and PMI tables), removes the sample vicinity picture, marks every field the export fills with `@@TOKEN@@`, adds the missing value texts in the title block, sets the GEO viewports to 1:1100, and lists every token in `fields.json`. |
| `fill_seed.py seed.dxf values.json out.dxf` | Fills the tokens from a JSON of values (test helper). A missing value leaves the field blank. |
| `check_dxf.py file.dxf [template.dxf]` | Structural check without a CAD program: unique handles, `$HANDSEED`, owners, pointers, attribute sequences, layers, styles, blocks. With the template given, problems the template already has are listed apart. |
| `extents.py` | Where entities are drawn (inserts through their blocks); used by `make_seed.py`. |
| `check_plan.py plan.dxf` | v2.42.8: the AutoCAD acceptance check of an exported plan: file (UTF-8, CRLF, value types), handles and pointers, one `*Active` VPORT, attributes without `AcDbXrecord`, no REGION / MULTILEADER / GEODATA / LibreDWG style objects, SORTENTSTABLE block records, images (used, named, plain file names), MTEXT widths, no `@@` field or sample project text left, everything in model space within 2 km of the plan, extents and opening view on it. Exit 0 = no problem. |
| `node repair_dxf.cjs old.dxf repaired.dxf` | v2.42.8: repairs a plan exported before v2.42.8 with the app's own cleanup (the same code as every export now), so AutoCAD opens it; the drawing is not redrawn. |

Run with `python3 -I` (standard library only) or Node. The template is read as data; nothing in it is executed.

`tests/dxf-cleanup.test.cjs` checks the cleanup on a synthetic drawing with the template's faults (no company data); the GitHub workflow `Plan DXF check` runs it and `ezdxf audit` on the result.

The handles the tool edits are those of the current template (AutoCAD keeps handles when it saves). If the template
changes, `make_seed.py` stops with "template changed: …" instead of writing a wrong seed.
