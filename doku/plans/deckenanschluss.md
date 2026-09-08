# Deckenanschluss: Katalog-Set, Verteilung mit Editiermodus, Darstellung und Stückliste

**Status:** abgestimmter Umsetzungsplan (Tibor, 2026-09-08) — **Paket 1 und 2 umgesetzt** (2026-09-08); Paket 3 offen
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
- Präzisierung 2026-09-08 (Paket 2): **Kandidat ist jede Spannachse** — auch eine, die unter
  einer Staffelstufe endet; maßgebend für die Punktzahl ist die **volle Wandlänge**, und eine
  **Staffelstufe bekommt keine eigene Anschlussebene**.
- Darstellung: **rotes Z-förmiges Baugruppensymbol**, immer oberer Schenkel nach links, unterer nach
  rechts; die Gewindestange bleibt im Vordergrund (#112); Legendentext „Deckenanschluss".
- Ausgabe nur in **Modul 1 und Modul 7**. Modul 5 ist ausdrücklich kein Ziel; Modul 3 (statische
  Kraftübergabe `e_W`, `V_Winkel`, `n_Winkel`) bleibt unverändert bestehen.
- Referenzskizze (lokal, gitignoriert):
  `doku/vertraulich/deckenanschluss/skizze-deckenanschluss-konzept-2026-09-08.jpg`

---

## Paket 1 – Bauteilkatalog: Rollen und Default-Set „Deckenanschluss"  ✅ umgesetzt (2026-09-08)

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

### Verbindliche Bauteilliste (Tibor, 2026-09-08) — je einem Anschlusspunkt

| Menge | Verwendungsstelle (Rolle) | Vorgabe |
|---|---|---|
| 1 | `spannplatte` | wie am Wandabschluss (Mehrfachverwendung, [P-21]) |
| 1 | `spannmutter` | wie am Wandabschluss |
| 1 | `dc_winkel_wand` | Deckenanschluss Winkel Wand, DC01 (1.0330), ZE25/25 |
| 1 | `dc_winkel_decke` | Deckenanschluss Winkel Decke, DC01 (1.0330), ZE25/25 |
| 2 | `dc_schraube` | Sechskantschraube M10 8.8 DIN 933, galvanisch verzinkt |
| 2 | `dc_scheibe` | Unterlegscheibe DIN 9021, galvanisch verzinkt |
| 2 | `dc_anker` | Fischer Hohldeckenanker FHY M8 |
| 2 | `dc_bohrschraube` | SHR-BSPL-SW8-(A3K)-5,5×32 (Würth 021405532) |
| 2 | `dc_scheibe_bohr` | DIN 9021 6,4 mm, SHB-DIN9021-140HV-(A2K)-D6,4 (Würth 04166) |

Eine gesonderte Mutter M10 gibt es **nicht** — die aus #95 vermutete Liste war weiter; maßgebend
ist allein diese Vorgabe.

### Umgesetzt

Sieben neue Verwendungsrollen in `docs/shared/sembla-katalog.js` (Modul 1, Gruppe „Anschluss",
je Stk, bepreist, ohne Maß-Diskriminator), sieben Vorlagenprodukte und die Baugruppe
`set-deckenanschluss` in `docs/vorlagen/SEMBLA_Standardkatalog.json`, Handbuchregel **[P-24]**,
Tests in `tests/module/test-katalog.mjs` sowie angepasste Erwartungen in `test-shared.mjs`,
`tests/module/smoke_start.mjs`, `smoke_katalog.mjs` und `smoke_geschossplan.mjs`.

### Offene Punkte aus Paket 1

- **Maße der beiden Winkel liegen nicht vor.** Die Kategorie „Blech/Platte" verlangt drei
  Pflichtmaße; die Vorlagenprodukte tragen 60 × 60 mm bei 2 mm als **ausdrücklich vorläufigen
  Platzhalter** (in Bezeichnung und Hinweis benannt, ohne jede Ableitung) — analog Spannplatte
  und Einlegeblech. Auch die Preise sind angenommene Beispielwerte. Korrektur ist ein reiner
  Katalog-Edit in Modul 10.
- **Die Baugruppe bleibt bewusst unaufgelöst,** solange der Rechenkern keine Anschlusspunkte
  führt: `semblaBomSets()` meldet sie benannt („keine bekannte Instanzquelle") und erfindet keine
  Menge; alle bestehenden Stücklistenmengen sind Position für Position unverändert (Drift-Test).
  Aufgelöst wird sie in Paket 3.

---

## Paket 2 – Core und Editiermodus in Modul 1  ✅ umgesetzt (2026-09-08)

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

### Umgesetzt

Regeln **[A-26]** (Verteilung) und **[A-27]** (Override) im Handbuch; im Rechenkern
`docs/shared/sembla-core.js` die reinen Funktionen `verteileDeckenanschluss()` und
`normDeckenanschluss()` samt der frisch gerechneten Liste `deckenanschlusspunkte`
(`{k, x_mm, art}`) und der Meldung `validation.deckenanschluss_fehler`; der Override lebt in
`prestress.deckenanschluss_grid` als Achsenraster-Indizes und reist über `psOf()`
(`sembla-engine.js`) durch jede Auslegungs-Iteration. Bit-gleiches Gegenstück im Python-Orakel
`tests/core/sembla_core.py`. In `docs/wandplanung.html` der vierte Editiermodus `dcEdit`
(eigener Kasten, Werkzeug-, Lösch- und Auto-Knopf, Griffe an der Wandoberkante, Fang **immer**
auf eine vorhandene Spannachse, Zustandshinweis, Warnzeile) — exklusiv zu `axisEdit`, `zpEdit`,
`agEdit` und dem Durchbruch-Modus, in beide Richtungen geprüft. Test-API `setDcEdit`,
`setManualDc`, `addDcAt`, `delDc`, `dcAuto`, `selDc`, `manualDc`, `dcEdit`,
`deckenanschlusspunkte`. Tests: Paritätsvertrag gegen das Orakel in
`tests/core/test-sembla-core.mjs` (8 Fälle), Editiermodus-Smoke über den echten Speicher-Lade-
Umlauf in `tests/module/smoke_wp.mjs` (25 Fälle); goldene Fixtures und
`docs/vorlagen/SEMBLA_Musterwand.json` rein **additiv** um das neue Feld erweitert.

### Fachentscheidungen dieses Pakets (Tibor, 2026-09-08)

- **Kandidatenmenge:** jede Spannachse aus `tension_columns` — Plantext wörtlich, keine
  Einschränkung auf Achsen an der Wandoberkante.
- **Staffelung:** nur die volle Wandhöhe zählt; Stufen-Oberkanten sind keine Deckenanschluss-Ebene.

### Offene Punkte aus Paket 2

- **Anschlusspunkt unter einer Staffelstufe.** Aus den beiden Entscheidungen zusammen folgt, dass
  eine Achse, die unter einer Stufe endet, einen Anschlusspunkt tragen kann, obwohl sie die Decke
  nicht erreicht. Das ist so gewollt und nicht kaschiert; **Paket 3** muss dafür festlegen, wie
  die Reduktion der Spannplatten-Menge und die Darstellung an einer solchen Achse aussehen.
- **Keine Mengenwirkung.** Die Baugruppe `set-deckenanschluss` bleibt weiterhin unaufgelöst
  (`semblaBomSets()` meldet sie benannt); alle Stücklistenmengen sind Position für Position
  unverändert. Aufgelöst wird sie in Paket 3.

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
