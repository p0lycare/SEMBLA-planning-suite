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
// Die PLATTENBREITE IM SAMMEL-EDITOR (#97) ist der neueste Eintrag — er wird als einziger
// direkt ueber `EINTRAEGE[0]` geprueft; die bisherige Reihe wird ueber die KENNUNG ihres
// Eintrags gesucht und rueckt deshalb geraeuschlos nach hinten.
// Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass der Sammel-Editor des
// Geschosseditors die reale Breite der Spannplatte aus der Produktauswahl der jeweiligen
// Wand nachzieht, sodass Modul 1 und Modul 7 sie unmittelbar zeigen, und dass eine
// uneindeutige Auswahl den gespeicherten Wert stehen laesst. NICHT versprochen werden ein
// neues Feld, ein neues Katalogmass, ein Bedienelement, eine geaenderte Rechnung, ein
// Preis, eine Menge, eine Norm, ein Nachweis oder ein Versionssprung.
const SAMMEL_SPB_97 = EINTRAEGE[0];
ok("[#97] die Plattenbreite im Sammel-Editor ist der neueste Eintrag",
  SAMMEL_SPB_97?.id === "chg-20260910-03" && SAMMEL_SPB_97?.issue === 97
  && SAMMEL_SPB_97?.typ === "fix" && SAMMEL_SPB_97?.datum === "2026-09-10");
ok("[#97] der Titel benennt die Sammelaenderung, die Spannplatte und ihre Breite",
  /Sammel/.test(SAMMEL_SPB_97?.titel || "")
  && /Spannplatte/.test(SAMMEL_SPB_97?.titel || "")
  && /[Bb]reite/.test(SAMMEL_SPB_97?.titel || "")
  && !/Norm|Preis|Menge|Nachweis|Rechnung|Format/i.test(SAMMEL_SPB_97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad vom Geschosseditor in 1 und 7",
  /Geschosseditor/.test(SAMMEL_SPB_97?.testbitte || "")
  && /Sammel/.test(SAMMEL_SPB_97?.testbitte || "")
  && /Modul 1\b/.test(SAMMEL_SPB_97?.testbitte || "")
  && /Modul 7\b/.test(SAMMEL_SPB_97?.testbitte || "")
  && /Spannplatte/.test(SAMMEL_SPB_97?.testbitte || ""));
ok("[#97] die Testbitte nennt den Rueckfall bei uneindeutiger Auswahl",
  /uneindeutig/.test(SAMMEL_SPB_97?.testbitte || "")
  && /unver\u00e4ndert/.test(SAMMEL_SPB_97?.testbitte || ""));
ok("[#97] die Testbitte verspricht keine Norm und keine geaenderte Rechnung",
  !/Norm|Preis|Menge|Nachweis|Rechnung|Format|Migration/i
    .test(SAMMEL_SPB_97?.testbitte || ""));

// Davor liegt die GEZEICHNETE PLATTENBREITE (#97) — ueber ihre Kennung gesucht, weil sie
// nicht mehr der neueste Eintrag ist. Ihre Aussagen bleiben inhaltlich unveraendert:
// Wandansicht und Blatt zeichnen die am Wandelement ausgewiesene reale Breite, und ein
// Wandelement ohne dieses Mass bleibt unveraendert.
const PLATTE_BZ_97 = EINTRAEGE.find(e => e.id === "chg-20260910-02");
ok("[#97] die gezeichnete Plattenbreite steht unveraendert in der Reihe",
  PLATTE_BZ_97?.issue === 97
  && PLATTE_BZ_97?.typ === "feature" && PLATTE_BZ_97?.datum === "2026-09-10");
ok("[#97] der Titel benennt die Spannplatte, ihre Breite und das Zeichnen",
  /Spannplatte/.test(PLATTE_BZ_97?.titel || "")
  && /[Bb]reite/.test(PLATTE_BZ_97?.titel || "")
  && /gezeichnet|zeichnet/.test(PLATTE_BZ_97?.titel || "")
  && !/Norm|Preis|Menge|Nachweis|Rechnung|Format/i.test(PLATTE_BZ_97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1 und Modul 7",
  /Modul 1\b/.test(PLATTE_BZ_97?.testbitte || "")
  && /Modul 7\b/.test(PLATTE_BZ_97?.testbitte || "")
  && /Spannplatte/.test(PLATTE_BZ_97?.testbitte || "")
  && /auslegen|Auslegen/.test(PLATTE_BZ_97?.testbitte || ""));
ok("[#97] die Testbitte nennt den Rueckfall ohne gepflegtes Mass",
  /[Oo]hne/.test(PLATTE_BZ_97?.testbitte || "")
  && /unverändert/.test(PLATTE_BZ_97?.testbitte || ""));
ok("[#97] die Testbitte verspricht keine Norm und keine geaenderte Rechnung",
  !/Norm|Preis|Menge|Nachweis|Rechnung|Format|Migration/i
    .test(PLATTE_BZ_97?.testbitte || ""));

// Davor liegt die BREITE DER SPANNPLATTE AM WANDELEMENT (#97) — ueber ihre Kennung gesucht,
// weil sie nicht mehr der neueste Eintrag ist. Ihre Aussagen bleiben inhaltlich unveraendert:
// Modul 1 leitet beim Auslegen die reale Katalogbreite ab, das gespeicherte Wandelement
// fuehrt sie, Zuschnitt und Mengen bleiben wertgleich.
const PLATTE_B_97 = EINTRAEGE.find(e => e.id === "chg-20260910-01");
ok("[#97] die Plattenbreite am Wandelement steht unveraendert in der Liste",
  PLATTE_B_97?.issue === 97
  && PLATTE_B_97?.typ === "feature" && PLATTE_B_97?.datum === "2026-09-10");
ok("[#97] der Titel benennt Wandelement, Katalogbreite und die Spannplatte",
  /Wandelement/.test(PLATTE_B_97?.titel || "")
  && /[Bb]reite/.test(PLATTE_B_97?.titel || "")
  && /Katalog/.test(PLATTE_B_97?.titel || "")
  && /Spannplatte/.test(PLATTE_B_97?.titel || "")
  && !/Norm|Preis|Menge|Nachweis|Rechnung|Format/i.test(PLATTE_B_97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1",
  /Modul 1\b/.test(PLATTE_B_97?.testbitte || "")
  && /Spannplatte/.test(PLATTE_B_97?.testbitte || "")
  && /Auslegen/.test(PLATTE_B_97?.testbitte || ""));
ok("[#97] die Testbitte sagt, dass Zuschnitt und Mengen gleich bleiben",
  /Zuschnitt/.test(PLATTE_B_97?.testbitte || "")
  && /Mengen/.test(PLATTE_B_97?.testbitte || "")
  && /gleich/.test(PLATTE_B_97?.testbitte || ""));
ok("[#97] die Testbitte sagt ausdruecklich, dass noch nicht gezeichnet wird",
  /gezeichnet/.test(PLATTE_B_97?.testbitte || "")
  && /unverändert|folgt/.test(PLATTE_B_97?.testbitte || ""));
ok("[#97] die Testbitte verspricht keine Norm und keine geaenderte Rechnung",
  !/Norm|Preis|Menge\b|Nachweis|Rechnung|Format|Migration/i
    .test((PLATTE_B_97?.testbitte || "").replace(/Mengen/g, "")));

// Davor liegen die SPANNMUTTERMASSE IM SAMMEL-EDITOR (#97) — ueber ihre Kennung gesucht,
// weil sie nicht mehr der neueste Eintrag sind. Ihre Aussagen bleiben inhaltlich unveraendert.
// Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass der Sammel-Editor des
// Geschosseditors Einbauhoehe und Schluesselweite der Spannmutter aus der Produktauswahl
// der jeweiligen Wand nachzieht, sodass beide Masse in Modul 1 und Modul 7 unmittelbar
// wirken, und dass ein fehlendes Katalogmass den gespeicherten Wert stehen laesst. NICHT
// versprochen werden ein neues Feld, ein neues Katalogmass, ein Bedienelement, eine
// geaenderte Rechnung, ein Preis, eine Menge, eine Norm, ein Nachweis oder ein
// Versionssprung.
const SAMMEL_SPM_97 = EINTRAEGE.find(e => e.id === "chg-20260909-22");
ok("[#97] die Spannmuttermasse im Sammel-Editor stehen unveraendert in der Reihe",
  SAMMEL_SPM_97?.id === "chg-20260909-22" && SAMMEL_SPM_97?.issue === 97
  && SAMMEL_SPM_97?.typ === "fix" && SAMMEL_SPM_97?.datum === "2026-09-09");
ok("[#97] der Titel benennt den Sammel-Editor, beide Masse und die Spannmutter",
  /Sammel-Editor/.test(SAMMEL_SPM_97?.titel || "")
  && /Einbauh\u00f6he/.test(SAMMEL_SPM_97?.titel || "")
  && /Schl\u00fcsselweite/.test(SAMMEL_SPM_97?.titel || "")
  && /Spannmutter/.test(SAMMEL_SPM_97?.titel || "")
  && !/Norm|Preis|Menge|Nachweis|Rechnung|Format/i.test(SAMMEL_SPM_97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch den Geschosseditor",
  /Geschosseditor/.test(SAMMEL_SPM_97?.testbitte || "")
  && /Gemeinsam bearbeiten/.test(SAMMEL_SPM_97?.testbitte || "")
  && /mehrere W\u00e4nde/.test(SAMMEL_SPM_97?.testbitte || "")
  && /Modul 1\b/.test(SAMMEL_SPM_97?.testbitte || "")
  && /Modul 7\b/.test(SAMMEL_SPM_97?.testbitte || ""));
ok("[#97] die Testbitte sagt, dass ein fehlendes Mass den bisherigen Wert stehen laesst",
  /Fehlt ein Katalogma\u00df/.test(SAMMEL_SPM_97?.testbitte || "")
  && /bisherige\w* Wert/.test(SAMMEL_SPM_97?.testbitte || "")
  && /stehen/.test(SAMMEL_SPM_97?.testbitte || ""));
ok("[#97] die Testbitte verspricht keine Norm und keine geaenderte Rechnung",
  !/Norm|Preis|Menge|Nachweis|Rechnung|Format|Migration/i
    .test(SAMMEL_SPM_97?.testbitte || ""));

// Davor liegt die STANDARDKATALOGFASSUNG v2 (#97) — ueber ihre Kennung gesucht, weil sie
// nicht mehr der neueste Eintrag ist. Ihre Aussagen bleiben inhaltlich unveraendert.
// Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass der mitgelieferte
// Standardkatalog als neue Fassung v2 erscheint, in der drei M10-Teile ihre Schluesselweite
// fuehren, dass die Fassung v1 unveraendert daneben ladbar bleibt und dass bestehende
// Projekte nicht umgestellt werden. NICHT versprochen werden eine Norm, ein neues Feld,
// eine geaenderte Menge, ein Preis, ein Nachweis oder ein Formatsprung.
const KATALOG_V2_97 = EINTRAEGE.find(e => e.id === "chg-20260909-21");
ok("[#97] die Standardkatalogfassung v2 steht unveraendert in der Reihe",
  KATALOG_V2_97?.id === "chg-20260909-21" && KATALOG_V2_97?.issue === 97
  && KATALOG_V2_97?.typ === "feature" && KATALOG_V2_97?.datum === "2026-09-09");
ok("[#97] der Titel benennt die Fassung, die Schluesselweiten und die M10-Teile",
  /v2/.test(KATALOG_V2_97?.titel || "")
  && /Standardkatalog/.test(KATALOG_V2_97?.titel || "")
  && /Schl\u00fcsselweite/.test(KATALOG_V2_97?.titel || "")
  && /M10/.test(KATALOG_V2_97?.titel || "")
  && !/Norm|Preis|Menge|Nachweis|Format/i.test(KATALOG_V2_97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch Modul 10 und nennt die drei Teile",
  /Modul 10\b/.test(KATALOG_V2_97?.testbitte || "")
  && /Spannmutter/.test(KATALOG_V2_97?.testbitte || "")
  && /Einlegeblech/.test(KATALOG_V2_97?.testbitte || "")
  && /Sechskantschraube/.test(KATALOG_V2_97?.testbitte || "")
  && /17 mm/.test(KATALOG_V2_97?.testbitte || ""));
ok("[#97] die Testbitte sagt, dass v1 bleibt und nichts umgestellt wird",
  /v1/.test(KATALOG_V2_97?.testbitte || "")
  && /ladbar/.test(KATALOG_V2_97?.testbitte || "")
  && /nicht\s+umgestellt/.test(KATALOG_V2_97?.testbitte || ""));
ok("[#97] die Testbitte verspricht keine Norm und keine geaenderte Rechnung",
  !/Norm|Preis|Menge|Nachweis|Rechnung|Format|Migration/i
    .test(KATALOG_V2_97?.testbitte || ""));

// Davor liegt die GEZEICHNETE SPANNMUTTER (#97) — ueber ihre Kennung gesucht, weil sie nicht
// mehr der neueste Eintrag ist. Ihre Aussagen bleiben inhaltlich unveraendert.
// Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass die Spannmutter in Modul 1 und
// Modul 7 mit ihrer realen Einbauhoehe und Schluesselweite gezeichnet wird und sich abmessen
// laesst, und dass es ohne gepflegtes Mass beim bisherigen Symbol bleibt. NICHT versprochen
// werden ein neues Feld, ein neues Katalogmass, ein Bedienelement, eine geaenderte Rechnung,
// ein Preis, eine Menge, eine Norm, ein Nachweis oder ein Versionssprung.
const SPANN_ZEICHNEN97 = EINTRAEGE.find(e => e.id === "chg-20260909-20");
ok("[#97] die gezeichnete Spannmutter steht unveraendert in der Liste",
  SPANN_ZEICHNEN97?.id === "chg-20260909-20" && SPANN_ZEICHNEN97?.issue === 97
  && SPANN_ZEICHNEN97?.typ === "fix" && SPANN_ZEICHNEN97?.datum === "2026-09-09");
ok("[#97] der Titel benennt Spannmutter, beide Masse und das Zeichnen",
  /Spannmutter/.test(SPANN_ZEICHNEN97?.titel || "")
  && /H\u00f6he/.test(SPANN_ZEICHNEN97?.titel || "")
  && /Schl\u00fcsselweite/.test(SPANN_ZEICHNEN97?.titel || "")
  && /gezeichnet/.test(SPANN_ZEICHNEN97?.titel || "")
  && !/Norm|Preis|Menge|Nachweis|Version/i.test(SPANN_ZEICHNEN97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1 UND Modul 7",
  /Modul 1\b/.test(SPANN_ZEICHNEN97?.testbitte || "")
  && /Modul 7\b/.test(SPANN_ZEICHNEN97?.testbitte || "")
  && /Spannmutter/.test(SPANN_ZEICHNEN97?.testbitte || "")
  && /abmessen/.test(SPANN_ZEICHNEN97?.testbitte || ""));
ok("[#97] die Testbitte benennt den Rueckfall auf das Symbol",
  /Symbol/.test(SPANN_ZEICHNEN97?.testbitte || "")
  && /Ma\u00df/.test(SPANN_ZEICHNEN97?.testbitte || ""));
ok("[#97] die Testbitte verspricht keine geaenderte Rechnung und kein neues Feld",
  !/Norm|Preis|Menge|Nachweis|Version|Rechnung|Feld|Format/i
    .test(SPANN_ZEICHNEN97?.testbitte || ""));

// Davor liegt die LAGE DES DECKENANSCHLUSS-SYMBOLS (#97) — ueber ihre Kennung gesucht, weil
// sie nicht mehr der neueste Eintrag ist. Ihre Aussagen bleiben inhaltlich unveraendert.
const DECKEN_LAGE97 = EINTRAEGE.find(e => e.id === "chg-20260909-19");
ok("[#97] die Lage des Deckenanschluss-Symbols steht unveraendert in der Liste",
  DECKEN_LAGE97?.id === "chg-20260909-19" && DECKEN_LAGE97?.issue === 97
  && DECKEN_LAGE97?.typ === "fix" && DECKEN_LAGE97?.datum === "2026-09-09");
ok("[#97] der Titel benennt das rote Z, den Deckenanschluss und die Sichtbarkeit",
  /rote Z/.test(DECKEN_LAGE97?.titel || "")
  && /Deckenanschluss/.test(DECKEN_LAGE97?.titel || "")
  && /sichtbar/.test(DECKEN_LAGE97?.titel || "")
  && !/Norm|Preis|Menge|Nachweis|Version/i.test(DECKEN_LAGE97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1 UND Modul 7",
  /Modul 1\b/.test(DECKEN_LAGE97?.testbitte || "")
  && /Modul 7\b/.test(DECKEN_LAGE97?.testbitte || "")
  && /Deckenanschluss/.test(DECKEN_LAGE97?.testbitte || "")
  && /rote Z/.test(DECKEN_LAGE97?.testbitte || ""));
ok("[#97] die Testbitte benennt die neue Lage und die Stange im Vordergrund",
  /links neben/.test(DECKEN_LAGE97?.testbitte || "")
  && /Gewindestange/.test(DECKEN_LAGE97?.testbitte || "")
  && /Spannplatte/.test(DECKEN_LAGE97?.testbitte || "")
  && /Vordergrund/.test(DECKEN_LAGE97?.testbitte || ""));
ok("[#97] die Testbitte verspricht keine geaenderte Rechnung und keine Bedienung",
  !/Norm|Preis|Menge|Nachweis|Version|Rechnung|einstellen|w\u00e4hlen/i
    .test(DECKEN_LAGE97?.testbitte || ""));

// Davor liegen die MASSE DER SPANNMUTTER am Wandelement (#97) — sie werden ueber ihre ID
// gesucht, weil sie nicht mehr der neueste Eintrag sind. Ihre Aussagen bleiben inhaltlich
// unveraendert gueltig. Aussagewahr heisst dort: geliefert ist AUSSCHLIESSLICH, dass Modul 1
// die gepflegte Einbauhoehe und Schluesselweite der Spannmutter beim Auslegen an das
// Wandelement fuehrt und die Rechnung dabei unveraendert bleibt — ohne gepflegtes Mass
// entsteht nichts. NICHT versprochen werden eine Zeichnung der Mutter, ein Bedienelement, eine
// geaenderte Rechnung, ein Preis, eine Menge, eine Norm, ein Nachweis oder ein Versionssprung.
const SPANNMUTTER97 = EINTRAEGE.find(e => e.id === "chg-20260909-18");
ok("[#97] die Masse der Spannmutter am Wandelement stehen unveraendert in der Liste",
  SPANNMUTTER97?.id === "chg-20260909-18" && SPANNMUTTER97?.issue === 97
  && SPANNMUTTER97?.typ === "feature" && SPANNMUTTER97?.datum === "2026-09-09");
ok("[#97] der Titel benennt Spannmutter, beide Masse und das Wandelement",
  /Spannmutter/.test(SPANNMUTTER97?.titel || "")
  && /Einbauh\u00f6he/.test(SPANNMUTTER97?.titel || "")
  && /Schl\u00fcsselweite/.test(SPANNMUTTER97?.titel || "")
  && /Wandelement/.test(SPANNMUTTER97?.titel || "")
  && !/gezeichnet|Zeichnung|ma\u00dfst\u00e4blich|Norm|Preis|Menge|Nachweis|Version/i
       .test(SPANNMUTTER97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1",
  /Modul 1\b/.test(SPANNMUTTER97?.testbitte || "")
  && /Spannmutter/.test(SPANNMUTTER97?.testbitte || "")
  && /Einbauh\u00f6he/.test(SPANNMUTTER97?.testbitte || "")
  && /Schl\u00fcsselweite/.test(SPANNMUTTER97?.testbitte || "")
  && /auslegen/i.test(SPANNMUTTER97?.testbitte || ""));
ok("[#97] die Testbitte verspricht keine Zeichnung und keine geaenderte Rechnung",
  /bleibt gleich|unver\u00e4ndert/.test(SPANNMUTTER97?.testbitte || "")
  && /Fehlt ein Ma\u00df/.test(SPANNMUTTER97?.testbitte || "")
  && /n\u00e4chsten Schritt/.test(SPANNMUTTER97?.testbitte || "")
  && !/Norm|Preis|Menge|Nachweis|Version/i.test(SPANNMUTTER97?.testbitte || ""));

// Davor liegt die NACHGEZOGENE SCHLUESSELWEITE der Sammelaenderung (#97) — sie wird ueber ihre
// ID gesucht, weil sie nicht mehr der neueste Eintrag ist. Ihre Aussagen bleiben inhaltlich
// unveraendert gueltig. Aussagewahr heisst dort: geliefert ist AUSSCHLIESSLICH,
// dass eine Sammelaenderung im Geschosseditor die Schluesselweite der gesetzten
// Kopplungsmutter mitzieht, sodass Modul 1 und Modul 7 sie sofort in der neuen Breite
// zeigen. NICHT versprochen werden ein neues Bedienelement, eine geaenderte Rechnung, ein
// Preis, eine Menge, eine Norm, ein Nachweis oder ein Versionssprung.
const SAMMEL_SW97 = EINTRAEGE.find(e => e.id === "chg-20260909-17");
ok("[#97] die nachgezogene Schluesselweite der Sammelaenderung steht unveraendert in der Liste",
  SAMMEL_SW97?.id === "chg-20260909-17" && SAMMEL_SW97?.issue === 97
  && SAMMEL_SW97?.typ === "fix" && SAMMEL_SW97?.datum === "2026-09-09");
ok("[#97] der Titel benennt Sammelaenderung, Geschosseditor und Schluesselweite",
  /Sammel\u00e4nderung/.test(SAMMEL_SW97?.titel || "")
  && /Geschosseditor/.test(SAMMEL_SW97?.titel || "")
  && /Schl\u00fcsselweite/.test(SAMMEL_SW97?.titel || "")
  && /Kopplungsmutter/.test(SAMMEL_SW97?.titel || "")
  && !/Norm|Preis|Menge|Nachweis|Version/i.test(SAMMEL_SW97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad ueber das Sammel-Popup",
  /Geschosseditor/.test(SAMMEL_SW97?.testbitte || "")
  && /Gemeinsam bearbeiten/.test(SAMMEL_SW97?.testbitte || "")
  && /Modul 1\b/.test(SAMMEL_SW97?.testbitte || "")
  && /Modul 7\b/.test(SAMMEL_SW97?.testbitte || ""));
ok("[#97] die Testbitte nennt den Gewinn und verspricht keine neue Rechnung",
  /Schl\u00fcsselweite/.test(SAMMEL_SW97?.testbitte || "")
  && /neuen Breite/.test(SAMMEL_SW97?.testbitte || "")
  && /einzeln/.test(SAMMEL_SW97?.testbitte || "")
  && !/Norm|Preis|Menge|Nachweis|Version/i.test(SAMMEL_SW97?.testbitte || ""));

// Die MASSTABSGETREUE MUTTERNBREITE (#97) ist der neueste Eintrag — er wird als einziger
// direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins nach
// hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH die Zeichnung der Mutter in
// ihrer realen Breite in Wandansicht und Blatt — und ausdruecklich der RUECKFALL, dass ohne
// gepflegtes Mass alles bleibt wie bisher. NICHT versprochen werden ein Preis, eine Menge,
// eine Norm, ein Nachweis oder ein Versionssprung; die Rechnung aendert sich nicht.
const BREITE97 = EINTRAEGE.find(e => e.id === "chg-20260909-16");
ok("[#97] die masstabsgetreue Mutternbreite ist der neueste Eintrag",
  BREITE97?.id === "chg-20260909-16" && BREITE97?.issue === 97
  && BREITE97?.typ === "feature" && BREITE97?.datum === "2026-09-09");
ok("[#97] der Titel benennt Kopplungsmutter, reale Breite und die Zeichnung",
  /Kopplungsmutter/.test(BREITE97?.titel || "")
  && /Breite/.test(BREITE97?.titel || "")
  && /gezeichnet/.test(BREITE97?.titel || "")
  && !/Norm|Preis|Menge|Nachweis|Version/i.test(BREITE97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch beide Ausgaben",
  /Modul 1\b/.test(BREITE97?.testbitte || "")
  && /Modul 7\b/.test(BREITE97?.testbitte || "")
  && /Schlüsselweite/.test(BREITE97?.testbitte || "")
  && /auslegen/i.test(BREITE97?.testbitte || ""));
ok("[#97] die Testbitte benennt den Rueckfall ohne gepflegtes Mass",
  /Ohne gepflegtes Maß/.test(BREITE97?.testbitte || "")
  && /wie bisher/.test(BREITE97?.testbitte || "")
  && !/Norm|Preis|Nachweis|Version/i.test(BREITE97?.testbitte || ""));

// Die SCHLUESSELWEITE AM WANDELEMENT (#97) ist seither der zweitneueste Eintrag. Aussagewahr
// heisst dort: geliefert ist AUSSCHLIESSLICH, dass Modul 1 die gepflegte Schluesselweite beim
// Auslegen an die Wand fuehrt und die Rechnung dabei unveraendert bleibt. Er sagte
// ausdruecklich, dass noch nichts gezeichnet wird — das war zu seinem Zeitpunkt wahr und wird
// NICHT nachtraeglich umgeschrieben; geliefert hat es der Eintrag darueber.
const SW_WAND97 = EINTRAEGE.find(e => e.id === "chg-20260909-15");
ok("[#97] die Schluesselweite am Wandelement ist der neueste Eintrag",
  SW_WAND97?.id === "chg-20260909-15" && SW_WAND97?.issue === 97
  && SW_WAND97?.typ === "feature" && SW_WAND97?.datum === "2026-09-09");
ok("[#97] der Titel benennt Schluesselweite, Kopplungsmutter und den Zeitpunkt",
  /Schlüsselweite/.test(SW_WAND97?.titel || "")
  && /Kopplungsmutter/.test(SW_WAND97?.titel || "")
  && /Auslegen/.test(SW_WAND97?.titel || "")
  && !/gezeichnet|Zeichnung|Norm|Preis|Menge|Nachweis|Version/i.test(SW_WAND97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1",
  /Modul 1\b/.test(SW_WAND97?.testbitte || "")
  && /Kopplungsmutter/.test(SW_WAND97?.testbitte || "")
  && /Auslegen/.test(SW_WAND97?.testbitte || ""));
ok("[#97] die Testbitte sagt die unveraenderte Rechnung zu und verspricht keine Zeichnung",
  /unverändert/.test(SW_WAND97?.testbitte || "")
  && /noch/.test(SW_WAND97?.testbitte || "")
  && /bisherigen Breite/.test(SW_WAND97?.testbitte || "")
  && !/Norm|Preis|Nachweis|Version/i.test(SW_WAND97?.testbitte || ""));

// Die SCHLUESSELWEITE ALS KATALOGMASS (#97) ist der zweitneueste Eintrag — er wird als einziger
// direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins nach
// hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH das gepflegte Katalogmass —
// ein optionales Feld in der Maske der Kategorie „Sonstiges Verbrauchsmaterial" und der Wert
// 17 mm an der Kopplungsmutter des Standardkatalogs. Ausdruecklich NICHT versprochen werden
// eine Ableitung am Wandelement, eine masstaebliche Mutternbreite in der Zeichnung, ein
// Preis, eine Menge, eine Norm oder ein Versionssprung.
const SCHLUESSELWEITE97 = EINTRAEGE.find(e => e.id === "chg-20260909-14");
ok("[#97] die Schluesselweite als Katalogmass ist der neueste Eintrag",
  SCHLUESSELWEITE97?.id === "chg-20260909-14" && SCHLUESSELWEITE97?.issue === 97
  && SCHLUESSELWEITE97?.typ === "feature" && SCHLUESSELWEITE97?.datum === "2026-09-09");
ok("[#97] der Titel benennt Kleinteil und Katalogmass, ohne eine Zeichnung zu versprechen",
  /Schl\u00fcsselweite/.test(SCHLUESSELWEITE97?.titel || "")
  && /Katalogma\u00df/.test(SCHLUESSELWEITE97?.titel || "")
  && !/gezeichnet|Zeichnung|ma\u00dfst\u00e4blich|Norm|Preis|Menge|Nachweis|Version/i
       .test(SCHLUESSELWEITE97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch Modul 10",
  /Modul 10/.test(SCHLUESSELWEITE97?.testbitte || "")
  && /Kopplungsmutter/.test(SCHLUESSELWEITE97?.testbitte || "")
  && /Schl\u00fcsselweite/.test(SCHLUESSELWEITE97?.testbitte || ""));
ok("[#97] die Testbitte nennt den mitgelieferten Wert und verspricht keine Ableitung",
  /17 mm/.test(SCHLUESSELWEITE97?.testbitte || "")
  && /Standardkatalog/.test(SCHLUESSELWEITE97?.testbitte || "")
  && !/gezeichnet|Zeichnung|Modul 7|Modul 1\b|Preis|Menge|Norm|Version/i
       .test(SCHLUESSELWEITE97?.testbitte || ""));

// Die VOLLSTAENDIGE NEURECHNUNG der Sammelaenderung (#117) ist der zweitneueste Eintrag — er wird
// als einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um
// eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass eine
// Sammelaenderung jede betroffene Wand ueber den Auslegungspfad von Modul 1 neu rechnet und
// ihre abgeleiteten Vorspann-Eingaenge dabei vollstaendig aus der Produktauswahl der Wand
// bildet. Ausdruecklich NICHT versprochen werden ein neues Bedienelement, eine geaenderte
// Fachregel, ein Eingriff in Laenge/Lage/Oeffnungen oder ein neues Datenfeld.
const NEURECHNUNG117 = EINTRAEGE.find(e => e.id === "chg-20260909-13");
ok("[#117] die vollstaendige Neurechnung der Sammelaenderung ist der neueste Eintrag",
  NEURECHNUNG117?.id === "chg-20260909-13" && NEURECHNUNG117?.issue === 117
  && NEURECHNUNG117?.typ === "fix" && NEURECHNUNG117?.datum === "2026-09-09");
ok("[#117] der Titel benennt Sammelaenderung und Neurechnung, ohne eine Bedienung zu versprechen",
  /Sammel\u00e4nderung/.test(NEURECHNUNG117?.titel || "")
  && /Geschosseditor/.test(NEURECHNUNG117?.titel || "")
  && /neu/.test(NEURECHNUNG117?.titel || "")
  && !/w\u00e4hlbar|Option|Einstellung|H\u00e4kchen|Preis|Summe|Datei|Migration|Version/i
       .test(NEURECHNUNG117?.titel || ""));
ok("[#117] die Testbitte fuehrt den echten Nutzerpfad durch den Sammel-Editor und Modul 4",
  /Geschosseditor/.test(NEURECHNUNG117?.testbitte || "")
  && /Gemeinsam bearbeiten/.test(NEURECHNUNG117?.testbitte || "")
  && /\u00dcberstand/.test(NEURECHNUNG117?.testbitte || "")
  && /Modul 4/.test(NEURECHNUNG117?.testbitte || ""));
ok("[#117] die Testbitte sagt zu, dass „Auslegen“ in Modul 1 dafuer nicht mehr noetig ist",
  /Auslegen/.test(NEURECHNUNG117?.testbitte || "")
  && /Modul 1/.test(NEURECHNUNG117?.testbitte || "")
  && !/neue Einstellung|neues Feld|Regel|Version/i.test(NEURECHNUNG117?.testbitte || ""));
const neu117 = EINTRAEGE.filter(e => e.issue === 117);
ok("genau ein Eintrag fuer Issue 117", neu117.length === 1);

// Die BENANNTE PRODUKT-REFERENZ in der Stueckliste (#116) ist der neueste Eintrag — er wird
// als einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um
// eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass eine Zeile mit
// dem Grund „Produkt fehlt im Katalog" die unaufloesbare Kennung der Verwendungsstelle jetzt
// woertlich NENNT und sie vom Einbauteil der Zeile abgrenzt. Ausdruecklich NICHT versprochen
// werden ein Aufraeumen der Auswahl, ein Bedienelement, ein Preis, eine geaenderte Menge oder
// dieselbe Nennung auf den Gesamtebenen.
const FEHLREFERENZ116 = EINTRAEGE.find(e => e.id === "chg-20260909-12");
ok("[#116] die benannte Produkt-Referenz der Stueckliste ist der neueste Eintrag",
  FEHLREFERENZ116?.id === "chg-20260909-12" && FEHLREFERENZ116?.issue === 116
  && FEHLREFERENZ116?.typ === "fix" && FEHLREFERENZ116?.datum === "2026-09-09");
ok("[#116] der Titel benennt Kennung und Katalog, ohne eine Bedienung zu versprechen",
  /Kennung/.test(FEHLREFERENZ116?.titel || "")
  && /Katalog/.test(FEHLREFERENZ116?.titel || "")
  && /St\u00fcckliste/.test(FEHLREFERENZ116?.titel || "")
  && !/w\u00e4hlbar|Option|Einstellung|H\u00e4kchen|Preis|Summe|Datei|Migration|Version/i
       .test(FEHLREFERENZ116?.titel || ""));
ok("[#116] die Testbitte fuehrt den echten Nutzerpfad durch Modul 4",
  /Modul 4/.test(FEHLREFERENZ116?.testbitte || "")
  && /Verwendungsstelle/.test(FEHLREFERENZ116?.testbitte || "")
  && /Produkt fehlt im Katalog/.test(FEHLREFERENZ116?.testbitte || ""));
ok("[#116] die Testbitte sagt zu, dass die Kennung nur BENANNT wird",
  /Kennung/.test(FEHLREFERENZ116?.testbitte || "")
  && !/gel\u00f6scht|entfernt|aufger\u00e4umt|ersetzt|Preis|Menge/i
       .test(FEHLREFERENZ116?.testbitte || ""));
const neu116 = EINTRAEGE.filter(e => e.issue === 116);
ok("genau ein Eintrag fuer Issue 116", neu116.length === 1);
// Die STANGEN VOR DER KOPPLUNGSMUTTER (#112) sind der neueste Eintrag — er wird als
// einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um
// eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH die
// AUSGABEREIHENFOLGE — Gewindestange und weisse Stossmarke liegen in Wandansicht und
// Zeichnungsblatt jetzt auch vor der Kopplungsmutter, die ihrerseits als breiteres Bauteil
// erkennbar bleibt. Ausdruecklich NICHT versprochen werden eine geaenderte Stueckelung, eine
// andere Stangenlaenge, eine geaenderte Menge, ein Preis, ein Bedienelement oder eine neue
// Darstellungsoption; Anzahl, Lage, Groesse und Farbe jedes Symbols sind unveraendert.
const STANGENVORKOPPLUNG112 = EINTRAEGE.find(e => e.id === "chg-20260909-11");
ok("[#112] die Stangen vor der Kopplungsmutter sind der neueste Eintrag",
  STANGENVORKOPPLUNG112?.id === "chg-20260909-11" && STANGENVORKOPPLUNG112?.issue === 112
  && STANGENVORKOPPLUNG112?.typ === "fix" && STANGENVORKOPPLUNG112?.datum === "2026-09-09");
ok("[#112] der Titel benennt Bauteil und Stossmarke, ohne eine Bedienung zu versprechen",
  /Gewindestangen/.test(STANGENVORKOPPLUNG112?.titel || "")
  && /Kopplungsmutter/.test(STANGENVORKOPPLUNG112?.titel || "")
  && !/w\u00e4hlbar|Option|Einstellung|H\u00e4kchen|Preis|Summe|Datei|Migration|Version/i
       .test(STANGENVORKOPPLUNG112?.titel || ""));
ok("[#112] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1 und Modul 7",
  /Modul 1/.test(STANGENVORKOPPLUNG112?.testbitte || "")
  && /Modul 7/.test(STANGENVORKOPPLUNG112?.testbitte || "")
  && /Spannstr\u00e4ngen/.test(STANGENVORKOPPLUNG112?.testbitte || ""));
ok("[#112] die Testbitte verspricht keine geaenderte Stueckelung und keine Mengen",
  /sichtbar/.test(STANGENVORKOPPLUNG112?.testbitte || "")
  && !/Menge|Preis|St\u00fcckliste|L\u00e4nge \u00e4ndert|neue Stange/i
       .test(STANGENVORKOPPLUNG112?.testbitte || ""));

// Die SAMMELAENDERUNG BEI KATALOGFREMDEM ALTBESTAND (#114) ist der neueste Eintrag — er
// wird als einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt
// geschlossen um eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH,
// dass das Sammel-Popup des Geschosseditors eine Produktkennung, die im zugeordneten
// Bauteilkatalog fehlt, nicht mehr unsichtbar als Auswahl uebernimmt, sie in der Ist-Zeile
// als nicht im Katalog vorhanden BENENNT und die Uebernahme des gewaehlten Katalogprodukts
// dadurch durchlaeuft. Ausdruecklich NICHT versprochen werden ein Aufraeumen des
// Altbestands, ein neues Bedienelement, eine geaenderte Menge, ein Preis oder eine
// Aenderung am Katalog.
const ALTBESTAND114 = EINTRAEGE.find(e => e.id === "chg-20260909-10");
ok("[#114] die Sammelaenderung bei katalogfremdem Altbestand ist der neueste Eintrag",
  ALTBESTAND114?.id === "chg-20260909-10" && ALTBESTAND114?.issue === 114
  && ALTBESTAND114?.typ === "fix" && ALTBESTAND114?.datum === "2026-09-09");
ok("[#114] der Titel benennt Verwendungsstelle und Altbestand, ohne eine Bedienung zu versprechen",
  /Sammel\u00e4nderung/.test(ALTBESTAND114?.titel || "")
  && /Bodenblech/.test(ALTBESTAND114?.titel || "")
  && /Katalog/.test(ALTBESTAND114?.titel || "")
  && !/w\u00e4hlbar|Option|Einstellung|H\u00e4kchen|Preis|Summe|Datei|Migration|Version/i
       .test(ALTBESTAND114?.titel || ""));
ok("[#114] die Testbitte fuehrt den echten Nutzerpfad durch den Sammel-Editor",
  /Gemeinsam bearbeiten/.test(ALTBESTAND114?.testbitte || "")
  && /Bodenblech/.test(ALTBESTAND114?.testbitte || "")
  && /\u00fcbernehmen/.test(ALTBESTAND114?.testbitte || ""));
ok("[#114] die Testbitte sagt zu, dass die alte Kennung nur noch BENANNT wird",
  /nicht im Katalog/.test(ALTBESTAND114?.testbitte || "")
  && !/gel\u00f6scht|entfernt|aufger\u00e4umt|ersetzt/i.test(ALTBESTAND114?.testbitte || ""));
const neu114 = EINTRAEGE.filter(e => e.issue === 114);
ok("genau ein Eintrag fuer Issue 114", neu114.length === 1);
// Der EBENEN-NACHWEIS DER BAUGRUPPEN (#94) ist der neueste Eintrag — er wird als einziger
// direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins nach
// hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH der NACHWEIS, dass die aus
// Baugruppen aufgeloesten Positionen einer Wand auf der Geschoss-, Gebaeude- und Projektebene
// mengengleich zur Wandebene von Modul 4 sind und dass eine manuelle Menge weiterhin allein
// auf der Wandebene wirkt. Ausdruecklich NICHT versprochen werden ein neues Bedienelement,
// eine geaenderte Menge, ein Preis, eine neue Datei oder eine neue Ansicht — es ist ein
// reiner Regressionsnachweis, das Produkt bleibt unveraendert.
const EBENENNACHWEIS94 = EINTRAEGE.find(e => e.id === "chg-20260909-09");
ok("[#94] der Ebenen-Nachweis der Baugruppen ist der neueste Eintrag",
  EBENENNACHWEIS94?.id === "chg-20260909-09" && EBENENNACHWEIS94?.issue === 94
  && EBENENNACHWEIS94?.typ === "intern" && EBENENNACHWEIS94?.datum === "2026-09-09");
ok("[#94] der Titel benennt Baugruppen und Mengengleichheit, ohne eine Bedienung zu versprechen",
  /Baugruppen/.test(EBENENNACHWEIS94?.titel || "")
  && /Mengen/.test(EBENENNACHWEIS94?.titel || "")
  && !/w\u00e4hlbar|Option|Einstellung|H\u00e4kchen|eingeben|Preis|Summe|Datei|Migration|Version/i
       .test(EBENENNACHWEIS94?.titel || ""));
ok("[#94] die Testbitte fuehrt den echten Nutzerpfad ueber alle vier Ebenen von Modul 4",
  /Modul 4/.test(EBENENNACHWEIS94?.testbitte || "")
  && /Geschoss/.test(EBENENNACHWEIS94?.testbitte || "")
  && /Geb\u00e4ude/.test(EBENENNACHWEIS94?.testbitte || "")
  && /Projekt/.test(EBENENNACHWEIS94?.testbitte || ""));
// Das Nutzerergebnis ist die VERGLEICHBARKEIT der Mengen — und die unveraenderte Grenze der
// manuellen Menge nach [P-20].
ok("[#94] die Testbitte nennt die aufgeloesten Bauteile und die Grenze der manuellen Menge",
  /Spannplatte/.test(EBENENNACHWEIS94?.testbitte || "")
  && /Spannmutter/.test(EBENENNACHWEIS94?.testbitte || "")
  && /denselben Mengen/.test(EBENENNACHWEIS94?.testbitte || "")
  && /nur auf der Wandebene/.test(EBENENNACHWEIS94?.testbitte || ""));
// Gegenprobe: das Paket ist ein reiner NACHWEIS — es bewegt weder Bedienung noch Rechnung.
ok("[#94] die Testbitte verspricht kein Bedienelement, keine geaenderte Menge, keinen Preis",
  !/w\u00e4hlbar|Option|Einstellung|H\u00e4kchen|eingeben|Preis|Kosten|Summe|Nachweis|Export/i
    .test(EBENENNACHWEIS94?.testbitte || ""));
ok("genau ein Eintrag fuer den Ebenen-Nachweis der Baugruppen",
  EINTRAEGE.filter(e => e.id === "chg-20260909-09").length === 1);

// Die REALE EINBAUHOEHE DER KOPPLUNGSMUTTER (#97) ist der neueste Eintrag — er wird als
// einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins
// nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass die Kopplungsmutter
// am Wandfuss und an jedem Stangenstoss in der Wandansicht von Modul 1 und im Zeichnungsblatt
// von Modul 7 mit ihrer realen Einbauhoehe aus dem Bauteilkatalog masstabsgetreu gezeichnet
// wird und dass ohne dieses Mass das bisherige Symbol stehen bleibt. Ausdruecklich NICHT
// versprochen werden ein neues Bedienelement, ein neues gespeichertes Feld, eine geaenderte
// Rechnung, Menge, Preis oder Stueckliste sowie eine masstaebliche Darstellung der uebrigen
// Bauteile (Spannmutter, Einlegeblech, Sechskantschraube).
const MUTTERNHOEHE97 = EINTRAEGE.find(e => e.id === "chg-20260909-08");
ok("[#97] die reale Einbauhoehe der Kopplungsmutter ist der neueste Eintrag",
  MUTTERNHOEHE97?.id === "chg-20260909-08" && MUTTERNHOEHE97?.issue === 97
  && MUTTERNHOEHE97?.typ === "feature" && MUTTERNHOEHE97?.datum === "2026-09-09");
ok("[#97] der Titel benennt Bauteil und Massquelle, ohne eine Bedienung zu versprechen",
  /Kopplungsmutter/.test(MUTTERNHOEHE97?.titel || "")
  && /Einbauh\u00f6he/.test(MUTTERNHOEHE97?.titel || "")
  && !/w\u00e4hlbar|Option|Einstellung|H\u00e4kchen|eingeben|Preis|Summe|Datei|Migration|Version/i
       .test(MUTTERNHOEHE97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1 und Modul 7",
  /Modul 1/.test(MUTTERNHOEHE97?.testbitte || "")
  && /Modul 7/.test(MUTTERNHOEHE97?.testbitte || "")
  && /Katalog/.test(MUTTERNHOEHE97?.testbitte || ""));
// Das Nutzerergebnis ist die ABMESSBARE Hoehe an beiden Einbaustellen — und der Rueckfall.
ok("[#97] die Testbitte nennt beide Einbaustellen, die Unterscheidbarkeit und den Rueckfall",
  /Wandfu\u00df/.test(MUTTERNHOEHE97?.testbitte || "")
  && /Stangensto\u00df/.test(MUTTERNHOEHE97?.testbitte || "")
  && /masst\u00e4blich/.test(MUTTERNHOEHE97?.testbitte || "")
  && /bisherige Symbol/.test(MUTTERNHOEHE97?.testbitte || ""));
// Gegenprobe: das Paket ist REINE ZEICHENAENDERUNG — weder Bedienung noch Rechnung bewegen sich.
ok("[#97] die Testbitte verspricht kein Bedienelement, keine geaenderte Menge, keinen Preis",
  !/w\u00e4hlbar|Option|Einstellung|H\u00e4kchen|eingeben|Preis|Kosten|Summe|Nachweis|Export/i
    .test(MUTTERNHOEHE97?.testbitte || ""));
ok("genau ein Eintrag fuer die reale Einbauhoehe der Kopplungsmutter",
  EINTRAEGE.filter(e => e.id === "chg-20260909-08").length === 1);

// Die BAUGRUPPEN-ANSICHT IN MODUL 4 (#94) ist der zweitneueste Eintrag — er wird als einziger
// direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins nach
// hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass Modul 4 unter der
// Stuecklistentabelle ANZEIGT, welche Baugruppen des zugeordneten Katalogs mit welcher
// Instanzzahl gegriffen haben, welche Verwendungsstellen daraus aufgeloest wurden und was
// nicht aufloesbar war. Ausdruecklich NICHT versprochen werden ein Bedienelement, eine
// Baugruppenzeile in der Stueckliste selbst, geaenderte Mengen, Preise oder Summen, eine
// neue Datei oder eine Angabe auf den Gesamtebenen.
const BAUGRUPPENANSICHT94 = EINTRAEGE.find(e => e.id === "chg-20260909-07");
ok("[#94] die Baugruppen-Ansicht in Modul 4 ist der zweitneueste Eintrag",
  BAUGRUPPENANSICHT94?.id === "chg-20260909-07" && BAUGRUPPENANSICHT94?.issue === 94
  && BAUGRUPPENANSICHT94?.typ === "feature" && BAUGRUPPENANSICHT94?.datum === "2026-09-09");
ok("[#94] der Titel benennt Baugruppen und Anzahl, ohne eine Bedienung zu versprechen",
  /St\u00fcckliste/.test(BAUGRUPPENANSICHT94?.titel || "")
  && /Baugruppen/.test(BAUGRUPPENANSICHT94?.titel || "")
  && /Anzahl/.test(BAUGRUPPENANSICHT94?.titel || "")
  && !/w\u00e4hlbar|Option|Einstellung|H\u00e4kchen|eingeben|Preis|Summe|Datei|Migration|Version/i
       .test(BAUGRUPPENANSICHT94?.titel || ""));
ok("[#94] die Testbitte fuehrt den echten Nutzerpfad durch Modul 4",
  /Modul 4/.test(BAUGRUPPENANSICHT94?.testbitte || "")
  && /Standardkatalog/.test(BAUGRUPPENANSICHT94?.testbitte || "")
  && /Baugruppen/.test(BAUGRUPPENANSICHT94?.testbitte || ""));
// Das Nutzerergebnis ist die AUFLOESUNG samt ihren Meldungen — beides muss dranstehen.
ok("[#94] die Testbitte nennt Anzahl, Verwendungsstellen und die nicht aufloesbaren Faelle",
  /Anzahl/.test(BAUGRUPPENANSICHT94?.testbitte || "")
  && /Verwendungsstellen/.test(BAUGRUPPENANSICHT94?.testbitte || "")
  && /nicht Aufl\u00f6sbares/.test(BAUGRUPPENANSICHT94?.testbitte || ""));
// Gegenprobe: das Paket ist REINE ANZEIGE — es verspricht keine Bedienung und sagt
// ausdruecklich zu, dass sich an der Rechnung nichts bewegt.
ok("[#94] die Testbitte verspricht kein Bedienelement und sagt die unveraenderte Rechnung zu",
  /Mengen und Preise bleiben gleich/.test(BAUGRUPPENANSICHT94?.testbitte || "")
  && !/w\u00e4hlbar|Option|Einstellung|H\u00e4kchen|eingeben|Export|Datei|Nachweis/i
       .test(BAUGRUPPENANSICHT94?.testbitte || ""));
ok("genau ein Eintrag fuer die Baugruppen-Ansicht in Modul 4",
  EINTRAEGE.filter(e => e.id === "chg-20260909-07").length === 1);

// Die EINKAUFSLISTE JE KATALOGPRODUKT (#113, letztes Paket) ist der neueste Eintrag — er wird
// als einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um
// eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass der zentrale
// Export einer Geschoss-, Gebaeude- oder Projektstufe NEBEN der Gesamtstueckliste eine zweite
// CSV mitliefert, in der jede Zeile genau ein Katalogprodukt mit summierter Menge, seinen
// Einbaustellen und den Beschaffungsangaben ist, und dass nicht bestellbare Positionen in
// einem eigenen benannten Block stehen. Ausdruecklich NICHT versprochen werden ein neues
// Export-Haekchen, ein Bedienelement, geaenderte Mengen, Preise oder Summen sowie eine
// Aenderung an der bestehenden Gesamtstueckliste, der Wandstueckliste oder der Einzelteilliste.
const EINKAUFSLISTE113 = EINTRAEGE.find(e => e.id === "chg-20260909-06");
ok("[#113] die Einkaufsliste je Katalogprodukt ist der neueste Eintrag",
  EINKAUFSLISTE113?.id === "chg-20260909-06" && EINKAUFSLISTE113?.issue === 113
  && EINKAUFSLISTE113?.typ === "feature" && EINKAUFSLISTE113?.datum === "2026-09-09");
ok("[#113] der Titel benennt Datei und Aggregation, ohne eine Bedienung zu versprechen",
  /Gesamtstückliste/.test(EINKAUFSLISTE113?.titel || "")
  && /Einkaufsliste/.test(EINKAUFSLISTE113?.titel || "")
  && /Katalogprodukt/.test(EINKAUFSLISTE113?.titel || "")
  && !/wählbar|Option|Einstellung|Häkchen|Feld|Preis|Summe|Migration|Version/i
       .test(EINKAUFSLISTE113?.titel || ""));
ok("[#113] die Testbitte fuehrt den echten Nutzerpfad durch Modul 0 bis in die zweite Datei",
  /Modul 0/.test(EINKAUFSLISTE113?.testbitte || "")
  && /exportieren/.test(EINKAUFSLISTE113?.testbitte || "")
  && /zweite CSV/.test(EINKAUFSLISTE113?.testbitte || "")
  && /Einkaufsliste/.test(EINKAUFSLISTE113?.testbitte || ""));
// Das Nutzerergebnis ist die ARTIKELZEILE — und die Zusage, dass nichts verschwindet.
ok("[#113] die Testbitte nennt Aggregation, Einbaustellen und den Klaerungsblock",
  /summierter Menge/.test(EINKAUFSLISTE113?.testbitte || "")
  && /Einbaustellen/.test(EINKAUFSLISTE113?.testbitte || "")
  && /Beschaffungsangaben/.test(EINKAUFSLISTE113?.testbitte || "")
  && /Klärung vor der Bestellung nötig/.test(EINKAUFSLISTE113?.testbitte || ""));
// Gegenprobe: das Paket aendert weder Bedienung noch Rechnung — nichts davon darf hier stehen.
ok("[#113] die Testbitte verspricht kein Bedienelement, keine geaenderte Menge, keinen Preis",
  !/wählbar|Option|Einstellung|Häkchen|eingeben|Preis|Kosten|Summe|Nachweis/i
    .test(EINKAUFSLISTE113?.testbitte || ""));
ok("genau ein Eintrag fuer die Einkaufsliste je Katalogprodukt",
  EINTRAEGE.filter(e => e.id === "chg-20260909-06").length === 1);

// Die REALE KATALOGDICKE DER SPANNPLATTE (#97) ist der zweitneueste Eintrag — er wird als
// einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um
// eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass die
// aufliegende Spannplatte in der Wandansicht von Modul 1 und im Zeichnungsblatt von Modul 7
// mit ihrer realen Dicke aus dem Bauteilkatalog masstabsgetreu gezeichnet wird und dass die
// Spannmutter unmittelbar darauf sitzt. Ausdruecklich NICHT versprochen werden ein neues
// Bedienelement, ein neues gespeichertes Feld, eine geaenderte Rechnung, Menge, Preis oder
// Stueckliste sowie eine masstaebliche Darstellung der uebrigen Bauteile (Sechskantschraube,
// Kopplungsmutter, Einlegeblech, Mutter) oder ein Deckenanschluss-Symbol.
const PLATTENDICKE97 = EINTRAEGE.find(e => e.id === "chg-20260909-05");
ok("[#97] die reale Katalogdicke der Spannplatte ist der neueste Eintrag",
  PLATTENDICKE97?.id === "chg-20260909-05" && PLATTENDICKE97?.issue === 97
  && PLATTENDICKE97?.typ === "feature" && PLATTENDICKE97?.datum === "2026-09-09");
ok("[#97] der Titel benennt Bauteil und Massquelle, ohne eine Bedienung zu versprechen",
  /Spannplatte/.test(PLATTENDICKE97?.titel || "")
  && /Katalogdicke/.test(PLATTENDICKE97?.titel || "")
  && /gezeichnet/.test(PLATTENDICKE97?.titel || "")
  && !/wählbar|Option|Einstellung|Feld|Menge|Preis|Stückliste|Nachweis|Migration|Version/i
       .test(PLATTENDICKE97?.titel || ""));
ok("[#97] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1 UND Modul 7",
  /Modul 1\b/.test(PLATTENDICKE97?.testbitte || "")
  && /Modul 7/.test(PLATTENDICKE97?.testbitte || "")
  && /Spannplatte/.test(PLATTENDICKE97?.testbitte || "")
  && /Wandansicht/.test(PLATTENDICKE97?.testbitte || "")
  && /Blatt/.test(PLATTENDICKE97?.testbitte || ""));
// Das Nutzerergebnis ist das ABMESSEN: die Dicke ist ein Bauteilmass und kein Symbol mehr.
// Dazu die zweite Zusage des Pakets — die Mutter sitzt weiterhin unmittelbar auf der Platte.
ok("[#97] die Testbitte nennt die abmessbare echte Dicke und die aufsitzende Spannmutter",
  /echten Dicke/.test(PLATTENDICKE97?.testbitte || "")
  && /maßstäblich abmessbar/.test(PLATTENDICKE97?.testbitte || "")
  && /Spannmutter/.test(PLATTENDICKE97?.testbitte || "")
  && /unmittelbar darauf/.test(PLATTENDICKE97?.testbitte || ""));
// Gegenprobe: das Paket liefert weder eine Bedienung noch eine Rechnung, und die uebrigen
// Bauteile bleiben ausdruecklich symbolisch — nichts davon darf hier behauptet werden.
ok("[#97] die Testbitte verspricht kein Bedienelement, keine Rechnung, kein anderes Bauteil",
  !/wählbar|Option|Einstellung|eingeben|Feld|Menge|Preis|Kosten|Stückliste|Nachweis/i
    .test(PLATTENDICKE97?.testbitte || "")
  && !/Sechskantschraube|Kopplungsmutter|Einlegeblech|Deckenanschluss|Bodenblech|Modul 5/i
       .test(PLATTENDICKE97?.testbitte || ""));
ok("genau ein Eintrag fuer die reale Katalogdicke der Spannplatte",
  EINTRAEGE.filter(e => e.id === "chg-20260909-05").length === 1);
// Issue 97 wird in mehreren Paketen geliefert: die Spannplattendicke (chg-20260909-05), die
// Einbauhoehe der Kopplungsmutter (chg-20260909-08), die Schluesselweite als Katalogmass
// (chg-20260909-14), ihre Ableitung ans Wandelement (chg-20260909-15), die masstabsgetreue
// Mutternbreite (chg-20260909-16) und das Nachziehen der Schluesselweite im Sammel-Editor
// (chg-20260909-17), die beiden Masse der Spannmutter am Wandelement (chg-20260909-18) und die
// LAGE des Deckenanschluss-Symbols (chg-20260909-19), die gezeichnete Spannmutter
// (chg-20260909-20) und die herausgegebene Katalogfassung v2 (chg-20260909-21).
// Je Paket GENAU EIN Eintrag — und keiner mehr, damit dieselbe Aenderung nicht zweimal in der
// Liste steht. Die vier Kopplungsmutter-Pakete sind ausdruecklich VIER: das erste pflegt das
// Mass im Katalog, das zweite fuehrt es an die Wand, das dritte zeichnet es, das vierte
// schliesst die zweite Schreibbahn im Geschosseditor. Der Eintrag darueber betrifft ein
// ANDERES Bauteil — die Spannmutter — und ist deshalb ein eigenes Paket, kein zweiter
// Eintrag zur Kopplungsmutter. Das vorletzte Paket zeichnet gar kein Bauteil neu, sondern
// korrigiert die LAGE einer schon vorhandenen Marke — auch das ist ein eigenes Paket. Das
// letzte ZEICHNET die Spannmutter mit den Massen, die das Paket davor nur an die Wand gefuehrt
// hat: zwei Schritte, zwei Eintraege. Das letzte gibt schliesslich den KATALOG in einer neuen
// Fassung heraus — eine eigene Ressource ([L-12]) und damit ein eigenes Paket, kein zweiter
// Eintrag zum Zeichnen. Das letzte schliesst die ZWEITE SCHREIBBAHN der Spannmutter im
// Sammel-Editor — dieselbe Trennung wie beim vierten Eintrag zur Kopplungsmutter: Mass an
// die Wand fuehren und die Sammelbahn nachziehen sind zwei Schritte, zwei Eintraege.
ok("je Paket genau ein Eintrag fuer Issue 97", (() => {
  const n97 = EINTRAEGE.filter(e => e.issue === 97 && e.datum === "2026-09-09");
  return n97.length === 11
    && n97.filter(e => e.id === "chg-20260909-05").length === 1
    && n97.filter(e => e.id === "chg-20260909-08").length === 1
    && n97.filter(e => e.id === "chg-20260909-14").length === 1
    && n97.filter(e => e.id === "chg-20260909-15").length === 1
    && n97.filter(e => e.id === "chg-20260909-16").length === 1
    && n97.filter(e => e.id === "chg-20260909-17").length === 1
    && n97.filter(e => e.id === "chg-20260909-18").length === 1
    && n97.filter(e => e.id === "chg-20260909-19").length === 1
    && n97.filter(e => e.id === "chg-20260909-20").length === 1
    && n97.filter(e => e.id === "chg-20260909-21").length === 1
    && n97.filter(e => e.id === "chg-20260909-22").length === 1; })());

// Die NAMENSFOLGE DER WANDBLAETTER in der Zeichnungs-PDF (#107) ist der zweitneueste Eintrag —
// er wird als einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt
// geschlossen um eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH,
// dass die Wandblaetter einer Geschoss-PDF hinter dem Lageplan alphabetisch nach dem
// Wandnamen stehen statt in der Reihenfolge, in der die Waende gezeichnet wurden.
// Ausdruecklich NICHT versprochen werden eine waehlbare Sortierung, ein neues
// Bedienelement im Exportdialog, eine natuerliche Sortierung nach Ziffernfolgen, eine
// geaenderte Nummerierung im Lageplan sowie ein anderer Blattinhalt.
const PDFNAMENSFOLGE107 = EINTRAEGE.find(e => e.id === "chg-20260909-04");
ok("[#107] die Namensfolge der Wandblaetter ist der zweitneueste Eintrag",
  PDFNAMENSFOLGE107?.id === "chg-20260909-04" && PDFNAMENSFOLGE107?.issue === 107
  && PDFNAMENSFOLGE107?.typ === "feature" && PDFNAMENSFOLGE107?.datum === "2026-09-09");
ok("[#107] der Titel benennt Blattfolge und Ordnung, ohne eine Option zu versprechen",
  /Wandblätter/.test(PDFNAMENSFOLGE107?.titel || "")
  && /PDF/.test(PDFNAMENSFOLGE107?.titel || "")
  && /alphabetisch/.test(PDFNAMENSFOLGE107?.titel || "")
  && /Wandnamen/.test(PDFNAMENSFOLGE107?.titel || "")
  && !/wählbar|Option|Einstellung|Sortierknopf|Nummer|Nummerierung|Lageplan|Menge|Preis/i
       .test(PDFNAMENSFOLGE107?.titel || ""));
ok("[#107] die Testbitte fuehrt den echten Nutzerpfad durch Modul 0 bis in die PDF",
  /Modul 0/.test(PDFNAMENSFOLGE107?.testbitte || "")
  && /Zeichnungen als PDF/.test(PDFNAMENSFOLGE107?.testbitte || "")
  && /Geschoss-PDF/.test(PDFNAMENSFOLGE107?.testbitte || "")
  && /Lageplan/.test(PDFNAMENSFOLGE107?.testbitte || "")
  && /alphabetisch/.test(PDFNAMENSFOLGE107?.testbitte || ""));
// Gegenprobe: die Testbitte darf keine Bedienmoeglichkeit und keine geaenderte
// Nummerierung im Lageplan versprechen — sortiert wird allein die Ausgabefolge der
// Blaetter, und das Blatt selbst ist unveraendert.
ok("[#107] die Testbitte verspricht keine Option, kein Bedienelement, keine neue Nummerierung",
  !/wählbar|Option|Einstellung|Haken für die Sortierung|Sortierknopf|Nummernblase|Nummerierung|Wandtabelle|Menü/i
    .test(PDFNAMENSFOLGE107?.testbitte || ""));
ok("genau ein Eintrag fuer die Namensfolge der Wandblaetter",
  EINTRAEGE.filter(e => e.id === "chg-20260909-04").length === 1);
ok("genau ein Eintrag fuer Issue 107 in diesem Paket",
  EINTRAEGE.filter(e => e.issue === 107 && e.datum === "2026-09-09").length === 1);

// Der GEFUELLTE STANDARDKATALOG (#113, drittes Paket) ist der zweitneueste Eintrag — er wird
// als einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen
// um eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass die
// mitgelieferte Vorlage die aus ihren Bezeichnungen bereits bekannten Beschaffungsangaben in
// den dafuer vorgesehenen FELDERN fuehrt und dass eine nicht bekannte Angabe dort LEER
// bleibt. Ausdruecklich NICHT versprochen werden eine neue Stuecklistenspalte (die kam im
// Paket davor), eine dritte Datei „Einkaufsliste“, geaenderte Mengen, Preise oder Summen,
// eine andere Preiszuordnung sowie ein Formatsprung oder eine Migration.
const STDKATALOG113 = EINTRAEGE.find(e => e.id === "chg-20260909-03");
ok("[#113] der gefuellte Standardkatalog ist der zweitneueste Eintrag",
  STDKATALOG113?.id === "chg-20260909-03" && STDKATALOG113?.issue === 113
  && STDKATALOG113?.typ === "feature" && STDKATALOG113?.datum === "2026-09-09");
ok("[#113] der Titel benennt Katalog und Felder, ohne Datei, Menge oder Preis zu versprechen",
  /Standardkatalog/.test(STDKATALOG113?.titel || "")
  && /Beschaffungsangaben/.test(STDKATALOG113?.titel || "")
  && /Feldern/.test(STDKATALOG113?.titel || "")
  && !/Menge|Preis|Summe|Einkaufsliste|Stückliste|Spalte|Migration|Version/i
       .test(STDKATALOG113?.titel || ""));
ok("[#113] die Testbitte fuehrt den echten Nutzerpfad durch Modul 10",
  /Modul 10/.test(STDKATALOG113?.testbitte || "")
  && /Standardkatalog/.test(STDKATALOG113?.testbitte || "")
  && /Spannmutter/.test(STDKATALOG113?.testbitte || "")
  && /Bohrschraube/.test(STDKATALOG113?.testbitte || "")
  && /Beschaffung/.test(STDKATALOG113?.testbitte || ""));
// Die Testbitte muss die Angaben als EINZELNE FELDER versprechen — genau das ist das
// Nutzerergebnis dieses Pakets und der Unterschied zum Freitext in der Bezeichnung.
ok("[#113] die Testbitte nennt die Angaben als einzelne Felder statt als Namensbestandteil",
  /einzelne Felder/.test(STDKATALOG113?.testbitte || "")
  && /Namen/.test(STDKATALOG113?.testbitte || ""));
ok("[#113] die Testbitte verspricht keine Stuecklistenspalte, keine Menge, keinen Preis",
  !/Menge|Preis|Summe|Einkaufsliste|Stückliste|Spalte|Export|Migration|Version/i
    .test(STDKATALOG113?.testbitte || ""));
ok("genau ein Eintrag fuer den gefuellten Standardkatalog",
  EINTRAEGE.filter(e => e.id === "chg-20260909-03").length === 1);

// Der BESCHAFFUNGSBLOCK in den Stuecklistendateien (#113, zweites Paket) ist der neueste
// Eintrag — er wird als einziger direkt ueber seine Kennung geprueft; die bisherige Reihe
// rueckt geschlossen um eins nach hinten. Aussagewahr heisst hier: geliefert ist
// AUSSCHLIESSLICH, dass die Baustellenstueckliste einer Wand und die Gesamtstueckliste
// HINTER den bisherigen Spalten die Beschaffungsangaben des aufgeloesten Katalogprodukts
// fuehren und dass eine nicht eindeutig zugeordnete Position dort leer bleibt. Ausdruecklich
// NICHT versprochen werden geaenderte Mengen, Preise oder Summen, eine andere
// Preiszuordnung, eine dritte Datei „Einkaufsliste“ sowie ein gefuellter Standardkatalog.
const BESCHBLOCK113 = EINTRAEGE.find(e => e.id === "chg-20260909-02");
ok("[#113] der Beschaffungsblock in den Stuecklistendateien ist der neueste Eintrag",
  BESCHBLOCK113?.id === "chg-20260909-02" && BESCHBLOCK113?.issue === 113
  && BESCHBLOCK113?.typ === "feature" && BESCHBLOCK113?.datum === "2026-09-09");
ok("[#113] der Titel benennt die Angaben und die Datei, ohne Menge oder Preis zu versprechen",
  /St\u00fccklistendateien/.test(BESCHBLOCK113?.titel || "")
  && /Werkstoff/.test(BESCHBLOCK113?.titel || "")
  && /Artikelnummer/.test(BESCHBLOCK113?.titel || "")
  && !/Menge|Preis|Summe|Einkaufsliste|Standardkatalog|Migration/i
       .test(BESCHBLOCK113?.titel || ""));
ok("[#113] die Testbitte fuehrt den echten Nutzerpfad durch beide Dateien",
  /Modul 0/.test(BESCHBLOCK113?.testbitte || "")
  && /Baustellenst\u00fcckliste/.test(BESCHBLOCK113?.testbitte || "")
  && /Gesamtst\u00fcckliste/.test(BESCHBLOCK113?.testbitte || "")
  && /Beschaffungsblock/.test(BESCHBLOCK113?.testbitte || "")
  && /leer/.test(BESCHBLOCK113?.testbitte || ""));
ok("[#113] die Testbitte verspricht keine geaenderte Menge, keinen Preis, keine dritte Datei",
  !/Menge|Preis|Summe|Einkaufsliste|Standardkatalog|Migration|Feld/i
    .test(BESCHBLOCK113?.testbitte || ""));
ok("genau ein Eintrag fuer den Beschaffungsblock der Stuecklistendateien",
  EINTRAEGE.filter(e => e.id === "chg-20260909-02").length === 1);

// Die AUSDRUECKLICHE RUECKFRAGE vor der Katalogvariante (#108) ist der zweitneueste Eintrag —
// er wird als einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt
// geschlossen um eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH,
// dass eine Schreibbedienung am unveraenderlichen Standardkatalog vorher fragt, den Namen
// der entstehenden Variante nennt, beim Abbrechen nichts anlegt und danach in einem eigenen
// hervorgehobenen Hinweis sagt, welche Variante jetzt bearbeitet wird. Ausdruecklich NICHT
// versprochen werden eine geaenderte Katalogzuordnung, ein neues gespeichertes Feld sowie
// irgendeine Wirkung auf Mengen, Preisaufloesung, Verwendungsrollen oder Stuecklisten.
const VARIANTE108 = EINTRAEGE.find(e => e.id === "chg-20260909-01");
ok("[#108] die Rueckfrage vor der Katalogvariante ist der neueste Eintrag",
  VARIANTE108?.id === "chg-20260909-01" && VARIANTE108?.issue === 108
  && VARIANTE108?.typ === "feature" && VARIANTE108?.datum === "2026-09-09");
ok("[#108] der Titel benennt Rueckfrage und Variante und verspricht keine Zuordnung",
  /Standardkatalog/.test(VARIANTE108?.titel || "")
  && /R\u00fcckfrage/.test(VARIANTE108?.titel || "")
  && /Katalogvariante/.test(VARIANTE108?.titel || "")
  && !/Zuordnung|Menge|St\u00fcckliste|Preisaufl\u00f6sung|Rolle|Nachweis|Migration/i
       .test(VARIANTE108?.titel || ""));
ok("[#108] die Testbitte fuehrt den echten Nutzerpfad durch Modul 10 — Abbruch und Bestaetigung",
  /Modul 10/.test(VARIANTE108?.testbitte || "")
  && /Standardkatalog/.test(VARIANTE108?.testbitte || "")
  && /R\u00fcckfrage/.test(VARIANTE108?.testbitte || "")
  && /abbrechen/i.test(VARIANTE108?.testbitte || "")
  && /best\u00e4tigen/.test(VARIANTE108?.testbitte || "")
  && /Hinweis/.test(VARIANTE108?.testbitte || ""));
ok("[#108] die Testbitte verspricht keine Zuordnungsaenderung und kein neues Feld",
  !/Zuordnung|St\u00fcckliste|Einkaufsliste|Preisaufl\u00f6sung|Rolle|Nachweis|Migration|Feld/i
    .test(VARIANTE108?.testbitte || ""));
ok("genau ein Eintrag fuer die Rueckfrage vor der Katalogvariante",
  EINTRAEGE.filter(e => e.id === "chg-20260909-01").length === 1);

// Der WEISSE, BLECHHOHE BODENBLECHSTOSS und die Blechaufteilung in Modul 1 (#91) sind der
// zweitneueste Eintrag — er wird als einziger direkt ueber seine Kennung geprueft; die bisherige
// Reihe rueckt geschlossen um eins nach hinten. Aussagewahr heisst hier: geliefert ist
// AUSSCHLIESSLICH, dass die Stossmarke weiss ist und im Blech bleibt und dass die REALE
// Blechaufteilung schon in der Wandansicht von Modul 1 steht. Ausdruecklich NICHT versprochen
// werden geaenderte Mengen, Preise, Zuschnittplanung oder eine neue Darstellungsoption.
const BLECHSTOSS91 = EINTRAEGE.find(e => e.id === "chg-20260908-30");
ok("[#91] der weisse Bodenblechstoss ist der zweitneueste Eintrag",
  BLECHSTOSS91?.id === "chg-20260908-30" && BLECHSTOSS91?.issue === 91
  && BLECHSTOSS91?.typ === "fix" && BLECHSTOSS91?.datum === "2026-09-08");
ok("[#91] der Titel benennt beide Ergebnisse und verspricht keine neue Rechnung",
  /Bodenblechsto\u00df/.test(BLECHSTOSS91?.titel || "")
  && /wei\u00df/.test(BLECHSTOSS91?.titel || "")
  && /Modul 1/.test(BLECHSTOSS91?.titel || "")
  && !/Menge|Preis|St\u00fcckliste|Nachweis|Statik|Zuschnittplanung/i
       .test(BLECHSTOSS91?.titel || ""));
ok("[#91] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1",
  /Modul 1/.test(BLECHSTOSS91?.testbitte || "")
  && /Bodenblechteile/.test(BLECHSTOSS91?.testbitte || "")
  && /wei\u00dfe Marke/.test(BLECHSTOSS91?.testbitte || ""));
ok("[#91] die Testbitte verspricht keine Mengen, Preise und keine neue Option",
  !/Menge|Preis|St\u00fcckliste|Einkaufsliste|Nachweis|Option|Migration/i
    .test(BLECHSTOSS91?.testbitte || ""));
ok("genau ein Eintrag fuer den weissen Bodenblechstoss",
  EINTRAEGE.filter(e => e.id === "chg-20260908-30").length === 1);

// Die BESCHAFFUNGSANGABEN je Katalogprodukt (#113, erstes Paket) sind der drittneueste Eintrag —
// er wird als einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt
// geschlossen um eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH,
// dass Norm, Werkstoff, Oberflaeche, Hersteller und Artikelnummer — bei Verbrauchsmaterial
// zusaetzlich das Gewinde — je Produkt in Modul 10 pflegbar sind und Export und Import
// verlustfrei ueberstehen. Ausdruecklich NICHT versprochen werden ein Beschaffungsblock in
// den Stuecklisten-Exporten, eine neue Exportspalte oder Einkaufsliste, ein gefuellter
// Standardkatalog sowie irgendeine Wirkung auf Mengen, Preise oder Preiszuordnung.
const BESCHAFFUNG = EINTRAEGE.find(e => e.id === "chg-20260908-29");
ok("[#113] die Beschaffungsangaben je Produkt sind der drittneueste Eintrag",
  BESCHAFFUNG?.id === "chg-20260908-29" && BESCHAFFUNG?.issue === 113
  && BESCHAFFUNG?.typ === "feature" && BESCHAFFUNG?.datum === "2026-09-08");
ok("[#113] der Titel benennt die Angaben und verspricht keine Menge und keinen Preis",
  /Katalogprodukt/.test(BESCHAFFUNG?.titel || "")
  && /Werkstoff/.test(BESCHAFFUNG?.titel || "")
  && /Artikelnummer/.test(BESCHAFFUNG?.titel || "")
  && !/Menge|Preis|Stückliste|Einkaufsliste|Spalte|Standardkatalog|Export/i
       .test(BESCHAFFUNG?.titel || ""));
ok("[#113] die Testbitte fuehrt den echten Nutzerpfad durch Modul 10 samt Export und Import",
  /Modul 10/.test(BESCHAFFUNG?.testbitte || "")
  && /Beschaffung/.test(BESCHAFFUNG?.testbitte || "")
  && /Gewinde/.test(BESCHAFFUNG?.testbitte || "")
  && /exportieren/.test(BESCHAFFUNG?.testbitte || "")
  && /importieren/.test(BESCHAFFUNG?.testbitte || ""));
ok("[#113] die Testbitte verspricht keine Stuecklistenspalte und keinen Standardkatalog",
  !/Stückliste|Einkaufsliste|Spalte|Standardkatalog|Menge|Preis|Nachweis|Migration/i
    .test(BESCHAFFUNG?.testbitte || ""));
ok("genau ein Eintrag fuer die Beschaffungsangaben je Produkt",
  EINTRAEGE.filter(e => e.id === "chg-20260908-29").length === 1);

// Die GEWINDESTANGEN im VORDERGRUND und die weisse Haarlinie am Stoss (#112) sind der
// viertneueste Eintrag — er wird als einziger direkt ueber seine Kennung geprueft; die
// bisherige Reihe ist dafuer geschlossen um eins nach hinten gerueckt. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass
// in Wandansicht (Modul 1) und Zeichnungsblatt (Modul 7) keine Stangenlinie mehr verdeckt wird
// und jeder Stangenstoss eine weisse Haarlinie traegt. Ausdruecklich NICHT versprochen werden
// eine geaenderte Stueckelung, andere Mengen, Preise oder eine neue Darstellungsoption.
const STANGENVORN = EINTRAEGE.find(e => e.id === "chg-20260908-28");
ok("[#112] die Gewindestangen im Vordergrund sind der viertneueste Eintrag",
  STANGENVORN?.id === "chg-20260908-28" && STANGENVORN?.issue === 112
  && STANGENVORN?.typ === "fix" && STANGENVORN?.datum === "2026-09-08");
ok("[#112] der Eintrag benennt beide Ergebnisse und verspricht keine neue Rechnung",
  /Gewindestangen/.test(STANGENVORN?.titel || "")
  && /Vordergrund/.test(STANGENVORN?.titel || "")
  && /Haarlinie/.test(STANGENVORN?.titel || "")
  && !/Menge|Preis|St\u00fcckliste|Nachweis|Statik|Zuschnitt/i.test(STANGENVORN?.titel || ""));
ok("[#112] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1 und Modul 7",
  /Modul 1/.test(STANGENVORN?.testbitte || "")
  && /Modul 7/.test(STANGENVORN?.testbitte || "")
  && /Stangensto\u00df/.test(STANGENVORN?.testbitte || "")
  && /Haarlinie/.test(STANGENVORN?.testbitte || ""));
ok("[#112] die Testbitte verspricht keine geaenderte Stueckelung und keine Mengen",
  !/Menge|Preis|St\u00fcckliste|Nachweis|Statik|Montage|Lageplan|Migration/i
    .test(STANGENVORN?.testbitte || ""));
ok("genau ein Eintrag fuer die Gewindestangen im Vordergrund",
  EINTRAEGE.filter(e => e.id === "chg-20260908-28").length === 1);

// Die DARSTELLUNG und die STUECKLISTENMENGEN des Deckenanschlusses (#95, drittes und letztes
// Paket; Symbol aus #97) sind der neueste Eintrag — er wird als einziger direkt ueber
// seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins nach hinten.
// Aussagewahr heisst hier: geliefert ist, dass das Symbol in Wandansicht (Modul 1) und
// Zeichnungsblatt (Modul 7) steht und dass die Einzelteile mit ihrer Menge in der Stueckliste
// stehen. Ausdruecklich NICHT versprochen werden ein Nachweis, eine gezeichnete Decke, eine
// Darstellung in Modul 5 oder bestaetigte Winkelmasse.
const DECKENZEIGEN = EINTRAEGE.find(e => e.id === "chg-20260908-27");
ok("[#95] Darstellung und Stueckliste des Deckenanschlusses sind der neueste Eintrag",
  DECKENZEIGEN?.id === "chg-20260908-27" && DECKENZEIGEN?.issue === 95
  && DECKENZEIGEN?.typ === "feature" && DECKENZEIGEN?.datum === "2026-09-08");
ok("[#95] der Eintrag benennt beide Ergebnisse und verspricht keinen Nachweis",
  /Deckenanschluss/.test(DECKENZEIGEN?.titel || "")
  && /St\u00fcckliste/.test(JSON.stringify(DECKENZEIGEN?.titel || ""))
  && /(Wandansicht|Zeichnung)/.test(DECKENZEIGEN?.titel || "")
  && !/Nachweis|Statik|Decke gezeichnet|Ma\u00dfe/i.test(DECKENZEIGEN?.titel || ""));
ok("[#95] die Testbitte fuehrt den echten Nutzerpfad durch Modul 1, 7 und 4",
  /Modul 1/.test(DECKENZEIGEN?.testbitte || "")
  && /Modul 7/.test(DECKENZEIGEN?.testbitte || "")
  && /Modul 4/.test(DECKENZEIGEN?.testbitte || "")
  && /Anschlusspunkt/.test(DECKENZEIGEN?.testbitte || ""));
ok("[#95] die Testbitte verspricht keinen Nachweis und keine Montageanleitung",
  !/Nachweis|Statik|Modul 5|Montage|Decke einzeichnen|Migration/i
    .test(DECKENZEIGEN?.testbitte || ""));
ok("genau ein Eintrag fuer Darstellung und Stueckliste des Deckenanschlusses",
  EINTRAEGE.filter(e => e.id === "chg-20260908-27").length === 1);

// Die BAUGRUPPE „Deckenanschluss" im Bauteilkatalog (#95, Katalogpaket; Baugruppen-Rahmen
// aus #94) ist der neueste Eintrag — er wird als einziger direkt ueber seine Kennung geprueft;
// die bisherige Reihe rueckt geschlossen um eins nach hinten. Aussagewahr heisst hier:
// geliefert ist AUSSCHLIESSLICH, dass die Baugruppe mit ihren Einzelteilen im Katalog steht und
// die neuen Verwendungsstellen in Modul 1 waehlbar sind. Ausdruecklich NICHT versprochen werden
// Mengen in der Stueckliste, die Verteilung der Anschlusspunkte auf die Spannachsen, ein
// Editiermodus oder eine Darstellung in der Zeichnung — die folgen als eigene Pakete.
const DECKENSET = EINTRAEGE.find(e => e.id === "chg-20260908-26");
ok("[#95] die Baugruppe Deckenanschluss ist der neueste Eintrag",
  DECKENSET?.id === "chg-20260908-26" && DECKENSET?.issue === 95
  && DECKENSET?.typ === "feature" && DECKENSET?.datum === "2026-09-08");
ok("[#95] der Eintrag benennt Gegenstand und Ort ohne eine Menge zu versprechen",
  /Deckenanschluss/.test(DECKENSET?.titel || "")
  && /Baugruppe/.test(DECKENSET?.titel || "")
  && /Bauteilkatalog/.test(DECKENSET?.titel || "")
  && !/Menge|Stückliste|Zeichnung|Verteilung|Statik|Nachweis/i.test(DECKENSET?.titel || ""));
ok("[#95] die Testbitte fuehrt den echten Nutzerpfad im Katalogmodul",
  /Modul 10/.test(DECKENSET?.testbitte || "")
  && /Standardkatalog/.test(DECKENSET?.testbitte || "")
  && /Baugruppen/.test(DECKENSET?.testbitte || "")
  && /Deckenanschluss/.test(DECKENSET?.testbitte || ""));
ok("[#95] die Testbitte sagt ausdruecklich, dass die Stueckliste noch unveraendert bleibt",
  /Stückliste/.test(DECKENSET?.testbitte || "")
  && /unverändert/.test(DECKENSET?.testbitte || "")
  && /Spannachsen/.test(DECKENSET?.testbitte || ""));
ok("[#95] die Testbitte verspricht keinen Editiermodus und keine Zeichnung",
  !/Editiermodus|Zeichnung|Symbol|Lageplan|Montage|Nachweis|Statik|Migration/i
    .test(DECKENSET?.testbitte || ""));
ok("genau ein Eintrag fuer die Baugruppe Deckenanschluss",
  EINTRAEGE.filter(e => e.id === "chg-20260908-26").length === 1);

// Die MEHRFACHAUSWAHL je Verwendungsstelle im Sammel-Editor (#111, Folgepaket zu
// chg-20260907-20) ist der neueste Eintrag — er wird als einziger direkt ueber seine Kennung
// geprueft; die bisherige Reihe rueckt geschlossen um eins nach hinten. Aussagewahr heisst hier:
// geliefert ist AUSSCHLIESSLICH, dass im bestehenden Sammel-Popup je Verwendungsstelle MEHRERE
// Produkte mit Haekchen waehlbar sind — dasselbe Steuerelement wie in Modul 1. Ausdruecklich
// NICHT versprochen werden geaenderte Preise, Mengen, Stuecklisten, eine Sammelbearbeitung von
// Geometrie oder eine Katalogpflege im Editor.
const SAMMELMEHRFACH = EINTRAEGE.find(e => e.id === "chg-20260908-25");
ok("[#111] die Mehrfachauswahl je Verwendungsstelle ist der neueste Eintrag",
  SAMMELMEHRFACH?.id === "chg-20260908-25" && SAMMELMEHRFACH?.issue === 111
  && SAMMELMEHRFACH?.typ === "feature" && SAMMELMEHRFACH?.datum === "2026-09-08");
ok("[#111] der Eintrag benennt Gegenstand, Bedienweg und den Bezug auf Modul 1",
  /Verwendungsstelle/.test(SAMMELMEHRFACH?.titel || "")
  && /Häkchen/.test(SAMMELMEHRFACH?.titel || "")
  && /Modul 1/.test(SAMMELMEHRFACH?.titel || "")
  && !/Preis|Menge|Stückliste|Länge|Lage|Öffnung|Verzahnung/i.test(SAMMELMEHRFACH?.titel || ""));
ok("[#111] die Testbitte fuehrt den echten Nutzerpfad und ein konkretes Bauteil",
  /Geschosseditor/.test(SAMMELMEHRFACH?.testbitte || "")
  && /Gemeinsam bearbeiten/.test(SAMMELMEHRFACH?.testbitte || "")
  && /Gewindestangen/.test(SAMMELMEHRFACH?.testbitte || "")
  && /ankreuzen/.test(SAMMELMEHRFACH?.testbitte || ""));
ok("[#111] die Testbitte nennt die pruefbare Folge in Modul 1",
  /Modul 1/.test(SAMMELMEHRFACH?.testbitte || "")
  && /Längen/.test(SAMMELMEHRFACH?.testbitte || ""));
ok("[#111] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Preis|Stückliste|Zeichnung|Lageplan|Montage|Nachweis|Statik|Migration/i
    .test(SAMMELMEHRFACH?.testbitte || ""));
ok("genau ein Eintrag fuer die Mehrfachauswahl im Sammel-Editor",
  EINTRAEGE.filter(e => e.id === "chg-20260908-25").length === 1);

// Die ENTFALLENE Unterlegscheibe am Wandabschluss ist der neueste Eintrag — er wird als
// einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins
// nach hinten. Er korrigiert #92, das die Scheibe ausdruecklich als „vorlaeufig, fachlich
// unbestaetigt" eingefuehrt hatte. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass
// die Position aus der Stueckliste, die Auswahl aus Modul 1, das Produkt aus dem Katalog und die
// Position aus der Baugruppe verschwunden sind — und dass die Spannmutternzahl unberuehrt
// bleibt. Ausdruecklich NICHT versprochen werden geaenderte Geometrie, Nachweise oder
// Deckenanschluss-Scheiben (die es im Modell noch gar nicht gibt).
const OHNE_SCHEIBE = EINTRAEGE.find(e => e.id === "chg-20260908-24");
ok("[#92] die entfallene Unterlegscheibe ist der neueste Eintrag",
  OHNE_SCHEIBE?.id === "chg-20260908-24" && OHNE_SCHEIBE?.issue === 92
  && OHNE_SCHEIBE?.typ === "fix" && OHNE_SCHEIBE?.datum === "2026-09-08");
ok("[#92] der Eintrag benennt Gegenstand und Grund, ohne mehr zu behaupten",
  /Unterlegscheibe/.test(OHNE_SCHEIBE?.titel || "")
  && /entfallen/.test(OHNE_SCHEIBE?.titel || "")
  && /nicht verbaut/.test(OHNE_SCHEIBE?.titel || "")
  && !/Menge|Preis|Nachweis|Statik|Geometrie/i.test(OHNE_SCHEIBE?.titel || ""));
ok("[#92] die Testbitte fuehrt alle Stellen, an denen die Scheibe verschwindet",
  /Modul 4/.test(OHNE_SCHEIBE?.testbitte || "")
  && /Modul 1/.test(OHNE_SCHEIBE?.testbitte || "")
  && /Bauteilkatalog/.test(OHNE_SCHEIBE?.testbitte || "")
  && /Baugruppe/.test(OHNE_SCHEIBE?.testbitte || ""));
ok("[#92] die Testbitte benennt ausdruecklich, dass keine Nullzeile bleibt",
  /Menge 0/.test(OHNE_SCHEIBE?.testbitte || ""));
ok("[#92] die Testbitte sagt, was UNBERUEHRT bleibt",
  /Spannmuttern bleibt gleich/.test(OHNE_SCHEIBE?.testbitte || ""));
ok("genau ein Eintrag fuer Issue 92 zur entfallenen Scheibe",
  EINTRAEGE.filter(e => e.id === "chg-20260908-24").length === 1);

// Der feste ANSICHTSMASSTAB und die Spannmutter auf der Spannplatte (#106, zweiter Durchgang,
// mit [A-3]/#97) sind der neueste Eintrag — er wird als einziger direkt ueber seine Kennung
// geprueft; die bisherige Reihe rueckt geschlossen um eins nach hinten. Aussagewahr heisst
// hier: geliefert ist AUSSCHLIESSLICH, dass Stein, Schrift, Linien und Symbole in JEDER Wand
// dieselbe Zeichengroesse haben, dass die Ansicht dafuer BREITER wird statt kleiner, dass
// Einpassen nur verkleinert und dass auf jeder Spannplatte die Spannmutter sitzt. Ausdruecklich
// NICHT versprochen werden geaenderte Mengen, Stueckliste, Preise oder Nachweise, keine
// Unterlegscheibe (die es am Wandabschluss nicht gibt) und keine Umstellung der
// Montageanleitung (Modul 5).
const ANSICHTMASSTAB = EINTRAEGE.find(e => e.id === "chg-20260908-23");
ok("[#106] der feste Ansichtsmasstab ist der neueste Eintrag",
  ANSICHTMASSTAB?.id === "chg-20260908-23" && ANSICHTMASSTAB?.issue === 106
  && ANSICHTMASSTAB?.typ === "fix" && ANSICHTMASSTAB?.datum === "2026-09-08");
ok("[#106] der Eintrag benennt beide Gegenstaende: Steingroesse und Spannmutter",
  /Stein/.test(ANSICHTMASSTAB?.titel || "")
  && /gleich gro/.test(ANSICHTMASSTAB?.titel || "")
  && /Schrift/.test(ANSICHTMASSTAB?.titel || "")
  && /Spannmutter/.test(ANSICHTMASSTAB?.titel || "")
  && !/Menge|Stückliste|Preis|Nachweis|Statik|Unterlegscheibe/i.test(ANSICHTMASSTAB?.titel || ""));
ok("[#106] die Testbitte fuehrt den Vergleich zweier Wandgroessen im echten Modul",
  /Modul 1/.test(ANSICHTMASSTAB?.testbitte || "")
  && /2-m/.test(ANSICHTMASSTAB?.testbitte || "")
  && /8-m/.test(ANSICHTMASSTAB?.testbitte || ""));
ok("[#106] die Testbitte benennt die sichtbare Folge und die Grenze des Einpassens",
  /breiter statt kleiner/.test(ANSICHTMASSTAB?.testbitte || "")
  && /schrumpft nichts/.test(ANSICHTMASSTAB?.testbitte || "")
  && /Einpassen verkleinert nur/.test(ANSICHTMASSTAB?.testbitte || ""));
ok("[#106] die Testbitte nennt die Spannmutter auf der Spannplatte",
  /Spannplatte/.test(ANSICHTMASSTAB?.testbitte || "")
  && /Spannmutter/.test(ANSICHTMASSTAB?.testbitte || ""));
ok("[#106] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Menge|Stückliste|Preis|Nachweis|Statik|Montage|Migration|Unterlegscheibe/i
    .test(ANSICHTMASSTAB?.testbitte || ""));

// Die FESTEN Bauteilsymbole und die Fussfolge (#106, mit [A-19]/#97) sind der neueste Eintrag —
// sie werden als einzige direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt
// geschlossen um eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass
// dasselbe Bauteil in JEDER Wandgroesse und auf JEDEM Blattmasstab gleich gross gezeichnet wird,
// dass am Wandfuss Schraube, Bodenblech und aufliegende Kopplungsmutter stehen und dass die obere
// Spannplatte auf der Wandoberkante liegt. Ausdruecklich NICHT versprochen werden geaenderte
// Mengen, Stueckliste, Preise, Bemassung oder Nachweise — und NICHT die Montageanleitung
// (Modul 5), die die Fussfolge weiterhin nicht zeigt (Nachziehpunkt [P-6]).
const SYMBOLMASSE = EINTRAEGE.find(e => e.id === "chg-20260908-22");
ok("[#106] die festen Bauteilsymbole folgen darauf",
  SYMBOLMASSE?.id === "chg-20260908-22" && SYMBOLMASSE?.issue === 106
  && SYMBOLMASSE?.typ === "fix" && SYMBOLMASSE?.datum === "2026-09-08");
ok("[#106] der Eintrag benennt beide Gegenstaende: gleiche Groesse und die Fussfolge",
  /gleich gro/.test(SYMBOLMASSE?.titel || "")
  && /Wand/.test(SYMBOLMASSE?.titel || "")
  && /Schraube/.test(SYMBOLMASSE?.titel || "")
  && /Kopplungsmutter/.test(SYMBOLMASSE?.titel || "")
  // Keine Zusage zu Rechnung, Mengen, Preisen oder Nachweis.
  && !/Menge|Stückliste|Preis|Nachweis|Statik|Bemaßung/i.test(SYMBOLMASSE?.titel || ""));
ok("[#106] die Testbitte fuehrt den echten Nutzerpfad ueber beide Ansichten",
  /Modul 1/.test(SYMBOLMASSE?.testbitte || "")
  && /Modul 7/.test(SYMBOLMASSE?.testbitte || "")
  && /verschiedener Länge/.test(SYMBOLMASSE?.testbitte || ""));
ok("[#106] die Testbitte benennt den ALTEN Zustand, an dem man die Korrektur erkennt",
  /vorher/.test(SYMBOLMASSE?.testbitte || "")
  && /Mehrfaches größer/.test(SYMBOLMASSE?.testbitte || "")
  && /halb im Blech/.test(SYMBOLMASSE?.testbitte || ""));
ok("[#106] die Testbitte benennt die vollstaendige Fussfolge und die obere Spannplatte",
  /Sechskantschraube/.test(SYMBOLMASSE?.testbitte || "")
  && /Bodenblech/.test(SYMBOLMASSE?.testbitte || "")
  && /aufliegende Kopplungsmutter/.test(SYMBOLMASSE?.testbitte || "")
  && /Spannplatte/.test(SYMBOLMASSE?.testbitte || "")
  && /liegt oben auf/.test(SYMBOLMASSE?.testbitte || ""));
ok("[#106] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Menge|Stückliste|Preis|Bemaßung|Maßzahl|Nachweis|Statik|Montage|Migration/i
    .test(SYMBOLMASSE?.testbitte || ""));

// Die gemeinsame PRODUKTAUSWAHL im Sammel-Popup (#111, Folgepaket) ist der neueste Eintrag —
// er wird als einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen
// um eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass die
// Verwendungsstellen von Modul 1 im BESTEHENDEN Sammel-Popup fuer mehrere ausgewaehlte Waende
// gemeinsam gesetzt werden und dass der Vorgang ein Rueckgaengig-Schritt bleibt. Ausdruecklich
// NICHT versprochen werden eine Mehrfachauswahl je Verwendungsstelle (die bleibt Modul 1), eine
// Sammelbearbeitung von Laenge, Lage, Oeffnungen, Verzahnungen oder Spannachsen, eine
// Katalogpflege im Editor, geaenderte Preise oder Stuecklistenmengen.
const SAMMELPRODUKTE = EINTRAEGE.find(e => e.id === "chg-20260907-20");
ok("[#111] die gemeinsame Produktauswahl ist der neueste Eintrag",
  SAMMELPRODUKTE?.id === "chg-20260907-20" && SAMMELPRODUKTE?.issue === 111
  && SAMMELPRODUKTE?.typ === "feature" && SAMMELPRODUKTE?.datum === "2026-09-07");
ok("[#111] der Eintrag benennt Gegenstand, Umfang und den bestehenden Bedienort",
  /Produktauswahl/.test(SAMMELPRODUKTE?.titel || "")
  && /Modul 1/.test(SAMMELPRODUKTE?.titel || "")
  && /Wände/.test(SAMMELPRODUKTE?.titel || "")
  && /Popup/.test(SAMMELPRODUKTE?.titel || "")
  // Keine Zusage zu Geometrie, Katalogpflege, Preisen oder Mengen.
  && !/Länge|Lage|Öffnung|Verzahnung|Spannachse|Preis|Menge|Stückliste|Katalog pflegen/i
       .test(SAMMELPRODUKTE?.titel || ""));
ok("[#111] die Testbitte fuehrt den echten Nutzerpfad im Geschosseditor",
  /Geschosseditor/.test(SAMMELPRODUKTE?.testbitte || "")
  && /Gemeinsam bearbeiten/.test(SAMMELPRODUKTE?.testbitte || "")
  && /Verwendungsstellen/.test(SAMMELPRODUKTE?.testbitte || "")
  && /i3-Stein/.test(SAMMELPRODUKTE?.testbitte || ""));
ok("[#111] die Testbitte nennt Bedienweg und Rueckgaengigmachen in einem Schritt",
  /ankreuzen/.test(SAMMELPRODUKTE?.testbitte || "")
  && /Produkt wählen/.test(SAMMELPRODUKTE?.testbitte || "")
  && /Strg\+Z/.test(SAMMELPRODUKTE?.testbitte || "")
  && /einem Schritt/.test(SAMMELPRODUKTE?.testbitte || ""));
ok("[#111] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Preis|Menge|Stückliste|Zeichnung|Lageplan|Montage|Nachweis|Statik|Migration/i
    .test(SAMMELPRODUKTE?.testbitte || ""));

// Die vereinfachten Seitenansicht-Symbole der Spannkomponenten (#110) sind der zweitneueste Eintrag —
// sie werden als einzige direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt
// geschlossen um eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass
// Mutter, Kopplungsmutter, Spannplatten und Einlegeblech samt aufsitzender Mutter in Modul 1 UND
// Modul 7 als dieselben vereinfachten Symbole erscheinen. Ausdruecklich NICHT versprochen werden
// eine geaenderte Rechnung, geaenderte Mengen oder Stueckliste, neue Kennfarben, Bemassung an den
// Bauteilen oder eine Umstellung der Montageanleitung (Modul 5, eigenes Paket).
const SPANNSYMBOLE = EINTRAEGE.find(e => e.id === "chg-20260907-19");
ok("[#110] die Symbole der Spannkomponenten folgen darauf",
  SPANNSYMBOLE?.id === "chg-20260907-19" && SPANNSYMBOLE?.issue === 110
  && SPANNSYMBOLE?.typ === "feature" && SPANNSYMBOLE?.datum === "2026-09-07");
ok("[#110] der Eintrag benennt Gegenstand, beide Ansichten und das Nutzerergebnis",
  /Spannkomponenten/.test(SPANNSYMBOLE?.titel || "")
  && /Wandansicht/.test(SPANNSYMBOLE?.titel || "")
  && /Zeichnung/.test(SPANNSYMBOLE?.titel || "")
  && /Seitenansicht/.test(SPANNSYMBOLE?.titel || "")
  // Keine Zusage zu Rechnung, Mengen, Massen oder Preisen.
  && !/Menge|Stückliste|Preis|Nachweis|Statik|Maß|Bemaßung/i.test(SPANNSYMBOLE?.titel || ""));
ok("[#110] die Testbitte fuehrt den echten Nutzerpfad ueber beide Module",
  /Modul 1/.test(SPANNSYMBOLE?.testbitte || "")
  && /Modul 7/.test(SPANNSYMBOLE?.testbitte || "")
  && /Kopplung/.test(SPANNSYMBOLE?.testbitte || "")
  && /Zwischenspannpunkt/.test(SPANNSYMBOLE?.testbitte || ""));
ok("[#110] die Testbitte nennt die unterscheidbaren Bauteile und das Einlegeblech",
  /Mutternzylinder/.test(SPANNSYMBOLE?.testbitte || "")
  && /Kopplungsmuttern/.test(SPANNSYMBOLE?.testbitte || "")
  && /Spannplatten/.test(SPANNSYMBOLE?.testbitte || "")
  && /Einlegeblech/.test(SPANNSYMBOLE?.testbitte || "")
  && /dieselben Formen/.test(SPANNSYMBOLE?.testbitte || ""));
ok("[#110] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Menge|Stückliste|Preis|Bemaßung|Maßzahl|Nachweis|Statik|Montage|Migration/i
    .test(SPANNSYMBOLE?.testbitte || ""));
ok("genau ein Eintrag fuer Issue 110", EINTRAEGE.filter(e => e.issue === 110).length === 1);

// Das gemeinsame Bearbeiten aller neun allgemeinen Wandmerkmale (#111) folgt darauf —
// es wird als einziges direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen
// um eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass der
// Sammel-Editor des Geschosseditors hinter genau EINER Schaltflaeche in einem Popup liegt und dort
// neun allgemeine Wandmerkmale gemeinsam setzt, dass gemischte Ausgangswerte als solche stehen,
// dass nur Angekreuztes wirkt und dass der Vorgang ein Rueckgaengig-Schritt ist. Ausdruecklich
// NICHT versprochen werden eine gemeinsame PRODUKTAUSWAHL (Folgepaket), eine Sammelbearbeitung von
// Laenge, Lage, Oeffnungen, Verzahnungen oder Spannachsen und irgendeine geaenderte Rechnung.
const SAMMELMERKMALE = EINTRAEGE.find(e => e.id === "chg-20260907-18");
ok("[#111] das gemeinsame Bearbeiten der Wandmerkmale folgt darauf",
  SAMMELMERKMALE?.id === "chg-20260907-18" && SAMMELMERKMALE?.issue === 111
  && SAMMELMERKMALE?.typ === "feature" && SAMMELMERKMALE?.datum === "2026-09-07");
ok("[#111] der Eintrag benennt Gegenstand, Umfang und Nutzerergebnis",
  /gemeinsam/.test(SAMMELMERKMALE?.titel || "")
  && /Wände/.test(SAMMELMERKMALE?.titel || "")
  && /Popup/.test(SAMMELMERKMALE?.titel || "")
  && /neun/.test(SAMMELMERKMALE?.titel || "")
  // Keine Zusage zu Produktauswahl, Geometrie oder geaenderter Rechnung.
  && !/Produkt|Länge|Lage|Öffnung|Verzahnung|Spannachse|Nachweis|Statik|Preis/i
       .test(SAMMELMERKMALE?.titel || ""));
ok("[#111] die Testbitte fuehrt den echten Nutzerpfad im Geschosseditor",
  /Geschosseditor/.test(SAMMELMERKMALE?.testbitte || "")
  && /Gemeinsam bearbeiten/.test(SAMMELMERKMALE?.testbitte || "")
  && /gemischt/.test(SAMMELMERKMALE?.testbitte || "")
  && /Brandschutzklasse/.test(SAMMELMERKMALE?.testbitte || ""));
ok("[#111] die Testbitte nennt die selektive Wirkung und das Rueckgaengigmachen",
  /alles andere bleibt/.test(SAMMELMERKMALE?.testbitte || "")
  && /Nur Brandschutzklasse ankreuzen/.test(SAMMELMERKMALE?.testbitte || "")
  && /Strg\+Z/.test(SAMMELMERKMALE?.testbitte || "")
  && /einem Schritt/.test(SAMMELMERKMALE?.testbitte || ""));
ok("[#111] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Produktauswahl|Stückliste|Zeichnung|Lageplan|Montage|Nachweis|Statik|Migration/i
    .test(SAMMELMERKMALE?.testbitte || ""));
// Drei getrennte Pakete zu #111 — Wandmerkmale, Produktauswahl und die Mehrfachauswahl je
// Verwendungsstelle —, also drei Commits und drei Eintraege in dieser Reihenfolge (neu vor alt).
ok("genau drei Eintraege fuer Issue 111, neu vor alt",
  EINTRAEGE.filter(e => e.issue === 111).map(e => e.id).join(",")
    === "chg-20260908-25,chg-20260907-20,chg-20260907-18");

// Die Stuecklistenpositionen fuer Einlegeblech und Mutter (#93/#109) sind der neueste Eintrag —
// sie werden als einzige direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt
// geschlossen um eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass
// je wirksamem Zwischenspannpunkt genau EIN Einlegeblech und genau EINE Mutter als je eigene
// Position in der Baustellenstueckliste stehen ([A-25]), dass beide Bauteile in Modul 1 ein
// Katalogprodukt bekommen und dass der mitgelieferte Standardkatalog je einen vorlaeufigen
// Eintrag dafuer mitbringt. Ausdruecklich NICHT versprochen werden die DARSTELLUNG der
// Einlegebleche in technischer Zeichnung, Lageplan oder Montageanleitung (#97), bestaetigte
// Blechmasse (sie sind eine gekennzeichnete Katalogannahme bis zur Freigabe), eine geaenderte
// Vorspannrechnung, eine geaenderte Punktverteilung und eine geaenderte Ankerzaehlung.
const EINLEGEMENGE = EINTRAEGE.find(e => e.id === "chg-20260907-17");
ok("[#93/#109] die Stuecklistenposition des Einlegeblechs ist der neueste Eintrag",
  EINLEGEMENGE?.id === "chg-20260907-17" && EINLEGEMENGE?.issue === 109
  && EINLEGEMENGE?.typ === "feature" && EINLEGEMENGE?.datum === "2026-09-07");
ok("[#93/#109] der Eintrag benennt Gegenstand, Menge und Nutzerergebnis",
  /Einlegeblech/.test(EINLEGEMENGE?.titel || "")
  && /Mutter/.test(EINLEGEMENGE?.titel || "")
  && /Stückliste/.test(EINLEGEMENGE?.titel || "")
  && /Zwischenspannpunkt/.test(EINLEGEMENGE?.titel || "")
  // Keine Zusage zu Darstellung, Nachweis oder geaenderter Rechnung.
  && !/Zeichnung|Lageplan|Montage|Nachweis|Statik|Vorspannkraft/i
       .test(EINLEGEMENGE?.titel || ""));
ok("[#93/#109] die Testbitte fuehrt den echten Nutzerpfad ueber beide Module",
  /Modul 1/.test(EINLEGEMENGE?.testbitte || "")
  && /Modul 4/.test(EINLEGEMENGE?.testbitte || "")
  && /Zwischenspannpunkt/.test(EINLEGEMENGE?.testbitte || "")
  && /Preis/.test(EINLEGEMENGE?.testbitte || ""));
ok("[#93/#109] die Testbitte nennt den Fall ohne gewaehltes Produkt",
  /leer/i.test(EINLEGEMENGE?.testbitte || "")
  && /Menge bleibt/.test(EINLEGEMENGE?.testbitte || "")
  && /Grund/.test(EINLEGEMENGE?.testbitte || ""));
ok("[#93/#109] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Zeichnung|Lageplan|Montage|Nachweis|Statik|Migration|bestätigt/i
    .test(EINLEGEMENGE?.testbitte || ""));
// Die Blechmasse sind bis zur Freigabe durch Karl eine gekennzeichnete KATALOGANNAHME (#93).
// Der Eintrag darf sie deshalb nicht als bestaetigt oder freigegeben darstellen. Geprueft wird
// bewusst diese Richtung — die ABWESENHEIT einer Zusage — und nicht das Vorkommen des Wortes
// „vorlaeufig": der Eintrag behauptet ueber die Masse ueberhaupt nichts, und wo nichts behauptet
// wird, ist auch nichts zu relativieren ([D-5]: Weglassen behauptet nichts). Die Kennzeichnung
// selbst sitzt dort, wo die Masse stehen — am Katalogprodukt (geprueft in test-katalog.mjs).
ok("[#93/#109] der Eintrag stellt die Blechmasse nirgends als bestaetigt dar",
  !/bestätigt|freigegeben|verbindlich|endgültig|Freigabe/i
    .test(String(EINLEGEMENGE?.titel || "") + " " + String(EINLEGEMENGE?.testbitte || "")));
// Drei Eintraege fuer #109: die Nachfuehrung von Modul 7, ... und die Stuecklistenpositionen.
// Der Scope von #93 reist im Text mit, gezaehlt wird der Eintrag aber unter seinem `issue`.
ok("genau zwei Eintraege fuer Issue 109 (Modul-7-Nachfuehrung und Stuecklistenposition)",
  EINTRAEGE.filter(e => e.issue === 109).length === 2);

// Danach folgt die Aktualisierung von Modul 7 ohne Neuladen (#109) — sie wird direkt ueber
// seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins
// nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH, dass Modul 7 eine
// Aenderung DERSELBEN aktiven Wand aus Modul 1 unmittelbar neu rechnet und zeichnet — samt
// Uebersicht, Massstab und Tabellen — und dass die gewaehlten Darstellungsoptionen dabei
// stehen bleiben. Ausdruecklich NICHT versprochen werden die gleiche Nachfuehrung in Modul 4
// (eigenes Paket zu #109), die fehlenden Einlegebleche in Stueckliste oder Zeichnung
// (#93/#97) und irgendeine Aenderung am Blattinhalt selbst.
const ZEICHNUNGSSYNC = EINTRAEGE.find(e => e.id === "chg-20260907-16");
ok("[#109] die Aktualisierung von Modul 7 folgt darauf",
  ZEICHNUNGSSYNC?.id === "chg-20260907-16" && ZEICHNUNGSSYNC?.issue === 109
  && ZEICHNUNGSSYNC?.typ === "fix" && ZEICHNUNGSSYNC?.datum === "2026-09-07");
ok("[#109] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Modul 7/.test(ZEICHNUNGSSYNC?.titel || "")
  && /Modul 1/.test(ZEICHNUNGSSYNC?.titel || "")
  && /ohne Neuladen/.test(ZEICHNUNGSSYNC?.titel || "")
  // Keine Zusage zu Stueckliste, Einlegeblechen oder geaendertem Blattinhalt.
  && !/St\u00fcckliste|Modul 4|Einlegeblech|Blechen|Blattinhalt/i.test(ZEICHNUNGSSYNC?.titel || ""));
ok("[#109] die Testbitte fuehrt den echten Nutzerpfad ueber beide Module",
  /Modul 7/.test(ZEICHNUNGSSYNC?.testbitte || "")
  && /Modul 1/.test(ZEICHNUNGSSYNC?.testbitte || "")
  && /H\u00f6he/.test(ZEICHNUNGSSYNC?.testbitte || "")
  && /derselben Wand/.test(ZEICHNUNGSSYNC?.testbitte || "")
  && /(Darstellungsoptionen|erhalten)/.test(ZEICHNUNGSSYNC?.testbitte || ""));
ok("[#109] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/St\u00fcckliste|Modul 4|Einlegeblech|Zwischenspannblech|Montageanleitung|Nachweis/i
     .test(ZEICHNUNGSSYNC?.testbitte || ""));

// Davor liegt der EDITIERMODUS der Ausgleichspunkte (#96) — er wird als einziger direkt
// ueber seine Kennung geprueft; die bisherige Reihe ist dafuer geschlossen um eins nach
// hinten gerueckt. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH die Bedienung in Modul 1 —
// Punkte hinzufuegen, verschieben, loeschen, „Zurueck zu Auto" — samt gespeichertem Override,
// der die automatische Verteilung sperrt und Speichern/Laden uebersteht ([A-24]). Ausdruecklich
// NICHT versprochen werden eine Darstellung der Punkte in Wandansicht, Zeichnung oder Montage
// (Issue #97), kombinierbare Blechdicken oder ein statischer Nachweis der Auflagerpunkte.
const EDITIERMODUS = EINTRAEGE.find(e => e.id === "chg-20260907-15");
ok("[#96] der Editiermodus der Ausgleichspunkte ist der neueste Eintrag",
  EDITIERMODUS?.id === "chg-20260907-15" && EDITIERMODUS?.issue === 96
  && EDITIERMODUS?.typ === "feature" && EDITIERMODUS?.datum === "2026-09-07");
ok("[#96] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Ausgleichspunkte/.test(EDITIERMODUS?.titel || "")
  && /Modul 1/.test(EDITIERMODUS?.titel || "")
  && /Zur\u00fcck zu Auto/.test(EDITIERMODUS?.titel || "")
  // Keine Zusage zu Darstellung, Dickenkombination, Preis oder Statik.
  && !/Zeichnung|Darstellung|Dicken|Preis|Nachweis|Statik/i.test(EDITIERMODUS?.titel || ""));
ok("[#96] die Testbitte fuehrt den echten Nutzerpfad in Modul 1 samt Umlauf",
  /Modul 1/.test(EDITIERMODUS?.testbitte || "")
  && /setzen/.test(EDITIERMODUS?.testbitte || "")
  && /l\u00f6schen/.test(EDITIERMODUS?.testbitte || "")
  && /neu laden/.test(EDITIERMODUS?.testbitte || "")
  && /Zur\u00fcck zu Auto/.test(EDITIERMODUS?.testbitte || ""));
ok("[#96] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Zeichnung|Montageanleitung|Dicken|Preis|Nachweis|Modul 4|Modul 9/i
     .test(EDITIERMODUS?.testbitte || ""));

// Davor liegt die Stuecklistenposition des Ausgleichsblechs (#96) — sie wird als einzige
// direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins
// nach hinten. Aussagewahr heisst hier: geliefert ist GENAU EINE Position „Ausgleichsblech" mit
// der Menge gleich der Zahl der gerechneten Ausgleichspunkte ([A-18]), bepreist ueber die
// bestehende Rolle. Ausdruecklich NICHT versprochen werden ein Editiermodus in Modul 1, eine
// Darstellung der Punkte in Wandansicht, Zeichnung oder Montage (Issue #97), kombinierbare
// Blechdicken oder ein statischer Nachweis der Auflagerpunkte.
const AUSGLEICHSMENGE = EINTRAEGE.find(e => e.id === "chg-20260907-14");
ok("[#96] die Stuecklistenposition des Ausgleichsblechs folgt direkt danach",
  AUSGLEICHSMENGE?.id === "chg-20260907-14" && AUSGLEICHSMENGE?.issue === 96
  && AUSGLEICHSMENGE?.typ === "feature" && AUSGLEICHSMENGE?.datum === "2026-09-07");
ok("[#96] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /St\u00fcckliste/.test(AUSGLEICHSMENGE?.titel || "")
  && /Ausgleichsblech/.test(AUSGLEICHSMENGE?.titel || "")
  && /Ausgleichspunkt/.test(AUSGLEICHSMENGE?.titel || "")
  // Keine Zusage zu Editiermodus, Darstellung, Dickenkombination oder Statik.
  && !/Editier|Zeichnung|Darstellung|Dicken|Statik|Nachweis/i.test(AUSGLEICHSMENGE?.titel || ""));
ok("[#96] die Testbitte fuehrt den echten Nutzerpfad in Modul 4",
  /Modul 4/.test(AUSGLEICHSMENGE?.testbitte || "")
  && /3,25 m/.test(AUSGLEICHSMENGE?.testbitte || "")
  && /Menge 10/.test(AUSGLEICHSMENGE?.testbitte || "")
  && /Katalog/.test(AUSGLEICHSMENGE?.testbitte || ""));
ok("[#96] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  /(bleiben unver\u00e4ndert|unver\u00e4ndert)/.test(AUSGLEICHSMENGE?.testbitte || "")
  && !/Editier|Zeichnung|Montageanleitung|Dicken|Nachweis/i
       .test(AUSGLEICHSMENGE?.testbitte || ""));

// Davor liegt die korrigierte Maßorientierung des vorlaeufigen Ausgleichsblechs
// (#96, Feststellung von Tibor vom 2026-09-07) — er wird als einziger direkt ueber
// seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins nach hinten.
// Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH die gedrehte Orientierung des
// Blechs in der mitgelieferten Vorlage samt Rollenhinweis und Handbuchregel — 20 mm in
// Wandrichtung, 100 mm quer, Dicke unveraendert 8 mm. Ausdruecklich NICHT versprochen werden
// eine Stuecklistenposition oder Menge, ein geaenderter Preis, eine Darstellung oder eine
// Migration bereits gespeicherter Kataloge.
const MASSORIENTIERUNG = EINTRAEGE.find(e => e.id === "chg-20260907-13");
ok("[#96] die korrigierte Ma\u00dforientierung ist der neueste Eintrag",
  MASSORIENTIERUNG?.id === "chg-20260907-13" && MASSORIENTIERUNG?.issue === 96
  && MASSORIENTIERUNG?.typ === "fix" && MASSORIENTIERUNG?.datum === "2026-09-07");
ok("[#96] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Ausgleichsblech/.test(MASSORIENTIERUNG?.titel || "")
  && /20 mm in Wandrichtung/.test(MASSORIENTIERUNG?.titel || "")
  && /vorläufig/.test(MASSORIENTIERUNG?.titel || "")
  // Keine Zusage zu Menge, Position, Preis, Darstellung oder Migration.
  && !/Menge|Stückliste|Preis|Zeichnung|Darstellung|Migration|migriert/i
       .test(MASSORIENTIERUNG?.titel || ""));
ok("[#96] die Testbitte fuehrt den echten Nutzerpfad in Modul 10",
  /Modul 10/.test(MASSORIENTIERUNG?.testbitte || "")
  && /20 mm/.test(MASSORIENTIERUNG?.testbitte || "")
  && /100 mm/.test(MASSORIENTIERUNG?.testbitte || "")
  && /Wandrichtung/.test(MASSORIENTIERUNG?.testbitte || ""));
ok("[#96] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  /(bleiben gleich|unverändert|unveraendert)/.test(MASSORIENTIERUNG?.testbitte || "")
  && !/Ausgleichspunkt|Verteilung|Migration|migriert|Zeichnung|Montageanleitung/i
       .test(MASSORIENTIERUNG?.testbitte || ""));

// Davor liegen die deterministisch berechneten Ausgleichspunkte (#96) — sie werden
// als einzige direkt ueber seine Kennung geprueft. Aussagewahr heisst hier: geliefert ist die
// deterministische VERTEILUNG der Punkte im Rechenkern und im Python-Orakel ([A-20]…[A-23]) — Dichte drei je Meter mit den
// Wandenden als zaehlende Punkte, ein Pflichtpunkt je Bodenblech-Stossmitte, und dieselbe Wand
// ergibt immer dieselbe Liste. Ausdruecklich NICHT versprochen werden eine Stuecklistenposition
// oder Menge, ein Editiermodus in Modul 1, eine Darstellung der Punkte in Wandansicht,
// Zeichnung oder Montage (Issue #97), geaenderte Blechmasse oder ein Preis.
const AUSGLEICHSPUNKTE = EINTRAEGE.find(e => e.id === "chg-20260907-12");
ok("[#96] die deterministischen Ausgleichspunkte sind der neueste Eintrag",
  AUSGLEICHSPUNKTE?.id === "chg-20260907-12" && AUSGLEICHSPUNKTE?.issue === 96
  && AUSGLEICHSPUNKTE?.typ === "feature" && AUSGLEICHSPUNKTE?.datum === "2026-09-07");
ok("[#96] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Ausgleichspunkte/.test(AUSGLEICHSPUNKTE?.titel || "")
  && /Bodenblech/.test(AUSGLEICHSPUNKTE?.titel || "")
  && /deterministisch/i.test(AUSGLEICHSPUNKTE?.titel || "")
  && /je Meter/.test(AUSGLEICHSPUNKTE?.titel || "")
  // Keine Zusage zu Menge, Position, Bedienung, Darstellung oder Preis.
  && !/Stückliste|Menge|Preis|Zeichnung|Modul 1\b|bearbeit/i.test(AUSGLEICHSPUNKTE?.titel || ""));
ok("[#96] die Testbitte fuehrt den echten Nutzerpfad samt Pflichtpunkt und Wiederholbarkeit",
  /3,25/.test(AUSGLEICHSPUNKTE?.testbitte || "")
  && /zehn/.test(AUSGLEICHSPUNKTE?.testbitte || "")
  && /Wandenden/.test(AUSGLEICHSPUNKTE?.testbitte || "")
  && /Stoßmitte/.test(AUSGLEICHSPUNKTE?.testbitte || "")
  && /dieselbe Liste/.test(AUSGLEICHSPUNKTE?.testbitte || ""));
ok("[#96] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  /Menge und Darstellung folgen sp/.test(AUSGLEICHSPUNKTE?.testbitte || "")
  && !/Preis|Kosten|Stückliste|Nachweis|Zeichnung|Montage/i
       .test(AUSGLEICHSPUNKTE?.testbitte || ""));

// Das eigene Katalogmodul (#108) rueckt um eins nach hinten.
// Aussagewahr heisst hier: geliefert ist, dass die Katalogpflege eine EIGENE SEITE ist
// (Modul 10) und dass dort JEDER gespeicherte Katalog bearbeitbar ist — auch einer, der dem
// aktiven Projekt nicht zugeordnet ist —, waehrend die ZUORDNUNG in Modul 0 bleibt ([L-12]).
// Ausdruecklich NICHT versprochen werden ein neu gestaltetes Varianten-Feedback (Folgepaket
// zu #108), eine geaenderte Produktwahl in Modul 1/2, geaenderte Preise oder Mengen, ein
// neues Dateiformat oder ein Katalog im Projekt-Export.
const KATALOGMODUL = EINTRAEGE.find(e => e.id === "chg-20260907-11");
ok("[#108] das eigene Katalogmodul folgt darauf",
  KATALOGMODUL?.id === "chg-20260907-11" && KATALOGMODUL?.issue === 108
  && KATALOGMODUL?.typ === "feature" && KATALOGMODUL?.datum === "2026-09-07");
ok("[#108] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Bauteilkatalog/.test(KATALOGMODUL?.titel || "")
  && /Modul/.test(KATALOGMODUL?.titel || "")
  && /bearbeitbar/.test(KATALOGMODUL?.titel || "")
  && /ordnet nur zu/.test(KATALOGMODUL?.titel || "")
  // Keine Zusage zu Feedback-Umbau, Preisen, Mengen oder Formaten.
  && !/Feedback|Preis|Menge|Format|Projektarchiv|Modul 1\b|Modul 2\b/i
       .test(KATALOGMODUL?.titel || ""));
ok("[#108] die Testbitte fuehrt den echten Bedienweg samt Zuordnungsfall",
  /Katalog/.test(KATALOGMODUL?.testbitte || "")
  && /NICHT zugeordnet/.test(KATALOGMODUL?.testbitte || "")
  && /bearbeiten/.test(KATALOGMODUL?.testbitte || "")
  && /Zuordnung bleibt/.test(KATALOGMODUL?.testbitte || "")
  && /Modul 0/.test(KATALOGMODUL?.testbitte || ""));
ok("[#108] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Preis|Kosten|Menge|Stückliste|Nachweis|Zeichnung|Projektarchiv|Feedback/i
    .test(KATALOGMODUL?.testbitte || ""));

// Der wieder funktionierende Zeichnungs-PDF-Export (#98/#107) rueckt um eins nach hinten. Aussagewahr heisst hier: geliefert ist, dass der Export
// UEBERHAUPT wieder herunterlaedt — auch bei einem Geschoss mit kalibriertem Planhintergrund —
// und dass er im BESTEHENDEN Exportdialog von Modul 0 ausgeloest wird. Der gelieferte Umfang
// aus #98 bleibt unveraendert (eine PDF je Geschoss, Lageplan auf Seite 1). Ausdruecklich NICHT
// versprochen werden ein geaenderter Zeichnungsinhalt, ein anderer Masstab, ein anderes
// Papierformat, markierbarer Text in der PDF oder eine Aenderung an Modul 7, Modul 9 oder am
// bestehenden Datenexport.
const PDFRUECKKEHR = EINTRAEGE.find(e => e.id === "chg-20260907-10");
ok("[#98/#107] der wieder funktionierende Zeichnungsexport ist der neueste Eintrag",
  PDFRUECKKEHR?.id === "chg-20260907-10" && PDFRUECKKEHR?.issue === 98
  && PDFRUECKKEHR?.typ === "fix" && PDFRUECKKEHR?.datum === "2026-09-07");
ok("[#98/#107] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /PDF/.test(PDFRUECKKEHR?.titel || "")
  && /Export/.test(PDFRUECKKEHR?.titel || "")
  && /herunter/.test(PDFRUECKKEHR?.titel || "")
  && /Exportdialog/.test(PDFRUECKKEHR?.titel || "")
  // Keine Zusage zu Blatt, Masstab, Inhalt oder markierbarem Text.
  && !/Maßstab|Blattformat|Bemaßung|Zeichnungsinhalt|markierbar|Modul 7|Modul 9/i
       .test(PDFRUECKKEHR?.titel || ""));
ok("[#98/#107] die Testbitte fuehrt den neuen Bedienweg und den Planhintergrundfall",
  /Modul 0/.test(PDFRUECKKEHR?.testbitte || "")
  && /Exportieren/.test(PDFRUECKKEHR?.testbitte || "")
  && /Zeichnungen als PDF/.test(PDFRUECKKEHR?.testbitte || "")
  && /je Geschoss/.test(PDFRUECKKEHR?.testbitte || "")
  && /Seite 1/.test(PDFRUECKKEHR?.testbitte || "")
  && /Planhintergrund/.test(PDFRUECKKEHR?.testbitte || ""));
ok("[#98/#107] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Maßstab|Blattformat|markierbar|Nachweis|Menge|Preis|Kosten|Modul 7|Modul 9|Projektarchiv/i
    .test(PDFRUECKKEHR?.testbitte || ""));

// Der Treffer der Achsen in der Wandansicht (#106, Bedienteil) rueckt um eins nach hinten und
// zaehlt ab hier ueber `ACHSTREFFER`. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH die Bedienung —
// der Klick trifft bei jedem Zoomgrad die angeklickte Raster- bzw. Lagenposition, eine
// vorhandene Spannachse oder Zwischenspannachse wird verschoben statt verdoppelt, und die
// Ansicht zeigt, wo angefasst und wo neu angelegt wird. Ausdruecklich NICHT versprochen wird
// der offene DARSTELLUNGSTEIL derselben Rueckmeldung (Groesse und Strichstaerke der
// Zwischenspannbleche, Spannplatte im Stein, Zwischenspannbleche in der technischen Zeichnung)
// und keine geaenderte Menge, kein Preis und keine geaenderte Rechnung.
const ACHSTREFFER = EINTRAEGE.find(e => e.id === "chg-20260907-09");
ok("[#106] der Achstreffer in der Wandansicht folgt darauf",
  ACHSTREFFER?.id === "chg-20260907-09" && ACHSTREFFER?.issue === 106
  && ACHSTREFFER?.typ === "fix" && ACHSTREFFER?.datum === "2026-09-07");
ok("[#106] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Wandansicht/.test(ACHSTREFFER?.titel || "")
  && /Achsen/.test(ACHSTREFFER?.titel || "")
  && /geklickt/.test(ACHSTREFFER?.titel || "")
  && /verschieben/.test(ACHSTREFFER?.titel || "")
  && /verdoppeln/.test(ACHSTREFFER?.titel || "")
  // Keine Zusage zum Darstellungsteil, zu Mengen/Preisen oder zur Zeichnung.
  && !/Blech|Strichstärke|Größe|Spannplatte|Modul 7|Zeichnung|Menge|Preis|Stückliste/i
       .test(ACHSTREFFER?.titel || ""));
ok("[#106] die Testbitte fuehrt den echten Bedienweg in beiden Editoren",
  /Modul 1/.test(ACHSTREFFER?.testbitte || "")
  && /zoomen/.test(ACHSTREFFER?.testbitte || "")
  && /Spannachsen-Editor/.test(ACHSTREFFER?.testbitte || "")
  && /ziehen/.test(ACHSTREFFER?.testbitte || "")
  && /Rasterpunkt/.test(ACHSTREFFER?.testbitte || "")
  && /Zwischenspannpunkt-Editor/.test(ACHSTREFFER?.testbitte || ""));
ok("[#106] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Blech|Strichstärke|Spannplatte|Modul 7|Zeichnung|Montage|Menge|Preis|Kosten|Stückliste|Nachweis/i
    .test(ACHSTREFFER?.testbitte || ""));
// Der Darstellungsteil von #106 ist ausdruecklich NICHT geliefert und hat deshalb auch keinen
// eigenen Eintrag: genau einer fuer dieses Issue.
// #106 hat ZWEI Eintraege, weil es zwei getrennte Nutzerergebnisse waren: die Achsen, die dort
// treffen und sich verschieben lassen (Bedienteil), und die Bauteildarstellung selbst.
ok("genau drei Eintraege fuer Issue 106 — Ansichtsmasstab, Bauteilsymbole und Bedienteil",
  EINTRAEGE.filter(e => e.issue === 106).map(e => e.id).join(",")
    === "chg-20260908-23,chg-20260908-22,chg-20260907-09");

// Davor liegt die Baugruppe „Wandabschluss" in der Standardkatalog-Vorlage samt ihrer
// Aufloesung in der Stueckliste (#94) — sie wird ueber ihre ID gesucht, weil sie nicht mehr der
// neueste Eintrag ist. Ihre Aussagen bleiben inhaltlich unveraendert gueltig: geliefert war die
// Baugruppe im mitgelieferten Katalog UND die Aufloesung in Einzelteile in der
// Stueckliste — bei UNVERAENDERTEN Mengen. Ausdruecklich NICHT versprochen werden geaenderte
// Mengen oder Preise, eine Baugruppenansicht/-hierarchie in einer Ausgabe, verschachtelte
// Baugruppen oder das Default-Set Deckenanschluss: die bleiben in diesem Stand offen.
const AUFLOESUNG = EINTRAEGE.find(e => e.id === "chg-20260907-08");
ok("[#94] die aufgeloeste Baugruppe „Wandabschluss“ steht unveraendert in der Liste",
  AUFLOESUNG?.issue === 94
  && AUFLOESUNG?.typ === "feature" && AUFLOESUNG?.datum === "2026-09-07");
ok("[#94] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Standardkatalog/.test(AUFLOESUNG?.titel || "")
  && /Wandabschluss/.test(AUFLOESUNG?.titel || "")
  && /Stückliste/.test(AUFLOESUNG?.titel || "")
  && /Einzelteile/.test(AUFLOESUNG?.titel || "")
  // Keine Zusage zu Preisen, Hierarchie oder weiteren Baugruppen.
  && !/Preis|Hierarchie|verschachtel|Deckenanschluss|Montage|Zeichnung/i
       .test(AUFLOESUNG?.titel || ""));
ok("[#94] die Testbitte fuehrt den echten Bedienweg und nennt die drei Einzelteile",
  /Modul 0/.test(AUFLOESUNG?.testbitte || "")
  && /Modul 4/.test(AUFLOESUNG?.testbitte || "")
  && /Spannplatte/.test(AUFLOESUNG?.testbitte || "")
  && /Unterlegscheibe/.test(AUFLOESUNG?.testbitte || "")
  && /Spannmutter/.test(AUFLOESUNG?.testbitte || "")
  && /unverändert/.test(AUFLOESUNG?.testbitte || ""));
ok("[#94] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Preis|Kosten|Hierarchie|verschachtel|Deckenanschluss|Nachweis/i
    .test(AUFLOESUNG?.testbitte || ""));

// Davor liegen die Handbuchregeln zu den Einbaulagen des Spannsystems (#92) — sie zaehlen
// ab hier ueber `HANDBUCHREGELN`. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH die Regelwerks-
// Nachfuehrung im Handbuch — die beiden dauerhaften Kennungen [A-19] (Beginn der ersten
// Gewindestange am Wandfuss) und [Z-8] (Bezugspunkt des Ueberstands) samt Katalog als einziger
// Massquelle. Ausdruecklich NICHT geliefert werden eine geaenderte Rechnung, eine geaenderte
// Menge oder ein geaenderter Preis, ein neues Bedienelement, ein Mass in der Standardkatalog-
// Vorlage oder eine Darstellung der Einbaulagen in Zeichnung und Montage: die bleiben offen.
//
// Fuer Issue 92 gibt es bereits aeltere Eintraege — eine "genau ein Eintrag"-Pruefung waere hier
// also falsch und steht bewusst nicht da.
const HANDBUCHREGELN = EINTRAEGE.find(e => e.id === "chg-20260907-07");
ok("[#92] die Handbuchregeln zu den Einbaulagen sind der neueste Eintrag",
  HANDBUCHREGELN?.id === "chg-20260907-07" && HANDBUCHREGELN?.issue === 92
  && HANDBUCHREGELN?.typ === "doku" && HANDBUCHREGELN?.datum === "2026-09-07");
ok("[#92] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Regelwerk/.test(HANDBUCHREGELN?.titel || "")
  && /Gewindestange/.test(HANDBUCHREGELN?.titel || "")
  && /Überstand/.test(HANDBUCHREGELN?.titel || "")
  // Keine Zusage zu Rechnung, Menge, Preis, Bedienelement, Katalogvorlage oder Darstellung.
  && !/Menge|Stückliste|Preis|Eingabefeld|Standardkatalog|Zeichnung|Montage|Migration|migriert/i
       .test(HANDBUCHREGELN?.titel || ""));
ok("[#92] die Testbitte nennt den Fundort, beide Kennungen und die Massquelle",
  /Handbuch/.test(HANDBUCHREGELN?.testbitte || "")
  && /16\.3/.test(HANDBUCHREGELN?.testbitte || "")
  && /16\.7/.test(HANDBUCHREGELN?.testbitte || "")
  && /\[A-19\]/.test(HANDBUCHREGELN?.testbitte || "")
  && /\[Z-8\]/.test(HANDBUCHREGELN?.testbitte || "")
  && /Katalog/.test(HANDBUCHREGELN?.testbitte || ""));
ok("[#92] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  // Dass sich in der App nichts aendert, wird ausdruecklich gesagt statt verschwiegen.
  /(ändert sich nichts|unverändert|unveraendert|bleiben gleich)/.test(HANDBUCHREGELN?.testbitte || "")
  && !/Menge|Preis|Stückliste|Standardkatalog|Zeichnung|Montage|Migration|migriert/i
       .test(HANDBUCHREGELN?.testbitte || ""));

// Davor liegt das Ausgleichsblech unter dem Bodenblech (#96) — es wird als
// einziges direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins
// nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH das Bauteil als eigene
// Verwendungsrolle im Bauteilkatalog — waehlbar in Modul 1 (Gruppe Anschluss) und mit dem
// mitgelieferten Standardkatalog auf das vorlaeufige Blech 100 x 20 x 8 mm vorbelegt.
// Ausdruecklich NICHT geliefert werden eine Stuecklistenposition oder Menge fuer das
// Ausgleichsblech, eine Verteilregel fuer die Ausgleichspunkte, eine geaenderte Menge oder ein
// geaenderter Preis einer anderen Position, eine Darstellung in Zeichnung oder Montagegrafik
// oder eine Katalogmigration.
const AUSGLEICH = EINTRAEGE.find(e => e.id === "chg-20260907-06");
ok("[#96] das Ausgleichsblech im Bauteilkatalog ist der neueste Eintrag",
  AUSGLEICH?.id === "chg-20260907-06" && AUSGLEICH?.issue === 96
  && AUSGLEICH?.typ === "feature" && AUSGLEICH?.datum === "2026-09-07");
ok("[#96] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Ausgleichsblech/.test(AUSGLEICH?.titel || "")
  && /Bodenblech/.test(AUSGLEICH?.titel || "")
  && /(Katalog|Bauteil)/.test(AUSGLEICH?.titel || "")
  // Keine Zusage zu Menge, Position, Verteilung, Preis, Migration oder Darstellung.
  && !/Menge|Stückliste|Verteilung|Ausgleichspunkt|Preis|Migration|migriert|Zeichnung|Darstellung/i
       .test(AUSGLEICH?.titel || ""));
ok("[#96] die Testbitte fuehrt den echten Bedienweg (Auswahl in Modul 1, Gruppe Anschluss)",
  /Modul 1/.test(AUSGLEICH?.testbitte || "")
  && /Anschluss/.test(AUSGLEICH?.testbitte || "")
  && /Ausgleichsblech/.test(AUSGLEICH?.testbitte || "")
  // Der pruefbare Nutzerbefund ist die Vorbelegung mit dem vorlaeufigen Blechmaß.
  && /vorläufig/.test(AUSGLEICH?.testbitte || "")
  && /100/.test(AUSGLEICH?.testbitte || ""));
ok("[#96] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  // Mengen und Preise bleiben gleich — das wird gesagt, nicht als Neuerung versprochen.
  /(bleiben gleich|unverändert|unveraendert)/.test(AUSGLEICH?.testbitte || "")
  && !/Verteilung|Ausgleichspunkt|Migration|migriert|Zeichnung|Montageanleitung/i
       .test(AUSGLEICH?.testbitte || ""));

// Davor liegt die Unterlegscheibe des Wandabschlusses (#92) — sie wird als
// einzige direkt ueber seine Kennung geprueft. Aussagewahr heisst hier: geliefert ist
// AUSSCHLIESSLICH die neue Verwendungsrolle
// in Modul 1 (Gruppe Anschluss) und die eigene Stuecklistenposition in Modul 4 mit der Menge der
// Spannplatten. Ausdruecklich NICHT geliefert werden ein reales Bauteilmass, eine geaenderte
// Menge einer anderen Position, eine Katalogmigration oder irgendeine Darstellungsaenderung in
// Zeichnung und Montagegrafik.
//
// Fuer Issue 92 gibt es bereits aeltere Eintraege (`SECHSKANT`, `EINBAUHOEHE`, `EINBAULAGEN`,
// `SPANNPLATTE`, `KOPFBLECH`) — eine „genau ein Eintrag"-Pruefung waere hier also falsch und
// steht bewusst nicht da.
const SCHEIBE = EINTRAEGE.find(e => e.id === "chg-20260907-05");
ok("[#92] die Unterlegscheibe des Wandabschlusses folgt darauf",
  SCHEIBE?.id === "chg-20260907-05" && SCHEIBE?.issue === 92
  && SCHEIBE?.typ === "feature" && SCHEIBE?.datum === "2026-09-07");
ok("[#92] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Unterlegscheibe/.test(SCHEIBE?.titel || "")
  && /Wandabschluss/.test(SCHEIBE?.titel || "")
  && /Stückliste/.test(SCHEIBE?.titel || "")
  // Keine Zusage zu Bauteilmassen, Migration, Darstellung oder geaenderten Mengen/Preisen.
  && !/Bauteilmaß|Durchmesser|Migration|migriert|Zeichnung|Darstellung|Preis/i
       .test(SCHEIBE?.titel || ""));
ok("[#92] die Testbitte fuehrt den echten Bedienweg (Auswahl in Modul 1, Position in Modul 4)",
  /Modul 1/.test(SCHEIBE?.testbitte || "")
  && /Anschluss/.test(SCHEIBE?.testbitte || "")
  && /Unterlegscheibe/.test(SCHEIBE?.testbitte || "")
  && /Modul 4/.test(SCHEIBE?.testbitte || "")
  // Die Menge ist die der Spannplatten — genau das ist der pruefbare Nutzerbefund.
  && /Spannplatte/.test(SCHEIBE?.testbitte || ""));
ok("[#92] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  // Ohne gewaehltes Produkt bleibt der Preis OFFEN — das wird gesagt, nicht verschwiegen.
  /Preis offen/.test(SCHEIBE?.testbitte || "")
  && !/Bauteilmaß|Durchmesser|Migration|migriert|Zeichnung|Montageanleitung|Kosten/i
       .test(SCHEIBE?.testbitte || ""));

// Davor liegt der Rueckbau des Startachsen-Bedienfelds (#104) — er wird als
// einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um eins
// nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH der ersatzlose Rueckbau
// des Bedienfelds in Modul 1 und der Startachsenzeile im Zeichnungsblatt. Ausdruecklich NICHT
// geliefert wird eine geaenderte Achsverteilung (die kam mit chg-20260907-03), eine geaenderte
// Menge, ein geaenderter Preis oder eine Migration gespeicherter Werte.
const RUECKBAU = EINTRAEGE.find(e => e.id === "chg-20260907-04");
ok("[#104] der Rueckbau des Bedienfelds ist der neueste Eintrag",
  RUECKBAU?.id === "chg-20260907-04" && RUECKBAU?.issue === 104
  && RUECKBAU?.typ === "fix" && RUECKBAU?.datum === "2026-09-07");
ok("[#104] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Modul 1/.test(RUECKBAU?.titel || "")
  && /(entfernt|Auswahlfeld)/.test(RUECKBAU?.titel || "")
  && /(Vorspannachse|Zeichnung)/i.test(RUECKBAU?.titel || "")
  // Keine Zusage zu einer geaenderten Verteilung, zu Mengen/Preisen oder einer Migration.
  && !/Verteilung|Menge|Preis|Migration|i3|i2/i.test(RUECKBAU?.titel || ""));
ok("[#104] die Testbitte fuehrt den echten Bedienweg (Modul 1 und Zeichnungsblatt)",
  /Modul 1/.test(RUECKBAU?.testbitte || "")
  && /Zeichnung/i.test(RUECKBAU?.testbitte || "")
  && /Startachse|Vorspannachse/i.test(RUECKBAU?.testbitte || ""));
ok("[#104] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Migration|Preis|Kosten|Stückliste/i.test(RUECKBAU?.testbitte || "")
  // Achsen und Mengen aendern sich nicht — das darf gesagt, aber nicht als Neuerung
  // versprochen werden.
  && /unverändert|unveraendert/.test(RUECKBAU?.testbitte || ""));

// Davor liegt die Randregel der Spannachsen (#104) — sie wird ueber ihre ID gesucht, weil sie
// nicht mehr der neueste Eintrag ist. Ihre Aussagen bleiben inhaltlich unveraendert gueltig:
// geliefert war AUSSCHLIESSLICH die geaenderte Ableitung der automatischen Grundachsen im
// Rechenkern (mittig im i3, an einem i2-Wandrand auf der zweiten Rasterachse); der Rueckbau
// des Bedienelements kam erst mit chg-20260907-04.
const RANDACHSEN = EINTRAEGE.find(e => e.id === "chg-20260907-03");
ok("[#104] die Randregel der Spannachsen steht unveraendert in der Liste",
  RANDACHSEN?.issue === 104 && RANDACHSEN?.typ === "fix" && RANDACHSEN?.datum === "2026-09-07");
ok("[#104] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Spannachsen/.test(RANDACHSEN?.titel || "")
  && /i3/.test(RANDACHSEN?.titel || "")
  && /i2/.test(RANDACHSEN?.titel || "")
  && /zweite/i.test(RANDACHSEN?.titel || "")
  // Keine Zusage zu Bedienelement, Steinaufteilung, Mengen/Preisen oder Darstellung.
  && !/Startachse|Bedienfeld|Auswahlfeld|Menge|Preis|Steinaufteilung|Darstellung/i
       .test(RANDACHSEN?.titel || ""));
ok("[#104] die Testbitte fuehrt den echten Bedienweg und nennt beide Regelhaelften",
  /i3/.test(RANDACHSEN?.testbitte || "")
  && /i2/.test(RANDACHSEN?.testbitte || "")
  && /zweite/i.test(RANDACHSEN?.testbitte || "")
  && /(Wandanfang|Wandende)/.test(RANDACHSEN?.testbitte || ""));
ok("[#104] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Startachse|Bedienfeld|Auswahlfeld|entfernt|Preis|Kosten|Migration/i
    .test(RANDACHSEN?.testbitte || ""));
// Zwei Eintraege fuer #104: die Regelaenderung im Rechenkern und der spaetere Rueckbau des
// Bedienelements sind getrennte, je fuer sich pruefbare Lieferungen.
ok("genau zwei Eintraege fuer Issue 104 (Randregel und Rueckbau)",
  EINTRAEGE.filter(e => e.issue === 104).length === 2);

// Danach folgt die einheitliche Bezeichnung der Fussschraube (#92) — er wird als
// einziger direkt ueber seine Kennung geprueft; die bisherige Reihe rueckt geschlossen um
// eins nach hinten. Aussagewahr heisst hier: geliefert ist AUSSCHLIESSLICH die einheitliche
// BEZEICHNUNG in Stueckliste, Montageanleitung, Produktauswahl, Standardkatalog und Handbuch.
// Ausdruecklich NICHT geliefert werden eine geaenderte Menge, ein geaenderter Preis, eine
// Katalogmigration, eine neue Rolle (Unterlegscheibe), reale Bauteilmasse oder irgendeine
// Darstellungsaenderung in Zeichnung und Montagegrafik: die bleiben offen.
//
// Fuer Issue 92 gibt es bereits aeltere Eintraege (`EINBAUHOEHE`, `EINBAULAGEN`, `SPANNPLATTE`,
// `KOPFBLECH`) — eine „genau ein Eintrag"-Pruefung waere hier also falsch und steht bewusst
// nicht da.
const SECHSKANT = EINTRAEGE.find(e => e.id === "chg-20260907-02");
ok("[#92] die einheitliche Bezeichnung der Fußschraube ist der neueste Eintrag",
  SECHSKANT?.id === "chg-20260907-02" && SECHSKANT?.issue === 92
  && SECHSKANT?.typ === "fix" && SECHSKANT?.datum === "2026-09-07");
ok("[#92] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Wandfuß/.test(SECHSKANT?.titel || "")
  && /Sechskantschraube/.test(SECHSKANT?.titel || "")
  // Der abgeloeste Name wird benannt, damit die Aenderung wiedererkennbar ist.
  && /Senkkopfschraube/.test(SECHSKANT?.titel || "")
  // Keine Zusage zu Mengen/Preisen, Migration, weiteren Bauteilen oder Darstellung.
  && !/Menge|Preis|Migration|migriert|Unterlegscheibe|Bauteilmaß|Darstellung/i
       .test(SECHSKANT?.titel || ""));
ok("[#92] die Testbitte fuehrt den echten Bedienweg durch alle betroffenen Module",
  /Modul 4/.test(SECHSKANT?.testbitte || "")
  && /Modul 5/.test(SECHSKANT?.testbitte || "")
  && /Modul 1/.test(SECHSKANT?.testbitte || "")
  && /Stückliste/.test(SECHSKANT?.testbitte || "")
  && /Montageanleitung/.test(SECHSKANT?.testbitte || "")
  && /Wandfuß/.test(SECHSKANT?.testbitte || "")
  && /Sechskantschraube/.test(SECHSKANT?.testbitte || ""));
ok("[#92] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  // Mengen und Preise kommen vor — aber ausdruecklich als UNVERAENDERT, nicht als Neuerung.
  /Mengen und Preise bleiben gleich/.test(SECHSKANT?.testbitte || "")
  && /bestehende Kataloge und Projekte bleiben gültig/.test(SECHSKANT?.testbitte || "")
  && !/Unterlegscheibe|Migration|migriert|Zeichnung|Darstellung|Bauteilmaß|neue Rolle/i
       .test(SECHSKANT?.testbitte || ""));

// Darauf folgt die pflegbare Einbauhoehe eines Kleinteils (#92); sie zaehlt jetzt ueber
// seine Kennung, weil die Randregel der Spannachsen und die einheitliche Bezeichnung der
// Fussschraube davor getreten sind.
// Aussagewahr heisst hier: versprochen wird GENAU das Eingabefeld im
// Katalogdialog, dass ein dort eingetragener Wert erhalten bleibt (statt wie bisher als
// fachfremdes Feld entfernt zu werden) und dass Modul 1 die fehlende Hoehe danach nicht mehr
// meldet. Ausdruecklich NICHT versprochen werden ein gepflegtes Mass in der Standardkatalog-
// Vorlage, eine Stuecklisten-/Preis-/Mengenwirkung, weitere Bauteile (Unterlegscheibe,
// Sechskantschraube), eine geaenderte Zeichnung oder Handbuchregeln: die bleiben offen.
//
// Fuer Issue 92 gibt es bereits aeltere Eintraege (`EINBAULAGEN`, `SPANNPLATTE`, `KOPFBLECH`)
// — eine „genau ein Eintrag"-Pruefung waere hier also falsch und steht bewusst nicht da.
const EINBAUHOEHE = EINTRAEGE.find(e => e.id === "chg-20260907-01");
ok("[#92] die pflegbare Einbauhöhe eines Kleinteils folgt darauf",
  EINBAUHOEHE?.id === "chg-20260907-01" && EINBAUHOEHE?.issue === 92
  && EINBAUHOEHE?.typ === "fix" && EINBAUHOEHE?.datum === "2026-09-07");
ok("[#92] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Einbauhöhe/.test(EINBAUHOEHE?.titel || "")
  && /Bauteilkatalog/.test(EINBAUHOEHE?.titel || "")
  && /pflegbar/.test(EINBAUHOEHE?.titel || "")
  && /Modul 1/.test(EINBAUHOEHE?.titel || "")
  // Keine Zusage zu Stueckliste, Mengen/Preisen, weiteren Bauteilen, Darstellung oder
  // Katalogvorlage: die bleiben in diesem Stand unveraendert.
  && !/Stückliste|Menge|Preis|Unterlegscheibe|Sechskantschraube|Zeichnung|Montage|Handbuch|Standardkatalog/i
       .test(EINBAUHOEHE?.titel || ""));
ok("[#92] die Testbitte fuehrt den echten Bedienweg samt Wirkung in Modul 1",
  /Modul 0/.test(EINBAUHOEHE?.testbitte || "")
  && /Bauteilkatalog/.test(EINBAUHOEHE?.testbitte || "")
  && /Kopplungsmutter/.test(EINBAUHOEHE?.testbitte || "")
  && /Einbauhöhe/.test(EINBAUHOEHE?.testbitte || "")
  && /mm/.test(EINBAUHOEHE?.testbitte || "")
  && /speichern/.test(EINBAUHOEHE?.testbitte || "")
  // Der bisherige Verlust wird benannt: die Hoehe wurde als fachfremdes Feld entfernt.
  && /fachfremd/.test(EINBAUHOEHE?.testbitte || "")
  && /erhalten/.test(EINBAUHOEHE?.testbitte || "")
  && /Modul 1/.test(EINBAUHOEHE?.testbitte || ""));
ok("[#92] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Stückliste|Preis|Menge|Unterlegscheibe|Sechskantschraube|Zeichnung|Montage|Handbuch|Standardkatalog/i
    .test(EINBAUHOEHE?.testbitte || ""));

// Die Baugruppen im Bauteilkatalog (#94) ruecken um eins nach hinten und zaehlen ab hier
// ueber `BAUGRUPPEN`; die bisherige Reihe rueckt geschlossen mit. Aussagewahr heisst hier: versprochen wird GENAU das, was dieses erste Paket
// liefert — benannte Baugruppen im Katalog anlegen und pflegen (Produkt- und
// Rollenpositionen mit Menge) und der verlustfreie Export/Import. Ausdruecklich NICHT
// versprochen werden Stueckliste, Menge, Preis, eine Zuordnung an der Wand oder fertige
// Vorgaben im Standardkatalog: die bleiben in diesem Stand offen.
const BAUGRUPPEN = EINTRAEGE.find(e => e.id === "chg-20260906-02");
ok("[#94] die Baugruppen im Bauteilkatalog folgen darauf",
  BAUGRUPPEN?.id === "chg-20260906-02" && BAUGRUPPEN?.issue === 94
  && BAUGRUPPEN?.typ === "feature" && BAUGRUPPEN?.datum === "2026-09-06");
ok("[#94] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Baugruppen/i.test(BAUGRUPPEN?.titel || "")
  && /Bauteilkatalog/i.test(BAUGRUPPEN?.titel || "")
  // Keine Zusage zu Stueckliste, Mengen/Preisen, Wandzuordnung oder Standardkatalog.
  && !/Stückliste|Menge|Preis|Wand|Standardkatalog|Montage|Zeichnung/i
       .test(BAUGRUPPEN?.titel || ""));
ok("[#94] die Testbitte fuehrt den echten Bedienweg samt Roundtrip",
  /Modul 0/.test(BAUGRUPPEN?.testbitte || "")
  && /Bauteilkatalog/.test(BAUGRUPPEN?.testbitte || "")
  && /Baugruppen/.test(BAUGRUPPEN?.testbitte || "")
  && /[Pp]osition/.test(BAUGRUPPEN?.testbitte || "")
  && /Menge/.test(BAUGRUPPEN?.testbitte || "")
  && /exportieren/.test(BAUGRUPPEN?.testbitte || "")
  && /importieren/.test(BAUGRUPPEN?.testbitte || "")
  && /unverändert/.test(BAUGRUPPEN?.testbitte || ""));
ok("[#94] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Stückliste|Preis|Wandelement|Modul 4|Modul 1|Standardkatalog|verschachtel/i
    .test(BAUGRUPPEN?.testbitte || ""));
// Zwei Eintraege fuer #94 — und das ist richtig so: der erste (2026-09-06) betraf das
// Grundmodell im Katalog, der neue die Baugruppe der Vorlage samt ihrer Aufloesung in der
// Stueckliste. Zwei getrennte Nutzerergebnisse, zwei Commits, zwei Eintraege.
// Seit dem Ebenen-Nachweis sind es VIER Eintraege fuer #94 — und das ist richtig so:
// Grundmodell im Katalog (2026-09-06), Baugruppe der Vorlage samt Aufloesung in der
// Stueckliste (2026-09-07), ihre sichtbare Anzeige in Modul 4 und jetzt der Nachweis, dass
// die Aufloesung auf JEDER Stuecklistenebene dieselben Mengen liefert. Vier getrennte
// Nutzerergebnisse, vier Commits, vier Eintraege — in dieser Reihenfolge.
ok("genau vier Eintraege fuer Issue 94, neu vor alt",
  EINTRAEGE.filter(e => e.issue === 94).map(e => e.id).join(",")
    === "chg-20260909-09,chg-20260909-07,chg-20260907-08,chg-20260906-02");

// Die realen Einbaulagen des Spannsystems (#92) ruecken um eins nach hinten und zaehlen ab
// hier ueber `EINBAULAGEN`; die bisherige Reihe rueckt geschlossen mit. Aussagewahr heisst
// hier: versprochen wird GENAU der geaenderte
// STANGENBEDARF aus zwei Katalogmassen — unten die halbe Kopplungsmutterhoehe, oben die
// Spannplattendicke ueber der Steinoberkante — und die benannte Luecke, wenn ein Mass fehlt.
// Ausdruecklich NICHT versprochen werden Stueckliste/Positionen, Unterlegscheibe,
// Sechskantschraube, eine geaenderte Zeichnung/Darstellung, Handbuchregeln oder ein
// aktualisierter Standardkatalog: die bleiben in diesem Stand offen.
//
// Fuer Issue 92 gibt es bereits aeltere Eintraege (`SPANNPLATTE`, `KOPFBLECH`) — eine
// „genau ein Eintrag"-Pruefung waere hier also falsch und steht bewusst nicht da.
const EINBAULAGEN = EINTRAEGE.find(e => e.id === "chg-20260906-01");
ok("[#92] die realen Einbaulagen des Spannsystems folgen darauf",
  EINBAULAGEN?.id === "chg-20260906-01" && EINBAULAGEN?.issue === 92
  && EINBAULAGEN?.typ === "feature" && EINBAULAGEN?.datum === "2026-09-06");
ok("[#92] der Eintrag benennt Gegenstand und Nutzerergebnis",
  /Stangenbedarf/i.test(EINBAULAGEN?.titel || "")
  && /Kopplungsmutter/i.test(EINBAULAGEN?.titel || "")
  && /Spannplatte/i.test(EINBAULAGEN?.titel || "")
  // Keine Zusage zu Stueckliste, weiteren Bauteilen, Darstellung oder Katalogvorlage.
  && !/Stückliste|Position|Unterlegscheibe|Sechskantschraube|Zeichnung|Darstellung|Handbuch|Standardkatalog/i
       .test(EINBAULAGEN?.titel || ""));
ok("[#92] die Testbitte fuehrt den echten Bedienweg samt Fehlerpfad",
  /Modul 1/.test(EINBAULAGEN?.testbitte || "")
  && /Kopplungsmutter/.test(EINBAULAGEN?.testbitte || "")
  && /Spannplatte/.test(EINBAULAGEN?.testbitte || "")
  && /Einbauhöhe/.test(EINBAULAGEN?.testbitte || "")
  && /halbe Mutterhöhe/.test(EINBAULAGEN?.testbitte || "")
  && /Überstand/.test(EINBAULAGEN?.testbitte || "")
  // Der Fehlerpfad gehoert dazu: fehlendes Mass wird benannt, nichts wird geraten.
  && /[Ff]ehlt ein Maß/.test(EINBAULAGEN?.testbitte || "")
  && /benannt/.test(EINBAULAGEN?.testbitte || ""));
ok("[#92] die Testbitte verspricht nichts, was dieser Stand nicht liefert",
  !/Stückliste|Position|Preis|Unterlegscheibe|Sechskantschraube|Zeichnung|Handbuch|Standardkatalog|Montage/i
    .test(EINBAULAGEN?.testbitte || ""));

// Die gesammelten Zeichnungs-PDFs (#98) ruecken um eins nach hinten und zaehlen ab hier ueber
// `ZEICHNUNGSPDF`. Aussagewahr heisst hier: versprochen wird GENAU der eine ZIP-Download mit einer PDF
// je Geschoss, der Lageplan als erste Seite, die Wandblaetter dahinter und die Nennung eines
// fehlenden Wandelements vor dem Download; ausdruecklich NICHT versprochen werden ein
// geaendertes Blatt, ein anderer Masstab, ein anderes Papierformat, ein geaenderter
// Zeichnungsinhalt oder eine Aenderung am bestehenden Export/Projektarchiv.
const ZEICHNUNGSPDF = EINTRAEGE.find(e => e.id === "chg-20260905-01");
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
// Fuer Issue 98 gibt es seit der Korrektur aus #98/#107 GENAU ZWEI Eintraege: die Lieferung
// (feature, chg-20260905-01) und die Behebung des Tainted-Canvas-Fehlers samt Umzug in den
// Exportdialog (fix, chg-20260907-10). Mehr darf es nicht werden.
ok("genau zwei Eintraege fuer Issue 98 (Lieferung und Behebung)",
  EINTRAEGE.filter(e => e.issue === 98).map(e => e.id).join(",")
    === "chg-20260907-10,chg-20260905-01"
  && EINTRAEGE.filter(e => e.issue === 98).map(e => e.typ).join(",") === "fix,feature");

// Die browserhohe Blattvorschau (#99) rueckt um eins nach hinten und zaehlt ab hier ueber
// `VORSCHAUHOEHE`. Aussagewahr heisst hier: versprochen wird GENAU die Bildschirmhoehe des
// Vorschaubereichs in Modul 7 — in beiden Zustaenden (mit Zeichnung und ohne aktives
// Wandelement) — und dass das gedruckte Blatt einseitig bleibt; ausdruecklich NICHT
// versprochen werden ein anderes Blattformat, ein anderer Masstab, eine andere
// Blattgeometrie oder ein geaenderter Zeichnungsinhalt.
const VORSCHAUHOEHE = EINTRAEGE.find(e => e.id === "chg-20260904-12");
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
const STANDARDLAENGE = EINTRAEGE.find(e => e.id === "chg-20260904-11");
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
const KOPIERSCHUTZ = EINTRAEGE.find(e => e.id === "chg-20260904-10");
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

// Die Zwischenspannpunkte (#93) ruecken weiter nach hinten; die bisherige Reihe rueckt
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
// Angesetzt werden die vier Bezuege seit dieser Nachziehrunde ueber die KENNUNG ihres ersten
// Eintrags statt ueber eine feste Zahl: ein neuer Eintrag vorn verschiebt die Reihe sonst
// geschlossen, und jede Positionsaussage darunter waere still falsch. Die Aussagen selbst
// bleiben unveraendert — es ist genau derselbe Ausschnitt.
const VORHER = EINTRAEGE.slice(EINTRAEGE.findIndex(e => e.id === "chg-20260817-04"));
const NEU = EINTRAEGE.slice(EINTRAEGE.findIndex(e => e.id === "chg-20260816-10"));
const AKTUELL = EINTRAEGE.slice(EINTRAEGE.findIndex(e => e.id === "chg-20260816-05"));
const AELTER = EINTRAEGE.slice(EINTRAEGE.findIndex(e => e.id === "chg-20260814-02"));
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
// Danach folgen die Zwischenspannpunkte (#93). Aussagewahr heisst hier: versprochen wird die abgeleitete
// Vorgabe je Strang, die lagengenaue Bearbeitung und die Rueckkehr zu Auto; ausdruecklich
// NICHT versprochen werden Stueckliste, Menge, Preis, Katalogrolle oder Blechmasse — die
// bleiben in diesem Stand offen.
const ZWISCHEN = EINTRAEGE.find(e => e.id === "chg-20260904-09");
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
const SPANNPLATTE = EINTRAEGE.find(e => e.id === "chg-20260904-08");
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
const WANDAUSWAHL = EINTRAEGE.find(e => e.id === "chg-20260904-07");
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
const KOPFBLECH = EINTRAEGE.find(e => e.id === "chg-20260904-06");
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
const STOSS = EINTRAEGE.find(e => e.id === "chg-20260904-05");
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
const ZOOM = EINTRAEGE.find(e => e.id === "chg-20260904-04");
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

const VORRATSSATZ = EINTRAEGE.find(e => e.id === "chg-20260904-03");
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

// VIER Eintraege fuer #91 — und das ist richtig so, weil es vier getrennte
// Nutzerergebnisse mit vier getrennten Testbitten sind: chg-20260904-02 hat das Bodenblech
// im Rechenkern in reale Teile zerlegt, chg-20260904-03 bindet die KATALOGAUSWAHL daran an,
// chg-20260904-05 ZEIGT die Teile samt Stoessen in Montage und Zeichnung, und
// chg-20260908-30 macht die Stossmarke weiss und blechhoch und bringt die Aufteilung in
// die Wandansicht von Modul 1.
ok("alle vier #91-Eintraege stehen in der Liste, neu vor alt",
  EINTRAEGE.filter(e => e.issue === 91).map(e => e.id).join(",")
    === "chg-20260908-30,chg-20260904-05,chg-20260904-03,chg-20260904-02");

// Die Zerlegung im Rechenkern (#91, Kernpaket) folgt darauf.
const ZERLEGUNG = EINTRAEGE.find(e => e.id === "chg-20260904-02");
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
const GESCHOSSMENGE = EINTRAEGE.find(e => e.id === "chg-20260904-01");
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
const TEILAUSWAHL = EINTRAEGE.find(e => e.id === "chg-20260902-01");
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
const IMPORTDIALOG = EINTRAEGE.find(e => e.id === "chg-20260818-04");
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
const KOMMENTAR = EINTRAEGE.find(e => e.id === "chg-20260818-03");
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

const HERKUNFT = EINTRAEGE.find(e => e.id === "chg-20260818-02");
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

const VORSCHAU = EINTRAEGE.find(e => e.id === "chg-20260818-01");
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
const SEITEN = EINTRAEGE.find(e => e.id === "chg-20260817-08");
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
const BLASEN = EINTRAEGE.find(e => e.id === "chg-20260817-07");
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
const PLANKOPF = EINTRAEGE.find(e => e.id === "chg-20260817-06");
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
const LETZTER = EINTRAEGE.find(e => e.id === "chg-20260817-05");
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
