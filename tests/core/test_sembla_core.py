#!/usr/bin/env python3
"""Testsuite fuer den SEMBLA Core. Lauf: python3 -m unittest -v  (oder pytest)."""
import hashlib, json, math, os, unittest
import sembla_core as sc
from sembla_core import (build_wall, build_reference, Opening, is_buildable,
                         InvalidDimensionError, InvalidOpeningError,
                         GRID, COURSE, ROD, CHAMBER_OFFSET, MAX_SPAN_GRID, REFERENCE_WALLS)

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


class ReferenceFixtures(unittest.TestCase):
    """Die drei Referenzwaende muessen die goldenen Fixtures exakt reproduzieren."""
    def test_reproduces_golden_fixtures(self):
        for key in REFERENCE_WALLS:
            with self.subTest(wall=key):
                with open(os.path.join(FIX, f"{key}.json")) as f:
                    golden = json.load(f)
                self.assertEqual(build_reference(key), golden)

    def test_reference_walls_buildable(self):
        for key in REFERENCE_WALLS:
            with self.subTest(wall=key):
                self.assertTrue(is_buildable(build_reference(key)))


class TilingAndVersatz(unittest.TestCase):
    def test_versatz_for_non_multiple_of_3(self):
        # Breiten, die KEIN Vielfaches von 3 Rastern sind: i2-Abschluss -> Versatz
        for n in range(2, 41):
            if n in sc.FORBIDDEN_N or n % 3 == 0:
                continue
            w = build_wall("t", n * GRID, 2000, [])
            with self.subTest(N=n):
                self.assertTrue(w["validation"]["versatz_ok"])
                self.assertTrue(is_buildable(w))

    def test_versatz_forced_for_multiple_of_3(self):
        # Versatz wird auch bei Vielfachen von 37,5 cm erzwungen (3 i2 in jeder 2. Lage)
        for n in (6, 9, 12, 15, 18):
            w = build_wall("t", n * GRID, 2000, [])
            with self.subTest(N=n):
                self.assertTrue(w["validation"]["versatz_ok"])
                self.assertTrue(is_buildable(w))
                self.assertGreater(w["bom"]["i2"], 0)

    def test_n3_pure_i3_no_joints(self):
        w = build_wall("t", 3 * GRID, 1000, [])      # Einzelstein je Lage, keine Fugen
        self.assertEqual(w["bom"]["i2"], 0)
        self.assertTrue(w["validation"]["versatz_ok"])

    def test_i3_maximized_non_mult3(self):
        per = {1: 2, 2: 1}                            # minimale i2 je Lage
        for n in range(5, 30):
            if n in sc.FORBIDDEN_N or n % 3 == 0:
                continue
            w = build_wall("t", n * GRID, 1000, [])  # 5 Lagen
            with self.subTest(N=n):
                self.assertEqual(w["bom"]["i2"], 5 * per[n % 3])

    def test_i2_only_at_ends(self):
        # i2 nur als Abschluss an den Enden, nie im Feld (auch bei erzwungenem Versatz)
        for n in (5, 6, 7, 8, 9, 10, 12, 15):
            w = build_wall("t", n * GRID, 800, [])
            for c in w["courses"]:
                types = [s["type"] for s in c["stones"]]
                i, j = 0, len(types)
                while i < j and types[i] == "i2": i += 1
                while j > i and types[j-1] == "i2": j -= 1
                with self.subTest(N=n, lage=c["lage"]):
                    self.assertNotIn("i2", types[i:j], f"i2 im Feld: {types}")

    def test_n4_not_buildable(self):
        w = build_wall("starr", 4 * GRID, 800, [])
        self.assertFalse(is_buildable(w))
        self.assertTrue(w["validation"]["invalid_segments"])

    def test_courses_fill_full_length_when_no_opening(self):
        w = build_wall("t", 2000, 600, [])
        for c in w["courses"]:
            self.assertEqual(c["stones"][0]["x0"], 0)
            self.assertEqual(c["stones"][-1]["x1"], 2000)

    def test_only_i2_i3_used(self):
        w = build_reference("ref2_wand_tuer")
        for c in w["courses"]:
            for s in c["stones"]:
                self.assertIn(s["type"], ("i2", "i3"))
                self.assertIn(s["x1"] - s["x0"], (250, 375))


class ChamberLattice(unittest.TestCase):
    def test_columns_on_lattice(self):
        w = build_reference("ref3_wand_fenster")
        for col in w["tension_columns"]:
            self.assertEqual(col["x_mm"], CHAMBER_OFFSET + GRID * col["k"])

    def test_columns_are_unique_and_sorted(self):
        ks = [c["k"] for c in build_reference("ref2_wand_tuer")["tension_columns"]]
        self.assertEqual(ks, sorted(set(ks)))


class TensionRules(unittest.TestCase):
    def test_both_ends_have_columns(self):
        # [V-3]/[V-11] (#104): beide Wandenden liegen auf der ZWEITEN Rasterachse — links 1,
        # rechts N-2 — und nie im aeusseren Randfeld (0 bzw. N-1). Bei einem i3 folgt das aus
        # der Steinmitte, bei einem i2 aus [V-11]; die frueher unbedingte Endachse N-1 ist weg.
        for key in REFERENCE_WALLS:
            w = build_reference(key)
            ks = {c["k"] for c in w["tension_columns"]}
            with self.subTest(wall=key):
                self.assertIn(1, ks)
                self.assertIn(w["N_grid"] - 2, ks)
                self.assertNotIn(0, ks)
                self.assertNotIn(w["N_grid"] - 1, ks)

    def test_columns_beside_openings(self):
        w = build_reference("ref2_wand_tuer")
        ks = {c["k"] for c in w["tension_columns"]}
        op = w["openings"][0]
        self.assertIn(op["g0"] - 1, ks)   # links der Tuer
        self.assertIn(op["g1"], ks)       # rechts der Tuer

    # ---- [V-3]/[V-11] Grundachsen aus dem Verband der untersten Lage (Issue #104) ----
    # Die vier geforderten Randverbaende getrennt. N=16 (2,00 m) ist bewusst NICHT glatt durch
    # den Strangabstand teilbar. Die Achslisten sind eingefroren, weil genau ihre Lage die
    # Fachregel ist — nicht nur ihre Anzahl.
    @staticmethod
    def _ks(L=2000, H=2600, openings=(), **ps):
        return [c["k"] for c in
                build_wall("gr", L, H, list(openings), prestress=ps)["tension_columns"]]

    @staticmethod
    def _lage0(L, H=2600, openings=()):
        w = build_wall("gr", L, H, list(openings))
        return [(st["x1"] - st["x0"]) // GRID for st in w["courses"][0]["stones"]]

    def test_v3_i3_an_beiden_raendern(self):
        # Unterste Lage [i3, i3]: beide Grundachsen sind Steinmitten (1 und N-2 = 4).
        self.assertEqual(self._lage0(6 * GRID), [3, 3])
        ks = self._ks(6 * GRID, max_span_grid=3)
        self.assertEqual(ks, [1, 3, 4])
        self.assertNotIn(0, ks)
        self.assertNotIn(5, ks)

    def test_v11_i2_nur_am_anfang(self):
        # Unterste Lage [i2, i3]: links [V-11] -> 1, rechts [V-3] Steinmitte -> 3 = N-2.
        self.assertEqual(self._lage0(5 * GRID), [2, 3])
        ks = self._ks(5 * GRID, max_span_grid=3)
        self.assertEqual(ks, [1, 3])
        self.assertNotIn(0, ks)
        self.assertNotIn(4, ks)

    def test_v11_i2_nur_am_ende(self):
        # Unterste Lage [i3, i2] (Tuer bis zum Boden erzwingt den i2-Abschluss rechts):
        # links [V-3] Steinmitte -> 1, rechts [V-11] -> 7 = N-2.
        op = [Opening(3, 7, 0, 8, "tuer")]
        self.assertEqual(self._lage0(9 * GRID, openings=op), [3, 2])
        ks = self._ks(9 * GRID, openings=op, max_span_grid=3)
        self.assertIn(1, ks)
        self.assertIn(7, ks)          # N-2, nicht das Randfeld
        self.assertNotIn(0, ks)
        self.assertNotIn(8, ks)       # N-1 ist keine Achse mehr
        self.assertEqual(ks, [1, 2, 5, 7])

    def test_v11_i2_an_beiden_raendern(self):
        # Unterste Lage [i2, i2]: links [V-11] -> 1, rechts [V-11] -> 2 = N-2.
        self.assertEqual(self._lage0(4 * GRID), [2, 2])
        ks = self._ks(4 * GRID, max_span_grid=3)
        self.assertEqual(ks, [1, 2])
        self.assertNotIn(0, ks)
        self.assertNotIn(3, ks)

    def test_v11_einzelner_i2_genau_eine_achse(self):
        # Kuerzestmoegliche Wand: der einzige i2 ist erster UND letzter Stein. Dann gilt die
        # Anfangsregel — genau EINE Grundachse auf der 2. Rasterachse, nicht zwei.
        self.assertEqual(self._lage0(2 * GRID), [2])
        self.assertEqual(self._ks(2 * GRID, max_span_grid=3), [1])

    def test_v11_innerer_i2_erzeugt_keine_grundachse(self):
        # [N3] Ein i2 im Inneren hat keine Rastermitte — es wird keine erfunden. Die Lage
        # [i3, i3, i2, i2] traegt Grundachsen nur auf 1, 4 (Steinmitten) und 12 (= N-2).
        op = [Opening(6, 10, 0, 8, "tuer")]
        self.assertEqual(self._lage0(14 * GRID, openings=op), [3, 3, 2, 2])
        ks = self._ks(14 * GRID, openings=op, max_span_grid=3)
        for k in (1, 4, 12):
            self.assertIn(k, ks)
        self.assertNotIn(0, ks)
        self.assertNotIn(13, ks)
        self.assertEqual(ks, [1, 3, 4, 5, 8, 10, 12])

    # ---- [V-5] abgeloest: die gespeicherte Startachse wirkt nicht mehr (M5) ----
    def test_v5_startachse_ohne_wirkung(self):
        for L in (2 * GRID, 4 * GRID, 5 * GRID, 2000, 3000):
            a = build_wall("sa0", L, 2600, [], prestress={"max_span_grid": 3, "start_axis_grid": 0})
            b = build_wall("sa1", L, 2600, [], prestress={"max_span_grid": 3, "start_axis_grid": 1})
            with self.subTest(L=L):
                self.assertEqual(a["tension_columns"], b["tension_columns"])
                # Das Feld bleibt lesbarer Altbestand — es wird nur nicht mehr angewendet ([N5]).
                self.assertEqual(a["prestress"]["start_axis_grid"], 0)
                self.assertEqual(b["prestress"]["start_axis_grid"], 1)

    def test_v5_altstand_ohne_feld_gleicht_gesetztem_feld(self):
        ohne = build_wall("ohne", 2000, 2600, [], prestress={"max_span_grid": 3})
        mit = build_wall("mit", 2000, 2600, [], prestress={"max_span_grid": 3, "start_axis_grid": 1})
        self.assertEqual(ohne["tension_columns"], mit["tension_columns"])
        self.assertEqual([c["k"] for c in ohne["tension_columns"]], [1, 3, 5, 8, 11, 13, 14])

    # ---- [V-2] MUSS: jeder Stein wird von mindestens einer Spannachse durchgangen ----
    @staticmethod
    def _ungehalten(w):
        ks = {c["k"] for c in w["tension_columns"]}
        return [(c["lage"], st["x0"] // GRID, st["x1"] // GRID)
                for c in w["courses"] for st in c["stones"]
                if not any(k in ks for k in range(st["x0"] // GRID, st["x1"] // GRID))]

    def test_v2_jeder_stein_von_achse_gehalten(self):
        for key in REFERENCE_WALLS:
            w = build_reference(key)
            self.assertEqual(self._ungehalten(w), [], key)
            self.assertEqual(w["validation"]["ungehaltene_steine"], [], key)

    def test_v2_gilt_auch_ohne_maximalabstand(self):
        # [V-4] als Obergrenze abgeschaltet (sehr grosser Wert) -> [V-2] muss allein tragen.
        for L, H in ((2000, 2400), (2500, 2400), (3000, 2600), (5000, 3000), (10000, 2800)):
            for sa in (0, 1):
                w = build_wall("v2", L, H, [], prestress={"max_span_grid": 999, "start_axis_grid": sa})
                self.assertEqual(self._ungehalten(w), [], f"{L}x{H} sa={sa}")

    def test_v2_bei_oeffnungen_und_staffelung(self):
        w = build_wall("v2o", 4000, 2600, [Opening(8, 16, 0, 11, "tuer")],
                       prestress={"max_span_grid": 3, "start_axis_grid": 0})
        self.assertEqual(self._ungehalten(w), [])
        w2 = build_wall("v2s", 3000, 2600, [], prestress={"max_span_grid": 3},
                        steps=[{"x0_mm": 1500, "x1_mm": 3000, "height_mm": 1600}])
        self.assertEqual(self._ungehalten(w2), [])

    def test_v2_verletzung_bei_manuellen_achsen_wird_gemeldet(self):
        # [V-9] manuelle Achsen haben Vorrang, werden aber gegen [V-2] geprueft und sichtbar
        # gemeldet — ohne stille Korrektur und ohne Baubarkeitsausschluss.
        w = build_wall("v9", 2000, 2600, [], prestress={"columns_grid": [0, 15]})
        self.assertEqual([c["k"] for c in w["tension_columns"]], [0, 15])
        offen = w["validation"]["ungehaltene_steine"]
        self.assertTrue(offen, "Verletzung muss gemeldet werden")
        self.assertTrue(w["validation"]["buildable"], "kein Baubarkeitsausschluss")
        for e in offen:
            self.assertIn(e["typ"], ("i2", "i3"))
            self.assertIn("lage", e); self.assertIn("start_grid", e); self.assertIn("breite_grid", e)

    # ---- [V-3] MUSS (#104): JEDE i3-Mitte der untersten Lage ist eine Grundachse ----
    def test_v3_achsen_mittig_in_i3_der_untersten_lage(self):
        # Frueher eine Soll-Regel ("deutliche Mehrheit"), seit #104 vollstaendig: es gibt keine
        # Start-/Endachse mehr, die eine Steinmitte verdraengen koennte.
        for L in (2000, 5000):
            w = build_wall("v3", L, 2600, [], prestress={"max_span_grid": 3})
            ks = {c["k"] for c in w["tension_columns"]}
            mitten = {st["x0"] // GRID + 1 for st in w["courses"][0]["stones"]
                      if (st["x1"] - st["x0"]) // GRID == 3}
            self.assertTrue(mitten, f"Testwand L={L} enthaelt keinen i3 in der untersten Lage")
            self.assertEqual(mitten - ks, set(), f"L={L}")

    def test_v3_gilt_auch_fuer_die_referenzwaende(self):
        for key in REFERENCE_WALLS:
            w = build_reference(key)
            ks = {c["k"] for c in w["tension_columns"]}
            mitten = {st["x0"] // GRID + 1 for st in w["courses"][0]["stones"]
                      if (st["x1"] - st["x0"]) // GRID == 3}
            with self.subTest(wall=key):
                self.assertEqual(mitten - ks, set())

    def test_v3_erzwingt_keine_achse_im_i2(self):
        # i2 hat keine Rastermitte -> es darf keine Wunschposition erfunden werden.
        w = build_wall("v3b", 2000, 2600, [], prestress={"max_span_grid": 3})
        ks = [c["k"] for c in w["tension_columns"]]
        self.assertEqual(ks, sorted(set(ks)))
        self.assertTrue(all(0 <= k < 16 for k in ks))

    def test_zusatzachsen_additiv_und_manuelle_haben_vorrang(self):
        # [M6] Oeffnungskanten ([V-8]) ergaenzen die Grundachsen weiterhin additiv; das aeussere
        # Randfeld bleibt dabei frei (weder 0 noch N-1).
        op = [Opening(5, 11, 0, 10, "tuer")]
        ks = {c["k"] for c in build_wall("sa", 2000, 2600, op,
                                         prestress={"max_span_grid": 3})["tension_columns"]}
        self.assertIn(4, ks); self.assertIn(11, ks)      # Oeffnungskanten additiv
        self.assertNotIn(0, ks); self.assertNotIn(15, ks)
        self.assertIn(14, ks)                            # N-2 traegt das rechte Wandende
        # [N1]/[V-9] Manuelle Achsen werden weder ergaenzt noch verschoben — auch nicht um die
        # neuen Grundachsen. Eine gespeicherte Startachse aendert daran nichts.
        m = build_wall("sa", 2000, 2600, [], prestress={"max_span_grid": 3, "start_axis_grid": 1,
                                                        "columns_grid": [0, 8, 15]})
        self.assertEqual([c["k"] for c in m["tension_columns"]], [0, 8, 15])

    def test_max_span_within_runs(self):
        # innerhalb durchgehender Steinfelder <= 375 mm (3 Raster)
        for key in REFERENCE_WALLS:
            w = build_reference(key)
            self.assertTrue(w["validation"]["tension_span_ok"], key)

    def test_segments_avoid_openings_and_cover_above_below(self):
        w = build_reference("ref3_wand_fenster")
        op = w["openings"][0]
        for c in w["tension_columns"]:
            inx = op["g0"] <= c["k"] < op["g1"]
            for g in c["segments"]:
                iny = g["lage0"] < op["l1"] and g["lage1"] > op["l0"]
                self.assertFalse(inx and iny, "Segment in Oeffnung")
        span = [c for c in w["tension_columns"] if op["g0"] <= c["k"] < op["g1"]]
        self.assertTrue(any(any(g["lage1"] <= op["l0"] for g in c["segments"]) for c in span), "keine Vorspannung unter Fenster")
        self.assertTrue(any(any(g["lage0"] >= op["l1"] for g in c["segments"]) for c in span), "keine Vorspannung ueber Fenster")

    def test_rod_count_and_ablaengen(self):
        w = build_wall("t", 1000, 2600, [])   # 2600/1100 -> 3 Stangen
        col = w["tension_columns"][0]
        self.assertTrue(col["durchgehend"])
        seg = col["segments"][0]
        self.assertEqual(seg["gewindestangen"], 3)
        self.assertEqual(seg["verbindungsmuttern"], 2)
        self.assertEqual(seg["letzte_stange_mm"], 2600 - 2 * ROD)  # 400
        self.assertEqual(seg["verschnitt_mm"], 3 * ROD - 2600)     # 700

    def test_rod_length_parameter(self):
        a = build_wall("a", 1000, 2600, [])
        b = build_wall("b", 1000, 2600, [], prestress={"rod_mm": 600})
        self.assertEqual(a["rod_mm"], 1100)
        self.assertEqual(b["rod_mm"], 600)
        sa = a["tension_columns"][0]["segments"][0]
        sb = b["tension_columns"][0]["segments"][0]
        self.assertGreater(sb["gewindestangen"], sa["gewindestangen"])     # kürzere Stange -> mehr Stangen
        self.assertEqual(sb["verbindungsmuttern"], sb["gewindestangen"] - 1)
        self.assertEqual(sb["verschnitt_mm"], sb["gewindestangen"] * 600 - (sb["z1_mm"] - sb["z0_mm"]))
        # ungültige Werte -> Default
        self.assertEqual(build_wall("a", 1000, 2600, [], prestress={"rod_mm": 0})["rod_mm"], 1100)
        self.assertEqual(build_wall("a", 1000, 2600, [], prestress={"rod_mm": -5})["rod_mm"], 1100)


class ZuschnittKombination(unittest.TestCase):
    """Zuschnitt aus ausgewaehlten Standardlaengen ([Z-2]/[Z-5]).

    DIESELBEN Faelle stehen wortgleich in test-sembla-core.mjs — sie sind der
    Paritaetsvertrag der Kombinationsregel zwischen Orakel und Betriebskopie.
    """
    @staticmethod
    def kurz(r):
        return "+".join(str(s["len_mm"]) + ("S/" + str(s["quelle_mm"]) if s["art"] == "sonder" else "")
                        for s in r["stuecke"])

    def test_170cm_aus_100_50(self):
        r = sc.kombiniere_laengen(1700, [1000, 500])
        self.assertEqual(self.kurz(r), "1000+500+200S/500")
        self.assertIsNone(r["konflikt"])

    def test_reihenfolge_und_doppelte_ohne_wirkung(self):
        self.assertEqual(self.kurz(sc.kombiniere_laengen(1700, [500, 1000, 500])), "1000+500+200S/500")

    def test_exakt_teilbar(self):
        self.assertEqual(self.kurz(sc.kombiniere_laengen(3000, [1000])), "1000+1000+1000")

    def test_bedarf_kleiner_als_kleinste_groesse(self):
        self.assertEqual(self.kurz(sc.kombiniere_laengen(400, [1000, 600])), "400S/600")

    def test_mindestmass_wird_gemeldet(self):
        r = sc.kombiniere_laengen(1200, [1100])
        self.assertEqual(self.kurz(r), "1100+100S/1100")
        self.assertEqual(r["konflikt"], "mindestmass")
        alt = sc.kombiniere_laengen(1200, [1100, 500])
        self.assertIsNone(alt["konflikt"])
        self.assertTrue(all(s["len_mm"] >= sc.MIN_FERTIGMASS_MM for s in alt["stuecke"]))

    def test_ohne_standardlaenge(self):
        r = sc.kombiniere_laengen(1700, [])
        self.assertEqual(r["stuecke"], [])
        self.assertEqual(r["konflikt"], "keine_standardlaenge")

    def test_quelle_fuer_mass(self):
        self.assertEqual(sc.quelle_fuer_mass(400, [1000, 500, 300]), 500)
        self.assertIsNone(sc.quelle_fuer_mass(1500, [1000, 500]))

    def test_laengensatz_im_wandelement(self):
        w = build_wall("z", 1000, 2600, [], prestress={"rod_lengths_mm": [600, 1000]})
        self.assertEqual(w["prestress"]["rod_lengths_mm"], [1000, 600])
        self.assertEqual(w["rod_mm"], 1000)
        sg = w["tension_columns"][0]["segments"][0]
        self.assertEqual(self.kurz({"stuecke": sg["stuecke"]}), "1000+1000+600")
        self.assertEqual(sg["gewindestangen"], 3)
        self.assertEqual(sg["verbindungsmuttern"], 2)
        self.assertEqual(sg["verschnitt_mm"], 0)

    def test_fallback_bitgenau_wie_altstand(self):
        for h in (2000, 2200, 2400, 2600, 3000, 3400):
            with self.subTest(h=h):
                sg = build_wall("f", 1000, h, [])["tension_columns"][0]["segments"][0]
                st = math.ceil(h / ROD)
                self.assertEqual(sg["gewindestangen"], st)
                self.assertEqual(sg["letzte_stange_mm"], h - (st - 1) * ROD)
                self.assertEqual(sg["verschnitt_mm"], st * ROD - h)


class Bodenblech(unittest.TestCase):
    """Bodenblech aus Standardlaengen ([A-10]/[A-11]/[A-12]).

    DIESELBEN Faelle stehen wortgleich in test-sembla-core.mjs — sie sind der
    Paritaetsvertrag der Zerlegung zwischen Orakel und Betriebskopie.
    """
    @staticmethod
    def kurz(w):
        return "+".join(str(t["raster_mm"]) + "/" + str(t["bauteil_mm"])
                        + ("S" if t["art"] == "sonder" else "")
                        for t in w["base_plate"]["teile"])

    def test_fallback_ist_volle_standardreihe(self):
        w = build_wall("bb", 5000, 2600, [])
        self.assertEqual(w["prestress"]["blech_lengths_mm"], list(sc.BLECH_LAENGEN))
        self.assertEqual(sc.norm_blech_laengen([1250, 300, 1500, 1000, 1000, 0]), [1250, 1000])

    def test_5000er_wand_nur_standardteile_stossfrei(self):
        w = build_wall("bb5", 5000, 2600, [], prestress={"top_connection": "blech"})
        self.assertEqual(self.kurz(w), "1125/1123+1125/1123+1125/1123+1125/1123+500/498")
        self.assertTrue(all(t["art"] == "standard" for t in w["base_plate"]["teile"]))
        self.assertEqual(sum(t["raster_mm"] for t in w["base_plate"]["teile"]), 5000)
        self.assertEqual(w["base_plate"]["module"], 5)
        self.assertEqual(w["bom"]["stahlblech_module"], 5 + w["top_plate"]["module"])
        self.assertEqual(w["validation"]["blech_konflikte"], [])
        # Das Ausweichen ist echt: 4x1250 waere groesser, liegt aber auf dem Steinstoss Raster 10.
        fugen = set(w["courses"][0]["joints_grid"])
        self.assertIn(10, fugen)
        x = 0
        for t in w["base_plate"]["teile"]:
            x += t["raster_mm"]
            self.assertTrue(x >= 5000 or (x // GRID) not in fugen, f"Stoss bei {x}")

    def test_rastermass_und_bauteilmass(self):
        for L in (1000, 2000, 3000, 5000, 250):
            w = build_wall("bbm", L, 2600, [])
            with self.subTest(L=L):
                for t in w["base_plate"]["teile"]:
                    self.assertEqual(t["bauteil_mm"], t["raster_mm"] - sc.BLECH_SPIEL)
                    self.assertEqual(t["raster_mm"] % GRID, 0)

    def test_kein_ausweichen_moeglich_konflikt_gemeldet(self):
        w = build_wall("bb1250", 5000, 2600, [], prestress={"blech_lengths_mm": [1250]})
        self.assertEqual(self.kurz(w), "1250/1248+1250/1248+1250/1248+1250/1248")
        self.assertEqual(w["validation"]["blech_konflikte"],
                         [{"grund": "stoss_auf_steinstoss", "x_mm": 1250, "grid": 10}])
        self.assertTrue(w["validation"]["buildable"])

    def test_nicht_deckbare_laenge_genau_ein_sonderzuschnitt(self):
        # Seit der Vorratssatz 250 mm fuehrt, deckt ihn eine 250er Wand exakt ab. Der
        # Sonderpfad wird deshalb ueber einen eingeschraenkten Vorratssatz geprueft: 375 mm
        # passt arithmetisch nicht in 250 mm, also bleibt genau EIN Sonderzuschnitt.
        w = build_wall("bbs", 250, 2600, [], prestress={"blech_lengths_mm": [375]})
        self.assertEqual(self.kurz(w), "250/248S")
        self.assertEqual(len([t for t in w["base_plate"]["teile"] if t["art"] == "sonder"]), 1)
        self.assertEqual(w["validation"]["blech_konflikte"], [])
        self.assertTrue(w["validation"]["buildable"])

    def test_leerer_vorratssatz_wird_gemeldet(self):
        w = build_wall("bb0", 5000, 2600, [], prestress={"blech_lengths_mm": []})
        self.assertEqual(w["prestress"]["blech_lengths_mm"], [])
        self.assertEqual(self.kurz(w), "5000/4998S")
        self.assertTrue(any(k["grund"] == "keine_standardlaenge"
                            for k in w["validation"]["blech_konflikte"]))

    def test_blech_mm_bleibt_kopfblech_modullaenge(self):
        a = build_wall("bbk", 3000, 2600, [], prestress={"top_connection": "blech"})
        b = build_wall("bbk", 3000, 2600, [],
                       prestress={"blech_mm": 500, "top_connection": "blech"})
        self.assertEqual(self.kurz(a), self.kurz(b))
        self.assertEqual(a["top_plate"]["module"], 3)
        self.assertEqual(b["top_plate"]["module"], 6)

    # Gegenfall der Abnahme: die frueher benutzte Tiefensuche nahm einen Sonderabschluss als
    # Erfolg und brach im ersten grossen Ast ab — 1000+625+625+250S —, obwohl 4 x 625 exakt
    # deckt. [A-10] verlangt: existiert IRGENDEINE exakte Standardkombination, entsteht KEIN
    # Sonderzuschnitt.
    def test_exakte_kombination_schlaegt_sonderzuschnitt(self):
        r = sc.zerlege_bodenblech(2500, [1000, 625, 375], [])
        self.assertEqual([t["raster_mm"] for t in r["teile"]], [625, 625, 625, 625])
        self.assertTrue(all(t["art"] == "standard" for t in r["teile"]))
        self.assertEqual(sum(t["raster_mm"] for t in r["teile"]), 2500)
        self.assertEqual(r["konflikte"], [])

    def test_geringste_teilezahl_schlaegt_groessenpraeferenz(self):
        # Groesste zuerst ergaebe 1000+1000+375+250S (4 Teile, davon einer Sonder);
        # exakt und kuerzer sind 3 x 875.
        r = sc.zerlege_bodenblech(2625, [1000, 875, 375], [])
        self.assertEqual([t["raster_mm"] for t in r["teile"]], [875, 875, 875])
        self.assertTrue(all(t["art"] == "standard" for t in r["teile"]))
        self.assertEqual(r["konflikte"], [])

    def test_stossregel_schlaegt_geringste_teilezahl(self):
        # Ohne Stoss ist 1250+1250 die kuerzeste exakte Kombination; der Steinstoss bei 1250 mm
        # sperrt sie, also gilt die kuerzeste STOSSFREIE exakte Kombination — und die ist laenger.
        ohne = sc.zerlege_bodenblech(2500, sc.BLECH_LAENGEN, [])
        self.assertEqual([t["raster_mm"] for t in ohne["teile"]], [1250, 1250])
        r = sc.zerlege_bodenblech(2500, sc.BLECH_LAENGEN, [10])
        self.assertEqual([t["raster_mm"] for t in r["teile"]], [1125, 1125, 250])
        self.assertTrue(all(t["art"] == "standard" for t in r["teile"]))
        self.assertEqual(r["konflikte"], [])

    def test_zerlege_bodenblech_ist_reine_funktion(self):
        r = sc.zerlege_bodenblech(3000, sc.BLECH_LAENGEN, [])
        self.assertEqual([t["raster_mm"] for t in r["teile"]], [1250, 1250, 500])
        self.assertEqual(r["konflikte"], [])


class InvalidInputs(unittest.TestCase):
    def test_length_not_on_grid(self):
        with self.assertRaises(InvalidDimensionError):
            build_wall("x", 300, 2000, [])

    def test_height_not_on_course(self):
        with self.assertRaises(InvalidDimensionError):
            build_wall("x", 1000, 250, [])

    def test_too_short(self):
        with self.assertRaises(InvalidDimensionError):
            build_wall("x", 125, 2000, [])

    def test_opening_out_of_bounds(self):
        with self.assertRaises(InvalidOpeningError):
            build_wall("x", 1000, 2000, [Opening(2, 99, 0, 5)])

    def test_opening_above_wall(self):
        with self.assertRaises(InvalidOpeningError):
            build_wall("x", 2000, 1000, [Opening(2, 6, 0, 99)])

    def test_opening_overlap(self):
        with self.assertRaises(InvalidOpeningError):
            build_wall("x", 4000, 2600, [Opening(2, 10, 0, 8), Opening(6, 14, 0, 8)])

    def test_bad_opening_geometry(self):
        with self.assertRaises(InvalidOpeningError):
            Opening(6, 4, 0, 5)   # g1<g0
        with self.assertRaises(InvalidOpeningError):
            Opening(2, 6, 5, 5)   # l1<=l0


class Verzahnung(unittest.TestCase):
    """Verzahnungsbereich ([G-10]/[G-11]/[G-12]).

    DIESELBEN Erwartungswerte stehen wortgleich in test-sembla-core.mjs —
    sie sind der Paritaetsvertrag.
    """

    def test_verzahnung_start_parity_0(self):
        # 1000mm = 8 Raster, 800mm = 4 Lagen
        w = build_wall("vz0", 1000, 800, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 0}])
        self.assertEqual(len(w["interlocks"]), 1)
        self.assertEqual(len(w["validation"]["interlock_fehler"]), 0)
        # Lage 0 und 2 (gerade) sind im Bereich [0,3) ausgespart
        for li in (0, 2):
            steine = [s for s in w["courses"][li]["stones"] if s["x0"] // GRID < 3]
            self.assertEqual(len(steine), 0, f"Lage {li}: sollte 0 Steine im Bereich haben")
        # Lage 1 und 3 (ungerade) haben Steine im Bereich
        for li in (1, 3):
            steine = [s for s in w["courses"][li]["stones"] if s["x0"] // GRID < 3]
            self.assertGreater(len(steine), 0, f"Lage {li}: sollte Steine im Bereich haben")

    def test_verzahnung_start_parity_1(self):
        w = build_wall("vz1", 1000, 800, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 1}])
        self.assertEqual(len(w["interlocks"]), 1)
        # Lage 1 und 3 (ungerade) sind im Bereich ausgespart
        for li in (1, 3):
            steine = [s for s in w["courses"][li]["stones"] if s["x0"] // GRID < 3]
            self.assertEqual(len(steine), 0, f"Lage {li}: sollte 0 Steine im Bereich haben")
        # Lage 0 und 2 (gerade) haben Steine im Bereich
        for li in (0, 2):
            steine = [s for s in w["courses"][li]["stones"] if s["x0"] // GRID < 3]
            self.assertGreater(len(steine), 0, f"Lage {li}: sollte Steine im Bereich haben")

    def test_vorspannung_identisch_mit_und_ohne_verzahnung(self):
        # [G-11] Vorspannung bleibt bitgleich
        ohne = build_wall("ohneVz", 2000, 2000, [])
        mit = build_wall("mitVz", 2000, 2000, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 0}])
        ohne_ks = [c["k"] for c in ohne["tension_columns"]]
        mit_ks = [c["k"] for c in mit["tension_columns"]]
        self.assertEqual(ohne_ks, mit_ks)
        for i, (o, m) in enumerate(zip(ohne["tension_columns"], mit["tension_columns"])):
            self.assertEqual(len(o["segments"]), len(m["segments"]), f"col {i}: Segmente verschieden")
            for j, (os, ms) in enumerate(zip(o["segments"], m["segments"])):
                self.assertEqual(os["z0_mm"], ms["z0_mm"])
                self.assertEqual(os["z1_mm"], ms["z1_mm"])
                self.assertEqual(os["stuecke"], ms["stuecke"])

    def test_bom_steinmenge_reduziert(self):
        ohne = build_wall("ohneVz", 1000, 800, [])
        mit = build_wall("mitVz", 1000, 800, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 0}])
        ohne_steine = ohne["bom"]["i2"] + ohne["bom"]["i3"]
        mit_steine = mit["bom"]["i2"] + mit["bom"]["i3"]
        self.assertLess(mit_steine, ohne_steine)
        # [G-5]/#143 Die Stossfugen sind die REALEN Steinberuehrungen des ausgesparten
        # Verbands — weniger Steine, also weniger Fugen. (Die Vorspannung bleibt nach [G-11]
        # bitgleich; das prueft test_vorspannung_identisch_mit_und_ohne_verzahnung.)
        self.assertLess(mit["bom"]["stossfugen"], ohne["bom"]["stossfugen"])
        for c in mit["courses"]:
            real = [st["x0"] // GRID for i, st in enumerate(c["stones"])
                    if i and c["stones"][i - 1]["x1"] == st["x0"]]
            self.assertEqual(c["joints_grid"], sorted(real))

    # ---- #143: Fugenversatz nach Verzahnungsaussparung [G-5] ----
    @staticmethod
    def _reale_fugen(c):
        return [st["x0"] // GRID for i, st in enumerate(c["stones"])
                if i and c["stones"][i - 1]["x1"] == st["x0"]]

    def _pruefe_verband(self, w, was):
        for c in w["courses"]:
            self.assertEqual(c["joints_grid"], sorted(self._reale_fugen(c)),
                             f"{was}: joints_grid passt nicht zu den Steinen in Lage {c['lage']}")
        erwartet = []
        for li in range(len(w["courses"]) - 1):
            a = set(self._reale_fugen(w["courses"][li]))
            bad = sorted(set(self._reale_fugen(w["courses"][li + 1])) & a)
            if bad:
                erwartet.append({"zwischen_lagen": [li, li + 1], "fugen_grid": bad})
        self.assertEqual(w["validation"]["versatz_ok"], not erwartet, was)
        self.assertEqual(w["validation"]["versatz_violations"], erwartet, was)

    def test_g5_gemeldeter_fall_3125x2930(self):
        w = build_wall("vz143", 3125, 2930, [], interlocks=[{"g0": 24, "g1": 25, "start_parity": 0}],
                       ausgleichslage_aktiv=True)
        self._pruefe_verband(w, "3125x2930")
        f0 = set(self._reale_fugen(w["courses"][0]))
        self.assertFalse(f0 & set(self._reale_fugen(w["courses"][1])), "Lage 0/1 fluchten weiterhin")
        self.assertTrue(w["validation"]["versatz_ok"])

    def test_g5_verband_konsistent_ueber_faelle(self):
        faelle = [
            ("3125x2930 Rand p0 + Ausgleich", 3125, 2930, [], [{"g0": 24, "g1": 25, "start_parity": 0}], True),
            ("3125x2930 Rand p1 + Ausgleich", 3125, 2930, [], [{"g0": 24, "g1": 25, "start_parity": 1}], True),
            ("3125x3000 Rand p0", 3125, 3000, [], [{"g0": 24, "g1": 25, "start_parity": 0}], False),
            ("3125x3000 Rand p1", 3125, 3000, [], [{"g0": 24, "g1": 25, "start_parity": 1}], False),
            ("3125x3000 linker Rand", 3125, 3000, [], [{"g0": 0, "g1": 1, "start_parity": 0}], False),
            ("3125x3000 innen", 3125, 3000, [], [{"g0": 12, "g1": 13, "start_parity": 0}], False),
            ("3125x3000 ohne Verzahnung", 3125, 3000, [], [], False),
            ("mit Oeffnung + Randverzahnung", 3125, 3000, [Opening(8, 14, 2, 8, "fenster")],
             [{"g0": 24, "g1": 25, "start_parity": 0}], False),
        ]
        for was, l, h, ops, il, ag in faelle:
            self._pruefe_verband(build_wall("vz", l, h, ops, interlocks=il, ausgleichslage_aktiv=ag), was)

    def test_g5_unaufloesbarer_verband_wird_gemeldet(self):
        w = build_wall("vzKonflikt", 1000, 1000, [], interlocks=[{"g0": 0, "g1": 1, "start_parity": 0}])
        self.assertFalse(w["validation"]["versatz_ok"])
        self.assertTrue(w["validation"]["versatz_violations"])
        self._pruefe_verband(w, "unaufloesbar")
        # [G-5] ist eine Warnung, kein Baubarkeitsausschluss
        self.assertTrue(w["validation"]["buildable"])

    def test_ungueltige_verzahnung_gemeldet(self):
        # Bereich ausserhalb der Wand
        w1 = build_wall("vzErr", 1000, 800, [], interlocks=[{"g0": 5, "g1": 12, "start_parity": 0}])
        self.assertEqual(len(w1["interlocks"]), 0)
        self.assertTrue(any(f["grund"] == "ausserhalb_wand" for f in w1["validation"]["interlock_fehler"]))
        # Ungueltige Paritaet
        w2 = build_wall("vzErr", 1000, 800, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 2}])
        self.assertEqual(len(w2["interlocks"]), 0)
        self.assertTrue(any(f["grund"] == "ungueltige_paritaet" for f in w2["validation"]["interlock_fehler"]))
        # Leeres Intervall
        w3 = build_wall("vzErr", 1000, 800, [], interlocks=[{"g0": 5, "g1": 3, "start_parity": 0}])
        self.assertEqual(len(w3["interlocks"]), 0)
        self.assertTrue(any(f["grund"] == "leeres_intervall" for f in w3["validation"]["interlock_fehler"]))

    def test_verzahnung_aendert_buildable_nicht(self):
        # Fehlerhafte Verzahnung aendert buildable nicht
        w = build_wall("vzBuild", 1000, 800, [], interlocks=[{"g0": 100, "g1": 200, "start_parity": 0}])
        self.assertTrue(w["validation"]["buildable"])
        self.assertGreater(len(w["validation"]["interlock_fehler"]), 0)

    def test_ohne_verzahnung_interlocks_leer(self):
        w = build_wall("noVz", 1000, 800, [])
        self.assertEqual(len(w["interlocks"]), 0)
        self.assertEqual(len(w["validation"]["interlock_fehler"]), 0)
        self.assertEqual(len(w["validation"]["interlock_invalid_segments"]), 0)

    def test_kein_stein_ragt_in_ausgesparten_bereich(self):
        # In ausgesparten Lagen darf kein Stein den Bereich [0,3) beruehren
        w = build_wall("vzRagt", 1000, 800, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 0}])
        for li in (0, 2):
            for st in w["courses"][li]["stones"]:
                a, b = st["x0"] // GRID, st["x1"] // GRID
                # Stein darf den Bereich [0,3) nicht beruehren
                self.assertTrue(b <= 0 or a >= 3, f"Lage {li}: Stein [{a},{b}) ragt in Bereich [0,3)")
        # In Lagen 1 und 3 sind Steine im Bereich erlaubt
        for li in (1, 3):
            hat_stein = any(st["x0"] // GRID < 3 and st["x1"] // GRID > 0 for st in w["courses"][li]["stones"])
            self.assertTrue(hat_stein, f"Lage {li}: sollte Steine im Bereich haben")

    def test_interlock_invalid_segments_gemeldet(self):
        # Verzahnungsbereich [0,4) auf 8-Raster-Wand: nach Aussparen bleibt Segment mit 4 Rastern
        w = build_wall("vzInv", 1000, 800, [], interlocks=[{"g0": 0, "g1": 4, "start_parity": 0}])
        # Wand ohne Verzahnungsproblem baubar (8 Raster)
        self.assertTrue(w["validation"]["buildable"])
        # Aber nach Verzahnung gibt es nicht baubare Segmente
        self.assertGreater(len(w["validation"]["interlock_invalid_segments"]), 0)
        # Die gemeldeten Segmente haben Breite 4 (nicht baubar)
        seg = w["validation"]["interlock_invalid_segments"][0]
        self.assertEqual(seg["breite_grid"], 4)


class BomConsistency(unittest.TestCase):
    def test_bom_matches_courses_and_columns(self):
        for key in REFERENCE_WALLS:
            w = build_reference(key)
            i2 = sum(1 for c in w["courses"] for s in c["stones"] if s["type"] == "i2")
            i3 = sum(1 for c in w["courses"] for s in c["stones"] if s["type"] == "i3")
            with self.subTest(wall=key):
                self.assertEqual(w["bom"]["i2"], i2)
                self.assertEqual(w["bom"]["i3"], i3)
                # Anker: je Segment 2 Enden -> Senkkopf(Fuss) + Spannmutter(sonst) == 2*Segmente
                nseg = sum(len(c["segments"]) for c in w["tension_columns"])
                self.assertEqual(w["bom"]["senkkopfschrauben"] + w["bom"]["spannmuttern"], 2 * nseg)
                # Dichtstreifen-Laenge = Stossfugen * Lagenhoehe
                self.assertEqual(w["bom"]["dichtstreifen_mm"], w["bom"]["stossfugen"] * COURSE)
                self.assertEqual(w["bom"]["gewindestangen"],
                                 sum(c["gewindestangen"] for c in w["tension_columns"]))


class Zwischenspannpunkte(unittest.TestCase):
    """[A-14]/[A-15]/[A-17] + Stosssperre [Z-7] — Paritaetsvertrag mit dem JS-Core.

    Der JS-Core prueft dieselben Faelle in tests/core/test-sembla-core.mjs; die goldenen
    Fixtures kennen keinen Override und koennen den manuellen Zweig deshalb nicht abdecken.
    """

    def test_innere_lagen_oberkanten(self):
        self.assertEqual(sc.lagen_oberkanten_innen(0, 1000), [200, 400, 600, 800])
        self.assertEqual(sc.lagen_oberkanten_innen(800, 2600),
                         [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400])
        # Genau eine Lage -> keine innere Oberkante (die Segmentenden sind Anker).
        self.assertEqual(sc.lagen_oberkanten_innen(0, 200), [])
        self.assertEqual(sc.lagen_oberkanten_innen(2000, 2200), [])

    def test_auto_punkt_lagengenau(self):
        # Naechste innere Oberkante zur halben Segmenthoehe.
        self.assertEqual(sc.auto_zwischenpunkt(0, 1200), 600)
        self.assertEqual(sc.auto_zwischenpunkt(800, 2600), 1600)
        self.assertIsNone(sc.auto_zwischenpunkt(0, 200))

    def test_auto_punkt_gleichstand_niedrigere_oberkante(self):
        # 2600 -> Mitte 1300, Kandidaten 1200 und 1400 sind gleich weit: die NIEDRIGERE gilt.
        self.assertEqual(sc.auto_zwischenpunkt(0, 2600), 1200)
        self.assertEqual(sc.auto_zwischenpunkt(0, 1000), 400)
        self.assertEqual(sc.auto_zwischenpunkt(2000, 2600), 2200)
        # Deterministisch bei Wiederholung (reine Funktion, kein Zustand).
        for _ in range(3):
            self.assertEqual(sc.auto_zwischenpunkt(0, 2600), 1200)

    def test_manuelle_mehrfachpunkte(self):
        punkte, fehler = sc.norm_zwischenpunkte([1200, 400, 1200], 2600)
        self.assertEqual(punkte, [400, 1200])       # sortiert, dedupliziert
        self.assertEqual(fehler, [])
        self.assertEqual(sc.zwischenpunkte_segment(0, 2600, [400, 1200, 2400]),
                         [400, 1200, 2400])
        # Ein Punkt aus einem anderen Segment gilt hier nicht und wird nicht hineingezogen.
        self.assertEqual(sc.zwischenpunkte_segment(2000, 2600, [400, 2200]), [2200])

    def test_unzulaessige_werte_werden_benannt_nicht_gerundet(self):
        punkte, fehler = sc.norm_zwischenpunkte([1250, 333.5, 0, 2600, 2800, 800], 2600)
        self.assertEqual(punkte, [800])
        gruende = sorted(f["grund"] for f in fehler)
        self.assertEqual(gruende, ["ausserhalb_wand"] * 3
                         + ["nicht_auf_lagen_oberkante", "nicht_ganzzahlig"])
        self.assertNotIn(1200, punkte)              # 1250 wird NICHT auf 1200 gerundet

    def test_kein_override_vs_leere_liste(self):
        self.assertIsNone(sc.norm_zwischenpunkte(None, 2600)[0])
        self.assertEqual(sc.norm_zwischenpunkte([], 2600)[0], [])
        # Die ausdrueckliche leere Liste faellt NICHT auf die Auto-Ableitung zurueck.
        self.assertEqual(sc.zwischenpunkte_segment(0, 2600, []), [])
        self.assertEqual(sc.zwischenpunkte_segment(0, 2600, None), [1200])

    def test_auto_wird_nicht_gespeichert(self):
        w = build_wall("zpAuto", 1000, 2000, [])
        self.assertNotIn("zwischenpunkte_mm", w["prestress"])
        self.assertNotIn("zwischenpunkt_fehler", w["validation"])
        self.assertNotIn("zwischenpunkt", json.dumps(w))
        # Abgeleitet wird er trotzdem — frisch, je Achse einer.
        zp = sc.wirksame_zwischenpunkte(w)
        self.assertEqual(len(zp), len(w["tension_columns"]))
        self.assertTrue(all(x["z_mm"] == 1000 for x in zp))

    def test_override_reist_mit_und_wird_validiert(self):
        w = build_wall("zpMan", 1000, 2000, [],
                       prestress={"zwischenpunkte_mm": [1400, 400, 333]})
        self.assertEqual(w["prestress"]["zwischenpunkte_mm"], [400, 1400])
        self.assertEqual(len(w["validation"]["zwischenpunkt_fehler"]), 1)
        # Geprueft wird der Override je Achse — welche Rasterlage die erste Achse hat, ist
        # dafuer unerheblich (seit #104 ist es 1 statt 0).
        k0 = w["tension_columns"][0]["k"]
        self.assertEqual([x["z_mm"] for x in sc.wirksame_zwischenpunkte(w) if x["k"] == k0],
                         [400, 1400])
        self.assertTrue(is_buildable(w))

    def test_auto_je_segment_an_einer_oeffnung(self):
        w = build_wall("zpSeg", 2000, 2600, [Opening(6, 10, 4, 10, "fenster")])
        col = next(c for c in w["tension_columns"] if 6 <= c["k"] < 10)
        self.assertEqual(len(col["segments"]), 2)
        zp = [x["z_mm"] for x in sc.wirksame_zwischenpunkte(w) if x["k"] == col["k"]]
        self.assertEqual(zp, [400, 2200])

    def test_z7_kopplung_weicht_aus(self):
        # 2000 aus {1000, 500}: ungesperrt 1000+1000 (Stoss auf 1000). Stossfrei ist 500+1000+500.
        self.assertEqual([x["len_mm"] for x in sc.kombiniere_laengen(2000, [1000, 500])["stuecke"]],
                         [1000, 1000])
        mit = sc.kombiniere_laengen(2000, [1000, 500], 200, [1000], False)
        self.assertEqual([x["len_mm"] for x in mit["stuecke"]], [500, 1000, 500])
        self.assertIsNone(mit["konflikt"])
        self.assertEqual(sum(x["len_mm"] for x in mit["stuecke"]), 2000)

    def test_z7_ohne_sperren_unveraendert(self):
        for bedarf, L in ((1700, [1000, 500]), (3000, [1000]), (400, [1000, 600]), (2600, [1100])):
            with self.subTest(bedarf=bedarf):
                erwartet = sc.kombiniere_laengen(bedarf, L)
                self.assertEqual(sc.kombiniere_laengen(bedarf, L, 200, None, False), erwartet)
                self.assertEqual(sc.kombiniere_laengen(bedarf, L, 200, [], True), erwartet)

    def test_z7_streckenende_nur_mit_reststueck_kopplung(self):
        offen = sc.kombiniere_laengen(2000, [1000], 200, [2000], False)
        self.assertEqual([x["len_mm"] for x in offen["stuecke"]], [1000, 1000])
        self.assertIsNone(offen["konflikt"])
        gekoppelt = sc.kombiniere_laengen(2000, [1000], 200, [2000], True)
        self.assertEqual(gekoppelt["konflikt"], "stoss_auf_zwischenpunkt")
        self.assertEqual([x["len_mm"] for x in gekoppelt["stuecke"]], [1000, 1000])

    def test_z7_unloesbar_wird_benannt(self):
        # Ohne Reststueck bleibt [Z-6] die genannte Ursache (hoeherer Rang).
        w = build_wall("zpK", 1000, 2000, [], prestress={"rod_lengths_mm": [1000]})
        self.assertTrue(all(k["grund"] == "kein_reststueck"
                            for k in w["validation"]["zuschnitt_konflikte"]))
        # Mit Reststueck greift die Sperre und wird mit eigenem Grund benannt.
        v = build_wall("zpK2", 1000, 2000, [], prestress={
            "rod_lengths_mm": [1000], "rod_rest_mm": 210, "rod_overhang_mm": 10})
        kk = v["validation"]["zuschnitt_konflikte"]
        self.assertTrue(kk and all(k["grund"] == "stoss_auf_zwischenpunkt" for k in kk))
        self.assertTrue(is_buildable(v))
        sg = v["tension_columns"][0]["segments"][0]
        self.assertEqual(sum(x["len_mm"] for x in sg["stuecke"]), sg["bedarf_mm"])

    def test_z7_steht_unter_z5(self):
        k = sc.kombiniere_laengen(1200, [1000], 200, [1000], False)
        self.assertEqual([x["len_mm"] for x in k["stuecke"]], [1000, 200])
        self.assertEqual(k["konflikt"], "stoss_auf_zwischenpunkt")

    def test_z7_kein_stoss_auf_punkthoehe(self):
        w = build_wall("zpFrei", 2000, 2600, [], prestress={
            "rod_lengths_mm": [1000, 500], "rod_rest_mm": 300, "rod_overhang_mm": 10})
        sperr = {(x["k"], x["z_mm"]) for x in sc.wirksame_zwischenpunkte(w)}
        for col in w["tension_columns"]:
            for sg in col["segments"]:
                z = sg["z0_mm"]
                for st in sg["stuecke"][:-1]:
                    z += st["len_mm"]
                    self.assertNotIn((col["k"], z), sperr)
        self.assertEqual(w["validation"]["zuschnitt_konflikte"], [])

    def test_punkte_aendern_achsen_und_anker_nicht(self):
        ops = [Opening(5, 11, 0, 10, "tuer")]
        a = build_wall("zpA", 2000, 2600, ops)
        b = build_wall("zpB", 2000, 2600, [Opening(5, 11, 0, 10, "tuer")],
                       prestress={"zwischenpunkte_mm": [600, 1800]})
        self.assertEqual([c["k"] for c in a["tension_columns"]],
                         [c["k"] for c in b["tension_columns"]])
        self.assertEqual([[(s["z0_mm"], s["z1_mm"]) for s in c["segments"]]
                          for c in a["tension_columns"]],
                         [[(s["z0_mm"], s["z1_mm"]) for s in c["segments"]]
                          for c in b["tension_columns"]])
        for f in ("spannplatten", "spannmuttern", "senkkopfschrauben", "kopplungsmuttern_basis"):
            with self.subTest(feld=f):
                self.assertEqual(a["bom"][f], b["bom"][f])

    def test_kombiniere_segment_sperrt_kopplung_zum_reststueck(self):
        a = sc.kombiniere_segment(1700, [1000, 500], True, 210, 10)
        self.assertEqual([x["len_mm"] for x in a["stuecke"]], [1000, 500, 210])
        b = sc.kombiniere_segment(1700, [1000, 500], True, 210, 10, [1000])
        self.assertEqual([x["len_mm"] for x in b["stuecke"]], [500, 1000, 210])
        self.assertIsNone(b["konflikt"])
        c = sc.kombiniere_segment(1700, [1000, 500], True, 210, 10, [1500])
        self.assertEqual(c["konflikt"], "stoss_auf_zwischenpunkt")


# ---------------------------------------------------------------------------
# KANONISCHES LAGENKANTENMODELL (#136)
#
# Jede Steinlage traegt Unterkante, Oberkante und Hoehe in mm als benannte Felder; die
# Lagenoberkante wird nirgends mehr aus „Lagenindex x course_mm" gerechnet, sondern aus diesen
# Feldern gelesen. `course_mm` bleibt die regulaere Lagenhoehe (200 mm) — genau deshalb kann die
# Hoehenzerlegung (#136) eine einzelne Ausgleichslage anhaengen, ohne dass ein Leser es merkt.
# ---------------------------------------------------------------------------
class TestLagenkanten(unittest.TestCase):
    def test_2600er_wand_traegt_je_lage_unterkante_oberkante_hoehe(self):
        w = build_wall("kanten2600", 2000, 2600, [])
        self.assertEqual(w["lagen"], 13)
        self.assertEqual(len(w["courses"]), 13)
        self.assertEqual(w["course_mm"], sc.COURSE)
        self.assertEqual(sc.COURSE, 200)
        for n, c in enumerate(w["courses"]):
            with self.subTest(lage=n):
                self.assertEqual(c["lage"], n)
                self.assertEqual(c["unterkante_mm"], n * 200)
                self.assertEqual(c["oberkante_mm"], (n + 1) * 200)
                self.assertEqual(c["hoehe_mm"], 200)
        self.assertEqual(w["courses"][0]["unterkante_mm"], 0)
        self.assertEqual(w["courses"][-1]["oberkante_mm"], w["height_mm"])
        for a, b in zip(w["courses"], w["courses"][1:]):
            self.assertEqual(a["oberkante_mm"], b["unterkante_mm"])

    def test_segmentkanten_stammen_aus_den_lagenkanten(self):
        w = build_wall("kantenSeg", 3000, 2600, [Opening(5, 11, 0, 10, "tuer")], None, None,
                       [{"x0_mm": 1500, "x1_mm": 3000, "height_mm": 1800}])
        unter = [c["unterkante_mm"] for c in w["courses"]]
        ober = [c["oberkante_mm"] for c in w["courses"]]
        for col in w["tension_columns"]:
            for sg in col["segments"]:
                with self.subTest(k=col["k"], z0=sg["z0_mm"]):
                    self.assertEqual(sg["z0_mm"], unter[sg["lage0"]])
                    self.assertEqual(sg["z1_mm"], ober[sg["lage1"] - 1])
                    self.assertEqual(sg["z1_mm"] - sg["z0_mm"],
                                     sum(c["hoehe_mm"] for c in w["courses"][sg["lage0"]:sg["lage1"]]))
        # Der Dichtstreifen einer Stossfuge ist so hoch wie SEINE Lage.
        self.assertEqual(w["bom"]["dichtstreifen_mm"],
                         sum(len(c["joints_grid"]) * c["hoehe_mm"] for c in w["courses"]))

    def test_lagen_kanten_und_wand_lagen_kanten(self):
        self.assertEqual(sc.lagen_kanten(3), [
            {"lage": 0, "unterkante_mm": 0, "oberkante_mm": 200, "hoehe_mm": 200},
            {"lage": 1, "unterkante_mm": 200, "oberkante_mm": 400, "hoehe_mm": 200},
            {"lage": 2, "unterkante_mm": 400, "oberkante_mm": 600, "hoehe_mm": 200}])
        self.assertEqual(sc.lagen_kanten(0), [])
        w = build_wall("kantenQuelle", 1000, 2000, [])
        self.assertEqual(sc.wand_lagen_kanten(w), sc.lagen_kanten(10))
        # Altstand OHNE die Felder bleibt lesbar (Rueckfall auf die regulaere Lagenhoehe).
        alt = {"course_mm": 200, "lagen": 10, "height_mm": 2000,
               "courses": [{"lage": c["lage"], "stones": c["stones"],
                            "joints_grid": c["joints_grid"]} for c in w["courses"]]}
        self.assertEqual(sc.wand_lagen_kanten(alt), sc.lagen_kanten(10))
        self.assertEqual(sc.wand_lagen_kanten({"course_mm": 200, "height_mm": 600}),
                         sc.lagen_kanten(3))

    def test_lagen_oberkanten_innen_liest_die_kantenliste(self):
        K = sc.lagen_kanten(13)
        self.assertEqual(sc.lagen_oberkanten_innen(0, 1000, K), sc.lagen_oberkanten_innen(0, 1000))
        self.assertEqual(sc.lagen_oberkanten_innen(800, 2600, K),
                         sc.lagen_oberkanten_innen(800, 2600))
        self.assertEqual(sc.lagen_oberkanten_innen(0, 200, K), [])
        self.assertEqual(sc.auto_zwischenpunkt(0, 2600, K), sc.auto_zwischenpunkt(0, 2600))
        self.assertEqual(sc.zwischenpunkte_segment(0, 2600, None, K),
                         sc.zwischenpunkte_segment(0, 2600, None))
        w = build_wall("kantenZp", 2000, 2600, [])
        ohne = dict(w, courses=[{"lage": c["lage"], "stones": c["stones"],
                                 "joints_grid": c["joints_grid"]} for c in w["courses"]])
        self.assertEqual(sc.wirksame_zwischenpunkte(w), sc.wirksame_zwischenpunkte(ohne))

    def test_wandhoehe_bleibt_vielfaches_der_lagenhoehe(self):
        # MUSS NOT: OHNE aktivierte Ausgleichslage werden nicht durch 200 teilbare Hoehen
        # weiter mit derselben Meldung abgewiesen.
        with self.assertRaises(InvalidDimensionError) as cm:
            build_wall("krumm", 1000, 2500, [])
        self.assertEqual(str(cm.exception), "Wandhoehe 2500 ist kein Vielfaches von 200 mm")
        with self.assertRaises(InvalidDimensionError) as cm2:
            build_wall("winzig", 1000, 100, [])
        self.assertEqual(str(cm2.exception), "Wandhoehe 100 ist kein Vielfaches von 200 mm")
        for h in (200, 1800, 2600, 4000):
            with self.subTest(hoehe=h):
                w = build_wall("h%d" % h, 1000, h, [])
                self.assertEqual(len(w["courses"]), h // sc.COURSE)
                self.assertTrue(all(c["hoehe_mm"] == sc.COURSE for c in w["courses"]))

    # Vergleichstest vor/nach dem Umbau: die strukturelle Signatur mehrerer Referenzwaende —
    # Verband (Steine, Stossfugen), Spannachsen (Segmente, Zuschnittstuecke) und Mengen (BOM,
    # Bleche, Punkte, Validierung) — ist an den Stand VOR #136 genagelt. Die Hashes stammen aus
    # genau diesem Stand; sie decken auch Faelle ab, die die goldenen Fixtures nicht tragen
    # (Staffelung, Zuschnitt aus mehreren Standardlaengen). Die neuen Lagenkantenfelder stehen
    # bewusst NICHT im Digest — geprueft wird die Strukturgleichheit, nicht die Zusatzangabe.
    STRUKTUR_VOR_136 = {
        "ref1_glatte_wand": "713ac098903a19c7a1ffef2084b10df2f4f095a4cfa1e6d0410089e5e31f8870",
        "ref2_wand_tuer": "80a9808f1aa5563a946944f8f5d4478ebd3a1e68ac10ffa5ba41484c47f4852e",
        "ref3_wand_fenster": "42e1c346a9bcadc96f1c00dc99de2f596a9ab38659beadd1cd5e24548ba7ad68",
        "staffel": "f0496b283ada1a52e2f52ce58036d11e19eccb597f180ebd0d664e51b4419bc1",
        "zuschnitt": "50c79ae882346edfc2698d0dce87cc1e08b23f9b9d1747f086f6c4c1cfca179c",
    }

    @staticmethod
    def _vergleichswaende():
        return {
            "ref1_glatte_wand": build_wall("ref1_glatte_wand", 1000, 2000, [], None,
                                           {"top_connection": "blech"}),
            "ref2_wand_tuer": build_wall("ref2_wand_tuer", 2000, 2600,
                                         [Opening(5, 11, 0, 10, "tuer")], None,
                                         {"top_connection": "blech"}),
            "ref3_wand_fenster": build_wall("ref3_wand_fenster", 2000, 2600,
                                            [Opening(6, 10, 4, 10, "fenster")], None,
                                            {"top_connection": "blech"}),
            "staffel": build_wall("staffel", 3000, 2600, [], None, {"top_connection": "blech"},
                                  [{"x0_mm": 1500, "x1_mm": 3000, "height_mm": 1800}]),
            "zuschnitt": build_wall("zuschnitt", 2000, 2600, [Opening(5, 11, 0, 10, "tuer")],
                                    None, {"top_connection": "spannplatte",
                                           "rod_lengths_mm": [1000, 625, 375],
                                           "rod_rest_mm": 375, "rod_overhang_mm": 10}),
        }

    @staticmethod
    def _struktur_digest(w):
        """Strukturelle Signatur einer Wand — bewusst OHNE die neuen Lagenkantenfelder."""
        return {
            "courses": [{"lage": c["lage"], "joints": c["joints_grid"],
                         "stones": [[s["type"], s["x0"], s["x1"]] for s in c["stones"]]}
                        for c in w["courses"]],
            "achsen": [{"k": c["k"], "x_mm": c["x_mm"], "durchgehend": c["durchgehend"],
                        "segments": [{"z0": s["z0_mm"], "z1": s["z1_mm"], "lage0": s["lage0"],
                                      "lage1": s["lage1"], "bedarf": s["bedarf_mm"],
                                      "ueberstand": s["ueberstand_mm"],
                                      "verschnitt": s["verschnitt_mm"],
                                      "stuecke": [[x["len_mm"], x["art"], x["quelle_mm"]]
                                                  for x in s["stuecke"]],
                                      "konflikt": s["zuschnitt_konflikt"]}
                                     for s in c["segments"]]}
                       for c in w["tension_columns"]],
            "bom": w["bom"], "base_plate": w["base_plate"], "top_plate": w["top_plate"],
            "ausgleichspunkte": w["ausgleichspunkte"],
            "deckenanschlusspunkte": w["deckenanschlusspunkte"],
            "validation": w["validation"],
        }

    def test_referenzwaende_strukturidentisch_zum_stand_vor_dem_umbau(self):
        for key, w in self._vergleichswaende().items():
            with self.subTest(wand=key):
                roh = json.dumps(self._struktur_digest(w), sort_keys=True, separators=(",", ":"))
                self.assertEqual(hashlib.sha256(roh.encode()).hexdigest(),
                                 self.STRUKTUR_VOR_136[key])



# ---------------------------------------------------------------------------
# AUSGLEICHSLAGE — freie Wandhoehe mit genau EINER oberen Ausgleichslage (#136)
#
# n = floor(H/200) regulaere Lagen plus — bei Resthoehe > 0 und aktiviertem Flag — GENAU EINE
# oberste Lage mit der Resthoehe. Ohne das Flag bleibt dieselbe Hoehe ein benannter Konflikt.
# H wird in keinem Pfad gerundet. Der JS-Core rechnet paritaetisch (test-sembla-core.mjs).
# ---------------------------------------------------------------------------
class TestAusgleichslage(unittest.TestCase):
    @staticmethod
    def _ausgleichslagen(w):
        return [c for c in w["courses"] if c.get("ausgleich") is True]

    def test_zerlegung_ist_die_eine_stelle(self):
        z = sc.hoehen_zerlegung(2600, True)
        self.assertEqual((z["lagen"], z["regulaer"], z["rest_mm"]), (13, 13, 0))
        self.assertEqual(z["kanten"], sc.lagen_kanten(13))
        z2 = sc.hoehen_zerlegung(2570, True)
        self.assertEqual((z2["lagen"], z2["regulaer"], z2["rest_mm"]), (13, 12, 170))
        self.assertEqual(z2["kanten"][-1], {"lage": 12, "unterkante_mm": 2400,
                                            "oberkante_mm": 2570, "hoehe_mm": 170,
                                            "ausgleich": True})
        self.assertEqual(z2["kanten"][:12], sc.lagen_kanten(12))
        # Die Zielhoehe wird NIE gerundet — die Kantenliste endet exakt auf ihr.
        self.assertEqual(z2["kanten"][-1]["oberkante_mm"], 2570)

    def test_resthoehe_null_erzeugt_keine_ausgleichslage(self):
        w = build_wall("h2600", 1000, 2600, [], None, None, [], None, True)
        self.assertEqual(w["lagen"], 13)
        self.assertEqual(self._ausgleichslagen(w), [])
        self.assertTrue(all(c["hoehe_mm"] == COURSE for c in w["courses"]))

    def test_genau_eine_oberste_ausgleichslage(self):
        w = build_wall("h2570", 1000, 2570, [], None, None, [], None, True)
        self.assertEqual(w["height_mm"], 2570)
        self.assertEqual(w["lagen"], 13)
        self.assertTrue(w["ausgleichslage_aktiv"])
        ag = self._ausgleichslagen(w)
        self.assertEqual(len(ag), 1)
        self.assertEqual(ag[0]["lage"], 12)
        self.assertEqual((ag[0]["unterkante_mm"], ag[0]["oberkante_mm"], ag[0]["hoehe_mm"]),
                         (2400, 2570, 170))
        # Keine regulaere Lage entfernt, nie zwei niedrigere kombiniert.
        self.assertEqual(len([c for c in w["courses"] if c["hoehe_mm"] == COURSE]), 12)

    def test_deaktiviert_wird_benannt_abgewiesen(self):
        for flag in (None, False, "true", 1):
            with self.subTest(flag=flag):
                with self.assertRaises(InvalidDimensionError) as cm:
                    build_wall("krumm", 1000, 2570, [], None, None, [], None, flag)
                self.assertEqual(str(cm.exception),
                                 "Wandhoehe 2570 ist kein Vielfaches von 200 mm")
                self.assertEqual(getattr(cm.exception, "grund", None), sc.AUSGLEICH_KONFLIKT)

    def test_ohne_feld_unveraendert(self):
        w = build_wall("alt", 2000, 2600, [Opening(5, 11, 0, 10, "tuer")])
        self.assertNotIn("ausgleichslage_aktiv", w)
        self.assertTrue(all("ausgleich" not in c for c in w["courses"]))

    def test_sehr_kleine_resthoehe(self):
        w = build_wall("h2403", 1000, 2403, [], None, None, [], None, True)
        ag = self._ausgleichslagen(w)
        self.assertEqual(len(ag), 1)
        self.assertEqual((ag[0]["unterkante_mm"], ag[0]["oberkante_mm"], ag[0]["hoehe_mm"]),
                         (2400, 2403, 3))

    def test_ausgleichslage_entsteht_im_bestehenden_tiling(self):
        w = build_wall("h2570", 2000, 2570, [], None, None, [], None, True)
        ag = self._ausgleichslagen(w)[0]
        self.assertTrue(ag["stones"])
        self.assertTrue(all(s["type"] in ("i2", "i3") for s in ag["stones"]))
        self.assertEqual(ag["stones"][0]["x0"], 0)
        self.assertEqual(ag["stones"][-1]["x1"], 2000)
        self.assertFalse(set(ag["joints_grid"]) & set(w["courses"][11]["joints_grid"]))
        self.assertEqual(w["bom"]["dichtstreifen_mm"],
                         sum(len(c["joints_grid"]) * c["hoehe_mm"] for c in w["courses"]))

    def test_vorspannung_rechnet_mit_realer_hoehe(self):
        ps = {"top_connection": "spannplatte", "rod_lengths_mm": [1000, 625, 375],
              "rod_rest_mm": 375, "rod_overhang_mm": 10}
        w = build_wall("h2570", 1000, 2570, [], None, ps, [], None, True)
        for col in w["tension_columns"]:
            sg = col["segments"][0]
            self.assertEqual((sg["z0_mm"], sg["z1_mm"]), (0, 2570))
            self.assertEqual(sg["bedarf_mm"], 2580)
        zp = sc.wirksame_zwischenpunkte(w)
        self.assertTrue(zp)
        self.assertTrue(all(p["z_mm"] % COURSE == 0 and p["z_mm"] < 2570 for p in zp))

    def test_staffelung_erzeugt_keine_zweite_ausgleichslage(self):
        steps = [{"x0_mm": 0, "x1_mm": 1000, "height_mm": 1800}]
        w = build_wall("staffel2570", 2000, 2570, [], None, None, steps, None, True)
        self.assertEqual(len(self._ausgleichslagen(w)), 1)
        self.assertEqual(w["steps"][0]["height_mm"], 1800)
        tief = [c for c in w["tension_columns"] if c["x_mm"] < 1000]
        self.assertTrue(tief)
        self.assertTrue(all(c["segments"][-1]["z1_mm"] == 1800 for c in tief))
        hoch = [c for c in w["tension_columns"] if c["x_mm"] > 1000]
        self.assertTrue(all(c["segments"][-1]["z1_mm"] == 2570 for c in hoch))
        self.assertTrue(all(s["x0"] >= 1000 for s in self._ausgleichslagen(w)[0]["stones"]))

    def test_oeffnung_erzeugt_keine_zweite_ausgleichslage(self):
        w = build_wall("oeffnung2570", 2000, 2570, [Opening(5, 11, 0, 10, "tuer")],
                       None, None, [], None, True)
        ag = self._ausgleichslagen(w)
        self.assertEqual(len(ag), 1)
        self.assertEqual(ag[0]["lage"], len(w["courses"]) - 1)

class BodenblechAussparungen(unittest.TestCase):
    """Manuell gewaehlte 125-mm-Rasterfelder ohne Bodenblech ([A-28]/[A-29]/[A-30], #138).

    DIESELBEN Faelle stehen wortgleich in test-sembla-core.mjs — sie sind der
    Paritaetsvertrag zwischen Orakel und Betriebskopie.
    """
    @staticmethod
    def wand(g, laenge=2000, ps=None):
        p = dict(ps or {})
        p["base_plate_aussparungen_grid"] = g
        return build_wall("as", laenge, 2600, [], None, p)

    @staticmethod
    def kurz(w):
        return " ".join(str(t["x0_mm"]) + ":" + str(t["raster_mm"])
                        + ("S" if t["art"] == "sonder" else "")
                        for t in w["base_plate"]["teile"])

    def test_anfang_mitte_ende_disjunkt_und_zusammengefasst(self):
        # 7 und 8 sind BENACHBART und werden zu genau EINEM Intervall zusammengefasst.
        w = self.wand([15, 7, 0, 8, 7])                  # ungeordnet + doppelt: egal
        self.assertEqual(w["prestress"]["base_plate_aussparungen_grid"], [0, 7, 8, 15])
        lu = w["base_plate"]["aussparungen"]
        self.assertEqual([(l["g0"], l["g1"]) for l in lu], [(0, 1), (7, 9), (15, 16)])
        for a, b in zip(lu, lu[1:]):
            self.assertLess(a["x1_mm"], b["x0_mm"])
        for t in w["base_plate"]["teile"]:
            for l in lu:
                self.assertTrue(t["x0_mm"] >= l["x1_mm"]
                                or t["x0_mm"] + t["raster_mm"] <= l["x0_mm"])
        self.assertEqual(self.kurz(w), "125:750 1125:750")
        self.assertEqual(w["validation"]["blech_konflikte"], [])

    def test_summe_der_rastermasse_plus_luecken_ist_die_wandlaenge(self):
        for g in ([0], [8], [0, 7, 8, 15], [15], [3, 4, 5]):
            with self.subTest(g=g):
                w = self.wand(g)
                teile_mm = sum(t["raster_mm"] for t in w["base_plate"]["teile"])
                lu_mm = sum(l["laenge_mm"] for l in w["base_plate"]["aussparungen"])
                self.assertEqual(teile_mm + lu_mm, w["length_mm"])
                self.assertEqual(lu_mm, len(g) * GRID)
                # Mengenbasis: nur die Teile.
                self.assertEqual(w["base_plate"]["laenge_mm"], teile_mm)
                self.assertEqual(w["bom"]["stahlblech_mm"], teile_mm)
                self.assertEqual(w["base_plate"]["module"], len(w["base_plate"]["teile"]))

    def test_unbaubarer_kurzbereich_wird_benannt_und_nicht_ueberbrueckt(self):
        w = self.wand([1])                                # Rest [0, 125) < 250 mm
        self.assertEqual(w["validation"]["blech_konflikte"],
                         [{"grund": "bereich_unbaubar", "x_mm": 0, "x0_mm": 0,
                           "x1_mm": 125, "laenge_mm": 125}])
        self.assertEqual(self.kurz(w), "0:125S 250:1250 1500:500")
        self.assertTrue(w["validation"]["buildable"])

    def test_unzulaessige_felder_verworfen_und_benannt(self):
        w = self.wand([2, 2.5, 99, -1, 2])
        self.assertEqual(w["prestress"]["base_plate_aussparungen_grid"], [2])
        self.assertEqual(w["validation"]["aussparung_fehler"],
                         [{"grund": "nicht_ganzzahlig", "wert": 2.5},
                          {"grund": "ausserhalb_wand", "wert": 99},
                          {"grund": "ausserhalb_wand", "wert": -1}])
        self.assertEqual(len(w["base_plate"]["aussparungen"]), 1)
        self.assertEqual(w["base_plate"]["aussparungen"][0]["g0"], 2)

    def test_gekuerzte_wand_verwirft_das_aussenliegende_feld(self):
        lang = self.wand([3, 14], 2000)
        self.assertEqual(len(lang["base_plate"]["aussparungen"]), 2)
        self.assertNotIn("aussparung_fehler", lang["validation"])
        kurz = self.wand([3, 14], 1000)                   # 8 Raster -> 14 liegt draussen
        self.assertEqual(kurz["validation"]["aussparung_fehler"],
                         [{"grund": "ausserhalb_wand", "wert": 14}])
        self.assertEqual(kurz["prestress"]["base_plate_aussparungen_grid"], [3])
        self.assertEqual(sum(t["raster_mm"] for t in kurz["base_plate"]["teile"]) + GRID, 1000)

    def test_stossregel_gilt_im_bereich_nicht_an_seinen_enden(self):
        w = self.wand([3], 5000, {"blech_lengths_mm": [1250, 500, 375]})
        fugen = set(w["courses"][0]["joints_grid"])
        for t in w["base_plate"]["teile"]:
            e = t["x0_mm"] + t["raster_mm"]
            bereichsende = e in (375, 5000)
            self.assertTrue(bereichsende or (e // GRID) not in fugen
                            or any(k["grund"] == "stoss_auf_steinstoss" and k["x_mm"] == e
                                   for k in w["validation"]["blech_konflikte"]), f"Stoss {e}")
            self.assertEqual(t["bauteil_mm"], t["raster_mm"] - sc.BLECH_SPIEL)

    def test_bereiche_sind_das_komplement_der_luecken(self):
        r = sc.zerlege_bodenblech(2000, sc.BLECH_LAENGEN, [], [{"g0": 4, "g1": 6}])
        self.assertEqual([(b["x0_mm"], b["x1_mm"]) for b in r["bereiche"]],
                         [(0, 500), (750, 2000)])
        self.assertEqual(sum(b["laenge_mm"] for b in r["bereiche"])
                         + sum(l["laenge_mm"] for l in r["luecken"]), 2000)
        ohne = sc.zerlege_bodenblech(2000, sc.BLECH_LAENGEN, [])
        self.assertEqual(ohne["bereiche"], [{"x0_mm": 0, "x1_mm": 2000, "laenge_mm": 2000}])
        self.assertEqual(ohne["luecken"], [])
        self.assertEqual(ohne["konflikte"], [])

    def test_bestandswaende_ohne_aussparung_bleiben_identisch(self):
        for ps in (None, {}, {"top_connection": "blech"}, {"blech_lengths_mm": [1250]}):
            with self.subTest(ps=ps):
                w = build_wall("ohne", 5000, 2600, [], None, ps)
                self.assertNotIn("base_plate_aussparungen_grid", w["prestress"])
                self.assertNotIn("aussparungen", w["base_plate"])
                self.assertNotIn("aussparung_fehler", w["validation"])
                self.assertEqual(w["base_plate"]["laenge_mm"], 5000)


class TestAusgleichspunkteJeBereich(unittest.TestCase):
    """Ausgleichspunkte je REAL BELEGTEM Bodenblechbereich ([A-31], #138).

    Vorher lief die Verteilung ueber die ganze Wandlaenge: ein von einer Aussparung
    UEBERHOLTER frueherer Blechstoss trug weiter ein Ausgleichsblech, und das neue reale
    Segmentende blieb ohne Auflager.
    """

    @staticmethod
    def _wand(g):
        ps = None if g is None else {"base_plate_aussparungen_grid": g}
        return build_wall("ag", 5000, 2600, [], None, ps)

    @staticmethod
    def _bereiche(w):
        luecken, bereiche, x = w["base_plate"].get("aussparungen", []), [], 0
        for lu in luecken:
            if lu["x0_mm"] > x:
                bereiche.append((x, lu["x0_mm"]))
            x = lu["x1_mm"]
        if x < 5000:
            bereiche.append((x, 5000))
        return luecken, bereiche

    def test_mittige_aussparung_setzt_beide_segmentenden(self):
        w = self._wand([19, 20])                      # 2375 mm … 2625 mm ausgespart
        arten = {p["x_mm"]: p["art"] for p in w["ausgleichspunkte"]}
        self.assertEqual(arten.get(2375), "bereichsende")
        self.assertEqual(arten.get(2625), "bereichsende")
        self.assertFalse([p for p in w["ausgleichspunkte"] if 2375 < p["x_mm"] < 2625])
        # Ohne Aussparung liegt bei 2250 ein Stosspunkt — mit Aussparung ist er ueberholt.
        ohne = {p["x_mm"]: p["art"] for p in self._wand(None)["ausgleichspunkte"]}
        self.assertEqual(ohne.get(2250), "blechstoss")
        self.assertNotIn(2250, arten)

    def test_randseitige_und_mehrere_aussparungen(self):
        for g in ([0, 1], [38, 39], [8, 9, 25, 26], [0, 1, 19, 20, 38, 39]):
            with self.subTest(g=g):
                w = self._wand(g)
                luecken, bereiche = self._bereiche(w)
                for p in w["ausgleichspunkte"]:
                    self.assertFalse(any(lu["x0_mm"] < p["x_mm"] < lu["x1_mm"] for lu in luecken))
                gesetzt = {p["x_mm"] for p in w["ausgleichspunkte"]}
                for a, b in bereiche:
                    self.assertIn(a, gesetzt)
                    self.assertIn(b, gesetzt)
                # Deterministisch: dieselbe Eingabe, dieselbe Liste.
                self.assertEqual(w["ausgleichspunkte"], self._wand(g)["ausgleichspunkte"])

    def test_zieldichte_gilt_je_bereich(self):
        w = self._wand([8, 9, 25, 26])
        _, bereiche = self._bereiche(w)
        for a, b in bereiche:
            n = len([p for p in w["ausgleichspunkte"] if a <= p["x_mm"] <= b])
            self.assertGreaterEqual(n, math.ceil(3 * (b - a) / 1000))

    def test_rueckkehr_ohne_aussparung_ist_bit_genau_der_altstand(self):
        ohne = self._wand(None)
        zurueck = self._wand([])
        self.assertEqual(zurueck["ausgleichspunkte"], ohne["ausgleichspunkte"])
        self.assertEqual(zurueck["base_plate"]["teile"], ohne["base_plate"]["teile"])
        self.assertFalse([p for p in zurueck["ausgleichspunkte"] if p["art"] == "bereichsende"])
        achsen = [c["x_mm"] for c in ohne["tension_columns"]]
        self.assertEqual(
            sc.verteile_ausgleichspunkte(5000, [1125, 2250, 3375, 4500], achsen),
            sc.verteile_ausgleichspunkte(5000, [1125, 2250, 3375, 4500], achsen,
                                         sc.AUSGLEICH_ACHSVERSATZ,
                                         [{"x0_mm": 0, "x1_mm": 5000}]))

    def test_override_sperrt_auch_die_bereichsverteilung(self):
        w = build_wall("ag", 5000, 2600, [], None,
                       {"base_plate_aussparungen_grid": [19, 20],
                        "ausgleich_override_mm": [0, 2400, 5000]})
        self.assertEqual(w["ausgleichspunkte"],
                         [{"x_mm": 0, "art": "manuell"}, {"x_mm": 2400, "art": "manuell"},
                          {"x_mm": 5000, "art": "manuell"}])


if __name__ == "__main__":
    unittest.main(verbosity=2)
