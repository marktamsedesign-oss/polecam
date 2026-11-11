/**
 * G-eSAA Mailbox, version 1.1 (November 2026: setup says why when Google refuses)
 *
 * A private file mailbox in YOUR Google Drive. The G-eSAA app uses it to pass survey files between the
 * coordinator and the field partners of one contractor. Everything lives in one Drive folder,
 * "G-eSAA mailbox". The script can only see the files it makes itself; the rest of your Drive is out of its reach.
 *
 * SET UP (coordinator, on a computer, about 5 minutes)
 *  1. Make a copy: open the mailbox script link shown in G-eSAA (it opens view only, with no Deploy button).
 *     On the left click Overview (the i icon), then Make a copy (two-pages icon, top right).
 *     From here on, work in YOUR copy ("Copy of ..."): it has Deploy at the top right.
 *  2. At the top of the editor, pick the function "setup" and press Run.
 *  3. Google asks for permission. Choose your account. It lists exactly two permissions; allow both:
 *       - See, edit, create and delete only the specific Google Drive files you use with this app
 *       - Connect to an external service
 *     If Google says it "hasn't verified this app", choose Advanced > Go to ... (it is your own copy).
 *     The log then says "Mailbox ready".
 *  4. Deploy > New deployment > Select type (gear icon) > Web app.
 *       Execute as: Me        Who has access: Anyone        > Deploy.
 *  5. Copy the Web app URL (it ends in /exec).
 *  6. In G-eSAA open Team mailbox and paste the URL. The app sets the team key; nothing else to do here.
 *
 * LATER
 *  - Changed this script? Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy,
 *    so the /exec URL stays the same.
 *  - Lost the team key or want a new one? Run resetKey, then connect again from G-eSAA right away.
 *  - Files are deleted for good once picked up. Anything not picked up within 7 days is removed.
 *
 * IF SETUP STOPS ("Error: drive")
 *  The log line above the error says why, in plain words. Most often appsscript.json was not replaced, so the
 *  script never asked for the Drive permission: Project Settings (gear) > tick Show "appsscript.json" manifest
 *  file in editor; open appsscript.json, replace all of it with the one from the zip, Save; run setup again and
 *  allow BOTH permissions. If it says the Drive API is turned off: on the left, Services (+) > Drive API (v3) > Add,
 *  then run setup again.
 *
 * Only these Google services are used: the Drive API (through UrlFetchApp with this script's own sign-in),
 * script properties and the script lock. No DriveApp (it needs access to your whole Drive), no triggers, no email.
 * appsscript.json lists the Drive advanced service only so that Google turns the Drive API on for this script's
 * Cloud project; the code does not use it, and the permissions stay the two listed there.
 */

const APP = 'G-eSAA mailbox';
const VERSION = 1;
const FOLDER_NAME = 'G-eSAA mailbox';
const PROGRESS_NAME = '_progress';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const ABOUT = 'https://www.googleapis.com/drive/v3/about?fields=storageQuota';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const LIST_FIELDS = 'nextPageToken,files(id,name,size,createdTime,parents)';

const MB = 1024 * 1024;
const LIMIT = {
  call: 50 * MB,        // bytes in one put piece or one get range: Apps Script moves at most about 50 MB per call
  whole: 2048 * MB,     // one direct upload; those bytes go phone > Google and never pass through this script
  pieces: 999,          // <tid>.p001 ... <tid>.p999
  meta: 8 * 1024,       // the phone's meta object, as JSON (UTF-8 bytes)
  progress: 64 * 1024,  // one progress JSON (UTF-8 bytes)
  tids: 100,            // tids in one status call
  list: 50,             // manifests in one list answer (the rest follow once these are picked)
};

const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const CLEAN_EVERY = 6 * HOUR;
const KEEP_TRANSFER = 7 * DAY;  // a complete transfer nobody picked up
const KEEP_ORPHAN = 2 * DAY;    // pieces or whole files that never got a manifest
const KEEP_STATUS = 30 * DAY;   // 's.<tid>' records
const CLEAN_MAX_DELETES = 200;  // bounded work per clean-up; the next call carries on
const CLEAN_MAX_PAGES = 5;

// Script properties. Also 'b.<box>' = that box's folder id, and 's.<tid>' = '<state>|<ISO time>'.
const P_ROOT = 'folder.root', P_PROGRESS = 'folder.progress', P_KEY = 'key.hash', P_CLEAN = 'clean.last';

let CALLS = 0;       // UrlFetch calls made by this request, reported as g
let LOCKED = false;  // this request holds the script lock (so nested helpers do not wait on themselves)

// ---------------------------------------------------------------------------------------------------------
// Run from the editor

/** Makes the mailbox folder and asks for the two permissions. Safe to run again. */
function setup() {
  CALLS = 0;
  let root;
  try {
    root = rootId_(true);
    progressId_(true);
  } catch (e) {
    Logger.log('Stopped: ' + String((e && e.detail) || (e && e.message) || e));
    Logger.log(setupWhy_(e));
    throw e;
  }
  Logger.log('Mailbox ready: your Drive folder "' + FOLDER_NAME + '" (' + root + ').');
  Logger.log('Next: Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Deploy, then copy ' +
    'the Web app URL (ends in /exec) into G-eSAA > Team mailbox.');
  if (props_().getProperty(P_KEY)) {
    Logger.log('This mailbox already has a team key. If this is a fresh copy, run resetKey before connecting G-eSAA.');
  }
}

/** What to do when setup cannot make the folder, in plain words (Google's own answer is logged above it). */
function setupWhy_(e) {
  const d = String((e && e.detail) || (e && e.message) || '');
  let scopes = '';
  try { // which permissions this script really has: tells a missing appsscript.json apart from the rest
    const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(ScriptApp.getOAuthToken()), { muteHttpExceptions: true });
    scopes = String(JSON.parse(r.getContentText()).scope || '');
  } catch (x) {
    scopes = '';
  }
  if ((scopes && scopes.indexOf('auth/drive.file') < 0) || /insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(d)) {
    return 'The Drive permission is missing: appsscript.json was not replaced. Project Settings (gear) > tick Show "appsscript.json" ' +
      'manifest file in editor; open appsscript.json, replace all of it with the one from the zip, Save; run setup again and allow BOTH permissions.';
  }
  if (/accessNotConfigured|has not been used in project|SERVICE_DISABLED|is disabled/i.test(d)) {
    return 'The Google Drive API is turned off for this script\'s Google Cloud project. In the editor, on the left: Services (+) > ' +
      'Drive API (v3) > Add. Then run setup again. It asks for no new permission.';
  }
  if (/domain|administrator|admin policy|appNotAuthorized|disabled by/i.test(d)) {
    return 'Your Google Workspace administrator blocks this script from using Drive. Ask the administrator to allow Apps Script ' +
      'and Drive for this account, or use the company\'s mailbox account.';
  }
  if (e && e.http === 401) return 'Google did not accept the sign-in. Run setup again and allow both permissions.';
  return 'Send this log to whoever set up G-eSAA for your company.';
}

/** Forgets the team key so the coordinator can connect again with a new one. Files stay. */
function resetKey() {
  withLock_(function () { props_().deleteProperty(P_KEY); });
  Logger.log('Team key cleared. Connect again from G-eSAA > Team mailbox now: the first phone to connect sets the new key.');
}

// ---------------------------------------------------------------------------------------------------------
// Web app

/** Opening the /exec URL in a browser shows that the mailbox is there. No secrets. */
function doGet() {
  const out = { ok: true, app: APP, v: VERSION, claimed: !!props_().getProperty(P_KEY) };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** The phone sends POST with a JSON body (as text/plain, so the browser makes no CORS preflight). */
function doPost(e) {
  CALLS = 0;
  LOCKED = false;
  let out;
  try {
    let q;
    try {
      q = JSON.parse(e.postData.contents);
    } catch (err) {
      throw fail_('body');
    }
    out = handle_(q);
  } catch (err) {
    out = errorOut_(err);
  }
  out.g = CALLS;
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

const ACTIONS = {
  rekey: actRekey_, session: actSession_, put: actPut_, done: actDone_, list: actList_, get: actGet_,
  picked: actPicked_, status: actStatus_, cancel: actCancel_, progressPut: actProgressPut_,
  progressGet: actProgressGet_, space: actSpace_,
};

/** The action name comes in `action` (as for the online sheet); `a` is accepted too. */
function handle_(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) throw fail_('body');
  const a = q.action !== undefined ? q.action : q.a;
  if (a === 'hello') return actHello_(q);
  if (a === 'claim') return actClaim_(q);
  if (typeof a !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, a)) throw fail_('action');
  checkKey_(q.k);
  return ACTIONS[a](q);
}

// ---------------------------------------------------------------------------------------------------------
// Actions

function actHello_(q) {
  const claimed = !!props_().getProperty(P_KEY);
  rootId_(true); // also remakes the folder if someone deleted it
  const out = { ok: true, app: APP, v: VERSION, claimed: claimed, folder: FOLDER_NAME, limits: LIMIT };
  if (q.k !== undefined) {
    out.keyOk = claimed && keyMatches_(q.k);
    if (out.keyOk) cleanUp_(); // only for the team, so strangers cannot make the script work
  }
  return out;
}

function actClaim_(q) {
  const k = q.k;
  rootId_(false); // in case setup() was skipped; done outside the lock (it may take the lock itself)
  return withLock_(function () {
    const p = props_(), h = p.getProperty(P_KEY);
    if (h) {
      if (keyMatches_(k)) return { ok: true, claimed: true };
      throw fail_('key');
    }
    if (!keyShape_(k)) throw fail_('weak');
    p.setProperty(P_KEY, hash_(k));
    return { ok: true, claimed: true };
  });
}

function actRekey_(q) {
  if (!keyShape_(q.nk)) throw fail_('weak');
  return withLock_(function () {
    checkKey_(q.k); // again inside the lock: another rekey may have just won
    props_().setProperty(P_KEY, hash_(q.nk));
    return { ok: true };
  });
}

/** Opens a resumable upload; the phone then sends the whole file straight to Google at the address it gets back. */
function actSession_(q) {
  const box = box_(q.box), tid = tid_(q.tid);
  const size = int_(q.size, 1, LIMIT.whole, 'size', 'size');
  let origin = null;
  if (has_(q.origin)) {
    origin = String(q.origin);
    if (origin.length > 200 || !/^[a-z][a-z0-9+.-]{0,20}:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(origin)) throw fail_('origin');
  }
  open_(tid);
  const folder = boxId_(box, true);
  const name = tid + '.gesaa';
  const headers = { 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(size) };
  if (origin) headers.Origin = origin; // Google then allows the browser's upload from that page (CORS)
  const r = drive_('post', UPLOAD + '?uploadType=resumable&fields=id,name,size', {
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify({ name: name, parents: [folder], mimeType: 'application/octet-stream' }),
    headers: headers,
  });
  const h = r.getAllHeaders();
  const url = h.Location || h.location;
  if (!url) throw fail_('drive', 'Drive gave no upload address');
  return { ok: true, url: url, name: name };
}

/** One piece through this script (the fallback when the direct upload cannot be used). */
function actPut_(q) {
  const box = box_(q.box), tid = tid_(q.tid);
  const n = int_(q.n, 1, LIMIT.pieces, 'n', 'n');
  const bytes = bytes_(q.data);
  open_(tid);
  const folder = boxId_(box, true);
  const name = tid + '.p' + ('00' + n).slice(-3);
  const f = upload_(folder, name, bytes, 'application/octet-stream');
  return { ok: true, id: f.id, size: bytes.length, name: name };
}

/** Writes the manifest last, so a transfer only shows up in list once all its bytes are in Drive. */
function actDone_(q) {
  const box = box_(q.box), tid = tid_(q.tid);
  const meta = meta_(q.meta);
  const want = has_(q.size) ? int_(q.size, 1, LIMIT.whole, 'size', 'size') : null; // optional: catches a lost last piece
  const st = getStatus_(tid);
  if (st && st.s !== 'waiting') throw fail_('closed');
  const folder = boxId_(box, false);
  if (!folder) throw fail_('parts');
  const files = tidFiles_(folder, tid);
  const old = files.filter(function (f) { return f.name === tid + '.json'; })[0];
  if (old) {
    // The phone did not get our first answer and asked again: same manifest, no second copy.
    return { ok: true, manifest: JSON.parse(drive_('get', API + '/' + old.id + '?alt=media').getContentText()), again: true };
  }
  const pick = pickParts_(files, tid, want);
  if (pick.error) throw fail_('parts', pick.error);
  let size = 0;
  const parts = pick.parts.map(function (f) {
    size += Number(f.size);
    return { id: f.id, name: f.name, size: Number(f.size) };
  });
  const manifest = { tid: tid, box: box, created: iso_(now_()), meta: meta, parts: parts, size: size };
  upload_(folder, tid + '.json', textBytes_(asciiJson_(manifest)), 'application/json');
  setStatus_(tid, 'waiting');
  return { ok: true, manifest: manifest };
}

function actList_(q) {
  const box = box_(q.box);
  cleanUp_();
  const folder = boxId_(box, false);
  if (!folder) return { ok: true, items: [] };
  const all = props_().getProperties(), cutoff = now_() - KEEP_TRANSFER, seen = {};
  const manifests = listFolder_(folder).filter(function (f) {
    const n = parseName_(f.name);
    if (!n || n.kind !== 'manifest' || seen[n.tid]) return false;
    const st = parseStatus_(all['s.' + n.tid]);
    if (st && st.s !== 'waiting') return false;            // picked / cancelled / expired, files not cleared yet
    if (Date.parse(f.createdTime) <= cutoff) return false; // expired, clean-up has not reached it yet
    seen[n.tid] = true;
    return true;
  });
  const items = [];
  manifests.slice(0, LIMIT.list).forEach(function (f) {
    let text;
    try {
      text = drive_('get', API + '/' + f.id + '?alt=media').getContentText();
    } catch (e) {
      if (e && e.http === 404) return; // picked or cancelled a moment ago
      throw e;
    }
    try {
      items.push(JSON.parse(text));
    } catch (e) {
      // a damaged manifest is skipped; clean-up removes it with its transfer after 7 days
    }
  });
  items.sort(function (a, b) { return a.created < b.created ? -1 : a.created > b.created ? 1 : (a.tid < b.tid ? -1 : 1); });
  const out = { ok: true, items: items };
  if (manifests.length > LIMIT.list) out.more = true;
  return out;
}

function actGet_(q) {
  const id = typeof q.id === 'string' ? q.id : '';
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw fail_('id');
  const f = JSON.parse(drive_('get', API + '/' + id + '?fields=id,name,size,mimeType,parents,trashed').getContentText());
  // Only files in the mailbox's own subfolders, never a folder: the key opens the mailbox, not the rest of Drive.
  if (f.trashed || f.mimeType === FOLDER_MIME || !inTree_(f.parents || [])) throw fail_('id', 'not in the mailbox');
  const size = Number(f.size || 0);
  let range = null;
  if (has_(q.start) || has_(q.end)) {
    const start = has_(q.start) ? int_(q.start, 0, Number.MAX_SAFE_INTEGER, 'range', 'range') : 0;
    let end = has_(q.end) ? int_(q.end, start, Number.MAX_SAFE_INTEGER, 'range', 'range') : start + LIMIT.call - 1;
    if (start >= size) throw fail_('range');
    end = Math.min(end, size - 1);
    if (end - start + 1 > LIMIT.call) throw fail_('size', 'range over 50 MB');
    range = { start: start, end: end };
  } else if (size > LIMIT.call) {
    throw fail_('size', 'file over 50 MB: ask in ranges'); // ranges of at most 50 MB
  }
  const r = drive_('get', API + '/' + id + '?alt=media', range ? { headers: { Range: 'bytes=' + range.start + '-' + range.end } } : null);
  const out = { ok: true, data: Utilities.base64Encode(r.getContent()), size: size };
  if (range) { out.start = range.start; out.end = range.end; }
  return out;
}

/** The receiver has the file: delete every file of the transfer for good (not to the trash). */
function actPicked_(q) {
  const box = box_(q.box), tid = tid_(q.tid);
  const folder = boxId_(box, false);
  const r = folder ? removeTid_(folder, tid) : { deleted: 0, failed: 0 };
  setStatus_(tid, 'picked');
  const out = { ok: true, deleted: r.deleted };
  if (r.failed) out.failed = r.failed;
  return out;
}

function actStatus_(q) {
  if (!Array.isArray(q.tids) || q.tids.length > LIMIT.tids) throw fail_('tids');
  const tids = q.tids.map(tid_);
  cleanUp_();
  const all = props_().getProperties(), now = now_(), status = {}, at = {};
  tids.forEach(function (tid) {
    const st = parseStatus_(all['s.' + tid]);
    if (!st) {
      status[tid] = 'unknown';
    } else if (st.s === 'waiting' && now - Date.parse(st.at) > KEEP_TRANSFER) {
      status[tid] = 'expired'; // clean-up has not reached it yet
      at[tid] = iso_(Date.parse(st.at) + KEEP_TRANSFER);
    } else {
      status[tid] = st.s;
      at[tid] = st.at;
    }
  });
  return { ok: true, status: status, at: at };
}

/** The sender takes back a transfer nobody has picked up yet. */
function actCancel_(q) {
  const box = box_(q.box), tid = tid_(q.tid);
  const st = getStatus_(tid);
  if (st && st.s === 'picked') throw fail_('picked');
  const folder = boxId_(box, false);
  const r = folder ? removeTid_(folder, tid) : { deleted: 0, failed: 0 };
  setStatus_(tid, 'cancelled');
  const out = { ok: true, deleted: r.deleted };
  if (r.failed) out.failed = r.failed;
  return out;
}

/** Replaces _progress/<project>__<who>.json: the new file is written first, then the old ones go. */
function actProgressPut_(q) {
  const project = project_(q.project), who = emailish_(q.who, 'who');
  if (q.json === undefined || q.json === null) throw fail_('json');
  const text = typeof q.json === 'string' ? q.json : JSON.stringify(q.json);
  let parsed, len;
  try {
    len = utf8Len_(text);
  } catch (e) {
    throw fail_('json');
  }
  if (len > LIMIT.progress) throw fail_('json', 'over 64 KB');
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw fail_('json');
  }
  const folder = progressId_(true);
  const name = project + '__' + who + '.json';
  const old = query_("'" + q_(folder) + "' in parents and trashed=false and name='" + q_(name) + "'").files;
  upload_(folder, name, textBytes_(asciiJson_(parsed)), 'application/json');
  deleteFiles_(old);
  return { ok: true };
}

function actProgressGet_(q) {
  const project = project_(q.project);
  const folder = progressId_(false);
  if (!folder) return { ok: true, items: [] };
  const pre = project + '__', newest = {};
  listFolder_(folder).forEach(function (f) {
    if (f.name.indexOf(pre) !== 0 || f.name.slice(-5) !== '.json') return;
    const who = f.name.slice(pre.length, -5);
    if (who && (!newest[who] || f.createdTime > newest[who].createdTime)) newest[who] = f; // newest wins mid-replace
  });
  const items = [];
  Object.keys(newest).sort().slice(0, 200).forEach(function (who) {
    const f = newest[who];
    try {
      items.push({ who: who, json: drive_('get', API + '/' + f.id + '?alt=media').getContentText(), updated: f.createdTime });
    } catch (e) {
      if (!e || e.http !== 404) throw e; // replaced a moment ago
    }
  });
  return { ok: true, items: items };
}

/** How full the Drive of the deploying account is (Drive, Gmail and Photos share it). */
function actSpace_() {
  const s = JSON.parse(drive_('get', ABOUT).getContentText()).storageQuota || {};
  return {
    ok: true,
    limit: s.limit ? Number(s.limit) : null, // null = no limit (some Workspace accounts)
    usage: Number(s.usage || 0),
    inDrive: Number(s.usageInDrive || 0),
    inTrash: Number(s.usageInDriveTrash || 0),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Lazy clean-up (no trigger: it runs at the start of hello / list / status, at most every 6 hours)

function cleanUp_() {
  const p = props_(), now = now_();
  if (now - Number(p.getProperty(P_CLEAN) || 0) < CLEAN_EVERY) return;
  withLock_(function () {
    if (now - Number(p.getProperty(P_CLEAN) || 0) < CLEAN_EVERY) return; // another request just did it
    let finished = true;
    try {
      finished = sweep_(now);
    } catch (e) {
      // a Drive hiccup: try again next round rather than on every call
    }
    dropOldStatus_(now, KEEP_STATUS);
    if (finished) p.setProperty(P_CLEAN, String(now));
  }, 1000, true); // if another request is busy (cleaning or claiming), skip: the answer matters more
}

/** One bounded pass over files older than 2 days. Returns false when the delete budget ran out (more to do). */
function sweep_(now) {
  const all = props_().getProperties(), boxes = {};
  Object.keys(all).forEach(function (k) { if (k.indexOf('b.') === 0) boxes[all[k]] = true; });
  const old = query_("trashed=false and mimeType!='" + FOLDER_MIME + "' and createdTime<'" + rfc_(now - KEEP_ORPHAN) + "'",
    CLEAN_MAX_PAGES).files;
  const groups = {}, order = [];
  old.forEach(function (f) {
    const box = (f.parents || []).filter(function (id) { return boxes[id]; })[0];
    if (!box) return; // _progress files and anything outside the boxes are left alone
    const n = parseName_(f.name);
    const key = box + '/' + (n ? n.tid : '#' + f.id);
    if (!groups[key]) { groups[key] = { tid: n ? n.tid : null, files: [], manifest: null }; order.push(key); }
    const g = groups[key];
    if (n && n.kind === 'manifest') { if (!g.manifest) g.manifest = f; g.files.unshift(f); } // manifest goes first
    else g.files.push(f);
  });
  let budget = CLEAN_MAX_DELETES;
  for (let i = 0; i < order.length; i++) {
    const g = groups[order[i]];
    const st = g.tid ? parseStatus_(all['s.' + g.tid]) : null;
    const waiting = !!st && st.s === 'waiting';
    let doomed = false, mark = null;
    if (st && !waiting) {
      doomed = true;                                   // leftovers of a picked / cancelled / expired transfer
    } else if ((g.manifest && now - Date.parse(g.manifest.createdTime) > KEEP_TRANSFER) ||
               (waiting && now - Date.parse(st.at) > KEEP_TRANSFER)) {
      doomed = true; mark = 'expired';                 // complete but nobody picked it up in 7 days
    } else if (!g.manifest && !waiting) {
      doomed = true;                                   // never completed (no manifest) and over 2 days old
    }
    if (!doomed) continue;
    if (budget <= 0) return false;
    const files = g.files.slice(0, budget);
    budget -= files.length;
    deleteFiles_(files);
    if (mark) setStatus_(g.tid, mark);
    if (files.length < g.files.length) return false;
  }
  return true;
}

function dropOldStatus_(now, age) {
  const p = props_(), all = p.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('s.') !== 0) return;
    const st = parseStatus_(all[k]);
    const t = st ? Date.parse(st.at) : NaN;
    if (!(t > now - age)) p.deleteProperty(k); // also drops unreadable values
  });
}

// ---------------------------------------------------------------------------------------------------------
// Transfers

/** Every file of one transfer in a box. Lists the folder and matches names exactly, so a tid that is the
 *  start of another tid never catches the other's files. */
function tidFiles_(folder, tid) {
  return listFolder_(folder).filter(function (f) {
    const n = parseName_(f.name);
    return n && n.tid === tid;
  });
}

function removeTid_(folder, tid) {
  const files = tidFiles_(folder, tid);
  // Manifest first: if a delete fails half-way, the transfer is already gone from list.
  files.sort(function (a, b) { return (b.name === tid + '.json') - (a.name === tid + '.json'); });
  return deleteFiles_(files);
}

/** The whole file if there is one of the right size, else pieces p001..pNNN with no gap. {parts} or {error: why}. */
function pickParts_(files, tid, want) {
  const wholes = [], pieces = {};
  files.forEach(function (f) {
    const n = parseName_(f.name);
    if (!n || n.tid !== tid) return;
    if (n.kind === 'whole') wholes.push(f);
    if (n.kind === 'piece' && !pieces[n.n]) pieces[n.n] = f; // a piece sent twice: the first copy is as good
  });
  for (let i = 0; i < wholes.length; i++) {
    if (want === null || Number(wholes[i].size) === want) return { parts: [wholes[i]] };
  }
  const ns = Object.keys(pieces).map(Number).sort(function (a, b) { return a - b; });
  if (!ns.length) return { error: wholes.length ? 'size differs' : 'no parts' };
  if (ns[ns.length - 1] !== ns.length) return { error: 'a piece is missing' }; // a gap: some piece never arrived
  const parts = ns.map(function (n) { return pieces[n]; });
  const total = parts.reduce(function (s, f) { return s + Number(f.size); }, 0);
  if (want !== null && total !== want) return { error: 'size differs' };
  return { parts: parts };
}

/** <tid>.gesaa (whole), <tid>.pNNN (piece), <tid>.json (manifest); anything else is null. */
function parseName_(name) {
  const m = /^([A-Za-z0-9_-]{8,40})\.(gesaa|json|p(\d{3}))$/.exec(String(name));
  if (!m) return null;
  if (m[2] === 'gesaa') return { tid: m[1], kind: 'whole' };
  if (m[2] === 'json') return { tid: m[1], kind: 'manifest' };
  return { tid: m[1], kind: 'piece', n: Number(m[3]) };
}

/** A tid that already has a status (waiting, picked, cancelled, expired) takes no more bytes. */
function open_(tid) {
  if (getStatus_(tid)) throw fail_('closed');
}

function getStatus_(tid) {
  return parseStatus_(props_().getProperty('s.' + tid));
}

function parseStatus_(v) {
  if (!v) return null;
  const i = String(v).indexOf('|');
  return i < 0 ? null : { s: v.slice(0, i), at: v.slice(i + 1) };
}

function setStatus_(tid, s) {
  const p = props_(), v = s + '|' + iso_(now_());
  try {
    p.setProperty('s.' + tid, v);
  } catch (e) {
    // The property store is full (500 KB): drop week-old records and try once more. Status is a courtesy;
    // the files are what matter, so a failure here must not fail the call.
    try {
      dropOldStatus_(now_(), KEEP_TRANSFER);
      p.setProperty('s.' + tid, v);
    } catch (e2) {
      // give up quietly
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Folders (ids cached in script properties, so most calls make no Drive call to find them)

function rootId_(verify) {
  const p = props_();
  const id = p.getProperty(P_ROOT);
  if (id && !verify) return id;
  if (id) {
    try {
      const f = JSON.parse(drive_('get', API + '/' + id + '?fields=id,trashed').getContentText());
      if (!f.trashed) return id;
    } catch (e) {
      if (!e || e.http !== 404) throw e; // only "not found" means it is gone; a hiccup must not make a second folder
    }
  }
  return withLock_(function () {
    const now = p.getProperty(P_ROOT);
    if (now && now !== id) return now; // another request just made it
    // Gone or never made: forget the subfolders that lived inside it.
    const all = p.getProperties();
    Object.keys(all).forEach(function (k) { if (k === P_PROGRESS || k.indexOf('b.') === 0) p.deleteProperty(k); });
    const nid = createFolder_(FOLDER_NAME, null);
    p.setProperty(P_ROOT, nid);
    return nid;
  });
}

function progressId_(create) {
  return childFolder_(P_PROGRESS, PROGRESS_NAME, create);
}

/** A box folder is made the first time something is sent to it. */
function boxId_(box, create) {
  return childFolder_('b.' + box, box, create);
}

function childFolder_(prop, name, create) {
  const p = props_();
  const id = p.getProperty(prop);
  if (id) return id;
  const root = rootId_(false);
  const found = findFolder_(root, name); // the property may have been lost while the folder stayed
  if (found) { p.setProperty(prop, found); return found; }
  if (!create) return null;
  return withLock_(function () {
    const again = p.getProperty(prop); // two phones sending to a new box at once make one folder, not two
    if (again) return again;
    const nid = createFolder_(name, root);
    p.setProperty(prop, nid);
    return nid;
  });
}

function findFolder_(parent, name) {
  const files = query_("'" + q_(parent) + "' in parents and trashed=false and mimeType='" + FOLDER_MIME +
    "' and name='" + q_(name) + "'", 1).files;
  return files.length ? files[0].id : null;
}

function createFolder_(name, parent) {
  const meta = { name: name, mimeType: FOLDER_MIME };
  if (parent) meta.parents = [parent];
  return JSON.parse(drive_('post', API + '?fields=id', {
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify(meta),
  }).getContentText()).id;
}

/** Is one of these parents a mailbox subfolder? Cached ids first; an unknown folder costs one Drive call. */
function inTree_(parents) {
  const p = props_(), all = p.getProperties(), root = all[P_ROOT], known = {};
  if (!root) return false;
  Object.keys(all).forEach(function (k) { if (k === P_PROGRESS || k.indexOf('b.') === 0) known[all[k]] = true; });
  for (let i = 0; i < parents.length; i++) {
    if (known[parents[i]]) return true;
  }
  for (let i = 0; i < parents.length; i++) {
    const pid = String(parents[i]);
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(pid)) continue;
    let f;
    try {
      f = JSON.parse(drive_('get', API + '/' + pid + '?fields=id,name,mimeType,parents,trashed').getContentText());
    } catch (e) {
      if (e && e.http === 404) continue;
      throw e;
    }
    if (f.mimeType !== FOLDER_MIME || f.trashed || (f.parents || []).indexOf(root) < 0) continue;
    const prop = f.name === PROGRESS_NAME ? P_PROGRESS : 'b.' + f.name;
    if (!all[prop]) p.setProperty(prop, f.id); // remember it, but never replace a folder we already know
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------
// Drive REST v3

/** One Drive API call with this script's own sign-in. Any answer other than 2xx becomes an error. */
function drive_(method, url, opts) {
  const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  if (opts && opts.headers) Object.keys(opts.headers).forEach(function (k) { headers[k] = opts.headers[k]; });
  const o = { method: method, muteHttpExceptions: true, headers: headers };
  if (opts && opts.contentType) o.contentType = opts.contentType;
  if (opts && opts.payload !== undefined) o.payload = opts.payload;
  CALLS++;
  let r;
  try {
    r = UrlFetchApp.fetch(url, o);
  } catch (e) {
    throw fail_('drive', String((e && e.message) || e)); // network, timeout or Apps Script quota
  }
  const code = r.getResponseCode();
  if (code >= 200 && code < 300) return r;
  const text = String(r.getContentText() || '').slice(0, 300);
  const kind = code === 404 ? 'gone'
    : /storageQuotaExceeded/.test(text) ? 'full'
    : code === 429 || /rateLimitExceeded/i.test(text) ? 'rate'
    : 'drive';
  const err = fail_(kind, 'Drive ' + method.toUpperCase() + ' ' + code + ': ' + text);
  err.http = code;
  throw err;
}

/** files.list, oldest first, following pages up to maxPages. */
function query_(qs, maxPages) {
  const files = [];
  let token = '';
  for (let page = 0; page < (maxPages || 5); page++) {
    const r = JSON.parse(drive_('get', API + '?q=' + encodeURIComponent(qs) + '&orderBy=createdTime&pageSize=1000&fields=' +
      encodeURIComponent(LIST_FIELDS) + (token ? '&pageToken=' + encodeURIComponent(token) : '')).getContentText());
    (r.files || []).forEach(function (f) { files.push(f); });
    token = r.nextPageToken || '';
    if (!token) break;
  }
  return { files: files, more: !!token };
}

function listFolder_(folder) {
  return query_("'" + q_(folder) + "' in parents and trashed=false").files;
}

/** Multipart upload: the file's name and folder, then its bytes, in one call. */
function upload_(parent, name, bytes, mime) {
  const b = 'gesaa' + now_().toString(36) + Math.random().toString(36).slice(2);
  const head = textBytes_('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify({ name: name, parents: [parent], mimeType: mime }) +
    '\r\n--' + b + '\r\nContent-Type: ' + mime + '\r\n\r\n');
  const tail = textBytes_('\r\n--' + b + '--');
  return JSON.parse(drive_('post', UPLOAD + '?uploadType=multipart&fields=id,name,size,createdTime', {
    contentType: 'multipart/related; boundary=' + b,
    payload: head.concat(bytes, tail),
  }).getContentText());
}

/** DELETE removes for good (not to the trash). "Not found" counts as already gone. */
function deleteFiles_(files) {
  let deleted = 0, failed = 0;
  files.forEach(function (f) {
    try {
      drive_('delete', API + '/' + f.id);
      deleted++;
    } catch (e) {
      if (!e || e.http !== 404) failed++;
    }
  });
  return { deleted: deleted, failed: failed };
}

/** A value inside a Drive query string: backslash and single quote must be escaped. */
function q_(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ---------------------------------------------------------------------------------------------------------
// Input checks (everything from the phone is checked before it reaches Drive or the properties)

function checkKey_(k) {
  if (!props_().getProperty(P_KEY)) throw fail_('unclaimed');
  if (!keyMatches_(k)) throw fail_('key');
}

function keyMatches_(k) {
  const h = props_().getProperty(P_KEY);
  return !!h && typeof k === 'string' && k.length > 0 && k.length <= 256 && hash_(k) === h;
}

/** A team key: 24 to 128 characters (G-eSAA makes a random one). */
function keyShape_(k) {
  return typeof k === 'string' && k.length >= 24 && k.length <= 128;
}

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

/** A box is a phone's email: lower-case, only [a-z0-9._@-], 3 to 120 characters, not starting with . or _
 *  (so it can never be "_progress"). */
function box_(v) {
  return emailish_(v, 'box');
}

function emailish_(v, code) {
  if (typeof v !== 'string' || v.length > 200) throw fail_(code);
  const s = v.trim().toLowerCase().replace(/[^a-z0-9._@-]/g, '');
  if (s.length < 3 || s.length > 120 || /^[._]/.test(s)) throw fail_(code);
  return s;
}

/** The sending phone makes the transfer id; it is checked, not cleaned, because both phones must agree on it. */
function tid_(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(v)) throw fail_('tid');
  return v;
}

/** Project id for progress file names: [A-Za-z0-9_-], no "__" (it separates project and who), 1 to 60 characters. */
function project_(v) {
  if (typeof v === 'number' && isFinite(v)) v = String(v);
  if (typeof v !== 'string' || v.length > 200) throw fail_('project');
  const s = v.replace(/[^A-Za-z0-9_-]/g, '').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  if (!s || s.length > 60) throw fail_('project');
  return s;
}

function int_(v, min, max, code, overCode) {
  const n = typeof v === 'string' && /^\d{1,16}$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !isFinite(n) || Math.floor(n) !== n || n < min) throw fail_(code);
  if (n > max) throw fail_(overCode);
  return n;
}

function meta_(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw fail_('meta');
  let s, len;
  try {
    s = JSON.stringify(v);
    len = utf8Len_(s);
  } catch (e) {
    throw fail_('meta');
  }
  if (len > LIMIT.meta) throw fail_('meta', 'over 8 KB');
  return JSON.parse(s); // a plain-data copy
}

/** Base64 (standard alphabet, with padding) to bytes; the length is checked before decoding anything. */
function bytes_(data) {
  if (typeof data !== 'string' || !data) throw fail_('data');
  if (data.length > Math.ceil(LIMIT.call / 3) * 4) throw fail_('size', 'piece over 50 MB');
  if (data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw fail_('data');
  let b;
  try {
    b = Utilities.base64Decode(data);
  } catch (e) {
    throw fail_('data');
  }
  if (!b.length) throw fail_('data');
  if (b.length > LIMIT.call) throw fail_('size', 'piece over 50 MB');
  return b;
}

// ---------------------------------------------------------------------------------------------------------
// Small helpers

function props_() {
  return PropertiesService.getScriptProperties();
}

/** Takes the script lock (waits up to waitMs). soft: give up quietly instead of answering 'busy'. */
function withLock_(fn, waitMs, soft) {
  if (LOCKED) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 10000)) {
    if (soft) return undefined;
    throw fail_('busy');
  }
  LOCKED = true;
  try {
    return fn();
  } finally {
    LOCKED = false;
    lock.releaseLock();
  }
}

function fail_(code, detail) {
  const e = new Error(code);
  e.code = code;
  if (detail) e.detail = detail;
  return e;
}

function errorOut_(err) {
  if (err && err.code) {
    const o = { ok: false, error: err.code };
    if (err.detail) o.detail = String(err.detail).slice(0, 200);
    return o;
  }
  return { ok: false, error: 'server', detail: String((err && err.message) || err).slice(0, 200) };
}

function has_(v) {
  return v !== undefined && v !== null && v !== '';
}

function now_() {
  return Date.now();
}

function iso_(ms) {
  return new Date(ms).toISOString();
}

/** Time for a Drive query: RFC 3339, UTC, whole seconds. */
function rfc_(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** JSON with every non-ASCII character escaped, so the stored file reads back the same whatever the charset. */
function asciiJson_(x) {
  return JSON.stringify(x).replace(/[\u007f-￿]/g, function (c) {
    return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

function textBytes_(s) {
  return Utilities.newBlob(s).getBytes();
}

/** UTF-8 length of a string (throws on a broken surrogate pair, which callers treat as bad input). */
function utf8Len_(s) {
  return encodeURIComponent(s).replace(/%[0-9A-F]{2}/g, '_').length;
}
