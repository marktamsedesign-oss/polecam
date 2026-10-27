/* PoleCam Survey — field app. Depends on Leaflet (L) and core.js (PoleCore). */
(() => {
  'use strict';
  /* ================= app log =================
     A small ring buffer kept in localStorage (written synchronously, so it survives a crash of the app's web view).
     Records errors, what the user saw (toasts), and the timing of every step of taking, saving and exporting photos.
     No photos, names, phone numbers or coordinates are logged. Settings → About → App log shows and shares it. */
  const LOG = (() => {
    const KEY = 'polecam.log', FLIGHT = 'polecam.inflight', MAX = 500;
    let buf = [];
    try { buf = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(buf)) buf = []; } catch (e) { buf = []; }
    let dirty = false, timer = 0;
    function flush() {
      clearTimeout(timer); timer = 0; if (!dirty) return; dirty = false;
      if (buf.length > MAX) buf = buf.slice(-MAX);
      try { localStorage.setItem(KEY, JSON.stringify(buf)); } catch (e) { buf = buf.slice(-150); try { localStorage.setItem(KEY, JSON.stringify(buf)); } catch (e2) { /* storage full */ } }
    }
    const clip = (v) => { try { const j = JSON.stringify(v); return j && j.length > 1200 ? JSON.parse(JSON.stringify(j.slice(0, 1200))) : v; } catch (e) { return String(v).slice(0, 300); } };
    function add(l, e, d, now) {
      const x = { t: Date.now(), l, e }; if (d !== undefined) x.d = clip(d);
      buf.push(x); dirty = true;
      if (now || l === 'e' || l === 'w') flush(); else if (!timer) timer = setTimeout(flush, 1500);
    }
    /** A step that might not finish (the app could be killed): remembered until done, reported at the next start. */
    let flight = {};
    const saveFlight = () => { try { if (Object.keys(flight).length) localStorage.setItem(FLIGHT, JSON.stringify(flight)); else localStorage.removeItem(FLIGHT); } catch (e) { /* ignore */ } };
    function step(name, d) { flight[name] = { t: Date.now(), d }; saveFlight(); add('i', name, d, true); }
    function done(name) { if (flight[name]) { delete flight[name]; saveFlight(); } }
    function leftover() { try { const v = localStorage.getItem(FLIGHT); localStorage.removeItem(FLIGHT); const o = v ? JSON.parse(v) : null; return o && typeof o === 'object' ? Object.entries(o).map(([step, x]) => ({ step, ...x })) : []; } catch (e) { return []; } }
    return { info: (e, d) => add('i', e, d), warn: (e, d) => add('w', e, d), error: (e, d) => add('e', e, d), mark: (e, d) => add('i', e, d, true), step, done, leftover, flush,
      all: () => buf.slice(), clear: () => { buf = []; dirty = true; flush(); } };
  })();
  const errInfo = (e) => (e ? { name: e.name || '', msg: String(e.message || e).slice(0, 300), stack: e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ').slice(0, 500) : undefined } : null);
  window.addEventListener('error', (ev) => LOG.error('js.error', { msg: String(ev.message || '').slice(0, 300), src: String(ev.filename || '').split('/').pop(), line: ev.lineno, col: ev.colno, stack: ev.error && ev.error.stack ? String(ev.error.stack).split('\n').slice(0, 4).join(' | ') : undefined }));
  window.addEventListener('unhandledrejection', (ev) => LOG.error('js.unhandled', errInfo(ev.reason)));
  { const ce = console.error.bind(console); console.error = (...a) => { try { LOG.error('console.error', { msg: a.map((x) => (x && x.message) || (typeof x === 'string' ? x : JSON.stringify(x))).join(' ').slice(0, 400) }); } catch (e) { /* ignore */ } ce(...a); }; }
  window.addEventListener('pagehide', () => LOG.flush());
  document.addEventListener('visibilitychange', () => { LOG.info(document.hidden ? 'app.hidden' : 'app.visible'); if (document.hidden) LOG.flush(); });
  for (const lo of LOG.leftover()) LOG.warn('previous.session.stopped.during', { step: lo.step, secondsAgo: Math.round((Date.now() - lo.t) / 1000), d: lo.d }); // the app was closed or crashed in the middle of it
  const memMB = () => (performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : undefined);
  const C = window.PoleCore;
  let points = [];
  const $ = (id) => document.getElementById(id);

  /* ================= settings ================= */
  const DEF_CHECK = {
    'Pole': ['No pole tag / Pole ID not visible', 'Pole leaning or unstable', 'Missing or loose guy wire', 'Missing hardware (dead-end / suspension clamp)', 'Insufficient cable clearance'],
    'Cable / strand': ['Cable sagging', 'No cable tag', 'Cable damaged or exposed', 'Improper lashing / spacing', 'Excess cable not coiled'],
    'MLoop': ['MLoop missing', 'MLoop not properly coiled or secured', 'MLoop length not per design', 'No MLoop bracket'],
    'NAP': ['NAP label missing or wrong', 'NAP cover not closed / unsealed', 'NAP improperly mounted', 'Unused ports without dust cap', 'Drop entry not sealed'],
    'Closure': ['Closure label missing or wrong', 'Closure not properly sealed', 'Closure improperly mounted', 'Cable entry not sealed'],
    'ODF': ['Port labeling missing', 'Patch cords not properly routed', 'Missing dust caps', 'ODF not secured / no grounding'],
    'ODC': ['ODC label missing', 'Door or lock damaged', 'Splitter / port labeling missing', 'No grounding', 'Improper cable management'],
    'Rack': ['Rack label missing', 'Improper cable management', 'No grounding', 'Equipment not secured'],
    'Other': [],
  };
  const ELEMENTS = ['Pole', 'ODF', 'ODC', 'Rack'];
  /* Location integrity: the pin may move at most PIN_LIMIT_M from where the photo was taken, and in acceptance
     projects every photo must be live (in-app camera, fresh GPS) and taken within PIN_LIMIT_M of the element. */
  const PIN_LIMIT_M = 1000, MAX_PHOTO_AGE_MS = 2 * 60000, STORE_MAX_PX = 2048; // photos are kept at 2048 px; exports may shrink copies
  /* Pole types are fixed; each has its Pole ID prefix (CC-0001). ODF IDs are FDU_<number>. */
  /* Pole types and their ID prefixes: built in, added by the admin (policy, for every phone) or by the user (this phone). */
  const BUILTIN_TYPES = [{ n: 'Concrete', p: 'CC' }, { n: 'Wood', p: 'WP' }, { n: 'Steel', p: 'SP' }, { n: 'Globe', p: 'GT' }, { n: 'Bayantel', p: 'BT' }];
  const PAD4 = ['CC', 'WP', 'SP']; // survey numbering: CC-0001; owner tags (GT-, BT-, PLDT- …) keep the number as painted
  const ODF_ID_RE = /^FDU_(\d+)$/;
  function poleTypes() {
    const out = [], seenP = new Set(), seenN = new Set();
    const pl = (typeof pol === 'function' && S && S.team && S.team.pol && Array.isArray(S.team.pol.poleTypes)) ? S.team.pol.poleTypes : [];
    for (const t of BUILTIN_TYPES.concat(pl, (S && S.myTypes) || [])) {
      const p = String(t.p || '').toUpperCase(), n = String(t.n || p).trim().slice(0, 30);
      if (!/^[A-Z]{2,6}$/.test(p) || p === 'FDU' || seenP.has(p) || seenN.has(n.toLowerCase())) continue;
      seenP.add(p); seenN.add(n.toLowerCase()); out.push({ n, p, own: !BUILTIN_TYPES.some((b) => b.p === p) && !pl.some((x) => String(x.p).toUpperCase() === p) });
    }
    return out;
  }
  const typeNames = () => poleTypes().map((t) => t.n);
  const typePrefix = (name) => { const t = poleTypes().find((x) => x.n === name); return t ? t.p : ''; };
  const prefixType = (pre) => { const t = poleTypes().find((x) => x.p === pre); return t ? t.n : ''; };
  const prefixAlt = () => poleTypes().map((t) => t.p).sort((a, b) => b.length - a.length).join('|');
  const poleIdRe = () => new RegExp(`^(${prefixAlt()})-(\\d+)$`);
  const polePartRe = () => new RegExp(`^(${prefixAlt()})-?(\\d*)$`);
  const padNum = (pre, n, len) => (PAD4.includes(pre) ? String(n).padStart(Math.max(4, len || 0), '0') : String(n).padStart(len || 0, '0'));
  /** "PLDT PLDT pole" lines -> [{p, n}] (2–6 letter prefix, optional name). */
  function parseTypeLines(text) {
    const out = [];
    for (const line of String(text || '').split('\n')) {
      const m = /^\s*([A-Za-z]{2,6})(?![A-Za-z])[\s,:-]*(.*)$/.exec(line); if (!m) continue;
      const p = m[1].toUpperCase(); if (p === 'FDU' || out.some((t) => t.p === p)) continue;
      out.push({ p, n: (m[2] || '').trim().slice(0, 30) || p });
    }
    return out.slice(0, 20);
  }
  const typeLines = (list) => (list || []).map((t) => (t.n && t.n !== t.p ? `${t.p} ${t.n}` : t.p)).join('\n');
  function refreshTypes() { if (window.PoleCore && window.PoleCore.setPolePrefixes) window.PoleCore.setPolePrefixes(poleTypes().map((t) => t.p)); }
  const CATS_FOR = { Pole: ['Pole', 'Cable / strand', 'MLoop', 'NAP', 'Closure', 'Other'], ODF: ['ODF', 'Other'], ODC: ['ODC', 'Cable / strand', 'Other'], Rack: ['Rack', 'ODF', 'Other'] };
  const PHOTO_LABELS = ['Overview', 'Pole tag', 'MLoop', 'NAP', 'Closure', 'Cable', 'ODF', 'ODC', 'Rack', 'Detail'];
  const STATUS_TEXT = { OK: 'No deficiency', Open: 'Open deficiency', Rectified: 'Rectified', Verified: 'Verified' };
  const STATUS_COLORS = { OK: '#2b8a3e', Open: '#c92a2a', Rectified: '#1971c2', Verified: '#0b7285' };
  const SEV_CODE = { Major: 'MD', Minor: 'D', Note: 'N' };
  /* Policies are set by the admin and travel inside the signed company list (S.team.pol), so every phone works to the
     same checklist, form wording, field standards and photo rule. Without a list the defaults below apply. */
  const POL_DEF = { owner: '', form: {}, defects: null, maxSpan: 200, angleDeg: 15, autoGap: 120, quality: 'strict', inspTypes: ['Physical'], poleTypes: [] };
  function pol() {
    const p = (S.team && S.team.pol) || {};
    return { ...POL_DEF, ...p, form: { ...(p.form || {}) }, defects: p.defects || DEF_CHECK, inspTypes: p.inspTypes || POL_DEF.inspTypes };
  }
  const formText = () => window.PoleForms.formText(pol().form);
  /** Staff of the admin company add deficiencies and verify; everyone else (contractors) can only rectify. */
  const isInspector = () => { const o = pol().owner; return !o || !S.user || String(S.user.company || '').toLowerCase() === o.toLowerCase(); };
  const DEF = {
    project: 'Default project', projects: ['Default project'],
    stamp: true, maxPx: 2048, myTypes: [],
    zone: 51, sym: 1, txt: 1.5, base: 'street', lastPoleId: '', lastType: 'Concrete', view: null, areas: [],
    meta: {}, defects: JSON.parse(JSON.stringify(DEF_CHECK)), userName: '',
    quality: 'strict', readId: true, idOrient: 'h', maxSpan: 200, angleDeg: 15, autoGap: 120, user: null, team: null,
    exp: { maxPx: 2048, quality: 0.88, stamp: true, stampFields: ['id', 'coords', 'utm', 'time', 'by', 'project'], naming: 'id',
      kmzBalloonPx: 800, kmzIconPx: 64, kmzRoute: true, kmzStamp: true, pdfPhotoSize: 'M', pdfAnnexA: true, pdfAnnexB: true, pdfDates: 'blank', xlsTable: true, xlsPhotos: true, kmzData: true },
    saveBase: 'DOCUMENTS', saveFolder: 'PoleCam', saveByProject: true,
  };
  let S = (() => { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem('polecam.settings') || '{}')); } catch (e) { return { ...DEF }; } })();
  const persist = () => { try { localStorage.setItem('polecam.settings', JSON.stringify(S)); } catch (e) { /* storage blocked */ } };
  // v1.7: fixed pole types, strict photo check, 200 m maximum span, satellite imagery no longer kept on the phone
  delete S.types;
  if (!Array.isArray(S.myTypes)) S.myTypes = [];
  setTimeout(refreshTypes, 0);
  if (!BUILTIN_TYPES.some((t) => t.n === S.lastType) && !(S.myTypes || []).some((t) => t.n === S.lastType)) S.lastType = 'Concrete';
  if (S.quality !== 'normal') S.quality = 'strict';
  if (!S.v17) { S.v17 = 1; S.quality = 'strict'; S.maxSpan = 200; S.dropSatTiles = true; }
  S.exp = { ...DEF.exp, ...(S.exp || {}) };
  if (S.stamp === false && !S.v20) S.exp.stamp = false;
  if (S.maxPx && !S.v20) S.exp.maxPx = S.maxPx;
  S.v20 = 1;
  persist();

  /* ================= IndexedDB ================= */
  /* The browser can close the database connection on its own (the app goes to the background while the camera
     is open, storage pressure, another tab). Every call therefore reopens a closed connection and retries once.
     Photos and tiles are stored as ArrayBuffers, which every browser (including Safari on iPhone) stores reliably. */
  let dbp = null, dbConnection = null;
  function openDb() {
    return new Promise((res, rej) => {
      let settled = false;
      const fail = (e) => { if (settled) return; settled = true; clearTimeout(timer); dbp = null; rej(e); };
      const timer = setTimeout(() => { LOG.error('db.open.timeout'); fail(new Error('Storage did not open. Keep this screen open and tap Save again.')); }, 10000);
      let r;
      try { r = indexedDB.open('polecam', 2); } catch (e) { fail(e); return; }
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const [name, key] of [['points', 'id'], ['photos', 'id'], ['tiles', 'k'], ['packs', 'k']]) {
          if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: key });
        }
      };
      r.onsuccess = () => {
        const d = r.result;
        if (settled) { d.close(); return; }
        settled = true; clearTimeout(timer); dbConnection = d;
        const forget = () => { if (dbConnection === d) { dbp = null; dbConnection = null; } };
        d.onclose = forget;
        d.onversionchange = () => { d.close(); forget(); };
        res(d);
      };
      r.onerror = () => fail(r.error);
      r.onblocked = () => fail(new Error('Storage is busy in another PoleCam tab. Close other tabs and try again.'));
    });
  }
  function idb() {
    if (!dbp) {
      const pending = dbp = openDb();
      pending.catch(() => { if (dbp === pending) dbp = null; });
    }
    return dbp;
  }
  const isClosedErr = (e) => !!e && (e.name === 'InvalidStateError' || e.name === 'UnknownError' || /clos|lost/i.test(String(e.message || '')));
  async function tx(store, mode, fn, retried) {
    let d;
    try { d = await idb(); } catch (e) { dbp = null; if (!retried) return tx(store, mode, fn, true); throw e; }
    try {
      return await new Promise((res, rej) => {
        const t = d.transaction(store, mode), req = fn(t.objectStore(store));
        let out;
        if (req) req.onsuccess = () => { out = req.result; };
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error('Storage aborted (phone storage may be full)'));
      });
    } catch (e) {
      if (!retried && isClosedErr(e)) { dbp = null; return tx(store, mode, fn, true); }
      throw e;
    }
  }
  async function pack(v) {
    const o = { ...v };
    for (const k of Object.keys(o)) if (o[k] instanceof Blob) o[k] = { __ab: await o[k].arrayBuffer(), type: o[k].type || 'image/jpeg' };
    return o;
  }
  function unpack(v) {
    if (!v || typeof v !== 'object') return v;
    for (const k of Object.keys(v)) { const x = v[k]; if (x && x.__ab) v[k] = new Blob([x.__ab], { type: x.type }); }
    return v;
  }
  const dbGet = async (st, k) => unpack(await tx(st, 'readonly', (s) => s.get(k)));
  const dbPut = async (st, v) => { const p = await pack(v); return tx(st, 'readwrite', (s) => s.put(p)); };
  const dbDel = (st, k) => tx(st, 'readwrite', (s) => s.delete(k));
  const dbAll = async (st) => (await tx(st, 'readonly', (s) => s.getAll())).map(unpack);
  const dbCount = (st) => tx(st, 'readonly', (s) => s.count());
  const dbClear = (st) => tx(st, 'readwrite', (s) => s.clear());
  const dbDelMany = (st, keys) => tx(st, 'readwrite', (s) => { keys.forEach((k) => s.delete(k)); });

  /** Commit an element and its photos together. Prepare bytes before opening the transaction:
      awaiting image work inside IndexedDB would let the transaction close prematurely. */
  async function saveRecord(rec, photos, freed) {
    const t0 = Date.now(), packed = [];
    for (const photo of photos) {
      if (!(photo.clean instanceof Blob) || !photo.clean.size || !(photo.thumb instanceof Blob) || !photo.thumb.size) {
        throw new Error('The photo could not be prepared. Tap Save to try again.');
      }
      packed.push(await withTimeout(pack(photo), 10000, 'The photo could not be read. Keep this screen open and tap Save again.'));
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const d = await idb();
      try {
        await new Promise((resolve, reject) => {
          const t = d.transaction(['points', 'photos'], 'readwrite');
          let error = null, settled = false;
          const finish = (e) => {
            if (settled) return; settled = true; clearTimeout(timer);
            if (e) reject(e); else resolve();
          };
          const timer = setTimeout(() => {
            error = new Error('Storage took too long. The save was cancelled; keep this screen open and tap Save again.');
            // Unlike Promise.race, abort prevents a timed-out write from committing later.
            try { t.abort(); finish(error); }
            catch (e) { /* already finished: its complete/abort event determines the outcome */ }
          }, 15000);
          t.oncomplete = () => finish();
          t.onerror = (e) => { error = t.error || (e.target && e.target.error) || error; };
          t.onabort = () => finish(error || t.error || new Error('Storage cancelled the save. Tap Save to try again.'));
          try {
            const store = t.objectStore('photos');
            packed.forEach((p) => store.put(p));
            t.objectStore('points').put(rec);
          } catch (e) {
            error = e;
            try { t.abort(); } catch (_) { /* transaction already stopped */ }
            finish(e);
          }
        });
        LOG.info('save.commit', { ms: Date.now() - t0, photos: photos.length, kb: Math.round(packed.reduce((n, x) => n + ((x.clean && x.clean.__ab && x.clean.__ab.byteLength) || 0), 0) / 1024) });
        return;
      } catch (e) {
        LOG.error('save.commit.fail', { attempt, ms: Date.now() - t0, ...errInfo(e) });
        if (attempt === 0 && isClosedErr(e)) {
          d.close(); if (dbConnection === d) dbConnection = null; dbp = null;
          continue;
        }
        if (!freed && e && e.name === 'QuotaExceededError') { // the viewed-tiles cache is only a cache: empty it and try once more
          busy('Freeing space and trying again…');
          try { await withTimeout(tx('tiles', 'readwrite', (st) => st.clear()), 15000, 'clear timeout'); LOG.warn('save.tilesCleared'); } catch (e2) { LOG.error('save.tilesClear.fail', errInfo(e2)); throw e; }
          return saveRecord(rec, photos, true);
        }
        throw e;
      }
    }
  }

  /* ================= UI helpers ================= */
  let toastTimer = 0;
  function toast(msg, ms) {
    LOG.info('toast', String(msg).slice(0, 200));
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }
  let cancelFlag = false;
  $('busyCancel').addEventListener('click', () => { cancelFlag = true; $('busyText').textContent = 'Stopping…'; }); // map pack jobs also listen (see runPackJob)
  let tileHold = false; // map tiles wait while the app saves or exports, so the phone's network and storage go to the save first
  let busySince = 0, busyFirst = '';
  function busy(text, frac, cancellable) {
    if (text === false) {
      if (busySince) { LOG.info('busy.end', { text: busyFirst, ms: Date.now() - busySince }); busySince = 0; }
      $('busy').hidden = true; $('busyCancel').hidden = true; if (tileHold) { tileHold = false; if (typeof pumpTiles === 'function') pumpTiles(); } return;
    }
    if (!busySince) { busySince = Date.now(); busyFirst = String(text).replace(/\d+ \/ \d+/, 'n / N'); LOG.info('busy.start', busyFirst); }
    tileHold = true;
    $('busyCancel').hidden = !cancellable;
    $('busy').hidden = false; $('busyText').textContent = text;
    const p = $('busyProg');
    if (frac == null) p.removeAttribute('value'); else p.value = frac;
  }
  /* ---- Android APK (Capacitor) bridge ---- */
  const NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  const plugins = {};
  /** { proxy } from Capacitor's registerPlugin (any property is a native method), or { bridge } when only the raw bridge exists. */
  function nativePlugin(name) {
    if (plugins[name]) return plugins[name];
    const ce = window.capacitorExports;
    if (ce && typeof ce.registerPlugin === 'function') { try { plugins[name] = { proxy: ce.registerPlugin(name) }; return plugins[name]; } catch (e) { /* use the bridge below */ } }
    const cap = window.Capacitor;
    plugins[name] = { bridge: (method, opts) => cap.nativePromise(name, method, opts || {}) };
    return plugins[name];
  }
  const nativeCall0 = (name, method, opts) => { const p = nativePlugin(name); return p.proxy ? p.proxy[method](opts || {}) : p.bridge(method, opts); };
  /** Native calls with their failures in the app log (map tile requests are summarised separately). */
  function nativeCall(name, method, opts) {
    const t0 = Date.now(), quiet = name === 'CapacitorHttp' && /tile|basemaps|arcgisonline/.test(String((opts && opts.url) || ''));
    let pr;
    try { pr = Promise.resolve(nativeCall0(name, method, opts)); } catch (e) { LOG.error('native.throw', { call: `${name}.${method}`, ...errInfo(e) }); return Promise.reject(e); }
    return pr.then((r) => { const ms = Date.now() - t0; if (!quiet && (ms > 3000 || name === 'Filesystem')) LOG.info('native', { call: `${name}.${method}`, ms }); return r; },
      (e) => { if (!quiet) LOG.warn('native.fail', { call: `${name}.${method}`, ms: Date.now() - t0, ...errInfo(e) }); throw e; });
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  /* ---- project mode + acceptance helpers ---- */
  const pmeta = (name) => (S.meta && S.meta[name || S.project]) || { mode: 'survey' };
  const isAcc = (name) => pmeta(name).mode === 'acceptance';
  const photosOf = (r) => (r.photos ? r.photos : [{ pid: r.id, label: 'Photo' }]);
  /** Deficiencies that must be rectified (notes are informational). */
  const counting = (r) => (r.defs || []).filter((d) => d.sev !== 'Note');
  /** Status of one item; items saved by older versions carry no status, so a rectified photo or date means Rectified. */
  const defStatusOf = (d) => (d.sev === 'Note' ? 'Note' : d.status || (d.afterPid || d.fixedAt ? 'Rectified' : 'Open'));
  const sevOf = (d) => d.sev || 'Minor';
  function recStatus(r) {
    const d = counting(r); if (!d.length) return 'OK';
    if (d.some((x) => defStatusOf(x) === 'Open')) return 'Open';
    return d.every((x) => defStatusOf(x) === 'Verified') ? 'Verified' : 'Rectified';
  }
  const openCount = (r) => counting(r).filter((d) => defStatusOf(d) === 'Open').length;
  const defDone = (d) => { const st = defStatusOf(d); return st === 'Rectified' || st === 'Verified'; };
  const elemOf = (r) => r.element || 'Pole';
  function allPids(r) {
    const s = photosOf(r).map((p) => p.pid);
    (r.defs || []).forEach((d) => { if (d.pid) s.push(d.pid); if (d.afterPid) s.push(d.afterPid); if (d.verifyPid) s.push(d.verifyPid); (d.reopened || []).forEach((q) => { if (q.pid) s.push(q.pid); }); });
    return s;
  }
  /** Delete stored photos that no record (other than the excluded ones) still uses — PAT and FAT share photos. */
  async function deletePhotosIfUnused(pids, excludeIds) {
    const used = new Set();
    points.forEach((r) => { if (!excludeIds.has(r.id)) allPids(r).forEach((p) => used.add(p)); });
    for (const pid of new Set(pids)) if (!used.has(pid)) await dbDel('photos', pid);
  }
  function attachText(r) {
    if (elemOf(r) === 'Pole') return [`MLoop: ${r.mloop ? 'Yes' : 'No'}`, `NAP: ${r.nap ? `Yes${r.napId ? ` (${r.napId})` : ' (no ID)'}` : 'No'}`, `Closure: ${r.closure ? `Yes${r.closureId ? ` (${r.closureId})` : ' (no ID)'}` : 'No'}`];
    if (elemOf(r) === 'ODF') return [`${r.odf || 'New'} ODF`];
    return [];
  }
  /** Next ID in the current project only, so numbering never carries over: CC-/WP-/SP- per pole type, FDU_ for ODFs.
      With nothing to count from, only the prefix is filled in and the number is typed or scanned. */
  function suggestId(element, type) {
    const recs = points.filter((p) => p.project === S.project && (!ed || p.id !== ed.id));
    const latest = (list) => list.reduce((m, p) => (p.created > m.created ? p : m));
    if (!element || element === 'Pole') {
      const pre = typePrefix(type) || typePrefix(S.lastType) || 'CC', re = poleIdRe();
      const same = recs.filter((p) => elemOf(p) === 'Pole' && (re.exec(p.poleId || '') || [])[1] === pre);
      if (!same.length) return `${pre}-`;
      const n = re.exec(latest(same).poleId)[2];
      return `${pre}-${padNum(pre, +n + 1, n.length)}`;
    }
    if (element === 'ODF') {
      const same = recs.filter((p) => elemOf(p) === 'ODF' && ODF_ID_RE.test(p.poleId || ''));
      if (!same.length) return 'FDU_';
      const n = ODF_ID_RE.exec(latest(same).poleId)[1];
      return `FDU_${String(+n + 1).padStart(n.length, '0')}`;
    }
    const pts = recs.filter((p) => elemOf(p) === element);
    return pts.length ? C.nextPoleId(latest(pts).poleId) : '';
  }
  const projPoints = () => points.filter((p) => p.project === S.project).sort((a, b) => (a.created < b.created ? -1 : 1));
  function haversine(a, b) {
    const R = 6371008.8, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
  /** Time, place and person for one photo, recorded at the moment it is taken. */
  const photoMeta = (gps, at) => ({ at: at || new Date().toISOString(), lat: gps ? gps.lat : null, lon: gps ? gps.lon : null,
    acc: gps && Number.isFinite(gps.acc) ? gps.acc : null, by: byLine() });
  /** "Name · Company" of the person using this phone, recorded on photos, records and punchlist items. */
  function byLine() { return S.user && S.user.name ? `${S.user.name}${S.user.company ? ' · ' + S.user.company : ''}` : (S.userName || ''); }
  /** Task category of a project: Survey, PAT or FAT. */
  const taskCat = (name) => (isAcc(name) ? (pmeta(name).stage || 'PAT') : 'Survey');
  /** Remember who worked on the current project (printed on the reports). */
  function notePerson() {
    if (!S.user || !S.user.name) return;
    const m = { ...pmeta() }; m.people = { ...(m.people || {}) };
    m.people[byLine()] = { name: S.user.name, company: S.user.company || '', mobile: S.user.mobile || '', email: S.user.email || '' };
    S.meta = S.meta || {}; S.meta[S.project] = m; persist();
  }
  const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const stamp8 = () => { const d = new Date(), p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

  /* ================= sheets + back button ================= */
  const stack = []; const pendingClose = [];
  let editorSaving = false;
  function openSheet(id) {
    LOG.info('open', id);
    const el = $(id); el.hidden = false; el.style.zIndex = 1000 + stack.length;
    stack.push(id); history.pushState({ sheet: id }, '');
  }
  function closeSheet() {
    if (editorSaving && stack[stack.length - 1] === 'editor') return Promise.resolve();
    return new Promise((r) => { if (!stack.length) return r(); pendingClose.push(r); history.back(); });
  }
  window.addEventListener('popstate', () => {
    if (editorSaving && stack[stack.length - 1] === 'editor') {
      history.pushState({ sheet: 'editor' }, '');
      LOG.info('back.blockedWhileSaving'); toast('Finishing the save. Your photo is still here.'); return;
    }
    const id = stack.pop();
    if (id) { $(id).hidden = true; onSheetClosed(id); }
    const r = pendingClose.shift(); if (r) r();
  });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet()));
  function onSheetClosed(id) {
    if (id === 'camera') stopCamera();
    if (id === 'editor') { cleanupEditor(); }
    if (id === 'list') revokeListUrls();
    if (id === 'qrScan') stopQrScan();
    if (id === 'visitCard') { visitId = null; document.body.classList.remove('visiting'); revokeVisitUrls(); }
    if (id === 'profile' && !profileOk()) setTimeout(() => { openProfile(true); toast('Enter your details to start using PoleCam', 3000); }, 0);
  }

  /* ================= help text: folded behind an "i" so screens stay short ================= */
  function setupHelp() {
    const isHelp = (el) => el.matches && el.matches('p.hint') && (!el.id || el.classList.contains('help')) && !el.classList.contains('mono');
    const fold = (host, hints, before) => {
      if (!hints.length) return;
      const det = document.createElement('details'); det.className = 'help'; det.open = !!S.showHelp;
      const sum = document.createElement('summary'); sum.textContent = 'Help'; det.appendChild(sum);
      host.insertBefore(det, before);
      hints.forEach((h) => det.appendChild(h));
    };
    document.querySelectorAll('.sheet .group, .sheet > .body').forEach((c) => {
      const hints = [...c.children].filter(isHelp); if (!hints.length) return;
      fold(c, hints, hints[0]);
    });
    document.querySelectorAll('.xcard').forEach((card) => {
      const head = card.querySelector(':scope > .head'), p = head && head.querySelector('p'); if (!p) return;
      p.className = 'hint'; fold(card, [p], head.nextSibling);
    });
  }
  setupHelp();
  $('setShowHelp').checked = !!S.showHelp;
  $('setShowHelp').addEventListener('change', () => { S.showHelp = $('setShowHelp').checked; persist(); document.querySelectorAll('details.help').forEach((d) => { d.open = S.showHelp; }); });

  /* ================= map tiles (cached in IndexedDB) ================= */
  /* Online street map: several free tile servers; when one stops answering the app moves to the next (or the user picks one). */
  const STREET_SOURCES = [
    { id: 'osm', name: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, attr: '© OpenStreetMap contributors', key: 'street' },
    { id: 'carto', name: 'CARTO Voyager', url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', max: 19, attr: '© OpenStreetMap contributors © CARTO', key: 'carto' },
    { id: 'esri', name: 'Esri World Street Map', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', max: 19, attr: 'Map © Esri, HERE, Garmin, OpenStreetMap contributors', key: 'esristreet' },
  ];
  const SAT_SOURCE = { id: 'sat', name: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, attr: 'Imagery © Esri' };
  const streetState = { auto: 0, fails: 0, ok: 0, failed: 0, lastWarn: 0 };
  /** The street source in use: the one chosen in Settings, or the first one still answering. */
  function streetSource() {
    const want = S.streetSrc && S.streetSrc !== 'auto' ? STREET_SOURCES.find((x) => x.id === S.streetSrc) : null;
    return want || STREET_SOURCES[Math.min(streetState.auto, STREET_SOURCES.length - 1)];
  }
  const SOURCES = { get street() { const x = streetSource(); return { url: x.url, max: x.max, attr: x.attr }; }, satellite: { url: SAT_SOURCE.url, max: SAT_SOURCE.max, attr: SAT_SOURCE.attr } };
  const TILE_KEEP_MS = 7 * 24 * 3600 * 1000;
  const SITE = window.POLECAM_SITE || new URL('./', location.href).href;
  const APP_VER = '2.5.0';
  /* The APK shows its screens from https://localhost, and OpenStreetMap's tile servers refuse map requests from such pages.
     In the APK the tiles are therefore fetched by Android itself, identified as PoleCam (OSM asks apps to identify themselves). */
  const APP_UA = () => `PoleCam/${APP_VER} (+${SITE})`;
  function b64ToBytes(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function nativeBytes(d) {
    if (typeof d === 'string') return b64ToBytes(d.replace(/^data:[^,]*,/, ''));
    if (d instanceof ArrayBuffer) return new Uint8Array(d);
    if (d && d.buffer instanceof ArrayBuffer) return new Uint8Array(d.buffer);
    throw new Error('Unexpected download data');
  }
  /** GET through Android's own HTTP stack (no browser restrictions); data comes back as base64 for binary responses. */
  const nativeGet = (url, headers, responseType) => nativeCall('CapacitorHttp', 'request',
    { url, method: 'GET', headers: { 'User-Agent': APP_UA(), ...(headers || {}) }, responseType: responseType || 'blob', connectTimeout: 20000, readTimeout: 60000 });
  const tileUrl = (src, z, x, y) => SOURCES[src].url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  /* Tile requests: at most TILE_PAR at a time, newest first (the view the user is looking at now), tiles that left the
     screen are dropped, and nothing new starts while the app is saving. */
  const TILE_PAR = 8, TILE_MS = 15000; let tileBusy = 0; const tileQueue = [];
  function pumpTiles() {
    while (!tileHold && tileBusy < TILE_PAR && tileQueue.length) {
      const j = tileQueue.pop();
      if (j.alive && !j.alive()) { j.res(false); continue; }
      tileBusy++; j.res(true);
    }
  }
  const tileSlot = (alive) => new Promise((res) => { tileQueue.push({ res, alive }); pumpTiles(); });
  const tileFree = () => { tileBusy = Math.max(0, tileBusy - 1); pumpTiles(); };
  /** One tile image. Only OpenStreetMap in the APK goes through Android's HTTP stack (OSM refuses the APK's localhost page);
      everything else is a plain browser request, which keeps the bytes off the app's main thread. */
  async function getTileBlob(url, viaNative) {
    if (viaNative) {
      const r = await withTimeout(nativeGet(url, null, 'blob'), TILE_MS, 'timeout');
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      return new Blob([nativeBytes(r.data)], { type: 'image/png' });
    }
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TILE_MS);
    try {
      const r = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.blob();
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'timeout' : e.message || String(e)); } finally { clearTimeout(t); }
  }
  function streetFailed() {
    streetState.fails++; streetState.failed++;
    if (streetState.fails < 6) return;
    streetState.fails = 0;
    const auto = !S.streetSrc || S.streetSrc === 'auto';
    if (auto && streetState.auto < STREET_SOURCES.length - 1) {
      const from = STREET_SOURCES[streetState.auto].name; streetState.auto++;
      toast(`Street map: ${from} is not answering — trying ${streetSource().name}`, 4000);
      if (mainBase && mainBase.options && mainBase.options.src === 'street') mainBase.redraw();
      if (pinBase && pinBase.options && pinBase.options.src === 'street') pinBase.redraw();
    } else if (navigator.onLine !== false && Date.now() - streetState.lastWarn > 300000) { // the browser believes it is online, yet no server answers
      streetState.lastWarn = Date.now();
      toast(activePackId() ? 'Map servers not reachable — switch to the offline map (layers button)' : 'Map servers not reachable: check the internet connection, or get an offline map pack', 5000);
    }
  }
  async function fetchTile(src, z, x, y, alive) {
    // Satellite imagery is never stored: Esri allows offline imagery only in its own ArcGIS apps.
    if (src === 'satellite') return null;
    const ssrc = streetSource(), k = `${ssrc.key}/${z}/${x}/${y}`;
    let hit = null;
    try { hit = await dbGet('tiles', k); } catch (e) { /* ignore */ }
    // Viewed tiles are reused for 7 days (the tile servers' caching rules), then refreshed; a stale tile is still shown when the server fails.
    if (hit && Date.now() - (hit.t || 0) < TILE_KEEP_MS) return hit.blob;
    if (hit && navigator.onLine === false) return hit.blob; // the browser is sure there is no connection
    if (!(await tileSlot(alive))) return hit ? hit.blob : null; // the tile left the screen while waiting
    try {
      const url = ssrc.url.replace('{z}', z).replace('{x}', x).replace('{y}', y), viaNative = NATIVE && ssrc.id === 'osm';
      const blob = await getTileBlob(url, viaNative);
      streetState.fails = 0; streetState.ok++;
      dbPut('tiles', { k, blob, t: Date.now() }).catch(() => {});
      return blob;
    } catch (e) {
      streetFailed();
      return hit ? hit.blob : null;
    } finally { tileFree(); }
  }
  /** Tries one small tile from every map server, for the Maps screen ("why is the map blank?"). */
  async function mapCheck() {
    const out = [];
    for (const src of STREET_SOURCES.concat([SAT_SOURCE])) {
      const url = src.url.replace('{z}', 6).replace('{x}', 54).replace('{y}', 30), t0 = Date.now(); // a tile over Mindanao
      try { const b = await withTimeout(getTileBlob(url, NATIVE && src.id === 'osm'), 12000, 'timeout'); out.push({ src, ok: b.size > 0, ms: Date.now() - t0 }); }
      catch (e) { out.push({ src, ok: false, ms: Date.now() - t0, err: e.message || String(e) }); }
    }
    return out;
  }
  const CachedLayer = L.TileLayer.extend({
    createTile(coords, done) {
      const img = document.createElement('img');
      img.alt = ''; img.setAttribute('role', 'presentation');
      img.onload = () => done(null, img);
      img.onerror = (e) => done(e, img);
      const src = this.options.src;
      // Satellite imagery is loaded by the browser itself (never stored, Esri terms); street tiles go through the cache.
      if (src === 'satellite') { img.src = tileUrl(src, coords.z, coords.x, coords.y); return img; }
      fetchTile(src, coords.z, coords.x, coords.y, () => !img._dead).then((blob) => {
        if (img._dead) return;
        if (blob) { img._ou = URL.createObjectURL(blob); img.src = img._ou; }
        else done(new Error('offline'), img);
      });
      return img;
    },
  });
  function baseLayer(src) {
    if (src === 'offline') { const o = offlineLayer(); if (o) return o; src = 'street'; }
    const l = new CachedLayer('', { src, maxZoom: 21, maxNativeZoom: SOURCES[src].max, attribution: SOURCES[src].attr });
    l.on('tileunload', (e) => { e.tile._dead = true; if (e.tile._ou) URL.revokeObjectURL(e.tile._ou); });
    return l;
  }

  /* ================= offline map packs (vector maps stored on the phone) ================= */
  /* A pack is a PMTiles file of OpenStreetMap data for a whole area, drawn by protomaps-leaflet. It is kept as one file in the
     app's private file storage (OPFS) where the phone supports it, otherwise in IndexedDB in 1 MB pieces. Every storage step
     has a time limit, so a phone that stops responding gives a message instead of freezing. */
  const PACK_CH = 1024 * 1024, STORE_MS = 30000;
  S.packs = S.packs || {};
  Object.values(S.packs).forEach((p) => { if (!p.store) { p.store = 'idb'; p.ch = p.ch || 4 * 1024 * 1024; p.bytes = p.done ? p.size : (p.chunks || 0) * p.ch; } });
  const OPFS_OK = !!(navigator.storage && navigator.storage.getDirectory && window.FileSystemFileHandle && 'createWritable' in window.FileSystemFileHandle.prototype);
  const installedPacks = () => Object.values(S.packs).filter((p) => p.done);
  function activePackId() {
    if (S.activePack && S.packs[S.activePack] && S.packs[S.activePack].done) return S.activePack;
    const first = installedPacks()[0];
    return first ? first.id : null;
  }
  function withTimeout(p, ms, msg) {
    let t = 0;
    return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); })]).finally(() => clearTimeout(t));
  }
  const STORE_ERR = 'Phone storage did not respond. Free some space or restart the app, then tap Resume.';
  async function packDir() { const root = await navigator.storage.getDirectory(); return root.getDirectoryHandle('mappacks', { create: true }); }
  const OPFS_PART = 8 * 1024 * 1024; // OPFS packs are stored as part files <id>.0, <id>.1, … of 8 MB
  class PackSource {
    constructor(id) { this.id = id; this.cache = new Map(); this.files = new Map(); }
    getKey() { const p = S.packs[this.id] || {}; return `pack:${this.id}:${p.date || ''}:${p.size || ''}`; }
    async chunk(i) {
      if (this.cache.has(i)) { const v = this.cache.get(i); this.cache.delete(i); this.cache.set(i, v); return v; }
      const rec = await dbGet('packs', `${this.id}:${i}`);
      if (!rec) throw new Error('Map pack is incomplete — download it again');
      const u = new Uint8Array(rec.data);
      this.cache.set(i, u);
      if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
      return u;
    }
    async part(i) {
      if (!this.files.has(i)) this.files.set(i, (async () => (await (await packDir()).getFileHandle(`${this.id}.${i}`)).getFile())());
      return this.files.get(i);
    }
    async getBytes(offset, length) {
      const p = S.packs[this.id], out = new Uint8Array(length);
      const opfs = p.store === 'opfs', ch = opfs ? OPFS_PART : p.ch || 4 * 1024 * 1024; // IndexedDB packs from v1.6/v1.7 used 4 MB pieces
      let pos = 0;
      while (pos < length) {
        const abs = offset + pos, i = Math.floor(abs / ch), off = abs - i * ch;
        if (abs >= (p.done ? p.size : p.bytes)) break;
        let piece;
        if (opfs) { const f = await this.part(i); piece = new Uint8Array(await f.slice(off, Math.min(f.size, off + length - pos)).arrayBuffer()); }
        else { if (i >= p.chunks) break; const c = await this.chunk(i); piece = c.subarray(off, Math.min(c.length, off + length - pos)); }
        if (!piece.length) break;
        out.set(piece, pos); pos += piece.length;
      }
      return { data: pos === length ? out.buffer : out.slice(0, pos).buffer };
    }
  }
  /** Writes a pack from st.bytes onward and keeps st.bytes = what is safely stored. */
  async function packWriter(st) {
    if (st.store === 'opfs') {
      const dir = await withTimeout(packDir(), STORE_MS, STORE_ERR);
      let w = null, part = -1, partFill = 0;
      const open = async (i, keep) => {
        const fh = await withTimeout(dir.getFileHandle(`${st.id}.${i}`, { create: true }), STORE_MS, STORE_ERR);
        w = await withTimeout(fh.createWritable({ keepExistingData: keep }), STORE_MS, STORE_ERR);
        part = i;
        if (keep && partFill) await withTimeout(w.seek(partFill), STORE_MS, STORE_ERR);
      };
      const close = async () => { if (!w) return; const x = w; w = null; await withTimeout(x.close(), STORE_MS, STORE_ERR); st.bytes = part * OPFS_PART + partFill; persist(); };
      partFill = st.bytes % OPFS_PART;
      return {
        get pos() { return (part < 0 ? st.bytes : part * OPFS_PART + partFill); },
        async write(u8) {
          let v = u8;
          while (v.length) {
            if (!w) await open(Math.floor(this.pos / OPFS_PART), partFill > 0);
            const n = Math.min(v.length, OPFS_PART - partFill);
            await withTimeout(w.write(v.subarray(0, n)), STORE_MS, STORE_ERR);
            partFill += n; v = v.subarray(n);
            if (partFill === OPFS_PART) { await close(); part += 1; partFill = 0; }
          }
        },
        async finish() { await close(); },
        async stop() { try { await close(); } catch (e) { /* keep the last saved part */ } },
      };
    }
    st.ch = st.ch || PACK_CH;
    let buf = new Uint8Array(st.ch), fill = 0;
    const flush = async (last) => {
      if (!fill) return;
      await withTimeout(dbPut('packs', { k: `${st.id}:${st.chunks}`, data: (last ? buf.slice(0, fill) : buf).buffer }), STORE_MS, STORE_ERR);
      st.chunks++; st.bytes += fill; fill = 0; buf = new Uint8Array(st.ch); persist();
    };
    return {
      get pos() { return st.bytes + fill; },
      async write(u8) {
        let v = u8;
        while (v.length) {
          const n = Math.min(v.length, st.ch - fill);
          buf.set(v.subarray(0, n), fill); fill += n; v = v.subarray(n);
          if (fill === st.ch) await flush(false);
        }
      },
      async finish() { await flush(true); },
      async stop() { /* a partly filled piece is fetched again on resume */ },
    };
  }
  async function removePackData(p) {
    if (p.store === 'opfs') {
      const dir = await packDir(), names = [];
      for await (const name of dir.keys()) if (name.startsWith(`${p.id}.`)) names.push(name);
      for (const n of names) await dir.removeEntry(n).catch(() => {});
    }
    else if (p.chunks) await dbDelMany('packs', Array.from({ length: p.chunks }, (_, i) => `${p.id}:${i}`));
  }
  /** Reads bounds and zoom range from a PMTiles v3 header (first 127 bytes). */
  function pmtilesHeader(u8) {
    if (u8.length < 127 || String.fromCharCode(...u8.subarray(0, 7)) !== 'PMTiles' || u8[7] !== 3) return null;
    const dv = new DataView(u8.buffer, u8.byteOffset, 127), e7 = (o) => dv.getInt32(o, true) / 1e7;
    return { tileType: u8[99], minzoom: u8[100], maxzoom: u8[101], bbox: [e7(102), e7(106), e7(110), e7(114)] };
  }
  function offlineLayer() {
    const id = activePackId();
    if (!id || !window.protomapsL) return null;
    const p = S.packs[id], b = p.bbox;
    return window.protomapsL.leafletLayer({
      url: new window.protomapsL.PMTiles(new PackSource(id)), flavor: 'light', lang: 'en',
      maxDataZoom: p.maxzoom || 15, maxZoom: 21, bounds: b ? [[b[1], b[0]], [b[3], b[2]]] : undefined,
      attribution: 'Offline map © OpenStreetMap contributors · Protomaps',
    });
  }

  /* ================= main map ================= */
  const map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: 21 });
  map.attributionControl.setPrefix(false);
  let mainBase = baseLayer(S.base).addTo(map);
  map.createPane('refPane'); map.getPane('refPane').style.zIndex = 350; map.getPane('refPane').style.pointerEvents = 'none'; // under the pins, never catches taps
  const refLayer = L.layerGroup().addTo(map), refLabels = L.layerGroup().addTo(map);
  const poleLayer = L.layerGroup().addTo(map);
  const gpsLayer = L.layerGroup().addTo(map);
  if (S.view) map.setView([S.view.lat, S.view.lon], S.view.z); else map.setView([12.3, 122.6], 6);
  map.on('moveend', () => { const c = map.getCenter(); S.view = { lat: c.lat, lon: c.lng, z: map.getZoom() }; persist(); });
  const labelsFor = () => map.getContainer().classList.toggle('hide-labels', map.getZoom() < 16);
  map.on('zoomend', labelsFor); labelsFor();

  const TYPE_COLORS = ['#e8590c', '#1971c2', '#2b8a3e', '#9c36b5', '#c2255c', '#0c8599', '#5c940d', '#495057'];
  const typeColor = (t) => { const names = typeNames(), i = names.indexOf(t); return TYPE_COLORS[(i < 0 ? names.length : i) % TYPE_COLORS.length]; };

  function renderPoles() {
    poleLayer.clearLayers();
    if (isAcc() && routeMode) setRouteMode(false);
    $('routeBtn').hidden = isAcc();
    const R = drawRoute();
    const pts = projPoints();
    for (const p of pts) {
      const acc = p.kind === 'acceptance', n = openCount(p), sel = routeMode && p.id === routeSel;
      const m = L.circleMarker([p.lat, p.lon], { radius: sel ? 12 : acc && elemOf(p) !== 'Pole' ? 10 : 8, color: sel ? '#17202a' : acc && elemOf(p) !== 'Pole' ? '#17202a' : '#fff', weight: sel ? 4 : 2,
        fillColor: acc ? STATUS_COLORS[recStatus(p)] : typeColor(p.poleType), fillOpacity: 1 });
      const role = R && R.poles[p.id] && (R.poles[p.id].role === 'Angle' ? ` · ${Math.round(R.poles[p.id].deflection)}°` : R.poles[p.id].role === 'Junction' ? ' · junction' : '');
      m.bindTooltip(`${C.xmlEsc(p.poleId || '(no ID)')}${acc && n ? ` · ${n} open` : ''}${role || ''}`, { permanent: true, direction: 'right', offset: [8, 0], className: 'pole-label' });
      m.on('click', () => (routeMode ? routeTap(p.id) : visitMode() ? openVisit(p.id) : openEditorFor(p.id)));
      m.addTo(poleLayer);
    }
    $('projectName').textContent = S.project;
    if (refFor !== S.project || !refLayer.getLayers().length) drawRef(false);
    const cat = taskCat(), mb = $('modeBadge');
    mb.textContent = cat.toUpperCase(); mb.className = `badge cat ${cat.toLowerCase()}`;
    $('listLbl').textContent = 'Records';
    renderSummary(pts);
    if (typeof drawAreas === 'function') drawAreas();
  }
  /** Project status at a glance: the strip above the navigation bar and the figures on the Records screen. */
  function projStats(pts) {
    const acc = isAcc(), st = { total: pts.length, open: 0, rect: 0, ver: 0, ok: 0, items: 0, itemsOpen: 0, itemsRect: 0, itemsVer: 0, notes: 0, long: 0, len: 0 };
    if (acc) {
      pts.forEach((p) => {
        const r = recStatus(p); if (r === 'Open') st.open++; else if (r === 'Rectified') st.rect++; else if (r === 'Verified') st.ver++; else st.ok++;
        (p.defs || []).forEach((d) => { if (d.sev === 'Note') { st.notes++; return; } st.items++; const q = defStatusOf(d); if (q === 'Open') st.itemsOpen++; else if (q === 'Rectified') st.itemsRect++; else st.itemsVer++; });
      });
    } else { const R = routeModel(); st.long = R.spans.filter((x) => x.long).length; st.len = R.spans.reduce((a, x) => a + x.len, 0); }
    return st;
  }
  function renderSummary(pts) {
    const acc = isAcc(), st = projStats(pts), m = pmeta();
    const W = pts.length ? workflowModel() : null;
    const pill = (cls, text) => `<span class="pill ${cls}">${C.xmlEsc(text)}</span>`;
    if (!pts.length) { $('sumTitle').textContent = 'Nothing captured yet'; $('sumSub').textContent = acc ? 'Tap the camera to record the first element' : 'Tap the camera to capture the first pole'; $('sumPills').innerHTML = ''; return; }
    $('mapSummary').classList.remove('go');
    if (acc) {
      $('sumTitle').textContent = `${st.total} element${st.total === 1 ? '' : 's'} · ${st.items} deficienc${st.items === 1 ? 'y' : 'ies'}${st.notes ? ` · ${st.notes} note${st.notes === 1 ? '' : 's'}` : ''}`;
      $('sumSub').textContent = W && W.next ? `Next: ${W.next.t}` : [m.site, m.contractor].filter(Boolean).join(' · ') || 'All steps done';
      if (visitMode()) renderVisitStrip();
      $('sumPills').innerHTML = [st.itemsOpen && pill('bad', `${st.itemsOpen} open`), st.itemsRect && pill('rect', `${st.itemsRect} to verify`), st.itemsVer && pill('ver', `${st.itemsVer} verified`), !st.items && pill('ok', 'All clear')].filter(Boolean).join('');
    } else {
      const R = routeModel(), linked = st.total - R.off;
      $('sumTitle').textContent = R.spans.length ? `${st.total} pole${st.total === 1 ? '' : 's'} · route ${fmtLen(st.len)} · ${R.spans.length} span${R.spans.length === 1 ? '' : 's'}` : `${st.total} pole${st.total === 1 ? '' : 's'} captured`;
      $('sumSub').textContent = !R.spans.length ? (st.total > 1 ? 'Next: link the route (route button)' : 'Capture the next pole to start the route')
        : st.long ? `${st.long} span${st.long === 1 ? '' : 's'} over ${pol().maxSpan || 200} m — check the route` : R.off ? `${R.off} pole${R.off === 1 ? '' : 's'} not on the route yet` : W && W.next ? `Next: ${W.next.t}` : 'All steps done';
      $('sumPills').innerHTML = !R.spans.length ? '' : st.long ? pill('bad', `${st.long} long`) : R.off ? pill('note', `${R.off} unlinked`) : pill('ok', 'Spans OK');
    }
  }
  $('mapSummary').addEventListener('click', () => { const t = visitMode() && nextTarget(); if (t) openVisit(t.r.id, true); else $('listBtn').click(); });

  /* ================= reference KMZ: HLD route, homing and POI pins (read-only overlay) ================= */
  /* Any KMZ / KML can be loaded per project and is drawn under the pins as thin dashed lines and small dots. It is only a
     guide: the survey can take another route, and the reference is never exported or changed. Kept in IndexedDB. */
  const REF_COL = '#7048e8', REF_MAX_PTS = 20000, REF_MAX_LINES = 5000;
  const refKey = (id) => `~ref:${id}`;
  let refGeo = null, refFor = null;
  const refInfo = (name) => (S.refs || {})[name || S.project] || null;
  function kmlColor(t) { const v = String(t || '').trim(); return /^[0-9a-f]{8}$/i.test(v) ? `#${v.slice(6, 8)}${v.slice(4, 6)}${v.slice(2, 4)}` : null; }
  /** Pins, lines and areas of a KML document, with their colours and folder names. */
  function parseKml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This KML file could not be read');
    const kids = (el, tag) => [...el.children].filter((c) => c.localName === tag);
    const one = (el, tag) => kids(el, tag)[0] || null;
    const txt = (el, tag) => { const c = el && one(el, tag); return c ? c.textContent.trim() : ''; };
    const all = (el, tag) => [...el.getElementsByTagName('*')].filter((c) => c.localName === tag);
    const styles = {}, maps = {};
    const readStyle = (st) => { const ls = all(st, 'LineStyle')[0], is = all(st, 'IconStyle')[0], ps = all(st, 'PolyStyle')[0];
      return { line: ls && kmlColor(txt(ls, 'color')), w: ls ? +txt(ls, 'width') || null : null, icon: is && kmlColor(txt(is, 'color')), poly: ps && kmlColor(txt(ps, 'color')) }; };
    all(doc, 'Style').forEach((st) => { const id = st.getAttribute('id'); if (id) styles[id] = readStyle(st); });
    all(doc, 'StyleMap').forEach((sm) => { const id = sm.getAttribute('id'); const pr = all(sm, 'Pair').find((x) => txt(x, 'key') === 'normal'); if (id && pr) maps[id] = txt(pr, 'styleUrl').replace(/^.*#/, ''); });
    const styleOf = (pm) => { const inl = one(pm, 'Style'); if (inl) return readStyle(inl); let u = txt(pm, 'styleUrl').replace(/^.*#/, ''); if (maps[u]) u = maps[u]; return styles[u] || {}; };
    const coords = (el) => txt(el, 'coordinates').split(/\s+/).map((c) => c.split(',').map(Number)).filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[1]) <= 90).map((c) => [+c[1].toFixed(7), +c[0].toFixed(7)]);
    const folderOf = (pm) => { for (let el = pm.parentElement; el; el = el.parentElement) if (el.localName === 'Folder') return txt(el, 'name'); return ''; };
    const out = { points: [], lines: [], polys: [] };
    for (const pm of all(doc, 'Placemark')) {
      const n = txt(pm, 'name').slice(0, 80), f = folderOf(pm).slice(0, 60), st = styleOf(pm);
      for (const g of all(pm, 'Point')) { const c = coords(g)[0]; if (c && out.points.length < REF_MAX_PTS) out.points.push({ n, f, c, col: st.icon || null }); }
      for (const g of all(pm, 'LineString')) { const c = coords(g); if (c.length > 1 && out.lines.length < REF_MAX_LINES) out.lines.push({ n, f, c, col: st.line || null, w: st.w }); }
      for (const g of all(pm, 'Polygon')) { const ob = all(g, 'outerBoundaryIs')[0], ring = ob && all(ob, 'LinearRing')[0], c = ring ? coords(ring) : []; if (c.length > 2 && out.lines.length < REF_MAX_LINES) out.polys.push({ n, f, c, col: st.line || st.poly || null }); }
    }
    return out;
  }
  const lineLen = (c) => c.reduce((t, p, i) => (i ? t + haversine({ lat: c[i - 1][0], lon: c[i - 1][1] }, { lat: p[0], lon: p[1] }) : 0), 0);
  async function loadRefFile(f) {
    busy('Reading the reference KMZ…');
    const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
    let text;
    if (head[0] === 0x50 && head[1] === 0x4b) { // a KMZ is a ZIP
      const z = await zipReader(f), name = z.names.find((n) => /(^|\/)doc\.kml$/i.test(n)) || z.names.find((n) => /\.kml$/i.test(n));
      if (!name) throw new Error('There is no KML inside this KMZ');
      text = new TextDecoder().decode(await z.get(name));
    } else text = await f.text();
    const geo = parseKml(text);
    const n = { pins: geo.points.length, lines: geo.lines.length, areas: geo.polys.length, km: +(geo.lines.reduce((t, l) => t + lineLen(l.c), 0) / 1000).toFixed(2) };
    if (!n.pins && !n.lines && !n.areas) throw new Error('No pins, lines or areas found in this file');
    const old = refInfo(), id = uid();
    await dbPut('packs', { k: refKey(id), geo });
    if (old) await dbDel('packs', refKey(old.id)).catch(() => {});
    S.refs = { ...(S.refs || {}), [S.project]: { id, name: f.name || 'reference', at: new Date().toISOString(), n } }; S.refHidden = { ...(S.refHidden || {}), [S.project]: false }; persist();
    refGeo = geo; refFor = S.project; busy(false);
    LOG.info('ref.loaded', n);
    drawRef(true); renderRefInfo();
    toast(`Reference loaded: ${n.lines ? `${n.lines} line${n.lines === 1 ? '' : 's'} (${n.km} km)` : ''}${n.lines && n.pins ? ' · ' : ''}${n.pins ? `${n.pins} pin${n.pins === 1 ? '' : 's'}` : ''}${n.areas ? ` · ${n.areas} area${n.areas === 1 ? '' : 's'}` : ''}`, 4000);
  }
  async function refGeoFor(name) {
    const info = refInfo(name); if (!info) return null;
    if (refFor === name && refGeo) return refGeo;
    const rec = await dbGet('packs', refKey(info.id)).catch(() => null);
    refGeo = rec ? rec.geo : null; refFor = name; return refGeo;
  }
  const refRenderer = L.canvas({ pane: 'refPane', padding: 0.3 });
  function addRefShapes(group, geo, renderer, pane) {
    const o = { renderer, pane, interactive: false };
    geo.polys.forEach((g) => L.polygon(g.c, { ...o, color: g.col || REF_COL, weight: 2, opacity: 0.8, dashArray: '4 6', fill: false }).addTo(group));
    geo.lines.forEach((g) => L.polyline(g.c, { ...o, color: g.col || REF_COL, weight: Math.min(5, Math.max(2, g.w || 3)), opacity: 0.85, dashArray: '8 6' }).addTo(group));
    geo.points.forEach((g) => L.circleMarker(g.c, { ...o, radius: 4, color: '#fff', weight: 1, fillColor: g.col || REF_COL, fillOpacity: 0.95 }).addTo(group));
  }
  /** Draws the current project's reference on the main map (fit: zoom to it once after loading). */
  async function drawRef(fit) {
    refLayer.clearLayers(); refLabels.clearLayers();
    const info = refInfo(); if (!info || (S.refHidden || {})[S.project]) return;
    const geo = await refGeoFor(S.project); if (!geo || refFor !== S.project) return;
    addRefShapes(refLayer, geo, refRenderer, 'refPane');
    if (fit) { const b = L.latLngBounds([...geo.points.map((g) => g.c), ...geo.lines.flatMap((g) => g.c), ...geo.polys.flatMap((g) => g.c)]); if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 18 }); }
    refLabelUpdate();
  }
  /** Names of the reference pins and lines, only when zoomed in (there can be thousands of homing pins). */
  function refLabelUpdate() {
    refLabels.clearLayers();
    if (!refGeo || refFor !== S.project || (S.refHidden || {})[S.project] || !refInfo() || map.getZoom() < 18) return;
    const b = map.getBounds().pad(0.1); let k = 0;
    for (const g of refGeo.points) { if (!g.n || !b.contains(g.c)) continue; if (++k > 120) break;
      L.marker(g.c, { pane: 'refPane', interactive: false, icon: L.divIcon({ className: 'ref-label', html: C.xmlEsc(g.n), iconSize: null, iconAnchor: [-6, 8] }) }).addTo(refLabels); }
  }
  map.on('moveend zoomend', refLabelUpdate);
  /** The same overlay on the editor's pin map, to put the pin where the design expects it. */
  let pinRefLayer = null, pinRefRenderer = null;
  async function drawPinRef() {
    if (!pinMap) return;
    if (!pinRefLayer) { pinMap.createPane('refPane'); pinMap.getPane('refPane').style.zIndex = 350; pinMap.getPane('refPane').style.pointerEvents = 'none'; pinRefLayer = L.layerGroup().addTo(pinMap); pinRefRenderer = L.canvas({ pane: 'refPane', padding: 0.3 }); }
    pinRefLayer.clearLayers();
    if (!refInfo() || (S.refHidden || {})[S.project]) return;
    const geo = await refGeoFor(S.project); if (!geo) return;
    addRefShapes(pinRefLayer, geo, pinRefRenderer, 'refPane');
  }
  function renderRefInfo() {
    const info = refInfo(), hidden = (S.refHidden || {})[S.project];
    $('refInfo').textContent = info ? `${info.name}: ${[info.n.lines && `${info.n.lines} line${info.n.lines === 1 ? '' : 's'} (${info.n.km} km)`, info.n.pins && `${info.n.pins} pin${info.n.pins === 1 ? '' : 's'}`, info.n.areas && `${info.n.areas} area${info.n.areas === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}${hidden ? ' · hidden' : ''}` : 'No reference loaded.';
    $('refToggle').hidden = $('refRemove').hidden = !info; $('refToggle').textContent = hidden ? 'Show' : 'Hide';
    $('refLoad').textContent = info ? 'Replace…' : 'Load KMZ / KML…';
  }
  $('refLoad').addEventListener('click', () => { $('refInput').value = ''; $('refInput').click(); });
  $('refInput').addEventListener('change', (e) => guard(async () => { const f = e.target.files[0]; if (f) await loadRefFile(f); }, 'Reference not loaded'));
  $('refToggle').addEventListener('click', () => { S.refHidden = { ...(S.refHidden || {}), [S.project]: !(S.refHidden || {})[S.project] }; persist(); drawRef(false); renderRefInfo(); });
  $('refRemove').addEventListener('click', () => guard(async () => {
    const info = refInfo(); if (!info) return;
    await dbDel('packs', refKey(info.id)).catch(() => {});
    const r = { ...(S.refs || {}) }; delete r[S.project]; S.refs = r; persist(); refGeo = null; refFor = null;
    drawRef(false); renderRefInfo(); toast('Reference removed');
  }, 'Reference not removed'));
  /* ================= route and spans (survey projects) ================= */
  let routeMode = false, routeSel = null, routeUndo = [];
  const routeLayer = L.layerGroup().addTo(map);
  const links = () => (pmeta().links || []);
  function setLinks(l) { S.meta = S.meta || {}; S.meta[S.project] = { ...pmeta(), links: l }; persist(); }
  const routeModel = () => C.analyzeRoute(projPoints(), links(), { maxSpan: pol().maxSpan || 200, angleDeg: pol().angleDeg || 15 });
  const fmtLen = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
  function drawRoute() {
    routeLayer.clearLayers();
    if (isAcc()) return null;
    const R = routeModel();
    for (const s of R.spans) {
      L.polyline([[s.a.lat, s.a.lon], [s.b.lat, s.b.lon]], { color: s.long ? '#c92a2a' : '#1c7ed6', weight: 4, opacity: 0.9, dashArray: s.long ? '8 6' : null, interactive: false }).addTo(routeLayer);
      L.marker([(s.a.lat + s.b.lat) / 2, (s.a.lon + s.b.lon) / 2], { interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'span-icon', html: `<span class="span-label${s.long ? ' long' : ''}">${s.len.toFixed(0)} m</span>`, iconSize: null }) }).addTo(routeLayer);
    }
    for (const p of projPoints()) {
      const info = R.poles[p.id];
      if (info && (info.role === 'Angle' || info.role === 'Junction')) L.circleMarker([p.lat, p.lon], { radius: 14, color: info.role === 'Angle' ? '#e8590c' : '#9c36b5', weight: 2, fill: false, interactive: false }).addTo(routeLayer);
    }
    if (routeMode) updateRouteBar(R);
    return R;
  }
  function updateRouteBar(R) {
    $('rbTitle').textContent = `Route · ${R.spans.length} span${R.spans.length === 1 ? '' : 's'} · ${fmtLen(R.total)}`;
    $('rbStats').textContent = `${R.long} longer than ${pol().maxSpan || 200} m · ${R.angle} angle · ${R.junction} junction · ${R.off} not linked`;
    const sel = routeSel && points.find((p) => p.id === routeSel);
    $('rbHint').textContent = sel ? `${sel.poleId} selected. Tap the next pole to link it (tap a linked pole to unlink), or tap ${sel.poleId} again to stop.`
      : 'Tap a pole, then the next pole to link them. Tap a linked pair again to unlink.';
    $('rbUndo').disabled = !routeUndo.length;
  }
  function setRouteMode(on) {
    routeMode = on; routeSel = null; routeUndo = [];
    $('routeBar').hidden = !on; $('routeBtn').setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('routing', on);
    renderPoles();
    if (on) { // frame all poles above the route bar so they are easy to tap
      const pts = projPoints();
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lon])), { paddingTopLeft: [40, 80], paddingBottomRight: [40, 230], maxZoom: 19 });
    }
  }
  function routeTap(id) {
    if (!routeSel || routeSel === id) { routeSel = routeSel === id ? null : id; renderPoles(); return; }
    const l = links().map((x) => x.slice()), k = l.findIndex(([x, y]) => (x === routeSel && y === id) || (x === id && y === routeSel));
    routeUndo.push(links());
    if (k >= 0) l.splice(k, 1); else l.push([routeSel, id]);
    setLinks(l); routeSel = id; renderPoles();
  }
  $('routeBtn').addEventListener('click', () => {
    if (!routeMode && projPoints().length < 2) { toast('Capture at least two poles first'); return; }
    setRouteMode(!routeMode);
  });
  $('rbDone').addEventListener('click', () => setRouteMode(false));
  $('rbUndo').addEventListener('click', () => { if (routeUndo.length) { setLinks(routeUndo.pop()); renderPoles(); } });
  $('rbAuto').addEventListener('click', () => {
    const have = new Set(links().map(([x, y]) => [x, y].sort().join('|')));
    const add = C.autoLinks(projPoints(), pol().autoGap || 120).filter(([x, y]) => !have.has([x, y].sort().join('|')));
    if (!add.length) { toast('No new links: poles are already linked, or consecutive poles are farther apart than the gap setting'); return; }
    routeUndo.push(links()); setLinks(links().concat(add)); renderPoles();
    toast(`${add.length} span${add.length === 1 ? '' : 's'} added in capture order. Check branches and street corners.`, 4000);
  });
  $('rbClear').addEventListener('click', () => {
    const b = $('rbClear');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to clear'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'Clear'; }, 3500); return; }
    delete b.dataset.armed; b.textContent = 'Clear';
    routeUndo.push(links()); setLinks([]); routeSel = null; renderPoles();
  });

  function fitProject() {
    const pts = projPoints();
    if (pts.length === 1) map.setView([pts[0].lat, pts[0].lon], 18);
    else if (pts.length) map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lon])).pad(0.15), { maxZoom: 19 });
  }
  const baseName = (b) => (b === 'offline' ? `Offline map: ${(S.packs[activePackId()] || {}).name || 'pack'}` : b === 'satellite' ? 'Satellite imagery (online)' : 'Street map (online)');
  function setBase(b, quiet) {
    if (b === 'offline' && !activePackId()) b = 'street';
    S.base = b; persist();
    map.removeLayer(mainBase); mainBase = baseLayer(b).addTo(map); mainBase.bringToBack();
    if (pinMap) { pinMap.removeLayer(pinBase); pinBase = baseLayer(b).addTo(pinMap); pinBase.bringToBack(); }
    $('pinLayerName').textContent = { street: 'Street', satellite: 'Satellite', offline: 'Offline map' }[b];
    drawAreas();
    if (!quiet) toast(baseName(b), 1800);
  }
  function cycleBase() {
    const bases = ['street', 'satellite'].concat(activePackId() ? ['offline'] : []);
    autoOffline = false;
    setBase(bases[(bases.indexOf(S.base) + 1) % bases.length]);
  }
  $('layerBtn').addEventListener('click', cycleBase);
  $('pinLayerBtn').addEventListener('click', cycleBase);
  // No signal: switch to the offline pack automatically (and back when the connection returns).
  let autoOffline = false;
  function goOfflineIfPossible() {
    if (navigator.onLine || S.base === 'offline' || !activePackId()) return;
    S.baseBefore = S.base; autoOffline = true; setBase('offline', true);
    toast(`No internet — showing the offline map (${(S.packs[activePackId()] || {}).name})`, 3500);
  }
  window.addEventListener('offline', goOfflineIfPossible);
  window.addEventListener('online', () => { if (autoOffline) { autoOffline = false; setBase(S.baseBefore || 'street', true); toast('Back online', 1500); } });
  $('locateBtn').addEventListener('click', () => {
    if (!watchId) startGps();
    if (fix) map.setView([fix.lat, fix.lon], Math.max(map.getZoom(), 18));
    else toast('Waiting for GPS…');
  });

  /* ================= GPS ================= */
  let fix = null, watchId = 0, gpsErr = 0, gpsPolling = false;
  const quality = (acc) => (acc == null ? '' : acc <= 5 ? 'good' : acc <= 15 ? 'fair' : 'poor');
  function startGps() {
    if (!('geolocation' in navigator)) { $('gpsText').textContent = 'No GPS on this device'; return; }
    if (watchId) return;
    watchId = navigator.geolocation.watchPosition(onFix, onGpsErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function onGpsErr(err) {
    gpsErr = err.code;
    const msg = err.code === 1 ? 'Location is off or blocked — turn it on and allow PoleCam' : 'Searching for GPS…';
    $('gpsText').textContent = msg; $('camGpsText').textContent = msg;
    if (err.code === 1 && watchId) { navigator.geolocation.clearWatch(watchId); watchId = 0; }
    shutterState();
  }
  function stopGps() { if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = 0; } }
  function onFix(pos) {
    const c = pos.coords;
    fix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, alt: c.altitude, t: pos.timestamp }; gpsErr = 0;
    const q = quality(fix.acc), txt = `±${fix.acc < 10 ? fix.acc.toFixed(1) : Math.round(fix.acc)} m`;
    $('gpsDot').className = 'dot ' + q; $('gpsText').textContent = 'GPS ' + txt;
    $('camGpsDot').className = 'dot ' + q; $('camGpsText').textContent = 'GPS ' + txt;
    gpsLayer.clearLayers();
    L.circle([fix.lat, fix.lon], { radius: fix.acc, color: '#1c7ed6', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(gpsLayer);
    L.circleMarker([fix.lat, fix.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#1c7ed6', fillOpacity: 1, interactive: false }).addTo(gpsLayer);
    if (ed) editorGpsUpdate();
    shutterState();
    if (typeof visitGpsTick === 'function') visitGpsTick();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopGps(); else startGps(); });

  /* ================= camera ================= */
  /* Capture rules: a photo is kept only if a GPS update arrived within GPS_WINDOW_MS of the shutter (always in acceptance,
     optional in survey), then it is checked for blur and exposure, and the painted Pole ID inside the guide box is read. */
  const GPS_WINDOW_MS = 5000;
  let stream = null, imageCapture = null, torchOn = false, wakeLock = null, camTarget = 'new', camBusy = false, camTick = 0, camPending = null, camSeq = 0;
  let photoOpts = null; // still-photo size: phones with 48–200 MP sensors are asked for about 12 MP (photos are kept at 2048 px anyway)
  const STILL_MAX_W = 4032, TAKE_MS = 6000;
  async function takeStill() {
    try { return await imageCapture.takePhoto(photoOpts || undefined); }
    catch (e) { if (photoOpts) { photoOpts = null; return await imageCapture.takePhoto(); } throw e; }
  }
  const scanStep = () => camTarget === 'scan' || camTarget === 'newid';
  const gpsFresh = () => !!fix && Date.now() - fix.t <= GPS_WINDOW_MS && gpsErr !== 1;
  /** Shutter colour: green = GPS updated within 5 s (ready), red = GPS old, off or blocked; white while scanning an ID. */
  function shutterState() {
    const b = $('shutter'); if (!b) return;
    const st = scanStep() ? 'scan' : gpsFresh() ? 'ok' : 'bad';
    b.className = st;
    b.setAttribute('aria-label', st === 'scan' ? 'Read the ID' : st === 'ok' ? 'Take photo (GPS ready)' : 'Take photo (waiting for a fresh GPS fix)');
  }
  function showGuide() {
    const on = scanStep();
    $('idGuide').hidden = !on;
    $('idGuide').classList.toggle('v', S.idOrient === 'v');
    $('idGuideText').textContent = S.idOrient === 'v' ? 'Vertical ID inside the box' : 'Fit the painted ID inside the box';
    $('scanPrompt').hidden = !on;
    $('scanTitle').textContent = camTarget === 'newid' ? 'Photo kept. Now scan the ID' : 'Scan the ID';
    $('scanSkip').hidden = camTarget !== 'newid';
    $('orientH').setAttribute('aria-pressed', String(S.idOrient !== 'v'));
    $('orientV').setAttribute('aria-pressed', String(S.idOrient === 'v'));
    $('camReadId').hidden = camTarget !== 'new';
    $('camReadId').setAttribute('aria-pressed', String(S.readId !== false));
    $('camNative').hidden = on;
    shutterState();
  }
  function camGpsTick() {
    shutterState();
    if (!fix) return;
    const age = (Date.now() - fix.t) / 1000, stale = age * 1000 > GPS_WINDOW_MS;
    $('camGpsDot').className = 'dot ' + (stale ? 'poor' : quality(fix.acc));
    $('camGpsText').textContent = `GPS ±${fix.acc < 10 ? fix.acc.toFixed(1) : Math.round(fix.acc)} m · ${age < 1.5 ? 'now' : `${Math.round(age)} s ago`}`;
    // Some phones report rarely while standing still: ask for a new fix so the shutter can turn green.
    if (age > 2.5 && !gpsPolling && !scanStep() && 'geolocation' in navigator) {
      gpsPolling = true;
      navigator.geolocation.getCurrentPosition((p) => { gpsPolling = false; onFix(p); }, () => { gpsPolling = false; },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
    }
  }
  $('orientH').addEventListener('click', () => { S.idOrient = 'h'; persist(); showGuide(); });
  $('orientV').addEventListener('click', () => { S.idOrient = 'v'; persist(); showGuide(); });
  $('scanSkip').addEventListener('click', () => closeSheet()); // the photo is kept; the editor opens without an ID reading
  async function openCamera(target) {
    camTarget = target || 'new'; camPending = null; camSeq++;
    openSheet('camera'); startGps();
    $('camMsg').hidden = true; $('camTorch').hidden = true; $('qualBox').hidden = true; camCheck(false);
    showGuide();
    clearInterval(camTick); camTick = setInterval(camGpsTick, 1000); camGpsTick();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { useNativeCamera(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } } });
      if ($('camera').hidden) { stopCamera(); return; } // closed while starting
      const v = $('video'); v.srcObject = stream; await v.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      imageCapture = 'ImageCapture' in window ? new ImageCapture(track) : null;
      photoOpts = null;
      { const st = track.getSettings ? track.getSettings() : {}; LOG.info('camera.open', { target: camTarget, video: `${st.width || '?'}×${st.height || '?'}`, fps: st.frameRate, imageCapture: !!imageCapture, mem: memMB() }); }
      if (imageCapture && imageCapture.getPhotoCapabilities) {
        withTimeout(imageCapture.getPhotoCapabilities(), 3000, 'slow').then((pc) => {
          const w = pc && pc.imageWidth, h = pc && pc.imageHeight;
          LOG.info('camera.photoCaps', { w: w ? `${w.min}–${w.max}/${w.step}` : null, h: h ? `${h.min}–${h.max}/${h.step}` : null });
          if (!w || !h || !(w.max > STILL_MAX_W + 200)) return;
          const snap = (r, v) => Math.max(r.min || 0, (r.min || 0) + Math.floor((v - (r.min || 0)) / (r.step || 1)) * (r.step || 1));
          const W = snap(w, STILL_MAX_W); photoOpts = { imageWidth: W, imageHeight: snap(h, Math.round(W * h.max / w.max)) };
          LOG.info('camera.photoOpts', photoOpts);
        }).catch((e) => LOG.warn('camera.photoCaps.fail', errInfo(e)));
      }
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      $('camTorch').hidden = !caps.torch;
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* optional */ }
    } catch (e) {
      LOG.warn('camera.open.fail', errInfo(e));
      $('camMsg').hidden = false;
      $('camMsg').textContent = 'The in-app camera is blocked. Tap the camera button on the left to use your phone camera app.';
    }
  }
  /** Main photo accepted: keep the camera open and ask for the ID (pole, ODF or any other). */
  function enterIdStep(pending) {
    camPending = pending; camTarget = 'newid';
    $('qualBox').hidden = true; showGuide();
  }
  function stopCamera() {
    camSeq++; // anything still waiting for this camera (GPS, photo check) is dropped
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; imageCapture = null; torchOn = false;
    $('video').srcObject = null;
    clearInterval(camTick);
    if (qualResolve) { qualResolve(false); qualResolve = null; }
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    if (camPending) { // the camera closed during the ID step (Skip, X or Back): the photo is still used
      const p = camPending; camPending = null;
      setTimeout(() => gotPhoto(p.blob, p.gps, p.source || 'camera', { q: p.q, takenAt: p.takenAt, crop: p.crop || null }), 0);
    }
  }
  function camCheck(text) { $('camCheck').hidden = !text; if (text) $('camCheckText').textContent = text; }
  $('camClose').addEventListener('click', () => closeSheet());
  $('camReadId').addEventListener('click', () => { S.readId = S.readId === false; persist(); showGuide(); toast(S.readId ? 'After each photo you will be asked to scan the ID' : 'ID scan after each photo turned off', 2200); });
  $('camTorch').addEventListener('click', async () => {
    if (!stream) return; torchOn = !torchOn;
    try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: torchOn }] }); } catch (e) { toast('Flashlight not supported'); }
  });

  /** A GPS position taken within GPS_WINDOW_MS of the shot, waiting briefly for a fresh one if needed. */
  function gpsNear(shotAt) {
    const ok = (f) => f && Math.abs(f.t - shotAt) <= GPS_WINDOW_MS;
    if (ok(fix)) return Promise.resolve({ ...fix });
    camCheck('Checking GPS…');
    return new Promise((res) => {
      let done = false, tm = 0, iv = 0;
      const finish = (v) => { if (done) return; done = true; clearTimeout(tm); clearInterval(iv); camCheck(false); res(v); };
      tm = setTimeout(() => finish(ok(fix) ? { ...fix } : null), GPS_WINDOW_MS + 300);
      iv = setInterval(() => { if (ok(fix)) finish({ ...fix }); }, 200);
      try {
        navigator.geolocation.getCurrentPosition((p) => { onFix(p); if (ok(fix)) finish({ ...fix }); }, () => {},
          { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_WINDOW_MS });
      } catch (e) { /* the watch may still deliver */ }
    });
  }

  /** Crop of what is inside the guide box, taken from the live video frame (what the user sees). */
  function grabGuideCrop() {
    const v = $('video'), g = $('idGuide');
    if (g.hidden || !v.videoWidth) return null;
    const vr = v.getBoundingClientRect(), gr = g.getBoundingClientRect();
    const sc = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight); // object-fit: cover
    const ox = (vr.width - v.videoWidth * sc) / 2, oy = (vr.height - v.videoHeight * sc) / 2;
    const sx = Math.max(0, (gr.left - vr.left - ox) / sc), sy = Math.max(0, (gr.top - vr.top - oy) / sc);
    const sw = Math.min(v.videoWidth - sx, gr.width / sc), sh = Math.min(v.videoHeight - sy, gr.height / sc);
    if (sw < 20 || sh < 10) return null;
    const cv = document.createElement('canvas'); cv.width = Math.round(sw); cv.height = Math.round(sh);
    cv.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    cv._orient = S.idOrient === 'v' ? 'v' : 'h';
    return cv;
  }

  /* ---- photo check: dark, blank, overexposed or blurry photos are refused ---- */
  const QUAL_T = { normal: 25, strict: 60 };
  const QUAL_TEXT = {
    blurry: 'Too blurry to read the details. Hold the phone steady, tap the screen to focus, then retake.',
    dark: 'Too dark. Turn on the flashlight or move to better light.',
    bright: 'Overexposed. Avoid pointing the camera at the sun or a bright sky.',
    flat: 'No picture detail. Check that the lens is clean and the subject is in view.',
    error: 'The photo could not be checked. Take it again.',
  };
  const QUAL_TITLE = { error: 'Photo not accepted', blurry: 'Photo not accepted: blurry', dark: 'Photo not accepted: too dark', bright: 'Photo not accepted: overexposed', flat: 'Photo not accepted: no detail' };
  async function checkQuality(blob) {
    const mode = effectiveQuality();
    let src;
    try { src = await createImageBitmap(blob, { resizeWidth: 640, resizeQuality: 'medium', imageOrientation: 'from-image' }); }
    catch (e) { src = await loadImage(blob); }
    const { w: sw, h: sh } = dims(src), W = 640, H = Math.max(8, Math.round(640 * sh / sw));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g2 = cv.getContext('2d', { willReadFrequently: true }); g2.drawImage(src, 0, 0, W, H); if (src.close) src.close();
    const px = g2.getImageData(0, 0, W, H).data, n = W * H, gray = new Float32Array(n);
    let sum = 0, sum2 = 0, hi = 0, lo = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const y = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
      gray[i] = y; sum += y; sum2 += y * y; if (y >= 250) hi++; if (y <= 8) lo++;
    }
    const mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    // Laplacian variance per tile of a 3x3 grid; the second-sharpest tile is the score (one noisy tile cannot pass a blurry photo)
    const tiles = [];
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) {
      let s = 0, s2 = 0, m = 0;
      const y0 = Math.max(1, Math.floor(ty * H / 3)), y1 = Math.min(H - 1, Math.floor((ty + 1) * H / 3));
      const x0 = Math.max(1, Math.floor(tx * W / 3)), x1 = Math.min(W - 1, Math.floor((tx + 1) * W / 3));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = y * W + x, l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - W] - gray[i + W];
        s += l; s2 += l * l; m++;
      }
      tiles.push(m ? s2 / m - (s / m) ** 2 : 0);
    }
    tiles.sort((a, b) => b - a);
    const sharp = Math.round(tiles[1] * 10) / 10, flags = [];
    if (mean < 45 || lo / n > 0.55) flags.push('dark');
    else if (mean > 230 || hi / n > 0.55) flags.push('bright');
    else if (std < 12) flags.push('flat');
    if (!flags.length && sharp < QUAL_T[mode]) flags.push('blurry');
    let w = 0, h = 0;
    try { const i = window.PoleReports.jpegInfo(new Uint8Array(await blob.slice(0, 65536).arrayBuffer())); w = i.w; h = i.h; } catch (e) { /* not a JPEG */ }
    return { sharp, mean: Math.round(mean), std: Math.round(std), flags, level: mode, w, h };
  }
  let qualResolve = null, qualUrl = '';
  /** Shows why the photo was refused; the only way on is Retake. */
  function refusePhoto(blob, q) {
    if (qualUrl) URL.revokeObjectURL(qualUrl);
    qualUrl = URL.createObjectURL(blob); $('qualImg').src = qualUrl;
    $('qualTitle').textContent = QUAL_TITLE[q.flags[0]] || 'Photo not accepted';
    $('qualWhy').textContent = q.flags.map((f) => QUAL_TEXT[f]).join(' ');
    $('qualBox').hidden = false;
    return new Promise((res) => { qualResolve = res; });
  }
  $('qualRetake').addEventListener('click', () => { $('qualBox').hidden = true; if (qualResolve) { qualResolve(false); qualResolve = null; } });

  $('shutter').addEventListener('click', async () => {
    if (camBusy || !$('qualBox').hidden) return;
    if (!stream) { if (camTarget !== 'newid') useNativeCamera(); return; } // in-app camera blocked: the phone camera app takes the photo or the ID close-up
    camBusy = true; $('shutter').disabled = true;
    const seq = camSeq, alive = () => seq === camSeq && !$('camera').hidden; // false once the camera was closed meanwhile
    try {
      const shotAt = Date.now();
      if (camTarget === 'scan') { const crop = grabGuideCrop(); await closeSheet(); scanResult(crop); return; }
      if (camTarget === 'newid') { if (camPending) camPending.crop = grabGuideCrop(); await closeSheet(); return; }
      let blob = null;
      LOG.step('photo.take', { target: camTarget, still: !!imageCapture, opts: photoOpts, mem: memMB() });
      if (imageCapture) {
        try { blob = await withTimeout(takeStill(), TAKE_MS, 'slow'); LOG.info('photo.still', { ms: Date.now() - shotAt, kb: Math.round(blob.size / 1024), type: blob.type }); }
        catch (e) { blob = null; LOG.warn('photo.still.fail', { ms: Date.now() - shotAt, ...errInfo(e) }); if (e && e.message === 'slow') imageCapture = null; } // a camera that stalls: use the live picture from now on
      }
      if (!blob) {
        const v = $('video'), cv = document.createElement('canvas');
        cv.width = v.videoWidth; cv.height = v.videoHeight;
        cv.getContext('2d').drawImage(v, 0, 0);
        blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
        cv.width = cv.height = 0;
        LOG.info('photo.frame', { size: `${v.videoWidth}×${v.videoHeight}`, kb: blob ? Math.round(blob.size / 1024) : null });
        if (!blob) { LOG.done('photo.take'); toast('The camera gave no picture. Close the camera and try again.', 5000); return; }
      }
      LOG.done('photo.take');
      if (!alive()) return;
      perf.capture = Date.now() - shotAt;
      const tg = Date.now(), gps = await gpsNear(shotAt);
      LOG.info('photo.gps', { ms: Date.now() - tg, ok: !!gps, acc: gps && Number.isFinite(gps.acc) ? Math.round(gps.acc) : null, err: gpsErr || 0 });
      if (!alive()) return;
      if (!gps) { toast(gpsErr === 1 ? 'Photo not saved: location is off. Turn on location for PoleCam, then take it again.' : 'Photo not saved: GPS has not updated in the last 5 seconds. Wait for the green shutter, then take it again.', 6500); return; }
      camCheck('Checking photo…');
      const tq = Date.now();
      const q = await withTimeout(checkQuality(blob), 15000, 'slow').catch(() => ({ flags: ['error'] }));
      perf.check = Date.now() - tq; perf.px = q.w ? `${q.w}×${q.h}` : '';
      LOG.info('photo.check', { ms: perf.check, px: perf.px, kb: Math.round(blob.size / 1024), flags: q.flags, sharp: q.sharp, level: q.level });
      camCheck(false);
      if (!alive()) return;
      if (q.flags.length) { await refusePhoto(blob, q); return; }
      const takenAt = new Date(shotAt).toISOString();
      if (camTarget === 'new' && S.readId !== false) { enterIdStep({ blob, gps, q, takenAt, source: 'camera' }); return; }
      await closeSheet();
      gotPhoto(blob, gps, 'camera', { q, takenAt });
    } finally { camBusy = false; $('shutter').disabled = false; camCheck(false); LOG.done('photo.take'); }
  });
  function useNativeCamera() { $('nativeInput').value = ''; $('nativeInput').click(); }
  $('camNative').addEventListener('click', useNativeCamera);
  /* Phone camera app (fallback when the in-app camera is blocked). Only a photo taken just now is used, with a GPS fix
     taken right after returning to PoleCam; gallery pictures and older files are refused, as photos cannot be imported. */
  $('nativeInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (camTarget === 'scan') { if (stack[stack.length - 1] === 'camera') await closeSheet(); scanResult(await centerCrop(f)); return; }
    const back = Date.now(), inCam = () => stack[stack.length - 1] === 'camera', seq = camSeq;
    if (back - (f.lastModified || 0) > MAX_PHOTO_AGE_MS) { toast('Photo not used: it was not taken just now. Photos must be taken live, so their location can be checked.', 6000); return; }
    const gps = await gpsNear(back); // the phone camera app pauses this app, so the fix is taken right after returning
    if (seq !== camSeq) return; // camera closed while waiting
    if (!gps) { toast('Photo not used: no GPS update within 5 seconds. Stay in the open and take it again.', 5500); return; }
    const q = await checkQuality(f).catch(() => ({ flags: ['error'] }));
    if (seq !== camSeq) return;
    if (q.flags.length) {
      if (inCam()) await refusePhoto(f, q);
      else toast(`${QUAL_TITLE[q.flags[0]]}. ${QUAL_TEXT[q.flags[0]]}`, 6000);
      return;
    }
    prepImages(f);
    const takenAt = new Date(Math.min(back, f.lastModified || back)).toISOString();
    if (camTarget === 'new' && S.readId !== false && stream && inCam()) { enterIdStep({ blob: f, gps, q, takenAt, source: 'camera' }); return; }
    if (inCam()) await closeSheet();
    gotPhoto(f, gps, 'camera', { q, takenAt });
  });
  /** For a scan taken with the phone camera app: the band where the guide box would be. */
  async function centerCrop(blob) {
    try {
      const im = await loadImage(blob), { w, h } = dims(im), v = S.idOrient === 'v';
      const cv = document.createElement('canvas'); cv.width = Math.round(w * (v ? 0.26 : 0.8)); cv.height = Math.round(h * (v ? 0.58 : 0.22));
      cv.getContext('2d').drawImage(im, v ? w * 0.37 : w * 0.1, v ? h * 0.15 : h * 0.4, cv.width, cv.height, 0, 0, cv.width, cv.height);
      if (im.close) im.close();
      cv._orient = v ? 'v' : 'h';
      return cv;
    } catch (e) { return null; }
  }
  /** Acceptance photos added to an element must be taken within PIN_LIMIT_M of that element. */
  function checkNearElement(gps) {
    if (!ed || !ed.acc) return true;
    if (!gps) { toast('No GPS fix — photo not used. Wait for GPS, then take it again.', 4500); return false; }
    const c = pinMap.getCenter(), d = haversine(gps, { lat: c.lat, lon: c.lng });
    if (d > PIN_LIMIT_M) {
      toast(`Photo not used: you are ${fmtDist(d)} from ${$('poleId').value || 'this element'}. Photos must be taken within ${fmtDist(PIN_LIMIT_M)} of it.`, 6000);
      return false;
    }
    return true;
  }
  const qSummary = (q) => (q && q.flags ? { sharp: q.sharp, mean: q.mean, flags: q.flags, level: q.level } : null);
  function gotPhoto(blob, gps, source, extra) {
    const x = extra || {};
    if (camTarget === 'vfix' || camTarget === 'vverify') { visitPhoto(blob, gps); return; }
    if (ed && ['add', 'defect', 'after', 'verify'].includes(camTarget)) {
      if (!checkNearElement(gps)) return;
      const meta = { ...photoMeta(gps), q: qSummary(x.q) };
      if (camTarget === 'add') addEdPhoto(blob, meta);
      else if (camTarget === 'defect') setDefPhoto(blob, meta);
      else if (camTarget === 'verify') setVerifyPhoto(blob, meta);
      else setAfterPhoto(blob, meta);
      return;
    }
    if (camTarget === 'replace' && ed) {
      ed.newBlob = blob; prepImages(blob); ed.q = qSummary(x.q); showEdPhoto(blob); showQualWarn(ed.q);
      toast('Photo replaced — tap Save to keep it');
      return;
    }
    openEditor({ mode: 'new', blob, gps, source, takenAt: x.takenAt || new Date().toISOString(), q: qSummary(x.q), crop: x.crop });
  }

  /* ================= reading the painted Pole ID (offline OCR) ================= */
  let ocrW = null, ocrSeq = 0; const ocrWait = {};
  function ocrWorker() {
    if (ocrW) return ocrW;
    ocrW = new Worker('ocr-worker.js');
    ocrW.onmessage = (e) => { const cb = ocrWait[e.data.id]; if (cb) { delete ocrWait[e.data.id]; cb(e.data); } };
    ocrW.onerror = (e) => { Object.keys(ocrWait).forEach((k) => { ocrWait[k]({ ok: false, error: e.message || 'Text reader failed to load' }); delete ocrWait[k]; }); ocrW = null; };
    return ocrW;
  }
  const ocrRun = (png, psm, vars) => new Promise((res) => {
    const id = ++ocrSeq;
    const tm = setTimeout(() => { if (ocrWait[id]) { delete ocrWait[id]; res({ ok: false, error: 'Text reader timed out' }); } }, 30000);
    ocrWait[id] = (r) => { clearTimeout(tm); res(r); };
    // No character whitelist: in testing it lowered accuracy; idCandidates() cleans the text instead.
    ocrWorker().postMessage({ id, image: png, psm, vars });
  });
  /** Colour PNG of the crop scaled to ~160 px tall. Colour matters: Tesseract picks the colour channel that best
      separates paint from pole, which a plain grayscale image loses when sky is in the box. */
  async function prepForOcr(src) {
    const H = 160, sc = H / src.height, W = Math.min(1400, Math.max(40, Math.round(src.width * sc)));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, W, H);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  function lastIdForShape() {
    const pts = points.filter((p) => p.project === S.project && (!ed || !ed.acc || elemOf(p) === ed.element) && (!ed || p.id !== ed.id));
    if (!pts.length) return '';
    return pts.reduce((m, p) => (p.created > m.created ? p : m)).poleId || '';
  }
  /** Tall narrow PNG for an ID painted as a column of upright characters (one character per line). */
  async function prepStacked(src, W) {
    const sc = W / src.width, H = Math.min(2000, Math.max(40, Math.round(src.height * sc)));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, W, H);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  function rotated(src, deg) {
    const cv = document.createElement('canvas'); cv.width = src.height; cv.height = src.width;
    const g = cv.getContext('2d'); g.translate(cv.width / 2, cv.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(src, -src.width / 2, -src.height / 2);
    return cv;
  }
  async function readIdFrom(canvas) {
    const res = [];
    const run = async (png, psm, thr, extra) => {
      const r = await ocrRun(png, psm, { thresholding_method: thr });
      if (!r.ok) throw new Error(r.error);
      res.push({ ...r, ...(extra || {}) });
    };
    if (canvas._orient === 'v') {
      // vertical IDs: characters stacked upright (read top to bottom), or the whole ID turned sideways (either way)
      // (the adaptive threshold turns a column of characters into noise, so stacked IDs use two sizes instead)
      for (const w of [200, 140]) await run(await prepStacked(canvas, w), 6, 0, { stacked: true });
      for (const deg of [-90, 90]) await run(await prepForOcr(rotated(canvas, deg)), 6, 0);
    } else {
      // pass 1: Tesseract's global threshold; pass 2: adaptive (Sauvola) threshold for shadows on round poles
      const png = await prepForOcr(canvas);
      for (const thr of [0, 2]) await run(png, 6, thr);
    }
    return C.idCandidates(res, lastIdForShape());
  }
  function renderIdCands(state, list, note) {
    const box = $('idCands'); box.hidden = false; box.innerHTML = '';
    if (state === 'reading') { box.innerHTML = '<span class="spin" style="border-color:var(--line);border-top-color:var(--accent)"></span><span>Reading the ID…</span>'; return; }
    if (state === 'error') { box.textContent = note || 'Could not read the ID. Type it instead.'; return; }
    const lead = document.createElement('span'); lead.textContent = note || (list.length ? 'Possible IDs from the scan:' : 'No ID found in the box. Type it, or tap Scan ID and get closer.'); box.appendChild(lead);
    list.forEach((c) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small' + (c.fits ? ' fit' : '');
      b.textContent = c.id; b.title = `${c.conf}% sure${c.fits ? ', matches your numbering' : ''}`;
      b.addEventListener('click', () => { $('poleId').value = c.id; ed.idTouched = true; ed.idRead = { id: c.id, conf: c.conf }; syncFromId(); checkDup(); renderIdCands('done', list, `Using ${c.id} from the scan — check it.`); });
      box.appendChild(b);
    });
  }
  async function runOcrFor(canvas, explicit) {
    if (!ed || !canvas) return;
    const token = ed.ocrToken = uid(), before = $('poleId').value;
    renderIdCands('reading');
    try {
      const list = await readIdFrom(canvas);
      if (!ed || ed.ocrToken !== token) return;
      const best = list[0];
      // Fill the field when sure enough: a reading in a known format (CC-0001, FDU_100) or the project's own numbering needs 55%, anything else 80%.
      if (best && (explicit ? best.conf >= (best.fits ? 55 : 80) : (!ed.idTouched && best.conf >= 80))) {
        $('poleId').value = best.id; ed.idTouched = true; ed.idRead = { id: best.id, conf: best.conf }; syncFromId(); checkDup();
        // other readings worth a tap: leave out weak or garbled ones, and the same ID written differently
        const same = (c) => { const k = C.knownId(c.id); return c.id === best.id || (k && k.id === best.id); };
        const rest = list.slice(1).filter((c) => !same(c) && (best.fits && best.conf >= 80 ? c.fits : c.fits || c.conf >= 60));
        if (before && before !== best.id && !explicit) rest.push({ id: before, conf: 0, fits: false });
        renderIdCands('done', rest, `Filled ${best.id} from the scan (${best.conf}% sure) — check it.${rest.length ? ' Other readings:' : ''}`);
      } else renderIdCands('done', list);
    } catch (e) {
      if (ed && ed.ocrToken === token) renderIdCands('error', [], `Could not read the ID (${e.message}). Type it instead.`);
    }
  }
  function scanResult(crop) {
    if (!ed) return;
    if (!crop) { toast('Nothing to read — keep the ID inside the box and try again'); return; }
    runOcrFor(crop, true);
  }
  function showQualWarn(q) {
    const el = $('qualWarn');
    el.hidden = !(q && q.flags && q.flags.length);
    if (!el.hidden) el.textContent = `Photo kept with a warning in an older version: ${q.flags.join(', ')}. Retake it if the details matter.`;
  }

  /* ================= image processing ================= */
  const IMAGE_DECODE_MS = 8000, IMAGE_LOAD_MS = 10000, IMAGE_ENCODE_MS = 5000, PHOTO_PREP_MS = 30000;
  let preferImageDecoder = false, preferCanvasDataURL = false; // remember working fallbacks for this session
  /** Decode a smaller bitmap when a JPEG's dimensions are known. One resize axis preserves EXIF orientation
      and aspect ratio; the storage canvas applies the final longest-edge limit. */
  async function photoDecodeOptions(blob, maxPx) {
    const opts = { imageOrientation: 'from-image' };
    if (!maxPx || !window.PoleReports || !window.PoleReports.jpegInfo) return opts;
    try {
      const bytes = new Uint8Array(await withTimeout(blob.slice(0, 131072).arrayBuffer(), 2000, 'Photo header timed out'));
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return opts;
      const { w, h } = window.PoleReports.jpegInfo(bytes);
      // Phone photos have a modest aspect ratio. Leave unusual panoramas to the normal decode path,
      // where an EXIF rotation could otherwise enlarge the short side unnecessarily.
      if (Math.min(w, h) > maxPx && Math.max(w, h) / Math.min(w, h) <= 4) {
        opts.resizeWidth = maxPx; opts.resizeQuality = 'high';
      }
    } catch (e) { /* A non-JPEG or an unusual header still decodes through the browser. */ }
    return opts;
  }
  async function loadImage(blob, maxPx) {
    if (!(blob instanceof Blob) || !blob.size) throw new Error('The photo is empty. Take it again.');
    let bitmapTimedOut = false;
    if (!preferImageDecoder && typeof createImageBitmap === 'function') {
      const opts = await photoDecodeOptions(blob, maxPx);
      try {
        return await new Promise((res, rej) => {
          let done = false;
          const timer = setTimeout(() => { done = true; bitmapTimedOut = true; rej(new Error('Photo decoder timed out')); }, IMAGE_DECODE_MS);
          Promise.resolve().then(() => createImageBitmap(blob, opts)).then((im) => {
            if (done) { if (im && im.close) im.close(); return; }
            done = true; clearTimeout(timer);
            if (!im || !(im.width > 0) || !(im.height > 0)) { if (im && im.close) im.close(); rej(new Error('Could not read this image')); }
            else res(im);
          }, (err) => { if (!done) { done = true; clearTimeout(timer); rej(err); } });
        });
      } catch (e) { LOG.warn('image.decode.fallback', { kb: Math.round(blob.size / 1024), timedOut: bitmapTimedOut, ...errInfo(e) }); } // some phone WebViews stall in the bitmap decoder; use their image decoder
    }
    return new Promise((res, rej) => {
      const im = new Image(), u = URL.createObjectURL(blob);
      let done = false;
      const finish = (err) => {
        if (done) return; done = true; clearTimeout(timer);
        im.onload = im.onerror = null; URL.revokeObjectURL(u);
        if (err) { im.src = ''; rej(err); } else { if (bitmapTimedOut) preferImageDecoder = true; res(im); }
      };
      const timer = setTimeout(() => finish(new Error('The phone could not open the photo in time. Tap Save to try again.')), IMAGE_LOAD_MS);
      im.onload = () => finish(im.naturalWidth > 0 && im.naturalHeight > 0 ? null : new Error('Could not read this image'));
      im.onerror = () => finish(new Error('Could not read this image'));
      im.src = u;
    });
  }
  const dims = (im) => ({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height });
  /** A few Android WebViews never call toBlob's callback. Use the synchronous encoder after a short wait. */
  function toBlob(cv, q) {
    return new Promise((res, rej) => {
      if (!(cv.width > 0) || !(cv.height > 0)) { rej(new Error('The photo has no image pixels. Take it again.')); return; }
      let done = false, timer = 0;
      const finish = (blob, err) => {
        if (done) return; done = true; clearTimeout(timer);
        if (err) rej(err); else res(blob);
      };
      const fallback = () => {
        if (done) return;
        try {
          const url = cv.toDataURL('image/jpeg', q), comma = url.indexOf(',');
          if (!/^data:image\/jpeg;base64,/i.test(url) || comma < 0) throw new Error('Could not encode this photo');
          const raw = atob(url.slice(comma + 1));
          if (!raw.length) throw new Error('Could not encode this photo');
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          finish(new Blob([bytes], { type: 'image/jpeg' }));
        } catch (e) { finish(null, new Error('The phone could not prepare the photo. Tap Save to try again.')); }
      };
      if (preferCanvasDataURL) { fallback(); return; }
      timer = setTimeout(() => { preferCanvasDataURL = true; LOG.warn('image.encode.stalled', { w: cv.width, h: cv.height }); fallback(); }, IMAGE_ENCODE_MS);
      try { cv.toBlob((blob) => { if (blob instanceof Blob && blob.size) finish(blob); else { LOG.warn('image.encode.empty', { w: cv.width, h: cv.height }); fallback(); } }, 'image/jpeg', q); }
      catch (e) { LOG.warn('image.encode.throw', errInfo(e)); fallback(); }
    });
  }
  const prepCache = new WeakMap();
  /** Cache the bounded operation itself, so a stalled background preparation cannot poison every Save retry. */
  function prepImages(blob) {
    if (!(blob instanceof Blob) || !blob.size) {
      const rejected = Promise.reject(new Error('The photo is empty. Take it again.')); rejected.catch(() => {}); return rejected;
    }
    let p = prepCache.get(blob);
    if (!p) {
      const t0 = Date.now(); LOG.step('photo.prepare', { kb: Math.round(blob.size / 1024), mem: memMB() });
      p = withTimeout(makeStoredImages(blob), PHOTO_PREP_MS, 'The phone took too long to prepare the photo. Tap Save to try again.')
        .then((r) => { perf.prepare = Date.now() - t0; LOG.done('photo.prepare'); return r; });
      prepCache.set(blob, p);
      p.catch((e) => { LOG.done('photo.prepare'); LOG.error('photo.prepare.fail', { ms: Date.now() - t0, ...errInfo(e) }); if (prepCache.get(blob) === p) prepCache.delete(blob); }); // background calls also have a rejection handler
    }
    return p;
  }
  const storedImages = (blob) => prepImages(blob);
  const perf = {}; // timings of the last photo, shown under Settings → Storage
  function notePerf(save) {
    perf.save = save; S.perf = { at: new Date().toISOString(), ...perf }; persist();
  }
  async function makeStoredImages(blob) {
    let im = null, cv = null, tc = null;
    const t0 = Date.now(), lg = { kb: Math.round(blob.size / 1024), mem: memMB() };
    try {
      im = await loadImage(blob, STORE_MAX_PX);
      const { w, h } = dims(im); lg.decoded = `${w}×${h}`; lg.decode = Date.now() - t0;
      if (!(w > 0) || !(h > 0)) throw new Error('The photo has no image pixels. Take it again.');
      const sc = Math.min(1, STORE_MAX_PX / Math.max(w, h));
      cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(h * sc));
      const g = cv.getContext('2d');
      if (!g) throw new Error('The phone could not prepare the photo. Close other apps and tap Save again.');
      g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, cv.width, cv.height);
      const te = Date.now();
      let clean;
      try { clean = await toBlob(cv, 0.88); }
      catch (e) { // last resort: keep the camera's own JPEG, so the photo is never lost to a compression problem
        if (!/jpe?g/i.test(blob.type || '') || blob.size > 12 * 1048576) throw e;
        LOG.warn('image.keptOriginal', { kb: lg.kb, ...errInfo(e) }); clean = blob;
      }
      lg.encode = Date.now() - te;
      const T = 160, side = Math.min(w, h); tc = document.createElement('canvas');
      tc.width = tc.height = T;
      const tg = tc.getContext('2d');
      if (!tg) throw new Error('The phone could not prepare the thumbnail. Close other apps and tap Save again.');
      tg.imageSmoothingQuality = 'high';
      tg.drawImage(im, (w - side) / 2, (h - side) / 2, side, side, 0, 0, T, T);
      tg.strokeStyle = '#0f2547'; tg.lineWidth = 8; tg.strokeRect(4, 4, T - 8, T - 8);
      let thumb;
      try { thumb = await toBlob(tc, 0.8); } catch (e) { LOG.warn('image.thumb.fallback', errInfo(e)); thumb = clean; } // the list shows the photo scaled down instead
      LOG.info('image.prepared', { ...lg, cleanKB: Math.round(clean.size / 1024), thumbKB: Math.round(thumb.size / 1024), ms: Date.now() - t0, decoder: preferImageDecoder ? 'img' : 'bitmap', encoder: preferCanvasDataURL ? 'dataURL' : 'toBlob' });
      return { clean, thumb };
    } finally {
      if (im) { if (im.close) im.close(); else im.src = ''; }
      if (cv) cv.width = cv.height = 0;
      if (tc) tc.width = tc.height = 0;
    }
  }
  /** Export copy of a photo: optional burned-in stamp + EXIF GPS. Returns Uint8Array. */
  /** Export copy of a photo: resized to the export size, optional caption band (fields chosen in Export settings), EXIF GPS.
      opts: {maxPx, quality, stamp, fields:[...]} default from S.exp. Returns Uint8Array. */
  async function exportPhoto(p, cleanBlob, titleText, meta, opts) {
    const o = { maxPx: S.exp.maxPx, quality: S.exp.quality, stamp: S.exp.stamp, fields: S.exp.stampFields, ...(opts || {}) };
    const has = (f) => !o.fields || o.fields.includes(f);
    const title = titleText || `${p.poleId}  ·  ${p.poleType}`;
    const own = meta && meta.lat != null;
    const P = own ? { lat: meta.lat, lon: meta.lon, accuracy: meta.acc, adjusted: false, alt: null } : p;
    const when = (meta && meta.at) || p.takenAt;
    const im = await loadImage(cleanBlob), { w: w0, h: h0 } = dims(im);
    const sc = Math.min(1, (o.maxPx || 4096) / Math.max(w0, h0)), w = Math.round(w0 * sc), h = Math.round(h0 * sc);
    let bytes;
    if (o.stamp || sc < 1) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, w, h);
      if (o.stamp) {
        const u = C.utmForward(P.lat, P.lon, S.zone, P.lat < 0);
        const fs = Math.max(16, Math.round(w * 0.026)), lh = fs * 1.32, pad = fs * 0.7;
        const lines = [];
        if (has('id')) lines.push([title, `700 ${Math.round(fs * 1.25)}px sans-serif`]);
        if (has('coords')) lines.push([`${own ? 'Taken at ' : ''}${P.lat.toFixed(7)}, ${P.lon.toFixed(7)}${Number.isFinite(P.accuracy) ? `   ±${P.accuracy.toFixed(1)} m` : ''}${P.adjusted ? '  (pin adjusted)' : ''}`, `${fs}px monospace`]);
        if (has('utm')) lines.push([`UTM ${S.zone}N   E ${u.E.toFixed(2)}   N ${u.N.toFixed(2)}`, `${fs}px monospace`]);
        const who = (meta && meta.by) || p.by || '';
        const last = [has('time') ? fmtTime(when) : '', has('by') && who ? who : '', has('project') ? p.project : ''].filter(Boolean).join('   ·   ');
        if (last) lines.push([last, `${fs}px sans-serif`]);
        if (lines.length) {
          const bandH = pad * 2 + lh * lines.length + fs * 0.25;
          g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, h - bandH, w, bandH);
          g.fillStyle = '#4dabf7'; g.fillRect(0, h - bandH, Math.max(6, fs * 0.3), bandH);
          g.fillStyle = '#fff'; g.textBaseline = 'top';
          let y = h - bandH + pad;
          lines.forEach(([t, f], i) => { g.font = f; g.fillText(t, pad * 1.6, y, w - pad * 3); y += i === 0 && has('id') ? lh * 1.25 : lh; });
        }
      }
      bytes = new Uint8Array(await (await toBlob(cv, o.quality || 0.9)).arrayBuffer());
    } else bytes = new Uint8Array(await cleanBlob.arrayBuffer());
    if (im.close) im.close();
    return C.insertExif(bytes, { lat: P.lat, lon: P.lon, alt: P.alt, accuracy: P.accuracy,
      description: title.replace(/\s+·\s+/g, ' | '), title: p.poleId, date: new Date(when) });
  }
  /** File name for an exported photo per the naming setting. */
  function photoFileName(p, label) {
    const id = C.safeName(p.poleId), t = (p.takenAt || '').replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    const base = S.exp.naming === 'project_id' ? `${C.safeName(p.project)}_${id}` : S.exp.naming === 'id_time' ? `${id}_${t}` : id;
    return label ? `${base}_${C.safeName(label)}` : base;
  }

  /* ================= point editor ================= */
  let ed = null, pinMap = null, pinBase = null, pinGpsLayer = null, edPhotoUrl = null;
  function ensurePinMap() {
    if (pinMap) return;
    pinMap = L.map('pinMap', { zoomControl: false, attributionControl: false, maxZoom: 21 });
    pinBase = baseLayer(S.base).addTo(pinMap);
    $('pinLayerName').textContent = { street: 'Street', satellite: 'Satellite', offline: 'Offline map' }[S.base] || 'Street';
    pinGpsLayer = L.layerGroup().addTo(pinMap);
    pinMap.setView([12.3, 122.6], 6);
    pinMap.on('move', updateCoordBox);
    pinMap.on('moveend', clampPin);
    pinMap.on('dragstart zoomstart', () => { if (ed) ed.userMoved = true; });
    pinMap.on('dragstart', () => { if (ed) ed.dragged = true; $('edHint').classList.add('gone'); });
  }
  let hintTimer = 0;
  $('pinSizeBtn').addEventListener('click', () => {
    S.pinBig = !S.pinBig; persist();
    const w = $('pinMapWrap'), c = pinMap && pinMap.getCenter();
    w.classList.toggle('big', S.pinBig); $('pinSizeBtn').setAttribute('aria-pressed', String(S.pinBig));
    $('pinSizeBtn').setAttribute('aria-label', S.pinBig ? 'Smaller map' : 'Bigger map');
    setTimeout(() => { if (pinMap) { pinMap.invalidateSize({ animate: false }); if (c) pinMap.setView(c, pinMap.getZoom(), { animate: false }); } }, 230); // keep the pin on the same spot
  });
  function showEdPhoto(blob) {
    if (edPhotoUrl) URL.revokeObjectURL(edPhotoUrl);
    edPhotoUrl = blob ? URL.createObjectURL(blob) : '';
    $('edPhoto').src = edPhotoUrl;
  }
  const OTHER_PREFIX = '__other';
  /** Pole type dropdown: the built-in and admin types, this phone's own prefixes, then “+ Other prefix…”. */
  function renderTypeChips(sel) {
    const box = $('typeSel'); box.innerHTML = '';
    const names = typeNames(), types = names.includes(sel) || !sel ? names : names.concat(sel); // an older record keeps its type
    if (!sel) box.add(new Option('Choose the type…', '', true, true));
    for (const t of types) box.add(new Option(typePrefix(t) ? `${t} (${typePrefix(t)})` : t, t, false, t === sel));
    box.add(new Option('+ Other prefix…', OTHER_PREFIX));
  }
  $('typeSel').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === OTHER_PREFIX) { renderTypeChips(ed && ed.type); addMyType(); return; }
    if (v) setPoleType(v);
  });
  /** A pole owner prefix not on the list (e.g. PLDT-): kept on this phone; the admin can add it for everyone. */
  async function addMyType() {
    const v = await promptText('Other pole prefix', 'Type the letters painted before the number, then a name if you like. Examples: “PLDT”, “PLDT PLDT pole”, “CV Converge”.', 'PLDT');
    if (v == null) return;
    const m = /^\s*([A-Za-z]{2,6})(?![A-Za-z])[\s,:-]*(.*)$/.exec(v);
    if (!m) { toast('Use 2 to 6 letters for the prefix, e.g. PLDT'); return; }
    const p = m[1].toUpperCase(), n = (m[2] || '').trim().slice(0, 30) || p;
    if (p === 'FDU') { toast('FDU is used for ODFs'); return; }
    const have = poleTypes().find((t) => t.p === p);
    if (have) { setPoleType(have.n); toast(`${p} is already on the list (${have.n})`); return; }
    if (poleTypes().some((t) => t.n.toLowerCase() === n.toLowerCase())) { toast(`“${n}” is already a pole type: use another name`); return; }
    S.myTypes = (S.myTypes || []).concat({ n, p }); persist(); refreshTypes();
    setPoleType(n); toast(`${n} (${p}-) added on this phone`, 3000);
  }
  /** Choosing a pole type sets the ID prefix: a suggested ID is re-suggested, a typed/scanned one keeps its number. */
  function setPoleType(t) {
    if (!ed) return;
    ed.type = t; renderTypeChips(t);
    const id = $('poleId').value.trim().toUpperCase(), pre = typePrefix(t);
    if (!pre || (ed.acc && ed.element !== 'Pole')) { checkFormat(); return; }
    const m = polePartRe().exec(id);
    if (!id || !ed.idTouched || (m && !m[2])) $('poleId').value = suggestId('Pole', t);
    else if (m && m[1] !== pre) { const num = PAD4.includes(pre) ? padNum(pre, m[2], m[2].length) : m[2]; $('poleId').value = `${pre}-${num}`; toast(`ID changed to ${pre}-${num} for ${t}`, 2500); }
    checkDup(); checkFormat();
  }
  /** A Pole ID prefix picks the pole type; an FDU_ ID makes a new acceptance element an ODF. */
  function syncFromId() {
    if (!ed) return;
    const id = $('poleId').value.trim().toUpperCase();
    const m = new RegExp(`^(${prefixAlt()})-`).exec(id);
    if (ed.acc && ed.mode === 'new' && /^FDU_/.test(id) && ed.element !== 'ODF') { ed.element = 'ODF'; renderElemChips(); applyElement(); }
    else if (ed.acc && ed.mode === 'new' && m && ed.element !== 'Pole') { ed.element = 'Pole'; renderElemChips(); applyElement(); }
    if (m && prefixType(m[1]) !== ed.type && (!ed.acc || ed.element === 'Pole')) { ed.type = prefixType(m[1]); renderTypeChips(ed.type); }
    checkFormat();
  }
  function checkFormat() {
    const el = $('fmtWarn'); if (!ed) return;
    const id = $('poleId').value.trim().toUpperCase(), kind = ed.acc ? ed.element : 'Pole';
    let msg = '';
    if (id && kind === 'Pole' && !isNpt(id) && !poleIdRe().test(id)) { const pm = polePartRe().exec(id); msg = pm && !pm[2] ? `Add the pole number after the prefix, e.g. ${pm[1]}-${PAD4.includes(pm[1]) ? '0001' : '1234'}.` : `Pole IDs are a prefix, a dash and the number: ${poleTypes().map((t) => `${t.p}-`).join(', ')}. For another owner, tap “+ Other prefix”.`; }
    else if (id && kind === 'ODF' && !ODF_ID_RE.test(id)) msg = /^FDU_?$/.test(id) ? 'Add the ODF number after FDU_, e.g. FDU_100.' : 'ODF IDs are written FDU_ and a number, e.g. FDU_100.';
    el.hidden = !msg; el.textContent = msg;
  }
  function drawEdGps() {
    pinGpsLayer.clearLayers();
    if (!ed.gps) return;
    if (Number.isFinite(ed.gps.acc)) L.circle([ed.gps.lat, ed.gps.lon], { radius: ed.gps.acc, color: '#1c7ed6', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(pinGpsLayer);
    L.circleMarker([ed.gps.lat, ed.gps.lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#1c7ed6', fillOpacity: 1, interactive: false }).addTo(pinGpsLayer);
    L.circle([ed.gps.lat, ed.gps.lon], { radius: PIN_LIMIT_M, color: '#e8590c', weight: 2, dashArray: '8 6', fill: false, interactive: false }).addTo(pinGpsLayer);
  }
  /** Keep the pin within PIN_LIMIT_M of where the photo was taken. */
  function clampPin() {
    if (!ed || !ed.gps || !pinMap || !ed.dragged) return; // only user drags are limited; older records keep their saved pin
    const c = pinMap.getCenter(), d = haversine(ed.gps, { lat: c.lat, lon: c.lng });
    if (d <= PIN_LIMIT_M) return;
    const t = (PIN_LIMIT_M - 5) / d;
    pinMap.panTo([ed.gps.lat + (c.lat - ed.gps.lat) * t, ed.gps.lon + (c.lng - ed.gps.lon) * t]);
    toast(`The pin can move up to ${fmtDist(PIN_LIMIT_M)} from where the photo was taken`, 3000);
  }
  function editorGpsUpdate() {
    // A fresh photo taken before GPS locked: adopt the first fix (and keep improving it) until the user moves the pin.
    if (ed.mode !== 'new' || ed.source !== 'camera' || ed.userMoved) return;
    if (ed.gps && ed.gps.acc != null && ed.gps.acc <= fix.acc) return;
    ed.gps = { ...fix }; drawEdGps();
    pinMap.setView([fix.lat, fix.lon], Math.max(pinMap.getZoom(), 19), { animate: false });
    ed.userMoved = false;
    $('edAcc').textContent = `GPS ±${fix.acc.toFixed(1)} m`;
  }
  function updateCoordBox() {
    if (!ed || !pinMap) return;
    const c = pinMap.getCenter(), u = C.utmForward(c.lat, c.lng, S.zone, c.lat < 0);
    $('pinLL').textContent = `${c.lat.toFixed(7)}, ${c.lng.toFixed(7)}`;
    $('pinUTM').textContent = `E ${u.E.toFixed(1)}  N ${u.N.toFixed(1)}`;
    const d = ed.gps ? haversine(ed.gps, { lat: c.lat, lon: c.lng }) : 0;
    $('pinDelta').textContent = ed.gps ? `${d < 1000 ? d.toFixed(1) + ' m' : fmtDist(d)} from GPS${d > PIN_LIMIT_M ? ` — over ${fmtDist(PIN_LIMIT_M)} limit` : ''}`
      : (ed.acc ? 'Waiting for GPS…' : 'No GPS fix — place pin by hand');
    $('coordBox').classList.toggle('over', d > PIN_LIMIT_M);
  }
  function checkDup() {
    const id = $('poleId').value.trim().toUpperCase();
    const el = ed && ed.acc ? ed.element : null;
    const other = id && !isNpt(id) && points.find((p) => p.project === S.project && p.poleId === id && (!el || elemOf(p) === el) && (!ed || p.id !== ed.id));
    $('dupWarn').hidden = !other;
    if (other) $('dupWarn').textContent = `${id} is already used in this project.`;
  }
  $('poleId').addEventListener('input', () => { if (ed) ed.idTouched = true; checkDup(); syncFromId(); });
  /** No tag on the pole: the ID is NPT (several NPT poles may exist; exports keep their file names apart). */
  const NPT = 'NPT';
  const isNpt = (id) => String(id || '').trim().toUpperCase() === NPT;
  $('nptBtn').addEventListener('click', () => {
    if (!ed) return;
    $('poleId').value = NPT; ed.idTouched = true; ed.idRead = null; checkDup(); checkFormat();
    if (ed.acc && visitStage() !== 'FAT' && isInspector() && !ed.defs.some((d) => /no pole tag|pole id not visible/i.test(d.item))) {
      const item = (pol().defects.Pole || []).find((x) => /no pole tag|pole id not visible/i.test(x));
      if (item) { startDefDraft(false); defDraft.cat = 'Pole'; defDraft.items = new Set([item]); renderDefPanel(); toast('No pole tag: that defect is ticked below. Save adds it.', 4000); return; }
    }
    toast('Saved as NPT (no pole tag)', 2000);
  });

  async function openEditor(o) {
    ensurePinMap();
    const acc = isAcc();
    if (o.blob) setTimeout(() => prepImages(o.blob), 400); // made while the ID is checked; the camera is closed by now
    ed = { mode: o.mode, id: o.id || uid(), source: o.source, gps: o.gps || null, newBlob: o.blob || null,
      takenAt: o.takenAt, type: o.type || S.lastType, userMoved: false, acc };
    if (acc) {
      Object.assign(ed, { element: o.element || 'Pole', photos: (o.photos || []).map((p) => ({ ...p })), pending: {}, removed: [],
        defs: JSON.parse(JSON.stringify(o.defs || [])), mloop: !!o.mloop, nap: !!o.nap, closure: !!o.closure, odf: o.odf || 'New', newBlob: null });
      if (o.blob) { const pid = uid(); ed.photos.unshift({ pid, label: 'Overview', ...photoMeta(o.gps, o.takenAt), q: o.q || null }); ed.pending[pid] = o.blob; }
      $('napId').value = o.napId || ''; $('closureId').value = o.closureId || '';
    }
    $('editorTitle').textContent = acc ? (o.mode === 'edit' ? 'Edit element' : 'New element') : (o.mode === 'edit' ? 'Edit pole' : 'New pole');
    $('edHint').textContent = `Drag the map to place the pin on the ${acc ? 'element' : 'pole'}`;
    $('edHint').classList.remove('gone'); clearTimeout(hintTimer); hintTimer = setTimeout(() => $('edHint').classList.add('gone'), 7000);
    $('pinMapWrap').classList.toggle('big', !!S.pinBig); $('pinSizeBtn').setAttribute('aria-pressed', String(!!S.pinBig));
    ['accPhotos', 'accElementBox', 'defBox'].forEach((x) => { $(x).hidden = !acc; });
    $('surveyTypeBox').hidden = acc && ed.element !== 'Pole'; $('edPhoto').hidden = acc; $('nptBtn').hidden = acc && ed.element !== 'Pole';
    if (!acc) { $('poleAttach').hidden = true; $('odfBox').hidden = true; }
    $('defPanel').hidden = true; $('addDefBtn').hidden = false;
    $('queueNote').textContent = '';
    $('saveIssue').hidden = true;
    $('edDelete').hidden = o.mode !== 'edit'; $('delConfirm').hidden = true;
    $('edSkip').hidden = true; $('edRetake').hidden = acc;
    $('edRetake').textContent = o.mode === 'edit' ? 'New photo' : 'Retake';
    $('edSave').textContent = 'Save';
    $('poleId').value = o.poleId != null ? o.poleId : suggestId(acc ? ed.element : 'Pole', ed.type);
    ed.idTouched = o.poleId != null;
    ed.q = o.q || null; showQualWarn(ed.q); $('idCands').hidden = true;
    renderTypeChips(ed.type);
    if (acc) { renderElemChips(); applyElement(); renderAccPhotos(); renderDefs(); }
    if (acc && o.mode === 'new' && visitStage() === 'PAT' && isInspector()) startDefDraft(false); // a PAT records defects: the defect form is ready
    $('edTime').textContent = fmtTime(o.takenAt);
    $('edAcc').textContent = ed.gps && Number.isFinite(ed.gps.acc) ? `GPS ±${ed.gps.acc.toFixed(1)} m` : (ed.gps ? 'Location from photo' : 'No location yet');
    $('edSrc').textContent = o.note || '';
    showEdPhoto(o.blob || o.storedBlob || null);
    openSheet('editor');
    checkDup();
    const start = o.lat != null ? { lat: o.lat, lon: o.lon } : ed.gps || (fix ? { lat: fix.lat, lon: fix.lon } : null);
    requestAnimationFrame(() => {
      pinMap.invalidateSize();
      if (start) pinMap.setView([start.lat, start.lon], 19, { animate: false });
      else { const c = map.getCenter(); pinMap.setView(c, Math.max(map.getZoom(), 16), { animate: false }); }
      ed.userMoved = false; drawEdGps(); updateCoordBox(); drawPinRef();
    });
    checkFormat();
    if (o.crop) runOcrFor(o.crop, true);
    else if (o.mode === 'new' && !o.poleId) setTimeout(() => { const f = $('poleId'); f.focus(); const n = f.value.length; if (/[-_]$/.test(f.value)) f.setSelectionRange(n, n); else f.select(); }, 250);
  }
  async function openEditorFor(id) {
    const p = points.find((x) => x.id === id); if (!p) return;
    if (p.kind === 'acceptance' || isAcc(p.project)) {
      openEditor({ mode: 'edit', id, poleId: p.poleId, type: p.poleType || undefined, lat: p.lat, lon: p.lon, takenAt: p.takenAt, source: p.source,
        gps: p.gpsLat != null ? { lat: p.gpsLat, lon: p.gpsLon, acc: p.accuracy } : { lat: p.lat, lon: p.lon, acc: p.accuracy }, // records from before v1.3 keep no raw fix: the pin stands in
        element: elemOf(p), photos: p.photos || [], defs: p.defs || [], mloop: p.mloop, nap: p.nap, napId: p.napId, closure: p.closure, closureId: p.closureId, odf: p.odf });
      return;
    }
    const ph = await dbGet('photos', id).catch(() => null);
    openEditor({ mode: 'edit', id, poleId: p.poleId, type: p.poleType, lat: p.lat, lon: p.lon, takenAt: p.takenAt,
      gps: p.gpsLat != null ? { lat: p.gpsLat, lon: p.gpsLon, acc: p.accuracy } : null, storedBlob: ph ? (ph.clean || ph.thumb) : null, source: p.source });
  }
  function cleanupEditor() {
    ed = null; showEdPhoto(null); revokeEdUrls(); defDraft = null;
  }

  /* ---------- acceptance form ---------- */
  let edUrls = [], defDraft = null;
  function revokeEdUrls() { edUrls.forEach((u) => URL.revokeObjectURL(u)); edUrls = []; }
  async function thumbUrl(pid) {
    let b = ed && ed.pending[pid];
    if (!b) { const ph = await dbGet('photos', pid).catch(() => null); b = ph && (ph.thumb || ph.clean); }
    if (!b) return '';
    const u = URL.createObjectURL(b); edUrls.push(u); return u;
  }
  function renderElemChips() {
    const box = $('elemSel'); box.innerHTML = '';
    for (const el of ELEMENTS) box.add(new Option(el, el, false, el === ed.element));
  }
  $('elemSel').addEventListener('change', (e) => {
    if (!ed) return;
    const el = e.target.value; ed.element = el;
    if (!ed.idTouched && ed.mode === 'new') $('poleId').value = suggestId(el, ed.type);
    applyElement(); checkDup(); checkFormat();
  });
  function applyElement() {
    const el = ed.element;
    $('idLabel').textContent = `${el.toUpperCase()} ID`;
    $('poleId').placeholder = el === 'Pole' ? 'e.g. CC-0001' : el === 'ODF' ? 'e.g. FDU_100' : `e.g. ${el}-01`;
    $('surveyTypeBox').hidden = el !== 'Pole'; $('nptBtn').hidden = el !== 'Pole';
    $('poleAttach').hidden = el !== 'Pole'; $('odfBox').hidden = el !== 'ODF';
    $('atMloop').checked = ed.mloop; $('atNap').checked = ed.nap; $('atClosure').checked = ed.closure; markToggles();
    $('napId').hidden = !ed.nap; $('closureId').hidden = !ed.closure;
    $('odfSel').value = ed.odf || 'New';
    const cats = CATS_FOR[el] || ['Other']; // an open defect form follows the element
    if (defDraft && !$('defPanel').hidden && !cats.includes(defDraft.cat)) { defDraft.cat = cats[0]; defDraft.items = new Set(); renderDefPanel(); }
  }
  function markToggles() { ['atMloop', 'atNap', 'atClosure'].forEach((id) => $(id).closest('.tchip').classList.toggle('on', $(id).checked)); }
  $('atMloop').addEventListener('change', (e) => { ed.mloop = e.target.checked; markToggles(); });
  $('atNap').addEventListener('change', (e) => { ed.nap = e.target.checked; markToggles(); $('napId').hidden = !ed.nap; if (ed.nap) $('napId').focus(); });
  $('atClosure').addEventListener('change', (e) => { ed.closure = e.target.checked; markToggles(); $('closureId').hidden = !ed.closure; if (ed.closure) $('closureId').focus(); });
  $('odfSel').addEventListener('change', (e) => { ed.odf = e.target.value; applyElement(); });

  function nextPhotoLabel() {
    if (!ed.photos.length) return 'Overview';
    const used = new Set(ed.photos.map((p) => p.label));
    const cands = ed.element === 'Pole' ? ['Pole tag', ed.mloop && 'MLoop', ed.nap && 'NAP', ed.closure && 'Closure'] : [ed.element];
    for (const c of cands) if (c && !used.has(c)) return c;
    return 'Detail';
  }
  async function renderAccPhotos() {
    const box = $('accPhotos'); box.innerHTML = '';
    ed.photos.forEach((p, i) => {
      const cell = document.createElement('div'); cell.className = 'ph';
      const img = document.createElement('img'); img.alt = p.label;
      thumbUrl(p.pid).then((u) => { img.src = u; });
      const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Photo label');
      const labels = PHOTO_LABELS.includes(p.label) ? PHOTO_LABELS : PHOTO_LABELS.concat(p.label);
      sel.innerHTML = labels.map((l) => `<option${l === p.label ? ' selected' : ''}>${C.xmlEsc(l)}</option>`).join('');
      sel.addEventListener('change', () => { p.label = sel.value; });
      const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove photo');
      x.addEventListener('click', () => {
        ed.photos.splice(i, 1);
        if (ed.pending[p.pid]) delete ed.pending[p.pid]; else ed.removed.push(p.pid);
        renderAccPhotos();
      });
      cell.append(img, x, sel); box.appendChild(cell);
    });
    const add = document.createElement('button'); add.type = 'button'; add.className = 'ph add'; add.textContent = '+ Add photo';
    add.addEventListener('click', () => openCamera('add'));
    box.appendChild(add);
  }
  function addEdPhoto(blob, meta) {
    const pid = uid(); ed.photos.push({ pid, label: nextPhotoLabel(), ...meta }); ed.pending[pid] = blob; prepImages(blob);
    renderAccPhotos(); toast('Photo added — set its label under the picture');
  }

  /* Deficiency workflow: FOUND at PAT (inspector) → RECTIFIED by the contractor (after photo or Mark rectified)
     → VERIFIED or REJECTED by the inspecting company at FAT. Notes (N) are informational and need no rectification. */
  function renderDefs() {
    const list = $('defList'); list.innerHTML = '';
    const open = openCount({ defs: ed.defs }), total = counting({ defs: ed.defs }).length, ver = counting({ defs: ed.defs }).filter((d) => d.status === 'Verified').length;
    const st = $('defStatus');
    st.textContent = !total ? (ed.defs.length ? 'Notes only' : 'No deficiency') : open ? `${open} open` : ver === total ? 'All verified' : 'All rectified';
    st.className = 'pill ' + (!total ? 'ok' : open ? 'bad' : ver === total ? 'ver' : 'rect');
    const stage = pmeta().stage || 'PAT', insp = isInspector();
    $('addDefBtn').hidden = !insp || !$('defPanel').hidden;
    $('defRoleHint').hidden = insp;
    $('defRoleHint').textContent = `Deficiencies are added and verified by ${pol().owner || 'the admin company'}. You can add after photos and mark items rectified.`;
    ed.defs.forEach((d, i) => {
      const stt = defStatusOf(d);
      const card = document.createElement('div'); card.className = 'defcard' + (stt === 'Rectified' ? ' rect' : stt === 'Verified' ? ' ver' : stt === 'Note' ? ' note' : '');
      const t = document.createElement('span'); t.className = 't'; t.textContent = `${SEV_CODE[sevOf(d)]} · ${d.cat}: ${d.item}`;
      const s = document.createElement('span'); s.className = 's';
      const bits = [`Found ${d.stage || 'PAT'} ${fmtTime(d.foundAt)}${d.foundBy ? ' by ' + d.foundBy : ''}`];
      if (defDone(d)) bits.push(`Rectified ${d.fixedAt ? fmtTime(d.fixedAt) : ''}${d.fixedBy ? ' by ' + d.fixedBy : ''}${d.afterPid ? '' : ' · no after photo'}`);
      if (d.status === 'Verified') bits.push(`Verified ${d.verifiedAt ? fmtTime(d.verifiedAt) : ''}${d.verifiedBy ? ' by ' + d.verifiedBy : ''}`);
      if (d.reopened && d.reopened.length) { const r = d.reopened[d.reopened.length - 1]; bits.push(`Rejected ${fmtTime(r.at)}${r.by ? ' by ' + r.by : ''}${r.reason ? ': ' + r.reason : ''}`); }
      if (d.notes) bits.push(d.notes);
      s.textContent = bits.join(' · ');
      const tl = document.createElement('div'); tl.className = 'timeline';
      if (stt === 'Note') tl.innerHTML = '<span class="on">NOTE · no rectification needed</span>';
      else tl.innerHTML = `<span class="bad">1 FOUND</span><span class="${defDone(d) ? 'rect' : ''}">2 RECTIFIED</span><span class="${d.status === 'Verified' ? 'ver' : ''}">3 VERIFIED</span>`;
      card.append(t, s, tl);
      const th = document.createElement('div'); th.className = 'thumbs';
      [[d.pid, 'As found'], ...(d.reopened || []).filter((q) => q.pid).map((q) => [q.pid, 'Rejected']), [d.afterPid, 'Rectified'], [d.verifyPid, 'Verified']].forEach(([pid, label]) => {
        if (!pid) return;
        const f = document.createElement('figure'); const im = document.createElement('img'); im.alt = label; thumbUrl(pid).then((u) => { im.src = u; });
        const c = document.createElement('figcaption'); c.textContent = label; f.append(im, c); th.appendChild(f);
      });
      if (th.childElementCount) card.appendChild(th);
      const rm = document.createElement('input'); rm.type = 'text'; rm.placeholder = 'Remarks (optional)'; rm.value = d.remarks || '';
      rm.setAttribute('aria-label', 'Remarks'); rm.addEventListener('input', () => { d.remarks = rm.value; });
      card.appendChild(rm);
      const acts = document.createElement('div'); acts.className = 'acts';
      const mk = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); acts.appendChild(b); };
      if (stt === 'Open') {
        mk('After photo', () => { ed.afterFor = d.id; openCamera('after'); }, 'primary');
        mk('Mark rectified', () => { d.status = 'Rectified'; d.fixedAt = new Date().toISOString(); d.fixedStage = stage; d.fixedBy = byLine(); renderDefs(); });
      } else if (stt === 'Rectified') {
        mk('Retake after photo', () => { ed.afterFor = d.id; openCamera('after'); });
        if (insp) {
          mk('Verify', () => { d.status = 'Verified'; d.verifiedAt = new Date().toISOString(); d.verifiedBy = byLine(); d.verifyStage = stage; renderDefs(); }, 'primary');
          mk('Verify with photo', () => { ed.verifyFor = d.id; openCamera('verify'); });
          mk('Reject', async () => {
            const reason = await promptText('Reject this rectification', `${d.cat}: ${d.item}. The item goes back to Open; say what is still wrong.`, 'e.g. cover still loose');
            if (reason == null) return;
            reopenDef(d, reason, stage); renderDefs();
          }, 'danger');
        } else if (d.fixedBy === byLine() || !d.afterPid) mk('Reopen', () => { reopenDef(d, 'Reopened by the contractor', stage); renderDefs(); });
      } else if (stt === 'Verified' && insp) {
        mk('Undo verification', () => { d.status = 'Rectified'; d.verifiedAt = null; d.verifiedBy = ''; renderDefs(); });
      }
      if (insp && (d.stage || 'PAT') === stage) mk('Remove', () => {
        ed.defs.splice(i, 1);
        [d.pid, d.afterPid, d.verifyPid, ...(d.reopened || []).map((q) => q.pid)].filter(Boolean).forEach((pid) => {
          if (ed.defs.some((o) => o.pid === pid || o.afterPid === pid || o.verifyPid === pid || (o.reopened || []).some((q) => q.pid === pid))) return;
          if (ed.pending[pid]) delete ed.pending[pid]; else ed.removed.push(pid);
        });
        renderDefs();
      }, 'danger');
      card.appendChild(acts);
      list.appendChild(card);
    });
  }
  /** Back to Open: the rectified photo and dates move into the log, so the item shows no rectification until a new one is made. */
  function reopenDef(d, reason, stage) {
    (d.reopened = d.reopened || []).push({ at: new Date().toISOString(), by: byLine(), reason, stage, pid: d.afterPid || null, meta: d.afterMeta || null, fixedAt: d.fixedAt || null, fixedBy: d.fixedBy || '' });
    d.status = 'Open'; d.fixedAt = null; d.fixedStage = null; d.fixedBy = ''; d.afterPid = null; d.afterMeta = null;
  }
  function setAfterPhoto(blob, meta) {
    const d = ed.defs.find((x) => x.id === ed.afterFor); if (!d) return;
    if (d.afterPid) { if (ed.pending[d.afterPid]) delete ed.pending[d.afterPid]; else ed.removed.push(d.afterPid); }
    const pid = uid(); ed.pending[pid] = blob; prepImages(blob); d.afterPid = pid; d.afterMeta = meta;
    // The after photo is the evidence, so its capture time is the rectification time.
    if (d.status !== 'Verified') { d.status = 'Rectified'; d.fixedAt = meta.at; d.fixedStage = pmeta().stage || 'PAT'; d.fixedBy = meta.by || byLine(); }
    renderDefs(); toast('After photo added — item marked rectified');
  }
  function setVerifyPhoto(blob, meta) {
    const d = ed.defs.find((x) => x.id === ed.verifyFor); if (!d) return;
    if (d.verifyPid) { if (ed.pending[d.verifyPid]) delete ed.pending[d.verifyPid]; else ed.removed.push(d.verifyPid); }
    const pid = uid(); ed.pending[pid] = blob; prepImages(blob); d.verifyPid = pid; d.verifyMeta = meta;
    d.status = 'Verified'; d.verifiedAt = meta.at; d.verifiedBy = meta.by || byLine(); d.verifyStage = pmeta().stage || 'PAT';
    renderDefs(); toast('Verification photo added — item verified');
  }
  /** Small text prompt (reject reason etc.). Resolves to the text, or null on Cancel. */
  function promptText(title, text, placeholder, initial) {
    $('promptTitle').textContent = title; $('promptText').textContent = text || '';
    const inp = $('promptInput'); inp.value = initial || ''; inp.placeholder = placeholder || '';
    return new Promise((res) => {
      const done = (v) => { $('promptBox').hidden = true; yes.onclick = no.onclick = null; res(v); };
      const yes = $('promptYes'), no = $('promptNo');
      yes.onclick = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } done(v); };
      no.onclick = () => done(null);
      $('promptBox').hidden = false; setTimeout(() => inp.focus(), 50);
    });
  }

  /* ================= pin visits: defect cleanup and FAT ================= */
  /* In a defect cleanup or a FAT the work is a walk from pin to pin. Tapping a pin opens a card with each punchlist item,
     its photos and one-tap actions (photo of the fix, comment, accept / reject). Every action is saved at once. */
  const visitStage = () => (isAcc() ? pmeta().stage || 'PAT' : null);
  const visitMode = () => ['Cleanup', 'FAT'].includes(visitStage());
  let visitId = null, visitUrls = [], visitCam = null;
  /** Does this pin still need the person holding this phone? */
  function needsVisit(r) {
    const items = counting(r);
    if (visitStage() === 'FAT' && isInspector()) return items.some((d) => defStatusOf(d) !== 'Verified');
    return items.some((d) => defStatusOf(d) === 'Open');
  }
  function compass(a, b) {
    const k = Math.PI / 180, dl = (b.lon - a.lon) * k;
    const y = Math.sin(dl) * Math.cos(b.lat * k), x = Math.cos(a.lat * k) * Math.sin(b.lat * k) - Math.sin(a.lat * k) * Math.cos(b.lat * k) * Math.cos(dl);
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(y, x) / k + 360) % 360) / 45) % 8];
  }
  const herePos = () => (fix ? { lat: fix.lat, lon: fix.lon } : (() => { const c = map.getCenter(); return { lat: c.lat, lon: c.lng }; })());
  /** The nearest pin that still needs this user (skipping one, for “Next pin”). */
  function nextTarget(skipId) {
    const here = herePos(); let best = null;
    for (const r of projPoints()) { if (r.id === skipId || !needsVisit(r)) continue; const d = haversine(here, r); if (!best || d < best.d) best = { r, d }; }
    return best && { ...best, dir: compass(here, best.r), you: !!fix };
  }
  function openVisit(id, pan) {
    const r = points.find((x) => x.id === id); if (!r) return;
    visitId = id; document.body.classList.add('visiting');
    if (pan) map.setView([r.lat, r.lon], Math.max(map.getZoom(), 18));
    renderVisit();
    if (!stack.includes('visitCard')) openSheet('visitCard');
  }
  function revokeVisitUrls() { visitUrls.forEach((u) => URL.revokeObjectURL(u)); visitUrls = []; }
  async function photoThumb(img, pid) {
    const ph = await dbGet('photos', pid).catch(() => null), b = ph && (ph.thumb || ph.clean);
    if (!b) return; const u = URL.createObjectURL(b); visitUrls.push(u); img.src = u;
  }
  async function showPhoto(pid, caption) {
    const ph = await dbGet('photos', pid).catch(() => null), b = ph && (ph.clean || ph.thumb);
    if (!b) { toast('Photo not found on this phone'); return; }
    const u = URL.createObjectURL(b); visitUrls.push(u);
    $('pvImg').src = u; $('pvCap').textContent = caption || ''; $('photoView').hidden = false;
  }
  $('photoView').addEventListener('click', () => { $('photoView').hidden = true; $('pvImg').src = ''; });
  function figure(pid, label, caption) {
    const f = document.createElement('figure'), im = document.createElement('img'), c = document.createElement('figcaption');
    im.alt = label; photoThumb(im, pid); c.textContent = label; f.append(im, c);
    f.addEventListener('click', () => showPhoto(pid, caption || label)); return f;
  }
  function visitSub(r) {
    const open = openCount(r), toCheck = counting(r).filter((d) => defStatusOf(d) === 'Rectified').length;
    const far = fix ? haversine(fix, r) : null, dist = far == null ? 'Waiting for GPS' : far < 8 ? 'You are at this pin' : `${fmtDist(far)} ${compass(fix, r)} of you`;
    return [dist, open ? `${open} open` : '', toCheck ? `${toCheck} to check` : '', !open && !toCheck && counting(r).length ? 'all done' : ''].filter(Boolean).join(' · ');
  }
  function renderVisit() {
    const r = points.find((x) => x.id === visitId); if (!r) { closeVisitCard(); return; }
    revokeVisitUrls();
    const stage = visitStage(), insp = isInspector(), items = (r.defs || []).map((d, i) => ({ d, i }));
    $('vcTitle').textContent = `${r.poleId || '(no ID)'} · ${elemOf(r)}`;
    $('vcSub').textContent = visitSub(r);
    const el = $('vcElem'); el.innerHTML = '';
    photosOf(r).slice(0, 4).forEach((p) => el.appendChild(figure(p.pid, p.label || 'Photo', `${r.poleId} · ${p.label || ''}`)));
    const box = $('vcItems'); box.innerHTML = '';
    if (!items.length) box.innerHTML = '<p class="hint" style="margin:0">No punchlist items on this pin.</p>';
    items.forEach(({ d, i }) => {
      const key = d.id || i; // records from old versions may have items without an id
      const st = defStatusOf(d), card = document.createElement('div');
      card.className = 'vci' + (st === 'Rectified' ? ' rect' : st === 'Verified' ? ' ver' : st === 'Note' ? ' note' : '');
      const t = document.createElement('span'); t.className = 't'; t.textContent = `${SEV_CODE[sevOf(d)]} · ${d.cat}: ${d.item}`;
      const pill = document.createElement('span'); pill.className = 'pill st ' + (st === 'Open' ? 'bad' : st === 'Rectified' ? 'rect' : st === 'Verified' ? 'ver' : 'note');
      pill.textContent = st === 'Open' ? ((d.reopened || []).length ? 'Open · rejected' : 'Open · to fix') : st === 'Rectified' ? 'Fixed · to check' : st === 'Verified' ? 'Accepted' : 'Note';
      const lines = [];
      if (d.notes) lines.push(d.notes);
      if (defDone(d) && d.fixedAt) lines.push(`Fixed ${fmtTime(d.fixedAt)}${d.fixedBy ? ' by ' + d.fixedBy : ''}${d.afterPid ? '' : ' · no photo'}`);
      if (st === 'Verified' && d.verifiedAt) lines.push(`Accepted ${fmtTime(d.verifiedAt)}${d.verifiedBy ? ' by ' + d.verifiedBy : ''}`);
      if (st === 'Open' && (d.reopened || []).length) { const q = d.reopened[d.reopened.length - 1]; lines.push(`Rejected ${fmtTime(q.at)}${q.reason ? ': ' + q.reason : ''}`); }
      if (d.remarks) lines.push(`Comment: ${d.remarks}`);
      const sub = document.createElement('span'); sub.className = 's'; sub.textContent = lines.join(' · ');
      card.append(t, pill); if (lines.length) card.appendChild(sub);
      const ph = document.createElement('div'); ph.className = 'vph';
      if (d.pid) ph.appendChild(figure(d.pid, 'As found', `${r.poleId} · ${d.item} · as found`));
      if (d.afterPid) ph.appendChild(figure(d.afterPid, 'Fixed', `${r.poleId} · ${d.item} · fixed`));
      if (d.verifyPid) ph.appendChild(figure(d.verifyPid, 'Checked', `${r.poleId} · ${d.item} · checked at ${d.verifyStage || 'FAT'}`));
      card.appendChild(ph);
      const acts = document.createElement('div'); acts.className = 'acts';
      const mk = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); acts.appendChild(b); };
      const cam = (kind) => () => { visitCam = { rid: r.id, did: key, kind }; openCamera(kind === 'verify' ? 'vverify' : 'vfix'); };
      if (st !== 'Note') {
        const fatInsp = stage === 'FAT' && insp;
        if (st === 'Open') {
          if (fatInsp) mk('📷 Fixed now: photo + accept', cam('verify'), 'primary');
          else {
            mk('📷 Photo of the fix', cam('fix'), 'primary');
            mk('Fixed, no photo', () => visitChange(r.id, key, (x) => { x.status = 'Rectified'; x.fixedAt = new Date().toISOString(); x.fixedStage = stage; x.fixedBy = byLine(); }, 'Marked fixed (no photo)'));
          }
        } else if (st === 'Rectified') {
          if (fatInsp) {
            mk('✓ Accept', () => visitChange(r.id, key, (x) => { x.status = 'Verified'; x.verifiedAt = new Date().toISOString(); x.verifiedBy = byLine(); x.verifyStage = stage; }, 'Accepted'), 'primary');
            mk('📷 Accept with photo', cam('verify'));
            mk('✗ Reject', async () => {
              const reason = await promptText('Reject this fix', `${d.cat}: ${d.item}. It goes back to Open; say what is still wrong.`, 'e.g. cover still loose');
              if (reason != null) visitChange(r.id, key, (x) => reopenDef(x, reason, stage), 'Rejected: back to open');
            }, 'danger');
          } else {
            mk('📷 Retake the fix photo', cam('fix'));
            if (d.fixedBy === byLine() || !d.afterPid) mk('Undo fixed', () => visitChange(r.id, key, (x) => reopenDef(x, 'Undone by the contractor', stage), 'Back to open'));
          }
        } else if (st === 'Verified' && fatInsp) mk('Undo acceptance', () => visitChange(r.id, key, (x) => { x.status = 'Rectified'; x.verifiedAt = null; x.verifiedBy = ''; }, 'Acceptance undone'));
      }
      mk(d.remarks ? '💬 Edit comment' : '💬 Comment', async () => {
        const v = await promptText('Comment', `${d.cat}: ${d.item}`, 'e.g. replaced the NAP cover', d.remarks || '');
        if (v != null) visitChange(r.id, key, (x) => { x.remarks = v.slice(0, 300); }, 'Comment saved');
      });
      card.appendChild(acts); box.appendChild(card);
    });
    $('vcNext').hidden = !nextTarget(r.id);
  }
  /** Applies one change to one item and saves the record at once (with a new photo when given). */
  async function visitChange(rid, did, change, done, blob, meta) {
    const cur = points.find((x) => x.id === rid); if (!cur) return false;
    const rec = JSON.parse(JSON.stringify(cur)), d = typeof did === 'number' ? (rec.defs || [])[did] : (rec.defs || []).find((x) => x.id === did); if (!d) return false;
    const before = new Set(allPids(cur)), photos = [], t0 = Date.now();
    LOG.step('save.visit', { stage: visitStage(), photo: !!blob, mem: memMB() });
    try {
      if (blob) { busy('Preparing photo…'); const pid = uid(); photos.push({ id: pid, ...await storedImages(blob) }); change(d, pid, meta); }
      else change(d);
      rec.updated = new Date().toISOString(); rec.updatedBy = byLine();
      busy('Writing to phone storage…');
      await saveRecord(rec, photos);
      points[points.indexOf(cur)] = rec;
      persist(); notePerson();
      LOG.info('save.done', { ms: Date.now() - t0, visit: done }); LOG.done('save.visit');
    } catch (e) {
      LOG.error('save.fail', { ms: Date.now() - t0, visit: done, ...errInfo(e) }); LOG.done('save.visit'); busy(false);
      toast(blob ? saveError(e).replace('Your photo is kept on this screen; do not close or reload it.', 'Take the photo again.') : saveError(e).replace(' Your photo is kept on this screen; do not close or reload it.', ''), 8000);
      return false;
    }
    busy(false);
    const gone = [...before].filter((p) => !allPids(rec).includes(p));
    if (gone.length) deletePhotosIfUnused(gone, new Set()).catch(() => {}); // a retaken photo replaces the old one
    renderPoles(); renderVisit(); toast(`${rec.poleId}: ${done}`, 2500);
    return true;
  }
  /** A photo taken from the card: the fix (contractor) or the check (inspector), within reach of the pin. */
  function visitPhoto(blob, gps) {
    const v = visitCam; visitCam = null; if (!v) return;
    const r = points.find((x) => x.id === v.rid); if (!r) return;
    if (!gps) { toast('No GPS fix: photo not used. Wait for GPS, then take it again.', 4500); return; }
    const far = haversine(gps, r);
    if (far > PIN_LIMIT_M) { toast(`Photo not used: you are ${fmtDist(far)} from ${r.poleId}. Take it within ${fmtDist(PIN_LIMIT_M)} of the pin.`, 6000); return; }
    prepImages(blob);
    const meta = photoMeta(gps), stage = visitStage();
    if (v.kind === 'verify') visitChange(v.rid, v.did, (d, pid, m) => { d.verifyPid = pid; d.verifyMeta = m; d.status = 'Verified'; d.verifiedAt = m.at; d.verifiedBy = m.by || byLine(); d.verifyStage = stage; }, 'Accepted with photo', blob, meta);
    else visitChange(v.rid, v.did, (d, pid, m) => {
      d.afterPid = pid; d.afterMeta = m;
      if (d.status !== 'Verified') { d.status = 'Rectified'; d.fixedAt = m.at; d.fixedStage = stage; d.fixedBy = m.by || byLine(); } // the photo is the evidence, so its time is the fix time
    }, 'Fix photo saved', blob, meta);
  }
  function closeVisitCard() { if (stack[stack.length - 1] === 'visitCard') closeSheet(); }
  $('vcClose').addEventListener('click', closeVisitCard);
  $('vcOpen').addEventListener('click', async () => { const id = visitId; await closeSheet(); openEditorFor(id); });
  $('vcNext').addEventListener('click', () => { const t = nextTarget(visitId); if (t) openVisit(t.r.id, true); });
  /** The strip above the bottom bar points to the nearest pin still to visit. */
  function renderVisitStrip() {
    const t = nextTarget(), ms = $('mapSummary');
    ms.classList.toggle('go', !!t);
    if (!t) return false;
    $('sumTitle').textContent = `Next: ${t.r.poleId || '(no ID)'} · ${elemOf(t.r)}`;
    $('sumSub').textContent = t.you ? `${t.d < 8 ? 'You are at this pin' : `${fmtDist(t.d)} ${t.dir} of you`} · tap to open` : 'Tap to open · GPS not ready yet';
    return true;
  }
  let stripAt = 0;
  function visitGpsTick() {
    if (!visitMode() || Date.now() - stripAt < 2500) return; stripAt = Date.now();
    renderVisitStrip();
    const r = visitId && points.find((x) => x.id === visitId); if (r) $('vcSub').textContent = visitSub(r);
  }

  function renderDefPanel() {
    const cats = CATS_FOR[ed.element] || ['Other'];
    const cbox = $('defCatSel'); cbox.innerHTML = '';
    cats.forEach((c) => cbox.add(new Option(c, c, false, c === defDraft.cat)));
    const ibox = $('defItems'); ibox.innerHTML = '';
    const items = pol().defects[defDraft.cat] || [];
    if (!items.length) ibox.innerHTML = '<p class="hint" style="margin:0">No checklist items for this category — describe the defect in notes.</p>';
    items.forEach((it) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = it;
      b.setAttribute('aria-pressed', String(defDraft.items.has(it)));
      b.addEventListener('click', () => { if (defDraft.items.has(it)) defDraft.items.delete(it); else defDraft.items.add(it); b.setAttribute('aria-pressed', String(defDraft.items.has(it))); });
      ibox.appendChild(b);
    });
    $('defSevSel').value = defDraft.sev;
  }
  $('defCatSel').addEventListener('change', (e) => { if (!defDraft) return; defDraft.cat = e.target.value; defDraft.items = new Set(); renderDefPanel(); });
  function setDefPhoto(blob, meta) {
    if (!defDraft) return;
    defDraft.blob = blob; defDraft.meta = meta;
    const u = URL.createObjectURL(blob); edUrls.push(u);
    $('defPhotoPrev').src = u; $('defPhotoPrev').hidden = false; $('defPhotoBtn').textContent = 'Retake defect photo';
  }
  function startDefDraft(scroll) {
    defDraft = { cat: (CATS_FOR[ed.element] || ['Other'])[0], items: new Set(), sev: 'Minor', blob: null };
    $('defNotes').value = ''; $('defPhotoPrev').hidden = true; $('defPhotoBtn').textContent = 'Take defect photo';
    renderDefPanel(); $('defPanel').hidden = false; $('addDefBtn').hidden = true;
    if (scroll) $('defPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('addDefBtn').addEventListener('click', () => {
    if (!isInspector()) { toast(`Only ${pol().owner || 'the admin company'} adds deficiencies`); return; }
    startDefDraft(true);
  });
  $('defSevSel').addEventListener('change', (e) => { if (defDraft) defDraft.sev = e.target.value; });
  $('defPhotoBtn').addEventListener('click', () => openCamera('defect'));
  $('defCancel').addEventListener('click', () => { defDraft = null; $('defPanel').hidden = true; $('addDefBtn').hidden = false; });
  $('defAdd').addEventListener('click', () => {
    const notes = $('defNotes').value.trim();
    let items = [...defDraft.items], useNotes = notes;
    if (!items.length) { if (!notes) { toast('Tap a defect or describe it in notes'); return; } items = [notes]; useNotes = ''; }
    let pid = null;
    if (defDraft.blob) { pid = uid(); ed.pending[pid] = defDraft.blob; prepImages(defDraft.blob); }
    const now = new Date().toISOString(), stage = pmeta().stage || 'PAT';
    items.forEach((it) => ed.defs.push({ id: uid(), cat: defDraft.cat, item: it, sev: defDraft.sev, notes: useNotes, pid, pidMeta: pid ? defDraft.meta : null,
      status: 'Open', stage, foundAt: now, foundBy: byLine(), remarks: '' }));
    defDraft = null; $('defPanel').hidden = true; $('addDefBtn').hidden = false;
    renderDefs(); toast(`${items.length} deficienc${items.length === 1 ? 'y' : 'ies'} added`);
  });
  $('edClose').addEventListener('click', () => closeSheet());
  $('scanIdBtn').addEventListener('click', () => openCamera('scan'));
  $('snapGps').addEventListener('click', () => {
    const g = (ed && ed.gps) || fix;
    if (!g) { toast('No GPS fix yet'); return; }
    pinMap.setView([g.lat, g.lon], Math.max(pinMap.getZoom(), 19)); ed.userMoved = false;
  });
  $('edRetake').addEventListener('click', async () => {
    if (ed.mode === 'edit') { openCamera('replace'); return; }
    await closeSheet(); openCamera('new');
  });
  $('edDelete').addEventListener('click', () => { $('delName').textContent = $('poleId').value || 'this pole'; $('delConfirm').hidden = false; $('delConfirm').scrollIntoView({ block: 'nearest' }); });
  $('delNo').addEventListener('click', () => { $('delConfirm').hidden = true; });
  $('delYes').addEventListener('click', async () => {
    const id = ed.id, rec = points.find((p) => p.id === id);
    await dbDel('points', id);
    if (rec) await deletePhotosIfUnused(allPids(rec).concat(Object.keys(ed.pending || {})), new Set([id]));
    points = points.filter((p) => p.id !== id);
    if (links().some(([x, y]) => x === id || y === id)) setLinks(links().filter(([x, y]) => x !== id && y !== id));
    renderPoles(); if (!$('list').hidden) renderList();
    await closeSheet(); toast(rec && rec.kind === 'acceptance' ? 'Element deleted' : 'Pole deleted');
  });
  $('edSave').addEventListener('click', saveEditor);

  async function saveEditor() {
    if (!ed || editorSaving) return; // a second tap while saving does nothing
    editorSaving = true;
    $('saveIssue').hidden = true;
    try { await saveEditorDraft(); }
    finally { editorSaving = false; busy(false); $('edSave').disabled = false; }
  }

  async function saveEditorDraft() {
    const poleId = $('poleId').value.trim().toUpperCase();
    if (!poleId || new RegExp(`^(${prefixAlt()})-?$|^FDU_?$`).test(poleId)) { toast(`Enter the ${ed.acc ? ed.element : 'Pole'} ID first${poleId ? ' (the number is missing)' : ''}`); $('poleId').focus(); return; }
    if (!profileOk()) { toast('Enter your details first (Settings → You)'); openProfile(true); return; }
    {
      const c0 = pinMap.getCenter();
      if (ed.gps && ed.dragged && haversine(ed.gps, { lat: c0.lat, lon: c0.lng }) > PIN_LIMIT_M + 2) { clampPin(); toast(`Pin is more than ${fmtDist(PIN_LIMIT_M)} from where the photo was taken`); return; }
      if (ed.acc && !ed.gps) { toast('Waiting for GPS — acceptance records need the location where the photo was taken', 4000); return; }
    }
    if (ed.acc) { await saveAcceptance(poleId); return; }
    const c = pinMap.getCenter(), pos = { lat: c.lat, lon: c.lng };
    const btn = $('edSave'); btn.disabled = true;
    const t0 = Date.now();
    LOG.step('save.survey', { mode: ed.mode, photo: !!ed.newBlob, mem: memMB(), map: S.base });
    const slow = setTimeout(() => LOG.warn('save.slow', { s: 10, mem: memMB() }), 10000);
    try {
      const now = new Date().toISOString();
      const p = points.find((x) => x.id === ed.id);
      const g = ed.gps;
      // a new object: the record in memory changes only after the phone's storage has committed the save
      const rec = Object.assign({}, p || { id: ed.id, project: S.project, created: now, takenAt: ed.takenAt || now, source: ed.source || 'camera' }, {
        poleId, poleType: ed.type || '', lat: pos.lat, lon: pos.lon, updated: now, ...(p ? { updatedBy: byLine() } : { by: byLine() }),
        ...(ed.newBlob ? { q: ed.q || null } : {}), ...(ed.idRead ? { idRead: ed.idRead } : {}),
        gpsLat: g ? g.lat : null, gpsLon: g ? g.lon : null,
        accuracy: g && Number.isFinite(g.acc) ? g.acc : null,
        alt: g && Number.isFinite(g.alt) ? g.alt : null,
        adjusted: g ? haversine(g, pos) > 0.5 : true,
      });
      const photos = [];
      if (ed.newBlob) {
        busy('Preparing photo…');
        const tp = Date.now(); photos.push({ id: ed.id, ...await storedImages(ed.newBlob) });
        LOG.info('save.imagesReady', { waited: Date.now() - tp });
      }
      busy('Writing to phone storage…');
      await saveRecord(rec, photos); // photo and record together, or neither
      if (!p) points.push(rec); else points[points.indexOf(p)] = rec;
      if (ed.mode === 'new' && !isNpt(poleId)) S.lastPoleId = poleId;
      if (typeNames().includes(ed.type)) S.lastType = ed.type;
      if (ed.newBlob) notePerf(Date.now() - t0);
      persist(); notePerson();
      LOG.info('save.done', { ms: Date.now() - t0 }); LOG.done('save.survey');
    } catch (e) {
      clearTimeout(slow); LOG.error('save.fail', { ms: Date.now() - t0, ...errInfo(e) }); LOG.done('save.survey');
      showSaveError(e); return;
    }
    clearTimeout(slow);
    // saved: refreshing the screens must not turn a successful save into an error
    busy(false);
    const wasNew = ed.mode === 'new';
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); renderPoles(); if (!$('list').hidden) renderList(); } catch (e) { LOG.error('save.refresh', errInfo(e)); }
    editorSaving = false;
    await closeSheet();
    if (wasNew) { map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 17)); toast(`${poleId} saved`); }
    else toast('Changes saved');
  }

  async function saveAcceptance(poleId) {
    // a defect picked but not yet added is added by Save
    if (defDraft && !$('defPanel').hidden && (defDraft.items.size || $('defNotes').value.trim())) $('defAdd').click();
    if (visitStage() === 'PAT' && ed.mode === 'new' && !ed.defs.length) {
      toast('A PAT records only elements with defects: tick the defect and its N / D / MD, then Save. Or close without saving.', 6000);
      if (!defDraft) startDefDraft(true); else $('defPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const c = pinMap.getCenter(), pos = { lat: c.lat, lon: c.lng };
    const btn = $('edSave'); btn.disabled = true;
    const t0 = Date.now();
    LOG.step('save.acceptance', { mode: ed.mode, pending: Object.keys(ed.pending).length, mem: memMB(), map: S.base });
    const slow = setTimeout(() => LOG.warn('save.slow', { s: 10, mem: memMB() }), 10000);
    let rec, n = 0;
    try {
      const now = new Date().toISOString();
      const p = points.find((x) => x.id === ed.id);
      const g = ed.gps, el = ed.element;
      rec = Object.assign({}, p || { id: ed.id, project: S.project, created: now, takenAt: ed.takenAt || now, source: ed.source || 'camera' }, {
        kind: 'acceptance', element: el, poleId, poleType: el === 'Pole' ? ed.type || '' : '', lat: pos.lat, lon: pos.lon, updated: now, ...(ed.idRead ? { idRead: ed.idRead } : {}),
        ...(p ? { updatedBy: byLine() } : { by: byLine() }),
        mloop: el === 'Pole' && ed.mloop, nap: el === 'Pole' && ed.nap, closure: el === 'Pole' && ed.closure,
        napId: el === 'Pole' && ed.nap ? $('napId').value.trim().toUpperCase() : '',
        closureId: el === 'Pole' && ed.closure ? $('closureId').value.trim().toUpperCase() : '',
        odf: el === 'ODF' ? ed.odf : '',
        photos: ed.photos.map((ph) => ({ ...ph })), defs: JSON.parse(JSON.stringify(ed.defs)),
        gpsLat: g ? g.lat : null, gpsLon: g ? g.lon : null,
        accuracy: g && Number.isFinite(g.acc) ? g.acc : null, alt: g && Number.isFinite(g.alt) ? g.alt : null,
        adjusted: g ? haversine(g, pos) > 0.5 : true,
      });
      const used = new Set(allPids(rec));
      const pend = Object.keys(ed.pending).filter((pid) => used.has(pid));
      const photos = [];
      for (let i = 0; i < pend.length; i++) {
        busy(pend.length > 1 ? `Preparing photo ${i + 1} / ${pend.length}…` : 'Preparing photo…', pend.length > 1 ? i / pend.length : null);
        const tp = Date.now(); photos.push({ id: pend[i], ...await storedImages(ed.pending[pend[i]]) });
        LOG.info('save.imagesReady', { i, waited: Date.now() - tp });
      }
      busy('Writing to phone storage…');
      await saveRecord(rec, photos); // all photos and the record together, or none
      if (!p) points.push(rec); else points[points.indexOf(p)] = rec;
      deletePhotosIfUnused(ed.removed.filter((pid) => !used.has(pid)), new Set([rec.id])).catch(() => {}); // cleanup can finish in the background
      if (el === 'Pole' && typeNames().includes(ed.type)) S.lastType = ed.type;
      if (pend.length) notePerf(Date.now() - t0);
      persist(); notePerson(); n = openCount(rec);
      LOG.info('save.done', { ms: Date.now() - t0, photos: pend.length }); LOG.done('save.acceptance');
    } catch (e) {
      clearTimeout(slow); LOG.error('save.fail', { ms: Date.now() - t0, ...errInfo(e) }); LOG.done('save.acceptance');
      showSaveError(e); return;
    }
    clearTimeout(slow);
    busy(false);
    const wasNew = ed.mode === 'new', pos2 = { lat: rec.lat, lon: rec.lon };
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); renderPoles(); if (!$('list').hidden) renderList(); } catch (e) { LOG.error('save.refresh', errInfo(e)); }
    editorSaving = false;
    await closeSheet();
    if (wasNew) map.setView([pos2.lat, pos2.lon], Math.max(map.getZoom(), 17));
    toast(`${poleId} saved${n ? ` · ${n} open deficienc${n === 1 ? 'y' : 'ies'}` : ' · OK'}`);
  }

  function saveError(e) {
    if (e && e.name === 'QuotaExceededError') return 'Not saved: phone storage is full. Keep this screen open, free space in another app, then tap Save again.';
    return 'Not saved: ' + ((e && e.message) || e) + ' Your photo is kept on this screen; do not close or reload it. (Details: Settings → App log)';
  }
  function showSaveError(e) {
    const message = saveError(e), el = $('saveIssue');
    el.textContent = message; el.hidden = false; toast(message, 8000);
  }

  /* ================= list ================= */
  let listUrls = [];
  function revokeListUrls() { listUrls.forEach((u) => URL.revokeObjectURL(u)); listUrls = []; }
  async function renderList() {
    revokeListUrls();
    const q = $('listSearch').value.trim().toUpperCase(), acc = isAcc();
    $('listFilter').hidden = !acc;
    const pts = projPoints().reverse().filter((p) => (!q || [p.poleId, p.poleType, p.element, p.napId, p.closureId].join(' ').toUpperCase().includes(q))
      && (!acc || listFilter === 'all' || recStatus(p) === listFilter));
    const counts = {}; projPoints().forEach((p) => { counts[p.poleId] = (counts[p.poleId] || 0) + 1; });
    const box = $('listItems'); box.innerHTML = '';
    $('listTitle').textContent = `${taskCat()} · ${S.project}`;
    const st = projStats(projPoints()), stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
    $('listStats').hidden = !st.total;
    $('listStatRow').innerHTML = acc ? stat(st.total, 'elements') + stat(st.itemsOpen, 'open') + stat(st.itemsRect, 'to verify') + stat(st.itemsVer, 'verified')
      : stat(st.total, 'poles') + stat(fmtLen(st.len), 'route') + stat(st.long, 'long spans') + stat(projPoints().filter((p) => p.adjusted).length, 'pins moved');
    if (!pts.length) { box.innerHTML = `<div class="empty">${q || (acc && listFilter !== 'all') ? 'Nothing matches.' : `No ${acc ? 'elements' : 'poles'} yet. Tap the camera button to capture the first one.`}</div>`; return; }
    for (const p of pts) {
      const b = document.createElement('button'); b.className = 'card'; b.type = 'button';
      const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy';
      const info = document.createElement('div');
      const t = document.createElement('span'); t.className = 't'; t.textContent = p.poleId;
      const s = document.createElement('span'); s.className = 's';
      if (p.kind === 'acceptance') {
        const st = recStatus(p), n = openCount(p);
        s.innerHTML = `<span class="tag">${C.xmlEsc(elemOf(p))}</span><span class="tag" style="background:${STATUS_COLORS[st]};color:#fff">${st === 'Open' ? `${n} open` : STATUS_TEXT[st]}</span>${counts[p.poleId] > 1 ? '<span class="tag dup">duplicate ID</span>' : ''}`;
        const s3 = document.createElement('span'); s3.className = 's'; s3.textContent = attachText(p).join(' · ');
        if (s3.textContent) info.append(s3);
      } else s.innerHTML = `<span class="tag">${C.xmlEsc(p.poleType || '—')}</span>${p.adjusted ? '<span class="tag adj">pin adjusted</span>' : ''}${counts[p.poleId] > 1 ? '<span class="tag dup">duplicate ID</span>' : ''}`;
      const s2 = document.createElement('span'); s2.className = 's mono';
      s2.textContent = `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}${Number.isFinite(p.accuracy) ? ` · ±${p.accuracy.toFixed(0)} m` : ''}`;
      info.prepend(t, s, s2); b.append(img, info);
      b.addEventListener('click', () => openEditorFor(p.id));
      box.appendChild(b);
      dbGet('photos', photosOf(p)[0] ? photosOf(p)[0].pid : p.id).then((ph) => { if (ph && ph.thumb) { const u = URL.createObjectURL(ph.thumb); listUrls.push(u); img.src = u; } }).catch(() => {});
    }
  }
  $('listBtn').addEventListener('click', () => { $('listSearch').value = ''; renderList(); openSheet('list'); });
  $('listSearch').addEventListener('input', renderList);
  let listFilter = 'all';
  $('listFilter').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return; listFilter = c.dataset.v;
    $('listFilter').querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c))); renderList();
  });

  /* ================= projects ================= */
  function allProjects() { return [...new Set(S.projects.concat(points.map((p) => p.project)))]; }
  /** The stage checklist of the current project: what is done, what comes next, and the button that gets there. */
  function workflowModel() {
    const m = pmeta(), pts = projPoints(), n = pts.length, ex = m.exports || {}, cat = taskCat();
    const last = pts.reduce((t, p) => (p.updated > t ? p.updated : t), '');
    const fresh = (kinds) => kinds.some((k) => ex[k] && ex[k] > last);
    const go = { capture: () => closeAll().then(() => $('captureBtn').click()), records: () => closeAll().then(() => $('listBtn').click()), export: () => closeAll().then(() => { exportPick = isAcc() ? 'doPdf' : 'doKmz'; $('exportBtn').click(); }), backup: () => closeAll().then(() => { exportPick = 'doBackup'; $('exportBtn').click(); }),
      route: () => closeAll().then(() => { if (!routeMode) setRouteMode(true); }), form: () => { $('mSite').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('mSite').focus(); },
      fat: () => $('startFat').click(), share: () => guard(sharePackage), next: () => closeAll().then(() => { const t = nextTarget(); if (t) openVisit(t.r.id, true); else toast('No pin left to visit'); }) };
    const steps = [];
    if (cat === 'Survey') {
      const R = routeModel();
      steps.push({ t: 'Capture the poles', s: n ? `${n} pole${n === 1 ? '' : 's'} captured` : 'Photo, ID scan, pin check for each pole', done: n > 0, go: 'capture', label: 'Capture' });
      steps.push({ t: 'Link the route', s: !R.spans.length ? 'Tap the route button: link in capture order, then fix branches' : `${R.spans.length} span${R.spans.length === 1 ? '' : 's'} · ${R.long} over ${pol().maxSpan} m · ${R.off} not linked`, done: n > 1 && R.spans.length > 0 && R.off === 0 && !R.long, go: 'route', label: 'Route' });
      steps.push({ t: 'Export for design', s: fresh(['kmz', 'dxf', 'csv']) ? 'KMZ / DXF / CSV made after the last change' : 'KMZ for Google Earth, DXF for AutoCAD, CSV, photos', done: n > 0 && fresh(['kmz', 'dxf', 'csv']), go: 'export', label: 'Export' });
      steps.push({ t: 'Back up the project', s: fresh(['backup']) ? `Backup made ${fmtTime(ex.backup)}` : 'Export → Backup, keep the ZIP on Drive or a PC', done: n > 0 && fresh(['backup']), go: 'backup', label: 'Backup' });
    } else if (cat === 'PAT') {
      const items = pts.flatMap((p) => counting(p)), open = items.filter((d) => defStatusOf(d) === 'Open').length;
      const formOk = !!(m.site && m.contractor && m.vendorRep && m.globeRep);
      const handed = allProjects().some((x) => pmeta(x).fromPat === S.project) || !!ex.sent;
      steps.push({ t: 'Form details', s: formOk ? `${m.site} · ${m.contractor}` : 'Location, vendor, representatives, inspection date (printed on the form)', done: formOk, go: 'form', label: 'Fill in' });
      steps.push({ t: 'Record the defects', s: n ? `${n} element${n === 1 ? '' : 's'} · ${items.length} deficienc${items.length === 1 ? 'y' : 'ies'} · ${open} open` : 'Photo only the poles / ODFs with defects; tag each N, D or MD', done: n > 0, go: 'capture', label: 'Capture' });
      steps.push({ t: 'Export the Deficiency List', s: fresh(['pdf', 'xlsx']) ? 'PDF / Excel made after the last change' : 'PDF (form + annexes) and Excel for signing and tracking', done: n > 0 && fresh(['pdf', 'xlsx']), go: 'export', label: 'Export' });
      steps.push({ t: 'Share the PAT KMZ with the contractor', s: handed ? (ex.sent ? `PAT KMZ shared ${fmtTime(ex.sent)}` : 'FAT started on this phone') : 'One KMZ with the defect pins and photos, for the defect cleanup and the FAT', done: handed, go: 'share', label: 'Share KMZ' });
    } else if (cat === 'Cleanup') {
      const items = pts.flatMap((p) => counting(p)), open = items.filter((d) => defStatusOf(d) === 'Open'), noPhoto = items.filter((d) => defDone(d) && !d.afterPid).length;
      steps.push({ t: 'Started from the PAT KMZ', s: `${m.fromPat || 'PAT'} · ${n} pin${n === 1 ? '' : 's'} · ${items.length} item${items.length === 1 ? '' : 's'}`, done: true, go: 'records', label: 'Records' });
      steps.push({ t: 'Fix each defect and photo it', s: items.length ? `${items.length - open.length} of ${items.length} fixed · ${open.length} open${noPhoto ? ` · ${noPhoto} without photo` : ''}` : 'No deficiencies to fix', done: items.length > 0 && !open.length, go: 'next', label: 'Next defect' });
      steps.push({ t: 'Share the cleanup KMZ for the FAT', s: fresh(['sent']) ? `Shared ${fmtTime(ex.sent)}` : 'One KMZ with the fixed items and photos, for the inspector', done: n > 0 && fresh(['sent']), go: 'share', label: 'Share KMZ' });
    } else {
      const items = pts.flatMap((p) => counting(p)), open = items.filter((d) => defStatusOf(d) === 'Open'), rect = items.filter((d) => defStatusOf(d) === 'Rectified'), ver = items.filter((d) => defStatusOf(d) === 'Verified');
      steps.push({ t: m.fromStage === 'Cleanup' ? 'Started from the cleanup KMZ' : 'Started from the PAT', s: m.fromPat ? `${m.fromPat} · ${n} element${n === 1 ? '' : 's'} · ${items.length} item${items.length === 1 ? '' : 's'}` : `Started empty · ${n} element${n === 1 ? '' : 's'}`, done: true, go: 'records', label: 'Records' });
      steps.push({ t: 'Contractor rectifies', s: items.length ? `${rect.length + ver.length} of ${items.length} rectified · ${open.length} open${open.some((d) => (d.reopened || []).length) ? ' (some rejected)' : ''}` : 'No deficiencies to rectify', done: items.length > 0 && !open.length, go: 'next', label: 'Next pin' });
      steps.push({ t: 'Inspector verifies each pin', s: items.length ? `${ver.length} verified · ${rect.length} awaiting verification` : '—', done: items.length > 0 && ver.length === items.length, go: 'next', label: 'Next pin' });
      steps.push({ t: 'Export the final Deficiency List', s: fresh(['pdf']) ? 'PDF made after the last change' : 'Deficiency List PDF with the verified photos, and the rectification report', done: n > 0 && fresh(['pdf']), go: 'export', label: 'Export' });
    }
    const next = steps.find((x) => !x.done) || null;
    return { cat, steps, next, go };
  }
  async function closeAll() { while (stack.length) await closeSheet(); }
  function renderWorkflow() {
    const W = workflowModel(), box = $('wfSteps'); box.innerHTML = '';
    W.steps.forEach((st, i) => {
      const row = document.createElement('div'); row.className = 'step' + (st.done ? ' done' : st === W.next ? ' now' : '');
      const nn = document.createElement('span'); nn.className = 'n'; nn.textContent = st.done ? '✓' : String(i + 1);
      const t = document.createElement('div'); t.className = 't';
      const b = document.createElement('b'); b.textContent = st.t; const s2 = document.createElement('span'); s2.textContent = st.s; t.append(b, s2);
      row.append(nn, t); box.appendChild(row);
    });
    const btn = $('wfNext');
    if (W.next) { btn.hidden = false; btn.textContent = `Next: ${W.next.t}`; btn.onclick = () => W.go[W.next.go](); }
    else { btn.hidden = false; btn.textContent = W.cat === 'Survey' ? 'All done — export again after changes' : 'All done'; btn.onclick = () => W.go.export(); }
  }
  function renderProjects() {
    renderWorkflow();
    $('renameProject').value = S.project;
    const m = pmeta(), acc = isAcc(), cat = taskCat();
    $('purposeRow').hidden = acc; $('curPurpose').value = m.purpose || 'As-plan'; renderRefInfo();
    $('accMeta').hidden = !acc;
    const pb = $('projBadge'); pb.textContent = cat.toUpperCase(); pb.className = `badge cat ${cat.toLowerCase()}`;
    if (acc) {
      $('accStageInfo').textContent = m.stage === 'FAT' ? `FAT · Final Acceptance Test${m.fromPat ? ` · verifying the PAT “${m.fromPat}”${m.fromStage === 'Cleanup' ? ' after the defect cleanup' : ''}` : ''}`
        : m.stage === 'Cleanup' ? `Defect cleanup · fixing the PAT punchlist${m.fromPat ? ` of “${m.fromPat}”` : ''}` : 'PAT · Provisional Acceptance Test';
      $('mSite').value = m.site || ''; $('mContractor').value = m.contractor || ''; $('mVendorRep').value = m.vendorRep || ''; $('mGlobe').value = m.globeRep || ''; $('mInspector').value = m.inspector || '';
      $('mDate').value = m.date || '';
      const types = formText().types || [], chosen = m.inspTypes || pol().inspTypes, box = $('mTypes'); box.innerHTML = '';
      types.forEach((t) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = t; b.setAttribute('aria-pressed', String(chosen.includes(t)));
        b.addEventListener('click', () => { const cur = new Set(pmeta().inspTypes || pol().inspTypes); if (cur.has(t)) cur.delete(t); else cur.add(t); const mm = { ...pmeta(), inspTypes: types.filter((x) => cur.has(x)) }; S.meta[S.project] = mm; persist(); renderProjects(); });
        box.appendChild(b);
      });
      $('startFat').hidden = $('startFatHint').hidden = $('sendPat').hidden = $('sendPatHint').hidden = m.stage === 'FAT';
      $('sendPat').textContent = m.stage === 'Cleanup' ? 'Share the cleanup KMZ (for the FAT)' : 'Share the PAT KMZ (for defect cleanup / FAT)';
      $('startFat').textContent = m.stage === 'Cleanup' ? 'Start FAT from this cleanup on this phone' : 'Start FAT from this PAT on this phone';
    }
    $('delProjConfirm').hidden = true; $('delProject').hidden = false;
    const box = $('projItems'); box.innerHTML = '';
    for (const name of allProjects()) {
      const n = points.filter((p) => p.project === name).length, pm = pmeta(name), pacc = pm.mode === 'acceptance';
      const areas = (S.areas || []).filter((x) => x.project === name).length;
      const b = document.createElement('button'); b.className = 'card'; b.type = 'button';
      if (name === S.project) b.style.borderColor = 'var(--accent)';
      const d = document.createElement('div');
      const t = document.createElement('span'); t.className = 't'; t.style.fontFamily = 'var(--sans)'; t.textContent = name;
      const s = document.createElement('span'); s.className = 's';
      const open = pacc ? points.filter((p) => p.project === name).reduce((t, p) => t + openCount(p), 0) : 0;
      s.textContent = `${pacc ? `${pm.stage || 'PAT'} · ${n} element${n === 1 ? '' : 's'} · ${open} open` : `Survey · ${n} pole${n === 1 ? '' : 's'}`}${name === S.project ? ' · current' : ''}`;
      d.append(t, s); b.append(d);
      b.addEventListener('click', async () => { S.project = name; persist(); renderPoles(); await closeSheet(); fitProject(); toast(`Now working on: ${name}`); });
      box.appendChild(b);
    }
  }
  function openProjects() { renderProjects(); renderTasks(); openSheet('projects'); cloudSync(false).then(() => { if (!$('projects').hidden) renderTasks(); }); }
  $('projectBtn').addEventListener('click', openProjects);
  $('addProject').addEventListener('click', async () => {
    const name = $('newProject').value.trim();
    if (!name) { toast('Type a project name'); return; }
    if (allProjects().includes(name)) { toast('A project with that name already exists'); return; }
    S.projects.push(name);
    S.meta = S.meta || {};
    S.meta[name] = newMode === 'survey' ? { mode: 'survey', purpose: $('newPurpose').value } : { mode: 'acceptance', stage: newMode, site: '', contractor: '', globeRep: '', inspector: byLine() };
    S.project = name; persist(); $('newProject').value = '';
    renderPoles(); await closeSheet();
    toast(newMode === 'survey' ? `${$('newPurpose').value} survey "${name}" started` : `${newMode} "${name}" started — add contractor details in Projects`, 3500);
  });
  let newMode = 'survey';
  const NEW_MODE_HINT = { survey: 'Survey: As-plan before construction or As-built after it. You can load the HLD KMZ as a reference route.',
    PAT: 'PAT: record only the elements with defects, tagged N, D or MD. Then share the PAT KMZ with the contractor for the defect cleanup.',
    Cleanup: 'Defect cleanup: open the PAT KMZ from the inspector, walk to each red pin and take the photo of the fix. Then share the cleanup KMZ for the FAT.',
    FAT: 'FAT: open the PAT or cleanup KMZ, walk to each pin and accept or reject the fix. Or type a name for an empty FAT.' };
  $('newMode').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return; newMode = c.dataset.v;
    $('newMode').querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    $('newModeHint').textContent = NEW_MODE_HINT[newMode];
    $('fatFromFile').hidden = newMode !== 'FAT' && newMode !== 'Cleanup';
    $('fatFromFile').textContent = newMode === 'Cleanup' ? 'Open the PAT KMZ…' : 'Open the PAT / cleanup KMZ…';
    $('newNameRow').hidden = newMode === 'Cleanup'; // a cleanup always starts from the PAT file
    $('newPurposeRow').hidden = newMode !== 'survey';
  });
  [['mSite', 'site'], ['mContractor', 'contractor'], ['mVendorRep', 'vendorRep'], ['mGlobe', 'globeRep'], ['mInspector', 'inspector'], ['mDate', 'date']].forEach(([id, key]) => {
    $(id).addEventListener('change', () => { const m = { ...pmeta() }; m[key] = $(id).value.trim(); S.meta[S.project] = m; persist(); });
  });
  $('startFat').addEventListener('click', () => guard(() => startFatFrom(S.project), 'FAT not started'));
  $('curPurpose').addEventListener('change', () => { S.meta = S.meta || {}; S.meta[S.project] = { ...pmeta(), purpose: $('curPurpose').value }; persist(); renderProjects(); });
  /** Copies a PAT or defect-cleanup project (on this phone) into a new FAT project; the source stays unchanged. */
  async function startFatFrom(pat, extraMeta, wantName) {
    const m = pmeta(pat);
    if (m.mode !== 'acceptance' || !['PAT', 'Cleanup'].includes(m.stage || 'PAT')) throw new Error(`“${pat}” is not a PAT or defect cleanup project`);
    const base = wantName || `${m.fromPat || pat} – FAT`;
    let name = base, k = 2;
    while (allProjects().includes(name)) name = `${base} ${wantName ? `(${k++})` : k++}`;
    const src = points.filter((p) => p.project === pat), now = new Date().toISOString();
    busy('Starting FAT…');
    const copies = src.map((r) => ({ ...JSON.parse(JSON.stringify(r)), id: uid(), project: name, updated: now, patId: r.id }));
    for (const c of copies) { await dbPut('points', c); points.push(c); }
    const { taskId, date, exports, ...patMeta } = m; // the PAT's own online task, inspection date and exports are not this FAT's
    const extra = Object.fromEntries(Object.entries(extraMeta || {}).filter(([, v]) => v !== '' && v != null)); // blank task cells keep the PAT's details
    S.meta[name] = { ...patMeta, stage: 'FAT', fromPat: m.fromPat || pat, fromStage: m.stage || 'PAT', inspector: m.inspector || byLine(), ...extra };
    S.projects.push(name); S.project = name; persist();
    renderPoles(); renderProjects(); busy(false);
    const open = copies.reduce((t, r) => t + openCount(r), 0);
    toast(`FAT started: ${copies.length} elements, ${open} open item${open === 1 ? '' : 's'} to re-check`, 4500);
    return name;
  }
  $('doRename').addEventListener('click', () => guard(async () => {
    const name = $('renameProject').value.trim(), old = S.project;
    if (!name || name === old) return;
    if (allProjects().includes(name)) { toast('A project with that name already exists'); return; }
    busy('Renaming…');
    for (const p of points.filter((x) => x.project === old)) { p.project = name; await dbPut('points', p); }
    S.projects = S.projects.map((x) => (x === old ? name : x));
    if (S.meta && S.meta[old]) { S.meta[name] = S.meta[old]; delete S.meta[old]; }
    Object.values(S.meta || {}).forEach((m) => { if (m.fromPat === old) m.fromPat = name; });
    (S.areas || []).forEach((x) => { if (x.project === old) x.project = name; });
    if (S.refs && S.refs[old]) { S.refs[name] = S.refs[old]; delete S.refs[old]; if (refFor === old) refFor = name; }
    if (S.refHidden && old in S.refHidden) { S.refHidden[name] = S.refHidden[old]; delete S.refHidden[old]; }
    S.project = name; persist(); renderPoles(); renderProjects(); drawAreas();
    toast(`Renamed to "${name}"`);
  }, 'Rename failed'));
  $('delProject').addEventListener('click', () => {
    const n = projPoints().length, what = isAcc() ? 'element' : 'pole';
    $('delProjText').textContent = `Delete "${S.project}" with its ${n} ${what}${n === 1 ? '' : 's'}, photos and offline maps? Make a backup first if you still need them. This can't be undone.`;
    $('delProjConfirm').hidden = false; $('delProject').hidden = true;
  });
  $('delProjNo').addEventListener('click', () => { $('delProjConfirm').hidden = true; $('delProject').hidden = false; });
  $('delProjYes').addEventListener('click', () => guard(async () => {
    const name = S.project, pts = points.filter((p) => p.project === name);
    let i = 0;
    const ids = new Set(pts.map((p) => p.id)), pids = [];
    for (const p of pts) { busy(`Deleting ${++i} / ${pts.length}`, i / pts.length); await dbDel('points', p.id); pids.push(...allPids(p)); }
    await deletePhotosIfUnused(pids, ids);
    points = points.filter((p) => p.project !== name);
    if (S.meta) delete S.meta[name];
    for (const ar of (S.areas || []).filter((x) => x.project === name)) await deleteArea(ar.id);
    if (refInfo(name)) { await dbDel('packs', refKey(refInfo(name).id)).catch(() => {}); const r = { ...S.refs }; delete r[name]; S.refs = r; if (refFor === name) { refGeo = null; refFor = null; } }
    S.projects = S.projects.filter((x) => x !== name);
    if (!S.projects.length) S.projects = [DEF.project];
    S.project = allProjects()[0]; persist();
    renderPoles(); drawAreas(); renderProjects();
    toast(`Deleted "${name}"`);
  }, 'Delete failed'));

  /* ================= export ================= */
  let lastResult = null;
  /* ---- Android APK (Capacitor): the in-app browser cannot download files, so exports are written
     to the phone's Documents/PoleCam folder and shared through Android's share sheet. ---- */
  async function blobChunkB64(blob, start, end) {
    const u = new Uint8Array(await blob.slice(start, end).arrayBuffer());
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  /** Write a blob to a native folder in 3 MB pieces (large KMZ/PDF files would not fit through the bridge at once). */
  async function nativeWrite(blob, path, directory) {
    const CH = 3 * 1024 * 1024; let uri = '';
    for (let off = 0; off < Math.max(1, blob.size); off += CH) {
      const data = await blobChunkB64(blob, off, Math.min(blob.size, off + CH));
      if (off === 0) uri = (await nativeCall('Filesystem', 'writeFile', { path, data, directory, recursive: true })).uri;
      else await nativeCall('Filesystem', 'appendFile', { path, data, directory });
      if (blob.size > CH) busy(`Saving ${Math.min(100, Math.round(((off + CH) / blob.size) * 100))}%…`, Math.min(1, (off + CH) / blob.size));
    }
    return uri;
  }
  /** Where Save puts files (Settings → Where saved files go). */
  function savePath(name, base) {
    const folder = String(S.saveFolder || 'PoleCam').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'PoleCam';
    const sub = S.saveByProject !== false ? `${folder}/${C.safeName(S.project)}` : folder;
    return (base || S.saveBase) === 'DOWNLOAD'
      ? { directory: 'EXTERNAL_STORAGE', path: `Download/${sub}/${name}`, shown: `Download/${sub}/${name}` }
      : { directory: 'DOCUMENTS', path: `${sub}/${name}`, shown: `Documents/${sub}/${name}` };
  }
  /** Save: a copy in the chosen shared folder (visible to file managers). Falls back to Documents if Download is refused. */
  async function nativeSave(r) {
    if (r.uri) return r;
    const sp = savePath(r.name);
    try { r.uri = await nativeWrite(r.blob, sp.path, sp.directory); r.where = sp.shown; }
    catch (e) {
      if (sp.directory === 'DOCUMENTS') throw e;
      const d = savePath(r.name, 'DOCUMENTS');
      r.uri = await nativeWrite(r.blob, d.path, d.directory); r.where = `${d.shown} (Download folder was not allowed)`;
    } finally { busy(false); }
    return r;
  }
  /** Share: the file goes only to the app's private cache (other apps cannot browse it) and is handed to the chosen app. */
  async function nativePrivate(r) {
    if (r.cacheUri) return r;
    try { r.cacheUri = await nativeWrite(r.blob, `share/${r.name}`, 'CACHE'); }
    finally { busy(false); }
    return r;
  }
  /** Remembers which outputs were made from this project and when, for the workflow checklist. */
  function noteExport(kind, project) {
    S.meta = S.meta || {}; const m = { ...pmeta(project || S.project) }; m.exports = { ...(m.exports || {}), [kind]: new Date().toISOString() }; S.meta[project || S.project] = m; persist();
  }
  function offerResult(blob, name) {
    lastResult = { blob, name };
    LOG.info('export.ready', { kind: (name.split('.').pop() || '').toLowerCase(), mb: +(blob.size / 1048576).toFixed(2) });
    const kind = /_BACKUP\.zip$/i.test(name) ? 'backup' : /_PAT_for_FAT_/i.test(name) ? 'sent' : (name.split('.').pop() || '').toLowerCase();
    noteExport(kind);
    $('resultName').textContent = `${name} · ${(blob.size / 1048576).toFixed(2)} MB`;
    $('resultBox').hidden = false;
    $('resSave').textContent = NATIVE ? 'Save to Documents' : 'Save to phone';
    $('resShare').hidden = !NATIVE && !(navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] }));
    $('resultBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  $('resSave').addEventListener('click', async () => {
    if (!lastResult) return;
    if (NATIVE) {
      const t0 = Date.now(); LOG.step('file.save', { name: lastResult.name.replace(/^.*?(_[A-Za-z]+\.\w+)$/, '…$1'), mb: +(lastResult.blob.size / 1048576).toFixed(2) });
      try {
        const r = await nativeSave(lastResult);
        LOG.info('file.save.done', { ms: Date.now() - t0 }); LOG.done('file.save');
        toast(`Saved to ${r.where}`, 5000);
      } catch (e) { LOG.error('file.save.fail', { ms: Date.now() - t0, ...errInfo(e) }); LOG.done('file.save'); toast(`Could not save the file (${e.message || e}) — use Share to send it instead`, 7000); }
      return;
    }
    const a = document.createElement('a'), u = URL.createObjectURL(lastResult.blob);
    a.href = u; a.download = lastResult.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
    toast('Saved to Downloads');
  });
  $('resShare').addEventListener('click', async () => {
    if (!lastResult) return;
    if (NATIVE) {
      const t0 = Date.now(); LOG.step('file.share', { mb: +(lastResult.blob.size / 1048576).toFixed(2) });
      try {
        const r = await nativePrivate(lastResult);
        LOG.info('file.share.written', { ms: Date.now() - t0 }); LOG.done('file.share');
        await nativeCall('Share', 'share', { title: r.name, dialogTitle: `Send ${r.name}`, files: [r.cacheUri] });
      } catch (e) { LOG.done('file.share'); if (!/cancel/i.test(String(e && e.message))) { LOG.error('file.share.fail', { ms: Date.now() - t0, ...errInfo(e) }); toast('Sharing failed: ' + (e.message || e), 5000); } }
      return;
    }
    try { await navigator.share({ files: [new File([lastResult.blob], lastResult.name, { type: lastResult.blob.type })], title: lastResult.name }); }
    catch (e) { if (e.name !== 'AbortError') toast('Sharing failed — use Save to phone'); }
  });
  /* Export screen: one format at a time, picked from the Format dropdown (the last choice is kept per Survey / acceptance). */
  let exportPick = null;
  const xKey = (card) => card.querySelector('button[id^="do"]').id;
  function exportCards() { return [...document.querySelectorAll('#export .xcard')].filter((c) => { const g = c.closest('#accExports, #surveyExports'); return !g || !g.hidden; }); }
  function showExport(pick) {
    const cards = exportCards(), sel = $('xFormat'), acc = isAcc();
    const want = cards.find((c) => c.querySelector('#' + pick)) || cards.find((c) => xKey(c) === (S.xPick || {})[acc ? 'acc' : 'survey']) || cards[0];
    sel.innerHTML = '';
    cards.forEach((c) => sel.add(new Option(c.querySelector('.head b').textContent, xKey(c), false, c === want)));
    document.querySelectorAll('#export .xcard').forEach((c) => c.classList.toggle('xoff', c !== want));
  }
  $('xFormat').addEventListener('change', (e) => {
    S.xPick = { ...(S.xPick || {}), [isAcc() ? 'acc' : 'survey']: e.target.value }; persist();
    showExport(e.target.value); $('export').querySelector('.body').scrollTop = 0;
  });
  $('exportBtn').addEventListener('click', () => {
    const n = projPoints().length, acc = isAcc();
    $('exportScope').textContent = acc ? `Acceptance ${pmeta().stage || 'PAT'} “${S.project}” · ${n} element${n === 1 ? '' : 's'}` : `Project “${S.project}” · ${n} pole${n === 1 ? '' : 's'}`;
    $('accExports').hidden = !acc; $('surveyExports').hidden = acc; $('namingRow').hidden = acc; // acceptance photos are named after the form items
    $('dxfZoneLbl').textContent = `UTM ${S.zone}N`; syncExpUi();
    showExport(exportPick); exportPick = null;
    $('resultBox').hidden = true; openSheet('export');
  });
  function needPoints() { const pts = projPoints(); if (!pts.length) { toast('Nothing captured in this project yet'); return null; } return pts; }
  function uniqueNames(pts) {
    const used = {}, out = {};
    for (const p of pts) {
      let base = C.safeName(p.poleId), n = base, k = 2;
      while (used[n.toLowerCase()]) n = `${base}_${k++}`;
      used[n.toLowerCase()] = 1; out[p.id] = n;
    }
    return out;
  }
  /** Survey files carry ASPLAN / ASBUILT unless the project name already says it. */
  const fileBase = () => {
    const pn = C.safeName(S.project), m = pmeta(), tag = !isAcc() && m.purpose ? m.purpose.replace('-', '').toUpperCase() : '';
    return tag && !new RegExp(tag.replace('AS', 'AS[-_ ]?'), 'i').test(S.project) ? `${pn}_${tag}_${stamp8()}` : `${pn}_${stamp8()}`;
  };
  async function guard(fn, label) { try { await fn(); } catch (e) { LOG.error('task.fail', { label: label || 'export', ...errInfo(e) }); toast(`${label === undefined ? 'Export failed: ' : label ? label + ': ' : ''}${e.message || e}`, 7000); } finally { busy(false); } }

  /** Square photo icon for a KMZ pin at the chosen size. */
  async function iconJpeg(blob, px, border) {
    const im = await loadImage(blob), { w, h } = dims(im), side = Math.min(w, h);
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, (w - side) / 2, (h - side) / 2, side, side, 0, 0, px, px);
    g.strokeStyle = border || '#ffffff'; g.lineWidth = Math.max(3, px / 12); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, px - g.lineWidth, px - g.lineWidth);
    if (im.close) im.close();
    return new Uint8Array(await (await toBlob(cv, 0.85)).arrayBuffer());
  }
  $('doKmz').addEventListener('click', () => guard(async () => {
    const pts = needPoints(); if (!pts) return;
    const E = S.exp, icons = E.kmzIconPx > 0, names = uniqueNames(pts), files = [], rows = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; busy(`Preparing photos ${i + 1} / ${pts.length}`, i / pts.length);
      const ph = await dbGet('photos', p.id);
      const r = { ...p };
      if (ph && ph.clean && E.kmzBalloonPx > 0) { r.photoName = `photos/${names[p.id]}.jpg`; files.push({ name: 'files/' + r.photoName, data: await exportPhoto(p, ph.clean, null, null, { maxPx: E.kmzBalloonPx, stamp: E.kmzStamp, quality: 0.85 }) }); }
      if (icons && ph && (ph.clean || ph.thumb)) { r.iconName = `icons/${p.id}.jpg`; files.push({ name: 'files/' + r.iconName, data: await iconJpeg(ph.clean || ph.thumb, E.kmzIconPx) }); }
      rows.push(r);
    }
    busy('Building KMZ…', 1);
    const kml = C.buildKml(rows, { project: `${S.project}${pmeta().purpose ? ` · ${pmeta().purpose}` : ''}`, photoIcons: icons, spans: E.kmzRoute ? routeModel().spans : [], stamped: !!E.kmzStamp, stampFields: E.stampFields });
    const parts = C.makeZipParts([{ name: 'doc.kml', data: kml }, ...files]);
    offerResult(new Blob(parts, { type: 'application/vnd.google-earth.kmz' }), fileBase() + '.kmz');
  }));

  $('doDxf').addEventListener('click', () => guard(async () => {
    const pts = needPoints(); if (!pts) return;
    let roads = [], note = '';
    if ($('dxfRoads').checked) {
      if (!navigator.onLine) note = 'Offline — exported without roads';
      else {
        busy('Downloading roads from OpenStreetMap…');
        try {
          const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 60000);
          const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', signal: ctl.signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(C.overpassQuery(pts, 250)) });
          clearTimeout(tm);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          roads = C.roadsFromOverpass(await r.json());
          note = `${roads.length} road segments added`;
        } catch (e) { note = 'Road download failed — exported poles only'; roads = []; }
      }
    }
    busy('Building DXF…');
    const dxf = C.buildDxf(pts, { zone: S.zone, symbolSize: S.sym, textHeight: S.txt, spans: routeModel().spans }, roads);
    offerResult(new Blob([dxf], { type: 'application/dxf' }), `${fileBase()}_UTM${S.zone}N.dxf`);
    if (note) toast(note, 4000);
  }));

  $('doCsv').addEventListener('click', () => guard(async () => {
    const pts = needPoints(); if (!pts) return;
    const names = uniqueNames(pts);
    const rows = pts.map((p) => ({ ...p, photoName: names[p.id] + '.jpg' }));
    offerResult(new Blob([C.buildCsv(rows, S.zone)], { type: 'text/csv' }), fileBase() + '.csv');
  }));

  $('doRouteXlsx').addEventListener('click', () => guard(async () => {
    const pts = needPoints(); if (!pts) return;
    const Rt = routeModel();
    if (!Rt.spans.length) { toast('No route yet. Use the route button on the map to link poles.', 4000); return; }
    const R = window.PoleReports, st = R.STYLES, lbl = (v) => ({ v, s: st.label });
    const longest = Rt.spans.reduce((m, s) => (s.len > m.len ? s : m), Rt.spans[0]);
    const summary = [
      [{ v: `ROUTE AND SPANS — ${S.project}`, s: st.title }],
      [lbl('Generated'), fmtTime(new Date().toISOString())],
      [lbl('Maximum span setting (m)'), pol().maxSpan || 200],
      [lbl('Angle pole from (°)'), pol().angleDeg || 15],
      [],
      [lbl('Total route length (m)'), Math.round(Rt.total * 10) / 10],
      [lbl('Spans'), Rt.spans.length],
      [lbl('Spans longer than maximum'), { v: Rt.long, s: Rt.long ? st.bad : st.good }],
      [lbl('Average span (m)'), Math.round((Rt.total / Rt.spans.length) * 10) / 10],
      [lbl('Longest span'), `${longest.from} → ${longest.to}: ${longest.len.toFixed(1)} m`],
      [],
      [lbl('Poles in project'), pts.length],
      [lbl('Terminal poles (1 span)'), Rt.terminal],
      [lbl('Inline poles'), Rt.inline],
      [lbl('Angle poles'), Rt.angle],
      [lbl('Junction poles (3+ spans)'), Rt.junction],
      [lbl('Poles not linked'), { v: Rt.off, s: Rt.off ? st.bad : st.cell }],
      [],
      [{ v: 'Span lengths are straight lines between pole pins, not cable lengths: add sag, slack and MLoop allowance per your design standard.', s: st.info }],
    ];
    const spanRows = [['No.', 'From', 'To', 'Length (m)', 'Longer than maximum', 'From lat', 'From lon', 'To lat', 'To lon'].map((v) => ({ v, s: st.header }))];
    Rt.spans.forEach((s, i) => spanRows.push([{ v: i + 1, s: st.center }, s.from, s.to, { v: Math.round(s.len * 10) / 10, s: s.long ? st.bad : st.cell },
      { v: s.long ? 'Yes' : 'No', s: s.long ? st.bad : st.cell }, { v: s.a.lat, s: st.coord }, { v: s.a.lon, s: st.coord }, { v: s.b.lat, s: st.coord }, { v: s.b.lon, s: st.coord }]));
    const poleRows = [['No.', 'Pole ID', 'Type', 'Role on route', 'Spans at pole', 'Deflection (°)', 'Latitude', 'Longitude', `UTM ${S.zone}N E`, `UTM ${S.zone}N N`].map((v) => ({ v, s: st.header }))];
    pts.forEach((p, i) => {
      const info = Rt.poles[p.id], u = C.utmForward(p.lat, p.lon, S.zone, p.lat < 0);
      poleRows.push([{ v: i + 1, s: st.center }, p.poleId, p.poleType || '', { v: info.role, s: info.role === 'Not on route' ? st.bad : st.cell }, info.degree,
        info.deflection == null ? '' : Math.round(info.deflection * 10) / 10, { v: p.lat, s: st.coord }, { v: p.lon, s: st.coord }, Math.round(u.E * 1000) / 1000, Math.round(u.N * 1000) / 1000]);
    });
    const parts = R.buildXlsxParts([
      { name: 'Summary', cols: [30, 44], rows: summary, merges: ['A1:B1', 'A19:B19'] },
      { name: 'Spans', cols: [6, 15, 15, 11, 12, 12, 13, 12, 13], rows: spanRows, freezeRow: 1, autoFilter: `A1:I${spanRows.length}` },
      { name: 'Poles', cols: [6, 15, 12, 14, 9, 11, 12, 13, 13, 13], rows: poleRows, freezeRow: 1, autoFilter: `A1:J${poleRows.length}` },
    ]);
    offerResult(new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase() + '_route.xlsx');
  }));

  /* ---- labeled photos for training a recognition model ---- */
  let dsScope = 'project';
  $('dsScope').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return; dsScope = c.dataset.v;
    $('dsScope').querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
  });
  const CAT_LABEL = { 'Pole': 'Pole', 'Cable / strand': 'Cable', 'MLoop': 'MLoop', 'NAP': 'NAP', 'Closure': 'Closure', 'ODF': 'ODF', 'ODC': 'ODC', 'Rack': 'Rack' };
  function datasetItems(recs) {
    const out = [], seen = new Set();
    const add = (pid, label, r, kind) => { if (!pid || !label || seen.has(pid)) return; seen.add(pid); out.push({ pid, label, r, kind }); };
    for (const r of recs) {
      if (r.kind !== 'acceptance') { add(r.id, 'Pole', r, 'survey photo'); continue; }
      photosOf(r).forEach((p) => add(p.pid, p.label === 'Overview' ? elemOf(r) : p.label === 'Detail' ? null : p.label, r, `${p.label} photo`));
      (r.defs || []).forEach((d) => { add(d.pid, CAT_LABEL[d.cat], r, 'defect photo'); add(d.afterPid, CAT_LABEL[d.cat], r, 'after photo'); });
    }
    return out;
  }
  $('doDataset').addEventListener('click', () => guard(async () => {
    const recs = dsScope === 'all' ? points.slice() : projPoints();
    const items = datasetItems(recs);
    if (!items.length) { toast('No labeled photos yet'); return; }
    const files = [], rows = [['file', 'label', 'project', 'element', 'element_id', 'source', 'taken']], counts = {}, n = {};
    for (let i = 0; i < items.length; i++) {
      busy(`Preparing photos ${i + 1} / ${items.length}`, i / items.length);
      const it = items[i], jpg = await pdfJpeg(it.pid, 640);
      if (!jpg) continue;
      const folder = C.safeName(it.label), key = `${folder}/${C.safeName(it.r.project)}_${C.safeName(it.r.poleId)}`;
      n[key] = (n[key] || 0) + 1;
      const name = `${key}_${n[key]}.jpg`;
      files.push({ name: `dataset/${name}`, data: jpg });
      rows.push([name, it.label, it.r.project, elemOf(it.r), it.r.poleId, it.kind, it.r.takenAt || '']);
      counts[it.label] = (counts[it.label] || 0) + 1;
    }
    const summary = Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}: ${v}`).join('\n');
    files.push({ name: 'dataset/labels.csv', data: window.PoleReports.csv(rows) });
    files.push({ name: 'dataset/README.txt', data: `PoleCam training photos\nExported ${new Date().toISOString()}\nOne folder per label; photos resized to 640 px. labels.csv lists every file.\n\nPhotos per label:\n${summary}\n\nAim for 200+ photos per label before training a model. Check a sample of each folder: a label is only as good as the photo slot it was taken in.\n` });
    offerResult(new Blob(C.makeZipParts(files), { type: 'application/zip' }), `${dsScope === 'all' ? 'PoleCam_all_projects' : C.safeName(S.project)}_training_photos_${stamp8()}.zip`);
    toast(`${files.length - 2} photos in ${Object.keys(counts).length} folders`, 3500);
  }));

  $('doPhotos').addEventListener('click', () => guard(async () => {
    const pts = needPoints(); if (!pts) return;
    if (isAcc()) {
      const M = accModel(), files = [], list = accPhotoList(M);
      for (let i = 0; i < list.length; i++) {
        busy(`Stamping photos ${i + 1} / ${list.length}`, i / list.length);
        const ph = await dbGet('photos', list[i].pid);
        if (ph && ph.clean) files.push({ name: list[i].name, data: await exportPhoto(list[i].rec, ph.clean, list[i].title, list[i].meta) });
      }
      offerResult(new Blob(C.makeZipParts(files), { type: 'application/zip' }), fileBase() + '_photos.zip');
      return;
    }
    const files = [], used = {};
    for (let i = 0; i < pts.length; i++) {
      busy(`Preparing photos ${i + 1} / ${pts.length}`, i / pts.length);
      const ph = await dbGet('photos', pts[i].id);
      if (!ph || !ph.clean) continue;
      let name = photoFileName(pts[i]), k = 2; const base = name;
      while (used[name.toLowerCase()]) name = `${base}_${k++}`;
      used[name.toLowerCase()] = 1;
      files.push({ name: name + '.jpg', data: await exportPhoto(pts[i], ph.clean) });
    }
    offerResult(new Blob(C.makeZipParts(files), { type: 'application/zip' }), fileBase() + '_photos.zip');
  }));

  /** Records + original photos of a project, as files for a backup ZIP (prefix '') or inside a shareable KMZ (prefix 'polecam/'). */
  async function projectFiles(name, prefix) {
    const pre = prefix || '', pts = points.filter((p) => p.project === name).sort((a, b) => (a.created < b.created ? -1 : 1));
    const files = [{ name: `${pre}points.json`, data: JSON.stringify({ app: 'PoleCam', version: 2, project: name, meta: pmeta(name), exported: new Date().toISOString(), by: byLine(), points: pts }, null, 1) }];
    const pids = [...new Set(pts.flatMap(allPids))];
    for (let i = 0; i < pids.length; i++) {
      busy(`Packing photos ${i + 1} / ${pids.length}`, i / pids.length);
      const ph = await dbGet('photos', pids[i]);
      if (ph && ph.clean) files.push({ name: `${pre}photos/${pids[i]}.jpg`, data: new Uint8Array(await ph.clean.arrayBuffer()) });
      if (ph && ph.thumb) files.push({ name: `${pre}thumbs/${pids[i]}.jpg`, data: new Uint8Array(await ph.thumb.arrayBuffer()) });
    }
    return files;
  }
  async function projectZip(name) { return new Blob(C.makeZipParts(await projectFiles(name)), { type: 'application/zip' }); }
  /** Opens a ZIP / KMZ. get(name) gives the bytes of one entry (or null). */
  async function zipReader(f) {
    const entries = C.readZip(new Uint8Array(await f.arrayBuffer())), byName = {};
    for (const en of entries) byName[en.name] = en;
    const get = async (name) => {
      const en = byName[name]; if (!en) return null;
      if (en.method === 0) return en.data;
      if (en.method === 8 && 'DecompressionStream' in window) {
        const st = new Blob([en.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(st).arrayBuffer());
      }
      throw new Error('Unsupported compression in the file');
    };
    return { names: Object.keys(byName), has: (n) => !!byName[n], get };
  }
  /** The PoleCam data inside a backup ZIP or a shareable KMZ: {meta, pre}. */
  async function readPackage(z) {
    const pre = z.has('polecam/points.json') ? 'polecam/' : z.has('points.json') ? '' : null;
    if (pre == null) throw new Error(z.names.some((n) => /\.kml$/i.test(n)) ? 'This KMZ has no PoleCam data. Export it again from PoleCam (Projects → Share the KMZ), or tick “Include the PoleCam data” under the KMZ options.' : 'This is not a PoleCam file');
    const meta = JSON.parse(new TextDecoder().decode(await z.get(`${pre}points.json`)));
    if (!meta || !Array.isArray(meta.points)) throw new Error('This is not a PoleCam file');
    return { meta, pre };
  }
  async function importPhotos(z, pre, recs) {
    const pids = [...new Set(recs.flatMap(allPids))];
    for (let i = 0; i < pids.length; i++) {
      busy(`Copying photos ${i + 1} / ${pids.length}`, i / pids.length);
      const clean = await z.get(`${pre}photos/${pids[i]}.jpg`), thumb = await z.get(`${pre}thumbs/${pids[i]}.jpg`);
      if (clean || thumb) await dbPut('photos', { id: pids[i], clean: clean && new Blob([clean], { type: 'image/jpeg' }), thumb: thumb && new Blob([thumb], { type: 'image/jpeg' }) });
    }
  }
  const STAGE_FROM = { Cleanup: ['PAT', 'Cleanup'], FAT: ['PAT', 'Cleanup', 'FAT'] };
  const STAGE_NAME = { PAT: 'PAT', Cleanup: 'defect cleanup', FAT: 'FAT', survey: 'survey' };
  /** Starts a defect cleanup or a FAT from a PAT / cleanup KMZ (or an older PAT ZIP) made on another phone. */
  async function importStageFile(f, stage, extraMeta, wantName) {
    busy('Reading file…');
    const z = await zipReader(f), { meta, pre } = await readPackage(z);
    const fm = meta.meta || {}, from = fm.mode === 'acceptance' ? fm.stage || 'PAT' : 'survey';
    if (!STAGE_FROM[stage].includes(from)) throw new Error(`This file is a ${STAGE_NAME[from]} project. A ${STAGE_NAME[stage]} starts from a ${STAGE_FROM[stage].map((x) => STAGE_NAME[x]).join(' or ')} KMZ.`);
    const pat = fm.fromPat || meta.project || 'PAT', base = wantName || `${pat} – ${stage}`;
    let name = base, k = 2;
    while (allProjects().includes(name)) name = `${base} (${k++})`;
    await importPhotos(z, pre, meta.points);
    const now = new Date().toISOString();
    const copies = meta.points.map((r) => ({ ...r, id: uid(), project: name, updated: now, patId: r.patId || r.id }));
    busy('Saving…');
    for (const c of copies) { await dbPut('points', c); points.push(c); }
    const { taskId, date, exports, links, ...rest } = fm;
    const extra = Object.fromEntries(Object.entries(extraMeta || {}).filter(([, v]) => v !== '' && v != null));
    S.meta = S.meta || {};
    S.meta[name] = { ...rest, mode: 'acceptance', stage, fromPat: pat, fromStage: from, fromFile: f.name || '', ...(stage === 'FAT' ? { inspector: rest.inspector || byLine() } : {}), ...extra };
    S.projects.push(name); S.project = name; persist();
    renderPoles(); fitProject(); busy(false);
    const open = copies.reduce((t, r) => t + openCount(r), 0), toCheck = copies.reduce((t, r) => t + counting(r).filter((d) => defStatusOf(d) === 'Rectified').length, 0);
    LOG.info('stage.import', { stage, from, records: copies.length, open, toCheck, mb: +(f.size / 1048576).toFixed(1) });
    toast(stage === 'Cleanup' ? `Defect cleanup started: ${open} open item${open === 1 ? '' : 's'} on ${copies.filter((r) => openCount(r)).length} pin${copies.length === 1 ? '' : 's'}. Tap a red pin to start.`
      : `FAT started: ${copies.length} element${copies.length === 1 ? '' : 's'} · ${toCheck} to verify · ${open} still open`, 5500);
    return name;
  }
  $('doBackup').addEventListener('click', () => guard(async () => {
    if (!needPoints()) return;
    offerResult(await projectZip(S.project), `${fileBase()}_BACKUP.zip`);
  }));
  $('doRestore').addEventListener('click', () => { $('restoreInput').value = ''; $('restoreInput').click(); });
  $('restoreInput').addEventListener('change', (e) => guard(async () => {
    const f = e.target.files[0]; if (!f) return;
    await restoreZip(f);
    $('exportScope').textContent = `Project “${S.project}” · ${projPoints().length} records`;
    $('accExports').hidden = !isAcc(); $('surveyExports').hidden = isAcc(); showExport('doBackup');
  }, 'Restore failed'));
  /** Restores a backup / PAT file into its project (merging with a project of the same name) and makes it current. */
  async function restoreZip(f, opts) {
    const o = opts || {};
    busy('Reading file…');
    const z = await zipReader(f), { meta, pre } = await readPackage(z);
    const fm = meta.meta || {}, kind = (m) => (m.mode === 'acceptance' ? m.stage || 'PAT' : 'survey');
    if (o.expectPat && kind(fm) !== 'PAT') throw new Error(`This file is ${kind(fm) === 'survey' ? 'a survey backup' : `a ${kind(fm)} project`}, not a PAT. On the PAT phone use Projects → Send this PAT to another phone.`);
    let proj = meta.project || (meta.points[0] && meta.points[0].project);
    if (proj && S.meta && S.meta[proj] && meta.meta && kind(S.meta[proj]) !== kind(fm)) { // same name, different kind of project: keep them apart
      const base = `${proj} (${kind(fm) === 'survey' ? 'survey' : kind(fm)} from file)`; let nm = base, k = 2;
      while (allProjects().includes(nm)) nm = `${base} ${k++}`;
      meta.points = meta.points.map((p) => ({ ...p, project: nm })); proj = nm;
    }
    let n = 0;
    for (const p of meta.points) {
      busy(`Restoring ${++n} / ${meta.points.length}`, n / meta.points.length);
      for (const pid of allPids(p)) {
        const clean = await z.get(`${pre}photos/${pid}.jpg`), thumb = await z.get(`${pre}thumbs/${pid}.jpg`);
        if (clean || thumb) await dbPut('photos', { id: pid, clean: clean && new Blob([clean], { type: 'image/jpeg' }), thumb: thumb && new Blob([thumb], { type: 'image/jpeg' }) });
      }
      await dbPut('points', p);
      const i = points.findIndex((x) => x.id === p.id); if (i >= 0) points[i] = p; else points.push(p);
    }
    if (proj) {
      if (!S.projects.includes(proj)) S.projects.push(proj);
      S.meta = S.meta || {};
      if (meta.meta && !S.meta[proj]) S.meta[proj] = meta.meta;
      else if (meta.meta) {
        if (meta.meta.people) S.meta[proj].people = { ...(S.meta[proj].people || {}), ...meta.meta.people };
        if (meta.meta.links) {
          const have = new Set((S.meta[proj].links || []).map(([x, y]) => [x, y].sort().join('|')));
          S.meta[proj].links = (S.meta[proj].links || []).concat(meta.meta.links.filter(([x, y]) => !have.has([x, y].sort().join('|'))));
        }
      }
      S.project = proj; persist();
    }
    renderPoles(); fitProject(); busy(false);
    toast(`Restored ${meta.points.length} records into “${S.project}”`, 4000);
    return proj;
  }

  /* ================= acceptance exports ================= */
  const STAGE_LONG = { PAT: 'Provisional Acceptance Test (PAT)', Cleanup: 'Defect cleanup (contractor rectification of the PAT punchlist)', FAT: 'Final Acceptance Test (FAT)' };
  const dateOnly = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }); };
  /** Numbered punchlist + stable photo file names for the current acceptance project. */
  function accModel() {
    const recs = projPoints(), m = pmeta(), stage = m.stage || 'PAT', base = {}, used = {};
    recs.forEach((r) => {
      const b = C.safeName(`${r.poleId}`); let n = b, k = 2;
      while (used[n.toLowerCase()]) n = `${b}_${k++}`;
      used[n.toLowerCase()] = 1; base[r.id] = n;
    });
    const items = []; let no = 0;
    recs.forEach((r) => (r.defs || []).forEach((d) => {
      no++;
      items.push({ no, r, d, defectName: d.pid ? `${base[r.id]}_item${no}_asfound.jpg` : '', afterName: d.afterPid ? `${base[r.id]}_item${no}_rectified.jpg` : '', verifyName: d.verifyPid ? `${base[r.id]}_item${no}_verified.jpg` : '' });
    }));
    const photoName = (r, i, p) => `${base[r.id]}_${i + 1}_${C.safeName(p.label)}.jpg`;
    // after the PAT, the dates of a stage are the dates of its own work (fixes, verifications, items found then)
    const fatTimes = stage !== 'PAT' ? items.flatMap((x) => [x.d.fixedStage === stage ? x.d.fixedAt : null, stage === 'FAT' ? x.d.verifiedAt : null, x.d.stage === stage ? x.d.foundAt : null]).filter(Boolean).sort() : [];
    const times = stage !== 'PAT' ? fatTimes : recs.map((r) => r.takenAt).filter(Boolean).sort();
    const first = times.length ? dateOnly(times[0]) : '', lastD = times.length ? dateOnly(times[times.length - 1]) : '';
    const counted = items.filter((x) => x.d.sev !== 'Note'), open = counted.filter((x) => !defDone(x.d));
    return { recs, items, base, photoName, m, stage, dates: first === lastD ? first : `${first} – ${lastD}`, fatFirst: fatTimes[0] || null, open, counted,
      withDef: recs.filter((r) => openCount(r) > 0).length, rectified: counted.filter((x) => x.d.status === 'Rectified').length,
      verified: counted.filter((x) => x.d.status === 'Verified').length, notes: items.length - counted.length,
      major: open.filter((x) => x.d.sev === 'Major').length, minor: open.filter((x) => x.d.sev !== 'Major').length };
  }
  function accPhotoList(M) {
    const list = [];
    M.recs.forEach((r) => photosOf(r).forEach((p, i) => list.push({ rec: r, pid: p.pid, name: M.photoName(r, i, p), title: `${r.poleId}  ·  ${elemOf(r)}  ·  ${p.label}`, meta: p.at ? p : null })));
    M.items.forEach((x) => {
      if (x.d.pid) list.push({ rec: x.r, pid: x.d.pid, name: x.defectName, title: `${x.r.poleId}  ·  Item ${x.no}  ·  AS FOUND  ·  ${x.d.cat}: ${x.d.item}`, meta: x.d.pidMeta || null });
      if (x.d.afterPid) list.push({ rec: x.r, pid: x.d.afterPid, name: x.afterName, title: `${x.r.poleId}  ·  Item ${x.no}  ·  RECTIFIED  ·  ${x.d.cat}: ${x.d.item}`, meta: x.d.afterMeta || null });
      if (x.d.verifyPid) list.push({ rec: x.r, pid: x.d.verifyPid, name: x.verifyName, title: `${x.r.poleId}  ·  Item ${x.no}  ·  VERIFIED  ·  ${x.d.cat}: ${x.d.item}`, meta: x.d.verifyMeta || null });
    });
    return list;
  }
  const PUNCH_HEAD = ['Item No.', 'Location ID', 'Element', 'Category', 'Deficiency', 'Code', 'Notes', 'Status', 'Found at', 'Date found', 'Date rectified',
    'Days to rectify', 'Rectified by', 'Date verified', 'Verified by', 'Rejections', 'Remarks', 'Latitude', 'Longitude', 'As-found photo', 'As-found photo taken', 'Rectified photo', 'Rectified photo taken', 'Rectified photo distance from pin (m)', 'Verified photo', 'Verified photo taken'];
  const PI = { status: 7, lat: 17, lon: 18 };
  const daysBetween = (a, b) => (a && b ? (Date.parse(b) - Date.parse(a)) / 86400000 : null);
  const distFromPin = (meta, r) => (meta && meta.lat != null ? haversine(meta, r) : null);
  function punchRows(M) {
    return M.items.map((x) => {
      const d = x.d, days = defDone(d) ? daysBetween(d.foundAt, d.fixedAt) : null, dist = distFromPin(d.afterMeta, x.r), rej = d.reopened || [];
      return [x.no, x.r.poleId, elemOf(x.r), d.cat, d.item, `${SEV_CODE[sevOf(d)]} (${sevOf(d)})`, d.notes || '', defStatusOf(d), d.stage || 'PAT',
        fmtTime(d.foundAt), defDone(d) && d.fixedAt ? fmtTime(d.fixedAt) : '', days != null ? Math.round(days * 10) / 10 : '', defDone(d) ? d.fixedBy || '' : '',
        d.status === 'Verified' && d.verifiedAt ? fmtTime(d.verifiedAt) : '', d.status === 'Verified' ? d.verifiedBy || '' : '',
        rej.length ? rej.map((q) => `${shortTime(q.at)}${q.by ? ' ' + q.by : ''}: ${q.reason || 'no reason given'}`).join(' | ') : '',
        d.remarks || '', x.r.lat, x.r.lon, x.defectName, d.pidMeta ? fmtTime(d.pidMeta.at) : '', x.afterName, d.afterMeta ? fmtTime(d.afterMeta.at) : '',
        dist != null ? Math.round(dist) : '', x.verifyName, d.verifyMeta ? fmtTime(d.verifyMeta.at) : ''];
    });
  }
  const ELEM_HEAD = ['No.', 'Element', 'Location ID', 'With MLoop', 'With NAP', 'NAP ID', 'With closure', 'Closure ID', 'ODF', 'Status', 'Open items', 'Total items', 'Latitude', 'Longitude', 'GPS accuracy (m)', 'Pin adjusted', 'Captured', 'Photos'];
  function elemRows(M) {
    return M.recs.map((r, i) => {
      const pole = elemOf(r) === 'Pole', yn = (v) => (pole ? (v ? 'Yes' : 'No') : '');
      return [i + 1, elemOf(r), r.poleId, yn(r.mloop), yn(r.nap), r.nap ? r.napId || '' : '', yn(r.closure), r.closure ? r.closureId || '' : '',
        elemOf(r) === 'ODF' ? `${r.odf || 'New'}` : '', STATUS_TEXT[recStatus(r)], openCount(r), (r.defs || []).length, r.lat, r.lon,
        Number.isFinite(r.accuracy) ? Math.round(r.accuracy * 10) / 10 : '', r.adjusted ? 'Yes' : 'No', fmtTime(r.takenAt),
        photosOf(r).map((p, k) => M.photoName(r, k, p)).join(', ')];
    });
  }
  const peopleOf = () => Object.values(pmeta().people || {});
  const peopleText = () => peopleOf().map((x) => `${x.name}${x.company ? ` (${x.company})` : ''}`).join('; ');
  const summaryText = (M) => `${M.recs.length} elements inspected · ${M.withDef} with open deficiency · ${M.counted.length} deficiencies (${M.open.length} open, ${M.rectified} rectified awaiting verification, ${M.verified} verified)${M.notes ? ` · ${M.notes} notes` : ''} · open major ${M.major} / minor ${M.minor}`;
  const accFileBase = (M) => {
    const pn = C.safeName(S.project);
    return new RegExp(`(^|[_-])${M.stage}([_-]|$)`, 'i').test(pn) ? `${pn}_${stamp8()}` : `${pn}_${M.stage}_${stamp8()}`;
  };

  /* ---- the office form: model shared by the PDF and the Excel output ---- */
  const longDate = (v) => { if (!v) return ''; const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v); return isNaN(d) ? String(v) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); };
  const todayIso = () => { const d = new Date(), p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const PHOTO_SIZE = { S: { h: 150, px: 520 }, M: { h: 200, px: 720 }, L: { h: 250, px: 960 } };
  let logoCache = null;
  /** Company logos printed in the form header (bundled with the app, so the form looks the same offline). */
  async function formLogos() {
    if (logoCache) return logoCache;
    const get = async (u) => { try { const r = await fetch(u); if (!r.ok) return null; return new Uint8Array(await r.arrayBuffer()); } catch (e) { return null; } };
    logoCache = { left: await get('brand/logo-left.jpg'), right: await get('brand/logo-right.jpg') };
    return logoCache;
  }
  const itemText = (x) => `${x.r.poleId}${elemOf(x.r) !== 'Pole' ? ` (${elemOf(x.r)})` : ''} — ${x.d.cat}: ${x.d.item}${x.d.notes ? ` (${x.d.notes})` : ''}`;
  const rectifiedDate = (d) => (defDone(d) ? longDate(d.fixedAt || d.verifiedAt) : '');
  /** Header + rows of the LIST OF DEFICIENCIES form, as the office template has them. */
  function formModel(M, o) {
    const m = M.m, insp = m.date ? longDate(m.date) : M.stage !== 'PAT' ? (M.fatFirst ? longDate(M.fatFirst) : '') : (M.recs.length ? longDate(M.recs[0].takenAt) : '');
    const signDate = o.dates === 'today' ? longDate(todayIso()) : o.dates === 'insp' ? insp : '';
    return {
      form: pol().form, logos: o.logos, stage: M.stage === 'FAT' ? 'FAT' : 'PAT', typesChecked: m.inspTypes || pol().inspTypes,
      location: m.site || '', project: (M.stage !== 'PAT' && m.fromPat) || S.project, vendor: m.contractor || '', date: insp,
      items: M.items.map((x) => ({ no: x.no, code: SEV_CODE[sevOf(x.d)], text: itemText(x), rectified: rectifiedDate(x.d) })),
      signers: { left: { name: m.vendorRep || '', date: signDate }, right: { name: m.globeRep || '', date: signDate } },
      footer: `${S.project} · ${M.stage} · generated with PoleCam ${shortTime(new Date().toISOString())}${byLine() ? ' by ' + byLine() : ''}`,
    };
  }
  $('doXlsx').addEventListener('click', () => guard(async () => {
    if (!needPoints()) return;
    const M = accModel(), R = window.PoleReports, st = R.STYLES, E = S.exp;
    busy('Building workbook…');
    const sheets = [window.PoleForms.deficiencyFormSheet(formModel(M, { logos: await formLogos(), dates: E.pdfDates }))];
    if (E.xlsTable) {
      const lbl = (v) => ({ v, s: st.label });
      const rows = [
        [{ v: `PUNCHLIST TRACKER — ${STAGE_LONG[M.stage]}`, s: st.title }],
        [lbl('Project'), null, { v: S.project }, null, null, lbl('Location / site'), null, { v: M.m.site || '' }],
        [lbl('Vendor (contractor)'), null, { v: M.m.contractor || '' }, null, null, lbl('Globe representative'), null, { v: M.m.globeRep || '' }],
        [lbl('Inspected by'), null, { v: M.m.inspector || '' }, null, null, lbl('Inspection date'), null, { v: M.dates }],
        [lbl('Generated'), null, { v: fmtTime(new Date().toISOString()) }, null, null, lbl(M.m.fromPat ? 'PAT reference' : ''), null, { v: M.m.fromPat || '' }],
        [{ v: summaryText(M), s: st.info }],
        [],
        PUNCH_HEAD.map((v) => ({ v, s: st.header })),
      ];
      const statusStyle = (v) => (v === 'Verified' || v === 'OK' || v === STATUS_TEXT.OK || v === STATUS_TEXT.Verified ? st.good : v === 'Open' || v === STATUS_TEXT.Open ? st.bad : st.cell);
      punchRows(M).forEach((r) => rows.push(r.map((v, ci) => ({ v, s: ci === 0 ? st.center : ci === PI.status ? statusStyle(v) : ci === PI.lat || ci === PI.lon ? st.coord : st.cell }))));
      const LC = R.colName(PUNCH_HEAD.length - 1), merges = [`A1:${LC}1`, `A6:${LC}6`];
      for (let rr = 2; rr <= 5; rr++) merges.push(`A${rr}:B${rr}`, `C${rr}:E${rr}`, `F${rr}:G${rr}`, `H${rr}:K${rr}`);
      sheets.push({ name: 'Punchlist', cols: [7, 15, 9, 13, 34, 11, 30, 11, 8, 17, 17, 9, 16, 17, 16, 34, 24, 12, 13, 28, 17, 28, 17, 12, 28, 17], rows, merges, freezeRow: 8,
        autoFilter: `A8:${LC}${8 + Math.max(1, M.items.length)}` });
      const erows = [ELEM_HEAD.map((v) => ({ v, s: st.header }))];
      elemRows(M).forEach((r) => erows.push(r.map((v, ci) => ({ v, s: ci === 0 ? st.center : ci === 9 ? statusStyle(v) : ci === 12 || ci === 13 ? st.coord : st.cell }))));
      sheets.push({ name: 'Elements', cols: [6, 9, 15, 10, 9, 14, 11, 14, 10, 15, 9, 9, 12, 13, 10, 10, 17, 40], rows: erows, freezeRow: 1,
        autoFilter: `A1:${R.colName(ELEM_HEAD.length - 1)}${Math.max(2, erows.length)}` });
    }
    if (E.xlsPhotos) {
      const head = ['File name (in the photo ZIP / KMZ)', 'Location ID', 'Element', 'Photo', 'Item No.', 'Taken', 'Taken by', 'GPS latitude', 'GPS longitude', 'GPS accuracy (m)', 'Distance from pin (m)'];
      const prows = [head.map((v) => ({ v, s: st.header }))];
      accPhotoList(M).forEach((p) => {
        const mt = p.meta || {}, dist = distFromPin(p.meta, p.rec), item = /Item (\d+)/.exec(p.title);
        prows.push([p.name, p.rec.poleId, elemOf(p.rec), p.title.split('  ·  ').slice(2).join(' · '), item ? +item[1] : '', mt.at ? fmtTime(mt.at) : '', mt.by || '',
          mt.lat != null ? mt.lat : '', mt.lon != null ? mt.lon : '', Number.isFinite(mt.acc) ? Math.round(mt.acc * 10) / 10 : '', dist != null ? Math.round(dist) : '']
          .map((v, ci) => ({ v, s: ci === 7 || ci === 8 ? st.coord : st.cell })));
      });
      sheets.push({ name: 'Photos', cols: [38, 14, 9, 36, 8, 18, 20, 13, 13, 10, 10], rows: prows, freezeRow: 1, autoFilter: `A1:K${Math.max(2, prows.length)}` });
    }
    const people = [['Name', 'Company', 'Mobile', 'Email'].map((v) => ({ v, s: st.header }))];
    peopleOf().forEach((x) => people.push([x.name, x.company, x.mobile, x.email]));
    sheets.push({ name: 'People', cols: [28, 28, 18, 32], rows: people, freezeRow: 1 });
    const parts = R.buildXlsxParts(sheets);
    offerResult(new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), accFileBase(M) + '_deficiency_list.xlsx');
  }));

  $('doAccCsv').addEventListener('click', () => guard(async () => {
    if (!needPoints()) return;
    const M = accModel();
    const out = window.PoleReports.csv([PUNCH_HEAD, ...punchRows(M).map((r) => r.map((v, i) => ((i === PI.lat || i === PI.lon) && typeof v === 'number' ? v.toFixed(8) : v)))]);
    offerResult(new Blob([out], { type: 'text/csv' }), accFileBase(M) + '_punchlist.csv');
  }));

  /** Smaller JPEG for the PDF so a report with hundreds of photos stays shareable. */
  async function pdfJpeg(pid, maxPx, stampLines, stampColor) {
    const ph = await dbGet('photos', pid).catch(() => null);
    if (!ph || !ph.clean) return null;
    const im = await loadImage(ph.clean), { w, h } = dims(im), sc = Math.min(1, maxPx / Math.max(w, h));
    const cv = document.createElement('canvas'); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0, cv.width, cv.height); if (im.close) im.close();
    if (stampLines && stampLines.length) { // time + place burned into the picture itself
      const fs = Math.max(12, Math.round(cv.width * 0.032)), lh = fs * 1.3, pad = fs * 0.6, bandH = pad * 2 + lh * stampLines.length;
      g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(0, cv.height - bandH, cv.width, bandH);
      g.fillStyle = stampColor || '#4dabf7'; g.fillRect(0, cv.height - bandH, Math.max(4, fs * 0.3), bandH);
      g.fillStyle = '#fff'; g.textBaseline = 'top';
      stampLines.forEach((t, i) => { g.font = `${i ? '' : '700 '}${fs}px sans-serif`; g.fillText(t, pad * 1.5, cv.height - bandH + pad + i * lh, cv.width - pad * 3); });
    }
    return new Uint8Array(await (await toBlob(cv, 0.72)).arrayBuffer());
  }
  const shortTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  const fmtDays = (d) => (d == null ? '' : d < 1 / 24 ? `${Math.max(1, Math.round(d * 1440))} min` : d < 1 ? `${(d * 24).toFixed(1)} h` : `${d.toFixed(1)} days`);
  function metaLines(meta, r, verb) {
    if (!meta) return ['Photo time and place not recorded (taken before v1.3)'];
    const dist = distFromPin(meta, r);
    return [`${verb} ${shortTime(meta.at)}`,
      meta.lat != null ? `GPS ${meta.lat.toFixed(6)}, ${meta.lon.toFixed(6)}${Number.isFinite(meta.acc) ? ` ±${Math.round(meta.acc)} m` : ''} · ${fmtDist(dist)} from pin` : 'No GPS recorded',
      ...(meta.by ? [`By ${meta.by}`] : []),
      ...(meta.q && meta.q.flags && meta.q.flags.length ? [`Kept despite camera warning: ${meta.q.flags.join(', ')}`] : [])];
  }
  /** Annex A block for one punchlist item: as found → rectified → verified, with what is still pending. */
  async function evidenceBlock(x, px) {
    const d = { ...x.d, foundAt: x.d.foundAt || x.r.takenAt }, r = x.r, stt = defStatusOf(d), rej = d.reopened || []; // older records: found when the element was photographed
    const stages = [];
    const foundL = `AS FOUND (${d.stage || 'PAT'})`, rectL = 'RECTIFIED (CONTRACTOR)', verL = `VERIFIED (${d.verifyStage || (stt === 'Verified' ? d.stage || 'PAT' : 'FAT')})`;
    const last = rej[rej.length - 1];
    stages.push(d.pid
      ? { label: foundL, tone: 'bad', jpeg: await pdfJpeg(d.pid, px, [`AS FOUND · ${r.poleId} · item ${x.no}`, d.pidMeta ? shortTime(d.pidMeta.at) : shortTime(d.foundAt)], '#c92a2a'),
        lines: [`Found ${shortTime(d.foundAt)} (${d.stage || 'PAT'})${d.foundBy ? ` by ${d.foundBy}` : ''}`, ...metaLines(d.pidMeta, r, 'Photo').slice(1)] }
      : { label: foundL, tone: stt === 'Note' ? 'muted' : 'bad', plain: stt === 'Note', jpeg: null, note: stt === 'Note' ? 'No photo' : 'No photo taken when the deficiency was recorded', lines: [`Found ${shortTime(d.foundAt)}${d.foundBy ? ` by ${d.foundBy}` : ''}`] });
    if (stt === 'Note') stages.push({ label: rectL, tone: 'muted', pending: true, note: 'Not required — observation only', lines: [] }, { label: verL, tone: 'muted', pending: true, note: 'Not required', lines: [] });
    else {
      if (defDone(d)) stages.push(d.afterPid
        ? { label: rectL, tone: 'blue', jpeg: await pdfJpeg(d.afterPid, px, [`RECTIFIED · ${r.poleId} · item ${x.no}`, d.afterMeta ? shortTime(d.afterMeta.at) : ''].filter(Boolean), '#1971c2'),
          lines: [`Rectified ${shortTime(d.fixedAt)}${d.fixedBy ? ` by ${d.fixedBy}` : ''}`, ...metaLines(d.afterMeta, r, 'Photo').slice(1)] }
        : { label: rectL, tone: 'blue', jpeg: null, note: 'Marked rectified without a photo', lines: [`Rectified ${shortTime(d.fixedAt)}${d.fixedBy ? ` by ${d.fixedBy}` : ''}`] });
      else if (last && last.pid) stages.push({ label: `${rectL} · REJECTED`, tone: 'bad', jpeg: await pdfJpeg(last.pid, px, [`REJECTED · ${r.poleId} · item ${x.no}`, last.meta ? shortTime(last.meta.at) : ''].filter(Boolean), '#c92a2a'),
        lines: [`Rectification of ${shortTime(last.fixedAt || last.at)}${last.fixedBy ? ` by ${last.fixedBy}` : ''} rejected ${shortTime(last.at)}${last.by ? ` by ${last.by}` : ''}: ${last.reason || 'no reason given'}`, ...(rej.length > 1 ? [`Rejected ${rej.length} times in all`] : [])] });
      else stages.push({ label: rectL, tone: 'blue', pending: true, note: rej.length ? 'Rectification rejected — pending again' : 'Pending rectification', lines: rej.length ? [`Rejected ${rej.length}×, last ${shortTime(last.at)}${last.by ? ` by ${last.by}` : ''}: ${last.reason || 'no reason given'}`] : [] });
      if (stt === 'Verified') stages.push(d.verifyPid
        ? { label: verL, tone: 'good', jpeg: await pdfJpeg(d.verifyPid, px, [`VERIFIED · ${r.poleId} · item ${x.no}`, d.verifyMeta ? shortTime(d.verifyMeta.at) : ''].filter(Boolean), '#2b8a3e'),
          lines: [`Verified ${shortTime(d.verifiedAt)}${d.verifiedBy ? ` by ${d.verifiedBy}` : ''}`, ...metaLines(d.verifyMeta, r, 'Photo').slice(1)] }
        : { label: verL, tone: 'good', jpeg: null, plain: true, note: 'Verified on site without a photo', lines: [`Verified ${shortTime(d.verifiedAt)}${d.verifiedBy ? ` by ${d.verifiedBy}` : ''}`] });
      else stages.push({ label: verL, tone: 'good', pending: true, note: stt === 'Rectified' ? 'Awaiting verification' : 'Pending', lines: [] });
    }
    const statusText = { Open: rej.length ? 'OPEN — REJECTED' : 'OPEN', Rectified: 'RECTIFIED — TO VERIFY', Verified: 'VERIFIED', Note: 'NOTE' }[stt] || stt;
    const tone = { Open: 'bad', Rectified: 'blue', Verified: 'good', Note: 'muted' }[stt];
    return { no: x.no, loc: r.poleId, element: elemOf(r), code: SEV_CODE[sevOf(d)], text: `${d.cat}: ${d.item}${d.notes ? ' — ' + d.notes : ''}`, status: statusText, statusTone: tone, remarks: d.remarks, stages };
  }
  $('doPdf').addEventListener('click', () => guard(async () => {
    if (!needPoints()) return;
    const M = accModel(), E = S.exp, size = PHOTO_SIZE[E.pdfPhotoSize] || PHOTO_SIZE.M;
    const model = formModel(M, { logos: await formLogos(), dates: E.pdfDates });
    model.photoH = size.h;
    if (E.pdfAnnexA) {
      model.annexA = [];
      for (let i = 0; i < M.items.length; i++) { busy(`Annex A · item ${i + 1} / ${M.items.length}`, i / Math.max(1, M.items.length + M.recs.length)); model.annexA.push(await evidenceBlock(M.items[i], size.px)); }
    }
    if (E.pdfAnnexB) {
      model.annexB = [];
      for (let i = 0; i < M.recs.length; i++) {
        const r = M.recs[i]; busy(`Annex B · element ${i + 1} / ${M.recs.length}`, (M.items.length + i) / Math.max(1, M.items.length + M.recs.length));
        for (const p of photosOf(r)) {
          const jpeg = await pdfJpeg(p.pid, size.px); if (!jpeg) continue;
          model.annexB.push({ jpeg, caption: `${r.poleId} · ${elemOf(r)} · ${p.label}`, sub: `${p.at ? shortTime(p.at) : shortTime(r.takenAt)}${p.by ? ' · ' + p.by : ''} · ${STATUS_TEXT[recStatus(r)]}` });
        }
      }
    }
    busy('Building PDF…');
    const pdf = window.PoleForms.deficiencyFormPdf(model);
    offerResult(new Blob(pdf.output({ title: `${S.project} ${M.stage} list of deficiencies` }), { type: 'application/pdf' }), accFileBase(M) + '_deficiency_list.pdf');
  }));

  $('doRectPdf').addEventListener('click', () => guard(async () => {
    if (!needPoints()) return;
    const M = accModel(), total = M.counted.length;
    if (!total) { toast('No deficiencies in this project — nothing to rectify'); return; }
    const withOpen = $('rectOpen').checked;
    const rect = M.counted.filter((x) => defDone(x.d)).sort((a, b) => (Date.parse(a.d.fixedAt) || 0) - (Date.parse(b.d.fixedAt) || 0));
    const open = M.counted.filter((x) => !defDone(x.d));
    const noEvidence = rect.filter((x) => !x.d.afterPid);
    const days = rect.map((x) => daysBetween(x.d.foundAt, x.d.fixedAt)).filter((v) => v != null && v >= 0);
    const avg = days.length ? days.reduce((s, v) => s + v, 0) / days.length : null;
    // progress by rectification date
    const byDate = []; let cum = 0;
    rect.forEach((x) => {
      const dt = x.d.fixedAt ? new Date(x.d.fixedAt).toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : 'Date not recorded';
      cum++;
      const last = byDate[byDate.length - 1];
      if (last && last.date === dt) { last.count++; last.cum = cum; last.pct = cum / total; } else byDate.push({ date: dt, count: 1, cum, pct: cum / total });
    });
    const head = (x) => `#${x.no}  ${x.r.poleId} · ${elemOf(x.r)}`;
    const defect = (x) => `${x.d.cat}: ${x.d.item}${x.d.notes ? ' — ' + x.d.notes : ''}  ·  ${sevOf(x.d)}  ·  found at ${x.d.stage || 'PAT'}`;
    const items = [];
    const n = rect.length + (withOpen ? open.length : 0); let k = 0;
    for (const x of rect) {
      busy(`Preparing photos ${++k} / ${n}`, k / n);
      const d = x.d, dd = daysBetween(d.foundAt, d.fixedAt);
      items.push({ head: head(x), defect: defect(x), right: `${d.status === 'Verified' ? 'Verified · r' : 'R'}ectified in ${fmtDays(dd)}`, remarks: d.remarks,
        before: { jpeg: d.pid ? await pdfJpeg(d.pid, 800, [`BEFORE · ${x.r.poleId} · item ${x.no}`, d.pidMeta ? shortTime(d.pidMeta.at) : `Found ${shortTime(d.foundAt)}`], '#c92a2a') : null,
          lines: [`Found ${shortTime(d.foundAt)} (${d.stage || 'PAT'})${d.foundBy ? ` by ${d.foundBy}` : ''}`, ...(d.pid ? metaLines(d.pidMeta, x.r, 'Photo taken').slice(1, 2) : ['No defect photo'])] },
        after: d.afterPid ? { jpeg: await pdfJpeg(d.afterPid, 800, [`AFTER · ${x.r.poleId} · item ${x.no}`, d.afterMeta ? shortTime(d.afterMeta.at) : ''].filter(Boolean), '#1971c2'),
          lines: metaLines(d.afterMeta, x.r, 'Rectified · photo taken') } : null,
        missingAfter: d.afterPid ? null : ['No after photo', `Marked rectified ${shortTime(d.fixedAt)}`, d.fixedBy ? `by ${d.fixedBy}` : '', 'without photo evidence'].filter(Boolean) });
    }
    const openItems = [];
    if (withOpen) for (const x of open) {
      busy(`Preparing photos ${++k} / ${n}`, k / n);
      const d = x.d, age = daysBetween(d.foundAt, new Date().toISOString()), rej = d.reopened || [];
      openItems.push({ head: head(x), defect: defect(x), right: `Open for ${fmtDays(age)}${rej.length ? ` · rejected ${rej.length}×` : ''}`, remarks: [rej.length ? `Rejected ${shortTime(rej[rej.length - 1].at)}${rej[rej.length - 1].by ? ' by ' + rej[rej.length - 1].by : ''}: ${rej[rej.length - 1].reason || 'no reason given'}` : '', d.remarks].filter(Boolean).join(' · '),
        before: { jpeg: d.pid ? await pdfJpeg(d.pid, 500) : null, lines: [`Found ${shortTime(d.foundAt)}${d.foundBy ? ` by ${d.foundBy}` : ''}`] } });
    }
    const times = M.items.flatMap((x) => [x.d.foundAt, x.d.fixedAt]).filter(Boolean).sort();
    const note = [{ text: `${rect.length - noEvidence.length} of ${rect.length} rectified items have an after photo taken in the app (live camera, GPS within ${fmtDist(PIN_LIMIT_M)} of the element).`, bold: true }];
    if (noEvidence.length) note.push({ text: `${noEvidence.length} item${noEvidence.length === 1 ? ' was' : 's were'} marked rectified without an after photo: #${noEvidence.map((x) => x.no).join(', #')}.`, tone: 'bad', bold: true });
    busy('Building PDF…');
    const pdf = window.PoleReports.rectificationPdf({
      title: 'PUNCHLIST RECTIFICATION REPORT', stageLong: `${STAGE_LONG[M.stage]} · status of contractor rectification`,
      footer: `${S.project} · rectification report · generated ${shortTime(new Date().toISOString())}`,
      info: [['Project', S.project], ['Site / cluster', M.m.site], ['Contractor', M.m.contractor], ['Globe representative', M.m.globeRep],
        ['PAT reference', M.m.fromPat || (M.stage === 'PAT' ? S.project : '')], ['Report period', times.length ? `${fmtTime(times[0])} – ${fmtTime(times[times.length - 1])}` : ''],
        ['Generated', shortTime(new Date().toISOString())], ['Generated by', byLine() || M.m.inspector || ''], ['Recorded by', peopleText()]],
      summary: [['Deficiencies', total], ['Rectified', rect.length, rect.length ? 'blue' : ''], ['Of which verified', M.verified, M.verified ? 'good' : ''], ['Still open', open.length, open.length ? 'bad' : 'good'],
        ['Cleared', `${Math.round((rect.length / total) * 100)}%`, rect.length === total ? 'good' : ''], ['Average time to rectify', avg == null ? '—' : fmtDays(avg)]],
      note, progress: byDate, rectified: items, open: openItems,
      signers: ['Submitted by (contractor representative)', 'Verified by (Globe representative)', 'Noted by'],
    });
    offerResult(new Blob(pdf.output({ title: `${S.project} rectification report` }), { type: 'application/pdf' }), `${accFileBase(M)}_rectification_report.pdf`);
  }));

  async function statusIcon(color) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 48;
    const g = cv.getContext('2d');
    g.beginPath(); g.arc(24, 24, 18, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.stroke();
    return new Uint8Array(await (await new Promise((r) => cv.toBlob(r, 'image/png'))).arrayBuffer());
  }
  $('doAccKmz').addEventListener('click', () => guard(async () => {
    if (!needPoints()) return;
    const M = accModel();
    offerResult(await buildAccKmz(M, S.exp.kmzData !== false), accFileBase(M) + '.kmz');
  }));
  /** Acceptance KMZ: doc.kml for Google Earth first, then (withData) the PoleCam records and original photos for the next stage. */
  async function buildAccKmz(M, withData) {
    const E = S.exp, list = E.kmzBalloonPx > 0 ? accPhotoList(M) : [], files = [], byRec = {};
    for (let i = 0; i < list.length; i++) {
      busy(`Preparing photos ${i + 1} / ${list.length}`, i / list.length);
      const ph = await dbGet('photos', list[i].pid);
      if (!ph || !ph.clean) continue;
      files.push({ name: `files/photos/${list[i].name}`, data: await exportPhoto(list[i].rec, ph.clean, list[i].title, list[i].meta, { maxPx: E.kmzBalloonPx, stamp: E.kmzStamp, quality: 0.85 }) });
      (byRec[list[i].rec.id] = byRec[list[i].rec.id] || []).push(`photos/${list[i].name}`);
    }
    const icons = { Open: 'icons/open.png', Rectified: 'icons/rectified.png', Verified: 'icons/verified.png', OK: 'icons/ok.png' };
    for (const [k, path] of Object.entries(icons)) files.push({ name: `files/${path}`, data: await statusIcon(STATUS_COLORS[k]) });
    const recs = [], onPhoto = (r, f) => !!E.kmzStamp && (byRec[r.id] || []).length > 0 && (!E.stampFields || E.stampFields.includes(f));
    for (const r of M.recs) {
      let icon = null;
      if (E.kmzIconPx > 0) { const first = photosOf(r)[0], ph = first && await dbGet('photos', first.pid).catch(() => null); if (ph && (ph.clean || ph.thumb)) { icon = `icons/${r.id}.jpg`; files.push({ name: `files/${icon}`, data: await iconJpeg(ph.clean || ph.thumb, E.kmzIconPx, STATUS_COLORS[recStatus(r)]) }); } }
      recs.push({ id: r.id, name: r.poleId, title: `${r.poleId} · ${elemOf(r)} · ${STATUS_TEXT[recStatus(r)]}`, status: recStatus(r), lat: r.lat, lon: r.lon, icon,
        // coordinates and time are left out when the balloon photos already carry them in their stamp
        detailsHtml: [...attachText(r), ...(onPhoto(r, 'coords') ? [] : [`Coordinates: ${r.lat.toFixed(7)}, ${r.lon.toFixed(7)}`]), ...(onPhoto(r, 'time') ? [] : [`Captured: ${fmtTime(r.takenAt)}`])].map(C.xmlEsc).join('<br/>'),
        photos: byRec[r.id] || [],
        defs: M.items.filter((x) => x.r === r).map((x) => ({ no: x.no, text: `${x.d.cat}: ${x.d.item}${x.d.notes ? ' — ' + x.d.notes : ''}`, sev: sevOf(x.d), status: defStatusOf(x.d) })) });
    }
    const data = withData ? await projectFiles(S.project, 'polecam/') : [];
    busy('Building KMZ…', 1);
    const kml = window.PoleReports.acceptanceKml(recs, { name: `${S.project} · ${M.stage}`, icons });
    return new Blob(C.makeZipParts([{ name: 'doc.kml', data: kml }, ...files, ...data]), { type: 'application/vnd.google-earth.kmz' });
  }

  /* ================= settings ================= */
  async function refreshStorageInfo() {
    try { const n = await dbCount('tiles'); $('tileInfo').textContent = n ? `${n.toLocaleString()} street-map tiles kept from online use (refreshed after 7 days).` : 'No street-map tiles kept yet.'; } catch (e) { $('tileInfo').textContent = '–'; }
    const packs = Object.values(S.packs || {}).filter((p) => p.done), packMB = packs.reduce((a, p) => a + (p.size || 0), 0);
    $('packInfo').textContent = packs.length ? `${packs.length} offline map pack${packs.length === 1 ? '' : 's'} (${fmtMB(packMB)}): ${packs.map((p) => p.name).join(', ')}.` : 'No offline map pack on this phone.';
    const P = S.perf;
    $('perfInfo').hidden = !P;
    if (P) $('perfInfo').textContent = `Last photo (${fmtTime(P.at)}): camera ${((P.capture || 0) / 1000).toFixed(1)} s${P.px ? ` (${P.px})` : ''} · check ${((P.check || 0) / 1000).toFixed(1)} s · prepare ${P.prepare != null ? (P.prepare / 1000).toFixed(1) + ' s' : '–'} · save ${((P.save || 0) / 1000).toFixed(1)} s`;
    const n = points.length, np = allProjects().length;
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const per = navigator.storage.persisted ? await navigator.storage.persisted() : false;
        $('storeInfo').textContent = `${n} record${n === 1 ? '' : 's'} in ${np} project${np === 1 ? '' : 's'}. Using ${fmtMB(est.usage || 0)}; this phone currently lets PoleCam use up to about ${fmtMB(est.quota || 0)}. ${per ? 'Protected from automatic cleanup.' : 'Not yet protected from automatic cleanup.'}`;
        $('storeSub').textContent = `${n} record${n === 1 ? '' : 's'} · ${fmtMB(est.usage || 0)} used of about ${fmtMB(est.quota || 0)}`;
      } catch (e) { $('storeSub').textContent = `${n} record${n === 1 ? '' : 's'} in ${np} project${np === 1 ? '' : 's'}`; }
    } else $('storeSub').textContent = `${n} record${n === 1 ? '' : 's'} in ${np} project${np === 1 ? '' : 's'}`;
  }
  const QUAL_NAME = { strict: 'Strict', normal: 'Normal' };
  const effectiveQuality = () => ((S.team ? pol().quality : S.quality) === 'normal' ? 'normal' : 'strict');
  function renderSettingsHome() {
    renderWho(); renderTeamInfo(); cloudSync(false).then(renderCloudInfo);
    $('camSub').textContent = `${S.readId !== false ? 'ID scan after each photo' : 'No ID scan'} · ${S.idOrient === 'v' ? 'vertical' : 'horizontal'} IDs · sharpness ${QUAL_NAME[effectiveQuality()] || 'Strict'}${S.team ? ' (set by admin)' : ''}`;
    const packs = Object.values(S.packs || {}).filter((p) => p.done);
    $('mapsSub').textContent = `${streetSource().name}${packs.length ? ` · ${packs.length} offline pack${packs.length === 1 ? '' : 's'}${S.base === 'offline' ? ' (in use)' : ''}` : ' · no offline pack yet'}`;
    const P = pol();
    $('policyInfo').textContent = S.team ? `Policies from “${S.team.name}” v${S.team.rev}: admin company ${P.owner || 'not set (everyone may manage and verify)'} · max span ${P.maxSpan} m · angle from ${P.angleDeg}° · photo check ${QUAL_NAME[P.quality] || 'Strict'}.` : 'No company list yet: the built-in defaults apply (max span 200 m, strict photo check).';
    $('adminRowTitle').textContent = S.team ? `${S.team.name}` : 'Company list and policies';
    refreshStorageInfo();
  }
  $('settingsBtn').addEventListener('click', () => { renderSettingsHome(); renderLog(); openSheet('settings'); });
  $('setMyTypes').addEventListener('change', () => {
    S.myTypes = parseTypeLines($('setMyTypes').value).filter((t) => !BUILTIN_TYPES.some((b) => b.p === t.p)); persist(); refreshTypes();
    $('setMyTypes').value = typeLines(S.myTypes); renderTypeInfo();
  });
  function renderTypeInfo() { $('typeInfo').textContent = poleTypes().map((t) => `${t.n} ${t.p}-`).join(' · '); }
  $('goCamera').addEventListener('click', () => {
    $('setMyTypes').value = typeLines(S.myTypes); renderTypeInfo();
    $('setReadId').checked = S.readId !== false; $('setOrient').value = S.idOrient === 'v' ? 'v' : 'h';
    $('setQuality').value = effectiveQuality(); $('setQuality').disabled = !!S.team;
    $('qualityNote').textContent = S.team ? `Set by the admin in the company list “${S.team.name}” — the same on every phone.` : 'Until this phone takes a company list, you can choose this yourself.';
    openSheet('setCamera');
  });
  $('setReadId').addEventListener('change', () => { S.readId = $('setReadId').checked; persist(); });
  $('setOrient').addEventListener('change', () => { S.idOrient = $('setOrient').value === 'v' ? 'v' : 'h'; persist(); });
  $('setQuality').addEventListener('change', () => { if (S.team) return; S.quality = $('setQuality').value; persist(); });
  /* export defaults: the same control appears on the Export screen (first id) and under Settings (second id) */
  const EXP_PAIRS = [['setMaxPx', 'setMaxPx2', 'maxPx', 'num'], ['expQuality', 'expQuality2', 'quality', 'num'], ['setStamp', 'setStamp2', 'stamp', 'bool'], ['expNaming', 'expNaming2', 'naming', 'str'],
    ['kmzBalloonPx', 'kmzBalloonPx3', 'kmzBalloonPx', 'num'], ['kmzBalloonPx2', 'kmzBalloonPx3', 'kmzBalloonPx', 'num'], ['kmzIconPx', 'kmzIconPx3', 'kmzIconPx', 'num'], ['kmzIconPx2', 'kmzIconPx3', 'kmzIconPx', 'num'],
    ['kmzRoute', 'kmzRoute2', 'kmzRoute', 'bool'], ['kmzStamp', 'kmzStamp3', 'kmzStamp', 'bool'], ['kmzStamp2', 'kmzStamp3', 'kmzStamp', 'bool'],
    ['pdfPhotoSize', 'pdfPhotoSize2', 'pdfPhotoSize', 'str'], ['pdfAnnexA', 'pdfAnnexA2', 'pdfAnnexA', 'bool'], ['pdfAnnexB', 'pdfAnnexB2', 'pdfAnnexB', 'bool'],
    ['pdfDates', 'xlsDates', 'pdfDates', 'str'], ['xlsTable', null, 'xlsTable', 'bool'], ['xlsPhotos', null, 'xlsPhotos', 'bool'], ['kmzData', null, 'kmzData', 'bool']];
  const expIds = {};
  EXP_PAIRS.forEach(([a, b, key, kind]) => { [a, b].filter(Boolean).forEach((id) => { const l = (expIds[key] = expIds[key] || []); if (!l.some((x) => x[0] === id)) l.push([id, kind]); }); });
  function syncExpUi() {
    Object.entries(expIds).forEach(([key, ids]) => ids.forEach(([id, kind]) => {
      const el = $(id); if (!el) return;
      if (kind === 'bool') { el.checked = !!S.exp[key]; return; }
      el.value = String(S.exp[key]);
      if (el.value !== String(S.exp[key])) { S.exp[key] = DEF.exp[key]; el.value = String(S.exp[key]); persist(); } // a value this version no longer offers
    }));
    ['stampFields', 'stampFields2'].forEach((id) => $(id).querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(S.exp.stampFields.includes(c.dataset.v)))));
    [['setZone', 'setZone2', 'zone'], ['setSym', 'setSym2', 'sym'], ['setTxt', 'setTxt2', 'txt']].forEach(([a, b, key]) => { $(a).value = String(S[key]); $(b).value = String(S[key]); });
  }
  Object.entries(expIds).forEach(([key, ids]) => ids.forEach(([id, kind]) => {
    const el = $(id); if (!el) return;
    el.addEventListener('change', () => { S.exp[key] = kind === 'bool' ? el.checked : kind === 'num' ? +el.value : el.value; persist(); syncExpUi(); });
  }));
  ['stampFields', 'stampFields2'].forEach((id) => $(id).addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    const set = new Set(S.exp.stampFields); if (set.has(c.dataset.v)) set.delete(c.dataset.v); else set.add(c.dataset.v);
    S.exp.stampFields = DEF.exp.stampFields.filter((f) => set.has(f)); persist(); syncExpUi();
  }));
  [['setZone', 'setZone2']].forEach((ids) => ids.forEach((id) => $(id).addEventListener('change', () => { S.zone = +$(id).value; persist(); syncExpUi(); $('dxfZoneLbl').textContent = `UTM ${S.zone}N`; })));
  [['setSym', 'sym'], ['setSym2', 'sym'], ['setTxt', 'txt'], ['setTxt2', 'txt']].forEach(([id, key]) => $(id).addEventListener('change', () => { const v = +$(id).value; if (v > 0) { S[key] = v; persist(); } syncExpUi(); }));
  syncExpUi();
  $('goExports').addEventListener('click', () => {
    syncExpUi();
    $('setSaveBase').value = S.saveBase || 'DOCUMENTS'; $('setSaveFolder').value = S.saveFolder || 'PoleCam'; $('setSaveByProject').checked = S.saveByProject !== false;
    updateSavePreview(); openSheet('setExports');
  });
  function updateSavePreview() {
    $('savePreview').textContent = NATIVE ? `Files go to: ${savePath('…').shown.replace(/\/…$/, '/')}` : 'Website version: your browser saves to its Downloads folder.';
    ['setSaveBase', 'setSaveFolder', 'setSaveByProject'].forEach((id) => { $(id).disabled = !NATIVE; });
  }
  $('setSaveBase').addEventListener('change', () => { S.saveBase = $('setSaveBase').value; persist(); updateSavePreview(); });
  $('setSaveFolder').addEventListener('change', () => { S.saveFolder = $('setSaveFolder').value.trim() || 'PoleCam'; persist(); updateSavePreview(); });
  $('setSaveByProject').addEventListener('change', () => { S.saveByProject = $('setSaveByProject').checked; persist(); updateSavePreview(); });
  $('goMaps').addEventListener('click', () => $('offlineBtn').click());
  $('goMaps2').addEventListener('click', () => $('offlineBtn').click());
  $('goStorage').addEventListener('click', async () => { openSheet('setStorage'); await refreshStorageInfo(); });
  $('goAdmin').addEventListener('click', () => {
    if (canManage()) openAdmin('manage');
    else if (!S.team) { if (!S.user || !S.user.name) { toast('Enter your details first (Account), then create the list', 4000); openProfile(false); } else openAdmin('create'); }
    else showPolicies();
  });
  /** What a user (not an admin) sees of the list: who the admins are, the policies, and how to get updates. */
  function showPolicies() {
    const t = S.team, P = pol(), F = formText();
    ask(`${t.name} · version ${t.rev}`, [`Admin company: ${P.owner || (t.admins && t.admins.length ? `not set (admins: ${t.admins.map((a) => a.n).join(', ')})` : 'not set')}`, `${teamCos().length} companies on the list`,
      `Form: ${F.company} · ${F.title}`, `Max span ${P.maxSpan} m · angle pole from ${P.angleDeg}° · photo check ${QUAL_NAME[P.quality] || 'Strict'}`,
      '', `Only staff of ${P.owner || 'the admin company'} with the admin PIN can change these. Use “Update list” to take the latest version.`].join('\n'), [{ label: 'Close', value: true, primary: true }]);
  }
  /* ================= you + company list ================= */
  /* Everyone enters their name, mobile, email and company once. Company names come from a list kept by an admin on
     the admin's own phone. The list travels offline (QR code or a small file) and is signed with the admin's key, so a
     phone accepts later updates only from an admin already on its list. Nothing is uploaded anywhere. */
  /** A list must be well formed before it is stored: a crafted list could otherwise break the settings screen. */
  function validTeam(b) {
    const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
    const ke = b && b.keyEnc;
    return !!b && b.t === 'polecam-team' && str(b.id, 40) && str(b.name, 100) && Number.isInteger(b.rev) && b.rev >= 1
      && Array.isArray(b.admins) && b.admins.length <= 20 && (b.admins.length >= 1 || str(b.key, 200))
      && b.admins.every((a) => !!a && str(a.n, 100) && str(a.k, 200) && (a.c == null || (typeof a.c === 'string' && a.c.length <= 100)))
      && (b.key == null || str(b.key, 200)) && (b.prevKey == null || str(b.prevKey, 200))
      && (ke == null || (typeof ke === 'object' && str(ke.salt, 60) && str(ke.iv, 40) && str(ke.data, 2000)))
      && Array.isArray(b.co) && b.co.length >= 1 && b.co.length <= 300 && b.co.every((c) => str(c, 100))
      && (b.src == null || (typeof b.src === 'object' && /^https:\/\/\S+$/.test(String(b.src.url || '')) && String(b.src.url).length <= 300 && (b.src.key == null || str(b.src.key, 100))))
      && (b.pol == null || validPol(b.pol));
  }
  /** Policies travel inside the signed list; each field is checked so a crafted list cannot break the app. */
  function validPol(p) {
    if (!p || typeof p !== 'object' || JSON.stringify(p).length > 60000) return false;
    const str = (v, max) => v == null || (typeof v === 'string' && v.length <= max);
    const num = (v, lo, hi) => v == null || (typeof v === 'number' && v >= lo && v <= hi);
    const list = (v, max, each) => v == null || (Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length <= each));
    if (!str(p.owner, 100) || !num(p.maxSpan, 5, 1000) || !num(p.angleDeg, 1, 90) || !num(p.autoGap, 10, 5000) || !str(p.quality, 10) || !list(p.inspTypes, 10, 60)) return false;
    if (p.form != null) { if (typeof p.form !== 'object') return false; for (const [k, v] of Object.entries(p.form)) { if (k === 'types' ? !list(v, 10, 60) : k === 'codes' ? !(v && typeof v === 'object') : k === 'rowsPerPage' ? v !== 15 : !str(v, 200)) return false; } } // the form layout holds 15 rows per page
    if (p.defects != null) { if (typeof p.defects !== 'object' || Object.keys(p.defects).length > 20) return false; for (const v of Object.values(p.defects)) if (!list(v, 60, 120)) return false; }
    if (p.poleTypes != null && !(Array.isArray(p.poleTypes) && p.poleTypes.length <= 20 && p.poleTypes.every((t) => t && /^[A-Z]{2,6}$/.test(t.p) && str(t.n, 30)))) return false;
    if (p.packs != null && !(Array.isArray(p.packs) && p.packs.length <= 30 && p.packs.every((x) => x && str(x.n, 60) && typeof x.d === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(x.d) && num(x.mb, 0, 100000)))) return false;
    return true;
  }
  if (S.team && !validTeam(S.team)) { S.team = null; persist(); }
  /** Short code that tells two lists apart even when their names look the same. */
  const listCode = (b) => { const id = String(b.id).replace(/[^A-Za-z0-9]/g, ''); return `${id.slice(0, 4)}-${id.slice(-4)}`.toUpperCase(); };
  const teamCos = () => {
    if (S.team && S.team.src && S.cloud && S.cloud.src === S.team.src.url && S.cloud.companies.length) return S.cloud.companies; // online sheet
    return S.team && Array.isArray(S.team.co) ? S.team.co : [];
  };
  const profileOk = () => !!(S.user && S.user.name && S.user.mobile && S.user.email && S.user.company && (!teamCos().length || teamCos().includes(S.user.company)));
  const isAdmin = () => !!(S.adminKey && S.team && (S.team.key === S.adminKey.pub || (S.team.admins || []).some((a) => a.k === S.adminKey.pub)));
  const signerName = () => (S.team ? (S.team.key ? `the admin company${S.team.pol && S.team.pol.owner ? ` (${S.team.pol.owner})` : ''}` : S.team.admins && S.team.admins[S.team.k] ? S.team.admins[S.team.k].n : 'admin') : 'admin');
  let profileFirst = false;
  function renderCoSelect(sel) {
    const cos = teamCos(), box = $('pfCompany');
    if (!cos.length) { box.innerHTML = '<option value="">No company list on this phone yet</option>'; box.disabled = true; }
    else {
      box.disabled = false;
      box.innerHTML = '<option value="">Choose your company…</option>' + cos.map((c) => `<option${c === sel ? ' selected' : ''}>${C.xmlEsc(c)}</option>`).join('');
    }
    const own = pol().owner;
    $('pfTeam').textContent = S.team ? `List “${S.team.name}” v${S.team.rev}${own ? ` · ${own} is the admin company (its staff need the admin PIN)` : ''}.${sel && !cos.includes(sel) ? ` “${sel}” is no longer on the list: choose again.` : ''}` : '';
    $('pfJoin').hidden = !!cos.length;
  }
  function openProfile(first) {
    profileFirst = !!first;
    const u = S.user || {};
    $('pfName').value = u.name || (S.userName ? S.userName.split('·')[0].trim() : '');
    $('pfMobile').value = u.mobile || ''; $('pfEmail').value = u.email || '';
    renderCoSelect(u.company || '');
    $('profBack').hidden = profileFirst;
    $('profTitle').textContent = profileFirst ? 'Welcome to PoleCam' : 'Your details';
    $('profIntro').textContent = profileFirst
      ? 'Before the first photo, enter your details. They are recorded on every photo and report, and stay on this phone.'
      : 'Recorded on every photo, pole and punchlist item from now on. Records already saved keep the name they were saved with.';
    $('pfErr').hidden = true;
    if (stack[stack.length - 1] !== 'profile') openSheet('profile');
  }
  const mobileOk = (m) => /^\+?\d{7,15}$/.test(m.replace(/[\s\-().]/g, ''));
  $('pfSave').addEventListener('click', async () => {
    const name = $('pfName').value.trim().replace(/\s+/g, ' '), mobile = $('pfMobile').value.trim().replace(/\s+/g, ' ');
    const email = $('pfEmail').value.trim(), company = $('pfCompany').value;
    const err = name.length < 3 ? 'Enter your full name.' : !mobileOk(mobile) ? 'Enter your mobile number, e.g. 0917 123 4567 or +63 917 123 4567.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? 'Enter a valid email address.'
        : !company ? (teamCos().length ? 'Choose your company.' : 'Get the company list from your admin first (below).') : '';
    if (err) { $('pfErr').textContent = err; $('pfErr').hidden = false; return; }
    const own = pol().owner;
    if (own && company.toLowerCase() === own.toLowerCase() && hasListKey(S.team) && !isAdmin()) { // the admin company is for its own staff
      const pin = await askPin(`Admin PIN of ${own}`, `${own} is the admin company. Its staff enter the admin PIN once; contractors choose their own company.`);
      if (pin == null) return;
      const jwk = await decPriv(S.team.keyEnc, pin);
      if (!jwk) { $('pfErr').textContent = `Wrong admin PIN. Only ${own} staff with the PIN can choose ${own}.`; $('pfErr').hidden = false; return; }
      S.adminKey = { pub: S.team.key, priv: jwk };
    }
    S.user = { name, mobile, email: email.toLowerCase(), company }; persist();
    profileFirst = false; await closeSheet();
    renderWho(); toast(`Saved: ${byLine()}`);
  });
  function renderWho() {
    const u = S.user;
    $('whoBox').textContent = u ? u.name : 'Enter your details';
    $('whoSub').textContent = u ? `${u.company} · ${u.mobile} · ${u.email}${isInspector() && pol().owner ? ' · inspector' : ''}` : 'Name, mobile, email and company';
  }
  $('editMe').addEventListener('click', () => openProfile(false));

  /* ---- signing and packing the list ---- */
  const b64u = {
    enc: (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    dec: (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; },
  };
  const EC = { name: 'ECDSA', namedCurve: 'P-256' }, SIG = { name: 'ECDSA', hash: 'SHA-256' }, enc8 = (t) => new TextEncoder().encode(t);
  function cryptoOk() { if (window.crypto && crypto.subtle) return true; toast('This needs a secure (https) page or the Android app', 5000); return false; }
  async function newAdminKey() {
    const kp = await crypto.subtle.generateKey(EC, true, ['sign', 'verify']);
    S.adminKey = { pub: b64u.enc(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), priv: await crypto.subtle.exportKey('jwk', kp.privateKey) };
    persist();
  }
  async function signText(text) {
    const key = await crypto.subtle.importKey('jwk', S.adminKey.priv, EC, false, ['sign']);
    return b64u.enc(new Uint8Array(await crypto.subtle.sign(SIG, key, enc8(text))));
  }
  async function verifyText(text, sig, pub) {
    try { const key = await crypto.subtle.importKey('raw', b64u.dec(pub), EC, false, ['verify']); return await crypto.subtle.verify(SIG, key, b64u.dec(sig), enc8(text)); } catch (e) { return false; }
  }
  async function packShare(kind, obj) {
    const json = JSON.stringify(obj);
    if ('CompressionStream' in window) {
      try { const z = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer(); return `${kind}1:${b64u.enc(new Uint8Array(z))}`; } catch (e) { /* plain below */ }
    }
    return `${kind}0:${b64u.enc(enc8(json))}`;
  }
  async function unpackShare(text) {
    const m = /^(PCT|PCA)([01]):([A-Za-z0-9_-]+)$/.exec(String(text || '').trim());
    if (!m) return null;
    const raw = b64u.dec(m[3]);
    const json = m[2] === '1' ? new TextDecoder().decode(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : new TextDecoder().decode(raw);
    return { kind: m[1], obj: JSON.parse(json) };
  }
  /* The list's private key travels inside the list, encrypted with the admin PIN (PBKDF2 → AES-GCM). */
  async function pinKey(pin, saltB64) {
    const base = await crypto.subtle.importKey('raw', enc8(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64u.dec(saltB64), iterations: 120000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encPriv(jwk, pin) {
    const salt = b64u.enc(crypto.getRandomValues(new Uint8Array(16))), iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pinKey(pin, salt), enc8(JSON.stringify(jwk))));
    return { salt, iv: b64u.enc(iv), data: b64u.enc(data) };
  }
  async function decPriv(ke, pin) {
    try { const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.dec(ke.iv) }, await pinKey(pin, ke.salt), b64u.dec(ke.data)); return JSON.parse(new TextDecoder().decode(out)); }
    catch (e) { return null; }
  }

  /* ---- small dialog ---- */
  function ask(title, text, buttons) {
    const btns = buttons || [{ label: 'Cancel', value: false }, { label: 'OK', value: true, primary: true }];
    $('askTitle').textContent = title; $('askText').textContent = text || '';
    const row = $('askBox').querySelector('.row'); row.innerHTML = '';
    return new Promise((res) => {
      btns.forEach((b) => {
        const el = document.createElement('button'); el.type = 'button'; el.className = `btn grow${b.primary ? ' primary' : ''}`; el.textContent = b.label;
        el.addEventListener('click', () => { $('askBox').hidden = true; res(b.value); });
        row.appendChild(el);
      });
      $('askBox').hidden = false;
    });
  }

  /* ---- accepting a list ---- */
  /** allowSwitch: false on the update path, where only a newer version of the same list (from one of its admins) is taken. */
  async function acceptTeam(obj, allowSwitch) {
    let body;
    try { body = JSON.parse(obj.b); } catch (e) { body = null; }
    if (!validTeam(body)) throw new Error('This is not a PoleCam company list');
    const signer = obj.k === -1 ? (body.key ? { n: 'admin company', k: body.key } : null) : obj.k === -2 ? (body.prevKey ? { n: 'admin company', k: body.prevKey } : null) : Number.isInteger(obj.k) ? body.admins[obj.k] : null;
    if (!signer || !(await verifyText(obj.b, obj.s, signer.k))) throw new Error('Not accepted: this company list is damaged or was changed after it was signed');
    const seen = (S.teamSeen = S.teamSeen || {})[body.id] || 0;
    if (body.rev < seen) throw new Error(`Not accepted: this is version ${body.rev} of “${body.name}”, older than version ${seen} this phone already had`);
    const cur = S.team;
    if (cur && cur.id === body.id) {
      if (body.rev <= cur.rev) return { same: true, msg: `This phone already has the latest list (version ${cur.rev})` };
      const trusted = [cur.key, ...(cur.admins || []).map((a) => a.k)].filter(Boolean);
      if (!trusted.includes(signer.k)) throw new Error(`Not accepted: this update of “${cur.name}” was not made with its admin PIN${signer.n !== 'admin company' ? ` (signed by ${signer.n})` : ''}`);
    } else {
      if (cur && !allowSwitch) throw new Error(`Not accepted: this is a different company list (code ${listCode(body)}), not an update of “${cur.name}” (code ${listCode(cur)}). To change lists, use Settings → Administration → Switch to another list.`);
      const ok = await ask(cur ? 'Switch to a different company list?' : 'Use this company list?',
        `${body.name} (code ${listCode(body)})\n${body.pol && body.pol.owner ? `Admin company: ${body.pol.owner}` : body.admins.length ? `Admin${body.admins.length === 1 ? '' : 's'}: ${body.admins.map((a) => a.n).join(', ')}` : 'No admin company set'}\n${body.co.length} compan${body.co.length === 1 ? 'y' : 'ies'}: ${body.co.slice(0, 8).join(', ')}${body.co.length > 8 ? ', …' : ''}`
        + (cur ? `\n\nThis is NOT an update of “${cur.name}” (code ${listCode(cur)}): it is another list, made by whoever holds its admin key. Switch only if your admin told you to.` : ''),
        [{ label: 'Cancel', value: false }, { label: cur ? 'Switch' : 'Use this list', value: true, primary: true }]);
      if (!ok) return { cancelled: true };
    }
    const wasAdmin = isAdmin();
    S.team = { ...body, b: obj.b, s: obj.s, k: obj.k }; S.teamSeen[body.id] = Math.max(seen, body.rev); persist();
    const note = wasAdmin && !isAdmin() && cur && cur.id === body.id ? ' The admin PIN was changed: enter the new PIN under Manage to stay an admin.' : '';
    return { ok: true, msg: `Company list “${body.name}” version ${body.rev}: ${body.co.length} compan${body.co.length === 1 ? 'y' : 'ies'}.${note}` };
  }
  let teamSwitch = false; // set only by Settings → Switch to another list (or when the phone has no list yet)
  async function importTeamText(text) {
    if (!cryptoOk()) return false;
    let p = null;
    try { p = await unpackShare(text); } catch (e) { p = null; }
    if (!p) { toast('That is not a PoleCam company list', 4000); return false; }
    if (p.kind !== 'PCT') { toast('That is an admin request from an older version. Since v2.1 admins are the staff of the admin company: choose that company in your profile and enter the admin PIN.', 6000); return false; }
    try {
      const r = await acceptTeam(p.obj, teamSwitch || !S.team);
      if (r.cancelled) return false;
      toast(r.msg, 4500); afterTeamChange();
      if (S.team.src) cloudSync(true).then(() => { afterTeamChange(); if (!$('profile').hidden) renderCoSelect($('pfCompany').value); });
      return true;
    } catch (e) { toast(e.message, 6500); return false; }
  }
  function afterTeamChange() {
    refreshTypes();
    renderTeamInfo();
    if (!$('profile').hidden) renderCoSelect($('pfCompany').value || (S.user && S.user.company) || '');
    if (S.user && S.user.company && teamCos().length && !teamCos().includes(S.user.company)) {
      toast(`“${S.user.company}” is not on the new company list. Choose your company again.`, 5000);
      if ($('profile').hidden) openProfile(true);
    }
  }
  function renderTeamInfo() {
    const t = S.team;
    const own = t && t.pol && t.pol.owner;
    $('teamInfo').textContent = t ? `“${t.name}” v${t.rev} · ${teamCos().length} compan${teamCos().length === 1 ? 'y' : 'ies'} · ${own ? `admin company ${own}` : t.key ? 'no admin company' : `admin${t.admins.length === 1 ? '' : 's'}: ${t.admins.map((a) => a.n).join(', ')}`}${isAdmin() ? ' · you are an admin' : isInspector() && own ? ' · your company' : ' · contractor user'}`
      : 'No company list on this phone yet. Get it from your admin, or create it if you are the admin.';
    $('teamShare').hidden = !t;
    $('adminLock').textContent = isAdmin() ? 'ADMIN' : canManage() ? 'PIN' : t ? 'VIEW' : 'SET UP';
    $('teamManage').hidden = !canManage();
    $('teamCreate').hidden = !!t;
    $('teamSwitch').hidden = !t;
    renderCloudInfo();
  }
  $('teamFileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    let text = await f.text();
    try { const j = JSON.parse(text); if (j && j.data) text = j.data; } catch (err) { /* plain text file */ }
    try { await importTeamText(text); } finally { teamSwitch = false; }
  });
  const openTeamFile = (sw) => { teamSwitch = !!sw; $('teamFileInput').value = ''; $('teamFileInput').click(); };
  async function scanTeamQr(sw) {
    const t = await scanQr('Point the camera at the company list QR code on the admin’s phone');
    if (!t) return;
    teamSwitch = !!sw; try { await importTeamText(t); } finally { teamSwitch = false; }
  }
  $('pfScan').addEventListener('click', () => scanTeamQr(false));
  $('pfFile').addEventListener('click', () => openTeamFile(false));
  async function getList(sw) {
    const how = await ask(sw ? 'Switch to another company list' : 'Update the company list',
      sw ? 'Only do this if your admin gave you a new, different list. Scan its QR code or open its file.' : 'Scan the QR code on an admin’s phone, or open the list file the admin sent you.',
      [{ label: 'Cancel', value: '' }, { label: 'Open file', value: 'file' }, { label: 'Scan QR', value: 'scan', primary: true }]);
    if (how === 'scan') scanTeamQr(sw); else if (how === 'file') openTeamFile(sw);
  }
  $('teamUpdate').addEventListener('click', () => getList(false));
  $('teamSwitch').addEventListener('click', () => getList(true));
  $('teamShare').addEventListener('click', () => showTeamQr());

  /* ---- showing a QR code / sharing the file ---- */
  let qrFileData = null;
  async function showQr(title, note, text, file) {
    $('qrTitle').textContent = title; $('qrText').textContent = note || '';
    qrFileData = file || null; $('qrFile').hidden = !file;
    const box = $('qrImg'); box.innerHTML = '';
    if (text.length > 2300 || !window.qrcode) box.innerHTML = '<p class="hint" style="color:#333">Too much for one QR code. Use Share as file.</p>';
    else { const q = window.qrcode(0, 'L'); q.addData(text); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
    openSheet('qrShow');
  }
  async function showTeamQr(note) {
    if (!S.team) { toast('No company list on this phone yet'); return; }
    const text = await packShare('PCT', { b: S.team.b, s: S.team.s, k: S.team.k });
    await showQr(`Company list: ${S.team.name}`, note || `Version ${S.team.rev} · ${teamCos().length} companies. On the other phone: Settings → Administration → Update list → Scan QR (or, on first use, “Scan admin's QR code”).`, text,
      { name: `PoleCam_company_list_${C.safeName(S.team.name)}_v${S.team.rev}.json`, data: JSON.stringify({ app: 'PoleCam', type: 'company-list', name: S.team.name, version: S.team.rev, data: text }) });
  }
  $('qrClose').addEventListener('click', () => closeSheet());
  $('qrFile').addEventListener('click', async () => {
    if (!qrFileData) return;
    await shareFile(new Blob([qrFileData.data], { type: 'application/json' }), qrFileData.name, 'application/json');
  });

  /* ---- scanning a QR code ---- */
  let qrStream = null, qrResolve = null, qrTimer = 0;
  const scripts = {};
  const loadScript = (src) => scripts[src] || (scripts[src] = new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => { delete scripts[src]; rej(new Error('Could not load ' + src)); }; document.head.appendChild(el); }));
  async function scanQr(text) {
    $('qrScanText').textContent = text || 'Point the camera at the QR code';
    openSheet('qrScan');
    try { qrStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } }); }
    catch (e) { await closeSheet(); toast('Camera blocked: open the list file instead', 4500); return null; }
    if ($('qrScan').hidden) { qrStream.getTracks().forEach((t) => t.stop()); qrStream = null; return null; }
    const v = $('qrVideo'); v.srcObject = qrStream; await v.play().catch(() => {});
    let det = null;
    if ('BarcodeDetector' in window) { try { if ((await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; } }
    if (!det) { try { await loadScript('vendor/qr/jsQR.min.js'); } catch (e) { await closeSheet(); toast(e.message); return null; } }
    const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
    return new Promise((res) => {
      qrResolve = res;
      const tick = async () => {
        if (!qrResolve) return;
        let txt = null;
        if (v.videoWidth) {
          try {
            if (det) { const r = await det.detect(v); if (r.length) txt = r[0].rawValue; }
            else {
              const sc = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight));
              cv.width = Math.round(v.videoWidth * sc); cv.height = Math.round(v.videoHeight * sc); g.drawImage(v, 0, 0, cv.width, cv.height);
              const r = window.jsQR(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' });
              if (r && r.data) txt = r.data;
            }
          } catch (e) { /* keep looking */ }
        }
        if (txt && qrResolve) { const done = qrResolve; qrResolve = null; await closeSheet(); done(txt); return; }
        qrTimer = setTimeout(tick, 180);
      };
      tick();
    });
  }
  function stopQrScan() {
    clearTimeout(qrTimer);
    if (qrStream) { qrStream.getTracks().forEach((t) => t.stop()); qrStream = null; }
    $('qrVideo').srcObject = null;
    if (qrResolve) { const r = qrResolve; qrResolve = null; r(null); }
  }
  $('qrScanClose').addEventListener('click', () => closeSheet());

  /* ---- online Google Sheet (Apps Script web app): companies, assigned tasks and map pack links ---- */
  /* The sheet's address and read key travel inside the signed company list, so phones that take the admin's list also
     know where to read. Only those three lists come from the sheet; photos and survey data stay on the phones. */
  const TASK_CATS = ['Survey', 'PAT', 'Cleanup', 'FAT'];
  const s100 = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 100);
  function cleanCloud(j) {
    const companies = [...new Set((Array.isArray(j.companies) ? j.companies : []).map((c) => s100(c)).filter(Boolean))].slice(0, 500);
    const tasks = (Array.isArray(j.tasks) ? j.tasks : []).filter((t) => t && typeof t === 'object').map((t) => {
      const raw = s100(t.category).toLowerCase(), cat = /clean|rectif/.test(raw) ? 'Cleanup' : TASK_CATS.find((c) => c.toLowerCase() === raw) || 'Survey';
      return { id: s100(t.id, 40), project: s100(t.project), category: cat, site: s100(t.site), contractor: s100(t.contractor), globeRep: s100(t.globeRep),
        company: s100(t.company), status: s100(t.status, 20) || 'Active', notes: s100(t.notes, 300) };
    }).filter((t) => t.id && t.project).slice(0, 500);
    const packs = (Array.isArray(j.packs) ? j.packs : []).filter((p) => p && typeof p === 'object').map((p) => ({ name: s100(p.name), link: s100(p.link, 300), sizeMB: +p.sizeMB || 0, notes: s100(p.notes, 200) }))
      .filter((p) => p.link).slice(0, 50);
    return { name: s100(j.name), companies, tasks, packs };
  }
  let cloudBusy = null, cloudErr = '';
  async function cloudRequest(src, init) {
    const u = new URL(src.url);
    if (!init) { u.searchParams.set('key', src.key || ''); u.searchParams.set('v', APP_VER); }
    try {
      const r = await withTimeout(fetch(u.href, { cache: 'no-store', redirect: 'follow', ...(init || {}) }), 25000, 'The online sheet did not answer');
      return await r.json();
    } catch (e) {
      if (!NATIVE) throw e; // the APK can also ask through Android's own HTTP stack
      const r = await withTimeout(nativeCall('CapacitorHttp', 'request', { url: u.href, method: init ? 'POST' : 'GET', responseType: 'json',
        headers: { 'User-Agent': APP_UA(), ...(init ? { 'Content-Type': 'text/plain;charset=utf-8' } : {}) }, ...(init ? { data: init.body } : {}) }), 25000, 'The online sheet did not answer');
      return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    }
  }
  /** Reads the online sheet (at most every 10 minutes unless forced). Returns true when this phone has a fresh copy. */
  function cloudSync(force) {
    const src = S.team && S.team.src;
    if (!src || !src.url || !navigator.onLine) return Promise.resolve(false);
    if (!force && S.cloud && S.cloud.src === src.url && Date.now() - Date.parse(S.cloud.at) < 10 * 60000) return Promise.resolve(true);
    if (cloudBusy) return cloudBusy;
    cloudBusy = (async () => {
      try {
        const j = await cloudRequest(src);
        if (!j || !j.ok) throw new Error(j && j.error === 'key' ? 'the sheet refused the read key' : `unexpected answer${j && j.error ? ` (${j.error})` : ''}`);
        S.cloud = { src: src.url, at: new Date().toISOString(), ...cleanCloud(j) }; cloudErr = ''; persist();
        afterTeamChange(); if (!$('projects').hidden) renderTasks();
        return true;
      } catch (e) { cloudErr = e.message || String(e); renderCloudInfo(); return false; } finally { cloudBusy = null; }
    })();
    return cloudBusy;
  }
  function renderCloudInfo() {
    const src = S.team && S.team.src, el = $('cloudInfo');
    el.hidden = !src; $('cloudSyncBtn').hidden = !src;
    if (!src) return;
    const c = S.cloud && S.cloud.src === src.url ? S.cloud : null;
    el.textContent = `Online sheet${c && c.name ? ` “${c.name}”` : ''}: ${c ? `last read ${fmtTime(c.at)} · ${c.companies.length} companies · ${c.tasks.length} tasks · ${c.packs.length} map packs` : 'not read yet'}${cloudErr ? ` · last try failed: ${cloudErr}` : ''}`;
  }
  $('cloudSyncBtn').addEventListener('click', async () => {
    $('cloudInfo').textContent = 'Reading the online sheet…';
    const ok = await cloudSync(true); renderCloudInfo();
    toast(ok ? 'Online sheet read' : navigator.onLine ? `Could not read the online sheet: ${cloudErr}` : 'No internet', 5000);
  });
  window.addEventListener('online', () => { cloudSync(false); });

  /* ---- assigned tasks become projects ---- */
  const taskProject = (id) => allProjects().find((n) => pmeta(n).taskId === id);
  function visibleTasks() {
    const me = S.user && S.user.company;
    return ((S.cloud && S.cloud.tasks) || []).filter((t) => !/^(closed|done|cancel)/i.test(t.status) && (!t.company || isAdmin() || !me || t.company.toLowerCase() === me.toLowerCase()));
  }
  function renderTasks() {
    const src = S.team && S.team.src, box = $('taskList');
    $('taskBox').hidden = !src; if (!src) return;
    const list = visibleTasks();
    $('taskInfo').textContent = S.cloud && S.cloud.src === src.url ? `${list.length} task${list.length === 1 ? '' : 's'} for ${isAdmin() ? 'everyone (you are an admin)' : (S.user && S.user.company) || 'you'} · sheet read ${fmtTime(S.cloud.at)}${cloudErr ? ` · last sync failed: ${cloudErr}` : ''}`
      : (navigator.onLine ? 'Reading the online sheet…' : 'Connect to the internet to see assigned tasks.');
    box.innerHTML = '';
    for (const t of list) {
      const have = taskProject(t.id);
      const card = document.createElement('div'); card.className = 'area-card';
      const d = document.createElement('div');
      const ti = document.createElement('span'); ti.className = 't'; ti.textContent = t.project;
      const s2 = document.createElement('span'); s2.className = 's';
      s2.textContent = [t.category, t.site, t.contractor && `Contractor: ${t.contractor}`, t.company && `For: ${t.company}`, t.notes, have ? `on this phone as “${have}”` : ''].filter(Boolean).join(' · ');
      d.append(ti, s2);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (have ? '' : 'primary');
      b.textContent = have ? 'Open' : 'Start';
      b.addEventListener('click', () => guard(() => (have ? switchProject(have) : startTask(t))));
      card.append(d, b); box.appendChild(card);
    }
    if (!list.length && S.cloud) box.innerHTML = '<p class="hint" style="margin:0">No open tasks for you in the sheet.</p>';
  }
  async function switchProject(name) { S.project = name; persist(); renderPoles(); await closeSheet(); fitProject(); toast(`Now working on: ${name}`); }
  async function startTask(t) {
    const base = { taskId: t.id, site: t.site, contractor: t.contractor, globeRep: t.globeRep, inspector: byLine() };
    if (t.category === 'FAT' || t.category === 'Cleanup') {
      const fat = t.category === 'FAT';
      const how = await ask(`Start ${fat ? 'FAT' : 'defect cleanup'}: ${t.project}`, fat ? 'A FAT re-checks the PAT punchlist. Open the PAT or cleanup KMZ you received, or start an empty FAT.' : 'Open the PAT KMZ you received from the inspector.',
        [{ label: 'Cancel', value: '' }, ...(fat ? [{ label: 'Empty FAT', value: 'blank' }] : []), { label: 'Open KMZ', value: 'file', primary: true }]);
      if (!how) return;
      if (how === 'file') { pendingFatMeta = { ...base, name: t.project }; pendingStage = t.category; $('patFileInput').value = ''; $('patFileInput').click(); return; }
    }
    let name = t.project, k = 2;
    while (allProjects().includes(name)) name = `${t.project} (${k++})`;
    S.projects.push(name); S.meta = S.meta || {};
    S.meta[name] = t.category === 'Survey' ? { mode: 'survey', taskId: t.id } : { mode: 'acceptance', stage: t.category, globeRep: '', ...base };
    await switchProject(name);
    toast(`${t.category} “${name}” started from the online task list`, 3500);
  }
  $('taskSync').addEventListener('click', async () => { $('taskInfo').textContent = 'Reading the online sheet…'; await cloudSync(true); renderTasks(); });

  /* ---- a PAT from another phone, for its FAT ---- */
  let pendingFatMeta = null;
  /** The handover file: the acceptance KMZ with the PoleCam data inside (PAT → defect cleanup → FAT). */
  async function sharePackage() {
    if (!needPoints()) return;
    const M = accModel(), blob = await buildAccKmz(M, true); busy(false);
    noteExport('sent');
    await shareFile(blob, `${accFileBase(M)}_share.kmz`, 'application/vnd.google-earth.kmz');
  }
  $('sendPat').addEventListener('click', () => guard(sharePackage));
  let pendingStage = null; // set when an online task asks for the file
  $('fatFromFile').addEventListener('click', () => { pendingFatMeta = null; pendingStage = null; $('patFileInput').value = ''; $('patFileInput').click(); });
  $('patFileInput').addEventListener('change', (e) => guard(async () => {
    const f = e.target.files[0]; if (!f) return;
    const extra = pendingFatMeta ? (({ name, ...rest }) => rest)(pendingFatMeta) : null, want = pendingFatMeta && pendingFatMeta.name; pendingFatMeta = null;
    const stage = pendingStage || (newMode === 'Cleanup' ? 'Cleanup' : 'FAT'); pendingStage = null;
    await importStageFile(f, stage, extra, want);
    if (stack[stack.length - 1] === 'projects') await closeSheet();
    fitProject();
  }, 'Not started'));
  /** Save or send a file: the APK's share sheet, the browser's share sheet, or a download. */
  async function shareFile(blob, name, type) {
    if (NATIVE) {
      try { const r = await nativePrivate({ blob, name }); await nativeCall('Share', 'share', { title: name, dialogTitle: `Send ${name}`, files: [r.cacheUri] }); return; }
      catch (e) { if (/cancel/i.test(String(e && e.message))) return; }
      try { const r = await nativeSave({ blob, name }); toast(`Could not open sharing; saved to ${r.where} instead`, 6000); }
      catch (e) { toast(`Could not share or save the file: ${e.message || e}`, 6000); }
      return;
    }
    try {
      const file = new File([blob], name, { type: type || blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e && (e.name === 'AbortError' || /cancel/i.test(String(e.message)))) return; }
    const a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
    toast('Saved to Downloads');
  }

  /* ---- admin: company names from a CSV file ---- */
  $('admCsv').addEventListener('click', () => { $('admCsvInput').value = ''; $('admCsvInput').click(); });
  $('admCsvInput').addEventListener('change', (e) => guard(async () => {
    const f = e.target.files[0]; if (!f || !admDraft) return;
    const names = C.companiesFromCsv(await f.text());
    if (!names.length) { toast('No company names found. Put one company per row (first column, or a column named Company).', 5000); return; }
    const have = new Set(admDraft.co.map((c) => c.toLowerCase())), add = names.filter((n) => !have.has(n.toLowerCase()));
    const room = Math.max(0, 300 - admDraft.co.length), local = add.slice(0, room);
    admDraft.co.push(...local); renderAdmDraft();
    let note = `${local.length} compan${local.length === 1 ? 'y' : 'ies'} added from ${f.name}${names.length > add.length ? ` (${names.length - add.length} already on the list)` : ''}.`;
    if (add.length > room) note += ` ${add.length - room} not added here: the in-app list holds at most 300 (the online sheet can hold more).`;
    const url = $('admUrl').value.trim(), wkey = $('admWriteKey').value.trim();
    if (url && wkey && add.length) {
      busy('Adding them to the online sheet…');
      try {
        const j = await cloudRequest({ url }, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: wkey, action: 'addCompanies', companies: add }) });
        note += j && j.ok ? ` ${j.added} added to the online sheet.` : ` The online sheet refused them${j && j.error === 'key' ? ' (wrong admin key)' : ''}.`;
      } catch (err) { note += ` Could not reach the online sheet (${err.message}).`; } finally { busy(false); }
    }
    toast(`${note} Tap Save and share the list.`, 7000);
  }));
  $('admTest').addEventListener('click', async () => {
    const url = $('admUrl').value.trim(), key = $('admReadKey').value.trim();
    if (!/^https:\/\/\S+$/.test(url)) { $('admTestOut').textContent = 'Paste the web app URL (it starts with https://script.google.com/).'; return; }
    $('admTestOut').textContent = 'Testing…';
    try {
      const j = await cloudRequest({ url, key });
      $('admTestOut').textContent = j && j.ok ? (({ name, companies, tasks, packs }) => `Connected: “${name}” · ${companies.length} companies · ${tasks.length} tasks · ${packs.length} map packs.`)(cleanCloud(j))
        : `The sheet answered but refused: ${j && j.error === 'key' ? 'wrong read key' : (j && j.error) || 'unknown reason'}.`;
    } catch (e) { $('admTestOut').textContent = `Could not reach it: ${e.message}. Check the URL and that the web app is deployed for “Anyone”.`; }
  });

  /* ---- admin: create and manage the list ----
     One company on the list is the admin company. The list is signed with one key pair ("list key"); its private half travels
     inside the list, encrypted with the admin PIN, so any phone whose user enters the PIN can make the next version. */
  let admMode = 'manage', admDraft = null, admPinCache = '';
  const hasListKey = (t) => !!(t && t.key && t.keyEnc);
  /** Can this phone open the admin screen at all? (admin company member with a modern list, holder of the key, or a legacy admin) */
  const canManage = () => !!S.team && (isAdmin() || (hasListKey(S.team) && isInspector()));
  function openAdmin(mode) {
    if (!cryptoOk()) return;
    admMode = mode;
    const create = mode === 'create' || !S.team, migrate = !create && !hasListKey(S.team);
    $('adminTitle').textContent = create ? 'Create the company list' : 'Administration';
    $('admPin').value = ''; $('admPin2').value = ''; $('admPin2').hidden = !(create || migrate);
    $('admLockTitle').textContent = create || migrate ? 'Set the admin PIN' : 'Admin PIN';
    $('admLockHint').textContent = create ? 'Staff of the admin company enter this PIN once to become admins and inspectors. Keep it inside the admin company; it can be changed later.'
      : migrate ? 'This list was made by an older version. Set the admin PIN once; from then on, staff of the admin company use it.' : `Enter the admin PIN of ${pol().owner || 'the admin company'}.`;
    $('admLock').hidden = false; $('admMain').hidden = true;
    openSheet('admin');
  }
  $('admUnlock').addEventListener('click', async () => {
    const pin = $('admPin').value.trim();
    if (!/^\d{4,8}$/.test(pin)) { toast('The PIN is 4 to 8 digits'); return; }
    const create = admMode === 'create' || !S.team, migrate = !create && !hasListKey(S.team);
    if (create || migrate) {
      if (pin !== $('admPin2').value.trim()) { toast('The two PINs do not match'); return; }
      if (migrate && !isAdmin()) { toast('Only an admin of the older list can set its PIN'); return; }
      admPinCache = pin;
    } else {
      $('admUnlock').disabled = true;
      try {
        const jwk = await decPriv(S.team.keyEnc, pin); // the PIN is checked every time, even on a phone that already holds the key
        if (!jwk) { toast('Wrong admin PIN'); $('admPin').value = ''; return; }
        S.adminKey = { pub: S.team.key, priv: jwk }; persist(); admPinCache = pin;
      } finally { $('admUnlock').disabled = false; }
    }
    $('admLock').hidden = true; await admStart();
  });
  async function admStart() {
    const create = admMode === 'create' || !S.team;
    const P = pol(), F = formText();
    const polDraft = { owner: P.owner || '', form: { ...P.form }, defects: JSON.parse(JSON.stringify(P.defects)), maxSpan: P.maxSpan, angleDeg: P.angleDeg, autoGap: P.autoGap, quality: P.quality, inspTypes: P.inspTypes.slice(), poleTypes: (P.poleTypes || []).slice() };
    $('admPoleTypes').value = typeLines(polDraft.poleTypes);
    $('admPacks').value = packLines(P.packs || []); $('admPacksInfo').textContent = '';
    if (create) {
      await newAdminKey(); // the new list's key
      admDraft = { id: uid(), name: '', co: [], admins: [], rev: 0, src: null, pol: polDraft, newKey: true };
      if (S.user && S.user.company) { admDraft.co.push(S.user.company); if (!polDraft.owner) polDraft.owner = S.user.company; }
    } else admDraft = { id: S.team.id, name: S.team.name, co: S.team.co.slice(), admins: (S.team.admins || []).map((a) => ({ ...a })), rev: S.team.rev, src: S.team.src || null, pol: polDraft, newKey: !hasListKey(S.team) };
    $('admUrl').value = (admDraft.src && admDraft.src.url) || ''; $('admReadKey').value = (admDraft.src && admDraft.src.key) || '';
    $('admWriteKey').value = S.onlineAdminKey || ''; $('admTestOut').textContent = '';
    $('admName').value = admDraft.name; $('admNewCo').value = '';
    // form wording
    $('pfmCompany').value = F.company; $('pfmAddress').value = F.address || ''; $('pfmDept1').value = F.dept1 || ''; $('pfmDept2').value = F.dept2 || '';
    $('pfmLeftTitle').value = F.leftTitle; $('pfmRightTitle').value = F.rightTitle; $('pfmTypes').value = (F.types || []).join('\n'); $('pfmLegend').value = F.legend || ''; $('pfmDateSub').value = F.colDateSub || '';
    // checklist and standards
    const cats = Object.keys(polDraft.defects);
    $('setDefCat').innerHTML = cats.map((c) => `<option>${C.xmlEsc(c)}</option>`).join('');
    $('setDefItems').value = (polDraft.defects[cats[0]] || []).join('\n');
    $('setMaxSpan').value = polDraft.maxSpan; $('setAngle').value = polDraft.angleDeg; $('setAutoGap').value = polDraft.autoGap; $('admQuality').value = polDraft.quality === 'normal' ? 'normal' : 'strict';
    $('admChangePin').hidden = create || admDraft.newKey;
    $('admMain').hidden = false; renderAdmDraft();
  }
  /** Reads the policy fields back into the draft (called on Save). */
  function readPolDraft() {
    const P = admDraft.pol, t = (id) => $(id).value.trim().replace(/\s+/g, ' ').slice(0, 200);
    const form = { company: t('pfmCompany'), address: t('pfmAddress'), dept1: t('pfmDept1'), dept2: t('pfmDept2'), leftTitle: t('pfmLeftTitle'), rightTitle: t('pfmRightTitle'), legend: t('pfmLegend'), colDateSub: t('pfmDateSub'),
      types: $('pfmTypes').value.split('\n').map((x) => x.trim().slice(0, 60)).filter(Boolean).slice(0, 10) };
    const D = window.PoleForms.DEFAULT_FORM; // keep only what differs from the built-in wording (a blank line stays blank), so the list stays small
    const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    const kept = { ...(P.form || {}) }; // keys this screen does not edit stay as they were
    Object.entries(form).forEach(([k, v]) => { if (Array.isArray(v) ? !v.length || v.join('|') === (D[k] || []).join('|') : v === norm(D[k])) delete kept[k]; else kept[k] = v; });
    P.form = kept;
    P.owner = $('admOwner').value || '';
    const num = (id, lo, hi, dflt) => { const v = +$(id).value; return v >= lo && v <= hi ? v : dflt; };
    P.maxSpan = num('setMaxSpan', 5, 1000, 200); P.angleDeg = num('setAngle', 1, 90, 15); P.autoGap = num('setAutoGap', 10, 5000, 120);
    P.quality = $('admQuality').value === 'normal' ? 'normal' : 'strict';
    P.poleTypes = parseTypeLines($('admPoleTypes').value).filter((t) => !BUILTIN_TYPES.some((b) => b.p === t.p));
    P.packs = parsePackLines($('admPacks').value).packs; if (!P.packs.length) delete P.packs;
    if (!P.poleTypes.length) delete P.poleTypes;
    const types = form.types.length ? form.types : D.types;
    P.inspTypes = (P.inspTypes || []).filter((x) => types.includes(x)); if (!P.inspTypes.length) P.inspTypes = [types[0]];
    for (const k of Object.keys(P.defects)) if (!P.defects[k].length) delete P.defects[k];
    if (!Object.keys(P.defects).length) P.defects = JSON.parse(JSON.stringify(DEF_CHECK));
    return P;
  }
  $('setDefCat').addEventListener('change', () => { if (admDraft) $('setDefItems').value = (admDraft.pol.defects[$('setDefCat').value] || []).join('\n'); });
  $('admAddCat').addEventListener('click', () => {
    if (!admDraft) return;
    const v = $('admNewCat').value.trim().replace(/\s+/g, ' ').slice(0, 40); if (!v) return;
    const have = Object.keys(admDraft.pol.defects).find((k) => k.toLowerCase() === v.toLowerCase());
    if (!have) { if (Object.keys(admDraft.pol.defects).length >= 20) { toast('At most 20 categories'); return; } admDraft.pol.defects[v] = []; }
    const name = have || v;
    $('setDefCat').innerHTML = Object.keys(admDraft.pol.defects).map((c) => `<option${c === name ? ' selected' : ''}>${C.xmlEsc(c)}</option>`).join('');
    $('setDefItems').value = admDraft.pol.defects[name].join('\n'); $('admNewCat').value = ''; $('setDefItems').focus();
  });
  $('setDefItems').addEventListener('change', () => {
    if (!admDraft) return;
    admDraft.pol.defects[$('setDefCat').value] = $('setDefItems').value.split('\n').map((x) => x.trim().slice(0, 120)).filter(Boolean).slice(0, 60);
  });
  function renderAdmDraft() {
    const box = $('admCos'); box.innerHTML = '';
    if (!admDraft.co.length) box.innerHTML = '<p class="hint" style="margin:0">No companies yet. Add each company or vendor that will use PoleCam.</p>';
    admDraft.co.forEach((c, i) => {
      const row = document.createElement('div'); row.className = 'co-item';
      const t = document.createElement('span'); t.textContent = c;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn danger'; b.textContent = 'Remove';
      b.addEventListener('click', () => { admDraft.co.splice(i, 1); renderAdmDraft(); });
      row.append(t, b); box.appendChild(row);
    });
    const own = $('admOwner'), cur = own.value || admDraft.pol.owner || '';
    own.innerHTML = '<option value="">Not set: every user may manage, add and verify</option>' + admDraft.co.map((c) => `<option${c === cur ? ' selected' : ''}>${C.xmlEsc(c)}</option>`).join('');
    if (cur && !admDraft.co.includes(cur)) own.value = '';
    $('admRev').textContent = admDraft.rev ? `Saving makes version ${admDraft.rev + 1}${admDraft.newPin ? ' with the new admin PIN' : ''}. Phones that have version ${admDraft.rev} take it when you share it.` : 'Saving makes version 1 of a new list.';
  }
  $('admAddCo').addEventListener('click', () => {
    const v = $('admNewCo').value.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!v) return;
    if (admDraft.co.some((c) => c.toLowerCase() === v.toLowerCase())) { toast('Already on the list'); return; }
    admDraft.co.push(v); $('admNewCo').value = ''; renderAdmDraft(); $('admNewCo').focus();
  });
  $('admNewCo').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('admAddCo').click(); });
  $('admChangePin').addEventListener('click', async () => {
    const p1 = await askPin('New admin PIN', 'Phones that take the next list version will need this PIN. Anyone who had the old PIN stops being an admin.'); if (p1 == null) return;
    if (!/^\d{4,8}$/.test(p1)) { toast('The PIN is 4 to 8 digits'); return; }
    const p2 = await askPin('Repeat the new PIN', ''); if (p2 == null) return;
    if (p1 !== p2) { toast('The two PINs do not match'); return; }
    admDraft.newPin = p1; renderAdmDraft(); toast('The new PIN takes effect when you save and share the list', 4000);
  });
  $('admSave').addEventListener('click', async () => {
    admDraft.name = $('admName').value.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!admDraft.name) { toast('Give the list a name, e.g. your office or project'); $('admName').focus(); return; }
    if (!admDraft.co.length) { toast('Add at least one company'); return; }
    const url = $('admUrl').value.trim(), rkey = $('admReadKey').value.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) { toast('The online sheet URL must start with https://'); return; }
    if (url && !rkey) { toast('Enter the read key from the sheet’s Settings tab, or clear the URL'); $('admReadKey').focus(); return; }
    if (admDraft.co.length > 300) { toast(`The list has ${admDraft.co.length} companies; the most is 300. Remove some, or keep the full list in the online sheet.`, 6000); return; }
    const P = readPolDraft();
    if (!P.owner) { const ok = await ask('No admin company', 'Without an admin company every user can change this list and verify deficiencies. Save anyway?'); if (!ok) return; }
    admDraft.src = url ? { url, key: rkey } : null;
    S.onlineAdminKey = $('admWriteKey').value.trim();
    busy('Signing the list…');
    try {
      // which key signs, and which key the new version carries
      const signer = { ...S.adminKey }; // the key this phone holds now: a brand-new list's key, a legacy per-person admin key, or the current list key
      let listKey = signer, prevKey = null, k = -1;
      const fresh = admDraft.newKey && !S.team; // a brand-new list is signed by its own key
      if (!fresh && (admDraft.newKey || admDraft.newPin)) { // migration from per-person keys, or a PIN change: the list gets a fresh key
        await newAdminKey(); listKey = { ...S.adminKey };
        const idx = admDraft.admins.findIndex((a) => a.k === signer.pub);
        if (idx >= 0) k = idx; // the legacy admin key signs the migration
        else { prevKey = signer.pub; k = -2; } // the previous list key signs the hand-over
      }
      const pin = admDraft.newPin || admPinCache;
      if (!pin) throw new Error('Admin PIN missing — close and open Manage again');
      const keyEnc = await encPriv(listKey.priv, pin);
      const body = JSON.stringify({ t: 'polecam-team', v: 3, id: admDraft.id, name: admDraft.name, rev: admDraft.rev + 1, at: new Date().toISOString(),
        admins: admDraft.admins, key: listKey.pub, keyEnc, ...(prevKey ? { prevKey } : {}), co: admDraft.co, ...(admDraft.src ? { src: admDraft.src } : {}), pol: P });
      if (!validTeam(JSON.parse(body))) throw new Error('This list cannot be saved: check the name, companies (up to 100 characters each), the form wording and the online sheet fields');
      S.adminKey = signer; const sig = await signText(body); // sign with the key the other phones trust…
      S.adminKey = listKey; // …then keep the key the new version carries
      S.team = { ...JSON.parse(body), b: body, s: sig, k }; (S.teamSeen = S.teamSeen || {})[S.team.id] = S.team.rev; admPinCache = pin; persist();
    } catch (e) { busy(false); toast(e.message || String(e), 6000); return; }
    busy(false);
    await closeSheet(); afterTeamChange(); renderPoles();
    showTeamQr(`Version ${S.team.rev} saved. Show this QR code to each user, or share the file.${admDraft.newPin ? ' Admins must enter the new PIN after taking it.' : ''}`);
    if (S.team.src) { pushPacksToSheet(S.team.src.url, P.packs || []).finally(() => cloudSync(true)); }
  });
  /** Admin map packs (name | Drive link | MB), one per line. Only the Drive file id is kept, so the list and its QR stay small. */
  function parsePackLines(text) {
    const packs = [], bad = [];
    String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const parts = l.split(/\s*[|\t]\s*/), link = parts.find((x) => driveId(x)), d = link && driveId(link);
      if (!d) { bad.push(l.slice(0, 40)); return; }
      const name = (parts[0] && parts[0] !== link ? parts[0] : 'Map pack').slice(0, 60), mb = +String(parts.find((x, i) => i > 0 && x !== link && /^\d+(\.\d+)?\s*(mb)?$/i.test(x)) || '').replace(/[^\d.]/g, '') || 0;
      if (!packs.some((x) => x.d === d)) packs.push({ n: name, d, ...(mb ? { mb: Math.min(100000, Math.round(mb)) } : {}) });
    });
    return { packs: packs.slice(0, 30), bad };
  }
  const packLines = (list) => (list || []).map((x) => `${x.n} | https://drive.google.com/file/d/${x.d}/view${x.mb ? ` | ${x.mb}` : ''}`).join('\n');
  $('admPacks').addEventListener('change', () => {
    const { packs, bad } = parsePackLines($('admPacks').value);
    $('admPacksInfo').textContent = `${packs.length} map pack${packs.length === 1 ? '' : 's'}${bad.length ? ` · not a Google Drive link: ${bad.join('; ')}` : ''}`;
  });
  /** With the online sheet connected and its admin key on this phone, the MapPacks tab follows the list (users then see them after Refresh list). */
  async function pushPacksToSheet(url, packs) {
    if (!url || !S.onlineAdminKey) return;
    try {
      const j = await cloudRequest({ url }, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key: S.onlineAdminKey, action: 'setPacks', packs: packs.map((x) => ({ name: x.n, link: `https://drive.google.com/file/d/${x.d}/view`, sizeMB: x.mb || '' })) }) });
      if (!j || !j.ok) throw new Error(j && j.error === 'action' ? 'update the Apps Script in the sheet (new version) to send map packs' : (j && j.error) || 'no answer');
      LOG.info('sheet.packs', { n: packs.length });
    } catch (e) { LOG.warn('sheet.packs.fail', errInfo(e)); toast(`Map packs not written to the online sheet: ${e.message || e}. Phones still get them with this list version.`, 7000); }
  }
  $('teamManage').addEventListener('click', () => openAdmin('manage'));
  $('teamCreate').addEventListener('click', () => openAdmin('create'));
  $('pfCreate').addEventListener('click', () => {
    if ($('pfName').value.trim().length < 3) { toast('Enter your full name first', 3500); $('pfName').focus(); return; }
    openAdmin('create');
  });
  /** PIN prompt (the askBox with a password field). */
  function askPin(title, text) {
    $('pinTitle').textContent = title; $('pinText').textContent = text || ''; $('pinInput').value = '';
    return new Promise((res) => {
      const done = (v) => { $('pinBox').hidden = true; $('pinYes').onclick = $('pinNo').onclick = null; res(v); };
      $('pinYes').onclick = () => done($('pinInput').value.trim()); $('pinNo').onclick = () => done(null);
      $('pinBox').hidden = false; setTimeout(() => $('pinInput').focus(), 50);
    });
  }

  /* ================= offline map screen ================= */
  const areaLayer = L.layerGroup().addTo(map);
  function tilesFor(b, zmax) { // kept for older saved areas
    const out = [], lon2x = (lon, n) => Math.floor((lon + 180) / 360 * n), lat2y = (lat, n) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
    for (let z = 13; z <= zmax; z++) { const n = 2 ** z; for (let x = lon2x(b[1], n); x <= lon2x(b[3], n); x++) for (let y = lat2y(b[2], n); y <= lat2y(b[0], n); y++) out.push([z, x, y]); }
    return out;
  }
  /** Shows where the offline pack ends while it is the map in use. */
  function drawAreas() {
    areaLayer.clearLayers();
    const p = S.base === 'offline' && S.packs[activePackId()];
    if (p && p.bbox) L.rectangle([[p.bbox[1], p.bbox[0]], [p.bbox[3], p.bbox[2]]], { color: '#1c7ed6', weight: 1.5, dashArray: '6 6', fill: false, interactive: false }).addTo(areaLayer);
  }
  async function deleteArea(id) { S.areas = (S.areas || []).filter((x) => x.id !== id); persist(); } // older versions only
  const fmtMB = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : `${Math.max(0.1, b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`);
  const fmtDate8 = (d) => (/^\d{8}$/.test(d || '') ? new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00`).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : d || '');
  /* ---- where packs come from: Google Drive links (from the online sheet or pasted), a file on the phone, or a website ---- */
  const DRIVE_ID_RE = /^[A-Za-z0-9_-]{20,}$/;
  function driveId(link) {
    const t = String(link || '').trim();
    const m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(t) || /[?&]id=([A-Za-z0-9_-]{20,})/.exec(t);
    return m ? m[1] : DRIVE_ID_RE.test(t) ? t : null;
  }
  const driveDownloadUrl = (id) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  const driveViewUrl = (id) => `https://drive.google.com/file/d/${id}/view`;
  const DRIVE_HTML_ERR = 'Google Drive sent a web page instead of the map file. Set the file’s sharing to “Anyone with the link”, or open it in Drive, download it and use Import a pack file.';
  /** Opens a link outside the app (the APK hands it to the phone's browser). */
  function openExternal(url) {
    const a = document.createElement('a'); a.href = url; a.rel = 'noopener';
    if (!NATIVE) a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove();
  }
  let packIndex = null, packIndexErr = '';
  async function loadPackIndex() { // packs published with the website (older setup); quietly absent otherwise
    try {
      const r = await fetch(new URL('maps/index.json', SITE).href, { cache: 'no-store' });
      packIndex = r.ok ? await r.json() : null; packIndexErr = '';
    } catch (e) { packIndex = null; packIndexErr = navigator.onLine ? '' : 'Offline: connect to see map packs you can download'; }
  }
  /** Every pack this phone knows about: installed, listed in the online sheet, pasted Drive links, or the website list. */
  function packCatalog() {
    const byId = {};
    const add = (p) => { byId[p.id] = { ...(byId[p.id] || {}), ...p }; };
    ((packIndex && packIndex.packs) || []).forEach((p) => add({ id: p.id, name: p.name, size: p.size, date: p.date, bbox: p.bbox, maxzoom: p.maxzoom, url: new URL(`maps/${p.file || p.id + '.pmtiles'}`, SITE).href, from: 'website' }));
    ((S.cloud && S.cloud.packs) || []).forEach((p) => { const id = driveId(p.link); if (id) add({ id: `drive-${id}`, name: p.name || 'Map pack', size: p.sizeMB ? Math.round(p.sizeMB * 1048576) : undefined, sizeApprox: true, notes: p.notes, drive: id, from: 'sheet' }); });
    (pol().packs || []).forEach((p) => add({ id: `drive-${p.d}`, name: p.n || 'Map pack', size: p.mb ? Math.round(p.mb * 1048576) : undefined, sizeApprox: true, drive: p.d, from: 'list' }));
    (S.packLinks || []).forEach((p) => add({ id: `drive-${p.drive}`, name: p.name, drive: p.drive, from: 'link' }));
    Object.values(S.packs).forEach((p) => { byId[p.id] = { ...(byId[p.id] || { id: p.id, name: p.name, size: p.size, date: p.date, bbox: p.bbox, maxzoom: p.maxzoom, from: 'phone' }), installed: p }; });
    return Object.values(byId);
  }
  function renderStreetInfo() {
    const cur = streetSource(), auto = !S.streetSrc || S.streetSrc === 'auto';
    $('streetSrc').value = auto ? 'auto' : S.streetSrc;
    $('streetInfo').textContent = `Using ${cur.name}${auto ? ' (automatic)' : ''} · this session: ${streetState.ok} tiles loaded, ${streetState.failed} failed${NATIVE ? ' · fetched by the Android app' : ''}.`;
  }
  $('streetSrc').addEventListener('change', () => {
    S.streetSrc = $('streetSrc').value; persist(); streetState.auto = 0; streetState.fails = 0;
    if (mainBase && mainBase.options.src === 'street') mainBase.redraw();
    if (pinBase && pinBase.options && pinBase.options.src === 'street') pinBase.redraw();
    renderStreetInfo(); toast(`Street map: ${streetSource().name}`, 2000);
  });
  $('mapCheckBtn').addEventListener('click', async () => {
    const out = $('mapCheckOut'); out.hidden = false; out.textContent = 'Testing map servers…'; $('mapCheckBtn').disabled = true;
    try {
      const res = await mapCheck();
      out.textContent = res.map((r) => `${r.src.name}: ${r.ok ? `OK, ${r.ms} ms` : `FAILED (${r.err || 'no image'})`}`).join('\n')
        + `\n${navigator.onLine === false ? 'The phone reports no internet connection.' : ''}${res.some((r) => r.ok) ? '' : 'No map server answered: check mobile data / Wi-Fi, or use an offline map pack.'}`;
      const firstOk = res.findIndex((r) => r.ok && r.src.id !== 'sat');
      if (firstOk >= 0 && (!S.streetSrc || S.streetSrc === 'auto')) { streetState.auto = firstOk; streetState.fails = 0; if (mainBase && mainBase.options.src === 'street') mainBase.redraw(); }
    } finally { $('mapCheckBtn').disabled = false; renderStreetInfo(); }
  });
  async function renderOffline() {
    renderStreetInfo();
    const list = $('packList'); list.innerHTML = '';
    const items = packCatalog(), act = activePackId();
    const listPacks = (pol().packs || []).length, sheetPacks = (S.cloud && S.cloud.packs && S.cloud.packs.length) || 0, own = !S.team || isAdmin();
    $('packSource').textContent = packIndexErr || (listPacks || sheetPacks ? `Map packs from the admin${S.team ? ` (list “${S.team.name}” v${S.team.rev}${sheetPacks ? ` · online sheet read ${fmtTime(S.cloud.at)}` : ''})` : ''}. Tap Refresh list for new ones.`
      : S.team ? 'No map packs from the admin yet. Tap Refresh list later, or ask your admin.' : 'Map packs: import a file from this phone, or add a Google Drive link.');
    $('packLinkBox').hidden = !own; // with a company list, map pack links come from the admin
    if (own && S.team) $('packLinkHint').textContent = 'Links added here stay on this phone. To give a pack to everyone: Settings → Administration → Offline map packs.';
    if (!items.length) list.innerHTML = '<p class="hint" style="margin:0">No map packs yet.</p>';
    for (const p of items) {
      const inst = p.installed, done = inst && inst.done, partial = inst && !inst.done && inst.bytes > 0;
      const row = document.createElement('div'); row.className = 'area-card';
      const d = document.createElement('div');
      const t = document.createElement('span'); t.className = 't'; t.textContent = p.name || p.id;
      const s2 = document.createElement('span'); s2.className = 's';
      const size = (inst && inst.size) || p.size;
      s2.textContent = [size ? fmtMB(size) : '', p.date || (inst && inst.date) ? `map data ${fmtDate8((inst && inst.date) || p.date)}` : '',
        done ? (p.id === act ? 'on this phone · in use' : 'on this phone') : partial ? `${size ? Math.round((inst.bytes / size) * 100) + '% ' : fmtMB(inst.bytes) + ' '}downloaded` : 'not on this phone',
        p.drive && !done ? 'Google Drive' : '', p.notes || ''].filter(Boolean).join(' · ');
      d.append(t, s2);
      const mk = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); return b; };
      const btns = [];
      if (!done) {
        if (p.url) btns.push(mk(partial ? 'Resume' : 'Download', 'primary', () => downloadPack(p)));
        else if (p.drive && NATIVE) btns.push(mk(partial ? 'Resume' : 'Download', 'primary', () => downloadPack(p)));
        if (p.drive) btns.push(mk('Open in Drive', '', () => { openExternal(driveViewUrl(p.drive)); if (!NATIVE) toast('Download the file in Drive, then come back and tap Import a pack file', 6000); }));
      }
      if (done && p.id !== act) btns.push(mk('Use', '', () => { S.activePack = p.id; persist(); if (S.base === 'offline') setBase('offline', true); renderOffline(); }));
      if (done) btns.push(mk('Show', '', async () => { S.activePack = p.id; persist(); await closeSheet(); setBase('offline'); const b = inst.bbox; if (b) map.fitBounds([[b[1], b[0]], [b[3], b[2]]]); }));
      if (inst || p.from === 'link') btns.push(mk(inst ? 'Delete' : 'Remove', 'danger', function () {
        if (!this.dataset.armed) { this.dataset.armed = '1'; this.textContent = 'Confirm'; setTimeout(() => { delete this.dataset.armed; this.textContent = inst ? 'Delete' : 'Remove'; }, 4000); return; }
        guard(async () => {
          if (dl && dl.id === p.id) { toast('Wait until the download has stopped'); return; }
          if (inst) { busy('Deleting map pack…'); await deletePack(p.id); }
          if (p.from === 'link' && !inst) S.packLinks = (S.packLinks || []).filter((x) => `drive-${x.drive}` !== p.id);
          persist(); renderOffline(); toast(inst ? 'Map pack deleted' : 'Link removed');
        });
      }));
      row.append(d, ...btns); list.appendChild(row);
    }
    try { const n = await dbCount('tiles'); $('offTotal').textContent = `${n.toLocaleString()} viewed street-map tiles kept on this phone.`; } catch (e) { /* ignore */ }
  }
  async function deletePack(id) {
    const p = S.packs[id];
    if (p) await removePackData(p);
    delete S.packs[id];
    if (S.activePack === id) S.activePack = null;
    persist();
    if (S.base === 'offline') setBase(activePackId() ? 'offline' : 'street', true);
  }

  /* ---- downloading / importing a pack ---- */
  let dl = null; // the running job: { id, cancelled, detached, ctl, step }
  const CANCEL = new Error('cancelled');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Runs one download/import. pump(st, getWriter, job, progress) returns the final size; the writer is opened when first needed. */
  async function runPackJob(meta, pump, verb) {
    if (dl) { toast(dl.cancelled ? 'Still stopping the last download; try again in a moment' : 'A map pack is already downloading'); return; }
    const job = dl = { id: meta.id, cancelled: false, detached: false, ctl: new AbortController(), step: 'starting' }; // claimed before any wait
    let wr = null, st = null;
    try {
      st = S.packs[meta.id];
      const exact = meta.size && !meta.sizeApprox;
      if (st && (st.done || (exact && st.size && st.size !== meta.size) || (meta.date && st.date && st.date !== meta.date))) { await removePackData(st); delete S.packs[meta.id]; st = null; } // a new copy: start fresh
      if (st && !st.store) st.store = 'idb';
      if (!st) st = S.packs[meta.id] = { id: meta.id, name: meta.name, size: exact ? meta.size : 0, date: meta.date || '', bbox: meta.bbox || null, maxzoom: meta.maxzoom || 15,
        store: OPFS_OK ? 'opfs' : 'idb', bytes: 0, chunks: 0, ch: PACK_CH, done: false };
      const need = (st.size || meta.size || 0) - st.bytes;
      if (need > 0 && navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate().catch(() => null);
        if (est && est.quota && est.quota - est.usage < need * 1.1) throw new Error(`Not enough free space: the pack needs ${fmtMB(need)} more, about ${fmtMB(est.quota - est.usage)} is available to the app.`);
      }
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      persist();
      const total = () => st.size || meta.size || 0;
      const progress = (pos) => { if (!job.cancelled) busy(`${verb} ${st.name}: ${fmtMB(pos)}${total() ? ` of ${fmtMB(total())}` : ''}`, total() ? Math.min(1, pos / total()) : null, true); };
      progress(st.bytes);
      const getWriter = async () => { if (!wr) { job.step = 'opening phone storage'; wr = await packWriter(st); } return wr; };
      const size = await pump(st, getWriter, job, progress);
      if (job.cancelled) throw CANCEL;
      job.step = 'saving to phone storage';
      await (await getWriter()).finish(size);
      st.size = size; st.bytes = size;
      const hdr = pmtilesHeader(new Uint8Array((await new PackSource(st.id).getBytes(0, 127)).data));
      if (!hdr || hdr.tileType !== 1) {
        await removePackData(st); delete S.packs[st.id]; persist();
        throw new Error(hdr ? 'This map file has picture tiles; PoleCam needs a vector map pack (.pmtiles from Protomaps)' : 'This file is not a map pack (.pmtiles, PMTiles version 3)');
      }
      Object.assign(st, { bbox: st.bbox || hdr.bbox, maxzoom: hdr.maxzoom, done: true });
      if (!S.activePack) S.activePack = st.id;
      persist(); busy(false);
      toast(`${st.name} is ready for offline use`, 3500);
      if (S.base === 'offline') setBase('offline', true);
    } catch (e) {
      if (wr) await wr.stop().catch(() => {});
      if (!job.detached && st && S.packs[st.id] === st && !st.done && !st.bytes) { await removePackData(st).catch(() => {}); delete S.packs[st.id]; } // nothing saved: no half entry
      persist();
      if (!job.cancelled) { busy(false); toast(e === CANCEL ? 'Stopped' : (e.message || String(e)), 8000); }
    } finally {
      if (dl === job) dl = null;
      if (!$('offline').hidden) renderOffline();
    }
  }
  /** Cancel answers at once: the screen is released immediately and the job stops at its next step. */
  $('busyCancel').addEventListener('click', () => {
    const job = dl;
    if (!job || job.cancelled) return;
    job.cancelled = true; try { job.ctl.abort(); } catch (e) { /* already stopped */ }
    busy(false);
    if (job.step === 'downloading with Android') { job.detached = true; dl = null; } // Android finishes that download on its own; its file is then thrown away
    toast(`Stopped (it was ${job.step}). Tap Resume to continue later.`, 5000);
    if (!$('offline').hidden) renderOffline();
  });
  /** Ranged download from a web server that allows it (e.g. GitHub Pages); a server that ignores ranges is read in one stream. */
  const PIECE = 4 * 1024 * 1024;
  const pumpUrl = (url) => async (st, getWriter, job, progress) => {
    const w = await getWriter();
    let size = st.size || 0, tries = 0;
    for (;;) {
      if (size && w.pos >= size) return size;
      const from = w.pos, to = (size ? Math.min(size, from + PIECE) : from + PIECE) - 1;
      job.step = 'downloading';
      let r;
      try { r = await withTimeout(fetch(url, { signal: job.ctl.signal, cache: 'no-store', headers: { Range: `bytes=${from}-${to}` } }), 60000, 'The download stalled'); }
      catch (e) {
        if (job.cancelled) throw CANCEL;
        if (++tries > 4) throw new Error(`The download keeps failing (${e.message}). Check the connection and tap Resume.`);
        await sleep(2000 * tries); continue;
      }
      if (r.status === 206) {
        const cr = /bytes (\d+)-(\d+)\/(\d+)/.exec(r.headers.get('content-range') || '');
        if (!cr || +cr[1] !== from) { r.body && r.body.cancel().catch(() => {}); return streamFrom(url, w, job, progress); } // a wrong part: read the file in one stream instead
        size = +cr[3]; st.size = size;
        const buf = new Uint8Array(await withTimeout(r.arrayBuffer(), 120000, 'The download stalled'));
        if (job.cancelled) throw CANCEL;
        if (buf.length !== +cr[2] - +cr[1] + 1) { if (++tries > 4) throw new Error('The server keeps sending incomplete pieces. Tap Resume later.'); continue; }
        job.step = 'saving to phone storage'; await w.write(buf); tries = 0;
        if (job.cancelled) throw CANCEL;
        progress(w.pos);
      } else if (r.status === 200) { r.body && r.body.cancel().catch(() => {}); return streamFrom(url, w, job, progress); } // no range support
      else if (r.status === 416 && size && w.pos >= size) return size;
      else throw new Error(`Map pack download failed (HTTP ${r.status})`);
    }
  };
  /** Whole-file stream (no ranges), skipping the part already saved. */
  async function streamFrom(url, w, job, progress) {
    job.step = 'downloading';
    const r = await withTimeout(fetch(url, { signal: job.ctl.signal, cache: 'no-store' }), 60000, 'The download stalled');
    if (!r.ok) throw new Error(`Map pack download failed (HTTP ${r.status})`);
    const rd = r.body.getReader(); let skip = w.pos, size = 0;
    for (;;) {
      job.step = 'downloading';
      const { done, value } = await withTimeout(rd.read(), 60000, 'The download stalled').catch((e) => { job.ctl.abort(); throw e; });
      if (job.cancelled) throw CANCEL;
      if (done) break;
      size += value.length;
      let v = value;
      if (skip) { const n = Math.min(skip, v.length); skip -= n; v = v.subarray(n); if (!v.length) continue; }
      job.step = 'saving to phone storage'; await w.write(v);
      if (job.cancelled) throw CANCEL;
      progress(w.pos);
    }
    return size;
  }
  /** APK: Google Drive through Android's own HTTP stack (the in-app browser cannot read Drive files), in resumable pieces. */
  const pumpDrive = (fileId) => async (st, getWriter, job, progress) => {
    const url = driveDownloadUrl(fileId);
    job.step = 'contacting Google Drive';
    let h = null;
    try { h = await withTimeout(nativeCall('CapacitorHttp', 'request', { url, method: 'HEAD', headers: { 'User-Agent': APP_UA() } }), 60000, 'Google Drive did not answer'); } catch (e) { h = null; }
    if (job.cancelled) throw CANCEL;
    const hv = (k) => { const H = (h && h.headers) || {}; const key = Object.keys(H).find((x) => x.toLowerCase() === k); return key ? String(H[key]) : ''; };
    if (h && /text\/html/i.test(hv('content-type'))) throw new Error(DRIVE_HTML_ERR);
    const size = +hv('content-length') || 0;
    if (!h || h.status >= 400 || !size || !/bytes/i.test(hv('accept-ranges'))) return pumpNativeFile(url, st, getWriter, job, progress);
    if (st.size && st.size !== size && st.bytes) { throw new Error('The file on Google Drive has changed since this download started. Delete the partial pack and download again.'); }
    st.size = size; persist();
    const w = await getWriter();
    let tries = 0;
    while (w.pos < size) {
      const from = w.pos, to = Math.min(size, from + PIECE) - 1;
      job.step = 'downloading from Google Drive';
      let r;
      try { r = await withTimeout(nativeGet(url, { Range: `bytes=${from}-${to}` }), 120000, 'The download stalled'); }
      catch (e) {
        if (job.cancelled) throw CANCEL;
        if (++tries > 4) throw new Error(`The download keeps failing (${e.message}). Check the connection and tap Resume.`);
        await sleep(2000 * tries); continue;
      }
      if (job.cancelled) throw CANCEL;
      if (r.status !== 206) throw new Error(r.status === 200 ? 'Google Drive sent the whole file at once; use Open in Drive and Import a pack file' : `Google Drive download failed (HTTP ${r.status})`);
      const bytes = nativeBytes(r.data);
      if (bytes.length !== to - from + 1) { if (++tries > 4) throw new Error('Google Drive sent an incomplete piece. Tap Resume.'); continue; }
      job.step = 'saving to phone storage'; await w.write(bytes); tries = 0;
      if (job.cancelled) throw CANCEL;
      progress(w.pos);
    }
    return size;
  };
  /** APK fallback: Android downloads the whole file, then PoleCam copies it (one stream, no ranges) into its map storage. */
  async function pumpNativeFile(url, st, getWriter, job, progress) {
    job.step = 'downloading with Android';
    const path = `packdl/${st.id}-${Date.now()}.pmtiles`, fs = nativePlugin('Filesystem');
    let lis = null;
    try {
      try { if (fs.proxy) lis = await fs.proxy.addListener('progress', (e) => { if (!job.cancelled && e && e.bytes) busy(`Downloading ${st.name}: ${fmtMB(e.bytes)}${e.contentLength > 0 ? ` of ${fmtMB(e.contentLength)}` : ''}`, e.contentLength > 0 ? e.bytes / e.contentLength : null, true); }); } catch (e) { lis = null; }
      await nativeCall('Filesystem', 'downloadFile', { url, path, directory: 'CACHE', progress: true, recursive: true });
      if (lis && lis.remove) lis.remove(); lis = null;
      if (job.cancelled) throw CANCEL;
      const { uri } = await nativeCall('Filesystem', 'getUri', { path, directory: 'CACHE' });
      const w = await getWriter();
      return await streamFrom(window.Capacitor.convertFileSrc(uri), w, job, progress);
    } finally {
      if (lis && lis.remove) lis.remove();
      nativeCall('Filesystem', 'deleteFile', { path, directory: 'CACHE' }).catch(() => {});
    }
  }
  /** A .pmtiles file on this phone (downloaded from Drive, copied by USB, received in a chat app). */
  const pumpFile = (file) => async (st, getWriter, job, progress) => {
    const w = await getWriter();
    const rd = file.slice(w.pos).stream().getReader();
    for (;;) {
      job.step = 'reading the file';
      const { done, value } = await withTimeout(rd.read(), 60000, 'The file could not be read');
      if (job.cancelled) throw CANCEL;
      if (done) break;
      job.step = 'saving to phone storage'; await w.write(value);
      if (job.cancelled) throw CANCEL;
      progress(w.pos);
    }
    return file.size;
  };
  function downloadPack(p) {
    if (!navigator.onLine) { toast('Connect to the internet (Wi-Fi recommended) to download map packs'); return; }
    if (p.url) return runPackJob(p, pumpUrl(p.url), 'Downloading');
    if (p.drive && NATIVE) return runPackJob(p, pumpDrive(p.drive), 'Downloading');
    return null;
  }
  $('packImport').addEventListener('click', () => { $('packFileInput').value = ''; $('packFileInput').click(); });
  $('packFileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const hdr = pmtilesHeader(new Uint8Array(await f.slice(0, 127).arrayBuffer()));
    if (!hdr) { toast('That file is not a map pack (.pmtiles). Choose the .pmtiles file you downloaded.', 6000); return; }
    if (hdr.tileType !== 1) { toast('That map file has picture tiles; PoleCam needs a vector map pack (.pmtiles from Protomaps)', 6000); return; }
    const base = f.name.replace(/\.pmtiles$/i, ''), id = `file-${C.safeName(base).toLowerCase()}-${f.size}`;
    const known = packCatalog().find((x) => x.size === f.size && (x.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(C.safeName(base).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)));
    await runPackJob({ id: known && known.drive ? known.id : id, name: known ? known.name : base.replace(/[_-]+/g, ' '), size: f.size, bbox: hdr.bbox, maxzoom: hdr.maxzoom }, pumpFile(f), 'Importing');
  });
  $('packAddLink').addEventListener('click', () => {
    const v = $('packLink').value.trim(), id = driveId(v);
    if (!id) { toast('Paste a Google Drive share link, e.g. https://drive.google.com/file/d/…/view'); return; }
    S.packLinks = (S.packLinks || []).filter((x) => x.drive !== id);
    S.packLinks.push({ drive: id, name: $('packLinkName').value.trim() || 'Map pack from Google Drive' });
    persist(); $('packLink').value = ''; $('packLinkName').value = ''; renderOffline();
    toast(NATIVE ? 'Link added. Tap Download.' : 'Link added. Tap Open in Drive, download the file, then Import a pack file.', 4000);
  });
  $('offlineBtn').addEventListener('click', async () => { openSheet('offline'); renderOffline(); await Promise.all([loadPackIndex(), cloudSync(false)]); renderOffline(); });
  $('packRefresh').addEventListener('click', async () => { $('packSource').textContent = 'Checking for map packs…'; await Promise.all([loadPackIndex(), cloudSync(true)]); renderOffline(); });
  $('clearTiles').addEventListener('click', () => {
    const b = $('clearTiles');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to delete viewed tiles'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'Delete viewed map tiles'; }, 4000); return; }
    guard(async () => { await dbClear('tiles'); S.areas = []; persist(); await renderOffline(); toast('Viewed map tiles deleted'); });
  });

  /* ================= app log screen ================= */
  const two = (n) => String(n).padStart(2, '0');
  const logTime = (t) => { const d = new Date(t); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`; };
  const logLine = (x) => `${logTime(x.t)} ${{ i: 'I', w: 'W', e: 'E' }[x.l] || '?'} ${x.e}${x.d !== undefined ? ' ' + (typeof x.d === 'string' ? x.d : JSON.stringify(x.d)) : ''}`;
  async function logReport() {
    const info = { app: `PoleCam ${APP_VER}`, apk: NATIVE, ua: navigator.userAgent, memoryGB: navigator.deviceMemory, cores: navigator.hardwareConcurrency,
      screen: `${screen.width}×${screen.height} @${devicePixelRatio}`, opfs: OPFS_OK, base: S.base, streetServer: streetSource().name, records: points.length, projects: allProjects().length,
      photoCheck: effectiveQuality(), heapMB: memMB(), list: S.team ? `v${S.team.rev}` : 'none' };
    try { const e = await withTimeout(navigator.storage.estimate(), 3000, 'slow'); info.storageUsedMB = Math.round((e.usage || 0) / 1048576); info.storageQuotaMB = Math.round((e.quota || 0) / 1048576); } catch (e) { /* ignore */ }
    for (const st of ['points', 'photos', 'tiles', 'packs']) { try { info[`count_${st}`] = await withTimeout(dbCount(st), 5000, 'slow'); } catch (e) { info[`count_${st}`] = `error: ${e.message}`; } }
    const lines = LOG.all().map(logLine);
    return `PoleCam app log — ${logTime(Date.now())}\n${Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${lines.join('\n')}\n`;
  }
  function renderLog() {
    const all = LOG.all(), errs = all.filter((x) => x.l === 'e').length, warns = all.filter((x) => x.l === 'w').length;
    $('logSummary').textContent = all.length ? `${all.length} entries since ${logTime(all[0].t).slice(0, 16)} · ${errs} error${errs === 1 ? '' : 's'} · ${warns} warning${warns === 1 ? '' : 's'}` : 'The log is empty.';
    $('logView').textContent = all.slice(-250).reverse().map(logLine).join('\n');
    $('logSub').textContent = errs ? `${errs} error${errs === 1 ? '' : 's'} logged — open to send` : 'Errors and timings, to send for support';
  }
  $('goLog').addEventListener('click', () => { LOG.flush(); renderLog(); openSheet('logSheet'); });
  $('logShare').addEventListener('click', () => guard(async () => {
    const text = await logReport(), name = `PoleCam_log_${stamp8()}.txt`;
    await shareFile(new Blob([text], { type: 'text/plain' }), name, 'text/plain');
  }, 'Could not send the log'));
  $('logCopy').addEventListener('click', async () => {
    const text = await logReport();
    try { await navigator.clipboard.writeText(text); toast('Log copied'); } catch (e) { toast('Copy is blocked here: use Send log'); }
  });
  $('logClear').addEventListener('click', () => {
    const b = $('logClear');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to clear'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'Clear'; }, 3500); return; }
    delete b.dataset.armed; b.textContent = 'Clear'; LOG.clear(); LOG.mark('log.cleared'); renderLog();
  });
  /** A full photo save without the camera: makes a 12 MP picture, prepares it, writes and reads it back, then deletes it. */
  async function selfTest() {
    const out = { heapMB: memMB() };
    LOG.step('selftest', out); busy('Testing photo saving…');
    try {
      let t = Date.now();
      const cv = document.createElement('canvas'); cv.width = 4000; cv.height = 3000;
      const g = cv.getContext('2d');
      for (let i = 0; i < 1200; i++) { g.fillStyle = `hsl(${(i * 37) % 360},55%,${25 + (i * 7) % 50}%)`; g.fillRect((i * 331) % 4000, (i * 197) % 3000, 40 + (i % 9) * 30, 30 + (i % 7) * 25); }
      const big = await toBlob(cv, 0.92); cv.width = cv.height = 0;
      if (!big) throw new Error('The phone could not make a test JPEG');
      out.make = Date.now() - t; out.kb = Math.round(big.size / 1024);
      t = Date.now(); const { clean, thumb } = await makeStoredImages(big); out.prepare = Date.now() - t;
      t = Date.now(); await withTimeout(dbPut('photos', { id: '__selftest', clean, thumb }), STORE_MS, 'write timeout'); out.write = Date.now() - t;
      t = Date.now(); const back = await withTimeout(dbGet('photos', '__selftest'), STORE_MS, 'read timeout'); out.read = Date.now() - t;
      out.readOk = !!(back && back.clean && back.clean.size === clean.size);
      await dbDel('photos', '__selftest').catch(() => {});
      if (NATIVE) { t = Date.now(); await nativeWrite(big, 'selftest.jpg', 'CACHE'); out.fileWrite = Date.now() - t; nativeCall('Filesystem', 'deleteFile', { path: 'selftest.jpg', directory: 'CACHE' }).catch(() => {}); }
      out.heapAfterMB = memMB();
      LOG.info('selftest.done', out); LOG.done('selftest');
      return { ok: true, out };
    } catch (e) { LOG.error('selftest.fail', { ...out, ...errInfo(e) }); LOG.done('selftest'); return { ok: false, out, e }; } finally { busy(false); }
  }
  $('logTest').addEventListener('click', async () => {
    const r = await selfTest(), o = r.out, sec = (v) => (v == null ? '–' : `${(v / 1000).toFixed(1)} s`);
    $('logTestOut').hidden = false;
    $('logTestOut').textContent = r.ok
      ? `Save test OK: make 12 MP ${sec(o.make)} · prepare ${sec(o.prepare)} · write ${sec(o.write)} · read ${sec(o.read)}${o.fileWrite != null ? ` · file ${sec(o.fileWrite)}` : ''}${o.readOk ? '' : ' · READ BACK FAILED'}`
      : `Save test FAILED: ${(r.e && r.e.message) || r.e} (after: ${Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ')})`;
    renderLog();
  });
  /* background facts for the log: map tile results and long freezes of the screen */
  { let lastOk = 0, lastFail = 0;
    setInterval(() => { if (streetState.ok !== lastOk || streetState.failed !== lastFail) { LOG.info('tiles', { src: streetSource().id, ok: streetState.ok - lastOk, failed: streetState.failed - lastFail, queued: tileQueue.length, running: tileBusy }); lastOk = streetState.ok; lastFail = streetState.failed; } }, 60000); }
  try {
    let lastLong = 0;
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.duration > 700 && Date.now() - lastLong > 3000) { lastLong = Date.now(); LOG.info('freeze', { ms: Math.round(e.duration), heapMB: memMB() }); } }).observe({ entryTypes: ['longtask'] });
  } catch (e) { /* not supported */ }

  /* ================= start ================= */
  $('captureBtn').addEventListener('click', () => {
    if (visitStage() === 'Cleanup') { // the cleanup works on the PAT pins only: photos are taken from a pin's card
      const t = nextTarget();
      toast(t ? 'Open the pin, then tap “📷 Photo of the fix” on the item' : 'All items are fixed. Share the cleanup KMZ from Projects.', 4500);
      if (t) openVisit(t.r.id, true); return;
    }
    openCamera('new');
  });
  (async () => {
    const tl = Date.now();
    try { points = await dbAll('points'); } catch (e) { LOG.error('start.loadPoints', errInfo(e)); toast('Storage unavailable: ' + e.message, 6000); }
    LOG.mark('app.start', { ver: APP_VER, apk: NATIVE, chrome: (/Chrome\/([\d.]+)/.exec(navigator.userAgent) || [])[1], android: (/Android ([\d.]+)/.exec(navigator.userAgent) || [])[1], memoryGB: navigator.deviceMemory, cores: navigator.hardwareConcurrency, opfs: OPFS_OK, records: points.length, loadMs: Date.now() - tl, heapMB: memMB() });
    (async () => {
      const info = {};
      try { const e = await withTimeout(navigator.storage.estimate(), 3000, 'slow'); info.usedMB = Math.round((e.usage || 0) / 1048576); info.quotaMB = Math.round((e.quota || 0) / 1048576); info.persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { info.estimate = e.message; }
      for (const st of ['photos', 'tiles', 'packs']) { try { info[st] = await withTimeout(dbCount(st), 8000, 'slow'); } catch (e) { info[st] = `error: ${e.message}`; } }
      LOG.info('storage', info);
    })();
    if (!S.projects.includes(S.project)) S.projects.push(S.project);
    renderPoles(); drawAreas();
    if (!S.view) fitProject();
    if (S.base === 'offline' && !activePackId()) setBase('street', true);
    goOfflineIfPossible();
    startGps();
    if (S.dropSatTiles) { // v1.7: satellite imagery kept by older versions is removed (Esri allows offline imagery only in ArcGIS apps)
      try { await tx('tiles', 'readwrite', (st) => st.delete(IDBKeyRange.bound('satellite/', 'satellite/\uffff'))); delete S.dropSatTiles; persist(); } catch (e) { /* try again next start */ }
    }
    if (!profileOk()) openProfile(true);
    cloudSync(false);
  })();
  // Files handed to other apps through Share are temporary: clear them each time the APK starts.
  if (NATIVE) nativeCall('Filesystem', 'rmdir', { path: 'share', directory: 'CACHE', recursive: true }).catch(() => {});
  // The APK already carries every file, so the offline cache is only for the website version.
  if (!NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__polecam = { get points() { return points; }, get S() { return S; }, openEditor, addEdPhoto, exportPhoto, showExport: (sel) => showExport(String(sel).replace(/^#/, '')), tilesFor, closeDb: async () => (await idb()).close(), nativeWrite, grabGuideCrop, prepForOcr, ocrRun,
    packShare, unpackShare, importTeamText, readIdFrom, checkQuality, makeStoredImages, poleTypes, LOG, selfTest, logReport }; // for testing
})();
