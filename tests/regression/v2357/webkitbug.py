# Emulates Safari 26 / 27 (iOS 27.0.1 included): FileSystemWritableFileStream.write(view) writes the view's whole underlying
# buffer, ignoring byteOffset and byteLength (WebKit bug, reported in unoplatform/uno#25684). Blob streams give chunks of an
# odd size (each its own buffer), so a chunk straddles the 8 MB part boundary as on the iPhone.
WEBKIT_BUG_JS = """(() => {
  const P = window.FileSystemWritableFileStream && FileSystemWritableFileStream.prototype;
  if (P && !P.__wk) { const w = P.write; P.write = function (d) { if (ArrayBuffer.isView(d)) d = new Uint8Array(d.buffer); return w.call(this, d); }; P.__wk = true; }
  if (!Blob.prototype.__wk) {
    Blob.prototype.stream = function () { const b = this; let pos = 0; const CH = 196613;
      return new ReadableStream({ async pull(c) { if (pos >= b.size) { c.close(); return; } const ab = await b.slice(pos, pos + CH).arrayBuffer(); pos += CH; c.enqueue(new Uint8Array(ab)); } }); };
    Blob.prototype.__wk = true;
  }
})()"""
PARTS_JS = """async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('mappacks'); const o = {};
  for await (const [n, h] of d.entries()) o[n] = (await h.getFile()).size; return o; }"""
# SHA-256 of a pack as the app reads it (PackSource), to compare with the original file
HASH_JS = """async (id) => { const p = __polecam.S.packs[id], src = new __polecam.PackSource(id), parts = [];
  for (let o = 0; o < p.size; o += 8388608) parts.push(new Uint8Array((await src.getBytes(o, Math.min(8388608, p.size - o))).data));
  const all = new Uint8Array(p.size); let k = 0; for (const u of parts) { all.set(u, k); k += u.length; }
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', all)); return [...h].map((x) => x.toString(16).padStart(2, '0')).join(''); }"""
