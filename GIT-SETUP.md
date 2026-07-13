# SEMBLA Suite – auf ein (privates) GitHub-Repo schieben

Schritt-für-Schritt für den aktuellen Arbeitsordner **„SEMBLA Suite alpha"**.

## Zuerst — drei Punkte, die wirklich wichtig sind
1. **Git-Repo NICHT im OneDrive-/SharePoint-Ordner betreiben.** Dieser Ordner wird von
   OneDrive synchronisiert; OneDrive spiegelt dann den versteckten `.git`-Ordner mit und
   kann die Historie beschädigen. Deshalb: **einmal in einen lokalen Ordner außerhalb von
   OneDrive kopieren**, dort Git einrichten und pushen. Ab dann ist der lokale Klon die
   Arbeitskopie.
2. **Privates Repository.** Der Code und das Handbuch referenzieren das **nicht öffentliche
   Gutachten Prof. Schermer**. Auch wenn `Uploads/` (das PDF) per `.gitignore` ausgeschlossen
   ist: Repo unbedingt **privat** anlegen.
3. **Keine Passwörter im Klartext.** Für die Anmeldung GitHub-CLI (`gh auth login`, Browser)
   oder SSH-Key verwenden — nicht das Passwort in die Kommandozeile tippen.

Bereits vorbereitet im Ordner: `.gitignore` (schließt `node_modules/`, `Uploads/`, OS-Müll,
Render-Temp aus), `.gitattributes` (Zeilenenden), `package.json` (Abhängigkeiten + Skripte).
Repo-Größe ohne Ballast ≈ 7 MB.

## Voraussetzungen (macOS, einmalig)
```bash
git --version        # sonst: xcode-select --install
node --version       # für Build/Tests
brew install gh      # GitHub CLI (bequemste Anmeldung); alternativ SSH-Key
```

## Schritt 1 — In einen lokalen Ordner kopieren (ohne node_modules / Uploads)
```bash
mkdir -p ~/Projekte
rsync -av --exclude 'node_modules' --exclude 'Uploads' --exclude '.DS_Store' \
  "/Users/andreaskunsmann/Library/CloudStorage/OneDrive-FreigegebeneBibliotheken–PolycareResearchTechnologyGmbH/Building Systems - Documents/P_03_SEMBLA-Planungssuite-V1/SEMBLA Suite alpha/" \
  ~/Projekte/SEMBLA-Suite/
cd ~/Projekte/SEMBLA-Suite
```

## Schritt 2 — Git initialisieren + erster Commit
```bash
git init
git add .
git status            # kurz prüfen: KEINE node_modules/, KEIN Uploads/, kein PDF
git commit -m "Initialer Stand: SEMBLA Suite (Module 1–9, Etappe-A-App, Interop, Handbuch)"
```

## Schritt 3 — Anmeldung + privates Repo anlegen + pushen
Bequem mit GitHub CLI (legt Repo an, verknüpft und pusht in einem):
```bash
gh auth login                       # Browser-Login, einmalig
gh repo create polycare/SEMBLA-Suite --private --source=. --remote=origin --push
```
Ohne CLI: auf github.com ein **privates, leeres** Repo anlegen, dann:
```bash
git branch -M main
git remote add origin git@github.com:<ORG-oder-User>/SEMBLA-Suite.git   # SSH
git push -u origin main
```

## Schritt 4 — Auf jedem Rechner nach dem Klonen
```bash
npm install                 # docx + web-ifc (JS-Abhängigkeiten)
pip install ezdxf ifcopenshell --break-system-packages   # Python-Interop (optional)
npm run test:statik && npm run test:interop               # Tests
npm run handbuch && npm run publish                       # Handbuch + Werkzeuge bauen
```

## Was du sonst beachten solltest
- **Arbeitsablauf danach:** im lokalen Klon arbeiten, `git add -A && git commit -m "…"` und
  `git push`. Der OneDrive-Ordner bleibt als Archiv/Übergabe oder wird stillgelegt.
- **Was ins Repo gehört:** Quellcode, Templates, Tests, Kern-Module, gebaute HTML-Tools
  (die Deliverables), Handbuch-Generator + `.docx`. **Nicht** ins Repo: `node_modules/`
  (via `npm install` regenerierbar), `Uploads/` (vertraulich).
- **Große Binärdateien:** die Bauteil-OBJ/IFC (~2,6 MB) sind ok. Falls später viele/große
  Binaries dazukommen, ggf. Git LFS erwägen.
- **Lizenzen (vor Produktisierung):** die OSS-Bausteine haben gemischte Lizenzen
  (web-ifc MPL-2.0, docx/ezdxf MIT, IfcOpenShell LGPL). Für internes/privates Repo unkritisch;
  vor einer Weitergabe/Produktisierung die Gesamtkombination einmal juristisch prüfen (steht
  auch im Handbuch).
- **Keine Geheimnisse committen** (Tokens, Zugangsdaten) — hier aktuell keine vorhanden.

> Ich kann dir Repo und Dateien bis hierhin vorbereiten (erledigt), aber das GitHub-Konto
> und die Anmeldung liegen bei dir — Zugangsdaten gebe ich nicht ein.
