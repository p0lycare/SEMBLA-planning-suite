// Logik-Test des Lageplanblatts (docs/shared/sembla-lageplan.js, Modul 9, Issue #54).
//
// Geprueft wird die EINE DOM-freie Zeichenableitung, aus der Vorschau UND Export
// des Moduls entstehen (Muss 9): Regelwerk Kapitel 16.11 [N-1] … [N-8].
//
//   [N-2] Projekt/Geschoss eindeutig; Ausgabe folgt der Auswahl
//   [N-3] frische Ableitung aus Mappe + kanonischem Loeserergebnis
//   [N-4] geloeste Positionen schlagen gespeicherte Rohpositionen
//   [N-5] Masse identisch zum Editor (Bezuege, Werte, linie_mm/text_mm)
//   [N-6] Schriftfeld aus mappe.projekt.kopfdaten
//   [N-7] unvollstaendiger Stand wird konkret benannt, nie als vollstaendig ausgegeben
//   [N-8] genau EIN Blatt je Geschoss, eigene Massstabsreihe, nie beschneiden
//   [N-9] der kalibrierte Geschossplan als Hintergrund, flüchtige Transparenz (#80)
//
// Aufruf:  node tests/module/test-lageplan.mjs

import { readFileSync } from "node:fs";

const LP = await import("../../docs/shared/sembla-lageplan.js");
const MAPPE = await import("../../docs/shared/sembla-projektmappe.js");
const CON = await import("../../docs/shared/sembla-constraints.js");
const MB = await import("../../docs/shared/sembla-massbild.js");

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };

// --- Pruefaufbau: ein Projekt, zwei Geschosse, vier orthogonale Waende ------

function bau() {
  let m = MAPPE.leereMappe("Pruefprojekt", { gebaeude: "Haus A", geschoss: "EG", hoehe_mm: 2600 });
  m = MAPPE.setzeKopfdaten(m, {
    bauherr: "Bauherrschaft Muster", planverfasser: "POLYCARE", phase: "LP 3",
    plan_nr: "A-101", index: "b", gez: "TB",
  });
  const gsEG = m.gebaeude[0].geschosse[0].id;
  const zwei = MAPPE.fuegeGeschossHinzu(m, m.gebaeude[0].id, "OG", 2400);
  m = zwei.mappe;
  const gsOG = zwei.id;

  // EG: zwei Waende in x (Mittellinien 1062,5 / 4062,5), zwei in y.
  m = MAPPE.setzeWand(m, gsEG, { id: "w-a", name: "Wand A",
    lage: { start_mm: { x: 0, y: 1062.5 }, richtung: "x", laenge_grid: 16 } });
  m = MAPPE.setzeWand(m, gsEG, { id: "w-b", name: "Wand B",
    lage: { start_mm: { x: 0, y: 4062.5 }, richtung: "x", laenge_grid: 16 } });
  m = MAPPE.setzeWand(m, gsEG, { id: "w-c", name: "Wand C",
    lage: { start_mm: { x: 62.5, y: 1125 }, richtung: "y", laenge_grid: 23 } });
  m = MAPPE.setzeWand(m, gsEG, { id: "w-d", name: "Wand D",
    lage: { start_mm: { x: 1937.5, y: 1125 }, richtung: "y", laenge_grid: 23 } });
  // OG: eine einzige Wand — damit der Geschosswechsel nachweisbar ist.
  m = MAPPE.setzeWand(m, gsOG, { id: "w-og", name: "Wand OG",
    lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 8 } });

  // Zwei Masse im EG: eines mit gespeicherter Darstellungsposition.
  m = MAPPE.setzeBemassung(m, gsEG, { id: "bm-1", achse: "y",
    von: { wand: "w-a", bezug: "mitte" }, bis: { wand: "w-b", bezug: "mitte" }, mass_mm: 3000 });
  m = MAPPE.setzeBemassung(m, gsEG, { id: "bm-2", achse: "y",
    von: { wand: "w-a", bezug: "min" }, bis: { wand: "w-b", bezug: "min" }, mass_mm: 3000,
    linie_mm: 400, text_mm: { x: 30, y: -15 } });
  return { m, gsEG, gsOG };
}

const ELEMENTE = [
  { id: "w-a", name: "Wand A", wandelement: { height_mm: 2600, wandtyp: "mit_wind", length_mm: 2000 } },
  { id: "w-b", name: "Wand B", wandelement: { height_mm: 2600, wandtyp: "ohne_wind", length_mm: 2000 } },
  // Wand C ist ABSICHTLICH kuerzer als ihre gezeichnete Lage — Laengenabweichung ([L-3]).
  { id: "w-c", name: "Wand C", wandelement: { height_mm: 2600, wandtyp: "mit_wind", length_mm: 2000 } },
  // Wand D hat ABSICHTLICH kein Wandelement — verwaister Eintrag ([L-4]).
  { id: "w-og", name: "Wand OG", wandelement: { height_mm: 2400, wandtyp: "mit_wind", length_mm: 1000 } },
];

const { m: MAPPE0, gsEG, gsOG } = bau();
const daten = LP.lageplanDaten({ mappe: MAPPE0, geschossId: gsEG, elemente: ELEMENTE });

// --- [N-2]/[N-3] Auswahl und frische Ableitung ------------------------------

t("[N-2] die Ableitung nennt Projekt, Gebaeude und Geschoss der Auswahl",
  daten.projekt.name === "Pruefprojekt" && daten.gebaeude.name === "Haus A"
  && daten.geschoss.name === "EG" && daten.geschoss.id === gsEG);
t("[N-3] alle vier Waende des Geschosses sind abgeleitet", daten.waende.length === 4);
t("[N-3] ein unbekanntes Geschoss wird benannt statt geraten",
  (() => { try { LP.lageplanDaten({ mappe: MAPPE0, geschossId: "gibtsnicht", elemente: ELEMENTE }); return false; }
    catch (e) { return /Geschoss/.test(String(e.message)); } })());
const datenOG = LP.lageplanDaten({ mappe: MAPPE0, geschossId: gsOG, elemente: ELEMENTE });
t("[N-2] der Geschosswechsel liefert eine andere Wandmenge",
  datenOG.waende.length === 1 && datenOG.waende[0].id === "w-og" && datenOG.geschoss.name === "OG");

// --- [N-8] Wandkennzeichnung und Kennungen ---------------------------------

const wA = daten.waende.find((w) => w.id === "w-a");
t("Muss 8: die Wandkennung ist die stabile Mappen-/Speicherkennung",
  !!wA && wA.id === "w-a" && wA.name === "Wand A");
t("[#59] die laufende Nummer ist Index+1 der kanonischen Mappenreihenfolge",
  daten.waende.map((w) => w.nr).join(",") === "1,2,3,4"
  && daten.waende.map((w) => w.id).join(",") === "w-a,w-b,w-c,w-d");
t("Laenge kommt aus der Lage, Hoehe und Wandtyp aus dem Wandelement ([P-1])",
  wA.laenge_mm === 2000 && wA.hoehe_mm === 2600 && wA.wandtyp === "mit_wind");
const wD = daten.waende.find((w) => w.id === "w-d");
t("[L-4] ein verwaister Eintrag wird als solcher gefuehrt — ohne geratene Hoehe",
  wD.verwaist === true && wD.hoehe_mm === null && wD.wandtyp === null);

// --- [#59]/[#73] kurze Nummer als Aussenblase, voller Name in der Liste -----
//
// Der lange Wandname war regelmaessig laenger als das Bauteil (eine 125 mm breite
// Wand ist bei 1:50 nur 2,5 Papier-mm breit) und ueberdeckte Nachbarwaende und
// Masse (#59). Seit #73 steht auch die kurze Nummer NICHT mehr im Wandrechteck,
// sondern in einer aussenliegenden Nummernblase mit Fuehrungslinie zur Wand;
// identifizierbar bleibt die Wand ueber `data-wand` (stabile Kennung) und
// `<title>` (voller Name).

/**
 * Die `lpwand`-Gruppen des Blattes, je Gruppe: stabile Kennung, `<title>` und —
 * falls vorhanden — ein Beschriftungstext IM Rechteck (muss seit #73 immer fehlen).
 * Gezielt je Gruppe, nicht global: Ursprungskreuz („0/0") und Massbeschriftungen
 * sind eigene Knoten.
 */
const wandGruppen = (s) => [...s.matchAll(/<g class="lpwand[^"]*" data-wand="([^"]*)">([\s\S]*?)<\/g>/g)]
  .map((m) => ({
    id: m[1],
    title: (m[2].match(/<title>([^<]*)<\/title>/) || [, null])[1],
    text: (m[2].match(/<text\b[^>]*>([^<]*)<\/text>/) || [, null])[1],
  }));

/**
 * Die Nummernblasen (#73): eigene `lpmarker`-Gruppen mit `data-wand`,
 * Fuehrungslinie, Kreis und unrotierter Nummer — alles in Papier-mm.
 */
const markerVon = (s) => [...s.matchAll(/<g class="lpmarker" data-wand="([^"]*)">([\s\S]*?)<\/g>/g)]
  .map((m) => {
    const c = m[2].match(/<circle cx="([^"]*)" cy="([^"]*)" r="([^"]*)"/);
    const l = m[2].match(/<line x1="([^"]*)" y1="([^"]*)" x2="([^"]*)" y2="([^"]*)"/);
    const t = m[2].match(/<text\b([^>]*)>([^<]*)<\/text>/);
    return {
      id: m[1],
      text: t ? t[2] : null,
      gedreht: t ? /transform=/.test(t[1]) : null,
      kreis: c ? { x: +c[1], y: +c[2], r: +c[3] } : null,
      linie: l ? { x1: +l[1], y1: +l[2], x2: +l[3], y2: +l[4] } : null,
    };
  });

/** Das gezeichnete Wandrechteck (Papier-mm) einer `lpwand`-Gruppe. */
const rechteckVon = (s, id) => {
  const m = new RegExp(`<g class="lpwand[^"]*" data-wand="${id}">`
    + `<rect x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"`).exec(s);
  return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null;
};

/** Liegt die Blase vollstaendig ausserhalb des Rechtecks? */
const ausserhalb = (k, r) => k.x + k.r <= r.x || k.x - k.r >= r.x + r.w
  || k.y + k.r <= r.y || k.y - k.r >= r.y + r.h;

const LANG = (() => {
  let m = MAPPE.leereMappe("Langnamen", { gebaeude: "Haus", geschoss: "EG", hoehe_mm: 2600 });
  const gs = m.gebaeude[0].geschosse[0].id;
  m = MAPPE.setzeWand(m, gs, { id: "L1", name: "Wand Erdgeschoss Nord tragend, Achse A/1–A/5",
    lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 16 } });
  m = MAPPE.setzeWand(m, gs, { id: "L2", name: "Wand Erdgeschoss Ost, nichttragende Trennwand",
    lage: { start_mm: { x: 62.5, y: 125 }, richtung: "y", laenge_grid: 16 } });
  m = MAPPE.setzeWand(m, gs, { id: "L3", name: "Wand Erdgeschoss Süd, Anschluss Treppenhaus",
    lage: { start_mm: { x: 0, y: 2187.5 }, richtung: "x", laenge_grid: 16 } });
  // Vierter Eintrag ohne Lage, fuenfter ohne Wandelement — beide zaehlen mit.
  m = MAPPE.setzeWand(m, gs, { id: "L4", name: "Wand Erdgeschoss West, noch nicht eingezeichnet",
    lage: null });
  m = MAPPE.setzeWand(m, gs, { id: "L5", name: "Wand Erdgeschoss Kern, verwaister Eintrag",
    lage: { start_mm: { x: 3000, y: 62.5 }, richtung: "x", laenge_grid: 8 } });
  const el = ["L1", "L2", "L3", "L4"].map((id) => ({ id, name: id,
    wandelement: { height_mm: 2600, wandtyp: "mit_wind", length_mm: 2000 } }));
  return LP.lageplanDaten({ mappe: m, geschossId: gs, elemente: el });
})();
const langBlatt = LP.blattHtml(LANG);
const langGruppen = wandGruppen(langBlatt.svg);
const langMarker = markerVon(langBlatt.svg);

t("[#59] jede Wand traegt eine eindeutige Nummer — auch unverortete und verwaiste",
  LANG.waende.map((w) => `${w.id}=${w.nr}`).join(",") === "L1=1,L2=2,L3=3,L4=4,L5=5"
  && new Set(LANG.waende.map((w) => w.nr)).size === 5);
t("[#73] jede verortete Wand traegt eine Nummernblase mit ihrer kurzen Nummer",
  langMarker.map((g) => g.id + ":" + g.text).join(",") === "L1:1,L2:2,L3:3,L5:5"
  && langMarker.every((g) => g.kreis && g.linie));
t("[#73] keine Nummer steht mehr als Text im Wandrechteck",
  langGruppen.length === 4 && langGruppen.every((g) => g.text === null));
t("[#73] die Blase liegt bei der horizontalen Wand ausserhalb — oberhalb des Rechtecks",
  (() => {
    const g = langMarker.find((x) => x.id === "L1"), r = rechteckVon(langBlatt.svg, "L1");
    return !!g && !!r && ausserhalb(g.kreis, r) && g.kreis.y + g.kreis.r <= r.y;
  })());
t("[#73] die Blase liegt bei der vertikalen Wand ausserhalb — links des Rechtecks",
  (() => {
    const g = langMarker.find((x) => x.id === "L2"), r = rechteckVon(langBlatt.svg, "L2");
    return !!g && !!r && ausserhalb(g.kreis, r) && g.kreis.x + g.kreis.r <= r.x;
  })());
t("[#73] die Fuehrungslinie laeuft vom Blasenrand auf die Wandkante",
  (() => {
    // Endpunkte exakt (identische Rundung im SVG), der Blasenrand mit 0,002-mm-Toleranz
    // (die Zeichenkette rundet auf 3 Dezimalen, die Addition r + cy hier nicht).
    const nah = (a, b) => Math.abs(a - b) < 0.002;
    const g1 = langMarker.find((x) => x.id === "L1"), r1 = rechteckVon(langBlatt.svg, "L1");
    const g2 = langMarker.find((x) => x.id === "L2"), r2 = rechteckVon(langBlatt.svg, "L2");
    return g1.linie.x2 === g1.kreis.x && g1.linie.y2 === r1.y
      && nah(g1.linie.y1, g1.kreis.y + g1.kreis.r)
      && g2.linie.y2 === g2.kreis.y && g2.linie.x2 === r2.x
      && nah(g2.linie.x1, g2.kreis.x + g2.kreis.r);
  })());
t("[#73] die Nummer in der Blase ist unrotiert — bei beiden Richtungen gleich lesbar",
  langMarker.every((g) => g.gedreht === false));
t("[#59] kein Wandname steht mehr als Beschriftung in der Zeichnung",
  langMarker.every((g) => !/[A-Za-zÄÖÜäöüß]/.test(String(g.text)))
  && !/<text[^>]*>Wand Erdgeschoss/.test(langBlatt.svg));
t("[#59] `title` und `data-wand` behalten vollen Namen und stabile Kennung",
  langGruppen.every((g) => g.title === LANG.waende.find((w) => w.id === g.id).name)
  && langGruppen.map((g) => g.id).join(",") === "L1,L2,L3,L5");
t("[#59] die unverortete Wand wird weiterhin nicht gezeichnet, sondern gemeldet",
  !langBlatt.svg.includes('data-wand="L4"')
  && LANG.meldungen.some((x) => x.art === "unverortet" && /noch nicht eingezeichnet/.test(x.text)));
t("[#73] die unverortete und die verwaiste Wand bekommen keine erfundene Markerlage",
  !langMarker.some((g) => g.id === "L4")
  // L5 ist verwaist, aber VERORTET — sie wird gezeichnet und traegt regulaer eine
  // Blase; nur die unverortete L4 hat keinerlei Lage im Plan.
  && langMarker.some((g) => g.id === "L5"));

// Die rechte Tabelle ist der Schluessel von der Zahl zum Namen (Muss 3).
const tabelle = LP.wandTabelleHtml(LANG);
const tabZeilen = [...tabelle.matchAll(
  /<tr><td class="nr">(\d+)<\/td><td>([^<]*)<\/td>[\s\S]*?<td>([^<]*)<\/td><\/tr>/g)]
  .map((m) => ({ nr: m[1], name: m[2], lage: m[3] }));
t("[#59] die Tabelle beginnt mit der Nummer und nennt daneben den vollen Namen",
  /<th class="nr">Nr\.<\/th><th>Wand<\/th>/.test(tabelle)
  && tabZeilen.length === 5
  && tabZeilen.map((z) => z.nr).join(",") === "1,2,3,4,5"
  && tabZeilen[0].name === "Wand Erdgeschoss Nord tragend, Achse A/1–A/5");
t("[#59] Zeichnung und Liste sind damit eindeutig zugeordnet",
  langMarker.every((g) => {
    const z = tabZeilen.find((x) => x.name === LANG.waende.find((w) => w.id === g.id).name);
    return !!z && z.nr === String(g.text);
  }));
t("[#59] der unverortete Eintrag steht mit Nummer in der Liste — ohne erfundene Lage",
  tabZeilen[3].nr === "4" && /noch nicht eingezeichnet/.test(tabZeilen[3].name)
  && tabZeilen[3].lage === "unverortet");
t("[#59] der verwaiste Eintrag steht mit Nummer und vollem Namen in der Liste ([L-4])",
  tabZeilen[4].nr === "5" && /verwaister Eintrag/.test(tabZeilen[4].name)
  && LANG.waende[4].verwaist === true && LANG.waende[4].hoehe_mm === null);
t("[#59] das vollstaendige Blatt traegt Nummer und Namen an genau diesen Stellen",
  langBlatt.html.includes(tabelle) && langBlatt.html.includes(langBlatt.svg));
t("[#59] Vorschau, Dokument und SVG-Datei zeigen bitgenau dieselbe Nummerierung",
  (() => {
    const dok = LP.lageplanDokument(LANG, langBlatt.optionen);
    const svgD = LP.lageplanSvgDatei(LANG, langBlatt.optionen);
    const s = (x) => markerVon(x).map((g) => g.id + ":" + g.text).join(",");
    return s(dok) === s(langBlatt.svg) && s(svgD) === s(langBlatt.svg)
      && dok.includes(tabelle);
  })());
t("[#59] die Nummer ist reine Darstellung — keine zweite Wandkennung im Datensatz",
  LANG.waende.every((w) => w.id !== String(w.nr))
  && !/data-nr=|data-nummer=/.test(langBlatt.svg));
t("[#73] die Legende erklaert die Nummernblase",
  /Nummernblase der Wand/.test(LP.legendeHtml()) && /Wände im Geschoss/.test(langBlatt.html));
t("[#73] der Block „Darstellung“ mit der Legende bleibt auf dem Blatt bestehen",
  langBlatt.html.includes(`<div class="lpbox"><h4>Darstellung</h4>${LP.legendeHtml()}</div>`));

// --- [N-4] geloeste Positionen schlagen Rohpositionen ----------------------

let mFix = MAPPE.setzeBemassung(MAPPE0, gsEG, { id: "bm-fix", achse: "y",
  von: null, bis: { wand: "w-a", bezug: "min" }, mass_mm: 0 });
const datenFix = LP.lageplanDaten({ mappe: mFix, geschossId: gsEG, elemente: ELEMENTE });
const wAfix = datenFix.waende.find((w) => w.id === "w-a");
t("[N-4] gezeichnet wird die GELOESTE Position (Fixmass 0 zieht die Wand auf y=0) …",
  wAfix.rechteck.y_min === 0 && wAfix.rechteck.y_max === 125);
t("… und die gespeicherte Rohposition bleibt unangetastet",
  MAPPE.findeWand(mFix, "w-a").wand.lage.start_mm.y === 1062.5);
t("[N-4] die Ableitung nennt die Bestimmtheit je Achse ([K-8])",
  wAfix.bestimmt.y === true && wAfix.bestimmt.x === false);

// --- [N-5] Masse identisch zum Editor -------------------------------------

t("[N-5] beide Masse des Geschosses sind uebernommen — in der Reihenfolge der Mappe",
  daten.bemassungen.length === 2 && daten.bemassungen[0].id === "bm-1"
  && daten.bemassungen[1].id === "bm-2");
const svgEG = LP.lageplanSvg(daten);
/**
 * Die gezeichneten MASSTEXTKNOTEN (#64) — gezielt aus den `lpmass`-Gruppen, nicht
 * global ueber alle `mm`-Vorkommen: die SVG-Wurzel traegt Papiermasse in mm, und
 * Wandtabelle wie Meldungstexte behalten ihre fachlich noetige Einheit.
 */
const massTexte = (s) => [...s.matchAll(/<g class="lpmass[^"]*"[^>]*>.*?<text\b[^>]*>([^<]*)<\/text>/g)]
  .map((m) => m[1]);
const mtEG = massTexte(svgEG.svg);
t("[N-5] Masswerte stehen unveraendert im Blatt — als reine mm-Zahl ohne Suffix",
  mtEG.includes("3000") && mtEG.length === 2);
t("[#64] kein Masstext im Lageplan traegt ein Einheitensuffix",
  mtEG.length > 0 && mtEG.every((x) => !/\s(?:mm|cm|m)$/.test(x)));
t("[N-5] jedes Mass ist im Blatt an seiner Kennung auffindbar",
  svgEG.svg.includes('data-bemassung="bm-1"') && svgEG.svg.includes('data-bemassung="bm-2"'));
// Der Vergleich laeuft gegen DIESELBE Quelle, mit der der Editor rechnet — es gibt
// keinen zweiten Rechenweg, der auseinanderlaufen koennte.
const ctx = MB.massKontext(
  MAPPE.bemassungen(MAPPE0, gsEG) && MAPPE.findeGeschoss(MAPPE0, gsEG).geschoss.waende,
  CON.pruefeGeschoss(MAPPE.findeGeschoss(MAPPE0, gsEG).geschoss.waende,
    MAPPE.bemassungen(MAPPE0, gsEG)));
const gRef1 = MB.massGeometrie(MAPPE.bemassungen(MAPPE0, gsEG)[0], 0, ctx);
const gRef2 = MB.massGeometrie(MAPPE.bemassungen(MAPPE0, gsEG)[1], 1, ctx);
t("[N-5] das Blatt uebernimmt die Geometrie der gemeinsamen Ableitung bitgenau",
  JSON.stringify(daten.massbilder.map((g) => ({ ...g })))
  === JSON.stringify([gRef1, gRef2].map((g) => ({ ...g }))));
t("[N-5] `linie_mm` wirkt: das zweite Mass liegt Staffelung + 400 mm weiter aussen",
  daten.massbilder[1].q - daten.massbilder[0].q === MB.MASS_ABSTAND_MM + 400);
t("[N-5] `text_mm` wirkt und verschiebt allein die Zahl",
  daten.massbilder[1].versatz.x === 30 && daten.massbilder[1].versatz.y === -15
  && daten.massbilder[1].q1 === daten.massbilder[0].q1);

// --- [#59] Nullmasse werden nicht gezeichnet, bleiben aber wirksam ---------
// Aufgebaut ist der Fall ueber `mFix` (s. o.): `bm-fix` ist eine echte, ueber
// `MAPPE.setzeBemassung` gesetzte Fixierung der Kante „w-a min" am Geschossursprung
// mit 0 mm — genau das Mass, das im Plan nichts misst und trotzdem die Lage bestimmt.

t("[#59] das 0-mm-Mass bleibt im Datenstand der Mappe erhalten",
  MAPPE.bemassungen(mFix, gsEG).length === 3
  && MAPPE.bemassungen(mFix, gsEG).some((b) => b.id === "bm-fix" && b.mass_mm === 0));
t("[#59] der kanonische Loeser wendet es unveraendert an (die Kante liegt auf y = 0)",
  wAfix.rechteck.y_min === 0 && wAfix.bestimmt.y === true);
t("[#59] `lageplanDaten` filtert nichts — kein Schattenbestand, keine Indexluecke",
  datenFix.massbilder.length === 3 && datenFix.massbilder.every(Boolean)
  && datenFix.massbilder[2].id === "bm-fix" && datenFix.massbilder[2].mass === 0
  && !datenFix.meldungen.some((m) => m.art === "mass_ohne_wand"));

const svgFix = LP.lageplanSvg(datenFix);
t("[#59] das Blatt laesst die GANZE Massgruppe des Nullmasses aus",
  !svgFix.svg.includes('data-bemassung="bm-fix"')
  && svgFix.svg.includes("lpmass"));              // die uebrigen Gruppen stehen weiter
t("[#59] keine Maszahl „0“ und keine Masslinie ohne Ausdehnung im Blatt",
  !massTexte(svgFix.svg).includes("0"));
t("[#59] die Nicht-null-Masse erscheinen unveraendert vollstaendig",
  svgFix.svg.includes('data-bemassung="bm-1"') && svgFix.svg.includes('data-bemassung="bm-2"')
  && massTexte(svgFix.svg).length === 2
  && massTexte(svgFix.svg).every((x) => x === "3000"));
t("[#59] die Staffelung der uebrigen Masse bleibt unberuehrt (Index bleibt Index)",
  datenFix.massbilder[1].q - datenFix.massbilder[0].q === MB.MASS_ABSTAND_MM + 400);
// Muss 5: Vorschau, Druck-HTML und die eigenstaendige SVG-Datei laufen durch denselben
// DOM-freien Pfad — geprueft wird deshalb an den tatsaechlichen Ausgabezeichenketten.
const blattFix = LP.blattHtml(datenFix);
const dokFix = LP.lageplanDokument(datenFix);
const svgDateiFix = LP.lageplanSvgDatei(datenFix);
t("[#59] Blatt-HTML, Druckdokument und SVG-Datei zeigen das Nullmass ebenfalls nicht",
  [blattFix.html, blattFix.svg, dokFix, svgDateiFix]
    .every((s) => !s.includes('data-bemassung="bm-fix"'))
  && [blattFix.svg, svgDateiFix].every((s) => !massTexte(s).includes("0")));
t("[#59] dieselbe Ausgabe traegt die Nicht-null-Masse weiterhin",
  [blattFix.svg, svgDateiFix].every((s) => s.includes('data-bemassung="bm-1"')
    && s.includes('data-bemassung="bm-2"') && massTexte(s).length === 2));
t("[#59] das Wandrechteck der fixierten Wand wird ganz normal gezeichnet",
  svgFix.svg.includes('data-wand="w-a"'));

// --- [#59] Masszahlen ueberdecken einander nicht — wie im Editor -----------
// Ein drittes Mass legt sich per `linie_mm` auf die Masslinie von bm-1: gleiche
// Bezuege, gleicher Mittelpunkt — ohne Anordnung staenden beide Zahlen
// deckungsgleich. Das Blatt muss DIESELBE kollisionsfreie Anordnung zeigen wie
// der Editor: beide rechnen mit `massTextLayout` aus `sembla-massbild.js`.

const mKoll = MAPPE.setzeBemassung(MAPPE0, gsEG, { id: "bm-koll", achse: "y",
  von: { wand: "w-a", bezug: "mitte" }, bis: { wand: "w-b", bezug: "mitte" }, mass_mm: 3000,
  linie_mm: -2 * MB.MASS_ABSTAND_MM });
const datenKoll = LP.lageplanDaten({ mappe: mKoll, geschossId: gsEG, elemente: ELEMENTE });
const disjunkt = (a, b) => a.x_min >= b.x_max || b.x_min >= a.x_max
  || a.y_min >= b.y_max || b.y_min >= a.y_max;
const flKoll = datenKoll.massbilder.map((g) => MB.massTextFlaeche(g));

t("[#59] Pruefaufbau: die Masslinien liegen wirklich uebereinander",
  datenKoll.massbilder.length === 3
  && datenKoll.massbilder[2].q === datenKoll.massbilder[0].q);
t("[#59] die Beschriftungsflaechen des Blattes ueberdecken einander nicht",
  disjunkt(flKoll[0], flKoll[1]) && disjunkt(flKoll[0], flKoll[2])
  && disjunkt(flKoll[1], flKoll[2]));
t("[#59] die Anordnung ist bitgenau die der gemeinsamen Ableitung — dieselbe wie im Editor",
  (() => {
    const geschoss = MAPPE.findeGeschoss(mKoll, gsEG).geschoss;
    const ctxK = MB.massKontext(geschoss.waende,
      CON.pruefeGeschoss(geschoss.waende, MAPPE.bemassungen(mKoll, gsEG)));
    const ref = MB.massTextLayout(MAPPE.bemassungen(mKoll, gsEG)
      .map((bm, i) => MB.massGeometrie(bm, i, ctxK)));
    return JSON.stringify(datenKoll.massbilder) === JSON.stringify(ref);
  })());
t("[#59] nur die Zahl weicht aus — Masslinie, Werte und die gespeicherte Bemassung bleiben",
  datenKoll.massbilder[2].versatz.x === MB.MASS_TEXT_MM.hoehe
  && datenKoll.massbilder[0].versatz.x === 0
  && datenKoll.massbilder[2].mass === 3000
  && MAPPE.bemassungen(mKoll, gsEG).find((b) => b.id === "bm-koll").text_mm == null);

// Vorschau (Blatt-HTML), Druckdokument und SVG-Datei zeigen dieselben getrennten
// Textlagen — es ist ein Pfad, keine zweite Zeichenrechnung.
const massTextPos = (s, id) => {
  const m = new RegExp(`<g class="lpmass[^"]*" data-bemassung="${id}">.*?<text x="([^"]*)" y="([^"]*)"`)
    .exec(s);
  return m ? m[1] + "/" + m[2] : null;
};
const blattKoll = LP.blattHtml(datenKoll);
const svgDateiKoll = LP.lageplanSvgDatei(datenKoll);
t("[#59] die beiden kollidierenden Zahlen stehen im Blatt an verschiedenen Stellen",
  massTextPos(blattKoll.svg, "bm-koll") !== null
  && massTextPos(blattKoll.svg, "bm-koll") !== massTextPos(blattKoll.svg, "bm-1"));
t("[#59] Vorschau und Ausgabeableitung zeigen DIESELBEN Beschriftungslagen",
  ["bm-1", "bm-2", "bm-koll"].every((id) =>
    massTextPos(blattKoll.svg, id) === massTextPos(svgDateiKoll, id)
    && massTextPos(blattKoll.svg, id) === massTextPos(LP.lageplanDokument(datenKoll), id)));

// --- [N-6] Schriftfeld aus mappe.projekt.kopfdaten -------------------------

const blatt = LP.blattHtml(daten);
// Ausgelesen wird der SICHTBARE Feldsatz des Schriftfelds — Beschriftung und Wert
// in der dargestellten Reihenfolge, nicht ein zweiter Aufruf von `kopfFelder()`.
const kopfPaare = (s) => [...s.matchAll(
  /<div class="lptb-row"><div class="k">([^<]*)<\/div><div class="v[^"]*">([^<]*)<\/div><\/div>/g)]
  .map((m) => [m[1], m[2]]);
const KOPF_SOLL = ["Projekt", "Gebäude", "Geschoss", "Planinhalt", "Plan Nr.", "Index",
  "Maßstab", "Einheit", "Stand"];
const ENTFERNT = ["Bauherrenschaft", "Planverfasser", "Phase", "Gez.", "Blattformat"];

t("[N-6] die Kopfdaten des PROJEKTS stehen im Schriftfeld",
  /A-101/.test(blatt.html) && kopfPaare(blatt.html).find((p) => p[0] === "Plan Nr.")[1] === "A-101"
  && kopfPaare(blatt.html).find((p) => p[0] === "Index")[1] === "b");
// [#59] Muss 1/2: genau die neun zur Planidentifikation noetigen Angaben — nicht mehr.
t("[#59] der Zeichnungskopf zeigt exakt die neun Pflichtangaben in fester Reihenfolge",
  kopfPaare(blatt.html).map((p) => p[0]).join("|") === KOPF_SOLL.join("|"));
t("[#59] Bauherrschaft, Planverfasser, Phase, Zeichner und Blattformat sind entfallen",
  ENTFERNT.every((f) => !blatt.html.includes(`<div class="k">${f}</div>`))
  && !/Bauherrschaft Muster/.test(blatt.html) && !/POLYCARE/.test(blatt.html)
  && !/LP 3/.test(blatt.html) && !/A3 quer/.test(blatt.html));
t("[#59] der Kopf steht damit in ZWEI Zeilen (fuenf Spalten zu je zwei Feldern)",
  (blatt.html.match(/<div class="col">/g) || []).length === 5
  && /grid-template-columns:1\.5fr 1\.2fr 1fr 1fr \.9fr/.test(LP.LAGEPLAN_CSS));
// [#59] Muss 3: leere optionale Felder bleiben leer — kein „###", kein „–".
const daten0 = LP.lageplanDaten({
  mappe: MAPPE.setzeKopfdaten(MAPPE0, { plan_nr: "", index: "" }),
  geschossId: gsEG, elemente: ELEMENTE,
});
const blatt0 = LP.blattHtml(daten0);
// Das „–" der Wandtabelle (fehlende Hoehe/Wandtyp) bleibt davon unberuehrt — geprueft
// wird der Zeichnungskopf, nicht das ganze Blatt.
t("[#59] fehlende Plan-Nr./Index erzeugen keinen Platzhalter",
  kopfPaare(blatt0.html).find((p) => p[0] === "Plan Nr.")[1] === ""
  && kopfPaare(blatt0.html).find((p) => p[0] === "Index")[1] === ""
  && kopfPaare(blatt0.html).every((p) => p[1] !== "–" && p[1] !== "###" && p[1] !== "undefined")
  && !/###/.test(blatt0.html) && !/undefined/.test(blatt0.html));
t("[#59] der Feldsatz bleibt dabei vollstaendig — leer heisst nicht weggelassen",
  kopfPaare(blatt0.html).map((p) => p[0]).join("|") === KOPF_SOLL.join("|"));
// [#59] Muss 5/6: die eigenstaendige SVG-Datei traegt DENSELBEN Feldsatz aus derselben
// Quelle — Nachweis am Text der Datei, nicht an einem zweiten Aufruf von `kopfFelder`.
// Nur die Kopfzeilen (`class="lpkopf"`), nicht die gleich grosse Massbeschriftung.
// Getrennt wird am ERSTEN „: " — der Massstabswert „1 : 100" enthaelt selbst eines.
const svgFelder = (s) => [...s.matchAll(/<text class="lpkopf"[^>]*>([^<]*)<\/text>/g)]
  .map((m) => m[1]).join(" · ").split(" · ")
  .map((x) => { const i = x.indexOf(": "); return i > 0 ? [x.slice(0, i), x.slice(i + 2)] : null; })
  .filter(Boolean);
const svgDateiK = LP.lageplanSvgDatei(daten);
t("[#59] die SVG-Exportdatei nennt dieselben Angaben in derselben Reihenfolge",
  svgFelder(svgDateiK).map((p) => p[0]).join("|") === KOPF_SOLL.join("|"));
t("[#59] die SVG-Exportdatei traegt die Einheit mm und die entfernten Angaben nicht",
  svgFelder(svgDateiK).find((p) => p[0] === "Einheit")[1] === "mm"
  && svgFelder(svgDateiK).find((p) => p[0] === "Planinhalt")[1] === "Lageplan (Draufsicht)"
  && !/Bauherrschaft Muster|POLYCARE|LP 3|A3 quer/.test(svgDateiK));
t("[#59] auch in der SVG-Datei bleiben leere Felder platzhalterfrei — sie entfallen",
  (() => { const s = LP.lageplanSvgDatei(daten0);
    return !/###/.test(s) && !/Plan Nr\.: (·|<)/.test(s) && !/Index: (·|<)/.test(s)
      && !/undefined/.test(s) && svgFelder(s).map((p) => p[0]).join("|")
         === KOPF_SOLL.filter((x) => x !== "Plan Nr." && x !== "Index").join("|"); })());
t("[#59] Blatt und SVG-Datei kommen aus EINER Feldquelle (kopfFelder)",
  (() => { const f = LP.kopfFelder({ ...daten, _passt: blatt.passt }, blatt.masstab);
    return f.map((x) => x.k).join("|") === KOPF_SOLL.join("|")
      && JSON.stringify(kopfPaare(blatt.html)) === JSON.stringify(f.map((x) => [x.k, x.v])); })());
// [#64] bleibt: die Einheit steht je Ausgabe GENAU EINMAL als Feld — gezaehlt wird das
// Feld, nicht die Zeichenkette „mm" (die steht auch in width=/height= der SVG-Datei).
t("[#64] das Blatt fuehrt die Einheit genau einmal, die SVG-Datei ebenso",
  kopfPaare(blatt.html).filter((p) => p[0] === "Einheit").length === 1
  && svgFelder(svgDateiK).filter((p) => p[0] === "Einheit").length === 1
  && kopfPaare(LP.lageplanDokument(daten)).filter((p) => p[0] === "Einheit").length === 1);
// [#64]: die Einheit steht GENAU EINMAL im Schriftfeld — und nur dort.
const einheitFelder = [...blatt.html.matchAll(
  /<div class="lptb-row"><div class="k">Einheit<\/div><div class="v[^"]*">([^<]*)<\/div><\/div>/g)];
t("[#64] das vollstaendige Blatt hat genau ein Schriftfeld „Einheit“ = mm",
  einheitFelder.length === 1 && einheitFelder[0][1] === "mm");
t("[#64] auch im vollstaendigen Blatt ist kein Masstext mit Einheit beschriftet",
  massTexte(blatt.svg).length > 0
  && massTexte(blatt.svg).every((x) => !/\s(?:mm|cm|m)$/.test(x)));
t("[N-6] Projekt, Gebaeude und Geschoss stehen als Blattbezug darin",
  /Pruefprojekt/.test(blatt.html) && /Haus A/.test(blatt.html) && />EG</.test(blatt.html));
// [L-11]: genau EINE Quelle. Ein nur am Wandelement vorhandenes `eingaben.projekt`
// darf im Lageplan NICHT erscheinen — sonst gaebe es eine zweite, scheinbar echte Quelle.
const datenFremd = LP.lageplanDaten({
  mappe: MAPPE0, geschossId: gsEG,
  elemente: ELEMENTE.map((e) => ({ ...e, eingaben: { projekt: { bauherr: "FALSCHE QUELLE" } } })),
});
t("[L-11] `eingaben.projekt` am Wandelement wird nicht herangezogen",
  !/FALSCHE QUELLE/.test(LP.blattHtml(datenFremd).html));
t("[N-6] ein fehlendes Kopfdatenfeld bleibt leer, statt geraten zu werden",
  (() => {
    const m2 = MAPPE.leereMappe("Ohne Kopf");
    const d2 = LP.lageplanDaten({ mappe: m2, geschossId: m2.gebaeude[0].geschosse[0].id, elemente: [] });
    return d2.kopfdaten.bauherr === undefined && !/undefined/.test(LP.blattHtml(d2).html);
  })());

// --- [N-7] unvollstaendiger Stand wird konkret benannt ---------------------

let mKrumm = MAPPE.setzeWand(MAPPE0, gsEG, { id: "w-frei", name: "Wand ohne Lage", lage: null });
// Widerspruch: derselbe Abstand zweimal, mit verschiedenen Werten ([K-6]).
mKrumm = MAPPE.setzeBemassung(mKrumm, gsEG, { id: "bm-streit", achse: "y",
  von: { wand: "w-a", bezug: "max" }, bis: { wand: "w-b", bezug: "max" }, mass_mm: 2500 });
// Kollision: eine Wand quer durch die beiden x-Waende ([K-13]).
mKrumm = MAPPE.setzeWand(mKrumm, gsEG, { id: "w-koll", name: "Wand Kollision",
  lage: { start_mm: { x: 500, y: 500 }, richtung: "y", laenge_grid: 30 } });
const datenK = LP.lageplanDaten({ mappe: mKrumm, geschossId: gsEG, elemente: ELEMENTE });
const arten = datenK.meldungen.map((x) => x.art);
const text = datenK.meldungen.map((x) => x.text).join(" | ");
t("[N-7] die unverortete Wand wird namentlich benannt",
  arten.includes("unverortet") && /Wand ohne Lage/.test(text));
t("[N-7] der verwaiste Eintrag wird namentlich benannt ([L-4])",
  arten.includes("verwaist") && /Wand D/.test(text));
t("[N-7] der Widerspruch wird mit Differenz in mm benannt ([K-6])",
  arten.includes("widerspruch") && /500 mm/.test(text));
t("[N-7] die Kollision wird mit Ueberlappungsmass benannt ([K-13])",
  arten.includes("kollision") && /Wand Kollision/.test(text) && /125/.test(text));
t("[N-7] der Stand gilt damit als NICHT vollstaendig", datenK.vollstaendig === false);
t("[N-7] das Blatt sagt das sichtbar — im Schriftfeld-Feld „Stand“",
  /nicht vollständig/i.test(LP.blattHtml(datenK).html));
// [#73]: der fruehere Block „Vollstaendigkeit" unter der Wandliste ist ersatzlos
// entfallen — samt Erfolgs-, Warn- und Hinweistexten. [N-7] bleibt Aussagewahrheit:
// Stand im Schriftfeld, `meldungen`/`hinweise` weiter in der Ableitung.
const blockSpuren = /lpmeld|>Vollständigkeit<|Dieser Lageplan ist nicht vollständig|Hinweise \(kein Mangel\)|Vollständig: alle eingetragenen|Vollständig: keine offenen/;
t("[#73] der Block Vollstaendigkeit fehlt im unvollstaendigen Blatt vollstaendig",
  !blockSpuren.test(LP.blattHtml(datenK).html));
t("[#73] auch das vollstaendige Blatt traegt keinen Erfolgs-/Hinweistext mehr",
  !blockSpuren.test(LP.blattHtml(datenOG).html)
  && !blockSpuren.test(LP.lageplanDokument(datenK))
  && !blockSpuren.test(LP.lageplanSvgDatei(datenK)));
t("[#73] entfallen ist NUR die Vollstaendigkeit — Wandliste und Darstellung bleiben",
  [LP.blattHtml(datenK).html, LP.blattHtml(datenOG).html].every((s) =>
    s.includes("<h4>Wände im Geschoss</h4>") && s.includes("<h4>Darstellung</h4>")
    && s.includes(LP.legendeHtml()) && !/>Vollständigkeit</.test(s)));
t("[#73] die Ableitung selbst bleibt unveraendert — Meldungen und Hinweise stehen weiter darin",
  datenK.meldungen.length > 0 && Array.isArray(datenK.hinweise)
  && typeof datenK.vollstaendig === "boolean");
t("[N-7] ein sauberer Stand wird als vollstaendig ausgegeben und meldet nichts Falsches",
  datenOG.vollstaendig === true && datenOG.meldungen.length === 0
  && !/nicht vollständig/i.test(LP.blattHtml(datenOG).html));
// Eine verortete, aber in keiner Achse bemasste Wand ist nach [K-8] „frei" — der
// Normalfall vor dem Bemassen und ausdruecklich KEIN Fehler des Lageplans. Sie steht
// deshalb als HINWEIS und macht das Blatt nicht unvollstaendig.
t("[K-8] eine unbestimmte Wand ist ein Hinweis, kein Mangel des Blattes",
  datenOG.hinweise.some((x) => x.art === "unbestimmt" && /Wand OG/.test(x.text))
  && datenOG.vollstaendig === true);
t("[N-7] eine Laengenabweichung Lage ↔ Wandelement wird gemeldet ([L-3])",
  daten.meldungen.some((x) => x.art === "laenge" && /Wand C/.test(x.text)));
t("[N-7] verwaister Eintrag und Laengenabweichung machen das EG-Blatt unvollstaendig",
  daten.vollstaendig === false
  && daten.meldungen.map((x) => x.art).sort().join(",") === "laenge,verwaist");
t("[K-7] eine redundante Bemassung ist ebenfalls nur ein Hinweis",
  (() => {
    const mR = MAPPE.setzeBemassung(MAPPE0, gsEG, { id: "bm-3", achse: "y",
      von: { wand: "w-a", bezug: "max" }, bis: { wand: "w-b", bezug: "max" }, mass_mm: 3000 });
    const dR = LP.lageplanDaten({ mappe: mR, geschossId: gsEG, elemente: ELEMENTE });
    return dR.hinweise.some((x) => x.art === "redundanz")
      && !dR.meldungen.some((x) => x.art === "redundanz");
  })());

// --- [N-8] genau ein Blatt, eigene Massstabsreihe, nie beschneiden ---------

t("[N-8] die Massstabsreihe ist die des Bauzeichnens",
  LP.MASSSTAEBE.join(",") === "50,100,200,250,500");
t("[N-8] gewaehlt wird der groesste Massstab, in dem das Geschoss ins Feld passt",
  LP.waehleMasstab(5000, 4000, "a3") === 50 && LP.waehleMasstab(20000, 4000, "a3") === 100);
t("[N-8] ein zu grosses Geschoss bleibt bei 1:500 und wird als zu gross gemeldet",
  (() => {
    let mGross = MAPPE.setzeWand(MAPPE0, gsEG, { id: "w-lang", name: "Sehr lange Wand",
      lage: { start_mm: { x: 0, y: 60000 }, richtung: "x", laenge_grid: 3000 } });
    const dG = LP.lageplanDaten({ mappe: mGross, geschossId: gsEG, elemente: ELEMENTE });
    const sG = LP.lageplanSvg(dG);
    return sG.masstab === 500 && sG.passt === false
      && dG.waende.some((w) => w.id === "w-lang")
      && /zu groß/i.test(LP.blattHtml(dG).html);
  })());
t("[N-8] auch dann wird nichts beschnitten — jede Wand steht im Blatt",
  (() => {
    let mGross = MAPPE.setzeWand(MAPPE0, gsEG, { id: "w-lang", name: "Sehr lange Wand",
      lage: { start_mm: { x: 0, y: 60000 }, richtung: "x", laenge_grid: 3000 } });
    const s = LP.lageplanSvg(LP.lageplanDaten({ mappe: mGross, geschossId: gsEG, elemente: ELEMENTE }));
    return ["w-a", "w-b", "w-c", "w-d", "w-lang"].every((id) => s.svg.includes(`data-wand="${id}"`));
  })());
t("[N-8] das Blatt traegt genau EINEN Blattrahmen (keine Kachelung)",
  (blatt.html.match(/class="lpsheet/g) || []).length === 1);
t("[N-8] das Blatt nennt seinen Massstab", /1 : /.test(blatt.html));

// --- Muss 9/10: eine Ableitung, selbsttragende Ausgabe --------------------

t("Muss 9: Blatt und Zeichnung nutzen dieselbe Ableitung (bitgenau dasselbe SVG)",
  blatt.svg === LP.lageplanSvg(daten, blatt.optionen).svg);
const dok = LP.lageplanDokument(daten);
t("Muss 10: das Dokument ist selbsttragendes, druckbares HTML",
  /^<!DOCTYPE html>/.test(dok) && dok.includes(LP.LAGEPLAN_CSS) && /@page/.test(dok)
  && dok.includes(blatt.svg));
const svgDatei = LP.lageplanSvgDatei(daten);
t("Muss 10: die SVG-Datei ist eigenstaendig und in Papier-Millimetern",
  /^<\?xml/.test(svgDatei) && /width="[\d.]+mm"/.test(svgDatei) && /height="[\d.]+mm"/.test(svgDatei));
t("Muss 10: die SVG-Datei nennt Projekt, Geschoss und Massstab fuer sich lesbar",
  /Pruefprojekt/.test(svgDatei) && /EG/.test(svgDatei) && /1 : /.test(svgDatei));
t("die Dateinamen sind aus der Auswahl abgeleitet und ohne Sonderzeichen",
  /^SEMBLA_Lageplan_Pruefprojekt_EG$/.test(LP.dateiRumpf(daten)));

// --- Optionen sind reine Darstellung -------------------------------------

t("Optionen: Standard ist A3 mit Bemassung und Wandkennzeichnung",
  LP.standardOptionen().format === "a3" && LP.standardOptionen().masse === true
  && LP.standardOptionen().kennzeichnung === true);
t("Optionen: unbekannte Werte fallen auf den Standard zurueck",
  LP.normOptionen({ format: "a0" }).format === "a3");
t("Optionen: ohne Bemassung verschwinden die Masse — die Waende bleiben",
  (() => { const s = LP.lageplanSvg(daten, { masse: false });
    return !s.svg.includes('data-bemassung="bm-1"') && s.svg.includes('data-wand="w-a"'); })());
// Geprueft wird die BESCHRIFTUNG (die Nummernblase), nicht der `<title>`-Tooltip
// der Wand: der bleibt bewusst stehen, damit die Wand identifizierbar bleibt.
t("Optionen: ohne Wandkennzeichnung fehlt die Nummernblase, nicht die Wand",
  (() => { const s = LP.lageplanSvg(daten, { kennzeichnung: false });
    return markerVon(s.svg).length === 0 && s.svg.includes('data-wand="w-a"')
      && markerVon(LP.lageplanSvg(daten).svg).length === 4; })());

// --- Determinismus und Reinheit ------------------------------------------

t("[K-5] gleicher Stand ⇒ bitgenau gleiches Blatt",
  LP.blattHtml(daten).html === LP.blattHtml(daten).html
  && LP.blattHtml(LP.lageplanDaten({ mappe: MAPPE0, geschossId: gsEG, elemente: ELEMENTE })).html
     === blatt.html);

const quelle = readFileSync(new URL("../../docs/shared/sembla-lageplan.js", import.meta.url), "utf8");
t("das Modul ist DOM-frei", !/document\.|window\.|localStorage|indexedDB/.test(quelle));
// Geprueft werden die IMPORTE, nicht die Prosa: seit #80 nennt der Kopfkommentar
// `sembla-plan.js` ausdruecklich als die Stelle, an der der Planrahmen gerechnet wird —
// genau das ist der Punkt. Der Bildspeicher bleibt draussen, ebenso jeder dynamische
// Import: kein Bildspeicher, keine eigene Massstabsrechnung.
t("das Modul bindet den Planbaustein nicht ein und importiert nichts dynamisch (Nicht-Ziele)",
  !/from\s+["'][^"']*sembla-plan\.js["']/.test(quelle)
  && !/import\s*\(/.test(quelle));
// #79: aus `storage.js` kommt GENAU EINE Sache — der reine Normalisierer
// `normBrandklasse`. Er traegt die kanonischen Werte F0/F30 samt Standard F0 und ist
// selbst kein Speicherzugriff; eine zweite Werteliste hier waere genau die Drift, die
// die kanonische Stelle verhindert. Geprueft wird deshalb nicht mehr pauschal „kein
// storage.js", sondern eng: ein einziger Import, und der holt nichts anderes.
const storageImporte = [...quelle.matchAll(
  /import\s*([^;]*?)\s*from\s*["'][^"']*storage\.js["']/g)];
t("#79 aus dem Speicher kommt genau EIN Import — und der holt nur normBrandklasse",
  storageImporte.length === 1 && storageImporte[0][1].trim() === "{ normBrandklasse }");
// Geprueft wird der CODE, nicht die Prosa: der Kopfkommentar von `lageplanDaten`
// nennt `listeElemente()` als die Form der uebergebenen Liste — das ist eine
// Erklaerung und kein Aufruf. Kommentare werden deshalb vorher entfernt.
const codeOhneKommentar = quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
t("das Modul greift auf keine Lese-/Schreibfunktion des Speichers zu",
  !/\b(listeElemente|holeElement|holeEingaben|holeMappe|projektMappe|abonniere)\s*\(/
    .test(codeOhneKommentar));
t("das Modul schreibt nichts (keine setz-/aendere-Aufrufe der Mappe)",
  !/setzeWand|setzeBemassung|setzeLage|aendereMappe|setzePlan|speichere/.test(quelle));
t("Anti-Drift: das Blatt rechnet die Massgeometrie nicht selbst",
  /sembla-massbild\.js/.test(quelle) && !/MASS_ABSTAND_MM\s*=\s*\d/.test(quelle));

// --- #84 Vorder-/Rueckseite: identische Kanten in Ableitung, Blatt und Export

{
  // Ein Stand mit Altstand-Wand (ohne Orientierung, liest sich als +x), einer
  // ausdruecklich gewendeten y-Wand (-y) und einer unverorteten Wand.
  const { m, gsEG } = bau();
  let n = MAPPE.setzeLage(m, "w-c",
    { start_mm: { x: 62.5, y: 1125 }, richtung: "y", orientierung: "-y", laenge_grid: 23 });
  n = MAPPE.setzeWand(n, gsEG, { id: "w-u", name: "Wand U", lage: null });
  const daten = LP.lageplanDaten({ mappe: n, geschossId: gsEG, elemente: [] });
  const wa = daten.waende.find((w) => w.id === "w-a");
  const wc = daten.waende.find((w) => w.id === "w-c");
  const wu = daten.waende.find((w) => w.id === "w-u");

  t("#84 Altstand ohne Orientierung liest sich deterministisch als +Achse",
    wa.orientierung === "+x");
  t("#84 eine ausdrueckliche Orientierung bleibt erhalten", wc.orientierung === "-y");
  t("#84 die Seiten kommen aus DERSELBEN Ableitung wie im Editor (CON.wandSeiten)",
    JSON.stringify(wa.seiten) === JSON.stringify(
      CON.wandSeiten(MAPPE.findeWand(n, "w-a").wand.lage, daten.ergebnis.positionen["w-a"]))
    && JSON.stringify(wc.seiten) === JSON.stringify(
      CON.wandSeiten(MAPPE.findeWand(n, "w-c").wand.lage, daten.ergebnis.positionen["w-c"])));
  t("#84 +x-Wand: Vorderkante = Laengskante mit groesserem y (Konvention)",
    wa.seiten.vorder.a.y === 1125 && wa.seiten.rueck.a.y === 1000);
  t("#84 -y-Wand: Vorderkante = Laengskante mit groesserem x",
    wc.seiten.vorder.a.x === 125 && wc.seiten.rueck.a.x === 0);
  t("#84 eine unverortete Wand bekommt KEINE erfundene Seite",
    wu.seiten === null && wu.orientierung === null);

  const z = LP.lageplanSvg(daten, {});
  const verortet = daten.waende.filter((w) => w.rechteck).length;
  t("#84 das Blatt zeichnet je verorteter Wand genau eine Vorder- und eine Rueckkante",
    (z.svg.match(/class="lpseite lpseite-vorder"/g) || []).length === verortet
    && (z.svg.match(/class="lpseite lpseite-rueck"/g) || []).length === verortet);
  t("#84 die V/R-Kennbuchstaben stehen im Blatt — Kennzeichnung nie nur Farbe",
    /class="lpseite-kz"[^>]*>V</.test(z.svg) && /class="lpseite-kz"[^>]*>R</.test(z.svg));
  t("#84 der Wandknoten traegt die kanonische Orientierung als data-Attribut",
    /data-orientierung="\+x"/.test(z.svg) && /data-orientierung="-y"/.test(z.svg));
  t("#84 die Legende nennt beide Seiten mit Kennbuchstabe UND Kennfarbe",
    LP.legendeHtml().includes("Vorderseite der Wand")
    && LP.legendeHtml().includes("Rückseite der Wand")
    && LP.legendeHtml().includes(CON.SEITEN.vorder.farbe)
    && LP.legendeHtml().includes(CON.SEITEN.rueck.farbe));

  // Vorschau und Export sind derselbe Pfad: exakt dieselben Kantenzeilen.
  const kante = (z.svg.match(/<line class="lpseite lpseite-vorder"[^>]*\/>/g) || [])[0];
  const doc = LP.lageplanDokument(daten, {});
  const svgDatei = LP.lageplanSvgDatei(daten, {});
  t("#84 Export-HTML und Export-SVG tragen bit-genau dieselben V/R-Kanten wie die Vorschau",
    !!kante && doc.includes(kante) && svgDatei.includes(kante)
    && doc.includes("Vorderseite der Wand"));

  // Widerspruechliche Orientierung: benannt gemeldet, nie still umgedeutet.
  const kaputt = JSON.parse(JSON.stringify(n));
  kaputt.gebaeude[0].geschosse[0].waende.find((w) => w.id === "w-a").lage.orientierung = "+y";
  const d2 = LP.lageplanDaten({ mappe: kaputt, geschossId: gsEG, elemente: [] });
  t("#84 eine zur Achse widerspruechliche Orientierung wird benannt gemeldet",
    d2.meldungen.some((x) => /widerspricht der Achse/.test(x.text))
    && d2.waende.find((w) => w.id === "w-a").seiten === null
    && d2.vollstaendig === false);
}

// --- [K-4]/#76: der verschobene Geschossursprung -------------------------
{
  const { m, gsEG } = bau();
  // Der Blattinhalt liegt bei y ≥ 1000 mm: 0/0 faellt also aus der Ausdehnung,
  // dieser Punkt liegt mittendrin. Genau daran ist zu sehen, dass die Zeichnung
  // den GESPEICHERTEN Punkt prueft und nicht mehr die feste Null.
  const U = { x: 500, y: 1500 };
  const mU = MAPPE.setzeUrsprung(m, gsEG, U);

  const d0 = LP.lageplanDaten({ mappe: m, geschossId: gsEG, elemente: [] });
  const dU = LP.lageplanDaten({ mappe: mU, geschossId: gsEG, elemente: [] });

  t("#76 die Ableitung traegt den gespeicherten Ursprung",
    d0.ursprung.x === 0 && dU.ursprung.x === 500 && dU.ursprung.y === 1500);

  // Ohne Ursprungsmass hängt keine Wand am Ursprung — die Lagen sind also von
  // ihm unabhaengig und muessen bitgenau gleich bleiben ([L-1]).
  t("#76 [L-1] das Verschieben des Ursprungs bewegt keine Wandlage",
    JSON.stringify(d0.waende.map((w) => w.rechteck))
    === JSON.stringify(dU.waende.map((w) => w.rechteck)));

  // Das Blatt: das Kreuz steht an SEINER Stelle, nicht mehr fest bei 0/0.
  const svg0 = LP.lageplanSvg(d0).svg, svgU = LP.lageplanSvg(dU).svg;
  t("#76 der gespeicherte Ursprung wird an seiner Stelle gezeichnet",
    /class="lpursprung"/.test(svgU));
  t("#76 die Beschriftung bleibt „0/0“ — sie benennt den Nullpunkt des Massystems",
    />0\/0</.test(svgU));

  // Ursprungsausdehnung: geprueft wird gegen die tatsaechliche Ausdehnung des
  // Blattinhalts — der Punkt 0/0 liegt hier ausserhalb und wird nicht gezeichnet.
  t("#76 ein Ursprung ausserhalb des Blattinhalts wird nicht gezeichnet",
    !/class="lpursprung"/.test(svg0));
  t("#76 die Ausdehnung des Blattinhalts bleibt vom Ursprung unberuehrt "
    + "(der Massstab aendert sich nicht, [N-8])",
    JSON.stringify(LP.ausdehnung(dU)) === JSON.stringify(LP.ausdehnung(d0))
    && LP.lageplanSvg(dU).masstab === LP.lageplanSvg(d0).masstab);

  // [N-5]: Editor und Blatt rechnen dieselbe Massgeometrie — inklusive Ursprung.
  {
    let mm = MAPPE.setzeBemassung(mU, gsEG, { id: "bm-u", achse: "y",
      von: null, bis: { wand: "w-a", bezug: "min" }, mass_mm: 500 });
    const d = LP.lageplanDaten({ mappe: mm, geschossId: gsEG, elemente: [] });
    const gs = MAPPE.findeGeschoss(mm, gsEG).geschoss;
    const erg = CON.pruefeGeschoss(gs.waende, gs.bemassungen, gs.ursprung_mm);
    const ctx = MB.massKontext(gs.waende, erg, gs.ursprung_mm);
    const eigen = MB.massTextLayout(gs.bemassungen.map((b, i) => MB.massGeometrie(b, i, ctx)));
    t("#76 [N-5] die Massgeometrie des Blattes ist bitgenau die gemeinsame",
      JSON.stringify(d.massbilder) === JSON.stringify(eigen));
    const gU = d.massbilder[gs.bemassungen.findIndex((b) => b.id === "bm-u")];
    // Achse y: laengs steht der Ursprung auf U.y, quer auf U.x.
    t("#76 [N-5] das Ursprungsmass beginnt am verschobenen Ursprung",
      gU.v1 === 1500 && gU.q1 === 500);
    t("#76 [K-4] das Ursprungsmass bestimmt die Wand gegen den gespeicherten Punkt",
      erg.bestimmt["w-a"].y === true
      && d.waende.find((w) => w.id === "w-a").rechteck.y_min === 2000);
  }

  // Muss 9: Vorschau und Export gehen denselben Weg — an den BYTES geprueft.
  {
    const dateien = LP.lageplanDateien(dU);
    const svg = dateien.find((f) => /\.svg$/.test(f.name));
    t("#76 auch die exportierten Bytes tragen den verschobenen Ursprung",
      !!svg && /class="lpursprung"/.test(svg.data) && />0\/0</.test(svg.data));
    t("#76 Export und Vorschau sind derselbe Pfad (Muss 9)",
      svg.data === LP.lageplanSvgDatei(dU)
      && !/class="lpursprung"/.test(LP.lageplanDateien(d0).find((f) => /\.svg$/.test(f.name)).data));
  }
}

// --- #80/[N-9]: der kalibrierte Geschossplan als Hintergrund --------------
//
// Der Rahmen kommt NICHT aus diesem Modul: gerechnet hat ihn `planRahmenMm()` in
// `sembla-plan.js` aus dem GESPEICHERTEN `mm_je_pixel` und Versatz des Planblocks —
// genau derselbe Weg, den die Seite geht. Geprueft wird deshalb hier gegen diese
// kanonische Rechnung und nicht gegen nachgerechnete Zahlen.
{
  const PLAN = await import("../../docs/shared/sembla-plan.js");
  const BILD = { breite_px: 800, hoehe_px: 600 };
  const PLANBLOCK = { datei: "grundriss.png", typ: "image/png", ...BILD,
    mm_je_pixel: 12.5, versatz_x_mm: -1500, versatz_y_mm: -250 };
  const URL_PNG = "data:image/png;base64,iVBORw0KGgo=";

  const { m, gsEG } = bau();
  const mitPlan = MAPPE.setzePlan(m, gsEG, PLANBLOCK);
  const plan = MAPPE.findeGeschoss(mitPlan, gsEG).geschoss.plan;
  const rahmen = PLAN.planRahmenMm(plan, BILD);
  const hg = { status: "gesetzt", url: URL_PNG, name: plan.datei, mm_je_pixel: rahmen.mm_je_pixel,
    x: rahmen.x, y: rahmen.y, breite: rahmen.breite, hoehe: rahmen.hoehe };

  const dOhne = LP.lageplanDaten({ mappe: mitPlan, geschossId: gsEG, elemente: ELEMENTE });
  const dMit = LP.lageplanDaten({ mappe: mitPlan, geschossId: gsEG, elemente: ELEMENTE,
    hintergrund: hg });
  const zMit = LP.lageplanSvg(dMit, { transparenz: 40 });
  const blattMit = LP.blattHtml(dMit, { transparenz: 40 });

  /** Das Bildelement des Blattes (Papier-mm). */
  const bildVon = (s) => {
    const m2 = /<g class="lpbg">([\s\S]*?)<\/g>/.exec(s);
    if (!m2) return null;
    const i = /<image ([^>]*)\/>/.exec(m2[1]);
    if (!i) return null;
    const attr = (n) => (new RegExp(`\\b${n}="([^"]*)"`).exec(i[1]) || [, null])[1];
    return { href: attr("href"), x: +attr("x"), y: +attr("y"),
      breite: +attr("width"), hoehe: +attr("height"),
      opacity: attr("opacity"), clip: attr("clip-path"), roh: m2[0] };
  };

  const bild = bildVon(zMit.svg);
  // Erwartete Papier-mm: derselbe Weg wie die Wandgeometrie — PAD_MM + (Welt − Rand) / Massstab.
  const a = LP.ausdehnung(dMit, { masse: true });
  const erwX = LP.PAD_MM + (rahmen.x - a.x_min) / zMit.masstab;
  const erwY = LP.PAD_MM + (rahmen.y - a.y_min) / zMit.masstab;
  const nah = (p, q) => Math.abs(p - q) < 0.002;

  t("#80 der Hintergrund steht mit dem GESPEICHERTEN Massstab und Versatz im Blatt",
    !!bild && bild.href === URL_PNG
    && nah(bild.x, erwX) && nah(bild.y, erwY)
    && nah(bild.breite, (BILD.breite_px * PLANBLOCK.mm_je_pixel) / zMit.masstab)
    && nah(bild.hoehe, (BILD.hoehe_px * PLANBLOCK.mm_je_pixel) / zMit.masstab));
  t("#80 die gesetzte Transparenz steht als Deckkraft am Bild (40 % ⇒ 0,6)",
    bild.opacity === "0.6" && bild.clip === "url(#lpbg-clip)");
  t("#80 der Hintergrund liegt VOR allen Wand-, Seiten-, Marker- und Massknoten",
    (() => {
      const i = zMit.svg.indexOf('<g class="lpbg">');
      return i >= 0 && ['<g class="lpwand', '<g class="lpseiten', '<g class="lpmarker',
        '<g class="lpmass'].every((k) => zMit.svg.indexOf(k) > i);
    })());
  t("#80 im Blatt liegt er auch vor dem Schriftfeld",
    blattMit.html.indexOf('<g class="lpbg">') < blattMit.html.indexOf('class="lptitleblock"'));
  t("#80 Wandgeometrie und Massstab bleiben vom Hintergrund unberuehrt ([N-8])",
    zMit.masstab === LP.lageplanSvg(dOhne, { transparenz: 40 }).masstab
    && JSON.stringify(LP.ausdehnung(dMit)) === JSON.stringify(LP.ausdehnung(dOhne))
    && JSON.stringify(dMit.waende.map((w) => w.rechteck))
       === JSON.stringify(dOhne.waende.map((w) => w.rechteck)));
  t("#80 der gezeichnete Hintergrund ist kein Mangel und kein Hinweis",
    dMit.vollstaendig === dOhne.vollstaendig
    && !dMit.hinweise.some((h) => h.art === "planhintergrund"));
  t("#80 das Blatt benennt den Hintergrund samt Transparenz",
    /<h4>Planhintergrund<\/h4>/.test(blattMit.html)
    && /40 % Transparenz/.test(blattMit.html) && /grundriss\.png/.test(blattMit.html));

  // Muss: Vorschau, Druck-HTML und SVG-Datei zeigen dasselbe Bildelement — bitgenau.
  const dok = LP.lageplanDokument(dMit, { transparenz: 40 });
  const svgD = LP.lageplanSvgDatei(dMit, { transparenz: 40 });
  t("#80 Blatt, Druck-HTML und SVG-Datei tragen bit-genau dasselbe Bildelement",
    dok.includes(bild.roh) && svgD.includes(bild.roh)
    && JSON.stringify(bildVon(svgD)) === JSON.stringify(bildVon(zMit.svg)));
  t("#80 die SVG-Datei ist eigenstaendig — die Bilddaten stecken als Data-URL darin",
    svgD.includes("data:image/png;base64,") && !/href="blob:/.test(svgD));

  // Transparenz: ganzzahlig, geklemmt, 100 % = kein Bild.
  t("#80 die Transparenz ist ganzzahlig und auf 0…100 geklemmt",
    LP.normOptionen({ transparenz: 150 }).transparenz === 100
    && LP.normOptionen({ transparenz: -20 }).transparenz === 0
    && LP.normOptionen({ transparenz: 33.6 }).transparenz === 34
    && LP.normOptionen({ transparenz: "abc" }).transparenz === LP.TRANSPARENZ_STANDARD
    && LP.standardOptionen().transparenz === LP.TRANSPARENZ_STANDARD);
  t("#80 bei 0 % Transparenz ist das Bild deckend",
    bildVon(LP.lageplanSvg(dMit, { transparenz: 0 }).svg).opacity === "1");
  t("#80 bei 100 % Transparenz entfaellt das Bild vollstaendig",
    bildVon(LP.lageplanSvg(dMit, { transparenz: 100 }).svg) === null
    && !LP.lageplanSvgDatei(dMit, { transparenz: 100 }).includes("data:image/png"));
  t("#80 das Blatt sagt es, wenn der Hintergrund auf 100 % ausgeblendet ist",
    /ausgeblendet/.test(LP.blattHtml(dMit, { transparenz: 100 }).html));

  // Ausfaelle: unkalibriert, Bild fehlt, unbrauchbar — benannt, kein Hintergrund,
  // KEIN Mangel: die Vollstaendigkeit bleibt die des Blattes ohne Plan ([N-7]).
  const ohneMassstab = MAPPE.setzePlan(m, gsEG, { ...PLANBLOCK, mm_je_pixel: null });
  const planUnkal = MAPPE.findeGeschoss(ohneMassstab, gsEG).geschoss.plan;
  t("#80 ein unkalibrierter Plan liefert gar keinen Rahmen (kein Ersatzmassstab)",
    PLAN.planRahmenMm(planUnkal, BILD) === null);

  for (const [status, muster] of [["nicht_kalibriert", /kein Maßstab gesetzt/],
    ["bild_fehlt", /kein Bild/], ["unbrauchbar", /unbrauchbar/]]) {
    const d = LP.lageplanDaten({ mappe: mitPlan, geschossId: gsEG, elemente: ELEMENTE,
      hintergrund: { status } });
    const b = LP.blattHtml(d, { transparenz: 40 });
    t(`#80 ${status}: kein Hintergrund, Grund benannt, Blatt sonst vollstaendig`,
      d.hintergrund.status === status && d.hintergrund.url === null
      && !b.svg.includes('<g class="lpbg">')
      && muster.test(b.html) && /<h4>Planhintergrund<\/h4>/.test(b.html)
      && d.hinweise.some((h) => h.art === "planhintergrund" && muster.test(h.text))
      && d.vollstaendig === dOhne.vollstaendig
      && b.html.includes(LP.wandTabelleHtml(d)) && b.html.includes(LP.legendeHtml()));
  }
  t("#80 als gesetzt uebergeben, aber ohne Bilddaten ⇒ unbrauchbar statt geraten",
    LP.normHintergrund({ status: "gesetzt", x: 0, y: 0, breite: 100, hoehe: 100 }).status
      === "unbrauchbar"
    && LP.normHintergrund({ status: "gesetzt", url: URL_PNG, x: 0, y: 0, breite: 0, hoehe: 100 })
      .status === "unbrauchbar"
    && LP.normHintergrund({ status: "erfunden" }).status === "unbrauchbar");
  t("#80 ohne hinterlegten Plan bleibt das Blatt bitgenau das bisherige",
    LP.normHintergrund(null).status === "keiner"
    && !LP.blattHtml(dOhne, { transparenz: 40 }).html.includes("Planhintergrund")
    && LP.blattHtml(dOhne, { transparenz: 40 }).html
       === LP.blattHtml(LP.lageplanDaten({ mappe: m, geschossId: gsEG, elemente: ELEMENTE }),
         { transparenz: 40 }).html);
  t("#80 das Modul rechnet den Massstab des Bildes nicht selbst (kein zweiter Weg)",
    !/mm_je_pixel\s*[*/]|breite_px|hoehe_px/.test(quelle));
}

// --- #79: Brandschutzklassifikation F0/F30 im Blatt -----------------------
//
// Die Klassifikation ist eine reine PLANUNGSKENNZEICHNUNG am Wandelement mit Modul 1
// als einzigem Schreibweg. Modul 9 liest sie ueber DIESELBE Bahn wie Hoehe und
// Wandtyp und normalisiert sie mit `normBrandklasse` (kanonisch in storage.js):
// fehlendes oder unbekanntes Feld ⇒ F0, kein Wandelement ⇒ gar keine Angabe.
// Dargestellt wird sie so, dass die Unterscheidung OHNE Farbe traegt.
{
  const { m, gsEG } = bau();
  const el = [
    // ausdruecklich F30
    { id: "w-a", name: "Wand A",
      wandelement: { height_mm: 2600, wandtyp: "mit_wind", length_mm: 2000, brandklasse: "F30" } },
    // Feld fehlt ganz (Altbestand/Neuanlage) ⇒ F0
    { id: "w-b", name: "Wand B",
      wandelement: { height_mm: 2600, wandtyp: "ohne_wind", length_mm: 2000 } },
    // unbekannter Wert ⇒ F0, nie F30 und nie „geprueft"
    { id: "w-c", name: "Wand C",
      wandelement: { height_mm: 2600, wandtyp: "mit_wind", length_mm: 2875, brandklasse: "f30" } },
    // w-d hat ABSICHTLICH kein Wandelement — verwaist ([L-4])
  ];
  const d = LP.lageplanDaten({ mappe: m, geschossId: gsEG, elemente: el });
  const bkVon = (id) => d.waende.find((w) => w.id === id).brandklasse;

  t("#79 die Ableitung fuehrt die ausdrueckliche Klassifikation als eigenes Feld",
    bkVon("w-a") === "F30");
  t("#79 ein Wandelement ohne das Feld gilt als F0 (Standard, nie F30)",
    bkVon("w-b") === "F0" && !("brandklasse" in el[1].wandelement));
  t("#79 ein unbekannter Wert faellt ebenfalls auf F0 — normalisiert, nicht geraten",
    bkVon("w-c") === "F0");
  t("#79 eine verwaiste Wand bekommt KEINE erfundene Klassifikation",
    d.waende.find((w) => w.id === "w-d").verwaist === true && bkVon("w-d") === null);

  // --- Darstellung: zwei Merkmale, davon eines ohne jede Farbe ------------
  const z = LP.lageplanSvg(d, {});
  /** Die `lpbrand`-Gruppen des Blattes: Kennung, Klasse, Inhalt und Rohtext. */
  const brandGruppen = (s) => [...s.matchAll(
    /<g class="lpbrand" data-wand="([^"]*)" data-brandklasse="([^"]*)">([\s\S]*?)<\/g>/g)]
    .map((mm) => ({ id: mm[1], klasse: mm[2], inhalt: mm[3], roh: mm[0] }));
  const bg = brandGruppen(z.svg);
  const gA = bg.find((g) => g.id === "w-a"), gB = bg.find((g) => g.id === "w-b");

  t("#79 jede verortete Wand mit Wandelement traegt ihre Klassifikation im Plan",
    bg.length === 3 && bg.map((g) => g.id + ":" + g.klasse).join(",")
      === "w-a:F30,w-b:F0,w-c:F0");
  t("#79 die verwaiste — aber verortete — Wand bleibt im Plan ohne Klassifikation",
    z.svg.includes('data-wand="w-d"') && !bg.some((g) => g.id === "w-d"));
  t("#79 F0 und F30 nutzen verschiedene Darstellungsmerkmale",
    gA.roh !== gB.roh
    && /<rect class="lpbrand-flaeche"[^>]*fill="url\(#[^"]*\)"/.test(gA.inhalt)
    && !/lpbrand-flaeche/.test(gB.inhalt)
    && />F30</.test(gA.inhalt) && />F0</.test(gB.inhalt));
  // DER Punkt der Regel: Farbe allein genuegt nicht. Werden ALLE Farbangaben
  // entfernt, muessen sich die beiden Gruppen immer noch unterscheiden.
  const ohneFarbe = (s) => s.replace(/\s(?:fill|stroke)="#[0-9a-fA-F]{3,8}"/g, "");
  t("#79 die Unterscheidung haengt nicht an einer Farbangabe (S/W-Ausdruck)",
    ohneFarbe(gA.roh) !== ohneFarbe(gB.roh)
    && ohneFarbe(gA.roh).includes(">F30<") && ohneFarbe(gB.roh).includes(">F0<")
    && ohneFarbe(gA.roh).includes("lpbrand-flaeche")
    && !ohneFarbe(gB.roh).includes("lpbrand-flaeche"));
  t("#79 das Schraffurmuster steht im Zeichnungsinhalt (und damit in jeder Ausgabe)",
    /<defs><pattern id="[^"]*"[\s\S]*?<\/pattern><\/defs>/.test(z.inner)
    && z.inner.indexOf("<defs>") === 0);
  t("#79 ohne F30-Wand entsteht auch kein Muster — das F0-Blatt bleibt das bisherige",
    (() => {
      const nurF0 = LP.lageplanDaten({ mappe: m, geschossId: gsEG,
        elemente: el.map((e) => ({ ...e,
          wandelement: { ...e.wandelement, brandklasse: "F0" } })) });
      return !LP.lageplanSvg(nurF0, {}).svg.includes("<defs>");
    })());
  t("#79 die Kennzeichnung haengt nicht am Schalter „Wände kennzeichnen“",
    brandGruppen(LP.lageplanSvg(d, { kennzeichnung: false }).svg).length === 3);

  // --- Legende und Wandtabelle nennen beide Klassen im Klartext -----------
  const leg = LP.legendeHtml();
  t("#79 die Legende benennt beide Klassifikationen mit ihrem Merkmal in Worten",
    leg.includes("<b>F0</b>") && leg.includes("<b>F30</b>")
    && leg.includes(LP.BRANDKLASSE.F0.name) && leg.includes(LP.BRANDKLASSE.F30.name)
    && leg.includes("ohne Schraffur") && leg.includes("diagonal schraffiert"));
  t("#79 die Legende sagt, dass die Angabe kein Nachweis ist",
    /Planungskennzeichnung, kein Nachweis/.test(leg));
  const tab = LP.wandTabelleHtml(d);
  const tabBrand = [...tab.matchAll(
    /<tr><td class="nr">(\d+)<\/td>[\s\S]*?<td>[^<]*<\/td><td>([^<]*)<\/td><td>[^<]*<\/td><\/tr>/g)]
    .map((mm) => mm[2]);
  t("#79 die Wandtabelle traegt die Klassifikation je Wand als Text",
    /<th>Brandschutz<\/th>/.test(tab) && tabBrand.join(",") === "F30,F0,F0,–");
  t("#79 die Tabellenspalte steht vor der Lagespalte — die Lage bleibt letzte Zelle",
    tab.indexOf("<th>Brandschutz</th>") < tab.indexOf("<th>Lage</th>")
    && /<td>unverortet<\/td><\/tr>|<td>x\/y<\/td><\/tr>|<td>frei<\/td><\/tr>/.test(tab));

  // --- Ein Pfad: Vorschau, Druck-HTML und SVG-Datei zeigen dasselbe -------
  const b = LP.blattHtml(d, {});
  const dok = LP.lageplanDokument(d, {});
  const svgD = LP.lageplanSvgDatei(d, {});
  t("#79 Blatt, Druck-HTML und SVG-Datei tragen bit-genau dieselben Kennzeichnungen",
    bg.every((g) => b.svg.includes(g.roh) && dok.includes(g.roh) && svgD.includes(g.roh))
    && JSON.stringify(brandGruppen(svgD)) === JSON.stringify(bg)
    && JSON.stringify(brandGruppen(dok)) === JSON.stringify(bg));
  t("#79 das Muster reist in die eigenstaendige SVG-Datei mit (sonst leere Schraffur)",
    svgD.includes("<defs><pattern id=") && dok.includes("<defs><pattern id="));
  t("#79 auch die exportierten Bytes zeigen dieselbe Kennzeichnung",
    (() => {
      const dateien = LP.lageplanDateien(d, {});
      const svg = dateien.find((f) => /\.svg$/.test(f.name));
      const htm = dateien.find((f) => /\.html$/.test(f.name));
      return svg.data === svgD && htm.data === dok
        && bg.every((g) => svg.data.includes(g.roh) && htm.data.includes(g.roh))
        && htm.data.includes(LP.wandTabelleHtml(d)) && htm.data.includes(leg);
    })());

  // --- Nicht angefasst: Geometrie, Massstab, Masse, Vollstaendigkeit ------
  const dF0 = LP.lageplanDaten({ mappe: m, geschossId: gsEG,
    elemente: el.map((e) => ({ ...e, wandelement: { ...e.wandelement, brandklasse: "F0" } })) });
  const zF0 = LP.lageplanSvg(dF0, {});
  t("#79 Massstab, Ausdehnung und Wandgeometrie sind mit und ohne F30 identisch",
    z.masstab === zF0.masstab
    && JSON.stringify(LP.ausdehnung(d)) === JSON.stringify(LP.ausdehnung(dF0))
    && JSON.stringify(d.waende.map((w) => w.rechteck))
       === JSON.stringify(dF0.waende.map((w) => w.rechteck)));
  t("#79 die Massdarstellung bleibt bitgenau dieselbe",
    JSON.stringify(d.massbilder) === JSON.stringify(dF0.massbilder)
    && massTexte(z.svg).join(",") === massTexte(zF0.svg).join(","));
  t("#79 die Klassifikation erzeugt weder Meldung noch Hinweis noch Statuswechsel",
    d.vollstaendig === dF0.vollstaendig
    && !d.meldungen.some((x) => /Brand/i.test(x.art + x.text))
    && !d.hinweise.some((x) => /Brand/i.test(x.art + x.text))
    && JSON.stringify(d.meldungen) === JSON.stringify(dF0.meldungen));
  t("#79 die Klassifikation liegt nur in der Ableitung — nichts wird zurueckgeschrieben",
    !JSON.stringify(m).includes("brandklasse")
    && el.every((e) => !("brandklasse" in e.wandelement)
      || typeof e.wandelement.brandklasse === "string"));
}

console.log(`\ntest-lageplan: ${pass} ok, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
