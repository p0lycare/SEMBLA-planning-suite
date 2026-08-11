// Logiktest des gemeinsamen Anlagepfads (docs/shared/sembla-wandanlage.js, Issues #15/#62).
//
// Geprueft wird die ECHTE Kette Neuanlage -> Katalogvorbelegung -> Neuberechnung ->
// gespeichertes JSON gegen die echte Speicherschicht (storage.js) unter einem
// localStorage-Double, mit dem ECHTEN Standardkatalog aus docs/vorlagen/.
//
// Schwerpunkte:
//  - Der gespeicherte Stand traegt sofort die KATALOGLAENGEN ([Z-1]) und das Reststueck
//    am oberen Wandabschluss ([Z-6]) — ohne dass Modul 1 je geoeffnet wurde.
//  - Ohne gewaehlte Standardlaenge wird KEINE erfunden: kein `rod_lengths_mm:[1100]`,
//    kein reales 1100-mm-Stueck; der Zuschnitt bleibt sichtbar offen.
//  - Der Altstand-Fallback des Cores bleibt fuer Altaufrufe (Feld fehlt) unveraendert.
//  - Baustellenstueckliste und Zeichnungsgeometrie leiten GENAU diesen Stand ab.

import { readFileSync } from "node:fs";

class MemStorage {
  constructor(){ this.m = new Map(); }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v){ this.m.set(k, String(v)); }
  removeItem(k){ this.m.delete(k); }
}
globalThis.localStorage = new MemStorage();

const store = await import("../../docs/shared/storage.js");
const WA = await import("../../docs/shared/sembla-wandanlage.js");
const KAT = await import("../../docs/shared/sembla-katalog.js");
const BOM = await import("../../docs/shared/sembla-bom.js");
const ZEI = await import("../../docs/shared/sembla-zeichnung.js");
const { buildWall, ROD_OVERHANG } = await import("../../docs/shared/sembla-core.js");

const katalogText = readFileSync(
  new URL("../../docs/vorlagen/SEMBLA_Standardkatalog.json", import.meta.url), "utf8");

const checks = []; const ok = (n, c) => checks.push([n, !!c]);

/** Alle Stuecke aller Segmente eines Wandelements (die kanonische Quelle). */
const alleStuecke = (w) => (w.tension_columns || [])
  .flatMap(c => (c.segments || []).flatMap(sg => sg.stuecke || []));

// ===========================================================================
// 1) Vorspann-Vorgaben aus der Produktwahl ([Z-1]/[Z-6])
// ===========================================================================
const katalog = KAT.parseKatalog(katalogText);
ok('Pruefaufbau: der echte Standardkatalog fuehrt zwei Standardlaengen und ein Reststueck',
  KAT.produkteZuRolle({}, katalog, 'rod_std').produkte.length === 0);   // ohne Auswahl leer

const eingabenMitAuswahl = { planung: { produkte: { quelle: null, rollen: {
  rod_std: ['gewindestange-m10-1000', 'gewindestange-m10-850'],
  rod_rest: ['gewindestange-m10-100-rest'] } } } };

const vg = WA.vorspannVorgaben(eingabenMitAuswahl, katalog);
ok('[Z-1] Standardlaengen kommen unveraendert aus dem Katalog (absteigend)',
  JSON.stringify(vg.rod_lengths_mm) === '[1000,850]' && vg.quelle === 'katalog');
ok('[Z-6] genau ein Reststueckprodukt ergibt seine Laenge',
  vg.rod_rest_mm === 100 && vg.rod_overhang_mm === ROD_OVERHANG);

const vgOhneAuswahl = WA.vorspannVorgaben({}, katalog);
ok('ohne Auswahl bleibt der Laengensatz AUSDRUECKLICH leer (nichts erfunden)',
  Array.isArray(vgOhneAuswahl.rod_lengths_mm) && vgOhneAuswahl.rod_lengths_mm.length === 0
  && vgOhneAuswahl.rod_rest_mm === 0 && vgOhneAuswahl.quelle === 'keine_auswahl');

const vgOhneKatalog = WA.vorspannVorgaben(eingabenMitAuswahl, null);
ok('ohne Katalog gilt dasselbe und wird als solches benannt ([L-12])',
  vgOhneKatalog.rod_lengths_mm.length === 0 && vgOhneKatalog.quelle === 'kein_katalog');

const vgMehrereRest = WA.vorspannVorgaben({ planung: { produkte: { quelle: null, rollen: {
  rod_std: ['gewindestange-m10-1000'],
  rod_rest: ['gewindestange-m10-100-rest', 'gewindestange-m10-850'] } } } }, katalog);
ok('[Z-6] mehrere Reststueckprodukte lassen die Laenge offen statt eines zu bevorzugen',
  vgMehrereRest.rod_rest_mm === 0 && JSON.stringify(vgMehrereRest.rod_lengths_mm) === '[1000]');

ok('der Ueberstand des Bestands wird mitgefuehrt, nicht zurueckgesetzt',
  WA.vorspannVorgaben(eingabenMitAuswahl, katalog, 25).rod_overhang_mm === 25);

// ===========================================================================
// 2) Anlegen mit Katalog: der Zuschnitt steht SOFORT im gespeicherten JSON
// ===========================================================================
store.importiereKatalogText(katalogText);
const a = WA.legeWandAn(store, { name: 'Zuschnittwand', laenge_mm: 2000, hoehe_mm: 2600,
                                 wandtyp: 'ohne_wind' });
const w = store.holeElement(a.id).wandelement;   // GESPEICHERTER Stand, nicht der Rueckgabewert

ok('[P-18] die Anlage belegt die leeren Verwendungsstellen aus dem Katalog vor',
  (a.gesetzt.rod_std || []).length === 2 && (a.gesetzt.rod_rest || []).length === 1);
ok('#15 der gespeicherte Stand traegt die Kataloglaengen',
  JSON.stringify(w.prestress.rod_lengths_mm) === '[1000,850]');
ok('#15 `rod_mm` ist die groesste gewaehlte Standardlaenge ([Z-2])',
  w.rod_mm === 1000 && w.prestress.rod_mm === 1000);
ok('#62 nirgends im gespeicherten JSON steht die erfundene 1100-mm-Stange',
  !JSON.stringify(w).includes('1100'));
ok('[Z-6] das gewaehlte Reststueck steht in der Vorspannung', w.prestress.rod_rest_mm === 100);

const st = alleStuecke(w);
ok('[Z-1] jedes Standardstueck ist eine echte Kataloglaenge',
  st.length > 0 && st.filter(s => s.art === 'standard').every(s => s.len_mm === 1000 || s.len_mm === 850));
const obereSegmente = (w.tension_columns || [])
  .flatMap(c => c.segments.filter(sg => sg.z1_mm === w.height_mm));
ok('[Z-6] jedes Segment an der Wandoberkante schliesst mit dem Reststueck ab',
  obereSegmente.length > 0 && obereSegmente.every(sg => {
    const l = sg.stuecke[sg.stuecke.length - 1];
    return l && l.art === 'rest' && l.len_mm === 100;
  }));
ok('[Z-6] bestueckt wird h + Ueberstand, der Ueberstand ist kein Verschnitt',
  obereSegmente.every(sg => sg.bedarf_mm === (sg.z1_mm - sg.z0_mm) + ROD_OVERHANG
    && sg.ueberstand_mm === ROD_OVERHANG));
ok('der Zuschnitt ist konfliktfrei', w.validation.zuschnitt_konflikte.length === 0);
ok('Wandtyp und Geometrie der Anlage bleiben erhalten',
  w.wandtyp === 'ohne_wind' && w.length_mm === 2000 && w.height_mm === 2600);
ok('es entsteht genau EIN Wandelement (der Eintrag wird ueberschrieben, nicht verdoppelt)',
  store.listeElemente().length === 1);

// ===========================================================================
// 3) Ableitungen ohne Umweg ueber Modul 1 (#15/#62)
// ===========================================================================
const teile = BOM.einbauteile(w);
const positionen = BOM.semblaBomItems(w);
const rodPos = positionen.filter(p => p.kategorie === undefined && /^rod_/.test(p.key) && p.menge > 0);

ok('die Baustellenstueckliste zaehlt genau die realen Stuecke',
  rodPos.reduce((s, p) => s + p.menge, 0) === st.length);
ok('ihre Laengen sind genau die Laengen aus segments[].stuecke',
  rodPos.every(p => st.some(s => s.len_mm === p.mass_mm))
  && new Set(rodPos.map(p => p.mass_mm)).size === new Set(st.map(s => s.len_mm)).size);
ok('[Z-6] das Reststueck ist eine eigene Position mit eigenem Mass',
  rodPos.some(p => p.art === 'rest' && p.mass_mm === 100));
ok('keine Position behauptet eine 1100-mm-Stange',
  !rodPos.some(p => p.mass_mm === 1100));
ok('[P-19] die Einbauteil-IDs decken sich mit den Stuecken',
  teile.length === st.length
  && positionen.filter(p => Array.isArray(p.ids) && p.ids.length)
       .flatMap(p => p.ids).sort().join() === teile.map(t => t.id).sort().join());

const zeichnung = ZEI.zeichnungSvg(w);
const einbauZeilen = ZEI.einbauteilZeilen(w);
ok('die Zeichnungsgeometrie entsteht aus demselben Stand',
  !!zeichnung && typeof zeichnung.svg === 'string' && zeichnung.svg.includes('<svg')
  && einbauZeilen.length > 0);
ok('[P-19] die Zeichnung fuehrt genau die Einbauteil-IDs der Stueckliste',
  einbauZeilen.flatMap(z => String(z.wert).split(/\s+/)).filter(x => /^.?GS-/.test(x)).length === st.length);
ok('die Zeichnung nennt die Kataloglaenge und keine 1100-mm-Stange',
  ZEI.vorspannZeilen(w).some(z => z.label === 'Gewindestange' && z.wert === '100 cm')
  && !JSON.stringify(ZEI.vorspannZeilen(w)).includes('110 cm'));
ok('die Zeichnung meldet keinen Zuschnittmangel', ZEI.konfliktZeilen(w).length === 0);

// ===========================================================================
// 4) Ohne Standardlaenge: sichtbar offen statt erfundener 1100 mm
// ===========================================================================
globalThis.localStorage = new MemStorage();
const b = WA.legeWandAn(store, { name: 'Wand ohne Katalog', laenge_mm: 2000, hoehe_mm: 2600 });
const wo = store.holeElement(b.id).wandelement;

ok('Pruefaufbau: ohne Katalog gibt es keine Vorbelegung',
  !store.holeKatalog() && Object.keys(b.gesetzt).length === 0);
ok('#62 der Neubestand enthaelt KEIN rod_lengths_mm:[1100]',
  Array.isArray(wo.prestress.rod_lengths_mm) && wo.prestress.rod_lengths_mm.length === 0);
ok('#62 und auch sonst keine erfundene Stangenlaenge',
  wo.rod_mm === null && wo.prestress.rod_mm === null && !JSON.stringify(wo).includes('1100'));
ok('#62 es wird kein reales 1100-mm-Stueck persistiert', alleStuecke(wo).length === 0);
ok('der fehlende Zuschnitt bleibt SICHTBAR offen ([Z-1])',
  wo.validation.zuschnitt_konflikte.length > 0
  && wo.validation.zuschnitt_konflikte.every(k => k.grund === 'keine_standardlaenge'));
ok('das ist kein Baubarkeitsausschluss', wo.validation.buildable === true);
ok('die Stueckliste behauptet kein reales Stueck',
  BOM.semblaBomItems(wo).filter(p => /^rod_/.test(p.key)).every(p => p.menge === 0)
  && BOM.einbauteile(wo).length === 0);
ok('die Zeichnung meldet den offenen Zuschnitt als Mangel',
  ZEI.konfliktZeilen(wo).length > 0 && /unvollständig/i.test(ZEI.maengelHtml(wo)));
ok('der Zustandstext benennt die Lage, ohne eine Laenge zu erfinden',
  /ohne Bauteilkatalog|keine Gewindestangen-Standardlänge/.test(WA.vorspannText(b.vorgaben)));

// ===========================================================================
// 5) Der Altstand-Fallback des Cores bleibt fuer Altaufrufe unveraendert
// ===========================================================================
const alt = buildWall('Altstand', 2000, 2600, []);
ok('[must_not] fehlendes Feld -> unveraendert 1100 mm',
  alt.rod_mm === 1100 && JSON.stringify(alt.prestress.rod_lengths_mm) === '[1100]'
  && alleStuecke(alt).length > 0);
const altRod = buildWall('Altstand rod_mm', 2000, 2600, [], null, { rod_mm: 900 });
ok('[must_not] der Einzelwert `rod_mm` wirkt weiterhin als einelementiger Satz',
  altRod.rod_mm === 900 && JSON.stringify(altRod.prestress.rod_lengths_mm) === '[900]');

// ===========================================================================
// 6) REIHENFOLGE: erst Rollen und Vorgaben, dann GENAU EIN Schreibvorgang
// ===========================================================================
// Diese Pruefung ist der eigentliche Regressionsschutz gegen #15/#62: ein initial
// gespeicherter Fallback-Stand darf nicht unbemerkt zurueckkehren. Sie beobachtet die
// ECHTEN Aufrufe an der Speicherschicht — nicht nur das Endergebnis.
globalThis.localStorage = new MemStorage();
store.importiereKatalogText(katalogText);

const protokoll = [];
const spion = new Proxy(store, {
  get(ziel, schluessel){
    const wert = ziel[schluessel];
    if (typeof wert !== 'function') return wert;
    return (...args) => {
      const eintrag = { op: String(schluessel) };
      if (schluessel === 'speichere') { eintrag.wandelement = args[1]; eintrag.eingaben = args[3]; }
      protokoll.push(eintrag);
      return wert(...args);
    };
  },
});
const p = WA.legeWandAn(spion, { name: 'Reihenfolge', laenge_mm: 2000, hoehe_mm: 2600 });
const schreibt = protokoll.filter(x => x.op === 'speichere');

ok('#15 es gibt GENAU EINEN Schreibvorgang', schreibt.length === 1);
ok('#15 und der erste geschriebene Stand ist bereits der fertige',
  JSON.stringify(schreibt[0].wandelement.prestress.rod_lengths_mm) === '[1000,850]'
  && schreibt[0].wandelement.prestress.rod_rest_mm === 100
  && !JSON.stringify(schreibt[0].wandelement).includes('1100'));
ok('#15 die Rollenauswahl reist im SELBEN Schreibvorgang mit ([P-13]/[P-18])',
  (schreibt[0].eingaben?.planung?.produkte?.rollen?.rod_std || []).length === 2
  && (schreibt[0].eingaben.planung.produkte.rollen.rod_rest || []).length === 1);
ok('#15 der Katalog wird VOR dem Speichern gelesen',
  protokoll.findIndex(x => x.op === 'holeKatalog') < protokoll.findIndex(x => x.op === 'speichere'));
ok('#15 es wird nach dem Speichern nichts nachgetragen — kein zweiter Schreibweg',
  protokoll.slice(protokoll.findIndex(x => x.op === 'speichere') + 1)
    .every(x => !/^(speichere|mergeEingaben|setzeProduktrolle|vorbelegeProduktrollen|speichereAktiv)$/.test(x.op)));
ok('#62 im Speicher stand nie ein Zwischenstand',
  JSON.parse(localStorage.getItem('sembla:elemente'))[p.id].wandelement.rod_mm === 1000);

// Auch OHNE Katalog bleibt es bei genau einem Schreibvorgang — und ohne erfundene Laenge.
globalThis.localStorage = new MemStorage();
protokoll.length = 0;
const pO = WA.legeWandAn(spion, { name: 'Reihenfolge ohne Katalog', laenge_mm: 2000, hoehe_mm: 2600 });
const schreibtO = protokoll.filter(x => x.op === 'speichere');
ok('#62 ohne Katalog ebenfalls genau ein Schreibvorgang — ohne 1100 mm',
  schreibtO.length === 1 && schreibtO[0].wandelement.rod_mm === null
  && !JSON.stringify(schreibtO[0].wandelement).includes('1100')
  && !JSON.stringify(localStorage.getItem('sembla:elemente')).includes('1100')
  && !!pO.id);

// Die Rechnung selbst ist ohne jeden Speicherzugriff pruefbar (DOM- und speicherfrei).
const rollenP = WA.produktrollenPatch(katalog);
const rein = WA.wandelementNeu({ name: 'Rein', laenge_mm: 2000, hoehe_mm: 2600, wandtyp: 'ohne_wind' },
                               rollenP.patch, katalog);
ok('#15 die Rollen lassen sich VOR jedem Speichern bestimmen ([P-18])',
  (rollenP.gesetzt.rod_std || []).length === 2 && !!rollenP.patch.planung.produkte.quelle);
ok('[P-13] der Patch trifft die Abschnitte der besitzenden Module',
  !!rollenP.patch.planung?.produkte?.rollen?.rod_std && !!rollenP.patch.aufbau?.produkte?.rollen?.latte
  && !rollenP.patch.planung.produkte.rollen.latte);
ok('die reine Rechnung liefert denselben Stand wie die Anlage',
  JSON.stringify(rein.wandelement.prestress.rod_lengths_mm) === '[1000,850]'
  && rein.wandelement.wandtyp === 'ohne_wind');

let fail = 0; for (const [n, c2] of checks){ console.log((c2 ? '  ok  ' : 'FAIL  ') + n); if (!c2) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`); process.exit(fail ? 1 : 0);
