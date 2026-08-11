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
t("Laenge kommt aus der Lage, Hoehe und Wandtyp aus dem Wandelement ([P-1])",
  wA.laenge_mm === 2000 && wA.hoehe_mm === 2600 && wA.wandtyp === "mit_wind");
const wD = daten.waende.find((w) => w.id === "w-d");
t("[L-4] ein verwaister Eintrag wird als solcher gefuehrt — ohne geratene Hoehe",
  wD.verwaist === true && wD.hoehe_mm === null && wD.wandtyp === null);

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

// --- [N-6] Schriftfeld aus mappe.projekt.kopfdaten -------------------------

const blatt = LP.blattHtml(daten);
t("[N-6] die Kopfdaten des PROJEKTS stehen im Schriftfeld",
  /Bauherrschaft Muster/.test(blatt.html) && /POLYCARE/.test(blatt.html)
  && /LP 3/.test(blatt.html) && /A-101/.test(blatt.html) && /TB/.test(blatt.html));
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
t("[N-7] das Blatt sagt das sichtbar und listet die Meldungen",
  /nicht vollständig/i.test(LP.blattHtml(datenK).html) && /Wand ohne Lage/.test(LP.blattHtml(datenK).html));
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
// Geprueft wird die BESCHRIFTUNG, nicht der `<title>`-Tooltip der Wand: der bleibt
// bewusst stehen, damit die Wand in der Vorschau weiter identifizierbar ist.
t("Optionen: ohne Wandkennzeichnung fehlt die Beschriftung, nicht die Wand",
  (() => { const s = LP.lageplanSvg(daten, { kennzeichnung: false });
    return !/<text[^>]*>Wand A<\/text>/.test(s.svg) && s.svg.includes('data-wand="w-a"')
      && /<text[^>]*>Wand A<\/text>/.test(LP.lageplanSvg(daten).svg); })());

// --- Determinismus und Reinheit ------------------------------------------

t("[K-5] gleicher Stand ⇒ bitgenau gleiches Blatt",
  LP.blattHtml(daten).html === LP.blattHtml(daten).html
  && LP.blattHtml(LP.lageplanDaten({ mappe: MAPPE0, geschossId: gsEG, elemente: ELEMENTE })).html
     === blatt.html);

const quelle = readFileSync(new URL("../../docs/shared/sembla-lageplan.js", import.meta.url), "utf8");
t("das Modul ist DOM-frei", !/document\.|window\.|localStorage|indexedDB/.test(quelle));
t("das Modul kennt weder Speicher noch Planbild (Nicht-Ziele)",
  !/storage\.js|sembla-plan\.js/.test(quelle));
t("das Modul schreibt nichts (keine setz-/aendere-Aufrufe der Mappe)",
  !/setzeWand|setzeBemassung|setzeLage|aendereMappe|setzePlan/.test(quelle));
t("Anti-Drift: das Blatt rechnet die Massgeometrie nicht selbst",
  /sembla-massbild\.js/.test(quelle) && !/MASS_ABSTAND_MM\s*=\s*\d/.test(quelle));

console.log(`\ntest-lageplan: ${pass} ok, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
