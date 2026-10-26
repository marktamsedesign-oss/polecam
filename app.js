/* PoleCam Survey — field app. Depends on Leaflet (L) and core.js (PoleCore). */
(() => {
  'use strict';
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
  const PIN_LIMIT_M = 1000, MAX_PHOTO_AGE_MS = 10 * 60000;
  const CATS_FOR = { Pole: ['Pole', 'Cable / strand', 'MLoop', 'NAP', 'Closure', 'Other'], ODF: ['ODF', 'Other'], ODC: ['ODC', 'Cable / strand', 'Other'], Rack: ['Rack', 'ODF', 'Other'] };
  const PHOTO_LABELS = ['Overview', 'Pole tag', 'MLoop', 'NAP', 'Closure', 'Cable', 'ODF', 'ODC', 'Rack', 'Detail'];
  const STATUS_TEXT = { OK: 'OK', Open: 'With deficiency', Rectified: 'Rectified' };
  const STATUS_COLORS = { OK: '#2b8a3e', Open: '#c92a2a', Rectified: '#1971c2' };
  const DEF = {
    project: 'Default project', projects: ['Default project'],
    types: ['Concrete', 'Wood', 'Steel', 'Fiberglass'], stamp: true, maxPx: 2048,
    zone: 51, sym: 1, txt: 1.5, base: 'street', lastPoleId: '', lastType: 'Concrete', view: null, areas: [],
    meta: {}, defects: JSON.parse(JSON.stringify(DEF_CHECK)), userName: '',
    gpsFresh: true, quality: 'normal', readId: true, maxSpan: 50, angleDeg: 15, autoGap: 120,
    saveBase: 'DOCUMENTS', saveFolder: 'PoleCam', saveByProject: true,
  };
  let S = (() => { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem('polecam.settings') || '{}')); } catch (e) { return { ...DEF }; } })();
  const persist = () => { try { localStorage.setItem('polecam.settings', JSON.stringify(S)); } catch (e) { /* storage blocked */ } };

  /* ================= IndexedDB ================= */
  /* The browser can close the database connection on its own (the app goes to the background while the camera
     is open, storage pressure, another tab). Every call therefore reopens a closed connection and retries once.
     Photos and tiles are stored as ArrayBuffers, which every browser (including Safari on iPhone) stores reliably. */
  let dbp = null;
  function openDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('polecam', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('points', { keyPath: 'id' });
        d.createObjectStore('photos', { keyPath: 'id' });
        d.createObjectStore('tiles', { keyPath: 'k' });
      };
      r.onsuccess = () => {
        const d = r.result;
        d.onclose = () => { dbp = null; };
        d.onversionchange = () => { try { d.close(); } catch (e) { /* already closed */ } dbp = null; };
        res(d);
      };
      r.onerror = () => { dbp = null; rej(r.error); };
      r.onblocked = () => { dbp = null; rej(new Error('Storage is busy in another PoleCam tab. Close other tabs and try again.')); };
    });
  }
  function idb() { if (!dbp) dbp = openDb(); return dbp; }
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

  /* ================= UI helpers ================= */
  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }
  let cancelFlag = false;
  $('busyCancel').addEventListener('click', () => { cancelFlag = true; $('busyText').textContent = 'Stopping…'; });
  function busy(text, frac, cancellable) {
    if (text === false) { $('busy').hidden = true; $('busyCancel').hidden = true; return; }
    $('busyCancel').hidden = !cancellable;
    $('busy').hidden = false; $('busyText').textContent = text;
    const p = $('busyProg');
    if (frac == null) p.removeAttribute('value'); else p.value = frac;
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  /* ---- project mode + acceptance helpers ---- */
  const pmeta = (name) => (S.meta && S.meta[name || S.project]) || { mode: 'survey' };
  const isAcc = (name) => pmeta(name).mode === 'acceptance';
  const photosOf = (r) => (r.photos ? r.photos : [{ pid: r.id, label: 'Photo' }]);
  function recStatus(r) { const d = r.defs || []; if (!d.length) return 'OK'; return d.some((x) => x.status !== 'Rectified') ? 'Open' : 'Rectified'; }
  const openCount = (r) => (r.defs || []).filter((d) => d.status !== 'Rectified').length;
  const elemOf = (r) => r.element || 'Pole';
  function allPids(r) {
    const s = photosOf(r).map((p) => p.pid);
    (r.defs || []).forEach((d) => { if (d.pid) s.push(d.pid); if (d.afterPid) s.push(d.afterPid); });
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
  /** Next ID for the current project only (and same element type in acceptance), so numbering never carries over. */
  function suggestId(element) {
    const pts = points.filter((p) => p.project === S.project && (!element || elemOf(p) === element));
    if (!pts.length) return '';
    const last = pts.reduce((m, p) => (p.created > m.created ? p : m));
    return C.nextPoleId(last.poleId);
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
    acc: gps && Number.isFinite(gps.acc) ? gps.acc : null, by: S.userName || '' });
  const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const stamp8 = () => { const d = new Date(), p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

  /* ================= sheets + back button ================= */
  const stack = []; const pendingClose = [];
  function openSheet(id) {
    const el = $(id); el.hidden = false; el.style.zIndex = 1000 + stack.length;
    stack.push(id); history.pushState({ sheet: id }, '');
  }
  function closeSheet() {
    return new Promise((r) => { if (!stack.length) return r(); pendingClose.push(r); history.back(); });
  }
  window.addEventListener('popstate', () => {
    const id = stack.pop();
    if (id) { $(id).hidden = true; onSheetClosed(id); }
    const r = pendingClose.shift(); if (r) r();
  });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet()));
  function onSheetClosed(id) {
    if (id === 'camera') stopCamera();
    if (id === 'editor') { cleanupEditor(); }
    if (id === 'list') revokeListUrls();
  }

  /* ================= map tiles (cached in IndexedDB) ================= */
  const SOURCES = {
    street: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, attr: '© OpenStreetMap contributors' },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, attr: 'Imagery © Esri' },
  };
  const tileUrl = (src, z, x, y) => SOURCES[src].url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  async function fetchTile(src, z, x, y) {
    const k = `${src}/${z}/${x}/${y}`;
    try { const hit = await dbGet('tiles', k); if (hit) return hit.blob; } catch (e) { /* ignore */ }
    if (!navigator.onLine) return null;
    try {
      const r = await fetch(tileUrl(src, z, x, y), { mode: 'cors', credentials: 'omit' });
      if (!r.ok) return null;
      const blob = await r.blob();
      dbPut('tiles', { k, blob, t: Date.now() }).catch(() => {});
      return blob;
    } catch (e) { return null; }
  }
  const CachedLayer = L.TileLayer.extend({
    createTile(coords, done) {
      const img = document.createElement('img');
      img.alt = ''; img.setAttribute('role', 'presentation');
      img.onload = () => done(null, img);
      img.onerror = (e) => done(e, img);
      const src = this.options.src;
      fetchTile(src, coords.z, coords.x, coords.y).then((blob) => {
        if (blob) { img._ou = URL.createObjectURL(blob); img.src = img._ou; }
        else if (navigator.onLine) img.src = tileUrl(src, coords.z, coords.x, coords.y); // uncached fallback
        else done(new Error('offline'), img);
      });
      return img;
    },
  });
  function baseLayer(src) {
    const l = new CachedLayer('', { src, maxZoom: 21, maxNativeZoom: SOURCES[src].max, attribution: SOURCES[src].attr });
    l.on('tileunload', (e) => { if (e.tile._ou) URL.revokeObjectURL(e.tile._ou); });
    return l;
  }

  /* ================= main map ================= */
  const map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: 21 });
  map.attributionControl.setPrefix(false);
  let mainBase = baseLayer(S.base).addTo(map);
  const poleLayer = L.layerGroup().addTo(map);
  const gpsLayer = L.layerGroup().addTo(map);
  if (S.view) map.setView([S.view.lat, S.view.lon], S.view.z); else map.setView([12.3, 122.6], 6);
  map.on('moveend', () => { const c = map.getCenter(); S.view = { lat: c.lat, lon: c.lng, z: map.getZoom() }; persist(); });
  const labelsFor = () => map.getContainer().classList.toggle('hide-labels', map.getZoom() < 16);
  map.on('zoomend', labelsFor); labelsFor();

  const TYPE_COLORS = ['#e8590c', '#1971c2', '#2b8a3e', '#9c36b5', '#c2255c', '#0c8599', '#5c940d', '#495057'];
  const typeColor = (t) => { const i = S.types.indexOf(t); return TYPE_COLORS[(i < 0 ? S.types.length : i) % TYPE_COLORS.length]; };

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
      m.bindTooltip(`${p.poleId || '(no ID)'}${acc && n ? ` · ${n} open` : ''}${role || ''}`, { permanent: true, direction: 'right', offset: [8, 0], className: 'pole-label' });
      m.on('click', () => (routeMode ? routeTap(p.id) : openEditorFor(p.id)));
      m.addTo(poleLayer);
    }
    $('projectName').textContent = S.project;
    const mb = $('modeBadge'); mb.textContent = isAcc() ? (pmeta().stage || 'PAT') : 'SURVEY'; mb.classList.toggle('acc', isAcc());
    $('importBtn').classList.toggle('off', isAcc());
    $('pointCount').textContent = pts.length;
    if (typeof drawAreas === 'function') drawAreas();
  }
  /* ================= route and spans (survey projects) ================= */
  let routeMode = false, routeSel = null, routeUndo = [];
  const routeLayer = L.layerGroup().addTo(map);
  const links = () => (pmeta().links || []);
  function setLinks(l) { S.meta = S.meta || {}; S.meta[S.project] = { ...pmeta(), links: l }; persist(); }
  const routeModel = () => C.analyzeRoute(projPoints(), links(), { maxSpan: S.maxSpan || 50, angleDeg: S.angleDeg || 15 });
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
    $('rbStats').textContent = `${R.long} longer than ${S.maxSpan || 50} m · ${R.angle} angle · ${R.junction} junction · ${R.off} not linked`;
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
    const add = C.autoLinks(projPoints(), S.autoGap || 120).filter(([x, y]) => !have.has([x, y].sort().join('|')));
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
  $('layerBtn').addEventListener('click', () => {
    S.base = S.base === 'street' ? 'satellite' : 'street'; persist();
    map.removeLayer(mainBase); mainBase = baseLayer(S.base).addTo(map); mainBase.bringToBack();
    if (pinMap) { pinMap.removeLayer(pinBase); pinBase = baseLayer(S.base).addTo(pinMap); pinBase.bringToBack(); }
    toast(S.base === 'street' ? 'Street map' : 'Satellite imagery', 1400);
  });
  $('locateBtn').addEventListener('click', () => {
    if (!watchId) startGps();
    if (fix) map.setView([fix.lat, fix.lon], Math.max(map.getZoom(), 18));
    else toast('Waiting for GPS…');
  });

  /* ================= GPS ================= */
  let fix = null, watchId = 0;
  const quality = (acc) => (acc == null ? '' : acc <= 5 ? 'good' : acc <= 15 ? 'fair' : 'poor');
  function startGps() {
    if (!('geolocation' in navigator)) { $('gpsText').textContent = 'No GPS on this device'; return; }
    if (watchId) return;
    watchId = navigator.geolocation.watchPosition(onFix, (err) => {
      const msg = err.code === 1 ? 'Location blocked — allow it in browser settings' : 'Searching for GPS…';
      $('gpsText').textContent = msg; $('camGpsText').textContent = msg;
      if (err.code === 1) { navigator.geolocation.clearWatch(watchId); watchId = 0; }
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function stopGps() { if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = 0; } }
  function onFix(pos) {
    const c = pos.coords;
    fix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, alt: c.altitude, t: pos.timestamp };
    const q = quality(fix.acc), txt = `±${fix.acc < 10 ? fix.acc.toFixed(1) : Math.round(fix.acc)} m`;
    $('gpsDot').className = 'dot ' + q; $('gpsText').textContent = 'GPS ' + txt;
    $('camGpsDot').className = 'dot ' + q; $('camGpsText').textContent = 'GPS ' + txt;
    gpsLayer.clearLayers();
    L.circle([fix.lat, fix.lon], { radius: fix.acc, color: '#1c7ed6', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(gpsLayer);
    L.circleMarker([fix.lat, fix.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#1c7ed6', fillOpacity: 1, interactive: false }).addTo(gpsLayer);
    if (ed) editorGpsUpdate();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopGps(); else startGps(); });

  /* ================= camera ================= */
  /* Capture rules: a photo is kept only if a GPS update arrived within GPS_WINDOW_MS of the shutter (always in acceptance,
     optional in survey), then it is checked for blur and exposure, and the painted Pole ID inside the guide box is read. */
  const GPS_WINDOW_MS = 5000;
  let stream = null, imageCapture = null, torchOn = false, wakeLock = null, camTarget = 'new', camBusy = false, camTick = 0;
  const needFreshGps = () => isAcc() || S.gpsFresh !== false;
  function showGuide() {
    const on = camTarget === 'scan' || (camTarget === 'new' && S.readId !== false);
    $('idGuide').hidden = !on;
    $('idGuideText').textContent = camTarget === 'scan' ? 'Fit the painted Pole ID inside the box, then tap the shutter' : 'Fit the painted Pole ID inside the box to read it';
    $('camReadId').hidden = camTarget !== 'new';
    $('camReadId').setAttribute('aria-pressed', String(S.readId !== false));
  }
  function camGpsTick() {
    if (!fix) return;
    const age = (Date.now() - fix.t) / 1000, stale = age * 1000 > GPS_WINDOW_MS;
    $('camGpsDot').className = 'dot ' + (stale ? 'poor' : quality(fix.acc));
    $('camGpsText').textContent = `GPS ±${fix.acc < 10 ? fix.acc.toFixed(1) : Math.round(fix.acc)} m · ${age < 1.5 ? 'now' : `${Math.round(age)} s ago`}`;
  }
  async function openCamera(target) {
    camTarget = target || 'new';
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
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      $('camTorch').hidden = !caps.torch;
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* optional */ }
    } catch (e) {
      $('camMsg').hidden = false;
      $('camMsg').textContent = 'The in-app camera is blocked. Tap the camera button on the left to use your phone camera app.';
    }
  }
  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; imageCapture = null; torchOn = false;
    $('video').srcObject = null;
    clearInterval(camTick);
    if (qualResolve) { qualResolve(false); qualResolve = null; }
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  function camCheck(text) { $('camCheck').hidden = !text; if (text) $('camCheckText').textContent = text; }
  $('camClose').addEventListener('click', () => closeSheet());
  $('camReadId').addEventListener('click', () => { S.readId = S.readId === false; persist(); showGuide(); toast(S.readId ? 'Pole ID reading on' : 'Pole ID reading off', 1500); });
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
    return cv;
  }

  /* ---- blur / exposure check ---- */
  const QUAL_T = { normal: 25, strict: 60 };
  const QUAL_TEXT = {
    blurry: 'Looks blurry. Hold the phone steady and tap the screen to focus.',
    dark: 'Too dark. Turn on the flashlight or move to better light.',
    bright: 'Overexposed. Avoid pointing the camera at the sun or a bright sky.',
    flat: 'Almost no detail. Check that the lens is clean and the subject is in view.',
  };
  async function checkQuality(blob) {
    const mode = S.quality || 'normal';
    if (mode === 'off') return { flags: [] };
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
    if (sharp < QUAL_T[mode]) flags.push('blurry');
    if (mean < 45 || lo / n > 0.55) flags.push('dark');
    if (mean > 225 || hi / n > 0.45) flags.push('bright');
    if (std < 12 && !flags.includes('dark') && !flags.includes('bright')) flags.push('flat');
    return { sharp, mean: Math.round(mean), std: Math.round(std), flags };
  }
  let qualResolve = null, qualUrl = '';
  function askQuality(blob, q) {
    if (qualUrl) URL.revokeObjectURL(qualUrl);
    qualUrl = URL.createObjectURL(blob); $('qualImg').src = qualUrl;
    $('qualTitle').textContent = q.flags.includes('blurry') ? 'This photo looks blurry' : 'This photo may not be clear';
    $('qualWhy').textContent = q.flags.map((f) => QUAL_TEXT[f]).join(' ');
    $('qualBox').hidden = false;
    return new Promise((res) => { qualResolve = res; });
  }
  $('qualRetake').addEventListener('click', () => { $('qualBox').hidden = true; if (qualResolve) { qualResolve(false); qualResolve = null; } });
  $('qualUse').addEventListener('click', () => { $('qualBox').hidden = true; if (qualResolve) { qualResolve(true); qualResolve = null; } });

  $('shutter').addEventListener('click', async () => {
    if (camBusy || !$('qualBox').hidden) return;
    if (!stream) { useNativeCamera(); return; }
    camBusy = true; $('shutter').disabled = true;
    try {
      const shotAt = Date.now(), crop = grabGuideCrop();
      if (camTarget === 'scan') { await closeSheet(); scanResult(crop); return; }
      let blob = null;
      if (imageCapture) { try { blob = await imageCapture.takePhoto(); } catch (e) { blob = null; } }
      if (!blob) {
        const v = $('video'), cv = document.createElement('canvas');
        cv.width = v.videoWidth; cv.height = v.videoHeight;
        cv.getContext('2d').drawImage(v, 0, 0);
        blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
      }
      let gps = fix ? { ...fix } : null;
      if (needFreshGps()) {
        gps = await gpsNear(shotAt);
        if (!gps) { toast('Photo not saved: GPS has not updated in the last 5 seconds. Stay in the open until the GPS pill says "now", then take it again.', 6500); return; }
      }
      camCheck('Checking photo…');
      const q = await checkQuality(blob).catch(() => ({ flags: [] }));
      camCheck(false);
      if (q.flags.length) { if (!(await askQuality(blob, q))) return; q.kept = true; }
      await closeSheet();
      gotPhoto(blob, gps, 'camera', { q, crop });
    } finally { camBusy = false; $('shutter').disabled = false; camCheck(false); }
  });
  function useNativeCamera() { $('nativeInput').value = ''; $('nativeInput').click(); }
  $('camNative').addEventListener('click', useNativeCamera);
  $('nativeInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (camTarget === 'scan') { if (stack[stack.length - 1] === 'camera') await closeSheet(); scanResult(await centerCrop(f)); return; }
    const back = Date.now();
    if (isAcc() && back - (f.lastModified || 0) > MAX_PHOTO_AGE_MS) { toast('That photo was not taken just now. Acceptance photos must be taken live with the camera.', 5000); return; }
    let gps = fix ? { ...fix } : null;
    if (needFreshGps()) {
      gps = await gpsNear(back); // the phone camera app pauses this app, so the fix is taken right after returning
      if (!gps) { toast('Photo not used: no GPS update within 5 seconds. Stay in the open and take it again.', 5500); return; }
    } else if (!gps) {
      try {
        const ex = C.readExif(new Uint8Array(await f.slice(0, 256 * 1024).arrayBuffer()));
        if (ex && ex.lat != null) gps = { lat: ex.lat, lon: ex.lon, acc: null, alt: ex.alt };
      } catch (err) { /* no exif */ }
    }
    const q = await checkQuality(f).catch(() => ({ flags: [] }));
    if (q.flags.length && stack[stack.length - 1] === 'camera') { if (!(await askQuality(f, q))) return; q.kept = true; }
    else if (q.flags.length) q.kept = true;
    if (stack[stack.length - 1] === 'camera') await closeSheet();
    gotPhoto(f, gps, 'camera', { q, crop: S.readId !== false && camTarget === 'new' ? await centerCrop(f) : null });
  });
  /** For photos from the phone camera app: the band where the guide box would be. */
  async function centerCrop(blob) {
    try {
      const im = await loadImage(blob), { w, h } = dims(im);
      const cv = document.createElement('canvas'); cv.width = Math.round(w * 0.8); cv.height = Math.round(h * 0.24);
      cv.getContext('2d').drawImage(im, w * 0.1, h * 0.38, cv.width, cv.height, 0, 0, cv.width, cv.height);
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
  const qSummary = (q) => (q && q.flags ? { sharp: q.sharp, mean: q.mean, flags: q.flags, kept: !!q.kept } : null);
  function gotPhoto(blob, gps, source, extra) {
    const x = extra || {};
    if (ed && ['add', 'defect', 'after'].includes(camTarget)) {
      if (!checkNearElement(gps)) return;
      const meta = { ...photoMeta(gps), q: qSummary(x.q) };
      if (camTarget === 'add') addEdPhoto(blob, meta);
      else if (camTarget === 'defect') setDefPhoto(blob, meta);
      else setAfterPhoto(blob, meta);
      return;
    }
    if (camTarget === 'replace' && ed) {
      ed.newBlob = blob; ed.q = qSummary(x.q); showEdPhoto(blob); showQualWarn(ed.q);
      toast('Photo replaced — tap Save to keep it');
      return;
    }
    openEditor({ mode: 'new', blob, gps, source, takenAt: new Date().toISOString(), q: qSummary(x.q), crop: x.crop });
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
  async function readIdFrom(canvas) {
    const res = [], png = await prepForOcr(canvas);
    // pass 1: Tesseract's global threshold; pass 2: adaptive (Sauvola) threshold for shadows on round poles
    for (const thr of [0, 2]) {
      const r = await ocrRun(png, 6, { thresholding_method: thr });
      if (!r.ok) throw new Error(r.error);
      res.push(r);
    }
    return C.idCandidates(res, lastIdForShape());
  }
  function renderIdCands(state, list, note) {
    const box = $('idCands'); box.hidden = false; box.innerHTML = '';
    if (state === 'reading') { box.innerHTML = '<span class="spin" style="border-color:var(--line);border-top-color:var(--accent)"></span><span>Reading the Pole ID from the photo…</span>'; return; }
    if (state === 'error') { box.textContent = note || 'Could not read the ID. Type it instead.'; return; }
    const lead = document.createElement('span'); lead.textContent = note || (list.length ? 'From the photo:' : 'No ID found in the box. Type it, or tap Scan ID and get closer.'); box.appendChild(lead);
    list.forEach((c) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small' + (c.fits ? ' fit' : '');
      b.textContent = c.id; b.title = `${c.conf}% sure${c.fits ? ', matches your numbering' : ''}`;
      b.addEventListener('click', () => { $('poleId').value = c.id; ed.idTouched = true; ed.idRead = { id: c.id, conf: c.conf }; checkDup(); renderIdCands('done', list, `Using ${c.id} from the photo — check it.`); });
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
      if (best && (explicit ? best.conf >= 55 : (!ed.idTouched && best.conf >= 80))) {
        $('poleId').value = best.id; ed.idRead = { id: best.id, conf: best.conf }; checkDup();
        const rest = list.slice(1);
        if (before && before !== best.id && !explicit) rest.push({ id: before, conf: 0, fits: false });
        renderIdCands('done', rest, `Filled ${best.id} from the photo (${best.conf}% sure) — check it.${rest.length ? ' Other readings:' : ''}`);
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
    if (!el.hidden) el.textContent = `Photo kept with a warning: ${q.flags.join(', ')}. Retake it if the details matter.`;
  }

  /* ================= image processing ================= */
  async function loadImage(blob) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch (e) {
      return await new Promise((res, rej) => {
        const im = new Image(), u = URL.createObjectURL(blob);
        im.onload = () => { URL.revokeObjectURL(u); res(im); };
        im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Could not read this image')); };
        im.src = u;
      });
    }
  }
  const dims = (im) => ({ w: im.width || im.naturalWidth, h: im.height || im.naturalHeight });
  const toBlob = (cv, q) => new Promise((r) => cv.toBlob(r, 'image/jpeg', q));
  async function makeStoredImages(blob) {
    const im = await loadImage(blob), { w, h } = dims(im);
    const sc = Math.min(1, S.maxPx / Math.max(w, h));
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, cv.width, cv.height);
    const clean = await toBlob(cv, 0.88);
    const T = 160, side = Math.min(w, h), tc = document.createElement('canvas');
    tc.width = tc.height = T;
    const tg = tc.getContext('2d'); tg.imageSmoothingQuality = 'high';
    tg.drawImage(im, (w - side) / 2, (h - side) / 2, side, side, 0, 0, T, T);
    tg.strokeStyle = '#e8590c'; tg.lineWidth = 8; tg.strokeRect(4, 4, T - 8, T - 8);
    const thumb = await toBlob(tc, 0.8);
    if (im.close) im.close();
    return { clean, thumb };
  }
  /** Export copy of a photo: optional burned-in stamp + EXIF GPS. Returns Uint8Array. */
  async function exportPhoto(p, cleanBlob, titleText, meta) {
    const title = titleText || `${p.poleId}  ·  ${p.poleType}`;
    const own = meta && meta.lat != null;
    const P = own ? { lat: meta.lat, lon: meta.lon, accuracy: meta.acc, adjusted: false, alt: null } : p;
    const when = (meta && meta.at) || p.takenAt;
    let bytes;
    if (S.stamp) {
      const im = await loadImage(cleanBlob), { w, h } = dims(im);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      if (im.close) im.close();
      const u = C.utmForward(P.lat, P.lon, S.zone, P.lat < 0);
      const fs = Math.max(16, Math.round(w * 0.026)), lh = fs * 1.32, pad = fs * 0.7;
      const lines = [
        [title, `700 ${Math.round(fs * 1.25)}px sans-serif`],
        [`${own ? 'Taken at ' : ''}${P.lat.toFixed(7)}, ${P.lon.toFixed(7)}${Number.isFinite(P.accuracy) ? `   ±${P.accuracy.toFixed(1)} m` : ''}${P.adjusted ? '  (pin adjusted)' : ''}`, `${fs}px monospace`],
        [`UTM ${S.zone}N   E ${u.E.toFixed(2)}   N ${u.N.toFixed(2)}`, `${fs}px monospace`],
        [`${fmtTime(when)}${meta && meta.by ? `   ·   ${meta.by}` : ''}   ·   ${p.project}`, `${fs}px sans-serif`],
      ];
      const bandH = pad * 2 + lh * lines.length + fs * 0.25;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, h - bandH, w, bandH);
      g.fillStyle = '#e8590c'; g.fillRect(0, h - bandH, Math.max(6, fs * 0.3), bandH);
      g.fillStyle = '#fff'; g.textBaseline = 'top';
      let y = h - bandH + pad;
      lines.forEach(([t, f], i) => { g.font = f; g.fillText(t, pad * 1.6, y, w - pad * 3); y += i === 0 ? lh * 1.25 : lh; });
      bytes = new Uint8Array(await (await toBlob(cv, 0.9)).arrayBuffer());
    } else bytes = new Uint8Array(await cleanBlob.arrayBuffer());
    return C.insertExif(bytes, { lat: P.lat, lon: P.lon, alt: P.alt, accuracy: P.accuracy,
      description: title.replace(/\s+·\s+/g, ' | '), title: p.poleId, date: new Date(when) });
  }

  /* ================= point editor ================= */
  let ed = null, pinMap = null, pinBase = null, pinGpsLayer = null, edPhotoUrl = null;
  function ensurePinMap() {
    if (pinMap) return;
    pinMap = L.map('pinMap', { zoomControl: false, attributionControl: false, maxZoom: 21 });
    pinBase = baseLayer(S.base).addTo(pinMap);
    pinGpsLayer = L.layerGroup().addTo(pinMap);
    pinMap.setView([12.3, 122.6], 6);
    pinMap.on('move', updateCoordBox);
    pinMap.on('moveend', clampPin);
    pinMap.on('dragstart zoomstart', () => { if (ed) ed.userMoved = true; });
    pinMap.on('dragstart', () => { if (ed) ed.dragged = true; });
  }
  function showEdPhoto(blob) {
    if (edPhotoUrl) URL.revokeObjectURL(edPhotoUrl);
    edPhotoUrl = blob ? URL.createObjectURL(blob) : '';
    $('edPhoto').src = edPhotoUrl;
  }
  function renderTypeChips(sel) {
    const box = $('typeChips'); box.innerHTML = '';
    const types = S.types.includes(sel) || !sel ? S.types : S.types.concat(sel);
    for (const t of types) {
      const b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.textContent = t; b.setAttribute('aria-pressed', String(t === sel));
      b.addEventListener('click', () => { ed.type = t; box.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); });
      box.appendChild(b);
    }
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
    const other = id && points.find((p) => p.project === S.project && p.poleId === id && (!el || elemOf(p) === el) && (!ed || p.id !== ed.id));
    $('dupWarn').hidden = !other;
    if (other) $('dupWarn').textContent = `${id} is already used in this project.`;
  }
  $('poleId').addEventListener('input', () => { if (ed) ed.idTouched = true; checkDup(); });

  async function openEditor(o) {
    ensurePinMap();
    const acc = isAcc();
    ed = { mode: o.mode, id: o.id || uid(), source: o.source, gps: o.gps || null, newBlob: o.blob || null,
      takenAt: o.takenAt, type: o.type || S.lastType, userMoved: false, queue: o.queue || null, acc };
    if (acc) {
      Object.assign(ed, { element: o.element || 'Pole', photos: (o.photos || []).map((p) => ({ ...p })), pending: {}, removed: [],
        defs: JSON.parse(JSON.stringify(o.defs || [])), mloop: !!o.mloop, nap: !!o.nap, closure: !!o.closure, odf: o.odf || 'New', newBlob: null });
      if (o.blob) { const pid = uid(); ed.photos.unshift({ pid, label: 'Overview', ...photoMeta(o.gps, o.takenAt), q: o.q || null }); ed.pending[pid] = o.blob; }
      $('napId').value = o.napId || ''; $('closureId').value = o.closureId || '';
    }
    $('editorTitle').textContent = acc ? (o.mode === 'edit' ? 'Edit element' : 'New element') : (o.mode === 'edit' ? 'Edit pole' : 'New pole');
    $('edHint').textContent = `Drag the map to put the pin exactly on the ${acc ? 'element' : 'pole'}. It can move up to ${fmtDist(PIN_LIMIT_M)} from where the photo was taken (orange dashed circle).`;
    ['accPhotos', 'accElementBox', 'defBox'].forEach((x) => { $(x).hidden = !acc; });
    $('surveyTypeBox').hidden = acc; $('edPhoto').hidden = acc;
    if (!acc) { $('poleAttach').hidden = true; $('odfBox').hidden = true; }
    $('defPanel').hidden = true; $('addDefBtn').hidden = false;
    $('queueNote').textContent = o.queue ? `${o.queue.index + 1} / ${o.queue.total}` : '';
    $('edDelete').hidden = o.mode !== 'edit'; $('delConfirm').hidden = true;
    $('edSkip').hidden = !o.queue; $('edRetake').hidden = !!o.queue || acc;
    $('edRetake').textContent = o.mode === 'edit' ? 'New photo' : 'Retake';
    $('edSave').textContent = o.queue && o.queue.index + 1 < o.queue.total ? 'Save & next' : 'Save';
    $('poleId').value = o.poleId != null ? o.poleId : suggestId(acc ? ed.element : null);
    ed.idTouched = o.poleId != null;
    ed.q = o.q || null; showQualWarn(ed.q); $('idCands').hidden = true;
    renderTypeChips(ed.type);
    if (acc) { renderElemChips(); applyElement(); renderAccPhotos(); renderDefs(); }
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
      ed.userMoved = false; drawEdGps(); updateCoordBox();
    });
    if (o.crop) runOcrFor(o.crop, false);
    else if (o.mode === 'new' && !o.poleId) setTimeout(() => { $('poleId').focus(); $('poleId').select(); }, 250);
  }
  async function openEditorFor(id) {
    const p = points.find((x) => x.id === id); if (!p) return;
    if (p.kind === 'acceptance' || isAcc(p.project)) {
      openEditor({ mode: 'edit', id, poleId: p.poleId, lat: p.lat, lon: p.lon, takenAt: p.takenAt, source: p.source,
        gps: p.gpsLat != null ? { lat: p.gpsLat, lon: p.gpsLon, acc: p.accuracy } : null,
        element: elemOf(p), photos: p.photos || [], defs: p.defs || [], mloop: p.mloop, nap: p.nap, napId: p.napId, closure: p.closure, closureId: p.closureId, odf: p.odf });
      return;
    }
    const ph = await dbGet('photos', id).catch(() => null);
    openEditor({ mode: 'edit', id, poleId: p.poleId, type: p.poleType, lat: p.lat, lon: p.lon, takenAt: p.takenAt,
      gps: p.gpsLat != null ? { lat: p.gpsLat, lon: p.gpsLon, acc: p.accuracy } : null, storedBlob: ph ? (ph.clean || ph.thumb) : null, source: p.source });
  }
  function cleanupEditor() {
    if (ed && ed.queue && !ed.queueAdvancing) importQueue = [];
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
    const box = $('elemChips'); box.innerHTML = '';
    for (const el of ELEMENTS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = el;
      b.setAttribute('aria-pressed', String(el === ed.element));
      b.addEventListener('click', () => {
        ed.element = el; box.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
        if (!ed.idTouched && ed.mode === 'new') $('poleId').value = suggestId(el);
        applyElement(); checkDup();
      });
      box.appendChild(b);
    }
  }
  function applyElement() {
    const el = ed.element;
    $('idLabel').textContent = `${el.toUpperCase()} ID`;
    $('poleId').placeholder = el === 'Pole' ? 'e.g. MKP-0001' : `e.g. ${el}-01`;
    $('poleAttach').hidden = el !== 'Pole'; $('odfBox').hidden = el !== 'ODF';
    $('atMloop').checked = ed.mloop; $('atNap').checked = ed.nap; $('atClosure').checked = ed.closure;
    $('napId').hidden = !ed.nap; $('closureId').hidden = !ed.closure;
    $('odfChips').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === ed.odf)));
  }
  $('atMloop').addEventListener('change', (e) => { ed.mloop = e.target.checked; });
  $('atNap').addEventListener('change', (e) => { ed.nap = e.target.checked; $('napId').hidden = !ed.nap; if (ed.nap) $('napId').focus(); });
  $('atClosure').addEventListener('change', (e) => { ed.closure = e.target.checked; $('closureId').hidden = !ed.closure; if (ed.closure) $('closureId').focus(); });
  $('odfChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; ed.odf = c.dataset.v; applyElement(); });

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
    const pid = uid(); ed.photos.push({ pid, label: nextPhotoLabel(), ...meta }); ed.pending[pid] = blob;
    renderAccPhotos(); toast('Photo added — set its label under the picture');
  }

  function renderDefs() {
    const list = $('defList'); list.innerHTML = '';
    const open = ed.defs.filter((d) => d.status !== 'Rectified').length;
    const st = $('defStatus');
    st.textContent = !ed.defs.length ? 'OK · no deficiency' : open ? `${open} open` : 'All rectified';
    st.className = 'pill ' + (!ed.defs.length ? 'ok' : open ? 'bad' : 'rect');
    const stage = pmeta().stage || 'PAT';
    ed.defs.forEach((d, i) => {
      const card = document.createElement('div'); card.className = 'defcard' + (d.status === 'Rectified' ? ' rect' : '');
      const t = document.createElement('span'); t.className = 't'; t.textContent = `${d.cat}: ${d.item}`;
      const s = document.createElement('span'); s.className = 's';
      s.textContent = `${d.sev} · ${d.status === 'Rectified' ? `Rectified${d.fixedAt ? ' ' + fmtTime(d.fixedAt) : ''}${d.fixedBy ? ' by ' + d.fixedBy : ''}${d.afterPid ? '' : ' · no after photo'}` : 'Open'} · found ${d.stage || 'PAT'} ${fmtTime(d.foundAt)}${d.notes ? ' · ' + d.notes : ''}`;
      card.append(t, s);
      if (d.pid || d.afterPid) {
        const th = document.createElement('div'); th.className = 'thumbs';
        [d.pid, d.afterPid].filter(Boolean).forEach((pid) => { const im = document.createElement('img'); im.alt = pid === d.pid ? 'Defect photo' : 'After photo'; thumbUrl(pid).then((u) => { im.src = u; }); th.appendChild(im); });
        card.appendChild(th);
      }
      const rm = document.createElement('input'); rm.type = 'text'; rm.placeholder = 'Remarks (optional)'; rm.value = d.remarks || '';
      rm.setAttribute('aria-label', 'Remarks'); rm.addEventListener('input', () => { d.remarks = rm.value; });
      card.appendChild(rm);
      const acts = document.createElement('div'); acts.className = 'acts';
      const mk = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); acts.appendChild(b); };
      if (d.status !== 'Rectified') mk('Mark rectified', () => { d.status = 'Rectified'; d.fixedAt = new Date().toISOString(); d.fixedStage = stage; d.fixedBy = S.userName || ''; renderDefs(); });
      else mk('Reopen', () => { d.status = 'Open'; d.fixedAt = null; d.fixedStage = null; d.fixedBy = ''; renderDefs(); });
      mk(d.afterPid ? 'Retake after photo' : 'After photo', () => { ed.afterFor = d.id; openCamera('after'); });
      if ((d.stage || 'PAT') === stage) mk('Remove', () => {
        ed.defs.splice(i, 1);
        [d.pid, d.afterPid].filter(Boolean).forEach((pid) => {
          if (ed.defs.some((o) => o.pid === pid || o.afterPid === pid)) return;
          if (ed.pending[pid]) delete ed.pending[pid]; else ed.removed.push(pid);
        });
        renderDefs();
      }, 'danger');
      card.appendChild(acts);
      list.appendChild(card);
    });
  }
  function setAfterPhoto(blob, meta) {
    const d = ed.defs.find((x) => x.id === ed.afterFor); if (!d) return;
    if (d.afterPid) { if (ed.pending[d.afterPid]) delete ed.pending[d.afterPid]; else ed.removed.push(d.afterPid); }
    const pid = uid(); ed.pending[pid] = blob; d.afterPid = pid; d.afterMeta = meta;
    // The after photo is the evidence, so its capture time is the rectification time.
    d.status = 'Rectified'; d.fixedAt = meta.at; d.fixedStage = pmeta().stage || 'PAT'; d.fixedBy = meta.by || S.userName || '';
    renderDefs(); toast('After photo added — item marked rectified');
  }
  function renderDefPanel() {
    const cats = CATS_FOR[ed.element] || ['Other'];
    const cbox = $('defCats'); cbox.innerHTML = '';
    cats.forEach((c) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = c;
      b.setAttribute('aria-pressed', String(c === defDraft.cat));
      b.addEventListener('click', () => { defDraft.cat = c; defDraft.items = new Set(); renderDefPanel(); });
      cbox.appendChild(b);
    });
    const ibox = $('defItems'); ibox.innerHTML = '';
    const items = (S.defects && S.defects[defDraft.cat]) || [];
    if (!items.length) ibox.innerHTML = '<p class="hint" style="margin:0">No checklist items for this category — describe the defect in notes.</p>';
    items.forEach((it) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = it;
      b.setAttribute('aria-pressed', String(defDraft.items.has(it)));
      b.addEventListener('click', () => { if (defDraft.items.has(it)) defDraft.items.delete(it); else defDraft.items.add(it); b.setAttribute('aria-pressed', String(defDraft.items.has(it))); });
      ibox.appendChild(b);
    });
    $('defSev').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === defDraft.sev)));
  }
  function setDefPhoto(blob, meta) {
    if (!defDraft) return;
    defDraft.blob = blob; defDraft.meta = meta;
    const u = URL.createObjectURL(blob); edUrls.push(u);
    $('defPhotoPrev').src = u; $('defPhotoPrev').hidden = false; $('defPhotoBtn').textContent = 'Retake defect photo';
  }
  $('addDefBtn').addEventListener('click', () => {
    defDraft = { cat: (CATS_FOR[ed.element] || ['Other'])[0], items: new Set(), sev: 'Minor', blob: null };
    $('defNotes').value = ''; $('defPhotoPrev').hidden = true; $('defPhotoBtn').textContent = 'Take defect photo';
    renderDefPanel(); $('defPanel').hidden = false; $('addDefBtn').hidden = true;
    $('defPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('defSev').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c || !defDraft) return; defDraft.sev = c.dataset.v; renderDefPanel(); });
  $('defPhotoBtn').addEventListener('click', () => openCamera('defect'));
  $('defCancel').addEventListener('click', () => { defDraft = null; $('defPanel').hidden = true; $('addDefBtn').hidden = false; });
  $('defAdd').addEventListener('click', () => {
    const notes = $('defNotes').value.trim();
    let items = [...defDraft.items], useNotes = notes;
    if (!items.length) { if (!notes) { toast('Tap a defect or describe it in notes'); return; } items = [notes]; useNotes = ''; }
    let pid = null;
    if (defDraft.blob) { pid = uid(); ed.pending[pid] = defDraft.blob; }
    const now = new Date().toISOString(), stage = pmeta().stage || 'PAT';
    items.forEach((it) => ed.defs.push({ id: uid(), cat: defDraft.cat, item: it, sev: defDraft.sev, notes: useNotes, pid, pidMeta: pid ? defDraft.meta : null,
      status: 'Open', stage, foundAt: now, foundBy: S.userName || '', remarks: '' }));
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
  $('edSkip').addEventListener('click', () => nextImport(true));
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
    const poleId = $('poleId').value.trim().toUpperCase();
    if (!poleId) { toast(`Enter the ${ed.acc ? ed.element : 'Pole'} ID first`); $('poleId').focus(); return; }
    {
      const c0 = pinMap.getCenter();
      if (ed.gps && ed.dragged && haversine(ed.gps, { lat: c0.lat, lon: c0.lng }) > PIN_LIMIT_M + 2) { clampPin(); toast(`Pin is more than ${fmtDist(PIN_LIMIT_M)} from where the photo was taken`); return; }
      if (ed.acc && !ed.gps) { toast('Waiting for GPS — acceptance records need the location where the photo was taken', 4000); return; }
    }
    if (ed.acc) { await saveAcceptance(poleId); return; }
    const c = pinMap.getCenter(), pos = { lat: c.lat, lon: c.lng };
    const btn = $('edSave'); btn.disabled = true;
    try {
      const now = new Date().toISOString();
      let p = points.find((x) => x.id === ed.id);
      if (ed.newBlob) {
        busy('Saving photo…');
        const { clean, thumb } = await makeStoredImages(ed.newBlob);
        await dbPut('photos', { id: ed.id, clean, thumb });
      }
      const g = ed.gps;
      const rec = Object.assign(p || { id: ed.id, project: S.project, created: now, takenAt: ed.takenAt || now, source: ed.source || 'camera' }, {
        poleId, poleType: ed.type || '', lat: pos.lat, lon: pos.lon, updated: now,
        ...(ed.newBlob ? { q: ed.q || null } : {}), ...(ed.idRead ? { idRead: ed.idRead } : {}),
        gpsLat: g ? g.lat : null, gpsLon: g ? g.lon : null,
        accuracy: g && Number.isFinite(g.acc) ? g.acc : null,
        alt: g && Number.isFinite(g.alt) ? g.alt : null,
        adjusted: g ? haversine(g, pos) > 0.5 : true,
      });
      await dbPut('points', rec);
      if (!p) points.push(rec);
      if (ed.mode === 'new') S.lastPoleId = poleId;
      S.lastType = ed.type || S.lastType; persist();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      renderPoles(); if (!$('list').hidden) renderList();
      busy(false);
      if (ed.queue) { nextImport(false); return; }
      const wasNew = ed.mode === 'new';
      await closeSheet();
      if (wasNew) { map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 17)); toast(`${poleId} saved`); }
      else toast('Changes saved');
    } catch (e) {
      busy(false); toast('Could not save: ' + (e.message || e), 5000);
    } finally { btn.disabled = false; }
  }

  async function saveAcceptance(poleId) {
    const c = pinMap.getCenter(), pos = { lat: c.lat, lon: c.lng };
    const btn = $('edSave'); btn.disabled = true;
    try {
      const now = new Date().toISOString();
      const p = points.find((x) => x.id === ed.id);
      const g = ed.gps, el = ed.element;
      const rec = Object.assign(p || { id: ed.id, project: S.project, created: now, takenAt: ed.takenAt || now, source: ed.source || 'camera' }, {
        kind: 'acceptance', element: el, poleId, poleType: '', lat: pos.lat, lon: pos.lon, updated: now, ...(ed.idRead ? { idRead: ed.idRead } : {}),
        mloop: el === 'Pole' && ed.mloop, nap: el === 'Pole' && ed.nap, closure: el === 'Pole' && ed.closure,
        napId: el === 'Pole' && ed.nap ? $('napId').value.trim().toUpperCase() : '',
        closureId: el === 'Pole' && ed.closure ? $('closureId').value.trim().toUpperCase() : '',
        odf: el === 'ODF' ? ed.odf : '',
        photos: ed.photos.map((ph) => ({ ...ph })), defs: ed.defs,
        gpsLat: g ? g.lat : null, gpsLon: g ? g.lon : null,
        accuracy: g && Number.isFinite(g.acc) ? g.acc : null, alt: g && Number.isFinite(g.alt) ? g.alt : null,
        adjusted: g ? haversine(g, pos) > 0.5 : true,
      });
      const used = new Set(allPids(rec));
      const pend = Object.keys(ed.pending).filter((pid) => used.has(pid));
      for (let i = 0; i < pend.length; i++) {
        busy(`Saving photo ${i + 1} / ${pend.length}…`, i / pend.length);
        const { clean, thumb } = await makeStoredImages(ed.pending[pend[i]]);
        await dbPut('photos', { id: pend[i], clean, thumb });
      }
      await dbPut('points', rec);
      if (!p) points.push(rec);
      await deletePhotosIfUnused(ed.removed.filter((pid) => !used.has(pid)), new Set([rec.id]));
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      renderPoles(); if (!$('list').hidden) renderList();
      busy(false);
      if (ed.queue) { nextImport(false); return; }
      const wasNew = ed.mode === 'new', n = openCount(rec);
      await closeSheet();
      if (wasNew) map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 17));
      toast(`${poleId} saved${n ? ` · ${n} open deficienc${n === 1 ? 'y' : 'ies'}` : ' · OK'}`);
    } catch (e) {
      busy(false); toast('Could not save: ' + (e.message || e), 5000);
    } finally { btn.disabled = false; }
  }

  /* ================= import existing geotagged photos ================= */
  let importQueue = [], importTotal = 0, importIndex = 0;
  $('importBtn').addEventListener('click', () => {
    if (isAcc()) { toast('Import is off in acceptance projects. Photos must be taken live with the in-app camera at the site.', 4500); return; }
    $('importInput').value = ''; $('importInput').click();
  });
  $('importInput').addEventListener('change', (e) => {
    importQueue = Array.from(e.target.files || []); importTotal = importQueue.length; importIndex = 0;
    if (importQueue.length) startImportItem();
  });
  async function startImportItem() {
    const f = importQueue.shift(); if (!f) return;
    let ex = null;
    try { ex = C.readExif(new Uint8Array(await f.slice(0, 256 * 1024).arrayBuffer())); } catch (err) { ex = null; }
    const has = ex && ex.lat != null;
    const d = ex && C.parseExifDate(ex.dateTimeOriginal || ex.dateTime);
    const hint = ex && (ex.xpTitle || ((ex.description || '').length <= 24 ? ex.description : '') || '');
    openEditor({ mode: 'new', blob: f, source: 'import', gps: has ? { lat: ex.lat, lon: ex.lon, acc: null, alt: ex.alt } : null,
      takenAt: (d || new Date(f.lastModified || Date.now())).toISOString(),
      poleId: hint ? hint.toUpperCase() : undefined,
      note: has ? f.name : `${f.name} — no location in this photo, place the pin by hand`,
      queue: { index: importIndex, total: importTotal } });
  }
  async function nextImport() {
    importIndex++;
    if (ed) ed.queueAdvancing = true;
    await closeSheet();
    if (importQueue.length) startImportItem(); else toast(`Import finished (${importTotal} photo${importTotal === 1 ? '' : 's'})`);
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
    $('listTitle').textContent = `Points · ${S.project}`;
    if (!pts.length) { box.innerHTML = `<div class="empty">${q || (acc && listFilter !== 'all') ? 'Nothing matches.' : `No ${acc ? 'elements' : 'poles'} yet. Tap the orange camera button to capture the first one.`}</div>`; return; }
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
  function renderProjects() {
    $('renameProject').value = S.project;
    const m = pmeta(), acc = isAcc();
    $('accMeta').hidden = !acc;
    if (acc) {
      $('accStageInfo').textContent = m.stage === 'FAT' ? `Final Acceptance Test (FAT)${m.fromPat ? ` · re-checking “${m.fromPat}”` : ''}` : 'Provisional Acceptance Test (PAT)';
      $('mSite').value = m.site || ''; $('mContractor').value = m.contractor || ''; $('mGlobe').value = m.globeRep || ''; $('mInspector').value = m.inspector || '';
      $('startFat').hidden = $('startFatHint').hidden = m.stage === 'FAT';
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
      s.textContent = `${pacc ? `Acceptance ${pm.stage || 'PAT'} · ${n} element${n === 1 ? '' : 's'} · ${open} open` : `Survey · ${n} pole${n === 1 ? '' : 's'}`}${areas ? ` · ${areas} offline map${areas === 1 ? '' : 's'}` : ''}${name === S.project ? ' · current' : ''}`;
      d.append(t, s); b.append(d);
      b.addEventListener('click', async () => { S.project = name; persist(); renderPoles(); await closeSheet(); fitProject(); toast(`Now working on: ${name}`); });
      box.appendChild(b);
    }
  }
  $('projectBtn').addEventListener('click', () => { renderProjects(); openSheet('projects'); });
  $('addProject').addEventListener('click', async () => {
    const name = $('newProject').value.trim();
    if (!name) { toast('Type a project name'); return; }
    if (allProjects().includes(name)) { toast('A project with that name already exists'); return; }
    S.projects.push(name);
    S.meta = S.meta || {};
    S.meta[name] = newMode === 'acceptance' ? { mode: 'acceptance', stage: 'PAT', site: '', contractor: '', globeRep: '', inspector: '' } : { mode: 'survey' };
    S.project = name; persist(); $('newProject').value = '';
    renderPoles(); await closeSheet();
    toast(newMode === 'acceptance' ? `PAT "${name}" started — add contractor details in Projects` : `Survey "${name}" started`, 3500);
  });
  let newMode = 'survey';
  $('newMode').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return; newMode = c.dataset.v;
    $('newMode').querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
  });
  [['mSite', 'site'], ['mContractor', 'contractor'], ['mGlobe', 'globeRep'], ['mInspector', 'inspector']].forEach(([id, key]) => {
    $(id).addEventListener('change', () => { const m = { ...pmeta() }; m[key] = $(id).value.trim(); S.meta[S.project] = m; persist(); });
  });
  $('startFat').addEventListener('click', () => guard(async () => {
    const pat = S.project, m = pmeta(pat);
    let name = `${pat} – FAT`, k = 2;
    while (allProjects().includes(name)) name = `${pat} – FAT ${k++}`;
    const src = projPoints(), now = new Date().toISOString();
    busy('Starting FAT…');
    const copies = src.map((r) => ({ ...JSON.parse(JSON.stringify(r)), id: uid(), project: name, updated: now, patId: r.id }));
    for (const c of copies) { await dbPut('points', c); points.push(c); }
    S.meta[name] = { ...m, stage: 'FAT', fromPat: pat };
    S.projects.push(name); S.project = name; persist();
    renderPoles(); renderProjects();
    const open = copies.reduce((t, r) => t + openCount(r), 0);
    toast(`FAT started: ${copies.length} elements, ${open} open item${open === 1 ? '' : 's'} to re-check`, 4500);
  }));
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
    S.project = name; persist(); renderPoles(); renderProjects(); drawAreas();
    toast(`Renamed to "${name}"`);
  }));
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
    S.projects = S.projects.filter((x) => x !== name);
    if (!S.projects.length) S.projects = [DEF.project];
    S.project = allProjects()[0]; persist();
    renderPoles(); drawAreas(); renderProjects();
    toast(`Deleted "${name}"`);
  }));

  /* ================= export ================= */
  let lastResult = null;
  /* ---- Android APK (Capacitor): the in-app browser cannot download files, so exports are written
     to the phone's Documents/PoleCam folder and shared through Android's share sheet. ---- */
  const NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  const plugins = {};
  function nativePlugin(name) {
    if (plugins[name]) return plugins[name];
    const ce = window.capacitorExports;
    if (ce && typeof ce.registerPlugin === 'function') { try { plugins[name] = ce.registerPlugin(name); return plugins[name]; } catch (e) { /* use the bridge below */ } }
    const cap = window.Capacitor;
    plugins[name] = { call: (method, opts) => cap.nativePromise(name, method, opts || {}) };
    return plugins[name];
  }
  const nativeCall = (name, method, opts) => { const p = nativePlugin(name); return p.call ? p.call(method, opts) : p[method](opts || {}); };
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
  function offerResult(blob, name) {
    lastResult = { blob, name };
    $('resultName').textContent = `${name} · ${(blob.size / 1048576).toFixed(2)} MB`;
    $('resultBox').hidden = false;
    $('resSave').textContent = NATIVE ? 'Save to Documents' : 'Save to phone';
    $('resShare').hidden = !NATIVE && !(navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] }));
    $('resultBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  $('resSave').addEventListener('click', async () => {
    if (!lastResult) return;
    if (NATIVE) {
      try {
        const r = await nativeSave(lastResult);
        toast(`Saved to ${r.where}`, 5000);
      } catch (e) { toast('Could not save to Documents — use Share to send the file instead', 6000); }
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
      try {
        const r = await nativePrivate(lastResult);
        await nativeCall('Share', 'share', { title: r.name, dialogTitle: `Send ${r.name}`, files: [r.cacheUri] });
      } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('Sharing failed: ' + (e.message || e), 5000); }
      return;
    }
    try { await navigator.share({ files: [new File([lastResult.blob], lastResult.name, { type: lastResult.blob.type })], title: lastResult.name }); }
    catch (e) { if (e.name !== 'AbortError') toast('Sharing failed — use Save to phone'); }
  });
  $('exportBtn').addEventListener('click', () => {
    const n = projPoints().length, acc = isAcc();
    $('exportScope').textContent = acc ? `Acceptance ${pmeta().stage || 'PAT'} “${S.project}” · ${n} element${n === 1 ? '' : 's'}` : `Project “${S.project}” · ${n} pole${n === 1 ? '' : 's'}`;
    $('accExports').hidden = !acc; $('surveyExports').hidden = acc;
    $('dxfZoneLbl').textContent = `UTM ${S.zone}N`;
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
  const fileBase = () => `${C.safeName(S.project)}_${stamp8()}`;
  async function guard(fn) { try { await fn(); } catch (e) { console.error(e); toast('Export failed: ' + (e.message || e), 6000); } finally { busy(false); } }

  $('doKmz').addEventListener('click', () => guard(async () => {
    const pts = needPoints(); if (!pts) return;
    const icons = $('kmzIcons').checked, names = uniqueNames(pts), files = [], rows = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; busy(`Preparing photos ${i + 1} / ${pts.length}`, i / pts.length);
      const ph = await dbGet('photos', p.id);
      const r = { ...p };
      if (ph && ph.clean) { r.photoName = `photos/${names[p.id]}.jpg`; files.push({ name: 'files/' + r.photoName, data: await exportPhoto(p, ph.clean) }); }
      if (icons && ph && ph.thumb) { r.iconName = `icons/${p.id}.jpg`; files.push({ name: 'files/' + r.iconName, data: new Uint8Array(await ph.thumb.arrayBuffer()) }); }
      rows.push(r);
    }
    busy('Building KMZ…', 1);
    const kml = C.buildKml(rows, { project: S.project, photoIcons: icons, spans: routeModel().spans });
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
      [lbl('Maximum span setting (m)'), S.maxSpan || 50],
      [lbl('Angle pole from (°)'), S.angleDeg || 15],
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
    const names = uniqueNames(pts), files = [];
    for (let i = 0; i < pts.length; i++) {
      busy(`Stamping photos ${i + 1} / ${pts.length}`, i / pts.length);
      const ph = await dbGet('photos', pts[i].id);
      if (ph && ph.clean) files.push({ name: names[pts[i].id] + '.jpg', data: await exportPhoto(pts[i], ph.clean) });
    }
    offerResult(new Blob(C.makeZipParts(files), { type: 'application/zip' }), fileBase() + '_photos.zip');
  }));

  $('doBackup').addEventListener('click', () => guard(async () => {
    const pts = needPoints(); if (!pts) return;
    const files = [{ name: 'points.json', data: JSON.stringify({ app: 'PoleCam', version: 2, project: S.project, meta: pmeta(), exported: new Date().toISOString(), points: pts }, null, 1) }];
    const pids = [...new Set(pts.flatMap(allPids))];
    for (let i = 0; i < pids.length; i++) {
      busy(`Packing photos ${i + 1} / ${pids.length}`, i / pids.length);
      const ph = await dbGet('photos', pids[i]);
      if (ph && ph.clean) files.push({ name: `photos/${pids[i]}.jpg`, data: new Uint8Array(await ph.clean.arrayBuffer()) });
      if (ph && ph.thumb) files.push({ name: `thumbs/${pids[i]}.jpg`, data: new Uint8Array(await ph.thumb.arrayBuffer()) });
    }
    offerResult(new Blob(C.makeZipParts(files), { type: 'application/zip' }), `${fileBase()}_BACKUP.zip`);
  }));
  $('doRestore').addEventListener('click', () => { $('restoreInput').value = ''; $('restoreInput').click(); });
  $('restoreInput').addEventListener('change', (e) => guard(async () => {
    const f = e.target.files[0]; if (!f) return;
    busy('Reading backup…');
    const entries = C.readZip(new Uint8Array(await f.arrayBuffer()));
    const byName = {};
    for (const en of entries) byName[en.name] = en;
    const raw = async (en) => {
      if (!en) return null;
      if (en.method === 0) return en.data;
      if (en.method === 8 && 'DecompressionStream' in window) {
        const s = new Blob([en.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(s).arrayBuffer());
      }
      throw new Error('Unsupported compression in backup');
    };
    const meta = JSON.parse(new TextDecoder().decode(await raw(byName['points.json'])));
    if (!meta || !Array.isArray(meta.points)) throw new Error('This is not a PoleCam backup');
    let n = 0;
    for (const p of meta.points) {
      busy(`Restoring ${++n} / ${meta.points.length}`, n / meta.points.length);
      for (const pid of allPids(p)) {
        const clean = await raw(byName[`photos/${pid}.jpg`]), thumb = await raw(byName[`thumbs/${pid}.jpg`]);
        if (clean || thumb) await dbPut('photos', { id: pid, clean: clean && new Blob([clean], { type: 'image/jpeg' }), thumb: thumb && new Blob([thumb], { type: 'image/jpeg' }) });
      }
      await dbPut('points', p);
      const i = points.findIndex((x) => x.id === p.id); if (i >= 0) points[i] = p; else points.push(p);
    }
    const proj = meta.project || (meta.points[0] && meta.points[0].project);
    if (proj) {
      if (!S.projects.includes(proj)) S.projects.push(proj);
      S.meta = S.meta || {};
      if (meta.meta && !S.meta[proj]) S.meta[proj] = meta.meta;
      else if (meta.meta && meta.meta.links) {
        const have = new Set((S.meta[proj].links || []).map(([x, y]) => [x, y].sort().join('|')));
        S.meta[proj].links = (S.meta[proj].links || []).concat(meta.meta.links.filter(([x, y]) => !have.has([x, y].sort().join('|'))));
      }
      S.project = proj; persist();
    }
    renderPoles(); fitProject();
    $('exportScope').textContent = `Project “${S.project}” · ${projPoints().length} records`;
    $('accExports').hidden = !isAcc(); $('surveyExports').hidden = isAcc();
    toast(`Restored ${meta.points.length} records into “${S.project}”`, 4000);
  }));

  /* ================= acceptance exports ================= */
  const STAGE_LONG = { PAT: 'Provisional Acceptance Test (PAT)', FAT: 'Final Acceptance Test (FAT)' };
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
      items.push({ no, r, d, defectName: d.pid ? `${base[r.id]}_item${no}_defect.jpg` : '', afterName: d.afterPid ? `${base[r.id]}_item${no}_after.jpg` : '' });
    }));
    const photoName = (r, i, p) => `${base[r.id]}_${i + 1}_${C.safeName(p.label)}.jpg`;
    const times = recs.map((r) => r.takenAt).filter(Boolean).sort();
    const first = times.length ? dateOnly(times[0]) : '', lastD = times.length ? dateOnly(times[times.length - 1]) : '';
    const open = items.filter((x) => x.d.status !== 'Rectified');
    return { recs, items, base, photoName, m, stage, dates: first === lastD ? first : `${first} – ${lastD}`, open,
      withDef: recs.filter((r) => openCount(r) > 0).length, rectified: items.length - open.length,
      major: open.filter((x) => x.d.sev === 'Major').length, minor: open.filter((x) => x.d.sev !== 'Major').length };
  }
  function accPhotoList(M) {
    const list = [];
    M.recs.forEach((r) => photosOf(r).forEach((p, i) => list.push({ rec: r, pid: p.pid, name: M.photoName(r, i, p), title: `${r.poleId}  ·  ${elemOf(r)}  ·  ${p.label}`, meta: p.at ? p : null })));
    M.items.forEach((x) => {
      if (x.d.pid) list.push({ rec: x.r, pid: x.d.pid, name: x.defectName, title: `${x.r.poleId}  ·  Item ${x.no}  ·  BEFORE  ·  ${x.d.cat}: ${x.d.item}`, meta: x.d.pidMeta || null });
      if (x.d.afterPid) list.push({ rec: x.r, pid: x.d.afterPid, name: x.afterName, title: `${x.r.poleId}  ·  Item ${x.no}  ·  AFTER  ·  Rectified`, meta: x.d.afterMeta || null });
    });
    return list;
  }
  const PUNCH_HEAD = ['Item No.', 'Location ID', 'Element', 'Category', 'Deficiency', 'Severity', 'Notes', 'Status', 'Found at', 'Date found', 'Date rectified',
    'Days to rectify', 'Rectified by', 'Remarks', 'Latitude', 'Longitude', 'Defect photo', 'Defect photo taken', 'After photo', 'After photo taken', 'After photo distance from pin (m)'];
  const PI = { status: 7, lat: 14, lon: 15 };
  const daysBetween = (a, b) => (a && b ? (Date.parse(b) - Date.parse(a)) / 86400000 : null);
  const distFromPin = (meta, r) => (meta && meta.lat != null ? haversine(meta, r) : null);
  function punchRows(M) {
    return M.items.map((x) => {
      const d = x.d, days = d.status === 'Rectified' ? daysBetween(d.foundAt, d.fixedAt) : null, dist = distFromPin(d.afterMeta, x.r);
      return [x.no, x.r.poleId, elemOf(x.r), d.cat, d.item, d.sev, d.notes || '', d.status, d.stage || 'PAT',
        fmtTime(d.foundAt), d.fixedAt ? fmtTime(d.fixedAt) : '', days != null ? Math.round(days * 10) / 10 : '', d.status === 'Rectified' ? d.fixedBy || '' : '',
        d.remarks || '', x.r.lat, x.r.lon, x.defectName, d.pidMeta ? fmtTime(d.pidMeta.at) : '', x.afterName, d.afterMeta ? fmtTime(d.afterMeta.at) : '',
        dist != null ? Math.round(dist) : ''];
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
  const summaryText = (M) => `${M.recs.length} elements inspected · ${M.withDef} with open deficiency · ${M.items.length} punchlist items (${M.open.length} open, ${M.rectified} rectified) · open major ${M.major} / minor ${M.minor}`;
  const accFileBase = (M) => {
    const pn = C.safeName(S.project);
    return new RegExp(`(^|[_-])${M.stage}([_-]|$)`, 'i').test(pn) ? `${pn}_${stamp8()}` : `${pn}_${M.stage}_${stamp8()}`;
  };

  $('doXlsx').addEventListener('click', () => guard(async () => {
    if (!needPoints()) return;
    const M = accModel(), R = window.PoleReports, st = R.STYLES;
    const lbl = (v) => ({ v, s: st.label });
    const rows = [
      [{ v: `PUNCHLIST / DEFICIENCY LIST — ${STAGE_LONG[M.stage]}`, s: st.title }],
      [lbl('Project'), null, { v: S.project }, null, null, lbl('Site / cluster'), null, { v: M.m.site || '' }],
      [lbl('Contractor'), null, { v: M.m.contractor || '' }, null, null, lbl('Globe representative'), null, { v: M.m.globeRep || '' }],
      [lbl('Inspected by'), null, { v: M.m.inspector || '' }, null, null, lbl('Inspection date'), null, { v: M.dates }],
      [lbl('Generated'), null, { v: fmtTime(new Date().toISOString()) }, null, null, lbl(M.m.fromPat ? 'PAT reference' : ''), null, { v: M.m.fromPat || '' }],
      [{ v: summaryText(M), s: st.info }],
      [],
      PUNCH_HEAD.map((v) => ({ v, s: st.header })),
    ];
    const statusStyle = (v) => (v === 'Rectified' || v === 'OK' ? st.good : v === 'Open' || v === 'With deficiency' ? st.bad : st.cell);
    punchRows(M).forEach((r) => rows.push(r.map((v, ci) => ({ v, s: ci === 0 ? st.center : ci === PI.status ? statusStyle(v) : ci === PI.lat || ci === PI.lon ? st.coord : st.cell }))));
    const LC = R.colName(PUNCH_HEAD.length - 1), merges = [`A1:${LC}1`, `A6:${LC}6`];
    for (let rr = 2; rr <= 5; rr++) merges.push(`A${rr}:B${rr}`, `C${rr}:E${rr}`, `F${rr}:G${rr}`, `H${rr}:K${rr}`);
    const erows = [ELEM_HEAD.map((v) => ({ v, s: st.header }))];
    elemRows(M).forEach((r) => erows.push(r.map((v, ci) => ({ v, s: ci === 0 ? st.center : ci === 9 ? statusStyle(v) : ci === 12 || ci === 13 ? st.coord : st.cell }))));
    const parts = R.buildXlsxParts([
      { name: 'Punchlist', cols: [7, 15, 9, 13, 34, 9, 30, 11, 8, 17, 17, 9, 16, 24, 12, 13, 26, 17, 26, 17, 12], rows, merges, freezeRow: 8,
        autoFilter: `A8:${R.colName(PUNCH_HEAD.length - 1)}${8 + Math.max(1, M.items.length)}` },
      { name: 'Elements', cols: [6, 9, 15, 10, 9, 14, 11, 14, 10, 15, 9, 9, 12, 13, 10, 10, 17, 40], rows: erows, freezeRow: 1,
        autoFilter: `A1:${R.colName(ELEM_HEAD.length - 1)}${Math.max(2, erows.length)}` },
    ]);
    offerResult(new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), accFileBase(M) + '_punchlist.xlsx');
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
      g.fillStyle = stampColor || '#e8590c'; g.fillRect(0, cv.height - bandH, Math.max(4, fs * 0.3), bandH);
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
  $('doPdf').addEventListener('click', () => guard(async () => {
    if (!needPoints()) return;
    const M = accModel(), withPhotos = $('pdfPhotos').checked, elements = [];
    if (withPhotos) {
      for (let i = 0; i < M.recs.length; i++) {
        const r = M.recs[i]; busy(`Preparing photos ${i + 1} / ${M.recs.length}`, i / M.recs.length);
        const photos = [];
        for (const p of photosOf(r)) photos.push({ jpeg: await pdfJpeg(p.pid, 900), caption: `${p.label}${p.at ? ' · ' + fmtTime(p.at) : ''}` });
        const defs = [];
        for (const x of M.items.filter((y) => y.r === r)) {
          const d = x.d;
          defs.push({ no: x.no, text: `${d.cat}: ${d.item}`, status: d.status,
            meta: [d.sev, d.status === 'Rectified' ? `Rectified${d.fixedAt ? ' ' + fmtTime(d.fixedAt) : ''}` : 'Open', `found at ${d.stage || 'PAT'}`, d.notes, d.remarks].filter(Boolean).join(' · '),
            jpeg: d.pid ? await pdfJpeg(d.pid, 600) : null, after: d.afterPid ? await pdfJpeg(d.afterPid, 600) : null });
        }
        const details = [['Coordinates', `${r.lat.toFixed(7)}, ${r.lon.toFixed(7)}${Number.isFinite(r.accuracy) ? ` (GPS ±${r.accuracy.toFixed(1)} m${r.adjusted ? ', pin adjusted' : ''})` : ''}`]];
        attachText(r).forEach((t) => { const k = t.indexOf(': '); details.push(k > 0 ? [t.slice(0, k), t.slice(k + 2)] : ['ODF', t]); });
        details.push(['Captured', fmtTime(r.takenAt)]);
        elements.push({ title: `${r.poleId} · ${elemOf(r)}`, status: STATUS_TEXT[recStatus(r)], details, photos, defs });
      }
    }
    busy('Building PDF…');
    const pdf = window.PoleReports.punchlistPdf({
      title: 'PUNCHLIST / DEFICIENCY LIST', stageLong: STAGE_LONG[M.stage], footer: `${S.project} · ${M.stage} punchlist`,
      info: [['Project', S.project], ['Site / cluster', M.m.site], ['Contractor', M.m.contractor], ['Globe representative', M.m.globeRep],
        ['Inspected by', M.m.inspector], ['Inspection date', M.dates], ...(M.m.fromPat ? [['PAT reference', M.m.fromPat]] : [])],
      summary: [['Elements inspected', M.recs.length], ['With open deficiency', M.withDef, M.withDef ? 'bad' : 'good'], ['Open items', M.open.length, M.open.length ? 'bad' : 'good'],
        ['Rectified items', M.rectified, M.rectified ? 'good' : ''], ['Open major / minor', `${M.major} / ${M.minor}`]],
      items: M.items.map((x) => ({ no: x.no, loc: x.r.poleId, element: elemOf(x.r), cat: x.d.cat, item: x.d.item, notes: x.d.notes, sev: x.d.sev, status: x.d.status,
        found: x.d.stage || 'PAT', fixed: x.d.fixedAt ? dateOnly(x.d.fixedAt) : '', remarks: x.d.remarks })),
      signers: ['Inspected by (Globe representative)', 'Contractor representative', 'Noted by'],
      includePhotos: withPhotos, elements,
    });
    offerResult(new Blob(pdf.output({ title: `${S.project} ${M.stage} punchlist` }), { type: 'application/pdf' }), accFileBase(M) + '_punchlist.pdf');
  }));

  $('doRectPdf').addEventListener('click', () => guard(async () => {
    if (!needPoints()) return;
    const M = accModel(), total = M.items.length;
    if (!total) { toast('No punchlist items in this project — nothing to rectify'); return; }
    const withOpen = $('rectOpen').checked;
    const rect = M.items.filter((x) => x.d.status === 'Rectified').sort((a, b) => (Date.parse(a.d.fixedAt) || 0) - (Date.parse(b.d.fixedAt) || 0));
    const open = M.items.filter((x) => x.d.status !== 'Rectified');
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
    const defect = (x) => `${x.d.cat}: ${x.d.item}${x.d.notes ? ' — ' + x.d.notes : ''}  ·  ${x.d.sev}  ·  found at ${x.d.stage || 'PAT'}`;
    const items = [];
    const n = rect.length + (withOpen ? open.length : 0); let k = 0;
    for (const x of rect) {
      busy(`Preparing photos ${++k} / ${n}`, k / n);
      const d = x.d, dd = daysBetween(d.foundAt, d.fixedAt);
      items.push({ head: head(x), defect: defect(x), right: `Rectified in ${fmtDays(dd)}`, remarks: d.remarks,
        before: { jpeg: d.pid ? await pdfJpeg(d.pid, 800, [`BEFORE · ${x.r.poleId} · item ${x.no}`, d.pidMeta ? shortTime(d.pidMeta.at) : `Found ${shortTime(d.foundAt)}`], '#c92a2a') : null,
          lines: [`Found ${shortTime(d.foundAt)} (${d.stage || 'PAT'})${d.foundBy ? ` by ${d.foundBy}` : ''}`, ...(d.pid ? metaLines(d.pidMeta, x.r, 'Photo taken').slice(1, 2) : ['No defect photo'])] },
        after: d.afterPid ? { jpeg: await pdfJpeg(d.afterPid, 800, [`AFTER · ${x.r.poleId} · item ${x.no}`, d.afterMeta ? shortTime(d.afterMeta.at) : ''].filter(Boolean), '#1971c2'),
          lines: metaLines(d.afterMeta, x.r, 'Rectified · photo taken') } : null,
        missingAfter: d.afterPid ? null : ['No after photo', `Marked rectified ${shortTime(d.fixedAt)}`, d.fixedBy ? `by ${d.fixedBy}` : '', 'without photo evidence'].filter(Boolean) });
    }
    const openItems = [];
    if (withOpen) for (const x of open) {
      busy(`Preparing photos ${++k} / ${n}`, k / n);
      const d = x.d, age = daysBetween(d.foundAt, new Date().toISOString());
      openItems.push({ head: head(x), defect: defect(x), right: `Open for ${fmtDays(age)}`, remarks: d.remarks,
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
        ['Generated', shortTime(new Date().toISOString())], ['Generated by', S.userName || M.m.inspector || '']],
      summary: [['Punchlist items', total], ['Rectified', rect.length, rect.length ? 'blue' : ''], ['Still open', open.length, open.length ? 'bad' : 'good'],
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
    const M = accModel(), list = accPhotoList(M), files = [], byRec = {};
    for (let i = 0; i < list.length; i++) {
      busy(`Preparing photos ${i + 1} / ${list.length}`, i / list.length);
      const ph = await dbGet('photos', list[i].pid);
      if (!ph || !ph.clean) continue;
      files.push({ name: `files/photos/${list[i].name}`, data: await exportPhoto(list[i].rec, ph.clean, list[i].title, list[i].meta) });
      (byRec[list[i].rec.id] = byRec[list[i].rec.id] || []).push(`photos/${list[i].name}`);
    }
    const icons = { Open: 'icons/open.png', Rectified: 'icons/rectified.png', OK: 'icons/ok.png' };
    for (const [k, path] of Object.entries(icons)) files.push({ name: `files/${path}`, data: await statusIcon(STATUS_COLORS[k]) });
    const recs = M.recs.map((r) => ({ id: r.id, name: r.poleId, title: `${r.poleId} · ${elemOf(r)} · ${STATUS_TEXT[recStatus(r)]}`, status: recStatus(r), lat: r.lat, lon: r.lon,
      detailsHtml: [...attachText(r), `Coordinates: ${r.lat.toFixed(7)}, ${r.lon.toFixed(7)}`, `Captured: ${fmtTime(r.takenAt)}`].map(C.xmlEsc).join('<br/>'),
      photos: byRec[r.id] || [],
      defs: M.items.filter((x) => x.r === r).map((x) => ({ no: x.no, text: `${x.d.cat}: ${x.d.item}${x.d.notes ? ' — ' + x.d.notes : ''}`, sev: x.d.sev, status: x.d.status })) }));
    busy('Building KMZ…', 1);
    const kml = window.PoleReports.acceptanceKml(recs, { name: `${S.project} · ${M.stage}`, icons });
    offerResult(new Blob(C.makeZipParts([{ name: 'doc.kml', data: kml }, ...files]), { type: 'application/vnd.google-earth.kmz' }), accFileBase(M) + '.kmz');
  }));

  /* ================= settings ================= */
  async function refreshStorageInfo() {
    try { const n = await dbCount('tiles'); $('tileInfo').textContent = `${n.toLocaleString()} map tiles saved on this phone.`; } catch (e) { $('tileInfo').textContent = '–'; }
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      const per = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      $('storeInfo').textContent = `${points.length} poles in all projects · ${(est.usage / 1048576).toFixed(1)} MB used of ${(est.quota / 1073741824).toFixed(1)} GB available · ${per ? 'protected from automatic cleanup' : 'not yet protected from automatic cleanup'}`;
    }
  }
  $('settingsBtn').addEventListener('click', () => {
    $('setTypes').value = S.types.join('\n'); $('setStamp').checked = !!S.stamp; $('setMaxPx').value = String(S.maxPx);
    $('setZone').value = String(S.zone); $('setSym').value = S.sym; $('setTxt').value = S.txt;
    $('setUser').value = S.userName || '';
    $('setGpsFresh').checked = S.gpsFresh !== false; $('setQuality').value = S.quality || 'normal'; $('setReadId').checked = S.readId !== false;
    $('setMaxSpan').value = S.maxSpan || 50; $('setAngle').value = S.angleDeg || 15; $('setAutoGap').value = S.autoGap || 120;
    $('setSaveBase').value = S.saveBase || 'DOCUMENTS'; $('setSaveFolder').value = S.saveFolder || 'PoleCam'; $('setSaveByProject').checked = S.saveByProject !== false;
    updateSavePreview();
    S.defects = S.defects || JSON.parse(JSON.stringify(DEF_CHECK));
    const cats = Object.keys(S.defects);
    $('setDefCat').innerHTML = cats.map((c) => `<option>${C.xmlEsc(c)}</option>`).join('');
    $('setDefItems').value = (S.defects[cats[0]] || []).join('\n');
    refreshStorageInfo(); openSheet('settings');
  });
  $('setTypes').addEventListener('change', () => {
    const t = $('setTypes').value.split('\n').map((s) => s.trim()).filter(Boolean);
    S.types = t.length ? [...new Set(t)] : DEF.types.slice(); persist(); renderPoles();
  });
  $('setUser').addEventListener('change', () => { S.userName = $('setUser').value.trim(); persist(); });
  function updateSavePreview() {
    $('savePreview').textContent = NATIVE ? `Files go to: ${savePath('…').shown.replace(/\/…$/, '/')}` : 'Website version: your browser saves to its Downloads folder.';
    ['setSaveBase', 'setSaveFolder', 'setSaveByProject'].forEach((id) => { $(id).disabled = !NATIVE; });
  }
  $('setGpsFresh').addEventListener('change', () => { S.gpsFresh = $('setGpsFresh').checked; persist(); });
  $('setQuality').addEventListener('change', () => { S.quality = $('setQuality').value; persist(); });
  $('setReadId').addEventListener('change', () => { S.readId = $('setReadId').checked; persist(); });
  const numSet = (id, key, min, max) => $(id).addEventListener('change', () => { const v = +$(id).value; if (v >= min && v <= max) { S[key] = v; persist(); renderPoles(); } else $(id).value = S[key]; });
  numSet('setMaxSpan', 'maxSpan', 5, 1000); numSet('setAngle', 'angleDeg', 1, 90); numSet('setAutoGap', 'autoGap', 10, 5000);
  $('setSaveBase').addEventListener('change', () => { S.saveBase = $('setSaveBase').value; persist(); updateSavePreview(); });
  $('setSaveFolder').addEventListener('change', () => { S.saveFolder = $('setSaveFolder').value.trim() || 'PoleCam'; persist(); updateSavePreview(); });
  $('setSaveByProject').addEventListener('change', () => { S.saveByProject = $('setSaveByProject').checked; persist(); updateSavePreview(); });
  $('setDefCat').addEventListener('change', () => { $('setDefItems').value = (S.defects[$('setDefCat').value] || []).join('\n'); });
  $('setDefItems').addEventListener('change', () => {
    S.defects[$('setDefCat').value] = $('setDefItems').value.split('\n').map((s) => s.trim()).filter(Boolean); persist();
  });
  $('setStamp').addEventListener('change', () => { S.stamp = $('setStamp').checked; persist(); });
  $('setMaxPx').addEventListener('change', () => { S.maxPx = +$('setMaxPx').value; persist(); });
  $('setZone').addEventListener('change', () => { S.zone = +$('setZone').value; persist(); });
  $('setSym').addEventListener('change', () => { const v = +$('setSym').value; if (v > 0) { S.sym = v; persist(); } });
  $('setTxt').addEventListener('change', () => { const v = +$('setTxt').value; if (v > 0) { S.txt = v; persist(); } });
  /* ================= offline maps ================= */
  const AVG_KB = { street: 18, satellite: 30 };
  const OFF_LIMIT = 4000, Z_MIN = 13;
  let offArea = 'view', offSrc = 'street', offBounds = null;
  const areaLayer = L.layerGroup().addTo(map);
  function lon2x(lon, n) { return Math.floor((lon + 180) / 360 * n); }
  function lat2y(lat, n) { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); }
  /** [s,w,n,e] -> list of [z,x,y] for zooms Z_MIN..zmax */
  function tilesFor(b, zmax) {
    const out = [];
    for (let z = Z_MIN; z <= zmax; z++) {
      const n = 2 ** z, x0 = lon2x(b[1], n), x1 = lon2x(b[3], n), y0 = lat2y(b[2], n), y1 = lat2y(b[0], n);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
    }
    return out;
  }
  const srcsOf = (v) => (v === 'both' ? ['street', 'satellite'] : [v]);
  function areaSize(b) {
    const h = (b[2] - b[0]) * 111.32, w = (b[3] - b[1]) * 111.32 * Math.cos(((b[0] + b[2]) / 2) * Math.PI / 180);
    return `${w.toFixed(2)} km × ${h.toFixed(2)} km`;
  }
  function currentOffBounds() {
    if (offArea === 'poles') {
      const pts = projPoints(); if (!pts.length) return null;
      let s = 90, w = 180, n = -90, e = -180;
      for (const p of pts) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); }
      const dLat = 300 / 111320, dLon = 300 / (111320 * Math.cos(((s + n) / 2) * Math.PI / 180));
      return [s - dLat, w - dLon, n + dLat, e + dLon];
    }
    const b = map.getBounds();
    return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
  }
  function setChips(boxId, val) { $(boxId).querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === val))); }
  function updateOffEstimate() {
    offBounds = currentOffBounds();
    const go = $('offGo'), est = $('offEst');
    if (!offBounds) { $('offAreaInfo').textContent = 'This project has no poles yet.'; est.textContent = ''; go.disabled = true; return; }
    $('offAreaInfo').textContent = areaSize(offBounds) + (offArea === 'poles' ? ' (poles + 300 m)' : '');
    const zmax = +$('offZoom').value, per = tilesFor(offBounds, zmax).length, srcs = srcsOf(offSrc);
    const total = per * srcs.length, mb = srcs.reduce((s, x) => s + per * AVG_KB[x], 0) / 1024;
    if (total > OFF_LIMIT) {
      est.className = 'hint est-bad';
      est.textContent = `${total.toLocaleString()} tiles — too large for one download (limit ${OFF_LIMIT.toLocaleString()}). Zoom the map in to a smaller area, lower the detail, or pick one map type.`;
      go.disabled = true;
    } else {
      est.className = 'hint';
      est.textContent = `About ${total.toLocaleString()} tiles · ~${mb < 1 ? mb.toFixed(1) : Math.round(mb)} MB`;
      go.disabled = false;
    }
  }
  function drawAreas() {
    areaLayer.clearLayers();
    for (const ar of (S.areas || []).filter((x) => x.project === S.project)) {
      L.rectangle([[ar.b[0], ar.b[1]], [ar.b[2], ar.b[3]]], { color: '#1c7ed6', weight: 1.5, dashArray: '6 6', fill: false, interactive: false }).addTo(areaLayer);
    }
  }
  async function renderOffline() {
    const list = $('offList'), mine = (S.areas || []).filter((x) => x.project === S.project);
    $('offListTitle').textContent = `Saved areas · ${S.project}`;
    $('offName').value = `${S.project} – area ${mine.length + 1}`;
    $('offAreaChips').querySelector('[data-v="poles"]').disabled = !projPoints().length;
    if (offArea === 'poles' && !projPoints().length) offArea = 'view';
    setChips('offAreaChips', offArea); setChips('offSrcChips', offSrc);
    list.innerHTML = '';
    if (!mine.length) list.innerHTML = '<p class="hint" style="margin:0">No offline maps for this project yet. Blue dashed boxes on the map show saved areas.</p>';
    for (const ar of mine) {
      const row = document.createElement('div'); row.className = 'area-card';
      const d = document.createElement('div');
      const t = document.createElement('span'); t.className = 't'; t.textContent = ar.name;
      const s = document.createElement('span'); s.className = 's';
      s.textContent = `${ar.srcs.map((x) => (x === 'street' ? 'Street' : 'Satellite')).join(' + ')} · zoom ${Z_MIN}–${ar.zmax} · ${ar.ok.toLocaleString()} tiles${ar.missing ? ` (${ar.missing} missing)` : ''}${ar.partial ? ' · stopped early' : ''} · ${fmtTime(ar.at)}`;
      d.append(t, s);
      const show = document.createElement('button'); show.className = 'btn'; show.type = 'button'; show.textContent = 'Show';
      show.addEventListener('click', async () => { await closeSheet(); map.fitBounds([[ar.b[0], ar.b[1]], [ar.b[2], ar.b[3]]]); });
      const del = document.createElement('button'); del.className = 'btn danger'; del.type = 'button'; del.textContent = 'Delete';
      del.addEventListener('click', () => {
        if (del.dataset.armed) { guard(async () => { busy('Deleting map area…'); await deleteArea(ar.id); drawAreas(); renderOffline(); toast('Map area deleted'); }); }
        else { del.dataset.armed = '1'; del.textContent = 'Confirm'; setTimeout(() => { delete del.dataset.armed; del.textContent = 'Delete'; }, 4000); }
      });
      row.append(d, show, del); list.appendChild(row);
    }
    try { const n = await dbCount('tiles'); $('offTotal').textContent = `${n.toLocaleString()} tiles stored on this phone (all projects, including tiles kept while browsing).`; } catch (e) { /* ignore */ }
    updateOffEstimate();
  }
  /** Remove an area and the tiles that no other saved area still needs. */
  async function deleteArea(id) {
    const ar = (S.areas || []).find((x) => x.id === id); if (!ar) return;
    S.areas = S.areas.filter((x) => x.id !== id); persist();
    const keep = new Set();
    for (const o of S.areas) for (const src of o.srcs) for (const [z, x, y] of tilesFor(o.b, o.zmax)) keep.add(`${src}/${z}/${x}/${y}`);
    const keys = [];
    for (const src of ar.srcs) for (const [z, x, y] of tilesFor(ar.b, ar.zmax)) { const k = `${src}/${z}/${x}/${y}`; if (!keep.has(k)) keys.push(k); }
    await dbDelMany('tiles', keys);
  }
  $('offlineBtn').addEventListener('click', () => { renderOffline(); openSheet('offline'); });
  $('offAreaChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c || c.disabled) return; offArea = c.dataset.v; setChips('offAreaChips', offArea); updateOffEstimate(); });
  $('offSrcChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; offSrc = c.dataset.v; setChips('offSrcChips', offSrc); updateOffEstimate(); });
  $('offZoom').addEventListener('change', updateOffEstimate);
  $('offGo').addEventListener('click', () => guard(async () => {
    if (!navigator.onLine) { toast('Connect to the internet to download maps'); return; }
    updateOffEstimate(); if ($('offGo').disabled || !offBounds) return;
    const zmax = +$('offZoom').value, srcs = srcsOf(offSrc), b = offBounds.slice();
    const queue = [];
    for (const src of srcs) for (const t of tilesFor(b, zmax)) queue.push([src, ...t]);
    const total = queue.length; let done = 0, missing = 0;
    cancelFlag = false; busy(`Downloading map 0 / ${total}`, 0, true);
    const worker = async () => {
      while (queue.length && !cancelFlag) {
        const [src, z, x, y] = queue.shift();
        if (!(await fetchTile(src, z, x, y))) missing++;
        done++; if (done % 4 === 0 || done === total) busy(`Downloading map ${done.toLocaleString()} / ${total.toLocaleString()}`, done / total, true);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    const partial = cancelFlag; cancelFlag = false;
    if (done > 0) {
      S.areas = (S.areas || []).concat({ id: uid(), project: S.project, name: $('offName').value.trim() || `${S.project} – area`,
        b, zmax, srcs, ok: done - missing, missing, partial, at: new Date().toISOString() });
      persist();
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    drawAreas(); await renderOffline();
    toast(partial ? `Stopped — ${done - missing} tiles saved` : missing ? `Saved with ${missing} tiles missing (try again to fill gaps)` : `Map saved — ${done.toLocaleString()} tiles ready for offline use`, 4500);
  }));
  $('clearTiles').addEventListener('click', () => {
    const b = $('clearTiles');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to delete all saved maps'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'Delete all saved maps'; }, 4000); return; }
    guard(async () => { await dbClear('tiles'); S.areas = []; persist(); drawAreas(); await renderOffline(); toast('All saved maps deleted'); });
  });

  /* ================= start ================= */
  $('captureBtn').addEventListener('click', () => openCamera('new'));
  (async () => {
    try { points = await dbAll('points'); } catch (e) { toast('Storage unavailable: ' + e.message, 6000); }
    if (!S.projects.includes(S.project)) S.projects.push(S.project);
    renderPoles(); drawAreas();
    if (!S.view) fitProject();
    startGps();
  })();
  // Files handed to other apps through Share are temporary: clear them each time the APK starts.
  if (NATIVE) nativeCall('Filesystem', 'rmdir', { path: 'share', directory: 'CACHE', recursive: true }).catch(() => {});
  // The APK already carries every file, so the offline cache is only for the website version.
  if (!NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__polecam = { get points() { return points; }, get S() { return S; }, openEditor, exportPhoto, tilesFor, closeDb: async () => (await idb()).close(), nativeWrite, grabGuideCrop, prepForOcr, ocrRun }; // for testing
})();
