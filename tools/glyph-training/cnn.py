"""A small CNN in numpy: conv3x3(pad 1)+ReLU+maxpool2 x3, dense+ReLU, dense. Float32, im2col."""
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view as swv

def im2col(x):  # x: N,C,H,W -> N*H*W, C*9 (pad 1)
    N, C, H, W = x.shape
    xp = np.pad(x, ((0, 0), (0, 0), (1, 1), (1, 1)))
    w = swv(xp, (3, 3), axis=(2, 3))  # N,C,H,W,3,3
    return w.transpose(0, 2, 3, 1, 4, 5).reshape(N * H * W, C * 9)

def col2im(dcol, shape):  # dcol: N*H*W, C*9 -> N,C,H,W
    N, C, H, W = shape
    d = dcol.reshape(N, H, W, C, 3, 3)
    dx = np.zeros((N, C, H + 2, W + 2), np.float32)
    for i in range(3):
        for j in range(3):
            dx[:, :, i:i + H, j:j + W] += d[:, :, :, :, i, j].transpose(0, 3, 1, 2)
    return dx[:, :, 1:-1, 1:-1]

class Net:
    def __init__(self, nc, ch=(2, 16, 32, 64), hid=128, seed=0):
        rng = np.random.default_rng(seed)
        self.p = {}
        for i in range(3):
            fi = ch[i] * 9
            self.p[f'c{i}w'] = (rng.standard_normal((fi, ch[i + 1])) * np.sqrt(2 / fi)).astype(np.float32)
            self.p[f'c{i}b'] = np.zeros(ch[i + 1], np.float32)
        fi = ch[3] * 9
        self.p['f0w'] = (rng.standard_normal((fi, hid)) * np.sqrt(2 / fi)).astype(np.float32); self.p['f0b'] = np.zeros(hid, np.float32)
        self.p['f1w'] = (rng.standard_normal((hid, nc)) * np.sqrt(1 / hid)).astype(np.float32); self.p['f1b'] = np.zeros(nc, np.float32)
        self.ch = ch

    def forward(self, x, train=False, rng=None):
        cache = []
        h = x
        for i in range(3):
            N, C, H, W = h.shape
            col = im2col(h)
            o = col @ self.p[f'c{i}w'] + self.p[f'c{i}b']
            o = o.reshape(N, H, W, -1).transpose(0, 3, 1, 2)
            r = np.maximum(o, 0)
            # maxpool 2
            rp = r.reshape(N, r.shape[1], H // 2, 2, W // 2, 2)
            m = rp.max(axis=(3, 5))
            cache.append((h.shape, col, o, rp, m))
            h = m
        N = h.shape[0]
        flat = h.transpose(0, 2, 3, 1).reshape(N, -1)  # channel-last flatten (matches the JS order)
        a = flat @ self.p['f0w'] + self.p['f0b']; ra = np.maximum(a, 0)
        drop = None
        if train:
            drop = (rng.random(ra.shape) > 0.2).astype(np.float32) / 0.8; ra = ra * drop
        out = ra @ self.p['f1w'] + self.p['f1b']
        self.cache = (cache, h.shape, flat, a, ra, drop)
        return out

    def backward(self, dout):
        cache, hs, flat, a, ra, drop = self.cache
        g = {}
        g['f1w'] = ra.T @ dout; g['f1b'] = dout.sum(0)
        dra = dout @ self.p['f1w'].T
        if drop is not None: dra = dra * drop
        da = dra * (a > 0)
        g['f0w'] = flat.T @ da; g['f0b'] = da.sum(0)
        dflat = da @ self.p['f0w'].T
        N, C, H, W = hs
        dh = dflat.reshape(N, H, W, C).transpose(0, 3, 1, 2)
        for i in (2, 1, 0):
            xshape, col, o, rp, m = cache[i]
            # maxpool backward
            mask = (rp == m[:, :, :, None, :, None])
            dr = (mask * dh[:, :, :, None, :, None]).reshape(o.shape)
            do = dr * (o > 0)
            Nn, F, Hh, Ww = do.shape
            dof = do.transpose(0, 2, 3, 1).reshape(-1, F)
            g[f'c{i}w'] = col.T @ dof; g[f'c{i}b'] = dof.sum(0)
            if i > 0: dh = col2im(dof @ self.p[f'c{i}w'].T, xshape)
        return g

def softmax_xent(logits, y):
    z = logits - logits.max(1, keepdims=True)
    e = np.exp(z); p = e / e.sum(1, keepdims=True)
    n = len(y)
    loss = -np.log(p[np.arange(n), y] + 1e-9).mean()
    d = p.copy(); d[np.arange(n), y] -= 1; d /= n
    return loss, d, p

class Adam:
    def __init__(self, params, lr=2e-3, b1=0.9, b2=0.999, wd=1e-4):
        self.m = {k: np.zeros_like(v) for k, v in params.items()}; self.v = {k: np.zeros_like(v) for k, v in params.items()}
        self.t = 0; self.lr, self.b1, self.b2, self.wd = lr, b1, b2, wd
    def step(self, params, grads):
        self.t += 1
        for k in params:
            gk = grads[k] + (self.wd * params[k] if k.endswith('w') else 0)
            self.m[k] = self.b1 * self.m[k] + (1 - self.b1) * gk
            self.v[k] = self.b2 * self.v[k] + (1 - self.b2) * gk * gk
            mh = self.m[k] / (1 - self.b1 ** self.t); vh = self.v[k] / (1 - self.b2 ** self.t)
            params[k] -= (self.lr * mh / (np.sqrt(vh) + 1e-8)).astype(np.float32)
