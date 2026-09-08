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
import { buildWall, Opening, wirksameZwischenpunkte } from "../../docs/shared/sembla-core.js";
import { baueDateien, einbauteileCsv, stuecklistePositionen, stuecklisteSumme, stuecklisteCsv, wandflaeche, wirksameMengen, zuschnittCsv } from "../../docs/shared/sembla-export.js";
import { einbauteile, semblaBomItems as SEMBLA_BOM_ITEMS } from "../../docs/shared/sembla-bom.js";
import { umfang, gesamtDaten, standText } from "../../docs/shared/sembla-gesamtstueckliste.js";
import { leereMappe, fuegeGeschossHinzu, setzeWand } from "../../docs/shared/sembla-projektmappe.js";
import { blattHtml } from "../../docs/shared/sembla-zeichnung.js";
import { berechneAufbau } from "../../docs/shared/sembla-aufbau.js";
import { standardEingaben, mengenKennung } from "../../docs/shared/storage.js";
// Die ECHTE Speicherschicht — fuer den realen Pfad der Mengenuebersteuerung ([P-20]) am Ende
// dieser Datei. Sie wird dort gegen einen In-Memory-localStorage betrieben; alle uebrigen
// Pruefungen laufen unveraendert gegen den leichtgewichtigen Storage-Mock.
import * as echterStore from "../../docs/shared/storage.js";

/** Deutsche Zahlformatierung wie im Modul (fuer Erwartungswerte der Oberflaechen-Pruefung). */
const fmtDe = n => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Dieselbe Formatierung wie die Betraege des Moduls (zwei Nachkommastellen). */
const fmtDe2 = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const html = readFileSync(new URL("../../docs/stueckliste.html", import.meta.url), "utf8");
// Der DOM-Mock weiter unten ersetzt das globale `URL`. Der Pfad des mitgelieferten
// Standardkatalogs wird deshalb HIER aufgeloest — der reale Pfad am Dateiende liest ihn.
const STD_KATALOG_PFAD = new URL("../../docs/vorlagen/SEMBLA_Standardkatalog.json", import.meta.url);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const script = scripts[scripts.length - 1][1];   // klassische App-Logik

class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.files=[];this.listeners={};this.dataset={};this.hidden=false;}
  // `ziel` bildet die Ereignis-DELEGATION nach: im Browser meldet sich der Behandler an der
  // Tabelle an und bekommt im `target` das tatsaechlich bediente Feld. Ohne diesen Parameter
  // verhaelt sich `dispatch` unveraendert (Ziel = das Element selbst).
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}
  dispatch(e,ziel){(this.listeners[e]||[]).forEach(f=>f({target:ziel||this,preventDefault(){}}));}
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
  { id:'senkkopf', kategorie:'verbrauch', bezeichnung:'Sechskantschraube', einheit:'Stk', preis:0.45 },
  { id:'spannmutter', kategorie:'verbrauch', bezeichnung:'Spannmutter', einheit:'Stk', preis:0.9 },
  // #92 Unterlegscheibe des Wandabschlusses: ohne Bauteilmass (keines festgelegt, keines erfunden).
  { id:'scheibe', kategorie:'verbrauch', bezeichnung:'Unterlegscheibe (vorläufig)', einheit:'Stk', preis:0.12 },
  { id:'dicht-stk', kategorie:'verbrauch', bezeichnung:'Dichtstreifen 20 cm', einheit:'Stk', preis:0.3 },
  { id:'dicht-rolle', kategorie:'verbrauch', bezeichnung:'Dichtstreifen Rollenware', einheit:'m', preis:1.5 },
  // [A-10]: Das Bodenblech wird aus REALEN Standardlaengen kombiniert — der Testkatalog
  // fuehrt deshalb die von der Testwand (2000 mm) benutzten Laengen 1250 und 750 mm.
  { id:'blech-boden-1250', kategorie:'blech_platte', bezeichnung:'Bodenblech 1250', einheit:'Stk', preis:18, breite_mm:1250, hoehe_mm:125, dicke_mm:15 },
  { id:'blech-boden-750', kategorie:'blech_platte', bezeichnung:'Bodenblech 750', einheit:'Stk', preis:12, breite_mm:750, hoehe_mm:125, dicke_mm:15 },
  { id:'blech-kopf', kategorie:'blech_platte', bezeichnung:'Kopfblech 1000', einheit:'Stk', preis:21, breite_mm:1000, hoehe_mm:125, dicke_mm:15 },
  // #96 Ausgleichsblech unter dem Bodenblech: 20 mm in Wandrichtung, 100 mm quer, 8 mm dick.
  // Ohne Maß-Diskriminator an der Rolle — eindeutig ist die Auswahl allein durch GENAU EIN
  // gewaehltes Produkt ([P-14]).
  { id:'blech-ausgleich', kategorie:'blech_platte', bezeichnung:'Ausgleichsblech 20x100', einheit:'Stk', preis:0.45, breite_mm:20, hoehe_mm:100, dicke_mm:8 },
  { id:'spannplatte', kategorie:'blech_platte', bezeichnung:'Spannplatte 120', einheit:'Stk', preis:2.4, breite_mm:120, hoehe_mm:120, dicke_mm:15,
    hinweis:'vorläufig — fachlich unbestätigt: Beispielmaße.' },
  // [A-25]/#93 Einlegeblech und Mutter am Zwischenspannpunkt: zwei GETRENNTE Bauteile aus zwei
  // verschiedenen Kategorien. Beide Rollen ohne Maß-Diskriminator — eindeutig ist die Auswahl
  // allein durch GENAU EIN gewaehltes Produkt ([P-14]).
  { id:'blech-einlege', kategorie:'blech_platte', bezeichnung:'Einlegeblech 110x30', einheit:'Stk', preis:0.35, breite_mm:110, hoehe_mm:30, dicke_mm:2 },
  { id:'mutter-einlege', kategorie:'verbrauch', bezeichnung:'Sechskantmutter M10 (Einlegeblech)', einheit:'Stk', preis:0.08 },
  // [P-24]/#95 Deckenanschluss: sieben eigene Verwendungsstellen, je ein Produkt. Die beiden
  // Scheiben und die Sechskantschraube sind ausdruecklich ANDERE Bauteile als die am Fuss bzw.
  // die (entfallene) Scheibe am Wandabschluss — sie werden nicht zusammengelegt.
  { id:'dc-winkel-wand', kategorie:'blech_platte', bezeichnung:'Winkel Wand (vorläufig)', einheit:'Stk', preis:3.1, breite_mm:60, hoehe_mm:60, dicke_mm:2 },
  { id:'dc-winkel-decke', kategorie:'blech_platte', bezeichnung:'Winkel Decke (vorläufig)', einheit:'Stk', preis:3.2, breite_mm:60, hoehe_mm:60, dicke_mm:2 },
  { id:'dc-schraube', kategorie:'verbrauch', bezeichnung:'Sechskantschraube M10 DIN 933', einheit:'Stk', preis:0.22 },
  { id:'dc-scheibe', kategorie:'verbrauch', bezeichnung:'Scheibe DIN 9021 M10', einheit:'Stk', preis:0.05 },
  { id:'dc-anker', kategorie:'verbrauch', bezeichnung:'Hohldeckenanker FHY M8', einheit:'Stk', preis:1.15 },
  { id:'dc-bohrschraube', kategorie:'verbrauch', bezeichnung:'Bohrschraube 5,5x32', einheit:'Stk', preis:0.18 },
  { id:'dc-scheibe-bohr', kategorie:'verbrauch', bezeichnung:'Scheibe DIN 9021 6,4', einheit:'Stk', preis:0.04 },
  { id:'verb-fa1', kategorie:'verbinder', bezeichnung:'Verbinder FA-1', einheit:'Stk', preis:1.2 },
  { id:'latte-1500', kategorie:'latte', bezeichnung:'Latte 1,5 m', einheit:'Stk', preis:3.5, breite_mm:40, dicke_mm:60, laenge_mm:1500 },
]};
// Vollständige Zuordnung: Modul 1 besitzt planung.produkte, Modul 2 aufbau.produkte.
// [P-18] rod_sonder wird nicht mehr gewaehlt (Beschaffung), Kopplungsmuttern sind bauteilgleich.
const ROLLEN_VOLL={ i3:['stein-i3'], i2:['stein-i2'], rod_std:['rod-1100'],
  kupplung:['kuppl-stoss'], senkkopf:['senkkopf'], spannmutter:['spannmutter'],
  spannplatte:['spannplatte'],
  // `unterlegscheibe` steht hier ABSICHTLICH weiter: die Rolle ist entfallen (Fachauskunft
  // 2026-09-08), ein gespeichertes Altprojekt kann den Schluessel aber noch tragen. Er muss
  // stillschweigend ignoriert werden und darf keine Position und keine Luecke erzeugen.
  unterlegscheibe:['scheibe'],
  blech_boden:['blech-boden-1250','blech-boden-750'],
  blech_kopf:['blech-kopf'], ausgleichsblech:['blech-ausgleich'], dicht_stk:['dicht-stk'],
  einlegeblech:['blech-einlege'], zp_mutter:['mutter-einlege'],
  dc_winkel_wand:['dc-winkel-wand'], dc_winkel_decke:['dc-winkel-decke'],
  dc_schraube:['dc-schraube'], dc_scheibe:['dc-scheibe'], dc_anker:['dc-anker'],
  dc_bohrschraube:['dc-bohrschraube'], dc_scheibe_bohr:['dc-scheibe-bohr'] };
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
// Kopfblech-Referenzfall (#92): seit dem Spannplatten-Default ([A-2]) wird `top_connection`
// hier AUSGESPROCHEN — die Blech-Pruefungen unten messen weiter den Kopfblech-Fall (der
// Spannplatten-Fall steht unveraendert als eigener Block „Menge 0 braucht kein Produkt“).
const W=Object.assign(buildWall('Testwand', 2000, 2600, [new Opening(5,11,0,10,'tuer')],
  null, {top_connection:'blech'}), { abdichtung:'abgedichtet' });
// `_name` ist der Name des WANDEINTRAGS (#70) — getrennt von `_we.name`, genau wie im echten
// Speicher: `storage.umbenennen()` aendert nur den Eintrag, nie das gerechnete Wandelement.
// Standard `null` = kein Eintragsname, damit alle Altpruefungen weiter den Wandelementnamen sehen.
let _subs=[]; let _aktiv='w-1'; let _we=W; let _eg=egVoll(); let _merges=[]; let _kat=KATALOG;
let _name=null;
const storeMock={ aktivId:()=>_aktiv, aktivesWandelement:()=>_we, aktiveEingaben:()=>_eg, holeKatalog:()=>_kat,
  aktivesElement:()=>_we?{ id:_aktiv, name:_name, wandelement:_we }:null,
  // [P-20]: die Kennung einer Position ist die ECHTE Funktion der Speicherschicht — der Mock baut
  // sie nicht nach. Einen Schreibweg (`setzeMengenUebersteuerung`) hat er bewusst NICHT: dieser
  // Block prueft nur, dass die Bedienelemente entstehen und nichts anderes verschieben; gesetzt und
  // zurueckgenommen wird ausschliesslich am Ende gegen die echte Speicherschicht.
  mengenKennung, pruefeMenge:echterStore.pruefeMenge,
  mergeEingaben:(teil,patch)=>{ _merges.push([teil,patch]); _eg[teil]=merge(_eg[teil],patch); return _aktiv; },
  abonniere:(cb)=>{ _subs.push(cb); return ()=>{}; } };
// [P-20]/#81: `wirksameMengen` ist die EINE Verrechnung von berechneter und manueller Menge.
// Sie kommt hier wie im Browser aus sembla-export.js — dieselbe Funktion, die auch die
// Stuecklistendatei des zentralen Exports fuellt; das Modul rechnet sie nicht nach.
globalThis.window.SEMBLA={ stuecklistePositionen, stuecklisteSumme, wandflaeche, einbauteile, store:storeMock,
  umfang, gesamtDaten, standText, wirksameMengen };

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

// M3: Modul 4 hat KEINE editierbaren Preisfelder mehr.
// Geprueft wird genau das — ein PREIS-Feld. Die Tabelle traegt seit [P-20] ein Mengenfeld je Zeile;
// die fruehere Pauschalpruefung „gar kein <input> unterhalb der Tabelle“ meinte nie das Mengenfeld,
// sondern die abgeschaffte Preispflege, und ist deshalb auf die Preisbindung geschaerft.
ok('kein Preis-Eingabefeld im Markup',
  !/type="number"[^>]*data-key/.test(html)
  && !/<input[^>]*data-(preis|ep|gp)\b/.test(html)
  && !/<input[^>]*data-key/.test(html));
ok('[P-20] die Tabelle trägt genau zwei Eingabefelder: Menge und Kommentar', (()=>{
  const felder=[...script.matchAll(/<input[^>]*>/g)].map(m=>m[0]);
  const menge=felder.filter(f=>/data-menge=/.test(f));
  const komm=felder.filter(f=>/data-kommentar=/.test(f));
  return felder.length===2 && menge.length===1 && /type="number"/.test(menge[0])
    && komm.length===1 && /type="text"/.test(komm[0])
    // [P-9]: kein `maxlength` — ein zu langer Kommentar wird benannt abgewiesen, nie still gekürzt.
    && !/maxlength/.test(komm[0]);
})());
// #62: Der Kommentar bekommt KEINE eigene Spalte — die reduzierte Spaltenfolge bleibt unberührt.
ok('[P-20] der Kommentar erzeugt keine neue Tabellenspalte',
  !/<th>Kommentar<\/th>/.test(html)
  && (html.match(/<col style="width:\d+%">/g)||[]).length===6);
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
// Referenzstand aller Positionen. Er wird unabhaengig von `rs` aus der Kernbaugruppe gebildet,
// damit der Vergleich nicht tautologisch ist.
const kennung92=it=>it.key+'@'+(it.fertigmass_mm==null?'-':it.fertigmass_mm)+'='+it.menge;
const VOR_92=SEMBLA_BOM_ITEMS(W).map(kennung92).join('|');
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
// Die Unterlegscheibe am Wandabschluss ist ENTFALLEN (Fachauskunft 2026-09-08, hebt #92 auf):
// am normalen oberen Wandabschluss gibt es sie am Spannglied nicht, die Spannmutter sitzt
// unmittelbar auf der Spannplatte. Geprueft wird am realen Modulpfad
// (SL.rows() -> stuecklistePositionen -> semblaBomItems).
ok('keine Unterlegscheiben-Position mehr in der Stueckliste (hebt #92 auf)',
  rs.filter(r=>r.key==='unterlegscheibe').length===0
  // Die beiden Scheiben des DECKENANSCHLUSSES sind davon ausgenommen ([P-24]): andere
  // Einbaustelle, eigene Rollen — sie sagen ueber den Wandabschluss nichts.
  && !rs.filter(r=>!r.key.startsWith('dc_')).some(r=>/Unterlegscheibe/i.test(r.label||'')));
// ERSATZLOS entfallen, NICHT auf Menge 0 gesetzt: eine Zeile mit 0 behauptet weiter eine
// Einbaustelle und waere nach [P-14] eine bepreisbare Position ohne Bauteil.
ok('die Position ist ersatzlos entfallen und steht nicht mit Menge 0 in der Liste',
  !rs.some(r=>r.key==='unterlegscheibe' && r.menge===0));
// Die Nachbarschaft schliesst sich: hinter der Spannplatte folgt unmittelbar das Einlegeblech.
ok('hinter der Spannplatte folgt unmittelbar die naechste Position', (()=>{
  const ks=rs.map(r=>r.key);
  return ks.indexOf('spannplatte')>=0 && ks[ks.indexOf('spannplatte')+1]!=='unterlegscheibe'; })());
// Alle uebrigen Mengen bleiben wertgleich — die Entfernung ist rein SUBTRAKTIV und beruehrt
// weder Rechenkern noch eine andere Position (die Spannmutternzahl bleibt unveraendert).
ok('Mengen der uebrigen Positionen unveraendert (rein subtraktiv)', (()=>{
  const ohne=rs.map(kennung92).join('|');
  return ohne===VOR_92 && VOR_92.length>0; })());
ok('die Zahl der Spannmuttern ist unberuehrt (eine je Spannplatte plus Kopfblechmuttern)',
  byKey('spannmutter').menge===W.bom.spannmuttern
  && W.bom.spannmuttern!==W.bom.spannplatten);
// #92 Die Fussschraube heisst SECHSKANTSCHRAUBE — die Positionskennung `senkkopf` und die
// Menge aus dem Rechenkern bleiben dabei unveraendert (keine Migration, kein Formatbump).
ok('Fussschraube: Bezeichnung Sechskantschraube bei unveraenderter Kennung (#92)',
  byKey('senkkopf').label==='Sechskantschraube M10×25 (Fuß)' && !/Senkkopf/.test(byKey('senkkopf').label));
ok('Fussschrauben = bom (Menge unveraendert)', byKey('senkkopf').menge===W.bom.senkkopfschrauben);
const dicht=byKey('dicht');
ok('Dichtstreifen in m = bom/1000', dicht.unit==='m' && Math.abs(dicht.menge - W.bom.dichtstreifen_mm/1000)<0.01);
ok('GP = Menge × EP', Math.abs(find('i3').gp - find('i3').menge*find('i3').ep)<1e-9);

// C ([A-1]): Boden- und Kopfblech als getrennte, getrennt bepreiste Positionen
ok('keine aggregierte Blech-Position mehr', !byKey('blech'));
// [A-10]/[A-12]: je Standardlaenge des Bodenblechs eine eigene Zeile mit Rastermass als
// maßgebendem Maß und Bauteilmass (-2 mm) als Fertigmass — keine Modulzaehlung mehr.
const bodenZeilen=()=>rs.filter(r=>r.key==='blech_boden'||r.key==='blech_boden_sonder');
ok('Bodenblech: je Kern-Teilgruppe eine Position', (()=>{
  const gr=new Map();
  for(const t of W.base_plate.teile){ const k=t.raster_mm; gr.set(k,(gr.get(k)||0)+1); }
  const z=bodenZeilen();
  return z.length===gr.size && z.every(r=>gr.get(r.fertigmass_mm+2)===r.menge); })());
ok('Bodenblech: keine Modulzaehlung mehr', !rs.some(r=>/Bodenblech-Modul/.test(r.label)));
ok('Bodenblech: Summe der Rastermasse = Wandlaenge',
  W.base_plate.teile.reduce((a,t)=>a+t.raster_mm,0)===W.length_mm);
ok('Kopfblech-Position = top_plate.module', byKey('blech_kopf').menge===(W.top_plate?W.top_plate.module:0));
ok('Aggregat = Bodenblechteile + Kopfblechmodule',
  bodenZeilen().reduce((a,r)=>a+r.menge,0)+byKey('blech_kopf').menge===W.bom.stahlblech_module);
ok('Bleche getrennt bepreist (eigene EP je Standardlaenge)',
  bodenZeilen().every(r=>r.bepreisbar && r.ep!==null) && byKey('blech_kopf').ep===21);

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
// [Z-4]: 12 feste Wandpositionen (seit #96 mit dem Ausgleichsblech, seit [A-25]/#93 mit
// Einlegeblech und Mutter; die Unterlegscheibe aus #92 ist mit der Fachauskunft 2026-09-08
// wieder ENTFALLEN) + je Gewindestangen-Standardlänge, je Sonderzuschnitt-Fertigmaß und je
// Reststück-Fertigmaß eine Position. Nichts aus dem Wandaufbau.
const nRod=rs.filter(r=>r.key==='rod_std').length, nSonder=rs.filter(r=>r.key==='rod_sonder').length;
const nRest=rs.filter(r=>r.key==='rod_rest').length;
// [P-18]: eine Kopplungsmutter-Position weniger als vorher (Fuß-Sonderausfuehrung entfaellt).
const nBoden=rs.filter(r=>r.key==='blech_boden'||r.key==='blech_boden_sonder').length;
// [P-24]/#95: dazu die SIEBEN Verwendungsstellen des Deckenanschlusses — die Testwand fuehrt
// Anschlusspunkte, also stehen sie in der Liste.
ok('Positionen = 12 Wand + 7 Deckenanschluss + Stangen- und Bodenblechgruppen (ohne Aufbau)',
  rs.length===12+7+nRod+nSonder+nRest+nBoden && rs.length>=14
  && W.deckenanschlusspunkte.length>0);
ok('[Z-4] jede Stangengruppe traegt ihr maßgebendes Maß',
  rs.filter(r=>r.key==='rod_std').every(r=>r.menge===0 || r.produktId!==null || r.status!=='ok'));
ok('Einbaumenge unveraendert: Stangenpositionen summieren zur Core-Zahl',
  rs.filter(r=>r.key==='rod_std'||r.key==='rod_sonder').reduce((a,r)=>a+r.menge,0)===W.bom.gewindestangen);

// --- #96 Ausgleichsblech: eigene Stuecklistenposition, Menge = Punktanzahl -----------------
// Gefahren wird der REALE Pfad: `buildWall` -> `semblaBom` -> `stuecklistePositionen` mit einem
// Katalog, der die Rolle belegt. Geprueft werden Menge, Nullfall, Bepreisung und — als Kern der
// Additivitaet — die Wertgleichheit ALLER uebrigen Positionen in Menge und Einzelpreis.
{
  // 3250 mm: der Abnahmefall des Pakets. ceil(3 x 3,25) = 10 Punkte ([A-20]).
  const W325=Object.assign(buildWall('Ausgleich 3,25 m', 3250, 2600, [], null,
    {top_connection:'blech'}), { abdichtung:'abgedichtet' });
  const p325=stuecklistePositionen(W325, egVoll(), KATALOG);
  const ag=p325.filter(r=>r.key==='ausgleichsblech');
  ok('#96 3,25-m-Wand: GENAU EINE Position Ausgleichsblech mit Menge 10', (()=>
    ag.length===1 && ag[0].unit==='Stk' && ag[0].menge===10
    && ag[0].menge===W325.ausgleichspunkte.length
    && ag[0].label==='Ausgleichsblech (unter dem Bodenblech)')());
  ok('#96 die Menge ist die Punktanzahl — fuer mehrere Laengen', (()=>
    [1000,2000,3250,4500].every(L=>{
      const w=buildWall('L'+L, L, 2600, []);
      const r=stuecklistePositionen(w, egVoll(), KATALOG).filter(x=>x.key==='ausgleichsblech');
      return r.length===1 && r[0].menge===w.ausgleichspunkte.length && r[0].menge>0; }))());
  ok('#96 Bepreisung ueber die bestehende Rolle ([P-14])',
    ag[0].status==='ok' && ag[0].ep===0.45 && ag[0].produktId==='blech-ausgleich'
    && Math.abs(ag[0].gp - 10*0.45)<1e-9 && ag[0].bepreisbar===true);
  // Ohne Auswahl: kein Preis, aber ein BENANNTER Grund — nie ein Nullpreis, nie ein Ersatzprodukt.
  ok('#96 ohne Auswahl: kein Preis mit benanntem Grund', (()=>{
    const e=egVoll(); e.planung.produkte.rollen.ausgleichsblech=[];
    const r=stuecklistePositionen(W325, e, KATALOG).find(x=>x.key==='ausgleichsblech');
    return r.menge===10 && r.ep===null && r.gp===null && r.produktId===null
      && r.status==='keine_auswahl' && r.statusText==='kein Produkt gewählt'
      && r.bepreisbar===true; })());
  // Zwei gewaehlte Produkte derselben Rolle sind ohne Maß-Diskriminator echt mehrdeutig.
  ok('#96 zwei Produkte: mehrdeutig statt bevorzugtem Kandidaten', (()=>{
    const kat={ ...KATALOG, produkte:[ ...KATALOG.produkte,
      { id:'blech-ausgleich-2', kategorie:'blech_platte', bezeichnung:'Ausgleichsblech 20x100 B',
        einheit:'Stk', preis:0.6, breite_mm:20, hoehe_mm:100, dicke_mm:8 } ] };
    const e=egVoll(); e.planung.produkte.rollen.ausgleichsblech=['blech-ausgleich','blech-ausgleich-2'];
    const r=stuecklistePositionen(W325, e, kat).find(x=>x.key==='ausgleichsblech');
    return r.status==='mehrdeutig' && r.ep===null && r.gp===null; })());
  // Nullfall: ein gespeichertes Wandelement VOR #96 kennt das Feld nicht.
  ok('#96 Wandelement ohne Feld `ausgleichspunkte`: Menge 0, kein Fehler, keine geratene Zahl', (()=>{
    const alt=JSON.parse(JSON.stringify(W325)); delete alt.ausgleichspunkte;
    const r=stuecklistePositionen(alt, egVoll(), KATALOG).find(x=>x.key==='ausgleichsblech');
    return r.menge===0 && r.ep===null && r.gp===null && r.bepreisbar===false
      && r.status==='nicht_erforderlich'; })());
  // M6/N2: Die Position ist rein ADDITIV — Stelle benannt, alle uebrigen Werte gleich.
  ok('#96 Stelle: hinter der Bodenblechgruppe, vor dem Kopfblech', (()=>{
    const ks=p325.map(r=>r.key), i=ks.indexOf('ausgleichsblech');
    return i>0 && ks[i+1]==='blech_kopf'
      && (ks[i-1]==='blech_boden' || ks[i-1]==='blech_boden_sonder'); })());
  ok('#96 alle uebrigen Positionen wertgleich in Menge und Einzelpreis', (()=>{
    const alt=JSON.parse(JSON.stringify(W325)); delete alt.ausgleichspunkte;
    const kanon=l=>JSON.stringify(l.filter(r=>r.key!=='ausgleichsblech')
      .map(r=>[r.key,r.menge,r.fertigmass_mm??null,r.unit,r.ep,r.gp,r.status]));
    // Gegenprobe gegen den Stand OHNE Punkte: identische Positionsfolge, identische Werte —
    // die neue Zeile bewegt keine bestehende Menge und keinen bestehenden Preis.
    return kanon(p325)===kanon(stuecklistePositionen(alt, egVoll(), KATALOG))
      && kanon(p325).length>0; })());
  ok('#96 die Summe waechst genau um den Beitrag der neuen Zeile', (()=>{
    const e=egVoll(); e.planung.produkte.rollen.ausgleichsblech=[];
    const sOhne=stuecklisteSumme(stuecklistePositionen(W325, e, KATALOG));
    const sMit=stuecklisteSumme(p325);
    return Math.abs((sMit.summe - sOhne.summe) - ag[0].gp)<1e-9
      && sMit.bepreist===sOhne.bepreist+1 && sMit.bepreisbar===sOhne.bepreisbar; })());
}

// ---- [A-25]/#93/#109 Einlegeblech und Mutter am Zwischenspannpunkt ----------------------
// Die Bleche waren in Modul 1 korrekt eingefuegt und dargestellt, fehlten in der Stueckliste
// aber vollstaendig (#109). Geprueft wird gegen `wirksameZwischenpunkte()` — die kanonische
// Ableitung des Rechenkerns — und NIE gegen eine Ersatzrechnung aus Segment- oder Lagenzahl.
{
  const WZ=Object.assign(buildWall('Zwischenspann 3,25 m', 3250, 2600, [], null,
    {top_connection:'blech'}), { abdichtung:'abgedichtet' });
  const pz=stuecklistePositionen(WZ, egVoll(), KATALOG);
  const N=wirksameZwischenpunkte(WZ).length;
  const bl=pz.filter(r=>r.key==='einlegeblech'), mu=pz.filter(r=>r.key==='zp_mutter');
  ok('#93 GENAU EINE Position Einlegeblech und EINE Mutter, Menge = wirksame Punkte', (()=>
    N>0 && bl.length===1 && mu.length===1
    && bl[0].unit==='Stk' && mu[0].unit==='Stk'
    && bl[0].menge===N && mu[0].menge===N
    && bl[0].label==='Einlegeblech (Zwischenspannpunkt)'
    && mu[0].label==='Mutter Einlegeblech M10,8 DIN 934 (von oben)')());
  ok('#93 die Menge folgt den Punkten — fuer mehrere Laengen und Hoehen', (()=>
    [[1000,2600],[2000,2600],[3250,3000],[4500,2600]].every(([L,H])=>{
      const w=buildWall('L'+L+'H'+H, L, H, []);
      const n=wirksameZwischenpunkte(w).length;
      const r=stuecklistePositionen(w, egVoll(), KATALOG);
      const b=r.filter(x=>x.key==='einlegeblech'), m=r.filter(x=>x.key==='zp_mutter');
      return b.length===1 && m.length===1 && n>0 && b[0].menge===n && m[0].menge===n; }))());
  // Zwei Punkte AUSDRUECKLICH gesetzt ([A-17]): der Abnahmefall des Pakets. Genommen wird eine
  // Wand mit GENAU EINER Spannachse, damit die Punktzahl gleich der Hoehenzahl ist — sonst
  // zaehlt `wirksameZwischenpunkte` je (Spannachse, Hoehe) und liefert ein Vielfaches.
  ok('#93 Abnahmefall: zwei wirksame Zwischenspannpunkte -> je Position die Menge 2', (()=>{
    const w=buildWall('zwei Punkte', 250, 2600, [], null,
      { zwischenpunkte_mm:[800,1600] });
    if(wirksameZwischenpunkte(w).length!==2) return false;
    const r=stuecklistePositionen(w, egVoll(), KATALOG);
    const b=r.filter(x=>x.key==='einlegeblech'), m=r.filter(x=>x.key==='zp_mutter');
    return b.length===1 && m.length===1 && b[0].menge===2 && m[0].menge===2; })());
  ok('#93 Bepreisung ueber die bestehenden Rollen ([P-14])',
    bl[0].status==='ok' && bl[0].ep===0.35 && bl[0].produktId==='blech-einlege'
    && Math.abs(bl[0].gp - N*0.35)<1e-9 && bl[0].bepreisbar===true
    && mu[0].status==='ok' && mu[0].ep===0.08 && mu[0].produktId==='mutter-einlege'
    && Math.abs(mu[0].gp - N*0.08)<1e-9 && mu[0].bepreisbar===true);
  // Ohne Auswahl: kein Preis, aber ein BENANNTER Grund — nie ein Nullpreis, nie ein Ersatzprodukt.
  ok('#93 ohne Auswahl: Menge steht, kein Preis, benannter Grund', (()=>{
    const e=egVoll(); e.planung.produkte.rollen.einlegeblech=[]; e.planung.produkte.rollen.zp_mutter=[];
    const r=stuecklistePositionen(WZ, e, KATALOG);
    const b=r.find(x=>x.key==='einlegeblech'), m=r.find(x=>x.key==='zp_mutter');
    return [b,m].every(x=> x.menge===N && x.ep===null && x.gp===null && x.produktId===null
      && x.status==='keine_auswahl' && x.statusText==='kein Produkt gewählt'
      && x.bepreisbar===true); })());
  // Zwei gewaehlte Produkte derselben Rolle sind ohne Maß-Diskriminator echt mehrdeutig.
  ok('#93 zwei Produkte je Rolle: mehrdeutig statt bevorzugtem Kandidaten', (()=>{
    const kat={ ...KATALOG, produkte:[ ...KATALOG.produkte,
      { id:'blech-einlege-2', kategorie:'blech_platte', bezeichnung:'Einlegeblech B',
        einheit:'Stk', preis:0.4, breite_mm:110, hoehe_mm:30, dicke_mm:2 },
      { id:'mutter-einlege-2', kategorie:'verbrauch', bezeichnung:'Mutter M10 B',
        einheit:'Stk', preis:0.09 } ] };
    const e=egVoll();
    e.planung.produkte.rollen.einlegeblech=['blech-einlege','blech-einlege-2'];
    e.planung.produkte.rollen.zp_mutter=['mutter-einlege','mutter-einlege-2'];
    const r=stuecklistePositionen(WZ, e, kat);
    return ['einlegeblech','zp_mutter'].every(k=>{
      const x=r.find(y=>y.key===k); return x.status==='mehrdeutig' && x.ep===null && x.gp===null; }); })());
  // Nullfall 1: ausdruecklich leerer Override ([A-17]) — „keine Zwischenspannpunkte".
  ok('#93 leerer Override: Menge 0, kein Fehler, keine geratene Zahl', (()=>{
    const w=buildWall('ohne Punkte', 3250, 2600, [], null, { zwischenpunkte_mm:[] });
    const r=stuecklistePositionen(w, egVoll(), KATALOG);
    return wirksameZwischenpunkte(w).length===0
      && ['einlegeblech','zp_mutter'].every(k=>{
        const x=r.find(y=>y.key===k);
        return x.menge===0 && x.ep===null && x.gp===null && x.bepreisbar===false
          && x.status==='nicht_erforderlich'; }); })());
  // Nullfall 2: ein gespeichertes Wandelement ohne `tension_columns` (Altbestand).
  ok('#93 Wandelement ohne `tension_columns`: Menge 0 statt geratener Zahl', (()=>{
    const alt=JSON.parse(JSON.stringify(WZ)); delete alt.tension_columns;
    const r=stuecklistePositionen(alt, egVoll(), KATALOG);
    return ['einlegeblech','zp_mutter'].every(k=>{
      const x=r.find(y=>y.key===k); return x.menge===0 && x.ep===null && x.gp===null; }); })());
  // Die Positionen sind rein ADDITIV — Stelle benannt, alle uebrigen Werte gleich.
  ok('#93 Stelle: hinter der Ankergruppe, vor der Bodenblechgruppe', (()=>{
    const ks=pz.map(r=>r.key), i=ks.indexOf('einlegeblech');
    // Zwischen der Mutter und dem Bodenblech steht seit #95 die Deckenanschlussgruppe ([P-24]).
    const blech=ks[i+2+7];
    return i>0 && ks[i-1]==='spannplatte' && ks[i+1]==='zp_mutter'
      && (blech==='blech_boden' || blech==='blech_boden_sonder'); })());
  ok('#93 Nachbarschaft Bodenblech -> Ausgleichsblech -> Kopfblech bleibt unberührt ([A-18])', (()=>{
    const ks=pz.map(r=>r.key), i=ks.indexOf('ausgleichsblech');
    return i>0 && ks[i+1]==='blech_kopf'
      && (ks[i-1]==='blech_boden' || ks[i-1]==='blech_boden_sonder'); })());
  ok('#93 alle uebrigen Positionen wertgleich in Menge und Einzelpreis', (()=>{
    const ZP=new Set(['einlegeblech','zp_mutter']);
    // Gegenprobe gegen dieselbe Wand mit leerem Override: identische Positionsfolge, identische
    // Werte — die neuen Zeilen bewegen keine bestehende Menge und keinen bestehenden Preis.
    const leer=Object.assign(buildWall('Zwischenspann 3,25 m', 3250, 2600, [], null,
      {top_connection:'blech', zwischenpunkte_mm:[]}), { abdichtung:'abgedichtet' });
    const kanon=l=>JSON.stringify(l.filter(r=>!ZP.has(r.key))
      .map(r=>[r.key,r.menge,r.fertigmass_mm??null,r.unit,r.ep,r.gp,r.status]));
    return kanon(pz)===kanon(stuecklistePositionen(leer, egVoll(), KATALOG))
      && kanon(pz).length>0; })());
  // Ein Zwischenspannpunkt ist KEIN Anker ([A-16]): die Ankerzaehlung bleibt unberührt.
  ok('#93 keine zusaetzliche Spannplatte und keine zusaetzliche Spannmutter ([A-16])', (()=>{
    const sp=pz.find(r=>r.key==='spannplatte'), sm=pz.find(r=>r.key==='spannmutter');
    return sp.menge===WZ.bom.spannplatten && sm.menge===WZ.bom.spannmuttern; })());
  ok('#93 die Summe waechst genau um den Beitrag der beiden neuen Zeilen', (()=>{
    const e=egVoll(); e.planung.produkte.rollen.einlegeblech=[]; e.planung.produkte.rollen.zp_mutter=[];
    const sOhne=stuecklisteSumme(stuecklistePositionen(WZ, e, KATALOG));
    const sMit=stuecklisteSumme(pz);
    return Math.abs((sMit.summe - sOhne.summe) - (bl[0].gp + mu[0].gp))<1e-9
      && sMit.bepreist===sOhne.bepreist+2 && sMit.bepreisbar===sOhne.bepreisbar; })());
}

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
// (a2) Ein ALTPROJEKT kann die entfallene Rolle `unterlegscheibe` noch gespeichert haben
// (Fachauskunft 2026-09-08, hebt #92 auf). Es muss GUELTIG bleiben, und die Auswahl muss
// stillschweigend wirkungslos sein: keine Position, keine benannte Luecke, keine Zeile mit
// Menge 0 und keine Aenderung der Summe. Eine nicht mehr gefuehrte Rolle ist kein Mangel.
{
  const rAlt=mitRollen({unterlegscheibe:['scheibe']});   // Auswahl wie im Altbestand
  ok('Altprojekt mit gewaehlter Unterlegscheibe: Wand bleibt gueltig, keine Position',
    Array.isArray(rAlt) && rAlt.length>0
    && !rAlt.some(x=>x.key==='unterlegscheibe')
    // Die Scheiben des Deckenanschlusses sind ausgenommen ([P-24]) — andere Einbaustelle.
    && !rAlt.filter(x=>!x.key.startsWith('dc_')).some(x=>/Unterlegscheibe/i.test(x.label||'')));
  ok('Altprojekt: die entfallene Rolle erzeugt KEINE benannte Luecke',
    !zeileMit('Unterlegscheibe (Wandabschluss)'));
  ok('Altprojekt: die Vollstaendigkeitssumme kennt die entfallene Rolle nicht', (()=>{
    const sm=SL.summe();
    return sm.bepreisbar===rAlt.filter(x=>x.bepreisbar).length; })());
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
  ok('CSV: Bodenblech je Standardlaenge und Kopfblech getrennt',
    /Bodenblech 1\.250 mm \(Bauteilmaß 1\.248 mm/.test(csv) && /Bodenblech 750 mm \(Bauteilmaß 748 mm/.test(csv)
    && /Kopfblech-Modul/.test(csv));
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
    ok('#44/#81 Wandebene: genau die sechs Spalten des Blattes (#62), unverändert',
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
    // #81: Die Herkunftsspalte ist ersatzlos entfallen — der Spaltensatz ist auf JEDER Ebene
    // derselbe wie auf der Wandebene, und kein Wandname steht mehr in einer Zeile.
    ok(`#81 ${ebene}: keine Herkunftsspalte, derselbe Spaltensatz wie die Wandebene`, (()=>{
      const sp=kopfSpalten(); const tb=document.getElementById('tbody').innerHTML;
      return JSON.stringify(sp)===JSON.stringify(['Einbauteil','Art','Fertigmaß','Menge','EP','GP'])
        && !/class="herk"/.test(tb)
        && !ids.some(id=>tb.includes(EL[id].name)); })());
    ok(`#81 ${ebene}: die Herkunft bleibt in der ABLEITUNG vollständig auflösbar`,
      d.positionen.every(p=>p.herkunft.length>=1 && p.herkunft.every(h=>h.wandId && h.wand))
      && d.positionen.every(p=>Math.abs(p.menge-p.herkunft.reduce((a,h)=>a+h.menge,0))<1e-9));
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
    ok('#44/#81 Gesamtebene: die Herkunft bleibt je Wand mit ihren IDs auflösbar — nur in den Daten',
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
    // Einbauteil..Menge (seit #81 ohne Herkunftszelle). Das schliessende </tr> wird vorher
    // entfernt: ohne Preise ist die Mengenzelle die LETZTE der Zeile und truege es sonst mit —
    // ein Artefakt dieses Vergleichs, keine Aussage ueber die Zelle selbst.
    const mengen=z=>z.replace(/<\/tr>\s*$/,'').split('<td').slice(1,5).join('<td');
    const mitZeilen=zeilen().map(mengen);
    SL.setzePreise(false);
    const ohne=document.getElementById('tbody').innerHTML, ohneKopf=kopfSpalten();
    ok('#44 Preisschalter: EP/GP verschwinden aus dem Tabellenkopf',
      mitKopf.includes('EP') && mitKopf.includes('GP') && !ohneKopf.includes('EP') && !ohneKopf.includes('GP')
      && mitKopf.length-2===ohneKopf.length);
    ok('#44 Preisschalter: keine Preiszelle und kein Summenbetrag mehr',
      !/<td class="na">n\.a\.<\/td>/.test(ohne) && !/EUR<\/td>/.test(ohne)
      && /Preise ausgeblendet/.test(ohne));
    ok('#44 Preisschalter: die Mengenzellen bleiben Zeichen für Zeichen gleich',
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

// ---- [P-20]/#81 Mengenuebersteuerung am REALEN Pfad ---------------------------------------
// Ab hier laeuft das Modul gegen die ECHTE Speicherschicht (docs/shared/storage.js) auf einem
// In-Memory-localStorage — kein Storage-Mock mehr. Bedient wird ueber das Bedienelement, das die
// Seite selbst in die Mengenzelle rendert: der Test liest dessen Attribute aus dem gerenderten
// Blatt und stellt genau daraus das Ereignisziel her. Weicht das gerenderte Markup vom Behandler
// ab, schlaegt das hier fehl.
{
  class MemStorage {
    constructor(){ this.m=new Map(); }
    getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k,v){ this.m.set(String(k), String(v)); }
    removeItem(k){ this.m.delete(k); }
    clear(){ this.m.clear(); }
  }
  globalThis.localStorage = new MemStorage();

  // Minimaler, gueltiger Katalog: er wird von der echten Schicht validiert und muss deshalb
  // wirklich der Kategorietabelle genuegen (der grosse Testkatalog oben laeuft nie durch sie).
  const KAT_ECHT = { format:'SEMBLA-Bauteilkatalog', version:1, id:'kat-p20', name:'Katalog P20',
    produkte:[{ id:'stein-i3', kategorie:'stein', bezeichnung:'Stein i3', einheit:'Stk',
                preis:9.5, breite_mm:375 }] };

  const WU = buildWall('Übersteuerungswand', 2000, 2600, []);
  const wid = echterStore.speichere('Übersteuerungswand', WU);
  echterStore.setzeAktiv(wid);
  echterStore.setzeKatalog(KAT_ECHT);
  echterStore.setzeProduktrolle('i3', ['stein-i3'], wid);

  // Umschalten auf die echte Schicht und die Seite neu starten (wie ein Seitenaufruf).
  globalThis.window.SEMBLA.store = echterStore;
  globalThis.window.__slInit();

  const tbodyEl = document.getElementById('tbody');
  const zeilen = () => tbodyEl.innerHTML.split('<tr').slice(1);
  const zeileVon = (kennung) => zeilen().find(z=>z.includes('data-menge="'+kennung+'"')) || '';
  /**
   * Attribute eines Elements aus dem gerenderten Blatt lesen (Markup ist die Quelle).
   * `merkmal` benennt das gesuchte Element eindeutig: seit dem Kommentarfeld ([P-20]) trägt
   * eine Zeile mehrere `<input>`/`<button>`, und „das erste“ wäre eine stille Wette darauf,
   * in welcher Reihenfolge die Zelleninhalte stehen.
   */
  const attrsVon = (zeile, tag, merkmal) => {
    const m = zeile.match(new RegExp('<'+tag+'\\b([^>]*\\b'+(merkmal||'')+'[^>]*)>'));
    if(!m) return null;
    const a={}; for(const t of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) a[t[1]]=t[2];
    return a;
  };
  /** data-* -> dataset (camelCase), genau wie der Browser es dem Behandler uebergibt. */
  const dsVon = (attrs) => {
    const ds={};
    for(const [k,v] of Object.entries(attrs||{})){
      if(k.startsWith('data-')) ds[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;
    }
    return ds;
  };
  const bediene = (kennung, wert) => {
    const attrs = attrsVon(zeileVon(kennung),'input','data-menge=');
    tbodyEl.dispatch('change', { dataset: dsVon(attrs), value: wert });
  };
  const setzeZurueck = (kennung) => {
    const attrs = attrsVon(zeileVon(kennung),'button','data-menge-reset=');
    tbodyEl.dispatch('click', { dataset: dsVon(attrs) });
  };
  const gespeichert = () => echterStore.holeMengen(wid);
  const berechnetI3 = SL.rows().find(r=>r.key==='i3').menge;
  const kennungI3 = mengenKennung({ key:'i3', fertigmass_mm:null });

  ok('[P-20] echte Speicherschicht aktiv: Wand, Katalog und Preis stehen',
    echterStore.aktivId()===wid && !!echterStore.holeKatalog()
    && SL.rows().find(r=>r.key==='i3').ep===9.5 && berechnetI3>0);
  ok('[P-20] Start ohne Übersteuerung: keine gespeicherten Mengen, kein Hinweisblock',
    Object.keys(gespeichert()).length===0 && document.getElementById('mhinweis').hidden===true);
  ok('[P-20] jede Zeile trägt ein Mengenfeld mit ihrer stabilen Kennung', (()=>{
    const rsK=SL.rows();
    return rsK.every(r=>zeileVon(mengenKennung(r)).length>0)
      && zeileVon(kennungI3).includes('placeholder="'+berechnetI3+'"'); })());

  // (1) Setzen — M1/M2: berechnete Menge bleibt, beide Werte stehen gleichzeitig im Blatt.
  bediene(kennungI3, '3');
  {
    const z=zeileVon(kennungI3);
    ok('[P-20] manuelle Menge wird über das Bedienelement gespeichert',
      gespeichert()[kennungI3]===3 && echterStore.holeEingaben(wid).kosten.mengen[kennungI3]===3);
    ok('[P-20] M1: die berechnete Menge bleibt unverändert abgeleitet',
      SL.rows().find(r=>r.key==='i3').menge===berechnetI3
      && stuecklistePositionen(WU, echterStore.holeEingaben(wid), echterStore.holeKatalog())
           .find(r=>r.key==='i3').menge===berechnetI3);
    ok('[P-20] M2: wirksame und berechnete Menge stehen gleichzeitig in der Zelle',
      /class="menge ueber"/.test(z) && /<span class="wirk">3 Stk<\/span>/.test(z)
      && z.includes('berechnet '+berechnetI3+' Stk') && /class="chip">manuell</.test(z));
    ok('[P-20] Gesamtpreis folgt der wirksamen Menge bei unverändertem Einzelpreis',
      z.includes('<td>'+fmtDe2(9.5)+'</td>') && z.includes('<td>'+fmtDe2(3*9.5)+'</td>'));
    ok('[P-20] die Summenzeile weist die Übersteuerung aus',
      /1 Position\(en\) mit manueller Menge/.test(sumZeile()));
    ok('[P-20] der Hinweisblock nennt Wirkung und die Fassungswahl des Exports (#81)',
      !document.getElementById('mhinweis').hidden
      && /ausdrücklich wählbar/.test(document.getElementById('mhinweis').innerHTML)
      && /ohne Wahl gilt „berechnet“/.test(document.getElementById('mhinweis').innerHTML));
    ok('[P-20] das Wandelement bleibt unangetastet',
      JSON.stringify(echterStore.holeElement(wid).wandelement)===JSON.stringify(WU));
  }

  // (2) Neuladen — M4 (erste Hälfte): der Stand überlebt den Seitenaufruf.
  globalThis.window.__slInit();
  ok('[P-20] M4: die Übersteuerung überlebt das Neuladen der Seite',
    gespeichert()[kennungI3]===3
    && /<span class="wirk">3 Stk<\/span>/.test(zeileVon(kennungI3)));

  // (3) Ändern und Zurücksetzen — M3, einzeln.
  bediene(kennungI3, '7');
  ok('[P-20] M3: eine Übersteuerung ist einzeln änderbar',
    gespeichert()[kennungI3]===7 && /<span class="wirk">7 Stk<\/span>/.test(zeileVon(kennungI3)));
  setzeZurueck(kennungI3);
  {
    const z=zeileVon(kennungI3);
    ok('[P-20] M3: Zurücksetzen entfernt genau diesen Eintrag, danach gilt die berechnete Menge',
      !(kennungI3 in gespeichert()) && !/class="menge ueber"/.test(z)
      && z.includes('>'+berechnetI3+' Stk<') && !/class="chip">manuell</.test(z));
    ok('[P-20] nach dem Zurücksetzen ist der Hinweisblock wieder leer',
      document.getElementById('mhinweis').hidden===true);
  }

  // (4) M6: unzulässige Eingaben werden benannt abgewiesen und ändern nichts.
  bediene(kennungI3, '4');
  {
    const stand = JSON.stringify(gespeichert());
    bediene(kennungI3, '-3');
    const zNeg = zeileVon(kennungI3);
    ok('[P-20] M6: eine negative Menge wird benannt abgewiesen und ändert nichts',
      JSON.stringify(gespeichert())===stand && /class="mfehler">[^<]*negativ/.test(zNeg)
      && /<span class="wirk">4 Stk<\/span>/.test(zNeg));
    bediene(kennungI3, '2,5');
    const zKrumm = zeileVon(kennungI3);
    ok('[P-20] M6: eine nicht ganzzahlige Menge wird benannt abgewiesen und ändert nichts',
      JSON.stringify(gespeichert())===stand && /class="mfehler">[^<]*ganzzahlig/.test(zKrumm));
    bediene(kennungI3, '5');
    ok('[P-20] nach einer gültigen Eingabe ist die Fehlermeldung wieder weg',
      gespeichert()[kennungI3]===5 && !/class="mfehler"/.test(zeileVon(kennungI3)));
  }

  // (5) M5: eine Übersteuerung ohne passende Position wird benannt — nie umgehängt, nie gelöscht.
  {
    const fremd='rod_std@999999';
    echterStore.setzeMengenUebersteuerung(fremd, 12, wid);
    globalThis.window.__slInit();
    const hin=document.getElementById('mhinweis').innerHTML;
    ok('[P-20] M5: nicht zuordenbare Übersteuerung wird namentlich gemeldet',
      !document.getElementById('mhinweis').hidden && hin.includes(fremd)
      && /Nicht zuordenbar/.test(hin));
    ok('[P-20] M5: sie bleibt gespeichert und wird auf keine andere Position gelegt',
      gespeichert()[fremd]===12
      && SL.rows().filter(r=>r.key==='rod_std').every(r=>!zeileVon(mengenKennung(r)).includes('class="menge ueber"')));
    // Ein unzulaessig GESPEICHERTER Wert (etwa aus einer fremden Datei) wird ebenso benannt und
    // NICHT stillschweigend angewendet oder bereinigt.
    const roh=echterStore.holeElement(wid);
    roh.eingaben.kosten.mengen[kennungI3]='viele';
    echterStore.speichere(roh.name, roh.wandelement, wid, { kosten:{ mengen:{ [kennungI3]:'viele' } } });
    globalThis.window.__slInit();
    ok('[P-20] unzulässig gespeicherter Wert: benannt, berechnete Menge gilt, nichts gelöscht',
      /Unzulässig gespeichert/.test(document.getElementById('mhinweis').innerHTML)
      && zeileVon(kennungI3).includes('>'+berechnetI3+' Stk<')
      && gespeichert()[kennungI3]==='viele');
    echterStore.setzeMengenUebersteuerung(kennungI3, null, wid);
    echterStore.setzeMengenUebersteuerung(fremd, null, wid);
  }

  // (6) Gebäude- und Projektebene bleiben bei den berechneten Mengen — und sagen es.
  // #81: „nur auf der Wandebene“ ist seit der Geschoss-Übersteuerung nicht mehr wahr; der
  // Hinweis nennt jetzt BEIDE Ebenen, auf denen eine manuelle Menge in der Anzeige wirkt.
  // Geprüft wird hier weiter die PROJEKTebene: dort wirkt keine von beiden (must_not 4).
  {
    echterStore.setzeMengenUebersteuerung(kennungI3, 3, wid);
    globalThis.window.__slInit();
    SL.setzeEbene('projekt');
    const tb=tbodyEl.innerHTML;
    ok('[P-20] Gesamtebene: kein Mengenfeld, keine übersteuerte Zelle, und die Grenze steht dran',
      !/data-menge=/.test(tb) && !/class="menge ueber"/.test(tb)
      && /Manuelle Mengen wirken in der Anzeige nur auf der Wand- und der Geschossebene/
           .test(document.getElementById('mhinweis').innerHTML));
    // #81: Die Einschränkung auf die Wandebene betrifft AUSDRÜCKLICH nur die Anzeige — für die
    // Exportdateien ist die Fassung wählbar. Ohne diesen Satz läse sich der Hinweis so, als
    // bliebe die Übersteuerung überhaupt folgenlos.
    ok('[P-20] der Hinweis sagt, dass die Wandebenen-Grenze allein die Anzeige betrifft', (()=>{
      const h=document.getElementById('mhinweis').innerHTML;
      return /betrifft <b>allein die Anzeige<\/b>/.test(h)
        && /Exports in Modul 0 ist die Mengenfassung ausdrücklich wählbar/.test(h); })());
    SL.setzeEbene('wand');
    ok('[P-20] zurück auf der Wandebene wirkt die Übersteuerung unverändert',
      /<span class="wirk">3 Stk<\/span>/.test(zeileVon(kennungI3)));
    echterStore.setzeMengenUebersteuerung(kennungI3, null, wid);
  }

  // (7) #81: Die Mengenfassung der Exportdatei ist WÄHLBAR — geprüft an den CSV-Bytes.
  // Dieselbe Wand, dieselbe gespeicherte Übersteuerung: als berechnete Fassung steht die
  // abgeleitete Menge in der Datei, als angepasste die manuelle. Beide nennen ihre Fassung
  // im Kopf, und die Preisauflösung ([P-14]) wird in keiner von beiden angefasst.
  {
    echterStore.setzeMengenUebersteuerung(kennungI3, 3, wid);
    const eingabenMit=echterStore.holeEingaben(wid);
    const opt={datum:'01.01.2026'};
    const csvBer=stuecklisteCsv(WU, eingabenMit, opt, KAT_ECHT);
    const csvAng=stuecklisteCsv(WU, eingabenMit, {...opt, fassung:'angepasst'}, KAT_ECHT);
    /** Zeile einer Position aus der CSV (Spalte 0 = Bezeichnung). */
    const csvZeile=(csv,label)=>csv.split('\n').map(z=>z.split(';')).find(z=>z[0]===label)||[];
    /** Spaltenkopf der Tabelle — Grundlage jeder Adressierung ueber Namen statt Indizes. */
    const spaltenkopfCsv=csv=>(csv.split('\n').find(z=>z.startsWith('Einbauteil;'))||'').split(';');
    const labelI3=SL.rows().find(r=>r.key==='i3').label;

    ok('#81 dieselbe Wand: berechnete Fassung trägt die abgeleitete Menge',
      csvZeile(csvBer,labelI3)[5]===String(berechnetI3));
    ok('#81 dieselbe Wand: angepasste Fassung trägt die manuelle Menge',
      csvZeile(csvAng,labelI3)[5]==='3');
    ok('#81 die angepasste Fassung führt die berechnete Menge in einer eigenen Spalte mit ([P-20])',
      /Menge;Menge berechnet;Mengenherkunft;/.test(csvAng)
      && csvZeile(csvAng,labelI3)[6]===String(berechnetI3)
      && csvZeile(csvAng,labelI3)[7]==='manuell'
      && !/Menge berechnet/.test(csvBer));
    ok('#81 beide Dateien benennen ihre Fassung im Kopf',
      /\nMengen;berechnet – abgeleitet aus dem Wandelement/.test(csvBer)
      && /\nMengen;angepasst – mit den manuellen Mengen aus Modul 4 · 1 von \d+ Position\(en\) manuell/.test(csvAng));
    ok('#81 die berechnete Fassung sagt, dass die gespeicherte Übersteuerung NICHT angewandt wurde',
      /1 gespeicherte Übersteuerung\(en\) NICHT angewandt/.test(csvBer));
    ok('#81 Gesamtpreis folgt der wirksamen Menge bei unverändertem Einzelpreis', (()=>{
      const b=csvZeile(csvBer,labelI3), a=csvZeile(csvAng,labelI3);
      // Adressiert wird ueber SPALTENNAMEN, nie ueber den Abstand zum Zeilenende: hinter
      // „Zuordnung“ liegen die angehängte Kommentarspalte (#81) und der Beschaffungsblock
      // (#113), und ein weiterer angehängter Block darf diesen Test nicht kippen.
      const iEP=csv=>spaltenkopfCsv(csv).findIndex(n=>/^EP \(/.test(n));
      const iGP=csv=>spaltenkopfCsv(csv).findIndex(n=>/^GP \(/.test(n));
      return b[iEP(csvBer)]==='9.5' && a[iEP(csvAng)]==='9.5'
        && b[iGP(csvBer)]===String(berechnetI3*9.5) && a[iGP(csvAng)]===String(3*9.5); })());
    ok('#81 ohne Fassungsangabe gilt die berechnete Fassung (Default)',
      stuecklisteCsv(WU, eingabenMit, opt, KAT_ECHT)===csvBer
      && stuecklisteCsv(WU, eingabenMit, {...opt, fassung:'quatsch'}, KAT_ECHT)===csvBer);
    ok('#81 die berechnete Fassung rechnet die Übersteuerung nirgends ein', (()=>{
      echterStore.setzeMengenUebersteuerung(kennungI3, null, wid);
      const ohne=stuecklisteCsv(WU, echterStore.holeEingaben(wid), opt, KAT_ECHT);
      echterStore.setzeMengenUebersteuerung(kennungI3, 3, wid);
      // Bis auf den Kopfvermerk (Anzahl nicht angewandter Übersteuerungen) sind beide gleich.
      const ohneKopf=t=>t.split('\n').filter(z=>!/^Mengen;/.test(z)).join('\n');
      return ohneKopf(ohne)===ohneKopf(csvBer); })());

    // Das ZIP-Bündel: die Fassung wirkt genau auf die aggregierte Liste, die Einzelteilliste
    // bleibt abgeleitet ([P-19]: IDs werden nicht erfunden) und sagt das in ihrem Kopf.
    const proj={ name:'Übersteuerungswand', wandelement:WU, eingaben:eingabenMit };
    const fBer=baueDateien(proj, ['stueckliste'], KAT_ECHT);
    const fAng=baueDateien(proj, ['stueckliste'], KAT_ECHT, { fassung:'angepasst' });
    ok('#81 baueDateien reicht die Fassung an die aggregierte Liste durch',
      fBer[0].data===stuecklisteCsv(WU, eingabenMit, undefined, KAT_ECHT)
      && fAng[0].data===stuecklisteCsv(WU, eingabenMit, { fassung:'angepasst' }, KAT_ECHT)
      && fBer[0].data!==fAng[0].data);
    ok('#81 die Einzelteilliste bleibt in beiden Fassungen bitgleich und benennt das',
      fBer[1].data===fAng[1].data
      && /\nMengen;berechnet – Einzelteile werden stets abgeleitet/.test(fAng[1].data));

    // M5 in der Datei: nicht zuordenbare und unzulässig gespeicherte Übersteuerungen werden
    // in der angepassten Fassung BENANNT und nie angewandt ([P-9]).
    {
      echterStore.setzeMengenUebersteuerung('rod_std@999999', 12, wid);
      const e2=echterStore.holeEingaben(wid);
      const mitFremd=stuecklisteCsv(WU, e2, {...opt, fassung:'angepasst'}, KAT_ECHT);
      ok('#81 nicht zuordenbare Übersteuerung: in der Datei benannt und nicht angewandt',
        /Übersteuerung nicht zuordenbar;rod_std@999999;/.test(mitFremd)
        && csvZeile(mitFremd,labelI3)[5]==='3');
      echterStore.setzeMengenUebersteuerung('rod_std@999999', null, wid);

      const roh=echterStore.holeElement(wid);
      echterStore.speichere(roh.name, roh.wandelement, wid,
        { kosten:{ mengen:{ [kennungI3]:'viele' } } });
      const mitKrumm=stuecklisteCsv(WU, echterStore.holeEingaben(wid),
        {...opt, fassung:'angepasst'}, KAT_ECHT);
      ok('#81 unzulässig gespeicherter Wert: in der Datei benannt, berechnete Menge gilt',
        new RegExp('Übersteuerung unzulässig;'+kennungI3+';').test(mitKrumm)
        && csvZeile(mitKrumm,labelI3)[5]===String(berechnetI3)
        && echterStore.holeMengen(wid)[kennungI3]==='viele');
      echterStore.setzeMengenUebersteuerung(kennungI3, null, wid);
    }
  }

  // (8) #81: Modul 4 und der Export bilden die wirksame Menge über DIESELBE Funktion.
  // Belegt an drei Stellen: die Oberfläche bekommt sie über window.SEMBLA, sie rechnet
  // nichts nach (kein eigener Verrechnungszweig mehr im Modulskript), und ihr Ergebnis ist
  // bitgleich dem, was die Datei zeigt.
  {
    echterStore.setzeMengenUebersteuerung(kennungI3, 4, wid);
    globalThis.window.__slInit();
    ok('#81 Modul 4 benutzt die gemeinsame Funktion aus sembla-export.js',
      /wirksameMengen=S\.wirksameMengen/.test(script)
      && /return wirksameMengen\(positionen, mengenMap\(\)/.test(script));
    ok('#81 das Modul rechnet die Verrechnung nicht selbst nach',
      !/__ueber\s*=\s*g\.wert/.test(script) && !/ungueltig\.push/.test(script)
      && !/Object\.keys\(map\)\.filter/.test(script));
    ok('#81 Anzeige und Datei zeigen dieselbe wirksame Menge', (()=>{
      const eng=echterStore.holeEingaben(wid);
      const soll=wirksameMengen(stuecklistePositionen(WU, eng, KAT_ECHT), eng.kosten.mengen)
        .positionen.find(p=>p.key==='i3');
      const csv=stuecklisteCsv(WU, eng, {datum:'01.01.2026', fassung:'angepasst'}, KAT_ECHT);
      const zeile=csv.split('\n').map(z=>z.split(';')).find(z=>z[0]===soll.label)||[];
      return soll.menge===4 && zeile[5]==='4'
        && /<span class="wirk">4 Stk<\/span>/.test(zeileVon(kennungI3)); })());
    echterStore.setzeMengenUebersteuerung(kennungI3, null, wid);
  }

  // (9) #81: KOMMENTAR je Position — am realen Pfad, über das reale Bedienelement.
  // Der Kommentar ist eine reine Zusatzangabe: er wird gespeichert, angezeigt und einzeln
  // entfernt, ohne Menge, Einzelpreis oder Summe des Blattes anzufassen.
  {
    globalThis.window.__slInit();
    const kommentare = () => echterStore.holeKommentare(wid);
    /** Bedient das Kommentarfeld GENAU der Zeile — Attribute kommen aus dem gerenderten Blatt. */
    const kommentiere = (kennung, text) => {
      const attrs = attrsVon(zeileVon(kennung),'input','data-kommentar=');
      tbodyEl.dispatch('change', { dataset: dsVon(attrs), value: text });
    };
    /** „Entfernen“-Knopf der Kommentarzeile (nur vorhanden, wenn ein Kommentar steht). */
    const kommentarZurueck = (kennung) => {
      const attrs = attrsVon(zeileVon(kennung),'button','data-kommentar-reset=');
      tbodyEl.dispatch('click', { dataset: dsVon(attrs) });
    };
    /** Momentaufnahme aller Mengen-, Preis- und Summenwerte des Blattes. */
    const rechenstand = () => JSON.stringify(SL.rows().map(r=>[r.key,r.fertigmass_mm,r.menge,r.ep,r.gp]))
      + '|' + JSON.stringify(SL.summe()) + '|' + sumZeile();

    ok('[P-20] jede Zeile trägt ein Kommentarfeld mit ihrer stabilen Kennung', (()=>{
      const rsK = SL.rows();
      return rsK.every(r=>zeileVon(mengenKennung(r)).includes('data-kommentar="'+mengenKennung(r)+'"'))
        && Object.keys(kommentare()).length===0; })());

    const standVorher = rechenstand();
    kommentiere(kennungI3, '  zwei Steine gebrochen  ');
    {
      const z = zeileVon(kennungI3);
      ok('[P-20] der Kommentar wird über das reale Bedienelement gespeichert — getrimmt',
        kommentare()[kennungI3]==='zwei Steine gebrochen'
        && echterStore.holeEingaben(wid).kosten.kommentare[kennungI3]==='zwei Steine gebrochen');
      ok('[P-20] er steht als Text an genau dieser Zeile (im Druck lesbar, dort ohne Bedienzeile)',
        /<div class="kommtext">.*?zwei Steine gebrochen<\/div>/.test(z)
        && /\.kfeld\{display:none!important\}/.test(html));
      ok('[P-20] er steht an keiner anderen Zeile',
        zeilen().filter(x=>x.includes('zwei Steine gebrochen')).length===1);
      ok('[P-20] Mengen, Einzelpreise und Summen des Blattes bleiben unverändert',
        rechenstand()===standVorher);
      ok('[P-20] das Wandelement bleibt unangetastet',
        JSON.stringify(echterStore.holeElement(wid).wandelement)===JSON.stringify(WU));
      ok('[P-20] der Hinweisblock nennt den Kommentar als Zusatzangabe ohne Ableitung',
        /1 Position\(en\) mit Kommentar/.test(document.getElementById('mhinweis').innerHTML)
        && /ändert keine berechnete Menge, keinen Einzelpreis und keine Summe/
             .test(document.getElementById('mhinweis').innerHTML));
    }

    // Neuladen: der Kommentar überlebt den Seitenaufruf an derselben Position.
    globalThis.window.__slInit();
    ok('[P-20] der Kommentar überlebt das Neuladen der Seite an seiner Position',
      kommentare()[kennungI3]==='zwei Steine gebrochen'
      && zeileVon(kennungI3).includes('zwei Steine gebrochen')
      && rechenstand()===standVorher);

    // Ändern und einzeln entfernen.
    kommentiere(kennungI3, 'Reserve eingerechnet');
    ok('[P-20] ein Kommentar ist einzeln änderbar',
      kommentare()[kennungI3]==='Reserve eingerechnet'
      && zeileVon(kennungI3).includes('Reserve eingerechnet'));
    kommentarZurueck(kennungI3);
    ok('[P-20] Leeren über das Bedienelement entfernt genau diesen Kommentar',
      !(kennungI3 in kommentare()) && Object.keys(kommentare()).length===0
      && !/class="kommtext"/.test(zeileVon(kennungI3))
      && rechenstand()===standVorher);

    // Unzulässige Eingabe: benannt abgewiesen, nichts gespeichert, nichts gekürzt.
    kommentiere(kennungI3, 'x'.repeat(201));
    ok('[P-20] ein zu langer Kommentar wird an der Zeile benannt abgewiesen und nicht gekürzt',
      Object.keys(kommentare()).length===0
      && /class="kfehler">[^<]*201 Zeichen/.test(zeileVon(kennungI3))
      && rechenstand()===standVorher);
    kommentiere(kennungI3, 'wieder gültig');
    ok('[P-20] nach einer gültigen Eingabe ist die Fehlermeldung weg',
      kommentare()[kennungI3]==='wieder gültig' && !/class="kfehler"/.test(zeileVon(kennungI3)));
    kommentiere(kennungI3, '');

    // Nicht zuordenbar und unzulässig gespeichert: beides benannt, beides bleibt stehen.
    {
      const fremdK='rod_std@888888';
      echterStore.setzeKommentar(fremdK, 'gehört zu nichts mehr', wid);
      echterStore.speichere('Übersteuerungswand', WU, wid,
        { kosten:{ kommentare:{ [kennungI3]: 42 } } });
      globalThis.window.__slInit();
      const hin=document.getElementById('mhinweis').innerHTML;
      ok('[P-20] ein nicht zuordenbarer Kommentar wird namentlich gemeldet und bleibt gespeichert',
        /Kommentar nicht zuordenbar/.test(hin) && hin.includes(fremdK)
        && kommentare()[fremdK]==='gehört zu nichts mehr');
      ok('[P-20] ein unzulässig gespeicherter Kommentar wird benannt und nicht angewandt',
        /Kommentar unzulässig gespeichert/.test(hin) && hin.includes(kennungI3)
        && !/class="kommtext"/.test(zeileVon(kennungI3))
        && kommentare()[kennungI3]===42);
      ok('[P-20] keiner von beiden verändert Mengen, Preise oder Summe',
        rechenstand()===standVorher);
      echterStore.setzeKommentar(fremdK, null, wid);
      echterStore.setzeKommentar(kennungI3, null, wid);
    }

    // #81: Der Kommentar steht in der Baustellenstückliste der WANDEBENE — als eigene,
    // angehängte Spalte, in beiden Mengenfassungen gleich, und ohne jede Ableitung. Geprüft
    // an den erzeugten Bytes derselben Datei, die der zentrale Export in Modul 0 schreibt.
    {
      const opt={datum:'01.01.2026'};
      /** Zeile einer Position als Zellen (Spalte 0 = Bezeichnung). */
      const zellen=(csv,label)=>csv.split('\n').map(z=>z.split(';')).find(z=>z[0]===label)||[];
      /** Kopfzeile der Tabelle (die Zeile, die mit „Einbauteil“ beginnt). */
      const spaltenkopf=csv=>(csv.split('\n').find(z=>z.startsWith('Einbauteil;'))||'').split(';');
      /**
       * Wert EINER benannten Spalte. Adressiert wird ueber den SPALTENNAMEN, seit #113
       * ausdruecklich nicht mehr ueber den Abstand zum Zeilenende: hinter „Kommentar“ steht
       * jetzt der angehängte Beschaffungsblock, und jeder weitere Anhang liesse einen
       * Endindex-Test still auf die falsche Spalte zeigen.
       */
      const spalte=(csv,label,name)=>zellen(csv,label)[spaltenkopf(csv).indexOf(name)];
      const labelI3=SL.rows().find(r=>r.key==='i3').label;
      const labelRod=SL.rows().find(r=>r.key==='rod_std').label;

      // Erst der Vergleichsstand OHNE Kommentare — er trägt die Spalte trotzdem.
      const csvLeer=stuecklisteCsv(WU, echterStore.holeEingaben(wid), opt, KAT_ECHT);
      ok('#81 die Kommentarspalte steht in jeder Wandstückliste, hinter „Zuordnung“',
        spaltenkopf(csvLeer).indexOf('Kommentar')===spaltenkopf(csvLeer).indexOf('Zuordnung')+1
        && /\nKommentare;0 von \d+ Position\(en\) kommentiert/.test(csvLeer));
      ok('#81 eine Position ohne Kommentar hat eine leere Zelle ohne Platzhalter',
        spalte(csvLeer,labelI3,'Kommentar')===''
        && spalte(csvLeer,labelRod,'Kommentar')==='');

      echterStore.setzeKommentar(kennungI3, 'zwei Steine gebrochen', wid);
      const eng=echterStore.holeEingaben(wid);
      const csvBer2=stuecklisteCsv(WU, eng, opt, KAT_ECHT);
      const csvAng2=stuecklisteCsv(WU, eng, {...opt, fassung:'angepasst'}, KAT_ECHT);
      ok('#81 der Kommentar steht in der Datei an genau seiner Position',
        spalte(csvBer2,labelI3,'Kommentar')==='zwei Steine gebrochen'
        && spalte(csvBer2,labelRod,'Kommentar')===''
        && /\nKommentare;1 von \d+ Position\(en\) kommentiert/.test(csvBer2));
      ok('#81 beide Mengenfassungen tragen denselben Kommentar an derselben Position',
        spalte(csvAng2,labelI3,'Kommentar')==='zwei Steine gebrochen'
        && spalte(csvAng2,labelRod,'Kommentar')===''
        && spaltenkopf(csvAng2).includes('Kommentar'));

      // [P-20]: keine Ableitung — SPALTENWEISE gegen den Stand ohne Kommentar geprüft.
      // Ein Roh-Byte-Vergleich der ganzen Datei ginge nicht: die Spalte ist immer da.
      ok('#81 alle übrigen Spalten und die Summen bleiben wertgleich', (()=>{
        const zeilenOhne=csvLeer.split('\n'), zeilenMit=csvBer2.split('\n');
        if(zeilenOhne.length!==zeilenMit.length) return false;
        return zeilenOhne.every((zo,i)=>{
          const zm=zeilenMit[i];
          if(/^Kommentare;/.test(zo)) return /^Kommentare;/.test(zm);
          // Datenzeilen: alles AUSSER der Kommentarzelle muss gleich sein — die Spalte wird
          // namentlich ausgeschnitten, damit der angehängte Beschaffungsblock (#113)
          // mitgeprüft und nicht versehentlich mit ausgeblendet wird.
          const iK=spaltenkopf(csvLeer).indexOf('Kommentar');
          const a=zo.split(';'), b=zm.split(';');
          if(a.length!==b.length) return false;
          const ohneK=x=>x.filter((_,j)=>j!==iK).join(';');
          return ohneK(a)===ohneK(b);
        }); })());
      ok('#81 der Kommentar ändert Menge, Einzelpreis und Gesamtsumme nicht',
        spalte(csvBer2,labelI3,'Menge')===spalte(csvLeer,labelI3,'Menge')
        && spalte(csvBer2,labelI3,spaltenkopf(csvLeer).find(n=>/^EP \(/.test(n)))
           ===spalte(csvLeer,labelI3,spaltenkopf(csvLeer).find(n=>/^EP \(/.test(n)))
        && csvBer2.split('\n').find(z=>z.startsWith('Summe netto;'))
           ===csvLeer.split('\n').find(z=>z.startsWith('Summe netto;')));

      // Die Einzelteilliste bleibt ausdrücklich unberührt ([P-19]).
      ok('#81 die Einzelteilliste der Gewindestangen führt keinen Kommentar',
        !einbauteileCsv(WU, eng, opt).includes('zwei Steine gebrochen')
        && !/Kommentar/.test(einbauteileCsv(WU, eng, opt)));

      // Sonderzeichen: ein Kommentar mit Semikolon und Anführungszeichen muss die CSV
      // nicht zerlegen — er läuft durch dasselbe Quoting wie jede andere Zelle.
      {
        echterStore.setzeKommentar(kennungI3, 'Bruch; "Rest" bleibt', wid);
        const csvQ=stuecklisteCsv(WU, echterStore.holeEingaben(wid), opt, KAT_ECHT);
        const zeile=csvQ.split('\n').find(z=>z.startsWith(labelI3+';'))||'';
        ok('#81 ein Kommentar mit Semikolon/Anführungszeichen wird korrekt maskiert', (()=>{
          // Zerlegt wird QUOTING-BEWUSST: das naive `split(';')` zerrisse genau die Zelle,
          // um die es hier geht. Geprüft wird, dass der Text ungekürzt in seiner Spalte
          // ankommt und die Zeile die reguläre Spaltenzahl behält — hinter dem Kommentar
          // steht seit #113 der Beschaffungsblock, ein Endindex trüge hier nicht mehr.
          const zellenQ=(z)=>{const out=[];let c='',q=false;
            for(let i=0;i<z.length;i++){const ch=z[i];
              if(q){ if(ch==='"'){ if(z[i+1]==='"'){c+='"';i++;} else q=false; } else c+=ch; }
              else if(ch==='"') q=true;
              else if(ch===';'){out.push(c);c='';}
              else c+=ch;}
            out.push(c); return out;};
          const k=spaltenkopf(csvQ), zq=zellenQ(zeile);
          return zeile.includes('"Bruch; ""Rest"" bleibt"')
            && zq.length===k.length
            && zq[k.indexOf('Kommentar')]==='Bruch; "Rest" bleibt'
            && csvQ.split('\n').length===csvBer2.split('\n').length; })());
        echterStore.setzeKommentar(kennungI3, 'zwei Steine gebrochen', wid);
      }

      // Nicht zuordenbar / unzulässig gespeichert: benannt, nie als Positionswert ([P-9]).
      {
        const fremdK='rod_std@999999';
        echterStore.setzeKommentar(fremdK, 'gehört zu nichts mehr', wid);
        const csvF=stuecklisteCsv(WU, echterStore.holeEingaben(wid), opt, KAT_ECHT);
        ok('#81 ein nicht zuordenbarer Kommentar wird in der Datei benannt, nicht angewandt',
          csvF.includes('Kommentar nicht zuordenbar;'+fremdK+';')
          && zellen(csvF,labelRod).at(-1)===''
          && echterStore.holeKommentare(wid)[fremdK]==='gehört zu nichts mehr');
        echterStore.setzeKommentar(fremdK, null, wid);

        const roh=echterStore.holeElement(wid);
        echterStore.speichere(roh.name, roh.wandelement, wid,
          { kosten:{ kommentare:{ [kennungI3]: 42 } } });
        const csvU=stuecklisteCsv(WU, echterStore.holeEingaben(wid), opt, KAT_ECHT);
        ok('#81 ein unzulässig gespeicherter Kommentar wird benannt und bleibt gespeichert',
          new RegExp('Kommentar unzulässig gespeichert;'+kennungI3+';').test(csvU)
          && zellen(csvU,labelI3).at(-1)===''
          && echterStore.holeKommentare(wid)[kennungI3]===42);
      }
      echterStore.setzeKommentar(kennungI3, null, wid);
      ok('#81 ohne gespeicherten Kommentar ist die Datei wieder der Ausgangsstand',
        stuecklisteCsv(WU, echterStore.holeEingaben(wid), opt, KAT_ECHT)===csvLeer);
    }

    // Auf den Gesamtebenen gibt es kein Kommentarfeld (dort fehlt die Positionskennung).
    {
      echterStore.setzeKommentar(kennungI3, 'wandbezogen', wid);
      globalThis.window.__slInit();
      SL.setzeEbene('projekt');
      const tbG=tbodyEl.innerHTML;
      ok('[P-20] Gesamtebene: kein Kommentarfeld, kein Kommentartext, und es steht dran',
        !/data-kommentar=/.test(tbG) && !/class="kommtext"/.test(tbG)
        && /Kommentare gehören zu einer einzelnen Wand/
             .test(document.getElementById('mhinweis').innerHTML));
      SL.setzeEbene('wand');
      ok('[P-20] zurück auf der Wandebene steht der Kommentar unverändert',
        zeileVon(kennungI3).includes('wandbezogen'));
      echterStore.setzeKommentar(kennungI3, null, wid);
    }

    // Der Kommentar hat mit der Mengenübersteuerung nichts zu tun — beide sind unabhängig.
    {
      echterStore.setzeMengenUebersteuerung(kennungI3, 6, wid);
      globalThis.window.__slInit();
      kommentiere(kennungI3, 'Bruchreserve');
      ok('[P-20] Kommentar und manuelle Menge stehen unabhängig nebeneinander',
        echterStore.holeMengen(wid)[kennungI3]===6
        && kommentare()[kennungI3]==='Bruchreserve'
        && /<span class="wirk">6 Stk<\/span>/.test(zeileVon(kennungI3))
        && zeileVon(kennungI3).includes('Bruchreserve'));
      setzeZurueck(kennungI3);
      ok('[P-20] das Zurücksetzen der Menge lässt den Kommentar stehen',
        !(kennungI3 in echterStore.holeMengen(wid))
        && kommentare()[kennungI3]==='Bruchreserve');
      kommentarZurueck(kennungI3);
      ok('[P-20] das Entfernen des Kommentars lässt die Mengenübersteuerung unberührt', (()=>{
        echterStore.setzeMengenUebersteuerung(kennungI3, 6, wid);
        globalThis.window.__slInit();
        kommentiere(kennungI3, 'noch einer');
        kommentarZurueck(kennungI3);
        const ok2 = echterStore.holeMengen(wid)[kennungI3]===6 && Object.keys(kommentare()).length===0;
        echterStore.setzeMengenUebersteuerung(kennungI3, null, wid);
        return ok2; })());
    }
  }
}

// #70 Gesamtnachweis ueber den KOMPLETTEN Lauf: Modul 4 hat `eingaben.projekt` kein einziges Mal
// angefasst — weder ueber ein Feld, noch beim Ebenenwechsel, noch beim Laden.
ok('#70 im gesamten Lauf kein einziger Schreibzugriff auf eingaben.projekt',
  !_merges.some(([t])=>t==='projekt') && _merges.length>0);

// ---- [A-25]/#93/#109 REALER PFAD: echter Speicher + mitgelieferter Standardkatalog --------
// Der Nachweis, der #109 schliesst: eine im RECHENKERN gerechnete Wand mit Zwischenspannpunkten
// wird ueber die ECHTE Speicherschicht aktiv gesetzt, der MITGELIEFERTE Standardkatalog wird
// geladen und nach [P-18] vorbelegt — und dann muss das im DOM gerenderte Blatt von Modul 4
// beide Bauteile mit Menge UND Preis zeigen. Geprueft wird am gerenderten Markup, nicht an einer
// Zwischenrechnung; die Menge wird gegen `wirksameZwischenpunkte()` gehalten.
{
  class MemStorage2 {
    constructor(){ this.m=new Map(); }
    getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k,v){ this.m.set(String(k), String(v)); }
    removeItem(k){ this.m.delete(k); }
    clear(){ this.m.clear(); }
  }
  globalThis.localStorage = new MemStorage2();

  const STD = JSON.parse(readFileSync(STD_KATALOG_PFAD, "utf8"));
  const WR = buildWall('Einlegeblechwand', 3250, 2600, []);
  const N = wirksameZwischenpunkte(WR).length;
  const wid = echterStore.speichere('Einlegeblechwand', WR);
  echterStore.setzeAktiv(wid);
  echterStore.setzeKatalog(STD);
  // [P-18] Standardauswahl: sie belegt NUR leere Rollen und ist danach eine ganz normale,
  // sichtbare Auswahl. Genau das ist der Weg, den Modul 1 beim Rendern geht.
  const vorbelegt = echterStore.vorbelegeProduktrollen(null, wid);

  globalThis.window.SEMBLA.store = echterStore;
  globalThis.window.__slInit();

  const zeilenR = () => document.getElementById('tbody').innerHTML.split('<tr').slice(1);
  const zeileMit = (label) => zeilenR().find(z=>z.includes(label)) || '';

  ok('#109 realer Pfad: aktive Wand, geladener Standardkatalog, Punkte vorhanden',
    echterStore.aktivId()===wid && !!echterStore.holeKatalog() && N>0);
  ok('#93 der Standardkatalog belegt beide Rollen mit GENAU EINEM Produkt vor ([P-18])',
    JSON.stringify(vorbelegt.gesetzt.einlegeblech)===JSON.stringify(['blech-einlegeblech-110'])
    && JSON.stringify(vorbelegt.gesetzt.zp_mutter)===JSON.stringify(['verbrauch-mutter-m10-einlege'])
    && !vorbelegt.offen.includes('einlegeblech') && !vorbelegt.offen.includes('zp_mutter'));
  ok('#109 das gerenderte Blatt fuehrt Einlegeblech und Mutter ueberhaupt', (()=>
    !!zeileMit('Einlegeblech (Zwischenspannpunkt)')
    && !!zeileMit('Mutter Einlegeblech M10,8 DIN 934 (von oben)'))());
  ok('#109 beide Zeilen zeigen die Menge der wirksamen Zwischenspannpunkte', (()=>
    ['Einlegeblech (Zwischenspannpunkt)','Mutter Einlegeblech M10,8 DIN 934 (von oben)']
      .every(l=>zeileMit(l).includes('>'+N.toLocaleString('de-DE')+' Stk')))());
  ok('#109 beide Zeilen sind bepreist (Einzel- und Gesamtpreis stehen im Blatt)', (()=>{
    const rs2=stuecklistePositionen(WR, echterStore.holeEingaben(wid), echterStore.holeKatalog());
    const b=rs2.find(r=>r.key==='einlegeblech'), m=rs2.find(r=>r.key==='zp_mutter');
    return b.status==='ok' && m.status==='ok' && b.menge===N && m.menge===N
      && b.ep===0.35 && m.ep===0.08
      && Math.abs(b.gp - N*0.35)<1e-9 && Math.abs(m.gp - N*0.08)<1e-9
      && zeileMit('Einlegeblech (Zwischenspannpunkt)').includes(fmtDe2(N*0.35))
      && zeileMit('Mutter Einlegeblech M10,8 DIN 934 (von oben)').includes(fmtDe2(N*0.08)); })());
  // Gegenprobe [P-14]: eine leergeraeumte Rolle bleibt leer (die Vorbelegung ueberschreibt nie
  // eine getroffene Wahl) und die Zeile steht mit Menge, aber ohne Preis und mit Grund.
  ok('#93 ohne Auswahl im echten Speicher: Menge steht, kein Preis, benannter Grund', (()=>{
    echterStore.setzeProduktrolle('einlegeblech', [], wid);
    globalThis.window.__slInit();
    const rs2=stuecklistePositionen(WR, echterStore.holeEingaben(wid), echterStore.holeKatalog());
    const b=rs2.find(r=>r.key==='einlegeblech');
    const z=zeileMit('Einlegeblech (Zwischenspannpunkt)');
    return b.menge===N && b.ep===null && b.gp===null && b.status==='keine_auswahl'
      && z.includes('>'+N.toLocaleString('de-DE')+' Stk')
      && /kein Produkt gew(ä|&auml;)hlt/.test(z); })());
  // [P-18] Gegenprobe: Modul 4 belegt NICHT vor — die leergeraeumte Rolle bleibt beim erneuten
  // Seitenaufruf leer. (Ein ausdruecklicher Vorbelegungslauf wuerde sie wieder fuellen; das ist
  // der Weg von Modul 1 und hier ausdruecklich nicht gegangen.)
  ok('#93 Modul 4 belegt nicht vor: die leergeraeumte Rolle bleibt ueber den Seitenaufruf leer', (()=>{
    globalThis.window.__slInit();
    const ids=echterStore.holeEingaben(wid).planung.produkte.rollen.einlegeblech;
    return Array.isArray(ids) && ids.length===0
      && stuecklistePositionen(WR, echterStore.holeEingaben(wid), echterStore.holeKatalog())
           .find(r=>r.key==='einlegeblech').status==='keine_auswahl'; })());
  // Das Wandelement bleibt unangetastet: Modul 4 liest nur ([P-1]).
  ok('#109 Modul 4 hat das Wandelement nicht angefasst',
    JSON.stringify(echterStore.holeElement(wid).wandelement)===JSON.stringify(WR));
}

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
