// Smoke-Test Modul 4 (docs/stueckliste.html): evaluiert das klassische App-Skript unter einem
// DOM-Mock. Positions-/Summenrechnung (stuecklistePositionen/stuecklisteSumme) + Flaeche
// (wandflaeche) aus sembla-export und Storage werden — wie im Browser via window.SEMBLA —
// bereitgestellt und vor __slInit() gebunden.
//
// Issue #35: Modul 4 pflegt KEINE Preise mehr. Preise werden je Position read-only aus dem
// Bauteilkatalog aufgeloest, ueber die in Modul 1/2 gewaehlten Produkte je Verwendungsrolle.
// Fehlende, mehrdeutige, kategorie-, einheiten- oder maßfremde Zuordnung ergibt KEINEN Preis
// (kein Nullpreis, kein Ersatzprodukt) und veraendert niemals die Menge.
import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { stuecklistePositionen, stuecklisteSumme, stuecklisteCsv, wandflaeche, zuschnittCsv } from "../../docs/shared/sembla-export.js";
import { berechneAufbau } from "../../docs/shared/sembla-aufbau.js";
import { standardEingaben } from "../../docs/shared/storage.js";

const html = readFileSync(new URL("../../docs/stueckliste.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const script = scripts[scripts.length - 1][1];   // klassische App-Logik

class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.files=[];this.listeners={};this.dataset={};this.hidden=false;}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelectorAll(){return [];} appendChild(){} click(){}}
const dv={proj:'SEMBLA-Projekt',cur:'EUR'};
const _e={}; const document={getElementById:id=>{let e=_e[id];if(!e){e=_e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement:()=>new El('a')};
globalThis.document=document; globalThis.window={}; globalThis.alert=m=>{globalThis.__alert=m;};
globalThis.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}}; globalThis.Blob=class{constructor(){}};
globalThis.FileReader=class{readAsText(){}};

// Deep-Merge wie in storage.js (fuer den mergeEingaben-Mock).
function merge(base, patch){
  if(patch===null||typeof patch!=='object'||Array.isArray(patch)) return patch;
  const out=(base&&typeof base==='object'&&!Array.isArray(base))?{...base}:{};
  for(const k of Object.keys(patch)) out[k]=merge(out[k],patch[k]);
  return out;
}
// Synthetischer Bauteilkatalog (nur Fantasiedaten) — Preisquelle nach [P-14].
const KATALOG={ format:'SEMBLA-Bauteilkatalog', version:1, name:'Testkatalog M4', produkte:[
  { id:'stein-i3', kategorie:'stein', bezeichnung:'Stein i3', einheit:'Stk', preis:9.5, breite_mm:375, hoehe_mm:200, dicke_mm:125 },
  { id:'stein-i2', kategorie:'stein', bezeichnung:'Stein i2', einheit:'Stk', preis:7.2, breite_mm:250, hoehe_mm:200, dicke_mm:125 },
  { id:'rod-1100', kategorie:'gewindestange', bezeichnung:'Stange 1100', einheit:'Stk', preis:3.8, gewinde:'M10', laenge_mm:1100 },
  { id:'rod-1100b', kategorie:'gewindestange', bezeichnung:'Stange 1100 Zweitquelle', einheit:'Stk', preis:4.4, gewinde:'M10', laenge_mm:1100 },
  { id:'rod-meterware', kategorie:'gewindestange', bezeichnung:'Gewindestange Meterware', einheit:'m', preis:2.9, gewinde:'M10', laenge_mm:1100 },
  { id:'kuppl-stoss', kategorie:'verbrauch', bezeichnung:'Kopplungsmutter Stoß', einheit:'Stk', preis:0.65 },
  { id:'kuppl-fuss', kategorie:'verbrauch', bezeichnung:'Kopplungsmutter Fuß', einheit:'Stk', preis:0.66 },
  { id:'senkkopf', kategorie:'verbrauch', bezeichnung:'Senkkopfschraube', einheit:'Stk', preis:0.45 },
  { id:'spannmutter', kategorie:'verbrauch', bezeichnung:'Spannmutter', einheit:'Stk', preis:0.9 },
  { id:'dicht-stk', kategorie:'verbrauch', bezeichnung:'Dichtstreifen 20 cm', einheit:'Stk', preis:0.3 },
  { id:'dicht-rolle', kategorie:'verbrauch', bezeichnung:'Dichtstreifen Rollenware', einheit:'m', preis:1.5 },
  { id:'blech-boden', kategorie:'blech_platte', bezeichnung:'Bodenblech 1000', einheit:'Stk', preis:18, breite_mm:1000, hoehe_mm:125, dicke_mm:15 },
  { id:'blech-kopf', kategorie:'blech_platte', bezeichnung:'Kopfblech 1000', einheit:'Stk', preis:21, breite_mm:1000, hoehe_mm:125, dicke_mm:15 },
  { id:'spannplatte', kategorie:'blech_platte', bezeichnung:'Spannplatte 120', einheit:'Stk', preis:2.4, breite_mm:120, hoehe_mm:120, dicke_mm:15,
    hinweis:'vorläufig — fachlich unbestätigt: Beispielmaße.' },
  { id:'verb-fa1', kategorie:'verbinder', bezeichnung:'Verbinder FA-1', einheit:'Stk', preis:1.2 },
  { id:'latte-1500', kategorie:'latte', bezeichnung:'Latte 1,5 m', einheit:'Stk', preis:3.5, breite_mm:40, dicke_mm:60, laenge_mm:1500 },
]};
// Vollständige Zuordnung: Modul 1 besitzt planung.produkte, Modul 2 aufbau.produkte.
const ROLLEN_VOLL={ i3:['stein-i3'], i2:['stein-i2'], rod_std:['rod-1100'], rod_sonder:['rod-1100'],
  kupplung:['kuppl-stoss'], kuppl_basis:['kuppl-fuss'], senkkopf:['senkkopf'], spannmutter:['spannmutter'],
  spannplatte:['spannplatte'], blech_boden:['blech-boden'], blech_kopf:['blech-kopf'], dicht_stk:['dicht-stk'] };
function egVoll(){
  const e=standardEingaben();
  e.planung.produkte={ quelle:{name:KATALOG.name,version:1}, rollen:JSON.parse(JSON.stringify(ROLLEN_VOLL)) };
  e.aufbau.produkte={ quelle:{name:KATALOG.name,version:1}, rollen:{ latte:['latte-1500'], verbinder:['verb-fa1'], beplankung:[] } };
  return e;
}
// Storage-Mock: aktives Element vorhanden -> Modul laedt es + Eingaben + Katalog beim Start.
const W=buildWall('Testwand', 2000, 2600, [new Opening(5,11,0,10,'tuer')]);
let _subs=[]; let _aktiv='w-1'; let _we=W; let _eg=egVoll(); let _merges=[]; let _kat=KATALOG;
const storeMock={ aktivId:()=>_aktiv, aktivesWandelement:()=>_we, aktiveEingaben:()=>_eg, holeKatalog:()=>_kat,
  mergeEingaben:(teil,patch)=>{ _merges.push([teil,patch]); _eg[teil]=merge(_eg[teil],patch); return _aktiv; },
  abonniere:(cb)=>{ _subs.push(cb); return ()=>{}; } };
globalThis.window.SEMBLA={ stuecklistePositionen, stuecklisteSumme, wandflaeche, store:storeMock };

eval(script);
globalThis.window.__slInit();
const SL=globalThis.window.__sl;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);

// Start: aktives Element + Eingaben + Katalog geladen
ok('Start mit aktivem Element -> Wandelement geladen', SL.wall && SL.wall.length_mm===2000);
ok('Katalog als Preisquelle geladen', SL.katalog && SL.katalog.name==='Testkatalog M4');

// M3: Modul 4 hat KEINE editierbaren Preisfelder mehr
ok('kein Preis-Eingabefeld im Markup', !/type="number"[^>]*data-key/.test(html) && !/id="tbody"[\s\S]*<input/.test(html));
ok('keine Preis-Spalte zum Editieren, sondern Produkt-Spalte', /<th>Produkt \(Katalog\)<\/th>/.test(html));
ok('setPrice-API entfernt (Modul 4 pflegt keine Preise)', typeof SL.setPrice==='undefined');
ok('kein Schreiben von kosten.preise', !/kosten\.preise/.test(script) && !_merges.some(([t,p])=>t==='kosten'&&p&&p.preise));
ok('Hinweis nennt Modul 0 als Pflegeort', /Preise pflegt ausschließlich Modul 0/.test(html));

// MVP: genau ein aktives Wandelement — keine Mehrfachwand-Eingabe mehr
ok('Kein Anzahl-Wände-Eingabefeld (#qty) im Modul', !/id="qty"/.test(html));
ok('setAnzahl-API entfernt (keine Mehrfachwand-Steuerung)', typeof SL.setAnzahl==='undefined');

const rs=SL.rows();
const find=l=>rs.find(r=>r.label.includes(l));
const byKey=k=>rs.find(r=>r.key===k);
ok('i3-Menge = bom.i3', find('i3').menge===W.bom.i3);
ok('i2-Menge = bom.i2', find('i2').menge===W.bom.i2);
// [Z-2]/[Z-4]: es kann je Standardlänge und je Sonderzuschnitt-Fertigmaß eine eigene Position
// geben — maßgebend ist die SUMME aller Stangenpositionen (Einbaumenge bleibt unverändert).
const rodStd=rs.filter(r=>r.key==='rod_std').reduce((a,r)=>a+r.menge,0);
const rodSonder=rs.filter(r=>r.key==='rod_sonder').reduce((a,r)=>a+r.menge,0);
ok('Gewindestangen Standard+Sonderlänge = bom', rodStd+rodSonder===W.bom.gewindestangen);
ok('[Z-2] Sonderzuschnitte nennen Fertigmaß und Ausgangsprodukt',
  rs.filter(r=>r.key==='rod_sonder'&&r.menge>0).every(r=>/Sonderzuschnitt .* \(aus .*\)/.test(r.label)));
ok('Spannplatten = bom', byKey('spannplatte').menge===W.bom.spannplatten);
ok('Senkkopfschrauben = bom', byKey('senkkopf').menge===W.bom.senkkopfschrauben);
const dicht=byKey('dicht');
ok('Dichtstreifen in m = bom/1000', dicht.unit==='m' && Math.abs(dicht.menge - W.bom.dichtstreifen_mm/1000)<0.01);
ok('GP = Menge × EP', Math.abs(find('i3').gp - find('i3').menge*find('i3').ep)<1e-9);

// C ([A-1]): Boden- und Kopfblech als getrennte, getrennt bepreiste Positionen
ok('keine aggregierte Blech-Position mehr', !byKey('blech'));
ok('Bodenblech-Position = base_plate.module', byKey('blech_boden').menge===W.base_plate.module);
ok('Kopfblech-Position = top_plate.module', byKey('blech_kopf').menge===(W.top_plate?W.top_plate.module:0));
ok('Blech-Summe unverändert = Core-Gesamtzahl', byKey('blech_boden').menge+byKey('blech_kopf').menge===W.bom.stahlblech_module);
ok('Bleche getrennt bepreist (eigene EP)', byKey('blech_boden').ep===18 && byKey('blech_kopf').ep===21);

// D ([A-6]): Dichtstreifen-Gesamtlänge nachrichtlich, nur die Einbauposition wird bepreist
ok('Dicht-Gesamtlänge ist nachrichtlich und nicht bepreisbar',
  dicht.bepreisbar===false && dicht.ep===null && dicht.gp===null && dicht.status==='nachrichtlich');
ok('Dicht-Einbauposition wird bepreist', byKey('dicht_stk').ep===0.3 && byKey('dicht_stk').gp>0);
ok('keine Doppelverbuchung der Dichtstreifen in der Summe', (()=>{
  const s=SL.summe(); const nurStk=byKey('dicht_stk').gp;
  return s.summe>0 && Math.abs(s.summe-(s.summe-nurStk)-nurStk)<1e-9 && dicht.gp===null; })());
ok('Mengen bleiben unverändert (nachrichtliche Zeile behält ihre Menge)',
  Math.abs(dicht.menge - W.bom.dichtstreifen_mm/1000)<0.01);

// Verbinder/Latten jetzt IMMER aus dem Wandaufbau (kein Bundle mehr noetig)
ok('Verbinder-Position vorhanden (aus Aufbau)', !!find('Verbinder') && find('Verbinder').menge>0);
ok('Latten-Position vorhanden (aus Aufbau)', !!find('Lattenstange') && find('Lattenstange').menge>0);
ok('KEINE Dämmung-Position (MVP)', !rs.find(r=>r.label.includes('Dämmung')));
// [Z-4]: 11 feste Wandpositionen + je Gewindestangen-Standardlänge und je Sonderzuschnitt-
// Ausgangsprodukt eine Position + Verbinder + je Latten-Ausgangsprodukt eine Position.
const nRod=rs.filter(r=>r.key==='rod_std').length, nSonder=rs.filter(r=>r.key==='rod_sonder').length;
const nLatte=rs.filter(r=>r.key==='latte').length;
ok('Positionen = 11 Wand + Stangengruppen + Verbinder + Lattengruppen',
  rs.length===11+nRod+nSonder+1+nLatte && rs.length>=15);
ok('[Z-4] jede Stangen-/Lattengruppe traegt ihr maßgebendes Maß',
  rs.filter(r=>['rod_std','rod_sonder','latte'].includes(r.key)).every(r=>r.menge===0 || r.produktId!==null || r.status!=='ok'));
ok('Einbaumenge unveraendert: Stangenpositionen summieren zur Core-Zahl',
  rs.filter(r=>r.key==='rod_std'||r.key==='rod_sonder').reduce((a,r)=>a+r.menge,0)===W.bom.gewindestangen);
ok('keine Beplankungs-Kostenzeile (ohne #19/#22)', !byKey('beplankung'));

// Vollständige Zuordnung -> Summe vollständig (Nenner = alle bepreisbaren Positionen)
{
  const s=SL.summe();
  const nBepreisbar=rs.filter(r=>r.bepreisbar).length;
  ok('vollständige Zuordnung -> Summe vollständig', s.vollstaendig===true && s.offen===0);
  ok('nachrichtliche Zeile zählt nicht in den Nenner',
    s.bepreisbar===nBepreisbar && s.bepreist===nBepreisbar && nBepreisbar===rs.length-1);
  ok('Summenanzeige nennt die Vollständigkeit',
    new RegExp('alle '+nBepreisbar+' Positionen bepreist').test(document.getElementById('grandNote').textContent));
  ok('Zähler in der Kopfspalte', document.getElementById('ovPreise').textContent===nBepreisbar+' / '+nBepreisbar);
  const erwartet=rs.filter(r=>r.gp!=null).reduce((a,r)=>a+r.gp,0);
  ok('Summe = Σ der bepreisten Positionen', Math.abs(s.summe-erwartet)<1e-9);
}
// Vorläufige Katalogwerte werden sichtbar fortgeführt (U4) — auch bei Menge 0 nur ohne Preis.
ok('vorläufige Werte in der Warnbox benannt', /vorläufig/.test(document.getElementById('warnbox').innerHTML)
  || byKey('spannplatte').status==='nicht_erforderlich');

// Währung persistiert (über Eingabefeld)
document.getElementById('cur').value='CHF'; document.getElementById('cur').dispatch('input');
ok('Währung -> mergeEingaben', _eg.kosten.waehrung==='CHF');
document.getElementById('cur').value='EUR'; document.getElementById('cur').dispatch('input');

// Projektname persistiert
document.getElementById('proj').value='Mein Projekt'; document.getElementById('proj').dispatch('input');
ok('Projektname -> mergeEingaben(projekt)', _eg.projekt.name==='Mein Projekt');

// Fläche zieht Öffnungen ab
const a=SL.area(W); const full=(W.length_mm/1000)*(W.height_mm/1000);
ok('Fläche < Bruttofläche (Öffnungen abgezogen)', a < full && a>0);

// ungültiges Wandelement wirft
let threw=false; try{ SL.applyWand({x:1}); }catch(e){ threw=true; }
ok('ungültiges Wandelement wirft', threw);

// ---- M4: Preisauflösung — jeder Fehlerfall sichtbar, nie ein erfundener Preis ----------
// Ausgangspunkt sind immer die vollständigen Zuordnungen; je Fall wird EINE Rolle gestört.
const W1=W; _we=W1;
function mitRollen(patch){ _eg=egVoll();
  for(const [k,v] of Object.entries(patch)){ if(v===null) delete _eg.planung.produkte.rollen[k]; else _eg.planung.produkte.rollen[k]=v; }
  _subs.forEach(cb=>cb()); return SL.rows(); }
const mengenVoll=SL.rows().map(r=>r.key+':'+r.menge).join('|');

// (a) keine Auswahl
{ const r=mitRollen({i3:[]}).find(x=>x.key==='i3');
  ok('keine Auswahl -> Status keine_auswahl, kein Preis', r.status==='keine_auswahl' && r.ep===null && r.gp===null);
  ok('keine Auswahl -> kein Nullpreis in der Anzeige', /keine_auswahl|kein Produkt gewählt/.test(document.getElementById('tbody').innerHTML));
  ok('keine Auswahl -> Summe unvollständig mit n/m', (()=>{ const s=SL.summe();
    return s.vollstaendig===false && s.bepreist===s.bepreisbar-1
      && new RegExp(s.bepreist+' von '+s.bepreisbar+' Positionen bepreist')
           .test(document.getElementById('grandNote').textContent); })());
  ok('keine Auswahl -> Position wird in der Warnbox benannt',
    /ohne Preis/.test(document.getElementById('warnbox').innerHTML) && /Stein i3/.test(document.getElementById('warnbox').innerHTML));
  ok('Mengen bleiben unverändert', SL.rows().map(x=>x.key+':'+x.menge).join('|')===mengenVoll);
}
// (b) fehlende Referenz (Produkt existiert nicht im Katalog)
{ const r=mitRollen({i3:['gibts-nicht']}).find(x=>x.key==='i3');
  ok('fehlende Referenz -> Status fehlt, kein Preis', r.status==='fehlt' && r.ep===null && r.fehlend.join()==='gibts-nicht');
  ok('fehlende Referenz -> in der Warnbox mit ID benannt', /gibts-nicht/.test(document.getElementById('warnbox').innerHTML));
  ok('fehlende Referenz -> Referenz wird nicht still bereinigt', _eg.planung.produkte.rollen.i3.join()==='gibts-nicht');
}
// (c) Mehrdeutigkeit (zwei Produkte mit demselben maßgebenden Maß)
{ const r=mitRollen({rod_std:['rod-1100','rod-1100b']}).find(x=>x.key==='rod_std');
  ok('mehrdeutig -> kein Preis, kein erstes Produkt', r.status==='mehrdeutig' && r.ep===null && r.produkt===null);
  ok('mehrdeutig -> beide Kandidaten benannt', r.kandidaten.length===2
    && /rod-1100, rod-1100b/.test(document.getElementById('warnbox').innerHTML));
}
// (d) kategoriefremde Zuordnung
{ const r=mitRollen({i3:['rod-1100']}).find(x=>x.key==='i3');
  ok('falsche Kategorie -> Status kategorie_abweichend, kein Preis', r.status==='kategorie_abweichend' && r.ep===null);
}
// (e) einheitenfremde Preisbasis (m-Ware auf eine Stk-Position) — keine Umrechnung
{ const r=mitRollen({rod_std:['rod-meterware']}).find(x=>x.key==='rod_std');
  ok('einheitenfremd -> Status einheit_unpassend, kein Preis', r.status==='einheit_unpassend' && r.ep===null);
  ok('einheitenfremd -> keine Umrechnung m->Stk', r.gp===null); }
// (f) maßfremd (Produktlänge passt nicht zur Stangenlänge der Wand)
{ _eg=egVoll(); const kurz=buildWall('Kurzstange', 2000, 2600, [], null, {rod_mm:900}); _we=kurz;
  _subs.forEach(cb=>cb());
  const r=SL.rows().find(x=>x.key==='rod_std');
  ok('maßfremd -> Status mass_abweichend, kein Preis', r.status==='mass_abweichend' && r.ep===null);
  _we=W1; }
// (g) kein Katalog geladen
{ _eg=egVoll(); _kat=null; _subs.forEach(cb=>cb());
  const rs0=SL.rows();
  ok('kein Katalog -> alle bepreisbaren Positionen ohne Preis',
    rs0.filter(r=>r.bepreisbar).every(r=>r.status==='kein_katalog'||r.status==='nicht_erforderlich') && rs0.every(r=>r.ep===null));
  ok('kein Katalog -> Summe 0 und ausdrücklich unvollständig', (()=>{ const s=SL.summe();
    return s.summe===0 && s.vollstaendig===false && /UNVOLLSTÄNDIG/.test(document.getElementById('grandNote').textContent); })());
  ok('kein Katalog -> Mengen unverändert', rs0.map(x=>x.key+':'+x.menge).join('|')===mengenVoll);
  ok('kein Katalog -> Kopfzeile benennt es', /kein Katalog geladen/.test(document.getElementById('ovKat').textContent));
  _kat=KATALOG; }
// (h) Menge 0 braucht kein Produkt (Kopfblech bei oberem Anschluss „Spannplatte")
{ _eg=egVoll(); const wSp=buildWall('Spannplatte oben', 2000, 2600, [], null, {top_connection:'spannplatte'});
  _we=wSp; _subs.forEach(cb=>cb());
  const r=SL.rows().find(x=>x.key==='blech_kopf');
  ok('Menge 0 -> nicht_erforderlich (keine Falschwarnung)', r.menge===0 && r.status==='nicht_erforderlich' && r.bepreisbar===false);
  ok('Menge 0 zählt nicht in den Nenner', SL.summe().bepreisbar===13);
  _we=W1; _eg=egVoll(); _subs.forEach(cb=>cb()); }

// Reload: das Modul liest Wandelement, Eingaben und Katalog frisch (kein Zwischenspeicher)
{ globalThis.window.__slInit();
  ok('Reload: Zuordnung und Preise wieder vollständig',
    SL.summe().vollstaendig===true && SL.rows().find(r=>r.key==='i3').ep===9.5); }

// Katalogpreis in Modul 0 geändert -> Modul 4 zeigt ihn ohne eigenen Speicher sofort
{ _kat={...KATALOG, produkte:KATALOG.produkte.map(p=>p.id==='stein-i3'?{...p,preis:11.11}:p)};
  _subs.forEach(cb=>cb());
  ok('Katalogpreisänderung wirkt sofort (read-only, kein Drift)', SL.rows().find(r=>r.key==='i3').ep===11.11);
  ok('nichts davon wird ins Projekt geschrieben', !_merges.some(([t,p])=>t==='kosten'&&p&&p.preise));
  _kat=KATALOG; _subs.forEach(cb=>cb()); }

// Zentraler CSV-Export nutzt dieselbe Auflösung (Anzeige und Datei sagen dasselbe)
{ const csv=stuecklisteCsv(W1, egVoll(), {datum:'01.01.2026'}, KATALOG);
  ok('CSV: Produkt- und Zuordnungsspalte vorhanden', /Produkt \(Katalog\);Preisbasis;Zuordnung/.test(csv));
  ok('CSV: Bodenblech und Kopfblech getrennt', /Bodenblech-Modul/.test(csv) && /Kopfblech-Modul/.test(csv));
  ok('CSV: nachrichtliche Dicht-Gesamtlänge ohne Preis', /Dichtstreifen – Gesamtlänge;m;15,4;;;;;nachrichtliche Menge/.test(csv.replace(/15\.4/,'15,4')) || /Gesamtlänge;m;[\d.]+;;;;;nachrichtliche Menge/.test(csv));
  ok('CSV: vollständige Summe wird als solche benannt', /alle Positionen bepreist/.test(csv));
  const csvOhne=stuecklisteCsv(W1, egVoll(), {datum:'01.01.2026'}, null);
  ok('CSV ohne Katalog: keine Nullpreise, sondern benannter Grund',
    /kein Bauteilkatalog geladen/.test(csvOhne) && /unvollständig – 0 von \d+ Positionen bepreist/.test(csvOhne)
    && !/;0,00;/.test(csvOhne)); }

// Storage-Anbindung: externer Wechsel des aktiven Elements -> Modul lädt es + neue Eingaben
const W2=buildWall('Fremdwand', 2500, 2000, []);
_aktiv='w-2'; _we=W2; _eg=standardEingaben(); _eg.kosten.preise={i3:99};   // Alt-Preise bewusst gesetzt
_subs.forEach(cb=>cb());   // abonniere-Callback feuern (wie storage._benachrichtige)
ok('externer Wechsel: Modul lädt neues aktives Wandelement', SL.wall && SL.wall.length_mm===2500);
ok('Alt-Preise aus eingaben.kosten.preise werden NICHT mehr verwendet',
  SL.rows().find(r=>r.key==='i3').ep===null && SL.rows().find(r=>r.key==='i3').status==='keine_auswahl');
ok('Alt-Preise bleiben im Projekt erhalten (nur unwirksam)', _eg.kosten.preise.i3===99);
ok('standardEingaben liefert keine Preis-Vorgaben mehr', standardEingaben().kosten.preise===undefined);
ok('standardEingaben enthält leere Produkt-Blöcke für Modul 1 und 2', (()=>{
  const e=standardEingaben();
  return e.planung.produkte && JSON.stringify(e.planung.produkte.rollen)==='{}'
    && e.aufbau.produkte && JSON.stringify(e.aufbau.produkte.rollen)==='{}'; })());

// Export nutzt dieselbe kanonische Aufbau-Berechnung wie Modul 2 (Issue #12): die an den
// Türlaibungen verschobenen Achsen müssen 1:1 in Zuschnittliste und Verbindermenge ankommen.
const WT=buildWall('Tuerwand', 3750, 3000, [new Opening(6,12,0,10,'tuer')]);
const eg=standardEingaben();
const AB=berechneAufbau(WT, eg.aufbau);
const csvX=[...new Set(zuschnittCsv(WT, eg).trim().split('\n').slice(1).map(r=>+r.split(';')[0]))].sort((a,b)=>a-b);
ok('Export: Zuschnittliste enthält genau die Achsen der Aufbau-Berechnung',
   JSON.stringify(csvX)===JSON.stringify(AB.batt.axes.map(a=>a.x_cm)));
ok('Export: keine Zuschnitt-Achse in der Öffnungs-Sperrzone (12,5 cm um 75/150)',
   csvX.every(x=>Math.min(Math.abs(x-75),Math.abs(x-150))>=12.5-0.01));
ok('Export: Verbindermenge in der Stückliste = Verbinder des Aufbaus',
   stuecklistePositionen(WT, eg).find(r=>r.key==='verbinder').menge===AB.pts.length);

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
