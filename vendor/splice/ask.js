/* G-eSAA · Splicing details · "Ask & Draw" demo (the page).
   - Made-up sample projects shaped like the app's data: survey records (Site, ODF, Pole, Handhole; closures and dummy NAPs on them)
     and cable RUNs ({ fid, n, size, ex, path: [record ids], len }), like S.meta[project].fibers in app.js.
   - A bridge that turns a project and the user's answers into the engine's model (splice.js): RUNs cut at closures, an ODF record
     within 45 m gives its site's FDU size, homings are sites, dummy NAPs are poles with a Dummy NAP, an existing cable that stops at a
     plain pole "leaves the map" and its homing is named once.
   - The page: the live single line diagram on top (the engine's own drawing, so what you see is what prints), one plain question at
     a time below, tap anything on the drawing to change it, Undo, the A3 sheets and the export (PDF, DXF or both).
   - Sizes: the FDU and cable cards (and the Ready screen's Sizes list) change the project's own records: the ODF record's size, the
     cable RUN's size and fibers per buffer (12 or 6). The demo writes them into its made-up records, so everything reads them from there.
   Answers are kept by record id and cable fid, never by RUN number. Everything here is made up: sites, codes, closure and cable IDs,
   coordinates and names. Plain ES2015 for old Android WebViews and iOS Safari (no ?. or ??, no regex lookbehind). */
(function (root) {
  'use strict';
  var SP = root.Splice;

  /* =====================================================================================================
     MADE-UP PROJECTS
     ===================================================================================================== */
  var LAT0 = 12.4, LON0 = 122.3; /* a made-up spot; positions are given in metres east and north of it */
  function at(r, e, n) { r.lat = +(LAT0 + n / 111320).toFixed(6); r.lon = +(LON0 + e / 108730).toFixed(6); return r; }
  function siteR(id, name, code, st, e, n) { return at({ id: id, element: 'Site', poleId: name + ' / ' + code, status: st, siteKind: 'Tower', boq: {} }, e, n); }
  function odfR(id, size, st, e, n) { return at({ id: id, element: 'ODF', poleId: 'FDU_001', status: st, boq: { odf: size + 'F' } }, e, n); }
  function poleR(id, pid, e, n) { return at({ id: id, element: 'Pole', poleId: pid, status: 'Existing', boq: {} }, e, n); }
  function cloR(id, pid, cid, st, size, e, n) { var r = poleR(id, pid, e, n); r.closure = true; r.closureId = cid; r.boq = { clo: size + 'C', cloSt: st }; return r; }
  function hhR(id, pid, cid, st, size, e, n) { return at({ id: id, element: 'Handhole', poleId: pid, status: st, closure: true, closureId: cid, boq: { clo: size + 'C', cloSt: st } }, e, n); }
  function napR(id, pid, napId, st, e, n) { var r = poleR(id, pid, e, n); r.nap = true; r.napId = napId; r.boq = { napType: 'Dummy NAP', napSt: st }; return r; }
  function runR(fid, n, size, ex, path, len) { return { fid: fid, n: n, size: size, ex: !!ex, path: path, len: len }; }
  var SIGN = [{ name: 'DEMO SURVEYOR', role: 'PREPARED BY' }, { name: 'DEMO CHECKER', role: 'CHECKED BY' }, { name: 'DEMO APPROVER', role: 'APPROVED BY' }];
  function titleOf(n, site) { return { company: '', project: 'DEMO FIBER LINK', planId: 'PLAN-010' + n, site: site, exchange: 'DEMO EXCH', dwgNo: 'SPL-D0' + n, date: '', note: '', sign: SIGN }; }

  var PROJECTS = [
    { id: 'p1', name: 'One homing', about: 'A new site joined to one existing homing, through two new closures and an existing one.', site: 'ACACIA PARK', title: titleOf(1, 'ACACIA PARK'),
      records: [siteR('s1', 'ACACIA PARK', 'DMO101', 'New', 0, 0), odfR('o1', 48, 'New', 14, 18), cloR('c1', 'P-0101', '', 'New', 72, 30, 0), poleR('p2', 'P-0102', 700, 0),
        poleR('p3', 'P-0103', 1400, 0), cloR('c4', 'P-0104', '', 'New', 24, 2030, 0), poleR('p5', 'P-0105', 2600, 0), cloR('c6', 'P-0106', 'CL-0903', 'Existing', 72, 3230, 0),
        poleR('p7', 'P-0107', 3900, 0), siteR('s2', 'BAMBOO RIDGE', 'DMO201', 'Existing', 4630, 0), odfR('o2', 72, 'Existing', 4640, -22),
        siteR('s3', 'DURIAN HEIGHTS', 'DMO401', 'Existing', 2400, 1300), odfR('o3', 72, 'Existing', 2412, 1316)],
      runs: [runR('f101', 1, 72, false, ['s1', 'c1'], 30), runR('f102', 2, 12, false, ['c1', 'p2', 'p3', 'c4', 'p5', 'c6'], 3200), runR('f103', 3, 72, true, ['c6', 'p7', 's2'], 1400)] },
    { id: 'p2', name: 'Two legs, one new build', about: 'A new site on a branch: one leg to a homing that is being built now, one to an existing homing.', site: 'ACACIA PARK', title: titleOf(2, 'ACACIA PARK BRANCH'),
      records: [siteR('s4', 'CEDAR VALE', 'DMO301', 'New', 0, 0), cloR('c1', 'P-0201', '', 'New', 72, 30, 0), poleR('p2', 'P-0202', 700, 0), poleR('p3', 'P-0203', 1400, 0),
        hhR('h4', 'HH-0204', '', 'New', 24, 2030, 0), poleR('p5', 'P-0205', 2600, 0), cloR('c6', 'P-0206', 'CL-0903', 'Existing', 72, 3230, 0), poleR('p7', 'P-0207', 3900, 0),
        siteR('s2', 'BAMBOO RIDGE', 'DMO201', 'Existing', 4630, 0), odfR('o2', 72, 'Existing', 4640, -22), poleR('p8', 'P-0208', 2030, -250),
        siteR('s1', 'ACACIA PARK', 'DMO101', 'New', 2030, -500), odfR('o1', 48, 'New', 2044, -518)],
      runs: [runR('f201', 1, 72, false, ['s4', 'c1'], 30), runR('f202', 2, 12, false, ['c1', 'p2', 'p3', 'h4', 'p5', 'c6'], 3200), runR('f203', 3, 72, true, ['c6', 'p7', 's2'], 1400),
        runR('f204', 4, 72, false, ['h4', 'p8', 's1'], 500)] },
    { id: 'p3', name: 'Branch from an existing cable', about: 'An existing cable between two homings, a new branch from its closure. One homing is tested now, the other later.', site: 'ACACIA PARK', title: titleOf(3, 'ACACIA PARK TAP'),
      records: [siteR('s2', 'BAMBOO RIDGE', 'DMO201', 'Existing', 0, 0), odfR('o2', 72, 'Existing', 10, -20), poleR('p1', 'P-0301', 1200, 0), cloR('c2', 'P-0302', 'CL-0907', 'Existing', 72, 2400, 0),
        poleR('p3', 'P-0303', 3700, 0), siteR('s4', 'CEDAR VALE', 'DMO301', 'Existing', 5000, 0), odfR('o4', 72, 'Existing', 5012, -20), poleR('p4', 'P-0304', 2400, -150),
        siteR('s1', 'ACACIA PARK', 'DMO101', 'New', 2400, -300), odfR('o1', 48, 'New', 2414, -318)],
      runs: [runR('f301', 1, 72, true, ['s2', 'p1', 'c2', 'p3', 's4'], 5000), runR('f302', 2, 72, false, ['c2', 'p4', 's1'], 300)] },
    { id: 'p4', name: 'Two new routes, two homings', about: 'Two new cables from a new site to two closures on one existing cable, a leg to each homing.', site: 'ACACIA PARK', title: titleOf(4, 'ACACIA PARK TWO LEGS'),
      records: [siteR('s2', 'BAMBOO RIDGE', 'DMO201', 'Existing', 0, 0), odfR('o2', 72, 'Existing', 10, -20), poleR('p1', 'P-0401', 1000, 0), cloR('c2', 'P-0402', 'CL-0907', 'Existing', 72, 2000, 0),
        poleR('p3', 'P-0403', 3000, 0), cloR('c4', 'P-0404', 'CL-0908', 'Existing', 72, 4000, 0), poleR('p5', 'P-0405', 5000, 0), siteR('s4', 'CEDAR VALE', 'DMO301', 'Existing', 6000, 0),
        odfR('o4', 72, 'Existing', 6012, -20), siteR('s1', 'ACACIA PARK', 'DMO101', 'New', 3000, -450), odfR('o1', 48, 'New', 3014, -468), poleR('p6', 'P-0406', 2450, -260), poleR('p7', 'P-0407', 3550, -260)],
      runs: [runR('f401', 1, 72, true, ['s2', 'p1', 'c2', 'p3', 'c4', 'p5', 's4'], 6000), runR('f402', 2, 72, false, ['s1', 'p6', 'c2'], 500), runR('f403', 3, 72, false, ['s1', 'p7', 'c4'], 650)] },
    { id: 'p5', name: 'Small cell on a dummy NAP', about: 'A small cell fed from a new closure on an existing cable that leaves the map toward its homing.', site: 'SC-DMO-01', title: titleOf(5, 'SMALL CELL SC-DMO-01'),
      refNames: ['HILLTOP EXCHANGE', 'LAKESIDE EXCHANGE'],
      records: [poleR('p1', 'P-0501', 0, 0), poleR('p2', 'P-0502', 800, 0), poleR('p3', 'P-0503', 1700, 0), cloR('c4', 'P-0504', '', 'New', 24, 2600, 0), poleR('p5', 'P-0505', 2650, -90),
        napR('n6', 'P-0506', 'SC-DMO-01', 'New', 2700, -170)],
      runs: [runR('f501', 1, 72, true, ['p1', 'p2', 'p3', 'c4'], 2600), runR('f502', 2, 12, false, ['c4', 'p5', 'n6'], 180)] }
  ];

  /* =====================================================================================================
     THE BRIDGE: a project (records and RUNs) to the engine's points and cables
     ===================================================================================================== */
  function kindOf(r) {
    var el = r.element || 'Pole', b = r.boq || {};
    if (el === 'Site' || (el === 'ODF' && r._home)) return 'site'; /* (the app: an ODF with no tower site near is a homing itself, an exchange's FDU) */
    if (el === 'ODF') return 'odf';
    if ((el === 'Pole' || el === 'Handhole' || el === 'Manhole' || el === 'Service box') && (r.closure || r.closureId)) return 'closure';
    if (el === 'Pole' && (r.nap || r.napId) && /dummy/i.test(b.napType || '')) return 'dnap';
    return 'pole';
  }
  function hav(a, b) {
    var t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLo = (b.lon - a.lon) * t;
    var s = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  var stOf = function (v) { return /exist/i.test(String(v || '')) ? 'existing' : 'new'; };
  var isEndType = function (t) { return t === 'site' || t === 'dnap'; };
  function splitName(s) { s = String(s || ''); var i = s.indexOf('/'); return i < 0 ? { name: s.trim().toUpperCase(), code: '' } : { name: s.slice(0, i).trim().toUpperCase(), code: s.slice(i + 1).trim().toUpperCase() }; }
  /* a position as the drawings print it: "lat, lon", 6 decimals (the owner); none: '' (the drawing prints TBF) */
  var llTxt = function (r) { return r && r.lat != null && r.lon != null && isFinite(r.lat) && isFinite(r.lon) && !(+r.lat === 0 && +r.lon === 0) ? (+r.lat).toFixed(6) + ', ' + (+r.lon).toFixed(6) : ''; };

  function bridge(P) {
    if (P._B) return P._B;
    var by = {}, recs = P.records || [], runs = P.runs || [], points = [], ptBy = {};
    recs.forEach(function (r) { by[r.id] = r; });
    var add = function (p) { points.push(p); ptBy[p.id] = p; };
    var odfs = recs.filter(function (r) { return kindOf(r) === 'odf'; });
    /* proposed closures with no ID yet are C1, C2… in the order the cables meet them */
    var order = [], cName = {}, cNo = 0;
    runs.forEach(function (R) { R.path.forEach(function (id) { if (by[id] && kindOf(by[id]) === 'closure' && order.indexOf(id) < 0) order.push(id); }); });
    recs.forEach(function (r) { if (kindOf(r) === 'closure' && order.indexOf(r.id) < 0) order.push(r.id); });
    order.forEach(function (id) { var r = by[id]; cName[id] = String(r.closureId || '').trim().toUpperCase() || (stOf((r.boq || {}).cloSt) === 'existing' ? String(r.poleId || 'CLOSURE').toUpperCase() : 'C' + (++cNo)); });
    recs.forEach(function (r) {
      var k = kindOf(r), b = r.boq || {};
      if (k === 'site') {
        var nm = splitName(r.poleId), best = null, bd = 45;
        if (r._home) { best = r; bd = 0; } /* an ODF that is its own homing: its own size, no search */
        else if (r._odf && by[r._odf]) { best = by[r._odf]; bd = hav(r, best); } /* the app: the ODF a cable leaves the site from (not a nearer one beside it) */
        else odfs.forEach(function (o) { var d = hav(r, o); if (d <= bd) { bd = d; best = o; } });
        var ports = best ? parseInt(String((best.boq || {}).odf || ''), 10) || 0 : 0;
        add({ id: r.id, type: 'site', name: nm.name, code: nm.code, status: stOf(r.status), ports: ports, odf: best ? best.id : '', odfDist: best ? Math.round(bd) : null,
          fdu: r._home ? String(r.poleId || 'FDU_001').trim().toUpperCase() : (nm.code || nm.name.replace(/[^A-Z0-9]+/g, '')) + '_' + (best && best.poleId ? String(best.poleId).toUpperCase() : 'FDU_001') });
      } else if (k === 'closure') add({ id: r.id, type: 'closure', name: cName[r.id], status: stOf(b.cloSt || r.status), coords: llTxt(r.cloPos && llTxt(r.cloPos) ? r.cloPos : r), size: b.clo || '', at: r.poleId || '', where: r.element || 'Pole' });
      else if (k === 'dnap') { var nid = String(r.napId || r.poleId || 'DUMMY NAP').trim().toUpperCase(); add({ id: r.id, type: 'dnap', name: nid, code: '', status: stOf(b.napSt || r.status), fdu: nid.replace(/[^A-Z0-9]+/g, '') + '_DNAP', ports: 0, at: r.poleId || '' }); }
    });
    /* each RUN cut at the closures, sites and dummy NAPs on its way; a plain pole at either end means the cable leaves the map there */
    var pieces = [], pieceBy = {}, offEnds = [], offBy = {};
    runs.forEach(function (R) {
      var path = R.path.filter(function (id) { return by[id]; }); if (path.length < 2) return;
      var cut = [], seg = [], total = 0;
      path.forEach(function (id, i) { if (i === 0 || i === path.length - 1 || ptBy[id]) cut.push(i); if (i) { var d = hav(by[path[i - 1]], by[id]); seg.push(d); total += d; } });
      for (var j = 0; j + 1 < cut.length; j++) {
        var i0 = cut[j], i1 = cut[j + 1], g = 0; for (var s = i0; s < i1; s++) g += seg[s];
        var rl = +R.len > 0 ? +R.len : total, len = total > 0 ? rl * g / total : rl / (cut.length - 1);
        var ends = [path[i0], path[i1]].map(function (id) {
          if (ptBy[id]) return id;
          var oid = 'off:' + id;
          if (!offBy[oid]) { offBy[oid] = { id: oid, pole: id, at: by[id].poleId || id, fid: R.fid, size: R.size, ex: !!R.ex }; offEnds.push(offBy[oid]); }
          return oid;
        });
        /* the app keys a piece by its cable and its two ends (it survives a RUN reversed or continued); the demo by its place on the RUN */
        var key = P.keys === 'ends' ? R.fid + '~' + ends.slice().sort().join('~') : R.fid + '.' + (j + 1);
        if (pieceBy[key]) key += '~' + (j + 1);
        var pc = { key: key, fid: R.fid, n: R.n, j: j + 1, of: cut.length - 1, from: ends[0], to: ends[1], size: R.size, fpt: +R.fpt > 0 ? +R.fpt : 12, status: R.ex ? 'existing' : 'new', len: Math.round(len), path: path.slice(i0, i1 + 1) };
        if (P.app) { pc.cid = R.cid || ''; pc.sizes = R.sizes || null; pc.notSet = !!R.notSet; }
        pieces.push(pc); pieceBy[pc.key] = pc;
      }
    });
    /* a dummy NAP is the end of the job (the owner): fed through a closure, a cable at it that goes elsewhere (not to a closure) goes on
       beyond it, not spliced in this job; what it reaches is shown plainly. onward: { <piece key>: <the dummy NAP's id> } */
    var onward = {};
    points.forEach(function (d) {
      if (d.type !== 'dnap') return;
      var at = pieces.filter(function (pc) { return pc.from === d.id || pc.to === d.id; });
      var feed = at.filter(function (pc) { var o = pc.from === d.id ? pc.to : pc.from; return ptBy[o] && ptBy[o].type === 'closure'; });
      if (feed.length && feed.length < at.length) at.forEach(function (pc) { if (feed.indexOf(pc) < 0) onward[pc.key] = d.id; });
    });
    /* an ODF record beside the pole where a cable leaves the map (45 m) names that end */
    offEnds.forEach(function (e) {
      var pr = by[e.pole], best = null, bd = 45; if (!pr) return;
      recs.forEach(function (r) { if (kindOf(r) !== 'odf' || !isFinite(r.lat) || !isFinite(r.lon)) return; var d = hav(pr, r); if (d <= bd) { bd = d; best = r; } });
      if (best) { e.odf = best.id; e.odfName = String(best.poleId || 'ODF').trim().toUpperCase(); e.odfSt = stOf(best.status); }
    });
    /* a site beside the pole where a cable going on beyond a dummy NAP leaves the map (45 m; added there after Show on map): that cable ends
       at the site, which names the far end (its ODF is its FDU). It is past the job's end: never a start, a homing or a later leg here */
    Object.keys(onward).forEach(function (k) {
      var pc = pieceBy[k], side = pc.from === onward[k] ? 'to' : 'from', oid = pc[side], e = offBy[oid], pr = e && by[e.pole], best = null, bd = 45;
      if (!pr || !isFinite(pr.lat) || !isFinite(pr.lon)) return;
      points.forEach(function (p) {
        var r = by[p.id]; if (p.type !== 'site' || !r || r._home || !isFinite(r.lat) || !isFinite(r.lon)) return;
        if (pieces.some(function (x) { return x.from === p.id || x.to === p.id; })) return;
        var d = hav(pr, r); if (d <= bd) { bd = d; best = p; }
      });
      if (!best) return;
      pc[side] = best.id;
      if (!pieces.some(function (x) { return x.from === oid || x.to === oid; })) { offEnds.splice(offEnds.indexOf(e), 1); delete offBy[oid]; }
    });
    P._B = { P: P, by: by, points: points, ptBy: ptBy, pieces: pieces, pieceBy: pieceBy, offEnds: offEnds, offBy: offBy, runs: runs, onward: onward, beyond: {} };
    return P._B;
  }

  /* =====================================================================================================
     THE APP'S PROJECT (vendor/splice/splice.html, in a frame over G-eSAA): what app.js sends (records and RUNs) to the bridge's project.
     It fixes where the app's data differ from the demo's: a Closure pin or a dummy-NAP pin stands on its pole; a closure or dummy NAP
     with no state is new (as the app draws it); a pole's second box can be the dummy NAP; an ODF on a cable's path stands for its tower
     site, or is a homing itself when no site is near (an exchange's FDU); an OLT site is Broadband (later): a plain point for now.
     ===================================================================================================== */
  var dummyT = function (t) { return /dummy/i.test(t || ''); };
  function fromApp(d) {
    d = d || {};
    /* the sites first (a new tower site is where the splicing starts, before a small cell), then as the app lists them */
    var rank = function (r) { return r.element === 'Site' ? 0 : r.element === 'ODF' ? 1 : 2; };
    var recs = (d.records || []).map(function (r, i) { var o = JSON.parse(JSON.stringify(r)); o.boq = o.boq || {}; o._i = i; return o; })
      .sort(function (a, b) { return rank(a) - rank(b) || a._i - b._i; }), by = {};
    recs.forEach(function (r) { delete r._i; });
    recs.forEach(function (r) { by[r.id] = r; });
    var runs = (d.runs || []).map(function (R) {
      return { fid: String(R.fid), n: +R.n || 0, size: +R.size || 0, ex: !!R.ex, cab: String(R.cab || ''), fpt: +R.fpt === 6 ? 6 : 12, cid: String(R.cid || ''), len: +R.len || 0, notSet: !!R.notSet,
        sizes: Array.isArray(R.sizes) && R.sizes.length ? R.sizes.slice() : null, path: (R.path || []).map(String).filter(function (id) { return by[id]; }) };
    });
    var onPath = {}, notes = [], folded = {}, pins = {}; /* folded: a pin (closure, dummy NAP, ODF) shown as the pole or site it stands for; pins: the pins on a pole */
    runs.forEach(function (R) { R.path.forEach(function (id) { onPath[id] = 1; }); });
    /* Broadband comes later: an OLT site is a plain point (a cable that ends there leaves the map) */
    recs.forEach(function (r) { if (r.element === 'Site' && r.siteKind === 'OLT') { r.element = 'OLT'; if (notes.indexOf('olt') < 0) notes.push('olt'); } });
    /* a closure or dummy NAP with no state set is new, as the app treats it; a pole's second box that is the dummy NAP */
    recs.forEach(function (r) {
      var b = r.boq;
      if ((r.closure || r.closureId) && !b.cloSt) b.cloSt = 'New';
      if ((r.nap || r.napId) && dummyT(b.napType)) { if (!b.napSt) b.napSt = 'New'; }
      else if ((r.nap2 || r.nap2Id) && dummyT(b.nap2Type)) { r.nap = true; r.napId = r.nap2Id || ''; b.napType = 'Dummy NAP'; b.napSt = b.nap2St || 'New'; }
    });
    /* a Closure pin or a dummy-NAP pin stands on the nearest pole of a cable within 30 m (as the Drawing draws it) */
    var poles = recs.filter(function (r) { return r.element === 'Pole' && onPath[r.id]; });
    recs = recs.filter(function (r) {
      var dn = r.element === 'NAP' && dummyT(r.boq.napType);
      if (r.element !== 'Closure' && !dn) return r.element !== 'NAP';
      var best = null, bd = 30; poles.forEach(function (q) { var x = hav(r, q); if (x < bd) { bd = x; best = q; } }); if (!best) return false;
      var st = r.status === 'Existing' ? 'Existing' : 'New'; folded[r.id] = best.id;
      var pin = pins[best.id] = pins[best.id] || {};
      if (r.element === 'Closure') { if (!(best.closure || best.closureId)) { best.closure = true; best.closureId = r.closureId || r.poleId || ''; best.boq.clo = r.boq.clo || best.boq.clo || ''; best.boq.cloSt = st; best.cloPos = { lat: r.lat, lon: r.lon }; pin.closure = r.id; } }
      else if (!((best.nap || best.napId) && dummyT(best.boq.napType))) { best.nap = true; best.napId = r.napId || r.poleId || ''; best.boq.napType = 'Dummy NAP'; best.boq.napSt = st; pin.dnap = r.id; }
      return false;
    });
    /* an ODF on a cable's path stands for its tower site (45 m); with no site near (an exchange's FDU) it is a homing itself */
    var sites = recs.filter(function (r) { return r.element === 'Site'; });
    recs.forEach(function (r) {
      if (r.element !== 'ODF' || !onPath[r.id]) return; var best = null, bd = 45;
      sites.forEach(function (s) { var x = hav(r, s); if (x <= bd) { bd = x; best = s; } });
      if (!best) { r._home = true; return; }
      folded[r.id] = best.id;
      if (!best._odf || bd < best._odfD) { best._odf = r.id; best._odfD = bd; } /* the site's FDU is the ODF its cable leaves from (the nearest such), not any ODF beside it */
      runs.forEach(function (R) { R.path = R.path.map(function (id) { return id === r.id ? best.id : id; }).filter(function (id, i, a) { return !i || id !== a[i - 1]; }); });
    });
    /* a pole with a closure and a dummy NAP: the page draws the closure (the cables are joined there); the dummy NAP is said, not drawn */
    var both = [];
    recs.forEach(function (r) { if (kindOf(r) === 'closure' && (r.nap || r.napId) && dummyT(r.boq.napType)) both.push(String(r.poleId || r.closureId || r.id).toUpperCase()); });
    if (both.length) notes.push('both:' + both.join(', '));
    return { id: String(d.id || d.name || 'project'), name: String(d.name || ''), site: d.site || '', title: d.title || {}, refNames: d.refNames || [],
      records: recs, runs: runs.filter(function (R) { return R.path.length > 1; }), app: true, keys: 'ends', notes: notes, folded: folded, pins: pins };
  }

  /* the project's own records, edited from the drawing (one source of truth). D = { odf: { <ODF record id>: ports }, run: { <fid>: { size, fpt } } }:
     in the app these are the ODF record's size (boq.odf) and the cable RUN's size and fibers per buffer; here they are written into the made-up
     project's records and RUNs, so the bridge, the engine, the drawing and the counts all read them from there, like any other record. */
  var ODF_SIZES = [12, 24, 48, 72, 144, 288], CABLE_SIZES = [12, 24, 48, 72, 96, 144, 288], FPTS = [12, 6];
  function freshData() { return { odf: {}, run: {} }; }
  /* saved data from this browser, checked; anything odd is left out, an old save without it gives none */
  function cleanData(d) {
    var D = freshData(); if (!d || typeof d !== 'object') return D;
    Object.keys(d.odf || {}).forEach(function (k) { var v = Math.round(+d.odf[k]); if (v >= 1 && v <= 2000) D.odf[k] = v; });
    Object.keys(d.run || {}).forEach(function (k) {
      var r = d.run[k] || {}, o = {}, sz = Math.round(+r.size), f = Math.round(+r.fpt);
      if (sz >= 2 && sz <= 576) o.size = sz; if (FPTS.indexOf(f) >= 0) o.fpt = f; if (o.size || o.fpt) D.run[k] = o;
    });
    return D;
  }
  function applyData(P, D) {
    D = D || freshData(); var key = JSON.stringify(D); if (P._dataKey === key && P._base) return;
    if (!P._base) P._base = { records: JSON.parse(JSON.stringify(P.records)), runs: JSON.parse(JSON.stringify(P.runs)) };
    var recs = JSON.parse(JSON.stringify(P._base.records)), runs = JSON.parse(JSON.stringify(P._base.runs));
    recs.forEach(function (r) { var v = (D.odf || {})[r.id]; if (v && kindOf(r) === 'odf') r.boq = Object.assign({}, r.boq, { odf: v + 'F' }); });
    runs.forEach(function (R) { var v = (D.run || {})[R.fid]; if (!v) return; if (v.size) R.size = v.size; if (v.fpt) R.fpt = v.fpt; });
    P.records = recs; P.runs = runs; P._dataKey = key; delete P._B;
  }
  /* the made-up project as it came (before any edit): to tell an edit back to the original from a real change */
  function baseOf(P) { if (!P._base) applyData(P, freshData()); return P._base; }

  /* what the cables going on beyond a dummy NAP reach (and on from there, up to the next dummy NAP): past the job's end, whatever the start */
  function pastOf(B) {
    if (B._past) return B._past;
    var adj = {}, past = {};
    B.pieces.forEach(function (c) { (adj[c.from] = adj[c.from] || []).push(c.to); (adj[c.to] = adj[c.to] || []).push(c.from); });
    Object.keys(B.onward).forEach(function (k) {
      var pc = B.pieceBy[k], d = B.onward[k], q = [pc.from === d ? pc.to : pc.from];
      while (q.length) { var v = q.shift(); if (past[v] || v === d) continue; past[v] = 1; if (typeOf(B, v) === 'dnap') continue; (adj[v] || []).forEach(function (o) { if (!past[o]) q.push(o); }); }
    });
    B._past = past; return past;
  }
  /* the new sites and dummy NAPs a job can start from: not past a dummy NAP (the job ends there); those with a cable first */
  function startsOf(B) {
    var past = pastOf(B), cab = {};
    B.pieces.forEach(function (c) { cab[c.from] = 1; cab[c.to] = 1; });
    var news = B.points.filter(function (p) { return isEndType(p.type) && p.status === 'new' && !past[p.id]; });
    return news.filter(function (p) { return cab[p.id]; }).concat(news.filter(function (p) { return !cab[p.id]; }));
  }

  /* the answers of a fresh project: the start is picked for the user (the only new site, or the project's site) */
  function freshAnswers(P) {
    /* (not a site that only a cable going on beyond a dummy NAP reaches: the job ends at the dummy NAP; a site with a cable before one with none) */
    var B = bridge(P), news = startsOf(B);
    var pick = news.filter(function (p) { return p.name === String(P.site || '').toUpperCase(); })[0] || news[0] || B.points.filter(function (p) { return isEndType(p.type); })[0];
    var A = { v: 1, start: pick ? pick.id : '', started: false, off: {}, to: [], later: [], toDone: false, count: 0, counts: {}, countDone: false, size: {}, split: {}, testedDone: false,
      live: {}, tubes: {}, draft: { live: {}, tubes: {} }, legs: {}, ids: {}, coords: {}, locked: false };
    if (P.app) A.tfpt = {}; /* the app: the fibers per buffer each cable's ticked buffers were counted in (the RUN's size travels on its own) */
    return A;
  }
  /* the name of any end, an off-map one included */
  function nameOf(B, A, id) {
    if (!id) return '';
    if (id.indexOf('off:') === 0) { var e = B.offBy[id]; return String((e && A.off[e.pole]) || '').trim().toUpperCase() || (e && e.odfName) || (e && B.beyond[id] ? 'POLE ' + String(e.at).toUpperCase() : 'NOT NAMED YET'); }
    var p = B.ptBy[id]; return p ? p.name : id;
  }
  function typeOf(B, id) { return id && id.indexOf('off:') === 0 ? 'site' : (B.ptBy[id] || {}).type; }
  function isExistingEnd(B, id) { if (!id) return false; if (id.indexOf('off:') === 0) return true; var p = B.ptBy[id]; return !!p && isEndType(p.type) && p.status === 'existing'; }

  /* the homings and dummy NAPs the cables reach from the start, through closures only (never through another site), nearest by cable first */
  function reachOf(B, A) {
    var adj = {}, s = A.start, dist = {}, done = {};
    B.pieces.forEach(function (c) { (adj[c.from] = adj[c.from] || []).push({ o: c.to, len: c.len, key: c.key }); (adj[c.to] = adj[c.to] || []).push({ o: c.from, len: c.len, key: c.key }); });
    var ends = B.points.filter(function (p) { return isEndType(p.type); }).map(function (p) { return p.id; }).concat(B.offEnds.map(function (e) { return e.id; }));
    var named = function (id) { return id.indexOf('off:') !== 0 || !!String(A.off[B.offBy[id].pole] || '').trim(); };
    if (!s) { B.beyond = {}; return { dist: {}, list: [], none: [], unnamed: [], beyond: {} }; }
    dist[s] = 0;
    for (;;) {
      var u = null; Object.keys(dist).forEach(function (k) { if (!done[k] && (u === null || dist[k] < dist[u])) u = k; });
      if (u === null) break; done[u] = true;
      if (u !== s && typeOf(B, u) !== 'closure') continue;
      (adj[u] || []).forEach(function (e) { if (B.onward[e.key] === u) return; var d = dist[u] + e.len; if (dist[e.o] == null || d < dist[e.o]) dist[e.o] = d; });
    }
    /* beyond a dummy NAP: what its onward cables reach (and on from there) that the start does not reach otherwise */
    var bey = {};
    Object.keys(B.onward).forEach(function (k) {
      var pc = B.pieceBy[k], d = B.onward[k], q = [pc.from === d ? pc.to : pc.from];
      while (q.length) {
        var v = q.shift(); if (bey[v] || v === d || v === s || dist[v] != null) continue; bey[v] = 1;
        if (typeOf(B, v) === 'dnap') continue;
        (adj[v] || []).forEach(function (e) { if (!bey[e.o]) q.push(e.o); });
      }
    });
    B.beyond = bey;
    ends = ends.filter(function (id) { return !bey[id]; });
    var list = ends.filter(function (id) { return id !== s && dist[id] != null && named(id); }).sort(function (x, y) { return dist[x] - dist[y]; });
    var none = ends.filter(function (id) { return id !== s && dist[id] == null && named(id); }), D = {};
    list.forEach(function (id) { D[id] = dist[id]; });
    var un = ends.filter(function (id) { return id !== s && dist[id] != null && !named(id); }), UD = {};
    un.forEach(function (id) { UD[id] = dist[id]; });
    return { dist: D, list: list, none: none, unnamed: un, unnamedDist: UD, beyond: bey };
  }
  var tubesOf = function (A, fid) { return A.tubes[fid] != null ? A.tubes[fid] : (A.draft.tubes[fid] || []); };
  var liveOf = function (A, id) { return A.live[id] != null ? A.live[id] : A.draft.live[id] != null ? A.draft.live[id] : '?'; };
  function defaultCount(B, A) { return typeOf(B, A.start) === 'dnap' || (A.to || []).some(function (t) { return typeOf(B, t) === 'dnap'; }) ? 2 : 6; }
  function countOf(B, A, legId) { return +A.counts[legId] || +A.count || defaultCount(B, A); }
  function legIdsOf(A) { var seen = {}; return (A.to || []).concat(A.later || []).filter(function (t) { if (seen[t]) return false; seen[t] = true; return true; }); }

  /* the app: a RUN's cable ID is typed once and kept on the RUN; each piece prints it with -L1, -L2… (as the reference drawings do) */
  function cidOf(c) { return c && c.cid ? String(c.cid).replace(/-L\d+$/i, '') + '-L' + c.j : ''; }
  /* the engine's model from the project and the answers. Unanswered facts print as TO BE CONFIRMED.
     An existing cable's in-use fibers are kept for the whole physical cable (its RUN fid): the tubes ticked as in use, and the fibers live
     at the FDUs on its ends (the engine works these out from the live ports; a first pass reads them, a second applies them to every piece). */
  function modelOf(P, A, set) {
    var B = bridge(P), R = reachOf(B, A), wired = {};
    B.pieces.forEach(function (c) { wired[c.from] = wired[c.to] = 1; });
    if (A.started) legIdsOf(A).concat([A.start]).forEach(function (id) { wired[id] = 1; });
    /* a pin no cable reaches stays off the drawing until it is a leg's end (a later leg) */
    var pts = B.points.filter(function (p) { return wired[p.id] || p.id === A.start; }).map(function (p) {
      var o = { id: p.id, type: p.type, name: p.name, code: p.code || '', status: p.status };
      if (isEndType(p.type)) {
        o.fdu = p.fdu; var sz = p.ports || +A.size[p.id] || 0; if (sz) o.ports = sz;
        if (p.status === 'existing') o.active = liveOf(A, p.id); else if (A.split[p.id]) o.split = A.split[p.id];
      } else o.coords = p.coords || '';
      return o;
    });
    B.offEnds.forEach(function (e) {
      var bey = !!R.beyond[e.id], o = { id: e.id, type: 'site', name: nameOf(B, A, e.id), code: '', status: bey && e.odf ? e.odfSt : 'existing', fdu: bey ? '' : 'FDU ID TBF' };
      if (!bey) o.active = liveOf(A, e.id); if (+A.size[e.id]) o.ports = +A.size[e.id]; pts.push(o);
    });
    /* the tubes ticked as in use, in the cable's own buffers (12 or 6 fibers each) */
    var tubeFibers = function (fid, size, fpt) { var out = []; tubesOf(A, fid).forEach(function (t) { for (var f = (t - 1) * fpt + 1; f <= t * fpt && f <= size; f++) out.push(f); }); return out; };
    var cables = B.pieces.map(function (c) {
      var o = { id: c.key, fid: c.fid, name: String(A.ids[c.key] || cidOf(c) || '').trim(), from: c.from, to: c.to, size: c.size, fpt: c.fpt, status: c.status, length: c.len,
        used: c.status === 'existing' ? SP.fmtRanges(tubeFibers(c.fid, c.size, c.fpt)) : '' };
      if (B.onward[c.key]) o.onward = true; /* (it goes on beyond a dummy NAP: not spliced in this job, even before the first answer) */
      return o;
    });
    var ask3 = set.stage === 'built' && !A.testedDone && legIdsOf(A).filter(function (t) { return R.dist[t] != null && (A.legs['g-' + t] || {}).state !== 'future'; }).length >= 2;
    var links = A.started && A.start ? legIdsOf(A).map(function (t) {
      var id = 'g-' + t, L = A.legs[id] || {}, can = R.dist[t] != null, tested = L.test && (L.test.date || (L.test.loss != null && L.test.loss !== ''));
      var st = can ? (L.state === 'spliced' || L.state === 'future' || L.state === 'tested' ? L.state : ask3 && !tested ? 'tbc' : 'tested') : 'future';
      var o = { id: id, a: A.start, b: t, fibers: countOf(B, A, id), state: st };
      if (L.test) o.test = L.test; if (L.fix && Object.keys(L.fix).length) o.fix = L.fix; if (L.cable) o.cable = L.cable;
      return o;
    }) : [];
    var model = { kind: 'access', fpt: 12, stage: set.stage === 'built' ? 'built' : 'plan', rules: { tube: set.tube === 'fresh' ? 'fresh' : 'lowest', future: 'cable', split: 'half' },
      title: Object.assign({}, P.title), points: pts, cables: cables, links: links };
    var dots = {};
    if (cables.some(function (c) { return c.status === 'existing'; })) {
      SP.assign(model).cableInfo.forEach(function (ci) { if (ci.status !== 'existing') return; var fid = B.pieceBy[ci.key].fid; dots[fid] = (dots[fid] || []).concat(ci.liveAtFdu); });
      Object.keys(dots).forEach(function (fid) { dots[fid] = SP.parseRanges(dots[fid].join(',')); });
      cables.forEach(function (c) { if (c.status === 'existing' && dots[c.fid] && dots[c.fid].length) c.used = SP.fmtRanges(SP.parseRanges(c.used).concat(dots[c.fid])); });
    }
    return { model: model, B: B, reach: R, dots: dots };
  }

  /* the questions, in the order they are asked; each is done or still to answer */
  function questions(P, A, set, ctx) {
    var B = ctx.B, plan = ctx.plan, Q = [], legs = plan.legs || [];
    Q.push({ key: 'start', done: !!A.started });
    var bey = (ctx.reach && ctx.reach.beyond) || B.beyond || {};
    B.offEnds.forEach(function (e) { if (!bey[e.id]) Q.push({ key: 'off:' + e.pole, off: e, done: !!String(A.off[e.pole] || '').trim() }); });
    Q.push({ key: 'to', done: !!A.toDone && legs.length > 0 });
    if (A.toDone && legs.length) Q.push({ key: 'count', done: !!A.countDone });
    var live = legs.filter(function (l) { return !l.bad && l.state !== 'future' && l.routed; }), ends = [];
    live.forEach(function (l) { [l.a, l.b].forEach(function (id) { if (ends.indexOf(id) < 0) ends.push(id); }); });
    ends.forEach(function (id) { var p = B.ptBy[id]; if (p && p.type === 'site' && p.status === 'new' && !p.ports) Q.push({ key: 'size:' + id, id: id, done: !!A.size[id] }); });
    (plan.fdus || []).forEach(function (f) { if (!f.existing && f.split && ends.indexOf(f.id) >= 0) Q.push({ key: 'split:' + f.id, id: f.id, done: !!A.split[f.id] }); });
    if (set.stage === 'built' && live.length >= 2) Q.push({ key: 'tested', done: !!A.testedDone || live.every(function (l) { return !!(A.legs[l.id] || {}).state; }) });
    var liveIds = ends.filter(function (id) { return isExistingEnd(B, id); });
    (plan.fdus || []).forEach(function (f) { if (f.existing && f.asks && liveIds.indexOf(f.id) < 0) liveIds.push(f.id); });
    liveIds.forEach(function (id) { Q.push({ key: 'live:' + id, id: id, done: A.live[id] != null }); });
    var fids = [];
    live.forEach(function (l) { l.fibers.forEach(function (f) { var pc = B.pieceBy[f.key]; if (f.existing && pc && fids.indexOf(pc.fid) < 0) fids.push(pc.fid); }); });
    fids.forEach(function (fid) { Q.push({ key: 'tubes:' + fid, fid: fid, done: A.tubes[fid] != null }); });
    Q.push({ key: 'ready', done: false });
    return Q;
  }
  /* everything the page needs for one state: the model, the drawing, the plan and the questions */
  function compute(P, A, set) {
    var mm = modelOf(P, A, set), r = SP.build(mm.model, ['sld']), ctx = { P: P, A: A, set: set, model: mm.model, B: mm.B, reach: mm.reach, dots: mm.dots, sheets: r.sheets, plan: r.plan };
    mm.B.beyond = mm.reach.beyond;
    ctx.qs = questions(P, A, set, ctx);
    ctx.left = ctx.qs.filter(function (q) { return q.key !== 'ready' && !q.done; }).length;
    /* before "Where does it go?" is answered, count the questions as if every homing the cables reach were picked, so the number only goes down */
    if (!A.toDone && A.start) {
      var early = function (k) { return k === 'start' || k === 'to' || k.indexOf('off:') === 0; }, A2 = JSON.parse(JSON.stringify(A));
      A2.started = true; mm.B.offEnds.forEach(function (e) { if (!String(A2.off[e.pole] || '').trim() && !mm.reach.beyond[e.id]) A2.off[e.pole] = '?'; });
      A2.to = reachOf(mm.B, A2).list; A2.toDone = A2.to.length > 0;
      var m2 = modelOf(P, A2, set), q2 = questions(P, A2, set, { B: m2.B, plan: SP.assign(m2.model), reach: m2.reach });
      ctx.left = ctx.qs.filter(function (q) { return early(q.key) && !q.done; }).length + q2.filter(function (q) { return q.key !== 'ready' && !q.done && !early(q.key); }).length;
    }
    ctx.legBy = {}; (r.plan.legs || []).forEach(function (l) { ctx.legBy[l.id] = l; });
    ctx.cab = {}; mm.model.cables.forEach(function (c) { ctx.cab[c.id] = c; });
    ctx.fduBy = {}; (r.plan.fdus || []).forEach(function (f) { ctx.fduBy[f.id] = f; });
    ctx.infoBy = {}; (r.plan.cableInfo || []).forEach(function (c) { ctx.infoBy[c.key] = c; });
    ctx.unnamed = mm.model.cables.filter(function (c) { return !c.name; }).map(function (c) { return c.id; });
    /* answered is not the same as ready: a leg without enough free fibers is still to fix, a homing whose live ports are not sure is still to confirm */
    ctx.short = (r.plan.legs || []).filter(function (l) { return l.short; });
    ctx.confirm = []; (r.plan.legs || []).forEach(function (l) { if (!l.short) (l.confirm || []).forEach(function (x) { if (ctx.confirm.indexOf(x) < 0) ctx.confirm.push(x); }); });
    ctx.sizes = sizesOf(A, ctx); ctx.sizeIssues = ctx.sizes.issues;
    /* a leg short of fibers only because an FDU or a cable is too small: one thing to fix (the size), said once */
    var fduIss = {}, runIss = {};
    ctx.sizeIssues.forEach(function (x) { if (x.kind === 'fdu') fduIss[x.id] = 1; else runIss[x.fid] = 1; });
    ctx.shortBySize = ctx.short.filter(function (l) {
      return l.fibers.filter(function (f) { return !f.ok; }).every(function (f) { var pc = mm.B.pieceBy[f.key]; return (f.limit && fduIss[f.limit.id]) || (pc && runIss[pc.fid]); });
    });
    ctx.shortOwn = ctx.short.filter(function (l) { return ctx.shortBySize.indexOf(l) < 0; });
    ctx.status = ctx.left ? 'ask' : ctx.short.length || ctx.sizeIssues.length ? 'fix' : ctx.confirm.length ? 'confirm' : 'ready';
    mm.B.beyond = mm.reach.beyond; /* (the count above looked as if every homing were picked) */
    return ctx;
  }
  /* the sizes anyone can change: every FDU on the drawing and every cable (one row per RUN, not per piece), and those too small for this work.
     What was marked past a size (live ports past an FDU's last port, buffers ticked past a cable's last fiber) is kept with the answers but left
     out of the plan, and said here in red, so a bigger size brings it back and a wrong tap on a smaller size never loses it. */
  var bufName = function (t) { var n = SP.FIBER[(t - 1) % 12].name.toLowerCase(); return n + (t > 12 ? ' ' + t : ''); };
  var bufNames = function (ts) { var n = ts.map(bufName); return n.length < 2 ? n[0] : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
  function sizesOf(A, ctx) {
    var B = ctx.B, plan = ctx.plan, out = { fdus: [], runs: [], issues: [] };
    var legs = (plan.legs || []).filter(function (l) { return l.routed && !l.bad && l.state !== 'future'; });
    var pick = function (list, need) { for (var i = 0; i < list.length; i++) if (list[i] >= need) return list[i]; return 0; };
    (plan.fdus || []).forEach(function (f) {
      if (f.type !== 'site' || f.beyond) return;
      var p = B.ptBy[f.id], odf = p && p.odf && (p.ports || B.P.app) ? B.by[p.odf] : null, lv = f.existing ? liveOf(A, f.id) : '';
      var typed = lv && lv !== '?' ? SP.parseRanges(lv) : [], past = typed.filter(function (q) { return q > f.cap; });
      var mine = legs.filter(function (l) { return l.a === f.id || l.b === f.id; }).reduce(function (a, l) { return a + l.n; }, 0), live = f.existing ? Math.max(f.active.length, typed.length) : 0;
      var row = { id: f.id, name: nameOf(B, A, f.id), cap: f.cap, existing: f.existing, src: odf ? 'odf' : +A.size[f.id] ? 'answer' : 'cable', odf: odf ? odf.id : '',
        odfName: odf ? String(odf.poleId || 'ODF').toUpperCase() : '', legs: mine, live: live, need: mine + live, past: past };
      out.fdus.push(row);
      var over = mine && mine + live > f.cap;
      if (over || past.length) {
        var pk = pick(ODF_SIZES, Math.max(over ? mine + live : 0, past.length ? past[past.length - 1] : 0)), pw = past.length ? 'live ports ' + SP.fmtRanges(past) + ' are marked past port ' + f.cap + ', so they are left out' : '';
        row.issue = { key: 'pt:' + f.id, kind: 'fdu', id: f.id, need: mine + live, pick: pk, past: past,
          text: row.name + ' FDU has ' + f.cap + ' ports, but ' + (over ? (mine + live) + ' fibers end there' + (live ? ' (' + live + ' live now, ' + mine + ' for this work)' : '') + (pw ? '; ' + pw : '') + ': ' +
            (pk ? 'pick ' + pk + ' or more.' : 'that is more than the biggest FDU; use fewer fibers.')
            : pw + '. If they are live, ' + (pk ? 'pick ' + pk + ' or more' : 'the FDU is bigger than any listed') + '; if not, remove them.') };
        row.sub = over ? 'Too small: ' + (mine + live) + ' fibers end there' : 'Live ports ' + SP.fmtRanges(past) + ' are past its ' + f.cap + ' ports';
        out.issues.push(row.issue);
      }
    });
    (B.runs || []).forEach(function (R) {
      var pcs = B.pieces.filter(function (pc) { return pc.fid === R.fid; }); if (!pcs.length) return;
      var need = 0, used = 0, len = 0;
      pcs.forEach(function (pc) {
        var on = legs.reduce(function (a, l) { return a + (l.fibers.some(function (f) { return f.key === pc.key; }) ? l.n : 0); }, 0), ci = ctx.infoBy[pc.key], u = ci && pc.status === 'existing' ? ci.live.length : 0;
        if (on + u > need + used) { need = on; used = u; }
        len += pc.len;
      });
      var c0 = pcs[0], ex = c0.status === 'existing', nT = Math.ceil(c0.size / c0.fpt), ticks = ex ? tubesOf(A, R.fid) : [];
      var CS = R.sizes && R.sizes.length ? R.sizes : CABLE_SIZES; /* the app: the sizes this RUN can take (a new cable comes only in the app's sizes) */
      var pastT = ticks.filter(function (t) { return t > nT; }), inT = ticks.filter(function (t) { return t <= nT; });
      var row = { fid: R.fid, n: R.n, size: c0.size, fpt: c0.fpt, existing: ex, from: c0.from, to: pcs[pcs.length - 1].to, keys: pcs.map(function (pc) { return pc.key; }),
        fromName: nameOf(B, A, c0.from), toName: nameOf(B, A, pcs[pcs.length - 1].to), len: len, need: need, used: used, rest: c0.size ? c0.size % c0.fpt : 0, pastT: pastT };
      if (B.P.app) { row.sizes = CS; row.cid = R.cid || ''; row.notSet = !!R.notSet; }
      out.runs.push(row);
      var over = need && need + used > c0.size;
      if (B.P.app && !c0.size) { /* the app: a RUN whose cable type is not set yet has no size to check */
        row.issue = { key: 'run:' + R.fid, kind: 'cable', fid: R.fid, need: need + used, pick: CS[0], pastT: [], notSet: true, text: 'RUN ' + R.n + ' has no cable type yet (' + row.fromName + ' → ' + row.toName + '). Pick its size here, or set the cable in Route → Cables.' };
        row.sub = 'Cable type not set'; out.issues.push(row.issue);
      } else if (over || pastT.length) {
        var span = row.fromName + ' → ' + row.toName, tf = function (ts) { var fs = []; ts.forEach(function (t) { for (var f = (t - 1) * c0.fpt + 1; f <= t * c0.fpt; f++) fs.push(f); }); return SP.fmtRanges(fs, 'F'); };
        var pk = pick(CS, Math.max(over ? need + used : 0, pastT.length ? pastT[pastT.length - 1] * c0.fpt : 0)) || CS[CS.length - 1];
        var one = pastT.length === 1, pw = pastT.length ? 'the ' + bufNames(pastT) + ' buffer' + (one ? '' : 's') + ' (' + tf(pastT) + '), ticked in use, ' + (one ? 'is' : 'are') + ' past its ' + c0.size + ' fibers, so ' + (one ? 'it is' : 'they are') + ' left out' : '';
        /* what is in use: the fibers live at its FDUs, and the buffers ticked in use (only these can be unticked) */
        var dots = (ctx.dots || {})[R.fid] || [], exEnds = [row.from, row.to].filter(function (id) { return isExistingEnd(B, id); }).map(function (id) { return nameOf(B, A, id); });
        var inUse = [dots.length ? SP.fmtRanges(dots, 'F') + (dots.length === 1 ? ' is' : ' are') + ' live at ' + (exEnds.length ? exEnds.join(' and ') : 'its FDU') : '', inT.length ? 'the ' + bufNames(inT) + ' buffer' + (inT.length === 1 ? ' (' + tf(inT) + ') is' : 's (' + tf(inT) + ') are') + ' ticked in use' : ''].filter(Boolean);
        var text;
        if (over && ex) text = 'The existing ' + c0.size + 'C cable ' + span + ' has no room: ' + (inUse.length ? inUse.join(', ') + ', and ' : used + ' fibers are in use, and ') + 'the legs need ' + need + ' more' + (pw ? '; ' + pw : '') + '. ' +
          (inT.length ? 'Untick a buffer you are not sure of, or if the size is wrong, pick ' + pk + ' or more.' : 'If the size is wrong, pick ' + pk + ' or more.');
        else if (over) text = 'The ' + c0.size + 'C cable ' + span + ' is too small: the legs need ' + need + ' fibers: ' + (pick(CS, need) ? 'pick ' + pick(CS, need) + ' or more.' : 'use fewer fibers.');
        else text = 'The existing ' + c0.size + 'C cable ' + span + ': ' + pw + '. If ' + (one ? 'it is' : 'they are') + ' in use, pick ' + pk + ' or more; if not, untick ' + (one ? 'it' : 'them') + '.';
        row.issue = { key: 'run:' + R.fid, kind: 'cable', fid: R.fid, need: need + used, pick: pk, pastT: pastT, text: text };
        row.sub = over ? 'Too small: ' + (used ? used + ' in use + ' : '') + need + ' for the legs' : 'The ' + bufNames(pastT) + ' buffer' + (one ? ' is' : 's are') + ' ticked past its ' + c0.size + ' fibers';
        out.issues.push(row.issue);
      }
    });
    return out;
  }

  /* saved answers on top of a fresh set, so an answer missing from an older save (or a newer demo) never breaks the page */
  function mergeAnswers(P, saved) {
    var A = freshAnswers(P); if (!saved || typeof saved !== 'object' || saved.v !== 1) return A;
    Object.keys(A).forEach(function (k) {
      var v = saved[k], d = A[k]; if (v == null) return;
      if (Array.isArray(d)) { if (Array.isArray(v)) A[k] = v.slice(); }
      else if (d && typeof d === 'object') { if (v && typeof v === 'object' && !Array.isArray(v)) { if (k === 'draft') { A.draft.live = Object.assign({}, v.live); A.draft.tubes = Object.assign({}, v.tubes); } else A[k] = Object.assign({}, v); } }
      else if (typeof v === typeof d) A[k] = v;
    });
    if (!A.start || !bridge(P).ptBy[A.start]) A.start = freshAnswers(P).start;
    cleanNested(A);
    if (P.app) { pruneAnswers(bridge(P), A); tubeBasis(bridge(P), A); }
    return A;
  }
  /* answers of another version or a damaged file: the buffers ticked are a list of buffer numbers, a live port answer is text */
  function cleanNested(A) {
    var tubeList = function (v) {
      if (typeof v === 'number') v = [v]; else if (typeof v === 'string') { v = v.match(/\d+/g); if (!v) return null; }
      if (!Array.isArray(v)) return null; var out = [];
      v.forEach(function (t) { t = Math.round(+t); if (t >= 1 && t <= 200 && out.indexOf(t) < 0) out.push(t); });
      return out.sort(function (x, y) { return x - y; });
    };
    [A.tubes, A.draft.tubes].forEach(function (o) { Object.keys(o).forEach(function (k) { var L = tubeList(o[k]); if (L) o[k] = L; else delete o[k]; }); });
    [A.live, A.draft.live].forEach(function (o) { Object.keys(o).forEach(function (k) { var v = o[k]; if (typeof v === 'number' && isFinite(v)) o[k] = String(v); else if (typeof v !== 'string') delete o[k]; }); });
    Object.keys(A.legs).forEach(function (k) { var L = A.legs[k]; if (!L || typeof L !== 'object' || Array.isArray(L)) { delete A.legs[k]; return; } if (L.fix != null && (typeof L.fix !== 'object' || Array.isArray(L.fix))) delete L.fix; });
    return A;
  }
  /* the app: the buffers ticked in use are buffer numbers of the RUN's buffers as they were when ticked (A.tfpt). The RUN's fibers per
     buffer travels with the route and the answers with the splicing details, each merged on its own at a Share: when they no longer
     match, the ticked buffers are put in the RUN's buffers now (each buffer with one of those fibers is in use), so live fibers stay live. */
  function tubeBasis(B, A) {
    var fpt = {}, T = A.tfpt && typeof A.tfpt === 'object' && !Array.isArray(A.tfpt) ? A.tfpt : {};
    B.runs.forEach(function (R) { fpt[R.fid] = +R.fpt === 6 ? 6 : 12; });
    var conv = function (L, from, to) {
      var out = []; L.forEach(function (t) { for (var f = (t - 1) * from + 1; f <= t * from; f++) { var u = Math.ceil(f / to); if (out.indexOf(u) < 0) out.push(u); } });
      return out.sort(function (x, y) { return x - y; });
    };
    [A.tubes, A.draft.tubes].forEach(function (o) { Object.keys(o).forEach(function (fid) { var want = fpt[fid], had = +T[fid]; if (want && (had === 6 || had === 12) && had !== want && Array.isArray(o[fid])) o[fid] = conv(o[fid], had, want); }); });
    var T2 = {}; Object.keys(fpt).forEach(function (fid) { if (A.tubes[fid] != null || A.draft.tubes[fid] != null) T2[fid] = fpt[fid]; });
    A.tfpt = T2;
    return A;
  }
  /* the app: answers about records or cables that are not in the project any more (deleted on another phone, merged at an import) go */
  function pruneAnswers(B, A) {
    var ok = function (id) { return !!(B.ptBy[id] || B.offBy[id]); }, fids = {};
    var keepIf = function (o, f) { Object.keys(o || {}).forEach(function (k) { if (!f(k)) delete o[k]; }); };
    B.runs.forEach(function (R) { fids[R.fid] = 1; });
    A.to = (A.to || []).filter(ok); A.later = (A.later || []).filter(ok);
    if (A.toDone && !A.to.length && !A.later.length) A.toDone = false;
    keepIf(A.legs, function (k) { return ok(k.slice(2)); }); keepIf(A.counts, function (k) { return ok(k.slice(2)); });
    ['live', 'size', 'split', 'coords'].forEach(function (n) { keepIf(A[n], ok); }); keepIf(A.draft.live, ok);
    keepIf(A.off, function (pole) { return !!B.offBy['off:' + pole]; });
    keepIf(A.tubes, function (f) { return !!fids[f]; }); keepIf(A.draft.tubes, function (f) { return !!fids[f]; });
    /* a locked piece cut by a closure added on it since: the same fibers stay locked on the new pieces of that cable between its old ends */
    var bare = function (id) { return String(id).indexOf('off:') === 0 ? String(id).slice(4) : String(id); };
    var carry = function (fix, key) {
      var parts = String(key).split('~'); if (parts.length < 3) return;
      var R = B.runs.filter(function (x) { return x.fid === parts[0]; })[0]; if (!R) return;
      var at = function (id) { return R.path.indexOf(bare(id)); }, i0 = at(parts[1]), i1 = at(parts[2]); if (i0 < 0 || i1 < 0) return;
      var lo = Math.min(i0, i1), hi = Math.max(i0, i1);
      B.pieces.forEach(function (pc) { if (pc.fid !== R.fid || fix[pc.key] != null) return; var a = at(pc.from), b = at(pc.to); if (a >= lo && a <= hi && b >= lo && b <= hi) fix[pc.key] = fix[key]; });
    };
    Object.keys(A.legs).forEach(function (k) {
      var L = A.legs[k]; if (!L || !L.fix) return;
      Object.keys(L.fix).forEach(function (key) { if (!B.pieceBy[key]) carry(L.fix, key); });
      keepIf(L.fix, function (key) { return !!B.pieceBy[key]; }); if (!Object.keys(L.fix).length) delete L.fix;
    });
    if (A.tfpt) keepIf(A.tfpt, function (f) { return !!fids[f]; });
    return A;
  }

  /* the fibers an export locks (it issues the drawing): each leg's fibers where they are now, as a range ('F7-12'), so a leg that grows
     later never takes another leg's issued fibers. Fibers on an existing cable wait until its live ports and tubes are answered.
     ctx: compute(P, A, set); the page and the app's one PDF (plan + CEF + splicing details) lock the same way. */
  function locks(ctx, A) {
    var factsOk = function (key) {
      var pc = ctx.B.pieceBy[key]; if (!pc || pc.status !== 'existing') return true;
      if (A.tubes[pc.fid] == null) return false;
      return ctx.qs.filter(function (q) { return q.key.indexOf('live:') === 0; }).every(function (q) { return A.live[q.id] != null && A.live[q.id] !== '?'; });
    };
    var legs = ctx.plan.legs || [], todo = [], wait = 0;
    legs.forEach(function (l) {
      if (!l.routed || l.state === 'future') return; var L = A.legs[l.id] || {}, fx = L.fix || {};
      l.fibers.forEach(function (f) {
        if (!f.ok || !f.list.length || (fx[f.key] != null && f.fixed)) return;
        if (!factsOk(f.key)) { wait++; return; }
        todo.push([l.id, f.key, f.text]);
      });
    });
    return { add: todo.length, wait: wait, apply: function (A2) { todo.forEach(function (t) { var L = A2.legs[t[0]] = A2.legs[t[0]] || {}; L.fix = Object.assign({}, L.fix); L.fix[t[1]] = t[2]; }); } };
  }

  var Ask = { PROJECTS: PROJECTS, bridge: bridge, freshAnswers: freshAnswers, startsOf: startsOf, pastOf: pastOf, modelOf: modelOf, reachOf: reachOf, questions: questions, compute: compute, kindOf: kindOf, nameOf: nameOf,
    applyData: applyData, freshData: freshData, cleanData: cleanData, baseOf: baseOf, ODF_SIZES: ODF_SIZES, CABLE_SIZES: CABLE_SIZES,
    fromApp: fromApp, mergeAnswers: mergeAnswers, pruneAnswers: pruneAnswers, tubeBasis: tubeBasis, locks: locks, version: 'ask-3' };
  root.Ask = Ask;
  if (typeof document === 'undefined' || !document.getElementById('card')) return;

  /* =====================================================================================================
     THE PAGE
     ===================================================================================================== */
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var cap1 = function (s) { s = String(s || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
  var kmTxt = function (m) { m = +m || 0; return m < 1000 ? Math.round(m) + ' m' : (Math.round(m / 100) / 10) + ' km'; };
  var dmy = function (iso) { var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(iso || '')); return m ? (m[3].length < 2 ? '0' : '') + m[3] + '-' + (m[2].length < 2 ? '0' : '') + m[2] + '-' + m[1] : String(iso || ''); };
  /* a loss typed with a comma or a point: 0,42 and 0.42 are the same */
  var lossNum = function (v) { var t = String(v == null ? '' : v).trim().replace(',', '.'); return /^\d*\.?\d+$|^\d+\.$/.test(t) ? parseFloat(t) : NaN; };
  var todayIso = function () { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  var tubeName = function (t) { return cap1(SP.FIBER[(t - 1) % 12].name); };
  var tubeRgb = function (t) { return SP.FIBER[(t - 1) % 12].rgb; };
  var phone = function () { return window.innerWidth < 900; };
  var KEY = 'gesaa-splice-ask-demo-1';
  /* the app's page (splice.html, data-app="splice") in a frame over G-eSAA: the project, the saved answers, the sizes and the exports go
     through the app (window.parent.__spliceHost); nothing is kept in this browser's storage. Without the attribute it is the demo. */
  var APP = document.documentElement.getAttribute('data-app') === 'splice';
  var HOST = APP ? (function () { try { return window.parent !== window && window.parent.__spliceHost ? window.parent.__spliceHost : null; } catch (e) { return null; } })() : null;

  var ST = { pid: 'p1', A: null, D: null, set: { stage: 'plan', tube: 'lowest' }, hist: [], cur: 'start', edit: null, ctx: null, saved: {}, armed: '', countDiff: false, focusKey: '', laterOpen: false, strip: null, sizeOpen: '', otherOpen: '', note: null,
    P: null, view: '', ops: null, busy: false, stage: 'plan', dirty: false };

  /* ---------- keeping the answers (the demo: in this browser only, fine without; the app: in the project, through the app) ---------- */
  function loadAll() { if (APP) return; try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.v === 1) { ST.saved = s.projects || {}; if (s.pid) ST.pid = s.pid; } } catch (e) { ST.saved = {}; } }
  function keep() {
    if (APP) { /* only after a change made here: opening and looking (or answers the page tidied itself) write nothing */
      if (HOST && !ST.view && ST.A && ST.dirty) { try { if (ST.P) tubeBasis(bridge(ST.P), ST.A); HOST.save({ v: 1, A: ST.A, tube: ST.set.tube }); } catch (e) { /* the app is closing */ } }
      return;
    }
    ST.saved[ST.pid] = { A: ST.A, set: ST.set, cur: ST.cur, D: ST.D }; /* D: the sizes changed on the drawing (the project's records), kept with the answers */
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, pid: ST.pid, projects: ST.saved })); } catch (e) { /* no storage here: the answers last until the page closes */ }
  }
  var proj = function () { return APP ? ST.P : PROJECTS.filter(function (p) { return p.id === ST.pid; })[0] || PROJECTS[0]; };
  function openProject(pid) {
    ST.pid = pid; var s = ST.saved[pid], P = proj();
    if (APP) ST.D = null; else { ST.D = cleanData(s && s.D); applyData(P, ST.D); }
    ST.sizeOpen = ''; ST.otherOpen = ''; ST.note = null;
    ST.A = mergeAnswers(P, s && s.A);
    ST.set = APP ? { stage: ST.stage === 'built' ? 'built' : 'plan', tube: s && s.set && s.set.tube === 'fresh' ? 'fresh' : 'lowest' }
      : { stage: s && s.set && s.set.stage === 'built' ? 'built' : 'plan', tube: s && s.set && s.set.tube === 'fresh' ? 'fresh' : 'lowest' };
    ST.cur = APP ? (ST.A.started ? '' : 'start') : (s && typeof s.cur === 'string' && s.cur) || 'start'; /* (the app: back at the next question still to answer) */
    ST.hist = []; ST.edit = null; ST.armed = ''; ST.countDiff = false; ST.focusKey = ''; ST.fitNext = true; ST.dirty = false;
    try { render(); } catch (e) {
      /* a saved state this page cannot draw: start the project afresh rather than leave a blank page (the app keeps the saved answers until a change) */
      ST.A = freshAnswers(P); if (!APP) ST.D = freshData(); ST.set = { stage: APP ? ST.set.stage : 'plan', tube: 'lowest' }; ST.cur = 'start'; ST.edit = null; render(); if (!APP) keep();
      toast(APP ? 'Your saved answers could not be shown, so this starts afresh. They are kept until you change something.' : 'Your saved answers for this project could not be read, so it starts again.');
    }
  }

  /* ---------- changes: every change can be undone ---------- */
  var snap = function () { return JSON.stringify({ A: ST.A, D: ST.D, set: ST.set, cur: ST.cur, edit: ST.edit }); };
  /* everything the page shows for the current answers, on the project's records as they are now */
  function recompute() { var P = proj(); if (!APP) applyData(P, ST.D); return compute(P, ST.A, ST.set); }
  function change(fn, opt) {
    opt = opt || {};
    if (APP && ST.view) { toast(ST.view); return; } /* the app: an accepted task is view-only */
    if (APP && ST.busy) { toast('Saving…'); return; }
    ST.hist.push(snap()); if (ST.hist.length > 80) ST.hist.shift();
    var was = ST.cur + '|' + (ST.edit ? ST.edit.kind + ST.edit.id : '');
    if (APP) ST.ops = [];
    fn(ST.A, ST.set);
    var after = function () {
      ST.dirty = true; ST.armed = ''; ST.note = opt.note || null; ST.otherOpen = '';
      if (opt.advance) { ST.edit = null; ST.ctx = recompute(); ST.cur = nextQ(); }
      if (opt.cur) { ST.cur = opt.cur; ST.edit = null; }
      render(); keep();
      var tt = typeof opt.toast === 'function' ? opt.toast() : opt.toast;
      if (tt) toast(tt); else hideToast();
      if (ST.cur + '|' + (ST.edit ? ST.edit.kind + ST.edit.id : '') !== was) settle();
    };
    var ops = APP ? ST.ops : null; ST.ops = null;
    if (!ops || !ops.length) { after(); return; }
    /* the app: a size or a cable ID is written on the project's own record or cable first; the page goes on with what the app answers */
    ST.busy = true;
    hostOps(ops).then(function (r) {
      ST.busy = false;
      if (!r.ok) { var s0 = JSON.parse(ST.hist.pop()); ST.A = s0.A; ST.set = s0.set; render(); if (!r.cancelled) toast(r.msg || 'Not saved. Try again.'); return; }
      var top = JSON.parse(ST.hist[ST.hist.length - 1]); top.ops = r.undo; ST.hist[ST.hist.length - 1] = JSON.stringify(top);
      if (r.project) ST.P = fromApp(r.project);
      after();
    });
  }
  /* a new card: for a moment it takes no taps, so a nervous double tap cannot also answer the next question under the same finger */
  var settleT = 0;
  function settle() {
    var card = $('#card'); if (!card) return;
    var t0 = ST.tapAt && Date.now() - ST.tapAt < 200 ? ST.tapAt : Date.now(); /* from the tap itself, not from when the drawing finished */
    ST.settleUntil = t0 + 220; ST.settleFrom = ST.tapFrom || 'card'; ST.tapFrom = ''; card.classList.add('settling'); clearTimeout(settleT);
    settleT = setTimeout(function () { card.classList.remove('settling'); }, Math.max(0, ST.settleUntil - Date.now()));
  }
  /* the app: the queued writes, one cable (RUN) or ODF record at a time, each with what puts it back (Undo); one that fails puts back
     those already written (rare: one change writes one thing) */
  var hostOne = function (x) { return x.k === 'odf' ? HOST.setOdfSize(x.id, x.to) : HOST.setRun(x.fid, x.o); };
  function hostSeq(list) {
    var last = null, i = 0;
    var next = function () {
      if (i >= list.length) return Promise.resolve({ ok: true, project: last });
      var x = list[i++];
      return Promise.resolve(hostOne(x)).then(function (r) { if (!r || !r.ok) return { ok: false, msg: r && r.msg, cancelled: !!(r && r.cancelled), at: i - 1 }; if (r.project) last = r.project; return next(); });
    };
    return next();
  }
  function hostOps(ops) {
    if (!HOST) return Promise.resolve({ ok: false, msg: 'The app is not there: close this page and open it again from the Drawing.' });
    var order = [], runs = {};
    ops.forEach(function (o) {
      if (o.k === 'odf') { order.push({ k: 'odf', id: o.id, to: o.to, inv: { k: 'odf', id: o.id, to: o.from } }); return; }
      var x = runs[o.fid]; if (!x) { x = runs[o.fid] = { k: 'run', fid: o.fid, o: {}, inv: { k: 'run', fid: o.fid, o: {} } }; order.push(x); }
      x.o[o.key] = o.to; if (!(o.inv.key in x.inv.o)) x.inv.o[o.inv.key] = o.inv.to;
    });
    var undo = order.map(function (x) { return x.inv; }).reverse();
    return hostSeq(order).then(function (r) {
      if (r.ok) return { ok: true, project: r.project, undo: undo };
      var back = order.slice(0, r.at).map(function (x) { return x.inv; }).reverse();
      return (back.length ? hostSeq(back) : Promise.resolve()).then(function () { return r; }, function () { return r; });
    }).then(null, function (e) { return { ok: false, msg: 'Not saved: ' + ((e && e.message) || 'try again') }; });
  }
  function hostUndo(list) {
    if (!HOST) return Promise.resolve({ ok: false, msg: 'The app is not there.' });
    return hostSeq(list).then(null, function (e) { return { ok: false, msg: 'Not undone: ' + ((e && e.message) || 'try again') }; });
  }
  function undo() {
    if (!ST.hist.length) return;
    if (APP && ST.view) return;
    if (APP && ST.busy) { toast('Saving…'); return; }
    var was = legSnap(), top = JSON.parse(ST.hist[ST.hist.length - 1]);
    var back = function (s) { ST.A = s.A; ST.D = APP ? null : cleanData(s.D); ST.set = s.set; ST.cur = s.cur; ST.edit = s.edit; ST.armed = ''; ST.note = null; ST.otherOpen = ''; ST.dirty = true; render(); keep(); toast('Undone.' + legMoves(was)); }; /* and where the legs went back to, when they moved */
    if (APP && top.ops && top.ops.length) { /* the app: the record's or the cable's old size or ID is written back first */
      ST.busy = true;
      hostUndo(top.ops).then(function (r) { ST.busy = false; if (!r.ok) { toast(r.msg || 'Not undone. Try again.'); return; } if (r.project) ST.P = fromApp(r.project); ST.hist.pop(); back(top); });
      return;
    }
    ST.hist.pop(); back(top);
  }
  /* the legs' fibers before a size change, and in words where they went after it ("Leg 1 now F31-42 on CL-0903.") */
  function legSnap() { var o = {}; ((ST.ctx && ST.ctx.plan.legs) || []).forEach(function (l) { var f = {}; l.fibers.forEach(function (x) { f[x.key] = x.text; }); o[l.id] = { f: f, ports: 'P' + (l.portA || '-') + ' / P' + (l.portB || '-') }; }); return o; }
  function legMoves(was, what) {
    var out = [];
    ((ST.ctx && ST.ctx.plan.legs) || []).forEach(function (l) {
      var w = was[l.id]; if (!w || l.state === 'future') return;
      var who = 'Leg ' + (l.index + 1), ch = l.fibers.filter(function (x) { return w.f[x.key] !== x.text; }), ports = 'P' + (l.portA || '-') + ' / P' + (l.portB || '-');
      var on = function (k) { var cb = C().cab[k]; return (cb && cb.name ? '' : 'the ') + cdesc(k); };
      if (ch.length) out.push(ch.map(function (x) { return x.text ? who + ' now ' + x.text + ' on ' + on(x.key) : who + ' has no free fibers on ' + on(x.key); }).join('; '));
      else if (what === 'ports' && ports !== w.ports) out.push(who + ' now ' + ports);
    });
    return out.length ? ' ' + out.join('; ') + '.' : '';
  }
  function nextQ() { var q = ST.ctx.qs.filter(function (x) { return x.key !== 'ready' && !x.done; })[0]; return q ? q.key : 'ready'; }

  /* ---------- words ---------- */
  var C = function () { return ST.ctx; };
  var nm = function (id) { return nameOf(C().B, ST.A, id); };
  function cdesc(key, long) {
    var c = C().cab[key]; if (!c) return 'cable';
    var s = c.name ? c.name : (c.status === 'existing' ? 'existing ' : 'new ') + c.size + 'C cable';
    return long ? s + ' (' + nm(c.from) + ' – ' + nm(c.to) + ')' : s;
  }
  function legTitle(l) { return '<span class="legcap">' + esc(l.label) + '</span>' + esc(nm(l.a)) + ' → ' + esc(nm(l.b)); }
  function endKind(id) {
    var B = C().B; if (id.indexOf('off:') === 0) return 'existing homing, off the map';
    var p = B.ptBy[id]; if (!p) return ''; return p.type === 'dnap' ? (p.status === 'new' ? 'new small cell (dummy NAP)' : 'existing dummy NAP') : p.status === 'new' ? 'new site' : 'existing homing';
  }
  function stateWords(st) {
    var built = ST.set.stage === 'built';
    if (st === 'future') return built ? 'Not built yet' : 'Later (second cable)';
    if (!built) return 'Planned now';
    return st === 'spliced' ? 'Spliced only, test later' : 'Tested end to end';
  }
  /* a fiber check in plain words: green when there are enough free fibers, red with what to do when not */
  function fiberCheck(l, f) {
    var cb = C().cab[f.key], where = (f.existing ? 'the existing ' : 'the new ') + cb.size + 'C cable' + (cb.name ? ' ' + cb.name : '');
    var span = esc(nm(f.ends[0])) + ' → ' + esc(nm(f.ends[1])), how = (f.locked ? ' · locked at export' : f.hand ? ' · moved by hand' : '') +
      (f.buffers && f.buffers.length > 1 && l.n <= (f.fpt || 12) ? ' · spans the ' + bufList(f.buffers) + ' buffers' : '');
    var moved = f.moved ? '<small>Moved from <span class="mono">' + esc(f.moved) + '</span>: ' + (f.hand ? 'those fibers are not free any more.' : 'the leg grew and the next fibers belong to another leg.') + '</small>' : '';
    if (f.ok && f.tbc && f.tbc.length) {
      var tid = f.tbc[0];
      return '<div class="ck warn"><div>Not confirmed: <b class="mono">' + esc(f.text) + '</b><small>on ' + esc(where) + ', ' + span + '. It assumes nothing is live at ' + esc(f.tbcNames.join(' and ')) + ': check its live ports before cutting.</small>' + moved +
        '<button class="btn small" type="button" data-act="goto" data-arg="' + esc('live:' + tid) + '">Mark the live ports</button></div></div>';
    }
    if (f.ok) return '<div class="ck ok"><div>Enough free fibers: <b class="mono">' + esc(f.text) + '</b><small>on ' + esc(where) + ', ' + span + how + '</small>' + moved + '</div></div>';
    var have = f.list.length, head, advice, btn;
    if (f.limit) {
      head = 'Not enough free fibers: the ' + f.limit.cap + '-port FDU at ' + esc(f.limit.name) + ' ends only ' + f.limit.n + ' fibers of ' + esc(where);
      advice = span + '. ' + (have ? 'Only ' + have + ' of the ' + l.n + ' fibers fit. ' : '') + 'Choose fewer fibers, or a bigger FDU.';
      btn = '<button class="btn small" type="button" data-act="openPt" data-arg="' + esc(f.limit.id) + '">The FDU ›</button><button class="btn small" type="button" data-act="openLeg" data-arg="' + esc(l.id) + '">Fewer fibers ›</button>';
    } else {
      head = 'Not enough free fibers on ' + esc(where) + ': only ' + f.free + ' free';
      advice = span + '. ' + (f.existing ? 'Untick a buffer you are not sure of, choose fewer fibers, or check the live ports.' : 'Choose fewer fibers, or move another leg.');
      btn = '<button class="btn small" type="button" data-act="openStrip" data-arg="' + esc(l.id + '|' + f.key) + '">Change fibers ›</button>';
    }
    return '<div class="ck bad"><div>' + head + '<small>' + advice + '</small>' + moved + '<div class="ckbtns">' + btn + '</div></div></div>';
  }

  /* =====================================================================================================
     THE DRAWING: pan with a finger, pinch or the buttons to zoom, tap anything to change it
     ===================================================================================================== */
  function Viewer(host, onTap) {
    this.host = host; this.onTap = onTap; this.vb = null; this.svg = null; this.ptrs = {}; this.pinch = null; this.anim = 0; this.moved = false;
    var self = this;
    host.addEventListener('pointerdown', function (e) { self.down(e); });
    host.addEventListener('pointermove', function (e) { self.move(e); });
    host.addEventListener('pointerup', function (e) { self.up(e); });
    host.addEventListener('pointercancel', function (e) { delete self.ptrs[e.pointerId]; self.pinch = null; host.classList.remove('panning'); });
    host.addEventListener('wheel', function (e) { e.preventDefault(); var r = host.getBoundingClientRect(); self.zoom(Math.exp(e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  }
  Viewer.prototype.size = function () { return { w: Math.max(1, this.host.clientWidth), h: Math.max(1, this.host.clientHeight) }; };
  Viewer.prototype.set = function (svgText) {
    this.host.innerHTML = svgText; this.svg = this.host.querySelector('svg');
    this.svg.setAttribute('width', '100%'); this.svg.setAttribute('height', '100%'); this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (this.vb) this.apply();
  };
  Viewer.prototype.apply = function () { var v = this.vb, f = function (x) { return Math.round(x * 100) / 100; }; if (this.svg && v && v.w > 0 && v.h > 0 && isFinite(v.x + v.y + v.w + v.h)) this.svg.setAttribute('viewBox', f(v.x) + ' ' + f(v.y) + ' ' + f(v.w) + ' ' + f(v.h)); };
  Viewer.prototype.scale = function () { return this.size().w / this.vb.w; };
  /* the user-space box of the groups whose data-ref passes the test */
  Viewer.prototype.box = function (test) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, els = this.svg ? this.svg.querySelectorAll('[data-ref]') : [];
    for (var i = 0; i < els.length; i++) {
      if (!test(els[i].getAttribute('data-ref'))) continue;
      var b; try { b = els[i].getBBox(); } catch (e) { continue; }
      if (!b || (!b.width && !b.height)) continue;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    }
    return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  Viewer.prototype.target = function (box, pad, minW) {
    var S = this.size(), ar = S.h / S.w, w = Math.max(box.w + 2 * pad, minW || 0), h = box.h + 2 * pad;
    if (h > w * ar) w = h / ar; h = w * ar;
    return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w: w, h: h };
  };
  Viewer.prototype.go = function (vb, animate) {
    var self = this, from = this.vb; cancelAnimationFrame(this.anim);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!from || !animate || reduce) { this.vb = vb; this.apply(); return; }
    var t0 = performance.now(), D = 280;
    var step = function (t) {
      var k = Math.max(0, Math.min(1, (t - t0) / D)), e = 1 - Math.pow(1 - k, 3); /* a frame stamped before the start must not run the ease backwards */
      self.vb = { x: from.x + (vb.x - from.x) * e, y: from.y + (vb.y - from.y) * e, w: from.w + (vb.w - from.w) * e, h: from.h + (vb.h - from.h) * e }; self.apply();
      if (k < 1) self.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  };
  Viewer.prototype.fit = function (box, pad, minW, animate) { if (!box) box = { x: 0, y: 0, w: SP.SHEET.W, h: SP.SHEET.H }; this.go(this.target(box, pad == null ? 6 : pad, minW), animate); };
  Viewer.prototype.resize = function () { if (!this.vb) return; var S = this.size(), cx = this.vb.x + this.vb.w / 2, cy = this.vb.y + this.vb.h / 2, w = this.vb.w, h = w * S.h / S.w; this.vb = { x: cx - w / 2, y: cy - h / 2, w: w, h: h }; this.apply(); };
  Viewer.prototype.zoom = function (k, px, py) {
    if (!this.vb) return; var S = this.size(); if (px == null) { px = S.w / 2; py = S.h / 2; }
    var s = this.scale(), ux = this.vb.x + px / s, uy = this.vb.y + py / s, w = Math.max(20, Math.min(SP.SHEET.W * 2.2, this.vb.w * k)), h = w * S.h / S.w;
    cancelAnimationFrame(this.anim); this.vb = { x: ux - px * w / S.w, y: uy - py * w / S.w, w: w, h: h }; this.apply();
  };
  Viewer.prototype.down = function (e) {
    var r = this.host.getBoundingClientRect();
    this.ptrs[e.pointerId] = { x: e.clientX - r.left, y: e.clientY - r.top, x0: e.clientX, y0: e.clientY, t0: Date.now(), target: e.target };
    try { this.host.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    var ids = Object.keys(this.ptrs);
    if (ids.length === 1) this.moved = false;
    if (ids.length === 2) { var a = this.ptrs[ids[0]], b = this.ptrs[ids[1]]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, vb: Object.assign({}, this.vb), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; this.moved = true; }
  };
  Viewer.prototype.move = function (e) {
    var p = this.ptrs[e.pointerId]; if (!p || !this.vb) return;
    var r = this.host.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, ids = Object.keys(this.ptrs);
    if (ids.length >= 2 && this.pinch) {
      p.x = x; p.y = y; var a = this.ptrs[ids[0]], b = this.ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var S = this.size(), v0 = this.pinch.vb, w = Math.max(20, Math.min(SP.SHEET.W * 2.2, v0.w * this.pinch.d / d)), ux = v0.x + this.pinch.mx * v0.w / S.w, uy = v0.y + this.pinch.my * v0.w / S.w;
      cancelAnimationFrame(this.anim); this.vb = { x: ux - mx * w / S.w, y: uy - my * w / S.w, w: w, h: w * S.h / S.w }; this.apply(); return;
    }
    if (!this.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8) return;
    this.moved = true; this.host.classList.add('panning');
    var s = this.scale(); cancelAnimationFrame(this.anim);
    this.vb.x -= (x - p.x) / s; this.vb.y -= (y - p.y) / s; p.x = x; p.y = y; this.apply();
  };
  Viewer.prototype.up = function (e) {
    var p = this.ptrs[e.pointerId]; delete this.ptrs[e.pointerId];
    if (Object.keys(this.ptrs).length < 2) this.pinch = null;
    if (!Object.keys(this.ptrs).length) this.host.classList.remove('panning');
    if (!p || this.moved || Date.now() - p.t0 > 700) return;
    var ref = this.refAt(e.clientX, e.clientY, p.target);
    if (this.onTap) this.onTap(ref);
  };
  /* the thing under a finger: what was touched, else the nearest tap target within about 22 px (a finger is wider than a line) */
  Viewer.prototype.refAt = function (cx, cy, target) {
    var g = target && target.closest ? target.closest('[data-ref]') : null;
    if (g && this.host.contains(g)) return g.getAttribute('data-ref');
    var rings = [[0, 0]];
    [8, 15, 22].forEach(function (r) { for (var i = 0; i < 12; i++) rings.push([r * Math.cos(i * Math.PI / 6), r * Math.sin(i * Math.PI / 6)]); });
    for (var k = 0; k < rings.length; k++) {
      var el = document.elementFromPoint(cx + rings[k][0], cy + rings[k][1]), h = el && el.closest ? el.closest('[data-ref]') : null;
      if (h && this.host.contains(h)) return h.getAttribute('data-ref');
    }
    return null;
  };
  /* a soft amber box behind what is being asked */
  Viewer.prototype.mark = function (refs) {
    if (!this.svg) return; var old = this.svg.querySelector('.focus-ov'); if (old) old.remove();
    if (!refs || !refs.length) return;
    var NS = 'http://www.w3.org/2000/svg', g = document.createElementNS(NS, 'g'), els = this.svg.querySelectorAll('[data-ref]');
    g.setAttribute('class', 'focus-ov');
    for (var i = 0; i < els.length; i++) {
      if (refs.indexOf(els[i].getAttribute('data-ref')) < 0) continue;
      var b; try { b = els[i].getBBox(); } catch (e) { continue; } if (!b.width && !b.height) continue;
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', b.x - 1.4); r.setAttribute('y', b.y - 1.4); r.setAttribute('width', b.width + 2.8); r.setAttribute('height', b.height + 2.8); r.setAttribute('rx', 1.6);
      g.appendChild(r);
    }
    this.svg.insertBefore(g, this.svg.children[1] || null);
  };

  /* ---------- what the drawing shows for the current question or card ---------- */
  function focusOf() {
    var c = C(), A = ST.A, B = c.B, legs = c.plan.legs || [];
    var legRefs = function (l) { var r = ['leg:' + l.id, 'pt:' + l.a, 'pt:' + l.b]; l.fibers.forEach(function (f) { r.push('cab:' + f.key); }); return r; };
    if (ST.edit) {
      var e = ST.edit;
      if (e.kind === 'leg' || e.kind === 'test') { var l = c.legBy[e.id]; return l ? (e.home || e.kind === 'test') && l.routed ? { mark: ['leg:' + l.id], zoom: ['pt:' + l.home], key: 'home:' + e.id, minW: 64 } : { mark: ['leg:' + l.id], zoom: l.state === 'future' ? null : legRefs(l), key: 'leg:' + e.id } : { mark: [], zoom: null, key: 'none' }; }
      if (e.kind === 'strip') return { mark: ['cab:' + (ST.strip && ST.strip.key)], zoom: ['cab:' + (ST.strip && ST.strip.key)], key: 'strip:' + (ST.strip && ST.strip.key) };
      if (e.kind === 'cable') { var rk = e.run ? B.pieces.filter(function (p) { return p.fid === e.run; }).map(function (p) { return 'cab:' + p.key; }) : ['cab:' + e.id]; return { mark: rk, zoom: rk, key: 'cab:' + e.id + (e.run ? '|run' : '') }; }
      return { mark: ['pt:' + e.id], zoom: ['pt:' + e.id], key: 'pt:' + e.id };
    }
    var k = ST.cur, i = k.indexOf(':'), t = i < 0 ? k : k.slice(0, i), id = i < 0 ? '' : k.slice(i + 1);
    if (t === 'start') return { mark: ['pt:' + A.start], zoom: phone() ? ['pt:' + A.start] : null, key: k };
    if (t === 'off') { var oid = 'off:' + id, pcs = B.pieces.filter(function (p) { return p.from === oid || p.to === oid; }).map(function (p) { return 'cab:' + p.key; }); return { mark: ['pt:' + oid].concat(pcs), zoom: ['pt:' + oid].concat(pcs), key: k }; }
    if (t === 'to') return { mark: c.reach.list.map(function (x) { return 'pt:' + x; }), zoom: null, key: k };
    if (t === 'count' || t === 'tested') return { mark: legs.map(function (l) { return 'leg:' + l.id; }), zoom: null, key: k };
    if (t === 'size' || t === 'split' || t === 'live') return { mark: ['pt:' + id], zoom: ['pt:' + id], key: k };
    if (t === 'tubes') { var ks = B.pieces.filter(function (p) { return p.fid === id; }).map(function (p) { return 'cab:' + p.key; }); return { mark: ks, zoom: ks, key: k }; }
    return { mark: [], zoom: null, key: k };
  }

  /* =====================================================================================================
     RENDERING
     ===================================================================================================== */
  var viewer = null;
  function render() {
    var P = proj(); ST.ctx = recompute();
    if (!ST.ctx.qs.some(function (q) { return q.key === ST.cur; })) ST.cur = nextQ();
    if (ST.edit && !editValid()) ST.edit = null;
    $('#projName').textContent = APP ? P.name || 'This project' : P.id.slice(1) + ' · ' + P.name;
    $('#undoBtn').disabled = !ST.hist.length;
    if (APP) { $('#undoBtn').hidden = !!ST.view; var vo = $('#viewOnly'); if (vo) { vo.hidden = !ST.view; var why = String(ST.view || '').split(/: /)[0].replace(/\.$/, ''); vo.textContent = ST.view ? 'View only: ' + why + '. You can look and export; nothing can be changed.' : ''; vo.title = ST.view; } }
    var badge = $('#stageBadge'); badge.textContent = ST.set.stage === 'built' ? 'AS-BUILT' : 'AS-PLAN'; badge.setAttribute('data-stage', ST.set.stage);
    var ids = ST.ctx.unnamed.length, ib = $('#idsBtn');
    ib.hidden = !ids;
    if (APP) { var iw = ids + ' cable ID' + (ids === 1 ? '' : 's') + ' to follow'; ib.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO.tag + '</svg><b>' + ids + '</b>'; ib.setAttribute('aria-label', iw); ib.title = iw; }
    else ib.innerHTML = '<b>' + ids + '</b> cable ID' + (ids === 1 ? '' : 's') + ' to follow';
    drawStage(); renderBar(); renderCard();
  }
  /* the app: the page's actions as icon buttons (the owner: icon mode). The words stay where they are the content (a homing, a size, a
     format) or where an icon would not be clear; each icon button keeps its words as its name (aria-label) and tooltip (title). */
  var ICO = { ok: '<path d="M5 12.5l4.5 4.5L19 7"/>', next: '<path d="M5 12h14M13 6l6 6-6 6"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    exp: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 18v2h14v-2"/>', sheets: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 15h18M13 15v4"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.5"/>' };
  function icoOf(b) {
    var a = b.getAttribute('data-act') || '', t = (b.textContent || '').trim();
    if (b.classList.contains('armed') || /^(Yes,|Tap again)/.test(t)) return '';
    if (a === 'start' || a === 'to') return 'next';
    if (/^(countDone|liveDone|tubesDone|offTyped|cabId|futId|runOtherUse|saveTest)$/.test(a) || ((a === 'openLeg' || a === 'sizeOpen') && t === 'Done')) return 'ok';
    if (a === 'sizeOpen' || a === 'openSize') return 'edit';
    if (a === 'export') return 'exp';
    if (a === 'sheets') return 'sheets';
    return '';
  }
  function iconize(root) {
    if (!APP || !root) return;
    [].forEach.call(root.querySelectorAll('button.btn[data-act]'), function (b) {
      var k = icoOf(b); if (!k) return; var t = (b.textContent || '').trim().replace(/\s*›$/, '');
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', t); b.title = t; b.classList.add('ico'); b.classList.remove('wide');
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[k] + '</svg>';
      var row = b.parentNode; if (row && row.classList && row.classList.contains('btnrow')) row.classList.add('icorow');
    });
  }
  function editValid() {
    var e = ST.edit, c = ST.ctx;
    if (e.kind === 'leg' || e.kind === 'test' || e.kind === 'strip') return !!c.legBy[e.id];
    if (e.kind === 'cable') return !!c.cab[e.id];
    return !!(c.B.ptBy[e.id] || c.B.offBy[e.id]);
  }
  function drawStage() {
    var sh = ST.ctx.sheets[0]; if (!sh) return;
    viewer.set(SP.toSVG(sh, { hit: 2.6 }));
    var F = focusOf(), changed = F.key !== ST.focusKey; ST.focusKey = F.key;
    viewer.mark(F.mark);
    if (viewer.size().h < 40) { ST.fitNext = true; return; } /* folded away while typing: fit when it comes back */
    if (ST.fitNext || !viewer.vb) { ST.fitNext = false; fitAll(false); if (F.zoom) zoomTo(F.zoom, false, F.minW); return; }
    if (changed) { if (F.zoom) zoomTo(F.zoom, true, F.minW); else fitAll(true); }
  }
  function fitAll(animate) { viewer.fit(viewer.box(function (r) { return /^(pt|cab):/.test(r); }), 6, 0, animate); }
  function zoomTo(refs, animate, minW) { var b = viewer.box(function (r) { return refs.indexOf(r) >= 0 && !/^leg:/.test(r); }); if (b) viewer.fit(b, 8, minW || (phone() ? 96 : 150), animate); else fitAll(animate); }

  /* ---------- the countdown and the answer pills ---------- */
  function pillText(q) {
    var A = ST.A, c = C(), t = q.key.split(':')[0], id = q.key.slice(t.length + 1);
    if (t === 'start') return 'Start · ' + nm(A.start);
    if (t === 'off') return q.done ? 'Off the map · ' + String(A.off[id]).toUpperCase() : 'Leaves the map';
    if (t === 'to') { var n = (A.to || []).length, f = (A.later || []).length; return !q.done ? 'Where to' : 'To · ' + (n > 1 ? (n === 2 ? 'Both' : 'All ' + n) : n ? nm(A.to[0]) : 'later') + (f ? ' + ' + f + ' later' : ''); }
    if (t === 'count') { var legs = c.plan.legs || [], ns = legs.map(function (l) { return l.n; }); return ns.every(function (x) { return x === ns[0]; }) ? ns[0] + ' fibers' : ns.join(' / ') + ' fibers'; }
    if (t === 'size') return nm(id) + ' · ' + (A.size[id] ? A.size[id] + ' ports' : 'size?');
    if (t === 'split') return nm(id) + ' · port split' + (A.split[id] === 'need' ? ': as used' : A.split[id] === 'half' ? ': half' : '');
    if (t === 'tested') { var ls = (c.plan.legs || []).filter(function (l) { return l.state !== 'future' && l.routed; }), tested = ls.filter(function (l) { return l.state === 'tested'; }); return !q.done ? 'Tested now?' : 'Tested · ' + (tested.length === ls.length ? (ls.length === 2 ? 'both' : 'all') : tested.length ? tested.map(function (l) { return nm(l.b); }).join(', ') : 'none'); }
    if (t === 'live') return nm(id) + ' ports';
    if (t === 'tubes') return 'Buffers · ' + c.B.pieces.filter(function (p) { return p.fid === id; })[0].size + 'C cable';
    return 'Ready';
  }
  function renderBar() {
    var c = C(), cnt = $('#count');
    if (c.left) { cnt.className = 'count'; cnt.innerHTML = 'Still to answer: <b>' + c.left + '</b>'; }
    else if (c.status === 'fix') { var nx = c.shortOwn.length + c.sizeIssues.length, wx = !c.sizeIssues.length ? 'leg' : !c.shortOwn.length ? 'size' : 'thing'; cnt.className = 'count fix'; cnt.innerHTML = 'Fix <b>' + nx + '</b> ' + wx + (nx === 1 ? '' : 's'); }
    else if (c.status === 'confirm') { cnt.className = 'count confirm'; cnt.innerHTML = 'Ready · <b>' + c.confirm.length + '</b> to confirm'; }
    else { cnt.className = 'count ready'; cnt.innerHTML = 'Ready · Export'; }
    var html = c.qs.map(function (q) {
      var cls = 'pill' + (q.key === ST.cur && !ST.edit ? ' cur' : '') + (q.key === 'ready' ? '' : q.done ? ' done' : ' todo');
      return '<button type="button" class="' + cls + '" data-act="goto" data-arg="' + esc(q.key) + '">' + esc(pillText(q)) + '</button>';
    }).join('');
    var pills = $('#pills'); pills.innerHTML = html;
    var cur = pills.querySelector('.cur');
    if (cur) { var pr = pills.getBoundingClientRect(), cr = cur.getBoundingClientRect(); if (cr.left < pr.left || cr.right > pr.right) pills.scrollLeft += cr.left - pr.left - 8; }
  }

  /* ---------- the card ---------- */
  function renderCard() {
    var card = $('#card'), html;
    if (ST.edit) html = editCard();
    else {
      var k = ST.cur, t = k.split(':')[0], id = k.slice(t.length + 1);
      html = ({ start: qStart, off: qOff, to: qTo, count: qCount, size: qSize, split: qSplit, tested: qTested, live: qLive, tubes: qTubes, ready: qReady }[t] || qReady)(id);
    }
    var keepScroll = card.getAttribute('data-k') === (ST.edit ? 'e' + ST.edit.kind + ST.edit.id : ST.cur) ? card.scrollTop : 0;
    card.innerHTML = html; card.setAttribute('data-k', ST.edit ? 'e' + ST.edit.kind + ST.edit.id : ST.cur); card.scrollTop = keepScroll;
    iconize(card); wireCard(card);
    if (ST.reveal) { var rv = ST.reveal; ST.reveal = ''; revealSize(rv); }
  }
  /* on a short phone card: bring the size's red message (after a pick), or its chips (opened from the Sizes list), into view, never past the size line */
  function revealSize(what) {
    var card = $('#card'), sl = $('#card .sizeline'); if (!card || !sl) return;
    var t = what === 'issue' ? $('#card .sizeissue') : $('#card .fptrow') || $('#card .szchips'); if (!t) return;
    var cr = card.getBoundingClientRect(), tr = t.getBoundingClientRect(), up = sl.getBoundingClientRect().top - cr.top - 8;
    if (tr.bottom > cr.bottom - 8 && up > 0) card.scrollTop += Math.min(tr.bottom - cr.bottom + 16, up);
  }
  /* "Question 4 of 6": the total agrees with the countdown (answered + still to answer) */
  function kicker(n) {
    var c = C(), i = c.qs.map(function (q) { return q.key; }).indexOf(ST.cur), done = c.qs.filter(function (q) { return q.key !== 'ready' && q.done; }).length, tot = Math.max(done + c.left, i + 1);
    return '<div class="kick">' + (n || ('Question ' + (i + 1) + ' of ' + tot)) + '</div>';
  }

  /* the app: what the page leaves out of this project, said once in the first card (and where the homings are picked), never in the way */
  function appNotes() {
    var N = (APP && ST.P && ST.P.notes) || [], out = [];
    N.forEach(function (n) {
      if (n === 'olt') out.push('OLT sites (Broadband) come later: only the tower sites are drawn.');
      else if (n.indexOf('both:') === 0) out.push(n.slice(5) + ' has a closure and a dummy NAP: the closure is drawn; the dummy NAP is not drawn yet.');
    });
    return out.length ? '<p class="note appnote">' + out.map(esc).join('<br>') + '</p>' : '';
  }
  function qStart() {
    var c = C(), B = c.B, A = ST.A;
    var homes = B.points.filter(function (p) { return p.type === 'site' && p.id !== A.start && !B.beyond[p.id]; }).length + B.offEnds.filter(function (e) { return !B.beyond[e.id]; }).length, clo = B.points.filter(function (p) { return p.type === 'closure'; }).length, offs = B.offEnds.filter(function (e) { return !B.beyond[e.id]; }).length;
    var news = startsOf(B), s = B.ptBy[A.start] || {};
    if (news.indexOf(s) < 0 && B.ptBy[A.start]) news = [s].concat(news); /* (an earlier start stays listed as the start) */
    var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
    var html = kicker('Splicing details') + '<h2>Let\'s join the fibers</h2>' +
      '<p class="lead">I found ' + (s.type === 'dnap' ? '1 new small cell' : plural(news.filter(function (p) { return p.type === 'site'; }).length, 'new site')) + ', ' + plural(homes, 'homing') + ', ' + plural(clo, 'closure') + ' and ' + plural(B.pieces.length, 'cable') + (B.pieces.length > B.runs.length ? ' (a cable cut at a closure counts twice)' : '') +
      (offs ? '. ' + (offs === 1 ? 'One cable leaves' : offs + ' cables leave') + ' the map' : '') + '. You answer a few questions; the drawing fills in as you go.</p>';
    html += '<div class="box"><div class="kick">Starting from</div><b style="font-size:18px">' + esc(s.name || '?') + '</b><div class="note" style="margin:2px 0 0">' + esc(endKind(A.start)) + (s.ports ? ' · ' + s.ports + '-port FDU (from its ODF record)' : '') + '</div></div>';
    html += appNotes();
    html += '<div class="btnrow sticky"><button type="button" class="btn primary wide" data-act="start">' + (A.started ? 'Continue' + (c.left ? ' (' + c.left + ' left)' : '') : 'Start') + '</button></div>';
    if (news.length > 1) {
      html += '<div class="sep">Or start from another new site</div><div class="rows">' + news.filter(function (p) { return p.id !== A.start; }).map(function (p) {
        return '<button type="button" class="row" data-act="pickStart" data-arg="' + esc(p.id) + '"><span class="ic new">＋</span><span class="tx"><b>' + esc(p.name) + '</b><span>' + esc(endKind(p.id)) + '</span></span><span class="go">›</span></button>';
      }).join('') + '</div>';
    }
    return html;
  }
  function qOff(pole) {
    var B = C().B, e = B.offBy['off:' + pole], P = proj(), cur = String(ST.A.off[pole] || '');
    var html = kicker() + '<h2>This cable leaves the map. Where does it go?</h2><p class="lead">The ' + (e.ex ? 'existing ' : 'new ') + e.size + 'C cable stops at pole <b>' + esc(e.at) + '</b>, at the edge of the project. Name the homing it goes to, once.</p>' + (canMap() ? '<div class="mapends">' + mapPill('off:' + pole, 'Pole ' + e.at) + '</div>' : '');
    if ((P.refNames || []).length) html += '<div class="sep">From the reference map</div><div class="rows">' + P.refNames.map(function (n) {
      return '<button type="button" class="row' + (cur.toUpperCase() === n ? ' on' : '') + '" data-act="off" data-arg="' + esc(pole + '|' + n) + '"><span class="ic exist">⌂</span><span class="tx"><b>' + esc(n) + '</b><span>a pin on the reference map</span></span><span class="go">›</span></button>';
    }).join('') + '</div>';
    html += '<div class="field"><label for="offName">Or type its name</label><input class="inp" id="offName" autocomplete="off" autocapitalize="characters" maxlength="32" placeholder="Homing name" value="' + esc(cur) + '"></div>' +
      '<div class="btnrow"><button type="button" class="btn primary wide" data-act="offTyped" data-arg="' + esc(pole) + '">Use this name</button></div>';
    return html;
  }
  function qTo() {
    var c = C(), A = ST.A, R = c.reach, built = ST.set.stage === 'built';
    var html = kicker() + '<h2>Where does it go?</h2><p class="lead">Tap where ' + esc(nm(A.start)) + '\'s fibers go, here or on the drawing. Nearest by cable first.</p><div class="rows">';
    if (R.list.length > 1) html += '<button type="button" class="row top' + (A.toDone && A.to.length === R.list.length ? ' on' : '') + '" data-act="to" data-arg="' + esc(R.list.join(',')) + '"><span class="ic">' + R.list.length + '</span><span class="tx"><b>' + (R.list.length === 2 ? 'Both' : 'All ' + R.list.length) + ' (' + R.list.length + ' legs)</b><span>' + esc(R.list.map(nm).join(' and ')) + '</span></span><span class="go">›</span></button>';
    R.list.forEach(function (id) {
      var on = A.toDone && A.to.length === 1 && A.to[0] === id;
      html += '<button type="button" class="row' + (on ? ' on' : '') + '" data-act="to" data-arg="' + esc(id) + '"><span class="ic ' + (isExistingEnd(c.B, id) ? 'exist' : 'new') + '">⌂</span><span class="tx"><b>' + esc(nm(id)) + '</b><span>' + esc(endKind(id)) + ' · ' + kmTxt(R.dist[id]) + ' by cable</span></span><span class="go">›</span></button>';
    });
    /* a cable that leaves the map: its homing is named first */
    (R.unnamed || []).forEach(function (oid) {
      var e = c.B.offBy[oid];
      html += '<button type="button" class="row" data-act="goto" data-arg="' + esc('off:' + e.pole) + '"><span class="ic exist">?</span><span class="tx"><b>Name the homing first</b><span>A cable leaves the map at pole ' + esc(e.at) + ' · ' + kmTxt(c.reach.unnamedDist ? c.reach.unnamedDist[oid] : 0) + '</span></span><span class="go">›</span></button>';
    });
    if (!R.list.length && !(R.unnamed || []).length) html += '<div class="ck warn"><div>No cable reaches another homing from here yet.<small>Draw the route in Route mode first, or add a homing below as a later leg.</small></div></div>';
    html += '</div>' + appNotes();
    if (R.none.length) {
      html += '<div class="sep">No cable reaches these yet</div><div class="rows">' + R.none.map(function (id) {
        var on = (A.later || []).indexOf(id) >= 0;
        return '<button type="button" class="row' + (on ? ' on' : ' off') + '" data-act="later" data-arg="' + esc(id) + '"><span class="ic">' + (on ? '✓' : '＋') + '</span><span class="tx"><b>' + esc(nm(id)) + '</b><span>' + (on ? 'Added as a ' + (built ? 'not-built-yet' : 'later') + ' leg (second cable, xx-xx)' : 'No cable yet · add as a later leg') + '</span></span></button>';
      }).join('') + '</div>';
      if ((A.later || []).length) html += '<div class="btnrow"><button type="button" class="btn primary wide" data-act="to" data-arg="' + esc(A.toDone ? (A.to || []).join(',') : '') + '">' + (A.toDone && (A.to || []).length ? 'Next' : R.list.length ? 'Next: only the later leg' + ((A.later || []).length > 1 ? 's' : '') : 'Next') + '</button></div>';
    }
    return html;
  }
  function qCount() {
    var c = C(), legs = c.plan.legs || [], A = ST.A, def = defaultCount(c.B, A), ns = legs.map(function (l) { return l.n; }), same = ns.every(function (x) { return x === ns[0]; });
    var lit = A.countDone && same ? ns[0] : (!A.countDone ? 0 : -1);
    var html = kicker() + '<h2>How many fibers' + (legs.length > 1 ? ' for each leg' : '') + '?</h2><p class="lead">' + (def === 2 ? '2 is the usual for a small cell.' : '6 is the usual for a site.') + (legs.length > 1 ? ' The same for every leg.' : '') + '</p>';
    html += '<div class="chips">' + [2, 4, 6, 12].map(function (n) { return '<button type="button" class="chip' + (n === lit || (!A.countDone && n === def) ? ' lit' : '') + '" data-act="count" data-arg="' + n + '">' + n + '</button>'; }).join('') + '</div>';
    if (legs.length > 1) {
      if (!ST.countDiff && same) html += '<button type="button" class="link" data-act="countDiff">Different for each leg ›</button>';
      else {
        html += '<div class="sep">Each leg</div>' + legs.map(function (l) {
          return '<div class="box"><div>' + legTitle(l) + '</div><div class="chips">' + [2, 4, 6, 12].map(function (n) { return '<button type="button" class="chip sm' + (l.n === n ? ' lit' : '') + '" data-act="countLeg" data-arg="' + esc(l.id + '|' + n) + '">' + n + '</button>'; }).join('') + '</div></div>';
        }).join('') + '<div class="btnrow"><button type="button" class="btn primary wide" data-act="countDone">Done</button></div>';
      }
    }
    html += '<h3>What this gives</h3>' + legs.map(function (l) {
      return '<div class="note"><b>' + esc(l.label) + ' → ' + esc(nm(l.b)) + ':</b> ' + (l.state === 'future' ? 'xx-xx (' + esc(stateWords('future').toLowerCase()) + ')' : l.fibers.map(function (f) { return '<span class="mono">' + esc(f.text) + '</span>'; }).join(' → ')) + '</div>';
    }).join('');
    return html;
  }
  function qSize(id) {
    var A = ST.A, cur = +A.size[id] || 0, p = C().B.ptBy[id], rec = APP && p && p.odf ? C().B.by[p.odf] : null;
    return kicker() + '<h2>How many ports has ' + esc(nm(id)) + '\'s new FDU?</h2><p class="lead">' + (rec ? 'Its ODF record ' + esc(String(rec.poleId || 'ODF').toUpperCase()) + ' has no size yet. The size you pick goes on that record (plan and BOQ).' : 'There is no ODF record near this site, so the app does not know its size.') + '</p>' +
      '<div class="chips">' + ODF_SIZES.map(function (n) { return '<button type="button" class="chip' + (cur === n ? ' lit' : '') + '" data-act="size" data-arg="' + esc(id + '|' + n) + '">' + n + '</button>'; }).join('') + '</div>' +
      '<p class="note">Adding an ODF record beside the site in the survey fills this in by itself. You can change it later: tap the FDU on the drawing, or Sizes on the Ready screen.</p>';
  }
  /* what each answer gives, worked out by the engine itself (so the words match the drawing) */
  function splitWords(f, mode) {
    var m = JSON.parse(JSON.stringify(C().model)), pt = m.points.filter(function (p) { return p.id === f.id; })[0]; if (!pt) return '';
    pt.split = mode; var g = (SP.assign(m).fdus || []).filter(function (x) { return x.id === f.id; })[0]; if (!g) return '';
    return g.windows.map(function (w) { return w.ports.length ? 'P' + SP.fmtRanges(w.ports) : '-'; }).join(' / ');
  }
  function qSplit(id) {
    var f = C().fduBy[id], cur = ST.A.split[id] || '';
    return kicker() + '<h2>How are ' + esc(nm(id)) + '\'s ' + f.cap + ' ports shared between the ' + f.windows.length + ' cables?</h2><p class="lead">Two cables end on this new FDU. You can change this later by tapping the FDU on the drawing.</p><div class="rows">' +
      '<button type="button" class="row' + (cur === 'half' ? ' on' : '') + '" data-act="split" data-arg="' + esc(id + '|half') + '"><span class="ic">½</span><span class="tx"><b>Half and half</b><span>' + esc(splitWords(f, 'half')) + '</span></span><span class="go">›</span></button>' +
      '<button type="button" class="row' + (cur === 'need' ? ' on' : '') + '" data-act="split" data-arg="' + esc(id + '|need') + '"><span class="ic">≡</span><span class="tx"><b>Only what each leg uses</b><span>' + esc(splitWords(f, 'need')) + '</span></span><span class="go">›</span></button></div>';
  }
  function qTested() {
    var c = C(), legs = (c.plan.legs || []).filter(function (l) { return l.state !== 'future' && l.routed; }), A = ST.A;
    var all = A.testedDone && legs.every(function (l) { return l.state === 'tested'; });
    var html = kicker() + '<h2>Will ' + (legs.length === 2 ? 'both' : 'all ' + legs.length) + ' homings be tested end to end now?</h2><p class="lead">The other leg stays spliced at the closure: its fibers are kept for it and drawn FOR FUTURE TESTING.</p><div class="rows">' +
      '<button type="button" class="row' + (all ? ' on' : '') + '" data-act="tested" data-arg="all"><span class="ic">✓</span><span class="tx"><b>Yes, ' + (legs.length === 2 ? 'both' : 'all') + '</b><span>Every leg tested end to end</span></span><span class="go">›</span></button>';
    legs.forEach(function (l) {
      var on = A.testedDone && l.state === 'tested' && legs.filter(function (x) { return x.state === 'tested'; }).length === 1;
      html += '<button type="button" class="row' + (on ? ' on' : '') + '" data-act="tested" data-arg="' + esc(l.id) + '"><span class="ic">1</span><span class="tx"><b>Only ' + esc(nm(l.b)) + '</b><span>The other' + (legs.length > 2 ? 's are' : ' is') + ' spliced only, tested later</span></span><span class="go">›</span></button>';
    });
    return html + '</div>';
  }
  /* the fibers per buffer of the cable that ends on an FDU (its existing cable first: there port = fiber), so its rows are its buffers */
  function fptAt(id) {
    var c = C(), f = c.fduBy[id], ws = f ? f.windows : [], ex = ws.filter(function (w) { return c.cab[w.key] && c.cab[w.key].status === 'existing'; }), set = [];
    (ex.length ? ex : ws).forEach(function (w) { var cb = c.cab[w.key]; if (cb && set.indexOf(cb.fpt) < 0) set.push(cb.fpt); });
    return set.length === 1 && set[0] > 0 ? set[0] : 12;
  }
  /* the live ports of an existing FDU: tap a port, drag along a row, or tap a row's colour; one row per buffer of its cable (12 or 6) */
  function portGrid(id) {
    var f = C().fduBy[id], cap = f ? f.cap : 72, on = SP.parseRanges(liveOf(ST.A, id) === '?' ? '' : liveOf(ST.A, id)), legP = [], B = fptAt(id);
    if (f) f.legs.forEach(function (l) { legP = legP.concat(l.ports); });
    var html = '<div class="pgrid' + (B !== 12 ? ' b' + B : '') + '" data-site="' + esc(id) + '" data-cap="' + cap + '" data-fpt="' + B + '">';
    for (var r = 0; r * B < cap; r++) {
      var p0 = r * B + 1, p1 = Math.min(cap, r * B + B);
      html += '<div class="prow" data-buffer="' + (r + 1) + '"><button type="button" class="phead" data-row="' + r + '" style="--tc:' + tubeRgb(r + 1) + '" aria-label="' + tubeName(r + 1) + ' buffer row, ports ' + p0 + ' to ' + p1 + '"><i></i>' + p0 + '-' + p1 + '</button><div class="pcells">';
      for (var p = p0; p <= p1; p++) html += '<span class="pc' + (on.indexOf(p) >= 0 ? ' on' : '') + (legP.indexOf(p) >= 0 ? ' leg' : '') + '" data-p="' + p + '" role="button" aria-pressed="' + (on.indexOf(p) >= 0) + '">' + p + '</span>';
      html += '</div></div>';
    }
    return html + '</div><div class="legend"><span><i class="lv"></i>live now</span><span><i style="box-shadow:inset 0 0 0 2px var(--new)"></i>this work\'s legs</span><span>one row per buffer of ' + B + '</span></div>';
  }
  function liveSummary(id) {
    var v = liveOf(ST.A, id), f = C().fduBy[id], past = v && v !== '?' && f ? SP.parseRanges(v).filter(function (q) { return q > f.cap; }) : [];
    return v === '?' ? (ST.A.live[id] === '?' ? 'Not sure yet: prints TO BE CONFIRMED' : 'Nothing marked yet') : v ? 'Live: ' + v + (past.length ? ' (' + SP.fmtRanges(past) + ' past port ' + f.cap + ', left out)' : '') : 'None live';
  }
  function liveChips(id) {
    var A = ST.A, others = C().qs.filter(function (q) { return q.key.indexOf('live:') === 0 && q.id !== id && A.live[q.id] != null && A.live[q.id] !== '?'; });
    var cur = A.live[id];
    return '<div class="chips">' + others.map(function (q) { return '<button type="button" class="chip soft" data-act="liveSame" data-arg="' + esc(id + '|' + q.id) + '">Same as ' + esc(nm(q.id)) + '</button>'; }).join('') +
      '<button type="button" class="chip soft' + (cur === '' ? ' lit' : '') + '" data-act="liveNone" data-arg="' + esc(id) + '">None are live</button>' +
      '<button type="button" class="chip soft' + (cur === '?' ? ' lit' : '') + '" data-act="liveTbc" data-arg="' + esc(id) + '">Not sure yet</button></div>';
  }
  function qLive(id) {
    var f = C().fduBy[id], L = (C().plan.legs || []).filter(function (l) { return l.a === id || l.b === id; }).length;
    return kicker() + '<h2>Which ports of ' + esc(nm(id)) + '\'s FDU are live?</h2><p class="lead">' + (L ? '' : 'This work cuts the cable that ends there. ') + 'Tap the ports in use now, slide along a row, or tap a row\'s colour for all ' + fptAt(id) + '. ' + (f ? f.cap + ' ports' + ((fduRow(id) || {}).src === 'odf' ? ' (from its ODF record)' : (fduRow(id) || {}).src === 'answer' ? ' (the size you gave)' : ' (from the cable size)') + '. <button type="button" class="link" data-act="openSize" data-arg="' + esc('pt:' + id) + '">Wrong size? Change it ›</button>' : '') + '</p>' +
      liveChips(id) + '<div class="msg" id="liveSum">' + esc(liveSummary(id)) + '</div>' + portGrid(id) +
      '<div class="btnrow sticky"><button type="button" class="btn primary wide" data-act="liveDone" data-arg="' + esc(id) + '">Done</button></div>';
  }
  /* tubes: once for the whole physical cable (its RUN) */
  function tubeButtons(fid) {
    var c = C(), pcs = c.B.pieces.filter(function (p) { return p.fid === fid; }), size = pcs[0].size, fpt = pcs[0].fpt || 12, nT = Math.ceil(size / fpt), on = tubesOf(ST.A, fid), dots = c.dots[fid] || [], fresh = ST.set.tube === 'fresh';
    var legF = []; pcs.forEach(function (p) { var ci = c.infoBy[p.key]; if (ci) ci.legs.forEach(function (l) { legF = legF.concat(l.fibers); }); });
    var html = '<div class="tubes' + (fpt !== 12 ? ' b' + fpt : '') + '" data-fpt="' + fpt + '">';
    for (var t = 1; t <= nT; t++) {
      var f0 = (t - 1) * fpt + 1, f1 = Math.min(size, t * fpt), live = dots.filter(function (f) { return f >= f0 && f <= f1; }), ticked = on.indexOf(t) >= 0, mine = legF.filter(function (f) { return f >= f0 && f <= f1; });
      var kept = fresh && live.length && !ticked, st = ticked ? 'In use ✓' : mine.length ? 'This work: ' + SP.fmtRanges(mine, 'F') : kept ? 'Kept whole (live fibers)' : live.length ? (live.length === f1 - f0 + 1 ? 'All live' : live.length + ' live, the rest free') : 'Free';
      html += '<button type="button" class="tube' + (ticked ? ' on' : '') + (kept ? ' kept' : '') + (mine.length && !ticked ? ' leg' : '') + '" data-act="tube" data-arg="' + esc(fid + '|' + t) + '" aria-pressed="' + ticked + '" style="--tc:' + tubeRgb(t) + '">' +
        '<span class="tt"><i></i>' + tubeName(t) + '<em>F' + f0 + '-' + f1 + '</em></span><span class="dots">';
      for (var f = f0; f <= f1; f++) html += '<i class="' + (live.indexOf(f) >= 0 ? 'live' : '') + '" style="--fc:' + SP.fiberColor(f, fpt).fiber.rgb + '"></i>';
      html += '</span><span class="st">' + esc(st) + '</span></button>';
    }
    return html + '</div>';
  }
  function gives(fid) {
    var c = C(), keys = c.B.pieces.filter(function (p) { return p.fid === fid; }).map(function (p) { return p.key; }), out = [];
    (c.plan.legs || []).forEach(function (l) { l.fibers.forEach(function (f) { if (keys.indexOf(f.key) >= 0) out.push({ l: l, f: f }); }); });
    if (!out.length) return '<div class="ck info"><div>No leg uses this cable yet.</div></div>';
    return out.map(function (x) {
      return x.f.ok ? '<div class="ck ok"><div>This gives <b class="mono">' + esc(x.f.text) + '</b><small>' + esc(x.l.label + ' → ' + nm(x.l.b)) + (x.f.fixed ? ' · moved by hand' : '') + '</small></div></div>' : fiberCheck(x.l, x.f);
    }).join('');
  }
  function qTubes(fid) {
    var c = C(), pcs = c.B.pieces.filter(function (p) { return p.fid === fid; }), dots = c.dots[fid] || [];
    var where = pcs.map(function (p) { return nm(p.from) + ' – ' + nm(p.to); }).join(', ');
    var r = runRow(fid);
    return kicker() + '<h2>Which buffers of this cable are in use?</h2><p class="lead">The existing ' + pcs[0].size + 'C cable ' + esc(where) + (r ? ', ' + Math.ceil(r.size / r.fpt) + ' buffers of ' + r.fpt : '') + '. ' +
      (dots.length ? 'Fibers with a stripe are live at the FDU (' + esc(SP.fmtRanges(dots, 'F')) + '): they are never used. ' : '') + 'Tick a buffer (tube) that is in use for something else.</p>' +
      (ST.set.tube === 'fresh' ? '<div class="ck info"><div>Fresh buffer is on: a buffer with a live fiber is kept whole.</div></div>' : '') +
      (r ? fptChips(r) : '') + tubeButtons(fid) + '<div id="gives">' + gives(fid) + '</div>' +
      '<div class="btnrow sticky"><button type="button" class="btn primary wide" data-act="tubesDone" data-arg="' + esc(fid) + '">Done</button></div>';
  }
  function warningsOf() {
    var c = C(), heads = (c.shortBySize || []).map(function (l) { return 'Leg ' + (l.index + 1) + ' ('; });
    return (c.plan.warnings || []).filter(function (w) {
      if (/ has no cable yet\.$/.test(w)) return false;
      if (/^NOT NAMED YET/.test(w)) return false;
      /* a leg short only because a size is too small: the size's red message says it (once) */
      if (/ of the \d+ fibers (are )?free\.$/.test(w) && heads.some(function (h) { return w.indexOf(h) === 0; })) return false;
      return true;
    });
  }
  function qReady() {
    var c = C(), A = ST.A, legs = c.plan.legs || [], built = ST.set.stage === 'built', html = '';
    if (c.left) {
      html += kicker('Almost there') + '<h2>Still to answer: ' + c.left + '</h2><div class="rows">' + c.qs.filter(function (q) { return q.key !== 'ready' && !q.done; }).map(function (q) {
        return '<button type="button" class="row" data-act="goto" data-arg="' + esc(q.key) + '"><span class="ic">?</span><span class="tx"><b>' + esc(pillText(q)) + '</b></span><span class="go">›</span></button>';
      }).join('') + '</div>';
    } else if (c.status === 'fix') {
      var nZ = c.sizeIssues.length, own = c.shortOwn, by = c.shortBySize, legsW = function (L) { return L.map(function (l) { return 'Leg ' + (l.index + 1); }).join(' and '); };
      html += kicker(built ? 'As-Built' : 'As-Plan') + (!nZ ? '<h2>Not enough free fibers on ' + (own.length === 1 ? '1 leg' : own.length + ' legs') + '</h2><p class="lead">Every question is answered, but ' + (own.length === 1 ? 'this leg does' : 'these legs do') + ' not get all ' + (own.length === 1 ? 'its' : 'their') + ' fibers. Fix it first; if you export anyway, the drawing marks it NOT ENOUGH FREE FIBERS.</p>'
        : c.sizeIssues.every(function (x) { return x.notSet; }) ? '<h2>' + (nZ === 1 ? 'A cable has no type yet' : nZ + ' cables have no type yet') + '</h2><p class="lead">Every question is answered. Pick ' + (nZ === 1 ? 'its' : 'their') + ' size first (or set the cable in Route → Cables): until then the drawing guesses the cable.' +
          (own.length ? ' Also, ' + legsW(own) + (own.length === 1 ? ' is' : ' are') + ' short of free fibers (below).' : '') + '</p>'
        : '<h2>' + (nZ === 1 ? 'A size is too small' : nZ + ' sizes are too small') + '</h2><p class="lead">Every question is answered, but the fibers of this work do not fit' + (by.length ? ': ' + legsW(by) + (by.length === 1 ? ' does' : ' do') + ' not get all ' + (by.length === 1 ? 'its' : 'their') + ' fibers until the size is right' : '') + '. Change the size first.' +
          (own.length ? ' Also, ' + legsW(own) + (own.length === 1 ? ' is' : ' are') + ' short of free fibers (below).' : '') + '</p>') +
        c.sizeIssues.map(sizeIssueBox).join('') +
        own.map(function (l) { return '<div class="box"><div style="margin-bottom:4px"><button type="button" class="link" style="padding:0" data-act="openLeg" data-arg="' + esc(l.id) + '">' + legTitle(l) + ' ›</button></div>' + l.fibers.filter(function (f) { return !f.ok; }).map(function (f) { return fiberCheck(l, f); }).join('') + '</div>'; }).join('');
    } else if (c.status === 'confirm') {
      html += kicker(built ? 'As-Built' : 'As-Plan') + '<h2>Ready, ' + c.confirm.length + ' fact' + (c.confirm.length === 1 ? '' : 's') + ' to confirm</h2><p class="lead">The live ports at ' + esc(c.confirm.join(' and ')) + ' are not sure yet, so the fibers there assume nothing is live. The drawing prints LIVE PORTS TBC until you mark them.</p>' +
        c.confirm.map(function (n) { var f = (c.plan.fdus || []).filter(function (x) { return x.name === n; })[0]; return f ? '<div class="btnrow"><button type="button" class="btn" data-act="goto" data-arg="' + esc('live:' + f.id) + '">Mark the live ports at ' + esc(n) + '</button></div>' : ''; }).join('');
    } else html += kicker(built ? 'As-Built' : 'As-Plan') + '<h2>Ready</h2><p class="lead">Nothing left to answer. Tap anything on the drawing to change it.</p>';
    html += '<div class="btnrow"><button type="button" class="btn ' + (c.status === 'ready' ? 'go ' : '') + '" data-act="export">' + (c.status === 'ready' || c.left ? 'Export' : 'Export anyway') + '</button><button type="button" class="btn" data-act="sheets">See the A3 sheets</button></div>' +
      '<button type="button" class="link" data-act="sizesJump">FDU and cable sizes, fibers per buffer ›</button>';
    if (A.locked) html += '<div class="ck info"><div>Fibers are locked since the first export, so they stay as issued.<small>A new leg fits around them. Moving a leg by hand still works.</small><button type="button" class="btn small" data-act="unlock">Let the app choose again</button></div></div>';
    html += '<h3>Fibers check</h3>' + (c.status === 'fix' ? '' : c.sizeIssues.map(sizeIssueBox).join('')) + (legs.length ? legs.map(function (l) {
      return '<div class="box"><div style="margin-bottom:4px"><button type="button" class="link" style="padding:0" data-act="openLeg" data-arg="' + esc(l.id) + '">' + legTitle(l) + ' ›</button></div>' +
        (l.state === 'future' ? '<div class="ck info"><div>' + esc(stateWords('future')) + ': fibers <b class="mono">xx-xx</b><small>A second cable into the new FDU' + (l.futureCable ? ' (' + esc(l.futureCable) + ')' : '') + '. Nothing is taken for it now.</small></div></div>' :
          !l.routed ? '<div class="ck bad"><div>No cable joins these two yet.</div></div>' : l.fibers.map(function (f) { return fiberCheck(l, f); }).join('')) + '</div>';
    }).join('') : '<p class="note">No legs yet.</p>');
    html += sizesList();
    if (built) {
      var wait = legs.filter(function (l) { return l.routed && l.state !== 'future' && (l.state === 'spliced' || l.state === 'tbc' || !(l.test && (l.test.date || l.test.loss))); });
      html += '<h3>Testing</h3>' + legs.map(function (l) {
        var w = wait.indexOf(l) >= 0;
        return '<div class="ck ' + (l.state === 'future' ? 'info' : w ? 'warn' : 'ok') + '"><div><b>' + esc(l.label) + ' → ' + esc(nm(l.b)) + '</b><small>' + esc(l.state === 'tbc' ? 'Not answered yet: tested end to end now, or spliced only?' : l.words) + '</small>' +
          (l.state === 'tbc' ? '<button type="button" class="btn small" data-act="goto" data-arg="tested">Answer it</button>' : w ? '<button type="button" class="btn small" data-act="markTested" data-arg="' + esc(l.id) + '">Mark tested</button>' : '') + '</div></div>';
      }).join('');
      if (wait.length) html = html.replace('<h3>Testing</h3>', '<h3>Testing · ' + wait.length + ' leg' + (wait.length === 1 ? '' : 's') + ' waiting</h3>');
    }
    var clos = (c.plan.closures || []).filter(function (x) { return x.splices.length || x.through.length; });
    if (clos.length) html += '<h3>At the closures</h3>' + clos.map(function (x) {
      return '<div class="box"><button type="button" class="link" style="padding:0" data-act="openPt" data-arg="' + esc(x.id) + '"><b>' + esc(x.name) + '</b> · ' + esc(cap1(x.kind)) + ' ›</button>' + spliceWords(x) + '</div>';
    }).join('');
    var W = warningsOf();
    if (W.length) html += '<h3>Check these</h3>' + W.map(function (w) { var at = warnAt(w); return '<div class="ck warn"><div>' + esc(w) + fixFor(w) + '</div>' + (at ? mapBtn(at, nm(at)) : '') + '</div>'; }).join('');
    if (c.unnamed.length) html += '<div class="ck info"><div>' + c.unnamed.length + ' cable ID' + (c.unnamed.length === 1 ? '' : 's') + ' to follow. They print as TBF until you add them; this does not stop the export.<button type="button" class="btn small" data-act="openCable" data-arg="' + esc(c.unnamed[0]) + '">Add a cable ID</button></div></div>';
    return html;
  }
  /* the point a warning is about (its name starts it), for its map pin */
  function warnAt(w) {
    if (/^Leg \d+ /.test(w)) return ''; var B = C().B, ids = B.points.map(function (p) { return p.id; }).concat(B.offEnds.map(function (e) { return e.id; })), best = '';
    ids.forEach(function (id) { var n = nm(id); if (n && w.toUpperCase().indexOf(n.toUpperCase()) === 0 && /^[\s:]/.test(w.slice(n.length)) && n.length > (best ? nm(best).length : 0)) best = id; });
    return best;
  }
  function fixFor(w) {
    var c = C(), m = /^Leg (\d+) /.exec(w);
    if (m) { var l = (c.plan.legs || [])[+m[1] - 1]; if (l) return /Mark tested/.test(w) ? '<button type="button" class="btn small" data-act="markTested" data-arg="' + esc(l.id) + '">Mark tested</button>' : '<button type="button" class="btn small" data-act="openLeg" data-arg="' + esc(l.id) + '">Open the leg</button>'; }
    var s = /^(.*): its live ports are not confirmed/.exec(w);
    if (s) { var id = (c.plan.fdus || []).filter(function (f) { return f.name.toUpperCase() === s[1].toUpperCase(); }).map(function (f) { return f.id; })[0]; if (id) return '<button type="button" class="btn small" data-act="goto" data-arg="' + esc('live:' + id) + '">Mark the live ports</button>'; }
    return '';
  }
  /* a closure's splices in plain words, from the legs that pass it */
  function spliceWords(x) {
    var c = C(), out = [];
    (c.plan.legs || []).forEach(function (l) {
      for (var i = 0; i + 1 < l.fibers.length; i++) if (l.fibers[i].ends[1] === x.id) {
        var a = l.fibers[i], b = l.fibers[i + 1];
        out.push('<div class="note" style="color:var(--ink)"><span class="mono">' + esc(a.text || 'no free fibers') + '</span> of the ' + esc(cdesc(a.key)) + ' → <span class="mono">' + esc(b.text || 'no free fibers') + '</span> of the ' + esc(cdesc(b.key)) + ', toward ' + esc(nm(l.b)) +
          (ST.set.stage === 'built' && l.state === 'spliced' ? ' <i>(spliced only)</i>' : '') + '</div>');
      }
    });
    x.through.forEach(function (t) { out.push('<div class="note">Passing through, not cut: <span class="mono">' + esc(t.text) + '</span></div>'); });
    return out.join('') || '<div class="note">No splices here.</div>';
  }

  /* ---------- sizes: the FDU's ports, the cable's fibers and fibers per buffer, edited on the project's records ---------- */
  var fduRow = function (id) { return C().sizes.fdus.filter(function (r) { return r.id === id; })[0]; };
  var runRow = function (fid) { return C().sizes.runs.filter(function (r) { return r.fid === fid; })[0]; };
  var bufList = function (ts) { var n = ts.map(function (t) { return tubeName(t).toLowerCase() + (t > 12 ? ' ' + t : ''); }); return n.length < 2 ? n[0] : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
  /* what a size change edits, in one line */
  function fduWhere(r) {
    if (r.src === 'odf') return 'This changes the ODF record ' + r.odfName + ' (plan and BOQ).';
    if (r.id.indexOf('off:') === 0) return 'This homing is off the map, so its size is kept with the splicing answers.';
    return 'There is no ODF record near this site, so this is the size you gave' + (r.existing ? '' : ' to "How many ports has its new FDU?"') + '. An ODF record beside the site in the survey replaces it.';
  }
  /* what was marked past a size can be removed in one tap (Undo brings it back) */
  function pastBtn(x) {
    if (x.past && x.past.length) return '<button type="button" class="btn small" data-act="livePastDrop" data-arg="' + esc(x.id) + '">Not live: remove ' + esc(SP.fmtRanges(x.past)) + '</button>';
    if (x.pastT && x.pastT.length) return '<button type="button" class="btn small" data-act="tubesPastDrop" data-arg="' + esc(x.fid) + '">Not in use: untick ' + (x.pastT.length === 1 ? 'it' : 'them') + '</button>';
    return '';
  }
  function sizeIssueBox(x) {
    return '<div class="ck bad"><div>' + esc(x.text) + '<div class="ckbtns"><button type="button" class="btn small" data-act="openSize" data-arg="' + esc(x.key) + '">Change the size ›</button>' + pastBtn(x) + '</div></div>' + (x.kind === 'fdu' ? mapBtn(x.id, nm(x.id)) : '') + '</div>';
  }
  function fduSizeBlock(id) {
    var r = fduRow(id); if (!r) return '';
    var open = ST.sizeOpen === 'pt:' + id, src = r.src === 'odf' ? 'From the ODF record ' + r.odfName : r.src === 'answer' ? 'The size you gave' : 'From the cable size (no ODF record)';
    var html = '<div class="sizeline"><span class="sz">Capacity: <b>' + r.cap + ' ports</b><small>' + esc(src) + '</small></span><button type="button" class="btn small" data-act="sizeOpen" data-arg="' + esc('pt:' + id) + '" aria-expanded="' + open + '">' + (open ? 'Done' : 'Change') + '</button></div>';
    if (r.issue) html += cardIssue(r.issue, open);
    if (open) html += '<div class="chips szchips" role="group" aria-label="FDU size in ports">' + ODF_SIZES.map(function (n) {
      var on = r.cap === n && r.src !== 'cable'; return '<button type="button" class="chip' + (on ? ' lit' : '') + '" data-act="fduSize" data-arg="' + esc(id + '|' + n) + '" aria-pressed="' + on + '">' + n + '</button>';
    }).join('') + '</div><p class="note">' + esc(fduWhere(r)) + '</p>';
    if (ST.note && ST.note.key === 'pt:' + id) html += '<div class="ck warn"><div>' + esc(ST.note.text) + '</div></div>';
    return html;
  }
  function runSizeBlock(fid) {
    var r = runRow(fid); if (!r) return '';
    var CS = r.sizes || CABLE_SIZES, open = ST.sizeOpen === 'run:' + fid, other = r.existing && CS.indexOf(r.size) < 0;
    var html = '<div class="sizeline"><span class="sz"><b>' + (r.notSet ? 'Cable type not set' : r.size + 'C') + '</b> · ' + (r.existing ? 'existing' : 'new') + (r.existing ? '' : ' · ' + kmTxt(r.len)) + '<small>' + esc('RUN ' + r.n + ': ' + r.fromName + ' → ' + r.toName) + '</small></span>' +
      '<button type="button" class="btn small" data-act="sizeOpen" data-arg="' + esc('run:' + fid) + '" aria-expanded="' + open + '">' + (open ? 'Done' : 'Change') + '</button></div>';
    if (r.issue) html += cardIssue(r.issue, open);
    if (open) {
      html += '<div class="chips szchips" role="group" aria-label="Cable size in fibers">' + CS.map(function (n) {
        return '<button type="button" class="chip' + (r.size === n ? ' lit' : '') + '" data-act="runSize" data-arg="' + esc(fid + '|' + n) + '" aria-pressed="' + (r.size === n) + '">' + n + '</button>';
      }).join('') + (r.existing ? '<button type="button" class="chip soft' + (other ? ' lit' : '') + '" data-act="runOther" data-arg="' + esc(fid) + '" aria-pressed="' + other + '">' + (other ? 'Other: ' + r.size : 'Other…') + '</button>' : '') + '</div>';
      if (ST.otherOpen === fid) html += '<div class="field"><label for="runOther">Fibers in this existing cable (2 to 576)</label><div class="inrow"><input class="inp" id="runOther" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="' + r.size + '">' +
        '<button type="button" class="btn primary" data-act="runOtherUse" data-arg="' + esc(fid) + '">Use</button></div><small>An existing cable can be any size.</small></div>';
    }
    html += fptChips(r);
    if (r.rest) { var nb = Math.floor(r.size / r.fpt), lt = nb + 1;
      html += '<div class="ck warn"><div>' + r.size + ' fibers is not a whole number of ' + r.fpt + '-fiber buffers: ' + nb + ' buffer' + (nb === 1 ? '' : 's') + ' of ' + r.fpt + ', and a last buffer of ' + r.rest + ' (' + (lt > 12 ? 'the ' + lt + 'th, ' : 'the ') + esc(tubeName(lt).toLowerCase()) + (lt > 12 ? ')' : ' one)') + '.<small>Check the size and the fibers per buffer on the cable.</small></div></div>'; }
    html += '<p class="note">This changes RUN ' + r.n + ' everywhere (plan, BOQ, KMZ)' + (r.keys.length > 1 ? ', all ' + r.keys.length + ' pieces' : '') + '.</p>';
    return html;
  }
  /* on the card itself: red, with the chips one tap away */
  function cardIssue(x, open) {
    var pb = pastBtn(x);
    return '<div class="ck bad sizeissue"><div>' + esc(x.text) + (open && !pb ? '' : '<div class="ckbtns">' + (open ? '' : '<button type="button" class="btn small" data-act="sizeOpen" data-arg="' + esc(x.key) + '">Change the size</button>') + pb + '</div>') + '</div></div>';
  }
  function fptChips(r) {
    return '<div class="fptrow"><span class="k">Fibers per buffer</span><span class="chips" role="group" aria-label="Fibers per buffer">' + FPTS.map(function (n) {
      return '<button type="button" class="chip sm' + (r.fpt === n ? ' lit' : '') + '" data-act="runFpt" data-arg="' + esc(r.fid + '|' + n) + '" aria-pressed="' + (r.fpt === n) + '">' + n + '</button>';
    }).join('') + '</span></div><p class="note">Most cables have 12 fibers per buffer; some have 6.</p>';
  }
  /* the Ready screen's list: every FDU and every cable (one row per RUN), a tap opens its card with the sizes */
  function sizesList() {
    var z = C().sizes;
    var row = function (key, t, sub, v, bad) {
      return '<button type="button" class="lrow' + (bad ? ' bad' : '') + '" data-act="openSize" data-arg="' + esc(key) + '"><span class="t">' + esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="v">' + esc(v) + '</span><span class="go" aria-hidden="true">›</span></button>';
    };
    return '<h3 id="sizesH">Sizes</h3><div class="slist">' + z.fdus.map(function (r) {
      return row('pt:' + r.id, r.name + ' FDU', r.issue ? r.sub : '', r.cap + ' ports', !!r.issue);
    }).join('') + z.runs.map(function (r) {
      /* (each cable told apart by its ID, or its RUN until it has one: two cables between the same two points read the same otherwise) */
      var who = r.cid ? String(r.cid).toUpperCase() : 'RUN ' + r.n;
      return row('run:' + r.fid, 'Cable ' + r.fromName + ' → ' + r.toName, who + ' · ' + (r.issue ? r.sub : r.fpt + ' fibers per buffer' + (r.rest ? ' (the last has ' + r.rest + ')' : '')), (r.existing ? 'existing ' : '') + r.size + 'C', !!r.issue);
    }).join('') + '</div>';
  }
  /* the project's records: an edit back to the made-up value leaves no edit behind */
  function setOdf(recId, n) {
    if (APP) { /* the app: queued for the ODF record itself (written through the app when the change is made) */
      var rr = C().B.by[recId], from = rr ? parseInt(String((rr.boq || {}).odf || ''), 10) || 0 : 0;
      if (n !== from) ST.ops.push({ k: 'odf', id: recId, to: n, from: from }); return;
    }
    var b = baseOf(proj()).records.filter(function (r) { return r.id === recId; })[0], bv = b ? parseInt(String((b.boq || {}).odf || ''), 10) || 0 : 0;
    if (n === bv) delete ST.D.odf[recId]; else ST.D.odf[recId] = n;
  }
  function setRun(fid, k, v) {
    if (APP) { /* the app: queued for the cable (RUN) itself; Undo writes back what it was (a new cable's type, so no question is asked) */
      var R = (proj().runs || []).filter(function (x) { return x.fid === fid; })[0]; if (!R) return;
      var cur = k === 'size' ? R.size : k === 'fpt' ? R.fpt : R.cid || '';
      var inv = k === 'size' ? (R.ex ? { key: 'size', to: R.size } : { key: 'cab', to: R.cab || '' }) : k === 'fpt' ? { key: 'fpt', to: R.fpt } : { key: 'cid', to: R.cid || '' };
      if (v !== cur) ST.ops.push({ k: 'run', fid: fid, key: k, to: v, inv: inv }); return;
    }
    var b = baseOf(proj()).runs.filter(function (R) { return R.fid === fid; })[0] || {}, bv = k === 'fpt' ? +b.fpt || 12 : +b.size, o = Object.assign({}, ST.D.run[fid]);
    if (v === bv) delete o[k]; else o[k] = v;
    if (Object.keys(o).length) ST.D.run[fid] = o; else delete ST.D.run[fid];
  }

  /* ---------- the cards opened by tapping the drawing ---------- */
  /* the app's record behind a point of the page (to show it on the map): a closure or a dummy NAP is its pin when one stands on the pole,
     a cable's end off the map is the ODF beside it, else its pole */
  function recOf(id) {
    var B = C().B, pins = (ST.P && ST.P.pins) || {}; if (!id) return '';
    if (id.indexOf('off:') === 0) { var e = B.offBy[id]; return e ? e.odf || e.pole : ''; }
    var p = B.ptBy[id]; if (!p) return '';
    return (p.type === 'closure' && (pins[id] || {}).closure) || (p.type === 'dnap' && (pins[id] || {}).dnap) || id;
  }
  var canMap = function () { return !!(APP && HOST && typeof HOST.showOnMap === 'function'); };
  var PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>';
  /* a map pin: closes the page and shows that record on the app's map, centred and ringed (the app only) */
  function mapBtn(id, name, cls) {
    var r = canMap() ? recOf(id) : ''; if (!r) return '';
    var t = 'Show ' + (name || 'it') + ' on the map';
    return '<button type="button" class="mapb' + (cls ? ' ' + cls : '') + '" data-act="map" data-arg="' + esc(r) + '" aria-label="' + esc(t) + '" title="' + esc(t) + '">' + PIN + '</button>';
  }
  /* the same as a pill with its words (a cable's two ends, the pole where a cable leaves the map) */
  function mapPill(id, words) { var b = mapBtn(id, words, 'lbl'); return b ? b.replace('</svg></button>', '</svg><span>' + esc(words) + '</span></button>') : ''; }
  function cardHead(kick, title, mapId) { return '<div class="kick">' + esc(kick) + (mapId ? mapBtn(mapId, title.replace(/<span class="note">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '').trim()) : '') + '<button type="button" class="x" data-act="close" aria-label="Back to the questions">×</button></div><h2>' + title + '</h2>'; }
  function editCard() {
    var e = ST.edit;
    if (e.kind === 'leg') return eLeg(e.id);
    if (e.kind === 'test') return eTest(e.id);
    if (e.kind === 'strip') return eStrip(e.id);
    if (e.kind === 'cable') return eCable(e.id);
    var t = typeOf(C().B, e.id);
    return t === 'closure' ? eClosure(e.id) : eFdu(e.id);
  }
  function eLeg(id) {
    var c = C(), l = c.legBy[id], built = ST.set.stage === 'built', can = c.reach.dist[l.b] != null, A = ST.A;
    var html = cardHead('Leg · tap a line to change it', legTitle(l));
    if (l.state === 'tbc') html += '<div class="ck warn"><div>Not answered yet: is this leg tested end to end now?<small>Until you say, the drawing prints TEST STATUS TO BE CONFIRMED.</small></div></div>';
    var rows = built ? [['tested', '✓', 'Tested end to end', 'Spliced, patched at both FDUs and tested'], ['spliced', '◷', 'Spliced only, test later', 'Spliced at the closure; its fibers and ports are kept for it'], ['future', '○', 'Not built yet', 'The cable or the splice comes later (xx-xx)']]
      : [['tested', '●', 'Planned now', 'Its fibers are joined in this work'], ['future', '○', 'Later (second cable)', 'A second cable into the new FDU, later (xx-xx)']];
    var cur = built ? l.state : (l.state === 'future' ? 'future' : 'tested');
    html += '<div class="rows">' + rows.map(function (r) {
      var dis = r[0] !== 'future' && !can;
      return '<button type="button" class="row' + (cur === r[0] ? ' on' : '') + '" data-act="legState" data-arg="' + esc(id + '|' + r[0]) + '"' + (dis ? ' disabled' : '') + '><span class="ic">' + r[1] + '</span><span class="tx"><b>' + r[2] + '</b><span>' + (dis ? 'No cable reaches ' + esc(nm(l.b)) + ' yet' : r[3]) + '</span></span></button>';
    }).join('') + '</div>';
    html += '<h3>Fibers</h3><div class="chips">' + [2, 4, 6, 12].map(function (n) { return '<button type="button" class="chip sm' + (l.n === n ? ' lit' : '') + '" data-act="legCount" data-arg="' + esc(id + '|' + n) + '">' + n + '</button>'; }).join('') + '</div>';
    if (l.state === 'future') {
      html += '<div class="ck info"><div>Fibers <b class="mono">xx-xx</b>' + (l.futureCable ? ' on the second cable ' + esc(l.futureCable) : '') + '<small>The new FDU lists it as "xx-xx (' + esc(l.futureCable || 'TBF') + ')". Nothing is taken for it now.</small></div></div>' +
        '<div class="field"><label for="futId">The second cable\'s ID</label><input class="inp" id="futId" maxlength="24" autocomplete="off" autocapitalize="characters" placeholder="TBF" value="' + esc((A.legs[id] || {}).cable || '') + '"><small>It can come later: it prints TBF until then.</small></div>' +
        '<div class="btnrow"><button type="button" class="btn small" data-act="futId" data-arg="' + esc(id) + '">Save the ID</button></div>';
    } else if (l.routed) {
      html += l.fibers.map(function (f) { return fiberCheck(l, f); }).join('') + '<div class="note">Ports: ' + esc(nm(l.a)) + ' P' + esc(l.portA || '-') + ' · ' + esc(nm(l.b)) + ' P' + esc(l.portB || '-') + (l.viaNames.length ? ' · via ' + esc(l.viaNames.join(', ')) : '') + '</div>';
      html += '<div class="btnrow"><button type="button" class="btn" data-act="openStrip" data-arg="' + esc(id) + '">Change fibers ›</button>' + (built ? '<button type="button" class="btn primary" data-act="markTested" data-arg="' + esc(id) + '">Mark tested</button>' : '') + '</div>';
      if (built && l.test && (l.test.date || l.test.loss)) html += '<div class="ck ok"><div>' + esc(l.words) + '</div></div>';
    }
    var armed = ST.armed === 'rm:' + id;
    html += '<div class="btnrow"><button type="button" class="btn danger' + (armed ? ' armed' : '') + '" data-act="remove" data-arg="' + esc(id) + '">' + (armed ? 'Tap again to remove' : 'Remove this leg') + '</button></div>';
    return html;
  }
  function eTest(id) {
    var l = C().legBy[id], t = (ST.A.legs[id] || {}).test || {};
    return cardHead('Mark tested', legTitle(l)) + '<p class="lead">Saved with the leg. The drawing\'s tag shows the date and the loss.</p>' +
      '<div class="field"><label for="tDate">Date tested</label><input class="inp" id="tDate" type="date" value="' + esc(t.date || todayIso()) + '"><small id="tDateTx">Prints as ' + esc(dmy(t.date || todayIso())) + '</small></div>' +
      '<div class="field"><label for="tLoss">Loss (dB), end to end</label><div class="stepper"><button type="button" class="btn" data-act="lossStep" data-arg="-0.05" aria-label="Less">−</button>' +
      '<input class="inp" id="tLoss" type="text" inputmode="decimal" autocomplete="off" maxlength="6" placeholder="0.00" value="' + esc(t.loss != null ? t.loss : '') + '"><button type="button" class="btn" data-act="lossStep" data-arg="0.05" aria-label="More">+</button></div><small>Like 0.42 (a comma works too).</small></div>' +
      '<div class="field"><label>OTDR trace or test photo</label><span class="btn filebtn" id="otdrBtn">' + (t.otdr ? '📎 ' + esc(t.otdr) : 'Add the file or a photo') + '<input type="file" id="tOtdr" aria-label="OTDR file or photo"></span><small>In this demo only its name is kept.</small></div>' +
      '<div class="btnrow sticky"><button type="button" class="btn primary wide" data-act="saveTest" data-arg="' + esc(id) + '">' + (ST.armed === 'loss:' + id ? 'Yes, save ' + esc(ST.lossAsk) + ' dB' : 'Save') + '</button></div>';
  }
  function eClosure(id) {
    var c = C(), p = c.B.ptBy[id], x = (c.plan.closures || []).filter(function (q) { return q.id === id; })[0] || { kind: '', splices: [], through: [] }, A = ST.A;
    var html = cardHead(p.status === 'existing' ? 'Existing closure' : 'Proposed closure', esc(p.name) + (p.status === 'new' && /^C\d+$/.test(p.name) ? ' <span class="note">(ID to follow)</span>' : ''), id);
    html += '<dl class="kv"><dt>Where</dt><dd>' + esc(p.where === 'Pole' ? 'On pole ' + p.at : p.where + ' ' + p.at) + (p.size ? ' · ' + esc(p.size) : '') + '</dd><dt>Splicing</dt><dd>' + esc(cap1(x.kind || 'not used yet')) + '</dd>' +
      '<dt>Coordinates</dt><dd class="mono">' + esc(p.coords || 'TBF') + '</dd></dl>' + (p.coords ? '' : '<p class="note">No position yet: the drawings print TBF. Place its pin on the map.</p>');
    html += '<h3>Splices</h3>' + spliceWords(x);
    return html;
  }
  function eFdu(id) {
    var c = C(), B = c.B, p = B.ptBy[id], f = c.fduBy[id], A = ST.A, ex = isExistingEnd(B, id), html;
    if (!f) return cardHead('Site', esc(nm(id)), id) + '<p class="note">Not on the drawing yet.</p>';
    if (f.beyond || B.beyond[id]) { /* past a dummy NAP: the job ends at the dummy NAP; this end is only shown */
      var oe = B.offBy[id];
      if (p && p.type === 'dnap') return cardHead('Not in this job', esc(nm(id)), id) + '<div class="ck info"><div>No leg of this job ends at this dummy NAP. The drawings show it plainly and its cables NOT SPLICED · FOR FUTURE.</div></div>';
      return cardHead('Not in this job', esc(nm(id)), id) + '<div class="ck info"><div>The cable after the dummy NAP goes on to here. It is not spliced now: the drawings show it NOT SPLICED · FOR FUTURE.' +
        (oe && !oe.odf ? '<small>It ends at pole ' + esc(oe.at) + '. An ODF record beside that pole names it on the drawing.</small>' : '') + '</div></div>';
    }
    if (p && p.type === 'dnap') {
      html = cardHead('Dummy NAP (small cell)', esc(p.name), id) + '<dl class="kv"><dt>On pole</dt><dd>' + esc(p.at) + '</dd><dt>Ports</dt><dd>' + f.cap + '</dd></dl>';
      return html + f.legs.map(function (l) { return '<div class="note">' + esc(c.legBy[l.leg] ? c.legBy[l.leg].label : l.leg) + ': fibers <span class="mono">' + esc(SP.fmtRanges(l.fibers, 'F')) + '</span></div>'; }).join('');
    }
    html = cardHead(ex ? 'Existing homing · its FDU' : 'New site · its FDU', esc(nm(id)), id);
    html += '<dl class="kv"><dt>FDU</dt><dd>' + esc(id.indexOf('off:') === 0 ? 'ID to follow' : p.fdu) + '</dd></dl>' + fduSizeBlock(id);
    if (ex) {
      html += '<h3>Live ports before the work</h3>' + portGrid(id) + '<div class="msg" id="liveSum">' + esc(liveSummary(id)) + '</div>' + liveChips(id);
    } else {
      html += '<h3>Terminated</h3>' + f.windows.map(function (w) { return '<div class="note" style="color:var(--ink)">Ports <span class="mono">' + esc(SP.fmtRanges(w.ports) || '-') + '</span> ← fibers <span class="mono">' + esc(SP.fmtRanges(w.fibers) || '-') + '</span> of the ' + esc(cdesc(w.key)) + '</div>'; }).join('') +
        f.future.map(function (n) { return '<div class="note">xx-xx (' + esc(n || 'TBF') + '): a second cable, later</div>'; }).join('');
      if (f.split) html += '<h3>Shared between the cables</h3><div class="chips"><button type="button" class="chip soft' + (f.split === 'half' && A.split[id] ? ' lit' : '') + '" data-act="split" data-arg="' + esc(id + '|half') + '">Half and half</button>' +
        '<button type="button" class="chip soft' + (f.split === 'need' ? ' lit' : '') + '" data-act="split" data-arg="' + esc(id + '|need') + '">Only what each leg uses</button></div>';
    }
    html += f.legs.length ? '<h3>Legs ending here</h3>' + f.legs.map(function (l) { var L = c.legBy[l.leg]; return '<div class="note" style="color:var(--ink)">' + esc(L ? L.label + ' → ' + nm(L.a === id ? L.b : L.a) : l.leg) + ': ports <span class="mono">P' + esc(SP.fmtRanges(l.ports) || '-') + '</span></div>'; }).join('') : '';
    return html;
  }
  function eCable(key) {
    var c = C(), cb = c.cab[key], pc = c.B.pieceBy[key], ci = c.infoBy[key], A = ST.A;
    var html = cardHead((cb.status === 'existing' ? 'Existing ' : 'New ') + cb.size + 'C cable', esc(nm(cb.from)) + ' – ' + esc(nm(cb.to)));
    if (canMap()) { var me = mapPill(cb.from, nm(cb.from)) + mapPill(cb.to, nm(cb.to)); if (me) html += '<div class="mapends">' + me + '</div>'; }
    if (ci && ci.spare) html += '<div class="ck info"><div>Not spliced in this job · for future' + (ci.onward ? '<small>It goes on from the dummy NAP; its fibers are capped there.</small>' : '<small>No leg uses it; its fibers are capped at both ends.</small>') + '</div></div>';
    html += runSizeBlock(pc.fid);
    var idNow = APP ? pc.cid || '' : A.ids[key] || '';
    html += '<div class="field"><label for="cabId">Cable ID' + (APP ? ' of RUN ' + pc.n : '') + '</label><input class="inp" id="cabId" maxlength="24" autocomplete="off" autocapitalize="characters" placeholder="TBF" value="' + esc(idNow) + '"><small>' +
      (APP ? 'Kept on the cable (RUN ' + pc.n + '), so every phone sees it. Each piece prints it with -L1, -L2… It can come later: the drawing prints TBF until then.' : 'Cable IDs can come later: the drawing prints TBF until you add it.') + '</small></div>' +
      '<div class="btnrow"><button type="button" class="btn primary" data-act="cabId" data-arg="' + esc(key) + '">' + (idNow ? 'Rename' : 'Save the ID') + '</button></div>';
    html += '<dl class="kv">' + (cb.status === 'existing' || pc.of < 2 ? '' : '<dt>This piece</dt><dd>' + kmTxt(cb.length) + '</dd>') + '<dt>Cable</dt><dd>RUN ' + pc.n + (pc.of > 1 ? ', piece ' + pc.j + ' of ' + pc.of : '') + '</dd></dl>';
    if (ci && ci.legs.length) html += '<h3>Legs on it</h3>' + ci.legs.map(function (l) { var L = c.legBy[l.leg]; return '<div class="note" style="color:var(--ink)">' + esc(L ? L.label + ' → ' + nm(L.b) : l.leg) + ': <span class="mono">' + esc(SP.fmtRanges(l.fibers, 'F')) + '</span></div>'; }).join('');
    if (cb.status === 'existing') html += '<div class="btnrow"><button type="button" class="btn" data-act="goto" data-arg="' + esc('tubes:' + pc.fid) + '">Buffers in use ›</button></div>';
    return html;
  }
  /* the fiber strip: rows of 12 coloured dots, one row per tube; tap a free dot to move the leg's run there */
  function stripData(legId, key) {
    var c = C(), l = c.legBy[legId], ci = c.infoBy[key], cb = c.cab[key], f = l.fibers.filter(function (x) { return x.key === key; })[0];
    var live = {}, out = {}, other = {}, mine = {};
    ci.live.concat(ci.liveAtFdu).forEach(function (x) { live[x] = 1; });
    ci.outside.forEach(function (x) { out[x] = 1; });
    ci.legs.forEach(function (x) { x.fibers.forEach(function (y) { if (x.leg === legId) mine[y] = 1; else other[y] = 1; }); });
    var free = function (x) { return x >= 1 && x <= cb.size && !live[x] && !out[x] && !other[x]; };
    return { l: l, ci: ci, cb: cb, f: f, n: l.n, live: live, out: out, other: other, mine: mine, free: free, start: f ? f.from : 1, fixed: !!(f && f.fixed) };
  }
  function eStrip(legId) {
    var c = C(), l = c.legBy[legId]; if (!ST.strip || !l.fibers.some(function (f) { return f.key === ST.strip.key; })) ST.strip = { key: (l.fibers.filter(function (f) { return f.existing; })[0] || l.fibers[0]).key, msg: '' };
    var key = ST.strip.key, D = stripData(legId, key), fpt = D.cb.fpt || 12, nT = Math.ceil(D.cb.size / fpt);
    var html = cardHead('Change fibers', legTitle(l)) + '<div class="chips">' + l.fibers.map(function (f) {
      return '<button type="button" class="chip soft sm' + (f.key === key ? ' lit' : '') + '" data-act="stripCable" data-arg="' + esc(f.key) + '"><span>' + esc(nm(f.ends[0]) + ' – ' + nm(f.ends[1])) + '<small>' + esc((f.existing ? 'existing ' : 'new ') + c.cab[f.key].size + 'F') + ' · <span class="mono">' + esc(f.text || 'none') + '</span></small></span></button>';
    }).join('') + '</div>';
    html += '<p class="note" style="color:var(--ink)">On the ' + esc(cdesc(key, true)) + '. Now <b class="mono">' + esc(D.f && D.f.text ? D.f.text : '-') + '</b>' + (D.f && D.f.locked ? ' (locked at export)' : D.fixed ? ' (moved by hand)' : ' (chosen by the app)') + '. Tap a dot to start the run there.</p>';
    html += '<div class="strip' + (fpt !== 12 ? ' b' + fpt : '') + '" data-fpt="' + fpt + '">';
    for (var t = 1; t <= nT; t++) {
      html += '<div class="srow" data-buffer="' + t + '"><span class="shead" style="--tc:' + tubeRgb(t) + '"><i></i>' + tubeName(t) + '</span><span class="scells">';
      for (var x = (t - 1) * fpt + 1; x <= Math.min(D.cb.size, t * fpt); x++) {
        var col = SP.fiberColor(x, fpt).fiber, cls = D.live[x] ? 'live' : D.out[x] ? 'out' : D.other[x] ? 'other' : '', dark = ['BL', 'BR', 'SL', 'RD', 'BK', 'VL', 'GR'].indexOf(col.ab) >= 0;
        html += '<button type="button" class="sf ' + cls + (D.mine[x] ? ' mine' : '') + '" data-act="stripAt" data-arg="' + x + '" style="--fc:' + col.rgb + ';--fi:' + (dark ? '#fff' : '#111') + '" aria-label="Fiber ' + x + (cls ? ', ' + ({ live: 'live', out: 'not on the FDU', other: 'another leg' }[cls]) : ', free') + '">' + x + '</button>';
      }
      html += '</span></div>';
    }
    html += '</div><div class="slegend"><span><i class="l"></i>live (locked)</span><span><i class="o"></i>another leg</span><span><i class="m"></i>this leg</span></div>';
    var liveTube = D.f && D.f.list.some(function (x) { var t0 = Math.ceil(x / fpt); for (var y = (t0 - 1) * fpt + 1; y <= t0 * fpt; y++) if (D.live[y]) return true; return false; });
    /* a run across buffers is allowed (moved by hand, or the last result), but said */
    var span = D.f && D.f.buffers && D.f.buffers.length > 1 && D.n <= fpt ? D.f.text + ' spans the ' + bufList(D.f.buffers) + ' buffers.' : '';
    var sm = ST.strip.msg || [span, liveTube ? 'This opens a buffer with live fibers.' : ''].filter(Boolean).join(' ');
    html += '<div class="msg ' + (ST.strip.msg ? 'bad' : sm ? 'warn' : '') + '" id="stripMsg">' + esc(sm) + '</div>';
    html += '<div class="btnrow"><button type="button" class="btn" data-act="stripMove" data-arg="-1" aria-label="One fiber lower">◀</button><button type="button" class="btn" data-act="stripMove" data-arg="1" aria-label="One fiber higher">▶</button>' +
      '<button type="button" class="btn" data-act="stripFresh">Next fresh buffer</button></div><div class="btnrow sticky"><button type="button" class="btn" data-act="stripAuto"' + (D.fixed ? '' : ' disabled') + '>Let the app choose</button><button type="button" class="btn primary" data-act="openLeg" data-arg="' + esc(legId) + '">Done</button></div>';
    return html;
  }
  function stripMoveTo(legId, s, why) {
    var D = stripData(legId, ST.strip.key), ok = true;
    for (var x = s; x < s + D.n; x++) if (!D.free(x)) { ok = false; break; }
    if (!ok) {
      var k = 0; while (D.free(s + k)) k++;
      ST.strip.msg = why || (k ? 'Only ' + k + ' free from F' + s + '.' : 'F' + s + ' is not free.'); render(); return false;
    }
    var key = ST.strip.key; ST.strip.msg = '';
    change(function (A) { var L = A.legs[legId] = A.legs[legId] || {}; L.fix = Object.assign({}, L.fix); L.fix[key] = s; });
    return true;
  }

  /* ---------- the card's buttons ---------- */
  function wireCard(card) {
    var g = card.querySelector('.pgrid'); if (g) wireGrid(g);
    var file = card.querySelector('#tOtdr'); if (file) file.addEventListener('change', function () { var f = file.files && file.files[0]; if (f) { ST.otdr = f.name; $('#otdrBtn').firstChild.textContent = '📎 ' + f.name; } });
    var dt = card.querySelector('#tDate'); if (dt) dt.addEventListener('change', function () { var h = $('#tDateTx'); if (h) h.textContent = 'Prints as ' + dmy(dt.value || todayIso()); });
    var off = card.querySelector('#offName'); if (off) off.addEventListener('keydown', function (e) { if (e.key === 'Enter') act('offTyped', ST.cur.slice(4)); });
    var cab = card.querySelector('#cabId'); if (cab) { cab.addEventListener('keydown', function (e) { if (e.key === 'Enter') act('cabId', ST.edit.id); }); if (APP) cab.addEventListener('change', function () { var k = ST.edit && ST.edit.id, v = cab.value, n = 0; var go = function () { if (ST.busy && n++ < 50) { setTimeout(go, 120); return; } cidCommit(k, v); }; setTimeout(go, 0); }); } /* (after the tap that left the field is handled: a write in the middle of a tap lost the tap) */
    var oth = card.querySelector('#runOther'); if (oth) oth.addEventListener('keydown', function (e) { if (e.key === 'Enter') act('runOtherUse', ST.otherOpen); });
  }
  /* port grid: tap, drag along, or a row's colour; the drawing follows when the finger lifts */
  function wireGrid(g) {
    var id = g.getAttribute('data-site'), drag = null;
    var setCell = function (el, on) { el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); };
    var commit = function () {
      var cap = +g.getAttribute('data-cap'), was = liveOf(ST.A, id), past = was === '?' ? [] : SP.parseRanges(was).filter(function (q) { return q > cap; });
      var on = [].slice.call(g.querySelectorAll('.pc.on')).map(function (el) { return +el.getAttribute('data-p'); }), v = SP.fmtRanges(on.concat(past));
      change(function (A) { if (ST.edit) A.live[id] = v; else { A.draft.live[id] = v; if (A.live[id] != null) A.live[id] = v; } });
    };
    /* nothing changes until the finger shows what it means: lifted in place = a tap, moved sideways = a slide along the row, moved up or down = a scroll */
    g.addEventListener('pointerdown', function (e) {
      var el = e.target.closest('.pc'); if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var r = el.getBoundingClientRect();
      drag = { el: el, x0: e.clientX, y0: e.clientY, y: r.top + r.height / 2, mode: '', on: !el.classList.contains('on'), seen: {}, id: e.pointerId };
      if (e.pointerType === 'mouse') e.preventDefault();
    });
    g.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = Math.abs(e.clientX - drag.x0), dy = Math.abs(e.clientY - drag.y0);
      if (!drag.mode) {
        if (dy > 8 && dy >= dx) { drag = null; return; } /* a scroll: the card moves, no port changes */
        if (dx > 8 && dx > dy) { drag.mode = 'slide'; drag.seen[drag.el.getAttribute('data-p')] = 1; setCell(drag.el, drag.on); try { g.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } }
        else return;
      }
      var el = document.elementFromPoint(e.clientX, drag.y); el = el && el.closest ? el.closest('.pc') : null;
      if (el && g.contains(el) && el.parentNode === drag.el.parentNode && !drag.seen[el.getAttribute('data-p')]) { drag.seen[el.getAttribute('data-p')] = 1; setCell(el, drag.on); }
    });
    g.addEventListener('pointerup', function (e) {
      if (!drag || e.pointerId !== drag.id) return; var d = drag; drag = null;
      if (!d.mode) setCell(d.el, d.on);
      commit();
    });
    g.addEventListener('pointercancel', function () { var d = drag; drag = null; if (d && d.mode === 'slide') commit(); });
    g.addEventListener('click', function (e) {
      var h = e.target.closest('.phead'); if (!h) return;
      var cells = h.parentNode.querySelectorAll('.pc'), all = [].every.call(cells, function (el) { return el.classList.contains('on'); });
      [].forEach.call(cells, function (el) { setCell(el, !all); }); commit();
    });
  }

  /* the app: a cable ID typed in the cable's card and not saved yet (no Save, no Enter) is saved when it is left; an emptied field is
     cleared only with the button. The write on the RUN starts at once, so it is made even when the page is closing. */
  function cidCommit(key, val) {
    if (!APP || ST.view || ST.busy) return false;
    if (key == null) { var inp = $('#cabId'); if (!inp || !ST.edit || ST.edit.kind !== 'cable') return false; key = ST.edit.id; val = inp.value; }
    var pc = C() && C().B.pieceBy[key]; if (!pc) return false;
    var iv = String(val || '').trim().toUpperCase().slice(0, 24);
    if (!iv || iv === String(pc.cid || '').toUpperCase()) return false;
    change(function () { setRun(pc.fid, 'cid', iv); }, { toast: 'Cable ID of RUN ' + pc.n + ': ' + iv + '. Each piece prints it with -L1, -L2…' }); return true;
  }
  function act(a, arg) {
    var A = ST.A, c = C(), parts = String(arg == null ? '' : arg).split('|');
    switch (a) {
      case 'goto': ST.edit = null; ST.cur = arg; ST.countDiff = false; render(); keep(); return;
      case 'close': cidCommit(); ST.edit = null; ST.sizeOpen = ''; ST.otherOpen = ''; ST.note = null; render(); return;
      case 'start': change(function (A) { A.started = true; }, { advance: true }); return;
      case 'pickStart': if (pastOf(C().B)[arg]) return; change(function (A) { A.start = arg; A.to = []; A.later = []; A.toDone = false; A.legs = {}; A.counts = {}; A.countDone = false; A.testedDone = false; }); return;
      case 'off': change(function (A) { A.off[parts[0]] = parts[1]; }, { advance: true }); return;
      case 'offTyped': {
        var v = String(($('#offName') || {}).value || '').trim().toUpperCase().slice(0, 32);
        if (!v) { toast('Type the homing\'s name first.'); return; }
        change(function (A) { A.off[arg] = v; }, { advance: true }); return;
      }
      case 'to': {
        var ids = arg ? arg.split(',') : [];
        change(function (A) {
          Object.keys(A.legs).forEach(function (k) { var t = k.slice(2); if (ids.indexOf(t) < 0 && (A.later || []).indexOf(t) < 0) delete A.legs[k]; });
          A.to = ids; A.toDone = ids.length > 0 || (A.later || []).length > 0; A.testedDone = false; A.started = true;
        }, { advance: true }); return;
      }
      case 'later': change(function (A) {
        A.later = A.later || []; var i = A.later.indexOf(arg);
        if (i >= 0) { A.later.splice(i, 1); delete A.legs['g-' + arg]; } else A.later.push(arg);
        if (!A.to.length && !A.later.length) A.toDone = false;
      }); return;
      case 'count': ST.countDiff = false; change(function (A) { A.count = +arg; A.counts = {}; A.countDone = true; }, { advance: true }); return;
      case 'countDiff': ST.countDiff = true; render(); return;
      case 'countLeg': change(function (A) { A.counts[parts[0]] = +parts[1]; }); return;
      case 'countDone': ST.countDiff = false; change(function (A) { A.countDone = true; }, { advance: true }); return;
      case 'size': {
        var sp0 = APP ? c.B.ptBy[parts[0]] : null; /* the app: a site whose ODF record has no size yet: the size goes on the record */
        if (sp0 && sp0.odf) { change(function () { setOdf(sp0.odf, +parts[1]); }, { advance: !ST.edit, toast: 'ODF record: ' + parts[1] + ' ports.' }); return; }
        change(function (A) { A.size[parts[0]] = +parts[1]; }, { advance: !ST.edit }); return;
      }
      case 'split': change(function (A) { A.split[parts[0]] = parts[1]; }, { advance: !ST.edit }); return;
      case 'tested': change(function (A) {
        c.plan.legs.forEach(function (l) { if (l.state === 'future' || !l.routed) return; var L = A.legs[l.id] = A.legs[l.id] || {}; L.state = arg === 'all' || arg === l.id ? 'tested' : 'spliced'; });
        A.testedDone = true;
      }, { advance: true }); return;
      case 'liveSame': change(function (A) { A.live[parts[0]] = A.live[parts[1]]; }, { advance: !ST.edit }); return;
      case 'liveNone': change(function (A) { A.live[arg] = ''; delete A.draft.live[arg]; }, { advance: !ST.edit }); return;
      case 'liveTbc': change(function (A) { A.live[arg] = '?'; delete A.draft.live[arg]; }, { advance: !ST.edit }); return;
      case 'liveDone': change(function (A) { var v = A.draft.live[arg]; A.live[arg] = v != null ? v : A.live[arg] != null && A.live[arg] !== '?' ? A.live[arg] : ''; }, { advance: true }); return;
      case 'tube': change(function (A) {
        var fid = parts[0], t = +parts[1], cur = (A.tubes[fid] != null ? A.tubes[fid] : A.draft.tubes[fid] || []).slice(), i = cur.indexOf(t);
        if (i >= 0) cur.splice(i, 1); else cur.push(t); cur.sort(function (x, y) { return x - y; });
        if (A.tubes[fid] != null) A.tubes[fid] = cur; else A.draft.tubes[fid] = cur;
      }); return;
      case 'tubesDone': change(function (A) { A.tubes[arg] = (A.tubes[arg] != null ? A.tubes[arg] : A.draft.tubes[arg] || []).slice(); }, { advance: true }); return;
      case 'export': openExport(); return;
      case 'sheets': openSheets(); return;
      case 'unlock': change(function (A) { A.locked = false; Object.keys(A.legs).forEach(function (k) { delete A.legs[k].fix; }); }, { toast: 'The app chooses the fibers again.' }); return;
      case 'openLeg': ST.edit = { kind: 'leg', id: arg }; ST.armed = ''; render(); return;
      case 'openPt': ST.edit = { kind: 'pt', id: arg }; ST.sizeOpen = ''; ST.note = null; render(); return;
      case 'openCable': ST.edit = { kind: 'cable', id: arg }; ST.sizeOpen = ''; ST.note = null; render(); return;
      /* sizes: open the chips on the card; from the Ready screen's list (or a red message) the card opens with them */
      case 'sizeOpen': ST.sizeOpen = ST.sizeOpen === arg ? '' : arg; ST.otherOpen = ''; renderCard(); return;
      case 'sizesJump': { var sh = $('#sizesH'), cd = $('#card'); if (sh && cd) cd.scrollTo({ top: Math.max(0, cd.scrollTop + sh.getBoundingClientRect().top - cd.getBoundingClientRect().top - 8), behavior: 'smooth' }); return; }
      case 'openSize': {
        var sk = arg.split(':')[0], sid = arg.slice(sk.length + 1);
        if (sk === 'pt') { if (!fduRow(sid)) return; ST.edit = { kind: 'pt', id: sid }; }
        else { var rr = runRow(sid); if (!rr) return; ST.edit = { kind: 'cable', id: rr.keys[0], run: sid }; }
        ST.sizeOpen = arg; ST.otherOpen = ''; ST.note = null; ST.armed = ''; ST.reveal = 'chips'; render(); return;
      }
      case 'fduSize': {
        var fr = fduRow(parts[0]), fn = +parts[1]; if (!fr || !(fn > 0)) return;
        if (fr.cap === fn && fr.src !== 'cable') return;
        /* live ports past the new size stay in the answers (a bigger size brings them back) but are left out of the plan, said in red on the card */
        var lv = liveOf(A, fr.id), drop = lv === '?' ? [] : SP.parseRanges(lv).filter(function (q) { return q > fn; }), was = legSnap();
        ST.reveal = 'issue';
        change(function (A) { if (fr.src === 'odf') setOdf(fr.odf, fn); else A.size[fr.id] = fn; },
          { toast: function () { return fr.name + ' FDU: ' + fn + ' ports' + (fr.src === 'odf' ? ' (ODF record ' + fr.odfName + ')' : '') + '.' + (drop.length ? ' Live ports ' + SP.fmtRanges(drop) + ' are past it, so they are left out.' : '') + legMoves(was, 'ports') + ' Undo brings ' + fr.cap + ' back.'; } });
        return;
      }
      case 'livePastDrop': {
        var pr = fduRow(arg); if (!pr || !pr.past.length) return;
        var keepIn = function (v) { return v == null || v === '?' ? v : SP.fmtRanges(SP.parseRanges(v).filter(function (q) { return q <= pr.cap; })); };
        change(function (A) { if (A.live[pr.id] != null) A.live[pr.id] = keepIn(A.live[pr.id]); if (A.draft.live[pr.id] != null) A.draft.live[pr.id] = keepIn(A.draft.live[pr.id]); },
          { toast: 'Live ports ' + SP.fmtRanges(pr.past) + ' removed from ' + pr.name + '. Undo brings them back.' });
        return;
      }
      case 'tubesPastDrop': {
        var tr = runRow(arg); if (!tr || !tr.pastT.length) return;
        var nT2 = Math.ceil(tr.size / tr.fpt), inSize = function (L) { return L.filter(function (t) { return t <= nT2; }); };
        change(function (A) { if (A.tubes[tr.fid] != null) A.tubes[tr.fid] = inSize(A.tubes[tr.fid]); if (A.draft.tubes[tr.fid]) A.draft.tubes[tr.fid] = inSize(A.draft.tubes[tr.fid]); },
          { toast: 'Unticked the ' + bufNames(tr.pastT) + ' buffer' + (tr.pastT.length === 1 ? '' : 's') + '. Undo brings ' + (tr.pastT.length === 1 ? 'it' : 'them') + ' back.' });
        return;
      }
      case 'runSize': {
        var rs = runRow(parts[0]), rn = Math.round(+parts[1]); if (!rs) return;
        if (!(rn >= 2 && rn <= 576) || String(parts[1]).trim() === '') { toast('A cable has 2 to 576 fibers.'); return; }
        if (rn === rs.size) { if (ST.otherOpen) { ST.otherOpen = ''; renderCard(); } return; }
        /* buffers ticked in use past the new size stay ticked (a bigger size brings them back) but are left out of the plan, said in red on the card */
        var nTn = Math.ceil(rn / rs.fpt), offT = rs.existing ? tubesOf(A, rs.fid).filter(function (t) { return t > nTn; }) : [], wasR = legSnap();
        ST.reveal = 'issue';
        change(function (A) { setRun(rs.fid, 'size', rn); },
          { toast: function () { return 'RUN ' + rs.n + ' is now ' + rn + 'C everywhere.' + (offT.length ? ' The ' + bufNames(offT) + ' buffer' + (offT.length === 1 ? ', ticked in use, is past it, so it is' : 's, ticked in use, are past it, so they are') + ' left out.' : '') + legMoves(wasR) + ' Undo brings ' + rs.size + 'C back.'; } });
        return;
      }
      case 'runOther': ST.otherOpen = ST.otherOpen === arg ? '' : arg; renderCard(); setTimeout(function () { var i = $('#runOther'); if (i) { i.focus(); i.select(); } }, 30); return;
      case 'runOtherUse': { var ov = String(($('#runOther') || {}).value || '').trim(); if (!/^\d{1,4}$/.test(ov)) { toast('A cable has 2 to 576 fibers.'); return; } act('runSize', arg + '|' + ov); return; }
      case 'runFpt': {
        var rp = runRow(parts[0]), nf = +parts[1]; if (!rp || nf === rp.fpt || FPTS.indexOf(nf) < 0) return;
        /* the buffers ticked as in use keep their fibers: each new buffer with one of those fibers is in use */
        var conv = function (L) {
          if (!L || !L.length) return L; var out = [];
          /* not cut at the cable's size: a buffer ticked past it stays ticked, so a bigger size brings it back */
          L.forEach(function (t) { for (var f = (t - 1) * rp.fpt + 1; f <= t * rp.fpt; f++) { var u = Math.ceil(f / nf); if (out.indexOf(u) < 0) out.push(u); } });
          return out.sort(function (x, y) { return x - y; });
        };
        var had = tubesOf(A, rp.fid).length, wasF = legSnap();
        change(function (A) { setRun(rp.fid, 'fpt', nf); if (A.tubes[rp.fid] != null) A.tubes[rp.fid] = conv(A.tubes[rp.fid]); if (A.draft.tubes[rp.fid]) A.draft.tubes[rp.fid] = conv(A.draft.tubes[rp.fid]); if (APP && A.tfpt) A.tfpt[rp.fid] = nf; },
          { toast: function () { return 'RUN ' + rp.n + ': ' + nf + ' fibers per buffer.' + (had ? ' The buffers ticked in use still cover the same fibers.' : '') + legMoves(wasF) + ' Undo brings ' + rp.fpt + ' back.'; } });
        return;
      }
      case 'openStrip': {
        /* the cable to change is known before the drawing is drawn, so it zooms to that cable at once */
        var sl = c.legBy[parts[0]]; if (!sl) return;
        ST.strip = { key: parts[1] || (sl.fibers.filter(function (f) { return f.existing; })[0] || sl.fibers[0] || {}).key, msg: '' };
        ST.edit = { kind: 'strip', id: parts[0] }; render(); return;
      }
      case 'markTested': ST.otdr = null; ST.edit = { kind: 'test', id: arg }; render(); return;
      case 'legState': change(function (A) {
        var L = A.legs[parts[0]] = A.legs[parts[0]] || {};
        if (ST.set.stage !== 'built') { if (parts[1] === 'future') L.state = 'future'; else if (L.state === 'future') delete L.state; return; } /* As-Plan: "Planned now" keeps a spliced leg spliced */
        L.state = parts[1];
        /* As-Built: the testing question is answered once every leg has its state */
        var open = c.plan.legs.filter(function (l) { return l.routed && l.state !== 'future' && l.id !== parts[0] && !(A.legs[l.id] || {}).state; });
        if (!open.length) A.testedDone = true;
      }); return;
      case 'legCount': change(function (A) { A.counts[parts[0]] = +parts[1]; A.countDone = true; }); return;
      case 'futId': { var fv = String(($('#futId') || {}).value || '').trim().toUpperCase().slice(0, 24); change(function (A) { var L = A.legs[arg] = A.legs[arg] || {}; if (fv) L.cable = fv; else delete L.cable; }, { toast: fv ? 'Saved ' + fv : 'It prints TBF.' }); return; }
      case 'remove':
        if (ST.armed !== 'rm:' + arg) { ST.armed = 'rm:' + arg; renderCard(); return; }
        change(function (A) { var t = arg.slice(2); A.to = A.to.filter(function (x) { return x !== t; }); A.later = (A.later || []).filter(function (x) { return x !== t; }); delete A.legs[arg]; if (!A.to.length && !A.later.length) A.toDone = false; }, { cur: 'to', toast: 'Leg removed. Undo brings it back.' }); return;
      case 'lossStep': { var li = $('#tLoss'), lv = Math.max(0, Math.min(40, Math.round(((lossNum(li.value) || 0) + +arg) * 100) / 100)); li.value = lv.toFixed(2); ST.armed = ''; return; }
      case 'saveTest': {
        var d = ($('#tDate') || {}).value || todayIso(), loss = String(($('#tLoss') || {}).value || '').trim(), lv2 = lossNum(loss), prev = (A.legs[arg] || {}).test || {};
        if (loss && !(lv2 >= 0)) { toast('The loss is a number, like 0.42.'); return; }
        if (loss && lv2 > 40) { toast(lv2 + ' dB is more than any fiber link loses. Check the number.'); return; }
        /* an unusual loss is asked once more before it goes on the drawing */
        if (loss && lv2 > 10 && !(ST.armed === 'loss:' + arg && ST.lossAsk === String(lv2))) { ST.armed = 'loss:' + arg; ST.lossAsk = String(lv2); renderCard(); toast('Is ' + lv2 + ' dB right? It is high for one link. Tap Save again to keep it.'); return; }
        change(function (A) { var L = A.legs[arg] = A.legs[arg] || {}; L.state = 'tested'; L.test = { date: d, loss: loss ? lv2 : '', otdr: ST.otdr || prev.otdr || '' }; },
          { toast: 'Marked tested' }); ST.edit = { kind: 'leg', id: arg, home: true }; render(); return;
      }
      case 'cabId': {
        var iv = String(($('#cabId') || {}).value || '').trim().toUpperCase().slice(0, 24);
        if (APP) { var pcI = c.B.pieceBy[arg]; if (!pcI) return; change(function () { setRun(pcI.fid, 'cid', iv); }, { toast: iv ? 'Cable ID of RUN ' + pcI.n + ': ' + iv + '. Each piece prints it with -L1, -L2…' : 'RUN ' + pcI.n + ' prints TBF.' }); return; }
        change(function (A) { if (iv) A.ids[arg] = iv; else delete A.ids[arg]; }, { toast: iv ? 'Cable ID saved: ' + iv : 'The cable prints TBF.' }); return;
      }
      case 'coords': change(function (A) { A.coords[arg] = !A.coords[arg]; }); return; /* (an old answer: the drawings now print a closure's position whenever it has one) */
      case 'map': {
        /* the app: the page closes (what was typed is saved first) and the map shows the record, centred and ringed */
        if (!canMap() || !arg) return; cidCommit(); keep();
        try { Promise.resolve(HOST.showOnMap(arg)).then(function (ok) { if (ok === false) toast('This point has no place on the map yet.'); }, function () { toast('The map could not be shown. Try again.'); }); } catch (e) { toast('The map could not be shown. Try again.'); }
        return;
      }
      case 'stripCable': ST.strip = { key: arg, msg: '' }; render(); return;
      case 'stripAt': {
        var at = +arg, D = stripData(ST.edit.id, ST.strip.key);
        if (D.live[at]) { ST.strip.msg = 'F' + at + ' is live: it is never used.'; render(); return; }
        if (D.out[at]) { ST.strip.msg = 'F' + at + ' is not terminated on the FDU.'; render(); return; }
        if (D.other[at]) { ST.strip.msg = 'F' + at + ' belongs to another leg.'; render(); return; }
        stripMoveTo(ST.edit.id, at); return;
      }
      case 'stripMove': {
        var D2 = stripData(ST.edit.id, ST.strip.key), dir = +arg;
        for (var s = D2.start + dir; s >= 1 && s + D2.n - 1 <= D2.cb.size; s += dir) {
          var ok = true; for (var y = s; y < s + D2.n; y++) if (!D2.free(y)) { ok = false; break; }
          if (ok) { stripMoveTo(ST.edit.id, s); return; }
        }
        ST.strip.msg = dir < 0 ? 'No free run lower down.' : 'No free run higher up.'; render(); return;
      }
      case 'stripFresh': {
        var D3 = stripData(ST.edit.id, ST.strip.key), B3 = D3.cb.fpt || 12, t0 = Math.ceil(D3.start / B3), nT = Math.ceil(D3.cb.size / B3), need = Math.ceil(D3.n / B3);
        /* an empty buffer: nothing in it, this leg's own fibers included; a leg bigger than one buffer takes as many empty buffers in a row */
        var empty = function (t) { for (var z = (t - 1) * B3 + 1; z <= Math.min(D3.cb.size, t * B3); z++) if (D3.live[z] || D3.out[z] || D3.other[z] || D3.mine[z]) return false; return true; };
        for (var k = 1; k <= nT; k++) {
          var tt = (t0 - 1 + k) % nT + 1, f0 = (tt - 1) * B3 + 1, ok3 = tt + need - 1 <= nT && f0 + D3.n - 1 <= D3.cb.size;
          for (var u = tt; ok3 && u < tt + need; u++) if (!empty(u)) ok3 = false;
          if (ok3) { stripMoveTo(ST.edit.id, f0); return; }
        }
        ST.strip.msg = need > 1 ? 'No ' + need + ' fresh buffers in a row are left on this cable.' : 'No fresh buffer is left on this cable.'; render(); return;
      }
      case 'stripAuto': { var sk = ST.strip.key; change(function (A) { var L = A.legs[ST.edit.id]; if (L && L.fix) { delete L.fix[sk]; if (!Object.keys(L.fix).length) delete L.fix; } }, { toast: 'The app chooses these fibers.' }); return; }
    }
  }

  /* =====================================================================================================
     OVERLAYS: projects, your choices, the A3 sheets, export
     ===================================================================================================== */
  var ovl = function () { return $('#ovl'); };
  function openOverlay(html, full) {
    var o = ovl(); o.innerHTML = '<div class="sheet' + (full ? ' full' : '') + '" role="dialog" aria-modal="true">' + html + '</div>'; o.hidden = false; iconize(o);
    var x = o.querySelector('[data-close]'); if (x) x.focus();
  }
  function closeOverlay() { var o = ovl(); o.hidden = true; o.innerHTML = ''; sheetViewer = null; }
  function head(title) { return '<div class="shd"><h2>' + title + '</h2><button type="button" class="x" data-close aria-label="Close">×</button></div>'; }

  function openProjects() {
    openOverlay(head('Made-up sample projects') + '<div class="sbd"><p class="lead">Each is shaped like a real project\'s survey and route. Names, codes and IDs are made up.</p><div class="rows">' + PROJECTS.map(function (P) {
      var s = ST.saved[P.id], left = '';
      if (P.id === ST.pid && C()) left = C().left ? C().left + ' left' : 'ready';
      else if (s && s.A && s.A.started) left = 'started';
      return '<button type="button" class="row' + (P.id === ST.pid ? ' on' : '') + '" data-proj="' + P.id + '"><span class="ic">' + P.id.slice(1) + '</span><span class="tx"><b>' + esc(P.name) + '</b><span>' + esc(P.about) + (left ? ' · ' + left : '') + '</span></span><span class="go">›</span></button>';
    }).join('') + '</div></div>');
  }
  function openChoices() {
    var s = ST.set, armed = ST.armed === 'reset';
    openOverlay(head('Your choices') + '<div class="sbd">' +
      '<h3 style="margin-top:0">This drawing is for</h3>' + (APP ? '<p class="note">This project is ' + (s.stage === 'built' ? '<b>As-Built</b>: the testing is asked (tested, spliced only, not built yet)' : '<b>As-Plan</b>: it checks there are free fibers, with no testing words') + '. It follows the project\'s Purpose (Projects).</p>'
        : '<div class="seg"><button type="button" data-stage="plan" aria-pressed="' + (s.stage === 'plan') + '"><b>As-Plan</b><span>Checks there are free fibers. No testing words.</span></button>' +
      '<button type="button" data-stage="built" aria-pressed="' + (s.stage === 'built') + '"><b>As-Built</b><span>Adds the testing: tested, spliced only, not built yet.</span></button></div>') +
      '<h3>Fibers on an existing cable</h3><button type="button" class="sw" role="switch" data-tube aria-checked="' + (s.tube === 'fresh') + '"><span class="tx"><b>Fresh buffer instead of the lowest free fiber</b><span>On: never open a buffer (tube) that has a live fiber. Off: the lowest free fibers in one buffer (the usual).</span></span><span class="tg"></span></button>' +
      (ST.A.locked ? '<div class="ck info"><div>Fibers are locked since the first export: this applies to new legs.<button type="button" class="btn small" data-unlock>Let the app choose again</button></div></div>' : '') +
      '<p class="note">How a new FDU\'s ports are shared and the cable IDs are asked on the way (tap the FDU or the cable to change them).</p>' +
      '<h3>This project</h3><button type="button" class="btn danger' + (armed ? ' armed' : '') + '" data-reset>' + (armed ? 'Tap again to start over' : 'Start this project again') + '</button>' +
      '<p class="note">' + (APP ? 'Your answers go back to the start. The sizes stay as the records and cables have them. Undo brings your answers back.' : 'Your answers and the sizes you changed go back to how this made-up sample came. Undo brings them back.') + '</p></div>');
  }
  /* the A3 sheets: a chip per sheet, named (Single line, Key map, A-01, B-01 …), and ‹ › to step through them. On the key map a tap on
     a grid cell opens that cell's sheet; on a grid sheet so does a tap on the locator or on a MATCH LINE · SEE label. */
  var sheetViewer = null;
  function openSheets() {
    var r = SP.build(C().model, ['sld', 'detailed']), sheets = r.sheets;
    openOverlay(head('The A3 sheets') + '<div class="tabs" role="group" aria-label="Sheets">' + sheets.map(function (sh, i) {
      var name = sh.label || (/SINGLE/.test(sh.head) ? 'Single line' : 'Splicing details'), cls = sh.cell ? ' class="cell"' : sh.keymap ? ' class="key"' : '';
      return '<button type="button"' + cls + ' data-sheet="' + i + '" aria-pressed="' + (i === 0) + '" aria-label="' + esc((sh.cell ? 'Grid ' : '') + name) + ', sheet ' + (i + 1) + ' of ' + sheets.length + '">' + esc(name) + '</button>';
    }).join('') +
      '</div><div class="sheetview"><div class="view" id="sheetView"></div><div class="shint" id="sheetHint" hidden>Tap a grid cell to open its sheet</div>' +
      '<div class="pager"><button class="tbtn" type="button" data-spage="-1" aria-label="Previous sheet">‹</button><span class="plbl" id="sheetPage" aria-live="polite"></span><button class="tbtn" type="button" data-spage="1" aria-label="Next sheet">›</button></div>' +
      '<div class="tools"><button class="tbtn" type="button" data-szoom="in" aria-label="Zoom in">+</button><button class="tbtn" type="button" data-szoom="out" aria-label="Zoom out">&minus;</button>' +
      '<button class="tbtn" type="button" data-szoom="fit" aria-label="Whole sheet">⤢</button></div></div>', true);
    sheetViewer = new Viewer($('#sheetView'), onSheetTap); sheetViewer.sheets = sheets; sheetViewer.page = 0; showSheet(0);
  }
  /* a tap on a grid cell (key map, locator or match line label): that cell's sheet */
  function onSheetTap(ref) {
    if (!sheetViewer || !ref || ref.indexOf('grid:') !== 0) return;
    var name = ref.slice(5), sh = sheetViewer.sheets; for (var i = 0; i < sh.length; i++) if (sh[i].cell === name) { showSheet(i); return; }
  }
  /* the whole sheet, clear of the hint above it and of the ‹ n / N › pager below it */
  function fitSheet(animate) {
    var V = sheetViewer, S = V.size(), W = SP.SHEET.W, H = SP.SHEET.H, k = Math.min((S.w - 12) / W, (S.h - 116) / H);
    if (!(k > 0)) { V.fit(null, 2, 0, animate); return; }
    var w = S.w / k, h = S.h / k; V.go({ x: W / 2 - w / 2, y: H / 2 - h / 2, w: w, h: h }, animate);
  }
  function showSheet(i) {
    var V = sheetViewer, sh = V.sheets; if (!sh.length) return; i = Math.max(0, Math.min(sh.length - 1, i)); V.page = i;
    V.set(SP.toSVG(sh[i])); fitSheet(false);
    [].forEach.call(ovl().querySelectorAll('[data-sheet]'), function (b) {
      var on = +b.getAttribute('data-sheet') === i; b.setAttribute('aria-pressed', String(on));
      if (on) { var t = b.parentNode, l = b.offsetLeft, w = t.clientWidth; if (l < t.scrollLeft || l + b.offsetWidth > t.scrollLeft + w) t.scrollLeft = Math.max(0, l - (w - b.offsetWidth) / 2); }
    });
    var lbl = $('#sheetPage'); if (lbl) lbl.textContent = (i + 1) + ' / ' + sh.length;
    var hint = $('#sheetHint'); if (hint) hint.hidden = !sh[i].keymap;
    [].forEach.call(ovl().querySelectorAll('[data-spage]'), function (b) { var d = +b.getAttribute('data-spage'); b.disabled = d < 0 ? i === 0 : i === sh.length - 1; });
  }
  function openExport() {
    var c = C(), warn = c.left ? '<div class="ck warn"><div>Still to answer: ' + c.left + '. You can export now; the drawing prints TO BE CONFIRMED where a fact is missing.</div></div>'
      : c.status === 'fix' ? c.sizeIssues.map(function (x) { return '<div class="ck bad"><div>' + esc(x.text) + '</div></div>'; }).join('') + (c.short.length ? '<div class="ck bad"><div>Not enough free fibers on ' + c.short.map(function (l) { return l.label; }).join(' and ') + '. The drawing marks ' + (c.short.length === 1 ? 'it' : 'them') + ' NOT ENOUGH FREE FIBERS.</div></div>' : '')
      : c.status === 'confirm' ? '<div class="ck warn"><div>The live ports at ' + esc(c.confirm.join(' and ')) + ' are not confirmed. The drawing prints LIVE PORTS TBC.</div></div>' : '<div class="ck ok"><div>Everything is answered.</div></div>';
    openOverlay(head('Export the drawings') + '<div class="sbd">' + warn +
      '<h3>Which drawings</h3><button type="button" class="sw" role="switch" data-view="sld" aria-checked="true"><span class="tx"><b>Single line diagram</b><span>One A3 sheet</span></span><span class="tg"></span></button>' +
      '<button type="button" class="sw" role="switch" data-view="detailed" aria-checked="true"><span class="tx"><b>Splicing details</b><span>Every fiber, splice and port</span></span><span class="tg"></span></button>' +
      '<h3>Save as</h3><div class="btnrow"><button type="button" class="btn primary" data-fmt="pdf">PDF</button><button type="button" class="btn primary" data-fmt="dxf">DXF</button><button type="button" class="btn go" data-fmt="zip">Both (ZIP)</button></div>' +
      '<p class="note">The DXF opens in any CAD program (R12). ' + (c.unnamed.length ? c.unnamed.length + ' cable ID' + (c.unnamed.length === 1 ? '' : 's') + ' print as TBF.' : '') + (ST.A.locked || (APP && ST.view) ? '' : ' The first export locks the fibers so they stay as issued.') +
      (locksNow().wait ? ' Fibers on an existing cable lock once its live ports and tubes are answered.' : '') + '</p></div>');
  }

  /* downloads: inside the claude.ai viewer through its downloads capability, else a plain <a download> (the same as splice-demo.html) */
  var dl = null, inViewer = !APP && !!(window.claude && typeof window.claude.use === 'function');
  if (inViewer) window.claude.use('downloads').then(function (x) { dl = x; }, function () { dl = null; });
  function baseName() { var t = C().model.title || {}; return ([t.project, t.planId, t.site].filter(Boolean).join('_') || (APP && ST.P && ST.P.name) || 'SPLICING').toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').replace(/-+/g, '-').slice(0, 80); }
  function save(name, bytes) {
    if (APP) { /* the app's own save and share (the website's Send panel, the phone's share sheet), with who exported it */
      if (!HOST) { toast('The app is not there: close this page and open it again.'); return; }
      var kind = /\.pdf$/i.test(name) ? 'pdf' : /\.dxf$/i.test(name) ? 'dxf' : 'zip';
      try { Promise.resolve(HOST.deliver(name, bytes, kind)).then(function () {}, function (e) { toast('Not saved: ' + ((e && e.message) || 'try again')); }); } catch (e) { toast('Not saved: ' + ((e && e.message) || 'try again')); }
      return;
    }
    if (inViewer) {
      var go = function () {
        if (!dl) { toast('Saving files is not available in this view.'); return; }
        var fname = name, data = bytes;
        if (/\.dxf$/i.test(name)) { data = SP.zip([{ name: name, data: bytes }]); fname = name.replace(/\.dxf$/i, '_DXF.zip'); }
        dl.save({ filename: fname, data: data }).then(function () { toast('Saved ' + fname + (fname !== name ? ' (this viewer saves a DXF inside a ZIP)' : '')); },
          function (e) { toast(e && e.code === 'declined' ? 'Not saved.' : 'Could not save here (' + ((e && e.code) || 'unavailable') + ').'); });
      };
      if (!dl) window.claude.use('downloads').then(function (x) { dl = x; go(); }, function () { dl = null; go(); }); else go();
      return;
    }
    var url = URL.createObjectURL(new Blob([bytes])), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000); toast('Downloaded ' + name);
  }
  function locksNow() { return locks(C(), ST.A); }
  function doExport(fmt) {
    var views = [].filter.call(ovl().querySelectorAll('[data-view]'), function (b) { return b.getAttribute('aria-checked') === 'true'; }).map(function (b) { return b.getAttribute('data-view'); });
    if (!views.length) { toast('Pick at least one drawing.'); return; }
    /* an export issues the drawing: each leg's fibers lock where they are (as a range, 'F7-12', so a leg that grows later never takes
       another leg's issued fibers). Fibers on an existing cable lock only once its live ports and tubes are answered. */
    var lk = locksNow();
    if ((lk.add || !ST.A.locked) && !(APP && ST.view)) change(function (A) { A.locked = true; lk.apply(A); }); /* (the app: a view-only project is exported as it is) */
    var r = SP.build(C().model, views), tag = views.length === 2 ? 'SPLICING-SET' : views[0] === 'sld' ? 'SLD' : 'SPLICING-DETAILS', base = baseName() + '_' + tag, enc = new TextEncoder();
    var pdf = function () { return SP.toPDF(r.sheets, { title: base }); }, dxf = function () { return enc.encode(SP.toDXF(r.sheets)); };
    ST.lastExport = { fmt: fmt, views: views, base: base };
    if (fmt === 'pdf') save(base + '.pdf', pdf());
    else if (fmt === 'dxf') save(base + '.dxf', dxf());
    else save(base + '.zip', SP.zip([{ name: base + '.pdf', data: pdf() }, { name: base + '.dxf', data: dxf() }]));
  }

  var tt = 0;
  function toast(s) { var t = $('#toast'); t.textContent = s; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 3200); }
  function hideToast() { var t = $('#toast'); if (t) t.hidden = true; clearTimeout(tt); }

  /* ---------- events ---------- */
  function onTapRef(ref) {
    if (!ref || (ST.settleFrom === 'draw' && Date.now() < (ST.settleUntil || 0))) return;
    var i = ref.indexOf(':'), k = ref.slice(0, i), id = ref.slice(i + 1);
    /* "Where does it go?": a tap on a homing the cables reach answers it */
    if (!ST.edit && ST.cur === 'to' && k === 'pt' && C().reach.list.indexOf(id) >= 0) { ST.tapFrom = 'draw'; act('to', id); return; }
    if (k === 'leg') { if (!C().legBy[id]) return; ST.edit = { kind: 'leg', id: id }; }
    else if (k === 'cab') ST.edit = { kind: 'cable', id: id };
    else if (k === 'pt') ST.edit = { kind: 'pt', id: id };
    ST.armed = ''; ST.sizeOpen = ''; ST.otherOpen = ''; ST.note = null; render();
  }
  function boot() {
    if (APP && !HOST) { $('#nohost').hidden = false; var ap0 = $('.app'); if (ap0) ap0.style.display = 'none'; return; } /* opened by itself: it needs the app */
    var setVh = function () { document.documentElement.style.setProperty('--vh', window.innerHeight + 'px'); var st = $('.stage'); if (st) st.classList.toggle('short', st.clientHeight < 270); };
    /* typing on a phone: fold the drawing away and keep the field and its button in view (again when the keyboard has opened);
       unfold when the keyboard closes, or a moment after the field loses focus, so a tap on the button lands where it was */
    var typT = 0, app = $('.app'), typH = 0;
    var showField = function () {
      var t = document.activeElement; if (!t || !t.matches || !t.matches('#card input.inp')) return;
      var f = t.closest('.field'), nx = f && f.nextElementSibling;
      (nx && nx.classList.contains('btnrow') ? nx : f || t).scrollIntoView({ block: 'nearest' }); t.scrollIntoView({ block: 'nearest' });
    };
    var unfold = function () { app.classList.remove('typing'); setVh(); if (viewer) viewer.resize(); if (ST.fitNext && ST.ctx) drawStage(); };
    setVh(); window.addEventListener('resize', function () {
      if (app.classList.contains('typing')) { if (window.innerHeight > typH + 100) unfold(); else { typH = Math.min(typH, window.innerHeight); setTimeout(showField, 30); } }
      setVh(); if (viewer) viewer.resize(); if (sheetViewer) sheetViewer.resize();
    });
    document.addEventListener('focusin', function (e) {
      var t = e.target; if (!phone() || !t || !t.matches || !t.matches('#card input.inp:not([type="date"])')) return;
      clearTimeout(typT); if (!app.classList.contains('typing')) typH = window.innerHeight; app.classList.add('typing');
      setTimeout(function () { setVh(); if (viewer) viewer.resize(); showField(); }, 60);
    });
    document.addEventListener('focusout', function () {
      clearTimeout(typT); typT = setTimeout(function () { var a = document.activeElement; if (a && a.matches && a.matches('#card input.inp')) return; unfold(); }, 320);
    });
    viewer = new Viewer($('#view'), onTapRef);
    $('#card').addEventListener('pointerdown', function () { ST.tapAt = Date.now(); }, true);
    $('#card').addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (!b || b.disabled || Date.now() < (ST.settleUntil || 0)) return; act(b.getAttribute('data-act'), b.getAttribute('data-arg')); });
    $('#pills').addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (b) act('goto', b.getAttribute('data-arg')); });
    $('#count').addEventListener('click', function () { var c = C(); if (c.left) act('goto', nextQ()); else if (c.status !== 'ready' && (ST.edit || ST.cur !== 'ready')) act('goto', 'ready'); else openExport(); });
    $('#undoBtn').addEventListener('click', undo);
    $('#choicesBtn').addEventListener('click', function () { ST.armed = ''; openChoices(); });
    $('#stageBadge').addEventListener('click', function () { ST.armed = ''; openChoices(); });
    if (APP) $('#doneBtn').addEventListener('click', function () { cidCommit(); keep(); try { HOST.close(); } catch (e) { /* closed already */ } });
    else $('#projBtn').addEventListener('click', openProjects);
    $('#sheetsBtn').addEventListener('click', openSheets);
    $('#idsBtn').addEventListener('click', function () { var u = C().unnamed; if (u.length) { ST.edit = { kind: 'cable', id: u[0] }; render(); } });
    document.querySelector('.tools').addEventListener('click', function (e) { var b = e.target.closest('[data-zoom]'); if (!b) return; var z = b.getAttribute('data-zoom'); if (z === 'fit') fitAll(true); else viewer.zoom(z === 'in' ? 0.7 : 1 / 0.7); });
    ovl().addEventListener('click', function (e) {
      if (e.target === ovl() || e.target.closest('[data-close]')) { closeOverlay(); return; }
      var b;
      if ((b = e.target.closest('[data-proj]'))) { keep(); closeOverlay(); openProject(b.getAttribute('data-proj')); keep(); return; }
      if ((b = e.target.closest('[data-stage]'))) { var st = b.getAttribute('data-stage'); if (st !== ST.set.stage) { change(function (A, S) { S.stage = st; }, { toast: st === 'built' ? 'As-Built: the testing is added.' : 'As-Plan: planned connections, no testing words.' }); } openChoices(); return; }
      if ((b = e.target.closest('[data-tube]'))) { change(function (A, S) { S.tube = S.tube === 'fresh' ? 'lowest' : 'fresh'; }); openChoices(); return; }
      if ((b = e.target.closest('[data-unlock]'))) { act('unlock'); openChoices(); return; }
      if ((b = e.target.closest('[data-reset]'))) {
        if (ST.armed !== 'reset') { ST.armed = 'reset'; openChoices(); return; }
        change(function () { ST.A = freshAnswers(proj()); if (!APP) ST.D = freshData(); }, { cur: 'start', toast: APP ? 'Started again. The sizes stay as the records and cables have them. Undo brings your answers back.' : 'Started again, sizes as the sample came. Undo brings your answers back.' }); ST.fitNext = true; render(); closeOverlay(); return;
      }
      if ((b = e.target.closest('[data-sheet]'))) { showSheet(+b.getAttribute('data-sheet')); return; }
      if ((b = e.target.closest('[data-spage]'))) { if (sheetViewer) showSheet(sheetViewer.page + +b.getAttribute('data-spage')); return; }
      if ((b = e.target.closest('[data-szoom]'))) { var z = b.getAttribute('data-szoom'); if (z === 'fit') fitSheet(true); else sheetViewer.zoom(z === 'in' ? 0.7 : 1 / 0.7); return; }
      if ((b = e.target.closest('[data-view]'))) { b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')); return; }
      if ((b = e.target.closest('[data-fmt]'))) { doExport(b.getAttribute('data-fmt')); return; }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (!ovl().hidden) closeOverlay(); else if (ST.edit) { ST.edit = null; render(); } }
      if (sheetViewer && !ovl().hidden && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !/INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); showSheet(sheetViewer.page + (e.key === 'ArrowLeft' ? -1 : 1)); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/INPUT/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); undo(); }
    });
    if (APP) { appStart(); return; }
    loadAll(); openProject(PROJECTS.some(function (p) { return p.id === ST.pid; }) ? ST.pid : 'p1');
  }
  /* the app: the project as it is now, the saved answers, As-Plan or As-Built (the project's Purpose), view-only, the point to show first */
  function appStart() {
    Promise.resolve(HOST.init()).then(function (d) {
      if (!d || !d.project) { $('#nohost').hidden = false; $('.app').style.display = 'none'; return; }
      ST.stage = d.stage === 'built' ? 'built' : 'plan'; ST.view = String(d.viewOnly || ''); ST.P = fromApp(d.project); ST.pid = ST.P.id;
      ST.saved = {}; ST.saved[ST.P.id] = d.saved && d.saved.A ? { A: d.saved.A, set: { stage: ST.stage, tube: d.saved.tube } } : null;
      openProject(ST.P.id);
      var f = String(d.focus || ''), B0 = C().B;
      var f0 = f; if (f && !B0.ptBy[f]) f = (ST.P.folded || {})[f] || ''; /* a closure or NAP pin tapped: its pole; an ODF: its site */
      if (f0 && !f) { var oe = B0.offEnds.filter(function (e) { return e.odf === f0 || e.pole === f0; })[0]; if (oe) f = oe.id; } /* (the ODF or pole where a cable leaves the map: that end) */
      if (f && (B0.ptBy[f] || B0.offBy[f])) { ST.edit = { kind: 'pt', id: f }; render(); }
    }, function (e) { toast('The project could not be read (' + ((e && e.message) || 'try again') + '). Close this page and open it again.'); });
  }
  root.AskPage = { state: ST, act: act, undo: undo, compute: function () { return C(); }, app: APP,
    flush: function () { if (!APP || !ST.A) return; cidCommit(); if (!ST.busy) keep(); },
    /* the phone's Back (the app asks first): a panel open over the page (the A3 sheets, Your choices, Export) closes, not the page */
    back: function () { var o = ovl(); if (o && !o.hidden) { closeOverlay(); return true; } return false; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
