// SEMBLA – Publish: spiegelt alle aktuellen Tool-HTMLs in den nummerierten Ordner "SEMBLA Werkzeuge".
// EIN Befehl statt manuellem Kopieren -> kein Drift mehr.  Aufruf:  node publish-werkzeuge.mjs
import { copyFileSync, existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Gemeinsame Bausteine (sembla-shared.js) zuerst in die Tools verteilen (Single Source, kein Drift)
try { console.log(execSync("node sync-shared.mjs", { encoding:"utf8" })); }
catch(e){ console.log("Hinweis: sync-shared übersprungen ("+(e.message||e)+")"); }

// Lückenlose Nummerierung 1–9 (Modul 3 "Latten" ist in Modul 2 "Horizontaler Wandaufbau" aufgegangen)
const MAP = [
  ["Modul-1-Wandplanung/SEMBLA_Wandplanung.html",            "1_Wand-Planung_und_Auslegung.html"],
  ["Modul-Wandaufbau/SEMBLA_Wandaufbau.html",                "2_Horizontaler-Wandaufbau.html"],
  ["Modul-4-Montageplanung/SEMBLA_Montageplanung.html",      "3_Montageplanung.html"],
  ["Modul-Roboter/SEMBLA_Roboter_Export.html",               "4_Roboter-Export.html"],
  ["Projekt-Manager/SEMBLA_Projekt_Manager.html",            "5_Projekt-Manager.html"],
  ["Modul-3-Statik/SEMBLA_Statik.html",                      "6_Statik-Anschluesse.html"],
  ["Modul-3D/SEMBLA_3D_Vorschau.html",                       "7_3D-Vorschau.html"],
  ["Modul-Stueckliste/SEMBLA_Stueckliste_Kosten.html",       "8_Stueckliste-Kosten.html"],
  ["Modul-Fertigung/SEMBLA_Fertigungszeichnung.html",        "9_Fertigungszeichnung.html"],
];
const DEST = "SEMBLA Werkzeuge";
let copied = 0, missing = [];
for (const [src, dst] of MAP) {
  if (!existsSync(src)) { missing.push(src); continue; }
  copyFileSync(src, DEST + "/" + dst);
  console.log("  ✓ " + dst.padEnd(34) + "  (" + (statSync(src).size/1024).toFixed(0) + " KB)");
  copied++;
}

// Übersicht in den Werkzeuge-Ordner spiegeln – Quell-Pfade -> flache publizierte Dateinamen umschreiben
if (existsSync("SEMBLA_Uebersicht.html")) {
  let ov = readFileSync("SEMBLA_Uebersicht.html", "utf8");
  for (const [src, dst] of MAP) ov = ov.split(src).join(dst);
  writeFileSync(DEST + "/00_Übersicht.html", ov);
  console.log("  ✓ 00_Übersicht.html (Links auf flache Dateinamen umgeschrieben)");
}

// Handbuch (Word) mitspiegeln, damit es nicht auseinanderläuft
if (existsSync("SEMBLA_Handbuch.docx")) {
  copyFileSync("SEMBLA_Handbuch.docx", DEST + "/00_Handbuch.docx");
  console.log("  ✓ 00_Handbuch.docx");
}

console.log(`\n${copied}/${MAP.length} Tools nach "${DEST}" gespiegelt (+ Übersicht + Handbuch).`);
if (missing.length) console.log("FEHLEND (Quelle nicht gefunden):\n  " + missing.join("\n  "));
process.exit(missing.length ? 1 : 0);
