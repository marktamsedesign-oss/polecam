/* G-eSAA (Geo electronic Survey, Audit & Acceptance; formerly PoleCam Survey) — field app for OSP survey, audit and acceptance.
   Depends on Leaflet (L) and core.js (PoleCore). Internal names (storage, links, data files) keep 'polecam' so updates keep the data. */
(() => {
  'use strict';
  /* A join link (…/polecam/#join=…) carries the signed company list: read it before anything else, then clear the address. */
  const H0 = location.hash, pendingJoin = (/[#&]join=([^&#]+)/.exec(H0) || [])[1] || null, pendingKey = (/[#&]ck=([A-Za-z0-9-]+)/.exec(H0) || [])[1] || null;
  const pendingJq = (/[#&]jq=([A-Za-z0-9_-]+)/.exec(H0) || [])[1] || null; // v2.15 short join code: the list comes from the online sheet
  const pendingMv = (/[#&]mv=([A-Za-z0-9_-]+)/.exec(H0) || [])[1] || null; // v2.15 the user moving to this phone
  if (pendingJoin || pendingKey || pendingJq || pendingMv) history.replaceState(null, '', location.pathname + location.search);
  /* Camera button position for one-hand use: centre by default, right or left in Settings → Camera. */
  const handOf = () => (['left', 'center', 'right'].includes(S && S.hand) ? S.hand : 'center');
  function applyHand() { const h = handOf(); ['left', 'center', 'right'].forEach((x) => document.body.classList.toggle(`hand-${x}`, x === h)); }
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
  /* Survey points (v2.13): the poles and the network elements an As-plan, As-built or Audit survey records, each its own pin
     with one photo. A POI (point of insertion) is a closure on a pole, or a handhole with a closure inside. */
  const SV_ELEMENTS = ['Pole', 'Site', 'ODC', 'ODF', 'NAP', 'Closure', 'Handhole'];
  const SV_PREFIX = { ODC: 'ODC', NAP: 'NAP', Closure: 'CL', Handhole: 'HH' };
  const SV_COLORS = { Pole: '#e8590c', Site: '#9c36b5', ODC: '#2b8a3e', ODF: '#1971c2', NAP: '#f08c00', Closure: '#c2255c', Handhole: '#495057' };
  const SV_SHORT = { Site: 'SITE', ODC: 'ODC', ODF: 'ODF', NAP: 'NAP', Closure: 'CL', Handhole: 'HH' };
  const ROUTE_ELS = ['Pole', 'Handhole', 'Site', 'ODC', 'ODF']; // NAP and closure pins sit on a pole: they are not route points
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
  /** Company names compared without case, punctuation or Inc./Corp./Co./Ltd. endings (the same rule as the sheet script). */
  function normCo(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|opc|llc)\b/g, ' ').replace(/\s+/g, ''); }
  /** One sheet cell may name several vendors: "NOKIA , HUAXIN". */
  const coList = (v) => String(v || '').split(/\s*(?:[,;/&+\n]|\band\b)\s*/i).map(normCo).filter(Boolean);
  /** Staff of the list's admin company (chosen with the admin PIN). Names compare as in normCo, the same as the PIN check. */
  /** Admin users: when the admin lists their emails, only those people may use the admin company (and its PIN). */
  const adminUserOk = (email) => { const L = pol().adminUsers || []; const e = String(email != null ? email : (S.user && S.user.email) || '').trim().toLowerCase(); return !L.length || L.includes(e); };
  const isInspector = () => { const o = pol().owner; return !o || !S.user || (normCo(S.user.company) === normCo(o) && adminUserOk()); };
  /** Who records PAT defects and accepts fixes at FAT (v2.10): the vendor's users too, by default (the Globe representative
      signs the printed form). The admin can keep it to the admin company (Manage → Field standards). */
  const canRecord = () => pol().vendorRecords !== false || isInspector();
  const DEF = {
    project: '', projects: [], // v2.15: no default project; the user creates one before the first photo
    stamp: true, maxPx: 2048, myTypes: [],
    zone: 51, sym: 1, txt: 1.5, base: 'street', lastPoleId: '', lastType: 'Concrete', view: null, areas: [],
    meta: {}, defects: JSON.parse(JSON.stringify(DEF_CHECK)), userName: '',
    listSort: 'new', listGroup: true,
    quality: 'strict', readId: true, idOrient: 'h', maxSpan: 200, angleDeg: 15, autoGap: 120, user: null, team: null,
    exp: { maxPx: 2048, quality: 0.88, stamp: true, stampFields: ['id', 'coords', 'utm', 'time', 'by', 'project'], naming: 'id',
      kmzBalloonPx: 800, kmzIconPx: 64, kmzRoute: true, kmzStamp: true, pdfPhotoSize: 'M', pdfAnnexA: true, pdfAnnexB: true, pdfDates: 'blank', xlsTable: true, xlsPhotos: true, kmzData: true,
      dxfPhotos: true, dxfPhotoW: 6, focPct: 10 },
    saveBase: 'DOCUMENTS', saveFolder: 'G-eSAA', saveByProject: true,
  };
  let S = (() => { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem('polecam.settings') || '{}')); } catch (e) { return { ...DEF }; } })();
  applyHand();
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
      r.onblocked = () => fail(new Error('Storage is busy in another G-eSAA tab. Close other tabs and try again.'));
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
  /** The Android app's own reader (ML Kit text and QR recognition, v2.15), when the APK was built with it. */
  const nativeReader = () => NATIVE && !!(window.Capacitor && typeof window.Capacitor.isPluginAvailable === 'function' && window.Capacitor.isPluginAvailable('TextReader'));
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
  const svPurpose = (name) => pmeta(name).purpose || 'As-plan';
  /** Status choices of a survey element: As-plan proposed / new or existing, As-built new (built) or existing (used), Audit existing. */
  function svStatuses(el, purpose) {
    const p = purpose || svPurpose();
    if (!el) return [];
    if (p === 'Audit') return el === 'Pole' ? [] : ['Existing'];
    if (p === 'As-built') return ['New', 'Existing']; // v2.14: poles too — mark the new poles, closures, ODF…
    if (el === 'Pole') return ['Existing', 'Proposed']; // v2.14: a proposed new pole (PP-0001) in an As-plan
    return el === 'Site' ? ['New', 'Existing'] : ['Proposed', 'Existing'];
  }
  const SV_DEF = { 'As-plan': { Pole: 'Existing', NAP: 'Existing', Closure: 'Existing', Handhole: 'Existing' }, 'As-built': { Pole: 'Existing' } };
  /** The status a new point starts with: the last one chosen for that element in that kind of survey, else the usual one. */
  const svDefaultStatus = (el, purpose) => {
    const p = purpose || svPurpose(), l = svStatuses(el, p), last = (S.lastSt || {})[`${p}|${el}`];
    return l.includes(last) && !(el === 'Pole' && last === 'Proposed') ? last : (SV_DEF[p] && SV_DEF[p][el]) || l[0] || ''; // a proposed pole is chosen each time
  };
  const svStatusLabel = (st, purpose) => ((purpose || svPurpose()) === 'As-built' ? { New: 'New (built)', Existing: 'Existing (used)' }[st] : '') || st || '';
  const isPoi = (r) => elemOf(r) === 'Closure' || (elemOf(r) === 'Handhole' && !!r.closureId);
  /** "ODF · Proposed", "Handhole · Existing · closure CL-0101", "Pole · Proposed" (survey points). */
  const svDesc = (r, purpose) => [elemOf(r), svStatusLabel(r.status, purpose), elemOf(r) === 'Handhole' && r.closureId ? `closure ${r.closureId}` : ''].filter(Boolean).join(' · ');
  /* Pole details (v2.14): what else is on the pole, with a count — "Transformer: 1 pc". */
  const POLE_DETAIL_ITEMS = ['Transformer', 'Streetlight', 'Riser pipe', 'Guy wire', 'Down guy / anchor', 'Crossarm', 'Electric meter', 'Service drop', 'Other telco cable'];
  const detailsText = (list, sep) => (list || []).filter((x) => x && x.item).map((x) => `${x.item}: ${x.qty || 1} pc${(x.qty || 1) === 1 ? '' : 's'}`).join(sep || '; ');
  const PP_RE = /^PP-(\d+)$/; // proposed poles: the app numbers them, as there is no painted ID yet
  /** The photo that stands for a record (list, KMZ icon): its element photo, or the first defect photo (v2.13 records have none). */
  const coverPid = (r) => { const p = photosOf(r)[0]; if (p) return p.pid; const d = (r.defs || []).find((x) => x.verifyPid || x.afterPid || x.pid); return d ? d.verifyPid || d.afterPid || d.pid : null; };
  function allPids(r) {
    const s = photosOf(r).map((p) => p.pid);
    if (r.origPid) s.push(r.origPid); // the unmarked photo of a marked survey photo (v2.15)
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
    if ((!element || element === 'Pole') && ed && !ed.acc && ed.status === 'Proposed') {
      const n = recs.filter((p) => PP_RE.test(p.poleId || '')).reduce((m, p) => Math.max(m, +PP_RE.exec(p.poleId)[1]), 0);
      return `PP-${String(n + 1).padStart(4, '0')}`;
    }
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
    if (!isAcc() && SV_ELEMENTS.includes(element)) { // survey: NAP-, CL-, HH-, ODC- and the number; a site keeps its own name
      const nx = pts.length ? C.nextPoleId(latest(pts).poleId) : '';
      return nx || (SV_PREFIX[element] ? `${SV_PREFIX[element]}-` : '');
    }
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

  /* ================= on-screen keyboard (v2.15) =================
     The Save bar stays above the keyboard while typing, and the editor's small map gives way so the field stays in view.
     With interactive-widget=resizes-content the page itself shrinks; where a phone only shrinks the visible part, the
     sheets are lifted by the keyboard's height instead. */
  (() => {
    let tallest = window.innerHeight;
    const typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(checkbox|radio|button|file|range|color|date)$/.test(a.type))); };
    const update = () => {
      const vv = window.visualViewport, ih = window.innerHeight;
      if (!typing()) tallest = Math.max(ih, tallest > ih * 1.6 ? ih : tallest); // a rotated phone starts over
      const lift = vv ? Math.max(0, Math.round(ih - vv.height - vv.offsetTop)) : 0;
      const open = typing() && (lift > 80 || ih < tallest - 120);
      document.documentElement.style.setProperty('--kb', `${lift > 80 ? lift : 0}px`);
      if (document.body.classList.contains('kb') !== open) {
        document.body.classList.toggle('kb', open);
        if (!open) setTimeout(() => { try { if (pinMap) pinMap.invalidateSize({ animate: false }); } catch (e) { /* not ready */ } }, 60);
      }
    };
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', update); window.visualViewport.addEventListener('scroll', update); }
    window.addEventListener('resize', update);
    document.addEventListener('focusin', () => setTimeout(update, 300)); document.addEventListener('focusout', () => setTimeout(update, 120));
  })();

  /* ================= full-size photo (v2.14): tap any photo; tap the photo to zoom; × or Back closes ================= */
  let pvUrl = '', pvOpen = false;
  function showBlob(blob, caption) {
    if (!blob) return;
    if (pvUrl) URL.revokeObjectURL(pvUrl);
    pvUrl = URL.createObjectURL(blob);
    $('pvImg').src = pvUrl; $('pvCap').textContent = caption || ''; $('photoView').classList.remove('zoomed'); $('photoView').hidden = false;
    $('pvTools').hidden = true; $('pvHint').textContent = 'Tap the photo to zoom in or out · × or Back to close';
    if (!pvOpen) { pvOpen = true; history.pushState({ photo: 1 }, ''); }
  }
  function hidePhotoView() { $('photoView').hidden = true; $('photoView').classList.remove('zoomed'); $('pvImg').src = ''; if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = ''; } }
  const closePhotoView = () => { if (pvOpen) history.back(); else hidePhotoView(); };
  $('pvClose').addEventListener('click', (e) => { e.stopPropagation(); closePhotoView(); });
  $('photoView').addEventListener('click', (e) => { if (e.target === $('photoView')) closePhotoView(); });
  $('pvImg').addEventListener('click', (e) => {
    e.stopPropagation();
    const v = $('photoView'), box = $('pvScroll'), r = $('pvImg').getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    v.classList.toggle('zoomed');
    if (v.classList.contains('zoomed')) requestAnimationFrame(() => { box.scrollLeft = fx * box.scrollWidth - box.clientWidth / 2; box.scrollTop = fy * box.scrollHeight - box.clientHeight / 2; });
  });

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
    if (pvOpen) { pvOpen = false; hidePhotoView(); return; } // Back closes the full-size photo first
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
    if (id === 'boxer') { if (boxer && boxer.im && boxer.im.close) boxer.im.close(); boxer = null; }
    if (id === 'list') revokeListUrls();
    if (id === 'qrScan') stopQrScan();
    if (id === 'visitCard') { visitId = null; document.body.classList.remove('visiting'); revokeVisitUrls(); wayLayer.clearLayers(); }
    if (id === 'profile' && !profileOk()) setTimeout(() => { openProfile(true); toast('Enter your details to start using G-eSAA', 3000); }, 0);
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
  const applyTextSize = () => { const v = [0.9, 1, 1.15, 1.3, 1.45].includes(+S.textScale) ? +S.textScale : 1; document.documentElement.style.setProperty('--fs', String(v)); $('setTextSize').value = String(v); };
  applyTextSize();
  $('setTextSize').addEventListener('change', () => { S.textScale = +$('setTextSize').value; persist(); applyTextSize(); if (typeof map !== 'undefined' && map) setTimeout(() => map.invalidateSize(), 50); });
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
  const APP_VER = '2.15.0';
  /* The APK shows its screens from https://localhost, and OpenStreetMap's tile servers refuse map requests from such pages.
     In the APK the tiles are therefore fetched by Android itself, identified as PoleCam (OSM asks apps to identify themselves). */
  const APP_UA = () => `G-eSAA/${APP_VER} (+${SITE})`;
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
      const acc = p.kind === 'acceptance', n = openCount(p), sel = routeMode && p.id === routeSel, el = elemOf(p);
      const m = !acc && el !== 'Pole' && SV_SHORT[el] // survey element: a labelled square (dashed when proposed / new)
        ? L.marker([p.lat, p.lon], { keyboard: false, icon: L.divIcon({ className: 'svpin-wrap', html: `<span class="svpin${sel ? ' sel' : ''}${p.status === 'Proposed' || p.status === 'New' ? ' new' : ''}" style="--c:${SV_COLORS[el]}">${SV_SHORT[el]}</span>`, iconSize: [30, 24], iconAnchor: [15, 12] }) })
        : L.circleMarker([p.lat, p.lon], { radius: sel ? 12 : acc && el !== 'Pole' ? 10 : 8, weight: sel ? 4 : !acc && p.status === 'New' ? 3 : 2,
          color: sel ? '#17202a' : acc && el !== 'Pole' ? '#17202a' : !acc && p.status === 'Proposed' ? '#e03131' : !acc && p.status === 'New' ? '#17202a' : '#fff',
          dashArray: !acc && p.status === 'Proposed' && !sel ? '3 3' : null,
          fillColor: acc ? STATUS_COLORS[recStatus(p)] : typeColor(p.poleType), fillOpacity: !acc && p.status === 'Proposed' ? 0.5 : 1 });
      const role = R && R.poles[p.id] && (R.poles[p.id].role === 'Angle' ? ` · ${Math.round(R.poles[p.id].deflection)}°` : R.poles[p.id].role === 'Junction' ? ' · junction' : '');
      m.bindTooltip(`${C.xmlEsc(p.poleId || '(no ID)')}${acc && n ? ` · ${n} open` : ''}${role || ''}`, { permanent: true, direction: 'right', offset: [!acc && el !== 'Pole' ? 14 : 8, 0], className: 'pole-label' });
      m.on('click', () => (routeMode ? routeTap(p.id) : visitMode() ? openVisit(p.id) : openEditorFor(p.id)));
      m.addTo(poleLayer);
    }
    $('projectName').textContent = S.project || 'No project · tap to add';
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
    renderSummary0(pts);
    const W = pts.length && S.project ? workflowModel() : null, ready = !!(W && W.next && W.next.go === 'complete');
    $('mapSummary').dataset.complete = ready ? '1' : '';
    if (ready) $('sumPills').insertAdjacentHTML('afterbegin', '<span class="pill ok done">✓ Complete</span>'); // every step done but the last: one tap to complete
    if (!$('legend').hidden) renderLegend();
  }
  function renderSummary0(pts) {
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
      const R = routeModel(), np = pts.filter((p) => elemOf(p) === 'Pole').length, no = pts.length - np, other = no ? ` · ${no} other` : '';
      $('sumTitle').textContent = R.spans.length ? `${np} pole${np === 1 ? '' : 's'}${other} · route ${fmtLen(st.len)} · ${R.spans.length} span${R.spans.length === 1 ? '' : 's'}` : `${np} pole${np === 1 ? '' : 's'}${other} captured`;
      $('sumSub').textContent = !R.spans.length ? (routePts().length > 1 ? 'Next: link the route (route button)' : 'Capture the next pole to start the route')
        : st.long ? `${st.long} span${st.long === 1 ? '' : 's'} over ${pol().maxSpan || 200} m — check the route` : R.off ? `${R.off} point${R.off === 1 ? '' : 's'} not on the route yet` : W && W.next ? `Next: ${W.next.t}` : 'All steps done';
      $('sumPills').innerHTML = !R.spans.length ? '' : st.long ? pill('bad', `${st.long} long`) : R.off ? pill('note', `${R.off} unlinked`) : pill('ok', 'Spans OK');
    }
  }
  $('mapSummary').addEventListener('click', () => {
    if ($('mapSummary').dataset.complete === '1') { openProjects(); requestAnimationFrame(() => $('doneBtn').scrollIntoView({ block: 'center' })); return; } // ready to complete
    const t = visitMode() && nextTarget(); if (t) openVisit(t.r.id, true); else $('listBtn').click();
  });
  /* ---- map legend (v2.15) ---- */
  function renderLegend() {
    const L2 = $('legend'), dot = (c, t) => `<span class="lg"><span class="sw" style="background:${c}"></span>${C.xmlEsc(t)}</span>`, sq = (c, k, t) => `<span class="lg"><span class="sq" style="background:${c}">${k}</span>${C.xmlEsc(t)}</span>`;
    let h = '';
    if (isAcc()) h = dot(STATUS_COLORS.Open, 'Open defect') + dot(STATUS_COLORS.Rectified, 'Fixed · to check') + dot(STATUS_COLORS.Verified, 'Verified') + dot(STATUS_COLORS.OK, 'No deficiency');
    else {
      const used = [...new Set(projPoints().filter((p) => elemOf(p) === 'Pole').map((p) => p.poleType || ''))].filter(Boolean);
      h = (used.length ? used : [S.lastType || 'Concrete']).map((t) => dot(typeColor(t), `${t} pole`)).join('')
        + '<span class="lg"><span class="sw" style="background:#fff;border:2px dashed #e03131"></span>Proposed pole</span><span class="lg"><span class="sw" style="background:#fff;border:3px solid #17202a"></span>New pole (As-built)</span>'
        + Object.keys(SV_SHORT).map((el) => sq(SV_COLORS[el], SV_SHORT[el], el === 'Closure' ? 'Closure (POI)' : el)).join('');
    }
    h += '<span class="lg"><span class="sw" style="background:#1c7ed6"></span>You (GPS)</span>' + (isAcc() ? '<span class="lg"><span class="ln"></span>Way to the pin you opened</span>' : '<span class="lg"><span class="ln" style="border-top-style:solid"></span>Linked route, span length</span>');
    L2.innerHTML = h;
  }
  $('legendBtn').addEventListener('click', () => { const on = $('legend').hidden; if (on) renderLegend(); $('legend').hidden = !on; $('legendBtn').setAttribute('aria-expanded', String(on)); });

  /* ================= reference KMZ: HLD route, homing and POI pins (read-only overlay) ================= */
  /* Any KMZ / KML can be loaded per project and is drawn under the pins as thin dashed lines and small dots. It is only a
     guide: the survey can take another route, and the reference is never exported or changed. Kept in IndexedDB. */
  const REF_COL = '#7048e8', REF_MAX_PTS = 20000, REF_MAX_LINES = 5000;
  const refKey = (id) => `~ref:${id}`;
  let refGeo = null, refFor = null;
  const refInfo = (name) => (S.refs || {})[name || S.project] || null;
  function kmlColor(t) { const v = String(t || '').trim(); return /^[0-9a-f]{8}$/i.test(v) ? `#${v.slice(6, 8)}${v.slice(4, 6)}${v.slice(2, 4)}` : null; }
  /** Pins, lines and areas of a KML document, with their colours and folder names. */
  /** KML that Google Earth opens but a strict XML reader refuses: prefixes used without being declared (e.g. mwm: from
      Organic Maps / MAPS.ME bookmarks) and bare & in names. Those are repaired; nothing else in the file is changed. */
  function repairKml(text) {
    let t = String(text).replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
    const used = new Set([...t.matchAll(/<\/?([A-Za-z_][\w.-]*):[A-Za-z_]/g)].map((m) => m[1]).concat([...t.matchAll(/\s([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*\s*=/g)].map((m) => m[1])));
    const missing = [...used].filter((p) => p !== 'xml' && p !== 'xmlns' && !new RegExp(`xmlns:${p}\\s*=`).test(t));
    if (missing.length) t = t.replace(/<kml\b/, `<kml ${missing.map((p) => `xmlns:${p}="urn:polecam:undeclared:${p}"`).join(' ')}`);
    return { text: t, fixed: missing };
  }
  function parseKml(text) {
    const parse = (t) => new DOMParser().parseFromString(t, 'application/xml'), bad = (d) => d.getElementsByTagName('parsererror').length > 0;
    let doc = parse(text);
    if (bad(doc)) {
      const r = repairKml(text); doc = parse(r.text);
      if (bad(doc)) throw new Error('This KML file could not be read (it is not valid XML)');
      LOG.info('kml.repaired', { prefixes: r.fixed });
    }
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
  /** KML text: UTF-8, or UTF-16 when the file starts with its byte-order mark. */
  const kmlText = (u8) => new TextDecoder(u8[0] === 0xFF && u8[1] === 0xFE ? 'utf-16le' : u8[0] === 0xFE && u8[1] === 0xFF ? 'utf-16be' : 'utf-8').decode(u8);
  async function loadRefFile(f) {
    busy('Reading the reference KMZ…');
    const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
    let text;
    if (head[0] === 0x50 && head[1] === 0x4b) { // a KMZ is a ZIP
      const z = await zipReader(f), name = z.names.find((n) => /(^|\/)doc\.kml$/i.test(n)) || z.names.find((n) => /\.kml$/i.test(n));
      if (!name) throw new Error('There is no KML inside this KMZ');
      text = kmlText(await z.get(name));
    } else text = kmlText(new Uint8Array(await f.arrayBuffer()));
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
  /** Points the cable route runs through: poles, handholes, the site, ODC and ODF (NAP and closure pins sit on a pole). */
  const routePts = () => projPoints().filter((p) => ROUTE_ELS.includes(elemOf(p)));
  const routeModel = () => C.analyzeRoute(routePts(), links(), { maxSpan: pol().maxSpan || 200, angleDeg: pol().angleDeg || 15 });
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
    const tapped = points.find((p) => p.id === id);
    if (tapped && !ROUTE_ELS.includes(elemOf(tapped))) { toast(`${tapped.poleId}: ${elemOf(tapped)} pins sit on a pole and are not linked. Tap the pole.`, 3500); return; }
    if (!routeSel || routeSel === id) { routeSel = routeSel === id ? null : id; renderPoles(); return; }
    const l = links().map((x) => x.slice()), k = l.findIndex(([x, y]) => (x === routeSel && y === id) || (x === id && y === routeSel));
    routeUndo.push(links());
    if (k >= 0) l.splice(k, 1); else l.push([routeSel, id]);
    setLinks(l); routeSel = id; renderPoles();
  }
  $('routeBtn').addEventListener('click', () => {
    if (!routeMode && routePts().length < 2) { toast('Capture at least two poles first'); return; }
    setRouteMode(!routeMode);
  });
  $('rbDone').addEventListener('click', () => setRouteMode(false));
  $('rbUndo').addEventListener('click', () => { if (routeUndo.length) { setLinks(routeUndo.pop()); renderPoles(); } });
  $('rbAuto').addEventListener('click', () => {
    const have = new Set(links().map(([x, y]) => [x, y].sort().join('|')));
    const add = C.autoLinks(projPoints().filter((p) => ['Pole', 'Handhole'].includes(elemOf(p))), pol().autoGap || 120).filter(([x, y]) => !have.has([x, y].sort().join('|'))); // the site, ODC and ODF are linked by hand
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
    const msg = err.code === 1 ? 'Location is off or blocked — turn it on and allow G-eSAA' : 'Searching for GPS…';
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
    $('scanTitle').textContent = camTarget === 'newid' ? 'Photo kept · scan the ID' : 'Scan the ID';
    $('scanSkip').hidden = camTarget !== 'newid';
    $('orientH').setAttribute('aria-pressed', String(S.idOrient !== 'v'));
    $('orientV').setAttribute('aria-pressed', String(S.idOrient === 'v'));
    $('camReadId').hidden = camTarget !== 'new';
    $('camReadId').setAttribute('aria-pressed', String(S.readId !== false));
    $('camNative').hidden = on;
    shutterState();
    if (on && stream) { if (!finder.on) setZoom(S.scanZoom || 1); finderStart(); }
    else { finderStop(); if (stream && zoomLevel > zoomMax()) setZoom(1); else renderZoomBar(); }
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
  $('orientH').addEventListener('click', () => { S.idOrient = 'h'; persist(); finderStop(); showGuide(); });
  $('scanHelp').addEventListener('click', () => { const on = $('scanSub').hidden; $('scanSub').hidden = !on; $('scanHelp').setAttribute('aria-expanded', String(on)); });
  $('orientV').addEventListener('click', () => { S.idOrient = 'v'; persist(); finderStop(); showGuide(); });
  $('scanSkip').addEventListener('click', () => closeSheet()); // the photo is kept; the editor opens without an ID reading
  async function openCamera(target) {
    camTarget = target || 'new'; camPending = null; camSeq++;
    openSheet('camera'); startGps();
    $('camMsg').hidden = true; $('camTorch').hidden = true; $('qualBox').hidden = true; camCheck(false);
    showGuide();
    if ((camTarget === 'new' && S.readId !== false) || camTarget === 'scan') ocrWarm();
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
      zoomCaps = caps.zoom && caps.zoom.max > (caps.zoom.min || 1) * 1.2 ? caps.zoom : null; zoomLevel = 1; $('video').style.transform = '';
      LOG.info('camera.zoom', zoomCaps ? { min: zoomCaps.min, max: zoomCaps.max, step: zoomCaps.step } : { digital: true });
      showGuide(); // the zoom buttons and the live ID reader need the stream
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
    finderStop(); persist(); // keeps the zoom used for reading IDs
    stream = null; imageCapture = null; torchOn = false; zoomCaps = null; zoomLevel = 1;
    $('video').srcObject = null; $('video').style.transform = ''; $('zoomBar').hidden = true;
    clearInterval(camTick);
    if (qualResolve) { qualResolve(false); qualResolve = null; }
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    if (camPending) { // the camera closed during the ID step (Skip, X or Back): the photo is still used, once its check is done
      const p = camPending; camPending = null;
      setTimeout(async () => {
        const q = p.q || (p.qp ? await p.qp : null);
        if (q && q.flags && q.flags.length) { toast(`${QUAL_TITLE[q.flags[0]] || 'Photo not accepted'}. ${QUAL_TEXT[q.flags[0]] || 'Take it again.'}`, 7000); return; }
        gotPhoto(p.blob, p.gps, p.source || 'camera', { q, takenAt: p.takenAt, crop: p.crop || null, live: p.live || null });
      }, 0);
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


  /* ================= zoom ================= */
  /* The phone's own camera zoom when the camera offers it (the photo is zoomed too); otherwise a digital zoom of the
     picture, offered only while reading the ID (the ID is read from what is on screen, so it gains the same detail). */
  let zoomCaps = null, zoomLevel = 1, zoomBusy = false, zoomWant = null;
  const zoomMax = () => (zoomCaps ? Math.min(10, zoomCaps.max / (zoomCaps.min || 1)) : scanStep() ? 4 : 1);
  async function setZoom(z) {
    const nz = Math.max(1, Math.min(zoomMax(), z || 1));
    if (Math.abs(nz - zoomLevel) > 0.05 && finder.on) { finder.box = null; finder.read = null; finder.agree = 0; finder.stable = 0; guideReset(); finderLabel('Looking for the ID…'); } // a reading from before the zoom no longer matches the box
    zoomLevel = nz;
    const v = $('video');
    if (zoomCaps && stream) {
      if (zoomBusy) { zoomWant = zoomLevel; renderZoomBar(); return; } // a pinch sends many steps: keep only the last
      zoomBusy = true;
      try {
        const base = zoomCaps.min || 1, step = zoomCaps.step || 0.1;
        await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ zoom: Math.min(zoomCaps.max, Math.max(zoomCaps.min, Math.round((base * zoomLevel) / step) * step)) }] });
        v.style.transform = '';
      } catch (e) { LOG.warn('camera.zoom.fail', errInfo(e)); zoomCaps = null; } // use the digital zoom instead
      finally { zoomBusy = false; }
      if (zoomWant != null) { const w = zoomWant; zoomWant = null; if (Math.abs(w - zoomLevel) > 0.01 || !zoomCaps) return setZoom(w); }
    }
    if (!zoomCaps) v.style.transform = zoomLevel > 1.01 ? `scale(${zoomLevel.toFixed(3)})` : '';
    if (scanStep()) S.scanZoom = zoomLevel;
    renderZoomBar();
  }
  function renderZoomBar() {
    const max = zoomMax(), bar = $('zoomBar'); bar.hidden = !stream || max <= 1.01;
    let preset = false;
    bar.querySelectorAll('button').forEach((b) => { const z = +b.dataset.z, on = Math.abs(z - zoomLevel) < 0.05; b.hidden = z > max + 0.01; b.setAttribute('aria-pressed', String(on)); preset = preset || on; });
    $('zoomVal').hidden = preset; $('zoomVal').textContent = `${zoomLevel.toFixed(1)}×`;
  }
  $('zoomBar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setZoom(+b.dataset.z); });
  /* pinch to zoom; a tap points the ID reader (and the focus, where the camera allows it) at that spot */
  const camPtrs = new Map(); let pinch0 = null, tap0 = null;
  const ptrDist = () => { const [a, b] = [...camPtrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  $('camStage').addEventListener('pointerdown', (e) => {
    if (e.target.closest('#zoomBar')) return;
    camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (camPtrs.size === 2) { pinch0 = { d: ptrDist(), z: zoomLevel }; tap0 = null; } else tap0 = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  $('camStage').addEventListener('pointermove', (e) => {
    if (!camPtrs.has(e.pointerId)) return;
    camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch0 && camPtrs.size === 2) setZoom(pinch0.z * ptrDist() / pinch0.d);
  });
  const ptrEnd = (e) => {
    if (!camPtrs.has(e.pointerId)) return;
    camPtrs.delete(e.pointerId);
    if (camPtrs.size < 2) pinch0 = null;
    if (tap0 && e.type === 'pointerup' && Math.hypot(e.clientX - tap0.x, e.clientY - tap0.y) < 12 && Date.now() - tap0.t < 450) camTap(e.clientX, e.clientY);
    tap0 = null;
  };
  $('camStage').addEventListener('pointerup', ptrEnd); $('camStage').addEventListener('pointercancel', ptrEnd);
  function camTap(cx, cy) {
    const st = $('camStage').getBoundingClientRect(), nx = (cx - st.left) / st.width, ny = (cy - st.top) / st.height;
    const ring = $('tapRing'); ring.hidden = true; void ring.offsetWidth; ring.style.left = `${cx - st.left}px`; ring.style.top = `${cy - st.top}px`; ring.hidden = false;
    finder.focus = { x: nx, y: ny, until: Date.now() + 6000 }; finder.box = null; finder.read = null; finder.agree = 0;
    if (stream) stream.getVideoTracks()[0].applyConstraints({ advanced: [{ pointsOfInterest: [{ x: nx, y: ny }] }] }).catch(() => {}); // focus there, on phones that support it
  }

  /* ================= live ID reader ================= */
  /* While the ID is scanned, the box follows the painted ID like a face-detection box: a few times a second a small copy
     of the picture is searched for a row (or column) of high-contrast strokes, and the best one near the centre (or near
     where you tapped) gets the box. When the box holds still, the text inside is read in the background; the reading is
     shown on the box, and when the same known-format ID is read twice it is used by itself (Settings → Camera). */
  const finder = { on: false, timer: 0, box: null, score: 0, misses: 0, stable: 0, reading: false, lastOcrAt: 0, read: null, list: null, crop: null, agree: 0, focus: null, cv: null, n: 0, ms: 0, vway: 0, way: null, reads: 0, t0: 0 };
  function finderStart() {
    if (finder.on || !stream) return;
    Object.assign(finder, { on: true, box: null, score: 0, misses: 0, stable: 0, read: null, list: null, crop: null, agree: 0, n: 0, ms: 0, way: null, reads: 0, t0: performance.now() });
    ocrWorker(); finderLabel('Looking for the ID…'); finderTick();
  }
  function finderStop() {
    if (finder.on && finder.n) LOG.info('finder', { frames: finder.n, avgMs: Math.round(finder.ms / finder.n), reads: finder.reads, ms: Math.round(performance.now() - finder.t0), read: finder.read ? finder.read.id : null });
    finder.on = false; clearTimeout(finder.timer); finder.focus = null; guideReset(); $('scanPrompt').classList.remove('found');
  }
  function finderLabel(t, got) { $('idGuideText').textContent = t; $('idGuide').classList.toggle('got', !!got); }
  function guideReset() { const g = $('idGuide'); g.classList.remove('track', 'got'); g.style.left = g.style.top = g.style.width = g.style.height = g.style.right = ''; }
  function guidePlace(b) {
    const g = $('idGuide'); g.classList.add('track');
    g.style.right = 'auto'; g.style.left = `${b.x}px`; g.style.top = `${b.y}px`; g.style.width = `${b.w}px`; g.style.height = `${b.h}px`;
  }
  function finderTick() {
    if (!finder.on) return;
    const t0 = performance.now();
    try { finderStep(); } catch (e) { LOG.warn('finder.fail', errInfo(e)); finderStop(); return; }
    const ms = performance.now() - t0; finder.n++; finder.ms += ms;
    finder.timer = setTimeout(finderTick, Math.max(140, 260 - ms));
  }
  const iou = (a, b) => { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); const i = x * y; return i / (a.w * a.h + b.w * b.h - i || 1); };
  function finderStep() {
    const v = $('video'); if (!v.videoWidth || $('camera').hidden || !scanStep()) return;
    const st = $('camStage').getBoundingClientRect(), vr = v.getBoundingClientRect();
    const sc = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight), ox = vr.left + (vr.width - v.videoWidth * sc) / 2, oy = vr.top + (vr.height - v.videoHeight * sc) / 2;
    const vx = Math.max(0, (st.left - ox) / sc), vy = Math.max(0, (st.top - oy) / sc), vw = Math.min(v.videoWidth - vx, st.width / sc), vh = Math.min(v.videoHeight - vy, st.height / sc);
    if (vw < 40 || vh < 40) return;
    const W = finder.n > 4 && finder.ms / finder.n > 110 ? 180 : 240, H = Math.max(40, Math.round(W * vh / vw)); // slower phones search a smaller copy
    if (!finder.cv) finder.cv = document.createElement('canvas');
    const cv = finder.cv; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(v, vx, vy, vw, vh, 0, 0, W, H);
    const focus = finder.focus && Date.now() < finder.focus.until ? finder.focus : null, orient = S.idOrient === 'v' ? 'v' : 'h';
    const cand = C.findIdBox(g.getImageData(0, 0, W, H).data, W, H, orient, focus);
    const k = st.width / W; // the visible picture fills the camera area
    if (cand) {
      const padL = (orient === 'h' ? cand.w * 0.1 : cand.w * 0.35) + 4, padS = (orient === 'h' ? cand.h * 0.35 : cand.h * 0.06) + 4;
      const px = orient === 'h' ? padL : padS, py = orient === 'h' ? padS : padL;
      const x0 = Math.max(0, (cand.x - px) * k), y0 = Math.max(0, (cand.y - py) * k);
      const nb = { x: x0, y: y0, w: Math.min(st.width - x0, (cand.w + 2 * px) * k), h: Math.min(st.height - y0, (cand.h + 2 * py) * k) };
      if (finder.box && iou(finder.box, nb) > 0.3) {
        const a = 0.5; finder.box = { x: finder.box.x + (nb.x - finder.box.x) * a, y: finder.box.y + (nb.y - finder.box.y) * a, w: finder.box.w + (nb.w - finder.box.w) * a, h: finder.box.h + (nb.h - finder.box.h) * a };
        finder.stable = iou(finder.box, nb) > 0.6 ? finder.stable + 1 : 0;
      } else if (!finder.box || cand.score > finder.score * 1.3 || finder.misses >= 2) {
        finder.box = nb; finder.stable = 0; finder.read = null; finder.agree = 0;
        finderLabel('Hold steady…');
      }
      finder.score = cand.score; finder.misses = 0;
    } else if (++finder.misses > 6 && finder.box) {
      finder.box = null; finder.read = null; finder.agree = 0; guideReset(); finderLabel('Looking for the ID… tap it, or zoom in');
    }
    if (finder.box) guidePlace(finder.box);
    $('scanPrompt').classList.toggle('found', !!finder.box); // a shorter prompt once the box has found something
    if (finder.box && finder.stable >= 1 && !finder.reading && Date.now() - finder.lastOcrAt > (nativeReader() ? 120 : 220)) liveRead(orient);
  }
  async function liveRead(orient) {
    finder.reading = true; finder.lastOcrAt = Date.now();
    const box = finder.box && { ...finder.box };
    try {
      const crop = grabGuideCrop(); if (!crop) return;
      if (!finder.read) finderLabel('Reading…');
      // a vertical ID is either a column of upright characters or a sideways line: the way that read the last ID is tried
      // first, the others in turn until one reads, then that way is kept
      const VW = ['stacked', 'cw', 'ccw'], v0 = Math.max(0, VW.indexOf(S.vWay));
      const way = orient !== 'v' ? 'line' : finder.way || VW[(v0 + finder.vway++) % 3];
      finder.reads++;
      const src = way === 'cw' ? rotated(crop, 90) : way === 'ccw' ? rotated(crop, -90) : crop;
      let r = null;
      if (nativeReader()) { try { r = await nativeRead(src); } catch (e) { r = null; } } // ML Kit in the Android app
      if (!r) {
        // a smaller picture reads about twice as fast and as well: the text reader scales each line to ~40 px anyway
        const png = way === 'stacked' ? await prepStacked(crop, 160) : await prepForOcr(src, 112);
        r = await ocrRun(png, way === 'stacked' ? 6 : 7, { thresholding_method: 0 });
      }
      if (!finder.on || !r.ok || !finder.box || iou(box, finder.box) < 0.4) return; // the box moved on meanwhile
      const list = C.idCandidates([way === 'stacked' ? { ...r, stacked: true } : r], lastIdForShape(), { numPrefix: numPrefixNow() }), best = list[0];
      if (best && best.fits && best.conf >= 55) {
        finder.agree = finder.read && finder.read.id === best.id ? finder.agree + 1 : 1;
        const prev = finder.read; finder.read = best; finder.list = list; finder.crop = crop;
        if (orient === 'v') { finder.way = way; S.vWay = way; }
        finderLabel(`${best.id} · ${best.conf}%`, true);
        // one clear reading of a known ID is enough; otherwise the same ID read twice
        if (S.idAuto !== false && ((best.exact && best.conf >= 85) || (finder.agree >= 2 && Math.min(best.conf, prev ? prev.conf : 0) >= 65))) acceptLive();
      } else if (!finder.read) finderLabel('Reading… zoom in or tap the ID');
    } catch (e) { LOG.warn('finder.read.fail', errInfo(e)); }
    finally { finder.reading = false; }
  }
  /** The reading on the box is used: the ID step ends (new photo) or the scan result goes to the editor. */
  function liveResult() { return finder.read ? { best: finder.read, list: finder.list || [finder.read] } : null; }
  async function acceptLive() {
    const live = liveResult(), crop = finder.crop; if (!live) return;
    finderLabel(`Got ${live.best.id}`, true);
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* optional */ }
    LOG.info('finder.accept', { id: live.best.id, conf: live.best.conf, auto: true, reads: finder.reads, ms: Math.round(performance.now() - finder.t0) });
    finderStop();
    if (camTarget === 'newid' && camPending) { camPending.crop = crop; camPending.live = live; await closeSheet(); }
    else if (camTarget === 'scan') { await closeSheet(); applyLiveRead(live); }
  }
  function applyLiveRead(live) {
    if (!ed || !live) return;
    $('poleId').value = live.best.id; ed.idTouched = true; ed.idRead = { id: live.best.id, conf: live.best.conf };
    syncFromId(); checkDup();
    renderIdCands('done', live.list.filter((c) => c.id !== live.best.id), `Read by the live camera: ${live.best.id} (${live.best.conf}% sure) — check it.`); // chips: the other readings only
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
      if (camTarget === 'scan') { const crop = grabGuideCrop(), live = liveResult(); finderStop(); await closeSheet(); if (live) applyLiveRead(live); else scanResult(crop); return; }
      if (camTarget === 'newid') { if (camPending) { camPending.crop = grabGuideCrop(); camPending.live = liveResult(); } finderStop(); await closeSheet(); return; }
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
      if (!gps) { toast(gpsErr === 1 ? 'Photo not saved: location is off. Turn on location for G-eSAA, then take it again.' : 'Photo not saved: GPS has not updated in the last 5 seconds. Wait for the green shutter, then take it again.', 6500); return; }
      const tq = Date.now(), takenAt = new Date(shotAt).toISOString();
      const qp = withTimeout(checkQuality(blob), 15000, 'slow').catch(() => ({ flags: ['error'] })).then((q) => {
        perf.check = Date.now() - tq; perf.px = q.w ? `${q.w}×${q.h}` : '';
        LOG.info('photo.check', { ms: perf.check, px: perf.px, kb: Math.round(blob.size / 1024), flags: q.flags, sharp: q.sharp, level: q.level, during: camTarget === 'newid' ? 'id' : '' });
        return q;
      });
      if (camTarget === 'new' && S.readId !== false) { // aim at the ID straight away; the photo is checked meanwhile
        const pend = { blob, gps, takenAt, source: 'camera', qp };
        enterIdStep(pend);
        qp.then((q) => {
          pend.q = q;
          if (!q.flags.length || camPending !== pend || !alive()) return; // fine, or the ID step already ended (checked when the photo is used)
          camPending = null; finderStop(); camTarget = 'new'; showGuide(); refusePhoto(blob, q);
        });
        return;
      }
      camCheck('Checking photo…');
      const q = await qp;
      camCheck(false);
      if (!alive()) return;
      if (q.flags.length) { await refusePhoto(blob, q); return; }
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
      ed.newBlob = blob; ed.srcBlob = blob; ed.keepQ = false; prepImages(blob); ed.q = qSummary(x.q); showEdPhoto(blob); showQualWarn(ed.q);
      if (ed.origPid) ed.dropOrig = true; ed.marks = []; ed.base = null; ed.baseNew = false; ed.legacyBoxes = 0; ed.legacyPole = false; renderBoxInfo(); // a new photo has no marks yet
      toast('Photo replaced — tap Save to keep it');
      return;
    }
    openEditor({ mode: 'new', blob, gps, source, takenAt: x.takenAt || new Date().toISOString(), q: qSummary(x.q), crop: x.crop, live: x.live });
  }

  /* ================= reading the painted Pole ID (offline OCR) ================= */
  let ocrW = null, ocrSeq = 0; const ocrWait = {};
  function ocrWorker() {
    if (ocrW) return ocrW;
    ocrW = new Worker('ocr-worker.js');
    ocrW.onmessage = (e) => { const cb = ocrWait[e.data.id]; if (cb) { delete ocrWait[e.data.id]; cb(e.data); } };
    ocrW.onerror = (e) => { Object.keys(ocrWait).forEach((k) => { ocrWait[k]({ ok: false, error: e.message || 'Text reader failed to load' }); delete ocrWait[k]; }); ocrW = null; ocrWarmed = false; };
    return ocrW;
  }
  let ocrWarmed = false;
  /** Loads the text reader in the background (2–4 s on a phone the first time), so the first ID is read without waiting. */
  function ocrWarm() { if (ocrWarmed && ocrW) return; ocrWarmed = true; try { ocrWorker().postMessage({ id: 0, warm: true }); } catch (e) { ocrWarmed = false; } }
  const ocrRun = (png, psm, vars) => new Promise((res) => {
    const id = ++ocrSeq;
    const tm = setTimeout(() => { if (ocrWait[id]) { delete ocrWait[id]; res({ ok: false, error: 'Text reader timed out' }); } }, 30000);
    ocrWait[id] = (r) => { clearTimeout(tm); res(r); };
    // No character whitelist: in testing it lowered accuracy; idCandidates() cleans the text instead.
    ocrWorker().postMessage({ id, image: png, psm, vars });
  });
  /** Colour PNG of the crop scaled to ~160 px tall. Colour matters: Tesseract picks the colour channel that best
      separates paint from pole, which a plain grayscale image loses when sky is in the box. */
  async function prepForOcr(src, h) {
    const H = h || 160, sc = H / src.height, W = Math.min(1400, Math.max(40, Math.round(src.width * sc)));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, W, H);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  /** Number-only pole IDs are saved with the type prefix (v2.15): the editor's type, else the last type used. */
  function numPrefixNow() {
    if (ed && ed.element && ed.element !== 'Pole') return '';
    return typePrefix((ed && ed.type) || S.lastType || 'Concrete');
  }
  /** The Android app reads text with ML Kit (v2.15): fast, on the phone, no internet. Same shape as a Tesseract reading. */
  async function nativeRead(cv) {
    const r = await nativeCall('TextReader', 'read', { image: cv.toDataURL('image/jpeg', 0.92).split(',')[1] });
    const words = [];
    ((r && r.lines) || []).forEach((l, i) => {
      const c = typeof l.conf === 'number' && l.conf >= 0 ? Math.round(l.conf * 100) : 80;
      ((l.words && l.words.length) ? l.words : [l.text]).forEach((t) => { if (t) words.push({ text: String(t), conf: c, line: `n-${i}` }); });
    });
    return { ok: true, words, text: (r && r.text) || '', native: true };
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
    if (nativeReader()) { // ML Kit: the crop as it is, and turned both ways for a vertical ID
      try {
        const nres = [];
        if (canvas._orient === 'v') { nres.push({ ...(await nativeRead(canvas)), stacked: true }); for (const deg of [-90, 90]) nres.push(await nativeRead(rotated(canvas, deg))); }
        else nres.push(await nativeRead(canvas));
        const list = C.idCandidates(nres, lastIdForShape(), { numPrefix: numPrefixNow() });
        if (list.length) return list;
      } catch (e) { LOG.warn('mlkit.read.fail', errInfo(e)); } // Tesseract below
    }
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
    return C.idCandidates(res, lastIdForShape(), { numPrefix: numPrefixNow() });
  }
  /** The ID reading: the other possible IDs as chips; what the reader says sits behind an ⓘ (v2.15, less text on screen). */
  function renderIdCands(state, list, note) {
    const box = $('idCands'); box.hidden = false; box.innerHTML = ''; $('idNote').hidden = true;
    if (state === 'reading') { box.innerHTML = '<span class="spin" style="border-color:var(--line);border-top-color:var(--accent)"></span><span>Reading…</span>'; return; }
    const msg = state === 'error' ? note || 'Could not read the ID. Type it instead.' : note || (list.length ? 'Possible IDs from the scan: tap one to use it.' : 'No ID found in the box. Type it, or tap Scan ID and get closer.');
    const info = document.createElement('button'); info.type = 'button'; info.className = 'infoi'; info.textContent = 'i';
    info.setAttribute('aria-label', 'About the ID reading'); info.setAttribute('aria-expanded', 'false'); info.title = msg;
    info.addEventListener('click', () => { const on = $('idNote').hidden; $('idNote').hidden = !on; $('idNote').textContent = msg; info.setAttribute('aria-expanded', String(on)); });
    box.appendChild(info);
    if (state === 'error' || (!list.length && !note)) { const t = document.createElement('span'); t.textContent = state === 'error' ? 'Not read' : 'No ID read'; box.appendChild(t); }
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
    const title = titleText || (p.kind !== 'acceptance' && elemOf(p) !== 'Pole' ? `${p.poleId}  ·  ${svDesc(p, svPurpose(p.project))}` : `${p.poleId}  ·  ${p.poleType}`);
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
      description: title.replace(/\s+·\s+/g, ' | '), title: p.poleId, date: new Date(when), artist: exporterLine(' | ') });
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
    if (!pre || (ed.element && ed.element !== 'Pole') || ed.status === 'Proposed') { checkFormat(); return; } // a proposed pole keeps its PP- number
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
    else if (!ed.acc && ed.mode === 'new') { // survey: FDU_ → ODF, NAP- → NAP, CL- → closure, HH- → handhole, ODC- → ODC, a pole prefix → pole
      const want = /^FDU_/.test(id) ? 'ODF' : m || /^PP-/.test(id) ? 'Pole' : Object.keys(SV_PREFIX).find((k) => id.startsWith(`${SV_PREFIX[k]}-`)) || null;
      if (want && want !== ed.element) { ed.element = want; ed.status = svDefaultStatus(want); renderElemChips(); applyElement(); }
      if (want === 'Pole' && /^PP-/.test(id) && ed.status !== 'Proposed' && svStatuses('Pole').includes('Proposed')) { ed.status = 'Proposed'; applyElement(); }
      else if (want === 'Pole' && m && ed.status === 'Proposed') { ed.status = svDefaultStatus('Pole'); applyElement(); } // a painted ID: the pole exists
    }
    if (m && prefixType(m[1]) !== ed.type && (ed.element || 'Pole') === 'Pole') { ed.type = prefixType(m[1]); renderTypeChips(ed.type); }
    checkFormat();
  }
  function checkFormat() {
    const el = $('fmtWarn'); if (!ed) return;
    const id = $('poleId').value.trim().toUpperCase(), kind = ed.element || 'Pole';
    let msg = '';
    if (id && kind === 'Pole' && !isNpt(id) && !poleIdRe().test(id) && !PP_RE.test(id)) { const pm = polePartRe().exec(id); msg = pm && !pm[2] ? `Add the pole number after the prefix, e.g. ${pm[1]}-${PAD4.includes(pm[1]) ? '0001' : '1234'}.` : `Pole IDs are a prefix, a dash and the number: ${poleTypes().map((t) => `${t.p}-`).join(', ')}. For another owner, tap “+ Other prefix”.`; }
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
    const el = ed && ed.element ? ed.element : null;
    const other = id && !isNpt(id) && points.find((p) => p.project === S.project && p.poleId === id && (!el || elemOf(p) === el) && (!ed || p.id !== ed.id));
    $('dupWarn').hidden = !other;
    if (other) $('dupWarn').textContent = `${id} is already used in this project.`;
  }
  $('poleId').addEventListener('input', () => { if (ed) ed.idTouched = true; checkDup(); syncFromId(); });
  // a pole painted with a number only (v2.15): typing 123456 gives the type prefix, GT-123456
  $('poleId').addEventListener('change', () => {
    if (!ed || (ed.element && ed.element !== 'Pole') || ed.status === 'Proposed') return;
    const v = $('poleId').value.trim(), pre = typePrefix(ed.type);
    if (pre && /^[0-9]{3,8}$/.test(v)) { $('poleId').value = `${pre}-${PAD4.includes(pre) ? v.padStart(4, '0') : v}`; checkDup(); syncFromId(); checkFormat(); }
  });
  /** No tag on the pole: the ID is NPT (several NPT poles may exist; exports keep their file names apart). */
  const NPT = 'NPT';
  const isNpt = (id) => String(id || '').trim().toUpperCase() === NPT;
  $('nptBtn').addEventListener('click', () => {
    if (!ed) return;
    $('poleId').value = NPT; ed.idTouched = true; ed.idRead = null; checkDup(); checkFormat();
    if (ed.acc && visitStage() !== 'FAT' && canRecord() && !ed.defs.some((d) => /no pole tag|pole id not visible/i.test(d.item))) {
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
      // v2.13: in PAT, cleanup and FAT the photo is of the defect itself (no pole / ODF photo): it becomes the as-found photo
      // of the deficiency started below. A phone that may not record deficiencies keeps it as the element photo.
      if (o.blob && !(o.mode === 'new' && canRecord())) { const pid = uid(); ed.photos.unshift({ pid, label: 'Overview', ...photoMeta(o.gps, o.takenAt), q: o.q || null }); ed.pending[pid] = o.blob; }
      $('napId').value = o.napId || ''; $('closureId').value = o.closureId || '';
    } else { // survey point (v2.13): pole, site, ODC, ODF, NAP, closure or handhole
      const mk = Array.isArray(o.marks) ? o.marks : [];
      Object.assign(ed, { element: o.element || 'Pole', status: o.status || (o.mode === 'new' ? svDefaultStatus(o.element || 'Pole') : ''), srcBlob: o.blob || o.storedBlob || null, details: JSON.parse(JSON.stringify(o.details || [])),
        marks: JSON.parse(JSON.stringify(mk)), origPid: o.origPid || '', legacyBoxes: Math.max(0, (o.boxes || 0) - mk.length), legacyPole: !!o.poleModel && !mk.some((m) => m.k === 'pole'), base: null, baseNew: false, dropOrig: false });
      $('svRemarks').value = o.remarks || ''; $('svClosureId').value = o.closureId || '';
    }
    $('editorTitle').textContent = acc ? (o.mode === 'edit' ? 'Edit element' : 'New element') : (o.mode === 'edit' ? 'Edit pole' : 'New pole');
    $('edHint').textContent = `Drag the map to place the pin on the ${acc ? 'element' : 'pole'}`;
    $('edHint').classList.remove('gone'); clearTimeout(hintTimer); hintTimer = setTimeout(() => $('edHint').classList.add('gone'), 5000);
    $('edHint').hidden = acc; // v2.15: not shown in PAT, cleanup and FAT, where the pin is the element you stand at
    $('pinMapWrap').classList.toggle('big', !!S.pinBig); $('pinSizeBtn').setAttribute('aria-pressed', String(!!S.pinBig));
    ['accPhotos', 'defBox'].forEach((x) => { $(x).hidden = !acc; }); $('accElementBox').hidden = false;
    $('surveyTypeBox').hidden = ed.element !== 'Pole'; $('edPhoto').hidden = acc; $('nptBtn').hidden = ed.element !== 'Pole';
    ['svStatusBox', 'svClosureBox', 'svRemarksBox'].forEach((x) => { $(x).hidden = acc; });
    if (acc) $('accPhotos').closest('.group').hidden = false; // renderAccPhotos hides it when the record has no element photo
    if (!acc) { $('poleAttach').hidden = true; $('odfBox').hidden = true; }
    $('defPanel').hidden = true; $('addDefBtn').hidden = false;
    $('queueNote').textContent = '';
    $('saveIssue').hidden = true;
    $('edDelete').hidden = o.mode !== 'edit'; $('delConfirm').hidden = true;
    $('edSkip').hidden = true; $('edRetake').hidden = acc;
    $('edRetake').textContent = o.mode === 'edit' ? 'New photo' : 'Retake';
    $('edSave').textContent = 'Save';
    $('poleId').value = o.poleId != null ? o.poleId : suggestId(ed.element || 'Pole', ed.type);
    ed.idTouched = o.poleId != null;
    ed.q = o.q || null; showQualWarn(ed.q); $('idCands').hidden = true; $('idNote').hidden = true;
    renderTypeChips(ed.type);
    renderElemChips(); applyElement(); renderBoxInfo();
    if (acc) { renderAccPhotos(); renderDefs(); }
    if (acc && o.mode === 'new' && canRecord()) { // the defect form is ready, with the photo just taken as its as-found photo
      startDefDraft(false);
      if (o.blob) setDefPhoto(o.blob, { ...photoMeta(o.gps, o.takenAt), q: o.q || null });
    }
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
    if (o.live) applyLiveRead(o.live);
    else if (o.crop) runOcrFor(o.crop, true);
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
      gps: p.gpsLat != null ? { lat: p.gpsLat, lon: p.gpsLon, acc: p.accuracy } : null, storedBlob: ph ? (ph.clean || ph.thumb) : null, source: p.source,
      element: elemOf(p), status: p.status || '', remarks: p.remarks || '', closureId: p.closureId || '', boxes: p.boxes || 0, details: p.details || [], marks: p.marks || [], origPid: p.origPid || '', poleModel: !!p.poleModel });
  }
  function cleanupEditor() {
    ed = null; showEdPhoto(null); revokeEdUrls(); defDraft = null;
  }

  /* ---------- red box / pole model on a survey photo (v2.13; pole model v2.14; editable marks v2.15) ---------- */
  /* Tap the photo, then ▭ Red box or ⊥ Pole model: drag on the photo to draw a red box (the proposed location, the existing ODF
     to use…) or, for a proposed pole, drag from the ground up to place a model pole. Done burns the marks into the photo that
     every export uses. Since v2.15 the unmarked photo and the marks are kept too, so the marks can be selected later and moved,
     resized or deleted. Marks made before v2.15 are part of the photo and stay as they are. */
  let boxer = null;
  const proposedPole = () => ed && !ed.acc && ed.element === 'Pole' && ed.status === 'Proposed';
  const origPidOf = (id) => `${id}_o`;
  function renderBoxInfo() {
    if (!ed || ed.acc) { $('boxInfo').hidden = true; $('edZoom').classList.remove('pp'); return; }
    const n = (ed.marks || []).length, legacy = ed.legacyBoxes || 0, pp = proposedPole(), hasPole = (ed.marks || []).some((m) => m.k === 'pole') || ed.legacyPole;
    const txt = n ? `▭ ${n} mark${n === 1 ? '' : 's'} on the photo · tap the photo to change them${legacy ? ` (${legacy} older mark${legacy === 1 ? ' is' : 's are'} part of the photo)` : ''}`
      : legacy ? `▭ ${legacy} mark${legacy === 1 ? '' : 's'} on the photo` : pp && !hasPole ? '⊥ Tap the photo to place the model pole where the new pole goes' : '';
    $('boxInfo').textContent = txt; $('boxInfo').hidden = !txt;
    $('edZoom').classList.toggle('pp', !!(pp && !hasPole)); $('edZoom').textContent = pp && !hasPole ? '⊥' : '⤢';
  }
  function setBoxMode(m) {
    if (!boxer) return; boxer.mode = m; $('boxModeBox').setAttribute('aria-pressed', String(m === 'box')); $('boxModePole').setAttribute('aria-pressed', String(m === 'pole')); $('boxTitle').textContent = m === 'pole' ? 'Model pole' : 'Red box';
    $('boxHint').textContent = m === 'pole' ? 'Put your finger where the pole stands on the ground and drag up to its top. Tap a mark to move, resize or delete it.'
      : 'Drag on the photo to draw a red box around the spot. Tap a mark to move, resize or delete it.';
  }
  $('boxModeBox').addEventListener('click', () => setBoxMode('box'));
  $('boxModePole').addEventListener('click', () => setBoxMode('pole'));
  /** The unmarked photo the marks are drawn on: kept from this edit, or stored with the record, else the photo itself. */
  async function markBase() {
    if (ed.base) return ed.base;
    if (ed.origPid && !ed.dropOrig) { const ph = await dbGet('photos', ed.origPid).catch(() => null); if (ph && ph.clean) { ed.base = ph.clean; return ed.base; } }
    if ((ed.marks || []).length) { ed.legacyBoxes = (ed.legacyBoxes || 0) + ed.marks.length; ed.marks = []; } // the original is missing: the marks stay in the photo
    return ed.newBlob || ed.srcBlob;
  }
  /** Opens the marking screen in place of the full-size photo (the same Back step closes it). */
  async function openBoxer(mode) {
    if (!ed || ed.acc) return;
    const src = await markBase(); if (!src) { toast('No photo to mark'); return; }
    const im = await loadImage(src, STORE_MAX_PX), { w, h } = dims(im);
    boxer = { im, w, h, base: src, marks: (ed.marks || []).map((m) => (m.k === 'pole' ? { k: 'pole', x: m.x * w, yb: m.yb * h, yt: m.yt * h } : { k: 'box', x: m.x * w, y: m.y * h, w: m.w * w, h: m.h * h })), sel: -1, op: null, drag: null };
    if (pvOpen) { pvOpen = false; hidePhotoView(); const el = $('boxer'); el.hidden = false; el.style.zIndex = 1000 + stack.length; stack.push('boxer'); history.replaceState({ sheet: 'boxer' }, ''); LOG.info('open', 'boxer'); }
    else openSheet('boxer');
    setBoxMode(mode || (proposedPole() ? 'pole' : 'box'));
    requestAnimationFrame(() => { sizeBoxer(); drawBoxer(); });
  }
  $('pvBox').addEventListener('click', (e) => { e.stopPropagation(); guard(() => openBoxer('box'), 'Red box not opened'); });
  $('pvPole').addEventListener('click', (e) => { e.stopPropagation(); guard(() => openBoxer('pole'), 'Pole model not opened'); });
  function sizeBoxer() {
    const b = boxer, wrap = $('boxWrap'), cv = $('boxCanvas'); if (!b) return;
    const r = wrap.getBoundingClientRect(), sc = Math.min(r.width / b.w, r.height / b.h), dpr = window.devicePixelRatio || 1;
    b.sc = sc; cv.style.width = `${Math.floor(b.w * sc)}px`; cv.style.height = `${Math.floor(b.h * sc)}px`;
    cv.width = Math.max(1, Math.floor(b.w * sc * dpr)); cv.height = Math.max(1, Math.floor(b.h * sc * dpr));
  }
  const boxLine = (w, h) => Math.max(4, Math.round(Math.max(w, h) * 0.006));
  /** A model pole standing at (x, yb) up to yt, drawn in image pixels: a plain round pole (no crossarm), shaded so it reads
      as a cylinder, with its footing and a PROPOSED POLE label. */
  function drawPoleModel(g, x, yb, yt, lw) {
    const H = Math.max(10, yb - yt), wb = H * 0.06, wt = H * 0.04;
    g.save(); g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = '#e03131';
    const sh = g.createLinearGradient(x - wb / 2, 0, x + wb / 2, 0); // light from the left: round, not flat
    sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.92)'); sh.addColorStop(1, 'rgba(190,190,190,0.75)');
    g.fillStyle = sh;
    g.beginPath(); g.moveTo(x - wb / 2, yb); g.lineTo(x - wt / 2, yt); g.ellipse(x, yt, wt / 2, wt * 0.18, 0, Math.PI, 0); g.lineTo(x + wb / 2, yb); g.ellipse(x, yb, wb / 2, wb * 0.18, 0, 0, Math.PI); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(x, yt, wt / 2, wt * 0.18, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill(); g.stroke(); // round top
    g.beginPath(); g.ellipse(x, yb, wb * 1.5, wb * 0.45, 0, 0, Math.PI * 2); g.stroke(); // where it stands
    const fs = Math.max(12, H * 0.055); g.font = `700 ${fs}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
    g.lineWidth = Math.max(3, fs * 0.22); g.strokeStyle = '#ffffff'; g.strokeText('PROPOSED POLE', x, yb + wb * 0.6); g.fillStyle = '#e03131'; g.fillText('PROPOSED POLE', x, yb + wb * 0.6);
    g.restore();
  }
  function drawMarks(g, marks, k, lw) {
    marks.forEach((m) => {
      if (m.k === 'pole') drawPoleModel(g, m.x * k, m.yb * k, m.yt * k, lw);
      else { g.strokeStyle = '#e03131'; g.lineWidth = lw; g.lineJoin = 'round'; g.strokeRect(m.x * k, m.y * k, m.w * k, m.h * k); }
    });
  }
  /** Handles of a mark, in image pixels: box corners, or the pole's top and foot. */
  const handlesOf = (m) => (m.k === 'pole' ? [['top', m.x, m.yt], ['bottom', m.x, m.yb]] : [['nw', m.x, m.y], ['ne', m.x + m.w, m.y], ['sw', m.x, m.y + m.h], ['se', m.x + m.w, m.y + m.h]]);
  function drawBoxer() {
    const b = boxer, cv = $('boxCanvas'); if (!b) return;
    const g = cv.getContext('2d'), k = cv.width / b.w, dpr = window.devicePixelRatio || 1;
    g.drawImage(b.im, 0, 0, cv.width, cv.height);
    drawMarks(g, b.marks.concat(b.drag ? [b.drag] : []), k, Math.max(2, boxLine(b.w, b.h) * k));
    const m = b.marks[b.sel];
    if (m) { // the selected mark: dashed outline and handles
      g.save(); g.setLineDash([6 * dpr, 4 * dpr]); g.strokeStyle = '#ffffff'; g.lineWidth = 1.5 * dpr;
      if (m.k === 'pole') { const wb = (m.yb - m.yt) * 0.06; g.strokeRect((m.x - wb) * k, m.yt * k, wb * 2 * k, (m.yb - m.yt) * k); } else g.strokeRect(m.x * k, m.y * k, m.w * k, m.h * k);
      g.setLineDash([]); const r = 7 * dpr;
      handlesOf(m).forEach(([, x, y]) => { g.fillStyle = '#ffffff'; g.strokeStyle = '#e03131'; g.lineWidth = 2 * dpr; g.beginPath(); g.rect(x * k - r, y * k - r, 2 * r, 2 * r); g.fill(); g.stroke(); });
      g.restore();
    }
    $('boxUndo').disabled = !b.marks.length; $('boxClear').disabled = !b.marks.length; $('boxDel').disabled = !m;
    $('boxDone').textContent = b.marks.length ? `Done (${b.marks.length})` : 'Done';
  }
  const boxPt = (e) => { const r = $('boxCanvas').getBoundingClientRect(); return [Math.max(0, Math.min(boxer.w, (e.clientX - r.left) / boxer.sc)), Math.max(0, Math.min(boxer.h, (e.clientY - r.top) / boxer.sc))]; };
  /** The mark under the finger (the selected one first): a handle to resize it, else its body to move it. */
  function hitMark(pt) {
    const tol = 24 / boxer.sc, order = boxer.marks.map((_, i) => i).reverse();
    if (boxer.sel >= 0) { order.splice(order.indexOf(boxer.sel), 1); order.unshift(boxer.sel); }
    for (const i of order) {
      const m = boxer.marks[i];
      for (const [op, x, y] of handlesOf(m)) if (Math.hypot(pt[0] - x, pt[1] - y) < tol) return { i, op };
      if (m.k === 'pole') { const half = Math.max(tol, (m.yb - m.yt) * 0.06); if (Math.abs(pt[0] - m.x) < half && pt[1] > m.yt - tol && pt[1] < m.yb + tol) return { i, op: 'move' }; }
      else if (pt[0] > m.x - tol && pt[0] < m.x + m.w + tol && pt[1] > m.y - tol && pt[1] < m.y + m.h + tol) return { i, op: 'move' };
    }
    return null;
  }
  function boxDrag(p) {
    const [x0, y0] = boxer.start, [x1, y1] = p;
    boxer.drag = boxer.mode === 'pole' ? { k: 'pole', x: x0, yb: Math.max(y0, y1), yt: Math.min(y0, y1) } : { k: 'box', x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }
  /** Move or resize the selected mark, kept inside the photo. */
  function boxEdit(p) {
    const o = boxer.op, m0 = o.orig, dx = p[0] - o.start[0], dy = p[1] - o.start[1], W = boxer.w, H = boxer.h, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    let m;
    if (m0.k === 'pole') {
      if (o.op === 'move') { const sx = cl(dx, -m0.x, W - m0.x), sy = cl(dy, -m0.yt, H - m0.yb); m = { ...m0, x: m0.x + sx, yt: m0.yt + sy, yb: m0.yb + sy }; }
      else if (o.op === 'top') m = { ...m0, yt: cl(m0.yt + dy, 0, m0.yb - 20) };
      else m = { ...m0, x: cl(m0.x + dx, 0, W), yb: cl(m0.yb + dy, m0.yt + 20, H) };
    } else if (o.op === 'move') m = { ...m0, x: cl(m0.x + dx, 0, W - m0.w), y: cl(m0.y + dy, 0, H - m0.h) };
    else {
      let x1 = m0.x, y1 = m0.y, x2 = m0.x + m0.w, y2 = m0.y + m0.h;
      if (o.op.includes('w')) x1 = cl(m0.x + dx, 0, x2 - 8); else x2 = cl(x2 + dx, x1 + 8, W);
      if (o.op.includes('n')) y1 = cl(m0.y + dy, 0, y2 - 8); else y2 = cl(y2 + dy, y1 + 8, H);
      m = { k: 'box', x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    boxer.marks[o.i] = m;
  }
  $('boxCanvas').addEventListener('pointerdown', (e) => {
    if (!boxer) return; e.preventDefault(); $('boxCanvas').setPointerCapture(e.pointerId);
    const pt = boxPt(e), hit = hitMark(pt);
    if (hit) { boxer.sel = hit.i; boxer.op = { ...hit, start: pt, orig: { ...boxer.marks[hit.i] } }; drawBoxer(); return; }
    boxer.sel = -1; boxer.start = pt; boxDrag(pt); drawBoxer();
  });
  $('boxCanvas').addEventListener('pointermove', (e) => {
    if (!boxer) return;
    if (boxer.op) { boxEdit(boxPt(e)); drawBoxer(); return; }
    if (!boxer.start) return; boxDrag(boxPt(e)); drawBoxer();
  });
  const boxEnd = () => {
    if (!boxer) return;
    if (boxer.op) { boxer.op = null; drawBoxer(); return; }
    if (!boxer.start) return;
    const d = boxer.drag, sc = boxer.sc; boxer.start = null; boxer.drag = null;
    if (d && (d.k === 'pole' ? (d.yb - d.yt) * sc > 30 : d.w * sc > 12 && d.h * sc > 12)) { boxer.marks.push(d); boxer.sel = boxer.marks.length - 1; } // a tap is not a mark
    drawBoxer();
  };
  $('boxCanvas').addEventListener('pointerup', boxEnd); $('boxCanvas').addEventListener('pointercancel', boxEnd);
  $('boxDel').addEventListener('click', () => { if (boxer && boxer.sel >= 0) { boxer.marks.splice(boxer.sel, 1); boxer.sel = -1; drawBoxer(); } });
  $('boxUndo').addEventListener('click', () => { if (boxer) { boxer.marks.pop(); boxer.sel = -1; drawBoxer(); } });
  $('boxClear').addEventListener('click', () => { if (boxer) { boxer.marks = []; boxer.sel = -1; drawBoxer(); } });
  window.addEventListener('resize', () => { if (boxer && !$('boxer').hidden) { sizeBoxer(); drawBoxer(); } });
  $('boxDone').addEventListener('click', () => guard(async () => {
    const b = boxer; if (!b || !ed) return;
    const before = JSON.stringify(ed.marks || []);
    const marks = b.marks.map((m) => (m.k === 'pole' ? { k: 'pole', x: +(m.x / b.w).toFixed(5), yb: +(m.yb / b.h).toFixed(5), yt: +(m.yt / b.h).toFixed(5) } : { k: 'box', x: +(m.x / b.w).toFixed(5), y: +(m.y / b.h).toFixed(5), w: +(m.w / b.w).toFixed(5), h: +(m.h / b.h).toFixed(5) }));
    if (JSON.stringify(marks) === before) { await closeSheet(); return; }
    busy('Marking the photo…');
    let blob = b.base;
    if (marks.length) {
      const cv = document.createElement('canvas'); cv.width = b.w; cv.height = b.h;
      const g = cv.getContext('2d'); g.drawImage(b.im, 0, 0, b.w, b.h);
      drawMarks(g, b.marks, 1, boxLine(b.w, b.h));
      blob = await toBlob(cv, 0.92);
    }
    if (ed.mode === 'edit' && !ed.newBlob) ed.keepQ = true; // the stored photo, only marked: its camera check stays
    const stored = !!(ed.origPid && !ed.dropOrig);
    if (marks.length && !ed.base) { ed.base = b.base; ed.baseNew = !stored; } // the unmarked photo is kept with the record
    if (!marks.length && stored) ed.dropOrig = true;
    ed.marks = marks; ed.newBlob = blob; prepImages(blob); showEdPhoto(blob);
    const poles = marks.filter((m) => m.k === 'pole').length;
    LOG.info('photo.marks', { n: marks.length, poles });
    busy(false); await closeSheet(); renderBoxInfo();
    toast(marks.length ? `${marks.length} mark${marks.length === 1 ? '' : 's'} on the photo${ed.mode === 'edit' ? ' — tap Save to keep it' : ''}` : `Marks removed${ed.mode === 'edit' ? ' — tap Save to keep it' : ''}`, 3000);
  }, 'Marks not added'));

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
    for (const el of ed.acc ? ELEMENTS : SV_ELEMENTS) box.add(new Option(el === 'Site' ? 'Site (new / existing)' : el === 'Closure' ? 'Closure (POI on a pole)' : el === 'Handhole' ? 'Handhole' : el, el, false, el === ed.element));
  }
  $('elemSel').addEventListener('change', (e) => {
    if (!ed) return;
    const el = e.target.value; ed.element = el;
    if (!ed.acc) ed.status = svDefaultStatus(el); // each element starts from its own usual status
    const id = $('poleId').value.trim().toUpperCase();
    const kindOf = (v) => (/^FDU_/.test(v) ? 'ODF' : poleIdRe().test(v) || polePartRe().test(v) || /^PP-/.test(v) ? 'Pole' : Object.keys(SV_PREFIX).find((k) => v.startsWith(`${SV_PREFIX[k]}-`)) || null);
    // a new record: the suggested ID follows the element; so does an ID that belongs to another element (e.g. a pole ID read by the camera)
    if (ed.mode === 'new' && (!ed.idTouched || !id || (kindOf(id) && kindOf(id) !== el))) { $('poleId').value = suggestId(el, ed.type); ed.idTouched = false; }
    applyElement(); checkDup(); checkFormat();
  });
  function applyElement() {
    const el = ed.element;
    if (!ed.acc) { // survey point
      const isNew = ed.mode !== 'edit', nm = el === 'Pole' ? 'pole' : el;
      $('editorTitle').textContent = `${isNew ? 'New' : 'Edit'} ${nm}`;
      $('idLabel').textContent = el === 'Site' ? 'SITE NAME / ID' : `${el.toUpperCase()} ID`;
      const sts = svStatuses(el); if (!sts.includes(ed.status)) ed.status = svDefaultStatus(el);
      $('poleId').placeholder = { Pole: ed.status === 'Proposed' ? 'e.g. PP-0001' : 'e.g. CC-0001', ODF: 'e.g. FDU_100', Site: 'e.g. MIN2463 or the site name', ODC: 'e.g. ODC-01', NAP: 'e.g. NAP-0001', Closure: 'e.g. CL-0001', Handhole: 'e.g. HH-0001' }[el];
      $('surveyTypeBox').hidden = el !== 'Pole'; $('nptBtn').hidden = el !== 'Pole' || ed.status === 'Proposed';
      $('svDetailsBox').hidden = el !== 'Pole'; renderDetails();
      const sb = $('svStatus'); sb.innerHTML = ''; sts.forEach((x) => sb.add(new Option(svStatusLabel(x), x, false, x === ed.status)));
      $('svStatusBox').hidden = !sts.length; sb.disabled = sts.length < 2;
      $('svClosureBox').hidden = el !== 'Handhole';
      $('edHint').textContent = el === 'Pole' && ed.status === 'Proposed' ? 'Drag the map to place the pin where the new pole goes' : `Drag the map to place the pin on the ${nm}`;
      renderBoxInfo();
      return;
    }
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
  $('svStatus').addEventListener('change', (e) => {
    if (!ed) return;
    const was = ed.status; ed.status = e.target.value;
    // a new pole switched to / from Proposed: PP-0001 numbering, or back to the type prefix (an ID read from the pole stays)
    if (ed.mode === 'new' && ed.element === 'Pole' && (was === 'Proposed') !== (ed.status === 'Proposed')) {
      const id = $('poleId').value.trim().toUpperCase();
      if (!ed.idTouched || !id || PP_RE.test(id) || ed.status === 'Proposed') { $('poleId').value = suggestId('Pole', ed.type); ed.idTouched = false; }
    }
    applyElement(); checkDup(); checkFormat();
    if (ed.status === 'Proposed' && was !== 'Proposed' && !(ed.marks || []).some((m) => m.k === 'pole')) toast('Tap the photo, then ⊥ Pole model, to show where the new pole goes', 4500);
  });
  /* pole details list */
  function renderDetails() {
    const box = $('svDetails'); if (!ed || ed.acc) return; box.innerHTML = '';
    (ed.details || []).forEach((d, i) => {
      const row = document.createElement('div'); row.className = 'pdrow';
      const t = document.createElement('span'); t.className = 't'; t.textContent = d.item;
      const mk = (txt, lbl, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = txt; b.setAttribute('aria-label', lbl); b.addEventListener('click', fn); return b; };
      const q = document.createElement('b'); q.textContent = String(d.qty); q.setAttribute('aria-label', `${d.qty} pc${d.qty === 1 ? '' : 's'}`); // compact chip (v2.15): Transformer − 1 + ×
      // at 1 pc the minus removes the item (×), so each chip needs only two buttons
      row.append(t, mk(d.qty > 1 ? '−' : '×', d.qty > 1 ? `One ${d.item} less` : `Remove ${d.item}`, () => { if (d.qty > 1) d.qty -= 1; else ed.details.splice(i, 1); renderDetails(); }), q,
        mk('+', `One ${d.item} more`, () => { d.qty = Math.min(99, d.qty + 1); renderDetails(); }));
      box.appendChild(row);
    });
    const sel = $('svDetailAdd'), have = new Set((ed.details || []).map((d) => d.item));
    sel.innerHTML = '<option value="">+ Add detail</option>';
    POLE_DETAIL_ITEMS.concat((S.myDetails || []).filter((x) => !POLE_DETAIL_ITEMS.includes(x))).filter((x) => !have.has(x)).forEach((x) => sel.add(new Option(x, x)));
    sel.add(new Option('Other…', '__other'));
  }
  $('svDetailAdd').addEventListener('change', async (e) => {
    if (!ed) return;
    let v = e.target.value; e.target.value = ''; if (!v) return;
    if (v === '__other') {
      v = await promptText('Pole detail', 'What else is on the pole? It is added with a count of 1; tap + for more.', 'e.g. Cable TV amplifier');
      if (!v) return; v = v.trim().slice(0, 40);
      if (!POLE_DETAIL_ITEMS.includes(v) && !(S.myDetails || []).includes(v)) { S.myDetails = (S.myDetails || []).concat(v).slice(-20); persist(); }
    }
    ed.details = ed.details || [];
    const have = ed.details.find((d) => d.item.toLowerCase() === v.toLowerCase());
    if (have) have.qty = Math.min(99, have.qty + 1); else ed.details.push({ item: v, qty: 1 });
    renderDetails();
  });

  function nextPhotoLabel() {
    if (!ed.photos.length) return 'Overview';
    const used = new Set(ed.photos.map((p) => p.label));
    const cands = ed.element === 'Pole' ? ['Pole tag', ed.mloop && 'MLoop', ed.nap && 'NAP', ed.closure && 'Closure'] : [ed.element];
    for (const c of cands) if (c && !used.has(c)) return c;
    return 'Detail';
  }
  async function renderAccPhotos() {
    const box = $('accPhotos'); box.innerHTML = '';
    box.closest('.group').hidden = !ed.photos.length; // v2.13: only records from older versions have element photos
    ed.photos.forEach((p, i) => {
      const cell = document.createElement('div'); cell.className = 'ph';
      const img = document.createElement('img'); img.alt = p.label;
      thumbUrl(p.pid).then((u) => { img.src = u; });
      img.addEventListener('click', () => showPhoto(p.pid, `${$('poleId').value || ''} · ${p.label || ''}`));
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
    const stage = pmeta().stage || 'PAT', insp = canRecord();
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
      [[d.pid, 'Defect'], ...(d.reopened || []).filter((q) => q.pid).map((q) => [q.pid, 'Rejected']), [d.afterPid, 'Rectified'], [d.verifyPid, 'Verified']].forEach(([pid, label]) => {
        if (!pid) return;
        const f = document.createElement('figure'); const im = document.createElement('img'); im.alt = label; thumbUrl(pid).then((u) => { im.src = u; });
        const c = document.createElement('figcaption'); c.textContent = label; f.append(im, c); th.appendChild(f);
        f.addEventListener('click', () => showPhoto(pid, `${$('poleId').value || ''} · ${d.item} · ${label}`));
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
    if (visitStage() === 'FAT' && canRecord()) return items.some((d) => defStatusOf(d) !== 'Verified');
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
    renderVisit();
    if (!stack.includes('visitCard')) openSheet('visitCard');
    requestAnimationFrame(() => drawWay(true)); // you and the pin, both in view above the card
  }
  function revokeVisitUrls() { visitUrls.forEach((u) => URL.revokeObjectURL(u)); visitUrls = []; }
  async function photoThumb(img, pid) {
    const ph = await dbGet('photos', pid).catch(() => null), b = ph && (ph.thumb || ph.clean);
    if (!b) return; const u = URL.createObjectURL(b); visitUrls.push(u); img.src = u;
  }
  /** A photo of this record, full size: one not saved yet comes from the editor, a saved one from phone storage. */
  async function showPhoto(pid, caption) {
    let b = ed && ed.pending && ed.pending[pid];
    if (!b) { const ph = await dbGet('photos', pid).catch(() => null); b = ph && (ph.clean || ph.thumb); }
    if (!b) { toast('Photo not found on this phone'); return; }
    showBlob(b, caption);
  }
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
    const stage = visitStage(), insp = canRecord(), items = (r.defs || []).map((d, i) => ({ d, i }));
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
      if (d.pid) ph.appendChild(figure(d.pid, 'Defect', `${r.poleId} · ${d.item} · defect (as found)`));
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
    drawWay(false);
  }
  /* ---- the way to the pin (v2.15): during a visit the map shows you, the pin, and a dashed line with the distance,
     framed in the part of the map above the card ---- */
  const wayLayer = L.layerGroup().addTo(map);
  function drawWay(fit) {
    wayLayer.clearLayers();
    const r = visitId && points.find((x) => x.id === visitId); if (!r) return;
    L.circleMarker([r.lat, r.lon], { radius: 17, color: '#e03131', weight: 3, fill: false, interactive: false, className: 'target-ring' }).addTo(wayLayer);
    if (!fix) { if (fit) map.setView([r.lat, r.lon], Math.max(map.getZoom(), 18)); return; }
    const d = haversine(fix, r);
    if (d >= 3) {
      L.polyline([[fix.lat, fix.lon], [r.lat, r.lon]], { color: '#1c7ed6', weight: 3, dashArray: '7 7', interactive: false }).addTo(wayLayer);
      L.marker([(fix.lat + r.lat) / 2, (fix.lon + r.lon) / 2], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: `<span class="waylbl">${fmtDist(d)} ${compass(fix, r)}</span>`, iconSize: [0, 0] }) }).addTo(wayLayer);
    }
    if (!fit) return;
    const card = $('visitCard').getBoundingClientRect(), mr = map.getContainer().getBoundingClientRect();
    const below = Math.max(40, mr.bottom - card.top + 24);
    if (d > 5000) { map.setView([r.lat, r.lon], Math.max(map.getZoom(), 17)); return; } // far away: the pin first
    map.fitBounds([[fix.lat, fix.lon], [r.lat, r.lon]], { paddingTopLeft: [50, 120], paddingBottomRight: [50, below], maxZoom: 19, animate: false });
  }

  function renderDefPanel() {
    const cats = CATS_FOR[ed.element] || ['Other'];
    const cbox = $('defCatSel'); cbox.innerHTML = '';
    cats.forEach((c) => cbox.add(new Option(c, c, false, c === defDraft.cat)));
    const ibox = $('defItems'); ibox.innerHTML = '';
    const items = pol().defects[defDraft.cat] || [];
    if (!items.length) ibox.innerHTML = '<p class="hint" style="margin:0;padding:8px 12px">No checklist items for this category — describe the defect in notes.</p>';
    items.forEach((it) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = it;
      b.setAttribute('aria-pressed', String(defDraft.items.has(it)));
      b.addEventListener('click', () => { if (defDraft.items.has(it)) defDraft.items.delete(it); else defDraft.items.add(it); b.setAttribute('aria-pressed', String(defDraft.items.has(it))); renderDefLbl(); });
      ibox.appendChild(b);
    });
    renderDefLbl();
    $('defSevSel').value = defDraft.sev;
  }
  $('defCatSel').addEventListener('change', (e) => { if (!defDraft) return; defDraft.cat = e.target.value; defDraft.items = new Set(); renderDefPanel(); showDefList(true); });
  /* v2.15: the defects are a dropdown (tick one or more), so the form stays short */
  function renderDefLbl() {
    const n = defDraft ? defDraft.items.size : 0, first = n ? [...defDraft.items][0] : '';
    $('defItemsLbl').textContent = !n ? 'Choose the defect…' : n === 1 ? first : `${first} +${n - 1}`;
  }
  function showDefList(on) { $('defItems').hidden = !on; $('defItemsBtn').setAttribute('aria-expanded', String(on)); }
  $('defItemsBtn').addEventListener('click', () => showDefList($('defItems').hidden));
  function setDefPhoto(blob, meta) {
    if (!defDraft) return;
    defDraft.blob = blob; defDraft.meta = meta;
    const u = URL.createObjectURL(blob); edUrls.push(u);
    $('defPhotoPrev').src = u; $('defPhotoPrev').hidden = false; $('defPhotoBtn').textContent = 'Retake defect photo';
  }
  function startDefDraft(scroll) {
    defDraft = { cat: (CATS_FOR[ed.element] || ['Other'])[0], items: new Set(), sev: 'Minor', blob: null };
    $('defNotes').value = ''; $('defPhotoPrev').hidden = true; $('defPhotoBtn').textContent = 'Take defect photo';
    renderDefPanel(); showDefList(false); $('defPanel').hidden = false; $('addDefBtn').hidden = true;
    if (scroll) $('defPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('addDefBtn').addEventListener('click', () => {
    if (!canRecord()) { toast(`Only ${pol().owner || 'the admin company'} adds deficiencies`); return; }
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
  $('edPhoto').addEventListener('click', () => {
    if (!ed) return;
    showBlob(ed.newBlob || ed.srcBlob, `${$('poleId').value || ''} · ${$('edTime').textContent}`);
    if (!ed.acc) { // survey photo: mark it here (red box, model pole); marks stay editable
      $('pvTools').hidden = false; const n = (ed.marks || []).length, pp = proposedPole();
      $('pvBox').textContent = n ? '▭ Red box · edit marks' : '▭ Red box'; $('pvPole').hidden = !pp && !(ed.marks || []).some((m) => m.k === 'pole');
      $('pvHint').textContent = n ? 'Tap a tool, then tap a mark to move, resize or delete it · tap the photo to zoom' : 'Tap the photo to zoom in or out · × or Back to close';
    }
  });
  $('defPhotoPrev').addEventListener('click', () => { if (defDraft && defDraft.blob) showBlob(defDraft.blob, 'Defect photo (not added yet)'); });
  $('edSaveTop').addEventListener('click', saveEditor); // the same Save, next to the photo (v2.14)
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
    await closeSheet(); toast(rec && rec.kind === 'acceptance' ? 'Element deleted' : `${rec && elemOf(rec) !== 'Pole' ? elemOf(rec) : 'Pole'} deleted`);
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
    if (!poleId || new RegExp(`^(${prefixAlt()})-?$|^FDU_?$`).test(poleId) || /[-_]$/.test(poleId)) { toast(`Enter the ${ed.element === 'Site' ? 'site name or ID' : `${ed.element || 'Pole'} ID`} first${poleId ? ' (the number is missing)' : ''}`); $('poleId').focus(); return; }
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
        poleId, poleType: (ed.element || 'Pole') === 'Pole' ? ed.type || '' : '', lat: pos.lat, lon: pos.lon, updated: now, ...(p ? { updatedBy: byLine() } : { by: byLine() }),
        element: ed.element || 'Pole', status: svStatuses(ed.element || 'Pole').length ? ed.status || svDefaultStatus(ed.element || 'Pole') : '',
        details: (ed.element || 'Pole') === 'Pole' ? (ed.details || []).filter((d) => d && d.item) : [],
        remarks: $('svRemarks').value.trim().slice(0, 500), closureId: ed.element === 'Handhole' ? $('svClosureId').value.trim().toUpperCase().slice(0, 40) : '',
        boxes: (ed.legacyBoxes || 0) + (ed.marks || []).length, marks: (ed.marks || []).map((m) => ({ ...m })),
        poleModel: (ed.marks || []).some((m) => m.k === 'pole') || !!ed.legacyPole,
        ...(ed.newBlob && !ed.keepQ ? { q: ed.q || null } : {}), ...(ed.idRead ? { idRead: ed.idRead } : {}),
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
      // v2.15: the unmarked photo is kept with marked photos, so their marks can be edited later
      if (rec.marks.length && ed.base && ed.baseNew) { photos.push({ id: origPidOf(ed.id), ...await storedImages(ed.base) }); rec.origPid = origPidOf(ed.id); }
      else if (rec.marks.length && ed.origPid && !ed.dropOrig) rec.origPid = ed.origPid;
      else delete rec.origPid;
      if (!rec.poleModel) delete rec.poleModel;
      busy('Writing to phone storage…');
      await saveRecord(rec, photos); // photo and record together, or neither
      if (!p) points.push(rec); else points[points.indexOf(p)] = rec;
      if (p && p.origPid && !rec.origPid) deletePhotosIfUnused([p.origPid], new Set()).catch(() => {}); // marks removed or a new photo
      if (ed.mode === 'new' && !isNpt(poleId) && (ed.element || 'Pole') === 'Pole') S.lastPoleId = poleId;
      if ((ed.element || 'Pole') === 'Pole' && typeNames().includes(ed.type)) S.lastType = ed.type;
      if (rec.status) S.lastSt = { ...(S.lastSt || {}), [`${svPurpose()}|${rec.element}`]: rec.status };
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
    // v2.13: the capture photo waits in the defect form. Saved without a defect (a FAT may record an element without one),
    // it is kept as the element photo instead of being dropped.
    if (defDraft && defDraft.blob && !$('defPanel').hidden && !defDraft.items.size && !$('defNotes').value.trim()) {
      const pid = uid(); ed.photos.unshift({ pid, label: 'Overview', ...(defDraft.meta || {}) }); ed.pending[pid] = defDraft.blob; defDraft.blob = null;
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
    const pts = projPoints().reverse().filter((p) => (!q || [p.poleId, p.poleType, p.element, p.napId, p.closureId, p.status, p.remarks, detailsText(p.details)].join(' ').toUpperCase().includes(q))
      && (!acc || listFilter === 'all' || recStatus(p) === listFilter));
    const counts = {}; projPoints().forEach((p) => { counts[p.poleId] = (counts[p.poleId] || 0) + 1; });
    const box = $('listItems'); box.innerHTML = '';
    $('listTitle').textContent = `${taskCat()} · ${S.project}`;
    const st = projStats(projPoints()), stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
    $('listStats').hidden = !st.total;
    $('listStatRow').innerHTML = acc ? stat(st.total, 'elements') + stat(st.itemsOpen, 'open') + stat(st.itemsRect, 'to verify') + stat(st.itemsVer, 'verified')
      : (() => { const np = projPoints().filter((p) => elemOf(p) === 'Pole').length, no = st.total - np;
        return stat(np, 'poles') + stat(fmtLen(st.len), 'route') + stat(st.long, 'long spans') + (no ? stat(no, 'other points') : stat(projPoints().filter((p) => p.adjusted).length, 'pins moved')); })();
    if (!pts.length) { box.innerHTML = `<div class="empty">${q || (acc && listFilter !== 'all') ? 'Nothing matches.' : `No ${acc ? 'elements' : 'points'} yet. Tap the camera button to capture the first one.`}</div>`; return; }
    // v2.15: sort (newest, oldest, ID, status) and group by element
    const sort = ['new', 'old', 'id', 'idd', 'status'].includes(S.listSort) ? S.listSort : 'new', grouped = !!S.listGroup;
    $('listSort').value = sort; $('listGroup').checked = grouped;
    const idCmp = (a, b) => String(a.poleId || '').localeCompare(String(b.poleId || ''), undefined, { numeric: true, sensitivity: 'base' });
    const ST_ORDER = acc ? ['Open', 'Rectified', 'Verified', 'OK'] : ['Proposed', 'New', 'Existing', ''];
    const stOf = (p) => { const i = ST_ORDER.indexOf(acc ? recStatus(p) : p.status || ''); return i < 0 ? 99 : i; };
    const cmp = { new: (a, b) => (a.created < b.created ? 1 : -1), old: (a, b) => (a.created < b.created ? -1 : 1), id: idCmp, idd: (a, b) => -idCmp(a, b), status: (a, b) => stOf(a) - stOf(b) || idCmp(a, b) }[sort];
    pts.sort(cmp);
    const order = acc ? ELEMENTS : SV_ELEMENTS, groups = grouped ? order.map((el) => [el, pts.filter((p) => elemOf(p) === el)]).concat([['Other', pts.filter((p) => !order.includes(elemOf(p)))]]).filter(([, l]) => l.length) : [['', pts]];
    const PLURAL = { Pole: 'Poles', Site: 'Sites', Closure: 'Closures (POI)', Handhole: 'Handholes', Rack: 'Racks' };
    for (const [gname, list] of groups) {
    if (gname) { const h = document.createElement('h4'); h.className = 'lgroup'; h.innerHTML = `<span>${C.xmlEsc(PLURAL[gname] || gname)} · ${list.length}</span><i></i>`; box.appendChild(h); }
    for (const p of list) {
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
      } else {
        const el = elemOf(p), tags = el === 'Pole' ? `<span class="tag">${C.xmlEsc(p.poleType || '—')}</span>${p.status === 'Proposed' || p.status === 'New' ? `<span class="tag" style="background:${p.status === 'Proposed' ? '#e03131' : '#17202a'};color:#fff">${C.xmlEsc(svStatusLabel(p.status))}</span>` : ''}`
          : `<span class="tag" style="background:${SV_COLORS[el] || '#495057'};color:#fff">${C.xmlEsc(el)}</span>${p.status ? `<span class="tag">${C.xmlEsc(svStatusLabel(p.status))}</span>` : ''}${p.closureId ? `<span class="tag">closure ${C.xmlEsc(p.closureId)}</span>` : ''}`;
        s.innerHTML = `${tags}${p.boxes ? '<span class="tag" style="background:#e03131;color:#fff">red box</span>' : ''}${p.adjusted ? '<span class="tag adj">pin adjusted</span>' : ''}${counts[p.poleId] > 1 ? '<span class="tag dup">duplicate ID</span>' : ''}`;
        const more = [detailsText(p.details, ' · '), p.remarks].filter(Boolean).join(' — ');
        if (more) { const s3 = document.createElement('span'); s3.className = 's'; s3.textContent = more; info.append(s3); }
      }
      const s2 = document.createElement('span'); s2.className = 's mono';
      s2.textContent = `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}${Number.isFinite(p.accuracy) ? ` · ±${p.accuracy.toFixed(0)} m` : ''}`;
      info.prepend(t, s, s2); b.append(img, info);
      b.addEventListener('click', () => openEditorFor(p.id));
      box.appendChild(b);
      const cp = coverPid(p); if (cp) dbGet('photos', cp).then((ph) => { if (ph && ph.thumb) { const u = URL.createObjectURL(ph.thumb); listUrls.push(u); img.src = u; } }).catch(() => {});
    }
    }
  }
  $('listSort').addEventListener('change', () => { S.listSort = $('listSort').value; persist(); renderList(); });
  $('listGroup').addEventListener('change', () => { S.listGroup = $('listGroup').checked; persist(); renderList(); });
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
      route: () => closeAll().then(() => { if (!routeMode) setRouteMode(true); }), form: () => { $('curMore').open = true; $('mSite').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('mSite').focus(); },
      fat: () => $('startFat').click(), share: () => guard(sharePackage), next: () => closeAll().then(() => { const t = nextTarget(); if (t) openVisit(t.r.id, true); else toast('No pin left to visit'); }) };
    const steps = [];
    if (cat === 'Survey') {
      const R = routeModel(), purpose = m.purpose || 'As-plan', np = pts.filter((p) => elemOf(p) === 'Pole').length, others = n - np;
      const npp = pts.filter((p) => elemOf(p) === 'Pole' && p.status === 'Proposed').length, nnew = pts.filter((p) => elemOf(p) === 'Pole' && p.status === 'New').length;
      steps.push({ t: 'Capture the poles', s: np ? `${np} pole${np === 1 ? '' : 's'} captured${npp ? ` · ${npp} proposed` : ''}${nnew ? ` · ${nnew} new` : ''}` : purpose === 'As-plan' ? 'Photo, ID scan, pin check for each pole; Proposed for a new pole (PP-0001)' : 'Photo, ID scan, pin check for each pole', done: np > 0, go: 'capture', label: 'Capture' });
      if (purpose === 'As-plan') {
        const g = asPlanParts(pts), tick = (v) => (v ? '✓' : '✗');
        steps.push({ t: 'Site, ODF / ODC and POI', s: `${tick(g.site)} site · ${tick(g.odf)} ODF / ODC · ${tick(g.poi)} POI (closure or handhole)${g.nap ? ` · ${g.nap} NAP` : ''} · needed to complete`, done: g.site && g.odf && g.poi, go: 'capture', label: 'Capture' });
      } else steps.push({ t: purpose === 'Audit' ? 'Audit the network elements' : 'Site, ODC / ODF, NAP and closures as built', s: others ? svCountText(pts) : purpose === 'Audit' ? 'Closures, NAP, ODF, handholes… with remarks on what you find' : 'Photo of the site, ODC / ODF, NAP and closures used in the build', done: others > 0, go: 'capture', label: 'Capture' });
      steps.push({ t: 'Link the route', s: !R.spans.length ? 'Tap the route button: link in capture order, then fix branches' : `${R.spans.length} span${R.spans.length === 1 ? '' : 's'} · ${R.long} over ${pol().maxSpan} m · ${R.off} not linked`, done: routePts().length > 1 && R.spans.length > 0 && R.off === 0 && !R.long, go: 'route', label: 'Route' });
      steps.push({ t: 'Export for design', s: fresh(['kmz', 'dxf', 'csv']) ? 'KMZ / DXF / CSV made after the last change' : 'KMZ for Google Earth, DXF for AutoCAD, CSV, photos', done: n > 0 && fresh(['kmz', 'dxf', 'csv']), go: 'export', label: 'Export' });
      steps.push({ t: 'Back up the project', s: fresh(['backup']) ? `Backup made ${fmtTime(ex.backup)}` : 'Export → Backup, keep the ZIP on Drive or a PC', done: n > 0 && fresh(['backup']), go: 'backup', label: 'Backup' });
    } else if (cat === 'PAT') {
      const items = pts.flatMap((p) => counting(p)), open = items.filter((d) => defStatusOf(d) === 'Open').length;
      const formOk = !!(m.site && m.contractor && (m.vendorRep || (S.user && S.user.name))); // the Globe representative is optional (v2.10)
      const handed = allProjects().some((x) => pmeta(x).fromPat === S.project) || !!ex.sent;
      steps.push({ t: 'Form details', s: formOk ? `${m.site} · ${m.contractor}` : 'Location, vendor, representatives, inspection date (printed on the form)', done: formOk, go: 'form', label: 'Fill in' });
      steps.push({ t: 'Record the defects', s: n ? `${n} element${n === 1 ? '' : 's'} · ${items.length} deficienc${items.length === 1 ? 'y' : 'ies'} · ${open} open` : 'Photo each defect (not the pole or ODF); tag it N, D or MD', done: n > 0, go: 'capture', label: 'Capture' });
      steps.push({ t: 'Export the Deficiency List', s: fresh(['pdf', 'xlsx']) ? 'PDF / Excel made after the last change' : 'PDF (form + annexes) and Excel for signing and tracking', done: n > 0 && fresh(['pdf', 'xlsx']), go: 'export', label: 'Export' });
      steps.push({ t: 'Share the PAT KMZ for the defect cleanup', s: handed ? (ex.sent ? `PAT KMZ shared ${fmtTime(ex.sent)}` : 'FAT started on this phone') : 'One KMZ with the defect pins and photos, for the defect cleanup and the FAT', done: handed, go: 'share', label: 'Share KMZ' });
    } else if (cat === 'Cleanup') {
      const items = pts.flatMap((p) => counting(p)), open = items.filter((d) => defStatusOf(d) === 'Open'), noPhoto = items.filter((d) => defDone(d) && !d.afterPid).length;
      steps.push({ t: 'Started from the PAT KMZ', s: `${m.fromPat || 'PAT'} · ${n} pin${n === 1 ? '' : 's'} · ${items.length} item${items.length === 1 ? '' : 's'}`, done: true, go: 'records', label: 'Records' });
      steps.push({ t: 'Fix each defect and photo it', s: items.length ? `${items.length - open.length} of ${items.length} fixed · ${open.length} open${noPhoto ? ` · ${noPhoto} without photo` : ''}` : 'No deficiencies to fix', done: items.length > 0 && !open.length, go: 'next', label: 'Next defect' });
      steps.push({ t: 'Share the cleanup KMZ for the FAT', s: fresh(['sent']) ? `Shared ${fmtTime(ex.sent)}` : 'One KMZ with the fixed items and photos, for the inspector', done: n > 0 && fresh(['sent']), go: 'share', label: 'Share KMZ' });
    } else {
      const items = pts.flatMap((p) => counting(p)), open = items.filter((d) => defStatusOf(d) === 'Open'), rect = items.filter((d) => defStatusOf(d) === 'Rectified'), ver = items.filter((d) => defStatusOf(d) === 'Verified');
      steps.push({ t: m.fromStage === 'Cleanup' ? 'Started from the cleanup KMZ' : 'Started from the PAT', s: m.fromPat ? `${m.fromPat} · ${n} element${n === 1 ? '' : 's'} · ${items.length} item${items.length === 1 ? '' : 's'}` : `Started empty · ${n} element${n === 1 ? '' : 's'}`, done: true, go: 'records', label: 'Records' });
      steps.push({ t: 'Contractor rectifies', s: items.length ? `${rect.length + ver.length} of ${items.length} rectified · ${open.length} open${open.some((d) => (d.reopened || []).length) ? ' (some rejected)' : ''}` : 'No deficiencies to rectify', done: items.length > 0 && !open.length, go: 'next', label: 'Next pin' });
      steps.push({ t: 'Check and accept each fix', s: items.length ? `${ver.length} verified · ${rect.length} awaiting verification` : '—', done: items.length > 0 && ver.length === items.length, go: 'next', label: 'Next pin' });
      steps.push({ t: 'Export the final Deficiency List', s: fresh(['pdf']) ? 'PDF made after the last change' : 'Deficiency List PDF with the verified photos, and the rectification report', done: n > 0 && fresh(['pdf']), go: 'export', label: 'Export' });
    }
    steps.push({ t: 'Complete the task', s: m.completedAt ? `Completed ${longDate(m.completedAt)}` : 'Completion report (PDF), or Mark task complete', done: !!m.completedAt, go: 'complete', label: 'Complete' });
    go.complete = () => closeAll().then(() => { exportPick = 'doCompletion'; $('exportBtn').click(); });
    const next = steps.find((x) => !x.done) || null;
    return { cat, steps, next, go };
  }
  async function closeAll() { while (stack.length) await closeSheet(); }
  /** "1 site · 1 ODF · 2 NAP · 1 closure" for the survey points other than poles. */
  function svCountText(pts) {
    return SV_ELEMENTS.filter((el) => el !== 'Pole').map((el) => [el, pts.filter((p) => elemOf(p) === el).length]).filter(([, k]) => k)
      .map(([el, k]) => `${k} ${el === 'Site' ? `site${k === 1 ? '' : 's'}` : el === 'Closure' ? `closure${k === 1 ? '' : 's'}` : el === 'Handhole' ? `handhole${k === 1 ? '' : 's'}` : el}`).join(' · ');
  }
  /** What an As-plan survey must have: a site, an ODF or ODC location, a POI (closure on a pole or handhole with a closure). */
  const asPlanParts = (pts) => ({ site: pts.some((p) => elemOf(p) === 'Site'), odf: pts.some((p) => ['ODF', 'ODC'].includes(elemOf(p))), poi: pts.some(isPoi), nap: pts.filter((p) => elemOf(p) === 'NAP').length });
  /** Why the current project may not be completed yet (As-plan surveys, v2.13); empty when it may. */
  async function completeGaps() {
    if (isAcc() || svPurpose() !== 'As-plan') return [];
    const pts = projPoints(), g = asPlanParts(pts), poles = pts.filter((p) => elemOf(p) === 'Pole'), out = [];
    if (!poles.length) out.push('the poles, each with a photo');
    let noPic = 0;
    for (const p of poles) { const ph = await dbGet('photos', p.id).catch(() => null); if (!ph || !(ph.clean || ph.thumb)) noPic++; }
    if (noPic) out.push(`a photo of ${noPic} pole${noPic === 1 ? '' : 's'}`);
    if (!g.site) out.push('the site (new or existing)');
    if (!g.odf) out.push('the ODF or ODC location');
    if (!g.poi) out.push('a POI: a closure on a pole, or a handhole with its closure ID');
    return out;
  }
  const notReady = (gaps) => ask('Not ready to complete', `An As-plan survey needs:\n• ${gaps.join('\n• ')}\n\nCapture ${gaps.length === 1 ? 'it' : 'them'}, then complete the task.`, [{ label: 'OK', value: false, primary: true }]);
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
  const PURPOSE_LABEL = { 'As-plan': 'As-Plan Creation', 'As-built': 'As-Built Creation', Audit: 'Audit', PAT: 'PAT', Cleanup: 'Defect Rectification', FAT: 'FAT' };
  const STAGE_LABEL = { survey: 'Survey', PAT: 'PAT', Cleanup: 'Defect Cleanup', FAT: 'FAT' };
  const projKind = (name) => { const pm = pmeta(name); return pm.mode === 'acceptance' ? pm.stage || 'PAT' : 'survey'; };
  function projSummary(name) {
    const pm = pmeta(name), k = projKind(name), pts = points.filter((p) => p.project === name), n = pts.length;
    if (k === 'survey') { const np = pts.filter((p) => elemOf(p) === 'Pole').length, no = n - np; return `${PURPOSE_LABEL[pm.purpose] || 'Survey'} · ${np} pole${np === 1 ? '' : 's'}${no ? ` · ${no} other` : ''}`; }
    const open = pts.reduce((t, p) => t + openCount(p), 0);
    return `${PURPOSE_LABEL[k]} · ${n} element${n === 1 ? '' : 's'} · ${open} open`;
  }
  function renderProjects() {
    renderWorkflow();
    const m = pmeta(), acc = isAcc(), cat = taskCat();
    const pick = $('projPick'); pick.innerHTML = '';
    if (!S.project) pick.add(new Option('No project yet', '', true, true));
    allProjects().forEach((name) => pick.add(new Option(`${name} · ${STAGE_LABEL[projKind(name)]}`, name, false, name === S.project)));
    pick.value = S.project; pick.disabled = !allProjects().length;
    $('noProjHint').hidden = !!S.project; $('wfBox').hidden = !S.project; $('curMore').hidden = !S.project;
    $('curSub').textContent = projSummary(S.project);
    $('renameProject').value = S.project;
    $('purposeRow').hidden = acc; $('curPurpose').value = m.purpose || 'As-plan'; renderRefInfo();
    $('curNotes').value = m.notes || '';
    $('curSite').hidden = !m.taskId; $('curSite').textContent = m.taskId ? [`Site: ${m.site || ''}`, m.contractor && `Vendor: ${m.contractor}`, ...(m.siteExtra || []).map(([k, v]) => `${k}: ${v}`), `ID: ${m.taskId}`].filter(Boolean).join(' · ') : '';
    $('curFolder').hidden = !m.siteLink;
    $('accMeta').hidden = !acc;
    const pb = $('projBadge'); pb.textContent = cat.toUpperCase(); pb.className = `badge cat ${cat.toLowerCase()}`;
    if (acc) {
      $('accStageInfo').textContent = m.stage === 'FAT' ? `FAT · Final Acceptance Test${m.fromPat ? ` · verifying the PAT “${m.fromPat}”${m.fromStage === 'Cleanup' ? ' after the defect cleanup' : ''}` : ''}`
        : m.stage === 'Cleanup' ? `Defect cleanup · fixing the PAT punchlist${m.fromPat ? ` of “${m.fromPat}”` : ''}` : 'PAT · Provisional Acceptance Test';
      if (!m.vendorRep && S.user && S.user.name) { m.vendorRep = S.user.name; S.meta[S.project] = { ...m }; persist(); } // the contractor representative is the user of the app
      $('mSite').value = m.site || ''; $('mContractor').value = m.contractor || ''; $('mVendorRep').value = m.vendorRep || ''; $('mGlobe').value = m.globeRep || '';
      $('mDate').value = m.date || '';
      const types = formText().types || [], chosen = m.inspTypes || allInspTypes(), box = $('mTypes'); box.innerHTML = '';
      types.forEach((t) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = t; b.setAttribute('aria-pressed', String(chosen.includes(t)));
        b.addEventListener('click', () => { const cur = new Set(pmeta().inspTypes || allInspTypes()); if (cur.has(t)) cur.delete(t); else cur.add(t); const mm = { ...pmeta(), inspTypes: types.filter((x) => cur.has(x)) }; S.meta[S.project] = mm; persist(); renderProjects(); });
        box.appendChild(b);
      });
      $('accActs').hidden = m.stage === 'FAT'; renderShareWarn('shareWarn');
      $('sendPatLbl').textContent = m.stage === 'Cleanup' ? 'Share cleanup KMZ · for the FAT' : 'Share PAT KMZ · for defect cleanup / FAT';
      $('startFat').textContent = m.stage === 'Cleanup' ? 'Start FAT from this cleanup on this phone' : 'Start FAT from this PAT on this phone';
    }
    if (!acc) $('accActs').hidden = true;
    $('doneInfo').hidden = !m.completedAt; $('doneInfo').textContent = m.completedAt ? `✓ Completed ${longDate(m.completedAt)}${progressFields(S.project).length ? (pendingFor(S.project) ? ' · waiting to sync' : ' · in the online sheet') : ''}` : '';
    $('doneBtn').textContent = m.completedAt ? 'Undo complete' : '✓ Mark task complete'; $('doneBtn').classList.toggle('undo', !!m.completedAt);
    { const W = S.project ? workflowModel() : null, left = W ? W.steps.filter((x) => !x.done && x.go !== 'complete').length : 0;
      $('doneHint').textContent = m.completedAt ? '' : left ? `${left} step${left === 1 ? '' : 's'} below still open; you can complete when the task is finished.` : 'Every step is done: mark the task complete, or export the completion report.'; }
    $('doneBox').hidden = !S.project;
    $('curStartRow').hidden = acc; $('curStart').value = m.startDate || '';
    $('delProjConfirm').hidden = true; $('delProject').hidden = false;
  }
  /** Inspection types: all ticked unless the user unticks some (v2.10). */
  const allInspTypes = () => (formText().types || []).slice();
  /** Before the KMZ goes to the next stage: nothing recorded or no deficiency blocks it; missing photos are flagged. */
  function shareCheck() {
    const recs = projPoints(), stage = pmeta().stage || 'PAT', items = recs.flatMap((r) => counting(r)), flags = [];
    const err = !recs.length ? 'No element recorded yet' : !items.length ? 'No deficiency (N, D or MD) recorded' : '';
    if (stage === 'PAT') { const n = items.filter((d) => !d.pid).length; if (n) flags.push(`${n} deficienc${n === 1 ? 'y' : 'ies'} without an as-found photo`); }
    else {
      const fixed = items.filter((d) => defStatusOf(d) !== 'Open'), n = fixed.filter((d) => !d.afterPid).length, open = items.length - fixed.length;
      if (n) flags.push(`${n} fix${n === 1 ? '' : 'es'} without a photo`);
      if (open) flags.push(`${open} item${open === 1 ? '' : 's'} still open`);
    }
    return { err, flags };
  }
  function renderShareWarn(id) {
    const c = shareCheck(), el = $(id);
    el.textContent = c.err ? `⚠ ${c.err}: nothing to share yet.` : c.flags.length ? `⚠ ${c.flags.join(' · ')}` : '';
    el.hidden = !el.textContent;
  }
  /** Stops the hand-over when there is nothing to hand over, and asks when photos are missing. */
  async function shareGate(what) {
    const c = shareCheck();
    if (c.err) { toast(`${c.err}: nothing to ${what} yet. Record the defects first.`, 5500); return false; }
    if (!c.flags.length) return true;
    return ask('Check before you continue', `${c.flags.join('\n')}\n\nContinue anyway?`, [{ label: 'Cancel', value: false }, { label: 'Continue', value: true, primary: true }]);
  }
  function openProjects() { renderProjects(); openSheet('projects'); cloudSync(false); }
  $('projectBtn').addEventListener('click', openProjects);
  $('projPick').addEventListener('change', () => {
    const name = $('projPick').value; if (!name || name === S.project) return;
    S.project = name; persist(); renderPoles(); fitProject(); renderProjects(); toast(`Now working on: ${name}`);
  });
  [['mSite', 'site'], ['mContractor', 'contractor'], ['mGlobe', 'globeRep'], ['mDate', 'date'], ['curNotes', 'notes']].forEach(([id, key]) => {
    $(id).addEventListener('change', () => { const m = { ...pmeta() }; m[key] = $(id).value.trim(); S.meta = S.meta || {}; S.meta[S.project] = m; persist(); });
  });
  $('startFat').addEventListener('click', () => guard(async () => { if (await shareGate('verify')) await startFatFrom(S.project); }, 'FAT not started'));
  $('curFolder').addEventListener('click', () => { const l = pmeta().siteLink; if (l) openExternal(l); });
  $('curStart').addEventListener('change', () => { S.meta = S.meta || {}; S.meta[S.project] = { ...pmeta(), startDate: $('curStart').value }; persist(); queueProgress(S.project, ['surveyStart']); renderProjects(); });
  $('doneBtn').addEventListener('click', async () => {
    const m = pmeta(), col = progressFields(S.project).filter(([f]) => f !== 'surveyStart').map(([f]) => PROGRESS_COL[f])[0];
    if (!m.completedAt) { const gaps = await completeGaps(); if (gaps.length) { await notReady(gaps); return; } }
    const ok = m.completedAt
      ? await ask('Undo complete?', `The task is no longer marked complete${col ? `, and the ${col} is cleared in the online sheet` : ''}.`, [{ label: 'Cancel', value: false }, { label: 'Undo', value: true, primary: true }])
      : await ask('Mark the task complete?', `Today is recorded as the completion date${col ? ` (${col} in the online sheet)` : ''}. You can also export the completion report (Export → Completion report).`, [{ label: 'Cancel', value: false }, { label: 'Mark complete', value: true, primary: true }]);
    if (!ok) return;
    markComplete(!m.completedAt, 'tagged'); renderProjects(); renderPoles();
    toast(m.completedAt ? 'No longer marked complete' : 'Task marked complete', 3000);
  });
  /* ---- task completion and progress in the online sheet (v2.11) ---- */
  const PROGRESS_COL = { surveyStart: 'Survey Start Date', surveyDone: 'Survey Completion Date', pat: 'PAT Date', fat: 'FAT Date' };
  /** The dates the online sheet keeps for the site of a project: the As-Plan survey's start and completion, the PAT and the FAT. */
  function progressFields(name) {
    const m = pmeta(name); if (!m.taskId) return [];
    if (m.mode !== 'acceptance') return (m.purpose || 'As-plan') === 'As-plan' ? [['surveyStart', m.startDate || ''], ['surveyDone', m.completedAt || '']] : [];
    const st = m.stage || 'PAT';
    return st === 'PAT' ? [['pat', m.completedAt || '']] : st === 'FAT' ? [['fat', m.completedAt || '']] : [];
  }
  const pendingFor = (name) => (S.syncQ || []).some((q) => q.project === name);
  function markComplete(on, how) {
    const m = { ...pmeta() };
    if (on) { if (m.completedAt) return; m.completedAt = todayIso(); m.completedHow = how; } else { delete m.completedAt; delete m.completedHow; }
    S.meta[S.project] = m; persist(); LOG.info('task.complete', { on, how, cat: taskCat() }); queueProgress(S.project, ['surveyDone', 'pat', 'fat']);
  }
  let flushing = null, syncErr = '';
  /** fields: only these (e.g. ['surveyStart'] when the start date is set), so another phone's dates are not cleared. */
  function queueProgress(name, fields) {
    const m = pmeta(name), list = progressFields(name).filter(([f]) => !fields || fields.includes(f)); if (!list.length) return;
    S.syncQ = (S.syncQ || []).filter((q) => !(q.id === m.taskId && list.some(([f]) => f === q.field)));
    list.forEach(([field, date]) => S.syncQ.push({ id: m.taskId, field, date, project: name }));
    persist(); renderSyncBtn(); flushProgress(false);
  }
  /** Sends the waiting dates: phones with a company key (their own sites) or the admin phone. Offline, they wait here. */
  function flushProgress(force) {
    if (!force && syncMode() !== 'change') return Promise.resolve(false); // hourly or manual: sent with the next sync
    if (flushing) return flushing;
    const q = (S.syncQ || []).slice(), src = S.team && S.team.src, admin = isAdmin() && !!S.onlineAdminKey;
    if (!q.length || !src || !navigator.onLine) return Promise.resolve(false);
    if (!keyMode() && !admin) { syncErr = 'needs a company key to write to the sheet'; return Promise.resolve(false); }
    flushing = (async () => {
      try {
        const j = await cloudRequest({ url: src.url }, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'progress', updates: q.map(({ id, field, date }) => ({ id, field, date })), ...(keyMode() ? { ckey: S.companyKey } : {}), ...(admin ? { key: S.onlineAdminKey } : {}) }) });
        if (!j || !j.ok) throw new Error(j && (j.error === 'action' || j.error === 'key') ? 'the online sheet needs the v2.11 script' : (j && j.error) || 'no answer');
        const failed = (j.results || []).filter((r) => !r.ok);
        S.syncQ = (S.syncQ || []).filter((x) => !q.includes(x)); persist(); // answered: a refused row is logged, not sent again
        syncErr = failed.length ? `${failed.length} not written (${failed[0].error})` : '';
        LOG.info('progress.sent', { n: q.length, failed: failed.map((r) => `${r.field}:${r.error}`) });
        return true;
      } catch (e) { syncErr = e.message || String(e); LOG.warn('progress.fail', errInfo(e)); return false; }
      finally { flushing = null; renderSyncBtn(); if (!$('projects').hidden) renderProjects(); }
    })();
    return flushing;
  }
  function renderSyncBtn() {
    const n = (S.syncQ || []).length;
    $('syncBtn').hidden = !(S.team && S.team.src); $('syncDot').hidden = !n;
    $('syncBtn').setAttribute('aria-label', n ? `Sync: ${n} update${n === 1 ? '' : 's'} waiting` : 'Sync with the online sheet');
  }
  $('syncBtn').addEventListener('click', async () => {
    const b = $('syncBtn'); if (b.classList.contains('spin')) return;
    b.classList.add('spin');
    try {
      const n = (S.syncQ || []).length, sent = n ? await flushProgress(true) : false, ok = await cloudSync(true);
      if (!$('newProj').hidden) renderSites(); if (!$('projects').hidden) renderProjects();
      toast(!navigator.onLine ? `No internet${n ? `: ${n} update${n === 1 ? '' : 's'} wait on this phone` : ''}`
        : ok ? `Synced with the online sheet${n ? ` · ${sent ? `${n} update${n === 1 ? '' : 's'} sent` : `updates not sent: ${syncErr}`}` : ''}${sent && syncErr ? ` (${syncErr})` : ''}`
          : `Not synced: ${cloudErr || syncErr || 'no answer'}`, 5000);
    } finally { b.classList.remove('spin'); renderSyncBtn(); }
  });
  /* ---- completion report (v2.11) ---- */
  /** Photo pages of the completion report. Survey (v2.12): every photo as a collage, the poles first, then the site, ODC, ODF,
      NAP, closures and handholes (v2.13), each captioned with its element and status. */
  async function polePhotos(pts) {
    const list = pts.flatMap((r) => photosOf(r).map((p) => ({ r, p }))), poles = [], other = [];
    let done = 0, missing = 0;
    for (const { r, p } of list) {
      busy(`Preparing photos ${++done} / ${list.length}…`, done / list.length);
      const jpeg = await pdfJpeg(p.pid, 640).catch(() => null);
      if (!jpeg) { missing++; continue; }
      const q = p.at ? p.q : r.q, el = elemOf(r);
      (el === 'Pole' ? poles : other).push({ jpeg, head: el === 'Pole' ? `${r.poleId || 'No ID'}${r.status === 'Proposed' || r.status === 'New' ? ` · ${svStatusLabel(r.status)}` : ''}${p.label && !['Overview', 'Photo'].includes(p.label) ? ` · ${p.label}` : ''}` : `${r.poleId || 'No ID'} · ${svDesc(r)}`,
        lines: [`${shortTime(p.at || r.takenAt || r.created)}${r.boxes ? ' · red box' : ''}`], warn: q && q.flags && q.flags.length ? `Camera warning when taken: ${q.flags.join(', ')}` : '' });
    }
    busy(false);
    const sections = [];
    if (poles.length) sections.push({ title: 'Poles', layout: 'collage', sub: 'One tile per photo, in capture order.', items: poles });
    if (other.length) sections.push({ title: 'Site, ODC, ODF, NAP, closures, handholes', layout: 'collage', sub: 'Each with its element and status (proposed, new or existing); red boxes mark the spot.', items: other });
    const parts = [poles.length && `${poles.length} pole photo${poles.length === 1 ? '' : 's'}`, other.length && `${other.length} other photo${other.length === 1 ? '' : 's'}`].filter(Boolean);
    return { sections, line: parts.length ? `${parts.join(' · ')} (from page 2)` : 'No photos on this phone', missing };
  }
  /** PAT, defect cleanup and FAT (v2.12.1): only the deficiency photos of each punchlist item — as found, rectified (or the
      rejected fix) and verified — with the item, element and time burned in, as in Annex A of the Deficiency List. */
  async function defectPhotos(M) {
    const items = [], n = { found: 0, fixed: 0, verified: 0, rejected: 0 }, none = [];
    for (let i = 0; i < M.items.length; i++) {
      busy(`Preparing photos · item ${i + 1} / ${M.items.length}…`, (i + 1) / M.items.length);
      const b = await evidenceBlock(M.items[i], 1200, 0.82);
      const photos = b.stages.filter((st) => st.jpeg).map((st) => {
        const k = /^AS FOUND/.test(st.label) ? 'found' : /REJECTED/.test(st.label) ? 'rejected' : /^RECTIFIED/.test(st.label) ? 'fixed' : 'verified'; n[k]++;
        const lines = st.lines || [];
        return { label: st.label, tone: st.tone, jpeg: st.jpeg, lines: lines.filter((l, j) => !(j && /^By /.test(l) && / by /.test(lines[0]))) };
      });
      const notes = b.stages.filter((st) => !st.jpeg && !st.pending).map((st) => `${st.label}: ${st.note}${st.lines && st.lines[0] ? ` — ${st.lines[0]}` : ''}`);
      if (!photos.length && b.code !== 'N') none.push(`#${b.no}`); // an observation (note) needs no photo
      items.push({ head: `#${b.no} · ${b.loc} · ${b.text}`, right: `${b.code} · ${b.status}`, rightTone: b.statusTone, notes, photos });
    }
    busy(false);
    const parts = [[n.found, 'as found'], [n.fixed, 'rectified'], [n.rejected, `rejected fix${n.rejected === 1 ? '' : 'es'}`], [n.verified, 'verified']].filter(([c]) => c).map(([c, t]) => `${c} ${t}`);
    const noneTxt = none.length ? ` · no photo: item ${none.join(', ')}` : '';
    if (!parts.length) return { sections: [], line: (items.length ? 'No deficiency photos on this phone' : 'No deficiencies recorded') + noneTxt, missing: 0 };
    return { sections: [{ title: 'Deficiencies', count: `${items.length} item${items.length === 1 ? '' : 's'}`, layout: 'chain', items,
      sub: 'Each punchlist item as found, rectified and verified (the photos taken so far), with the item, element and time burned into each photo.' }],
      line: `${parts.join(' · ')} (from page 2)${noneTxt}`, missing: 0 };
  }
  $('doCompletion').addEventListener('click', () => guard(async () => {
    const pts = projPoints(), acc = isAcc();
    if (!pts.length && !(await ask('Nothing recorded', 'This project has no records yet. Make the completion report anyway?', [{ label: 'Cancel', value: false }, { label: 'Make it', value: true, primary: true }]))) return;
    if (!pmeta().completedAt) { const gaps = await completeGaps(); if (gaps.length) { await notReady(gaps); return; } markComplete(true, 'report'); }
    const m = pmeta(), R = window.PoleReports, k = acc ? m.stage || 'PAT' : 'survey';
    const catLabel = STAGE_LABEL[k], purpose = PURPOSE_LABEL[acc ? k : m.purpose || 'As-plan'];
    let summary = [];
    if (!acc) { const Rt = routeModel(), len = Rt.spans.reduce((t, s) => t + s.len, 0); summary = [['Poles captured', pts.filter((p) => elemOf(p) === 'Pole').length], ['Other points', pts.filter((p) => elemOf(p) !== 'Pole').length], ['Spans linked', Rt.spans.length], ['Route length (m)', Math.round(len)], ['Long spans', Rt.long, Rt.long ? 'bad' : 'good']]; }
    else { const M = accModel(); summary = [['Elements', M.recs.length], ['Deficiencies', M.counted.length], ['Still open', M.open.length, M.open.length ? 'bad' : 'good'], [k === 'FAT' ? 'Verified' : 'Rectified', k === 'FAT' ? M.verified : M.rectified + M.verified, 'blue']]; }
    const ex = m.exports || {}, made = Object.entries(ex).filter(([kk]) => kk !== 'completion').map(([kk, at]) => `${kk.toUpperCase()} ${shortTime(at)}`).join(' · ');
    const info = [['Project', S.project], ['Task category', catLabel], ['Location / site', m.site || ''], ['Purpose', purpose], ['Vendor (contractor)', m.contractor || (S.user && S.user.company) || ''], ['Site ID (online sheet)', m.taskId || '—'],
      [acc ? 'Inspection date' : 'Started', longDate(acc ? m.date : m.startDate) || '—'], ['Completed', longDate(m.completedAt)]];
    const ph = $('complPhotos').checked && pts.length ? await (acc ? defectPhotos(accModel()) : polePhotos(pts)) : null;
    const photoLine = ph ? ph.line + (ph.missing ? ` · ${ph.missing} record photo${ph.missing === 1 ? '' : 's'} missing on this phone` : '') : pts.length ? 'Not included' : '—';
    const npl = pts.filter((p) => elemOf(p) === 'Pole').length;
    const details = [['Records', acc ? `${pts.length} element${pts.length === 1 ? '' : 's'}` : `${npl} pole${npl === 1 ? '' : 's'}${pts.length > npl ? ` · ${svCountText(pts)}` : ''}`], ['Recorded by', peopleText() || byLine()],
      ['Photos', photoLine], ['Exports made', made || '—'], ['Reference KMZ', (refInfo() && refInfo().name) || '—'], ...(m.fromPat ? [['From', `${m.fromStage || 'PAT'} “${m.fromPat}”`]] : []), ['Remarks / notes', m.notes || '—']];
    const same = purpose === catLabel; // PAT, FAT: the purpose is the category
    const pdf = R.completionPdf({ title: 'TASK COMPLETION REPORT', stageLong: same ? catLabel : `${catLabel} · ${purpose}`, statement: `${catLabel}${same ? '' : ` (${purpose})`} of ${m.site || S.project} completed on ${longDate(m.completedAt)}.`,
      info, summary, details, signers: [{ role: 'Prepared by (contractor representative)', name: m.vendorRep || (S.user && S.user.name) || '' }, { role: 'Accepted by (Globe representative)', name: m.globeRep || '' }],
      footer: `${S.project} · completion report`, footer2: exporterLine(), photos: ph ? ph.sections : [] });
    LOG.info('completion.pdf', { pages: pdf.pages.length, photos: ph ? ph.line : 'off', missing: ph ? ph.missing : 0 });
    offerResult(new Blob(pdf.output({ title: `${S.project} completion report` }), { type: 'application/pdf' }), `${fileBase()}_completion_report.pdf`);
  }, 'Completion report not made'));
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
    S.meta[name] = { ...patMeta, stage: 'FAT', fromPat: m.fromPat || pat, fromStage: m.stage || 'PAT', vendorRep: (S.user && S.user.name) || m.vendorRep || '', date: todayIso(), ...extra };
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
    S.project = allProjects()[0] || ''; persist();
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
    const folder = String(S.saveFolder || 'G-eSAA').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'G-eSAA';
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
    const kind = /_BACKUP\.zip$/i.test(name) ? 'backup' : /_PAT_for_FAT_/i.test(name) ? 'sent' : /_completion_report\.pdf$/i.test(name) ? 'completion' : /_DXF_photos\.zip$/i.test(name) ? 'dxf' : (name.split('.').pop() || '').toLowerCase();
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
    const stg = pmeta().stage || 'PAT';
    $('xShareBox').hidden = !acc || stg === 'FAT';
    if (acc && stg !== 'FAT') { $('xShareLbl').textContent = stg === 'Cleanup' ? 'Share cleanup KMZ' : 'Share PAT KMZ'; $('xShareFor').textContent = stg === 'Cleanup' ? 'for the FAT' : 'for defect cleanup / FAT'; renderShareWarn('xShareWarn'); }
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
  /* Who made an export (v2.10): every exported file carries it, so a file can be traced back to the person who sent it. */
  function exporterInfo() { const u = S.user || {}; return { name: u.name || '', mobile: u.mobile || '', email: u.email || '', company: u.company || '', at: new Date().toISOString(), app: `G-eSAA ${APP_VER}` }; }
  function exporterLine(sep) { const e = exporterInfo(), j = sep || ' · '; return `Exported by ${[e.name, e.mobile, e.email, e.company].filter(Boolean).join(j)}${j}${shortTime(e.at)}${j}${e.app}`; }
  function exporterText() { const e = exporterInfo(); return `G-eSAA export\nProject: ${S.project}\nExported by: ${e.name}\nMobile: ${e.mobile}\nEmail: ${e.email}\nCompany: ${e.company}\nDate: ${e.at}\nApp: ${e.app}\n`; }
  function exporterSheet(st) { const e = exporterInfo(); return { name: 'Exported by', cols: [16, 46], rows: [['Exported by', ''].map((v) => ({ v, s: st.header })), ['Name', e.name], ['Mobile', e.mobile], ['Email', e.email], ['Company', e.company], ['Date', shortTime(e.at)], ['App', e.app], ['Project', S.project]] }; }
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
      const r = { ...p, element: elemOf(p), statusLabel: svStatusLabel(p.status), detailsText: detailsText(p.details) };
      if (ph && ph.clean && E.kmzBalloonPx > 0) { r.photoName = `photos/${names[p.id]}.jpg`; files.push({ name: 'files/' + r.photoName, data: await exportPhoto(p, ph.clean, null, null, { maxPx: E.kmzBalloonPx, stamp: E.kmzStamp, quality: 0.85 }) }); }
      if (icons && ph && (ph.clean || ph.thumb)) { r.iconName = `icons/${p.id}.jpg`; files.push({ name: 'files/' + r.iconName, data: await iconJpeg(ph.clean || ph.thumb, E.kmzIconPx, elemOf(p) === 'Pole' ? null : SV_COLORS[elemOf(p)]) }); }
      rows.push(r);
    }
    busy('Building KMZ…', 1);
    const kml = C.buildKml(rows, { project: `${S.project}${pmeta().purpose ? ` · ${pmeta().purpose}` : ''}`, photoIcons: icons, spans: E.kmzRoute ? routeModel().spans : [], stamped: !!E.kmzStamp, stampFields: E.stampFields, exportedBy: exporterLine() });
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
    const E = S.exp, focPct = Math.max(0, Math.min(100, Number.isFinite(+E.focPct) ? +E.focPct : 10)), photoW = Math.max(1, Math.min(50, +E.dxfPhotoW || 6));
    const rows = pts.map((p) => ({ ...p, element: elemOf(p), detailsText: detailsText(p.details) })), name = `${fileBase()}_UTM${S.zone}N`;
    const opts = { zone: S.zone, symbolSize: S.sym, textHeight: S.txt, spans: routeModel().spans, exportedBy: exporterLine(' | '), focPct };
    if (E.dxfPhotos === false) { // plain DXF R12, no photos
      busy('Building DXF…');
      offerResult(new Blob([C.buildDxf(rows, { ...opts, version: 'R12' }, roads)], { type: 'application/dxf' }), `${name}.dxf`);
      if (note) toast(note, 4000); return;
    }
    // DXF R2000 with an IMAGE beside each point; the JPEGs sit next to the DXF in the ZIP (AutoCAD finds them in the drawing's folder)
    const names = uniqueNames(pts), photos = {}, files = [];
    for (let i = 0; i < pts.length; i++) {
      busy(`Preparing photos ${i + 1} / ${pts.length}`, i / pts.length);
      const jpg = await pdfJpeg(coverPid(pts[i]) || pts[i].id, 1024, null, null, 0.82).catch(() => null); if (!jpg) continue;
      let dim; try { dim = window.PoleReports.jpegInfo(jpg); } catch (e) { continue; }
      const file = `${names[pts[i].id]}.jpg`; photos[pts[i].id] = { file, px: dim.w, py: dim.h }; files.push({ name: file, data: jpg });
    }
    busy('Building DXF…');
    const dxf = C.buildDxf(rows, { ...opts, version: 'R2000', photos, photoW }, roads);
    files.unshift({ name: `${name}.dxf`, data: dxf });
    files.push({ name: 'README.txt', data: `${name}.dxf — DXF R2000 (AutoCAD 2000 or newer), UTM ${S.zone}N, metres.\r\nUnzip everything into ONE folder and open the DXF: each photo is linked by its file name and must stay next to the DXF.\r\nLayers: POLE_<type> circles (…_PROPOSED / …_NEW), POLE_LABEL (IDs), POLE_DETAILS, POINT_PHOTO (photos), CABLE_ROUTE / SPAN_LONG (linked route), FOC_LENGTH (span + ${focPct}%), <ELEMENT>_<STATUS> for site, ODC, ODF, NAP, closures and handholes.\r\n${exporterText()}` });
    offerResult(new Blob(C.makeZipParts(files), { type: 'application/zip' }), `${name}_DXF_photos.zip`);
    if (note) toast(note, 4000);
  }));

  $('doCsv').addEventListener('click', () => guard(async () => {
    const pts = needPoints(); if (!pts) return;
    const names = uniqueNames(pts);
    const rows = pts.map((p) => ({ ...p, photoName: names[p.id] + '.jpg', detailsText: detailsText(p.details) }));
    offerResult(new Blob([C.buildCsv(rows, S.zone, exporterLine())], { type: 'text/csv' }), fileBase() + '.csv');
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
      [lbl('Poles in project'), pts.filter((p) => elemOf(p) === 'Pole').length],
      [lbl('Other points (site, ODC, ODF, NAP, closures, handholes)'), pts.filter((p) => elemOf(p) !== 'Pole').length],
      [lbl('Terminal poles (1 span)'), Rt.terminal],
      [lbl('Inline poles'), Rt.inline],
      [lbl('Angle poles'), Rt.angle],
      [lbl('Junction poles (3+ spans)'), Rt.junction],
      [lbl('Route points not linked'), { v: Rt.off, s: Rt.off ? st.bad : st.cell }],
      [],
      [{ v: 'Span lengths are straight lines between pole pins, not cable lengths: add sag, slack and MLoop allowance per your design standard.', s: st.info }],
    ];
    const spanRows = [['No.', 'From', 'To', 'Length (m)', 'Longer than maximum', 'From lat', 'From lon', 'To lat', 'To lon'].map((v) => ({ v, s: st.header }))];
    Rt.spans.forEach((s, i) => spanRows.push([{ v: i + 1, s: st.center }, s.from, s.to, { v: Math.round(s.len * 10) / 10, s: s.long ? st.bad : st.cell },
      { v: s.long ? 'Yes' : 'No', s: s.long ? st.bad : st.cell }, { v: s.a.lat, s: st.coord }, { v: s.a.lon, s: st.coord }, { v: s.b.lat, s: st.coord }, { v: s.b.lon, s: st.coord }]));
    const poleRows = [['No.', 'ID', 'Element', 'Type / status', 'Role on route', 'Spans at point', 'Deflection (°)', 'Latitude', 'Longitude', `UTM ${S.zone}N E`, `UTM ${S.zone}N N`, 'Pole details', 'Remarks'].map((v) => ({ v, s: st.header }))];
    pts.forEach((p, i) => {
      const info = Rt.poles[p.id] || { role: 'On a pole (not a route point)', degree: '', deflection: null }, u = C.utmForward(p.lat, p.lon, S.zone, p.lat < 0), el = elemOf(p);
      poleRows.push([{ v: i + 1, s: st.center }, p.poleId, el, [el === 'Pole' ? p.poleType || '' : '', svStatusLabel(p.status), p.closureId ? `closure ${p.closureId}` : ''].filter(Boolean).join(' · '),
        { v: info.role, s: info.role === 'Not on route' ? st.bad : st.cell }, info.degree,
        info.deflection == null ? '' : Math.round(info.deflection * 10) / 10, { v: p.lat, s: st.coord }, { v: p.lon, s: st.coord }, Math.round(u.E * 1000) / 1000, Math.round(u.N * 1000) / 1000, detailsText(p.details), p.remarks || '']);
    });
    const parts = R.buildXlsxParts([
      { name: 'Summary', cols: [30, 44], rows: summary, merges: ['A1:B1', `A${summary.length}:B${summary.length}`] },
      { name: 'Spans', cols: [6, 15, 15, 11, 12, 12, 13, 12, 13], rows: spanRows, freezeRow: 1, autoFilter: `A1:I${spanRows.length}` },
      { name: 'Points', cols: [6, 15, 10, 18, 16, 9, 11, 12, 13, 13, 13, 30, 30], rows: poleRows, freezeRow: 1, autoFilter: `A1:M${poleRows.length}` },
      exporterSheet(st),
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
      if (r.kind !== 'acceptance') { if (!r.boxes) add(r.id, elemOf(r), r, 'survey photo'); continue; } // a photo with a red box is not a clean training photo
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
    files.push({ name: 'dataset/labels.csv', data: window.PoleReports.csv(rows) }, { name: 'dataset/exported_by.txt', data: exporterText() });
    files.push({ name: 'dataset/README.txt', data: `G-eSAA training photos\nExported ${new Date().toISOString()}\nOne folder per label; photos resized to 640 px. labels.csv lists every file.\n\nPhotos per label:\n${summary}\n\nAim for 200+ photos per label before training a model. Check a sample of each folder: a label is only as good as the photo slot it was taken in.\n` });
    offerResult(new Blob(C.makeZipParts(files), { type: 'application/zip' }), `${dsScope === 'all' ? 'G-eSAA_all_projects' : C.safeName(S.project)}_training_photos_${stamp8()}.zip`);
    toast(`${files.length - 3} photos in ${Object.keys(counts).length} folders`, 3500);
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
      files.push({ name: 'exported_by.txt', data: exporterText() });
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
    files.push({ name: 'exported_by.txt', data: exporterText() });
    offerResult(new Blob(C.makeZipParts(files), { type: 'application/zip' }), fileBase() + '_photos.zip');
  }));

  /** Records + original photos of a project, as files for a backup ZIP (prefix '') or inside a shareable KMZ (prefix 'polecam/'). */
  async function projectFiles(name, prefix) {
    const pre = prefix || '', pts = points.filter((p) => p.project === name).sort((a, b) => (a.created < b.created ? -1 : 1));
    const files = [{ name: `${pre}points.json`, data: JSON.stringify({ app: 'PoleCam', version: 2, project: name, meta: pmeta(name), exported: new Date().toISOString(), by: byLine(), exportedBy: exporterInfo(), points: pts }, null, 1) }];
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
    if (pre == null) throw new Error(z.names.some((n) => /\.kml$/i.test(n)) ? 'This KMZ has no G-eSAA data. Export it again from G-eSAA (Projects → Project details → Share the KMZ), or tick “Include the PoleCam data” under the KMZ options.' : 'This is not a G-eSAA (PoleCam) file');
    const meta = JSON.parse(new TextDecoder().decode(await z.get(`${pre}points.json`)));
    if (!meta || !Array.isArray(meta.points)) throw new Error('This is not a G-eSAA (PoleCam) file');
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
    S.meta[name] = { ...rest, mode: 'acceptance', stage, fromPat: pat, fromStage: from, fromFile: f.name || '', vendorRep: (S.user && S.user.name) || rest.vendorRep || '', date: todayIso(), ...extra };
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
      form: pol().form, logos: o.logos, stage: M.stage === 'FAT' ? 'FAT' : 'PAT', typesChecked: m.inspTypes || allInspTypes(),
      location: m.site || '', project: (M.stage !== 'PAT' && m.fromPat) || S.project, vendor: m.contractor || '', date: insp,
      items: M.items.map((x) => ({ no: x.no, code: SEV_CODE[sevOf(x.d)], text: itemText(x), rectified: rectifiedDate(x.d) })),
      signers: { left: { name: m.vendorRep || '', date: signDate }, right: { name: m.globeRep || '', date: signDate } },
      footer: `${S.project} · ${M.stage} · ${exporterLine()}`,
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
        [lbl('Contractor representative'), null, { v: M.m.vendorRep || M.m.inspector || '' }, null, null, lbl('Inspection date'), null, { v: M.dates }],
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
    sheets.push({ name: 'People', cols: [28, 28, 18, 32], rows: people, freezeRow: 1 }, exporterSheet(st));
    const parts = R.buildXlsxParts(sheets);
    offerResult(new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), accFileBase(M) + '_deficiency_list.xlsx');
  }));

  $('doAccCsv').addEventListener('click', () => guard(async () => {
    if (!needPoints()) return;
    const M = accModel();
    const by = exporterLine();
    const out = window.PoleReports.csv([[...PUNCH_HEAD, 'Exported by'], ...punchRows(M).map((r) => [...r.map((v, i) => ((i === PI.lat || i === PI.lon) && typeof v === 'number' ? v.toFixed(8) : v)), by])]);
    offerResult(new Blob([out], { type: 'text/csv' }), accFileBase(M) + '_punchlist.csv');
  }));

  /** Smaller JPEG for the PDF so a report with hundreds of photos stays shareable. */
  async function pdfJpeg(pid, maxPx, stampLines, stampColor, quality) {
    const ph = await dbGet('photos', pid).catch(() => null);
    if (!ph || !ph.clean) return null;
    const im = await loadImage(ph.clean), { w, h } = dims(im), sc = Math.min(1, maxPx / Math.max(w, h));
    const cv = document.createElement('canvas'); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, cv.width, cv.height); if (im.close) im.close();
    if (stampLines && stampLines.length) { // time + place burned into the picture itself
      const fs = Math.max(12, Math.round(cv.width * 0.032)), lh = fs * 1.3, pad = fs * 0.6, bandH = pad * 2 + lh * stampLines.length;
      g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(0, cv.height - bandH, cv.width, bandH);
      g.fillStyle = stampColor || '#4dabf7'; g.fillRect(0, cv.height - bandH, Math.max(4, fs * 0.3), bandH);
      g.fillStyle = '#fff'; g.textBaseline = 'top';
      stampLines.forEach((t, i) => { g.font = `${i ? '' : '700 '}${fs}px sans-serif`; g.fillText(t, pad * 1.5, cv.height - bandH + pad + i * lh, cv.width - pad * 3); });
    }
    return new Uint8Array(await (await toBlob(cv, quality || 0.72)).arrayBuffer());
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
  async function evidenceBlock(x, px, quality) {
    const d = { ...x.d, foundAt: x.d.foundAt || x.r.takenAt }, r = x.r, stt = defStatusOf(d), rej = d.reopened || []; // older records: found when the element was photographed
    const stages = [];
    const foundL = `AS FOUND (${d.stage || 'PAT'})`, rectL = 'RECTIFIED (CONTRACTOR)', verL = `VERIFIED (${d.verifyStage || (stt === 'Verified' ? d.stage || 'PAT' : 'FAT')})`;
    const last = rej[rej.length - 1];
    stages.push(d.pid
      ? { label: foundL, tone: 'bad', jpeg: await pdfJpeg(d.pid, px, [`AS FOUND · ${r.poleId} · item ${x.no}`, d.pidMeta ? shortTime(d.pidMeta.at) : shortTime(d.foundAt)], '#c92a2a', quality),
        lines: [`Found ${shortTime(d.foundAt)} (${d.stage || 'PAT'})${d.foundBy ? ` by ${d.foundBy}` : ''}`, ...metaLines(d.pidMeta, r, 'Photo').slice(1)] }
      : { label: foundL, tone: stt === 'Note' ? 'muted' : 'bad', plain: stt === 'Note', jpeg: null, note: stt === 'Note' ? 'No photo' : 'No photo taken when the deficiency was recorded', lines: [`Found ${shortTime(d.foundAt)}${d.foundBy ? ` by ${d.foundBy}` : ''}`] });
    if (stt === 'Note') stages.push({ label: rectL, tone: 'muted', pending: true, note: 'Not required — observation only', lines: [] }, { label: verL, tone: 'muted', pending: true, note: 'Not required', lines: [] });
    else {
      if (defDone(d)) stages.push(d.afterPid
        ? { label: rectL, tone: 'blue', jpeg: await pdfJpeg(d.afterPid, px, [`RECTIFIED · ${r.poleId} · item ${x.no}`, d.afterMeta ? shortTime(d.afterMeta.at) : ''].filter(Boolean), '#1971c2', quality),
          lines: [`Rectified ${shortTime(d.fixedAt)}${d.fixedBy ? ` by ${d.fixedBy}` : ''}`, ...metaLines(d.afterMeta, r, 'Photo').slice(1)] }
        : { label: rectL, tone: 'blue', jpeg: null, note: 'Marked rectified without a photo', lines: [`Rectified ${shortTime(d.fixedAt)}${d.fixedBy ? ` by ${d.fixedBy}` : ''}`] });
      else if (last && last.pid) stages.push({ label: `${rectL} · REJECTED`, tone: 'bad', jpeg: await pdfJpeg(last.pid, px, [`REJECTED · ${r.poleId} · item ${x.no}`, last.meta ? shortTime(last.meta.at) : ''].filter(Boolean), '#c92a2a', quality),
        lines: [`Rectification of ${shortTime(last.fixedAt || last.at)}${last.fixedBy ? ` by ${last.fixedBy}` : ''} rejected ${shortTime(last.at)}${last.by ? ` by ${last.by}` : ''}: ${last.reason || 'no reason given'}`, ...(rej.length > 1 ? [`Rejected ${rej.length} times in all`] : [])] });
      else stages.push({ label: rectL, tone: 'blue', pending: true, note: rej.length ? 'Rectification rejected — pending again' : 'Pending rectification', lines: rej.length ? [`Rejected ${rej.length}×, last ${shortTime(last.at)}${last.by ? ` by ${last.by}` : ''}: ${last.reason || 'no reason given'}`] : [] });
      if (stt === 'Verified') stages.push(d.verifyPid
        ? { label: verL, tone: 'good', jpeg: await pdfJpeg(d.verifyPid, px, [`VERIFIED · ${r.poleId} · item ${x.no}`, d.verifyMeta ? shortTime(d.verifyMeta.at) : ''].filter(Boolean), '#2b8a3e', quality),
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
      footer: `${S.project} · rectification report`, footer2: exporterLine(),
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
      if (E.kmzIconPx > 0) { const cp = coverPid(r), ph = cp && await dbGet('photos', cp).catch(() => null); if (ph && (ph.clean || ph.thumb)) { icon = `icons/${r.id}.jpg`; files.push({ name: `files/${icon}`, data: await iconJpeg(ph.clean || ph.thumb, E.kmzIconPx, STATUS_COLORS[recStatus(r)]) }); } }
      recs.push({ id: r.id, name: r.poleId, title: `${r.poleId} · ${elemOf(r)} · ${STATUS_TEXT[recStatus(r)]}`, status: recStatus(r), lat: r.lat, lon: r.lon, icon,
        // coordinates and time are left out when the balloon photos already carry them in their stamp
        detailsHtml: [...attachText(r), ...(onPhoto(r, 'coords') ? [] : [`Coordinates: ${r.lat.toFixed(7)}, ${r.lon.toFixed(7)}`]), ...(onPhoto(r, 'time') ? [] : [`Captured: ${fmtTime(r.takenAt)}`])].map(C.xmlEsc).join('<br/>'),
        photos: byRec[r.id] || [],
        defs: M.items.filter((x) => x.r === r).map((x) => ({ no: x.no, text: `${x.d.cat}: ${x.d.item}${x.d.notes ? ' — ' + x.d.notes : ''}`, sev: sevOf(x.d), status: defStatusOf(x.d) })) });
    }
    const data = withData ? await projectFiles(S.project, 'polecam/') : [];
    busy('Building KMZ…', 1);
    const kml = window.PoleReports.acceptanceKml(recs, { name: `${S.project} · ${M.stage}`, icons, exportedBy: exporterLine() });
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
        $('storeInfo').textContent = `${n} record${n === 1 ? '' : 's'} in ${np} project${np === 1 ? '' : 's'}. Using ${fmtMB(est.usage || 0)}; this phone currently lets G-eSAA use up to about ${fmtMB(est.quota || 0)}. ${per ? 'Protected from automatic cleanup.' : 'Not yet protected from automatic cleanup.'}`;
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
    $('setReadId').checked = S.readId !== false; $('setIdAuto').checked = S.idAuto !== false; $('setOrient').value = S.idOrient === 'v' ? 'v' : 'h'; $('setHand').value = handOf();
    $('setQuality').value = effectiveQuality(); $('setQuality').disabled = !!S.team;
    $('qualityNote').textContent = S.team ? `Set by the admin in the company list “${S.team.name}” — the same on every phone.` : 'Until this phone takes a company list, you can choose this yourself.';
    openSheet('setCamera');
  });
  $('setReadId').addEventListener('change', () => { S.readId = $('setReadId').checked; persist(); });
  $('setIdAuto').addEventListener('change', () => { S.idAuto = $('setIdAuto').checked; persist(); });
  $('setHand').addEventListener('change', () => { S.hand = $('setHand').value; persist(); applyHand(); toast(`Camera button on the ${handOf()}`, 2000); });
  $('setOrient').addEventListener('change', () => { S.idOrient = $('setOrient').value === 'v' ? 'v' : 'h'; persist(); });
  $('setQuality').addEventListener('change', () => { if (S.team) return; S.quality = $('setQuality').value; persist(); });
  /* export defaults: the same control appears on the Export screen (first id) and under Settings (second id) */
  const EXP_PAIRS = [['setMaxPx', 'setMaxPx2', 'maxPx', 'num'], ['expQuality', 'expQuality2', 'quality', 'num'], ['setStamp', 'setStamp2', 'stamp', 'bool'], ['expNaming', 'expNaming2', 'naming', 'str'],
    ['kmzBalloonPx', 'kmzBalloonPx3', 'kmzBalloonPx', 'num'], ['kmzBalloonPx2', 'kmzBalloonPx3', 'kmzBalloonPx', 'num'], ['kmzIconPx', 'kmzIconPx3', 'kmzIconPx', 'num'], ['kmzIconPx2', 'kmzIconPx3', 'kmzIconPx', 'num'],
    ['kmzRoute', 'kmzRoute2', 'kmzRoute', 'bool'], ['kmzStamp', 'kmzStamp3', 'kmzStamp', 'bool'], ['kmzStamp2', 'kmzStamp3', 'kmzStamp', 'bool'],
    ['pdfPhotoSize', 'pdfPhotoSize2', 'pdfPhotoSize', 'str'], ['pdfAnnexA', 'pdfAnnexA2', 'pdfAnnexA', 'bool'], ['pdfAnnexB', 'pdfAnnexB2', 'pdfAnnexB', 'bool'],
    ['pdfDates', 'xlsDates', 'pdfDates', 'str'], ['xlsTable', null, 'xlsTable', 'bool'], ['xlsPhotos', null, 'xlsPhotos', 'bool'], ['kmzData', null, 'kmzData', 'bool'],
    ['dxfPhotos', null, 'dxfPhotos', 'bool'], ['dxfPhotoW', null, 'dxfPhotoW', 'num'], ['focPct', null, 'focPct', 'num']];
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
    $('setSaveBase').value = S.saveBase || 'DOCUMENTS'; $('setSaveFolder').value = S.saveFolder || 'G-eSAA'; $('setSaveByProject').checked = S.saveByProject !== false;
    updateSavePreview(); openSheet('setExports');
  });
  function updateSavePreview() {
    $('savePreview').textContent = NATIVE ? `Files go to: ${savePath('…').shown.replace(/\/…$/, '/')}` : 'Website version: your browser saves to its Downloads folder.';
    ['setSaveBase', 'setSaveFolder', 'setSaveByProject'].forEach((id) => { $(id).disabled = !NATIVE; });
  }
  $('expReset').addEventListener('click', async () => {
    if (!(await ask('Reset export settings?', 'Photo size, stamp, file names, KMZ, PDF, Excel and DXF options and the save folder go back to their defaults.', [{ label: 'Cancel', value: false }, { label: 'Reset', value: true, primary: true }]))) return;
    S.exp = JSON.parse(JSON.stringify(DEF.exp)); S.zone = DEF.zone; S.sym = DEF.sym; S.txt = DEF.txt;
    S.saveBase = DEF.saveBase; S.saveFolder = DEF.saveFolder; S.saveByProject = DEF.saveByProject; persist();
    syncExpUi(); $('dxfZoneLbl').textContent = `UTM ${S.zone}N`;
    $('setSaveBase').value = S.saveBase; $('setSaveFolder').value = S.saveFolder; $('setSaveByProject').checked = true; updateSavePreview();
    toast('Export settings reset to the defaults', 2500);
  });
  $('setSaveBase').addEventListener('change', () => { S.saveBase = $('setSaveBase').value; persist(); updateSavePreview(); });
  $('setSaveFolder').addEventListener('change', () => { S.saveFolder = $('setSaveFolder').value.trim() || 'G-eSAA'; persist(); updateSavePreview(); });
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
    if (p.adminUsers != null && !list(p.adminUsers, 100, 120)) return false;
    if (p.vendorRecords != null && typeof p.vendorRecords !== 'boolean') return false;
    if (p.web != null && !(typeof p.web === 'string' && /^https:\/\/\S{1,300}$/.test(p.web))) return false;
    if (p.packs != null && !(Array.isArray(p.packs) && p.packs.length <= 30 && p.packs.every((x) => x && str(x.n, 60) && typeof x.d === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(x.d) && num(x.mb, 0, 100000)))) return false;
    return true;
  }
  if (S.team && !validTeam(S.team)) { S.team = null; persist(); }
  /** Short code that tells two lists apart even when their names look the same. */
  const listCode = (b) => { const id = String(b.id).replace(/[^A-Za-z0-9]/g, ''); return `${id.slice(0, 4)}-${id.slice(-4)}`.toUpperCase(); };
  /* ---- this copy of PoleCam can be tied to one organisation: org.json next to index.html (made by the admin) ---- */
  const validOrg = (o) => !!o && o.type === 'polecam-org' && typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 40 && typeof o.name === 'string' && o.name.length <= 100
    && (o.key == null || (typeof o.key === 'string' && o.key.length <= 200)) && (o.web == null || (typeof o.web === 'string' && /^https:\/\/\S{1,300}$/.test(o.web)))
    && (o.src == null || (typeof o.src === 'object' && typeof o.src.url === 'string' && /^https:\/\/\S{1,300}$/.test(o.src.url)));
  let ORG = validOrg(S.org) ? S.org : null;
  async function loadOrg() {
    try {
      const r = await withTimeout(fetch('org.json', { cache: 'no-cache' }), 6000, 'slow');
      if (r.status === 404) { if (ORG) { ORG = null; delete S.org; persist(); renderJoin(); renderTeamInfo(); } return; } // the admin removed the lock
      if (!r.ok) return;
      const o = await r.json();
      if (!validOrg(o)) { LOG.warn('org.invalid'); return; }
      ORG = { type: o.type, id: o.id, name: o.name, key: o.key || null, web: o.web || null, src: o.src ? { url: o.src.url } : null }; S.org = ORG; persist();
      LOG.info('org', { name: ORG.name, list: !!S.team && S.team.id === ORG.id, sheet: !!ORG.src }); renderJoin(); renderTeamInfo(); if (!$('profile').hidden) renderProfileMode();
      if (ORG.src && navigator.onLine) { // does the organisation use company keys? (no key is sent)
        try { const j = await cloudRequest({ url: ORG.src.url }, null, { probe: true }); if (j && j.ok && typeof j.strict === 'boolean') { S.sheetStrict = j.strict; persist(); if (!$('profile').hidden) renderProfileMode(); } } catch (e) { /* keep the last answer */ }
      }
    } catch (e) { /* offline: keep the last one */ }
  }
  /** The address of the web app, for join links (the APK uses the one in org.json or in the list). */
  const webBase = () => {
    if (!NATIVE && location.protocol === 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return location.origin + location.pathname.replace(/index\.html$/, '');
    return (ORG && ORG.web) || (/^https:\/\//.test(window.POLECAM_SITE || '') ? window.POLECAM_SITE : '') || (S.team && S.team.pol && S.team.pol.web) || ''; // the APK knows its website
  };
  const joinLink = (text) => { const b = webBase(); return b ? `${b}#join=${text}` : ''; };
  /** A pasted or scanned join link, or the list text itself. */
  const joinText = (t) => { const s = String(t || '').trim(), m = /#join=([^\s&#]+)/.exec(s); if (!m) return s; try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } };
  const teamCos = () => {
    if (S.team && S.team.src && S.cloud && S.cloud.src === S.team.src.url && S.cloud.companies.length) return S.cloud.companies; // online sheet
    return S.team && Array.isArray(S.team.co) ? S.team.co : [];
  };
  const profileOk = () => !!(S.user && S.user.name && S.user.mobile && S.user.email && S.user.company && (keyMode() ? S.user.company === S.keyCompany : !teamCos().length || teamCos().includes(S.user.company)));
  /* ---- company keys (v2.10): the key tells the online sheet which company a user belongs to; the company is then fixed ---- */
  const keyMode = () => !!(S.companyKey && S.keyCompany);
  const normKey = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sheetUrl = () => (S.team && S.team.src && S.team.src.url) || (ORG && ORG.src && ORG.src.url) || '';
  /** Key sign-in is offered where the organisation uses company keys (the sheet says so), or the app is tied to one with a sheet. */
  const keyOffered = () => keyMode() || (!holdsListKey() && !!(sheetUrl() && ((S.cloud && S.cloud.strict) || (ORG && ORG.src && S.sheetStrict !== false) || /company key/.test(cloudErr)))); // the admin who holds the list key may still choose
  async function keyLogin(raw) {
    const key = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (normKey(key).length < 8) throw new Error('Enter the company key from your admin or a coworker, e.g. 7KQ4-MX2P-9TRW.');
    const url = sheetUrl();
    if (!url) throw new Error('Open the invite link or QR code from your admin or a coworker first.');
    if (!navigator.onLine) throw new Error('Connect to the internet once to check the company key.');
    const j = await cloudRequest({ url, key: (S.team && S.team.src && S.team.src.key) || '' }, null, { ckey: key });
    if (!j || !j.ok) throw new Error(j && j.error === 'company key' ? 'This company key is not valid. Ask your admin or a coworker for the right one.' : j && j.error === 'key' ? 'The online sheet does not accept company keys yet: the admin must update its script (v2.10).' : `The online sheet did not answer${j && j.error ? ` (${j.error})` : ''}.`);
    if (!j.you) throw new Error('The online sheet does not accept company keys yet: the admin must update its script (v2.10).');
    if (j.list) { // the signed company list comes with the answer: a new phone joins it here, an old one updates
      let p = null, body = null;
      try { p = await unpackShare(j.list); body = p && p.kind === 'PCT' ? JSON.parse(p.obj.b) : null; } catch (e) { body = null; }
      if (body && (!S.team || S.team.id !== body.id || body.rev > S.team.rev)) await acceptTeam(p.obj, true, { quiet: true });
    }
    if (!S.team) throw new Error('The online sheet has no company list yet: the admin saves it once with the Admin key.');
    const nk = normKey(key); S.companyKey = nk.length === 12 ? nk.match(/.{4}/g).join('-') : key; S.keyCompany = s100(j.you); S.cloud = null; persist();
    LOG.info('key.login', { company: S.keyCompany });
    return S.keyCompany;
  }
  /** Invite link for coworkers: the company key (and, when the app is not tied to the sheet, the list too). */
  async function inviteLink() {
    const base = webBase(); if (!base || !keyMode()) return '';
    if (ORG && ORG.src && S.team && ORG.id === S.team.id) return `${base}#ck=${encodeURIComponent(S.companyKey)}`;
    return `${base}#join=${await packShare('PCT', { b: S.team.b, s: S.team.s, k: S.team.k })}&ck=${encodeURIComponent(S.companyKey)}`;
  }
  const holdsListKey = () => !!(S.adminKey && S.team && (S.team.key === S.adminKey.pub || (S.team.admins || []).some((a) => a.k === S.adminKey.pub)));
  const isAdmin = () => holdsListKey() && adminUserOk();
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
    renderProfileMode();
  }
  /** With company keys the user types (or scans) a key instead of choosing a company, and never sees the company names. */
  function renderProfileMode() {
    const keyed = keyOffered(), locked = keyMode();
    $('pfKeyBox').hidden = !keyed; $('pfCoBox').hidden = keyed && !locked;
    if (locked) {
      $('pfKey').value = S.companyKey; $('pfKey').readOnly = true; $('pfKeyScan').hidden = true;
      $('pfCompany').innerHTML = `<option>${C.xmlEsc(S.keyCompany)}</option>`; $('pfCompany').disabled = true;
      $('pfKeyInfo').textContent = 'Your company comes from this key. To change it: Settings → Reset user.';
      $('pfTeam').textContent = '';
    } else if (keyed) {
      $('pfKey').readOnly = false; $('pfKeyScan').hidden = false;
      if (!$('pfKey').value && pendingKey) $('pfKey').value = pendingKey;
      $('pfKeyInfo').textContent = "From your admin, or scan a coworker's invite QR code.";
    }
    $('pfJoin').hidden = keyed || !!teamCos().length;
  }
  let moveFill = null; // details from a move link (v2.15), shown for a check until Save
  function openProfile(first) {
    profileFirst = !!first;
    const u = { ...(S.user || {}), ...(moveFill || {}) };
    $('pfName').value = u.name || (S.userName ? S.userName.split('·')[0].trim() : '');
    $('pfMobile').value = u.mobile || ''; $('pfEmail').value = u.email || '';
    renderCoSelect(u.company || '');
    if (moveFill && moveFill.key && !keyMode()) { $('pfKey').value = moveFill.key; renderProfileMode(); }
    $('profBack').hidden = profileFirst;
    $('profTitle').textContent = profileFirst ? 'Welcome to G-eSAA' : 'Your details';
    $('profIntro').textContent = profileFirst
      ? 'Before the first photo, enter your details. They are recorded on every photo and report, and stay on this phone.'
      : 'Recorded on every photo, pole and punchlist item from now on. Records already saved keep the name they were saved with.';
    $('pfErr').hidden = true;
    if (stack[stack.length - 1] !== 'profile') openSheet('profile');
  }
  const mobileOk = (m) => /^\+?\d{7,15}$/.test(m.replace(/[\s\-().]/g, ''));
  $('pfSave').addEventListener('click', async () => {
    const name = $('pfName').value.trim().replace(/\s+/g, ' '), mobile = $('pfMobile').value.trim().replace(/\s+/g, ' ');
    const email = $('pfEmail').value.trim(), keyed = keyOffered() && !keyMode();
    let company = keyMode() ? S.keyCompany : $('pfCompany').value;
    const err = name.length < 3 ? 'Enter your full name.' : !mobileOk(mobile) ? 'Enter your mobile number, e.g. 0917 123 4567 or +63 917 123 4567.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? 'Enter a valid email address.'
        : keyed ? (normKey($('pfKey').value).length < 8 ? 'Enter your company key.' : '')
          : !company ? (teamCos().length ? 'Choose your company.' : 'Get the company list from your admin first (below).') : '';
    if (err) { $('pfErr').textContent = err; $('pfErr').hidden = false; return; }
    if (keyed) { // the key says which company this user belongs to
      $('pfErr').textContent = 'Checking the company key…'; $('pfErr').hidden = false; $('pfSave').disabled = true;
      try { company = await keyLogin($('pfKey').value); } catch (e) { $('pfErr').textContent = e.message || String(e); return; } finally { $('pfSave').disabled = false; }
      $('pfErr').hidden = true; renderProfileMode();
    }
    const own = pol().owner;
    if (own && normCo(company) === normCo(own) && !adminUserOk(email) && S.team && S.team.src && navigator.onLine) { $('pfErr').textContent = 'Checking with the online sheet…'; $('pfErr').hidden = false; await cloudSync(true); $('pfErr').hidden = true; } // just added by the admin?
    if (own && normCo(company) === normCo(own) && !adminUserOk(email)) { $('pfErr').textContent = `Only the ${own} users added by your admin can choose ${own}. Ask your admin to add ${email.toLowerCase()}, or choose your own company.`; $('pfErr').hidden = false; return; }
    if (own && normCo(company) === normCo(own) && hasListKey(S.team) && !holdsListKey() && !keyMode()) { // the admin company is for its own staff (a company key already proves it)
      const pin = await askPin(`Admin PIN of ${own}`, `${own} is the admin company. Its staff enter the admin PIN once; contractors choose their own company.`);
      if (pin == null) return;
      const jwk = await decPriv(S.team.keyEnc, pin);
      if (!jwk) { $('pfErr').textContent = `Wrong admin PIN. Only ${own} staff with the PIN can choose ${own}.`; $('pfErr').hidden = false; return; }
      S.adminKey = { pub: S.team.key, priv: jwk };
    }
    const coChanged = !S.user || S.user.company !== company;
    S.user = { name, mobile, email: email.toLowerCase(), company }; moveFill = null; persist();
    if (coChanged) cloudSync(true).then(() => { if (!$('newProj').hidden) renderSites(); }); // the sheet sends each company its own sites
    const first = profileFirst; profileFirst = false; await closeSheet();
    renderWho(); toast(`Saved: ${byLine()}`);
    if (first && !S.project) askNewProject();
  });
  function renderWho() {
    const u = S.user;
    $('whoBox').textContent = u ? u.name : 'Enter your details';
    $('whoSub').textContent = u ? `${u.company} · ${u.mobile} · ${u.email}${isInspector() && pol().owner ? ' · inspector' : ''}` : 'Name, mobile, email and company';
    $('inviteBtn').hidden = !keyMode();
  }
  $('inviteBtn').addEventListener('click', () => guard(async () => {
    const link = await inviteLink();
    if (!link) { toast('No website address for the invite: open G-eSAA from its website once, or ask your admin', 5000); return; }
    qrLink = link; qrAlt = null;
    await showQr(`Invite to ${S.keyCompany}`, `A coworker scans this with the phone's camera (or you send the link), then enters their name, mobile and email. Share it only inside ${S.keyCompany}: it carries your company key.`, link);
  }, 'No invite'));
  $('resetUser').addEventListener('click', async () => {
    const ok = await ask('Reset the user of this phone?', 'Your name, mobile, email, company and company key are removed from this phone, and the welcome screen asks for them again. Projects and photos stay on the phone, with the names they were recorded with.',
      [{ label: 'Cancel', value: false }, { label: 'Reset user', value: true, primary: true }]);
    if (!ok) return;
    LOG.info('user.reset', { keyed: keyMode() });
    S.user = null; S.companyKey = ''; S.keyCompany = ''; S.adminKey = null; S.cloud = null; persist();
    ['pfName', 'pfMobile', 'pfEmail', 'pfKey'].forEach((id) => { $(id).value = ''; });
    renderWho(); renderTeamInfo(); openProfile(true);
  });
  $('editMe').addEventListener('click', () => openProfile(false));
  /* ---- moving the user to another phone (v2.15): one link or QR code with the company list and the user's details ---- */
  $('moveBtn').addEventListener('click', () => guard(async () => {
    if (!S.user) { toast('Enter your details first'); return; }
    const base = webBase();
    if (!base) { toast('No website address for the link: open G-eSAA from its website once, or ask your admin', 5000); return; }
    const u = S.user, mv = b64u.enc(enc8(JSON.stringify({ n: u.name, m: u.mobile, e: u.email, c: u.company, ...(S.companyKey ? { k: S.companyKey } : {}) })));
    let list = '';
    if (S.team) { const short = await shortJoin(); list = short ? short.slice(short.indexOf('#') + 1) : `join=${await packShare('PCT', { b: S.team.b, s: S.team.s, k: S.team.k })}`; }
    const link = `${base}#${list ? `${list}&` : ''}mv=${mv}`;
    qrLink = link; qrAlt = null;
    await showQr('Move to another phone', 'On the new phone, scan this with the camera, or send yourself the link and open it there. Your company list and details (name, mobile, email, company) are filled in for a check: tap Save. Projects and photos: Export → Backup on this phone, then open the backup ZIP on the new phone. Admins enter the admin PIN again. The link carries your details: send it only to yourself.', link);
    $('qrLinkBtn').textContent = 'Send the link to myself';
  }, 'Not ready'));
  async function applyMove(code) {
    let o = null;
    try { o = JSON.parse(new TextDecoder().decode(b64u.dec(code))); } catch (e) { o = null; }
    if (!o || !o.n || !o.e) { toast('That move link is damaged. Make a new one on the old phone (Settings → Move to another phone).', 5500); return false; }
    if (S.user && S.user.email && S.user.email !== String(o.e).toLowerCase()) {
      const ok = await ask('Use these details on this phone?', `This phone is set up for ${S.user.name}. Replace with ${o.n}? Projects and photos stay on the phone.`, [{ label: 'Cancel', value: false }, { label: 'Replace', value: true, primary: true }]);
      if (!ok) return false;
    }
    moveFill = { name: String(o.n).slice(0, 80), mobile: String(o.m || '').slice(0, 30), email: String(o.e).slice(0, 120), company: String(o.c || '').slice(0, 100), key: o.k ? String(o.k).slice(0, 40) : '' };
    LOG.info('user.move', { keyed: !!o.k });
    openProfile(!profileOk());
    toast('Your details are filled in: check them, then tap Save', 5000);
    return true;
  }

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
  async function acceptTeam(obj, allowSwitch, opts) {
    let body;
    try { body = JSON.parse(obj.b); } catch (e) { body = null; }
    if (!validTeam(body)) throw new Error('This is not a G-eSAA company list');
    if (ORG && body.id !== ORG.id) throw new Error(`This G-eSAA is set up for “${ORG.name}” only. Ask your admin for its join link.`);
    if (ORG && ORG.key && !(S.team && S.team.id === body.id) && body.key !== ORG.key && body.prevKey !== ORG.key) throw new Error(`Not accepted: this “${body.name}” list was not made with the admin PIN this G-eSAA expects. Ask your admin for a new join link.`);
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
      const quiet = opts && opts.quiet && (!cur || (ORG && body.id === ORG.id)); // a company key vouches for it
      const ok = quiet || await ask(cur ? 'Switch to a different company list?' : 'Use this company list?',
        `${body.name} (code ${listCode(body)})\n${body.pol && body.pol.owner ? `Admin company: ${body.pol.owner}` : body.admins.length ? `Admin${body.admins.length === 1 ? '' : 's'}: ${body.admins.map((a) => a.n).join(', ')}` : 'No admin company set'}`
        + (cur ? `\n\nThis is NOT an update of “${cur.name}” (code ${listCode(cur)}): it is another list, made by whoever holds its admin key. Switch only if your admin told you to.` : ''),
        [{ label: 'Cancel', value: false }, { label: cur ? 'Switch' : 'Use this list', value: true, primary: true }]);
      if (!ok) return { cancelled: true };
    }
    const wasAdmin = isAdmin();
    S.team = { ...body, b: obj.b, s: obj.s, k: obj.k }; S.teamSeen[body.id] = Math.max(seen, body.rev); persist();
    const note = wasAdmin && !isAdmin() && cur && cur.id === body.id ? ' The admin PIN was changed: enter the new PIN under Manage to stay an admin.' : '';
    return { ok: true, msg: `Company list “${body.name}” version ${body.rev}.${note}` };
  }
  let teamSwitch = false; // set only by Settings → Switch to another list (or when the phone has no list yet)
  async function importTeamText(text, opts) {
    if (!cryptoOk()) return false;
    let p = null;
    try { p = await unpackShare(joinText(text)); } catch (e) { p = null; }
    if (!p) { toast('That is not a G-eSAA join link or company list', 4000); return false; }
    if (p.kind !== 'PCT') { toast('That is an admin request from an older version. Since v2.1 admins are the staff of the admin company: choose that company in your profile and enter the admin PIN.', 6000); return false; }
    try {
      const r = await acceptTeam(p.obj, teamSwitch || !S.team, opts);
      if (r.cancelled) return false;
      toast(r.msg, 4500); afterTeamChange();
      if (S.team.src) cloudSync(true).then(() => { afterTeamChange(); if (!$('profile').hidden) renderCoSelect($('pfCompany').value); });
      return true;
    } catch (e) { toast(e.message, 6500); return false; }
  }
  function afterTeamChange() {
    if (S.user && pol().owner && normCo(S.user.company) === normCo(pol().owner) && !adminUserOk()) {
      S.adminKey = null; S.user = { ...S.user, company: '' }; persist();
      const msg = `Your admin has not added ${S.user.email} as a ${pol().owner} user. Choose your own company.`;
      if ($('profile').hidden) openProfile(true);
      $('pfErr').textContent = msg; $('pfErr').hidden = false; toast(msg, 6500);
    }
    refreshTypes();
    renderTeamInfo();
    if (!$('profile').hidden) renderCoSelect($('pfCompany').value || (S.user && S.user.company) || '');
    if (!keyMode() && S.user && S.user.company && teamCos().length && !teamCos().includes(S.user.company)) {
      toast(`“${S.user.company}” is not on the new company list. Choose your company again.`, 5000);
      if ($('profile').hidden) openProfile(true);
    }
  }
  function renderTeamInfo() {
    const t = S.team;
    const own = t && t.pol && t.pol.owner;
    $('teamInfo').textContent = t ? `“${t.name}” v${t.rev} · ${isAdmin() ? `${teamCos().length} compan${teamCos().length === 1 ? 'y' : 'ies'} · ` : ''}${own ? `admin company ${own}` : t.key ? 'no admin company' : `admin${t.admins.length === 1 ? '' : 's'}: ${t.admins.map((a) => a.n).join(', ')}`}${isAdmin() ? ' · you are an admin' : isInspector() && own ? ' · your company' : ' · contractor user'}`
      : ORG ? `Not joined yet. Open the join link from your ${ORG.name} admin.` : 'No company list on this phone yet. Open the join link from your admin.';
    // v2.15: the list's details and its sharing are for the admin company; others see its name and keep it up to date
    const listAdmin = !t || isAdmin() || canManage();
    $('goAdmin').hidden = !listAdmin; $('teamShare').hidden = !t || !listAdmin;
    $('teamMini').hidden = listAdmin || !t; if (t && !listAdmin) $('teamMini').textContent = `Company list “${t.name}” version ${t.rev}${t.src ? ' · updates from the online sheet' : ''}.`;
    $('adminLock').textContent = isAdmin() ? 'ADMIN' : canManage() ? 'PIN' : t ? 'VIEW' : 'SET UP';
    const foreign = !!(ORG && t && t.id !== ORG.id); // e.g. a list made on this phone before the app was tied to the organisation
    if (foreign) $('teamInfo').textContent = `This phone has another list (“${t.name}”). Open the join link from your ${ORG.name} admin to switch.`;
    $('teamManage').hidden = !canManage() || foreign;
    $('teamCreate').hidden = !!t || !!ORG;
    $('teamSwitch').hidden = !t || !listAdmin;
    $('syncModeBox').hidden = !(t && t.src); $('setSync').value = syncMode();
    renderCloudInfo(); renderSyncBtn();
  }
  async function scanTeamQr(sw) {
    const t = await scanQr('Point the camera at the company list QR code on the admin’s phone');
    if (!t) return;
    await handleInvite(t, sw);
  }
  /** A join link, an invite (company key, maybe with the list) or the list text itself. */
  async function handleInvite(text, sw) {
    const t = String(text || '').trim(), ck = (/[#&?]ck=([A-Za-z0-9%-]+)/.exec(t) || [])[1], hasList = /[#&]join=|^PCT[01]:/.test(t), jq = (/[#&]jq=([A-Za-z0-9_-]+)/.exec(t) || [])[1];
    const mv = (/[#&]mv=([A-Za-z0-9_-]+)/.exec(t) || [])[1];
    if (mv) { // moving to this phone (v2.15): the list first, then the user's details for a check and Save
      if (jq && !hasList) await joinShort(jq, sw);
      else if (hasList) { teamSwitch = !!sw || !S.team; try { await importTeamText(t, { quiet: false }); } finally { teamSwitch = false; } }
      return applyMove(mv);
    }
    if (jq && !hasList) return joinShort(jq, sw);
    if (!hasList && !ck) { toast('That is not a G-eSAA invite or join link', 4000); return false; }
    if (hasList) { teamSwitch = !!sw || !S.team || !!ck; try { await importTeamText(t, { quiet: !!ck }); } finally { teamSwitch = false; } }
    if (!ck) return true;
    let key = ck; try { key = decodeURIComponent(ck); } catch (e) { /* as is */ }
    if (keyMode()) { if (normKey(key) !== normKey(S.companyKey)) toast(`This phone already belongs to ${S.keyCompany}. To join another company: Settings → Reset user.`, 6000); return true; }
    if ($('profile').hidden) openProfile(true);
    $('pfKey').value = key; renderProfileMode();
    toast('Company key filled in: enter your name, mobile and email, then Save', 4500);
    return true;
  }
  async function pasteJoin(sw) {
    let t = '';
    try { t = (navigator.clipboard && navigator.clipboard.readText) ? await withTimeout(navigator.clipboard.readText(), 1500, 'slow') : ''; } catch (e) { t = ''; }
    if (!/#join=|[#&]ck=|[#&]jq=|[#&]mv=|^PCT[01]:/.test(String(t).trim())) t = await promptText('Paste the link', 'The join or invite link your admin or a coworker sent.', 'https://…#…', '');
    if (!t) return;
    await handleInvite(t, sw || !!S.team);
  }
  $('pfPaste').addEventListener('click', () => pasteJoin(false));
  /** Welcome screen: join first; creating a new organisation only where this app is not tied to one. */
  function renderJoin() {
    $('pfCreateBox').hidden = !!ORG;
    $('pfJoinText').textContent = ORG ? `Open the join link your ${ORG.name} admin sent you, or scan the admin's QR code.` : 'Open the join link your admin sent you, or scan the admin’s QR code.';
  }
  renderJoin();
  $('pfScan').addEventListener('click', () => scanTeamQr(false));
  $('pfKeyScan').addEventListener('click', () => scanTeamQr(false));
  async function getList(sw) { // v2.15: a list is joined by its link or QR code only (no list files)
    const how = await ask(sw ? 'Switch to another company list' : 'Update the company list',
      sw ? 'Only do this if your admin gave you a new, different list: its join link or QR code.' : 'Paste the join link from your admin, or scan the QR code on an admin’s phone.',
      [{ label: 'Cancel', value: '' }, { label: 'Paste link', value: 'paste' }, { label: 'Scan QR', value: 'scan', primary: true }]);
    if (how === 'scan') scanTeamQr(sw); else if (how === 'paste') pasteJoin(sw);
  }
  $('teamUpdate').addEventListener('click', () => getList(false));
  $('teamSwitch').addEventListener('click', () => getList(true));
  $('teamShare').addEventListener('click', () => showTeamQr());

  /* ---- showing a QR code / sharing the file ---- */
  let qrLink = '', qrAlt = null;
  function drawQr(text) {
    const box = $('qrImg'); box.innerHTML = '';
    if (text.length > 2300 || !window.qrcode) { box.innerHTML = '<p class="hint" style="color:#333">Too much for one QR code. Send the join link instead.</p>'; return; }
    const q = window.qrcode(0, 'L'); q.addData(text); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); // 4 modules of white around it, as QR readers expect
    box.dataset.size = q.getModuleCount();
  }
  let lastQrText = ''; // the text of the QR code on screen (read by the tests)
  async function showQr(title, note, text) {
    lastQrText = text;
    $('qrTitle').textContent = title; $('qrText').textContent = note || '';
    $('qrLinkBtn').hidden = !(qrLink && (text === qrLink || (qrAlt && text === qrAlt.short))); $('qrLinkBtn').textContent = /[#&]ck=/.test(text) ? 'Send the invite link' : 'Send the join link';
    $('qrFull').hidden = !(qrAlt && text === qrAlt.short); $('qrFull').textContent = 'Show the full code (joins without internet)';
    drawQr(text);
    openSheet('qrShow');
  }
  $('qrFull').addEventListener('click', () => {
    if (!qrAlt) return;
    const full = $('qrFull').textContent.startsWith('Show the full');
    drawQr(full ? qrAlt.full : qrAlt.short); lastQrText = full ? qrAlt.full : qrAlt.short;
    $('qrFull').textContent = full ? 'Show the short code (needs internet once)' : 'Show the full code (joins without internet)';
    $('qrText').textContent = full ? qrAlt.fullNote : qrAlt.shortNote;
  });
  /** Short join code (v2.15): where the list is kept in the online sheet, the QR code only names the sheet and the list's
      key, so it stays small and easy to scan. The new phone downloads the list from the sheet and takes it only when it is
      that list, signed with that key. */
  const keyPrint = async (pub) => b64u.enc(new Uint8Array(await crypto.subtle.digest('SHA-256', enc8(String(pub || ''))))).slice(0, 16);
  async function shortJoin() {
    const t = S.team, src = t && t.src, base = webBase();
    if (!t || !t.key || !src || !src.url || !base || !(window.crypto && crypto.subtle)) return '';
    if (!S.sheetListAt || S.sheetListAt.url !== src.url || S.sheetListAt.id !== t.id || S.sheetListAt.rev !== t.rev) return ''; // the sheet must hold this very version
    const m = /^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec$/.exec(src.url);
    const o = { ...(m ? { s: m[1] } : { u: src.url }), r: src.key || '', i: t.id, f: await keyPrint(t.key) };
    return `${base}#jq=${b64u.enc(enc8(JSON.stringify(o)))}`;
  }
  async function showTeamQr(note) {
    if (!S.team) { toast('No company list on this phone yet'); return; }
    const text = await packShare('PCT', { b: S.team.b, s: S.team.s, k: S.team.k }), link = joinLink(text), short = await shortJoin();
    const fullNote = note || `Version ${S.team.rev} · ${teamCos().length} companies. Scan it in G-eSAA (Join your team → Scan QR code) or with the phone's camera, or send the join link.`;
    const shortNote = `Version ${S.team.rev}. Scan it in G-eSAA (Join your team → Scan QR code) or with the phone's camera. The new phone needs internet once to download the list; without internet, show the full code or send the join link.`;
    qrLink = link; qrAlt = short && link ? { short, full: link, shortNote, fullNote } : null;
    await showQr(`Join ${S.team.name}`, qrAlt ? shortNote : fullNote, qrAlt ? short : link || text);
  }
  $('qrClose').addEventListener('click', () => closeSheet());
  $('qrLinkBtn').addEventListener('click', () => guard(async () => { if (qrLink) await shareText(qrLink, `Join ${S.team ? S.team.name : 'G-eSAA'}`); }, 'Not sent'));
  /** Send a short text (a join link): the share sheet, else copy it. */
  async function shareText(text, title) {
    if (NATIVE) { try { await nativeCall('Share', 'share', { title, text, dialogTitle: title }); return; } catch (e) { if (/cancel/i.test(String(e && e.message))) return; } }
    else if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); toast('Join link copied: paste it in Viber, Messenger or email', 4000); }
    catch (e) { await promptText(title, 'Copy this link and send it:', '', text); }
  }

  /* ---- scanning a QR code ---- */
  /* v2.15: a sharper camera (1920 px), the phone's own QR reader when it has one (or ML Kit in the Android app), else jsQR on
     the whole frame and on its centre at full resolution in turn (a dense code needs its full detail); and a QR code received
     as a picture (e.g. a screenshot sent in a chat) can be read from the gallery. */
  let qrStream = null, qrResolve = null, qrTimer = 0, qrDet;
  const scripts = {};
  const loadScript = (src) => scripts[src] || (scripts[src] = new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => { delete scripts[src]; rej(new Error('Could not load ' + src)); }; document.head.appendChild(el); }));
  async function qrDetector() {
    if (qrDet !== undefined) return qrDet;
    qrDet = null;
    if ('BarcodeDetector' in window) { try { if ((await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) qrDet = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { qrDet = null; } }
    return qrDet;
  }
  /** pass: 0 = whole picture, 1 = its centre at full resolution, 'all' = both (pictures). */
  async function decodeQr(src, w, h, pass) {
    const det = await qrDetector();
    if (det) { try { const r = await det.detect(src); if (r.length && r[0].rawValue) return r[0].rawValue; } catch (e) { /* the other readers below */ } }
    if (nativeReader() && (pass === 'all' || pass === 1)) { // ML Kit in the Android app
      try { const r = await nativeCall('TextReader', 'qr', { image: await jpegB64(src, w, h, 1600) }); if (r && r.value) return r.value; } catch (e) { /* jsQR below */ }
    }
    if (!window.jsQR) await loadScript('vendor/qr/jsQR.min.js');
    const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
    const side = Math.min(w, h), c = Math.round(side * 0.75);
    const tries = { 0: [[0, 0, w, h, Math.min(1, 1000 / Math.max(w, h))]], 1: [[(w - c) / 2, (h - c) / 2, c, c, Math.min(1, 1300 / c)]] };
    const list = pass === 'all' ? [[0, 0, w, h, Math.min(1, 2000 / Math.max(w, h))], ...tries[1], ...tries[0]] : tries[pass];
    for (const [x, y, cw, ch, sc] of list) {
      cv.width = Math.max(1, Math.round(cw * sc)); cv.height = Math.max(1, Math.round(ch * sc)); g.drawImage(src, x, y, cw, ch, 0, 0, cv.width, cv.height);
      const r = window.jsQR(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' });
      if (r && r.data) return r.data;
    }
    return null;
  }
  async function jpegB64(src, w, h, max) {
    const sc = Math.min(1, max / Math.max(w, h)), cv = document.createElement('canvas'); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.9).split(',')[1];
  }
  async function scanQr(text) {
    $('qrScanText').textContent = text || 'Point the camera at the QR code';
    $('qrScanTip').textContent = 'Hold the phone 20–30 cm from the code, then move closer until it reads';
    openSheet('qrScan');
    const v = $('qrVideo');
    const result = new Promise((res) => { qrResolve = res; });
    try {
      qrStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      try { await qrStream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) { /* not every camera */ }
    } catch (e) { qrStream = null; $('qrScanTip').textContent = 'The camera is not available here. Tap “From a picture” to read a QR code you received as a picture.'; }
    if ($('qrScan').hidden) { if (qrStream) qrStream.getTracks().forEach((t) => t.stop()); qrStream = null; return null; }
    if (qrStream) {
      v.srcObject = qrStream; await v.play().catch(() => {});
      let n = 0;
      const tick = async () => {
        if (!qrResolve) return;
        let txt = null;
        if (v.videoWidth) { try { txt = await decodeQr(v, v.videoWidth, v.videoHeight, n++ % 2); } catch (e) { /* keep looking */ } }
        if (txt && qrResolve) { const done = qrResolve; qrResolve = null; await closeSheet(); done(txt); return; }
        qrTimer = setTimeout(tick, 120);
      };
      tick();
    }
    return result;
  }
  $('qrPick').addEventListener('click', () => { $('qrPickInput').value = ''; $('qrPickInput').click(); });
  $('qrPickInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f || !qrResolve) return;
    $('qrScanTip').textContent = 'Reading the picture…';
    let txt = null;
    try { const im = await loadImage(f); const { w, h } = dims(im); txt = await decodeQr(im, w, h, 'all'); if (im.close) im.close(); } catch (err) { txt = null; }
    if (txt && qrResolve) { const done = qrResolve; qrResolve = null; await closeSheet(); done(txt); }
    else $('qrScanTip').textContent = 'No QR code found in that picture. Use a sharp screenshot of the whole code, or scan it with the camera.';
  });
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
      const raw = s100(t.category).toLowerCase(), cat = !raw ? '' : /clean|rectif/.test(raw) ? 'Cleanup' : TASK_CATS.find((c) => c.toLowerCase() === raw) || 'Survey'; // blank: a site, the user picks the category
      const link = s100(t.link, 300), extra = (Array.isArray(t.extra) ? t.extra : []).filter((x) => Array.isArray(x) && x[1]).slice(0, 8).map((x) => [s100(x[0], 40), s100(x[1])]);
      return { id: s100(t.id, 40), project: s100(t.project), category: cat, site: s100(t.site), contractor: s100(t.contractor), globeRep: s100(t.globeRep),
        company: s100(t.company, 200), status: s100(t.status, 40) || 'Active', notes: s100(t.notes, 300), link: /^https:\/\//.test(link) ? link : '', extra,
        dates: t.dates && typeof t.dates === 'object' ? { surveyStart: s100(t.dates.surveyStart, 20), surveyDone: s100(t.dates.surveyDone, 20), pat: s100(t.dates.pat, 20), fat: s100(t.dates.fat, 20) } : null };
    }).filter((t) => t.id && t.project).slice(0, 500);
    const packs = (Array.isArray(j.packs) ? j.packs : []).filter((p) => p && typeof p === 'object').map((p) => ({ name: s100(p.name), link: s100(p.link, 300), sizeMB: +p.sizeMB || 0, notes: s100(p.notes, 200) }))
      .filter((p) => p.link).slice(0, 50);
    const admins = (Array.isArray(j.admins) ? j.admins : []).map((c) => s100(c)).filter(Boolean).slice(0, 20);
    return { name: s100(j.name), companies, admins, tasks, packs, scope: j.scope === 'company' ? 'company' : j.scope === 'all' ? 'all' : '', strict: !!j.strict, you: s100(j.you) };
  }
  let cloudBusy = null, cloudErr = '';
  /** When the phone talks to the online sheet (v2.15): on every change (default), every hour, or only when Sync is tapped. */
  const syncMode = () => (['change', 'hour', 'manual'].includes(S.syncMode) ? S.syncMode : 'change');
  async function cloudRequest(src, init, q) {
    const u = new URL(src.url);
    if (q && q.probe) { u.searchParams.set('probe', '1'); u.searchParams.set('v', APP_VER); } // only asks whether the sheet uses company keys
    else if (q && q.join) { u.searchParams.set('key', src.key || ''); u.searchParams.set('v', APP_VER); u.searchParams.set('company', ''); } // a short join code: the list only
    else if (q) { u.searchParams.set('key', src.key || ''); u.searchParams.set('v', APP_VER); u.searchParams.set('company', ''); u.searchParams.set('ckey', q.ckey); }
    else if (!init) {
      u.searchParams.set('key', src.key || ''); u.searchParams.set('v', APP_VER);
      // the sheet sends only this company's tasks (v2.6 script); a company key makes that split strict
      u.searchParams.set('company', (S.user && S.user.company) || ''); // blank: the sheet sends the company list but no tasks
      if (S.companyKey) u.searchParams.set('ckey', S.companyKey);
      if (isAdmin() && S.onlineAdminKey) u.searchParams.set('akey', S.onlineAdminKey);
    }
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
    const fresh = S.cloud && S.cloud.src === src.url;
    if (!force && syncMode() === 'manual') return Promise.resolve(!!fresh); // only the Sync button reads the sheet
    if (!force && fresh && Date.now() - Date.parse(S.cloud.at) < (syncMode() === 'hour' ? 60 : 10) * 60000) return Promise.resolve(true);
    if (cloudBusy) return cloudBusy;
    cloudBusy = (async () => {
      try {
        const j = await cloudRequest(src);
        if (!j || !j.ok) throw new Error(j && j.error === 'key' ? 'the sheet refused the read key' : j && j.error === 'company key' ? (keyMode() ? 'your company key no longer works: ask your admin for the new one (Settings → Reset user, then enter it)' : 'enter your company key (Settings → Your details; ask your admin)') : `unexpected answer${j && j.error ? ` (${j.error})` : ''}`);
        S.cloud = { src: src.url, at: new Date().toISOString(), ...cleanCloud(j) }; cloudErr = ''; persist();
        await noteSheetList(src.url, j.list);
        const moved = typeof j.list === 'string' && j.list.length <= 120000 ? await applySheetList(j.list) : false;
        afterTeamChange(); if (!$('newProj').hidden) renderSites();
        if (moved === 'moved') setTimeout(() => cloudSync(true), 0); // the new list version points to another sheet
        if ((S.syncQ || []).length && (force || syncMode() === 'change')) flushProgress(true);
        return true;
      } catch (e) { cloudErr = e.message || String(e); renderCloudInfo(); return false; } finally { cloudBusy = null; }
    })();
    return cloudBusy;
  }
  function renderCloudInfo() {
    const src = S.team && S.team.src, el = $('cloudInfo');
    el.hidden = !src; $('cloudSyncBtn').hidden = !src; $('companyKeyBox').hidden = true;
    if (!src) return;
    const c = S.cloud && S.cloud.src === src.url ? S.cloud : null;
    el.textContent = `Online sheet${c && c.name ? ` “${c.name}”` : ''}: ${c ? `last read ${fmtTime(c.at)} · ${isAdmin() ? `${c.companies.length} companies · ` : ''}${c.tasks.length} task${c.tasks.length === 1 ? '' : 's'}${c.scope === 'company' ? ` for ${S.user && S.user.company}` : c.scope === 'all' ? ' (all companies)' : ''} · ${c.packs.length} map packs` : 'not read yet'}${cloudErr ? ` · last try failed: ${cloudErr}` : ''}`;
    $('companyKeyBox').hidden = keyMode() || !/company key/.test(cloudErr); $('companyKey').value = ''; // only where the sheet asks for it
  }
  $('companyKeySave').addEventListener('click', async () => {
    try { const co = await keyLogin($('companyKey').value); S.user = { ...(S.user || {}), company: co }; persist(); renderWho(); }
    catch (e) { toast(e.message || String(e), 6000); return; }
    $('cloudInfo').textContent = 'Reading the online sheet…';
    const ok = await cloudSync(true); renderCloudInfo();
    toast(ok ? 'Company key saved · online sheet read' : `Saved, but the sheet was not read: ${cloudErr || 'no internet'}`, 5000);
  });
  $('cloudSyncBtn').addEventListener('click', async () => {
    $('cloudInfo').textContent = 'Reading the online sheet…';
    const ok = await cloudSync(true); renderCloudInfo();
    toast(ok ? 'Online sheet read' : navigator.onLine ? `Could not read the online sheet: ${cloudErr}` : 'No internet', 5000);
  });
  window.addEventListener('online', () => { cloudSync(false); flushProgress(false); });
  $('setSync').addEventListener('change', () => { S.syncMode = $('setSync').value; persist(); toast(syncMode() === 'change' ? 'Syncs on every change' : syncMode() === 'hour' ? 'Syncs every hour while G-eSAA is open' : 'Syncs only when you tap Sync', 3000); });
  setInterval(() => { // hourly sync (v2.15), while the app is open
    if (syncMode() !== 'hour' || !(S.team && S.team.src) || !navigator.onLine || document.hidden) return;
    if (S.cloud && Date.now() - Date.parse(S.cloud.at) < 60 * 60000) return;
    cloudSync(true).then(() => renderSyncBtn());
  }, 60000);

  /* ---- New project form: site from the online sheet (or a typed name), category / purpose limited to the vendor's part
     of the site, vendor and location from the site, and for PAT / cleanup / FAT the form details printed on the list ---- */
  const taskProject = (id) => allProjects().find((n) => pmeta(n).taskId === id);
  function visibleTasks() {
    const me = S.user && S.user.company, c = S.cloud || {};
    const open = (c.tasks || []).filter((t) => !/^(closed|done|cancel)/i.test(t.status));
    if (c.scope === 'company') return open; // the sheet already sent only this company's rows
    const seeAll = isAdmin() || !me || (pol().owner && isInspector());
    return open.filter((t) => !t.company || seeAll || coList(t.company).includes(normCo(me)));
  }
  const siteName = (t) => [t.site, t.project].filter(Boolean).join(' ').slice(0, 100); // PLA ID + site name
  const rowCat = (t) => (t.category === 'Survey' ? 'survey' : t.category || '');
  const vendorsOf = (t) => String((t && (t.contractor || t.company)) || '').split(/\s*(?:[,;\/&+\n]|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
  const isAdminCo = () => !!(pol().owner && S.user && normCo(S.user.company) === normCo(pol().owner));
  /** The user's part of a site: a site with several vendors ("NOKIA , HUAXIN") gives the survey (As-Plan) to the first and
      the construction (As-Built, PAT, defect cleanup, FAT) to the others. One vendor, or the admin company, does all. */
  function siteRole(t) {
    const vs = vendorsOf(t).map(normCo), i = vs.indexOf(normCo(S.user && S.user.company));
    if (!t || vs.length < 2 || isAdminCo() || i < 0) return 'all';
    return i === 0 ? 'plan' : 'build';
  }
  const CAT_PURPOSES = { survey: ['As-plan', 'As-built', 'Audit'], PAT: ['PAT'], Cleanup: ['Cleanup'], FAT: ['FAT'] }; // purposes of each task category
  const ROLE_PURPOSES = { all: ['As-plan', 'As-built', 'Audit', 'PAT', 'Cleanup', 'FAT'], plan: ['As-plan'], build: ['As-built', 'Audit', 'PAT', 'Cleanup', 'FAT'] };
  /** Vendor printed on the form: the user's company, or (admin) the vendor of that part of the site. */
  function vendorFor(t, purpose) {
    const me = (S.user && S.user.company) || '', vs = vendorsOf(t);
    if (!t || !vs.length || (!isAdminCo() && vs.map(normCo).includes(normCo(me)))) return me;
    if (vs.length < 2) return vs[0];
    return purpose === 'As-plan' ? vs[0] : vs.slice(1).join(', ');
  }
  const extraOf = (t, key) => { const e = (t && t.extra || []).find(([k]) => normCo(k) === normCo(key)); return e ? e[1] : ''; };
  const CAT_CODE = { survey: 'SURVEY', PAT: 'PAT', Cleanup: 'CLEANUP', FAT: 'FAT' };
  /** Task category _ project name _ PLA ID _ site name, e.g. PAT_KV_MIN2463_TCFGACGRANDAVAODDS. */
  const joinParts = (parts) => parts.map((x) => String(x || '').trim()).filter(Boolean).join('_');
  /** Site in the picker: Territory_Project Name_Serial Number_PLA ID_Site name (v2.11). */
  const siteLabel = (t) => joinParts([extraOf(t, 'Territory'), extraOf(t, 'Project Name'), extraOf(t, 'Serial Number'), t.site, t.project]).slice(0, 140) || t.id;
  /** Location / site on the forms: Serial Number_PLA ID_Site name. */
  const siteLoc = (t) => joinParts([extraOf(t, 'Serial Number'), t.site, t.project]).slice(0, 120);
  /** Project name: Task category_Project Name_Serial Number_PLA ID_Site name, e.g. PAT_KV_TRS-PSOW26-KV-0011_MIN2463_TCFGACGRANDAVAODDS. */
  const autoName = (t, cat) => joinParts([CAT_CODE[cat] || '', extraOf(t, 'Project Name'), extraOf(t, 'Serial Number'), t.site, t.project]).slice(0, 100);
  const siteDetail = (t) => [vendorsOf(t).length && `Vendor: ${vendorsOf(t).join(', ')}`, ...(t.extra || []).slice(0, 2).map(([k, v]) => `${k}: ${v}`), t.id && `ID: ${t.id}`].filter(Boolean).join(' · ');
  /** What a project made from a sheet row keeps (shown in Projects, printed on the forms). */
  const siteMeta = (t) => (t ? { taskId: t.id, siteLink: t.link || '', siteExtra: t.extra || [], ...(t.globeRep ? { globeRep: t.globeRep } : {}) } : {});
  let npFile = null, npFileKind = '', npSite = null, npAuto = '', npTried = false;
  const npStageCat = () => ['Cleanup', 'FAT'].includes($('npCat').value);
  const npRow = () => npSite;
  /** Category and purpose follow each other within the user's part of the site; the rest of the form follows them. */
  /** The category is chosen by the user (nothing preselected); the purposes offered are those of the category, within the
      user's part of the site. */
  function npSync() {
    const cat = $('npCat'), pur = $('npPurpose'), allowed = ROLE_PURPOSES[siteRole(npSite)];
    [...cat.options].forEach((o) => { if (o.value) o.disabled = !CAT_PURPOSES[o.value].some((p) => allowed.includes(p)); });
    if (cat.value && cat.selectedOptions[0] && cat.selectedOptions[0].disabled) cat.value = '';
    const list = cat.value ? CAT_PURPOSES[cat.value].filter((p) => allowed.includes(p)) : [], keep = pur.value;
    pur.innerHTML = !list.length ? '<option value="">Choose the task category first</option>' : list.length > 1 ? '<option value="" disabled>Choose…</option>' : '';
    list.forEach((p) => pur.add(new Option(PURPOSE_LABEL[p], p)));
    pur.value = list.includes(keep) ? keep : list.length === 1 ? list[0] : ''; pur.disabled = !list.length;
    npMark();
    const role = siteRole(npSite);
    $('npScope').hidden = role === 'all';
    $('npScope').textContent = role === 'plan' ? 'Your part of this site: the survey for the As-Plan.' : role === 'build' ? 'Your part of this site: As-Built, PAT, defect cleanup and FAT.' : '';
    const k = cat.value, kind = npStageCat() ? 'stage' : 'ref', acc = !!k && k !== 'survey';
    $('npStartBox').hidden = k !== 'survey';
    if (npFile && npFileKind !== kind) { npFile = null; $('npKmzInput').value = ''; }
    $('npKmzLbl').textContent = k === 'Cleanup' ? 'PAT KMZ' : k === 'FAT' ? 'PAT / CLEANUP KMZ' : 'KMZ REFERENCE';
    $('npKmzBtn').textContent = npFile ? `📎 ${npFile.name}` : kind === 'stage' ? 'Choose KMZ…' : 'Choose KMZ… (optional)';
    $('npKmzBtn').classList.toggle('primary', k === 'Cleanup' && !npFile);
    $('npKmzClear').hidden = !npFile;
    if (npSite) { const a = autoName(npSite, k); if (!$('npName').value.trim() || $('npName').value === npAuto) $('npName').value = a; npAuto = a; }
    $('npName').placeholder = kind === 'stage' && npFile ? 'Optional: taken from the KMZ' : 'Type a name';
    $('npVendor').value = vendorFor(npSite, pur.value);
    $('npAcc').hidden = !acc;
  }
  function renderSites() {
    const src = S.team && S.team.src, rows = src ? visibleTasks() : [];
    $('npSiteBox').hidden = !src;
    if (npSite && !rows.some((t) => t.id === npSite.id)) npSite = null;
    $('npSiteLbl').textContent = npSite ? siteLabel(npSite) : rows.length ? 'Choose a site…' : 'No site listed for you: type a name below';
    $('npSitesBtn').disabled = !!src && !rows.length && !!(S.cloud && S.cloud.src === src.url);
    if (!$('npSites').hidden) showSites(true);
    npSync(); renderSiteRow();
  }
  function showSites(on) {
    const box = $('npSites'), src = S.team && S.team.src;
    if (!on || !src) { box.hidden = true; return; }
    const rows = visibleTasks(), read = !!(S.cloud && S.cloud.src === src.url), q = $('npSiteQ').value.trim().toLowerCase();
    const list = (q ? rows.filter((t) => [siteLabel(t), t.id, t.contractor].some((x) => x && String(x).toLowerCase().includes(q))) : rows).slice(0, 60);
    const L = $('npSiteList'); L.innerHTML = '';
    for (const t of list) {
      const b = document.createElement('button'); b.type = 'button';
      const n = document.createElement('b'); n.textContent = siteLabel(t); b.append(n);
      const role = siteRole(t);
      const sub = [rowCat(t) && STAGE_LABEL[rowCat(t)], t.status && t.status !== 'Active' ? t.status : '', vendorsOf(t).join(', '), role === 'plan' ? 'your part: As-Plan survey' : role === 'build' ? 'your part: construction' : '', taskProject(t.id) && 'on this phone'].filter(Boolean).join(' · ');
      if (sub) { const s = document.createElement('span'); s.textContent = sub; b.append(s); }
      b.addEventListener('click', () => pickSite(t));
      L.appendChild(b);
    }
    const foot = document.createElement('div'); foot.className = 'foot';
    const info = document.createElement('span');
    info.textContent = !read ? (cloudErr ? `Sheet not read (${cloudErr})` : navigator.onLine ? 'Reading the online sheet…' : 'Offline: type a name below') : !rows.length ? 'No site listed for you: type a name below' : q && !list.length ? 'No match' : `${list.length < rows.length ? `${list.length} of ` : ''}${rows.length} from the online sheet`;
    const r = document.createElement('button'); r.type = 'button'; r.className = 'btn sm'; r.textContent = '↻'; r.setAttribute('aria-label', 'Read the online sheet again');
    r.addEventListener('click', async () => { info.textContent = 'Reading the online sheet…'; await cloudSync(true); renderSites(); showSites(true); });
    foot.append(info, r); L.appendChild(foot);
    box.hidden = false;
  }
  function pickSite(t) {
    npSite = t; npAuto = '';
    const k = rowCat(t); if (k && CAT_PURPOSES[k].some((x) => ROLE_PURPOSES[siteRole(t)].includes(x))) $('npCat').value = k;
    $('npName').value = ''; $('npLoc').value = siteLoc(t);
    if (t.notes && !$('npNotes').value.trim()) $('npNotes').value = t.notes;
    if (t.globeRep && !$('npGlobe').value.trim()) $('npGlobe').value = t.globeRep;
    $('npSites').hidden = true; $('npSiteLbl').textContent = siteLabel(t);
    npSync(); renderSiteRow();
  }
  function renderSiteRow() {
    const t = npSite, have = t && taskProject(t.id);
    $('npSiteRow').hidden = !t; $('npSiteInfo').textContent = t ? siteDetail(t) : '';
    $('npSiteFolder').hidden = !(t && t.link); $('npSiteOpen').hidden = !have;
  }
  function renderNpTypes(chosen) {
    const box = $('npTypes'); box.innerHTML = '';
    allInspTypes().forEach((t) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = t; b.setAttribute('aria-pressed', String(chosen.includes(t)));
      b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
      box.appendChild(b);
    });
  }
  const npTypesChosen = () => [...$('npTypes').querySelectorAll('.chip')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
  function npReset() {
    ['npName', 'npNotes', 'npLoc', 'npGlobe', 'npSiteQ'].forEach((id) => { $(id).value = ''; });
    $('npKmzInput').value = ''; npFile = null; npSite = null; npAuto = ''; npTried = false;
    $('npCat').value = ''; // the user chooses the task category
    $('npRep').value = (S.user && S.user.name) || ''; $('npDate').value = todayIso(); $('npStart').value = todayIso(); renderNpTypes(allInspTypes());
    $('npSites').hidden = true; npSync(); renderSites();
  }
  function openNewProject() { npReset(); openSheet('newProj'); cloudSync(false).then(() => { if (!$('newProj').hidden) renderSites(); }); }
  $('newProjBtn').addEventListener('click', openNewProject);
  /** No project yet: the Projects screen opens on the New project form (photos are taken inside a project). */
  function askNewProject() {
    if (!$('newProj').hidden) return;
    if ($('projects').hidden) openProjects();
    openNewProject();
  }
  $('npCat').addEventListener('change', () => npSync());
  $('npPurpose').addEventListener('change', () => npSync());
  $('npSitesBtn').addEventListener('click', () => { const open = $('npSites').hidden; showSites(open); if (open && visibleTasks().length > 8) setTimeout(() => $('npSiteQ').focus(), 50); });
  $('npSiteQ').addEventListener('input', () => showSites(true));
  $('newProj').addEventListener('click', (e) => { if (!e.target.closest('#npSites, #npSitesBtn')) $('npSites').hidden = true; });
  $('npSiteClear').addEventListener('click', () => { npSite = null; if ($('npName').value === npAuto) $('npName').value = ''; npAuto = ''; $('npLoc').value = ''; renderSites(); });
  $('npSiteFolder').addEventListener('click', () => { if (npSite && npSite.link) openExternal(npSite.link); });
  $('npSiteOpen').addEventListener('click', () => guard(async () => { const have = npSite && taskProject(npSite.id); if (!have) return; S.project = have; persist(); renderPoles(); await closeAll(); fitProject(); toast(`Now working on: ${have}`); }));
  $('npKmzBtn').addEventListener('click', () => { $('npKmzInput').value = ''; $('npKmzInput').click(); });
  $('npKmzInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; npFile = f; npFileKind = npStageCat() ? 'stage' : 'ref'; npSync(); });
  $('npKmzClear').addEventListener('click', () => { npFile = null; $('npKmzInput').value = ''; npSync(); });
  /** Required fields (v2.15): marked with *, outlined in red when empty after Create was tapped. */
  function npMissing() {
    const k = $('npCat').value, fromFile = npStageCat() && !!npFile, miss = [];
    if (!k) miss.push(['npCatBox', 'npCat', 'task category']);
    if (k && !$('npPurpose').value) miss.push(['npPurposeBox', 'npPurpose', 'purpose']);
    if (!$('npName').value.trim() && !fromFile) miss.push(['npNameBox', 'npName', 'project name']);
    if (k === 'survey' && !$('npStart').value) miss.push(['npStartBox', 'npStart', 'survey start date']);
    return miss;
  }
  function npMark() {
    const miss = npTried ? npMissing() : [], ids = miss.map((m) => m[0]);
    ['npCatBox', 'npPurposeBox', 'npNameBox', 'npStartBox'].forEach((id) => $(id).classList.toggle('invalid', ids.includes(id)));
    $('npErr').hidden = !miss.length; $('npErr').textContent = miss.length ? `Required: ${miss.map((m) => m[2]).join(', ')}.` : '';
    return miss;
  }
  ['npCat', 'npPurpose', 'npName', 'npStart'].forEach((id) => $(id).addEventListener(id === 'npName' ? 'input' : 'change', () => { if (npTried) npMark(); }));
  $('npCreate').addEventListener('click', () => guard(async () => {
    const k = $('npCat').value, purpose = $('npPurpose').value, name = $('npName').value.trim().slice(0, 100), notes = $('npNotes').value.trim(), f = npFile;
    const fromFile = npStageCat() && !!f, acc = k !== 'survey';
    npTried = true; const miss = npMark();
    if (miss.length) { $(miss[0][1]).focus(); return; }
    if (!purpose || !ROLE_PURPOSES[siteRole(npSite)].includes(purpose)) { toast('That is not your part of this site'); return; }
    if (k === 'Cleanup' && !f) { toast('Choose the PAT KMZ'); return; }
    if (name && !fromFile && allProjects().includes(name)) { toast('A project with that name already exists'); return; }
    const t = npSite, details = { site: $('npLoc').value.trim().slice(0, 120), contractor: $('npVendor').value.trim(),
      ...(acc ? { vendorRep: (S.user && S.user.name) || '', globeRep: $('npGlobe').value.trim().slice(0, 100), inspTypes: npTypesChosen(), date: $('npDate').value || todayIso() } : { startDate: $('npStart').value || todayIso() }), ...(notes ? { notes } : {}) };
    const sm = { ...siteMeta(t), ...details };
    S.meta = S.meta || {};
    LOG.info('project.new', { cat: k, sheet: !!t, role: siteRole(t), kmz: f ? (fromFile ? 'stage' : 'ref') : '' });
    if (fromFile) {
      await importStageFile(f, k, sm, name || undefined);
      npFile = null; npSite = null; await closeAll(); fitProject(); return;
    }
    S.projects.push(name);
    S.meta[name] = k === 'survey' ? { mode: 'survey', purpose, ...sm } : { mode: 'acceptance', stage: k, ...sm };
    S.project = name; persist(); renderPoles(); queueProgress(name, ['surveyStart']); // the survey start date goes to the online sheet
    npFile = null; npSite = null; await closeAll();
    const label = `${PURPOSE_LABEL[k === 'survey' ? purpose : k]} “${name}” created`;
    if (f) { try { await loadRefFile(f); } catch (e) { busy(false); LOG.warn('ref.fail', errInfo(e)); toast(`${label}. The KMZ could not be read: ${e.message || e}`, 7000); } }
    else { fitProject(); toast(label, 3000); }
  }, 'Project not created'));

  /* ---- a PAT from another phone, for its FAT ---- */
  /** The handover file: the acceptance KMZ with the PoleCam data inside (PAT → defect cleanup → FAT). */
  async function sharePackage() {
    if (!needPoints()) return;
    if (!(await shareGate('share'))) return;
    const M = accModel(), blob = await buildAccKmz(M, true); busy(false);
    noteExport('sent');
    await shareFile(blob, `${accFileBase(M)}_share.kmz`, 'application/vnd.google-earth.kmz');
  }
  $('sendPat').addEventListener('click', () => guard(sharePackage));
  $('xShare').addEventListener('click', () => guard(sharePackage));
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
    if (!create && !adminUserOk()) { toast(`Your email (${(S.user && S.user.email) || 'none'}) is not on the admin users list of this company list`, 5000); return; }
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
    const polDraft = { owner: P.owner || '', form: { ...P.form }, defects: JSON.parse(JSON.stringify(P.defects)), maxSpan: P.maxSpan, angleDeg: P.angleDeg, autoGap: P.autoGap, quality: P.quality, inspTypes: P.inspTypes.slice(), poleTypes: (P.poleTypes || []).slice(), adminUsers: (P.adminUsers || []).slice(), ...(P.web ? { web: P.web } : {}), ...(P.vendorRecords === false ? { vendorRecords: false } : {}) };
    $('admPoleTypes').value = typeLines(polDraft.poleTypes);
    $('admPacks').value = packLines(P.packs || []); $('admPacksInfo').textContent = '';
    $('admUsers').value = (P.adminUsers || []).join('\n'); $('admVendorRec').checked = P.vendorRecords !== false;
    renderOrgBox(create);
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
    P.adminUsers = [...new Set($('admUsers').value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x)).map((x) => x.slice(0, 120)))].slice(0, 100);
    const me = String((S.user && S.user.email) || (!$('profile').hidden && $('pfEmail').value) || '').trim().toLowerCase(); // a new list is made before the profile is saved
    if (P.adminUsers.length && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(me) && !P.adminUsers.includes(me)) P.adminUsers.unshift(me); // the admin who saves stays an admin
    if (!P.adminUsers.length) delete P.adminUsers;
    const web = webBase(); if (web && !NATIVE) P.web = web; // join links from the APK use the website address
    const num = (id, lo, hi, dflt) => { const v = +$(id).value; return v >= lo && v <= hi ? v : dflt; };
    P.maxSpan = num('setMaxSpan', 5, 1000, 200); P.angleDeg = num('setAngle', 1, 90, 15); P.autoGap = num('setAutoGap', 10, 5000, 120);
    P.quality = $('admQuality').value === 'normal' ? 'normal' : 'strict';
    if ($('admVendorRec').checked) delete P.vendorRecords; else P.vendorRecords = false;
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
    if (!admDraft.co.length) box.innerHTML = '<p class="hint" style="margin:0">No companies yet. Add each company or vendor that will use G-eSAA.</p>';
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
    $('admRev').textContent = admDraft.rev ? `Saving makes version ${admDraft.rev + 1}${admDraft.newPin ? ' with the new admin PIN' : ''}. Phones that have version ${admDraft.rev} take it ${admDraft.src && S.onlineAdminKey ? 'from the online sheet by themselves' : 'with the join link or QR code'}.` : 'Saving makes version 1 of a new list.';
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
    const viaSheet = !!(S.team.src && S.onlineAdminKey);
    if (S.team.src && S.onlineAdminKey && navigator.onLine) { // v2.15: the list reaches the sheet first, so the QR code can be the short one
      busy('Sending the list to the online sheet…');
      try { await pushPacksToSheet(S.team.src.url, P.packs || []); await pushListToSheet(S.team.src.url); } finally { busy(false); }
      cloudSync(true);
    } else if (S.team.src) { pushPacksToSheet(S.team.src.url, P.packs || []).then(() => pushListToSheet(S.team.src.url)).finally(() => cloudSync(true)); }
    showTeamQr(`Version ${S.team.rev} saved. ${viaSheet ? 'Phones that already joined get it from the online sheet by themselves. New users: send the join link or show this QR code.' : 'Send the join link or show this QR code to each user.'}${S.team.src && !S.onlineAdminKey ? ' Enter the sheet’s Admin key (Online Google Sheet) so phones update by themselves.' : ''}${admDraft.newPin ? ' Admins must enter the new PIN after taking it.' : ''}`);

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
  function renderOrgBox(create) {
    const t = S.team, tied = !!(ORG && t && ORG.id === t.id), stale = tied && ORG.key && ORG.key !== t.key && ORG.key !== t.prevKey;
    $('admOrgBox').hidden = !!create || !t || !t.key;
    $('admOrgInfo').textContent = stale ? 'The admin PIN changed since org.json was made: download it again and replace it on the website, or new users cannot join.'
      : tied ? `This app is tied to “${t.name}”.` : ORG ? `This app is tied to another list (“${ORG.name}”).` : 'Not tied yet: anyone who opens the app can still create a separate list of their own (it never changes yours).';
  }
  $('admOrg').addEventListener('click', () => guard(async () => {
    if (!S.team || !S.team.key) { toast('Save the list first'); return; }
    const web = webBase();
    const o = { app: 'PoleCam', type: 'polecam-org', id: S.team.id, name: S.team.name, key: S.team.key, ...(web ? { web } : {}), ...(S.team.src ? { src: { url: S.team.src.url } } : {}) };
    await shareFile(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' }), 'org.json', 'application/json');
  }, 'org.json not made'));
  /** The signed list goes to the sheet too (v2.9 script): phones that read the sheet take each new version by themselves. */
  async function pushListToSheet(url) {
    if (!url || !S.onlineAdminKey || !S.team) return;
    try {
      const list = await packShare('PCT', { b: S.team.b, s: S.team.s, k: S.team.k });
      const j = await cloudRequest({ url }, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: S.onlineAdminKey, action: 'setList', list, id: S.team.id, rev: S.team.rev }) });
      if (!j || !j.ok) throw new Error(j && j.error === 'action' ? 'update the Apps Script in the sheet (v2.9) so phones get the list from it' : (j && j.error) || 'no answer');
      LOG.info('sheet.list', { rev: S.team.rev }); S.sheetListAt = { url, id: S.team.id, rev: S.team.rev }; persist();
    } catch (e) { LOG.warn('sheet.list.fail', errInfo(e)); toast(`The list was not sent to the online sheet: ${e.message || e}. Phones still get it from the join link or QR code.`, 7000); }
  }
  /** Which version of this phone's list the online sheet holds (for the short join QR code). */
  async function noteSheetList(url, text) {
    if (typeof text !== 'string' || !S.team) return;
    try { const p = await unpackShare(text), b = p && p.kind === 'PCT' ? JSON.parse(p.obj.b) : null; if (b && b.id === S.team.id) { S.sheetListAt = { url, id: b.id, rev: b.rev }; persist(); } } catch (e) { /* not a list */ }
  }
  /** A short join code (#jq=…): the list is downloaded from the online sheet it names and taken only when it is the list the
      code names, signed with the key the code names. */
  async function joinShort(code, sw) {
    let o = null;
    try { o = JSON.parse(new TextDecoder().decode(b64u.dec(code))); } catch (e) { o = null; }
    const url = o && (o.s ? `https://script.google.com/macros/s/${o.s}/exec` : String(o.u || ''));
    if (!o || !o.i || !o.f || !/^https:\/\/[^\s]+$/.test(url || '')) { toast('That QR code is not a G-eSAA join code, or it is damaged. Ask your admin for the join link.', 5500); return false; }
    if (!cryptoOk()) return false;
    if (!navigator.onLine) { toast('This short QR code needs internet once to download the company list. Connect and scan again, or ask your admin for the full code or the join link.', 7000); return false; }
    busy('Getting the company list…');
    let j = null;
    try { j = await cloudRequest({ url, key: o.r || '' }, null, { join: true }); } catch (e) { j = { ok: false, error: e.message || String(e) }; } finally { busy(false); }
    if (!j || !j.ok || typeof j.list !== 'string') {
      toast(j && j.error === 'company key' ? 'This organisation joins with company keys: ask your admin or a coworker for an invite.' : `The company list could not be downloaded${j && j.error ? ` (${j.error})` : ''}. Ask your admin for the join link.`, 7000);
      return false;
    }
    let p = null, body = null;
    try { p = await unpackShare(j.list); body = p && p.kind === 'PCT' ? JSON.parse(p.obj.b) : null; } catch (e) { body = null; }
    const prints = body ? await Promise.all([body.key, body.prevKey].filter(Boolean).map(keyPrint)) : [];
    if (!body || body.id !== o.i || !prints.includes(o.f)) { toast('Not accepted: the list in the online sheet is not the one this QR code names. Ask your admin for the join link.', 7000); return false; }
    teamSwitch = !!sw || !S.team;
    try { return await importTeamText(j.list); } finally { teamSwitch = false; }
  }
  /** A newer version of this phone's list, read from the sheet, is taken when it is signed with the admin PIN. */
  async function applySheetList(text) {
    if (!text || !S.team) return false;
    let p = null, body = null;
    try { p = await unpackShare(text); body = p && p.kind === 'PCT' ? JSON.parse(p.obj.b) : null; } catch (e) { return false; }
    if (!body || body.id !== S.team.id || !(body.rev > S.team.rev)) return false;
    const url = S.team.src && S.team.src.url;
    try {
      const r = await acceptTeam(p.obj, false);
      if (!r.ok) return false;
      LOG.info('list.fromSheet', { rev: body.rev }); toast(`Company list updated from the online sheet: version ${body.rev}`, 4000);
      return !S.team.src || S.team.src.url !== url ? 'moved' : true;
    } catch (e) { LOG.warn('list.fromSheet.fail', { rev: body.rev, msg: String(e.message || e).slice(0, 160) }); return false; }
  }
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
        throw new Error(hdr ? 'This map file has picture tiles; G-eSAA needs a vector map pack (.pmtiles from Protomaps)' : 'This file is not a map pack (.pmtiles, PMTiles version 3)');
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
    if (hdr.tileType !== 1) { toast('That map file has picture tiles; G-eSAA needs a vector map pack (.pmtiles from Protomaps)', 6000); return; }
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
    const info = { app: `G-eSAA ${APP_VER}`, apk: NATIVE, ua: navigator.userAgent, memoryGB: navigator.deviceMemory, cores: navigator.hardwareConcurrency,
      screen: `${screen.width}×${screen.height} @${devicePixelRatio}`, opfs: OPFS_OK, base: S.base, streetServer: streetSource().name, records: points.length, projects: allProjects().length,
      photoCheck: effectiveQuality(), heapMB: memMB(), list: S.team ? `v${S.team.rev}` : 'none' };
    try { const e = await withTimeout(navigator.storage.estimate(), 3000, 'slow'); info.storageUsedMB = Math.round((e.usage || 0) / 1048576); info.storageQuotaMB = Math.round((e.quota || 0) / 1048576); } catch (e) { /* ignore */ }
    for (const st of ['points', 'photos', 'tiles', 'packs']) { try { info[`count_${st}`] = await withTimeout(dbCount(st), 5000, 'slow'); } catch (e) { info[`count_${st}`] = `error: ${e.message}`; } }
    const lines = LOG.all().map(logLine);
    return `G-eSAA app log — ${logTime(Date.now())}\n${Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${lines.join('\n')}\n`;
  }
  function renderLog() {
    const all = LOG.all(), errs = all.filter((x) => x.l === 'e').length, warns = all.filter((x) => x.l === 'w').length;
    $('logSummary').textContent = all.length ? `${all.length} entries since ${logTime(all[0].t).slice(0, 16)} · ${errs} error${errs === 1 ? '' : 's'} · ${warns} warning${warns === 1 ? '' : 's'}` : 'The log is empty.';
    $('logView').textContent = all.slice(-250).reverse().map(logLine).join('\n');
    $('logSub').textContent = errs ? `${errs} error${errs === 1 ? '' : 's'} logged — open to send` : 'Errors and timings, to send for support';
  }
  $('goLog').addEventListener('click', () => { LOG.flush(); renderLog(); openSheet('logSheet'); });
  $('logShare').addEventListener('click', () => guard(async () => {
    const text = await logReport(), name = `G-eSAA_log_${stamp8()}.txt`;
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
    if (!S.project) { toast('Create a project first: photos are taken inside a project', 4500); askNewProject(); return; }
    if (visitStage() === 'Cleanup') { // the cleanup works on the PAT pins only: photos are taken from a pin's card
      const t = nextTarget();
      toast(t ? 'Open the pin, then tap “📷 Photo of the fix” on the item' : 'All items are fixed. Share the cleanup KMZ from Projects.', 4500);
      if (t) openVisit(t.r.id, true); return;
    }
    openCamera('new');
  });
  $('brandVer').textContent = `v${APP_VER}`; // the version beside the name (v2.15)
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
    // v2.15: no "Default project". An empty one left by an older version is removed; one with records stays as a normal project.
    if (S.projects.includes('Default project') && !points.some((p) => p.project === 'Default project')) {
      S.projects = S.projects.filter((x) => x !== 'Default project'); if (S.meta) delete S.meta['Default project'];
      if (S.project === 'Default project') S.project = '';
    }
    if (S.project && !S.projects.includes(S.project)) S.projects.push(S.project);
    if (!S.project) S.project = allProjects()[0] || '';
    persist();
    renderPoles(); drawAreas();
    if (!S.view) fitProject();
    if (S.base === 'offline' && !activePackId()) setBase('street', true);
    goOfflineIfPossible();
    startGps();
    if (S.dropSatTiles) { // v1.7: satellite imagery kept by older versions is removed (Esri allows offline imagery only in ArcGIS apps)
      try { await tx('tiles', 'readwrite', (st) => st.delete(IDBKeyRange.bound('satellite/', 'satellite/\uffff'))); delete S.dropSatTiles; persist(); } catch (e) { /* try again next start */ }
    }
    if (pendingJoin || pendingKey || pendingJq || pendingMv) { await loadOrg(); await handleInvite(`${pendingJoin ? `#join=${pendingJoin}` : ''}${pendingKey ? `&ck=${pendingKey}` : ''}${pendingJq ? `&jq=${pendingJq}` : ''}${pendingMv ? `&mv=${pendingMv}` : ''}`, true); } else loadOrg(); // a link waits for the organisation check
    if (!profileOk()) { if ($('profile').hidden) openProfile(true); }
    else if (!S.project) askNewProject(); // photos are taken inside a project
    renderSyncBtn();
    cloudSync(false);
  })();
  window.addEventListener('hashchange', () => { const h = location.hash; if (/[#&](join|ck|jq|mv)=/.test(h)) { history.replaceState(null, '', location.pathname + location.search); handleInvite(h, true); } });
  // Files handed to other apps through Share are temporary: clear them each time the APK starts.
  if (NATIVE) nativeCall('Filesystem', 'rmdir', { path: 'share', directory: 'CACHE', recursive: true }).catch(() => {});
  // The APK already carries every file, so the offline cache is only for the website version.
  if (!NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__polecam = { get points() { return points; }, get S() { return S; }, get lastQr() { return lastQrText; }, shortJoin, openEditor, addEdPhoto, exportPhoto, showExport: (sel) => showExport(String(sel).replace(/^#/, '')), tilesFor, closeDb: async () => (await idb()).close(), nativeWrite, grabGuideCrop, prepForOcr, ocrRun,
    packShare, unpackShare, importTeamText, readIdFrom, checkQuality, makeStoredImages, poleTypes, LOG, selfTest, logReport }; // for testing
})();
