"""G-eSAA glyph reader: the character patch (must match core.js glyphPatch exactly) and the synthetic training samples."""
import numpy as np, math, random, io
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import cv2

S = 24
EMB = [0.12, 0.16]  # shares of embossed (shaded) and rimmed raised characters
RIM_DIR = False  # rims lit from one side (the extra chunks)
GAP = (0.12, 0.6)  # space to the neighbouring characters, in character heights
CLASSES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ~'  # ~ = not a character
NC = len(CLASSES)

def bilinear(G, y, x):
    H, W = G.shape
    y = np.clip(y, 0, H - 1); x = np.clip(x, 0, W - 1)
    y0 = np.floor(y).astype(np.int32); x0 = np.floor(x).astype(np.int32)
    y1 = np.minimum(y0 + 1, H - 1); x1 = np.minimum(x0 + 1, W - 1)
    fy = (y - y0).astype(np.float32); fx = (x - x0).astype(np.float32)
    a = G[y0, x0] * (1 - fx) + G[y0, x1] * fx
    b = G[y1, x0] * (1 - fx) + G[y1, x1] * fx
    return a * (1 - fy) + b * fy

def patch(G, box):
    """G: float32 gray HxW (0..255). box: (x0, y0, x1, y1) inclusive. -> float32 (2, S, S)."""
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    side = max(bw, bh) * 1.25
    cx, cy = (x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2
    left, top, step = cx - side / 2, cy - side / 2, side / S
    n = int(min(6, max(2, math.ceil(step))))
    off = (np.arange(n) + 0.5) / n
    ii = np.arange(S)
    ys = top + (ii[:, None] + off[None, :]).reshape(-1) * step - 0.5  # S*n
    xs = left + (ii[:, None] + off[None, :]).reshape(-1) * step - 0.5
    Y, X = np.meshgrid(ys, xs, indexing='ij')
    v = bilinear(G.astype(np.float32), Y, X).reshape(S, n, S, n).mean(axis=(1, 3)).astype(np.float32)
    m = v.mean(); sd = v.std()
    z = (v - m) / (sd + 8.0)
    ring = np.concatenate([z[:2].ravel(), z[-2:].ravel(), z[2:-2, :2].ravel(), z[2:-2, -2:].ravel()])
    if ring.mean() > 0: z = -z
    zp = np.pad(z, 1, mode='edge')
    gx = (zp[:-2, 2:] + 2 * zp[1:-1, 2:] + zp[2:, 2:]) - (zp[:-2, :-2] + 2 * zp[1:-1, :-2] + zp[2:, :-2])
    gy = (zp[2:, :-2] + 2 * zp[2:, 1:-1] + zp[2:, 2:]) - (zp[:-2, :-2] + 2 * zp[:-2, 1:-1] + zp[:-2, 2:])
    mag = np.sqrt(gx * gx + gy * gy)
    mag = (mag - mag.mean()) / (mag.std() + 1e-3)
    return np.stack([z, mag]).astype(np.float32)

# ---------------- synthetic samples ----------------
FONTS = [
 ('/usr/share/fonts/opentype/inter/Inter-Bold.otf', 3), ('/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf', 3), ('/usr/share/fonts/opentype/inter/Inter-Black.otf', 3),
 ('/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', 1), ('/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf', 2), ('/usr/share/fonts/opentype/inter/InterDisplay-Black.otf', 2),
 ('/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf', 3), ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 3), ('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf', 2),
 ('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 3), ('/usr/share/fonts/truetype/freefont/FreeSansBold.ttf', 2), ('/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf', 2),
 ('/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyreheros-bold.otf', 2), ('/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyreheroscn-bold.otf', 2),
 ('/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyreadventor-bold.otf', 3), ('/usr/share/fonts/opentype/tlwg/Loma-Bold.otf', 1), ('/usr/share/texmf/fonts/opentype/public/lm/lmsans10-bold.otf', 1),
 ('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 1), ('/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf', 1), ('/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf', 1),
 ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 1), ('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 1),
]
_fcache = {}
def font(path, size):
    k = (path, size)
    if k not in _fcache: _fcache[k] = ImageFont.truetype(path, size)
    return _fcache[k]
FONT_P = np.array([w for _, w in FONTS], float); FONT_P /= FONT_P.sum()

def glyph_mask(ch, rng, big=96):
    """A character's ink mask (float 0..1), cropped to its ink, at about `big` px tall, maybe as a stencil."""
    path = FONTS[rng.choice(len(FONTS), p=FONT_P)][0]
    f = font(path, big)
    im = Image.new('L', (big * 2, big * 2), 0); d = ImageDraw.Draw(im)
    d.text((big // 2, big // 4), ch, font=f, fill=255)
    m = np.asarray(im, np.float32) / 255
    ys, xs = np.nonzero(m > 0.3)
    if not len(ys): return None
    m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = m.shape
    # weight
    k = rng.integers(-2, 4)
    if k:
        ker = np.ones((abs(k) * 2 + 1, abs(k) * 2 + 1), np.uint8)
        m = cv2.dilate(m, ker) if k > 0 else cv2.erode(m, ker)
        m = np.pad(m, 6); ys, xs = np.nonzero(m > 0.3)
        if not len(ys): return None
        m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; h, w = m.shape
    # stencil bridges: thin bands cut where a stencil holds its counters
    if rng.random() < 0.55 and ch not in '1IJL-T7':
        bw = max(2, int(h * rng.uniform(0.05, 0.11)))
        kind = rng.random()
        if kind < 0.55:  # vertical cut through the top and bottom (0, O, 8, 6, 9, D, Q, B…)
            x = int(w * rng.uniform(0.42, 0.58))
            sel = np.zeros_like(m, bool); sel[:, x - bw // 2:x + bw // 2 + 1] = True
            midband = (np.arange(h) > h * rng.uniform(0.25, 0.4)) & (np.arange(h) < h * rng.uniform(0.6, 0.75))
            if rng.random() < 0.5: sel[midband, :] = False  # only top and bottom
            m = np.where(sel, 0, m)
        elif kind < 0.85:  # horizontal cut through the middle (4, A, P, R, 3…)
            y = int(h * rng.uniform(0.4, 0.62)); m[y - bw // 2:y + bw // 2 + 1, :] *= 0
            if rng.random() < 0.5: m[y - bw // 2:y + bw // 2 + 1, :int(w * 0.35)] = 0
        else:  # both
            x = int(w * 0.5); m[:int(h * 0.3), x - bw // 2:x + bw // 2 + 1] = 0; m[int(h * 0.7):, x - bw // 2:x + bw // 2 + 1] = 0
    return m

def place(canvas_h, canvas_w, mask, cy, cx, scale_y, scale_x, shear, angle):
    """Warp a mask onto a canvas: centred at (cx, cy), scaled, sheared and turned. -> mask (canvas size), its box."""
    h, w = mask.shape
    A = np.array([[scale_x, shear * scale_y, 0], [0, scale_y, 0]], np.float32)
    c, s = math.cos(angle), math.sin(angle)
    R = np.array([[c, -s], [s, c]], np.float32)
    M = R @ A[:, :2]
    t = np.array([cx, cy], np.float32) - M @ np.array([w / 2, h / 2], np.float32)
    Mf = np.hstack([M, t[:, None]])
    out = cv2.warpAffine(mask, Mf, (canvas_w, canvas_h), flags=cv2.INTER_LINEAR, borderValue=0)
    ys, xs = np.nonzero(out > 0.35)
    if not len(ys): return out, None
    return out, (xs.min(), ys.min(), xs.max(), ys.max())

def texture(h, w, rng, base, amp, scale):
    n = rng.standard_normal((max(2, h // scale), max(2, w // scale))).astype(np.float32)
    n = cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)
    return base + n * amp

def render(ink, rng, style):
    """ink: float mask HxW (0..1). -> gray float32 image of the scene."""
    h, w = ink.shape
    if style == 'rim':  # raised letters on a glossy plate: bright rims (and a darker side), the face like the plate
        base = rng.uniform(50, 190)
        bg = texture(h, w, rng, base, rng.uniform(1, 8), int(rng.integers(4, 30)))
        m = (ink > 0.5).astype(np.float32)
        k = int(rng.integers(2, 8)); ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k + 1, 2 * k + 1))
        band = cv2.dilate(m, ker) - cv2.erode(m, ker)
        band = cv2.GaussianBlur(band, (0, 0), rng.uniform(0.6, 2.0))
        hm = cv2.GaussianBlur(m, (0, 0), k * 0.8 + 0.5); gy, gx = np.gradient(hm)
        a = rng.uniform(0, 2 * math.pi); lx, ly = math.cos(a), math.sin(a)
        sh = -(gx * lx + gy * ly); sh = sh / (np.abs(sh).max() + 1e-6)
        bright = rng.uniform(40, 140)
        if RIM_DIR and rng.random() < 0.6:  # light from one side: one side of each stroke bright, the other faint
            img = bg + band * bright * (rng.uniform(0.05, 0.3) + np.clip(sh, 0, None) ** rng.uniform(0.5, 1.5)) + m * rng.uniform(-20, 10)
        else:
            img = bg + band * bright * (rng.uniform(0.4, 0.9) + rng.uniform(0.1, 0.6) * sh) + m * rng.uniform(-20, 20)
        if rng.random() < 0.5: img += np.clip(sh, 0, None) ** 3 * rng.uniform(40, 160)  # glints
        if rng.random() < 0.5: img -= np.clip(-sh, 0, None) * rng.uniform(10, 60)  # the side away from the light
        return img
    if style == 'emboss':
        base = rng.uniform(60, 200)
        bg = texture(h, w, rng, base, rng.uniform(1, 6), int(rng.integers(4, 30)))
        hm = cv2.GaussianBlur(ink, (0, 0), rng.uniform(1.0, 3.5))
        gy, gx = np.gradient(hm)
        a = rng.uniform(0, 2 * math.pi); lx, ly = math.cos(a), math.sin(a)
        shade = -(gx * lx + gy * ly)
        amp = rng.uniform(150, 900)
        face = rng.uniform(-25, 25) * ink
        img = bg + shade * amp + face
        if rng.random() < 0.5:  # a glossy rim
            spec = np.clip(shade, 0, None) ** 2 * rng.uniform(500, 4000); img += spec
        return img
    dark = rng.random() < 0.85
    bgv = rng.uniform(150, 245) if dark else rng.uniform(15, 110)
    inkv = rng.uniform(5, max(6, bgv - 60)) if dark else rng.uniform(min(250, bgv + 60), 255)
    bg = texture(h, w, rng, bgv, rng.uniform(2, 14), int(rng.integers(3, 40)))
    if rng.random() < 0.5:  # light falls off across the pole
        gx = np.linspace(-1, 1, w)[None, :] * rng.uniform(-40, 40); bg = bg + gx
    inkimg = texture(h, w, rng, inkv, rng.uniform(1, 18), int(rng.integers(2, 10)))  # sprayed paint is uneven
    a = np.clip(ink * rng.uniform(0.75, 1.0), 0, 1)
    return bg * (1 - a) + inkimg * a

def cable(img, rng, H, W, thick):
    """A dark cable across the picture."""
    p = np.zeros((H, W), np.uint8)
    y0, y1 = rng.uniform(0, H), rng.uniform(0, H)
    pts = np.array([[0, y0], [W * 0.5, (y0 + y1) / 2 + rng.uniform(-H * 0.2, H * 0.2)], [W, y1]], np.int32)
    cv2.polylines(p, [pts], False, 1, thickness=max(1, int(thick)))
    return np.where(p > 0, rng.uniform(10, 70), img)

def sample(rng, label=None):
    """One training sample: (patch 2xSxS, class index)."""
    noise = label == '~' or (label is None and rng.random() < 0.12)
    ch = '~' if noise else (label or CLASSES[rng.integers(0, NC - 1)])
    big = 96
    H = W = 300
    scale = rng.uniform(0.75, 1.25); asp = rng.uniform(0.75, 1.35)
    sy, sx = scale, scale * asp
    shear = rng.uniform(-0.18, 0.18) if rng.random() < 0.5 else 0
    ang = rng.normal(0, 0.06)
    ink = np.zeros((H, W), np.float32)
    cy, cx = H / 2 + rng.uniform(-4, 4), W / 2 + rng.uniform(-4, 4)
    box = None
    gh = big * sy  # about the character's height on the canvas
    nkind = None
    if not noise:
        m = glyph_mask(ch, rng, big)
        if m is None: return None
        o, box = place(H, W, m, cy, cx, sy * big / max(m.shape[0], 1) * (0.7 if ch == '-' else 1), sx * big / max(m.shape[0], 1), shear, ang)
        if box is None: return None
        ink = np.maximum(ink, o)
    # neighbours (the characters above / below or beside it)
    vertical = rng.random() < 0.6
    for sgn in (-1, 1):
        if rng.random() < 0.7:
            m2 = glyph_mask(CLASSES[rng.integers(0, 36)], rng, big)
            if m2 is None: continue
            gap = gh * rng.uniform(*GAP)
            if vertical: c2 = (cy + sgn * (gh + gap), cx + rng.uniform(-gh * 0.1, gh * 0.1))
            else: c2 = (cy + rng.uniform(-gh * 0.05, gh * 0.05), cx + sgn * (gh * 0.75 * asp + gap))
            o2, _ = place(H, W, m2, c2[0], c2[1], sy * big / m2.shape[0], sx * big / m2.shape[0], shear, ang)
            ink = np.maximum(ink, o2)
    if noise:
        nkind = rng.integers(0, 6)
        if nkind == 0:  # part of a character (top or bottom, left or right)
            m = glyph_mask(CLASSES[rng.integers(0, 36)], rng, big)
            if m is None: return None
            h = m.shape[0]; cut = rng.uniform(0.25, 0.5)
            m = m[:int(h * cut)] if rng.random() < 0.5 else m[int(h * (1 - cut)):]
            o, box = place(H, W, m, cy, cx, sy, sx, shear, ang)
            ink = np.maximum(ink, o)
        elif nkind == 1:  # a star
            r = gh / 2; pts = []
            for i in range(10):
                rr = r if i % 2 == 0 else r * 0.42; a = -math.pi / 2 + i * math.pi / 5
                pts.append([cx + rr * math.cos(a), cy + rr * math.sin(a)])
            p = np.zeros((H, W), np.uint8); cv2.fillPoly(p, [np.array(pts, np.int32)], 1); ink = np.maximum(ink, p.astype(np.float32))
            box = (int(cx - r), int(cy - r), int(cx + r), int(cy + r))
        elif nkind == 2:  # two characters in one box
            for dx in (-0.5, 0.5):
                m = glyph_mask(CLASSES[rng.integers(0, 36)], rng, big)
                if m is None: return None
                o, _ = place(H, W, m, cy, cx + dx * gh * 0.8, sy * big / m.shape[0], sx * big / m.shape[0], shear, ang); ink = np.maximum(ink, o)
            box = (int(cx - gh * 0.8), int(cy - gh / 2), int(cx + gh * 0.8), int(cy + gh / 2))
        elif nkind == 3:  # a line or cable piece, a tag's edge, a blob
            p = np.zeros((H, W), np.uint8)
            if rng.random() < 0.5:
                cv2.line(p, (int(cx - gh * rng.uniform(0.3, 0.8)), int(cy + rng.uniform(-gh, gh) * 0.4)), (int(cx + gh * rng.uniform(0.3, 0.8)), int(cy + rng.uniform(-gh, gh) * 0.4)), 1, max(2, int(gh * rng.uniform(0.08, 0.3))))
            else:
                cv2.ellipse(p, (int(cx), int(cy)), (int(gh * rng.uniform(0.1, 0.5)), int(gh * rng.uniform(0.1, 0.5))), rng.uniform(0, 180), 0, 360, 1, -1)
            ink = np.maximum(ink, p.astype(np.float32))
            ys, xs = np.nonzero(p); box = (xs.min(), ys.min(), xs.max(), ys.max())
        else:  # background only (a box where no character is)
            w2 = gh * rng.uniform(0.4, 1.0); box = (int(cx - w2 / 2), int(cy - gh / 2), int(cx + w2 / 2), int(cy + gh / 2))
    u = rng.random()
    style = 'emboss' if u < EMB[0] else 'rim' if u < EMB[0] + EMB[1] else 'ink'
    img = render(ink, rng, style)
    if rng.random() < 0.08: img = cable(img, rng, H, W, gh * rng.uniform(0.06, 0.18))
    # to the camera's size: the character's height in the picture
    th = rng.choice([rng.uniform(7, 12), rng.uniform(12, 24), rng.uniform(24, 60)], p=[0.35, 0.35, 0.3])
    k = th / gh
    nh, nw = max(8, int(round(H * k))), max(8, int(round(W * k)))
    img = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    if rng.random() < 0.7: img = cv2.GaussianBlur(img, (0, 0), rng.uniform(0.3, 1.3))
    img = img + rng.standard_normal(img.shape).astype(np.float32) * rng.uniform(0, 8)
    img = np.clip(img, 0, 255)
    if rng.random() < 0.6:
        ok, enc = cv2.imencode('.jpg', img.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, int(rng.integers(35, 92))])
        img = cv2.imdecode(enc, cv2.IMREAD_GRAYSCALE).astype(np.float32)
    x0, y0, x1, y1 = [v * k for v in box]
    # the box as a segmenter would give it: a little off
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    j = rng.uniform(-0.1, 0.1, 4) * np.array([bw, bh, bw, bh])
    x0, y0, x1, y1 = x0 + j[0], y0 + j[1], x1 + j[2], y1 + j[3]
    if x1 - x0 < 1.5 or y1 - y0 < 1.5: return None
    return patch(img.astype(np.float32), (x0, y0, x1, y1)), CLASSES.index(ch)

def batch(n, seed):
    rng = np.random.default_rng(seed)
    X = np.zeros((n, 2, S, S), np.float16); Y = np.zeros(n, np.int16); i = 0
    while i < n:
        s = sample(rng)
        if s is None: continue
        X[i], Y[i] = s; i += 1
    return X, Y
