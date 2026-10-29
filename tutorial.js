/* G-eSAA tutorial (v2.25): the topics of the in-app Tutorial (bottom bar → Tutorial).
   aud: 'user' (everyone) or 'admin' (shown only to users of the admin company).
   Each step: t = the text (**bold**); go = the screen "Show me" opens (map, projects, newProject, projectDetails, records,
   export, settings, profile, camera, exports, maps, storage, log); hl = the control it points at (CSS selector);
   when = shown when that control is not on screen right now. */
(function (root) {
  'use strict';
  const T = [
    /* ===================== USER GUIDE ===================== */
    { id: 'join', aud: 'user', cat: 'Getting started', title: 'Join your company (first time)', kw: 'invite qr link sign in register welcome company key profile name mobile email',
      steps: [
        { t: 'Open the **invite** from your admin or a coworker: scan its QR code with the phone camera, or open the invite link. In G-eSAA the first screen also has **Scan invite QR** and **Paste invite link**.' },
        { t: 'Enter your **full name**, **mobile number** and **email**. They are recorded on every photo and printed on the reports.', go: 'profile', hl: '#pfName' },
        { t: 'Tick your **Region** and **Territory** (all that apply). Only the online sheet\'s projects in those areas are listed for you; nothing ticked = every area.', go: 'profile', hl: '#pfAreaBox' },
        { t: 'Tap **Save**. With an invite, your company comes from it and cannot be changed on this phone (Settings → Reset user to start again). Without company keys, you choose your company from the list instead.', go: 'profile', hl: '#pfSave' },
      ] },
    { id: 'screen', aud: 'user', cat: 'Getting started', title: 'The main screen', kw: 'map top bar gps pill buttons bottom bar layout home',
      steps: [
        { t: 'The **project button** on the top bar shows the task category (SURVEY, PAT, CLEANUP, FAT) and the project name. Tap it to open Projects.', go: 'map', hl: '#projectBtn' },
        { t: 'The **GPS pill**: green ≤ 5 m, amber ≤ 15 m, red > 15 m. Wait for green when you can.', go: 'map', hl: '#gpsPill' },
        { t: 'Map buttons: the **route** (survey), **map layer** (street, satellite, offline pack) and **my location**.', go: 'map', hl: '.mapbtns' },
        { t: 'The strip above the bottom bar shows the project totals; tap it to open the records.', go: 'map', hl: '#mapSummary' },
        { t: 'The bottom bar: **Records**, the big **Capture** button, **Export**, **Settings** and this **Tutorial**.', go: 'map', hl: '#bottombar' },
      ] },
    { id: 'projects', aud: 'user', cat: 'Getting started', title: 'Projects: your task list', kw: 'project list task manager open switch filter search next step progress',
      steps: [
        { t: 'Tap the project button on the top bar to open **Projects**.', go: 'map', hl: '#projectBtn' },
        { t: 'The open project is at the top: its state, its progress (tap it to show the steps) and the **Next** button, which takes you to the next step.', go: 'projects', hl: '#wfBox' },
        { t: 'Your other projects are listed below. Filter *In progress / Completed / All* and by category, or search by name, site, vendor, task ID or notes. Tap a card to open that project.', go: 'projects', hl: '#tmListBox', when: 'It is listed once you have more than one project.' },
        { t: 'The **+** at the top right makes a new project. **Open a shared file** and **Share several projects** are at the bottom.', go: 'projects', hl: '#newProjBtn' },
      ] },
    { id: 'newproject', aud: 'user', cat: 'Getting started', title: 'Create a new project', kw: 'new project site online sheet category purpose survey pat cleanup fat create name pla',
      steps: [
        { t: 'Projects → **+** (New project).', go: 'projects', hl: '#newProjBtn' },
        { t: '**Site (online sheet)**: tap **Choose a site…** and pick one of your sites (search by site, PLA ID, serial number or vendor), or leave it and type a name. Only your company\'s sites in your regions and territories are listed.', go: 'newProject', hl: '#npSiteBox', when: 'It shows when your company list has an online sheet.' },
        { t: '**Task category**: Survey, PAT, Defect Cleanup or FAT, then the **purpose**. Categories that are not your part of the site are greyed out.', go: 'newProject', hl: '#npCat' },
        { t: 'Check the **project name** (filled in from the site) and the details: the survey start date, or for PAT / cleanup / FAT the representatives, inspection type and date.', go: 'newProject', hl: '#npName' },
        { t: 'A defect cleanup needs the **PAT KMZ**, and a FAT starts from a completed cleanup (see those topics). Tap **Create project**.', go: 'newProject', hl: '#npCreate' },
      ] },
    { id: 'area', aud: 'user', cat: 'Getting started', title: 'Your region and territory', kw: 'region territory nlz slz ncr vis min t1 t2 t3 t4 t5 t6 t7 t8 filter area sites hidden',
      steps: [
        { t: 'Settings → your name (**Your details**).', go: 'settings', hl: '#editMe' },
        { t: 'Tick every **Region** (NLZ, SLZ, NCR, VIS, MIN) and every **Territory** (T1–T8) you work in, then **Save**.', go: 'profile', hl: '#pfAreaBox' },
        { t: 'The phone reads the online sheet again. **Choose a site…** then lists only the projects of those regions and territories (a row with no region or territory is listed for everyone); its last line says your area and how many others are hidden.' },
        { t: 'Nothing ticked = every area. Change it any time in Your details.' },
      ] },

    { id: 'capture', aud: 'user', cat: 'Survey', title: 'Capture poles (survey)', kw: 'photo camera shutter pole id scan npt no tag pin gps green red blurry save record',
      steps: [
        { t: 'Open a Survey project, stand at the pole and tap **Capture**.', go: 'map', hl: '#captureBtn' },
        { t: 'The shutter is **green** when the GPS updated within the last 5 seconds; with a **red** shutter the photo is refused after 5 seconds. Dark, blank and blurry photos are refused: take them again.' },
        { t: 'After the photo, aim at the painted **pole ID**: it is used by itself when read clearly; tap **Skip** if there is none. For an untagged pole use **No tag → NPT** in the record.' },
        { t: 'In the record, drag the map so the pin sits on the pole (at most 1 km from where the photo was taken); **Reset to GPS** puts it back. Set the type and details, then **Save**.' },
        { t: 'Tap any pin on the map, or a row in Records, to open the record again: edit it, replace the photo or delete it.' },
      ] },
    { id: 'route', aud: 'user', cat: 'Survey', title: 'Link the cable route', kw: 'route span link poles cable capture order undo clear angle long span',
      steps: [
        { t: 'Tap the **route** button on the map.', go: 'map', hl: '#routeBtn', when: 'It shows in a Survey project.' },
        { t: 'Tap a pole, then the next pole, to link them. Tap a linked pair again to unlink it.' },
        { t: '**Link in capture order** links the poles in the order they were taken (gaps longer than the admin\'s limit are skipped). **Undo** and **Clear** as needed, **Done** when finished.' },
        { t: 'Spans longer than the maximum span and angle poles are flagged. Export → FORMAT **Route and spans · Excel** lists them.' },
      ] },
    { id: 'surveyexport', aud: 'user', cat: 'Survey', title: 'Survey exports (KMZ, DXF, CSV, photos)', kw: 'export kmz google earth dxf autocad csv excel photos zip design lld',
      steps: [
        { t: 'Tap **Export**, then choose the export under **FORMAT** at the top: one export is shown at a time.', go: 'map', hl: '#exportBtn' },
        { t: '**Google Earth · KMZ**: pins named by pole ID with the photo in each balloon, and the route. **AutoCAD · DXF**: poles at UTM 51N with their IDs, details, photos and the route (keep the files of the ZIP together).', go: 'export', hl: '#doKmz', when: 'The survey exports show in a Survey project.' },
        { t: '**Table · CSV**, **Route and spans · Excel** and **Geotagged photos · ZIP** too. Each card has its **Options**; the defaults are in Settings → Exports and files.', go: 'export', hl: '#doCsv', when: 'The survey exports show in a Survey project.' },
        { t: '**Completion report · PDF** marks the task complete and sends the date to the online sheet.', go: 'export', hl: '#doCompletion' },
      ] },

    { id: 'pat', aud: 'user', cat: 'PAT, defect cleanup and FAT', title: 'Record a PAT (defects as found)', kw: 'pat provisional acceptance defect deficiency punchlist major minor note md d n where photo add',
      steps: [
        { t: 'Make a project with task category **PAT** and fill its form details (Projects → **Project details**: location / site, vendor, representatives, inspection type and date).', go: 'projectDetails', hl: '#curMore' },
        { t: 'Record only the elements **with defects**: tap **Capture** and photograph **the defect itself**. The defect form opens with that photo as the as-found photo.', go: 'map', hl: '#captureBtn' },
        { t: 'Choose **Where**, the **Defect** (one or more), the category **Major (MD)**, **Minor (D)** or **Note (N)**, add notes, then **Add to punchlist**. A new PAT record cannot be saved without a defect.' },
        { t: 'More defects on the same element: **+ Add** under Deficiencies. Its pin turns **red** (open).' },
        { t: 'Who records: the admin company\'s inspectors, and the vendors too when the admin allows it.' },
      ] },
    { id: 'nodefects', aud: 'user', cat: 'PAT, defect cleanup and FAT', title: 'No defects found', kw: 'no defects none clean pass fat done site photo complete pat',
      steps: [
        { t: 'On a PAT with no defect recorded, Projects shows **✓ No defects found · complete the PAT (FAT done)**.', go: 'projects', hl: '#noDefBtn', when: 'It shows on a PAT that is not completed and has no defect yet.' },
        { t: 'Take the **site photo**: it is the evidence of the inspection (its GPS position, time and your name are kept). Choose the element if you like, then **Save**.' },
        { t: 'The PAT is completed and the FAT is recorded as done the same day: no defect cleanup or FAT is needed. The reports say *No deficiencies found*.' },
      ] },
    { id: 'patdone', aud: 'user', cat: 'PAT, defect cleanup and FAT', title: 'Complete and share the PAT', kw: 'complete lock pat share kmz send contractor cleanup start',
      steps: [
        { t: 'When every defect is recorded: Projects → **✓ Mark task complete** → **Complete and lock**. The PAT is locked; only the admin can reopen it.', go: 'projects', hl: '#doneBtn' },
        { t: 'Export → FORMAT **Deficiency List · PDF** for signing (see Reports and files).', go: 'export', hl: '#doPdf' },
        { t: '**Share PAT KMZ · for defect cleanup / FAT** sends it to the contractor (Viber, email, Drive…). Its G-eSAA data is locked: Google Earth shows the map, only G-eSAA phones of your list read the records.', go: 'projects', hl: '#sendPat', when: 'It shows on a PAT, defect cleanup or FAT project.' },
        { t: 'Or, on this phone: **🛠 Start the defect cleanup**.', go: 'projects', hl: '#startCleanup', when: 'It shows once the PAT is completed.' },
      ] },
    { id: 'cleanup', aud: 'user', cat: 'PAT, defect cleanup and FAT', title: 'Defect cleanup (contractor)', kw: 'cleanup rectify rectification fix photo of the fix fixed no photo comment next pin contractor shared file',
      steps: [
        { t: 'Projects → **📂 Open a shared file** → the PAT KMZ → **Start the defect cleanup**. The map opens on the PAT\'s pins with the first item to fix; the project takes the PAT\'s site, vendor and Globe representative.', go: 'projects', hl: '#openShared' },
        { t: 'Walk to each **red pin**: the strip above the bottom bar points to the nearest one. Tap it to open its card.' },
        { t: 'On each item: **📷 Photo of the fix** (or **Fixed, no photo**), and **💬 Comment** if needed. Every button saves at once. **Next pin ›** goes to the next nearest one.' },
        { t: 'When every item is fixed: Projects → **✓ Mark task complete**, then **Share cleanup KMZ · for the FAT**.', go: 'projects', hl: '#doneBtn' },
      ] },
    { id: 'fat', aud: 'user', cat: 'PAT, defect cleanup and FAT', title: 'FAT: verify the fixes', kw: 'fat final acceptance verify accept reject reason inspector check fix',
      steps: [
        { t: 'The FAT starts only from a **completed defect cleanup**: on this phone with **✓ Start the FAT from the completed cleanup**, or from the shared cleanup KMZ (Open a shared file → **Start the FAT**).', go: 'projects', hl: '#startFat', when: 'It shows once the defect cleanup is completed.' },
        { t: 'Walk to each pin: **✓ Accept**, **📷 Accept with photo**, or **✗ Reject** with the reason (the item goes back to open; the reason is kept and printed).' },
        { t: 'Then export the final **Deficiency List** (as found → rectified → verified photos in Annex A) and the **Rectification progress** report, and **✓ Mark task complete**.', go: 'export', hl: '#doPdf' },
      ] },
    { id: 'records', aud: 'user', cat: 'PAT, defect cleanup and FAT', title: 'Records, pins and statuses', kw: 'records list filter open rectified verified status colors red blue teal green timeline',
      steps: [
        { t: 'Tap **Records** (it is named after the task category).', go: 'map', hl: '#listBtn' },
        { t: 'Filter **All / Open / Rectified / Verified / No deficiency**, sort, and group by element; tap a group to open or close it.', go: 'records' },
        { t: 'Pin colours: **red** open deficiency, **blue** rectified and waiting for verification, **teal** all verified, **green** no deficiency.' },
        { t: 'Each item keeps its timeline: FOUND → RECTIFIED → VERIFIED, with who and when. A rejection keeps its reason.' },
      ] },

    { id: 'deflist', aud: 'user', cat: 'Reports and files', title: 'Deficiency List (PDF and Excel)', kw: 'deficiency list pdf excel form annex photos signature print office',
      steps: [
        { t: 'Export → FORMAT **Deficiency List · PDF**: the office form (PAT or FAT ticked, 15 items per page, signature blocks), then Annex A with the photo evidence of each item and Annex B with the inspection photo log.', go: 'export', hl: '#doPdf', when: 'It shows in a PAT, defect cleanup or FAT project.' },
        { t: '**Deficiency List · Excel**: the same form, editable, plus the punchlist table, the elements, the photo index and the people.', go: 'export', hl: '#doXlsx', when: 'It shows in a PAT, defect cleanup or FAT project.' },
        { t: '**Options** on each card: annexes, photo size, signature dates. The logos and header lines are set by your admin.' },
      ] },
    { id: 'kmzstamp', aud: 'user', cat: 'Reports and files', title: 'The KMZ inside every PDF', kw: 'kmz attached stamp pdf attachment paperclip sha-256 acrobat foxit firefox verify google earth',
      steps: [
        { t: 'Every PDF report (completion report, Deficiency List, rectification report) carries the KMZ of the same records, so the PDF can be compared with the map.' },
        { t: 'A small **KMZ ATTACHED** stamp at the **lower right of the first page** gives the file name and size, what it holds and its **SHA-256**.' },
        { t: 'To get the KMZ, open the PDF in **Adobe Acrobat Reader**, **Foxit** or **Firefox** and click the stamp, or open the attachments (paperclip) panel. Chrome, Edge and phone gallery viewers do not show attachments.' },
        { t: 'To check it is the same file, its SHA-256 must equal the one on the stamp (Windows: certutil -hashfile file.kmz SHA256; Mac: shasum -a 256 file.kmz).' },
      ] },
    { id: 'completion', aud: 'user', cat: 'Reports and files', title: 'Completion report and finishing a task', kw: 'completion report complete finish undo sheet date sign-off',
      steps: [
        { t: 'Export → FORMAT **Completion report · PDF**: page 1 says the task is complete (site, vendor, dates, what was recorded, sign-off); the photo pages follow.', go: 'export', hl: '#doCompletion' },
        { t: 'Making it marks the task complete, like Projects → **✓ Mark task complete**; the online sheet gets the date.', go: 'projects', hl: '#doneBtn' },
        { t: '**Undo complete** clears it again. A completed PAT is reopened only by the admin.' },
      ] },
    { id: 'share', aud: 'user', cat: 'Reports and files', title: 'Share, open and back up files', kw: 'share open shared file backup restore zip several projects colleague edited unauthorized tampered',
      steps: [
        { t: 'Projects → **📂 Open a shared file** opens a PAT or cleanup KMZ, a backup ZIP, or several projects from a colleague.', go: 'projects', hl: '#openShared' },
        { t: 'Projects → **📤 Share several projects** puts projects (with their photos) in one file for a colleague of your company.', go: 'projects', hl: '#bulkShareBtn', when: 'It shows when there are projects on this phone.' },
        { t: 'Export → FORMAT **Backup** → **Back up project** or **Restore backup**: everything in this project in one file.', go: 'export', hl: '#doBackup' },
        { t: '**⚠ KMZ edited by unauthorized personnel** means a locked KMZ was changed after it was shared (or damaged on the way): it is refused. Ask for the original file.' },
      ] },
    { id: 'delete', aud: 'user', cat: 'Reports and files', title: 'Delete a project', kw: 'delete remove project request code approval admin 6-digit',
      steps: [
        { t: 'Projects → **Project details** → **Delete this project…**. A project in progress is deleted once you confirm.', go: 'projectDetails', hl: '#delProject' },
        { t: 'A **completed** project needs an admin\'s approval: the app shows a **request code** (e.g. 674-8SC). Send it to your admin.' },
        { t: 'Type the admin\'s **6-digit approval code** (it works only for that request), or an admin who is with you types the admin PIN.' },
      ] },

    { id: 'fieldsettings', aud: 'user', cat: 'Settings', title: 'Camera and other settings', kw: 'settings camera id scan orientation button position left right sharpness exports stamps text size help',
      steps: [
        { t: 'Settings → **Camera**: scan the ID after each photo, the live ID reader, how IDs are painted, the camera button position (right, center or left hand) and the photo sharpness.', go: 'settings', hl: '#goCamera' },
        { t: 'Settings → **Exports and files**: photo sizes and stamps, KMZ, PDF and DXF defaults, where files are saved.', go: 'settings', hl: '#goExports' },
        { t: 'At the bottom of Settings: **Text size**, and keep the help text open on every screen.', go: 'settings' },
      ] },
    { id: 'offline', aud: 'user', cat: 'Settings', title: 'Offline maps', kw: 'offline map pack no signal download import pmtiles satellite street layer tiles',
      steps: [
        { t: 'Before going to a no-signal area, on Wi-Fi: Settings → **Maps** → Offline map packs: download your area\'s pack (from your admin\'s list) or **Import a pack file**.', go: 'settings', hl: '#goMaps' },
        { t: 'With no signal the map switches to it by itself. The **layer** button also cycles street → satellite → offline.', go: 'map', hl: '#layerBtn' },
        { t: 'Map tiles you viewed online are kept too; Settings → **Storage** shows how much space they use.', go: 'settings', hl: '#goStorage' },
      ] },
    { id: 'account', aud: 'user', cat: 'Settings', title: 'Invite a coworker, move phones, reset', kw: 'invite coworker qr link move phone new phone reset user change company',
      steps: [
        { t: 'Settings → **Invite a coworker (QR)**: a QR code and **Send the invite link** for someone of your company. The company key inside stays hidden; send it only inside your company.', go: 'settings', hl: '#inviteBtn', when: 'It shows when you joined with a company invite.' },
        { t: '**Move to another phone…**: one QR code or link with your company list and your details. Move projects and photos with Export → Back up project.', go: 'settings', hl: '#moveBtn' },
        { t: '**Reset user…** removes your name, company and key from this phone; projects and photos stay.', go: 'settings', hl: '#resetUser' },
      ] },
    { id: 'sync', aud: 'user', cat: 'Settings', title: 'The online sheet (sites and progress)', kw: 'online sheet google sync sites progress dates offline hourly manual',
      steps: [
        { t: 'Your sites come from the online Google Sheet, and the completion dates go back to it.' },
        { t: 'Settings → **Sync with the online sheet**: on every change (recommended), every hour, or only when you tap Sync. **Sync online sheet** reads it now.', go: 'settings', hl: '#syncModeBox', when: 'It shows when your company list has an online sheet.' },
        { t: 'Offline, the dates wait on the phone and are sent when you are back online.' },
      ] },
    { id: 'help', aud: 'user', cat: 'Settings', title: 'Problems and the app log', kw: 'problem error support log send refused photo slow',
      steps: [
        { t: 'Settings → **App log**: the errors and timings. **Send log** to your admin or support when something goes wrong.', go: 'settings', hl: '#goLog' },
        { t: 'A refused photo: check the GPS (green shutter), the light and the focus. Photos are taken live; in PAT, cleanup and FAT they must be taken within 1 km of the element.' },
      ] },

    /* ===================== ADMIN GUIDE (admin company only) ===================== */
    { id: 'adm-open', aud: 'admin', cat: 'Administration', title: 'Open Administration', kw: 'admin pin administration manage company list policies',
      steps: [
        { t: 'Settings → the **company list** row (under COMPANY LIST, with your list\'s name), or **Manage (admin)**, then type the **admin PIN**.', go: 'settings', hl: '#goAdmin' },
        { t: 'Everything there goes to every phone of the list when you tap **Save and share the list** at the bottom.' },
        { t: 'Staff of the admin company with the PIN are admins and inspectors. Use **Change the admin PIN** when someone leaves.' },
      ] },
    { id: 'adm-sheet', aud: 'admin', cat: 'Administration', title: 'Connect the online Google Sheet', kw: 'google sheet apps script deploy web app url read key admin key test connection project data region territory update script',
      steps: [
        { t: 'In the sheet: Extensions → Apps Script, paste **PoleCam-online-sheet.gs**, Save, Run **setup**, then Deploy → New deployment → Web app (Execute as: Me; Who has access: Anyone). Copy the URL ending in /exec.' },
        { t: 'Administration → **Online Google Sheet**: paste the **Web app URL**, the **Read key** (the sheet\'s Settings tab) and the **Admin key**, then **Test connection**.' },
        { t: 'Updating the script: paste the new code, Save, Run **setup** once, then Deploy → Manage deployments → Edit → Version: **New version**. Never New deployment: that changes the URL and phones stop reading the sheet.' },
        { t: 'The sites come from the **Project Data** tab (Tasks source tab). Its **Region** and **Territory** columns narrow what each user sees (script v2.25).' },
      ] },
    { id: 'adm-companies', aud: 'admin', cat: 'Administration', title: 'Companies, admin company and admin users', kw: 'companies vendors refresh admin company admin users email inspector',
      steps: [
        { t: 'Companies and vendors come only from the sheet\'s **Company List** / **Companies** tab: edit them there, then **Refresh from the sheet**.' },
        { t: '**Admin company**: its staff with the PIN are admins and inspectors; everyone else is a contractor user.' },
        { t: '**Admin users**: the email of each admin / inspector, one per line. Blank = anyone of the admin company with the PIN.' },
      ] },
    { id: 'adm-invite', aud: 'admin', cat: 'Administration', title: 'Invite a company\'s users (company keys)', kw: 'invite company key makecompanykeys first user qr link contractor join',
      steps: [
        { t: 'In the Apps Script editor run **makeCompanyKeys** once: each company gets a key in the CompanyKeys tab.' },
        { t: 'Administration → **Invite a company\'s users**: paste one company\'s key (the field hides it) → **Make the invite**. The sheet confirms whose key it is; a wrong key is refused.' },
        { t: 'Show the **QR code** or **Send the invite link** to that company\'s first user; they then invite their coworkers.' },
        { t: 'Users never see or type a key. Anyone who has an invite can join that company: to stop old invites, change the company\'s key in the sheet and make new ones.' },
      ] },
    { id: 'adm-logos', aud: 'admin', cat: 'Administration', title: 'Logos and form wording', kw: 'logo image header department line form wording signatory legend inspection types',
      steps: [
        { t: '**Deficiency List form and report logos** → **Choose image…** for the left and the right logo; **Built-in** puts the bundled one back. They print on the form and on the completion and rectification reports.' },
        { t: 'The header wording in the same group: company name, address, **Department line 1 and 2**, signatory titles, inspection types, legend and the rectified-date sub-label.' },
      ] },
    { id: 'adm-checklist', aud: 'admin', cat: 'Administration', title: 'Deficiency checklist', kw: 'checklist defects category add defect list items',
      steps: [
        { t: 'Choose a **Category** and edit its **Defects**, one per line.' },
        { t: '**Add category** for a new one (e.g. Manhole). A category with no defects left is removed when you save.' },
        { t: 'The changes reach every phone with the next list version.' },
      ] },
    { id: 'adm-standards', aud: 'admin', cat: 'Administration', title: 'Field standards and who records', kw: 'field standards maximum span angle pole prefixes vendors record sharpness',
      steps: [
        { t: '**Maximum span**, **Angle pole from (°)**, the gap limit of *Link in capture order*, and **Extra pole prefixes for everyone**.' },
        { t: '**Vendors record PAT defects and accept fixes at FAT**: on = vendors may record; off = only the admin company does.' },
        { t: '**Photo sharpness required**: Strict (recommended) or Normal.' },
      ] },
    { id: 'adm-kmz', aud: 'admin', cat: 'Administration', title: 'Shared KMZ lock', kw: 'kmz password lock shared protect tamper edited unauthorized google earth',
      steps: [
        { t: 'The G-eSAA data in the shared PAT, cleanup and FAT KMZ files is locked with the **KMZ password**; Google Earth still shows the map.' },
        { t: 'A random password is suggested: nobody types it, every phone gets it with the list. Do not put a company key in it.' },
        { t: 'A file changed outside G-eSAA is refused with **⚠ KMZ edited by unauthorized personnel**.' },
      ] },
    { id: 'adm-approve', aud: 'admin', cat: 'Administration', title: 'Approve a delete', kw: 'approve delete request code 6-digit approval completed project',
      steps: [
        { t: 'A user who deletes a completed project gets a **request code**.' },
        { t: 'Administration → **Approve a delete** → type the code → **Get code**, and give them the **6-digit approval code**. It works only for that request.' },
        { t: 'When you are with the user, type the admin PIN on their phone instead.' },
      ] },
    { id: 'adm-packs', aud: 'admin', cat: 'Administration', title: 'Offline map packs for everyone', kw: 'map packs pmtiles google drive offline link size',
      steps: [
        { t: 'Upload each .pmtiles map pack to Google Drive and share it as "Anyone with the link".' },
        { t: 'Administration → **Offline map packs**: one line per pack, *name | Drive link | size in MB*. Users see them under Maps once they take this list version.' },
      ] },
    { id: 'adm-save', aud: 'admin', cat: 'Administration', title: 'Save and share the list', kw: 'save share list version join link qr org.json tie website apk',
      steps: [
        { t: 'Tap **Save and share the list**: a new list version, signed with the admin PIN.' },
        { t: 'New phones join with the **join link or QR code**. Phones that already joined take new versions from the online sheet by themselves (with the Admin key set).' },
        { t: '**Tie the app to this list** → **Download org.json**, and put it next to index.html on the website (and in the APK build): new users can then only join this list.' },
      ] },
    { id: 'adm-inspect', aud: 'admin', cat: 'Administration', title: 'Inspecting as the admin company', kw: 'inspector verify accept reject reopen pat undo complete all sites',
      steps: [
        { t: 'Admin company users record PAT defects, verify the fixes at the FAT (**✓ Accept**, **📷 Accept with photo**, **✗ Reject**) and reopen a completed PAT (Projects → **Undo complete**).' },
        { t: 'Sites: the admin company sees every company\'s sites from the sheet, narrowed by your own regions and territories (Your details).', go: 'profile', hl: '#pfAreaBox' },
      ] },
  ];
  root.GESAA_TUTORIAL = { version: '2.25', topics: T };
})(typeof self !== 'undefined' ? self : this);
