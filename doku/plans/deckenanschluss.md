# Deckenanschluss: Katalog-Set, Verteilung mit Editiermodus, Darstellung und Stückliste

**Status:** abgestimmter Umsetzungsplan (Tibor, 2026-09-08) — **noch nichts umgesetzt**
**Issues:** #95 (Verteilung, Editiermodus, Baugruppe) · #94 (Sets im Bauteilkatalog) · #97 (Zeichnungssymbole)
**Ziel:** Der Deckenanschluss wird ein vollständig geplantes Bauteil: als Baugruppe im Bauteilkatalog,
regelbasiert auf Spannachsen verteilt und manuell bearbeitbar, in Modul 1 und Modul 7 sichtbar und in
der Stückliste mit allen Einzelteilen ausgewiesen.

Die Umsetzung erfolgt in **drei getrennten Paketen — je eine eigene Session mit eigenem Commit**.

## Vorhandener Stand, auf dem aufgesetzt wird

- `docs/shared/sembla-katalog.js`: Baugruppen (`katalog.sets`), Validierung, Katalogformat v2 mit
  Migration ([P-21], [P-22]) sind fertig; gepflegt wird im Katalog-Modul 10 (`docs/katalog.html`).
- `docs/shared/sembla-bom.js`: Auflösung der Baugruppen an **genau einer** Stelle in
  `semblaBomItems()` ([P-23]); `SET_INSTANZQUELLE` kennt bisher nur `set-wandabschluss` →
  Core-Feld `spannplatten`.
- `docs/wandplanung.html`: drei fertige Editiermodi als Muster — `axisEdit` (Spannachsen),
  `zpEdit` (Zwischenspannpunkte, #93), `agEdit` (Ausgleichspunkte, #96). Der Deckenanschluss
  wird der **vierte** und ist zu allen anderen exklusiv.
- `docs/shared/sembla-core.js`: Override-Muster „nur manuelle Werte speichern, nie das
  Auto-Ergebnis" bei `prestress.columns_grid` und `prestress.zwischenpunkte_mm` ([V-9]).

## Verbindliche Fachregeln (aus #95 / #97, Präzisierung 2026-09-08)

- An einer oberen Spannachse gibt es **genau eine von zwei Ausführungen**: Set „Wandabschluss"
  **oder** Set „Deckenanschluss" — niemals beide, der Deckenanschluss ist kein Zusatz.
- Set „Wandabschluss": Spannplatte + Spannmutter (steht bereits in der Standardkatalog-Vorlage).
- Set „Deckenanschluss": Spannplatte + Spannmutter + weitere Deckenanschlussteile — **Liste nennt
  Tibor verbindlich, es wird nichts geraten.**
- Anschlusspunkte liegen **immer auf einer Spannachse**; nicht jede Spannachse ist Anschlusspunkt.
- Auto-Verteilung bewusst simpel, **keine Statik**: ein Deckenanschluss pro Meter Wandlänge,
  End-/Randachsen zählen mit. Derzeit gibt es keine Wände ohne Deckenanschluss.
- Darstellung: **rotes Z-förmiges Baugruppensymbol**, immer oberer Schenkel nach links, unterer nach
  rechts; die Gewindestange bleibt im Vordergrund (#112); Legendentext „Deckenanschluss".
- Ausgabe nur in **Modul 1 und Modul 7**. Modul 5 ist ausdrücklich kein Ziel; Modul 3 (statische
  Kraftübergabe `e_W`, `V_Winkel`, `n_Winkel`) bleibt unverändert bestehen.
- Referenzskizze (lokal, gitignoriert):
  `doku/vertraulich/deckenanschluss/skizze-deckenanschluss-konzept-2026-09-08.jpg`

---

## Paket 1 – Bauteilkatalog: Rollen und Default-Set „Deckenanschluss"  ⬜ offen

**Nutzerergebnis:** Der Standardkatalog enthält die Baugruppe „Deckenanschluss" mit allen
Einzelteilen; im Katalog-Modul 10 ist sie sichtbar und pflegbar.

### Umfang

1. Neue **Verwendungsrollen** in `ROLLEN` (`docs/shared/sembla-katalog.js`), Modul 1, Gruppe
   „Anschluss" — je Rolle: Kategorie, Einheit, `mass` (in der Regel `null`, kein erfundener
   Wandbezug), `bepreist`, `waehlbar`, Hinweistext mit Herkunft und Vorläufigkeit der Maße.
2. **Baugruppe `set-deckenanschluss`** in der Standardkatalog-Vorlage
   `docs/vorlagen/SEMBLA_Standardkatalog.json` (Format v2): Spannplatte, Spannmutter und die
   weiteren Teile, je Position mit Menge **je Anschlusspunkt**.
3. Standardprodukte je neuer Rolle in der Vorlage anlegen, Maße als **„vorläufig"** gekennzeichnet
   (analog Einlegeblech/Ausgleichsblech); Preise nur, wo real bekannt.
4. **Handbuch zuerst** (`build-handbuch.mjs`): neue dauerhafte Regel für das Default-Set
   „Deckenanschluss" und die Exklusivität der beiden oberen Ausführungen; `npm run handbuch`.
5. Tests: Set-Validierung, Katalog-Export/Import-Roundtrip, Vorlagenprüfung.

### Nicht in diesem Paket

Verteilung, Editiermodus, Symbol, Stücklistenmengen.

### Offener Input von Tibor (blockiert den Start)

Bauteilliste je **einem** Deckenanschlusspunkt, pro Zeile: Bezeichnung · Menge je Punkt · Maße
(auch „vorläufig") · in Modul 1 wählbar oder reiner Baustellenbedarf ([P-18]).
Aus #95 als Vermutung genannt, **noch unbestätigt**: Winkel Decke, Winkel Wand, Sechskantschraube
M10, Unterlegscheibe, Mutter M10, Hohldeckenanker FHY M8, Bohrschraube.

---

## Paket 2 – Core und Editiermodus in Modul 1  ⬜ offen

**Nutzerergebnis:** Jede Wand erhält automatisch Deckenanschlusspunkte auf Spannachsen; Planer*innen
können sie in Modul 1 hinzufügen, verschieben, löschen und auf Auto zurücksetzen.

### Umfang

1. **Auto-Verteilung** im Rechenkern (`docs/shared/sembla-core.js`): Anzahl = `ceil(Wandlänge / 1 m)`,
   mindestens 1 (auch bei Wand < 1 m), Auswahl **nur** aus `tension_columns`, möglichst gleichmäßig,
   erste und letzte Achse bevorzugt — deterministisch und dokumentiert.
2. **Manuelle Overrides** in `prestress.deckenanschluss_grid` (Achsenraster-Indizes, Muster
   `columns_grid`): nur manuelle Punkte werden gespeichert, das Auto-Ergebnis nie ([P-6], [V-9]);
   gesetzter Override sperrt die Auto-Verteilung. Überleben Speichern/Laden.
3. **Editiermodus `dcEdit`** in `docs/wandplanung.html` analog `axisEdit`/`zpEdit`/`agEdit`:
   eigener Werkzeugknopf, exklusiv zu allen anderen Modi, hinzufügen **nur auf einer Spannachse**,
   verschieben (Fang auf Spannachsen), löschen per Doppelklick, „Zurück zu Auto".
4. Testbare API an `window.__wp` erweitern (`setDcEdit`, `addDcAt`, `delDc`, `manualDc`).
5. **Python-Orakel** paritätisch nachziehen; Handbuch: Regeln für Verteilung, Vorrang manueller
   Punkte und Abgrenzung zur Statik (Modul 3 unverändert).
6. Tests: Verteilregel inkl. kurzer Wand, Determinismus, Core↔Orakel-Parität, Editiermodus-Smoke-Test.

### Nicht in diesem Paket

Symbol und Stücklistenmengen.

---

## Paket 3 – Darstellung in Modul 1 und 7 und Stückliste  ⬜ offen

**Nutzerergebnis:** Der Deckenanschluss ist in Wandansicht und technischer Zeichnung als rotes
Z-Symbol zu sehen und steht mit allen Einzelteilen in der Stückliste.

### Umfang

1. **Symbol genau einmal** im gemeinsamen Darstellungsschlüssel `docs/shared/sembla-montage.js`
   ([D-4]): rotes Z, oberer Schenkel links, unterer rechts, feste Maße wie die übrigen
   Bauteilsymbole; kein modul-eigener zweiter Schlüssel.
2. **Leser**: Modul 1 (`docs/wandplanung.html`) und Modul 7 / zentraler Export
   (`docs/shared/sembla-zeichnung.js`) — nur an den Anschlussachsen, Gewindestange im Vordergrund
   (#112). Legenden beider Ausgaben ergänzen, Schwarz-Weiß-Druck bleibt lesbar.
3. **Stückliste**: `SET_INSTANZQUELLE["set-deckenanschluss"]` auf die Zahl der Anschlusspunkte;
   die Instanzquelle des Sets „Wandabschluss" (`spannplatten`) um genau diese Achsen **reduzieren**,
   damit keine Achse doppelt gezählt wird. Auflösung bleibt an der einen Stelle in
   `semblaBomItems()` ([P-23]), Ausgabe bleibt flach ([P-19]).
4. Drift-Test: Modul 4, zentraler Export, Gesamtstückliste und Zeichnungsblatt liefern identische
   Mengen; Regressionstests der Ausgaben anpassen.

### Ergebnis

Mit diesem Paket sind #95 und der Deckenanschluss-Teil von #97 erledigt; #94 kann geschlossen werden,
sobald auch der Drift-Test über die Gesamtstücklisten läuft.
