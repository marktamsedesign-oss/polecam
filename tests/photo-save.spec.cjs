/* Run: NODE_PATH=/path/to/node_modules node --test polecam/tests/photo-save.spec.cjs
   Uses an isolated browser profile and a local HTTP server; no production data. */
const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
let server, browser, context, page, base, errors;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const defaultChrome = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || defaultChrome });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
beforeEach(async () => {
  context = await browser.newContext({ serviceWorkers: 'block', geolocation: { latitude: 14.5, longitude: 121 }, permissions: ['geolocation'] });
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await context.addInitScript(() => {
    if (!localStorage.getItem('polecam.settings')) localStorage.setItem('polecam.settings', JSON.stringify({
      user: { name: 'Test Surveyor', company: 'Test Company', mobile: '09171234567', email: 'test@example.com' },
      readId: false, view: { lat: 14.5, lon: 121, z: 17 }, v17: 1, v20: 1,
      project: 'Test project', projects: ['Test project'], // v2.15: no default project, photos are taken inside one
    }));
  });
  page = await context.newPage(); errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => !!window.__polecam);
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 768;
    const g = canvas.getContext('2d');
    g.fillStyle = '#1971c2'; g.fillRect(0, 0, 1024, 768);
    g.fillStyle = 'white'; g.font = 'bold 70px sans-serif'; g.fillText('CC-0001', 80, 300);
    window.__photoFixture = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    g.fillStyle = '#d9480f'; g.fillRect(0, 0, 1024, 768);
    window.__photoReplacement = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  });
});
afterEach(async () => { if (context) await context.close(); });

async function openEditor(options = {}) {
  await page.evaluate(async options => {
    await window.__polecam.openEditor({ mode: 'new', id: 'test-pole', poleId: 'CC-0001', type: 'Concrete',
      gps: { lat: 14.5, lon: 121, acc: 3 }, takenAt: '2026-10-27T02:00:00.000Z', source: 'camera',
      ...options, blob: options.replace ? window.__photoReplacement : window.__photoFixture });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, options);
}
async function save() {
  await page.locator('#edSave').click();
  await page.waitForFunction(() => document.getElementById('editor').hidden, null, { timeout: 20000 });
  assert.deepEqual(errors, []);
}
async function stored() {
  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('polecam', 2);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction(['points', 'photos'], 'readonly');
      const a = tx.objectStore('points').getAll(), b = tx.objectStore('photos').getAll();
      tx.oncomplete = () => {
        db.close(); resolve({ points: a.result, photos: b.result.map(p => ({ id: p.id,
          clean: Array.from(new Uint8Array(p.clean.__ab)), thumb: Array.from(new Uint8Array(p.thumb.__ab)) })) });
      };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  result.photos = result.photos.map(p => ({ id: p.id, cleanBytes: p.clean.length, thumbBytes: p.thumb.length,
    clean: createHash('sha256').update(Buffer.from(p.clean)).digest('hex'),
    thumb: createHash('sha256').update(Buffer.from(p.thumb)).digest('hex') }));
  return result;
}
async function failPointWrites() {
  await page.evaluate(() => {
    window.__originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'points') throw new DOMException('Injected full storage', 'QuotaExceededError');
      return window.__originalPut.apply(this, args);
    };
  });
}
async function waitForFailure() {
  await page.waitForFunction(() => !document.getElementById('edSave').disabled && /not saved|could not save/i.test(document.getElementById('toast').textContent));
}

test('survey photo and metadata survive a reload', async () => {
  await openEditor(); await save();
  let data = await stored();
  assert.equal(data.points.length, 1); assert.equal(data.photos.length, 1);
  assert.ok(data.photos[0].cleanBytes > 100); assert.ok(data.photos[0].thumbBytes > 100);
  await page.reload(); await page.waitForFunction(() => window.__polecam?.points.length === 1);
  assert.equal(await page.evaluate(() => window.__polecam.points[0].poleId), 'CC-0001');
  assert.deepEqual(await stored(), data);
});

test('save reopens a database connection closed while taking a photo', async () => {
  await openEditor(); await page.evaluate(() => window.__polecam.closeDb()); await save();
  assert.equal((await stored()).points.length, 1);
});

test('stalled JPEG encoder falls back instead of leaving Save loading', async () => {
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = function() {}; });
  await openEditor(); await save();
  assert.equal((await stored()).photos.length, 1);
});

test('null JPEG encoder result is recovered and never stored as a missing photo', async () => {
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = function(callback) { callback(null); }; });
  await openEditor(); await save();
  assert.ok((await stored()).photos[0].cleanBytes > 100);
});

test('stalled bitmap decoder falls back instead of leaving Save loading', async () => {
  await page.evaluate(() => { window.createImageBitmap = () => new Promise(() => {}); });
  await openEditor(); await save();
  assert.equal((await stored()).photos.length, 1);
});

test('failed record write rolls back a replacement photo and keeps the editor retryable', async () => {
  await openEditor(); await save(); const original = await stored();
  await openEditor({ mode: 'edit', poleId: 'CC-0099', replace: true });
  await failPointWrites(); await page.locator('#edSave').click(); await waitForFailure();
  assert.deepEqual(await stored(), original);
  assert.equal(await page.evaluate(() => window.__polecam.points[0].poleId), 'CC-0001');
  assert.equal(await page.locator('#editor').isVisible(), true);
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__originalPut; });
  await save();
  const saved = await stored(); assert.equal(saved.points[0].poleId, 'CC-0099');
  assert.notDeepEqual(saved.photos[0].clean, original.photos[0].clean);
});

test('acceptance photos commit together, or roll back together and retry', async () => {
  // v2.5: a new PAT record needs a deficiency; a FAT may record an element without one, so this test uses a FAT
  await page.evaluate(() => { window.__polecam.S.meta = { 'Test project': { mode: 'acceptance', stage: 'FAT' } }; });
  await openEditor();
  await page.evaluate(() => window.__polecam.addEdPhoto(window.__photoReplacement, { at: '2026-10-27T02:01:00.000Z', lat: 14.5, lon: 121, acc: 3, by: 'Test Surveyor' }));
  await failPointWrites(); await page.locator('#edSave').click(); await waitForFailure();
  assert.deepEqual(await stored(), { points: [], photos: [] });
  assert.equal(await page.evaluate(() => window.__polecam.points.length), 0);
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__originalPut; });
  await save(); const saved = await stored();
  assert.equal(saved.points.length, 1); assert.equal(saved.photos.length, 2); assert.equal(saved.points[0].photos.length, 2);
  await page.reload(); await page.waitForFunction(() => window.__polecam?.points.length === 1);
  assert.deepEqual(await stored(), saved);
});

test('duplicate clicks and Back during preparation do not discard or duplicate the save', async () => {
  await page.evaluate(() => {
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) { encode.call(this, blob => setTimeout(() => callback(blob), 300), ...args); };
  });
  await openEditor();
  await page.evaluate(() => {
    const b = document.getElementById('edSave');
    b.dispatchEvent(new MouseEvent('click', { bubbles: true })); b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    history.back();
  });
  await page.waitForFunction(() => window.__polecam.points.length === 1 && document.getElementById('busy').hidden, null, { timeout: 20000 });
  assert.equal((await stored()).points.length, 1); assert.equal((await stored()).photos.length, 1);
  assert.deepEqual(errors, []);
});

test('a timed-out preparation is evicted so Save retries the same photo successfully', async () => {
  await page.evaluate(() => {
    window.__originalDecode = window.createImageBitmap;
    window.createImageBitmap = () => new Promise(() => {});
    window.__originalTimeout = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => window.__originalTimeout(fn, ms === 30000 ? 200 : ms, ...args);
  });
  await openEditor(); await page.locator('#edSave').click(); await waitForFailure();
  assert.deepEqual(await stored(), { points: [], photos: [] });
  await page.evaluate(() => { window.createImageBitmap = window.__originalDecode; window.setTimeout = window.__originalTimeout; });
  await save(); assert.equal((await stored()).photos.length, 1);
});

test('a stalled storage transaction is aborted and cannot commit after failure', async () => {
  await openEditor();
  await page.evaluate(() => {
    window.__originalTransaction = IDBDatabase.prototype.transaction;
    window.__originalTimeout = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => window.__originalTimeout(fn, ms === 15000 ? 300 : ms, ...args);
    window.__keepTransactionAlive = true;
    IDBDatabase.prototype.transaction = function(stores, mode, ...args) {
      const tx = window.__originalTransaction.call(this, stores, mode, ...args);
      if (mode === 'readwrite' && Array.from(tx.objectStoreNames).includes('points') && Array.from(tx.objectStoreNames).includes('photos')) {
        const hold = () => {
          if (!window.__keepTransactionAlive) return;
          try { tx.objectStore('points').get('__test_keep_alive').onsuccess = hold; } catch { /* aborted */ }
        };
        hold();
      }
      return tx;
    };
  });
  await page.locator('#edSave').click(); await waitForFailure();
  assert.match(await page.locator('#toast').textContent(), /cancelled/i);
  await page.evaluate(() => {
    window.__keepTransactionAlive = false;
    IDBDatabase.prototype.transaction = window.__originalTransaction; window.setTimeout = window.__originalTimeout;
  });
  assert.deepEqual(await stored(), { points: [], photos: [] });
  assert.equal(await page.evaluate(() => window.__polecam.points.length), 0);
  await save(); assert.equal((await stored()).photos.length, 1);
});

test('large landscape, portrait and EXIF-rotated JPEGs retain orientation at 2048 px', async () => {
  const results = await page.evaluate(async () => {
    const results = [];
    for (const [width, height, rotated] of [[3000, 2200, false], [2200, 3000, false], [3000, 2200, true]]) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const g = canvas.getContext('2d');
      for (const [x, y, color] of [[0, 0, '#ff0000'], [1, 0, '#00ff00'], [0, 1, '#0000ff'], [1, 1, '#ffff00']]) {
        g.fillStyle = color; g.fillRect(x * width / 2, y * height / 2, width / 2, height / 2);
      }
      let photo = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (rotated) {
        // APP1 / Exif / little-endian TIFF with IFD0 Orientation = 6 (90 degrees clockwise).
        const app1 = new Uint8Array([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0,
          1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
        photo = new Blob([photo.slice(0, 2), app1, photo.slice(2)], { type: 'image/jpeg' });
      }
      const prepared = await window.__polecam.makeStoredImages(photo);
      const bitmap = await createImageBitmap(prepared.clean);
      canvas.width = bitmap.width; canvas.height = bitmap.height; g.drawImage(bitmap, 0, 0);
      const topLeft = Array.from(g.getImageData(Math.round(bitmap.width / 10), Math.round(bitmap.height / 10), 1, 1).data);
      results.push({ width: bitmap.width, height: bitmap.height, topLeft }); bitmap.close();
    }
    return results;
  });
  assert.equal(results[0].width, 2048); assert.equal(results[0].height, 1502);
  assert.equal(results[1].width, 1502); assert.equal(results[1].height, 2048);
  assert.equal(results[2].width, 1502); assert.equal(results[2].height, 2048);
  assert.ok(results[0].topLeft[0] > 220 && results[0].topLeft[2] < 30);
  assert.ok(results[1].topLeft[0] > 220 && results[1].topLeft[2] < 30);
  assert.ok(results[2].topLeft[2] > 220 && results[2].topLeft[0] < 30);
});

test('mobile save failure keeps readable guidance and the retry button on screen', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(); await failPointWrites(); await page.locator('#edSave').click(); await waitForFailure();
  const issue = page.locator('#saveIssue'), button = page.locator('#edSave');
  assert.equal(await issue.isVisible(), true); assert.equal(await button.isEnabled(), true);
  assert.match(await issue.textContent(), /storage is full/i);
  const a = await issue.boundingBox(), b = await button.boundingBox();
  assert.ok(a.x >= 0 && a.x + a.width <= 390 && a.y >= 0);
  assert.ok(a.y + a.height <= b.y && b.y + b.height <= 844);
  if (process.env.POLECAM_SCREENSHOT) await page.screenshot({ path: process.env.POLECAM_SCREENSHOT, fullPage: true });
});
