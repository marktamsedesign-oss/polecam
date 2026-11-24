/* G-eSAA v2.42.26: builds the plan DXF off the screen's thread with the same dxftpl.js, so the app keeps answering taps while the
   plan is made. The app sends { id, seed, job } and gets { id, ok, out } back (out: { text, report }), or { id, ok: false, err }.
   (beta 7.8, Drawing photos) only: 'report': out is { report } (the Drawing's preview of where the plan puts the photos needs no DXF). */
importScripts('dxftpl.js');
self.onmessage = (ev) => {
  const { id, seed, job, only } = ev.data || {};
  try { const out = self.GeDxfTpl.build(seed, job); self.postMessage({ id, ok: true, out: only === 'report' ? { report: out.report } : out }); } catch (e) { self.postMessage({ id, ok: false, err: String((e && e.message) || e), stack: String((e && e.stack) || '') }); }
};
