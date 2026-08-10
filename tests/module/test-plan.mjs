// Logik-Test des Geschossplans (docs/shared/sembla-plan.js), Etappe C3 von Issue #26.
// Prueft das Regelwerk Kapitel 16.9:
//   [L-8] Planbild getrennt von den Projektdaten (eigene Datenbank, Formate, Groesse)
//   [L-9] Der Plan ist Hintergrund, keine Datenquelle (Massstab/Versatz ausdruecklich,
//         kein geschaetztes Raster, Kalibrierung aendert keine Lage)
//   [L-1] Rasterkoordinaten bleiben die Wahrheit — der Plan wird ans Raster geschoben
//
// Aufruf:  node tests/module/test-plan.mjs

// --- Minimaler IndexedDB-Ersatz -------------------------------------------
// Bildet genau das ab, was sembla-plan.js benutzt (open/upgrade, put/get/delete/
// getAllKeys). So laeuft der ECHTE Datenbankcode im Test — nicht nur ein Stellvertreter.
function fakeIndexedDB() {
  const daten = new Map();
  const spaeter = (wert, fehler) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => {
      if (fehler) { req.error = fehler; if (req.onerror) req.onerror(); return; }
      req.result = typeof wert === "function" ? wert() : wert;
      if (req.onsuccess) req.onsuccess();
    });
    return req;
  };
  const store = {
    put: (satz) => spaeter(() => { daten.set(String(satz.id), satz); return satz.id; }),
    get: (id) => spaeter(() => daten.get(String(id))),
    delete: (id) => spaeter(() => { daten.delete(String(id)); return undefined; }),
    getAllKeys: () => spaeter(() => [...daten.keys()]),
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => store,
    transaction: () => ({ objectStore: () => store }),
    close() {},
  };
  return {
    _daten: daten,
    open() {
      const req = { result: db, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => { if (req.onupgradeneeded) req.onupgradeneeded(); if (req.onsuccess) req.onsuccess(); });
      return req;
    },
  };
}

const P = await import("../../docs/shared/sembla-plan.js");

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };
const wirft = async (fn, muster) => {
  try { await fn(); return false; } catch (e) { return muster ? muster.test(e.message) : true; }
};

// --- [L-8] Zulaessige Planformate -----------------------------------------
t("[L-8] PNG ist zulaessig", P.planDateiZulaessig({ name: "eg.png", type: "image/png", size: 1000 }));
t("[L-8] JPEG ist zulaessig", P.planDateiZulaessig({ name: "eg.jpg", type: "image/jpeg", size: 1000 }));
t("[L-8] WebP ist zulaessig", P.planDateiZulaessig({ name: "eg.webp", type: "image/webp", size: 1000 }));
t("[L-8] Endung genuegt, wenn der Browser keinen MIME-Typ liefert",
  P.planDateiZulaessig({ name: "eg.JPEG", type: "", size: 10 }));

const pdf = P.pruefePlanDatei({ name: "grundriss.pdf", type: "application/pdf", size: 1000 });
t("[L-8] PDF wird abgewiesen — benannt, nicht naeherungsweise gedeutet",
  pdf.length === 1 && /PDF/.test(pdf[0]) && /\[L-8\]/.test(pdf[0]));
t("[L-8] PDF-Meldung nennt den Ausweg (als Bild exportieren)", /PNG oder\s+JPEG/.test(pdf[0]));
t("[L-8] PDF allein an der Endung erkannt (ohne MIME-Typ)",
  P.pruefePlanDatei({ name: "plan.PDF", type: "" }).length === 1);

const svg = P.pruefePlanDatei({ name: "plan.svg", type: "image/svg+xml", size: 10 });
t("[L-8] fremdes Bildformat wird abgewiesen", svg.length === 1 && /nicht zulässig/.test(svg[0]));

const zuGross = P.pruefePlanDatei({ name: "eg.png", type: "image/png", size: P.PLAN_MAX_BYTES + 1 });
t("[L-8] Groessengrenze greift", zuGross.length === 1 && /20 MB/.test(zuGross[0]));
t("[L-8] zu grosser Plan wird nicht heimlich verkleinert", /nichts automatisch verkleinert/.test(zuGross[0]));
t("[L-8] Grenze ist dokumentiert (20 MB)", P.PLAN_MAX_BYTES === 20 * 1024 * 1024);
t("[L-8] accept-Liste nennt nur Rasterbilder",
  P.PLAN_ACCEPT.includes("image/png") && !P.PLAN_ACCEPT.includes("pdf"));

// --- [L-9] Ohne Kalibrierung kein Raster -----------------------------------
const ohne = { datei: "eg.png", typ: "image/png", breite_px: 800, hoehe_px: 600,
               mm_je_pixel: null, versatz_x_mm: 0, versatz_y_mm: 0 };
t("[L-9] unkalibrierter Plan gilt als nicht kalibriert", !P.planKalibriert(ohne));
t("[L-9] ohne Massstab keine Rasterlinien (es wird keiner geschaetzt)",
  P.rasterLinien(ohne, 800, 600).x.length === 0 && P.rasterLinien(ohne, 800, 600).y.length === 0);
t("[L-9] ohne Massstab keine Umrechnung in mm", P.pixelZuMm(ohne, 10, 10) === null);
t("[L-9] ohne Massstab keine Umrechnung ins Raster", P.pixelZuGrid(ohne, 10, 10) === null);
t("[L-9] ohne Massstab sagt der Klartext genau das", P.massstabText(null) === "kein Maßstab gesetzt");
t("[L-9] Massstab 0 gilt nicht als Kalibrierung", !P.planKalibriert({ ...ohne, mm_je_pixel: 0 }));

// --- [L-9] Kalibrierlinie und Zahleneingabe sind gleichwertig --------------
const k = P.kalibriere({ x: 100, y: 100 }, { x: 300, y: 100 }, 2500);
t("[L-9] Kalibrierlinie: 200 px = 2500 mm ⇒ 12,5 mm/px", k.mm_je_pixel === 12.5 && k.pixel === 200);
t("[L-9] Kalibrierlinie rechnet schraeg korrekt (3/4/5)",
  P.kalibriere({ x: 0, y: 0 }, { x: 30, y: 40 }, 500).mm_je_pixel === 10);
t("[L-9] zwei gleiche Punkte werden abgewiesen, nicht geschaetzt",
  await wirft(() => P.kalibriere({ x: 5, y: 5 }, { x: 5, y: 5 }, 1000), /zu kurz/));
t("[L-9] Strecke 0 wird abgewiesen",
  await wirft(() => P.kalibriere({ x: 0, y: 0 }, { x: 10, y: 0 }, 0), /positive Zahl/));
t("[L-9] fehlende Strecke wird abgewiesen",
  await wirft(() => P.kalibriere({ x: 0, y: 0 }, { x: 10, y: 0 }, null), /positive Zahl/));

// --- [L-9] Orthogonal gezwungene Kalibrierlinie (Feinschliff Etappe C4a) ---
// Gemessen wird an Grundrissen waagerecht oder senkrecht; eine schiefe Linie ist ein
// Ablesefehler, der den Massstab still verfaelschte. Gewaehlt wird die Achse mit der
// groesseren Pixeldifferenz — geraten wird nichts.
t("[L-9] orthogonal: ueberwiegend waagerecht ⇒ y des ersten Punkts gilt",
  P.orthogonalPunkt({ x: 100, y: 100 }, { x: 400, y: 140 }).x === 400
  && P.orthogonalPunkt({ x: 100, y: 100 }, { x: 400, y: 140 }).y === 100);
t("[L-9] orthogonal: ueberwiegend senkrecht ⇒ x des ersten Punkts gilt",
  P.orthogonalPunkt({ x: 100, y: 100 }, { x: 140, y: 400 }).x === 100
  && P.orthogonalPunkt({ x: 100, y: 100 }, { x: 140, y: 400 }).y === 400);
t("[L-9] orthogonal: bei gleicher Differenz gewinnt fest die Waagerechte (deterministisch)",
  P.orthogonalPunkt({ x: 0, y: 0 }, { x: 50, y: 50 }).y === 0);
t("[L-9] orthogonal: unbrauchbare Punkte liefern null statt eines geratenen Punkts",
  P.orthogonalPunkt(null, { x: 1, y: 1 }) === null
  && P.orthogonalPunkt({ x: 0, y: 0 }, { x: "a", y: 1 }) === null);
t("[L-9] die gezwungene Linie ergibt genau den Massstab der Achse",
  P.kalibriere({ x: 100, y: 100 }, P.orthogonalPunkt({ x: 100, y: 100 }, { x: 400, y: 140 }), 3000)
    .mm_je_pixel === 10);

// --- Kreuzmarker mit ausgesparter Mitte (Feinschliff Etappe C4a) -----------
const kreuz = P.kreuzPfad(100, 50, 1);
t("Kreuzmarker besteht aus vier Armen (die Mitte bleibt frei)",
  (kreuz.match(/M/g) || []).length === 4 && !kreuz.includes("M100 50"));
t("Kreuzmarker skaliert mit der Bezugsgroesse",
  P.kreuzPfad(0, 0, 2).includes(String(-2 * P.KREUZ_ARM)));
t("SVG: der Kalibrierpunkt ist ein Kreuz, kein deckender Punkt",
  /class="kalpunkt"/.test(P.planSvg(ohne, { breite_px: 100, hoehe_px: 100, kalibrierpunkte: [{x:5,y:5}] }))
  && !/<circle[^>]*kalpunkt/.test(P.planSvg(ohne, { breite_px: 100, hoehe_px: 100, kalibrierpunkte: [{x:5,y:5}] })));
t("SVG: die Kalibrierlinie ist gestrichelt (Messhilfe, keine Zeichnungskante)",
  /class="kallinie"/.test(P.planSvg(ohne, { breite_px: 100, hoehe_px: 100, kalibrierpunkte: [{x:1,y:1},{x:9,y:1}] }))
  && /stroke-dasharray/.test(P.planSvg(ohne, { breite_px: 100, hoehe_px: 100, kalibrierpunkte: [{x:1,y:1},{x:9,y:1}] })));

// --- [L-9] Planlage in Millimetern (Hintergrund des Layout-Editors) --------
t("[L-9] ohne Kalibrierung gibt es keine mm-Lage des Bildes — und keine geschaetzte",
  P.planRahmenMm(ohne) === null);
{
  const p = { ...ohne, mm_je_pixel: 12.5, breite_px: 1600, hoehe_px: 1200,
              versatz_x_mm: 375, versatz_y_mm: -125 };
  const rm = P.planRahmenMm(p);
  t("[L-9] mit Kalibrierung liegt das Bild in mm am Versatz",
    rm.x === 375 && rm.y === -125 && rm.breite === 20000 && rm.hoehe === 15000);
  t("[L-9] fehlende Bildmasse ⇒ keine mm-Lage (Ersatzmasse ausdruecklich uebergeben)",
    P.planRahmenMm({ ...p, breite_px: null }) === null
    && P.planRahmenMm({ ...p, breite_px: null }, { breite_px: 1600 }).breite === 20000);
}

// --- [L-9] Vorlaeufiger Anzeigefaktor eines NICHT kalibrierten Plans (#52) --
// Der Plan soll auch ohne Massstab als Hintergrund sichtbar sein — sonst laesst
// sich die Kalibrierlinie gar nicht erst in ihn hineinklicken. Der dafuer
// benutzte Faktor ist ausdruecklich KEIN geschaetzter Massstab: er ist fest
// 1 Bildpixel = 1 mm, wird NIE gespeichert und traegt das Kennzeichen
// `vorlaeufig`. `planRahmenMm` bleibt davon voellig unberuehrt.
t("#52 der vorlaeufige Faktor ist fest 1 mm je Bildpixel (deterministisch, nicht geraten)",
  P.VORLAEUFIG_MM_JE_PIXEL === 1);
{
  const p = { ...ohne, breite_px: 1600, hoehe_px: 1200 };
  const vr = P.planVorschauRahmen(p);
  t("#52 unkalibrierter Plan bekommt einen vorlaeufigen Rahmen in Bildpixelgroesse",
    vr.breite === 1600 && vr.hoehe === 1200 && vr.mm_je_pixel === 1 && vr.vorlaeufig === true);
  t("#52 der vorlaeufige Rahmen beruecksichtigt den gesetzten Versatz",
    P.planVorschauRahmen({ ...p, versatz_x_mm: 500, versatz_y_mm: -250 }).x === 500
    && P.planVorschauRahmen({ ...p, versatz_x_mm: 500, versatz_y_mm: -250 }).y === -250);
  t("#52 ein KALIBRIERTER Plan hat keinen vorlaeufigen Rahmen (echter Massstab gilt)",
    P.planVorschauRahmen({ ...p, mm_je_pixel: 12.5 }) === null);
  const blind = { ...ohne, breite_px: null, hoehe_px: null };
  t("#52 ohne Bildmasse gibt es auch keinen vorlaeufigen Rahmen — nichts wird erfunden",
    P.planVorschauRahmen(blind) === null
    && P.planVorschauRahmen(blind, { breite_px: 800, hoehe_px: 600 }).breite === 800);
  t("[L-9] der vorlaeufige Faktor faerbt NICHT auf planRahmenMm ab",
    P.planRahmenMm(p) === null);

  // Die Ansicht waehlt: echter Massstab, sonst vorlaeufig. Genau eine Quelle.
  const an = P.planAnsichtRahmen(p);
  t("#52 die Ansicht nimmt ohne Massstab den vorlaeufigen Rahmen",
    an.vorlaeufig === true && an.mm_je_pixel === 1);
  t("#52 die Ansicht nimmt mit Massstab den echten Rahmen",
    P.planAnsichtRahmen({ ...p, mm_je_pixel: 12.5 }).mm_je_pixel === 12.5
    && P.planAnsichtRahmen({ ...p, mm_je_pixel: 12.5 }).vorlaeufig !== true);

  // Rueckweg fuer die Kalibrierung AUF der mm-Buehne: ein Weltpunkt in mm muss
  // wieder ein Bildpunkt werden, sonst haengt der Massstab am Zoom.
  t("#52 Weltpunkt (mm) → Bildpunkt ueber den vorlaeufigen Rahmen",
    P.rahmenPunktZuPixel(an, { x: 100, y: 250 }).x === 100
    && P.rahmenPunktZuPixel(an, { x: 100, y: 250 }).y === 250);
  t("#52 … und ueber den echten Rahmen genauso (Neukalibrierung moeglich)",
    P.rahmenPunktZuPixel(P.planAnsichtRahmen({ ...p, mm_je_pixel: 12.5, versatz_x_mm: 375 }),
      { x: 375 + 1000, y: 500 }).x === 80);
  t("#52 ohne Rahmen gibt es keinen Bildpunkt (kein geratener)",
    P.rahmenPunktZuPixel(null, { x: 0, y: 0 }) === null);
}

// --- [L-1] Umrechnung Bild ↔ Raster ---------------------------------------
const plan = { ...ohne, mm_je_pixel: 12.5, versatz_x_mm: 1000, versatz_y_mm: -500 };
t("[L-1] Bildpunkt → mm beruecksichtigt den Versatz",
  P.pixelZuMm(plan, 0, 0).x === 1000 && P.pixelZuMm(plan, 0, 0).y === -500);
t("[L-1] Bildpunkt → mm skaliert mit dem Massstab", P.pixelZuMm(plan, 80, 0).x === 2000);
t("[L-1] mm → Bildpunkt ist die Umkehrung",
  P.mmZuPixel(plan, 2000, -500).x === 80 && P.mmZuPixel(plan, 2000, -500).y === 0);
t("[L-1] Rasterpunkt → Bildpunkt (grid 16 = 2000 mm)", P.gridZuPixel(plan, 16, -4).x === 80);
t("[L-1] Bildpunkt → naechster Rasterpunkt ist ganzzahlig",
  Number.isInteger(P.pixelZuGrid(plan, 83, 0).x) && P.pixelZuGrid(plan, 80, 0).x === 16);
t("[L-1] Rasterweite in Bildpixeln = 125 / (mm je Pixel)", P.rasterWeitePx(plan) === 10);

// --- [L-1] Versatz/Kalibrierung veraendern keine Lage ----------------------
// Die Lage lebt in Rastereinheiten; hier wird geprueft, dass dieselbe Rasterlage
// nach einer Neukalibrierung nur ANDERS GEZEICHNET wird — der Wert bleibt gleich.
const lageGrid = { x: 16, y: -4 };
const vorher = P.gridZuPixel(plan, lageGrid.x, lageGrid.y);
const neuKalibriert = { ...plan, mm_je_pixel: 25, versatz_x_mm: 0 };
const nachher = P.gridZuPixel(neuKalibriert, lageGrid.x, lageGrid.y);
t("[L-1] Neukalibrierung aendert nur die Darstellung, nicht die Rasterlage",
  vorher.x === 80 && nachher.x === 80 && lageGrid.x === 16);

// --- [L-9] Rasteroverlay ----------------------------------------------------
const raster = P.rasterLinien({ ...ohne, mm_je_pixel: 12.5 }, 100, 50);
t("[L-9] Rasterlinien liegen alle 10 Bildpixel (125 mm)",
  raster.x.length === 11 && raster.x[0].px === 0 && raster.x[1].px === 10);
t("[L-9] jede achte Linie ist Hauptlinie (1 m)",
  raster.x[0].haupt === true && raster.x[1].haupt === false && raster.x[8].haupt === true);
t("[L-9] Rasterlinien tragen ihre Rasterkennzahl", raster.x[3].grid === 3 && raster.y[2].grid === 2);
const versetzt = P.rasterLinien({ ...ohne, mm_je_pixel: 12.5, versatz_x_mm: 62.5 }, 100, 50);
t("[L-9] Versatz verschiebt die Linien um genau den halben Rasterschritt",
  Math.abs(versetzt.x[0].px - 5) < 1e-9 && versetzt.x[0].grid === 1);
t("[L-9] zu feines Raster wird weggelassen statt als graue Flaeche gezeichnet",
  !P.rasterLesbar({ ...ohne, mm_je_pixel: 100 })
  && P.rasterLinien({ ...ohne, mm_je_pixel: 100 }, 800, 600).x.length === 0);
t("[L-9] lesbares Raster wird gezeichnet", P.rasterLesbar({ ...ohne, mm_je_pixel: 12.5 }));

// --- SVG-Ausgabe (reine Anzeige) -------------------------------------------
const svgOhne = P.planSvg(ohne, { bildUrl: "blob:x", breite_px: 800, hoehe_px: 600, zoom: 1 });
t("SVG: viewBox liegt in BILDPIXELN (auch ohne Kalibrierung bedienbar)",
  /viewBox="0 0 800 600"/.test(svgOhne));
t("SVG: das Planbild wird eingebettet", /<image href="blob:x"/.test(svgOhne));
t("[L-9] SVG ohne Massstab enthaelt kein Raster",
  !/rasterfein/.test(svgOhne) && !/rasterhaupt/.test(svgOhne));

const svgMit = P.planSvg({ ...ohne, mm_je_pixel: 12.5 }, { bildUrl: "blob:x", breite_px: 800, hoehe_px: 600 });
t("[L-9] SVG mit Massstab zeichnet fein- und Hauptlinien",
  /rasterfein/.test(svgMit) && /rasterhaupt/.test(svgMit));
t("[L-9] SVG beschriftet die Metermarken", /1 m<\/text>/.test(svgMit));
t("SVG: Zoom skaliert nur die Flaeche, nicht den viewBox",
  /width="400"/.test(P.planSvg(ohne, { breite_px: 800, hoehe_px: 600, zoom: .5 }))
  && /viewBox="0 0 800 600"/.test(P.planSvg(ohne, { breite_px: 800, hoehe_px: 600, zoom: .5 })));
t("SVG: fehlendes Bild wird als leere Flaeche gezeichnet, nicht erfunden",
  /<rect /.test(P.planSvg(ohne, { breite_px: 800, hoehe_px: 600 })));
t("SVG: unbekannte Bildmasse ergeben kein Blatt", /width="1"/.test(P.planSvg(ohne, { breite_px: 0, hoehe_px: 0 })));
t("SVG: Kalibrierlinie wird gezeigt",
  /kallinie/.test(P.planSvg(ohne, { breite_px: 100, hoehe_px: 100, kalibrierpunkte: [{x:1,y:1},{x:9,y:9}] })));
t("SVG: ein einzelner Kalibrierpunkt zeigt den Punkt, aber keine Linie",
  /kalpunkt/.test(P.planSvg(ohne, { breite_px: 100, hoehe_px: 100, kalibrierpunkte: [{x:1,y:1}] }))
  && !/kallinie/.test(P.planSvg(ohne, { breite_px: 100, hoehe_px: 100, kalibrierpunkte: [{x:1,y:1}] })));
t("SVG: eine Bild-URL wird escaped (kein Markup-Einbruch)",
  !P.planSvg(ohne, { bildUrl: 'x"><script>', breite_px: 10, hoehe_px: 10 }).includes("<script>"));

// --- Klickumrechnung --------------------------------------------------------
t("Klick → Bildpunkt beruecksichtigt Rahmen und Zoom",
  P.svgPunktZuPixel({ links: 100, oben: 50, zoom: 2 }, { x: 300, y: 250 }).x === 100
  && P.svgPunktZuPixel({ links: 100, oben: 50, zoom: 2 }, { x: 300, y: 250 }).y === 100);

// --- [L-8] Ablage in der eigenen Datenbank ---------------------------------
const idb = fakeIndexedDB();
P.setzeIndexedDB(idb);
t("[L-8] Planspeicher wird als verfuegbar gemeldet", P.planSpeicherVerfuegbar());

const bild = { fake: "blob", groesse: 4711 };
const satz = await P.speicherePlan("gs-1", bild, {
  name: "eg.png", typ: "image/png", groesse: 4711, breite_px: 800, hoehe_px: 600, zeit: "2026-08-06T10:00:00Z",
});
t("[L-8] Ablage liefert den Datensatz OHNE das Bild zurueck", satz.blob === undefined && satz.id === "gs-1");
t("[L-8] Schluessel ist die Geschoss-Kennung, nicht der Dateiname", [...idb._daten.keys()][0] === "gs-1");

const gelesen = await P.holePlan("gs-1");
t("[L-8] Bild kommt unveraendert zurueck", gelesen.blob === bild && gelesen.name === "eg.png");
t("[L-8] Bildmasse reisen mit", gelesen.breite_px === 800 && gelesen.hoehe_px === 600);
t("[L-8] unbekanntes Geschoss liefert null (kein Fehler)", (await P.holePlan("gs-x")) === null);
t("[L-8] Abfrage ohne Kennung liefert null", (await P.holePlan("")) === null);
t("[L-8] Ablage ohne Kennung wird abgewiesen",
  await wirft(() => P.speicherePlan("", bild, {}), /Kennung/));
t("[L-8] Ablage ohne Bild wird abgewiesen",
  await wirft(() => P.speicherePlan("gs-2", null, {}), /Kein Planbild/));

await P.speicherePlan("gs-2", { fake: "b2" }, { name: "og.png" });
t("[L-8] mehrere Geschosse liegen nebeneinander", (await P.listePlaene()).sort().join(",") === "gs-1,gs-2");
await P.loeschePlan("gs-1");
t("[L-8] Loeschen entfernt genau einen Datensatz",
  (await P.holePlan("gs-1")) === null && (await P.holePlan("gs-2")) !== null);
t("[L-8] Loeschen ohne vorhandenes Bild ist kein Fehler", (await P.loeschePlan("gs-1")) === true);

// Ohne Datenbank: benannter Fehler statt Ausweichen in den localStorage.
P.setzeIndexedDB({ open() { throw new Error("nope"); } });
t("[L-8] defekter Speicher: Lesen liefert null statt zu werfen", (await P.holePlan("gs-2")) === null);
const ohneDb = globalThis.indexedDB;
globalThis.indexedDB = undefined;
P.setzeIndexedDB(null);
t("[L-8] kein IndexedDB ⇒ als nicht verfuegbar gemeldet", !P.planSpeicherVerfuegbar());
t("[L-8] kein IndexedDB ⇒ Ablage nennt den Grund, kein localStorage-Ausweg",
  await wirft(() => P.speicherePlan("gs-3", bild, {}), /IndexedDB|localStorage/));
globalThis.indexedDB = ohneDb;

t("bytesText: kB/MB lesbar", P.bytesText(2048) === "2 kB" && P.bytesText(2 * 1048576) === "2.0 MB");
t("bytesText: unbekannt bleibt unbekannt", P.bytesText(null) === "–");

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
