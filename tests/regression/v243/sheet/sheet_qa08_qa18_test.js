#!/usr/bin/env node
/*
 * sheet_qa08_qa18_test.js — QA-08 and QA-18 on the sheet script v2.43.2 (offline, synthetic data only; sheet_env.js stand-ins).
 * The update from v2.43.1 (coordinators kept approved), who gets the mailbox, approvals by a coordinator and by the admin, the team
 * answer without a confirmed email, the codes per company and the emails kept for admin codes, and what older apps are told.
 * (The report's "Nina", a person never in a team, is played by Maria Garcia.)   node sheet_qa08_qa18_test.js
 */
'use strict';
const path = require('path');
process.env.GS_FILE = process.env.GS_FILE || path.join(__dirname, 'PoleCam-online-sheet_v2.43.2.gs');
const { world, load, post: post0, get, advance } = require('../e2e/sheet_env.js');
let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (info !== undefined ? '\n      got: ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 900) : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const section = (t) => console.log('\n== ' + t);
process.on('uncaughtException', (e) => { console.log('FAIL  stopped by an exception: ' + ((e && e.stack) || e)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed (stopped early)'); process.exit(1); });

const CO_A = 'DEMO CONTRACTOR', CO_B = 'DEMO CONTRACTOR B', KEY_A = 'DMCA-7KQ4-MX2P', KEY_B = 'DMCB-4HJK-9TRW';
const JUAN = 'juan@demo-contractor.example', PEDRO = 'pedro@demo-contractor.example', MARIA = 'maria@demo-contractor.example', ANA = 'ana@demo-contractor-b.example';
const INSPECTOR = 'inspector@demo-telco.example';
const URL_A = 'https://script.google.com/macros/s/AKfycbDemoContractorMailbox_123-abc/exec', TKEY_A = 'tk_DemoContractorTeamKey_0001', TKEY_A2 = 'tk_DemoContractorTeamKey_0002-new';
const tab = (n) => world.ss.getSheetByName(n);
const header = (n) => tab(n).getRange(1, 1, 1, tab(n).getLastColumn()).getValues()[0];
const rowOf = (email) => { const h = header('Team'), v = tab('Team').getRange(2, 1, tab('Team').getLastRow() - 1, h.length).getValues(); const r = v.find((x) => String(x[1]).toLowerCase() === email); if (!r) return null; const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; };
const lastCode = (to) => { const m = world.mail.filter((x) => x.to === to).pop(); const k = m && /\b(\d{6})\b/.exec(m.subject); return k ? k[1] : null; };

/* ---- before the update: a v2.43.1 sheet with two coordinators, a field partner in a team, and A's mailbox ---- */
const gs1 = load(path.join(__dirname, 'PoleCam-online-sheet_v2.43.1.gs'));
gs1.setup();
tab('Companies').getRange(2, 1, 3, 1).setValues([['DEMO TELCO'], [CO_A], [CO_B]]);
tab('CompanyKeys').getRange(2, 1, 2, 4).setValues([[CO_A, KEY_A, 'No', 'Yes'], [CO_B, KEY_B, 'No', 'Yes']]);
tab('Admin users').getRange(2, 1, 1, 5).setValues([[INSPECTOR, 'Demo Inspector', 'ID-001', '0917-000-0000', 'PAT/FAT inspector']]);
const ADMIN_KEY = gs1.settings_()['Admin key'];
function verifyWith(gs, ckey, email, tv) {
  let s = post0(gs, { action: 'teamCode', ckey, email, tv });
  if (!s.ok && s.error === 'wait') { advance(601); s = post0(gs, { action: 'teamCode', ckey, email, tv }); }
  return post0(gs, { action: 'teamVerify', ckey, email, code: lastCode(email), tv }).tok;
}
let TJ = verifyWith(gs1, KEY_A, JUAN), TP = verifyWith(gs1, KEY_A, PEDRO), TA = verifyWith(gs1, KEY_B, ANA);
post0(gs1, { action: 'teamRole', ckey: KEY_A, email: JUAN, tok: TJ, name: 'Juan Dela Cruz', role: 'Coordinator', regions: 'MIN' });
post0(gs1, { action: 'teamRole', ckey: KEY_B, email: ANA, tok: TA, name: 'Ana Reyes', role: 'Coordinator', regions: 'VIS' });
post0(gs1, { action: 'teamRole', ckey: KEY_A, email: PEDRO, tok: TP, name: 'Pedro Santos', role: 'Field Partner', regions: 'MIN' });
post0(gs1, { action: 'teamJoin', ckey: KEY_A, email: PEDRO, tok: TP, name: 'Pedro Santos', coordinator: JUAN });
post0(gs1, { action: 'teamAnswer', ckey: KEY_A, email: JUAN, tok: TJ, member: PEDRO, accept: true });
post0(gs1, { action: 'mailboxSet', ckey: KEY_A, email: JUAN, tok: TJ, url: URL_A, key: TKEY_A, account: JUAN });
const pre = post0(gs1, { action: 'team', ckey: KEY_A, email: PEDRO, tok: TP });

/* ---- the update to v2.43.2 ---- */
const gs = load(process.env.GS_FILE);
const post = (body, tv) => post0(gs, { ...body, tv: tv === undefined ? 2 : tv }); // G-eSAA beta 3.3 sends tv: 2
section('the update: coordinators already there stay approved');
check('before: v2.43.1 gave Pedro (in Juan\'s team) the mailbox', pre.ok && pre.mailbox && pre.mailbox.key === TKEY_A, pre);
check('before: the Team tab has no Approved column', !header('Team').includes('Approved (Yes / No)'), header('Team'));
world.logs.length = 0; gs.setup();
check('setup adds "Approved (Yes / No)" to the Team tab', header('Team').includes('Approved (Yes / No)'), header('Team'));
check('Juan and Ana (coordinators) get Yes; Pedro (field partner) stays blank', rowOf(JUAN)['Approved (Yes / No)'] === 'Yes' && rowOf(ANA)['Approved (Yes / No)'] === 'Yes' && rowOf(PEDRO)['Approved (Yes / No)'] === '', [rowOf(JUAN), rowOf(PEDRO)]);
check('the run log lists them', world.logs.some((l) => /Coordinators kept approved \(2\): .*juan@demo-contractor\.example.*ana@demo-contractor-b\.example/.test(l)), world.logs);
gs.setup();
check('setup again: one Approved column, unchanged', header('Team').filter((h) => h === 'Approved (Yes / No)').length === 1 && rowOf(JUAN)['Approved (Yes / No)'] === 'Yes');
let r = post({ action: 'team', ckey: KEY_A, email: PEDRO, tok: TP });
check('after the update the team works as before: Pedro (in) has the mailbox, Juan is Coordinator', r.ok && r.mailbox && r.mailbox.key === TKEY_A && post({ action: 'team', ckey: KEY_A, email: JUAN, tok: TJ }).me.role === 'Coordinator', r);

section('QA-08: Pedro (removed, after the key changed) picks Coordinator');
check('Juan removes Pedro and changes the key', post({ action: 'teamRemove', ckey: KEY_A, email: JUAN, tok: TJ, member: PEDRO }).ok && post({ action: 'mailboxKey', ckey: KEY_A, email: JUAN, tok: TJ, key: TKEY_A2 }).ok);
r = post({ action: 'teamRole', ckey: KEY_A, email: PEDRO, tok: TP, role: 'Coordinator' });
check('Pedro picks Coordinator: asked for, works as On my own', r.ok && eq(r.me, { role: 'On my own', regions: 'MIN', name: 'Pedro Santos', ask: 'asked' }), r);
r = post({ action: 'team', ckey: KEY_A, email: PEDRO, tok: TP });
check('Pedro gets no mailbox (no address, no key)', r.mailbox === null && JSON.stringify(r).indexOf(TKEY_A2) < 0 && JSON.stringify(r).indexOf(URL_A) < 0 && r.me.ask === 'asked', r);
check('Pedro\'s mailboxSet is refused (and the company\'s mailbox is unchanged)', eq(post({ action: 'mailboxSet', ckey: KEY_A, email: PEDRO, tok: TP, url: URL_A.replace('123', '999'), key: 'tk_PedroOwnKey_000000000001' }), { ok: false, error: 'role' })
  && tab('Mailboxes').getRange(2, 2).getValue() === URL_A);
check('Pedro\'s mailboxKey is refused', eq(post({ action: 'mailboxKey', ckey: KEY_A, email: PEDRO, tok: TP, key: 'tk_PedroOwnKey_000000000002' }), { ok: false, error: 'role' }));
check('Pedro cannot approve himself or others', eq(post({ action: 'teamApprove', ckey: KEY_A, email: PEDRO, tok: TP, who: PEDRO, approve: true }), { ok: false, error: 'role' }));
check('Pedro is not in the list of coordinators to join', !post({ action: 'team', ckey: KEY_A, email: JUAN, tok: TJ }).coordinators.some((c) => c.email === PEDRO));

section('QA-08: a person never in a team (Maria) picks Coordinator');
const TM = verifyWith(gs, KEY_A, MARIA, 2);
r = post({ action: 'teamRole', ckey: KEY_A, email: MARIA, tok: TM, name: 'Maria Garcia', role: 'Coordinator', regions: 'MIN' });
check('Maria: asked for, works as On my own, no mailbox', r.ok && r.me.ask === 'asked' && r.me.role === 'On my own' && post({ action: 'team', ckey: KEY_A, email: MARIA, tok: TM }).mailbox === null, r);
check('Maria\'s mailboxSet is refused', eq(post({ action: 'mailboxSet', ckey: KEY_A, email: MARIA, tok: TM, url: URL_A, key: TKEY_A2 }), { ok: false, error: 'role' }));
check('nobody can join Maria\'s team yet', eq(post({ action: 'teamJoin', ckey: KEY_A, email: PEDRO, tok: TP, coordinator: MARIA }), { ok: false, error: 'role' }));

section('approvals: by an approved coordinator, by the admin, in the sheet');
r = post({ action: 'team', ckey: KEY_A, email: JUAN, tok: TJ });
check('Juan (approved) sees who is asking: Pedro and Maria', eq(r.asking.map((x) => x.email).sort(), [MARIA, PEDRO].sort()), r.asking);
check('a field partner or an asker sees no one asking', eq(post({ action: 'team', ckey: KEY_A, email: MARIA, tok: TM }).asking, []));
r = post({ action: 'teamApprove', ckey: KEY_A, email: JUAN, tok: TJ, who: MARIA, approve: true });
check('Juan approves Maria', eq(r, { ok: true, status: 'approved' }) && rowOf(MARIA)['Approved (Yes / No)'] === 'Yes', r);
r = post({ action: 'team', ckey: KEY_A, email: MARIA, tok: TM });
check('after approval it works: Maria is Coordinator and gets the mailbox (the new key)', r.me.role === 'Coordinator' && r.me.ask === '' && r.mailbox && r.mailbox.key === TKEY_A2, r);
check('…and her mailboxSet is accepted', post({ action: 'mailboxSet', ckey: KEY_A, email: MARIA, tok: TM, url: URL_A, key: TKEY_A2, account: JUAN }).ok);
r = post({ action: 'teamApprove', ckey: KEY_A, email: JUAN, tok: TJ, who: PEDRO, approve: false });
check('Juan declines Pedro: declined, no mailbox', eq(r, { ok: true, status: 'declined' }) && post({ action: 'team', ckey: KEY_A, email: PEDRO, tok: TP }).me.ask === 'declined' && post({ action: 'team', ckey: KEY_A, email: PEDRO, tok: TP }).mailbox === null, r);
check('picking Coordinator again does not undo a decline', post({ action: 'teamRole', ckey: KEY_A, email: PEDRO, tok: TP, role: 'Coordinator' }).me.ask === 'declined');
check('a coordinator of company B cannot approve someone of A', eq(post({ action: 'teamApprove', ckey: KEY_B, email: ANA, tok: TA, who: PEDRO, approve: true }), { ok: false, error: 'link' }));
r = post0(gs, { action: 'teamCoords', key: ADMIN_KEY });
check('the admin phone lists every coordinator with its state (both companies)', r.ok && eq(r.coords.map((c) => [c.email, c.approved]).sort(), [[ANA, 'yes'], [JUAN, 'yes'], [MARIA, 'yes'], [PEDRO, 'no']].sort()), r);
check('without the Admin key: refused', eq(post0(gs, { action: 'teamCoords', key: 'wrong' }), { ok: false, error: 'key' }));
check('the admin approves Pedro from the admin phone: he works as Coordinator', post0(gs, { action: 'teamCoordSet', key: ADMIN_KEY, company: CO_A, email: PEDRO, approve: true }).ok
  && post({ action: 'team', ckey: KEY_A, email: PEDRO, tok: TP }).me.role === 'Coordinator' && !!post({ action: 'team', ckey: KEY_A, email: PEDRO, tok: TP }).mailbox);
// the admin removes Maria in the sheet: No in her row
const mr = tab('Team').getRange(1, 1, tab('Team').getLastRow(), header('Team').length).getValues().findIndex((x) => x[1] === MARIA) + 1;
tab('Team').getRange(mr, header('Team').indexOf('Approved (Yes / No)') + 1).setValue('No');
r = post({ action: 'team', ckey: KEY_A, email: MARIA, tok: TM });
check('the admin types No for Maria in the sheet: no longer a coordinator, no mailbox, mailboxSet refused', r.me.role === 'On my own' && r.me.ask === 'declined' && r.mailbox === null
  && eq(post({ action: 'mailboxKey', ckey: KEY_A, email: MARIA, tok: TM, key: 'tk_MariaOwnKey_0000000000001' }), { ok: false, error: 'role' }), r);
r = post({ action: 'teamRole', ckey: KEY_A, email: JUAN, tok: TJ, role: 'Field Partner' });
check('an approved coordinator who switches away loses the approval', r.ok && rowOf(JUAN)['Approved (Yes / No)'] === '');
r = post({ action: 'teamRole', ckey: KEY_A, email: JUAN, tok: TJ, role: 'Coordinator' });
check('…and coming back is asked for again', r.me.ask === 'asked' && r.me.role === 'On my own', r);
post0(gs, { action: 'teamCoordSet', key: ADMIN_KEY, company: CO_A, email: JUAN, approve: true });
check('Yes again (admin): Juan is Coordinator with the mailbox', post({ action: 'team', ckey: KEY_A, email: JUAN, tok: TJ }).me.role === 'Coordinator' && !!post({ action: 'team', ckey: KEY_A, email: JUAN, tok: TJ }).mailbox);
// a member in the team of a coordinator who is no longer approved: no mailbox
post({ action: 'teamJoin', ckey: KEY_A, email: MARIA, tok: TM, coordinator: PEDRO }); post({ action: 'teamAnswer', ckey: KEY_A, email: PEDRO, tok: TP, member: MARIA, accept: true });
check('Maria in Pedro\'s team (Pedro approved): she gets the mailbox', !!post({ action: 'team', ckey: KEY_A, email: MARIA, tok: TM }).mailbox);
post0(gs, { action: 'teamCoordSet', key: ADMIN_KEY, company: CO_A, email: PEDRO, approve: false });
check('Pedro declined by the admin: Maria (in his team only) no longer gets the mailbox', post({ action: 'team', ckey: KEY_A, email: MARIA, tok: TM }).mailbox === null);

section('QA-18: the team answer without a confirmed email');
r = post({ action: 'team', ckey: KEY_A, email: JUAN });
check('Juan\'s email without its token: no names, no emails, no teams', r.ok && r.verified === false && r.me === null && eq(r.coordinators, []) && eq(r.myTeams, []) && eq(r.members, []) && eq(r.asking, []) && r.mailbox === null
  && !/@/.test(JSON.stringify({ ...r, company: '' })) && !/Pedro|Maria|Juan/.test(JSON.stringify(r)), r);
r = post({ action: 'team', ckey: KEY_A, email: 'someone@demo-contractor.example' });
check('any email without a token: the same (only whether there is a mailbox)', r.ok && r.me === null && eq(r.coordinators, []) && typeof r.mailboxSet === 'boolean' && !/@/.test(JSON.stringify(r)), r);

section('QA-18: email codes per company per day, and emails kept for admin codes');
world.quota = 100;
const usedA = () => { const k = Object.keys(world.props).find((x) => x.startsWith('tcd.')) || ''; return k; };
let sent = 0, refused = null;
for (let i = 1; i <= 40 && !refused; i++) {
  const a = post({ action: 'teamCode', ckey: KEY_A, email: `user${i}@demo-contractor.example` });
  if (a.ok) sent++; else refused = { i, a };
}
const before = world.mail.filter((m) => /demo-contractor\.example$/.test(m.to)).length; // (codes of company A today, the earlier ones included)
check('company A: refused at its 31st code of the day (30 sent today in all)', refused && refused.a.error === 'codes' && refused.a.max === 30, { sent, refused });
check('the refused one sent no email', world.mail.filter((m) => m.to === `user${refused ? refused.i : 0}@demo-contractor.example`).length === 0);
check('company B still gets a code the same day', post({ action: 'teamCode', ckey: KEY_B, email: 'ana2@demo-contractor-b.example' }).ok);
advance(24 * 3600);
check('the next day company A gets codes again', post({ action: 'teamCode', ckey: KEY_A, email: 'user99@demo-contractor.example' }).ok);
world.quota = 20;
r = post({ action: 'teamCode', ckey: KEY_A, email: 'user98@demo-contractor.example' });
check('20 emails left today: team codes stop (kept for admin codes)', eq(r, { ok: false, error: 'mailday' }), r);
r = post0(gs, { action: 'adminCode', ckey: KEY_A, email: INSPECTOR });
check('…and an admin user still gets an admin code', eq(r, { ok: true, sent: true }) && lastCode(INSPECTOR) !== null, r);
world.quota = 21;
check('21 left: a team code goes again', post({ action: 'teamCode', ckey: KEY_A, email: 'user97@demo-contractor.example' }).ok);

section('older apps (no team version): readable sentences, nothing breaks');
world.quota = 100;
const TJ2 = verifyWith(gs, KEY_A, 'juan.b2@demo-contractor.example', undefined);
r = post0(gs, { action: 'teamRole', ckey: KEY_A, email: 'juan.b2@demo-contractor.example', tok: TJ2, name: 'Juan Dela Cruz', role: 'Coordinator' });
check('a beta 2.2 phone picking Coordinator: Not done, with a sentence it shows as it is', r.ok === false && /^asked for: your admin or an approved coordinator of your company approves new coordinators/.test(r.error), r);
check('…its request is kept (asked for, in the Team tab)', rowOf('juan.b2@demo-contractor.example') && rowOf('juan.b2@demo-contractor.example').Role === 'Coordinator' && rowOf('juan.b2@demo-contractor.example')['Approved (Yes / No)'] === '');
r = post0(gs, { action: 'teamRole', ckey: KEY_A, email: 'juan.b2@demo-contractor.example', tok: TJ2, role: 'Field Partner' });
check('a beta 2.2 phone picking Field Partner: ok as before', r.ok && r.me.role === 'Field Partner', r);
check('a beta 2.2 phone reading its team: ok as before', post0(gs, { action: 'team', ckey: KEY_A, email: 'juan.b2@demo-contractor.example', tok: TJ2 }).ok);
for (let i = 0; i < 40; i++) { const a = post0(gs, { action: 'teamCode', ckey: KEY_B, email: `b${i}@demo-contractor-b.example` }); if (!a.ok) { r = a; break; } }
check('a beta 2.2 phone over the company\'s codes: a sentence, not a code', /^your company has used today's email codes for teams/.test(r.error), r);
check('all locks released', world.lockHeld === 0);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
