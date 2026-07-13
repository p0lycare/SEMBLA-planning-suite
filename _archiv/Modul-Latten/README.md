# Modul Latten — Innenausbau-UK (Holzlatten)

`SEMBLA_Latten_Planung.html` — eigenständige HTML-Datei, öffnet per Doppelklick. Plant die vertikalen Holzlatten der Innenausbau-Unterkonstruktion und erstellt eine saubere Stückliste — aufgesetzt auf die **lastabhängige Verbinderverteilung aus Modul 2**.

## Workflow
1. In **Modul 2** (Verbinder-Rechner) die Wand laden und die Last-/UK-Parameter einstellen → Button **„Layout JSON"** exportiert das Verbinder-Layout (`SEMBLA_Verbinder_Layout.json`).
2. Dieses Layout in der Latten-Planung laden. Lattenbreite (Standard 4 cm) und Lattenlänge (Standard 150 cm) sind einstellbar.

## Modell / Regeln
- Latten verlaufen **vertikal auf den Verbinderachsen** (Achse = eindeutige x-Position der Verbinder).
- **An Öffnungen abgeschnitten:** Pro Achse werden die soliden Intervalle ([0…H] minus Tür/Fenster) gebildet; Latten enden exakt an der Laibung und werden **nie über eine Öffnung gezogen** (unabhängig von der Lattenlänge).
- **Stöße zwischen zwei Verbindern (mittig), nie auf einem Verbinder.** Jede Latte ist an mindestens einem Verbinder fixiert; Stücklänge ≤ Lattenlänge.
- **Reststück-Optimierung:** Zuschnitt als 1D-Cutting-Stock (best-fit) — Reststücke werden über alle Achsen wiederverwendet, sodass der Bedarf an 1,5-m-Latten minimiert wird.

Hinweis zur Architektur: Das Modul rechnet **eigenständig** auf Basis des Modul-2-Layouts (das Öffnungen *und* Verbinder enthält) — Verbinderverteilung und Latten-Ableitung müssen nicht in einem Modul liegen. Eine Zusammenlegung wäre nur für ein *Co-Design* sinnvoll (Verbinderabstände gezielt für die Lattenstückelung optimieren) — optional.

## Ausgabe
- **Stückliste:** Anzahl 1,5-m-Latten (Bedarf), Latten-Stücke (Schnitte), verbaute Länge, Gesamtlänge, Verschnitt (m und %), Querschnitt.
- **Lattenbild:** Wand mit vertikalen Latten, Stoß-Markierungen, Verbinderpunkten und Öffnungen.
- **Exporte:** Zuschnittliste (CSV, je Stück) und Stückliste (CSV).

Beispiel (ref2, Tür, 2,0 × 2,6 m): 6 Achsen, 10 Latten-Stücke → **8 Latten à 1,5 m** dank Reststückverwertung, ~13 % Verschnitt.

- **Seitenbezug + Dämmpakete (Phase C)** — das geladene Layout trägt die Seite/Funktion (Anzeige). Auf der Fassadenseite werden **Dämmpakete je Gefach** (zwischen benachbarten Latten) berechnet: lichte Breite = Achsabstand − Lattenbreite, Dicke einstellbar; an Öffnungen geschnitten. Ausgabe: Dämmfläche, Gefache, Dicke + CSV-Export; im Lattenbild schraffiert dargestellt.

## Verifikation
`test-latten.mjs` (8 Checks): Achsen, max. Stücklänge, Stöße auf Verbindern, ≥2 Fixierungen, Bedarfs-Schranken, Verschnitt-Bilanz, CSV. `smoke_latten.mjs` (7 Checks): UI, Lattenbild, Parameter, Export. Das Test-Layout `layout_ref2.json` wurde direkt aus Modul 2 erzeugt (echte Verbinderverteilung).

## Dateien
- `SEMBLA_Latten_Planung.html` — das Tool
- `sembla-latten.mjs` — Planungs-Bibliothek · `test-latten.mjs` / `smoke_latten.mjs` — Tests
- `latten.template.html` + `build-latten.mjs` — Vorlage und Build · `layout_ref2.json` — Beispiel-Layout
