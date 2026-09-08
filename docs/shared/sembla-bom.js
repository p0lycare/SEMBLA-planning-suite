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
 * Kennt der wirksame Bauteilkatalog BAUGRUPPEN ([P-21]), werden sie hier — und nur hier
 * ([P-23]) — in Einzelteile aufgeloest und merkmalsgleich mit den flachen Positionen
 * desselben Stuecklistenschluessels aggregiert. Die Ausgabe bleibt FLACH ([P-19]), und die
 * ausgewiesene Menge bleibt exakt die des Rechenkerns: die Instanzzahl kommt aus der
 * unveraenderten Core-BOM, und was eine Baugruppe beitraegt, wird der flachen Position
 * zuvor abgezogen.
 *
 * Eigene Datei (shared/-Regel b): mehrere mögliche Nutzer (Modul 4 Stückliste)
 * und eigene Tests (`test-shared.mjs` prüft gegen die Core-BOM). Früher lag der
 * Block in `sembla-shared.js` und wurde per `sync-shared.mjs` in die Tools kopiert —
 * das Bau-/Kopiersystem entfällt im MVP, es gibt nur noch diese eine Betriebskopie.
 *
 * ES-Modul: läuft im Browser (Modul 4 per window.SEMBLA) und in den Node-Tests
 * per `import`. Einheiten: mm (Kern), Ausgabe teils in cm/m (Labels).
 */

// Der EINZIGE Import dieser Datei — und ausdruecklich der RECHENKERN, nicht die Katalog- oder
// Speicherschicht: `wirksameZwischenpunkte()` ist die kanonische Ableitung der Zwischenspannpunkte
// ([A-15]/[A-17]) und damit nach [A-25] die alleinige Mengenquelle fuer Einlegeblech und Mutter.
// Anders als beim Ausgleichsblech ([A-18]) gibt es dafuer KEIN gespeichertes Feld am Wandelement,
// das sich hier bloss auszaehlen liesse — die Punkte werden bei jeder Rechnung frisch abgeleitet.
// Eine Zweitrechnung an dieser Stelle waere genau der Drift, den [P-6] ausschliesst; der Kern
// importiert selbst nichts, es entsteht also kein Zyklus.
import { wirksameZwischenpunkte } from "./sembla-core.js";

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

  // [A-18]/[A-20]…[A-23] Ausgleichsbleche unter dem Bodenblech: je Ausgleichspunkt genau EIN
  // Blech. Quelle ist ausschliesslich die vom Rechenkern gerechnete Punktliste
  // (`wandelement.ausgleichspunkte`) — die Menge ist deren LAENGE und wird hier nie
  // nachgerechnet. Eine Ersatzrechnung aus der Wandlaenge (3 je Meter) waere eine zweite
  // Mengenquelle neben dem Kern und damit genau der Drift, den [P-6] ausschliesst; sie steht
  // deshalb ausdruecklich nicht hier. Fehlt das Feld (Altbestand, gespeichertes Wandelement vor
  // #96), ist die Menge 0 — es wird keine Punktzahl erfunden ([P-9]).
  const ausgleichspunkte = Array.isArray(w.ausgleichspunkte) ? w.ausgleichspunkte.length : 0;

  // [A-25] Zwischenspannpunkte: je wirksamem Punkt genau EIN Einlegeblech ([A-14]) und genau
  // EINE Mutter von oben ([A-16]). Quelle ist ausschliesslich `wirksameZwischenpunkte()` des
  // Rechenkerns — sie zaehlt je (Spannachse, Hoehe) einen Punkt, also genau je real
  // eingebautem Blech. Hier wird davon NICHTS nachgerechnet: keine Segment-, Lagen- oder
  // Hoehenarithmetik, kein Ersatz aus Wandhoehe oder Segmentzahl ([P-6]). Ein Wandelement ohne
  // Zwischenspannpunkte — Altbestand ohne `tension_columns`, ein ausdruecklich leerer Override
  // nach [A-17] oder durchweg einlagige Segmente — liefert die Menge 0 statt einer geratenen
  // Zahl ([P-9]); den Leerfall entscheidet der Kern selbst, nicht diese Datei.
  const zwischenpunkte = wirksameZwischenpunkte(w).length;

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
           ausgleichspunkte, zwischenpunkte,
           stossfugen, dichtstreifen_mm: dichtMm };
}

/**
 * Ist die Wand abgedichtet ([A-6], Issue #71)? Die Entscheidung faellt JE WAND und steht als
 * `wandelement.abdichtung` am Wandelement (kanonische Werte und `normAbdichtung()` in
 * `storage.js`).
 *
 * Hier steht bewusst eine STRIKTE Inline-Pruefung statt eines Imports: `sembla-bom.js` haengt
 * nicht an der localStorage- oder Katalogschicht und soll es nicht tun — der Mengenbaustein
 * liegt HINTER dem Rechenkern und darf nur diesen kennen (s. den einen Import oben).
 * Strikt heisst: NUR der kanonische Wert schaltet die Dichtstreifen ein. Alles
 * andere — fehlendes Feld, Altbestand, Tippfehler — gilt als NICHT abgedichtet. Damit kann
 * ein unbekannter Wert nie stillschweigend Material in die Stueckliste bringen.
 * @param {any} w Wandelement
 */
function _abgedichtet(w) { return !!w && w.abdichtung === "abgedichtet"; }

/**
 * FLACHE Positions-Liste der Stückliste — die Bauteile, wie der Rechenkern sie führt.
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
 * `semblaBom()` bleibt unberührt: `stossfugen` und `dichtstreifen_mm` sind Mengen des
 * Rechenkerns und bleiben unabhaengig von der Abdichtung lesbar.
 *
 * Diese Funktion ist der FLACHE Stand: sie kennt keine Baugruppe. Die Aufloesung der
 * Baugruppen nach [P-23] sitzt in `semblaBomItems()` darueber — genau eine Stelle.
 * @param {any} w Wandelement @param {any} b Mengen aus `semblaBom(w)`
 */
function _flachePositionen(w, b) {
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
    // KEINE Unterlegscheibe am Wandabschluss (Fachauskunft 2026-09-08, hebt #92 auf): am
    // normalen oberen Wandabschluss gibt es sie am Spannglied nicht — die Spannmutter sitzt
    // unmittelbar auf der Spannplatte. Scheiben treten allein am DECKENANSCHLUSS auf (dort
    // zwei) und kommen mit dessen Baugruppe, nicht als eigene Position am Wandabschluss.
    // #92 hatte sie als „vorläufig, fachlich unbestätigt" eingeführt und je Spannplatte
    // gezählt; das war eine bepreiste Position für ein Bauteil, das an dieser Einbaustelle
    // nicht verbaut wird. Die Position ist deshalb ersatzlos entfallen und NICHT auf Menge 0
    // gesetzt: eine Zeile mit 0 behauptet weiter eine Einbaustelle ([P-14]).
    // [A-25] Einlegeblech und Mutter am Zwischenspannpunkt: je wirksamem Punkt genau EIN Blech
    // und genau EINE Mutter ([A-14]/[A-16]) — zwei GETRENNTE Positionen, weil es zwei
    // verschiedene Bauteile aus zwei verschiedenen Kategorien sind (Blech/Platte bzw.
    // Verbrauchsmaterial) und [P-14] je Position genau ein Katalogprodukt auflöst.
    // Die Stelle ist bewusst gewaehlt: unmittelbar hinter der Ankergruppe (Spannmutter,
    // Spannplatte, Unterlegscheibe) und VOR der Bodenblechgruppe. Damit bleiben die nach [A-18]
    // benannte Nachbarschaft Bodenblech → Ausgleichsblech → Kopfblech und die geprüfte Lage der
    // Dichtstreifen am Listenende ([A-6]) unberührt; jede bestehende Position behält ihre
    // relative Ordnung.
    // Kein `mass_mm`/`fertigmass_mm`: die Rollen haben keinen Maß-Diskriminator, weil es keinen
    // maßgebenden WANDwert gibt, an dem sich Blech oder Mutter messen liessen (anders als
    // Bodenblech ↔ Modullaenge oder Stange ↔ Stangenlaenge) — ein Maß hier waere ein erfundener
    // Bezug. Auch NICHT `nachrichtlich`: das sind echte Einbaupositionen und keine zweite
    // Ausdrucksform einer schon gezaehlten Ware ([A-6]) — sie werden regulaer bepreist ([P-14]).
    // Ein Zwischenspannpunkt ist KEIN Anker: `spannplatten`/`spannmuttern` aus [A-2]/[A-3]
    // bleiben davon unberührt, und die Bauteile werden mit ihnen nicht zusammengelegt.
    { key: "einlegeblech", label: "Einlegeblech (Zwischenspannpunkt)", unit: "Stk",
      menge: b.zwischenpunkte },
    { key: "zp_mutter", label: "Mutter Einlegeblech (von oben)", unit: "Stk",
      menge: b.zwischenpunkte },
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
    // [A-18] Ausgleichsblech: EINE Position, Menge = Zahl der Ausgleichspunkte ([A-20]…[A-23]).
    // Die Stelle ist bewusst gewaehlt und nicht beliebig: das Blech liegt UNTER dem Bodenblech,
    // es steht deshalb unmittelbar hinter dessen Gruppe und VOR dem Kopfblech. Eine Einfuegung
    // dahinter verschoebe die Dichtstreifen aus ihrer geprueften Lage am Listenende ([A-6]);
    // so bleibt jede bestehende Position in ihrer relativen Ordnung.
    // Kein `mass_mm`/`fertigmass_mm`: die Rolle hat keinen Maß-Diskriminator, weil es keinen
    // maßgebenden WANDwert gibt, an dem sich das Blech messen liesse (anders als Bodenblech
    // ↔ Modullaenge oder Stange ↔ Stangenlaenge) — ein Maß hier waere ein erfundener Bezug.
    // Auch NICHT `nachrichtlich`: das ist eine echte Einbauposition und keine zweite
    // Ausdrucksform einer schon gezaehlten Ware ([A-6]) — sie wird regulaer bepreist ([P-14]).
    { key: "ausgleichsblech", label: "Ausgleichsblech (unter dem Bodenblech)", unit: "Stk",
      menge: b.ausgleichspunkte },
    { key: "blech_kopf",  label: "Kopfblech-Modul (" + bd + " mm)",   unit: "Stk", menge: b.stahlblech_module_kopf },
    // Nur bei abgedichteter Wand — an unveraenderter Stelle in der Liste ([A-6]/#71).
    ...(_abgedichtet(w) ? [
    { key: "dicht_stk",   label: "Dichtstreifen 20 cm (Schallschutz)", unit: "Stk", menge: b.stossfugen },
    { key: "dicht",       label: "Dichtstreifen – Gesamtlänge",       unit: "m",   menge: +((b.dichtstreifen_mm / 1000).toFixed(2)),
      nachrichtlich: true },
    ] : []),
  ]);
}

// ------------------------------------------------- Baugruppen-Aufloesung ([P-23], #94)
//
// Ein Set ist die DEFINITIONSEBENE des Katalogs ([P-21]); die Stueckliste bleibt FLACH ([P-19]).
// Aufgeloest wird an GENAU DIESER STELLE — kein weiterer Leser (Modul 4, `stuecklistePositionen`,
// Gesamtstueckliste, zentraler Export, Zeichnungsblatt) rechnet Baugruppen nach.
//
// Die Aufloesung ist eine RE-AUSDRUECKUNG des gerechneten Standes und KEINE zweite Mengenquelle:
// je Instanz traegt eine Set-Position ihre Menge bei, und genau diese Menge wird der flachen
// Position zuvor ABGEZOGEN. Die ausgewiesene Menge je Position bleibt damit exakt die des
// Rechenkerns — es gibt keine Doppelzaehlung und keine erfundene Menge ([P-9]).

/**
 * Instanzquelle je Baugruppe: welches Feld der Core-BOM die Zahl der real eingebauten
 * Baugruppen DIESER Wand nennt.
 *
 * Die Bindung liegt HIER und nicht im Katalog: die Instanzzahl ist eine Aussage des
 * RECHENKERNS ueber die Wand und keine Katalogangabe — sie im Katalog zu fuehren hiesse,
 * eine gerechnete Zahl konfigurierbar zu machen ([P-6]). Der Katalog definiert allein,
 * WORAUS eine Baugruppe besteht ([P-21]).
 *
 * `set-wandabschluss` -> `spannplatten`: der Rechenkern zaehlt je Anker mit Spannplatte eine
 * Platte (Segmentfuss ueber einer Oeffnung und Segmentkopf, sofern nicht Kopfblech). Genau dort
 * sitzt der Wandabschluss. Die Muttern, die unmittelbar auf dem KOPFBLECH sitzen, stehen in
 * `spannmuttern` und gehoeren KEINER Baugruppe an — sie bleiben flacher Rest (s. u.).
 *
 * Eine Baugruppe ohne Eintrag hier hat keine bekannte Instanzquelle: sie wird BENANNT GEMELDET
 * und bleibt unaufgeloest — eine Anzahl wird nicht geraten ([P-9]).
 */
export const SET_INSTANZQUELLE = { "set-wandabschluss": "spannplatten" };

/** Ganze Zahl ab 1 (Set-Positionsmenge nach [P-21])? */
function _ganzAb1(v) { const n = Number(v); return Number.isInteger(n) && n >= 1; }

/** Traegt die Set-Position eine nicht leere Angabe in diesem Feld? */
function _ref(pos, feld) {
  const v = pos ? pos[feld] : undefined;
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

/**
 * Baugruppen des wirksamen Katalogs in Einzelteilmengen aufloesen — REIN, ohne Speicherzugriff
 * und ohne Katalogimport: der wirksame Katalog wird DURCHGEREICHT, nicht geladen (der
 * Mengenbaustein darf nicht an die Katalog- oder Speicherschicht haengen; der Rechenkern ist
 * keine von beiden).
 *
 * Weil der Rollenschluessel ZUGLEICH der Stuecklistenschluessel ist ([P-13]), braucht die
 * Zuordnung Rolle -> Position keine zweite Achse und keine Rollentabelle. Eine Verwendungsstelle
 * ohne Position in dieser Wand und eine mehrfach belegte (mehrere Standardlaengen je Fertigmass,
 * [Z-2]) sind deshalb nicht eindeutig zuordenbar und werden GEMELDET, nicht geraten.
 *
 * @param {Array<any>} items flache Positionen dieser Wand
 * @param {any} b Mengen aus `semblaBom(w)`
 * @param {any} katalog wirksamer Bauteilkatalog (oder null)
 * @returns {{instanzen:Array<{set:string,name:string,feld:string,anzahl:number}>,
 *   positionen:Array<{set:string,key:string,je_instanz:number,stueck:number}>,
 *   mengen:Map<string,number>, meldungen:string[]}|null} null = keine Baugruppen im Spiel
 */
function _setAufloesung(items, b, katalog) {
  const sets = (katalog && Array.isArray(katalog.sets)) ? katalog.sets : [];
  if (!sets.length) return null;
  const produkte = (katalog && Array.isArray(katalog.produkte)) ? katalog.produkte : [];

  const jeKey = new Map();
  for (const it of items) jeKey.set(it.key, (jeKey.get(it.key) || 0) + 1);
  const basisJeKey = new Map();
  for (const it of items) if (jeKey.get(it.key) === 1) basisJeKey.set(it.key, it.menge);

  const meldungen = [], instanzen = [], positionen = [], beitrag = new Map();

  for (const s of sets) {
    const id = String((s && s.id) || "").trim();
    const name = String((s && s.name) || "").trim() || id || "ohne Namen";
    const feld = Object.prototype.hasOwnProperty.call(SET_INSTANZQUELLE, id)
      ? SET_INSTANZQUELLE[id] : null;
    if (!feld) {
      meldungen.push("Baugruppe „" + name + "“ hat keine bekannte Instanzquelle im "
        + "Rechenkern — sie wird nicht aufgelöst, und eine Anzahl wird nicht geraten.");
      continue;
    }
    const anzahl = Number(b[feld]) || 0;
    instanzen.push({ set: id, name, feld, anzahl });
    if (anzahl <= 0) continue;   // diese Einbaustelle gibt es an dieser Wand nicht
    const liste = (s && Array.isArray(s.positionen)) ? s.positionen : [];
    for (let i = 0; i < liste.length; i++) {
      const pos = liste[i];
      const nr = "Baugruppe „" + name + "“, Position " + (i + 1) + ": ";
      const refP = _ref(pos, "produkt"), refR = _ref(pos, "rolle");
      let key = null;
      if (refP && refR) {
        meldungen.push(nr + "es ist genau eine Angabe zulässig — entweder ein Produkt "
          + "oder eine Verwendungsrolle, nicht beides.");
        continue;
      } else if (refR) {
        key = refR;
      } else if (refP) {
        const p = produkte.find(x => x && String(x.id) === refP);
        if (!p) {
          meldungen.push(nr + "Produkt „" + refP + "“ ist im wirksamen Katalog nicht "
            + "vorhanden.");
          continue;
        }
        const rl = (Array.isArray(p.rollen) ? p.rollen : []).map(String);
        if (rl.length !== 1) {
          meldungen.push(nr + "Produkt „" + refP + "“ nennt "
            + (rl.length === 0 ? "keine" : "mehrere") + " Verwendungsrollen — die "
            + "Einbaustelle ist damit nicht eindeutig.");
          continue;
        }
        key = rl[0];
      } else {
        meldungen.push(nr + "weder ein Produkt noch eine Verwendungsrolle angegeben.");
        continue;
      }
      if (!_ganzAb1(pos && pos.menge)) {
        meldungen.push(nr + "Menge „" + String(pos && pos.menge) + "“ ist keine ganze "
          + "Zahl ab 1.");
        continue;
      }
      if (!jeKey.has(key)) {
        meldungen.push(nr + "Verwendungsstelle „" + key + "“ führt in der "
          + "Stückliste dieser Wand keine Position — die Baugruppe bleibt dort "
          + "unaufgelöst.");
        continue;
      }
      if (jeKey.get(key) > 1) {
        meldungen.push(nr + "Verwendungsstelle „" + key + "“ trägt mehrere "
          + "Positionen (je Fertigmaß eine) — die Zuordnung ist nicht eindeutig und "
          + "wird nicht geraten.");
        continue;
      }
      const stueck = anzahl * Number(pos.menge);
      beitrag.set(key, (beitrag.get(key) || 0) + stueck);
      positionen.push({ set: id, key, je_instanz: Number(pos.menge), stueck });
    }
  }

  const mengen = new Map();
  for (const [key, stueck] of beitrag) {
    const basis = basisJeKey.has(key) ? basisJeKey.get(key) : 0;
    // Abgezogen wird nur, was der Rechenkern an dieser Einbaustelle wirklich fuehrt; der
    // verbleibende REST gehoert keiner Baugruppe (die Spannmutter unmittelbar auf dem
    // Kopfblech) und bleibt flach stehen. Fordert eine Baugruppe MEHR, bleibt die
    // ausgewiesene Menge die gerechnete und die Abweichung wird benannt ([P-9]).
    const gedeckt = Math.min(stueck, basis);
    if (stueck > basis) {
      meldungen.push("Baugruppen fordern " + stueck + "× „" + key + "“, der "
        + "Rechenkern führt an dieser Wand " + basis + " — die ausgewiesene Menge "
        + "bleibt die gerechnete; es wird nichts erfunden.");
    }
    const rest = basis - gedeckt;          // nicht von einer Baugruppe erfasst
    mengen.set(key, rest + gedeckt);       // flacher Rest + aufgeloeste Einzelteile
  }
  return { instanzen, positionen, mengen, meldungen };
}

/**
 * KANONISCHE Positionsliste der Stueckliste ([P-19]) — die flachen Bauteile dieser Wand,
 * mit den Baugruppen des wirksamen Katalogs in Einzelteile aufgeloest ([P-23]).
 *
 * OHNE Katalog (oder ohne Baugruppen darin) ist der Rueckgabewert bit-gleich der flachen
 * Liste: es gibt keinen zweiten Rechenweg und keinen Unterschied zum Stand vor den Baugruppen.
 * Die Ausgabe bleibt FLACH — keine Vater-Kind-Beziehung, keine Baugruppenzeile, keine neue
 * Position und kein geaendertes `key`/`mass_mm`/`fertigmass_mm` (die Positionskennung nach
 * [P-20] haengt daran).
 *
 * @param {any} w Wandelement @param {any} [katalog] wirksamer Bauteilkatalog
 */
export function semblaBomItems(w, katalog = null) {
  const b = semblaBom(w);
  const items = _flachePositionen(w, b);
  const auf = _setAufloesung(items, b, katalog);
  if (!auf || !auf.mengen.size) return items;
  return items.map(it => (auf.mengen.has(it.key)
    ? { ...it, menge: auf.mengen.get(it.key) } : it));
}

/**
 * Nachweis der Baugruppen-Aufloesung ([P-23]) — welche Baugruppen mit welcher Instanzzahl
 * gegriffen haben und was NICHT aufloesbar war. Reine Leseansicht fuer die Oberflaeche und die
 * Tests; `semblaBomItems()` bleibt eine reine Positionsliste und benutzt dieselbe Ableitung
 * (es gibt nur eine).
 *
 * Eine unaufloesbare Baugruppenposition steht hier BENANNT und wird nirgends stillschweigend
 * uebergangen; sie erzeugt weder eine Position noch eine Menge.
 *
 * @param {any} w Wandelement @param {any} [katalog] wirksamer Bauteilkatalog
 * @returns {{instanzen:Array<{set:string,name:string,feld:string,anzahl:number}>,
 *   positionen:Array<{set:string,key:string,je_instanz:number,stueck:number}>,
 *   meldungen:string[]}}
 */
export function semblaBomSets(w, katalog = null) {
  const b = semblaBom(w);
  const auf = _setAufloesung(_flachePositionen(w, b), b, katalog);
  return auf
    ? { instanzen: auf.instanzen, positionen: auf.positionen, meldungen: auf.meldungen }
    : { instanzen: [], positionen: [], meldungen: [] };
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
