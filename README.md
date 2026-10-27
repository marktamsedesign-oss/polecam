# PoleCam Survey

Four task categories per project: **Survey** (As-plan or As-built), **PAT**, **Defect cleanup** and **FAT** (acceptance **List of Deficiencies** on the office form — see "Acceptance mode"). The category shows on the project button at the top right. One shareable **KMZ** carries the PAT to the contractor's cleanup and on to the FAT (v2.5).

**v2.0** — the Deficiency List exports are the office form (PDF and Excel) with photo annexes; deficiencies go through *found → rectified → verified*; the admin sets the company policies (admin company, form wording, checklist, field standards) inside the signed company list; the settings are split into what users set and what only the admin sets; every export has detailed options (photo size, stamps, KMZ icons, PDF annexes). See "What changed in v2.0".

One phone app that replaces GPS Camera + the Windows geolocator step:

1. **Capture** – take the pole photo inside the app; GPS is recorded at the shutter (green shutter = GPS ready).
2. **Scan the ID** – right after the photo, point the camera at the painted ID (pole, ODF or any other): the box finds the ID by itself, follows it like a face-detection box and reads it (v2.6). Pinch or tap 2× / 4× to zoom in on a high or far ID; tap the ID on screen if the box picks something else.
3. **Correct the pin** – drag the map under the slim pin until it sits on the pole; switch street / satellite / offline map while you do it.
4. **Pole ID + type** – Concrete (CC), Wood (WP), Steel (SP): IDs CC-0001, WP-0001, SP-0001; Globe (GT) and Bayantel (BT) poles keep the number painted on them (GT-88123); other owners (PLDT-, …) are added by the admin for everyone or with “+ Other prefix…” at the end of the Type dropdown on one phone. ODFs FDU_100. The next ID is suggested; duplicates are flagged.
5. **Export** –
   - **KMZ** for Google Earth: pins named by Pole ID, photo as the pin icon, photo in the balloon.
   - **DXF** for AutoCAD: one block per pole type (`POLE_CONCRETE`, `POLE_WOOD`, …) at **UTM Zone 51N (WGS84) meters**, Pole ID text on layer `POLE_LABEL`, plus optional OpenStreetMap road centerlines (`OSM_ROAD_MAJOR` / `MINOR` / `PATH`, road names on `ROAD_NAME`).
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
- **Joining (v2.9):** Settings → Company list → *Share list* → **Send the join link** (Viber, Messenger, email), or let the user scan the QR code with the phone's own camera. Opening the link opens PoleCam in the browser and joins the list; then the user chooses their company. In the APK: *Paste link* or *Scan QR code* on the first screen. *Share as file* still works, and the QR code works with no signal.
- **Updates (v2.9):** when the online sheet is connected and the sheet's **Admin key** is entered on the admin phone, every saved list version is also kept in the sheet, and each phone takes it by itself when it reads the sheet (on opening the app, at most every 10 minutes, or *Sync online sheet*). Without the sheet, updates go by join link, QR code or file as before.
- **How it stays trustworthy:** the list is signed with a key that travels inside it, encrypted with the admin PIN. A phone accepts a new version of its list only when it was made with that PIN (or, for lists from v1.x, by one of the admins named in it), and rejects a list edited by hand. Each list has a code (e.g. MV3H-EQCB) shown when joining; a different list needs *Switch list* and a warning.
- See **Who is admin, and one list for the whole organisation (v2.9)** below for admin users and tying the app to your list.
- Lists made with v1.7–v2.0 (per-person admin keys) keep working. Their admin opens *Manage (admin)* once, sets the admin PIN and saves; after that the admin-company model applies and the old “ask to become an admin” step is gone.

## Who is admin, and one list for the whole organisation (v2.9)

| Who | What they do |
|---|---|
| **Admin** (you) | Admin company (e.g. GLOBE) + admin PIN, and on the *Admin users* list. Makes and changes the list, sends the join link. |
| **Other admins / inspectors** | Only people you add: Manage → **Admin users** (one email per line), then they choose GLOBE in their profile and enter the PIN. |
| **Everyone else** | Joins with your link, chooses their own company (vendor). Cannot open Manage, cannot choose GLOBE. |

- **Admin users:** blank = anyone of the admin company with the PIN (as before). When you list emails, only those people can choose the admin company or open Manage, even with the PIN. Removing someone takes their admin rights away when their phone next reads the list. The admin who saves always stays on it. Change the PIN too when someone leaves (Manage → *Change the admin PIN*).
- **One list only (org.json):** Manage → **Tie the app to this list** → *Download org.json*, then upload `org.json` to the main folder of the GitHub repository (next to `index.html`). The website and the next APK build then carry it: new users only see *Join*, nobody can create another list in the app, and a join link or QR code of any other list is refused. To undo it, delete `org.json` from the repository. If you change the admin PIN twice, download org.json again and replace it (the admin screen reminds you).
- Without org.json, a new user could still make a list of their own on their own phone. It never changes your list, your sheet or other phones (they only take versions signed with your PIN), but it confuses people, so tie the app once your list is ready.
- **A phone that already has another list** (for example one made while testing): open your join link on it and tap *Switch*.

## The process: Survey → PAT → Defect cleanup → FAT (v2.5)

**Projects screen** (tap the project name on the top bar):
- **PROJECT** dropdown: switch to another project on this phone.
- **+ New project**: a short form, see below.
- The current project's **Workflow** checklist: what is done, what is next, and a *Next* button that opens the right screen. The strip above the navigation shows the next step too.
- **Project details** (folded): rename, purpose, KMZ reference, remarks / notes, the form details of a PAT / FAT, *Share the KMZ*, delete.

**New project form (v2.8)**

| Field | What to put |
|---|---|
| **Project name** | Tap the field (or **▾**) to pick a site from the online sheet, or type any name. Without a sheet, or with no site listed for your company, just type it. |
| **Task category** | Survey · PAT · Defect Cleanup · FAT |
| **Purpose** | As-Plan Creation · As-Built Creation · PAT · Defect Rectification · FAT. Category and purpose follow each other (a survey is As-Plan or As-Built). |
| **KMZ** | Survey / PAT: the **KMZ reference** (HLD route, homing, POI), optional. Defect Cleanup: the **PAT KMZ** (required). FAT: the **PAT / cleanup KMZ** (without it the FAT starts empty). For Cleanup / FAT with a KMZ the name may stay blank: it comes from the KMZ. |
| **Remarks / notes** | Optional; kept with the project (Project details). |

The form remembers the last category you used.

| Stage | Who | Steps (the app ticks them off) |
|---|---|---|
| **Survey** (As-plan or As-built) | survey team / contractor | Optional: load the **HLD KMZ** (route, homing, POI) as a reference · 1 Capture the poles (photo → ID scan → pin check; *No tag → NPT* for untagged poles) · 2 Link the route (follow the HLD or reroute where it is not doable) · 3 Export for design (KMZ, DXF, CSV, photos; file names carry ASPLAN / ASBUILT) · 4 Back up |
| **PAT** (provisional acceptance) | Globe inspector with the contractor | 1 Form details · 2 **Record the defects**: only the elements with defects, each tagged N, D or MD (the defect form opens with the editor; a new PAT record cannot be saved without one) · 3 Export the Deficiency List · 4 **Share the PAT KMZ** with the contractor |
| **Defect cleanup** | contractor | 1 Open the PAT KMZ (Projects → **+ New project** → Defect Cleanup → PAT KMZ) · 2 Walk to each red pin: tap it → **📷 Photo of the fix** (or *Fixed, no photo*), **💬 Comment** · 3 **Share the cleanup KMZ** for the FAT |
| **FAT** (final acceptance) | Globe inspector | 1 Open the cleanup KMZ (or the PAT KMZ) · 2 Walk to each pin: **✓ Accept**, **📷 Accept with photo** or **✗ Reject** with a reason · 3 Export the final Deficiency List (as found → fixed → checked photos in Annex A) and the rectification report |

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
- **+ Add deficiency** (inspectors): pick where (Pole, Cable/strand, MLoop, NAP, Closure, ODF, ODC, Rack, Other), tap one or more defects from the checklist, set **Major (MD)**, **Minor (D)** or **Note (N)** — the codes printed on the form — add notes and the *as found* photo. The checklist is set by the admin for everyone.
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

The logos printed on the form are `brand/logo-left.jpg` and `brand/logo-right.jpg` in the app folder (taken from the template); replace the files to change them. The header wording (company, address, departments, signatory titles, inspection types, legend) is set by the admin and travels with the company list.

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
- **Camera button position:** Settings → Camera → *Position*: Right (default), Center or Left, for the capture button on the map and the shutter in the camera.

## Camera checks, Pole ID reading, route (v1.5)

**Camera checks**
- A photo is kept only if a GPS update arrived within **5 seconds** of the shutter (always on since v1.7). The camera's GPS pill shows how old the last fix is ("now", "3 s ago") and the shutter turns red after 5 s.
- Every photo is checked: **dark, blank (no picture detail), overexposed or blurry photos are refused** and must be retaken; there is no *Use anyway* (v1.7). *Strict* (default) needs readable detail; *Normal* refuses only clearly blurry photos. The thresholds were set on test images, not yet on a range of real phone photos: if good photos get refused in the field, switch to Normal and report it.
- With the phone's own camera app (fallback), the GPS check uses the fix taken right after you return to PoleCam.

**Reading the painted Pole ID (offline)**
- **Picture first, then the ID (v1.7):** after the photo is kept, a guide box appears. Get close to the painted ID, fit it in the box and tap the shutter. Choose **Horizontal ID** or **Vertical ID** (characters stacked top to bottom, or the whole ID turned sideways); the app remembers your choice. It reads the ID on the phone (Tesseract OCR, no internet).
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
| Name, mobile, email, company | List name, companies/vendors (typed or CSV), the **admin company** and its **admin PIN** |
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
3. In PoleCam: Settings → Administration → **Manage (admin)** → *Online Google Sheet*: paste the URL and the Read key (from the Settings tab), **Test connection**, then **Save and share the list**. Optionally enter the Admin key on your own phone so **Import companies from CSV** also adds them to the sheet.
4. Phones get the sheet address with the next list update (QR code or file). Anyone with the URL and Read key can read the three lists, so treat them like a password.

**On the phones:** Projects → **+ New project** → *Project name* **▾** lists the open rows for the user's company (admins see all). Picking one fills the project with its category, site and contractor; for a Defect Cleanup or FAT choose the KMZ in the same form. Settings → Administration shows when the sheet was last read, with *Sync online sheet*.

### Updating the script (needed for v2.5 map packs, the Defect cleanup category, v2.6 company filtering and v2.9 list updates through the sheet)

1. Open the online Google Sheet → **Extensions → Apps Script**.
2. Click in the code (`Code.gs`), select all (Ctrl+A), delete, paste the whole new `PoleCam-online-sheet.gs`, **Save** (Ctrl+S).
3. In the function list at the top choose **setup** → **Run**. If Google asks, **Review permissions** → your account → *Advanced* → *Go to … (unsafe)* → **Allow** (it is your own script). It only adds the new Settings rows and the CompanyKeys tab; nothing is deleted.
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

### Tasks from your own database, filtered by company (v2.6)

Instead of typing tasks in the Tasks tab, the sheet can read them from your own tracker spreadsheet and send each company only its own rows.

1. **Settings tab → Tasks source**: paste the URL of the tracker spreadsheet; **Tasks source tab**: its tab name; **Header row**: the row with the column headers (1 if the headers are in the first row). The Google account that deployed the script must be able to open the tracker.
2. **Column: …** rows: type the header of each column as it is written in the tracker, at least **Column: Project** (the site / cluster / project name that becomes the PoleCam project). Leave a row blank to let the script guess (it knows common names such as Site Name, Vendor, Contractor, Status, Remarks) or type `-` to leave a column out. **Column: Company** is the column that says which company the row belongs to (usually the vendor/contractor column; when blank, the Contractor column is used).
3. Optional: **Only rows where** (e.g. `Region = MIN`), **Default category** (when the tracker has no Survey/PAT/FAT column), **Closed statuses** (rows whose status starts with these are not sent, e.g. Accepted, Closed).
4. **Companies that see all tasks**: the admin company, e.g. `Globe Telecom`. Its users get every task; every other company gets only its rows (and rows with no company, unless *Blank company = everyone* is No). Company names match without case, punctuation or Inc./Corp. endings, so "ABC BUILDERS, INC" and "ABC Builders Inc." are the same company.
5. In the Apps Script editor choose **testSource** → **Run** → *Execution log*: it lists the columns it found, how many rows were read and skipped, and how many tasks each company gets. Fix the Column rows until it looks right. Changes reach the phones within 5 minutes (the script keeps a copy for 5 minutes so a large tracker is not re-read on every request).
6. **Strict split (optional):** without keys, each phone reports its own company, so someone who has the Read key and changes the app could ask for another company's rows. For a strict split choose **makeCompanyKeys** → **Run**: every company in the Companies tab gets a key in the CompanyKeys tab (the admin company gets *Sees all tasks: Yes*). Send each company only its own key; their users enter it once under Settings → Administration → **Company access key** (the field appears when the sheet asks for it). From then on a phone without the right key gets no tasks, and phones older than v2.6 get none either. Delete a row's key to cut a company off.

Only the task fields (task ID, project, category, site, contractor, company, Globe representative, notes) go to the phones; other tracker columns never leave Google.

**Company names from a CSV (admin):** Manage (admin) → *Import companies from CSV*: the column named Company/Vendor/Contractor/Name, or the first column; duplicates are skipped. You can also paste names straight into the sheet's Companies tab.

## The shareable KMZ: PAT → defect cleanup → FAT (v2.5)

On the PAT phone: Projects → (PAT project) → *Project details* → **Share the PAT KMZ** (or the workflow's *Next* button). It is one `.kmz` file: Google Earth shows the defect pins with their photos (open it on a PC to review), and PoleCam reads the records and the original photos stored inside it (folder `polecam/`, ignored by Google Earth). Send it by Viber, Drive, email or USB.

- **Contractor:** Projects → **+ New project** → category **Defect Cleanup** → **Choose KMZ…** (the PAT KMZ) → **Create project** → walk the pins and photo each fix → **Share the cleanup KMZ**.
- **Inspector:** Projects → **+ New project** → category **FAT** → **Choose KMZ…** (the PAT or cleanup KMZ) → **Create project** → accept or reject each fix → export the final Deficiency List.
- The KMZ from Export → *Google Earth · KMZ* carries the same data unless *Include the PoleCam data* is unticked under its options (for a smaller file only for Google Earth).
- On one phone, *Start FAT from this PAT / cleanup on this phone* does the same without a file. PAT files (ZIP) from v1.8–v2.4 still open.
- Picking an online row with category *Defect cleanup* or *FAT* sets that category; choose the KMZ in the same form.

## AutoCAD

- Open the DXF directly or `INSERT`/`XATTACH` it into your drawing. Units are **meters**, coordinates are **UTM 51N (WGS84)** — your drawing must use the same system to line up.
- To use your own pole model: redefine the block (`BEDIT POLE_CONCRETE`, or `-INSERT POLE_CONCRETE=yourpole.dwg`) and every pole of that type updates.
- Pole symbol radius and label height are set in Settings → CAD export.

## Data safety

Settings → Storage shows how much PoleCam uses and the most this phone currently lets it use (for example “up to about 10 GB”). That limit comes from the phone and browser, not from PoleCam; it is a share of the phone's free space and changes as the phone fills up.

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
| `brand/logo-left.jpg`, `brand/logo-right.jpg` | Logos printed on the form |
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

## Offline Android APK (built by GitHub Actions)

`.github/workflows/build-apk.yml` packs every app file into a signed APK on GitHub's servers, so the APK installs and runs with no internet. Map packs come from Google Drive or a file, and the street/satellite maps need internet.

- One-time setup: add the repository secrets `POLECAM_KEYSTORE_B64` and `POLECAM_KEYSTORE_PASSWORD` (Settings → Secrets and variables → Actions). Keep the keystore file and password safe: every future APK must be signed with the same key, or phones will refuse the update.
- Each time app files change on `main`, a new APK is built (about 5–8 minutes) and published under **Releases**. Newest APK: `https://github.com/<user>/polecam/releases/latest/download/PoleCam.apk`.
- In the APK, *Save* writes exports to the phone's **Documents/PoleCam** folder and *Share* opens Android's share sheet.
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
