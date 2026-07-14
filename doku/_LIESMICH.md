# SEMBLA Planungs-Suite

## Einstieg (für Planer/Architekten)
**Ordner `SEMBLA Werkzeuge/` öffnen und `00_Übersicht.html` doppelklicken.**
Dort sind alle Werkzeuge nummeriert (1–9) und verlinkt. Das ist der einzige
Einstiegspunkt, den Endnutzer brauchen. `00_Handbuch.docx` erklärt die Module und
Berechnungen im Detail.

Roter Faden: **Modul 1 (Wand planen & auslegen)** erzeugt das geprüfte
*Wandelement* (JSON). Alle anderen Module lesen genau dieses Element.

## Werkzeuge
1. Wand planen & auslegen · 2. Horizontaler Wandaufbau (Verbinder + Latten/Dämmung)
· 3. Montageplanung · 4. Roboter-Export · 5. Projekt-Manager (DXF/IFC)
· 6. Statik-Anschlüsse · 7. 3D-Vorschau · 8. Stückliste & Kosten · 9. Fertigungszeichnung

(Die früheren getrennten Module „Verbinder" und „Latten + Dämmung" sind in Modul 2
zusammengefasst; abgelöste Stände liegen im Ordner `_archiv/`.)

## Für Entwickler
- Die Tools werden aus Kernen + Templates gebaut (`build-*.mjs`), Kerne sind
  getestet (Python-Referenz + JS-Parität).
- Nach Änderungen an einem Tool: **`node publish-werkzeuge.mjs`** im Suite-Root
  ausführen — spiegelt alle aktuellen HTMLs in `SEMBLA Werkzeuge/` (verhindert,
  dass Dev-Stand und Endnutzer-Ordner auseinanderlaufen).
- Tests je Modul: `node <Ordner>/smoke_*.mjs` bzw. `test-*.mjs`,
  Core: `python3 Phase-1/test_sembla_core.py` und `node Phase-2/test-sembla-core.mjs`.
- Bauteilgeometrie (i2/i3) liegt in `Bauteil-OBJ/` (OBJ + IFC FacetedBrep).

## Aufräumen
Der Ordner **`SEMBLA Tools/` ist veraltet** (alte, anders benannte Stände) und
kann im Explorer gelöscht werden. Maßgeblich ist ausschließlich `SEMBLA Werkzeuge/`.
