/**
 * GESAMTSTÜCKLISTE über die aktiven Projektstufen (Issue #44) — rein, DOM-frei, NUR LESEND.
 *
 * Die Datei beantwortet genau zwei Fragen und beantwortet sie getrennt:
 *
 *  1. `umfang()` — WELCHE Wände gehören zur gewählten Ebene? Maßgebend ist ausschliesslich die
 *     aktive Projektmappe und ihre Hierarchie (Projekt → Gebäude → Geschoss → Wand). Eine Ebene,
 *     die sich aus den aktiven Zeigern nicht ableiten laesst, wird BENANNT und nicht ersetzt
 *     ([L-10]): es wird kein Projekt, kein Gebäude und kein Geschoss still mitaktiviert, und es
 *     wandert nie eine projektfremde Wand in den Umfang.
 *
 *  2. `gesamtDaten()` — WELCHE Mengen entstehen daraus? Jede Wand wird ueber die eine kanonische
 *     Baustellenstückliste `stuecklistePositionen()` FRISCH gerechnet (Wandelement + Eingaben +
 *     wirksamer Projektkatalog). Hier wird nichts nachgerechnet, nichts gespeichert und kein
 *     zweites Mengenmodell aufgemacht — die Datei faltet ausschliesslich die Positionen, die der
 *     bestehende Pfad liefert.
 *
 * ZUSAMMENFÜHRUNG. Zwei Positionen werden nur dann zu einer Zeile, wenn sie in JEDEM Merkmal
 * uebereinstimmen, das die Zeile fachlich ausmacht: Stücklistenschluessel, Einheit, reale
 * Stückart, Fertigmaß und die aufgeloeste Produkt-/Preiszuordnung (Produkt-Id, Status, EP).
 * Sonderzuschnitte verschiedener Fertigmaße bleiben damit zwingend getrennt, und eine Wand ohne
 * eindeutige Preiszuordnung zieht nie eine bepreiste Zeile mit sich.
 *
 * RÜCKVERFOLGBARKEIT. Die vorhandenen Einbauteil-IDs des Rechenkerns (`GS-k…`) sind WANDLOKAL —
 * ueber mehrere Waende hinweg wiederholen sie sich zwangslaeufig. Eindeutig ist deshalb das
 * qualifizierte Paar (stabile Wand-Id, vorhandene Einbauteil-Id); genau dieses Paar fuehrt jede
 * Zeile in `ids`, die Einzelherkunft steht daneben in `herkunft`. Es wird KEINE neue oder globale
 * Einzelteil-Id erfunden, und wo der Rechenkern keine Id kennt (Steine, Muttern, Bleche,
 * Dichtstreifen), bleibt die Liste leer.
 *
 * MENGENFASSUNG ([P-20], #81). Die Aggregation entsteht wahlweise aus den BERECHNETEN Mengen
 * (Default) oder aus den WIRKSAMEN, also den in Modul 4 wandbezogen uebersteuerten. Gerechnet
 * wird das nicht hier, sondern in `wirksameMengen()` (sembla-export.js) — je Wand einmal, mit
 * genau der Uebersteuerung DIESER Wand. Diese Datei faltet nur, was von dort kommt, und fuehrt
 * die berechnete Menge je Zeile daneben mit; ein zweiter Mengenpfad entstuende sonst genau hier.
 * Nicht zuordenbare und unzulaessig gespeicherte Eintraege werden MIT WANDBEZUG benannt und nie
 * angewandt; sie stehen bewusst in `mengen` und nicht in `luecken` — `luecken`/`vollstaendig`
 * sagen etwas ueber FEHLENDE WAENDE, und eine unpassende Uebersteuerung laesst keine Wand fehlen.
 *
 * LÜCKEN. Fehlende, verwaiste oder nicht ableitbare Wandelemente und uneinheitliche Waehrungen
 * werden mit Projektpfad und Ursache gemeldet ([L-4]); die Ausgabe ist dann sichtbar
 * unvollstaendig. Es entsteht dabei nie eine Nullmenge, nie ein Ersatzpreis und nie eine
 * Summe ueber verschiedene Waehrungen.
 */
import { findeGebaeude, findeGeschoss, findeWand, normMappe } from "./sembla-projektmappe.js";
import { normFassung, stuecklistePositionen, stuecklisteSumme, wirksameMengen } from "./sembla-export.js";

/** Die vier waehlbaren Ebenen — mehr gibt es nicht, und geraten wird keine. */
export const EBENEN = /** @type {ReadonlyArray<'wand'|'geschoss'|'gebaeude'|'projekt'>} */ ([
  "wand", "geschoss", "gebaeude", "projekt",
]);

/** Anzeigename der Ebene. */
export const EBENE_LABEL = { wand: "Wand", geschoss: "Geschoss", gebaeude: "Gebäude", projekt: "Projekt" };

/**
 * Eindeutige Bezeichnung des Blattes ([P-19]-Sprachgebrauch): auf Wandebene bleibt es die
 * bestehende Baustellenstückliste, darueber ist es ausdruecklich eine Gesamtstückliste.
 * @param {string} ebene
 */
export function ebeneTitel(ebene) {
  return ebene === "wand" ? "Baustellenstückliste Wand" : "Gesamtstückliste " + (EBENE_LABEL[ebene] || "");
}

/** Projektpfad als Text — für Lueckenmeldungen und den Blattkopf. */
export function pfadText(bezug) {
  const b = bezug || {};
  return [b.projekt, b.gebaeude, b.geschoss, b.wand].filter(Boolean).join(" › ");
}

function _leer(ebene, grund, bezug) {
  return { ebene, ok: false, grund, bezug: bezug || {}, waende: [] };
}

function _ref(gebaeude, geschoss, wand) {
  return {
    wandId: String(wand.id), name: wand.name || String(wand.id),
    gebaeudeId: gebaeude ? gebaeude.id : null, gebaeude: gebaeude ? gebaeude.name : null,
    geschossId: geschoss ? geschoss.id : null, geschoss: geschoss ? geschoss.name : null,
  };
}

/**
 * Umfang der gewaehlten Ebene aus der aktiven Projektmappe.
 *
 * Die Zeiger werden UEBERGEBEN (und nicht hier aus dem Speicher gelesen), damit die Funktion
 * rein bleibt und die Aktivierungsregeln [L-10] genau eine Heimat behalten: `storage.js`.
 *
 * @param {object|null} mappe die aktive Projektmappe (null = kein aktives Projekt)
 * @param {'wand'|'geschoss'|'gebaeude'|'projekt'} ebene
 * @param {{wandId?:string|null, wandName?:string|null, geschossId?:string|null, gebaeudeId?:string|null}} [zeiger]
 * @returns {{ebene:string, ok:boolean, grund:string|null,
 *   bezug:{projekt?:string|null,gebaeude?:string|null,geschoss?:string|null,wand?:string|null},
 *   waende:Array<{wandId:string,name:string,gebaeudeId:string|null,gebaeude:string|null,
 *                 geschossId:string|null,geschoss:string|null}>}}
 */
export function umfang(mappe, ebene, zeiger = {}) {
  const e = EBENEN.includes(ebene) ? ebene : null;
  if (!e) return _leer(String(ebene), `Unbekannte Ebene „${ebene}“.`, {});
  const m = mappe ? normMappe(mappe) : null;
  const projektName = m ? m.projekt.name : null;

  if (e === "wand") {
    // Die Wandebene ist der bestehende kanonische Wandpfad: sie braucht keine Mappe. Eine
    // unverortete Wand ([L-4]) bleibt damit genauso auswertbar wie eine eingetragene.
    const id = zeiger.wandId ? String(zeiger.wandId) : null;
    if (!id) return _leer(e, "Keine aktive Wand — in Modul 0 eine Wand aktiv setzen.", { projekt: projektName });
    const t = m ? findeWand(m, id) : null;
    const bezug = {
      projekt: t ? projektName : null,
      gebaeude: t ? t.gebaeude.name : null, geschoss: t ? t.geschoss.name : null,
      wand: t ? t.wand.name : (zeiger.wandName || id),
    };
    const wand = t ? t.wand : { id, name: zeiger.wandName || id };
    return { ebene: e, ok: true, grund: null, bezug, waende: [_ref(t && t.gebaeude, t && t.geschoss, wand)] };
  }

  if (!m) {
    return _leer(e, "Kein aktives Projekt — in Modul 0 ein Projekt aktiv setzen ([L-10]).", {});
  }

  if (e === "projekt") {
    const waende = [];
    for (const g of m.gebaeude) for (const gs of g.geschosse) for (const w of gs.waende) waende.push(_ref(g, gs, w));
    return { ebene: e, ok: true, grund: null, bezug: { projekt: projektName }, waende };
  }

  if (e === "gebaeude") {
    const id = zeiger.gebaeudeId ? String(zeiger.gebaeudeId) : null;
    if (!id) return _leer(e, "Kein aktives Gebäude — in Modul 0 ein Geschoss des Gebäudes aktiv setzen ([L-10]).", { projekt: projektName });
    const geb = findeGebaeude(m, id);
    if (!geb) return _leer(e, `Das aktive Gebäude gehört nicht zum Projekt „${projektName}“ — erst dessen Projekt aktiv setzen ([L-10]).`, { projekt: projektName });
    const waende = [];
    for (const gs of geb.geschosse) for (const w of gs.waende) waende.push(_ref(geb, gs, w));
    return { ebene: e, ok: true, grund: null, bezug: { projekt: projektName, gebaeude: geb.name }, waende };
  }

  // Geschoss
  const id = zeiger.geschossId ? String(zeiger.geschossId) : null;
  if (!id) return _leer(e, "Kein aktives Geschoss — in Modul 0 ein Geschoss aktiv setzen ([L-10]).", { projekt: projektName });
  const t = findeGeschoss(m, id);
  if (!t) return _leer(e, `Das aktive Geschoss gehört nicht zum Projekt „${projektName}“ — erst dessen Projekt aktiv setzen ([L-10]).`, { projekt: projektName });
  const waende = t.geschoss.waende.map((w) => _ref(t.gebaeude, t.geschoss, w));
  return {
    ebene: e, ok: true, grund: null,
    bezug: { projekt: projektName, gebaeude: t.gebaeude.name, geschoss: t.geschoss.name },
    waende,
  };
}

/** Zusammenfuehrungsschluessel einer Position ([P-19]/[P-14]) — jedes Merkmal traegt die Zeile. */
function _faltSchluessel(p) {
  return [
    p.key, p.unit, p.art == null ? "" : p.art,
    p.fertigmass_mm == null ? "" : p.fertigmass_mm,
    p.produktId == null ? "" : p.produktId,
    p.status, p.ep == null ? "" : p.ep,
  ].join("");
}

/** Summierte Menge — bei mehreren Waenden auf 6 Nachkommastellen geglaettet (Meterware). */
function _summeMenge(werte) {
  const s = werte.reduce((a, v) => a + v, 0);
  return Number.isInteger(s) ? s : Math.round(s * 1e6) / 1e6;
}

/**
 * Vollstaendige Ableitung der gewaehlten Ebene.
 *
 * @param {ReturnType<typeof umfang>} umf
 * @param {{holeElement?:(id:string)=>any, holeEingaben?:(id:string)=>any, katalog?:object|null}} [leser]
 * @param {{fassung?:string}} [opts] Mengenfassung nach [P-20]: `'berechnet'` (Default) oder
 *   `'angepasst'`. Ohne ausdrueckliche Wahl bleibt die Ableitung bit-genau die bisherige.
 * @returns {{ebene:string, titel:string, ebene_label:string, bezug:object, pfad:string,
 *   waende:Array<object>, quellen:Array<object>, positionen:Array<object>, luecken:Array<object>,
 *   vollstaendig:boolean, waehrung:string, waehrungen:string[], waehrungKonflikt:boolean,
 *   summe:{summe:number,bepreist:number,bepreisbar:number,vollstaendig:boolean,offen:number},
 *   betragMoeglich:boolean, katalog:object|null, fassung:string,
 *   mengen:{fassung:string, anzahl:number, gespeichert:number,
 *     fremd:Array<{wandId:string,wand:string,pfad:string,kennung:string}>,
 *     ungueltig:Array<{wandId:string,wand:string,pfad:string,kennung:string,label:string,grund:string}>}}}
 */
export function gesamtDaten(umf, leser = {}, opts = {}) {
  const holeElement = leser.holeElement || (() => null);
  const holeEingaben = leser.holeEingaben || (() => ({}));
  const katalog = leser.katalog || null;
  const fassung = normFassung(opts.fassung);
  const angepasst = fassung === "angepasst";
  const luecken = [], quellen = [];
  // Mengenstand ueber alle Waende ([P-20]) — je Wand aus IHRER Uebersteuerung, nie vermischt.
  const mengen = { fassung, anzahl: 0, gespeichert: 0, fremd: [], ungueltig: [] };

  if (!umf.ok) luecken.push({ art: "ebene", wandId: null, wand: null, pfad: pfadText(umf.bezug), grund: umf.grund });

  for (const ref of umf.waende) {
    const pfad = pfadText({ ...umf.bezug, gebaeude: ref.gebaeude || umf.bezug.gebaeude, geschoss: ref.geschoss || umf.bezug.geschoss, wand: ref.name });
    let el = null;
    try { el = holeElement(ref.wandId); } catch { el = null; }
    if (!el) {
      luecken.push({ art: "wand_fehlt", wandId: ref.wandId, wand: ref.name, pfad,
        grund: "Wandelement nicht im Wandspeicher — verwaister Eintrag ([L-4])." });
      continue;
    }
    const w = el.wandelement;
    if (!w || !w.length_mm) {
      luecken.push({ art: "kein_wandelement", wandId: ref.wandId, wand: ref.name, pfad,
        grund: "Eintrag ohne auswertbares Wandelement — in Modul 1 planen." });
      continue;
    }
    let eingaben = {};
    try { eingaben = holeEingaben(ref.wandId) || {}; } catch { eingaben = {}; }
    let positionen;
    try {
      positionen = stuecklistePositionen(w, eingaben, katalog);
    } catch (err) {
      luecken.push({ art: "nicht_ableitbar", wandId: ref.wandId, wand: ref.name, pfad,
        grund: "Stückliste nicht ableitbar: " + ((err && err.message) || String(err)) });
      continue;
    }
    // Wirksame Menge dieser Wand ([P-20]) — DIESELBE Funktion, aus der auch die
    // Wanddatei entsteht. Hier wird nichts nachgerechnet und nichts geprueft.
    const wm = wirksameMengen(positionen, (eingaben.kosten || {}).mengen, { anwenden: angepasst });
    mengen.anzahl += wm.anzahl;
    mengen.gespeichert += wm.gespeichert;
    const name = ref.name || el.name || ref.wandId;
    for (const k of wm.fremd) mengen.fremd.push({ wandId: ref.wandId, wand: name, pfad, kennung: k });
    for (const u of wm.ungueltig) {
      mengen.ungueltig.push({ wandId: ref.wandId, wand: name, pfad, kennung: u.kennung,
        label: u.label, grund: u.grund });
    }
    quellen.push({
      ...ref, name, pfad, positionen: wm.positionen,
      waehrung: ((eingaben.kosten || {}).waehrung || "EUR"),
    });
  }

  // Waehrung: sie haengt am einzelnen Wandprojekt und kann ueber mehrere Waende auseinanderlaufen.
  // Verschiedene Waehrungen werden BENANNT und nie umgerechnet; ein Gesamtbetrag entsteht dann
  // nicht (eine Summe ueber zwei Waehrungen waere eine erfundene Zahl).
  const waehrungen = [...new Set(quellen.map((q) => q.waehrung))];
  const waehrungKonflikt = waehrungen.length > 1;
  if (waehrungKonflikt) {
    luecken.push({ art: "waehrung_uneinheitlich", wandId: null, wand: null, pfad: pfadText(umf.bezug),
      grund: "Uneinheitliche Währung (" + waehrungen.join(", ") + ") — "
        + quellen.map((q) => q.name + ": " + q.waehrung).join(", ") + "; kein Gesamtbetrag." });
  }

  // Falten. Reihenfolge: erstes Auftreten in der Wandreihenfolge der Mappe — deterministisch.
  const map = new Map();
  for (const q of quellen) {
    for (const p of q.positionen) {
      const k = _faltSchluessel(p);
      let ziel = map.get(k);
      if (!ziel) {
        ziel = {
          key: p.key, label: p.label, unit: p.unit, menge: 0, menge_berechnet: 0, manuell: false,
          art: p.art, art_label: p.art_label, art_symbol: p.art_symbol,
          fertigmass_mm: p.fertigmass_mm,
          ep: p.ep, gp: null, status: p.status, statusText: p.statusText,
          bepreisbar: p.bepreisbar, produktId: p.produktId, preisbasis: p.preisbasis,
          herkunft: [], ids: [], wandIds: [],
        };
        map.set(k, ziel);
      }
      // Beide Werte reisen bis in die Zeile mit ([P-20]): die wirksame Menge und die
      // berechnete daneben — auch je Wand, damit die Aggregation aufloesbar bleibt.
      const berechnet = p.__berechnet == null ? p.menge : p.__berechnet;
      if (p.__ueber != null) ziel.manuell = true;
      ziel.herkunft.push({
        wandId: q.wandId, wand: q.name, gebaeudeId: q.gebaeudeId, gebaeude: q.gebaeude,
        geschossId: q.geschossId, geschoss: q.geschoss, pfad: q.pfad,
        menge: p.menge, menge_berechnet: berechnet, manuell: p.__ueber != null,
        ids: (p.ids || []).slice(),
      });
      // Qualifiziertes Paar (stabile Wand-Id, vorhandene Einbauteil-Id) — die Einzel-Id des
      // Rechenkerns ist wandlokal und allein nicht eindeutig. Erfunden wird keine.
      for (const id of (p.ids || [])) ziel.ids.push(q.wandId + ":" + id);
      if (!ziel.wandIds.includes(q.wandId)) ziel.wandIds.push(q.wandId);
    }
  }
  const positionen = [...map.values()].map((p) => {
    p.menge = _summeMenge(p.herkunft.map((h) => h.menge));
    p.menge_berechnet = _summeMenge(p.herkunft.map((h) => h.menge_berechnet));
    // Nur die Menge ist gegebenenfalls eine andere — der Einzelpreis bleibt der
    // aufgeloeste ([P-14]), die Preisaufloesung wird nicht angefasst.
    p.gp = p.ep == null ? null : p.menge * p.ep;
    return p;
  });

  const summe = stuecklisteSumme(positionen);
  const ebene = umf.ebene;
  return {
    ebene, ebene_label: EBENE_LABEL[ebene] || ebene, titel: ebeneTitel(ebene),
    bezug: umf.bezug, pfad: pfadText(umf.bezug),
    waende: umf.waende.slice(), quellen, positionen, luecken,
    vollstaendig: luecken.length === 0 && umf.ok,
    waehrung: waehrungen.length === 1 ? waehrungen[0] : (waehrungen[0] || "EUR"),
    waehrungen, waehrungKonflikt,
    summe, betragMoeglich: summe.bepreist > 0 && !waehrungKonflikt,
    katalog, fassung, mengen,
  };
}

/**
 * Stand der Vollstaendigkeit als EIN Satz — identisch in Oberflaeche, Druck und Datei.
 * Eine unvollstaendige Ausgabe sagt das ausdruecklich und nennt die Zahl der Luecken.
 */
export function standText(daten) {
  const n = daten.quellen.length, m = daten.waende.length;
  if (daten.vollstaendig) return `vollständig · ${n} von ${m} Wänden enthalten`;
  return `UNVOLLSTÄNDIG · ${n} von ${m} Wänden enthalten · ${daten.luecken.length} Lücke(n)`;
}

/** Herkunftstext einer Zeile: je Wand Name und Teilmenge — die Aggregation bleibt aufloesbar. */
export function herkunftText(p, nachkomma = 0) {
  return p.herkunft
    .map((h) => h.wand + ": " + h.menge.toLocaleString("de-DE", { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma }))
    .join(" · ");
}

/** Sicherer Dateirumpf der Ebene (ohne Endung) — Ebene und Bezug stehen im Namen. */
export function dateiRumpf(daten) {
  const b = daten.bezug || {};
  const bezug = daten.ebene === "wand" ? b.wand : (daten.ebene === "geschoss" ? b.geschoss : (daten.ebene === "gebaeude" ? b.gebaeude : b.projekt));
  const rumpf = (daten.ebene === "wand" ? "Baustellenstueckliste_Wand" : "Gesamtstueckliste_" + _ascii(EBENE_LABEL[daten.ebene]))
    + "_" + _ascii(bezug || "ohne_Bezug");
  return rumpf;
}

/** Umlautfreier, dateisicherer Text (dieselbe Absicht wie `storage.sicherName`). */
function _ascii(s) {
  return String(s == null ? "" : s)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "ohne_Bezug";
}
