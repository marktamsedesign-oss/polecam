/* PoleCam text reader: runs Tesseract OCR (Apache-2.0, tesseract.js-core + tessdata_fast English model) fully offline
   in a background thread, so the camera screen never freezes. Message in: {id, image: PNG bytes}. Out: {id, ok, words, text}. */
let api = null, TM = null, ready = null;

async function init() {
  importScripts('vendor/tesseract/tesseract-core-lstm.js');
  TM = await self.TesseractCore({ locateFile: (p) => 'vendor/tesseract/' + p });
  const r = await fetch('vendor/tesseract/eng.traineddata');
  if (!r.ok) throw new Error('Text model missing (vendor/tesseract/eng.traineddata)');
  TM.FS.writeFile('./eng.traineddata', new Uint8Array(await r.arrayBuffer()));
  api = new TM.TessBaseAPI();
  const status = api.Init(null, 'eng', 1); // 1 = LSTM engine
  if (status !== 0) throw new Error('Text reader could not start (' + status + ')');
}

/** Parse Tesseract TSV output into words with confidence and box. */
function parseTsv(tsv) {
  const words = [];
  for (const line of tsv.split('\n')) {
    const c = line.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const text = c.slice(11).join('\t').trim();
    if (!text) continue;
    words.push({ text, conf: +c[10], left: +c[6], top: +c[7], width: +c[8], height: +c[9], line: `${c[2]}-${c[3]}-${c[4]}` });
  }
  return words;
}

self.onmessage = async (e) => {
  const { id, image, psm, whitelist, vars } = e.data;
  try {
    if (!ready) ready = init();
    await ready;
    TM.FS.writeFile('/input', image);
    if (api.SetImageFile(1, 0) === 1) throw new Error('Could not read the image');
    api.SetVariable('tessedit_char_whitelist', whitelist || '');
    api.SetVariable('user_defined_dpi', '300');
    for (const [k, v] of Object.entries(vars || {})) api.SetVariable(k, String(v));
    api.SetPageSegMode(psm == null ? 6 : psm);
    api.Recognize(null);
    const words = parseTsv(api.GetTSVText(0));
    const text = api.GetUTF8Text();
    api.Clear();
    self.postMessage({ id, ok: true, words, text });
  } catch (err) {
    ready = null; api = null;
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
