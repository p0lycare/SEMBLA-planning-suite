// Freeze-Test der herausgegebenen Katalogfassungen (#129) — DOM-frei, liest nur das Repo.
//
// Die Regel aus #118 („eine geaenderte Fassung ERSETZT keine bestehende, sondern tritt
// als eigene Datei daneben") war bis 2026-09-09 reine Disziplin — und wurde davor an der
// unversionierten Datei mehrfach verletzt: in-place-Aenderungen erzeugen still
// divergierende Browser-Snapshots bei den Nutzern. Dieser Test macht die Regel
// MASCHINELL: jede herausgegebene Fassung ist hier per SHA-256 eingefroren.
//
//   Eine NEUE Fassung ist: neue Datei + Manifest-Eintrag + eine Hash-Zeile HIER.
//   Eine bestehende Fassung zu aendern laesst diesen Test fehlschlagen — absichtlich.
//   Der Hash einer bestehenden Fassung wird NIE angepasst; wer das tut, hebelt die
//   Regel aus und verteilt still einen anderen Inhalt unter derselben Kennung.
//
// Dazu die Konsistenz des Verzeichnisses (jede Fassung vorhanden und parsebar, keine
// versionierte Datei ausserhalb des Manifests, `aktuell` == Autoload-Konstante) und die
// reine Einordnungsfunktion `fassungsStand` (#129), die Modul 0 und 10 teilen.
//
// Aufruf:  node tests/module/test-vorlagen-fassungen.mjs

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import * as KAT from "../../docs/shared/sembla-katalog.js";

const checks = [];
const ok = (n, c) => checks.push([n, !!c]);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const lies = (pfad) => readFileSync(new URL("../../docs/vorlagen/" + pfad.replace(/^\.\/vorlagen\//, ""), import.meta.url));

// --- 1) Eingefrorene Fassungen ---------------------------------------------
// Schluessel = Manifestpfad. NUR ERGAENZEN, NIE AENDERN (s. Kopfkommentar).
const FREEZE = {
  "./vorlagen/SEMBLA_Standardkatalog-v1.json":
    "d656fdc12086a0b3126f1cf9d27c48f2240686b5e44c6875b5837c6688081463",
  "./vorlagen/SEMBLA_Standardkatalog-v2.json":
    "87a01210381041889013d479b213bf98d71a0fe9f627ce07fe1ce36bc52f2f33",
  "./vorlagen/SEMBLA_Standardkatalog-v3.json":
    "9e78ff6e9565f46bb15c0ac74e5b76d09dd55dd7d095273730f4d2aca4f1a95f",
};

// Der tote Altpfad aus der Zeit vor der Versionierung: wird von keinem Codepfad mehr
// geladen, bleibt aber im Repo (Nachvollziehbarkeit) und damit ebenfalls eingefroren —
// eine „kleine Korrektur" dort erzeugte wieder still divergierende Altbestaende.
const ALTPFAD = "SEMBLA_Standardkatalog.json";
const ALT_SHA = "b7818f13d8dd3ea2083ba08a5a92fd0aff49edc78547f566d52bf6435984c21e";

// --- 2) Manifest lesen und strukturell pruefen ------------------------------
const man = KAT.parseVorlagenManifest(String(lies("kataloge.json")));
ok("Manifest ist lesbar und traegt Fassungen", man.fassungen.length >= 2);
ok("„aktuell“ steht in der Fassungsliste", man.fassungen.some((f) => f.pfad === man.aktuell));
ok("kein Fassungspfad doppelt",
  new Set(man.fassungen.map((f) => f.pfad)).size === man.fassungen.length);

// Autoload (Projektanlage, [P-18]) und Manifest duerfen nicht auseinanderlaufen: die
// Konstante ist der eine Vorgabewert — zeigt sie auf eine andere Fassung als das
// Verzeichnis, legt Modul 0 still eine nicht mehr aktuelle Fassung an (#129).
ok("VORLAGE_KATALOG_PFAD == manifest.aktuell (Autoload folgt der Herausgabe)",
  KAT.VORLAGE_KATALOG_PFAD === man.aktuell);

// --- 3) Jede Fassung: vorhanden, parsebar, EINGEFROREN ----------------------
for (const f of man.fassungen) {
  let roh = null;
  try { roh = lies(f.pfad); } catch { /* unten benannt */ }
  ok(`Fassung ${f.version}: Datei vorhanden (${f.pfad})`, roh !== null);
  if (roh === null) continue;
  let parsebar = false;
  try { KAT.parseKatalog(String(roh)); parsebar = true; } catch { /* unten benannt */ }
  ok(`Fassung ${f.version}: parseKatalog nimmt sie an`, parsebar);
  ok(`Fassung ${f.version}: Freeze-Hash vorhanden (neue Fassung? -> Hash-Zeile ergaenzen)`,
    Object.prototype.hasOwnProperty.call(FREEZE, f.pfad));
  if (FREEZE[f.pfad]) {
    ok(`Fassung ${f.version}: BYTE-GLEICH zur Herausgabe (nie in-place aendern!)`,
      sha(roh) === FREEZE[f.pfad]);
  }
  // Die Identitaet haengt am Pfad — sie muss der kanonischen Ableitung entsprechen.
  ok(`Fassung ${f.version}: Manifest-Kennung == vorlageKatalogId(pfad)`,
    f.id === KAT.vorlageKatalogId(f.pfad));
}

// --- 4) Keine versionierte Datei ausserhalb des Manifests -------------------
// Eine Fassungsdatei ohne Manifest-Eintrag waere in beiden Modulen unsichtbar — sie
// existierte, ohne herausgegeben zu sein. Der Musterwand-Eintrag ist kein Katalog.
const dateien = readdirSync(new URL("../../docs/vorlagen/", import.meta.url))
  .filter((d) => /^SEMBLA_Standardkatalog-.*\.json$/.test(d));
for (const d of dateien) {
  ok(`versionierte Datei steht im Manifest: ${d}`,
    man.fassungen.some((f) => f.pfad === "./vorlagen/" + d));
}

// --- 5) Der tote Altpfad bleibt eingefroren ---------------------------------
ok("Altpfad (unversioniert) unveraendert eingefroren", sha(lies(ALTPFAD)) === ALT_SHA);
ok("Altpfad steht NICHT im Manifest (nicht mehr herausgegeben)",
  !man.fassungen.some((f) => f.pfad.endsWith("/" + ALTPFAD)));

// --- 6) fassungsStand: die eine Einordnung fuer Modul 0 und 10 (#129) --------
// Synthetische Ressourcen wie sie `ladeVorlagenKatalog` ablegt: Vorlagenmarker + Kennung
// aus dem Pfad. Nur Fantasiedaten.
const res = (pfad) => ({ format: KAT.KATALOG_FORMAT, version: KAT.KATALOG_VERSION,
  name: "x", produkte: [], sets: [], id: KAT.vorlageKatalogId(pfad), vorlage: pfad });
const eigener = { format: KAT.KATALOG_FORMAT, version: KAT.KATALOG_VERSION,
  name: "Eigener", produkte: [], sets: [], id: "kat-123" };
const manSynth = KAT.parseVorlagenManifest(JSON.stringify({
  format: "SEMBLA-Katalogvorlagen", version: 1, aktuell: "./vorlagen/T-v2.json",
  fassungen: [
    { pfad: "./vorlagen/T-v2.json", version: "v2", datum: "2026-01-02" },
    { pfad: "./vorlagen/T-v1.json", version: "v1", datum: "2026-01-01" },
  ],
}));
ok("fassungsStand: aktuelle Fassung",
  KAT.fassungsStand(res("./vorlagen/T-v2.json"), manSynth).stand === "aktuell");
{
  const fs = KAT.fassungsStand(res("./vorlagen/T-v1.json"), manSynth);
  ok("fassungsStand: aeltere Fassung, mit Fassung + aktueller Fassung benannt",
    fs.stand === "aelter" && fs.fassung.version === "v1" && fs.aktuelle.version === "v2");
}
{
  const fs = KAT.fassungsStand(res("./vorlagen/T-alt.json"), manSynth);
  ok("fassungsStand: nicht mehr herausgegeben -> veraltet, aktuelle Fassung benannt",
    fs.stand === "veraltet" && fs.fassung === null && fs.aktuelle.version === "v2");
}
ok("fassungsStand: eigener Katalog bleibt „eigener“",
  KAT.fassungsStand(eigener, manSynth).stand === "eigener");
ok("fassungsStand: ohne Manifest wird nichts geraten (unbekannt)",
  KAT.fassungsStand(res("./vorlagen/T-v2.json"), null).stand === "unbekannt");
ok("fassungsStand: Vorlage schlaegt Manifestfrage (eigener auch ohne Manifest)",
  KAT.fassungsStand(eigener, null).stand === "eigener");

// Und gegen das ECHTE Manifest: die aus der aktuellen Fassung geladene Ressource ist
// „aktuell", der tote Altpfad „veraltet" — genau die zwei Faelle aus dem Feld.
ok("fassungsStand (echtes Manifest): aktuelle Fassung -> aktuell",
  KAT.fassungsStand(res(man.aktuell), man).stand === "aktuell");
ok("fassungsStand (echtes Manifest): Altpfad -> veraltet",
  KAT.fassungsStand(res("./vorlagen/" + ALTPFAD), man).stand === "veraltet");

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
