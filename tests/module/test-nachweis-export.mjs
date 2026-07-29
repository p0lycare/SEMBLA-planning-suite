// Fokussierter Test: statisches Nachweis-Dokument des zentralen Exports (Issue #3).
//
// Prueft den Produktions-Generator (nachweisHtml) und die Verdrahtung in baueDateien
// direkt — nicht ueber einen Hilfs-Stub. Schwerpunkte:
//   * Quelle ist AUSSCHLIESSLICH der volle Schermer-Nachweis (sembla-statik.js),
//   * Geometrie/Oeffnungszahl/Wandtyp kommen aus dem Wandelement (Single Source of Truth),
//   * Kennwerte kommen aus eingaben.statik,
//   * Ergebnisse/Auslastungen stimmen mit nachweise() ueberein,
//   * Kennzeichnung als pruefpflichtige Planungshilfe,
//   * keine Abhaengigkeit zum vereinfachten Engine-Modell (sembla-engine.js).

import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { standardEingaben } from "../../docs/shared/storage.js";
import { nachweise, nachweisParams } from "../../docs/shared/sembla-statik.js";
import { nachweisHtml, baueDateien } from "../../docs/shared/sembla-export.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const fmt = (n, d = 2) => (isFinite(n) ? n : 0).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = u => fmt((isFinite(u) ? u : 0) * 100, 1) + " %";

// --- Referenzfall: Wandelement (SSOT) + Eingaben aus dem Datenmodell -------
const w = buildWall("IW-01", 6000, 3000, [new Opening(8, 14, 0, 10, "tuer")]);
w.thickness_mm = 123;
w.wandtyp = "mit_wind";
const eingaben = standardEingaben();
eingaben.projekt.name = "Rettungswache";

const p = nachweisParams(w, eingaben.statik);
const r = nachweise(p);
const doc = nachweisHtml(w, eingaben, { datum: "01.01.2026" });

// --- 1) Selbsttragendes, druckbares HTML ----------------------------------
ok("selbsttragendes HTML (DOCTYPE, inline <style>, kein externer Nachladepfad)",
  /^<!DOCTYPE html>/.test(doc) && /<\/html>$/.test(doc) && /<style>/.test(doc)
  && !/<script/i.test(doc) && !/https?:\/\//.test(doc));
ok("druckfreundlich (page-break-inside/@media print)",
  /page-break-inside:avoid/.test(doc) && /@media print/.test(doc));
ok("Titel nennt den statischen Nachweis und das Wandelement",
  /SEMBLA Statischer Nachweis — IW-01/.test(doc));

// --- 2) Geometrie/Wandtyp aus dem Wandelement (SSOT) ----------------------
ok("Geometrie aus dem Wandelement im Dokument (h/l/t)",
  doc.includes(fmt(3.0) + " m") && doc.includes(fmt(6.0, 3) + " m") && doc.includes(fmt(0.123, 3) + " m"));
ok("Oeffnungszahl aus dem Wandelement", /Anzahl Öffnungen<\/td><td>1<\/td>/.test(doc));
ok("Wandtyp aus dem Wandelement (mit Wind)", /Innenwand mit Wind/.test(doc));

// Untergeschobene Geometrie/Wandtyp in eingaben.statik darf NICHT durchschlagen.
const manipuliert = standardEingaben();
Object.assign(manipuliert.statik, { h_m: 99, L_m: 99, t_m: 9.9, n_oeff: 99, mitWind: false, wandtyp: "ohne_wind" });
manipuliert.projekt.name = "Rettungswache";
const docManip = nachweisHtml(w, manipuliert, { datum: "01.01.2026" });
ok("Geometrie/Wandtyp aus eingaben.statik werden ignoriert (SSOT bleibt Wandelement)", docManip === doc);

// Wandtyp steuert die Windsituation — und zwar ueber das Wandelement.
const wOhne = { ...w, name: "IW-02", wandtyp: "ohne_wind" };
const docOhne = nachweisHtml(wOhne, eingaben, { datum: "01.01.2026" });
const rOhne = nachweise(nachweisParams(wOhne, eingaben.statik));
ok("wandtyp 'ohne_wind' -> w_Ed = 0 und im Dokument gekennzeichnet",
  rOhne.wand.lasten.w_Ed === 0 && /Innenwand ohne Wind/.test(docOhne) && /nicht angesetzt/.test(docOhne));
ok("Alt-Wandelement ohne wandtyp faellt auf 'mit Wind' zurueck",
  nachweisParams({ ...w, wandtyp: undefined }, eingaben.statik).mitWind === true);

// --- 3) Verwendete Kennwerte aus eingaben.statik --------------------------
ok("Kennwerte-Abschnitt vorhanden", /Verwendete Kennwerte \(Eingaben Modul 3\)/.test(doc));
ok("Material-/Stangen-/Lastkennwerte dokumentiert",
  /Wanddruckfestigkeit/.test(doc) && /M10 · 8\.8/.test(doc) && /WLZ 2/.test(doc)
  && /dominante Öffnung/.test(doc) && /Prüfwerte Biegung §6\.2/.test(doc));
// Geaenderter Kennwert schlaegt im Dokument durch (Kennwerte sind echte Quelle).
const eingAbw = standardEingaben(); eingAbw.statik.f_k = 12.5; eingAbw.statik.stab = "M16"; eingAbw.statik.As = 157;
const docAbw = nachweisHtml(w, eingAbw, { datum: "01.01.2026" });
ok("geaenderte Kennwerte wirken auf Dokument und Ergebnisse",
  /M16 · 8\.8/.test(docAbw) && docAbw !== doc
  && docAbw.includes(pct(nachweise(nachweisParams(w, eingAbw.statik)).wand.druck.eta)));

// --- 4) Ergebnisse / Auslastungen == nachweise() --------------------------
ok("Gesamtauslastung η_max,gesamt im Dokument", doc.includes(pct(r.eta_max_gesamt)));
ok("Wand-Auslastungen (Biegung/Schub/Druck/Boden)",
  doc.includes(pct(r.wand.biegung.eta)) && doc.includes(pct(r.wand.schub.eta))
  && doc.includes(pct(r.wand.druck.eta)) && doc.includes(pct(r.wand.boden.eta)));
ok("Spannsystem-Auslastungen (Stange/Fließen/Platten/Steinpressung)",
  doc.includes(pct(r.spann.stange.eta)) && doc.includes(pct(r.spann.stangeYield.eta))
  && doc.includes(pct(r.spann.kopfplatte.eta)) && doc.includes(pct(r.spann.steinPressung.eta)));
ok("Transport/Hebezustand als Zusatz ausgewiesen",
  doc.includes(pct(r.transport.util)) && /nicht Gutachten/.test(doc));
ok("Zwischenwerte (m_Ed, v_Ed, N_v) dokumentiert",
  doc.includes(fmt(r.wand.schnitt.mEd)) && doc.includes(fmt(r.wand.schnitt.vEd))
  && doc.includes(fmt(r.wand.vor.Nv_fav, 1)));
ok("Gesamtergebnis als Status ausgewiesen",
  new RegExp(r.ok ? "Nachweis erfüllt" : "Nachweis NICHT erfüllt").test(doc));
// Nicht erfuellter Fall wird als solcher gezeigt (kein Schoenrechnen).
const eingKipp = standardEingaben(); eingKipp.statik.q1_II = 80;
const docKipp = nachweisHtml(w, eingKipp, { datum: "01.01.2026" });
ok("ueberlasteter Fall wird als NICHT erfüllt ausgewiesen",
  /Nachweis NICHT erfüllt/.test(docKipp) && /NICHT OK/.test(docKipp));

// --- 5) Kennzeichnung als pruefpflichtige Planungshilfe -------------------
ok("Kennzeichnung Planungshilfe + pruefpflichtig",
  /Prüfpflichtige Planungshilfe/.test(doc) && /prüfpflichtig/i.test(doc));
ok("kein Ersatz fuer geprüfte Einzelstatik / Freigabe durch Tragwerksplanung",
  /keine geprüfte Einzelstatik/i.test(doc) && /Tragwerksplaner/.test(doc)
  && /kein Standsicherheitsnachweis/.test(doc));
ok("Quellenangabe des Nachweismodells", /Schermer/.test(doc) && /DIN 4103-1/.test(doc));

// --- 6) baueDateien-Verdrahtung ------------------------------------------
const projekt = { format: "SEMBLA-Projekt", version: 2, name: "Rettungswache IW-01", wandelement: w, eingaben };
const nurNachweis = baueDateien(projekt, ["nachweis"]);
ok("baueDateien(['nachweis']) liefert genau eine HTML-Datei",
  nurNachweis.length === 1 && nurNachweis[0].name === "Statischer_Nachweis_Rettungswache_IW-01.html");
ok("Dateiinhalt ist der Generator-Output (kein Stub)",
  nurNachweis[0].data === nachweisHtml(w, eingaben));   // beide mit heutigem Datum
const ohneNachweis = baueDateien(projekt, ["projekt", "stueckliste", "montage", "ifc"]);
ok("ohne Auswahl kein Nachweis-Dokument", !ohneNachweis.some(f => /Statischer_Nachweis/.test(f.name)));
const alle = baueDateien(projekt, ["projekt", "stueckliste", "zuschnitt", "montage", "nachweis", "ifc"]);
ok("Vollauswahl enthaelt alle sechs Dateien inkl. Nachweis",
  alle.length === 6 && alle.some(f => /^Statischer_Nachweis_/.test(f.name)));

// --- 7) Keine Engine-Abhaengigkeit ---------------------------------------
const exportSrc = readFileSync(new URL("../../docs/shared/sembla-export.js", import.meta.url), "utf8");
// Kommentare entfernen — der Verweis "kein Rueckgriff auf sembla-engine.js" darf dort stehen,
// im ausgefuehrten Code aber nirgends auftauchen.
const exportCode = exportSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok("sembla-export.js nutzt sembla-engine.js nirgends (kein Import, keine Referenz)",
  !/sembla-engine/.test(exportCode) && !/from\s*["'][^"']*sembla-engine/.test(exportSrc));
ok("sembla-export.js bezieht den Nachweis aus sembla-statik.js",
  /import \{[^}]*nachweise[^}]*\} from "\.\/sembla-statik\.js"/.test(exportSrc));
const statikHtml = readFileSync(new URL("../../docs/statik.html", import.meta.url), "utf8");
ok("Modul 3 nutzt dasselbe zentrale Mapping (nachweisParams)",
  /nachweisParams\(activeWand, readStatik\(\)\)/.test(statikHtml));

let fail = 0; for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`); process.exit(fail ? 1 : 0);
