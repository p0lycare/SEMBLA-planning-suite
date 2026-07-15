# Core-Parität — JS gegen Python-Referenz

Dieser Ordner hält die **Rechenkern-Parität** der Suite. Der einzige Betriebskern lebt in
`../../docs/shared/sembla-core.js` (ES-Modul, läuft im Browser). `sembla_core.py` ist die
**bit-genaue Test-Referenz** (Orakel); beide erzeugen dasselbe Wandelement.

## Parität als Vertrag

`test-sembla-core.mjs` baut die drei Referenzwände mit dem JS-Core und vergleicht sie deep-equal
gegen die goldenen Python-Fixtures (`fixtures/`). Solange dieser Test grün ist, kann die JS-Logik
die Python-Referenz nicht stillschweigend verlassen.

> Detail: Python rundet „half-to-even" — der JS-Core bildet das mit `pyRound()` nach, sonst würden
> einzelne Vorspannstränge abweichen.

## Tests

```
python3 test_sembla_core.py     # Python-Referenz (unittest)
node test-sembla-core.mjs       # JS-Parität gegen die Fixtures
# oder zusammen inkl. BOM-Drift:
npm run test:core
```

## Dateien
- `sembla_core.py` — Python-Referenz (Test-Orakel)
- `test_sembla_core.py` — Python-Testsuite
- `test-sembla-core.mjs` — JS-Paritätstest gegen `../../docs/shared/sembla-core.js`
- `fixtures/` — goldene Referenz-Wandelemente (gemeinsamer Vertrag)

Rechenlogik ändern heißt: **beide** Cores gleich halten, Fixtures ggf. neu einfrieren, **beide**
Tests fahren.
