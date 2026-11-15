# Splicing details (demo)

A demo of a new plan export: the **splicing details** of a project's fiber, as a **single line diagram** and as a **detailed** splicing drawing, for **Access OSP** and for **Broadband (OLT / ODN)**. Output: PDF, DXF (R12) or both in one ZIP.

| File | What it is |
|---|---|
| `splice.js` | The engine: fiber assignment, the drawings (A3 sheets), and the writers (SVG preview, PDF, DXF R12, ZIP). No other library needed. |
| `splice-demo.html` | The demo page: made-up samples, editable tables, preview, export. Open it beside `splice.js` (for example `/beta/vendor/splice/splice-demo.html` once it is on the beta website). |
| `ask-demo.html`, `ask.js` | The **Ask & Draw** demo (the plan for the app): five made-up projects shaped like the app's data, a bridge to the engine, the live single line diagram on top and one plain question at a time below, tap-to-change, the fiber strip, As-Plan / As-Built (Mark tested), export. |

Everything in the samples is made up: sites, codes, cable IDs, pole IDs and names.

## What the reference drawings show

These notes come from the owner's reference files (a PowerPoint of Access OSP single line diagrams and two broadband DXFs). The files themselves are confidential and are **not** in this public repository; keep them in a private folder (as `tests/README.md` does for the plan template).

### 1. Access OSP: single line diagram (PowerPoint, 4 samples)

- One line from homing to homing (FDU panel to FDU panel), through closures. **New is red, existing is blue**: dashed red line = new FOC, dashed blue = existing FOC; red pentagon = proposed closure, blue pentagon = existing closure; red box = new FDU panel, blue box = existing FDU panel.
- Site: name and code in bold beside its FDU (e.g. `SITE (CODE)`), and under it the FDU's block:
  - new FDU: `CODE_FDU_001`, `Capacity: 48 Ports`, `Terminated Ports: 1-48`, `Terminated Fibers: 13-60 (cable ID)`
  - existing FDU: `Capacity: 72 Ports`, `Active: 1-2,13-24`, `Vacant: 3-12,25-72`
- Proposed closure: `PROPOSED CLOSURE / STRAIGHT SPLICING / Coordinates: "TBF"` (coordinates in red). Existing closure: `EXISTING CLOSURE` and its coordinates. A photo of the existing closure and of each FDU sits above it.
- Each side of a closure carries its fibers in red: `F1-6 ⬠ F1-6` (straight), `F1-6 ⬠ F13-18` (new cable onto the vacant fibers of an existing one).
- Each cable: its cable ID under the line; a new one has its length in a green box (`30m`, `2km`, `1.2km`); an existing one reads `EXISTING 72 FOC`.
- The four cases: (1) a new link through proposed closures onto an existing cable; (2) a new site on a branch from a proposed closure, the branch carrying F1-6 to one side and F7-12 to the other; (3) a branch from a closure on an existing cable (F25-30 on both sides); (4) two legs (LEG 1, LEG 2) from two closures to one site.
- Legend at the foot; title block: logo, `SINGLE LINE DIAGRAM`, `PROJECT NAME_PLAN ID_SITENAME`, exchange, dwg. no., scale NTS, sheet no., issue date, three names over their roles, and a confidentiality line.

### 2. Broadband: splicing single line diagram (DXF)

- OLT → ODF (port groups `F1-F6`, `F7-F12`…) → splice points (SP1, SP2) where the 72C FOC fibers meet the 6F drop cables (`F2-F4 (72C FOC)` → `F2-F4 (6F DROP CABLE)`).
- One row per main / leg: `MAIN 1`, `LEG 01`, `[6FOC L001-L003 / F2-F4]`. Each line `Lnnn` is one fiber of the 72C (`F2-72C`) and the same fiber of the 6F drop (`F2-6C`); fiber 1 of each six is spare.
- Each NAP box: line ID, the 1:4 (circle) and 1:8 (triangles) symbols in green, `Lnnn_N01`, `16 ports`, `(n) pole ID`, pole type. The line's next NAP (`_N02`) hangs off it with `F1-F2`.
- Counts in a box: single LCP (lines), single NAP, double NAP, designed lines (= ports), demand lines.

### 3. Broadband: detailed splicing (DXF)

- ODF port list (used ports one by one, unused ones grouped) → **feeder 144C** → **144C closure** with `Fiber Splicing Assignment 13-44 (144C) / 13-44 (72C)` → **main distribution cables 72C** → **72C closures** (numbered) → **DROP 6F** cables through the NAPs.
- In a NAP box the six drop fibers run across. The line's fiber (highlighted yellow) goes into a **1:4**; outputs 3 and 4 feed the NAP's own **1:8**s (DNAP = two, 16 ports; SNAP = one, 8 ports); outputs 1 and 2 are spliced onto the drop's free fibers 1 and 2 and go on to the line's next NAP. Unused outputs are capped. Working fibers red, spare black.

## What the engine does

- **Access OSP**: from points (sites/FDU, closures, dummy NAPs), cables (size, new/existing, length, fibers in use) and **links** (two ends and the number of fibers), it finds each link's route and gives it the **lowest free run of fibers on every cable**. Straight splices keep their numbers; an existing cable gives its first vacant fibers; a new FDU shared by two cables gives each an equal part of its ports. The samples reproduce the four PowerPoint cases (sample 2 gives exactly F1-6 / F7-12 on the branch and F13-18 on the existing cable).
- **Access OSP detailed** is drawn like the ODN's (owner's request): the homing ODF at the left with its working ports, every cable a bundle of fibers (the working ones one by one in red, the rest as two black lines), every closure an ellipse (red proposed, blue existing) with its splices inside and the fiber numbers at both ends, and the far ends at the right on rows of their own: an ODF (FDU panel) or a **dummy NAP** (pole-mounted small cell) instead of the ODN's NAPs. Same A-01 / B-01 grid and legend.
- **Fiber numbers everywhere** (both detailed drawings, owner's request): at every enclosure each splice shows its fiber on both sides (F25 into F1), the capped rest of each cable is named (F13-72), an ODF or dummy NAP row reads port and fiber (P25 F25), a 72C closure shows the main's fiber going in and the drop's fiber coming out, and each NAP shows the drop fibers 1-6 in and out and which fiber the line takes (F3 (6F) = F3 (72C)).
- **Broadband**: from the OLT/ODF, an optional feeder (size, closure, first fiber), the mains (size, closure, first fiber) and the NAPs (main, line, 8 or 16 ports, pole), it numbers the lines, fills 6F drops with five lines each (fibers 2-6), gives the mains their feeder fibers in order and wires each line's 1:4 and 1:8s. A line's next NAPs are fed on a 6F branch from its N01 (branch fibers 1, 2, 3 in order).
- **Broadband detailed** is one drawing in the layout of reference 3: the ODF at the lower left (this sheet's ports one by one), the feeder into its closure (an ellipse, the splices inside), each main as a bundle of fibers (working red, spare black) up to its 72C closure with its fiber splicing assignment, then every 6F drop, numbered 1, 2, 3…, through its N01s, the next NAPs hanging below on their branch, over an A-01 / B-01 reference grid. Mains that do not fit go on further sheets (drawn at 55 % or more).
- **Sheets**: A3 landscape, frame, title block (editable names and roles), legend. The single line diagram is one sheet; the detailed drawing flows over as many sheets as it needs.
- **DXF**: R12 (AC1009), sheets side by side in model space, 1 unit = 1 mm, layers `SPL_FOC_NEW`, `SPL_FOC_EXIST`, `SPL_CLOSURE_NEW`, `SPL_SITE_NEW`, `SPL_FIBER`, `SPL_FIBER_USED`, `SPL_SPLITTER`, `SPL_NAP`, `SPL_CABLE`… with DASHED for cables.

## The owner's answers (15 Nov)

- Sample 3's new FDU: **Terminated Fibers 1-48** of the new branch cable. The reference's "13-60" was a slip copied from another drawing.
- An existing homing's FDU block (Active / Vacant) shows **the state before the work**. The new legs are shown by the fiber labels at the closures and by the legs' tags, not added to Active.
- Test details: in the **As-Built**, a tested leg carries its **test date and its loss / OTDR result**. (The As-Plan has no test result yet.)

## Plan for the app (chosen 15 Nov, after a study of the app and three designs)

**Ask & Draw.** A *Splicing details* page that opens full screen over the app, hosted like the CEF plan editor (its own page in a frame, with its own host object). The top of the screen is the single line diagram, drawn live by `splice.js`, so what the user sees is what prints. The bottom card asks one plain question at a time with big buttons. No tables and no typed fiber ranges.

- **Filled in from the project:** sites, FDUs (ODF records), closures (pole or handhole, ID, new/existing, coordinates, photo), dummy NAPs, the cables drawn in Route mode (size, new/existing, length), the names on the sheet. Data keyed by record id and cable `fid`, never by `RUN n` (those numbers move).
- **Asked:** where the new site's fibers go (one homing, a dummy NAP, or *Both*); how many fibers (6 already picked, 2 for a small cell); with two legs, **"Will both homings be tested end to end now?"** (*Yes, both / Only A / Only B*, nothing picked in advance); which ports are live at an existing FDU (tap or drag on a picture of the ports, *Same as the other homing*, *Not sure yet*); which tubes of an existing cable are in use (asked once per cable, starting on a safe answer).
- **Worked out:** the way through the closures, every fiber number, the FDU ports. Anything can be changed by tapping it on the drawing; moving fibers uses a strip of coloured fiber dots, never typing. A "Still to answer: n" line counts down to *Ready · Export*.
- **Leg states** (on each leg, not on a cable, because one branch cable can carry both legs): *Tested end to end*, *Spliced only, test later* (fibers and ports kept for it), *Not built yet* (prints `xx-xx`). A spliced-only leg is drawn with a dashed fiber label box and the tag "SPLICED ONLY · FOR FUTURE TESTING"; on the detailed drawing its fibers are dashed with hollow splice dots. Later, *Mark tested* stamps the date and the loss / OTDR result (As-Built).
- **Steps:** (A) the engine: leg states, no routing through a site, one label per direction at a branch, separate ports per cable at an FDU, uncut fibers drawn passing through an existing closure, the FDU block as before the work; (B) the guided page with one way in (a Splicing button on the Drawing), Access OSP only; (C) tap-to-change, locks at the first export, Mark tested, Share merge; (D) the detailed drawing's details, photos on the PDF, homings off the map; (E) polish, tutorial, then Broadband.
- **The owner's choices (15 Nov):** fibers on an existing cable = the lowest free fiber (the references mix habits); `xx-xx (… LX)` = a possible second cable into the same new FDU, never on an existing one; the **As-Plan asks no testing questions and prints no testing words** — it only checks that there are free fibers on the actual existing footprint (live FDU ports, fibers in use), while the **As-Built** adds the leg states, the "tested now?" question and Mark tested (date, loss, OTDR); splitting a new FDU between two cables happens but not always, so it is asked when two cables end on one new FDU; cable IDs come later, so each prints `TBF` until entered, with a reminder that does not block export.

## Building it into the app

1. Build the model from the project, as above.
2. Add the files to `sw.js`'s SHELL list (the APK copies `vendor/` whole), and change `VERSION` and, on beta, `APP_BETA`.
