// @ts-check
/**
 * SEMBLA BOM — Stücklisten-Baustein (Single Source of Truth für Mengen/Positionen).
 *
 * Kanonische Mengenermittlung aus dem Wandelement: Steine aus `courses`,
 * Vorspann-/Anschluss-Mengen aus der Core-BOM (`w.bom`, autoritativ),
 * Sonderlängen aus `tension_columns[].segments`. Fällt bei fehlenden Feldern
 * auf `w.bom` / Defaults zurück (Alt-Bundles).
 *
 * Die Positionsliste ist die BAUSTELLENSTÜCKLISTE ([P-18]/[P-19]): sie nennt, WAS in welcher
 * Menge verbaut wird. Bauteilgleiche Einbaustellen stehen als EINE Position (Kopplungsmutter für
 * Stangenstöße und Fuß), und Sonderzuschnitte tragen nur ihr Fertigmaß — aus welcher
 * Lagerlänge sie geschnitten werden, ist Sache des Einkaufs und wird hier nicht geplant.
 *
 * Für GEWINDESTANGENSTÜCKE — und nur für sie ([P-19]) — gibt es zusätzlich die
 * Einbauteil-Identität: `einbauteile()` liefert je real eingebautem Stück einen Datensatz mit
 * deterministischer ID, Art, Fertigmaß und Wandreferenz. Die Mengen der Stückliste werden
 * daraus AGGREGIERT (nicht daneben gerechnet), und jede Stangenposition führt die IDs ihrer
 * Einzelteile mit. Für Steine, Muttern, Bleche und Dichtstreifen wird KEINE Einzel-ID
 * erfunden — der Rechenkern kennt dort keine Einzelteil-Identität ([P-9]).
 *
 * Boden- und Kopfblech werden hier aus den realen Platten (`base_plate`/`top_plate`)
 * in getrennte Positionen aufgeteilt ([A-1]). Das BODENBLECH kommt seit #91 als reale
 * Teilliste aus dem Rechenkern (`base_plate.teile`, [A-10]/[A-11]/[A-12]) und steht je
 * Standardlänge bzw. je Sonder-Fertigmaß als eigene Position — abgeleitet, nie nachgerechnet.
 * Das Kopfblech bleibt eine Modulzählung. `bom.stahlblech_module` bleibt als Aggregat
 * erhalten (Anzahl Bodenblechteile + Kopfblechmodule).
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

// ------------------------------------------------- Einbauteile (Gewindestangen, [P-19])

/** Klartext der Stückart in Liste, Datei und Zeichnung — EIN Wortlaut ([P-19]/[D-4]). */
export const ART_LABEL = { standard: "Standardteil", sonder: "Sonderzuschnitt", rest: "Reststück oben" };

/**
 * Zusätzliches, NICHT-farbliches Unterscheidungszeichen der Stückart ([P-19]): die
 * Kennzeichnung muss im Schwarz-Weiß-Druck vollständig lesbar bleiben, Farbe ist deshalb
 * immer nur redundante Zugabe zu Symbol und Klartext.
 */
export const ART_SYMBOL = { standard: "■", sonder: "◆", rest: "▲" };

/** Verwendungsrolle (= Stücklistenschlüssel) je Stückart — keine zweite Zuordnungsachse. */
const ART_ROLLE = { standard: "rod_std", sonder: "rod_sonder", rest: "rod_rest" };

/**
 * Deterministische Einbauteil-ID eines Gewindestangenstücks ([P-19]).
 *
 * Alle drei Bestandteile sind am gezeichneten Blatt ablesbar: die Spannachse `k` steht in der
 * Strangtabelle, Segment und Stück werden von UNTEN gezählt — genau in der Richtung, in der
 * montiert wird. Damit ist die ID ohne Zusatztabelle in der Zeichnung wiederfindbar, und
 * Liste, Datei und Zeichnung benutzen dieselbe Kennung (kein zweites Schema).
 *
 * Die Achse wird BEWUSST NICHT auf zwei Stellen aufgefüllt: die Zeichnung schreibt sie als
 * `k3`, und eine ID `GS-k03…` wäre auf der Baustelle eine zweite Schreibweise derselben
 * Achse. Eine lexikografische Sortierbarkeit braucht die ID nicht — die Reihenfolge kommt
 * aus der Ableitung (Achse, dann Segment, dann Stück von unten).
 * @param {number} k Spannachse (Rasterindex) @param {number} segment 1-basiert von unten
 * @param {number} stueck 1-basiert von unten
 */
export function einbauteilId(k, segment, stueck) {
  return "GS-k" + k + "." + segment + "." + stueck;
}

/**
 * Stücke eines Segments für Alt-Bundles OHNE `stuecke` — dieselbe Ableitung wie bisher
 * (Stangenzahl − 1 Standardlängen plus, falls vorhanden, `letzte_stange_mm` als Sonderlänge).
 * Es wird nichts erfunden: fehlt `letzte_stange_mm`, entsteht auch kein Stück.
 */
function _altStuecke(sg, col, rodFallback) {
  const st = (sg.gewindestangen != null) ? sg.gewindestangen : (col.gewindestangen || 1);
  const arr = [];
  for (let i = 0; i < Math.max(0, st - 1); i++) arr.push({ len_mm: rodFallback, art: "standard" });
  if (sg.letzte_stange_mm != null) arr.push({ len_mm: Math.round(sg.letzte_stange_mm), art: "sonder" });
  return arr;
}

/**
 * KANONISCHE Einbauteilliste der Gewindestangen ([P-19]): je real eingebautem Stück ein
 * Datensatz. Quelle ist ausschliesslich `tension_columns[].segments[].stuecke` ([Z-2]/[Z-3]/
 * [Z-6]) — es wird nichts nachgerechnet, nichts gespeichert und keine zweite Stückableitung
 * geführt. `semblaBom()` aggregiert seine Stangenmengen aus GENAU dieser Liste, damit
 * Einzelteil und Menge nicht auseinanderlaufen können.
 *
 * Ein VORHANDENES, aber LEERES `stuecke` ist ein gemeldeter Zuschnittkonflikt ([Z-6]:
 * `reststueck_zu_lang`/`kein_ausgangsprodukt`): dieses Segment hat KEIN Einbauteil, und es
 * wird auch keines ersatzweise gebildet ([P-6]/[P-9]).
 *
 * @param {any} w Wandelement
 * @returns {Array<{id:string,kategorie:string,rolle:string,art:"standard"|"sonder"|"rest",
 *   fertigmass_mm:number,wand:string,k:number,segment:number,stueck:number,
 *   z0_mm:number,z1_mm:number}>}
 */
export function einbauteile(w) {
  const out = [];
  const rodFallback = (w && w.rod_mm) || 1100;
  const wand = wandReferenz(w);
  for (const col of ((w && w.tension_columns) || [])) {
    const segs = col.segments || [];
    for (let si = 0; si < segs.length; si++) {
      const sg = segs[si];
      const roh = Array.isArray(sg.stuecke) ? sg.stuecke : _altStuecke(sg, col, rodFallback);
      let z = +sg.z0_mm || 0;
      for (let i = 0; i < roh.length; i++) {
        const s = roh[i];
        const len = Math.round(s.len_mm);
        // Unbekannte/fehlende Art gilt als Standardlänge — dieselbe Festlegung wie in
        // `stueckFarbe()` (sembla-montage.js), damit nirgends eine Art erfunden wird.
        const art = (s.art === "rest" || s.art === "sonder") ? s.art : "standard";
        out.push({
          id: einbauteilId(col.k, si + 1, i + 1),
          kategorie: "gewindestange", rolle: ART_ROLLE[art], art,
          fertigmass_mm: len, wand, k: col.k, segment: si + 1, stueck: i + 1,
          z0_mm: z, z1_mm: z + len,
        });
        z += len;
      }
    }
  }
  return out;
}

/**
 * Wandreferenz jeder Stücklistenzeile ([P-19]): der Name des WANDELEMENTS selbst. Bewusst
 * nicht die Speicher-/Mappen-Kennung — die lebt ausserhalb des Wandelements und wäre eine
 * zweite Identität ([P-1]). Eine projektweite Wandnummer gibt es (noch) nicht und wird
 * deshalb nicht erfunden.
 * @param {any} w
 */
export function wandReferenz(w) { return (w && w.name) || "Wandelement"; }

/**
 * Kanonische Mengen aus dem Wandelement.
 * @param {any} w Wandelement
 */
export function semblaBom(w) {
  const bom = w.bom || {};
  let i2 = 0, i3 = 0, haveStones = false;
  for (const c of (w.courses || [])) for (const st of c.stones) { haveStones = true; if (st.type === "i2") i2++; else if (st.type === "i3") i3++; }
  if (!haveStones) { i2 = bom.i2 || 0; i3 = bom.i3 || 0; }

  // --- Gewindestangen: KANONISCH aus den Einbauteilen ([Z-2]/[Z-3]/[P-19]) ---------------
  // `einbauteile()` liest allein `segments[].stuecke` (Core) und ist damit die EINZIGE
  // Stückableitung; hier wird sie nur noch nach REALER Länge gruppiert, damit die Stückliste je
  // Standardlänge genau eine Position hat und [P-14] eindeutig greift. Die IDs der Einzelteile
  // reisen mit der Gruppe mit ([P-19]): aggregiert wird die Menge, nicht die Identität.
  // Alt-Bundles ohne `stuecke` behandelt `einbauteile()` mit der früheren Ableitung
  // (Stangen − 1 Standard, letztes Stück als Sonderlänge) — dieselbe Gesamtzahl wie bisher.
  const rodFallback = (w.rod_mm || 1100);
  const teile = einbauteile(w);
  let haveSeg = false, haveStuecke = false;
  for (const col of (w.tension_columns || [])) for (const sg of (col.segments || [])) {
    haveSeg = true;
    if (Array.isArray(sg.stuecke) && sg.stuecke.length) haveStuecke = true;
  }
  const stdMap = new Map(), sonderMap = new Map(), restMap = new Map();
  for (const t of teile) {
    // [Z-6] Das Reststueck ist ein EIGENES Katalogprodukt (eigene Rolle `rod_rest`) und damit
    // eine eigene Position — es darf nicht unter den Standardlaengen verschwinden, sonst waere
    // die Preisauflösung wieder mehrdeutig. [P-18] Sonderzuschnitte werden allein nach
    // FERTIGMASS gruppiert; das Ausgangsmaß ist Beschaffungssache und spannt keine Position auf.
    const m = t.art === "rest" ? restMap : (t.art === "sonder" ? sonderMap : stdMap);
    const key = String(t.fertigmass_mm);
    const e = m.get(key) || { len_mm: t.fertigmass_mm, anzahl: 0, ids: [] };
    e.anzahl++; e.ids.push(t.id);
    m.set(key, e);
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
  // [A-10]/[A-12] Bodenblech-TEILE: der Rechenkern fuehrt die realen Bleche je Wand
  // (`base_plate.teile` mit Rastermass und Bauteilmass). Hier wird NUR abgeleitet: gleiche
  // Teile werden zu je einer Position gefaltet — je Standardlaenge eine, je Sonder-Fertigmass
  // eine. Fehlt die Teilliste (Alt-Bundle, gespeichertes Wandelement vor #91), bleibt es bei
  // der bisherigen EINEN Position aus der Modulzahl; es wird nichts nachgerechnet und nichts
  // erfunden.
  const bpTeile = (w.base_plate && Array.isArray(w.base_plate.teile)) ? w.base_plate.teile : null;
  let blechBodenTeile = null;
  if (bpTeile) {
    const grp = new Map();
    for (const t of bpTeile) {
      const art = t.art === "sonder" ? "sonder" : "standard";
      const raster = +t.raster_mm, bauteil = +t.bauteil_mm;
      const k = art + "@" + raster;
      if (!grp.has(k)) grp.set(k, { art, raster_mm: raster, bauteil_mm: bauteil, anzahl: 0 });
      grp.get(k).anzahl += 1;
    }
    // Deterministische Reihenfolge: Standardlaengen absteigend, danach die Sonderzuschnitte.
    blechBodenTeile = [...grp.values()].sort((a, b2) =>
      (a.art === b2.art ? b2.raster_mm - a.raster_mm : (a.art === "standard" ? -1 : 1)));
  }
  const blechKopf = ("top_plate" in (w || {}))
    ? ((w.top_plate && Number.isFinite(+w.top_plate.module)) ? +w.top_plate.module : 0)
    : Math.max(0, blechModule - blechBoden);

  return { i2, i3, rod_mm: rodFallback, rodStd, rodSonder, rodRest, sonderList,
           stangenStd, stangenSonder, stangenRest, stueckAbleitung: haveStuecke,
           einbauteile: teile, wand: wandReferenz(w),
           gewindestangen_gesamt: gesamt, verbindungsmuttern: verbSplice,
           senkkopfschrauben: senkkopf, kopplungsmuttern_basis: kopplBasis,
           spannplatten, spannmuttern,
           stahlblech_module: blechModule, stahlblech_module_boden: blechBoden,
           stahlblech_module_kopf: blechKopf, blech_boden_teile: blechBodenTeile,
           stahlblech_mm: blechMm, stahlblech_dicke_mm: blechDicke,
           stossfugen, dichtstreifen_mm: dichtMm };
}

/**
 * Ist die Wand abgedichtet ([A-6], Issue #71)? Die Entscheidung faellt JE WAND und steht als
 * `wandelement.abdichtung` am Wandelement (kanonische Werte und `normAbdichtung()` in
 * `storage.js`).
 *
 * Hier steht bewusst eine STRIKTE Inline-Pruefung statt eines Imports: `sembla-bom.js` ist
 * importfrei und soll es bleiben — der Mengenbaustein darf nicht an die localStorage-Schicht
 * haengen. Strikt heisst: NUR der kanonische Wert schaltet die Dichtstreifen ein. Alles
 * andere — fehlendes Feld, Altbestand, Tippfehler — gilt als NICHT abgedichtet. Damit kann
 * ein unbekannter Wert nie stillschweigend Material in die Stueckliste bringen.
 * @param {any} w Wandelement
 */
function _abgedichtet(w) { return !!w && w.abdichtung === "abgedichtet"; }

/**
 * Kanonische Positions-Liste für die Stückliste — überall identisch.
 * unit 'Stk' = Stückzahl, 'm' = Länge in Metern (dezimal).
 *
 * `nachrichtlich: true` kennzeichnet eine Position, die eine bereits als Einbauposition
 * gezählte Ware nur noch anders ausdrückt (Dichtstreifen-Gesamtlänge, [A-6]). Sie ist
 * eine Mengenangabe zur Information und wird NIE bepreist — sonst stünde dieselbe Ware
 * zweimal in einer Summe.
 *
 * Die beiden Dichtstreifenpositionen entstehen nur für eine ABGEDICHTETE Wand ([A-6],
 * Issue #71) — und zwar GENAU HIER, weil dies die einzige Erzeugungsstelle ist. Modul 4,
 * Modul 5, Modul 7, die Gesamtstückliste und der zentrale Export lesen alle diese Liste
 * und brauchen deshalb keine eigene Filterung (die waere ein zweiter, driftfaehiger Ort).
 * `semblaBom()` bleibt unberuehrt: `stossfugen` und `dichtstreifen_mm` sind Mengen des
 * Rechenkerns und bleiben unabhaengig von der Abdichtung lesbar.
 * @param {any} w Wandelement
 */
export function semblaBomItems(w) {
  const b = semblaBom(w);
  const bd = _semNum(b.stahlblech_dicke_mm);
  const cm = mm => _semNum(mm / 10);
  // Gewindestangenstücke tragen zusätzlich die Einbauteil-Kennzeichnung ([P-19]): `art`
  // (mit Klartext und Symbol), `fertigmass_mm` und die IDs der aggregierten Einzelteile.
  // `ids.length === menge` ist damit erzwungen, weil beides aus derselben Liste kommt.
  const stange = (art, x, label) => ({
    key: ART_ROLLE[art], label, unit: "Stk", menge: x.anzahl, mass_mm: x.len_mm,
    art, art_label: ART_LABEL[art], art_symbol: ART_SYMBOL[art],
    fertigmass_mm: x.len_mm, ids: (x.ids || []).slice(),
  });
  // Je verwendete Standardlänge EINE Position ([Z-4]/[P-14]): `mass_mm` ist das maßgebende
  // Maß dieser Position, damit die Preisauflösung genau ein Katalogprodukt findet, obwohl
  // mehrere Standardlängen gleichzeitig eingebaut sind. Menge = Anzahl realer Stücke.
  const rodStdItems = (b.stangenStd.length ? b.stangenStd : [{ len_mm: b.rod_mm, anzahl: 0, ids: [] }])
    .map(x => stange("standard", x, "Gewindestange " + cm(x.len_mm) + " cm"));
  // Sonderzuschnitte ([P-18]): Die Stückliste ist die BAUSTELLENLISTE — sie nennt das
  // Fertigmaß und die Stückzahl, die verbaut werden. Aus welcher Lagerlänge geschnitten wird,
  // ist Sache des Einkaufs: es gibt kein Ausgangsprodukt, keine Herkunftsangabe im Label und
  // keinen Preis (die Rolle ist nicht bepreist). `mass_mm` ist deshalb das FERTIGMASS.
  const rodSonderItems = (b.stangenSonder.length ? b.stangenSonder : [{ len_mm: b.rod_mm, anzahl: 0, ids: [] }])
    .map(x => stange("sonder", x, "Gewindestange Sonderzuschnitt " + cm(x.len_mm) + " cm"));
  // [Z-6] Reststueck am oberen Wandabschluss: eigene Rolle, eigene Position, eigenes Maß.
  // Ohne gewaehltes Reststueck existiert die Position gar nicht (Menge 0 waere eine
  // Behauptung ueber ein Produkt, das niemand gewaehlt hat).
  const rodRestItems = b.stangenRest.map(x =>
    stange("rest", x, "Gewindestange Reststück " + cm(x.len_mm) + " cm (oberer Abschluss)"));
  // Jede Zeile nennt die Wand, an der sie verbaut wird ([P-19]) — auch die Mengenpositionen
  // ohne Einzelteil-Identität (Steine, Muttern, Bleche, Dichtstreifen).
  return _mitWand(b.wand, [
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
    { key: "senkkopf",    label: "Sechskantschraube (Fuß)",            unit: "Stk", menge: b.senkkopfschrauben },
    { key: "spannmutter", label: "Spannmutter",                       unit: "Stk", menge: b.spannmuttern },
    { key: "spannplatte", label: "Spannplatte",                       unit: "Stk", menge: b.spannplatten },
    // [A-10]/[A-12] Bodenblech: je verwendeter Standardlänge und je Sonder-Fertigmaß eine
    // eigene Position — keine Modulzählung mehr. `mass_mm` ist das RASTERMASS (der
    // Preis-Diskriminator gegen das Katalogprodukt nach [P-14]), `fertigmass_mm` das reale
    // BAUTEILMASS (Rastermaß − 2 mm). Das Bauteilmaß ist damit ausgewiesen UND macht die
    // Positionskennung nach [P-20] je Länge eindeutig. Der Sonderzuschnitt trägt seine eigene
    // Rolle (`blech_boden_sonder`, nicht wählbar, nicht bepreist — wie `rod_sonder`).
    ...(b.blech_boden_teile
      ? b.blech_boden_teile.map(t => t.art === "sonder"
        ? { key: "blech_boden_sonder",
            label: "Bodenblech Sonderzuschnitt " + _semNum(t.bauteil_mm) + " mm (Raster "
              + _semNum(t.raster_mm) + " mm, " + bd + " mm)",
            unit: "Stk", menge: t.anzahl, mass_mm: t.raster_mm, fertigmass_mm: t.bauteil_mm }
        : { key: "blech_boden",
            label: "Bodenblech " + _semNum(t.raster_mm) + " mm (Bauteilmaß "
              + _semNum(t.bauteil_mm) + " mm, " + bd + " mm)",
            unit: "Stk", menge: t.anzahl, mass_mm: t.raster_mm, fertigmass_mm: t.bauteil_mm })
      : [{ key: "blech_boden", label: "Bodenblech-Modul (" + bd + " mm)", unit: "Stk",
           menge: b.stahlblech_module_boden }]),
    { key: "blech_kopf",  label: "Kopfblech-Modul (" + bd + " mm)",   unit: "Stk", menge: b.stahlblech_module_kopf },
    // Nur bei abgedichteter Wand — an unveraenderter Stelle in der Liste ([A-6]/#71).
    ...(_abgedichtet(w) ? [
    { key: "dicht_stk",   label: "Dichtstreifen 20 cm (Schallschutz)", unit: "Stk", menge: b.stossfugen },
    { key: "dicht",       label: "Dichtstreifen – Gesamtlänge",       unit: "m",   menge: +((b.dichtstreifen_mm / 1000).toFixed(2)),
      nachrichtlich: true },
    ] : []),
  ]);
}

/** Wandreferenz an jede Position schreiben ([P-19]) — ohne die Positionsreihenfolge zu ändern. */
function _mitWand(wand, items) { return items.map(it => ({ wand, ...it })); }

/**
 * Einheitliche Mengen-Formatierung für Zeilen (Stück vs. Meter).
 * @param {{unit:string, menge:number}} it
 */
export function semblaBomMenge(it) {
  if (it && it.unit === "m") return _semNum(+(it.menge).toFixed(2)) + " m";
  return _semNum(it ? it.menge : 0) + "×";
}
