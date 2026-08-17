// Fokussierter Test: Aenderungsliste „Was ist neu?" (Modul 8, Issues #48/#55).
//
// Prueft den PRODUKTIONS-Baustein docs/shared/sembla-blog.js und den echten Datensatz
// docs/shared/blog-eintraege.js direkt — nicht ueber Stubs:
//   * Validator: eindeutige IDs, Pflichtfelder, Sortierung neu->alt, Issue-Referenzen,
//     verbotene Inhalte (E-Mails, Tokens, absolute lokale Pfade, Issue-Body-Text),
//   * Textwaechter `pruefeText` als eigener, wiederverwendbarer Baustein (der
//     Umsetzungsplan prueft seine Prosa damit — es gibt nur EINEN Waechter),
//   * Ansicht „Was ist neu?": Karten mit chg-Ankern, Escaping,
//   * Deep-Links (#chg-…, #issue-…),
//   * dass der GitHub-Pfad seit #55 vollstaendig entfallen ist.
//
// Checkout-autark: es wird NICHTS aus dem Netz geladen.

import { readFileSync } from "node:fs";
import * as B from "../../docs/shared/sembla-blog.js";
import { EINTRAEGE, BLOG_FORMAT, BLOG_VERSION } from "../../docs/shared/blog-eintraege.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);

// --- 1) Format und echter Datensatz ---------------------------------------
ok("Formatname und -version sind gesetzt", BLOG_FORMAT === "SEMBLA-Blog" && BLOG_VERSION === 1);
ok("EINTRAEGE ist eine nicht leere Liste", Array.isArray(EINTRAEGE) && EINTRAEGE.length >= 1);

const echt = B.pruefeEintraege();
if (!echt.ok) console.log("  Validator-Fehler im echten Datensatz: " + JSON.stringify(echt.fehler));
ok("der echte Datensatz besteht den Validator", echt.ok);

const seed = EINTRAEGE.find(e => e.id === "chg-20260805-01");
ok("Seed-Eintrag der Aktivierung vorhanden", !!seed);
ok("Seed-Eintrag verweist auf Issue 48 und ist ein feature",
  seed && seed.issue === 48 && seed.typ === "feature" && seed.datum === "2026-08-05");
ok("Seed-Eintrag enthaelt eine Testbitte", seed && typeof seed.testbitte === "string" && seed.testbitte.length > 10);

// Produktauftrag #55 bleibt genau einmal dokumentiert; die neuesten drei Einträge sind belegt.
const neu55 = EINTRAEGE.filter(e => e.issue === 55);
const neu15 = EINTRAEGE.filter(e => e.issue === 15 && e.datum === "2026-08-11");
ok("genau ein Eintrag fuer Issue 55", neu55.length === 1);
ok("zwei getrennte aktuelle Korrekturen fuer Issue 15", neu15.length === 2);
const neu22 = EINTRAEGE.filter(e => e.issue === 22);
ok("genau ein Eintrag fuer Issue 22 (Baustellenstueckliste)", neu22.length === 1);
// #88 (Auswahl unter uebereinanderliegenden Waenden — der offene Restpunkt des Issues)
// ist der NEUESTE Eintrag; die bisherige Reihe rueckt geschlossen um eins nach hinten.
// Ueber `EINTRAEGE` zaehlen damit: #88 (Auswahl), #90 (sichtbare
// Verzahnungsbereiche), #88 (Initialposition duplizierter und zugeordneter Waende), #85
// (Mitloeschen), #83 (Verzahnungs-Nachweis) und #81 (Kommentar je
// Stuecklistenposition).
// Ueber `NEU` zaehlen deshalb: #82
// (Verzahnungs-Roundtrip), #83 (Lageplan), #59 (vollstaendig sichtbare Nummernblasen
// im Lageplan), #82 (Verzahnung auf der technischen Wandzeichnung) und #83 (zulaessige
// Verzahnung im Geschosseditor). Die darauf folgenden Zusicherungen zaehlen ueber
// `AKTUELL`: #81 (Mengenfassung der Gesamtstueckliste), #82 (Verzahnungsbereiche in
// Modul 1), #59 (ueberdeckungsfreie Nummernblasen), #81 (waehlbare Mengenfassung der
// Wand), #79 (technische Wandzeichnung), #79 (Geschosseditor), #79 (Lageplan),
// #81 (Mengenuebersteuerung), #79 (Wahl in Modul 1) und #80. Die aelteren Eintraege
// zaehlen ueber `AELTER` — so bleibt jede Positionsaussage erhalten, ohne 60 Indizes
// zu drehen.
const NEU = EINTRAEGE.slice(6);
const AKTUELL = EINTRAEGE.slice(11);
const AELTER = EINTRAEGE.slice(21);
// Der neueste Eintrag macht die gemeinte Wand unter UEBEREINANDERLIEGENDEN Waenden
// waehlbar (#88, offener Restpunkt). Aussagewahr heisst hier: es wird durch erneutes
// KLICKEN weitergeschaltet, und die Oberflaeche sagt, welche Wand jetzt gemeint ist.
// Behauptet werden darf KEIN Auswahlmenue, kein neues Werkzeug und keine geaenderte
// Lage, Bemassung oder Kollisionspruefung ([K-10]/[K-13]/[P-9]).
ok("die Auswahl unter uebereinanderliegenden Waenden (Issue 88) ist der neueste Eintrag",
  EINTRAEGE[0]?.id === "chg-20260817-04" && EINTRAEGE[0]?.issue === 88
  && EINTRAEGE[0]?.typ === "fix" && EINTRAEGE[0]?.datum === "2026-08-17");
ok("der Auswahl-Eintrag benennt Ausgangslage, Ort und Bedienweg aussagewahr",
  /übereinanderliegenden Wänden/.test(EINTRAEGE[0]?.titel || "")
  && /Geschossplan/.test(EINTRAEGE[0]?.titel || "")
  && /erneutes Klicken/.test(EINTRAEGE[0]?.titel || "")
  && /wählbar/.test(EINTRAEGE[0]?.titel || "")
  // Es ist KEIN Menue und KEIN neues Werkzeug entstanden.
  && !/Menü|Popup|Werkzeug|Liste/i.test(EINTRAEGE[0]?.titel || ""));
ok("die Auswahl-Testbitte benennt Aufbau, Weiterschalten, Meldezeile und das Verschieben",
  /Geschosseditor/.test(EINTRAEGE[0]?.testbitte || "")
  && /mehrfach/.test(EINTRAEGE[0]?.testbitte || "")
  && /anklicken/.test(EINTRAEGE[0]?.testbitte || "")
  && /nächste der dort liegenden Wände aktiv/.test(EINTRAEGE[0]?.testbitte || "")
  && /Meldezeile/.test(EINTRAEGE[0]?.testbitte || "")
  && /verschiebt genau diese/.test(EINTRAEGE[0]?.testbitte || "")
  && /andere bleibt liegen/.test(EINTRAEGE[0]?.testbitte || ""));
// Davor machte der Eintrag die VERZAHNUNGSBEREICHE im Geschossplan sichtbar (#90).
// Aussagewahr heisst hier: die Bereiche werden GEZEIGT — an ihrer Rasterstelle, mit
// einem benannten Merkmal und in der Legende. Behauptet werden darf KEINE Bedienung
// im Editor (festgelegt werden sie in Modul 1), keine geaenderte Kollisionspruefung
// und keine Wirkung auf Mengen oder Vorspannung ([K-13.1]/[G-11]/[P-9]).
ok("die sichtbaren Verzahnungsbereiche (Issue 90) folgen direkt danach",
  EINTRAEGE[1]?.id === "chg-20260817-03" && EINTRAEGE[1]?.issue === 90
  && EINTRAEGE[1]?.typ === "feature" && EINTRAEGE[1]?.datum === "2026-08-17");
ok("der Verzahnungs-Sichtbarkeitseintrag benennt Gegenstand, Ort und Stelle aussagewahr",
  /Verzahnungsbereiche/.test(EINTRAEGE[1]?.titel || "")
  && /Geschossplan/.test(EINTRAEGE[1]?.titel || "")
  && /Fläche/.test(EINTRAEGE[1]?.titel || "")
  && /Rasterstelle/.test(EINTRAEGE[1]?.titel || "")
  // Es ist KEIN Bedienelement und keine geaenderte Bewertung entstanden.
  && !/festlegen|wählbar|Werkzeug|Kollision/i.test(EINTRAEGE[1]?.titel || ""));
ok("die Verzahnungs-Sichtbarkeitstestbitte benennt Festlegeort, Merkmal, Legende und den Gegenfall",
  /Modul 1/.test(EINTRAEGE[1]?.testbitte || "")
  && /Verzahnungsbereich/.test(EINTRAEGE[1]?.testbitte || "")
  && /Geschoss/.test(EINTRAEGE[1]?.testbitte || "")
  && /gitterschraffierte Fläche/.test(EINTRAEGE[1]?.testbitte || "")
  && /gestrichelter Umrandung/.test(EINTRAEGE[1]?.testbitte || "")
  && /Legende/.test(EINTRAEGE[1]?.testbitte || "")
  && /ohne Bereich sehen unverändert aus/.test(EINTRAEGE[1]?.testbitte || ""));
// Genau EIN Eintrag fuer #90: die Sichtbarkeit ist EIN Nutzerergebnis.
ok("genau ein Eintrag fuer Issue 90 (sichtbare Verzahnungsbereiche)",
  EINTRAEGE.filter(e => e.issue === 90).length === 1);
// Davor stand die INITIALPOSITION duplizierter und zugeordneter Waende (#88).
// Aussagewahr heisst hier: die Kopie liegt SOFORT sichtbar neben dem Original, die
// zugeordnete Wand am Geschossursprung — beide UNBEMASST und frei verschiebbar, und der
// Vorgang bleibt EIN Rueckgaengig-Schritt. Behauptet werden darf kein neues Werkzeug,
// keine Bemassung und keine geaenderte Kollisionspruefung ([K-13]/[P-9]).
ok("die Initialposition duplizierter Waende (Issue 88) folgt direkt danach",
  EINTRAEGE[2]?.id === "chg-20260817-02" && EINTRAEGE[2]?.issue === 88
  && EINTRAEGE[2]?.typ === "fix" && EINTRAEGE[2]?.datum === "2026-08-17");
ok("der Initialpositions-Eintrag benennt beide Wege, das Ergebnis und den behobenen Mangel aussagewahr",
  /Duplizierte/.test(EINTRAEGE[2]?.titel || "")
  && /zugeordnete/.test(EINTRAEGE[2]?.titel || "")
  && /sofort sichtbar/.test(EINTRAEGE[2]?.titel || "")
  && /Geschossplan/.test(EINTRAEGE[2]?.titel || "")
  && /unverortet/.test(EINTRAEGE[2]?.titel || "")
  // Es ist KEIN Werkzeug und KEINE Bemassung entstanden.
  && !/Werkzeug|Bemaßung|bemaßt/i.test(EINTRAEGE[2]?.titel || ""));
ok("die Initialpositions-Testbitte benennt Ort, Versatz, Unbemasstheit, Ruecknahme und den zweiten Weg",
  /Geschosseditor/.test(EINTRAEGE[2]?.testbitte || "")
  && /duplizieren/.test(EINTRAEGE[2]?.testbitte || "")
  && /250 mm/.test(EINTRAEGE[2]?.testbitte || "")
  && /unbemaßt/.test(EINTRAEGE[2]?.testbitte || "")
  && /frei verschiebbar/.test(EINTRAEGE[2]?.testbitte || "")
  && /Strg\+Z/.test(EINTRAEGE[2]?.testbitte || "")
  && /Modul 0/.test(EINTRAEGE[2]?.testbitte || "")
  && /Geschossursprung/.test(EINTRAEGE[2]?.testbitte || ""));
// #88 hat ZWEI Eintraege, weil es zwei getrennte Nutzerergebnisse waren: erst die
// sichtbare Initialposition, dann — als offener Restpunkt des Issues — die Wahl
// zwischen uebereinanderliegenden Waenden. Ein drittes waere doppelte Arbeit.
const neu88 = EINTRAEGE.filter(e => e.issue === 88);
ok("genau zwei Eintraege fuer Issue 88 — Initialposition und Auswahl der gemeinten Wand",
  neu88.length === 2
  && neu88.map(e => e.id).join(",") === "chg-20260817-04,chg-20260817-02");
// Davor stand das wahlweise MITLOESCHEN der zugeordneten Wandelemente.
// Aussagewahr heisst hier: es wird GEFRAGT (zwei getrennte Abfragen), die Anzahl steht
// vorher da, und ohne ausdrueckliches Ja bleibt jedes Wandelement erhalten ([L-4]).
// Behauptet werden darf kein zweiter Loeschweg und keine Gebaeude-Bedienung — die gibt
// es in Modul 0 nicht ([L-6]).
ok("das wahlweise Mitloeschen (Issue 85) folgt direkt danach",
  EINTRAEGE[3]?.id === "chg-20260817-01" && EINTRAEGE[3]?.issue === 85
  && EINTRAEGE[3]?.typ === "feature" && EINTRAEGE[3]?.datum === "2026-08-17");
ok("der Mitloesch-Eintrag benennt Ort, Nachfrage und Gegenstand aussagewahr",
  /Löschen/.test(EINTRAEGE[3]?.titel || "")
  && /Geschoss/.test(EINTRAEGE[3]?.titel || "")
  && /Projekt/.test(EINTRAEGE[3]?.titel || "")
  && /zugeordneten Wandelemente/.test(EINTRAEGE[3]?.titel || "")
  && /Nachfrage/.test(EINTRAEGE[3]?.titel || "")
  // Ohne Nachfrage passiert nichts — „automatisch“ waere die Unwahrheit.
  && !/automatisch|immer/i.test(EINTRAEGE[3]?.titel || ""));
ok("die Mitloesch-Testbitte benennt Ort, beide Abfragen, die Anzahl und beide Antworten",
  /Modul 0/.test(EINTRAEGE[3]?.testbitte || "")
  && /Sicherheitsabfrage/.test(EINTRAEGE[3]?.testbitte || "")
  && /Anzahl/.test(EINTRAEGE[3]?.testbitte || "")
  && /Abbrechen lässt sie erhalten/.test(EINTRAEGE[3]?.testbitte || "")
  && /OK entfernt sie/.test(EINTRAEGE[3]?.testbitte || "")
  && /beide Zahlen/.test(EINTRAEGE[3]?.testbitte || ""));
// Davor der DETERMINISTISCHE NACHWEIS, dass die Verzahnungsbewertung Projektarchiv und
// Duplizieren uebersteht — sie entsteht bei jeder Ausgabe frisch ([K-13.1]). Aussagewahr
// heisst dort: es wurde NICHTS an der Bewertung geaendert und kein neues Bedienelement
// gebaut; entstanden sind Nachweis und Doku. Deshalb „intern“ — ein „feature“ waere
// dort eine Uebertreibung ([P-9]).
ok("der Verzahnungs-Nachweis (Issue 83) folgt direkt danach",
  EINTRAEGE[4]?.id === "chg-20260816-12" && EINTRAEGE[4]?.issue === 83
  && EINTRAEGE[4]?.typ === "intern" && EINTRAEGE[4]?.datum === "2026-08-16");
ok("der Nachweis-Eintrag benennt beide Wege und verspricht keine neue Funktion",
  /Verzahnungsbewertung/.test(EINTRAEGE[4]?.titel || "")
  && /Projektarchiv/.test(EINTRAEGE[4]?.titel || "")
  && /Duplizieren/.test(EINTRAEGE[4]?.titel || "")
  && /unverändert/.test(EINTRAEGE[4]?.titel || "")
  // Es ist KEIN neues Bedienelement und keine geaenderte Darstellung entstanden.
  && !/neu|wählbar|Schalter/i.test(EINTRAEGE[4]?.titel || ""));
ok("die Nachweis-Testbitte benennt Export, leeren Browser, Ort und die unveraenderte Bewertung",
  /exportieren/.test(EINTRAEGE[4]?.testbitte || "")
  && /leeren Browser/.test(EINTRAEGE[4]?.testbitte || "")
  && /importieren/.test(EINTRAEGE[4]?.testbitte || "")
  && /Modul 9/.test(EINTRAEGE[4]?.testbitte || "")
  && /statt einer Kollision/.test(EINTRAEGE[4]?.testbitte || "")
  && /nichts geändert/.test(EINTRAEGE[4]?.testbitte || ""));
// Davor ergaenzte der Kommentar die Mengenuebersteuerung. Aussagewahr heisst dort:
// er steht NEBEN Menge und Preis und aendert die Rechnung NICHT — kein Export, keine
// Summe, keine Menge. Genau das darf versprochen werden, mehr nicht ([P-20]).
ok("der Kommentar je Stuecklistenposition (Issue 81) folgt direkt danach",
  EINTRAEGE[5]?.id === "chg-20260816-11" && EINTRAEGE[5]?.issue === 81
  && EINTRAEGE[5]?.typ === "feature" && EINTRAEGE[5]?.datum === "2026-08-16");
ok("der Kommentar-Eintrag benennt Ort, Nachbarschaft und die unveraenderte Rechnung aussagewahr",
  /Kommentar/.test(EINTRAEGE[5]?.titel || "")
  && /Stücklistenposition/.test(EINTRAEGE[5]?.titel || "")
  && /Modul 4/.test(EINTRAEGE[5]?.titel || "")
  && /Menge und Preis/.test(EINTRAEGE[5]?.titel || "")
  && /ohne die Rechnung zu ändern/.test(EINTRAEGE[5]?.titel || "")
  // Der Kommentar steht in KEINER Exportdatei — das darf der Titel nicht andeuten.
  && !/Export|Datei/.test(EINTRAEGE[5]?.titel || ""));
ok("die Kommentar-Testbitte benennt Ort, Position, Persistenz, Ruecknahme und die erhaltene Rechnung",
  /Modul 4/.test(EINTRAEGE[5]?.testbitte || "")
  && /an genau dieser/.test(EINTRAEGE[5]?.testbitte || "")
  && /Neuladen/.test(EINTRAEGE[5]?.testbitte || "")
  && /einzeln wieder entfernen/.test(EINTRAEGE[5]?.testbitte || "")
  && /Mengen, Preise und Summe/.test(EINTRAEGE[5]?.testbitte || "")
  && /unverändert/.test(EINTRAEGE[5]?.testbitte || ""));
// Genau EIN Eintrag fuer #85: das Mitloeschen ist ein Nutzerergebnis, kein zweites.
ok("genau ein Eintrag fuer Issue 85 (Mitloeschen)",
  EINTRAEGE.filter(e => e.issue === 85).length === 1);
// Danach schliesst der Verzahnungs-Roundtrip die Verzahnungsarbeit ab: Export, Import
// und Duplizieren muessen verlustfrei sein. Aussagewahr heisst hier: Grenzen UND
// Startparitaet bleiben erhalten — dieselben Daten, nicht nur dieselbe Wirkung.
ok("der Verzahnungs-Roundtrip (Issue 82) folgt direkt danach",
  NEU[0]?.id === "chg-20260816-10" && NEU[0]?.issue === 82
  && NEU[0]?.typ === "feature" && NEU[0]?.datum === "2026-08-16");
ok("der Roundtrip-Eintrag benennt Export, Import, Duplizieren und die erhaltenen Felder aussagewahr",
  /Export/.test(NEU[0]?.titel || "")
  && /Import/.test(NEU[0]?.titel || "")
  && /Duplizieren/.test(NEU[0]?.titel || "")
  && /Grenzen/.test(NEU[0]?.titel || "")
  && /Startparität/.test(NEU[0]?.titel || ""));
ok("die Roundtrip-Testbitte benennt Anlageort, beide Wege und das Archiv",
  /Modul 1/.test(NEU[0]?.testbitte || "")
  && /exportieren/.test(NEU[0]?.testbitte || "")
  && /reimportieren/.test(NEU[0]?.testbitte || "")
  && /Duplizieren/.test(NEU[0]?.testbitte || "")
  && /Projektarchiv/.test(NEU[0]?.testbitte || ""));
// Der vorherige neueste Eintrag (zulaessige Verzahnung im Lageplan) rueckt auf Platz 2.
ok("die zulaessige Verzahnung im Lageplan (Issue 83) folgt direkt danach",
  NEU[1]?.id === "chg-20260816-09" && NEU[1]?.issue === 83
  && NEU[1]?.typ === "fix" && NEU[1]?.datum === "2026-08-16");
ok("der Lageplan-Verzahnungseintrag benennt Ort, Ergebnis und die erhaltene Strenge aussagewahr",
  /Lageplan/.test(NEU[1]?.titel || "")
  && /Wandverzahnung/.test(NEU[1]?.titel || "")
  && /Verbindung/.test(NEU[1]?.titel || "")
  && /Kollision/.test(NEU[1]?.titel || ""));
ok("die Lageplan-Verzahnungstestbitte benennt Ort, beide Namen, Vollstaendigkeit und den Gegenfall",
  /Modul 9/.test(NEU[1]?.testbitte || "")
  && /keine Kollisionsmeldung/.test(NEU[1]?.testbitte || "")
  && /beiden Wandnamen/.test(NEU[1]?.testbitte || "")
  && /vollständig/.test(NEU[1]?.testbitte || "")
  && /andere Überlagerung bleibt Kollision/.test(NEU[1]?.testbitte || ""));
// #59 hat mehrere Eintraege, weil es mehrere getrennte Nutzerergebnisse waren. Dieser
// schliesst die im Ausweich-Paket ausdruecklich offen gelassene Grenze: eine mehrfach
// ausgewichene Blase lief ueber den Zeichnungsrand hinaus. Aussagewahr heisst
// hier, dass die BLASE vollstaendig sichtbar bleibt — und dass der Massstab dabei
// derselbe bleibt; behauptet werden darf keine geaenderte Wand- oder Masslage.
ok("die vollstaendig sichtbaren Nummernblasen (Issue 59) folgen direkt danach",
  NEU[2]?.id === "chg-20260816-08" && NEU[2]?.issue === 59
  && NEU[2]?.typ === "fix" && NEU[2]?.datum === "2026-08-16");
ok("der Blasenrand-Eintrag benennt Ort, Ergebnis und den behobenen Mangel aussagewahr",
  /Lageplan/.test(NEU[2]?.titel || "")
  && /Wandnummern/.test(NEU[2]?.titel || "")
  && /vollständig sichtbar/.test(NEU[2]?.titel || "")
  && /abgeschnitten/.test(NEU[2]?.titel || "")
  && !/Maßstab|verschob/i.test(NEU[2]?.titel || ""));
ok("die Blasenrand-Testbitte benennt Ort, Vollstaendigkeit, alle drei Ausgaben und den Massstab",
  /Modul 9/.test(NEU[2]?.testbitte || "")
  && /vollständig im Blatt/.test(NEU[2]?.testbitte || "")
  && /Vorschau/.test(NEU[2]?.testbitte || "")
  && /Druck/.test(NEU[2]?.testbitte || "")
  && /SVG-Datei/.test(NEU[2]?.testbitte || "")
  && /Maßstab bleibt derselbe/.test(NEU[2]?.testbitte || ""));
// #82 hat DREI Eintraege, weil es drei getrennte Nutzerergebnisse waren: Festlegen in
// Modul 1, Darstellung auf der Wandzeichnung und Roundtrip ueber Export/Import/Duplizieren.
const neu82 = EINTRAEGE.filter(e => e.issue === 82);
ok("genau drei Eintraege fuer Issue 82 — Festlegen in Modul 1, Darstellung im Blatt und Roundtrip",
  neu82.length === 3
  && neu82.map(e => e.id).join(",") === "chg-20260816-10,chg-20260816-07,chg-20260816-04");
ok("die Verzahnung auf der Wandzeichnung (Issue 82) folgt direkt danach",
  NEU[3]?.id === "chg-20260816-07" && NEU[3]?.issue === 82
  && NEU[3]?.typ === "feature" && NEU[3]?.datum === "2026-08-16");
// Aussagewahr heisst hier: das Blatt KENNZEICHNET und ERKLAERT den Bereich — mehr nicht.
// Modul 7 zeigt nur an; behauptet werden darf keine Wahlmoeglichkeit, keine Ableitung
// und keine Wirkung auf Vorspannung oder Mengen ([G-11]/[P-9]).
ok("der Zeichnungs-Verzahnungseintrag benennt Ort, Kennzeichnung und Erklaerung aussagewahr",
  /Wandzeichnung/.test(NEU[3]?.titel || "")
  && /Verzahnungsbereiche/.test(NEU[3]?.titel || "")
  && /gekennzeichnet/.test(NEU[3]?.titel || "")
  && /erklärt/.test(NEU[3]?.titel || "")
  && !/wählbar|Vorspannung/.test(NEU[3]?.titel || ""));
ok("die Testbitte benennt Anlageort, Rasterlage, Legende, Mangel, Schwarz-Weiss und die Datei",
  /Modul 1/.test(NEU[3]?.testbitte || "")
  && /Modul 7/.test(NEU[3]?.testbitte || "")
  && /Rasterlage/.test(NEU[3]?.testbitte || "")
  && /Legende/.test(NEU[3]?.testbitte || "")
  && /regelwidriger Bereich/.test(NEU[3]?.testbitte || "")
  && /schwarz-weiß/.test(NEU[3]?.testbitte || "")
  && /SVG-Datei/.test(NEU[3]?.testbitte || ""));
// #83 hat DREI Eintraege, weil es drei getrennte Ergebnisse waren: erst die Ausnahme im
// Geschosseditor, dann dieselbe Aussage im Lageplan — die dort ausdruecklich offen
// gebliebene Haelfte — und zuletzt der deterministische Nachweis, dass die Bewertung
// Projektarchiv und Duplizieren uebersteht. Die drei zusammen decken das Issue ab.
const neu83 = EINTRAEGE.filter(e => e.issue === 83);
ok("genau drei Eintraege fuer Issue 83 — Geschosseditor, Lageplan und Archivnachweis",
  neu83.length === 3
  && neu83.map(e => e.id).join(",")
    === "chg-20260816-12,chg-20260816-09,chg-20260816-06");
ok("die zulaessige Verzahnung im Geschosseditor (Issue 83) folgt direkt danach",
  NEU[4]?.id === "chg-20260816-06" && NEU[4]?.issue === 83
  && NEU[4]?.typ === "fix" && NEU[4]?.datum === "2026-08-16");
ok("der Verzahnungs-Eintrag benennt Ort, Ausnahme UND die erhaltene Strenge aussagewahr",
  /Geschosseditor/.test(NEU[4]?.titel || "")
  && /Verzahnungen/.test(NEU[4]?.titel || "")
  && /Kollision/.test(NEU[4]?.titel || "")
  && /andere Überlagerung/.test(NEU[4]?.titel || ""));
ok("die Verzahnungs-Testbitte benennt Aufbau, beide Merkmale und den Gegenfall",
  /rechtwinklige Wände/.test(NEU[4]?.testbitte || "")
  && /keine Kollisionsmeldung/.test(NEU[4]?.testbitte || "")
  && /keine rote Wand/.test(NEU[4]?.testbitte || "")
  && /benannt/.test(NEU[4]?.testbitte || "")
  && /gleicher Startlage/.test(NEU[4]?.testbitte || ""));
// #79 hat VIER Einträge, weil es vier getrennte Nutzerergebnisse waren: erst die Wahl
// am Wandelement (Modul 1), dann die Darstellung im Lageplan, im Geschosseditor und
// zuletzt auf der technischen Wandzeichnung. Damit sind alle geforderten Ansichten
// abgedeckt — ein fuenfter Eintrag zu #79 waere ein Zeichen fuer doppelte Arbeit.
const neu79 = EINTRAEGE.filter(e => e.issue === 79);
ok("genau vier Eintraege fuer Issue 79 — Wahl in Modul 1, Lageplan, Geschosseditor und Zeichnung",
  neu79.length === 4
  && neu79.map(e => e.id).join(",")
    === "chg-20260816-01,chg-20260815-03,chg-20260815-02,chg-20260814-04");
// #81 hat VIER Eintraege, weil es vier getrennte Nutzerergebnisse waren: erst die
// manuelle Menge in Modul 4, dann die waehlbare Mengenfassung der Wanddatei im
// zentralen Export, dieselbe Wahl fuer die Gesamtstueckliste der Ebene und zuletzt der
// Kommentar je Position — das im fachlichen Gate als optional benannte zweite Feld.
const neu81 = EINTRAEGE.filter(e => e.issue === 81);
ok("genau vier Eintraege fuer Issue 81 — Uebersteuerung, beide Fassungswahlen und der Kommentar",
  neu81.length === 4
  && neu81.map(e => e.id).join(",")
    === "chg-20260816-11,chg-20260816-05,chg-20260816-02,chg-20260815-01");
ok("die Mengenfassung der Gesamtstueckliste (Issue 81) folgt direkt danach",
  AKTUELL[0]?.id === "chg-20260816-05" && AKTUELL[0]?.issue === 81
  && AKTUELL[0]?.typ === "feature" && AKTUELL[0]?.datum === "2026-08-16");
// Aussagewahr heisst hier: die Wahl gilt jetzt auch fuer die AGGREGIERTE Liste, beide
// Mengen stehen weiter nebeneinander, und die Datei benennt ihre Fassung. Behauptet
// werden darf kein neuer Schreibweg — gesetzt wird die Menge weiter in Modul 4 ([P-20]).
ok("der Gesamtlisten-Eintrag benennt Ort, Ebenen und die betroffene Ausgabe aussagewahr",
  /Export/.test(AKTUELL[0]?.titel || "")
  && /Mengenfassung/.test(AKTUELL[0]?.titel || "")
  && /Gesamtstückliste/.test(AKTUELL[0]?.titel || "")
  && /Geschoss/.test(AKTUELL[0]?.titel || "")
  && /Projekt/.test(AKTUELL[0]?.titel || ""));
ok("die Gesamtlisten-Testbitte benennt Schreibort, Wahl, beide Mengen und den Dateikopf",
  /Modul 4/.test(AKTUELL[0]?.testbitte || "")
  && /Modul 0/.test(AKTUELL[0]?.testbitte || "")
  && /angepasst/.test(AKTUELL[0]?.testbitte || "")
  && /wirksamen Mengen/.test(AKTUELL[0]?.testbitte || "")
  && /berechneten/.test(AKTUELL[0]?.testbitte || "")
  && /Dateikopf/.test(AKTUELL[0]?.testbitte || ""));
ok("die Verzahnungsbereiche in Modul 1 (Issue 82) folgen direkt danach",
  AKTUELL[1]?.id === "chg-20260816-04" && AKTUELL[1]?.issue === 82
  && AKTUELL[1]?.typ === "feature" && AKTUELL[1]?.datum === "2026-08-16");
// Aussagewahr heisst hier: die Steine fehlen alternierend in JEDER ZWEITEN Lage, die
// Steinmengen in der Stueckliste folgen dem Verband, Vorspannung und Gewindestangen
// bleiben unveraendert. Es darf keine Wirkung behauptet werden, die nicht da ist.
ok("der Verzahnungs-Eintrag benennt Ort, Verband und Mengenwirkung aussagewahr",
  /Modul 1/.test(AKTUELL[1]?.titel || "")
  && /Verzahnungsbereiche/.test(AKTUELL[1]?.titel || "")
  && /alternierend/.test(AKTUELL[1]?.titel || "")
  && /Mengen/.test(AKTUELL[1]?.titel || ""));
ok("die Verzahnungs-Testbitte benennt Ort, Lage, Mengen und unveraenderte Vorspannung",
  /Modul 1/.test(AKTUELL[1]?.testbitte || "")
  && /Verzahnungsbereich/.test(AKTUELL[1]?.testbitte || "")
  && /jeder zweiten Lage/.test(AKTUELL[1]?.testbitte || "")
  && /Steinmengen/.test(AKTUELL[1]?.testbitte || "")
  && /Vorspannung/.test(AKTUELL[1]?.testbitte || "")
  && /unverändert/.test(AKTUELL[1]?.testbitte || ""));
ok("die ueberdeckungsfreien Nummernblasen im Lageplan (Issue 59) folgen direkt danach",
  AKTUELL[2]?.id === "chg-20260816-03" && AKTUELL[2]?.issue === 59
  && AKTUELL[2]?.typ === "fix" && AKTUELL[2]?.datum === "2026-08-16");
// Aussagewahr heisst hier: es weicht die NUMMER aus — nicht das Mass und nicht die Wand.
// Versprochen werden darf genau das, was die Regel zusichert: keine Ueberdeckung von
// Blase, Masszahl oder Masslinie, gleichbleibender Bezug zur Wandkante und dieselbe
// Anordnung in Vorschau, Druck und Export. Kein Bedienelement, keine gespeicherte Lage.
ok("der Blasen-Eintrag benennt Ausweichen, Ort und die beiden gemiedenen Dinge aussagewahr",
  /Lageplan/.test(AKTUELL[2]?.titel || "")
  && /weichen/.test(AKTUELL[2]?.titel || "")
  && /überdecken/.test(AKTUELL[2]?.titel || "")
  && /Bemaßung/.test(AKTUELL[2]?.titel || "")
  && !/verschieb/i.test(AKTUELL[2]?.titel || ""));
ok("die Blasen-Testbitte benennt Ausgangslage, Wandkante und die drei Ausgaben",
  /Modul 9/.test(AKTUELL[2]?.testbitte || "")
  && /bemaßten Wänden/.test(AKTUELL[2]?.testbitte || "")
  && /Führungslinie/.test(AKTUELL[2]?.testbitte || "")
  && /Wandkante/.test(AKTUELL[2]?.testbitte || "")
  && /SVG-Datei/.test(AKTUELL[2]?.testbitte || ""));
ok("die waehlbare Mengenfassung der Wanddatei (Issue 81) folgt direkt danach",
  AKTUELL[3]?.id === "chg-20260816-02" && AKTUELL[3]?.issue === 81
  && AKTUELL[3]?.typ === "feature" && AKTUELL[3]?.datum === "2026-08-16");
// Aussagewahr heisst hier: die Wahl besteht zwischen GENAU zwei Fassungen, und beide
// Werte bleiben nebeneinander stehen — die berechnete Menge wird nie ersetzt ([P-20]).
// Behauptet werden darf kein neuer Schreibweg: gesetzt wird die Menge weiter in Modul 4.
ok("der Fassungs-Eintrag benennt beide Fassungen und den Ort der Wahl aussagewahr",
  /Export/.test(AKTUELL[3]?.titel || "")
  && /wählbar/.test(AKTUELL[3]?.titel || "")
  && /berechneten/.test(AKTUELL[3]?.titel || "")
  && /angepassten/.test(AKTUELL[3]?.titel || "")
  && /Stückliste/.test(AKTUELL[3]?.titel || ""));
ok("die Fassungs-Testbitte benennt Schreibort, Wahl, Dateikopf und die erhaltene Rechnung",
  /Modul 4/.test(AKTUELL[3]?.testbitte || "")
  && /Modul 0/.test(AKTUELL[3]?.testbitte || "")
  && /angepasst/.test(AKTUELL[3]?.testbitte || "")
  && /Dateikopf/.test(AKTUELL[3]?.testbitte || "")
  && /berechnete Menge/.test(AKTUELL[3]?.testbitte || ""));
ok("die Darstellung in der technischen Zeichnung (Issue 79) folgt direkt danach",
  AKTUELL[4]?.id === "chg-20260816-01" && AKTUELL[4]?.issue === 79
  && AKTUELL[4]?.typ === "feature" && AKTUELL[4]?.datum === "2026-08-16");
// Aussagewahr heisst hier: beide Klassen, die NICHT farblichen Merkmale (Kurztext und
// Legende) und der Ort, an dem gewaehlt wird. Modul 7 zeigt nur an; behauptet werden
// darf kein Nachweis und keine Wirkung ([P-9]). Eine Schraffur gibt es dort bewusst
// nicht — sie darf hier also auch nicht versprochen werden.
ok("der Zeichnungs-Eintrag benennt beide Klassen, Kurztext und Legende aussagewahr",
  /F0\/F30|F0 und F30/.test(AKTUELL[4]?.titel || "")
  && /Wandzeichnung/.test(AKTUELL[4]?.titel || "")
  && /Kurztext/.test(AKTUELL[4]?.titel || "")
  && /Legende/.test(AKTUELL[4]?.titel || "")
  && !/schraffiert/.test(AKTUELL[4]?.titel || ""));
ok("die Zeichnungs-Testbitte benennt Wahlort, Ausgabeweg, Export und Schwarz-Weiss",
  /Modul 1/.test(AKTUELL[4]?.testbitte || "")
  && /Modul 7/.test(AKTUELL[4]?.testbitte || "")
  && /Legende/.test(AKTUELL[4]?.testbitte || "")
  && /SVG-Datei/.test(AKTUELL[4]?.testbitte || "")
  && /schwarz-weiß/.test(AKTUELL[4]?.testbitte || ""));
ok("die Darstellung im Geschosseditor (Issue 79) folgt direkt danach",
  AKTUELL[5]?.id === "chg-20260815-03" && AKTUELL[5]?.issue === 79
  && AKTUELL[5]?.typ === "feature" && AKTUELL[5]?.datum === "2026-08-15");
// Aussagewahr heisst hier: beide Klassen, die NICHT farblichen Merkmale (Schraffur und
// Beschriftung), Legende UND Wandliste — und der Ort, an dem gewaehlt wird. Der Editor
// zeigt nur an; behauptet werden darf kein Nachweis und keine Wirkung ([P-9]).
ok("der Geschosseditor-Eintrag benennt beide Klassen, Schraffur, Legende und Wandliste aussagewahr",
  /F0\/F30|F0 und F30/.test(AKTUELL[5]?.titel || "")
  && /Geschosseditor/.test(AKTUELL[5]?.titel || "")
  && /schraffiert/.test(AKTUELL[5]?.titel || "")
  && /Legende/.test(AKTUELL[5]?.titel || "")
  && /Wandliste/.test(AKTUELL[5]?.titel || ""));
ok("die Geschosseditor-Testbitte benennt Wahlort, beide Klassen, Wandliste und Schwarz-Weiss",
  /Modul 1/.test(AKTUELL[5]?.testbitte || "")
  && /F30-Wand/.test(AKTUELL[5]?.testbitte || "")
  && /F0-Wände/.test(AKTUELL[5]?.testbitte || "")
  && /Wandliste/.test(AKTUELL[5]?.testbitte || "")
  && /schwarz-weiß/.test(AKTUELL[5]?.testbitte || ""));
ok("die Lageplan-Darstellung (Issue 79) folgt direkt danach",
  AKTUELL[6]?.id === "chg-20260815-02" && AKTUELL[6]?.issue === 79
  && AKTUELL[6]?.typ === "feature" && AKTUELL[6]?.datum === "2026-08-15");
// Aussagewahr heisst hier: beide Klassen, das NICHT farbliche Merkmal (Schraffur und
// Beschriftung), die Legende — und der Ort, an dem gewaehlt wird. Der Lageplan zeigt
// nur an; behauptet werden darf kein Nachweis und keine Wirkung ([P-9]).
ok("der Lageplan-Eintrag benennt beide Klassen, Schraffur, Beschriftung und Legende aussagewahr",
  /F0\/F30|F0 und F30/.test(AKTUELL[6]?.titel || "")
  && /Lageplan/.test(AKTUELL[6]?.titel || "")
  && /schraffiert/.test(AKTUELL[6]?.titel || "")
  && /Legende/.test(AKTUELL[6]?.titel || ""));
ok("die Lageplan-Testbitte benennt Wahlort, Ausgabe, Wandliste und Schwarz-Weiss",
  /Modul 1/.test(AKTUELL[6]?.testbitte || "")
  && /Modul 9/.test(AKTUELL[6]?.testbitte || "")
  && /exportieren/.test(AKTUELL[6]?.testbitte || "")
  && /Wandliste/.test(AKTUELL[6]?.testbitte || "")
  && /schwarz-weiß/.test(AKTUELL[6]?.testbitte || ""));
ok("die Mengenuebersteuerung (Issue 81) folgt direkt danach",
  AKTUELL[7]?.id === "chg-20260815-01" && AKTUELL[7]?.issue === 81
  && AKTUELL[7]?.typ === "feature" && AKTUELL[7]?.datum === "2026-08-15");
// Aussagewahr heisst hier: die Menge ist MANUELL uebersteuerbar und der berechnete Wert
// bleibt daneben stehen — kein Ersetzen. Die Testbitte nennt Anzeige beider Werte,
// Persistenz, Ruecknahme und die Abweisung unzulaessiger Eingaben ([P-20]).
ok("der Mengen-Eintrag benennt Uebersteuerung UND erhaltenen Originalwert aussagewahr",
  /Menge je Stücklistenposition/.test(AKTUELL[7]?.titel || "")
  && /manuell/.test(AKTUELL[7]?.titel || "")
  && /berechnete Menge/.test(AKTUELL[7]?.titel || "")
  && /daneben sichtbar/.test(AKTUELL[7]?.titel || ""));
ok("die Mengen-Testbitte benennt Anzeige, Persistenz, Ruecknahme und Abweisung",
  /Modul 4/.test(AKTUELL[7]?.testbitte || "")
  && /nebeneinander/.test(AKTUELL[7]?.testbitte || "")
  && /Neuladen/.test(AKTUELL[7]?.testbitte || "")
  && /zurücksetzen/.test(AKTUELL[7]?.testbitte || "")
  && /abgewiesen/.test(AKTUELL[7]?.testbitte || ""));
ok("die Brandschutz-Wahl in Modul 1 (Issue 79) folgt direkt danach",
  AKTUELL[8]?.id === "chg-20260814-04" && AKTUELL[8]?.issue === 79
  && AKTUELL[8]?.typ === "feature" && AKTUELL[8]?.datum === "2026-08-14");
// Aussagewahr heisst hier: beide Werte, der EINE Ort der Wahl, der Standard und die
// ausdrueckliche Abwesenheit einer abgeleiteten Wirkung — nichts davon darf fehlen,
// und es darf kein Nachweis behauptet werden ([P-9]).
ok("der Brandschutz-Eintrag benennt beide Klassen, den Ort der Wahl und den Standard aussagewahr",
  /F0/.test(AKTUELL[8]?.titel || "") && /F30/.test(AKTUELL[8]?.titel || "")
  && /Modul 1/.test(AKTUELL[8]?.titel || "")
  && /Standard F0/.test(AKTUELL[8]?.titel || "")
  && /kein Nachweis/.test(AKTUELL[8]?.titel || ""));
ok("die Brandschutz-Testbitte benennt Fortbestand, Neuberechnung und unveraenderte Ableitung",
  /neu laden/.test(AKTUELL[8]?.testbitte || "")
  && /exportieren/.test(AKTUELL[8]?.testbitte || "")
  && /Geschosseditor/.test(AKTUELL[8]?.testbitte || "")
  && /Länge ändern/.test(AKTUELL[8]?.testbitte || "")
  && /Stückliste/.test(AKTUELL[8]?.testbitte || ""));
ok("der Planhintergrund im Lageplan (Issue 80) folgt direkt danach",
  AKTUELL[9]?.id === "chg-20260814-03" && AKTUELL[9]?.issue === 80
  && AKTUELL[9]?.typ === "feature" && AKTUELL[9]?.datum === "2026-08-14");
ok("der Planhintergrund-Eintrag benennt Quelle, Einstellung und Ausgabe aussagewahr",
  /Geschossplan/.test(AKTUELL[9]?.titel || "")
  && /kalibriert/i.test(AKTUELL[9]?.titel || "")
  && /Hintergrund/.test(AKTUELL[9]?.titel || "")
  && /Transparenz/.test(AKTUELL[9]?.titel || "")
  && /Modul 9/.test(AKTUELL[9]?.testbitte || "")
  && /exportieren/.test(AKTUELL[9]?.testbitte || "")
  && /100 %/.test(AKTUELL[9]?.testbitte || ""));
ok("der verschiebbare Geschossursprung (Issue 76) folgt direkt danach",
  AELTER[0]?.id === "chg-20260814-02" && AELTER[0]?.issue === 76);
ok("der Ursprungs-Eintrag benennt Bedienweg, Auswirkung und Ruecknahme aussagewahr",
  /Geschossursprung/.test(AELTER[0]?.titel || "")
  && /Ursprungsmaße/.test(AELTER[0]?.titel || "")
  && /Werkzeug „Ursprung“/.test(AELTER[0]?.testbitte || "")
  && /Vorschau/.test(AELTER[0]?.testbitte || "")
  && /Strg\+Z/.test(AELTER[0]?.testbitte || ""));
ok("die wandbezogene Abdichtung (Issue 71) folgt direkt danach",
  AELTER[1]?.id === "chg-20260814-01" && AELTER[1]?.issue === 71);
ok("der Abdichtungs-Eintrag benennt beide Zustaende, den Ort der Wahl und die Wirkung aussagewahr",
  /Abdichtung je Wand/.test(AELTER[1]?.titel || "")
  && /Dichtstreifen/.test(AELTER[1]?.titel || "")
  && /Modul 1/.test(AELTER[1]?.testbitte || "")
  && /Modul 4/.test(AELTER[1]?.testbitte || "")
  && /nicht abgedichtet/.test(AELTER[1]?.testbitte || ""));
ok("der entfallene Einzelnachweis in Modul 1 (Issue 78) folgt direkt danach",
  AELTER[2]?.id === "chg-20260813-10" && AELTER[2]?.issue === 78);
ok("der Nachweis-Eintrag benennt Wegfall, erhaltene Auslegung und Modul 3 aussagewahr",
  /keinen statischen Einzelnachweis/.test(AELTER[2]?.titel || "")
  && /Modul 3/.test(AELTER[2]?.titel || "")
  && /fester Auslegung/.test(AELTER[2]?.testbitte || "")
  && /Spannachsen/.test(AELTER[2]?.testbitte || "")
  && /entfallen/.test(AELTER[2]?.testbitte || ""));
ok("die Wandseiten-Kennzeichnung (Issue 84) bleibt als dritter aktueller Eintrag erhalten",
  AELTER[3]?.id === "chg-20260813-09" && AELTER[3]?.issue === 84);
ok("der Wandseiten-Eintrag benennt V/R-Kanten, beide Drehwege und den Lageplan aussagewahr",
  /Vorder- und Rückseite/.test(AELTER[3]?.titel || "")
  && /V und R/.test(AELTER[3]?.testbitte || "")
  && /90°/.test(AELTER[3]?.testbitte || "")
  && /180°/.test(AELTER[3]?.testbitte || "")
  && /Lageplan/.test(AELTER[3]?.testbitte || ""));
ok("das gemeinsame Bearbeiten mehrerer Wände (Issue 75) bleibt als vierter aktueller Eintrag erhalten",
  AELTER[4]?.id === "chg-20260813-08" && AELTER[4]?.issue === 75);
ok("der Sammel-Editor-Eintrag benennt Mehrfachauswahl, Bestätigung und Rückgängig aussagewahr",
  /gemeinsam/.test(AELTER[4]?.titel || "")
  && /Umschalt|Strg/.test(AELTER[4]?.testbitte || "")
  && /gemischte/.test(AELTER[4]?.testbitte || "")
  && /fragt nach/.test(AELTER[4]?.testbitte || "")
  && /zurück/.test(AELTER[4]?.testbitte || ""));
ok("das Duplizieren und Löschen im Geschosseditor (Issue 74) bleibt als fünfter aktueller Eintrag erhalten",
  AELTER[5]?.id === "chg-20260813-07" && AELTER[5]?.issue === 74);
ok("der Editor-Eintrag zu Issue 74 benennt Kopie, Bestätigung und Rückgängig aussagewahr",
  /duplizieren/.test(AELTER[5]?.titel || "")
  && /Kopie/.test(AELTER[5]?.testbitte || "")
  && /fragt nach/.test(AELTER[5]?.testbitte || "")
  && /rückgängig/.test(AELTER[5]?.testbitte || ""));
ok("die textfreien Modulstarts 8 und 9 (Issue 72, drittes Paket) bleiben als sechster aktueller Eintrag erhalten",
  AELTER[6]?.id === "chg-20260813-06" && AELTER[6]?.issue === 72);
ok("der Intro-Eintrag 8/9 benennt Modulbereich und unveränderte Funktionen aussagewahr",
  /Module 8 und 9/.test(AELTER[6]?.titel || "")
  && /Kopfleiste/.test(AELTER[6]?.testbitte || "")
  && /unverändert/.test(AELTER[6]?.testbitte || ""));
ok("die textfreien Modulstarts 5 bis 7 (Issue 72, zweites Paket) bleiben als siebter aktueller Eintrag erhalten",
  AELTER[7]?.id === "chg-20260813-05" && AELTER[7]?.issue === 72);
ok("der zweite Intro-Eintrag benennt Modulbereich und unveränderte Funktionen aussagewahr",
  /Module 5 bis 7/.test(AELTER[7]?.titel || "")
  && /Kopfleiste/.test(AELTER[7]?.testbitte || "")
  && /unverändert/.test(AELTER[7]?.testbitte || ""));
ok("die textfreien Modulstarts 1 bis 4 (Issue 72, erstes Paket) bleiben als achter aktueller Eintrag erhalten",
  AELTER[8]?.id === "chg-20260813-04" && AELTER[8]?.issue === 72);
ok("der erste Intro-Eintrag benennt Modulbereich und unveränderte Funktionen aussagewahr",
  /Module 1 bis 4/.test(AELTER[8]?.titel || "")
  && /Kopfleiste/.test(AELTER[8]?.testbitte || "")
  && /unverändert/.test(AELTER[8]?.testbitte || ""));
ok("der Geschossplaner-Reiter 0,5 (Issue 43) bleibt als neunter aktueller Eintrag erhalten",
  AELTER[9]?.id === "chg-20260813-03" && AELTER[9]?.issue === 43);
ok("der Reiter-Eintrag benennt Kopfleiste, aktives Geschoss und unveränderte Auswahl aussagewahr",
  /Reiter 0,5/.test(AELTER[9]?.titel || "")
  && /aktive Geschoss/.test(AELTER[9]?.testbitte || "")
  && /Auswahl/.test(AELTER[9]?.testbitte || ""));
ok("die Lageplan-Nummernblasen (Issue 73) bleiben als zehnter aktueller Eintrag erhalten",
  AELTER[10]?.id === "chg-20260813-02" && AELTER[10]?.issue === 73);
ok("der Marker-Eintrag benennt Außenblase und entfallenen Vollständigkeitsblock aussagewahr",
  /Nummernblase/.test(AELTER[10]?.testbitte || "")
  && /Vollständigkeit/.test(AELTER[10]?.testbitte || "")
  && /entfallen/.test(AELTER[10]?.testbitte || ""));
ok("der hierarchische Export (Issue 67) bleibt als elfter aktueller Eintrag erhalten",
  AELTER[11]?.id === "chg-20260813-01" && AELTER[11]?.issue === 67);
ok("der Export-Eintrag benennt den Wegfall des Planbild-Transports aussagewahr",
  /Planbilder/.test(AELTER[11]?.testbitte || "") && /entfallen/.test(AELTER[11]?.testbitte || ""));
ok("die kollisionsfreien Maßzahlen (Issue 59) bleiben als zwölfter aktueller Eintrag erhalten",
  AELTER[12]?.id === "chg-20260812-10" && AELTER[12]?.issue === 59);
ok("die textfreie Eingabespalte in Modul 1 (Issue 69, zweite Kürzung) bleibt als dreizehnter aktueller Eintrag erhalten",
  AELTER[13]?.id === "chg-20260812-09" && AELTER[13]?.issue === 69);
ok("die fokussierte Projektanlage (Issue 68) bleibt als vierzehnter aktueller Eintrag erhalten",
  AELTER[14]?.id === "chg-20260812-08" && AELTER[14]?.issue === 68);
ok("die Wandbezeichnung in der Stückliste (Issue 70) bleibt als fünfzehnter aktueller Eintrag erhalten",
  AELTER[15]?.id === "chg-20260812-07" && AELTER[15]?.issue === 70);
ok("die kompakte Eingabespalte in Modul 1 (Issue 69, erste Kürzung) bleibt als sechzehnter aktueller Eintrag erhalten",
  AELTER[16]?.id === "chg-20260812-06" && AELTER[16]?.issue === 69);
ok("die aktive Wand im Geschosseditor (Issue 66) bleibt als siebzehnter aktueller Eintrag erhalten",
  AELTER[17]?.id === "chg-20260812-05" && AELTER[17]?.issue === 66);
ok("die Blattreduktion zu Issue 61 bleibt als achtzehnter aktueller Eintrag erhalten",
  AELTER[18]?.id === "chg-20260812-04" && AELTER[18]?.issue === 61);
ok("der kompakte Lageplankopf zu Issue 59 bleibt als neunzehnter aktueller Eintrag erhalten",
  AELTER[19]?.id === "chg-20260812-03" && AELTER[19]?.issue === 59);

// --- 2) Validator: jede Regel schlaegt einzeln an -------------------------
const gut = { id: "chg-20260805-01", datum: "2026-08-05", typ: "feature", issue: 48, titel: "Titel" };
const mit = (patch) => B.pruefeEintraege([{ ...gut, ...patch }]);
const meldungen = (r) => r.fehler.map(f => f.meldung).join(" | ");

ok("gueltiger Einzeleintrag ist fehlerfrei", B.pruefeEintraege([gut]).ok);
ok("fehlendes Pflichtfeld wird gemeldet", /Pflichtfeld fehlt: titel/.test(meldungen(mit({ titel: "" }))));
ok("unbekanntes Feld wird gemeldet", /unbekanntes Feld: autor/.test(meldungen(mit({ autor: "x" }))));
ok("falsches id-Muster wird gemeldet", /id passt nicht/.test(meldungen(mit({ id: "chg-2026-08-05" }))));
ok("datum abweichend von der id wird gemeldet",
  /datum passt nicht zum Datumsteil/.test(meldungen(mit({ datum: "2026-08-06" }))));
ok("unbekannter typ wird gemeldet", /typ unbekannt/.test(meldungen(mit({ typ: "sonstiges" }))));
ok("issue muss positive Ganzzahl sein",
  /issue muss/.test(meldungen(mit({ issue: 0 }))) && /issue muss/.test(meldungen(mit({ issue: "48" }))));
ok("zu langer Titel wird gemeldet", /titel ist laenger/.test(meldungen(mit({ titel: "x".repeat(121) }))));

const doppelt = B.pruefeEintraege([gut, { ...gut }]);
ok("doppelte id wird gemeldet", /id kommt mehrfach vor/.test(meldungen(doppelt)));

const falscheReihe = B.pruefeEintraege([
  { ...gut, id: "chg-20260801-01", datum: "2026-08-01" },
  { ...gut, id: "chg-20260805-01", datum: "2026-08-05" },
]);
ok("alt vor neu wird als Reihenfolgefehler gemeldet", /Reihenfolge verletzt/.test(meldungen(falscheReihe)));
ok("neu vor alt ist korrekt", B.pruefeEintraege([
  { ...gut, id: "chg-20260805-02", datum: "2026-08-05" },
  { ...gut, id: "chg-20260805-01", datum: "2026-08-05" },
  { ...gut, id: "chg-20260801-01", datum: "2026-08-01" },
]).ok);

// --- 3) Textwaechter: verbotene Inhalte (oeffentliches Repo!) -------------
const verboten = [
  ["E-Mail-Adresse", { titel: "Rueckfrage an vorname.name@polycare.de" }],
  ["Token/Zugangsdaten", { titel: "Key ghp_abcdefghij1234567890 gesetzt" }],
  ["Token/Zugangsdaten", { testbitte: "token: s3hr-geheim-1234" }],
  ["absoluter lokaler Pfad", { titel: "Fix in /home/steinberger/Rufus/x.js" }],
  ["absoluter lokaler Pfad", { testbitte: "Datei C:\\Users\\tibor\\plan.json oeffnen" }],
  ["mehrzeiliger Text", { titel: "Zeile eins\nZeile zwei" }],
  ["Markdown-Zitat", { testbitte: "Info > zitierter Issue-Body" }],
  ["Markdown-Zitat", { testbitte: "Schritte ``` code ``` pruefen" }],
];
let verbotenOk = true, verbotenFehl = "";
for (const [name, patch] of verboten) {
  const r = mit(patch);
  if (r.ok) { verbotenOk = false; verbotenFehl += ` [${name}: ${JSON.stringify(patch)}]`; }
}
ok("alle verbotenen Inhalte werden abgewiesen" + verbotenFehl, verbotenOk);
ok("harmloser Text mit # und : bleibt erlaubt",
  B.pruefeEintraege([{ ...gut, titel: "Modul 8: Blog ergaenzt (Issue #48)",
    testbitte: "Anker der Form #issue-31 pruefen" }]).ok);

// `pruefeText` ist der EINE Waechter — der Umsetzungsplan nutzt genau diesen.
ok("pruefeText meldet Nicht-Text", B.pruefeText(42, 100).join() === "muss Text sein");
ok("pruefeText meldet leeren Text", B.pruefeText("   ", 100).join() === "ist leer");
ok("pruefeText meldet Ueberlaenge", /ist laenger als 5 Zeichen/.test(B.pruefeText("abcdefg", 5).join()));
ok("pruefeText meldet verbotene Inhalte",
  /E-Mail-Adresse/.test(B.pruefeText("schreib an a.b@c.de", 100).join()));
ok("pruefeText laesst sauberen Text durch", B.pruefeText("Alles in Ordnung", 100).length === 0);
ok("VERBOTEN ist exportiert und nicht leer", Array.isArray(B.VERBOTEN) && B.VERBOTEN.length >= 5);

// --- 4) Ansicht „Was ist neu?" -------------------------------------------
const html = B.blogKarten(EINTRAEGE);
ok("jede Karte traegt ihre chg-id als Anker",
  EINTRAEGE.every(e => html.includes(`id="${e.id}"`)));
ok("Karte nennt Titel, Typ-Chip und Datum in Langform",
  html.includes(B.esc(seed.titel)) && /chip typ-feature/.test(html) && html.includes("5. August 2026"));
ok("Karte verlinkt das Issue auf github.com",
  html.includes(`https://github.com/${B.REPO}/issues/48`) && html.includes("Issue #48"));
ok("Testbitte wird ausgewiesen", /Bitte testen:/.test(html));
ok("leere Liste ergibt einen Hinweis statt leerem Markup", /class="leer"/.test(B.blogKarten([])));
const boese = { ...gut, titel: '<img src=x onerror="alert(1)">', testbitte: "<script>alert(2)</" + "script>" };
const boeseHtml = B.blogKarten([boese]);
ok("Eintragstexte werden escaped",
  !/<img src=x|<script>alert/i.test(boeseHtml) && /&lt;img src=x/.test(boeseHtml));
ok("datumLang ist fehlertolerant", B.datumLang("kein Datum") === "kein Datum");

// --- 5) Deep-Links --------------------------------------------------------
ok("#chg-… fuehrt in die Aenderungsliste",
  JSON.stringify(B.ankerZiel("#chg-20260805-01")) === JSON.stringify({ ansicht: "neu", id: "chg-20260805-01" }));
ok("#issue-… fuehrt seit #55 in den Umsetzungsplan (Anker bleibt stabil)",
  JSON.stringify(B.ankerZiel("#issue-31")) === JSON.stringify({ ansicht: "plan", id: "issue-31" }));
ok("Anker ohne Raute wird ebenfalls verstanden", B.ankerZiel("issue-31").id === "issue-31");
ok("unbekannte/leere Anker ergeben null",
  B.ankerZiel("#irgendwas") === null && B.ankerZiel("") === null && B.ankerZiel(null) === null);
ok("die Anker der Aenderungsliste sind echte Deep-Link-Ziele",
  EINTRAEGE.every(e => B.ankerZiel("#" + e.id) && html.includes(`href="#${e.id}"`)));

// --- 6) Read-only, statisch, kein GitHub-Pfad mehr -----------------------
const ohneKommentar = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
const src = ohneKommentar(readFileSync(new URL("../../docs/shared/sembla-blog.js", import.meta.url), "utf8"));
ok("Baustein ist DOM-frei", !/document\.|window\.|localStorage\./.test(src));
ok("Baustein liest kein Wandelement und kein Eingaben-Modell",
  !/storage\.js|wandelement|mergeEingaben|buildWall/i.test(src));
ok("Baustein ruft nichts ab (kein Fetch, keine API-URL, kein Token)",
  !/fetch\(|api\.github\.com|Authorization|client_secret/i.test(src));
ok("der Anzeigecache ist ersatzlos entfallen", !/CACHE_KEY|sembla:blog:issues/.test(src));
ok("die Bausteine der Ansicht Projektstatus sind entfallen",
  !/gruppiereIssues|filterIssue|STATUS_GRUPPEN|entscheidungAbsatz|issueKarte/.test(src)
  && B.gruppiereIssues === undefined && B.filterIssues === undefined
  && B.ISSUES_URL === undefined && B.CACHE_KEY === undefined);
const daten = ohneKommentar(readFileSync(new URL("../../docs/shared/blog-eintraege.js", import.meta.url), "utf8"));
ok("der Datensatz enthaelt nur Daten (keine Logik)", !/\bfunction\b|=>/.test(daten));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
