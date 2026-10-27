/* Run with: node --test polecam/tests/image-preparation.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const section = source.slice(source.indexOf('  const IMAGE_DECODE_MS'), source.indexOf('  /** Export copy of a photo:'));
const photo = () => new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' });

function context(overrides = {}) {
  const ctx = {
    Blob, Uint8Array, Promise, WeakMap, Date, Error, Math, atob,
    // Preserve relative deadlines while keeping failure-path tests quick.
    setTimeout: (fn, ms) => setTimeout(fn, Math.max(1, ms / 100)), clearTimeout,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    window: {}, STORE_MAX_PX: 2048, S: {}, persist: () => {}, document: {},
    // v2.3 app log: quiet stand-ins (the log itself is tested in the browser suite)
    LOG: { info() {}, warn() {}, error() {}, mark() {}, step() {}, done() {} },
    errInfo: (e) => ({ msg: String(e && e.message || e) }), memMB: () => null, busy: () => {},
    Image: class {
      constructor() { this.naturalWidth = 100; this.naturalHeight = 100; }
      set src(value) { if (value) setTimeout(() => this.onload?.(), 1); }
    },
    ...overrides,
  };
  vm.createContext(ctx);
  vm.runInContext(`function withTimeout(p, ms, message) {
    let timer;
    return Promise.race([p, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]).finally(() => clearTimeout(timer));
  }\n${section}\nglobalThis.api = { loadImage, toBlob, prepImages, storedImages, makeStoredImages };`, ctx);
  return ctx;
}

test('a stalled cached preparation expires and the next Save starts fresh', async () => {
  const ctx = context(), blob = photo();
  vm.runInContext(`globalThis.attempts = 0;
    makeStoredImages = () => ++attempts === 1 ? new Promise(() => {}) : Promise.resolve({ clean: 1, thumb: 2 });`, ctx);
  await assert.rejects(ctx.api.prepImages(blob), /too long/);
  assert.equal((await ctx.api.storedImages(blob)).clean, 1);
  assert.equal(ctx.attempts, 2);
});

test('background preparation rejection is handled and retry is shared', async () => {
  const ctx = context(), blob = photo();
  vm.runInContext(`globalThis.attempts = 0;
    makeStoredImages = async () => { if (++attempts === 1) throw new Error('decode failed'); return { clean: 1, thumb: 2 }; };`, ctx);
  ctx.api.prepImages(blob); // deliberately not awaited, like the camera's background preparation
  await new Promise(resolve => setImmediate(resolve));
  const retry = ctx.api.storedImages(blob);
  assert.equal(ctx.api.storedImages(blob), retry);
  assert.equal((await retry).thumb, 2);
  assert.equal(ctx.attempts, 2);
});

test('encoder stall uses a nonempty JPEG fallback and remembers it for the thumbnail', async () => {
  const ctx = context();
  let asynchronousCalls = 0;
  const canvas = {
    width: 2, height: 2,
    toBlob() { asynchronousCalls++; },
    toDataURL() { return 'data:image/jpeg;base64,/9j/2Q=='; },
  };
  assert.equal((await ctx.api.toBlob(canvas, 0.88)).size, 4);
  assert.equal((await ctx.api.toBlob(canvas, 0.8)).type, 'image/jpeg');
  assert.equal(asynchronousCalls, 1);
});

test('null and empty encoders cannot produce a successful photo save', async () => {
  const ctx = context();
  await assert.rejects(ctx.api.toBlob({
    width: 2, height: 2, toBlob(callback) { callback(null); }, toDataURL() { return 'data:,'; },
  }, 0.88), /could not prepare/);
  await assert.rejects(ctx.api.toBlob({ width: 0, height: 0 }, 0.88), /no image pixels/);
});

test('stalled bitmap decoder falls back, closes a late bitmap and avoids the next stall', async () => {
  let bitmapCalls = 0, closed = 0;
  const ctx = context({
    createImageBitmap: () => {
      bitmapCalls++;
      return new Promise(resolve => setTimeout(() => resolve({ width: 100, height: 100, close() { closed++; } }), 180));
    },
  });
  assert.equal((await ctx.api.loadImage(photo())).naturalWidth, 100);
  assert.equal((await ctx.api.loadImage(photo())).naturalWidth, 100);
  assert.equal(bitmapCalls, 1);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(closed, 1);
});

test('failed thumbnail preparation closes the bitmap and releases both canvases', async () => {
  let closed = 0;
  const canvases = [];
  const ctx = context({
    createImageBitmap: async () => ({ width: 400, height: 300, close() { closed++; } }),
    document: { createElement() {
      const canvas = {
        width: 0, height: 0,
        getContext() { return canvases.length === 1 ? { drawImage() {} } : null; },
        toBlob(callback) { callback(photo()); },
      };
      canvases.push(canvas); return canvas;
    } },
  });
  await assert.rejects(ctx.api.makeStoredImages(photo()), /thumbnail/);
  assert.equal(closed, 1);
  assert.equal(canvases.length, 2);
  assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});
