# G-eSAA

**G-eSAA — Geo electronic Survey, Audit & Acceptance** (formerly *PoleCam Survey*): one field app that turns the paper and spreadsheet work of OSP **survey, audit and acceptance** into digital records — geotagged photos, pins checked against GPS, and the reports and drawings made from them.

Since v2.13 the name and icon are G-eSAA. Internal names stay *polecam* (phone storage, links, data files, the Android app ID), so phones and the APK update in place and keep every project.

Four task categories per project: **Survey** (As-plan or As-built), **PAT**, **Defect cleanup** and **FAT** (acceptance **List of Deficiencies** on the office form — see "Acceptance mode"). The category shows on the project button at the top right. One shareable **KMZ** carries the PAT to the contractor's cleanup and on to the FAT (v2.5).

**v2.0** — the Deficiency List exports are the office form (PDF and Excel) with photo annexes; deficiencies go through *found → rectified → verified*; the admin sets the company policies (admin company, form wording, checklist, field standards) inside the signed company list; the settings are split into what users set and what only the admin sets; every export has detailed options (photo size, stamps, KMZ icons, PDF annexes). See "What changed in v2.0".

One phone app that replaces GPS Camera + the Windows geolocator step:

1. **Capture** – take the pole photo inside the app; GPS is recorded at the shutter (green shutter = GPS ready).
2. **Scan the ID** – right after the photo, point the camera at the painted ID (pole, ODF or any other): the box finds the ID by itself, follows it like a face-detection box and reads it (v2.6). Pinch or tap 2× / 4× to zoom in on a high or far ID; tap the ID on screen if the box picks something else.
3. **Correct the pin** – drag the map under the slim pin until it sits on the pole; switch street / satellite / offline map while you do it.
4. **Pole ID + type** – Concrete (CC), Wood (WP), Steel (SP): IDs CC-0001, WP-0001, SP-0001; Globe (GT) and Bayantel (BT) poles keep the number painted on them (GT-88123); other owners (PLDT-, …) are added by the admin for everyone or with “+ Other prefix…” at the end of the Type dropdown on one phone. ODFs FDU_100. The next ID is suggested; duplicates are flagged.
5. **Export** –
   - **KMZ** for Google Earth: pins named by Pole ID, photo as the pin icon, photo in the balloon.
   - **DXF** for AutoCAD (v2.14): each pole a **circle** at **UTM Zone 51N (WGS84) meters** on its type layer (`POLE_CONCRETE`, `POLE_WOOD`, …; `_PROPOSED` / `_NEW`), its Pole ID beside it on `POLE_LABEL`, pole details on `POLE_DETAILS` and **its photo beside it** on `POINT_PHOTO`; the **linked route** on `CABLE_ROUTE` with the **FOC length** of each span (span + allowance, default 10 %) on `FOC_LENGTH`; optional OpenStreetMap road centerlines (`OSM_ROAD_MAJOR` / `MINOR` / `PATH`, road names on `ROAD_NAME`). With photos it is a ZIP: the DXF (AutoCAD 2000 format) and the JPEGs, kept in one folder. Without photos it is a plain DXF R12.
   - **CSV**: pole ID, type, lat/long, UTM E/N, GPS accuracy, pin-adjusted flag, time, surveyed by.
   - **Geotagged photos (ZIP)**: JPEGs named by Pole ID, stamped with ID/type/coordinates/time, GPS written into EXIF.
   - **Backup / Restore** of a whole project.

Photos cannot be imported (v1.7): every photo is taken live, so its location can be checked.

Works with no signal: the app and your points stay on the phone, and an **offline map pack** (from Google Drive or a file) shows streets with no internet.

---

## Install (free, no Play Store)

The app has to be served over HTTPS once so the phone can install it. GitHub Pages is free.

1. Create a GitHub repository (e.g. `polecam`) and upload **everything in this folder** (keep the `vendor/` and `icons/` folders).
2. Repository **Settings → Pages → Build and deployment → Source = GitHub Actions**, and add `.github/workflows/deploy-site.yml` (it publishes the app only, about 8 MB; map packs are not stored on GitHub Pages since v1.8).
   After the *Deploy website* run finishes it is live at `https://<your-username>.github.io/polecam/`.
3. On the Android phone open that link in **Chrome** → ⋮ menu → **Install app** (or *Add to Home screen*).
   It installs with its own icon and opens full-screen like a normal app.
4. First run: allow **Camera** and **Location** (choose *precise* location).

### Optional: a real .apk file
Go to **pwabuilder.com**, paste your GitHub Pages link → *Package for stores* → **Android** → download → install the APK on the phone (allow "Install unknown apps").
The APK opens the same hosted app, so keep the GitHub Pages site online.

---

## First use: your details and the company list

- On first use the app asks for **full name, mobile number, email and company**. They stay on the phone and are recorded on every photo, pole and deficiency (“Mark Tamse · Globe Telecom”) and printed on the reports. Change them in Settings → Account.
- **Company names come from the company list**, made once by the admin (first use → *Setting up PoleCam for a new organisation?*). One company on it is the **admin company** (e.g. Globe Telecom), protected by an **admin PIN** (v2.1):
  - Staff of the admin company choose it in their profile and enter the admin PIN once. From then on they are **admins and inspectors** on that phone: Settings → Company list → *Manage (admin)* (PIN asked again) edits companies, policies, the form wording and the checklist; in acceptance projects they add deficiencies and verify or reject rectifications.
  - Everyone else (contractors) chooses their own company and is a **user**: they see the list and its policies, take updates, and in acceptance projects they add rectified photos and mark items rectified.
  - Nobody can pick the admin company without the PIN, so keep it inside the admin company and change it (Manage → *Change the admin PIN*) when someone leaves; phones that take the new version then need the new PIN.
- **Joining (v2.9, v2.15):** Settings → Company list → *Share list* → **Send the join link** (Viber, Messenger, email), or let the user scan the QR code with the phone's own camera or in G-eSAA (*Join your team → Scan QR code*). Opening the link opens G-eSAA in the browser and joins the list; then the user chooses their company. In the APK: *Paste link* or *Scan QR code* on the first screen; a QR code received as a picture is read with *From a picture* in the scanner. **Since v2.15 lists are joined by link or QR code only** (no list files). Where the list is kept in the online sheet (Admin key entered), the QR code is a **short code** (about 50×50 dots instead of 140×140) that names the sheet and the list's key; the new phone downloads the list once (needs internet) and takes it only when it is that list, signed with that key. *Show the full code* gives the long QR code that joins without internet.
- **Updates (v2.9):** when the online sheet is connected and the sheet's **Admin key** is entered on the admin phone, every saved list version is also kept in the sheet, and each phone takes it by itself when it reads the sheet (on opening the app, at most every 10 minutes, or *Sync online sheet*). Without the sheet, updates go by join link or QR code.
- **How it stays trustworthy:** the list is signed with a key that travels inside it, encrypted with the admin PIN. A phone accepts a new version of its list only when it was made with that PIN (or, for lists from v1.x, by one of the admins named in it), and rejects a list edited by hand. Each list has a code (e.g. MV3H-EQCB) shown when joining; a different list needs *Switch list* and a warning.
- See **Who is admin, and one list for the whole organisation (v2.9)** below for admin users and tying the app to your list.
- Lists made with v1.7–v2.0 (per-person admin keys) keep working. Their admin opens *Manage (admin)* once, sets the admin PIN and saves; after that the admin-company model applies and the old “ask to become an admin” step is gone.

## Who is admin, and one list for the whole organisation (v2.9)

| Who | What they do |
|---|---|
| **Admin** (you) | Admin company (e.g. GLOBE) + admin PIN, and on the *Admin users* list. Makes and changes the list, sends the join link. |
| **Other admins / inspectors** | Only people you add: Manage → **Admin users** (one email per line), then they choose GLOBE in their profile and enter the PIN. |
| **Everyone else** | Joins with a **company invite** (QR code or link; v2.24: the company key itself is never shown) or with your join link. Records the PAT defects, the fixes and the FAT checks of their own projects (v2.10, see below). Cannot open Manage, cannot choose GLOBE. |

- **Admin users:** blank = anyone of the admin company with the PIN (as before). When you list emails, only those people can choose the admin company or open Manage, even with the PIN. Removing someone takes their admin rights away when their phone next reads the list. The admin who saves always stays on it. Change the PIN too when someone leaves (Manage → *Change the admin PIN*).
- **One list only (org.json):** Manage → **Tie the app to this list** → *Download org.json*, then upload `org.json` to the main folder of the GitHub repository (next to `index.html`). The website and the next APK build then carry it: new users only see *Join*, nobody can create another list in the app, and a join link or QR code of any other list is refused. To undo it, delete `org.json` from the repository. If you change the admin PIN twice, download org.json again and replace it (the admin screen reminds you).
- Without org.json, a new user could still make a list of their own on their own phone. It never changes your list, your sheet or other phones (they only take versions signed with your PIN), but it confuses people, so tie the app once your list is ready.
- **A phone that already has another list** (for example one made while testing): open your join link on it and tap *Switch*.

## Signing in with a company key (v2.10)

New users only open a **company invite** (QR code or link) and enter **name, mobile and email**. The invite carries the company key, which tells the online sheet which company they belong to; they never choose a company and never see the list of companies. **Since v2.24 the key is never shown in the app and cannot be typed**: it travels only inside invites, masked so it cannot be read off the link.

1. **Admin, once:** in the Apps Script editor run **makeCompanyKeys**. Each company gets a key such as `7KQ4-MX2P-9TRW` in the CompanyKeys tab (the admin company gets *Sees all tasks: Yes*).
2. **Admin:** Settings → Administration → **Invite a company's users** → paste that company's key from the CompanyKeys tab (the field hides it) → **Make the invite**. The sheet confirms whose key it is and the app shows **Invite to FADI** (QR code and *Send the invite link*). Send it only to the first person of that company.
3. **First user of a company:** scans the QR code with the phone camera or opens the link (or, in G-eSAA, *Scan invite QR* / *Paste invite link*) → enters name, mobile and email → **Save**. The phone joins your company list, its company is fixed (for example FADI), and only that company's sites appear. The profile shows *Joined FADI with its company key (hidden)*.
4. **Coworkers:** that user taps Settings → **Invite a coworker (QR)**: a QR code and *Send the invite link*. The coworker scans it or opens the link, enters name, mobile and email → Save.
- The key inside an invite is masked, not encrypted: it stops people reading or retyping it, but **anyone who has the invite can join that company**, so send it only to that company's people. To cut a company off, change its key in the CompanyKeys tab (old invites stop working) and make new invites.
- Invites made by v2.23 or older (`#ck=` links, the key readable) still work. The *Move to another phone* code carries the key masked too.
- The company cannot be changed on the phone. Settings → **Reset user…** removes the name, company and key (projects and photos stay) so another invite can be opened.
- Delete or change a company's key in the CompanyKeys tab to cut that company off; its phones then show "your company key no longer works".
- The website must be tied to your list with an org.json that carries the sheet address (download it again from Manage after updating to v2.10), so a new phone knows where to check the key. A phone that already has the list does not need it.
- Company names are shown only to admins (Manage). The sheet sends other users only their own company.
- Your admin phone (it holds the admin PIN) keeps choosing its company as before; it needs no key.

## The process: Survey → PAT → Defect cleanup → FAT (v2.5)

**Projects screen** (tap the project name on the top bar), a task list since v2.22:
- **The open project** at the top: category, state (*Not started*, *In progress*, *Completed*), progress (*2 of 5 steps done* — tap it to show the steps), the **Next** button, the stage buttons of a PAT / cleanup (*Start the defect cleanup*, *Start the FAT*, *Share … KMZ*), **Mark task complete**, and **Project details** (folded: rename, purpose, KMZ reference, remarks / notes, the form details of a PAT / FAT, delete).
- **Other projects** below: one card each with its category, progress and next step; filter *In progress / Completed / All* and by category, search by name, site, vendor, task ID or notes. Tap a card to open that project.
- **+ New project** (top right): a short form, see below. **Open a shared file** and **Share several projects** are at the bottom.

**New project form (v2.11)**

| Field | What to put |
|---|---|
| **Site** | Tap **Choose a site…** to pick one of your company's sites from the online sheet (search by site, PLA ID, serial number or vendor), or leave it and type a name. Each site is listed as `Territory_Project Name_Serial Number_PLA ID_Site Name`, e.g. `T7_KV_TRS-PSOW26-KV-0011_MIN2463_TCFGACGRANDAVAODDS`, with the vendors and your part under it. |
| **Task category** | Not preselected: choose Survey, PAT, Defect Cleanup or FAT. Categories that are not your part of the site are greyed out. |
| **Purpose** | Only the purposes of the chosen category: **Survey** → As-Plan Creation, As-Built Creation, Audit · **PAT** → PAT · **Defect Cleanup** → Defect Rectification · **FAT** → FAT. On a site with two vendors in OSP VENDOR (e.g. `NOKIA , HUAXIN`) the **first** vendor gets only the **As-Plan survey**; the **others** get As-Built, Audit, PAT, Defect Cleanup and FAT. A site with one vendor, and the admin company, get everything. |
| **Survey start date** | Survey only: today, or the day the survey starts. It goes to *Survey Start Date* in the online sheet (As-Plan surveys); change it later under Project details and the sheet follows. |
| **Project name** | Filled in from the site: `CATEGORY_Project Name_Serial Number_PLA ID_Site Name`, e.g. `SURVEY_KV_TRS-PSOW26-KV-0011_MIN2463_TCFGACGRANDAVAODDS` (category codes SURVEY, PAT, CLEANUP, FAT). You can edit it. |
| **Vendor (contractor)** | Your company (from the site's OSP VENDOR), not editable. |
| **Location / site** | `Serial Number_PLA ID_Site Name`, e.g. `TRS-PSOW26-KV-0011_MIN2463_TCFGACGRANDAVAODDS`. |
| **Contractor representative** | You (PAT, cleanup, FAT): printed as *Endorsed by*. |
| **Globe representative** | Optional: printed as *Accepted by* when given. |
| **Inspection type** | All ticked (blue); untick what does not apply. |
| **Inspection date** | Today, or the date you set. |
| **KMZ** | Survey / PAT: the **KMZ reference** (HLD route, homing, POI), optional. Defect Cleanup: the **PAT KMZ** (required). FAT: the **PAT / cleanup KMZ** (without it the FAT starts empty). For Cleanup / FAT with a KMZ the name may stay blank: it comes from the KMZ. |
| **Remarks / notes** | Optional; kept with the project (Project details). |

**Finishing a task (v2.11).** The last workflow step of every category is **Complete the task**: Export → **Completion report** (page 1 says the task is complete, with site, vendor, dates, what was recorded and the sign-off boxes; the photo pages follow, see below), or Projects → **✓ Mark task complete**. Either one records today as the completion date and sends it to the online sheet (see "Progress written to the sheet"). *Undo complete* clears it again.

| Stage | Who | Steps (the app ticks them off) |
|---|---|---|
| **Survey** (As-plan or As-built) | survey team / contractor | Optional: load the **HLD KMZ** (route, homing, POI) as a reference · 1 Capture the poles (photo → ID scan → pin check; *No tag → NPT* for untagged poles) · 2 Link the route (follow the HLD or reroute where it is not doable) · 3 Export for design (KMZ, DXF, CSV, photos; file names carry ASPLAN / ASBUILT) · 4 Back up |
| **PAT** (provisional acceptance) | contractor (construction vendor), Globe representative signs | 1 Form details · 2 **Record the defects**: only the elements with defects, each tagged N, D or MD. Photograph **the defect itself**, not the pole or ODF (v2.13): the photo becomes the as-found photo of the defect form that opens with it; a new PAT record cannot be saved without a defect · 3 Export the Deficiency List · 4 **Share the PAT KMZ** with the contractor |
| **Defect cleanup** | contractor | 1 Open the PAT KMZ (Projects → **+ New project** → Defect Cleanup → PAT KMZ) · 2 Walk to each red pin: tap it → **📷 Photo of the fix** (or *Fixed, no photo*), **💬 Comment** · 3 **Share the cleanup KMZ** for the FAT |
| **FAT** (final acceptance) | contractor, Globe representative signs | 1 Open the cleanup KMZ (or the PAT KMZ) · 2 Walk to each pin: **✓ Accept**, **📷 Accept with photo** or **✗ Reject** with a reason · 3 Export the final Deficiency List (as found → fixed → checked photos in Annex A) and the rectification report |

**Walking the pins (cleanup and FAT).** The map shows the pins and your position. The strip above the bottom bar always points to the nearest pin that still needs you (*Next: CC-0012 · 85 m NE of you*); tap it, or tap any pin, to open its card: the as-found photo, each item with its status, and big buttons. Every button saves at once; there is no separate Save. *Next pin ›* jumps to the next nearest one; *Open full record* opens the full editor.

Rows of the online sheet appear in the New project form under **Project name ▾**: picking one fills the name, the category (when the row has one), site, vendor, notes and Drive folder, so a field user only taps **Create project** and follows the checklist.

## Field use

- **Projects = survey areas.** Create one project per area/job (top bar → project name). Each project keeps its own poles, photos, Pole ID numbering, exports, backups and offline maps; nothing from one survey shows up in another. You can rename or delete a project there too.
- **Taking a photo:** the shutter is **green** when the GPS updated within the last 5 seconds and **red** when the GPS is old, off or blocked. A red shutter still tries for 5 seconds, then refuses the photo. After the photo is kept, the app asks you to scan the ID (Skip if there is none); the ID button at the top right turns this step off.
- **Offline map (before going to a no-signal area):** tap the cloud button on the map → **Download** the pack for your area (Android app, from Google Drive) or **Import a pack file** you already have, on Wi-Fi (see "Offline map packs" below). With no signal the map switches to it by itself; the layer button also cycles Street → Satellite → Offline.
- GPS pill colors: green ≤ 5 m, amber ≤ 15 m, red > 15 m. Wait for green when you can.
- *Reset to GPS* puts the pin back on the raw GPS fix. Points you moved are tagged **pin adjusted**.
- Tap any pole on the map or in *Points* to edit it, replace the photo, or delete it.
- Use one **project** per job/area; exports and backups cover the current project.

## Acceptance mode (PAT / FAT)

Create a project with task category **PAT** (Projects → **+ New project** → Task category), or pick a PAT row from the online sheet in that form. The project button at the top right shows SURVEY, PAT or FAT, and the list button at the bottom is named after it. Choose **FAT** directly only when the PAT records are not on this phone; otherwise open the PAT project and use *Start FAT from this PAT*, or *Start FAT from a PAT file* sent from another phone.

**Who does what.** The **admin company** on the company list (e.g. Globe Telecom) supplies the **inspectors**: its staff (admin PIN) add deficiencies, verify rectifications or reject them. Users of every other company (the contractors) only add *rectified* photos and mark items rectified. With no admin company set, everyone may do everything.

**Recording (one record per location)**
- Element: **Pole**, **ODF**, **ODC** or **Rack**, with its ID (numbering continues per element type in the project: CC-/WP-/SP- for poles by type, FDU_ for ODFs).
- Pole: *With MLoop*, *With NAP* + NAP ID, *With closure* + closure ID. ODF: *New* or *Existing*.
- Several photos per element (Overview, Pole tag, MLoop, NAP, Closure, …) — tap **+ Add photo**, set each label under the picture.
- **+ Add deficiency** (inspectors): pick where (Pole, Cable/strand, MLoop, NAP, Closure, ODF, ODC, Rack, Other), tick one or more defects in the **Defect** dropdown (v2.15), set **Major (MD)**, **Minor (D)** or **Note (N)** — the codes printed on the form — add notes and the *as found* photo. The checklist is set by the admin for everyone.
- Each item shows its timeline: **FOUND** (when, by whom, stage) → **RECTIFIED** (contractor's after photo, or marked rectified without one) → **VERIFIED** (inspector, with or without a verification photo). *Reject* sends an item back to Open with the reason, which is kept and printed.
- Map pins: red = open deficiency, blue = rectified awaiting verification, teal = all verified, green = no deficiency. The strip above the navigation bar shows the project totals; the Records screen has the same figures and a filter for each status.

**Projects → Project details** holds what prints on the form: *Location/site*, *Vendor (contractor)*, *Contractor representative* (endorses the list), *Globe representative* (accepts it), *Inspected by*, the *inspection type* boxes ticked on the form and the *inspection date*.

**FAT**: on a PAT project tap **Start FAT from this PAT**. It copies every element and its deficiency list into a new FAT project (the PAT stays as it was). Contractors add the rectified photo (**After photo**) or **Mark rectified**; inspectors **Verify** / **Verify with photo** / **Reject**. New deficiencies found at FAT can be added too.

**Acceptance exports** (Export screen; each card has its options under *Options*, defaults under Settings → Exports and files)
- **Deficiency List · PDF** — page 1…n is the office form: logos, company header, PAT or FAT box ticked, inspection types, Location / Project / Vendor / Date, 15 numbered items per page (code MD / D / N, item text, rectified date), legend, ENDORSED BY (contractor representative) and ACCEPTED BY (Globe representative) with dates left blank for signing or prefilled. Then **Annex A** — one block per item with its three photos *AS FOUND (PAT) · RECTIFIED (CONTRACTOR) · VERIFIED (FAT)*, each captioned with time, GPS, distance from the pin and who took it; a stage not done yet shows *Pending*, a missing photo shows *No photo* — and **Annex B**, the inspection photo log (every element photo). Options: annexes on/off, photo size S/M/L, signature dates. Letter size, like the template.
- **Deficiency List · Excel** — sheet 1 is the same form laid out like the office template (one block per page, logos as pictures, prints one page per 15 items, editable); then *Punchlist* (flat tracker table: code, status, found/rectified/verified dates and names, rejections, remarks, coordinates, photo file names), *Elements*, *Photos* (index of every photo file with time, GPS and distance from the pin) and *People*. Options: table sheets on/off, photo index on/off.
- **Rectification report · PDF** — progress of the contractor's rectification (below).
- **KMZ** — pins by status in folders *With open deficiency / Rectified · awaiting verification / All verified / Passed*, details and photos in each balloon. Options: balloon photo size, photo pin icons (bordered in the status colour) or status dots, stamps.
- **CSV** — the Punchlist table.
- **Photos ZIP** — file names match the Excel/PDF (e.g. `MKP-0001_1_Overview.jpg`, `MKP-0001_item3_asfound.jpg`, `MKP-0001_item3_rectified.jpg`, `MKP-0001_item3_verified.jpg`).

The logos printed on the form (and, since v2.23, at the top of the completion and rectification reports) are uploaded by the admin: Settings → Administration → *Deficiency List form and report logos* → **Choose image…** (left and right); they travel with the company list. Without an uploaded logo, `brand/logo-left.jpg` / `brand/logo-right.jpg` of the app folder are used. The header wording (company, address, **Department line 1 and 2**, signatory titles, inspection types, legend) is set by the admin in the same group and travels with the company list.

PAT and FAT share photos, so deleting one project never removes photos the other still uses.

## Location and photo integrity

- **Pin limit:** the pin can be dragged at most **1 km** from where the photo was taken (orange dashed circle in the editor). Dragging past it snaps the pin back to the edge. Applies to survey and acceptance.
- **All projects (v1.7):** photos must be taken **live**. There is no import; a photo from the phone camera app (fallback) is refused if it is more than 2 minutes old; every photo needs a GPS update from within 5 seconds of the shutter.
- **Acceptance projects:**
  - Extra photos, defect photos and **after photos must be taken within 1 km of the element**. A vendor who is elsewhere gets "Photo not used: you are 3.00 km from MKP-0001".
  - Every photo records its **time, GPS position and the user's name** (Settings → *You*). These print on the reports and are burned into exported photos.
- Limits: a web app cannot detect fake-GPS (mock location) apps or a phone clock that was changed by hand. Check the "distance from pin" and times in the report for anything that looks off.

## Rectification report (PDF)

Export → *Rectification report*. Generated from the project data, nothing to fill in:
- Summary: deficiencies, rectified, of which verified, still open, % cleared, average time to rectify.
- Items marked rectified **without an after photo** are called out in red.
- Progress by date (items rectified per day, cumulative, % cleared).
- Each rectified item: BEFORE (defect) and AFTER photos side by side, each stamped and captioned with time taken, GPS, distance from the pin and who took it; time to rectify; remarks.
- Items still open with their defect photo and how long they have been open.
- Sign-off: contractor representative, Globe representative, noted by.

The Excel/CSV punchlist also has *Days to rectify*, *Rectified by*, *Date verified*, *Verified by*, *Rejections* and, for each photo, when it was taken and how far from the pin.

**Vendor hand-off:** Globe makes a Backup of the PAT/FAT project → sends the ZIP to the vendor → vendor Restores it on their phone, sets their name, takes after photos at each site → makes a Backup → sends it back → Globe Restores it and exports the rectification report.

## Faster ID reading and the camera button (v2.9)

- **Aim at the ID straight after the photo:** the photo check (blur, dark) now runs while you aim at the ID. A photo that fails the check is still refused, with the reason, before anything is saved.
- **One clear reading is enough:** a known ID (CC-, WP-, SP-, FDU_ … with every digit read) at 85% or more is used at once. Less sure readings still need the same ID twice. Vertical IDs keep the reading way that worked last time.
- The text reader is loaded when the camera opens, so the first ID of the day does not wait for it.
- Measured here on the sample pictures with the processor slowed 4×: from the ID step opening to the editor, 3.0–8.7 s before and 1.2–4.7 s now (the stacked sample was also misread as CC-0047 before; it now reads CC-0457). Phones differ: the App log now records *reads* and *ms* for each ID, so send it if it still feels slow.
- **Camera button position:** Settings → Camera → *Position*: Center (default since v2.10), Right or Left, for the capture button on the map and the shutter in the camera.

## Camera checks, Pole ID reading, route (v1.5)

**Camera checks**
- A photo is kept only if a GPS update arrived within **5 seconds** of the shutter (always on since v1.7). The camera's GPS pill shows how old the last fix is ("now", "3 s ago") and the shutter turns red after 5 s.
- Every photo is checked: **dark, blank (no picture detail), overexposed or blurry photos are refused** and must be retaken; there is no *Use anyway* (v1.7). *Strict* (default) needs readable detail; *Normal* refuses only clearly blurry photos. The thresholds were set on test images, not yet on a range of real phone photos: if good photos get refused in the field, switch to Normal and report it.
- With the phone's own camera app (fallback), the GPS check uses the fix taken right after you return to PoleCam.

**Reading the painted Pole ID (offline)**
- **Picture first, then the ID (v1.7):** after the photo is kept, a guide box appears. Get close to the painted ID, fit it in the box and tap the shutter, or swipe along the ID to mark it (v2.17), or read it from the photo with the picture button (v2.17). The box turns by itself for a tag painted downwards (v2.16); **⇆ Horizontal** or **⇅ Vertical** (characters stacked top to bottom, or the whole ID turned sideways) fixes it for that scan, and the app remembers the last direction. It reads the ID on the phone (Tesseract OCR, or ML Kit in the APK; no internet).
- Readings are matched to your formats: CC-/WP-/SP- pole IDs (4 digits), GT-/BT- and any added prefix (number as painted) and FDU_ ODF IDs, e.g. "CCO457" becomes CC-0457, and the pole type (or ODF element) is set from the prefix. The field is filled when the reading is at least 55% sure in a known format (80% otherwise); other readings appear as buttons. Always check the result before saving; faded or hand-painted IDs may not read.
- **Scan ID** next to the ID field opens the camera just to read an ID again.

**Route and spans (survey projects)**
- Tap the **route button** on the map. *Link in capture order* connects poles in the order you surveyed them (skipping gaps longer than the setting). Then tap a pole and the next pole to add a span, or tap a linked pair to remove it (for branches and corners). *Undo* and *Clear* are there too.
- Spans show their length; spans longer than the maximum are red and dashed. Angle poles (orange ring, deflection shown on the label) and junctions (purple ring) are marked. The admin sets the maximum span (200 m), the angle-pole threshold and the auto-link gap under Settings → Administration → *Field standards* (they travel with the company list).
- Exports: DXF gets layers **CABLE_ROUTE**, **SPAN_LONG** and **SPAN_LENGTH**; KMZ gets a *Route* folder; **Route and spans · Excel** gives a Summary, every span and every pole's role (terminal, inline, angle, junction, not linked) with its deflection angle. Span lengths are straight pin-to-pin distances, not cable lengths.

**Where saved files go (Android app)**
- Settings → Exports and files → *Where saved files go*: Documents or Download, a folder name, and optionally one folder per project. Projects themselves stay in the app's private storage.

## Settings: user and admin (v2.0)

Settings is one screen: **Account** (your details), **Field work** (Camera, Exports and files, Offline maps), **Data** (Storage) and **Administration**.

| Users set (per phone) | Admin sets (for everyone, inside the signed company list) |
|---|---|
| Name, mobile, email, company | List name, companies/vendors (from the online sheet, v2.23), the **admin company** and its **admin PIN** |
| Camera: ID scan after each photo, horizontal/vertical IDs | Photo sharpness check (strict/normal) — until a phone has a list, the user chooses |
| Export defaults: photo size and JPEG quality, caption stamp and its fields, file naming; KMZ balloon size, pin icons, route, stamps; PDF annexes and photo size; DXF symbol/label/zone; where files are saved | Deficiency List form wording: company, address, department lines, signatory titles, inspection types, legend, rectified-date sub-label |
| Offline map packs | Deficiency checklist (defects per category) |
| | Field standards: maximum span, angle-pole threshold, auto-link gap |
| | Online Google Sheet address and keys |

Users open the Company list row to **view** the policies. Admin-company staff edit them under *Manage (admin)* (admin PIN), save, and share the new list version; phones apply the policies when they take the update. The *About* box shows which policies this phone is using, and has a switch to keep the help text open on every screen (by default each screen folds its explanations behind an “i · Help” link).

**Photos for AI training**
- Export → *Photos for AI training*: your labeled photos sorted into one folder per type with a labels.csv, for teaching the app later to recognise poles, NAPs, closures, ODFs, etc. Aim for 200+ photos per type.

## Online street map (v2.1)

The street map comes from a free tile server: **OpenStreetMap** first, and when it stops answering the app moves on to **CARTO Voyager**, then **Esri World Street Map** (all OpenStreetMap-based, all free with attribution; Google Maps needs a billing account and is not used). At most six tiles are requested at a time with a 20-second limit and one retry, so a weak signal no longer leaves the map blank; tiles already seen are kept on the phone for 7 days and shown even when a server fails. The APK fetches tiles through Android itself (identified as `PoleCam/<version>`), because OpenStreetMap refuses requests from the APK's `localhost` page.

If the map still stays blank: **Maps** (cloud button on the map, or Settings → Maps) → **Test map servers** shows which servers answer from this phone and network; the **Map server** choice pins one of them (some networks block one host but not another). With no signal, get an offline map pack.

## Offline map packs

**How to make one: see `MAP-PACKS.md`** — QGIS plugin (`polecam_mappack.zip`, cuts the area shown in QGIS), GitHub Actions, or the `pmtiles` command line — then Google Drive and the MapPacks tab.

- **What a pack is:** one `.pmtiles` file of street map data (OpenStreetMap, ODbL) for a whole area, from the free Protomaps build. Streets, road names, buildings, water and places, drawn on the phone at any zoom. Mindanao mainland is about 200 MB.
- **Where packs live:** in your **Google Drive**, not on GitHub. Upload the file and set sharing to *Anyone with the link*. The **admin** enters the links in the app: Settings → Administration → Manage → **Offline map packs** (one line per pack: name | Drive link | size in MB), then *Save and share the list*. Users see the packs under Maps after they take that list version, or after **Refresh list** when the online sheet is connected. With a company list, users cannot add links themselves (only phones without a list, and admins, see *Add a Google Drive link*).
- **Getting it on the phone:**
  - **Android app:** Offline map → **Download**. The app fetches the file from Drive in 4 MB pieces and can **Resume** after a dropped connection. **Cancel** stops at once.
  - **Any phone:** download the file (Drive app, browser, USB, Viber…) and use **Import a pack file**. The website version can only do this, because browsers cannot read Drive files directly.
  - The pack is kept in the app's private file storage (OPFS), or in its database on phones without OPFS. Every storage step has a time limit, so a stuck phone shows a message instead of freezing.
- **Making the pack files:** `MAP-PACKS.md` has the three ways (QGIS plugin, GitHub Actions, command line).
- Packs published on the website by v1.6–v1.7 are no longer made; packs already on phones keep working.
- **Satellite** has no offline version and is not kept on the phone: Esri allows offline imagery only in its own ArcGIS apps. Street map tiles you viewed online are kept for 7 days and can be cleared under *Map tiles you have viewed*.

## Online Google Sheet: companies, tasks, map packs (v1.8)

The admin keeps three lists in a Google Sheet on their own account; phones read it when online and keep a copy for use without signal. **Photos, poles and punchlists never go to the sheet.**

| Tab | What it holds |
|---|---|
| **Companies** | One company per row. Replaces the in-app list once a phone has read the sheet. |
| **Tasks** | Task ID (filled in automatically), project name, category **Survey / PAT / Defect cleanup / FAT**, site, contractor, Globe representative, *for company* (blank = everyone), status *Active/Closed*, notes. |
| **MapPacks** | Name, Google Drive link, size in MB, notes. Since v2.5 the admin types the packs in the app (Administration → Offline map packs); with the Admin key on the admin's phone, saving the list rewrites this tab (update the Apps Script: Deploy → Manage deployments → Edit → New version). |
| **Settings** | List name, **Read key** (phones), **Admin key** (admins only), who sees which tasks, and where tasks come from (see "Tasks from your own database"). |
| **CompanyKeys** | Optional (v2.6): one key per company for a strict split of the tasks. Empty = not used. |

**Setup (admin, once):**
1. Make a Google Sheet, open **Extensions → Apps Script**, paste `PoleCam-online-sheet.gs`, save, choose **setup** and **Run** (allow the permissions).
2. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone* → **Deploy**, copy the URL ending in `/exec`.
3. In PoleCam: Settings → Administration → **Manage (admin)** → *Online Google Sheet*: paste the URL and the Read key (from the Settings tab), **Test connection**, then **Save and share the list**. Enter the Admin key on your own phone too (needed to read all the companies when the sheet uses company keys), then **Refresh from the sheet** under *Companies and vendors*.
4. Phones get the sheet address with the next list update (join link or QR code). Anyone with the URL and Read key can read the three lists, so treat them like a password.

**On the phones:** Projects → **+ New project** → *Project name* **▾** lists the open rows for the user's company (admins see all). Picking one fills the project with its category, site and contractor; for a Defect Cleanup or FAT choose the KMZ in the same form. Settings → Administration shows when the sheet was last read, with *Sync online sheet*.

### Updating the script (needed for v2.5 map packs, the Defect cleanup category, v2.6 company filtering, v2.9 list updates through the sheet, v2.10 company keys, v2.11 progress dates, v2.25 Region / Territory, v2.27 no sites without them and v2.28 Admin users / KMZ password)

1. Open the online Google Sheet → **Extensions → Apps Script**.
2. Click in the code (`Code.gs`), select all (Ctrl+A), delete, paste the whole new `PoleCam-online-sheet.gs`, **Save** (Ctrl+S).
3. In the function list at the top choose **setup** → **Run**. If Google asks, **Review permissions** → your account → *Advanced* → *Go to … (unsafe)* → **Allow** (it is your own script). It only adds the new Settings rows, the CompanyKeys tab and (v2.11) the missing progress columns at the end of the Project Data header; nothing is deleted.
4. **Deploy → Manage deployments** → pencil (**Edit**) on the existing Web app → *Version*: **New version** → **Deploy**. The URL stays the same, so the phones keep reading it. (Do not use *New deployment*: that makes a new URL.)
5. On the admin phone: Settings → **Sync online sheet**. The line under it shows the tasks and map packs read.

### Your sheet layout: Project Data + Company List (v2.7)

The script works directly on a sheet laid out like *PoleSurvey_Camera*:

| Tab | Columns (row 1) | Used as |
|---|---|---|
| **Project Data** | OSP Build ID · Region · Territory · Project Name · Serial Number · PLA ID · SearchRing Name/Site Name/Segment Name · OSP VENDOR · Gdrive Link | one row = one site. OSP Build ID = site ID, SearchRing/Site/Segment Name + PLA ID = the PoleCam project name, OSP VENDOR = which companies see it (several vendors separated by commas each get it), Gdrive Link = the *Project folder* button; Region, Territory, Project Name and Serial Number are shown with the site |
| **Company List** | Company name · Authorization | the companies users choose from; **ADMIN** (e.g. GLOBE) sees every site, **USER** only its own |

Paste the script into that spreadsheet and run **setup**: it finds the two tabs by themselves (Settings → *Tasks source tab* = Project Data, *Companies tab* = Company List) and adds only Settings, MapPacks and CompanyKeys. Run **testSource** to check: for the sample, NOKIA gets 2 sites, HUAXIN 2, COMTEL 1, FADI 1, GLOBE all 5.

**In the app:** Projects → **+ New project** → tap *Project name* (or **▾**): your company's sites are listed; type to filter, tap one (the name, vendor, IDs and Drive folder fill in), or type any other name. A company with no site listed sees *No site listed for you: type a name*, so it can work without the sheet. A site already on the phone shows *on this phone* and an *Open* button. The chosen site's details show under Projects → Project details, with *Project folder (Drive)*.

**Admin company:** in the company list (Administration) choose the same name as the ADMIN row of the Company List (e.g. GLOBE), so its staff get inspector rights with the admin PIN. Being ADMIN in the sheet only decides which sites a phone sees.

### Progress written to the sheet (v2.11)

The phones write four dates back to the site's row in **Project Data**, and the **Status** column works them out:

| Column | Filled in when |
|---|---|
| **Survey Start Date** | an As-Plan survey project is created for the site (the start date in the form), and again whenever the start date is changed |
| **Survey Completion Date** | that survey's completion report is exported or it is marked complete |
| **PAT Date** | the PAT's completion report is exported or it is marked complete |
| **FAT Date** | the FAT's completion report is exported or it is marked complete |
| **Status** | formula: **FAT Done** (FAT Date filled) → **PAT Done** (PAT Date) → **LLD Creation** (Survey Completion Date) → **Ongoing Survey** (start date today or earlier) → **For Survey** (no start date, or one in the future) |

- *Undo complete* clears the date again. Defect Cleanup, As-Built and Audit tasks write no date.
- **setup** (or **addProgressColumns**) adds the columns that are missing at the end of the header row and puts the Status formula in every row whose Status is empty; rows that get a date also get the formula. To keep your own Status values instead, type `-` in Settings → **Column: Status** (the script then neither reads nor writes that column); the same works for any of the four date columns.
- Only a phone with a **company key** can write, and only to rows of its own company (the key with *Sees all tasks: Yes*, or the Admin key, can write any row). Without a signal the dates wait on the phone: the **Sync** button on the top bar shows an orange dot until they are sent, and tapping it sends them and reads the sheet again.

### Tasks from your own database, filtered by company (v2.6)

Instead of typing tasks in the Tasks tab, the sheet can read them from your own tracker spreadsheet and send each company only its own rows.

1. **Settings tab → Tasks source**: paste the URL of the tracker spreadsheet; **Tasks source tab**: its tab name; **Header row**: the row with the column headers (1 if the headers are in the first row). The Google account that deployed the script must be able to open the tracker.
2. **Column: …** rows: type the header of each column as it is written in the tracker, at least **Column: Project** (the site / cluster / project name that becomes the PoleCam project). Leave a row blank to let the script guess (it knows common names such as Site Name, Vendor, Contractor, Status, Remarks) or type `-` to leave a column out. **Column: Company** is the column that says which company the row belongs to (usually the vendor/contractor column; when blank, the Contractor column is used).
3. Optional: **Only rows where** (e.g. `Region = MIN`), **Default category** (when the tracker has no Survey/PAT/FAT column), **Closed statuses** (rows whose status starts with these are not sent, e.g. Accepted, Closed).
4. **Companies that see all tasks**: the admin company, e.g. `Globe Telecom`. Its users get every task; every other company gets only its rows (and rows with no company, unless *Blank company = everyone* is No). Company names match without case, punctuation or Inc./Corp. endings, so "ABC BUILDERS, INC" and "ABC Builders Inc." are the same company.
5. In the Apps Script editor choose **testSource** → **Run** → *Execution log*: it lists the columns it found, how many rows were read and skipped, and how many tasks each company gets. Fix the Column rows until it looks right. Changes reach the phones within 5 minutes (the script keeps a copy for 5 minutes so a large tracker is not re-read on every request).
6. **Strict split (optional):** without keys, each phone reports its own company, so someone who has the Read key and changes the app could ask for another company's rows. For a strict split choose **makeCompanyKeys** → **Run**: every company in the Companies tab gets a key in the CompanyKeys tab (the admin company gets *Sees all tasks: Yes*). Then make each company's invite in Administration → **Invite a company's users** (v2.24: users never see or type the key; they join with the invite QR code or link). From then on a phone without the right key gets no tasks, and phones older than v2.6 get none either. Delete a row's key to cut a company off.

Only the task fields (task ID, project, category, site, contractor, company, Globe representative, notes) go to the phones; other tracker columns never leave Google.

**Company names (admin, v2.23):** the companies come only from the online sheet's *Company List* / *Companies* tab: type or paste them there (one per row), then in Administration tap **Refresh from the sheet** and **Save and share the list**. The in-app Add and CSV import were removed.

## The shareable KMZ: PAT → defect cleanup → FAT (v2.5)

On the PAT phone: Projects → (PAT project) → *Project details* → **Share the PAT KMZ** (or the workflow's *Next* button). It is one `.kmz` file: Google Earth shows the defect pins with their photos (open it on a PC to review), and PoleCam reads the records and the original photos stored inside it (folder `polecam/`, ignored by Google Earth). Send it by Viber, Drive, email or USB.

- **Quickest (v2.19):** tap the received KMZ in Viber / WhatsApp / Files → **Open with** (or **Share**) → **G-eSAA** (Android app), or in G-eSAA **Projects → 📂 Open a shared file**. G-eSAA sees whether it is a PAT or a cleanup and offers *Start the defect cleanup* / *Start the FAT*; the New project form opens filled, tap **Create**.
- **Contractor:** Projects → **+ New project** → category **Defect Cleanup** → **Choose KMZ…** (the PAT KMZ) → **Create project** → walk the pins and photo each fix → **Share the cleanup KMZ**.
- **Inspector:** Projects → **+ New project** → category **FAT** → **Choose KMZ…** (the PAT or cleanup KMZ) → **Create project** → accept or reject each fix → export the final Deficiency List.
- The KMZ from Export → *Google Earth · KMZ* carries the same data unless *Include the PoleCam data* is unticked under its options (for a smaller file only for Google Earth).
- On one phone, *Start FAT from this PAT / cleanup on this phone* does the same without a file. PAT files (ZIP) from v1.8–v2.4 still open.
- Picking an online row with category *Defect cleanup* or *FAT* sets that category; choose the KMZ in the same form.

## AutoCAD

- **On the company plan template (v2.30):** Export → AutoCAD · DXF → DRAWING *On the company plan template* gives a ZIP with the DXF and a README of the fields left blank. Open the DXF in AutoCAD (it is a full drawing, not an insert). The template (the *seed*) comes from the admin's Drive link; see *What changed in v2.30*.
- Open the DXF directly or `INSERT`/`XATTACH` it into your drawing. Units are **meters**, coordinates are **UTM 51N (WGS84)** — your drawing must use the same system to line up.
- **Photos (v2.14):** unzip the DXF ZIP and keep the DXF and the JPEGs **in the same folder**; the photos are attached images (like `IMAGEATTACH`), so moving the DXF alone shows empty frames. If AutoCAD shows a frame without the picture, open `EXTERNALREFERENCES` and point the image to the JPEG. Photo width in the drawing (default 6 m) is in the DXF export options.
- Poles are circles (v2.14), not blocks: select a type with `QSELECT` by layer (`POLE_CONCRETE`, `POLE_CONCRETE_PROPOSED`…). Freeze `POINT_PHOTO`, `POLE_DETAILS` or `FOC_LENGTH` to hide them.
- **FOC length** on each linked span = straight span × (1 + allowance). The allowance (default 10 %) is in the DXF export options; the export info line at the bottom states it.
- Pole circle radius and label height are set in Settings → CAD export.

## Data safety

Settings → Storage shows how much G-eSAA uses and the most this phone currently lets it use (for example “up to about 10 GB”). That limit comes from the phone and browser, not from G-eSAA; it is a share of the phone's free space and changes as the phone fills up.

Points and photos live only in the phone's app storage until you export. **Make a Backup after each survey day** and keep the ZIP on Drive/PC. Clearing Chrome's site data or uninstalling the app deletes them.
Teammates' backups can be restored into one phone to merge projects (same project name = merged).

## Updating the app

Edit the files, change `VERSION` in `sw.js` (e.g. `polecam-v2.1.1`), and upload again. Phones pick up the new version the next time the app is opened with internet.

## Files

| File | Purpose |
|---|---|
| `index.html` | Screens and styling |
| `app.js` | Camera, GPS, map, storage, exports |
| `core.js` | UTM 51N conversion, EXIF read/write, ZIP, KML, DXF, CSV (no dependencies) |
| `reports.js` | Excel (.xlsx, with pictures and page setup) and PDF writers, rectification report, acceptance KML (no dependencies) |
| `forms.js` | The Deficiency List office form as PDF (with Annex A/B) and as an Excel sheet |
| `brand/logo-left.jpg`, `brand/logo-right.jpg` | Logos printed on the form and reports when the admin has not uploaded others |
| `tutorial.js` | The Tutorial's topics and steps (v2.25) |
| `dxftpl.js` | The plan DXF on the company template (v2.30): fills a copy of the seed with the survey; loaded only when that export is made |
| `tools/dxf-seed/` | Makes the seed from the company's AutoCAD template, fills it for checks, and checks a DXF's structure (Python); not needed by the app |
| `sample/G-eSAA_sample.zip` | The sample project a new phone gets (v2.26) |
| `glyphs.js` | The ID reader's character network (v2.20): its weights, about 140 KB; read by `core.js` |
| `tools/glyph-training/` | The scripts that trained it (Python); not needed by the app |
| `ocr-worker.js`, `vendor/tesseract/` | Offline Pole ID reader: Tesseract OCR (tesseract.js-core v7.0.0) and the English model from tessdata_fast, both Apache-2.0 |
| `sw.js` | Offline cache for the app itself |
| `manifest.json`, `icons/` | Install as an app |
| `vendor/leaflet/` | Map library (Leaflet 1.9.4, BSD-2) |
| `vendor/protomaps/` | Offline map renderer (protomaps-leaflet + PMTiles, BSD-3; licenses in `LICENSES.txt`) |
| `vendor/qr/` | QR codes for the company list: jsQR 1.4.0 (reader, Apache-2.0) and QR Code Generator 2.0.4 (MIT); licenses in `LICENSES.txt` |
| `maps/packs.json` | Areas for the optional *Build map packs* workflow |
| `MAP-PACKS.md` | How to make and publish offline map packs |
| `polecam_mappack.zip` (sent separately) | QGIS plugin that cuts a map pack from the area shown in QGIS |
| `.github/workflows/deploy-site.yml` | Publishes the website (app only) |
| `.github/workflows/build-apk.yml` | Builds the signed Android APK |
| `.github/workflows/build-map-packs.yml` | Optional: makes map pack files as a GitHub Release |
| `PoleCam-online-sheet.gs` (sent separately) | Apps Script for the online Google Sheet |
| `tests/` | Automated save tests (Node + Playwright, see *What changed in v2.3.1*); not published on the website |

Map data © OpenStreetMap contributors (ODbL); offline packs from the Protomaps basemap build. Satellite imagery © Esri (online only).

## Survey points: As-plan, As-built, Audit (v2.13)

A survey records the poles and, as **their own pins**, the network elements around them. In the editor choose the **Element**; typing an ID with its prefix picks it for you (FDU_ → ODF, NAP- → NAP, CL- → closure, HH- → handhole, ODC- → ODC).

| Element | ID | As-plan | As-built | Audit |
|---|---|---|---|---|
| **Pole** | CC-0001, WP-, SP-, GT-…; a proposed pole **PP-0001** | every existing pole with its photo, and **Proposed** new poles (v2.14) | **New (built)** / Existing (used) (v2.14) | existing poles |
| **Site** | site name or PLA ID | New or Existing site | New (built) / Existing (used) | Existing |
| **ODC** | ODC-01 | Proposed location or Existing | New (built) / Existing (used) | Existing |
| **ODF** | FDU_100 | Proposed location, or the Existing ODF at homing to use | New (built) / Existing (used) | Existing |
| **NAP** | NAP-0001 | Existing NAP | New (built) / Existing (used) | Existing |
| **Closure** (POI on a pole) | CL-0001 | Existing closure (point of insertion) | New (built) / Existing (used) | Existing |
| **Handhole** | HH-0001 + the **closure ID** inside (that makes it a POI) | Existing | New (built) / Existing (used) | Existing |

- **Remarks** on every point (condition, what to use, audit findings) go to the CSV, KMZ and route Excel.
- **Red box (v2.15: in the full photo, editable):** tap the photo, then **▭ Red box**, and drag around the spot (the proposed ODF location, the existing ODF to use…); draw several if needed. **Done** burns the boxes into the photo, which then exports, prints and syncs like any photo; the record is tagged *red box*. The unmarked photo and the marks are kept too, so later you tap the photo → **▭ Red box · edit marks**, tap a mark and move it, drag a corner to resize it, or **Delete** it. Marks made before v2.15 are part of the photo and cannot be edited.
- **Map:** non-pole points are labelled squares (SITE, ODC, ODF, NAP, CL, HH); a dashed border is proposed / new.
- **Route:** poles, handholes, the site, ODC and ODF are route points. *Link in capture order* links poles and handholes; link the site, ODC and ODF by hand. NAP and closure pins sit on a pole and are not linked.
- **As-plan completion rule:** *Mark task complete* and the completion report need every pole with a photo, **the site**, **an ODF or ODC location** and **a POI** (a closure, or a handhole with its closure ID). The checklist shows what is missing.
- **Pole details (v2.14):** on a pole, *Pole details* adds what is on it with a count — Transformer: 1 pc, Streetlight: 2 pcs… (pick from *+ Add detail*, or *Other…* to type your own). Since v2.15 each is a small chip: **+** adds one, **−** takes one away, and at 1 pc the **×** removes it. They go to the KMZ balloon, CSV (`pole_details`), route Excel and DXF (`POLE_DETAILS`).
- **Proposed pole (As-plan, v2.14):** set the pole's status to **Proposed**: the ID becomes the next **PP-0001**, and the photo shows a red **⊥**: tap the photo → **⊥ Pole model**, put your finger where the new pole stands and drag up to its top; a plain round model pole (no crossarm, v2.15) marked *PROPOSED POLE* is burned into the photo (red boxes can be added too), and it stays editable like the red boxes. Proposed poles show as a red dashed ring on the map, a *Poles — proposed* folder in the KMZ and `POLE_<type>_PROPOSED` in the DXF. The status is chosen for each proposed pole (it is not carried to the next pole).
- **As-built (v2.14):** every pole and element is **New (built)** or **Existing (used)**; the last choice is kept for the next point of that element.
- **Exports:** KMZ folders per element (Poles, Sites, ODC, ODF, NAP, Closures (POI), Handholes) with the status in the balloon; DXF layers per element and status (`ODF_PROPOSED`, `NAP_EXISTING`, `HANDHOLE_EXISTING`…; poles `POLE_<type>`, `_PROPOSED`, `_NEW`); CSV columns `element, status, closure_id, remarks, red_box, pole_details` added at the end; route Excel sheet *Points* with element and status; the completion report shows the poles collage, then the other points.

## Offline Android APK (built by GitHub Actions)

`.github/workflows/build-apk.yml` packs every app file into a signed APK on GitHub's servers, so the APK installs and runs with no internet. Map packs come from Google Drive or a file, and the street/satellite maps need internet.

- One-time setup: add the repository secrets `POLECAM_KEYSTORE_B64` and `POLECAM_KEYSTORE_PASSWORD` (Settings → Secrets and variables → Actions). Keep the keystore file and password safe: every future APK must be signed with the same key, or phones will refuse the update.
- Each time app files change on `main`, a new APK is built (about 5–8 minutes) and published under **Releases**. Newest APK: `https://github.com/<user>/polecam/releases/latest/download/G-eSAA.apk` (since v2.13; the same file is also published as `PoleCam.apk`, so old links keep working).
- The APK shows as **G-eSAA** on the phone. Its Android app ID is unchanged (`com.marktamse.polecam`), so it installs over PoleCam and keeps the projects; keep the same signing key and secrets.
- In the APK, *Save* writes exports to the phone's **Documents/G-eSAA** folder on new installs (phones that already used PoleCam keep their **Documents/PoleCam** folder; change it in Settings → Export settings → Folder name) and *Share* opens Android's share sheet.
- The APK keeps its own data, separate from the Chrome/Home-screen version. Move projects with Backup → Restore.
- Updating: install the newer APK over the old one; projects stay. Uninstalling the app deletes its projects, so back up first.

## What changed in v2.0

- **Deficiency List on the office form** (PDF and Excel), with the photo evidence as annexes instead of mixed into the report: Annex A per item (as found → rectified → verified) and Annex B photo log. Letter size, 15 items per page, page x of y, legend and signature blocks as on the template.
- **Found → Rectified → Verified** workflow with inspector and contractor roles by company, rejection with reason, verification photos; the Rectified Date on the form fills in from the app.
- **Admin vs user settings**: policies (admin company, form wording, checklist, field standards, photo check) are set by the admin and signed into the company list; users keep personal and export settings. Non-admins can view the policies.
- **Detailed export options** on every card and as defaults in Settings: photo size and quality, caption stamp fields, file naming, KMZ balloon size / photo pin icons / route / stamps, PDF annexes and photo size, Excel sheets.
- **New GUI**: navy top bar with the project and category, a status strip above the navigation (elements, open / to verify / verified, or poles, route length and long spans), Records screen with figures and status filters, grouped editor, export cards with options, settings in sections with sub-screens.
- Older projects keep working: items saved by v1.x without a status count as *Open*, or *Rectified* when they already have an after photo or date; existing settings are carried over. The deficiency checklist is now set by the admin, so a checklist edited on one phone in v1.x is replaced by the list's checklist (or the built-in one until a list is taken).
- Rejecting a rectification moves its photo into the item's history (shown as *Rejected* on the card and in Annex A) so the item has no rectified photo until the contractor takes a new one.

## What changed in v2.1

- **Admin company instead of per-person admins.** The list names one admin company and carries an admin PIN; its staff become admins and inspectors by entering the PIN, everyone else is a user. No more “ask to become an admin” / “add an admin” / re-share cycle. Old lists migrate when their admin sets the PIN once.
- **Online map that recovers**: three free tile servers with automatic fallback, request limits and retries, stale tiles shown when a server fails, and a *Test map servers* check on the Maps screen.
- **Map packs from QGIS**: the PoleCam Map Pack Maker plugin, plus `MAP-PACKS.md` with every way to make and publish a pack.
- **Less text**: explanations fold behind “i · Help” on every screen (Settings → About keeps them open).
- **One place for each thing**: the project and its category are on the top bar only (tap it for Projects); the strip above the navigation shows the status and the next step; the navigation is Records · camera · Export · Settings.
- **Workflow checklist** per project (Survey, PAT, FAT) with a *Next* button; exports, backups and hand-overs are remembered so the checklist knows what is done.
- **Map packs per area from QGIS**: the plugin cuts packs along the polygons of a boundary layer (GADM Philippines regions/provinces downloaded in one tap, or any shapefile), with Mindanao / Visayas / Luzon / Metro Manila presets and one pack per area or one merged pack.

## What changed in v2.2

- **Faster, safer photo saving.** The store-ready copy of a photo (2048 px + thumbnail) is now made in the background as soon as the photo passes the check, while the ID is scanned and typed, so **Save only writes to the phone's storage**. Every step has a time limit with a clear message instead of a frozen “Saving photo…”, and a refresh problem after a successful save no longer says “Could not save”. Phones with 48–200 MP cameras are asked for a ~12 MP still (the app keeps 2048 px anyway); a camera that does not deliver the still within 6 s is replaced by the live picture. Settings → Storage shows the timings of the last photo (camera, check, prepare, save) — send that line if saving is still slow.
- **Map tiles no longer compete with saving**: tile downloads pause while the app saves or exports; satellite imagery is loaded by the WebView again (as in v2.0) instead of through the Android bridge; only OpenStreetMap still needs the bridge, without retries; tiles that left the screen are dropped from the queue.
- **Pole owner prefixes**: Globe (GT-) and Bayantel (BT-) built in, extra prefixes for everyone in Administration → Field standards, or on one phone with “+ Other prefix” in the editor / Settings → Camera → Pole types. The ID reader knows all of them.

## What changed in v2.3

- **App log** (Settings → App log): a crash-safe log of errors, what the app told you (messages), and how long every step of taking, preparing, saving and exporting a photo took, plus the phone's storage and memory figures. *Send log* shares it as a text file (Viber, Gmail, Drive); *Run save test* makes a 12 MP test picture and times decode, compress, write and read-back without the camera. If the app is closed or crashes in the middle of a save, the next start records which step it was. The log holds no photos, names, phone numbers or coordinates.
- **Photo saving hardened**: the stored copy is prepared when the editor opens (after the camera has closed, so the camera and the photo processing no longer compete for memory); a decoder that hangs falls back to a second decoder; an encoder that returns nothing is retried smaller, and as a last resort the camera's own JPEG is kept, so a photo is never lost to processing; canvas memory is released right after use; a write that fails (for example storage full) empties the viewed-tiles cache and is tried once more; every wait has a time limit and the message says what failed.

## What changed in v2.3.1

Merges the photo-save fixes reviewed from the v2.2.1 “Astra” build into v2.3:

- **One storage transaction per save**: the photo(s) and the record are written together, or nothing is written. A save that takes longer than 15 s is cancelled for real (no late half-save), and a closed storage connection is reopened and tried once more.
- **Save cannot be lost or doubled**: a second tap on Save, or Back while it is saving, is ignored with a note; if a save fails, a red line under the editor says why and the photo stays on screen for another try.
- **Fallbacks for the photo processing**: if the phone's JPEG encoder stalls or returns nothing, a second encoder is used (and remembered); if the fast decoder stalls, the normal image decoder is used; large photos are decoded at reduced size where the phone supports it; a preparation that timed out is discarded so the next Save starts fresh.
- The v2.3 App log, storage-full recovery (empties the viewed-tiles cache and retries) and keep-the-camera-JPEG fallback are kept, and every new path writes to the log.
- `tests/`: `node --test tests/image-preparation.test.cjs` (unit) and `NODE_PATH=<node_modules with playwright> node --test tests/photo-save.spec.cjs` (12 browser tests: reload, closed connection, stalled encoder/decoder, rollback, double tap and Back, timeout, orientation, error line). The website workflow skips this folder.

## What changed in v2.4

- **No repeated details in Google Earth.** The balloon title is the Pole ID, and the photo already carries the stamp (ID and type, coordinates and accuracy, time). So the balloon now shows only the photo. It adds a text line only for what the stamp leaves out, for example when the stamp is turned off or some stamp fields are unticked. The PAT/FAT KMZ also drops its *Coordinates* and *Captured* lines when the photos are stamped. The attributes in the KMZ (pole_id, pole_type, captured, accuracy_m) for GIS imports are unchanged.
- **Compact editor.** The pin map uses 30% of the screen and the ⤢ button enlarges it (the choice is remembered). The instruction appears on the map and fades after the first drag. Element, Pole type (with “+ Other prefix…”), ODF new/existing, the deficiency “Where” and Category are dropdowns. MLoop / NAP / Closure are one row of toggles, with the NAP and Closure IDs side by side. Scan suggestions sit on one line. “+ Add” deficiency moved next to the status. The map and the Save button stay fixed while the form scrolls.
- **Export: one format at a time.** A Format dropdown at the top picks the export (KMZ, DXF, CSV, PDF, Excel, photos, backup, …). Only that card is shown, its Export button stays at the bottom while the options are open, and the last choice is remembered for Survey and for PAT/FAT. The checklist's *Next: Export* opens the Deficiency List PDF (PAT/FAT) or KMZ (Survey), and *Back up* opens Backup.
- The App log records which base map was shown during each save.

## What changed in v2.5

- **Four stages with one handover file.** New category **Defect cleanup** between PAT and FAT. The PAT KMZ (Projects → *Share the PAT KMZ*) opens in Google Earth and also carries the PoleCam records and original photos, so the contractor starts the cleanup from it and the inspector starts the FAT from the cleanup KMZ. See "The shareable KMZ".
- **Walk the pins** in the cleanup and the FAT: tap a pin (or the *Next* strip) for a card with the as-found photo and one-tap **Photo of the fix / Comment / Accept / Accept with photo / Reject**. Each tap saves at once. The strip shows the nearest pin still to do, with its distance and direction from you. In a cleanup the camera button opens the nearest pin instead of a new record.
- **PAT records only defects:** the defect form is open when the editor opens, *Save* adds a ticked defect, and a new PAT record without a deficiency (N, D or MD) is not saved.
- **No tag → NPT:** one tap sets the Pole ID to NPT (no pole tag). Several NPT poles are allowed (no duplicate warning; file names get _2, _3…). In a PAT it also ticks the *No pole tag* defect.
- **Reference KMZ** per project (Projects → Current project → *Load KMZ / KML…*): the HLD route, homing and POI pins drawn under your pins on the map and in the editor, names shown when zoomed in. It is only a guide (reroute where the HLD is not doable) and is never exported. Hide or remove it there.
- **Survey for As-plan or As-built** (chosen when the survey project is made, changeable in Projects); survey file names and the KMZ title carry it.
- **Map packs from the admin only:** Administration → *Offline map packs*; users see them under Maps after taking the list or *Refresh list*. The online sheet script gained *setPacks* and the *Defect cleanup* task category: paste the new `PoleCam-online-sheet.gs` and deploy a new version.
- One of the v2.3.1 browser tests now uses a FAT project, because a new PAT record needs a deficiency.

## What changed in v2.6

- **Zoom in the camera.** On phones whose camera offers zoom, pinch or tap **1× / 2× / 4×** (up to the camera's limit, 10× at most) for every photo; the camera itself zooms, so the photo should come out zoomed too (check one on your phone). On other phones a digital zoom is offered while reading the ID (the ID is read from what is on screen). The zoom used for IDs is remembered.
- **Live ID reader.** In the ID step the box is no longer fixed: a few times a second the picture is searched for the painted ID (a row of characters, or a column for vertical IDs, ignoring pole edges and cables), the box moves onto it like a face-detection box, and when it holds still the ID is read in the background and shown on the box (green, e.g. *CC-0123 · 92%*). When the same known-format ID is read twice the step finishes by itself (Settings → Camera → *Live ID reader* to turn that off and use the shutter instead). Tap the ID on screen to point the box at it (and focus there, where the camera allows). Horizontal / Vertical still tells the reader which way the ID is written. If nothing is found, the box stays in the middle and works as before. Tested here on sample pole pictures; real poles, light and paint vary, so check the reading the editor shows.
- **Online sheet: tasks from your tracker, filtered by company**, with optional per-company keys — see "Tasks from your own database". Needs the new `PoleCam-online-sheet.gs` (see "Updating the script").

## What changed in v2.7

- **Pick the project from the online sheet's sites** (Projects → New project → SITE): each vendor sees only its own sites (rows naming several vendors go to each); companies without sites, or phones offline, type a project name as before. The site's details and Drive folder stay with the project.
- **Works with the Project Data + Company List layout** (Authorization ADMIN / USER) without extra setup; see "Your sheet layout". Until its user has chosen a company a phone gets the company list but no sites, and it re-reads the sheet when the company changes, so a vendor never receives another vendor's sites first (with the v2.7 script).
- Company names compare without case, punctuation or Inc./Corp. endings, for the sites and for the admin company (with the admin PIN, as before).
- Needs the updated `PoleCam-online-sheet.gs` (see "Updating the script").

## What changed in v2.8

- **Simpler Projects screen:** a **PROJECT** dropdown to switch, a **+ New project** button, the workflow of the current project, and everything else folded under *Project details*. Only the current step of the workflow shows its explanation.
- **New project form** with five fields: Project name (from the online sheet or typed), Task category, Purpose, KMZ, Remarks / notes. It replaces the category chips, the separate site list, the *Open the PAT KMZ* button and the *Assigned tasks* list. See "Projects screen".
- **Remarks / notes** per project (also editable under Project details).
- No change to the online sheet script (v2.7 script works as is).

## What changed in v2.9

- **Join link:** one link (or the QR code, scanned with the phone camera) puts a new phone in your list. The welcome screen now offers *Join* first; creating a new organisation is folded away.
- **List updates through the online sheet** (with the Admin key on the admin phone and the v2.9 script): phones take each new list version by themselves.
- **Admin users:** only the emails the admin lists can use the admin company and Manage.
- **Tie the app to your list** with org.json: no other lists, no *create* option for anyone.
- **Faster ID reading** and the photo check during the ID step; **camera button on the right** by default (Settings → Camera).
- Needs the updated `PoleCam-online-sheet.gs` (see "Updating the script") for the list updates; everything else works with the v2.7 script.

## What changed in v2.10

- **Vendors run the acceptance:** the construction vendor records the PAT defects, fixes them and does the FAT checks (accept / reject); the Globe representative signs the printed form. Manage → Field standards → *Vendors record PAT defects…* turns this off (only the admin company records and accepts).
- **New project form for vendors:** site picker, category and purpose limited to the vendor's part of a two-vendor site, automatic project name (`Category_Project Name_PLA ID_Site Name`), vendor, location, contractor representative (you), optional Globe representative, all inspection types ticked, today's date.
- **Inspected by** removed (the contractor representative is the user); the Globe representative is optional.
- **Share the PAT / cleanup KMZ** and **Start FAT** are buttons on the Projects screen and the Export screen. They stop when nothing is recorded or there is no deficiency, and ask before going on when elements, defects or fixes have no photo.
- **Company keys:** new users enter name, mobile, email and the company key (or scan a coworker's invite QR); the company is fixed on the phone (Settings → Reset user to change it). Users no longer see the list of companies.
- **Who exported it:** every export carries the exporter's name, mobile, email, company, date and app version: PDF footers, an *Exported by* sheet in Excel, a column in CSV, the KMZ description, a DXF comment and text on layer EXPORT_INFO, `exported_by.txt` in ZIPs, the EXIF *Artist* of exported photos, and the backup / shareable KMZ data.
- Export settings: **Reset to defaults** button. Camera button centred by default.
- Needs the v2.10 `PoleCam-online-sheet.gs` (company keys, and the sheet answers whether keys are used), `makeCompanyKeys` run once, and org.json downloaded again from Manage.

## What changed in v2.30

- **Map button for the reference KMZ** (right side of the map). With no reference loaded it loads one (KMZ or KML). With one loaded it opens a panel: show or hide the **reference**, only **its pins** or only **its lines / route**, and this project's own **pins** and **route**; *Replace…* loads another file. A red dot on the button means something is hidden. The choices are kept per project.
- **The pin stays where you put it.**
  - After the photo the keyboard no longer opens by itself on the ID box, so the map and pin stay in view; with no ID read, the ID box blinks instead.
  - The pin is the centre of the small map. When the map changes size (the keyboard opens or closes, Bigger map), the same spot is put back under the pin. Before, the keyboard hid the map and a resize could shift it under the pin, so the saved position could differ from the one you set.
  - A photo taken with a GPS fix of 15 m or better keeps its pin: a better fix arriving later no longer moves it. (A photo taken before the GPS locked still follows the GPS until a usable fix comes or you touch the map.) Once you touch or drag the map, the GPS never moves the pin.
- **Typing shows only that field.** In a record, while the phone's keyboard is up, only the field you are typing in (its name and its box) shows, under a smaller map. The rest of the form and the Save bar come back with **Done ✓**, Enter, or closing the keyboard with Back. With a hardware keyboard or on a computer, the whole form stays.
- **Share** (on project cards and on every export result, PDFs included) opens the phone's share sheet: WhatsApp, Viber, email, Drive, Save to Files, Quick Share (Android) or AirDrop (iPhone).
  - On the **website**, a panel shows first and its **Share…** button opens the share sheet. Browsers open the share sheet only straight from a tap, and the file is made after your first tap, so Share could do nothing before.
  - **Chrome on Android shares only pictures, PDF and text from a website**, not .zip, .kmz or .dxf. The panel then says so and offers **Save to phone** (send it from the Files app). The **Android app** shares any file. If the Android app's share fails, it now saves the file instead and says so, and the reason goes to the app log.
  - **Nearby, without signal** (e.g. showing a completed PAT or FAT to a Globe representative): Android to Android, **Quick Share** in the share sheet (Bluetooth / Wi-Fi Direct); iPhone to iPhone, **AirDrop**. Android to iPhone has no common offline way: a chat app when there is signal, or show the completion report PDF on your screen. A personal hotspot alone does not move files; it only gives the other phone internet through yours. The other phone opens the project or KMZ with Projects → 📂 Open a shared file.
- **Plan DXF on the company template (stage 2 of 4).** Export → AutoCAD · DXF → DRAWING **On the company plan template**:
  - The template's own layers, blocks, text styles and sheets. **One GEO sheet per 440 m grid cell the route crosses** (the GEO sheet is copied as many times as needed, viewports at 1:1100). The grid is placed so the route uses as few sheets as it can and keeps away from the sheet edges. Each GEO sheet gets its cell name, its sheet number and its index key (the neighbouring cells that have sheets). The **KEYMAP** shows the whole grid and route, and the **VICINITY MAP** about 3× the route (at least 1.5 km).
  - **Poles**: a pole symbol (the X of the template's *existing electric pole*) with the material (CC / WP / SP…) and the pole ID as attributes. Proposed poles are red, on their own layer (P-GPOLE); existing poles go on ELECTRIC POLE. Each pole's number in a circle, and its latitude / longitude.
  - **Cables** on the template's layers: 72C Figure 8 and 12C light cable aerial, 144C UG on the duct layer. Span lengths, and spans over the maximum span in red *(OVER 200m)*. Maintenance loops with *15.0m LOOP*, closures, NAPs, the site (BTS symbol with its name) and the ODF.
  - **Roads** as double lines with street names, from **OpenStreetMap** (online), or from the offline map pack covering the area when there is no signal. The OpenStreetMap credit is written on the drawing. Your road.shp is not needed for this. If OpenStreetMap is missing roads in your areas, it can be added later as a source.
  - Filled by the app: the date, *Exported by* (your name, mobile and email), the scale, sheet numbers, the table of contents, the title cable, the site name, the company, and the PMI cable lengths and counts that come from the survey. Fields the app does not know (network, issue no., drawing no., signatories, barangays, location…) stay blank, and the README in the ZIP lists them.
  - The template is **not inside the app** (company property). The admin puts its Drive link in Administration → *Drawing template (DXF seed)*. Phones download it (Android app), or the user loads the file; it is kept on the phone. Your spec asked for a bundled copy as a fallback, but bundling it would publish it with the website, so I left it out.
  - **Where it is approximate.** Labels are placed at fixed offsets from the route (pole numbers on the right, the run label and NAPs on the left), so they can crowd on short or sharply turning spans; move them in AutoCAD. Which PMI fields the survey counts fill is my reading of the template; check them. Stage 3 (plan setup screen for the blank fields) and stage 4 (PDF) are still to come.
- Light cable is named **Light cable 12C** everywhere.

## What changed in v2.29

- **Tap G-eSAA (top left) to reload** and get the newest version. It asks first (*Reload G-eSAA?*), and a tap does nothing while the camera, a record, the photo view or the marking screen is open, so a stray tap during capture or editing changes nothing. The website version takes the newest files; the **Android app** carries its own files, so it reloads and, when the website has a newer version, offers to open the download page of the new APK (installed over the old one, data kept).
- **No accidental zoom of the whole screen.** Two fingers on the buttons, forms or lists no longer zoom the page (website and app). The map, the photo view, the marking screen and the drawing keep their own pinch-zoom.
- **FOC cable type on every span.** The route builder has a **CABLE** choice: *AE Figure 8 72C FOC*, *Light cable 12C* (aerial, AE) or *UG 144C air-blown fiber* (underground, UG). New spans take the chosen cable; tapping a linked pair with another cable chosen changes that span; **Set on all spans**. The map draws each cable in its colour (UG dotted, grey = not set) and the bar sums each cable. The **Route and spans Excel** lists the cable and method of each span and the length of each cable; the **KMZ** draws one line per cable run (cable and method in its data); the **DXF** puts each cable on its own layer (FOC_AE_FIG8_72C, FOC_AE_LIGHT_12C, FOC_UG_144C). Projects from before v2.29 have spans with *cable not set* until you set them.
- **Pole: new arm, guying and maintenance loop** (As-Plan and As-Built, under Size · for the BOQ / BOM): **NEW ARM** (single, double, extension 26" / 44.5", 10-pin alley arm), **NEW GUYING** (several at once: head, side, sidewalk, sidewalk head, pole-to-pole, down guy) and **MAINTENANCE LOOP** (one tap: *MLoop 15 m*). The admin sets the MLoop length (Administration → Field standards; 15 m by default) and the arm and guying lists. They are in the BOQ, the KMZ data and the CSV.
- **Region for the BOQ**: Projects → Project details → **REGION (BOQ)**. The GPS suggests it (nearest of about 150 provincial capitals and large towns, so it can be wrong near a regional border) and you choose it to confirm; until then it is *not set*.
- **Survey quantities** sheet in the BOQ Excel and the Route and spans Excel: span length by cable and by method (AE / UG), maintenance loops (count, by cable), FOC length = spans + loops, **detailed engineering = the FOC length without the loops**, poles on each cable, long spans, new poles by size and class, arms, guying, clamps, new ODFs (and their fibers), new closures, NAPs and the region, each with a code. **The BOQ template itself is not filled yet**: it has no formulas, so the rules that turn these quantities into its items wait for your rules.
  - Span lengths are straight lines between the pins (no sag or slack).
- **Download an area for offline use** (Settings → Maps → Offline map packs): the map view, or the project's area (about 1 km round its records), zoom 0 to 15, kept as an offline map pack. The online street map's tile servers do not allow saving areas, so the area is cut from the **Protomaps basemap build** (OpenStreetMap data, ODbL) by reading only the parts of the file it needs, like `pmtiles extract`. A town is a few MB (a dense city centre is bigger: about 5 MB for 1.3 × 2.5 km of central Florence in the test). An area of more than 6,000 tiles is refused, and a download that passes 400 MB stops (zoom in, or use an admin pack). Cancel stops it with nothing half-saved.
  - The source is the Protomaps daily build (the newest of the last 10 days). Protomaps asks not to rely on it for production use; for heavy use the admin can put a copy of a build on the company's own storage that allows range requests (e.g. Cloudflare R2) and enter its https address in Administration → Offline map packs → *Area download source*.
  - Tested here against a real Protomaps extract served the way the build server serves it; I could not reach build.protomaps.com from my workspace, so the first download on a phone is the real test. If the website version cannot read the build (browser security), the Android app can.
- **Plan drawing (DXF) on your template, stage 1 of 4**: the template is prepared into a *seed* (`tools/dxf-seed/`; the template and the seed are not in this repository: they are company property). Stages 2 to 4 (export on the template, plan setup screen, PDF) follow.

## What changed in v2.28

From the design review comments.

- **Your details.** **Region** and **Territory** are dropdowns with tick boxes and **All**. A new **Company ID no.** field (optional; inspectors and approvers need it for the on-site approval). With an invite (QR code or link) the **company comes from the invite** and cannot be changed (Settings → Reset user to start again), and **Join your team** is not shown. Invites now name the company even without company keys: Settings → **Share list** asks which company the invite is for.
- **Projects.** **Other projects** fold under their heading (remembered). The open project's card has a **KMZ** tool for its reference KMZ. New project: **Create project** is in a footer, always on screen, like Save in Your details.
- **Tutorial.** Each subject folds open or shut. In the guided tour the tip has **▾** to make it small, so it does not cover the screen (tap ▴ or its title to show it again). New topics: *Drawing and Find*, *Approval on site*; the others follow the changes here.
- **Map.** The summary strip stays. The **Records** button is replaced by **Drawing** in As-Plan and As-Built surveys (a preview of the DXF: poles, route and spans in UTM metres; pan, zoom, Fit, Labels, Export DXF) and by **Find** in every other task (search the pins by ID, element, status or defect; **All records ›** opens the list). Tapping the summary strip still opens the records. *Editing the drawing on your own DXF template is not there yet: it waits for the template.*
- **Map labels** of poles and spans are moved apart where they would cover each other; a span length with no free place is hidden until you zoom in.
- **KMZ route**: one continuous line from end to end (to each junction) instead of one line per span; long spans are also listed in their own *Long spans* folder.
- **Camera.** The button for the phone's own camera app is gone (photos are taken live, with the GPS check). **0.5×** shows when the phone gives the app its ultra-wide lens; many phones give a web app only 1× and up, and then it does not show.
- **BOQ / BOM sizes and pole details are set by the admin**: Administration → Field standards → *Sizes for the BOQ / BOM and pole details*: pole owners, clamp sizes, new Globe pole sizes and classes, ODF sizes and connectors, closure sizes and the pole details, one value per line (empty = the built-in list). A list of **more than 4** shows as a **dropdown** in the record. *The BOQ / BOM template is still to come (you will send it).*
- **Marking the photo**: the tools are icons, and **colour dots** (red, navy blue, green, orange) colour the next mark or the selected one. **Navy blue = existing**: its label reads EXISTING (e.g. *EXISTING POLE*). Changing tool starts a new mark.
- **Export several formats at once**: Export → *Several formats at once, in one ZIP*: tick the formats (survey or PAT / cleanup / FAT) and one ZIP holds them all.
- **Administration.** Each section folds (List name and Companies open at first). **Admin users** can come from the online sheet's new **Admin users** tab (Email, Name, Company ID no., Mobile, Job): Refresh from the sheet lists them and Save puts the emails and jobs in the company list. Without that tab, type one line per user: the email, then the job. The **KMZ password** can be set in the sheet (**Settings → KMZ password**); Administration then only shows it. After Save with the online sheet (Admin key set) **no join QR code** is shown: **Make an invite** asks for the company.
- **Approval on site (QR code).** On a **completed** task, the vendor taps **Scan the inspector's approval QR**; the inspector shows it with Settings → **On-site approval QR**. The code is signed with the admin key of the company list, holds the inspector's name, company ID no., mobile and email, and is valid **10 minutes** (renewed every minute while open). It is accepted only from an admin user whose **job** covers the task: **PAT/FAT inspector** for the PAT, defect cleanup and FAT; **As-Plan / Audit / As-Built approver** for those surveys (with no jobs set, any admin user). The task keeps who approved, the time, the GPS position and a verification code; the **completion report** prints them in a green *APPROVED ON SITE* box and next to the signature line, so the PDF stands without a written signature (signing the printed copy is still possible). An inspector can also **Approve on this phone**. **Undo complete** clears the approval.
  - What it proves: the code was made on a phone that holds the admin key (unlocked with the admin PIN) within the last 10 minutes, by a user whose email and job are on the company list. The name, ID no. and mobile come from that inspector's own details. A picture of the code forwarded to someone else would also work within those 10 minutes; the GPS position recorded is the vendor phone's.
- **Online sheet script v2.28** (`PoleCam-online-sheet.gs`): the **Admin users** tab and **Settings → KMZ password** (run *setup* once to add them; see "Updating the script"). Without the update the app works as before (admin users typed in Administration, KMZ password from the list).

## What changed in v2.27

- **A proposed pole is a Globe (GT) pole.** In an As-Plan, when a pole's Status is *Proposed*, its type is set to Globe (GT) and locked. In an As-Built, a pole set to *New (built)* starts as Globe (GT) and can still be changed. A proposed pole no longer becomes the type the next pole starts with.
- **Saved without an ID: a generic number.** A survey record saved with an empty ID (or only the prefix, e.g. *CC-*) gets the next free number of its own in the project: **P-0001** for a pole, ODF-0001, SITE-0001, ODC-0001, NAP-0001, CL-0001, HH-0001 (a proposed pole keeps its PP- number). The toast says so; open the pin later to put the real ID.
- **Marking the photo** (tap the photo in a survey record → **✎ Box · FOC · Text** or **⊥ Model**): the tools are now **▭ Box**, **⊥ Model**, **〰 FOC route** and **T Text**.
  - **Data rack model**: an empty rack (frame, top, plinth, rails). The assumed ODF panel and equipment are gone. Add the ODF yourself with **Proposed ODF (rack panel)**: dragged over its place in the rack, it fits between the rails, in whole rack units (1U steps). Moving the rack moves its ODF panels too.
  - **FOC route**: draw the route with your finger (e.g. from pole to pole); it is drawn red with a white edge and *PROPOSED FOC* at its middle. Tap a route to move or delete it.
  - **Text**: tap where the comment goes and type it (up to 200 characters); it is written in a white box on the photo. Tap it to move it, tap it again to change it (empty removes it).
  - Like the other marks, they are drawn on a copy of the photo (the original is kept, so they stay editable), and the record list tags them (*FOC route*, *note on photo*).
- **Region and Territory: nothing ticked = nothing to show.** A user who has not ticked at least one region **and** one territory gets no site from the online sheet (the site list says to tick them; saving your details without them says so too). Rows with a blank Region or Territory cell are still listed for everyone who ticked theirs. The phone filters by itself; the online sheet's script **v2.27** (`PoleCam-online-sheet.gs`) also stops sending those sites (update it as in "Updating the script").
- Tutorial: a new topic *Mark the photo: models, FOC route, text*; the capture and region topics follow the changes above.

## What changed in v2.26.1

- **The BOQ belongs to the As-Plan and As-Built surveys.** There is no BOQ survey purpose: New project → Survey purpose is still As-Plan Creation, As-Built Creation or Audit.
  - The **Size · for the BOQ / BOM** fields show only in **As-Plan Creation** and **As-Built Creation** records. Audit, PAT, defect cleanup and FAT records have none (the PAT BOQ export and the *Size (BOQ)* column of the PAT Excel are gone).
  - **As-Plan**: the BOQ is what the plan needs (proposed new Globe poles by size and class, clamps by size and pole owner, ODF, closures).
  - **As-Built follows the As-Plan.** Load the As-Plan KMZ exported by G-eSAA (v2.26 or later) as the As-Built project's reference (Projects → Project details → KMZ reference); the reference line then says how many planned elements and sizes it holds. In each As-Built record the planned element is found by the same ID (a painted pole ID), else the nearest planned element of the same kind within 15 m of the pin. A **new** record starts with its **planned sizes and status** (a proposed pole of the plan is *New (built)*); a line above the sizes shows the plan (*filled in from the plan*), turns orange when what was built differs, and **Use the planned sizes** copies the plan back. What you tap yourself is never overwritten. Without the As-Plan KMZ the record says how to load it.
- **The BOQ comes out with the survey**, and still on its own:
  - **Completion report (PDF)**: a **BOQ / BOM page** after page 1 (page 1 lists it under Details).
  - **Route and spans · Excel**: a **BOQ** sheet.
  - **BOQ / BOM sizes · Excel** (Export → FORMAT, As-Plan and As-Built only; no longer the first choice).
  - In an **As-Built** with the As-Plan KMZ: columns **Planned, Built and Difference** (built minus planned), the planned elements not found in the As-Built (same ID or within 15 m) and what was built outside the plan. The status column reads *New* (proposed / new) or *Existing* in both.
- An As-Plan KMZ made before v2.26 has no sizes in it: export it again from the As-Plan project.

## What changed in v2.26

- **Sample project for a new user.** The first time the app opens on a phone (no project yet), it adds **SAMPLE_Survey_As-plan**: 5 existing poles with photos, pole details and sizes, marked **SAMPLE** on its card. It is made from the dummy project you sent (`sample/G-eSAA_sample.zip`): the people, company, vendor, task ID, Drive link and serial were replaced with *Sample user*, *SAMPLE*, *SAMPLE VENDOR*, *123*; the photos were re-saved at 1200 × 1600 without their EXIF data. The **photos and the GPS positions are still the real ones** (Davao area, Region MIN / T7), and the file is on the public website: replace `sample/G-eSAA_sample.zip` with another export (Projects → Share → Project file) if that is not wanted.
  - It is not opened by itself: the user picks it from Projects. **Delete** removes it at once (no admin approval) and it never goes to the online sheet. **📘 Add the sample project** (bottom of Projects) brings it back.
- **Projects: Share, Folder and Delete on every card.** The open project shows **Share** and **Delete** under its name (Project details no longer has to be opened), and every project in the list has its own **Share**, **Folder** (when the online sheet gives it a Google Drive folder) and **Delete**.
  - **Share**: the project file (records and photos, opened in G-eSAA with *Open a shared file*); on a PAT / defect cleanup / FAT project you choose the project file or the PAT / cleanup KMZ. *Share several projects* stays at the bottom.
  - **Delete** on another project's card deletes that project only (the open one stays open); a completed project still needs the admin's approval, as before.
- **Invites: a short link and a small QR code.** Where the online sheet holds the company list (the admin saved it with the Admin key), the invite link names the sheet and the list instead of carrying the whole list, so the QR code is small (a few hundred characters instead of several thousand: no more *Too much for one QR code*) and messaging apps do not cut the link. The invited phone downloads the list from the sheet (it needs internet once) and checks it is that list, signed by the admin.
  - **The invited user is not asked for a QR code or a link again**: opening the link goes straight to *Invite received*: name, mobile, email, Save. A phone that joined this way makes short invites for its coworkers too.
  - Without the sheet (or an app tied to it with `org.json`), the invite still carries the list, as before.
- **Open in the G-eSAA app.** A G-eSAA link (invite, join, move) opened in a browser on Android asks *Open in the G-eSAA app?*: the app opens with the invite (its details and projects are separate from the browser's). *Continue in this browser* is remembered on that browser. **The APK must be rebuilt** with the new `build-apk.yml` for the app to receive these links; an older APK does not, and a phone without the app falls back to the website.
- **Sizes for the BOQ / BOM** in each record (*Size · for the BOQ / BOM*, under Identification; tap a size, tap it again to clear; optional):
  - **Existing pole** (survey): **owner** — Electric, PLDT, DITO, CONVERGE, the admin's extra owners, or **+ Other** (typed once, kept on that phone) — and **clamp size** 5-7, 8-9, 10-12.
  - **Proposed / new Globe pole** (survey): **size** 7.5m, 9.14m, 10.6m, **class** 7A, 7AR, Light, and clamp size.
  - **ODF**: 12F, 24F, 48F, 72F, 144F, 288F and **APC** / **UPC**. **Closure**: 12C to 288C (a survey closure's Existing / Proposed is its status). A handhole with a closure ID gets the closure size.
  - **PAT / cleanup / FAT pole**: owner, clamp, new pole size and class; with *Closure* ticked on the pole, the closure size and **Existing / New**.
  - **Export → BOQ / BOM sizes · Excel** (survey and PAT): the quantities by item and size (new Globe poles by size and class, clamps by size and pole owner, ODFs, closures) with the IDs of each line, and the elements that have no size yet. The sizes are also in the CSV (`pole_owner`, `clamp_size`, `new_pole_size`, `pole_class`, `odf_size`, `odf_connector`, `closure_size`, `closure_status`), the KMZ balloons and data, the DXF labels, the route and element Excel sheets (*Size (BOQ)*), the folded record summary, the record list and its search.
  - Administration → **Pole owners** (one per line): extra owners every phone of the list gets with the next list update.
- The online sheet's script is unchanged since v2.25.

## What changed in v2.25.1

- **Tutorial: the guided tour goes on to the end of the topic.** In v2.25.0, *Show me* pointed at one button and the tip disappeared as soon as you tapped it (for example the camera button in *Capture poles*). Now:
  - **▶ Guide me through it** (top of each topic) or **Show me** on a step starts a tour that stays on screen while you use the real app.
  - **Tap the ringed button** to do the step: the tip moves to the next step on whatever screen opens. In *Capture poles* that is Capture → the shutter in the camera → Skip at the ID step → Reset to GPS and Save in the record → Records. The same goes for the PAT defect form, the pin card of the defect cleanup and FAT (Photo of the fix, the camera, Next pin), the route bar, Settings, Projects and Administration.
  - **Next ›** moves on without doing it; **Open it ›** opens the step's screen when you are elsewhere; **✕** ends the tour; **Back to the tutorial** returns to the topic.
  - While a dialog is open (a question, the PIN, a QR code, a file being made) the tip waits behind it. The tour never closes a record or the camera by itself, and after you did a step it never leaves the screen you are on until you tap **Open it ›** or **Next ›** (so a saved PDF or a QR code stays in front of you).
  - When the app skips a screen (the pole ID read by itself, so the record opens at once), the tour skips that step too. A control below the screen is scrolled into view once.
  - Admin guide topics now point at the real fields of Administration (after the admin PIN).
  - It is the real app: a photo taken during the tour is a real record in the open project (delete it afterwards if it was only practice).
- Settings → About shows the app's real version (it said v2.15.0).

## What changed in v2.25

- **Tutorial** (bottom bar, at the lower right beside Settings): an interactive guide inside the app, offline like the rest.
  - Topics grouped by subject (Getting started, Survey, PAT / defect cleanup / FAT, Reports and files, Settings), each in numbered steps. **Show me** opens the right screen and puts a ring round the real button with the step's text (*Back to the tutorial*, *Next step ›*, *Got it*); when the button does not apply to the open project, the note says when it shows.
  - **Search** (box and button at the top): finds topics by any word in their title or steps (e.g. *invite*, *FAT*, *offline*, *approve*) and marks the words.
  - **User guide / Admin guide:** users of the **admin company** (and the admin) see both, with the admin settings in the Admin guide. Users of every other company see only the user guide; admin topics do not show up in their search either.
  - The topics are in `tutorial.js` (one file, easy to edit). It is a new file: upload it with the others, and the APK workflow (`build-apk.yml`) now copies it.
- **Region and Territory** on each user's details: Settings → your name → **Region** (NLZ, SLZ, NCR, VIS, MIN) and **Territory** (T1–T8), tick all that apply.
  - *Choose a site…* in the New project form then lists only the online sheet's projects whose **Region** and **Territory** columns (Project Data) match: one of your regions **and** one of your territories. A row with a blank Region or Territory is listed for everyone; nothing ticked = every area. It works the same for the admin company and contractors; the company split is unchanged.
  - The site list's last line says your area and how many other sites are hidden. The *Move to another phone* code carries your choices.
  - Cell values understood: NLZ / SLZ / NCR / VIS / MIN or North Luzon, South Luzon, Metro Manila (National Capital Region), Visayas, Mindanao; T1–T8, *Territory 3*, *3*, *MIN T3*. Several in one cell ("T1, T2") are fine. Anything else matches no choice (that row is hidden from users who ticked a region / territory).
  - **Update the online sheet's script** (`PoleCam-online-sheet.gs` v2.25, see "Updating the script"; Run setup once, then a *New version* of the same deployment). With it, the sheet reads the Region and Territory columns (*Column: Region* / *Column: Territory* in Settings; blank = found by the header) and sends each phone only the rows of its area. Until it is updated, the phone filters by itself where the sheet already sends those columns (*Show also*). Either way the script reads at most 2,000 open rows of Project Data, as before, and the phone keeps up to 500 sites, its own area's first.

## What changed in v2.24

- **The company key is hidden; users join only with an invite (QR code or link).** See "Signing in with a company key":
  - The profile has no key field any more: *Scan invite QR* / *Paste invite link*, then *Invite received (the company key stays hidden)*; after Save, *Joined FADI with its company key (hidden)*. The key is not shown anywhere in the app.
  - Invite links carry the key masked (`#ci=…`); the QR dialog shows no key; the *Move to another phone* code carries it masked too. Old `#ck=` invites still work.
  - **Admin:** Administration → **Invite a company's users**: paste a company's key from the sheet's CompanyKeys tab (hidden field) → **Make the invite** → QR code and link for that company's first user. The sheet checks the key first (a wrong key is refused).
  - Settings: where the online sheet asks for a company, the old key box is now *Scan invite QR* / *Paste invite link*.
  - Masked is not encrypted: anyone who has an invite can join that company. Change a company's key in the sheet to stop old invites.
  - No change to the online sheet script.
- **The attached KMZ is now a small stamp, not a page.** On every PDF that carries its KMZ (completion report, Deficiency List, rectification report), the full *ATTACHED KMZ* last page is gone. Instead, a low-profile stamp sits at the **lower right of the first page only**, in small text (5–6 pt), with a paperclip:
  - **Line 1:** KMZ ATTACHED · the file name · its size (a long name is shortened in the middle, keeping the date and `.kmz`).
  - **Line 2:** what it holds: the stage, the pins and the items (open / rectified / verified), or *no deficiencies found*; for a survey, the pins, poles and spans.
  - **Line 3:** the file's **SHA-256** (the text can be selected and copied), to check the KMZ is the one of this PDF.
  - The stamp is the click target of the embedded file in Adobe Acrobat Reader, Foxit and Firefox (open or save); its tooltip says where to find the attachments. Chrome, Edge and phones' built-in viewers still do not show PDF attachments.
  - The page layout is not changed: on the reports the stamp sits in the footer band, right of the page number (the footer line and *Page 1 of N* end just before it); on the Deficiency List form it sits under the form frame, right of the footer line. A long footer line beside it is set in smaller type (or two lines), not cut. The form's header and logos are untouched. Without a KMZ (too large, or it could not be made), the first page is as before.
  - The KMZ inside the PDF is the same as in v2.23; only how it is shown changed. Checked here with poppler (`pdfdetach`, `pdftotext`, rendering) and `qpdf`; not tried in each reader.

## What changed in v2.23

- **Every PDF carries its KMZ.** The completion report, the Deficiency List and the rectification report each embed the KMZ of the same records, so the PDF and the map can be compared:
  - **Survey:** the survey KMZ (poles, other points, route, balloon photos). **PAT:** the defects as found. **Defect cleanup:** the defects and their fixes. **FAT:** the defects, the fixes and the verification.
  - A small **KMZ ATTACHED** stamp at the lower right of the first page (v2.24; v2.23 used a last page) names the file, what it holds and its **SHA-256**; click it to open the file. The PDF opens on its attachments panel where the reader supports it.
  - **Where it opens:** Adobe Acrobat Reader (computer and phone), Foxit and Firefox show PDF attachments. **Chrome, Edge and many phones' built-in viewers do not**: use one of the readers above. (Checked here with poppler's `pdfdetach`, an independent reader; not tried in each reader.)
  - The embedded KMZ is the Google Earth part (pins, balloons, photos at the KMZ settings), not the locked G-eSAA data; the PDF grows by its size (about 0.1–0.3 MB for a few elements; more with many photos). A KMZ over 60 MB is left out (the export says so: lower the KMZ balloon photo size, or export the KMZ on its own); if the KMZ cannot be made, the PDF is still made, without it.
  - Some readers list the KMZ twice (in the attachments list and as the stamp on the first page): it is the same file.
- **Shared PAT KMZ: Start the defect cleanup goes straight to the map.** On the contractor's phone, *Projects → Open a shared file* (or *Open with G-eSAA*) → **Start the defect cleanup** no longer opens the New project form: the cleanup project is made at once with the file's project data (site, vendor, Globe representative, form details, the online-sheet site, who recorded the PAT; the contractor representative is you), the map opens on the PAT's pins and the first item to fix is shown (*Photo of the fix*, *Fixed, no photo*, *Comment*, *Next pin*). Opening the same PAT again offers to open the cleanup already on the phone instead of making a second one. The same goes for **Start the FAT** from a completed cleanup.
- **The FAT only after the contractor's cleanup is completed.**
  - A shared **PAT** offers *Start the defect cleanup* or *Open the PAT itself* — no longer *Start the FAT*.
  - A shared **cleanup** offers *Start the FAT* only when that cleanup was **marked complete** before it was shared; otherwise it says the cleanup is not completed and only opens it to view.
  - On the phone: a PAT shows *Start the FAT* only once its cleanup on this phone is completed (the FAT then starts from the cleanup, with the fixes); a cleanup shows it only once it is completed. The cleanup's steps are now *Fix each defect* → **Complete the cleanup** → *Share the cleanup KMZ*; sharing an unfinished cleanup asks first, as the inspector cannot start the FAT from it.
  - A FAT can still be created empty from *+ New project* (FAT, no KMZ), as before.
- **PAT: No defects found.** When a PAT finds no deficiency, the project card shows **✓ No defects found** (on phones that may record the PAT: not on a contractor's phone when the admin turned off vendor recording):
  1. The form details are needed first (location, vendor, vendor representative), as for any PAT.
  2. **One site photo** is taken as the evidence of the inspection (GPS position, time, your name); the record has no defect form. Choose the element (and ID) if you like, then Save.
  3. **Complete the PAT — no defects found?** → the PAT is completed and locked, and **the FAT is recorded as done on the same date** (for a site of the online sheet, its PAT Date and FAT Date are both filled). No defect cleanup or FAT is offered (on this phone, and on any phone that opens its KMZ).
  - The card shows *Completed · no defects, FAT done*. The Deficiency List shows **NO DEFICIENCIES FOUND — PAT completed …; FAT done the same day**, and the completion report says so. A PAT with records but no deficiency (notes only) is completed the same way with *Mark task complete*.
  - The admin can *Undo complete*: the PAT and the FAT dates are both cleared.
- **Companies only from the online sheet.** Administration → *Companies and vendors* no longer has *Add* or *Import CSV*: the companies are read from the sheet's *Company List* / *Companies* tab with **Refresh from the sheet** (the read key, and the admin key when the sheet uses company keys). The admin company is matched to the sheet's name (or its ADMIN company). A new list cannot be saved without the sheet. The list keeps up to 300 names for offline phones; phones that read the sheet see them all.
- **Logos uploaded by the admin.** Administration → *Deficiency List form and report logos*: **Choose image…** for the left and right logo (PNG or JPEG; made into a small JPEG on white, at most 600 × 200 px). They are printed on the Deficiency List (PDF and Excel) and, new, at the top right of the completion and rectification reports, on every phone that takes the list. *Built-in* goes back to the app's own logos. **Department line 1 and 2** were already editable in the same group. With logos the list is too large for the full join QR code: join with the short code of the online sheet (or the join link).
- **Edited KMZ: “edited by unauthorized personnel”.** A locked PAT / cleanup / FAT KMZ whose data was changed after it was shared now opens an alert **⚠ KMZ edited by unauthorized personnel** (instead of a short message). New in v2.23: the map part (doc.kml: pins, balloons and their photos) is sealed too, so deleting or moving pins in the file is also detected and refused. The app can tell that the file was changed outside G-eSAA, not who changed it; a file damaged on the way gives the same alert.

## What changed in v2.22

- **Projects screen: a task list.** The open project is one card at the top: category, state, a progress bar (*1 of 5 steps done*, tap it to see the steps), **Next: …**, the stage buttons and *Mark task complete* (now at the bottom of the card, not a large green button at the top). The other projects are cards below with their progress and next step, filtered by *In progress / Completed / All* and by category, with a search box. The project dropdown is gone: tap a card to open that project.
- **Mark task complete** is off until the project has at least one record (the completion report does not complete an empty project either).
- **After a completed PAT: Start the defect cleanup and Start the FAT.** On the phone that has the PAT, a completed PAT shows **🛠 Start the defect cleanup (photo each fix)** and **✓ Start the FAT (check each fix on site)**; a completed cleanup shows *Start the FAT*. Once a cleanup exists, the PAT's *Start the FAT* starts it **from the cleanup**, so the FAT has the fixes and their photos. The new project opens with the elements; *Next defect* goes to each item, where the fix is photographed with an optional note (cleanup) or checked with a photo (FAT). Once started, the button opens that cleanup / FAT instead of making another. From another phone, the shared KMZ still starts them (Projects → Open a shared file).
  - Fixed: a cleanup or FAT started from a **completed** PAT (on this phone or from its KMZ) was itself marked completed. It now starts in progress.
- **PAT, cleanup and FAT record: optional sections fold.** *Element details · optional* and *On this pole · optional* are closed when a record opens, with one line saying what is in them (e.g. *Pole · Concrete · CC-0123*, *MLoop · NAP 12*). Tap the title to open or close. A reading from Scan ID opens Element details by itself.
- **Records list: groups fold.** With *Group by element* on, each group (Poles, ODF, NAP…) shows its count (and open items in PAT / cleanup / FAT) and is closed until tapped; *Open all* / *Close all* next to it. When the project has only one group it is shown open (nothing to choose between), and while you search the groups are open. A closed group's photos load when it opens.
- **No more D-0001.** An element saved without its ID is named by its item numbers everywhere: *Item 3* / *Items 2–3* on the map, in the list and in the visit card. In the Deficiency List (PDF form and Excel) the *Item / Reference* column shows the defect only (e.g. *NAP: NAP cover not closed*), the item number being in the *Item No.* column; the punchlist tracker leaves *Location ID* empty; the photo annexes, the rectification report, the KMZ pins and the photo file names (*item3_asfound.jpg*) use the item number. The record keeps its reference inside the app only to tell it apart; type the ID later if you find it.
- **Deleting a completed project needs an admin's approval** (any category, on a phone with a company list). *Delete this project…* shows a **request code** (e.g. *674-8SC*). The admin opens **Settings → Administration → Approve a delete**, types the request code and gives back the **6-digit approval code**; it works only for that request. An admin who is with the user can type the **admin PIN** instead. A project in progress is deleted as before. On a user's phone, **Undo complete** of a completed project asks for the same approval (otherwise it would get round it); a completed PAT is still reopened only by the admin. The approval key comes with the company list: **the admin saves the list once with v2.22** (until then only the admin PIN works).
- **Shared KMZ lock (PAT, defect cleanup, FAT only).** The G-eSAA data inside the KMZ files of PAT, cleanup and FAT (*Share … KMZ* and Export → KMZ) is encrypted and sealed with the organisation's **KMZ password** (AES-256-GCM, key from the password with PBKDF2-SHA-256, 150,000 rounds):
  - **Google Earth still opens the KMZ** and shows the pins, balloons and photos, as before. Google Earth has no password or "view only" for KMZ, so anyone can still hide, move or delete pins **in their own Google Earth copy** — that changes only what they see; it never reaches G-eSAA, which uses the sealed data, not the pins.
  - **The records, defects and full-size photos inside can be read only by G-eSAA phones that have the company list**, and a file whose data was changed after it was shared (a record edited, a photo removed or swapped) is **refused** (*The G-eSAA data in this KMZ was changed after it was shared*). A phone without the list gets *This KMZ is locked by “…”*.
  - **The password** is set by the admin: Settings → Administration → *Shared KMZ lock*. It travels inside the signed company list, so every phone opens the files by itself; nobody types it. If the admin changes it, files locked with the last five passwords still open.
  - **Not the company key.** You asked for *company key_COMPANY* (e.g. *9CCA68FC9388_GLOBE*). Because the password is sent to every phone of the list — contractors included — a company key in it would let any user read that key and sign in to the online sheet as that company (an admin company key would give inspector rights). So the suggested password is **26 random characters + _ADMIN COMPANY** (e.g. *7F5KWZPVWKQTUNAUDN5UNAXBWM_GLOBE*). If the admin types a password that contains this phone's company key, Save warns and offers a random one; the admin can still keep their own.
  - **A PAT / cleanup / FAT KMZ that is not locked** (made by an older version, or with the lock taken out and plain data put in) is not refused, as old files must still open, but it asks first: *This KMZ is not locked … Open it only if you trust where it came from.*
  - Every locked file in the KMZ is checked before anything is saved, so a changed photo does not leave half a project behind.
  - Until the admin saves the list with v2.22, KMZ files are not locked (as before). Survey KMZ, backups, bulk sharing and the other exports are not locked. **Phones on v2.21 or older cannot open a locked KMZ** (they say it has no G-eSAA data): update every phone before the admin saves the list.
  - What it does not do: the password is on every phone of the list, so someone with technical skill and a phone of the list could extract it. It stops changes and reading outside the app, not a determined insider.

## What changed in v2.21

- **Fixed: the survey photo could not be opened (full view, marks, pole model).** After a PAT, cleanup or FAT record without element photos, the photo row stayed hidden on the next survey record, so the photo could not be tapped. It is shown again for every survey record. (Reproduced on v2.20 and checked fixed.)
- **Nothing lost on a page refresh.** While a record is open, its photo, the form, the pin and the deficiencies (with their photos) are kept on the phone as a draft; so is a photo just taken while the camera waits for the ID scan. If the page reloads, the phone closes the app in the background, or the app is closed before Save, the next start asks **Unsaved record … Open it again?** — *Open it* brings the record back as it was (check it, then Save); *Discard* drops it. The draft goes when the record is saved, deleted or discarded.
  - **Back or × on a record with unsaved changes** now asks **Leave without saving?** (*Keep editing* / *Discard*) instead of closing at once. A record opened only to look at closes as before.
  - Pulling the page down no longer reloads it (Chrome's pull-to-refresh is off), and a reload or closing the tab with unsaved changes makes the browser ask first.
- **PAT, defect cleanup and FAT: no ID scan after the defect photo.** The photo goes straight to the record with the defect form open. To read the element's ID, tap **Scan ID** in the record (Element details), or turn the scan after each photo back on: Settings → Camera, or the **ID** button on the camera while in a PAT / cleanup / FAT project. Surveys keep their own setting.
- **Deficiency checklist: new categories show.** A category the admin adds to the checklist (Settings → Administration → *Deficiency checklist*) is now offered under *Where* for every element, before *Other*; before, only the built-in categories were shown. How a checklist change reaches everyone is below.
- **Project search:** with six or more projects on the phone, Projects has a search box (name, category, site, vendor, task ID, notes); tap a result to open that project.
- **Share several projects to a colleague:** Projects → **📤 Share several projects**: tick the projects (search and category filter, *Select all shown*), then **Share N projects**. One ZIP holds them all with their photos (and who sent them). The colleague opens it with **Projects → 📂 Open a shared file** (or *Open with G-eSAA*): the projects are listed; if a project of the same name is already on that phone, **Add to them** puts the records together (each record keeps who recorded it; one already there is updated) or **Keep apart** adds the sender's name to the copy. A file from another company asks once more (company names are compared as in the company list: *ABC Builders Inc.* = *ABC Builders Inc*). Opening the same file again with *Keep apart* updates the copy made the first time instead of making another; empty projects are not copied. For safe keeping, or when a user leaves: share all their projects to the colleague who takes over. Files over 1.5 GB of photos are refused: share fewer projects at a time.
- **Other fixes found while checking:**
  - A file shared to G-eSAA (Android *Open with* / *Share*) while a record or the camera is open no longer closes the record: it waits (*Save or close this record first*) and opens after the record is saved or closed.
  - The same file can be picked twice in a row in *Open a shared file* (before, the second pick did nothing).
  - The ID photo read in the background no longer opens over a record being saved or another screen; Back on a full-size photo no longer leaves a pending close stuck.
  - If the profile form is closed without saving, a file that was waiting for it is dropped instead of opening later by surprise.
  - A damaged ID-reader model file now falls back to the text reader instead of failing each scan.

### How a deficiency checklist change reaches all users

The checklist (categories and defects) is part of the **company list** the admin signs; every phone uses the list it has.
1. The admin changes it: Settings → Administration (admin PIN) → *Deficiency checklist* (add a category, add or edit the defect lines, one per line), then **Save and share the list**. This makes a new list version.
2. **With the online sheet** (Administration → *Online Google Sheet* set up, with the admin key): Save also writes the new version to the sheet, and every phone takes it the next time it reads the sheet — at start and on changes (at most every 10 minutes), every hour, or only with *Sync*, as each user set under *Sync with the online sheet*. To get it at once, a user taps the **Sync** button (⟳, top bar) or Settings → *Sync online sheet*. The phone shows *Company list updated from the online sheet: version N*. A phone that is offline gets it when it is next online.
3. **Without the online sheet:** share the new join link or QR code (Settings → *Share list*); each user takes it with Settings → **Update list** (paste the link or scan the QR). Until a user does, their phone keeps the old checklist.
- Records already made keep the defect text they were saved with; a removed or renamed line does not change them. New records use the new list.

## What changed in v2.20

- **G-eSAA's own ID reader.** A small neural network trained for pole tags — painted, stencilled and raised (embossed) characters — now reads each character the app cuts out of the picture (file `glyphs.js`, 140 KB, offline like the rest). It runs first on every reading: the live camera, the shutter, the ID photo, a tap or box on a photo.
  - **Used by itself only when sure:** an ID in a known format read exactly as painted (CC-0430621, CC-0123, FDU_100), every character at least 80 % sure. Otherwise the text reader (or ML Kit in the Android app) reads as well and the readings are combined; an ID both read counts more, and the network's other readings are offered as choices but never filled by themselves. On the live camera an exact reading (or one with X) still needs the same reading twice for a number painted without a prefix.
  - **Safer:** each character is read twice (as cut, and with more room round it) and the two averaged, so an unsteady reading comes out unsure. A number of one to three characters is never an ID. In a column, a character the search missed or took as hidden is looked for again, a dash is only accepted after the prefix's letters, and a character half under a cable at either end of the column becomes an X (at most two X); a reading with something left out is shown as unsure.
  - **Speed (this computer, Chromium):** about 0.1 s for a clear tag, where the text reader took 0.1–0.2 s and up to 2.7 s on the farther 0430621 frame (which it misread as CC-083321; the network reads it right). Live camera, time to the ID being used by itself: 1.4 s (v2.19: 2.2 s) for the 0430621 tag, 2.0 s (2.7 s) for it with a cable across, 1.7 s (2.4 s) with a box drawn round a small tag; a tap on the photo 0.6 s. Phone timings were not measured.
- **The two IDs that could not be read — results, honestly:**
  - **CC-04X0652** (the far photo with the cable): the network finds 4, 0, 6 and 2, and marks the character under the cable and the first 0 (half under the cable) as X. The 5 is about 9 px tall in this 1536 × 2048 picture and is read as a 6, so the reading (CC-X4X0662) is only offered, not filled. A closer picture — the 2× / 4× zoom, or the ID photo button, which uses the phone camera's full size — gives the characters the size they need.
  - **GT-962574** (raised letters on a blue tag): still not read reliably. The owner's name is usually found (GLOBE, or one letter off, which still gives GT); the number only in part (9625, 96254). Type it. The Android app's ML Kit reader is made for such text but could not be tested here.
- **Checks:** 100 pictures with no ID (leaves, sky, cables, posters, the pole) never gave a reading the app would use by itself; the painted test pictures (CC-0123 painted, blurred, dark and soft, FDU_100, CC-0457 downwards, WP-0088 sideways) read as before; the 0430621 tag reads right in all six crops round it tried (the 4284-px photo at two sizes, camera frames at three distances) and as CC-043XX21 with a cable drawn across; in the camera's whole box on the two farther frames the network is unsure and leaves them to the text reader (live, the box first closes in on the tag).
- **How it was made:** trained here on 400,000 synthetic characters (22 fonts on this computer, mostly bold, with stencil cuts, blur, noise, JPEG, cables, neighbours and two kinds of raised-letter lighting); none of your photos was used for training. Your photos were used to check it and to tune how characters are cut out of the picture. The training scripts are in `tools/glyph-training/`.
- `build-apk.yml`: copies `glyphs.js` into the APK (one word added). The online sheet script did not change.

## What changed in v2.19

- **PAT, defect cleanup and FAT: the deficiencies come first.** The **Deficiencies** box (Where, Defect, Category, Notes, defect photo) is now at the top of the record, under the lock notice. Below it, **Element details · optional** (element, type, ID, pole details) and **On this pole · optional** (MLoop, NAP, Closure) are extra details that relate the defect to the element; none of them is required.
  - **The ID is optional.** The field starts with the prefix only (CC-), no number is guessed any more. Saved empty or with only the prefix, the record gets a reference **D-0001**, **D-0002**… (in this project), shown on the map, in the lists and in the exports; type the ID later if you find it. The format warning is not shown for an empty ID.
  - **Pole details** (transformer, streetlight…) can be added to a pole in PAT, cleanup and FAT too; in a completed PAT they are shown, not changed.
  - The **ID scan after each photo** is set apart for PAT / cleanup / FAT and for surveys: the **ID** button on the camera changes it for the kind of project you are in, and Settings → Camera has both (*Surveys: …* and *PAT, defect cleanup and FAT: …*). It stays on unless you turn it off; **Skip** passes it.
- **Scan ID: ID photo.** The camera button on the scan bar (📷) makes the camera focus on the box, takes a full-size photo and reads the ID on it twice — the box, and the ID found around the box — and fills the ID only when both readings agree (in one test run under heavy load a single reading gave 0430521 for 0430621, so one reading is not trusted). Otherwise the readings are offered as chips and the ID photo opens: **tap the ID** on it or **draw a box round it**. Works in the ID step after a new photo and from *Scan ID* in the editor. Tested on the 0430621 field photo: read in about 2–4 s; on a wide view with a small tag outside the box, the photo opened and a tap on the tag read it. On the phones' cameras the photo is larger than the live picture (12 MP and more), which is where it gains detail; the test camera here gives the same size as its live picture.
- **Opening a shared file (PAT KMZ, cleanup KMZ, backup ZIP):**
  - **Projects → 📂 Open a shared file** on any phone. G-eSAA reads what the file is and asks: a **PAT** → *Start the defect cleanup* / *Start the FAT* / *Open the PAT itself*; a **cleanup** → *Start the FAT* / *Open the cleanup itself*; a **FAT** or a **survey backup** → *Open*. Starting a cleanup or FAT opens the New project form filled (category and file): check the details and tap Create. *Open … itself* restores it into its own project.
  - **Android app (APK): open it directly.** In WhatsApp, Files or Drive, tap the KMZ / ZIP → **Open with → G-eSAA**, or **Share → G-eSAA**. The app opens and asks the same question. (Many apps send a KMZ as an unknown file type, so G-eSAA may be offered for other files too; it says so if a file is not a G-eSAA file.) This needs an APK built from this version's `build-apk.yml`; if that part fails to build, the build continues without it and the release notes say so.
  - **Installed web app on Android:** **Share → G-eSAA** works too (the file is handed over through the app's offline cache). On a computer, Chrome's installed app can open .kmz / .zip files with G-eSAA. A plain browser tab cannot receive files: use *Open a shared file*.
  - Export → Restore also accepts the KMZ now.
- **Move to another phone — how the new phone reads the QR:** G-eSAA has its own QR reader. On the new phone, open G-eSAA and tap **Scan QR code** on its first screen (a phone already set up: Settings → *Update the company list* → **Scan QR**), then point it at the code on the old phone; **🖼 From a picture** reads a screenshot of the code. The phone's own camera app also reads it, but it opens the link in the browser (the website version), not in the APK. Projects and photos: Export → Backup on the old phone, then **Projects → Open a shared file** on the new one.
- **Models on the photo:** the cabinet model is now named **Proposed ODC (outdoor cabinet)** (marks made with v2.18 open as ODC). New: **Proposed ODF (rack panel)** — a 19-inch rack-mount ODF like the 3U panel in the photo sent (rack ears, label strip, four rows of blue SC adapters), placed **corner to corner** like a red box so it fits the space in a rack, and **Proposed data rack** — a 42U cabinet with rails and units, placed from the floor up to its top. The starting model follows the element (ODC → ODC, ODF → ODF panel). The records list tags them *ODC model*, *ODF model*, *data rack model*.
- Dialogs with three or more choices list them one under another (Cancel last).
- `build-apk.yml` changed (new step *Open shared files in the app*); the online sheet script did not change.

## What changed in v2.18

- **Hidden characters read as X:** when a cable, a strap or dirt covers one or two characters of a tag painted downwards, the gap they leave in the column is counted and the ID is read with an **X** for each hidden character, e.g. **CC-04X0652**. An X is never taken as a sure reading; the editor says *X = a character the camera could not read* — type it if you can see it, or keep the X. A character hidden at the very top or bottom of the column cannot be counted (nothing shows it is missing). Tested with a cable drawn across two digits of the 0430621 field photo: read **CC-043XX21** by the live camera in about 3 s. The 04?0652 photo sent was a reduced picture (digits about 9 px tall): the app finds 4, the hidden character and 0652, but cannot read characters that small, so it gives no reading rather than a wrong one; a closer photo or the 2×/4× zoom gives it the detail.
- **Safer readings of vertical tags:** a reading with more characters than the column has (the reader once saw 04306521 in 0430621) is retried at another size and otherwise dropped; a reading with a look-alike letter (O for 0, S for 5…) on a number-only tag is corrected but never taken as sure.
- **Owner's name on the tag:** a tag reading **GLOBE** with the number under it is saved as **GT-962574** (the name of any pole type stands for its prefix: Globe → GT, Bayantel → BT, and types added by the admin). Embossed tags (raised letters, same colour as the tag) are not read by the website's reader (tested on the GLOBE 962574 photo: no digits read); the Android app's ML Kit reader is made for such text but could not be tested here — type the ID if it is not read.
- **IDs of letters and digits:** an ID is kept as written when it mixes letters and digits (GT-0123B, S0123B, KV0123 under GLOBE → GT-KV0123), and the Pole ID check accepts letters after the prefix. Look-alike letters are changed to digits only inside a number (43O621 → 430621, CCO457 → CC-0457), never a letter at the start or end of an ID, and such a reading is offered but never taken as sure by itself; the reading as written is offered too.
- **Draw a box round the ID** (instead of a swipe): on the camera during the ID scan, and on the photo (*🔍 Read ID*), drag from one corner of the ID to the other; a box taller than wide is read as a vertical ID. A tap still focuses (camera) or finds the ID (photo). The scan box and the drawn box have slimmer lines.
- **Models on the photo:** **⊥ Model** (every survey photo) now places a **proposed pole, proposed ODF (cabinet), proposed handhole** or **new tower location**, chosen beside the button (it starts with the one that fits the element: ODF/ODC → ODF, Handhole → handhole, Site → tower). Each is placed from where it stands up to its top (a handhole: from its front edge up to its back edge on the ground), is burned into the photo with its label and stays editable; the records list tags them (*ODF model*, *HH model*, *tower model*).
- **Status above Element and Type** in the editor.
- **Text size:** **Small** is the default (a size chosen before is kept); **Very small** added (Settings → About → Text size).

## What changed in v2.17

- **Swipe to mark the ID (camera):** during the ID scan, swipe your finger along the painted ID — **down** a vertical ID, **across** a horizontal one. The box goes exactly where you swiped and stays there (the app stops searching), its direction follows the swipe, the camera focuses on it, and what is in the box is read until the ID is clear. A tap, a new swipe or a zoom change releases it. Tested on the 0430621 field photo at 1× zoom, where the box could not find the small tag by itself: swiped, it read **CC-0430621** in about 1.5 s.
- **Tap to focus:** a tap on the ID now focuses the camera at that point of the picture (it pointed at the wrong spot when the picture is wider than the screen) and the box looks there; after about 6 s the camera focuses by itself again. Phones that do not allow focus control ignore it.
- **Read the ID from the photo:** on the scan bar, the **picture button** opens the photo you just took, ready to read; or tap the photo in the editor → **🔍 Read ID**. Then **tap the painted ID** (the app finds it around your finger) or **swipe along it**. The full-size photo is used, so a small tag reads well; the result fills the Pole ID with the other readings as chips. (Survey photos; in PAT, cleanup and FAT the photo is of the defect, so use *Scan ID* there.)
- **Steadier live reading:** the app measures how much the picture moves between frames and reads only when it is steady (*Hold steady…* on the box), but never waits more than 1.5 s, so a shaky hand still gets a reading. The camera keeps refocusing by itself (continuous focus) where the phone allows it. The steadiness limit was set on test pictures: the App log records the movement (*motion*) and the readings held back (*held*) for each scan, so it can be tuned from phones. The phone's own image stabilisation cannot be controlled from the app.

## What changed in v2.16

- **Pole tags painted downwards** (one character per line, e.g. 0-4-3-0-6-2-1 with a ★ under it): the ID box now finds a column of characters near the centre by itself and **turns to vertical** (and back for a horizontal ID); tapping ⇆ or ⇅ fixes the box's shape for that scan. Each character is cut out of the picture and set out as one line before it is read, so the pole's edge, cables and leaves beside the tag are left out and the star under the number is ignored. Tested on a field photo (tag 0430621 → **CC-0430621** with Concrete as the type, read by itself in about 2 s when the tag fills roughly a third of the picture's height; a tag that is small in the picture needs the 2× or 4× zoom). A number with no prefix gets the type prefix as in v2.15 (the last pole's type, or the Type in the editor; changing the Type changes the prefix).
- **Safer reading of vertical IDs:** a reading with fewer characters than the column shows, or a column cut off by the box, is not used; a number painted without a prefix needs the same reading twice before it is taken by itself. Known prefixes now take numbers of up to 8 digits (CC-0430621).
- **Phone camera app (fallback):** when the ID is not found in the chosen direction, the other direction is read too.
- **A completed PAT is locked.** *Mark task complete* on a PAT asks **Complete and lock the PAT?** and first needs the form details (location, vendor, vendor representative). After that, on every phone: no element or deficiency can be added, changed or removed, no photo added or removed, and the form details are frozen; records open **view only** (Close instead of Save). Exports, *Share PAT KMZ* and *Start FAT* still work. **Only the admin of the company list can Undo complete a completed PAT**; deleting any completed project needs an admin's approval code or the admin PIN (v2.22; on a phone with no company list, its user can). Items are tagged as fixed in the next stages:
  - **Defect cleanup and FAT:** an element that came from the PAT keeps its ID, element, type and pin, cannot be deleted, and its PAT items cannot be removed (as before). Each item is tagged fixed (photo of the fix, Mark rectified), verified or rejected, with remarks and extra photos. New findings added in the FAT can still be removed.
- **Surveys** (As-plan, As-built, Audit) stay editable after completion: add, change and remove as before.
- No change to the online sheet script or `build-apk.yml`.

## What changed in v2.15 (from the design review)

- **Joining:** by join link or QR code only; *Open list file* and *Share as file* are gone. The QR code is short when the list is in the online sheet (see "First use"), the scanner uses a sharper camera picture and reads dense codes from the centre of the picture at full detail, and **🖼 From a picture** reads a QR code you received as a screenshot or photo. In the APK, Google ML Kit reads the QR codes (see below).
- **Projects:** no more *Default project*. After your details are saved the New project form opens, and the camera asks for a project first. An empty *Default project* from an older version is removed; one with records stays as a normal project. **+** (top right of Projects) makes a new project. In *New project*, **Task category, Purpose, Project name and Survey start date** are required (marked *): Create says what is missing and outlines it in red. A survey's purpose must be chosen (no longer preset to As-plan).
- **Map:** the version shows under the name (G-eSAA v2.15.0); the map-pack button left the map (Settings → Maps); **Legend** explains the pins. During a defect cleanup or FAT visit the map shows **you, the pin, and a dashed line with the distance and direction** (e.g. *40 m SW*), both kept in view above the card.
- **ID scan:** a slim bar with icons (⇆ horizontal, ⇅ vertical, *i* for help, Skip) instead of the large panel. **Poles painted with a number only** (e.g. 88123) are read and saved with the type prefix: GT-88123 for a Globe pole (the type of the last pole, or the Type in the editor; typing 445566 also gives GT-445566). Reading is faster: a smaller picture for the reader, reads every 0.2 s, and in the APK Google ML Kit reads the text on the phone (much faster; the website keeps its own reader).
- **Editor:** a classic map pin; Element and Type side by side; the photo shows ⤢ (tap for the full photo, where the red box and pole model tools now are); the camera reading sits behind an *i*; pole details are small chips; the help text under the photo is gone; the Save bar stays above the on-screen keyboard and the small map steps aside while typing.
- **Model pole:** plain round pole, no crossarm.
- **Records:** grouped by element (Poles, Sites, ODF…) with counts, and **Sort**: newest, oldest, ID A→Z / Z→A, status.
- **Projects:** **✓ Mark task complete** is at the top, green, with how many steps are still open; when every other step is done the map strip shows **✓ Complete** (one tap to Projects).
- **PAT:** the defects are a dropdown (tick one or more); the map hint is not shown in PAT, cleanup and FAT; defect photos show ⤢ and open full size; *Share PAT KMZ* is a short button with a share icon. Visit cards say **Defect** instead of *As found* (the printed forms keep their wording).
- **Settings:** **Move to another phone…** makes one link / QR code with your company list and details; on the new phone they are filled in for a check and Save (projects go with Export → Backup; admins enter the PIN again). Contractor users no longer see the list details, *Share list* or *Switch list* (they keep *Update list*). **Sync with the online sheet:** on every change (default), every hour, or only when you tap Sync.
- **APK build:** `build-apk.yml` adds a small ML Kit reader (text-recognition 16.0.1, barcode-scanning 17.3.0, models inside the APK, so the APK gets larger). If that build ever fails, the workflow builds the APK without it and says so in the release notes; the app then uses its own reader as before.
- No change to the online sheet script.

## What changed in v2.14

- **DXF with photos and FOC lengths:** each pole is a circle with its Pole ID and photo beside it; the linked route carries the FOC length of each span (span + allowance, default 10 %, set in the DXF options). Exported as a ZIP (DXF in AutoCAD 2000 format + JPEGs, keep them together); untick *Photo beside each point* for a plain DXF R12. See "AutoCAD".
- **Save beside the photo:** a **Save** button sits to the right of the photo details at the top of the editor (the bottom Save stays).
- **Text size:** Settings → About → *Text size* (Small, Normal, Large, Extra large, Largest) for the whole app; kept on the phone.
- **Pole details** on survey poles (Transformer: 1 pc…). See "Survey points".
- **Full photo:** tap the photo in the editor (also on a saved pin, and defect / rectified / verified photos) to see it full screen; tap the picture to zoom, Back or ✕ to close.
- **Proposed poles (As-plan):** status *Proposed*, IDs PP-0001, a model pole or red box burned into the photo.
- **As-built:** poles, closures, ODF and the other elements are marked **New (built)** or **Existing (used)**.
- No change to the online sheet script.

## What changed in v2.13

- **New name and icon: G-eSAA** (Geo electronic Survey, Audit & Acceptance; v2.13.1). Installs over PoleCam and keeps all projects (see the top of this file).
- **PAT, defect cleanup, FAT: photos of defects only.** The capture photo is the as-found photo of the defect (the defect form opens with it); no pole, ODF or closure photo is taken. Fix photos (cleanup) and verified photos (FAT) are per item as before. Records from older versions keep their element photos.
- **Survey points:** site, ODC, ODF, NAP, closure (POI) and handhole as their own pins, with a status per purpose (As-plan proposed / existing, As-built new / existing, Audit existing), remarks, and a **red box** burned into the photo. See "Survey points".
- **As-plan surveys** can be completed only with every pole photographed, the site, an ODF or ODC location and a POI.
- No change to the online sheet script.

## What changed in v2.12

- **Photos as proof in the completion report:** after page 1 come the photo pages.
  - **Survey:** every pole photo as a collage, 12 a page (3 × 4), each with the pole ID and the time it was taken. A photo the camera check had flagged (taken with an older version) is marked in red.
  - **PAT, Defect Cleanup, FAT (v2.12.1):** only the deficiency photos. Each punchlist item shows, side by side, the photos taken so far: **as found** (PAT), **rectified** (contractor) or the **rejected** fix with the reason, and **verified** (FAT). The item number, element and time are burned into each photo (as in Annex A of the Deficiency List), with GPS and who took it under it, at 1200 px so the defect can be read when zoomed in. A step done without a photo is written out (*Marked rectified without a photo*, *Verified on site without a photo*). Element photos are not included.
  - Page 1 lists how many photos follow (e.g. *3 as found · 2 rectified · 2 verified*) and which items have no photo at all (observation notes need none).
- Export → Completion report → *Options*: untick **Add the photo pages** for page 1 only.
- No change to the online sheet script (the v2.11 script works as is).

## What changed in v2.11

- **Site list** shows `Territory_Project Name_Serial Number_PLA ID_Site Name`. **Project name** = `CATEGORY_Project Name_Serial Number_PLA ID_Site Name`; **Location / site** = `Serial Number_PLA ID_Site Name`.
- **Task category** is no longer preselected; **Purpose** lists only the purposes of the chosen category (Survey: As-Plan, As-Built, Audit). New purpose **Audit**.
- **Completion report** (PDF) on the Export screen and **Mark task complete** on the Projects screen; a new last workflow step *Complete the task*.
- **Progress dates in the online sheet:** Survey Start Date, Survey Completion Date, PAT Date, FAT Date and a Status formula (see "Progress written to the sheet").
- **Sync button** on the top bar (orange dot = dates waiting to be sent).
- **KMZ fix:** KMZ files saved from Google Earth with data from Organic Maps / MAPS.ME (`mwm:` tags without their declaration) and KML files with a stray `&` now open; UTF-16 KML files too.
- Needs the v2.11 `PoleCam-online-sheet.gs`: paste it, **Save**, run **setup** (adds the columns), then **Deploy → Manage deployments → Edit → New version**. The older script still serves the sites; only the dates are not written (the app says so).
