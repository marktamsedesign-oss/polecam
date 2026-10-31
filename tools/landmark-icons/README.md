# Landmark icons (v2.35.6)

`build_icons.py` makes `vendor/icons/` from two public-domain (CC0 1.0) icon sets:

- **OpenStreetMap Carto** (the style of the openstreetmap.org street map): https://github.com/gravitystorm/openstreetmap-carto, `symbols/`
- **Mapbox Maki**, for the kinds the street map has no icon for (schools, colleges, covered courts, groceries…): https://github.com/mapbox/maki, `icons/`

```
git clone --depth 1 https://github.com/gravitystorm/openstreetmap-carto.git
git clone --depth 1 https://github.com/mapbox/maki.git
pip install playwright && python3 -m playwright install chromium   # for the icon picture
python3 build_icons.py --carto openstreetmap-carto --maki maki --out ../../vendor/icons
```

Out: `landmarks.js` (kind → icon and colour group, for OpenStreetMap / Protomaps kinds and the Geofabrik classes of the road packs; places of worship by religion), `landmarks.png` (all icons in their colours, 32 px cells; the offline map draws them at 16 px), `landmark-blocks.js` (each icon as solid fills: outline and holes, for the AutoCAD blocks of the plan drawing), `LICENSE-icons.txt`.

To give a kind another icon, or add one: edit the table at the top of `build_icons.py` (`put(group, 'c:amenity/…' or 'm:…', kinds…)`) and run it again. A white part of an icon becomes a hole in what it covers; a faded part a lighter colour. Bump the app version (`APP_VER`, `sw.js`) so phones take the new files.
