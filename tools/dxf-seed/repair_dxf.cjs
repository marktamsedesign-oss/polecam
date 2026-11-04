#!/usr/bin/env node
/* Repairs a plan DXF exported by G-eSAA before v2.42.8 (or the LibreDWG-made template) so AutoCAD opens it: the same cleanup the
   app now runs on every export (dxftpl.js: clean, the old title block copies removed, extents and opening view on the plan).
   Nothing is uploaded; the file is read and written on this computer.
       node repair_dxf.cjs old.dxf repaired.dxf
   Then check it:  python3 -I check_plan.py repaired.dxf
   (The drawing is not redrawn: an older export keeps its legend where it was. Export again from the app for the new layout.) */
'use strict';
const fs = require('fs'), path = require('path');
const T = require(path.join(__dirname, '..', '..', 'dxftpl.js'));
const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.error('usage: node repair_dxf.cjs old.dxf repaired.dxf'); process.exit(2); }
const r = T.repair(fs.readFileSync(src, 'utf8'));
fs.writeFileSync(dst, r.text);
const n = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
console.log(`${dst}: ${n(r.report.cleanup)} repairs${r.report.oldBlocks.length ? `, ${r.report.oldBlocks.length} old title block copies removed` : ''}`);
for (const [k, v] of Object.entries(r.report.cleanup)) console.log(`  ${v} × ${k}`);
if (r.report.frame) console.log(`  extents ${r.report.frame.box.join(', ')}`);
for (const t of r.report.notes) console.log(`  note: ${t}`);
