// Geteilter Spannpunkt an der Verzahnung ([A-33], Fachentscheid Felix Bauroth 04.11.2026):
// „Die Wand, welche das Blech fuer den unteren Spannpunkt stellt, listet auch die Elemente der
// Spannachse auf." — L-Stoss und T-Stoss, nachgebaut (keine Kundendaten).
//
// Geprueft wird Ende-zu-Ende ueber die ECHTEN Pfade: Rechenkern (`buildWall`) -> Projektmappe
// (Lage im Geschoss) -> Zuordnung (`pruefeGeschoss` + `geteilteSpannpunkte`) -> lesende Sicht
// (`mitGeteiltenSpannpunkten`) -> Stueckliste (`semblaBomItems`/`einbauteile`) -> Modul 5
// (Baugruppenbild) -> Modul 7 (Blatt-SVG, Kasten) -> Lageplan (Modul 9, Meldungsblock) ->
// gemeinsamer Exportleser (`aktualisierteLeser` mit Verortung).
import { buildWall } from "../../docs/shared/sembla-core.js";
import { semblaBomItems, einbauteile } from "../../docs/shared/sembla-bom.js";
import * as Z from "../../docs/shared/sembla-zeichnung.js";
import { montageAbschnitte, abschnittSvg, spannpunktHinweis, wandBezeichnung }
  from "../../docs/shared/sembla-montage.js";
import * as K from "../../docs/shared/sembla-constraints.js";
import * as MAPPE from "../../docs/shared/sembla-projektmappe.js";
import { spannpunktStellen, mitGeteiltenSpannpunkten, geteiltAusSpeicher, aktualisierteLeser }
  from "../../docs/shared/sembla-wandanlage.js";
import { lageplanDaten, blattHtml as lageplanBlatt } from "../../docs/shared/sembla-lageplan.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n); } };
const H = 2400;
const V = (g0, g1, p) => [{ g0, g1, start_parity: p }];
const lage = (x, y, richtung, laenge_grid) => ({ start_mm: { x, y }, richtung, laenge_grid });
/**
 * Die [A-33]-Faelle unten brauchen eine BESTIMMTE Achslage im Verzahnungsfeld (doppelt, nur die
 * Partnerwand, nur die blechstellende Wand …). Seit [G-11] (06.11.2026) verteilt die Automatik die
 * Achsen aus dem realen Verband, und diese Lagen entstehen nicht mehr von selbst. Hergestellt werden
 * sie darum mit manuell gesetzten Achsen ([V-9]) — genau die des Vollverbands, wie sie vorher
 * automatisch kamen. [A-33] ordnet jede vorhandene Achse zu, gleich woher sie stammt.
 */
const manuell = (l) => ({ columns_grid: buildWall("v", l, H, [], null, null, []).tension_columns.map((c) => c.k) });

/** Ein Geschoss mit den gegebenen Waenden; liefert Mappe + Speicherattrappe. */
function geschoss(waende) {
  let m = MAPPE.leereMappe("Testprojekt");
  const g = MAPPE.fuegeGebaeudeHinzu(m, "Haus"); m = g.mappe;
  const gs = MAPPE.fuegeGeschossHinzu(m, g.id, "Erdgeschoss", H, "EG"); m = gs.mappe;
  for (const w of waende) m = MAPPE.setzeWand(m, gs.id, { id: w.id, lage: w.lage });
  const namen = new Map(MAPPE.findeGeschoss(m, gs.id).geschoss.waende.map((w) => [w.id, w.name]));
  const el = new Map(waende.map((w) => [w.id, { id: w.id, name: namen.get(w.id), wandelement: w.we }]));
  const store = {
    wandVerortung: (id) => MAPPE.findeWand(m, id),
    holeElement: (id) => el.get(String(id)) || null,
  };
  return { mappe: m, geschossId: gs.id, store, namen, el };
}

/** Mengen, die eine Spannachse in der Stueckliste fuehrt. */
function achsMengen(w) {
  const pos = semblaBomItems(w);
  const m = (key) => pos.filter((p) => p.key === key).reduce((a, p) => a + p.menge, 0);
  return { schraube: m("senkkopf"), kupplFuss: m("kupplung_fuss"),
    stangen: einbauteile(w).length, ids: einbauteile(w).map((t) => t.id) };
}
const summe = (a, b) => Object.fromEntries(Object.keys(a).filter((k) => k !== "ids").map((k) => [k, a[k] + b[k]]));
const achsenAn = (w, k) => (w.tension_columns || []).filter((c) => c.k === k).length;

// ---------------------------------------------------------------------------------------------
console.log("\nL-STOSS: beide Waende haben eine Achse im Eckfeld (heute doppelt gezaehlt) [A-33]:");
{
  // A laeuft in x und belegt an der Ecke die unterste Lage (start_parity 1) -> Bodenblech gekuerzt.
  // B laeuft in y und spart sie aus (start_parity 0) -> B stellt das Blech an der Ecke.
  // Ausgangslage „beide haben eine Achse im Eckfeld" ueber `manuell` ([V-9], s. o.).
  const A = buildWall("A", 1250, H, [], null, manuell(1250), [], V(0, 1, 1));
  const B = buildWall("B", 2000, H, [], null, manuell(2000), [], V(0, 1, 0));
  ok("Ausgangslage: A UND B rechnen je eine Achse im Eckfeld (k=0) — Doppelzaehlung ohne [A-33]",
    achsenAn(A, 0) === 1 && achsenAn(B, 0) === 1
    && A.validation.verzahnung_bodenblech.some((h) => h.grund === "achse_auf_partnerblech" && h.k === 0));
  const G = geschoss([{ id: "A", we: A, lage: lage(0, 62.5, "x", 10) },
                      { id: "B", we: B, lage: lage(62.5, 0, "y", 16) }]);
  const erg = K.pruefeGeschoss([...MAPPE.findeGeschoss(G.mappe, G.geschossId).geschoss.waende], [], null,
    { A: A.interlocks, B: B.interlocks });
  ok("[A-33] Geschoss: zulaessige Verzahnung, blechstellende Wand ist B",
    erg.verzahnungen.length === 1 && erg.verzahnungen[0].blech_von === "B");
  const gsp = K.geteilteSpannpunkte(erg.verzahnungen, (id) => (id === "A" ? A : B).tension_columns.map((c) => c.k));
  ok("[A-33] genau ein geteilter Spannpunkt, gefuehrt von B, doppelt erkannt",
    gsp.length === 1 && gsp[0].fuehrt === "B" && gsp[0].doppelt === true);

  const sA = geteiltAusSpeicher(G.store, "A", A), sB = geteiltAusSpeicher(G.store, "B", B);
  ok("[A-33] A fuehrt die Eckachse nicht mehr (keine Spannachse, keine Einbauteil-ID k0)",
    achsenAn(sA, 0) === 0 && !achsMengen(sA).ids.some((id) => id.startsWith("GS-k0."))
    && sA.angedeutete_achsen.length === 1 && sA.angedeutete_achsen[0].k === 0
    && sA.angedeutete_achsen[0].quelle === "eigen");
  ok("[A-33] B fuehrt sie unveraendert", achsenAn(sB, 0) === 1 && !sB.angedeutete_achsen
    && JSON.stringify(sB.tension_columns) === JSON.stringify(B.tension_columns));
  const vorher = summe(achsMengen(A), achsMengen(B)), nachher = summe(achsMengen(sA), achsMengen(sB));
  const eine = { schraube: B.tension_columns[0].senkkopfschrauben, stangen: B.tension_columns[0].gewindestangen };
  ok("[A-33] ueber beide Waende genau EINMAL: Schraube, Kopplungsmutter Fuss und Stangen der Eckachse",
    vorher.schraube - nachher.schraube === eine.schraube
    && vorher.kupplFuss - nachher.kupplFuss === eine.schraube
    && vorher.stangen - nachher.stangen === A.tension_columns[0].gewindestangen
    && achsMengen(sB).schraube === achsMengen(B).schraube);
  ok("[A-33] bom-Mengen der Sicht konsistent mit den verbleibenden Spannachsen",
    sA.bom.senkkopfschrauben === sA.tension_columns.reduce((a, c) => a + c.senkkopfschrauben, 0)
    && sA.bom.gewindestangen === sA.tension_columns.reduce((a, c) => a + c.gewindestangen, 0)
    && sA.bom.kopplungsmuttern_basis === sA.bom.senkkopfschrauben
    && sA.bom.spannplatten === sA.tension_columns.reduce((a, c) => a + c.spannplatten, 0));
  const nB = G.namen.get("B"), nA = G.namen.get("A");
  ok("[A-33] Hinweis an BEIDEN Waenden mit dem richtigen Partner (Wandnummer [L-14])",
    /^Wand_EG-\d+$/.test(nA) && /^Wand_EG-\d+$/.test(nB)
    && spannpunktHinweis(sA.geteilte_spannpunkte[0]).startsWith(`Geteilter Spannpunkt mit ${nB}`)
    && spannpunktHinweis(sB.geteilte_spannpunkte[0]).startsWith(`Geteilter Spannpunkt mit ${nA}`)
    && /geführt von der Partnerwand/.test(spannpunktHinweis(sA.geteilte_spannpunkte[0]))
    && /stellt dort das Bodenblech und führt/.test(spannpunktHinweis(sB.geteilte_spannpunkte[0])));
  // Darstellung: Modul 7 (Blatt) und Modul 5 zeichnen die angedeutete Achse in A, nicht in B.
  const svg7A = Z.zeichnungSvg(sA, { format: "a3" }).svg, svg7B = Z.zeichnungSvg(sB, { format: "a3" }).svg;
  const ab = montageAbschnitte(sA).filter((x) => x.art !== "schnitt0");
  const svg5A = abschnittSvg(sA, ab[0], 900, 430);
  ok("[A-33]/[D-4] Modul 7 und Modul 5: A zeigt die Eckachse angedeutet, B nicht",
    /class="achse-angedeutet" data-k="0"/.test(svg7A) && /class="achse-angedeutet" data-k="0"/.test(svg5A)
    && !/achse-angedeutet/.test(svg7B));
  const blattA = Z.blattHtml(sA, {}, { format: "a3" }).html;
  ok("[A-33] Modul 7 Blatt: Kasten „Geteilter Spannpunkt“ mit Partner, Legende nennt die angedeutete Achse",
    blattA.includes(Z.GETEILT_TITEL) && blattA.includes(`Geteilter Spannpunkt mit ${nB}`)
    && Z.legendeHtml(sA).includes("angedeutet") && !Z.legendeHtml(sB).includes("angedeutet"));
  // Der gemeinsame Exportleser (Modul 0/4) liefert dieselbe Sicht.
  const leser = aktualisierteLeser({ holeElement: G.store.holeElement, holeEingaben: () => ({}),
    katalog: null, engine: null, verortung: G.store.wandVerortung });
  ok("[A-33] Exportleser mit Verortung: dieselbe Zuordnung wie die Module",
    achsenAn(leser.holeElement("A").wandelement, 0) === 0 && achsenAn(leser.holeElement("B").wandelement, 0) === 1);
  // Gespeichert wird nichts: die Wandelemente bleiben unberuehrt.
  ok("[A-33] gespeicherte Wandelemente unveraendert", achsenAn(A, 0) === 1 && !("geteilte_spannpunkte" in A));
}

// ---------------------------------------------------------------------------------------------
console.log("\nL-STOSS: nur die blechstellende Wand hat die Eckachse [A-33]:");
{
  const A = buildWall("A", 2500, H, [], null, manuell(2500), [], V(0, 1, 1));   // Achsen 1,4,…
  const B = buildWall("B", 2000, H, [], null, manuell(2000), [], V(0, 1, 0));   // Achse 0
  const G = geschoss([{ id: "A", we: A, lage: lage(0, 62.5, "x", 20) },
                      { id: "B", we: B, lage: lage(62.5, 0, "y", 16) }]);
  const sA = geteiltAusSpeicher(G.store, "A", A), sB = geteiltAusSpeicher(G.store, "B", B);
  ok("[A-33] A: Stueckliste unveraendert, Achse von B angedeutet",
    JSON.stringify(achsMengen(sA)) === JSON.stringify(achsMengen(A))
    && sA.angedeutete_achsen.length === 1 && sA.angedeutete_achsen[0].quelle === "partner");
  ok("[A-33] B: fuehrt die Achse, Hinweis an beiden",
    JSON.stringify(achsMengen(sB)) === JSON.stringify(achsMengen(B))
    && sA.geteilte_spannpunkte[0].fuehrt === "partner" && sB.geteilte_spannpunkte[0].fuehrt === "selbst");
}

// ---------------------------------------------------------------------------------------------
console.log("\nL-STOSS: nur die gekuerzte Wand hat die Eckachse -> B uebernimmt sie [A-33]:");
{
  const A = buildWall("A", 1250, H, [], null, manuell(1250), [], V(0, 1, 1));   // Achse 0
  const B = buildWall("B", 1000, H, [], null, manuell(1000), [], V(0, 1, 0));   // Achsen 1,4,6 — keine bei 0
  const G = geschoss([{ id: "A", we: A, lage: lage(0, 62.5, "x", 10) },
                      { id: "B", we: B, lage: lage(62.5, 0, "y", 8) }]);
  const sA = geteiltAusSpeicher(G.store, "A", A), sB = geteiltAusSpeicher(G.store, "B", B);
  const vor = summe(achsMengen(A), achsMengen(B)), nach = summe(achsMengen(sA), achsMengen(sB));
  ok("[A-33] die Achse wandert von A nach B — ueber beide Waende genau einmal, nichts verloren",
    achsenAn(sA, 0) === 0 && achsenAn(sB, 0) === 1 && sB.tension_columns.find((c) => c.k === 0).uebernommen_von
    && JSON.stringify(vor) === JSON.stringify(nach)
    && achsMengen(sB).ids.some((id) => id.startsWith("GS-k0.")));
  ok("[A-33] Hinweis bei B nennt die Uebernahme", /übernommen/.test(spannpunktHinweis(sB.geteilte_spannpunkte[0])));
}

// ---------------------------------------------------------------------------------------------
console.log("\nT-STOSS: durchlaufende Wand stellt das Blech und hat die Achse [A-33]:");
{
  const A = buildWall("A", 4000, H, [], null, manuell(4000), [], V(13, 14, 0));   // Achse 13
  const B = buildWall("B", 2000, H, [], null, manuell(2000), [], V(15, 16, 1));   // gekuerzt am Ende
  const G = geschoss([{ id: "A", we: A, lage: lage(0, 62.5, "x", 32) },
                      { id: "B", we: B, lage: lage(1687.5, -1875, "y", 16) }]);
  const sA = geteiltAusSpeicher(G.store, "A", A), sB = geteiltAusSpeicher(G.store, "B", B);
  ok("[A-33] T: A (durchlaufend, Blech) fuehrt die Achse k13, B zeigt sie angedeutet in seinem Feld 15",
    achsenAn(sA, 13) === 1 && !sA.angedeutete_achsen
    && sB.angedeutete_achsen && sB.angedeutete_achsen[0].k === 15 && sB.angedeutete_achsen[0].quelle === "partner"
    && JSON.stringify(achsMengen(sB)) === JSON.stringify(achsMengen(B)));
  ok("[A-33] T: Hinweis an beiden mit richtigem Partner",
    spannpunktHinweis(sA.geteilte_spannpunkte[0]).includes(G.namen.get("B"))
    && spannpunktHinweis(sB.geteilte_spannpunkte[0]).includes(G.namen.get("A")));
  const svg5B = abschnittSvg(sB, montageAbschnitte(sB).filter((x) => x.art !== "schnitt0")[0], 900, 430);
  ok("[A-33]/[D-4] T: Modul 5 und 7 zeichnen bei B die angedeutete Achse im Feld 15",
    /class="achse-angedeutet" data-k="15"/.test(Z.zeichnungSvg(sB, { format: "a3" }).svg)
    && /class="achse-angedeutet" data-k="15"/.test(svg5B));

  // Lageplan (Modul 9): Hinweis je Wandpaar im Meldungsblock, Vorschau = Druck = Export.
  const elemente = [...G.el.values()];
  const d = lageplanDaten({ mappe: G.mappe, geschossId: G.geschossId, elemente });
  ok("[A-33] Lageplan: „Geteilter Spannpunkt“ je Wandpaar benannt, mit fuehrender Wand",
    d.hinweise.some((h) => h.art === "geteilter_spannpunkt" && h.text.includes(G.namen.get("A"))
      && h.text.includes(G.namen.get("B")) && /führt/.test(h.text)));
}

// ---------------------------------------------------------------------------------------------
console.log("\nT-STOSS unsauber und Lageplan-Warnungen [A-32]/[A-33]:");
{
  // Die durchlaufende Wand belegt die unterste Lage -> beide behalten ihr Blech -> Zuordnung offen.
  const A = buildWall("A", 4000, H, [], null, manuell(4000), [], V(13, 14, 1));
  const B = buildWall("B", 2000, H, [], null, manuell(2000), [], V(15, 16, 0));
  const G = geschoss([{ id: "A", we: A, lage: lage(0, 62.5, "x", 32) },
                      { id: "B", we: B, lage: lage(1687.5, -1875, "y", 16) }]);
  const sA = geteiltAusSpeicher(G.store, "A", A), sB = geteiltAusSpeicher(G.store, "B", B);
  ok("[A-33] Bleche ueberlagern sich: nichts wird umgehaengt, Zuordnung offen benannt",
    JSON.stringify(sA.tension_columns) === JSON.stringify(A.tension_columns)
    && sA.geteilte_spannpunkte.length === 1 && sA.geteilte_spannpunkte[0].fuehrt === null
    && /Zuordnung offen/.test(spannpunktHinweis(sA.geteilte_spannpunkte[0]))
    && sB.geteilte_spannpunkte[0].fuehrt === null);
  const d = lageplanDaten({ mappe: G.mappe, geschossId: G.geschossId, elemente: [...G.el.values()] });
  ok("[A-32] Lageplan: T-Fall „Bodenbleche überlagern sich“ im Meldungsblock",
    d.meldungen.some((x) => x.art === "bodenblech_verzahnung" && /Bodenbleche überlagern sich/.test(x.text)));
  const html = lageplanBlatt(d, {}).html;
  ok("[A-32]/[A-33] Lageplanblatt (Vorschau = Druck = Export) traegt beide Aussagen",
    /Bodenbleche überlagern sich/.test(html) && /Geteilter Spannpunkt/.test(html));
  // Gleiche Startlage (beide sparen die unterste Lage aus): Kollision mit Bodenblech-Zusatz.
  const A0 = buildWall("A", 4000, H, [], null, manuell(4000), [], V(13, 14, 0));
  const B0 = buildWall("B", 2000, H, [], null, manuell(2000), [], V(15, 16, 0));
  const G2 = geschoss([{ id: "A", we: A0, lage: lage(0, 62.5, "x", 32) },
                       { id: "B", we: B0, lage: lage(1687.5, -1875, "y", 16) }]);
  const d2 = lageplanDaten({ mappe: G2.mappe, geschossId: G2.geschossId, elemente: [...G2.el.values()] });
  ok("[A-32] Lageplan: Kollision bei gleicher Startlage nennt die Bodenbleche",
    d2.meldungen.some((x) => x.art === "kollision" && /Bodenbleche überlagern sich/.test(x.text))
    && /Bodenbleche überlagern sich/.test(lageplanBlatt(d2, {}).html));
}

// ---------------------------------------------------------------------------------------------
console.log("\nOHNE PARTNER und BESTAND [A-33]:");
{
  const A = buildWall("A", 1250, H, [], null, manuell(1250), [], V(0, 1, 1));
  // Nicht verortet: neutraler Hinweis, Achse bleibt (vorlaeufig) in der Wand.
  const sA = mitGeteiltenSpannpunkten(A, spannpunktStellen(null, "A", () => null, A));
  ok("[A-33] ohne verortete Partnerwand: neutraler Hinweis, Achse bleibt gefuehrt",
    achsenAn(sA, 0) === 1 && sA.geteilte_spannpunkte.length === 1 && sA.geteilte_spannpunkte[0].unverortet
    && spannpunktHinweis(sA.geteilte_spannpunkte[0]).startsWith("Geteilter Spannpunkt (Partnerwand nicht verortet)")
    && JSON.stringify(achsMengen(sA)) === JSON.stringify(achsMengen(A)));
  // Ohne Verzahnung: dasselbe Objekt, bit-gleich.
  const O = buildWall("O", 2500, H, [], null, null, [], []);
  const G = geschoss([{ id: "O", we: O, lage: lage(0, 62.5, "x", 20) }]);
  ok("[A-33] Wand ohne Verzahnung: die Sicht ist dasselbe Objekt (bit-gleich)",
    geteiltAusSpeicher(G.store, "O", O) === O);
  ok("wandBezeichnung: fester Wandname steht fuer sich, freier Name in Anfuehrung",
    wandBezeichnung("Wand_EG-3") === "Wand_EG-3" && wandBezeichnung("Ecke") === "Wand „Ecke“");
}

// ---------------------------------------------------------------------------------------------
// R03 (Feedback Felix Bauroth 06.11.2026), synthetisch nachgebaut: L-Stoss aus Wand A (2125 mm,
// Verzahnung am Wandende, start_parity 0) und Wand B (1250 mm, start_parity 1), beide 2600 hoch.
// Seit [G-11] (06.11.2026) folgen die Achsen dem realen Verband — kein ungehaltener Stein.
console.log("\nR03: L-Stoss A/B in beiden Orientierungen von B ([K-13.1]/[A-32]/[A-33]/[G-11]):");
{
  const ps = { max_span_grid: 3, rod_lengths_mm: [1050, 820], rod_rest_mm: 100 };
  const HR = 2600;
  const A = buildWall("A", 2125, HR, [], null, ps, [], V(16, 17, 0));
  // Variante 1: B oberhalb von A, Eckfeld am Max-Ende von B (Rasterfeld 9, y nach unten).
  // Variante 2: B unterhalb von A, Eckfeld am Min-Ende von B (Rasterfeld 0).
  const varianten = [
    ["B oberhalb, Ecke an B-Feld 9", buildWall("B", 1250, HR, [], null, ps, [], V(9, 10, 1)), lage(2062.5, -1125, "y", 10), 9],
    ["B unterhalb, Ecke an B-Feld 0", buildWall("B", 1250, HR, [], null, ps, [], V(0, 1, 1)), lage(2062.5, 0, "y", 10), 0],
  ];
  ok("[G-11] R03: A traegt keinen ungehaltenen Stein", A.validation.ungehaltene_steine.length === 0);
  for (const [was, B, lageB, feldB] of varianten) {
    ok(`[G-11] R03 ${was}: B traegt keinen ungehaltenen Stein`, B.validation.ungehaltene_steine.length === 0);
    const G = geschoss([{ id: "A", we: A, lage: lage(0, 62.5, "x", 17) }, { id: "B", we: B, lage: lageB }]);
    const waende = [...MAPPE.findeGeschoss(G.mappe, G.geschossId).geschoss.waende];
    const erg = K.pruefeGeschoss(waende, [], null, { A: A.interlocks, B: B.interlocks });
    ok(`[K-13.1] R03 ${was}: keine Kollision, eine zulaessige Verzahnung (A-Feld 16, B-Feld ${feldB})`,
      erg.kollisionen.length === 0 && erg.verzahnungen.length === 1
      && erg.verzahnungen[0].raster.a === 16 && erg.verzahnungen[0].raster.b === feldB
      && erg.verzahnungen[0].blech_von === "A");
    const sA = geteiltAusSpeicher(G.store, "A", A), sB = geteiltAusSpeicher(G.store, "B", B);
    ok(`[A-33] R03 ${was}: Hinweis „Geteilter Spannpunkt" an beiden Waenden, A fuehrt`,
      (sA.geteilte_spannpunkte || []).length === 1 && (sB.geteilte_spannpunkte || []).length === 1
      && spannpunktHinweis(sA.geteilte_spannpunkte[0]).startsWith(`Geteilter Spannpunkt mit ${G.namen.get("B")}`)
      && spannpunktHinweis(sB.geteilte_spannpunkte[0]).startsWith(`Geteilter Spannpunkt mit ${G.namen.get("A")}`)
      && achsenAn(sA, 16) === 1);
    // Gleiche Startlage bleibt Kollision und nennt die Bodenblech-Ueberlagerung.
    const B0 = buildWall("B", 1250, HR, [], null, ps, [], V(feldB, feldB + 1, 0));
    const k0 = K.pruefeGeschoss(waende, [], null, { A: A.interlocks, B: B0.interlocks }).kollisionen;
    ok(`[A-32] R03 ${was}: gleiche Startlage bleibt Kollision mit „Bodenbleche überlagern sich"`,
      k0.length === 1 && k0[0].bodenbleche === "ueberlagern" && /Bodenbleche überlagern sich/.test(k0[0].meldung));
  }
  // Benannte Gruende, wenn die Verzahnung die Ueberlagerung nicht trifft — die Bewertung bleibt
  // exakt (keine Toleranz), nur die Meldung sagt jetzt WARUM.
  const B9 = buildWall("B", 1250, HR, [], null, ps, [], V(9, 10, 1));
  const tab = { A: A.interlocks, B: B9.interlocks };
  const am = (lageB) => K.pruefeGeschoss([{ id: "A", lage: lage(0, 62.5, "x", 17) }, { id: "B", lage: lageB }],
    [], null, tab).kollisionen;
  const k1 = am(lage(2062.5, 0, "y", 10));
  ok("R03: Verzahnung am anderen Wandende wird benannt (kein_bereich, anderes_ende)",
    k1.length === 1 && k1[0].verzahnung_passt_nicht.length === 1
    && k1[0].verzahnung_passt_nicht[0].wand === "B" && k1[0].verzahnung_passt_nicht[0].grund === "kein_bereich"
    && k1[0].verzahnung_passt_nicht[0].anderes_ende === true && /am anderen Wandende/.test(k1[0].meldung));
  const k2 = am(lage(2062.5, -1095, "y", 10));
  ok("R03: B ragt 30 mm ueber die Aussenkante von A — benannt (ausser_raster, 30 mm), weiterhin Kollision",
    k2.length === 1 && k2[0].ueberlappung_mm.x === 125 && k2[0].ueberlappung_mm.y === 125
    && k2[0].verzahnung_passt_nicht[0].grund === "ausser_raster" && k2[0].verzahnung_passt_nicht[0].versatz_mm === 30
    && /30 mm neben Rasterfeld 9/.test(k2[0].meldung));
  const k3 = K.pruefeGeschoss([{ id: "A", lage: lage(0, 62.5, "x", 17) }, { id: "B", lage: lage(2062.5, 0, "y", 10) }],
    [], null, {}).kollisionen;
  ok("R03: ohne Verzahnungsbereiche bleibt die Kollisionsmeldung bit-genau wie zuvor",
    k3.length === 1 && !("verzahnung_passt_nicht" in k3[0])
    && k3[0].meldung === "Wände „A“ und „B“ überlappen sich um 125 × 125 mm — [K-13].");
}

console.log(`\n${pass}/${pass + fail} ok`);
if (fail) process.exit(1);
