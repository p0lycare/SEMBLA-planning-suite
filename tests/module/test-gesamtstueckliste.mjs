// Regressionstest der GESAMTSTÜCKLISTE über die aktiven Projektstufen (Issue #44).
//
// Geprueft wird die reine Ableitung (docs/shared/sembla-gesamtstueckliste.js) und ihre
// Dateiform (gesamtstuecklisteAoa/-Csv in sembla-export.js) — DOM-frei, ohne localStorage.
//
// Die Messlatte ist ueberall dieselbe: JEDE Ebene muss exakt der Summe der einzelnen
// `stuecklistePositionen`-Aufrufe ihrer Waende entsprechen. Wo das nicht gilt, waere ein
// zweites Mengenmodell entstanden — genau das soll der Test unmoeglich machen.
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { mengenKennung, standardEingaben } from "../../docs/shared/storage.js";
import {
  stuecklistePositionen, gesamtstuecklisteAoa, gesamtstuecklisteCsv, gesamtstuecklisteDateien, baueDateien,
} from "../../docs/shared/sembla-export.js";
import {
  EBENEN, ebeneTitel, umfang, gesamtDaten, standText, herkunftText, dateiRumpf,
  wirksameEbenenMengen,
} from "../../docs/shared/sembla-gesamtstueckliste.js";
import {
  leereMappe, fuegeGebaeudeHinzu, fuegeGeschossHinzu, setzeWand, setzeKatalogRef,
  geschossMengen, setzeGeschossMenge, mappeObjekt, validiereMappe,
} from "../../docs/shared/sembla-projektmappe.js";
import { katalogObjekt } from "../../docs/shared/sembla-katalog.js";
import {
  EXPORT_OPTIONEN, exportOptionen, geschossTeilmappe, geschossPfad, gesamtMengenLuecken,
  hierarchieExport, wandPfad, sicherStamm,
} from "../../docs/shared/sembla-archiv.js";

const checks = [];
const ok = (n, c) => checks.push([n, !!c]);

// --- Synthetischer Katalog (nur Fantasiedaten) — Preisquelle nach [P-14] ------------------
const KATALOG = { format: "SEMBLA-Bauteilkatalog", version: 1, name: "Testkatalog #44", produkte: [
  { id: "stein-i3", kategorie: "stein", bezeichnung: "Stein i3", einheit: "Stk", preis: 9.5, breite_mm: 375, hoehe_mm: 200, dicke_mm: 125 },
  { id: "stein-i2", kategorie: "stein", bezeichnung: "Stein i2", einheit: "Stk", preis: 7.2, breite_mm: 250, hoehe_mm: 200, dicke_mm: 125 },
  { id: "rod-1000", kategorie: "gewindestange", bezeichnung: "Stange 1000", einheit: "Stk", preis: 3.4, gewinde: "M10", laenge_mm: 1000 },
  { id: "rod-500", kategorie: "gewindestange", bezeichnung: "Stange 500", einheit: "Stk", preis: 1.9, gewinde: "M10", laenge_mm: 500 },
  { id: "rod-rest-300", kategorie: "gewindestange", bezeichnung: "Reststück 300", einheit: "Stk", preis: 1.2, gewinde: "M10", laenge_mm: 300 },
  { id: "kuppl", kategorie: "verbrauch", bezeichnung: "Kopplungsmutter", einheit: "Stk", preis: 0.65 },
  { id: "senkkopf", kategorie: "verbrauch", bezeichnung: "Senkkopfschraube", einheit: "Stk", preis: 0.45 },
  { id: "spannmutter", kategorie: "verbrauch", bezeichnung: "Spannmutter", einheit: "Stk", preis: 0.9 },
  { id: "dicht-stk", kategorie: "verbrauch", bezeichnung: "Dichtstreifen 20 cm", einheit: "Stk", preis: 0.3 },
  { id: "blech-boden", kategorie: "blech_platte", bezeichnung: "Bodenblech 1000", einheit: "Stk", preis: 18, breite_mm: 1000, hoehe_mm: 125, dicke_mm: 15 },
  { id: "blech-kopf", kategorie: "blech_platte", bezeichnung: "Kopfblech 1000", einheit: "Stk", preis: 21, breite_mm: 1000, hoehe_mm: 125, dicke_mm: 15 },
  { id: "spannplatte", kategorie: "blech_platte", bezeichnung: "Spannplatte 120", einheit: "Stk", preis: 2.4, breite_mm: 120, hoehe_mm: 120, dicke_mm: 15 },
]};
const ROLLEN = { i3: ["stein-i3"], i2: ["stein-i2"], rod_std: ["rod-1000", "rod-500"], rod_rest: ["rod-rest-300"],
  kupplung: ["kuppl"], senkkopf: ["senkkopf"], spannmutter: ["spannmutter"], spannplatte: ["spannplatte"],
  blech_boden: ["blech-boden"], blech_kopf: ["blech-kopf"], dicht_stk: ["dicht-stk"] };
function eingabenFuer(waehrung = "EUR") {
  const e = standardEingaben();
  e.planung.produkte = { quelle: { name: KATALOG.name, version: 1 }, rollen: JSON.parse(JSON.stringify(ROLLEN)) };
  e.kosten.waehrung = waehrung;
  return e;
}

// --- Wandspeicher-Mock: drei geplante Waende, eine verwaiste, eine ohne Wandelement -------
// Alle Wände tragen Standardlängen 1000/500 und ein Reststück ([Z-6]) — so entstehen je Wand
// mehrere Stangenpositionen und mindestens zwei verschiedene Sonderzuschnitt-Fertigmaße.
const OPT = { rod_lengths_mm: [1000, 500], rod_rest_mm: 300 };
const ELEMENTE = {
  "w-a": { id: "w-a", name: "Wand A", wandelement: buildWall("Wand A", 3000, 3000, [new Opening(6, 10, 4, 10, "fenster")], null, OPT) },
  "w-b": { id: "w-b", name: "Wand B", wandelement: buildWall("Wand B", 3000, 3000, [new Opening(6, 10, 4, 10, "fenster")], null, OPT) },
  "w-c": { id: "w-c", name: "Wand C", wandelement: buildWall("Wand C", 2000, 2600, [new Opening(5, 11, 0, 10, "tuer")], null, OPT) },
  "w-d": { id: "w-d", name: "Wand D (2. Gebäude)", wandelement: buildWall("Wand D", 2500, 2400, [], null, OPT) },
  "w-leer": { id: "w-leer", name: "Wand ohne Element", wandelement: null },
};
const WAEHRUNG = { "w-a": "EUR", "w-b": "EUR", "w-c": "EUR", "w-d": "EUR", "w-leer": "EUR" };
const leser = () => ({
  holeElement: (id) => ELEMENTE[id] || null,
  holeEingaben: (id) => eingabenFuer(WAEHRUNG[id] || "EUR"),
  katalog: KATALOG,
});

// --- Mappe: 2 Gebäude, 3 Geschosse, 5 Wandeinträge (einer verwaist) -----------------------
let M = leereMappe("Projekt #44", { gebaeude: "Haus Nord", geschoss: "EG" });
const GEB1 = M.gebaeude[0].id, EG = M.gebaeude[0].geschosse[0].id;
let r = fuegeGeschossHinzu(M, GEB1, "OG"); M = r.mappe; const OG = r.id;
r = fuegeGebaeudeHinzu(M, "Haus Süd"); M = r.mappe; const GEB2 = r.id;
r = fuegeGeschossHinzu(M, GEB2, "EG Süd"); M = r.mappe; const EG2 = r.id;
M = setzeWand(M, EG, { id: "w-a", name: "Wand A" });
M = setzeWand(M, EG, { id: "w-b", name: "Wand B" });
M = setzeWand(M, OG, { id: "w-c", name: "Wand C" });
M = setzeWand(M, EG2, { id: "w-d", name: "Wand D (2. Gebäude)" });

/** Erwartete Summe einer Wandmenge — genau der bestehende kanonische Pfad. */
function erwartet(ids) {
  const summe = new Map();
  for (const id of ids) {
    for (const p of stuecklistePositionen(ELEMENTE[id].wandelement, eingabenFuer(), KATALOG)) {
      const k = [p.key, p.unit, p.art || "", p.fertigmass_mm == null ? "" : p.fertigmass_mm].join("|");
      summe.set(k, (summe.get(k) || 0) + p.menge);
    }
  }
  return summe;
}
/** Ist-Summe aus der Gesamtstückliste, auf denselben Schlüssel reduziert. */
function ist(daten) {
  const summe = new Map();
  for (const p of daten.positionen) {
    const k = [p.key, p.unit, p.art || "", p.fertigmass_mm == null ? "" : p.fertigmass_mm].join("|");
    summe.set(k, (summe.get(k) || 0) + p.menge);
  }
  return summe;
}
const gleich = (a, b) => a.size === b.size && [...a].every(([k, v]) => Math.abs((b.get(k) ?? NaN) - v) < 1e-9);

const daten = (ebene, zeiger) => gesamtDaten(umfang(M, ebene, zeiger), leser());
const Z = { wandId: "w-a", geschossId: EG, gebaeudeId: GEB1 };

// ---- 1. Umfang: genau die Wände der Ebene, keine fremde ---------------------------------
{
  ok("vier Ebenen, keine weitere", JSON.stringify([...EBENEN]) === JSON.stringify(["wand", "geschoss", "gebaeude", "projekt"]));
  const uW = umfang(M, "wand", Z), uG = umfang(M, "geschoss", Z), uB = umfang(M, "gebaeude", Z), uP = umfang(M, "projekt", Z);
  ok("Wandebene: genau die aktive Wand", uW.ok && uW.waende.map(w => w.wandId).join() === "w-a");
  ok("Geschossebene: genau die Wände des aktiven Geschosses", uG.ok && uG.waende.map(w => w.wandId).join() === "w-a,w-b");
  ok("Gebäudeebene: alle Geschosse des aktiven Gebäudes", uB.ok && uB.waende.map(w => w.wandId).join() === "w-a,w-b,w-c");
  ok("Projektebene: alle Wände beider Gebäude", uP.ok && uP.waende.map(w => w.wandId).join() === "w-a,w-b,w-c,w-d");
  ok("ausgeschlossene Ebene fehlt: Geschoss EG kennt Wand C und D nicht",
    !uG.waende.some(w => w.wandId === "w-c" || w.wandId === "w-d"));
  ok("Gebäude Nord kennt die Wand des zweiten Gebäudes nicht", !uB.waende.some(w => w.wandId === "w-d"));
  ok("jede Wand trägt Gebäude- und Geschossreferenz",
    uP.waende.every(w => w.gebaeudeId && w.geschossId && w.gebaeude && w.geschoss));
  ok("Blattbezeichnung ist je Ebene eindeutig",
    ebeneTitel("wand") === "Baustellenstückliste Wand" && ebeneTitel("geschoss") === "Gesamtstückliste Geschoss"
    && ebeneTitel("gebaeude") === "Gesamtstückliste Gebäude" && ebeneTitel("projekt") === "Gesamtstückliste Projekt");
}

// ---- 2. Nicht aktivierbare Ebenen werden benannt, nie ersetzt ---------------------------
{
  const ohneGs = umfang(M, "geschoss", { wandId: "w-a", geschossId: null, gebaeudeId: GEB1 });
  ok("kein aktives Geschoss -> benannt, kein Ersatzumfang",
    !ohneGs.ok && ohneGs.waende.length === 0 && /Kein aktives Geschoss/.test(ohneGs.grund) && /L-10/.test(ohneGs.grund));
  const ohneProjekt = umfang(null, "projekt", Z);
  ok("kein aktives Projekt -> benannt", !ohneProjekt.ok && /Kein aktives Projekt/.test(ohneProjekt.grund));
  const fremd = umfang(M, "geschoss", { geschossId: "gs-fremd" });
  ok("projektfremdes Geschoss -> abgewiesen statt still übernommen",
    !fremd.ok && fremd.waende.length === 0 && /gehört nicht zum Projekt/.test(fremd.grund));
  const ohneWand = umfang(M, "wand", { wandId: null });
  ok("keine aktive Wand -> benannt", !ohneWand.ok && /Keine aktive Wand/.test(ohneWand.grund));
  ok("nicht ableitbare Ebene liefert keine einzige Position und meldet die Lücke", (() => {
    const d = gesamtDaten(ohneGs, leser());
    return d.positionen.length === 0 && d.luecken.length === 1 && d.luecken[0].art === "ebene" && !d.vollstaendig;
  })());
  // Eine unverortete Wand ([L-4]) bleibt auf der Wandebene auswertbar — sie hat keine Eltern.
  const unverortet = umfang(null, "wand", { wandId: "w-solo", wandName: "Solowand" });
  ok("unverortete Wand bleibt auf Wandebene auswertbar",
    unverortet.ok && unverortet.waende[0].wandId === "w-solo" && unverortet.bezug.wand === "Solowand");
}

// ---- 3. Jede Ebene ist exakt die Summe ihrer Wandstücklisten ----------------------------
{
  const faelle = [["wand", ["w-a"]], ["geschoss", ["w-a", "w-b"]], ["gebaeude", ["w-a", "w-b", "w-c"]],
    ["projekt", ["w-a", "w-b", "w-c", "w-d"]]];
  for (const [ebene, ids] of faelle) {
    const d = daten(ebene, Z);
    ok(`Ebene ${ebene}: Mengen = Summe der stuecklistePositionen-Aufrufe`, gleich(ist(d), erwartet(ids)));
    ok(`Ebene ${ebene}: alle ${ids.length} Wände enthalten, keine Lücke`,
      d.quellen.length === ids.length && d.luecken.length === 0 && d.vollstaendig);
    ok(`Ebene ${ebene}: jede Zeile nennt jede beitragende Wand`,
      d.positionen.every(p => p.herkunft.length >= 1 && p.herkunft.every(h => h.wandId && h.wand)
        && p.menge === Math.round(p.herkunft.reduce((a, h) => a + h.menge, 0) * 1e6) / 1e6));
  }
  // Die Wandebene ist der BESTEHENDE Pfad — Feld für Feld, nicht nur in der Summe.
  const dW = daten("wand", Z);
  const roh = stuecklistePositionen(ELEMENTE["w-a"].wandelement, eingabenFuer(), KATALOG);
  ok("Wandebene ändert die bestehende Baustellenstückliste nicht",
    dW.positionen.length === roh.length
    && dW.positionen.every((p, i) => p.key === roh[i].key && p.label === roh[i].label && p.unit === roh[i].unit
      && p.menge === roh[i].menge && p.ep === roh[i].ep && p.status === roh[i].status
      && p.fertigmass_mm === roh[i].fertigmass_mm && p.art === roh[i].art
      && (p.gp == null ? roh[i].gp == null : Math.abs(p.gp - roh[i].gp) < 1e-9)));
  ok("Wandebene: Einzel-IDs bleiben unverändert erhalten",
    dW.positionen.every((p, i) => p.herkunft[0].ids.join(" ") === roh[i].ids.join(" ")));
}

// ---- 4. Zusammenführung: gleiche Art/Fertigmaß verschmilzt, Sondermaße bleiben getrennt --
{
  const d = daten("geschoss", Z);   // Wand A und B sind baugleich -> jede Position hat 2 Herkünfte
  const rodStd = d.positionen.filter(p => p.key === "rod_std");
  const sonder = d.positionen.filter(p => p.key === "rod_sonder");
  ok("gleiche Art und gleiches Fertigmaß werden zu EINER Zeile",
    rodStd.length > 0 && rodStd.every(p => p.herkunft.length === 2)
    && new Set(rodStd.map(p => p.fertigmass_mm)).size === rodStd.length);
  ok("Fixture liefert mindestens zwei Sonderzuschnitt-Fertigmaße", (() => {
    const masse = new Set(sonder.map(p => p.fertigmass_mm));
    return masse.size >= 2;
  })());
  ok("Sonderzuschnitte verschiedener Fertigmaße bleiben getrennt",
    sonder.length === new Set(sonder.map(p => p.fertigmass_mm)).size);
  ok("Reststück bleibt eigene Position ([Z-6])", d.positionen.some(p => p.key === "rod_rest"));
  ok("Menge einer verschmolzenen Zeile = Summe der Teilmengen",
    rodStd.every(p => p.menge === p.herkunft.reduce((a, h) => a + h.menge, 0)));
  ok("GP folgt der Gesamtmenge, EP bleibt der Einzelpreis",
    rodStd.every(p => p.ep == null ? p.gp == null : Math.abs(p.gp - p.menge * p.ep) < 1e-9));

  // Rückverfolgbarkeit: qualifiziertes Paar (Wand-Id, Einbauteil-Id). Die Einzel-Id des
  // Rechenkerns ist wandlokal — genau deshalb wird sie qualifiziert und nicht neu erfunden.
  const alle = d.positionen.flatMap(p => p.ids);
  ok("jede Einbauteil-ID ist als Wand-ID:ID qualifiziert",
    alle.length > 0 && alle.every(x => /^w-[a-z]+:GS-k\d+\.\d+\.\d+$/.test(x)));
  ok("jedes qualifizierte Paar steht genau einmal", new Set(alle).size === alle.length);
  ok("die rohe Einzel-ID wiederholt sich über die Wände (deshalb die Qualifizierung)", (() => {
    const roh = alle.map(x => x.split(":")[1]);
    return new Set(roh).size < roh.length;
  })());
  ok("Anzahl der IDs = Summe der Einbauteile beider Wände", (() => {
    const je = ["w-a", "w-b"].map(id => stuecklistePositionen(ELEMENTE[id].wandelement, eingabenFuer(), KATALOG)
      .reduce((a, p) => a + p.ids.length, 0));
    return alle.length === je[0] + je[1];
  })());
  ok("keine erfundene ID, wo der Rechenkern keine kennt",
    d.positionen.filter(p => ["i3", "i2", "kupplung", "blech_boden", "dicht"].includes(p.key))
      .every(p => p.ids.length === 0));
  ok("Herkunftstext nennt Wand und Teilmenge", /Wand A: \d+ · Wand B: \d+/.test(herkunftText(rodStd[0])));
}

// ---- 5. Lücken: verwaist, ohne Wandelement, nicht ableitbar ------------------------------
{
  let ML = setzeWand(M, EG, { id: "w-verwaist", name: "Verwaiste Wand" });
  ML = setzeWand(ML, EG, { id: "w-leer", name: "Wand ohne Element" });
  const d = gesamtDaten(umfang(ML, "geschoss", Z), leser());
  const arten = d.luecken.map(l => l.art);
  ok("verwaiste Wand-ID wird als Lücke gemeldet ([L-4])", arten.includes("wand_fehlt"));
  ok("Eintrag ohne Wandelement wird als Lücke gemeldet", arten.includes("kein_wandelement"));
  ok("Lücke nennt Wand und Projektpfad",
    d.luecken.every(l => l.grund) && d.luecken.some(l => /Projekt #44 › Haus Nord › EG › Verwaiste Wand/.test(l.pfad)));
  ok("Ausgabe ist sichtbar unvollständig", !d.vollstaendig && /UNVOLLSTÄNDIG/.test(standText(d)));
  ok("Stand nennt enthaltene und erwartete Wandzahl", /2 von 4 Wänden/.test(standText(d)));
  ok("keine Nullposition und kein Ersatzpreis für die fehlenden Wände",
    gleich(ist(d), erwartet(["w-a", "w-b"])) && d.positionen.every(p => p.menge > 0 || p.status === "nicht_erforderlich"));
  ok("die vorhandenen Wände bleiben vollständig gerechnet", d.quellen.length === 2);

  // Nicht ableitbar: ein Eintrag, dessen Wandelement die Stückliste sprengen wuerde.
  const kaputt = { holeElement: (id) => id === "w-x" ? { id, name: "Kaputte Wand", wandelement: { length_mm: 1000, height_mm: 1000, get bom() { throw new Error("defekt"); } } } : ELEMENTE[id] || null,
    holeEingaben: () => eingabenFuer(), katalog: KATALOG };
  const MK = setzeWand(M, EG, { id: "w-x", name: "Kaputte Wand" });
  const dk = gesamtDaten(umfang(MK, "geschoss", Z), kaputt);
  ok("nicht ableitbare Wandstückliste -> Lücke statt Absturz",
    dk.luecken.some(l => l.art === "nicht_ableitbar" && /defekt/.test(l.grund)) && !dk.vollstaendig);
  ok("nicht ableitbare Wand liefert keine Position", gleich(ist(dk), erwartet(["w-a", "w-b"])));
}

// ---- 6. Währung: uneinheitliche Stände sind eine Lücke, nie eine Umrechnung --------------
{
  const gemischt = { ...leser(), holeEingaben: (id) => eingabenFuer(id === "w-b" ? "CHF" : "EUR") };
  const d = gesamtDaten(umfang(M, "geschoss", Z), gemischt);
  ok("uneinheitliche Währung wird als Lücke gemeldet",
    d.waehrungKonflikt && d.luecken.some(l => l.art === "waehrung_uneinheitlich" && /EUR/.test(l.grund) && /CHF/.test(l.grund)));
  ok("kein Gesamtbetrag über zwei Währungen", d.betragMoeglich === false && !d.vollstaendig);
  ok("Mengen bleiben davon unberührt", gleich(ist(d), erwartet(["w-a", "w-b"])));
  const rein = daten("geschoss", Z);
  ok("einheitliche Währung -> Betrag möglich", rein.betragMoeglich === true && rein.waehrung === "EUR");
}

// ---- 7. Datei: CSV der Ebene, Preisschalter, Lücken --------------------------------------
{
  const d = daten("geschoss", Z);
  const mitPreis = gesamtstuecklisteAoa(d, { datum: "01.01.2026" });
  const ohnePreis = gesamtstuecklisteAoa(d, { datum: "01.01.2026", preise: false });
  const kopfMit = mitPreis.find(z => z[0] === "Einbauteil");
  const kopfOhne = ohnePreis.find(z => z[0] === "Einbauteil");
  ok("CSV-Kopf nennt Blatt, Ebene und Bezug", mitPreis[0][0] === "SEMBLA – Gesamtstückliste Geschoss"
    && mitPreis.some(z => z[0] === "Ebene" && z[1] === "Geschoss")
    && mitPreis.some(z => z[0] === "Geschoss" && z[1] === "EG"));
  // #81: Die Wandherkunft ist ersatzlos entfallen — die qualifizierten IDs bleiben.
  ok("#81 CSV führt KEINE Herkunftsspalte mehr, die qualifizierten IDs bleiben",
    !kopfMit.includes("Wände (Herkunft)") && !kopfOhne.includes("Wände (Herkunft)")
    && !kopfMit.some((t) => /Herkunft/.test(t))
    && kopfMit.includes("Einbauteil-IDs (Wand-ID:ID)"));
  ok("#81 kein Wandname mehr in einer Positionszeile", (() => {
    const zeilen = mitPreis.slice(mitPreis.indexOf(kopfMit) + 1)
      .filter((z) => z.length > 1 && !String(z[0]).startsWith("Summe netto"));
    return zeilen.length > 0 && !zeilen.some((z) => z.some((v) => /Wand A|Wand B/.test(String(v))));
  })());
  ok("#81 EP/GP stehen unmittelbar vor „Produkt (Katalog)“",
    kopfMit.indexOf("GP (EUR)") === kopfMit.indexOf("Produkt (Katalog)") - 1
    && kopfMit.indexOf("EP (EUR)") === kopfMit.indexOf("GP (EUR)") - 1);
  ok("#81 die Spaltenfolge der Gesamtdatei ist genau der neue Satz",
    JSON.stringify(kopfMit) === JSON.stringify(["Einbauteil", "Art", "Fertigmaß (mm)", "Einheit",
      "Menge", "Einbauteil-IDs (Wand-ID:ID)", "EP (EUR)", "GP (EUR)", "Produkt (Katalog)", "Zuordnung"]));
  ok("Preisschalter entfernt genau EP und GP",
    kopfMit.includes("EP (EUR)") && kopfMit.includes("GP (EUR)")
    && !kopfOhne.includes("EP (EUR)") && !kopfOhne.includes("GP (EUR)")
    && kopfMit.length - 2 === kopfOhne.length);
  ok("Preisschalter entfernt den Summenbetrag",
    mitPreis.some(z => String(z[0]).startsWith("Summe netto"))
    && !ohnePreis.some(z => String(z[0]).startsWith("Summe netto")));
  ok("Preisschalter lässt Mengen und IDs unverändert", (() => {
    // Verglichen wird ueber die SPALTENNAMEN, nicht ueber feste Indizes: sonst haengt der Test
    // an der Breite der Fassung (#81 hat sie geaendert).
    const namen = ["Einbauteil", "Einheit", "Menge", "Einbauteil-IDs (Wand-ID:ID)", "Zuordnung"];
    const spalten = (aoa, kopf) => aoa.slice(aoa.indexOf(kopf) + 1)
      .filter(z => z.length > 1 && !String(z[0]).startsWith("Summe netto"))
      .map(z => namen.map((n) => z[kopf.indexOf(n)]).join("|"));
    return JSON.stringify(spalten(mitPreis, kopfMit)) === JSON.stringify(spalten(ohnePreis, kopfOhne));
  })());
  ok("#81 die Mengen der Datei sind wertgleich der Aggregation (nur die Spalte fiel)", (() => {
    const iM = kopfMit.indexOf("Menge"), iE = kopfMit.indexOf("Einheit");
    const zeilen = mitPreis.slice(mitPreis.indexOf(kopfMit) + 1)
      .filter((z) => z.length > 1 && !String(z[0]).startsWith("Summe netto"));
    return zeilen.length === d.positionen.length
      && d.positionen.every((p, i) => zeilen[i][iM] === p.menge && zeilen[i][iE] === p.unit)
      && gleich(ist(d), erwartet(["w-a", "w-b"]));
  })());
  ok("CSV meldet Vollständigkeit", mitPreis.some(z => z[0] === "Vollständigkeit" && /vollständig – 2 von 2/.test(z[1])));
  const csv = gesamtstuecklisteCsv(d, { datum: "01.01.2026" });
  ok("CSV-Text ist semikolongetrennt und führt jede qualifizierte ID",
    /;/.test(csv) && d.positionen.flatMap(p => p.ids).every(x => csv.includes(x)));
  ok("Dateirumpf nennt Ebene und Bezug", dateiRumpf(d) === "Gesamtstueckliste_Geschoss_EG"
    && dateiRumpf(daten("wand", Z)) === "Baustellenstueckliste_Wand_Wand_A"
    && dateiRumpf(daten("projekt", Z)) === "Gesamtstueckliste_Projekt_Projekt_44");

  // Unvollständige Datei sagt das ausdrücklich und nennt jede Lücke.
  const ML = setzeWand(M, EG, { id: "w-verwaist", name: "Verwaiste Wand" });
  const csvL = gesamtstuecklisteCsv(gesamtDaten(umfang(ML, "geschoss", Z), leser()), { datum: "01.01.2026" });
  ok("unvollständige CSV ist als solche gekennzeichnet", /UNVOLLSTÄNDIG – 2 von 3/.test(csvL));
  ok("unvollständige CSV nennt Lücke mit Pfad und Ursache",
    /Lücke;Projekt #44 › Haus Nord › EG › Verwaiste Wand;.*verwaister Eintrag/.test(csvL));
  ok("unvollständige CSV erfindet keine Nullzeile", !/;0;;;;;;$/m.test(csvL));
}

// ==== Hierarchischer Export (#67): Optionen je Ebene, ZIP-Inhalt = Auswahl, Luecken ========
// Die Mappe bekommt fuer diese Abschnitte eine Katalogzuordnung ([L-12]) — der Export
// gibt den zugeordneten Katalog als EIGENE Datei aus, nie eingebettet.
const MK = setzeKatalogRef(M, "kat-44");
/** SEMBLA-Projekt-v2-Sicht einer Wand — wie store.projektObjekt, hier als reiner Mock. */
const projektObjekt = (id) => ({
  format: "SEMBLA-Projekt", version: 2, name: ELEMENTE[id].name,
  wandelement: ELEMENTE[id].wandelement, eingaben: eingabenFuer(),
});
/** Standard-Parameter des Exports — Klick-Kennungen, nie aktive Zeiger. */
const P = (ueber = {}) => ({
  mappe: MK, ebene: "projekt", gebaeudeId: GEB1, geschossId: EG, wandId: "w-a", wandName: "Wand A",
  katalog: KATALOG, ...leser(), projektObjekt, preise: true, ...ueber,
});

// ---- 8. Optionen je Ebene: genau die zulaessigen, zyklusfremde gibt es nicht --------------
{
  ok("#67 Projekt-/Gebaeudeebene: Mappe, Gesamtstueckliste, Geschosse, Waende, Katalog",
    JSON.stringify(EXPORT_OPTIONEN.projekt) === JSON.stringify(["mappe", "gesamt", "geschosse", "waende", "katalog"])
    && JSON.stringify(EXPORT_OPTIONEN.gebaeude) === JSON.stringify(EXPORT_OPTIONEN.projekt));
  ok("#67 Geschossebene: Geschossdaten, Gesamtstueckliste, Waende — keine Projektmappe",
    JSON.stringify(EXPORT_OPTIONEN.geschoss) === JSON.stringify(["geschoss", "gesamt", "waende"]));
  ok("#67 Wandebene: Wanddatei und Baustellenstueckliste",
    JSON.stringify(EXPORT_OPTIONEN.wand) === JSON.stringify(["wand", "stueckliste"]));
  const alleOpt = Object.values(EXPORT_OPTIONEN).flat();
  ok("#67 zyklusfremde Ausgaben sind auf KEINER Ebene waehlbar",
    ["nachweis", "montage", "zeichnung", "ifc", "zuschnitt"].every((o) => !alleOpt.includes(o)));
  ok("#67 exportOptionen liefert eine Kopie",
    (() => { const a = exportOptionen("wand"); a.push("x"); return EXPORT_OPTIONEN.wand.length === 2; })());
  const wirft = (fn, muster) => { try { fn(); return false; } catch (e) { return muster.test(e.message); } };
  ok("#67 unzulaessige Auswahl wird abgewiesen statt still uebergangen",
    wirft(() => hierarchieExport(["mappe"], P({ ebene: "geschoss" })), /gibt es auf der Ebene/)
    && wirft(() => hierarchieExport(["gesamt"], P({ ebene: "wand" })), /gibt es auf der Ebene/)
    && wirft(() => hierarchieExport(["nachweis"], P()), /gibt es auf der Ebene/));
  ok("#67 leere Auswahl und unbekannte Ebene werden benannt",
    wirft(() => hierarchieExport([], P()), /Keine Datei/)
    && wirft(() => hierarchieExport(["mappe"], P({ ebene: "etage" })), /Unbekannte Exportebene/));
  ok("#67 ohne Mappe ist nur die Wandebene exportierbar",
    wirft(() => hierarchieExport(["mappe"], P({ mappe: null })), /nur die Wandebene/));
}

// ---- 9. ZIP-Inhalt entspricht exakt der Auswahl -------------------------------------------
{
  // Projektebene, alles gewaehlt: 1 Mappe + 3 Geschosse + 4 Waende + 1 CSV + 1 Katalog.
  const erg = hierarchieExport(["mappe", "gesamt", "geschosse", "waende", "katalog"], P());
  const namen = erg.dateien.map((d) => d.name);
  ok("#67 Projekt-Vollpaket: 10 Dateien, keine Luecke", erg.dateien.length === 10 && erg.luecken.length === 0);
  ok("#67 ZIP-Name nennt Ebene und Projekt", erg.zipName === "SEMBLA_Export_Projekt_" + sicherStamm("Projekt #44"));
  ok("#67 Mappendatei: unveraenderte SEMBLA-Projektmappe v2, heisst NICHT projekt.json", (() => {
    const f = erg.dateien.find((x) => x.name.startsWith("SEMBLA_Projektmappe_"));
    return f && f.data === JSON.stringify(mappeObjekt(MK), null, 2)
      && !namen.some((n) => n.endsWith("projekt.json"));
  })());
  ok("#67 je Geschoss eine Teilmappe unter geschosse/", [EG, OG, EG2].every((gs) =>
    namen.filter((n) => n.startsWith("geschosse/")).some((n) => n.endsWith("__" + gs + ".json"))));
  ok("#67 jede Teilmappe ist GUELTIGES Mappenformat v2 mit genau einem Gebaeude/Geschoss",
    erg.dateien.filter((x) => x.name.startsWith("geschosse/")).every((x) => {
      const t = JSON.parse(x.data);
      return validiereMappe(t).length === 0 && t.format === "SEMBLA-Projektmappe" && t.version === 2
        && t.gebaeude.length === 1 && t.gebaeude[0].geschosse.length === 1
        && t.projekt.id === MK.projekt.id && t.katalog === "kat-44";
    }));
  ok("#67 die Teilmappe traegt genau die Waende ihres Geschosses", (() => {
    const t = JSON.parse(erg.dateien.find((x) => x.name === geschossPfad({ id: EG, name: "EG" })).data);
    return t.gebaeude[0].geschosse[0].waende.map((w) => w.id).join() === "w-a,w-b";
  })());
  ok("#67 je Wand eine SEMBLA-Projekt-v2-Datei unter waende/", ["w-a", "w-b", "w-c", "w-d"].every((id) => {
    const f = erg.dateien.find((x) => x.name === wandPfad({ id, name: ELEMENTE[id].name }));
    return f && f.data === JSON.stringify(projektObjekt(id), null, 2);
  }));
  ok("#67 die Gesamtstueckliste ist bitgleich der bestehende kanonische Pfad", (() => {
    const d = gesamtDaten(umfang(MK, "projekt", Z), leser());
    const soll = gesamtstuecklisteDateien(d, { preise: true, rumpf: dateiRumpf(d) })[0];
    const f = erg.dateien.find((x) => x.name === soll.name);
    return f && f.data === soll.data;
  })());
  ok("#67 der Katalog ist eine eigene Datei im Katalogformat — nirgends eingebettet ([L-12])", (() => {
    const f = erg.dateien.find((x) => x.name.startsWith("SEMBLA_Bauteilkatalog_"));
    return f && f.data === JSON.stringify(katalogObjekt(KATALOG), null, 2)
      && erg.dateien.filter((x) => x.name.startsWith("SEMBLA_Projektmappe_") || x.name.startsWith("geschosse/"))
        .every((x) => !x.data.includes('"produkte"'));
  })());

  // Teilauswahl: genau eine Datei je gewaehlter Einzeloption.
  ok("#67 die Auswahl bestimmt den Inhalt exakt",
    hierarchieExport(["mappe"], P()).dateien.length === 1
    && hierarchieExport(["katalog"], P()).dateien.length === 1
    && hierarchieExport(["gesamt"], P()).dateien.length === 1
    && hierarchieExport(["geschosse"], P()).dateien.length === 3
    && hierarchieExport(["waende"], P()).dateien.length === 4);

  // Gebaeudeebene: nur Haus Nord (EG+OG, Waende A/B/C).
  const eb = hierarchieExport(["geschosse", "waende"], P({ ebene: "gebaeude" }));
  ok("#67 Gebaeudeebene: genau die Geschosse und Waende des Gebaeudes",
    eb.dateien.filter((x) => x.name.startsWith("geschosse/")).length === 2
    && eb.dateien.filter((x) => x.name.startsWith("waende/")).length === 3
    && !eb.dateien.some((x) => x.name.includes("w-d"))
    && eb.zipName === "SEMBLA_Export_Gebaeude_" + sicherStamm("Haus Nord"));

  // Geschossebene: Teilmappe + Waende + CSV — und KEINE vollstaendige Projektmappe.
  const eg = hierarchieExport(["geschoss", "gesamt", "waende"], P({ ebene: "geschoss" }));
  ok("#67 Geschossebene: Geschossdaten, Gesamtstueckliste, beide Waende — keine Projektmappe",
    eg.dateien.length === 4
    && eg.dateien.filter((x) => x.name.startsWith("geschosse/")).length === 1
    && eg.dateien.filter((x) => x.name.startsWith("waende/")).length === 2
    && eg.dateien.some((x) => x.name === "Gesamtstueckliste_Geschoss_EG.csv")
    && !eg.dateien.some((x) => x.name.startsWith("SEMBLA_Projektmappe_"))
    && eg.zipName === "SEMBLA_Export_Geschoss_EG");

  // Wandebene: Wanddatei + Baustellenstueckliste, bitgleich der bestehende Wandpfad.
  const ew = hierarchieExport(["wand", "stueckliste"], P({ ebene: "wand" }));
  const sollW = baueDateien(projektObjekt("w-a"), ["stueckliste"], KATALOG);
  ok("#67 Wandebene: Wanddatei + 2 Stuecklisten-CSVs, bitgleich baueDateien",
    ew.dateien.length === 3
    && ew.dateien[0].name === wandPfad({ id: "w-a", name: "Wand A" })
    && ew.dateien[1].data === sollW[0].data && ew.dateien[2].data === sollW[1].data
    && ew.zipName === "SEMBLA_Export_Wand_" + sicherStamm("Wand A"));
  ok("#67 eine unverortete Wand bleibt ohne Mappe exportierbar", (() => {
    const solo = hierarchieExport(["wand"], P({ ebene: "wand", mappe: null }));
    return solo.dateien.length === 1 && solo.luecken.length === 0;
  })());
  ok("#67 geschossTeilmappe zu unbekanntem Geschoss liefert null statt einer erfundenen Mappe",
    geschossTeilmappe(MK, "gs-fremd") === null);
}

// ---- 10. Luecken: fehlendes Wandelement und fehlender Katalog — benannt, nie ersetzt ------
{
  let ML = setzeWand(MK, EG, { id: "w-verwaist", name: "Verwaiste Wand" });
  const ev = hierarchieExport(["waende"], P({ mappe: ML, ebene: "geschoss" }));
  ok("#67 fehlendes Wandelement: Datei fehlt, Luecke nennt Wand und [L-4]",
    ev.dateien.length === 2
    && !ev.dateien.some((x) => x.name.includes("w-verwaist"))
    && ev.luecken.length === 1 && /Verwaiste Wand/.test(ev.luecken[0]) && /L-4/.test(ev.luecken[0]));
  const eg2 = hierarchieExport(["gesamt"], P({ mappe: ML, ebene: "geschoss" }));
  ok("#67 die Gesamtstueckliste meldet ihre Luecken in den Exportluecken mit",
    eg2.luecken.some((l) => /Gesamtstückliste/.test(l) && /Verwaiste Wand/.test(l)));
  const ohneRef = hierarchieExport(["katalog"], P({ mappe: M, katalog: null }));
  ok("#67 kein zugeordneter Katalog: keine Datei, benannter Grund ([L-12])",
    ohneRef.dateien.length === 0 && /kein Bauteilkatalog zugeordnet/.test(ohneRef.luecken[0]));
  const refWeg = hierarchieExport(["katalog"], P({ katalog: null }));
  ok("#67 zugeordneter, aber fehlender Katalog: Kennung wird benannt, Referenz bleibt Sache der Mappe",
    refWeg.dateien.length === 0 && /kat-44/.test(refWeg.luecken[0]) && /nicht gespeichert/.test(refWeg.luecken[0]));
  const stWeg = hierarchieExport(["stueckliste"], P({ ebene: "wand", wandId: "w-verwaist", wandName: "Verwaiste Wand", mappe: ML }));
  ok("#67 Baustellenstueckliste ohne Wandelement: Luecke statt erfundener Datei",
    stWeg.dateien.length === 0 && /L-4/.test(stWeg.luecken[0]));
}

// ==== 11. Mengenfassung der Gesamtstückliste ([P-20], Issue #81) ==========================
// Die manuelle Menge aus Modul 4 ist WANDBEZOGEN. Geprüft wird deshalb an einer Ebene mit
// ZWEI baugleichen Wänden, von denen nur EINE eine Übersteuerung trägt: nur so fällt auf,
// wenn eine Übersteuerung auf die falsche Wand wirkt oder die Aggregation sie doppelt zählt.
{
  const posA = stuecklistePositionen(ELEMENTE["w-a"].wandelement, eingabenFuer(), KATALOG);
  const posI3 = posA.find((p) => p.key === "i3");
  const KENN = mengenKennung(posI3);
  const BER = posI3.menge;                       // berechnete Menge JE WAND
  const UEBER = BER + 7;                         // bewusst != berechnet und != 0
  const FREMD = "rod_std@424242";                // gehört zu keiner gerechneten Position

  /** Nur Wand A trägt Übersteuerungen — Wand B bleibt unangetastet. */
  const mengenA = { [KENN]: UEBER };
  const leserM = (extra = {}) => ({
    ...leser(),
    holeEingaben: (id) => {
      const e = eingabenFuer();
      if (id === "w-a") e.kosten.mengen = { ...mengenA, ...extra };
      return e;
    },
  });
  const umfG = () => umfang(M, "geschoss", Z);
  const zeileI3 = (d) => d.positionen.find((p) => p.key === "i3");

  // (a) BERECHNETE Fassung: bitgleich die bisherigen Mengen, trotz gespeicherter Übersteuerung.
  {
    const dOhne = gesamtDaten(umfG(), leser());                       // ohne Übersteuerung
    const dBer = gesamtDaten(umfG(), leserM());                       // mit, aber berechnet
    ok("#81 berechnete Fassung ist der Default (ohne opts)", dBer.fassung === "berechnet"
      && gesamtDaten(umfG(), leserM(), {}).fassung === "berechnet"
      && gesamtDaten(umfG(), leserM(), { fassung: "quatsch" }).fassung === "berechnet");
    ok("#81 berechnete Fassung: Mengen bitgleich dem bisherigen Pfad",
      gleich(ist(dBer), erwartet(["w-a", "w-b"]))
      && JSON.stringify(dBer.positionen.map((p) => p.menge)) === JSON.stringify(dOhne.positionen.map((p) => p.menge)));
    ok("#81 berechnete Fassung: auch Preise, Status und IDs bleiben unverändert",
      JSON.stringify(dBer.positionen.map((p) => [p.key, p.ep, p.gp, p.status, p.ids.join(" ")]))
      === JSON.stringify(dOhne.positionen.map((p) => [p.key, p.ep, p.gp, p.status, p.ids.join(" ")])));
    ok("#81 berechnete Fassung: keine Zeile ist als manuell gekennzeichnet",
      dBer.positionen.every((p) => p.manuell === false && p.menge_berechnet === p.menge)
      && dBer.mengen.anzahl === 0 && dBer.mengen.fremd.length === 0 && dBer.mengen.ungueltig.length === 0);
    ok("#81 die gespeicherte Übersteuerung wird trotzdem gezählt (sie wirkt hier nur nicht)",
      dBer.mengen.gespeichert === 1);
  }

  // (b) ANGEPASSTE Fassung: wirksame Menge je Wand, berechnete daneben, EP unverändert.
  {
    const dBer = gesamtDaten(umfG(), leserM());
    const dAng = gesamtDaten(umfG(), leserM(), { fassung: "angepasst" });
    const i3Ber = zeileI3(dBer), i3Ang = zeileI3(dAng);
    ok("#81 angepasste Fassung: die Zeile folgt der wirksamen Menge ihrer Wände",
      i3Ang.menge === UEBER + BER && i3Ber.menge === 2 * BER);
    ok("#81 angepasste Fassung: die berechnete Menge steht daneben, nicht an ihrer Stelle",
      i3Ang.menge_berechnet === 2 * BER && i3Ang.manuell === true);
    ok("#81 die Übersteuerung bleibt wandbezogen — nur Wand A ist betroffen", (() => {
      const hA = i3Ang.herkunft.find((h) => h.wandId === "w-a");
      const hB = i3Ang.herkunft.find((h) => h.wandId === "w-b");
      return hA.menge === UEBER && hA.menge_berechnet === BER && hA.manuell === true
        && hB.menge === BER && hB.menge_berechnet === BER && hB.manuell === false;
    })());
    ok("#81 Einzelpreis unverändert nach [P-14], nur der Gesamtpreis folgt",
      i3Ang.ep === i3Ber.ep && i3Ang.produktId === i3Ber.produktId && i3Ang.status === i3Ber.status
      && Math.abs(i3Ang.gp - (UEBER + BER) * i3Ang.ep) < 1e-9);
    ok("#81 jede nicht übersteuerte Zeile bleibt bitgleich der berechneten Fassung",
      dAng.positionen.filter((p) => p.key !== "i3")
        .every((p, i) => p.menge === dBer.positionen.filter((q) => q.key !== "i3")[i].menge && p.manuell === false));
    ok("#81 Zusammenführung und Fertigmaßtrennung bleiben unverändert",
      dAng.positionen.length === dBer.positionen.length
      && JSON.stringify(dAng.positionen.map((p) => [p.key, p.fertigmass_mm, p.produktId]))
        === JSON.stringify(dBer.positionen.map((p) => [p.key, p.fertigmass_mm, p.produktId])));
    ok("#81 die Aggregation schreibt keine Übersteuerung zurück",
      JSON.stringify(mengenA) === JSON.stringify({ [KENN]: UEBER }));
  }

  // (c) Die Datei benennt ihre Fassung im Kopf und führt beide Mengen nebeneinander.
  {
    const dBer = gesamtDaten(umfG(), leserM());
    const dAng = gesamtDaten(umfG(), leserM(), { fassung: "angepasst" });
    const aoaBer = gesamtstuecklisteAoa(dBer, { datum: "01.01.2026" });
    const aoaAng = gesamtstuecklisteAoa(dAng, { datum: "01.01.2026" });
    const zeile = (aoa) => aoa.find((z) => z[0] === "Mengen");
    ok("#81 die berechnete Fassung benennt sich und sagt, dass die Übersteuerung nicht wirkt",
      /^berechnet – abgeleitet aus dem Wandelement/.test(zeile(aoaBer)[1])
      && /1 gespeicherte Übersteuerung\(en\) NICHT angewandt/.test(zeile(aoaBer)[1]));
    ok("#81 die angepasste Fassung benennt sich im Kopf",
      /^angepasst – mit den manuellen Mengen aus Modul 4/.test(zeile(aoaAng)[1])
      && /1 von \d+ Zeile\(n\) betroffen, 1 manuelle Menge\(n\)/.test(zeile(aoaAng)[1]));
    const kopfBer = aoaBer.find((z) => z[0] === "Einbauteil");
    const kopfAng = aoaAng.find((z) => z[0] === "Einbauteil");
    ok("#81 nur die angepasste Fassung hat die Spalte „Menge berechnet“",
      !kopfBer.includes("Menge berechnet") && kopfAng.includes("Menge berechnet")
      && kopfAng.indexOf("Menge berechnet") === kopfAng.indexOf("Menge") + 1
      && kopfAng.includes("Mengenherkunft"));
    ok("#81 „Mengenherkunft“ (manuell/berechnet) bleibt — sie ist nicht die Wandherkunft",
      kopfAng.indexOf("Mengenherkunft") === kopfAng.indexOf("Menge berechnet") + 1
      && !kopfAng.includes("Wände (Herkunft)"));
    ok("#81 auch in der angepassten Fassung stehen EP/GP vor „Produkt (Katalog)“",
      kopfAng.indexOf("GP (EUR)") === kopfAng.indexOf("Produkt (Katalog)") - 1
      && kopfAng.indexOf("EP (EUR)") === kopfAng.indexOf("GP (EUR)") - 1);
    ok("#81 die Zeile trägt wirksame und berechnete Menge nebeneinander", (() => {
      const z = aoaAng.slice(aoaAng.indexOf(kopfAng) + 1).find((r) => r[0] === zeileI3(dAng).label);
      const i = kopfAng.indexOf("Menge");
      return z[i] === UEBER + BER && z[i + 1] === 2 * BER && z[i + 2] === "manuell";
    })());
    ok("#81 der Summenbetrag steht auch in der breiteren Fassung unter seiner Spalte", (() => {
      const s = aoaAng.find((r) => String(r[0]).startsWith("Summe netto"));
      return s.length === kopfAng.length && typeof s[kopfAng.indexOf("GP (EUR)")] === "number";
    })());
    ok("#81 der Preisschalter wirkt in beiden Fassungen gleich", (() => {
      const ohne = gesamtstuecklisteAoa(dAng, { datum: "01.01.2026", preise: false });
      const k = ohne.find((z) => z[0] === "Einbauteil");
      return k.includes("Menge berechnet") && !k.includes("EP (EUR)") && k.length === kopfAng.length - 2;
    })());
  }

  // (d) Nicht anwendbare Übersteuerung: MIT WANDBEZUG benannt, nie angewandt ([P-9]).
  {
    const dAng = gesamtDaten(umfG(), leserM({ [FREMD]: 5 }), { fassung: "angepasst" });
    ok("#81 nicht zuordenbare Übersteuerung wird mit Wandbezug gemeldet",
      dAng.mengen.fremd.length === 1 && dAng.mengen.fremd[0].kennung === FREMD
      && dAng.mengen.fremd[0].wandId === "w-a" && dAng.mengen.fremd[0].wand === "Wand A"
      && /Haus Nord › EG › Wand A/.test(dAng.mengen.fremd[0].pfad));
    ok("#81 sie wird nicht angewandt — die Mengen bleiben wie ohne sie", (() => {
      const rein = gesamtDaten(umfG(), leserM(), { fassung: "angepasst" });
      return JSON.stringify(dAng.positionen.map((p) => p.menge)) === JSON.stringify(rein.positionen.map((p) => p.menge));
    })());
    ok("#81 sie ist KEINE Lücke im Sinne der Vollständigkeit (es fehlt keine Wand)",
      dAng.luecken.length === 0 && dAng.vollstaendig === true && /vollständig/.test(standText(dAng)));
    const csv = gesamtstuecklisteCsv(dAng, { datum: "01.01.2026" });
    ok("#81 der Dateikopf nennt sie mit Wand und Kennung",
      new RegExp("Übersteuerung nicht zuordenbar;Wand A;" + FREMD + ";").test(csv));
    ok("#81 vor dem Download wird sie als Lücke mit Wandbezug benannt", (() => {
      const l = gesamtMengenLuecken(dAng);
      return l.length === 1 && /Gesamtstückliste, „Wand A“/.test(l[0]) && /nicht angewandt/.test(l[0]);
    })());
    // Unzulässiger Wert: benannt, nie gerundet, nie gelöscht.
    const dBad = gesamtDaten(umfG(), leserM({ [KENN]: 2.5 }), { fassung: "angepasst" });
    ok("#81 unzulässig gespeicherter Wert: benannt mit Wandbezug, es gilt die berechnete Menge",
      dBad.mengen.ungueltig.length === 1 && dBad.mengen.ungueltig[0].wand === "Wand A"
      && dBad.mengen.ungueltig[0].kennung === KENN && zeileI3(dBad).menge === 2 * BER);
    ok("#81 der Dateikopf nennt auch den unzulässigen Wert",
      /Übersteuerung unzulässig;Wand A;/.test(gesamtstuecklisteCsv(dBad, { datum: "01.01.2026" })));
  }

  // (e) Ein Exportlauf, EINE Fassung — für Wand- und Gesamtstückliste (Muss 5).
  {
    const PM = (ueber = {}) => P({ ...leserM(), ebene: "geschoss", ...ueber });
    const egBer = hierarchieExport(["gesamt"], PM());
    const egAng = hierarchieExport(["gesamt"], PM({ fassung: "angepasst" }));
    ok("#81 der Export reicht die Fassung an die Gesamtstückliste durch", (() => {
      const soll = gesamtstuecklisteDateien(
        gesamtDaten(umfang(MK, "geschoss", Z), leserM(), { fassung: "angepasst" }),
        { preise: true, rumpf: "Gesamtstueckliste_Geschoss_EG" })[0];
      return egAng.dateien[0].data === soll.data && egAng.dateien[0].data !== egBer.dateien[0].data;
    })());
    ok("#81 ohne Angabe bleibt die Gesamtstückliste bitgleich dem bisherigen Stand", (() => {
      const soll = gesamtstuecklisteDateien(
        gesamtDaten(umfang(MK, "geschoss", Z), leserM()),
        { preise: true, rumpf: "Gesamtstueckliste_Geschoss_EG" })[0];
      return egBer.dateien[0].data === soll.data;
    })());
    // Beide Stücklistenarten in EINEM Lauf: dieselbe Fassung, geprüft an den Bytes.
    const MW = setzeWand(MK, EG, { id: "w-a", name: "Wand A" });
    const beides = hierarchieExport(["gesamt", "waende"], PM({ mappe: MW, fassung: "angepasst" }));
    ok("#81 ein Exportlauf verwendet für alle Stücklistendateien dieselbe Fassung", (() => {
      const gs = beides.dateien.find((x) => x.name.endsWith(".csv"));
      return /\nMengen;angepasst – mit den manuellen Mengen aus Modul 4/.test(gs.data);
    })());
    const wandAng = hierarchieExport(["stueckliste"], P({ ...leserM(), ebene: "wand", fassung: "angepasst" }));
    ok("#81 dieselbe Wahl trägt auch die Baustellenstückliste der Wand",
      /\nMengen;angepasst – mit den manuellen Mengen aus Modul 4/.test(wandAng.dateien[0].data));
    ok("#81 die Einzelteilliste bleibt in beiden Fassungen abgeleitet und sagt das", (() => {
      const berW = hierarchieExport(["stueckliste"], P({ ...leserM(), ebene: "wand" }));
      return wandAng.dateien[1].data === berW.dateien[1].data
        && /\nMengen;berechnet – Einzelteile werden stets abgeleitet/.test(wandAng.dateien[1].data);
    })());
    ok("#81 nicht anwendbare Übersteuerungen stehen auch im Export vor dem Download", (() => {
      const mitFremd = hierarchieExport(["gesamt"], P({
        ...leserM({ [FREMD]: 5 }), ebene: "geschoss", fassung: "angepasst",
      }));
      return mitFremd.luecken.some((l) => /Gesamtstückliste, „Wand A“/.test(l) && l.includes(FREMD));
    })());
    ok("#81 in der berechneten Fassung wird nichts als Lücke gemeldet, was nicht wirkt", (() => {
      const berFremd = hierarchieExport(["gesamt"], P({ ...leserM({ [FREMD]: 5 }), ebene: "geschoss" }));
      return !berFremd.luecken.some((l) => l.includes(FREMD));
    })());
  }
}

// ==== 12. Manuelle Menge der GESCHOSSEBENE ([P-20], Issue #81) =============================
// Die Uebersteuerung gilt hier der AGGREGIERTEN Zeile und liegt am Geschoss der Projektmappe.
// Geprueft wird am REALEN Pfad: Mappe ueber die reine Operation -> umfang()/gesamtDaten() ->
// angepasste Geschossdatei ueber hierarchieExport, und zwar am erzeugten Zeileninhalt.
{
  const posA = stuecklistePositionen(ELEMENTE["w-a"].wandelement, eingabenFuer(), KATALOG);
  const posI3 = posA.find((p) => p.key === "i3");
  const KENN = mengenKennung(posI3);                 // „i3@-“
  const BER_JE_WAND = posI3.menge;
  const BER_GESAMT = 2 * BER_JE_WAND;                // Geschoss EG traegt Wand A und B
  const EBENEN_MENGE = BER_GESAMT + 11;              // != berechnet und != 0
  const FREMD = "rod_std@424242";
  const EP = posI3.ep;

  const Zg = { wandId: "w-a", geschossId: EG, gebaeudeId: GEB1 };
  // Die Mappe bekommt die Uebersteuerung ueber die NEUE reine Operation — kein Handgriff
  // am Objekt, damit der Test denselben Weg geht wie Modul 4.
  const MG = setzeGeschossMenge(MK, EG, KENN, EBENEN_MENGE);
  const roh = (m) => geschossMengen(m, EG);
  const d = (mappe, opts) => gesamtDaten(umfang(mappe, "geschoss", Zg), leser(),
    { ...(opts || {}), ebenenMengen: roh(mappe) });
  const zeileI3 = (dat) => dat.positionen.find((p) => p.key === "i3");
  const csvZeile = (dat, praefix) => gesamtstuecklisteCsv(dat, { datum: "01.01.2026" })
    .split("\n").find((z) => z.startsWith(praefix));

  // (a) Angepasste Fassung: wirksame Menge, berechnete daneben, GP folgt, EP unveraendert.
  {
    const dOhne = gesamtDaten(umfang(MK, "geschoss", Zg), leser());
    const dBer = d(MG);
    const dAng = d(MG, { fassung: "angepasst" });
    const i3 = zeileI3(dAng);
    ok("#81 Geschoss: die aggregierte Zeile folgt der manuellen Menge des Geschosses",
      i3.menge === EBENEN_MENGE && zeileI3(dBer).menge === BER_GESAMT);
    ok("#81 Geschoss: die berechnete Menge steht daneben, nicht an ihrer Stelle",
      i3.menge_berechnet === BER_GESAMT && i3.manuell_ebene === true);
    ok("#81 Geschoss: der Gesamtpreis folgt der wirksamen Menge bei unveraendertem Einzelpreis",
      i3.ep === EP && Math.abs(i3.gp - EBENEN_MENGE * EP) < 1e-9);
    ok("#81 Geschoss: jede andere Zeile bleibt bitgleich der berechneten Fassung",
      JSON.stringify(dAng.positionen.filter((p) => p.key !== "i3").map((p) => [p.key, p.menge, p.gp]))
      === JSON.stringify(dBer.positionen.filter((p) => p.key !== "i3").map((p) => [p.key, p.menge, p.gp])));
    ok("#81 Geschoss: die WANDbezogenen Herkuenfte bleiben unangetastet auflösbar",
      i3.herkunft.length === 2 && i3.herkunft.every((h) => h.menge === BER_JE_WAND));
    ok("#81 Geschoss: die Summe folgt der wirksamen Menge (kein zweiter Mengenstand)",
      Math.abs(dAng.summe.summe - (dBer.summe.summe + (EBENEN_MENGE - BER_GESAMT) * EP)) < 1e-9);
    ok("#81 Geschoss: die Aggregation schreibt nichts in die Mappe zurueck",
      roh(MG)[KENN] === EBENEN_MENGE && Object.keys(roh(MG)).length === 1);
    // In der berechneten Fassung wird die Zeile NICHT ANGEFASST — sie traegt deshalb nicht
    // einmal ein `manuell_ebene: false`. Genau das ist der Nachweis der Byte-Gleichheit.
    ok("#81 Geschoss: die berechnete Fassung ist wertgleich dem Stand ohne Uebersteuerung",
      gleich(ist(dBer), ist(dOhne)) && zeileI3(dBer).manuell_ebene === undefined
      && dBer.mengen.ebene.anzahl === 0 && dBer.mengen.ebene.gespeichert === 1
      && JSON.stringify(dBer.positionen) === JSON.stringify(dOhne.positionen));

    // Die Datei ist der eigentliche Nachweis: beide Werte gleichzeitig in einer Zeile.
    const zAng = csvZeile(dAng, "Stein i3");
    const zBer = csvZeile(dBer, "Stein i3");
    ok("#81 Geschoss: die angepasste Datei traegt wirksame UND berechnete Menge",
      zAng.includes(";" + EBENEN_MENGE + ";" + BER_GESAMT + ";manuell (Geschoss);"));
    ok("#81 Geschoss: die Datei nennt die Herkunft der Uebersteuerung als Geschoss",
      /;manuell \(Geschoss\);/.test(zAng) && !/;manuell;/.test(zAng));
    ok("#81 Geschoss: der Dateikopf zaehlt Wand- und Geschossherkunft getrennt",
      /\nMengen Geschoss;1 von \d+ Zeile\(n\) mit manueller Menge des Geschosses \(1 gespeichert\)/
        .test(gesamtstuecklisteCsv(dAng, { datum: "01.01.2026" }))
      && /\nMengen;angepasst – mit den manuellen Mengen aus Modul 4 · 0 von/
        .test(gesamtstuecklisteCsv(dAng, { datum: "01.01.2026" })));
    ok("#81 Geschoss: die berechnete Fassung sagt, dass die Uebersteuerung nicht wirkt",
      /\nMengen Geschoss;1 gespeicherte Übersteuerung\(en\) des Geschosses NICHT angewandt/
        .test(gesamtstuecklisteCsv(dBer, { datum: "01.01.2026" }))
      && zBer.includes(";" + BER_GESAMT + ";"));
  }

  // (b) Ruecksetzen: der Schluessel ist weg, die Ausgabe ist der Ausgangsstand.
  {
    const zurueck = setzeGeschossMenge(MG, EG, KENN, null);
    ok("#81 Geschoss: Ruecksetzen entfernt den Schluessel vollstaendig",
      !Object.prototype.hasOwnProperty.call(roh(zurueck), KENN)
      && JSON.stringify(mappeObjekt(zurueck)) === JSON.stringify(mappeObjekt(MK)));
    const dOhne = gesamtDaten(umfang(MK, "geschoss", Zg), leser());
    ok("#81 Geschoss: danach ist die berechnete Fassung wertgleich dem Stand ohne Uebersteuerung",
      gesamtstuecklisteCsv(d(zurueck), { datum: "01.01.2026" })
      === gesamtstuecklisteCsv(dOhne, { datum: "01.01.2026" }));
    ok("#81 Geschoss: und auch die angepasste Fassung uebersteuert dann nichts",
      d(zurueck, { fassung: "angepasst" }).positionen.every((p) => p.manuell_ebene === false));
  }

  // (c) Nicht zuordenbar, unzulaessig, mehrdeutig — benannt und NICHT angewandt ([P-9]).
  {
    const mitFremd = setzeGeschossMenge(MG, EG, FREMD, 5);
    const dF = d(mitFremd, { fassung: "angepasst" });
    ok("#81 Geschoss: eine nicht zuordenbare Kennung wird namentlich gemeldet",
      dF.mengen.ebene.fremd.length === 1 && dF.mengen.ebene.fremd[0] === FREMD);
    ok("#81 Geschoss: sie wird nicht angewandt und ist keine Vollstaendigkeitsluecke",
      dF.positionen.filter((p) => p.manuell_ebene).length === 1
      && dF.luecken.length === 0 && dF.vollstaendig === true);
    ok("#81 Geschoss: die Datei nennt sie mit Kennung, ohne Wandnamen",
      /\nGeschoss-Übersteuerung nicht zuordenbar;;rod_std@424242;/
        .test(gesamtstuecklisteCsv(dF, { datum: "01.01.2026" })));
    ok("#81 Geschoss: sie bleibt gespeichert (nicht geloescht, nicht umgehaengt)",
      roh(mitFremd)[FREMD] === 5);

    // Ein unzulaessig GESPEICHERTER Wert (etwa aus einer fremden Datei) — die reine
    // Operation nimmt ihn nicht an, die Mappe kann ihn aber tragen.
    const mitMuell = JSON.parse(JSON.stringify(mappeObjekt(MK)));
    for (const g of mitMuell.gebaeude) {
      for (const gs of g.geschosse) if (gs.id === EG) gs.mengen = { [KENN]: "viele" };
    }
    const dU = gesamtDaten(umfang(mitMuell, "geschoss", Zg), leser(),
      { fassung: "angepasst", ebenenMengen: geschossMengen(mitMuell, EG) });
    ok("#81 Geschoss: ein unzulaessiger Wert wird benannt, es gilt die berechnete Menge",
      dU.mengen.ebene.ungueltig.length === 1
      && dU.mengen.ebene.ungueltig[0].kennung === KENN
      && zeileI3(dU).menge === BER_GESAMT && zeileI3(dU).manuell_ebene === false);
    ok("#81 Geschoss: die Datei nennt auch ihn",
      /\nGeschoss-Übersteuerung unzulässig;;i3@-;/
        .test(gesamtstuecklisteCsv(dU, { datum: "01.01.2026" })));
    ok("#81 Geschoss: er wird von der Ableitung nicht bereinigt",
      geschossMengen(mitMuell, EG)[KENN] === "viele"
      && validiereMappe(mitMuell).length === 0);

    // MEHRDEUTIG: dieselbe Positionskennung, zwei gefaltete Zeilen (Wand B ohne
    // Steinauswahl -> anderer Auflösungsstatus und kein EP). Dann wirkt sie auf KEINE.
    {
      const leserZwei = () => ({
        ...leser(),
        holeEingaben: (id) => {
          const e = eingabenFuer();
          if (id === "w-b") e.planung.produkte.rollen.i3 = [];
          return e;
        },
      });
      const dM = gesamtDaten(umfang(MG, "geschoss", Zg), leserZwei(),
        { fassung: "angepasst", ebenenMengen: roh(MG) });
      const i3Zeilen = dM.positionen.filter((p) => p.key === "i3");
      ok("#81 Geschoss: die Faltung erzeugt hier wirklich zwei Zeilen derselben Kennung",
        i3Zeilen.length === 2 && i3Zeilen.every((p) => mengenKennung(p) === KENN));
      ok("#81 Geschoss: eine mehrdeutige Kennung wird gemeldet, nicht angewandt",
        dM.mengen.ebene.mehrdeutig.length === 1
        && dM.mengen.ebene.mehrdeutig[0].kennung === KENN
        && dM.mengen.ebene.mehrdeutig[0].zeilen === 2
        && dM.mengen.ebene.anzahl === 0
        && i3Zeilen.every((p) => p.manuell_ebene === false && p.menge === p.menge_berechnet));
      ok("#81 Geschoss: keine Doppelwirkung und keine stille Wahl",
        i3Zeilen.reduce((a, p) => a + p.menge, 0) === BER_GESAMT
        && i3Zeilen.every((p) => p.__emehrdeutig === true));
      ok("#81 Geschoss: die Datei nennt die Mehrdeutigkeit mit Zeilenzahl",
        /\nGeschoss-Übersteuerung mehrdeutig;;i3@-;.*2 Zeilen tragen diese Positionskennung/
          .test(gesamtstuecklisteCsv(dM, { datum: "01.01.2026" })));
    }
  }

  // (d) must_not 4: Gebaeude- und Projektebene bleiben unberuehrt — nicht angewandt,
  // nicht gezaehlt, nicht erwaehnt, und die Datei ist BYTE-gleich.
  {
    for (const ebene of ["gebaeude", "projekt"]) {
      const ohne = gesamtDaten(umfang(MK, ebene, Zg), leser(), { fassung: "angepasst" });
      const mit = gesamtDaten(umfang(MG, ebene, Zg), leser(),
        { fassung: "angepasst", ebenenMengen: roh(MG) });
      ok(`#81 ${ebene}: die Geschoss-Uebersteuerung wirkt dort nicht und wird nicht gezaehlt`,
        mit.mengen.ebene === null && ohne.mengen.ebene === null
        && mit.positionen.every((p) => !p.manuell_ebene));
      ok(`#81 ${ebene}: die Datei ist byte-gleich dem Stand ohne Uebersteuerung`,
        gesamtstuecklisteCsv(mit, { datum: "01.01.2026" })
        === gesamtstuecklisteCsv(ohne, { datum: "01.01.2026" }));
    }
    const wandEbene = gesamtDaten(umfang(MG, "wand", Zg), leser(),
      { fassung: "angepasst", ebenenMengen: roh(MG) });
    ok("#81 wand: die Geschoss-Uebersteuerung erreicht die Wandebene nicht",
      wandEbene.mengen.ebene === null && wandEbene.positionen.every((p) => !p.manuell_ebene));
  }

  // (e) Der REALE Exportpfad: hierarchieExport liest die Mappe selbst und reicht durch.
  {
    const PG = (ueber = {}) => P({ mappe: MG, ebene: "geschoss", ...ueber });
    const ang = hierarchieExport(["gesamt"], PG({ fassung: "angepasst" }));
    const ber = hierarchieExport(["gesamt"], PG());
    const csvVon = (erg) => erg.dateien.find((x) => x.name.endsWith(".csv")).data;
    ok("#81 Export: die angepasste Geschossdatei traegt die manuelle Menge des Geschosses",
      csvVon(ang).split("\n").find((z) => z.startsWith("Stein i3"))
        .includes(";" + EBENEN_MENGE + ";" + BER_GESAMT + ";manuell (Geschoss);"));
    ok("#81 Export: die berechnete Geschossdatei traegt die abgeleitete Menge",
      csvVon(ber).split("\n").find((z) => z.startsWith("Stein i3")).includes(";" + BER_GESAMT + ";"));
    ok("#81 Export: die Datei ist bitgleich der direkten Ableitung (kein zweiter Pfad)",
      csvVon(ang) === gesamtstuecklisteCsv(
        gesamtDaten(umfang(MG, "geschoss", { ...Zg }), leser(),
          { fassung: "angepasst", ebenenMengen: roh(MG) }),
        { datum: csvVon(ang).split("\n").find((z) => z.startsWith("Datum;")).slice(6) }));
    ok("#81 Export: ohne Mappe/Geschossbezug bleibt die Ableitung bitgleich dem Altstand",
      csvVon(hierarchieExport(["gesamt"], P({ mappe: MK, ebene: "geschoss", fassung: "angepasst" })))
      === csvVon(hierarchieExport(["gesamt"], PG({ mappe: MK, fassung: "angepasst" }))));
    ok("#81 Export: eine nicht anwendbare Geschoss-Uebersteuerung steht VOR dem Download",
      hierarchieExport(["gesamt"],
        P({ mappe: setzeGeschossMenge(MG, EG, FREMD, 5), ebene: "geschoss", fassung: "angepasst" }))
        .luecken.some((l) => /Gesamtstückliste \(Geschoss\)/.test(l) && l.includes(FREMD)));
    ok("#81 Export: in der berechneten Fassung wird nichts als Luecke gemeldet, was nicht wirkt",
      !hierarchieExport(["gesamt"],
        P({ mappe: setzeGeschossMenge(MG, EG, FREMD, 5), ebene: "geschoss" }))
        .luecken.some((l) => l.includes(FREMD)));
    ok("#81 Export: gesamtMengenLuecken nennt Geschoss-Eintraege ohne Wandnamen",
      gesamtMengenLuecken(d(setzeGeschossMenge(MG, EG, FREMD, 5), { fassung: "angepasst" }))
        .every((l) => !/„undefined“|, „“/.test(l)));
  }

  // (f) Die Verrechnung selbst: in der berechneten Fassung wird NICHTS angefasst.
  {
    const zeilen = [{ key: "i3", label: "Stein i3", menge: 5, menge_berechnet: 5, ep: 2, gp: 10, fertigmass_mm: null }];
    const e = wirksameEbenenMengen(zeilen, { "i3@-": 9 }, { anwenden: false });
    ok("#81 wirksameEbenenMengen: berechnete Fassung laesst die Zeilen unberuehrt",
      e.positionen === zeilen && e.anzahl === 0 && e.gespeichert === 1
      && e.fremd.length === 0 && e.ungueltig.length === 0 && e.mehrdeutig.length === 0);
    const a = wirksameEbenenMengen(zeilen, { "i3@-": 9 }, { anwenden: true });
    ok("#81 wirksameEbenenMengen: angepasste Fassung setzt Menge und GP, nie den EP",
      a.positionen[0].menge === 9 && a.positionen[0].menge_berechnet === 5
      && a.positionen[0].gp === 18 && a.positionen[0].ep === 2 && a.anzahl === 1
      && zeilen[0].menge === 5);
    ok("#81 wirksameEbenenMengen: ohne gespeicherte Menge bleibt alles wie berechnet",
      wirksameEbenenMengen(zeilen, null, { anwenden: true }).positionen[0].menge === 5);
  }
}

let fail = 0; for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`); process.exit(fail ? 1 : 0);
