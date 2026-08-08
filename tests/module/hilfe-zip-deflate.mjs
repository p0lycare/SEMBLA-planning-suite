// Test-Hilfe: ein ZIP mit DEFLATE-Eintraegen bauen.
//
// Der Produktcode SCHREIBT bewusst nur STORE (docs/shared/zip.js) — LESEN muss er
// aber beides, denn ein vom Nutzer neu gepacktes Archiv ist praktisch immer
// komprimiert ([L-13]). Diese Datei erzeugt genau solche Archive fuer die Tests
// und gehoert deshalb NICHT nach docs/.
//
// Komprimiert wird mit dem nativen `CompressionStream('deflate-raw')` — also
// ohne Fremdbibliothek, wie der Leser auch.

async function deflateRoh(u8) {
  // Bewusst OHNE Blob: der Modul-0-Smoke-Test ersetzt `globalThis.Blob` durch ein
  // Double, das keinen Datenstrom liefert.
  const cs = new CompressionStream("deflate-raw");
  const schreiber = cs.writable.getWriter();
  schreiber.write(u8);
  schreiber.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * @param {Array<{name:string, data:(string|Uint8Array)}>} files
 * @returns {Promise<Uint8Array>}
 */
export async function zipDeflate(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const roh = (f.data instanceof Uint8Array) ? f.data : enc.encode(String(f.data));
    const komp = await deflateRoh(roh);
    const crc = crc32(roh);

    const lh = new Uint8Array(30 + nameB.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 8, true);                       // Methode 8 = Deflate
    lv.setUint32(14, crc, true);
    lv.setUint32(18, komp.length, true); lv.setUint32(22, roh.length, true);
    lv.setUint16(26, nameB.length, true); lh.set(nameB, 30);
    locals.push(lh, komp);

    const ch = new Uint8Array(46 + nameB.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, komp.length, true); cv.setUint32(24, roh.length, true);
    cv.setUint16(28, nameB.length, true); cv.setUint32(42, offset, true); ch.set(nameB, 46);
    centrals.push(ch);
    offset += lh.length + komp.length;
  }
  const cSize = centrals.reduce((a, b) => a + b.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cSize, true); ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + cSize + 22);
  let p = 0;
  for (const t of locals) { out.set(t, p); p += t.length; }
  for (const t of centrals) { out.set(t, p); p += t.length; }
  out.set(eocd, p);
  return out;
}
