# G-eSAA road packs (v2.35)

`make_road_packs.py` turns the Geofabrik OpenStreetMap shapefile of the Philippines into **one road pack per region** (18 files). A phone with the pack of its region draws the plan (Export → AutoCAD · DXF) with no internet: roads with their class, name, bridge / tunnel; street names; named landmarks; and the ROW AREA COVERAGE table (cities / municipalities and barangays along the route).

Only Python 3.8 or newer is needed, with no extra packages. A whole-country run takes about a minute, a few minutes with the barangay file.

## 1. Get the data

- **OpenStreetMap:** https://download.geofabrik.de/asia/philippines.html → `philippines-latest-free.shp.zip`. The tool reads the ZIP itself, or the folder you unzipped it into. It uses `gis_osm_roads_free_1`, `gis_osm_pois(_a)`, `gis_osm_pofw(_a)`, `gis_osm_transport(_a)` and `gis_osm_adminareas_a` (the buildings and land use layers are not used).
- **Barangays (optional, recommended):** OpenStreetMap has every province and region, about half of the cities / municipalities and only part of the barangays (4,904 of about 42,000 in the August 2026 data). For all barangays, use the PSA / NAMRIA boundaries that OCHA publishes on HDX: *Philippines – Subnational Administrative Boundaries* (https://data.humdata.org/dataset/cod-ab-phl), the **Shapefile** download `phl_admin_boundaries.shp.zip` (about 930 MB; the May 2026 copy holds 42,048 barangays, valid from 13 Feb 2025, in WGS 84). Give the ZIP as it is: the tool takes its barangay layer (`phl_admin4`) and the names `adm4_name` / `adm3_name` / `adm2_name` by itself. Another file works too if it has barangay areas (polygons) in **WGS 84 (EPSG:4326)**; the tool finds `ADM4_EN`, `BRGY_NAME`, `NAME_3`… or give the fields with `--barangay-field`, `--municipality-field`, `--province-field`. Credit: PSA, NAMRIA, OCHA (CC BY-IGO).

## 2. Run it

macOS / Linux (Terminal), Windows (Command Prompt, `py` instead of `python3`):

```
python3 make_road_packs.py philippines-latest-free.shp.zip
python3 make_road_packs.py "path/to/unzipped folder" --barangays ~/Downloads/phl_admin_boundaries.shp.zip
python3 make_road_packs.py philippines-latest-free.shp.zip --regions "Davao Region,Soccsksargen"
```

The packs go to a folder **G-eSAA road packs** beside the source (or `--out FOLDER`), named `G-eSAA roads - <region> - <data date>.roadpack`, with `packs.txt`. The work folder `_work` inside it can be deleted afterwards. `--time-limit SECONDS` stops after that long and keeps its progress: the same command again goes on.

## 3. Give them to the phones

1. Upload the `.roadpack` files to Google Drive; sharing **Anyone with the link**.
2. Open `packs.txt` and replace each `PASTE-THE-DRIVE-LINK` with the file's Drive link (Share → Copy link). Lines starting with `#` may stay.
3. Admin phone: Settings → Administration → Manage → **Offline map packs**: paste the lines (with your map pack lines), **Save and share the list**. The list holds 30 packs at most.
4. Users: Maps (cloud button) → **Download** next to *Roads · their region* (Android app), or download the file from Drive and **Import a pack file** (any phone). The list says *road pack for the plan drawings*; there is no *Use* or *Show* (it is not a map).

## 4. Updating

Streets change slowly; new packs once or twice a year are plenty. Download a newer `philippines-latest-free.shp.zip`, run the tool again, upload the new files and put their lines (the names carry the data date) in the admin's list in place of the old ones. On the phones: **Download** the new pack, then **Delete** the old one (Maps → Offline map packs; the list shows each pack's OpenStreetMap date).

## The file

`GESAARP1`, the header size (4 bytes, little-endian), a JSON header (region, data date, bounds, the tile index), then gzip-compressed JSON chunks: one per 0.05° tile (roads `[id, class, name, flags, x0, y0, dx1, dy1, …]` and landmarks `[kind, name, x, y]`), one for the provinces and cities / municipalities, and one per 0.25° tile for the barangays (`[level, name, city/municipality, province, bounds, rings]`). Coordinates are in millionths of a degree, each point after the first as the difference from the one before. Roads are kept in every region they pass through, so a project near a regional border finds them in either pack.

OpenStreetMap data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). Keep that credit with the packs; the app writes it on the drawings.
