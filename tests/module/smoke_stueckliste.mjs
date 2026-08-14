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
import { baueDateien, einbauteileCsv, stuecklistePositionen, stuecklisteSumme, stuecklisteCsv, wandflaeche, zuschnittCsv } from "../../docs/shared/sembla-export.js";
import { einbauteile } from "../../docs/shared/sembla-bom.js";
import { umfang, gesamtDaten, standText } from "../../docs/shared/sembla-gesamtstueckliste.js";
import { leereMappe, fuegeGeschossHinzu, setzeWand } from "../../docs/shared/sembla-projektmappe.js";
import { blattHtml } from "../../docs/shared/sembla-zeichnung.js";
import { berechneAufbau } from "../../docs/shared/sembla-aufbau.js";
import { standardEingaben } from "../../docs/shared/storage.js";

/** Deutsche Zahlformatierung wie im Modul (fuer Erwartungswerte der Oberflaechen-Pruefung). */
const fmtDe = n => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Dieselbe Formatierung wie die Betraege des Moduls (zwei Nachkommastellen). */
const fmtDe2 = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const html = readFileSync(new URL("../../docs/stueckliste.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const script = scripts[scripts.length - 1][1];   // klassische App-Logik

class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.files=[];this.listeners={};this.dataset={};this.hidden=false;}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelectorAll(){return [];} appendChild(){} click(){}}
const dv={cur:'EUR'};   // #70: kein `proj` mehr — Modul 4 hat kein Projekt-Eingabefeld
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
// [P-18] rod_sonder wird nicht mehr gewaehlt (Beschaffung), Kopplungsmuttern sind bauteilgleich.
const ROLLEN_VOLL={ i3:['stein-i3'], i2:['stein-i2'], rod_std:['rod-1100'],
  kupplung:['kuppl-stoss'], senkkopf:['senkkopf'], spannmutter:['spannmutter'],
  spannplatte:['spannplatte'], blech_boden:['blech-boden'], blech_kopf:['blech-kopf'], dicht_stk:['dicht-stk'] };
function egVoll(){
  const e=standardEingaben();
  e.planung.produkte={ quelle:{name:KATALOG.name,version:1}, rollen:JSON.parse(JSON.stringify(ROLLEN_VOLL)) };
  e.aufbau.produkte={ quelle:{name:KATALOG.name,version:1}, rollen:{ latte:['latte-1500'], verbinder:['verb-fa1'], beplankung:[] } };
  return e;
}
// Storage-Mock: aktives Element vorhanden -> Modul laedt es + Eingaben + Katalog beim Start.
// [A-6]/#71: Die Testwand ist ausdruecklich ABGEDICHTET — nur dann fuehrt die Stueckliste
// Dichtstreifen. Damit bleiben alle bestehenden Dicht-Pruefungen unten der Nachweis, dass sich
// fuer eine abgedichtete Wand Mengen und Preise nicht geaendert haben; der Gegenfall steht als
// eigener Block am Ende (Wand ohne Feld und Wand mit ausdruecklichem „nicht abgedichtet“).
const W=Object.assign(buildWall('Testwand', 2000, 2600, [new Opening(5,11,0,10,'tuer')]),
  { abdichtung:'abgedichtet' });
// `_name` ist der Name des WANDEINTRAGS (#70) — getrennt von `_we.name`, genau wie im echten
// Speicher: `storage.umbenennen()` aendert nur den Eintrag, nie das gerechnete Wandelement.
// Standard `null` = kein Eintragsname, damit alle Altpruefungen weiter den Wandelementnamen sehen.
let _subs=[]; let _aktiv='w-1'; let _we=W; let _eg=egVoll(); let _merges=[]; let _kat=KATALOG;
let _name=null;
const storeMock={ aktivId:()=>_aktiv, aktivesWandelement:()=>_we, aktiveEingaben:()=>_eg, holeKatalog:()=>_kat,
  aktivesElement:()=>_we?{ id:_aktiv, name:_name, wandelement:_we }:null,
  mergeEingaben:(teil,patch)=>{ _merges.push([teil,patch]); _eg[teil]=merge(_eg[teil],patch); return _aktiv; },
  abonniere:(cb)=>{ _subs.push(cb); return ()=>{}; } };
globalThis.window.SEMBLA={ stuecklistePositionen, stuecklisteSumme, wandflaeche, einbauteile, store:storeMock,
  umfang, gesamtDaten, standText };

eval(script);
globalThis.window.__slInit();
const SL=globalThis.window.__sl;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);

// #72: der einleitende Beschreibungsabsatz ist ersatzlos entfallen (samt totem CSS und
// dem toten .intro-Bezug in der Druckregel).
ok('[#72] kein einleitender intro-Absatz mehr auf der Seite',
  !/class="intro"/.test(html) && !/\.intro\b/.test(html));

/** Dieselbe Maskierung wie im Modul (fuer Erwartungswerte im gerenderten DOM). */
const esc0=s=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

/** Summenzeile der Tabelle — Betrag UND Vollstaendigkeit stehen ausschliesslich dort (#62). */
const sumZeile = () => (document.getElementById('tbody').innerHTML.split('<tr').find(z=>z.includes('class="sum"'))||'');

// Start: aktives Element + Eingaben + Katalog geladen
ok('Start mit aktivem Element -> Wandelement geladen', SL.wall && SL.wall.length_mm===2000);
ok('Katalog als Preisquelle geladen', SL.katalog && SL.katalog.name==='Testkatalog M4');

// M3: Modul 4 hat KEINE editierbaren Preisfelder mehr
ok('kein Preis-Eingabefeld im Markup', !/type="number"[^>]*data-key/.test(html) && !/id="tbody"[\s\S]*<input/.test(html));
ok('setPrice-API entfernt (Modul 4 pflegt keine Preise)', typeof SL.setPrice==='undefined');
ok('kein Schreiben von kosten.preise', !/kosten\.preise/.test(script) && !_merges.some(([t,p])=>t==='kosten'&&p&&p.preise));
// #72: der Pflegeort-Satz stand nur im entfernten intro-Absatz — er ist mit ihm entfallen
// und wird nicht durch einen neuen Kurztext ersetzt; die Preisregel selbst sichern die
// beiden vorstehenden Pruefungen (keine Preisfelder, kein setPrice).
ok('[#72] kein Pflegeort-Erklaertext mehr auf der Seite', !/Preise pflegt ausschließlich Modul 0/.test(html));

// MVP: genau ein aktives Wandelement — keine Mehrfachwand-Eingabe mehr
ok('Kein Anzahl-Wände-Eingabefeld (#qty) im Modul', !/id="qty"/.test(html));
ok('setAnzahl-API entfernt (keine Mehrfachwand-Steuerung)', typeof SL.setAnzahl==='undefined');

// ---- #58/#62: kompaktes Baustellenblatt (reine Darstellung, Rechnung unveraendert) --------
// Der Tabellenkopf ist auf das reduziert, was auf der Baustelle gebraucht wird. Katalog-
// Metadaten (Produkt/Preisbasis), die Einheiten-Spalte, die je Zeile wiederholte
// Wandreferenz und die Einbauteil-ID-Spalte sind entfallen — die Wand steht EINMAL im
// Blattkopf, die IDs stehen in der getrennten Einbauteilliste und auf dem Zeichnungsblatt.
{
  const kopf=[...html.matchAll(/<th>([^<]*)<\/th>/g)].map(m=>m[1]);
  ok('#62 Tabellenkopf ist genau die reduzierte Spaltenfolge',
    JSON.stringify(kopf)===JSON.stringify(['Einbauteil','Art','Fertigmaß','Menge','EP','GP']));
  ok('#62 Tabellenkopf führt keine Einbauteil-ID-Spalte mehr',
    !kopf.includes('Einbauteil-IDs') && !/Einbauteil-ID/.test(document.getElementById('thead').innerHTML));
  ok('#58 keine Produkt-/Katalogspalte mehr', !/<th>Produkt/.test(html) && !/class="prod"/.test(html));
  ok('#62 keine je Zeile wiederholte Wandspalte', !/<th>Wand<\/th>/.test(html) && !/class="wand"/.test(html));
  ok('#58 veralteter linker Uebersichtsblock entfernt',
    ['ovDim','ovArea','ovBadge','ovKat','ovPreise','ovTeile','perm2','info'].every(id=>!html.includes('id="'+id+'"'))
    && !/class="panel controls"/.test(html) && !/class="hint"/.test(html));
  ok('#58 Warnbox und Produkt-Hinweistext ersatzlos entfernt',
    !/warnbox/.test(html) && !/renderWarnungen/.test(html) && !/class="vorl"/.test(html)
    && !/produkt\.hinweis/.test(script));
  // Der Blattkopf traegt die Wandreferenz EINMAL (R1: einmal statt je Zeile) — seit #70 ohne
  // Projektzeile, weil sie fuer ein Eingabefeld stand, das es nicht mehr gibt.
  const kopfHtml=document.getElementById('printkopf').innerHTML;
  ok('#62 Blattkopf nennt die Wandreferenz mit Maßen und Datum',
    /<b>Wand:<\/b>/.test(kopfHtml) && kopfHtml.includes('Testwand') && /<b>Datum:<\/b>/.test(kopfHtml));
  ok('#70 Blattkopf führt auf der Wandebene keine Projektzeile mehr',
    !/<b>Projekt:<\/b>/.test(kopfHtml));
}

// ---- #70: kein Projekt-Eingabefeld, kein Projekt-Schreibweg ------------------------------
ok('#70 kein Projekt-Eingabefeld im Markup',
  !/id="proj"/.test(html) && !/id="lbl-proj"/.test(html) && !/<span>Projekt<\/span>/.test(html));
ok('#70 kein Schreibpfad nach eingaben.projekt im Modulskript',
  !/persist\('projekt'/.test(script) && !/mergeEingaben\('projekt'/.test(script)
  && !/\.projekt\s*\|\|\s*\(/.test(script));
ok('#70 Modul 4 liest den Namen aus dem aktiven Wandeintrag',
  /aktivesElement/.test(script));

// Spaltenaufteilung (#62): Der Umbruchbehelf fuer lange ID-Listen ist gegenstandslos geworden,
// weil die ID-Spalte selbst entfallen ist — es gibt keinen Zelleninhalt mehr, der die Tabelle
// auseinandernehmen koennte. Geblieben ist die strukturelle Garantie fester Spaltenbreiten.
// Ein Node-DOM-Mock hat kein Layout und kann keine Pixelbreite messen (die optische Kontrolle
// bleibt der Live-Check im Browser).
{
  const cols=(html.match(/<col style="width:\d+%">/g)||[]).length;
  ok('#62 festes Tabellenlayout mit einer Breite je Spalte',
    /table\{[^}]*table-layout:fixed/.test(html) && cols===6);
  ok('#62 keine ID-Zelle und keine ID-Zellenregel mehr im Blatt',
    !/td\.ids\{/.test(html) && !/class="ids"/.test(html) && !/\.wq\{/.test(html));
  ok('#62 Druckregel kennt keine ID-Zelle mehr', !/td\.ids\{font-size/.test(html));
}

// Eigene Druckregel (#62): Navigation, Bedienfelder und Bildschirmhilfen aus; Kopf, Tabelle
// und die nach [P-19] noetige Kennzeichnungslegende bleiben druckbar.
{
  const m=html.match(/@media print\{([\s\S]*?)\n  \}/);
  const p=m?m[1]:'';
  ok('#62 Modul 4 hat eine eigene Druckregel', !!m && /@page\{size:A4/.test(html));
  ok('#62 Druck blendet Navigation und Bedienzeile aus',
    /\.sb-nav[^{]*\.kopfleiste\{display:none!important\}/.test(p));
  ok('#62 Druck blendet jede Eingabebedienung aus',
    /input,select,textarea,button\{display:none!important\}/.test(p));
  ok('#62 Druck zeigt Kopf, Tabelle und Legende (nichts davon ausgeblendet)',
    !/#printkopf\{display:none/.test(p) && !/\.kennz\{display:none/.test(p)
    && !/table\{display:none/.test(p) && /thead\{display:table-header-group\}/.test(p));
  ok('#62 Druck führt keinen zweiten Summenblock unter der Tabelle',
    !/class="summe"/.test(html) && !/\.summe\{/.test(html));
}

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
// [P-18]: Die Stueckliste ist die Baustellenliste — Sonderzuschnitte nennen NUR das Fertigmaß
// und werden nie bepreist (aus welcher Lagerlaenge geschnitten wird, entscheidet der Einkauf).
ok('[P-18] Sonderzuschnitte nennen nur das Fertigmaß, keine Herkunft',
  rs.filter(r=>r.key==='rod_sonder'&&r.menge>0).length>0
  && rs.filter(r=>r.key==='rod_sonder').every(r=>/Sonderzuschnitt \d/.test(r.label) && !/\(aus /.test(r.label)));
ok('[P-18] Sonderzuschnitte sind nicht bepreisbar und melden Beschaffung',
  rs.filter(r=>r.key==='rod_sonder').every(r=>r.bepreisbar===false && r.ep===null && r.status==='beschaffung'));
ok('[P-18] Kopplungsmuttern sind EINE Position mit der Gesamtmenge',
  !byKey('kuppl_basis')
  && byKey('kupplung').menge===W.bom.verbindungsmuttern+W.bom.kopplungsmuttern_basis
  && byKey('kupplung').ep===0.65);
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

// [Z-4]/[P-19] Beplankung (Modul 2) steht in KEINER Stuecklistenausgabe: keine Latten, keine
// Platten, kein Modul-2-Verbinder — auch dann nicht, wenn Modul 2 Produkte dafuer gewaehlt hat
// (egVoll setzt aufbau.produkte vollstaendig).
ok('[Z-4] keine Verbinder-Position (Modul 2)', !byKey('verbinder') && !find('Verbinder'));
ok('[Z-4] keine Latten-Position (Modul 2)', !byKey('latte') && !find('Lattenstange'));
ok('[Z-4] keine Beplankungs-/Platten-Position', !byKey('beplankung') && !rs.find(r=>/Platte(?!nbreite)/.test(r.label)&&!/Spannplatte/.test(r.label)));
ok('KEINE Dämmung-Position (MVP)', !rs.find(r=>r.label.includes('Dämmung')));
// Die Gewindestangen-KOPPLUNG ist kein Modul-2-Verbinder und bleibt ausdruecklich enthalten.
ok('[P-19] Gewindestangen-Kopplung bleibt enthalten', !!byKey('kupplung') && byKey('kupplung').menge>0);
// [Z-4]: 10 feste Wandpositionen + je Gewindestangen-Standardlänge, je Sonderzuschnitt-
// Fertigmaß und je Reststück-Fertigmaß eine Position. Nichts aus dem Wandaufbau.
const nRod=rs.filter(r=>r.key==='rod_std').length, nSonder=rs.filter(r=>r.key==='rod_sonder').length;
const nRest=rs.filter(r=>r.key==='rod_rest').length;
// [P-18]: eine Kopplungsmutter-Position weniger als vorher (Fuß-Sonderausfuehrung entfaellt).
ok('Positionen = 10 Wand + Stangengruppen (ohne Aufbau)',
  rs.length===10+nRod+nSonder+nRest && rs.length>=12);
ok('[Z-4] jede Stangengruppe traegt ihr maßgebendes Maß',
  rs.filter(r=>r.key==='rod_std').every(r=>r.menge===0 || r.produktId!==null || r.status!=='ok'));
ok('Einbaumenge unveraendert: Stangenpositionen summieren zur Core-Zahl',
  rs.filter(r=>r.key==='rod_std'||r.key==='rod_sonder').reduce((a,r)=>a+r.menge,0)===W.bom.gewindestangen);

// Vollständige Zuordnung -> Summe vollständig (Nenner = alle bepreisbaren Positionen)
{
  const s=SL.summe();
  const nBepreisbar=rs.filter(r=>r.bepreisbar).length;
  ok('vollständige Zuordnung -> Summe vollständig', s.vollstaendig===true && s.offen===0);
  // Nicht bepreisbar sind die nachrichtliche Dicht-Gesamtlänge ([A-6]) und die
  // Sonderzuschnitt-Positionen ([P-18], Beschaffung) — sie stehen in keinem Nenner.
  ok('nachrichtliche und Beschaffungs-Zeilen zählen nicht in den Nenner',
    s.bepreisbar===nBepreisbar && s.bepreist===nBepreisbar && nBepreisbar===rs.length-1-nSonder);
  ok('Summenanzeige nennt die Vollständigkeit',
    new RegExp('alle '+nBepreisbar+' Positionen bepreist').test(sumZeile()));
  // #62: Betrag und Vollstaendigkeit stehen in GENAU EINER Summenzeile — kein zweiter
  // Summenblock unter der Tabelle (der wurde zudem mitgedruckt).
  ok('#62 Summe steht genau einmal, in der Tabellenzeile', (()=>{
    const tb=document.getElementById('tbody').innerHTML;
    return (tb.match(/class="sum"/g)||[]).length===1
      && !/class="summe"/.test(html) && !html.includes('id="grand"') && !html.includes('id="grandNote"');
  })());
  ok('#62 vollständige Summe: Betrag mit Währung in der Summenzelle',
    new RegExp('<td>'+fmtDe2(s.summe)+' EUR</td>').test(sumZeile())
    && !/Teilsumme/.test(sumZeile()));
  const erwartet=rs.filter(r=>r.gp!=null).reduce((a,r)=>a+r.gp,0);
  ok('Summe = Σ der bepreisten Positionen', Math.abs(s.summe-erwartet)<1e-9);
}
// #58: Zu vorläufigen, fachlich unbestätigten Katalogwerten steht KEIN Hinweistext mehr in der
// Anzeige (das Feld bleibt im Katalog und in Modul 0 sichtbar) — die Preisauflösung selbst ist
// davon unberührt.
ok('#58 kein Produkt-Hinweistext zu vorläufigen Katalogwerten in der Anzeige',
  !/vorläufig/.test(document.getElementById('tbody').innerHTML)
  && KATALOG.produkte.some(p=>p.hinweis));

// Währung persistiert (über Eingabefeld)
document.getElementById('cur').value='CHF'; document.getElementById('cur').dispatch('input');
ok('Währung -> mergeEingaben', _eg.kosten.waehrung==='CHF');
document.getElementById('cur').value='EUR'; document.getElementById('cur').dispatch('input');

// #70: der frueher hier gepruefte Projektname ist ersatzlos entfallen — er wird nirgends mehr
// geschrieben (die Gesamtpruefung ueber den ganzen Lauf steht am Ende der Datei).
ok('#70 bis hierher kein einziger Schreibzugriff auf eingaben.projekt',
  !_merges.some(([t])=>t==='projekt'));

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
/** Zeilen-HTML einer Position aus dem gerenderten tbody. */
const zeileMit = txt => (document.getElementById('tbody').innerHTML.split('<tr').find(z=>z.includes(txt))||'');
/** #58: fehlende EP/GP stehen einheitlich als `n.a.` — nie als Status, Gedankenstrich oder 0. */
const naBeide = z => (z.match(/<td class="na">n\.a\.<\/td>/g)||[]).length===2
  && !/>0,00</.test(z) && !/—/.test(z);
/** #58: keine Sammelwarnliste mehr — weder als Kasten noch als Aufzählung. */
const keineWarnliste = () => !document.getElementById('tbody').innerHTML.includes('<ul>')
  && !html.includes('warnbox');

// (a) keine Auswahl
{ const r=mitRollen({i3:[]}).find(x=>x.key==='i3');
  ok('keine Auswahl -> Status keine_auswahl, kein Preis', r.status==='keine_auswahl' && r.ep===null && r.gp===null);
  const z=zeileMit('Stein i3');
  ok('#58 keine Auswahl -> EP und GP zeigen n.a., kein Nullpreis', naBeide(z));
  ok('#58 keine Auswahl -> Grund knapp und sekundär an der Zeile (nicht in der Preiszelle)',
    /<div class="grund">kein Produkt gewählt<\/div>/.test(z)
    && !/<td[^>]*>[^<]*kein Produkt gewählt/.test(z));
  ok('#58 keine Auswahl -> keine lange Warnliste', keineWarnliste());
  ok('keine Auswahl -> Summe unvollständig mit n/m', (()=>{ const s=SL.summe();
    return s.vollstaendig===false && s.bepreist===s.bepreisbar-1
      && new RegExp(s.bepreist+' von '+s.bepreisbar+' Positionen bepreist').test(sumZeile()); })());
  // #62: Ein unvollstaendiger Betrag heisst „Teilsumme“ — sonst liest er sich wie eine
  // fertige Summe. Der n-von-m-Stand steht in derselben Zeile.
  ok('#62 teilweise bepreist -> Betrag ist als Teilsumme mit n-von-m bezeichnet', (()=>{
    const s=SL.summe(), z=sumZeile();
    return s.bepreist>0 && !s.vollstaendig
      && /Teilsumme netto · \d+ von \d+ Positionen bepreist/.test(z)
      && z.includes('<td>'+fmtDe2(s.summe)+' EUR</td>'); })());
  ok('Mengen bleiben unverändert', SL.rows().map(x=>x.key+':'+x.menge).join('|')===mengenVoll);
  ok('#58 Positionsschlüssel bleiben unverändert',
    SL.rows().map(x=>x.key).join('|')===rs.map(x=>x.key).join('|'));
}
// (b) fehlende Referenz (Produkt existiert nicht im Katalog)
{ const r=mitRollen({i3:['gibts-nicht']}).find(x=>x.key==='i3');
  ok('fehlende Referenz -> Status fehlt, kein Preis', r.status==='fehlt' && r.ep===null && r.fehlend.join()==='gibts-nicht');
  ok('#58 fehlende Referenz -> n.a. + knapper Grund statt Warnliste',
    naBeide(zeileMit('Stein i3'))
    && /<div class="grund">Produkt fehlt im Katalog<\/div>/.test(zeileMit('Stein i3'))
    && keineWarnliste());
  ok('fehlende Referenz -> Referenz wird nicht still bereinigt', _eg.planung.produkte.rollen.i3.join()==='gibts-nicht');
}
// (c) Mehrdeutigkeit (zwei Produkte mit demselben maßgebenden Maß)
{ const r=mitRollen({rod_std:['rod-1100','rod-1100b']}).find(x=>x.key==='rod_std');
  ok('mehrdeutig -> kein Preis, kein erstes Produkt', r.status==='mehrdeutig' && r.ep===null && r.produkt===null);
  ok('mehrdeutig -> beide Kandidaten bleiben in den Daten', r.kandidaten.length===2);
  ok('#58 mehrdeutig -> n.a. + knapper Grund an der Zeile',
    naBeide(zeileMit(r.label)) && /<div class="grund">mehrdeutig/.test(zeileMit(r.label)));
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
  // #62: Keine einzige Position bepreist -> es gibt auch keinen Betrag. Die Summenzelle zeigt
  // `n.a.`, NIE eine erfundene 0,00, und heisst dann auch nicht „Teilsumme“.
  ok('kein Katalog -> Summenzelle n.a. statt erfundener 0,00', (()=>{ const s=SL.summe(), z=sumZeile();
    return s.summe===0 && s.vollstaendig===false && s.bepreist===0
      && /<td class="na">n\.a\.<\/td>/.test(z) && !/0,00/.test(z) && !/Teilsumme/.test(z)
      && new RegExp('0 von '+s.bepreisbar+' Positionen bepreist').test(z); })());
  ok('kein Katalog -> Mengen unverändert', rs0.map(x=>x.key+':'+x.menge).join('|')===mengenVoll);
  // #58: Bei fehlendem Katalog haette JEDE Zeile denselben Grund — das waere wieder Fuelltext.
  // Er steht einmal an der Summe; die Preiszellen bleiben trotzdem durchgehend `n.a.`.
  ok('kein Katalog -> einmal an der Summe benannt, nicht je Zeile',
    /kein Katalog geladen/.test(sumZeile())
    && !document.getElementById('tbody').innerHTML.includes('kein Bauteilkatalog geladen'));
  ok('#58 kein Katalog -> alle Preiszellen n.a. (inkl. Summenzelle), keine einzige 0,00', (()=>{
    const tb=document.getElementById('tbody').innerHTML;
    return (tb.match(/<td class="na">n\.a\.<\/td>/g)||[]).length===2*rs0.length+1 && !/>0,00</.test(tb); })());
  _kat=KATALOG; }
// (h) Menge 0 braucht kein Produkt (Kopfblech bei oberem Anschluss „Spannplatte")
{ _eg=egVoll(); const wSp=buildWall('Spannplatte oben', 2000, 2600, [], null, {top_connection:'spannplatte'});
  _we=wSp; _subs.forEach(cb=>cb());
  const r=SL.rows().find(x=>x.key==='blech_kopf');
  ok('Menge 0 -> nicht_erforderlich (keine Falschwarnung)', r.menge===0 && r.status==='nicht_erforderlich' && r.bepreisbar===false);
  ok('Menge 0 zählt nicht in den Nenner', (()=>{
    const r0=SL.rows();
    return SL.summe().bepreisbar===r0.filter(x=>x.bepreisbar).length
      && !r0.find(x=>x.key==='blech_kopf').bepreisbar; })());
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
  ok('CSV: heißt Baustellenstückliste (Einbauteile)', /SEMBLA – Baustellenstückliste \(Einbauteile\)/.test(csv));
  ok('CSV: Produkt- und Zuordnungsspalte vorhanden', /Produkt \(Katalog\);Preisbasis;Zuordnung/.test(csv));
  ok('CSV: Einbauteil-Spalten vorhanden',
    /Einbauteil;Art;Fertigmaß \(mm\);Wand;Einheit;Menge;Einbauteil-IDs;/.test(csv));
  ok('CSV: Bodenblech und Kopfblech getrennt', /Bodenblech-Modul/.test(csv) && /Kopfblech-Modul/.test(csv));
  ok('CSV: nachrichtliche Dicht-Gesamtlänge ohne Preis', /Gesamtlänge;;;Testwand;m;[\d.,]+;;;;;;nachrichtliche Menge/.test(csv));
  ok('CSV: vollständige Summe wird als solche benannt', /alle Positionen bepreist/.test(csv));
  ok('CSV: keine Latten/Verbinder/Platten-Zeile', !/Lattenstange/.test(csv) && !/^Verbinder/m.test(csv));
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
// Die Latten-Zuschnittliste bleibt als EIGENE Modul-2-Ausgabe erhalten ([Z-4]) — sie ist keine
// Stückliste. Umgekehrt darf aus ihr nichts in die Baustellenstückliste zurueckwandern.
ok('Export: Latten-Zuschnittliste bleibt eine eigene Ausgabe (nicht Teil der Stückliste)',
   AB.pts.length>0 && /fertigmass_cm/.test(zuschnittCsv(WT, eg))
   && !stuecklistePositionen(WT, eg).some(r=>['latte','verbinder','beplankung'].includes(r.key)));

// ---- [P-19] Einbauteile in der ECHTEN Modul-4-Oberfläche und im zentralen Export ---------
// Fixture mit Standardteil (zwei Standardlängen), ZWEI verschiedenen Sonderzuschnittlängen und
// Reststück ([Z-6]) — konfliktfrei. Geprüft wird das gerenderte DOM des Moduls, nicht nur die
// reine Funktion, und danach dieselbe Aussage in den Exportdateien.
const WE=buildWall('Einbauteilwand', 3000, 3000, [new Opening(6,10,4,10,'fenster')], null,
  {rod_lengths_mm:[1000,500], rod_rest_mm:300});
{
  _eg=egVoll(); _we=WE; _aktiv='w-einbauteile'; _kat=KATALOG;
  globalThis.window.__slInit();
  const rsE=SL.rows(), teile=SL.teile();
  const rod=rsE.filter(r=>r.key.startsWith('rod_'));
  const sonderLaengen=[...new Set(teile.filter(t=>t.art==='sonder').map(t=>t.fertigmass_mm))];
  ok('[P-19] Fixture hat Standardteil, 2 Sonderlängen und Reststück',
    teile.some(t=>t.art==='standard') && sonderLaengen.length>=2 && teile.some(t=>t.art==='rest'));
  ok('[P-19] Fixture ist konfliktfrei', (WE.validation.zuschnitt_konflikte||[]).length===0);
  ok('[P-19] Einbauteile = Core-Gesamtzahl', teile.length===WE.bom.gewindestangen);

  const tb=document.getElementById('tbody').innerHTML;
  ok('[P-19] Oberfläche: Tabellenkopf nennt Einbauteil, Art, Fertigmaß und Menge',
    /<th>Einbauteil<\/th>/.test(html) && /<th>Art<\/th>/.test(html) && /<th>Fertigmaß<\/th>/.test(html)
    && /<th>Menge<\/th>/.test(html));
  // #62 — DER reale Fall aus der Meldung: eine Wand mit vielen Gewindestangenstuecken. Die
  // kanonischen IDs bleiben in den Positionen und in einbauteile() vollzaehlig, erscheinen aber
  // weder im gerenderten Blatt noch in der Legende. Die Fixture bringt dafuer eine Position mit
  // deutlich mehr als zehn IDs mit (genau die Folge GS-k0.1.1, GS-k0.1.2, … aus dem Issue).
  const laengste=rsE.reduce((a,r)=>r.ids.length>a.ids.length?r:a, rsE[0]);
  ok('#62 Fixture stellt den realen Fall her: Position mit mindestens zehn Einbauteil-IDs',
    laengste.ids.length>=10 && laengste.ids.some(id=>/^GS-k\d+\.\d+\.\d+$/.test(id)));
  ok('#62 kanonische IDs bleiben in den Positionen und in einbauteile() vollzählig',
    rsE.reduce((a,r)=>a+r.ids.length,0)===teile.length
    && teile.every(t=>rsE.some(r=>r.ids.includes(t.id))));
  ok('#62 Oberfläche: keine einzige Einbauteil-ID im gerenderten Blatt',
    !teile.some(t=>tb.includes(t.id)) && !/GS-k/.test(tb) && !/class="ids"/.test(tb));
  ok('#62 Oberfläche: auch die längste ID-Liste taucht nirgends im Blatt auf',
    !tb.includes(laengste.ids.join(' ')) && !tb.includes(laengste.ids[0]));
  ok('#62 Oberfläche: jede Zeile hat genau die 6 Spalten des Blattes', (()=>{
    const zeilen=tb.split('<tr').slice(1).filter(z=>!z.includes('class="sum"'));
    return zeilen.length===rsE.length && zeilen.every(z=>(z.match(/<td/g)||[]).length===6);
  })());
  ok('#62 Oberfläche: die Summenzeile spannt genau die 6 Spalten auf', (()=>{
    const z=sumZeile();
    return /colspan="5"/.test(z) && (z.match(/<td/g)||[]).length===2;
  })());
  ok('[P-19] Oberfläche: Standardteil mit Symbol UND Klartext',
    /class="art standard"[^>]*>.*?■.*?Standardteil/.test(tb));
  ok('[P-19] Oberfläche: Sonderzuschnitt mit Symbol UND Klartext (nicht nur Farbe)',
    /class="art sonder"[^>]*>.*?◆.*?Sonderzuschnitt/.test(tb));
  ok('[P-19] Oberfläche: Reststück mit Symbol UND Klartext',
    /class="art rest"[^>]*>.*?▲.*?Reststück oben/.test(tb));
  ok('[P-19] Oberfläche: Fertigmaß je Sonderzuschnitt sichtbar',
    sonderLaengen.every(mm=>tb.includes(fmtDe(mm/10)+' cm')));
  // R1 (#62): Die Liste ist immer genau EINE Wand — die Wandreferenz steht einmal im Blattkopf
  // statt in jeder Zeile. Die CSV behaelt ihre Zeilen-Spalte unveraendert (s. u.).
  ok('[P-19]/#62 Wandreferenz einmal im Blattkopf statt je Zeile',
    document.getElementById('printkopf').innerHTML.includes('Einbauteilwand') && !/class="wand"/.test(tb));
  ok('[P-19] Oberfläche: Aggregation nachvollziehbar (Menge = Anzahl der IDs)',
    rod.length>0 && rod.every(r=>r.ids.length===r.menge));
  // #62: Die Legende erklaert weiter die drei Arten — aber nicht mehr das GS-k-ID-Schema.
  // Eine Legende zu etwas, das auf dem Blatt gar nicht steht, ist Fuelltext; erklaert wird das
  // Schema dort, wo die IDs stehen (Einbauteilliste und Zeichnungsblatt, s. u.).
  ok('[P-19] Oberfläche: Legende erklärt Standardteil, Sonderzuschnitt und Reststück', (()=>{
    const k=document.getElementById('kennz').innerHTML;
    return /■/.test(k) && /◆/.test(k) && /▲/.test(k)
      && /Standardteil/.test(k) && /Sonderzuschnitt/.test(k) && /Reststück oben/.test(k); })());
  ok('#62 Oberfläche: Legende erklärt kein ID-Schema und nennt keine ID', (()=>{
    const k=document.getElementById('kennz').innerHTML;
    return !/GS-k/.test(k) && !/Einbauteil-ID/.test(k) && !/Spannachse/.test(k)
      && !/Wand:ID/.test(k); })());
  ok('[P-19] Oberfläche: Legende zählt die Einbauteile je Art', (()=>{
    const k=document.getElementById('kennz').innerHTML;
    const summe=[...k.matchAll(/\((\d+)×\)/g)].reduce((a,m)=>a+ +m[1],0);
    return summe===teile.length; })());
  // [Z-4]/#58: Beplankung bleibt in Bildschirm UND Druck ausgeschlossen, obwohl egVoll()
  // Modul-2-Produkte vollstaendig gewaehlt hat; die Gewindestangen-Kopplung bleibt.
  ok('[Z-4] Oberfläche: keine Latten/Platten/Verbinder-Zeile',
    !/Lattenstange/.test(tb) && !/>Verbinder/.test(tb)
    && !rsE.some(r=>['latte','verbinder','beplankung'].includes(r.key)));
  ok('[Z-4] Oberfläche: Modul-2-Produkte sind gewählt und trotzdem nicht in der Liste',
    egVoll().aufbau.produkte.rollen.latte.length>0
    && egVoll().aufbau.produkte.rollen.verbinder.length>0
    && !tb.includes('Latte 1,5 m') && !tb.includes('Verbinder FA-1'));
  ok('[P-19] Oberfläche: Gewindestangen-Kopplung bleibt sichtbar', (()=>{
    const kup=rsE.find(r=>r.key==='kupplung');
    return kup && kup.menge>0 && zeileMit(kup.label).length>0; })());

  // Zentraler Export: dieselben IDs, Fertigmaße und Wandreferenzen in BEIDEN Dateien.
  const csvE=stuecklisteCsv(WE, egVoll(), {datum:'01.01.2026'}, KATALOG);
  const csvT=einbauteileCsv(WE, egVoll(), {datum:'01.01.2026'});
  ok('[P-19] Export: aggregierte CSV führt jede konkrete Einbauteil-ID', teile.every(t=>csvE.includes(t.id)));
  ok('[P-19] Export: Einzelteilliste hat eine Zeile je Einbauteil', (()=>{
    const zeilen=csvT.trim().split('\n').filter(z=>/^GS-k/.test(z));
    return zeilen.length===teile.length; })());
  ok('[P-19] Export: Einzelteilliste nennt ID, Art, Fertigmaß und Wand', teile.every(t=>
    csvT.includes([t.id,'gewindestange',(t.art==='standard'?'■ Standardteil':t.art==='sonder'?'◆ Sonderzuschnitt':'▲ Reststück oben'),
      t.fertigmass_mm,t.wand].join(';'))));
  ok('[P-19] Export: beide Dateien nennen den Kennzeichnungsschlüssel',
    /Kennzeichnung;■ Standardteil · ◆ Sonderzuschnitt · ▲ Reststück oben/.test(csvE)
    && /Einbauteil-ID: GS-k<Spannachse>/.test(csvT));
  ok('[P-19] Export: mindestens zwei Sonderzuschnittlängen als eigene Positionen',
    rsE.filter(r=>r.key==='rod_sonder'&&r.menge>0).length>=2);
  ok('[Z-4] Export: keine Latten/Verbinder in der Stücklisten-CSV',
    !/Lattenstange/.test(csvE) && !/^Verbinder/m.test(csvE));

  // Das Dateibündel des ZIP-Exports: zwei Stücklistendateien mit sprechendem Namen.
  const files=baueDateien({name:'Einbauteilwand', wandelement:WE, eingaben:egVoll()}, ['stueckliste'], KATALOG);
  ok('[P-19] ZIP: Baustellenstückliste + Einbauteilliste, eindeutig benannt',
    files.length===2 && /^Baustellenstueckliste_/.test(files[0].name)
    && /^Einbauteile_Gewindestangen_/.test(files[1].name));
  ok('[P-19] ZIP: Dateiinhalt identisch zur direkten Ableitung (kein zweiter Pfad)',
    files[0].data===stuecklisteCsv(WE, egVoll(), undefined, KATALOG)
    && files[1].data===einbauteileCsv(WE, egVoll()));

  // Dieselbe Kennung in der technischen Zeichnung ([P-19]/[D-6]).
  const blatt=blattHtml(WE, egVoll()).html;
  ok('[P-19] Zeichnung: Blatt führt dieselben konkreten Einbauteil-IDs',
    teile.every(t=>blatt.includes(t.id)));
  ok('[P-19] Zeichnung: ID-Tabelle und Kennzeichnungsschlüssel auf dem Blatt',
    /Einbauteile Gewindestangen – IDs je Spannachse/.test(blatt)
    && /Einbauteil-ID GS-k&lt;Spannachse&gt;/.test(blatt));
  ok('[P-19] Zeichnung: Mengentabelle kennzeichnet Sonderzuschnitt mit Symbol',
    /◆ Gewindestange Sonderzuschnitt/.test(blatt));
}

// ---- #70: Wandbezeichnung im Blattkopf kommt aus dem aktiven WANDEINTRAG ------------------
// Geprueft wird die echte Modul-4-Oberflaeche: zwei unterschiedlich benannte aktive Eintraege
// nacheinander, der Umbenennungsfall bei GLEICHER id, beide Rueckfaelle und der Nachweis, dass
// nichts davon schreibt. Die Bezeichnung ist reine Anzeige — Modul 4 benennt nie um.
{
  const WA=buildWall('Wandelement A', 2000, 2600, []);
  const WB=buildWall('Wandelement B', 3000, 2400, []);

  // (1) erster Eintrag mit eigenem Eintragsnamen
  _aktiv='w-name-a'; _we=WA; _name='Nordwand EG'; _eg=egVoll(); _kat=KATALOG;
  globalThis.window.__slInit();
  const merkeMerges=_merges.length;
  const k1=document.getElementById('printkopf').innerHTML;
  ok('#70 Blattkopf zeigt den Namen des aktiven Wandeintrags',
    k1.includes('Nordwand EG') && SL.wandname==='Nordwand EG');
  // Der Eintragsname ist der einzige, den ein Umbenennen mitfuehrt — er schlaegt den Namen des
  // gerechneten Wandelements, der beim Umbenennen bewusst stehen bleibt.
  ok('#70 Eintragsname schlägt den Wandelementnamen', !k1.includes('Wandelement A'));

  // (2) zweiter, anders benannter Eintrag ueber den bestehenden Storage-Abonnenten
  _aktiv='w-name-b'; _we=WB; _name='Südwand OG';
  _subs.forEach(cb=>cb());
  const k2=document.getElementById('printkopf').innerHTML;
  ok('#70 Wechsel des aktiven Eintrags aktualisiert die Bezeichnung im Blattkopf',
    k2.includes('Südwand OG') && !k2.includes('Nordwand EG') && SL.wall.length_mm===3000);

  // (3) Umbenennen bei GLEICHER id: storage.umbenennen aendert nur den Eintrag, nicht die id —
  // ohne Nachzug stuende hier weiter die alte Bezeichnung.
  _name='Südwand OG (umbenannt)'; _subs.forEach(cb=>cb());
  ok('#70 Umbenennen bei gleicher id wird nachgezogen',
    document.getElementById('printkopf').innerHTML.includes('Südwand OG (umbenannt)'));

  // (4) Rueckfaelle: erst der Wandelementname, dann eine kurze eindeutige Ersatzbezeichnung.
  _name=null; _subs.forEach(cb=>cb());
  ok('#70 ohne Eintragsnamen gilt der Wandelementname als Rückfall',
    document.getElementById('printkopf').innerHTML.includes('Wandelement B'));
  { const echt=WB.name; WB.name='';
    _subs.forEach(cb=>cb());
    ok('#70 ganz ohne Namen bleibt eine kurze eindeutige Ersatzbezeichnung sichtbar',
      SL.wandname==='(aktive Wand)'
      && document.getElementById('printkopf').innerHTML.includes('(aktive Wand)'));
    WB.name=echt; _name='Südwand OG'; _subs.forEach(cb=>cb()); }

  // (5) Die Namensanzeige selbst schreibt nichts.
  ok('#70 Namensanzeige und Namenswechsel schreiben nichts ins Datenmodell',
    _merges.length===merkeMerges);

  // (6) Waehrung bleibt die EINE persistente Eingabe der Wandebene; die Rechnung bleibt gleich.
  const mengenVor=SL.rows().map(r=>r.key+':'+r.menge).join('|');
  document.getElementById('cur').value='CHF'; document.getElementById('cur').dispatch('input');
  ok('#70 Währung bleibt einzige persistente Eingabe der Wandebene',
    _eg.kosten.waehrung==='CHF' && _merges.some(([t,p])=>t==='kosten'&&p.waehrung==='CHF')
    && !_merges.some(([t])=>t==='projekt'));
  ok('#70 Stücklistenberechnung bleibt vom Namenspfad unberührt',
    SL.rows().map(r=>r.key+':'+r.menge).join('|')===mengenVor);
  document.getElementById('cur').value='EUR'; document.getElementById('cur').dispatch('input');

  // (7) Ebenenwahl bleibt nutzbar und laesst die Wandebene unveraendert.
  SL.setzeEbene('projekt'); SL.setzeEbene('wand');
  ok('#70 Ebenenwahl bleibt nutzbar, Wandebene unverändert',
    SL.ebene==='wand' && document.getElementById('printkopf').innerHTML.includes('Südwand OG')
    && SL.rows().map(r=>r.key+':'+r.menge).join('|')===mengenVor);

  _name=null;   // Ausgangszustand fuer die folgenden Pruefungen
}

// ---- #44: die vier Ebenen in der ECHTEN Modul-4-Oberflaeche ------------------------------
// Gewechselt wird ueber die AKTIVEN Zeiger (Mappe + aktives Geschoss/Gebäude/Projekt), nicht
// ueber eine modul-eigene Auswahl. Geprueft werden Ueberschrift, Zeilen gegen die reine
// Aggregation und der Preisschalter.
{
  const OPT={rod_lengths_mm:[1000,500], rod_rest_mm:300};
  const EL={
    'w-a':{id:'w-a',name:'Wand A',wandelement:buildWall('Wand A',3000,3000,[new Opening(6,10,4,10,'fenster')],null,OPT)},
    'w-b':{id:'w-b',name:'Wand B',wandelement:buildWall('Wand B',2000,2600,[new Opening(5,11,0,10,'tuer')],null,OPT)},
    'w-c':{id:'w-c',name:'Wand C',wandelement:buildWall('Wand C',2500,2400,[],null,OPT)},
  };
  let MAPPE=leereMappe('Projekt M4',{gebaeude:'Haus',geschoss:'EG'});
  const GEB=MAPPE.gebaeude[0].id, EG=MAPPE.gebaeude[0].geschosse[0].id;
  const rOg=fuegeGeschossHinzu(MAPPE,GEB,'OG'); MAPPE=rOg.mappe; const OG=rOg.id;
  MAPPE=setzeWand(MAPPE,EG,{id:'w-a',name:'Wand A'});
  MAPPE=setzeWand(MAPPE,EG,{id:'w-b',name:'Wand B'});
  MAPPE=setzeWand(MAPPE,OG,{id:'w-c',name:'Wand C'});
  MAPPE=setzeWand(MAPPE,EG,{id:'w-weg',name:'Verwaiste Wand'});   // ohne Wandelement ([L-4])

  storeMock.holeMappe=()=>MAPPE;
  storeMock.aktivesGeschoss=()=>({gebaeude:MAPPE.gebaeude[0], geschoss:MAPPE.gebaeude[0].geschosse[0]});
  storeMock.aktivesGebaeude=()=>MAPPE.gebaeude[0];
  storeMock.holeElement=(id)=>EL[id]||null;
  storeMock.holeEingaben=()=>egVoll();
  _aktiv='w-a'; _we=EL['w-a'].wandelement; _eg=egVoll(); _kat=KATALOG;
  globalThis.window.__slInit();

  /** Reine Erwartung: Summe der kanonischen Wandstuecklisten der genannten Waende. */
  const erwartet=(ids)=>{ const m=new Map();
    for(const id of ids) for(const p of stuecklistePositionen(EL[id].wandelement, egVoll(), KATALOG)){
      const k=[p.key,p.unit,p.art||'',p.fertigmass_mm??''].join('|'); m.set(k,(m.get(k)||0)+p.menge); }
    return m; };
  const istAus=(d)=>{ const m=new Map();
    for(const p of d.positionen){ const k=[p.key,p.unit,p.art||'',p.fertigmass_mm??''].join('|'); m.set(k,(m.get(k)||0)+p.menge); }
    return m; };
  const gleich=(a,b)=>a.size===b.size&&[...a].every(([k,v])=>Math.abs((b.get(k)??NaN)-v)<1e-9);
  const zeilen=()=>document.getElementById('tbody').innerHTML.split('<tr').slice(1).filter(z=>!z.includes('class="sum"'));
  const kopfSpalten=()=>[...document.getElementById('thead').innerHTML.matchAll(/<th>([^<]*)<\/th>/g)].map(m=>m[1]);

  ok('#44 Modul 4 startet auf der Wandebene', SL.ebene==='wand' && SL.preise===true);
  ok('#44 Ebenenwahl steht als Auswahlfeld im Markup', (()=>{
    const sel=(html.match(/<select id="ebene">[\s\S]*?<\/select>/)||[''])[0];
    return ['wand','geschoss','gebaeude','projekt'].every(e=>sel.includes('value="'+e+'"'))
      && !/value="(?!wand|geschoss|gebaeude|projekt)[a-z]+"/.test(sel); })());

  // (a) Wandebene bleibt das bestehende Blatt — Ueberschrift, Spalten und Zeilen unveraendert.
  {
    const roh=stuecklistePositionen(EL['w-a'].wandelement, egVoll(), KATALOG);
    ok('#44 Wandebene: Überschrift unverändert Baustellenstückliste',
      document.getElementById('printkopf').innerHTML.includes('Baustellenstückliste · Einbauteile'));
    ok('#44 Wandebene: keine Herkunftsspalte, genau die sechs Spalten des Blattes (#62)',
      JSON.stringify(kopfSpalten())===JSON.stringify(['Einbauteil','Art','Fertigmaß','Menge','EP','GP']));
    ok('#44 Wandebene: Zeilen entsprechen exakt dem bestehenden Wandpfad',
      zeilen().length===roh.length && roh.every(r=>document.getElementById('tbody').innerHTML.includes(esc0(r.label))));
    // #62: Die Einzel-IDs bleiben in den kanonischen Positionen, stehen aber nicht im Blatt.
    ok('#44/#62 Wandebene: Einzel-IDs in den Daten vorhanden, im Blatt nicht',
      roh.some(r=>r.ids.length>0)
      && !roh.flatMap(r=>r.ids).some(id=>document.getElementById('tbody').innerHTML.includes(id)));
  }

  // (b) Geschoss, Gebäude, Projekt — jede Ebene exakt die Summe ihrer Wandstücklisten.
  for(const [ebene,ids,titel] of [['geschoss',['w-a','w-b'],'Gesamtstückliste Geschoss'],
      ['gebaeude',['w-a','w-b','w-c'],'Gesamtstückliste Gebäude'],
      ['projekt',['w-a','w-b','w-c'],'Gesamtstückliste Projekt']]){
    SL.setzeEbene(ebene);
    const d=SL.daten();
    ok(`#44 ${ebene}: Überschrift nennt die Ebene`,
      document.getElementById('printkopf').innerHTML.includes(titel+' · Einbauteile'));
    ok(`#44 ${ebene}: Mengen = reine Aggregation der Wandstücklisten`, gleich(istAus(d), erwartet(ids)));
    ok(`#44 ${ebene}: eine Tabellenzeile je aggregierter Position`, zeilen().length===d.positionen.length);
    ok(`#44 ${ebene}: Herkunftsspalte kommt hinzu und nennt jede Wand`, (()=>{
      const sp=kopfSpalten(); const tb=document.getElementById('tbody').innerHTML;
      return sp[4]==='Wände (Herkunft)' && sp.length===7
        && ids.every(id=>tb.includes(EL[id].name)); })());
    ok(`#44 ${ebene}: verwaiste Wand steht als benannte Lücke am Blatt`, (()=>{
      const l=document.getElementById('luecken');
      return !l.hidden && /Verwaiste Wand/.test(l.innerHTML) && /verwaister Eintrag/.test(l.innerHTML)
        && /UNVOLLSTÄNDIG/.test(l.innerHTML); })());
    ok(`#44 ${ebene}: keine Nullposition für die fehlende Wand`,
      d.positionen.every(p=>p.menge>0 || p.status==='nicht_erforderlich'));
  }

  // (c) Auf den Gesamtebenen bleiben die IDs je Wand qualifiziert und vollzählig — in der
  // AGGREGATION. Im Blatt stehen sie wie auf der Wandebene nicht (#62): dort waren sie sogar
  // laenger, weil jede ID zusaetzlich ihre Wandkennung trug. Die Aggregation selbst (#44) ist
  // davon unberuehrt und wird hier weiter geprueft.
  {
    SL.setzeEbene('geschoss');
    const d=SL.daten(); const tb=document.getElementById('tbody').innerHTML;
    const alle=d.positionen.flatMap(p=>p.ids);
    ok('#44 Gesamtebene: jede ID ist als Wand-ID:ID eindeutig',
      alle.length>0 && new Set(alle).size===alle.length && alle.every(x=>/^w-[a-z]+:GS-k/.test(x)));
    ok('#44 Gesamtebene: die Herkunft bleibt je Wand mit ihren IDs auflösbar',
      d.positionen.filter(p=>p.herkunft.filter(h=>h.ids.length).length>1).length>0
      && d.positionen.every(p=>p.ids.length===p.herkunft.reduce((a,h)=>a+h.ids.length,0)));
    ok('#44/#62 Gesamtebene: keine qualifizierte ID im Blatt, keine Legende dazu',
      !alle.some(id=>tb.includes(id)) && !/GS-k/.test(tb)
      && !/Wand:ID/.test(document.getElementById('kennz').innerHTML));
  }

  // (d) Preisschalter: entfernt genau Einzelpreis, Gesamtpreis und Summenbetrag.
  {
    SL.setzeEbene('geschoss'); SL.setzePreise(true);
    const mit=document.getElementById('tbody').innerHTML, mitKopf=kopfSpalten();
    const d=SL.daten();
    // Einbauteil..Herkunft. Das schliessende </tr> wird vorher entfernt: ohne Preise ist die
    // Herkunft die LETZTE Zelle der Zeile und truege es sonst mit — ein Artefakt dieses
    // Vergleichs, keine Aussage ueber die Zelle selbst.
    const mengen=z=>z.replace(/<\/tr>\s*$/,'').split('<td').slice(1,6).join('<td');
    const mitZeilen=zeilen().map(mengen);
    SL.setzePreise(false);
    const ohne=document.getElementById('tbody').innerHTML, ohneKopf=kopfSpalten();
    ok('#44 Preisschalter: EP/GP verschwinden aus dem Tabellenkopf',
      mitKopf.includes('EP') && mitKopf.includes('GP') && !ohneKopf.includes('EP') && !ohneKopf.includes('GP')
      && mitKopf.length-2===ohneKopf.length);
    ok('#44 Preisschalter: keine Preiszelle und kein Summenbetrag mehr',
      !/<td class="na">n\.a\.<\/td>/.test(ohne) && !/EUR<\/td>/.test(ohne)
      && /Preise ausgeblendet/.test(ohne));
    ok('#44 Preisschalter: Mengen und Herkunft bleiben Zeichen für Zeichen gleich',
      JSON.stringify(zeilen().map(mengen))===JSON.stringify(mitZeilen));
    ok('#44/#62 Preisschalter: das Blatt bleibt in beiden Stellungen ohne Einbauteil-IDs',
      !/GS-k/.test(mit) && !/GS-k/.test(ohne)
      && !/class="ids"/.test(mit) && !/class="ids"/.test(ohne));
    ok('#44 Preisschalter: Lückenstand bleibt sichtbar',
      !document.getElementById('luecken').hidden && /UNVOLLSTÄNDIG/.test(document.getElementById('luecken').innerHTML));
    ok('#44 Preisschalter: Mengen der Ableitung sind unverändert',
      gleich(istAus(SL.daten()), istAus(d)));
    SL.setzePreise(true);
  }

  // (e) Ohne aktives Geschoss wird die Ebene BENANNT und nicht ersetzt ([L-10]).
  {
    const alt=storeMock.aktivesGeschoss;
    storeMock.aktivesGeschoss=()=>null; storeMock.aktivesGebaeude=()=>null;
    SL.setzeEbene('geschoss');
    const d=SL.daten();
    ok('#44 kein aktives Geschoss: keine Position, benannte Lücke statt Ersatzumfang',
      d.positionen.length===0 && d.luecken.some(l=>l.art==='ebene' && /Kein aktives Geschoss/.test(l.grund))
      && /Kein aktives Geschoss/.test(document.getElementById('luecken').innerHTML));
    storeMock.aktivesGeschoss=alt; storeMock.aktivesGebaeude=()=>MAPPE.gebaeude[0];
    SL.setzeEbene('wand');
  }

  // (f) Nichts davon wird geschrieben: keine Mappe, keine Eingaben, kein Wandelement.
  {
    const vorher=_merges.length;
    SL.setzeEbene('projekt'); SL.setzePreise(false); SL.setzeEbene('wand'); SL.setzePreise(true);
    ok('#44 Ebene und Preisschalter schreiben nichts ins Datenmodell',
      _merges.length===vorher && !/setzeMappe|verorteWand|speichere\(/.test(script));
  }
}

// ---- [A-6]/#71 Abdichtung je Wand am echten Stuecklistenpfad -----------------------------
// Zwei Waende mit verschiedenem Zustand laufen durch DIESELBE Ableitung, die auch Modul 5,
// Modul 7 und der zentrale Export benutzen (`stuecklistePositionen`). Geprueft wird beides:
// die nicht abgedichtete Wand fuehrt KEINE der beiden Positionen, und die abgedichtete Wand
// liefert unveraenderte Mengen UND Preise.
{
  const wOhne=JSON.parse(JSON.stringify(W)); delete wOhne.abdichtung;      // Altbestand: kein Feld
  const wNein=Object.assign(JSON.parse(JSON.stringify(W)),{abdichtung:'nicht_abgedichtet'});
  const pMit=stuecklistePositionen(W, egVoll(), KATALOG);
  const pOhne=stuecklistePositionen(wOhne, egVoll(), KATALOG);
  const pNein=stuecklistePositionen(wNein, egVoll(), KATALOG);
  const dichtKeys=ps=>ps.filter(p=>p.key==='dicht'||p.key==='dicht_stk').map(p=>p.key);
  ok('[A-6] nicht abgedichtet: keine der beiden Dichtstreifenpositionen',
    dichtKeys(pNein).length===0 && dichtKeys(pOhne).length===0);
  ok('[A-6] abgedichtet: beide Positionen, Mengen unveraendert',
    dichtKeys(pMit).join()==='dicht_stk,dicht'
    && pMit.find(p=>p.key==='dicht_stk').menge===W.bom.stossfugen
    && Math.abs(pMit.find(p=>p.key==='dicht').menge - W.bom.dichtstreifen_mm/1000)<0.01);
  ok('[A-6] abgedichtet: Preisaufloesung unveraendert (Einbauposition bepreist, Laenge nachrichtlich)',
    pMit.find(p=>p.key==='dicht_stk').ep===0.3 && pMit.find(p=>p.key==='dicht_stk').gp>0
    && pMit.find(p=>p.key==='dicht').ep===null && pMit.find(p=>p.key==='dicht').status==='nachrichtlich');
  ok('[A-6] alle uebrigen Positionen bleiben bitgenau gleich', (()=>{
    const strip=ps=>JSON.stringify(ps.filter(p=>p.key!=='dicht'&&p.key!=='dicht_stk'));
    return strip(pOhne)===strip(pMit) && strip(pNein)===strip(pMit); })());
  ok('[A-6] Summe der nicht abgedichteten Wand ist um genau den Dichtstreifen-GP kleiner', (()=>{
    const sMit=stuecklisteSumme(pMit), sOhne=stuecklisteSumme(pOhne);
    return Math.abs((sMit.summe - sOhne.summe) - pMit.find(p=>p.key==='dicht_stk').gp)<1e-9; })());
  // Die Oberflaeche zeigt genau das — kein zweiter Filter im Modul, nur diese eine Ableitung.
  ok('[A-6] Modul 4 filtert nicht selbst (kein Abdichtungs-Zweig im Modulskript)',
    !/abdichtung/i.test(script));
  ok('[A-6] Oberflaeche einer nicht abgedichteten Wand nennt keine Dichtstreifen', (()=>{
    const vorherWe=_we, vorherId=_aktiv, vorherEg=_eg;
    // Beide Zustaende ausdruecklich setzen — `_we` traegt an dieser Stelle des Laufs laengst
    // eine andere Wand, ein „vorher/nachher“ auf ihr wuerde nichts ueber die Abdichtung sagen.
    _aktiv='w-nicht-abgedichtet'; _we=wNein; _eg=egVoll(); _subs.forEach(cb=>cb());
    const treffer=!/Dichtstreifen/.test(document.getElementById('tbody').innerHTML);
    _aktiv='w-abgedichtet'; _we=W; _eg=egVoll(); _subs.forEach(cb=>cb());
    const zurueck=/Dichtstreifen/.test(document.getElementById('tbody').innerHTML);
    _aktiv=vorherId; _we=vorherWe; _eg=vorherEg; _subs.forEach(cb=>cb());
    return treffer && zurueck; })());
}

// #70 Gesamtnachweis ueber den KOMPLETTEN Lauf: Modul 4 hat `eingaben.projekt` kein einziges Mal
// angefasst — weder ueber ein Feld, noch beim Ebenenwechsel, noch beim Laden.
ok('#70 im gesamten Lauf kein einziger Schreibzugriff auf eingaben.projekt',
  !_merges.some(([t])=>t==='projekt') && _merges.length>0);

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
