# PoleCam Survey

Two modes per project: **Engineering survey** and **Acceptance PAT/FAT** (punchlist / deficiency list — see "Acceptance mode").

One phone app that replaces GPS Camera + the Windows geolocator step:

1. **Capture** – take the pole photo inside the app; GPS is recorded at the shutter.
2. **Correct the pin** – drag the map under the fixed pin until it sits on the pole (street map or satellite).
3. **Pole ID + type** – the next ID is suggested automatically (CBT-0001 → CBT-0002); duplicates are flagged.
4. **Export** –
   - **KMZ** for Google Earth: pins named by Pole ID, photo as the pin icon, photo in the balloon.
   - **DXF** for AutoCAD: one block per pole type (`POLE_CONCRETE`, `POLE_WOOD`, …) at **UTM Zone 51N (WGS84) meters**, Pole ID text on layer `POLE_LABEL`, plus optional OpenStreetMap road centerlines (`OSM_ROAD_MAJOR` / `MINOR` / `PATH`, road names on `ROAD_NAME`).
   - **CSV**: pole ID, type, lat/long, UTM E/N, GPS accuracy, pin-adjusted flag, time.
   - **Geotagged photos (ZIP)**: JPEGs named by Pole ID, stamped with ID/type/coordinates/time, GPS written into EXIF.
   - **Backup / Restore** of a whole project.
5. **Import** existing GPS Camera photos: reads their EXIF location so you can add Pole IDs to old surveys.

Works with no signal: the app, your points and any map area you saved stay on the phone.

---

## Install (free, no Play Store)

The app has to be served over HTTPS once so the phone can install it. GitHub Pages is free.

1. Create a GitHub repository (e.g. `polecam`) and upload **everything in this folder** (keep the `vendor/` and `icons/` folders).
2. Repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
   After about a minute it is live at `https://<your-username>.github.io/polecam/`.
3. On the Android phone open that link in **Chrome** → ⋮ menu → **Install app** (or *Add to Home screen*).
   It installs with its own icon and opens full-screen like a normal app.
4. First run: allow **Camera** and **Location** (choose *precise* location).

### Optional: a real .apk file
Go to **pwabuilder.com**, paste your GitHub Pages link → *Package for stores* → **Android** → download → install the APK on the phone (allow "Install unknown apps").
The APK opens the same hosted app, so keep the GitHub Pages site online.

---

## Field use

- **Projects = survey areas.** Create one project per area/job (top bar → project name). Each project keeps its own poles, photos, Pole ID numbering, exports, backups and offline maps; nothing from one survey shows up in another. You can rename or delete a project there too.
- **Offline map (before going to a no-signal area):** tap the cloud button on the map → choose *Map on screen* (pan/zoom the map to the area first) or *Around this project's poles* (+300 m), pick Street / Satellite / Both and the detail level → *Download map*. The screen shows the tile count and MB before you start, and you can cancel. Saved areas appear as blue dashed boxes and are listed per project with *Show* and *Delete*. One download is capped at 4,000 tiles (OpenStreetMap/Esri limit bulk downloading) — download a big area as several smaller ones.
- GPS pill colors: green ≤ 5 m, amber ≤ 15 m, red > 15 m. Wait for green when you can.
- *Reset to GPS* puts the pin back on the raw GPS fix. Points you moved are tagged **pin adjusted**.
- Tap any pole on the map or in *Points* to edit it, replace the photo, or delete it.
- Use one **project** per job/area; exports and backups cover the current project.

## Acceptance mode (PAT / FAT)

Create a project as **Acceptance · PAT** (Projects → New project). The badge at the top shows SURVEY, PAT or FAT.

**Recording (one record per location)**
- Element: **Pole**, **ODF**, **ODC** or **Rack**, with its ID (numbering continues per element type in the project).
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

## Location and photo integrity (v1.3)

- **Pin limit:** the pin can be dragged at most **1 km** from where the photo was taken (orange dashed circle in the editor). Dragging past it snaps the pin back to the edge. Applies to survey and acceptance.
- **Acceptance projects only:**
  - Photos must be taken **live** with the in-app camera. *Import* is turned off, and a photo from the phone camera app is refused if it is more than 10 minutes old.
  - The shutter waits for a **GPS fix** (less than 2 minutes old).
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
- A photo is kept only if a GPS update arrived within **5 seconds** of the shutter. The camera's GPS pill shows how old the last fix is ("now", "3 s ago"); it turns red after 5 s. The app waits up to 5 s for a fresh fix after you press the shutter, then refuses the photo. Always on in acceptance projects; can be turned off for survey projects (Settings → Camera checks).
- Every photo is checked for **blur, darkness and overexposure**. If it looks bad you get *Retake* or *Use anyway*; a photo kept anyway is marked in the editor and on the acceptance reports. Normal (default) warns only on clearly blurry photos; Strict also warns on slightly soft ones.
- With the phone's own camera app (fallback), the GPS check uses the fix taken right after you return to PoleCam.

**Reading the painted Pole ID (offline)**
- With **ID** on (top right of the camera), a guide box appears. Put the painted ID inside the box when you take the pole photo. The app reads it on the phone (Tesseract OCR, no internet) and fills the Pole ID field when it is at least 80% sure; other readings appear as buttons to tap.
- **Scan ID** next to the Pole ID field opens the camera just to read an ID (handy for a close-up of the tag after the full-pole photo).
- Readings are bent toward your project's numbering, e.g. "MKP-O123" becomes "MKP-0123" when your last ID was MKP-0001. Always check the result before saving; faded or hand-painted IDs may not read.

**Route and spans (survey projects)**
- Tap the **route button** on the map. *Link in capture order* connects poles in the order you surveyed them (skipping gaps longer than the setting). Then tap a pole and the next pole to add a span, or tap a linked pair to remove it (for branches and corners). *Undo* and *Clear* are there too.
- Spans show their length; spans longer than the maximum are red and dashed. Angle poles (orange ring, deflection shown on the label) and junctions (purple ring) are marked. Settings → *Route checks* sets the maximum span, the angle-pole threshold and the auto-link gap — the starting values (50 m, 15°, 120 m) are placeholders, set your own standard.
- Exports: DXF gets layers **CABLE_ROUTE**, **SPAN_LONG** and **SPAN_LENGTH**; KMZ gets a *Route* folder; **Route and spans · Excel** gives a Summary, every span and every pole's role (terminal, inline, angle, junction, not linked) with its deflection angle. Span lengths are straight pin-to-pin distances, not cable lengths.

**Where saved files go (Android app)**
- Settings → *Where saved files go*: Documents or Download, a folder name, and optionally one folder per project. Projects themselves stay in the app's private storage.

**Photos for AI training**
- Export → *Photos for AI training*: your labeled photos sorted into one folder per type with a labels.csv, for teaching the app later to recognise poles, NAPs, closures, ODFs, etc. Aim for 200+ photos per type.

## AutoCAD

- Open the DXF directly or `INSERT`/`XATTACH` it into your drawing. Units are **meters**, coordinates are **UTM 51N (WGS84)** — your drawing must use the same system to line up.
- To use your own pole model: redefine the block (`BEDIT POLE_CONCRETE`, or `-INSERT POLE_CONCRETE=yourpole.dwg`) and every pole of that type updates.
- Pole symbol radius and label height are set in Settings → CAD export.

## Data safety

Points and photos live only in the phone's app storage until you export. **Make a Backup after each survey day** and keep the ZIP on Drive/PC. Clearing Chrome's site data or uninstalling the app deletes them.
Teammates' backups can be restored into one phone to merge projects (same project name = merged).

## Updating the app

Edit the files, change `VERSION` in `sw.js` (e.g. `polecam-v1.0.1`), and upload again. Phones pick up the new version the next time the app is opened with internet.

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

Map data © OpenStreetMap contributors (ODbL). Satellite imagery © Esri.

## Offline Android APK (built by GitHub Actions)

`.github/workflows/build-apk.yml` packs every app file into a signed APK on GitHub's servers, so the APK installs and runs with no internet and does not need the website. Maps still need internet or a downloaded offline area.

- One-time setup: add the repository secrets `POLECAM_KEYSTORE_B64` and `POLECAM_KEYSTORE_PASSWORD` (Settings → Secrets and variables → Actions). Keep the keystore file and password safe: every future APK must be signed with the same key, or phones will refuse the update.
- Each time app files change on `main`, a new APK is built (about 5–8 minutes) and published under **Releases**. Newest APK: `https://github.com/<user>/polecam/releases/latest/download/PoleCam.apk`.
- In the APK, *Save* writes exports to the phone's **Documents/PoleCam** folder and *Share* opens Android's share sheet.
- The APK keeps its own data, separate from the Chrome/Home-screen version. Move projects with Backup → Restore.
- Updating: install the newer APK over the old one; projects stay. Uninstalling the app deletes its projects, so back up first.
