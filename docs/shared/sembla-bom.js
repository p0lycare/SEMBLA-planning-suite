// @ts-check
/**
 * SEMBLA BOM — Stücklisten-Baustein (Single Source of Truth für Mengen/Positionen).
 *
 * Kanonische Mengenermittlung aus dem Wandelement: Steine aus `courses`,
 * Vorspann-/Anschluss-Mengen aus der Core-BOM (`w.bom`, autoritativ),
 * Sonderlängen aus `tension_columns[].segments`. Fällt bei fehlenden Feldern
 * auf `w.bom` / Defaults zurück (Alt-Bundles).
 *
 * Die Positionsliste ist die BAUSTELLENLISTE ([P-18]): sie nennt, WAS in welcher Menge
 * verbaut wird. Bauteilgleiche Einbaustellen stehen als EINE Position (Kopplungsmutter für
 * Stangenstöße und Fuß), und Sonderzuschnitte tragen nur ihr Fertigmaß — aus welcher
 * Lagerlänge sie geschnitten werden, ist Sache des Einkaufs und wird hier nicht geplant.
 *
 * Boden- und Kopfblech werden hier aus den realen Platten (`base_plate`/`top_plate`)
 * in getrennte Positionen aufgeteilt ([A-1]); der Rechenkern bleibt unverändert und
 * aggregiert sie weiter in `bom.stahlblech_module` (Summe bleibt identisch).
 *
 * Eigene Datei (shared/-Regel b): mehrere mögliche Nutzer (Modul 4 Stückliste)
 * und eigene Tests (`test-shared.mjs` prüft gegen die Core-BOM). Früher lag der
 * Block in `sembla-shared.js` und wurde per `sync-shared.mjs` in die Tools kopiert —
 * das Bau-/Kopiersystem entfällt im MVP, es gibt nur noch diese eine Betriebskopie.
 *
 * ES-Modul: läuft im Browser (Modul 4 per window.SEMBLA) und in den Node-Tests
 * per `import`. Einheiten: mm (Kern), Ausgabe teils in cm/m (Labels).
 */

/** Deutsche Tausendertrennung ohne Nachkommastellen (für Labels). */
function _semNum(n) { return (isFinite(n) ? n : 0).toLocaleString("de-DE"); }

/**
 * Kanonische Mengen aus dem Wandelement.
 * @param {any} w Wandelement
 */
export function semblaBom(w) {
  const bom = w.bom || {};
  let i2 = 0, i3 = 0, haveStones = false;
  for (const c of (w.courses || [])) for (const st of c.stones) { haveStones = true; if (st.type === "i2") i2++; else if (st.type === "i3") i3++; }
  if (!haveStones) { i2 = bom.i2 || 0; i3 = bom.i3 || 0; }

  // --- Gewindestangen: KANONISCH aus segments[].stuecke ([Z-2]/[Z-3]) --------------------
  // `stuecke` ist die einzige Stückableitung (Core). Jedes Stück ist entweder eine echte
  // ausgewählte Standardlänge (`art:'standard'`) oder ein Sonderzuschnitt (`art:'sonder'`)
  // mit dem Ausgangsprodukt `quelle_mm`. Gruppiert wird nach REALER Länge, damit die
  // Stückliste je Standardlänge genau eine Position hat und [P-14] wieder eindeutig greift.
  // Alt-Bundles ohne `stuecke` fallen auf die frühere Ableitung zurück (Stangen − 1 Standard,
  // letztes Stück als Sonderlänge) — dieselbe Gesamtzahl, nur ohne Längenaufschlüsselung.
  const rodFallback = (w.rod_mm || 1100);
  const stdMap = new Map(), sonderMap = new Map(), restMap = new Map();
  const zaehl = (m, key, obj) => m.set(key, { ...obj, anzahl: (m.get(key)?.anzahl || 0) + 1 });
  let haveSeg = false, haveStuecke = false;
  for (const col of (w.tension_columns || [])) for (const sg of (col.segments || [])) {
    haveSeg = true;
    // Ein VORHANDENES, aber LEERES `stuecke` ist keine fehlende Angabe, sondern ein gemeldeter
    // Zuschnittkonflikt ([Z-6]: `reststueck_zu_lang`/`kein_ausgangsprodukt`): fuer dieses Segment
    // ist KEIN Zuschnitt bestimmt. Der Alt-Bundle-Fallback darf hier nicht greifen — er leitete
    // aus `letzte_stange_mm` (= Segmenthoehe) eine Sonderlaenge ab, die im Wandelement nirgends
    // steht. Das JSON ist die einzige Quelle ([P-6]/[P-9]); gemeldet wird der Konflikt, erfunden
    // wird nichts.
    if (Array.isArray(sg.stuecke) && !sg.stuecke.length) continue;
    if (Array.isArray(sg.stuecke) && sg.stuecke.length) {
      haveStuecke = true;
      for (const s of sg.stuecke) {
        const len = Math.round(s.len_mm);
        // [Z-6] Das Reststueck ist ein EIGENES Katalogprodukt (eigene Rolle `rod_rest`) und
        // damit eine eigene Position — es darf nicht unter den Standardlaengen verschwinden,
        // sonst waere die Preisauflösung wieder mehrdeutig und die Bestellmenge falsch.
        if (s.art === "rest") zaehl(restMap, String(len), { len_mm: len });
        // [P-18] Sonderzuschnitte werden allein nach FERTIGMASS gruppiert — das Ausgangsmaß
        // (`quelle_mm`) ist Beschaffungssache und darf keine zweite Position aufspannen.
        else if (s.art === "sonder") zaehl(sonderMap, String(len), { len_mm: len });
        else zaehl(stdMap, String(len), { len_mm: len });
      }
      continue;
    }
    const st = (sg.gewindestangen != null) ? sg.gewindestangen : (col.gewindestangen || 1);
    for (let i = 0; i < Math.max(0, st - 1); i++) zaehl(stdMap, String(rodFallback), { len_mm: rodFallback });
    if (sg.letzte_stange_mm != null) {
      const len = Math.round(sg.letzte_stange_mm);
      zaehl(sonderMap, String(len), { len_mm: len });
    }
  }
  const stangenStd = [...stdMap.values()].sort((a, b) => b.len_mm - a.len_mm);
  const stangenSonder = [...sonderMap.values()].sort((a, b) => a.len_mm - b.len_mm);
  const stangenRest = [...restMap.values()].sort((a, b) => b.len_mm - a.len_mm);
  const sonderList = stangenSonder.map(x => ({ len_mm: x.len_mm, anzahl: x.anzahl }));
  let rodStd = stangenStd.reduce((a, x) => a + x.anzahl, 0);
  let rodSonder = stangenSonder.reduce((a, x) => a + x.anzahl, 0);
  const rodRest = stangenRest.reduce((a, x) => a + x.anzahl, 0);
  let gesamt = rodStd + rodSonder + rodRest;
  if (!haveSeg) { gesamt = bom.gewindestangen || 0; rodStd = gesamt; rodSonder = 0; }

  // Anschluss & Bleche aus Core-BOM (autoritativ); Fallbacks für Alt-Bundles ohne diese Felder
  const num = (v, d) => (v != null ? v : d);
  const verbSplice   = num(bom.verbindungsmuttern, rodStd);
  const senkkopf     = num(bom.senkkopfschrauben, 0);
  const kopplBasis   = num(bom.kopplungsmuttern_basis, senkkopf);
  const spannplatten = num(bom.spannplatten, bom.stahlplatten || 0);
  const spannmuttern = num(bom.spannmuttern, 0);
  const blechModule  = num(bom.stahlblech_module, 0);
  const blechMm      = num(bom.stahlblech_mm, 0);
  const blechDicke   = num(bom.stahlblech_dicke_mm, 15);
  const stossfugen   = num(bom.stossfugen, 0);
  const dichtMm      = num(bom.dichtstreifen_mm, stossfugen * 200);

  // Boden- und Kopfblech sind PHYSISCH GETRENNTE Bauteile ([A-1]) und werden hier — in der
  // gemeinsamen Ausgabeschicht — aus den REAL vorhandenen Platten des Wandelements getrennt.
  // Der Rechenkern bleibt unveraendert; er fuehrt `base_plate`/`top_plate` (je mit `module`)
  // bereits einzeln und aggregiert sie nur in `bom.stahlblech_module`. Fehlen die Platten
  // (Alt-Bundle), wird das Bodenblech aus Wandlaenge/Modullaenge nachgerechnet und der Rest
  // dem Kopfblech zugeordnet — die SUMME bleibt in jedem Fall die Core-Gesamtzahl, es kann
  // also weder eine Doppelzaehlung noch eine Fehlmenge entstehen.
  const blechModulMm = (w.prestress && +w.prestress.blech_mm > 0) ? +w.prestress.blech_mm : 1000;
  const bpModule = (w.base_plate && Number.isFinite(+w.base_plate.module)) ? +w.base_plate.module : null;
  const blechBoden = bpModule != null
    ? bpModule
    : Math.min(blechModule, Math.ceil((w.length_mm || 0) / blechModulMm));
  const blechKopf = ("top_plate" in (w || {}))
    ? ((w.top_plate && Number.isFinite(+w.top_plate.module)) ? +w.top_plate.module : 0)
    : Math.max(0, blechModule - blechBoden);

  return { i2, i3, rod_mm: rodFallback, rodStd, rodSonder, rodRest, sonderList,
           stangenStd, stangenSonder, stangenRest, stueckAbleitung: haveStuecke,
           gewindestangen_gesamt: gesamt, verbindungsmuttern: verbSplice,
           senkkopfschrauben: senkkopf, kopplungsmuttern_basis: kopplBasis,
           spannplatten, spannmuttern,
           stahlblech_module: blechModule, stahlblech_module_boden: blechBoden,
           stahlblech_module_kopf: blechKopf,
           stahlblech_mm: blechMm, stahlblech_dicke_mm: blechDicke,
           stossfugen, dichtstreifen_mm: dichtMm };
}

/**
 * Kanonische Positions-Liste für die Stückliste — überall identisch.
 * unit 'Stk' = Stückzahl, 'm' = Länge in Metern (dezimal).
 *
 * `nachrichtlich: true` kennzeichnet eine Position, die eine bereits als Einbauposition
 * gezählte Ware nur noch anders ausdrückt (Dichtstreifen-Gesamtlänge, [A-6]). Sie ist
 * eine Mengenangabe zur Information und wird NIE bepreist — sonst stünde dieselbe Ware
 * zweimal in einer Summe.
 * @param {any} w Wandelement
 */
export function semblaBomItems(w) {
  const b = semblaBom(w);
  const bd = _semNum(b.stahlblech_dicke_mm);
  const cm = mm => _semNum(mm / 10);
  // Je verwendete Standardlänge EINE Position ([Z-4]/[P-14]): `mass_mm` ist das maßgebende
  // Maß dieser Position, damit die Preisauflösung genau ein Katalogprodukt findet, obwohl
  // mehrere Standardlängen gleichzeitig eingebaut sind. Menge = Anzahl realer Stücke.
  const rodStdItems = (b.stangenStd.length ? b.stangenStd : [{ len_mm: b.rod_mm, anzahl: 0 }])
    .map(x => ({ key: "rod_std", label: "Gewindestange " + cm(x.len_mm) + " cm", unit: "Stk",
                 menge: x.anzahl, mass_mm: x.len_mm }));
  // Sonderzuschnitte ([P-18]): Die Stückliste ist die BAUSTELLENLISTE — sie nennt das
  // Fertigmaß und die Stückzahl, die verbaut werden. Aus welcher Lagerlänge geschnitten wird,
  // ist Sache des Einkaufs: es gibt kein Ausgangsprodukt, keine Herkunftsangabe im Label und
  // keinen Preis (die Rolle ist nicht bepreist). `mass_mm` ist deshalb das FERTIGMASS.
  const rodSonderItems = (b.stangenSonder.length ? b.stangenSonder : [{ len_mm: b.rod_mm, anzahl: 0 }])
    .map(x => ({ key: "rod_sonder",
                 label: "Gewindestange Sonderzuschnitt " + cm(x.len_mm) + " cm",
                 unit: "Stk", menge: x.anzahl, mass_mm: x.len_mm }));
  // [Z-6] Reststueck am oberen Wandabschluss: eigene Rolle, eigene Position, eigenes Maß.
  // Ohne gewaehltes Reststueck existiert die Position gar nicht (Menge 0 waere eine
  // Behauptung ueber ein Produkt, das niemand gewaehlt hat).
  const rodRestItems = b.stangenRest.map(x => ({
    key: "rod_rest", label: "Gewindestange Reststück " + cm(x.len_mm) + " cm (oberer Abschluss)",
    unit: "Stk", menge: x.anzahl, mass_mm: x.len_mm }));
  return [
    { key: "i3",          label: "Stein i3 (37,5 cm)",                unit: "Stk", menge: b.i3 },
    { key: "i2",          label: "Stein i2 (25 cm)",                  unit: "Stk", menge: b.i2 },
    ...rodStdItems,
    ...rodSonderItems,
    ...rodRestItems,
    // Kopplungsmuttern sind bauteilgleich ([P-18]): Stangenstoß und Fußanschluss verwenden
    // dasselbe Produkt, also EINE Position mit der Gesamtmenge. Die beiden Einbaustellen
    // bleiben in `semblaBom()` getrennt nachvollziehbar (verbindungsmuttern /
    // kopplungsmuttern_basis) — nur die Bestellzeile ist eine.
    { key: "kupplung",    label: "Kopplungsmutter (Stangenstöße und Fuß)", unit: "Stk",
      menge: b.verbindungsmuttern + b.kopplungsmuttern_basis },
    { key: "senkkopf",    label: "Senkkopfschraube (Fuß)",            unit: "Stk", menge: b.senkkopfschrauben },
    { key: "spannmutter", label: "Spannmutter",                       unit: "Stk", menge: b.spannmuttern },
    { key: "spannplatte", label: "Spannplatte",                       unit: "Stk", menge: b.spannplatten },
    { key: "blech_boden", label: "Bodenblech-Modul (" + bd + " mm)",  unit: "Stk", menge: b.stahlblech_module_boden },
    { key: "blech_kopf",  label: "Kopfblech-Modul (" + bd + " mm)",   unit: "Stk", menge: b.stahlblech_module_kopf },
    { key: "dicht_stk",   label: "Dichtstreifen 20 cm (Schallschutz)", unit: "Stk", menge: b.stossfugen },
    { key: "dicht",       label: "Dichtstreifen – Gesamtlänge",       unit: "m",   menge: +((b.dichtstreifen_mm / 1000).toFixed(2)),
      nachrichtlich: true },
  ];
}

/**
 * Einheitliche Mengen-Formatierung für Zeilen (Stück vs. Meter).
 * @param {{unit:string, menge:number}} it
 */
export function semblaBomMenge(it) {
  if (it && it.unit === "m") return _semNum(+(it.menge).toFixed(2)) + " m";
  return _semNum(it ? it.menge : 0) + "×";
}
