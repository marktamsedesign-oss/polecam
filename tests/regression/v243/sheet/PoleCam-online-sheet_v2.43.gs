/**
 * PoleCam online sheet (v2.43) — companies, sites / tasks, map pack links, the signed company list, task progress and the teams
 * (Coordinator / Field Partner, contractor mailboxes) for the PoleCam app.
 *
 * New setup (once, by the admin):
 *   1. Make a new Google Sheet, e.g. "PoleCam online list".
 *   2. Extensions → Apps Script. Delete what is there, paste this whole file, Save.
 *   3. Choose the function "setup" at the top and Run it. Allow the permissions it asks for.
 *      It creates the tabs Settings, Companies, Tasks, MapPacks, CompanyKeys and Admin users, and random keys in Settings.
 *      (v2.43: also the tabs Team, TeamLinks and Mailboxes, see below.)
 *   4. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone. Deploy.
 *      Copy the Web app URL (it ends with /exec).
 *   5. In PoleCam (admin phone): Settings → Administration → Manage (admin) → Online Google Sheet:
 *      paste the Web app URL and the Read key (from the Settings tab), Test connection, then Save and share the list.
 *      Phones receive the sheet address when they join (join link or QR code). With the Admin key entered on the admin
 *      phone, each new list version is also kept here (v2.9), so phones that joined take it by themselves.
 *
 * Updating an existing sheet to this version: paste this file over the old code, Save, Run "setup" once (it only adds
 * what is missing), then Deploy → Manage deployments → pencil (Edit) → Version: New version → Deploy.
 * Do NOT use "New deployment" for an update: that makes a new URL and the phones would stop reading the sheet.
 *
 * Sites / tasks from your own data (optional): set "Tasks source tab" to the tab that lists them (e.g. Project Data) —
 * in this spreadsheet, or in another one given by "Tasks source" (its URL; the account that deploys this script must be
 * able to open it). Columns are found by their header names (see the "Column: …" settings; blank = guess from common
 * names). A row may name several vendors ("NOKIA , HUAXIN"): each of them gets it. Rows without a category are sites
 * the user picks when making a project (the user then chooses Survey / PAT / Defect cleanup / FAT).
 *
 * Region and Territory (v2.25): the columns "Region" (NLZ, SLZ, NCR, VIS, MIN, or North Luzon, South Luzon, Metro Manila,
 * Visayas, Mindanao) and "Territory" (T1 … T8, or Territory 1 …) of that tab are read (see "Column: Region" and
 * "Column: Territory"; blank = found by their header). Each user ticks their regions and territories in G-eSAA (Your
 * details); the phone sends them and gets only the rows in those regions and territories. A row with a blank Region or
 * Territory goes to everyone. v2.27: a user (G-eSAA 2.27 or later) with no region or no territory ticked gets no site at all.
 * This only narrows the list (the company split above is unchanged).
 *
 * Admin users (v2.28): the tab "Admin users" lists each admin / inspector of the admin company: Email, Name, Company ID no.,
 * Mobile and Job (PAT/FAT inspector, As-Plan approver, Audit approver, As-Built approver; several in one cell are fine).
 * The admin phone reads it (with the Admin key) and puts the emails and jobs in the signed company list when it is saved:
 * the job decides who may approve which completed task on site (the approval QR code). "KMZ password" in Settings locks the
 * shared PAT / cleanup / FAT KMZ files.
 * The companies can come from a tab with an Authorization column (e.g. Company List: GLOBE = ADMIN): ADMIN companies see
 * every row. Run "testSource" from the editor to see what the phones will get, per company, in the execution log.
 *
 * Plan template (v2.32): the phones get the company plan template (the prepared seed .dxf made from the AutoCAD template)
 * through this sheet, in one tap, on the website as well as in the Android app. The file stays on Google Drive, shared
 * "Anyone with the link"; its link is the one the admin phone saves in Administration → Plan drawing template and shares
 * with the company list (or, instead, put the link in Settings → "Plan template"). Only that one file is ever sent, and only
 * to phones with the Read key or a company key. Updating to v2.32 asks for one new permission, "Connect to an external
 * service": the script downloads the template from its Drive link (it does not get access to your Drive).
 *
 * Company logos (v2.34): a user of a company (with its company key) sets the company's logo in G-eSAA (Export → AutoCAD ·
 * DXF → Add company logo); it is kept in the tab "Logos" (Company, Updated, Type, Picture as text) and every phone of that company
 * gets it, for the title block of its plan drawings. The admin phone (Admin key) may set any company's logo. Delete a row to
 * remove a logo. Nothing new to allow when updating: the logos stay in this spreadsheet.
 *
 * Site details (v2.41): with each site the phones get the columns between Territory and OSP VENDOR (the vendor column, see
 * "Column: Contractor") of the sites tab, in their order (e.g. Project Name, Serial Number, PLA ID, Site Name): G-eSAA shows them in
 * New project and Project details (the user may correct them there, on the phone only; nothing is written back to this sheet) and puts
 * them on the plan drawing's title blocks and the reports.
 *
 * Invites for several companies (v2.41): the admin phone (with the Admin key) makes one invite for one or more companies; it is kept in
 * the tab "Invites" (Code, Companies, Made, Valid until, Active, Uses, Max uses, Made by). A new user who opens it chooses one of its
 * companies the first time (it cannot be changed afterwards); the phone then asks this sheet for that company's key (CompanyKeys) with
 * the invite's code, and from then on reads with it, like a phone that joined with a company key. Every key handed out is written in
 * "Invite log" (time, code, company, name, mobile, email). An invite works 14 days and at most 50 times (change Valid until or Max
 * uses in its row); set Active to No to stop it at once. Anyone who has an invite can choose any of ITS companies: make one invite per
 * company when that matters, and send each only to the people it is for. Updating to v2.41 needs nothing new to allow.
 *
 * Invite a vendor (v2.42): Settings → Invite a vendor on the admin phone makes such an invite for the vendor companies only (the admin
 * companies, those with "admin" in the Companies tab's access column, are not offered): one vendor, several, or "any vendor" — kept
 * here as "* (any vendor)": any company of the Companies tab that is not an admin company, checked when the invite is used, so a vendor
 * added later can use it too (its key must be in CompanyKeys: run makeCompanyKeys after adding companies). Admin staff get their own
 * invite (Settings → Invite admin staff). Updating to v2.42: paste this file, Save, Deploy → Manage deployments → Edit → New version.
 *
 * v2.42.4 (safety fixes; update the same way): an any-vendor invite no longer hands out the key of a company that sees all tasks
 * (the admin company); an invite's companies are kept apart with " | " so a name with "/", "&" or "and" in it is matched whole; a second
 * admin phone can no longer replace a saved list version with a different list of the same version.
 *
 * v2.42.5: the list's admin key (encrypted with the admin PIN) is no longer inside the list. The admin phone sends it with each
 * list version; the sheet keeps it beside the list and gives it only to the admin phone (Admin key) and to phones reading with the
 * company key of a company that sees all tasks (the admin company's staff), never with the Read key alone.
 *
 * v2.42.6 (update the same way; nothing new to allow):
 *   Short links: an invite this sheet keeps is sent as a short link (…#i=…) that names only this sheet, the invite's code and the
 *   list's key; the new phone reads the invite's companies and the company list from here with the code (the Read key is no longer in
 *   the link). A user with a company key can make such an invite for their own company (Invite a coworker); it is kept in the Invites
 *   tab like the admin's, and stops when that company's key is replaced. "Move to another phone" keeps the user's details here for
 *   6 hours (Google's cache, not a tab) and the link names only its code; it works for 10 minutes after it is first opened.
 *   Credits: the tab "Credits" (Email, Company, Credits (m), Unlimited, Used (m), Balance (m), Last export, Notes) and "Credit log".
 *   With Settings → "Credits" = Yes, a vendor user needs credits for Export → KMZ and DXF of a survey (and the KMZ inside its
 *   completion report): 1 credit = 1 m of the project's route (the linked spans, but at least the shortest line joining all its poles),
 *   charged once per project: exporting again is free, a longer route is charged only for the new metres. Users of the admin company
 *   (Companies that see all tasks, ADMIN in the Companies tab) never need credits. Unlimited = Yes (or a date: unlimited until that day)
 *   for beta testers and trials (a date as 2026-12-31). A new email is added by itself with "Free credits for a new user (m)" (Settings, default 0). Where
 *   the sheet uses company keys, an email counts only with its own company's key (the Company column; filled in at first use).
 *   Raise "Credits (m)" to top up; Balance = Credits − Used. A phone without internet may export once more and is charged at its
 *   next sync (the balance may go below zero; then exports stop until topped up). Every charge is in "Credit log".
 *
 * v2.42.7 (update the same way): with Credits = Yes, each user of G-eSAA 2.42.6 or later is added to the Credits tab at their first sync
 *   (before, only at their first export), with "Free credits for a new user (m)". Run "addCreditUsers" once from the editor to add the
 *   vendor users the Invite log already lists (also those still on an older G-eSAA, which does not send its email). The phones show
 *   the balance in Settings, under Your details; a user unlimited until a date sees that date. The admin phone (Admin key) manages the
 *   credits itself: Settings → User credits lists the users and adds credits, sets a balance, or makes a user unlimited (or until a date)
 *   or limited again; each change is written in the Credit log with who made it.
 *
 * v2.42.12 (update the same way; nothing new to allow): the CSE Lead of the plan's title blocks. Add a tab named "CSE LEAD" with the
 *   columns "Territory" and "Full Name" (one row per territory: T1 … T8, or Territory 1 …, as in Project Data; several rows for one
 *   territory: their names together). It is looked for in the spreadsheet of the sites (Tasks source), then in this one; another tab
 *   name can be set in Settings → "CSE LEAD tab". At each sync the phones get the list and write the name of the project's territory
 *   (Project Data → Territory) as CSE Lead in every title block of the plan. Run "testCseLeads" from the editor to see what they get.
 *
 * v2.42.18 (update: paste this file, Save, choose "setup" and Run it once: it asks for one new permission, "Send email as you";
 *   then Deploy → Manage deployments → pencil (Edit) → Version: New version → Deploy):
 *   Adding a GLOBE (admin company) user: add a row for them to the Admin users tab (Email, Name, Company ID no., Mobile, Job). On their
 *   phone the user chooses GLOBE in Your details and taps Save: this sheet emails a 6-digit code to that address, only when the
 *   address is on the tab (the code works 10 minutes, 5 tries; at most 3 codes per address in 10 minutes). With the code the phone
 *   gets that row only, never the list, and a token; at each refresh it gets the row again, so the jobs follow the tab, and deleting
 *   the row removes GLOBE from that phone. No admin phone and no new company list are needed. The emails go out from the account that
 *   deployed this script (Google's daily email limit applies: about 100 a day for a gmail.com account). Run "testAdminMail" from the
 *   editor to check that email works (it sends a test email to you). Run "resetAdminTokens" to make every such phone verify again.
 *   Site required: Settings → "Site required" = Yes: a new Survey or PAT must use a site of this sheet (users cannot type a name of
 *   their own); No: they may. Every phone follows it at its next refresh; the admin phone only shows it. Blank: the company list's
 *   setting (the admin phone's switch before v2.42.18).
 *
 * v2.43 (beta): Coordinator / Field Partner teams and the contractor mailboxes. setup adds three tabs (headers in row 1; you may edit
 *   them by hand: the sheet wins; the columns are found by their header names, so you may move them, but keep the header names):
 *   Team (Company, Email, Name, Role, Regions, Updated): each user's role in their company, set in G-eSAA (Your details → My role):
 *     Coordinator, Field Partner or On my own (blank = On my own).
 *   TeamLinks (Company, Coordinator email, Member email, Status, Updated): a user asks to join a Coordinator's team (asked); the
 *     Coordinator accepts (in) or declines (declined) and may remove them (removed); the member may leave (left). One row per company,
 *     coordinator and member, updated in place.
 *   Mailboxes (Company, Web app address, Key, Set up by, Google account, Checked, Status): one row per company: the contractor's own
 *     mailbox script (a copy of the master mailbox script, in a Coordinator's Google account) where the team's phones leave their files;
 *     Key is the team key the phones send to it. Only a Coordinator, and the members a Coordinator accepted (status in), whose email is
 *     confirmed, get the address and the key; the others only learn that there is one. Delete the row to stop handing it out.
 *   Settings → "Mailbox script link" (added by setup, blank at first): the link to the master mailbox script that coordinators copy;
 *     the phones get it with their team.
 *   Every team request needs the company key, so a company sees only its own rows. A change also needs a confirmed email: the phone
 *   asks for a 6-digit code that this sheet emails to that address (as for the admin users of v2.42.18, but any address may ask: the
 *   code works 10 minutes, 5 tries, at most 3 codes per address in 10 minutes). Run "resetTeamTokens" to make every phone confirm its
 *   email again.
 *   Deploying the beta (the users keep their version meanwhile): paste this file, Save, choose "setup" and Run it once (it only adds
 *   what is missing; nothing new to allow after v2.42.18), then Deploy → New deployment → type "Web app" (Execute as: Me, Who has
 *   access: Anyone) → Deploy: its URL is the beta address, for the beta phones only. This is the one case where New deployment is
 *   right: the users' deployment stays on its version (the new tabs do not disturb it), and its address does not change. To promote
 *   the beta: Deploy → Manage deployments → the users' deployment → pencil (Edit) → Version: the beta's version → Deploy. Never use
 *   New deployment for the users' address (see "Updating an existing sheet" above).
 *
 * Company keys (v2.10, recommended): run "makeCompanyKeys" once. Each company gets a short key (e.g. 7KQ4-MX2P-9TRW) in the
 * CompanyKeys tab. A new user types only that key in PoleCam (or scans a coworker's invite QR code): the key tells the
 * sheet which company the user belongs to, the phone gets that company's sites and the signed company list, and the
 * company is fixed on that phone. Phones that read with a company key do not need the Read key, and only companies with
 * "Sees all tasks: Yes" (the admin company) receive the list of company names.
 *
 * Task progress (v2.11): the sites tab gets the columns Survey Start Date, Survey Completion Date, PAT Date, FAT Date and
 * Status (setup adds the ones that are missing). PoleCam writes the dates when a user sets the survey start date or marks a
 * task complete (completion report). Only phones with a company key (their own sites only) or the admin phone may write,
 * and only these date columns. Status is a formula: For Survey, Ongoing Survey, LLD Creation, PAT Done, FAT Done.
 *
 * Who sees which tasks: every phone sends its company. A phone gets the tasks of its own company (and rows with no
 * company, when "Blank company = everyone" is Yes). Companies in "Companies that see all tasks" (the admin company,
 * e.g. Globe Telecom) and the admin phone get all tasks. For a strict split, run "makeCompanyKeys": each company gets
 * its own key in the CompanyKeys tab, and from then on a phone needs its company's key (Settings → Administration →
 * Company access key in the app) to read any task. Without company keys the split relies on the company each phone
 * reports, which someone who knows the Read key could change.
 *
 * Nothing is written by the phones except, from admin phones with the Admin key: company names (CSV import in the app),
 * the MapPacks rows (Administration → Offline map packs) and the latest signed company list (kept in the script's
 * properties, not in a tab; phones check its signature). No photos or survey data come here.
 */

var TABS = {
  Settings: [['Setting', 'Value', 'Notes']],
  Companies: [['Company']],
  Tasks: [['Task ID', 'Project name', 'Category (Survey / PAT / Defect cleanup / FAT)', 'Site / cluster', 'Contractor', 'Globe representative',
    'For company (blank = everyone)', 'Status (Active / Closed)', 'Notes']],
  MapPacks: [['Name', 'Google Drive link (shared: Anyone with the link)', 'Size (MB)', 'Notes']],
  CompanyKeys: [['Company', 'Key (give it only to that company)', 'Sees all tasks (Yes / No)']],
  'Admin users': [['Email', 'Name', 'Company ID no.', 'Mobile', 'Job (PAT/FAT inspector, As-Plan approver, Audit approver, As-Built approver)']], // v2.28
  Logos: [['Company', 'Updated', 'Type', 'Picture (base64, set from G-eSAA)']], // v2.34
  Invites: [['Code', 'Companies (comma-separated)', 'Made', 'Valid until', 'Active (Yes / No)', 'Uses', 'Max uses', 'Made by']], // v2.41
  'Invite log': [['Time', 'Code', 'Company', 'Name', 'Mobile', 'Email']], // v2.41
  Credits: [['Email', 'Company', 'Credits (m)', 'Unlimited (Yes / No / until date)', 'Used (m)', 'Balance (m)', 'Last export', 'Notes']], // v2.42.6
  'Credit log': [['Time', 'Email', 'Company', 'Project', 'Project key', 'Route (m)', 'Charged (m)', 'Export', 'Balance after (m)']], // v2.42.6
  Team: [['Company', 'Email', 'Name', 'Role', 'Regions', 'Updated']], // v2.43 (columns found by header: TEAM_COLS)
  TeamLinks: [['Company', 'Coordinator email', 'Member email', 'Status', 'Updated']], // v2.43
  Mailboxes: [['Company', 'Web app address', 'Key', 'Set up by', 'Google account', 'Checked', 'Status']], // v2.43
};
var CATEGORIES = ['Survey', 'PAT', 'Defect cleanup', 'FAT'];
var FIELDS = ['Task ID', 'Project', 'Category', 'Site', 'Contractor', 'Company', 'Globe representative', 'Status', 'Notes', 'Link',
  'Survey Start Date', 'Survey Completion Date', 'PAT Date', 'FAT Date', 'Region', 'Territory'];
/** The dates PoleCam writes back (v2.11), and the column each one goes to. */
var PROGRESS = { surveyStart: 'Survey Start Date', surveyDone: 'Survey Completion Date', pat: 'PAT Date', fat: 'FAT Date' };
/** Header names tried when a "Column: …" setting is blank (compared without case, spaces or punctuation). */
var GUESS = {
  'Task ID': ['task id', 'osp build id', 'build id', 'id', 'task no', 'task number', 'reference', 'ref no'],
  'Project': ['searchring name site name segment name', 'site name', 'segment name', 'searchring name', 'project name', 'project', 'cluster name', 'cluster', 'job name', 'job', 'facility name', 'nap id', 'nap'],
  'Category': ['category', 'category survey pat defect cleanup fat', 'task type', 'activity', 'stage', 'task'],
  'Site': ['pla id', 'site cluster', 'site id', 'site code', 'site', 'cluster code', 'location', 'area', 'barangay', 'municipality'],
  'Contractor': ['osp vendor', 'contractor', 'vendor', 'vendor name', 'contractor name', 'subcontractor', 'subcon'],
  'Company': ['for company blank everyone', 'for company', 'assigned company', 'assigned to', 'company', 'osp vendor', 'vendor', 'contractor'],
  'Globe representative': ['globe representative', 'globe rep', 'globe engineer', 'field engineer', 'engineer'],
  'Status': ['status active closed', 'status', 'task status', 'acceptance status', 'state'],
  'Notes': ['notes', 'remarks', 'remark', 'comments', 'comment'],
  'Link': ['gdrive link', 'google drive link', 'drive link', 'drive folder', 'folder link', 'folder', 'link'],
  'Survey Start Date': ['survey start date', 'survey start', 'survey date started'],
  'Survey Completion Date': ['survey completion date', 'survey completed date', 'survey complete date', 'survey end date', 'survey completed'],
  'PAT Date': ['pat date', 'pat completion date', 'pat done date'],
  'FAT Date': ['fat date', 'fat completion date', 'fat done date'],
  'Region': ['region', 'region name', 'geo region'],
  'Territory': ['territory', 'territory name', 'terr'],
};
var DATA_TABS = ['Project Data', 'Projects', 'Sites'];         // a tab with this name is used for the sites / tasks
var COMPANY_TABS = ['Company List', 'Companies'];             // the first that exists lists the companies
var DEFAULT_SETTINGS = [
  ['List name', null, 'Shown in the app'],
  ['Read key', null, 'Phones need this to read the sheet. It travels inside the signed company list.'],
  ['Admin key', null, 'Only for admins: CSV import of companies, map packs, the company list and reading all tasks. Do not share.'],
  ['Companies that see all tasks', '', 'Comma-separated, e.g. Globe Telecom. Their phones get every task (used when there are no company keys).'],
  ['Blank company = everyone', 'Yes', 'Yes: a task with no company is shown to every company. No: only to companies that see all.'],
  ['Companies tab', '', 'Tab with the company names (and an optional Authorization column: ADMIN sees all). Blank = Company List, else Companies.'],
  ['Tasks source', '', 'Blank = this spreadsheet. Or the URL of another spreadsheet (your tracker).'],
  ['Tasks source tab', '', 'Tab with the sites / tasks, e.g. Project Data. Blank (and no Tasks source) = the Tasks tab.'],
  ['Header row', '1', 'Row number of the column headers in that tab.'],
  ['Only rows where', '', 'Optional filter, e.g.  Region = MIN  (header = value). Blank = all rows.'],
  ['Default category', '', 'Category when there is no category column or the cell is blank. Blank = the user chooses Survey, PAT, Defect cleanup or FAT.'],
  ['Show also', '', 'Other columns shown with each site in the app, comma-separated, e.g. Region, Territory, Project Name. Blank = all other columns; a dash (-) = none.'],
  ['Closed statuses', 'Closed, Done, Completed, Cancelled, Canceled, Accepted', 'Rows whose status starts with one of these are not sent.'],
  ['Plan template', '', 'v2.32: Google Drive link of the prepared plan template (seed .dxf, shared: Anyone with the link). Blank = the link the admin phone shared with the company list. Phones download it through this sheet.'],
  ['Credits', 'No', 'v2.42.6: Yes = vendor users need credits (Credits tab) for KMZ and DXF exports of surveys: 1 credit = 1 m of route, charged once per project. The admin company never needs them.'],
  ['Free credits for a new user (m)', '0', 'v2.42.6: credits a new email gets when it first exports (it is added to the Credits tab by itself).'],
  ['Site required', '', 'v2.42.18: Yes = a new Survey or PAT must use a site of this sheet (users cannot type a name of their own); No = they may. Every phone follows it at its next refresh. Blank = the company list\'s setting.'],
  ['KMZ password', '', 'v2.28: the password that locks shared PAT / cleanup / FAT KMZ files (blank = the one saved in the company list). Every phone of the list gets it. Change it rarely: files locked with an older password still open while the company list keeps the old one.'],
  ['Mailbox script link', '', 'v2.43: the link to the master mailbox script that coordinators copy into their own Google account. The phones get it with their team (Your details → My role). Blank = none yet.'],
];
FIELDS.forEach(function (f) { DEFAULT_SETTINGS.push(['Column: ' + f, '', 'Header of this column in the source. Blank = guess. A dash (-) = not used.']); });

/** Run once from the Apps Script editor. Safe to run again: it only adds what is missing. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dataTab = DATA_TABS.filter(function (n) { return ss.getSheetByName(n); })[0], coTab = COMPANY_TABS.filter(function (n) { return ss.getSheetByName(n); })[0];
  Object.keys(TABS).forEach(function (name) {
    if (name === 'Tasks' && dataTab && !ss.getSheetByName('Tasks')) return;          // the sites come from your own tab
    if (name === 'Companies' && coTab && !ss.getSheetByName('Companies')) return;    // the companies too
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      var head = TABS[name];
      sh.getRange(1, 1, head.length, head[0].length).setValues(head).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  var st = ss.getSheetByName('Settings');
  var have = settings_();
  var add = [];
  DEFAULT_SETTINGS.forEach(function (d) {
    if (have[d[0]] !== undefined) return;
    var v = d[1];
    if (d[0] === 'List name') v = ss.getName();
    if (d[0] === 'Read key' || d[0] === 'Admin key') v = newKey_();
    if (d[0] === 'Tasks source tab' && dataTab) v = dataTab;
    if (d[0] === 'Companies tab' && coTab) v = coTab;
    add.push([d[0], v, d[2]]);
  });
  if (add.length) st.getRange(st.getLastRow() + 1, 1, add.length, 3).setNumberFormat('@').setValues(add);
  st.autoResizeColumns(1, 3);
  if (ss.getSheetByName('Companies')) ss.getSheetByName('Companies').getRange('A:A').setNumberFormat('@'); // plain text: names stay exactly as typed
  if (ss.getSheetByName('Tasks')) {
    var cat = SpreadsheetApp.newDataValidation().requireValueInList(CATEGORIES, true).setAllowInvalid(false).build();
    ss.getSheetByName('Tasks').getRange('C2:C').setDataValidation(cat);
    var status = SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Closed'], true).build();
    ss.getSheetByName('Tasks').getRange('H2:H').setDataValidation(status);
  }
  var yn = SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).build();
  ss.getSheetByName('CompanyKeys').getRange('C2:C').setDataValidation(yn);
  if (ss.getSheetByName('Credits')) ss.getSheetByName('Credits').getRange('A:B').setNumberFormat('@'); // v2.42.6: emails and names as typed
  ensureTaskIds_();
  try { addProgressColumns(); } catch (err) { console.log('Progress columns not added: ' + (err && err.message || err)); }
  try { teamSetup_(); } catch (err) { console.log('Team tabs: ' + (err && err.message || err)); } // v2.43: the Role and Status drop-downs
}

function newKey_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }
/** A company key people can read out and type: 12 characters without 0/O/1/I/L, e.g. 7KQ4-MX2P-9TRW. */
function companyKeyNew_() {
  var A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ', hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), out = '';
  for (var i = 0; i < 12; i++) out += A.charAt(parseInt(hex.substr(i * 2, 2), 16) % A.length);
  return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8, 12);
}
/** Keys compare without case, spaces or dashes. */
function normKey_(k) { return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function settings_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) { if (r[0]) out[String(r[0]).trim()] = String(r[1]).trim(); });
  return out;
}

function rows_(name, cols) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols).getValues();
}

/** The companies and which of them are ADMIN (see all rows). Reads "Companies tab" (e.g. Company List: Company name | Authorization). */
function companies_(s) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), name = s['Companies tab'] || COMPANY_TABS.filter(function (n) { return ss.getSheetByName(n); })[0];
  var sh = name && ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 1) return { names: [], admins: [], adminNames: [], tab: name || '', nameCol: 0, authCol: -1 };
  var v = sh.getDataRange().getDisplayValues(), head = v[0].map(normHead_);
  var find = function (list) { for (var i = 0; i < list.length; i++) { var k = head.indexOf(list[i]); if (k >= 0) return k; } return -1; };
  var nc = find(['company name', 'company', 'vendor', 'vendor name', 'name']), ac = find(['authorization', 'authorisation', 'role', 'access', 'user type', 'type']);
  var start = nc >= 0 ? 1 : 0; if (nc < 0) nc = 0;
  var names = [], admins = [], adminNames = [];
  for (var i = start; i < v.length; i++) {
    var n = String(v[i][nc] || '').trim(); if (!n) continue;
    names.push(n); if (ac >= 0 && /admin/i.test(v[i][ac])) { admins.push(normCo_(n)); adminNames.push(n); }
  }
  return { names: names, admins: admins, adminNames: adminNames, tab: name, nameCol: nc, authCol: ac };
}
/** One cell may name several vendors: "NOKIA , HUAXIN", "A / B", "A & B". */
function companyList_(cell) { return String(cell || '').split(/\s*(?:[,;\/&+\n]|\band\b)\s*/i).map(normCo_).filter(String); }

/** Company names compared without case, punctuation or Inc./Corp./Co./Ltd./OPC endings. */
function normCo_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|opc|llc)\b/g, ' ').replace(/\s+/g, '');
}
function normHead_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function yes_(v) { return /^(y|yes|true|1)$/i.test(String(v || '').trim()); }

/** Every task row with a project name gets a stable Task ID (phones use it to know which tasks they started). */
function ensureTaskIds_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tasks');
  if (!sh || sh.getLastRow() < 2) return;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  v.forEach(function (r, i) { // only the empty ID cells are written, one by one, so a sort or edit meanwhile is not undone
    if (!String(r[0]).trim() && String(r[1]).trim()) sh.getRange(i + 2, 1).setValue('T-' + newKey_().slice(0, 8).toUpperCase());
  });
}

/** Fills in a Task ID as soon as a project name is typed. */
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === 'Tasks') ensureTaskIds_();
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function category_(v, dflt) {
  var t = String(v || '').toLowerCase();
  if (/clean|rectif/.test(t)) return 'Defect cleanup';
  if (/\bfat\b|final/.test(t)) return 'FAT';
  if (/\bpat\b|provisional/.test(t)) return 'PAT';
  if (/survey|as.?plan|as.?built|design/.test(t)) return 'Survey';
  return CATEGORIES.indexOf(dflt) >= 0 ? dflt : ''; // blank: the user chooses the category in the app
}

/** Tasks from the Tasks tab, or from your tracker when "Tasks source" is set. Cached for 5 minutes. */
function allTasks_(s) {
  var src = String(s['Tasks source'] || '').trim() || String(s['Tasks source tab'] || '').trim();
  var cacheKey = 'tasks:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
    JSON.stringify([s['Tasks source'], s['Tasks source tab'], s['Header row'], s['Only rows where'], s['Default category'], s['Closed statuses'], s['Show also']].concat(FIELDS.map(function (f) { return s['Column: ' + f]; })))));
  cacheKey += ':' + (PropertiesService.getScriptProperties().getProperty('tasks.v') || '0'); // a progress write makes the phones read the tab again
  var cache = CacheService.getScriptCache(), hit = src ? cache.get(cacheKey) : null;
  if (hit) return JSON.parse(hit);
  var tasks = src ? sourceTasks_(s).tasks : tabTasks_();
  if (src) { var j = JSON.stringify(tasks); if (j.length < 95000) cache.put(cacheKey, j, 120); }
  return tasks;
}

function tabTasks_() {
  var lock = LockService.getScriptLock();
  if (lock.tryLock(5000)) { try { ensureTaskIds_(); } finally { lock.releaseLock(); } }
  return rows_('Tasks', 9).filter(function (r) { return String(r[1]).trim(); }).map(function (r) {
    return { id: String(r[0]).trim(), project: String(r[1]).trim(), category: String(r[2]).trim() || 'Survey', site: String(r[3]).trim(),
      contractor: String(r[4]).trim(), globeRep: String(r[5]).trim(), company: String(r[6]).trim(), status: String(r[7]).trim() || 'Active', notes: String(r[8]).trim() };
  }).filter(function (t) { return !/^(closed|done|cancel)/i.test(t.status); });
}

/** Reads your tracker and maps its columns. Returns {tasks, columns, rows, skipped}. */
function sourceTasks_(s) {
  var t = sourceSheet_(s), values = t.values, hr = t.hr, head = t.head, rawHead = t.rawHead, col = t.col;
  if (col['Project'] < 0) throw new Error('No project column: set "Column: Project" to the header of the column with the project / site name');
  var used = FIELDS.map(function (f) { return col[f]; }), also = String(s['Show also'] || '').trim(), extraCols;
  if (also === '-') extraCols = [];
  else if (also) extraCols = also.split(',').map(function (h) { var i = head.indexOf(normHead_(h)); if (i < 0) throw new Error('Column "' + h.trim() + '" (Show also) not found'); return i; });
  else extraCols = rawHead.map(function (h, i) { return i; }).filter(function (i) { return rawHead[i] && used.indexOf(i) < 0; });
  extraCols = extraCols.slice(0, 8);
  var only = /^\s*(.+?)\s*=\s*(.*?)\s*$/.exec(s['Only rows where'] || ''), onlyCol = only ? head.indexOf(normHead_(only[1])) : -1;
  if (only && onlyCol < 0) throw new Error('Column "' + only[1] + '" (Only rows where) not found');
  var closed = String(s['Closed statuses'] || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(String);
  var get = function (r, f) { return col[f] >= 0 ? String(r[col[f]] || '').trim() : ''; };
  // v2.41: the columns between Territory and OSP VENDOR (the vendor column), in their order: the site's details
  var tc = col['Territory'], vc = col['Contractor'], betweenCols = [];
  if (tc >= 0 && vc >= 0) for (var b = Math.min(tc, vc) + 1; b < Math.max(tc, vc); b++) if (rawHead[b]) betweenCols.push(b);
  betweenCols = betweenCols.slice(0, 12);
  var tasks = [], skipped = 0;
  for (var i = hr + 1; i < values.length; i++) {
    var r = values[i], project = get(r, 'Project');
    if (!project) continue;
    if (only && String(r[onlyCol] || '').trim().toLowerCase() !== only[2].toLowerCase()) { skipped++; continue; }
    var status = get(r, 'Status');
    if (status && closed.some(function (c) { return status.toLowerCase().indexOf(c) === 0; })) { skipped++; continue; }
    var category = category_(get(r, 'Category'), s['Default category']), site = get(r, 'Site'), link = get(r, 'Link');
    var contractor = get(r, 'Contractor');
    tasks.push({ id: taskIdOf_(t, r, s), project: project.slice(0, 100), category: category, site: site.slice(0, 100), contractor: contractor.slice(0, 100),
      globeRep: get(r, 'Globe representative').slice(0, 100), company: (get(r, 'Company') || contractor).slice(0, 200), status: (status || 'Active').slice(0, 40), notes: get(r, 'Notes').slice(0, 300),
      link: /^https:\/\//.test(link) ? link.slice(0, 300) : '',
      dates: { surveyStart: get(r, 'Survey Start Date').slice(0, 20), surveyDone: get(r, 'Survey Completion Date').slice(0, 20), pat: get(r, 'PAT Date').slice(0, 20), fat: get(r, 'FAT Date').slice(0, 20) },
      region: get(r, 'Region').slice(0, 60), territory: get(r, 'Territory').slice(0, 60),
      extra: extraCols.map(function (i) { return [rawHead[i].slice(0, 40), String(r[i] || '').trim().slice(0, 100)]; }).filter(function (x) { return x[1]; }),
      cols: betweenCols.map(function (c) { return [rawHead[c].slice(0, 40), String(r[c] || '').trim().slice(0, 100)]; }) });
    if (tasks.length >= 2000) break;
  }
  return { tasks: tasks, columns: col, rows: values.length - hr - 1, skipped: skipped };
}
/** The task ID of a row: its Task ID cell, or a stable code made from the project, site and category. */
function taskIdOf_(t, r, s) {
  var get = function (f) { return t.col[f] >= 0 ? String(r[t.col[f]] || '').trim() : ''; };
  var tid = get('Task ID') || ('D-' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, [get('Project'), get('Site'), category_(get('Category'), s['Default category'])].join('|'))).slice(0, 10));
  return tid.slice(0, 40);
}
/** The sites / tasks tab and where each field is: {sh, values, hr, head, rawHead, col}. */
function sourceSheet_(s) {
  var src = String(s['Tasks source'] || '').trim();
  var id = (/\/d\/([A-Za-z0-9_-]{20,})/.exec(src) || [])[1] || src;
  var ss = src ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = s['Tasks source tab'] ? ss.getSheetByName(s['Tasks source tab']) : ss.getSheets()[0];
  if (!sh) throw new Error('Tab "' + s['Tasks source tab'] + '" not found in the source spreadsheet');
  var values = sh.getDataRange().getDisplayValues(), hr = Math.max(1, parseInt(s['Header row'], 10) || 1) - 1;
  var head = (values[hr] || []).map(normHead_), rawHead = (values[hr] || []).map(function (h) { return String(h).trim(); });
  var col = {};
  FIELDS.forEach(function (f) {
    var want = String(s['Column: ' + f] || '').trim();
    if (want === '-') { col[f] = -1; return; }
    if (want) { col[f] = head.indexOf(normHead_(want)); if (col[f] < 0) throw new Error('Column "' + want + '" (for ' + f + ') not found in row ' + (hr + 1)); return; }
    col[f] = -1;
    (GUESS[f] || []).some(function (g) { var i = head.indexOf(g); if (i >= 0 && !Object.keys(col).some(function (k) { return col[k] === i && k !== 'Company'; })) { col[f] = i; return true; } return false; });
  });
  return { sh: sh, values: values, hr: hr, head: head, rawHead: rawHead, col: col };
}

/** CompanyKeys rows with a key: {normalized company: {key, all}}. */
function companyKeys_() {
  var out = {};
  rows_('CompanyKeys', 3).forEach(function (r) { var c = normCo_(r[0]), k = String(r[1]).trim(); if (c && k) out[c] = { key: k, all: yes_(r[2]), name: String(r[0]).trim() }; });
  return out;
}
/** The company whose key this is, or null. */
function keyOwner_(keys, ckey) {
  var k = normKey_(ckey); if (k.length < 8) return null;
  for (var c in keys) if (normKey_(keys[c].key) === k) return { company: c, all: keys[c].all, name: keys[c].name };
  return null;
}

/** Which tasks this request may see: 'all', a normalized company, or an error. */
function access_(p, s) {
  var akey = String(p.akey || ''), keys = companyKeys_();
  if (s['Admin key'] && akey && akey === s['Admin key']) return { all: true, strict: Object.keys(keys).length > 0 };
  var owner = keyOwner_(keys, p.ckey);
  if (owner) return { all: owner.all, company: owner.company, you: owner.name, strict: true }; // the key says who this is
  var legacy = p.company === undefined, company = normCo_(p.company);
  if (!legacy && !company) return { none: true }; // a phone before its user chose a company: the company list, no tasks
  if (Object.keys(keys).length) return { error: 'company key' }; // strict: each company reads with its own key
  if (legacy) return { all: true, legacy: true }; // PoleCam v2.5 or older sends no company
  var seeAll = String(s['Companies that see all tasks'] || '').split(',').map(normCo_).filter(String).concat(companies_(s).admins);
  return { all: seeAll.indexOf(company) >= 0, company: company };
}

function doGet(e) {
  var s = settings_(), p = (e && e.parameter) || {};
  if (p.probe) return json_({ ok: true, strict: Object.keys(companyKeys_()).length > 0 }); // only says whether users sign in with company keys
  if (p.inv) return inviteInfo_(p.inv); // v2.42.6: a short invite link: its companies and the company list (the code is the key)
  if (p.mvc) return moveTake_(p.mvc); // v2.42.6: a short move link: the user's details (once) and the company list
  var readOk = !!s['Read key'] && String(p.key || '') === s['Read key'];
  if (!readOk && !keyOwner_(companyKeys_(), p.ckey)) return json_({ ok: false, error: p.ckey ? 'company key' : 'key' }); // a company key alone is enough (v2.10)
  if (p.dxfseed) return dxfSeed_(s); // v2.32: the plan template, for the phones of the list
  var acc = access_(p, s);
  if (acc.error) return json_({ ok: false, error: acc.error });
  if (p.credits) return isAdmin_(p, s) ? creditList_(s) : json_({ ok: false, error: 'key' }); // v2.42.7: the Credits tab, for the admin phone
  var co = companies_(s), companies = co.names;
  var tasks;
  try { tasks = allTasks_(s); } catch (err) { return json_({ ok: false, error: 'tasks source: ' + String(err && err.message || err).slice(0, 200) }); }
  var total = tasks.length, blankAll = s['Blank company = everyone'] === undefined || yes_(s['Blank company = everyone']);
  if (acc.none) tasks = [];
  else if (!acc.all) tasks = tasks.filter(function (t) { var cs = companyList_(t.company); return cs.length ? cs.indexOf(acc.company) >= 0 : blankAll; });
  var wantR = codes_(p.region, regionCode_), wantT = codes_(p.terr, terrCode_); // v2.25: the user's regions and territories
  if (p.area === '1' && (!wantR.length || !wantT.length)) tasks = []; // v2.27: a user with no region or no territory ticked gets no site
  else if (wantR.length || wantT.length) tasks = tasks.filter(function (t) { return areaOk_(t.region, wantR, regionCode_) && areaOk_(t.territory, wantT, terrCode_); });
  var packs = rows_('MapPacks', 4).filter(function (r) { return String(r[1]).trim(); }).map(function (r) {
    return { name: String(r[0]).trim(), link: String(r[1]).trim(), sizeMB: Number(r[2]) || 0, notes: String(r[3]).trim() };
  });
  var strict = Object.keys(companyKeys_()).length > 0;
  if (strict && !acc.all) companies = acc.you ? [matchName_(companies, acc.you)] : []; // with company keys, users do not see the other companies
  var out = { ok: true, name: s['List name'] || '', updated: new Date().toISOString(), companies: companies, admins: co.adminNames, tasks: tasks, packs: packs,
    scope: acc.none ? 'none' : acc.all ? 'all' : 'company', total: acc.all ? total : tasks.length, strict: strict };
  if (acc.you) out.you = matchName_(co.names, acc.you); // the company this key belongs to, as written in the companies tab
  var list = list_(); if (list) { out.list = list; out.listRev = Number(PropertiesService.getScriptProperties().getProperty('list.rev') || 0); }
  // v2.42.5: the encrypted admin key of this list version: to the admin phone and the admin company's company key only
  var keTxt = PropertiesService.getScriptProperties().getProperty('list.ke'), keRev = Number(PropertiesService.getScriptProperties().getProperty('list.kerev') || -1);
  var own = keyOwner_(companyKeys_(), p.ckey); // v2.42.6: also a company of the Companies tab marked ADMIN
  if (keTxt && list && keRev === out.listRev && (isAdmin_(p, s) || (own && (own.all || seeAll_().indexOf(own.company) >= 0)))) { try { out.ke = JSON.parse(keTxt); } catch (e) { /* none */ } }
  var kp = String(s['KMZ password'] || '').trim(); if (kp) out.kmzPass = kp; // v2.28: the shared KMZ lock, for the phones of the list
  var sid = seedId_(s); if (sid) out.dxfSeed = sid; // v2.32: which plan template there is (the phones fetch it with dxfseed=1)
  var lg = logoFor_(acc.company || acc.you || p.company); // v2.34: the company's logo, only when the phone's copy is older
  if (lg) { out.logoAt = lg.at; if (String(p.logoat || '') !== lg.at) out.logo = lg; }
  if (isAdmin_(p, s)) out.adminUsers = adminUsers_(); // v2.28: the admin users and their jobs, to the admin phone (Admin key) only
  if (p.aem && p.atok) { try { out.adminMe = adminMe_(p.aem, p.atok); } catch (e) { /* the read goes on without it */ } } // v2.42.18: a verified admin user: its own row only
  var sr = String(s['Site required'] || '').trim(); if (sr) out.siteRequired = yes_(sr); // v2.42.18: a new Survey / PAT must use a site of this sheet
  if (p.email) { try { out.credit = creditInfo_(p, s); } catch (e) { /* the read goes on without it */ } } // v2.42.6
  if (!acc.none) { try { var cl = cseLeads_(s); if (cl) out.cseLeads = cl; } catch (e) { /* the read goes on without it */ } } // v2.42.12: the CSE Lead of each territory
  return json_(out);
}

/** v2.42.12: the CSE LEAD tab (Territory, Full Name): the CSE Lead of each territory, for the plan's title blocks. Looked for in the
    spreadsheet of the sites (Tasks source), then in this one. [{t, n}], or null when neither has the tab (with those two headers). */
function cseLeads_(s, fresh) {
  var want = normHead_(s['CSE LEAD tab'] || 'CSE LEAD'), src = String(s['Tasks source'] || '').trim(), cache = CacheService.getScriptCache();
  var ck = 'cse:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, src + '|' + want)), hit = fresh ? null : cache.get(ck);
  if (hit) return JSON.parse(hit);
  var books = [];
  if (src) { var id = (/\/d\/([A-Za-z0-9_-]{20,})/.exec(src) || [])[1] || src; try { books.push(SpreadsheetApp.openById(id)); } catch (e) { /* not open to this account */ } }
  books.push(SpreadsheetApp.getActiveSpreadsheet());
  var out = null;
  for (var b = 0; b < books.length && !out; b++) {
    var sh = books[b].getSheets().filter(function (x) { return normHead_(x.getName()) === want; })[0]; if (!sh) continue;
    var v = sh.getDataRange().getDisplayValues(), hr = -1, tc = -1, nc = -1;
    for (var i = 0; i < Math.min(5, v.length) && hr < 0; i++) {
      var h = v[i].map(normHead_); tc = h.indexOf('territory'); nc = h.indexOf('full name'); if (nc < 0) nc = h.indexOf('name'); if (nc < 0) nc = h.indexOf('cse lead');
      if (tc >= 0 && nc >= 0) hr = i;
    }
    if (hr < 0) continue;
    out = [];
    for (var r = hr + 1; r < v.length && out.length < 200; r++) { var t = String(v[r][tc] || '').trim(), n = String(v[r][nc] || '').trim(); if (t && n) out.push({ t: t.slice(0, 60), n: n.slice(0, 80) }); }
  }
  cache.put(ck, JSON.stringify(out), 120); // (2 minutes: a change in the tab reaches the phones at their next sync after that)
  return out;
}
/** v2.42.12: Run from the editor: the CSE LEAD rows the phones get, in the execution log. */
function testCseLeads() {
  var l = cseLeads_(settings_(), true);
  console.log(l ? l.length + ' CSE Lead row(s): ' + l.map(function (x) { return x.t + ' = ' + x.n; }).join('; ') : 'No tab named "CSE LEAD" (with the headers Territory and Full Name) in the spreadsheet of the sites or in this one');
}

/* ---- v2.42.18: adding an admin user without the admin phone: a code emailed to an address of the Admin users tab ---- */
var CODE_S = 600, CODE_TRIES = 5, CODE_SENDS = 3;
function readOk_(p, s) { return (!!s['Read key'] && String(p.key || '') === s['Read key']) || !!keyOwner_(companyKeys_(), p.ckey); }
function hash_(t) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8)); }
/** The Admin users row of an email ({ e, n, i, m, j }), or null. */
function adminRowOf_(email) {
  var e = String(email || '').trim().toLowerCase(); if (!e) return null;
  var L = adminUsers_(); for (var i = 0; i < L.length; i++) if (L[i].e === e) return L[i];
  return null;
}
function adminSecret_() {
  var pr = PropertiesService.getScriptProperties(), k = pr.getProperty('admin.secret');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); pr.setProperty('admin.secret', k); }
  return k;
}
/** The token of a verified email: the same until resetAdminTokens. */
function adminToken_(email) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('admin-user|' + String(email || '').trim().toLowerCase(), adminSecret_())).replace(/=+$/, ''); }
/** A phone asks for a code for its user's email: sent only when the email is on the Admin users tab. */
function adminCode_(body, s) {
  if (!readOk_(body, s)) return json_({ ok: false, error: 'key' });
  var e = String(body.email || '').trim().toLowerCase();
  if (e.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return json_({ ok: false, error: 'email' });
  if (!adminRowOf_(e)) return json_({ ok: true, sent: false });
  var cache = CacheService.getScriptCache(), nk = 'acn:' + hash_(e), n = Number(cache.get(nk) || 0);
  if (n >= CODE_SENDS) return json_({ ok: false, error: 'wait' });
  var code = ('00000' + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000)).slice(-6);
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return json_({ ok: false, error: 'mail' });
    MailApp.sendEmail({ to: e, subject: 'G-eSAA code ' + code, name: s['List name'] || 'G-eSAA',
      body: 'Your G-eSAA code is ' + code + '\n\nType it in G-eSAA (Your details) to be an admin user of ' + (s['List name'] || 'this company list') + '. It works for 10 minutes.\n\nIf you did not ask for this code, ignore this email.' });
  } catch (err) { console.log('adminCode mail: ' + (err && err.message || err)); return json_({ ok: false, error: 'mail' }); }
  cache.put('acc:' + hash_(e), JSON.stringify({ h: hash_(code + '|' + e), t: 0, x: Date.now() + CODE_S * 1000 }), CODE_S);
  cache.put(nk, String(n + 1), CODE_S);
  return json_({ ok: true, sent: true });
}
/** The code typed on the phone: that user's row and a token (the phone sends it at each read, see adminMe_). */
function adminVerify_(body, s) {
  if (!readOk_(body, s)) return json_({ ok: false, error: 'key' });
  var e = String(body.email || '').trim().toLowerCase(), code = String(body.code || '').replace(/\D/g, '');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache(), ck = 'acc:' + hash_(e), raw = cache.get(ck), c = raw ? JSON.parse(raw) : null;
    if (!c || Date.now() > c.x) return json_({ ok: false, error: 'expired' });
    if (code.length !== 6 || hash_(code + '|' + e) !== c.h) {
      c.t = (c.t || 0) + 1;
      if (c.t >= CODE_TRIES) { cache.remove(ck); return json_({ ok: false, error: 'code', left: 0 }); }
      cache.put(ck, JSON.stringify(c), Math.max(1, Math.round((c.x - Date.now()) / 1000)));
      return json_({ ok: false, error: 'code', left: CODE_TRIES - c.t });
    }
    cache.remove(ck);
    var row = adminRowOf_(e); if (!row) return json_({ ok: false, error: 'expired' }); // its row deleted meanwhile
    return json_({ ok: true, token: adminToken_(e), user: row });
  } finally { lock.releaseLock(); }
}
/** At each read of a verified phone: its row (the jobs may have changed), { gone: true } when the row was deleted, { bad: true } for a
    token that is not this sheet's (or after resetAdminTokens). Never the other rows. */
function adminMe_(email, tok) {
  var e = String(email || '').trim().toLowerCase();
  if (!e || String(tok || '') !== adminToken_(e)) return { bad: true };
  return adminRowOf_(e) || { gone: true };
}
/** Run from the editor: sends a test email to you (allows "Send email as you" the first time). */
function testAdminMail() {
  var me = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(me, 'G-eSAA test email', 'Email works: admin users will get their codes from this address. Emails left today: ' + MailApp.getRemainingDailyQuota());
  console.log('Sent to ' + me + '. Emails left today: ' + MailApp.getRemainingDailyQuota());
}
/** Run from the editor: every phone verified by email must verify again (a new code) at its next read. */
function resetAdminTokens() { PropertiesService.getScriptProperties().deleteProperty('admin.secret'); console.log('Done: verified phones will be asked for a new code.'); }

/** v2.28: the Admin users tab: email, name, company ID no., mobile and job of each admin / inspector. */
function adminUsers_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Admin users');
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().map(function (r) {
    return { e: String(r[0]).trim().toLowerCase(), n: String(r[1]).trim(), i: String(r[2]).trim(), m: String(r[3]).trim(), j: String(r[4]).trim() };
  }).filter(function (u) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(u.e); }).slice(0, 100);
}
function isAdmin_(p, s) { return !!s['Admin key'] && String(p.akey || '') === String(s['Admin key']); }

/** v2.25: a Region cell as NLZ, SLZ, NCR, VIS or MIN (the long names too); anything else as written (it matches no choice). */
function regionCode_(v) {
  var c = String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  if (!c) return '';
  if (/^(NLZ|NL|NLUZ|NORTHLUZON|NORTHERNLUZON)$/.test(c)) return 'NLZ';
  if (/^(SLZ|SL|SLUZ|SOUTHLUZON|SOUTHERNLUZON)$/.test(c)) return 'SLZ';
  if (/^(NCR|METROMANILA|NATIONALCAPITALREGION)$/.test(c)) return 'NCR';
  if (/^(VIS|VISAYAS)$/.test(c)) return 'VIS';
  if (/^(MIN|MINDANAO)$/.test(c)) return 'MIN';
  return c;
}
/** v2.25: a Territory cell as T1 … T8 ("T1", "Territory 1", "1", "MIN T1"); anything else as written. */
function terrCode_(v) {
  var c = String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  if (!c) return '';
  var m = /^(?:NLZ|SLZ|NCR|VIS|MIN)?(?:T|TER|TERR|TERRITORY)?0*([1-8])$/.exec(c);
  return m ? 'T' + m[1] : c;
}
/** The codes in a cell or a request ("MIN, VIS"). */
function codes_(v, f) { return String(v || '').split(/\s*[,;\/&+\n]\s*/).map(f).filter(String); }
/** A row passes when its cell is blank, nothing was chosen, or one of its codes was chosen. */
function areaOk_(cell, want, f) { if (!want.length) return true; var have = codes_(cell, f); return !have.length || have.some(function (x) { return want.indexOf(x) >= 0; }); }

/** The spelling of a company in a list of names (same company without case, punctuation or Inc./Corp.). */
function matchName_(names, name) { var c = normCo_(name); for (var i = 0; i < names.length; i++) if (normCo_(names[i]) === c) return names[i]; return name; }

/** Admin phones only (Admin key): add company names, or replace the map pack list. */
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad request' }); }
  var s = settings_();
  if (body.action === 'progress') return progress_(body, s); // company key (own sites) or Admin key
  if (body.action === 'setLogo') return setLogo_(body, s); // v2.34: company key (its own company) or Admin key
  if (body.action === 'redeemInvite') return redeemInvite_(body); // v2.41: an invite's code and the company chosen: that company's key
  if (body.action === 'credit') return credit_(body, s); // v2.42.6: a vendor's KMZ / DXF export (company key or Read key)
  if (body.action === 'makeMove') return makeMove_(body, s); // v2.42.6: Move to another phone (Read key, company key or Admin key)
  if (body.action === 'adminCode') return adminCode_(body, s); // v2.42.18: an admin user's email: a 6-digit code by email (Read key or company key)
  if (body.action === 'adminVerify') return adminVerify_(body, s); // v2.42.18: the code: that user's row and a token
  if (TEAM_ACTIONS.test(String(body.action))) return team_(body, s); // v2.43: teams and the contractor mailbox (company key; a change also a confirmed email)
  if (body.action === 'makeInvite' && body.ckey && !(s['Admin key'] && body.key === s['Admin key'])) return makeInviteKey_(body, s); // v2.42.6: a coworker invite
  if (!s['Admin key'] || body.key !== s['Admin key']) return json_({ ok: false, error: 'key' });
  if (body.action === 'makeInvite') return makeInvite_(body, s); // v2.41: Admin key
  if (body.action === 'setPacks' && Array.isArray(body.packs)) return setPacks_(body.packs);
  if (body.action === 'setList') return setList_(body);
  if (body.action === 'setCredit') return setCredit_(body, s); // v2.42.7: the admin phone gives credits or unlimited
  if (body.action !== 'addCompanies' || !Array.isArray(body.companies)) return json_({ ok: false, error: 'action' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var co = companies_(s), sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(co.tab || 'Companies');
    if (!sh) return json_({ ok: false, error: 'no companies tab' });
    var have = {};
    co.names.forEach(function (n) { have[n.toLowerCase()] = true; });
    var add = [];
    body.companies.slice(0, 500).forEach(function (c) {
      var v = String(c || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      if (v && !have[v.toLowerCase()]) { have[v.toLowerCase()] = true; add.push(v); }
    });
    var first = sh.getLastRow() + 1;
    add.forEach(function (v, i) { // the name in its column, USER in an Authorization column when there is one
      sh.getRange(first + i, co.nameCol + 1).setNumberFormat('@').setValue(v);
      if (co.authCol >= 0) sh.getRange(first + i, co.authCol + 1).setValue('USER');
    });
    return json_({ ok: true, added: add.length });
  } finally { lock.releaseLock(); }
}

/** Admin phones only: the MapPacks tab becomes the list of map packs typed in the app (name, Drive link, size). */
function setPacks_(packs) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MapPacks');
    var rows = packs.slice(0, 50).map(function (p) {
      var link = String(p.link || '').trim().slice(0, 300);
      return [String(p.name || '').trim().slice(0, 100), /^https:\/\/drive\.google\.com\//.test(link) ? link : '', Number(p.sizeMB) || '', ''];
    }).filter(function (r) { return r[1]; });
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, 4).setNumberFormat('@').setValues(rows); // plain text: no formulas
    return json_({ ok: true, packs: rows.length });
  } finally { lock.releaseLock(); }
}

/** Task progress from the phones (v2.11): [{id, field: surveyStart|surveyDone|pat|fat, date: YYYY-MM-DD or ''}].
    A company key may write only its own sites (rows naming its company); the Admin key may write any row. */
function progress_(body, s) {
  var admin = !!s['Admin key'] && body.key === s['Admin key'], owner = keyOwner_(companyKeys_(), body.ckey);
  if (!admin && !owner) return json_({ ok: false, error: 'company key' });
  var ups = (Array.isArray(body.updates) ? body.updates : []).slice(0, 100);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t;
    try { t = sourceSheet_(s); } catch (err) { return json_({ ok: false, error: 'sites tab: ' + String(err && err.message || err).slice(0, 200) }); }
    var rows = {};
    for (var i = t.hr + 1; i < t.values.length; i++) if (t.col['Project'] >= 0 && String(t.values[i][t.col['Project']] || '').trim()) rows[taskIdOf_(t, t.values[i], s)] = i;
    var results = ups.map(function (u) {
      var id = String(u && u.id || ''), name = PROGRESS[u && u.field], c = name ? t.col[name] : -1, i = rows[id];
      if (!name) return { id: id, field: u && u.field, ok: false, error: 'field' };
      if (c == null || c < 0) return { id: id, field: u.field, ok: false, error: 'no "' + name + '" column (run setup)' };
      if (i == null) return { id: id, field: u.field, ok: false, error: 'site not found' };
      if (!admin && !owner.all) {
        var cell = t.col['Company'] >= 0 ? t.values[i][t.col['Company']] : t.col['Contractor'] >= 0 ? t.values[i][t.col['Contractor']] : '';
        if (companyList_(cell).indexOf(owner.company) < 0) return { id: id, field: u.field, ok: false, error: 'not your site' };
      }
      var d = String(u.date || ''), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
      t.sh.getRange(i + 1, c + 1).setValue(m ? new Date(+m[1], +m[2] - 1, +m[3]) : '');
      var f = statusFormula_(t, i + 1); if (f) t.sh.getRange(i + 1, t.col['Status'] + 1).setFormula(f);
      return { id: id, field: u.field, ok: true };
    });
    PropertiesService.getScriptProperties().setProperty('tasks.v', String(Date.now()));
    return json_({ ok: true, results: results });
  } finally { lock.releaseLock(); }
}
function colA1_(c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
/** Status of a row: FAT Done, PAT Done, LLD Creation (survey completed), Ongoing Survey (started), For Survey. */
function statusFormula_(t, row) {
  if (t.col['Status'] == null || t.col['Status'] < 0) return '';
  var at = function (f) { return t.col[f] >= 0 ? colA1_(t.col[f]) + row : ''; };
  var fat = at('FAT Date'), pat = at('PAT Date'), done = at('Survey Completion Date'), start = at('Survey Start Date');
  var f = start ? 'IF(AND(' + start + '<>"",' + start + '<=TODAY()),"Ongoing Survey","For Survey")' : '"For Survey"';
  if (done) f = 'IF(' + done + '<>"","LLD Creation",' + f + ')';
  if (pat) f = 'IF(' + pat + '<>"","PAT Done",' + f + ')';
  if (fat) f = 'IF(' + fat + '<>"","FAT Done",' + f + ')';
  return '=' + f;
}
/** Run from the editor (setup does it too): adds the progress columns that are missing to the sites tab and puts the
    Status formula in each row whose Status cell is empty. Nothing else in the tab is changed. */
function addProgressColumns() {
  var s = settings_();
  if (!s['Tasks source tab'] && !s['Tasks source']) { console.log('No sites tab set (Settings → Tasks source tab): nothing to do.'); return; }
  var t = sourceSheet_(s), added = [];
  ['Survey Start Date', 'Survey Completion Date', 'PAT Date', 'FAT Date', 'Status'].forEach(function (name) {
    if (t.col[name] >= 0 || String(s['Column: ' + name] || '').trim() === '-') return; // there, or left out on purpose
    var c = t.rawHead.length + added.length;
    t.sh.getRange(t.hr + 1, c + 1).setValue(name); added.push(name);
  });
  if (added.length) t = sourceSheet_(s);
  var filled = 0;
  if (t.col['Status'] >= 0 && t.col['Project'] >= 0) {
    for (var i = t.hr + 1; i < t.values.length; i++) {
      if (!String(t.values[i][t.col['Project']] || '').trim() || String(t.values[i][t.col['Status']] || '').trim()) continue;
      t.sh.getRange(i + 1, t.col['Status'] + 1).setFormula(statusFormula_(t, i + 1)); filled++;
    }
  }
  PropertiesService.getScriptProperties().setProperty('tasks.v', String(Date.now()));
  console.log((added.length ? 'Columns added: ' + added.join(', ') + '. ' : 'All progress columns were there. ') + 'Status formula put in ' + filled + ' rows.');
}

/** Admin phones only: the latest signed company list (the same text as the join link / QR code). Phones that read the
    sheet take a newer version of their own list by themselves; the app checks it was signed with the admin PIN. */
function setList_(body) {
  var list = String(body.list || ''), id = String(body.id || '').slice(0, 40), rev = Number(body.rev) || 0;
  if (!/^PCT[01]:[A-Za-z0-9_-]+$/.test(list) || list.length > 120000) return json_({ ok: false, error: 'bad list' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties(), old = Number(props.getProperty('list.n') || 0);
    if (id && id === props.getProperty('list.id') && rev < Number(props.getProperty('list.rev') || 0)) return json_({ ok: false, error: 'older version' });
    if (id && id === props.getProperty('list.id') && rev === Number(props.getProperty('list.rev') || 0) && list !== list_()) return json_({ ok: false, error: 'same version' }); // v2.42.4: another admin phone saved this version already
    var n = Math.ceil(list.length / 8000), all = { 'list.n': String(n), 'list.id': id, 'list.rev': String(rev), 'list.at': new Date().toISOString() };
    for (var i = 0; i < n; i++) all['list.' + i] = list.slice(i * 8000, (i + 1) * 8000); // a property holds at most 9 KB
    var ke = body.ke && typeof body.ke === 'object' ? JSON.stringify({ salt: String(body.ke.salt || ''), iv: String(body.ke.iv || ''), data: String(body.ke.data || '') }) : ''; // v2.42.5
    if (ke && ke.length <= 3000 && /^[A-Za-z0-9_-]{8,}$/.test(body.ke.data || '')) { all['list.ke'] = ke; all['list.kerev'] = String(rev); } else props.deleteProperty('list.ke');
    var sid = body.dxfSeed === undefined ? null : driveId_(body.dxfSeed); // v2.32: the plan template link of this list (blank = none)
    if (sid) all['dxfseed.id'] = sid; else if (sid === '') props.deleteProperty('dxfseed.id');
    props.setProperties(all);
    for (var j = n; j < old; j++) props.deleteProperty('list.' + j);
    return json_({ ok: true, rev: rev });
  } finally { lock.releaseLock(); }
}
/** v2.32: the Drive file id of the plan template: Settings → Plan template, else the link the admin phone sent with the list. */
function driveId_(link) {
  var t = String(link || '').trim(), m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(t) || /[?&]id=([A-Za-z0-9_-]{20,})/.exec(t);
  return m ? m[1] : /^[A-Za-z0-9_-]{20,80}$/.test(t) ? t : '';
}
function seedId_(s) { return driveId_(s['Plan template']) || PropertiesService.getScriptProperties().getProperty('dxfseed.id') || ''; }
/** v2.32: the plan template itself ({ ok, id, name, text }), downloaded from its Drive link (shared: Anyone with the link).
    Only this one file: the id comes from Settings or the admin's list, never from the request. */
function dxfSeed_(s) {
  var id = seedId_(s);
  if (!id) return json_({ ok: false, error: 'no plan template' });
  var urls = ['https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t', 'https://drive.google.com/uc?export=download&id=' + id];
  var last = '';
  for (var i = 0; i < urls.length; i++) {
    var r;
    try { r = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true, followRedirects: true }); } catch (err) { last = String(err && err.message || err).slice(0, 200); continue; }
    if (r.getResponseCode() !== 200) { last = 'Google Drive answered HTTP ' + r.getResponseCode(); continue; }
    var text = r.getContentText('UTF-8');
    if (/<html|<!DOCTYPE html/i.test(text.slice(0, 400))) { last = 'Google Drive sent a web page: set the template file\'s sharing to Anyone with the link'; continue; }
    if (!/\bSECTION\b/.test(text.slice(0, 4000)) || !/@@\w+@@/.test(text) || !/\nGEO\r?\n/.test(text)) return json_({ ok: false, error: 'the linked file is not the prepared plan template (seed)' });
    var cd = String((r.getHeaders() || {})['Content-Disposition'] || ''), nm = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd);
    return json_({ ok: true, id: id, name: nm ? decodeURIComponent(nm[1]).slice(0, 80) : 'plan template.dxf', size: text.length, text: text });
  }
  return json_({ ok: false, error: last || 'Google Drive did not answer' });
}
/** v2.34: a company's logo: a company key sets its own company's, the Admin key any company's. The picture is small (G-eSAA
    makes it at most 600 × 220 px, under 34 KB), kept as text in one cell of the Logos tab. */
function setLogo_(body, s) {
  var admin = !!s['Admin key'] && body.key === s['Admin key'], owner = keyOwner_(companyKeys_(), body.ckey);
  if (!admin && !owner) return json_({ ok: false, error: 'company key' });
  var company = owner && !admin ? owner.name : String(body.company || '').trim().slice(0, 100);
  var type = String(body.type || ''), data = String(body.data || '');
  if (!company) return json_({ ok: false, error: 'company' });
  if (!/^image\/(png|jpeg)$/.test(type) || !/^[A-Za-z0-9+\/=]+$/.test(data) || data.length > 48000) return json_({ ok: false, error: 'picture' });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Logos');
    if (!sh) { sh = ss.insertSheet('Logos'); sh.getRange(1, 1, 1, 4).setValues(TABS.Logos); sh.setFrozenRows(1); }
    var at = new Date().toISOString(), row = [company, at, type, data], n = sh.getLastRow(), found = 0;
    if (n > 1) { var names = sh.getRange(2, 1, n - 1, 1).getValues(); for (var i = 0; i < names.length; i++) if (normCo_(names[i][0]) === normCo_(company)) { found = i + 2; break; } }
    var r = sh.getRange(found || n + 1, 1, 1, 4); r.setNumberFormat('@'); r.setValues([row]);
    return json_({ ok: true, company: company, at: at });
  } finally { lock.releaseLock(); }
}
/** v2.41: the admin phone makes an invite for one or more companies (each must have a key in CompanyKeys). */
function makeInvite_(body, s) {
  var keys = companyKeys_(), want = (Array.isArray(body.cos) ? body.cos : []).map(function (c) { return String(c || '').replace(/\s+/g, ' ').trim().slice(0, 100); }).filter(String).slice(0, 50);
  if (!want.length) return json_({ ok: false, error: 'companies' });
  // v2.42: ['*'] = any vendor: any company of the Companies tab that is not an admin company, checked when the invite is used (so a
  //        vendor added later can use it too); its key must be in CompanyKeys then
  var anyVendor = want.length === 1 && want[0] === '*';
  if (anyVendor) want = ['* (any vendor)'];
  var missing = anyVendor ? [] : want.filter(function (c) { return !keys[normCo_(c)]; });
  if (missing.length) return json_({ ok: false, error: 'no company key for ' + missing.join(', ') + ' (run makeCompanyKeys)' });
  var days = Math.max(1, Math.min(60, Number(body.days) || 14)), now = new Date(), until = new Date(now.getTime() + days * 86400000);
  var A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ', hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), code = '';
  for (var i = 0; i < 14; i++) code += A.charAt(parseInt(hex.substr(i * 2, 2), 16) % A.length);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Invites');
    if (!sh) { sh = ss.insertSheet('Invites'); sh.getRange(1, 1, 1, 8).setValues(TABS.Invites).setFontWeight('bold'); sh.setFrozenRows(1); }
    var r = sh.getRange(sh.getLastRow() + 1, 1, 1, 8); r.setNumberFormat('@');
    r.setValues([[code, want.join(' | '), now.toISOString(), until.toISOString().slice(0, 10), 'Yes', '0', '50', String(body.by || '').slice(0, 120)]]); // v2.42.4: " | " (a name may hold "," "/" "&")
  } finally { lock.releaseLock(); }
  return json_({ ok: true, code: code, until: until.toISOString().slice(0, 10), inv: 1 }); // v2.42.6: inv: the short link (inv=) works
}
/** v2.42.6: Invite a coworker on a phone with a company key: an invite for that key's company only (14 days, at most 50 uses). */
function makeInviteKey_(body, s) {
  var own = keyOwner_(companyKeys_(), body.ckey);
  if (!own) return json_({ ok: false, error: 'company key' });
  return makeInvite_({ cos: [own.name], days: 14, by: String(body.by || '').slice(0, 100) + ' · key:' + keyPrint_(companyKeys_()[own.company].key) }, s); // the key that made it (inviteRow_)
}
/** v2.42.6: a short print of a company key (an invite made with a key stops when that company's key is replaced). */
function keyPrint_(k) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, normKey_(k))).slice(0, 8); }
/** v2.42.6: the invite with this code as Invites keeps it: its row (0-based), or an error (invite, closed, expired, used). */
function inviteRow_(sh, code) {
  if (code.length < 8 || !sh || sh.getLastRow() < 2) return { error: 'invite' };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getDisplayValues(), at = -1;
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).toUpperCase().replace(/[^A-Z0-9]/g, '') === code) { at = i; break; }
  if (at < 0) return { error: 'invite' };
  var row = rows[at], raw = sh.getRange(at + 2, 4).getValues()[0][0], uses = Number(row[5]) || 0, max = String(row[6]).trim() === '' ? 1e9 : Number(row[6]) || 0;
  if (/^n/i.test(String(row[4]).trim())) return { error: 'closed' };
  if (String(raw).trim() !== '') { // Valid until: the date written by makeInvite_ (text), or a date the admin typed
    var u = raw instanceof Date ? raw : new Date(String(raw).trim() + (/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim()) ? 'T23:59:59' : ''));
    if (isNaN(u.getTime()) || u.getTime() < Date.now()) return { error: 'expired' };
  }
  if (uses >= max) return { error: 'used' };
  var kp = /· key:([A-Za-z0-9_-]{8})\s*$/.exec(String(row[7])); // made with a company key (Invite a coworker): only while that key is the company's
  if (kp) { var kk = companyKeys_()[inviteCos_(row[1])[0]]; if (!kk || keyPrint_(kk.key) !== kp[1]) return { error: 'closed' }; }
  return { at: at, row: row, uses: uses };
}
/** v2.42.6: a short invite link (…#i=…): the invite's companies (as written in its row; any: any vendor) and the company list.
    Nothing is counted or handed out here: the company key comes with redeemInvite, as before. */
function inviteInfo_(code0) {
  var code = String(code0 || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
  var r = inviteRow_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Invites'), code);
  if (r.error) return json_({ ok: false, error: r.error });
  var list = list_(); if (!list) return json_({ ok: false, error: 'no list' });
  var cell = String(r.row[1]), out = { ok: true, list: list, listRev: Number(PropertiesService.getScriptProperties().getProperty('list.rev') || 0), until: String(r.row[3]), strict: Object.keys(companyKeys_()).length > 0 };
  if (/^\s*\*/.test(cell)) out.any = true;
  else {
    var keys = companyKeys_(), raw = {}, add = function (x) { var t = String(x).replace(/\s+/g, ' ').trim(), k = normCo_(t); if (k && !raw[k]) raw[k] = t; };
    cell.split('|').forEach(add); add(cell); cell.split(/\s*(?:[,;\/&+\n]|\band\b)\s*/i).forEach(add); // each name as written
    out.cos = inviteCos_(cell).map(function (c) { return keys[c] ? keys[c].name : raw[c] || c; }).slice(0, 50); // as CompanyKeys writes it
  }
  return json_(out);
}
/** v2.42.6: Move to another phone: the user's details (the app's own text, as in the long link) kept 6 hours in the script's cache,
    under a code; the new phone takes them once (moveTake_). Needs the Read key, a company key or the Admin key. */
function makeMove_(body, s) {
  var ok = (s['Read key'] && String(body.rkey || '') === s['Read key']) || (s['Admin key'] && String(body.key || '') === s['Admin key']) || !!keyOwner_(companyKeys_(), body.ckey);
  if (!ok) return json_({ ok: false, error: 'key' });
  var mv = String(body.mv || '');
  if (!/^[A-Za-z0-9_-]{8,6000}$/.test(mv)) return json_({ ok: false, error: 'bad move' });
  var A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ', hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), code = '';
  for (var i = 0; i < 14; i++) code += A.charAt(parseInt(hex.substr(i * 2, 2), 16) % A.length);
  CacheService.getScriptCache().put('mv.' + code, mv, 21600);
  return json_({ ok: true, code: code, hours: 6 });
}
function moveTake_(code0) {
  var code = String(code0 || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24), cache = CacheService.getScriptCache();
  if (code.length < 8) return json_({ ok: false, error: 'move' });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var mv = cache.get('mv.' + code);
    if (!mv) return json_({ ok: false, error: 'move' });
    if (!cache.get('mvt.' + code)) { cache.put('mv.' + code, mv, 600); cache.put('mvt.' + code, '1', 600); } // once: 10 more minutes after it is first opened (a retry, the app and the browser)
    var list = list_();
    return json_({ ok: true, mv: mv, list: list || null, listRev: Number(PropertiesService.getScriptProperties().getProperty('list.rev') || 0) });
  } finally { lock.releaseLock(); }
}

/* ---- v2.42.6: credits (1 credit = 1 m of a survey's route, charged once per project on its KMZ / DXF export) ---- */
var CR_COLS = 8, CRLOG_COLS = 9;
function creditsTab_(ss) {
  var sh = ss.getSheetByName('Credits');
  if (!sh) { sh = ss.insertSheet('Credits'); sh.getRange(1, 1, 1, CR_COLS).setValues(TABS.Credits).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
/** Who asks: the email, and the company from the company key (the sheet uses them) or as the phone says (no company keys). */
function creditWho_(p, s) {
  var email = String(p.email || '').trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'email' };
  if (isAdmin_({ akey: p.akey }, s)) return { email: email, admin: true };
  var keys = companyKeys_(), strict = Object.keys(keys).length > 0, own = keyOwner_(keys, p.ckey);
  if (strict && !own) return { error: 'company key' };
  if (!own && !(s['Read key'] && String(p.key || '') === s['Read key'])) return { error: 'key' };
  var company = own ? own.name : String(p.company || '').replace(/\s+/g, ' ').trim().slice(0, 100), nc = normCo_(company);
  return { email: email, company: company, nc: nc, strict: strict, admin: !!(own && own.all) || (!!nc && seeAll_().indexOf(nc) >= 0) };
}
/** Unlimited: Yes, or a date (unlimited until the end of that day). */
function unlimited_(v) {
  if (v instanceof Date) return v.getTime() + 86400000 > Date.now();
  var t = String(v || '').trim(); if (yes_(t)) return true;
  var y, mo, da, m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t), m2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) { y = +m[1]; mo = +m[2]; da = +m[3]; }
  else if (m2) { y = +m2[3]; if (+m2[1] > 12) { da = +m2[1]; mo = +m2[2]; } else { mo = +m2[1]; da = +m2[2]; } } // D/M/YYYY when the first is above 12, else M/D/YYYY (as Sheets)
  else return false;
  var d = new Date(y, mo - 1, da);
  if (isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return false; // 31/02 and the like: not a date
  return d.getTime() + 86400000 > Date.now();
}
/** The Credits row of an email: {r (sheet row), company, credits, unl, used}, or null. */
function creditRow_(sh, email) {
  if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, CR_COLS).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim().toLowerCase() === email) return { r: i + 2, company: String(v[i][1]).trim(), credits: Number(v[i][2]) || 0, unl: unlimited_(v[i][3]), until: untilOf_(v[i][3]), used: Number(v[i][4]) || 0, bal: String(v[i][5]) };
  return null;
}
/** v2.42.7: the date of "Unlimited until …" as YYYY-MM-DD ('' for Yes, No or no date). */
function untilOf_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var t = String(v || '').trim(); if (!t || yes_(t) || !unlimited_(t)) return '';
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t), m2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t), p2 = function (x) { return ('0' + x).slice(-2); };
  if (m) return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
  if (m2) return +m2[1] > 12 ? m2[3] + '-' + p2(m2[2]) + '-' + p2(m2[1]) : m2[3] + '-' + p2(m2[1]) + '-' + p2(m2[2]);
  return '';
}
/** v2.42.7: a new row of the Credits tab (the Balance a formula). */
function creditAdd_(sh, email, company, free, how) {
  var r = Math.max(2, sh.getLastRow() + 1);
  sh.getRange(r, 1, 1, 2).setNumberFormat('@').setValues([[email, company]]);
  sh.getRange(r, 3, 1, 6).setValues([[free, 'No', 0, '=N(C' + r + ')-N(E' + r + ')', '', 'Added by G-eSAA ' + new Date().toISOString().slice(0, 10) + (how ? ' (' + how + ')' : '')]]);
  return r;
}
/** v2.42.7: the Credits tab for the admin phone (User credits): each user's credits, used, balance and unlimited. */
function creditList_(s) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Credits'), users = [];
  if (sh && sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, CR_COLS).getValues().forEach(function (r) {
    var email = String(r[0]).trim().toLowerCase(); if (!email) return;
    var credits = Number(r[2]) || 0, used = Number(r[4]) || 0, unl = unlimited_(r[3]);
    users.push({ email: email, company: String(r[1]).trim(), credits: credits, used: used, bal: credits - used, unl: unl, until: unl ? untilOf_(r[3]) : '', set: String(r[3] instanceof Date ? untilOf_(r[3]) : r[3]).trim().slice(0, 20), last: String(r[6] instanceof Date ? r[6].toISOString() : r[6]).slice(0, 30) });
  });
  return json_({ ok: true, on: yes_(s['Credits']), free: Math.max(0, Number(s['Free credits for a new user (m)']) || 0), users: users });
}
/** v2.42.7: the admin phone changes one user's credits: add (+m), set (the balance becomes m), unl (Yes, or until a date), limit (No).
    The user is added when not listed yet. Each change is written in the Credit log (by whom). */
function setCredit_(body, s) {
  var email = String(body.email || '').trim().toLowerCase().slice(0, 120), op = String(body.op || ''), m = Math.round(Number(body.m));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json_({ ok: false, error: 'email' });
  if (!/^(add|set|unl|limit)$/.test(op)) return json_({ ok: false, error: 'op' });
  if ((op === 'add' || op === 'set') && !(isFinite(m) && m >= 0 && m <= 1e7)) return json_({ ok: false, error: 'metres' });
  var until = String(body.until || '').trim();
  if (op === 'unl' && until && !(/^\d{4}-\d{2}-\d{2}$/.test(until) && unlimited_(until))) return json_({ ok: false, error: 'date' }); // a real date, today or later
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = creditsTab_(ss), row = creditRow_(sh, email);
    if (!row) { creditAdd_(sh, email, String(body.company || '').replace(/\s+/g, ' ').trim().slice(0, 100), 0, 'by the admin'); row = creditRow_(sh, email); }
    var what;
    if (op === 'add') { sh.getRange(row.r, 3).setValue(row.credits + m); what = 'admin: +' + m + ' m'; }
    else if (op === 'set') { sh.getRange(row.r, 3).setValue(row.used + m); what = 'admin: balance set to ' + m + ' m'; }
    else if (op === 'unl') { sh.getRange(row.r, 4).setNumberFormat('@').setValue(until || 'Yes'); what = 'admin: unlimited' + (until ? ' until ' + until : ''); }
    else { sh.getRange(row.r, 4).setValue('No'); what = 'admin: limited (no longer unlimited)'; }
    if (row.bal === '') sh.getRange(row.r, 6).setValue('=N(C' + row.r + ')-N(E' + row.r + ')');
    var after = creditRow_(sh, email);
    var log = ss.getSheetByName('Credit log') || (function () { var x = ss.insertSheet('Credit log'); x.getRange(1, 1, 1, CRLOG_COLS).setValues(TABS['Credit log']).setFontWeight('bold'); x.setFrozenRows(1); return x; })();
    var lr = log.getLastRow() + 1;
    log.getRange(lr, 1, 1, 5).setNumberFormat('@').setValues([[new Date().toISOString(), email, after.company, '(admin)', '']]);
    log.getRange(lr, 6, 1, 4).setValues([['', 0, (what + (body.by ? ' by ' + String(body.by).slice(0, 120) : '')).replace(/^[=+@-]+/, ''), after.unl ? '' : after.credits - after.used]]);
    return json_({ ok: true, user: { email: email, company: after.company, credits: after.credits, used: after.used, bal: after.credits - after.used, unl: after.unl, until: after.until } });
  } finally { lock.releaseLock(); }
}
/** v2.42.7: Run from the editor: every vendor email of the Invite log that is not in the Credits tab yet is added (with the free credits),
    so you can give credits before those users export, also to users still on a G-eSAA older than 2.42.6. */
function addCreditUsers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = settings_(), sh = creditsTab_(ss), log = ss.getSheetByName('Invite log'), admins = seeAll_();
  var free = Math.max(0, Number(s['Free credits for a new user (m)']) || 0), added = 0, skipped = 0;
  if (!log || log.getLastRow() < 2) { console.log('The Invite log is empty: users are added at their first sync (G-eSAA 2.42.6 or later).'); return; }
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var have = {}; if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { have[String(r[0]).trim().toLowerCase()] = true; });
    log.getRange(2, 1, log.getLastRow() - 1, 6).getDisplayValues().forEach(function (r) {
      var email = String(r[5]).trim().toLowerCase(), company = String(r[2]).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || have[email]) return;
      if (admins.indexOf(normCo_(company)) >= 0) { skipped++; return; } // the admin company never needs credits
      creditAdd_(sh, email, company, free, 'from the Invite log'); have[email] = true; added++;
    });
  } finally { lock.releaseLock(); }
  console.log(added + ' users added to the Credits tab' + (skipped ? ' (' + skipped + ' of the admin company left out: they never need credits)' : '') + '.');
}
/** What the phone shows (a read with the user's email): on/off, unlimited, the balance. */
function creditInfo_(p, s) {
  if (!yes_(s['Credits'])) return { on: false };
  var w = creditWho_(p, s);
  if (w.error) return { on: true, err: w.error };
  if (w.admin) return { on: true, unl: true, admin: true };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), row = creditRow_(ss.getSheetByName('Credits'), w.email), free = Math.max(0, Number(s['Free credits for a new user (m)']) || 0);
  if (!row && w.company) { // v2.42.7: a new user is listed at their first sync (the admin sees everyone and can give credits before the first export)
    var lock = LockService.getScriptLock();
    if (lock.tryLock(10000)) {
      try { var sh = creditsTab_(ss); row = creditRow_(sh, w.email); if (!row) { creditAdd_(sh, w.email, w.company, free, 'first sync'); row = creditRow_(sh, w.email); } } finally { lock.releaseLock(); }
    }
  }
  if (!row) return { on: true, unl: false, bal: free, given: free, used: 0, fresh: true };
  if (w.strict && row.company && normCo_(row.company) !== w.nc) return { on: true, err: 'company' };
  return { on: true, unl: row.unl, until: row.unl ? row.until : '', bal: row.credits - row.used, given: row.credits, used: row.used };
}
/** The metres of a project already counted (the longest route logged for its key). */
function coveredM_(ss, pkey) {
  var sh = ss.getSheetByName('Credit log'); if (!sh || sh.getLastRow() < 2) return 0;
  var v = sh.getRange(2, 5, sh.getLastRow() - 1, 2).getValues(), m = 0;
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === pkey) m = Math.max(m, Number(v[i][1]) || 0);
  return m;
}
/** A vendor's export: the new metres of the route are charged (allowNeg: a charge from a phone that exported offline). */
function credit_(body, s) {
  if (!yes_(s['Credits'])) return json_({ ok: true, off: true });
  var w = creditWho_(body, s);
  if (w.error) return json_({ ok: false, error: w.error });
  if (w.admin) return json_({ ok: true, unl: true, admin: true });
  var route = Math.max(0, Math.min(1e7, Math.round(Number(body.route) || 0))), pkey = String(body.pkey || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (pkey.length < 6) return json_({ ok: false, error: 'project' });
  var kind = /^(kmz|dxf|pdf)$/.test(String(body.kind)) ? String(body.kind) : 'export', project = String(body.project || '').replace(/^[=+@-]+/, '').slice(0, 120);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = creditsTab_(ss), now = new Date().toISOString(), row = creditRow_(sh, w.email);
    if (!row) { // a new email: added with the free credits
      var free = Math.max(0, Number(s['Free credits for a new user (m)']) || 0), r = creditAdd_(sh, w.email, w.company, free, 'first export');
      row = { r: r, company: w.company, credits: free, unl: false, used: 0, bal: 'x' };
    } else if (w.strict && row.company && normCo_(row.company) !== w.nc) return json_({ ok: false, error: 'credit company' }); // the email is another company's
    else if (!row.company && w.company) sh.getRange(row.r, 2).setNumberFormat('@').setValue(w.company);
    if (row.bal === '') sh.getRange(row.r, 6).setValue('=N(C' + row.r + ')-N(E' + row.r + ')'); // a row the admin typed: its balance
    var covered = coveredM_(ss, pkey), charge = Math.max(0, route - covered), bal = row.credits - row.used;
    if (!row.unl && charge > 0 && charge > bal && !body.allowNeg) return json_({ ok: false, error: 'credits', need: charge, bal: bal, route: route, covered: covered });
    var paid = row.unl ? 0 : charge;
    if (paid > 0) sh.getRange(row.r, 5).setValue(row.used + paid);
    sh.getRange(row.r, 7).setValue(now);
    if (charge > 0) { // the project's new metres (also for an unlimited user: they count for the project)
      var log = ss.getSheetByName('Credit log') || (function () { var x = ss.insertSheet('Credit log'); x.getRange(1, 1, 1, CRLOG_COLS).setValues(TABS['Credit log']).setFontWeight('bold'); x.setFrozenRows(1); return x; })();
      var lr = log.getLastRow() + 1;
      log.getRange(lr, 1, 1, 5).setNumberFormat('@').setValues([[now, w.email, w.company || row.company, project, pkey]]);
      log.getRange(lr, 6, 1, 4).setValues([[route, paid, kind + (row.unl ? ' (unlimited)' : '') + (body.allowNeg ? ' (offline)' : ''), row.unl ? '' : bal - paid]]);
    }
    return json_({ ok: true, unl: row.unl, charged: paid, bal: bal - paid, route: route, covered: covered });
  } finally { lock.releaseLock(); }
}
/** v2.42.4: the companies of an invite: " | " apart (v2.42.4 on); one company's whole name (it may hold "/" or "&"); else the older ", " list. */
function inviteCos_(cell) {
  var t = String(cell || ''), whole = normCo_(t);
  if (t.indexOf('|') >= 0) return t.split('|').map(normCo_).filter(String);
  if (whole && companyKeys_()[whole]) return [whole];
  return companyList_(t);
}
/** v2.42.4: the companies that see all tasks (Settings, and the Companies tab's admin companies). */
function seeAll_() { var s = settings_(); return String(s['Companies that see all tasks'] || '').split(',').map(normCo_).filter(String).concat(companies_(s).admins); }
/** v2.41: a new phone with an invite's code and the company its user chose: that company's key, when the invite is active, still
    valid, not used up and names that company. Every key handed out is logged. */
function redeemInvite_(body) {
  var code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24), company = String(body.company || '').trim().slice(0, 100);
  if (code.length < 8) return json_({ ok: false, error: 'invite' });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Invites');
    var ir = inviteRow_(sh, code); // v2.42.6: the checks shared with the short link
    if (ir.error) return json_({ ok: false, error: ir.error });
    var at = ir.at, row = ir.row, uses = ir.uses;
    if (/^\s*\*/.test(String(row[1]))) { // v2.42: any vendor: a company of the Companies tab, not an admin company
      var co = companies_(settings_()), nc = normCo_(company);
      if (!co.names.some(function (n) { return normCo_(n) === nc; }) || co.admins.indexOf(nc) >= 0) return json_({ ok: false, error: 'company' });
    } else if (!inviteCos_(row[1]).some(function (c) { return c === normCo_(company); })) return json_({ ok: false, error: 'company' });
    var k = companyKeys_()[normCo_(company)];
    if (!k) return json_({ ok: false, error: 'company' });
    if (/^\s*\*/.test(String(row[1])) && (k.all || seeAll_().indexOf(normCo_(company)) >= 0)) return json_({ ok: false, error: 'company' }); // v2.42.4: any vendor: not a company that sees all tasks
    sh.getRange(at + 2, 6).setNumberFormat('@').setValue(String(uses + 1));
    var log = ss.getSheetByName('Invite log') || (function () { var x = ss.insertSheet('Invite log'); x.getRange(1, 1, 1, 6).setValues(TABS['Invite log']).setFontWeight('bold'); x.setFrozenRows(1); return x; })();
    var lr = log.getRange(log.getLastRow() + 1, 1, 1, 6); lr.setNumberFormat('@');
    lr.setValues([[new Date().toISOString(), code, k.name, String(body.name || '').slice(0, 100), String(body.mobile || '').slice(0, 40), String(body.email || '').slice(0, 120)]]);
    return json_({ ok: true, key: k.key, you: k.name });
  } finally { lock.releaseLock(); }
}
function logoFor_(company) {
  var c = normCo_(company); if (!c) return null;
  var rows = rows_('Logos', 4);
  for (var i = 0; i < rows.length; i++) if (normCo_(rows[i][0]) === c && String(rows[i][3]).length > 20) return { at: String(rows[i][1] instanceof Date ? rows[i][1].toISOString() : rows[i][1]), type: String(rows[i][2]), data: String(rows[i][3]) };
  return null;
}
function list_() {
  var props = PropertiesService.getScriptProperties(), n = Number(props.getProperty('list.n') || 0), out = '';
  for (var i = 0; i < n; i++) out += props.getProperty('list.' + i) || '';
  return /^PCT[01]:[A-Za-z0-9_-]+$/.test(out) ? out : '';
}

/** Run from the editor: gives every company in the companies tab its own key (existing keys are kept).
    The companies listed in "Companies that see all tasks" get "Sees all tasks: Yes". */
function makeCompanyKeys() {
  var s = settings_(), sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CompanyKeys') || (setup(), SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CompanyKeys'));
  var have = {};
  rows_('CompanyKeys', 3).forEach(function (r) { if (String(r[0]).trim()) have[normCo_(r[0])] = true; });
  var co = companies_(s), seeAll = String(s['Companies that see all tasks'] || '').split(',').map(normCo_).filter(String).concat(co.admins);
  var add = [];
  co.names.forEach(function (name) {
    var c = normCo_(name);
    if (c && !have[c]) { have[c] = true; add.push([name, companyKeyNew_(), seeAll.indexOf(c) >= 0 ? 'Yes' : 'No']); }
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 3).setNumberFormat('@').setValues(add);
  console.log(add.length + ' company keys added. Give each company only its own key: the first user of a company types it in PoleCam, coworkers then scan their invite QR code.');
}

/** Run from the editor: shows the columns found in your tracker and how many tasks each company would get. */
function testSource() {
  var s = settings_();
  var co = companies_(s);
  console.log('Companies (' + (co.tab || 'none') + '): ' + co.names.join(', ') + (co.admins.length ? ' · see all: ' + co.admins.join(', ') : ''));
  if (!String(s['Tasks source'] || '').trim() && !String(s['Tasks source tab'] || '').trim()) { console.log('Tasks come from the Tasks tab (' + tabTasks_().length + ' open tasks).'); return; }
  var r = sourceTasks_(s), per = {};
  Object.keys(r.columns).forEach(function (f) { console.log('Column ' + f + ': ' + (r.columns[f] >= 0 ? 'column ' + (r.columns[f] + 1) : 'not used')); });
  r.tasks.forEach(function (t) {
    var cs = companyList_(t.company);
    if (!cs.length) cs = ['(no company: ' + (yes_(s['Blank company = everyone']) ? 'everyone' : 'only companies that see all') + ')'];
    cs.forEach(function (k) { per[k] = (per[k] || 0) + 1; });
  });
  console.log(r.rows + ' rows read, ' + r.skipped + ' skipped (closed or filtered), ' + r.tasks.length + ' tasks sent.');
  Object.keys(per).sort().forEach(function (k) { console.log('  ' + k + ': ' + per[k]); });
  console.log('First tasks: ' + JSON.stringify(r.tasks.slice(0, 3), null, 1));
}

/* ---- v2.43: Coordinator / Field Partner teams and the contractor mailboxes ----
   Every request names its company with the company key (ckey); a change also needs a confirmed email (email + tok from teamVerify).
   The tabs Team, TeamLinks and Mailboxes are read by their header names (TEAM_COLS), so the admin may move their columns; a column
   that is missing when the script writes is added at the end (with its header). The admin may edit the rows by hand: the sheet wins. */
var TEAM_ACTIONS = /^(teamCode|teamVerify|team|teamRole|teamJoin|teamAnswer|teamRemove|teamLeave|mailboxSet|mailboxKey)$/;
var TEAM_ROLES = ['Coordinator', 'Field Partner', 'On my own'];
var TEAM_STATUS = ['asked', 'in', 'declined', 'left', 'removed'];
var MAILBOX_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
var TEAM_KEY = /^[A-Za-z0-9_-]{24,64}$/; // the team key the phones send to the mailbox (random, 24 to 64 characters)
/** The fields of each team tab: [field, the header names it may have (compared as normHead_)], in the order of TABS (setup's header). */
var TEAM_COLS = {
  Team: [['company', ['company']], ['email', ['email', 'e mail']], ['name', ['name']], ['role', ['role']], ['regions', ['regions', 'region']], ['updated', ['updated']]],
  TeamLinks: [['company', ['company']], ['coord', ['coordinator email', 'coordinator']], ['member', ['member email', 'member']], ['status', ['status']], ['updated', ['updated']]],
  Mailboxes: [['company', ['company']], ['url', ['web app address', 'web app url', 'url']], ['key', ['key', 'team key']], ['setBy', ['set up by']],
    ['account', ['google account', 'account']], ['checked', ['checked']], ['status', ['status']]],
};

/** doPost (before the Admin key): the team actions. Never throws: an unexpected error answers { ok: false, error: 'server' }. */
function team_(body, s) {
  var a = String(body.action);
  try {
    var owner = keyOwner_(companyKeys_(), body.ckey);
    if (!owner) return json_({ ok: false, error: 'key' });
    var e = teamEmail_(body.email);
    if (!e) return json_({ ok: false, error: 'email' });
    if (a === 'teamCode') return teamCode_(owner, e, s);
    if (a === 'teamVerify') return teamVerify_(owner, e, body);
    var verified = teamTokOk_(owner, e, body.tok);
    if (a === 'team') return json_(teamInfo_(owner, e, verified, s));
    if (!verified) return json_({ ok: false, error: 'tok' });
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return json_({ ok: false, error: 'busy' });
    try { return json_(teamWrite_(a, owner, e, body)); } finally { lock.releaseLock(); }
  } catch (err) {
    console.log('team ' + a + ': ' + (err && err.message || err));
    return json_({ ok: false, error: 'server' });
  }
}

/** An email as the team tabs keep it (lower case, trimmed), or '' when it is not one (at most 120 characters). */
function teamEmail_(v) {
  var e = String(v == null ? '' : v).trim().toLowerCase();
  return e.length <= 120 && /^[a-z0-9_][^\s@<>"(),;:\[\]\\]*@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e) ? e : '';
}
/** Text for a cell: one line, at most n characters, never starting like a formula. */
function teamText_(v, n) {
  if (Array.isArray(v)) v = v.join(', ');
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[=+@-]+\s*/, '').slice(0, n).trim();
}
/** A cell of a team tab as text (a date the admin typed as ISO). */
function teamCell_(x) { return x instanceof Date ? (isNaN(x.getTime()) ? '' : x.toISOString()) : String(x == null ? '' : x).trim(); }
/** A Role cell as one of the three roles (blank or anything else = On my own). */
function roleOf_(v) { var t = String(v || '').trim().toLowerCase(); return /^coord/.test(t) ? 'Coordinator' : /^(field|partner)/.test(t) ? 'Field Partner' : 'On my own'; }
function statusOf_(v) { return String(v || '').trim().toLowerCase(); }

/** The secret of the team tokens (separate from the admin users' one). Made only under the lock (teamVerify). */
function teamSecret_(make) {
  var pr = PropertiesService.getScriptProperties(), k = pr.getProperty('team.secret');
  if (!k && make) { k = Utilities.getUuid() + Utilities.getUuid(); pr.setProperty('team.secret', k); }
  return k || '';
}
/** The token of a confirmed email in a company (normalized as normCo_): the same until resetTeamTokens. */
function teamToken_(company, email, make) {
  var k = teamSecret_(make);
  return k ? Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('team|' + company + '|' + email, k)).replace(/=+$/, '') : '';
}
function teamTokOk_(owner, e, tok) { var t = String(tok == null ? '' : tok), want = t ? teamToken_(owner.company, e) : ''; return !!want && t === want; }
/** Run from the editor: every phone must confirm its email again (a new code) before it changes its team or sees the mailbox. */
function resetTeamTokens() { PropertiesService.getScriptProperties().deleteProperty('team.secret'); console.log('Done: phones will be asked to confirm their email again.'); }

/** A team tab: { sh, name, col: {field: 0-based column or -1}, rows: [{ r: sheet row, v: {field: text} }] }. make: create it when missing. */
function teamTab_(name, make) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name), spec = TEAM_COLS[name];
  if (!sh && make) sh = ss.insertSheet(name, ss.getSheets().length);
  if (sh && make && sh.getLastRow() === 0) { sh.getRange(1, 1, 1, TABS[name][0].length).setValues(TABS[name]).setFontWeight('bold'); sh.setFrozenRows(1); }
  var out = { sh: sh, name: name, col: {}, rows: [] };
  spec.forEach(function (f) { out.col[f[0]] = -1; });
  if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return out;
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), head = v[0].map(normHead_);
  spec.forEach(function (f) { for (var i = 0; i < f[1].length; i++) { var k = head.indexOf(f[1][i]); if (k >= 0) { out.col[f[0]] = k; return; } } });
  for (var r = 1; r < v.length; r++) {
    var o = {};
    spec.forEach(function (f) { var c = out.col[f[0]]; o[f[0]] = c >= 0 ? teamCell_(v[r][c]) : ''; });
    out.rows.push({ r: r + 1, v: o });
  }
  return out;
}
/** The rows of one company (normCo_), and the first of them that passes test. */
function teamOf_(t, company) { return t.rows.filter(function (x) { return normCo_(x.v.company) === company; }); }
function teamFind_(t, company, test) { var L = teamOf_(t, company); for (var i = 0; i < L.length; i++) if (test(L[i].v)) return L[i]; return null; }
function linkFind_(t, company, coord, member) { return teamFind_(t, company, function (v) { return v.coord.toLowerCase() === coord && v.member.toLowerCase() === member; }); }
/** Writes these fields of one row (r: its sheet row; 0 = a new row at the end) as plain text, each in its own column (found by header). */
function teamPut_(t, r, o) {
  var sh = t.sh, cells = {};
  TEAM_COLS[t.name].forEach(function (f, i) {
    if (!(f[0] in o)) return;
    if (t.col[f[0]] < 0) { var c = sh.getLastColumn(); sh.getRange(1, c + 1).setValue(TABS[t.name][0][i]).setFontWeight('bold'); t.col[f[0]] = c; } // its column was deleted: added again at the end
    cells[t.col[f[0]]] = String(o[f[0]] == null ? '' : o[f[0]]);
  });
  if (!r) r = Math.max(2, sh.getLastRow() + 1);
  var cs = Object.keys(cells).map(Number).sort(function (a, b) { return a - b; });
  for (var i = 0; i < cs.length;) { // neighbouring columns in one write
    var j = i; while (j + 1 < cs.length && cs[j + 1] === cs[j] + 1) j++;
    sh.getRange(r, cs[i] + 1, 1, j - i + 1).setNumberFormat('@').setValues([cs.slice(i, j + 1).map(function (c) { return cells[c]; })]);
    i = j + 1;
  }
  return r;
}
/** setup: the Role (Team) and Status (TeamLinks) drop-downs (a value typed by hand that is not in the list only gets a warning). */
function teamSetup_() {
  [['Team', 'role', TEAM_ROLES], ['TeamLinks', 'status', TEAM_STATUS]].forEach(function (x) {
    var t = teamTab_(x[0]); if (!t.sh || t.col[x[1]] < 0) return;
    var c = colA1_(t.col[x[1]]);
    t.sh.getRange(c + '2:' + c).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(x[2], true).build());
  });
}

/** teamCode: a 6-digit code emailed to any address that asks with its company's key (as adminCode_, its own cache keys). */
function teamCode_(owner, e, s) {
  var cache = CacheService.getScriptCache(), nk = 'tcn:' + hash_(e), n = Number(cache.get(nk) || 0);
  if (n >= CODE_SENDS) return json_({ ok: false, error: 'wait' });
  var code = ('00000' + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000)).slice(-6);
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return json_({ ok: false, error: 'mail' });
    MailApp.sendEmail({ to: e, subject: 'G-eSAA code ' + code, name: s['List name'] || 'G-eSAA',
      body: 'Your G-eSAA code is ' + code + '\n\nType it in G-eSAA (Your details → My role) to confirm your email for ' + owner.name + '. It works for 10 minutes.\n\nIf you did not ask for this code, ignore this email.' });
  } catch (err) { console.log('teamCode mail: ' + (err && err.message || err)); return json_({ ok: false, error: 'mail' }); }
  cache.put('tcc:' + hash_(owner.company + '|' + e), JSON.stringify({ h: hash_(code + '|' + owner.company + '|' + e), t: 0, x: Date.now() + CODE_S * 1000 }), CODE_S);
  cache.put(nk, String(n + 1), CODE_S);
  return json_({ ok: true, sent: true });
}
/** teamVerify: the code typed on the phone: a token for that email in that company (expired, or code with the tries left). */
function teamVerify_(owner, e, body) {
  var code = typeof body.code === 'number' ? ('000000' + Math.floor(body.code)).slice(-6) : String(body.code || '').replace(/\D/g, '');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json_({ ok: false, error: 'busy' });
  try {
    var cache = CacheService.getScriptCache(), ck = 'tcc:' + hash_(owner.company + '|' + e), raw = cache.get(ck), c = raw ? JSON.parse(raw) : null;
    if (!c || Date.now() > c.x) return json_({ ok: false, error: 'expired' });
    if (code.length !== 6 || hash_(code + '|' + owner.company + '|' + e) !== c.h) {
      c.t = (c.t || 0) + 1;
      if (c.t >= CODE_TRIES) { cache.remove(ck); return json_({ ok: false, error: 'code', left: 0 }); }
      cache.put(ck, JSON.stringify(c), Math.max(1, Math.round((c.x - Date.now()) / 1000)));
      return json_({ ok: false, error: 'code', left: CODE_TRIES - c.t });
    }
    cache.remove(ck);
    return json_({ ok: true, tok: teamToken_(owner.company, e, true) });
  } finally { lock.releaseLock(); }
}

/** team: what this phone may see of its company's teams. The mailbox's address and key only with a confirmed email, and only for a
    Coordinator or a member a Coordinator accepted (a link with status in). */
function teamInfo_(owner, e, verified, s) {
  var team = teamOf_(teamTab_('Team'), owner.company), links = teamOf_(teamTab_('TeamLinks'), owner.company);
  var people = {}, coordinators = [];
  team.forEach(function (x) {
    var em = x.v.email.toLowerCase(); if (!em || people[em]) return; // the first row of an email counts
    people[em] = x.v;
    if (roleOf_(x.v.role) === 'Coordinator') coordinators.push({ email: em, name: x.v.name, regions: x.v.regions });
  });
  var mine = people[e], me = mine ? { role: roleOf_(mine.role), regions: mine.regions, name: mine.name } : null;
  var isCoord = !!me && me.role === 'Coordinator', seen = {}, myTeams = [], members = [];
  links.forEach(function (x) {
    var c = x.v.coord.toLowerCase(), m = x.v.member.toLowerCase(), k = c + '|' + m; if (!c || !m || seen[k]) return; seen[k] = 1;
    var st = statusOf_(x.v.status), p = people[m];
    if (m === e) myTeams.push({ coordinator: c, name: people[c] ? people[c].name : '', status: st });
    if (c === e && isCoord) members.push({ email: m, name: p ? p.name : '', role: p ? roleOf_(p.role) : 'On my own', regions: p ? p.regions : '', status: st });
  });
  var box = teamFind_(teamTab_('Mailboxes'), owner.company, function () { return true; }), set = !!(box && box.v.url);
  var may = verified && (isCoord || myTeams.some(function (t) { return t.status === 'in'; }));
  return { ok: true, company: owner.name, verified: verified, me: me, coordinators: coordinators, myTeams: myTeams, members: members,
    mailbox: may && set ? { url: box.v.url, key: box.v.key, account: box.v.account, setBy: box.v.setBy.toLowerCase(), checked: box.v.checked } : null,
    mailboxSet: set, scriptLink: String(s['Mailbox script link'] || '').trim() };
}

/** The changes (under the script lock, with a confirmed email): teamRole, teamJoin, teamLeave; teamAnswer, teamRemove, mailboxSet and
    mailboxKey for a Coordinator only. Returns the answer. */
function teamWrite_(a, owner, e, body) {
  var now = new Date().toISOString(), team = teamTab_('Team', true);
  var mine = teamFind_(team, owner.company, function (v) { return v.email.toLowerCase() === e; });
  if (a === 'teamRole') {
    var want = String(body.role == null ? '' : body.role).replace(/\s+/g, ' ').trim().toLowerCase();
    var role = TEAM_ROLES.filter(function (x) { return x.toLowerCase() === want; })[0];
    if (!role) return { ok: false, error: 'role' };
    var o = mine ? { role: role, updated: now } : { company: owner.name, email: e, role: role, updated: now };
    if (body.name !== undefined || !mine) o.name = teamText_(body.name, 80);
    if (body.regions !== undefined || !mine) o.regions = teamText_(body.regions, 60);
    teamPut_(team, mine ? mine.r : 0, o);
    return { ok: true, me: { role: role, regions: 'regions' in o ? o.regions : mine.v.regions, name: 'name' in o ? o.name : mine.v.name } };
  }
  if (a === 'teamJoin') {
    var co = teamEmail_(body.coordinator);
    if (co && co === e) return { ok: false, error: 'self' };
    var cr = co ? teamFind_(team, owner.company, function (v) { return v.email.toLowerCase() === co; }) : null;
    if (!cr || roleOf_(cr.v.role) !== 'Coordinator') return { ok: false, error: 'role' }; // not a Coordinator of this company
    var nm = teamText_(body.name, 80);
    if (!mine) teamPut_(team, 0, { company: owner.name, email: e, name: nm, role: 'Field Partner', regions: '', updated: now });
    else if (nm && nm !== mine.v.name) teamPut_(team, mine.r, { name: nm, updated: now });
    var links = teamTab_('TeamLinks', true), l = linkFind_(links, owner.company, co, e);
    if (l && statusOf_(l.v.status) === 'in') return { ok: true, status: 'in' }; // already in that team
    teamPut_(links, l ? l.r : 0, l ? { status: 'asked', updated: now } : { company: owner.name, coord: co, member: e, status: 'asked', updated: now });
    return { ok: true, status: 'asked' };
  }
  if (a === 'teamLeave') {
    var lt = teamTab_('TeamLinks', true), lc = teamEmail_(body.coordinator), ll = lc ? linkFind_(lt, owner.company, lc, e) : null;
    if (!ll) return { ok: false, error: 'link' };
    teamPut_(lt, ll.r, { status: 'left', updated: now });
    return { ok: true, status: 'left' };
  }
  if (!mine || roleOf_(mine.v.role) !== 'Coordinator') return { ok: false, error: 'role' }; // the rest: a Coordinator only
  if (a === 'teamAnswer' || a === 'teamRemove') {
    var m = teamEmail_(body.member), mt = teamTab_('TeamLinks', true), ml = m ? linkFind_(mt, owner.company, e, m) : null;
    if (!ml) return { ok: false, error: 'link' };
    var st = 'removed';
    if (a === 'teamAnswer') {
      if (/^(left|removed)$/.test(statusOf_(ml.v.status))) return { ok: false, error: 'link' }; // that member must ask again
      st = yes_(body.accept) ? 'in' : 'declined';
    }
    teamPut_(mt, ml.r, { status: st, updated: now });
    return { ok: true, status: st };
  }
  var boxes = teamTab_('Mailboxes', true), b = teamFind_(boxes, owner.company, function () { return true; }); // one row per company
  var key = String(body.key == null ? '' : body.key).trim();
  if (a === 'mailboxSet') {
    var url = String(body.url == null ? '' : body.url).trim();
    if (url.length > 200 || !MAILBOX_URL.test(url)) return { ok: false, error: 'url' };
    if (!key && b) key = b.v.key; // no key sent: the row's key stays
    if (!TEAM_KEY.test(key)) return { ok: false, error: 'team key' };
    var acct = teamText_(body.account, 120), row = { url: url, key: key, setBy: e, account: acct, checked: now, status: 'working' };
    if (!b) row.company = owner.name;
    teamPut_(boxes, b ? b.r : 0, row);
    return { ok: true, mailbox: { url: url, key: key, account: acct, setBy: e, checked: now } };
  }
  if (a === 'mailboxKey') {
    if (!TEAM_KEY.test(key)) return { ok: false, error: 'team key' };
    if (!b || !b.v.url) return { ok: false, error: 'mailbox' };
    teamPut_(boxes, b.r, { key: key });
    return { ok: true };
  }
  return { ok: false, error: 'action' };
}
