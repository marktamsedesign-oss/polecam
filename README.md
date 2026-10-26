# PoleCam Survey

Three task categories per project: **Survey** (engineering survey), **PAT** and **FAT** (acceptance punchlist / deficiency list — see "Acceptance mode"). The category shows on the project button at the top right.

One phone app that replaces GPS Camera + the Windows geolocator step:

1. **Capture** – take the pole photo inside the app; GPS is recorded at the shutter (green shutter = GPS ready).
2. **Scan the ID** – right after the photo, fit the painted ID (pole, ODF or any other) in the box; horizontal or vertical IDs.
3. **Correct the pin** – drag the map under the slim pin until it sits on the pole; switch street / satellite / offline map while you do it.
4. **Pole ID + type** – Concrete (CC), Wood (WP), Steel (SP): IDs CC-0001, WP-0001, SP-0001; ODFs FDU_100. The next ID is suggested; duplicates are flagged.
5. **Export** –
   - **KMZ** for Google Earth: pins named by Pole ID, photo as the pin icon, photo in the balloon.
   - **DXF** for AutoCAD: one block per pole type (`POLE_CONCRETE`, `POLE_WOOD`, …) at **UTM Zone 51N (WGS84) meters**, Pole ID text on layer `POLE_LABEL`, plus optional OpenStreetMap road centerlines (`OSM_ROAD_MAJOR` / `MINOR` / `PATH`, road names on `ROAD_NAME`).
   - **CSV**: pole ID, type, lat/long, UTM E/N, GPS accuracy, pin-adjusted flag, time, surveyed by.
   - **Geotagged photos (ZIP)**: JPEGs named by Pole ID, stamped with ID/type/coordinates/time, GPS written into EXIF.
   - **Backup / Restore** of a whole project.

Photos cannot be imported (v1.7): every photo is taken live, so its location can be checked.

Works with no signal: the app and your points stay on the phone, and a downloaded **offline map pack** (v1.6) shows streets with no internet.

---

## Install (free, no Play Store)

The app has to be served over HTTPS once so the phone can install it. GitHub Pages is free.

1. Create a GitHub repository (e.g. `polecam`) and upload **everything in this folder** (keep the `vendor/` and `icons/` folders).
2. Repository **Settings → Pages → Build and deployment → Source = GitHub Actions**, and add `.github/workflows/deploy-site.yml` (it publishes the site and the offline map packs).
   After the *Deploy website and offline maps* run finishes it is live at `https://<your-username>.github.io/polecam/`.
3. On the Android phone open that link in **Chrome** → ⋮ menu → **Install app** (or *Add to Home screen*).
   It installs with its own icon and opens full-screen like a normal app.
4. First run: allow **Camera** and **Location** (choose *precise* location).

### Optional: a real .apk file
Go to **pwabuilder.com**, paste your GitHub Pages link → *Package for stores* → **Android** → download → install the APK on the phone (allow "Install unknown apps").
The APK opens the same hosted app, so keep the GitHub Pages site online.

---

## First use: your details and the company list (v1.7)

- On first use the app asks for **full name, mobile number, email and company**. They stay on the phone and are recorded on every photo, pole and punchlist item (“Mark Tamse · Globe Telecom”) and printed on the reports (Excel *People* sheet, “Recorded by” on the PDFs, *surveyed_by* in the CSV). Change them in Settings → You → Edit my details.
- **Company names come from an admin.** The admin is whoever creates the company list on their phone (“I am the admin: create the company list”): they set an admin PIN, name the list (e.g. *Globe OSP Mindanao*) and add each company/vendor.
- **Sharing the list, offline:** Settings → Company list → *Share list* shows a QR code. Other phones scan it (first use: *Scan admin's QR code*; later: *Update list* → *Scan QR*). *Share as file* sends the same list as a small file through Viber/Messenger/email; the other phone opens it with *Open list file*. Nothing goes through a server.
- **Updates:** the admin edits the list (Manage company list, PIN), saves, and shares again. The list is signed with the admin's key: a phone accepts an update only from an admin already on its list, and rejects a list that was edited by hand.
- Each list has a **code** (e.g. V5XQ-VR8B) shown in Settings and when joining. *Update list* accepts only newer versions of the same list; a different list (even with the same name) needs *Switch to another list* and a warning, and older versions are refused.
- **More admins:** the other person taps *Ask to become an admin* (sets their own PIN) and shows the request QR; the admin taps *Add an admin* and scans it, then shares the new version. That person becomes an admin when their phone takes the update.
- Limits: anyone can create a separate list on their own phone and call themselves admin; reports show the list name and its admins, so check them. If the only admin loses their phone or PIN, the list cannot be updated: make a new list and have everyone switch to it (keep a second admin to avoid this).

## Field use

- **Projects = survey areas.** Create one project per area/job (top bar → project name). Each project keeps its own poles, photos, Pole ID numbering, exports, backups and offline maps; nothing from one survey shows up in another. You can rename or delete a project there too.
- **Taking a photo:** the shutter is **green** when the GPS updated within the last 5 seconds and **red** when the GPS is old, off or blocked. A red shutter still tries for 5 seconds, then refuses the photo. After the photo is kept, the app asks you to scan the ID (Skip if there is none); the ID button at the top right turns this step off.
- **Offline map (before going to a no-signal area):** tap the cloud button on the map → *Offline map packs* → **Download** the pack for your area while on Wi-Fi (see "Offline map packs" below). With no signal the map switches to it by itself; the layer button also cycles Street → Satellite → Offline.
- GPS pill colors: green ≤ 5 m, amber ≤ 15 m, red > 15 m. Wait for green when you can.
- *Reset to GPS* puts the pin back on the raw GPS fix. Points you moved are tagged **pin adjusted**.
- Tap any pole on the map or in *Points* to edit it, replace the photo, or delete it.
- Use one **project** per job/area; exports and backups cover the current project.

## Acceptance mode (PAT / FAT)

Create a project with task category **PAT** (Projects → New project → Task category). The project button at the top right shows SURVEY, PAT or FAT, and the list button at the bottom is named after it. Choose **FAT** directly only when the PAT records are not on this phone; otherwise open the PAT project and use *Start FAT from this PAT* so every PAT item is re-checked.

**Recording (one record per location)**
- Element: **Pole**, **ODF**, **ODC** or **Rack**, with its ID (numbering continues per element type in the project: CC-/WP-/SP- for poles by type, FDU_ for ODFs).
- Pole: *With MLoop*, *With NAP* + NAP ID, *With closure* + closure ID. ODF: *New* or *Existing*.
- Several photos per element (Overview, Pole tag, MLoop, NAP, Closure, …) — tap **+ Add photo**, set each label under the picture.
- **+ Add deficiency**: pick where (Pole, Cable/strand, MLoop, NAP, Closure, ODF, ODC, Rack, Other), tap one or more defects from the checklist, set Major/Minor, add notes and a defect photo. Edit the checklist in Settings → *Deficiency checklist*; the starting lists are generic, replace them with your own.
- Map pins: red = open deficiency, blue = all rectified, green = OK. The Points list has a filter for each.

**Projects → Current project** holds Site/cluster, Contractor, Globe representative and Inspected by — these print on the punchlist.

**FAT**: on a PAT project tap **Start FAT from this PAT**. It copies every element and its punchlist into a new FAT project (the PAT stays as it was). For each item: **After photo** (marks it rectified), **Mark rectified**, or leave it open with remarks. New defects found at FAT can be added too.

**Acceptance exports** (Export screen)
- **Excel punchlist** — sheet *Punchlist* (item no., location, element, category, deficiency, severity, notes, status, found at, dates, remarks, coordinates, photo file names) and sheet *Elements* (every element with MLoop / NAP / closure / ODF details and status).
- **PDF report** — header and summary, numbered punchlist, sign-off boxes (Globe representative, contractor representative, noted by), then each element's photos and each defect with its before/after photo.
- **KMZ** — pins by status in folders *With open deficiency / All rectified / Passed*, details and photos in each balloon.
- **CSV** — same table as the Excel punchlist.
- **Photos ZIP** — file names match the Excel/PDF (e.g. `MKP-0001_1_Overview.jpg`, `MKP-0001_item3_defect.jpg`, `MKP-0001_item3_after.jpg`).

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
- Summary: punchlist items, rectified, still open, % cleared, average time to rectify.
- Items marked rectified **without an after photo** are called out in red.
- Progress by date (items rectified per day, cumulative, % cleared).
- Each rectified item: BEFORE (defect) and AFTER photos side by side, each stamped and captioned with time taken, GPS, distance from the pin and who took it; time to rectify; remarks.
- Items still open with their defect photo and how long they have been open.
- Sign-off: contractor representative, Globe representative, noted by.

The Excel/CSV punchlist now also has *Days to rectify*, *Rectified by*, *Defect photo taken*, *After photo taken* and *After photo distance from pin (m)*.

**Vendor hand-off:** Globe makes a Backup of the PAT/FAT project → sends the ZIP to the vendor → vendor Restores it on their phone, sets their name, takes after photos at each site → makes a Backup → sends it back → Globe Restores it and exports the rectification report.

## Camera checks, Pole ID reading, route (v1.5)

**Camera checks**
- A photo is kept only if a GPS update arrived within **5 seconds** of the shutter (always on since v1.7). The camera's GPS pill shows how old the last fix is ("now", "3 s ago") and the shutter turns red after 5 s.
- Every photo is checked: **dark, blank (no picture detail), overexposed or blurry photos are refused** and must be retaken; there is no *Use anyway* (v1.7). *Strict* (default) needs readable detail; *Normal* refuses only clearly blurry photos. The thresholds were set on test images, not yet on a range of real phone photos: if good photos get refused in the field, switch to Normal and report it.
- With the phone's own camera app (fallback), the GPS check uses the fix taken right after you return to PoleCam.

**Reading the painted Pole ID (offline)**
- **Picture first, then the ID (v1.7):** after the photo is kept, a guide box appears. Get close to the painted ID, fit it in the box and tap the shutter. Choose **Horizontal ID** or **Vertical ID** (characters stacked top to bottom, or the whole ID turned sideways); the app remembers your choice. It reads the ID on the phone (Tesseract OCR, no internet).
- Readings are matched to your formats: CC-/WP-/SP- pole IDs (4 digits) and FDU_ ODF IDs, e.g. "CCO457" becomes CC-0457, and the pole type (or ODF element) is set from the prefix. The field is filled when the reading is at least 55% sure in a known format (80% otherwise); other readings appear as buttons. Always check the result before saving; faded or hand-painted IDs may not read.
- **Scan ID** next to the ID field opens the camera just to read an ID again.

**Route and spans (survey projects)**
- Tap the **route button** on the map. *Link in capture order* connects poles in the order you surveyed them (skipping gaps longer than the setting). Then tap a pole and the next pole to add a span, or tap a linked pair to remove it (for branches and corners). *Undo* and *Clear* are there too.
- Spans show their length; spans longer than the maximum are red and dashed. Angle poles (orange ring, deflection shown on the label) and junctions (purple ring) are marked. Settings → *Route checks* sets the maximum span (200 m), the angle-pole threshold and the auto-link gap.
- Exports: DXF gets layers **CABLE_ROUTE**, **SPAN_LONG** and **SPAN_LENGTH**; KMZ gets a *Route* folder; **Route and spans · Excel** gives a Summary, every span and every pole's role (terminal, inline, angle, junction, not linked) with its deflection angle. Span lengths are straight pin-to-pin distances, not cable lengths.

**Where saved files go (Android app)**
- Settings → *Where saved files go*: Documents or Download, a folder name, and optionally one folder per project. Projects themselves stay in the app's private storage.

**Photos for AI training**
- Export → *Photos for AI training*: your labeled photos sorted into one folder per type with a labels.csv, for teaching the app later to recognise poles, NAPs, closures, ODFs, etc. Aim for 200+ photos per type.

## Offline map packs (v1.6)

Earlier versions downloaded OpenStreetMap / Esri map tiles in bulk for offline use. Both services forbid that in their terms (OpenStreetMap's tile servers are for online viewing only; Esri allows offline use only through its ArcGIS apps), so v1.6 removes it and uses map packs instead.

- **What a pack is:** one file of street map data (OpenStreetMap, ODbL) for a whole area, cut from the free Protomaps build and published with your website by the *Deploy website and offline maps* workflow. Streets, road names, buildings, water and places, drawn on the phone at any zoom.
- **Which areas:** `maps/packs.json`. It starts with *Region XII (SOCCSKSARGEN)* and *Mindanao mainland*. Edit the list (id, name, bbox = west, south, east, north, maxzoom 15) and commit; the next run cuts the new packs. GitHub Pages allows 1 GB per site: packs are added in list order and one that would pass about 950 MB in total is left out with a warning in the workflow log, which also shows each pack's size. If cutting a pack fails, the site still publishes, with last month's copy of that pack when there is one.
- **Refresh:** packs are re-cut once a month with fresh OpenStreetMap data, or by hand: Actions → *Deploy website and offline maps* → *Run workflow* → tick *Download fresh map data now*. The app shows *Update* when a newer pack is published.
- **On the phone:** Offline map → *Check for map packs* → **Download** (use Wi-Fi; it resumes where it stopped if the connection drops) → *Use* / *Show* / *Delete*. The pack you used last is the one shown offline.
- **Satellite** has no offline version and is not kept on the phone (v1.7 also removes satellite tiles kept by older versions): Esri allows offline imagery only in its own ArcGIS apps. Street map tiles you viewed online are kept for 7 days and can be cleared under *Map tiles you have viewed*.
- The app identifies itself to the map servers (APK: `PoleCam/<version>` user agent), as the OpenStreetMap tile policy asks.

## AutoCAD

- Open the DXF directly or `INSERT`/`XATTACH` it into your drawing. Units are **meters**, coordinates are **UTM 51N (WGS84)** — your drawing must use the same system to line up.
- To use your own pole model: redefine the block (`BEDIT POLE_CONCRETE`, or `-INSERT POLE_CONCRETE=yourpole.dwg`) and every pole of that type updates.
- Pole symbol radius and label height are set in Settings → CAD export.

## Data safety

Settings → Storage shows how much PoleCam uses and the most this phone currently lets it use (for example “up to about 10 GB”). That limit comes from the phone and browser, not from PoleCam; it is a share of the phone's free space and changes as the phone fills up.

Points and photos live only in the phone's app storage until you export. **Make a Backup after each survey day** and keep the ZIP on Drive/PC. Clearing Chrome's site data or uninstalling the app deletes them.
Teammates' backups can be restored into one phone to merge projects (same project name = merged).

## Updating the app

Edit the files, change `VERSION` in `sw.js` (e.g. `polecam-v1.6.1`), and upload again. Phones pick up the new version the next time the app is opened with internet.

## Files

| File | Purpose |
|---|---|
| `index.html` | Screens and styling |
| `app.js` | Camera, GPS, map, storage, exports |
| `core.js` | UTM 51N conversion, EXIF read/write, ZIP, KML, DXF, CSV (no dependencies) |
| `reports.js` | Excel (.xlsx) and PDF punchlist writers, acceptance KML (no dependencies) |
| `ocr-worker.js`, `vendor/tesseract/` | Offline Pole ID reader: Tesseract OCR (tesseract.js-core v7.0.0) and the English model from tessdata_fast, both Apache-2.0 |
| `sw.js` | Offline cache for the app itself |
| `manifest.json`, `icons/` | Install as an app |
| `vendor/leaflet/` | Map library (Leaflet 1.9.4, BSD-2) |
| `vendor/protomaps/` | Offline map renderer (protomaps-leaflet + PMTiles, BSD-3; licenses in `LICENSES.txt`) |
| `vendor/qr/` | QR codes for the company list: jsQR 1.4.0 (reader, Apache-2.0) and QR Code Generator 2.0.4 (MIT); licenses in `LICENSES.txt` |
| `maps/packs.json` | Areas published as offline map packs |
| `.github/workflows/deploy-site.yml` | Publishes the website and cuts the map packs |
| `.github/workflows/build-apk.yml` | Builds the signed Android APK |

Map data © OpenStreetMap contributors (ODbL); offline packs from the Protomaps basemap build. Satellite imagery © Esri (online only).

## Offline Android APK (built by GitHub Actions)

`.github/workflows/build-apk.yml` packs every app file into a signed APK on GitHub's servers, so the APK installs and runs with no internet. Map packs are downloaded from your website (the APK knows its address), and street/satellite maps need internet.

- One-time setup: add the repository secrets `POLECAM_KEYSTORE_B64` and `POLECAM_KEYSTORE_PASSWORD` (Settings → Secrets and variables → Actions). Keep the keystore file and password safe: every future APK must be signed with the same key, or phones will refuse the update.
- Each time app files change on `main`, a new APK is built (about 5–8 minutes) and published under **Releases**. Newest APK: `https://github.com/<user>/polecam/releases/latest/download/PoleCam.apk`.
- In the APK, *Save* writes exports to the phone's **Documents/PoleCam** folder and *Share* opens Android's share sheet.
- The APK keeps its own data, separate from the Chrome/Home-screen version. Move projects with Backup → Restore.
- Updating: install the newer APK over the old one; projects stay. Uninstalling the app deletes its projects, so back up first.
