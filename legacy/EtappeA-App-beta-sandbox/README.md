# Etappe-A App — BETA · SANDBOX

Experimentierstand für **Etappe A** der Vision aus `SEMBLA_OSS_Bewertungsmatrix` (Teil 2):
die durchgängige Web-App. Bewusst **isoliert** vom stabilen Suite-Stand im übergeordneten
Ordner — hier wird ausprobiert, nichts Produktives.

> ⚠️ **Nicht für produktive Nachweise.** Die App trägt oben ein Beta/Sandbox-Banner.
> Die stabile, getestete Suite (Module 1–9, Handbuch) liegt eine Ebene höher.

## Was der erste Schritt kann (MVP)
Lokal-first, **build-freie Single-File-App** (per Doppelklick lauffähig) auf der
**bestehenden Core-Engine** (Tiling/Vorspannung/BOM) und dem **Schermer-Statik-Kern** (Modul 6):

- **Projekt** anlegen mit Kopfdaten (Bauherr, Phase, Plan-Nr.).
- **Wand-Editor (Modul-1-Niveau)** — vollwertige Wände direkt in der App: Name, Länge, Höhe;
  beliebig viele **Öffnungen** (Tür / Fenster mit Brüstung / Durchbruch, Raster- und
  Lagen-Position); **Staffelung** (getreppte Wände über Stufen); **oberer Anschluss**
  wählbar (Kopfblech / Spannplatte je Strang, Fuß immer Bodenblech); Seiten-Funktion und
  Platzierung. **Live-SVG-Vorschau** wie in Modul 1: Steine i2/i3, beschriftete Öffnungen,
  segmentierte Vorspannstränge, Bodenblech + oberer Anschluss, gestufte Silhouette.
  **Bearbeiten** je Wand aus dem Dashboard; Schnell-Wand und Import bleiben als Alternativen.
  Das alte Modul-1-Tool ist zum Definieren nicht mehr nötig.
- **Interaktive Vorschau (wie Modul 1):** **Durchbruch-Modus** — einzelne Steine per Klick
  entfernen/auffüllen (zusammenhängende Zellen werden zu einer Durchbruch-Öffnung
  zusammengefasst); **Achsen-Modus** — Spannachsen per Maus ziehen (Griff verschieben,
  Klick = neue Achse, Doppelklick = löschen), „Achsen auto" setzt auf die automatische
  Verteilung zurück. Beide schreiben ins Datenmodell (Durchbruch-Öffnungen bzw.
  `prestress.columns_grid`) und rechnen live durch.
- **„Alle Wände durchplanen"** (Auto-Pilot, Batch): je Wand Tiling → Vorspannung →
  **Schermer-Nachweis** → η_max.
- **Ampel-Dashboard**: grün = geplant & Nachweis erfüllt · gelb = Warnung
  (Versatz-Verstoß oder F∞ < F,inf) · rot = nicht baubar oder Nachweis nicht erfüllt;
  je Wand η_max und maßgebender Nachweis; KPI-Zähler; Material-Summe.
- **Seiten & Platzierung** je Wand: Funktion vorne/hinten (Fassadenaufbau / Innenausbau /
  Sichtseite / Installation) und Grundriss-Platzierung (x/y/Rotation).
- **Statik-Detail** je Wand (Klick auf den Namen): volle Schermer-Aufschlüsselung
  (Biegung/Schub/Druckrand/Boden/Spannsystem, η_max, F∞/N_v) + Wand-Vorschau.
- **Stückliste & Kosten**: aggregierte BOM über alle Wände mit **editierbaren
  Einheitspreisen**, Gesamtsumme netto und Kosten-CSV.
- **Projekt-Export** (aus Modul 5 / sembla-cad): **DXF Grundriss**, **DXF Ansichten**,
  **IFC4** (mit Einzelsteinen) — validiert gegen web-ifc.
- **Persistenz**: Projekt als `.semblaproj.json` speichern/laden.
- **Sammel-Export**: Dashboard-CSV.

- **Bekleidung je Seite (Modul 2):** beim Durchplanen wird pro Wandseite (Fassade/Innenausbau)
  über den Kern `sembla-wandaufbau` die Verbinder-, Latten- und Dämmungsplanung erzeugt —
  im Wand-Detail je Seite (Verbindertyp, Anzahl, Latten-m, Dämmfläche, Auskragungs-Warnung)
  und in der Stückliste/Kosten aggregiert.

### Aus der Alpha integriert
Modul 1 (Tiling/Wände + Öffnungen) · **Modul 2 (Verbinder/Latten/Dämmung je Seite)** ·
Modul 5 (Projekt-DXF/IFC, Grundriss-Platzierung) · Modul 6 (Schermer-Statik + Detail) ·
Modul 8 (Stückliste & Kosten). Alle Rechenlogik 1:1 aus den geteilten Kernen
(`sembla-core`, `sembla-statik`, `sembla-cad`, `sembla-wandaufbau`) — keine Zweitlogik.
`sembla-wandaufbau` ist per Paritätstest gegen das Modul-2-Tool abgesichert.

### Noch offen (bewusst als eigene Schritte)
- Modul-2-**Tool** selbst auf das Core-Modul umstellen (heute noch eigene Inline-Kopie; die
  Parität ist getestet, das Tool bleibt Referenz) — reiner Aufräumschritt.
- Modul 3/4 (Montageanleitung, Roboter-Sequenz) und Modul 7/10 (3D pro Wand, Fertigungs-PDF)
  — größer; folgen als eigene Integrationen.

## Bauen / Testen
```bash
node build-app.mjs      # inlined Core + Statik -> SEMBLA_EtappeA_App.html
node smoke_app.mjs       # 18 Checks (Projekt, Batch, Ampel, Persistenz, Export)
```
`SEMBLA_EtappeA_App.html` dann einfach im Browser öffnen.

## Architektur-Notiz
Die App bindet dieselben, paritätsgetesteten Kerne wie die Einzeltools ein — es gibt
**keine zweite Fachlogik**. Damit ist der Sprung zur vollen Vision (Speckle-Datenlayer,
ThatOpen-Viewer, React-SPA, Backend/Hosting) additiv möglich, ohne die Rechenlogik neu
zu bauen.

## Nächste Schritte Richtung Vision (nach Freigabe / Hosting-Entscheidung)
- Persistenz auf Speckle umstellen (Versionierung, Team) — statt Projektdatei.
- Batch server-seitig (Job-Queue) für große Projekte.
- Rollen/Freigabe (Planer/Prüfer/Statiker) + FE-Zweitprüfung (PyNite).
- Editor/Viewer einhängen (planegcs, ThatOpen).
