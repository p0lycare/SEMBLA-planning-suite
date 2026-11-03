// Logik-Test der Projektmappe (docs/shared/sembla-projektmappe.js).
// Prueft das Regelwerk Kapitel 16.9: [L-1] Rasterbindung, [L-2] Orthogonalitaet,
// [L-3] Trennung Lage/Wandelement, [L-4] Referenzintegritaet, [L-5] Hoehenvorgabe,
// [L-6] Struktur, [L-7] verlustfreie Uebernahme.
//
// Aufruf:  node tests/module/test-projektmappe.mjs

const M = await import("../../docs/shared/sembla-projektmappe.js");

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };
const wirft = (fn, muster) => {
  try { fn(); return false; } catch (e) { return muster ? muster.test(e.message) : true; }
};

// --- [L-6] Struktur --------------------------------------------------------
const leer = M.leereMappe("Aschersleben AWG");
t("[L-6] leere Mappe: Format + Version", leer.format === "SEMBLA-Projektmappe" && leer.version === 2);
t("[L-6] leere Mappe: vollstaendige Hierarchie mit einem Gebaeude/Geschoss",
  leer.gebaeude.length === 1 && leer.gebaeude[0].geschosse.length === 1
  && leer.gebaeude[0].geschosse[0].waende.length === 0);
t("[L-6] leere Mappe: gueltig", M.validiereMappe(leer).length === 0);
t("[L-6] leere Mappe: kein Plan erfunden", leer.gebaeude[0].geschosse[0].plan === null);

const gs0 = leer.gebaeude[0].geschosse[0].id;
const geb0 = leer.gebaeude[0].id;

// --- [L-1] Position in mm, Laenge im Raster (Fassung ab C3.2) --------------
const lageOk = { start_mm: { x: 500, y: 1500 }, richtung: "x", laenge_grid: 24 };
t("[L-1] gueltige Lage", M.lageGueltig(lageOk));
t("[L-1] unverortet (null) ist gueltig", M.lageGueltig(null));
t("[L-1] Laenge aus dem Raster = 24 × 125 mm", M.laengeAusLage(lageOk) === 3000);
t("[L-1] unverortet hat keine Laenge", M.laengeAusLage(null) === null);
t("[L-1] halbe Millimeter sind zulaessig (Kante ↔ Mittellinie)",
  M.lageGueltig({ ...lageOk, start_mm: { x: 562.5, y: 1500 } }));
t("[L-1] Viertelmillimeter wird abgewiesen, nicht gerundet",
  !M.lageGueltig({ ...lageOk, start_mm: { x: 500.25, y: 1500 } })
  && /0,5 mm/.test(M.lageFehler({ ...lageOk, start_mm: { x: 500.25, y: 1500 } })[0]));
t("[L-1] gebrochene Laenge wird abgewiesen",
  !M.lageGueltig({ ...lageOk, laenge_grid: 3.7 }));
t("[L-1] Laenge 0 ist unzulaessig", !M.lageGueltig({ ...lageOk, laenge_grid: 0 }));
t("[L-1] negative Position ist zulaessig (das Koordinatensystem reicht in alle Richtungen)",
  M.lageGueltig({ ...lageOk, start_mm: { x: -1000, y: -250 } }));
t("[L-1] setzeWand rundet eine krumme Lage NICHT, sondern wirft",
  wirft(() => M.setzeWand(leer, gs0, { id: "w-1", lage: { ...lageOk, laenge_grid: 3.7 } }), /Länge/));

// --- [L-2] Orthogonalitaet -------------------------------------------------
t("[L-2] Richtung y ist gueltig", M.lageGueltig({ ...lageOk, richtung: "y" }));
t("[L-2] schraege/unbekannte Richtung wird abgewiesen",
  !M.lageGueltig({ ...lageOk, richtung: "diagonal" })
  && /L-2/.test(M.lageFehler({ ...lageOk, richtung: "diagonal" })[0]));
t("[L-2] Endpunkt x in mm: nur Darstellung, keine Eckenlogik",
  JSON.stringify(M.endpunktMm(lageOk)) === JSON.stringify({ x: 3500, y: 1500 }));
t("[L-2] Endpunkt y", JSON.stringify(M.endpunktMm({ ...lageOk, richtung: "y" }))
  === JSON.stringify({ x: 500, y: 4500 }));

// --- Struktur-Operationen (rein) ------------------------------------------
const a = M.fuegeGebaeudeHinzu(leer, "Haus B");
t("Gebaeude anlegen: neue Mappe hat zwei", a.mappe.gebaeude.length === 2);
t("Gebaeude anlegen: Ausgangsmappe unveraendert (reine Funktion)", leer.gebaeude.length === 1);

const b = M.fuegeGeschossHinzu(a.mappe, a.id, "EG", 2500);
t("Geschoss anlegen", M.findeGeschoss(b.mappe, b.id)?.geschoss.name === "EG");
t("Geschoss anlegen: unbekanntes Gebaeude wirft",
  wirft(() => M.fuegeGeschossHinzu(leer, "geb-gibtsnicht", "EG"), /Unbekanntes Gebäude/));

let m = M.setzeWand(b.mappe, b.id, { id: "w-1", name: "EG-W01", lage: lageOk });
m = M.setzeWand(m, b.id, { id: "w-2", name: "EG-W02", lage: null });
t("Wand eintragen: beide im Geschoss", M.findeGeschoss(m, b.id).geschoss.waende.length === 2);
t("Wand eintragen: Lage erhalten", M.findeWand(m, "w-1").wand.lage.laenge_grid === 24);
t("Wand eintragen: unverortet bleibt null (nichts erfunden)", M.findeWand(m, "w-2").wand.lage === null);
t("Wand eintragen: ohne Kennung wirft", wirft(() => M.setzeWand(m, b.id, { name: "X" }), /ohne Kennung/));
t("Wand eintragen: unbekanntes Geschoss wirft",
  wirft(() => M.setzeWand(m, "gs-gibtsnicht", { id: "w-9" }), /Unbekanntes Geschoss/));

// Umtragen in ein anderes Geschoss: nie doppelt in der Mappe ([L-4] Eindeutigkeit)
const umgetragen = M.setzeWand(m, gs0, { id: "w-1" });
t("Wand umtragen: steht genau einmal in der Mappe",
  M.alleWaende(umgetragen).filter((e) => e.wand.id === "w-1").length === 1);
t("Wand umtragen: landet im Zielgeschoss", M.findeWand(umgetragen, "w-1").geschoss.id === gs0);
// Das Zielgeschoss liegt in einem ANDEREN Gebaeude: die Wandnummer gilt je Gebaeude und
// reist nicht mit — die Wand bekommt dort die naechste Nummer, die Lage bleibt.
t("Wand umtragen: Lage bleibt erhalten, Name folgt Kuerzel und Nummer des Zielgebaeudes",
  M.findeWand(m, "w-1").wand.name === "Wand_EG-1"
  && M.findeWand(umgetragen, "w-1").wand.name === "Wand_G1-1"
  && M.findeWand(umgetragen, "w-1").wand.lage.laenge_grid === 24);
t("Mappe nach Umtragen weiterhin gueltig", M.validiereMappe(umgetragen).length === 0);

// Lage aendern / aufheben
const ohneLage = M.setzeLage(m, "w-1", null);
t("Lage aufheben: Wand bleibt eingetragen", M.findeWand(ohneLage, "w-1").wand.lage === null);
t("Lage setzen: unbekannte Wand wirft",
  wirft(() => M.setzeLage(m, "w-gibtsnicht", lageOk), /nicht in der Projektmappe/));

// Entfernen
t("Wandeintrag entfernen", M.findeWand(M.entferneWand(m, "w-1"), "w-1") === null);
t("Geschoss mit Waenden wird nicht still geloescht",
  wirft(() => M.entferneGeschoss(m, b.id), /enthält noch 2/));
t("Geschoss mit ausdruecklicher Bestaetigung entfernbar",
  M.findeGeschoss(M.entferneGeschoss(m, b.id, { mitWaenden: true }), b.id) === null);
t("Gebaeude mit Geschossen wird nicht still geloescht",
  wirft(() => M.entferneGebaeude(m, geb0), /enthält noch 1/));

// Umbenennen
t("umbenennen: Geschoss", M.findeGeschoss(M.benenneUm(m, b.id, "1. OG"), b.id).geschoss.name === "1. OG");
t("umbenennen: eine Wand hat keinen freien Namen — benannt abgewiesen",
  wirft(() => M.benenneUm(m, "w-1", "Neu"), /nicht frei änderbar/));
t("umbenennen: Projekt", M.benenneUm(m, m.projekt.id, "Neu AWG").projekt.name === "Neu AWG");
t("umbenennen: unbekannte Kennung wirft", wirft(() => M.benenneUm(m, "nix", "X"), /Unbekannte Kennung/));

// --- [L-4] Eindeutigkeit + Referenzintegritaet -----------------------------
const doppelt = JSON.parse(JSON.stringify(m));
doppelt.gebaeude[0].geschosse[0].id = doppelt.gebaeude[1].geschosse[0].id;
t("[L-4] doppelte Kennung wird gemeldet",
  M.validiereMappe(doppelt).some((f) => /kommt mehrfach vor/.test(f)));

const ref = M.pruefeReferenzen(m, [{ id: "w-2", name: "EG-W02" }, { id: "w-3", name: "Neu" }]);
t("[L-4] verwaister Eintrag wird gemeldet", ref.verwaist.length === 1 && ref.verwaist[0].id === "w-1");
t("[L-4] unverortete Wand wird gemeldet", ref.unverortet.join() === "w-3");
t("[L-4] eingetragen aber ungezeichnet wird getrennt gemeldet",
  ref.ohneLage.length === 1 && ref.ohneLage[0].id === "w-2");
t("[L-4] Pruefung bereinigt nichts", M.alleWaende(m).length === 2);
t("[L-4] Referenz laeuft ueber die id, nicht ueber den Dateinamen",
  M.pruefeReferenzen(M.setzeWand(m, b.id, { id: "w-1", datei: "waende/ganz-anders.json" }),
    ["w-1", "w-2"]).verwaist.length === 0);

// --- [L-3] Trennung Lage / Wandelement -------------------------------------
t("[L-3] Mappe enthaelt keine Wandgeometrie",
  !JSON.stringify(m).includes("courses") && !JSON.stringify(m).includes("length_mm"));
const ab = M.laengenAbgleich(lageOk, 3000);
t("[L-3] Laengenabgleich: gleich -> keine Abweichung", ab.abweichung === false && ab.lage_mm === 3000);
const ab2 = M.laengenAbgleich(lageOk, 2875);
t("[L-3] Laengenabgleich: Abweichung wird gemeldet, nicht angeglichen",
  ab2.abweichung === true && ab2.lage_mm === 3000 && ab2.wand_mm === 2875);
t("[L-3] Laengenabgleich ohne Lage meldet keine Abweichung",
  M.laengenAbgleich(null, 2875).abweichung === false);

// --- [L-5] Hoehenvorgabe ---------------------------------------------------
const h1 = M.hoehenVorgabe(2600);
t("[L-5] passende Geschosshoehe -> 13 Lagen", h1.passt && h1.lagen === 13 && h1.hinweis === null);
const h2 = M.hoehenVorgabe(2500);
t("[L-5] 2500 mm passt nicht ins Lagenraster und wird NICHT gerundet",
  !h2.passt && h2.lagen === null && h2.hoehe_mm === 2500);
t("[L-5] Hinweis nennt beide zulaessigen Wandhoehen",
  /2400 mm/.test(h2.hinweis) && /2600 mm/.test(h2.hinweis));
t("[L-5] keine Geschosshoehe -> keine Vorgabe, kein Hinweis",
  M.hoehenVorgabe(null).hoehe_mm === null && M.hoehenVorgabe(null).hinweis === null);
t("[L-5] negative Geschosshoehe wird abgewiesen",
  M.validiereMappe({ ...M.leereMappe("X"), gebaeude: [{ id: "g", name: "G", geschosse: [
    { id: "s", name: "S", hoehe_mm: -1, plan: null, waende: [] }] }] })
    .some((f) => /positiv/.test(f)));

// Geschosshoehe aendern: reine Operation, nur Vorgabe — nie ein Eingriff in Waende
const mitWand = M.setzeWand(leer, gs0, { id: "w-h1", name: "W", lage: lageOk });
const hGesetzt = M.setzeGeschossHoehe(mitWand, gs0, 2600);
t("[L-5] Geschosshoehe gesetzt", hGesetzt.gebaeude[0].geschosse[0].hoehe_mm === 2600);
t("[L-5] Ausgangsmappe unveraendert (reine Funktion)",
  mitWand.gebaeude[0].geschosse[0].hoehe_mm === null);
t("[L-5] Waende des Geschosses bleiben unberuehrt",
  JSON.stringify(hGesetzt.gebaeude[0].geschosse[0].waende)
  === JSON.stringify(mitWand.gebaeude[0].geschosse[0].waende));
t("[L-5] krumme Hoehe wird angenommen und nicht gerundet (Meldung getrennt)",
  M.setzeGeschossHoehe(mitWand, gs0, 2537).gebaeude[0].geschosse[0].hoehe_mm === 2537);
t("[L-5] Hoehe kann ausdruecklich aufgehoben werden",
  M.setzeGeschossHoehe(hGesetzt, gs0, null).gebaeude[0].geschosse[0].hoehe_mm === null);
t("[L-5] nicht positive Hoehe wird abgewiesen, nicht korrigiert",
  wirft(() => M.setzeGeschossHoehe(mitWand, gs0, 0), /positiv/)
  && wirft(() => M.setzeGeschossHoehe(mitWand, gs0, -100), /positiv/));
t("[L-5] unbekanntes Geschoss wird abgewiesen",
  wirft(() => M.setzeGeschossHoehe(mitWand, "gibt-es-nicht", 2600), /Unbekanntes Geschoss/));
t("[L-5] Ergebnis bleibt gueltig", M.validiereMappe(hGesetzt).length === 0);

// --- [L-7] Uebernahme bestehender Staende ----------------------------------
const alt = [{ id: "w-alt1", name: "Wand A" }, { id: "w-alt2", name: "Wand B" }];
const uebernommen = M.uebernehmeElemente(alt);
t("[L-7] Projektname „Projekt ohne Plan“", uebernommen.projekt.name === "Projekt ohne Plan");
t("[L-7] alle Waende uebernommen", M.alleWaende(uebernommen).length === 2);
// Seit dem Entscheid vom 03.11.2026 ist der Name erzeugt: die uebernommenen Waende werden
// in Uebernahmereihenfolge nummeriert (Kuerzel aus „Geschoss 1“ = G1).
t("[L-7] Waende in Uebernahmereihenfolge nummeriert, Name erzeugt",
  M.findeWand(uebernommen, "w-alt1").wand.name === "Wand_G1-1"
  && M.findeWand(uebernommen, "w-alt2").wand.name === "Wand_G1-2");
t("[L-7] KEINE Lagedaten erfunden",
  M.alleWaende(uebernommen).every((e) => e.wand.lage === null));
t("[L-7] Ergebnis ist gueltig", M.validiereMappe(uebernommen).length === 0);
const nochmal = M.uebernehmeElemente(alt, uebernommen);
t("[L-7] idempotent: zweiter Lauf legt nichts doppelt an", M.alleWaende(nochmal).length === 2);
const dazu = M.uebernehmeElemente([...alt, { id: "w-alt3", name: "Wand C" }], uebernommen);
t("[L-7] neue Wand wird ergaenzt, bestehende bleiben", M.alleWaende(dazu).length === 3);
t("[L-7] bestehende Lage wird beim Ergaenzen nicht angetastet", (() => {
  const mitLage = M.setzeLage(uebernommen, "w-alt1", lageOk);
  return M.findeWand(M.uebernehmeElemente(alt, mitLage), "w-alt1").wand.lage.laenge_grid === 24;
})());
t("[L-7] leere Elementliste -> leere, gueltige Mappe",
  M.alleWaende(M.uebernehmeElemente([])).length === 0
  && M.validiereMappe(M.uebernehmeElemente([])).length === 0);

// --- Austauschformat -------------------------------------------------------
const datei = JSON.stringify(M.mappeObjekt(m));
const zurueck = M.parseMappe(datei);
t("datei: Roundtrip verlustfrei",
  JSON.stringify(M.mappeObjekt(zurueck)) === JSON.stringify(M.mappeObjekt(m)));
t("datei: kein Zeitstempel im oeffentlichen Format", !("geaendert" in M.mappeObjekt(m)));
t("datei: kaputtes JSON wirft", wirft(() => M.parseMappe("{ kein json"), /JSON/));
t("datei: Katalog im Mappenimport wird benannt",
  wirft(() => M.parseMappe(JSON.stringify({ format: "SEMBLA-Bauteilkatalog", version: 1 })), /Bauteilkatalog/));
t("datei: einzelne Wanddatei im Mappenimport wird benannt",
  wirft(() => M.parseMappe(JSON.stringify({ format: "SEMBLA-Projekt", version: 2 })), /Wanddatei/));
t("datei: fremdes JSON wird abgewiesen",
  wirft(() => M.parseMappe(JSON.stringify({ foo: 1 })), /Keine Projektmappe/));
t("datei: ungueltige Lage in der Datei wird abgewiesen, nicht repariert",
  wirft(() => M.parseMappe(JSON.stringify({
    ...M.mappeObjekt(m),
    gebaeude: [{ id: "g", name: "G", geschosse: [{ id: "s", name: "S", hoehe_mm: null, plan: null,
      waende: [{ id: "w", name: "W", datei: null, lage: { start_mm: { x: 1.25, y: 0 }, richtung: "x", laenge_grid: 2 } }] }] }],
  })), /ungültig/));
t("datei: Versionsachse eigenstaendig (2 seit C3.2)", M.MAPPE_VERSION === 2);

// --- [L-8]/[L-9] Planbeschreibung im Geschoss ------------------------------
// In der Mappe steht NUR die Beschreibung des Plans — nie das Bild ([L-8]) — und
// Massstab/Versatz sind Anzeigewerte, die keine Wandlage veraendern ([L-9]/[L-1]).
{
  let mp = M.leereMappe("Planprojekt");
  const g = mp.gebaeude[0].geschosse[0].id;
  mp = M.setzeWand(mp, g, { id: "w1", name: "W1", lage: { start_mm: { x: 500, y: 250 }, richtung: "x", laenge_grid: 8 } });

  t("[L-8] frisches Geschoss hat keinen Plan", mp.gebaeude[0].geschosse[0].plan === null);
  const mitPlan = M.setzePlan(mp, g, { datei: "eg.png", typ: "image/png", breite_px: 800, hoehe_px: 600 });
  const p = mitPlan.gebaeude[0].geschosse[0].plan;
  t("[L-8] Plan wird als Beschreibung gesetzt", p.datei === "eg.png" && p.breite_px === 800);
  t("[L-9] ohne ausdrueckliche Kalibrierung bleibt der Massstab leer", p.mm_je_pixel === null);
  t("[L-9] Versatz beginnt bei 0/0", p.versatz_x_mm === 0 && p.versatz_y_mm === 0);
  t("[L-8] die Mappe traegt KEIN Bild", !JSON.stringify(mitPlan).includes("blob"));
  t("[L-8] Plan setzen laesst die Ausgangsmappe unveraendert (reine Funktion)",
    mp.gebaeude[0].geschosse[0].plan === null);
  t("[L-1] das Setzen des Plans ruehrt die Wandlage nicht an",
    mitPlan.gebaeude[0].geschosse[0].waende[0].lage.start_mm.x === 500);

  const kalibriert = M.setzePlanAnsicht(mitPlan, g, { mm_je_pixel: 12.5, versatz_x_mm: 250 });
  t("[L-9] Kalibrierung setzt nur Massstab/Versatz",
    kalibriert.gebaeude[0].geschosse[0].plan.mm_je_pixel === 12.5
    && kalibriert.gebaeude[0].geschosse[0].plan.datei === "eg.png"
    && kalibriert.gebaeude[0].geschosse[0].plan.versatz_x_mm === 250);
  t("[L-1] Kalibrierung veraendert keine Wandlage",
    kalibriert.gebaeude[0].geschosse[0].waende[0].lage.laenge_grid === 8);
  t("[L-9] negativer Massstab wird abgewiesen, nicht gerundet",
    wirft(() => M.setzePlan(mitPlan, g, { datei: "x.png", mm_je_pixel: -3 }), /positiv/));
  t("[L-9] Massstab 0 wird abgewiesen",
    wirft(() => M.setzePlan(mitPlan, g, { datei: "x.png", mm_je_pixel: 0 }), /positiv/));
  t("[L-8] unsinnige Bildmasse werden abgewiesen",
    wirft(() => M.setzePlan(mitPlan, g, { datei: "x.png", breite_px: -1 }), /positiv/));
  t("[L-9] Ansicht ohne hinterlegten Plan wird gemeldet statt angelegt",
    wirft(() => M.setzePlanAnsicht(mp, g, { mm_je_pixel: 10 }), /keinen hinterlegten Plan/));
  t("Plan an unbekanntem Geschoss wird abgewiesen",
    wirft(() => M.setzePlan(mp, "gs-fremd", { datei: "x.png" }), /Unbekanntes Geschoss/));

  const ohnePlan = M.setzePlan(kalibriert, g, null);
  t("[L-8] Plan entfernen setzt die Beschreibung zurueck", ohnePlan.gebaeude[0].geschosse[0].plan === null);
  t("[L-1] Plan entfernen laesst die Wandlage stehen",
    ohnePlan.gebaeude[0].geschosse[0].waende[0].lage.start_mm.y === 250);

  t("[L-8] Plan ueberlebt den Datei-Roundtrip",
    M.parseMappe(JSON.stringify(M.mappeObjekt(kalibriert)))
      .gebaeude[0].geschosse[0].plan.mm_je_pixel === 12.5);
  t("[L-9] ein ungueltiger Massstab in der Datei wird abgewiesen, nicht repariert",
    wirft(() => M.parseMappe(JSON.stringify({
      ...M.mappeObjekt(mitPlan),
      gebaeude: [{ id: "g", name: "G", geschosse: [{ id: "s", name: "S", hoehe_mm: null,
        plan: { datei: "x.png", mm_je_pixel: -1 }, waende: [] }] }],
    })), /ungültig/));
  t("[L-8] Altstand ohne Planfeld bleibt warnungsfrei",
    M.validiereMappe(M.normMappe({ projekt: { id: "p" },
      gebaeude: [{ id: "g", geschosse: [{ id: "s", waende: [] }] }] })).length === 0);
  t("[L-9] planFehler: kein Plan ist gueltig", M.planFehler(null).length === 0);
  t("[L-9] planFehler: unkalibrierter Plan ist gueltig", M.planFehler({ datei: "x.png" }).length === 0);
}

// --- Normalisierung --------------------------------------------------------
const roh = M.normMappe({ projekt: { name: "Ohne Kennungen" } });
t("norm: fehlende Projektkennung wird ergaenzt", !!roh.projekt.id && roh.gebaeude.length === 0);
t("norm: Kopfdaten reisen unveraendert mit",
  M.normMappe({ projekt: { id: "p", kopfdaten: { bauherr: "AWG" } } }).projekt.kopfdaten.bauherr === "AWG");
t("norm: unsinnige Lage wird NICHT repariert (faellt in der Validierung auf)",
  M.normMappe({ projekt: { id: "p" }, gebaeude: [{ id: "g", geschosse: [{ id: "s",
    waende: [{ id: "w", lage: { start_mm: { x: "abc" }, richtung: "z", laenge_grid: "x" } }] }] }] })
    .gebaeude[0].geschosse[0].waende[0].lage.start_mm.x === null);

// --- Kopfdaten am Projekt ([L-11]) und Katalogzuordnung ([L-12]) ------------
{
  const basis = M.leereMappe("Aschersleben AWG");
  const mitKd = M.setzeKopfdaten(basis, { bauherr: "AWG eG", planverfasser: "Polycare", gez: "TB" });
  t("[L-11] Kopfdaten landen am Projektknoten",
    mitKd.projekt.kopfdaten.bauherr === "AWG eG" && mitKd.projekt.kopfdaten.gez === "TB");
  t("[L-11] rein: die uebergebene Mappe bleibt unveraendert",
    Object.keys(basis.projekt.kopfdaten).length === 0);
  t("[L-11] Patch aendert nur genannte Felder",
    M.setzeKopfdaten(mitKd, { gez: "MM" }).projekt.kopfdaten.bauherr === "AWG eG");
  t("[L-11] leerer Wert loescht das Feld",
    M.setzeKopfdaten(mitKd, { gez: "" }).projekt.kopfdaten.gez === undefined);
  t("[L-11] unbekanntes Feld wird abgewiesen statt still einsortiert",
    wirft(() => M.setzeKopfdaten(mitKd, { erfunden: "x" }), /Unbekannte Kopfdatenfelder/));
  t("[L-11] kopfdaten() liefert Projektname + Felder in der Form von eingaben.projekt", (() => {
    const k = M.kopfdaten(mitKd);
    return k.name === "Aschersleben AWG" && k.bauherr === "AWG eG" && k.planverfasser === "Polycare";
  })());
  t("[L-11] Kopfdaten beruehren die Struktur nicht",
    M.alleGeschosse(mitKd).length === 1 && M.validiereMappe(mitKd).length === 0);

  const mitKat = M.setzeKatalogRef(mitKd, "kat-7");
  t("[L-12] Katalogzuordnung haengt am Projekt (nur die Kennung)", mitKat.katalog === "kat-7");
  t("[L-12] Zuordnung aufheben ist ausdruecklich moeglich",
    M.setzeKatalogRef(mitKat, null).katalog === null);
  t("[L-12] die Zuordnung reist im Dateiformat mit (Version unveraendert)", (() => {
    const obj = M.mappeObjekt(mitKat);
    return obj.katalog === "kat-7" && obj.version === M.MAPPE_VERSION
      && M.parseMappe(JSON.stringify(obj)).katalog === "kat-7";
  })());
  t("[L-11] Kopfdaten ueberstehen den Datei-Roundtrip",
    M.parseMappe(JSON.stringify(M.mappeObjekt(mitKat))).projekt.kopfdaten.bauherr === "AWG eG");
}


// --- Migration MAPPE_VERSION 1 → 2 ([L-1]/[L-7], Etappe C3.2) --------------
{
  const v1 = {
    format: "SEMBLA-Projektmappe", version: 1,
    projekt: { id: "prj-alt", name: "Altstand", kopfdaten: { bauherr: "AWG eG" } },
    katalog: "kat-1",
    gebaeude: [{ id: "geb", name: "Haus", geschosse: [{
      id: "gs", name: "EG", hoehe_mm: 2400, plan: { datei: "eg.png", mm_je_pixel: 12.5 },
      waende: [
        { id: "w1", name: "W1", datei: null, lage: { start_grid: { x: 4, y: 12 }, richtung: "x", laenge_grid: 24 } },
        { id: "w2", name: "W2", datei: null, lage: null },
      ],
    }] }],
  };
  const v2 = M.migriereMappe(v1);
  t("[L-7] Migration hebt die Formatversion auf 2", v2.version === 2);
  t("[L-1] Rasterlage wird zu Millimetern (× 125)",
    v2.gebaeude[0].geschosse[0].waende[0].lage.start_mm.x === 500
    && v2.gebaeude[0].geschosse[0].waende[0].lage.start_mm.y === 1500);
  t("[L-1] die Laenge bleibt in Rastereinheiten",
    v2.gebaeude[0].geschosse[0].waende[0].lage.laenge_grid === 24);
  t("[L-7] eine unverortete Wand bleibt unverortet (es wird keine Lage erfunden)",
    v2.gebaeude[0].geschosse[0].waende[1].lage === null);
  t("[K-10] das Geschoss bekommt eine leere Bemassungsliste, keine erfundene",
    Array.isArray(v2.gebaeude[0].geschosse[0].bemassungen) && v2.gebaeude[0].geschosse[0].bemassungen.length === 0);
  t("[L-7] Kopfdaten, Katalog, Plan und Geschosshoehe bleiben unveraendert",
    v2.projekt.kopfdaten.bauherr === "AWG eG" && v2.katalog === "kat-1"
    && v2.gebaeude[0].geschosse[0].plan.datei === "eg.png"
    && v2.gebaeude[0].geschosse[0].hoehe_mm === 2400);
  t("[L-7] Migration ist idempotent",
    JSON.stringify(M.migriereMappe(v2)) === JSON.stringify(v2));
  t("[L-7] die Ausgangsmappe bleibt unveraendert (reine Funktion)",
    v1.gebaeude[0].geschosse[0].waende[0].lage.start_grid.x === 4);
  t("[L-7] eine v1-Datei laedt ueber parseMappe verlustfrei",
    M.parseMappe(JSON.stringify(v1)).gebaeude[0].geschosse[0].waende[0].lage.start_mm.x === 500);
}

// --- Bemassungen im Geschoss ([K-10]) --------------------------------------
{
  let mp = M.leereMappe("Bemassung");
  const g = mp.gebaeude[0].geschosse[0].id;
  mp = M.setzeWand(mp, g, { id: "wA", name: "A", lage: { start_mm: { x: 0, y: 0 }, richtung: "x", laenge_grid: 8 } });
  mp = M.setzeWand(mp, g, { id: "wB", name: "B", lage: { start_mm: { x: 3000, y: 0 }, richtung: "x", laenge_grid: 8 } });

  t("[K-10] frisches Geschoss hat keine Bemassungen", M.bemassungen(mp, g).length === 0);

  const bm = { id: "bm-1", achse: "x", von: { wand: "wA", bezug: "max" }, bis: { wand: "wB", bezug: "min" }, mass_mm: 2000 };
  const mitBm = M.setzeBemassung(mp, g, bm);
  t("[K-10] Bemassung wird im Geschoss abgelegt", M.bemassungen(mitBm, g).length === 1);
  t("[K-10] setzeBemassung ist rein", M.bemassungen(mp, g).length === 0);
  t("[K-10] die Bemassung steht NICHT an der Wand",
    !JSON.stringify(mitBm.gebaeude[0].geschosse[0].waende).includes("bm-1"));
  t("[K-10] dieselbe Kennung ersetzt, statt zu doppeln",
    M.bemassungen(M.setzeBemassung(mitBm, g, { ...bm, mass_mm: 2500 }), g).length === 1
    && M.bemassungen(M.setzeBemassung(mitBm, g, { ...bm, mass_mm: 2500 }), g)[0].mass_mm === 2500);
  t("[K-11] ein krummes Laengenmass wird abgewiesen, der Speicher bleibt unveraendert",
    wirft(() => M.setzeBemassung(mp, g, {
      id: "bm-L", achse: "x", von: { wand: "wA", bezug: "min" }, bis: { wand: "wA", bezug: "max" }, mass_mm: 1010,
    }), /K-11/));
  t("[K-3] eine Bemassung ohne Mass wird abgewiesen",
    wirft(() => M.setzeBemassung(mp, g, { id: "bm-x", achse: "x", von: { wand: "wA", bezug: "min" }, bis: { wand: "wB", bezug: "min" } }), /K-3/));
  t("[K-10] ein Verweis auf eine unbekannte Wand wird abgewiesen",
    wirft(() => M.setzeBemassung(mp, g, { ...bm, id: "bm-z", bis: { wand: "wZ", bezug: "min" } }), /K-10/));
  t("[K-10] Loeschen entfernt genau eine Bemassung",
    M.bemassungen(M.loescheBemassung(mitBm, g, "bm-1"), g).length === 0);
  t("[K-10] unbekannte Kennung loeschen aendert nichts",
    M.bemassungen(M.loescheBemassung(mitBm, g, "bm-fremd"), g).length === 1);

  const ohneWand = M.bemassungenOhneWand(mitBm, g, "wB");
  t("[K-10] Masse einer entfernten Wand werden mit entfernt und benannt",
    ohneWand.entfernt.join(",") === "bm-1" && M.bemassungen(ohneWand.mappe, g).length === 0);
  // #74: Die Bereinigung trifft GENAU die Masse mit der Wand als `von` ODER `bis`
  // — ein Mass zwischen zwei fremden Waenden bleibt stehen, und ein gleichnamiger
  // Verweis in einem ANDEREN Geschoss wird nicht angefasst (geschoss-scoped).
  {
    let m74 = M.setzeWand(mitBm, g, { id: "wC", name: "C",
      lage: { start_mm: { x: 6000, y: 0 }, richtung: "x", laenge_grid: 8 } });
    m74 = M.setzeBemassung(m74, g, { id: "bm-von", achse: "x",
      von: { wand: "wC", bezug: "min" }, bis: { wand: "wA", bezug: "max" }, mass_mm: 5000 });
    m74 = M.setzeBemassung(m74, g, { id: "bm-fremd2", achse: "x",
      von: { wand: "wB", bezug: "max" }, bis: { wand: "wC", bezug: "min" }, mass_mm: 2000 });
    const og74 = M.fuegeGeschossHinzu(m74, m74.gebaeude[0].id, "OG74", null);
    m74 = og74.mappe;
    const g2 = og74.id;
    m74 = M.setzeWand(m74, g2, { id: "wA", name: "A oben",
      lage: { start_mm: { x: 0, y: 0 }, richtung: "x", laenge_grid: 8 } });
    m74 = M.setzeBemassung(m74, g2, { id: "bm-og", achse: "x",
      von: null, bis: { wand: "wA", bezug: "min" }, mass_mm: 0 });
    const r74 = M.bemassungenOhneWand(m74, g, "wA");
    t("#74 [K-10] entfernt werden Masse mit der Wand als `von` UND als `bis`",
      r74.entfernt.sort().join(",") === "bm-1,bm-von");
    t("#74 [K-10] ein Mass zwischen fremden Waenden bleibt unberuehrt",
      M.bemassungen(r74.mappe, g).map((b) => b.id).join(",") === "bm-fremd2");
    t("#74 [K-10] ein anderes Geschoss bleibt vollstaendig unberuehrt (geschoss-scoped)",
      M.bemassungen(r74.mappe, g2).map((b) => b.id).join(",") === "bm-og");
    t("#74 [K-10] bemassungenOhneWand ist rein — die Ausgangsmappe behaelt alle Masse",
      M.bemassungen(m74, g).length === 3);
  }
  t("[K-10] Bemassungen ueberstehen den Datei-Roundtrip",
    M.bemassungen(M.parseMappe(JSON.stringify(M.mappeObjekt(mitBm))), g)[0].mass_mm === 2000);
  t("[K-6] eine widerspruechliche Bemassung ist KEIN Validierungsfehler (sie wird beim Lösen gemeldet)",
    M.validiereMappe(M.setzeBemassung(mitBm, g, { ...bm, id: "bm-2", mass_mm: 2400 })).length === 0);
}

// --- [K-4] Geschossursprung: gespeicherter, verschiebbarer Punkt (#76) -----
{
  const gsRef = (m) => m.gebaeude[0].geschosse[0];

  t("#76 [K-4] ein neues Geschoss hat den Ursprung 0/0",
    gsRef(leer).ursprung_mm.x === 0 && gsRef(leer).ursprung_mm.y === 0);
  t("#76 [K-4] `ursprung()` liefert den Punkt des Geschosses",
    M.ursprung(leer, gs0).x === 0 && M.ursprung(leer, gs0).y === 0);

  // Altstand-Migration: das Feld fehlt schlicht — 0/0 IST der Stand vor #76,
  // deshalb ist die Uebernahme verlustfrei und braucht keinen Formatbump.
  const alt = JSON.parse(JSON.stringify(M.mappeObjekt(leer)));
  delete gsRef(alt).ursprung_mm;
  t("#76 Altstand ohne Feld: keine Migrationsluecke, nur 0/0",
    gsRef(alt).ursprung_mm === undefined
    && gsRef(M.normMappe(alt)).ursprung_mm.x === 0 && gsRef(M.normMappe(alt)).ursprung_mm.y === 0);
  t("#76 Altstand bleibt gueltig (kein neuer Pflichtfehler)",
    M.validiereMappe(M.normMappe(alt)).length === 0);
  t("#76 die Uebernahme ist idempotent",
    JSON.stringify(M.normMappe(M.normMappe(alt))) === JSON.stringify(M.normMappe(alt)));
  t("#76 MAPPE_VERSION bleibt 2 — das Feld ist optional, kein Formatbruch",
    M.MAPPE_VERSION === 2 && M.normMappe(alt).version === 2);

  // Setzen
  const verschoben = M.setzeUrsprung(leer, gs0, { x: 1000, y: -500 });
  t("#76 setzeUrsprung schreibt genau den Punkt",
    gsRef(verschoben).ursprung_mm.x === 1000 && gsRef(verschoben).ursprung_mm.y === -500);
  t("#76 setzeUrsprung ist rein — die Ausgangsmappe bleibt auf 0/0",
    gsRef(leer).ursprung_mm.x === 0);
  t("#76 halbe Millimeter sind zulaessig (dasselbe Raster wie die Lage, [L-1])",
    M.ursprung(M.setzeUrsprung(leer, gs0, { x: 62.5, y: 0 }), gs0).x === 62.5);
  t("#76 ein Viertelmillimeter wird ABGEWIESEN, nicht gerundet",
    wirft(() => M.setzeUrsprung(leer, gs0, { x: 0.25, y: 0 }), /0,5 mm/));
  t("#76 ein unbrauchbarer Wert wird abgewiesen",
    wirft(() => M.setzeUrsprung(leer, gs0, { x: "links", y: 0 })));
  t("#76 ein unbekanntes Geschoss wird benannt abgewiesen",
    wirft(() => M.setzeUrsprung(leer, "gs-gibt-es-nicht", { x: 0, y: 0 }), /gibt es nicht/));
  t("#76 ein kaputter Ursprung faellt in der Validierung auf",
    M.validiereMappe({ ...M.mappeObjekt(leer),
      gebaeude: [{ ...leer.gebaeude[0],
        geschosse: [{ ...gsRef(leer), ursprung_mm: { x: 0.25, y: 0 } }] }] })
      .some((f) => /Ursprung x/.test(f)));

  // [L-9]: der Ursprung liegt NICHT im Planblock und wird davon nicht beruehrt.
  t("#76 der Ursprung steht neben dem Planblock, nicht darin",
    gsRef(verschoben).plan === null && gsRef(verschoben).ursprung_mm.x === 1000);
  {
    const mitPlan = M.setzePlanAnsicht(
      M.setzePlan(verschoben, gs0, { datei: "eg.png", typ: "image/png", breite_px: 800, hoehe_px: 600 }),
      gs0, { versatz_x_mm: 4000, versatz_y_mm: 4000 });
    t("#76 [L-9] ein Planversatz bewegt den Ursprung nicht",
      M.ursprung(mitPlan, gs0).x === 1000 && M.ursprung(mitPlan, gs0).y === -500);
  }

  // Verlustfreier Datei-Roundtrip samt nachgefuehrtem Ursprungsmass.
  {
    let m = M.setzeWand(verschoben, gs0, { id: "wU", name: "U",
      lage: { start_mm: { x: 2000, y: 0 }, richtung: "x", laenge_grid: 8 } });
    m = M.setzeBemassung(m, gs0, { id: "bm-u", achse: "x",
      von: null, bis: { wand: "wU", bezug: "min" }, mass_mm: 1000 });
    const zurueck = M.parseMappe(JSON.stringify(M.mappeObjekt(m)));
    t("#76 der verschobene Ursprung uebersteht den Datei-Roundtrip",
      M.ursprung(zurueck, gs0).x === 1000 && M.ursprung(zurueck, gs0).y === -500);
    t("#76 das Ursprungsmass uebersteht ihn mit",
      M.bemassungen(zurueck, gs0)[0].mass_mm === 1000
      && M.bemassungen(zurueck, gs0)[0].von === null);
    t("#76 der Roundtrip ist bitgenau",
      JSON.stringify(M.mappeObjekt(zurueck)) === JSON.stringify(M.mappeObjekt(m)));
  }
}

// --- [P-20] Manuelle Mengen der Geschoss-Gesamtstueckliste (#81) ----------
// Das Feld liegt AM GESCHOSS, ist optional und braucht keinen Formatbump. Geprueft wird
// hier ausschliesslich die Speicherseite: die reine Operation, das vollstaendige
// Ruecksetzen, der verlustfreie Roundtrip und dass die Validierung Werte NICHT abweist
// (ein unzulaessiger Wert wird verrechnungsseitig gemeldet, nicht hier verworfen).
{
  const gsRef = (m) => m.gebaeude[0].geschosse[0];
  const basis = M.leereMappe("Mengenprojekt");
  const gsM = gsRef(basis).id;

  t("#81 ein neues Geschoss startet ohne Uebersteuerung",
    JSON.stringify(gsRef(basis).mengen) === "{}"
    && JSON.stringify(M.geschossMengen(basis, gsM)) === "{}");
  t("#81 eine Mappe OHNE das Feld bleibt gueltig und laedt als leer",
    (() => {
      const roh = M.mappeObjekt(basis);
      delete roh.gebaeude[0].geschosse[0].mengen;
      const zurueck = M.parseMappe(JSON.stringify(roh));
      return M.validiereMappe(zurueck).length === 0
        && JSON.stringify(M.geschossMengen(zurueck, gsM)) === "{}";
    })());

  const mitEiner = M.setzeGeschossMenge(basis, gsM, "i3@-", 7);
  t("#81 die reine Operation setzt genau einen Eintrag",
    M.geschossMengen(mitEiner, gsM)["i3@-"] === 7
    && Object.keys(M.geschossMengen(mitEiner, gsM)).length === 1);
  t("#81 die uebergebene Mappe bleibt unveraendert (rein)",
    JSON.stringify(M.geschossMengen(basis, gsM)) === "{}");

  const mitZwei = M.setzeGeschossMenge(mitEiner, gsM, "rod_std@1000", 0);
  t("#81 mehrere Eintraege stehen unabhaengig nebeneinander, 0 ist zulaessig",
    M.geschossMengen(mitZwei, gsM)["i3@-"] === 7
    && M.geschossMengen(mitZwei, gsM)["rod_std@1000"] === 0);
  t("#81 ein Eintrag ist einzeln aenderbar",
    M.geschossMengen(M.setzeGeschossMenge(mitZwei, gsM, "i3@-", 9), gsM)["i3@-"] === 9);

  const zurueckgesetzt = M.setzeGeschossMenge(mitZwei, gsM, "i3@-", null);
  t("#81 Ruecksetzen entfernt den Schluessel VOLLSTAENDIG",
    !Object.prototype.hasOwnProperty.call(M.geschossMengen(zurueckgesetzt, gsM), "i3@-")
    && M.geschossMengen(zurueckgesetzt, gsM)["rod_std@1000"] === 0);
  t("#81 nach dem Ruecksetzen aller Eintraege ist der Stand der Ausgangsstand",
    JSON.stringify(M.mappeObjekt(M.setzeGeschossMenge(zurueckgesetzt, gsM, "rod_std@1000", null)))
      === JSON.stringify(M.mappeObjekt(basis)));

  t("#81 eine nicht ganzzahlige Menge wird abgewiesen statt gerundet",
    wirft(() => M.setzeGeschossMenge(basis, gsM, "i3@-", 2.5), /nicht ganzzahlig/));
  t("#81 eine negative Menge wird abgewiesen",
    wirft(() => M.setzeGeschossMenge(basis, gsM, "i3@-", -1), /negativ/));
  t("#81 eine leere Positionskennung wird abgewiesen",
    wirft(() => M.setzeGeschossMenge(basis, gsM, "  ", 3), /Positionskennung/));
  t("#81 ein unbekanntes Geschoss wird benannt abgewiesen",
    wirft(() => M.setzeGeschossMenge(basis, "gs-gibt-es-nicht", "i3@-", 3), /gibt es nicht/));

  // Der Roundtrip ist der eigentliche Punkt: `normGeschoss` baut ein explizites Objekt,
  // ein nicht mitgefuehrtes Feld ginge hier verloren — und damit auch im Archiv ([L-13]).
  {
    const zurueck = M.parseMappe(JSON.stringify(M.mappeObjekt(mitZwei)));
    t("#81 der Roundtrip Objekt -> JSON -> parse ist verlustfrei",
      JSON.stringify(M.geschossMengen(zurueck, gsM))
        === JSON.stringify(M.geschossMengen(mitZwei, gsM)));
    t("#81 der Roundtrip ist bitgenau",
      JSON.stringify(M.mappeObjekt(zurueck)) === JSON.stringify(M.mappeObjekt(mitZwei)));
    t("#81 die Formatversion bleibt 2 (kein Bump)",
      zurueck.version === 2 && M.MAPPE_VERSION === 2);
  }
  // Struktur-Operationen laufen alle durch `_klon`/`normMappe` — auch dort muss das Feld
  // ueberleben, sonst raeumte jedes Umbenennen oder Verorten es stillschweigend weg.
  {
    let m = M.setzeWand(mitZwei, gsM, { id: "w1", name: "W1", lage: null });
    m = M.benenneUm(m, gsM, "EG neu");
    m = M.setzeGeschossHoehe(m, gsM, 2400);
    t("#81 das Feld uebersteht Verorten, Umbenennen und Hoehenvorgabe",
      M.geschossMengen(m, gsM)["i3@-"] === 7 && gsRef(m).name === "EG neu");
  }

  // [P-20]/[P-9]: `validiereMappe` laeuft bei JEDEM Schreibvorgang und bei jedem Import.
  // Ein unzulaessiger WERT darf die Mappe deshalb nicht unladbar machen — er wird in der
  // Verrechnung gemeldet. Geprueft wird hier nur die STRUKTUR.
  {
    const mitMuell = { ...M.mappeObjekt(basis),
      gebaeude: [{ ...basis.gebaeude[0],
        geschosse: [{ ...gsRef(basis), mengen: { "i3@-": "viele", "rod_std@1000": -3 } }] }] };
    t("#81 ein unzulaessiger WERT macht die Mappe nicht ungueltig",
      M.validiereMappe(mitMuell).length === 0);
    const geladen = M.parseMappe(JSON.stringify(mitMuell));
    t("#81 er wird beim Lesen weder verworfen noch zurechtgebogen",
      M.geschossMengen(geladen, gsM)["i3@-"] === "viele"
      && M.geschossMengen(geladen, gsM)["rod_std@1000"] === -3);
    t("#81 eine Liste statt einer Abbildung faellt strukturell auf",
      M.mengenFehler(["i3@-"], "EG").length === 1
      && /keine Abbildung/.test(M.mengenFehler(["i3@-"], "EG")[0]));
    t("#81 ein Eintrag ohne Positionskennung faellt strukturell auf",
      M.mengenFehler({ "": 3 }, "EG").length === 1);
    t("#81 fehlendes Feld ist kein Fehler und wird nicht erfunden",
      M.mengenFehler(null).length === 0 && JSON.stringify(M.normMengen(undefined)) === "{}");
  }
}


// ===========================================================================
// #136 Export/Import der Ausgleichslage — am ECHTEN Pfad (storage.js)
// ---------------------------------------------------------------------------
// Die neuen Geometrie- und Wandfelder (`courses[].unterkante_mm/oberkante_mm/hoehe_mm`,
// `courses[].ausgleich`, `wandelement.ausgleichslage_aktiv`) und die Produktrollen der
// Ausgleichssteine muessen den Roundtrip Export -> Datei -> Import WERTGLEICH ueberstehen.
// Zugleich gilt: KEIN Formatsprung und KEINE stille Migration beim Lesen — eine vor #136
// erzeugte Datei wird unveraendert gelesen und rechnet wie bisher.
{
  // Minimal-Polyfills wie in smoke_storage.mjs — storage.js braucht nur so viel.
  class MemStorage {
    constructor() { this.m = new Map(); }
    getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) { this.m.set(k, String(v)); }
    removeItem(k) { this.m.delete(k); }
  }
  globalThis.localStorage = new MemStorage();
  globalThis.Blob = class { constructor(parts) { this._t = parts.join(""); } };
  globalThis.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
  globalThis.document = {
    body: { appendChild() {}, insertBefore() {}, firstChild: null },
    createElement: () => ({ click() {}, remove() {}, set href(_) {}, set download(_) {} }),
  };
  globalThis.window = { addEventListener() {} };

  const store = await import("../../docs/shared/storage.js");
  const { buildWall, wandLagenKanten } = await import("../../docs/shared/sembla-core.js");

  // --- Wand mit Ausgleichslage anlegen und Produktrollen setzen ------------
  const AGW = buildWall("AG-Wand", 3000, 2570, [], null, null, [], null, true,
    { i2: [170], i3: [170] });
  const agId = store.speichere("AG-Wand", AGW);
  store.setzeAktiv(agId);
  store.setzeProduktrolle("ausgl_i2", ["ag-i2-170"], agId);
  store.setzeProduktrolle("ausgl_i3", ["ag-i3-170"], agId);

  const AGC = AGW.courses[AGW.courses.length - 1];
  t("#136 Ausgangswand: genau eine Ausgleichslage 2400…2570 mm",
    AGW.height_mm === 2570 && AGW.ausgleichslage_aktiv === true
    && AGW.courses.filter((c) => c.ausgleich === true).length === 1
    && AGC.unterkante_mm === 2400 && AGC.oberkante_mm === 2570 && AGC.hoehe_mm === 170);

  // --- Export: additive Felder, KEIN Formatsprung --------------------------
  const p = store.projektObjekt(agId);
  const datei = JSON.stringify(p, null, 2);
  t("#136 Export: Formatversion bleibt 2 (kein Schema-/Formatsprung)",
    p.format === "SEMBLA-Projekt" && p.version === 2 && store.PROJEKT_VERSION === 2);
  t("#136 Export: die Lagenkanten stehen als Felder in der Datei",
    /"unterkante_mm"/.test(datei) && /"oberkante_mm"/.test(datei) && /"hoehe_mm"/.test(datei));
  t("#136 Export: Aktivierung und Ausgleichslage stehen in der Datei",
    /"ausgleichslage_aktiv": true/.test(datei) && /"ausgleich": true/.test(datei));
  t("#136 Export: die Produktrollen der Ausgleichssteine reisen mit",
    p.eingaben.planung.produkte.rollen.ausgl_i2[0] === "ag-i2-170"
    && p.eingaben.planung.produkte.rollen.ausgl_i3[0] === "ag-i3-170");

  // --- Import: wertgleicher Roundtrip -------------------------------------
  const neuId = store.importiereText(datei, "AG-Wand.json");
  const zurueck = store.holeElement(neuId);
  // `wandtyp` ist die EINE dokumentierte Altfeld-Normalisierung beim Lesen (Schema v3) und
  // hat mit #136 nichts zu tun; sie wird hier ausgeklammert, nicht verschwiegen.
  const ohneWandtyp = (x) => { const o = { ...x }; delete o.wandtyp; return JSON.stringify(o); };
  t("#136 Roundtrip: das Wandelement ist wertgleich (Zielhoehe, Aktivierung, Lagenkanten)",
    ohneWandtyp(zurueck.wandelement) === ohneWandtyp(AGW));
  t("#136 Roundtrip: Zielhoehe und Aktivierung einzeln nachgewiesen",
    zurueck.wandelement.height_mm === 2570 && zurueck.wandelement.ausgleichslage_aktiv === true);
  t("#136 Roundtrip: Ausgleichslagengeometrie wertgleich", (() => {
    const c = zurueck.wandelement.courses[zurueck.wandelement.courses.length - 1];
    return c.ausgleich === true && c.unterkante_mm === 2400 && c.oberkante_mm === 2570
      && c.hoehe_mm === 170;
  })());
  t("#136 Roundtrip: die Produktrollen sind wertgleich",
    JSON.stringify(store.holeEingaben(neuId).planung.produkte.rollen.ausgl_i2) === '["ag-i2-170"]'
    && JSON.stringify(store.holeEingaben(neuId).planung.produkte.rollen.ausgl_i3) === '["ag-i3-170"]');

  // --- Altformat: eingefrorene Datei VOR #136 ------------------------------
  // Wortwoertlich der damalige Stand: keine Lagenkanten, kein `ausgleich`, kein
  // `ausgleichslage_aktiv`. Sie muss unveraendert lesbar bleiben und darf beim Lesen NICHT
  // still migriert werden.
  const ALT = JSON.stringify({
    format: "SEMBLA-Projekt", version: 2, name: "Altwand 2600",
    wandelement: {
      name: "Altwand 2600", length_mm: 500, height_mm: 400, grid_mm: 125, course_mm: 200,
      lagen: 2, raster: 4,
      courses: [
        { lage: 0, stones: [{ x0: 0, x1: 375, type: "i3" }, { x0: 375, x1: 500, type: "i2" }] },
        { lage: 1, stones: [{ x0: 0, x1: 125, type: "i2" }, { x0: 125, x1: 500, type: "i3" }] },
      ],
      openings: [],
    },
    eingaben: { planung: { produkte: { quelle: null, rollen: {} } } },
  });
  const altId = store.importiereText(ALT, "Altwand.json");
  const altGelesen = store.holeElement(altId).wandelement;
  t("#136 Altformat: die Datei bleibt lesbar",
    altGelesen.height_mm === 400 && altGelesen.courses.length === 2);
  t("#136 Altformat: beim Lesen wird kein #136-Feld ergaenzt (keine stille Migration)",
    ohneWandtyp(altGelesen) === JSON.stringify(JSON.parse(ALT).wandelement)
    && !("ausgleichslage_aktiv" in altGelesen)
    && altGelesen.courses.every((c) => !("unterkante_mm" in c) && !("oberkante_mm" in c)
      && !("hoehe_mm" in c) && !("ausgleich" in c)));
  t("#136 Altformat: sie rechnet wie bisher (200-mm-Lagen aus dem Rueckfall)",
    JSON.stringify(wandLagenKanten(altGelesen))
    === JSON.stringify([{ lage: 0, unterkante_mm: 0, oberkante_mm: 200, hoehe_mm: 200 },
                        { lage: 1, unterkante_mm: 200, oberkante_mm: 400, hoehe_mm: 200 }]));
  // Erst ein SPEICHERN schreibt das erweiterte Format — das Lesen allein nie.
  t("#136 Altformat: der Roundtrip der Altdatei ist wieder wertgleich",
    ohneWandtyp(store.projektObjekt(altId).wandelement) === JSON.stringify(JSON.parse(ALT).wandelement));
}

// --- Wandnummer je Gebaeude, Geschosskuerzel, erzeugter Wandname -------------
// Entscheid Felix/Tibor 03.11.2026: Name = Wand_<Kuerzel>-<Nr>, Nummer je GEBAEUDE,
// nie wieder vergeben, nichts rueckt nach; Kuerzel Pflicht, 1–2 Zeichen, eindeutig.
{
  // Kuerzelpruefung
  t("Kuerzel: EG, E1, U1, 7 sind zulaessig",
    ["EG", "E1", "U1", "7"].every((k) => M.kuerzelFehler(k).length === 0));
  t("Kuerzel: leer wird als Pflichtfeld benannt",
    /fehlt.*Pflicht/.test(M.kuerzelFehler("")[0]) && /fehlt/.test(M.kuerzelFehler(null)[0]));
  t("Kuerzel: drei Zeichen, Sonderzeichen und Umlaute werden benannt abgewiesen",
    ["EGX", "E-", "Ä", "E G"].every((k) => /unzulässig/.test(M.kuerzelFehler(k)[0] || "")));
  t("Kuerzel: Kleinschreibung wird nur normalisiert, nicht abgewiesen",
    M.normKuerzel(" eg ") === "EG" && M.kuerzelFehler("eg").length === 0);
  t("Kuerzel: doppelt im Gebaeude wird benannt abgewiesen",
    /schon vergeben/.test(M.kuerzelFehler("EG", ["OG", "EG"])[0]));

  // Vorschlag aus der Bezeichnung (Bestand ohne Kuerzel)
  const vs = (n, b) => M.kuerzelVorschlag(n, b);
  t("Kuerzel-Vorschlag: bekannte Muster",
    vs("EG") === "EG" && vs("Erdgeschoss") === "EG" && vs("OG") === "OG" && vs("DG") === "DG"
    && vs("Dachgeschoss") === "DG" && vs("UG") === "UG" && vs("Keller") === "KG" && vs("KG") === "KG");
  t("Kuerzel-Vorschlag: mit einstelliger Zahl Buchstabe + Ziffer",
    vs("1. OG") === "O1" && vs("2. Obergeschoss") === "O2" && vs("UG 2") === "U2");
  t("Kuerzel-Vorschlag: sonst Anfangsbuchstabe + Ziffer bzw. die ersten zwei Zeichen",
    vs("Geschoss 1") === "G1" && vs("Halle") === "HA" && vs("Zwischengeschoss") === "ZW");
  t("Kuerzel-Vorschlag: belegt wird eindeutig gemacht",
    vs("EG", ["EG"]) === "E1" && vs("EG", ["EG", "E1"]) === "E2" && vs("Geschoss 1", ["G1"]) === "GE");

  // Mappe mit zwei Geschossen in einem Gebaeude, ein zweites Gebaeude
  let w = M.leereMappe("Nummern", { geschoss: "Erdgeschoss" });
  const geb = w.gebaeude[0].id;
  const eg = w.gebaeude[0].geschosse[0].id;
  const og = M.fuegeGeschossHinzu(w, geb, "Obergeschoss", 2600, "OG");
  w = og.mappe;
  t("Kuerzel: das erste Geschoss traegt sofort sein vorgeschlagenes Kuerzel",
    M.findeGeschoss(w, eg).geschoss.kuerzel === "EG" && M.findeGeschoss(w, og.id).geschoss.kuerzel === "OG");
  t("Kuerzel: Anlegen mit doppeltem Kuerzel wird benannt abgewiesen",
    wirft(() => M.fuegeGeschossHinzu(w, geb, "Noch ein EG", 2600, "EG"), /schon vergeben/));
  t("Kuerzel: Anlegen mit unzulaessigem Kuerzel wird benannt abgewiesen",
    wirft(() => M.fuegeGeschossHinzu(w, geb, "DG", 2600, "DGX"), /unzulässig/));

  // Vergabe: neue Waende bekommen die naechste Nummer, je Gebaeude durchgezaehlt
  w = M.setzeWand(w, eg, { id: "n-1", name: "frei gewaehlt", lage: null });
  w = M.setzeWand(w, eg, { id: "n-2", lage: null });
  w = M.setzeWand(w, og.id, { id: "n-3", lage: null });
  const nr = (m2, id) => M.findeWand(m2, id).wand.nr;
  const nm = (m2, id) => M.findeWand(m2, id).wand.name;
  t("Vergabe: 1, 2 im EG und 3 im OG — die Nummer gilt je Gebaeude, nicht je Geschoss",
    nr(w, "n-1") === 1 && nr(w, "n-2") === 2 && nr(w, "n-3") === 3 && w.gebaeude[0].wand_nr_max === 3);
  t("Name: immer Wand_<Kuerzel>-<Nr>, ein mitgegebener Name wird nicht uebernommen",
    nm(w, "n-1") === "Wand_EG-1" && nm(w, "n-3") === "Wand_OG-3" && M.wandName("EG", 12) === "Wand_EG-12");
  t("Name: freies Umbenennen einer Wand wird benannt abgewiesen",
    wirft(() => M.benenneUm(w, "n-1", "Treppenhaus"), /nicht frei änderbar/));
  t("Vergabe: setzeWand mit nachgereichtem Namen aendert Nummer und Namen nicht",
    nr(M.setzeWand(w, eg, { id: "n-1", name: "anders" }), "n-1") === 1
    && nm(M.setzeWand(w, eg, { id: "n-1", name: "anders" }), "n-1") === "Wand_EG-1");

  // Loeschen ohne Nachruecken
  let ohne2 = M.entferneWand(w, "n-2");
  t("Loeschen: die Nummer 2 bleibt eine Luecke, nichts rueckt nach",
    nr(ohne2, "n-1") === 1 && nr(ohne2, "n-3") === 3 && ohne2.gebaeude[0].wand_nr_max === 3);
  ohne2 = M.setzeWand(ohne2, eg, { id: "n-4", lage: null });
  t("Loeschen: die naechste Wand bekommt 4 — die geloeschte 2 wird nie wieder vergeben",
    nr(ohne2, "n-4") === 4 && nm(ohne2, "n-4") === "Wand_EG-4");
  const alles = M.entferneWand(M.entferneWand(M.entferneWand(ohne2, "n-1"), "n-3"), "n-4");
  t("Loeschen: auch nach dem Loeschen ALLER Waende bleibt der Zaehler stehen",
    alles.gebaeude[0].wand_nr_max === 4
    && nr(M.setzeWand(alles, og.id, { id: "n-5", lage: null }), "n-5") === 5);

  // Kopie (die Mappe sieht nur eine neue Kennung) bekommt die naechste Nummer
  t("Kopie: eine neu eingetragene Kennung bekommt die naechste Nummer",
    nr(M.setzeWand(ohne2, eg, { id: "n-1-kopie", name: "Wand_EG-1 (Kopie)", lage: null }), "n-1-kopie") === 5
    && !/Kopie/.test(nm(M.setzeWand(ohne2, eg, { id: "n-1-kopie", lage: null }), "n-1-kopie")));

  // Verschieben
  const verschoben = M.setzeWand(ohne2, og.id, { id: "n-1" });
  t("Verschieben ins andere Geschoss desselben Gebaeudes: Nummer bleibt, nur das Kuerzel wechselt",
    nr(verschoben, "n-1") === 1 && nm(verschoben, "n-1") === "Wand_OG-1"
    && verschoben.gebaeude[0].wand_nr_max === 4);
  const geb2 = M.fuegeGebaeudeHinzu(verschoben, "Haus 2");
  const gs2 = M.fuegeGeschossHinzu(geb2.mappe, geb2.id, "EG", 2600, "EG");
  const fremd = M.setzeWand(M.setzeWand(gs2.mappe, gs2.id, { id: "h2-1", lage: null }), gs2.id, { id: "n-1" });
  t("Verschieben in ein anderes Gebaeude: dort die naechste Nummer (Haus 2 zaehlt fuer sich)",
    nr(fremd, "h2-1") === 1 && nr(fremd, "n-1") === 2 && nm(fremd, "n-1") === "Wand_EG-2"
    && M.findeGebaeude(fremd, geb).wand_nr_max === 4);
  t("Kuerzel: dasselbe Kuerzel in einem ANDEREN Gebaeude ist zulaessig",
    M.validiereMappe(fremd).length === 0);

  // Kuerzel aendern: alle Waende des Geschosses heissen danach anders, Nummern bleiben
  const k2 = M.setzeGeschossKuerzel(ohne2, eg, "E0");
  t("Kuerzel aendern: Namen folgen, Nummern bleiben",
    nm(k2, "n-1") === "Wand_E0-1" && nm(k2, "n-4") === "Wand_E0-4" && nr(k2, "n-4") === 4
    && nm(k2, "n-3") === "Wand_OG-3");
  t("Kuerzel aendern: doppelt bzw. leer wird benannt abgewiesen",
    wirft(() => M.setzeGeschossKuerzel(ohne2, eg, "OG"), /schon vergeben/)
    && wirft(() => M.setzeGeschossKuerzel(ohne2, eg, ""), /fehlt/));

  // Migration: Bestand ohne Nummern und Kuerzel wird einmal durchnummeriert
  const roh = {
    format: "SEMBLA-Projektmappe", version: 2,
    projekt: { id: "prj-alt", name: "Alt" },
    gebaeude: [{ id: "geb-alt", name: "Haus", geschosse: [
      { id: "gs-a", name: "EG", waende: [{ id: "a1", name: "Nord" }, { id: "a2", name: "Süd" }] },
      { id: "gs-b", name: "1. OG", waende: [{ id: "b1", name: "Ost" }] },
      { id: "gs-c", name: "Erdgeschoss Anbau", waende: [{ id: "c1", name: "West" }] },
    ] }],
  };
  const mig = M.normMappe(roh);
  t("Migration: Geschoss fuer Geschoss, Waende in Mappenreihenfolge durchnummeriert",
    ["a1", "a2", "b1", "c1"].map((id) => nr(mig, id)).join(",") === "1,2,3,4"
    && mig.gebaeude[0].wand_nr_max === 4);
  t("Migration: Kuerzel aus der Bezeichnung, im Gebaeude eindeutig gemacht",
    mig.gebaeude[0].geschosse.map((g) => g.kuerzel).join(",") === "EG,O1,E1");
  t("Migration: Namen erzeugt, Kennungen unberuehrt",
    nm(mig, "a1") === "Wand_EG-1" && nm(mig, "b1") === "Wand_O1-3" && nm(mig, "c1") === "Wand_E1-4");
  t("Migration: idempotent — eine zweite Normalisierung ist wertgleich",
    JSON.stringify(M.normMappe(mig)) === JSON.stringify(mig));
  t("Migration: gueltig und weiter Formatversion 2", M.validiereMappe(mig).length === 0 && mig.version === 2);

  // Reparatur: doppelte/fehlende Nummern (etwa aus einer Datei) werden neu vergeben
  const kaputt = JSON.parse(JSON.stringify(mig));
  kaputt.gebaeude[0].geschosse[0].waende[1].nr = 1;          // a2 doppelt zu a1
  kaputt.gebaeude[0].geschosse[1].waende[0].nr = null;       // b1 fehlt
  kaputt.gebaeude[0].wand_nr_max = 7;                        // Luecken 5…7 gab es schon
  const rep = M.normMappe(kaputt);
  t("Reparatur: die gueltige Nummer bleibt, doppelte/fehlende bekommen die naechsten nach dem Zaehler",
    nr(rep, "a1") === 1 && nr(rep, "a2") === 8 && nr(rep, "b1") === 9 && nr(rep, "c1") === 4
    && rep.gebaeude[0].wand_nr_max === 9);
  const unzul = JSON.parse(JSON.stringify(mig));
  unzul.gebaeude[0].geschosse[1].kuerzel = "OGX";
  t("Datei mit unzulaessigem Kuerzel wird beim Import benannt abgewiesen",
    wirft(() => M.parseMappe(JSON.stringify(unzul)), /OGX.*unzulässig/));
  const dopp = JSON.parse(JSON.stringify(mig));
  dopp.gebaeude[0].geschosse[1].kuerzel = "EG";
  t("Datei mit doppeltem Kuerzel im Gebaeude wird beim Import benannt abgewiesen",
    wirft(() => M.parseMappe(JSON.stringify(dopp)), /EG.*schon vergeben/));

  // Neu berechnen
  const neu = M.nummeriereWaendeNeu(ohne2, geb);
  t("Neu berechnen: lueckenlos 1…n in Mappenreihenfolge, Zaehler = n",
    ["n-1", "n-4", "n-3"].map((id) => nr(neu, id)).join(",") === "1,2,3"
    && neu.gebaeude[0].wand_nr_max === 3 && nm(neu, "n-4") === "Wand_EG-2");
  t("Neu berechnen: rein — die Ausgangsmappe bleibt unveraendert",
    nr(ohne2, "n-4") === 4 && ohne2.gebaeude[0].wand_nr_max === 4);
  t("Neu berechnen: nur das genannte Gebaeude",
    M.findeGebaeude(M.nummeriereWaendeNeu(fremd, geb), geb2.id).wand_nr_max === 2
    && wirft(() => M.nummeriereWaendeNeu(ohne2, "geb-gibtsnicht"), /Unbekanntes Gebäude/));
  t("naechsteWandNr = Zaehler + 1", M.naechsteWandNr(ohne2, geb) === 5);
}

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
