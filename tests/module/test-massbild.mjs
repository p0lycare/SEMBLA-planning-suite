// Logik-Test der gemeinsamen Massdarstellung (docs/shared/sembla-massbild.js).
//
// Die Massdarstellung lag bis Issue #54 ausschliesslich inline in
// docs/geschossplan.html. Modul 9 (Lageplan) muss die Masse BITGENAU so zeigen wie
// der Editor — dieselben Bezuege, dieselben Werte, dieselbe Staffelung, dieselben
// gespeicherten Darstellungsversaetze `linie_mm`/`text_mm`. Deshalb wohnt die
// Weltgeometrie jetzt hier, und BEIDE Seiten rechnen ausschliesslich damit.
//
// Was ausdruecklich NICHT hierher gehoert: Blick (Zoom/Strichbreite), Trefferradien
// und der laufende Zug der Bedienung. Der Loeser sieht `linie_mm`/`text_mm` nie ([K-5]).
//
// Aufruf:  node tests/module/test-massbild.mjs

import { readFileSync } from "node:fs";

const MB = await import("../../docs/shared/sembla-massbild.js");
const CON = await import("../../docs/shared/sembla-constraints.js");

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };

/** Kurzschreibweise fuer eine Wand. */
const w = (id, x, y, richtung, laenge_grid) =>
  ({ id, lage: { start_mm: { x, y }, richtung, laenge_grid } });
const p = (wand, bezug) => ({ wand, bezug });

// Zwei Waende in Richtung x, Mittellinien 1062,5 und 4062,5 mm — genau der Aufbau,
// mit dem der Editor-Smoke rechnet.
const WAENDE = [w("a", 0, 1062.5, "x", 16), w("b", 0, 4062.5, "x", 16)];
const ERG = CON.pruefeGeschoss(WAENDE, []);

/** Denselben Kontext bauen, den auch die Oberflaeche uebergibt. */
const ctx = (waende = WAENDE, erg = ERG) => MB.massKontext(waende, erg);

// --- Grundmasse -----------------------------------------------------------

t("[K-*] der Staffelabstand ist eine benannte Konstante", MB.MASS_ABSTAND_MM === 250);

const g0 = MB.massGeometrie(
  { id: "m0", achse: "y", von: p("a", "mitte"), bis: p("b", "mitte"), mass_mm: 3000 }, 0, ctx());
t("Geometrie liefert Achse, Endwerte, Fusspunkte, Masslinie und Mass",
  !!g0 && g0.achse === "y" && g0.v1 === 1062.5 && g0.v2 === 4062.5 && g0.mass === 3000);
t("die Fusspunkte liegen quer in der Mitte der jeweiligen Wand",
  g0.q1 === 1000 && g0.q2 === 1000);

const g1 = MB.massGeometrie(
  { id: "m1", achse: "y", von: p("a", "mitte"), bis: p("b", "mitte"), mass_mm: 3000 }, 1, ctx());
t("die Staffelung setzt jedes weitere Mass genau 250 mm weiter nach aussen",
  g1.q - g0.q === MB.MASS_ABSTAND_MM);

// --- linie_mm: verschiebt die GANZE Darstellung quer ----------------------

const gL = MB.massGeometrie(
  { id: "m0", achse: "y", von: p("a", "mitte"), bis: p("b", "mitte"), mass_mm: 3000, linie_mm: 500 },
  0, ctx());
t("`linie_mm` verschiebt die Masslinie quer zur Messrichtung", gL.q - g0.q === 500);
t("… und laesst Fusspunkte, Endwerte und Mass bitgenau unveraendert",
  gL.q1 === g0.q1 && gL.q2 === g0.q2 && gL.v1 === g0.v1 && gL.v2 === g0.v2 && gL.mass === g0.mass);

// --- text_mm: verschiebt allein die Zahl ---------------------------------

const gT = MB.massGeometrie(
  { id: "m0", achse: "y", von: p("a", "mitte"), bis: p("b", "mitte"), mass_mm: 3000,
    text_mm: { x: 40, y: -20 } }, 0, ctx());
t("`text_mm` erreicht die Masslinie nicht", gT.q === g0.q && gT.q1 === g0.q1);
const aT = MB.massAnker(gT, 0), a0 = MB.massAnker(g0, 0);
t("`text_mm` verschiebt allein den Beschriftungsanker",
  aT.anker.x - a0.anker.x === 40 && aT.anker.y - a0.anker.y === -20);

// --- Anker und Zahlmitte -------------------------------------------------

const gx = MB.massGeometrie(
  { id: "mx", achse: "x", von: p("a", "min"), bis: p("a", "max"), mass_mm: 2000 }, 0, ctx());
const ax = MB.massAnker(gx, 30);
t("in Achse x liegt der Anker laengs in der Mitte und quer auf der Masslinie",
  ax.anker.x === (gx.v1 + gx.v2) / 2 && ax.anker.y === gx.q);
t("die Zahl steht um die uebergebene Texthoehe ueber der Masslinie (Achse x)",
  ax.mitte.x === ax.anker.x && ax.mitte.y === ax.anker.y - 30);
const ay = MB.massAnker(g0, 30);
t("in Achse y stehen laengs und quer getauscht — die Zahl ist um −90° gedreht",
  ay.anker.x === g0.q && ay.anker.y === (g0.v1 + g0.v2) / 2
  && ay.mitte.x === ay.anker.x - 30 && ay.mitte.y === ay.anker.y);

// --- Ursprung ([K-4]) ----------------------------------------------------

const gU = MB.massGeometrie(
  { id: "fix", achse: "y", von: null, bis: p("a", "min"), mass_mm: 1000 }, 0, ctx());
t("[K-4] `von: null` ist der Geschossursprung: ohne Angabe Wert 0, quer 0",
  gU.v1 === 0 && gU.q1 === 0 && gU.v2 === 1000);

// Seit #76 ist der Ursprung ein GESPEICHERTER Punkt. Hier ist die eine Stelle,
// an der `von: null` in Weltgeometrie uebersetzt wird — Editor und Lageplan
// haengen beide daran ([N-5]), deshalb steht die Zusicherung hier.
{
  const ctxU = MB.massKontext(WAENDE, ERG, { x: 250, y: -500 });
  const gV = MB.massGeometrie(
    { id: "fix", achse: "y", von: null, bis: p("a", "min"), mass_mm: 1000 }, 0, ctxU);
  t("#76 der Ursprungsendpunkt liegt laengs auf seiner Achskoordinate",
    gV.v1 === -500);
  t("#76 … und quer auf der anderen — nicht mehr fest bei 0",
    gV.q1 === 250);
  t("#76 der Wandendpunkt bleibt davon voellig unberuehrt",
    gV.v2 === gU.v2 && gV.q2 === gU.q2);
  t("#76 der Kontext traegt den normalisierten Punkt",
    ctxU.ursprung.x === 250 && ctxU.ursprung.y === -500);
  t("#76 ohne Ursprungsangabe bleibt die Geometrie bitgenau die alte",
    JSON.stringify(MB.massGeometrie(
      { id: "fix", achse: "y", von: null, bis: p("a", "min"), mass_mm: 1000 }, 0, ctx()))
    === JSON.stringify(gU));
  t("#76 ein Altstand-Kontext ohne das Feld faellt auf 0/0 zurueck",
    MB.massKontext(WAENDE, ERG, null).ursprung.x === 0
    && MB.massEndpunkt(null, "y", { lage: () => null, position: () => undefined }).wert === 0);
}

// --- Nichts wird erfunden ------------------------------------------------

const waendeOffen = [w("a", 0, 1062.5, "x", 16), { id: "b", lage: null }];
const ergOffen = CON.pruefeGeschoss(waendeOffen, []);
t("eine unverortete Bezugswand liefert `null` statt einer geratenen Null",
  MB.massGeometrie({ id: "m", achse: "y", von: p("a", "mitte"), bis: p("b", "mitte"), mass_mm: 100 },
    0, ctx(waendeOffen, ergOffen)) === null);
t("eine unbekannte Wand liefert ebenfalls `null`",
  MB.massGeometrie({ id: "m", achse: "y", von: p("a", "mitte"), bis: p("zz", "mitte"), mass_mm: 100 },
    0, ctx()) === null);
t("ein Mass ohne zulaessige Achse ist nicht darstellbar",
  MB.massGeometrie({ id: "m", achse: "z", von: null, bis: p("a", "min"), mass_mm: 100 }, 0, ctx()) === null);
t("ein Mass ohne Zielbezug ist nicht darstellbar ([K-4])",
  MB.massGeometrie({ id: "m", achse: "y", von: p("a", "min"), bis: null, mass_mm: 100 }, 0, ctx()) === null);

// --- Muss 4: geloeste Positionen schlagen gespeicherte Rohpositionen ------

const bem = [{ id: "fix", achse: "y", von: null, bis: p("a", "min"), mass_mm: 0 }];
const ergFix = CON.pruefeGeschoss(WAENDE, bem);
const gFix = MB.massGeometrie(bem[0], 0, MB.massKontext(WAENDE, ergFix));
t("Muss 4: gezeichnet wird die GELOESTE Position, nicht `start_mm`",
  ergFix.positionen.a.y === 62.5 && gFix.v2 === 0
  && CON.normLage(WAENDE[0].lage).start_mm.y === 1062.5);

// --- Pfad ----------------------------------------------------------------

const d = MB.massPfad(g0, 5);
t("der Pfad enthaelt beide Hilfslinien und die Masslinie", (d.match(/M/g) || []).length === 3);
t("in Achse y stehen quer/laengs im Pfad getauscht", d.startsWith("M1000 1062.5"));
t("die Hilfslinien reichen um `tick` ueber die Masslinie hinaus",
  MB.massPfad(g0, 5).includes(String(g0.q + 5)));

// --- Zusatzversatz der Bedienung (laufender Zug) -------------------------

const gZ = MB.massGeometrie(
  { id: "m0", achse: "y", von: p("a", "mitte"), bis: p("b", "mitte"), mass_mm: 3000 },
  0, ctx(), { zusatz_q: 120 });
t("ein laufender Zug wird aufgeschlagen, ohne gespeichert zu sein", gZ.q - g0.q === 120);

// --- #59: kollisionsfreie Anordnung der Masszahlen ------------------------

/** Zwei Flaechen ueberdecken sich nicht (Beruehren an der Kante zaehlt als frei). */
const disjunkt = (a, b) => a.x_min >= b.x_max || b.x_min >= a.x_max
  || a.y_min >= b.y_max || b.y_min >= a.y_max;

// Drei x-Masse ueber derselben Wand: das zweite und dritte liegen per `linie_mm`
// auf der Masslinie des ersten — ohne Anordnung staenden alle drei Zahlen
// deckungsgleich uebereinander.
const kb = (id, linie_mm) => ({ id, achse: "x", von: p("a", "min"), bis: p("a", "max"),
  mass_mm: 2000, ...(linie_mm ? { linie_mm } : {}) });
const roh59 = [kb("k0"), kb("k1", -250), kb("k2", -500)]
  .map((b, i) => MB.massGeometrie(b, i, ctx()));
const lay59 = MB.massTextLayout(roh59);
const fl59 = lay59.map((g) => MB.massTextFlaeche(g));
t("#59 Pruefaufbau: ohne Anordnung ueberdecken sich die Zahlen wirklich",
  roh59[0].q === roh59[1].q && roh59[1].q === roh59[2].q
  && !disjunkt(MB.massTextFlaeche(roh59[0]), MB.massTextFlaeche(roh59[1])));
t("#59 die angeordneten Beschriftungsflaechen ueberdecken einander nicht",
  disjunkt(fl59[0], fl59[1]) && disjunkt(fl59[0], fl59[2]) && disjunkt(fl59[1], fl59[2]));
t("#59 die erste Zahl bleibt unveraendert an ihrer Stelle (dasselbe Objekt)",
  lay59[0] === roh59[0]);
t("#59 Masslinie, Fusspunkte, Endwerte und Masswert bleiben bitgenau",
  lay59.every((g, i) => g.q === roh59[i].q && g.q1 === roh59[i].q1 && g.q2 === roh59[i].q2
    && g.v1 === roh59[i].v1 && g.v2 === roh59[i].v2 && g.mass === roh59[i].mass));
t("#59 der Ausweichversatz steht nur im fluechtigen `versatz` der Kopie — die Eingabe bleibt unberuehrt",
  roh59[1].versatz.y === 0 && roh59[2].versatz.y === 0
  && lay59[1].versatz.y === MB.MASS_TEXT_MM.hoehe
  && lay59[2].versatz.y === 2 * MB.MASS_TEXT_MM.hoehe);
t("#59 deterministisch: gleicher Stand ⇒ bitgenau gleiche Anordnung",
  JSON.stringify(MB.massTextLayout(roh59)) === JSON.stringify(lay59));
t("#59 `null` bleibt `null` — nichts wird ausgeblendet, nichts erfunden",
  JSON.stringify(MB.massTextLayout([null, roh59[0]]).map((g) => g && g.id))
  === JSON.stringify([null, "k0"]));

// Auch ein pathologischer Stand — MEHR als hundert deckungsgleiche Zahlen — wird
// vollstaendig entzerrt: das Ausweichen hat KEINE Kappe (eine feste Obergrenze
// liesse ab ihrer Hoehe wieder Ueberdeckung zu); jenseits der aeussersten
// belegten Flaeche ist immer Platz.
const viele = Array.from({ length: 120 },
  (_, i) => MB.massGeometrie(kb(`v${i}`, -MB.MASS_ABSTAND_MM * i), i, ctx()));
const flViele = MB.massTextLayout(viele).map((g) => MB.massTextFlaeche(g));
t("#59 auch weit ueber hundert deckungsgleiche Zahlen bleiben saemtlich getrennt",
  viele.every((g) => g.q === viele[0].q)
  && flViele.every((a, i) => flViele.slice(i + 1).every((b) => disjunkt(a, b))));

// Ein gespeicherter `text_mm` wirkt ZUERST und geht in die Kollisionspruefung ein:
// er zieht die zweite Zahl auf die erste, das Ausweichen setzt OBENDRAUF an.
const rohT = [kb("t0"), { ...kb("t1"), text_mm: { x: 0, y: -250 } }]
  .map((b, i) => MB.massGeometrie(b, i, ctx()));
const layT = MB.massTextLayout(rohT);
t("#59 manueller `text_mm` bleibt wirksam und wird bei der Pruefung beruecksichtigt",
  !disjunkt(MB.massTextFlaeche(rohT[0]), MB.massTextFlaeche(rohT[1]))
  && layT[1].versatz.y === -250 + MB.MASS_TEXT_MM.hoehe
  && disjunkt(MB.massTextFlaeche(layT[0]), MB.massTextFlaeche(layT[1])));

// Ohne Kollision aendert die Anordnung nichts: die regulaere Staffelung (250 mm)
// traegt die Zahlen bereits aneinander vorbei.
t("#59 ohne Kollision sind Ein- und Ausgabe bitgenau dieselben Objekte",
  MB.massTextLayout([g0, g1])[0] === g0 && MB.massTextLayout([g0, g1])[1] === g1);

// --- Determinismus und Reinheit ------------------------------------------

t("[K-5] gleicher Stand ⇒ bitgenau gleiches Ergebnis",
  JSON.stringify(MB.massGeometrie({ id: "m0", achse: "y", von: p("a", "mitte"), bis: p("b", "mitte"),
    mass_mm: 3000 }, 0, ctx()))
  === JSON.stringify(g0));

const quelle = readFileSync(new URL("../../docs/shared/sembla-massbild.js", import.meta.url), "utf8");
t("das Modul ist DOM-frei und kennt keinen Speicher",
  !/document|window|localStorage|indexedDB/.test(quelle));
t("das Modul importiert ausschliesslich den Constraint-Baustein",
  (quelle.match(/^import .*/gm) || []).every((z) => z.includes("./sembla-constraints.js")));

// --- Anti-Drift: der Editor rechnet die Massgeometrie nicht mehr selbst ---

const gp = readFileSync(new URL("../../docs/geschossplan.html", import.meta.url), "utf8");
t("Anti-Drift: der Geschossplaner haelt keine eigene Staffelkonstante mehr",
  !/const MASS_ABSTAND_MM\s*=/.test(gp));
t("Anti-Drift: der Geschossplaner nutzt die gemeinsame Massgeometrie",
  /MB\.massGeometrie\(/.test(gp) && /MB\.massAnker\(/.test(gp) && /MB\.massKontext\(/.test(gp));
t("Anti-Drift: das gemeinsame Modul ist wie im Browser eingebunden",
  /sembla-massbild\.js/.test(gp) && /MB\b/.test(gp));
t("Anti-Drift #59: der Geschossplaner ordnet die Masszahlen ueber die gemeinsame Funktion",
  /MB\.massTextLayout\(/.test(gp));
const lp = readFileSync(new URL("../../docs/shared/sembla-lageplan.js", import.meta.url), "utf8");
t("Anti-Drift #59: der Lageplan ordnet die Masszahlen ueber DIESELBE Funktion",
  /\bmassTextLayout\(/.test(lp) && /massTextLayout/.test(lp.split("\n")
    .filter((z) => z.startsWith("import ")).join("\n")));

console.log(`\ntest-massbild: ${pass} ok, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
