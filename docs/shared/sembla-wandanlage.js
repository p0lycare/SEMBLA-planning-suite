// @ts-check
/**
 * SEMBLA — Neuanlage einer Wand: der EINE Weg von der Produktwahl zum gespeicherten
 * Wandelement (Issues #15/#62).
 *
 * Das Problem, das diese Datei loest: beide Anlageorte (Modul 0 und der Layout-Editor)
 * haben das Wandelement mit `buildWall()` gerechnet und gespeichert, BEVOR die
 * Verwendungsrollen aus dem Katalog vorbelegt waren. Der Core kannte damit keine
 * Standardlaenge, setzte seinen Altstand-Fallback (1100 mm) und schrieb ihn als
 * `rod_mm`, `prestress.rod_lengths_mm` und als reale `segments[].stuecke` fest. Zeichnung
 * (Modul 7) und Baustellenstueckliste (Modul 4) lasen danach korrekt ein bereits falsches
 * JSON; erst eine Aenderung in Modul 1 rechnete es neu.
 *
 * Die Reihenfolge ist deshalb der Kern dieser Datei:
 *   1. Produktrollen aus dem Katalog bestimmen ([P-18]) — noch ohne Speicher,
 *   2. daraus die Vorspann-Vorgaben bilden ([Z-1]/[Z-6]),
 *   3. das Wandelement damit rechnen,
 *   4. Wandelement UND Rollenauswahl in GENAU EINEM `store.speichere()` festschreiben.
 * Es gibt damit keinen Zwischenstand, der je mit dem Altstand-Fallback im Speicher stand
 * oder gemeldet wurde — auch nicht kurzzeitig.
 *
 * Fachlich neu ist nichts: [Z-1] (Standardlaengen nur aus dem Katalog), [Z-2] (Kombination)
 * und [Z-6] (Reststueck am oberen Wandabschluss) gelten unveraendert; die Abbildung
 * Auswahl -> Produktmasse ist dieselbe wie in Modul 1 (`KAT.produktSpezifikation`).
 *
 * Rein/DOM-frei. Der Speicher wird als Abhaengigkeit HEREINGEREICHT (`store`), damit diese
 * Datei nicht an `localStorage` haengt und die Aufruffolge in Tests pruefbar bleibt.
 */

import { buildWall, Opening, ROD_OVERHANG } from "./sembla-core.js";
import { produktSpezifikation, produktrollenVorschlag, produkteZuRolle, rollenVonModul, rolle } from "./sembla-katalog.js";

/** Verwendungsrollen gehoeren Modul 1 (`planung`) oder Modul 2 (`aufbau`) — sonst nichts. */
const TEIL = { 1: "planung", 2: "aufbau" };

/**
 * Standardauswahl einer NEUEN Wand aus dem Katalog ([P-18]) — als fertiger
 * `eingaben`-Patch, noch ohne jeden Schreibvorgang.
 *
 * Weil die Wand neu ist, sind alle Rollen leer: es kann keine Nutzerentscheidung
 * ueberschrieben werden, und der Patch ist damit dasselbe Ergebnis, das
 * `store.vorbelegeProduktrollen()` an einem frisch angelegten Element liefert — nur eben
 * VOR dem Speichern verfuegbar.
 *
 * @param {any} katalog aktiver Bauteilkatalog oder null/undefined ([L-12])
 * @returns {{patch:any, gesetzt:Record<string,string[]>, offen:string[]}}
 */
export function produktrollenPatch(katalog) {
  const gesetzt = {}, offen = [];
  /** @type {any} */ const patch = {};
  if (!katalog) return { patch, gesetzt, offen };
  const vorschlag = produktrollenVorschlag(katalog);
  const quelle = { name: katalog.name, version: katalog.version };
  for (const r of [...rollenVonModul(1), ...rollenVonModul(2)]) {
    const ids = vorschlag[r.id] || [];
    if (!ids.length) { offen.push(r.id); continue; }
    const teil = TEIL[r.modul];
    if (!patch[teil]) patch[teil] = { produkte: { quelle, rollen: {} } };
    patch[teil].produkte.rollen[r.id] = ids.slice();
    gesetzt[r.id] = ids.slice();
  }
  return { patch, gesetzt, offen };
}

/**
 * Vorspann-Vorgaben aus der wandbezogenen Produktwahl ([Z-1]/[Z-6]).
 *
 * `rod_lengths_mm` wird IMMER gesetzt — auch leer. Genau das ist die Aussage „keine
 * Standardlaenge gewaehlt"; der Core erfindet dann keine (kein 1100-mm-Fallback) und meldet
 * den offenen Zuschnitt sichtbar. Ohne Katalog gilt dasselbe: gemeldet, nicht geraten.
 *
 * @param {any} eingaben `eingaben` der Wand (Quelle von `planung.produkte`, [P-13])
 * @param {any} katalog aktiver Bauteilkatalog oder null/undefined ([L-12])
 * @param {number} [ueberstandMm] Ueberstand des Reststuecks ueber die Wandoberkante ([Z-6])
 * @returns {{rod_lengths_mm:number[],rod_rest_mm:number,rod_overhang_mm:number,
 *            quelle:"katalog"|"keine_auswahl"|"kein_katalog"}}
 */
export function vorspannVorgaben(eingaben, katalog, ueberstandMm = ROD_OVERHANG) {
  const ue = (ueberstandMm != null && +ueberstandMm >= 0) ? +ueberstandMm : ROD_OVERHANG;
  if (!katalog) return { rod_lengths_mm: [], rod_rest_mm: 0, rod_overhang_mm: ue, quelle: "kein_katalog" };
  const spez = produktSpezifikation(eingaben || {}, katalog);
  const laengen = spez.rod.laengen_mm.slice();
  // [Z-6]: genau EIN Reststueckprodukt ergibt eine Laenge; mehrere sind ein Konflikt und
  // lassen sie bewusst offen (`rest_mm === null`) — es wird keines bevorzugt.
  const rest = (spez.rod.rest_mm != null) ? spez.rod.rest_mm : 0;
  return { rod_lengths_mm: laengen, rod_rest_mm: rest, rod_overhang_mm: ue,
           quelle: laengen.length ? "katalog" : "keine_auswahl" };
}

/**
 * Das Wandelement einer Neuanlage rechnen — ohne jeden Speicherzugriff.
 * Getrennt aufrufbar, damit die Rechnung pruefbar ist, ohne dass irgendetwas geschrieben wird.
 *
 * @param {{name:string,laenge_mm:number,hoehe_mm:number,wandtyp:string}} v
 * @param {any} eingaben Rollenauswahl dieser Wand (Ergebnis von `produktrollenPatch`)
 * @param {any} katalog aktiver Bauteilkatalog oder null
 * @returns {{wandelement:any, vorgaben:ReturnType<typeof vorspannVorgaben>}}
 */
export function wandelementNeu(v, eingaben, katalog) {
  const vorgaben = vorspannVorgaben(eingaben, katalog);
  const we = buildWall(v.name, v.laenge_mm, v.hoehe_mm, [], null, vorgaben);
  // Der Wandtyp haengt nicht am Core und wird ausschliesslich bei der Anlage gewaehlt.
  we.wandtyp = v.wandtyp;
  return { wandelement: we, vorgaben };
}

/**
 * Neue Wand anlegen — der gemeinsame Pfad beider Anlageorte (Modul 0 und Layout-Editor).
 *
 * Geschrieben wird GENAU EINMAL, und zwar der fertige Stand: Wandelement samt
 * katalogbasiertem Zuschnitt und die Rollenauswahl in einem Zug. Ein Zwischenstand mit dem
 * Altstand-Fallback des Cores entsteht dabei nicht — weder im Speicher noch in einer Meldung.
 *
 * Wer einen Katalog nachladen will (Modul 0 tut das), muss das VOR diesem Aufruf tun; sonst
 * entstuende die Wand ohne Produktbezug.
 *
 * @param {any} store Speicherschicht (`storage.js`)
 * @param {{name:string,laenge_mm:number,hoehe_mm:number,wandtyp?:string}} v
 * @returns {{id:string, wandelement:any, gesetzt:Record<string,string[]>, offen:string[],
 *            vorgaben:ReturnType<typeof vorspannVorgaben>}}
 */
export function legeWandAn(store, v) {
  const katalog = store.holeKatalog();
  const rollen = produktrollenPatch(katalog);
  const { wandelement, vorgaben } = wandelementNeu(
    { name: v.name, laenge_mm: v.laenge_mm, hoehe_mm: v.hoehe_mm,
      wandtyp: store.normWandtyp(v.wandtyp) }, rollen.patch, katalog);
  // Der EINE Schreibvorgang: Wandelement und Rollenauswahl zusammen ([P-13]/[P-18]).
  const id = store.speichere(v.name, wandelement, undefined, rollen.patch);
  return { id, wandelement, gesetzt: rollen.gesetzt, offen: rollen.offen, vorgaben };
}

/**
 * Kurzer, nutzersichtbarer Zustandstext zum Zuschnitt der neu angelegten Wand.
 * Er benennt, was gilt — und erfindet nie eine Laenge ([Z-1]/[Z-6]).
 * @param {ReturnType<typeof vorspannVorgaben>|null} vorgaben
 */
export function vorspannText(vorgaben) {
  if (!vorgaben) return "";
  if (vorgaben.quelle === "kein_katalog")
    return "ohne Bauteilkatalog kein Gewindestangen-Zuschnitt — er bleibt offen ([Z-1])";
  if (!vorgaben.rod_lengths_mm.length)
    return "keine Gewindestangen-Standardlänge gewählt — der Zuschnitt bleibt offen ([Z-1])";
  const l = vorgaben.rod_lengths_mm.map((x) => x + " mm").join(" · ");
  return "Gewindestangen aus dem Katalog: " + l
    + (vorgaben.rod_rest_mm ? ` · Reststück ${vorgaben.rod_rest_mm} mm ([Z-6])`
                            : " · kein Reststück gewählt ([Z-6])");
}

// ---------------------------------------------------------------------------
//  Bestehende Wand auf den aktuellen Stand rechnen (Issue #120)
// ---------------------------------------------------------------------------
/*
 * Das Problem, das dieser Abschnitt loest: die realen Bauteilmasse einer Wand entstehen
 * erst, wenn ihr Wandelement ueber den Engine-Pfad NEU GERECHNET wird — heute nur in
 * Modul 1 („Auslegen"/jede Aenderung) und im Sammel-Editor des Geschosseditors. Eine
 * reine Ausgabe wie Modul 7 las bis dahin ein Wandelement, dessen Zerlegung so alt ist
 * wie der letzte Schreibvorgang; nach einem Sammel-Edit stand dort der neue Stand, nach
 * einem Altstand der Fallback des Cores.
 *
 * `wandelementAktualisiert()` ist der gemeinsame LESENDE Weg dorthin: aus dem
 * gespeicherten Wandelement, der Produktauswahl der Wand ([P-13]) und dem zugeordneten
 * Katalog ([L-12]) entsteht ein frisch gerechnetes Wandelement — OHNE jeden
 * Speicherzugriff und ohne jeden Schreibvorgang. Wer es zeichnet, zeichnet damit den
 * Stand, den Modul 1 mit „Auslegen" liefern wuerde; gespeichert bleibt, was gespeichert
 * war ([P-1]: Modul 1 bleibt einziger Schreibweg der Wandplanung).
 *
 * Die fruehere GRENZE dieses Pakets (#120) — nur die Gewindestangen-Eingaenge wurden neu
 * gebildet, alles Uebrige aus dem gespeicherten Element durchgereicht — ist mit #130
 * GESCHLOSSEN (der dort benannte „Vorschlag C"): `vorspannEingaenge()` liegt jetzt als
 * gemeinsamer Baustein in dieser Datei (s. o.), und die Neurechnung legt den VOLLEN Satz
 * aus der aktuellen Produktauswahl ueber den gespeicherten `prestress`-Block — Vorratssatz
 * der Bodenblechlaengen ([A-10]), Einbaulagen (#92) und die Ausweisungsmasse aus #97.
 * Erst damit wirkt ein Fassungswechsel des Katalogs ([L-12]) auf die Darstellung ALLER
 * lesenden Ausgaben, ohne dass jede Wand einzeln neu ausgelegt werden muss; eine Wand aus
 * der Zeit vor #97 bekommt ihre Masse hier nach. Ein Mass, das sich aus der Auswahl nicht
 * eindeutig ergibt, laesst sein Feld weg — dann gilt der gespeicherte Wert, erfunden wird
 * nichts ([P-9]).
 */

// --- Vorspann-Eingänge aus der Produktauswahl (#111/#117, hierher mit #130) ----------
// Die Verwendungsstellen, deren Auswahl den Vorspann-Eingangssatz einer Wand bildet.
// RECHENWIRKSAM sind: Standardlaengen und Reststueck der Gewindestange ([Z-1]/[Z-6]), der
// Vorratssatz der Bodenblechlaengen ([A-10]) und die beiden Einbaulagen des Spannsystems
// (#92). Reine AUSWEISUNGSMASSE ohne Rechenbeitrag sind daneben die Blechdicken ([A-1])
// sowie die Schluesselweite der Kopplungsmutter, Einbauhoehe samt Schluesselweite von
// Spannmutter und Einlegeblech-Mutter, die Breite der Spannplatte und die
// Schluesselweite der Sechskantschraube Fuss (#97) — sie stehen in derselben Tabelle,
// weil sie dieselbe Bahn nehmen: aus der Produktauswahl der Wand ins Wandelement, damit
// die Ausgaben sie zeichnen koennen, ohne den Katalog zu lesen ([D-1]).
//
// Bis #130 lag diese Tabelle im Geschosseditor (Sammel-Editor, #111/#117) und der
// Read-only-Frischpfad unten kannte sie nicht — der dort dokumentierte „Vorschlag C zu
// #120". Seit #130 liegt sie HIER als der eine gemeinsame Baustein: der Sammel-Editor
// delegiert, und `wandelementAktualisiert()` legt denselben Satz ueber den gespeicherten
// `prestress`-Block. ⚠ Nachziehpunkt [P-6]: die `einbauMass()`-Familie in Modul 1
// (`wandplanung.html`) bildet dieselben Werte noch einmal fuer ihre Statusmeldungen
// (keine_auswahl/mehrdeutig je Rolle); die Zahlen sind satzgleich, die Zusammenfuehrung
// bleibt offen.
//
// Jede Stelle laesst ihr Feld WEG, wenn die Auswahl keinen eindeutigen Wert hergibt —
// dann bleibt der gespeicherte Eingang stehen, erfunden wird nie einer ([P-9]).
/** @type {Record<string, (eing:any, kat:any, topConn?:string)=>Record<string, any>>} */
export const ROLLE_RECHNUNG = {
  rod_std: (eing, kat) => {
    // #117 Eine LEERE Auswahl setzt das Feld NICHT: ein leeres Feld wuerde einen
    // gespeicherten Satz LOESCHEN statt ihn stehen zu lassen ([P-9]) — Modul 1 laesst es
    // aus demselben Grund weg (`vorgaben()`: `rodL.length ? … : {}`), und der Core nutzt
    // dann seinen dokumentierten Altstand-Fallback.
    const l = vorspannVorgaben(eing, kat).rod_lengths_mm;
    return l.length ? { rod_lengths_mm: l.slice() } : {};
  },
  // [Z-6] Das Reststueck folgt Modul 1 SATZWEISE: liegt kein eindeutiges Reststueckprodukt
  // vor, ist `0` die kanonische Aussage „kein Reststueck gewaehlt" (`vorspannVorgaben`) und
  // keine erfundene Laenge — der offene obere Abschluss steht sichtbar in
  // `validation.zuschnitt_konflikte`.
  rod_rest: (eing, kat) => ({ rod_rest_mm: vorspannVorgaben(eing, kat).rod_rest_mm }),
  blech_boden: (eing, kat) => {
    const l = rollenMasse(eing, kat, "blech_boden");
    const d = rollenMass(eing, kat, "blech_boden", "dicke_mm");
    // [A-1] Die Blechdicke ist ein reines AUSWEISUNGSMASS (keine Rechnung, s. [A-19]) und
    // reist mit derselben Rolle mit; fehlt sie, entsteht das Feld nicht und die Ausgaben
    // benennen die Luecke, statt eine Zahl zu erfinden.
    return { ...(l.length ? { blech_lengths_mm: l } : {}), ...(d != null ? { blech_dicke_mm: d } : {}) };
  },
  blech_kopf: (eing, kat, topConn) => {
    if (topConn !== "blech") return {};                 // ohne Kopfblech gibt es keine Dicke
    const d = rollenMass(eing, kat, "blech_kopf", "dicke_mm");
    return d != null ? { kopfblech_dicke_mm: d } : {};
  },
  kupplung: (eing, kat) => {
    const h = rollenMass(eing, kat, "kupplung", "hoehe_mm");
    // #97 Die Schluesselweite reist mit DERSELBEN Rolle mit — ein reines AUSWEISUNGSMASS,
    // das die Ausgaben brauchen, um die Mutter masstaeblich zu zeichnen ([D-1]).
    const sw = rollenMass(eing, kat, "kupplung", "sw_mm");
    return { ...(h != null ? { rod_fuss_offset_mm: h / 2 } : {}),
             ...(sw != null ? { kupplung_sw_mm: sw } : {}) };
  },
  // #97 Die beiden Masse der Spannplatte tragen VERSCHIEDENE Vorbehalte, deshalb steht der
  // Ausstieg an der DICKE und nicht an der Rolle: die Dicke ist ein Rechenwert am OBEREN
  // Anker (der Core wendet `rod_kopf_zuschlag_mm` nur bei `ankerOben === "spannplatte"` an)
  // und entfaellt bei Kopfblech; die Breite ist ein reines Bauteilmass und entsteht auch
  // dann — Spannplatten treten nach `ankerUnten`/`ankerOben` auch an Bruestung und Sturz
  // auf, und Modul 1 prueft fuer die Breite ebenfalls keinen oberen Anschluss.
  spannplatte: (eing, kat, topConn) => {
    const d = topConn === "blech"                       // bei Kopfblech gibt es keine Platte
      ? null : rollenMass(eing, kat, "spannplatte", "dicke_mm");
    const b = rollenMass(eing, kat, "spannplatte", "breite_mm");
    return { ...(d != null ? { rod_kopf_zuschlag_mm: d } : {}),
             ...(b != null ? { spannplatte_b_mm: b } : {}) };
  },
  // #97 Einbauhoehe und Schluesselweite der SPANNMUTTER — reine Ausweisungsmasse, beide
  // FUER SICH: ein Produkt mit gepflegter Hoehe, aber ohne Schluesselweite liefert genau
  // ein Feld. Bewusst OHNE `topConn`-Bedingung: Modul 1 prueft hier den oberen Anschluss
  // nicht, und eine hier erfundene Bedingung ergaebe fuer dieselbe Auswahl eine andere Zahl.
  spannmutter: (eing, kat) => {
    const h = rollenMass(eing, kat, "spannmutter", "hoehe_mm");
    const sw = rollenMass(eing, kat, "spannmutter", "sw_mm");
    return { ...(h != null ? { spannmutter_h_mm: h } : {}),
             ...(sw != null ? { spannmutter_sw_mm: sw } : {}) };
  },
  // #97 Einbauhoehe und Schluesselweite der MUTTER DES EINLEGEBLECHS ([A-16]) — dasselbe
  // Muster und derselbe Baustein; abgeleitet wird nichts aus Gewinde oder Norm.
  zp_mutter: (eing, kat) => {
    const h = rollenMass(eing, kat, "zp_mutter", "hoehe_mm");
    const sw = rollenMass(eing, kat, "zp_mutter", "sw_mm");
    return { ...(h != null ? { zp_mutter_h_mm: h } : {}),
             ...(sw != null ? { zp_mutter_sw_mm: sw } : {}) };
  },
  // #97 Schluesselweite der SECHSKANTSCHRAUBE FUSS ([A-19]) — eine KOPFHOEHE gibt es hier
  // nicht: dafuer ist keine Norm genannt, und geraten wird sie nicht.
  senkkopf: (eing, kat) => {
    const sw = rollenMass(eing, kat, "senkkopf", "sw_mm");
    return sw != null ? { senkkopf_sw_mm: sw } : {};
  },
};

/**
 * Die abgeleiteten Vorspann-Eingaenge EINER Wand — vollstaendig aus ihrer Produktauswahl
 * (#117). Gebildet wird der Satz fuer ALLE Stellen aus `ROLLE_RECHNUNG`: genau das tut
 * `vorgaben()` in Modul 1 bei jeder Auslegung. Ein Mass, das sich aus der Auswahl nicht
 * eindeutig ergibt, laesst sein Feld WEG — dann bleibt der Eingang stehen, den das
 * gespeicherte Wandelement mitbringt, und es wird keines erfunden ([P-9]).
 *
 * Ohne wirksamen Bauteilkatalog ([L-12]) wird GAR NICHTS abgeleitet (`null`): eine
 * Ableitung aus einem fehlenden Katalog waere keine Aussage, sondern eine Loeschung.
 *
 * @param {any} eing `eingaben` der Wand
 * @param {any} kat zugeordneter Bauteilkatalog oder null
 * @param {string} [topConn] oberer Anschluss dieser Wand ('blech'|'spannplatte')
 * @returns {Record<string, any>|null}
 */
export function vorspannEingaenge(eing, kat, topConn) {
  if (!kat) return null;
  const pp = {};
  for (const fn of Object.values(ROLLE_RECHNUNG)) Object.assign(pp, fn(eing, kat, topConn));
  return pp;
}

/**
 * Ein Massfeld der gewaehlten Produkte einer Rolle: GENAU EIN Wert, sonst `null`.
 * Mehrere verschiedene Masse heissen „bleibt offen" — es wird keines bevorzugt und
 * keines gemittelt ([P-9]).
 */
function rollenMass(eing, kat, rolleId, feld) {
  if (!kat) return null;
  const auf = produkteZuRolle(eing, kat, rolleId);
  const v = [...new Set(auf.produkte.map((p) => +p[feld]).filter((n) => Number.isFinite(n) && n > 0))];
  return v.length === 1 ? v[0] : null;
}

/**
 * Der Vorratssatz der massgebenden Masse einer Rolle (Bodenblech, [A-10]). Massgebend ist
 * dasselbe Feld, nach dem `loesePreis`/`rollenStatus` die Position ihrem Produkt
 * zuordnen: das erste belegte aus `rolle(...).mass.felder` — GELESEN, nicht wiederholt.
 * Sortiert und gefiltert wird im Core (`normBlechLaengen`), hier wird nichts gerundet.
 */
function rollenMasse(eing, kat, rolleId) {
  if (!kat) return [];
  const r = rolle(rolleId), felder = (r && r.mass && r.mass.felder) || [];
  const p = produkteZuRolle(eing, kat, rolleId).produkte;
  const v = p.map((x) => felder.map((f) => +x[f]).find((n) => Number.isFinite(n) && n > 0))
             .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(v)];
}

/** Verkehrslast und Teilsicherheitsbeiwert einer Neurechnung.
 *
 * Sie sind KEIN gespeichertes Datum der Wand: Modul 1 haelt sie nur in seinen Feldern
 * `#qk`/`#gammaQ` und stellt sie beim Laden eines Elements auch nicht wieder her — es
 * rechnet nach jedem Seitenaufruf mit genau diesen Vorgaben. Jede Neurechnung benutzt
 * deshalb dieselben Werte; jeder andere waere ein erfundener Ersatz. Wertgleich zu
 * `LAST_VORGABE` in `geschossplan.html` — und hier exportiert, damit es dafuer genau
 * EINEN Wert gibt und keinen dritten inline gesetzten. */
export const LAST_VORGABE = { qk_area: 1.00, gammaQ: 1.50 };

/** Gruende, aus denen NICHT neu gerechnet wird — benannt, nie stillschweigend. */
export const STAND_GRUND = {
  // Bewusst EIN Wortlaut fuer alle drei Lagen aus `katalogStatus` (nicht zugeordnet,
  // zugeordnet aber nicht gespeichert, kein Projekt): behauptet wird nur, was in jeder
  // von ihnen zutrifft — es gibt keinen wirksamen Katalog.
  kein_katalog: "Kein wirksamer Bauteilkatalog — gezeigt wird der gespeicherte Stand. "
    + "Zuordnung im Projektplaner ([L-12]).",
  produkt_fehlt: "Ein gewähltes Produkt steht nicht im zugeordneten Bauteilkatalog — "
    + "gezeigt wird der gespeicherte Stand. Auswahl in Modul 1 reparieren ([L-12]).",
};

/**
 * Gewaehlte Produkt-Kennungen der Wand, die der Katalog nicht kennt ([P-13]).
 * Aufgeloest wird ausschliesslich ueber `produkteZuRolle` — dieselbe eine Stelle, an der
 * eine Kennung zu einem Produkt wird; eine zweite Aufloesungslogik entsteht nicht.
 *
 * @param {any} eingaben `eingaben` der Wand
 * @param {any} katalog zugeordneter Bauteilkatalog
 * @returns {Array<{rolle:string, ids:string[]}>} leer = alles aufloesbar
 */
export function fehlendeProdukte(eingaben, katalog) {
  if (!katalog) return [];
  const out = [];
  for (const r of rollenVonModul(1)) {
    const auf = produkteZuRolle(eingaben || {}, katalog, r.id);
    if (auf.fehlend.length) out.push({ rolle: r.id, ids: auf.fehlend.slice() });
  }
  return out;
}

/**
 * Ein GESPEICHERTES Wandelement auf den Stand seiner Produktauswahl rechnen (#120).
 *
 * Rein und DOM-/speicherfrei: herein kommen Wandelement, `eingaben` und Katalog, heraus
 * geht ein NEUES Wandelement — das hereingereichte wird nicht angefasst. Gerechnet wird
 * ausschliesslich ueber den vorhandenen Engine-Pfad, es entsteht keine zweite
 * Zerlegungslogik.
 *
 * Uebernommen werden aus dem gespeicherten Element: Name, Laenge, Hoehe, Oeffnungen,
 * Seiten, Staffelungen, Verzahnungsbereiche ([G-10]) und der vollstaendige
 * `prestress`-Block — und damit auch die manuellen Spannachsen ([V-9]), die
 * Zwischenspannpunkte ([A-17]), die Ausgleichspunkte ([A-24]) und der Deckenanschluss
 * ([A-27]). Die drei Merkmale ohne Core-Bezug (`wandtyp`, `abdichtung`, `brandklasse`)
 * werden nach der Rechnung unveraendert MITGEFUEHRT — ohne diese Zeilen setzte jede
 * Neurechnung eine gewaehlte Windsituation, Abdichtung oder F30 still zurueck, weil
 * `buildWall()` das Wandelement neu erzeugt.
 *
 * Der Rechenmodus folgt dem gespeicherten Element: liegt eine Vorspannkraft vor, wird sie
 * NACHGEWIESEN (`nachweisPruefen`) statt neu optimiert — eine Ausgabe darf die Auslegung
 * einer Wand nicht stillschweigend verschieben. Ohne Kraftvorgabe bleibt die Auslegung
 * (`autoAuslegung`), wie sie der Geschosseditor in derselben Lage auch faehrt.
 *
 * @param {any} wandelement gespeichertes Wandelement (Quelle der Geometrie)
 * @param {any} eingaben `eingaben` der Wand (Quelle von `planung.produkte`, [P-13])
 * @param {any} katalog zugeordneter Bauteilkatalog oder null ([L-12])
 * @param {{autoAuslegung:Function, nachweisPruefen:Function}} engine `sembla-engine.js`
 * @returns {{wandelement:any, aktualisiert:boolean, grund:string|null,
 *            fehlend:Array<{rolle:string,ids:string[]}>,
 *            vorgaben:ReturnType<typeof vorspannVorgaben>|null}}
 */
export function wandelementAktualisiert(wandelement, eingaben, katalog, engine) {
  const we = wandelement;
  const unveraendert = (grund, fehlend) =>
    ({ wandelement: we, aktualisiert: false, grund, fehlend: fehlend || [], vorgaben: null });
  if (!we) return unveraendert(null);
  // Ohne Katalog wird nichts abgeleitet: der gespeicherte Stand gilt, und der Grund steht
  // benannt daneben — es wird keine Laenge und kein Mass erfunden ([Z-1]/[P-9]).
  if (!katalog) return unveraendert("kein_katalog");
  const fehlend = fehlendeProdukte(eingaben, katalog);
  if (fehlend.length) return unveraendert("produkt_fehlt", fehlend);

  const ps = { ...(we.prestress || {}) };
  // #130: ZUERST der volle abgeleitete Eingangssatz aus der aktuellen Produktauswahl —
  // fehlende/nicht eindeutige Felder bleiben die gespeicherten ([P-9]). DANACH der
  // Gewindestangen-Block unten: er behaelt die #120-Semantik (ohne Auswahl faellt
  // `rod_lengths_mm` ganz weg -> dokumentierter Altstand-Fallback des Cores), die
  // `ROLLE_RECHNUNG.rod_std` fuer den Sammel-Editor bewusst nicht hat.
  const abgeleitet = vorspannEingaenge(eingaben, katalog,
    ps.top_connection === "blech" ? "blech" : "spannplatte");
  if (abgeleitet) Object.assign(ps, abgeleitet);
  const vorgaben = vorspannVorgaben(eingaben, katalog, ps.rod_overhang_mm);
  // Die Gewindestangen-Eingaenge werden GENAU SO gebildet wie in `vorgaben()` von Modul 1:
  // der Einzelwert `rod_mm` ist seit [Z-1] kein Eingang mehr (kein Feld, kein Default) und
  // wird deshalb nicht mitgeschleppt; der Vorratssatz reist nur mit, wenn es eine Auswahl
  // gibt. OHNE Auswahl faellt das Feld ganz weg — dann gilt der dokumentierte
  // Altstand-Fallback des Cores, derselbe, den Modul 1 in dieser Lage bekommt. Ein
  // ausdruecklich leeres Feld hiesse dagegen „ausgewertet und nichts gewaehlt" und ergaebe
  // hier eine andere Zerlegung als der Auslegungspfad von Modul 1.
  delete ps.rod_mm;
  if (vorgaben.rod_lengths_mm.length) ps.rod_lengths_mm = vorgaben.rod_lengths_mm.slice();
  else delete ps.rod_lengths_mm;
  ps.rod_rest_mm = vorgaben.rod_rest_mm;
  ps.rod_overhang_mm = vorgaben.rod_overhang_mm;

  const vorg = {
    name: we.name,
    length_mm: we.length_mm,
    height_mm: we.height_mm,
    openings: (we.openings || []).map((o) => new Opening(o.g0, o.g1, o.l0, o.l1, o.art)),
    sides: we.sides || null,
    steps: (we.steps || []).map((s) => ({ ...s })),
    interlocks: (we.interlocks || []).map((i) => ({ ...i })),
    prestress: ps,
    load: { ...LAST_VORGABE },
    // Materialkennwerte reisen im Nachweis des Elements mit; fehlen sie, gelten die
    // Vorgaben der Engine — geraten wird hier keiner.
    material: (we.verification && we.verification.material) || undefined,
  };
  const erg = (we.prestress && we.prestress.force_kN != null)
    ? engine.nachweisPruefen(vorg) : engine.autoAuslegung(vorg);
  const neu = erg.wandelement;
  neu.wandtyp = we.wandtyp;            // haengt nicht am Core ([P-1])
  neu.abdichtung = we.abdichtung;      // [A-6]/#71: Fachmerkmal der Wand
  neu.brandklasse = we.brandklasse;    // #79: reine Planungskennzeichnung
  return { wandelement: neu, aktualisiert: true, grund: null, fehlend: [], vorgaben };
}

/**
 * Ein ELEMENTLESER, der jede Wand auf den Stand ihrer Produktauswahl rechnet
 * (Nachtrag zu #120 fuer die AUSGABEN von Modul 0 und Modul 4, gemeldet in #98).
 *
 * Das Problem: `wandelementAktualisiert()` rechnete bislang nur das EINE Blatt von
 * Modul 7 frisch. Jede andere Ausgabe — die Zeichnungs-PDFs des zentralen Exports,
 * Gesamtstueckliste, Einkaufsliste und Baustellenstueckliste — las das gespeicherte
 * Wandelement roh und zeigte damit die Zerlegung des LETZTEN Schreibvorgangs, nicht
 * den Stand, den Modul 1 und Modul 7 zeigen.
 *
 * Dieser Leser ist die eine gemeinsame Antwort: er umhuellt einen bestehenden
 * `holeElement`-Leser und liefert je Wand ein Element, dessen `wandelement` ueber
 * `wandelementAktualisiert()` frisch gerechnet ist — MEMOISIERT je Kennung, damit ein
 * Exportlauf jede Wand genau einmal rechnet. Rein und speicherfrei wie alles hier:
 * geschrieben wird nichts, der gespeicherte Stand bleibt unberuehrt ([P-1]).
 *
 * Wird NICHT neu gerechnet (kein Katalog, fehlendes Produkt, Rechenfehler), gilt der
 * gespeicherte Stand, und der Grund steht BENANNT in `hinweise` — dieselbe Aussage,
 * die Modul 7 in dieser Lage auf der Seite zeigt; die Ausgaben bleiben damit in jedem
 * Fall wertgleich zu Modul 7. Ausdruecklich NICHT fuer Datentransport gedacht:
 * Wanddateien und Projektarchiv ([L-13]) transportieren den GESPEICHERTEN Stand und
 * duerfen diesen Leser nicht benutzen.
 *
 * @param {{holeElement:(id:string)=>any, holeEingaben:(id:string)=>any,
 *          katalog:any, engine:{autoAuslegung:Function, nachweisPruefen:Function}}} p
 * @returns {{holeElement:(id:string)=>any,
 *            hinweise:Array<{id:string, name:string|null, grund:string, text:string}>}}
 */
export function aktualisierteLeser(p) {
  /** @type {Map<string, any>} */
  const cache = new Map();
  /** @type {Array<{id:string, name:string|null, grund:string, text:string}>} */
  const hinweise = [];
  const holeElement = (id) => {
    const key = String(id);
    if (cache.has(key)) return cache.get(key);
    let el = null;
    try { el = p.holeElement(key); } catch { el = null; }
    let erg = el;
    if (el && el.wandelement) {
      let eingaben = {};
      try { eingaben = p.holeEingaben(key) || {}; } catch { eingaben = {}; }
      try {
        const r = wandelementAktualisiert(el.wandelement, eingaben, p.katalog, p.engine);
        if (r.aktualisiert) erg = { ...el, wandelement: r.wandelement };
        else if (r.grund) {
          hinweise.push({ id: key, name: el.name || null, grund: r.grund,
            text: STAND_GRUND[r.grund] || r.grund });
        }
      } catch (e) {
        // Eine Rechnung, die scheitert, darf keine Ausgabe verhindern (wie in Modul 7):
        // es gilt der gespeicherte Stand, und der Grund steht benannt — geraten wird nichts.
        hinweise.push({ id: key, name: el.name || null, grund: "fehler",
          text: "Der Stand konnte nicht neu gerechnet werden ("
            + ((e && e.message) || String(e)) + ") — es gilt der gespeicherte Stand." });
      }
    }
    cache.set(key, erg);
    return erg;
  };
  return { holeElement, hinweise };
}
