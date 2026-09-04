// Regressionstests der Zuschnitt-/Kombinationsregeln [Z-1] … [Z-5] (Issue #35).
//
// Geprueft wird die KANONISCHE Kette: kombiniereLaengen (Core) -> Segment-Stueckliste ->
// BOM-Positionen je Standardlaenge -> Preisauflösung je Position -> Montage-Kopplungshoehen,
// dazu die Latten-Seite (Fertigmaß aus Geometrie, Ausgangsprodukt aus dem Katalog).
//
// Leitfall aus dem Live-Feedback zu #35: eine Strecke von 170 cm bei gewaehlten Standardgroessen
// 100 cm und 50 cm ergibt 100 + 50 + 20, wobei die 20 cm ein gekennzeichneter Sonderzuschnitt
// aus dem kleinsten geeigneten Ausgangsprodukt (50 cm) sind.
import { readFileSync } from "node:fs";
import {
  buildWall, Opening, kombiniereLaengen, kombiniereSegment, quelleFuerMass, normLaengen,
  MIN_FERTIGMASS_MM,
} from "../../docs/shared/sembla-core.js";
import { semblaBom, semblaBomItems } from "../../docs/shared/sembla-bom.js";
import { berechneAufbau } from "../../docs/shared/sembla-aufbau.js";
import { montageEreignisse } from "../../docs/shared/sembla-montage.js";
import { stuecklistePositionen, stuecklisteSumme, zuschnittCsv } from "../../docs/shared/sembla-export.js";
import { produktSpezifikation, rollenStatus, preisKontext, parseKatalog } from "../../docs/shared/sembla-katalog.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL  " + n); } };
const kurz = (st) => st.stuecke.map(s => s.len_mm + (s.art === "sonder" ? "S/" + s.quelle_mm : "")).join("+");

// ---------------------------------------------------------------- [Z-2] Kombination
console.log("[Z-2] Kombination der ausgewaehlten Standardgroessen:");
{
  const r = kombiniereLaengen(1700, [1000, 500]);
  ok("Originalfall 170 cm aus 100/50 -> 100+50+20", kurz(r) === "1000+500+200S/500");
  ok("Originalfall: kein Konflikt", r.konflikt === null);
  ok("Originalfall: Summe = Bedarf", r.stuecke.reduce((a, s) => a + s.len_mm, 0) === 1700);
  ok("Originalfall: genau ein Sonderzuschnitt", r.stuecke.filter(s => s.art === "sonder").length === 1);
  ok("Originalfall: Reihenfolge groesste zuerst",
    r.stuecke[0].len_mm === 1000 && r.stuecke[1].len_mm === 500);
}
{
  // Reihenfolge der Eingabe darf das Ergebnis nicht beeinflussen (Determinismus).
  const a = kurz(kombiniereLaengen(1700, [500, 1000])), b = kurz(kombiniereLaengen(1700, [1000, 500, 1000]));
  ok("Determinismus: Eingabereihenfolge/Doppelte ohne Wirkung", a === "1000+500+200S/500" && b === a);
}
{
  const r = kombiniereLaengen(3000, [1000]);
  ok("exakt teilbar -> nur Standardstuecke", kurz(r) === "1000+1000+1000" && r.konflikt === null);
}
{
  // 600 mm aus {1000, 500}: jede Kombination laesst 100 mm uebrig (600 = 500 + 100). Es gibt
  // keine regelkonforme Loesung -> die Groessenpraeferenz bleibt und der Konflikt wird GEMELDET
  // (nie still ein 100-mm-Stueck als waere es einbaubar).
  const r = kombiniereLaengen(600, [1000, 500]);
  ok("unloesbarer Rest wird gemeldet statt still ausgegeben",
    r.konflikt === "mindestmass" && kurz(r) === "500+100S/500");
  ok("Bedarf bleibt vollstaendig gedeckt", r.stuecke.reduce((a, s) => a + s.len_mm, 0) === 600);
}
{
  const r = kombiniereLaengen(400, [1000]);
  ok("Bedarf kleiner als kleinste Groesse -> ein Sonderzuschnitt", kurz(r) === "400S/1000");
  ok("Sonderzuschnitt kennt sein Ausgangsprodukt", r.stuecke[0].quelle_mm === 1000);
}
ok("ohne Standardlaenge: Konflikt statt erfundener Laenge",
  kombiniereLaengen(1700, []).konflikt === "keine_standardlaenge" && kombiniereLaengen(1700, []).stuecke.length === 0);

// ---------------------------------------------------------------- [Z-5] Mindest-Fertigmaß
console.log("[Z-5] Mindest-Fertigmaß 200 mm:");
{
  const r = kombiniereLaengen(1200, [1100]);
  ok("nur EINE Standardlaenge: 100-mm-Reststueck bleibt, wird aber gemeldet",
    kurz(r) === "1100+100S/1100" && r.konflikt === "mindestmass");
  const alt = kombiniereLaengen(1200, [1100, 500]);
  ok("weitere Standardlaenge loest den Konflikt regelbasiert",
    alt.konflikt === null && alt.stuecke.every(s => s.len_mm >= MIN_FERTIGMASS_MM));
  ok("Umplanung bleibt vollstaendig (Summe = Bedarf)",
    alt.stuecke.reduce((a, s) => a + s.len_mm, 0) === 1200);
  ok("Umplanung nutzt weiter echte Standardgroessen zuerst", alt.stuecke[0].art === "standard");
}
ok("quelleFuerMass = kleinstes geeignetes Ausgangsprodukt",
  quelleFuerMass(400, [1000, 500, 300]) === 500 && quelleFuerMass(1500, [1000, 500]) === null);
ok("normLaengen: dedupliziert und absteigend",
  JSON.stringify(normLaengen([500, 1000, 500, 0, -3])) === "[1000,500]");

// ---------------------------------------------------------------- [Z-3] Core-Segmente
console.log("[Z-3] Segment-Stueckliste im Wandelement:");
{
  const w = buildWall("kombi", 1000, 3400, [], null, { rod_lengths_mm: [1000, 500] });
  const sg = w.tension_columns[0].segments[0];
  ok("Wandelement fuehrt den Laengensatz mit", JSON.stringify(w.prestress.rod_lengths_mm) === "[1000,500]");
  ok("rod_mm = groesste gewaehlte Standardlaenge", w.rod_mm === 1000);
  ok("Segment 3,40 m -> 1000+1000+1000+400S", kurz({ stuecke: sg.stuecke }) === "1000+1000+1000+400S/500");
  ok("Stueckzahl = Laenge der Stueckliste", sg.gewindestangen === sg.stuecke.length);
  ok("Kopplungen = Stuecke − 1", sg.verbindungsmuttern === sg.stuecke.length - 1);
  ok("Stuecke ergeben genau die Segmenthoehe",
    sg.stuecke.reduce((a, s) => a + s.len_mm, 0) === sg.z1_mm - sg.z0_mm);
  ok("Verschnitt = Ausgangsprodukte − Bedarf",
    sg.verschnitt_mm === sg.stuecke.reduce((a, s) => a + s.quelle_mm, 0) - (sg.z1_mm - sg.z0_mm));
  // [Z-6]: Diese Wand waehlt kein Reststueck. Die Zerlegung bleibt bit-genau wie zuvor, der
  // offene obere Abschluss wird aber sichtbar gemeldet — statt still eine Laenge zu erfinden.
  ok("ohne Reststueck: Zerlegung unveraendert, oberer Abschluss gemeldet",
    w.validation.zuschnitt_konflikte.length === w.tension_columns.length
    && w.validation.zuschnitt_konflikte.every(k => k.grund === "kein_reststueck"));
  ok("ohne Reststueck: weiterhin baubar (Meldung, kein Ausschluss)", w.validation.buildable === true);
}
{
  // Rueckwaertskompatibilitaet: ein einelementiger Satz muss bit-genau das Altergebnis liefern.
  for (const h of [2000, 2200, 2400, 2600, 3000]) {
    const alt = buildWall("alt", 1000, h, []), neu = buildWall("neu", 1000, h, [], null, { rod_mm: 1100 });
    const sa = alt.tension_columns[0].segments[0], sn = neu.tension_columns[0].segments[0];
    const st = Math.ceil(h / 1100);
    ok(`Fallback h=${h}: Stangen/letzte/Verschnitt wie bisher`,
      sa.gewindestangen === st && sa.letzte_stange_mm === h - (st - 1) * 1100
      && sa.verschnitt_mm === st * 1100 - h && sn.gewindestangen === st);
  }
}
{
  const w = buildWall("konflikt", 1000, 1200, []);
  ok("[Z-5] Konflikt landet sichtbar in validation", w.validation.zuschnitt_konflikte.length > 0
    && w.validation.zuschnitt_konflikte[0].grund === "mindestmass");
  ok("[Z-5] Konflikt ist kein Baubarkeitsausschluss", w.validation.buildable === true);
  ok("[Z-5] Konflikt nennt das betroffene Fertigmaß", w.validation.zuschnitt_konflikte[0].fertigmass_mm === 100);
}

// ---------------------------------------------------------------- BOM + Preise je Groesse
console.log("BOM-Positionen und Preisauflösung je Standardgroesse ([Z-4]/[P-14]):");
const KAT = {
  format: "SEMBLA-Bauteilkatalog", version: 1, name: "Zuschnitt-Testkatalog",
  produkte: [
    { id: "rod-1000", kategorie: "gewindestange", bezeichnung: "Gewindestange M10 1000 mm", einheit: "Stk", preis: 3.5, gewinde: "M10", laenge_mm: 1000 },
    { id: "rod-600", kategorie: "gewindestange", bezeichnung: "Gewindestange M10 600 mm", einheit: "Stk", preis: 2.4, gewinde: "M10", laenge_mm: 600 },
    { id: "rod-500", kategorie: "gewindestange", bezeichnung: "Gewindestange M10 500 mm", einheit: "Stk", preis: 2.0, gewinde: "M10", laenge_mm: 500 },
    { id: "latte-1000", kategorie: "latte", bezeichnung: "Latte 40×60, 1,0 m", einheit: "Stk", preis: 2.4, breite_mm: 40, dicke_mm: 60, laenge_mm: 1000 },
    { id: "latte-500", kategorie: "latte", bezeichnung: "Latte 40×60, 0,5 m", einheit: "Stk", preis: 1.3, breite_mm: 40, dicke_mm: 60, laenge_mm: 500 },
  ],
};
const EING = {
  planung: { produkte: { quelle: null, rollen: { rod_std: ["rod-1000", "rod-600"] } } },
  aufbau: {
    seite: "vorne", panel: { b_cm: 62.5, h_cm: 150, off_x_cm: 0, off_y_cm: 0 },
    achsen: { max_x_cm: 62.5, max_y_cm: 75, ohang_cm: 12.5 },
    verbinder: { typ: "FA-1", Rk: 0.5, gM: 2.0, wk: 0.8, gQ: 1.5 },
    latten: { breite_cm: 4, stange_cm: 150 },
    feld_cm: null,
    produkte: { quelle: null, rollen: { latte: ["latte-1000", "latte-500"] } },
  },
  kosten: { waehrung: "EUR" }, projekt: {},
};
{
  // 2,60 m aus {100 cm, 60 cm} -> 100 + 100 + 60: BEIDE Standardgroessen sind im Einbau und
  // muessen daher beide bepreist werden (genau das war mit einer Aggregatposition unmoeglich).
  const w = buildWall("bom", 1000, 2600, [], null, { rod_lengths_mm: [1000, 600] });
  const b = semblaBom(w), items = semblaBomItems(w);
  const std = items.filter(i => i.key === "rod_std"), so = items.filter(i => i.key === "rod_sonder");
  ok("je Standardlaenge eine Position", std.length === b.stangenStd.length && std.length === 2);
  ok("Standardpositionen tragen ihr Maß", std.every(i => +i.mass_mm > 0));
  ok("Einbaumenge unveraendert (Summe = Core)",
    std.concat(so).reduce((a, i) => a + i.menge, 0) === w.bom.gewindestangen);

  const rs = stuecklistePositionen(w, EING, KAT);
  const rstd = rs.filter(r => r.key === "rod_std");
  ok("beide Standardlaengen sind eindeutig bepreist",
    rstd.length === 2 && rstd.every(r => r.status === "ok" && r.ep != null));
  ok("Preis je Position stammt aus dem passenden Produkt",
    rstd.find(r => /100 cm/.test(r.label)).produktId === "rod-1000"
    && rstd.find(r => /60 cm/.test(r.label)).produktId === "rod-600");
  ok("keine Null-/Ersatzpreise", rs.every(r => r.ep === null || r.ep > 0));
  const s = stuecklisteSumme(rs);
  ok("Summe zaehlt bepreiste Positionen aus", s.bepreist > 0 && s.bepreisbar >= s.bepreist);
}
{
  // 3,40 m aus {100 cm, 60 cm} -> 3×100 + 40 cm Sonderzuschnitt aus der 60er.
  const w = buildWall("sonder", 1000, 3400, [], null, { rod_lengths_mm: [1000, 600] });
  const so = semblaBomItems(w).filter(i => i.key === "rod_sonder");
  // [P-18]: Fertigmaß ist das maßgebende Maß der Position, es gibt kein Ausgangsprodukt mehr.
  ok("Sonderposition traegt ihr FERTIGMASS", so.every(i => i.mass_mm === 400));
  ok("Sonder-Bezeichnung nennt nur das Fertigmaß", /40 cm/.test(so[0].label) && !/\(aus /.test(so[0].label));
  const rs = stuecklistePositionen(w, EING, KAT);
  ok("Sonderzuschnitt wird nicht bepreist (Beschaffung, [P-18])",
    rs.filter(r => r.key === "rod_sonder").every(r =>
      r.status === "beschaffung" && r.ep === null && r.bepreisbar === false));
}
{
  // Fehlt das Ausgangsprodukt fuer eine Groesse, bleibt genau DIESE Position unbepreist —
  // sichtbar begruendet, ohne Nullpreis und ohne Mengenaenderung ([P-14]).
  const w = buildWall("teilbepreist", 1000, 2600, [], null, { rod_lengths_mm: [1000, 600] });
  const eng = JSON.parse(JSON.stringify(EING));
  eng.planung.produkte.rollen.rod_std = ["rod-1000"];
  const rs = stuecklistePositionen(w, eng, KAT);
  const off = rs.filter(r => r.key === "rod_std" && r.gp == null);
  ok("nur die unauflösbare Groesse bleibt ohne Preis", off.length === 1 && /60 cm/.test(off[0].label));
  ok("Grund wird benannt", off[0].status === "mass_abweichend" && off[0].statusText.length > 0);
  ok("Menge bleibt unveraendert", off[0].menge > 0);
  ok("Summe ist als unvollstaendig erkennbar", stuecklisteSumme(rs).vollstaendig === false);
}

// ---------------------------------------------------------------- [Z-1] Rollenstatus
console.log("[Z-1]/[Z-2] Auswahlstatus an der waehlenden Oberflaeche:");
{
  const w = buildWall("status", 1000, 2600, [], null, { rod_lengths_mm: [1000, 600] });
  const ktx = preisKontext(w, EING, KAT);
  ok("zwei verschiedene Standardlaengen -> kombiniert (keine Mehrdeutigkeit)",
    rollenStatus("rod_std", EING, KAT, ktx).status === "kombiniert");
  ok("kombiniert nennt die Groessen",
    JSON.stringify(rollenStatus("rod_std", EING, KAT, ktx).laengen_mm) === "[1000,600]");
  const dop = JSON.parse(JSON.stringify(KAT));
  dop.produkte.push({ id: "rod-1000b", kategorie: "gewindestange", bezeichnung: "Gewindestange M10 1000 mm (Zweitlieferant)", einheit: "Stk", preis: 3.9, gewinde: "M10", laenge_mm: 1000 });
  const e2 = JSON.parse(JSON.stringify(EING));
  e2.planung.produkte.rollen.rod_std = ["rod-1000", "rod-1000b"];
  const st2 = rollenStatus("rod_std", e2, dop, ktx);
  ok("gleiches Maß zweifach bleibt mehrdeutig (kein erstes Produkt)",
    st2.status === "mehrdeutig" && st2.produkt === null);
  ok("preisKontext bevorzugt den Katalog vor dem Altwert", ktx.rod_mm === 1000 && ktx.stange_mm === 1000);
  const spec = produktSpezifikation(EING, KAT);
  ok("Spezifikation liefert den Laengensatz absteigend",
    JSON.stringify(spec.rod.laengen_mm) === "[1000,600]" && JSON.stringify(spec.latte.laengen_mm) === "[1000,500]");
  ok("eindeutiger Lattenquerschnitt wird uebernommen", spec.latte.breite_mm === 40 && spec.latte.dicke_mm === 60);
  ok("ohne Auswahl bleibt die Quelle Fallback",
    produktSpezifikation({}, KAT).rod.quelle === "fallback");
}
{
  // Widersprüchliche Produktspezifikation wird gemeldet, nicht geraten.
  const k = JSON.parse(JSON.stringify(KAT));
  k.produkte.push({ id: "latte-breit", kategorie: "latte", bezeichnung: "Latte 60×60, 1,0 m", einheit: "Stk", preis: 3.1, breite_mm: 60, dicke_mm: 60, laenge_mm: 1000 });
  const e = JSON.parse(JSON.stringify(EING));
  e.aufbau.produkte.rollen.latte = ["latte-1000", "latte-breit"];
  const spec = produktSpezifikation(e, k);
  ok("zwei Querschnittsbreiten -> Konflikt gemeldet",
    spec.konflikte.some(x => x.feld === "breite_mm") && spec.latte.breite_mm === null);
}

// ---------------------------------------------------------------- [Z-4] Latten
console.log("[Z-4] Latten: Fertigmaß aus Geometrie, Ausgangsprodukt aus dem Katalog:");
{
  const w = buildWall("latten", 2000, 2600, [new Opening(5, 11, 0, 10, "tuer")]);
  const spec = produktSpezifikation(EING, KAT).latte;
  const A = berechneAufbau(w, EING.aufbau, spec);
  const stuecke = A.batt.axes.flatMap(a => a.segments);
  ok("Katalog ist die Laengenquelle", A.lattenQuelle === "katalog"
    && JSON.stringify(A.lattenLaengenCm) === "[100,50]");
  ok("Querschnitt kommt aus dem Produkt", A.lattenBreiteCm === 4);
  ok("jedes Stueck kennt sein Ausgangsprodukt", stuecke.length > 0 && stuecke.every(s => s.quelle_cm != null));
  ok("Ausgangsprodukt ist die kleinste geeignete Groesse",
    stuecke.every(s => s.quelle_cm >= s.len_cm - 1e-6 && (s.quelle_cm === 50 ? s.len_cm > 0 : true)));
  ok("Stueck > 50 cm wird aus der 100er geschnitten",
    stuecke.filter(s => s.len_cm > 50).every(s => s.quelle_cm === 100));
  ok("Sonderzuschnitt ist gekennzeichnet",
    stuecke.every(s => s.art === (Math.abs(s.quelle_cm - s.len_cm) < 1e-6 ? "standard" : "sonder")));
  ok("Obergrenze = groesste gewaehlte Standardlaenge", stuecke.every(s => s.len_cm <= 100 + 1e-6));
  const su = A.batt.summary;
  ok("Summary: Standard + Sonder = Stuecke", su.standard_stuecke + su.sonder_stuecke === su.latten_stuecke);
  ok("Summary: je Ausgangsprodukt eine Gruppe (keine Reststueck-Wiederverwendung)",
    su.ausgang.reduce((a, g) => a + g.anzahl, 0) === su.latten_stuecke);
  ok("keine Bestellmengen-/Verschnittoptimierung mehr im Ergebnis",
    su.latten_15m_bedarf === undefined && su.verschnitt_m === undefined && A.batt.cutting === undefined);
  ok("jedes Stueck hat ein geeignetes Ausgangsprodukt", su.ohne_quelle.length === 0);

  // 40-cm-Beispiel aus #19: Fertigmaß 40 cm entsteht als Zuschnitt, nie als ganze Stange.
  const vierzig = kombiniereLaengen(400, [1000, 500]);
  ok("#19-Beispiel: 40 cm = Sonderzuschnitt aus 50 cm", kurz(vierzig) === "400S/500");

  const csv = zuschnittCsv(w, EING, KAT);
  ok("Zuschnitt-CSV nennt Ausgangsprodukt und Art",
    /ausgangsprodukt_cm;art/.test(csv) && /(Standard|Sonderzuschnitt)/.test(csv));

  // Ohne Produktauswahl bleibt der Altwert wirksam (rueckwaertskompatibel).
  const A2 = berechneAufbau(w, EING.aufbau, null);
  ok("ohne Auswahl: Fallback aus latten.stange_cm", A2.lattenQuelle === "fallback"
    && JSON.stringify(A2.lattenLaengenCm) === "[150]");
}

// ---------------------------------------------------------------- [Z-3] Montage
console.log("[Z-3] Montage koppelt aus derselben Stueckableitung:");
{
  const w = buildWall("montage", 1000, 3400, [], null, { rod_lengths_mm: [1000, 500] });
  const ev = montageEreignisse(w);
  const sg = w.tension_columns[0].segments[0];
  const k0 = w.tension_columns[0].k;
  const kopp = ev.filter(e => e.art === "kopplung" && e.straenge.some(s => s.k === k0))
    .map(e => e.z_mm).sort((a, b) => a - b);
  const erwartet = []; let z = sg.z0_mm;
  for (const s of sg.stuecke.slice(0, -1)) { z += s.len_mm; erwartet.push(z); }
  ok("Kopplungshoehen = Kumulativsummen der Stuecke", JSON.stringify(kopp) === JSON.stringify(erwartet));
  ok("keine pauschale Stangenhoehe mehr (ungleiche Abstaende moeglich)",
    erwartet.length > 1 && erwartet[erwartet.length - 1] - erwartet[erwartet.length - 2] === 1000);
  ok("Kopplungszahl = Stuecke − 1", kopp.length === sg.stuecke.length - 1);
}

// ------------------------------------------------------- [Z-6] Reststueck oberer Abschluss
// Die Waende werden im Innenraum montiert: unter der Decke laesst sich keine lange Stange mehr
// einfaedeln. Jeder Strang, der an der WANDOBERKANTE endet, schliesst deshalb mit dem eigens
// gewaehlten Reststueck ab; es ragt um den konfigurierbaren Ueberstand darueber hinaus.
console.log("\n[Z-6] Reststueck am oberen Wandabschluss:");
{
  const PS = { rod_lengths_mm: [1000, 500], rod_rest_mm: 100, rod_overhang_mm: 10 };

  // -- reine Kombinationsregel (Paritaetsvertrag mit dem Python-Orakel)
  const a = kombiniereSegment(1700, [1000, 500], true, 100, 10);
  ok("Bedarf = h + Ueberstand", a.bedarf_mm === 1710);
  ok("oberstes Stueck ist das Reststueck", a.stuecke[a.stuecke.length - 1].art === "rest"
    && a.stuecke[a.stuecke.length - 1].len_mm === 100);
  ok("darunter groesste Standardlaenge zuerst, dann genau ein Sonderzuschnitt",
    kurz(a) === "1000+500+110S/500+100");
  ok("Summe der Stuecke = h + Ueberstand",
    a.stuecke.reduce((s, x) => s + x.len_mm, 0) === 1710);
  ok("genau EIN Sonderzuschnitt", a.stuecke.filter(s => s.art === "sonder").length === 1);

  // -- Segmente OHNE Oberkantenbezug bleiben unveraendert ([Z-2])
  const b = kombiniereSegment(1700, [1000, 500], false, 100, 10);
  ok("ohne Oberkantenbezug: kein Reststueck, kein Ueberstand",
    b.bedarf_mm === 1700 && kurz(b) === "1000+500+200S/500"
    && !b.stuecke.some(s => s.art === "rest"));
  ok("ohne Oberkantenbezug bit-genau wie kombiniereLaengen",
    JSON.stringify(b.stuecke) === JSON.stringify(kombiniereLaengen(1700, [1000, 500]).stuecke));

  // -- fehlendes/unpassendes Reststueck wird gemeldet, nie still ersetzt
  const c = kombiniereSegment(1700, [1000, 500], true, 0, 10);
  ok("kein Reststueck gewaehlt -> sichtbarer Konflikt", c.konflikt === "kein_reststueck");
  ok("kein Reststueck gewaehlt -> keine erfundene Laenge, Zerlegung wie bisher",
    !c.stuecke.some(s => s.art === "rest") && c.bedarf_mm === 1700);
  const d = kombiniereSegment(150, [1000], true, 400, 10);
  ok("Reststueck laenger als das Segment -> gemeldet statt gekuerzt",
    d.konflikt === "reststueck_zu_lang" && d.stuecke.length === 0);
  const e = kombiniereSegment(90, [1000], true, 100, 10);
  ok("Segment genau so hoch wie das Reststueck -> nur das Reststueck",
    e.stuecke.length === 1 && e.stuecke[0].art === "rest" && e.konflikt === null);

  // -- Wirkung im echten Wandelement: nur Straenge an der Oberkante
  const w = buildWall("rest", 1000, 2000, [], null, PS);
  for (const col of w.tension_columns) {
    const sg = col.segments[col.segments.length - 1];
    ok(`Strang k=${col.k}: oberstes Stueck ist das Reststueck`,
      sg.stuecke[sg.stuecke.length - 1].art === "rest");
    ok(`Strang k=${col.k}: Stuecke summieren auf h + Ueberstand`,
      sg.stuecke.reduce((s, x) => s + x.len_mm, 0) === sg.z1_mm - sg.z0_mm + 10);
    ok(`Strang k=${col.k}: Ueberstand zaehlt nicht als Verschnitt`, sg.ueberstand_mm === 10);
  }
  ok("kein Zuschnitt-Konflikt bei vollstaendiger Auswahl",
    w.validation.zuschnitt_konflikte.length === 0);
  ok("Reststueck ist KEIN Baubarkeitsausschluss", w.validation.buildable === true);

  // -- Bruestung/Sturz an einer Oeffnung: dort gilt die Regel NICHT
  const wo = buildWall("fenster", 2000, 2600, [new Opening(6, 10, 4, 10, "fenster")], null, PS);
  const unten = wo.tension_columns.flatMap(c => c.segments).filter(s => s.z1_mm < 2600);
  ok("Oeffnungssegmente existieren im Testfall", unten.length > 0);
  ok("Segmente unter der Oeffnung tragen kein Reststueck",
    unten.every(s => !s.stuecke.some(x => x.art === "rest") && s.ueberstand_mm === 0));

  // -- Stueckliste: eigene Position, nicht unter den Standardlaengen versteckt
  const items = semblaBomItems(w);
  const restPos = items.filter(i => i.key === "rod_rest");
  const stdPos = items.filter(i => i.key === "rod_std");
  ok("Stueckliste hat eine eigene Reststueck-Position", restPos.length === 1);
  ok("Reststueck-Menge = Zahl der Straenge an der Oberkante",
    restPos[0].menge === w.tension_columns.length);
  ok("Reststueck traegt sein eigenes maßgebendes Maß (Preisauflösung bleibt eindeutig)",
    restPos[0].mass_mm === 100);
  ok("Reststueck steckt NICHT in den Standardlaengen-Positionen",
    stdPos.every(p => p.mass_mm !== 100));
  const bom = semblaBom(w);
  ok("Gesamtzahl Gewindestangen enthaelt die Reststuecke",
    bom.gewindestangen_gesamt === bom.rodStd + bom.rodSonder + bom.rodRest);

  // -- Montage: die Kopplung zum Reststueck ist eine echte Kopplung
  const sg0 = w.tension_columns[0].segments[0];
  const ev = montageEreignisse(w);
  const k0 = w.tension_columns[0].k;
  const kopp = ev.filter(x => x.art === "kopplung" && x.straenge.some(s => s.k === k0));
  ok("Kopplungszahl = Stuecke − 1 (Reststueck eingerechnet)",
    kopp.length === sg0.stuecke.length - 1);
}

// -------------------------------------------- [Z-6] Reststueck-Rolle im Bauteilkatalog
console.log("\n[Z-6] Reststueck als eigene Katalogrolle:");
{
  const KATR = {
    format: "SEMBLA-Bauteilkatalog", version: 1, name: "T",
    produkte: [
      { id: "r1000", kategorie: "gewindestange", bezeichnung: "GS 1000", einheit: "Stk", preis: 3.8, laenge_mm: 1000 },
      { id: "r850", kategorie: "gewindestange", bezeichnung: "GS 850", einheit: "Stk", preis: 3.3, laenge_mm: 850 },
      { id: "r100", kategorie: "gewindestange", bezeichnung: "GS 100 Rest", einheit: "Stk", preis: 0.9, laenge_mm: 100 },
      { id: "r120", kategorie: "gewindestange", bezeichnung: "GS 120 Rest", einheit: "Stk", preis: 1.0, laenge_mm: 120 },
    ],
  };
  const eing = (restIds) => ({ planung: { produkte: { quelle: "katalog",
    rollen: { rod_std: ["r1000", "r850"], rod_rest: restIds } } } });

  const s1 = produktSpezifikation(eing(["r100"]), KATR);
  ok("eindeutig gewaehlt -> rest_mm ist die Produktlaenge", s1.rod.rest_mm === 100);
  ok("Standardlaengen bleiben davon unberuehrt",
    JSON.stringify(s1.rod.laengen_mm) === "[1000,850]");

  const s2 = produktSpezifikation(eing(["r100", "r120"]), KATR);
  ok("mehrere Reststuecke -> rest_mm bleibt offen (keines wird bevorzugt)", s2.rod.rest_mm === null);
  ok("mehrere Reststuecke -> benannter Konflikt",
    s2.konflikte.some(k => k.rolle === "rod_rest"));

  const s3 = produktSpezifikation(eing([]), KATR);
  ok("keine Auswahl -> rest_mm null, kein geratenes Maß", s3.rod.rest_mm === null);

  const st1 = rollenStatus("rod_rest", eing(["r100"]), KATR, {});
  ok("Rollenstatus eindeutig gewaehlt = ok", st1.status === "ok" && st1.produkt.id === "r100");
  const st2 = rollenStatus("rod_rest", eing(["r100", "r120"]), KATR, {});
  ok("Rollenstatus mehrere gewaehlt = mehrdeutig", st2.status === "mehrdeutig" && !st2.produkt);
  const st3 = rollenStatus("rod_rest", eing([]), KATR, {});
  ok("Rollenstatus ohne Auswahl = keine_auswahl", st3.status === "keine_auswahl");

  // Preiskontext fuehrt das Reststueckmaß getrennt von der Standardlaenge.
  const w = buildWall("k", 1000, 2000, [], null, { rod_lengths_mm: [1000, 850], rod_rest_mm: 100 });
  const ktx = preisKontext(w, eing(["r100"]), KATR);
  ok("preisKontext trennt rod_mm und rod_rest_mm", ktx.rod_mm === 1000 && ktx.rod_rest_mm === 100);
}

// ---------------------------------------- [Z-6] Standardkatalog deckt die Rolle ab
console.log("\n[Z-6] Standardkatalog:");
{
  const roh = readFileSync(new URL("../../docs/vorlagen/SEMBLA_Standardkatalog.json", import.meta.url), "utf8");
  const kat = parseKatalog(roh);
  const gs = kat.produkte.filter(p => p.kategorie === "gewindestange");
  ok("Standardkatalog laesst sich unveraendert parsen", kat.produkte.length > 0);
  ok("enthaelt ein Reststueck-Produkt (100 mm)", gs.some(p => +p.laenge_mm === 100));
  ok("enthaelt die Standardlaengen 1000 und 920 mm (#103)",
    gs.some(p => +p.laenge_mm === 1000) && gs.some(p => +p.laenge_mm === 920)
    && !gs.some(p => +p.laenge_mm === 850));
}

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
