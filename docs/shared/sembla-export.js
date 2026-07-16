// @ts-check
/**
 * SEMBLA Export — zentrale, DOM-freie Datei-Generatoren.
 *
 * Erzeugt die Ausgabe-Dateien der Suite (Stueckliste, Zuschnittliste,
 * Montageanleitung, IFC, Projekt-JSON) ausschliesslich aus dem Datenmodell:
 * Wandelement (Single Source of Truth) + Eingaben (`eingaben`, siehe storage.js).
 * Keine Modul-Zeichenlogik, kein DOM — dieselben Funktionen nutzen der zentrale
 * Export auf der Startseite UND (kuenftig) die Vorschau in den Modulen.
 *
 * Abgeleitete Werte werden hier IMMER neu gerechnet, nie gespeichert (kein Drift).
 *
 * ES-Modul: laeuft im Browser und in Node-Tests per import.
 */

import { semblaBomItems, semblaBomMenge } from "./sembla-bom.js";
import { berechneAufbau } from "./sembla-aufbau.js";
import { wandelementToIfc } from "./sembla-ifc.js";
import { sicherName } from "./storage.js";

const _fmt = (n, d = 2) => (isFinite(n) ? n : 0).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Netto-Wandflaeche (m²) eines Wandelements (Bruttoflaeche minus Oeffnungen). */
export function wandflaeche(w) {
  const a = (w.length_mm / 1000) * (w.height_mm / 1000);
  const op = (w.openings || []).reduce((s, o) => {
    const gw = ((o.g1 - o.g0) * (w.grid_mm || 125)) / 1000, gh = ((o.l1 - o.l0) * (w.course_mm || 200)) / 1000;
    return s + gw * gh;
  }, 0);
  return Math.max(0.01, a - op);
}

// ---------- Stueckliste ----------

/**
 * Stücklisten-Positionen aus Wandelement + Eingaben. Wandpositionen aus der
 * Core-BOM, Verbinder/Latten aus dem Aufbau-Layout (berechneAufbau) — alles
 * neu gerechnet. @param {object} w @param {object} eingaben
 * @returns {Array<{key,label,unit,menge,ep,gp}>}
 */
export function stuecklistePositionen(w, eingaben) {
  const kosten = eingaben.kosten || {};
  const preise = kosten.preise || {};
  const line = (key, label, unit, menge) => { const ep = +preise[key] || 0; return { key, label, unit, menge, ep, gp: menge * ep }; };
  const out = semblaBomItems(w).map(it => line(it.key, it.label, it.unit, it.menge));
  const A = berechneAufbau(w, eingaben.aufbau || {});
  if (A.pts.length) {
    const typ = A.layout.verbinder_typ;
    const latten = eingaben.aufbau && eingaben.aufbau.latten || {};
    out.push(line("verbinder", "Verbinder" + (typ ? " " + typ : ""), "Stk", A.pts.length));
    out.push(line("latte", "Holzlatte " + (latten.breite_cm ?? 4) + " cm · Stange " + (latten.stange_cm ?? 150) + " cm", "Stk", (A.batt.summary.latten_15m_bedarf || 0)));
  }
  return out;
}

/**
 * Stückliste als AoA (Array-of-Arrays) — Basis fuer CSV/Excel.
 * @param {object} w @param {object} eingaben @param {{datum?:string}} [opts]
 */
export function stuecklisteAoa(w, eingaben, opts = {}) {
  const kosten = eingaben.kosten || {}, projekt = eingaben.projekt || {};
  const cur = kosten.waehrung || "EUR";
  const rs = stuecklistePositionen(w, eingaben);
  const grand = rs.reduce((a, r) => a + r.gp, 0);
  const datum = opts.datum || _heute();
  return [
    ["SEMBLA – Stückliste & Kosten"],
    ["Projekt", projekt.name || w.name || "SEMBLA-Projekt"],
    ["Wand", w.name || "Wandelement"],
    ["Maße", _fmt(w.length_mm / 1000, 3) + " × " + _fmt(w.height_mm / 1000, 2) + " m"],
    ["Datum", datum],
    [],
    ["Position", "Einheit", "Menge", "EP (" + cur + ")", "GP (" + cur + ")"],
    ...rs.map(r => [r.label, r.unit, r.menge, +r.ep.toFixed(2), +r.gp.toFixed(2)]),
    [],
    ["Summe netto", "", "", "", +grand.toFixed(2)],
    ["€/m² Wandfläche", "", "", "", +(grand / wandflaeche(w)).toFixed(2)],
  ];
}

/** AoA → CSV (Semikolon-getrennt, deutsch). */
export function aoaToCsv(aoa) {
  return aoa.map(r => r.map(c => {
    const s = String(c == null ? "" : c);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(";")).join("\n");
}

/** Stückliste direkt als CSV-Text. */
export function stuecklisteCsv(w, eingaben, opts) {
  return aoaToCsv(stuecklisteAoa(w, eingaben, opts));
}

// ---------- Zuschnittliste (Latten) ----------

/** Latten-Zuschnittliste als CSV aus dem Aufbau-Layout. */
export function zuschnittCsv(w, eingaben) {
  const A = berechneAufbau(w, eingaben.aufbau || {});
  const rows = [["achse_x_cm", "segment", "y0_cm", "y1_cm", "laenge_cm"]];
  A.batt.axes.forEach(a => a.segments.forEach((sg, i) => rows.push([a.x_cm, i + 1, sg.y0_cm, sg.y1_cm, sg.len_cm])));
  return rows.map(r => r.join(";")).join("\n") + "\n";
}

// ---------- IFC ----------

/** IFC4-Text des Wandelements. */
export function ifcText(w, opts) { return wandelementToIfc(w, opts); }

// ---------- Montageanleitung (selbsttragendes HTML) ----------

function _openingsAt(w, li) { return (w.openings || []).filter(o => o.l0 <= li && li < o.l1); }

// Eine Lage als SVG-Streifen (pur; identisch zur Modul-5-Zeichnung). mm.
function _courseStrip(w, li, vbW, vbH) {
  const L = w.length_mm, pad = 46, sc = (vbW - 2 * pad) / L, top = 52, hPx = Math.min(66, (vbH - top - 14));
  const X = x => pad + x * sc;
  const c = w.courses[li]; let s = "";
  for (const st of c.stones) {
    const fill = st.type === "i3" ? "#cfd3d8" : "#bcc2c9";
    s += `<rect x="${X(st.x0)}" y="${top}" width="${(st.x1 - st.x0) * sc}" height="${hPx}" fill="${fill}" stroke="#7d848c" stroke-width="1.3"/>`;
    if ((st.x1 - st.x0) * sc > 22) s += `<text x="${X((st.x0 + st.x1) / 2)}" y="${top + hPx / 2 + 4}" font-size="11" fill="#5b6670" text-anchor="middle">${st.type}</text>`;
  }
  for (let gx = 0; gx <= L + 1e-6; gx += 125) { const x = X(gx); const major = (Math.round(gx / 125) % 3 === 0); s += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + hPx}" stroke="#8a93a0" stroke-width="${major ? 0.7 : 0.4}" stroke-opacity="${major ? 0.5 : 0.3}"/>`; }
  { const yb = top + hPx; for (let gx = 0; gx <= L + 1e-6; gx += 125) { const x = X(gx); s += `<line x1="${x}" y1="${yb}" x2="${x}" y2="${yb + 3}" stroke="#8a93a0" stroke-width="0.6"/>`; } }
  for (const o of _openingsAt(w, li)) {
    const ox = X(o.g0 * 125), ow = (o.g1 - o.g0) * 125 * sc;
    s += `<rect x="${ox}" y="${top}" width="${ow}" height="${hPx}" fill="#fff" stroke="#c9461c" stroke-width="1.3" stroke-dasharray="5 4"/>`;
    s += `<text x="${ox + ow / 2}" y="${top + hPx / 2 + 4}" font-size="10.5" fill="#c9461c" text-anchor="middle">${o.art === "fenster" ? "Fenster" : o.art === "durchbruch" ? "Durchbruch" : "Tür"}</text>`;
  }
  const inLage = sg => (sg.lage0 != null) ? (sg.lage0 <= li && li < sg.lage1) : (sg.z0_mm <= li * 200 + 1 && (li + 1) * 200 <= sg.z1_mm + 1);
  const posLbl = mm => { let t = (mm / 10).toFixed(2); if (t.endsWith("0")) t = t.slice(0, -1); if (t.endsWith(".0")) t = t.slice(0, -2); else if (t.endsWith(".")) t = t.slice(0, -1); return t.replace(".", ","); };
  const present = w.tension_columns.filter(col => (col.segments || [{ z0_mm: 0, z1_mm: w.height_mm }]).some(inLage));
  present.forEach((col, i) => {
    const x = X(col.x_mm); const cy = (i % 2) ? top - 16 : top - 30;
    s += `<line x1="${x}" y1="${cy + 11}" x2="${x}" y2="${top + hPx}" stroke="#1f6feb" stroke-width="2.4"/>`;
    s += `<circle cx="${x}" cy="${top + hPx / 2}" r="3.6" fill="#1f6feb" stroke="#fff" stroke-width="1"/>`;
    s += `<rect x="${x - 19}" y="${cy}" width="38" height="12" rx="2" fill="#1f6feb"/><text x="${x}" y="${cy + 9}" font-size="8.5" fill="#fff" text-anchor="middle">${posLbl(col.x_mm)}</text>`;
  });
  s += `<text x="${pad}" y="16" font-size="12" fill="#6b7682">Lage ${li + 1} · Höhe ${_fmt(li * 20, 0)}–${_fmt((li + 1) * 20, 0)} cm · ${present.length} Vorspannstränge · Zahl = Position ab links (cm, exakt) · Raster 12,5 cm</text>`;
  return s;
}

/** Vorspann-Schritte (Text mit einfachem <b>-Markup). @returns {string[]} */
export function vorspannSteps(w) {
  const tc = w.tension_columns, n = tc.length;
  const rods = n ? tc[0].gewindestangen : 0, rod = w.rod_mm || 1100;
  const coups = []; for (let j = 1; j < rods; j++) coups.push(_fmt(j * rod / 10, 0) + " cm");
  const xs = tc.map(c => _fmt(c.x_mm / 10, 1) + " cm").join(", ");
  const topConn = (w.prestress && w.prestress.top_connection) || "blech";
  const oben = topConn === "blech"
    ? "Nach der obersten Lage das <b>Kopfblech</b> (15 mm, in Modulen) auflegen."
    : "Nach der obersten Lage je Strang die <b>Spannplatte</b> auf die obere Steinkante auflegen.";
  return [
    `<b>Bodenblech</b> (15 mm, in Modulen) verlegen und ausrichten; an den ${n} Strangpositionen (x = ${xs}) je eine <b>Senkkopfschraube von unten</b> und eine <b>Kopplungsmutter oben</b> setzen.`,
    "Je Strang die erste <b>Gewindestange</b> in die Kopplungsmutter einschrauben.",
    "Wand <b>lagenweise von unten</b> aufbauen (siehe Lagen-Aufbau): i3 maximiert, i2 als Abschluss an den Enden, Versatz beachten.",
    coups.length ? `An den <b>Kopplungshöhen</b> (${coups.join(", ")}) die Gewindestangen mit <b>Kopplungsmuttern</b> verlängern und handfest sichern (Zwischenspannpunkte).`
      : "Keine Stangenkopplung nötig (Wandhöhe ≤ Stangenlänge).",
    oben,
    `<b>Vorspannung aufbringen</b>: Spannmuttern anziehen (${rods} Stange(n) je Strang).`,
  ];
}

/** Kurz-Stückliste (nur Menge > 0) als HTML-Zeilen. */
function _bomRows(w) {
  return semblaBomItems(w).filter(it => it.menge > 0)
    .map(it => `<tr><td>${it.label}</td><td>${semblaBomMenge(it)}</td></tr>`).join("");
}

/** Vollstaendige, selbsttragende Montageanleitung als HTML-Dokument (druckbar). */
export function montageHtml(w) {
  const titel = "SEMBLA Montageanleitung — " + (w.name || "Wandelement");
  let b = `<h1>${titel}</h1>`;
  b += `<p>Maße ${_fmt(w.length_mm / 1000, 3)} × ${_fmt(w.height_mm / 1000, 2)} m · ${w.N_grid} Raster · ${w.lagen} Lagen · ${w.tension_columns.length} Vorspannstränge.</p>`;
  b += `<h2>Stückliste (Kurzform)</h2><table class="bom">${_bomRows(w)}</table>`;
  b += `<h2>Vorspannung — Schritt für Schritt</h2><ol class="steps">${vorspannSteps(w).map(t => "<li>" + t + "</li>").join("")}</ol>`;
  b += "<h2>Lagen (von oben nach unten)</h2>";
  for (let li = w.lagen - 1; li >= 0; li--) {
    b += `<div class="pcourse"><svg viewBox="0 0 900 120" preserveAspectRatio="xMidYMid meet" style="width:100%">${_courseStrip(w, li, 900, 120)}</svg></div>`;
  }
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${titel}</title><style>
    body{font-family:system-ui,Arial,sans-serif;color:#1c2430;max-width:900px;margin:0 auto;padding:16px}
    h1{font-size:18px} h2{font-size:14px;margin-top:18px;color:#333}
    table.bom{width:100%;border-collapse:collapse;font-size:13px}
    table.bom td{padding:4px 2px;border-bottom:1px solid #e5e7eb}
    table.bom td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
    ol.steps{padding-left:20px;font-size:13px} ol.steps li{margin:6px 0}
    .pcourse{page-break-inside:avoid;margin:6px 0;border-bottom:1px solid #e5e7eb;padding-bottom:6px}
  </style></head><body>${b}</body></html>`;
}

// ---------- Datei-Bündel für den ZIP-Export ----------

/** Aktuelles Datum (de-DE) — hier ausgelagert, damit Tests es ueberschreiben koennen. */
function _heute() { try { return new Date().toLocaleDateString("de-DE"); } catch { return ""; } }

/**
 * Alle waehlbaren Ausgabe-Dateien fuer ein Projekt bauen.
 * @param {{name:string,wandelement:object,eingaben:object}} projekt (aus store.projektObjekt)
 * @param {string[]} auswahl Schluessel: 'projekt','stueckliste','montage','ifc','zuschnitt'
 * @returns {Array<{name:string,data:string}>}
 */
export function baueDateien(projekt, auswahl) {
  const w = projekt.wandelement, eingaben = projekt.eingaben;
  const base = sicherName(projekt.name || w.name);
  const set = new Set(auswahl);
  const files = [];
  if (set.has("projekt")) files.push({ name: "Projekt_" + base + ".json", data: JSON.stringify(projekt, null, 2) });
  if (set.has("stueckliste")) files.push({ name: "Stueckliste_" + base + ".csv", data: stuecklisteCsv(w, eingaben) });
  if (set.has("zuschnitt")) files.push({ name: "Zuschnittliste_Latten_" + base + ".csv", data: zuschnittCsv(w, eingaben) });
  if (set.has("montage")) files.push({ name: "Montageanleitung_" + base + ".html", data: montageHtml(w) });
  if (set.has("ifc")) files.push({ name: base + ".ifc", data: ifcText(w) });
  return files;
}
