// Tests: Katalogversionen und Reparatur unaufloesbarer Produktreferenzen (#118, loest #115)
//
// Geprueft wird die REINE Logik der drei neuen Bausteine — ohne DOM:
//   1) `parseVorlagenManifest` (sembla-katalog.js) — das Verzeichnis der herausgegebenen
//      Standardkatalog-Fassungen,
//   2) die pfadabgeleitete Fassungsidentitaet (#102 traegt #118),
//   3) `referenzPruefung` (storage.js) — die EINE Pruefung fuer beide Ausloeser des
//      Reparaturdialogs,
//   4) `wandBefund` (sembla-reparatur.js) — der Befund je Wand, den der Dialog anzeigt.
//
// Der Dialog selbst ist Oberflaeche; geprueft wird hier, dass die Daten stimmen, auf denen
// er arbeitet, und dass er keinen eigenen Schreib- oder Aufloesungsweg braucht.

import { readFileSync } from "node:fs";

// --- localStorage-Ersatz wie in den uebrigen Modultests --------------------
const _m = new Map();
globalThis.localStorage = {
  getItem: (k) => (_m.has(String(k)) ? _m.get(String(k)) : null),
  setItem: (k, v) => { _m.set(String(k), String(v)); },
  removeItem: (k) => { _m.delete(String(k)); },
  clear: () => { _m.clear(); },
  key: (i) => [..._m.keys()][i] ?? null,
  get length() { return _m.size; },
};

const KAT = await import("../../docs/shared/sembla-katalog.js");
const store = await import("../../docs/shared/storage.js");
const MAPPE = await import("../../docs/shared/sembla-projektmappe.js");
const REP = await import("../../docs/shared/sembla-reparatur.js");

let n = 0, schlecht = 0;
function ok(name, bedingung) {
  n++;
  if (bedingung) { console.log("  ok  " + name); return; }
  schlecht++; console.log("  FEHL " + name);
}

// =====================================================================
//  1) Vorlagenverzeichnis (#118)
// =====================================================================
{
  const txt = readFileSync(new URL("../../docs/vorlagen/kataloge.json", import.meta.url), "utf8");
  const man = KAT.parseVorlagenManifest(txt);

  ok("#118 das mitgelieferte Verzeichnis ist gegen den echten Parser gueltig",
    man.fassungen.length >= 1 && !!man.aktuell);
  ok("#118 die als aktuell benannte Fassung steht in der Liste",
    man.fassungen.some((f) => f.pfad === man.aktuell));
  ok("#118 die aktuell empfohlene Fassung IST der Vorgabewert aus sembla-katalog.js",
    man.aktuell === KAT.VORLAGE_KATALOG_PFAD);
  ok("#118 jede Fassung traegt ihre kanonische, pfadabgeleitete Kennung",
    man.fassungen.every((f) => f.id === KAT.vorlageKatalogId(f.pfad)));
  ok("#118 die Kennungen sind untereinander verschieden — keine Fassung ersetzt eine andere",
    new Set(man.fassungen.map((f) => f.id)).size === man.fassungen.length);
  ok("#118 jede benannte Fassungsdatei ist vorhanden und ein gueltiger Katalog",
    man.fassungen.every((f) => {
      const datei = f.pfad.replace(/^\.\//, "");
      try { return KAT.parseKatalog(readFileSync(
        new URL("../../docs/" + datei, import.meta.url), "utf8")).produkte.length > 0; }
      catch { return false; }
    }));

  // Fehlerfaelle: benannt abgewiesen statt still geraten.
  const wirft = (t) => { try { KAT.parseVorlagenManifest(t); return false; } catch { return true; } };
  ok("#118 kaputtes JSON wird benannt abgewiesen", wirft("{nicht json"));
  ok("#118 fremdes Format wird benannt abgewiesen",
    wirft(JSON.stringify({ format: "SEMBLA-Bauteilkatalog", fassungen: [{ pfad: "a.json" }] })));
  ok("#118 leere Fassungsliste wird benannt abgewiesen",
    wirft(JSON.stringify({ format: "SEMBLA-Katalogvorlagen", fassungen: [] })));
  ok("#118 eine Fassung ohne Pfad wird benannt abgewiesen — ohne Pfad keine Identitaet",
    wirft(JSON.stringify({ format: "SEMBLA-Katalogvorlagen", fassungen: [{ version: "v9" }] })));
  ok("#118 ein „aktuell“ ausserhalb der Liste wird benannt abgewiesen",
    wirft(JSON.stringify({ format: "SEMBLA-Katalogvorlagen", aktuell: "./x.json",
                           fassungen: [{ pfad: "./vorlagen/a.json" }] })));

  // Der Zweck der Pfadversionierung: zwei Fassungen koennen nebeneinander liegen.
  ok("#118 zwei Fassungen ergeben zwei Identitaeten (der Sinn der Pfadversionierung)",
    KAT.vorlageKatalogId("./vorlagen/SEMBLA_Standardkatalog-v1.json")
    !== KAT.vorlageKatalogId("./vorlagen/SEMBLA_Standardkatalog-v2.json"));
}

// =====================================================================
//  2) Aufbau einer Lage mit einer kaputten Referenz (der Fall aus #115)
// =====================================================================
// Zwei Kataloge: `katVoll` enthaelt beide Stangen, `katKurz` nur noch eine — genau die
// Lage, die #115 beschreibt (ein Bauteil wurde entfernt, die Wand zeigt weiter darauf).
const P_LANG = "gewindestange-m10-920";
const P_KURZ = "gewindestange-m10-850";

function stange(id, laenge) {
  return { id, kategorie: "gewindestange", bezeichnung: "Gewindestange " + laenge + " mm",
           einheit: "Stk", preis: 3.5, gewinde: "M10", laenge_mm: laenge };
}

const katVoll = store.setzeKatalog({ ...KAT.leererKatalog("Katalog mit beiden Stangen"),
  produkte: [stange(P_LANG, 920), stange(P_KURZ, 850)] }, { zuordnen: false });
const katKurz = store.setzeKatalog({ ...KAT.leererKatalog("Katalog ohne die 920er"),
  produkte: [stange(P_KURZ, 850)] }, { zuordnen: false });

const mappe = store.setzeMappe(MAPPE.leereMappe("Projekt #118"));
const projektId = mappe.projekt.id;
store.setzeAktivesProjekt(projektId);
store.setzeProjektKatalog(katVoll.id);

// Eine Wand anlegen und ihr die 920er zuweisen — ueber den EINEN Schreibweg.
const geschoss = store.holeMappe().gebaeude[0].geschosse[0];
const wandEl = store.speichere("W-01", { name: "W-01", length_mm: 2000, height_mm: 2600,
  openings: [], steps: [], interlocks: [], prestress: {} });
const wandId = typeof wandEl === "string" ? wandEl : (wandEl && wandEl.id) || store.aktivId();
store.setzeProduktrolle("rod_std", [P_LANG], wandId);

// Die Wand VERORTEN — `referenzPruefung` geht ueber die Projektstruktur
// (`strukturWaende`), nicht ueber den flachen Wandspeicher: nur so sind es die Waende
// GENAU DIESES Projekts.
store.setzeMappe(MAPPE.setzeWand(store.holeMappe(), geschoss.id, { id: wandId, name: "W-01" }));

ok("Pruefaufbau: die Wand fuehrt die spaeter fehlende Kennung und haengt im Projekt",
  KAT.rollenIds(store.holeProdukte(1, wandId), "rod_std").includes(P_LANG)
  && store.strukturWaende("projekt", projektId).vorhanden.length === 1);

// =====================================================================
//  3) referenzPruefung — die EINE Pruefung, zwei Aufrufarten
// =====================================================================
{
  const heute = store.referenzPruefung(projektId);
  ok("#118 gegen den ZUGEORDNETEN Katalog ist alles aufloesbar — kein Befund",
    heute.status === "ok" && heute.betroffen.length === 0 && heute.kennungen.length === 0);

  // Vorpruefung gegen eine Fassung, auf die NICHT umgeschaltet wurde.
  const vorher = store.holeMappe().katalog;
  const vor = store.referenzPruefung(projektId, katKurz.id);
  ok("#118 die Vorpruefung gegen eine andere Fassung findet die fehlende Kennung",
    vor.status === "ok" && vor.kennungen.includes(P_LANG));
  ok("#118 sie nennt den geprueften Katalog, nicht den zugeordneten",
    vor.katalogId === katKurz.id && vor.katalogName === "Katalog ohne die 920er");
  ok("#118 der Befund nennt Wand, Modul und Verwendungsstelle",
    vor.betroffen.some((b) => b.elementId === wandId && b.modul === 1
      && b.rolle === "rod_std" && b.fehlendeIds.includes(P_LANG)));
  ok("#118 die Vorpruefung SCHREIBT NICHTS — die Zuordnung ist unberuehrt",
    store.holeMappe().katalog === vorher);
  ok("#118 sie tastet auch die Produktauswahl der Wand nicht an",
    KAT.rollenIds(store.holeProdukte(1, wandId), "rod_std").includes(P_LANG));
  ok("#118 gezaehlt werden betroffene Waende, nicht Befundzeilen",
    vor.betroffenZahl === 1 && vor.wandZahl === 1);

  ok("#118 ein unbekanntes Projekt wird benannt, nicht geraten",
    store.referenzPruefung("gibt-es-nicht").status === "kein_projekt");
}

// =====================================================================
//  4) wandBefund — was der Dialog anzeigt
// =====================================================================
{
  const gutKat = store.katalogNachId(katVoll.id);
  const kurzKat = store.katalogNachId(katKurz.id);

  ok("#115 ohne Luecke gibt es keinen Befund und damit keinen Dialog",
    REP.wandBefund(1, wandId, gutKat).length === 0);

  const b = REP.wandBefund(1, wandId, kurzKat);
  ok("#115 mit Luecke nennt der Befund genau die betroffene Rolle",
    b.length === 1 && b[0].rolle === "rod_std" && b[0].fehlendeIds.length === 1
    && b[0].fehlendeIds[0] === P_LANG);
  ok("#115 der Befund traegt die Beschriftung der Verwendungsstelle",
    b[0].label === KAT.rollenLabel("rod_std") && !!b[0].label);
  ok("#115 der Befund fuehrt die VOLLSTAENDIGE bisherige Auswahl mit",
    b[0].ids.includes(P_LANG));
  ok("#115 ohne Katalog gibt es keinen Befund — dort waere nichts zu ersetzen",
    REP.wandBefund(1, wandId, null).length === 0);
  ok("#115 Rollen eines anderen Moduls stehen nicht darin ([P-13])",
    REP.wandBefund(2, wandId, kurzKat).length === 0);

  // Der Dialog braucht keine eigene Auswahllogik: die Kandidaten kommen aus derselben
  // Quelle wie das Dropdown der Rollenzeile.
  const kandidaten = KAT.rollenOptionen(kurzKat, "rod_std");
  ok("#115 die Ersatzkandidaten kommen aus rollenOptionen — keine zweite Auswahllogik",
    kandidaten.length === 1 && kandidaten[0].id === P_KURZ);
}

// =====================================================================
//  5) Die Reparatur selbst laeuft ueber den EINEN Schreibweg
// =====================================================================
// Der Dialog setzt nichts anderes als `setzeProduktrolle` — hier nachgestellt, damit die
// Wirkung geprueft ist, ohne den DOM zu brauchen.
{
  store.setzeProduktrolle("rod_std", [P_KURZ], wandId);
  ok("#115 nach der Ersetzung fuehrt die Wand nur noch die auffindbare Kennung",
    KAT.rollenIds(store.holeProdukte(1, wandId), "rod_std").join() === P_KURZ);

  store.setzeProjektKatalog(katKurz.id);
  const danach = store.referenzPruefung(projektId);
  ok("#115 gegen den nun zugeordneten Katalog ist der Befund leer — die Luecke ist zu",
    danach.status === "ok" && danach.betroffen.length === 0);

  ok("#118 ohne zugeordneten Katalog ist der Status benannt, nicht leer geraten",
    (() => { store.setzeProjektKatalog(null);
             const r = store.referenzPruefung(projektId);
             store.setzeProjektKatalog(katKurz.id);
             return r.status === "kein_katalog" && r.betroffen.length === 0; })());
}

console.log(`\n${n - schlecht}/${n} ok (Katalogversionen & Reparatur, #118)`);
if (schlecht) process.exit(1);
