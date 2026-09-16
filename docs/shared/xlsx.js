// @ts-check
/**
 * SEMBLA XLSX — minimaler, DOM-freier Excel-Writer OHNE externe Bibliothek (#135).
 *
 * Erzeugt aus einem AoA (Array of Arrays, dieselbe Quelle wie `aoaToCsv` in
 * sembla-export.js) eine ECHTE, valide `.xlsx`-Datei: ein OOXML-Paket
 * (SpreadsheetML) mit genau einem Tabellenblatt, gepackt ueber den vorhandenen
 * ZIP-Writer `zipSync` (STORE ist im XLSX-Container ausdruecklich zulaessig).
 * Keine umbenannte CSV — Excel oeffnet die Datei ohne Importdialog.
 *
 * ZELLTYPEN (#135): eine JS-Zahl wird eine ZAHLENZELLE (`t="n"`), alles andere
 * eine Inline-Textzelle (`t="inlineStr"`). Kennungen, Bezeichnungen und
 * Warnhinweise bleiben damit Text — fuehrende Nullen gehen nie verloren —,
 * und Mengen/Preise sind in Excel rechenbar. Umlaute sind schlicht UTF-8.
 * Formatiert wird NICHTS (keine Zahlenformate, keine Breiten, keine Farben):
 * das Dateiformat eroeffnet keinen zweiten Darstellungs- oder Rechenpfad.
 *
 * Reine Funktionen, ES-Modul: laeuft im Browser und in Node-Tests per import.
 */

import { zipSync } from "./zip.js";

/** XML-Escaping fuer Text- und Attributinhalte. */
const _esc = (s) => s
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** In XML 1.0 unzulaessige Steuerzeichen entfernen — sonst waere die Datei ungueltig. */
const _xmlSauber = (s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** Spaltenindex (0-basiert) → Excel-Spaltenname: 0→A, 25→Z, 26→AA. */
export function spaltenName(i) {
  let n = i + 1, s = "";
  while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * Blattname nach den Excel-Regeln: ohne die verbotenen Zeichen [ ] : * ? / \,
 * hoechstens 31 Zeichen, nie leer. Umlaute sind zulaessig und bleiben stehen.
 */
export function blattName(name) {
  const s = String(name == null ? "" : name)
    .replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31).trim();
  return s || "Tabelle1";
}

/**
 * Eine Zelle als SpreadsheetML: endliche Zahl → Zahlenzelle, sonst Inline-Text.
 * `null`/`undefined`/leerer Text ergeben KEINE Zelle (leer bleibt leer, wie im CSV).
 * @param {string} ref Zellreferenz (z. B. "B3") @param {any} wert
 */
export function zelleXml(ref, wert) {
  if (wert == null || wert === "") return "";
  if (typeof wert === "number" && isFinite(wert)) return `<c r="${ref}" t="n"><v>${wert}</v></c>`;
  const s = _xmlSauber(String(wert));
  if (!s) return "";
  // Fuehrende/abschliessende Leerzeichen ueberleben nur mit xml:space="preserve".
  const attr = /^\s|\s$/.test(s) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" t="inlineStr"><is><t${attr}>${_esc(s)}</t></is></c>`;
}

const _XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Minimales, von Excel akzeptiertes Stylesheet — bewusst OHNE jede Formatierung.
// (Excel verlangt die zwei Standard-Fills none/gray125, sonst meldet es Reparaturbedarf.)
const _STYLES = _XML
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill>'
  + '<fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border/></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>'
  + "</styleSheet>";

const _CONTENT_TYPES = _XML
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
  + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
  + "</Types>";

const _RELS = _XML
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
  + "</Relationships>";

const _WORKBOOK_RELS = _XML
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + "</Relationships>";

/**
 * AoA → valide XLSX-Datei (Uint8Array) mit genau einem Blatt.
 *
 * Der Inhalt entspricht Zelle fuer Zelle dem AoA — derselben Quelle, aus der
 * `aoaToCsv` die CSV baut. Das Dateiformat aendert also keinen Wert, keine
 * Reihenfolge und keine fachliche Ableitung (#135).
 * @param {Array<Array<any>>} aoa
 * @param {{blatt?:string}} [opts] Blattname (wird nach den Excel-Regeln bereinigt)
 * @returns {Uint8Array}
 */
export function aoaToXlsx(aoa, opts = {}) {
  const zeilen = (aoa || []).map((r, i) => {
    const zellen = (r || []).map((c, j) => zelleXml(spaltenName(j) + (i + 1), c)).join("");
    return zellen ? `<row r="${i + 1}">${zellen}</row>` : "";
  }).join("");
  const sheet = _XML
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + "<sheetData>" + zeilen + "</sheetData></worksheet>";
  const workbook = _XML
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheets><sheet name="${_esc(blattName(opts.blatt))}" sheetId="1" r:id="rId1"/></sheets>`
    + "</workbook>";
  return zipSync([
    { name: "[Content_Types].xml", data: _CONTENT_TYPES },
    { name: "_rels/.rels", data: _RELS },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: _WORKBOOK_RELS },
    { name: "xl/styles.xml", data: _STYLES },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
}
