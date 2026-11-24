# G-eSAA tests

Every test of G-eSAA, with one command that runs them all and prints **n of n** for each file:

```
python3 tests/run_all.py
```

On GitHub it runs by hand (`.github/workflows/tests.yml`): **Actions → Tests → Run workflow**, pick the branch. It is not yet run on every push: four older team tests (t2433c, t2433d, t24333a, t24333c) still expect an update to wait for **Download and merge**, which Sync now does by itself; once they follow the app, the workflow's top note says how to run it on every push.

All test data is made up (Juan Dela Cruz, Pedro Santos, Maria Garcia, Ana Reyes, DEMO CONTRACTOR, @demo-contractor.example). Nothing confidential is in this folder: no company plan template, no survey, no key.

## What is here

| | |
|---|---|
| `run_all.py` | The one command. Serves the app at `http://localhost:8765`, runs each file, prints `PASS name: n of n`, `FAIL name: …` or `SKIP name: needs …`, and writes `results/` (a log per file and `summary.md`). Its server answers `org.json` with 404 (beta 6.7): the repository's `org.json` ties the website to one organisation, and the tests make their own company list on a new phone (`#pfCreateBox`). `regression/v17/common.py`'s `launch` does the same for a test run on its own. It also answers, for the older tests, what came after them (`NEWER_ASKS_JS`): the plans-to-make reminder on the Drawing (Later), *poles on no cable* at Export (Export as they are) and the photo shown full size after the camera (closed). |
| `photo-save.spec.cjs`, `image-preparation.test.cjs`, `dxf-cleanup.test.cjs` | Node tests: saving photos, preparing images, the plan DXF cleanup. |
| `tutorial-search.test.cjs` | Node test (beta 6.7): the Tutorial search, the same code the app runs, and one line per feature that must find its topic. A new feature adds its line here, with a tutorial step that uses its on-screen label. It also reads index.html: every Export row and Plan style row carries its label (`data-find`, `data-findx` in Colours and sizes), each label is found by the Tutorial's search and by Plan style's Find a setting, and each Export row and Plan style section has a ? that opens a step saying its label (in a PAT, cleanup or FAT project, `data-tutacc` first; the cleanup's Hand on too). Rows another choice hides (the Simple drawing's own rows) are grouped with `data-findneed`, `data-findwhy` and `data-findhow`. A new row adds its `data-find`. It also checks the search's word rules: another spelling matches whole words with their endings (metres, not metro; centre, not central), another-words phrases (little man, show in exports) are marked only where the whole phrase is, and a query of only symbols finds nothing. |
| `find-setting.spec.cjs` | Browser test (beta 6.7, UX step 5 fixes): Plan style's Find a setting with the company plan made, on a phone (390x844) and a small phone with the largest text (360x640, text size 1.45). The box is on the screen at opening, above the Reset / Done footer; a row found and tapped is marked, on top and focused; a Simple drawing row (hidden with the company plan) says *only with the Simple drawing*, and a tap marks Kind of drawing with what to choose; choosing Simple then marks the row asked for. Every row of Plan style is typed by its label and tapped (a new row is checked by itself), and the Tutorial's search keeps its first topic on a small screen (one setting row, **More ›**). |
| `project-name-title.spec.cjs` | Browser test (beta 7.6): Project details' **Project Name** on the plan's cover and every title block (what the template's fields are filled with; with the company template, the DXF and its PDF too), and on the CEF plan's cover and every sheet's title strip, where it wins over the plan's own Project text (made in another project); the serial number on the CEF plan too. No Project Name: as before. |
| `geotag-plan-stamp.spec.cjs` | Browser test (beta 7.6): Export › Photos with their locations › **Same stamp on the plan's photos** (off at first): kept, greyed with the stamp off; off, the plan's photos as before; on, the plan's photos get the photo ZIP's caption band (the same lines), the ZIP unchanged; Plan style says so; Find a setting and the Tutorial find it. |
| `plan-export.spec.cjs` | Browser test (Plan style cards, Export picks): the two screens the owner asked to be simple for new users, on a phone (390x844) and a computer (1280x900), a made-up As-Plan project. Plan style: seven cards, each saying in one line what it is set to, one open at a time, the preview showing the part of the plan the open card changes; a card's line follows its setting; **Reset to recommended**; More settings and its six sections. Export: the checks before export, the quick picks (**For the client**, **For the drafter**, **Everything**) and the tiles; a pick picks its tiles, **What you get** lists their rows (**Change ›** opens a row's choices), one button at the foot (**Export 3 files (one ZIP)**; one tile: worded and done as its row's own button); a check's **Get it ›** opens Plan style on More settings › Plan file; the tiles picked are picked again next time. The tutorial: every Show me of Plan style's and Export's topics rings its control or says when it shows. No page sideways, no page errors. |
| `regression/` | The regression tests the release notes name (t229b, t2433c, t24228a…), in the folders they were written in, so a test that reads another test's helpers finds them. `regression/v243/e2e/` holds stand-ins for the online sheet and the team mailbox: they run the **real** sheet script and mailbox script (`regression/v243/sheet/`, `regression/v243/mailbox/`). |
| `regression/fixtures/maps/` | Three small offline map packs cut from the public Protomaps builds (© OpenStreetMap contributors, ODbL). |

`python3 tests/run_all.py --list` lists every file and what it needs. `--only t229b` runs the files whose name has that part.

A full run takes about 1½ hours: t229b runs **20 times** in it (its download-progress check once failed now and then), and t2357a runs last, alone (it serves the app on port 8765 itself). Each file may take 30 minutes, tutall 70 (it opens every Show me twice, about 35 minutes).

## Tests that skip without private inputs

Some tests need files that never go into the repository. Without them, the test is skipped with a line that says what it needs:

| Needs | Tests |
|---|---|
| The company plan template (`seed.dxf`) | t24228a_v243, t24226a_v28, t24225a_v26, t24224a_v26, t24223a_v28, t24223b_v26, t24221b_v28, t24220b_v25, t24218a_v28, t24217a_v18, t24216a_v26, t24214a_v28, t24212a_v28, t24212b, t24210a_v23, t2429a, t2428a, t2424a_v24, t2421a_v24, t242a_v24, t241a_v28, t241b_v28, t239a_v18, t237e, t237a_v18, t2356b_v24, t235a_v24, t235b_v24, t234a_v24, t24227a_v28. Also the DXF part (C4) of t24333e, and the template part of project-name-title.spec.cjs (geotag-plan-stamp.spec.cjs uses a stand-in without it). |
| A road pack made from your files | t235c (and some of the above) |
| Large test files (45–80 MB) | t2355i, t2354f, t2353e (and some of the above) |
| An older G-eSAA build | t24333b (v2.42.28), t2425a, t2425b (v2.42.4, v2.42.5), t2357a (v2.35.6). Also the v2.42.28-file part (V) of t24333e. |

To run them too on your own computer, put the files in a folder outside the repository and give it with `--private DIR` (or the `GESAA_PRIVATE` setting):

```
DIR/template/seed.dxf, DIR/template/template.dxf     the company plan template
DIR/roads/…, DIR/roads_v235/…, DIR/roads_psa/…       road packs (the names the tests print)
DIR/fx/poles_user.json, DIR/fx/overpass_user.json    pole fixtures
DIR/large/…                                          G-eSAA_TEST10KM_RTA.zip, G-eSAA_TEST10KM_Survey.zip, ncr.pmtiles, ncr_cut.pmtiles
DIR/old/v2.42.28/, DIR/old/v2.42.5/, …               older G-eSAA builds (the unzipped polecam folder)
DIR/arm/                                             drawings made from the template (t24227a)
```

A folder called `tests/private/` is used by itself if there is one; `.gitignore` keeps it out of the repository.

## Running it on a computer (not needed for GitHub)

1. Python 3.10 or later, and Node.js 18 or later.
2. Once:
   ```
   pip install -r tests/requirements.txt
   python -m playwright install chromium
   npm install --prefix tests
   ```
3. From the repository folder: `python3 tests/run_all.py`. Port 8765 must be free.

## On GitHub

Open the repository's **Actions** tab → **Tests** → **Run workflow**, pick **beta** or **main**. The **Tests** run is listed with a yellow dot while it runs (about 1 hour), then a green ✓ (every file passed or was skipped) or a red ✗ (one failed). Click the run: its page shows the table, one line per file, with n of n. **test-logs** at the bottom of that page holds every log (kept 14 days). To run it by hand: **Actions → Tests → Run workflow**, pick the branch, **Run workflow**.
