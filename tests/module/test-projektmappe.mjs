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
t("Wand umtragen: Name und Lage bleiben erhalten (kein Datenverlust)",
  M.findeWand(umgetragen, "w-1").wand.name === "EG-W01"
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
t("umbenennen: Wand", M.findeWand(M.benenneUm(m, "w-1", "Neu"), "w-1").wand.name === "Neu");
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
t("[L-7] Namen erhalten", M.findeWand(uebernommen, "w-alt2").wand.name === "Wand B");
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
  t("[K-10] Bemassungen ueberstehen den Datei-Roundtrip",
    M.bemassungen(M.parseMappe(JSON.stringify(M.mappeObjekt(mitBm))), g)[0].mass_mm === 2000);
  t("[K-6] eine widerspruechliche Bemassung ist KEIN Validierungsfehler (sie wird beim Lösen gemeldet)",
    M.validiereMappe(M.setzeBemassung(mitBm, g, { ...bm, id: "bm-2", mass_mm: 2400 })).length === 0);
}

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
