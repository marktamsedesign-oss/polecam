/* G-eSAA (Geo electronic Survey, Audit & Acceptance; formerly PoleCam Survey) — field app for OSP survey, audit and acceptance.
   Depends on Leaflet (L) and core.js (PoleCore). Internal names (storage, links, data files) keep 'polecam' so updates keep the data. */
(() => {
  'use strict';
  /* A join link (…/polecam/#join=…) carries the signed company list: read it before anything else, then clear the address. */
  const H0 = location.hash, pendingJoin = (/[#&]join=([^&#]+)/.exec(H0) || [])[1] || null, pendingKey = (/[#&](ck=[A-Za-z0-9-]+|ci=[A-Za-z0-9_-]+)/.exec(H0) || [])[1] || null; // v2.24: ci= (the key masked) or the old ck=
  const pendingJq = (/[#&]jq=([A-Za-z0-9_-]+)/.exec(H0) || [])[1] || null; // v2.15 short join code: the list comes from the online sheet
  const pendingMv = (/[#&]mv=([A-Za-z0-9_-]+)/.exec(H0) || [])[1] || null; // v2.15 the user moving to this phone
  const pendingCo = (/[#&]co=([^&#]+)/.exec(H0) || [])[1] || null; // v2.28 the company the invite is for (lists without company keys)
  if (pendingJoin || pendingKey || pendingJq || pendingMv || pendingCo) history.replaceState(null, '', location.pathname + location.search);
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
  /** v2.27: a proposed pole (As-Plan) is always a Globe pole (GT); a new pole in the As-Built starts as one. */
  const globeType = () => (poleTypes().find((t) => t.p === 'GT') || { n: 'Globe' }).n;
  const typePrefix = (name) => { const t = poleTypes().find((x) => x.n === name); return t ? t.p : ''; };
  const prefixType = (pre) => { const t = poleTypes().find((x) => x.p === pre); return t ? t.n : ''; };
  const prefixAlt = () => poleTypes().map((t) => t.p).sort((a, b) => b.length - a.length).join('|');
  const poleIdRe = () => new RegExp(`^(${prefixAlt()})-(\\d+)$`);
  const polePartRe = () => new RegExp(`^(${prefixAlt()})-?(\\d*)$`);
  /** v2.18: a pole number with one or two characters that could not be read, written X (CC-04X0652). */
  const poleIdXRe = () => new RegExp(`^(${prefixAlt()})-(?=(?:[0-9]*X){1,2}[0-9]*$)(?=(?:X*[0-9]){3})[0-9X]+$`);
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
  /** v2.21: the defect categories offered for an element: its own, then any category the admin added to the checklist (for every
      element), then Other. */
  function catsFor(el) {
    const base = CATS_FOR[el] || ['Other'], known = new Set(Object.values(CATS_FOR).flat().concat(Object.keys(DEF_CHECK)));
    const extra = Object.keys(pol().defects || {}).filter((k) => !known.has(k));
    return base.filter((c) => c !== 'Other').concat(extra, base.includes('Other') ? ['Other'] : []);
  }
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
  /** v2.28: the jobs of an admin user (Admin users tab of the sheet, or the email line in Administration): which completed
      tasks they approve on site. acc = PAT, defect cleanup and FAT; the survey purposes by name. */
  function jobKeys(text) {
    const t = String(text || '').toUpperCase(), k = new Set();
    if (/ALL|ADMIN/.test(t)) ['acc', 'As-plan', 'Audit', 'As-built'].forEach((x) => k.add(x));
    if (/PAT|FAT|INSPECT|CLEAN|ACCEPT/.test(t)) k.add('acc');
    if (/PLAN/.test(t)) k.add('As-plan'); if (/AUDIT/.test(t)) k.add('Audit'); if (/BUILT/.test(t)) k.add('As-built');
    return [...k];
  }
  const JOB_NAME = { acc: 'PAT/FAT inspector', 'As-plan': 'As-Plan approver', Audit: 'Audit approver', 'As-built': 'As-Built approver' };
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
  /* v2.26: sizes for the BOQ / BOM, per element (r.boq). Existing poles: owner and clamp size; a proposed / new Globe pole: its
     size and class (and clamp); ODF: fibre count and connector; closure: core count. v2.26.1: only in the As-Plan and As-Built
     surveys (the BOQ of the plan and of what was built); the As-Built compares with the As-Plan (its KMZ as the reference). */
  const BOQ_OPT = { owner: ['Electric', 'PLDT', 'DITO', 'CONVERGE'], clamp: ['5-7', '8-9', '10-12'], height: ['7.5m', '9.14m', '10.6m'], cls: ['7A', '7AR', 'Light'],
    odf: ['12F', '24F', '48F', '72F', '144F', '288F'], conn: ['APC', 'UPC'], clo: ['12C', '24C', '48C', '72C', '144C', '288C'], cloSt: ['Existing', 'New'],
    // v2.29: from the legend of the drawing template: a new arm on the pole, its guying (several), a maintenance loop
    arm: ['Single arm', 'Double arm', 'Extension arm 26"', 'Extension arm 44.5"', '10-pin alley arm'], guy: ['Head guy', 'Side guy', 'Sidewalk guy', 'Sidewalk head guy', 'Pole-to-pole guy', 'Down guy'], mloop: ['Yes'] };
  const BOQ_MULTI = new Set(['guy']); // several at once: "Head guy + Side guy"
  const mloopLen = () => (Number.isFinite(+pol().mloopLen) && +pol().mloopLen > 0 ? +pol().mloopLen : 15); // v2.29: MLoop = 15 m unless the admin sets another
  const BOQ_LABEL = { owner: 'POLE OWNER', clamp: 'CLAMP SIZE', height: 'NEW GLOBE POLE · SIZE', cls: 'NEW GLOBE POLE · CLASS', odf: 'ODF SIZE', conn: 'ODF CONNECTOR', clo: 'CLOSURE SIZE', cloSt: 'CLOSURE', arm: 'NEW ARM', guy: 'NEW GUYING (one or more)', mloop: 'MAINTENANCE LOOP' };
  const BOQ_PURPOSES = ['As-plan', 'As-built'];
  /** The BOQ is part of the As-Plan and As-Built surveys only (not Audit, PAT, defect cleanup or FAT). */
  const boqOn = (name) => !isAcc(name) && BOQ_PURPOSES.includes(svPurpose(name));
  /** v2.28: the admin's lists (Administration → Sizes for the BOQ / BOM), else the built-in ones (owners: + the v2.26 extra owners). */
  const boqList = (k) => { const L = pol().boqLists; return L && Array.isArray(L[k]) && L[k].length ? L[k] : k === 'owner' ? [...BOQ_OPT.owner, ...(Array.isArray(pol().poleOwners) ? pol().poleOwners : [])] : BOQ_OPT[k]; };
  const detailItems = () => (Array.isArray(pol().detailItems) && pol().detailItems.length ? pol().detailItems : POLE_DETAIL_ITEMS);
  const boqOwners = () => [...new Set([...boqList('owner'), ...(S.myOwners || [])].map((x) => String(x || '').trim()).filter(Boolean))];
  /** The BOQ fields of a survey element: by element and status (existing, or proposed / new); a closure in the handhole adds its size. */
  function boqKeys(el, status, closureHere) {
    if (el === 'Pole') return (status === 'Proposed' || status === 'New' ? ['height', 'cls', 'clamp'] : ['owner', 'clamp']).concat(['arm', 'guy', 'mloop']); // v2.29
    if (el === 'ODF') return ['odf', 'conn'];
    if (el === 'Closure') return ['clo'];
    if (el === 'Handhole') return closureHere ? ['clo'] : [];
    return [];
  }
  /** "Owner PLDT · Clamp 8-9", "New pole 9.14m 7A · Clamp 8-9", "ODF 48F UPC", "Closure 24C New". */
  function boqText(r) {
    const b = (r && r.boq) || {}, parts = [];
    if (b.owner) parts.push(`Owner ${b.owner}`);
    if (b.height || b.cls) parts.push(`New pole ${[b.height, b.cls].filter(Boolean).join(' ')}`);
    if (b.clamp) parts.push(`Clamp ${b.clamp}`);
    if (b.odf || b.conn) parts.push(`ODF ${[b.odf, b.conn].filter(Boolean).join(' ')}`);
    if (b.clo || b.cloSt) parts.push(`Closure ${[b.clo, b.cloSt].filter(Boolean).join(' ')}`);
    if (b.arm) parts.push(`Arm ${b.arm}`); if (b.guy) parts.push(`Guying ${b.guy}`); if (b.mloop) parts.push(`MLoop ${mloopLen()} m`); // v2.29
    return parts.join(' · ');
  }
  /** Only the fields that apply to the element as saved. */
  function boqPick(b, keys) { const o = {}; keys.forEach((k) => { if (b && b[k]) o[k] = String(b[k]).slice(0, k === 'guy' ? 120 : 40); }); return o; }
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
    const size = boqText(r) ? [`Size: ${boqText(r)}`] : []; // v2.26
    if (elemOf(r) === 'Pole') return [`MLoop: ${r.mloop ? 'Yes' : 'No'}`, `NAP: ${r.nap ? `Yes${r.napId ? ` (${r.napId})` : ' (no ID)'}` : 'No'}`, `Closure: ${r.closure ? `Yes${r.closureId ? ` (${r.closureId})` : ' (no ID)'}` : 'No'}`, ...size];
    if (elemOf(r) === 'ODF') return [`${r.odf || 'New'} ODF`, ...size];
    return size;
  }
  /** Next ID in the current project only, so numbering never carries over: CC-/WP-/SP- per pole type, FDU_ for ODFs.
      With nothing to count from, only the prefix is filled in and the number is typed or scanned. */
  function suggestId(element, type) {
    // v2.19: in PAT, cleanup and FAT the ID is optional, so no number is guessed: only the prefix is offered (saved as is, the record gets D-0001…)
    if (ed && ed.acc) return !element || element === 'Pole' ? `${typePrefix(type) || typePrefix(S.lastType) || 'CC'}-` : element === 'ODF' ? 'FDU_' : '';
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
  /* v2.16: a completed PAT is a closed record. Nothing in it is added, changed or removed; its items are tagged as fixed in
     the defect cleanup and the FAT, where what came from the PAT keeps its ID, place and items. Only the company list's
     admin (or a phone without a company list) can reopen or delete a completed PAT. Surveys stay editable after completion. */
  const patClosed = (name) => taskCat(name) === 'PAT' && !!pmeta(name).completedAt;
  const canReopenPat = () => !S.team || isAdmin();
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
        if (typing() && kbField) kbField(open ? document.activeElement : null); // v2.30: Back closed the keyboard with the field still selected → the form comes back; a tap on it again → only the field
        if (!open && !window.ResizeObserver) setTimeout(() => { try { if (pinMap) pinMap.invalidateSize({ animate: false }); } catch (e) { /* not ready */ } }, 60); // v2.30: else the pin map keeps its spot by itself
      }
    };
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', update); window.visualViewport.addEventListener('scroll', update); }
    window.addEventListener('resize', update);
    document.addEventListener('focusin', () => setTimeout(update, 300)); document.addEventListener('focusout', () => setTimeout(update, 120));
    /* v2.30: typing in a record shows only that field (its name and its box) under the small map, so the pin stays in view
       and nothing covers the field; the rest of the form and the Save bar come back when the keyboard closes. */
    let kbField = null; // only while an on-screen keyboard is up: a hardware keyboard or a computer keeps the whole form
    const ed0 = document.getElementById('editor'), body0 = ed0 && ed0.querySelector('.edbody');
    const fieldOf = (el) => (el && body0 && body0.contains(el) && typing() ? el.closest('.frow, .field, .pair, .defpanel') : null);
    let kbOff = 0;
    const clearKb = () => { ed0.classList.remove('kbfield'); body0.querySelectorAll('.kbshow').forEach((x) => x.classList.remove('kbshow', 'kbbox')); };
    if (body0) {
      kbField = (el) => {
        const box = fieldOf(el); clearTimeout(kbOff); clearKb(); if (!box) return;
        for (let x = box; x && x !== body0; x = x.parentElement) x.classList.add('kbshow');
        box.classList.add('kbbox');
        ed0.classList.add('kbfield');
        setTimeout(() => { try { box.scrollIntoView({ block: 'nearest' }); } catch (err) { /* gone */ } }, 320);
      };
      body0.addEventListener('focusin', (e) => { if (document.body.classList.contains('kb')) kbField(e.target); }); // the keyboard stays up from field to field (Next): follow the field
      const done = document.getElementById('kbDone');
      if (done) { done.addEventListener('pointerdown', (e) => e.preventDefault()); done.addEventListener('click', () => { const a = document.activeElement; if (a && a.blur) a.blur(); clearKb(); }); } // Done: closes the keyboard (also for Remarks, where Enter is a new line)
      body0.addEventListener('focusout', () => { clearTimeout(kbOff); kbOff = setTimeout(() => { if (!fieldOf(document.activeElement)) clearKb(); }, 160); });
      body0.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && fieldOf(e.target)) { e.preventDefault(); e.target.blur(); } }); // Enter / Done closes the keyboard
    }
  })();

  /* ================= full-size photo (v2.14): tap any photo; tap the photo to zoom; × or Back closes ================= */
  let pvUrl = '', pvOpen = false, pvReadBlob = null; // pvReadBlob: a photo shown only to read the ID on it (v2.19 ID photo)
  function showBlob(blob, caption) {
    if (!blob) return;
    if (pvUrl) URL.revokeObjectURL(pvUrl);
    pvUrl = URL.createObjectURL(blob);
    $('pvImg').src = pvUrl; $('pvCap').textContent = caption || ''; $('photoView').classList.remove('zoomed'); $('photoView').hidden = false;
    $('pvTools').hidden = true; $('pvHint').textContent = 'Tap the photo to zoom in or out · × or Back to close';
    $('photoView').classList.remove('reading'); $('pvMark').hidden = true;
    if (!pvOpen) { pvOpen = true; history.pushState({ photo: 1 }, ''); }
  }
  function hidePhotoView() { pvReadBlob = null; $('photoView').hidden = true; $('photoView').classList.remove('zoomed', 'reading'); $('pvMark').hidden = true; $('pvImg').src = ''; if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = ''; } }
  const closePhotoView = () => { if (pvOpen) history.back(); else hidePhotoView(); };
  $('pvClose').addEventListener('click', (e) => { e.stopPropagation(); closePhotoView(); });
  $('photoView').addEventListener('click', (e) => { if (e.target === $('photoView')) closePhotoView(); });
  $('pvImg').addEventListener('click', (e) => {
    e.stopPropagation();
    if ($('photoView').classList.contains('reading')) return; // a tap reads the ID there (v2.17)
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
    if (pvOpen) { pvOpen = false; hidePhotoView(); if (pendingClose.length) history.back(); return; } // Back closes the full-size photo first; a close asked meanwhile goes on
    if (editorSaving && stack[stack.length - 1] === 'editor') {
      history.pushState({ sheet: 'editor' }, '');
      LOG.info('back.blockedWhileSaving'); toast('Finishing the save. Your photo is still here.'); return;
    }
    // v2.21: the phone's Back on a record with unsaved changes: it stays open and asks
    if (!pendingClose.length && stack[stack.length - 1] === 'editor' && ed && !ed.closeOK && edDirty()) {
      history.pushState({ sheet: 'editor' }, '');
      askLeaveEditor(); return;
    }
    const id = stack.pop();
    if (id) { $(id).hidden = true; onSheetClosed(id); }
    const r = pendingClose.shift(); if (r) r();
  });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
    if (stack[stack.length - 1] === 'editor' && ed && !ed.closeOK && edDirty()) { askLeaveEditor(); return; } // v2.21
    closeSheet();
  }));
  function onSheetClosed(id) {
    if (id !== 'editor' && ed) scheduleDraft(); // back on the record from the camera, the marks or a photo: kept safe (v2.21)
    if (id === 'camera') stopCamera();
    if (id === 'editor') { cleanupEditor(); }
    if (sharedWaiting && (id === 'editor' || id === 'camera')) setTimeout(sharedResume, id === 'camera' ? 3000 : 400); // v2.21
    if (id === 'profile' && !profileOk()) sharedWaiting = null; // closed without the details: the file is not opened later by surprise
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
  // v2.18: text is Small unless another size was chosen; Very small added
  const applyTextSize = () => { const v = [0.8, 0.9, 1, 1.15, 1.3, 1.45].includes(+S.textScale) ? +S.textScale : 0.9; document.documentElement.style.setProperty('--fs', String(v)); $('setTextSize').value = String(v); };
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
  const APP_VER = '2.34.0';
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
    const pts = projPoints(), hidePins = viewHide().pins && !routeMode; // v2.30: pins hidden from the map button (shown while linking the route)
    for (const p of pts) {
      if (hidePins) break;
      const acc = p.kind === 'acceptance', n = openCount(p), sel = routeMode && p.id === routeSel, el = elemOf(p);
      const m = !acc && el !== 'Pole' && SV_SHORT[el] // survey element: a labelled square (dashed when proposed / new)
        ? L.marker([p.lat, p.lon], { keyboard: false, icon: L.divIcon({ className: 'svpin-wrap', html: `<span class="svpin${sel ? ' sel' : ''}${p.status === 'Proposed' || p.status === 'New' ? ' new' : ''}" style="--c:${SV_COLORS[el]}">${SV_SHORT[el]}</span>`, iconSize: [30, 24], iconAnchor: [15, 12] }) })
        : L.circleMarker([p.lat, p.lon], { radius: sel ? 12 : acc && el !== 'Pole' ? 10 : 8, weight: sel ? 4 : !acc && p.status === 'New' ? 3 : 2,
          color: sel ? '#17202a' : acc && el !== 'Pole' ? '#17202a' : !acc && p.status === 'Proposed' ? '#e03131' : !acc && p.status === 'New' ? '#17202a' : '#fff',
          dashArray: !acc && p.status === 'Proposed' && !sel ? '3 3' : null,
          fillColor: acc ? STATUS_COLORS[recStatus(p)] : typeColor(p.poleType), fillOpacity: !acc && p.status === 'Proposed' ? 0.5 : 1 });
      const role = R && R.poles[p.id] && (R.poles[p.id].role === 'Angle' ? ` · ${Math.round(R.poles[p.id].deflection)}°` : R.poles[p.id].role === 'Junction' ? ' · junction' : '');
      m.bindTooltip(`${C.xmlEsc(recName(p) || '(no ID)')}${acc && n ? ` · ${n} open` : ''}${role || ''}`, { permanent: true, direction: 'right', offset: [!acc && el !== 'Pole' ? 14 : 8, 0], className: 'pole-label' });
      m.on('click', () => (routeMode ? routeTap(p.id) : visitMode() ? openVisit(p.id) : openEditorFor(p.id)));
      m.addTo(poleLayer);
    }
    $('projectName').textContent = S.project || 'No project · tap to add';
    if (refFor !== S.project || !refLayer.getLayers().length) drawRef(false);
    const cat = taskCat(), mb = $('modeBadge');
    mb.textContent = cat.toUpperCase(); mb.className = `badge cat ${cat.toLowerCase()}`;
    $('listLbl').textContent = 'Records';
    const dr = drawOn(); $('drawLbl').textContent = dr ? 'Drawing' : 'Find'; $('drawIco').setAttribute('href', dr ? '#i-draw' : '#i-find'); // v2.28
    renderSummary(pts); declutterSoon();
    if (typeof drawAreas === 'function') drawAreas();
    renderRefBtn(); // v2.30
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
  /* ================= v2.28: the bar's Drawing (As-Plan / As-Built) or Find (every other project) ================= */
  const drawOn = () => !!S.project && !isAcc() && BOQ_PURPOSES.includes(svPurpose());
  $('drawBtn').addEventListener('click', () => { if (!S.project) { openProjects(); return; } if (drawOn()) openDrawing(); else openFind(); });
  /* Drawing: a preview of the DXF of the project (UTM metres): the route with its span lengths, poles and other points with
     their IDs, the KMZ reference faint behind; pan with a finger, pinch or the wheel to zoom, tap a point for its details.
     (Editing it on your DXF template comes later.) */
  let drw = null;
  function openDrawing() {
    const pts = projPoints(); if (!pts.length) { toast('Nothing recorded in this project yet'); return; }
    const z = S.zone, U = (p) => { const u = C.utmForward(p.lat, p.lon, z, p.lat < 0); return [u.E, u.N]; };
    const R = routeModel(), items = pts.map((p) => ({ p, xy: U(p) }));
    const ref = []; refGeoFor(S.project).then((g) => { if (!g || !drw) return; (g.lines || []).forEach((l) => ref.push(l.c.map(([la, lo]) => U({ lat: la, lon: lo })))); drawDrawing(); }).catch(() => {});
    drw = { items, spans: R.spans.map((sp) => ({ sp, a: U(sp.a), b: U(sp.b) })), ref, labels: true, view: null, ptrs: new Map(), sel: null };
    $('drawTitle').textContent = `Drawing · ${S.project}`;
    $('drawHint').textContent = `Preview of the DXF (UTM ${z}N metres): ${pts.filter((p) => elemOf(p) === 'Pole').length} poles, ${R.spans.length} spans, ${fmtLen(R.total)}. Drag to pan, pinch or scroll to zoom, tap a point. Editing on your DXF template comes later.`;
    $('drawInfo').hidden = true; $('drawLabels').setAttribute('aria-pressed', 'true');
    openSheet('drawing');
    requestAnimationFrame(() => { sizeDrawing(); fitDrawing(); drawDrawing(); });
  }
  function sizeDrawing() { const cv = $('drawCanvas'), r = $('drawWrap').getBoundingClientRect(), d = window.devicePixelRatio || 1; cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d)); }
  function fitDrawing() {
    if (!drw) return;
    const xs = drw.items.map((i) => i.xy[0]), ys = drw.items.map((i) => i.xy[1]), cv = $('drawCanvas');
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const w = Math.max(20, maxx - minx), h = Math.max(20, maxy - miny), sc = Math.min(cv.width / (w * 1.25), cv.height / (h * 1.25));
    drw.view = { cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, sc };
  }
  const drwPx = (xy) => { const v = drw.view, cv = $('drawCanvas'); return [cv.width / 2 + (xy[0] - v.cx) * v.sc, cv.height / 2 - (xy[1] - v.cy) * v.sc]; };
  function drawDrawing() {
    if (!drw || !drw.view) return;
    const cv = $('drawCanvas'), g = cv.getContext('2d'), d = window.devicePixelRatio || 1, v = drw.view;
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, cv.width, cv.height);
    // grid every 10 / 50 / 100 m, by zoom
    const step = [5, 10, 20, 50, 100, 200, 500, 1000].find((m) => m * v.sc > 60 * d) || 1000;
    g.strokeStyle = 'rgba(28,63,148,0.08)'; g.lineWidth = 1;
    const x0 = v.cx - cv.width / 2 / v.sc, y0 = v.cy - cv.height / 2 / v.sc;
    for (let x = Math.floor(x0 / step) * step; x < x0 + cv.width / v.sc; x += step) { const px = drwPx([x, 0])[0]; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, cv.height); g.stroke(); }
    for (let y = Math.floor(y0 / step) * step; y < y0 + cv.height / v.sc; y += step) { const py = drwPx([0, y])[1]; g.beginPath(); g.moveTo(0, py); g.lineTo(cv.width, py); g.stroke(); }
    g.lineJoin = 'round'; g.lineCap = 'round';
    drw.ref.forEach((l) => { g.strokeStyle = 'rgba(112,72,232,0.45)'; g.lineWidth = 2 * d; g.setLineDash([6 * d, 5 * d]); g.beginPath(); l.forEach((xy, i) => { const [px, py] = drwPx(xy); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); });
    g.setLineDash([]);
    const fs = 11 * d; g.font = `600 ${fs}px ui-monospace, monospace`;
    drw.spans.forEach(({ sp, a, b }) => { // the CABLE_ROUTE layer and the span length (FOC_LENGTH) at its middle
      const [ax, ay] = drwPx(a), [bx, by] = drwPx(b);
      g.strokeStyle = sp.long ? '#c92a2a' : '#1c3f94'; g.lineWidth = 2.2 * d; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      if (drw.labels && Math.hypot(bx - ax, by - ay) > 46 * d) {
        let ang = Math.atan2(by - ay, bx - ax); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        g.save(); g.translate((ax + bx) / 2, (ay + by) / 2); g.rotate(ang); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = sp.long ? '#c92a2a' : '#1c3f94'; g.fillText(`${sp.len.toFixed(1)} m`, 0, -3 * d); g.restore();
      }
    });
    const placed = [];
    drw.items.forEach(({ p, xy }) => {
      const [px, py] = drwPx(xy), el = elemOf(p), r = (el === 'Pole' ? 5 : 6) * d, prop = p.status === 'Proposed' || p.status === 'New';
      g.lineWidth = 1.8 * d; g.strokeStyle = prop ? '#e03131' : '#1b1b1b'; g.fillStyle = drw.sel === p.id ? '#ffd43b' : '#ffffff';
      g.beginPath();
      if (el === 'Pole') g.arc(px, py, r, 0, Math.PI * 2); else if (el === 'Handhole' || el === 'ODC' || el === 'ODF') g.rect(px - r, py - r, r * 2, r * 2); else { g.moveTo(px, py - r * 1.2); g.lineTo(px + r, py + r * 0.8); g.lineTo(px - r, py + r * 0.8); g.closePath(); }
      g.fill(); g.stroke();
      if (el !== 'Pole') { g.fillStyle = SV_COLORS[el] || '#495057'; g.beginPath(); g.arc(px, py, r * 0.35, 0, Math.PI * 2); g.fill(); }
      if (!drw.labels) return;
      const t = p.poleId || el, w = g.measureText(t).width; // the ID beside the point, moved down or left when it would cover another
      const tries = [[r + 4 * d, -fs / 2], [r + 4 * d, fs * 0.6], [-r - 4 * d - w, -fs / 2], [-w / 2, -r - fs - 4 * d], [-w / 2, r + 4 * d]];
      let pos = tries[0];
      for (const tr of tries) { const bx = [px + tr[0], py + tr[1], w, fs]; if (!placed.some((q) => bx[0] < q[0] + q[2] && bx[0] + bx[2] > q[0] && bx[1] < q[1] + q[3] && bx[1] + bx[3] > q[1])) { pos = tr; break; } }
      placed.push([px + pos[0], py + pos[1], w, fs]);
      g.fillStyle = 'rgba(251,251,248,0.85)'; g.fillRect(px + pos[0] - 2, py + pos[1] - 1, w + 4, fs + 2);
      g.fillStyle = prop ? '#c92a2a' : '#1b1b1b'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(t, px + pos[0], py + pos[1]);
    });
    // north arrow and scale bar
    g.fillStyle = '#1b1b1b'; g.strokeStyle = '#1b1b1b'; g.lineWidth = 1.5 * d;
    const nx = cv.width - 26 * d, ny = 30 * d; g.beginPath(); g.moveTo(nx, ny - 14 * d); g.lineTo(nx + 7 * d, ny + 8 * d); g.lineTo(nx, ny + 3 * d); g.lineTo(nx - 7 * d, ny + 8 * d); g.closePath(); g.fill();
    g.font = `700 ${11 * d}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('N', nx, ny + 10 * d);
    const sb = [10, 20, 50, 100, 200, 500, 1000, 2000].find((m) => m * v.sc > 70 * d) || 2000, sx = 16 * d, sy = cv.height - 18 * d;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + sb * v.sc, sy); g.moveTo(sx, sy - 5 * d); g.lineTo(sx, sy + 5 * d); g.moveTo(sx + sb * v.sc, sy - 5 * d); g.lineTo(sx + sb * v.sc, sy + 5 * d); g.stroke();
    g.textBaseline = 'bottom'; g.fillText(sb >= 1000 ? `${sb / 1000} km` : `${sb} m`, sx + sb * v.sc / 2, sy - 4 * d);
  }
  (() => { // pan, pinch, wheel and tap on the drawing
    const cv = $('drawCanvas'), d = () => window.devicePixelRatio || 1;
    let last = null, moved = 0, pinch = null;
    cv.addEventListener('pointerdown', (e) => { if (!drw) return; cv.setPointerCapture(e.pointerId); drw.ptrs.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; moved = 0;
      if (drw.ptrs.size === 2) { const [a, b] = [...drw.ptrs.values()]; pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), sc: drw.view.sc }; } });
    cv.addEventListener('pointermove', (e) => {
      if (!drw || !drw.ptrs.has(e.pointerId)) return; drw.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (drw.ptrs.size === 2 && pinch) { const [a, b] = [...drw.ptrs.values()]; drw.view.sc = Math.max(0.01, pinch.sc * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.dist); moved = 99; drawDrawing(); return; }
      const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy);
      drw.view.cx -= dx * d() / drw.view.sc; drw.view.cy += dy * d() / drw.view.sc; drawDrawing();
    });
    const up = (e) => {
      if (!drw) return; drw.ptrs.delete(e.pointerId); if (drw.ptrs.size < 2) pinch = null;
      if (moved < 8 && e.type === 'pointerup') { // a tap: the nearest point
        const r = cv.getBoundingClientRect(), tx = (e.clientX - r.left) * d(), ty = (e.clientY - r.top) * d();
        let best = null; drw.items.forEach((it) => { const [px, py] = drwPx(it.xy), dd = Math.hypot(px - tx, py - ty); if (dd < 24 * d() && (!best || dd < best.dd)) best = { it, dd }; });
        drw.sel = best ? best.it.p.id : null; const info = $('drawInfo');
        if (best) { const p = best.it.p, u = best.it.xy; info.textContent = `${p.poleId || elemOf(p)} · ${svDesc(p)}${boqText(p) ? ` · ${boqText(p)}` : ''} · E ${u[0].toFixed(1)} N ${u[1].toFixed(1)}`; info.hidden = false; } else info.hidden = true;
        drawDrawing();
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { if (!drw) return; e.preventDefault(); drw.view.sc *= e.deltaY < 0 ? 1.15 : 1 / 1.15; drawDrawing(); }, { passive: false });
    window.addEventListener('resize', () => { if (drw && !$('drawing').hidden) { sizeDrawing(); drawDrawing(); } });
  })();
  $('drawFit').addEventListener('click', () => { fitDrawing(); drawDrawing(); });
  $('drawLabels').addEventListener('click', () => { if (!drw) return; drw.labels = !drw.labels; $('drawLabels').setAttribute('aria-pressed', String(drw.labels)); drawDrawing(); });
  $('drawDxf').addEventListener('click', () => { exportPick = 'doDxf'; closeSheet().then(() => $('exportBtn').click()); });
  /* Find: search the project's pins by ID, element, status or defect; tap one to fly to it on the map and open it. */
  function openFind() { $('findQ').value = ''; renderFind(); openSheet('find'); setTimeout(() => $('findQ').focus(), 120); }
  function renderFind() {
    const q = $('findQ').value.trim().toUpperCase(), box = $('findList'); box.innerHTML = '';
    const here = fix ? { lat: fix.lat, lon: fix.lon } : null;
    const hay = (p) => [recName(p), p.poleId, elemOf(p), p.status, p.napId, p.closureId, p.remarks, ...(p.defs || []).map((d) => `${d.cat || ''} ${(d.items || []).join(' ')} ${d.notes || ''}`)].join(' ').toUpperCase();
    let pts = projPoints().filter((p) => !q || hay(p).includes(q));
    if (here) pts = pts.map((p) => ({ p, d: haversine(here, p) })).sort((a, b) => a.d - b.d).map((x) => ({ ...x.p, _d: x.d }));
    pts.slice(0, 60).forEach((p) => {
      const b = document.createElement('button'); b.type = 'button';
      const n = document.createElement('b'); n.textContent = recName(p) || '(no ID)';
      const sub = document.createElement('span'); sub.textContent = [isAcc() ? `${elemOf(p)} · ${STATUS_TEXT[recStatus(p)] || ''}${openCount(p) ? ` · ${openCount(p)} open` : ''}` : svDesc(p), p._d != null ? `${fmtDist(p._d)} away` : ''].filter(Boolean).join(' · ');
      b.append(n, sub);
      b.addEventListener('click', async () => { await closeSheet(); map.setView([p.lat, p.lon], Math.max(map.getZoom(), 19)); setTimeout(() => (visitMode() ? openVisit(p.id) : openEditorFor(p.id)), 350); });
      box.appendChild(b);
    });
    if (!pts.length) { const e = document.createElement('p'); e.className = 'hint'; e.textContent = q ? `Nothing matches “${$('findQ').value.trim()}”.` : 'Nothing recorded in this project yet.'; box.appendChild(e); }
    else if (pts.length > 60) { const e = document.createElement('p'); e.className = 'hint'; e.textContent = `${pts.length - 60} more: type more of the ID.`; box.appendChild(e); }
  }
  $('findQ').addEventListener('input', renderFind);
  $('findAll').addEventListener('click', () => closeSheet().then(() => $('listBtn').click()));
  /* v2.28: map labels (pole IDs and span lengths) moved apart where they would cover each other; a span length that has no
     free place is hidden until the map is zoomed in. */
  let declutterTimer = 0;
  function declutterSoon() { clearTimeout(declutterTimer); declutterTimer = setTimeout(() => requestAnimationFrame(declutterLabels), 60); }
  function declutterLabels() {
    const mapEl = $('map'); if (!mapEl || mapEl.classList.contains('hide-labels')) return;
    const vr = mapEl.getBoundingClientRect();
    const poles = [...mapEl.querySelectorAll('.leaflet-tooltip.pole-label')], spans = [...mapEl.querySelectorAll('.span-label')];
    [...poles, ...spans].forEach((el) => { el.style.marginTop = ''; el.style.marginLeft = ''; el.style.visibility = ''; });
    const pins = [...mapEl.querySelectorAll('.leaflet-marker-icon:not(.span-icon)')].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.right > vr.left && r.left < vr.right && r.bottom > vr.top && r.top < vr.bottom);
    const placed = [...pins], hit = (r) => placed.some((q) => r.left < q.right - 1 && r.right > q.left + 1 && r.top < q.bottom - 1 && r.bottom > q.top + 1);
    const place = (el, tries, hideIfStuck) => {
      const r0 = el.getBoundingClientRect(); if (!r0.width || r0.right < vr.left || r0.left > vr.right || r0.bottom < vr.top || r0.top > vr.bottom) return;
      for (const [dx, dy] of tries) {
        const r = { left: r0.left + dx, right: r0.right + dx, top: r0.top + dy, bottom: r0.bottom + dy };
        if (!hit(r)) { if (dx) el.style.marginLeft = `${dx}px`; if (dy) el.style.marginTop = `${dy}px`; placed.push(r); return; }
      }
      if (hideIfStuck) el.style.visibility = 'hidden'; else placed.push(r0);
    };
    poles.forEach((el) => place(el, [[0, 0], [0, -14], [0, 14], [0, -26], [0, 26]], false));
    spans.forEach((el) => place(el, [[0, 0], [0, -16], [0, 16], [16, 0], [-16, 0], [0, -30], [0, 30]], true));
  }
  map.on('zoomend moveend', declutterSoon);
  /* ---- map legend (v2.15) ---- */
  function renderLegend() {
    const L2 = $('legend'), dot = (c, t) => `<span class="lg"><span class="sw" style="background:${c}"></span>${C.xmlEsc(t)}</span>`, sq = (c, k, t) => `<span class="lg"><span class="sq" style="background:${c}">${k}</span>${C.xmlEsc(t)}</span>`;
    let h = '';
    if (isAcc()) h = dot(STATUS_COLORS.Open, 'Open defect') + dot(STATUS_COLORS.Rectified, 'Fixed · to check') + dot(STATUS_COLORS.Verified, 'Verified') + dot(STATUS_COLORS.OK, 'No deficiency');
    else {
      const used = [...new Set(projPoints().filter((p) => elemOf(p) === 'Pole').map((p) => p.poleType || ''))].filter(Boolean);
      h = (used.length ? used : [S.lastType || 'Concrete']).map((t) => dot(typeColor(t), `${t} pole`)).join('')
        + '<span class="lg"><span class="sw" style="background:#fff;border:2px dashed #e03131"></span>Proposed pole</span><span class="lg"><span class="sw" style="background:#fff;border:3px solid #17202a"></span>New pole (As-built)</span>'
        + Object.keys(SV_SHORT).map((el) => sq(SV_COLORS[el], SV_SHORT[el], el === 'Closure' ? 'Closure (POI)' : el)).join('')
        + Object.values(CAB).map((c) => `<span class="lg"><span class="ln" style="border-top:4px ${c.method === 'UG' ? 'dotted' : 'solid'} ${c.css}"></span>${C.xmlEsc(c.short)} (${c.method})</span>`).join('') + '<span class="lg"><span class="ln" style="border-top:4px solid #868e96"></span>Cable not set</span>'; // v2.29
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
  /* v2.30: what shows on the map: the reference's pins and its lines (route, areas), and this project's pins and route */
  const refParts = (name) => ({ pins: true, lines: true, ...((S.refParts || {})[name || S.project] || {}) });
  const viewHide = (name) => ({ pins: false, route: false, ...((S.viewHide || {})[name || S.project] || {}) });
  const refShown = (geo, name) => { const pt = refParts(name); return { points: pt.pins ? geo.points : [], lines: pt.lines ? geo.lines : [], polys: pt.lines ? geo.polys : [] }; };
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
    /* v2.26.1: a G-eSAA survey KMZ (the As-Plan) carries each element's ID, status and sizes as data: kept for the As-Built */
    const dataOf = (pm) => { const o = {}; all(pm, 'Data').forEach((d) => { const k = d.getAttribute('name'); if (k && KML_DATA.has(k)) { const v = txt(d, 'value').slice(0, 120); if (v) o[k] = v; } }); return o.element ? o : null; };
    for (const pm of all(doc, 'Placemark')) {
      const n = txt(pm, 'name').slice(0, 80), f = folderOf(pm).slice(0, 60), st = styleOf(pm);
      for (const g of all(pm, 'Point')) { const c = coords(g)[0], x = dataOf(pm); if (c && out.points.length < REF_MAX_PTS) out.points.push({ n, f, c, col: st.icon || null, ...(x ? { x } : {}) }); }
      for (const g of all(pm, 'LineString')) { const c = coords(g); if (c.length > 1 && out.lines.length < REF_MAX_LINES) out.lines.push({ n, f, c, col: st.line || null, w: st.w }); }
      for (const g of all(pm, 'Polygon')) { const ob = all(g, 'outerBoundaryIs')[0], ring = ob && all(ob, 'LinearRing')[0], c = ring ? coords(ring) : []; if (c.length > 2 && out.lines.length < REF_MAX_LINES) out.polys.push({ n, f, c, col: st.line || st.poly || null }); }
    }
    return out;
  }
  /** v2.26.1: the data names of a G-eSAA survey KMZ (core.js) read back from a reference; BOQ_KML maps them to the record's sizes. */
  const BOQ_KML = { pole_owner: 'owner', clamp_size: 'clamp', new_pole_size: 'height', pole_class: 'cls', odf_size: 'odf', odf_connector: 'conn', closure_size: 'clo', closure_status: 'cloSt', new_arm: 'arm', guying: 'guy', mloop: 'mloop' }; // v2.29: + arm, guying, loop
  const KML_DATA = new Set(['pole_id', 'element', 'status', 'closure_id', ...Object.keys(BOQ_KML)]);
  /** The elements of the As-Plan (this As-Built project's reference KMZ) as records: ID, element, status, position, sizes. */
  function planRecsOf(geo) {
    return ((geo && geo.points) || []).filter((p) => p.x && p.x.element).map((p) => {
      const boq = {}; Object.entries(BOQ_KML).forEach(([k, f]) => { if (p.x[k]) boq[f] = p.x[k]; });
      return { poleId: p.x.pole_id || p.n || '', element: p.x.element, status: p.x.status || '', closureId: p.x.closure_id || '', lat: p.c[0], lon: p.c[1], boq };
    });
  }
  /** The plan of an As-Built project: { name, recs } (recs empty when the reference is not a G-eSAA KMZ), or null. */
  async function planFor(name) {
    const nm = name || S.project;
    if (isAcc(nm) || svPurpose(nm) !== 'As-built') return null;
    const info = refInfo(nm); if (!info) return null;
    const geo = await refGeoFor(nm).catch(() => null);
    return { name: info.name, recs: planRecsOf(geo) };
  }
  const PLAN_NEAR_M = 15; // an As-Built element without the planned ID is matched to the nearest planned one of its kind within this distance
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
    const pr = planRecsOf(geo); // v2.26.1: a G-eSAA As-Plan KMZ: its elements and their sizes
    const n = { pins: geo.points.length, lines: geo.lines.length, areas: geo.polys.length, km: +(geo.lines.reduce((t, l) => t + lineLen(l.c), 0) / 1000).toFixed(2), plan: pr.length, sized: pr.filter((r) => Object.keys(r.boq).length).length };
    if (!n.pins && !n.lines && !n.areas) throw new Error('No pins, lines or areas found in this file');
    const old = refInfo(), id = uid();
    await dbPut('packs', { k: refKey(id), geo });
    if (old) await dbDel('packs', refKey(old.id)).catch(() => {});
    S.refs = { ...(S.refs || {}), [S.project]: { id, name: f.name || 'reference', at: new Date().toISOString(), n } }; S.refHidden = { ...(S.refHidden || {}), [S.project]: false }; persist();
    refGeo = geo; refFor = S.project; busy(false);
    LOG.info('ref.loaded', n);
    drawRef(true); renderRefInfo();
    const planTxt = boqOn() && svPurpose() === 'As-built' ? (n.plan ? ` · As-Plan: ${n.plan} element${n.plan === 1 ? '' : 's'}, ${n.sized} with sizes for the BOQ` : ' · no G-eSAA sizes in it (not an As-Plan KMZ from G-eSAA)') : '';
    toast(`Reference loaded: ${n.lines ? `${n.lines} line${n.lines === 1 ? '' : 's'} (${n.km} km)` : ''}${n.lines && n.pins ? ' · ' : ''}${n.pins ? `${n.pins} pin${n.pins === 1 ? '' : 's'}` : ''}${n.areas ? ` · ${n.areas} area${n.areas === 1 ? '' : 's'}` : ''}${planTxt}`, 5000);
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
    addRefShapes(refLayer, refShown(geo), refRenderer, 'refPane');
    if (fit) { const b = L.latLngBounds([...geo.points.map((g) => g.c), ...geo.lines.flatMap((g) => g.c), ...geo.polys.flatMap((g) => g.c)]); if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 18 }); }
    refLabelUpdate();
  }
  /** Names of the reference pins and lines, only when zoomed in (there can be thousands of homing pins). */
  function refLabelUpdate() {
    refLabels.clearLayers();
    if (!refGeo || refFor !== S.project || (S.refHidden || {})[S.project] || !refInfo() || !refParts().pins || map.getZoom() < 18) return;
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
    addRefShapes(pinRefLayer, refShown(geo), pinRefRenderer, 'refPane');
  }
  function renderRefInfo() {
    const info = refInfo(), hidden = (S.refHidden || {})[S.project];
    $('refInfo').textContent = info ? `${info.name}: ${[info.n.lines && `${info.n.lines} line${info.n.lines === 1 ? '' : 's'} (${info.n.km} km)`, info.n.pins && `${info.n.pins} pin${info.n.pins === 1 ? '' : 's'}`, info.n.areas && `${info.n.areas} area${info.n.areas === 1 ? '' : 's'}`, info.n.plan && `As-Plan: ${info.n.plan} element${info.n.plan === 1 ? '' : 's'}, ${info.n.sized || 0} with sizes`].filter(Boolean).join(' · ')}${hidden ? ' · hidden' : ''}` : boqOn() && svPurpose() === 'As-built' ? 'No reference loaded. Load the As-Plan KMZ (exported by G-eSAA): the As-Built then starts each element with its planned sizes and the BOQ shows planned against built.' : 'No reference loaded.';
    $('refToggle').hidden = $('refRemove').hidden = !info; $('refToggle').textContent = hidden ? 'Show' : 'Hide';
    $('refLoad').textContent = info ? 'Replace…' : 'Load KMZ / KML…';
    const rb = document.querySelector('#curTools .tmtool.ref'); if (rb && rb.lastChild) rb.lastChild.textContent = info ? 'KMZ ✓' : 'KMZ'; // v2.28: the card's tool
    renderRefBtn();
  }
  /* v2.30: the map button for the reference KMZ: with none loaded it loads one; else it opens a small panel to show or hide
     the reference, its pins or its lines, and this project's pins or route. */
  function renderRefBtn() {
    const b = $('refBtn'), info = refInfo(), pt = refParts(), vh = viewHide(), hid = !!(S.refHidden || {})[S.project];
    b.hidden = !S.project;
    b.dataset.state = info ? (hid ? 'hidden' : 'shown') : 'none';
    b.classList.toggle('partial', !!((info && (hid || !pt.pins || !pt.lines)) || vh.pins || vh.route));
    b.setAttribute('aria-label', info ? `Reference KMZ ${info.name}: show or hide it, its pins or its lines` : 'Load a reference KMZ (design route, homing, POI)');
    $('rmName').textContent = info ? info.name : 'No reference KMZ loaded.';
    $('rmRefRow').hidden = !info;
    const set = (id, on) => $(id).setAttribute('aria-pressed', String(on));
    set('rmRef', !hid); set('rmRefPins', pt.pins); set('rmRefLines', pt.lines); set('rmPins', !vh.pins); set('rmRoute', !vh.route);
    $('rmRefPins').disabled = $('rmRefLines').disabled = hid;
    $('rmLoad').textContent = info ? 'Replace…' : 'Load KMZ / KML…';
  }
  const refMenuOpen = (on) => { $('refMenu').hidden = !on; if (on) renderRefBtn(); };
  $('refBtn').addEventListener('click', () => {
    if (!refInfo() && !$('refMenu').hidden) { refMenuOpen(false); return; }
    if (!refInfo() && !viewHide().pins && !viewHide().route) { $('refInput').value = ''; $('refInput').click(); return; } // nothing loaded: load one
    refMenuOpen($('refMenu').hidden);
  });
  const setPart = (key, k, v) => { S[key] = { ...(S[key] || {}), [S.project]: { ...((S[key] || {})[S.project] || {}), [k]: v } }; persist(); };
  $('rmRef').addEventListener('click', () => { S.refHidden = { ...(S.refHidden || {}), [S.project]: !(S.refHidden || {})[S.project] }; persist(); drawRef(false); drawPinRef(); renderRefInfo(); });
  $('rmRefPins').addEventListener('click', () => { setPart('refParts', 'pins', !refParts().pins); drawRef(false); drawPinRef(); renderRefBtn(); });
  $('rmRefLines').addEventListener('click', () => { setPart('refParts', 'lines', !refParts().lines); drawRef(false); drawPinRef(); renderRefBtn(); });
  $('rmPins').addEventListener('click', () => { setPart('viewHide', 'pins', !viewHide().pins); renderPoles(); renderRefBtn(); if (viewHide().pins) toast('This project’s pins are hidden: the map button shows a red dot until you show them again', 3500); });
  $('rmRoute').addEventListener('click', () => { setPart('viewHide', 'route', !viewHide().route); renderPoles(); renderRefBtn(); });
  $('rmLoad').addEventListener('click', () => { refMenuOpen(false); $('refInput').value = ''; $('refInput').click(); });
  $('rmClose').addEventListener('click', () => refMenuOpen(false));
  map.on('click movestart', () => { if (!$('refMenu').hidden) refMenuOpen(false); });
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
  /* v2.29: each span carries its FOC cable type (the third value of the link): AE Figure 8 72C, Light cable 12C or UG 144C air-blown */
  const CAB = C.CABLES;
  const cableSel = () => { const k = pmeta().cable; return k === '' || CAB[k] ? k : 'L12'; }; // the cable new links get: the project's last choice
  const cableName = (k) => (CAB[k] ? CAB[k].label : 'Cable not set');
  const linkWith = (a, b, k) => (k ? [a, b, k] : [a, b]);
  function renderCableSel() {
    const sel = $('rbCable'); if (!sel.options.length) { Object.entries(CAB).forEach(([k, c]) => sel.add(new Option(`${c.label} · ${c.method}`, k))); sel.add(new Option('Cable not set', '')); }
    sel.value = cableSel();
  }
  /** Points the cable route runs through: poles, handholes, the site, ODC and ODF (NAP and closure pins sit on a pole). */
  const routePts = () => projPoints().filter((p) => ROUTE_ELS.includes(elemOf(p)));
  const routeModel = () => C.analyzeRoute(routePts(), links(), { maxSpan: pol().maxSpan || 200, angleDeg: pol().angleDeg || 15 });
  const fmtLen = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
  function drawRoute() {
    routeLayer.clearLayers();
    if (isAcc()) return null;
    const R = routeModel();
    if (viewHide().route && !routeMode) { if (typeof declutterSoon === 'function') declutterSoon(); return R; } // v2.30: route hidden from the map button
    for (const s of R.spans) { // v2.29: coloured by cable type (grey: cable not set); long spans red
      const cab = CAB[s.cable];
      L.polyline([[s.a.lat, s.a.lon], [s.b.lat, s.b.lon]], { color: s.long ? '#c92a2a' : cab ? cab.css : '#868e96', weight: 4, opacity: 0.9, dashArray: s.long ? '8 6' : cab && cab.method === 'UG' ? '2 7' : null, lineCap: 'round', interactive: false }).addTo(routeLayer);
      L.marker([(s.a.lat + s.b.lat) / 2, (s.a.lon + s.b.lon) / 2], { interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'span-icon', html: `<span class="span-label${s.long ? ' long' : ''}">${s.len.toFixed(0)} m</span>`, iconSize: null }) }).addTo(routeLayer);
    }
    for (const p of projPoints()) {
      const info = R.poles[p.id];
      if (info && (info.role === 'Angle' || info.role === 'Junction')) L.circleMarker([p.lat, p.lon], { radius: 14, color: info.role === 'Angle' ? '#e8590c' : '#9c36b5', weight: 2, fill: false, interactive: false }).addTo(routeLayer);
    }
    if (routeMode) updateRouteBar(R);
    if (typeof declutterSoon === 'function') declutterSoon(); // v2.28
    return R;
  }
  function updateRouteBar(R) {
    $('rbTitle').textContent = `Route · ${R.spans.length} span${R.spans.length === 1 ? '' : 's'} · ${fmtLen(R.total)}`;
    const byCab = {}; R.spans.forEach((s) => { byCab[s.cable] = (byCab[s.cable] || 0) + s.len; });
    $('rbStats').textContent = `${R.long} longer than ${pol().maxSpan || 200} m · ${R.angle} angle · ${R.junction} junction · ${R.off} not linked · ${Object.entries(byCab).map(([k, m]) => `${CAB[k] ? CAB[k].short : 'not set'} ${fmtLen(m)}`).join(' · ')}`;
    const sel = routeSel && points.find((p) => p.id === routeSel);
    $('rbHint').textContent = sel ? `${sel.poleId} selected. Tap the next pole to link it (tap a linked pole to unlink), or tap ${sel.poleId} again to stop.`
      : 'Tap a pole, then the next pole to link them. Tap a linked pair again to unlink.';
    $('rbUndo').disabled = !routeUndo.length;
  }
  function setRouteMode(on) {
    routeMode = on; routeSel = null; routeUndo = [];
    $('routeBar').hidden = !on; $('routeBtn').setAttribute('aria-pressed', String(on)); if (on) renderCableSel();
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
    const l = links().map((x) => x.slice()), k = l.findIndex(([x, y]) => (x === routeSel && y === id) || (x === id && y === routeSel)), cab = cableSel();
    routeUndo.push(links());
    if (k >= 0 && (l[k][2] || '') !== cab) { l[k] = linkWith(l[k][0], l[k][1], cab); toast(`Span changed to ${cableName(cab)}`, 2200); } // v2.29: a linked pair with another cable chosen: the span takes it
    else if (k >= 0) l.splice(k, 1); else l.push(linkWith(routeSel, id, cab));
    setLinks(l); routeSel = id; renderPoles();
  }
  $('routeBtn').addEventListener('click', () => {
    if (!routeMode && routePts().length < 2) { toast('Capture at least two poles first'); return; }
    setRouteMode(!routeMode);
  });
  $('rbDone').addEventListener('click', () => setRouteMode(false));
  $('rbCable').addEventListener('change', () => { S.meta[S.project] = { ...pmeta(), cable: $('rbCable').value }; persist(); updateRouteBar(routeModel()); toast(`New links: ${cableName($('rbCable').value)}. Tap a linked pair to give it this cable.`, 3500); });
  $('rbCableAll').addEventListener('click', () => {
    const cab = cableSel(), l = links(); if (!l.length) { toast('No span yet'); return; }
    routeUndo.push(l); setLinks(l.map(([a, b]) => linkWith(a, b, cab))); renderPoles();
    toast(`Every span: ${cableName(cab)} (Undo to go back)`, 3000);
  });
  $('rbUndo').addEventListener('click', () => { if (routeUndo.length) { setLinks(routeUndo.pop()); renderPoles(); } });
  $('rbAuto').addEventListener('click', () => {
    const have = new Set(links().map(([x, y]) => [x, y].sort().join('|')));
    const add = C.autoLinks(projPoints().filter((p) => ['Pole', 'Handhole'].includes(elemOf(p))), pol().autoGap || 120).filter(([x, y]) => !have.has([x, y].sort().join('|'))); // the site, ODC and ODF are linked by hand
    if (!add.length) { toast('No new links: poles are already linked, or consecutive poles are farther apart than the gap setting'); return; }
    routeUndo.push(links()); setLinks(links().concat(add.map(([x, y]) => linkWith(x, y, cableSel())))); renderPoles();
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
  /** v2.19: the ID scan after each photo is set apart for surveys and for PAT / cleanup / FAT (where the ID is optional). */
  // v2.21: in PAT, cleanup and FAT the photo is of the defect: no ID scan after it unless turned on (Scan ID in the record stays)
  const readIdOn = () => (isAcc() ? S.readIdAcc === true : S.readId !== false);
  const gpsFresh = () => !!fix && Date.now() - fix.t <= GPS_WINDOW_MS && gpsErr !== 1;
  /** Shutter colour: green = GPS updated within 5 s (ready), red = GPS old, off or blocked; white while scanning an ID. */
  function shutterState() {
    const b = $('shutter'); if (!b) return;
    const st = scanStep() ? 'scan' : gpsFresh() ? 'ok' : 'bad';
    b.className = st;
    b.setAttribute('aria-label', st === 'scan' ? 'Read the ID' : st === 'ok' ? 'Take photo (GPS ready)' : 'Take photo (waiting for a fresh GPS fix)');
  }
  /** The guide box's shape and the H / V buttons follow the ID's orientation. */
  function setOrientUi() {
    $('idGuide').classList.toggle('v', S.idOrient === 'v');
    $('orientH').setAttribute('aria-pressed', String(S.idOrient !== 'v'));
    $('orientV').setAttribute('aria-pressed', String(S.idOrient === 'v'));
  }
  function showGuide() {
    const on = scanStep();
    $('idGuide').hidden = !on;
    setOrientUi();
    $('idGuideText').textContent = S.idOrient === 'v' ? 'Vertical ID inside the box' : 'Fit the painted ID inside the box';
    $('scanPrompt').hidden = !on;
    $('scanTitle').textContent = camTarget === 'newid' ? 'Photo kept · scan the ID' : 'Scan the ID';
    $('scanSkip').hidden = camTarget !== 'newid';
    $('scanPhoto').hidden = !((camTarget === 'newid' && camPending && !isAcc()) || (camTarget === 'scan' && ed && !ed.acc && (ed.newBlob || ed.srcBlob))); // v2.17
    $('camReadId').hidden = camTarget !== 'new';
    $('camReadId').setAttribute('aria-pressed', String(readIdOn()));
    $('camNative').hidden = true; // v2.28: the phone's own camera app is no longer offered (photos are taken live, with the GPS check)
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
  // a tap on H or V fixes the box's shape for this scan (otherwise it turns by itself to fit the ID, v2.16)
  $('orientH').addEventListener('click', () => { S.idOrient = 'h'; persist(); finderStop(); showGuide(); finder.manual = true; });
  $('scanHelp').addEventListener('click', () => { const on = $('scanSub').hidden; $('scanSub').hidden = !on; $('scanHelp').setAttribute('aria-expanded', String(on)); });
  $('orientV').addEventListener('click', () => { S.idOrient = 'v'; persist(); finderStop(); showGuide(); finder.manual = true; });
  $('scanSkip').addEventListener('click', () => closeSheet()); // the photo is kept; the editor opens without an ID reading
  // v2.17: read the ID on the photo instead (tap or swipe it there): the editor opens with the photo ready for that
  let photoReadNext = false;
  $('scanPhoto').addEventListener('click', async () => {
    finderStop();
    if (camTarget === 'newid') { photoReadNext = true; await closeSheet(); return; }
    await closeSheet(); openPhotoRead();
  });
  /* v2.19: ID photo — the camera focuses on the box and takes a full-size still; the ID is read from the box on the still, which is
     sharper than the live picture. Nothing sure read: the still opens, to tap the ID on it or draw a box round it. */
  $('scanShot').addEventListener('click', () => guard(takeIdShot, 'ID photo not taken'));
  /** The guide box (or the box drawn by hand) as shares of the camera picture. */
  function guideShare() {
    const v = $('video'), g = $('idGuide'); if (g.hidden || !v.videoWidth) return null;
    const vr = v.getBoundingClientRect(), st0 = $('camStage').getBoundingClientRect();
    const gr = finder.user ? { left: st0.left + finder.user.x, top: st0.top + finder.user.y, width: finder.user.w, height: finder.user.h } : g.getBoundingClientRect();
    const sc = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight), ox = vr.left + (vr.width - v.videoWidth * sc) / 2, oy = vr.top + (vr.height - v.videoHeight * sc) / 2;
    return { x: (gr.left - ox) / sc / v.videoWidth, y: (gr.top - oy) / sc / v.videoHeight, w: gr.width / sc / v.videoWidth, h: gr.height / sc / v.videoHeight,
      cx: gr.left + gr.width / 2, cy: gr.top + gr.height / 2, va: v.videoWidth / v.videoHeight };
  }
  /** The box on the still: the live picture is taken as the centre of the still when their shapes differ (a 16:9 preview of a 4:3 photo). */
  function shareOnStill(b, IW, IH) {
    let x0 = 0, y0 = 0, w = IW, h = IH;
    const sa = IW / IH;
    if (Math.abs(sa - b.va) > 0.02) { if (sa > b.va) { w = IH * b.va; x0 = (IW - w) / 2; } else { h = IW / b.va; y0 = (IH - h) / 2; } }
    return { x: x0 + b.x * w, y: y0 + b.y * h, w: b.w * w, h: b.h * h };
  }
  async function takeIdShot() {
    if (camBusy || !stream || !scanStep()) return;
    const b = guideShare(); if (!b) return;
    camBusy = true; $('shutter').disabled = true; $('scanShot').disabled = true;
    const seq = camSeq, orient = S.idOrient === 'v' ? 'v' : 'h', t0 = Date.now();
    try {
      finderStop(); focusAt(b.cx, b.cy); camCheck('Focusing on the ID…');
      await new Promise((r) => setTimeout(r, 900)); // the focus settles
      if (seq !== camSeq) return;
      camCheck('Taking the ID photo…');
      let blob = null;
      if (imageCapture) { try { blob = await withTimeout(takeStill(), TAKE_MS, 'slow'); } catch (e) { blob = null; LOG.warn('idshot.still.fail', errInfo(e)); } }
      if (!blob) { const v = $('video'), cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight; cv.getContext('2d').drawImage(v, 0, 0); blob = await toBlob(cv, 0.95); cv.width = cv.height = 0; }
      if (seq !== camSeq || !blob) return;
      const im = await loadImage(blob), { w: IW, h: IH } = dims(im), m = shareOnStill(b, IW, IH);
      const pad = Math.max(m.w, m.h) * 0.12, box = clipBox({ x: m.x - pad, y: m.y - pad, w: m.w + 2 * pad, h: m.h + 2 * pad }, IW, IH);
      const crop = cropOf(im, box, orient);
      // a second, separate reading: the ID found on the still around the box, else the box cut closer (used by itself only when both agree)
      const near = idNear(im, IW, IH, (m.x + m.w / 2) / IW, (m.y + m.h / 2) / IH), nb = near && clipBox(near, IW, IH);
      if (nb && nb.w > 8 && nb.h > 8) crop._second = cropOf(im, nb, near.v ? 'v' : 'h');
      else { const p2 = Math.max(m.w, m.h) * 0.04; crop._second = cropOf(im, clipBox({ x: m.x - p2, y: m.y - p2, w: m.w + 2 * p2, h: m.h + 2 * p2 }, IW, IH), orient); }
      if (im.close) im.close();
      LOG.info('idshot', { ms: Date.now() - t0, still: !!imageCapture, px: `${IW}×${IH}`, box: [Math.round(box.w), Math.round(box.h)], near: !!near, orient });
      camCheck(false);
      if (camTarget === 'newid' && camPending) { camPending.crop = crop; camPending.live = null; camPending.idShot = blob; await closeSheet(); }
      else if (camTarget === 'scan') { await closeSheet(); readIdShot(crop, blob); }
    } finally { camBusy = false; $('shutter').disabled = false; $('scanShot').disabled = false; camCheck(false); if (seq === camSeq && scanStep() && !$('camera').hidden) finderStart(); }
  }
  /** Reads the ID photo twice (the box, and the ID found around it); the ID is filled only when both readings agree. Otherwise
      the readings are offered as chips and the ID photo opens for a tap on the ID or a box round it. */
  async function readIdShot(crop, blob) {
    if (!ed) return;
    const token = ed.ocrToken = uid(); renderIdCands('reading');
    let a = [], b = [];
    try { a = await readIdFrom(crop); if (crop._second) b = await readIdFrom(crop._second); } catch (e) { LOG.warn('idshot.read.fail', errInfo(e)); }
    if (!ed || ed.ocrToken !== token) return;
    const ta = a[0], tb = b[0], list = mergeIds(a, b), same = !!(ta && tb && ta.id === tb.id), best = same ? (ta.score >= tb.score ? ta : tb) : null;
    LOG.info('idshot.read', { a: ta ? `${ta.id} ${ta.conf}` : '', b: tb ? `${tb.id} ${tb.conf}` : '', same });
    if (best && best.conf >= (best.fits ? 55 : 80)) {
      $('poleId').value = best.id; ed.idTouched = true; ed.idRead = { id: best.id, conf: best.conf }; syncFromId(); checkDup();
      const rest = list.filter((c) => c.id !== best.id && (c.fits || c.conf >= 60));
      renderIdCands('done', rest, `Filled ${best.id} from the ID photo (read the same twice, ${best.conf}% sure) — check it.${rest.length ? ' Other readings:' : ''}`);
      return;
    }
    renderIdCands('done', list, list.length ? `${ta && tb ? 'The two readings of the ID photo differ' : 'Not read for sure'}: tap the right ID below, or tap the ID on the photo.` : undefined);
    if (editorSaving || pvOpen || stack[stack.length - 1] !== 'editor') return; // v2.21: not over a save, another sheet or a photo already open
    pvReadBlob = null; showBlob(blob, 'ID photo'); pvReadBlob = blob; setPhotoRead(true);
    toast(list.length ? 'Not read for sure: tap the ID on the photo (or close it and pick a reading)' : 'ID not read: tap the ID on the photo, or draw a box round it', 4500);
  }
  async function openCamera(target) {
    camTarget = target || 'new'; camPending = null; camSeq++; finder.manual = false; photoReadNext = false; // the box turns by itself until H / V is tapped
    openSheet('camera'); startGps();
    $('camMsg').hidden = true; $('camTorch').hidden = true; $('qualBox').hidden = true; camCheck(false);
    showGuide();
    if ((camTarget === 'new' && readIdOn()) || camTarget === 'scan') ocrWarm();
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
      if ((caps.focusMode || []).includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}); // v2.17: keep refocusing
      LOG.info('camera.focus', { modes: caps.focusMode || null, poi: !!(track.getSettings && 'pointsOfInterest' in track.getSettings()) });
      $('camTorch').hidden = !caps.torch;
      zoomCaps = caps.zoom && (caps.zoom.max > (caps.zoom.min || 1) * 1.2 || caps.zoom.min < 0.95) ? caps.zoom : null; zoomLevel = 1; $('video').style.transform = '';
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
    camPending = pending; camTarget = 'newid'; shotDraft(pending); // v2.21: the photo is kept while the ID is scanned
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
        if (q && q.flags && q.flags.length) { draftClear(); toast(`${QUAL_TITLE[q.flags[0]] || 'Photo not accepted'}. ${QUAL_TEXT[q.flags[0]] || 'Take it again.'}`, 7000); return; }
        gotPhoto(p.blob, p.gps, p.source || 'camera', { q, takenAt: p.takenAt, crop: p.crop || null, live: p.live || null, idShot: p.idShot || null });
      }, 0);
    }
  }
  function camCheck(text) { $('camCheck').hidden = !text; if (text) $('camCheckText').textContent = text; }
  $('camClose').addEventListener('click', () => closeSheet());
  $('camReadId').addEventListener('click', () => {
    const on = !readIdOn(), k = isAcc() ? 'readIdAcc' : 'readId'; S[k] = on; persist(); showGuide();
    toast(on ? `After each photo you will be asked to scan the ID${isAcc() ? ' (PAT, cleanup and FAT)' : ''}` : `ID scan after each photo turned off${isAcc() ? ' for PAT, cleanup and FAT' : ''}`, 2600);
  });
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
    const vr = v.getBoundingClientRect(), st0 = $('camStage').getBoundingClientRect();
    const gr = finder.user ? { left: st0.left + finder.user.x, top: st0.top + finder.user.y, width: finder.user.w, height: finder.user.h } : g.getBoundingClientRect(); // v2.17: a swiped box as marked
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
  /* v2.28: 1× is the main camera; a camera that zooms out below 1 (its wide lens, e.g. 0.5×) offers 0.5× too */
  const zoomBase = () => (zoomCaps ? (zoomCaps.min < 0.95 ? 1 : zoomCaps.min || 1) : 1);
  const zoomMin = () => (zoomCaps && zoomCaps.min < 0.95 ? Math.max(0.3, zoomCaps.min) : 1);
  const zoomMax = () => (zoomCaps ? Math.min(10, zoomCaps.max / zoomBase()) : scanStep() ? 4 : 1);
  async function setZoom(z) {
    const nz = Math.max(zoomMin(), Math.min(zoomMax(), z || 1));
    if (Math.abs(nz - zoomLevel) > 0.05 && finder.on) { finder.box = null; finder.user = null; finder.read = null; finder.agree = 0; finder.stable = 0; guideReset(); finderLabel('Looking for the ID…'); } // a reading from before the zoom no longer matches the box
    zoomLevel = nz;
    const v = $('video');
    if (zoomCaps && stream) {
      if (zoomBusy) { zoomWant = zoomLevel; renderZoomBar(); return; } // a pinch sends many steps: keep only the last
      zoomBusy = true;
      try {
        const base = zoomBase(), step = zoomCaps.step || 0.1;
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
    bar.querySelectorAll('button').forEach((b) => { const z = +b.dataset.z, on = Math.abs(z - zoomLevel) < 0.05; b.hidden = z > max + 0.01 || z < zoomMin() - 0.01; b.setAttribute('aria-pressed', String(on)); preset = preset || on; });
    $('zoomVal').hidden = preset; $('zoomVal').textContent = `${zoomLevel.toFixed(1)}×`;
  }
  $('zoomBar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setZoom(+b.dataset.z); });
  /* pinch to zoom; a tap points the ID reader (and the focus, where the camera allows it) at that spot */
  const camPtrs = new Map(); let pinch0 = null, tap0 = null, swipe = null;
  const ptrDist = () => { const [a, b] = [...camPtrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  $('camStage').addEventListener('pointerdown', (e) => {
    if (e.target.closest('#zoomBar')) return;
    camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (camPtrs.size === 2) { pinch0 = { d: ptrDist(), z: zoomLevel }; tap0 = null; swipe = null; drawRect($('swipeLine'), null); } else tap0 = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  $('camStage').addEventListener('pointermove', (e) => {
    if (!camPtrs.has(e.pointerId)) return;
    camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch0 && camPtrs.size === 2) setZoom(pinch0.z * ptrDist() / pinch0.d);
    else if (tap0 && camPtrs.size === 1 && scanStep() && (swipe || Math.hypot(e.clientX - tap0.x, e.clientY - tap0.y) > 20)) { // v2.18: a drag draws a box round the ID
      swipe = { x0: tap0.x, y0: tap0.y, x1: e.clientX, y1: e.clientY }; drawRect($('swipeLine'), swipe, $('camStage').getBoundingClientRect());
    }
  });
  const ptrEnd = (e) => {
    if (!camPtrs.has(e.pointerId)) return;
    camPtrs.delete(e.pointerId);
    if (camPtrs.size < 2) pinch0 = null;
    if (swipe) { const sw = swipe; swipe = null; drawRect($('swipeLine'), null); if (e.type === 'pointerup' && !camPtrs.size) markDrawn(sw); }
    else if (tap0 && e.type === 'pointerup' && Math.hypot(e.clientX - tap0.x, e.clientY - tap0.y) < 12 && Date.now() - tap0.t < 450) camTap(e.clientX, e.clientY);
    tap0 = null;
  };
  $('camStage').addEventListener('pointerup', ptrEnd); $('camStage').addEventListener('pointercancel', ptrEnd);
  function camTap(cx, cy) {
    const st = $('camStage').getBoundingClientRect(), nx = (cx - st.left) / st.width, ny = (cy - st.top) / st.height;
    const ring = $('tapRing'); ring.hidden = true; void ring.offsetWidth; ring.style.left = `${cx - st.left}px`; ring.style.top = `${cy - st.top}px`; ring.hidden = false;
    finder.focus = { x: nx, y: ny, until: Date.now() + 6000 }; finder.box = null; finder.read = null; finder.agree = 0; finder.user = null;
    focusAt(cx, cy); // the camera focuses there, on phones that allow it
  }
  /** The box being drawn between two corners (el: #swipeLine on the camera, #pvMark on the photo); sw null hides it. rel: the parent's box. */
  function drawRect(el, sw, rel) {
    if (!sw) { el.hidden = true; return; }
    const ox = rel ? rel.left : 0, oy = rel ? rel.top : 0, r = rectOf(sw);
    el.hidden = false; Object.assign(el.style, { left: `${r.x - ox}px`, top: `${r.y - oy}px`, width: `${r.w}px`, height: `${r.h}px` });
  }
  /** Two corners -> {x, y, w, h, v}: v (a vertical ID) when the box is taller than wide. */
  const rectOf = (sw) => { const x = Math.min(sw.x0, sw.x1), y = Math.min(sw.y0, sw.y1), w = Math.abs(sw.x1 - sw.x0), h = Math.abs(sw.y1 - sw.y0); return { x, y, w, h, v: h > w }; };
  const clipBox = (b, W, H) => { const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y), x1 = Math.min(W, b.x + b.w), y1 = Math.min(H, b.y + b.h); return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0), v: b.v }; };
  /** A box drawn round the ID on the camera (v2.18; a swipe in v2.17): the box stays where it was drawn (no searching), a taller
      than wide box means a vertical ID, the camera focuses on it, and what is in it is read until the ID is clear. A tap, a new
      box or a zoom change releases it. */
  function markDrawn(sw) {
    const st = $('camStage').getBoundingClientRect(), b = rectOf({ x0: sw.x0 - st.left, y0: sw.y0 - st.top, x1: sw.x1 - st.left, y1: sw.y1 - st.top });
    if (b.w < 24 || b.h < 24) return;
    // room round the drawn box, mostly across the ID (a box drawn tight on the characters still reads)
    const ps = Math.min(b.w, b.h) * 0.25 + 6, pl = Math.max(b.w, b.h) * 0.05 + 4, padX = b.v ? ps : pl, padY = b.v ? pl : ps;
    const box = clipBox({ x: b.x - padX, y: b.y - padY, w: b.w + 2 * padX, h: b.h + 2 * padY, v: b.v }, st.width, st.height); if (box.w < 20 || box.h < 20) return;
    S.idOrient = b.v ? 'v' : 'h'; persist(); setOrientUi();
    Object.assign(finder, { manual: true, user: { x: box.x, y: box.y, w: box.w, h: box.h }, box: { x: box.x, y: box.y, w: box.w, h: box.h }, stable: 2, read: null, list: null, agree: 0, way: null, misses: 0, flip: 0, flipS: 0, focus: null, lastOcrAt: 0 });
    $('idGuide').classList.add('fixed'); guidePlace(finder.box); finderLabel(b.v ? 'Reading the boxed ID (vertical)…' : 'Reading the boxed ID…');
    focusAt(st.left + box.x + box.w / 2, st.top + box.y + box.h / 2);
    LOG.info('finder.box', { v: b.v, w: Math.round(box.w), h: Math.round(box.h) });
  }
  /** v2.17: the camera focuses (and sets the light) on a point given in screen pixels, then after a few seconds focuses by
      itself again. Phones that do not allow it simply ignore it. */
  let focusTimer = 0;
  function focusAt(cx, cy) {
    const v = $('video'); if (!stream || !v.videoWidth) return;
    const vr = v.getBoundingClientRect(), sc = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    const ox = vr.left + (vr.width - v.videoWidth * sc) / 2, oy = vr.top + (vr.height - v.videoHeight * sc) / 2;
    const x = Math.max(0, Math.min(1, (cx - ox) / sc / v.videoWidth)), y = Math.max(0, Math.min(1, (cy - oy) / sc / v.videoHeight)); // in the camera picture, not the screen
    const track = stream.getVideoTracks()[0], caps = track.getCapabilities ? track.getCapabilities() : {}, modes = caps.focusMode || [];
    const one = { pointsOfInterest: [{ x, y }] }; if (modes.includes('single-shot')) one.focusMode = 'single-shot';
    track.applyConstraints({ advanced: [one] }).catch(() => track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }] }] }).catch(() => {}));
    clearTimeout(focusTimer);
    if (modes.includes('continuous')) focusTimer = setTimeout(() => { if (stream) stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}); }, 6000);
  }

  /* ================= live ID reader ================= */
  /* While the ID is scanned, the box follows the painted ID like a face-detection box: a few times a second a small copy
     of the picture is searched for a row (or column) of high-contrast strokes, and the best one near the centre (or near
     where you tapped) gets the box. When the box holds still, the text inside is read in the background; the reading is
     shown on the box, and when the same known-format ID is read twice it is used by itself (Settings → Camera). */
  const STEADY = 6; // mean grey change per frame below which the picture counts as steady (v2.17; set on test pictures, check the App log on phones)
  const finder = { on: false, timer: 0, box: null, score: 0, misses: 0, stable: 0, reading: false, lastOcrAt: 0, read: null, list: null, crop: null, agree: 0, focus: null, cv: null, n: 0, ms: 0, vway: 0, way: null, reads: 0, t0: 0, flip: 0, manual: false };
  function finderStart() {
    if (finder.on || !stream) return;
    Object.assign(finder, { glyphHits: 0, on: true, box: null, score: 0, misses: 0, stable: 0, read: null, list: null, crop: null, agree: 0, n: 0, ms: 0, way: null, reads: 0, flip: 0, flipS: 0, user: null, prev: null, motion: null, mSum: 0, mN: 0, held: 0, t0: performance.now() });
    ocrWorker(); finderLabel('Looking for the ID…'); finderTick();
  }
  function finderStop() {
    if (finder.on && finder.n) LOG.info('finder', { frames: finder.n, avgMs: Math.round(finder.ms / finder.n), reads: finder.reads, ms: Math.round(performance.now() - finder.t0), read: finder.read ? finder.read.id : null, motion: finder.mN ? +(finder.mSum / finder.mN).toFixed(1) : null, held: finder.held, swipe: !!finder.user, glyph: finder.glyphHits || 0 });
    finder.on = false; clearTimeout(finder.timer); finder.focus = null; guideReset(); $('scanPrompt').classList.remove('found');
  }
  function finderLabel(t, got) { $('idGuideText').textContent = t; $('idGuide').classList.toggle('got', !!got); }
  function guideReset() { const g = $('idGuide'); g.classList.remove('track', 'got', 'fixed'); g.style.left = g.style.top = g.style.width = g.style.height = g.style.right = ''; }
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
    const px = g.getImageData(0, 0, W, H).data;
    // v2.17: how much the picture moved since the last frame (mean change of a coarse grey copy). Reading waits for a steady
    // picture, so the crop is sharp, but never more than 1.5 s, so a shaky hand still gets a reading
    { const gw = Math.floor(W / 3), gh = Math.floor(H / 3), cur = new Uint8Array(gw * gh), prev = finder.prev && finder.prev.length === cur.length ? finder.prev : null;
      let diff = 0;
      for (let y = 0, k = 0; y < gh; y++) for (let x = 0; x < gw; x++, k++) { const j = (y * 3 * W + x * 3) * 4; cur[k] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8; if (prev) diff += Math.abs(cur[k] - prev[k]); }
      finder.prev = cur;
      if (prev) { const m = diff / cur.length; finder.motion = finder.motion == null ? m : finder.motion * 0.5 + m * 0.5; finder.mSum += m; finder.mN++; } }
    const steady = finder.motion == null || finder.motion < STEADY || Date.now() - finder.lastOcrAt > 1500;
    const readNow = () => {
      if (finder.reading || Date.now() - finder.lastOcrAt <= (nativeReader() || glyphOn() ? 120 : 220)) return;
      if (!steady) { finder.held++; if (!finder.read) finderLabel('Hold steady…'); return; }
      liveRead(orient);
    };
    if (finder.user) { // v2.17: the ID marked with a swipe: the box stays where the swipe put it, nothing is searched
      finder.box = { ...finder.user }; guidePlace(finder.box); $('scanPrompt').classList.add('found');
      readNow(); return;
    }
    // v2.16: a tag painted downwards (characters one above the other) is looked for near the centre, at twice the detail;
    // found while the box is horizontal it turns the box (unless H / V was tapped for this scan), and in vertical mode it
    // places the box, as cables beside the tag can draw the column box off it
    const odd = finder.n % 2 === 1, auto = !finder.manual && !finder.read;
    const stack = orient === 'v' || (auto && !odd) ? stackLook(v, vx, vy, vw, vh, focus, W / vw) : null; // in H: every other frame
    let cand = orient === 'v' && stack && stack.n >= 4 ? { ...stack, stack: true } : C.findIdBox(px, W, H, orient, focus);
    if (auto) {
      let other = null, why = null;
      // a column of five or more characters, seen twice, turns a horizontal box
      if (orient === 'h' && !odd) { finder.flipS = stack && stack.n >= 5 ? (finder.flipS || 0) + 1 : 0; if (finder.flipS >= 2) { other = 'v'; why = { stack: stack.n }; } }
      if (odd && !(cand && cand.stack)) { // the other frames: the other way round is searched too, and a clearly better box there turns it
        const o2 = orient === 'v' ? 'h' : 'v', alt = C.findIdBox(px, W, H, o2, focus);
        const better = alt && alt.score >= 4 && alt.score > 1.3 * (cand ? cand.score : 0) && !(cand && cand.stack);
        finder.flip = better ? (finder.flip || 0) + 1 : 0;
        if (finder.flip >= 2) { other = o2; why = { score: alt.score, was: cand ? cand.score : 0 }; }
      }
      if (other) {
        S.idOrient = other; persist(); LOG.info('finder.turn', { to: other, ...why });
        Object.assign(finder, { flip: 0, flipS: 0, box: null, read: null, list: null, agree: 0, stable: 0, way: null, misses: 0 });
        guideReset(); setOrientUi(); finderLabel(other === 'v' ? 'Vertical ID: box turned' : 'Horizontal ID: box turned');
        return;
      }
    }
    const k = st.width / W; // the visible picture fills the camera area
    if (cand) {
      const padL = (orient === 'h' ? cand.w * 0.1 : cand.w * 0.35) + 4, padS = (orient === 'h' ? cand.h * 0.35 : cand.h * 0.06) + 4;
      // a column of characters gets room above and below: a character the search missed is still in the box to read
      const px = cand.stack ? cand.w * 0.6 + 4 : orient === 'h' ? padL : padS, py = cand.stack ? cand.h * 0.25 + 4 : orient === 'h' ? padS : padL;
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
    if (finder.box && finder.stable >= 1) readNow();
  }
  /** A column of upright characters near the centre (or the tap) of the camera picture, searched at about twice the detail of
      the box finder (a tag's characters are only a few pixels tall there). The box comes back in the finder's frame pixels. */
  function stackLook(v, vx, vy, vw, vh, focus, toF) {
    const fx = focus ? focus.x : 0.5, fy = focus ? focus.y : 0.45, rw = vw * 0.44, rh = vh * 0.8;
    const rx = Math.max(vx, Math.min(vx + vw - rw, vx + vw * fx - rw / 2)), ry = Math.max(vy, Math.min(vy + vh - rh, vy + vh * fy - rh / 2));
    const SW = Math.max(40, Math.min(200, Math.round(rw))), SH = Math.max(40, Math.round(SW * rh / rw));
    if (!finder.scv) finder.scv = document.createElement('canvas');
    const cv = finder.scv; if (cv.width !== SW || cv.height !== SH) { cv.width = SW; cv.height = SH; }
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(v, rx, ry, rw, rh, 0, 0, SW, SH);
    const s = C.findStack(g.getImageData(0, 0, SW, SH).data, SW, SH, null, true);
    if (!s) return null;
    const k = rw / SW; // search pixels → video pixels
    return { x: (rx - vx + s.x * k) * toF, y: (ry - vy + s.y * k) * toF, w: s.w * k * toF, h: s.h * k * toF, n: s.n, score: s.score };
  }
  async function liveRead(orient) {
    finder.reading = true; finder.lastOcrAt = Date.now();
    const box = finder.box && { ...finder.box };
    try {
      const crop = grabGuideCrop(); if (!crop) return;
      if (!finder.read) finderLabel('Reading…');
      // a vertical ID is either a column of upright characters or a sideways line: the way that read the last ID is tried
      // first, the others in turn until one reads, then that way is kept
      finder.reads++;
      // v2.20: the app's own character network first (a few milliseconds); the text reader only when it reads nothing sure
      if (glyphOn()) {
        const gres = glyphReadCanvas(crop, orient === 'v' ? 'v' : 'h', true); // live: no search for raised letters (slow)
        if (gres.length) {
          const gl = C.idCandidates(gres, lastIdForShape(), idOpts()), gb = gl[0];
          if (gres[0].cut) { if (!finder.read) finderLabel('Reading… keep the whole ID in the box'); }
          else if (gb && gb.fits && gb.conf >= 80 && (gb.exact || /X/.test(gb.id))) { liveUse(gb, gl, crop, orient, null, !/[A-Z]/.test(gres[0].words.map((w) => w.text).join('').replace(/X/g, ''))); finder.glyphHits = (finder.glyphHits || 0) + 1; return; }
        }
        if ((finder.glyphHits || 0) > 0 && finder.reads % 3) return; // the network has read this ID before: the slow reader only now and then
      }
      const VW = ['stacked', 'cw', 'ccw'], v0 = Math.max(0, VW.indexOf(S.vWay));
      const way = orient !== 'v' ? 'line' : finder.way || VW[(v0 + finder.vway++) % 3];
      // v2.16: a column of characters is set out as a line first; only when none is found is the column read as it is
      const strip = way === 'stacked' ? stackToLine(crop) : null, column = way === 'stacked' && !strip;
      const src = way === 'cw' ? rotated(crop, 90) : way === 'ccw' ? rotated(crop, -90) : strip || crop;
      let r = null;
      if (nativeReader()) { try { r = strip ? await readStrip(strip, true) : await nativeRead(src); } catch (e) { r = null; } } // ML Kit in the Android app
      if (!r && strip) r = await readStrip(strip, false);
      if (!r) {
        // a smaller picture reads about twice as fast and as well: the text reader scales each line to ~40 px anyway
        const png = column ? await prepStacked(crop, 160) : await prepForOcr(src, strip ? strip.height : 112);
        r = await ocrRun(png, column ? 6 : 7, { thresholding_method: 0 });
      }
      if (!finder.on || !r.ok || !finder.box || iou(box, finder.box) < 0.4) return; // the box moved on meanwhile
      const list = C.idCandidates([column ? { ...r, stacked: true } : r], lastIdForShape(), idOpts()), best = list[0];
      // v2.16: a column read only in part (cut off by the box, or fewer characters read than the column has) is not used
      const said = (r.words || []).filter((w) => w.conf >= 20).map((w) => w.text).join('').replace(/[^A-Za-z0-9-]/g, '');
      if (best && strip && (strip._cut || said.length < strip._chars - 1)) { if (!finder.read) finderLabel('Reading… keep the whole ID in the box'); return; }
      const numOnly = !!best && !/[A-Za-z]/.test(said); // painted without a prefix: two matching readings, never one
      if (best && best.fits && best.conf >= 55) liveUse(best, list, crop, orient, way, numOnly);
      else if (!finder.read) finderLabel('Reading… zoom in or tap the ID');
    } catch (e) { LOG.warn('finder.read.fail', errInfo(e)); }
    finally { finder.reading = false; }
  }
  /** A live reading of a known ID format: shown on the box; used by itself when it is clear enough or read the same twice. */
  function liveUse(best, list, crop, orient, way, numOnly) {
    finder.agree = finder.read && finder.read.id === best.id ? finder.agree + 1 : 1;
    const prev = finder.read; finder.read = best; finder.list = list; finder.crop = crop;
    if (orient === 'v' && way) { finder.way = way; S.vWay = way; }
    finderLabel(`${best.id} · ${best.conf}%`, true);
    // one clear reading of a known ID is enough; otherwise the same ID read twice
    if (S.idAuto !== false && ((best.exact && best.conf >= 85 && !numOnly) || (finder.agree >= 2 && Math.min(best.conf, prev ? prev.conf : 0) >= 65))) acceptLive();
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
      if (camTarget === 'new' && readIdOn()) { // aim at the ID straight away; the photo is checked meanwhile
        const pend = { blob, gps, takenAt, source: 'camera', qp };
        enterIdStep(pend);
        qp.then((q) => {
          pend.q = q;
          if (!q.flags.length || camPending !== pend || !alive()) return; // fine, or the ID step already ended (checked when the photo is used)
          camPending = null; finderStop(); camTarget = 'new'; showGuide(); refusePhoto(blob, q); draftClear();
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
    if (camTarget === 'new' && readIdOn() && stream && inCam()) { enterIdStep({ blob: f, gps, q, takenAt, source: 'camera' }); return; }
    if (inCam()) await closeSheet();
    gotPhoto(f, gps, 'camera', { q, takenAt });
  });
  /** For a scan taken with the phone camera app: the band where the guide box would be. */
  async function centerCrop(blob) {
    try {
      const im = await loadImage(blob), { w, h } = dims(im);
      const band = (v) => {
        const cv = document.createElement('canvas'); cv.width = Math.round(w * (v ? 0.26 : 0.8)); cv.height = Math.round(h * (v ? 0.58 : 0.22));
        cv.getContext('2d').drawImage(im, v ? w * 0.37 : w * 0.1, v ? h * 0.15 : h * 0.4, cv.width, cv.height, 0, 0, cv.width, cv.height);
        cv._orient = v ? 'v' : 'h'; return cv;
      };
      const v = S.idOrient === 'v', cv = band(v);
      cv._alt = band(!v); // v2.16: read the other way round too when the first way finds no clear ID (a vertical tag in horizontal mode)
      if (im.close) im.close();
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
    openEditor({ mode: 'new', blob, gps, source, takenAt: x.takenAt || new Date().toISOString(), q: qSummary(x.q), crop: x.crop, live: x.live, idShot: x.idShot, noDef: camTarget === 'nodef' });
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
  /** What the reader needs to know: the prefix for a number-only tag, and the owners' names that stand for a prefix (v2.18). */
  const idOpts = () => ({ numPrefix: numPrefixNow(), names: Object.fromEntries(poleTypes().map((t) => [String(t.n).toUpperCase().replace(/[^A-Z]/g, ''), t.p]).filter(([n]) => n.length >= 3)) });
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
  /** v2.16: an ID painted as a column of upright characters (0-4-3-0-6-2-1 down a pole tag) set out as one line, black on
      white: each character is cut out of the crop and put beside the one before. Both readers read a line far better than a
      column, and the pole's edge, cables and leaves beside the tag are left out. null when no column of characters is found. */
  function stackToLine(src) {
    const sc = Math.min(3, 300 / src.width, 900 / src.height), W = Math.max(8, Math.round(src.width * sc)), H = Math.max(8, Math.round(src.height * sc));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    // dark paint on a light tag, or light paint on a dark pole: the reading that makes the cleaner column of characters
    const rd = C.stackRows(px, W, H, false), rl = C.stackRows(px, W, H, true);
    const r = !rd ? rl : !rl ? rd : (rl.even > rd.even || (rl.even === rd.even && rl.rows.length > rd.rows.length)) ? rl : rd;
    if (!r) return null;
    const k = 44 / r.medH, gap = Math.round(r.medH * 0.16 * k), pad = 22, one = document.createElement('canvas'), og = one.getContext('2d');
    const line = (rows) => { // the characters side by side, black on white, centred on one line (a dash stays in the middle)
      const ws = rows.map((q) => Math.max(1, Math.round((q.x1 - q.x0 + 1) * k))), hs = rows.map((q) => Math.max(1, Math.round((q.y1 - q.y0 + 1) * k)));
      const out = document.createElement('canvas');
      out.width = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1) + 2 * pad; out.height = Math.max(...hs) + 2 * pad;
      const o = out.getContext('2d'); o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height); o.imageSmoothingQuality = 'high';
      let x = pad;
      rows.forEach((q, i) => {
        const w = q.x1 - q.x0 + 1, h = q.y1 - q.y0 + 1; one.width = w; one.height = h;
        const id = og.createImageData(w, h);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const v = r.ink[(q.y0 + yy) * W + q.x0 + xx] ? 0 : 255, j = (yy * w + xx) * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; }
        og.putImageData(id, 0, 0);
        o.drawImage(one, x, pad + Math.round((out.height - 2 * pad - hs[i]) / 2), ws[i], hs[i]);
        x += ws[i] + gap;
      });
      return out;
    };
    const out = line(r.rows);
    out._n = r.rows.length; out._chars = r.rows.length + (r.hidden || 0); out._cut = r.rows[0].y0 <= 1 || r.rows[r.rows.length - 1].y1 >= H - 2; // a character may be outside the crop
    if (r.hidden) { // v2.18: characters hidden by a cable or dirt: the parts around them are read one by one and joined with X
      const parts = [[]], gaps = [];
      r.rows.forEach((q) => { if (q.hidden) { parts.push([]); gaps.push(q.hidden); } parts[parts.length - 1].push(q); });
      out._parts = parts.map(line); out._gaps = gaps; out._partN = parts.map((x) => x.length);
    }
    return out;
  }
  /** Reads a strip from stackToLine with ML Kit (native) or Tesseract. With hidden characters, each part is read on its own and
      the readings are joined with an X for each hidden character (v2.18): one word, the least sure part's confidence. */
  async function readStrip(strip, native) {
    const scaled = (cv, f) => { const c = document.createElement('canvas'); c.width = Math.round(cv.width * f); c.height = Math.round(cv.height * f); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, c.width, c.height); return c; };
    // try 0: as drawn; 1: at 80 % (the reader can add a character at one size and not at another); 2: as one word (Tesseract)
    const one = async (cv, t) => (native ? nativeRead(t ? scaled(cv, 0.8) : cv) : ocrRun(await prepForOcr(cv, Math.round(cv.height * (t === 1 ? 0.8 : 1))), t === 2 ? 8 : 7, { thresholding_method: 0 }));
    const said = (o) => (o.words || []).filter((w) => w.conf >= 20).map((w) => w.text).join('').replace(/[^A-Za-z0-9-]/g, '');
    const minConf = (o) => { const cs = (o.words || []).filter((w) => w.conf >= 20).map((w) => w.conf); return cs.length ? Math.min(...cs) : 0; };
    // the column says how many characters there are: a reading with extra marks (a stencil's loose piece read as a letter,
    // "a4" for 4) keeps its digits when that gives the right count (v2.18)
    const fit = (t, n) => { if (!n || t.length === n) return t; const d = t.replace(/[^0-9]/g, ''); return d.length === n ? d : t; };
    // a reading with more characters than the column has, or two fewer, is not this ID (a mark read twice, a part missed)
    const counts = (t, n) => !n || (t.length <= n && t.length >= n - 1);
    /** Reads one strip until a reading has the right count (at most three tries). -> {o, text} or {o, text: null} */
    const readCounted = async (cv, n) => {
      let o = null;
      for (let t = 0; t < (native ? 2 : 3); t++) {
        o = await one(cv, t); if (!o.ok) return { o, text: null };
        const f = fit(said(o), n);
        if (f && counts(f, n) && (n !== 1 || f.length === 1)) return { o, text: f, conf: minConf(o) * (t ? 0.95 : 1) };
      }
      return { o, text: null, miscount: said(o) };
    };
    if (!strip._parts) {
      const r = await readCounted(strip, strip._n);
      if (!r.o.ok) return r.o;
      if (r.text == null) return { ok: true, words: [], text: '', miscount: r.miscount };
      return { ok: true, words: [{ text: r.text, conf: Math.round(r.conf), line: 'strip' }], text: r.text };
    }
    const reads = [];
    for (let i = 0; i < strip._parts.length; i++) { const r = await readCounted(strip._parts[i], strip._partN[i]); if (!r.o.ok) return r.o; if (r.text == null) return { ok: true, words: [], text: '' }; reads.push(r); }
    const text = reads.map((r, i) => r.text + (i < strip._gaps.length ? 'X'.repeat(strip._gaps[i]) : '')).join('');
    return { ok: true, words: [{ text, conf: Math.round(Math.min(...reads.map((r) => r.conf))), line: 'x-0' }], text, hidden: strip._gaps.reduce((a, b) => a + b, 0) };
  }
  /** Readings of two crops in one list (best first, each ID once). */
  const mergeIds = (a, b) => { const m = new Map(); [...a, ...b].forEach((c) => { const p = m.get(c.id); if (!p || p.score < c.score) m.set(c.id, c); }); return [...m.values()].sort((x, y) => y.score - x.score).slice(0, 5); };
  const sureId = (list) => !!(list.length && list[0].fits && list[0].conf >= 70);
  /* ---- v2.20: the app's own character network (core.js; weights in glyphs.js) ---- */
  if (window.PoleGlyphModel && C.setGlyphModel) C.setGlyphModel(window.PoleGlyphModel);
  const glyphOn = () => !!(C.glyphReady && C.glyphReady());
  /** Reads the ID in a canvas with the character network: orient 'v' a column of upright characters, else a line (or two lines:
      an owner's name over the number). -> results for idCandidates ([] when nothing is read). */
  function glyphReadCanvas(cv, orient, quick) {
    if (!glyphOn() || !cv || !cv.width || !cv.height) return [];
    const run = (sc) => {
      const w = Math.max(8, Math.round(cv.width * sc)), h = Math.max(8, Math.round(cv.height * sc));
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
      const g = c2.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, w, h);
      try { return C.glyphRead(g.getImageData(0, 0, w, h).data, w, h, orient, quick) || []; } catch (e) { LOG.warn('glyph.fail', errInfo(e)); return []; }
    };
    let res = run(Math.min(1, 900 / Math.max(cv.width, cv.height)));
    // a column read with a hidden or missing character, or not at all: once more at the size the column reader likes best
    // (a narrow crop is enlarged, as for the text reader); the reading with fewer X, then the surer one, is kept
    const xs = (rs) => (rs.length ? (rs[0].words[0].text.match(/X/g) || []).length + (rs[0].partial ? 2 : 0) : 9);
    if (orient === 'v' && xs(res) > 0) {
      const s2 = Math.min(3, 300 / cv.width, 900 / cv.height);
      if (s2 > 1.2) { const r2 = run(s2); if (xs(r2) < xs(res) || (xs(r2) === xs(res) && r2.length && (!res.length || r2[0].words[0].conf > res[0].words[0].conf))) res = r2; }
    }
    return res;
  }
  /** Two readers' lists as one: an ID both read is worth more. */
  const agreeIds = (a, b) => { const m = new Map(); a.forEach((c) => m.set(c.id, { ...c })); b.forEach((c) => { const p = m.get(c.id); if (p) { p.score += 15; p.conf = Math.max(p.conf, c.conf); p.both = true; } else m.set(c.id, { ...c }); }); return [...m.values()].sort((x, y) => y.score - x.score).slice(0, 5); };
  async function readIdFrom(canvas) {
    const v = canvas._orient === 'v', t0 = performance.now();
    let gres = glyphReadCanvas(canvas, v ? 'v' : 'h');
    if (v && !gres.length) gres = glyphReadCanvas(rotated(canvas, -90), 'h'); // a line turned sideways
    const glist = gres.length ? C.idCandidates(gres, lastIdForShape(), idOpts()) : [];
    if (glyphOn()) LOG.info('glyph.read', { ms: Math.round(performance.now() - t0), v, top: glist[0] ? `${glist[0].id} ${glist[0].conf}` : '', how: gres[0] ? gres[0].how || (gres[0].stacked ? 'column' : '') : '' });
    // an ID in a known format read exactly as painted, every character at 80 % or more: the text reader is not needed
    if (glist.length && glist[0].exact && glist[0].conf >= 80 && !(gres[0] && (gres[0].cut || gres[0].partial))) return glist;
    const list = await readIdText(canvas);
    // the network's other readings are offered, but count for less than the text reader's (only an exact, sure one is filled by itself)
    return glist.length ? agreeIds(list, glist.map((c) => (c.conf >= 80 && c.exact ? c : { ...c, conf: Math.round(c.conf * 0.6), score: c.score - 25 }))) : list;
  }
  async function readIdText(canvas) {
    const v = canvas._orient === 'v', strip = v ? stackToLine(canvas) : null, opts = idOpts();
    const alt = async (list) => (!sureId(list) && canvas._alt ? mergeIds(list, await readIdFrom(canvas._alt)) : list); // the other way round (v2.16)
    if (nativeReader()) { // ML Kit: the column set out as a line, the crop as it is, and turned both ways for a vertical ID
      try {
        const nres = [];
        if (strip) nres.push(await readStrip(strip, true));
        if (v) { nres.push({ ...(await nativeRead(canvas)), stacked: true }); for (const deg of [-90, 90]) nres.push(await nativeRead(rotated(canvas, deg))); }
        else nres.push(await nativeRead(canvas));
        const list = await alt(C.idCandidates(nres, lastIdForShape(), opts));
        if (list.length) return list;
      } catch (e) { LOG.warn('mlkit.read.fail', errInfo(e)); } // Tesseract below
    }
    const res = [];
    const run = async (png, psm, thr, extra) => {
      const r = await ocrRun(png, psm, { thresholding_method: thr });
      if (!r.ok) throw new Error(r.error);
      res.push({ ...r, ...(extra || {}) });
    };
    if (v) {
      // vertical IDs: characters stacked upright (set out as a line first; read top to bottom), or the whole ID turned sideways
      if (strip) {
        const sr = await readStrip(strip, false); if (!sr.ok) throw new Error(sr.error); res.push(sr);
        const first = C.idCandidates(res, lastIdForShape(), opts);
        if (sureId(first) || strip._parts) return first; // with hidden characters (X) the column is what there is to read
      }
      // (the adaptive threshold turns a column of characters into noise, so stacked IDs use two sizes instead)
      for (const w of [200, 140]) await run(await prepStacked(canvas, w), 6, 0, { stacked: true });
      for (const deg of [-90, 90]) await run(await prepForOcr(rotated(canvas, deg)), 6, 0);
    } else {
      // pass 1: Tesseract's global threshold; pass 2: adaptive (Sauvola) threshold for shadows on round poles
      const png = await prepForOcr(canvas);
      for (const thr of [0, 2]) await run(png, 6, thr);
    }
    return alt(C.idCandidates(res, lastIdForShape(), opts));
  }
  /** The ID reading: the other possible IDs as chips; what the reader says sits behind an ⓘ (v2.15, less text on screen). */
  function renderIdCands(state, list, note) {
    if (ed && ed.acc) foldOpen('idGroup', true); // v2.22: a reading to check is shown
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
        return { filled: best.id, list };
      }
      renderIdCands('done', list);
      return { filled: null, list };
    } catch (e) {
      if (ed && ed.ocrToken === token) renderIdCands('error', [], `Could not read the ID (${e.message}). Type it instead.`);
      return null;
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
    const title = titleText || (p.kind !== 'acceptance' && elemOf(p) !== 'Pole' ? `${p.poleId}  ·  ${svDesc(p, svPurpose(p.project))}` : `${recName(p)}  ·  ${p.poleType}`);
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
      description: title.replace(/\s+·\s+/g, ' | '), title: recName(p), date: new Date(when), artist: exporterLine(' | ') });
  }
  /** File name for an exported photo per the naming setting. */
  function photoFileName(p, label) {
    const id = C.safeName(isRef(p) ? recName(p).replace(/\s+/g, '') : p.poleId), t = (p.takenAt || '').replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
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
    pinMap.on('moveend', () => { if (ed && ed.dragged) scheduleDraft(); }); // v2.21
    pinMap.on('moveend', () => { if (ed && ed.plan) applyPlan(); }); // v2.26.1: the planned element nearest the pin
    pinMap.on('dragstart zoomstart', () => { if (ed) ed.userMoved = true; });
    pinMap.on('dragstart', () => { if (ed) ed.dragged = true; $('edHint').classList.add('gone'); });
    /* v2.30: the pin is the centre of the small map. When the map changes size (the keyboard opens or closes, Bigger map,
       the record shown again), the same spot is put back under the pin, so the pin never drifts from where it was set. */
    pinMap.on('moveend', () => { if (!pinResizing && pinMap._loaded) { const c = pinMap.getCenter(); pinSpot = { lat: c.lat, lng: c.lng, z: pinMap.getZoom() }; } });
    const keep = () => {
      const el = $('pinMap'); if (!el.clientWidth || !el.clientHeight || !pinSpot) return; // hidden: nothing to keep yet
      pinResizing = true;
      try { pinMap.invalidateSize({ animate: false, pan: false }); pinMap.setView([pinSpot.lat, pinSpot.lng], pinSpot.z, { reset: true }); } finally { pinResizing = false; }
    };
    if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(keep)).observe($('pinMap'));
    ['touchstart', 'mousedown', 'wheel'].forEach((k) => $('pinMap').addEventListener(k, () => { if (ed) ed.userMoved = true; }, { passive: true })); // a touch on the map: the GPS no longer moves the pin
  }
  let pinSpot = null, pinResizing = false;
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
    setTimeout(foldSum, 0); // v2.22: the folded Element details line
    if (ed.plan) setTimeout(applyPlan, 0); // v2.26.1: the planned element with this ID
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
    // v2.19: in PAT, cleanup and FAT an empty ID (or only the prefix) is fine: the record is saved as D-0001…
    if (ed.acc && (!id || DREF_RE.test(id) || new RegExp(`^(${prefixAlt()})-?$|^FDU_?$`).test(id))) msg = '';
    else if (id && kind === 'Pole' && poleIdXRe().test(id)) msg = 'X = a character the camera could not read. Type it if you can see it on the tag, or keep the X.';
    // v2.18: the ID after the prefix may mix letters and digits (CC-0123A); only one with no digit at all is flagged
    else if (id && kind === 'Pole' && !isNpt(id) && !poleIdRe().test(id) && !PP_RE.test(id) && !new RegExp(`^(${prefixAlt()})-(?=[A-Z0-9-]*[0-9])[A-Z0-9][A-Z0-9-]*$`).test(id)) { const pm = polePartRe().exec(id); msg = pm && !pm[2] ? `Add the pole number after the prefix, e.g. ${pm[1]}-${PAD4.includes(pm[1]) ? '0001' : '1234'}.` : `Pole IDs are a prefix, a dash and the number: ${poleTypes().map((t) => `${t.p}-`).join(', ')}. For another owner, tap “+ Other prefix”.`; }
    else if (id && kind === 'ODF' && !ODF_ID_RE.test(id)) msg = /^FDU_?$/.test(id) ? 'Add the ODF number after FDU_, e.g. FDU_100.' : 'ODF IDs are written FDU_ and a number, e.g. FDU_100.';
    el.hidden = !msg; el.textContent = msg;
    if (msg && ed.acc) foldOpen('idGroup', true); // v2.22: a warning is not left in a closed section
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
    if (ed.gps && ed.gps.acc != null && (ed.gps.acc <= fix.acc || ed.gps.acc <= 15)) return; // v2.30: a photo with a usable fix keeps its pin (it no longer creeps as the GPS improves)
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
    if (other && ed && ed.acc) foldOpen('idGroup', true);
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
      takenAt: o.takenAt, type: o.type || S.lastType, userMoved: false, acc, boq: JSON.parse(JSON.stringify(o.boq || {})) };
    // v2.16: 'closed' = a completed PAT (view only); 'carried' = an element from the PAT in the cleanup or FAT (fixes only)
    ed.lock = !acc ? '' : patClosed() ? 'closed' : o.mode === 'edit' && ['Cleanup', 'FAT'].includes(taskCat()) && (o.patId || (o.defs || []).some((d) => (d.stage || 'PAT') === 'PAT')) ? 'carried' : '';
    if (acc) {
      Object.assign(ed, { element: o.element || 'Pole', photos: (o.photos || []).map((p) => ({ ...p })), pending: {}, removed: [], details: JSON.parse(JSON.stringify(o.details || [])),
        defs: JSON.parse(JSON.stringify(o.defs || [])), mloop: !!o.mloop, nap: !!o.nap, closure: !!o.closure, odf: o.odf || 'New', newBlob: null });
      // v2.13: in PAT, cleanup and FAT the photo is of the defect itself (no pole / ODF photo): it becomes the as-found photo
      // of the deficiency started below. A phone that may not record deficiencies keeps it as the element photo.
      ed.noDef = !!o.noDef && o.mode === 'new'; // v2.23: the site photo of a PAT where no defect was found
      if (o.blob && (ed.noDef || !(o.mode === 'new' && canRecord()))) { const pid = uid(); ed.photos.unshift({ pid, label: ed.noDef ? 'Site (no defects found)' : 'Overview', ...photoMeta(o.gps, o.takenAt), q: o.q || null }); ed.pending[pid] = o.blob; }
      $('napId').value = o.napId || ''; $('closureId').value = o.closureId || '';
    } else { // survey point (v2.13): pole, site, ODC, ODF, NAP, closure or handhole
      const mk = Array.isArray(o.marks) ? o.marks : [];
      Object.assign(ed, { element: o.element || 'Pole', status: o.status || (o.mode === 'new' ? svDefaultStatus(o.element || 'Pole') : ''), srcBlob: o.blob || o.storedBlob || null, details: JSON.parse(JSON.stringify(o.details || [])),
        marks: JSON.parse(JSON.stringify(mk)).map(normMark), origPid: o.origPid || '', legacyBoxes: Math.max(0, (o.boxes || 0) - mk.length), legacyPole: !!o.poleModel && !mk.some((m) => m.k === 'pole'), base: null, baseNew: false, dropOrig: false });
      $('svRemarks').value = o.remarks || ''; $('svClosureId').value = o.closureId || '';
    }
    $('editorTitle').textContent = acc ? (o.mode === 'edit' ? 'Edit element' : 'New element') : (o.mode === 'edit' ? 'Edit pole' : 'New pole');
    $('edHint').textContent = `Drag the map to place the pin on the ${acc ? 'element' : 'pole'}`;
    $('edHint').classList.remove('gone'); clearTimeout(hintTimer); hintTimer = setTimeout(() => $('edHint').classList.add('gone'), 5000);
    $('edHint').hidden = acc; // v2.15: not shown in PAT, cleanup and FAT, where the pin is the element you stand at
    $('pinMapWrap').classList.toggle('big', !!S.pinBig); $('pinSizeBtn').setAttribute('aria-pressed', String(!!S.pinBig));
    ['accPhotos', 'defBox'].forEach((x) => { $(x).hidden = !acc; }); $('accElementBox').hidden = false;
    // v2.19: in PAT, cleanup and FAT the deficiencies are at the top; the element's ID, type, details and what is on the pole are optional
    $('editor').classList.toggle('acc', acc); $('idGroupTitle').textContent = acc ? 'Element details · optional' : 'Identification';
    foldInit(acc); // v2.22: the optional sections start closed
    $('attachTitle').textContent = acc ? 'On this pole · optional' : 'On this pole';
    $('surveyTypeBox').hidden = ed.element !== 'Pole'; $('edPhoto').hidden = acc; $('nptBtn').hidden = ed.element !== 'Pole';
    ['svStatusBox', 'svClosureBox', 'svRemarksBox'].forEach((x) => { $(x).hidden = acc; });
    $('accPhotos').closest('.group').hidden = false; // v2.21 fix: renderAccPhotos hides this group (it holds the survey photo too) for a PAT record without element photos; it stayed hidden for the next survey record
    if (!acc) { $('poleAttach').hidden = true; $('odfBox').hidden = true; }
    $('defPanel').hidden = true; $('addDefBtn').hidden = false;
    $('queueNote').textContent = '';
    $('saveIssue').hidden = true;
    $('edDelete').hidden = o.mode !== 'edit'; $('delConfirm').hidden = true;
    $('edSkip').hidden = true; $('edRetake').hidden = acc;
    $('edRetake').textContent = o.mode === 'edit' ? 'New photo' : 'Retake';
    $('edSave').textContent = 'Save';
    $('poleId').value = o.poleId != null ? (acc && DREF_RE.test(o.poleId) ? '' : o.poleId) : suggestId(ed.element || 'Pole', ed.type); // v2.22: no D-0001 in the form
    ed.idTouched = o.poleId != null;
    ed.q = o.q || null; showQualWarn(ed.q); $('idCands').hidden = true; $('idNote').hidden = true;
    renderTypeChips(ed.type);
    renderElemChips(); applyElement(); renderBoxInfo();
    if (acc) { renderAccPhotos(); renderDefs(); }
    $('noDefNote').hidden = !(acc && ed.noDef);
    if (acc && o.mode === 'new' && canRecord() && !ed.noDef) { // the defect form is ready, with the photo just taken as its as-found photo
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
    checkFormat(); applyEdLock();
    ed.boqTouched = !!o.restore; // v2.26.1: a restored record keeps its sizes
    if (!acc && boqOn() && svPurpose() === 'As-built') { const eid = ed.id; planFor().then((pl) => requestAnimationFrame(() => { if (ed && ed.id === eid) { ed.plan = pl || { none: true, name: '', recs: [] }; applyPlan(); } })).catch((e) => LOG.warn('plan.fail', errInfo(e))); }
    foldSum(); // v2.22: after the ID and element are set
    draftStart(!!o.restore); // v2.21: kept safe until saved
    if (photoReadNext && o.mode === 'new' && !acc && o.blob) { photoReadNext = false; setTimeout(openPhotoRead, 400); } // v2.17: the picture button
    else if (o.live) applyLiveRead(o.live);
    else if (o.crop && o.idShot) readIdShot(o.crop, o.idShot); // v2.19: the ID photo
    else if (o.crop) runOcrFor(o.crop, true);
    else if (o.mode === 'new' && !o.poleId && !acc) setTimeout(() => { const f = $('poleId'); f.classList.add('nudge'); setTimeout(() => f.classList.remove('nudge'), 2600); }, 250); // v2.30: no keyboard over the map: check the pin, then tap the ID
  }
  /* ================= v2.21: an unsaved record is kept safe =================
     While a record is open, what it holds (the photo, the form, the pin, the deficiencies and their photos) is kept as a draft on
     the phone: in the photo store (pictures, ids draft~…) and in localStorage (the rest). A page reload, the phone closing the app in
     the background, or the app being closed some other way loses nothing: the next start offers the record again. */
  const DRAFT_KEY = 'polecam.draft', DRAFT_MAX_MS = 7 * 86400000;
  let draftTimer = 0, draftChain = Promise.resolve(), draftBlobs = {}, draftAtStart = 0;
  try { const st0 = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); draftAtStart = (st0 && st0.t) || 0; } catch (e) { draftAtStart = 0; } // the draft left from before this start
  /** A photo taken, the camera still open for the ID: kept as a draft too, so a reload during the ID scan does not lose it. */
  function shotDraft(p) {
    if (!p || !p.blob || ed) return;
    const st = { v: 1, t: Date.now(), shot: true, project: S.project, mode: 'new', acc: isAcc(), element: 'Pole', gps: p.gps || null, takenAt: p.takenAt || '', source: p.source || 'camera', hasNew: true };
    draftBlobs = {};
    draftChain = draftChain.then(async () => {
      try { await dbPut('photos', { id: 'draft~new', clean: p.blob }); localStorage.setItem(DRAFT_KEY, JSON.stringify(st)); } catch (e) { LOG.warn('draft.fail', errInfo(e)); }
    });
  }
  function draftState() {
    if (!ed) return null;
    const c = pinMap && pinMap.getCenter();
    const dd = defDraft && !$('defPanel').hidden ? { cat: defDraft.cat, items: [...defDraft.items], sev: defDraft.sev, notes: $('defNotes').value, meta: defDraft.meta || null, photo: !!defDraft.blob } : null;
    return {
      v: 1, project: S.project, mode: ed.mode, id: ed.id, acc: !!ed.acc, element: ed.element || 'Pole', type: ed.type || '', status: ed.status || '',
      poleId: $('poleId').value, napId: $('napId').value, closureId: $('closureId').value, svRemarks: $('svRemarks').value, svClosureId: $('svClosureId').value,
      details: ed.details || [], marks: ed.marks || [], defs: ed.defs || [], photos: ed.photos || [], removed: ed.removed || [],
      mloop: !!ed.mloop, nap: !!ed.nap, closure: !!ed.closure, odf: ed.odf || '', boq: ed.boq || {}, gps: ed.gps || null, takenAt: ed.takenAt || '', source: ed.source || '', q: ed.q || null,
      idRead: ed.idRead || null, idTouched: !!ed.idTouched, dragged: !!ed.dragged, pin: ed.dragged && c ? { lat: c.lat, lon: c.lng } : null,
      origPid: ed.origPid || '', legacyBoxes: ed.legacyBoxes || 0, legacyPole: !!ed.legacyPole, dropOrig: !!ed.dropOrig, baseNew: !!ed.baseNew, keepQ: !!ed.keepQ,
      noDef: !!ed.noDef, pend: Object.keys(ed.pending || {}), hasNew: !!ed.newBlob, hasSrc: !!ed.srcBlob && ed.srcBlob !== ed.newBlob, hasBase: !!ed.base, def: dd,
    };
  }
  const draftSig = (st) => JSON.stringify({ ...st, q: null, pin: st.pin ? [st.pin.lat.toFixed(6), st.pin.lon.toFixed(6)] : null });
  /** Unsaved changes: a new record always (its photo is not stored yet); an opened one when anything differs from how it opened. */
  function edDirty() {
    if (!ed || ed.lock === 'closed') return false;
    if (ed.mode === 'new') return true;
    if (!ed.sig0) return false;
    const st = draftState(); return !!st && draftSig(st) !== ed.sig0;
  }
  function saveDraft() {
    clearTimeout(draftTimer);
    if (!ed || ed.lock === 'closed' || !edDirty()) return draftChain;
    const st = draftState(); st.t = Date.now();
    const blobs = { new: ed.newBlob, src: st.hasSrc ? ed.srcBlob : null, base: ed.base, def: st.def && st.def.photo ? defDraft.blob : null };
    Object.entries(ed.pending || {}).forEach(([pid, b]) => { blobs[`p:${pid}`] = b; });
    draftChain = draftChain.then(async () => {
      try {
        for (const [k, b] of Object.entries(blobs)) {
          if (!b || draftBlobs[k] === b) continue;
          await dbPut('photos', { id: `draft~${k}`, clean: b }); draftBlobs[k] = b;
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify(st));
      } catch (e) { LOG.warn('draft.fail', errInfo(e)); }
    });
    return draftChain;
  }
  const scheduleDraft = () => { if (!ed) return; clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 700); };
  function draftClear() {
    clearTimeout(draftTimer); draftBlobs = {};
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* private window */ }
    draftChain = draftChain.then(() => tx('photos', 'readwrite', (st) => st.delete(IDBKeyRange.bound('draft~', 'draft~\uffff'))).catch(() => {}));
    return draftChain;
  }
  /** After a record opens: an older draft goes; a new record's photo is kept at once; an opened one is compared from now on. */
  function draftStart(restoring) {
    if (!restoring) { draftClear(); }
    if (!ed) return;
    if (ed.mode === 'new') saveDraft();
    setTimeout(() => { if (ed && !ed.sig0) { const st = draftState(); if (st) ed.sig0 = draftSig(st); } }, 900); // after the pin and the readings settle
  }
  $('editor').addEventListener('input', scheduleDraft);
  $('editor').addEventListener('change', scheduleDraft);
  $('editor').addEventListener('click', scheduleDraft);
  document.addEventListener('visibilitychange', () => { if (document.hidden && ed) saveDraft(); });
  window.addEventListener('pagehide', () => { if (ed) saveDraft(); });
  // a reload or closing the tab with unsaved changes: the browser asks first (the draft is kept either way)
  window.addEventListener('beforeunload', (e) => { if (ed && !ed.closeOK && edDirty()) { saveDraft(); e.preventDefault(); e.returnValue = ''; } });
  /** The phone's Back or × on a record with unsaved changes. */
  async function askLeaveEditor() {
    const isNew = ed.mode === 'new';
    const go = await ask(isNew ? 'Leave without saving?' : 'Leave without saving the changes?', isNew ? 'The photo and what you entered are not saved yet.' : 'What you changed in this record is not saved yet.',
      [{ label: 'Keep editing', value: false, primary: true }, { label: isNew ? 'Discard the record' : 'Discard the changes', value: true }]);
    if (!go || !ed) return;
    ed.closeOK = true; closeSheet();
  }
  /** At start: a record that was not saved (reload, the app closed) is offered again. */
  async function draftOffer() {
    if (!draftAtStart) return;
    let st = null; try { st = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { st = null; }
    if (!st || !st.t || st.t !== draftAtStart) return; // only the draft left from before this start; a record opened since has its own
    if (ed || editorSaving || stack.includes('camera')) { setTimeout(() => guard(draftOffer, 'Unsaved record not opened'), 1500); return; } // asked once the camera is closed
    draftAtStart = null;
    if (Date.now() - st.t > DRAFT_MAX_MS || !allProjects().includes(st.project) || (st.mode === 'edit' && !points.some((p) => p.id === st.id))) { draftClear(); return; }
    const what = `${st.mode === 'new' ? 'A new' : 'Changes to the'} ${st.acc ? 'element' : (st.element || 'Pole').toLowerCase()}${st.poleId && !/^[A-Z]{1,6}[-_]?$/.test(st.poleId) ? ` ${st.poleId}` : ''} in “${st.project}” (${fmtTime(new Date(st.t).toISOString())})`;
    LOG.info('draft.offer', { mode: st.mode, acc: st.acc, age: Math.round((Date.now() - st.t) / 60000) });
    const ok = await ask('Unsaved record', `${what} was not saved: the app was closed or the page reloaded before Save. Open it again?`,
      [{ label: 'Discard', value: false }, { label: 'Open it', value: true, primary: true }]);
    if (!ok) { draftClear(); return; }
    try { await draftRestore(st); } catch (e) { LOG.error('draft.restore.fail', errInfo(e)); toast(`The unsaved record could not be opened: ${e.message || e}`, 6000); }
  }
  async function draftRestore(st) {
    const get = async (k) => { const r = await dbGet('photos', `draft~${k}`).catch(() => null); return (r && r.clean) || null; };
    const nb = st.hasNew ? await get('new') : null, sb = st.hasSrc ? await get('src') : null, base = st.hasBase ? await get('base') : null, db = st.def && st.def.photo ? await get('def') : null;
    const pend = {}; for (const pid of st.pend || []) { const b = await get(`p:${pid}`); if (b) pend[pid] = b; }
    if (S.project !== st.project) { S.project = st.project; persist(); renderPoles(); fitProject(); }
    if (st.shot) { // the page reloaded during the ID scan: the photo goes on as if the scan was skipped (checked again first)
      if (!nb) throw new Error('the photo was not kept');
      const q = await withTimeout(checkQuality(nb), 15000, 'slow').catch(() => null);
      if (q && q.flags && q.flags.length) { draftClear(); toast(`${QUAL_TITLE[q.flags[0]] || 'Photo not accepted'}. ${QUAL_TEXT[q.flags[0]] || 'Take it again.'}`, 7000); return; }
      camTarget = 'new'; gotPhoto(nb, st.gps, st.source || 'camera', { q, takenAt: st.takenAt });
      return;
    }
    if (st.mode === 'edit') { await openEditorFor(st.id, true); if (ed) { const s0 = draftState(); if (s0) ed.sig0 = draftSig(s0); } } // changes are counted from the record as stored
    else {
      await openEditor({ mode: 'new', id: st.id, restore: true, gps: st.gps, takenAt: st.takenAt, source: st.source, q: st.q, type: st.type || undefined, element: st.element, status: st.status,
        poleId: st.poleId, remarks: st.svRemarks, closureId: st.acc ? st.closureId : st.svClosureId, napId: st.napId, details: st.details, marks: st.marks, origPid: st.origPid,
        photos: st.photos, defs: st.defs, mloop: st.mloop, nap: st.nap, closure: st.closure, odf: st.odf, boq: st.boq || {}, boxes: (st.legacyBoxes || 0) + (st.marks || []).length, poleModel: st.legacyPole,
        blob: st.acc ? null : nb || sb, noDef: !!st.noDef, ...(st.pin ? { lat: st.pin.lat, lon: st.pin.lon } : {}) });
    }
    if (!ed) return;
    Object.assign(ed, { pending: { ...ed.pending, ...pend }, removed: st.removed || [], idRead: st.idRead, idTouched: st.idTouched, dragged: st.dragged, element: st.element, type: st.type || ed.type,
      status: st.status || ed.status, details: st.details || [], defs: st.defs || ed.defs, photos: st.acc ? st.photos || ed.photos : ed.photos, marks: st.acc ? ed.marks : (st.marks || []).map(normMark),
      mloop: st.mloop, nap: st.nap, closure: st.closure, odf: st.odf || ed.odf, boq: st.boq || ed.boq || {}, legacyBoxes: st.legacyBoxes, legacyPole: st.legacyPole, dropOrig: st.dropOrig, keepQ: st.keepQ, origPid: st.origPid || ed.origPid });
    if (!st.acc) {
      if (nb) { ed.newBlob = nb; prepImages(nb); showEdPhoto(nb); }
      if (sb) ed.srcBlob = sb; else if (nb && st.mode === 'new') ed.srcBlob = nb;
      ed.base = base; ed.baseNew = st.baseNew;
    }
    $('poleId').value = st.poleId; $('napId').value = st.napId; $('closureId').value = st.closureId; $('svRemarks').value = st.svRemarks; $('svClosureId').value = st.svClosureId;
    $('napId').hidden = !st.nap; $('closureId').hidden = !st.closure;
    if (st.def) {
      if (!defDraft || $('defPanel').hidden) startDefDraft(false);
      defDraft.cat = st.def.cat; defDraft.items = new Set(st.def.items || []); defDraft.sev = st.def.sev || 'Minor';
      renderDefPanel(); $('defNotes').value = st.def.notes || '';
      if (db) setDefPhoto(db, st.def.meta || {});
    } else if (defDraft) { defDraft = null; $('defPanel').hidden = true; $('addDefBtn').hidden = false; }
    renderTypeChips(ed.type); renderElemChips(); applyElement(); renderDetails(); renderBoxInfo();
    if (st.acc) { renderAccPhotos(); renderDefs(); }
    if (ed.mode === 'edit' && st.pin) pinMap.setView([st.pin.lat, st.pin.lon], pinMap.getZoom(), { animate: false });
    checkDup(); checkFormat(); applyEdLock();
    LOG.info('draft.restored', { mode: st.mode, acc: st.acc, photos: Object.keys(pend).length + (nb ? 1 : 0) });
    toast('The unsaved record is open again: check it, then Save', 4500);
    saveDraft();
  }
  async function openEditorFor(id, restoring) {
    const p = points.find((x) => x.id === id); if (!p) return;
    if (p.kind === 'acceptance' || isAcc(p.project)) {
      openEditor({ mode: 'edit', id, poleId: p.poleId, type: p.poleType || undefined, lat: p.lat, lon: p.lon, takenAt: p.takenAt, source: p.source,
        gps: p.gpsLat != null ? { lat: p.gpsLat, lon: p.gpsLon, acc: p.accuracy } : { lat: p.lat, lon: p.lon, acc: p.accuracy }, // records from before v1.3 keep no raw fix: the pin stands in
        element: elemOf(p), photos: p.photos || [], defs: p.defs || [], mloop: p.mloop, nap: p.nap, napId: p.napId, closure: p.closure, closureId: p.closureId, odf: p.odf, patId: p.patId || '', details: p.details || [] });
      return;
    }
    const ph = await dbGet('photos', id).catch(() => null);
    openEditor({ mode: 'edit', id, poleId: p.poleId, type: p.poleType, lat: p.lat, lon: p.lon, takenAt: p.takenAt,
      gps: p.gpsLat != null ? { lat: p.gpsLat, lon: p.gpsLon, acc: p.accuracy } : null, storedBlob: ph ? (ph.clean || ph.thumb) : null, source: p.source,
      element: elemOf(p), status: p.status || '', remarks: p.remarks || '', closureId: p.closureId || '', boxes: p.boxes || 0, details: p.details || [], marks: p.marks || [], origPid: p.origPid || '', poleModel: !!p.poleModel });
  }
  function cleanupEditor() {
    if (ed) { if (!ed.closeOK && edDirty()) saveDraft(); else draftClear(); }
    ed = null; showEdPhoto(null); revokeEdUrls(); defDraft = null; applyEdLock();
  }
  /** v2.16: what the lock allows in the editor. Closed (completed PAT): every field is read only and nothing can be saved.
      Carried (from the PAT, in the cleanup or FAT): the ID, element, type and pin stay; fixes, photos and remarks are made. */
  function applyEdLock() {
    const lock = (ed && ed.lock) || '', root = $('editor');
    root.classList.toggle('locked', lock === 'closed'); root.classList.toggle('carried', lock === 'carried');
    root.querySelectorAll('[data-lk]').forEach((el) => { el.disabled = false; delete el.dataset.lk; });
    const off = (el) => { if (el && !el.disabled) { el.disabled = true; el.dataset.lk = '1'; } };
    if (lock === 'closed') root.querySelectorAll('.edbody input, .edbody select, .edbody textarea, #snapGps').forEach(off);
    if (lock === 'carried') ['poleId', 'elemSel', 'typeSel', 'odfSel', 'atMloop', 'atNap', 'atClosure', 'napId', 'closureId', 'snapGps'].forEach((id) => off($(id)));
    if (pinMap) { if (lock) pinMap.dragging.disable(); else pinMap.dragging.enable(); }
    const m = pmeta(), note = $('edLock');
    note.hidden = !lock;
    note.textContent = lock === 'closed' ? `🔒 PAT completed${m.completedAt ? ` ${longDate(m.completedAt)}` : ''}: this record can't be changed or removed. Its items are tagged as fixed in the defect cleanup and the FAT.`
      : lock === 'carried' ? '🔒 From the PAT: the ID, place and PAT items stay as recorded. Tag each item as fixed, add photos and remarks.' : '';
    if (lock) { $('edDelete').hidden = true; $('delConfirm').hidden = true; }
  }

  /* ---------- red box / pole model on a survey photo (v2.13; pole model v2.14; editable marks v2.15) ---------- */
  /* Tap the photo, then ▭ Red box or ⊥ Pole model: drag on the photo to draw a red box (the proposed location, the existing ODF
     to use…) or, for a proposed pole, drag from the ground up to place a model pole. Done burns the marks into the photo that
     every export uses. Since v2.15 the unmarked photo and the marks are kept too, so the marks can be selected later and moved,
     resized or deleted. Marks made before v2.15 are part of the photo and stay as they are. */
  let boxer = null;
  const proposedPole = () => ed && !ed.acc && ed.element === 'Pole' && ed.status === 'Proposed';
  /* v2.18: models besides the pole — proposed ODF cabinet, proposed handhole, new tower location. Each is placed like the pole:
     from where it stands (yb) up to its top (yt); for a handhole, from its front edge up to its back edge on the ground.
     half = half its width as a share of that height (for handles and selection). */
  /* v2.19: the cabinet is the ODC (outdoor cabinet; saved before as 'odf'); new: the ODF itself (a rack-mount panel, placed corner
     to corner like a red box: rect) and the data rack it goes in (standing, like the ODC). */
  const MODELS = { pole: { name: 'Proposed pole', label: 'PROPOSED POLE', half: 0.06 }, odc: { name: 'Proposed ODC (outdoor cabinet)', label: 'PROPOSED ODC', half: 0.3, what: 'ODC cabinet' },
    odfp: { name: 'Proposed ODF (rack panel)', label: 'PROPOSED ODF', rect: true }, rack: { name: 'Proposed data rack', label: 'PROPOSED DATA RACK', half: 0.17, what: 'data rack' },
    hh: { name: 'Proposed handhole', label: 'PROPOSED HH', half: 0.9 }, tower: { name: 'New tower location', label: 'NEW TOWER LOCATION', half: 0.17, what: 'tower' } };
  const MODEL_TAG = { odc: 'ODC model', odf: 'ODC model', odfp: 'ODF model', rack: 'data rack model', hh: 'HH model', tower: 'tower model', foc: 'FOC route', text: 'note on photo' };
  const DRAWN = new Set(['foc', 'text']);
  /* v2.28: a colour for every mark: red = proposed (the default), navy blue = existing (the label then says EXISTING), green, orange */
  const MCOL = { red: '#e03131', navy: '#1c3f94', green: '#2f9e44', orange: '#e8590c' };
  let MC = MCOL.red, MX = false;
  const lblFor = (t) => (MX ? String(t).replace(/^(PROPOSED|NEW) /, 'EXISTING ').replace(/ LOCATION$/, '') : t);
  const withC = (m, o) => (m && m.c && m.c !== 'red' ? { ...o, c: m.c } : o); // v2.27: an FOC route drawn by hand and a comment written on the photo
  const normMark = (m) => (m && m.k === 'odf' ? { ...m, k: 'odc' } : m); // marks saved by v2.18
  const isModel = (m) => !!MODELS[m.k];
  const isStand = (m) => !!MODELS[m.k] && !MODELS[m.k].rect; // placed from the ground (yb) up to the top (yt); else a rect (x, y, w, h)
  const modelFor = () => (!ed ? 'pole' : ed.element === 'ODC' ? 'odc' : ed.element === 'ODF' ? 'odfp' : ed.element === 'Handhole' ? 'hh' : ed.element === 'Site' ? 'tower' : 'pole');
  const origPidOf = (id) => `${id}_o`;
  function renderBoxInfo() {
    if (!ed || ed.acc) { $('boxInfo').hidden = true; $('edZoom').classList.remove('pp'); return; }
    const n = (ed.marks || []).length, legacy = ed.legacyBoxes || 0, pp = proposedPole(), hasPole = (ed.marks || []).some((m) => m.k === 'pole') || ed.legacyPole;
    const txt = n ? `▭ ${n} mark${n === 1 ? '' : 's'} on the photo · tap the photo to change them${legacy ? ` (${legacy} older mark${legacy === 1 ? ' is' : 's are'} part of the photo)` : ''}`
      : legacy ? `▭ ${legacy} mark${legacy === 1 ? '' : 's'} on the photo` : pp && !hasPole ? '⊥ Tap the photo to place the model pole where the new pole goes' : '';
    $('boxInfo').textContent = txt; $('boxInfo').hidden = !txt;
    $('edZoom').classList.toggle('pp', !!(pp && !hasPole)); $('edZoom').textContent = pp && !hasPole ? '⊥' : '⤢';
  }
  const BOX_TOOLS = { box: 'boxModeBox', foc: 'boxModeFoc', text: 'boxModeText' };
  function setBoxMode(m) {
    if (!boxer) return; if (!BOX_TOOLS[m] && !MODELS[m]) m = 'pole';
    const model = !!MODELS[m]; if (boxer.mode !== m) boxer.sel = -1; boxer.mode = m; // v2.28: another tool: the next mark is new (its colour from the dots)
    Object.entries(BOX_TOOLS).forEach(([k, id]) => $(id).setAttribute('aria-pressed', String(m === k)));
    $('boxModePole').setAttribute('aria-pressed', String(model)); $('boxModel').hidden = !model;
    if (model) $('boxModel').value = m;
    $('boxTitle').textContent = m === 'box' ? 'Box' : m === 'foc' ? 'FOC route' : m === 'text' ? 'Text on the photo' : `Model: ${MODELS[m].name}`;
    $('boxHint').textContent = m === 'box' ? 'Drag on the photo to draw a box around the spot (the dots set its colour). Tap a mark to move, resize, recolour or delete it.'
      : m === 'foc' ? 'Draw the FOC route with your finger, e.g. from pole to pole, and lift to finish. Tap a route to move or delete it.'
        : m === 'text' ? 'Tap where the comment goes, then type it. Tap a comment to move it; tap it again to change the text.'
          : m === 'hh' ? 'Put your finger on the front edge of the handhole on the ground and drag up to its back edge. Tap a mark to move, resize or delete it.'
            : m === 'odfp' ? 'Drag over the place of the ODF panel. Inside a data rack model it fits between the rails, in whole rack units. Tap a mark to move, resize or delete it.'
              : m === 'rack' ? 'Put your finger where the data rack stands on the floor and drag up to its top: an empty rack. Then add the ODF: Proposed ODF (rack panel), dragged over its place in the rack.'
                : `Put your finger where the ${MODELS[m].what || 'pole'} stands on the ground and drag up to its top. Tap a mark to move, resize or delete it.`;
    drawBoxer();
  }
  function renderSwatches() {
    if (!boxer) return; const m = boxer.marks[boxer.sel], c = m ? m.c || 'red' : boxer.color;
    document.querySelectorAll('#boxColors .sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === c)));
  }
  document.querySelectorAll('#boxColors .sw').forEach((b) => b.addEventListener('click', () => {
    if (!boxer) return; const c = b.dataset.c, m = boxer.marks[boxer.sel];
    if (m) { if (c === 'red') delete m.c; else m.c = c; } // the selected mark changes colour
    boxer.color = c; S.markColor = c; persist(); drawBoxer();
    toast(c === 'navy' ? 'Navy blue: an EXISTING element (its label says EXISTING)' : c === 'red' ? 'Red: a PROPOSED element' : `${b.getAttribute('aria-label')}`, 2200);
  }));
  $('boxModeBox').addEventListener('click', () => setBoxMode('box'));
  $('boxModeFoc').addEventListener('click', () => setBoxMode('foc'));
  $('boxModeText').addEventListener('click', () => setBoxMode('text'));
  $('boxModePole').addEventListener('click', () => setBoxMode($('boxModel').value || modelFor()));
  $('boxModel').addEventListener('change', () => setBoxMode($('boxModel').value));
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
    boxer = { im, w, h, base: src, marks: (ed.marks || []).map(normMark).map((m) => withC(m, m.k === 'foc' ? { k: 'foc', pts: (m.pts || []).map(([x, y]) => [x * w, y * h]) } : m.k === 'text' ? { k: 'text', x: m.x * w, y: m.y * h, t: m.t || '', s: m.s || 1 }
      : isStand(m) ? { k: m.k, x: m.x * w, yb: m.yb * h, yt: m.yt * h } : { k: isModel(m) ? m.k : 'box', x: m.x * w, y: m.y * h, w: m.w * w, h: m.h * h })), sel: -1, op: null, drag: null, mode: 'box', color: MCOL[S.markColor] ? S.markColor : 'red' };
    if (pvOpen) { pvOpen = false; hidePhotoView(); const el = $('boxer'); el.hidden = false; el.style.zIndex = 1000 + stack.length; stack.push('boxer'); history.replaceState({ sheet: 'boxer' }, ''); LOG.info('open', 'boxer'); }
    else openSheet('boxer');
    setBoxMode(mode === 'model' ? modelFor() : mode || (proposedPole() ? 'pole' : 'box'));
    requestAnimationFrame(() => { sizeBoxer(); drawBoxer(); });
  }
  $('pvBox').addEventListener('click', (e) => { e.stopPropagation(); guard(() => openBoxer('box'), 'Red box not opened'); });
  $('pvPole').addEventListener('click', (e) => { e.stopPropagation(); guard(() => openBoxer('model'), 'Model not opened'); });
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
    g.save(); g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = MC;
    const sh = g.createLinearGradient(x - wb / 2, 0, x + wb / 2, 0); // light from the left: round, not flat
    sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.92)'); sh.addColorStop(1, 'rgba(190,190,190,0.75)');
    g.fillStyle = sh;
    g.beginPath(); g.moveTo(x - wb / 2, yb); g.lineTo(x - wt / 2, yt); g.ellipse(x, yt, wt / 2, wt * 0.18, 0, Math.PI, 0); g.lineTo(x + wb / 2, yb); g.ellipse(x, yb, wb / 2, wb * 0.18, 0, 0, Math.PI); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(x, yt, wt / 2, wt * 0.18, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill(); g.stroke(); // round top
    g.beginPath(); g.ellipse(x, yb, wb * 1.5, wb * 0.45, 0, 0, Math.PI * 2); g.stroke(); // where it stands
    const fs = Math.max(12, H * 0.055); g.font = `700 ${fs}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
    g.lineWidth = Math.max(3, fs * 0.22); g.strokeStyle = '#ffffff'; g.strokeText(lblFor('PROPOSED POLE'), x, yb + wb * 0.6); g.fillStyle = MC; g.fillText(lblFor('PROPOSED POLE'), x, yb + wb * 0.6);
    g.restore();
  }
  /** The model's name under it, red on a white outline (as the pole's). */
  function modelLabel(g, text, x, y, size) {
    const fs = Math.max(12, size); g.font = `700 ${fs}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
    text = lblFor(text); g.lineWidth = Math.max(3, fs * 0.22); g.strokeStyle = '#ffffff'; g.strokeText(text, x, y); g.fillStyle = MC; g.fillText(text, x, y);
  }
  /** A proposed ODC (outdoor cabinet) standing at (x, yb), its top at yt: cabinet with a cap, two doors and a plinth. */
  function drawOdcModel(g, x, yb, yt, lw) {
    const H = Math.max(10, yb - yt), W = H * 0.55, cap = H * 0.06, pl = H * 0.08;
    g.save(); g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = MC;
    const sh = g.createLinearGradient(x - W / 2, 0, x + W / 2, 0); sh.addColorStop(0, 'rgba(255,255,255,0.88)'); sh.addColorStop(1, 'rgba(200,200,200,0.8)');
    g.fillStyle = 'rgba(160,160,160,0.85)'; g.fillRect(x - W / 2 - H * 0.03, yb - pl, W + H * 0.06, pl); g.strokeRect(x - W / 2 - H * 0.03, yb - pl, W + H * 0.06, pl); // plinth
    g.fillStyle = sh; g.fillRect(x - W / 2, yt + cap, W, H - cap - pl); g.strokeRect(x - W / 2, yt + cap, W, H - cap - pl); // body
    g.fillStyle = 'rgba(235,235,235,0.95)'; g.fillRect(x - W / 2 - H * 0.025, yt, W + H * 0.05, cap); g.strokeRect(x - W / 2 - H * 0.025, yt, W + H * 0.05, cap); // cap
    g.beginPath(); g.moveTo(x, yt + cap); g.lineTo(x, yb - pl); g.stroke(); // two doors
    g.lineWidth = Math.max(1, lw * 0.8); g.beginPath(); g.moveTo(x - H * 0.05, yt + H * 0.42); g.lineTo(x - H * 0.05, yt + H * 0.55); g.moveTo(x + H * 0.05, yt + H * 0.42); g.lineTo(x + H * 0.05, yt + H * 0.55); g.stroke(); // handles
    modelLabel(g, MODELS.odc.label, x, yb + H * 0.04, H * 0.075);
    g.restore();
  }
  /** A proposed handhole flush with the ground: front edge at yb, back edge at yt, drawn in perspective with its cover. */
  function drawHhModel(g, x, yb, yt, lw) {
    const D = Math.max(8, yb - yt), wf = D * 0.9, wb = D * 0.7; // half widths at the front and the back
    g.save(); g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = MC;
    const quad = (f, b, y0, y1) => { g.beginPath(); g.moveTo(x - f, y0); g.lineTo(x + f, y0); g.lineTo(x + b, y1); g.lineTo(x - b, y1); g.closePath(); };
    quad(wf, wb, yb, yt); g.fillStyle = 'rgba(170,170,170,0.85)'; g.fill(); g.stroke(); // concrete rim
    const i = 0.16, fy = yb - D * i, by = yt + D * i; quad(wf * (1 - i), wb * (1 - i), fy, by); g.fillStyle = 'rgba(90,90,90,0.85)'; g.fill(); g.stroke(); // cover
    g.lineWidth = Math.max(1, lw * 0.7); g.beginPath(); g.moveTo(x, fy); g.lineTo(x, by); g.stroke(); // cover seam
    modelLabel(g, MODELS.hh.label, x, yb + D * 0.1, D * 0.22);
    g.restore();
  }
  /** A new tower (lattice, four legs seen as two) standing at (x, yb) up to yt, with cross bracing and antennas on top. */
  function drawTowerModel(g, x, yb, yt, lw) {
    const H = Math.max(20, yb - yt), bw = H * 0.17, tw = H * 0.035, top = yt + H * 0.1, n = 6;
    const at = (t) => [x - (bw + (tw - bw) * t), x + (bw + (tw - bw) * t), yb + (top - yb) * t]; // left, right, y at height t (0 bottom, 1 top)
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = lw; g.strokeStyle = MC;
    const [l1, r1, y1] = at(1); g.beginPath(); g.moveTo(x - bw, yb); g.lineTo(l1, y1); g.moveTo(x + bw, yb); g.lineTo(r1, y1); g.stroke(); // legs
    g.lineWidth = Math.max(1, lw * 0.6); g.beginPath();
    for (let s2 = 0; s2 < n; s2++) { const [la, ra, ya] = at(s2 / n), [lb, rb, yb2] = at((s2 + 1) / n); g.moveTo(la, ya); g.lineTo(rb, yb2); g.moveTo(ra, ya); g.lineTo(lb, yb2); g.moveTo(lb, yb2); g.lineTo(rb, yb2); } // bracing
    g.stroke(); g.lineWidth = lw;
    g.beginPath(); g.moveTo(x, top); g.lineTo(x, yt); g.stroke(); // mast
    g.fillStyle = 'rgba(255,255,255,0.95)'; [[-1, 0.035], [1, 0.035]].forEach(([sd, off]) => { const ax = x + sd * (tw + H * 0.01); g.fillRect(ax - H * 0.008, yt + H * off, H * 0.016, H * 0.06); g.strokeRect(ax - H * 0.008, yt + H * off, H * 0.016, H * 0.06); }); // panel antennas
    g.beginPath(); g.ellipse(x, yb, bw * 1.3, bw * 0.22, 0, 0, Math.PI * 2); g.stroke(); // footing
    modelLabel(g, MODELS.tower.label, x, yb + bw * 0.3, H * 0.045);
    g.restore();
  }
  /** v2.19: a proposed ODF, rack-mount panel seen from the front, filling the rect (x, y, w, h): rack ears with their screws,
      a label strip and four rows of SC adapters (blue, two blocks of 12 per row). */
  function drawOdfPanel(g, x, y, w, h, lw) {
    g.save(); g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = MC;
    const ear = Math.min(w * 0.05, h * 0.35), px = x + ear, pw = w - ear * 2;
    g.fillStyle = 'rgba(205,205,205,0.92)'; [x, x + w - ear].forEach((ex) => { // rack ears, two screws each
      g.fillRect(ex, y, ear, h); g.strokeRect(ex, y, ear, h);
      g.fillStyle = 'rgba(60,60,60,0.9)'; [0.22, 0.78].forEach((t) => { g.beginPath(); g.arc(ex + ear / 2, y + h * t, Math.max(1.5, ear * 0.2), 0, Math.PI * 2); g.fill(); }); g.fillStyle = 'rgba(205,205,205,0.92)';
    });
    const sh = g.createLinearGradient(0, y, 0, y + h); sh.addColorStop(0, 'rgba(235,235,235,0.95)'); sh.addColorStop(1, 'rgba(185,185,185,0.92)');
    g.fillStyle = sh; g.fillRect(px, y, pw, h); g.strokeRect(px, y, pw, h); // the panel
    const strip = h * 0.14; g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(px + pw * 0.02, y + h * 0.04, pw * 0.96, strip); // label strip
    const rows = 4, per = 12, gap = pw * 0.04, top = y + h * 0.04 + strip + h * 0.05, rh = (y + h * 0.95 - top) / rows, bw = (pw * 0.92 - gap) / 2;
    for (let r = 0; r < rows; r++) for (let b = 0; b < 2; b++) {
      const bx = px + pw * 0.04 + b * (bw + gap), cw = bw / per, ay = top + r * rh + rh * 0.14, ah = rh * 0.72, aw = cw * 0.72;
      for (let i = 0; i < per; i++) { // an SC adapter: blue body, dark port
        const ax = bx + i * cw + (cw - aw) / 2;
        g.fillStyle = '#1c6dd0'; g.fillRect(ax, ay, aw, ah);
        g.fillStyle = 'rgba(20,30,50,0.9)'; g.fillRect(ax + aw * 0.28, ay + ah * 0.25, aw * 0.44, ah * 0.5);
      }
    }
    g.strokeRect(x, y, w, h);
    modelLabel(g, MODELS.odfp.label, x + w / 2, y + h + Math.max(4, h * 0.06), Math.max(h * 0.2, w * 0.035));
    g.restore();
  }
  /** v2.19: a proposed data rack (19-inch cabinet, front view) standing on the floor at (x, yb), its top at yt: frame, top and
      plinth and the mounting rails with their holes. v2.27: empty — the user adds the ODF panel (Proposed ODF) where it goes. */
  function rackInner(m) { // the space between the rails (image pixels) and one rack unit (42U)
    const H = Math.max(20, m.yb - m.yt), W = H * 0.32, l = m.x - W / 2, ri = W * 0.08, rw = W * 0.06, y0 = m.yt + H * 0.04, y1 = m.yb - H * 0.05;
    return { l, r: l + W, t: m.yt, b: m.yb, ux: l + ri + rw, uw: W - 2 * (ri + rw), y0, U: (y1 - y0) / 42 };
  }
  function drawRackModel(g, x, yb, yt, lw) {
    const H = Math.max(20, yb - yt), W = H * 0.32, top = H * 0.04, base = H * 0.05, l = x - W / 2;
    g.save(); g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = MC;
    g.fillStyle = 'rgba(45,45,50,0.82)'; g.fillRect(l, yt, W, H); g.strokeRect(l, yt, W, H); // the cabinet
    g.fillStyle = 'rgba(80,80,88,0.9)'; g.fillRect(l, yt, W, top); g.strokeRect(l, yt, W, top); g.fillRect(l, yb - base, W, base); g.strokeRect(l, yb - base, W, base); // top, plinth
    const ri = W * 0.08, rw = W * 0.06, y0 = yt + top, y1 = yb - base;
    g.fillStyle = 'rgba(170,170,175,0.9)'; [l + ri, l + W - ri - rw].forEach((rx) => { // rails, holes every U
      g.fillRect(rx, y0, rw, y1 - y0);
      g.fillStyle = 'rgba(30,30,30,0.9)'; for (let yy = y0 + H * 0.012; yy < y1; yy += H * 0.022) g.fillRect(rx + rw * 0.3, yy, rw * 0.4, H * 0.006);
      g.fillStyle = 'rgba(170,170,175,0.9)';
    });
    g.strokeRect(l, yt, W, H);
    modelLabel(g, MODELS.rack.label, x, yb + H * 0.02, H * 0.05);
    g.restore();
  }
  /** v2.27: an ODF panel dropped in a data rack model fits between its rails, on whole rack units. */
  function snapToRack(m) {
    if (!boxer || !m || m.k !== 'odfp') return m;
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    const R = boxer.marks.filter((r) => r.k === 'rack').map(rackInner).reverse().find((q) => cx > q.l && cx < q.r && cy > q.t && cy < q.b);
    if (!R) return m;
    const n = Math.max(1, Math.min(42, Math.round(m.h / R.U))), u = Math.max(0, Math.min(42 - n, Math.round((m.y - R.y0) / R.U)));
    return { ...m, x: R.ux, w: R.uw, y: R.y0 + u * R.U, h: n * R.U };
  }
  /** v2.27: an FOC route drawn by hand: a red line with a white edge, its two ends, and PROPOSED FOC at its middle. */
  function drawFocRoute(g, pts, lw) {
    if (!pts || pts.length < 2) return;
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); };
    path(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = lw * 2.4; g.stroke();
    path(); g.strokeStyle = MC; g.lineWidth = lw * 1.1; g.stroke();
    [pts[0], pts[pts.length - 1]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, lw * 1.3, 0, Math.PI * 2); g.fillStyle = MC; g.fill(); g.lineWidth = Math.max(1, lw * 0.5); g.strokeStyle = '#ffffff'; g.stroke(); });
    const L = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(d); tot += d; }
    let half = tot / 2, i = 0; while (i < L.length - 1 && half > L[i]) { half -= L[i]; i++; }
    const t = L[i] ? half / L[i] : 0, mx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, my = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    modelLabel(g, 'PROPOSED FOC', mx, my + lw * 1.6, lw * 3.2);
    g.restore();
  }
  /** v2.27: a comment written on the photo: dark text in a white box with a red edge, its top-left corner at (x, y), kept inside
      the photo. Its size in photo pixels is kept on the mark (to select it). */
  function drawTextNote(g, m, k, lw, full) {
    const fs = Math.max(11, full * k * 0.028 * (m.s || 1)), pad = fs * 0.45, maxW = full * k * 0.5, lh = fs * 1.22;
    g.save(); g.font = `600 ${fs}px sans-serif`; g.textBaseline = 'top'; g.textAlign = 'left';
    const lines = [];
    String(m.t || '').split(/\n/).forEach((para) => { let line = ''; para.split(/\s+/).filter(Boolean).forEach((w) => { const tt = line ? `${line} ${w}` : w; if (line && g.measureText(tt).width > maxW) { lines.push(line); line = w; } else line = tt; }); lines.push(line); });
    const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + pad * 2, bh = lines.length * lh - (lh - fs) + pad * 2;
    const x = Math.max(0, Math.min(m.x * k, g.canvas.width - bw)), y = Math.max(0, Math.min(m.y * k, g.canvas.height - bh)), r = fs * 0.3;
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + bw - r, y); g.quadraticCurveTo(x + bw, y, x + bw, y + r); g.lineTo(x + bw, y + bh - r); g.quadraticCurveTo(x + bw, y + bh, x + bw - r, y + bh);
    g.lineTo(x + r, y + bh); g.quadraticCurveTo(x, y + bh, x, y + bh - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.93)'; g.fill(); g.strokeStyle = MC; g.lineWidth = Math.max(1.5, lw * 0.6); g.stroke();
    g.fillStyle = '#1b1b1b'; lines.forEach((l, i) => g.fillText(l, x + pad, y + pad + i * lh));
    g.restore();
    m._x = x / k; m._y = y / k; m._bw = bw / k; m._bh = bh / k;
  }
  const DRAW_MODEL = { pole: (g, ...a) => drawPoleModel(g, ...a), odc: drawOdcModel, rack: drawRackModel, hh: drawHhModel, tower: drawTowerModel };
  function drawMarks(g, marks, k, lw, full) {
    marks.forEach((m) => {
      MC = MCOL[m.c] || MCOL.red; MX = m.c === 'navy'; // v2.28: the mark's colour; navy = existing
      if (m.k === 'foc') drawFocRoute(g, (m.pts || []).map(([x, y]) => [x * k, y * k]), lw);
      else if (m.k === 'text') drawTextNote(g, m, k, lw, full || g.canvas.width / k);
      else if (isStand(m)) DRAW_MODEL[m.k](g, m.x * k, m.yb * k, m.yt * k, lw);
      else if (m.k === 'odfp') drawOdfPanel(g, m.x * k, m.y * k, m.w * k, m.h * k, lw);
      else { g.strokeStyle = MC; g.lineWidth = lw; g.lineJoin = 'round'; g.strokeRect(m.x * k, m.y * k, m.w * k, m.h * k); }
    });
  }
  /** Handles of a mark, in image pixels: box corners, or the pole's top and foot. */
  const handlesOf = (m) => (DRAWN.has(m.k) ? [] : isStand(m) ? [['top', m.x, m.yt], ['bottom', m.x, m.yb]] : [['nw', m.x, m.y], ['ne', m.x + m.w, m.y], ['sw', m.x, m.y + m.h], ['se', m.x + m.w, m.y + m.h]]);
  /** A mark's outline in photo pixels: [x, y, w, h]. */
  function bboxOf(m) {
    if (m.k === 'foc') { const xs = m.pts.map((p) => p[0]), ys = m.pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; }
    if (m.k === 'text') return [m._x != null ? m._x : m.x, m._y != null ? m._y : m.y, m._bw || 0, m._bh || 0];
    if (isStand(m)) { const wb = (m.yb - m.yt) * MODELS[m.k].half; return [m.x - wb, m.yt, wb * 2, m.yb - m.yt]; }
    return [m.x, m.y, m.w, m.h];
  }
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  function drawBoxer() {
    const b = boxer, cv = $('boxCanvas'); if (!b) return;
    const g = cv.getContext('2d'), k = cv.width / b.w, dpr = window.devicePixelRatio || 1;
    g.drawImage(b.im, 0, 0, cv.width, cv.height);
    drawMarks(g, b.marks.concat(b.drag ? [b.drag] : []), k, Math.max(2, boxLine(b.w, b.h) * k), Math.max(b.w, b.h));
    const m = b.marks[b.sel];
    if (m) { // the selected mark: dashed outline and handles
      g.save(); g.setLineDash([6 * dpr, 4 * dpr]); g.strokeStyle = '#ffffff'; g.lineWidth = 1.5 * dpr;
      const bb = bboxOf(m), pad = DRAWN.has(m.k) ? 6 * dpr : 0; g.strokeRect(bb[0] * k - pad, bb[1] * k - pad, bb[2] * k + pad * 2, bb[3] * k + pad * 2);
      g.setLineDash([]); const r = 7 * dpr;
      handlesOf(m).forEach(([, x, y]) => { g.fillStyle = '#ffffff'; g.strokeStyle = '#e03131'; g.lineWidth = 2 * dpr; g.beginPath(); g.rect(x * k - r, y * k - r, 2 * r, 2 * r); g.fill(); g.stroke(); });
      g.restore();
    }
    $('boxUndo').disabled = !b.marks.length; $('boxClear').disabled = !b.marks.length; $('boxDel').disabled = !m; renderSwatches();
    $('boxDone').textContent = b.marks.length ? `Done (${b.marks.length})` : 'Done';
  }
  const boxPt = (e) => { const r = $('boxCanvas').getBoundingClientRect(); return [Math.max(0, Math.min(boxer.w, (e.clientX - r.left) / boxer.sc)), Math.max(0, Math.min(boxer.h, (e.clientY - r.top) / boxer.sc))]; };
  /** The mark under the finger (the selected one first): a handle to resize it, else its body to move it. */
  function hitMark(pt) {
    const tol = 24 / boxer.sc, order = boxer.marks.map((_, i) => i).reverse();
    if (boxer.sel >= 0) { order.splice(order.indexOf(boxer.sel), 1); order.unshift(boxer.sel); }
    const can = (m) => (boxer.mode === 'foc' ? m.k === 'foc' : boxer.mode === 'text' ? m.k === 'text' : boxer.mode === 'odfp' ? m.k !== 'rack' : true); // v2.27: a route, a text or an ODF panel in a rack starts on top of other marks
    for (const i of order) {
      const m = boxer.marks[i];
      if (!can(m)) continue;
      if (m.k === 'foc') { if (m.pts.some((p, j) => j && segDist(pt, m.pts[j - 1], p) < tol)) return { i, op: 'move' }; continue; }
      if (m.k === 'text') { const bb = bboxOf(m); if (pt[0] > bb[0] - tol / 2 && pt[0] < bb[0] + bb[2] + tol / 2 && pt[1] > bb[1] - tol / 2 && pt[1] < bb[1] + bb[3] + tol / 2) return { i, op: 'move' }; continue; }
      for (const [op, x, y] of handlesOf(m)) if (Math.hypot(pt[0] - x, pt[1] - y) < tol) return { i, op };
      if (isStand(m)) { const half = Math.max(tol, (m.yb - m.yt) * MODELS[m.k].half); if (Math.abs(pt[0] - m.x) < half && pt[1] > m.yt - tol && pt[1] < m.yb + tol) return { i, op: 'move' }; }
      else if (pt[0] > m.x - tol && pt[0] < m.x + m.w + tol && pt[1] > m.y - tol && pt[1] < m.y + m.h + tol) return { i, op: 'move' };
    }
    return null;
  }
  function boxDrag(p) {
    if (boxer.mode === 'text') return; // a tap places the text
    if (boxer.mode === 'foc') { const d = boxer.drag && boxer.drag.k === 'foc' ? boxer.drag : (boxer.drag = withC({ c: boxer.color }, { k: 'foc', pts: [boxer.start] })), last = d.pts[d.pts.length - 1]; if (Math.hypot(p[0] - last[0], p[1] - last[1]) * boxer.sc >= 4) d.pts.push(p); return; }
    const [x0, y0] = boxer.start, [x1, y1] = p;
    boxer.drag = withC({ c: boxer.color }, isStand({ k: boxer.mode }) ? { k: boxer.mode, x: x0, yb: Math.max(y0, y1), yt: Math.min(y0, y1) } : { k: MODELS[boxer.mode] ? boxer.mode : 'box', x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
  }
  /** Move or resize the selected mark, kept inside the photo. */
  function boxEdit(p) {
    const o = boxer.op, m0 = o.orig, dx = p[0] - o.start[0], dy = p[1] - o.start[1], W = boxer.w, H = boxer.h, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    let m;
    o.moved = Math.max(o.moved || 0, Math.hypot(dx, dy) * boxer.sc);
    if (m0.k === 'foc') { const [bx, by, bw, bh] = bboxOf(m0), sx = cl(dx, -bx, W - bx - bw), sy = cl(dy, -by, H - by - bh); m = { ...m0, pts: m0.pts.map(([x, y]) => [x + sx, y + sy]) }; }
    else if (m0.k === 'text') { const [bx, by, bw, bh] = bboxOf(m0); m = { ...m0, x: cl(bx + dx, 0, Math.max(0, W - bw)), y: cl(by + dy, 0, Math.max(0, H - bh)) }; }
    else if (isStand(m0)) {
      if (o.op === 'move') { const sx = cl(dx, -m0.x, W - m0.x), sy = cl(dy, -m0.yt, H - m0.yb); m = { ...m0, x: m0.x + sx, yt: m0.yt + sy, yb: m0.yb + sy }; (o.kids || []).forEach((c) => { boxer.marks[c.i] = { ...c.orig, x: c.orig.x + sx, y: c.orig.y + sy }; }); }
      else if (o.op === 'top') m = { ...m0, yt: cl(m0.yt + dy, 0, m0.yb - 20) };
      else m = { ...m0, x: cl(m0.x + dx, 0, W), yb: cl(m0.yb + dy, m0.yt + 20, H) };
    } else if (o.op === 'move') m = { ...m0, x: cl(m0.x + dx, 0, W - m0.w), y: cl(m0.y + dy, 0, H - m0.h) };
    else {
      let x1 = m0.x, y1 = m0.y, x2 = m0.x + m0.w, y2 = m0.y + m0.h;
      if (o.op.includes('w')) x1 = cl(m0.x + dx, 0, x2 - 8); else x2 = cl(x2 + dx, x1 + 8, W);
      if (o.op.includes('n')) y1 = cl(m0.y + dy, 0, y2 - 8); else y2 = cl(y2 + dy, y1 + 8, H);
      m = withC(m0, { k: m0.k, x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }
    boxer.marks[o.i] = m;
  }
  $('boxCanvas').addEventListener('pointerdown', (e) => {
    if (!boxer) return; e.preventDefault(); $('boxCanvas').setPointerCapture(e.pointerId);
    const pt = boxPt(e), hit = hitMark(pt);
    if (hit) {
      const m0 = boxer.marks[hit.i], R = m0.k === 'rack' ? rackInner(m0) : null;
      const kids = R && hit.op === 'move' ? boxer.marks.map((c, i) => ({ c, i })).filter(({ c }) => c.k === 'odfp' && c.x + c.w / 2 > R.l && c.x + c.w / 2 < R.r && c.y + c.h / 2 > R.t && c.y + c.h / 2 < R.b).map(({ c, i }) => ({ i, orig: { ...c } })) : [];
      boxer.op = { ...hit, start: pt, orig: { ...m0 }, wasSel: boxer.sel === hit.i, kids }; boxer.sel = hit.i; drawBoxer(); return;
    }
    boxer.sel = -1; boxer.start = pt; boxer.drag = null; boxDrag(pt); drawBoxer();
  });
  $('boxCanvas').addEventListener('pointermove', (e) => {
    if (!boxer) return;
    if (boxer.op) { boxEdit(boxPt(e)); drawBoxer(); return; }
    if (!boxer.start) return; boxDrag(boxPt(e)); drawBoxer();
  });
  const boxEnd = () => {
    if (!boxer) return;
    if (boxer.op) {
      const o = boxer.op, m = boxer.marks[o.i]; boxer.op = null;
      if (m && m.k === 'text' && o.wasSel && (o.moved || 0) < 6) { editBoxText(o.i); return; } // a selected text tapped again: change it
      if (m && m.k === 'odfp') boxer.marks[o.i] = snapToRack(m);
      if (m && m.k === 'rack') (o.kids || []).forEach((c) => { boxer.marks[c.i] = snapToRack(boxer.marks[c.i]); });
      drawBoxer(); return;
    }
    if (!boxer.start) return;
    const d = boxer.drag, sc = boxer.sc, at = boxer.start; boxer.start = null; boxer.drag = null;
    if (boxer.mode === 'text') { drawBoxer(); addBoxText(at); return; }
    if (d && d.k === 'foc') {
      const len = d.pts.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - d.pts[i - 1][0], p[1] - d.pts[i - 1][1]) : 0), 0);
      if (len * sc > 30) { boxer.marks.push(withC(d, { k: 'foc', pts: simplifyPts(d.pts, 1.5 / sc).slice(0, 400) })); boxer.sel = boxer.marks.length - 1; }
    } else if (d && (isStand(d) ? (d.yb - d.yt) * sc > (d.k === 'hh' ? 12 : 30) : d.w * sc > 12 && d.h * sc > 12)) { boxer.marks.push(snapToRack(d)); boxer.sel = boxer.marks.length - 1; } // a tap is not a mark
    drawBoxer();
  };
  /** Fewer points on a hand-drawn line (Ramer–Douglas–Peucker), the shape kept within tol photo pixels. */
  function simplifyPts(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
    const st = [[0, pts.length - 1]];
    while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; for (let i = a + 1; i < b; i++) { const d = segDist(pts[i], pts[a], pts[b]); if (d > md) { md = d; mi = i; } } if (md > tol) { keep[mi] = true; st.push([a, mi], [mi, b]); } }
    return pts.filter((_, i) => keep[i]).map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]);
  }
  /** v2.27: a comment on the photo, placed where the photo was tapped. */
  async function addBoxText(at) {
    const t = await promptText('Text on the photo', 'Your comment, written on the photo where you tapped (e.g. “Splice here”, “Cross the road at 6 m”).', 'Comment', '');
    const v = String(t || '').trim().slice(0, 200); if (!v || !boxer) return;
    boxer.marks.push(withC({ c: boxer.color }, { k: 'text', x: at[0], y: at[1], t: v, s: 1 })); boxer.sel = boxer.marks.length - 1; drawBoxer();
  }
  async function editBoxText(i) {
    const m = boxer && boxer.marks[i]; if (!m) return;
    const t = await promptText('Change the text', 'Leave it empty to remove the comment.', 'Comment', m.t || '');
    if (t == null || !boxer) { drawBoxer(); return; }
    const v = String(t).trim().slice(0, 200);
    if (!v) { boxer.marks.splice(i, 1); boxer.sel = -1; } else boxer.marks[i] = { ...m, t: v };
    drawBoxer();
  }
  $('boxCanvas').addEventListener('pointerup', boxEnd); $('boxCanvas').addEventListener('pointercancel', boxEnd);
  $('boxDel').addEventListener('click', () => { if (boxer && boxer.sel >= 0) { boxer.marks.splice(boxer.sel, 1); boxer.sel = -1; drawBoxer(); } });
  $('boxUndo').addEventListener('click', () => { if (boxer) { boxer.marks.pop(); boxer.sel = -1; drawBoxer(); } });
  $('boxClear').addEventListener('click', () => { if (boxer) { boxer.marks = []; boxer.sel = -1; drawBoxer(); } });
  window.addEventListener('resize', () => { if (boxer && !$('boxer').hidden) { sizeBoxer(); drawBoxer(); } });
  $('boxDone').addEventListener('click', () => guard(async () => {
    const b = boxer; if (!b || !ed) return;
    const before = JSON.stringify(ed.marks || []);
    const marks = b.marks.map((m) => withC(m, m.k === 'foc' ? { k: 'foc', pts: m.pts.map(([x, y]) => [+(x / b.w).toFixed(4), +(y / b.h).toFixed(4)]) }
      : m.k === 'text' ? { k: 'text', x: +((m._x != null ? m._x : m.x) / b.w).toFixed(5), y: +((m._y != null ? m._y : m.y) / b.h).toFixed(5), t: m.t, ...(m.s && m.s !== 1 ? { s: m.s } : {}) }
        : isStand(m) ? { k: m.k, x: +(m.x / b.w).toFixed(5), yb: +(m.yb / b.h).toFixed(5), yt: +(m.yt / b.h).toFixed(5) } : { k: m.k, x: +(m.x / b.w).toFixed(5), y: +(m.y / b.h).toFixed(5), w: +(m.w / b.w).toFixed(5), h: +(m.h / b.h).toFixed(5) }));
    if (JSON.stringify(marks) === before) { await closeSheet(); return; }
    busy('Marking the photo…');
    let blob = b.base;
    if (marks.length) {
      const cv = document.createElement('canvas'); cv.width = b.w; cv.height = b.h;
      const g = cv.getContext('2d'); g.drawImage(b.im, 0, 0, b.w, b.h);
      drawMarks(g, b.marks, 1, boxLine(b.w, b.h), Math.max(b.w, b.h));
      blob = await toBlob(cv, 0.92);
    }
    if (ed.mode === 'edit' && !ed.newBlob) ed.keepQ = true; // the stored photo, only marked: its camera check stays
    const stored = !!(ed.origPid && !ed.dropOrig);
    if (marks.length && !ed.base) { ed.base = b.base; ed.baseNew = !stored; } // the unmarked photo is kept with the record
    if (!marks.length && stored) ed.dropOrig = true;
    ed.marks = marks; ed.newBlob = blob; prepImages(blob); showEdPhoto(blob);
    const poles = marks.filter((m) => m.k === 'pole').length;
    LOG.info('photo.marks', { n: marks.length, poles, models: marks.filter((m) => (isModel(m) && m.k !== 'pole') || DRAWN.has(m.k)).map((m) => m.k) });
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
    const kindOf = (v) => (/^FDU_/.test(v) ? 'ODF' : poleIdRe().test(v) || poleIdXRe().test(v) || polePartRe().test(v) || /^PP-/.test(v) ? 'Pole' : Object.keys(SV_PREFIX).find((k) => v.startsWith(`${SV_PREFIX[k]}-`)) || null);
    // a new record: the suggested ID follows the element; so does an ID that belongs to another element (e.g. a pole ID read by the camera)
    if (ed.mode === 'new' && (!ed.idTouched || !id || (kindOf(id) && kindOf(id) !== el))) { $('poleId').value = suggestId(el, ed.type); ed.idTouched = false; }
    applyElement(); checkDup(); checkFormat(); applyPlan();
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
      const ppGlobe = el === 'Pole' && ed.status === 'Proposed'; // v2.27: a proposed pole is a Globe pole (GT)
      if (ppGlobe && ed.type !== globeType()) { ed.type = globeType(); renderTypeChips(ed.type); }
      $('typeSel').disabled = ppGlobe || ed.lock === 'closed'; $('surveyTypeBox').title = ppGlobe ? 'A proposed pole is a Globe pole (GT)' : '';
      $('svDetailsBox').hidden = el !== 'Pole'; renderDetails();
      const sb = $('svStatus'); sb.innerHTML = ''; sts.forEach((x) => sb.add(new Option(svStatusLabel(x), x, false, x === ed.status)));
      $('svStatusBox').hidden = !sts.length; sb.disabled = sts.length < 2;
      $('svClosureBox').hidden = el !== 'Handhole';
      renderBoq();
      $('edHint').textContent = el === 'Pole' && ed.status === 'Proposed' ? 'Drag the map to place the pin where the new pole goes' : `Drag the map to place the pin on the ${nm}`;
      renderBoxInfo();
      return;
    }
    $('idLabel').textContent = `${el.toUpperCase()} ID`;
    $('poleId').placeholder = `Optional · ${el === 'Pole' ? 'e.g. CC-0001' : el === 'ODF' ? 'e.g. FDU_100' : `e.g. ${el}-01`}`;
    if (!ed.lock) $('typeSel').disabled = false; // v2.27: (a proposed survey pole locks it to Globe)
    $('svDetailsBox').hidden = el !== 'Pole'; renderDetails(); // pole details: optional here too (v2.19)
    $('surveyTypeBox').hidden = el !== 'Pole'; $('nptBtn').hidden = el !== 'Pole';
    $('poleAttach').hidden = el !== 'Pole'; $('odfBox').hidden = el !== 'ODF';
    $('atMloop').checked = ed.mloop; $('atNap').checked = ed.nap; $('atClosure').checked = ed.closure; markToggles();
    $('napId').hidden = !ed.nap; $('closureId').hidden = !ed.closure;
    $('odfSel').value = ed.odf || 'New';
    renderBoq();
    const cats = catsFor(el); // an open defect form follows the element
    if (defDraft && !$('defPanel').hidden && !cats.includes(defDraft.cat)) { defDraft.cat = cats[0]; defDraft.items = new Set(); renderDefPanel(); }
  }
  function markToggles() { ['atMloop', 'atNap', 'atClosure'].forEach((id) => $(id).closest('.tchip').classList.toggle('on', $(id).checked)); }
  $('atMloop').addEventListener('change', (e) => { ed.mloop = e.target.checked; markToggles(); });
  $('atNap').addEventListener('change', (e) => { ed.nap = e.target.checked; markToggles(); $('napId').hidden = !ed.nap; if (ed.nap) $('napId').focus(); });
  $('atClosure').addEventListener('change', (e) => { ed.closure = e.target.checked; markToggles(); $('closureId').hidden = !ed.closure; renderBoq(); if (ed.closure) $('closureId').focus(); });
  $('svClosureId').addEventListener('input', () => { if (ed && !ed.acc && ed.element === 'Handhole') { const was = !$('boqBox').hidden; if (was !== !!$('svClosureId').value.trim()) renderBoq(); } });
  /** v2.26: the BOQ sizes of the element in the record: one row of chips per field (tap again to clear). */
  const edBoqKeys = () => (ed && !ed.acc && boqOn() ? boqKeys(ed.element || 'Pole', ed.status, !!$('svClosureId').value.trim()) : []);
  function renderBoq() {
    const box = $('boqBox'), rows = $('boqRows'); if (!ed) return;
    const keys = edBoqKeys(); box.hidden = !keys.length; rows.innerHTML = '';
    ed.boq = ed.boq || {};
    const ro = ed.lock === 'closed';
    keys.forEach((k) => {
      const row = document.createElement('div'); row.className = 'boqrow';
      const l = document.createElement('span'); l.className = 'lbl'; l.textContent = BOQ_LABEL[k]; row.appendChild(l);
      const chips = document.createElement('div'); chips.className = 'chips'; chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', BOQ_LABEL[k]); chips.dataset.k = k;
      const opts = (k === 'owner' ? boqOwners() : boqList(k)).slice();
      if (ed.boq[k] && !opts.includes(ed.boq[k])) opts.push(ed.boq[k]); // a value from another phone's list
      const other = async () => {
        let v = await promptText('Pole owner', 'Whose pole is it? It is kept on this phone for the next poles (your admin can add owners for everyone).', 'e.g. SKYCABLE');
        v = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 30); if (!v) { renderBoq(); return; }
        if (!boqOwners().some((x) => x.toLowerCase() === v.toLowerCase())) { S.myOwners = (S.myOwners || []).concat(v).slice(-20); persist(); }
        ed.boq.owner = boqOwners().find((x) => x.toLowerCase() === v.toLowerCase()) || v; ed.boqTouched = true; renderBoq(); foldSum();
      };
      if (BOQ_MULTI.has(k)) { // v2.29: several at once (guying): each chip on or off
        const cur = new Set(String(ed.boq[k] || '').split(' + ').filter(Boolean));
        cur.forEach((v) => { if (!opts.includes(v)) opts.push(v); });
        opts.forEach((v) => {
          const c = document.createElement('button'); c.type = 'button'; c.className = 'chip small'; c.textContent = v; c.setAttribute('aria-pressed', String(cur.has(v))); c.disabled = ro;
          c.addEventListener('click', () => { if (cur.has(v)) cur.delete(v); else cur.add(v); ed.boq[k] = opts.filter((x) => cur.has(x)).join(' + '); if (!ed.boq[k]) delete ed.boq[k]; ed.boqTouched = true; renderBoq(); foldSum(); });
          chips.appendChild(c);
        });
        row.appendChild(chips); rows.appendChild(row); return;
      }
      if (k === 'mloop') { // v2.29: one chip, on or off
        const c = document.createElement('button'); c.type = 'button'; c.className = 'chip small'; c.textContent = `MLoop ${mloopLen()} m`; c.setAttribute('aria-pressed', String(!!ed.boq.mloop)); c.disabled = ro;
        c.addEventListener('click', () => { if (ed.boq.mloop) delete ed.boq.mloop; else ed.boq.mloop = 'Yes'; ed.boqTouched = true; renderBoq(); foldSum(); });
        chips.appendChild(c); row.appendChild(chips); rows.appendChild(row); return;
      }
      if (opts.length > 4) { // v2.28: a long list is a dropdown
        const sel = document.createElement('select'); sel.className = 'boqsel'; sel.dataset.k = k; sel.setAttribute('aria-label', BOQ_LABEL[k]); sel.disabled = ro;
        sel.add(new Option('— none —', '', false, !ed.boq[k])); opts.forEach((v) => sel.add(new Option(v, v, false, ed.boq[k] === v)));
        if (k === 'owner' && !ro) sel.add(new Option('+ Other…', '__other'));
        sel.addEventListener('change', () => { if (sel.value === '__other') { other(); return; } ed.boq[k] = sel.value; ed.boqTouched = true; renderBoq(); foldSum(); });
        row.appendChild(sel); rows.appendChild(row); return;
      }
      opts.forEach((v) => {
        const c = document.createElement('button'); c.type = 'button'; c.className = 'chip small'; c.textContent = v; c.setAttribute('aria-pressed', String(ed.boq[k] === v)); c.disabled = ro;
        c.addEventListener('click', () => { ed.boq[k] = ed.boq[k] === v ? '' : v; ed.boqTouched = true; renderBoq(); foldSum(); });
        chips.appendChild(c);
      });
      if (k === 'owner' && !ro) {
        const o = document.createElement('button'); o.type = 'button'; o.className = 'chip small'; o.textContent = '+ Other';
        o.addEventListener('click', other);
        chips.appendChild(o);
      }
      row.appendChild(chips); rows.appendChild(row);
    });
    renderPlanLine(keys, ro);
  }
  /* v2.26.1: the As-Built follows the As-Plan. With the As-Plan KMZ as the project's reference, the record shows the planned
     element (same ID, else the nearest of its kind within 15 m) and a new record starts with its planned sizes and status. */
  function renderPlanLine(keys, ro) {
    const pn = $('boqPlan'), pb = $('boqUsePlan'), pl = ed && !ed.acc ? ed.plan : null, m = ed && ed.planHit;
    pn.hidden = !pl || !keys.length; pb.hidden = true; pn.classList.remove('warn');
    if (pn.hidden) return;
    if (m) {
      const plan = boqText({ boq: boqPick(m.r.boq, keys) }), now = boqText({ boq: boqPick(ed.boq, keys) }), differs = plan !== now;
      pn.textContent = `As-Plan ${m.r.poleId || m.r.element}${m.by === 'near' ? ` (${fmtDist(m.d)} from the pin)` : m.d > PLAN_NEAR_M ? ` (same ID, ${fmtDist(m.d)} from the pin)` : ''}: ${boqText(m.r) || 'no size in the plan'}${!differs && ed.boqFromPlan && !ed.boqTouched ? ' · filled in from the plan: change what was built differently' : differs ? ' · built differs from the plan' : ''}`;
      pn.classList.toggle('warn', differs); pb.hidden = !differs || ro || !plan;
    } else if (pl.none) pn.textContent = 'Load the As-Plan KMZ as this project\u2019s reference (Projects \u2192 Project details \u2192 KMZ reference): each element then starts with its planned sizes, and the BOQ shows planned against built.';
    else if (!pl.recs.length) pn.textContent = `The reference \u201c${pl.name}\u201d has no G-eSAA sizes: load the As-Plan KMZ exported by G-eSAA (v2.26 or later) as the reference.`;
    else pn.textContent = `Not in the As-Plan: no planned ${(ed.element || 'Pole').toLowerCase()} with this ID or within ${PLAN_NEAR_M} m of the pin.`;
  }
  $('boqUsePlan').addEventListener('click', () => { if (!ed || !ed.planHit) return; ed.boq = { ...ed.boq, ...boqPick(ed.planHit.r.boq, edBoqKeys()) }; edBoqKeys().forEach((k) => { if (!ed.planHit.r.boq[k]) delete ed.boq[k]; }); ed.boqTouched = true; ed.boqFromPlan = true; renderBoq(); foldSum(); });
  /** The planned element of the open As-Built record: same ID (a painted pole ID), else the nearest of its kind within PLAN_NEAR_M. */
  function planMatch() {
    const pl = ed && ed.plan; if (!pl || !pl.recs.length || !pinMap) return null;
    const el = ed.element || 'Pole', id = $('poleId').value.trim().toUpperCase(), same = pl.recs.filter((r) => r.element === el);
    const c = pinMap.getCenter(), here = { lat: c.lat, lon: c.lng };
    const byId = id.length > 4 && !PP_RE.test(id) && !/[-_]$/.test(id) ? same.find((r) => String(r.poleId).toUpperCase() === id) : null;
    if (byId) return { r: byId, d: haversine(here, byId), by: 'id' };
    let best = null;
    same.forEach((r) => { const d = haversine(here, r); if (d <= PLAN_NEAR_M && (!best || d < best.d)) best = { r, d, by: 'near' }; });
    return best;
  }
  function applyPlan() {
    if (!ed || ed.acc || !ed.plan) return;
    const m = planMatch(), was = ed.planHit, moved = (m && m.r) !== (was && was.r);
    ed.planHit = m;
    if (ed.mode === 'new' && !ed.boqTouched && moved) {
      if (m) {
        const want = m.r.status === 'Proposed' || m.r.status === 'New' ? 'New' : 'Existing'; // a proposed element of the plan is a new one in the As-Built
        if (!ed.stTouched && ed.status !== want && svStatuses(ed.element || 'Pole').includes(want)) { ed.status = want; applyElement(); if (want === 'New' && (ed.element || 'Pole') === 'Pole' && ed.type !== globeType()) setPoleType(globeType()); }
        ed.boq = { ...m.r.boq }; ed.boqFromPlan = true;
      } else if (ed.boqFromPlan) { ed.boq = {}; ed.boqFromPlan = false; }
    }
    renderBoq(); foldSum();
  }
  $('odfSel').addEventListener('change', (e) => { ed.odf = e.target.value; applyElement(); });
  $('svStatus').addEventListener('change', (e) => {
    if (!ed) return;
    const was = ed.status; ed.status = e.target.value; ed.stTouched = true;
    if (ed.status === 'New' && was !== 'New' && (ed.element || 'Pole') === 'Pole' && ed.type !== globeType()) setPoleType(globeType()); // v2.27: a new pole is a Globe pole (changeable)
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
    const box = $('svDetails'); if (!ed) return; box.innerHTML = '';
    const ro = ed.lock === 'closed'; // a completed PAT: the details are shown, not changed
    (ed.details || []).forEach((d, i) => {
      const row = document.createElement('div'); row.className = 'pdrow';
      const t = document.createElement('span'); t.className = 't'; t.textContent = d.item;
      const mk = (txt, lbl, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = txt; b.setAttribute('aria-label', lbl); b.addEventListener('click', fn); return b; };
      const q = document.createElement('b'); q.textContent = String(d.qty); q.setAttribute('aria-label', `${d.qty} pc${d.qty === 1 ? '' : 's'}`); // compact chip (v2.15): Transformer − 1 + ×
      // at 1 pc the minus removes the item (×), so each chip needs only two buttons
      if (ro) row.append(t, q);
      else row.append(t, mk(d.qty > 1 ? '−' : '×', d.qty > 1 ? `One ${d.item} less` : `Remove ${d.item}`, () => { if (d.qty > 1) d.qty -= 1; else ed.details.splice(i, 1); renderDetails(); }), q,
        mk('+', `One ${d.item} more`, () => { d.qty = Math.min(99, d.qty + 1); renderDetails(); }));
      box.appendChild(row);
    });
    const sel = $('svDetailAdd'), have = new Set((ed.details || []).map((d) => d.item));
    sel.innerHTML = '<option value="">+ Add detail</option>';
    detailItems().concat((S.myDetails || []).filter((x) => !detailItems().includes(x))).filter((x) => !have.has(x)).forEach((x) => sel.add(new Option(x, x)));
    sel.add(new Option('Other…', '__other'));
  }
  $('svDetailAdd').addEventListener('change', async (e) => {
    if (!ed) return;
    let v = e.target.value; e.target.value = ''; if (!v) return;
    if (v === '__other') {
      v = await promptText('Pole detail', 'What else is on the pole? It is added with a count of 1; tap + for more.', 'e.g. Cable TV amplifier');
      if (!v) return; v = v.trim().slice(0, 40);
      if (!detailItems().includes(v) && !(S.myDetails || []).includes(v)) { S.myDetails = (S.myDetails || []).concat(v).slice(-20); persist(); }
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
      sel.addEventListener('change', () => { p.label = sel.value; }); sel.disabled = ed.lock === 'closed';
      const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove photo');
      x.hidden = ed.lock === 'closed' || (ed.lock === 'carried' && !ed.pending[p.pid]); // v2.16: recorded photos stay
      x.addEventListener('click', () => {
        ed.photos.splice(i, 1);
        if (ed.pending[p.pid]) delete ed.pending[p.pid]; else ed.removed.push(p.pid);
        renderAccPhotos();
      });
      cell.append(img, x, sel); box.appendChild(cell);
    });
    const add = document.createElement('button'); add.type = 'button'; add.className = 'ph add'; add.textContent = '+ Add photo';
    add.addEventListener('click', () => openCamera('add'));
    if (ed.lock !== 'closed') box.appendChild(add);
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
      const rm = document.createElement('input'); rm.type = 'text'; rm.placeholder = 'Remarks (optional)'; rm.value = d.remarks || ''; rm.disabled = ed.lock === 'closed';
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
      if (ed.lock !== 'closed') card.appendChild(acts); // a completed PAT: no fix, verify or remove here (v2.16)
      list.appendChild(card);
    });
    if (ed.lock === 'closed') $('addDefBtn').hidden = true;
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
    $('vcTitle').textContent = `${recName(r) || '(no ID)'} · ${elemOf(r)}`;
    $('vcSub').textContent = visitSub(r);
    const el = $('vcElem'); el.innerHTML = '';
    photosOf(r).slice(0, 4).forEach((p) => el.appendChild(figure(p.pid, p.label || 'Photo', `${recName(r)} · ${p.label || ''}`)));
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
      if (d.pid) ph.appendChild(figure(d.pid, 'Defect', `${recName(r)} · ${d.item} · defect (as found)`));
      if (d.afterPid) ph.appendChild(figure(d.afterPid, 'Fixed', `${recName(r)} · ${d.item} · fixed`));
      if (d.verifyPid) ph.appendChild(figure(d.verifyPid, 'Checked', `${recName(r)} · ${d.item} · checked at ${d.verifyStage || 'FAT'}`));
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
    renderPoles(); renderVisit(); toast(`${recName(rec)}: ${done}`, 2500);
    return true;
  }
  /** A photo taken from the card: the fix (contractor) or the check (inspector), within reach of the pin. */
  function visitPhoto(blob, gps) {
    const v = visitCam; visitCam = null; if (!v) return;
    const r = points.find((x) => x.id === v.rid); if (!r) return;
    if (!gps) { toast('No GPS fix: photo not used. Wait for GPS, then take it again.', 4500); return; }
    const far = haversine(gps, r);
    if (far > PIN_LIMIT_M) { toast(`Photo not used: you are ${fmtDist(far)} from ${recName(r)}. Take it within ${fmtDist(PIN_LIMIT_M)} of the pin.`, 6000); return; }
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
    $('sumTitle').textContent = `Next: ${recName(t.r) || '(no ID)'} · ${elemOf(t.r)}`;
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
    const cats = catsFor(ed.element);
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
    defDraft = { cat: catsFor(ed.element)[0], items: new Set(), sev: 'Minor', blob: null };
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
  $('edClose').addEventListener('click', () => { if (ed && !ed.closeOK && edDirty()) { askLeaveEditor(); return; } closeSheet(); }); // v2.21
  $('edPhoto').addEventListener('click', () => {
    if (!ed) return;
    showBlob(ed.newBlob || ed.srcBlob, `${$('poleId').value || ''} · ${$('edTime').textContent}`);
    if (!ed.acc) { // survey photo: mark it here (red box, model pole); marks stay editable
      $('pvTools').hidden = false; const n = (ed.marks || []).length, pp = proposedPole();
      $('pvBox').textContent = n ? '✎ Edit the marks' : '✎ Box · FOC · Text'; // v2.27 $('pvPole').hidden = false; $('pvRead').hidden = false; // v2.18: models for every survey photo (pole, ODF, handhole, tower)
      $('pvHint').textContent = n ? 'Tap a tool, then tap a mark to move, resize or delete it · tap the photo to zoom' : 'Tap the photo to zoom in or out · × or Back to close';
    }
  });
  $('defPhotoPrev').addEventListener('click', () => { if (defDraft && defDraft.blob) showBlob(defDraft.blob, 'Defect photo (not added yet)'); });

  /* ---------- reading the ID from the photo (v2.17): Read ID, then tap the painted ID or swipe along it ---------- */
  const PV_HINT_READ = 'Tap the painted ID, or draw a box round it';
  function setPhotoRead(on) {
    $('photoView').classList.toggle('reading', on); $('pvMark').hidden = true;
    $('pvHint').textContent = on ? PV_HINT_READ : 'Tap the photo to zoom in or out · × or Back to close';
  }
  /** Opens the editor's photo ready to read the ID on it (the scan bar's picture button). */
  function openPhotoRead() {
    if (!ed || ed.acc || !(ed.newBlob || ed.srcBlob)) { toast('No photo to read the ID from'); return; }
    $('edPhoto').click(); setPhotoRead(true);
  }
  $('pvRead').addEventListener('click', (e) => { e.stopPropagation(); setPhotoRead(!$('photoView').classList.contains('reading')); });
  let pvSw = null;
  $('pvImg').addEventListener('pointerdown', (e) => {
    if (!$('photoView').classList.contains('reading')) return;
    e.preventDefault(); pvSw = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, id: e.pointerId };
    try { $('pvImg').setPointerCapture(e.pointerId); } catch (er) { /* optional */ }
  });
  $('pvImg').addEventListener('pointermove', (e) => {
    if (!pvSw || e.pointerId !== pvSw.id) return;
    pvSw.x1 = e.clientX; pvSw.y1 = e.clientY;
    if (Math.hypot(pvSw.x1 - pvSw.x0, pvSw.y1 - pvSw.y0) > 14) { $('pvMark').classList.add('box'); drawRect($('pvMark'), pvSw, null); }
  });
  $('pvImg').addEventListener('pointerup', (e) => { if (!pvSw || e.pointerId !== pvSw.id) return; const sw = pvSw; pvSw = null; guard(() => readFromPhoto(sw), 'Could not read the photo'); });
  $('pvImg').addEventListener('pointercancel', () => { pvSw = null; $('pvMark').hidden = true; });
  /** A crop of the photo (photo pixels), at most 1600 px on its long side, marked with the ID's direction. */
  function cropOf(im, b, orient) {
    const k = Math.min(1, 1600 / Math.max(b.w, b.h)), cv = document.createElement('canvas');
    cv.width = Math.max(8, Math.round(b.w * k)); cv.height = Math.max(8, Math.round(b.h * k));
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, b.x, b.y, b.w, b.h, 0, 0, cv.width, cv.height);
    cv._orient = orient; return cv;
  }
  /** Where the ID is around a tap on the photo: a column of characters, else a row, else the column-shaped box; null if none. */
  function idNear(im, IW, IH, fx, fy) {
    const rw = Math.round(IW * 0.34), rh = Math.round(IH * 0.42), rx = Math.max(0, Math.min(IW - rw, Math.round(fx * IW - rw / 2))), ry = Math.max(0, Math.min(IH - rh, Math.round(fy * IH - rh / 2)));
    const W = Math.min(360, rw), k = W / rw, H = Math.max(20, Math.round(rh * k)), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, rx, ry, rw, rh, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data, at = { x: (fx * IW - rx) / rw, y: (fy * IH - ry) / rh };
    const back = (b) => ({ x: rx + b.x / k, y: ry + b.y / k, w: b.w / k, h: b.h / k });
    const st = C.findStack(px, W, H, null, true);
    if (st && st.n >= 4 && Math.abs((st.x + st.w / 2) / W - at.x) < 0.25) { const b = back(st); return { x: b.x - b.w * 0.6, y: b.y - b.h * 0.2, w: b.w * 2.2, h: b.h * 1.4, v: true }; }
    const hb = C.findIdBox(px, W, H, 'h', at);
    if (hb) { const b = back(hb); return { x: b.x - b.w * 0.1, y: b.y - b.h * 0.35, w: b.w * 1.2, h: b.h * 1.7, v: false }; }
    const vb = C.findIdBox(px, W, H, 'v', at);
    if (vb) { const b = back(vb); return { x: b.x - b.w * 0.4, y: b.y - b.h * 0.08, w: b.w * 1.8, h: b.h * 1.16, v: true }; }
    return null;
  }
  async function readFromPhoto(sw) {
    const img = $('pvImg'), r = img.getBoundingClientRect(), blob = pvReadBlob || (ed && (ed.newBlob || ed.srcBlob));
    if (!blob || !r.width) return;
    const tap = Math.hypot(sw.x1 - sw.x0, sw.y1 - sw.y0) < 14, fx = (x) => (x - r.left) / r.width, fy = (y) => (y - r.top) / r.height;
    if (fx(sw.x0) < 0 || fx(sw.x0) > 1 || fy(sw.y0) < 0 || fy(sw.y0) > 1) { $('pvMark').hidden = true; return; }
    $('pvHint').textContent = 'Reading…';
    const im = await loadImage(blob), { w: IW, h: IH } = dims(im);
    let b = tap ? idNear(im, IW, IH, fx(sw.x0), fy(sw.y0)) : rectOf({ x0: fx(sw.x0) * IW, y0: fy(sw.y0) * IH, x1: fx(sw.x1) * IW, y1: fy(sw.y1) * IH }), crop;
    if (b && !tap) { const p = Math.max(b.w, b.h) * 0.04; b = { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p, v: b.v }; } // a little room round the drawn box
    if (b) { b = clipBox(b, IW, IH); crop = cropOf(im, b, b.v ? 'v' : 'h'); }
    else { // nothing ID-like found at the tap: a row around it, and a column as the other way round
      const hb = clipBox({ x: fx(sw.x0) * IW - IW * 0.16, y: fy(sw.y0) * IH - IH * 0.04, w: IW * 0.32, h: IH * 0.08 }, IW, IH), vb = clipBox({ x: fx(sw.x0) * IW - IW * 0.05, y: fy(sw.y0) * IH - IH * 0.16, w: IW * 0.1, h: IH * 0.32 }, IW, IH);
      crop = cropOf(im, hb, 'h'); crop._alt = cropOf(im, vb, 'v'); b = hb;
    }
    if (im.close) im.close();
    if (!(b.w > 4 && b.h > 4)) { setPhotoRead(true); return; }
    // show what is read, then back to the editor, where the reading fills the ID
    const m = $('pvMark'); m.hidden = false; m.classList.add('box');
    Object.assign(m.style, { left: `${r.left + (b.x / IW) * r.width}px`, top: `${r.top + (b.y / IH) * r.height}px`, width: `${(b.w / IW) * r.width}px`, height: `${(b.h / IH) * r.height}px`, transform: 'none' });
    LOG.info('photo.readId', { tap, v: crop._orient === 'v', found: !!b, w: Math.round(b.w), h: Math.round(b.h) });
    await new Promise((res) => setTimeout(res, 450));
    closePhotoView(); runOcrFor(crop, true);
  }
  $('edSaveTop').addEventListener('click', saveEditor); // the same Save, next to the photo (v2.14)
  $('scanIdBtn').addEventListener('click', () => openCamera('scan'));
  $('snapGps').addEventListener('click', () => {
    const g = (ed && ed.gps) || fix;
    if (!g) { toast('No GPS fix yet'); return; }
    pinMap.setView([g.lat, g.lon], Math.max(pinMap.getZoom(), 19)); ed.userMoved = false;
  });
  $('edRetake').addEventListener('click', async () => {
    if (ed.mode === 'edit') { openCamera('replace'); return; }
    const nd = ed.noDef; ed.closeOK = true; await closeSheet(); openCamera(nd ? 'nodef' : 'new');
  });
  $('edDelete').addEventListener('click', () => { $('delName').textContent = $('poleId').value || 'this pole'; $('delConfirm').hidden = false; $('delConfirm').scrollIntoView({ block: 'nearest' }); });
  $('delNo').addEventListener('click', () => { $('delConfirm').hidden = true; });
  $('delYes').addEventListener('click', async () => {
    if (ed && ed.lock) { $('delConfirm').hidden = true; toast('This record is from a completed PAT and cannot be deleted', 4500); return; }
    const id = ed.id, rec = points.find((p) => p.id === id);
    await dbDel('points', id);
    if (rec) await deletePhotosIfUnused(allPids(rec).concat(Object.keys(ed.pending || {})), new Set([id]));
    points = points.filter((p) => p.id !== id);
    if (links().some(([x, y]) => x === id || y === id)) setLinks(links().filter(([x, y]) => x !== id && y !== id));
    renderPoles(); if (!$('list').hidden) renderList();
    if (ed) ed.closeOK = true;
    await closeSheet(); toast(rec && rec.kind === 'acceptance' ? 'Element deleted' : `${rec && elemOf(rec) !== 'Pole' ? elemOf(rec) : 'Pole'} deleted`);
  });
  $('edSave').addEventListener('click', saveEditor);
  $('edDone').addEventListener('click', () => { if (ed) ed.closeOK = true; closeSheet(); }); // a completed PAT's record: view only (v2.16)

  async function saveEditor() {
    if (!ed || editorSaving) return; // a second tap while saving does nothing
    editorSaving = true;
    $('saveIssue').hidden = true;
    try { await saveEditorDraft(); }
    finally { editorSaving = false; busy(false); $('edSave').disabled = false; }
  }

  async function saveEditorDraft() {
    let poleId = $('poleId').value.trim().toUpperCase(), genId = false;
    // v2.27: a survey record saved without its ID (or with only the prefix) gets a generic number of its own: P-0001, ODF-0001…
    if (!ed.acc && (!poleId || new RegExp(`^(${prefixAlt()})-?$|^FDU_?$`).test(poleId) || /[-_]$/.test(poleId))) { poleId = genSvId(ed.element || 'Pole', ed.status); $('poleId').value = poleId; genId = true; }
    if (!profileOk()) { toast('Enter your details first (Settings → You)'); openProfile(true); return; }
    {
      const c0 = pinMap.getCenter();
      if (ed.gps && ed.dragged && haversine(ed.gps, { lat: c0.lat, lon: c0.lng }) > PIN_LIMIT_M + 2) { clampPin(); toast(`Pin is more than ${fmtDist(PIN_LIMIT_M)} from where the photo was taken`); return; }
      if (ed.acc && !ed.gps) { toast('Waiting for GPS — acceptance records need the location where the photo was taken', 4000); return; }
    }
    if (ed.acc) { // v2.19: the element's ID is optional: left empty (or only the prefix), the record gets a reference D-0001
      const bare = !poleId || new RegExp(`^(${prefixAlt()})-?$|^FDU_?$`).test(poleId) || /[-_]$/.test(poleId);
      const was = (points.find((x) => x.id === ed.id) || {}).poleId || '';
      await saveAcceptance(!bare ? poleId : DREF_RE.test(was) ? was : nextDefRef());
      return;
    }
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
        boq: boqPick(ed.boq, edBoqKeys()),
        remarks: $('svRemarks').value.trim().slice(0, 500), closureId: ed.element === 'Handhole' ? $('svClosureId').value.trim().toUpperCase().slice(0, 40) : '',
        boxes: (ed.legacyBoxes || 0) + (ed.marks || []).length, marks: (ed.marks || []).map((m) => ({ ...m })),
        poleModel: (ed.marks || []).some((m) => m.k === 'pole') || !!ed.legacyPole,
        models: [...new Set((ed.marks || []).map(normMark).filter((m) => (isModel(m) && m.k !== 'pole') || DRAWN.has(m.k)).map((m) => m.k))], // odc, odfp, rack, hh, tower; v2.27 foc, text
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
      if (!Object.keys(rec.boq || {}).length) delete rec.boq; // v2.26
      if (!rec.models.length) delete rec.models;
      busy('Writing to phone storage…');
      await saveRecord(rec, photos); // photo and record together, or neither
      if (!p) points.push(rec); else points[points.indexOf(p)] = rec;
      if (p && p.origPid && !rec.origPid) deletePhotosIfUnused([p.origPid], new Set()).catch(() => {}); // marks removed or a new photo
      if (ed.mode === 'new' && !isNpt(poleId) && !genId && (ed.element || 'Pole') === 'Pole') S.lastPoleId = poleId;
      if ((ed.element || 'Pole') === 'Pole' && typeNames().includes(ed.type) && !['Proposed', 'New'].includes(ed.status)) S.lastType = ed.type; // v2.27: not the Globe type of a proposed / new pole
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
    if (ed) ed.closeOK = true; // saved: the draft goes
    await closeSheet();
    if (wasNew) map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 17));
    if (genId) toast(`No ID entered: saved as ${poleId}, a generic number. Change it when the ID is known (open the pin).`, 5000);
    else toast(wasNew ? `${poleId} saved` : 'Changes saved');
  }
  /** v2.27: the generic number of a survey record saved without its ID: P-0001 (pole), ODF-0001, SITE-0001, ODC-, NAP-, CL-, HH-0001;
      a proposed pole keeps its PP- number. The next free number in the project. */
  const GEN_PRE = { Pole: 'P', ODF: 'ODF', Site: 'SITE', ODC: 'ODC', NAP: 'NAP', Closure: 'CL', Handhole: 'HH' };
  function genSvId(el, status) {
    if (el === 'Pole' && status === 'Proposed') return suggestId('Pole', ed && ed.type);
    const pre = GEN_PRE[el] || 'X', re = new RegExp(`^${pre}-(\\d+)$`);
    const n = points.filter((p) => p.project === S.project && (!ed || p.id !== ed.id)).reduce((m, p) => { const x = re.exec(String(p.poleId || '').toUpperCase()); return x ? Math.max(m, +x[1]) : m; }, 0);
    return `${pre}-${String(n + 1).padStart(4, '0')}`;
  }

  /** v2.19: the reference of a deficiency record saved without an element ID: D-0001, D-0002… in the project. */
  const DREF_RE = /^D-(\d+)$/;
  /* v2.22: in a PAT, cleanup or FAT record, Element details and On this pole are optional: they fold, closed when the record
     opens, with one line saying what is in them. Tap the title to open or close. */
  const FOLDS = ['idGroup', 'poleAttach'];
  function foldInit(acc) {
    FOLDS.forEach((id) => { const g = $(id), h = g.querySelector('h3'); g.classList.toggle('fold', !!acc); g.classList.remove('open');
      if (acc) { h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', 'false'); } else { h.removeAttribute('role'); h.removeAttribute('tabindex'); h.removeAttribute('aria-expanded'); } });
    foldSum();
  }
  function foldOpen(id, on) { const g = $(id); if (!g.classList.contains('fold')) return; g.classList.toggle('open', on); g.querySelector('h3').setAttribute('aria-expanded', String(on)); }
  function foldSum() {
    if (!ed || !ed.acc) return;
    const id = $('poleId').value.trim(), real = id && !new RegExp(`^(${prefixAlt()})-?$|^FDU_?$`).test(id) && !/[-_]$/.test(id);
    const el = ed.element || 'Pole';
    $('idGroupSum').textContent = [el, el === 'Pole' ? ed.type : '', real ? id : 'no ID', boqText({ boq: boqPick(ed.boq, edBoqKeys()) })].filter(Boolean).join(' · ');
    const on = [ed.mloop && 'MLoop', ed.nap && `NAP${$('napId').value.trim() ? ' ' + $('napId').value.trim() : ''}`, ed.closure && `Closure${$('closureId').value.trim() ? ' ' + $('closureId').value.trim() : ''}`].filter(Boolean);
    $('attachSum').textContent = on.length ? on.join(' · ') : 'Nothing marked';
  }
  FOLDS.forEach((id) => {
    const h = $(id).querySelector('h3'), tog = () => foldOpen(id, !$(id).classList.contains('open'));
    h.addEventListener('click', tog);
    h.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && $(id).classList.contains('fold')) { e.preventDefault(); tog(); } });
  });
  $('editor').addEventListener('input', foldSum); $('editor').addEventListener('change', foldSum);
  /** v2.22: a record saved without its element ID (internal reference D-0001) is shown by the numbers of its items. */
  const isRef = (r) => DREF_RE.test((r && r.poleId) || '');
  /** Item numbers per record of a project, as the Deficiency List numbers them (records in capture order, each defect one item). */
  function itemNos(recs) { const out = {}; let no = 0; recs.forEach((r) => { out[r.id] = (r.defs || []).map(() => ++no); }); return out; }
  let itemNoCache = null;
  function recName(r, nos) {
    if (!r || !isRef(r)) return (r && r.poleId) || '';
    let n = nos && nos[r.id];
    if (!n) {
      const pts = points.filter((p) => p.project === r.project), key = `${r.project}|${pts.length}|${pts.reduce((t, p) => t + (p.defs || []).length, 0)}|${pts.reduce((t, p) => (p.updated > t ? p.updated : t), '')}`;
      if (!itemNoCache || itemNoCache.key !== key) itemNoCache = { key, nos: itemNos(pts.sort((a, b) => (a.created < b.created ? -1 : 1))) };
      n = itemNoCache.nos[r.id] || [];
    }
    return !n.length ? 'No ID' : n.length === 1 ? `Item ${n[0]}` : `Items ${n[0]}–${n[n.length - 1]}`;
  }
  function nextDefRef() {
    const n = points.filter((p) => p.project === S.project && DREF_RE.test(p.poleId || '')).reduce((m, p) => Math.max(m, +DREF_RE.exec(p.poleId)[1]), 0);
    return `D-${String(n + 1).padStart(4, '0')}`;
  }
  async function saveAcceptance(poleId) {
    if (ed.lock === 'closed') { toast('This PAT is complete: nothing in it can be changed', 4500); return; }
    // a defect picked but not yet added is added by Save
    if (defDraft && !$('defPanel').hidden && (defDraft.items.size || $('defNotes').value.trim())) $('defAdd').click();
    if (ed.noDef && !canRecord()) { toast('Only the admin company records the PAT on this company list.', 5000); return; }
    if (visitStage() === 'PAT' && ed.mode === 'new' && !ed.defs.length && !ed.noDef) { // v2.23: except the no-defects site photo
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
    const keep = ed.lock === 'carried' ? points.find((x) => x.id === ed.id) : null; // v2.16: the PAT's ID, element, type and place stay
    if (keep) { poleId = keep.poleId; pos.lat = keep.lat; pos.lon = keep.lon; ed.element = elemOf(keep); ed.type = keep.poleType || ed.type; }
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
        details: el === 'Pole' ? (ed.details || []).filter((d) => d && d.item) : [],
        boq: boqPick(ed.boq, edBoqKeys()),
        gpsLat: g ? g.lat : null, gpsLon: g ? g.lon : null,
        accuracy: g && Number.isFinite(g.acc) ? g.acc : null, alt: g && Number.isFinite(g.alt) ? g.alt : null,
        adjusted: g ? haversine(g, pos) > 0.5 : true,
      });
      if (ed.noDef && !ed.defs.length) rec.noDef = true; else delete rec.noDef; // v2.23: the site photo of a PAT with no defects
      if (!Object.keys(rec.boq || {}).length) delete rec.boq; // v2.26
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
    const wasNew = ed.mode === 'new', pos2 = { lat: rec.lat, lon: rec.lon }, noDefDone = !!rec.noDef && taskCat() === 'PAT' && !pmeta().completedAt;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); renderPoles(); if (!$('list').hidden) renderList(); } catch (e) { LOG.error('save.refresh', errInfo(e)); }
    editorSaving = false;
    if (ed) ed.closeOK = true; // saved: the draft goes
    await closeSheet();
    if (wasNew) map.setView([pos2.lat, pos2.lon], Math.max(map.getZoom(), 17));
    toast(`${DREF_RE.test(poleId) ? 'Element' : poleId} saved${n ? ` · ${n} open deficienc${n === 1 ? 'y' : 'ies'}` : ' · OK'}`);
    if (noDefDone) setTimeout(() => guard(() => completeNoDefects(), 'PAT not completed'), 350); // v2.23: the site photo is in: complete
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
    const pts = projPoints().reverse().filter((p) => (!q || [p.poleId, p.poleType, p.element, p.napId, p.closureId, p.status, p.remarks, detailsText(p.details), boqText(p)].join(' ').toUpperCase().includes(q))
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
    // v2.22: each group folds; closed by default (open while searching); a group opened stays open while the app runs
    const gkey = (g) => `${S.project}|${g}`, folded = grouped && groups.length > 0 && groups[0][0];
    $('listFoldAll').hidden = !folded || !!q || groups.length < 2;
    if (folded) $('listFoldAll').textContent = groups.every(([g]) => listOpen.has(gkey(g))) ? 'Close all' : 'Open all';
    for (const [gname, list] of groups) {
    let host = box, thumbs = null;
    if (gname) {
      const open = !!q || groups.length === 1 || listOpen.has(gkey(gname)); // a lone group is shown open
      const h = document.createElement('button'); h.type = 'button'; h.className = 'lfold'; h.setAttribute('aria-expanded', String(open));
      const nOpen = acc ? list.reduce((t, p) => t + openCount(p), 0) : 0;
      h.innerHTML = `<span class="ln">${C.xmlEsc(PLURAL[gname] || gname)}</span><span class="lc">${list.length}${acc ? ` · ${nOpen ? `${nOpen} open` : 'none open'}` : ''}</span>`;
      host = document.createElement('div'); host.className = 'lfoldbody'; host.hidden = !open;
      thumbs = [];
      const hostRef = host, th = thumbs;
      h.addEventListener('click', () => {
        const on = hostRef.hidden; hostRef.hidden = !on; h.setAttribute('aria-expanded', String(on));
        if (on) { listOpen.add(gkey(gname)); th.splice(0).forEach((f) => f()); } else listOpen.delete(gkey(gname));
        $('listFoldAll').textContent = groups.every(([g]) => listOpen.has(gkey(g))) ? 'Close all' : 'Open all';
      });
      box.append(h, host);
      if (open) thumbs = null;
    }
    for (const p of list) {
      const b = document.createElement('button'); b.className = 'card'; b.type = 'button';
      const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy';
      const info = document.createElement('div');
      const t = document.createElement('span'); t.className = 't'; t.textContent = recName(p);
      const s = document.createElement('span'); s.className = 's';
      if (p.kind === 'acceptance') {
        const st = recStatus(p), n = openCount(p);
        s.innerHTML = `<span class="tag">${C.xmlEsc(elemOf(p))}</span><span class="tag" style="background:${STATUS_COLORS[st]};color:#fff">${st === 'Open' ? `${n} open` : STATUS_TEXT[st]}</span>${counts[p.poleId] > 1 ? '<span class="tag dup">duplicate ID</span>' : ''}`;
        const s3 = document.createElement('span'); s3.className = 's'; s3.textContent = attachText(p).join(' · ');
        if (s3.textContent) info.append(s3);
      } else {
        const el = elemOf(p), tags = el === 'Pole' ? `<span class="tag">${C.xmlEsc(p.poleType || '—')}</span>${p.status === 'Proposed' || p.status === 'New' ? `<span class="tag" style="background:${p.status === 'Proposed' ? '#e03131' : '#17202a'};color:#fff">${C.xmlEsc(svStatusLabel(p.status))}</span>` : ''}`
          : `<span class="tag" style="background:${SV_COLORS[el] || '#495057'};color:#fff">${C.xmlEsc(el)}</span>${p.status ? `<span class="tag">${C.xmlEsc(svStatusLabel(p.status))}</span>` : ''}${p.closureId ? `<span class="tag">closure ${C.xmlEsc(p.closureId)}</span>` : ''}`;
        s.innerHTML = `${tags}${(Array.isArray(p.marks) ? p.marks.filter((m) => m.k === 'box').length + Math.max(0, (p.boxes || 0) - p.marks.length) : p.boxes) ? '<span class="tag" style="background:#e03131;color:#fff">red box</span>' : ''}${[...new Set((p.models || []).map((k) => MODEL_TAG[k] || k))].map((t) => `<span class="tag" style="background:#e03131;color:#fff">${t}</span>`).join('')}${p.adjusted ? '<span class="tag adj">pin adjusted</span>' : ''}${counts[p.poleId] > 1 ? '<span class="tag dup">duplicate ID</span>' : ''}`;
        const more = [boqText(p), detailsText(p.details, ' · '), p.remarks].filter(Boolean).join(' — ');
        if (more) { const s3 = document.createElement('span'); s3.className = 's'; s3.textContent = more; info.append(s3); }
      }
      const s2 = document.createElement('span'); s2.className = 's mono';
      s2.textContent = `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}${Number.isFinite(p.accuracy) ? ` · ±${p.accuracy.toFixed(0)} m` : ''}`;
      info.prepend(t, s, s2); b.append(img, info);
      b.addEventListener('click', () => openEditorFor(p.id));
      host.appendChild(b);
      const cp = coverPid(p), load = () => { if (cp) dbGet('photos', cp).then((ph) => { if (ph && ph.thumb) { const u = URL.createObjectURL(ph.thumb); listUrls.push(u); img.src = u; } }).catch(() => {}); };
      if (thumbs) thumbs.push(load); else load(); // the photos of a closed group load when it opens
    }
    }
  }
  $('listSort').addEventListener('change', () => { S.listSort = $('listSort').value; persist(); renderList(); });
  $('listGroup').addEventListener('change', () => { S.listGroup = $('listGroup').checked; persist(); renderList(); });
  const listOpen = new Set();
  $('listFoldAll').addEventListener('click', () => {
    const btns = [...$('listItems').querySelectorAll('.lfold')], all = btns.every((b) => b.getAttribute('aria-expanded') === 'true');
    btns.forEach((b) => { if ((b.getAttribute('aria-expanded') === 'true') === all) b.click(); });
  });
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
      const none = n > 0 && !items.length; // v2.23: no defect found (site photo only)
      steps.push({ t: 'Record the defects', s: none ? 'No defects found · site photo taken' : n ? `${n} element${n === 1 ? '' : 's'} · ${items.length} deficienc${items.length === 1 ? 'y' : 'ies'} · ${open} open` : 'Photo each defect (not the pole or ODF); tag it N, D or MD — or No defects found', done: n > 0, go: 'capture', label: 'Capture' });
      steps.push({ t: 'Export the Deficiency List', s: fresh(['pdf', 'xlsx']) ? 'PDF / Excel made after the last change' : 'PDF (form + annexes) and Excel for signing and tracking', done: n > 0 && fresh(['pdf', 'xlsx']), go: 'export', label: 'Export' });
      if (none || m.noDefects) steps.push({ t: 'No defect cleanup or FAT needed', s: 'No deficiencies: the FAT is recorded as done with the PAT', done: true, go: 'export', label: 'Export' });
      else steps.push({ t: 'Share the PAT KMZ for the defect cleanup', s: handed ? (ex.sent ? `PAT KMZ shared ${fmtTime(ex.sent)}` : 'FAT started on this phone') : 'One KMZ with the defect pins and photos, for the defect cleanup and the FAT', done: handed, go: 'share', label: 'Share KMZ' });
    } else if (cat === 'Cleanup') {
      const items = pts.flatMap((p) => counting(p)), open = items.filter((d) => defStatusOf(d) === 'Open'), noPhoto = items.filter((d) => defDone(d) && !d.afterPid).length;
      steps.push({ t: 'Started from the PAT KMZ', s: `${m.fromPat || 'PAT'} · ${n} pin${n === 1 ? '' : 's'} · ${items.length} item${items.length === 1 ? '' : 's'}`, done: true, go: 'records', label: 'Records' });
      steps.push({ t: 'Fix each defect and photo it', s: items.length ? `${items.length - open.length} of ${items.length} fixed · ${open.length} open${noPhoto ? ` · ${noPhoto} without photo` : ''}` : 'No deficiencies to fix', done: items.length > 0 && !open.length, go: 'next', label: 'Next defect' });
      // v2.23: completed first: the FAT starts only from a completed cleanup
      steps.push({ t: 'Complete the cleanup', s: m.completedAt ? `Completed ${longDate(m.completedAt)}` : 'When every item is fixed: Mark task complete', done: !!m.completedAt, go: 'complete', label: 'Complete' });
      steps.push({ t: 'Share the cleanup KMZ for the FAT', s: fresh(['sent']) && m.completedAt ? `Shared ${fmtTime(ex.sent)}` : 'One KMZ with the fixed items and photos, for the inspector (or start the FAT on this phone)', done: !!m.completedAt && (fresh(['sent']) || !!childOf(S.project, 'FAT')), go: 'share', label: 'Share KMZ' });
    } else {
      const items = pts.flatMap((p) => counting(p)), open = items.filter((d) => defStatusOf(d) === 'Open'), rect = items.filter((d) => defStatusOf(d) === 'Rectified'), ver = items.filter((d) => defStatusOf(d) === 'Verified');
      steps.push({ t: m.fromStage === 'Cleanup' ? 'Started from the cleanup KMZ' : 'Started from the PAT', s: m.fromPat ? `${m.fromPat} · ${n} element${n === 1 ? '' : 's'} · ${items.length} item${items.length === 1 ? '' : 's'}` : `Started empty · ${n} element${n === 1 ? '' : 's'}`, done: true, go: 'records', label: 'Records' });
      steps.push({ t: 'Contractor rectifies', s: items.length ? `${rect.length + ver.length} of ${items.length} rectified · ${open.length} open${open.some((d) => (d.reopened || []).length) ? ' (some rejected)' : ''}` : 'No deficiencies to rectify', done: items.length > 0 && !open.length, go: 'next', label: 'Next pin' });
      steps.push({ t: 'Check and accept each fix', s: items.length ? `${ver.length} verified · ${rect.length} awaiting verification` : '—', done: items.length > 0 && ver.length === items.length, go: 'next', label: 'Next pin' });
      steps.push({ t: 'Export the final Deficiency List', s: fresh(['pdf']) ? 'PDF made after the last change' : 'Deficiency List PDF with the verified photos, and the rectification report', done: n > 0 && fresh(['pdf']), go: 'export', label: 'Export' });
    }
    if (cat !== 'Cleanup') steps.push({ t: 'Complete the task', s: m.completedAt ? `Completed ${longDate(m.completedAt)}` : 'Completion report (PDF), or Mark task complete', done: !!m.completedAt, go: 'complete', label: 'Complete' });
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
    if (taskCat() === 'PAT') { // v2.16: the form is locked with the PAT, so it is filled in first
      const m = pmeta(), out = [];
      if (!m.site) out.push('the location (Projects → form details)');
      if (!m.contractor) out.push('the vendor / contractor (Projects → form details)');
      if (!(m.vendorRep || (S.user && S.user.name))) out.push('the vendor representative (Projects → form details)');
      return out;
    }
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
  const notReady = (gaps) => (taskCat() === 'PAT'
    ? ask('Not ready to complete', `The PAT is locked when it is completed, so first fill in:\n• ${gaps.join('\n• ')}`, [{ label: 'OK', value: false, primary: true }])
    : ask('Not ready to complete', `An As-plan survey needs:\n• ${gaps.join('\n• ')}\n\nCapture ${gaps.length === 1 ? 'it' : 'them'}, then complete the task.`, [{ label: 'OK', value: false, primary: true }]));
  function renderWorkflow() {
    const W = workflowModel(), box = $('wfSteps'); box.innerHTML = '';
    W.steps.forEach((st, i) => {
      const row = document.createElement('div'); row.className = 'step' + (st.done ? ' done' : st === W.next ? ' now' : '');
      const nn = document.createElement('span'); nn.className = 'n'; nn.textContent = st.done ? '✓' : String(i + 1);
      const t = document.createElement('div'); t.className = 't';
      const b = document.createElement('b'); b.textContent = st.t; const s2 = document.createElement('span'); s2.textContent = st.s; t.append(b, s2);
      row.append(nn, t); box.appendChild(row);
    });
    const btn = $('wfNext'), pm = pmeta();
    if (pm.completedAt && ['PAT', 'Cleanup'].includes(W.cat)) { btn.hidden = true; return; } // v2.22: the next stage's buttons take over
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
    const m = pmeta(), acc = isAcc(), cat = taskCat(), nrec = projPoints().length;
    $('noProjHint').hidden = !!S.project; $('wfBox').hidden = !S.project;
    $('bulkShareBtn').hidden = !allProjects().length;
    $('addSampleBtn').hidden = allProjects().some((n) => pmeta(n).sample); // v2.26
    { const pb0 = $('projBadge').parentElement, sb = pb0.querySelector('.badge.sample'); if (sb) sb.remove(); if (S.project && pmeta().sample) { const b = document.createElement('span'); b.className = 'badge sample'; b.textContent = 'SAMPLE'; $('projBadge').after(b); } }
    $('curName').textContent = S.project || '';
    { const ct = $('curTools'); ct.replaceWith(Object.assign(projTools(S.project, false), { id: 'curTools' })); $('curTools').hidden = !S.project; }
    $('curSub').textContent = [projSummary(S.project), m.site && m.site !== S.project ? m.site : '', m.contractor || ''].filter(Boolean).join(' · ');
    { const st = $('tmState'); st.textContent = m.completedAt ? `${patClosed() ? '🔒 ' : '✓ '}Completed ${dateOnly(m.completedAt)}${m.noDefects ? ' · no defects, FAT done' : ''}` : nrec ? 'In progress' : 'Not started'; st.className = `tmstate${m.completedAt ? ' done' : nrec ? ' wip' : ''}`; }
    { const W = S.project ? workflowModel() : null, done = W ? W.steps.filter((x) => x.done).length : 0, all = W ? W.steps.length : 0;
      $('tmBar').style.width = all ? `${Math.round((done / all) * 100)}%` : '0'; $('tmProgTxt').textContent = all ? `${done} of ${all} steps done · ${S.tmSteps ? 'hide' : 'show'} steps` : '';
      $('wfSteps').hidden = !S.tmSteps; $('tmStepsBtn').setAttribute('aria-expanded', String(!!S.tmSteps)); }
    renderTaskList();
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
        b.disabled = patClosed(); box.appendChild(b);
      });
      ['mSite', 'mContractor', 'mVendorRep', 'mGlobe', 'mDate'].forEach((id) => { $(id).disabled = patClosed(); }); // the signed form stays as it was (v2.16)
      $('accActs').hidden = m.stage === 'FAT'; renderShareWarn('shareWarn');
      $('sendPatLbl').textContent = m.stage === 'Cleanup' ? 'Share cleanup KMZ · for the FAT' : 'Share PAT KMZ · for defect cleanup / FAT';
      renderStageActs(m);
    }
    if (!acc) $('accActs').hidden = true;
    $('doneInfo').hidden = !m.completedAt; $('doneInfo').textContent = m.completedAt ? `✓ Completed ${longDate(m.completedAt)}${progressFields(S.project).length ? (pendingFor(S.project) ? ' · waiting to sync' : ' · in the online sheet') : ''}` : '';
    $('doneBtn').textContent = m.completedAt ? 'Undo complete' : '✓ Mark task complete'; $('doneBtn').classList.toggle('undo', !!m.completedAt);
    renderAppr(m); // v2.28
    const locked = patClosed(); // v2.16: a completed PAT is locked; only the list's admin can reopen it
    $('doneBtn').hidden = locked && !canReopenPat();
    $('doneBtn').disabled = !m.completedAt && !nrec; // v2.22: nothing recorded, nothing to complete
    { const pat0 = cat === 'PAT' && !m.completedAt && canRecord() && !projPoints().some((r) => counting(r).length); $('noDefBtn').hidden = !pat0; // v2.23 (where this phone may record the PAT)
      if (pat0) $('noDefBtn').textContent = nrec ? '✓ No defects found · complete the PAT (FAT done)' : '✓ No defects found · take the site photo, complete the PAT (FAT done)';
      if (pat0 && !nrec) $('doneBtn').hidden = true; }
    if (locked) $('doneInfo').textContent += ` · 🔒 locked: items are tagged as fixed in the defect cleanup and the FAT${canReopenPat() ? '' : ' (only the admin can reopen it)'}`;
    { const W = S.project ? workflowModel() : null, left = W ? W.steps.filter((x) => !x.done && x.go !== 'complete').length : 0;
      $('doneBtn').classList.toggle('ready', !m.completedAt && !!nrec && !left);
      $('doneHint').textContent = m.completedAt ? '' : !nrec ? `Nothing recorded yet: capture at least one ${acc ? 'element' : 'pole'} before the task can be completed.`
        : left ? `${left} step${left === 1 ? '' : 's'} still open; complete the task when it is finished.` : 'Every step is done: mark the task complete, or export the completion report.'; }
    $('doneBox').hidden = !S.project;
    $('curStartRow').hidden = acc; $('curStart').value = m.startDate || '';
    { // v2.29: the region for the BOQ, suggested from the GPS (approximate), set by the user
      const on = !acc && boqOn(), sel = $('curRegion'), sug = on ? regionSuggest() : '';
      $('curRegionRow').hidden = !on; $('curRegionHint').hidden = !on;
      if (on) {
        sel.innerHTML = ''; sel.add(new Option(m.region ? '— not set —' : sug ? `Choose… (suggested: ${REGION_BY[sug][1]})` : 'Choose…', ''));
        PH_REGIONS.forEach(([k]) => sel.add(new Option(`${regionLabel(k)}${k === sug ? ' · suggested from GPS' : ''}`, k)));
        sel.value = m.region || '';
        $('curRegionHint').textContent = m.region ? `${regionLabel(m.region)}${sug && sug !== m.region ? ` (the GPS suggests ${REGION_BY[sug][1]}: check it)` : ''}`
          : sug ? `Suggested from the GPS: ${regionLabel(sug)}. Approximate near a regional border: choose it above to confirm.` : 'Choose the region: it goes on the BOQ (no record with GPS yet to suggest it).';
      }
    }
    $('delProjConfirm').hidden = true; $('delProject').hidden = false; // v2.22: a completed project is deleted with an admin's approval
  }
  /* v2.22: the projects on this phone as a task list (filter, search, progress); tap one to open it. */
  let tmShow = 'active', tmKind = '';
  const tmCache = {};
  function taskInfo(name) {
    const pts = points.filter((p) => p.project === name), m = pmeta(name);
    const key = `${pts.length}|${pts.reduce((t, p) => (p.updated > t ? p.updated : t), '')}|${JSON.stringify(m)}|${allProjects().length}`;
    if (tmCache[name] && tmCache[name].key === key) return tmCache[name];
    const was = S.project; let W = null;
    try { S.project = name; W = workflowModel(); } catch (e) { W = null; } finally { S.project = was; }
    const steps = W ? W.steps : [], done = steps.filter((x) => x.done).length;
    const last = pts.reduce((t, p) => (p.updated > t ? p.updated : t), m.created || '');
    return (tmCache[name] = { key, n: pts.length, done, all: steps.length, next: W && W.next ? W.next.t : '', last, completed: !!m.completedAt });
  }
  /** v2.28: Other projects folds open or shut (kept on this phone). */
  const otherToggle = () => { S.otherShut = !S.otherShut; persist(); renderTaskList(); };
  $('tmListTitle').addEventListener('click', otherToggle);
  $('tmListTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); otherToggle(); } });
  function renderTaskList() {
    const names = allProjects().filter((n) => n !== S.project), q = $('projSearch').value.trim(), box = $('taskList'); box.innerHTML = '';
    $('tmListBox').hidden = !names.length;
    if (!names.length) return;
    $('tmListCount').textContent = String(names.length); $('tmListBox').classList.toggle('shut', !!S.otherShut); $('tmListTitle').setAttribute('aria-expanded', String(!S.otherShut)); // v2.28
    $('projSearch').hidden = names.length < 4 && !q;
    const info = Object.fromEntries(names.map((n) => [n, taskInfo(n)]));
    const nAct = names.filter((n) => !info[n].completed).length, nDone = names.length - nAct;
    if (tmShow === 'active' && !nAct && nDone) tmShow = 'all';
    const kinds = ['survey', 'PAT', 'Cleanup', 'FAT'].filter((k) => names.some((n) => projKind(n) === k));
    if (tmKind && !kinds.includes(tmKind)) tmKind = '';
    const fil = $('tmFilter'); fil.innerHTML = '';
    const chip = (label, on, fn, cls) => { const c = document.createElement('button'); c.type = 'button'; c.className = `chip small${cls ? ' ' + cls : ''}`; c.textContent = label; c.setAttribute('aria-pressed', String(on)); c.addEventListener('click', fn); fil.appendChild(c); };
    [['active', `In progress · ${nAct}`], ['done', `Completed · ${nDone}`], ['all', `All · ${names.length}`]].forEach(([k, l]) => chip(l, tmShow === k, () => { tmShow = k; renderTaskList(); }));
    if (kinds.length > 1) kinds.forEach((k) => chip(STAGE_LABEL[k], tmKind === k, () => { tmKind = tmKind === k ? '' : k; renderTaskList(); }, `kind k-${k.toLowerCase()}`));
    const shown = names.filter((n) => (tmShow === 'all' || (tmShow === 'done') === info[n].completed) && (!tmKind || projKind(n) === tmKind) && (!q || projMatch(n, q)))
      .sort((a, b) => (info[a].completed - info[b].completed) || (info[a].last < info[b].last ? 1 : -1));
    shown.forEach((name) => {
      const t = info[name], k = projKind(name), m = pmeta(name);
      const b = document.createElement('button'); b.type = 'button'; b.className = `task k-${k.toLowerCase()}${t.completed ? ' done' : ''}`; b.dataset.name = name;
      const badge = document.createElement('span'); badge.className = `badge cat ${k === 'survey' ? '' : k.toLowerCase()}`; badge.textContent = (k === 'survey' ? 'SURVEY' : k === 'Cleanup' ? 'CLEANUP' : k).toUpperCase();
      const ti = document.createElement('span'); ti.className = 'ti';
      const tn = document.createElement('span'); tn.className = 'tn'; tn.textContent = name;
      const ts = document.createElement('span'); ts.className = 'ts'; ts.textContent = [projSummary(name), m.site && m.site !== name ? m.site : ''].filter(Boolean).join(' · ');
      const tp = document.createElement('span'); tp.className = 'tp';
      const bar = document.createElement('span'); bar.className = 'bar'; const fill = document.createElement('i'); fill.style.width = t.all ? `${Math.round((t.done / t.all) * 100)}%` : '0'; bar.appendChild(fill);
      const tx = document.createElement('span'); tx.textContent = t.completed ? `${patClosed(name) ? '🔒 ' : '✓ '}Completed ${dateOnly(m.completedAt)}${m.noDefects ? ' · no defects, FAT done' : ''}` : !t.n ? 'Not started' : t.next ? `Next: ${t.next}` : `${t.done} of ${t.all} steps`;
      tp.append(bar, tx); ti.append(tn, ts, tp); b.append(badge, ti);
      if (m.sample) { const sb = document.createElement('span'); sb.className = 'badge sample'; sb.textContent = 'SAMPLE'; ti.prepend(sb); }
      b.addEventListener('click', () => openTask(name));
      const card = document.createElement('div'); card.className = `taskcard k-${k.toLowerCase()}${t.completed ? ' done' : ''}`; card.dataset.name = name;
      card.append(b, projTools(name, true)); // v2.26: Share, Folder and Delete on every project
      box.appendChild(card);
    });
    if (!shown.length) { const p0 = document.createElement('p'); p0.className = 'hint'; p0.style.margin = '4px 2px'; p0.textContent = q ? 'No project matches the search.' : tmShow === 'done' ? 'No completed project.' : 'No project in progress.'; box.appendChild(p0); }
  }
  /* v2.26: the tools of a project, on its card: Share, Folder (its Drive folder from the online sheet) and Delete */
  const TOOL_ICON = { ref: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14', share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7 8l5-5 5 5', folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z', del: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6' };
  function projTools(name, small) {
    const row = document.createElement('div'); row.className = 'tmtools'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', `Project ${name}`);
    if (!name) return row;
    const m = pmeta(name);
    const mk = (kind, label, fn, title) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = `tmtool ${kind}`; b.dataset.tool = kind; b.title = title;
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${TOOL_ICON[kind]}"/></svg>`;
      b.appendChild(document.createTextNode(label)); b.setAttribute('aria-label', `${label} ${name}`);
      b.addEventListener('click', (e) => { e.stopPropagation(); guard(() => fn(name), `${label} failed`); });
      row.appendChild(b);
    };
    mk('share', 'Share', shareProject, 'Send this project to a colleague (a file with its records and photos)');
    if (m.siteLink) mk('folder', 'Folder', (n) => openExternal(pmeta(n).siteLink), 'Open its Google Drive folder');
    if (!small && name === S.project) mk('ref', refInfo(name) ? 'KMZ ✓' : 'KMZ', refTool, 'The KMZ reference of this project (e.g. the As-Plan for an As-Built): load, show or hide, replace'); // v2.28
    mk('del', 'Delete', deleteProject, 'Delete this project from this phone');
    return row;
  }
  /** v2.28: the KMZ reference from the open project's card: load one, or show / hide, replace or remove it. */
  async function refTool(name) {
    const info = refInfo(name);
    if (!info) { $('refInput').value = ''; $('refInput').click(); return; }
    const hidden = (S.refHidden || {})[name];
    const how = await ask('KMZ reference', `${info.name}: ${[info.n.lines && `${info.n.lines} line${info.n.lines === 1 ? '' : 's'}`, info.n.pins && `${info.n.pins} pin${info.n.pins === 1 ? '' : 's'}`, info.n.plan && `As-Plan: ${info.n.plan} element${info.n.plan === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}${hidden ? ' · hidden on the map' : ''}.`,
      [{ label: 'Cancel', value: '' }, { label: hidden ? 'Show on the map' : 'Hide on the map', value: 'toggle' }, { label: 'Remove', value: 'remove' }, { label: 'Replace…', value: 'replace', primary: true }]);
    if (how === 'toggle') $('refToggle').click(); else if (how === 'remove') $('refRemove').click(); else if (how === 'replace') { $('refInput').value = ''; $('refInput').click(); }
  }
  /** Share one project: the project file (records and photos, for a colleague of your company); a PAT or cleanup can also go as
      its locked KMZ for the next stage. */
  async function shareProject(name) {
    const m = pmeta(name), st = m.mode === 'acceptance' ? m.stage || 'PAT' : '';
    let how = 'file';
    if ((st === 'PAT' || st === 'Cleanup') && !m.noDefects && !m.sample) {
      how = await ask(`Share “${name}”`, st === 'PAT'
        ? 'PAT KMZ: for the contractor\'s defect cleanup or the FAT (locked: Google Earth shows the map, G-eSAA phones of your list open the records).\n\nProject file: the project itself, for a colleague of your company.'
        : 'Cleanup KMZ: for the FAT.\n\nProject file: the project itself, for a colleague of your company.',
      [{ label: 'Cancel', value: '' }, { label: 'Project file', value: 'file' }, { label: st === 'PAT' ? 'PAT KMZ' : 'Cleanup KMZ', value: 'kmz', primary: true }]);
      if (!how) return;
    }
    if (how === 'kmz') { if (name !== S.project) openTask(name); await tutWait(150); $('sendPat').click(); return; }
    if (!profileOk()) { toast('Enter your details first (Settings → You)'); return; }
    const blob = await bundleZip([name]); busy(false);
    LOG.info('project.share', { kind: projKind(name), mb: +(blob.size / 1048576).toFixed(1) });
    await shareFile(blob, `G-eSAA_${String(name).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60)}_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
  }
  /** Delete a project (any, not only the open one): a completed one needs an admin's approval; always asked first. */
  async function deleteProject(name) {
    const m = pmeta(name), n = points.filter((p) => p.project === name).length, acc = m.mode === 'acceptance';
    if (m.completedAt && S.team && !m.sample && !(await adminApproves(`Deleting the completed project “${name}”`))) return;
    const ok = await ask(`Delete “${name}”?`, `Its ${n} ${acc ? 'element' : 'record'}${n === 1 ? '' : 's'}, photos and offline maps are removed from this phone. Make a backup or share it first if you still need it. This can't be undone.`,
      [{ label: 'Keep', value: false }, { label: 'Delete project', value: true, primary: true }]);
    if (ok) await deleteProjectNow(name);
  }
  async function deleteProjectNow(name) {
    const pts = points.filter((p) => p.project === name), m = pmeta(name);
    LOG.info('project.delete', { cat: projKind(name), completed: !!m.completedAt, records: pts.length, sample: !!m.sample });
    let i = 0;
    const ids = new Set(pts.map((p) => p.id)), pids = [];
    for (const p of pts) { busy(`Deleting ${++i} / ${pts.length}`, i / pts.length); await dbDel('points', p.id); pids.push(...allPids(p)); }
    await deletePhotosIfUnused(pids, ids); busy(false);
    points = points.filter((p) => p.project !== name);
    if (S.meta) delete S.meta[name];
    for (const ar of (S.areas || []).filter((x) => x.project === name)) await deleteArea(ar.id);
    if (refInfo(name)) { await dbDel('packs', refKey(refInfo(name).id)).catch(() => {}); const r = { ...S.refs }; delete r[name]; S.refs = r; if (refFor === name) { refGeo = null; refFor = null; } }
    S.projects = S.projects.filter((x) => x !== name);
    if (S.project === name) S.project = allProjects()[0] || '';
    persist();
    renderPoles(); drawAreas(); renderProjects();
    toast(`Deleted "${name}"`);
  }
  function openTask(name) {
    if (!name || name === S.project) return;
    S.project = name; persist(); renderPoles(); fitProject(); $('curMore').open = false; renderProjects();
    const body = $('projects').querySelector('.body'); if (body) body.scrollTop = 0;
    toast(`Now working on: ${name}`);
  }
  $('tmNew').addEventListener('click', () => openNewProject());
  $('tmStepsBtn').addEventListener('click', () => { S.tmSteps = !S.tmSteps; persist(); renderProjects(); });
  /** The next stage from this PAT or cleanup on this phone: start it, or open the one already started. */
  const childOf = (name, stage) => allProjects().find((x) => pmeta(x).mode === 'acceptance' && pmeta(x).stage === stage && pmeta(x).fromPat === (pmeta(name).fromPat || name) && (stage === 'Cleanup' || pmeta(x).fromStage === (pmeta(name).stage || 'PAT')));
  /** The FAT of a PAT (started from it or from its cleanup) or of a cleanup. */
  const fatOf = (name) => childOf(name, 'FAT') || ((pmeta(name).stage || 'PAT') === 'PAT' && childOf(name, 'Cleanup') ? childOf(childOf(name, 'Cleanup'), 'FAT') : null);
  function renderStageActs(m) {
    const st = m.stage || 'PAT', done = !!m.completedAt, cl = st === 'PAT' ? childOf(S.project, 'Cleanup') : null, fat = fatOf(S.project);
    const sc = $('startCleanup'), sf = $('startFat'), hint = $('stageHint');
    if (m.noDefects) { // v2.23: nothing to rectify: no cleanup, no FAT
      sc.hidden = true; sf.hidden = true; $('sendPat').hidden = true; $('shareWarn').hidden = true; hint.hidden = false;
      hint.textContent = `No deficiencies found: the PAT and the FAT are done (${dateOnly(m.completedAt)}). No defect cleanup or FAT is needed.`; return;
    }
    sf.hidden = false; $('sendPat').hidden = false;
    // v2.23: the FAT only after the contractor's cleanup is completed (on this phone); else no FAT button
    const clDone = st === 'Cleanup' ? done : !!(cl && pmeta(cl).completedAt);
    if (!fat && !clDone) sf.hidden = true;
    sc.hidden = !(st === 'PAT' && (done || cl));
    sc.textContent = cl ? `🛠 Open the defect cleanup “${cl}”` : '🛠 Start the defect cleanup (photo each fix)';
    sf.textContent = fat ? `✓ Open the FAT “${fat}”` : cl ? '✓ Start the FAT from the completed cleanup' : '✓ Start the FAT (check each fix on site)';
    sf.classList.toggle('primary', done && (st === 'Cleanup' || !!cl));
    sc.classList.toggle('primary', !cl);
    hint.hidden = !done;
    hint.textContent = st === 'PAT' ? (cl && !clDone ? `PAT completed. The defect cleanup “${cl}” is in progress: the FAT starts once it is completed.` : 'PAT completed. Next: the defect cleanup — the contractor photographs each fixed item (with a note if needed) — then, once the cleanup is completed, the FAT, where the inspector checks each fix on site with a photo.')
      : 'Cleanup completed. Next: the FAT — the inspector checks each fix on site with a photo (share the cleanup KMZ, or start the FAT here).';
    if (st === 'Cleanup' && !done) { hint.hidden = false; hint.textContent = 'When every item is fixed and photographed, mark the cleanup complete: the FAT starts only from a completed cleanup (here, or from its shared KMZ).'; }
  }
  $('startCleanup').addEventListener('click', () => guard(async () => {
    const cl = childOf(S.project, 'Cleanup'); if (cl) { openTask(cl); return; }
    if (!(await shareGate('fix'))) return;
    await startStageFrom(S.project, 'Cleanup');
  }, 'Defect cleanup not started'));
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
  /* v2.21: many projects on one phone: a search (name, category, site, vendor, task ID, notes) */
  const projWords = (name) => { const m = pmeta(name); return [name, STAGE_LABEL[projKind(name)], PURPOSE_LABEL[m.purpose] || '', m.site, m.contractor, m.taskId, m.notes, m.fromPat].filter(Boolean).join(' ').toLowerCase(); };
  const projMatch = (name, q) => { const w = projWords(name); return String(q || '').toLowerCase().split(/\s+/).filter(Boolean).every((t) => w.includes(t)); };
  $('projSearch').addEventListener('input', renderTaskList);

  /* v2.21: several projects in one file, for a colleague of the same company (safe keeping, a handover when someone leaves) */
  let bsSel = new Set(), bsKind = 'all';
  const projPhotos = (name) => new Set(points.filter((p) => p.project === name).flatMap(allPids)).size;
  function renderBulk() {
    const q = $('bsSearch').value.trim(), list = $('bsList'); list.innerHTML = '';
    const kinds = [['all', 'All'], ['survey', 'Survey'], ['PAT', 'PAT'], ['Cleanup', 'Defect Cleanup'], ['FAT', 'FAT']].filter(([k]) => k === 'all' || allProjects().some((n) => projKind(n) === k));
    const kb = $('bsKinds'); kb.innerHTML = '';
    kinds.forEach(([k, lbl]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = lbl; b.setAttribute('aria-pressed', String(bsKind === k)); b.addEventListener('click', () => { bsKind = k; renderBulk(); }); kb.appendChild(b); });
    const shown = allProjects().filter((n) => (bsKind === 'all' || projKind(n) === bsKind) && (!q || projMatch(n, q)));
    shown.forEach((name) => {
      const l = document.createElement('label'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = bsSel.has(name);
      cb.addEventListener('change', () => { if (cb.checked) bsSel.add(name); else bsSel.delete(name); bulkCount(); });
      const d = document.createElement('div'), t = document.createElement('b'); t.textContent = name;
      const sub = document.createElement('span'); sub.className = 's'; const m = pmeta(name); sub.textContent = [projSummary(name), `${projPhotos(name)} photo${projPhotos(name) === 1 ? '' : 's'}`, m.site && m.site !== name ? m.site : ''].filter(Boolean).join(' · ');
      d.append(t, sub); l.append(cb, d); list.appendChild(l);
    });
    if (!shown.length) { const p0 = document.createElement('p'); p0.className = 'hint'; p0.textContent = 'No project matches.'; list.appendChild(p0); }
    $('bsAll').onclick = () => { shown.forEach((n) => bsSel.add(n)); renderBulk(); };
    bulkCount();
  }
  function bulkCount() {
    const names = [...bsSel].filter((n) => allProjects().includes(n)), recs = names.reduce((t, n) => t + points.filter((p) => p.project === n).length, 0), ph = names.reduce((t, n) => t + projPhotos(n), 0);
    $('bsCount').textContent = names.length ? `${names.length} project${names.length === 1 ? '' : 's'} · ${recs} records · ${ph} photos` : 'None chosen';
    $('bsGo').disabled = !names.length; $('bsGo').textContent = names.length ? `Share ${names.length} project${names.length === 1 ? '' : 's'}` : 'Share';
  }
  $('bulkShareBtn').addEventListener('click', () => { bsSel = new Set(S.project ? [S.project] : []); bsKind = 'all'; $('bsSearch').value = ''; openSheet('bulkShare'); renderBulk(); });
  $('bsSearch').addEventListener('input', renderBulk);
  $('bsNone').addEventListener('click', () => { bsSel.clear(); renderBulk(); });
  $('bsGo').addEventListener('click', () => guard(async () => {
    const names = [...bsSel].filter((n) => allProjects().includes(n)); if (!names.length) return;
    if (!profileOk()) { toast('Enter your details first (Settings → You)'); return; }
    const blob = await bundleZip(names); busy(false);
    const who = String((S.user && S.user.name) || 'G-eSAA').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'G-eSAA';
    LOG.info('bundle.share', { projects: names.length, mb: +(blob.size / 1048576).toFixed(1) });
    await shareFile(blob, `G-eSAA_${who}_${names.length}_projects_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
  }, 'Projects not shared'));
  /** The chosen projects as one ZIP: bundle.json (what is inside, who sent it), each project as a backup (p1/points.json…), the photos once. */
  async function bundleZip(names) {
    const now = new Date().toISOString(), files = [], list = [], seen = new Set(); let bytes = 0, k = 0;
    const allP = names.reduce((t, n) => t + projPhotos(n), 0); let done = 0;
    for (const name of names) {
      k++;
      const pts = points.filter((p) => p.project === name).sort((a, b) => (a.created < b.created ? -1 : 1));
      files.push({ name: `p${k}/points.json`, data: JSON.stringify({ app: 'PoleCam', version: 2, project: name, meta: pmeta(name), exported: now, by: byLine(), exportedBy: exporterInfo(), points: pts }, null, 1) });
      for (const pid of new Set(pts.flatMap(allPids))) {
        busy(`Packing photos ${++done} / ${allP}`, done / Math.max(1, allP));
        if (seen.has(pid)) continue; seen.add(pid);
        const ph = await dbGet('photos', pid).catch(() => null);
        if (ph && ph.clean) { const d = new Uint8Array(await ph.clean.arrayBuffer()); bytes += d.length; files.push({ name: `photos/${pid}.jpg`, data: d }); }
        if (ph && ph.thumb) { const d = new Uint8Array(await ph.thumb.arrayBuffer()); bytes += d.length; files.push({ name: `thumbs/${pid}.jpg`, data: d }); }
        if (bytes > 1.5e9) throw new Error('more than 1.5 GB of photos: share fewer projects at a time');
      }
      list.push({ name, file: `p${k}/points.json`, kind: projKind(name), records: pts.length });
    }
    files.unshift({ name: 'bundle.json', data: JSON.stringify({ app: 'G-eSAA', kind: 'bundle', v: 1, exported: now, by: byLine(), exportedBy: exporterInfo(), team: S.team ? S.team.id : '', projects: list }, null, 1) });
    files.push({ name: 'exported_by.txt', data: exporterText().replace(/^Project: .*$/m, `Projects: ${names.join(', ')}`) });
    busy('Making the file…');
    return new Blob(C.makeZipParts(files), { type: 'application/zip' });
  }
  /** Opens a file of several projects (from bundleZip). */
  async function openBundle(z, f) {
    const b = JSON.parse(new TextDecoder().decode(await z.get('bundle.json')));
    if (!b || b.kind !== 'bundle' || !Array.isArray(b.projects) || !b.projects.length) throw new Error('This is not a G-eSAA projects file');
    const from = b.exportedBy || {}, mine = (S.user && S.user.company) || '';
    const other = !!(from.company && mine && normCo(from.company) !== normCo(mine)); // “ABC Builders Inc.” = “ABC Builders, Inc”
    const clash = b.projects.filter((p) => allProjects().includes(p.name));
    const lines = b.projects.slice(0, 8).map((p) => `• ${p.name} · ${STAGE_LABEL[p.kind] || p.kind} · ${p.records} record${p.records === 1 ? '' : 's'}`).join('\n') + (b.projects.length > 8 ? `\n• and ${b.projects.length - 8} more` : '');
    const text = `${b.projects.length} project${b.projects.length === 1 ? '' : 's'} from ${from.name || 'another phone'}${from.company ? ` (${from.company})` : ''}, ${dateOnly(b.exported)}:\n${lines}`
      + (clash.length ? `\n\n${clash.length} ${clash.length === 1 ? 'has' : 'have'} the same name as a project on this phone. “Add to them” puts the records together (a record already here is updated); “Keep apart” adds the sender's name to the copies.` : '')
      + (other ? `\n\nThis file is from ${from.company}, not from your company (${mine}).` : '');
    const btns = clash.length ? [{ label: 'Add to them', value: 'merge', primary: true }, { label: 'Keep apart', value: 'apart' }] : [{ label: `Open ${b.projects.length === 1 ? 'it' : `the ${b.projects.length} projects`}`, value: 'merge', primary: true }];
    const pick = await ask('Projects from a colleague', text, [{ label: 'Cancel', value: '' }, ...btns]);
    if (!pick) return;
    if (other && !(await ask('Another company’s projects', `Open projects of ${from.company} on your phone? Only do this if you are allowed to keep them.`, [{ label: 'Cancel', value: false }, { label: 'Open anyway', value: true, primary: true }]))) return;
    if (f && sharedDefer(f)) return;
    let n = 0, recs = 0;
    try {
      for (const p of b.projects) {
        const raw = await z.get(p.file); if (!raw) continue;
        const meta = JSON.parse(new TextDecoder().decode(raw)); if (!meta || !Array.isArray(meta.points)) continue;
        busy(`Opening ${p.name}…`, n / b.projects.length);
        await restoreMeta(z, meta, '', { quiet: true, apart: pick === 'apart' ? (from.name || 'colleague') : '' });
        n++; recs += meta.points.length;
      }
    } finally { busy(false); }
    LOG.info('bundle.open', { projects: n, records: recs, other, apart: pick === 'apart' });
    await closeAll(); renderPoles(); fitProject();
    toast(`${n} project${n === 1 ? '' : 's'} added · ${recs} records`, 5000);
  }
  [['mSite', 'site'], ['mContractor', 'contractor'], ['mGlobe', 'globeRep'], ['mDate', 'date'], ['curNotes', 'notes']].forEach(([id, key]) => {
    $(id).addEventListener('change', () => { const m = { ...pmeta() }; m[key] = $(id).value.trim(); S.meta = S.meta || {}; S.meta[S.project] = m; persist(); });
  });
  $('startFat').addEventListener('click', () => guard(async () => {
    const f = fatOf(S.project); if (f) { openTask(f); return; }
    // v2.22: after a defect cleanup, the FAT starts from the cleanup, which carries the fixes and their photos
    const cl = taskCat() === 'PAT' ? childOf(S.project, 'Cleanup') : null;
    // v2.23: only from a completed cleanup
    if (taskCat() === 'PAT') { if (cl && pmeta(cl).completedAt) await startFatFrom(cl); else toast('The FAT starts from the completed defect cleanup: start the cleanup and complete it first.', 5500); return; }
    if (!pmeta().completedAt) { toast('Mark the defect cleanup complete first: the FAT starts from a completed cleanup.', 5500); return; }
    if (await shareGate('verify')) await startFatFrom(S.project);
  }, 'FAT not started'));
  $('curFolder').addEventListener('click', () => { const l = pmeta().siteLink; if (l) openExternal(l); });
  $('curRegion').addEventListener('change', () => { S.meta = S.meta || {}; const m = { ...pmeta() }; if ($('curRegion').value) m.region = $('curRegion').value; else delete m.region; S.meta[S.project] = m; persist(); renderProjects(); }); // v2.29
  $('curStart').addEventListener('change', () => { S.meta = S.meta || {}; S.meta[S.project] = { ...pmeta(), startDate: $('curStart').value }; persist(); queueProgress(S.project, ['surveyStart']); renderProjects(); });
  $('doneBtn').addEventListener('click', async () => {
    const m = pmeta(), col = progressFields(S.project).filter(([f]) => f !== 'surveyStart').map(([f]) => PROGRESS_COL[f])[0];
    if (!m.completedAt && taskCat() === 'PAT' && patNoDefects()) { await completeNoDefects(); return; } // v2.23
    if (!m.completedAt) { const gaps = await completeGaps(); if (gaps.length) { await notReady(gaps); return; } }
    const pat = taskCat() === 'PAT';
    if (m.completedAt && pat && !canReopenPat()) { toast('A completed PAT is locked. Only the admin of the company list can reopen it.', 5000); return; }
    // v2.22: reopening a completed project on a user's phone needs an admin's approval too (it would otherwise get round the delete approval)
    if (m.completedAt && S.team && !isAdmin() && !(await adminApproves(`Reopening the completed project “${S.project}”`))) return;
    const ok = m.completedAt
      ? await ask('Undo complete?', `The task is no longer marked complete${col ? `, and the ${col} is cleared in the online sheet` : ''}.${pat ? ' The PAT is unlocked: its elements and items can be changed and removed again.' : ''}`, [{ label: 'Cancel', value: false }, { label: 'Undo', value: true, primary: true }])
      : await ask(pat ? 'Complete and lock the PAT?' : 'Mark the task complete?', `Today is recorded as the completion date${col ? ` (${col} in the online sheet)` : ''}. You can also export the completion report (Export → Completion report).${pat ? `\n\nThe PAT is then locked: no element or item can be added, changed or removed, by anyone on this phone. Items are tagged as fixed in the defect cleanup and the FAT.${S.team ? ' Only the admin of the company list can reopen it.' : ''}` : ''}`, [{ label: 'Cancel', value: false }, { label: pat ? 'Complete and lock' : 'Mark complete', value: true, primary: true }]);
    if (!ok) return;
    if (pat) LOG.info('pat.lock', { on: !m.completedAt, admin: isAdmin() });
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
    // v2.23: a PAT with no defects is also the FAT: both dates go to the online sheet
    return st === 'PAT' ? [['pat', m.completedAt || ''], ...(m.noDefects ? [['fat', m.completedAt || '']] : [])] : st === 'FAT' ? [['fat', m.completedAt || '']] : [];
  }
  const pendingFor = (name) => (S.syncQ || []).some((q) => q.project === name);
  function markComplete(on, how) {
    const m = { ...pmeta() };
    if (on) {
      if (m.completedAt) return; m.completedAt = todayIso(); m.completedHow = how;
      if (taskCat() === 'PAT' && patNoDefects()) m.noDefects = { at: new Date().toISOString(), by: byLine() }; // v2.23: the FAT is done too
    } else { delete m.completedAt; delete m.completedHow; delete m.approval; } // v2.28: reopened: the on-site approval no longer stands
    S.meta[S.project] = m; persist(); LOG.info('task.complete', { on, how, cat: taskCat(), noDefects: !!m.noDefects }); queueProgress(S.project, ['surveyDone', 'pat', 'fat']);
    if (!on && m.noDefects) { delete m.noDefects; S.meta[S.project] = m; persist(); } // reopened: its FAT date was cleared above, with the PAT date
  }
  /** v2.23: a PAT where no defect was found: something recorded (the site photo), no deficiency (N, D or MD) in it. */
  const patNoDefects = (name) => { const pts = points.filter((p) => p.project === (name || S.project)); return pts.length > 0 && !pts.some((r) => counting(r).length); };
  /** Completes a PAT where no defect was found: the PAT is locked and the FAT is recorded as done on the same date. */
  async function completeNoDefects() {
    if (taskCat() !== 'PAT' || pmeta().completedAt) return;
    if (!canRecord()) { toast('Only the admin company records the PAT on this company list.', 5000); return; }
    if (!patNoDefects()) { toast('Deficiencies are recorded in this PAT: complete it with Mark task complete.', 5000); return; }
    const gaps = await completeGaps(); if (gaps.length) { await notReady(gaps); return; }
    const col = progressFields(S.project).length || pmeta().taskId;
    const ok = await ask('Complete the PAT — no defects found?', `Today is recorded as the PAT date and as the FAT date${col ? ' (both in the online sheet)' : ''}: with no deficiency there is nothing to rectify, so no defect cleanup and no FAT are needed.\n\nThe PAT is locked. The Deficiency List, the completion report and the KMZ say “No deficiencies found”.${S.team ? ' Only the admin of the company list can reopen it.' : ''}`,
      [{ label: 'Cancel', value: false }, { label: 'Complete — no defects', value: true, primary: true }]);
    if (!ok) return;
    LOG.info('pat.nodefects', { records: projPoints().length });
    markComplete(true, 'nodefects'); renderProjects(); renderPoles();
    toast('PAT completed: no defects found · FAT recorded as done', 4500);
  }
  $('noDefBtn').addEventListener('click', () => guard(async () => {
    if (taskCat() !== 'PAT' || pmeta().completedAt) return;
    if (!canRecord()) { toast('Only the admin company records the PAT on this company list.', 5000); return; }
    if (projPoints().some((r) => counting(r).length)) { toast('Deficiencies are recorded in this PAT: complete it with Mark task complete.', 5000); return; }
    const gaps = await completeGaps(); if (gaps.length) { await notReady(gaps); return; }
    if (patNoDefects()) { await completeNoDefects(); return; } // a site photo is already there
    const go = await ask('No defects found', 'You confirm that the inspection found no deficiency at this site.\n\nTake one photo of the site: it is kept with its GPS position, time and your name as the evidence of the inspection. After Save, the PAT is completed and locked, and the FAT is recorded as done on the same date.',
      [{ label: 'Cancel', value: false }, { label: 'Take the site photo', value: true, primary: true }]);
    if (!go) return;
    await closeAll(); openCamera('nodef'); toast('Site photo: the inspected site or element, no defect', 3500);
  }, 'Not completed'));
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
      items.push({ head: `#${b.no} · ${b.loc ? `${b.loc} · ` : ''}${b.text}`, right: `${b.code} · ${b.status}`, rightTone: b.statusTone, notes, photos });
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
    if (!pts.length && !pmeta().completedAt) { toast(`Nothing recorded yet: capture at least one ${acc ? 'element' : 'pole'} before the task can be completed.`, 5000); return; } // v2.22
    if (!pmeta().completedAt) {
      const gaps = await completeGaps(); if (gaps.length) { await notReady(gaps); return; }
      // v2.16: the report completes the task, and completing a PAT locks it: asked first
      if (taskCat() === 'PAT' && patNoDefects()) { await completeNoDefects(); if (!pmeta().completedAt) return; } // v2.23: no defects: PAT and FAT done
      else if (taskCat() === 'PAT' && !(await ask('Complete and lock the PAT?', `The completion report marks the PAT complete. It is then locked: no element or item can be added, changed or removed, by anyone on this phone. Items are tagged as fixed in the defect cleanup and the FAT.${S.team ? ' Only the admin of the company list can reopen it.' : ''}`, [{ label: 'Cancel', value: false }, { label: 'Complete and lock', value: true, primary: true }]))) return;
      markComplete(true, 'report');
    }
    const m = pmeta(), R = window.PoleReports, k = acc ? m.stage || 'PAT' : 'survey';
    const catLabel = STAGE_LABEL[k], purpose = PURPOSE_LABEL[acc ? k : m.purpose || 'As-plan'];
    let summary = [];
    if (!acc) { const Rt = routeModel(), len = Rt.spans.reduce((t, s) => t + s.len, 0); summary = [['Poles captured', pts.filter((p) => elemOf(p) === 'Pole').length], ['Other points', pts.filter((p) => elemOf(p) !== 'Pole').length], ['Spans linked', Rt.spans.length], ['Route length (m)', Math.round(len)], ['Long spans', Rt.long, Rt.long ? 'bad' : 'good']]; }
    else { const M = accModel(); summary = !M.counted.length && k === 'PAT' // v2.23: no defects found
      ? [['Elements', M.recs.length], ['Deficiencies', 0, 'good'], ['To rectify', 0, 'good'], ['FAT', 'Done', 'good']]
      : [['Elements', M.recs.length], ['Deficiencies', M.counted.length], ['Still open', M.open.length, M.open.length ? 'bad' : 'good'], [k === 'FAT' ? 'Verified' : 'Rectified', k === 'FAT' ? M.verified : M.rectified + M.verified, 'blue']]; }
    const ex = m.exports || {}, made = Object.entries(ex).filter(([kk]) => kk !== 'completion').map(([kk, at]) => `${kk.toUpperCase()} ${shortTime(at)}`).join(' · ');
    const info = [['Project', S.project], ['Task category', catLabel], ['Location / site', m.site || ''], ['Purpose', purpose], ['Vendor (contractor)', m.contractor || (S.user && S.user.company) || ''], ['Site ID (online sheet)', m.taskId || '—'],
      [acc ? 'Inspection date' : 'Started', longDate(acc ? m.date : m.startDate) || '—'], ['Completed', longDate(m.completedAt)]];
    const ph = $('complPhotos').checked && pts.length ? await (acc ? defectPhotos(accModel()) : polePhotos(pts)) : null;
    const photoLine = ph ? ph.line + (ph.missing ? ` · ${ph.missing} record photo${ph.missing === 1 ? '' : 's'} missing on this phone` : '') : pts.length ? 'Not included' : '—';
    const npl = pts.filter((p) => elemOf(p) === 'Pole').length;
    const boqT = !acc && boqOn() && pts.length ? boqTable(pts, await planFor()) : null; // v2.26.1: the BOQ of the As-Plan / As-Built, on its own page
    const photoAt = (t) => (boqT ? t.replace('(from page 2)', '(after the BOQ / BOM page)') : t);
    const details = [['Records', acc ? `${pts.length} element${pts.length === 1 ? '' : 's'}` : `${npl} pole${npl === 1 ? '' : 's'}${pts.length > npl ? ` · ${svCountText(pts)}` : ''}`], ['Recorded by', peopleText() || byLine()],
      ['Photos', photoAt(photoLine)], ['Exports made', made || '—'], ['Reference KMZ', (refInfo() && refInfo().name) || '—'],
      ...(boqT ? [['BOQ / BOM', `${boqT.rows.length ? `${boqT.rows.length} line${boqT.rows.length === 1 ? '' : 's'}${boqT.compare ? ', planned against built' : ''}` : 'no size recorded yet'} \u2014 see the BOQ / BOM page`]] : []), ...(m.fromPat ? [['From', `${m.fromStage || 'PAT'} “${m.fromPat}”`]] : []), ['Remarks / notes', m.notes || '—']];
    const same = purpose === catLabel; // PAT, FAT: the purpose is the category
    const ap = m.approval || null; // v2.28: the on-site approval (signed QR code)
    const pdf = R.completionPdf({ title: 'TASK COMPLETION REPORT', stageLong: same ? catLabel : `${catLabel} · ${purpose}`, statement: `${catLabel}${same ? '' : ` (${purpose})`} of ${m.site || S.project} completed on ${longDate(m.completedAt)}.${m.noDefects ? ' No deficiencies were found: the FAT is recorded as done on the same date.' : ''}`,
      info, summary, details, signers: [{ role: 'Prepared by (contractor representative)', name: m.vendorRep || (S.user && S.user.name) || '' }, { role: 'Accepted by (Globe representative)', name: (ap && ap.n) || m.globeRep || '', ...(ap ? { note: `Approved on site (signed QR) ${fmtTime(ap.at)}` } : {}) }],
      approval: ap ? { title: `APPROVED ON SITE BY ${ap.n.toUpperCase()}`, lines: apprLines(ap) } : null, // v2.28
      footer: `${S.project} · completion report`, footer2: exporterLine(), photos: ph ? ph.sections : [],
      tables: boqT ? [{ title: boqT.title, sub: `${S.project}${m.site ? ` \u00b7 ${m.site}` : ''}`, head: boqT.head, widths: boqT.compare ? [17, 14, 15, 9, 8, 11, 26] : [18, 15, 18, 10, 39],
        rows: boqT.rows.map((r) => ({ cells: r.cells, tones: boqT.compare ? r.cells.map((v, i) => (i === 5 ? (r.diff ? 'bad' : 'good') : null)) : null })), notes: boqT.notes }] : [], attach: await reportKmz(), logos: await formLogos() });
    LOG.info('completion.pdf', { pages: pdf.pages.length, photos: ph ? ph.line : 'off', missing: ph ? ph.missing : 0 });
    offerResult(new Blob(pdf.output({ title: `${S.project} completion report` }), { type: 'application/pdf' }), `${fileBase()}_completion_report.pdf`);
  }, 'Completion report not made'));
  $('curPurpose').addEventListener('change', () => { S.meta = S.meta || {}; S.meta[S.project] = { ...pmeta(), purpose: $('curPurpose').value }; persist(); renderProjects(); });
  /** Copies a PAT or defect-cleanup project (on this phone) into a new FAT project; the source stays unchanged. */
  const startFatFrom = (pat, extraMeta, wantName) => startStageFrom(pat, 'FAT', extraMeta, wantName);
  /** v2.22: a defect cleanup or a FAT started on this phone from a PAT (or a FAT from a cleanup) kept here. */
  async function startStageFrom(pat, stage, extraMeta, wantName) {
    const m = pmeta(pat);
    if (m.mode !== 'acceptance' || !['PAT', 'Cleanup'].includes(m.stage || 'PAT')) throw new Error(`“${pat}” is not a PAT or defect cleanup project`);
    if (stage === 'Cleanup' && (m.stage || 'PAT') !== 'PAT') throw new Error('A defect cleanup starts from a PAT');
    if (stage === 'FAT' && (m.stage || 'PAT') === 'PAT') throw new Error('The FAT starts from the completed defect cleanup, not from the PAT'); // v2.23
    if (stage === 'FAT' && !m.completedAt) throw new Error('The defect cleanup is not completed yet: the FAT starts from a completed cleanup'); // v2.23
    if (m.noDefects) throw new Error('No deficiencies were found in this PAT: the FAT is done with it.'); // v2.23
    const base = wantName || `${m.fromPat || pat} – ${stage}`;
    let name = base, k = 2;
    while (allProjects().includes(name)) name = `${base} ${wantName ? `(${k++})` : k++}`;
    const src = points.filter((p) => p.project === pat), now = new Date().toISOString();
    busy(`Starting ${stage === 'FAT' ? 'FAT' : 'defect cleanup'}…`);
    const copies = src.map((r) => ({ ...JSON.parse(JSON.stringify(r)), id: uid(), project: name, updated: now, patId: r.patId || r.id }));
    for (const c of copies) { await dbPut('points', c); points.push(c); }
    // the PAT's own online task, inspection date, exports and completion are not this stage's (v2.22: a completed PAT no longer makes the new stage “completed”)
    const { taskId, date, exports, completedAt, completedHow, ...patMeta } = m;
    const extra = Object.fromEntries(Object.entries(extraMeta || {}).filter(([, v]) => v !== '' && v != null)); // blank task cells keep the PAT's details
    S.meta[name] = { ...patMeta, stage, fromPat: m.fromPat || pat, fromStage: m.stage || 'PAT', vendorRep: (S.user && S.user.name) || m.vendorRep || '', date: todayIso(), ...extra };
    S.projects.push(name); S.project = name; persist();
    renderPoles(); renderProjects(); busy(false);
    const open = copies.reduce((t, r) => t + openCount(r), 0);
    LOG.info('stage.start', { stage, from: m.stage || 'PAT', records: copies.length, open });
    toast(stage === 'FAT' ? `FAT started: ${copies.length} elements, ${open} open item${open === 1 ? '' : 's'} to re-check` : `Defect cleanup started: ${open} open item${open === 1 ? '' : 's'}. Tap Next defect, fix it and take its photo.`, 5000);
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
  let delApproved = '';
  $('delProject').addEventListener('click', () => guard(async () => {
    delApproved = '';
    // v2.22: a completed project (any category) is deleted only with an admin's approval: a one-time code or the admin PIN
    if (pmeta().completedAt && S.team && !pmeta().sample) { if (!(await adminApproves(`Deleting the completed project “${S.project}”`))) return; delApproved = S.project; }
    const n = projPoints().length, what = isAcc() ? 'element' : 'pole';
    $('delProjText').textContent = `Delete "${S.project}" with its ${n} ${what}${n === 1 ? '' : 's'}, photos and offline maps? Make a backup first if you still need them. This can't be undone.`;
    $('delProjConfirm').hidden = false; $('delProject').hidden = true;
  }, 'Not deleted'));
  $('delProjNo').addEventListener('click', () => { $('delProjConfirm').hidden = true; $('delProject').hidden = false; });
  $('delProjYes').addEventListener('click', () => guard(async () => {
    if (pmeta().completedAt && S.team && !pmeta().sample && delApproved !== S.project) { $('delProjConfirm').hidden = true; $('delProject').hidden = false; return; }
    const name = S.project; delApproved = '';
    await deleteProjectNow(name); // v2.26: the same as Delete on the project card
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
  let xCollect = null; // v2.28: while exporting several formats at once, the files are gathered here
  function offerResult(blob, name) {
    if (xCollect) { xCollect.push({ blob, name }); const kind0 = /_completion_report\.pdf$/i.test(name) ? 'completion' : /_BACKUP\.zip$/i.test(name) ? 'backup' : /_DXF_photos\.zip$/i.test(name) ? 'dxf' : (name.split('.').pop() || '').toLowerCase(); noteExport(kind0); return; }
    lastResult = { blob, name };
    LOG.info('export.ready', { kind: (name.split('.').pop() || '').toLowerCase(), mb: +(blob.size / 1048576).toFixed(2) });
    const kind = /_BACKUP\.zip$/i.test(name) ? 'backup' : /_PAT_for_FAT_/i.test(name) ? 'sent' : /_completion_report\.pdf$/i.test(name) ? 'completion' : /_DXF_photos\.zip$/i.test(name) ? 'dxf' : (name.split('.').pop() || '').toLowerCase();
    noteExport(kind);
    $('resultName').textContent = `${name} · ${(blob.size / 1048576).toFixed(2)} MB`;
    $('resultBox').hidden = false;
    $('resSave').textContent = NATIVE ? 'Save to Documents' : 'Save to phone';
    $('resShare').hidden = false; // v2.30: always offered; a browser that cannot share this kind of file says what to do instead
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
  $('resShare').addEventListener('click', () => { if (lastResult) guard(() => shareFile(lastResult.blob, lastResult.name, lastResult.blob.type)); }); // v2.30: one send path for every Share button
  /* Export screen: one format at a time, picked from the Format dropdown (the last choice is kept per Survey / acceptance). */
  let exportPick = null;
  const xKey = (card) => card.querySelector('button[id^="do"]').id;
  function exportCards() { return [...document.querySelectorAll('#export .xcard')].filter((c) => { const g = c.closest('#accExports, #surveyExports'); return (!g || !g.hidden) && (c.id !== 'boqCard' || boqOn()); }); } // v2.26.1: the BOQ in As-Plan and As-Built only
  function showExport(pick) {
    renderDxfTpl(); // v2.30
    const cards = exportCards(), sel = $('xFormat'), acc = isAcc();
    const want = cards.find((c) => c.querySelector('#' + pick)) || cards.find((c) => xKey(c) === (S.xPick || {})[acc ? 'acc' : 'survey']) || cards[0];
    sel.innerHTML = '';
    cards.forEach((c) => sel.add(new Option(c.querySelector('.head b').textContent, xKey(c), false, c === want)));
    $('boqCardText').textContent = svPurpose() === 'As-built' && !acc // v2.26.1
      ? 'What was built, by size, against the As-Plan (its KMZ as this project\u2019s reference): planned, built and the difference, with the IDs, the planned elements not found and what was built outside the plan. The same BOQ is in the Completion report and in Route and spans \u00b7 Excel.'
      : 'What the plan needs, by size: new Globe poles by size and class, clamps by size and pole owner, ODF by size and connector, closures by size, with the IDs, and what has no size yet. The same BOQ is in the Completion report and in Route and spans \u00b7 Excel.';
    document.querySelectorAll('#export .xcard').forEach((c) => c.classList.toggle('xoff', c !== want));
  }
  /** v2.28: Several formats at once: tick them, one ZIP with every file. */
  function renderXMulti() {
    const box = $('xMultiList'), keep = new Set([...box.querySelectorAll('input:checked')].map((c) => c.value)); box.innerHTML = '';
    exportCards().forEach((c) => {
      const b = c.querySelector('button[id^="do"]'); if (!b) return;
      const l = document.createElement('label'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = b.id; cb.checked = keep.has(b.id);
      l.append(cb, document.createTextNode(c.querySelector('.head b').textContent)); box.appendChild(l);
    });
  }
  $('xMulti').addEventListener('toggle', () => { if ($('xMulti').open) renderXMulti(); });
  $('xMultiGo').addEventListener('click', async () => {
    const ids = [...$('xMultiList').querySelectorAll('input:checked')].map((c) => c.value);
    if (ids.length < 2) { toast('Tick two or more formats (one format: use its own Export button below)', 4000); return; }
    xCollect = []; const failed = [];
    try {
      for (const id of ids) {
        const n0 = xCollect.length; lastGuard = null; $(id).click(); await (lastGuard || Promise.resolve());
        if (xCollect.length === n0) failed.push((exportCards().find((c) => c.querySelector('#' + id)) || { querySelector: () => ({ textContent: id }) }).querySelector('.head b').textContent);
      }
    } finally { const files = xCollect; xCollect = null; if (files.length) {
      busy('Putting the files in one ZIP…');
      const parts = []; for (const f of files) parts.push({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) });
      busy(false);
      offerResult(new Blob(C.makeZipParts(parts), { type: 'application/zip' }), `${fileBase()}_exports_${stamp8()}.zip`);
      LOG.info('export.multi', { files: files.length, failed: failed.length });
      if (failed.length) toast(`In the ZIP: ${files.length} file${files.length === 1 ? '' : 's'}. Not made: ${failed.join(', ')} (see the message above)`, 7000);
    } else toast(`No file was made${failed.length ? `: ${failed.join(', ')}` : ''}`, 6000); }
  });
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
    $('dxfZoneLbl').textContent = $('dxfZoneLbl2').textContent = `UTM ${S.zone}N`; syncExpUi();
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
  /** v2.28: the last run of guard (an export button's work), awaited by Several formats at once. */
  let lastGuard = null;
  function guard(fn, label) { const p = guardRun(fn, label); lastGuard = p; return p; }
  async function guardRun(fn, label) {
    try { await fn(); } catch (e) {
      LOG.error('task.fail', { label: label || 'export', ...errInfo(e) });
      if (e && e.tampered) { busy(false); LOG.warn('seal.tampered'); await ask('⚠ KMZ edited by unauthorized personnel', e.message, [{ label: 'OK', value: true, primary: true }]); return; } // v2.23
      toast(`${label === undefined ? 'Export failed: ' : label ? label + ': ' : ''}${e.message || e}`, 7000);
    } finally { busy(false); }
  }

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
    offerResult(await surveyKmzBlob(pts), fileBase() + '.kmz');
  }));
  /** The survey KMZ for Google Earth (pins, route, balloon photos), as Export → KMZ makes it. */
  async function surveyKmzBlob(pts) {
    const E = S.exp, icons = E.kmzIconPx > 0, names = uniqueNames(pts), files = [], rows = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; busy(`Preparing photos ${i + 1} / ${pts.length}`, i / pts.length);
      const ph = await dbGet('photos', p.id);
      const r = { ...p, element: elemOf(p), statusLabel: svStatusLabel(p.status), detailsText: detailsText(p.details), boqText: boqText(p) };
      if (ph && ph.clean && E.kmzBalloonPx > 0) { r.photoName = `photos/${names[p.id]}.jpg`; files.push({ name: 'files/' + r.photoName, data: await exportPhoto(p, ph.clean, null, null, { maxPx: E.kmzBalloonPx, stamp: E.kmzStamp, quality: 0.85 }) }); }
      if (icons && ph && (ph.clean || ph.thumb)) { r.iconName = `icons/${p.id}.jpg`; files.push({ name: 'files/' + r.iconName, data: await iconJpeg(ph.clean || ph.thumb, E.kmzIconPx, elemOf(p) === 'Pole' ? null : SV_COLORS[elemOf(p)]) }); }
      rows.push(r);
    }
    busy('Building KMZ…', 1);
    const kml = C.buildKml(rows, { project: `${S.project}${pmeta().purpose ? ` · ${pmeta().purpose}` : ''}`, photoIcons: icons, spans: E.kmzRoute ? routeModel().spans : [], stamped: !!E.kmzStamp, stampFields: E.stampFields, exportedBy: exporterLine() });
    const parts = C.makeZipParts([{ name: 'doc.kml', data: kml }, ...files]);
    return new Blob(parts, { type: 'application/vnd.google-earth.kmz' });
  }
  /** v2.23: the KMZ embedded in every PDF report, made from the same records: the survey KMZ, or the PAT / cleanup / FAT KMZ
      (the defects as found; plus the fixes in the cleanup; plus the verification in the FAT). Map, balloons and photos only:
      the G-eSAA records travel in the shared KMZ. */
  async function reportKmz() {
    try { return await reportKmzMake(); } catch (e) { LOG.warn('pdf.kmz.fail', errInfo(e)); toast(`The KMZ could not be attached to the PDF (${e.message || e}); the PDF is made without it.`, 6000); return null; }
  }
  async function reportKmzMake() {
    const pts = projPoints(); if (!pts.length) return null;
    let blob, name, title, short; // v2.24: short = the one line of the stamp on the PDF's first page
    const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    if (!isAcc()) {
      blob = await surveyKmzBlob(pts); name = `${fileBase()}.kmz`;
      const np = pts.filter((p) => elemOf(p) === 'Pole').length, R0 = routeModel();
      title = 'Survey: the poles and points of this report, for Google Earth';
      short = `Survey · ${pl(pts.length, 'pin')} (${pl(np, 'pole')})${R0.spans.length ? ` · ${pl(R0.spans.length, 'span')}` : ''}`;
    } else {
      const M = accModel(); blob = await buildAccKmz(M, false); name = `${accFileBase(M)}.kmz`;
      const st = M.stage;
      title = st === 'PAT' ? 'PAT: the defects as found, for Google Earth' : st === 'Cleanup' ? 'Defect cleanup: the defects and their fixes, for Google Earth' : 'FAT: the defects, their fixes and the verification, for Google Earth';
      short = `${st === 'Cleanup' ? 'Defect cleanup' : st} · ${pl(M.recs.length, 'pin')} · ${M.counted.length ? `${pl(M.counted.length, 'item')}: ${M.open.length} open · ${M.rectified} rectified · ${M.verified} verified` : 'no deficiencies found'}`;
    }
    if (blob.size > 60 * 1048576) { LOG.warn('pdf.kmz.big', { mb: +(blob.size / 1048576).toFixed(1) }); toast(`The KMZ (${(blob.size / 1048576).toFixed(0)} MB) is too large to put in the PDF: export it on its own (Export → KMZ). Lower the KMZ balloon photo size to attach it.`, 7000); return null; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
    LOG.info('pdf.kmz', { kb: Math.round(bytes.length / 1024) });
    return { bytes, name, title, short, sha256: sha, mb: (bytes.length / 1048576).toFixed(2), desc: `${title} (${name})` };
  }

  $('doDxf').addEventListener('click', () => guard(async () => {
    const pts = needPoints(); if (!pts) return;
    if (dxfMode() === 'tpl') { await exportPlanDxf(pts); return; } // v2.30
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
    const rows = pts.map((p) => ({ ...p, element: elemOf(p), detailsText: [boqText(p), detailsText(p.details)].filter(Boolean).join('; ') })), name = `${fileBase()}_UTM${S.zone}N`;
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

  /* ================= v2.30: the plan drawing on the company template =================
     The template is company property: it is not inside the app. The admin puts the prepared template (the "seed", made once
     from the AutoCAD template by tools/dxf-seed) on Google Drive and its link in Administration; each phone downloads it
     once (the Android app), or loads the file (Load template file). It is kept on the phone. dxftpl.js fills a copy. */
  const SEED_KEY = '~dxfseed';
  /** v2.32: the Drive id of the admin's template: from the company list, else the one the online sheet names. */
  const seedId = () => driveId(pol().dxfSeed || '') || (S.cloud && S.team && S.team.src && S.cloud.src === S.team.src.url && S.cloud.dxfSeed) || '';
  const viaSheet = () => !!(S.team && S.team.src && S.team.src.url);
  const seedStale = () => { const i = S.dxfSeed, id = seedId(); return !!(i && id && i.from === 'drive' && i.id && i.id !== id); };
  let seedBusy = null; // the background download, while it runs
  // v2.31: the company template is the default as soon as the admin shares one (or one is on the phone); Simple only when chosen
  const dxfMode = () => (S.exp.dxfMode === 'simple' || (S.exp.dxfMode !== 'tpl' && !S.dxfSeed && !seedId()) ? 'simple' : 'tpl');
  function seedOk(text) { return typeof text === 'string' && /\bSECTION\b/.test(text.slice(0, 4000)) && /@@\w+@@/.test(text) && /\nGEO\r?\n/.test(text); }
  async function storeSeed(text, name, from, id) {
    if (!seedOk(text)) throw new Error('This is not the prepared G-eSAA plan template (no @@ fields or no GEO sheet). Use the seed made from your AutoCAD template, e.g. G-eSAA_seed….dxf, not the template itself.');
    await dbPut('packs', { k: SEED_KEY, text });
    S.dxfSeed = { name: String(name || 'template.dxf').slice(0, 80), size: text.length, at: new Date().toISOString(), from: from || 'file', id: from === 'drive' ? id || seedId() : '' };
    if (S.exp.dxfMode !== 'simple') S.exp.dxfMode = 'tpl'; persist();
    LOG.info('dxf.seed', { kb: Math.round(text.length / 1024), from }); renderDxfTpl();
    toast('Plan template ready ✓', 3000);
  }
  async function seedText() { const r = await dbGet('packs', SEED_KEY).catch(() => null); return r && r.text; }
  /* v2.32: the card in plain words: a tick when the template is on the phone, "Getting…" while it downloads by itself */
  function renderDxfTpl() {
    const tpl = dxfMode() === 'tpl', info = S.dxfSeed, id = seedId(), stale = seedStale();
    $('dxfMode').value = tpl ? 'tpl' : 'simple'; $('dxfTplBox').hidden = !tpl;
    $('dxfDescTpl').hidden = !tpl; $('dxfDescSimple').hidden = tpl;
    ['dxfPhotos', 'dxfPhotoW', 'setSym'].forEach((k) => { const el = $(k); const row = el && (el.closest('.opt2') || el.closest('label')); if (row) row.hidden = tpl; });
    const el = $('dxfTplInfo'); el.classList.toggle('ok', !!info && !stale && !seedBusy);
    el.textContent = seedBusy ? 'Getting the plan template from your admin…'
      : info ? `✓ Plan template ready on this phone (${info.name})${stale ? ' — your admin has shared a newer one: tap Update' : ''}. Tap Export DXF.`
        : id ? 'Your admin has shared the plan template. Tap Get the template (once: it stays on this phone), or just tap Export DXF.'
          : 'No plan template yet. Ask your admin to share it, or load the template file they sent you.';
    $('dxfTplGet').hidden = !id || (!!info && !stale); $('dxfTplGet').disabled = !!seedBusy;
    $('dxfTplGet').textContent = stale ? 'Update the template' : 'Get the template';
    $('dxfTplGet').classList.toggle('primary', true);
    $('dxfTplLoad').textContent = info ? 'Use another template file…' : 'Load template file…';
    $('dxfTplLoad').classList.toggle('link', !!id); // with an admin link, loading a file by hand is the exception
    $('dxfTplBox').querySelector('.dxflogo').hidden = !tpl; if (tpl) renderLogo(); // v2.34
  }
  $('dxfMode').addEventListener('change', () => { S.exp.dxfMode = $('dxfMode').value; persist(); renderDxfTpl(); });
  $('dxfTplLoad').addEventListener('click', () => { $('dxfTplFile').value = ''; $('dxfTplFile').click(); });
  $('dxfTplFile').addEventListener('change', (e) => guard(async () => { const f = e.target.files[0]; if (!f) return; busy('Reading the plan template…'); try { await storeSeed(await f.text(), f.name, 'file'); } finally { busy(false); } }, 'Template not loaded'));
  /** v2.31: the admin's template, fetched and kept: the Android app through Android (Google Drive allows it); the website tries the
      same link and, when the browser is not allowed to read Google Drive, says how to get the file instead. quiet: no busy
      screen and no message (a download in the background). Returns true when the template is on the phone afterwards. */
  /** v2.32: the template through the online sheet (script v2.32): the website cannot read Google Drive itself, the sheet can.
      Null when there is no sheet or its script is older. */
  async function seedFromSheet() {
    if (!viaSheet() || navigator.onLine === false) return null;
    const src = S.team.src, u = new URL(src.url);
    u.searchParams.set('dxfseed', '1'); u.searchParams.set('key', src.key || ''); u.searchParams.set('v', APP_VER); u.searchParams.set('company', (S.user && S.user.company) || '');
    if (S.companyKey) u.searchParams.set('ckey', S.companyKey);
    let j = null;
    try { const r = await withTimeout(fetch(u.href, { cache: 'no-store', redirect: 'follow' }), 120000, 'The online sheet did not answer'); j = await r.json(); }
    catch (e) {
      if (!NATIVE) throw e;
      const r = await withTimeout(nativeCall('CapacitorHttp', 'request', { url: u.href, method: 'GET', responseType: 'json', headers: { 'User-Agent': APP_UA() }, connectTimeout: 20000, readTimeout: 120000 }), 120000, 'The online sheet did not answer');
      j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    }
    if (j && j.ok && typeof j.text === 'string') return j;
    if (j && !j.ok && j.error && !/^(key|company key|action)$/.test(j.error)) throw new Error(`Online sheet: ${j.error}`);
    return null; // an older sheet script: it does not send the template
  }
  async function downloadSeed(quiet) {
    const id = seedId(); if (!id && !viaSheet()) throw new Error('Your admin has not shared the plan template');
    if (!quiet) busy('Getting the plan template from your admin…');
    try {
      let text = '', sheetErr = null;
      try { const j = await seedFromSheet(); if (j) { await storeSeed(j.text, j.name || 'Template from your admin', 'drive', j.id); return true; } } catch (e) { sheetErr = e; LOG.warn('dxf.seed.sheet', errInfo(e)); }
      if (!id) { if (quiet) return false; throw sheetErr || new Error('Your admin has not shared the plan template'); }
      if (NATIVE) {
        const r = await withTimeout(nativeGet(driveDownloadUrl(id), {}, 'text'), 90000, 'Google Drive did not answer');
        if (r.status !== 200) throw new Error(`Google Drive answered HTTP ${r.status}`);
        text = typeof r.data === 'string' ? r.data : new TextDecoder().decode(nativeBytes(r.data));
      } else {
        if (quiet) return false; // in the background the website goes through the online sheet only (browsers may not read Drive)
        let r = null;
        try { r = await withTimeout(fetch(driveDownloadUrl(id), { credentials: 'omit' }), 60000, 'Google Drive did not answer'); } catch (e) { LOG.warn('dxf.seed.web', errInfo(e)); r = null; }
        if (!r || !r.ok) {
          busy(false);
          const why = sheetErr ? `\n\n(${sheetErr.message || sheetErr})` : viaSheet() ? '\n\nFor your admin: with the online sheet script v2.32 the template comes by itself.' : '';
          const how = await ask('Get the plan template', `This browser is not allowed to read the file from Google Drive by itself (the Android app can).\n\n1. Open in Drive and download the file.\n2. Come back and tap Load the downloaded file.\n\nIt stays on this phone afterwards.${why}`, [{ label: 'Cancel', value: '' }, { label: 'Load the downloaded file', value: 'load' }, { label: 'Open in Drive', value: 'drive', primary: true }]);
          if (how === 'drive') openExternal(driveViewUrl(id)); else if (how === 'load') { $('dxfTplFile').value = ''; $('dxfTplFile').click(); }
          return false;
        }
        text = await r.text();
      }
      if (/^\s*<!DOCTYPE html|<html/i.test(text.slice(0, 300))) throw new Error('Google Drive sent a web page instead of the template. Ask your admin to set the file’s sharing to “Anyone with the link”.');
      await storeSeed(text, 'Template from your admin (Google Drive)', 'drive', id);
      return true;
    } finally { if (!quiet) busy(false); }
  }
  /** The template ready for an export: on the phone, else downloaded now (and updated when the admin's link changed). */
  async function ensureSeed() {
    if (seedBusy) await seedBusy.catch(() => {});
    let seed = await seedText(); const id = seedId();
    if ((!seed || seedStale()) && id && navigator.onLine !== false) {
      try { if (await downloadSeed(!!seed && !NATIVE)) seed = await seedText(); } catch (e) { if (!seed) throw e; LOG.warn('dxf.seed.update', errInfo(e)); }
    }
    return seed;
  }
  /** v2.32: the admin's template fetched in the background (website and app) as soon as the phone knows of it (company list or
      online sheet), and again when the admin shares a newer one, so the user never has to tap anything for it. */
  function seedInBackground() {
    if (seedBusy || (S.dxfSeed && !seedStale()) || !seedId() || navigator.onLine === false || S.exp.dxfMode === 'simple') return;
    if (!NATIVE && !viaSheet()) return; // the website reads Google Drive only through the sheet
    seedBusy = downloadSeed(true).catch((e) => { LOG.warn('dxf.seed.bg', errInfo(e)); return false; }).finally(() => { seedBusy = null; try { renderDxfTpl(); } catch (e) { /* not shown */ } });
    try { renderDxfTpl(); } catch (e) { /* not shown */ }
  }
  setTimeout(() => { try { seedInBackground(); } catch (e) { /* not ready */ } }, 8000);
  $('dxfTplGet').addEventListener('click', () => guard(() => downloadSeed(false), 'Template not downloaded'));
  /** The roads around the plan: OpenStreetMap from the internet (Overpass), else from an offline map pack that covers them. */
  /** The roads and named places around the plan: OpenStreetMap from the internet (Overpass), else from an offline map pack that
      covers them. bb: [south, west, north, east] of the vicinity; nb: the same for the places (round the route only). */
  async function planRoads(bb, nb) {
    const U = (la, lo) => { const u = C.utmForward(la, lo, S.zone, la < 0); return [u.E, u.N]; };
    const conv = (list) => list.map((r) => ({ cls: r.cls === 'OSM_ROAD_MAJOR' ? 'major' : r.cls === 'OSM_ROAD_PATH' ? 'path' : 'minor', hw: r.hw || '', lanes: r.lanes || '', width: r.width || '', bridge: !!r.bridge, name: r.name || '', pts: r.coords.map(([la, lo]) => U(la, lo)) }));
    if (navigator.onLine !== false) {
      try {
        busy('Downloading the roads and places from OpenStreetMap…');
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 90000), B = bb.map((v) => v.toFixed(6)).join(','), NB = (nb || bb).map((v) => v.toFixed(6)).join(',');
        const kinds = ['building', 'amenity', 'shop', 'office', 'leisure', 'tourism', 'healthcare', 'craft', 'historic'];
        const q = `[out:json][timeout:90];way["highway"](${B});out geom;(${kinds.map((k) => `nwr["name"]["${k}"](${NB});`).join('')});out center tags;`;
        const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
        clearTimeout(tm);
        if (r.ok) {
          const js = await r.json(), roads = conv(C.roadsFromOverpass(js)), pois = [];
          for (const el of js.elements || []) {
            if (!el.tags || !el.tags.name || el.tags.highway) continue;
            const la = el.lat != null ? el.lat : el.center && el.center.lat, lo = el.lon != null ? el.lon : el.center && el.center.lon; if (la == null || lo == null) continue;
            const [E, N] = U(la, lo); pois.push({ name: el.tags.name, kind: kinds.map((k) => el.tags[k]).find(Boolean) || '', E, N });
          }
          return { roads, pois, note: `${roads.length} roads and ${pois.length} named places from OpenStreetMap (Overpass)` };
        }
      } catch (e) { LOG.warn('plan.roads.online', errInfo(e)); }
    }
    try { const R = await roadsFromPack(bb, nb); if (R) return R; } catch (e) { LOG.warn('plan.roads.pack', errInfo(e)); }
    return { roads: [], pois: [], note: navigator.onLine === false ? 'no roads: offline, and no offline map pack covers the area' : 'no roads: OpenStreetMap did not answer and no offline map pack covers the area' };
  }
  /** Roads and named places read from a downloaded map pack (Protomaps vector tiles, zoom 14) that covers the area. Each road is
      cut exactly at its tile's edge, so the pieces of neighbouring tiles meet (the plan joins them again). */
  async function roadsFromPack(bb, nb) {
    if (!window.protomapsL || !window.protomapsL.PmtilesSource) return null;
    const pk = Object.values(S.packs || {}).find((p) => p.done && p.bbox && p.bbox[0] <= bb[1] && p.bbox[2] >= bb[3] && p.bbox[1] <= bb[0] && p.bbox[3] >= bb[2])
      || Object.values(S.packs || {}).find((p) => p.done && p.bbox && !(p.bbox[2] < bb[1] || p.bbox[0] > bb[3] || p.bbox[3] < bb[0] || p.bbox[1] > bb[2]));
    if (!pk) return null;
    busy(`Reading the roads from the offline map ${pk.name}…`);
    const src = new window.protomapsL.PmtilesSource(new window.protomapsL.PMTiles(new PackSource(pk.id)), false), z = Math.min(14, pk.maxzoom || 14), TS = 4096, n = 2 ** z;
    const x0 = lon2tx(bb[1], z), x1 = lon2tx(bb[3], z), y0 = lat2ty(bb[2], z), y1 = lat2ty(bb[0], z), out = [], pois = [], P = nb || bb;
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) return null;
    const toLL = (x, y, px, py) => { const lon = (x + px / TS) / n * 360 - 180, m = Math.PI * (1 - 2 * (y + py / TS) / n); return [Math.atan(Math.sinh(m)) * 180 / Math.PI, lon]; };
    const KIND = { highway: 'trunk', major_road: 'secondary', minor_road: 'residential', path: 'footway', other: 'service' };
    const clip = window.GeDxfTpl && window.GeDxfTpl.clipLine;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const layers = await src.get({ z, x, y }, TS), roads = layers.get('roads') || [];
      for (const f of roads) {
        if (f.geomType !== 2) continue;
        const pr = f.props || {}, k = String(pr.kind || ''), cls = /highway|major/.test(k) ? 'OSM_ROAD_MAJOR' : /path/.test(k) ? 'OSM_ROAD_PATH' : 'OSM_ROAD_MINOR';
        let hw = String(pr.kind_detail || KIND[k] || 'residential'); if (pr.is_link && !/_link$/.test(hw)) hw += '_link';
        for (const line of f.geom) {
          const pts = line.map((q) => [q.x, q.y]);
          const pieces = clip ? clip(pts, [0, 0, TS, TS]) : [pts.filter((q) => q[0] >= 0 && q[0] <= TS && q[1] >= 0 && q[1] <= TS)];
          for (const pc of pieces) if (pc.length > 1) out.push({ cls, hw, bridge: !!pr.is_bridge, name: pr.name || '', coords: pc.map((c) => toLL(x, y, c[0], c[1])) });
        }
      }
      for (const f of layers.get('pois') || []) { // named places (shops, schools, churches…)
        const pr = f.props || {}; if (f.geomType !== 1 || !pr.name) continue;
        for (const line of f.geom) for (const q of line) { const [la, lo] = toLL(x, y, q.x, q.y); if (la >= P[0] && la <= P[2] && lo >= P[1] && lo <= P[3]) { const u = C.utmForward(la, lo, S.zone, la < 0); pois.push({ name: pr.name, kind: pr.kind || '', E: u.E, N: u.N }); } }
      }
    }
    const conv = (list) => list.map((r) => ({ cls: r.cls === 'OSM_ROAD_MAJOR' ? 'major' : r.cls === 'OSM_ROAD_PATH' ? 'path' : 'minor', hw: r.hw, bridge: r.bridge, name: r.name || '', pts: r.coords.map(([la, lo]) => { const u = C.utmForward(la, lo, S.zone, la < 0); return [u.E, u.N]; }) }));
    return { roads: conv(out), pois, note: `${out.length} road pieces and ${pois.length} named places from the offline map ${pk.name} (OpenStreetMap)` };
  }
  const CAB_TITLE = { F72: 'PROPOSED 72C FIGURE 8 FOC', L12: 'PROPOSED 12C LIGHT CABLE', U144: 'PROPOSED 144C AIR-BLOWN UG FOC' };
  /** The material code of a pole for the drawing (CC / WP / SP …, or NPT when it has no pole tag). */
  function matCode(p) { if (/^NPT/i.test(p.poleId || '')) return 'NPT'; const t = poleTypes().find((x) => x.n === p.poleType); return t ? t.p : ''; }
  /** v2.32: the picture of the VICINITY MAP sheet: the street map in use (tiles already seen on this phone first) over the vicinity
      square, turned to the UTM grid of the drawing, as a JPEG. Null when offline or when too much of the map does not come. */
  async function vicinityJpeg(cE, cN, size, zone, south, progress) {
    const say = progress || (() => {});
    if (navigator.onLine === false) return null;
    const PX = 1800, h = size / 2, src = streetSource();
    const ll = [[cE - h, cN + h], [cE + h, cN + h], [cE - h, cN - h]].map(([E, N]) => C.utmInverse(E, N, zone, south)); // top left, top right, bottom left
    const merc = (la, lo, z) => { const n = 256 * 2 ** z, s = Math.sin(la * Math.PI / 180); return [(lo + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]; };
    let z = Math.min(17, src.max || 17), m, tx0, tx1, ty0, ty1;
    for (; z >= 11; z--) { // the most detailed map that needs at most 64 tiles
      m = ll.map(([la, lo]) => merc(la, lo, z)); const m4 = [...m, [m[1][0] + m[2][0] - m[0][0], m[1][1] + m[2][1] - m[0][1]]];
      tx0 = Math.floor(Math.min(...m4.map((q) => q[0])) / 256); tx1 = Math.floor(Math.max(...m4.map((q) => q[0])) / 256);
      ty0 = Math.floor(Math.min(...m4.map((q) => q[1])) / 256); ty1 = Math.floor(Math.max(...m4.map((q) => q[1])) / 256);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 64) break;
    }
    if (z < 11) return null;
    const jobs = []; for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) jobs.push({ x, y });
    // the tiles: from this phone's map cache when seen recently, else from the server (not counted as map failures: the map's own
    // server switching is left alone); stops as soon as too many are missing for a usable picture
    const maxMiss = Math.floor(jobs.length * 0.15); let got = 0, miss = 0;
    const one = async (j) => {
      const k = `${src.key}/${z}/${j.x}/${j.y}`; let hit = null;
      try { hit = await dbGet('tiles', k); } catch (e) { /* no cache */ }
      if (hit && hit.blob && Date.now() - (hit.t || 0) < TILE_KEEP_MS) return hit.blob;
      if (miss > maxMiss) return null;
      try {
        const blob = await getTileBlob(src.url.replace('{z}', z).replace('{x}', j.x).replace('{y}', j.y), NATIVE && src.id === 'osm');
        dbPut('tiles', { k, blob, t: Date.now() }).catch(() => {}); return blob;
      } catch (e) { return hit ? hit.blob : null; }
    };
    // six at a time, its own queue (the map's tile queue waits while the busy screen shows)
    say(`Getting the vicinity map (${jobs.length} map tiles)…`, 0);
    let next = 0;
    const worker = async () => { while (next < jobs.length) { const j = jobs[next++]; j.blob = await one(j).catch(() => null); if (!j.blob || !j.blob.size) miss++; got++; say(`Getting the vicinity map (${got} / ${jobs.length})…`, got / jobs.length); } };
    await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, worker));
    const ok = jobs.filter((j) => j.blob && j.blob.size > 0);
    if (ok.length < jobs.length - maxMiss) { LOG.warn('plan.vicinity', { tiles: jobs.length, ok: ok.length, z }); return null; }
    const cv = document.createElement('canvas'); cv.width = cv.height = PX; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, PX, PX); g.imageSmoothingQuality = 'high';
    // map pixel (zoom z) → picture pixel: the affine map that puts the three corners in place (the area is small enough to be flat)
    const ux = m[1][0] - m[0][0], uy = m[1][1] - m[0][1], vx = m[2][0] - m[0][0], vy = m[2][1] - m[0][1], det = ux * vy - vx * uy;
    const a = PX * vy / det, c = -PX * vx / det, b = -PX * uy / det, d = PX * ux / det;
    g.setTransform(a, b, c, d, -(a * m[0][0] + c * m[0][1]), -(b * m[0][0] + d * m[0][1]));
    for (const j of ok) {
      try { const im = await loadImage(j.blob); g.drawImage(im, j.x * 256, j.y * 256, 256.6, 256.6); if (im.close) im.close(); } catch (e) { /* a broken tile stays white */ }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const jpg = new Uint8Array(await (await toBlob(cv, 0.85)).arrayBuffer());
    LOG.info('plan.vicinity', { tiles: jobs.length, ok: ok.length, z, kb: Math.round(jpg.length / 1024) });
    return { jpg, px: PX, py: PX, z, credit: src.attr || '© OpenStreetMap contributors' };
  }
  /** v2.34: the vicinity map drawn as a street map from the OpenStreetMap roads the export already has (online or from an offline
      map pack), when the map tiles do not come: land, roads with their casing by class, footpaths, street names. Same square and
      size as the tile picture. */
  async function vicinityFromRoads(roads, cE, cN, size) {
    const PX = 1800, k = PX / size, x0 = cE - size / 2, y1 = cN + size / 2, X = (q) => [(q[0] - x0) * k, (y1 - q[1]) * k];
    const cv = document.createElement('canvas'); cv.width = cv.height = PX; const g = cv.getContext('2d');
    g.fillStyle = '#F2EFE9'; g.fillRect(0, 0, PX, PX); g.lineCap = 'round'; g.lineJoin = 'round';
    const W = (r) => { try { return window.GeDxfTpl.roadWidth(r); } catch (e) { return 6; } };
    const major = (r) => /^(motorway|trunk|primary|secondary)/.test(r.hw || '') || r.cls === 'major', mid = (r) => /^tertiary/.test(r.hw || '');
    const path = (r) => { g.beginPath(); r.pts.forEach((q, i) => { const [a, b] = X(q); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); };
    const list = roads.filter((r) => r.pts && r.pts.length > 1), paths = list.filter((r) => r.cls === 'path' || !(W(r) > 0)), streets = list.filter((r) => !paths.includes(r));
    g.setLineDash([4, 3]); g.strokeStyle = '#B3A79A'; g.lineWidth = 1.4; paths.forEach((r) => { path(r); g.stroke(); }); g.setLineDash([]);
    streets.sort((a, b) => W(a) - W(b));
    for (const r of streets) { path(r); g.strokeStyle = major(r) ? '#C9A26A' : '#BDB6AC'; g.lineWidth = Math.max(3, W(r) * k) + 2.4; g.stroke(); }
    for (const r of streets) { path(r); g.strokeStyle = major(r) ? '#FCD6A4' : mid(r) ? '#FDFBD0' : '#FFFFFF'; g.lineWidth = Math.max(3, W(r) * k); g.stroke(); }
    // the names: once per road, on its longest straight piece inside the picture, where no other name is
    const boxes = [], done = new Set(); g.font = '600 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const r of streets.slice().sort((a, b) => W(b) - W(a))) {
      if (!r.name || done.has(r.name)) continue;
      let best = null; for (let i = 1; i < r.pts.length; i++) { const a = X(r.pts[i - 1]), b = X(r.pts[i]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; if (mx > 20 && mx < PX - 20 && my > 20 && my < PX - 20 && (!best || L > best.L)) best = { a, b, L, mx, my }; }
      const tw = g.measureText(r.name).width; if (!best || best.L < tw * 0.9) continue;
      let ang = Math.atan2(best.b[1] - best.a[1], best.b[0] - best.a[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      const hw = Math.abs(Math.cos(ang)) * tw / 2 + 9, hh = Math.abs(Math.sin(ang)) * tw / 2 + 9, bx = [best.mx - hw, best.my - hh, best.mx + hw, best.my + hh];
      if (boxes.some((o) => !(bx[2] < o[0] || bx[0] > o[2] || bx[3] < o[1] || bx[1] > o[3]))) continue;
      boxes.push(bx); done.add(r.name);
      g.save(); g.translate(best.mx, best.my); g.rotate(ang); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.strokeText(r.name, 0, 0); g.fillStyle = '#4A4A4A'; g.fillText(r.name, 0, 0); g.restore();
    }
    g.font = '13px system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = '#555'; g.fillText('Roads © OpenStreetMap contributors (drawn by G-eSAA)', 12, PX - 14);
    const jpg = new Uint8Array(await (await toBlob(cv, 0.85)).arrayBuffer());
    LOG.info('plan.vicinity.drawn', { roads: streets.length, names: done.size, kb: Math.round(jpg.length / 1024) });
    return { jpg, px: PX, py: PX, credit: '© OpenStreetMap contributors' };
  }
  /* ---- v2.34: the vendor's logo on the plan drawings: one per company, kept on the phone and shared with the company's users
     through the online sheet (script v2.34: Logos tab) ---- */
  const LOGO_KEY = '~logo';
  async function logoGet() { const r = await dbGet('packs', LOGO_KEY).catch(() => null); const co = normCo((S.user && S.user.company) || ''); return r && r.data && (!r.co || normCo(r.co) === co) ? r : null; }
  async function logoStore(o) { await dbPut('packs', { k: LOGO_KEY, ...o }); S.logoInfo = { co: o.co, at: o.at, px: o.px, py: o.py }; persist(); renderLogo(); }
  /** A picture made small for the title block: at most 600 × 220 px, PNG (or JPEG when that is smaller), under 34 KB. */
  async function logoPrepare(file) {
    const im = await loadImage(file), { w, h } = dims(im);
    for (const max of [[600, 220], [480, 176], [360, 132], [240, 88]]) {
      const sc = Math.min(1, max[0] / w, max[1] / h), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(h * sc));
      const g = cv.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
      const png = await new Promise((res) => cv.toBlob(res, 'image/png')), jpg = await toBlob(cv, 0.9);
      const best = png && png.size <= jpg.size * 1.3 ? png : jpg;
      if (best.size <= 34000) { if (im.close) im.close(); const u = new Uint8Array(await best.arrayBuffer()); let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return { type: best.type || 'image/png', data: btoa(b), px: cv.width, py: cv.height }; }
    }
    if (im.close) im.close(); throw new Error('This picture stays too big even when made small. Use a simpler logo (PNG or JPEG).');
  }
  function renderLogo() {
    const i = S.logoInfo, co = (S.user && S.user.company) || '', mine = i && normCo(i.co || '') === normCo(co);
    if (!$('dxfLogoInfo')) return;
    $('dxfLogoInfo').textContent = mine ? `${co} logo on the drawings ✓` : co ? `No ${co} logo yet: the drawings show the company name.` : 'Choose your company in Your details first.';
    $('dxfLogoSet').textContent = mine ? 'Change logo…' : 'Add company logo…'; $('dxfLogoSet').disabled = !co;
    logoGet().then((r) => { const img = $('dxfLogoImg'); if (r) { img.src = `data:${r.type};base64,${r.data}`; img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); } }).catch(() => {});
  }
  $('dxfLogoSet').addEventListener('click', () => { $('dxfLogoFile').value = ''; $('dxfLogoFile').click(); });
  $('dxfLogoFile').addEventListener('change', (e) => guard(async () => {
    const f = e.target.files[0]; if (!f) return; const co = (S.user && S.user.company) || ''; if (!co) throw new Error('Choose your company in Your details first');
    busy('Preparing the logo…');
    try {
      const L = await logoPrepare(f), at = new Date().toISOString();
      await logoStore({ co, at, ...L });
      let shared = false;
      if (S.team && S.team.src && S.team.src.url && navigator.onLine !== false) {
        busy('Sharing the logo with your company…');
        try {
          const j = await cloudRequest({ url: S.team.src.url }, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'setLogo', company: co, type: L.type, data: L.data, at, ...(keyMode() ? { ckey: S.companyKey } : {}), ...(isAdmin() && S.onlineAdminKey ? { key: S.onlineAdminKey } : {}) }) });
          shared = !!(j && j.ok); if (!shared) LOG.warn('logo.share', { error: j && j.error });
        } catch (e2) { LOG.warn('logo.share', errInfo(e2)); }
      }
      toast(shared ? `Logo saved and shared with ${co} users` : 'Logo saved on this phone (not shared: the online sheet did not take it)', 4500);
    } finally { busy(false); }
  }, 'Logo not saved'));
  async function exportPlanDxf(pts) {
    if (!window.GeDxfTpl) await loadScript('dxftpl.js');
    const seed = await ensureSeed();
    if (!seed) { if (!seedId()) toast('No plan template yet: ask your admin to share it, or load the template file they sent you', 6000); renderDxfTpl(); return; }
    busy('Preparing the plan drawing…');
    const m = pmeta(), zone = S.zone, U = (q) => { const u = C.utmForward(q.lat, q.lon, zone, q.lat < 0); return [u.E, u.N]; };
    const R = routeModel(), Q = surveyQty(pts), q = Object.fromEntries(Q.rows.map((r) => [r[0], r[1]]));
    // v2.31: what the template's pole models show: proposed pole (its ID unless generic) / height / clamp; an existing pole's material
    // and pole tag (electric) or material and ID (telco pole: Globe, Bayantel, or a telco owner); the new arm and guying
    const TELCO_TYPES = new Set(['GT', 'BT']);
    const rows = pts.map((p) => { const [E, N] = U(p), el = elemOf(p), b = p.boq || {}, pre = typePrefix(p.poleType), own = String(b.owner || '').trim(), generic = !p.poleId || /^P{1,2}-?\d+$/i.test(p.poleId);
      return { id: p.id, poleId: p.poleId || '', el, status: p.status || '', mat: el === 'Pole' ? (TELCO_TYPES.has(pre) ? '' : pre) : '', tag: el === 'Pole' ? (!p.poleId || /^NPT/i.test(p.poleId) ? 'NPT' : p.poleId) : '',
        telco: el === 'Pole' && (TELCO_TYPES.has(pre) || (!!own && !/electric|coop|power/i.test(own))), label1: generic ? 'PROP.POLE' : `PROP.POLE ${p.poleId}`, height: b.height || '', clamp: b.clamp || '',
        armType: b.arm || '', guy: b.guy || '', E, N, lat: p.lat, lon: p.lon,
        mloop: !!(p.mloop || b.mloop), nap: !!p.nap, napId: p.napId || '', closure: !!p.closure, closureId: p.closureId || '', siteName: el === 'Site' ? (m.site || '') : '', plaId: '' }; });
    const spans = R.spans.map((s) => ({ ia: s.ia, ib: s.ib, a: U(s.a), b: U(s.b), len: s.len, cable: s.cable, long: s.long }));
    const runs = C.routeChains(R.spans).map((ch) => ({ cable: ch.cable, label: CAB_TITLE[ch.cable] || '', pts: ch.pts.map(U) }));
    // the area of the vicinity map: three times the route, at least 1.5 km
    const xs = rows.map((r) => r.E), ys = rows.map((r) => r.N), size = Math.max(1500, 3 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
    const cE = (Math.max(...xs) + Math.min(...xs)) / 2, cN = (Math.max(...ys) + Math.min(...ys)) / 2;
    const la = pts.map((p) => p.lat), lo = pts.map((p) => p.lon), cla = (Math.max(...la) + Math.min(...la)) / 2, clo = (Math.max(...lo) + Math.min(...lo)) / 2;
    const dLa = size / 2 / 110574, dLo = size / 2 / (111320 * Math.cos(cla * Math.PI / 180));
    let roads = [], pois = [], roadsNote = 'roads not added (Options: untick to leave them out)';
    const nLa = (Math.max(...la) - Math.min(...la)) / 2 + 250 / 110574, nLo = (Math.max(...lo) - Math.min(...lo)) / 2 + 250 / (111320 * Math.cos(cla * Math.PI / 180));
    if ($('dxfRoads').checked) ({ roads, pois, note: roadsNote } = await planRoads([cla - dLa, clo - dLo, cla + dLa, clo + dLo], [cla - nLa, clo - nLo, cla + nLa, clo + nLo]));
    const poles = pts.filter((p) => elemOf(p) === 'Pole'), isNew = (p) => ['Proposed', 'New'].includes(p.status), exist = poles.filter((p) => !isNew(p));
    const own = (p) => String((p.boq && p.boq.owner) || '').toUpperCase(), gt = (p) => /^(GT|GLOBE)/i.test(matCode(p)) || /globe/i.test(p.poleType || '');
    const m1 = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}m`;
    const aeLoops = (q.MLOOP_F72 || 0) + (q.MLOOP_L12 || 0), ugLoops = q.MLOOP_U144 || 0, ml = q.MLOOP_LEN || mloopLen();
    const cabs = [...new Set(R.spans.map((s) => s.cable).filter(Boolean))];
    const e = exporterInfo();
    // v2.34: the site from the online sheet's project details (name, PLA ID, serial number), for the title sheet and every title block
    const task = m.taskId && S.cloud && (S.cloud.tasks || []).find((t) => t.id === m.taskId);
    const sName = m.siteName || (task && task.project) || '', sPla = m.plaId || (task && task.site) || '', sSerial = m.serial || (task && extraOf(task, 'Serial Number')) || ((m.siteExtra || []).find(([k]) => /serial/i.test(k)) || [])[1] || '';
    const known = !!(sName || sPla || sSerial);
    const values = {
      EXPORTED_BY: `Exported by ${[e.name, e.mobile, e.email, e.company].filter(Boolean).join(' · ')} · ${e.app} · ${new Date().toISOString().slice(0, 10)}`,
      TITLE_CABLE: cabs.map((k) => CAB_TITLE[k]).join(' / '), COMPANY_NAME: m.contractor || (S.user && S.user.company) || '',
      SITE_NAME: { TITLE: known ? [sName, sPla, sSerial].filter(Boolean) : (m.site || '') }, // the title sheet: site name, PLA ID and serial number, one per line
      LOCATION: { PAGING: known ? [sName, sPla].filter(Boolean).join('_') : (m.site || '') }, SITE_ID: { PAGING: known ? sSerial : '' }, // every title block: SITENAME_PLAID, then the serial number
      PROJECT_CODE: ((m.siteExtra || []).find(([k]) => /project\s*code|network\s*code/i.test(k)) || [])[1] || '',
      PMI_TOTAL_CABLE_LENGTH: R.spans.length ? m1((q.SPAN_TOTAL || 0) + (q.MLOOP_COUNT || 0) * ml) : '', PMI_AERIAL_CABLE_LENGTH: R.spans.length ? m1((q.SPAN_AE || 0) + aeLoops * ml) : '', PMI_UG_CABLE_LENGTH: R.spans.length ? m1((q.SPAN_UG || 0) + ugLoops * ml) : '',
      PMI_PROPOSED_POLE: String(poles.filter(isNew).length), PMI_EXISTING_GT_POLE: String(exist.filter(gt).length),
      PMI_RTA_CONVERGE: String(exist.filter((p) => !gt(p) && /CONVERGE/.test(own(p))).length), PMI_RTA_LOCAL_COOP: String(exist.filter((p) => !gt(p) && /ELECTRIC/.test(own(p))).length),
      PMI_RTA_OTHER_PLDT: String(exist.filter((p) => !gt(p) && own(p) && !/CONVERGE|ELECTRIC/.test(own(p))).length),
      PMI_FIBER_TERMINATION: String(q.ODF_NEW_FIBERS || 0), PMI_HYBRID_CLOSURE: String(Object.entries(q).filter(([k]) => /^CLOSURE_NEW_/.test(k)).reduce((t, [, v]) => t + (+v || 0), 0)),
    };
    // v2.32: the photo of each pole beside it on the drawing (the JPEGs go next to the DXF), and the street map on the vicinity sheet
    const names = uniqueNames(pts), photos = {}, files = [];
    for (let i = 0; i < poles.length; i++) {
      busy(`Preparing the pole photos ${i + 1} / ${poles.length}`, i / poles.length);
      const jpg = await pdfJpeg(coverPid(poles[i]) || poles[i].id, 800, null, null, 0.8).catch(() => null); if (!jpg) continue;
      let dim; try { dim = window.PoleReports.jpegInfo(jpg); } catch (e) { continue; }
      const file = `${names[poles[i].id]}.jpg`; photos[poles[i].id] = { file, px: dim.w, py: dim.h }; files.push({ name: file, data: jpg });
    }
    let vicImage = null, vicDrawn = false;
    try {
      let v = await vicinityJpeg(cE, cN, size, zone, cla < 0, busy);
      if (!v && roads.length) { v = await vicinityFromRoads(roads, cE, cN, size); vicDrawn = !!v; } // v2.34: no map tiles: a street map drawn from the roads
      if (v) { vicImage = { file: 'VICINITY_MAP.jpg', px: v.px, py: v.py, credit: v.credit }; files.push({ name: 'VICINITY_MAP.jpg', data: v.jpg }); }
    } catch (e) { LOG.warn('plan.vicinity', errInfo(e)); }
    // v2.34: the vendor's logo in every title block (set in Export → AutoCAD · DXF, shared with the company's users through the sheet)
    let logo = null;
    try { const lg = await logoGet(); if (lg) { const ext = lg.type === 'image/png' ? 'png' : 'jpg'; logo = { file: `COMPANY_LOGO.${ext}`, px: lg.px, py: lg.py }; files.push({ name: logo.file, data: b64ToBytes(lg.data) }); } } catch (e) { LOG.warn('plan.logo', errInfo(e)); }
    busy('Drawing the plan on the template…');
    await sleep(30);
    const out = window.GeDxfTpl.build(seed, { pts: rows, spans, runs, roads, pois: pois || [], roadsNote, values, mloopLen: ml, maxSpan: pol().maxSpan || 200, cell: 440, viewH: 440, vicinity: [cE, cN, size], photos, vicImage, logo,
      planTitle: m.purpose === 'As-built' ? 'AS-BUILT PLAN' : 'AFI PLAN', date: new Date() });
    const rp = out.report, name = `${fileBase()}_PLAN_UTM${zone}N`;
    const nPh = Object.keys(photos).length;
    const readme = [`${name}.dxf — the plan on your company template (AutoCAD 2018 DXF), UTM ${zone}N metres.`,
      files.length ? 'UNZIP EVERYTHING INTO ONE FOLDER, then open the DXF: the pictures (pole photos, vicinity map) are linked by file name and must stay next to the DXF.' : '',
      `Pole photos: ${nPh} of ${poles.length} poles (a pole without a photo shows its number). Vicinity map: ${vicImage ? (vicDrawn ? 'street map VICINITY_MAP.jpg drawn from the OpenStreetMap roads (the map tiles did not come)' : `street map picture VICINITY_MAP.jpg (${vicImage.credit})`) : 'no picture (no map tiles and no roads): the roads are drawn instead'}.`,
      `Title blocks: ${known ? `${[sName, sPla].filter(Boolean).join('_')} / ${sSerial || '(no serial number)'} from the online sheet's project details` : 'no project details from the online sheet: the project\'s location text is used'}; company ${logo ? 'logo COMPANY_LOGO' : 'name (no logo set)'}; title ${m.purpose === 'As-built' ? 'AS-BUILT PLAN' : 'AFI PLAN'}.`,
      'Cables: red = new fiber, blue = existing; broken line = aerial, solid line = underground.',
      `Sheets: TITLE, TOC, LEGENDS, VICINITY MAP, ROW AREA COVERAGE, KEYMAP, ${rp.sheets.join(', ')}, PMI.`,
      `Grid: ${rp.grid.cols} × ${rp.grid.rows} cells of ${rp.grid.cell} m (1:1100 on the GEO sheets).`,
      `Roads: ${roadsNote}.`, '',
      `Left blank (not known to the app; fill them in CAD): ${rp.blanks.join(', ') || 'none'}.`,
      'PMI table from the survey: total cable = spans + maintenance loops; aerial / underground by the span cable type; existing GT poles = existing poles of type Globe; RTA Converge / local coop / other = existing poles by owner (CONVERGE / Electric / any other owner); fiber termination = fibers of the new ODFs; hybrid closure = new closures. HDD, trenches, maxcell, manhole and service box are not in the survey.',
      'Drawn with the template\'s own models: proposed pole P-POLE on P-GPOLE (PROP.POLE / height / clamp), existing electric pole on ELECTRIC POLE (material / pole tag or NPT), telco pole on GT-POLE (material / ID); new arms and guys on their PROPOSED … layers; loops, closures, NAPs, site and ODF.',
      `Poles are drawn beside the road on the side of their pin (${rp.counts.polesMoved || 0} moved by the drawing; the coordinates written beside each pole are its GPS position). The cable runs on the road side of the poles, through the end of an arm when the pole has one. Guys point against the pull of the cable (a head guy in line with it).`,
      `Road widths by OpenStreetMap class (or its width / lanes): primary 12 m, secondary 9, tertiary 7.5, residential 6, service 4, track 3.5; paths as a grey centre line. Building and place names: ${rp.counts.pois || 0}.`,
      'Labels are placed where they do not overlap, as far as the room allows: check crowded spots in AutoCAD.', '', exporterText()].join('\r\n');
    LOG.info('export.plan', { sheets: rp.sheets.length, roads: rp.counts.roads, blanks: rp.blanks.length, mb: +(out.text.length / 1048576).toFixed(2) });
    busy(false);
    offerResult(new Blob(C.makeZipParts([{ name: `${name}.dxf`, data: out.text }, ...files, { name: 'README.txt', data: readme }]), { type: 'application/zip' }), `${name}_DXF.zip`);
    toast(`Plan: ${rp.sheets.length} GEO sheet${rp.sheets.length === 1 ? '' : 's'} · ${roadsNote}`, 5000);
  }

  $('doCsv').addEventListener('click', () => guard(async () => {
    const pts = needPoints(); if (!pts) return;
    const names = uniqueNames(pts);
    const rows = pts.map((p) => ({ ...p, photoName: names[p.id] + '.jpg', detailsText: detailsText(p.details), boq: p.boq || {} }));
    offerResult(new Blob([C.buildCsv(rows, S.zone, exporterLine())], { type: 'text/csv' }), fileBase() + '.csv');
  }));

  /* ---- v2.29: the region of a project for the BOQ (e.g. "Region 12"), suggested from the GPS and confirmed by the user ----
     APPROXIMATE: the nearest of the places below (provincial capitals and some large towns, about 1 km precise). Near a
     regional border it can be wrong, so the user checks it in Project details. */
  const PH_REGIONS = [['NCR', 'NCR', 'National Capital Region'], ['CAR', 'CAR', 'Cordillera Administrative Region'], ['R1', 'Region 1', 'Ilocos Region'], ['R2', 'Region 2', 'Cagayan Valley'],
    ['R3', 'Region 3', 'Central Luzon'], ['R4A', 'Region 4-A', 'CALABARZON'], ['R4B', 'Region 4-B', 'MIMAROPA'], ['R5', 'Region 5', 'Bicol Region'], ['R6', 'Region 6', 'Western Visayas'],
    ['NIR', 'NIR', 'Negros Island Region'], ['R7', 'Region 7', 'Central Visayas'], ['R8', 'Region 8', 'Eastern Visayas'], ['R9', 'Region 9', 'Zamboanga Peninsula'],
    ['R10', 'Region 10', 'Northern Mindanao'], ['R11', 'Region 11', 'Davao Region'], ['R12', 'Region 12', 'SOCCSKSARGEN'], ['R13', 'Region 13', 'Caraga'], ['BARMM', 'BARMM', 'Bangsamoro (BARMM)']];
  const REGION_BY = Object.fromEntries(PH_REGIONS.map((r) => [r[0], r]));
  const regionLabel = (k) => (REGION_BY[k] ? `${REGION_BY[k][1]} · ${REGION_BY[k][2]}` : '');
  const PH_PLACES = [ // [lat, lon, region]
    [14.5995, 120.9842, 'NCR'], [14.676, 121.0437, 'NCR'], [14.5547, 121.0244, 'NCR'], [14.6507, 120.9667, 'NCR'], [14.5764, 121.0851, 'NCR'], [14.5176, 121.0509, 'NCR'], [14.4793, 121.0198, 'NCR'], [14.4081, 121.0415, 'NCR'], [14.7011, 120.983, 'NCR'], [14.6507, 121.1029, 'NCR'],
    [17.5966, 120.6179, 'CAR'], [18.0236, 121.1836, 'CAR'], [16.4555, 120.587, 'CAR'], [16.4023, 120.596, 'CAR'], [16.7957, 121.125, 'CAR'], [17.4189, 121.4443, 'CAR'], [17.0896, 120.9779, 'CAR'],
    [18.1977, 120.5936, 'R1'], [17.5747, 120.3869, 'R1'], [16.6159, 120.3166, 'R1'], [16.0218, 120.2319, 'R1'], [16.0433, 120.3333, 'R1'], [15.9761, 120.5711, 'R1'],
    [20.4487, 121.9702, 'R2'], [17.6132, 121.727, 'R2'], [18.3567, 121.6402, 'R2'], [17.1489, 121.8893, 'R2'], [16.688, 121.5487, 'R2'], [16.484, 121.1456, 'R2'], [16.51, 121.522, 'R2'],
    [15.7593, 121.5621, 'R3'], [14.676, 120.5363, 'R3'], [14.8443, 120.8114, 'R3'], [15.5422, 121.0828, 'R3'], [15.4865, 120.9667, 'R3'], [15.0286, 120.6898, 'R3'], [15.145, 120.5887, 'R3'], [15.4802, 120.5979, 'R3'], [15.3276, 119.9783, 'R3'], [14.8292, 120.2828, 'R3'],
    [13.7565, 121.0583, 'R4A'], [14.4297, 120.9367, 'R4A'], [14.2833, 120.8667, 'R4A'], [14.2814, 121.4161, 'R4A'], [14.2117, 121.1653, 'R4A'], [13.9373, 121.617, 'R4A'], [14.5864, 121.176, 'R4A'], [14.74, 121.65, 'R4A'], [13.92, 122.1, 'R4A'], [13.59, 122.33, 'R4A'],
    [13.4467, 121.8406, 'R4B'], [13.2233, 120.596, 'R4B'], [12.3527, 121.0676, 'R4B'], [13.4115, 121.18, 'R4B'], [9.7392, 118.7353, 'R4B'], [12.001, 120.2043, 'R4B'], [11.1784, 119.39, 'R4B'], [8.78, 117.83, 'R4B'], [12.577, 122.2691, 'R4B'],
    [13.1391, 123.7438, 'R5'], [14.1122, 122.9553, 'R5'], [13.5833, 123.3, 'R5'], [13.6218, 123.1948, 'R5'], [13.581, 124.2304, 'R5'], [12.37, 123.62, 'R5'], [12.9742, 124.005, 'R5'],
    [11.7061, 122.364, 'R6'], [10.7445, 121.9408, 'R6'], [11.5853, 122.7511, 'R6'], [10.6599, 122.5964, 'R6'], [10.7202, 122.5621, 'R6'],
    [10.6765, 122.9509, 'NIR'], [9.9833, 122.8167, 'NIR'], [10.48, 123.42, 'NIR'], [9.3068, 123.3054, 'NIR'], [9.36, 122.8, 'NIR'], [10.12, 123.27, 'NIR'], [9.214, 123.515, 'NIR'],
    [9.65, 123.85, 'R7'], [10.06, 124.47, 'R7'], [10.3157, 123.8854, 'R7'], [11.0517, 124.0055, 'R7'], [10.11, 123.64, 'R7'],
    [11.561, 124.396, 'R8'], [11.6081, 125.4319, 'R8'], [11.2433, 125.004, 'R8'], [11.0064, 124.6075, 'R8'], [12.499, 124.638, 'R8'], [11.7753, 124.8862, 'R8'], [10.1335, 124.8447, 'R8'],
    [8.5872, 123.3409, 'R9'], [8.24, 122.99, 'R9'], [7.87, 122.67, 'R9'], [7.8257, 123.437, 'R9'], [7.7844, 122.5864, 'R9'], [6.9214, 122.079, 'R9'], [6.7013, 121.9707, 'R9'],
    [8.1575, 125.1278, 'R10'], [7.9062, 125.0942, 'R10'], [9.2504, 124.7156, 'R10'], [8.05, 123.7833, 'R10'], [8.228, 124.2452, 'R10'], [8.4858, 123.8044, 'R10'], [8.1481, 123.8405, 'R10'], [8.4542, 124.6319, 'R10'], [8.8237, 125.1013, 'R10'],
    [7.6078, 125.9664, 'R11'], [7.4478, 125.8078, 'R11'], [6.7497, 125.3572, 'R11'], [6.4038, 125.6132, 'R11'], [6.9551, 126.2166, 'R11'], [7.57, 126.56, 'R11'], [7.1907, 125.4553, 'R11'],
    [7.0083, 125.0894, 'R12'], [7.1063, 124.8291, 'R12'], [7.1906, 124.5306, 'R12'], [6.1023, 125.2903, 'R12'], [5.82, 125.2, 'R12'], [5.99, 124.62, 'R12'], [6.5031, 124.8469, 'R12'], [6.1164, 125.1716, 'R12'], [6.37, 124.75, 'R12'], [6.6295, 124.605, 'R12'], [6.6925, 124.6763, 'R12'], [6.55, 124.05, 'R12'],
    [9.1236, 125.5345, 'R13'], [8.9475, 125.5406, 'R13'], [8.6057, 125.9153, 'R13'], [8.71, 125.75, 'R13'], [10.0089, 125.57, 'R13'], [9.784, 125.4888, 'R13'], [9.0783, 126.1986, 'R13'], [8.2153, 126.3218, 'R13'],
    [6.65, 122.1333, 'BARMM'], [8.0034, 124.2839, 'BARMM'], [7.59, 124.07, 'BARMM'], [7.1667, 124.2667, 'BARMM'], [6.7144, 124.7867, 'BARMM'], [7.2236, 124.2464, 'BARMM'], [6.0522, 121.0022, 'BARMM'], [5.0291, 119.7731, 'BARMM'],
  ];
  /** The region of a position: the nearest place of the list (approximate near a border). */
  function regionAt(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 4 || lat > 21.5 || lon < 116 || lon > 127.5) return '';
    let best = '', bd = Infinity; const k = Math.cos(lat * Math.PI / 180);
    for (const [a, b, r] of PH_PLACES) { const d = (a - lat) ** 2 + ((b - lon) * k) ** 2; if (d < bd) { bd = d; best = r; } }
    return best;
  }
  /** The region suggested for a project: from its first record, else the GPS now. */
  function regionSuggest(name) { const p = points.find((x) => x.project === (name || S.project)); return p ? regionAt(p.lat, p.lon) : fix ? regionAt(fix.lat, fix.lon) : ''; }
  /* v2.26: the BOQ / BOM sizes of a project, counted by item and size (a sheet of its own; also in the route table) */
  /* v2.26.1: the BOQ of an As-Plan (what the plan needs) or of an As-Built (what was built, against the As-Plan when its KMZ is the
     project's reference). One table for the BOQ Excel, the Route and spans Excel and the Completion report. */
  const boqStNorm = (st) => (st === 'Proposed' || st === 'New' ? 'New' : st || '');
  function boqGroups(pts) {
    const groups = new Map(), missing = { pole: 0, ODF: 0, closure: 0 };
    const add = (item, size, forWhat, id) => { const k = [item, size, forWhat].join('|'), g = groups.get(k) || { item, size, forWhat, qty: 0, ids: [] }; g.qty++; if (id) g.ids.push(id); groups.set(k, g); };
    pts.forEach((p) => {
      const el = elemOf(p), b = p.boq || {}, id = p.poleId && !DREF_RE.test(p.poleId) ? p.poleId : '', stn = boqStNorm(p.status);
      if (el === 'Pole') {
        if (b.height || b.cls) add('New Globe pole', [b.height, b.cls].filter(Boolean).join(' '), 'New', id);
        if (b.clamp) add('Pole clamp', b.clamp, b.owner ? `${b.owner} pole` : stn === 'New' || b.height ? 'New Globe pole' : 'Pole', id);
        if (!b.clamp && !b.height && !b.cls) missing.pole++;
        if (b.arm) add('New arm', b.arm, b.height || b.cls || stn === 'New' ? 'New Globe pole' : 'Pole', id); // v2.29
        if (b.guy) String(b.guy).split(' + ').filter(Boolean).forEach((x) => add('Guying', x, 'Pole', id));
        if (b.mloop) add('Maintenance loop', `${mloopLen()} m`, 'Pole', id);
      } else if (el === 'ODF') { if (b.odf || b.conn) add('ODF', [b.odf, b.conn].filter(Boolean).join(' '), stn, id); else missing.ODF++; }
      else if (el === 'Closure' || (el === 'Handhole' && p.closureId)) { if (b.clo) add('Closure', b.clo, stn, el === 'Handhole' ? p.closureId : id); else missing.closure++; }
    });
    return { groups, missing };
  }
  const BOQ_ELEMS = (p) => ['Pole', 'ODF', 'Closure'].includes(elemOf(p)) || (elemOf(p) === 'Handhole' && !!p.closureId);
  /** Elements of one list with no element of the other list (same kind) by ID or within PLAN_NEAR_M. */
  function boqUnmatched(from, to) {
    return from.filter(BOQ_ELEMS).filter((a) => {
      const id = String(a.poleId || '').toUpperCase();
      return !to.some((b) => elemOf(b) === elemOf(a) && ((id && !PP_RE.test(id) && String(b.poleId || '').toUpperCase() === id) || haversine(a, b) <= PLAN_NEAR_M));
    });
  }
  function boqTable(pts, plan) {
    const B = boqGroups(pts), P = plan && plan.recs.length ? boqGroups(plan.recs) : null, compare = !!P;
    const order = ['New Globe pole', 'Pole clamp', 'New arm', 'Guying', 'Maintenance loop', 'ODF', 'Closure'];
    const keys = [...new Set([...B.groups.keys(), ...(P ? P.groups.keys() : [])])];
    const g = (k) => B.groups.get(k) || P.groups.get(k);
    keys.sort((a, c) => { const x = g(a), y = g(c); return order.indexOf(x.item) - order.indexOf(y.item) || String(x.size).localeCompare(String(y.size), undefined, { numeric: true }) || String(x.forWhat).localeCompare(String(y.forWhat)); });
    const head = compare ? ['Item', 'Size / type', 'For / status', 'Planned', 'Built', 'Difference', 'IDs (built)'] : ['Item', 'Size / type', 'For / status', 'Quantity', 'IDs'];
    const rows = keys.map((k) => {
      const x = g(k), b = B.groups.get(k), pq = P && P.groups.get(k) ? P.groups.get(k).qty : 0, bq = b ? b.qty : 0;
      return compare ? { cells: [x.item, x.size, x.forWhat, pq, bq, bq - pq, b ? b.ids.join(', ') : ''], diff: bq - pq } : { cells: [x.item, x.size, x.forWhat, bq, b.ids.join(', ')] };
    });
    const notes = [], plural = (n, w) => `${n} ${w}${n === 1 ? '' : w === 'ODF' ? 's' : 's'}`;
    if (!rows.length) notes.push({ t: 'No size recorded yet: set them in each record (Size · for the BOQ / BOM).', tone: 'info' });
    const miss = Object.entries(B.missing).filter(([, n]) => n);
    if (miss.length) notes.push({ t: `${compare ? 'Built without a size yet' : 'Without a size yet'}: ${miss.map(([k, n]) => plural(n, k)).join(', ')}`, tone: 'bad' });
    if (compare) {
      const notBuilt = boqUnmatched(plan.recs, pts), notPlanned = boqUnmatched(pts, plan.recs);
      const ids = (l) => l.slice(0, 60).map((r) => r.poleId || `${elemOf(r)} at ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`).join(', ') + (l.length > 60 ? ` … and ${l.length - 60} more` : '');
      notes.push({ t: `Planned: the As-Plan KMZ \u201c${plan.name}\u201d (this project's reference), ${plural(plan.recs.length, 'element')}. Difference = built minus planned.`, tone: 'info' });
      if (notBuilt.length) notes.push({ t: `In the As-Plan, not found in the As-Built (same ID or within ${PLAN_NEAR_M} m): ${notBuilt.length} \u2014 ${ids(notBuilt)}`, tone: 'bad' });
      if (notPlanned.length) notes.push({ t: `Built, not in the As-Plan: ${notPlanned.length} \u2014 ${ids(notPlanned)}`, tone: 'bad' });
    } else if (plan) notes.push({ t: `The reference \u201c${plan.name}\u201d has no G-eSAA sizes: load the As-Plan KMZ exported by G-eSAA as the reference to compare planned and built.`, tone: 'info' });
    else if (svPurpose() === 'As-built' && !isAcc()) notes.push({ t: 'No As-Plan to compare with: load the As-Plan KMZ as this project\u2019s reference (Projects, Project details, KMZ reference).', tone: 'info' });
    notes.push({ t: 'Quantities are what was recorded in the field: one per element (a clamp size counts the poles that need it). Add spares and allowances per your design standard.', tone: 'info' });
    return { compare, head, rows, notes, title: svPurpose() === 'As-built' ? (compare ? 'BOQ / BOM \u2014 As-Built against the As-Plan' : 'BOQ / BOM \u2014 As-Built') : 'BOQ / BOM \u2014 As-Plan' };
  }
  /** v2.29: the survey quantities the BOQ rules will use, each with a code (the BOQ template's formulas will point at these):
      span lengths by cable type and method, maintenance loops, FOC length with loops, detailed engineering (spans without
      loops), new poles by size and class, arms, guying, ODF, closures, NAPs, poles on each cable, the region. */
  function surveyQty(pts) {
    const R = C.analyzeRoute(pts.filter((p) => ROUTE_ELS.includes(elemOf(p))), links(), { maxSpan: pol().maxSpan || 200, angleDeg: pol().angleDeg || 15 });
    const rows = [], add = (code, qty, unit, desc) => rows.push([code, qty, unit, desc]), r1 = (v) => Math.round(v * 10) / 10, isNew = (p) => ['Proposed', 'New'].includes(p.status);
    const keys = [...Object.keys(CAB), ''], lenBy = {}, polesBy = {}, loopsBy = {}, ml = mloopLen();
    keys.forEach((k) => { lenBy[k] = 0; polesBy[k] = new Set(); loopsBy[k] = 0; });
    R.spans.forEach((sp) => { lenBy[sp.cable] += sp.len; polesBy[sp.cable].add(sp.ia); polesBy[sp.cable].add(sp.ib); });
    const cabAt = (id) => { const sp = R.spans.find((x) => x.ia === id || x.ib === id); return sp ? sp.cable : null; };
    let loops = 0, loopsOff = 0;
    pts.forEach((p) => { if (elemOf(p) === 'Pole' && p.boq && p.boq.mloop) { loops++; const c = cabAt(p.id); if (c == null) loopsOff++; else loopsBy[c]++; } });
    const tag = (k) => (k ? k : 'NOTSET'), nm = (k) => (k ? CAB[k].label : 'cable not set');
    add('SPAN_TOTAL', r1(R.total), 'm', `All spans (${R.spans.length}), straight pole-to-pole lengths`);
    keys.forEach((k) => { if (lenBy[k] || k) add(`SPAN_${tag(k)}`, r1(lenBy[k]), 'm', `Spans with ${nm(k)}`); });
    add('SPAN_AE', r1(keys.filter((k) => k && CAB[k].method === 'AE').reduce((t, k) => t + lenBy[k], 0)), 'm', 'Aerial (AE) spans');
    add('SPAN_UG', r1(keys.filter((k) => k && CAB[k].method === 'UG').reduce((t, k) => t + lenBy[k], 0)), 'm', 'Underground (UG) spans');
    add('MLOOP_LEN', ml, 'm', 'Maintenance loop length (Administration → Field standards)');
    add('MLOOP_COUNT', loops, 'each', `Poles with a maintenance loop${loopsOff ? ` (${loopsOff} not on the route)` : ''}`);
    keys.forEach((k) => { if (k || loopsBy[k]) add(`MLOOP_${tag(k)}`, loopsBy[k], 'each', `Maintenance loops on ${nm(k)}`); });
    keys.forEach((k) => { if (k || lenBy[k]) add(`FOC_${tag(k)}`, r1(lenBy[k] + loopsBy[k] * ml), 'm', `${k ? CAB[k].label : 'Cable not set'}: spans + ${ml} m per loop`); });
    add('FOC_TOTAL', r1(R.total + (loops - loopsOff) * ml), 'm', 'All FOC: spans + loops');
    add('DE', r1(R.total), 'cable-m', 'Detailed engineering: FOC length without the maintenance loops');
    keys.forEach((k) => { if (k || polesBy[k].size) add(`POLES_${tag(k)}`, polesBy[k].size, 'each', `Route points (poles, handholes, ODF…) on ${nm(k)} spans`); });
    add('SPANS_LONG', R.long, 'each', `Spans longer than ${pol().maxSpan || 200} m`);
    const poles = pts.filter((p) => elemOf(p) === 'Pole'), cnt = (list, f) => { const m = new Map(); list.forEach((p) => { const v = f(p); if (v) String(v).split(' + ').forEach((x) => m.set(x, (m.get(x) || 0) + 1)); }); return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true })); };
    const slug = (v) => String(v).toUpperCase().replace(/[^A-Z0-9.]+/g, '_').replace(/^_|_$/g, '');
    add('POLES_TOTAL', poles.length, 'each', 'Poles recorded'); add('POLES_NEW', poles.filter(isNew).length, 'each', 'Proposed / new poles');
    cnt(poles.filter(isNew), (p) => [p.boq && p.boq.height, p.boq && p.boq.cls].filter(Boolean).join(' ') || 'size not set').forEach(([v, n]) => add(`NEWPOLE_${slug(v)}`, n, 'each', `New ${globeType()} pole ${v}`));
    cnt(poles, (p) => p.boq && p.boq.arm).forEach(([v, n]) => add(`ARM_${slug(v)}`, n, 'each', `New arm: ${v}`));
    cnt(poles, (p) => p.boq && p.boq.guy).forEach(([v, n]) => add(`GUY_${slug(v)}`, n, 'each', `Guying: ${v}`));
    cnt(poles, (p) => p.boq && p.boq.clamp && `${p.boq.clamp}`).forEach(([v, n]) => add(`CLAMP_${slug(v)}`, n, 'each', `Pole clamp ${v}`));
    const odfs = pts.filter((p) => elemOf(p) === 'ODF'), clos = pts.filter((p) => elemOf(p) === 'Closure' || (elemOf(p) === 'Handhole' && p.closureId)), naps = pts.filter((p) => elemOf(p) === 'NAP');
    cnt(odfs.filter(isNew), (p) => [p.boq && p.boq.odf, p.boq && p.boq.conn].filter(Boolean).join(' ') || 'size not set').forEach(([v, n]) => add(`ODF_NEW_${slug(v)}`, n, 'each', `New ODF ${v}`));
    add('ODF_NEW_FIBERS', odfs.filter(isNew).reduce((t, p) => t + (parseInt(String((p.boq && p.boq.odf) || ''), 10) || 0), 0), 'fiber(s)', 'Fibers of the new ODFs (e.g. 12 for a 12F)');
    cnt(clos.filter((p) => isNew(p) || (p.boq && p.boq.cloSt === 'New')), (p) => (p.boq && p.boq.clo) || 'size not set').forEach(([v, n]) => add(`CLOSURE_NEW_${slug(v)}`, n, 'each', `New closure ${v}`));
    add('NAP_NEW', naps.filter(isNew).length, 'each', 'Proposed / new NAPs'); add('NAP_EXISTING', naps.filter((p) => !isNew(p)).length, 'each', 'Existing NAPs');
    const reg = pmeta().region, sug = regionSuggest();
    add('REGION', reg ? REGION_BY[reg][1] : '', '', reg ? regionLabel(reg) : `Not set${sug ? ` (GPS suggests ${regionLabel(sug)})` : ''}: Project details → Region`);
    return { rows, route: R, lenBy, loops, ml };
  }
  function qtySheet(pts, st) {
    const Q = surveyQty(pts), rows = [[{ v: `SURVEY QUANTITIES — ${S.project}`, s: st.title }], [{ v: 'The figures the BOQ / BOM rules use (rules to come). Each has a code for the formulas.', s: st.info }], [],
      ['Code', 'Quantity', 'Unit', 'What it counts'].map((v) => ({ v, s: st.header }))];
    Q.rows.forEach(([c, q, u, d]) => rows.push([{ v: c, s: st.label }, typeof q === 'number' ? { v: q, s: st.center } : q, u, d]));
    rows.push([], [{ v: 'Span lengths are straight lines between the pins (no sag). Cable type and method come from each span (route builder); loops from each pole record (MLoop).', s: st.info }]);
    return { name: 'Survey quantities', cols: [24, 12, 10, 70], rows, freezeRow: 4 };
  }
  function boqSheet(pts, st, plan) {
    const T = boqTable(pts, plan), rows = [T.head.map((v) => ({ v, s: st.header }))];
    T.rows.forEach((r) => rows.push(r.cells.map((v, ci) => (T.compare && ci === 5 ? { v, s: v ? st.bad : st.good } : (T.compare ? ci >= 3 && ci <= 4 : ci === 3) ? { v, s: st.center } : v))));
    T.notes.forEach((n, k) => { if (!k || n.tone === 'bad') rows.push([]); rows.push([{ v: n.t, s: n.tone === 'bad' ? st.bad : st.info }]); });
    return { name: 'BOQ', cols: T.compare ? [18, 16, 18, 10, 10, 11, 60] : [18, 16, 22, 10, 70], rows, freezeRow: 1 };
  }
  async function exportBoq() {
    const pts = projPoints(); if (!pts.length) { toast('Nothing recorded in this project yet'); return; }
    const R = window.PoleReports, st = R.STYLES, plan = await planFor(), T = boqTable(pts, plan);
    const head = [[{ v: `${T.title.toUpperCase()} \u2014 ${S.project}`, s: st.title }], [{ v: 'Generated', s: st.label }, fmtTime(new Date().toISOString())], [{ v: 'Records', s: st.label }, pts.length], []];
    const sh = boqSheet(pts, st, plan);
    const parts = R.buildXlsxParts([{ ...sh, rows: head.concat(sh.rows), freezeRow: head.length + 1 }, qtySheet(pts, st), exporterSheet(st)]); // v2.29: + the survey quantities
    LOG.info('export.boq', { records: pts.length, plan: plan ? plan.recs.length : -1 });
    offerResult(new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase() + '_BOQ.xlsx');
  }
  $('doBoq').addEventListener('click', () => guard(exportBoq));
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
      ...(() => { const by = {}; Rt.spans.forEach((sp) => { by[sp.cable] = (by[sp.cable] || 0) + sp.len; }); return Object.entries(by).map(([k, m]) => [lbl(`${CAB[k] ? `${CAB[k].label} (${CAB[k].method})` : 'Cable not set'} (m)`), { v: Math.round(m * 10) / 10, s: CAB[k] ? st.cell : st.bad }]); })(), // v2.29
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
    const spanRows = [['No.', 'From', 'To', 'Length (m)', 'Longer than maximum', 'Cable', 'Method', 'From lat', 'From lon', 'To lat', 'To lon'].map((v) => ({ v, s: st.header }))];
    Rt.spans.forEach((s, i) => spanRows.push([{ v: i + 1, s: st.center }, s.from, s.to, { v: Math.round(s.len * 10) / 10, s: s.long ? st.bad : st.cell },
      { v: s.long ? 'Yes' : 'No', s: s.long ? st.bad : st.cell }, CAB[s.cable] ? CAB[s.cable].label : { v: 'not set', s: st.bad }, CAB[s.cable] ? CAB[s.cable].method : '', { v: s.a.lat, s: st.coord }, { v: s.a.lon, s: st.coord }, { v: s.b.lat, s: st.coord }, { v: s.b.lon, s: st.coord }])); // v2.29: cable, method
    const poleRows = [['No.', 'ID', 'Element', 'Type / status', 'Role on route', 'Spans at point', 'Deflection (°)', 'Latitude', 'Longitude', `UTM ${S.zone}N E`, `UTM ${S.zone}N N`, 'Pole details', 'Remarks', 'Size (BOQ)'].map((v) => ({ v, s: st.header }))];
    pts.forEach((p, i) => {
      const info = Rt.poles[p.id] || { role: 'On a pole (not a route point)', degree: '', deflection: null }, u = C.utmForward(p.lat, p.lon, S.zone, p.lat < 0), el = elemOf(p);
      poleRows.push([{ v: i + 1, s: st.center }, p.poleId, el, [el === 'Pole' ? p.poleType || '' : '', svStatusLabel(p.status), p.closureId ? `closure ${p.closureId}` : ''].filter(Boolean).join(' · '),
        { v: info.role, s: info.role === 'Not on route' ? st.bad : st.cell }, info.degree,
        info.deflection == null ? '' : Math.round(info.deflection * 10) / 10, { v: p.lat, s: st.coord }, { v: p.lon, s: st.coord }, Math.round(u.E * 1000) / 1000, Math.round(u.N * 1000) / 1000, detailsText(p.details), p.remarks || '', boqText(p)]);
    });
    const parts = R.buildXlsxParts([
      { name: 'Summary', cols: [30, 44], rows: summary, merges: ['A1:B1', `A${summary.length}:B${summary.length}`] },
      { name: 'Spans', cols: [6, 15, 15, 11, 12, 24, 8, 12, 13, 12, 13], rows: spanRows, freezeRow: 1, autoFilter: `A1:K${spanRows.length}` },
      { name: 'Points', cols: [6, 15, 10, 18, 16, 9, 11, 12, 13, 13, 13, 30, 30, 30], rows: poleRows, freezeRow: 1, autoFilter: `A1:N${poleRows.length}` },
      ...(boqOn() ? [boqSheet(pts, st, await planFor()), qtySheet(pts, st)] : []), // v2.26 (v2.26.1: As-Plan / As-Built, planned against built; v2.29: quantities)
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
  async function readPackage(z0) {
    const z = z0.has('polecam/seal.json') ? await unsealZip(z0, 'polecam/') : z0; // v2.22: a locked PAT / cleanup / FAT KMZ
    const pre = z.has('polecam/points.json') ? 'polecam/' : z.has('points.json') ? '' : null;
    if (pre == null) throw new Error(z.names.some((n) => /\.kml$/i.test(n)) ? 'This KMZ has no G-eSAA data. Export it again from G-eSAA (Projects → Project details → Share the KMZ), or tick “Include the PoleCam data” under the KMZ options.' : 'This is not a G-eSAA (PoleCam) file');
    const meta = JSON.parse(new TextDecoder().decode(await z.get(`${pre}points.json`)));
    if (!meta || !Array.isArray(meta.points)) throw new Error('This is not a G-eSAA (PoleCam) file');
    const unsealed = !z.sealed && z.names.some((n) => /(^|\/)doc\.kml$/i.test(n)) && (meta.meta || {}).mode === 'acceptance';
    return { meta, pre, z, sealed: !!z.sealed, unsealed };
  }
  /** v2.22: a PAT / cleanup / FAT KMZ that is not locked, while this company locks them: asked once per file. */
  async function unsealedOk(f, r) {
    if (!r.unsealed || !S.team || !kmzPassNow() || (f && f._unsealedOk)) return true;
    LOG.warn('seal.missing', { name: (f && f.name) || '' });
    const ok = await ask('This KMZ is not locked', `Your company locks the G-eSAA data in PAT, cleanup and FAT KMZ files, but this one is not locked. It was made by an older version or on a phone without the company list — or its data was taken out and changed. Open it only if you trust where it came from.`,
      [{ label: 'Cancel', value: false, primary: true }, { label: 'Open anyway', value: true }]);
    if (ok && f) f._unsealedOk = true;
    return !!ok;
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
    const rp = await readPackage(await zipReader(f)), { meta, pre, z } = rp;
    if (!(await unsealedOk(f, rp))) { busy(false); return null; }
    const fm = meta.meta || {}, from = fm.mode === 'acceptance' ? fm.stage || 'PAT' : 'survey';
    if (from === 'PAT' && fm.noDefects) throw new Error('No deficiencies were found in this PAT: the FAT is done with it, so there is no defect cleanup or FAT to start.'); // v2.23
    if (stage === 'FAT' && from === 'PAT') throw new Error('The FAT starts from the completed defect cleanup, not from the PAT: start the defect cleanup first.'); // v2.23
    if (stage === 'FAT' && from === 'Cleanup' && !fm.completedAt) throw new Error('This defect cleanup is not completed yet: the FAT starts from a completed cleanup. The contractor marks it complete and shares it again.');
    if (!STAGE_FROM[stage].includes(from)) throw new Error(`This file is a ${STAGE_NAME[from]} project. A ${STAGE_NAME[stage]} starts from a ${STAGE_FROM[stage].map((x) => STAGE_NAME[x]).join(' or ')} KMZ.`);
    const pat = fm.fromPat || meta.project || 'PAT', base = wantName || `${pat} – ${stage}`;
    let name = base, k = 2;
    while (allProjects().includes(name)) name = `${base} (${k++})`;
    await importPhotos(z, pre, meta.points);
    const now = new Date().toISOString();
    const copies = meta.points.map((r) => ({ ...r, id: uid(), project: name, updated: now, patId: r.patId || r.id }));
    busy('Saving…');
    for (const c of copies) { await dbPut('points', c); points.push(c); }
    const { taskId, date, exports, links, completedAt, completedHow, ...rest } = fm; // v2.22: the sender's completion is not this stage's
    const extra = Object.fromEntries(Object.entries(extraMeta || {}).filter(([, v]) => v !== '' && v != null));
    S.meta = S.meta || {};
    // v2.23: started straight from the file: the same site row of the online sheet (its task ID) is kept
    S.meta[name] = { ...rest, ...(!extraMeta && taskId ? { taskId } : {}), mode: 'acceptance', stage, fromPat: pat, fromStage: from, fromFile: f.name || '', vendorRep: (S.user && S.user.name) || rest.vendorRep || '', date: todayIso(), ...extra };
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
    const rp = await readPackage(await zipReader(f)), { meta, pre, z } = rp;
    if (!(await unsealedOk(f, rp))) { busy(false); return null; }
    const fm = meta.meta || {}, kind = (m) => (m.mode === 'acceptance' ? m.stage || 'PAT' : 'survey');
    if (o.expectPat && kind(fm) !== 'PAT') throw new Error(`This file is ${kind(fm) === 'survey' ? 'a survey backup' : `a ${kind(fm)} project`}, not a PAT. On the PAT phone use Projects → Send this PAT to another phone.`);
    return restoreMeta(z, meta, pre, o);
  }
  /** Puts one project's records and photos (meta = a backup's points.json; photos under pre) on this phone. o.apart: the
      sender's name, to keep a project of the same name apart; o.quiet: no toast (several projects). */
  async function restoreMeta(z, meta, pre, o) {
    const fm = meta.meta || {}, kind = (m) => (m.mode === 'acceptance' ? m.stage || 'PAT' : 'survey');
    let proj = meta.project || (meta.points[0] && meta.points[0].project);
    const sameOne = proj && meta.points.some((p) => points.some((x) => x.id === p.id && x.project === proj)); // this project came from the same file before
    if (proj && o.apart && meta.points.length && allProjects().includes(proj) && !sameOne) { // v2.21: a colleague's project kept apart from one of the same name
      const nm = `${proj} (${o.apart})`; // opened again: the same copy is updated, not a third one made
      meta.points = meta.points.map((p) => ({ ...p, project: nm })); proj = nm;
    }
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
    if (o.quiet) return proj;
    renderPoles(); fitProject(); busy(false);
    toast(`Restored ${meta.points.length} records into “${S.project}”`, 4000);
    return proj;
  }

  /* ================= acceptance exports ================= */
  const STAGE_LONG = { PAT: 'Provisional Acceptance Test (PAT)', Cleanup: 'Defect cleanup (contractor rectification of the PAT punchlist)', FAT: 'Final Acceptance Test (FAT)' };
  const dateOnly = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }); };
  /** Numbered punchlist + stable photo file names for the current acceptance project. */
  function accModel() {
    const recs = projPoints(), m = pmeta(), stage = m.stage || 'PAT', base = {}, used = {}, nos = itemNos(recs), label = {};
    // v2.22: an element saved without its ID is named by its item numbers (Item 3), never by its internal reference (D-0001)
    recs.forEach((r) => {
      label[r.id] = recName(r, nos);
      const b = isRef(r) ? (nos[r.id] && nos[r.id].length ? `item${nos[r.id][0]}` : 'no_id') : C.safeName(`${r.poleId}`); let n = b, k = 2;
      while (used[n.toLowerCase()]) n = `${b}_${k++}`;
      used[n.toLowerCase()] = 1; base[r.id] = n;
    });
    const items = []; let no = 0;
    recs.forEach((r) => (r.defs || []).forEach((d) => {
      no++;
      const fb = isRef(r) ? `item${no}` : `${base[r.id]}_item${no}`;
      items.push({ no, r, d, defectName: d.pid ? `${fb}_asfound.jpg` : '', afterName: d.afterPid ? `${fb}_rectified.jpg` : '', verifyName: d.verifyPid ? `${fb}_verified.jpg` : '' });
    }));
    const photoName = (r, i, p) => `${base[r.id]}_${i + 1}_${C.safeName(p.label)}.jpg`;
    // after the PAT, the dates of a stage are the dates of its own work (fixes, verifications, items found then)
    const fatTimes = stage !== 'PAT' ? items.flatMap((x) => [x.d.fixedStage === stage ? x.d.fixedAt : null, stage === 'FAT' ? x.d.verifiedAt : null, x.d.stage === stage ? x.d.foundAt : null]).filter(Boolean).sort() : [];
    const times = stage !== 'PAT' ? fatTimes : recs.map((r) => r.takenAt).filter(Boolean).sort();
    const first = times.length ? dateOnly(times[0]) : '', lastD = times.length ? dateOnly(times[times.length - 1]) : '';
    const counted = items.filter((x) => x.d.sev !== 'Note'), open = counted.filter((x) => !defDone(x.d));
    return { recs, items, base, label, lab: (r) => label[r.id] || r.poleId, photoName, m, stage, dates: first === lastD ? first : `${first} – ${lastD}`, fatFirst: fatTimes[0] || null, open, counted,
      withDef: recs.filter((r) => openCount(r) > 0).length, rectified: counted.filter((x) => x.d.status === 'Rectified').length,
      verified: counted.filter((x) => x.d.status === 'Verified').length, notes: items.length - counted.length,
      major: open.filter((x) => x.d.sev === 'Major').length, minor: open.filter((x) => x.d.sev !== 'Major').length };
  }
  function accPhotoList(M) {
    const list = [];
    M.recs.forEach((r) => photosOf(r).forEach((p, i) => list.push({ rec: r, pid: p.pid, name: M.photoName(r, i, p), title: `${M.lab(r)}  ·  ${elemOf(r)}  ·  ${p.label}`, desc: p.label, meta: p.at ? p : null })));
    const who = (r, no) => (isRef(r) ? `Item ${no}` : `${r.poleId}  ·  Item ${no}`); // v2.22: no D-0001
    M.items.forEach((x) => {
      if (x.d.pid) list.push({ rec: x.r, pid: x.d.pid, name: x.defectName, title: `${who(x.r, x.no)}  ·  AS FOUND  ·  ${x.d.cat}: ${x.d.item}`, desc: `AS FOUND · ${x.d.cat}: ${x.d.item}`, no: x.no, meta: x.d.pidMeta || null });
      if (x.d.afterPid) list.push({ rec: x.r, pid: x.d.afterPid, name: x.afterName, title: `${who(x.r, x.no)}  ·  RECTIFIED  ·  ${x.d.cat}: ${x.d.item}`, desc: `RECTIFIED · ${x.d.cat}: ${x.d.item}`, no: x.no, meta: x.d.afterMeta || null });
      if (x.d.verifyPid) list.push({ rec: x.r, pid: x.d.verifyPid, name: x.verifyName, title: `${who(x.r, x.no)}  ·  VERIFIED  ·  ${x.d.cat}: ${x.d.item}`, desc: `VERIFIED · ${x.d.cat}: ${x.d.item}`, no: x.no, meta: x.d.verifyMeta || null });
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
      return [x.no, isRef(x.r) ? '' : x.r.poleId, elemOf(x.r), d.cat, d.item, `${SEV_CODE[sevOf(d)]} (${sevOf(d)})`, d.notes || '', defStatusOf(d), d.stage || 'PAT',
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
      return [i + 1, elemOf(r), M.lab(r), yn(r.mloop), yn(r.nap), r.nap ? r.napId || '' : '', yn(r.closure), r.closure ? r.closureId || '' : '',
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
  const b64std = (s) => { try { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); } catch (e) { return null; } };
  /** The two logos of the form and the PDF reports: uploaded by the admin (v2.23, they come with the company list), else the
      ones bundled with the app (so the form looks the same offline). */
  async function formLogos() {
    const L = pol().logos || {}, key = `${L.left ? L.left.length + L.left.slice(-16) : ''}|${L.right ? L.right.length + L.right.slice(-16) : ''}`;
    if (logoCache && logoCache.key === key) return logoCache;
    const get = async (u) => { try { const r = await fetch(u); if (!r.ok) return null; return new Uint8Array(await r.arrayBuffer()); } catch (e) { return null; } };
    logoCache = { key, left: (L.left && b64std(L.left)) || await get('brand/logo-left.jpg'), right: (L.right && b64std(L.right)) || await get('brand/logo-right.jpg') };
    return logoCache;
  }
  const itemText = (x) => (isRef(x.r) ? `${elemOf(x.r) !== x.d.cat ? `${elemOf(x.r)} — ` : ''}${x.d.cat}: ${x.d.item}${x.d.notes ? ` (${x.d.notes})` : ''}` // v2.22: the item number is the reference
    : `${x.r.poleId}${elemOf(x.r) !== 'Pole' ? ` (${elemOf(x.r)})` : ''} — ${x.d.cat}: ${x.d.item}${x.d.notes ? ` (${x.d.notes})` : ''}`);
  const rectifiedDate = (d) => (defDone(d) ? longDate(d.fixedAt || d.verifiedAt) : '');
  /** Header + rows of the LIST OF DEFICIENCIES form, as the office template has them. */
  function formModel(M, o) {
    const m = M.m, insp = m.date ? longDate(m.date) : M.stage !== 'PAT' ? (M.fatFirst ? longDate(M.fatFirst) : '') : (M.recs.length ? longDate(M.recs[0].takenAt) : '');
    const signDate = o.dates === 'today' ? longDate(todayIso()) : o.dates === 'insp' ? insp : '';
    return {
      form: pol().form, logos: o.logos, stage: M.stage === 'FAT' ? 'FAT' : 'PAT', typesChecked: m.inspTypes || allInspTypes(),
      location: m.site || '', project: (M.stage !== 'PAT' && m.fromPat) || S.project, vendor: m.contractor || '', date: insp,
      items: M.items.length ? M.items.map((x) => ({ no: x.no, code: SEV_CODE[sevOf(x.d)], text: itemText(x), rectified: rectifiedDate(x.d) }))
        : [{ no: '—', code: '', text: `NO DEFICIENCIES FOUND${m.noDefects ? ` — PAT completed ${longDate(m.completedAt)}; FAT done the same day` : ''}`, rectified: '' }], // v2.23
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
        const mt = p.meta || {}, dist = distFromPin(p.meta, p.rec);
        prows.push([p.name, isRef(p.rec) ? '' : p.rec.poleId, elemOf(p.rec), p.desc || '', p.no || '', mt.at ? fmtTime(mt.at) : '', mt.by || '',
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
      ? { label: foundL, tone: 'bad', jpeg: await pdfJpeg(d.pid, px, [`AS FOUND · ${isRef(r) ? '' : `${r.poleId} · `}item ${x.no}`, d.pidMeta ? shortTime(d.pidMeta.at) : shortTime(d.foundAt)], '#c92a2a', quality),
        lines: [`Found ${shortTime(d.foundAt)} (${d.stage || 'PAT'})${d.foundBy ? ` by ${d.foundBy}` : ''}`, ...metaLines(d.pidMeta, r, 'Photo').slice(1)] }
      : { label: foundL, tone: stt === 'Note' ? 'muted' : 'bad', plain: stt === 'Note', jpeg: null, note: stt === 'Note' ? 'No photo' : 'No photo taken when the deficiency was recorded', lines: [`Found ${shortTime(d.foundAt)}${d.foundBy ? ` by ${d.foundBy}` : ''}`] });
    if (stt === 'Note') stages.push({ label: rectL, tone: 'muted', pending: true, note: 'Not required — observation only', lines: [] }, { label: verL, tone: 'muted', pending: true, note: 'Not required', lines: [] });
    else {
      if (defDone(d)) stages.push(d.afterPid
        ? { label: rectL, tone: 'blue', jpeg: await pdfJpeg(d.afterPid, px, [`RECTIFIED · ${isRef(r) ? '' : `${r.poleId} · `}item ${x.no}`, d.afterMeta ? shortTime(d.afterMeta.at) : ''].filter(Boolean), '#1971c2', quality),
          lines: [`Rectified ${shortTime(d.fixedAt)}${d.fixedBy ? ` by ${d.fixedBy}` : ''}`, ...metaLines(d.afterMeta, r, 'Photo').slice(1)] }
        : { label: rectL, tone: 'blue', jpeg: null, note: 'Marked rectified without a photo', lines: [`Rectified ${shortTime(d.fixedAt)}${d.fixedBy ? ` by ${d.fixedBy}` : ''}`] });
      else if (last && last.pid) stages.push({ label: `${rectL} · REJECTED`, tone: 'bad', jpeg: await pdfJpeg(last.pid, px, [`REJECTED · ${isRef(r) ? '' : `${r.poleId} · `}item ${x.no}`, last.meta ? shortTime(last.meta.at) : ''].filter(Boolean), '#c92a2a', quality),
        lines: [`Rectification of ${shortTime(last.fixedAt || last.at)}${last.fixedBy ? ` by ${last.fixedBy}` : ''} rejected ${shortTime(last.at)}${last.by ? ` by ${last.by}` : ''}: ${last.reason || 'no reason given'}`, ...(rej.length > 1 ? [`Rejected ${rej.length} times in all`] : [])] });
      else stages.push({ label: rectL, tone: 'blue', pending: true, note: rej.length ? 'Rectification rejected — pending again' : 'Pending rectification', lines: rej.length ? [`Rejected ${rej.length}×, last ${shortTime(last.at)}${last.by ? ` by ${last.by}` : ''}: ${last.reason || 'no reason given'}`] : [] });
      if (stt === 'Verified') stages.push(d.verifyPid
        ? { label: verL, tone: 'good', jpeg: await pdfJpeg(d.verifyPid, px, [`VERIFIED · ${isRef(r) ? '' : `${r.poleId} · `}item ${x.no}`, d.verifyMeta ? shortTime(d.verifyMeta.at) : ''].filter(Boolean), '#2b8a3e', quality),
          lines: [`Verified ${shortTime(d.verifiedAt)}${d.verifiedBy ? ` by ${d.verifiedBy}` : ''}`, ...metaLines(d.verifyMeta, r, 'Photo').slice(1)] }
        : { label: verL, tone: 'good', jpeg: null, plain: true, note: 'Verified on site without a photo', lines: [`Verified ${shortTime(d.verifiedAt)}${d.verifiedBy ? ` by ${d.verifiedBy}` : ''}`] });
      else stages.push({ label: verL, tone: 'good', pending: true, note: stt === 'Rectified' ? 'Awaiting verification' : 'Pending', lines: [] });
    }
    const statusText = { Open: rej.length ? 'OPEN — REJECTED' : 'OPEN', Rectified: 'RECTIFIED — TO VERIFY', Verified: 'VERIFIED', Note: 'NOTE' }[stt] || stt;
    const tone = { Open: 'bad', Rectified: 'blue', Verified: 'good', Note: 'muted' }[stt];
    return { no: x.no, loc: isRef(r) ? '' : r.poleId, element: elemOf(r), code: SEV_CODE[sevOf(d)], text: `${d.cat}: ${d.item}${d.notes ? ' — ' + d.notes : ''}`, status: statusText, statusTone: tone, remarks: d.remarks, stages };
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
          model.annexB.push({ jpeg, caption: `${M.lab(r)} · ${elemOf(r)} · ${p.label}`, sub: `${p.at ? shortTime(p.at) : shortTime(r.takenAt)}${p.by ? ' · ' + p.by : ''} · ${STATUS_TEXT[recStatus(r)]}` });
        }
      }
    }
    model.attach = await reportKmz(); // v2.23
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
    const head = (x) => `#${x.no}  ${isRef(x.r) ? '' : `${x.r.poleId} · `}${elemOf(x.r)}`;
    const defect = (x) => `${x.d.cat}: ${x.d.item}${x.d.notes ? ' — ' + x.d.notes : ''}  ·  ${sevOf(x.d)}  ·  found at ${x.d.stage || 'PAT'}`;
    const items = [];
    const n = rect.length + (withOpen ? open.length : 0); let k = 0;
    for (const x of rect) {
      busy(`Preparing photos ${++k} / ${n}`, k / n);
      const d = x.d, dd = daysBetween(d.foundAt, d.fixedAt);
      items.push({ head: head(x), defect: defect(x), right: `${d.status === 'Verified' ? 'Verified · r' : 'R'}ectified in ${fmtDays(dd)}`, remarks: d.remarks,
        before: { jpeg: d.pid ? await pdfJpeg(d.pid, 800, [`BEFORE · ${isRef(x.r) ? '' : `${x.r.poleId} · `}item ${x.no}`, d.pidMeta ? shortTime(d.pidMeta.at) : `Found ${shortTime(d.foundAt)}`], '#c92a2a') : null,
          lines: [`Found ${shortTime(d.foundAt)} (${d.stage || 'PAT'})${d.foundBy ? ` by ${d.foundBy}` : ''}`, ...(d.pid ? metaLines(d.pidMeta, x.r, 'Photo taken').slice(1, 2) : ['No defect photo'])] },
        after: d.afterPid ? { jpeg: await pdfJpeg(d.afterPid, 800, [`AFTER · ${isRef(x.r) ? '' : `${x.r.poleId} · `}item ${x.no}`, d.afterMeta ? shortTime(d.afterMeta.at) : ''].filter(Boolean), '#1971c2'),
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
      attach: await reportKmz(), logos: await formLogos(), // v2.23
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
      recs.push({ id: r.id, name: M.lab(r), title: `${M.lab(r)} · ${elemOf(r)} · ${STATUS_TEXT[recStatus(r)]}`, status: recStatus(r), lat: r.lat, lon: r.lon, icon,
        // coordinates and time are left out when the balloon photos already carry them in their stamp
        detailsHtml: [...attachText(r), ...(onPhoto(r, 'coords') ? [] : [`Coordinates: ${r.lat.toFixed(7)}, ${r.lon.toFixed(7)}`]), ...(onPhoto(r, 'time') ? [] : [`Captured: ${fmtTime(r.takenAt)}`])].map(C.xmlEsc).join('<br/>'),
        photos: byRec[r.id] || [],
        defs: M.items.filter((x) => x.r === r).map((x) => ({ no: x.no, text: `${x.d.cat}: ${x.d.item}${x.d.notes ? ' — ' + x.d.notes : ''}`, sev: sevOf(x.d), status: defStatusOf(x.d) })) });
    }
    const kml = window.PoleReports.acceptanceKml(recs, { name: `${S.project} · ${M.stage}`, icons, exportedBy: exporterLine() });
    let data = withData ? await projectFiles(S.project, 'polecam/') : [];
    // v2.22: the KMZ lock; v2.23: the map part (doc.kml, its photos and icons) is sealed too, so an edit of the pins is seen
    if (withData) { const sealed = await sealFiles(data, 'polecam/', [{ name: 'doc.kml', data: kml }, ...files]); if (sealed) data = sealed; LOG.info('kmz.share', { sealed: !!sealed, files: data.length }); }
    busy('Building KMZ…', 1);
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
    $('camSub').textContent = `${S.readId !== false ? 'ID scan after each photo' : 'No ID scan'}${(S.readIdAcc === true) !== (S.readId !== false) ? ` (${S.readIdAcc === true ? 'on' : 'off'} in PAT / FAT)` : ''} · ${S.idOrient === 'v' ? 'vertical' : 'horizontal'} IDs · sharpness ${QUAL_NAME[effectiveQuality()] || 'Strict'}${S.team ? ' (set by admin)' : ''}`;
    const packs = Object.values(S.packs || {}).filter((p) => p.done);
    $('mapsSub').textContent = `${streetSource().name}${packs.length ? ` · ${packs.length} offline pack${packs.length === 1 ? '' : 's'}${S.base === 'offline' ? ' (in use)' : ''}` : ' · no offline pack yet'}`;
    const P = pol();
    $('policyInfo').textContent = S.team ? `Policies from “${S.team.name}” v${S.team.rev}: admin company ${P.owner || 'not set (everyone may manage and verify)'} · max span ${P.maxSpan} m · angle from ${P.angleDeg}° · photo check ${QUAL_NAME[P.quality] || 'Strict'}.` : 'No company list yet: the built-in defaults apply (max span 200 m, strict photo check).';
    $('adminRowTitle').textContent = S.team ? `${S.team.name}` : 'Company list and policies';
    refreshStorageInfo();
  }
  $('settingsBtn').addEventListener('click', () => { renderSettingsHome(); renderLog(); openSheet('settings'); });

  /* ---- v2.25: Tutorial (bottom bar, beside Settings): the topics of tutorial.js, with search. The admin guide is shown only
     to users of the admin company; everyone else sees the user guide. "Show me" opens the screen and points at the control. ---- */
  const tutAdmin = () => isAdmin() || isAdminCo();
  let tutAudSel = 'user', tutCur = null;
  const tutTopics = () => ((window.GESAA_TUTORIAL && window.GESAA_TUTORIAL.topics) || []).filter((t) => t && Array.isArray(t.steps) && (t.aud === 'user' || (t.aud === 'admin' && tutAdmin())));
  const tutWait = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Text with **bold**, *italic* and the search words marked, built from text nodes only. */
  function tutRich(el, text, words) {
    el.textContent = '';
    const mark = (host, str) => {
      if (!words || !words.length) { host.appendChild(document.createTextNode(str)); return; }
      const re = new RegExp(`([\\w'’-]*(?:${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[\\w'’-]*)`, 'ig'); // the whole word
      str.split(re).forEach((x, i) => { if (!x) return; if (i % 2) { const m = document.createElement('mark'); m.textContent = x; host.appendChild(m); } else host.appendChild(document.createTextNode(x)); });
    };
    String(text || '').split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).forEach((part) => {
      if (!part) return;
      const bold = /^\*\*[\s\S]*\*\*$/.test(part), it = !bold && /^\*[\s\S]*\*$/.test(part);
      if (!bold && !it) { mark(el, part); return; }
      const h = document.createElement(bold ? 'b' : 'i'); mark(h, bold ? part.slice(2, -2) : part.slice(1, -1)); el.appendChild(h);
    });
  }
  const tutHay = (t) => [t.title, t.kw, t.cat, ...t.steps.map((x) => x.t)].join(' ').toLowerCase().replace(/\*/g, '');
  /** A search word without its ending, so "approve" finds "approval" and "deleting" finds "delete". */
  const tutStem = (w) => (w.length > 4 ? w.replace(/(ings?|ed|es|s|e|al)$/, '') : w);
  function renderTutList() {
    const adm = tutAdmin(), q = $('tutQ').value.trim().toLowerCase(), words = q.split(/\s+/).filter((w) => w.length > 1).map(tutStem);
    if (!adm) tutAudSel = 'user';
    $('tutAud').hidden = !adm;
    [...$('tutAud').children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.aud === tutAudSel)));
    $('tutWho').textContent = words.length ? '' : adm ? `You are a user of the admin company${pol().owner ? ` (${pol().owner})` : ''}: the user guide and the admin guide.` : 'How to use G-eSAA. Tap a topic; “Show me” opens the screen and points at the button.';
    const all = tutTopics(), L = $('tutList'); L.innerHTML = '';
    if (!all.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'The tutorial is not loaded on this phone: open G-eSAA once with internet.'; L.appendChild(p); return; }
    let list = words.length ? all.filter((t) => words.every((w) => tutHay(t).includes(w))) : all.filter((t) => t.aud === tutAudSel);
    if (words.length) list = list.map((t, i) => ({ t, i, s: words.filter((w) => t.title.toLowerCase().includes(w)).length })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.t);
    if (!list.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = `No topic for “${q}”. Try another word, e.g. photo, PAT, invite, offline.`; L.appendChild(p); return; }
    if (words.length) { const h = document.createElement('div'); h.className = 'tutcat'; h.textContent = `${list.length} topic${list.length === 1 ? '' : 's'} found`; L.appendChild(h); }
    let cat = '';
    const shut = S.tutShut || {};
    list.forEach((t) => {
      if (!words.length && t.cat !== cat) { // v2.28: each subject folds open or shut
        cat = t.cat; const c0 = cat, n = list.filter((x) => x.cat === c0).length;
        const h = document.createElement('button'); h.type = 'button'; h.className = 'tutcat tutfold'; h.dataset.cat = c0; h.setAttribute('aria-expanded', String(!shut[c0]));
        h.innerHTML = `<span></span><b>${n}</b><em aria-hidden="true">${shut[c0] ? '▸' : '▾'}</em>`; h.firstChild.textContent = c0;
        h.addEventListener('click', () => { S.tutShut = { ...(S.tutShut || {}), [c0]: !(S.tutShut || {})[c0] }; persist(); renderTutList(); });
        L.appendChild(h);
      }
      if (!words.length && shut[t.cat]) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tuttopic'; b.dataset.topic = t.id;
      if (words.length && adm) { const a = document.createElement('span'); a.className = 'aud'; a.textContent = t.aud === 'admin' ? 'ADMIN GUIDE' : 'USER GUIDE'; b.appendChild(a); }
      const n = document.createElement('b'); tutRich(n, t.title, words); b.appendChild(n);
      const hit = words.length ? t.steps.find((x) => words.some((w) => x.t.toLowerCase().replace(/\*/g, '').includes(w))) : null;
      const sub = document.createElement('span'); const plain = (hit || t.steps[0]).t.replace(/\*/g, ''); tutRich(sub, plain.length > 110 ? `${plain.slice(0, 108)}…` : plain, words); b.appendChild(sub);
      b.addEventListener('click', () => openTutTopic(t, words));
      L.appendChild(b);
    });
  }
  function openTutTopic(t, words) {
    if (!t) return;
    tutCur = t;
    $('tutTopicTitle').textContent = t.title;
    $('tutTopicCat').textContent = `${t.aud === 'admin' ? 'Admin guide' : 'User guide'} · ${t.cat}`;
    $('tutTour').onclick = () => tutStart(t, 0);
    const ol = $('tutSteps'); ol.innerHTML = '';
    t.steps.forEach((st, i) => {
      const li = document.createElement('li'), d = document.createElement('div'); tutRich(d, st.t, words || []); li.appendChild(d);
      if (st.go || st.hl) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm show'; b.textContent = 'Show me'; b.addEventListener('click', () => tutStart(t, i)); li.appendChild(b); }
      ol.appendChild(li);
    });
    const seq = tutTopics().filter((x) => x.aud === t.aud), k = seq.indexOf(t);
    $('tutPrev').disabled = k <= 0; $('tutNext').disabled = k < 0 || k >= seq.length - 1;
    $('tutPrev').onclick = () => openTutTopic(seq[k - 1]); $('tutNext').onclick = () => openTutTopic(seq[k + 1]);
    if (stack[stack.length - 1] !== 'tutTopic') openSheet('tutTopic');
    $('tutTopic').querySelector('.body').scrollTop = 0;
  }
  function openTutorial() { renderTutList(); openSheet('tutorial'); }

  /* v2.25.1: the guided tour. "Show me" (or "Guide me through it") starts at a step and goes on to the end of the topic: the
     tip stays on screen while the user works in the real app. Tapping the ringed button does it and moves to the next step
     (whatever screen it opens: camera, record, dialog…); Next › moves on without it; ✕ ends the tour. While a dialog is open
     the tip waits; it never leaves an open record or the camera by itself. */
  const TUT_SCREEN = { map: '', projects: 'projects', newProject: 'newProj', projectDetails: 'projects', records: 'list', export: 'export', settings: 'settings',
    profile: 'profile', camera: 'setCamera', exports: 'setExports', maps: 'offline', storage: 'setStorage', log: 'logSheet', admin: 'admin' };
  const tutTop = () => stack[stack.length - 1] || '';
  const tutOnScreen = (go) => (go === 'map' ? !stack.length : go === 'projectDetails' ? tutTop() === 'projects' && $('curMore').open : tutTop() === TUT_SCREEN[go]);
  const tutModal = () => ['askBox', 'pinBox', 'promptBox', 'qrShow', 'busy', 'qrScan'].some((id) => { const e = $(id); return e && !e.hidden; });
  const tutBusyScreen = () => stack.includes('editor') || stack.includes('camera'); // never closed by the tour
  let tutTour = null, tutTimer = 0;
  async function tutGo(go) {
    switch (go) {
      case 'projects': if (tutTop() !== 'projects') openProjects(); break;
      case 'newProject': if (tutTop() !== 'projects') openProjects(); await tutWait(150); openNewProject(); break;
      case 'projectDetails': if (tutTop() !== 'projects') openProjects(); await tutWait(150); $('curMore').open = true; break;
      case 'records': if (tutTop() !== 'list') $('listBtn').click(); break;
      case 'export': if (tutTop() !== 'export') $('exportBtn').click(); break;
      case 'settings': if (tutTop() !== 'settings') $('settingsBtn').click(); break;
      case 'profile': if (tutTop() !== 'settings') $('settingsBtn').click(); await tutWait(150); openProfile(false); break;
      case 'admin': if (tutTop() !== 'settings') $('settingsBtn').click(); await tutWait(150); $('goAdmin').click(); break;
      case 'camera': case 'exports': case 'maps': case 'storage': case 'log':
        if (tutTop() !== 'settings') $('settingsBtn').click(); await tutWait(150); $({ camera: 'goCamera', exports: 'goExports', maps: 'goMaps', storage: 'goStorage', log: 'goLog' }[go]).click(); break;
      default: break; // the map
    }
  }
  /** Opens the step's screen unless it is already open; waits while a dialog, a record or the camera is open. */
  async function tutScreen(st) {
    const tour = tutTour; if (!tour) return;
    tour.pending = null;
    if (!st.go || tutOnScreen(st.go)) return;
    if (tutModal() || tutBusyScreen()) { tour.pending = st; return; }
    // back to the step's base screen when it is open underneath (Settings or Projects), else to the map; then on to the screen
    const base = ['settings', 'profile', 'admin', 'camera', 'exports', 'maps', 'storage', 'log'].includes(st.go) ? 'settings' : ['projects', 'newProject', 'projectDetails'].includes(st.go) ? 'projects' : '';
    if (base && stack.includes(base)) { while (tutTop() !== base) await closeSheet(); } else await closeAll();
    try { await tutGo(st.go); if (st.go === 'export' && st.hl && !$('export').hidden) { const card = /^#do[A-Za-z]+$/.test(st.hl) ? st.hl.slice(1) : /^#dxf(Mode|TplBox)$/.test(st.hl) ? 'doDxf' : ''; if (card) { showExport(card); if (st.hl === '#dxfTplBox' && $('dxfTplBox').hidden) { $('dxfMode').value = 'tpl'; $('dxfMode').dispatchEvent(new Event('change')); } } } } catch (e) { LOG.warn('tut.go', errInfo(e)); }
    await tutWait(400);
  }
  /** The first control of the step that is on screen (not under another screen), or null. */
  function tutTarget(st) {
    if (!st || !st.hl) return null;
    const onTop = (el) => { // on screen and not under another screen, a fixed footer or a dialog
      const r = el.getBoundingClientRect();
      if (r.bottom < 4 || r.top > innerHeight - 4 || r.right < 0 || r.left > innerWidth) return false;
      const x = Math.min(innerWidth - 2, Math.max(1, r.left + r.width / 2)), y = Math.min(innerHeight - 2, Math.max(1, r.top + Math.min(r.height / 2, 20)));
      const hit = document.elementsFromPoint(x, y).find((h) => h.id !== 'tutSpot' && h.id !== 'tutTip' && !h.closest('#tutTip'));
      return !!hit && (el === hit || el.contains(hit) || hit.contains(el));
    };
    for (const el of document.querySelectorAll(st.hl)) {
      if (!$('admin').hidden && !$('admMain').hidden && el.closest('#admMain')) { // v2.28: a folded Administration section opens for the step
        const g = el.closest('#admMain > .group.shut'); if (g) { g.classList.remove('shut'); g.querySelector(':scope > h3').setAttribute('aria-expanded', 'true'); }
        const dz = el.closest('details:not([open])'); if (dz) dz.open = true;
      }
      if (!el.getClientRects().length || el.closest('[hidden]')) continue;
      if (onTop(el)) return el;
      if (tutTour && tutTour.scrolled !== tutTour.i) { // once per step (the user may scroll away): bring it into view
        tutTour.scrolled = tutTour.i; el.scrollIntoView({ block: 'center', inline: 'nearest' });
        if (onTop(el)) return el;
      }
    }
    return null;
  }
  function tutEnd() {
    clearInterval(tutTimer); tutTimer = 0; tutTour = null;
    ['tutSpot', 'tutTip'].forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); });
    document.removeEventListener('click', tutTapped, true);
  }
  /** The ringed control was tapped: the app does its part, then the tour moves on. */
  function tutTapped(e) {
    const tour = tutTour, st = tour && tour.t.steps[tour.i];
    let el = null; try { el = st && st.hl && e.target && e.target.closest ? e.target.closest(st.hl) : null; } catch (x) { el = null; }
    if (!el || !el.matches('button, a, summary, [role="button"], .rowbtn, .chip') || el.disabled) return;
    const at = tour.i; setTimeout(() => { if (tutTour === tour && tour.i === at) tutNext(true); }, 350);
  }
  async function tutStart(t, i) {
    tutEnd();
    while (['tutTopic', 'tutorial'].includes(tutTop())) await closeSheet();
    tutTour = { t, i, el: null, pending: null, scrolled: -1 };
    document.addEventListener('click', tutTapped, true);
    await tutScreen(t.steps[i]); tutRender();
    tutTimer = setInterval(tutTrack, 300);
    LOG.info('tut.tour', { topic: t.id, from: i + 1 });
  }
  /** byTap: the user did the step in the app; the next step's screen is then opened only when the user asks (Open it ›), so
      a result, a saved file or a dialog on screen is never closed under them. */
  async function tutNext(byTap) {
    const tour = tutTour; if (!tour) return;
    if (tour.i >= tour.t.steps.length - 1) { tutEnd(); toast(`Tutorial: “${tour.t.title}” done`, 3000); return; }
    tour.i++; tour.el = null; tour.pending = null; tour.miss = 0;
    tutRender(); if (!byTap) await tutScreen(tour.t.steps[tour.i]); if (tutTour === tour) tutTrack();
  }
  function tutRender() {
    const tour = tutTour; if (!tour) return;
    const { t, i } = tour, st = t.steps[i], last = i >= t.steps.length - 1;
    let tip = document.getElementById('tutTip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'tutTip'; tip.setAttribute('role', 'dialog'); document.body.appendChild(tip); }
    tip.setAttribute('aria-label', `Tutorial: ${t.title}`); tip.innerHTML = '';
    const head = document.createElement('div'); head.className = 'tuthead';
    const ht = document.createElement('span'); ht.textContent = `${t.title} · step ${i + 1} of ${t.steps.length}`;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'iconbtn tutx'; x.setAttribute('aria-label', 'End the tutorial'); x.textContent = '✕'; x.addEventListener('click', tutEnd);
    // v2.28: the tip folds down to its title line so it does not hide the screen (the ring still shows what to tap)
    const mn = document.createElement('button'); mn.type = 'button'; mn.className = 'iconbtn tutmin'; mn.setAttribute('aria-label', tour.mini ? 'Show the tip' : 'Make the tip small'); mn.textContent = tour.mini ? '▴' : '▾';
    mn.addEventListener('click', () => { tour.mini = !tour.mini; tutRender(); });
    head.append(ht, mn, x); tip.appendChild(head); tip.classList.toggle('mini', !!tour.mini);
    if (tour.mini) head.addEventListener('click', (e) => { if (e.target === head || e.target === ht) { tour.mini = false; tutRender(); } });
    const p = document.createElement('div'); p.className = 'tuttext'; tutRich(p, st.t, []); tip.appendChild(p);
    if (st.hl) { const n = document.createElement('p'); n.className = 'hint tutwhen'; n.hidden = true; n.textContent = st.when || 'Not on this screen right now: it shows when it applies.'; tip.appendChild(n); }
    if (st.hl && !last) { const n = document.createElement('p'); n.className = 'hint tutdo'; n.textContent = 'Tap the ringed button to do it, or Next ›'; tip.appendChild(n); }
    const row = document.createElement('div'); row.className = 'row';
    const btn = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = `btn sm${cls ? ` ${cls}` : ''}`; b.textContent = label; b.addEventListener('click', fn); row.appendChild(b); };
    btn('Back to the tutorial', '', async () => { const tt = tour.t; tutEnd(); if (!tutBusyScreen() && !tutModal()) await closeAll(); openTutorial(); openTutTopic(tt); });
    if (st.go) btn('Open it ›', 'tutopen', async () => { await tutScreen(st); tutTrack(); });
    btn(last ? 'Done' : 'Next ›', 'primary', () => tutNext(false));
    tip.appendChild(row);
    tutTrack();
  }
  /** Every 0.3 s while the tour runs: the ring follows its control from screen to screen; the tip waits behind dialogs. */
  function tutTrack() {
    const tour = tutTour, tip = document.getElementById('tutTip'); if (!tour || !tip) return;
    const st = tour.t.steps[tour.i], modal = tutModal();
    if (tour.pending && !modal && !tutBusyScreen()) { const pend = tour.pending; tour.pending = null; tutScreen(pend).then(() => tutTrack()); return; }
    tip.style.display = modal ? 'none' : '';
    const el = modal ? null : tutTarget(st); tour.el = el;
    // the app skipped this step's screen (e.g. the pole ID read by itself: the record is already open): on to the next step
    if (!el && !modal && st.hl && !st.go && tour.i < tour.t.steps.length - 1) {
      const nx = tour.t.steps[tour.i + 1];
      if (!tour.miss) tour.miss = Date.now();
      else if (Date.now() - tour.miss > 1500 && nx.hl && !nx.go && tutTarget(nx)) { tour.miss = 0; tutNext(true); return; }
    } else tour.miss = 0;
    let spot = document.getElementById('tutSpot');
    if (!el) { if (spot) spot.remove(); }
    else {
      if (!spot) { spot = document.createElement('div'); spot.id = 'tutSpot'; document.body.appendChild(spot); }
      const r = el.getBoundingClientRect(), pad = 6;
      Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    }
    const away = !!st.go && !tutOnScreen(st.go); // the step's screen is not open: Open it › (or it opens when a dialog closes)
    const o = tip.querySelector('.tutopen'); if (o) o.hidden = !away || !!tour.pending;
    const w = tip.querySelector('.tutwhen'); if (w) w.hidden = !!el || modal || away;
    const d = tip.querySelector('.tutdo'); if (d) d.hidden = !el;
    if (modal) return;
    const h = tip.offsetHeight;
    if (el) { const r = el.getBoundingClientRect(), below = r.top + r.height / 2 < innerHeight / 2; tip.style.top = `${below ? Math.min(innerHeight - h - 10, r.bottom + 18) : Math.max(10, r.top - 18 - h)}px`; }
    else tip.style.top = `${Math.max(10, Math.min(70, innerHeight - h - 10))}px`;
  }
  $('tutorialBtn').addEventListener('click', openTutorial);
  $('tutQ').addEventListener('input', renderTutList);
  $('tutQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { renderTutList(); $('tutQ').blur(); } });
  $('tutGo').addEventListener('click', () => { renderTutList(); $('tutQ').blur(); });
  [...$('tutAud').children].forEach((b) => b.addEventListener('click', () => { tutAudSel = b.dataset.aud === 'admin' && tutAdmin() ? 'admin' : 'user'; $('tutQ').value = ''; renderTutList(); }));
  $('setMyTypes').addEventListener('change', () => {
    S.myTypes = parseTypeLines($('setMyTypes').value).filter((t) => !BUILTIN_TYPES.some((b) => b.p === t.p)); persist(); refreshTypes();
    $('setMyTypes').value = typeLines(S.myTypes); renderTypeInfo();
  });
  function renderTypeInfo() { $('typeInfo').textContent = poleTypes().map((t) => `${t.n} ${t.p}-`).join(' · '); }
  $('goCamera').addEventListener('click', () => {
    $('setMyTypes').value = typeLines(S.myTypes); renderTypeInfo();
    $('setReadId').checked = S.readId !== false; $('setReadIdAcc').checked = S.readIdAcc === true; $('setIdAuto').checked = S.idAuto !== false; $('setOrient').value = S.idOrient === 'v' ? 'v' : 'h'; $('setHand').value = handOf();
    $('setQuality').value = effectiveQuality(); $('setQuality').disabled = !!S.team;
    $('qualityNote').textContent = S.team ? `Set by the admin in the company list “${S.team.name}” — the same on every phone.` : 'Until this phone takes a company list, you can choose this yourself.';
    openSheet('setCamera');
  });
  $('setReadId').addEventListener('change', () => { S.readId = $('setReadId').checked; persist(); });
  $('setReadIdAcc').addEventListener('change', () => { S.readIdAcc = $('setReadIdAcc').checked; persist(); });
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
  [['setZone', 'setZone2']].forEach((ids) => ids.forEach((id) => $(id).addEventListener('change', () => { S.zone = +$(id).value; persist(); syncExpUi(); $('dxfZoneLbl').textContent = $('dxfZoneLbl2').textContent = `UTM ${S.zone}N`; })));
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
    syncExpUi(); $('dxfZoneLbl').textContent = $('dxfZoneLbl2').textContent = `UTM ${S.zone}N`;
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
    if (p.adminJobs != null && !(typeof p.adminJobs === 'object' && Object.keys(p.adminJobs).length <= 100 && Object.entries(p.adminJobs).every(([k, v]) => k.length <= 120 && Array.isArray(v) && v.length <= 4 && v.every((x) => JOB_NAME[x])))) return false; // v2.28
    if (!num(p.mloopLen, 1, 100) || !str(p.areaSrc, 300) || !str(p.dxfSeed, 300)) return false; // v2.29; v2.30: the plan template link
    if (p.boqLists != null && !(typeof p.boqLists === 'object' && Object.entries(p.boqLists).every(([k, v]) => BOQ_OPT[k] && list(v, 40, 40)))) return false; // v2.28
    if (!list(p.detailItems, 40, 40)) return false; // v2.28
    if (p.vendorRecords != null && typeof p.vendorRecords !== 'boolean') return false;
    if (p.web != null && !(typeof p.web === 'string' && /^https:\/\/\S{1,300}$/.test(p.web))) return false;
    if (p.otp != null && !(typeof p.otp === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(p.otp))) return false; // v2.22: approval codes
    if (!str(p.kmzPass, 100) || !list(p.kmzOld, 5, 100)) return false; // v2.22: the shared KMZ lock
    if (p.logos != null && !(typeof p.logos === 'object' && Object.keys(p.logos).every((k) => (k === 'left' || k === 'right') && typeof p.logos[k] === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(p.logos[k]) && p.logos[k].length <= 24000))) return false; // v2.23: logos (JPEG)
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
  const joinText = (t) => { const s = String(t || '').trim(), m = /#join=([^\s&#]+)/.exec(s); if (!m) return /^PC[TA][01]:/.test(s) ? s.split('&')[0] : s; try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } };
  const teamCos = () => {
    if (S.team && S.team.src && S.cloud && S.cloud.src === S.team.src.url && S.cloud.companies.length) return S.cloud.companies; // online sheet
    return S.team && Array.isArray(S.team.co) ? S.team.co : [];
  };
  const profileOk = () => !!(S.user && S.user.name && S.user.mobile && S.user.email && S.user.company && (keyMode() ? S.user.company === S.keyCompany : !teamCos().length || teamCos().includes(S.user.company)));
  /* ---- company keys (v2.10): the key tells the online sheet which company a user belongs to; the company is then fixed ---- */
  const keyMode = () => !!(S.companyKey && S.keyCompany);
  var keyIn = ''; // v2.24: the key of an invite received on this phone, until Save signs in with it (never shown)
  const normKey = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sheetUrl = () => (S.team && S.team.src && S.team.src.url) || (ORG && ORG.src && ORG.src.url) || '';
  /** Key sign-in is offered where the organisation uses company keys (the sheet says so), or the app is tied to one with a sheet. */
  const keyOffered = () => keyMode() || !!keyIn || (!holdsListKey() && !!(sheetUrl() && ((S.cloud && S.cloud.strict) || (ORG && ORG.src && S.sheetStrict !== false) || /company key/.test(cloudErr)))); // the admin who holds the list key may still choose
  /* v2.24: the company key is never shown in the app. It reaches a new phone only in an invite QR code or link (or the user's
     own move code), masked there (#ci=…) so that it cannot be read off the link; the app keeps it out of every field. */
  const keyPad = (i) => { const m = new TextEncoder().encode('G-eSAA/ci/v1'); return m[i % m.length] ^ ((i * 73 + 41) & 255); };
  const hideKey = (k) => 'k' + b64u.enc(new TextEncoder().encode(normKey(k)).map((x, i) => x ^ keyPad(i)));
  const unhideKey = (t) => {
    try { t = String(t || ''); if (t[0] !== 'k') return ''; const k = new TextDecoder().decode(b64u.dec(t.slice(1)).map((x, i) => x ^ keyPad(i))); return /^[A-Z0-9]{8,40}$/.test(k) ? k : ''; } catch (e) { return ''; }
  };
  async function keyLogin(raw) {
    const key = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (normKey(key).length < 8) throw new Error('Scan the invite QR code or open the invite link from your admin or a coworker first.');
    const url = sheetUrl();
    if (!url) throw new Error('Open the invite link or QR code from your admin or a coworker first.');
    if (!navigator.onLine) throw new Error('Connect to the internet once to check the company key.');
    const j = await cloudRequest({ url, key: '' }, null, { ckey: key }); // v2.24: the key alone (with the read key, a wrong key would not be named)
    if (!j || !j.ok) throw new Error(j && j.error === 'company key' ? 'This invite is no longer valid (its company key is not in the online sheet). Ask your admin or a coworker for a new invite.' : j && j.error === 'key' ? 'The online sheet does not accept company keys yet: the admin must update its script (v2.10).' : `The online sheet did not answer${j && j.error ? ` (${j.error})` : ''}.`);
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
  /** Invite link for a company: its key, masked (and, when the app is not tied to the sheet, the list too). */
  async function inviteLinkFor(key) {
    const base = webBase(); if (!base || !S.team || normKey(key).length < 8) return '';
    if (ORG && ORG.src && ORG.id === S.team.id) return `${base}#ci=${hideKey(key)}`;
    const short = await shortJoin(); // v2.26: where the online sheet holds this list version, a short link and a small QR code
    if (short) return `${short}&ci=${hideKey(key)}`;
    return `${base}#join=${await packShare('PCT', { b: S.team.b, s: S.team.s, k: S.team.k })}&ci=${hideKey(key)}`;
  }
  /** Invite link for coworkers: this phone's company key. */
  const inviteLink = async () => { // v2.28: without company keys, the join link names the company
    if (keyMode()) return inviteLinkFor(S.companyKey);
    return S.user && S.user.company ? joinLinkFor(S.user.company) : '';
  };
  /** v2.28: a join link that names the company (short where the online sheet holds the list). */
  async function joinLinkFor(co) {
    const base = webBase(); if (!base || !S.team) return '';
    const tail = co ? `&co=${encodeURIComponent(co)}` : '', short = await shortJoin();
    if (short) return short + tail;
    return `${base}#join=${await packShare('PCT', { b: S.team.b, s: S.team.s, k: S.team.k })}${tail}`;
  }
  const holdsListKey = () => !!(S.adminKey && S.team && (S.team.key === S.adminKey.pub || (S.team.admins || []).some((a) => a.k === S.adminKey.pub)));
  const isAdmin = () => holdsListKey() && adminUserOk();
  const signerName = () => (S.team ? (S.team.key ? `the admin company${S.team.pol && S.team.pol.owner ? ` (${S.team.pol.owner})` : ''}` : S.team.admins && S.team.admins[S.team.k] ? S.team.admins[S.team.k].n : 'admin') : 'admin');
  /* ---- v2.25: the user's regions and territories filter the online sheet's projects (its Region and Territory columns) ---- */
  const REGIONS = ['NLZ', 'SLZ', 'NCR', 'VIS', 'MIN'], TERRS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
  /** A Region cell as one of the codes (the long names too); anything else is kept as written and matches no choice. */
  function regionCode(v) {
    const c = String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
    if (!c) return '';
    if (/^(NLZ|NL|NLUZ|NORTHLUZON|NORTHERNLUZON)$/.test(c)) return 'NLZ';
    if (/^(SLZ|SL|SLUZ|SOUTHLUZON|SOUTHERNLUZON)$/.test(c)) return 'SLZ';
    if (/^(NCR|METROMANILA|NATIONALCAPITALREGION)$/.test(c)) return 'NCR';
    if (/^(VIS|VISAYAS)$/.test(c)) return 'VIS';
    if (/^(MIN|MINDANAO)$/.test(c)) return 'MIN';
    return c;
  }
  /** A Territory cell as T1…T8 ("T1", "Territory 1", "1", "MIN T1"); anything else is kept as written. */
  function terrCode(v) {
    const c = String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
    if (!c) return '';
    const m = /^(?:NLZ|SLZ|NCR|VIS|MIN)?(?:T|TER|TERR|TERRITORY)?0*([1-8])$/.exec(c);
    return m ? `T${m[1]}` : c;
  }
  const cellCodes = (v, f) => String(v || '').split(/\s*[,;\/&+\n]\s*/).map(f).filter(Boolean);
  const myRegions = () => ((S.user && Array.isArray(S.user.regions)) ? S.user.regions.filter((x) => REGIONS.includes(x)) : []);
  const myTerrs = () => ((S.user && Array.isArray(S.user.terrs)) ? S.user.terrs.filter((x) => TERRS.includes(x)) : []);
  /** A sheet row is listed when its region and territory are among the user's (a blank cell lets it through).
      v2.27: with no region or no territory ticked, nothing is listed for the user. */
  const areaSet = () => myRegions().length > 0 && myTerrs().length > 0;
  function areaOk(t) {
    const R = myRegions(), T = myTerrs();
    if (!R.length || !T.length) return false;
    const rs = cellCodes(t.region || extraOfT(t, 'Region'), regionCode), ts = cellCodes(t.territory || extraOfT(t, 'Territory'), terrCode);
    return (!rs.length || rs.some((x) => R.includes(x))) && (!ts.length || ts.some((x) => T.includes(x)));
  }
  const extraOfT = (t, key) => { const e = (t && t.extra || []).find(([k]) => normCo(k) === normCo(key)); return e ? e[1] : ''; };
  /** v2.28: Region and Territory as dropdowns: tick several, or All. */
  function renderAreaChips(regions, terrs) {
    const mk = (box, sum, all, on, what) => {
      box.innerHTML = '';
      const row = (v, label, cls) => { const l = document.createElement('label'); if (cls) l.className = cls; const c = document.createElement('input'); c.type = 'checkbox'; c.value = v; c.checked = v === '*' ? all.every((x) => on.includes(x)) : on.includes(v); l.append(c, document.createTextNode(label)); box.appendChild(l); return c; };
      const allBox = row('*', `All ${what}`, 'all'), boxes = all.map((v) => row(v, v));
      const show = () => { const n = boxes.filter((c) => c.checked).map((c) => c.value); allBox.checked = n.length === all.length; allBox.indeterminate = n.length > 0 && n.length < all.length;
        sum.textContent = !n.length ? `None: tap to choose your ${what}` : n.length === all.length ? `All ${what} (${all.length})` : n.join(', '); sum.classList.toggle('none', !n.length); };
      allBox.addEventListener('change', () => { boxes.forEach((c) => { c.checked = allBox.checked; }); show(); });
      boxes.forEach((c) => c.addEventListener('change', show));
      show();
    };
    mk($('pfRegions'), $('pfRegionsSum'), REGIONS, regions || [], 'regions'); mk($('pfTerrs'), $('pfTerrsSum'), TERRS, terrs || [], 'territories');
    $('pfRegionsBox').open = false; $('pfTerrsBox').open = false;
  }
  const chosenChips = (id) => [...$(id).querySelectorAll('input[type=checkbox]')].filter((b) => b.checked && b.value !== '*').map((b) => b.value);
  document.addEventListener('click', (e) => { ['pfRegionsBox', 'pfTerrsBox'].forEach((id) => { const d = $(id); if (d.open && !d.contains(e.target)) d.open = false; }); }); // a tap outside closes the dropdown
  let profileFirst = false;
  /** v2.28: the company comes from the invite (QR code or link), the details saved or moved, never typed; only the admin who
      holds the list key chooses it. A company no longer on the list may be chosen again. */
  function lockedCo() {
    if (keyMode()) return S.keyCompany;
    if (holdsListKey()) return '';
    const cos = teamCos(), c = (moveFill && moveFill.company) || (S.user && S.user.company) || S.inviteCo || '';
    return cos.find((x) => normCo(x) === normCo(c)) || '';
  }
  function renderCoSelect(sel) {
    const cos = teamCos(), box = $('pfCompany'), lock = lockedCo();
    if (!cos.length) { box.innerHTML = '<option value="">No company list on this phone yet</option>'; box.disabled = true; }
    else if (lock) { box.innerHTML = `<option selected>${C.xmlEsc(lock)}</option>`; box.disabled = true; }
    else {
      box.disabled = false;
      box.innerHTML = '<option value="">Choose your company…</option>' + cos.map((c) => `<option${c === sel ? ' selected' : ''}>${C.xmlEsc(c)}</option>`).join('');
    }
    const own = pol().owner;
    $('pfTeam').textContent = S.team ? `${lock && !keyMode() ? `Your company comes from your invite. To change company: Settings → Reset user. ` : cos.length && !holdsListKey() ? 'Your invite did not name a company: choose yours (it is kept from then on). ' : ''}List “${S.team.name}” v${S.team.rev}${own ? ` · ${own} is the admin company (its staff need the admin PIN)` : ''}.${sel && !cos.includes(sel) ? ` “${sel}” is no longer on the list: choose again.` : ''}` : '';
    $('pfJoin').hidden = !!cos.length;
    renderProfileMode();
  }
  /** With company keys the user joins with an invite (QR code or link) instead of choosing a company, and never sees the
      company names. v2.24: the key itself is never shown or typed. */
  function renderProfileMode() {
    const keyed = keyOffered(), locked = keyMode();
    $('pfKeyBox').hidden = !keyed; $('pfCoBox').hidden = keyed && !locked;
    if (locked) {
      $('pfKeyState').textContent = `🔒 Joined ${S.keyCompany} with its company key (hidden)`;
      $('pfKeyBtns').hidden = true;
      $('pfCompany').innerHTML = `<option>${C.xmlEsc(S.keyCompany)}</option>`; $('pfCompany').disabled = true;
      $('pfKeyInfo').textContent = 'Your company comes from the invite. Invite coworkers: Settings → Invite a coworker (QR code or link). To change company: Settings → Reset user.';
      $('pfTeam').textContent = '';
    } else if (keyed) {
      $('pfKeyBtns').hidden = !!keyIn; // v2.28: the invite is here: no second scan or paste
      $('pfKeyState').textContent = keyIn ? '✓ Invite received (the company key stays hidden)' : 'No invite yet';
      $('pfKeyInfo').textContent = keyIn ? 'Enter your name, mobile and email, then Save: the online sheet tells which company the invite is for.'
        : 'Scan the invite QR code, or open or paste the invite link, from your admin or a coworker.';
    }
    $('pfJoin').hidden = keyed || !!teamCos().length;
  }
  let moveFill = null; // details from a move link (v2.15), shown for a check until Save
  function openProfile(first) {
    profileFirst = !!first;
    const u = { ...(S.user || {}), ...(moveFill || {}) };
    $('pfName').value = u.name || (S.userName ? S.userName.split('·')[0].trim() : '');
    $('pfMobile').value = u.mobile || ''; $('pfEmail').value = u.email || ''; $('pfIdNo').value = u.idno || ''; // v2.28
    renderAreaChips(u.regions || [], u.terrs || []);
    renderCoSelect(u.company || '');
    if (moveFill && moveFill.key && !keyMode()) { keyIn = moveFill.key; renderProfileMode(); }
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
    const email = $('pfEmail').value.trim(), keyed = keyOffered() && !keyMode(), idno = $('pfIdNo').value.trim().replace(/\s+/g, ' ').slice(0, 40); // v2.28: company ID no.
    let company = keyMode() ? S.keyCompany : $('pfCompany').value;
    const err = name.length < 3 ? 'Enter your full name.' : !mobileOk(mobile) ? 'Enter your mobile number, e.g. 0917 123 4567 or +63 917 123 4567.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? 'Enter a valid email address.'
        : keyed ? (normKey(keyIn).length < 8 ? 'Scan the invite QR code or open the invite link from your admin or a coworker first.' : '')
          : !company ? (teamCos().length ? 'Choose your company.' : 'Get the company list from your admin first (below).') : '';
    if (err) { $('pfErr').textContent = err; $('pfErr').hidden = false; return; }
    if (keyed) { // the key says which company this user belongs to
      $('pfErr').textContent = 'Checking the invite with the online sheet…'; $('pfErr').hidden = false; $('pfSave').disabled = true;
      try { company = await keyLogin(keyIn); } catch (e) { $('pfErr').textContent = e.message || String(e); return; } finally { $('pfSave').disabled = false; }
      keyIn = ''; $('pfErr').hidden = true; renderProfileMode();
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
    const regions = chosenChips('pfRegions').filter((x) => REGIONS.includes(x)), terrs = chosenChips('pfTerrs').filter((x) => TERRS.includes(x));
    const coChanged = !S.user || S.user.company !== company || String(myRegions()) !== String(regions) || String(myTerrs()) !== String(terrs);
    S.user = { name, mobile, email: email.toLowerCase(), company, ...(idno ? { idno } : {}), ...(regions.length ? { regions } : {}), ...(terrs.length ? { terrs } : {}) }; moveFill = null; persist();
    if (coChanged) cloudSync(true).then(() => { if (!$('newProj').hidden) renderSites(); }); // the sheet sends each company its own sites
    const first = profileFirst; profileFirst = false; await closeSheet();
    renderWho(); toast(regions.length && terrs.length ? `Saved: ${byLine()}` : `Saved: ${byLine()}. No ${regions.length ? 'territory' : terrs.length ? 'region' : 'region or territory'} ticked: no site from the online sheet is listed for you.`, regions.length && terrs.length ? 2500 : 6000); // v2.27
    if (sharedWaiting) { const f = sharedWaiting; sharedWaiting = null; openSharedFile(f); return; } // v2.19: a shared file waited for the details
    if (first && !S.project) askNewProject();
  });
  function renderWho() {
    const u = S.user;
    $('whoBox').textContent = u ? u.name : 'Enter your details';
    const area = [...myRegions(), ...myTerrs()].join(' ');
    $('whoSub').textContent = u ? `${u.company} · ${u.mobile} · ${u.email}${isInspector() && pol().owner ? ' · inspector' : ''}${area ? ` · ${area}` : ''}` : 'Name, mobile, email and company';
    $('inviteBtn').hidden = !keyMode() && !(S.team && u && u.company);
    $('apprShowBtn').hidden = !canShowAppr(); // v2.28
  }
  /** v2.24: Administration → Invite a company's users: the admin pastes one company's key from the CompanyKeys tab of the
      online sheet; the sheet confirms whose key it is; the app shows the invite (QR code and link), never the key. */
  $('admInvMake').addEventListener('click', () => guard(async () => {
    const info = (t) => { $('admInvInfo').textContent = t; }, key = normKey($('admInvKey').value), url = sheetUrl();
    if (key.length < 8) { info('Paste the key of one company from the CompanyKeys tab of the online sheet.'); return; }
    if (!url) { info('This list has no online sheet: company keys work only with one (Online sheet, above).'); return; }
    if (!webBase()) { info('No website address for the invite: open G-eSAA from its website once.'); return; }
    if (!navigator.onLine) { info('Connect to the internet: the key is checked with the online sheet.'); return; }
    info('Checking the key with the online sheet…');
    let j = null;
    // the key alone: the sheet says whose it is, or that it is not one
    try { j = await cloudRequest({ url, key: '' }, null, { ckey: key }); } catch (e) { info(`The online sheet did not answer (${e.message || e}).`); return; }
    if (!j || !j.ok || !j.you) { info(j && j.error === 'company key' ? 'This key is not in the CompanyKeys tab of the online sheet. Copy it again (the whole key).' : (j && j.error === 'key') || (j && j.ok && !j.you) ? 'The online sheet does not accept company keys yet: update its script (v2.10) and run makeCompanyKeys.' : `The online sheet did not answer${j && j.error ? ` (${j.error})` : ''}.`); return; }
    const link = await inviteLinkFor(key);
    if (!link) { info('The invite could not be made: save the company list first.'); return; }
    $('admInvKey').value = ''; info(`Invite made for ${j.you}. Make a new one any time from the key in the sheet.`);
    LOG.info('admin.invite', { company: j.you });
    qrLink = link; qrAlt = null;
    await showQr(`Invite to ${j.you}`, `For the users of ${j.you}: they scan this with the phone's camera (or you send the link), then enter their name, mobile and email. The company key inside stays hidden, but the invite works for anyone who has it: send it only to ${j.you}.`, link);
  }, 'No invite'));
  $('inviteBtn').addEventListener('click', () => guard(async () => {
    const link = await inviteLink();
    if (!link) { toast('No website address for the invite: open G-eSAA from its website once, or ask your admin', 5000); return; }
    qrLink = link; qrAlt = null;
    const co = keyMode() ? S.keyCompany : S.user.company;
    await showQr(`Invite to ${co}`, keyMode() ? `A coworker scans this with the phone's camera (or you send the link), then enters their name, mobile and email. The company key inside stays hidden, but the invite works for anyone who has it: share it only inside ${co}.`
      : `A coworker scans this with the phone's camera (or you send the link), then enters their name, mobile and email. The invite names ${co}: they do not choose the company.`, link);
  }, 'No invite'));
  $('resetUser').addEventListener('click', async () => {
    const ok = await ask('Reset the user of this phone?', 'Your name, mobile, email, company and company key are removed from this phone, and the welcome screen asks for them again. Projects and photos stay on the phone, with the names they were recorded with.',
      [{ label: 'Cancel', value: false }, { label: 'Reset user', value: true, primary: true }]);
    if (!ok) return;
    LOG.info('user.reset', { keyed: keyMode() });
    S.user = null; S.companyKey = ''; S.keyCompany = ''; S.adminKey = null; S.cloud = null; S.inviteCo = ''; persist();
    ['pfName', 'pfMobile', 'pfEmail', 'pfIdNo'].forEach((id) => { $(id).value = ''; }); keyIn = ''; renderAreaChips([], []);
    renderWho(); renderTeamInfo(); openProfile(true);
  });
  $('editMe').addEventListener('click', () => openProfile(false));
  /* ---- moving the user to another phone (v2.15): one link or QR code with the company list and the user's details ---- */
  $('moveBtn').addEventListener('click', () => guard(async () => {
    if (!S.user) { toast('Enter your details first'); return; }
    const base = webBase();
    if (!base) { toast('No website address for the link: open G-eSAA from its website once, or ask your admin', 5000); return; }
    const u = S.user, mv = b64u.enc(enc8(JSON.stringify({ n: u.name, m: u.mobile, e: u.email, c: u.company, ...(u.idno ? { i: u.idno } : {}), ...(S.companyKey ? { h: hideKey(S.companyKey) } : {}), ...(myRegions().length ? { r: myRegions() } : {}), ...(myTerrs().length ? { t: myTerrs() } : {}) }))); // v2.24: the key masked (h); v2.25: regions, territories
    let list = '';
    if (S.team) { const short = await shortJoin(); list = short ? short.slice(short.indexOf('#') + 1) : `join=${await packShare('PCT', { b: S.team.b, s: S.team.s, k: S.team.k })}`; }
    const link = `${base}#${list ? `${list}&` : ''}mv=${mv}`;
    qrLink = link; qrAlt = null;
    await showQr('Move to another phone', 'On the new phone, open G-eSAA and tap Scan QR code on its first screen (already set up: Settings → Update the company list → Scan QR), then point it at this code. G-eSAA reads it with its own camera; “From a picture” reads a screenshot of it. Or send yourself the link and open it there. Your company list and details (name, mobile, email, company) are filled in for a check: tap Save. Projects and photos: Export → Backup on this phone, then on the new phone Projects → Open a shared file. Admins enter the admin PIN again. The link carries your details: send it only to yourself.', link);
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
    moveFill = { name: String(o.n).slice(0, 80), mobile: String(o.m || '').slice(0, 30), email: String(o.e).slice(0, 120), company: String(o.c || '').slice(0, 100), idno: String(o.i || '').slice(0, 40), key: o.h ? unhideKey(o.h) : o.k ? normKey(o.k).slice(0, 40) : '',
      regions: Array.isArray(o.r) ? o.r.filter((x) => REGIONS.includes(x)) : [], terrs: Array.isArray(o.t) ? o.t.filter((x) => TERRS.includes(x)) : [] };
    LOG.info('user.move', { keyed: !!(o.h || o.k) });
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

  /* ---- v2.22: admin approval codes (deleting a completed project) ---- */
  const REQ_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const reqCode = () => { const r = crypto.getRandomValues(new Uint8Array(6)); const c = [...r].map((x) => REQ_ABC[x % REQ_ABC.length]).join(''); return `${c.slice(0, 3)}-${c.slice(3)}`; };
  const normReq = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  /** The 6-digit approval code for one request code: HMAC-SHA-256 with the list's approval key (pol.otp). */
  async function approvalCode(secret, req) {
    const k = await crypto.subtle.importKey('raw', b64u.dec(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc8(`polecam-delete|${normReq(req)}`)));
    return String((((h[0] & 0x7f) << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) % 1000000).padStart(6, '0');
  }
  /** Asks for an admin's approval on this phone: the approval code for a fresh request code, or the admin PIN typed by an admin. */
  async function adminApproves(what) {
    const P = pol(), req = reqCode();
    if (isAdmin() && !(S.team && S.team.keyEnc) && !P.otp) return true; // an older list with no PIN key and no approval key: its admin's phone decides
    LOG.info('approve.ask', { what: what.slice(0, 60) });
    const v = await askPin('Admin approval needed', `${what} needs an admin's approval. Send this request code to an admin (Settings → Administration → Approve a delete) and type the 6-digit code you get back. It works only for this request. An admin who is with you can type the admin PIN instead.`, { code: req, placeholder: 'Approval code or admin PIN' });
    if (!v) return false;
    if (/^\d{6}$/.test(v) && P.otp && v === await approvalCode(P.otp, req)) { LOG.info('approve.ok', { by: 'code' }); return true; }
    if (/^\d{4,8}$/.test(v) && S.team && S.team.keyEnc && (await decPriv(S.team.keyEnc, v))) { LOG.info('approve.ok', { by: 'pin' }); return true; }
    LOG.warn('approve.wrong');
    toast(P.otp ? 'Not approved: wrong code or PIN. Each request has its own code: ask the admin again with the new request code.' : 'Not approved: wrong admin PIN. This company list has no approval codes yet: the admin saves the list once with G-eSAA 2.22.', 7000);
    return false;
  }
  $('admKmzPass').addEventListener('input', () => {
    const v = $('admKmzPass').value.trim();
    $('admKmzInfo').textContent = !v ? 'Empty: shared KMZ files are not locked.' : kmzHasKey(v) ? '⚠ This password holds your company key: every phone of the list would get it. A random password is safer.' : 'Shared PAT, cleanup and FAT KMZ files are locked with this password. Update every phone to v2.22 first: older versions cannot open locked files.';
  });
  $('admOwner').addEventListener('change', () => { if (admDraft) admDraft.pol.owner = $('admOwner').value; if (admKmzAuto && $('admKmzPass').value.trim() === admKmzAuto) { admKmzAuto = autoKmzFor($('admOwner').value); $('admKmzPass').value = admKmzAuto; } });
  $('admReqGo').addEventListener('click', () => guard(async () => {
    const req = normReq($('admReq').value), out = $('admReqOut');
    if (req.length !== 6) { toast('Type the 6-character request code from the user’s phone, e.g. K7Q-2M9'); return; }
    const sec = S.team && S.team.pol && S.team.pol.otp;
    if (!sec) { out.hidden = false; out.textContent = 'This list has no approval key yet: tap Save and share the list once, let the phones update, then get the code.'; return; }
    const code = await approvalCode(sec, req);
    out.hidden = false; out.textContent = `Approval code for ${req.slice(0, 3)}-${req.slice(3)}: ${code.slice(0, 3)} ${code.slice(3)}`;
    LOG.info('approve.code');
  }, 'No code'));

  /* ---- v2.22: the shared KMZ lock. In the KMZ shared for the defect cleanup and the FAT, the G-eSAA data (points.json, the
     photos) is encrypted and sealed (AES-GCM, key from the list's KMZ password with PBKDF2): Google Earth still shows doc.kml,
     but the data can be read only with the password, and any change to it makes the file refused. ---- */
  const SEAL_ITER = 150000;
  const sha256hex = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
  let admKmzAuto = '';
  const coShort = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim().split(/\s+/)[0] || 'ORG';
  /** The suggested password with the admin company chosen on the screen (the random part stays). */
  const autoKmzFor = (owner) => `${admKmzAuto.split('_')[0]}_${coShort(owner || (S.user && S.user.company))}`;
  /** A new random KMZ password: 128 bits (26 characters) and the admin company. Not the company key: the password goes to every
      phone of the list, and a company key there would let anyone sign in to the online sheet as that company. */
  function suggestKmzPass(company) {
    const r = crypto.getRandomValues(new Uint8Array(17)), abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let bits = 0, acc = 0, out = '';
    for (const b of r) { acc = (acc << 8) | b; bits += 8; while (bits >= 5 && out.length < 26) { out += abc[(acc >> (bits - 5)) & 31]; bits -= 5; } }
    return `${out}_${coShort(company)}`;
  }
  /** The KMZ password holds this phone's company key (the format 9CCA68FC9388_GLOBE): warned, as the list would carry the key. */
  const kmzHasKey = (pass) => { const k = normKey(S.companyKey); return k.length >= 8 && normKey(pass).includes(k); };
  /** v2.28: the KMZ lock password: the online sheet's (Settings → KMZ password) where it has one, else the company list's. */
  /** v2.28: the KMZ password: the one in the signed list (the admin saves the sheet's into it), else the online sheet's, so
      every phone of a list version locks with the same one; files are opened with either (and the older ones). */
  const sheetKmzPass = () => (S.team && S.team.src && S.cloud && S.cloud.src === S.team.src.url && S.cloud.kmzPass) || '';
  const kmzPassNow = () => pol().kmzPass || sheetKmzPass() || '';
  async function kmzKey(pass, saltB64) {
    const base = await crypto.subtle.importKey('raw', enc8(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64u.dec(saltB64), iterations: SEAL_ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  /** files: [{ name: 'polecam/…', data }] → the sealed set (polecam/seal.json, polecam/sealed/…); null when no password is set.
      Each file is encrypted on its own (its name bound in), with its IV in the encrypted manifest; the plain copy is let go at once. */
  async function sealFiles(files, pre, outside) {
    const pass = S.team && kmzPassNow(); if (!pass) return null;
    const salt = b64u.enc(crypto.getRandomValues(new Uint8Array(16))), key = await kmzKey(pass, salt), out = [], ivs = {};
    let i = 0;
    for (const f of files) {
      busy(`Locking the data ${++i} / ${files.length}`, i / files.length);
      const rel = f.name.slice(pre.length), iv = crypto.getRandomValues(new Uint8Array(12));
      const plain = typeof f.data === 'string' ? enc8(f.data) : f.data;
      f.data = null; // the plain bytes are not kept next to the locked ones (memory on big projects)
      out.push({ name: `${pre}sealed/${rel}.bin`, data: new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc8(rel) }, key, plain)) });
      ivs[rel] = b64u.enc(iv);
    }
    const out2 = {}; // v2.23: the SHA-256 of each file of the map part (doc.kml, files/…): an edit of the pins is detected too
    for (const f of outside || []) out2[f.name] = await sha256hex(typeof f.data === 'string' ? enc8(f.data) : f.data);
    const ivm = crypto.getRandomValues(new Uint8Array(12));
    const man = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivm, additionalData: enc8('manifest') }, key, enc8(JSON.stringify({ v: 1, files: ivs, outside: out2, at: new Date().toISOString() }))));
    const head = { app: 'G-eSAA', seal: 1, kdf: 'PBKDF2-SHA256', iter: SEAL_ITER, salt, org: S.team.id, orgName: S.team.name, manifest: { iv: b64u.enc(ivm), data: b64u.enc(man) } };
    return [{ name: `${pre}seal.json`, data: JSON.stringify(head) }, ...out];
  }
  /** A sealed KMZ opened: a reader like zipReader's, where pre/points.json, pre/photos/… are the decrypted files. Every locked
      file is checked before anything is read from it, so a changed file is refused before any record is saved. */
  async function unsealZip(z, pre) {
    let head = null; try { head = JSON.parse(new TextDecoder().decode(await z.get(`${pre}seal.json`))); } catch (e) { head = null; }
    if (!head || head.seal !== 1 || !head.salt || !head.manifest || !(head.iter >= 100000 && head.iter <= 2000000)) throw new Error('This KMZ’s locked G-eSAA data is damaged: it is not opened.');
    const P = pol(), cands = [...new Set([kmzPassNow(), sheetKmzPass(), P.kmzPass, ...(P.kmzOld || [])].filter(Boolean))];
    // v2.23: shown as an alert: the KMZ was edited by someone outside the app after it was shared
    const changed = (what) => Object.assign(new Error(`${what || 'The defect list (the G-eSAA data) in this KMZ'} was changed after the KMZ was shared, outside G-eSAA: it was edited by unauthorized personnel, or the file was damaged on the way. It is not opened. Ask the sender for the original file.`), { tampered: true });
    busy('Unlocking the data…');
    let key = null, man = null;
    for (const c of cands) { // the password is found by the manifest it opens (nothing in the file tells it apart)
      const k = await kmzKey(c, head.salt);
      try { man = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.dec(head.manifest.iv), additionalData: enc8('manifest') }, k, b64u.dec(head.manifest.data)))); key = k; break; } catch (e) { /* not this one */ }
    }
    if (!key) {
      LOG.warn('seal.nokey', { org: head.orgName || '', mine: (S.team && S.team.name) || '' });
      throw new Error(S.team && head.org === S.team.id ? 'This KMZ is locked with a KMZ password this phone does not have (or its data was changed): update the company list (Settings → Update list, or Sync), then open it again.'
        : `This KMZ is locked by “${head.orgName || 'another organisation'}”. Only phones with that organisation's company list can open it.`);
    }
    const ivs = (man && man.files) || {}, files = new Set(Object.keys(ivs));
    if (!files.has('points.json')) throw changed();
    const extra = z.names.filter((n) => n.startsWith(`${pre}sealed/`) && !files.has(n.slice(pre.length + 7, -4)));
    if (extra.length) throw changed();
    const dec = async (rel) => {
      const ct = await z.get(`${pre}sealed/${rel}.bin`); if (!ct) throw changed();
      try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.dec(ivs[rel]), additionalData: enc8(rel) }, key, ct)); } catch (e) { throw changed(); }
    };
    let n = 0; const plainPts = await dec('points.json');
    for (const rel of files) { busy(`Checking the locked data ${++n} / ${files.size}`, n / files.size); if (rel !== 'points.json') await dec(rel); } // all checked first
    const outside = man.outside; // v2.23: the map part, as shared (older locked files have no list of it)
    if (outside && typeof outside === 'object') {
      const now = z.names.filter((x) => !x.startsWith(pre) && !x.endsWith('/'));
      const mapChanged = () => changed('The map part of this KMZ (doc.kml: the pins, balloons and their photos)');
      if (now.length !== Object.keys(outside).length || now.some((x) => !(x in outside))) throw mapChanged();
      for (const [nm, h] of Object.entries(outside)) { const b = await z.get(nm); if (!b || (await sha256hex(b)) !== h) throw mapChanged(); }
    }
    LOG.info('seal.open', { files: files.size });
    const get = async (nm) => {
      if (!nm.startsWith(pre)) return z.get(nm);
      const rel = nm.slice(pre.length);
      if (!files.has(rel)) return null;
      return rel === 'points.json' ? plainPts : dec(rel);
    };
    return { names: [...z.names.filter((x) => !x.startsWith(pre)), ...[...files].map((r) => pre + r)], has: (nm) => (nm.startsWith(pre) ? files.has(nm.slice(pre.length)) : z.has(nm)), get, sealed: true, org: head.orgName || '' };
  }

  /* ---- small dialog ---- */
  function ask(title, text, buttons) {
    const btns = buttons || [{ label: 'Cancel', value: false }, { label: 'OK', value: true, primary: true }];
    $('askTitle').textContent = title; $('askText').textContent = text || '';
    const row = $('askBox').querySelector('.row'); row.innerHTML = '';
    const stack = btns.length > 2; row.classList.toggle('stack', stack); // v2.19: three or more choices are listed one under another, Cancel last
    const list = stack ? btns.filter((b) => b.label !== 'Cancel').concat(btns.filter((b) => b.label === 'Cancel')) : btns;
    return new Promise((res) => {
      list.forEach((b) => {
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
    $('apprShowBtn').hidden = !canShowAppr(); // v2.28
  }
  async function scanTeamQr(sw) {
    const t = await scanQr('Point the camera at the QR code: the company list on the admin’s phone, an invite, or your own “Move to another phone” code');
    if (!t) return;
    await handleInvite(t, sw);
  }
  /** A join link, an invite (company key, maybe with the list) or the list text itself. */
  async function handleInvite(text, sw) {
    const t = String(text || '').trim(), ci = (/[#&?]ci=([A-Za-z0-9_-]+)/.exec(t) || [])[1], ck = ci ? unhideKey(ci) || 'x' : (/[#&?]ck=([A-Za-z0-9%-]+)/.exec(t) || [])[1], hasList = /[#&]join=|^PCT[01]:/.test(t), jq = (/[#&]jq=([A-Za-z0-9_-]+)/.exec(t) || [])[1];
    const mv = (/[#&]mv=([A-Za-z0-9_-]+)/.exec(t) || [])[1];
    const co = (/[#&?]co=([^&#]+)/.exec(t) || [])[1]; // v2.28: the company the invite is for (the user does not choose it)
    if (co) { let c = co; try { c = decodeURIComponent(co); } catch (e) { /* as is */ } S.inviteCo = String(c).replace(/\s+/g, ' ').trim().slice(0, 100); persist(); }
    if (mv) { // moving to this phone (v2.15): the list first, then the user's details for a check and Save
      if (jq && !hasList) await joinShort(jq, sw);
      else if (hasList) { teamSwitch = !!sw || !S.team; try { await importTeamText(t, { quiet: false }); } finally { teamSwitch = false; } }
      return applyMove(mv);
    }
    if (jq && !hasList) { const ok = await joinShort(jq, sw, !!ck); if (!ok || !ck) { if (ok && co && !$('profile').hidden) renderCoSelect(S.inviteCo); return ok; } } // v2.26: a short invite: the list from the sheet, then its key
    else {
      if (!hasList && !ck) { toast('That is not a G-eSAA invite or join link', 4000); return false; }
      if (hasList) { teamSwitch = !!sw || !S.team || !!ck; try { await importTeamText(t, { quiet: !!ck }); } finally { teamSwitch = false; } }
      if (!ck) { if (co && !$('profile').hidden) renderCoSelect(S.inviteCo); return true; }
    }
    let key = ck; try { key = decodeURIComponent(ck); } catch (e) { /* as is */ }
    if (normKey(key).length < 8) { toast('That invite link is damaged. Ask for a new one.', 5000); return false; }
    if (keyMode()) { if (normKey(key) !== normKey(S.companyKey)) toast(`This phone already belongs to ${S.keyCompany}. To join another company: Settings → Reset user.`, 6000); return true; }
    keyIn = normKey(key);
    if ($('profile').hidden) openProfile(!profileOk());
    renderProfileMode();
    toast('Invite received: enter your name, mobile and email, then Save', 4500);
    return true;
  }
  async function pasteJoin(sw) {
    let t = '';
    try { t = (navigator.clipboard && navigator.clipboard.readText) ? await withTimeout(navigator.clipboard.readText(), 1500, 'slow') : ''; } catch (e) { t = ''; }
    if (!/#join=|[#&]c[ki]=|[#&]jq=|[#&]mv=|^PCT[01]:/.test(String(t).trim())) t = await promptText('Paste the link', 'The join or invite link your admin or a coworker sent.', 'https://…#…', '');
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
  $('pfKeyPaste').addEventListener('click', () => pasteJoin(false));
  async function getList(sw) { // v2.15: a list is joined by its link or QR code only (no list files)
    const how = await ask(sw ? 'Switch to another company list' : 'Update the company list',
      sw ? 'Only do this if your admin gave you a new, different list: its join link or QR code.' : 'Paste the join link from your admin, or scan the QR code on an admin’s phone.',
      [{ label: 'Cancel', value: '' }, { label: 'Paste link', value: 'paste' }, { label: 'Scan QR', value: 'scan', primary: true }]);
    if (how === 'scan') scanTeamQr(sw); else if (how === 'paste') pasteJoin(sw);
  }
  $('teamUpdate').addEventListener('click', () => getList(false));
  $('teamSwitch').addEventListener('click', () => getList(true));
  $('teamShare').addEventListener('click', () => guard(async () => { // v2.28: which company the invite is for
    const cos = teamCos();
    const co = cos.length ? await pickFrom('Invite to which company?', 'The invite names the company, so the new user does not choose it. Make one invite per company.', cos.map((c) => [c, c]).concat([['', 'Any company (the user chooses)']])) : '';
    if (co == null) return;
    await showTeamQr(undefined, co);
  }, 'No invite'));
  /** v2.28: one choice from a list (a dropdown in a dialog): the value, or null when cancelled. */
  function pickFrom(title, text, options) {
    $('pickTitle').textContent = title; $('pickText').textContent = text || '';
    const sel = $('pickSel'); sel.innerHTML = ''; options.forEach(([v, l]) => sel.add(new Option(l, v)));
    return new Promise((res) => {
      const done = (v) => { $('pickBox').hidden = true; $('pickYes').onclick = null; $('pickNo').onclick = null; res(v); };
      $('pickYes').onclick = () => done(sel.value); $('pickNo').onclick = () => done(null);
      $('pickBox').hidden = false; sel.focus();
    });
  }

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
    $('qrLinkBtn').hidden = !(qrLink && (text === qrLink || (qrAlt && text === qrAlt.short))); $('qrLinkBtn').textContent = /[#&](c[ki]|co)=/.test(text) ? 'Send the invite link' : 'Send the join link';
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
  async function showTeamQr(note, co) {
    if (!S.team) { toast('No company list on this phone yet'); return; }
    const tail = co ? `&co=${encodeURIComponent(co)}` : ''; // v2.28: the invite names the company
    const text = await packShare('PCT', { b: S.team.b, s: S.team.s, k: S.team.k }), link = joinLink(text) && joinLink(text) + tail, short = (await shortJoin()) && (await shortJoin()) + tail;
    const fullNote = note || `Version ${S.team.rev} · ${teamCos().length} companies. Scan it in G-eSAA (Join your team → Scan QR code) or with the phone's camera, or send the join link.`;
    const shortNote = `Version ${S.team.rev}. Scan it in G-eSAA (Join your team → Scan QR code) or with the phone's camera. The new phone needs internet once to download the list; without internet, show the full code or send the join link.`;
    qrLink = link; qrAlt = short && link ? { short, full: link, shortNote, fullNote } : null;
    await showQr(co ? `Invite to ${co} · ${S.team.name}` : `Join ${S.team.name}`, qrAlt ? shortNote : fullNote, qrAlt ? short : link || text + tail); // no website: the list text, with the company
  }
  $('qrClose').addEventListener('click', () => closeSheet());

  /* ---- v2.28: on-site approval. The inspector's phone shows a QR code signed with the list's admin key (it holds the
     inspector's name, company ID no., mobile and email; valid 10 minutes, renewed every minute). The vendor scans it on the
     completed task; the task keeps who approved, when and where (GPS), and the completion report prints it, so the PDF
     stands without a written signature (the signature lines stay). ---- */
  const APPR_TAG = 'G-eSAA approval:', APPR_MS = 10 * 60 * 1000;
  function taskJob(name) { return taskCat(name) === 'Survey' ? pmeta(name).purpose || 'As-plan' : 'acc'; }
  /** The jobs of an admin user on this list; null when the list sets no jobs (then every admin user approves). */
  function jobsOf(email) { const J = pol().adminJobs; return J ? J[String(email || '').trim().toLowerCase()] || [] : null; }
  function mayApprove(email, job) { const L = jobsOf(email); return L == null || L.includes(job); }
  function canShowAppr() { return !!(S.team && S.adminKey && S.user && isAdmin()); }
  async function apprText() {
    const u = S.user, J = jobsOf(u.email);
    const o = { v: 1, l: S.team.id, n: u.name, i: u.idno || '', m: u.mobile, e: u.email, c: u.company, ...(J ? { j: J } : {}), t: Date.now() };
    const body = JSON.stringify(o);
    return `${APPR_TAG}${b64u.enc(enc8(body))}.${await signText(body)}`;
  }
  let apprTimer = 0;
  async function showApprQr() {
    if (!canShowAppr()) { toast('Only an admin user of the company list (with the admin PIN) shows an approval QR code.', 5000); return; }
    if (!cryptoOk()) return;
    if (!S.user.idno) { toast('Enter your company ID no. in Your details first: it is printed on the approved report.', 5000); openProfile(false); setTimeout(() => $('pfIdNo').focus(), 300); return; }
    const J = jobsOf(S.user.email);
    if (J && !J.length) { toast('Your admin user has no job on this list, so you approve nothing. Ask your admin to set it in the Admin users tab.', 6000); return; }
    const draw = async () => {
      const text = await apprText(), until = new Date(Date.now() + APPR_MS);
      const jobs = J ? J.map((k) => JOB_NAME[k]).join(', ') : 'any completed task';
      const note = `${S.user.name} · ID ${S.user.idno} · ${S.user.mobile}. The vendor opens the completed task and taps “Scan the inspector’s approval QR”. Approves: ${jobs}. Valid until ${until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}; it renews every minute while open.`;
      if ($('qrShow').hidden) { qrLink = ''; qrAlt = null; await showQr('On-site approval', note, text); }
      else { lastQrText = text; drawQr(text); $('qrText').textContent = note; }
    };
    clearInterval(apprTimer);
    await draw(); LOG.info('approval.show', { jobs: J ? J.length : 'all' });
    apprTimer = setInterval(() => { if ($('qrShow').hidden || !lastQrText.startsWith(APPR_TAG)) { clearInterval(apprTimer); apprTimer = 0; return; } draw().catch(() => {}); }, 60000);
  }
  $('apprShowBtn').addEventListener('click', () => guard(showApprQr, 'No approval QR'));
  /** A fresh GPS fix (the last one if under a minute old, else waits up to 8 s). */
  async function freshFix() {
    if (fix && Date.now() - fix.t < 60000) return fix;
    if (!('geolocation' in navigator)) return null;
    return new Promise((res) => navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: p.timestamp }), () => res(fix || null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }));
  }
  const apprCode = async (sig) => { const h = b64u.enc(new Uint8Array(await crypto.subtle.digest('SHA-256', enc8(sig)))).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8); return `${h.slice(0, 4)}-${h.slice(4)}`; };
  /** Checks an approval QR code for the open task: signed by the list's admin key, this list, at most 10 minutes old, an
      admin user whose job covers the task. Returns the approver, else throws the reason. */
  async function readApproval(text, name) {
    const m = new RegExp(`^${APPR_TAG}([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)$`).exec(String(text || '').trim());
    if (!m) throw new Error('This is not an approval QR code. The inspector opens Settings → On-site approval QR.');
    let body = '', o = null;
    try { body = new TextDecoder().decode(b64u.dec(m[1])); o = JSON.parse(body); } catch (e) { throw new Error('The approval QR code could not be read. Ask for a fresh one.'); }
    if (!o || o.v !== 1 || typeof o.n !== 'string' || typeof o.e !== 'string' || !Number.isFinite(o.t)) throw new Error('The approval QR code could not be read. Ask for a fresh one.');
    if (!S.team || o.l !== S.team.id) throw new Error('This approval QR code is for another company list.');
    const keys = [S.team.key, S.team.prevKey, ...(S.team.admins || []).map((a) => a.k)].filter(Boolean);
    let ok = false; for (const k of keys) { if (await verifyText(body, m[2], k)) { ok = true; break; } }
    if (!ok) throw new Error('Not signed by the admin company of this list. Update the list (Settings → Update list) and scan again; if it still fails, do not accept it.');
    const age = Date.now() - o.t;
    if (age > APPR_MS) throw new Error(`This approval QR code expired ${Math.round(age / 60000)} minutes ago. Ask the inspector to show it again.`);
    if (age < -2 * 60000) throw new Error('The two phones’ clocks differ by more than 2 minutes. Set both to automatic time, then scan again.');
    const email = o.e.trim().toLowerCase();
    if (!adminUserOk(email)) throw new Error(`${o.n} (${email}) is not an admin user of this company list.`);
    const job = taskJob(name);
    if (!mayApprove(email, job)) throw new Error(`${o.n} is not an approver for this task (${job === 'acc' ? 'PAT, defect cleanup and FAT need a PAT/FAT inspector' : `${PURPOSE_LABEL[job] || job} needs the ${JOB_NAME[job] || job}`}).`);
    if (!String(o.i || '').trim()) throw new Error(`${o.n} has no company ID no. in their details: they enter it, then show the QR code again.`);
    return { n: o.n.slice(0, 80), i: String(o.i).slice(0, 40), m: String(o.m || '').slice(0, 30), e: email.slice(0, 120), c: String(o.c || '').slice(0, 100), job, qrAt: new Date(o.t).toISOString(), code: await apprCode(m[2]) };
  }
  async function recordApproval(a, how) {
    const f = await freshFix(), name = S.project;
    const rec = { ...a, at: new Date().toISOString(), how, by: byLine(), ...(f ? { gps: { lat: +f.lat.toFixed(7), lon: +f.lon.toFixed(7), acc: Math.round(f.acc) } } : {}) };
    S.meta[name] = { ...pmeta(name), approval: rec, ...(pmeta(name).globeRep ? {} : { globeRep: a.n }) }; persist();
    LOG.info('approval.record', { how, job: a.job, gps: !!f });
    renderProjects();
    toast(`Approved on site by ${a.n} (ID ${a.i}). The completion report prints it.${f ? '' : ' No GPS fix: the place is not recorded.'}`, 5000);
  }
  $('apprScan').addEventListener('click', () => guard(async () => {
    if (!pmeta().completedAt) { toast('Complete the task first: the approval is for a completed task.', 4000); return; }
    if (!cryptoOk()) return;
    const name = S.project, t = await scanQr('Point the camera at the approval QR code on the inspector’s phone');
    if (!t) return;
    await recordApproval(await readApproval(t, name), 'qr');
  }, 'Not approved'));
  $('apprSelf').addEventListener('click', () => guard(async () => { // the inspector approves on their own phone
    if (!canShowAppr() || !pmeta().completedAt || !cryptoOk()) return;
    if (!S.user.idno) { toast('Enter your company ID no. in Your details first: it is printed on the approved report.', 5000); openProfile(false); return; }
    const name = S.project, a = await readApproval(await apprText(), name);
    if (!(await ask('Approve this task?', `${a.n} · ID ${a.i} · ${a.m}\n${a.c}\nRecorded with the time and the GPS position, and printed on the completion report.`, [{ label: 'Cancel', value: false }, { label: 'Approve', value: true, primary: true }]))) return;
    await recordApproval(a, 'self');
  }, 'Not approved'));
  /** v2.28: the lines of an on-site approval, as printed on the completion report. */
  function apprLines(a) {
    const jobN = a.job === 'acc' ? JOB_NAME.acc : JOB_NAME[a.job] || a.job;
    return [`${a.n} \u00b7 ${jobN}${a.c ? ` \u00b7 ${a.c}` : ''}`, `Company ID no. ${a.i} \u00b7 mobile ${a.m || '\u2014'} \u00b7 ${a.e}`,
      `Scanned ${shortTime(a.at)}${a.gps ? ` at ${a.gps.lat.toFixed(6)}, ${a.gps.lon.toFixed(6)} (\u00b1${a.gps.acc} m)` : ' (no GPS fix)'} \u00b7 QR code made ${shortTime(a.qrAt)}`,
      `${a.how === 'self' ? 'Approved on the inspector\u2019s own phone' : 'QR code signed with the admin key of the company list and checked on this phone'} \u00b7 verification ${a.code}`];
  }
  function renderAppr(m) {
    const on = !!(S.project && m.completedAt && S.team && S.team.key);
    $('apprBox').hidden = !on; if (!on) return;
    const a = m.approval;
    $('apprInfo').hidden = !a;
    if (a) $('apprInfo').textContent = `✓ Approved on site by ${a.n} · ID ${a.i} · ${a.m} · ${fmtTime(a.at)}${a.gps ? ` · GPS ±${a.gps.acc} m` : ' · no GPS'}`;
    $('apprScan').textContent = a ? 'Scan again (replaces the approval)' : 'Scan the inspector’s approval QR';
    const self = canShowAppr() && mayApprove(S.user.email, taskJob(S.project)) && !a; $('apprSelf').hidden = !self;
    $('apprHint').textContent = a ? '' : 'The inspector shows the approval QR code (Settings → On-site approval QR); it records their name, company ID no. and contact, with the time and place. A signature on the printed report is still possible.';
  }
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
  function cleanCloud(j, opts) {
    const companies = [...new Set((Array.isArray(j.companies) ? j.companies : []).map((c) => s100(c)).filter(Boolean))].slice(0, 500);
    let tasks = (Array.isArray(j.tasks) ? j.tasks : []).filter((t) => t && typeof t === 'object').map((t) => {
      const raw = s100(t.category).toLowerCase(), cat = !raw ? '' : /clean|rectif/.test(raw) ? 'Cleanup' : TASK_CATS.find((c) => c.toLowerCase() === raw) || 'Survey'; // blank: a site, the user picks the category
      const link = s100(t.link, 300), extra = (Array.isArray(t.extra) ? t.extra : []).filter((x) => Array.isArray(x) && x[1]).slice(0, 8).map((x) => [s100(x[0], 40), s100(x[1])]);
      return { id: s100(t.id, 40), project: s100(t.project), category: cat, site: s100(t.site), contractor: s100(t.contractor), globeRep: s100(t.globeRep),
        company: s100(t.company, 200), status: s100(t.status, 40) || 'Active', notes: s100(t.notes, 300), link: /^https:\/\//.test(link) ? link : '', extra,
        region: s100(t.region, 60), territory: s100(t.territory, 60),
        dates: t.dates && typeof t.dates === 'object' ? { surveyStart: s100(t.dates.surveyStart, 20), surveyDone: s100(t.dates.surveyDone, 20), pat: s100(t.dates.pat, 20), fat: s100(t.dates.fat, 20) } : null };
    }).filter((t) => t.id && t.project);
    if (opts && opts.area) { const mine = tasks.filter((t) => areaOk(t)); tasks = mine.concat(tasks.filter((t) => !areaOk(t))); } // v2.25: the user's regions first, then the cap
    const packs = (Array.isArray(j.packs) ? j.packs : []).filter((p) => p && typeof p === 'object').map((p) => ({ name: s100(p.name), link: s100(p.link, 300), sizeMB: +p.sizeMB || 0, notes: s100(p.notes, 200) }))
      .filter((p) => p.link).slice(0, 50);
    const admins = (Array.isArray(j.admins) ? j.admins : []).map((c) => s100(c)).filter(Boolean).slice(0, 20);
    const adminUsers = Array.isArray(j.adminUsers) ? j.adminUsers.filter((u) => u && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(u.e || ''))).slice(0, 100)
      .map((u) => ({ e: s100(u.e, 120).toLowerCase(), n: s100(u.n, 80), i: s100(u.i, 40), m: s100(u.m, 30), j: s100(u.j, 120) })) : null; // v2.28: admin phones only
    return { name: s100(j.name), companies, admins, tasks: tasks.slice(0, 500), packs, scope: j.scope === 'company' ? 'company' : j.scope === 'all' ? 'all' : '', strict: !!j.strict, you: s100(j.you),
      ...(j.kmzPass ? { kmzPass: s100(j.kmzPass, 100) } : {}), ...(adminUsers ? { adminUsers } : {}), ...(/^[A-Za-z0-9_-]{20,80}$/.test(String(j.dxfSeed || '')) ? { dxfSeed: String(j.dxfSeed) } : {}) }; // v2.32: the plan template's id
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
      u.searchParams.set('area', '1'); // v2.27: with no region or territory ticked, the sheet (v2.27 script) sends no site
      u.searchParams.set('logoat', (S.logoInfo && S.logoInfo.at) || ''); // v2.34: the company logo comes only when it changed
      if (myRegions().length) u.searchParams.set('region', myRegions().join(',')); // v2.25: the sheet (v2.25 script) sends only these regions
      if (myTerrs().length) u.searchParams.set('terr', myTerrs().join(','));
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
        if (!j || !j.ok) throw new Error(j && j.error === 'key' ? 'the sheet refused the read key' : j && j.error === 'company key' ? (keyMode() ? 'your company key no longer works: ask your admin for a new invite (Settings → Reset user, then open the invite)' : 'join with your company invite (QR code or link from your admin or a coworker)') : `unexpected answer${j && j.error ? ` (${j.error})` : ''}`);
        S.cloud = { src: src.url, at: new Date().toISOString(), ...cleanCloud(j, { area: true }) }; cloudErr = ''; persist();
        try { // v2.34: the company's logo from the sheet (newer than the one on this phone)
          const lg = j.logo, co = (S.user && S.user.company) || '';
          if (lg && co && typeof lg.data === 'string' && lg.data.length <= 60000 && /^image\/(png|jpeg)$/.test(lg.type || '') && /^[A-Za-z0-9+/=]+$/.test(lg.data) && String(lg.at || '') > String((S.logoInfo && S.logoInfo.at) || '')) {
            const im = await loadImage(new Blob([b64ToBytes(lg.data)], { type: lg.type })), { w, h } = dims(im); if (im.close) im.close();
            await logoStore({ co, at: String(lg.at).slice(0, 40), type: lg.type, data: lg.data, px: w, py: h });
          }
        } catch (e) { LOG.warn('logo.sync', errInfo(e)); }
        await noteSheetList(src.url, j.list);
        const moved = typeof j.list === 'string' && j.list.length <= 120000 ? await applySheetList(j.list) : false;
        afterTeamChange(); if (!$('newProj').hidden) renderSites();
        if (moved === 'moved') setTimeout(() => cloudSync(true), 0); // the new list version points to another sheet
        if ((S.syncQ || []).length && (force || syncMode() === 'change')) flushProgress(true);
        try { seedInBackground(); } catch (e) { /* not ready */ } // v2.32: a new plan template from the admin comes by itself
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
    $('companyKeyBox').hidden = keyMode() || !/company key/.test(cloudErr); // only where the sheet asks for it
  }
  // v2.24: the sheet asks for a company key: the user joins with an invite (QR code or link); the profile's Save signs in with it
  $('companyKeyScan').addEventListener('click', () => scanTeamQr(false));
  $('companyKeyPaste').addEventListener('click', () => pasteJoin(false));
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
  function visibleTasks(anyArea) {
    const me = S.user && S.user.company, c = S.cloud || {};
    const open = (c.tasks || []).filter((t) => !/^(closed|done|cancel)/i.test(t.status) && (anyArea || areaOk(t))); // v2.25: and the user's regions / territories
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
  const siteLabel = (t) => joinParts([t.territory || extraOf(t, 'Territory'), extraOf(t, 'Project Name'), extraOf(t, 'Serial Number'), t.site, t.project]).slice(0, 140) || t.id;
  /** Location / site on the forms: Serial Number_PLA ID_Site name. */
  const siteLoc = (t) => joinParts([extraOf(t, 'Serial Number'), t.site, t.project]).slice(0, 120);
  /** Project name: Task category_Project Name_Serial Number_PLA ID_Site name, e.g. PAT_KV_TRS-PSOW26-KV-0011_MIN2463_TCFGACGRANDAVAODDS. */
  const autoName = (t, cat) => joinParts([CAT_CODE[cat] || '', extraOf(t, 'Project Name'), extraOf(t, 'Serial Number'), t.site, t.project]).slice(0, 100);
  const siteDetail = (t) => [vendorsOf(t).length && `Vendor: ${vendorsOf(t).join(', ')}`, ...(t.extra || []).slice(0, 2).map(([k, v]) => `${k}: ${v}`), t.id && `ID: ${t.id}`].filter(Boolean).join(' · ');
  /** What a project made from a sheet row keeps (shown in Projects, printed on the forms). */
  const siteMeta = (t) => (t ? { taskId: t.id, siteLink: t.link || '', siteExtra: t.extra || [], ...(t.globeRep ? { globeRep: t.globeRep } : {}),
    siteName: t.project || '', plaId: t.site || '', serial: extraOf(t, 'Serial Number') || '' } : {}); // v2.34: for the plan drawing's title blocks
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
    $('npSiteLbl').textContent = npSite ? siteLabel(npSite) : rows.length ? 'Choose a site…' : src && !areaSet() ? 'No site for you: tick your Region and Territory (Settings \u2192 your name), or type a name below' : 'No site listed for you: type a name below'; // v2.27
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
    const area = [...myRegions(), ...myTerrs()].join(', '), hid = area ? visibleTasks(true).length - rows.length : 0; // v2.25
    info.textContent = (!read ? (cloudErr ? `Sheet not read (${cloudErr})` : navigator.onLine ? 'Reading the online sheet…' : 'Offline: type a name below') : !areaSet() ? 'No site for you: tick your Region and Territory (Settings \u2192 your name), or type a name below' : !rows.length ? 'No site listed for you: type a name below' : q && !list.length ? 'No match' : `${list.length < rows.length ? `${list.length} of ` : ''}${rows.length} from the online sheet`)
      + (area ? ` · your area: ${area}${hid > 0 ? ` (${hid} other${hid === 1 ? '' : 's'} hidden)` : ''}` : '');
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
      if (!(await importStageFile(f, k, sm, name || undefined))) return; // not opened (an unlocked file, cancelled)
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

  /* ---- v2.19: opening a shared file: Projects → Open a shared file, Android "Open with G-eSAA" / Share to G-eSAA, or Share to the
     installed web app. What the file is decides what happens: a PAT starts the defect cleanup (or the FAT), a cleanup the FAT; any
     of them, a FAT or a backup can also be opened as it is (restored into its project). */
  let sharedWaiting = null;
  /** v2.21: a file shared while a record, the camera or a save is open waits until the record is saved or closed (closing them
      to open the file would lose the work). */
  const sharedBlocked = () => editorSaving || !!ed || ['editor', 'camera', 'boxer'].some((x) => stack.includes(x));
  function sharedDefer(f) {
    if (!sharedBlocked()) return false;
    sharedWaiting = f; LOG.info('shared.wait');
    toast('Save or close this record first: the shared file opens after', 6000);
    return true;
  }
  function sharedResume() {
    if (!sharedWaiting || !profileOk() || sharedBlocked()) return;
    const f = sharedWaiting; sharedWaiting = null; openSharedFile(f);
  }
  $('openShared').addEventListener('click', () => { $('sharedInput').value = ''; $('sharedInput').click(); });
  /* v2.26: the sample project (sample/G-eSAA_sample.zip, a short survey with no personal data): added once on a new phone,
     so a first user can try the screens, exports and the tutorial; it can be deleted any time and added again from Projects. */
  async function addSample(open) {
    try {
      const r = await fetch('sample/G-eSAA_sample.zip', { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const z = await zipReader(await r.blob());
      const b = JSON.parse(new TextDecoder().decode(await z.get('bundle.json')));
      const keep = S.project; let name = '';
      for (const p of b.projects || []) {
        const raw = await z.get(p.file); if (!raw) continue;
        const meta = JSON.parse(new TextDecoder().decode(raw)); meta.meta = { ...(meta.meta || {}), sample: true };
        name = await restoreMeta(z, meta, '', { quiet: true }) || name;
      }
      busy(false);
      S.project = open && name ? name : keep; persist();
      renderPoles(); if (open) fitProject();
      if (!$('projects').hidden) renderProjects();
      LOG.info('sample.added', { project: name, open: !!open });
      return name;
    } catch (e) { busy(false); LOG.warn('sample.fail', errInfo(e)); return ''; }
  }
  $('addSampleBtn').addEventListener('click', () => guard(async () => {
    const n = await addSample(true);
    toast(n ? `Sample project added: “${n}” (try the Tutorial on it; delete it any time)` : 'The sample project could not be loaded: open G-eSAA with internet once.', 5000);
  }, 'Sample not added'));
  $('sharedInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openSharedFile(f); }); // cleared: the same file can be chosen again
  function openSharedFile(f) { return guard(() => openShared(f), 'File not opened'); }
  async function openShared(f) {
    if (!f) return;
    if (!profileOk()) { sharedWaiting = f; if ($('profile').hidden) openProfile(true); toast('Enter your details first: the file opens after Save', 5000); return; }
    if (sharedDefer(f)) return;
    LOG.info('shared.open', { name: f.name || '', mb: +((f.size || 0) / 1048576).toFixed(1) });
    busy('Reading file…');
    let meta, z;
    let rp = null;
    try { z = await zipReader(f); if (!z.has('bundle.json')) { rp = await readPackage(z); meta = rp.meta; } } finally { busy(false); }
    if (!meta) { await openBundle(z, f); return; }
    if (!(await unsealedOk(f, rp))) return; // v2.21: several projects from a colleague
    const fm = meta.meta || {}, kind = fm.mode === 'acceptance' ? fm.stage || 'PAT' : 'survey', n = meta.points.length;
    const what = `“${meta.project || f.name}”: ${kind === 'survey' ? 'a survey' : `a ${STAGE_NAME[kind]}`} with ${n} record${n === 1 ? '' : 's'}${fm.site && fm.site !== meta.project ? ` · ${fm.site}` : ''}.`;
    const nodef = kind === 'PAT' && !!fm.noDefects; // v2.23: a PAT with no defects is also the FAT: nothing to start from it
    // v2.23: the FAT starts only from a COMPLETED defect cleanup (the contractor's fixes), never straight from the PAT
    const clDone = kind === 'Cleanup' && !!fm.completedAt;
    const btns = nodef ? [{ label: 'Open the PAT', value: 'open', primary: true }]
      : kind === 'PAT' ? [{ label: 'Start the defect cleanup', value: 'Cleanup', primary: true }, { label: 'Open the PAT itself', value: 'open' }]
      : kind === 'Cleanup' ? (clDone ? [{ label: 'Start the FAT', value: 'FAT', primary: true }, { label: 'Open the cleanup itself', value: 'open' }] : [{ label: 'Open the cleanup itself', value: 'open', primary: true }])
        : [{ label: kind === 'FAT' ? 'Open the FAT' : 'Open the survey', value: 'open', primary: true }];
    const pick = await ask('Open the shared file', `${what}\n\n${nodef ? 'No deficiencies were found: the PAT and the FAT are done, so there is no defect cleanup or FAT to start. It opens as it is.' : kind === 'PAT' ? 'Start the defect cleanup: the PAT\'s items open on the map, with the site and vendor of the file. Or open the PAT itself to view it.'
      : kind === 'Cleanup' ? (clDone ? `The defect cleanup was completed${fm.completedAt ? ` on ${longDate(fm.completedAt)}` : ''}. Start the FAT: each fix opens on the map to be checked on site. Or open the cleanup itself to view it.` : 'The defect cleanup is not completed yet, so the FAT cannot start from it: the contractor marks the cleanup complete and shares it again. You can open it to view it.')
        : 'It opens in its own project on this phone; records already on this phone from the same file are updated.'}`, [{ label: 'Cancel', value: '' }, ...btns]);
    if (!pick || sharedDefer(f)) return;
    if (pick === 'open') {
      await restoreZip(f);
      await closeAll(); fitProject();
      return;
    }
    // v2.23: the defect cleanup / FAT starts at once with the file's project data (site, vendor, form details, who recorded
    // the PAT) and the map opens on its items; no New project form
    const fromName = fm.fromPat || meta.project;
    const have = allProjects().find((x) => { const mx = pmeta(x); return mx.mode === 'acceptance' && mx.stage === pick && mx.fromPat === fromName && (pick === 'Cleanup' || mx.fromStage === kind); });
    if (have) {
      const c = await ask(`${pick === 'FAT' ? 'FAT' : 'Defect cleanup'} already on this phone`, `“${have}” was started from this ${STAGE_NAME[kind]} before. Open it, or start a new one?`,
        [{ label: 'Cancel', value: '' }, { label: 'Open it', value: 'have', primary: true }, { label: 'Start a new one', value: 'new' }]);
      if (!c) return;
      if (c === 'have') { if (!$('newProj').hidden || !$('projects').hidden) await closeAll(); S.project = have; persist(); renderPoles(); fitProject(); toast(`Now working on: ${have}`); return; }
    }
    const name = await importStageFile(f, pick);
    if (!name) return;
    await closeAll(); fitProject();
    setTimeout(() => { const t = nextTarget(); if (t && !stack.length) openVisit(t.r.id, true); }, 700); // the first item to fix / check
  }
  /* the installed web app: a file shared to it (Android share sheet) waits in the offline cache; a file opened with it (computer) */
  async function sharedFromCache() {
    if (!/[?&]shared=1/.test(location.search) || !('caches' in window)) return;
    history.replaceState(null, '', location.pathname + location.hash);
    try {
      const c = await caches.open('polecam-share'), r = await c.match('shared-file'); if (!r) { toast('The shared file did not arrive. Open it from Projects → Open a shared file.', 6000); return; }
      await c.delete('shared-file');
      const b = await r.blob(), nm = decodeURIComponent(r.headers.get('x-name') || 'shared.kmz');
      openSharedFile(new File([b], nm, { type: b.type || '' }));
    } catch (e) { LOG.warn('shared.cache.fail', errInfo(e)); }
  }
  /* the Android app: "Open with G-eSAA" or Share → G-eSAA (the app copies the file and hands over where it is) */
  async function sharedFromNative(e) {
    if (!e) return;
    if (!e.uri) { if (e.error) toast(`Could not open the shared file (${e.error}). Open it from Projects → Open a shared file.`, 6000); return; }
    try {
      const r = await fetch(window.Capacitor.convertFileSrc(e.uri)); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = await r.blob();
      openSharedFile(new File([b], e.name || 'shared.kmz', { type: e.mime || b.type || '' }));
    } catch (err) { LOG.warn('shared.native.fail', errInfo(err)); toast(`Could not open the shared file (${err.message || err}). Open it from Projects → Open a shared file.`, 6000); }
  }
  /* v2.26: a G-eSAA link (invite, join, move) opened in an Android browser: offer to open it in the G-eSAA app (the APK keeps
     its own details and projects, apart from the browser). The app gets it as gesaa://open?h=… (Android intent). */
  const linkHashNow = () => [pendingJoin ? `#join=${pendingJoin}` : '', pendingKey ? `&${pendingKey}` : '', pendingJq ? `&jq=${pendingJq}` : '', pendingMv ? `&mv=${pendingMv}` : '', pendingCo ? `&co=${pendingCo}` : ''].join('');
  async function linkToApp() {
    if (NATIVE || !/Android/i.test(navigator.userAgent || '') || /[?&]web=1/.test(location.search) || S.linkWeb) return false;
    if (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) return false; // the installed web app
    const h = linkHashNow(); if (!h) return false;
    const pick = await ask('Open in the G-eSAA app?', 'This is a G-eSAA link. If the G-eSAA app is installed on this phone, open it there: your details, company and projects are kept in the app. Otherwise continue here in the browser.',
      [{ label: 'Continue in this browser', value: 'web' }, { label: 'Open in the G-eSAA app', value: 'app', primary: true }]);
    if (pick !== 'app') { S.linkWeb = true; persist(); return false; }
    const back = `${location.origin}${location.pathname}?web=1${h.startsWith('#') ? h : `#${h.slice(1)}`}`;
    LOG.info('link.toApp', { kind: pendingKey ? 'invite' : pendingMv ? 'move' : 'join' });
    location.href = `intent://open?h=${encodeURIComponent(h)}#Intent;scheme=gesaa;package=com.marktamse.polecam;S.browser_fallback_url=${encodeURIComponent(back)};end`;
    return true;
  }
  /** The APK opened by a G-eSAA link (gesaa://open?h=…): the invite, join or move code inside it. */
  function linkFromNative(e) {
    let h = '';
    try { const u = String((e && e.url) || ''); h = decodeURIComponent((/[?&]h=([^&#]*)/.exec(u) || [])[1] || ''); } catch (err) { h = ''; }
    LOG.info('link.native', { ok: !!h });
    if (h && /[#&](join|ck|ci|jq|mv)=/.test(h)) loadOrg().then(() => handleInvite(h, true)); else if (e && e.url) toast('That link could not be read: paste it in Settings → Scan invite QR / Paste invite link.', 6000);
  }
  function sharedListen() {
    sharedFromCache();
    if ('launchQueue' in window && window.launchQueue && typeof window.launchQueue.setConsumer === 'function') {
      window.launchQueue.setConsumer(async (p) => { if (p && p.files && p.files.length) { try { openSharedFile(await p.files[0].getFile()); } catch (e) { /* not readable */ } } });
    }
    if (NATIVE && window.Capacitor.isPluginAvailable && window.Capacitor.isPluginAvailable('SharedFile')) {
      const pl = nativePlugin('SharedFile');
      if (pl.proxy) Promise.resolve(pl.proxy.addListener('sharedFile', sharedFromNative)).catch((e) => LOG.warn('shared.listen.fail', errInfo(e)));
      if (pl.proxy) Promise.resolve(pl.proxy.addListener('sharedLink', linkFromNative)).catch((e) => LOG.warn('link.listen.fail', errInfo(e))); // v2.26
    }
  }

  /* ---- a PAT from another phone, for its FAT ---- */
  /** The handover file: the acceptance KMZ with the PoleCam data inside (PAT → defect cleanup → FAT). */
  async function sharePackage() {
    if (!needPoints()) return;
    if (taskCat() === 'Cleanup' && !pmeta().completedAt && !(await ask('Cleanup not completed', 'The FAT starts only from a completed defect cleanup. Mark the cleanup complete first (Projects → Mark task complete), then share it. Share it anyway, to view only?',
      [{ label: 'Cancel', value: false, primary: true }, { label: 'Share anyway', value: true }]))) return; // v2.23
    if (!(await shareGate('share'))) return;
    const M = accModel(), blob = await buildAccKmz(M, true); busy(false);
    noteExport('sent');
    await shareFile(blob, `${accFileBase(M)}_share.kmz`, 'application/vnd.google-earth.kmz');
  }
  $('sendPat').addEventListener('click', () => guard(sharePackage));
  $('xShare').addEventListener('click', () => guard(sharePackage));
  /** Save or send a file: the APK's share sheet, the browser's share sheet, or a download. v2.30: the browser's share sheet
      opens from a fresh tap (iPhone and Chrome refuse it after a long wait), and a browser that cannot share the kind of file
      says so instead of failing quietly. */
  async function shareFile(blob, name, type) {
    if (NATIVE) {
      const t0 = Date.now(); LOG.step('file.share', { mb: +(blob.size / 1048576).toFixed(2), kind: (name.split('.').pop() || '').toLowerCase() });
      try { const r = await nativePrivate({ blob, name }); await nativeCall('Share', 'share', { title: name, dialogTitle: `Send ${name}`, files: [r.cacheUri] }); LOG.done('file.share'); return; }
      catch (e) { LOG.done('file.share'); if (/cancel/i.test(String(e && e.message))) return; LOG.error('file.share.fail', { ms: Date.now() - t0, ...errInfo(e) }); }
      try { const r = await nativeSave({ blob, name }); toast(`Sharing did not open on this phone; the file is saved to ${r.where} instead. Send it from the Files app.`, 7000); }
      catch (e) { toast(`Could not share or save the file: ${e.message || e}`, 6000); }
      return;
    }
    const file = new File([blob], name, { type: type || blob.type || 'application/octet-stream' });
    const can = !!(navigator.share && navigator.canShare && (() => { try { return navigator.canShare({ files: [file] }); } catch (e) { return false; } })());
    sendSheet(file, can);
  }
  /** The send panel of the website version: Share (the phone's share sheet: WhatsApp, AirDrop, Quick Share, Save to Files…),
      Save to phone, Close. Share is called straight from the tap. */
  function sendSheet(file, can) {
    $('sendName').textContent = `${file.name} · ${fmtMB(file.size)}`;
    const ext = (file.name.split('.').pop() || '').toUpperCase();
    $('sendNote').textContent = can ? 'Share opens the phone’s own share sheet: a chat app, AirDrop (iPhone) or Quick Share (Android) to a phone nearby, email, or Save to Files.'
      : `This browser cannot hand a .${ext.toLowerCase()} file to other apps (Chrome on Android shares only pictures, PDF and text from a website). Save it to the phone, then send it from the Files or Downloads app; or use the G-eSAA Android app, which shares any file.`;
    $('sendGo').hidden = !can;
    const close = () => { $('sendBox').hidden = true; $('sendGo').onclick = $('sendSave').onclick = $('sendNo').onclick = null; };
    $('sendGo').onclick = () => {
      navigator.share({ files: [file], title: file.name }).then(close).catch((e) => {
        if (e && e.name === 'AbortError') return; // the user closed the share sheet: the panel stays for another try
        LOG.warn('web.share.fail', { name: e && e.name, msg: String(e && e.message).slice(0, 120) });
        $('sendNote').textContent = `The share sheet refused this file (${(e && (e.name || e.message)) || 'unknown reason'}). Use Save to phone, then send it from the Files app.`; $('sendGo').hidden = true;
      });
    };
    $('sendSave').onclick = () => { saveBlob(file, file.name); close(); };
    $('sendNo').onclick = close;
    $('sendBox').hidden = false;
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
    toast('Saved to Downloads');
  }

  /* ---- v2.23: admin: the companies come only from the online Google Sheet (its Company List / Companies tab) ---- */
  async function admReadCompanies(quiet) {
    const url = $('admUrl').value.trim(), key = $('admReadKey').value.trim(), akey = $('admWriteKey').value.trim(), out = $('admCoInfo');
    if (!/^https:\/\/\S+$/.test(url) || !key) { out.textContent = 'Set the online sheet first (web app URL and read key, below), then tap Refresh from the sheet.'; return false; }
    out.textContent = 'Reading the companies from the sheet…';
    try {
      const u = new URL(url); u.searchParams.set('key', key); u.searchParams.set('v', APP_VER); u.searchParams.set('company', ''); if (akey) u.searchParams.set('akey', akey);
      const r = await withTimeout(fetch(u.href, { cache: 'no-store', redirect: 'follow' }), 25000, 'The online sheet did not answer');
      const j = await r.json();
      if (!j || !j.ok) { out.textContent = `The sheet refused: ${j && j.error === 'key' ? 'wrong read key' : (j && j.error) || 'unknown reason'}.`; return false; }
      const c = cleanCloud(j), names = c.companies;
      if (!names.length) { out.textContent = j.strict && !akey ? 'The sheet uses company keys: enter its Admin key (below) to read all the companies, then Refresh.' : 'The sheet has no companies: add them to its Company List / Companies tab, then Refresh.'; return false; }
      const kept = names.slice(0, 300);
      admDraft.co = kept; admDraft.coRead = new Date().toISOString();
      if (c.adminUsers) admDraft.sheetUsers = c.adminUsers; if (c.kmzPass) admDraft.sheetKmz = c.kmzPass; renderAdmSheet(); // v2.28
      { const own0 = kept.find((x) => normCo(x) === normCo(admDraft.pol.owner)); // the admin company as the sheet writes it, else the sheet's ADMIN company
        if (own0) admDraft.pol.owner = own0; else if (c.admins && c.admins.length) { const a0 = kept.find((x) => normCo(x) === normCo(c.admins[0])); if (a0) admDraft.pol.owner = a0; } }
      renderAdmDraft();
      out.textContent = `${names.length} compan${names.length === 1 ? 'y' : 'ies'} read from the sheet${c.name ? ` “${c.name}”` : ''} ${fmtTime(admDraft.coRead)}.${names.length > 300 ? ' The list keeps the first 300 for phones that are offline; phones that read the sheet see them all.' : ''} Tap Save and share the list.`;
      LOG.info('admin.companies', { n: names.length });
      return true;
    } catch (e) { out.textContent = `Could not reach the sheet: ${e.message}. ${admDraft.co.length ? 'The companies of the saved list are kept.' : ''}`; return false; }
  }
  $('admCoRefresh').addEventListener('click', () => guard(() => admReadCompanies(false), 'Companies not read'));
  /** v2.28: the admin users read from the sheet's Admin users tab (with their jobs), shown instead of the email lines; and the
      sheet's KMZ password, shown instead of the field. */
  function renderAdmSheet() {
    const U = admDraft && admDraft.sheetUsers, on = Array.isArray(U) && U.length > 0;
    $('admUsersSheet').hidden = !on; $('admUsersBox').hidden = on;
    if (on) {
      const box = $('admUsersList'); box.innerHTML = '';
      U.forEach((u) => { const d = document.createElement('div'), b = document.createElement('b'), sp = document.createElement('span'); b.textContent = u.n || u.e;
        const jobs = jobKeys(u.j).map((k) => JOB_NAME[k]); sp.textContent = [u.e, u.i && `ID ${u.i}`, u.m, jobs.length ? jobs.join(', ') : 'no job set'].filter(Boolean).join(' · '); d.append(b, sp); box.appendChild(d); });
      $('admUsersInfo').textContent = `${U.length} admin user${U.length === 1 ? '' : 's'} from the sheet. Change them in its Admin users tab, then Refresh from the sheet and Save. The job decides who approves which completed task on site; once any user has a job, a user with no job approves nothing.`;
    }
    const kp = admDraft && admDraft.sheetKmz;
    $('admKmzPass').readOnly = !!kp;
    if (kp) { $('admKmzPass').value = kp; $('admKmzInfo').textContent = 'From the online sheet (Settings → KMZ password): change it there, then Refresh from the sheet and Save. Every phone locks shared KMZ files with it from that list version; files locked before still open.'; }
  }
  /* ---- v2.28: the Administration sections fold (tap the heading); List name and Companies stay open at first ---- */
  const admGroups = [...document.querySelectorAll('#admMain > .group')].filter((g) => g.querySelector(':scope > h3'));
  const admKeyOf = (g) => g.querySelector(':scope > h3').textContent.trim();
  function admFoldApply() {
    const F = S.admFold || {};
    admGroups.forEach((g, i) => { const k = admKeyOf(g), open = k in F ? !!F[k] : i < 2; g.classList.toggle('shut', !open); g.querySelector(':scope > h3').setAttribute('aria-expanded', String(open)); });
  }
  const admOpenFor = (id) => { const g = $(id) && $(id).closest('#admMain > .group'); if (g) { g.classList.remove('shut'); g.querySelector(':scope > h3').setAttribute('aria-expanded', 'true'); } };
  admGroups.forEach((g) => {
    const h = g.querySelector(':scope > h3'); h.classList.add('afold'); h.tabIndex = 0; h.setAttribute('role', 'button');
    const tg = () => { S.admFold = { ...(S.admFold || {}), [admKeyOf(g)]: g.classList.contains('shut') }; persist(); admFoldApply(); };
    h.addEventListener('click', tg); h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tg(); } });
  });
  admFoldApply();
  /* ---- v2.23: admin: the logos of the form and the reports, uploaded on this phone; they travel in the list (small JPEGs) ---- */
  function renderLogoPick(P0) {
    const L = ((P0 || (admDraft && admDraft.pol) || {}).logos) || {};
    [['left', 'L'], ['right', 'R']].forEach(([k, c]) => {
      $(`admLogo${c}Img`).src = L[k] ? `data:image/jpeg;base64,${L[k]}` : `brand/logo-${k}.jpg`;
      $(`admLogo${c}Info`).textContent = L[k] ? `Uploaded · ${Math.round((L[k].length * 3) / 4 / 1024)} KB` : 'Built-in (brand/logo-' + k + '.jpg)';
      $(`admLogo${c}Reset`).disabled = !L[k];
    });
  }
  let logoSide = 'left';
  /** An image made into a small JPEG on white (PNG transparency), at most 600 × 200 px and 24,000 base64 characters. */
  async function logoJpeg(file) {
    if (file.size > 25 * 1048576) throw new Error('This image is too large: use a logo file under 25 MB');
    const im = await loadImage(file, 1600), { w, h } = dims(im); // decoded at most 1600 px (memory on phones)
    if (!w || !h) throw new Error('This image could not be read');
    for (const [mw, mh, q] of [[600, 200, 0.9], [480, 160, 0.85], [400, 140, 0.8], [320, 110, 0.75], [240, 80, 0.7]]) {
      const sc = Math.min(1, mw / w, mh / h), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(h * sc));
      const g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
      const b = new Uint8Array(await (await toBlob(cv, q)).arrayBuffer()); cv.width = cv.height = 0;
      let bin = ''; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
      const b64 = btoa(bin);
      if (b64.length <= 24000) { if (im.close) im.close(); return b64; }
    }
    if (im.close) im.close();
    throw new Error('This image is too detailed to keep small: use a simpler logo');
  }
  ['L', 'R'].forEach((c) => {
    $(`admLogo${c}`).addEventListener('click', () => { logoSide = c === 'L' ? 'left' : 'right'; $('admLogoInput').value = ''; $('admLogoInput').click(); });
    $(`admLogo${c}Reset`).addEventListener('click', () => { if (!admDraft) return; const L = { ...(admDraft.pol.logos || {}) }; delete L[c === 'L' ? 'left' : 'right']; admDraft.pol.logos = L; renderLogoPick(); });
  });
  $('admLogoInput').addEventListener('change', (e) => guard(async () => {
    const f = e.target.files[0]; if (!f || !admDraft) return;
    const b64 = await logoJpeg(f);
    admDraft.pol.logos = { ...(admDraft.pol.logos || {}), [logoSide]: b64 }; renderLogoPick();
    toast(`${logoSide === 'left' ? 'Left' : 'Right'} logo set: tap Save and share the list`, 3500);
  }, 'Logo not used'));
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
  const ADM_LISTS = [['admPoleOwners', 'owner'], ['admBoqClamp', 'clamp'], ['admBoqHeight', 'height'], ['admBoqCls', 'cls'], ['admBoqOdf', 'odf'], ['admBoqConn', 'conn'], ['admBoqClo', 'clo'], ['admDetailItems', 'details'], ['admBoqArm', 'arm'], ['admBoqGuy', 'guy']]; // v2.29: arms, guying
  let admSheetPrefill = null;
  async function admStart() {
    const create = admMode === 'create' || !S.team;
    const P = pol(), F = formText();
    const polDraft = { owner: P.owner || '', form: { ...P.form }, defects: JSON.parse(JSON.stringify(P.defects)), maxSpan: P.maxSpan, angleDeg: P.angleDeg, autoGap: P.autoGap, ...(P.mloopLen ? { mloopLen: P.mloopLen } : {}), quality: P.quality, inspTypes: P.inspTypes.slice(), poleTypes: (P.poleTypes || []).slice(), ...(P.poleOwners ? { poleOwners: P.poleOwners.slice() } : {}), ...(P.boqLists ? { boqLists: JSON.parse(JSON.stringify(P.boqLists)) } : {}), ...(P.detailItems ? { detailItems: P.detailItems.slice() } : {}), adminUsers: (P.adminUsers || []).slice(), ...(P.web ? { web: P.web } : {}), ...(P.vendorRecords === false ? { vendorRecords: false } : {}),
      otp: P.otp || b64u.enc(crypto.getRandomValues(new Uint8Array(18))), ...(P.kmzPass ? { kmzPass: P.kmzPass } : {}), ...(P.kmzOld ? { kmzOld: P.kmzOld.slice() } : {}), ...(P.logos ? { logos: { ...P.logos } } : {}) }; // v2.22, v2.23 logos
    admKmzAuto = P.kmzPass ? '' : suggestKmzPass(P.owner || (S.user && S.user.company) || ''); // follows the admin company until edited
    $('admKmzPass').value = P.kmzPass || admKmzAuto;
    renderLogoPick(polDraft); $('admReq').value = ''; $('admReqOut').hidden = true;
    $('admKmzInfo').textContent = P.kmzPass ? 'Shared PAT, cleanup and FAT KMZ files are locked with this password.' : 'Not saved yet: shared KMZ files are locked once the list is saved with a password. Update every phone to v2.22 first: older versions cannot open locked files.';
    $('admPoleTypes').value = typeLines(polDraft.poleTypes);
    { const L0 = pol(); const was = (k) => { const L = L0.boqLists; return L && Array.isArray(L[k]) && L[k].length ? L[k] : k === 'owner' ? [...BOQ_OPT.owner, ...(L0.poleOwners || [])] : BOQ_OPT[k]; }; // v2.28: the lists as they are now
      ADM_LISTS.forEach(([id, k]) => { $(id).value = (k === 'details' ? (Array.isArray(L0.detailItems) && L0.detailItems.length ? L0.detailItems : POLE_DETAIL_ITEMS) : was(k)).join('\n'); }); }
    $('admPacks').value = packLines(P.packs || []); $('admPacksInfo').textContent = ''; $('admAreaSrc').value = P.areaSrc || ''; $('admDxfSeed').value = P.dxfSeed || ''; // v2.29, v2.30
    $('admUsers').value = (P.adminUsers || []).map((e) => `${e}${(P.adminJobs || {})[e] ? ` ${P.adminJobs[e].map((k) => JOB_NAME[k]).join(', ')}` : ''}`).join('\n'); $('admVendorRec').checked = P.vendorRecords !== false; // v2.28: with the job
    renderOrgBox(create);
    admSheetPrefill = { users: S.cloud && S.cloud.adminUsers, kmz: S.cloud && S.cloud.kmzPass };
    if (create) {
      await newAdminKey(); // the new list's key
      admDraft = { id: uid(), name: '', co: [], admins: [], rev: 0, src: null, pol: polDraft, newKey: true };
      if (S.user && S.user.company && !polDraft.owner) polDraft.owner = S.user.company; // v2.23: the companies come from the sheet
    } else admDraft = { id: S.team.id, name: S.team.name, co: S.team.co.slice(), admins: (S.team.admins || []).map((a) => ({ ...a })), rev: S.team.rev, src: S.team.src || null, pol: polDraft, newKey: !hasListKey(S.team) };
    if (admSheetPrefill) { if (Array.isArray(admSheetPrefill.users)) admDraft.sheetUsers = admSheetPrefill.users; if (admSheetPrefill.kmz) admDraft.sheetKmz = admSheetPrefill.kmz; } // v2.28: from the last sheet read
    renderAdmSheet();
    $('admUrl').value = (admDraft.src && admDraft.src.url) || ''; $('admReadKey').value = (admDraft.src && admDraft.src.key) || '';
    $('admWriteKey').value = S.onlineAdminKey || ''; $('admTestOut').textContent = '';
    $('admName').value = admDraft.name; $('admCoInfo').textContent = admDraft.co.length ? `${admDraft.co.length} companies on the saved list. Tap Refresh from the sheet to update them.` : '';
    if ($('admUrl').value.trim() && $('admReadKey').value.trim()) admReadCompanies(true); // the sheet's current companies
    // form wording
    $('pfmCompany').value = F.company; $('pfmAddress').value = F.address || ''; $('pfmDept1').value = F.dept1 || ''; $('pfmDept2').value = F.dept2 || '';
    $('pfmLeftTitle').value = F.leftTitle; $('pfmRightTitle').value = F.rightTitle; $('pfmTypes').value = (F.types || []).join('\n'); $('pfmLegend').value = F.legend || ''; $('pfmDateSub').value = F.colDateSub || '';
    // checklist and standards
    const cats = Object.keys(polDraft.defects);
    $('setDefCat').innerHTML = cats.map((c) => `<option>${C.xmlEsc(c)}</option>`).join('');
    $('setDefItems').value = (polDraft.defects[cats[0]] || []).join('\n');
    $('setMaxSpan').value = polDraft.maxSpan; $('setAngle').value = polDraft.angleDeg; $('setAutoGap').value = polDraft.autoGap; $('setMloopLen').value = polDraft.mloopLen || 15; $('admQuality').value = polDraft.quality === 'normal' ? 'normal' : 'strict';
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
    { // v2.28: from the sheet's Admin users tab, else one line per user: the email, then the job
      const rows = Array.isArray(admDraft.sheetUsers) && admDraft.sheetUsers.length ? admDraft.sheetUsers.map((u) => [u.e, u.j])
        : $('admUsers').value.split(/\n/).map((l) => l.trim()).filter(Boolean).flatMap((l) => { const es = l.split(/[\s,;]+/).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x)); // one email and its job, or several emails
          return es.length === 1 ? [[es[0].toLowerCase(), l.replace(es[0], '').replace(/^[\s,;:–-]+/, '')]] : es.map((x) => [x.toLowerCase(), '']); });
      const seen = new Set(), jobs = {};
      P.adminUsers = rows.map(([e]) => e.slice(0, 120)).filter((e) => !seen.has(e) && seen.add(e)).slice(0, 100);
      rows.forEach(([e, j]) => { const k = jobKeys(j); if (k.length && P.adminUsers.includes(e)) jobs[e] = k; });
      if (Object.keys(jobs).length) P.adminJobs = jobs; else delete P.adminJobs;
    }
    const me = String((S.user && S.user.email) || (!$('profile').hidden && $('pfEmail').value) || '').trim().toLowerCase(); // a new list is made before the profile is saved
    if (P.adminUsers.length && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(me) && !P.adminUsers.includes(me)) P.adminUsers.unshift(me); // the admin who saves stays an admin
    if (!P.adminUsers.length) delete P.adminUsers;
    const web = webBase(); if (web && !NATIVE) P.web = web; // join links from the APK use the website address
    const num = (id, lo, hi, dflt) => { const v = +$(id).value; return v >= lo && v <= hi ? v : dflt; };
    P.maxSpan = num('setMaxSpan', 5, 1000, 200); P.angleDeg = num('setAngle', 1, 90, 15); P.autoGap = num('setAutoGap', 10, 5000, 120); P.mloopLen = num('setMloopLen', 1, 100, 15); // v2.29
    P.quality = $('admQuality').value === 'normal' ? 'normal' : 'strict';
    { let kp = (admDraft.sheetKmz || $('admKmzPass').value).trim().replace(/\s+/g, '').slice(0, 100); const was = (S.team && S.team.pol && S.team.pol.kmzPass) || ''; // v2.28: the sheet's password where it has one
      if (admKmzAuto && kp === admKmzAuto) kp = autoKmzFor(P.owner);
      if (kp) P.kmzPass = kp; else delete P.kmzPass;
      if (was && was !== kp) P.kmzOld = [was, ...(P.kmzOld || []).filter((x) => x !== was && x !== kp)].slice(0, 5); // files locked before still open
      if (P.kmzOld && !P.kmzOld.length) delete P.kmzOld; }
    if ($('admVendorRec').checked) delete P.vendorRecords; else P.vendorRecords = false;
    P.poleTypes = parseTypeLines($('admPoleTypes').value).filter((t) => !BUILTIN_TYPES.some((b) => b.p === t.p));
    { // v2.28: the BOQ lists and pole details, each kept only when it differs from the built-in one
      const lines = (id) => [...new Set($(id).value.split(/\n/).map((x) => x.trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean))].slice(0, 40);
      const L = {}; delete P.poleOwners; delete P.detailItems;
      ADM_LISTS.forEach(([id, k]) => {
        const v = lines(id), def = k === 'details' ? POLE_DETAIL_ITEMS : BOQ_OPT[k];
        if (!v.length || v.join('|') === def.join('|')) return;
        if (k === 'details') P.detailItems = v; else L[k] = v;
      });
      if (Object.keys(L).length) P.boqLists = L; else delete P.boqLists;
      if (L.owner) { const extra = L.owner.filter((x) => !BOQ_OPT.owner.includes(x)); if (extra.length) P.poleOwners = extra; } } // phones before v2.28 still get the extra owners
    P.packs = parsePackLines($('admPacks').value).packs; if (!P.packs.length) delete P.packs;
    { const a = $('admAreaSrc').value.trim(); if (/^https:\/\/\S+$/.test(a) && a.length <= 300) P.areaSrc = a; else delete P.areaSrc; } // v2.29
    { const a = $('admDxfSeed').value.trim(); if (driveId(a) && a.length <= 300) P.dxfSeed = a; else delete P.dxfSeed; } // v2.30: the plan template (DXF seed) on Google Drive
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
    const box = $('admCos'); box.innerHTML = ''; // v2.23: read only: the sheet is the list
    if (!admDraft.co.length) box.innerHTML = '<p class="hint" style="margin:0">No companies yet: they are read from the online sheet.</p>';
    admDraft.co.forEach((c) => { const t = document.createElement('span'); t.textContent = c; if (normCo(c) === normCo(admDraft.pol.owner)) t.className = 'own'; box.appendChild(t); });
    const own = $('admOwner'), cur = admDraft.pol.owner || own.value || ''; // v2.23: the draft's admin company (the sheet's spelling) first
    own.innerHTML = '<option value="">Not set: every user may manage, add and verify</option>' + admDraft.co.map((c) => `<option${c === cur ? ' selected' : ''}>${C.xmlEsc(c)}</option>`).join('');
    if (cur && !admDraft.co.includes(cur)) own.value = '';
    $('admRev').textContent = admDraft.rev ? `Saving makes version ${admDraft.rev + 1}${admDraft.newPin ? ' with the new admin PIN' : ''}. Phones that have version ${admDraft.rev} take it ${admDraft.src && S.onlineAdminKey ? 'from the online sheet by themselves' : 'with the join link or QR code'}.` : 'Saving makes version 1 of a new list.';
  }
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
    if (!admDraft.co.length) { toast('No companies yet: set the online sheet (URL, read key, admin key) and tap Refresh from the sheet.', 6000); admOpenFor('admUrl'); $('admCoRefresh').scrollIntoView({ block: 'center' }); return; }
    const url = $('admUrl').value.trim(), rkey = $('admReadKey').value.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) { toast('The online sheet URL must start with https://'); return; }
    if (url && !rkey) { toast('Enter the read key from the sheet’s Settings tab, or clear the URL'); admOpenFor('admReadKey'); $('admReadKey').focus(); return; }
    if (admDraft.co.length > 300) { toast(`The list has ${admDraft.co.length} companies; the most is 300. Remove some, or keep the full list in the online sheet.`, 6000); return; }
    const P = readPolDraft();
    if (P.logos && !P.logos.left && !P.logos.right) delete P.logos;
    if (JSON.stringify(P).length > 60000) { toast('The list is too large to save: use smaller logo images (or fewer defect lines).', 6000); return; } // v2.23: phones refuse larger lists
    if (P.kmzPass && kmzHasKey(P.kmzPass)) { // v2.22: the KMZ password goes to every phone of the list
      const c = await ask('KMZ password holds your company key', 'The KMZ password is sent to every phone of the company list, contractors included. With your company key in it, any user could read the key and sign in to the online sheet as your company. Use a random password instead (nobody types it: the phones get it with the list)?',
        [{ label: 'Cancel', value: '' }, { label: 'Use a random password', value: 'rand', primary: true }, { label: 'Keep mine', value: 'keep' }]);
      if (!c) return;
      if (c === 'rand') { const old = P.kmzPass; P.kmzPass = suggestKmzPass(P.owner); $('admKmzPass').value = P.kmzPass; if (P.kmzOld) { P.kmzOld = P.kmzOld.filter((x) => x !== old); if (!P.kmzOld.length) delete P.kmzOld; } }
    }
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
    if (viaSheet) { // v2.28: the online sheet carries the list: no join QR code after Save; invites are made per company
      const go = await ask(`Version ${S.team.rev} saved`, `Phones that joined get it from the online sheet by themselves.${admDraft.newPin ? ' Admins must enter the new PIN after taking it.' : ''}\n\nTo add users, make an invite for their company: Settings → company list → Share${pol().owner ? ', or Administration → Invite a company\u2019s users (company keys)' : ''}.`,
        [{ label: 'OK', value: false }, { label: 'Make an invite', value: true, primary: true }]);
      if (go) $('teamShare').click();
      return;
    }
    showTeamQr(`Version ${S.team.rev} saved. Send the join link or show this QR code to each user.${S.team.src && !S.onlineAdminKey ? ' Enter the sheet’s Admin key (Online Google Sheet) so phones update by themselves.' : ''}${admDraft.newPin ? ' Admins must enter the new PIN after taking it.' : ''}`);

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
      const j = await cloudRequest({ url }, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: S.onlineAdminKey, action: 'setList', list, id: S.team.id, rev: S.team.rev, dxfSeed: driveId(pol().dxfSeed || '') || '' }) }); // v2.32: and its plan template
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
  async function joinShort(code, sw, quiet) {
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
    let ok = false;
    try { ok = await importTeamText(j.list, quiet ? { quiet: true } : undefined); } finally { teamSwitch = false; }
    if (ok && S.team && S.team.id === body.id && S.team.rev === body.rev) { S.sheetListAt = { url, id: body.id, rev: body.rev }; persist(); } // v2.26: this phone's invites are short too
    return ok;
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
  function askPin(title, text, o) {
    const x = o || {};
    $('pinTitle').textContent = title; $('pinText').textContent = text || ''; $('pinInput').value = '';
    $('pinCode').hidden = !x.code; $('pinCode').textContent = x.code || ''; $('pinInput').placeholder = x.placeholder || '4 to 8 digits'; // v2.22: a request code shown large
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
  /* ================= v2.29: download the area on the map as an offline pack =================
     The street map tile servers forbid saving areas for offline use, so the area is cut instead from a Protomaps
     basemap build (OpenStreetMap data, ODbL), the same source as the map packs: like "pmtiles extract --bbox", the app
     reads only the parts of the build file it needs (range requests) and writes them as a .pmtiles pack on the phone.
     The admin can point to the company's own copy of a build instead (Administration → Offline map packs). */
  const AREA_MAXZ = 15, AREA_MAX_TILES = 6000, AREA_PAR = 6, AREA_MAX_BYTES = 400 * 1048576; // a dense city's tiles are big: the download also stops at 400 MB
  const pmBuildUrls = () => { const out = []; const d = new Date(); for (let i = 0; i < 10; i++) { const x = new Date(d.getTime() - i * 86400000); out.push(`https://build.protomaps.com/${x.getUTCFullYear()}${two(x.getUTCMonth() + 1)}${two(x.getUTCDate())}.pmtiles`); } return out; };
  /** Bytes of a remote file by a range request (Android's HTTP stack in the APK); refuses a server that sends the whole file. */
  async function rangeBytes(url, offset, length, signal) {
    const hdr = { Range: `bytes=${offset}-${offset + length - 1}` };
    if (NATIVE) {
      const r = await withTimeout(nativeGet(url, hdr), 90000, 'The map server did not answer');
      if (r.status !== 206) throw new Error(r.status === 200 ? 'The map server sent the whole file instead of a part' : `The map server answered HTTP ${r.status}`);
      return nativeBytes(r.data);
    }
    const ctl = new AbortController(), stop = () => ctl.abort(); if (signal) signal.addEventListener('abort', stop);
    try {
      const r = await withTimeout(fetch(url, { headers: hdr, cache: 'no-store', mode: 'cors', credentials: 'omit', signal: ctl.signal }), 90000, 'The map server did not answer');
      if (r.status !== 206) { ctl.abort(); throw new Error(r.status === 200 ? 'The map server sent the whole file instead of a part' : `The map server answered HTTP ${r.status}`); }
      return new Uint8Array(await r.arrayBuffer());
    } finally { if (signal) signal.removeEventListener('abort', stop); }
  }
  class RangeSource {
    constructor(url, signal) { this.url = url; this.signal = signal; this.n = 0; this.bytes = 0; }
    getKey() { return this.url; }
    async getBytes(offset, length) { const u = await rangeBytes(this.url, offset, length, this.signal); this.n++; this.bytes += u.length; return { data: u.buffer.slice(u.byteOffset, u.byteOffset + u.length) }; }
  }
  /** Tile ID of z/x/y on the PMTiles Hilbert curve (PMTiles v3 specification). */
  function pmTileId(z, x, y) {
    let acc = 0; for (let i = 0; i < z; i++) acc += 4 ** i;
    const n = 2 ** z; let d = 0, tx = x, ty = y;
    for (let s = n / 2; s >= 1; s /= 2) {
      const rx = (tx & s) > 0 ? 1 : 0, ry = (ty & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) { if (rx === 1) { tx = n - 1 - tx; ty = n - 1 - ty; } const t = tx; tx = ty; ty = t; }
    }
    return acc + d;
  }
  const lon2tx = (lon, z) => Math.min(2 ** z - 1, Math.max(0, Math.floor((lon + 180) / 360 * 2 ** z)));
  const lat2ty = (lat, z) => { const r = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180; return Math.min(2 ** z - 1, Math.max(0, Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z))); };
  /** The tiles of a bbox [w, s, e, n] from zoom 0 to maxz. */
  function areaTiles(b, maxz) {
    const out = [];
    for (let z = 0; z <= maxz; z++) for (let x = lon2tx(b[0], z); x <= lon2tx(b[2], z); x++) for (let y = lat2ty(b[3], z); y <= lat2ty(b[1], z); y++) out.push([z, x, y]);
    return out;
  }
  const isGz = (u) => u.length > 2 && u[0] === 0x1f && u[1] === 0x8b;
  async function gzipBytes(u) {
    if (!('CompressionStream' in window)) return null;
    return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  }
  function pushVarint(arr, v) { while (v >= 128) { arr.push((v % 128) | 128); v = Math.floor(v / 128); } arr.push(v); }
  /** A PMTiles v3 directory, serialized (entries: tileId, offset, length, runLength), then gzipped. */
  async function pmDir(entries) {
    const a = []; pushVarint(a, entries.length);
    let last = 0; entries.forEach((e) => { pushVarint(a, e.tileId - last); last = e.tileId; });
    entries.forEach((e) => pushVarint(a, e.runLength));
    entries.forEach((e) => pushVarint(a, e.length));
    entries.forEach((e, i) => { pushVarint(a, i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length ? 0 : e.offset + 1); });
    const raw = new Uint8Array(a), gz = await gzipBytes(raw);
    return gz ? { bytes: gz, comp: 2 } : { bytes: raw, comp: 1 };
  }
  /** A PMTiles v3 file from tiles [{z, x, y, data}] (vector tiles, gzip), with the source's metadata. */
  async function buildPmtiles(tiles, bbox, minz, maxz, meta) {
    const rows = tiles.map((t) => ({ id: pmTileId(t.z, t.x, t.y), data: t.data })).sort((a, b) => a.id - b.id);
    const seen = new Map(), entries = [], blobs = []; let off = 0;
    for (const r of rows) { // identical tiles (sea, empty land) are stored once
      const key = r.data.length < 2048 ? `${r.data.length}:${Array.from(r.data.subarray(0, 64)).join(',')}:${r.data.length > 64 ? Array.from(r.data.subarray(r.data.length - 64)).join(',') : ''}` : null;
      let e = key && seen.get(key);
      if (e && e.bytes.length === r.data.length && e.bytes.every((v, i) => v === r.data[i])) {
        const prev = entries[entries.length - 1];
        if (prev && prev.offset === e.offset && prev.tileId + prev.runLength === r.id) prev.runLength++; else entries.push({ tileId: r.id, offset: e.offset, length: e.length, runLength: 1 });
        continue;
      }
      e = { offset: off, length: r.data.length, bytes: r.data }; if (key) seen.set(key, e);
      entries.push({ tileId: r.id, offset: off, length: r.data.length, runLength: 1 }); blobs.push(r.data); off += r.data.length;
    }
    let root = await pmDir(entries), leaves = { bytes: new Uint8Array(0) };
    if (127 + root.bytes.length > 16384) { // too many entries for the first 16 KB: leaf directories
      let per = 4096, rootEntries, leafParts;
      for (;;) {
        rootEntries = []; leafParts = []; let lo = 0;
        for (let i = 0; i < entries.length; i += per) { const d = await pmDir(entries.slice(i, i + per)); rootEntries.push({ tileId: entries[i].tileId, offset: lo, length: d.bytes.length, runLength: 0 }); leafParts.push(d.bytes); lo += d.bytes.length; }
        root = await pmDir(rootEntries); if (127 + root.bytes.length <= 16384 || per > entries.length) break; per *= 2;
      }
      const L = leafParts.reduce((t, x) => t + x.length, 0), lb = new Uint8Array(L); let p = 0; leafParts.forEach((x) => { lb.set(x, p); p += x.length; }); leaves = { bytes: lb };
    }
    const mraw = enc8(JSON.stringify({ ...(meta || {}), description: `G-eSAA area pack cut from ${(meta && meta.source) || 'a Protomaps basemap build'}`, 'g-esaa:bbox': bbox })), mgz = (await gzipBytes(mraw)) || mraw;
    const comp = root.comp, H = new Uint8Array(127), dv = new DataView(H.buffer);
    'PMTiles'.split('').forEach((c, i) => { H[i] = c.charCodeAt(0); }); H[7] = 3;
    const u64 = (o, v) => { dv.setUint32(o, v % 4294967296, true); dv.setUint32(o + 4, Math.floor(v / 4294967296), true); };
    const rootOff = 127, metaOff = rootOff + root.bytes.length, leafOff = metaOff + mgz.length, dataOff = leafOff + leaves.bytes.length;
    u64(8, rootOff); u64(16, root.bytes.length); u64(24, metaOff); u64(32, mgz.length); u64(40, leafOff); u64(48, leaves.bytes.length); u64(56, dataOff); u64(64, off);
    u64(72, rows.length); u64(80, entries.length); u64(88, blobs.length);
    H[96] = 1; H[97] = comp; H[98] = rows.length && isGz(rows[0].data) ? 2 : 1; H[99] = 1; H[100] = minz; H[101] = maxz; // tiles: gzip, or none on a phone without gzip
    const e7 = (o, v) => dv.setInt32(o, Math.round(v * 1e7), true);
    e7(102, bbox[0]); e7(106, bbox[1]); e7(110, bbox[2]); e7(114, bbox[3]); H[118] = Math.min(maxz, 14); e7(119, (bbox[0] + bbox[2]) / 2); e7(123, (bbox[1] + bbox[3]) / 2);
    if (comp === 1 && mgz === mraw) H[97] = 1; // no gzip on this phone: nothing compressed
    return new Blob([H, root.bytes, mgz, leaves.bytes, ...blobs], { type: 'application/octet-stream' });
  }
  /** Finds a source build that answers (the admin's own copy, else the newest Protomaps daily build of the last 10 days). */
  async function areaSource(signal) {
    const own = pol().areaSrc, urls = own ? [own] : pmBuildUrls();
    let lastErr = null;
    for (const url of urls) {
      try { const u = await rangeBytes(url, 0, 127, signal); if (pmtilesHeader(u)) return url; } catch (e) { lastErr = e; if (/did not answer/.test(e.message) && !own) break; }
    }
    throw new Error(own ? `The admin's map source did not answer (${lastErr ? lastErr.message : 'not a map file'})` : `No Protomaps build answered${lastErr ? ` (${lastErr.message})` : ''}. ${NATIVE ? 'Check the internet connection.' : 'The website version may be blocked from reading it: use the Android app, or Import a pack file.'}`);
  }
  /** The area to cut: the map view, or the project's records with a margin. */
  function areaBbox(which) {
    if (which === 'project') {
      const pts = projPoints(); if (!pts.length) return null;
      const lat = pts.map((p) => p.lat), lon = pts.map((p) => p.lon), m = 0.01; // about 1 km round it
      return [Math.min(...lon) - m, Math.min(...lat) - m, Math.max(...lon) + m, Math.max(...lat) + m];
    }
    const b = map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }
  const bboxKm = (b) => { const k = Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180); return [Math.abs(b[2] - b[0]) * 111.32 * k, Math.abs(b[3] - b[1]) * 110.57]; };
  async function downloadArea() {
    if (!window.protomapsL || !window.protomapsL.PMTiles) { toast('The offline map reader is not loaded on this phone: open G-eSAA once with internet.', 5000); return; }
    if (navigator.onLine === false) { toast('Connect to the internet (Wi-Fi is best) to download an area', 4000); return; }
    const hasProj = !!(S.project && projPoints().length);
    const which = await ask('Download an area for offline use', `The street map of the area is cut from the Protomaps basemap build (OpenStreetMap data) and kept on this phone as an offline map pack. Zoom 0 to ${AREA_MAXZ}; the map stays sharp closer in.\n\nThe map view: about ${bboxKm(areaBbox('view')).map((v) => v.toFixed(1)).join(' × ')} km.${hasProj ? `\nThe project “${S.project}”: about ${bboxKm(areaBbox('project')).map((v) => v.toFixed(1)).join(' × ')} km.` : ''}`,
      [{ label: 'Cancel', value: null }, ...(hasProj ? [{ label: 'The project’s area', value: 'project' }] : []), { label: 'The map view', value: 'view', primary: true }]);
    if (!which) return;
    const bbox = areaBbox(which), tiles = areaTiles(bbox, AREA_MAXZ);
    if (tiles.length > AREA_MAX_TILES) { toast(`That area is too big for one download (${tiles.length.toLocaleString()} tiles; at most ${AREA_MAX_TILES.toLocaleString()}). Zoom the map in, or ask your admin for a map pack.`, 7000); return; }
    const ctl = new AbortController(); let cancelled = false;
    cancelFlag = false; const watch = setInterval(() => { if (cancelFlag && !cancelled) { cancelled = true; ctl.abort(); } }, 200); // Cancel on the busy screen
    busy('Finding the map source…', null, true);
    try {
      const url = await areaSource(ctl.signal), src = new RangeSource(url, ctl.signal), pm = new window.protomapsL.PMTiles(src);
      const hdr = await pm.getHeader();
      if (hdr.tileType !== 1) throw new Error('The map source has picture tiles, not a vector map');
      const maxz = Math.min(AREA_MAXZ, hdr.maxZoom), minz = 0, list = tiles.filter(([z]) => z <= maxz && z >= hdr.minZoom);
      let meta = {}; try { meta = await pm.getMetadata(); } catch (e) { meta = {}; }
      meta = { ...(meta && typeof meta === 'object' ? meta : {}), source: url };
      const got = []; let i = 0, done = 0, bytes = 0, failure = null;
      const work = async () => { try { await work1(); } catch (e) { if (!failure && !cancelled) { failure = e; ctl.abort(); } } }; // one failure stops the others
      const work1 = async () => {
        while (i < list.length && !cancelled && !failure) {
          const [z, x, y] = list[i++];
          let t = null, tries = 0;
          for (;;) { try { t = await pm.getZxy(z, x, y, ctl.signal); break; } catch (e) { if (cancelled || failure) return; if (++tries > 3) throw e; await sleep(1500 * tries); } }
          if (t && t.data && t.data.byteLength) { let u = new Uint8Array(t.data); if (!isGz(u)) u = (await gzipBytes(u)) || u; got.push({ z, x, y, data: u }); bytes += u.length; }
          if (bytes > AREA_MAX_BYTES) throw new Error(`The area passed ${fmtMB(AREA_MAX_BYTES)} before it was complete: zoom the map in and download a smaller area, or ask your admin for a map pack`);
          done++; busy(`Downloading the area: ${done} of ${list.length} tiles · ${fmtMB(bytes)}`, done / list.length, true);
        }
      };
      await Promise.all(Array.from({ length: AREA_PAR }, work));
      if (failure) throw failure;
      if (cancelled) throw CANCEL;
      if (!got.length) throw new Error('The source has no map data for this area');
      busy('Making the map pack…');
      const blob = await buildPmtiles(got, bbox, minz, maxz, meta);
      busy(false);
      const when = new Date(), name = `${which === 'project' ? S.project : 'Area'} ${when.toLocaleDateString([], { month: 'short', day: 'numeric' })}`, id = `area-${when.getTime()}`;
      LOG.info('area.download', { tiles: got.length, of: list.length, mb: +(blob.size / 1048576).toFixed(1), requests: src.n, src: url.replace(/^https:\/\//, '').slice(0, 60) });
      await runPackJob({ id, name, size: blob.size, bbox, maxzoom: maxz, date: '' }, pumpFile(blob), 'Saving');
      renderOffline();
    } catch (e) {
      busy(false);
      if (e === CANCEL || cancelled) { toast('Area download stopped', 2500); return; }
      throw e;
    } finally { clearInterval(watch); }
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
  $('areaDl').addEventListener('click', () => guard(downloadArea, 'Area not downloaded')); // v2.29
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
    if (patClosed()) { toast('This PAT is complete and locked: nothing can be added. Fix its items in the defect cleanup or the FAT (Projects).', 6000); return; }
    if (visitStage() === 'Cleanup') { // the cleanup works on the PAT pins only: photos are taken from a pin's card
      const t = nextTarget();
      toast(t ? 'Open the pin, then tap “📷 Photo of the fix” on the item' : 'All items are fixed. Share the cleanup KMZ from Projects.', 4500);
      if (t) openVisit(t.r.id, true); return;
    }
    openCamera('new');
  });
  $('brandVer').textContent = `v${APP_VER}`; // the version beside the name (v2.15)
  /* v2.29: tap G-eSAA (top left) to reload the app and check for a new version. Asked first, and not while a photo, a
     record or the marking screen is open, so a stray tap during capture or editing does nothing. */
  const verNum = (v) => String(v || '').split('.').map((x) => parseInt(x, 10) || 0);
  const verNewer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  function reloadBlocked() {
    const open = (id) => { const e = $(id); return !!e && !e.hidden; };
    return ['camera', 'editor', 'boxer', 'photoView', 'qrScan', 'busy', 'askBox', 'pinBox', 'promptBox', 'pickBox'].some(open) || !!ed;
  }
  $('brandBtn').addEventListener('click', () => guard(async () => {
    if (reloadBlocked()) return; // capture or editing in progress: the tap does nothing
    if (!(await ask('Reload G-eSAA?', `Version ${APP_VER}. The app reloads${NATIVE ? ' and checks the website for a newer version' : ' and takes the newest version from the website'}. Your projects, photos and settings stay on this phone.`,
      [{ label: 'Cancel', value: false }, { label: 'Reload', value: true, primary: true }]))) return;
    persist(); LOG.info('app.reload', { native: NATIVE });
    if (NATIVE) { // the APK carries its own files: a new version comes as a new APK
      const base = webBase(); let latest = '';
      if (base && navigator.onLine !== false) {
        busy('Checking for a new version…');
        try { const t = await withTimeout(fetch(`${base}sw.js?ts=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')), 10000, 'no answer'); latest = ((/polecam-v(\d+\.\d+\.\d+)/.exec(t) || [])[1]) || ''; } catch (e) { latest = ''; } finally { busy(false); }
      }
      if (latest && verNewer(latest, APP_VER)) {
        const gh = /^https:\/\/([^.]+)\.github\.io\/([^/]+)\//.exec(base || ''), rel = gh ? `https://github.com/${gh[1]}/${gh[2]}/releases/latest` : base;
        if (await ask(`Version ${latest} is out`, `This app is ${APP_VER}. Install the new APK over this one (same app, your data stays): open the download page?`, [{ label: 'Later', value: false }, { label: 'Get the new APK', value: true, primary: true }])) { openExternal(rel); return; }
      }
      location.reload(); return;
    }
    busy('Getting the newest version…');
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) { await withTimeout(reg.update(), 10000, 'slow').catch(() => {}); const w = reg.installing || reg.waiting; if (w) await withTimeout(new Promise((res) => { const f = () => { if (w.state === 'activated' || w.state === 'redundant') res(); }; w.addEventListener('statechange', f); f(); }), 15000, 'slow').catch(() => {}); }
    } finally { busy(false); }
    location.reload();
  }, 'Not reloaded'));
  // v2.29: no accidental zoom of the whole screen with two fingers (the map, the photo and the drawing keep their own pinch)
  const ownPinch = (t) => !!(t && t.closest && t.closest('#map, #pinMap, #boxWrap, #pvImg, #photoView, #drawWrap, #camStage, .leaflet-container'));
  document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1 && !ownPinch(e.target)) e.preventDefault(); }, { passive: false });
  ['gesturestart', 'gesturechange'].forEach((k) => document.addEventListener(k, (e) => { if (!ownPinch(e.target)) e.preventDefault(); }, { passive: false })); // iPhone Safari
  $('aboutVer').textContent = `G-eSAA v${APP_VER}`; // v2.25: Settings → About shows the real version too
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
    if (pendingJoin || pendingKey || pendingJq || pendingMv) { await loadOrg(); if ((await linkToApp()) && (await tutWait(2500), document.visibilityState !== 'visible')) { /* the G-eSAA app took the link */ } else await handleInvite(`${pendingJoin ? `#join=${pendingJoin}` : ''}${pendingKey ? `&${pendingKey}` : ''}${pendingJq ? `&jq=${pendingJq}` : ''}${pendingMv ? `&mv=${pendingMv}` : ''}${pendingCo ? `&co=${pendingCo}` : ''}`, true); } else loadOrg(); // a link waits for the organisation check
    if (!profileOk()) { if ($('profile').hidden) openProfile(true); }
    else if (!S.project && !/[?&]shared=1/.test(location.search)) askNewProject(); // photos are taken inside a project
    if (!S.sampleDone) { S.sampleDone = true; persist(); if (!allProjects().length) addSample(false); } // v2.26: the sample project, once, on a new phone (never later, when a user deletes all projects)
    sharedListen(); // v2.19: a file opened with or shared to G-eSAA
    if (profileOk()) setTimeout(() => guard(draftOffer, 'Unsaved record not opened'), 700); // v2.21: a record left unsaved by a reload
    renderSyncBtn();
    cloudSync(false);
  })();
  window.addEventListener('hashchange', () => { const h = location.hash; if (/[#&](join|ck|ci|jq|mv)=/.test(h)) { history.replaceState(null, '', location.pathname + location.search); handleInvite(h, true); } });
  // Files handed to other apps through Share are temporary: clear them each time the APK starts.
  if (NATIVE) nativeCall('Filesystem', 'rmdir', { path: 'share', directory: 'CACHE', recursive: true }).catch(() => {});
  // The APK already carries every file, so the offline cache is only for the website version.
  if (!NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__polecam = { get points() { return points; }, get S() { return S; }, get lastQr() { return lastQrText; }, shortJoin, linkFromNative, openEditor, addEdPhoto, exportPhoto, showExport: (sel) => showExport(String(sel).replace(/^#/, '')), tilesFor, vicinityJpeg, vicinityFromRoads, closeDb: async () => (await idb()).close(), nativeWrite, grabGuideCrop, prepForOcr, ocrRun,
    packShare, unpackShare, importTeamText, readIdFrom, stackToLine, readStrip, checkQuality, makeStoredImages, poleTypes, LOG, selfTest, logReport,
    surveyQty, buildPmtiles, pmTileId, areaTiles, regionAt, regionSuggest, pmBuildUrls, PackSource, planRoads }; // for testing
})();
