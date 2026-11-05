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

import { buildWall, Opening, ROD_OVERHANG, GRID, CHAMBER_OFFSET } from "./sembla-core.js";
import { pruefeGeschoss, ursprungPunkt, geteilteSpannpunkte } from "./sembla-constraints.js";
import { findeWand } from "./sembla-projektmappe.js";
import { produktSpezifikation, produktrollenVorschlag, produkteZuRolle, rollenVonModul, rolle, produktMassWert } from "./sembla-katalog.js";

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
  // Dazu die reinen Ausweisungsmasse (2026-10-07): ohne sie stand die neue Wand ohne
  // Schrauben-, Mutter- und Blechmasse im Speicher, und jede Ausgabe, die den gespeicherten
  // Stand zeigt, zeichnete Symbole, wo Modul 1 masstaeblich zeichnet. Keine Rechenwirkung.
  const we = buildWall(v.name, v.laenge_mm, v.hoehe_mm, [], null,
    { ...ausweisungsMasse(eingaben, katalog, "spannplatte"), ...vorgaben });
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
// Schluesselweite der Sechskantschraube Fuss (#97) sowie die Breite des Einlegeblechs — sie stehen in derselben Tabelle,
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
  // BREITE des EINLEGEBLECHS in Wandrichtung ([A-14]) — reines Ausweisungsmass ohne
  // Rechenbeitrag, damit die Ausgaben das Blech masstaeblich zeichnen ([D-1]). Gelesen wird
  // `breite_mm` (Mass in Wandrichtung, dieselbe Konvention wie beim Ausgleichsblech); ohne
  // eindeutiges Mass entsteht das Feld nicht und die Zeichnung bleibt beim Symbolmass.
  einlegeblech: (eing, kat) => {
    const b = rollenMass(eing, kat, "einlegeblech", "breite_mm");
    return b != null ? { einlegeblech_b_mm: b } : {};
  },
  // #97 Schluesselweite der SECHSKANTSCHRAUBE FUSS ([A-19]) und — seit dem 2026-10-07 — ihr
  // SCHAFTDURCHMESSER als Nenndurchmesser des gepflegten Gewindes (Pseudofeld `gewinde_d_mm`,
  // „M10" → 10). Beide reine Ausweisungsmasse fuer die masstaebliche Zeichnung ([D-4]), beide
  // fuer sich. Die KOPFHOEHE reist nicht mit: sie ist das feste Normmass `SPANN_MM.kopf_h_mm`.
  senkkopf: (eing, kat) => {
    const sw = rollenMass(eing, kat, "senkkopf", "sw_mm");
    const d = rollenMass(eing, kat, "senkkopf", "gewinde_d_mm");
    return { ...(sw != null ? { senkkopf_sw_mm: sw } : {}),
             ...(d != null ? { senkkopf_d_mm: d } : {}) };
  },
};

/**
 * #136 Kataloghoehen der AUSGLEICHSSTEINE einer Wand ([G-16]) — je Steintyp die realen
 * Steinhoehen der fuer die Rollen `ausgl_i2`/`ausgl_i3` gewaehlten Produkte.
 *
 * Bewusst KEIN Eintrag in `ROLLE_RECHNUNG`: die Ausgleichssteine gehoeren nicht in den
 * Vorspannblock (`prestress`), sondern sind — wie das Aktivierungs-Flag der Ausgleichslage —
 * ein Merkmal der Wand selbst. Gereicht wird deshalb ein eigenes Eingangsfeld
 * (`vorg.ausgleich_stein_hoehen_mm`), und zwar NUR MASSE: Produktkennungen, Preise und
 * Bezeichnungen bleiben ausserhalb des Rechenkerns.
 *
 * MEHRERE gewaehlte Hoehen sind kein Konflikt, sondern ein Vorrat (wie die Standardlaengen
 * nach [Z-2]): der Core nimmt die, die zur Resthoehe EXAKT passt. Ohne Katalog oder ohne
 * Auswahl bleiben die Listen leer — dann passt keine Hoehe, und die benoetigten Steine sind
 * Sonderzuschnitte ([G-17]). Erfunden wird keine Hoehe ([P-9]).
 *
 * @param {any} eing `eingaben` der Wand @param {any} kat zugeordneter Katalog oder null
 * @returns {{i2:number[],i3:number[]}}
 */
export function ausgleichSteinHoehen(eing, kat) {
  const hoehen = (rolleId) => {
    if (!kat) return [];
    const p = produkteZuRolle(eing || {}, kat, rolleId).produkte;
    return [...new Set(p.map((x) => +x.hoehe_mm).filter((n) => Number.isFinite(n) && n > 0))]
      .sort((a, b) => a - b);
  };
  return { i2: hoehen("ausgl_i2"), i3: hoehen("ausgl_i3") };
}

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
 * Die REINEN AUSWEISUNGSMASSE des Vorspann-Eingangssatzes — Felder ohne jeden Rechenbeitrag,
 * die der Core nur durchreicht, damit die Ausgaben die Bauteile masstaeblich zeichnen
 * ([D-1]/[D-9]). Bewusst NICHT dabei sind die Rechenwerte (Standardlaengen, Reststueck,
 * Bodenblech-Vorratssatz, `rod_fuss_offset_mm`, `rod_kopf_zuschlag_mm`): sie veraendern die
 * Zerlegung und duerfen nur zusammen mit einer Neurechnung gesetzt werden.
 */
export const AUSWEISUNGS_FELDER = Object.freeze([
  "blech_dicke_mm", "kopfblech_dicke_mm", "kupplung_sw_mm",
  "spannmutter_h_mm", "spannmutter_sw_mm", "spannplatte_b_mm",
  "zp_mutter_h_mm", "zp_mutter_sw_mm", "senkkopf_sw_mm", "senkkopf_d_mm",
  "einlegeblech_b_mm",
]);

/**
 * Die Ausweisungsmasse einer Wand aus ihrer Produktauswahl — der Teil von
 * `vorspannEingaenge()`, der OHNE Neurechnung ueber ein Wandelement gelegt werden darf.
 *
 * Gebraucht an zwei Stellen, an denen bis dahin ein Wandelement OHNE diese Masse gezeichnet
 * wurde, waehrend Modul 1 sie fuer dieselbe Wand hatte (Auftrag 2026-10-07, Schraube und
 * Muttern in Modul 7 als Symbol, in Modul 1 masstaeblich):
 *  - `wandelementNeu()`: die im Geschosseditor gezeichnete Wand wurde ohne sie gespeichert;
 *  - `wandelementAktualisiert()` im Rueckfall „Produkt fehlt": gezeigt wird der gespeicherte
 *    Stand — Modul 1 dagegen leitet jedes Mass aus den AUFLOESBAREN Produkten ab.
 * Ein Mass, das sich nicht eindeutig ergibt, fehlt im Ergebnis ([P-9]).
 *
 * @param {any} eing `eingaben` der Wand
 * @param {any} kat zugeordneter Bauteilkatalog oder null
 * @param {string} [topConn] oberer Anschluss ('blech'|'spannplatte')
 * @returns {Record<string, number>}
 */
export function ausweisungsMasse(eing, kat, topConn) {
  const alle = vorspannEingaenge(eing || {}, kat, topConn);
  /** @type {Record<string, number>} */ const out = {};
  if (!alle) return out;
  for (const f of AUSWEISUNGS_FELDER) if (alle[f] != null) out[f] = alle[f];
  return out;
}

/**
 * Ein Massfeld der gewaehlten Produkte einer Rolle: GENAU EIN Wert, sonst `null`.
 * Mehrere verschiedene Masse heissen „bleibt offen" — es wird keines bevorzugt und
 * keines gemittelt ([P-9]).
 */
function rollenMass(eing, kat, rolleId, feld) {
  if (!kat) return null;
  const auf = produkteZuRolle(eing, kat, rolleId);
  const v = [...new Set(auf.produkte.map((p) => produktMassWert(p, feld)).filter((n) => Number.isFinite(n) && n > 0))];
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
  if (fehlend.length) {
    // Gezeigt wird der GESPEICHERTE Stand (#120) — aber mit den Ausweisungsmassen der
    // aufloesbaren Produkte (2026-10-07). Modul 1 zeichnet dieselbe Wand in genau dieser Lage
    // mit ihnen (`einbauMass()` je Rolle); ohne diese Zeilen zeichneten Modul 5/7 Schraube,
    // Muttern und Einlegeblech als Symbol, wenn das gespeicherte Element sie nicht fuehrte
    // (z. B. im Geschosseditor gezeichnet). Rechenwerte bleiben unberuehrt, die Zerlegung ist
    // weiter die gespeicherte; geschrieben wird nichts.
    const top = we.prestress && we.prestress.top_connection === "blech" ? "blech" : "spannplatte";
    const masse = ausweisungsMasse(eingaben, katalog, top);
    const r = unveraendert("produkt_fehlt", fehlend);
    if (Object.keys(masse).length)
      r.wandelement = { ...we, prestress: { ...(we.prestress || {}), ...masse } };
    return r;
  }

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
    // #136 Die Ausgleichslage ist ein Merkmal der WAND und haengt nicht am Vorspannblock: ohne
    // diese Zeile fiele das Flag bei jeder Neurechnung weg, der Core rechnete wieder mit dem
    // 200-mm-Zwang und wiese dieselbe Wand ab, die gespeichert ist ([G-14]).
    ausgleichslage_aktiv: we.ausgleichslage_aktiv === true,
    // #136 Und aus demselben Grund die Kataloghoehen der Ausgleichssteine ([G-16]): sie kommen
    // aus der aktuellen Produktauswahl dieser Wand — ein Fassungswechsel ([L-12]) wirkt damit
    // sofort, ohne dass die Wand einzeln neu ausgelegt werden muss.
    ausgleich_stein_hoehen_mm: ausgleichSteinHoehen(eingaben, katalog),
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
  // [A-33] Optional die Verortung je Wand (`(id) => {geschoss, wand}|null`): dann traegt jedes
  // gelieferte Element zusaetzlich die geteilten Spannpunkte (lesende Sicht, nichts gespeichert).
  // Die Partnerwaende kommen dabei aus DIESEM Leser (frisch, ohne Sicht) — jede Wand wird weiter
  // genau einmal gerechnet.
  const verortung = typeof p.verortung === "function" ? p.verortung : null;
  /** @type {Map<string, any>} */
  const sichtCache = new Map();
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
  if (!verortung) return { holeElement, hinweise };
  const mitSicht = (id) => {
    const key = String(id);
    if (sichtCache.has(key)) return sichtCache.get(key);
    const el = holeElement(key);
    let erg = el;
    if (el && el.wandelement) {
      let ort = null;
      try { ort = verortung(key); } catch { ort = null; }
      const we = mitGeteiltenSpannpunkten(el.wandelement,
        spannpunktStellen(ort, key, holeElement, el.wandelement));
      if (we !== el.wandelement) erg = { ...el, wandelement: we };
    }
    sichtCache.set(key, erg);
    return erg;
  };
  return { holeElement: mitSicht, hinweise };
}

// ---------- Geteilter Spannpunkt an der Verzahnung ([A-33], Fachentscheid Felix Bauroth 04.11.2026) ----------
// An einer Ecke oder einem T-Anschluss liegt das Verzahnungsfeld in BEIDEN Waenden; eine
// Spannachse dort ist EINE physische Achse durch die Steine beider Waende. Gefuehrt wird sie
// genau einmal — von der Wand, die dort das Bodenblech stellt ([A-32]): „Die Wand, welche das
// Blech fuer den unteren Spannpunkt stellt, listet auch die Elemente der Spannachse auf." Die
// Partnerwand zeigt sie nur angedeutet, ohne Stuecklisteneintrag und ohne Einbauteil-ID.
//
// Die Beziehung zwischen zwei Waenden kennt nur das Geschoss ([K-13.1]). Deshalb entsteht die
// Zuordnung NIE im Rechenkern und wird NIE gespeichert: sie wird bei jeder Ausgabe frisch aus
// Wandlage, Verzahnungsbereichen und Spannachsen abgeleitet (`geteilteSpannpunkte` in
// sembla-constraints.js) und als LESENDE Sicht auf das Wandelement gelegt
// (`mitGeteiltenSpannpunkten`). Das gespeicherte Wandelement bleibt unberuehrt ([P-1]).
// Ohne eindeutige Zuordnung (keine verortete Partnerwand, Bleche ueberlagern sich) wird
// nichts umgehaengt — benannt wird es trotzdem.

/** Spannachsen-Rasterindizes eines Wandelements (`null` = kein Wandelement). */
function _achsenK(we) {
  return we && Array.isArray(we.tension_columns) ? we.tension_columns.map((c) => Number(c.k)) : null;
}

/**
 * [A-33] Die geteilten Spannpunkte EINER Wand, aus Sicht dieser Wand. Rein — der Speicher wird
 * als Leser hereingereicht.
 *
 * @param {{geschoss:any, wand:any}|null} ort Verortung der Wand (`store.wandVerortung(id)`
 *        bzw. `findeWand(mappe, id)`); `null` = in keinem Geschoss eingetragen
 * @param {string} wandId
 * @param {(id:string)=>any} holeElement Elementleser `{id,name,wandelement}` der Partnerwaende
 * @param {any} [eigenesElement] Wandelement dieser Wand, falls frischer als der Speicher
 *        (Modul 1 rechnet gerade) — sonst aus `holeElement`
 * @returns {{stellen:Array<{k:number,x_mm:number,partner_id:string,partner_name:string,
 *            partner_k:number,fuehrt:"selbst"|"partner"|null,eigene_achse:boolean,
 *            partner_achse:boolean,doppelt:boolean,partner_spalte:any,partner_dc:boolean}>,
 *            offen:Array<{k:number,x_mm:number}>}}
 *   `offen` = Spannachsen in einem eigenen Verzahnungsbereich ohne erkannte Partnerwand
 *   (neutraler Hinweis „Partnerwand nicht verortet").
 */
export function spannpunktStellen(ort, wandId, holeElement, eigenesElement) {
  const id = String(wandId);
  const lies = (x) => { try { return holeElement ? holeElement(x) : null; } catch { return null; } };
  const weVon = (x) => {
    if (x === id && eigenesElement) return eigenesElement;
    const el = lies(x);
    return el && el.wandelement ? el.wandelement : null;
  };
  const eigen = weVon(id);
  const stellen = [];
  if (ort && ort.geschoss && ort.wand && ort.wand.lage) {
    const gs = ort.geschoss;
    const waende = gs.waende || [];
    /** @type {Map<string, any>} */
    const tabelle = new Map();
    for (const w of waende) {
      const we = weVon(String(w.id));
      if (we && Array.isArray(we.interlocks) && we.interlocks.length) tabelle.set(String(w.id), we.interlocks);
    }
    if (tabelle.has(id)) {
      const erg = pruefeGeschoss(waende, gs.bemassungen || [], ursprungPunkt(gs.ursprung_mm), tabelle);
      const eigeneStellen = (erg.verzahnungen || []).filter((v) => v.a === id || v.b === id);
      for (const g of geteilteSpannpunkte(eigeneStellen, (x) => _achsenK(weVon(x)))) {
        const ichA = g.a === id, pid = ichA ? g.b : g.a;
        const k = ichA ? g.raster.a : g.raster.b, pk = ichA ? g.raster.b : g.raster.a;
        const pwe = weVon(pid), pel = lies(pid);
        const pw = waende.find((w) => String(w.id) === pid);
        const spalte = pwe ? (pwe.tension_columns || []).find((c) => Number(c.k) === pk) || null : null;
        stellen.push({
          k, x_mm: CHAMBER_OFFSET + GRID * k,
          partner_id: pid,
          partner_name: (pel && pel.name) || (pw && pw.name) || (pwe && pwe.name) || pid,
          partner_k: pk,
          fuehrt: g.fuehrt == null ? null : (g.fuehrt === id ? "selbst" : "partner"),
          eigene_achse: ichA ? g.achse.a : g.achse.b,
          partner_achse: ichA ? g.achse.b : g.achse.a,
          doppelt: g.doppelt,
          partner_spalte: spalte,
          partner_dc: !!(pwe && (pwe.deckenanschlusspunkte || []).some((d) => Number(d.k) === pk)),
        });
      }
    }
  }
  // Neutral: eine eigene Spannachse in einem eigenen Verzahnungsbereich, fuer die keine
  // Verzahnungsstelle mit verorteter Partnerwand erkannt ist.
  const offen = [];
  if (eigen && Array.isArray(eigen.interlocks) && eigen.interlocks.length) {
    const belegt = new Set(stellen.map((s) => s.k));
    for (const c of (eigen.tension_columns || [])) {
      const k = Number(c.k);
      if (belegt.has(k)) continue;
      if (eigen.interlocks.some((b) => Number(b.g0) <= k && k < Number(b.g1)))
        offen.push({ k, x_mm: c.x_mm });
    }
  }
  return { stellen, offen };
}

/** Mengen einer Spannachse, die der Rechenkern in `bom` aufsummiert (Vorzeichen f). */
function _bomAchse(bom, col, f) {
  const n = (v) => (Number.isFinite(+v) ? +v : 0);
  const senk = n(col.senkkopfschrauben);
  const verschnitt = (col.segments || []).reduce((a, sg) => a + n(sg.verschnitt_mm), 0);
  if (bom.gewindestangen != null) bom.gewindestangen += f * n(col.gewindestangen);
  if (bom.verbindungsmuttern != null) bom.verbindungsmuttern += f * n(col.verbindungsmuttern);
  if (bom.senkkopfschrauben != null) bom.senkkopfschrauben += f * senk;
  if (bom.kopplungsmuttern_basis != null) bom.kopplungsmuttern_basis += f * senk;
  if (bom.spannplatten != null) bom.spannplatten += f * n(col.spannplatten);
  if (bom.spannmuttern != null) bom.spannmuttern += f * n(col.spannmuttern);
  if (bom.verschnitt_mm != null) bom.verschnitt_mm += f * verschnitt;
}

/** Angedeutete Achse: senkrechte Strecke von der Sohle bis zur Oberkante ihrer Segmente. */
function _andeutung(col, k, we, st, quelle) {
  const segs = col.segments || [];
  const z1 = segs.reduce((a, sg) => Math.max(a, +sg.z1_mm || 0), 0);
  const h = Number.isFinite(+we.height_mm) ? +we.height_mm : z1;
  return { k, x_mm: CHAMBER_OFFSET + GRID * k, z0_mm: 0, z1_mm: Math.min(z1, h),
    partner_id: st.partner_id, partner_name: st.partner_name, quelle };
}

/**
 * [A-33] Lesende Sicht auf ein Wandelement mit den geteilten Spannpunkten: die Achse an einer
 * Verzahnungsstelle steht GENAU EINMAL in den Spannachsen — bei der blechstellenden Wand.
 *  - fuehrt die PARTNERWAND: eine eigene Achse an der Stelle faellt aus `tension_columns`
 *    (damit aus Einbauteilen, Stueckliste, Montage) und aus den Mengen in `bom`; ihr
 *    Deckenanschluss ebenso. Sie bleibt als `angedeutete_achsen`-Eintrag sichtbar. Hat nur die
 *    Partnerwand eine Achse, wird DEREN Achse hier angedeutet.
 *  - fuehrt DIESE Wand und hat sie selbst keine Achse an der Stelle, aber die Partnerwand: die
 *    Achse der Partnerwand wird uebernommen (`uebernommen_von`), samt ihrer Mengen und ihres
 *    Deckenanschlusses.
 *  - ohne eindeutige Zuordnung (`fuehrt: null`) aendert sich nichts.
 * Dazu `geteilte_spannpunkte` (je Stelle Partner und Zuordnung) fuer die Hinweise. Ohne Stellen
 * kommt das Wandelement UNVERAENDERT (dasselbe Objekt) zurueck — Waende ohne Verzahnung bleiben
 * bit-gleich. Nie gespeichert.
 *
 * @param {any} we Wandelement
 * @param {{stellen:any[], offen?:any[]}|any[]} geteilt Ergebnis von `spannpunktStellen`
 */
export function mitGeteiltenSpannpunkten(we, geteilt) {
  const stellen = Array.isArray(geteilt) ? geteilt : ((geteilt && geteilt.stellen) || []);
  const offen = Array.isArray(geteilt) ? [] : ((geteilt && geteilt.offen) || []);
  if (!we || (!stellen.length && !offen.length)) return we;
  let cols = (we.tension_columns || []).slice();
  const bom = { ...(we.bom || {}) };
  let dc = Array.isArray(we.deckenanschlusspunkte) ? we.deckenanschlusspunkte.slice() : null;
  const angedeutet = [], info = [];
  for (const st of stellen) {
    const i = cols.findIndex((c) => Number(c.k) === st.k);
    let uebernommen = false, angedeutetAus = null;
    if (st.fuehrt === "partner") {
      if (i >= 0) {
        const col = cols[i];
        cols = cols.filter((_, j) => j !== i);
        _bomAchse(bom, col, -1);
        if (dc) dc = dc.filter((d) => Number(d.k) !== st.k);
        angedeutet.push(_andeutung(col, st.k, we, st, "eigen"));
        angedeutetAus = "eigen";
      } else if (st.partner_spalte) {
        angedeutet.push(_andeutung(st.partner_spalte, st.k, we, st, "partner"));
        angedeutetAus = "partner";
      }
    } else if (st.fuehrt === "selbst" && i < 0 && st.partner_spalte) {
      const col = { ...JSON.parse(JSON.stringify(st.partner_spalte)),
        k: st.k, x_mm: CHAMBER_OFFSET + GRID * st.k, uebernommen_von: st.partner_name };
      cols = [...cols, col].sort((a, b) => a.k - b.k);
      _bomAchse(bom, col, +1);
      if (dc && st.partner_dc && !dc.some((d) => Number(d.k) === st.k))
        dc = [...dc, { k: st.k, x_mm: col.x_mm, art: "uebernommen" }].sort((a, b) => a.k - b.k);
      uebernommen = true;
    }
    info.push({ k: st.k, x_mm: st.x_mm, partner_id: st.partner_id, partner_name: st.partner_name,
      partner_k: st.partner_k, fuehrt: st.fuehrt, doppelt: st.doppelt, uebernommen,
      angedeutet: angedeutetAus });
  }
  for (const o of offen) info.push({ k: o.k, x_mm: o.x_mm, partner_id: null, partner_name: null,
    partner_k: null, fuehrt: null, doppelt: false, uebernommen: false, angedeutet: null,
    unverortet: true });
  info.sort((a, b) => a.k - b.k);
  const out = { ...we, tension_columns: cols, bom, geteilte_spannpunkte: info };
  if (dc) out.deckenanschlusspunkte = dc;
  if (angedeutet.length) out.angedeutete_achsen = angedeutet;
  return out;
}

/**
 * [A-33] Die geteilten Spannpunkte einer Wand aus dem Speicher anwenden — der gemeinsame Weg
 * fuer Modul 1/4/5/7. Der Speicher wird hereingereicht (`wandVerortung`, `holeElement`).
 * @param {any} store @param {string|null} wandId @param {any} we (frisches) Wandelement
 */
export function geteiltAusSpeicher(store, wandId, we) {
  if (!we || !wandId || !store) return we;
  let ort = null;
  try { ort = store.wandVerortung ? store.wandVerortung(wandId) : null; } catch { ort = null; }
  const g = spannpunktStellen(ort, wandId, (x) => store.holeElement(x), we);
  return mitGeteiltenSpannpunkten(we, g);
}
