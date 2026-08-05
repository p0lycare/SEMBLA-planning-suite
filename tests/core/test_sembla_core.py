#!/usr/bin/env python3
"""Testsuite fuer den SEMBLA Core. Lauf: python3 -m unittest -v  (oder pytest)."""
import json, math, os, unittest
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
        for key in REFERENCE_WALLS:
            w = build_reference(key)
            ks = {c["k"] for c in w["tension_columns"]}
            with self.subTest(wall=key):
                self.assertIn(0, ks)
                self.assertIn(w["N_grid"] - 1, ks)

    def test_columns_beside_openings(self):
        w = build_reference("ref2_wand_tuer")
        ks = {c["k"] for c in w["tension_columns"]}
        op = w["openings"][0]
        self.assertIn(op["g0"] - 1, ks)   # links der Tuer
        self.assertIn(op["g1"], ks)       # rechts der Tuer

    # Issue #13: Startachse der Auto-Verteilung (1. oder 2. Rasterachse), danach balanciert
    # mit Abstaenden <= max_span_grid weiter. N=16 ist bewusst NICHT glatt durch 3 teilbar.
    @staticmethod
    def _ks(**ps):
        return [c["k"] for c in build_wall("sa", 2000, 2600, [], prestress=ps)["tension_columns"]]

    def test_start_axis_default_is_first_axis(self):
        ks = self._ks(max_span_grid=3)
        self.assertEqual(ks[0], 0)
        self.assertEqual(ks, self._ks(max_span_grid=3, start_axis_grid=0))
        self.assertEqual(ks, [0, 3, 6, 9, 12, 15])

    def test_start_axis_second_axis(self):
        N, x = 16, 3
        ks = self._ks(max_span_grid=x, start_axis_grid=1)
        self.assertEqual(ks[0], 1)              # Startanker
        self.assertEqual(ks[-1], N - 1)         # Endanker
        self.assertNotIn(0, ks)
        for a, b in zip(ks, ks[1:]):
            self.assertLessEqual(b - a, x, f"Abstand {a}->{b}")
        self.assertEqual(ks, [1, 4, 7, 9, 12, 15])   # 3,3,2,3,3 (nicht glatt teilbar)

    def test_start_axis_extras_and_manual_precedence(self):
        op = [Opening(5, 11, 0, 10, "tuer")]
        ks = {c["k"] for c in build_wall("sa", 2000, 2600, op,
                                         prestress={"max_span_grid": 3, "start_axis_grid": 1})["tension_columns"]}
        self.assertIn(4, ks); self.assertIn(11, ks)      # Oeffnungskanten additiv
        self.assertNotIn(0, ks); self.assertIn(15, ks)
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
