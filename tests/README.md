# G-eSAA tests

Every test of G-eSAA, with one command that runs them all and prints **n of n** for each file:

```
python3 tests/run_all.py
```

On GitHub this runs by itself on every push to the **beta** and **main** branches (`.github/workflows/tests.yml`).

All test data is made up (Juan Dela Cruz, Pedro Santos, Maria Garcia, Ana Reyes, DEMO CONTRACTOR, @demo-contractor.example). Nothing confidential is in this folder: no company plan template, no survey, no key.

## What is here

| | |
|---|---|
| `run_all.py` | The one command. Serves the app at `http://localhost:8765`, runs each file, prints `PASS name: n of n`, `FAIL name: …` or `SKIP name: needs …`, and writes `results/` (a log per file and `summary.md`). |
| `photo-save.spec.cjs`, `image-preparation.test.cjs`, `dxf-cleanup.test.cjs` | Node tests: saving photos, preparing images, the plan DXF cleanup. |
| `regression/` | The regression tests the release notes name (t229b, t2433c, t24228a…), in the folders they were written in, so a test that reads another test's helpers finds them. `regression/v243/e2e/` holds stand-ins for the online sheet and the team mailbox: they run the **real** sheet script and mailbox script (`regression/v243/sheet/`, `regression/v243/mailbox/`). |
| `regression/fixtures/maps/` | Three small offline map packs cut from the public Protomaps builds (© OpenStreetMap contributors, ODbL). |

`python3 tests/run_all.py --list` lists every file and what it needs. `--only t229b` runs the files whose name has that part.

A full run takes about 1½ hours: t229b runs **20 times** in it (its download-progress check once failed now and then), and t2357a runs last, alone (it serves the app on port 8765 itself).

## Tests that skip without private inputs

Some tests need files that never go into the repository. Without them, the test is skipped with a line that says what it needs:

| Needs | Tests |
|---|---|
| The company plan template (`seed.dxf`) | t24228a_v243, t24226a_v28, t24225a_v26, t24224a_v26, t24223a_v28, t24223b_v26, t24221b_v28, t24220b_v25, t24218a_v28, t24217a_v18, t24216a_v26, t24214a_v28, t24212a_v28, t24212b, t24210a_v23, t2429a, t2428a, t2424a_v24, t2421a_v24, t242a_v24, t241a_v28, t241b_v28, t239a_v18, t237e, t237a_v18, t2356b_v24, t235a_v24, t235b_v24, t234a_v24, t24227a_v28. Also the DXF part (C4) of t24333e. |
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

After a push to **beta** or **main**, open the repository's **Actions** tab. The **Tests** run is listed with a yellow dot while it runs (about 1 hour), then a green ✓ (every file passed or was skipped) or a red ✗ (one failed). Click the run: its page shows the table, one line per file, with n of n. **test-logs** at the bottom of that page holds every log (kept 14 days). To run it by hand: **Actions → Tests → Run workflow**, pick the branch, **Run workflow**.
