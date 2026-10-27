# Making offline map packs for PoleCam

A map pack is one `.pmtiles` file with the OpenStreetMap street map of an area (roads, names, buildings, rivers), cut from the free daily **Protomaps** build. Phones keep it and draw it at any zoom with no signal. Mindanao mainland at full detail is about 200 MB; a city is a few MB.

There are three ways to make one. All three give the same file; then upload it to Google Drive (section 4).

---

## 1. QGIS plugin (recommended for Windows PCs)

1. Install the plugin: QGIS → **Plugins → Manage and Install Plugins → Install from ZIP** → choose `polecam_mappack.zip` → Install. A **PoleCam Map Pack Maker** button appears on the toolbar (also under Web → PoleCam).
2. Open it. First time: tap **Download the tool** (it fetches the free `pmtiles` program, about 6 MB, into the plugin folder). If your office blocks GitHub, download `go-pmtiles_…_Windows_x86_64.zip` by hand from https://github.com/protomaps/go-pmtiles/releases, and put `pmtiles.exe` in `<QGIS profile>\python\plugins\polecam_mappack\bin\`.
3. **Area** — three ways:
   - **Current map view**: zoom the QGIS map to the area (the plugin shows west/south/east/north and km²).
   - **West, south, east, north**: type a bbox.
   - **Boundaries from a polygon layer** — the way to do the whole country per area. Tap **Add Philippines boundaries (GADM)**: the plugin downloads `gadm41_PHL.gpkg` (about 30 MB, free for non-commercial use) and adds two layers, *regions* and *provinces*. Pick the layer and the name field (NAME_1 for regions, NAME_2 for provinces), then tick the areas. The **Mindanao / Visayas / Luzon / Metro Manila** buttons tick the regions of that island group and set “one pack from all ticked areas” with that name; untick the box to get one pack per ticked region or province instead. Any other boundary layer works too (PSA/PhilGIS/HDX shapefiles, your own cluster polygons): the plugin cuts along the polygon itself, not just its bbox, with a 1 km margin, so a pack holds no sea and no neighbouring province.
4. **Detail** (max zoom 15 = full detail, what PoleCam expects; 14 or 13 for a much smaller file over a wide area), **Protomaps build** → tap **Find latest**, and the folder to save in. The estimated size updates as you change the selection.
5. **Make the map pack(s)**. Packs are cut one after another (a few minutes each for a province, longer for Mindanao). At the end the log lists every file with its size; **Copy MapPacks rows for the sheet** puts one row per pack on the clipboard — paste it into the MapPacks tab and add the Drive links after uploading.

Suggested set for the whole country: Mindanao (~200 MB), Visayas (~150 MB), Luzon without NCR (~250 MB) and Metro Manila (~15 MB) at max zoom 15, or one pack per region (10–60 MB each) so each team downloads only its own.

## 2. GitHub Actions (no software on the PC)

The repository has `.github/workflows/build-map-packs.yml`.

1. Edit `maps/packs.json` in the repository: one entry per area with `id`, `name`, `bbox` (west, south, east, north) and `maxzoom`.
2. GitHub → **Actions → Build map packs → Run workflow**. About 10 minutes.
3. The files are attached to a GitHub **Release** named `maps-<date>-<run>` (not to Pages, so they do not count against the site). Download them from the Releases page, then continue with section 4. Delete old map releases when you no longer need them.

## 3. Command line (any PC)

1. Download `pmtiles` for your system from https://github.com/protomaps/go-pmtiles/releases and unzip it.
2. Find the newest build date at https://build.protomaps.com/ (files are named `YYYYMMDD.pmtiles`).
3. Run, with your own bbox (west, south, east, north in degrees):

```
pmtiles extract https://build.protomaps.com/20261020.pmtiles PoleCam_Mindanao_20261020.pmtiles --bbox=121.8,4.5,126.7,10.0 --maxzoom=15 --download-threads=8
```

Finding a bbox: in QGIS the status bar shows the coordinates of the map view (set the project CRS to EPSG:4326 to read degrees); in Google Maps, right-click the south-west and north-east corners.

---

## 4. Google Drive and the admin's list

1. Upload the `.pmtiles` file to Google Drive (any folder of the admin's account).
2. Right-click → **Share** → General access **Anyone with the link** → **Copy link**.
3. On the admin's phone: Settings → Administration → **Manage** (admin PIN) → **Offline map packs**: one line per pack, `name | Drive link | size in MB`, for example `Mindanao | https://drive.google.com/file/d/…/view | 200`. Then **Save and share the list**. Keep old lines while phones still use them; delete a line to retire a pack.
4. On the phones: they get the packs with the new list version (QR code or file), or with **Refresh list** on the Maps screen when the online sheet is connected (the admin's phone also writes the packs to the sheet's MapPacks tab when its Admin key is entered; update the sheet's Apps Script to v2.5 first). Then **Maps** (cloud button on the map) → **Download** next to the pack (Android app; Wi-Fi for big files, it can resume). The website version cannot read Drive directly: open the link, download the file, and use **Import a pack file**.

Users of a company list cannot add links themselves. Phones without any company list can still paste a link under **Add a Google Drive link**, or import a file sent to them (Viber, USB).

## Updating a pack

Streets change slowly; a new pack every few months is plenty. Make it with the newest build, upload it, change the link in the MapPacks row (same name), and phones see “update available” after the next refresh. The old file in Drive can be deleted once everyone has updated.

## Terms

Map data © OpenStreetMap contributors, ODbL; builds by Protomaps (free, daily). The `pmtiles` tool is BSD-3 licensed. Keep the attribution that PoleCam shows on the map.
