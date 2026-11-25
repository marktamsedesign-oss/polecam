/* beta 6.7 (UX step 1): the Tutorial search and the findability of every feature. Run: node --test tests/tutorial-search.test.cjs
   It loads tutorial.js and calls GESAA_TUTORIAL.search, the same code the app's Tutorial screen runs (renderTutList in app.js).
   (a) LINES: one line per feature, in the user's words. Each query must put one of its topics in the top 3; a query marked !
       (the feature's main query) must put one of them first. No topic may crowd the others out (critic: kw ranking).
       LATER: the lines whose topic or wording comes in a later step of the UX work; each step moves its lines up to LINES.
   (c) beta 6.7 (UX step 2): what the tutorial says of a rule is what app.js does (the camera's 5 s, 1 km and photo limits).
   (s) The search's own rules (spec §4.1) on made-up topics: ranking, phrases, small words, endings, other spellings, best step.
   (d) Housekeeping: every #id a tutorial step rings is in index.html; every go is a screen the tour knows.
   (b) (c) (d) beta 6.7 (UX step 3, 4, 5; spec §4.4): every row of Export and Plan style carries its label (data-find; data-findx
       in Colours and sizes); a data-find label finds a topic whose steps say it (top 3); every label of Plan style, data-findx
       too, is found by Find a setting and by the Tutorial's search (GESAA_TUTORIAL.settings); every control of Plan style is in
       a labelled row; every Export row and Plan style section has a ? opening a step that says its label (GESAA_TUTORIAL.help).
       (UX step 5 fixes) The rows a PAT, cleanup or FAT shares with a survey open an acceptance step (data-tutacc); the cleanup's
       Hand on, labelled by app.js, opens a step saying that label; the rows another choice hides are grouped (data-findneed).
   The rule for every new feature (owner item 4): in the same commit, a tutorial step with its exact on-screen label, kw in the
   user's words (US and UK spellings), and a line here. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const sb = { self: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'tutorial.js'), 'utf8'), sb, { filename: 'tutorial.js' });
const G = sb.self.GESAA_TUTORIAL;
const search = (q, opt) => JSON.parse(JSON.stringify(G.search(q, opt))); // (its arrays are of the other context: plain ones here)
const ids = (q, opt) => search(q, opt || {}).map((r) => r.id);
const TOPIC = new Set(G.topics.map((t) => t.id));

/* (a) [beta, 'query · query · …', 'topic topic…', admin]. A query that starts with ! must put one of the topics first. */
const LINES = [
  ['5.6/5.8', '!map packs · offline map · hide pack', 'offline'],
  ['5.6', '!road pack', 'plandxf offline'],
  ['5.8', '!mobile data · wifi · lte', 'mbxsend'],
  ['6.7', '!photos per pin · one photo · add photo', 'photos'],
  ['6.7', '!cef photo · tower photos', 'cef'],
  ['6.4', 'photo stamp · stamp', 'planstyle photos fieldsettings'],
  ['6.4', '!address stamp', 'fieldsettings'],
  ['6.0/6.7', '!boq table · boq on each sheet · table size', 'boq'],
  ['6.2', '!renumber', 'plandxf planstyle'],
  ['6.3/6.7', '!extension arm · existing arm · alley arm · arms', 'boq'],
  ['6.4', 'span length sheet', 'plandxf'],
  ['6.4/6.6', '!lengths add up', 'boq'],
  ['6.6', '!cef lengths · cef table', 'cef'],
  ['6.9', '!cable ladder wall · wall mounted ladder · ladder on the wall · ladder bracket', 'cef'],
  ['6.9', '!porthole · port hole', 'cef'],
  ['7.2', '!loop holder · loop at the closure · closure loop', 'cef'],
  ['7.2', 'ladder flat on the wall · vertical ladder', 'cef'],
  ['6.9', '!exit conduit · ug fiber into the cabin', 'cef'],
  ['6.7', '!open trench · underground · conduit · foc ug', 'ugmethod cef'],
  ['6.6/6.7', '!loops at boxes · handhole loop · odf loop', 'planstyle boq'],
  // beta 6.7 (UX step 2): the topics and words of step 2
  ['5.7/6.7', 'closure size · !closure label · proposed closure arrow', 'plandxf'],
  ['6.4', 'lat-long', 'planstyle photos fieldsettings'],
  ['6.4', 'barangay', 'fieldsettings'],
  ['6.0', '!maxcell · micro trench · inner duct', 'boq ugmethod'],
  ['6.0', '!photo report header · pla id', 'photos'],
  ['6.4/6.6', '!whole metres · meters', 'boq'],
  ['6.7', '!laid by · hdd', 'ugmethod cef'],
  ['5.9', '!missed pole · grab cable · swap pole · take pole off cable', 'grabpole'],
  ['6.7', '!green shutter · red shutter · gps · photo not kept · photo not saved · 5 seconds', 'camera'],
  ['6.7', 'refused photo', 'camera help'],
  ['6.7', '!edit route · draw cable on drawing · move tower · place odc', 'drawedit'],
  ['6.4/6.7', '!street view · streetview · pegman · little man', 'streetview'],
  ['6.5/6.6', '!rta · jpa · rta/jpa · number color · owner colours · add category · standard four · rta legend · legends sheet · rta other · pldt pole', 'rta'],
  ['6.6/6.7', '!globe poles · bayantel · gt pole · blue circle · bayantel rta', 'rta'],
  ['6.7', 'photo smaller · photo left out', 'plandxf planstyle'], // (critic: a photo with no room is drawn smaller, never left out)
  ['6.7', '!landmark icons', 'plandxf planstyle'],
  // beta 6.7 (UX step 3): Export, "What do you need?", and the poles on no cable
  ['UX', '!which export · export button · plan pdf · send to client · what do you need', 'whichexport'],
  ['UX', '!several at once · one zip · again', 'whichexport surveyexport'],
  ['UX', 'one pdf to print · what to make · make the one pdf', 'whichexport splice'],
  ['UX', '!export plan', 'whichexport plandxf drawing'],
  ['UX', '!hand on · share pat kmz', 'whichexport patdone'],
  ['UX', '!restore a backup · backup of the project', 'share whichexport'],
  ['UX', 'pole list for the rta · material list · route and span lengths', 'whichexport surveyexport'], // (rta, the RTA colours, may come first)
  ['UX', 'next step · uses credits · finishes the task', 'whichexport surveyexport'],
  ['6.1/6.2', '!pole on no cable · export warning · leave out · hidden poles · unhide · not exported · show in exports · fix now · export as they are', 'nocable'],
  ['6.2', '!ai training · training photos · photos for teaching the app', 'whichexport surveyexport'],
  ['6.7', '!arm in blue', 'boq'],
  // beta 6.7 (UX step 4): Plan style (Plan settings and Drawing style in one), Tidy, and the Plan style labels
  ['UX', '!plan settings · !drawing style · !design style · !plan style · !plan look · company standard · use company standard', 'planstyle'],
  ['6.0', '!tidy · !pole labels · !neat blocks', 'tidy'],
  ['6.0', 'grid split · sheet split · sheet name · a-1 · leader lines · photo near pole', 'tidy planstyle'],
  ['6.2', '!pole id format · stacked · cc over · cc-123456', 'tidy'],
  ['6.0/6.1/6.7', 'landmark · landmark icons · shorten · abbreviate · university', 'planstyle plandxf'],
  ['6.0', 'own colour · !custom color', 'planstyle rta'],
  ['6.1', '!follow the road · curved cable · straight cable', 'planstyle'],
  ['6.4/6.7', 'photo size · bigger photos · photo line to pole · photo smaller · photo left out', 'planstyle plandxf'],
  ['6.5/6.6', '!pole number colours · owner colours and key · add owner colour · back to the standard four', 'rta planstyle'],
  // beta 6.7 (UX step 5): Find a setting (Plan style) and the ? of each Export row and Plan style section
  ['UX', '!find a setting · search a setting · where is a setting', 'planstyle'],
  ['UX', 'question mark', 'whichexport planstyle'],
  // beta 6.8 (UX step 6; reviewer): with the drawing topic cut, a record's Owner name is still found (the boq topic's step about it)
  ['2.42.18', '!owner name · coop · owner', 'boq rta'],
  // beta 6.8: a proposed pole placed by hand (no photo), on the map and on the Drawing; a pole deleted on a cable keeps it joined
  ['6.8', '!proposed pole · !pole without photo · proposed pole pin · add proposed pole · pin · pole not photographed · pp-0001', 'mappin drawedit'],
  ['6.8', '!plot pole · !place pole on drawing · proposed pole on drawing', 'drawedit mappin'],
  // 2.45.1 / beta 6.9: the span length allowance (Plan style › Cables), on the cable lengths of the plan, BOQ, Excel and CEF
  ['6.9', '!span length allowance · allowance · extra cable · sag · wastage · foc % · cable length allowance', 'planstyle boq'],
  ['6.8', '!delete pole on cable · !cable cut · cable broken · deleted pole · missing span', 'route'],
  ['6.9', '!pull-off · !pull off · !pulloff · pull-off pin · add pull-off', 'pulloff'],
  ['6.9', '!cross-over · !cross over · !crossover · cross-over pin · add cross-over', 'pulloff'],
  ['6.9', '!corner without pole · !extended messenger · corner with no pole · cable across houses · messenger', 'pulloff'],
  // (beta 7.9, Add Pin): one Add Pin on the map and the Drawing, a list of every kind of pin (the owner: "Just put "Add Pin" and then the user will select which pin it is")
  ['Add Pin', '!add pin · !dummy nap box · !pin kinds · lcp pin · handhole pin · manhole pin · service box pin · closure pin · add handhole · add manhole · what is it', 'mappin'],
  ['Add Pin', '!add pin on the drawing · pin on the drawing', 'drawedit mappin'],
  // beta 7.6 / 2.45.8: Photos with their locations › Same stamp on the plan's photos (the geotag band on the plan's photos)
  ['7.6', '!same stamp on the plan\'s photos · !geotag stamp on the plan · plan photo stamp · caption band', 'fieldsettings planstyle'],
  // (beta 7.8, Drawing photos): the Drawing's photos where the plan puts them; drag one to place it by hand, Back to automatic
  ['Drawing photos', '!drag a photo · !back to automatic · photo placed by hand · move photo on the drawing', 'drawing'],
  // (beta 7.9, Drawing preview): the Drawing shows the plan as its PDF prints it, its sheet grid, Regenerate plan preview
  ['Drawing preview', '!regenerate plan preview · plan preview · sheet grid · drawing grid · pdf preview on the drawing', 'drawing'],
  // (beta 7.10, Drawing labels): on the Drawing, drag a cable label, a pole number or a pole's details to place it by hand; Undo; Back to automatic for all
  ['Drawing labels', '!drag a label · !move pole details · move cable label · move pole number · undo on the drawing · labels placed by hand', 'drawing'],
  // (beta 7.11, Drawing tools): select anything on the plan, its toolbar (font size, bold, italic, colour, turn, size, Existing / Proposed, This one / All like it), poles moved on the plan, a cable label's arrow tip; Plan style › Lines to the pole, Closure labels
  ['Drawing tools', '!select more · !drawing toolbar · font size on the drawing · rotate label · turn a label · move pole on the drawing · !arrow tip · arrow pointer · all like it', 'drawing'],
  ['Drawing tools', '!lines to the pole · closure labels · !closure bubble', 'planstyle drawing'],
  // (beta 7.12, Drawing edit): the Drawing's tools as icons (the CEF editor's look), an item's text edited, texts and photos added on the plan (notes), the draw order; Plan style › Photos › Line to its pole
  ['Drawing edit', '!edit text on the drawing · !add text on the plan · !add a photo to the drawing · !photo note · !draw order · bring to front · send to back · bring forward · send backward · double tap to edit · !drawing icons · delete note', 'drawing'],
  // (beta 7.14, View / Edit; Changed by hand; Text editor): View | Edit on the Drawing, the chip of what was changed by hand and its list, the text editor's format
  ['Drawing modes', '!view and edit · !edit mode · view mode · !changed by hand · put back · put all back · moved items · !text align · align right · !wrap text · line spacing · !font style · underline · centre text · center text', 'drawing'],
  ['Drawing edit', '!line to its pole · photo lines · remove photo line', 'planstyle drawing'],
  // (beta 7.12, Drawing edit, the owner's later asks): the keys and Redo, a pole moved on the Drawing moves its record (the KMZ follows), a closure and a loop slide along their cable
  ['Drawing edit', '!redo on the drawing · !ctrl z · cmd z · ctrl y · !move pole record · snap closure · !slide along the cable', 'drawing'],
  ['Drawing edit', '!delete on the drawing · delete from the plan · delete a guy on the drawing · !edit text record', 'drawing'],
  // (beta 7.13, Drawing fixes): a right-click on the plan, on a computer: the tools of what is under the pointer as a menu there
  ['Drawing fixes', '!right-click on the plan · !context menu on the drawing · right click menu · options menu on the drawing', 'drawing'],
  // (beta 7.14, Roads again): the roads a plan keeps got again (the Drawing, beside Regenerate plan preview; Export's checks)
  ['Roads again', '!get the roads again · !roads again · refresh the roads · update the roads · new roads from openstreetmap · download the roads again', 'drawing'],
  ['2.35', '!remove', 'adm-remove', true], // (t2351d: an admin's search)
  ['2.35', '!api key', 'adm-drivekey', true],
];
/* [step that brings it, beta, queries, topics]: the topic is new, or its words are not in the tutorial yet. */
const LATER = []; // (beta 6.7, UX step 4: every line is in LINES)
const expand = (rows, at) => rows.flatMap((r) => { const [qs, tops, admin] = r.slice(at); return qs.split(' · ').map((x) => ({ q: x.replace(/^!/, ''), main: x.startsWith('!'), want: tops.split(' '), admin: !!admin, beta: r[at - 1] })); });
const NOW = expand(LINES, 1);
const show = (q, admin) => search(q, { admin }).slice(0, 5).map((r) => `${r.id}:${r.score}`).join(' ') || 'nothing found';

test('(a) every feature line: one of its topics in the top 3', () => {
  const bad = NOW.filter((l) => !ids(l.q, { admin: l.admin }).slice(0, 3).some((id) => l.want.includes(id))).map((l) => `"${l.q}" (${l.beta}) wants ${l.want.join('/')}: ${show(l.q, l.admin)}`);
  assert.deepEqual(bad, []);
});
test('(a) the main query of each feature (!) puts its topic first', () => {
  const bad = NOW.filter((l) => l.main && !l.want.includes(ids(l.q, { admin: l.admin })[0])).map((l) => `"${l.q}" wants ${l.want.join('/')} first: ${show(l.q, l.admin)}`);
  assert.deepEqual(bad, []);
});
test('(a) every topic a line names exists (LINES), or comes in a later step (LATER)', () => {
  assert.deepEqual(NOW.filter((l) => !l.want.some((id) => TOPIC.has(id))).map((l) => l.q), []);
});
test('(a) no topic crowds out the right ones: above them in the top 3 for at most 25% of the queries', () => {
  // (critic, kw ranking: a topic with a long kw list must not take the top places of other features' queries)
  const above = {};
  NOW.forEach((l) => { const r = ids(l.q, { admin: l.admin }); let k = r.findIndex((id) => l.want.includes(id)); if (k < 0) k = 3; r.slice(0, Math.min(k, 3)).forEach((id) => { above[id] = (above[id] || 0) + 1; }); });
  const bad = Object.entries(above).filter(([, n]) => n > NOW.length / 4).map(([id, n]) => `${id}: above the right topic for ${n} of ${NOW.length} queries`);
  assert.deepEqual(bad, []);
});
test('(a) no topic is in the top 3 of more than 25% of the other features\' queries', () => { // (beta 6.7, UX step 4: the drawing topic's step 8, the whole Plan settings list, cut)
  const n = {};
  NOW.forEach((l) => ids(l.q, { admin: l.admin }).slice(0, 3).forEach((id) => { if (!l.want.includes(id)) n[id] = (n[id] || 0) + 1; }));
  const bad = Object.entries(n).filter(([, k]) => k > NOW.length / 4).map(([id, k]) => `${id}: in the top 3 of ${k} of ${NOW.length} other features' queries`);
  assert.deepEqual(bad, []);
});

/* (s) the search's own rules, on made-up topics (so a change of tutorial text does not change these results) */
const tp = (id, title, kw, steps, extra) => ({ id, aud: 'user', cat: 'Survey', title, kw, steps: steps.map((t) => ({ t })), ...(extra || {}) });
const S = (q, topics, opt) => search(q, { topics, ...(opt || {}) }).map((r) => r.id);

test('(s) a word scores 3 in the title, 2 in kw, 1 in a step; equal scores keep the file order', () => {
  const T = [tp('step', 'Other', 'other', ['the shutter is green']), tp('kw', 'Other', 'shutter', ['nothing']), tp('title', 'The shutter', 'other', ['nothing']), tp('step2', 'Other', 'other', ['the shutter is red'])];
  assert.deepEqual(S('shutter', T), ['title', 'kw', 'step', 'step2']);
  assert.deepEqual(search('shutter', { topics: T }).map((r) => r.score), [3, 2, 1, 1]);
});
test('(s) every word must match somewhere; small words (how, to…) are left out', () => {
  const T = [tp('a', 'Export the plan', '', ['tap Export']), tp('b', 'Photos', '', ['a photo']), tp('c', 'How it works', '', ['how to do it'])];
  assert.deepEqual(S('export photo', T), []);
  assert.deepEqual(S('how to export', T), ['a']);
  assert.deepEqual(S('how to', T), ['c']); // (only small words: they are looked for)
});
test('(s) a phrase counts more in kw than the same words apart (critic: kw ranking)', () => {
  const T = [tp('apart', 'Other', 'photo report size table', ['x']), tp('phrase', 'Other', 'photo size', ['x'])];
  assert.deepEqual(S('photo size', T), ['phrase', 'apart']);
});
test('(s) equal scores: the topic with the words in more of its steps first', () => {
  const T = [tp('once', 'Other', 'arm', ['an arm']), tp('often', 'Other', 'arm', ['an arm', 'the arm again', 'one more arm'])];
  assert.deepEqual(S('arm', T), ['often', 'once']);
});
test('(s) words of 3 letters or fewer match at the start of a word only', () => {
  const T = [tp('filter', 'Filter', '', ['filter the list']), tp('lte', 'LTE', '', ['mobile data (LTE)']), tp('cert', 'Certain', '', ['certainly main']), tp('rta', 'RTA poles', '', ['the RTA/JPA list']), tp('ai', 'AI training', '', ['photos for the AI'])];
  assert.deepEqual(S('lte', T), ['lte']);
  assert.deepEqual(S('rta', T), ['rta']);
  assert.deepEqual(S('ai', T), ['ai']);
  assert.deepEqual(S('pho', [tp('p', 'Photos', '', ['x']), tp('q', 'Telephone', '', ['x'])]), ['p']); // (typing: "pho" finds photo)
});
test('(s) endings: approving finds approve and approval; categories and category find each other', () => {
  assert.deepEqual(S('approving', [tp('a', 'Approval on site', '', ['approve it'])]), ['a']);
  assert.deepEqual(S('categories', [tp('one', 'A category', '', ['x'])]), ['one']);
  assert.deepEqual(S('category', [tp('many', 'Categories', '', ['x'])]), ['many']);
});
test('(s) other spellings: color/colour, gray/grey, meter/metre, center/centre, wifi/wi-fi', () => {
  const T = [tp('uk', 'Colours', 'grey metres centre', ['Wi-Fi'])], U = [tp('us', 'Colors', 'gray meters center', ['wifi'])];
  for (const q of ['color', 'colours', 'gray', 'meters', 'meter', 'center', 'wifi']) assert.deepEqual(S(q, T), ['uk'], q);
  for (const q of ['colour', 'colors', 'grey', 'metres', 'metre', 'centre', 'wi-fi']) assert.deepEqual(S(q, U), ['us'], q);
  for (const q of ['metres', 'meters']) assert.deepEqual(S(q, [tp('iso', 'Isometric view', 'symmetric', ['x'])]), [], q); // (both spellings find the same)
  assert.deepEqual(S('font', [tp('t', 'Text size', '', ['x'])]), ['t']); // (beta 6.7, UX step 5: font → text, one way)
  assert.deepEqual(S('text', [tp('f', 'Font', '', ['x'])]), []);
});
test('(s) one way: streetview, pegman, unhide and jpa find street view, little man, show in exports and rta', () => {
  const T = [tp('sv', 'Street View', '', ['drag the little man']), tp('hide', 'Hidden poles', '', ['Hidden from the exports › Show in exports']), tp('rta', 'RTA poles', '', ['x'])];
  assert.deepEqual(S('streetview', T), ['sv']);
  assert.deepEqual(S('pegman', T), ['sv']);
  assert.deepEqual(S('unhide', T), ['hide']);
  assert.deepEqual(S('jpa', T), ['rta']);
  assert.deepEqual(S('jpa', [tp('j', 'JPA poles', '', ['x'])]), ['j']);
  assert.deepEqual(S('rta', [tp('j', 'JPA poles', '', ['x'])]), []); // (rta does not find jpa)
});
test('(s) the step returned is the one with the most query words (-1: none)', () => {
  const T = [tp('t', 'Photo size', '', ['about photos', 'the photo size on the plan', 'size of the sheet']), tp('n', 'Photo', 'size', ['nothing here'])];
  assert.deepEqual(search('photo size', { topics: T }).map((r) => [r.id, r.step]), [['t', 1], ['n', -1]]);
});
test('(s) admin topics only for the admin company; nothing for an empty query', () => {
  const T = [tp('u', 'Logo', '', ['x']), tp('a', 'Logo', '', ['x'], { aud: 'admin' })];
  assert.deepEqual(S('logo', T), ['u']);
  assert.deepEqual(S('logo', T, { admin: true }), ['u', 'a']);
  assert.deepEqual(search('', {}), []);
  assert.equal(G.query('a'), null);
  assert.equal(G.query('  '), null);
});
test('(s) the words marked in the text are the words found', () => {
  const Q = G.query('lte pho jpa colour');
  assert.deepEqual(['LTE', 'filter', 'Photos', 'telephone', 'JPA', 'RTA', 'certain', 'colors', 'Colours'].filter(Q.mark), ['LTE', 'Photos', 'JPA', 'RTA', 'colors', 'Colours']);
});

test('(s) beta 6.8 (UX step 6): another-words phrases are marked only where the whole phrase is', () => {
  const on = (q, text) => JSON.parse(JSON.stringify(G.query(q).cut(text).filter(([, m]) => m).map(([x]) => x))); // (plain arrays here)
  assert.deepEqual(on('pegman', 'Drag the little man onto a manhole; the man is little. The Little Man!'), ['little', 'man', 'Little', 'Man']);
  assert.deepEqual(on('unhide', 'Hidden from the exports › Show in exports. Show me the exports.'), ['Show', 'in', 'exports']);
  assert.deepEqual(on('streetview', 'Street View opens; the street; a view; streetview'), ['Street', 'View', 'streetview']);
  assert.deepEqual(G.query('pegman').cut('a plain text').map(([x]) => x).join(''), 'a plain text'); // (the text whole, nothing lost)
});
test('(s) beta 6.8 (UX step 6): a word with other spellings matches whole words with their endings, not a cut stem', () => {
  const M = G.query('meter'), C = G.query('centre');
  assert.deepEqual(['metre', 'metres', 'meters', 'Metred', 'metro', 'isometric', 'metrology'].filter((w) => M.mark(w)), ['metre', 'metres', 'meters', 'Metred']);
  assert.deepEqual(['center', 'centre', 'centred', 'centres', 'central', 'centrality', 'epicentre'].filter((w) => C.mark(w)), ['center', 'centre', 'centred', 'centres']);
  const T = [tp('m', 'Map', '', ['the metro line']), tp('c', 'Cable', '', ['the central office']), tp('ok', 'Length', '', ['in whole metres'])];
  assert.deepEqual(S('meter', T), ['ok']); assert.deepEqual(S('centre', T), []); assert.deepEqual(S('metres', T), ['ok']);
  assert.deepEqual(['grey', 'greyed', 'gray', 'greyhound'].filter((w) => G.query('gray').mark(w)), ['grey', 'greyed', 'gray']);
});
test('(s) beta 6.8 (UX step 6): a query of only symbols looks for nothing (the app says No topic for)', () => {
  ['?!', '--', '…', '***'].forEach((q) => assert.equal(G.query(q), null, q));
  assert.deepEqual(search('?!', {}), []);
});
test('(s) beta 6.8 (UX step 6): of equal steps, the one that starts with the word\'s bold label is the one returned (owner: Owner name)', () => {
  const T = [tp('t', 'Records', '', ['In the record, its **owner** is asked', '**Owner name**: type the coop'])];
  assert.deepEqual(search('owner', { topics: T }).map((r) => r.step), [1]);
  const boq = search('owner', {}).find((r) => r.id === 'boq'), t = G.topics.find((x) => x.id === 'boq');
  assert.ok(boq && ids('owner').slice(0, 3).includes('boq') && /^\*\*Owner name\*\*/.test(t.steps[boq.step].t), JSON.stringify(boq));
});

/* the app's own search on the tutorial (the step-1 checks of the spec) */
test('(s) in the tutorial: lte, jpa, color, wifi and pho', () => {
  const lte = ids('lte');
  assert.ok(lte.includes('mbxsend') && lte.every((id) => G.topics.find((t) => t.id === id).steps.some((s) => /(^|[^a-z0-9])lte/i.test(s.t)) || /(^|[^a-z0-9])lte/i.test(G.topics.find((t) => t.id === id).kw)), `lte: ${lte}`);
  const jpa = ids('jpa'), rta = ids('rta');
  assert.ok(jpa.length && rta.every((id) => jpa.includes(id)), `jpa ${jpa} finds what rta finds ${rta}`);
  assert.deepEqual(ids('color'), ids('colour'));
  assert.deepEqual(ids('wifi'), ids('wi-fi'));
  assert.ok(ids('wifi').includes('mbxsend'));
  assert.ok(ids('pho').slice(0, 3).includes('photos'), ids('pho').slice(0, 5).join(' '));
});

/* (d) housekeeping */
/* (b) and (c) beta 6.7 (UX step 3): every row of a screen carries its label (data-find), and that label finds a topic whose steps say
   it, in the top 3. Step 3: the Export rows; step 4 adds the Plan style rows (spec §4.4). */
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const exportHtml = HTML.slice(HTML.indexOf('<section class="sheet" id="export"'), HTML.indexOf('</section>', HTML.indexOf('<section class="sheet" id="export"')));
test('(c) every Export row (.xcard) carries its label (data-find)', () => {
  const cards = [...exportHtml.matchAll(/<div class="xcard"[^>]*>/g)].map((m) => m[0]);
  assert.ok(cards.length >= 15, `${cards.length} Export rows`);
  assert.deepEqual(cards.filter((c) => !/\bdata-find="[^"]+"/.test(c)), []);
});
test('(b) every data-find label finds a topic whose steps say it, in the top 3', () => {
  const norm = (x) => x.toLowerCase().replace(/[*\\]/g, '');
  const labels = [...new Set([...HTML.matchAll(/\bdata-find="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))], bad = [];
  labels.forEach((l) => { const top = search(l, {}).slice(0, 3).map((r) => G.topics.find((t) => t.id === r.id)); if (!top.some((t) => t && t.steps.some((x) => norm(x.t).includes(norm(l))))) bad.push(`"${l}": ${show(l, false)}`); });
  assert.deepEqual(bad, []);
});
/* (e) critic: the labels the Export rows retired are not in a tutorial step, nor in index.html's text (kw may keep them as search
   words). Plan settings, Drawing style and What to export (the Plan style screen): step 4, below. */
const RETIRED = ['Export the plan', 'Also a PDF to print', 'Also the CEF plans', 'Back up project', 'Restore backup', 'AutoCAD · DXF', 'Google Earth · KMZ', 'Table · CSV', 'Share cleanup KMZ ·', 'Share PAT KMZ ·', 'Geotagged photos · ZIP', 'Route and spans · Excel', 'BOQ / BOM sizes · Excel', 'Photos for AI training', 'Change what to export', 'FORMATS', 'Export → tick', '**Fix**', '**Hide**', '**Leave**'];
test('(e) the retired Export labels are in no tutorial step and nowhere in index.html\'s text', () => {
  const bad = [];
  G.topics.forEach((t) => t.steps.forEach((x, i) => RETIRED.forEach((r) => { if (x.t.includes(r)) bad.push(`${t.id} step ${i + 1}: ${r}`); })));
  const text = HTML.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  RETIRED.filter((r) => !/\*/.test(r) && r !== 'FORMATS').forEach((r) => { if (text.includes(r)) bad.push(`index.html: ${r}`); });
  assert.deepEqual(bad, []);
});
test('(e) step 4: Plan settings, Drawing style and What to export retired too (Plan style), in the steps and index.html\'s text', () => {
  const bad = []; G.topics.forEach((t) => t.steps.forEach((x, i) => ['Plan settings', 'Drawing style', 'What to export'].forEach((r) => { if (x.t.includes(r)) bad.push(`${t.id} step ${i + 1}: ${r}`); })));
  // (the one-time note on the Drawing names them, on purpose: "Plan settings and Drawing style are now one screen: Plan style")
  const text = HTML.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<div class="drwnote" id="drawPlNote"[\s\S]*?<\/div>/, '');
  ['Plan settings', 'Drawing style', 'What to export', 'PLAN SETTINGS', 'DRAWING STYLE', 'WHAT TO EXPORT'].forEach((r) => { if (text.includes(r)) bad.push(`index.html: ${r}`); });
  assert.deepEqual(bad, []);
});
/* (c) beta 6.7 (UX step 4): every row of Plan style carries its label: data-find (Basic rows, section headings, Advanced main rows:
   checked by (b)) or data-findx (the Colours and sizes rows and the Simple drawing's own: for a later "Find a setting", not in (b),
   critic: generic labels such as Colour cannot rank) */
const styleHtml = HTML.slice(HTML.indexOf('<section class="sheet" id="drwStyle"'), HTML.indexOf('</section>', HTML.indexOf('<section class="sheet" id="drwStyle"')));
test('(c) every Plan style row (.strow, .psrow, .swrow) and section carries its label (data-find, or data-findx in Colours and sizes)', () => {
  const rows = [...styleHtml.matchAll(/<(?:div|label|details|button)\b[^>]*\bclass="(?:[^"]*\s)?(?:strow|psrow|swrow|stsec)(?:\s[^"]*)?"[^>]*>/g)].map((m) => m[0]);
  assert.ok(rows.length >= 45, `${rows.length} Plan style rows`);
  assert.deepEqual(rows.filter((r) => !/\bdata-findx?="[^"]+"/.test(r)), []);
  const cs = styleHtml.split('<details class="stcs">').slice(1).map((x) => x.slice(0, x.indexOf('</details>')));
  assert.deepEqual(cs.flatMap((x) => [...x.matchAll(/\bdata-find="([^"]+)"/g)].map((m) => m[1])), [], 'Colours and sizes rows: data-findx');
  // (beta 7.8, Plan style cards): 7 cards (Pole numbers, Pole details and span lengths, Cable labels (FOC), Photos, Landmarks, Location map, Map
  // sheets) and 6 sections in More settings; the main choices (.plb, the rows of Basic before) in their cards
  const secs = [...styleHtml.matchAll(/<details class="stgrp stsec(?: plcard)?"[^>]*data-find="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(secs.length, 13, secs.join(', '));
  const cards = [...styleHtml.slice(styleHtml.indexOf('id="plCards"'), styleHtml.indexOf('id="plMore"')).matchAll(/<details class="stgrp stsec plcard"[^>]*data-find="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(cards, ['Pole numbers', 'Pole details and span lengths', 'Cable labels (FOC)', 'Photos', 'Landmarks', 'Location map (vicinity map)', 'Map sheets']);
  const bl = [...styleHtml.matchAll(/<(?:div|label)\b[^>]*\bclass="(?:[^"]*\s)?plb(?:\s[^"]*)?"[^>]*\bdata-find="([^"]+)"/g)].map((m) => m[1].replace(/&#39;/g, "'"));
  assert.deepEqual(bl, ['Pole numbers in this project', 'Pole number colours', 'Pole labels', 'Clamp types beside each pole', '20 m loops at boxes', 'Photos on the plan', 'Stamp on the plan\'s photos', 'BOQ table on each map sheet']);
});
test('(d) every #id a tutorial step rings is in index.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), have = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const miss = [];
  G.topics.forEach((t) => t.steps.forEach((s, i) => { for (const m of String(s.hl || '').matchAll(/#([A-Za-z][\w-]*)/g)) if (!have.has(m[1])) miss.push(`${t.id} step ${i + 1}: #${m[1]}`); }));
  assert.deepEqual(miss, []);
});
test('(d) every go is a screen the tour opens (planstyle:<part> with a known part)', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const keys = (name) => { const m = app.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`)); return new Set(m ? [...m[1].matchAll(/([A-Za-z]+):/g)].map((x) => x[1]) : []); };
  const screens = keys('TUT_SCREEN'), parts = keys('TUT_PLPART');
  assert.ok(screens.has('planstyle') && screens.has('planset') && parts.has('sheets'), 'TUT_SCREEN and TUT_PLPART in app.js');
  const bad = [];
  G.topics.forEach((t) => t.steps.forEach((s, i) => { if (!s.go) return; const [g, part] = s.go.split(':'); if (!screens.has(g) || (part && !(g === 'planstyle' && parts.has(part)))) bad.push(`${t.id} step ${i + 1}: ${s.go}`); }));
  assert.deepEqual(bad, []);
});
test('(d) every "see *Topic*" names a topic of the tutorial (beta 6.7, UX step 2: topics renamed and split)', () => {
  const titles = G.topics.map((t) => t.title.toLowerCase()), bad = [];
  G.topics.forEach((t) => t.steps.forEach((x, i) => { for (const m of x.t.matchAll(/see (?<!\*)\*([^*]+)\*(?!\*)/g)) if (!titles.some((T) => T.startsWith(m[1].toLowerCase()))) bad.push(`${t.id} step ${i + 1}: ${m[1]}`); }));
  assert.deepEqual(bad, []);
});
test('(d) the tutorial version follows the app (APP_VER)', () => { // (critic: APP_VER, not sw.js VERSION: main has no beta part)
  const v = (fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').match(/const APP_VER = '([^']+)'/) || [])[1];
  assert.equal(G.version, v);
});
/* beta 6.7 (UX step 2; critic: the camera topic stated a rule the code does not have): the numbers the camera topics give are
   the app's own (app.js), so a change of the rule there fails here until the tutorial says the same. */
test('(c) the camera rules in the tutorial are the app\'s: 5 s GPS, 1 km, 4 photos a pin, 10 a tower', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), num = (re) => +((app.match(re) || [])[1]);
  assert.equal(num(/GPS_WINDOW_MS = (\d+)/), 5000);
  assert.equal(num(/PIN_LIMIT_M = (\d+)/), 1000);
  assert.equal(num(/PH_PIN_MAX = (\d+)/), 4);
  assert.equal(num(/PH_SITE_N = (\d+)/), 10);
  assert.ok(/function checkNearElement\(gps\) \{\s*if \(!ed \|\| !ed\.acc\) return true;/.test(app), 'the 1 km rule for a photo added to an element is for PAT, cleanup and FAT only');
  const cam = G.topics.find((t) => t.id === 'camera'), txt = cam.steps.map((x) => x.t).join(' ');
  for (const w of ['5 seconds', '**4**', '**10**', '**1 km**']) assert.ok(txt.includes(w), `camera topic: ${w}`);
  // every "1 km" in the camera and help topics is about the pin or a photo added to an element, never a rule for every photo
  const one = ['camera', 'help'].flatMap((id) => G.topics.find((t) => t.id === id).steps.map((x) => x.t)).flatMap((t) => t.split(/(?<=[.;:])\s+/)).filter((x) => /1 km/.test(x));
  assert.ok(one.length >= 2 && one.every((x) => /pin|added to an element/.test(x)), one.join(' | '));
});

/* ---- beta 6.7 (UX step 5; spec §4.4 (b) (c) (d), adjusted per the critic: a generic label such as "Colour" cannot rank a tutorial
   topic, so the Colours and sizes rows (data-findx) are found by Find a setting, the topics by the other labels) ----
   Plan style's rows are read from index.html as the app's plIndex() reads them from the page: label (data-find or data-findx),
   where (Plan style › Basic, › Advanced, › <section>, › Colours and sizes) and the row's other words. GESAA_TUTORIAL.settings is the
   ranking both Find a setting and the Tutorial's search use; GESAA_TUTORIAL.help the ? of each Export row and Plan style section. */
const VOID = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));
const ent = (s) => s.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&(amp|quot|lt|gt|rsquo|lsquo|nbsp|hellip);/g, (m, k) => ({ amp: '&', quot: '"', lt: '<', gt: '>', rsquo: '’', lsquo: '‘', nbsp: ' ', hellip: '…' })[k]);
/** A small DOM of an HTML fragment: { tag, a (attributes), kids, up }; text nodes { text }. */
function dom(html) {
  const root = { tag: '#root', a: {}, kids: [], up: null }; let cur = root, m;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  while ((m = re.exec(html))) {
    if (m[4] != null) { cur.kids.push({ text: ent(m[4]) }); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) { let n = cur; while (n && n.tag !== tag) n = n.up; if (n && n.up) cur = n.up; continue; }
    const a = {}; for (const x of m[3].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) a[x[1].toLowerCase()] = ent(x[2] ?? x[3] ?? x[4] ?? '');
    const el = { tag, a, kids: [], up: cur }; cur.kids.push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) cur = el;
  }
  return root;
}
const isEl = (n) => !!n && !!n.tag;
const hasCls = (n, c) => isEl(n) && ` ${n.a.class || ''} `.includes(` ${c} `);
const all = (n, ok, out = []) => { (n.kids || []).forEach((k) => { if (isEl(k)) { if (ok(k)) out.push(k); all(k, ok, out); } }); return out; };
const closest = (n, ok) => { for (let x = n; isEl(x) && x.tag !== '#root'; x = x.up) if (ok(x)) return x; return null; };
const textOf = (n, skip) => (n.kids || []).map((k) => (isEl(k) ? (skip(k) ? '' : textOf(k, skip)) : k.text)).join(' '); // (the app: its text nodes, a space between)
const STYLE = dom(styleHtml), EXPORT = dom(exportHtml);
const byId = (root, id) => all(root, (n) => n.a.id === id)[0];
const isSec = (n) => n.tag === 'details' && hasCls(n, 'stsec');
const labelOf = (n) => n.a['data-find'] || n.a['data-findx'] || '';
/** plIndex() of app.js, from index.html ((beta 7.8, Plan style cards): Plan style › its card, or Plan style › More settings › its section; main: a
    main choice, .plb) */
const PL_INDEX = all(STYLE, (n) => !!labelOf(n) && !!closest(n, (x) => x.a.id === 'plCards' || x.a.id === 'plMore')).map((el) => {
  const sec = isSec(el) ? el : closest(el, isSec), more = !!closest(el, (x) => x.a.id === 'plMore');
  const where = ['Plan style', more ? 'More settings' : '', !isSec(el) && sec ? sec.a['data-find'] : '', closest(el, (x) => x.tag === 'details' && hasCls(x, 'stcs')) ? 'Colours and sizes' : ''].filter(Boolean).join(' › ');
  const skip = (k) => (k.tag === 'details' && hasCls(k, 'help')) || hasCls(k, 'dimwhy') || hasCls(k, 'findwhy') || k.tag === 'output' || hasCls(k, 'secsum') || hasCls(k, 'nopv') || !!labelOf(k);
  return { label: labelOf(el), where, text: isSec(el) ? '' : textOf(el, skip).replace(/\s+/g, ' ').trim(), sec: sec ? sec.a.id : '', isSec: isSec(el), main: hasCls(el, 'plb'),
    when: /\btidy\b/.test(el.a['data-dim'] || '') ? 'Tidy' : closest(el, (x) => x.a.id === 'dxfSimpleOpts') ? 'Simple drawing' : '' };
});
const base = (l) => l.replace(/\s*\([^)]*\)$/, '').toLowerCase();
test('(b) Find a setting: every label of Plan style (data-find and data-findx) lists its row first, after only rows of the same name', () => {
  assert.ok(PL_INDEX.length >= 85, `${PL_INDEX.length} rows`);
  const bad = [];
  PL_INDEX.forEach((e, i) => {
    const R = G.settings(e.label, PL_INDEX), k = R.findIndex((r) => r.i === i);
    if (k < 0 || k > 2 || R.slice(0, k).some((r) => base(PL_INDEX[r.i].label) !== base(e.label))) bad.push(`"${e.label}" (${e.where}): ${R.slice(0, 4).map((r) => `${PL_INDEX[r.i].label}:${r.score}`).join(' | ')}`);
  });
  assert.deepEqual(bad, []);
});
test('(b) rows of the same name: the label and the name of its section put it first', () => {
  const twins = PL_INDEX.filter((e) => PL_INDEX.filter((x) => base(x.label) === base(e.label)).length > 1), bad = [];
  assert.ok(twins.length >= 2, twins.map((e) => e.label).join(', ')); // (Circle colour of the pole numbers and of the location map; Label size)
  twins.forEach((e) => { const sec = PL_INDEX.find((x) => x.sec === e.sec && x.isSec), q = `${e.label} ${sec ? sec.label : ''}`, R = G.settings(q, PL_INDEX); if (!R.length || PL_INDEX[R[0].i] !== e) bad.push(`"${q}": ${R.slice(0, 3).map((r) => `${PL_INDEX[r.i].label} (${PL_INDEX[r.i].where})`).join(' | ')}`); });
  assert.deepEqual(bad, []);
});
test('(b) the Tutorial\'s search shows every Plan style setting by its label (Setting · … · Show me: the first 3 strong ones)', () => {
  const bad = [];
  PL_INDEX.forEach((e, i) => { const R = G.settings(e.label, PL_INDEX).filter((r) => r.strong && r.label > 0), k = R.findIndex((r) => r.i === i); if (k < 0 || k > 2) bad.push(`"${e.label}": ${R.slice(0, 3).map((r) => PL_INDEX[r.i].label).join(' | ') || 'none'}`); });
  assert.deepEqual(bad, []);
});
test('(b) Find a setting finds a setting by the words of its choices and hint, in other spellings too', () => {
  const first = (q) => { const R = G.settings(q, PL_INDEX); return R.length ? PL_INDEX[R[0].i].label : ''; };
  assert.equal(first('sheet split'), 'Sheet split (Tidy)');
  assert.equal(first('grid split'), 'Sheet split (Tidy)'); // (its hint: "(grid split)")
  assert.equal(first('callout'), 'Where they are written'); // (its choice: Box with a line (callout))
  // 2.45.1 / beta 6.9: the Simple drawing's Extra cable on each span (FOC %) is Plan style › Cables › Span length allowance (one row, one key);
  // each word of it in the label's name, so the Tutorial's search lists it as a setting too (strong, label > 0)
  const ALLOW = 'Span length allowance: extra cable for sag and wastage, FOC %';
  for (const q of ['foc', 'foc %', 'span length allowance', 'allowance', 'extra cable', 'sag', 'wastage']) {
    assert.equal(first(q), ALLOW, q);
    assert.ok(G.settings(q, PL_INDEX).some((r) => PL_INDEX[r.i].label === ALLOW && r.strong && r.label > 0), `${q}: listed by the Tutorial`);
    assert.equal(PL_INDEX[G.settings(q, PL_INDEX)[0].i].where, 'Plan style › More settings › Cables', q);
  }
  assert.ok(!PL_INDEX.some((e) => /Extra cable on each span/.test(e.label)), 'the old Simple drawing row is gone');
  assert.equal(first('utm'), 'Map zone (UTM)');
  assert.equal(first('keymap'), 'Owner colour key on the plan');
  assert.ok(G.settings('logo', PL_INDEX).slice(0, 3).some((r) => PL_INDEX[r.i].label === 'Company template'), 'logo: the Company template row (Company logo)');
  assert.deepEqual(G.settings('color', PL_INDEX).map((r) => r.i), G.settings('colour', PL_INDEX).map((r) => r.i));
  assert.equal(G.settings('nothing like this', PL_INDEX).length, 0);
  // the main choices first: a Basic row, and a row named by the word before one that only works with it (Sheet split (Tidy))
  assert.equal(first('tidy'), 'Pole labels'); // (its choice Tidy: neat blocks; then the rows that work only with Tidy)
  assert.equal(first('simple'), 'Kind of drawing'); // (Simple points and photos; then the Simple drawing's own rows)
  assert.equal(first('colour'), 'Pole number colours');
  assert.equal(first('photo'), 'Photos on the plan');
  assert.equal(first('pmi'), 'Count the loops in the cable lengths (PMI)'); // (another name in (…) counts more than a hint)
  assert.equal(first('font size'), 'Box text size'); // (font: text)
});
test('(b) the Tutorial lists a setting only when its name or place says every word (not a hint, not a condition such as (Tidy))', () => {
  const tut = (q) => [...G.settings(q, PL_INDEX)].filter((r) => r.strong && r.label > 0).slice(0, 3).map((r) => PL_INDEX[r.i].label); // (the app's renderTutList)
  assert.deepEqual(tut('tidy'), []); // (the Tidy pole labels topic first, not Sheet split (Tidy))
  assert.deepEqual(tut('sheet split'), ['Sheet split (Tidy)']);
  assert.deepEqual(tut('logo'), []); // (the Company template row says it only in its text: the topics answer)
  assert.ok(tut('colour').length === 3 && tut('colour')[0] === 'Pole number colours', tut('colour').join(' | '));
});
test('(c) every control of Plan style\'s cards and More settings is inside a row that carries its label (data-find or data-findx)', () => {
  const panes = ['plCards', 'plMore'].map((id) => byId(STYLE, id)), bad = [];
  panes.forEach((p) => all(p, (n) => ['input', 'select', 'textarea', 'button'].includes(n.tag)).forEach((c) => {
    if (closest(c, (x) => !!labelOf(x)) || closest(c, (x) => hasCls(x, 'plban'))) return; // (the banners: Get it, Change ›)
    bad.push(`${c.tag}#${c.a.id || '?'} ${textOf(c, () => false).trim().slice(0, 30)}`);
  }));
  assert.deepEqual(bad, []);
});
/* the ? of each row: the app's qhelpFor(), from index.html (acc: in a PAT, cleanup or FAT project, data-tutacc first) */
const qhelp = (el, acc) => { const [topic, ...more] = String((acc && el.a['data-tutacc']) || el.a['data-tut'] || '').split(' ').filter(Boolean), rows = isSec(el) ? all(el, (n) => !!n.a['data-find']).map((n) => n.a['data-find']) : []; return { h: G.help([el.a['data-find'], ...rows, ...(more.length ? [more.join(' ')] : [])], { topic }), topic, rows }; };
const QROWS = [...all(EXPORT, (n) => n.tag === 'div' && hasCls(n, 'xcard') && !!n.a['data-find']), ...all(STYLE, (n) => isSec(n) && !!n.a['data-find'])];
test('(c) every Export row and Plan style section has a ? that opens a tutorial step saying its label (in its data-tut topic)', () => {
  assert.ok(QROWS.length >= 29, `${QROWS.length} rows and sections`);
  const bad = [];
  QROWS.forEach((el) => {
    const L = el.a['data-find'], { h, topic, rows } = qhelp(el), t = h && G.topics.find((x) => x.id === h.id);
    if (!t) { bad.push(`${L}: no step says it`); return; }
    if (topic && h.id !== topic) bad.push(`${L}: data-tut ${topic}, but its step is in ${h.id}`);
    const said = t.steps[h.step].t.toLowerCase().replace(/\*/g, '');
    if (!said.includes(L.toLowerCase())) bad.push(`${L}: ${h.id} step ${h.step + 1} does not say it`);
    if (rows.length && !rows.some((r) => said.includes(r.toLowerCase()))) bad.push(`${L}: ${h.id} step ${h.step + 1} names none of its rows (${rows.join(', ')})`);
  });
  assert.deepEqual(bad, []);
});
test('(d) the ? targets: every data-tut names a user topic; an acceptance row\'s ? opens a step for PAT, cleanup and FAT', () => {
  const bad = QROWS.filter((el) => el.a['data-tut'] && !G.topics.some((t) => t.id === el.a['data-tut'].split(' ')[0] && t.aud === 'user')).map((el) => `${el.a['data-find']}: ${el.a['data-tut']}`);
  assert.deepEqual(bad, []);
  const acc = all(byId(EXPORT, 'accExports'), (n) => hasCls(n, 'xcard')).map((el) => { const { h } = qhelp(el); return [el.a['data-find'], h && G.topics.find((t) => t.id === h.id).steps[h.step].t]; });
  assert.deepEqual(acc.filter(([, t]) => !/PAT|FAT|cleanup|Deficiency|defect/i.test(t || '')).map(([l]) => l), []);
});
/* beta 6.7 (UX step 5 fixes; the independent review) */
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
test('(d) acceptance: the rows a PAT, cleanup or FAT shares with a survey (data-tutacc) open a PAT, cleanup and FAT step saying them', () => {
  const shared = all(EXPORT, (n) => hasCls(n, 'xcard') && !!n.a['data-tutacc']), bad = [];
  assert.ok(shared.length >= 3, shared.map((n) => n.a['data-find']).join(', ')); // (Photos with their locations, Completion report, Backup of the project)
  shared.forEach((el) => {
    const L = el.a['data-find'], { h } = qhelp(el, true), t = h && G.topics.find((x) => x.id === h.id), said = t ? t.steps[h.step].t.replace(/\*/g, '') : '';
    if (!said.toLowerCase().includes(L.toLowerCase()) || !/PAT|FAT|cleanup|Deficiency|defect/.test(said)) bad.push(`${L}: ${h ? `${h.id} step ${h.step + 1}` : 'no step'}: ${said.slice(0, 80)}`);
  });
  assert.deepEqual(bad, []);
  assert.ok(/isAcc\(\) && el\.dataset\.tutacc\) \|\| el\.dataset\.tut/.test(APP), 'app.js qhelpFor: data-tutacc first in a PAT, cleanup or FAT project');
});
test('(d) a cleanup\'s Hand on (its label set by app.js): its ? opens a step that says that label; the ? is named after the label shown', () => {
  const m = APP.match(/\$\('xShareBox'\)\.dataset\.find = cl \? '([^']+)' : '([^']+)'; \$\('xShareBox'\)\.dataset\.tut = cl \? '([^']+)' : '([^']+)'/);
  assert.ok(m, 'app.js sets the Hand on row\'s label and data-tut together');
  const box = byId(EXPORT, 'xShareBox'), [, clL, patL, clT, patT] = m;
  assert.equal(patL, box.a['data-find']); assert.equal(patT, box.a['data-tut']); // (a PAT: as index.html says)
  assert.ok(APP.includes(`$('xShareName').textContent = cl ? '${clL}'`), 'the cleanup row shows the label its ? is found by');
  for (const [L, T] of [[clL, clT], [patL, patT]]) {
    const h = G.help([L], { topic: T }), t = h && G.topics.find((x) => x.id === h.id), said = t ? t.steps[h.step].t.replace(/\*/g, '') : '';
    assert.ok(h && h.id === T && said.includes(L) && /FAT|cleanup/.test(said), `${L}: ${h ? `${h.id} step ${h.step + 1}` : 'no step'}`);
  }
  assert.ok(/new MutationObserver\(named\)\.observe\(el, \{ attributes: true, attributeFilter: \['data-find'\] \}\)/.test(APP), 'the ? is named again when its row\'s label changes');
});
test('(c) the rows the other choices hide (the Simple drawing\'s own rows): grouped with data-findneed, why and how; Find a setting marks that row', () => {
  const groups = all(STYLE, (n) => !!n.a['data-findneed']), bad = [];
  assert.ok(groups.length >= 1);
  groups.forEach((g) => {
    const need = byId(STYLE, g.a['data-findneed']), opts = need ? all(need, (n) => n.tag === 'option').map((o) => textOf(o, () => false).trim()) : [];
    if (!need || !need.a['data-find'] || closest(need, (x) => x === g)) bad.push(`${g.a.id}: data-findneed ${g.a['data-findneed']} is not a labelled row outside it`);
    if (!g.a['data-findwhy'] || !g.a['data-findhow']) bad.push(`${g.a.id}: no data-findwhy or data-findhow`);
    if (!opts.some((o) => o && (g.a['data-findhow'] || '').includes(o))) bad.push(`${g.a.id}: data-findhow names none of ${g.a['data-findneed']}'s choices (${opts.join(', ')})`);
    if (!all(g, (n) => !!labelOf(n)).length) bad.push(`${g.a.id}: no labelled row in it`);
  });
  // the rows renderDxfTpl hides while the company plan is made are all in such a group
  const m = APP.match(/\[([^\]]+)\]\.forEach\(\(k\) => \{ const el = \$\(k\); const row = el && \(el\.closest\('\.opt2'\) \|\| el\.closest\('label'\)\); if \(row\) row\.hidden = tpl; \}\)/);
  assert.ok(m, 'renderDxfTpl: the rows hidden with the company plan');
  m[1].split(',').map((x) => x.trim().replace(/'/g, '')).forEach((id) => { const c = byId(STYLE, id); if (!c || !closest(c, (x) => !!x.a['data-findneed'])) bad.push(`#${id} is hidden with the company plan, outside a data-findneed group`); });
  assert.deepEqual(bad, []);
  assert.ok(/const need = e\.need && plOff\(e\) \? \$\(e\.need\) : null;/.test(APP), 'app.js plFindGo: a hidden row marks its data-findneed row');
});
