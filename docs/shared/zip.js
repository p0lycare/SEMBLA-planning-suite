// @ts-check
/**
 * SEMBLA ZIP — winziger ZIP-Writer OHNE externe Bibliothek.
 *
 * Speichert Dateien unkomprimiert (STORE, Methode 0) und schreibt ein
 * gueltiges ZIP (lokale Header + Central Directory + End-of-Central-Directory).
 * Reicht fuer den zentralen Export der Suite (JSON/CSV/HTML/IFC sind ohnehin
 * klein) und bleibt damit voll offline-faehig — passt zur "kein Build"-Regel.
 *
 * Reine Funktionen (kein DOM ausser der Download-Hilfe). `TextEncoder` ist im
 * Browser und in Node vorhanden, daher auch per Node-Test nutzbar.
 *
 * ES-Modul.
 */

// CRC32-Tabelle (einmalig).
const _CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Uint8Array} buf @returns {number} CRC32 (unsigned) */
function _crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = _CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** String oder Uint8Array → Uint8Array (UTF-8). */
function _bytes(data) {
  return (data instanceof Uint8Array) ? data : new TextEncoder().encode(String(data ?? ""));
}

/**
 * Mehrere Dateien zu einem ZIP (Uint8Array) packen.
 * Zeitstempel wird bewusst auf 0 gesetzt (reproduzierbar, kein Date im Kern).
 * @param {Array<{name:string, data:(string|Uint8Array)}>} files
 * @returns {Uint8Array}
 */
export function zipSync(files) {
  const enc = new TextEncoder();
  const locals = [];   // lokale Eintraege (Header + Daten)
  const centrals = []; // Central-Directory-Eintraege
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = _bytes(f.data);
    const crc = _crc32(dataBytes);
    const size = dataBytes.length;

    // Lokaler Datei-Header (30 Byte + Name) + Daten
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);   // Signatur
    lv.setUint16(4, 20, true);           // Version needed
    lv.setUint16(6, 0x0800, true);       // Flags: Bit 11 = UTF-8-Namen
    lv.setUint16(8, 0, true);            // Methode 0 = STORE
    lv.setUint16(10, 0, true);           // Zeit
    lv.setUint16(12, 0, true);           // Datum
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);        // komprimiert = unkomprimiert (STORE)
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // Extra-Feld-Laenge
    lh.set(nameBytes, 30);
    locals.push(lh, dataBytes);

    // Central-Directory-Eintrag (46 Byte + Name)
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);   // Signatur
    cv.setUint16(4, 20, true);           // Version made by
    cv.setUint16(6, 20, true);           // Version needed
    cv.setUint16(8, 0x0800, true);       // Flags: UTF-8
    cv.setUint16(10, 0, true);           // Methode STORE
    cv.setUint16(12, 0, true);           // Zeit
    cv.setUint16(14, 0, true);           // Datum
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);           // Extra
    cv.setUint16(32, 0, true);           // Kommentar
    cv.setUint16(34, 0, true);           // Disk-Nr.
    cv.setUint16(36, 0, true);           // interne Attribute
    cv.setUint32(38, 0, true);           // externe Attribute
    cv.setUint32(42, offset, true);      // Offset des lokalen Headers
    ch.set(nameBytes, 46);
    centrals.push(ch);

    offset += lh.length + dataBytes.length;
  }

  const centralSize = centrals.reduce((a, b) => a + b.length, 0);
  const centralOffset = offset;

  // End of Central Directory (22 Byte)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);              // Disk-Nr.
  ev.setUint16(6, 0, true);              // Disk mit CD
  ev.setUint16(8, files.length, true);   // Eintraege auf dieser Disk
  ev.setUint16(10, files.length, true);  // Eintraege gesamt
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);             // Kommentarlaenge

  // Alles zusammenfuegen
  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of locals) { out.set(part, p); p += part.length; }
  for (const part of centrals) { out.set(part, p); p += part.length; }
  out.set(eocd, p);
  return out;
}

/**
 * ZIP bauen und im Browser als Download anbieten.
 * @param {string} filename @param {Array<{name:string, data:(string|Uint8Array)}>} files
 */
export function downloadZip(filename, files) {
  const bytes = zipSync(files);
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
