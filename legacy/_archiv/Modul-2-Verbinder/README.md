# Modul 2 — Verbinder-Rechner (liest Wandelement)

`SEMBLA_Verbinder_Rechner_Modul2.html` — eigenständige HTML-Datei, öffnet per Doppelklick. Erweiterung des bestehenden Verbinder-Rechners, die das in **Modul 1** geplante Wandelement konsumiert.

## Was neu ist

- **„Wandelement (JSON) laden"** — lädt die aus Modul 1 exportierte Datei. Länge und Höhe werden übernommen und gesperrt; der Editor zeigt Name, Maße und Anzahl Öffnungen.
- **Echter Verband** — gezeichnet wird der i3-maximierte Steinverband aus dem Wandelement, nicht mehr ein eigener vereinfachter. So zeigt der Verbinderplan exakt die geplante Wand.
- **Öffnungen** — Türen/Fenster werden dargestellt; Verbinder, die in einer Öffnung lägen, werden **weggelassen** (dort ist keine Wand). Die Stück/m²-Dichte rechnet mit der Netto-Wandfläche.
- **Laibungs-Anschluss** — neben jeder Tür/jedem Fenster wird **zwingend eine Verbinderachse über die volle Höhe** gesetzt, damit die Fassaden-UK an der Laibung Anschluss hat. Diese Achse sitzt auf der **Nut im Pfeiler, ein Raster (12,5 cm) neben der Öffnung** — nicht auf der Reveal-/Steinkante, dort gibt es keine Nut. Nuten sind die inneren Stege auf dem 12,5-cm-Raster (i3 hat 2, i2 hat 1). Beispiel Tür: Laibungsachse bei 50 cm (links) und 150 cm (rechts). Das reguläre UK-Raster bleibt unverändert.
- **Gleichmäßige Verteilung je Wandabschnitt** — die UK-Achsen werden **pro Wandabschnitt zwischen den Öffnungen** (und zwischen Öffnung und Wandende) gleichmäßig verteilt, verankert an Wandende bzw. Laibungsnut. Dadurch keine Achsen-Cluster mehr (wie zuvor links neben der Tür) und keine durchgehenden Achsen quer durch die Öffnung. Voreinstellung „gleichmäßig".
- **Sturz- & Brüstungs-Anschluss** — über jeder Öffnung wird der Bereich **bis zum oberen Wandende** mit Verbindern belegt (Sturz + alle Lagenreihen darüber), bei Fenstern zusätzlich der Bereich **bis zum unteren Wandende** (Brüstung + alle Lagenreihen darunter). So ist die UK auch über Türen und über/unter Fenstern bis an die Wandenden angeschlossen. Die Verbinder liegen auf den Nuten, die die Öffnung überspannen (durchgehende Nuten / querende UK-Achsen).

Last- und Verbinder-Eingaben (Windsog, Fassadengewicht, Auszugslast, UK-Raster …) bleiben manuell — sie sind Fassaden-/Verbinderdaten, nicht Teil der Wandgeometrie. Das Fassaden-Nutenmodell (durchgehende/versetzte Nut) ist unverändert.

**Fallback:** Ohne geladenes Wandelement verhält sich das Tool wie der ursprüngliche Verbinder-Rechner (manuelle B/H, eigener Verband).

- **Seiten-bewusst (Phase B)** — Wand-Seite (Vorder-/Rückseite) wählbar; die Rückseite wird **gespiegelt** dargestellt. Ein **Verbinder-Typen-Katalog** (Traglast R_k je Typ, z. B. Fassadenanker vs. leichter Innenanker) setzt R_k/γ_M; je Seitenfunktion wird ein Default-Typ vorgeschlagen. Das exportierte Layout-JSON ist mit **Seite, Funktion und Verbinder-Typ** getaggt.

## Verifikation
`smoke_m2.mjs` (DOM-Stub, 10 Checks): Maße/Sperre aus JSON, Verband & Öffnung gezeichnet, kein Verbinder in der Öffnung, Stückzahl sinkt korrekt (Beispiel ref2: 52 → 42 mit Tür).

## Dateien
- `SEMBLA_Verbinder_Rechner_Modul2.html` — das Tool
- `smoke_m2.mjs` + `ref2.json` — Smoke-Test und Test-Wandelement

## Workflow
Modul 1 (Wand-Editor) → „Wandelement (JSON)" exportieren → in Modul 2 laden → Verbinder rechnen.
