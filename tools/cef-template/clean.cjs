/* (beta 7.15, CEF template kit) The generic CEF template written as the app writes every DXF: through the plan builder's cleanup (dxftpl.js:
   clean, as each template is read), with AutoCAD's own line ends (CRLF). node tools/cef-template/clean.cjs file.dxf (rewritten in place) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const T = require(path.join(__dirname, '..', '..', 'dxftpl.js'));
const f = process.argv[2], d = new T.Doc(fs.readFileSync(f, 'utf8')), log = T.clean(d);
fs.writeFileSync(f, d.text());
process.stdout.write(JSON.stringify(log) + '\n');
