# Splicing details (demo)

A demo of a new plan export: the **splicing details** of a project's fiber, as a **single line diagram** and as a **detailed** splicing drawing, for **Access OSP** and for **Broadband (OLT / ODN)**. Output: PDF, DXF (R12) or both in one ZIP.

| File | What it is |
|---|---|
| `splice.js` | The engine: fiber assignment, the drawings (A3 sheets), and the writers (SVG preview, PDF, DXF R12, ZIP). No other library needed. |
| `splice-demo.html` | The demo page: made-up samples, editable tables, preview, export. Open it beside `splice.js` (for example `/beta/vendor/splice/splice-demo.html` once it is on the beta website). |

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
- **Broadband**: from the OLT/ODF, an optional feeder (size, closure, first fiber), the mains (size, closure, first fiber) and the NAPs (main, line, 8 or 16 ports, pole), it numbers the lines, fills 6F drops with five lines each (fibers 2-6), gives the mains their feeder fibers in order and wires each line's 1:4 and 1:8s. A line's next NAPs are fed on a 6F branch from its N01 (branch fibers 1, 2, 3 in order).
- **Broadband detailed** is one drawing in the layout of reference 3: the ODF at the lower left (this sheet's ports one by one), the feeder into its closure (an ellipse, the splices inside), each main as a bundle of fibers (working red, spare black) up to its 72C closure with its fiber splicing assignment, then every 6F drop, numbered 1, 2, 3…, through its N01s, the next NAPs hanging below on their branch, over an A-01 / B-01 reference grid. Mains that do not fit go on further sheets (drawn at 55 % or more).
- **Sheets**: A3 landscape, frame, title block (editable names and roles), legend. The single line diagram is one sheet; the detailed drawing flows over as many sheets as it needs.
- **DXF**: R12 (AC1009), sheets side by side in model space, 1 unit = 1 mm, layers `SPL_FOC_NEW`, `SPL_FOC_EXIST`, `SPL_CLOSURE_NEW`, `SPL_SITE_NEW`, `SPL_FIBER`, `SPL_FIBER_USED`, `SPL_SPLITTER`, `SPL_NAP`, `SPL_CABLE`… with DASHED for cables.

## Next: into the app

1. Build the model from the project: site/OLT/ODF pins, closures on poles and in handholes, dummy NAPs, NAP records, and each cable's RUN (type, size, new/existing, length).
2. Ask only what the app does not record yet: the links and their fiber counts, the fibers in use on existing cables and FDUs, FDU capacity, NAP line labels.
3. A **Splicing details** card beside *Export the plan*: Single line diagram / Detailed, PDF / DXF / both.
4. Add the files to `sw.js`'s SHELL list and to the APK's copy line, and change `VERSION`.
