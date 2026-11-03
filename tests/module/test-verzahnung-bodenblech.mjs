// Bodenblech im Verband ([A-32], Miro R03): Kuerzung des Bodenblechs unter einer Verzahnung am
// Wandende — L-Stoss (Ecke) und T-Stoss, nachgebaut (keine Kundendaten).
//
// Geprueft wird Ende-zu-Ende ueber die ECHTEN Pfade: Rechenkern (`buildWall`) -> Stueckliste
// (`semblaBomItems`) -> Modul 7 (Bodenblech-Masskette, Blatt-SVG) -> Modul 5 (Baugruppenbild) ->
// Geschossplan (`pruefeGeschoss`). Die Waende werden in Weltkoordinaten zusammengesetzt, damit
// die Kernaussage nachweisbar ist: an der Verzahnung liegt GENAU EIN Bodenblech, und jede
// untere Blechfuge an einer Verzahnung liegt unter einem Stein der untersten Lage.
import { buildWall, GRID } from "../../docs/shared/sembla-core.js";
import { semblaBomItems } from "../../docs/shared/sembla-bom.js";
import * as Z from "../../docs/shared/sembla-zeichnung.js";
import { montageAbschnitte, abschnittSvg, bodenblechVerzahnung, bodenblechLeereLuecken,
         bodenblechAussparungen, PARTNERBLECH, AUSSPARUNG } from "../../docs/shared/sembla-montage.js";
import * as K from "../../docs/shared/sembla-constraints.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n); } };
const H = 2400;
const V = (g0, g1, p) => [{ g0, g1, start_parity: p }];

/** Lage im Geschoss: start_mm auf der Mittellinie am Ende mit der kleineren Koordinate. */
const lage = (x, y, richtung, laenge_grid) => ({ start_mm: { x, y }, richtung, laenge_grid });

/** Bodenblechteile einer Wand als Weltrechtecke (x0,x1,y0,y1). */
function bleche(w, l) {
  return w.base_plate.teile.map((t) => {
    const a = t.x0_mm, b = t.x0_mm + t.raster_mm;
    return l.richtung === "x"
      ? { x0: l.start_mm.x + a, x1: l.start_mm.x + b, y0: l.start_mm.y - 62.5, y1: l.start_mm.y + 62.5 }
      : { x0: l.start_mm.x - 62.5, x1: l.start_mm.x + 62.5, y0: l.start_mm.y + a, y1: l.start_mm.y + b };
  });
}
/** Wie viele Bodenbleche (beider Waende) decken den Punkt? */
const deckung = (rects, x, y) => rects.filter((r) => r.x0 < x && x < r.x1 && r.y0 < y && y < r.y1).length;
/** Liegt die Rasterposition g (lokal) STRIKT in einem Stein der untersten Lage? */
const unterStein = (w, g) => w.courses[0].stones.some((s) => s.x0 < g * GRID && g * GRID < s.x1);

/** Stueckliste (blech_boden) und Kette (Modul 7) passen zu den realen Teilen. */
function bomUndKette(w, was) {
  const pos = semblaBomItems(w).filter((p) => p.key === "blech_boden" || p.key === "blech_boden_sonder");
  const menge = pos.reduce((a, p) => a + p.menge, 0);
  const teile = w.base_plate.teile;
  const kette = Z.bodenblechKette(w);
  const luecken = bodenblechAussparungen(w);
  ok(`${was}: Stueckliste blech_boden = reale Teile (Anzahl und Rastermasse)`,
    menge === teile.length
    && pos.reduce((a, p) => a + p.menge * p.mass_mm, 0) === teile.reduce((a, t) => a + t.raster_mm, 0)
    && teile.reduce((a, t) => a + t.raster_mm, 0) === w.base_plate.laenge_mm);
  ok(`${was}: Masskette (Modul 7) je Teil ein Glied, Kuerzung = Luecke, Σ Glieder + Luecken = Wandlaenge`,
    kette.length === teile.length
    && kette.every((g, i) => g.x0_mm === teile[i].x0_mm && g.x1_mm === teile[i].x0_mm + teile[i].raster_mm)
    && luecken.every((l) => !kette.some((g) => g.x0_mm < l.x1_mm && g.x1_mm > l.x0_mm))
    && kette.reduce((a, g) => a + g.x1_mm - g.x0_mm, 0) + luecken.reduce((a, l) => a + l.laenge_mm, 0)
      === w.length_mm);
}

// ---------------------------------------------------------------------------------------------
console.log("\nL-STOSS (Ecke) [A-32]:");
{
  // A laeuft in x (Feld 0 ist die Ecke), B in y (Feld 0 ist die Ecke). A belegt dort die unterste
  // Lage (start_parity 1) und wird gekuerzt; B spart sie aus (start_parity 0) und behaelt sein Blech.
  const lA = lage(0, 62.5, "x", 20), lB = lage(62.5, 0, "y", 16);
  const A = buildWall("A", 2500, H, [], null, null, [], V(0, 1, 1));
  const B = buildWall("B", 2000, H, [], null, null, [], V(0, 1, 0));
  ok("[A-32] A (unterste Lage belegt) ist unter der Verzahnung gekuerzt, abgeleitet",
    JSON.stringify(A.base_plate.verzahnung_kuerzungen.map((k) => [k.g0, k.g1, k.ende])) === '[[0,1,"anfang"]]'
    && A.base_plate.teile[0].x0_mm === 125 && A.base_plate.laenge_mm === 2375
    && !("base_plate_aussparungen_grid" in A.prestress));
  ok("[A-32] B (unterste Lage ausgespart) behaelt sein Blech bis zum Wandende",
    !("verzahnung_kuerzungen" in B.base_plate) && B.base_plate.teile[0].x0_mm === 0
    && B.base_plate.laenge_mm === 2000);
  const alle = [...bleche(A, lA), ...bleche(B, lB)];
  ok("[A-32] an der Verzahnung (Eckfeld) liegt genau EIN Bodenblech",
    deckung(alle, 62.5, 62.5) === 1 && deckung(alle, 10, 10) === 1 && deckung(alle, 120, 120) === 1);
  ok("[A-32]/[A-11] die Blechfuge an der Kuerzung liegt unter einem Stein der untersten Lage von A",
    unterStein(A, 1) && !(A.validation.verzahnung_bodenblech || []).some((h) => h.grund === "fuge_an_kuerzung"));
  ok("[A-32] keine Warnung im sauberen L-Stoss",
    !("verzahnung_bodenblech" in A.validation) && !("verzahnung_bodenblech" in B.validation));
  ok("[A-31] die gekuerzte Wand hat am neuen Blechanfang ein Pflichtauflager, keines in der Kuerzung",
    A.ausgleichspunkte.some((p) => p.x_mm === 125 && p.art === "bereichsende")
    && !A.ausgleichspunkte.some((p) => p.x_mm < 125));
  bomUndKette(A, "L/A gekuerzt");
  bomUndKette(B, "L/B behaelt");
  // Geschossplan: zulaessige Verzahnung, kein Bodenblech-Befund.
  const erg = K.pruefeGeschoss([{ id: "A", lage: lA }, { id: "B", lage: lB }], [], null,
    { A: A.interlocks, B: B.interlocks });
  ok("[A-32] Geschossplan: zulaessige Verzahnung ohne Bodenblech-Hinweis",
    erg.kollisionen.length === 0 && erg.verzahnungen.length === 1
    && !("bodenblech_hinweis" in erg.verzahnungen[0]));
  // Darstellung: Modul 7 und Modul 5 zeigen das Partnerblech, nicht die leere Aussparung.
  const svg7 = Z.zeichnungSvg(A, { format: "a3" }).svg;
  const ab = montageAbschnitte(A);
  const svg5 = abschnittSvg(A, ab[0], 900, 430);
  ok("[A-32]/[D-4] Modul 7 und Modul 5 zeichnen das Feld als Blech der Partnerwand (ohne Kreuz)",
    /<rect class="bbpartner"/.test(svg7) && !/<rect class="bbaus"/.test(svg7)
    && /<rect class="bbpartner"/.test(svg5) && !/<rect class="bbaus"/.test(svg5));
  ok("[A-32]/[D-4] die Legende (Modul 7) nennt das Partnerblech, nicht die Aussparung",
    Z.legendeHtml(A).includes(PARTNERBLECH.label) && !Z.legendeHtml(A).includes(AUSSPARUNG.label));
  ok("[A-32] Lesepfad: Kuerzung gelesen, leere Luecken ohne das Kuerzungsfeld",
    bodenblechVerzahnung(A).length === 1 && bodenblechLeereLuecken(A).length === 0
    && bodenblechAussparungen(A).length === 1);
}

// ---------------------------------------------------------------------------------------------
console.log("\nT-STOSS [A-32]:");
{
  // A laeuft durch (in x, Feld 12 ist die T-Stelle), B stoesst mit seinem letzten Feld an.
  const lA = lage(0, 62.5, "x", 32), lB = lage(1562.5, -1875, "y", 16);
  const T = { x: 1562.5, y: 62.5 };
  // (a) sauber: die durchlaufende Wand spart die unterste Lage aus, die anstossende belegt sie.
  {
    const A = buildWall("A", 4000, H, [], null, null, [], V(12, 13, 0));
    const B = buildWall("B", 2000, H, [], null, null, [], V(15, 16, 1));
    ok("[A-32] T sauber: die durchlaufende Wand behaelt ihr Blech (Bereich mitten in der Wand)",
      !("verzahnung_kuerzungen" in A.base_plate) && !("aussparungen" in A.base_plate)
      && A.base_plate.laenge_mm === 4000);
    ok("[A-32] T sauber: die anstossende Wand ist am Wandende gekuerzt",
      JSON.stringify(B.base_plate.verzahnung_kuerzungen.map((k) => [k.g0, k.g1, k.ende])) === '[[15,16,"ende"]]'
      && B.base_plate.laenge_mm === 1875);
    const alle = [...bleche(A, lA), ...bleche(B, lB)];
    ok("[A-32] T sauber: an der T-Stelle liegt genau EIN Bodenblech",
      deckung(alle, T.x, T.y) === 1 && deckung(alle, T.x - 60, T.y + 60) === 1);
    ok("[A-32]/[A-11] T sauber: die Blechfuge der anstossenden Wand liegt unter einem Stein der untersten Lage",
      unterStein(B, 15));
    ok("[A-32] T sauber: keine Warnung", !("verzahnung_bodenblech" in A.validation)
      && !("verzahnung_bodenblech" in B.validation));
    bomUndKette(A, "T/A durchlaufend");
    bomUndKette(B, "T/B gekuerzt");
    const erg = K.pruefeGeschoss([{ id: "A", lage: lA }, { id: "B", lage: lB }], [], null,
      { A: A.interlocks, B: B.interlocks });
    ok("[A-32] Geschossplan T sauber: zulaessig, kein Bodenblech-Hinweis",
      erg.kollisionen.length === 0 && erg.verzahnungen.length === 1
      && !("bodenblech_hinweis" in erg.verzahnungen[0]));
  }
  // (b) nicht sauber: die durchlaufende Wand belegt die unterste Lage -> beide behalten ihr
  //     Blech, Bleche ueberlagern sich -> Warnung in Modul 1 (Kern) und im Geschossplan.
  {
    const A = buildWall("A", 4000, H, [], null, null, [], V(12, 13, 1));
    const B = buildWall("B", 2000, H, [], null, null, [], V(15, 16, 0));
    ok("[A-32] T unsauber: nichts wird gekuerzt (die durchlaufende Wand hat Vorrang)",
      !("verzahnung_kuerzungen" in A.base_plate) && !("verzahnung_kuerzungen" in B.base_plate));
    ok("[A-32] T unsauber: der Rechenkern benennt die durchlaufende Wand mit belegter unterster Lage",
      JSON.stringify(A.validation.verzahnung_bodenblech)
        === '[{"grund":"durchlaufend_lage1_belegt","g0":12,"g1":13,"start_parity":1}]');
    const alle = [...bleche(A, lA), ...bleche(B, lB)];
    ok("[A-32] T unsauber: an der T-Stelle liegen ZWEI Bleche — das ist der gewarnte Fall",
      deckung(alle, T.x, T.y) === 2);
    const erg = K.pruefeGeschoss([{ id: "A", lage: lA }, { id: "B", lage: lB }], [], null,
      { A: A.interlocks, B: B.interlocks });
    const v = erg.verzahnungen[0];
    ok("[A-32] Geschossplan T unsauber: an der Verzahnungsstelle benannt, mit Empfehlung",
      erg.kollisionen.length === 0 && !!v && JSON.stringify(v.bodenblech_durchlaufend) === '["A"]'
      && /Bodenbleche überlagern sich/.test(v.bodenblech_hinweis)
      && /unterste Lage ausgespart/.test(v.bodenblech_hinweis));
  }
  // (c) gleiche Startlage: bleibt eine Kollision ([K-13]) und nennt zusaetzlich die Bleche.
  {
    const erg = K.pruefeGeschoss([{ id: "A", lage: lA }, { id: "B", lage: lB }], [], null,
      { A: V(12, 13, 0), B: V(15, 16, 0) });
    ok("[A-32]/[K-13] gleiche Startlage: Kollision mit „Bodenbleche überlagern sich“",
      erg.kollisionen.length === 1 && erg.kollisionen[0].bodenbleche === "ueberlagern"
      && /Bodenbleche überlagern sich/.test(erg.kollisionen[0].meldung));
    const ohne = K.pruefeGeschoss([{ id: "A", lage: lA }, { id: "B", lage: lB }], [], null, {});
    ok("[A-32] eine Kollision ohne Verzahnungsdaten bleibt bit-genau die alte",
      ohne.kollisionen.length === 1 && !("bodenbleche" in ohne.kollisionen[0])
      && !/Bodenblech/.test(ohne.kollisionen[0].meldung));
  }
}

// ---------------------------------------------------------------------------------------------
console.log("\nWARNFAELLE und BESTAND [A-32]:");
{
  // Sonderzuschnitt durch die Kuerzung: 3000 mm aus nur 1000 mm geht ohne Kuerzung exakt auf,
  // mit Kuerzung nicht — benannt, nicht still hingenommen.
  const S = buildWall("S", 3000, 2000, [], null, { blech_lengths_mm: [1000] }, [], V(0, 1, 1));
  ok("[A-32]/[A-10] nicht aus Standardlaengen zerlegbar: sichtbare Warnung mit Fertigmass",
    (S.validation.verzahnung_bodenblech || []).some((h) => h.grund === "sonderzuschnitt"
      && h.x0_mm === 125 && h.x1_mm === 3000 && h.fertigmass_mm === 873));
  // Steinfuge genau an der Kuerzungsgrenze: breiter Bereich, Grenze trifft eine Fuge der Lage 1.
  let gefunden = null;
  for (const b of [2, 3, 4, 5, 6]) for (const L of [1500, 1750, 2000, 2250, 2500]) {
    const w = buildWall("F", L, 2000, [], null, null, [], V(0, b, 1));
    if (w.courses[0].joints_grid.includes(b)) { gefunden = { w, b }; break; }
    if (gefunden) break;
  }
  ok("[A-32]/[A-11] Steinfuge der untersten Lage an der Kuerzungsgrenze wird gemeldet",
    !!gefunden && (gefunden.w.validation.verzahnung_bodenblech || [])
      .some((h) => h.grund === "fuge_an_kuerzung" && h.grid === gefunden.b));
  // Spannachse im gekuerzten Feld: benannt (Fussschraube auf dem Blech der Partnerwand); die
  // Stueckliste zaehlt die Schraube weiter (sie ist eingebaut), aber kein eigenes Blech dort.
  const B3 = buildWall("B3", 2000, 2000, [], null, null, [], V(0, 3, 1));
  const achsen = B3.tension_columns.filter((c) => c.k < 3).map((c) => c.k);
  ok("[A-32] Spannachse im gekuerzten Feld wird benannt, Schraubenmenge bleibt",
    achsen.length > 0
    && achsen.every((k) => B3.validation.verzahnung_bodenblech.some((h) => h.grund === "achse_auf_partnerblech" && h.k === k))
    && B3.bom.senkkopfschrauben === buildWall("B3", 2000, 2000, [], null, null, [], V(0, 3, 0)).bom.senkkopfschrauben);
  // Manuelle Aussparungen bleiben zusaetzlich moeglich — Vereinigung, nichts wird gespeichert.
  const M = buildWall("M", 3000, 2000, [], null, { base_plate_aussparungen_grid: [1, 10] }, [],
    [{ g0: 0, g1: 1, start_parity: 1 }, { g0: 23, g1: 24, start_parity: 1 }]);
  ok("[A-32]/[A-28] Vereinigung: manuelle Felder bleiben die gespeicherte Wahl, Luecken sind die Vereinigung",
    JSON.stringify(M.prestress.base_plate_aussparungen_grid) === "[1,10]"
    && JSON.stringify(M.base_plate.aussparungen.map((l) => [l.g0, l.g1])) === "[[0,2],[10,11],[23,24]]"
    && M.base_plate.verzahnung_kuerzungen.length === 2);
  ok("[A-32] leere Luecken (Kreuzsymbol) nur dort, wo kein Partnerblech liegt",
    JSON.stringify(bodenblechLeereLuecken(M).map((l) => [l.g0, l.g1])) === "[[1,2],[10,11]]");
  // Bestand: Waende ohne Verzahnung am Wandende bleiben bit-gleich.
  const ohne = buildWall("O", 2500, H, [], null, null, [], []);
  const mitte0 = buildWall("O", 2500, H, [], null, null, [], V(8, 9, 0));
  ok("[A-32] ohne Verzahnung: kein neues Feld", !("verzahnung_kuerzungen" in ohne.base_plate)
    && !("verzahnung_bodenblech" in ohne.validation));
  ok("[A-32] Verzahnung mitten in der Wand mit ausgesparter unterster Lage: kein Befund, keine Kuerzung",
    !("verzahnung_kuerzungen" in mitte0.base_plate) && !("verzahnung_bodenblech" in mitte0.validation));
}

console.log(`\n${pass}/${pass + fail} ok`);
if (fail) process.exit(1);
