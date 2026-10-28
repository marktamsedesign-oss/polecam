"""Continue training from a saved network on all the data (the first pool and the extra raised-letter chunks)."""
import sys, glob, time, numpy as np
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import cnn, glyphlib as G
try:
    import realset
except ImportError:
    realset = None
src, epochs, lr0 = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
xs = sorted(glob.glob('pool/x*.npy')); val = 'pool/x023.npy'; emb_val = 'pool/x107.npy'
tr = [x for x in xs if x not in (val, emb_val)]
X = np.concatenate([np.load(x) for x in tr]); Y = np.concatenate([np.load(x.replace('/x', '/y')) for x in tr]).astype(np.int64)
VX, VY = np.load(val).astype(np.float32), np.load(val.replace('/x', '/y')).astype(np.int64)
EX, EY = np.load(emb_val).astype(np.float32), np.load(emb_val.replace('/x', '/y')).astype(np.int64)
real = realset.build() if realset else {}
RX = np.stack([p for v in real.values() for p, _ in v]) if real else np.zeros((1, 2, G.S, G.S), np.float32); RY = np.array([G.CLASSES.index(l) for v in real.values() for _, l in v]) if real else np.zeros(1, np.int64)
print('train', X.shape, flush=True)
net = cnn.Net(G.NC); net.p = {k: v.astype(np.float32) for k, v in np.load(src).items()}
opt = cnn.Adam(net.p, lr=lr0); rng = np.random.default_rng(7); B = 128
def acc(x, y):
    P = np.concatenate([net.forward(x[i:i + 1000]).argmax(1) for i in range(0, len(x), 1000)]); return (P == y).mean(), P
for ep in range(epochs):
    t = time.time(); perm = rng.permutation(len(X)); tl = 0; steps = len(X) // B
    opt.lr = lr0 * (0.5 ** ep)
    for s in range(steps):
        idx = perm[s * B:(s + 1) * B]
        out = net.forward(X[idx].astype(np.float32), True, rng); l, d, _ = cnn.softmax_xent(out, Y[idx]); opt.step(net.p, net.backward(d)); tl += l
    va, _ = acc(VX, VY); ea, _ = acc(EX, EY); ra, rp = acc(RX, RY)
    print(f'ft epoch {ep} loss {tl / steps:.3f} val {va:.4f} raised {ea:.4f} real {ra:.3f} {"".join(G.CLASSES[i] for i in rp)} lr {opt.lr:.5f} {time.time() - t:.0f}s', flush=True)
    np.savez(f'net_{sys.argv[4] if len(sys.argv) > 4 else "ft"}{ep}.npz', **net.p)
