import sys, glob, time, json, numpy as np
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import cnn, glyphlib as G
epochs = int(sys.argv[1]) if len(sys.argv) > 1 else 10
xs = sorted(glob.glob('pool/x*.npy')); ys = [x.replace('/x', '/y') for x in xs]
val_x, val_y = np.load(xs[-1]).astype(np.float32), np.load(ys[-1]).astype(np.int64)
X = np.concatenate([np.load(x) for x in xs[:-1]]); Y = np.concatenate([np.load(y) for y in ys[:-1]]).astype(np.int64)
print('train', X.shape, 'val', val_x.shape, flush=True)
try:
    import realset
    real = realset.build()
except ImportError:
    real = {}
RX = np.stack([p for v in real.values() for p, _ in v]) if real else np.zeros((1, 2, G.S, G.S), np.float32); RY = np.array([G.CLASSES.index(l) for v in real.values() for _, l in v]) if real else np.zeros(1, np.int64)
net = cnn.Net(G.NC, seed=1)
opt = cnn.Adam(net.p, lr=2e-3)
rng = np.random.default_rng(0)
B = 128; steps = len(X) // B
def acc(x, y, bs=1000):
    c = 0; P = []
    for i in range(0, len(x), bs):
        o = net.forward(x[i:i + bs]); P.append(o.argmax(1))
    P = np.concatenate(P); return (P == y).mean(), P
best = -1
for ep in range(epochs):
    t = time.time(); perm = rng.permutation(len(X)); tl = 0
    opt.lr = 2e-3 * (0.5 ** max(0, ep - epochs // 2)) if ep >= epochs // 2 else 2e-3
    for s in range(steps):
        idx = perm[s * B:(s + 1) * B]
        xb = X[idx].astype(np.float32); yb = Y[idx]
        out = net.forward(xb, True, rng); l, d, _ = cnn.softmax_xent(out, yb); g = net.backward(d); opt.step(net.p, g); tl += l
    va, _ = acc(val_x, val_y); ra, rp = acc(RX, RY)
    print(f'epoch {ep} loss {tl / steps:.3f} val {va:.4f} real {ra:.3f} {"".join(G.CLASSES[i] for i in rp)} lr {opt.lr:.5f} {time.time() - t:.0f}s', flush=True)
    np.savez('net_last.npz', **net.p)
    if va > best: best = va; np.savez('net_best.npz', **net.p)
