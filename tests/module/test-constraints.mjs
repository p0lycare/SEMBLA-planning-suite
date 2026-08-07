// Logik-Test des Constraint-Loesers (docs/shared/sembla-constraints.js).
// Prueft das Regelwerk Kapitel 16.10: [K-1] getrennte Achsen, [K-2] drei Bezuege,
// [K-3] treibende Masse, [K-4] ein Grundbezug, [K-5] deterministische Loesung,
// [K-6] Widerspruch, [K-7] Redundanz, [K-8] Zustand/Farbe, [K-9] Ziehen,
// [K-10] Positionsdaten im Geschoss, [K-11] Laengenmass, [K-12] Millimeter,
// [K-13] Kollision. Dazu [L-1] Positions-/Laengenraster und [L-2] Orthogonalitaet.
//
// Aufruf:  node tests/module/test-constraints.mjs

const K = await import("../../docs/shared/sembla-constraints.js");
const M = await import("../../docs/shared/sembla-projektmappe.js");

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };

/** Kurzschreibweise fuer eine Wand. */
const w = (id, x, y, richtung, laenge_grid) =>
  ({ id, lage: { start_mm: { x, y }, richtung, laenge_grid } });
/** Kurzschreibweise fuer eine Bemassung. */
const b = (id, achse, von, bis, mass_mm) => ({ id, achse, von, bis, mass_mm });
const p = (wand, bezug) => ({ wand, bezug });

// --- Konstanten ------------------------------------------------------------

t("[G-1] Laengsraster stimmt mit der Projektmappe ueberein (kein Drift)", K.GRID_MM === M.GRID_MM);
t("[L-1] Wandbreite konstant 125 mm", K.BREITE_MM === 125 && K.HALB_BREITE_MM === 62.5);
t("[K-1] genau zwei Achsen", K.ACHSEN.length === 2);
t("[K-2] genau drei Bezuege", K.BEZUEGE.join(",") === "min,mitte,max");

// --- [L-1]/[L-2] Lage ------------------------------------------------------

t("[L-1] gueltige Lage", K.lageFehler(w("a", 1000, 2000, "x", 24).lage).length === 0);
t("[L-1] unverortet (null) ist kein Fehler", K.lageFehler(null).length === 0);
t("[L-1] halbe Millimeter sind zulaessig (Kante ↔ Mittellinie)",
  K.lageFehler({ start_mm: { x: 1062.5, y: 0 }, richtung: "x", laenge_grid: 8 }).length === 0);
t("[L-1] Viertelmillimeter wird abgewiesen, nicht gerundet",
  K.lageFehler({ start_mm: { x: 1000.25, y: 0 }, richtung: "x", laenge_grid: 8 })
    .some((m) => /0,5 mm/.test(m)));
t("[L-1] Laenge ausserhalb des Rasters wird abgewiesen",
  K.lageFehler({ start_mm: { x: 0, y: 0 }, richtung: "x", laenge_grid: 3.7 }).length === 1);
t("[L-1] Laenge 0 ist unzulaessig",
  K.lageFehler({ start_mm: { x: 0, y: 0 }, richtung: "x", laenge_grid: 0 }).length === 1);
t("[L-2] schraege Richtung wird abgewiesen, nicht genaehert",
  K.lageFehler({ start_mm: { x: 0, y: 0 }, richtung: "xy", laenge_grid: 4 })
    .some((m) => /L-2/.test(m)));
t("[L-1] Laenge in mm = laenge_grid × 125", K.laengeMm(w("a", 0, 0, "x", 24).lage) === 3000);

// --- [K-2] Bezuege ---------------------------------------------------------

const A = w("A", 1000, 2000, "x", 8);          // 1000 mm lang, laeuft in x
t("[K-2] laengs: min = Ankerpunkt", K.bezugsWert(A.lage, "x", "min") === 1000);
t("[K-2] laengs: mitte = Anker + L/2", K.bezugsWert(A.lage, "x", "mitte") === 1500);
t("[K-2] laengs: max = Anker + L", K.bezugsWert(A.lage, "x", "max") === 2000);
t("[K-2] quer: mitte = Ankerpunkt (Mittellinie)", K.bezugsWert(A.lage, "y", "mitte") === 2000);
t("[K-2] quer: min = Mittellinie − 62,5", K.bezugsWert(A.lage, "y", "min") === 1937.5);
t("[K-2] quer: max = Mittellinie + 62,5", K.bezugsWert(A.lage, "y", "max") === 2062.5);

const B = w("B", 500, 300, "y", 4);            // 500 mm lang, laeuft in y
t("[K-2] Richtung y: laengs ist jetzt die y-Achse", K.bezugsWert(B.lage, "y", "max") === 800);
t("[K-2] Richtung y: quer ist die x-Achse", K.bezugsWert(B.lage, "x", "max") === 562.5);

t("[K-2] Rechteck einer x-Wand ist 125 mm breit", (() => {
  const r = K.wandRechteck(A.lage);
  return r.x_min === 1000 && r.x_max === 2000 && r.y_min === 1937.5 && r.y_max === 2062.5;
})());

// --- [K-3]/[K-12] Bemassungen validieren -----------------------------------

const lagen = new Map([["A", A.lage], ["B", B.lage]]);
t("[K-3] gueltige Bemassung", K.bemassungFehler(b("d1", "x", p("A", "max"), p("B", "min"), 400), lagen).length === 0);
t("[K-3] Mass fehlt ⇒ Fehler (kein rein messendes Mass)",
  K.bemassungFehler({ id: "d", achse: "x", von: p("A", "max"), bis: p("B", "min") }, lagen)
    .some((m) => /K-3/.test(m)));
t("[K-12] Nachkommastelle im Mass wird abgewiesen",
  K.bemassungFehler(b("d", "x", p("A", "max"), p("B", "min"), 400.5), lagen).some((m) => /K-12/.test(m)));
t("[K-3] negatives Mass wird abgewiesen",
  K.bemassungFehler(b("d", "x", p("A", "max"), p("B", "min"), -400), lagen).length > 0);
t("[K-3] Mass 0 ist zulaessig (buendig)",
  K.bemassungFehler(b("d", "x", p("A", "max"), p("B", "min"), 0), lagen).length === 0);
t("[K-1] fehlende Achse wird abgewiesen",
  K.bemassungFehler({ id: "d", von: p("A", "max"), bis: p("B", "min"), mass_mm: 400 }, lagen)
    .some((m) => /K-1/.test(m)));
t("[K-2] unbekannter Bezug wird abgewiesen",
  K.bemassungFehler(b("d", "x", p("A", "ecke"), p("B", "min"), 400), lagen).some((m) => /K-2/.test(m)));
t("[K-10] Verweis auf unbekannte Wand wird gemeldet",
  K.bemassungFehler(b("d", "x", p("A", "max"), p("Z", "min"), 400), lagen).some((m) => /K-10/.test(m)));
t("[K-2] Wanddicke ist nicht bemassbar",
  K.bemassungFehler(b("d", "y", p("A", "min"), p("A", "max"), 125), lagen).some((m) => /K-2/.test(m)));
t("[K-4] Ursprung ist nur als Startbezug zulaessig",
  K.bemassungFehler({ id: "d", achse: "x", von: p("A", "min"), bis: null, mass_mm: 100 }, lagen)
    .some((m) => /K-4/.test(m)));
t("[K-4] Fixieren = Bemassung vom Ursprung ist gueltig",
  K.bemassungFehler(b("f", "x", null, p("A", "min"), 1000), lagen).length === 0);
t("[L-4] doppelte Kennung wird gemeldet",
  K.bemassungenFehler([b("d", "x", p("A", "max"), p("B", "min"), 400),
                       b("d", "y", p("A", "mitte"), p("B", "mitte"), 400)], lagen)
    .some((m) => /doppelt/.test(m)));

// --- [K-11] Laengenmass ----------------------------------------------------

t("[K-11] Laengenmass wird erkannt", K.istLaengenmass(b("L", "x", p("A", "min"), p("A", "max"), 1000), lagen));
t("[K-11] quer ist es kein Laengenmass", !K.istLaengenmass(b("L", "y", p("A", "min"), p("A", "max"), 125), lagen));
t("[K-11] Vielfaches von 125 ist zulaessig", K.pruefeLaengenmass(3000).ok);
t("[K-11] krummes Mass wird abgewiesen, nicht gerundet", !K.pruefeLaengenmass(3050).ok);
t("[K-11] die Meldung nennt beide naechstliegenden Masse", (() => {
  const r = K.pruefeLaengenmass(3050);
  return r.naechste[0] === 3000 && r.naechste[1] === 3125 && /3000/.test(r.meldung) && /3125/.test(r.meldung);
})());
t("[K-11] Laenge unter einem Raster wird abgewiesen", !K.pruefeLaengenmass(0).ok);
t("[K-11] krummes Laengenmass faellt in der Validierung auf",
  K.bemassungFehler(b("L", "x", p("A", "min"), p("A", "max"), 3050), lagen).some((m) => /K-11/.test(m)));

// --- [K-4]/[K-5] Loesen ----------------------------------------------------

{
  const waende = [w("A", 0, 0, "x", 8), w("B", 9999, 9999, "x", 8)];
  const masse = [
    b("f1", "x", null, p("A", "min"), 1000),          // A fixieren
    b("f2", "y", null, p("A", "mitte"), 2000),
    b("d1", "x", p("A", "min"), p("B", "min"), 3000), // B relativ zu A
    b("d2", "y", p("A", "mitte"), p("B", "mitte"), 1500),
  ];
  const e = K.loese(waende, masse);
  t("[K-4] fixierte Wand ist in beiden Achsen bestimmt", e.bestimmt.A.x && e.bestimmt.A.y);
  t("[K-4] Kette zum Ursprung macht auch B bestimmt", e.bestimmt.B.x && e.bestimmt.B.y);
  t("[K-4] Position folgt den Massen, nicht dem gespeicherten Wert",
    e.positionen.A.x === 1000 && e.positionen.A.y === 2000
    && e.positionen.B.x === 4000 && e.positionen.B.y === 3500);
  t("[K-4] nichts bleibt offen", e.offen.length === 0);
  t("[K-6] kein Widerspruch, [K-7] keine Redundanz",
    e.widersprueche.length === 0 && e.redundanzen.length === 0);
  t("[K-3] keine Validierungsfehler", e.fehler.length === 0);

  // [K-5] Determinismus: andere Reihenfolge, gleiches Ergebnis
  const gedreht = K.loese(waende, [masse[3], masse[1], masse[2], masse[0]]);
  t("[K-5] Reihenfolge der Masse aendert das Ergebnis nicht",
    JSON.stringify(gedreht.positionen) === JSON.stringify(e.positionen));
  const nochmal = K.loese(waende, masse);
  t("[K-5] zweimal geloest ⇒ bit-genau gleich",
    JSON.stringify(nochmal) === JSON.stringify(e));
}

// --- [K-2] gemischte Bezuege: Kante ↔ Mittellinie --------------------------

{
  const waende = [w("A", 0, 0, "x", 8), w("B", 0, 0, "x", 8)];
  const e = K.loese(waende, [
    b("f", "y", null, p("A", "mitte"), 1000),
    b("d", "y", p("A", "max"), p("B", "mitte"), 500),   // Kante → Mittellinie
  ]);
  t("[K-2] Kante ↔ Mittellinie ergibt den halben Millimeter",
    e.positionen.B.y === 1562.5);
  t("[L-1] das Ergebnis bleibt ein gueltiges Vielfaches von 0,5 mm",
    K.lageFehler({ start_mm: e.positionen.B, richtung: "x", laenge_grid: 8 }).length === 0);
}

// --- [K-1] getrennte Achsen ------------------------------------------------

{
  const waende = [w("A", 700, 800, "x", 8)];
  const e = K.loese(waende, [b("f", "x", null, p("A", "min"), 1000)]);
  t("[K-1] nur x bemasst ⇒ nur x bestimmt", e.bestimmt.A.x && !e.bestimmt.A.y);
  t("[K-1] die freie Achse behaelt ihren gespeicherten Wert", e.positionen.A.y === 800);
  t("[K-1] die bestimmte Achse folgt dem Mass", e.positionen.A.x === 1000);
  t("[K-8] halb bestimmt ist nicht „bestimmt“", K.zustand("A", e) === "frei");
}

// --- [K-6] Widerspruch -----------------------------------------------------

{
  const waende = [w("A", 0, 0, "x", 8), w("B", 0, 0, "x", 8)];
  const e = K.loese(waende, [
    b("f", "x", null, p("A", "min"), 0),
    b("d1", "x", p("A", "min"), p("B", "min"), 3000),
    b("d2", "x", p("A", "min"), p("B", "min"), 3200),     // widerspricht d1
  ]);
  t("[K-6] Widerspruch wird gemeldet", e.widersprueche.length === 1);
  t("[K-6] die Meldung nennt die Differenz in mm", e.widersprueche[0].differenz_mm === 200);
  t("[K-6] die Meldung nennt das andere beteiligte Mass", e.widersprueche[0].konflikt_mit === "d1");
  t("[K-6] der letzte widerspruchsfreie Stand bleibt (d1 gilt)", e.positionen.B.x === 3000);
  t("[K-6] nichts wird gemittelt", e.positionen.B.x !== 3100);
  t("[K-8] beide Waende sind fehlerhaft",
    e.fehlerhafteWaende.join(",") === "A,B" && K.zustand("B", e) === "fehler");
  t("[K-8] rot schlaegt gruen (aktive Wand)", K.zustand("B", e, { aktiv: "B" }) === "fehler");
  t("[K-6] das widersprechende Mass bleibt erhalten (nicht geloescht)",
    e.widersprueche[0].bemassung === "d2");
}

// --- [K-7] Redundanz -------------------------------------------------------

{
  const waende = [w("A", 0, 0, "x", 8), w("B", 0, 0, "x", 8)];
  const e = K.loese(waende, [
    b("f", "x", null, p("A", "min"), 0),
    b("d1", "x", p("A", "min"), p("B", "min"), 3000),
    b("d2", "x", p("A", "min"), p("B", "min"), 3000),     // dasselbe noch einmal
  ]);
  t("[K-7] widerspruchsfreie Wiederholung ist redundant, kein Fehler",
    e.redundanzen.length === 1 && e.widersprueche.length === 0);
  t("[K-7] sie bleibt wirksam und aendert nichts", e.positionen.B.x === 3000);
  t("[K-7] redundant faerbt die Wand nicht rot", K.zustand("B", e) !== "fehler");
}

// --- [K-4] ohne Grundbezug -------------------------------------------------

{
  const waende = [w("A", 500, 700, "x", 8), w("B", 0, 0, "x", 8)];
  const e = K.loese(waende, [b("d", "x", p("A", "min"), p("B", "min"), 3000)]);
  t("[K-4] ohne Kette zum Ursprung ist nichts bestimmt",
    !e.bestimmt.A.x && !e.bestimmt.B.x);
  t("[K-4] es wird kein Ersatzbezug erfunden", e.offen.length === 2);
  t("[K-4] die Gruppe bleibt in sich stimmig (Mass gilt trotzdem)",
    e.positionen.B.x - e.positionen.A.x === 3000);
  t("[K-4] verankert wird an der kleinsten Kennung ⇒ A behaelt seinen Wert",
    e.positionen.A.x === 500);
  t("[K-8] frei ⇒ hellblau", K.farbe("A", e) === K.FARBEN.frei);
}

// --- [K-8] Zustaende und Vorrang -------------------------------------------

{
  const waende = [w("A", 0, 0, "x", 8)];
  const e = K.loese(waende, [b("f1", "x", null, p("A", "min"), 0), b("f2", "y", null, p("A", "mitte"), 0)]);
  t("[K-8] bestimmt ⇒ schwarz", K.farbe("A", e) === K.FARBEN.bestimmt);
  t("[K-8] aktiv ⇒ gruen", K.farbe("A", e, { aktiv: "A" }) === K.FARBEN.aktiv);
  t("[K-8] Kollision ⇒ rot, auch wenn aktiv",
    K.farbe("A", e, { aktiv: "A", kollisionen: [{ a: "A", b: "B" }] }) === K.FARBEN.fehler);
  t("[K-8] vier Zustaende, vier Farben", Object.keys(K.FARBEN).length === 4);
}

// --- [K-13] Kollision ------------------------------------------------------

{
  // A laeuft in x bei y=0, B kreuzt in y bei x=500 ⇒ Ueberlappung 125 × 125
  const waende = [w("A", 0, 0, "x", 8), w("B", 500, -500, "y", 8)];
  const k = K.kollisionen(waende);
  t("[K-13] kreuzende Waende kollidieren", k.length === 1);
  t("[K-13] das Ueberlappungsmass steht in mm",
    k[0].ueberlappung_mm.x === 125 && k[0].ueberlappung_mm.y === 125);
  t("[K-13] die Meldung nennt beide Waende", /A/.test(k[0].meldung) && /B/.test(k[0].meldung));
  t("[K-13] nichts wird verschoben oder gekuerzt",
    waende[1].lage.start_mm.x === 500 && waende[1].lage.laenge_grid === 8);
}

{
  // Ecke als Stoss: B endet buendig an der Laengskante von A ⇒ keine Kollision
  const A2 = w("A", 0, 0, "x", 8);            // y von −62,5 bis +62,5
  const B2 = w("B", 500, 62.5, "y", 8);       // startet genau an der Kante von A
  t("[K-13] buendiges Beruehren ist keine Kollision", K.kollisionen([A2, B2]).length === 0);

  const C2 = w("C", 500, 0, "y", 8);          // ragt 62,5 mm in A hinein
  const k = K.kollisionen([A2, C2]);
  t("[K-13] Ueberlappung von 62,5 mm wird erkannt",
    k.length === 1 && k[0].ueberlappung_mm.y === 62.5);
}

{
  const gleich = [w("A", 0, 0, "x", 8), w("B", 0, 0, "x", 8)];
  t("[K-13] deckungsgleiche Waende kollidieren", K.kollisionen(gleich).length === 1);
  t("[K-13] Reihenfolge der Paare ist deterministisch",
    K.kollisionen(gleich)[0].a === "A" && K.kollisionen(gleich)[0].b === "B");
  t("[K-13] unverortete Waende kollidieren nie",
    K.kollisionen([{ id: "A", lage: null }, { id: "B", lage: null }]).length === 0);
}

{
  // Kollision wird an der GELOESTEN Position geprueft, nicht an der gespeicherten
  const waende = [w("A", 0, 0, "x", 8), w("B", 99999, 0, "x", 8)];
  const g = K.pruefeGeschoss(waende, [
    b("f", "x", null, p("A", "min"), 0),
    b("d", "x", p("A", "min"), p("B", "min"), 0),      // B auf A schieben
    b("fy", "y", null, p("A", "mitte"), 0),
    b("dy", "y", p("A", "mitte"), p("B", "mitte"), 0),
  ]);
  t("[K-13] geprueft wird die geloeste Lage", g.kollisionen.length === 1);
  t("[K-8] eine Kollision faerbt beide Waende rot",
    K.zustand("A", g, { kollisionen: g.kollisionen }) === "fehler"
    && K.zustand("B", g, { kollisionen: g.kollisionen }) === "fehler");
}

// --- [K-9] Ziehen ----------------------------------------------------------

{
  const waende = [w("A", 0, 0, "x", 8), w("B", 3000, 0, "x", 8), w("C", 8000, 0, "x", 8)];
  const masse = [b("d", "x", p("A", "min"), p("B", "min"), 3000)];   // A und B haengen zusammen
  const r = K.verschiebe(waende, masse, "A", { x: 250, y: 0 });
  const nach = Object.fromEntries(r.waende.map((x) => [x.id, x.lage.start_mm]));
  t("[K-9] die gezogene Wand bewegt sich", nach.A.x === 250);
  t("[K-9] die starre Gruppe wandert mit", nach.B.x === 3250);
  t("[K-9] das Mass bleibt unveraendert gueltig", nach.B.x - nach.A.x === 3000);
  t("[K-9] eine fremde Wand bleibt stehen", nach.C.x === 8000);
  t("[K-9] die Bemassung selbst wird nicht angefasst", masse[0].mass_mm === 3000);
  t("[K-9] gemeldet wird, wer bewegt wurde", r.bewegt.join(",") === "A,B");
  t("[K-9] die Eingabeliste bleibt unveraendert", waende[0].lage.start_mm.x === 0);
}

{
  const waende = [w("A", 0, 0, "x", 8)];
  const r = K.verschiebe(waende, [b("f", "x", null, p("A", "min"), 1000)], "A", { x: 250, y: 250 });
  const nach = r.waende[0].lage.start_mm;
  t("[K-9] eine in x bestimmte Wand laesst sich dort nicht ziehen",
    r.gesperrt.x === true && nach.x === 1000);
  t("[K-9] der Grund wird benannt", r.meldungen.some((m) => /K-9/.test(m)));
  t("[K-1] die freie Achse bleibt ziehbar", r.gesperrt.y === false && nach.y === 250);
}

// --- [K-10] Positionsdaten -------------------------------------------------

{
  const e = K.loese([w("A", 0, 0, "x", 8)], [b("f", "x", null, p("A", "min"), 0)]);
  t("[K-10] der Loeser liefert nur Lagedaten, keine Wandgeometrie",
    !("length_mm" in e.positionen.A) && Object.keys(e.positionen.A).join(",") === "x,y");
}

// --- Randfaelle ------------------------------------------------------------

{
  t("[K-5] leeres Geschoss ist kein Fehler", (() => {
    const e = K.loese([], []);
    return e.ids.length === 0 && e.offen.length === 0 && e.fehler.length === 0;
  })());
  t("[K-4] unverortete Waende werden uebergangen, nicht erfunden", (() => {
    const e = K.loese([{ id: "A", lage: null }], []);
    return e.ids.length === 0 && !e.positionen.A;
  })());
  t("[K-11] ein Laengenmass wirkt nicht auf die Position", (() => {
    const e = K.loese([w("A", 700, 0, "x", 8)], [b("L", "x", p("A", "min"), p("A", "max"), 1000)]);
    return !e.bestimmt.A.x && e.positionen.A.x === 700;
  })());
  t("[K-3] ein ungueltiges Mass wird gemeldet und nicht angewandt", (() => {
    const e = K.loese([w("A", 700, 0, "x", 8)], [b("d", "x", null, p("A", "min"), 12.5)]);
    return e.fehler.length > 0 && !e.bestimmt.A.x && e.positionen.A.x === 700;
  })());
}

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
