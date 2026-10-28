"""net .npz -> glyphs.js (weights as int8 with a scale per output, biases float32; base64)."""
import sys, base64, json, numpy as np
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import glyphlib as G
src, out = sys.argv[1], sys.argv[2]
p = dict(np.load(src))
w, b = {}, {}
for k in ('c0w', 'c1w', 'c2w', 'f0w', 'f1w'):
    m = p[k].astype(np.float32); sc = np.abs(m).max(0) / 127; sc[sc == 0] = 1e-8
    q = np.clip(np.round(m / sc), -127, 127).astype(np.int8)
    w[k] = {'q': base64.b64encode(q.tobytes()).decode(), 's': base64.b64encode(sc.astype(np.float32).tobytes()).decode(), 'shape': list(m.shape)}
for k in ('c0b', 'c1b', 'c2b', 'f0b', 'f1b'): b[k] = base64.b64encode(p[k].astype(np.float32).tobytes()).decode()
model = {'v': 1, 'classes': G.CLASSES, 'S': G.S, 'ch': [2, 16, 32, 64], 'hid': int(p['f0w'].shape[1]), 'w': w, 'b': b}
js = ('/* G-eSAA glyph reader: weights of the character network (trained on synthetic painted, stencilled and embossed characters). */\n'
      '(function (root) { const m = ' + json.dumps(model, separators=(',', ':')) + ';\n'
      "  if (typeof module !== 'undefined' && module.exports) module.exports = m; else root.PoleGlyphModel = m;\n"
      "})(typeof self !== 'undefined' ? self : this);\n")
open(out, 'w').write(js); print(out, len(js) // 1024, 'KB')
