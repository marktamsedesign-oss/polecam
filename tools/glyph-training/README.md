# Training the glyph reader (glyphs.js)

The character network in `glyphs.js` was trained with these scripts (Python 3, numpy, OpenCV, Pillow; no GPU).
The fonts are the ones listed in `glyphlib.py` (`FONTS`): installed system fonts. Edit that list for another computer.

1. `python3 gen.py 0 24 2` — 240,000 synthetic characters in `pool/` (two processes).
2. `python3 gen.py 100 8 1` and `python3 gen.py 110 10 1` — 180,000 more with raised (embossed) letters.
3. `python3 train.py 5` — 5 epochs on the first pool (about 4 minutes each), saves `net_last.npz`.
4. `python3 finetune.py net_last.npz 4 0.0015 ft`, then `python3 finetune.py net_ft3.npz 2 0.0006 fb` — all the data.
5. `python3 export.py net_fb1.npz ../../glyphs.js` — the weights for the app (int8, about 140 KB).

`glyphlib.patch` must stay the same as `glyphPatch` in `core.js` (the network's input).
