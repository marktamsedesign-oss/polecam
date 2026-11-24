/* G-eSAA v2.42.26: builds the plan DXF off the screen's thread with the same dxftpl.js, so the app keeps answering taps while the
   plan is made. The app sends { id, seed, job } and gets { id, ok, out } back (out: { text, report }), or { id, ok: false, err }.
   (beta 7.8, Drawing photos) only: 'report': out is { report } (the Drawing's preview of where the plan puts the photos needs no DXF).
   (beta 7.9, Drawing preview) only: 'plan': out is { report, plan }: plan, the plan's model space as its PDF prints it (dxfpdf.js's planList: the
   same drawing code as the PDF), for the Drawing to draw; what is on or near its GEO sheets, their grid left out (the Drawing draws the
   sheets itself); its arrays sent, not copied. plan null (perr: why) when it cannot be made: the report still comes. (Drawing labels) plan.own:
   each item's index in report.movable (the label, number, pole details or photo it draws), sent too. */
importScripts('dxftpl.js');
self.onmessage = (ev) => {
  const { id, seed, job, only } = ev.data || {};
  try {
    const out = self.GeDxfTpl.build(seed, job);
    if (only === 'plan') {
      let plan = null, perr = '';
      try { // (the plan's photo places come back even when its drawing cannot be made: the Drawing as before then)
        if (!self.GeDxfPdf) importScripts('reports.js', 'dxfpdf.js');
        const t0 = Date.now(); plan = self.GeDxfPdf.planList(out.text, out.report);
        if (plan) plan.ms = Date.now() - t0;
      } catch (e) { plan = null; perr = String((e && e.message) || e); }
      self.postMessage({ id, ok: true, out: { report: out.report, plan, perr } }, plan ? [plan.pts.buffer, plan.subs.buffer, plan.items.buffer, plan.boxes.buffer, plan.own.buffer] : []);
      return;
    }
    self.postMessage({ id, ok: true, out: only === 'report' ? { report: out.report } : out });
  } catch (e) { self.postMessage({ id, ok: false, err: String((e && e.message) || e), stack: String((e && e.stack) || '') }); }
};
