# Auslegungs-Engine — Statik-Iterationsschleife (Grundgerüst)

Erster Umsetzungsschritt der Architektur-Weiterentwicklung: Die Vorspannung ist nicht mehr fixe Regel, sondern **Auslegungsparameter**; eine Engine schließt die Schleife zwischen Aufbau und Statik.

## Architektur in Schichten
1. **Reine Bibliotheken (einbahnig, getestet):**
   - `../Phase-2/sembla-core.mjs` — `buildWall(..., prestress)` baut das Wandelement. Vorspannung jetzt parametrisch: `prestress = { max_span_grid, force_kN }`. Das Wandelement trägt den verwendeten `prestress`-Block.
   - `../Modul-3-Statik/sembla-statik.mjs` — `vorspannBiegung(...)`: vorspann-abhängiger Nachweis (klaffende Fuge / Kernmoment): Druck σ = N_ges/(L·t), Widerstand M_R = σ·W, Einwirkung M_Ed = q·L·H²/8.
2. **Engine (Mediator, kennt als Einzige die Iteration):** `sembla-engine.mjs` → `autoAuslegung(vorgaben)`.
3. **Konsumenten** (Verbinder, Latten, Montage, BIM, Roboter) sehen nur das **konvergierte, geprüfte** Wandelement.

## Die Schleife
```
Vorgaben → [ Core: Wandelement bauen → Statik: Nachweis → Auslastung>1 ? Vorspannung verfeinern : fertig ] → geprüftes Wandelement → Konsumenten
```
`autoAuslegung` variiert den Strangabstand grob→fein (`max_span_grid` 3→2→1 = mehr Stränge = mehr Druckvorspannung), bis der Biegenachweis erfüllt ist. Ergebnis:
- `status`: `konvergiert` | `nicht erfüllt`
- `wandelement.verification`: `{ status, auslegung:{max_span_grid, force_kN, strands}, vorspann_biegung:{σ, M_R, M_Ed, util, ok}, iterationen }`
- `iterationen`: Protokoll je Versuch (Provenienz).

So bleibt das Wandelement die Single Source of Truth — jetzt zusätzlich **nachvollziehbar geprüft**. Keine Zyklen zwischen Modulen; nur die Engine orchestriert.

## Beispiel (Iterationsprotokoll, hohe Last)
```
sp=3  Stränge=6   util=2.028  —
sp=2  Stränge=9   util=1.352  —
sp=1  Stränge=16  util=0.761  OK
```

## Ausbau-Stand (umgesetzt)
- **Nachweismodell vervollständigt:** drei vorspann-abhängige Nachweise — Biegung (klaffende Fuge), Randdruck (σ ≤ f_cd), Schub/Reibung (V_Ed ≤ C·(N+G)). `nachweiseWand()` liefert den **maßgebenden**. Materialannahmen (f_cd, C_f,d, ρ) sind Parameter (Platzhalter, vom Statiker zu bestätigen).
- **N-Optimierung:** `autoAuslegung` sucht jetzt Strangabstand **und** Vorspannkraft N → minimaler Materialeinsatz (zuerst wenige Stränge, dann kleinste passende Kraft), bis alle Nachweise erfüllt sind.
- **Zwei Modi:** Auto-Auslegung (optimieren) und `nachweisPruefen` (feste Auslegung nur prüfen — manuelle Übersteuerung).
- **Nachweisprotokoll:** druckbarer Kurzbericht (Formeln, Einwirkung/Widerstand, Auslastung, Material) aus dem `verification`-Block.
- **Editor-Roundtrip:** Modul 1 lädt ein geprüftes Wandelement (Maße, Seiten, Öffnungen, Vorspannung) und zeigt den Nachweis-Status; eine Geometrie-Änderung verwirft die Prüfung sichtbar.

## Bedien-Oberfläche
`SEMBLA_Auslegung.html` (per Doppelklick) macht die Schleife sichtbar: Vorgaben (Länge/Höhe, Seiten, Last, Vorspannkraft) → **Auslegen** → das **Iterationsprotokoll** zeigt jeden Versuch (Strangabstand → Stränge → Auslastung → erfüllt?), dazu Nachweis (σ, M_R, M_Ed, Auslastung, Status) und das konvergierte Wandbild. Export: **geprüftes Wandelement (JSON)** für die Konsumenten. Build: `node build-engine-ui.mjs` (bündelt Core+Statik+Engine inline), Smoke: `node smoke_engine_ui.mjs` (9 Checks).

## Nächste Ausbaustufen
- Zweite Entwurfsvariable **Vorspannkraft N** in die Suche aufnehmen (Material/Kosten minimieren statt nur „erfüllt").
- Weitere Nachweise einkoppeln (Schub/Randdruck), Lastfälle je Seite.
- Engine als UI-Modul (Eingabe Vorgaben → Auto-Auslegung → geprüftes Wandelement exportieren).

## Tests
`node test-engine.mjs` — 8 Checks: Konvergenz bei niedriger Last, mehr Iterationen/Stränge bei hoher Last, „nicht erfüllt" bei Überlast, Nachweis-Provenienz im Wandelement, Entlastung durch höhere Vorspannkraft.

## Dateien
- `sembla-engine.mjs` — die Engine · `test-engine.mjs` — Tests
- nutzt die geteilten reinen Bibliotheken aus `Phase-2/` und `Modul-3-Statik/`
