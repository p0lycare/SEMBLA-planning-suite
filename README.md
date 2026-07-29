# SEMBLA Planungs-Suite

## 🌐 [SEMBLA Planungs-Suite öffnen](https://p0lycare.github.io/SEMBLA-planning-suite/)

**Direkt im Browser nutzbar:** https://p0lycare.github.io/SEMBLA-planning-suite/

Werkzeuge zur durchgängigen Planung vorgespannter Trockenmauerwerkswände im kreislauffähigen **SEMBLA-Bausystem**. Unterstützt werden die Steintypen **i2 (25 cm)** und **i3 (37,5 cm)**.

> **Hinweis:** Die Suite ist eine Planungshilfe. Statische Nachweise, Materialkennwerte und Planungsergebnisse müssen fachlich geprüft und freigegeben werden.

## Kurzanleitung

1. **Live-App öffnen:** [p0lycare.github.io/SEMBLA-planning-suite](https://p0lycare.github.io/SEMBLA-planning-suite/)
2. Auf der Startseite ein **Wandelement anlegen**: Name, Länge, Höhe und Wandtyp festlegen.
3. In **Wandplanung** Geometrie, Öffnungen und Auslegung bearbeiten.
4. Danach bei Bedarf **Wandaufbau**, **Statik**, **Stückliste**, **Montage** und **3D/IFC** ergänzen.
5. Zurück auf der Startseite beim gewünschten Wandelement auf **Export** klicken und das Projekt sowie die gewünschten Dokumente als ZIP herunterladen.

Die Daten werden automatisch im `localStorage` des verwendeten Browsers gespeichert. Für Sicherung, Weitergabe oder einen Gerätewechsel das Projekt regelmäßig exportieren. Beim Löschen der Website-Daten gehen nicht exportierte Projekte verloren.

## Module

- **0 · Start:** Wandelemente anlegen und verwalten, Projekt-Kopfdaten, zentraler Import und Export
- **1 · Wandplanung:** Wandgeometrie, Öffnungen, Steinanordnung und Vorspannung
- **2 · Wandaufbau:** Verbinderachsen und Latten-Zuschnitt
- **3 · Statik:** statischer Nachweis auf Basis des aktiven Wandelements
- **4 · Stückliste:** Materialmengen, Preise und Kosten
- **5 · Montage:** lagenweise Montageanleitung und Vorspannschritte
- **6 · 3D / IFC:** experimentelle 3D-Vorschau, OBJ-Upload und IFC-Ausgabe

Alle Module arbeiten mit demselben aktiven Wandelement. Abgeleitete Ergebnisse werden aus den aktuellen Eingaben neu berechnet.

## Import und Export

Der zentrale Export auf der Startseite kann unter anderem folgende Dateien in einem ZIP bündeln:

- vollständige Projektdatei (`JSON`) zum späteren Import
- Stückliste und Kosten (`CSV`)
- Latten-Zuschnittliste (`CSV`)
- Montageanleitung (`HTML`, druckbar)
- statischer Nachweis (`HTML`, druckbar/PDF-fähig)
- 3D-Modell (`IFC4`)

Zum Fortsetzen eines gespeicherten Projekts auf der Startseite die exportierte Projekt-JSON über **Datei importieren…** auswählen.

## Lokal ausführen

Die Anwendung benötigt keinen Build-Schritt und kein Backend. Für einen lokalen Start genügt wegen der verwendeten ES-Module ein einfacher HTTP-Server:

```bash
git clone https://github.com/p0lycare/SEMBLA-planning-suite.git
cd SEMBLA-planning-suite
python3 -m http.server 8000 --directory docs
```

Anschließend im Browser öffnen:

```text
http://localhost:8000/
```

## Entwicklung und Tests

Voraussetzungen: **Node.js/npm** und **Python 3**.

```bash
npm install
npm run test:all
```

Nützliche Teiltests:

```bash
npm run test:core       # Rechenkern und Parität
npm run test:modul0     # Start, Export und Storage
npm run test:modul1     # Wandplanung und Engine
npm run test:modul2     # Wandaufbau
npm run test:modul3     # Statik
npm run test:modul4     # Stückliste
npm run test:modul5     # Montage
npm run test:modul6     # 3D und IFC
npm run test:interop    # optionale DXF-/IFC-Referenztests
```

Weitere Architektur- und Entwicklungsregeln stehen in [`CLAUDE.md`](CLAUDE.md). Die Historie des modularen Umbaus ist in [`doku/REFACTOR.md`](doku/REFACTOR.md) dokumentiert.

## Technischer Überblick

- statische Web-App in `docs/`
- Deployment über GitHub Pages direkt aus `main:/docs`
- kein Build- oder Publish-Schritt
- gemeinsamer Rechenkern und Speicherzugriff in `docs/shared/`
- Projektzustand lokal im Browser
- Tests in `tests/`

## Datenschutz und sensible Daten

Dieses Repository ist öffentlich. Keine Zugangsdaten, personenbezogenen Daten, internen Unterlagen oder vertraulichen Bauteilgeometrien committen. Hochgeladene OBJ-Dateien und gespeicherte Projekte verbleiben lokal im Browser; wichtige Daten sollten kontrolliert exportiert und sicher abgelegt werden.
