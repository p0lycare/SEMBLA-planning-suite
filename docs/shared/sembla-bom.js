// @ts-check
/**
 * SEMBLA BOM — Stücklisten-Baustein (Single Source of Truth für Mengen/Positionen).
 *
 * Kanonische Mengenermittlung aus dem Wandelement: Steine aus `courses`,
 * Vorspann-/Anschluss-Mengen aus der Core-BOM (`w.bom`, autoritativ),
 * Sonderlängen aus `tension_columns[].segments`. Fällt bei fehlenden Feldern
 * auf `w.bom` / Defaults zurück (Alt-Bundles).
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

  let rodStd = 0, haveSeg = false; const sonder = {};
  for (const col of (w.tension_columns || [])) for (const sg of (col.segments || [])) {
    haveSeg = true;
    const st = (sg.gewindestangen != null) ? sg.gewindestangen : (col.gewindestangen || 1);
    rodStd += Math.max(0, st - 1);
    if (sg.letzte_stange_mm != null) { const k = Math.round(sg.letzte_stange_mm); sonder[k] = (sonder[k] || 0) + 1; }
  }
  const sonderList = Object.keys(sonder).map(k => ({ len_mm: +k, anzahl: sonder[k] })).sort((a, b) => a.len_mm - b.len_mm);
  let rodSonder = sonderList.reduce((a, x) => a + x.anzahl, 0);
  let gesamt = rodStd + rodSonder;
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

  return { i2, i3, rod_mm: (w.rod_mm || 1100), rodStd, rodSonder, sonderList,
           gewindestangen_gesamt: gesamt, verbindungsmuttern: verbSplice,
           senkkopfschrauben: senkkopf, kopplungsmuttern_basis: kopplBasis,
           spannplatten, spannmuttern,
           stahlblech_module: blechModule, stahlblech_mm: blechMm, stahlblech_dicke_mm: blechDicke,
           stossfugen, dichtstreifen_mm: dichtMm };
}

/**
 * Kanonische Positions-Liste für die Stückliste — überall identisch.
 * unit 'Stk' = Stückzahl, 'm' = Länge in Metern (dezimal).
 * @param {any} w Wandelement
 */
export function semblaBomItems(w) {
  const b = semblaBom(w); const rc = b.rod_mm / 10;
  const sonderTxt = b.sonderList.length ? (" (L=" + b.sonderList.map(x => _semNum(x.len_mm / 10) + " cm").join(" / ") + ")") : "";
  return [
    { key: "i3",          label: "Stein i3 (37,5 cm)",                unit: "Stk", menge: b.i3 },
    { key: "i2",          label: "Stein i2 (25 cm)",                  unit: "Stk", menge: b.i2 },
    { key: "rod_std",     label: "Gewindestange " + _semNum(rc) + " cm", unit: "Stk", menge: b.rodStd },
    { key: "rod_sonder",  label: "Gewindestange Sonderlänge" + sonderTxt, unit: "Stk", menge: b.rodSonder },
    { key: "kupplung",    label: "Kopplungsmutter (Stangenstoß)",     unit: "Stk", menge: b.verbindungsmuttern },
    { key: "kuppl_basis", label: "Kopplungsmutter (Fuß)",             unit: "Stk", menge: b.kopplungsmuttern_basis },
    { key: "senkkopf",    label: "Senkkopfschraube (Fuß)",            unit: "Stk", menge: b.senkkopfschrauben },
    { key: "spannmutter", label: "Spannmutter",                       unit: "Stk", menge: b.spannmuttern },
    { key: "spannplatte", label: "Spannplatte",                       unit: "Stk", menge: b.spannplatten },
    { key: "blech",       label: "Stahlblech-Modul (" + _semNum(b.stahlblech_dicke_mm) + " mm)", unit: "Stk", menge: b.stahlblech_module },
    { key: "dicht_stk",   label: "Dichtstreifen 20 cm (Schallschutz)", unit: "Stk", menge: b.stossfugen },
    { key: "dicht",       label: "Dichtstreifen – Gesamtlänge",       unit: "m",   menge: +((b.dichtstreifen_mm / 1000).toFixed(2)) },
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
