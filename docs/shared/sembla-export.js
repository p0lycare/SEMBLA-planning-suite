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
import { nachweise, nachweisParams } from "./sembla-statik.js";
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

// ---------- Statischer Nachweis (selbsttragendes HTML) ----------
// Quelle ist AUSSCHLIESSLICH der volle Schermer-Nachweis (sembla-statik.js): Geometrie,
// Oeffnungszahl und Wandtyp aus dem Wandelement, Kennwerte aus `eingaben.statik` — beides
// ueber nachweisParams(), also dieselbe Abbildung wie in Modul 3. Das vereinfachte
// Auslegungsmodell aus sembla-engine.js wird hier bewusst NICHT verwendet.

const _pct = u => _fmt((isFinite(u) ? u : 0) * 100, 1) + " %";
const _esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/** Kennwert-Gruppen fuer die Dokumentation der verwendeten Eingangswerte: [key, Label, Einheit]. */
const KENNWERT_GRUPPEN = [
  ["Material / Bibliothek", [
    ["f_k", "Wanddruckfestigkeit f<sub>k</sub>", "N/mm²"], ["gamma_w", "Wichte γ<sub>w</sub>", "kN/m³"],
    ["gammaM_wand", "γ<sub>M</sub> Wand", "–"], ["v_Rd", "v<sub>Rd</sub> Plattenschub", "kN/m"],
    ["mu_k", "Reibbeiwert μ<sub>k</sub>", "–"], ["gamma_mu", "γ<sub>M,μ</sub>", "–"]]],
  ["Gewindestange", [
    ["stab", "Auswahl", "–"], ["As", "A<sub>s</sub>", "mm²"], ["fyk_Stab", "f<sub>yk</sub>", "N/mm²"],
    ["fub_Stab", "f<sub>ub</sub>", "N/mm²"], ["gamma_s", "γ<sub>s</sub>", "–"]]],
  ["Lasten — Wind &amp; DIN 4103-1", [
    ["wlz", "Windzone", "–"], ["qpFaktor", "q<sub>p</sub>-Faktor", "–"], ["cpe10", "c<sub>pe,10</sub>", "–"],
    ["torDominant", "Torsituation", "–"], ["gammaQ", "γ<sub>Q</sub>", "–"],
    ["q1_I", "q₁ Kat. I", "kN/m"], ["q1_II", "q₁ Kat. II", "kN/m"], ["a_4103", "Angriffshöhe a", "m"]]],
  ["Vorspannung", [
    ["e_m", "Regelraster e", "m"], ["F0", "Anfangskraft F₀", "kN/Stab"], ["deltaF", "Verlust ΔF/F₀", "–"],
    ["F_inf_min", "Untergrenze F<sub>inf</sub>", "kN/Stab"], ["gammaP_fav", "γ<sub>P,fav</sub>", "–"],
    ["gammaP_sup", "γ<sub>P,sup</sub>", "–"]]],
  ["Prüfwerte Biegung §6.2", [
    ["Nv1", "P1 · N<sub>v</sub>", "kN/m"], ["mRk1", "P1 · m<sub>Rk</sub>", "kNm/m"],
    ["Nv2", "P2 · N<sub>v</sub>", "kN/m"], ["mRk2", "P2 · m<sub>Rk</sub>", "kNm/m"],
    ["Nv3", "P3 · N<sub>v</sub>", "kN/m"], ["mRk3", "P3 · m<sub>Rk</sub>", "kNm/m"]]],
  ["Spannsystem-Bauteile", [
    ["b_Steg", "Steg-Breite b<sub>Steg</sub>", "mm"], ["b_KpO", "Kopfplatte b", "mm"], ["t_KpO", "Kopfplatte t", "mm"],
    ["b_FpU", "Fußplatte b", "mm"], ["t_FpU", "Fußplatte t", "mm"], ["fyk_Platte", "f<sub>yk</sub> Platte", "N/mm²"],
    ["gammaM0", "γ<sub>M0</sub>", "–"], ["gammaM2", "γ<sub>M2</sub>", "–"], ["k2_SK", "k₂ Sechskant", "–"],
    ["k2_Senk", "k₂ Senk", "–"], ["L_Mutter_min", "Mutter L<sub>min</sub>", "mm"],
    ["L_Mutter_vorh", "Mutter L<sub>vorh</sub>", "mm"], ["l_Platte", "Auflagerlänge l<sub>P</sub>", "mm"]]],
  ["Deckenanschluss (Winkel)", [["eW_Winkel", "Winkelabstand e<sub>W</sub>", "m"]]],
  ["Transport / Hebezustand (Zusatz, nicht Gutachten)", [
    ["rho", "Wichte ρ", "kN/m³"], ["fy", "Streckgrenze f<sub>y</sub>", "N/mm²"], ["gammaG", "γ<sub>G</sub>", "–"],
    ["dyn", "dyn. Beiwert", "–"], ["nAnker", "Anschlagpunkte", "Stk"], ["blechB_mm", "Blech b", "mm"],
    ["blechT_mm", "Blech t", "mm"], ["hebelBlech_m", "Hebelarm Blech", "m"]]],
];

/** Kennwert lesbar darstellen (Auswahlen als Klartext). */
function _kennwert(key, val) {
  if (val == null || val === "") return "—";
  if (key === "torDominant") return val === "dominant" || val === true ? "dominante Öffnung (0,9·c<sub>pe</sub>)" : "geschlossen (±0,2)";
  if (key === "wlz") return "WLZ " + _esc(val);
  if (key === "stab") return _esc(val) + " · 8.8";
  const n = +val;
  return isFinite(n) ? _fmt(n, Number.isInteger(n) ? 0 : 3) : _esc(val);
}

/** Ergebnis-Block: Titel + Zeilen + Auslastung. */
function _nwBlock(titel, ok, rows, eta, hinweis) {
  const w = Math.min(100, Math.round((isFinite(eta) ? eta : 0) * 100));
  const bar = eta == null ? "" :
    `<div class="bar"><div style="width:${w}%;background:${eta <= 1 + 1e-9 ? "#1e7d44" : "#c9461c"}"></div></div>`
    + `<div class="eta">η = ${_pct(eta)}${eta <= 1 + 1e-9 ? "" : " · Nachweis NICHT erfüllt"}</div>`;
  return `<div class="nw"><div class="nwtop"><b>${titel}</b><span class="badge ${ok ? "ok" : "no"}">${ok ? "OK" : "NICHT OK"}</span></div>`
    + `<table class="kv">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table>`
    + bar + (hinweis ? `<div class="hint">${hinweis}</div>` : "") + "</div>";
}

/**
 * Statischer Nachweis als selbsttragendes, druckbares HTML-Dokument (PDF-fähig).
 * Voller Schermer-Nachweis aus sembla-statik.js — KEIN Rückgriff auf das vereinfachte
 * Engine-Modell. Prüfpflichtige Planungshilfe, ersetzt keine geprüfte Einzelstatik.
 * @param {object} w Wandelement (Single Source of Truth: Geometrie/Öffnungen/Wandtyp)
 * @param {object} eingaben Eingaben-Modell (genutzt: `statik`, `projekt`)
 * @param {{datum?:string}} [opts]
 */
export function nachweisHtml(w, eingaben, opts = {}) {
  const eing = eingaben || {};
  const s = eing.statik || {}, projekt = eing.projekt || {};
  const p = nachweisParams(w, s);
  const r = nachweise(p);
  const wd = r.wand, sp = r.spann, tr = r.transport, oe = r.oeffnungen, V = wd.vor;
  const datum = opts.datum || _heute();
  const titel = "SEMBLA Statischer Nachweis — " + (w.name || "Wandelement");
  const wandtyp = p.mitWind ? "Innenwand mit Wind (C<sub>pi</sub>)" : "Innenwand ohne Wind";

  let b = `<h1>${_esc(titel)}</h1>`;
  b += `<div class="warn"><b>Prüfpflichtige Planungshilfe.</b> Dieses Dokument ist eine
    <b>Planungshilfe</b> und <b>prüfpflichtig</b>: Es ersetzt <b>keine geprüfte Einzelstatik</b> und
    keinen Prüfbericht. Alle Werte sind vor der Ausführung durch eine / einen Tragwerksplaner*in
    zu prüfen und freizugeben. Verankerung, Anschlagmittel und Deckenwinkel sind gesondert nachzuweisen.</div>`;
  b += `<p class="src">Grundlage: Gutachten Prof. Schermer (Az. 2025_7001 Rev 01) · Z-3.15-2157 ·
    DIN EN 1996-1-1 · DIN 4103-1 · DIN EN 1991-1-4. Erzeugt vom zentralen Export der SEMBLA
    Planungs-Suite am ${_esc(datum)} aus dem vollen Nachweismodell (Modul 3).</p>`;

  b += `<div class="summe ${r.ok ? "ok" : "no"}"><b>${r.ok ? "Nachweis erfüllt" : "Nachweis NICHT erfüllt"}</b>
    · η<sub>max,gesamt</sub> = ${_pct(r.eta_max_gesamt)} · Wand ${_pct(wd.eta_max)} · Spannsystem ${_pct(sp.eta_max)}</div>`;

  // --- Projekt / Geometrie (aus dem Wandelement) ---
  b += "<h2>Projekt</h2><table class=\"kv\">"
    + `<tr><td>Projekt</td><td>${_esc(projekt.name || w.name || "SEMBLA-Projekt")}</td></tr>`
    + `<tr><td>Bauherrenschaft</td><td>${_esc(projekt.bauherr || "—")}</td></tr>`
    + `<tr><td>Planverfasser</td><td>${_esc(projekt.planverfasser || "—")}</td></tr>`
    + `<tr><td>Phase · Plan-Nr. · Index</td><td>${_esc(projekt.phase || "—")} · ${_esc(projekt.plan_nr || "—")} · ${_esc(projekt.index || "—")}</td></tr>`
    + "</table>";

  b += "<h2>Geometrie (aus dem Wandelement)</h2><table class=\"kv\">"
    + `<tr><td>Wandelement</td><td>${_esc(w.name || "Wandelement")}</td></tr>`
    + `<tr><td>Wandhöhe h</td><td>${_fmt(p.h_m)} m</td></tr>`
    + `<tr><td>Wandlänge l</td><td>${_fmt(p.L_m, 3)} m</td></tr>`
    + `<tr><td>Wanddicke t</td><td>${_fmt(p.t_m, 3)} m</td></tr>`
    + `<tr><td>Anzahl Öffnungen</td><td>${p.n_oeff}</td></tr>`
    + `<tr><td>Wandtyp (Windsituation)</td><td>${wandtyp}</td></tr>`
    + "</table>"
    + `<div class="hint">Geometrie, Öffnungszahl und Wandtyp stammen unveränderlich aus dem
       Wandelement (Single Source of Truth) und werden hier nur gelesen.</div>`;

  // --- Verwendete Kennwerte (aus eingaben.statik) ---
  b += "<h2>Verwendete Kennwerte (Eingaben Modul 3)</h2>";
  for (const [gruppe, keys] of KENNWERT_GRUPPEN) {
    b += `<h3>${gruppe}</h3><table class="kv">`
      + keys.map(([k, label, unit]) => `<tr><td>${label}</td><td>${_kennwert(k, s[k])}${unit && unit !== "–" ? " " + unit : ""}</td></tr>`).join("")
      + "</table>";
  }

  // --- Zwischenwerte ---
  b += "<h2>Lasten &amp; Vorspannung</h2><table class=\"kv\">"
    + `<tr><td>q<sub>b</sub> · q<sub>p</sub></td><td>${_fmt(wd.lasten.qb)} · ${_fmt(wd.lasten.qp)} kN/m²</td></tr>`
    + `<tr><td>C<sub>pi</sub> · w<sub>i</sub></td><td>${_fmt(wd.lasten.Cpi)} · ${_fmt(wd.lasten.w_i)} kN/m²</td></tr>`
    + `<tr><td>w<sub>Ed</sub> (Wind, ${p.mitWind ? "leitend" : "nicht angesetzt"})</td><td>${_fmt(wd.lasten.w_Ed)} kN/m²</td></tr>`
    + `<tr><td>F<sub>∞</sub> = F₀·(1−ΔF)</td><td>${_fmt(V.F_infty)} kN/Stab ${V.F_inf_ok ? "≥ F<sub>inf,min</sub> ✓" : "&lt; F<sub>inf,min</sub> ⚠"}</td></tr>`
    + `<tr><td>N<sub>v,fav</sub> · N<sub>v,sup</sub></td><td>${_fmt(V.Nv_fav, 1)} · ${_fmt(V.Nv_sup, 1)} kN/m</td></tr>`
    + `<tr><td>m<sub>Ed</sub> · v<sub>Ed</sub> (maßgebend)</td><td>${_fmt(wd.schnitt.mEd)} kNm/m · ${_fmt(wd.schnitt.vEd)} kN/m</td></tr>`
    + "</table>";

  // --- Ergebnisse Wand ---
  b += "<h2>Kompaktnachweis Wand</h2>";
  const bWarn = wd.biegung.interpol === "above"
    ? `N<sub>v,fav</sub> = ${_fmt(wd.biegung.Nv, 1)} kN/m über Prüfbereich (≤ ${_fmt(wd.biegung.NvMax, 0)}); m<sub>Rk</sub> auf obersten Prüfwert gekappt.`
    : wd.biegung.interpol === "below"
      ? `N<sub>v,fav</sub> = ${_fmt(wd.biegung.Nv, 1)} kN/m unter Prüfbereich (≥ ${_fmt(wd.biegung.NvMin, 0)}); Extrapolation — Wert prüfen.`
      : "";
  b += _nwBlock("1 · Biegung Wandmitte", wd.biegung.ok, [
    ["m<sub>Ed</sub>", _fmt(wd.biegung.m_Ed) + " kNm/m"],
    ["m<sub>Rk</sub> (interpol. §6.2 bei N<sub>v,fav</sub> = " + _fmt(wd.biegung.Nv, 1) + ")", _fmt(wd.biegung.m_Rk) + " kNm/m"],
    ["m<sub>Rd</sub> = m<sub>Rk</sub>/γ<sub>M</sub>", _fmt(wd.biegung.m_Rd) + " kNm/m"],
  ], wd.biegung.eta, bWarn);
  b += _nwBlock("2 · Schub (Platte)", wd.schub.ok, [
    ["v<sub>Ed</sub>", _fmt(wd.schub.v_Ed) + " kN/m"],
    ["v<sub>Rd</sub> (Gutachten §6.3)", _fmt(wd.schub.v_Rd) + " kN/m"],
  ], wd.schub.eta);
  b += _nwBlock("3 · Druckrand-Spannung", wd.druck.ok, [
    ["σ<sub>Ed</sub>", _fmt(wd.druck.sig_Ed) + " N/mm²"],
    ["σ<sub>Rd</sub> = f<sub>k</sub>/γ<sub>M</sub>", _fmt(wd.druck.sig_Rd) + " N/mm²"],
  ], wd.druck.eta);
  b += _nwBlock("4 · Bodenanschluss — Reibung", wd.boden.ok, [
    ["μ<sub>d</sub> = μ<sub>k</sub>/γ<sub>M,μ</sub>", _fmt(wd.boden.mu_d, 3)],
    ["N<sub>Ed</sub> = N<sub>v,sup</sub> + γ<sub>w</sub>·t·h", _fmt(wd.boden.N_Ed) + " kN/m"],
    ["V<sub>Rd</sub> = μ<sub>d</sub>·N<sub>Ed</sub>", _fmt(wd.boden.V_Rd) + " kN/m"],
    ["V<sub>Ed</sub>", _fmt(wd.boden.V_Ed) + " kN/m"],
  ], wd.boden.eta);
  b += `<div class="nw"><div class="nwtop"><b>5 · Deckenanschluss — Winkel</b><span class="badge ok">Übergabe Stahlbau</span></div>`
    + `<table class="kv"><tr><td>Winkelabstand e<sub>W</sub></td><td>${_fmt(wd.winkel.eW)} m</td></tr>`
    + `<tr><td>V<sub>Winkel</sub> = v<sub>Ed</sub>·e<sub>W</sub></td><td>${_fmt(wd.winkel.V_Winkel)} kN/Winkel</td></tr>`
    + `<tr><td>Anzahl Winkel je Wand</td><td>${wd.winkel.n_Winkel} Stk</td></tr></table>`
    + `<div class="hint">Anschlusskraft wird an den Stahlbau übergeben; Nachweis Winkel + Verankerung separat.</div></div>`;

  // --- Ergebnisse Spannsystem ---
  b += "<h2>Kompaktnachweis Spannsystem</h2>";
  b += `<p class="src">L<sub>span</sub> = ${_fmt(sp.L_span, 0)} mm · F<sub>t,Ed</sub> = F₀·γ<sub>P,sup</sub> = ${_fmt(sp.stange.Ft_Ed)} kN/Stab</p>`;
  b += _nwBlock("1 · Gewindestange (Zug, EC3-Schraube)", sp.stange.eta <= 1, [
    ["F<sub>t,Ed</sub>", _fmt(sp.stange.Ft_Ed) + " kN"],
    ["F<sub>t,Rd</sub> = k₂,SK·f<sub>ub</sub>·A<sub>s</sub>/γ<sub>M2</sub>", _fmt(sp.stange.Ft_Rd) + " kN"],
  ], sp.stange.eta);
  b += _nwBlock("1b · Gewindestange (Fließen, maßgebend)", sp.stangeYield.eta <= 1, [
    ["F<sub>t,Ed</sub>", _fmt(sp.stangeYield.Ft_Ed) + " kN"],
    ["F<sub>t,Rd</sub> = A<sub>s</sub>·f<sub>yk</sub>/γ<sub>s</sub>", _fmt(sp.stangeYield.Ft_Rd) + " kN"],
  ], sp.stangeYield.eta);
  b += _nwBlock("2 · Spannschraube oben (Sechskant)", sp.spannSK.eta <= 1, [
    ["F<sub>t,Ed</sub>", _fmt(sp.spannSK.Ft_Ed) + " kN"],
    ["F<sub>t,Rd</sub> (k₂ = " + _fmt(p.k2_SK, 2) + ")", _fmt(sp.spannSK.Ft_Rd) + " kN"],
  ], sp.spannSK.eta);
  b += _nwBlock("3 · Schraube unten (Sechskant, maßgebend)", sp.untenSK.eta <= 1, [
    ["Sechskant η (k₂ = " + _fmt(p.k2_SK, 2) + ")", _pct(sp.untenSK.eta)],
    ["Senkschraube η (k₂ = " + _fmt(p.k2_Senk, 2) + ")", _pct(sp.untenSenk.eta)],
  ], sp.untenSK.eta, "Senkschraube nur zulässig, wenn deren η ≤ 100 %.");
  b += _nwBlock("4 · Kopfplatte oben (Biegung)", sp.kopfplatte.eta <= 1, [
    ["σ<sub>Ed</sub>", _fmt(sp.kopfplatte.sig_Ed) + " N/mm²"],
    ["σ<sub>Rd</sub> = f<sub>yk</sub>/γ<sub>M0</sub>", _fmt(sp.kopfplatte.sig_Rd) + " N/mm²"],
  ], sp.kopfplatte.eta);
  b += _nwBlock("5 · Fußplatte unten (Biegung)", sp.fussplatte.eta <= 1, [
    ["σ<sub>Ed</sub>", _fmt(sp.fussplatte.sig_Ed) + " N/mm²"],
    ["σ<sub>Rd</sub> = f<sub>yk</sub>/γ<sub>M0</sub>", _fmt(sp.fussplatte.sig_Rd) + " N/mm²"],
  ], sp.fussplatte.eta);
  b += _nwBlock("6 · Teilflächenpressung Stein unter Platte", sp.steinPressung.eta <= 1, [
    ["F = F₀·γ<sub>P,sup</sub>", _fmt(sp.steinPressung.F) + " kN"],
    ["A = 2·b<sub>Steg</sub>·l<sub>P</sub>", _fmt(sp.steinPressung.A, 0) + " mm²"],
    ["σ<sub>Ed</sub> = F/A", _fmt(sp.steinPressung.sig_Ed) + " N/mm²"],
    ["σ<sub>Rd</sub> = f<sub>k</sub>/γ<sub>M</sub> (β = 1,0)", _fmt(sp.steinPressung.sig_Rd) + " N/mm²"],
  ], sp.steinPressung.eta);
  b += `<div class="nw"><div class="nwtop"><b>7 · Kopplungsmutter</b><span class="badge ${sp.mutter.ok ? "ok" : "no"}">${sp.mutter.ok ? "erfüllt" : "NICHT erfüllt"}</span></div>`
    + `<table class="kv"><tr><td>L<sub>vorh</sub> ≥ L<sub>min</sub></td><td>${_fmt(sp.mutter.L_vorh, 0)} ≥ ${_fmt(sp.mutter.L_min, 0)} mm</td></tr></table></div>`;

  // --- Stäbe / Transport ---
  b += "<h2>Vorspannstäbe (Regelbereich)</h2><table class=\"kv\">"
    + `<tr><td>Regelstäbe n = l/e</td><td>${oe.n_regel} Stk</td></tr>`
    + `<tr><td>Zusatzstäbe an Öffnungen</td><td>${oe.n_zusatz} Stk</td></tr>`
    + `<tr><td>Gesamt</td><td>${oe.n_gesamt} Stk · ${oe.ankerplatten} Ankerplatten · ${oe.muttern} Muttern</td></tr>`
    + "</table>";
  b += "<h2>Transport / Hebezustand <span class=\"zusatz\">(Planungshilfe, nicht Gutachten)</span></h2>";
  b += _nwBlock("Hebezustand", tr.ok, [
    ["n<sub>Ed</sub> = ρ·t·h", _fmt(tr.nEd) + " kN/m"],
    ["G<sub>Ek</sub> = n<sub>Ed</sub>·L/n", _fmt(tr.GEk) + " kN"],
    ["G<sub>Ed</sub> = γ<sub>G</sub>·dyn·G<sub>Ek</sub>", _fmt(tr.GEd) + " kN"],
    ["erf. Anschlagmittel", "≥ " + _fmt(tr.GEd_kg, 0) + " kg"],
    ["σ<sub>Ed</sub> Blech = M<sub>Ed</sub>/W", _fmt(tr.sigma, 0) + " N/mm²"],
  ], tr.util);

  b += `<div class="warn"><b>Hinweis.</b> Rechenkern portiert aus der geprüften Arbeitsmappe
    „SEMBLA_Wand_Statik_v01". Materialkennwerte sind vom Statiker zu bestätigen. Dieses Protokoll ist
    eine <b>prüfpflichtige Planungshilfe</b> und kein Standsicherheitsnachweis im Sinne der Bauordnung.</div>`;

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${_esc(titel)}</title><style>
    body{font-family:system-ui,Arial,sans-serif;color:#1c2430;max-width:900px;margin:0 auto;padding:16px;font-size:13px;line-height:1.45}
    h1{font-size:18px;margin:0 0 10px} h2{font-size:14px;margin:20px 0 8px;color:#333;border-bottom:1px solid #e5e7eb;padding-bottom:3px}
    h3{font-size:12px;margin:12px 0 4px;color:#6b7682;text-transform:uppercase;letter-spacing:.5px}
    table.kv{width:100%;border-collapse:collapse;font-size:12.5px;margin:0 0 6px}
    table.kv td{padding:3px 2px;border-bottom:1px solid #eef0f3;vertical-align:top}
    table.kv td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
    .warn{border:1px solid #c9461c;background:#fdf1ec;color:#7d2a10;border-radius:8px;padding:10px 12px;margin:10px 0;font-size:12.5px}
    .src{font-size:11.5px;color:#6b7682;margin:6px 0}
    .summe{border-radius:8px;padding:9px 12px;margin:12px 0;font-size:13.5px}
    .summe.ok{background:#e3f5ea;color:#1e7d44} .summe.no{background:#fbe6dd;color:#c9461c}
    .nw{border:1px solid #e5e7eb;border-radius:8px;padding:9px 11px;margin:8px 0;page-break-inside:avoid}
    .nwtop{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
    .badge{border-radius:20px;padding:2px 9px;font-size:11px;font-weight:700}
    .badge.ok{background:#e3f5ea;color:#1e7d44} .badge.no{background:#fbe6dd;color:#c9461c}
    .bar{height:7px;border-radius:5px;background:#eceef1;overflow:hidden;margin-top:6px}.bar>div{height:100%}
    .eta{font-size:11.5px;color:#6b7682;margin-top:3px}
    .hint{font-size:11px;color:#6b7682;margin-top:5px;line-height:1.5}
    .zusatz{text-transform:none;font-weight:400;color:#6b7682;font-size:12px}
    @media print{ body{padding:0} }
  </style></head><body>${b}</body></html>`;
}

// ---------- Datei-Bündel für den ZIP-Export ----------

/** Aktuelles Datum (de-DE) — hier ausgelagert, damit Tests es ueberschreiben koennen. */
function _heute() { try { return new Date().toLocaleDateString("de-DE"); } catch { return ""; } }

/**
 * Alle waehlbaren Ausgabe-Dateien fuer ein Projekt bauen.
 * @param {{name:string,wandelement:object,eingaben:object}} projekt (aus store.projektObjekt)
 * @param {string[]} auswahl Schluessel: 'projekt','stueckliste','montage','nachweis','ifc','zuschnitt'
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
  if (set.has("nachweis")) files.push({ name: "Statischer_Nachweis_" + base + ".html", data: nachweisHtml(w, eingaben) });
  if (set.has("ifc")) files.push({ name: base + ".ifc", data: ifcText(w) });
  return files;
}
