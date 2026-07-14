# SEMBLA Core — JavaScript-Portierung (Phase 2, Schritt 1)

Vanilla-JS-Portierung des getesteten Python-Cores. Läuft im Browser (ES-Modul) **ohne Build-Schritt** — passt damit direkt zum Stack des Verbinder-Rechners (einzelne HTML-Datei, reines JS, SVG-Rendering). Diese Datei wird die gemeinsame Logik für Modul 1 (Editor) und die Folgemodule.

## Parität als Vertrag

`sembla-core.mjs` erzeugt **bit-genau dasselbe Wandelement** wie `../Phase-1/sembla_core.py`. Bewiesen durch `test-sembla-core.mjs`: die drei Referenzwände werden gebaut und deep-equal gegen die goldenen Python-Fixtures (`fixtures/`) verglichen. Solange dieser Test grün ist, kann die JS-Logik die Python-Referenz nicht stillschweigend verlassen.

> Detail: Python rundet „half-to-even" — der JS-Port bildet das mit `pyRound()` nach, sonst würden einzelne Vorspannstränge abweichen.

## Nutzung

```html
<script type="module">
  import { buildWall, Opening, isBuildable } from "./sembla-core.mjs";

  const wand = buildWall("w1", 2000, 2600, [new Opening(5, 11, 0, 10, "tuer")]);
  if (isBuildable(wand)) renderSvg(wand);   // -> Modul 1
</script>
```

Strukturfehler werfen `InvalidDimensionError` / `InvalidOpeningError`; planerische Verstöße (N=4, Versatz) stehen in `wand.validation` (`buildable=false`).

## Tests

```
node test-sembla-core.mjs      # 16 Tests: Parität + Regeln + Fehlerfälle
```

## Modul 1 — Wand-Editor

`SEMBLA_Wandeditor.html` ist die fertige Oberfläche: eigenständige HTML-Datei im Stil des Verbinder-Rechners, **öffnet per Doppelklick** (kein Server, kein Build). Eingabe von Länge/Höhe und Öffnungen (Tür/Fenster); rendert Steinverband, Vorspannstränge und Stahlplatten als SVG, zeigt Stückliste und Validierung, exportiert das Wandelement als JSON (Übergabe an Module 2–4) und einen Plan als PNG.

Die Logik wird **nicht** doppelt gepflegt: `build-editor.mjs` fügt den getesteten `sembla-core.mjs` (export-bereinigt) in `editor.template.html` ein und erzeugt die fertige HTML. Damit ist die Editor-Logik bit-identisch zum Core.

```
node build-editor.mjs     # editor.template.html + sembla-core.mjs -> SEMBLA_Wandeditor.html
node smoke.mjs            # DOM-Smoke-Test: Rendering, Stückliste, Validierung (10 Checks)
```

## Dateien
- `SEMBLA_Wandeditor.html` — **fertiger Editor (Modul 1)**, per Doppelklick öffnen
- `sembla-core.mjs` — der portierte, getestete Core
- `test-sembla-core.mjs` — Paritäts-/Regeltests gegen die Fixtures (16 Checks)
- `editor.template.html` + `build-editor.mjs` — Vorlage und Build-Schritt des Editors
- `smoke.mjs` — DOM-Smoke-Test des Editors
- `fixtures/` — goldene Wandelemente aus Phase 1 (gemeinsamer Vertrag)

## Nächster Schritt
Modul 2 (Verbinder-Rechner) auf das exportierte Wandelement-JSON umstellen — statt eigener Eingaben liest er das in Modul 1 geplante Wandelement.
