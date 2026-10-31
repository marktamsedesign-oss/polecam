/* G-eSAA (PoleCam) offline cache: keeps the app itself available with no signal.
   Map tiles are cached separately by the app (IndexedDB). Bump VERSION after editing any file. */
const VERSION = 'polecam-v2.35.1';
const SHELL = [
  './', 'index.html', 'app.js', 'core.js', 'glyphs.js', 'reports.js', 'forms.js', 'tutorial.js', 'dxftpl.js', 'manifest.json', 'brand/logo-left.jpg', 'brand/logo-right.jpg',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/protomaps/protomaps-leaflet.js', 'vendor/qr/qrcode.min.js', 'vendor/qr/jsQR.min.js',
  'vendor/leaflet/images/layers.png', 'vendor/leaflet/images/layers-2x.png',
  'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-icon-2x.png', 'vendor/leaflet/images/marker-shadow.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  // offline Pole ID reader (about 7 MB)
  'ocr-worker.js', 'vendor/tesseract/tesseract-core-lstm.js', 'vendor/tesseract/tesseract-core-lstm.wasm', 'vendor/tesseract/eng.traineddata',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

const SHARE = 'polecam-share'; // v2.19: a file shared to the installed app waits here until the app opens it
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHARE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  // v2.19: Share → G-eSAA on Android (installed web app): keep the KMZ / ZIP, then open the app, which reads it from here
  if (req.method === 'POST' && u.origin === self.location.origin && u.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData(), f = fd.get('file') || [...fd.values()].find((v) => v && typeof v === 'object' && 'size' in v);
        if (f && f.size) await (await caches.open(SHARE)).put('shared-file', new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'shared.kmz') } }));
      } catch (err) { /* the app opens without it and says so */ }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET' || u.origin !== self.location.origin) return; // tiles, roads: not ours
  // Map packs are large and stored by the app itself in pieces; never copy them into this cache.
  if (u.pathname.includes('/maps/') || req.headers.has('range')) return;
  // Network first (so updates arrive), fall back to the cached copy when offline.
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
