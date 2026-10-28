import sys, numpy as np, multiprocessing as mp, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import glyphlib as G
def work(args):
    i, n = args
    if i >= 100: G.EMB[:] = [0.25, 0.4]  # the extra chunks: more raised characters
    if i >= 110: G.EMB[:] = [0.1, 0.6]; G.RIM_DIR = True; G.GAP = (0.04, 0.4)  # raised letters lit from one side, close together
    X, Y = G.batch(n, 1000 + i)
    np.save(f'pool/x{i:03d}.npy', X); np.save(f'pool/y{i:03d}.npy', Y)
    return i
if __name__ == '__main__':
    import os; os.makedirs('pool', exist_ok=True)
    start, count, n = int(sys.argv[1]), int(sys.argv[2]), 10000
    t = time.time()
    with mp.Pool(int(sys.argv[3]) if len(sys.argv) > 3 else 2) as p:
        for i in p.imap_unordered(work, [(k, n) for k in range(start, start + count)]): print('chunk', i, round(time.time() - t), 's', flush=True)
