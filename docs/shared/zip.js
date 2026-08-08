// @ts-check
/**
 * SEMBLA ZIP — winziger ZIP-Writer UND -Leser OHNE externe Bibliothek.
 *
 * Geschrieben wird unkomprimiert (STORE, Methode 0) als gueltiges ZIP (lokale
 * Header + Central Directory + End-of-Central-Directory). Das reicht fuer den
 * zentralen Export der Suite (JSON/CSV/HTML/IFC sind ohnehin klein).
 *
 * GELESEN (`entpacke`, Etappe C5 / [L-13]) wird auch Deflate — ein vom Nutzer neu
 * gepacktes Archiv ist praktisch immer komprimiert. Entpackt wird ueber das native
 * `DecompressionStream('deflate-raw')`, also weiterhin ohne Fremd-Lib.
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

// --- Lesen (Gegenrichtung, Etappe C5 / [L-13]) ------------------------------
// Gebraucht wird sie fuer den Import eines vollstaendigen Projektarchivs. Gelesen
// wird streng nach dem CENTRAL DIRECTORY (es ist die verbindliche Inhaltsangabe
// eines ZIPs); der lokale Header liefert nur die Laengen von Name und Extra-Feld,
// weil erst dahinter die Daten beginnen. Bei „data descriptor“-Eintraegen (Flag
// Bit 3) stehen im lokalen Header ohnehin Nullen — die Central-Werte gelten.
//
// Unterstuetzt werden STORE (0) und DEFLATE (8, ueber das native
// `DecompressionStream('deflate-raw')`). Alles andere wird BENANNT abgewiesen,
// nicht naeherungsweise gedeutet; die CRC32 jedes Eintrags wird geprueft.

/** Signatur des End-of-Central-Directory. */
const _EOCD_SIG = 0x06054b50;

function _findeEocd(view, len) {
  const max = Math.min(len, 22 + 0xFFFF);          // 22 Byte + maximaler Kommentar
  for (let i = 22; i <= max; i++) {
    const p = len - i;
    if (view.getUint32(p, true) === _EOCD_SIG) return p;
  }
  return -1;
}

/** Ein Deflate-Rohdatenstrom entpacken (nativ, keine Fremd-Lib). */
async function _inflate(bytes, name) {
  const DS = globalThis.DecompressionStream;
  if (typeof DS !== "function") {
    throw new Error(`„${name}“ ist komprimiert (Deflate), aber dieser Browser stellt kein `
      + "DecompressionStream bereit. Bitte das Archiv unkomprimiert (STORE) packen oder als "
      + "Ordner importieren.");
  }
  const ds = new DS("deflate-raw");
  const schreiber = ds.writable.getWriter();
  schreiber.write(bytes);
  schreiber.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/**
 * Ein ZIP lesen. Liefert die Eintraege in der Reihenfolge des Central Directory.
 * Ordnereintraege (Name endet auf „/“) werden weggelassen — sie tragen keine Daten.
 *
 * @param {Uint8Array|ArrayBuffer} daten
 * @returns {Promise<Array<{name:string, data:Uint8Array}>>}
 */
export async function entpacke(daten) {
  const buf = (daten instanceof Uint8Array) ? daten : new Uint8Array(daten);
  if (buf.length < 22) throw new Error("Datei ist kein ZIP (zu kurz für ein Zentralverzeichnis).");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const eocd = _findeEocd(view, buf.length);
  if (eocd < 0) throw new Error("Datei ist kein ZIP (End-of-Central-Directory nicht gefunden).");
  const anzahl = view.getUint16(eocd + 10, true);
  const cdGroesse = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (anzahl === 0xFFFF || cdOffset === 0xFFFFFFFF || cdGroesse === 0xFFFFFFFF) {
    throw new Error("ZIP64-Archive werden nicht gelesen. Bitte das Archiv kleiner teilen oder "
      + "als Ordner importieren.");
  }
  if (cdOffset + cdGroesse > buf.length) throw new Error("ZIP ist beschädigt (Zentralverzeichnis liegt außerhalb der Datei).");

  const dec = new TextDecoder("utf-8");
  const eintraege = [];
  let p = cdOffset;
  for (let i = 0; i < anzahl; i++) {
    if (p + 46 > buf.length || view.getUint32(p, true) !== 0x02014b50) {
      throw new Error(`ZIP ist beschädigt (Eintrag ${i + 1} im Zentralverzeichnis unlesbar).`);
    }
    const methode = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const komprimiert = view.getUint32(p + 20, true);
    const roh = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const kommLen = view.getUint16(p + 32, true);
    const lokal = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + kommLen;

    if (name.endsWith("/")) continue;                       // Ordnereintrag, keine Daten

    if (lokal + 30 > buf.length || view.getUint32(lokal, true) !== 0x04034b50) {
      throw new Error(`ZIP ist beschädigt (lokaler Header von „${name}“ fehlt).`);
    }
    const lNameLen = view.getUint16(lokal + 26, true);
    const lExtraLen = view.getUint16(lokal + 28, true);
    // Der lokale Name muss zum Zentralverzeichnis passen — sonst beschreibt das
    // Archiv zwei verschiedene Dinge, und welches gilt, wird nicht geraten.
    if (dec.decode(buf.subarray(lokal + 30, lokal + 30 + lNameLen)) !== name) {
      throw new Error(`ZIP ist beschädigt („${name}“ heißt im lokalen Header anders).`);
    }
    const von = lokal + 30 + lNameLen + lExtraLen;
    if (von + komprimiert > buf.length) throw new Error(`ZIP ist beschädigt („${name}“ reicht über das Dateiende hinaus).`);
    const rohdaten = buf.subarray(von, von + komprimiert);

    let inhalt;
    if (methode === 0) inhalt = rohdaten.slice();
    else if (methode === 8) inhalt = await _inflate(rohdaten, name);
    else throw new Error(`„${name}“ nutzt das nicht unterstützte Kompressionsverfahren ${methode} `
      + "(nur STORE und Deflate werden gelesen).");

    if (inhalt.length !== roh) {
      throw new Error(`„${name}“ ist beschädigt (${inhalt.length} statt ${roh} Byte nach dem Entpacken).`);
    }
    if (_crc32(inhalt) !== crc) throw new Error(`„${name}“ ist beschädigt (Prüfsumme CRC32 stimmt nicht).`);
    eintraege.push({ name, data: inhalt });
  }
  return eintraege;
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
