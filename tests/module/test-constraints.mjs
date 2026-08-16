// Logik-Test des Constraint-Loesers (docs/shared/sembla-constraints.js).
// Prueft das Regelwerk Kapitel 16.10: [K-1] getrennte Achsen, [K-2] drei Bezuege,
// [K-3] treibende Masse, [K-4] ein Grundbezug, [K-5] deterministische Loesung,
// [K-6] Widerspruch, [K-7] Redundanz, [K-8] Zustand/Farbe, [K-9] Ziehen,
// [K-10] Positionsdaten im Geschoss, [K-11] Laengenmass, [K-12] Millimeter,
// [K-13] Kollision samt der einen Ausnahme fuer wechselseitig passende
// Verzahnungsbereiche (#83). Dazu [L-1] Positions-/Laengenraster und
// [L-2] Orthogonalitaet.
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

// --- Was die Bedienung von C4b braucht ------------------------------------
// Die Oberflaeche (docs/geschossplan.html) baut D und F ausschliesslich auf
// diesen reinen Funktionen auf; hier stehen die Zusagen, auf die sie sich stuetzt.

{
  // [K-2]/[K-1]: Jeder Bezug gehoert genau EINER Achse — deshalb kann die Achse
  // dem Bezug folgen und muss nicht getrennt gewaehlt werden.
  t("[K-2] es gibt genau sechs Bezuege je Wand, drei je Achse", (() => {
    const l = w("A", 0, 1062.5, "x", 16).lage;
    const werte = [];
    for (const a of K.ACHSEN) for (const bz of K.BEZUEGE) werte.push(K.bezugsWert(l, a, bz));
    return werte.length === 6 && werte.every(v => v != null)
      && K.ACHSEN.length === 2 && K.BEZUEGE.length === 3;
  })());
  t("[K-2] die Bezuege einer Achse sind paarweise verschieden (eindeutig anklickbar)", (() => {
    const l = w("A", 0, 1062.5, "x", 16).lage;
    const x = K.BEZUEGE.map(bz => K.bezugsWert(l, "x", bz));
    const y = K.BEZUEGE.map(bz => K.bezugsWert(l, "y", bz));
    return new Set(x).size === 3 && new Set(y).size === 3
      && x.join() === "0,1000,2000" && y.join() === "1000,1062.5,1125";
  })());

  // [K-4]: Der Ursprung ist der START einer Bemassung. Genau darauf setzt das
  // Werkzeug „Fixieren" auf — eine zweite Fixierungsstruktur gibt es nicht.
  t("[K-4] der Ursprung ist als Startbezug zulaessig (Fixieren)", (() => {
    const e = K.loese([w("A", 700, 0, "x", 8)], [b("f", "x", null, p("A", "min"), 1500)]);
    return e.fehler.length === 0 && e.bestimmt.A.x === true && e.positionen.A.x === 1500;
  })());
  t("[K-4] der Ursprung als ZIEL wird abgewiesen (Vorzeichen kehrte sich um)", (() => {
    const f = K.bemassungFehler(b("f", "x", p("A", "min"), null, 1500));
    return f.some(m => /Zielbezug fehlt/.test(m) && /K-4/.test(m));
  })());
  t("[K-4] Fixieren setzt GENAU eine Achse fest — die andere bleibt frei", (() => {
    const e = K.loese([w("A", 700, 300, "x", 8)], [b("f", "x", null, p("A", "min"), 1500)]);
    return e.bestimmt.A.x === true && e.bestimmt.A.y === false && e.offen.length === 1;
  })());
  t("[K-4] zwei Fixierungen — je Achse eine — machen die Wand vollstaendig bestimmt", (() => {
    const e = K.loese([w("A", 700, 300, "x", 8)],
      [b("fx", "x", null, p("A", "min"), 1500), b("fy", "y", null, p("A", "mitte"), 800)]);
    return e.offen.length === 0 && e.positionen.A.x === 1500 && e.positionen.A.y === 800;
  })());
  t("[K-3] ein negatives Mass wird abgewiesen (auch beim Fixieren)",
    K.bemassungFehler(b("f", "x", null, p("A", "min"), -100)).some(m => /nicht negativ/.test(m)));

  // [K-11]: Die Oberflaeche rechnet aus dem geprueften Mass die neue Laenge —
  // gerundet wird dabei nie, und das Wandelement bleibt aussen vor ([L-3]).
  t("[K-11] ein krummes Laengenmass nennt beide Nachbarmasse", (() => {
    const p1 = K.pruefeLaengenmass(1300);
    return !p1.ok && p1.naechste[0] === 1250 && p1.naechste[1] === 1375
      && /1250 mm oder 1375 mm/.test(p1.meldung);
  })());
  t("[K-11] ein gueltiges Laengenmass geht glatt in Rastereinheiten auf", (() => {
    const p1 = K.pruefeLaengenmass(1000);
    return p1.ok && 1000 / K.GRID_MM === 8;
  })());
  t("[K-11] die Laenge bleibt getrieben: das Mass macht die Position nicht bestimmt", (() => {
    const e = K.loese([w("A", 0, 0, "x", 16)], [b("L", "x", p("A", "min"), p("A", "max"), 2000)]);
    return e.bestimmt.A.x === false && e.fehler.length === 0;
  })());
  t("[K-2] zwei Bezuege derselben Wand quer zur Laengsachse sind kein Mass (Wanddicke)", (() => {
    const lagen = new Map([["A", w("A", 0, 0, "x", 16).lage]]);
    return K.bemassungFehler(b("q", "y", p("A", "min"), p("A", "max"), 125), lagen)
      .some(m => /Wanddicke/.test(m));
  })());
}

// --- Laengenmass anwenden: Mass und Laenge in EINEM Mappenstand ------------
// Die Oberflaeche setzt Bemassung und neue Laenge zusammen; hier steht, dass die
// beiden reinen Operationen dabei zusammenpassen und nichts stillschweigend
// zurechtgebogen wird ([K-11]/[L-3]).

{
  const mappe = () => {
    let m = M.leereMappe("Test", { geschoss: "EG", hoehe_mm: 2600 });
    const gs = M.alleGeschosse(m)[0].geschoss.id;
    m = M.setzeWand(m, gs, { id: "A", name: "A",
      lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 16 } });
    return { m, gs };
  };
  const laengenmass = (mass) => b("L", "x", p("A", "min"), p("A", "max"), mass);

  t("[K-11] ein krummes Laengenmass wird schon von setzeBemassung abgewiesen", (() => {
    const { m, gs } = mappe();
    try { M.setzeBemassung(m, gs, laengenmass(1300)); return false; }
    catch (e) { return /1250 mm oder 1375 mm/.test(e.message); }
  })());
  t("[K-11] der Speicher bleibt bei einem abgewiesenen Mass unveraendert ([P-9])", (() => {
    const { m, gs } = mappe();
    const vorher = JSON.stringify(m);
    try { M.setzeBemassung(m, gs, laengenmass(1300)); } catch { /* erwartet */ }
    return JSON.stringify(m) === vorher;
  })());
  t("[K-11] Mass und neue Laenge stehen in EINEM Mappenstand", (() => {
    const { m, gs } = mappe();
    let n = M.setzeBemassung(m, gs, laengenmass(1000));
    const l = M.normLage(M.findeWand(n, "A").wand.lage);
    n = M.setzeLage(n, "A", { ...l, laenge_grid: 1000 / M.GRID_MM });
    const wand = M.findeWand(n, "A").wand;
    return M.validiereMappe(n).length === 0 && wand.lage.laenge_grid === 8
      && wand.lage.start_mm.x === 0 && M.bemassungen(n, gs).length === 1
      && M.bemassungen(n, gs)[0].mass_mm === 1000;
  })());
  t("[K-11] der Anker bleibt stehen — nur die max-Stirnkante wandert", (() => {
    const { m, gs } = mappe();
    let n = M.setzeBemassung(m, gs, laengenmass(1000));
    n = M.setzeLage(n, "A", { ...M.normLage(M.findeWand(n, "A").wand.lage), laenge_grid: 8 });
    const r = K.wandRechteck(M.findeWand(n, "A").wand.lage);
    return r.x_min === 0 && r.x_max === 1000;
  })());
  t("[K-10] Mass und Lage liegen beide im Geschoss, nichts davon am Wandelement", (() => {
    const { m, gs } = mappe();
    const n = M.setzeBemassung(m, gs, laengenmass(1000));
    const geschoss = M.alleGeschosse(n)[0].geschoss;
    return Array.isArray(geschoss.bemassungen) && geschoss.bemassungen.length === 1
      && geschoss.waende[0].lage != null;
  })());
  t("[K-6] ein widerspruechliches Mass wird gespeichert, nicht abgewiesen", (() => {
    const { m, gs } = mappe();
    let n = M.setzeWand(m, gs, { id: "B", name: "B",
      lage: { start_mm: { x: 0, y: 2062.5 }, richtung: "x", laenge_grid: 16 } });
    n = M.setzeBemassung(n, gs, b("d1", "y", p("A", "mitte"), p("B", "mitte"), 2000));
    n = M.setzeBemassung(n, gs, b("d2", "y", p("A", "min"), p("B", "min"), 2500));
    const e = K.loese(M.alleGeschosse(n)[0].geschoss.waende, M.bemassungen(n, gs));
    return M.bemassungen(n, gs).length === 2 && e.widersprueche.length === 1
      && e.widersprueche[0].differenz_mm === 500
      && e.positionen.B.y - e.positionen.A.y === 2000;      // letzter widerspruchsfreier Stand
  })());
  t("[K-7] ein redundantes Mass bleibt gespeichert und wirksam", (() => {
    const { m, gs } = mappe();
    let n = M.setzeWand(m, gs, { id: "B", name: "B",
      lage: { start_mm: { x: 0, y: 2062.5 }, richtung: "x", laenge_grid: 16 } });
    n = M.setzeBemassung(n, gs, b("d1", "y", p("A", "mitte"), p("B", "mitte"), 2000));
    n = M.setzeBemassung(n, gs, b("d2", "y", p("A", "min"), p("B", "min"), 2000));
    const e = K.loese(M.alleGeschosse(n)[0].geschoss.waende, M.bemassungen(n, gs));
    return M.bemassungen(n, gs).length === 2 && e.redundanzen.length === 1
      && e.widersprueche.length === 0;
  })());
}

// --- Querversatz der Massdarstellung: Darstellung, kein Constraint ---------
// `linie_mm` verschiebt die Massdarstellung quer zur Messrichtung. Es ist rein
// darstellend: der Loeser darf es NIE sehen, und ein unbrauchbarer Wert wird
// benannt abgewiesen statt still verworfen ([P-9]).
{
  const bm = (extra) => ({ id: "d1", achse: "y", von: p("A", "mitte"), bis: p("B", "mitte"),
                           mass_mm: 2000, ...extra });
  const mappe = () => {
    let m = M.leereMappe("Test", { geschoss: "EG", hoehe_mm: 2600 });
    const gs = M.alleGeschosse(m)[0].geschoss.id;
    m = M.setzeWand(m, gs, { id: "A", name: "A",
      lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 16 } });
    return { m, gs };
  };
  t("Darstellung: `linie_mm` fehlt im Bestand und normalisiert zu null",
    K.normBemassung(bm({})).linie_mm === null);
  t("Darstellung: ein gesetzter Querversatz wird verlustfrei mitgefuehrt",
    K.normBemassung(bm({ linie_mm: -250 })).linie_mm === -250
    && K.normBemassung(bm({ linie_mm: 0 })).linie_mm === 0);
  t("Darstellung: `linie_mm` steht neben `text_mm`, ohne es zu verdraengen", (() => {
    const n = K.normBemassung(bm({ linie_mm: -250, text_mm: { x: -300, y: 0 } }));
    return n.linie_mm === -250 && n.text_mm.x === -300 && n.text_mm.y === 0;
  })());
  t("Darstellung: ein unbrauchbarer Querversatz wird benannt abgewiesen",
    K.bemassungFehler(bm({ linie_mm: "weit" }), new Map([["A", null], ["B", null]]))
      .some(f => /Querversatz der Maßdarstellung muss eine Zahl/.test(f))
    && K.bemassungFehler(bm({ linie_mm: 0 })).every(f => !/Querversatz der Maßdarstellung/.test(f)));
  t("[K-5] der Loeser rechnet mit und ohne Darstellungsversatz bit-genau gleich", (() => {
    const waende = [w("A", 0, 62.5, "x", 16), w("B", 0, 2062.5, "x", 16)];
    const ohne = K.loese(waende, [bm({}), b("f1", "y", null, p("A", "min"), 0)]);
    const mit = K.loese(waende, [bm({ linie_mm: -900, text_mm: { x: 5, y: 5 } }),
                                 b("f1", "y", null, p("A", "min"), 0)]);
    return JSON.stringify(ohne) === JSON.stringify(mit);
  })());
  t("Darstellung: eine Bemassung mit Querversatz bleibt in der Mappe gueltig", (() => {
    const { m, gs } = mappe();
    let n = M.setzeWand(m, gs, { id: "B", name: "B",
      lage: { start_mm: { x: 0, y: 2062.5 }, richtung: "x", laenge_grid: 16 } });
    n = M.setzeBemassung(n, gs, bm({ linie_mm: -250 }));
    return M.validiereMappe(n).length === 0
      && M.bemassungen(n, gs)[0].linie_mm === -250;
  })());
}

// --- #84 Gerichtete Orientierung und Wandseiten ------------------------------

{
  t("#84 genau vier gerichtete Orientierungen",
    K.ORIENTIERUNGEN.join(",") === "+x,-x,+y,-y");

  // Normalisierung: Altstand ohne Feld -> deterministisch die POSITIVE Richtung
  // der vorhandenen Achse; ein gesetzter Wert bleibt unangetastet.
  t("#84 Altstand ohne Orientierung wird auf +Achse normalisiert (x)",
    K.normLage({ start_mm: { x: 0, y: 0 }, richtung: "x", laenge_grid: 4 }).orientierung === "+x");
  t("#84 Altstand ohne Orientierung wird auf +Achse normalisiert (y)",
    K.normLage({ start_mm: { x: 62.5, y: 0 }, richtung: "y", laenge_grid: 4 }).orientierung === "+y");
  t("#84 eine gesetzte Orientierung bleibt beim Normalisieren erhalten",
    K.normLage({ start_mm: { x: 0, y: 0 }, richtung: "x", orientierung: "-x", laenge_grid: 4 })
      .orientierung === "-x");
  t("#84 unverortet (null) bekommt KEINE erfundene Orientierung",
    K.normLage(null) === null);
  t("#84 die Normalisierung ist verlustfrei: alle uebrigen Felder bleiben bit-genau", (() => {
    const l = K.normLage({ start_mm: { x: 187.5, y: 62.5 }, richtung: "y", laenge_grid: 7 });
    return l.start_mm.x === 187.5 && l.start_mm.y === 62.5 && l.richtung === "y" && l.laenge_grid === 7;
  })());

  // Validierung: nur die vier Werte, und die Achskomponente muss passen.
  t("#84 normalisierter Altstand ist warnungsfrei gueltig",
    K.lageFehler({ start_mm: { x: 0, y: 0 }, richtung: "x", laenge_grid: 4 }).length === 0);
  t("#84 passende negative Orientierung ist gueltig",
    K.lageFehler({ start_mm: { x: 0, y: 0 }, richtung: "y", orientierung: "-y", laenge_grid: 4 }).length === 0);
  t("#84 unbekannter Orientierungswert wird benannt abgewiesen",
    K.lageFehler({ start_mm: { x: 0, y: 0 }, richtung: "x", orientierung: "links", laenge_grid: 4 })
      .some((m2) => /Orientierung/.test(m2)));
  t("#84 zur Achse widerspruechliche Orientierung wird gemeldet, nicht umgedeutet",
    K.lageFehler({ start_mm: { x: 0, y: 0 }, richtung: "x", orientierung: "+y", laenge_grid: 4 })
      .some((m2) => /widerspricht der Achse/.test(m2)));

  // Drehung: der eine Zyklus +x -> +y -> -x -> -y (dieselbe +90°-Drehung, die der
  // Editor geometrisch ausfuehrt); zweimal 90° == wenden, viermal == Identitaet.
  t("#84 90°-Zyklus +x→+y→−x→−y→+x",
    K.dreheOrientierung("+x") === "+y" && K.dreheOrientierung("+y") === "-x"
    && K.dreheOrientierung("-x") === "-y" && K.dreheOrientierung("-y") === "+x");
  t("#84 zweimal 90° ist genau das Wenden",
    K.ORIENTIERUNGEN.every((o) => K.dreheOrientierung(K.dreheOrientierung(o)) === K.wendeOrientierung(o)));
  t("#84 Wenden ist eine Involution",
    K.ORIENTIERUNGEN.every((o) => K.wendeOrientierung(K.wendeOrientierung(o)) === o));
  t("#84 ungueltige Orientierung liefert null statt einer erfundenen",
    K.dreheOrientierung("x") === null && K.wendeOrientierung(null) === null);

  // Wandseiten: die EINE Kantenableitung. Konvention: Vorderseiten-Normale =
  // Orientierung um +90° gedreht (in Blickrichtung rechts, y nach unten).
  const s = (o, richtung) => K.wandSeiten({ start_mm: { x: richtung === "x" ? 0 : 62.5,
    y: richtung === "x" ? 62.5 : 0 }, richtung, orientierung: o, laenge_grid: 4 });
  t("#84 +x: Vorderseite ist die Kante mit groesserem y",
    s("+x", "x").vorder.a.y === 125 && s("+x", "x").vorder.b.y === 125
    && s("+x", "x").rueck.a.y === 0 && s("+x", "x").vorder.aussen.y === 1);
  t("#84 -x: Vorder- und Rueckseite sind gegenueber +x getauscht",
    s("-x", "x").vorder.a.y === 0 && s("-x", "x").rueck.a.y === 125);
  t("#84 +y: Vorderseite ist die Kante mit kleinerem x",
    s("+y", "y").vorder.a.x === 0 && s("+y", "y").rueck.a.x === 125
    && s("+y", "y").vorder.aussen.x === -1);
  t("#84 -y: Vorderseite ist die Kante mit groesserem x",
    s("-y", "y").vorder.a.x === 125 && s("-y", "y").rueck.a.x === 0);
  t("#84 die Seiten folgen der 90°-Drehung wie eine starre Drehung", (() => {
    // Rigid-Rotation-Eigenschaft: die Vorderseiten-Normale der gedrehten
    // Orientierung ist die um +90° gedrehte Normale der Ausgangsorientierung.
    const n = (o) => s(o, o.slice(1)).vorder.aussen;
    return K.ORIENTIERUNGEN.every((o) => {
      const a = n(o), b2 = n(K.dreheOrientierung(o));
      return b2.x === -a.y && b2.y === a.x;
    });
  })());
  t("#84 wandSeiten nutzt die GELOESTE Position, wenn eine uebergeben wird", (() => {
    const r = K.wandSeiten({ start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 4 },
      { x: 250, y: 562.5 });
    return r.vorder.a.x === 250 && r.vorder.a.y === 625;
  })());
  t("#84 unverortete Wand hat keine Seiten", K.wandSeiten(null) === null);
  t("#84 widerspruechliche Orientierung liefert keine Seiten (gemeldet statt umgedeutet)",
    K.wandSeiten({ start_mm: { x: 0, y: 0 }, richtung: "x", orientierung: "+y", laenge_grid: 4 }) === null);

  // Seitendefinition: Kennbuchstabe UND Farbe — und keine [K-8]-Zustandsfarbe.
  t("#84 Seiten tragen Kennbuchstaben V und R",
    K.SEITEN.vorder.kuerzel === "V" && K.SEITEN.rueck.kuerzel === "R");
  t("#84 Seitenfarben sind verschieden und keine Zustandsfarbe aus [K-8]",
    K.SEITEN.vorder.farbe !== K.SEITEN.rueck.farbe
    && !Object.values(K.FARBEN).includes(K.SEITEN.vorder.farbe)
    && !Object.values(K.FARBEN).includes(K.SEITEN.rueck.farbe));

  // Orientierung ist fuer Geometrie und Loeser wirkungslos.
  t("#84 wandRechteck ist orientierungsunabhaengig", (() => {
    const a = K.wandRechteck({ start_mm: { x: 0, y: 62.5 }, richtung: "x", orientierung: "+x", laenge_grid: 4 });
    const b2 = K.wandRechteck({ start_mm: { x: 0, y: 62.5 }, richtung: "x", orientierung: "-x", laenge_grid: 4 });
    return JSON.stringify(a) === JSON.stringify(b2);
  })());
  t("#84 verschiebe() fuehrt die Orientierung unveraendert mit", (() => {
    const waende = [{ id: "a", lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", orientierung: "-x", laenge_grid: 4 } }];
    const r = K.verschiebe(waende, [], "a", { x: 125, y: 0 });
    return r.waende[0].lage.orientierung === "-x" && r.waende[0].lage.start_mm.x === 125;
  })());
}

// --- #84 Projektmappe: Normalisierung, Validierung, Migration, Rundlauf ------
// (Nachweise laut Arbeitspaket hier, weil die Lage-Mathematik hier wohnt.)

{
  const basis = () => {
    let m = M.leereMappe("P", { gebaeude: "G", geschoss: "EG", hoehe_mm: 2600 });
    const gs = m.gebaeude[0].geschosse[0].id;
    return { m, gs };
  };

  t("#84 normWand fuellt den Altstand deterministisch auf +Achse auf",
    M.normWand({ id: "a", lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 4 } })
      .lage.orientierung === "+x");
  t("#84 setzeWand nimmt eine passende negative Orientierung an", (() => {
    const { m, gs } = basis();
    const n = M.setzeWand(m, gs, { id: "a", name: "A",
      lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", orientierung: "-x", laenge_grid: 4 } });
    return M.findeWand(n, "a").wand.lage.orientierung === "-x" && M.validiereMappe(n).length === 0;
  })());
  t("#84 setzeWand weist eine zur Achse widerspruechliche Orientierung benannt ab", (() => {
    const { m, gs } = basis();
    try {
      M.setzeWand(m, gs, { id: "a", name: "A",
        lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", orientierung: "+y", laenge_grid: 4 } });
      return false;
    } catch (e) { return /widerspricht der Achse/.test(String(e.message)); }
  })());
  t("#84 validiereMappe meldet eine widerspruechliche Orientierung im Bestand", (() => {
    const { m, gs } = basis();
    const n = M.setzeWand(m, gs, { id: "a", name: "A",
      lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", orientierung: "-x", laenge_grid: 4 } });
    const kaputt = JSON.parse(JSON.stringify(n));
    kaputt.gebaeude[0].geschosse[0].waende[0].lage.orientierung = "-y";
    return M.validiereMappe(kaputt).some((f) => /widerspricht der Achse/.test(f));
  })());
  t("#84 Export-Rundlauf: mappeObjekt -> parseMappe erhaelt die Orientierung bit-genau", (() => {
    const { m, gs } = basis();
    const n = M.setzeWand(m, gs, { id: "a", name: "A",
      lage: { start_mm: { x: 250, y: 1062.5 }, richtung: "x", orientierung: "-x", laenge_grid: 8 } });
    const zurueck = M.parseMappe(JSON.stringify(M.mappeObjekt(n)));
    const l = M.findeWand(zurueck, "a").wand.lage;
    return l.orientierung === "-x" && l.start_mm.x === 250 && l.laenge_grid === 8;
  })());
  t("#84 Altstand-Datei ohne Orientierung wird beim Lesen normalisiert (verlustfrei)", (() => {
    const { m, gs } = basis();
    const n = M.setzeWand(m, gs, { id: "a", name: "A",
      lage: { start_mm: { x: 0, y: 62.5 }, richtung: "y", laenge_grid: 4 } });
    const roh = M.mappeObjekt(n);
    delete roh.gebaeude[0].geschosse[0].waende[0].lage.orientierung;   // Altstand simulieren
    const l = M.parseMappe(JSON.stringify(roh)).gebaeude[0].geschosse[0].waende[0].lage;
    return l.orientierung === "+y" && l.start_mm.x === 0 && l.laenge_grid === 4;
  })());
  t("#84 Migration v1->v2 bleibt lesbar und normalisiert auf +Achse", (() => {
    const v1 = { format: M.MAPPE_FORMAT, version: 1, projekt: { id: "p", name: "P", kopfdaten: {} },
      gebaeude: [{ id: "g", name: "G", geschosse: [{ id: "gs", name: "EG", hoehe_mm: 2600, plan: null,
        waende: [{ id: "a", name: "A", datei: null,
          lage: { start_grid: { x: 2, y: 4 }, richtung: "x", laenge_grid: 6 } }],
        bemassungen: [] }] }] };
    const m = M.parseMappe(JSON.stringify(v1));
    const l = M.findeWand(m, "a").wand.lage;
    return l.start_mm.x === 250 && l.start_mm.y === 500 && l.orientierung === "+x"
      && M.validiereMappe(m).length === 0;
  })());
}

// --- [K-4] Der Ursprung ist ein gespeicherter Punkt (#76) -----------------
{
  t("#76 fehlender Ursprung = 0/0 (Altstand)",
    K.ursprungPunkt(null).x === 0 && K.ursprungPunkt(undefined).y === 0);
  t("#76 fehlende Einzelkoordinate = 0",
    K.ursprungPunkt({ x: 500 }).x === 500 && K.ursprungPunkt({ x: 500 }).y === 0);
  t("#76 halbe Millimeter sind zulaessig, Viertel nicht",
    K.ursprungFehler({ x: 62.5, y: 0 }).length === 0
    && K.ursprungFehler({ x: 0.25, y: 0 }).some((m) => /0,5 mm/.test(m)));
  t("#76 ein unbrauchbarer Wert wird gemeldet, nicht auf 0 gebogen",
    K.ursprungFehler({ x: "links", y: 0 }).length === 1
    && K.normUrsprung({ x: "links", y: 0 }).x === null);

  const waende = [w("A", 0, 0, "x", 8), w("B", 5000, 0, "x", 8)];
  const masse = [
    b("u", "x", null, p("A", "min"), 1000),          // Ursprungsmass ([K-4])
    b("ab", "x", p("A", "min"), p("B", "min"), 4000), // Wand ↔ Wand: von U unabhaengig
  ];

  // Ohne Ursprungsangabe rechnet der Loeser bitgenau wie vor #76.
  t("#76 ohne Ursprungsangabe bleibt die Loesung bitgenau die alte",
    JSON.stringify(K.loese(waende, masse)) === JSON.stringify(K.loese(waende, masse, { x: 0, y: 0 })));

  const nullpunkt = K.loese(waende, masse, { x: 0, y: 0 });
  t("#76 [K-4] das Ursprungsmass wird gegen den GESPEICHERTEN Ursprung geloest",
    K.loese(waende, masse, { x: 3000, y: 0 }).positionen.A.x === 4000
    && nullpunkt.positionen.A.x === 1000);
  t("#76 der Ursprung verschiebt nur die bestimmte Kette, nicht die Bemassung selbst",
    K.loese(waende, masse, { x: 3000, y: 0 }).positionen.B.x === 8000);
  t("#76 eine freie Wand bleibt auf ihrer gespeicherten Position",
    K.loese([w("F", 7000, 0, "x", 8)], [], { x: 3000, y: 0 }).positionen.F.x === 7000);

  // Der Kern des Pakets: Ursprung verschieben + Masse nachfuehren ⇒ Positionen
  // bitgenau unveraendert. `mass' = mass − ΔU` ist geschlossen, nicht iterativ.
  {
    const alt = { x: 0, y: 0 }, neu = { x: 3000, y: -500 };
    const lagen = new Map(waende.map((x) => [x.id, x.lage]));
    const nf = K.ursprungNachfuehrung(masse, alt, neu, lagen);
    t("#76 betrachtet wird genau das Ursprungsmass der betroffenen Achse",
      nf.aenderungen.length + nf.ungueltig.length === 1
      && [...nf.aenderungen, ...nf.ungueltig][0].id === "u");
    t("#76 das Mass zwischen zwei Waenden wird NICHT angefasst",
      !nf.aenderungen.some((a) => a.id === "ab") && !nf.ungueltig.some((a) => a.id === "ab"));
    t("#76 das Delta steht als Rechenweg dabei",
      nf.delta.x === 3000 && nf.delta.y === -500);

    // Hier wird ein negatives Mass erzwungen ⇒ es steht in `ungueltig` und die
    // Uebernahme ist damit abzuweisen ([K-3]) — nichts wird gerundet oder geloescht.
    t("#76 [K-3] ein negativ werdendes Mass wird benannt, nicht gerundet",
      nf.ungueltig.length === 1 && nf.ungueltig[0].id === "u"
      && nf.ungueltig[0].neu_mm === -2000
      && nf.ungueltig[0].fehler.some((m) => /negativ/.test(m))
      && !nf.aenderungen.length);
  }
  {
    // Gueltiger Fall: der Ursprung wandert um 500 mm, das Mass bleibt positiv.
    const alt = { x: 0, y: 0 }, neu = { x: 500, y: 0 };
    const lagen = new Map(waende.map((x) => [x.id, x.lage]));
    const nf = K.ursprungNachfuehrung(masse, alt, neu, lagen);
    t("#76 mass' = mass − ΔU (geschlossene Form)",
      nf.aenderungen.length === 1 && nf.aenderungen[0].neu_mm === 500);
    const nachher = masse.map((m) => {
      const a = nf.aenderungen.find((x) => x.id === m.id);
      return a ? a.bemassung : m;
    });
    t("#76 INVARIANTE: Ursprung verschoben + Masse nachgefuehrt ⇒ bitgenau dieselben Positionen",
      JSON.stringify(K.loese(waende, nachher, neu).positionen)
      === JSON.stringify(K.loese(waende, masse, alt).positionen));
    t("#76 die Bestimmtheit bleibt dabei unveraendert",
      JSON.stringify(K.loese(waende, nachher, neu).bestimmt)
      === JSON.stringify(K.loese(waende, masse, alt).bestimmt));
    t("#76 Bezuege, Achse und Richtung des Masses bleiben unangetastet",
      nf.aenderungen[0].bemassung.von === null
      && nf.aenderungen[0].bemassung.bis.wand === "A"
      && nf.aenderungen[0].bemassung.bis.bezug === "min"
      && nf.aenderungen[0].bemassung.achse === "x");
  }
  {
    // [K-12]: ein halber Millimeter Versatz macht jedes Ursprungsmass krumm.
    const lagen = new Map(waende.map((x) => [x.id, x.lage]));
    const nf = K.ursprungNachfuehrung(masse, { x: 0, y: 0 }, { x: 62.5, y: 0 }, lagen);
    t("#76 [K-12] ein krumm werdendes Mass wird benannt, nicht gerundet",
      nf.ungueltig.length === 1 && nf.ungueltig[0].neu_mm === 937.5
      && nf.ungueltig[0].fehler.some((m) => /ganzzahlig/.test(m))
      && !nf.aenderungen.length);
  }
  t("#76 ohne Verschiebung wird nichts nachgefuehrt",
    K.ursprungNachfuehrung(masse, { x: 0, y: 0 }, { x: 0, y: 0 }).aenderungen.length === 0);
  t("#76 `verschiebe` rechnet mit demselben Ursprung ([K-9] bleibt unberuehrt)",
    K.verschiebe(waende, masse, "A", { x: 100 }, { x: 3000, y: 0 }).gesperrt.x === true);

  // Kein Rueckschreiben: die Nachfuehrung liefert neue Objekte und laesst die
  // uebergebenen Masse unangetastet.
  t("#76 `ursprungNachfuehrung` ist rein",
    masse[0].mass_mm === 1000);
}

// --- #83 Verzahnung: die EINE Ausnahme von [K-13] --------------------------
// Zwei rechtwinklige Waende duerfen sich ueberlagern, wenn beide an genau diesem
// Ort einen Verzahnungsbereich fuehren ([G-10]) und deren Startparitaeten sich
// wechselseitig ergaenzen. Alles andere bleibt unveraendert streng — geprueft
// wird deshalb vor allem, was WEITERHIN eine Kollision ist.
{
  /** Ein Verzahnungsbereich, wie ihn Modul 1 ins Wandelement schreibt. */
  const V = (g0, g1, paritaet) => [{ g0, g1, start_parity: paritaet }];

  // A laeuft in x ueber die Rasterfelder 0…15 (Rechteck x 0…2000, y 0…125).
  // B kreuzt in y (Rechteck x 500…625, y −1000…1000). Die Ueberlagerung ist
  // damit GENAU EIN volles Rasterfeld: bei A das Feld 4, bei B das Feld 8.
  const A3 = w("A", 0, 62.5, "x", 16);
  const B3 = w("B", 562.5, -1000, "y", 16);
  const passend = { A: V(4, 5, 0), B: V(8, 9, 1) };

  t("#83 ohne Verzahnungsdaten bleibt es bit-genau die Kollision von vorher",
    JSON.stringify(K.kollisionen([A3, B3])) === JSON.stringify(K.kollisionen([A3, B3], undefined, {}))
    && K.kollisionen([A3, B3]).length === 1);

  t("#83 wechselseitig passende Verzahnungsbereiche sind KEINE Kollision (Wandmitte)",
    K.kollisionen([A3, B3], undefined, passend).length === 0);
  t("#83 die zulaessige Verzahnung wird ausgegeben, statt kommentarlos zu verschwinden", (() => {
    const v = K.verzahnungsstellen([A3, B3], undefined, passend);
    return v.length === 1 && v[0].a === "A" && v[0].b === "B"
      && v[0].raster.a === 4 && v[0].raster.b === 8
      && v[0].ort_mm.x === 500 && v[0].ort_mm.y === 0
      && /Verzahnungsbereichen/.test(v[0].meldung) && /K-13/.test(v[0].meldung);
  })());
  t("#83 eine Map wird genauso gelesen wie ein einfaches Objekt",
    K.kollisionen([A3, B3], undefined,
      new Map([["A", passend.A], ["B", passend.B]])).length === 0);

  // Verzahnung an der WANDKANTE: B endet buendig an der fernen Laengskante von A
  // und greift mit seinem LETZTEN Rasterfeld hinein (T-Stoss statt Kreuzung).
  {
    const B4 = w("B", 562.5, -1000, "y", 9);        // Rechteck y −1000…125
    t("#83 dieselbe Ausnahme greift an der Wandkante (T-Stoss, letztes Rasterfeld)",
      K.kollisionen([A3, B4], undefined, passend).length === 0
      && K.verzahnungsstellen([A3, B4], undefined, passend)[0].raster.b === 8);
  }
  // … und am ENDE von A: die Ueberlagerung liegt auf A-Feld 15.
  {
    const B5 = w("B", 1937.5, -1000, "y", 16);      // Rechteck x 1875…2000
    t("#83 die Ausnahme haengt am ORT, nicht an der Wandmitte (A-Feld 15)",
      K.kollisionen([A3, B5], undefined, { A: V(15, 16, 0), B: V(8, 9, 1) }).length === 0
      && K.kollisionen([A3, B5], undefined, passend).length === 1);
  }

  // --- und jetzt alles, was WEITERHIN eine Kollision ist --------------------
  t("#83 gleiche Startparitaet bleibt eine Kollision (beide sparen dieselben Lagen aus)",
    K.kollisionen([A3, B3], undefined, { A: V(4, 5, 0), B: V(8, 9, 0) }).length === 1
    && K.kollisionen([A3, B3], undefined, { A: V(4, 5, 1), B: V(8, 9, 1) }).length === 1);
  t("#83 nur einseitig markiert bleibt eine Kollision",
    K.kollisionen([A3, B3], undefined, { A: V(4, 5, 0) }).length === 1
    && K.kollisionen([A3, B3], undefined, { B: V(8, 9, 1) }).length === 1);
  t("#83 ein Bereich am FALSCHEN Ort hilft nicht",
    K.kollisionen([A3, B3], undefined, { A: V(4, 5, 0), B: V(9, 10, 1) }).length === 1
    && K.kollisionen([A3, B3], undefined, { A: V(5, 6, 0), B: V(8, 9, 1) }).length === 1);
  t("#83 ein Bereich muss das Rasterfeld VOLLSTAENDIG enthalten", (() => {
    // [4,5) liegt in [2,6), aber nicht in [2,5)+[5,6) getrennt und nicht in [0,4).
    const drin = K.kollisionen([A3, B3], undefined, { A: V(2, 6, 0), B: V(6, 10, 1) });
    const halb = K.kollisionen([A3, B3], undefined, { A: V(0, 4, 0), B: V(8, 9, 1) });
    return drin.length === 0 && halb.length === 1;
  })());
  t("#83 eine nur TEILWEISE Ueberdeckung bleibt eine Kollision (kein volles Rasterfeld)", (() => {
    // B reicht nur 62,5 mm in A hinein — halb verzahnt gibt es nicht.
    const halb = w("B", 562.5, -1062.5, "y", 9);    // Rechteck y −1062,5…62,5
    const k = K.kollisionen([A3, halb], undefined, passend);
    return k.length === 1 && k[0].ueberlappung_mm.y === 62.5;
  })());
  t("#83 eine quer auf halbem Rasterfeld liegende Wand faellt exakt durch (keine Toleranz)",
    // Mittellinie auf der Rasterlinie statt auf der Feldmitte ⇒ A-Feld 3,5.
    K.kollisionen([A3, w("B", 500, -1000, "y", 16)], undefined, passend).length === 1
    // … und ebenso ein einzelner Millimeter Versatz.
    && K.kollisionen([A3, w("B", 563, -1000, "y", 16)], undefined, passend).length === 1);
  t("#83 zwei PARALLELE Waende koennen nie verzahnen — auch nicht deckungsgleich",
    K.kollisionen([w("A", 0, 62.5, "x", 16), w("B", 0, 62.5, "x", 16)], undefined,
      { A: V(0, 16, 0), B: V(0, 16, 1) }).length === 1);
  t("#83 eine Wand OHNE Verzahnungsdaten aendert ihr Kollisionsergebnis in keinem Fall",
    K.kollisionen([A3, B3], undefined, {}).length === 1
    && K.kollisionen([A3, B3], undefined, { A: [], B: [] }).length === 1
    && K.kollisionen([A3, B3], undefined, { A: null, B: null }).length === 1);
  t("#83 unbrauchbare Verzahnungsangaben werden nicht zurechtgebogen", (() => {
    const krumm = K.kollisionen([A3, B3], undefined,
      { A: [{ g0: 4.5, g1: 5.5, start_parity: 0 }], B: V(8, 9, 1) });
    const leer = K.kollisionen([A3, B3], undefined,
      { A: [{ g0: 5, g1: 5, start_parity: 0 }], B: V(8, 9, 1) });
    const paritaet = K.kollisionen([A3, B3], undefined,
      { A: [{ g0: 4, g1: 5, start_parity: 2 }], B: V(8, 9, 1) });
    return krumm.length === 1 && leer.length === 1 && paritaet.length === 1;
  })());
  t("#83 `verzahnungsBereiche` liest defensiv und erfindet nichts", (() => {
    const gut = K.verzahnungsBereiche([{ g0: 4, g1: 5, start_parity: 1 }]);
    return gut.length === 1 && gut[0].g0 === 4 && gut[0].start_parity === 1
      && K.verzahnungsBereiche(null).length === 0
      && K.verzahnungsBereiche([{ g0: 1, g1: 0, start_parity: 0 }]).length === 0
      && K.verzahnungsBereiche(["x", 7, null]).length === 0;
  })());
  t("#83 buendiges Beruehren bleibt ohne Verzahnung zulaessig (unveraendert)",
    K.kollisionen([A3, w("B", 562.5, 125, "y", 8)], undefined, passend).length === 0
    && K.verzahnungsstellen([A3, w("B", 562.5, 125, "y", 8)], undefined, passend).length === 0);

  // --- Der Weg durch `pruefeGeschoss`: geprueft wird die GELOESTE Lage -------
  {
    const waende = [A3, w("B", 99999, 99999, "y", 16)];
    const masse = [
      b("fx", "x", null, p("A", "min"), 0),
      b("fy", "y", null, p("A", "min"), 0),
      b("dx", "x", p("A", "min"), p("B", "min"), 500),
      b("dy", "y", p("B", "min"), p("A", "min"), 1000),
    ];
    const streng = K.pruefeGeschoss(waende, masse);
    const mitV = K.pruefeGeschoss(waende, masse, undefined, passend);
    t("#83 an der geloesten Lage greift dieselbe Ausnahme",
      streng.kollisionen.length === 1 && mitV.kollisionen.length === 0
      && mitV.verzahnungen.length === 1 && mitV.verzahnungen[0].raster.a === 4);
    t("#83 [K-8] ohne Kollision bleiben beide Waende in ihrer normalen Zustandsfarbe",
      K.zustand("A", streng, { kollisionen: streng.kollisionen }) === "fehler"
      && K.zustand("A", mitV, { kollisionen: mitV.kollisionen }) !== "fehler"
      && K.zustand("B", mitV, { kollisionen: mitV.kollisionen }) !== "fehler");
    t("#83 [K-5] Loeser, Positionen und Bestimmtheit bleiben davon unberuehrt",
      JSON.stringify(streng.positionen) === JSON.stringify(mitV.positionen)
      && JSON.stringify(streng.bestimmt) === JSON.stringify(mitV.bestimmt)
      && streng.widersprueche.length === 0 && mitV.widersprueche.length === 0);
    t("#83 ohne Verzahnungsdaten meldet `pruefeGeschoss` eine leere Liste, nie `undefined`",
      Array.isArray(streng.verzahnungen) && streng.verzahnungen.length === 0);
  }

  t("#83 die Bewertung ist deterministisch und reihenfolgeunabhaengig", (() => {
    const a = JSON.stringify(K.verzahnungsstellen([A3, B3], undefined, passend));
    const c = JSON.stringify(K.verzahnungsstellen([A3, B3], undefined, passend));
    const gedreht = JSON.stringify(K.verzahnungsstellen([B3, A3], undefined, passend));
    return a === c && a === gedreht && a !== "[]";
  })());
  t("#83 die Eingabelisten bleiben unangetastet — es wird kein Bereich erzeugt oder geaendert",
    JSON.stringify(passend) === JSON.stringify({ A: V(4, 5, 0), B: V(8, 9, 1) })
    && A3.lage.start_mm.x === 0 && B3.lage.laenge_grid === 16);
}

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
