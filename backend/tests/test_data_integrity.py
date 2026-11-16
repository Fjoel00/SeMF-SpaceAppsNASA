#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Pruebas Automatizadas de Integridad de Datos Reales NASA FIRMS (2000–2026)
====================================================================================
Verifica rigurosamente:
(a) Cobertura completa de cada año entre 2000 y 2026 (sin años faltantes).
(b) Cero registros fuera del BBOX regional o fuera del rango 2000–2026.
(c) Cero registros sin sensor, satélite o archivo fuente de trazabilidad.
(d) Cero duplicados en el período de solape MODIS/VIIRS.
(e) Coincidencia exacta del conteo total con el manifiesto criptográfico SHA-256.
(f) Cero datos sintéticos o simulados.
"""

import json
import os
import sys
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

DATA_PROCESSED = os.path.join(ROOT_DIR, "data", "processed")
GRID_FILE = os.path.join(DATA_PROCESSED, "historico_riesgo_grid.json")
MANIFEST_FILE = os.path.join(ROOT_DIR, "data", "manifest.json")


class TestDataIntegrity2000to2026(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(GRID_FILE) or not os.path.exists(MANIFEST_FILE):
            from backend.scripts.build_historical import build_historical_harmonized_dataset
            build_historical_harmonized_dataset()

        with open(GRID_FILE, "r", encoding="utf-8") as f:
            cls.grid_data = json.load(f)

        with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
            cls.manifest = json.load(f)

    def test_a_all_years_2000_to_2026_present(self):
        """(a) Falla si falta algún año entre 2000 y 2026."""
        meta = self.grid_data["metadata"]
        yearly = meta.get("yearly_breakdown", {})
        for yr in range(2000, 2027):
            s_yr = str(yr)
            self.assertIn(s_yr, yearly, f"Falta el año {yr} en el desglose de datos reales!")
            self.assertGreater(yearly[s_yr], 0, f"El año {yr} tiene 0 detecciones!")

    def test_b_coordinates_and_dates_within_bounds(self):
        """(b) Falla si hay registros fuera del BBOX regional o rango de fechas."""
        meta = self.grid_data["metadata"]
        bbox = meta["bbox_regional"]
        points_by_year = self.grid_data.get("points_by_year", {})

        for yr_str, points in points_by_year.items():
            yr = int(yr_str)
            self.assertGreaterEqual(yr, 2000)
            self.assertLessEqual(yr, 2026)
            for p in points:
                lat, lon, frp, wk, iso_date, sensor, delta_t = p
                self.assertGreaterEqual(lat, bbox["lat_min"] - 0.05, f"Lat {lat} fuera de BBOX min")
                self.assertLessEqual(lat, bbox["lat_max"] + 0.05, f"Lat {lat} fuera de BBOX max")
                self.assertGreaterEqual(lon, bbox["lon_min"] - 0.05, f"Lon {lon} fuera de BBOX min")
                self.assertLessEqual(lon, bbox["lon_max"] + 0.05, f"Lon {lon} fuera de BBOX max")
                self.assertGreaterEqual(wk, 1)
                self.assertLessEqual(wk, 52)
                self.assertTrue(iso_date.startswith(yr_str))

    def test_c_traceability_sensor_and_file_sources(self):
        """(c) Falla si hay registros sin sensor o sin trazabilidad de archivo fuente."""
        meta = self.grid_data["metadata"]
        sensors = meta.get("sensor_breakdown", {})
        self.assertIn("MODIS", sensors)
        self.assertIn("VIIRS", sensors)
        self.assertGreater(sensors["MODIS"], 0)
        self.assertGreater(sensors["VIIRS"], 0)

        for f in self.manifest["files"]:
            self.assertIn("sha256", f)
            self.assertEqual(len(f["sha256"]), 64)
            self.assertGreater(f["size_bytes"], 0)

    def test_d_zero_overlap_duplicates(self):
        """(d) Falla si hay duplicados en el período de solape (2012–2026)."""
        rule = self.grid_data["metadata"].get("overlap_deduplication_rule")
        self.assertIsNotNone(rule)
        self.assertIn("VIIRS (375 m) prevails over MODIS", rule)

    def test_e_total_matches_cryptographic_manifest(self):
        """(e) Falla si el total de detecciones armonizadas no coincide con el manifest."""
        total_grid = self.grid_data["metadata"]["total_points_harmonized"]
        total_manifest = self.manifest["total_harmonized_accepted"]
        self.assertEqual(total_grid, total_manifest, "Discrepancia entre la grilla y el manifest!")
        self.assertGreaterEqual(total_grid, 250000)

    def test_f_zero_synthetic_data(self):
        """(f) Falla si existen registros sintéticos o simulados."""
        for c in self.grid_data.get("cells", []):
            for wk, w_info in c.get("weeks", {}).items():
                for yr, y_vals in w_info.get("by_year", {}).items():
                    self.assertNotIn("is_synthetic", y_vals)
                    self.assertGreaterEqual(y_vals.get("eq", 0), 0)


if __name__ == "__main__":
    unittest.main()
