// Regressionstest der GESAMTSTÜCKLISTE über die aktiven Projektstufen (Issue #44).
//
// Geprueft wird die reine Ableitung (docs/shared/sembla-gesamtstueckliste.js) und ihre
// Dateiform (gesamtstuecklisteAoa/-Csv in sembla-export.js) — DOM-frei, ohne localStorage.
//
// Die Messlatte ist ueberall dieselbe: JEDE Ebene muss exakt der Summe der einzelnen
// `stuecklistePositionen`-Aufrufe ihrer Waende entsprechen. Wo das nicht gilt, waere ein
// zweites Mengenmodell entstanden — genau das soll der Test unmoeglich machen.
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { standardEingaben } from "../../docs/shared/storage.js";
import { stuecklistePositionen, gesamtstuecklisteAoa, gesamtstuecklisteCsv } from "../../docs/shared/sembla-export.js";
import {
  EBENEN, ebeneTitel, umfang, gesamtDaten, standText, herkunftText, dateiRumpf,
} from "../../docs/shared/sembla-gesamtstueckliste.js";
import {
  leereMappe, fuegeGebaeudeHinzu, fuegeGeschossHinzu, setzeWand,
} from "../../docs/shared/sembla-projektmappe.js";

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
  ok("CSV nennt Herkunft und qualifizierte IDs",
    kopfMit.includes("Wände (Herkunft)") && kopfMit.includes("Einbauteil-IDs (Wand-ID:ID)"));
  ok("Preisschalter entfernt genau EP und GP",
    kopfMit.includes("EP (EUR)") && kopfMit.includes("GP (EUR)")
    && !kopfOhne.includes("EP (EUR)") && !kopfOhne.includes("GP (EUR)")
    && kopfMit.length - 2 === kopfOhne.length);
  ok("Preisschalter entfernt den Summenbetrag",
    mitPreis.some(z => String(z[0]).startsWith("Summe netto"))
    && !ohnePreis.some(z => String(z[0]).startsWith("Summe netto")));
  ok("Preisschalter lässt Mengen, Herkunft und IDs unverändert", (() => {
    const spalten = (aoa, kopf) => aoa.slice(aoa.indexOf(kopf) + 1)
      .filter(z => z.length > 1 && !String(z[0]).startsWith("Summe netto"))
      .map(z => [z[0], z[3], z[4], z[5], z[6]].join("|"));
    return JSON.stringify(spalten(mitPreis, kopfMit)) === JSON.stringify(spalten(ohnePreis, kopfOhne));
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

let fail = 0; for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`); process.exit(fail ? 1 : 0);
