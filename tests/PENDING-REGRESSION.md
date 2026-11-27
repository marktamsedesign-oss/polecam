# Pending regression tests

Releases pushed with only their own tests run, to save usage (the owner, 27 Nov: "push update with minimal test to save usage and for
later regression test (put on record MD)"). Before the next push to **main**, or the next full beta, run what is listed here and then move
the release to **Done** with the results.

## Beta 7.19 / 2.45.21 (on beta 7.18 / 2.45.20)

What changed:

- **Existing cable along the road:** the side comes from the first tap; a tap on the other side of the road crosses it there; a tap
  dragged across in Edit crosses it too. Right-click on the map and Ctrl+Z (⌘Z) undo, Ctrl+Y / Ctrl+Shift+Z redo, while drawing or editing
  one. Files: `core.js` (`PoleCore.xc.sides`), `app.js`, `tutorial.js`, `README.md`.
- **Riser detail:** drawn with the CEF editor's own isometric model, moved unchanged into the new shared file `vendor/cef/20_isokit.js`.
  The CEF page, the plan worker and the app load it, and it is in SHELL. On the plan, the inset can be moved and sized (Size − / Size +) on
  the Drawing with Undo, and its frame is filled white (WIPEOUT). Files: `dxftpl.js`, `dxfpdf.js`, `dxf-worker.js`, `app.js`,
  `index.html`, `sw.js`, `vendor/cef/20_isokit.js`, `30_core.js`, `40_iso.js`, `cef.html`, `tools/cef-template/frame.cjs`.

Run before the push (all pass):

| Test | Result |
|---|---|
| `existing-cable.test.cjs`, `existing-cable.spec.cjs` | pass |
| `riser-detail.test.cjs`, `riser-detail.spec.cjs` | pass |
| `cef-drawing.test.cjs`, `cef-template.test.cjs` (the CEF byte-for-byte checks) | pass |
| `tutorial-search.test.cjs` | pass |
| Together on the release tree | 79 tests, 79 pass |
| Also run by the helpers alone | `cef-drawing.spec.cjs` 4/4; 112 CEF outputs of 14 made-up plans identical before and after the shared file |

Still to run:

1. The quick suite: `node --test tests/*.test.cjs tests/*.spec.cjs` (beta 7.18: 322 tests, 321 pass, 1 skipped).
2. Most at risk, if the quick suite is too long:
   - The CEF page now loads a new file first: `cef-site.spec.cjs`, `cef-template.spec.cjs`, `cef-company.spec.cjs`.
   - New right-click and Ctrl+Z listeners on the map, and a new kind of item on the Drawing: `drawing-fixes.spec.cjs`,
     `drawing-menu.spec.cjs`, `drawing-modes.spec.cjs`, `drawing-records.spec.cjs`, `drawing-tools.spec.cjs`, `user-permissions.spec.cjs`,
     `plan-export.spec.cjs`.
   - The template kit and client templates: `plan-kit.test.cjs`, `client-templates.spec.cjs`, `client-plan-template.spec.cjs`.
3. The full regression: `python3 tests/run_all.py` (beta 7.18: 84 passed, 38 skipped for private inputs, 0 failed; over 2 hours: run it
   in two parts with `--only` if a session limits a run to 2 hours).
4. With the private inputs (on the owner's computer): `t24210a_v23` (it counts 32 sheets / pages; a sample with an existing riser pole
   gains a RISER DETAIL page since 7.18), and the plans with an existing riser pole: `t24220a`, `t24220a_v25`, `t24217a_v18`, `t237e`.

Known by design:

- A plan with an existing riser pole whose detail is on its own sheet or on the plan draws it differently from 7.18 (the CEF model).
  Hashes of such whole plans change.
- The inset's place and size are kept like a photo's place: per project and in backups, not in team shares.

## Done

(none yet)
