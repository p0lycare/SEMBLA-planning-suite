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
// Der NEUESTE Eintrag sind die realen Einbaulagen des Spannsystems (#92) — er wird als
// einziger direkt ueber `EINTRAEGE[0]` geprueft; die bisherige Reihe rueckt geschlossen um
// eins nach hinten. Aussagewahr heisst hier: versprochen wird GENAU der geaenderte
// STANGENBEDARF aus zwei Katalogmassen — unten die halbe Kopplungsmutterhoehe, oben die
// Spannplattendicke ueber der Steinoberkante — und die benannte Luecke, wenn ein Mass fehlt.
// Ausdruecklich NICHT versprochen werden Stueckliste/Positionen, Unterlegscheibe,
// Sechskantschraube, eine geaenderte Zeichnung/Darstellung, Handbuchregeln oder ein
// aktualisierter Standardkatalog: die bleiben in diesem Stand offen.
//
// Fuer Issue 92 gibt es bereits aeltere Eintraege (`SPANNPLATTE`, `KOPFBLECH`) — eine
// „genau ein Eintrag"-Pruefung waere hier also falsch und steht bewusst nicht da.
ok("[#92] die realen Einbaulagen des Spannsystems sind der neueste Eintrag",
  EINTRAEGE[0]?.id === "chg-20260906-01" && EINTRAEGE[0]?.issue === 92
  && EINTRAEGE[0]?.typ === "feature" && EINTRAEGE[0]?.datum === "2026-09-06");
ok("[#92] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Stangenbedarf/i.test(EINTRAEGE[0]?.titel || "")
  && /Kopplungsmutter/i.test(EINTRAEGE[0]?.titel || "")
  && /Spannplatte/i.test(EINTRAEGE[0]?.titel || "")
  // Keine Zusage zu Stueckliste, weiteren Bauteilen, Darstellung oder Katalogvorlage.
  && !/Stückliste|Position|Unterlegscheibe|Sechskantschraube|Zeichnung|Darstellung|Handbuch|Standardkatalog/i
       .test(EINTRAEGE[0]?.titel || ""));
ok("[#92] die Testbitte fuehrt den echten Bedienweg samt Fehlerpfad",
  /Modul 1/.test(EINTRAEGE[0]?.testbitte || "")
  && /Kopplungsmutter/.test(EINTRAEGE[0]?.testbitte || "")
  && /Spannplatte/.test(EINTRAEGE[0]?.testbitte || "")
  && /Einbauhöhe/.test(EINTRAEGE[0]?.testbitte || "")
  && /halbe Mutterhöhe/.test(EINTRAEGE[0]?.testbitte || "")
  && /Überstand/.test(EINTRAEGE[0]?.testbitte || "")
  // Der Fehlerpfad gehoert dazu: fehlendes Mass wird benannt, nichts wird geraten.
  && /[Ff]ehlt ein Maß/.test(EINTRAEGE[0]?.testbitte || "")
  && /benannt/.test(EINTRAEGE[0]?.testbitte || ""));
ok("[#92] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Stückliste|Position|Preis|Unterlegscheibe|Sechskantschraube|Zeichnung|Handbuch|Standardkatalog|Montage/i
    .test(EINTRAEGE[0]?.testbitte || ""));

// Die gesammelten Zeichnungs-PDFs (#98) ruecken um eins nach hinten und zaehlen ab hier ueber
// `ZEICHNUNGSPDF`. Aussagewahr heisst hier: versprochen wird GENAU der eine ZIP-Download mit einer PDF
// je Geschoss, der Lageplan als erste Seite, die Wandblaetter dahinter und die Nennung eines
// fehlenden Wandelements vor dem Download; ausdruecklich NICHT versprochen werden ein
// geaendertes Blatt, ein anderer Masstab, ein anderes Papierformat, ein geaenderter
// Zeichnungsinhalt oder eine Aenderung am bestehenden Export/Projektarchiv.
const ZEICHNUNGSPDF = EINTRAEGE[1];
ok("[#98] die gesammelten Zeichnungs-PDFs folgen darauf",
  ZEICHNUNGSPDF?.id === "chg-20260905-01" && ZEICHNUNGSPDF?.issue === 98
  && ZEICHNUNGSPDF?.typ === "feature" && ZEICHNUNGSPDF?.datum === "2026-09-05");
ok("[#98] der Eintrag benennt Gegenstand, Umfang und Nutzerergebnis",
  /Zeichnungen/.test(ZEICHNUNGSPDF?.titel || "")
  && /geschossweise/i.test(ZEICHNUNGSPDF?.titel || "")
  && /PDF/.test(ZEICHNUNGSPDF?.titel || "")
  && /ZIP/.test(ZEICHNUNGSPDF?.titel || "")
  // Keine Zusage zu Blatt, Masstab, Inhalt oder bestehenden Exporten: die bleiben, wie sie sind.
  && !/Maßstab|Blattformat|Bemaßung|Schriftfeld|Zeichnungsinhalt|Projektarchiv/i
       .test(ZEICHNUNGSPDF?.titel || ""));
ok("[#98] die Testbitte fuehrt den Bedienweg, die Seitenfolge und den Fehlerpfad",
  /Modul 0/.test(ZEICHNUNGSPDF?.testbitte || "")
  && /Zeichnungen als PDF/.test(ZEICHNUNGSPDF?.testbitte || "")
  && /je Geschoss/.test(ZEICHNUNGSPDF?.testbitte || "")
  && /Seite 1/.test(ZEICHNUNGSPDF?.testbitte || "")
  && /Wandelement/.test(ZEICHNUNGSPDF?.testbitte || ""));
ok("genau ein Eintrag fuer Issue 98 (gesammelte Zeichnungs-PDFs)",
  EINTRAEGE.filter(e => e.issue === 98).length === 1);

// Die browserhohe Blattvorschau (#99) rueckt um eins nach hinten und zaehlt ab hier ueber
// `VORSCHAUHOEHE`. Aussagewahr heisst hier: versprochen wird GENAU die Bildschirmhoehe des
// Vorschaubereichs in Modul 7 — in beiden Zustaenden (mit Zeichnung und ohne aktives
// Wandelement) — und dass das gedruckte Blatt einseitig bleibt; ausdruecklich NICHT
// versprochen werden ein anderes Blattformat, ein anderer Masstab, eine andere
// Blattgeometrie oder ein geaenderter Zeichnungsinhalt.
const VORSCHAUHOEHE = EINTRAEGE[2];
ok("[#99] die browserhohe Blattvorschau folgt darauf",
  VORSCHAUHOEHE?.id === "chg-20260904-12" && VORSCHAUHOEHE?.issue === 99
  && VORSCHAUHOEHE?.typ === "fix" && VORSCHAUHOEHE?.datum === "2026-09-04");
ok("[#99] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Blattvorschau/.test(VORSCHAUHOEHE?.titel || "")
  && /Browserfensters?/.test(VORSCHAUHOEHE?.titel || "")
  // Keine Zusage zu Blatt, Masstab oder Inhalt: gezeichnet wird unveraendert.
  && !/Maßstab|Blattformat|Bemaßung|Stückliste|Schriftfeld|Zeichnungsinhalt/i
       .test(VORSCHAUHOEHE?.titel || ""));
ok("[#99] die Testbitte fuehrt den Bedienweg samt beiden Zustaenden und dem Druck",
  /Modul 7/.test(VORSCHAUHOEHE?.testbitte || "")
  && /Blattvorschau/.test(VORSCHAUHOEHE?.testbitte || "")
  && /ohne aktives Wandelement/.test(VORSCHAUHOEHE?.testbitte || "")
  && /einseitig/.test(VORSCHAUHOEHE?.testbitte || ""));
ok("genau ein Eintrag fuer Issue 99 (browserhohe Blattvorschau)",
  EINTRAEGE.filter(e => e.issue === 99).length === 1);

// Die korrigierte Standardlaenge der Gewindestange (#103) rueckt geschlossen um eins nach
// hinten und zaehlt ab hier ueber `STANDARDLAENGE`. Aussagewahr heisst hier: versprochen wird
// GENAU der geaenderte Datenwert des ausgelieferten Standardkatalogs samt passender
// Bezeichnung; ausdruecklich NICHT versprochen werden geaenderte Preise, Katalogrollen, eine
// geaenderte Zuschnitt-/Mengenlogik oder eine Umstellung bereits vorhandener eigener Kataloge.
const STANDARDLAENGE = EINTRAEGE[3];
ok("die korrigierte Standardlaenge (Issue 103) ist der neueste Eintrag",
  STANDARDLAENGE?.id === "chg-20260904-11" && STANDARDLAENGE?.issue === 103
  && STANDARDLAENGE?.typ === "fix" && STANDARDLAENGE?.datum === "2026-09-04");
ok("der Eintrag benennt Ort, Bauteil und die neue Laenge",
  /Standardkatalog/.test(STANDARDLAENGE?.titel || "")
  && /Gewindestange/.test(STANDARDLAENGE?.titel || "")
  && /920 mm/.test(STANDARDLAENGE?.titel || "")
  // Keine Preis-/Rollen-/Mengen-/Logik-/Migrationszusage: gerechnet wird unveraendert.
  && !/Preis|Rolle|Menge|Stückliste|Vorspannung|migriert|umgestellt/i.test(STANDARDLAENGE?.titel || ""));
ok("die Testbitte fuehrt den echten Bedienweg samt beiden sichtbaren Angaben",
  /Modul 0/.test(STANDARDLAENGE?.testbitte || "")
  && /Standardkatalog laden/.test(STANDARDLAENGE?.testbitte || "")
  && /920 mm/.test(STANDARDLAENGE?.testbitte || "")
  && /Bezeichnung/.test(STANDARDLAENGE?.testbitte || ""));
ok("genau ein Eintrag fuer Issue 103 (Standardlaenge der Gewindestange)",
  EINTRAEGE.filter(e => e.issue === 103).length === 1);

// Der Kopierschutz des Standardkatalogs (#102) rueckt geschlossen um eins nach hinten und
// zaehlt ab hier ueber `KOPIERSCHUTZ`. Aussagewahr heisst hier: versprochen wird die
// unveraenderliche Vorlage, die automatisch angelegte Projektkopie beim ersten Bearbeiten und
// der Erhalt eigener Kataloge; ausdruecklich NICHT versprochen werden geaenderte Mengen,
// Preise, Katalogrollen oder eine Zusammenfuehrung/Historie lokaler Aenderungen.
const KOPIERSCHUTZ = EINTRAEGE[4];
ok("der Standardkatalog-Kopierschutz (Issue 102) folgt darauf",
  KOPIERSCHUTZ?.id === "chg-20260904-10" && KOPIERSCHUTZ?.issue === 102
  && KOPIERSCHUTZ?.typ === "fix" && KOPIERSCHUTZ?.datum === "2026-09-04");
ok("der Eintrag benennt beide Seiten: unveraenderliche Vorlage und automatische Kopie",
  /Vorlage/.test(KOPIERSCHUTZ?.titel || "")
  && /unveränderlich/i.test(KOPIERSCHUTZ?.titel || "")
  && /[Kk]opie/.test(KOPIERSCHUTZ?.titel || "")
  // Keine Mengen-/Preis-/Rollen-/Historienzusage: gerechnet wird unveraendert.
  && !/Menge|Preis|Rolle|Stückliste|Historie|zusammengeführt/i.test(KOPIERSCHUTZ?.titel || ""));
ok("die Testbitte fuehrt den vollstaendigen Bedienweg samt erneutem Laden",
  /Modul 0/.test(KOPIERSCHUTZ?.testbitte || "")
  && /Standardkatalog laden/.test(KOPIERSCHUTZ?.testbitte || "")
  && /Projektkopie/.test(KOPIERSCHUTZ?.testbitte || "")
  && /erneutes Laden/i.test(KOPIERSCHUTZ?.testbitte || "")
  && /eigene Kataloge/.test(KOPIERSCHUTZ?.testbitte || ""));
ok("genau ein Eintrag fuer Issue 102 (Standardkatalog-Kopierschutz)",
  EINTRAEGE.filter(e => e.issue === 102).length === 1);

// Die Zwischenspannpunkte (#93) ruecken um eins nach hinten — er wird als
// einziger direkt ueber `EINTRAEGE[0]` geprueft; die bisherige Reihe rueckt
// geschlossen um eins nach hinten und zaehlt ueber `SPANNPLATTE`, `WANDAUSWAHL`, `KOPFBLECH`,
// `STOSS`, `HERKUNFT`, `VORSCHAU`, `SEITEN`, `BLASEN`, `PLANKOPF`, `LETZTER`,
// `ZOOM`, `VORHER`, `NEU`, `AKTUELL` und `AELTER`, damit beim Nachruecken nur
// diese benannten Bezuege zu drehen sind und nicht jeder einzelne Index.
// Ueber `VORHER` zaehlen damit: #88 (Auswahl), #90 (sichtbare
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
const VORHER = EINTRAEGE.slice(23);
const NEU = EINTRAEGE.slice(29);
const AKTUELL = EINTRAEGE.slice(34);
const AELTER = EINTRAEGE.slice(44);
// Der NEUESTE Eintrag ist die TEILAUSWAHL des Projektimports (#86): aus einer geprueften
// Projektdatei laesst sich auch nur ein Geschoss oder eine einzelne Wand uebernehmen.
// Aussagewahr heisst hier: geprueft wird weiter die GANZE Datei, die Exportseite ist
// unveraendert, es entsteht kein Feld und kein Versionssprung.
// Der NEUESTE Eintrag ist die manuelle Menge auf der GESCHOSSEBENE (#81): je aggregierter
// Position der Geschoss-Gesamtstueckliste laesst sich eine Menge setzen, und die angepasste
// Fassung des Exports traegt sie. Aussagewahr heisst hier: die berechnete Menge bleibt
// abgeleitet und sichtbar, der Einzelpreis wird nicht angefasst, und ueber dem Geschoss
// (Gebaeude/Projekt) wirkt sie ausdruecklich nicht.
// Darauf folgt die Anbindung des Bodenblech-Vorratssatzes (#91, Folgepaket): die in
// Modul 1 gewaehlten Standardlaengen bestimmen jetzt WIRKLICH die Aufteilung — vorher rechnete
// der Kern mit seiner vollen Standardreihe weiter, egal was gewaehlt war. Aussagewahr heisst
// hier: versprochen wird die Wirkung der AUSWAHL auf die Stueckliste, ausdruecklich nicht die
// Darstellung echter Blechstoesse (die bleibt offen) und keine Preis-/Formatzusage.
// Der NEUESTE Eintrag ist die einpassbare, zoombare Wandansicht in Modul 1 (#100): das Bild
// steht beim Oeffnen vollstaendig im Fenster und laesst sich stufenweise vergroessern.
// Aussagewahr heisst hier: versprochen wird allein die DARSTELLUNG in Modul 1 — keine
// geaenderte Wandgeometrie, kein Druck-/Exportversprechen und kein gespeicherter Zustand.
// Der NEUESTE Eintrag ist die feste Reihenfolge der Wandauswahl in der Kopfleiste (#101).
// Aussagewahr heisst hier: versprochen wird allein die ANSICHT des Dropdowns — keine
// geaenderte Speicherreihenfolge, keine neue Auswahlmoeglichkeit (fremde Geschosse bleiben
// draussen) und kein umgeschriebener Name/Zeitstempel.
// Der NEUESTE Eintrag sind die Zwischenspannpunkte (#93) — er wird als einziger direkt
// ueber `EINTRAEGE[0]` geprueft. Aussagewahr heisst hier: versprochen wird die abgeleitete
// Vorgabe je Strang, die lagengenaue Bearbeitung und die Rueckkehr zu Auto; ausdruecklich
// NICHT versprochen werden Stueckliste, Menge, Preis, Katalogrolle oder Blechmasse — die
// bleiben in diesem Stand offen.
const ZWISCHEN = EINTRAEGE[5];
ok("die Zwischenspannpunkte (Issue 93) folgen darauf",
  ZWISCHEN?.id === "chg-20260904-09" && ZWISCHEN?.issue === 93
  && ZWISCHEN?.typ === "feature" && ZWISCHEN?.datum === "2026-09-04");
ok("der Eintrag benennt beide Seiten: abgeleitete Vorgabe und eigene Bearbeitung",
  /automatisch/i.test(ZWISCHEN?.titel || "")
  && /lagengenau/i.test(ZWISCHEN?.titel || "")
  && /bearbeitbar/i.test(ZWISCHEN?.titel || "")
  // Keine Stuecklisten-/Mengen-/Preis-/Katalog-/Nachweiszusage: das bleibt offen.
  && !/Stückliste|Menge|Preis|Katalog|Nachweis|Maß/i.test(ZWISCHEN?.titel || ""));
ok("die Testbitte fuehrt den vollstaendigen Bedienweg samt Rueckkehr zu Auto",
  /Modul 1/.test(ZWISCHEN?.testbitte || "")
  && /Oberkante/.test(ZWISCHEN?.testbitte || "")
  && /ziehen/.test(ZWISCHEN?.testbitte || "")
  && /löschen/.test(ZWISCHEN?.testbitte || "")
  && /Zurück zu Auto/.test(ZWISCHEN?.testbitte || ""));
const neu93 = EINTRAEGE.filter(e => e.issue === 93);
ok("genau ein Eintrag fuer Issue 93 (Zwischenspannpunkte)", neu93.length === 1);

// Der Spannplatten-Default (#92) rueckt geschlossen um eins nach hinten. Aussagewahr heisst
// hier: versprochen wird die VORAUSWAHL fuer NEUE Waende und der Fortbestand einer
// gespeicherten Kopfblech-Wahl; nicht versprochen werden geaenderte Mengen, Preise,
// Katalogrollen oder eine Umstellung des Bestands.
const SPANNPLATTE = EINTRAEGE[6];
ok("der Spannplatten-Default (Issue 92) folgt darauf",
  SPANNPLATTE?.id === "chg-20260904-08" && SPANNPLATTE?.issue === 92
  && SPANNPLATTE?.typ === "feature" && SPANNPLATTE?.datum === "2026-09-04");
ok("der Eintrag benennt beide Seiten: neuer Standard und weiter waehlbares Kopfblech",
  /Spannplatte/.test(SPANNPLATTE?.titel || "")
  && /Kopfblech/.test(SPANNPLATTE?.titel || "")
  && /wählbar/.test(SPANNPLATTE?.titel || "")
  // Keine Mengen-/Preis-/Format-/Bestandszusage: gerechnet wird unveraendert.
  && !/Menge|Preis|Maßstab|neues Format|umgestellt|alle Wände/i.test(SPANNPLATTE?.titel || ""));
ok("die Testbitte benennt neue Wand UND Bestandswand als die beiden Faelle",
  /neue Wand/.test(SPANNPLATTE?.testbitte || "")
  && /Modul 1/.test(SPANNPLATTE?.testbitte || "")
  && /bestehende Wand/.test(SPANNPLATTE?.testbitte || "")
  && /Kopfblech/.test(SPANNPLATTE?.testbitte || ""));

// Die feste Reihenfolge der Wandauswahl (#101) rueckt geschlossen um eins nach hinten.
const WANDAUSWAHL = EINTRAEGE[7];
ok("die feste Wandauswahl-Reihenfolge (Issue 101) folgt darauf",
  WANDAUSWAHL?.id === "chg-20260904-07" && WANDAUSWAHL?.issue === 101
  && WANDAUSWAHL?.typ === "fix" && WANDAUSWAHL?.datum === "2026-09-04");
ok("der Eintrag benennt Bedienort, Gegenstand und Nutzerergebnis",
  /Kopfleiste/.test(WANDAUSWAHL?.titel || "")
  && /Wandauswahl/.test(WANDAUSWAHL?.titel || "")
  && /Wand 2/.test(WANDAUSWAHL?.titel || "")
  && /Wand 10/.test(WANDAUSWAHL?.titel || "")
  // Keine Mengen-/Preis-/Masstabs-/Formatzusage: sortiert wird nur die Anzeige.
  && !/Menge|Preis|Maßstab|neues Format|neue Regel/i.test(WANDAUSWAHL?.titel || ""));
ok("die Testbitte benennt Wechsel UND Bearbeitung als die beiden stabilen Faelle",
  /wechseln/.test(WANDAUSWAHL?.testbitte || "")
  && /bearbeiten/.test(WANDAUSWAHL?.testbitte || "")
  && /Reihenfolge/.test(WANDAUSWAHL?.testbitte || ""));

// Die Kopfblech-Festschreibung (#92) rueckt geschlossen um eins nach hinten und zaehlt
// ab hier ueber `KOPFBLECH`. Sie ist AUSDRUECKLICH `intern`: das Paket schreibt nur die
// bestehenden Kopfblech-Faelle der Tests explizit fest und aendert weder Produktverhalten
// noch Oberflaeche — deshalb verspricht sie auch keine Bedienprobe und keinen neuen Default.
const KOPFBLECH = EINTRAEGE[8];
ok("die Kopfblech-Festschreibung (Issue 92) folgt darauf",
  KOPFBLECH?.id === "chg-20260904-06" && KOPFBLECH?.issue === 92
  && KOPFBLECH?.typ === "intern" && KOPFBLECH?.datum === "2026-09-04");
ok("der Eintrag benennt Vorarbeit und Gegenstand, ohne ein Nutzerergebnis zu behaupten",
  /Vorarbeit/.test(KOPFBLECH?.titel || "")
  && /Kopfblech/.test(KOPFBLECH?.titel || "")
  // Kein Bedien-, Mengen-, Preis- oder Formatversprechen: sichtbar aendert sich nichts.
  && !/Menge|Preis|Maßstab|neues Format|neue Regel|Spannplatte ist|jetzt/i.test(KOPFBLECH?.titel || ""));
ok("die reine Vorarbeit verspricht keine Bedienprobe (keine Testbitte)",
  KOPFBLECH?.testbitte === undefined);

// Die Bodenblech-Stossdarstellung (#91) rueckt geschlossen um eins nach hinten: die
// Darstellung der realen Bodenblechteile in Modul 5 und Modul 7 (#91, Abschlusspaket). Aussagewahr heisst hier: versprochen wird allein die
// DARSTELLUNG — die Zerlegung selbst kam mit chg-20260904-02 aus dem Rechenkern, und es
// aendert sich keine Menge, kein Preis, kein Masstab und kein Format.
const STOSS = EINTRAEGE[9];
ok("die Bodenblech-Stossdarstellung (Issue 91) folgt darauf",
  STOSS?.id === "chg-20260904-05" && STOSS?.issue === 91
  && STOSS?.typ === "feature" && STOSS?.datum === "2026-09-04");
ok("der Stossdarstellungs-Eintrag benennt beide Ausgaben, das Bauteil und das Nutzerergebnis",
  /Montageanleitung/.test(STOSS?.titel || "")
  && /Wandzeichnung/.test(STOSS?.titel || "")
  && /Bodenblechteile/.test(STOSS?.titel || "")
  && /Stöße/.test(STOSS?.titel || "")
  // Keine Mengen-/Preis-/Masstabs-/Formatzusage — gezeigt wird, was schon gerechnet ist.
  && !/Menge|Preis|Maßstab|neues Format|neue Regel/i.test(STOSS?.titel || ""));
ok("die Stossdarstellungs-Testbitte benennt beide Module, den Abgleich und den Sonderzuschnitt",
  /Modul 5/.test(STOSS?.testbitte || "")
  && /Modul 7/.test(STOSS?.testbitte || "")
  && /Modul 4/.test(STOSS?.testbitte || "")
  && /Stoßlinien/.test(STOSS?.testbitte || "")
  && /schraffiert/.test(STOSS?.testbitte || ""));

// Die einpassbare Wandansicht (#100) rueckt geschlossen um eins nach hinten und zaehlt
// ab hier ueber `ZOOM`, damit keine Indizes zu drehen sind.
const ZOOM = EINTRAEGE[10];
ok("die einpassbare Wandansicht (Issue 100) folgt darauf",
  ZOOM?.id === "chg-20260904-04" && ZOOM?.issue === 100
  && ZOOM?.typ === "feature" && ZOOM?.datum === "2026-09-04");
ok("der Zoom-Eintrag benennt Bedienort, Gegenstand und Nutzerergebnis",
  /Modul 1/.test(ZOOM?.titel || "")
  && /Wandansicht/.test(ZOOM?.titel || "")
  && /(zoom|Zoom)/.test(ZOOM?.titel || "")
  && /Fenster/.test(ZOOM?.titel || "")
  // Keine Zeichnungs-/Druck-/Preis-/Formatzusage — es ist reine Oberflaeche.
  && !/Zeichnung|Druck|Export|Preis|neues Format|neue Regel/i.test(ZOOM?.titel || ""));
ok("die Zoom-Testbitte benennt Modul, Bedienelemente und die Startgroesse",
  /Modul 1/.test(ZOOM?.testbitte || "")
  && /Größer/.test(ZOOM?.testbitte || "")
  && /Kleiner/.test(ZOOM?.testbitte || "")
  && /Einpassen/.test(ZOOM?.testbitte || ""));

const VORRATSSATZ = EINTRAEGE[11];
ok("die Bodenblech-Auswahlanbindung (Issue 91) folgt darauf",
  VORRATSSATZ?.id === "chg-20260904-03" && VORRATSSATZ?.issue === 91
  && VORRATSSATZ?.typ === "feature" && VORRATSSATZ?.datum === "2026-09-04");
ok("der Vorratssatz-Eintrag benennt Bedienort, Bauteil und Nutzerergebnis",
  /Modul 1/.test(VORRATSSATZ?.titel || "")
  && /Bodenblech/.test(VORRATSSATZ?.titel || "")
  && /Standardlänge/.test(VORRATSSATZ?.titel || "")
  && /Stückliste/.test(VORRATSSATZ?.titel || "")
  // Keine Zeichnungs-/Preis-/Formatzusage — die Darstellung echter Stoeße folgt getrennt.
  && !/Zeichnung|Preis|neues Format|neue Regel/i.test(VORRATSSATZ?.titel || ""));
ok("die Vorratssatz-Testbitte benennt die Auswahl, das Ergebnis und den Fall ohne Auswahl",
  /Bodenblech/.test(VORRATSSATZ?.testbitte || "")
  && /1250/.test(VORRATSSATZ?.testbitte || "")
  && /Modul 4/.test(VORRATSSATZ?.testbitte || "")
  && /Rastermaße/.test(VORRATSSATZ?.testbitte || "")
  && /[Oo]hne\s+Auswahl/.test(VORRATSSATZ?.testbitte || ""));

// DREI Eintraege fuer #91 — und das ist richtig so, weil es drei getrennte
// Nutzerergebnisse mit drei getrennten Testbitten sind: chg-20260904-02 hat das Bodenblech
// im Rechenkern in reale Teile zerlegt, chg-20260904-03 bindet die KATALOGAUSWAHL daran an,
// und chg-20260904-05 ZEIGT die Teile samt Stoessen in Montage und Zeichnung.
ok("alle drei #91-Eintraege stehen in der Liste, neu vor alt",
  EINTRAEGE.filter(e => e.issue === 91).map(e => e.id).join(",")
    === "chg-20260904-05,chg-20260904-03,chg-20260904-02");

// Die Zerlegung im Rechenkern (#91, Kernpaket) folgt darauf.
const ZERLEGUNG = EINTRAEGE[12];
ok("die Bodenblech-Zerlegung (Issue 91) folgt als zweiter Eintrag",
  ZERLEGUNG?.id === "chg-20260904-02" && ZERLEGUNG?.issue === 91
  && ZERLEGUNG?.typ === "feature" && ZERLEGUNG?.datum === "2026-09-04");
ok("der Bodenblech-Eintrag benennt Gegenstand, Bauteil und Nutzerergebnis",
  /Stückliste/.test(ZERLEGUNG?.titel || "")
  && /Bodenblech/.test(ZERLEGUNG?.titel || "")
  && /Standardlänge/.test(ZERLEGUNG?.titel || "")
  // Keine Zeichnungs-/Preis-/Formatzusage — die Darstellung folgt getrennt.
  && !/Zeichnung|Preis|neues Format|neue Regel/i.test(ZERLEGUNG?.titel || ""));
ok("die Bodenblech-Testbitte benennt Modul, Maße und die Fugenregel",
  /Modul 1/.test(ZERLEGUNG?.testbitte || "")
  && /Modul 4/.test(ZERLEGUNG?.testbitte || "")
  && /Rastermaß/.test(ZERLEGUNG?.testbitte || "")
  && /Bauteilmaß/.test(ZERLEGUNG?.testbitte || "")
  && /Steinfuge/.test(ZERLEGUNG?.testbitte || ""));

// Die manuelle Menge der Geschossebene (#81) folgt darauf.
const GESCHOSSMENGE = EINTRAEGE[13];
ok("die manuelle Menge der Geschossebene (Issue 81) folgt als zweiter Eintrag",
  GESCHOSSMENGE?.id === "chg-20260904-01" && GESCHOSSMENGE?.issue === 81
  && GESCHOSSMENGE?.typ === "feature" && GESCHOSSMENGE?.datum === "2026-09-04");
ok("der Geschossmengen-Eintrag benennt Gegenstand, Ebene und Nutzerergebnis",
  /Stückliste/.test(GESCHOSSMENGE?.titel || "")
  && /Menge/.test(GESCHOSSMENGE?.titel || "")
  && /Geschoss/.test(GESCHOSSMENGE?.titel || "")
  && /manuell/.test(GESCHOSSMENGE?.titel || "")
  // Kein Preisversprechen, keine neue Regel, kein Formatsprung.
  && !/Preis|neues Format|neue Regel/i.test(GESCHOSSMENGE?.titel || ""));
ok("die Geschossmengen-Testbitte benennt Ebene, Anzeige und Exportfassung",
  /Modul 4/.test(GESCHOSSMENGE?.testbitte || "")
  && /Modul 0/.test(GESCHOSSMENGE?.testbitte || "")
  && /Geschoss/.test(GESCHOSSMENGE?.testbitte || "")
  && /nebeneinander/.test(GESCHOSSMENGE?.testbitte || "")
  && /angepasst/.test(GESCHOSSMENGE?.testbitte || ""));

// Die Teilauswahl des Projektimports (#86) folgt darauf.
const TEILAUSWAHL = EINTRAEGE[14];
ok("die Teilauswahl des Projektimports (Issue 86) folgt als dritter Eintrag",
  TEILAUSWAHL?.id === "chg-20260902-01" && TEILAUSWAHL?.issue === 86
  && TEILAUSWAHL?.typ === "feature" && TEILAUSWAHL?.datum === "2026-09-02");
ok("der Teilauswahl-Eintrag benennt Gegenstand, Umfang und Nutzerergebnis",
  /Projektimport/.test(TEILAUSWAHL?.titel || "")
  && /Geschoss/.test(TEILAUSWAHL?.titel || "")
  && /Wand/.test(TEILAUSWAHL?.titel || "")
  && /übernehmen/.test(TEILAUSWAHL?.titel || "")
  // Kein geaenderter Export, kein neues Format, keine neue Fachregel.
  && !/neues Format|Export geändert|neue Regel/i.test(TEILAUSWAHL?.titel || ""));
ok("die Teilauswahl-Testbitte benennt Weg, Wahl, Ziel und Bestätigung",
  /Modul 0/.test(TEILAUSWAHL?.testbitte || "")
  && /Was übernehmen/.test(TEILAUSWAHL?.testbitte || "")
  && /Zielprojekt/.test(TEILAUSWAHL?.testbitte || "")
  && /bestätigen/.test(TEILAUSWAHL?.testbitte || ""));

// Der EINE Projektimport-Dialog (#86) folgt darauf: er liest neben dem vollstaendigen
// Projektarchiv auch die ZIP des zentralen Exports und uebernimmt das ganze Projekt.
// Aussagewahr heisst dort: hinzugekommen ist allein ein LESEWEG — die Exportseite ist
// unveraendert, es entsteht kein Feld und kein Versionssprung.
const IMPORTDIALOG = EINTRAEGE[15];
ok("der eine Projektimport-Dialog (Issue 86) folgt als dritter Eintrag",
  IMPORTDIALOG?.id === "chg-20260818-04" && IMPORTDIALOG?.issue === 86
  && IMPORTDIALOG?.typ === "feature" && IMPORTDIALOG?.datum === "2026-08-18");
ok("der Import-Eintrag benennt Gegenstand, Quelle und Nutzerergebnis",
  /Projektimport/.test(IMPORTDIALOG?.titel || "")
  && /Dialog/.test(IMPORTDIALOG?.titel || "")
  && /Projekt-ZIP/.test(IMPORTDIALOG?.titel || "")
  && /ganze Projekt/.test(IMPORTDIALOG?.titel || "")
  // Keine Teilauswahl, kein geaenderter Export, kein neues Format.
  && !/Teilauswahl|neues Format|Export geändert/i.test(IMPORTDIALOG?.titel || ""));
ok("die Import-Testbitte benennt den Weg, den Bericht und die Bestätigung",
  /Modul 0/.test(IMPORTDIALOG?.testbitte || "")
  && /exportieren/.test(IMPORTDIALOG?.testbitte || "")
  && /Bericht/.test(IMPORTDIALOG?.testbitte || "")
  && /Katalogkennung/.test(IMPORTDIALOG?.testbitte || "")
  && /Importieren/.test(IMPORTDIALOG?.testbitte || ""));

// Der Kommentar je Stuecklistenposition in der exportierten Baustellenstueckliste der
// Wandebene (#81) folgt darauf: eine eigene, angehaengte Spalte, in beiden Mengenfassungen
// gleich. Aussagewahr heisst dort: hinzugekommen ist allein ein AUSGABEWEG — erfasst wird
// weiter nur in Modul 4, und abgeleitet wird daraus nichts ([P-20]).
const KOMMENTAR = EINTRAEGE[16];
ok("der Kommentar in der Wandstückliste (Issue 81) folgt direkt auf den neuesten Eintrag",
  KOMMENTAR?.id === "chg-20260818-03" && KOMMENTAR?.issue === 81
  && KOMMENTAR?.typ === "feature" && KOMMENTAR?.datum === "2026-08-18");
ok("der Kommentar-Eintrag benennt Gegenstand, Ausgabeweg und die Ebene",
  /Stückliste/.test(KOMMENTAR?.titel || "")
  && /Kommentar/.test(KOMMENTAR?.titel || "")
  && /exportierte/.test(KOMMENTAR?.titel || "")
  && /Wandstückliste/.test(KOMMENTAR?.titel || "")
  // Keine geaenderte Menge, kein Preis, kein neues Feld, keine Gesamtebene.
  && !/Menge geändert|Preis|neues Feld|Gesamtstückliste/i.test(KOMMENTAR?.titel || ""));
ok("die Kommentar-Testbitte benennt beide Module, die Spalte und was unveraendert bleibt",
  /Modul 4/.test(KOMMENTAR?.testbitte || "")
  && /Modul 0/.test(KOMMENTAR?.testbitte || "")
  && /Kommentar/.test(KOMMENTAR?.testbitte || "")
  && /beiden Mengenfassungen/.test(KOMMENTAR?.testbitte || "")
  && /Mengen und Preise bleiben/.test(KOMMENTAR?.testbitte || ""));

const HERKUNFT = EINTRAEGE[17];
// Der bisher neueste Eintrag nimmt die WANDHERKUNFT aus Modul 4 und der Gesamtstueckliste-Datei
// (#81): auf den Gesamtebenen faellt die Spalte „Wände (Herkunft)“ ersatzlos weg. Aussagewahr
// heisst hier: geaendert hat sich allein die DARSTELLUNG — Mengen, Einbauteil-IDs, Preise und
// die Wandebene bleiben, und die Aufloesbarkeit steckt weiter in der Ableitung ([P-19]/[P-20]).
ok("die entfallene Wandherkunft (Issue 81) folgt darauf",
  HERKUNFT?.id === "chg-20260818-02" && HERKUNFT?.issue === 81
  && HERKUNFT?.typ === "feature" && HERKUNFT?.datum === "2026-08-18");
ok("der Herkunfts-Eintrag benennt Gegenstand, beide Ausgabewege und das Nutzerergebnis",
  /Stückliste/.test(HERKUNFT?.titel || "")
  && /Herkunftswänden/.test(HERKUNFT?.titel || "")
  && /entfällt/.test(HERKUNFT?.titel || "")
  && /Anzeige/.test(HERKUNFT?.titel || "")
  && /Export/.test(HERKUNFT?.titel || "")
  // Keine neue Menge, kein neuer Preis, kein neues Feld und keine geaenderte Wandebene.
  && !/Menge geändert|Preis|neues Feld|Wandebene/i.test(HERKUNFT?.titel || ""));
ok("die Herkunfts-Testbitte benennt Ebenen, beide Orte und was unveraendert bleibt",
  /Modul 4/.test(HERKUNFT?.testbitte || "")
  && /Modul 0/.test(HERKUNFT?.testbitte || "")
  && /Geschoss-, Gebäude- und Projektebene/.test(HERKUNFT?.testbitte || "")
  && /Einbauteil-IDs/.test(HERKUNFT?.testbitte || "")
  && /Mengenfassungen/.test(HERKUNFT?.testbitte || "")
  && /Baustellenstückliste der Wand bleibt gleich/.test(HERKUNFT?.testbitte || ""));

const VORSCHAU = EINTRAEGE[18];
// Der bisher neueste Eintrag stellt die BLATTVORSCHAU von Modul 9 auf das echte Papierverhaeltnis
// des gewaehlten Formats um (#89): Vorschau und Ausdruck zeigen dieselbe Aufteilung, beim
// Verkleinern des Fensters skaliert das ganze Blatt gleichmaessig. Aussagewahr heisst hier:
// geaendert hat sich die DARSTELLUNG des Blattes — nicht die Zeichnung, nicht der Massstab
// und kein gespeicherter Wert ([N-1]/[N-4]/[N-8]/[P-9]).
ok("die formatgetreue Blattvorschau (Issue 89) folgt direkt auf den neuesten Eintrag",
  VORSCHAU?.id === "chg-20260818-01" && VORSCHAU?.issue === 89
  && VORSCHAU?.typ === "fix" && VORSCHAU?.datum === "2026-08-18");
ok("der Vorschau-Eintrag benennt Gegenstand, Ort und Nutzerergebnis aussagewahr",
  /Lageplan/.test(VORSCHAU?.titel || "")
  && /Blattvorschau/.test(VORSCHAU?.titel || "")
  && /Papierverhältnis/.test(VORSCHAU?.titel || "")
  && /gewählten Formats/.test(VORSCHAU?.titel || "")
  // Weder Zeichnung noch Massstab noch ein gespeicherter Wert haben sich geaendert.
  && !/Maßstab|gespeichert|neue Option|Zeichnung geändert/i.test(VORSCHAU?.titel || ""));
ok("die Vorschau-Testbitte benennt Ort, Bedienung und die erwartete Wirkung",
  /Modul 9/.test(VORSCHAU?.testbitte || "")
  && /A3 quer und A4 quer/.test(VORSCHAU?.testbitte || "")
  && /Aufteilung/.test(VORSCHAU?.testbitte || "")
  && /Ausdrucks/.test(VORSCHAU?.testbitte || "")
  && /als Ganzes kleiner/.test(VORSCHAU?.testbitte || ""));
const SEITEN = EINTRAEGE[19];
// Davor nahm der Eintrag die V/R-KENNBUCHSTABEN vom Lageplanblatt (#89): Vorder- und
// Rueckseite bleiben als farbige Kanten erkennbar und werden in der Legende
// aufgeschluesselt. Aussagewahr heisst hier: die Unterscheidung bleibt erhalten — es darf
// NICHT klingen, als seien die Seiten selbst weggefallen. Behauptet werden darf ausserdem
// kein Bedienelement in Modul 9 und keine geaenderte Wandgeometrie, Bemassung oder
// Massstabswahl ([N-1]/[N-4]/[P-1]/[P-9]).
ok("die buchstabenfreien Wandseiten (Issue 89) folgen direkt danach",
  SEITEN?.id === "chg-20260817-08" && SEITEN?.issue === 89
  && SEITEN?.typ === "fix" && SEITEN?.datum === "2026-08-17");
ok("der Seiten-Eintrag benennt Gegenstand, Ort und Nutzerergebnis aussagewahr",
  /Lageplan/.test(SEITEN?.titel || "")
  && /Vorder- und Rückseite/.test(SEITEN?.titel || "")
  && /Kennbuchstaben/.test(SEITEN?.titel || "")
  && /Legende/.test(SEITEN?.titel || "")
  // Die Seiten selbst bleiben — entfallen ist nur ihre Beschriftung an der Wand.
  && !/entfällt die Rückseite|abgeschafft|keine Vorderseite/i.test(SEITEN?.titel || "")
  && !/Maßstab|Bedien|einstellbar/i.test(SEITEN?.titel || ""));
ok("die Seiten-Testbitte benennt Ort, Erwartung und die erhaltene Unterscheidung",
  /Modul 9/.test(SEITEN?.testbitte || "")
  && /Geschoss/.test(SEITEN?.testbitte || "")
  && /keine V\/R-Buchstaben/.test(SEITEN?.testbitte || "")
  && /farbigen Vorder- und Rückkanten/.test(SEITEN?.testbitte || "")
  && /Legende/.test(SEITEN?.testbitte || ""));
const BLASEN = EINTRAEGE[20];
// Davor machte der Eintrag die NUMMERNBLASEN des Lageplans wandfrei (#89): sie weichen
// jetzt auch den Wandflaechen aus, nicht mehr nur einander und den Massen. Aussagewahr
// heisst hier: die Zuordnung bleibt — die Fuehrungslinie zeigt weiter auf dieselbe
// Wandkante. Behauptet werden darf KEIN Bedienelement, keine geaenderte Wandlage,
// Bemassung oder Massstabswahl ([N-1]/[N-4]/[P-9]).
ok("die wandfreien Nummernblasen (Issue 89) folgen direkt danach",
  BLASEN?.id === "chg-20260817-07" && BLASEN?.issue === 89
  && BLASEN?.typ === "fix" && BLASEN?.datum === "2026-08-17");
ok("der Blasen-Eintrag benennt Gegenstand, Ort und Nutzerergebnis aussagewahr",
  /Lageplan/.test(BLASEN?.titel || "")
  && /Nummernblasen/.test(BLASEN?.titel || "")
  && /Wandflächen/.test(BLASEN?.titel || "")
  && /weichen/.test(BLASEN?.titel || "")
  // Weder Wandgeometrie noch Massstab noch ein Bedienelement haben sich geaendert.
  && !/Maßstab|Bedien|einstellbar|verschoben werden/i.test(BLASEN?.titel || ""));
ok("die Blasen-Testbitte benennt Ort, Erwartung und die erhaltene Zuordnung",
  /Modul 9/.test(BLASEN?.testbitte || "")
  && /Geschoss/.test(BLASEN?.testbitte || "")
  && /Keine Nummernblase liegt/.test(BLASEN?.testbitte || "")
  && /Führungslinie/.test(BLASEN?.testbitte || "")
  && /dieselbe Wandkante/.test(BLASEN?.testbitte || ""));
// Vier Eintraege fuer #89 — und das ist richtig so: der erste (chg-20260817-05) raeumte
// das Blatt auf, der zweite machte die Blasen wandfrei, der dritte nahm die V/R-Buchstaben
// von der Wand, dieser stellt die Vorschau aufs Papierverhaeltnis um. Vier
// Nutzerergebnisse, vier Commits, vier Eintraege.
ok("genau vier Eintraege fuer Issue 89, neu vor alt",
  EINTRAEGE.filter(e => e.issue === 89).map(e => e.id).join(",")
    === "chg-20260818-01,chg-20260817-08,chg-20260817-07,chg-20260817-05");
const PLANKOPF = EINTRAEGE[21];
// Der neueste Eintrag raeumt das LAGEPLANBLATT auf (#89): der Brandschutz-Kurztext an
// jeder Wand ist entfallen und wird nur noch ueber die Legende erklaert, die Wandliste
// fuehrt Nummer, Bezeichnung und Hoehe. Aussagewahr heisst hier: die Unterscheidung
// F0/F30 bleibt erhalten (Schraffur) und ist weiter benannt — es darf NICHT klingen,
// als sei die Klassifikation selbst weggefallen. Behauptet werden darf ausserdem kein
// Bedienelement in Modul 9 (gewaehlt wird sie in Modul 1) und keine geaenderte
// Wandgeometrie, Bemassung oder Vollstaendigkeit ([N-1]/[N-7]/[P-1]/[P-9]).
// Der NEUESTE Eintrag gibt den PLANKOPF eine Bedienstelle zurueck (#68): Planverfasser,
// Phase, Plan-Nr., Index und Gez. sind in Modul 7 pflegbar. Aussagewahr heisst hier: nur
// Plan-Nr., Index und Gez. stehen im Schriftfeld — Planverfasser und Phase werden
// gespeichert, erscheinen aber auf KEINEM Blatt (Option A zu #68, #61/[D-8] bleibt).
// Behauptet werden darf kein neues Schriftfeld, keine geaenderte Zeichnung und kein
// zweiter Speicherort ([L-11]/[P-9]).
ok("der wieder pflegbare Plankopf (Issue 68) folgt direkt danach",
  PLANKOPF?.id === "chg-20260817-06" && PLANKOPF?.issue === 68
  && PLANKOPF?.typ === "feature" && PLANKOPF?.datum === "2026-08-17");
ok("der Plankopf-Eintrag benennt Gegenstand und Ort aussagewahr",
  /Plankopf/.test(PLANKOPF?.titel || "")
  && /Planverfasser, Phase, Plan-Nr\., Index und Gez\./.test(PLANKOPF?.titel || "")
  && /Zeichnung/.test(PLANKOPF?.titel || "")
  // Das Schriftfeld hat KEINE neuen Zeilen bekommen und die Zeichnung ist unveraendert.
  && !/Schriftfeld erhält|neue Zeile|Bauherr|Projektname/i.test(PLANKOPF?.titel || ""));
ok("die Plankopf-Testbitte benennt Ort, Sofortwirkung, die Ausnahme und das Wiederfinden",
  /Modul 7/.test(PLANKOPF?.testbitte || "")
  && /Plan-Nr\./.test(PLANKOPF?.testbitte || "")
  && /sofort im Schriftfeld/.test(PLANKOPF?.testbitte || "")
  && /auf keinem Blatt/.test(PLANKOPF?.testbitte || "")
  && /Neuladen/.test(PLANKOPF?.testbitte || ""));
// Zwei Eintraege fuer #68 — und das ist richtig so: der erste (2026-08-12) betraf die
// entschlackte Projektanlage, dieser den nachgereichten Pflegeort. Zwei getrennte
// Nutzerergebnisse, zwei Commits, zwei Eintraege — in dieser Reihenfolge.
ok("genau zwei Eintraege fuer Issue 68, neu vor alt",
  EINTRAEGE.filter(e => e.issue === 68).map(e => e.id).join(",")
    === "chg-20260817-06,chg-20260812-08");
// Davor raeumte der Eintrag das LAGEPLANBLATT auf (#89) — er zaehlt jetzt ueber LETZTER.
const LETZTER = EINTRAEGE[22];
ok("das entschlackte Lageplanblatt (Issue 89) folgt direkt danach",
  LETZTER?.id === "chg-20260817-05" && LETZTER?.issue === 89
  && LETZTER?.typ === "feature" && LETZTER?.datum === "2026-08-17");
ok("der Lageplan-Eintrag benennt beide Nutzerergebnisse aussagewahr",
  /Lageplan/.test(LETZTER?.titel || "")
  && /Legende/.test(LETZTER?.titel || "")
  && /Nummer, Bezeichnung und Höhe/.test(LETZTER?.titel || "")
  // Die Klassifikation bleibt — entfallen ist nur ihre Beschriftung an der Wand.
  && !/entfällt|entfallen|abgeschafft|keine Brandschutz/i.test(LETZTER?.titel || ""));
ok("die Lageplan-Testbitte benennt Ort, beide Klassen und das erwartete Bild",
  /Modul 9/.test(LETZTER?.testbitte || "")
  && /F30/.test(LETZTER?.testbitte || "")
  && /schraffiert/.test(LETZTER?.testbitte || "")
  && /Legende/.test(LETZTER?.testbitte || "")
  && /Wände im Geschoss/.test(LETZTER?.testbitte || ""));
// Davor machte der Eintrag die gemeinte Wand unter UEBEREINANDERLIEGENDEN Waenden
// waehlbar (#88, offener Restpunkt). Aussagewahr heisst hier: es wird durch erneutes
// KLICKEN weitergeschaltet, und die Oberflaeche sagt, welche Wand jetzt gemeint ist.
// Behauptet werden darf KEIN Auswahlmenue, kein neues Werkzeug und keine geaenderte
// Lage, Bemassung oder Kollisionspruefung ([K-10]/[K-13]/[P-9]).
ok("die Auswahl unter uebereinanderliegenden Waenden (Issue 88) folgt direkt danach",
  VORHER[0]?.id === "chg-20260817-04" && VORHER[0]?.issue === 88
  && VORHER[0]?.typ === "fix" && VORHER[0]?.datum === "2026-08-17");
ok("der Auswahl-Eintrag benennt Ausgangslage, Ort und Bedienweg aussagewahr",
  /übereinanderliegenden Wänden/.test(VORHER[0]?.titel || "")
  && /Geschossplan/.test(VORHER[0]?.titel || "")
  && /erneutes Klicken/.test(VORHER[0]?.titel || "")
  && /wählbar/.test(VORHER[0]?.titel || "")
  // Es ist KEIN Menue und KEIN neues Werkzeug entstanden.
  && !/Menü|Popup|Werkzeug|Liste/i.test(VORHER[0]?.titel || ""));
ok("die Auswahl-Testbitte benennt Aufbau, Weiterschalten, Meldezeile und das Verschieben",
  /Geschosseditor/.test(VORHER[0]?.testbitte || "")
  && /mehrfach/.test(VORHER[0]?.testbitte || "")
  && /anklicken/.test(VORHER[0]?.testbitte || "")
  && /nächste der dort liegenden Wände aktiv/.test(VORHER[0]?.testbitte || "")
  && /Meldezeile/.test(VORHER[0]?.testbitte || "")
  && /verschiebt genau diese/.test(VORHER[0]?.testbitte || "")
  && /andere bleibt liegen/.test(VORHER[0]?.testbitte || ""));
// Davor machte der Eintrag die VERZAHNUNGSBEREICHE im Geschossplan sichtbar (#90).
// Aussagewahr heisst hier: die Bereiche werden GEZEIGT — an ihrer Rasterstelle, mit
// einem benannten Merkmal und in der Legende. Behauptet werden darf KEINE Bedienung
// im Editor (festgelegt werden sie in Modul 1), keine geaenderte Kollisionspruefung
// und keine Wirkung auf Mengen oder Vorspannung ([K-13.1]/[G-11]/[P-9]).
ok("die sichtbaren Verzahnungsbereiche (Issue 90) folgen direkt danach",
  VORHER[1]?.id === "chg-20260817-03" && VORHER[1]?.issue === 90
  && VORHER[1]?.typ === "feature" && VORHER[1]?.datum === "2026-08-17");
ok("der Verzahnungs-Sichtbarkeitseintrag benennt Gegenstand, Ort und Stelle aussagewahr",
  /Verzahnungsbereiche/.test(VORHER[1]?.titel || "")
  && /Geschossplan/.test(VORHER[1]?.titel || "")
  && /Fläche/.test(VORHER[1]?.titel || "")
  && /Rasterstelle/.test(VORHER[1]?.titel || "")
  // Es ist KEIN Bedienelement und keine geaenderte Bewertung entstanden.
  && !/festlegen|wählbar|Werkzeug|Kollision/i.test(VORHER[1]?.titel || ""));
ok("die Verzahnungs-Sichtbarkeitstestbitte benennt Festlegeort, Merkmal, Legende und den Gegenfall",
  /Modul 1/.test(VORHER[1]?.testbitte || "")
  && /Verzahnungsbereich/.test(VORHER[1]?.testbitte || "")
  && /Geschoss/.test(VORHER[1]?.testbitte || "")
  && /gitterschraffierte Fläche/.test(VORHER[1]?.testbitte || "")
  && /gestrichelter Umrandung/.test(VORHER[1]?.testbitte || "")
  && /Legende/.test(VORHER[1]?.testbitte || "")
  && /ohne Bereich sehen unverändert aus/.test(VORHER[1]?.testbitte || ""));
// Genau EIN Eintrag fuer #90: die Sichtbarkeit ist EIN Nutzerergebnis.
ok("genau ein Eintrag fuer Issue 90 (sichtbare Verzahnungsbereiche)",
  EINTRAEGE.filter(e => e.issue === 90).length === 1);
// Davor stand die INITIALPOSITION duplizierter und zugeordneter Waende (#88).
// Aussagewahr heisst hier: die Kopie liegt SOFORT sichtbar neben dem Original, die
// zugeordnete Wand am Geschossursprung — beide UNBEMASST und frei verschiebbar, und der
// Vorgang bleibt EIN Rueckgaengig-Schritt. Behauptet werden darf kein neues Werkzeug,
// keine Bemassung und keine geaenderte Kollisionspruefung ([K-13]/[P-9]).
ok("die Initialposition duplizierter Waende (Issue 88) folgt direkt danach",
  VORHER[2]?.id === "chg-20260817-02" && VORHER[2]?.issue === 88
  && VORHER[2]?.typ === "fix" && VORHER[2]?.datum === "2026-08-17");
ok("der Initialpositions-Eintrag benennt beide Wege, das Ergebnis und den behobenen Mangel aussagewahr",
  /Duplizierte/.test(VORHER[2]?.titel || "")
  && /zugeordnete/.test(VORHER[2]?.titel || "")
  && /sofort sichtbar/.test(VORHER[2]?.titel || "")
  && /Geschossplan/.test(VORHER[2]?.titel || "")
  && /unverortet/.test(VORHER[2]?.titel || "")
  // Es ist KEIN Werkzeug und KEINE Bemassung entstanden.
  && !/Werkzeug|Bemaßung|bemaßt/i.test(VORHER[2]?.titel || ""));
ok("die Initialpositions-Testbitte benennt Ort, Versatz, Unbemasstheit, Ruecknahme und den zweiten Weg",
  /Geschosseditor/.test(VORHER[2]?.testbitte || "")
  && /duplizieren/.test(VORHER[2]?.testbitte || "")
  && /250 mm/.test(VORHER[2]?.testbitte || "")
  && /unbemaßt/.test(VORHER[2]?.testbitte || "")
  && /frei verschiebbar/.test(VORHER[2]?.testbitte || "")
  && /Strg\+Z/.test(VORHER[2]?.testbitte || "")
  && /Modul 0/.test(VORHER[2]?.testbitte || "")
  && /Geschossursprung/.test(VORHER[2]?.testbitte || ""));
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
  VORHER[3]?.id === "chg-20260817-01" && VORHER[3]?.issue === 85
  && VORHER[3]?.typ === "feature" && VORHER[3]?.datum === "2026-08-17");
ok("der Mitloesch-Eintrag benennt Ort, Nachfrage und Gegenstand aussagewahr",
  /Löschen/.test(VORHER[3]?.titel || "")
  && /Geschoss/.test(VORHER[3]?.titel || "")
  && /Projekt/.test(VORHER[3]?.titel || "")
  && /zugeordneten Wandelemente/.test(VORHER[3]?.titel || "")
  && /Nachfrage/.test(VORHER[3]?.titel || "")
  // Ohne Nachfrage passiert nichts — „automatisch“ waere die Unwahrheit.
  && !/automatisch|immer/i.test(VORHER[3]?.titel || ""));
ok("die Mitloesch-Testbitte benennt Ort, beide Abfragen, die Anzahl und beide Antworten",
  /Modul 0/.test(VORHER[3]?.testbitte || "")
  && /Sicherheitsabfrage/.test(VORHER[3]?.testbitte || "")
  && /Anzahl/.test(VORHER[3]?.testbitte || "")
  && /Abbrechen lässt sie erhalten/.test(VORHER[3]?.testbitte || "")
  && /OK entfernt sie/.test(VORHER[3]?.testbitte || "")
  && /beide Zahlen/.test(VORHER[3]?.testbitte || ""));
// Davor der DETERMINISTISCHE NACHWEIS, dass die Verzahnungsbewertung Projektarchiv und
// Duplizieren uebersteht — sie entsteht bei jeder Ausgabe frisch ([K-13.1]). Aussagewahr
// heisst dort: es wurde NICHTS an der Bewertung geaendert und kein neues Bedienelement
// gebaut; entstanden sind Nachweis und Doku. Deshalb „intern“ — ein „feature“ waere
// dort eine Uebertreibung ([P-9]).
ok("der Verzahnungs-Nachweis (Issue 83) folgt direkt danach",
  VORHER[4]?.id === "chg-20260816-12" && VORHER[4]?.issue === 83
  && VORHER[4]?.typ === "intern" && VORHER[4]?.datum === "2026-08-16");
ok("der Nachweis-Eintrag benennt beide Wege und verspricht keine neue Funktion",
  /Verzahnungsbewertung/.test(VORHER[4]?.titel || "")
  && /Projektarchiv/.test(VORHER[4]?.titel || "")
  && /Duplizieren/.test(VORHER[4]?.titel || "")
  && /unverändert/.test(VORHER[4]?.titel || "")
  // Es ist KEIN neues Bedienelement und keine geaenderte Darstellung entstanden.
  && !/neu|wählbar|Schalter/i.test(VORHER[4]?.titel || ""));
ok("die Nachweis-Testbitte benennt Export, leeren Browser, Ort und die unveraenderte Bewertung",
  /exportieren/.test(VORHER[4]?.testbitte || "")
  && /leeren Browser/.test(VORHER[4]?.testbitte || "")
  && /importieren/.test(VORHER[4]?.testbitte || "")
  && /Modul 9/.test(VORHER[4]?.testbitte || "")
  && /statt einer Kollision/.test(VORHER[4]?.testbitte || "")
  && /nichts geändert/.test(VORHER[4]?.testbitte || ""));
// Davor ergaenzte der Kommentar die Mengenuebersteuerung. Aussagewahr heisst dort:
// er steht NEBEN Menge und Preis und aendert die Rechnung NICHT — kein Export, keine
// Summe, keine Menge. Genau das darf versprochen werden, mehr nicht ([P-20]).
ok("der Kommentar je Stuecklistenposition (Issue 81) folgt direkt danach",
  VORHER[5]?.id === "chg-20260816-11" && VORHER[5]?.issue === 81
  && VORHER[5]?.typ === "feature" && VORHER[5]?.datum === "2026-08-16");
ok("der Kommentar-Eintrag benennt Ort, Nachbarschaft und die unveraenderte Rechnung aussagewahr",
  /Kommentar/.test(VORHER[5]?.titel || "")
  && /Stücklistenposition/.test(VORHER[5]?.titel || "")
  && /Modul 4/.test(VORHER[5]?.titel || "")
  && /Menge und Preis/.test(VORHER[5]?.titel || "")
  && /ohne die Rechnung zu ändern/.test(VORHER[5]?.titel || "")
  // Der Kommentar steht in KEINER Exportdatei — das darf der Titel nicht andeuten.
  && !/Export|Datei/.test(VORHER[5]?.titel || ""));
ok("die Kommentar-Testbitte benennt Ort, Position, Persistenz, Ruecknahme und die erhaltene Rechnung",
  /Modul 4/.test(VORHER[5]?.testbitte || "")
  && /an genau dieser/.test(VORHER[5]?.testbitte || "")
  && /Neuladen/.test(VORHER[5]?.testbitte || "")
  && /einzeln wieder entfernen/.test(VORHER[5]?.testbitte || "")
  && /Mengen, Preise und Summe/.test(VORHER[5]?.testbitte || "")
  && /unverändert/.test(VORHER[5]?.testbitte || ""));
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
// #81 hat SIEBEN Eintraege, weil es sieben getrennte Nutzerergebnisse waren: erst die
// manuelle Menge in Modul 4, dann die waehlbare Mengenfassung der Wanddatei im
// zentralen Export, dieselbe Wahl fuer die Gesamtstueckliste der Ebene, der Kommentar
// je Position — das im fachlichen Gate als optional benannte zweite Feld —, die
// entfallene Wandherkunft in Anzeige und Gesamtstueckliste-Datei, der Kommentar als
// angehaengte Spalte in der exportierten Wandstueckliste und zuletzt die manuelle Menge
// auf der GESCHOSSEBENE (eine eigene Angabe am Geschoss, nicht die der Waende).
const neu81 = EINTRAEGE.filter(e => e.issue === 81);
ok("genau sieben Eintraege fuer Issue 81 — Uebersteuerungen, Fassungswahlen, Kommentar, Herkunft, Exportspalte",
  neu81.length === 7
  && neu81.map(e => e.id).join(",")
    === "chg-20260904-01,chg-20260818-03,chg-20260818-02,chg-20260816-11,chg-20260816-05,chg-20260816-02,chg-20260815-01");
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
