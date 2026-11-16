#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pruebas Obligatorias del Motor de Rutas de Evacuación Inteligentes (8 Casos Críticos)
=====================================================================================
Verifica rigurosamente los 8 escenarios exigidos en la especificación maestra:
1. Ruta sin incendios.
2. Ruta con un foco cercano.
3. Ruta con un incendio sobre el camino directo.
4. Varias alternativas disponibles.
5. Ninguna ruta segura disponible (fallback conservador).
6. Datos de incendios desactualizados.
7. Coordenadas inválidas.
8. Refugio sin información confiable.
"""

import os
import sys
import unittest
from datetime import datetime, timezone

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.app.routing.engine import IntelligentEvacuationEngine
from backend.app.schemas.api_schemas import SchemaValidationError


class TestIntelligentRoutingEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = IntelligentEvacuationEngine()
        cls.default_weather = {
            "wind_speed_kmh": 32.0,
            "wind_direction_deg": 200.0,
            "wind_push_azimuth_deg": 20.0,
            "temperature_c": 31.0,
            "relative_humidity_pct": 22.0,
        }

    def test_case_1_route_without_fires(self):
        """Caso 1: Ruta sin incendios -> Retorna ruta recomendada SAFE sin bloqueos."""
        res = self.engine.compute_evacuation_plan(
            request_payload={
                "origin_lat": -33.1500,
                "origin_lon": -66.0800,
                "target_shelter_id": "SHL-SL-001",
                "safety_buffer_km": 1.2,
                "custom_fires": [],
            },
            active_fires=[],
            weather=self.default_weather,
        )
        self.assertEqual(res["overall_status"], "SAFE_ROUTE_VERIFIED")
        self.assertIsNotNone(res["recommended_route"])
        self.assertEqual(res["recommended_route"]["safety_status"], "SAFE")
        self.assertEqual(res["blocked_routes_count"], 0)

    def test_case_2_route_with_nearby_fire(self):
        """Caso 2: Ruta con un foco cercano (fuera del buffer duro pero dentro de zona de precaución)."""
        # Origen (-33.15, -66.064) -> Destino Bomberos El Trapiche (-33.1095, -66.064)
        # Colocamos un foco lateral a ~1.5 km al este (con safety_buffer_km = 1.0 km)
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        nearby_fire = [
            {
                "event_id": "FIRE_NEARBY_01",
                "centroid_lat": -33.1300,
                "centroid_lon": -66.0465,
                "frp_peak_mw": 180.0,
                "projected_azimuth_deg": 90.0,
                "last_detected": now_str,
                "polygon_coords": [
                    [-33.128, -66.048],
                    [-33.128, -66.045],
                    [-33.132, -66.045],
                    [-33.132, -66.048],
                    [-33.128, -66.048],
                ],
                "cone_1h_coords": [
                    [-33.127, -66.048],
                    [-33.127, -66.040],
                    [-33.133, -66.040],
                    [-33.133, -66.048],
                    [-33.127, -66.048],
                ],
                "cone_3h_coords": [
                    [-33.125, -66.049],
                    [-33.125, -66.032],
                    [-33.135, -66.032],
                    [-33.135, -66.049],
                    [-33.125, -66.049],
                ],
            }
        ]
        res = self.engine.compute_evacuation_plan(
            request_payload={
                "origin_lat": -33.1500,
                "origin_lon": -66.0640,
                "target_shelter_id": "SHL-SL-001",
                "safety_buffer_km": 1.0,
                "custom_fires": nearby_fire,
            },
            active_fires=[],
            weather=self.default_weather,
        )
        self.assertGreaterEqual(res["passable_routes_count"], 1)
        direct_route = next(
            r for r in res["alternative_routes"] if "Directo" in r["corridor_name"]
        )
        # El corredor directo pasa cerca del foco lateral (~1.5 km < 2 * buffer), por lo que recibe WARNING
        self.assertEqual(direct_route["safety_status"], "WARNING")
        self.assertGreater(direct_route["dangerous_segments_count"], 0)

    def test_case_3_direct_road_cut_by_fire(self):
        """Caso 3: Incendio directamente sobre el camino directo -> Bloquea la directa y recomienda desvío."""
        # Origen (-33.1600, -66.0640) -> Destino (-33.1095, -66.0640)
        # Colocamos incendio pequeño exactamente en la mitad del camino directo (-33.1350, -66.0640)
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        blocking_fire = [
            {
                "event_id": "FIRE_DIRECT_CUT",
                "centroid_lat": -33.1350,
                "centroid_lon": -66.0640,
                "frp_peak_mw": 240.0,
                "projected_azimuth_deg": 0.0,
                "last_detected": now_str,
                "polygon_coords": [
                    [-33.133, -66.066],
                    [-33.133, -66.062],
                    [-33.137, -66.062],
                    [-33.137, -66.066],
                    [-33.133, -66.066],
                ],
            }
        ]
        res = self.engine.compute_evacuation_plan(
            request_payload={
                "origin_lat": -33.1600,
                "origin_lon": -66.0640,
                "target_shelter_id": "SHL-SL-001",
                "safety_buffer_km": 0.6,
                "custom_fires": blocking_fire,
            },
            active_fires=[],
            weather=self.default_weather,
        )
        self.assertGreaterEqual(res["blocked_routes_count"], 1)
        self.assertGreaterEqual(res["passable_routes_count"], 1)
        self.assertIsNotNone(res["recommended_route"])
        self.assertTrue(res["recommended_route"]["is_passable"])
        self.assertNotEqual(res["recommended_route"]["safety_status"], "BLOCKED")

    def test_case_4_multiple_alternatives_available(self):
        """Caso 4: Varias alternativas disponibles -> Compara distancias, tiempos y riesgo ML."""
        res = self.engine.compute_evacuation_plan(
            request_payload={
                "origin_lat": -33.1800,
                "origin_lon": -66.0500,
                "safety_buffer_km": 1.0,
                "max_alternatives": 4,
            },
            active_fires=[],
            weather=self.default_weather,
        )
        alts = res["alternative_routes"]
        self.assertGreaterEqual(len(alts), 3)
        for r in alts:
            self.assertIn("distance_km", r)
            self.assertIn("estimated_time_min", r)
            self.assertIn("ml_risk_score", r)
            self.assertIn("proximity_profile", r)

    def test_case_5_no_safe_route_available_conservative_fallback(self):
        """Caso 5: Ninguna ruta segura disponible -> Bloquea todas y activa corredor conservador de flanco."""
        # Incendio rodea completamente el punto de origen (-33.255, -65.953)
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        enclosing_fire = [
            {
                "event_id": "FIRE_MEGA_ENCLOSING",
                "centroid_lat": -33.2550,
                "centroid_lon": -65.9530,
                "frp_peak_mw": 650.0,
                "projected_azimuth_deg": 20.0,
                "last_detected": now_str,
                "polygon_coords": [
                    [-33.220, -65.990],
                    [-33.220, -65.910],
                    [-33.290, -65.910],
                    [-33.290, -65.990],
                    [-33.220, -65.990],
                ],
            }
        ]
        res = self.engine.compute_evacuation_plan(
            request_payload={
                "origin_lat": -33.2550,
                "origin_lon": -65.9530,
                "target_shelter_id": "SHL-SL-001",
                "safety_buffer_km": 1.5,
                "custom_fires": enclosing_fire,
            },
            active_fires=[],
            weather=self.default_weather,
        )
        self.assertEqual(res["overall_status"], "NO_SAFE_ROAD_AVAILABLE")
        self.assertIsNone(res["recommended_route"])
        self.assertEqual(res["passable_routes_count"], 0)
        self.assertIsNotNone(res["conservative_escape_corridor"])
        self.assertEqual(res["conservative_escape_corridor"]["mode"], "CONSERVATIVE_FLANK_FALLBACK")

    def test_case_6_stale_fire_data_warning_and_buffer_expansion(self):
        """Caso 6: Datos de incendios desactualizados -> Emite STALE_FIRE_DATA y expande el buffer."""
        res = self.engine.compute_evacuation_plan(
            request_payload={
                "origin_lat": -33.1500,
                "origin_lon": -66.0640,
                "target_shelter_id": "SHL-SL-001",
                "safety_buffer_km": 1.0,
                "simulated_data_age_hours": 22.0,
            },
            active_fires=self.engine.compute_evacuation_plan(
                {"origin_lat": -33.15, "origin_lon": -66.06}, [], self.default_weather
            ).get("custom_fires", []),
            weather=self.default_weather,
        )
        self.assertTrue(res["safety_parameters"]["is_stale_fire_data"])
        codes = [w["code"] for w in res["global_warnings"]]
        self.assertIn("STALE_FIRE_DATA", codes)
        self.assertGreater(
            res["recommended_route"]["effective_safety_buffer_km"],
            res["safety_parameters"]["requested_buffer_km"],
        )

    def test_case_7_invalid_coordinates_rejected(self):
        """Caso 7: Coordenadas inválidas o fuera de rango -> Lanza SchemaValidationError (HTTP 422)."""
        with self.assertRaises(SchemaValidationError):
            self.engine.compute_evacuation_plan(
                request_payload={"origin_lat": -135.0, "origin_lon": -65.0},
                active_fires=[],
                weather=self.default_weather,
            )
        with self.assertRaises(SchemaValidationError):
            self.engine.compute_evacuation_plan(
                request_payload={"origin_lat": "invalid_coord", "origin_lon": -65.0},
                active_fires=[],
                weather=self.default_weather,
            )

    def test_case_8_unverified_shelter_warning_and_verified_alternative(self):
        """Caso 8: Refugio sin información confiable -> Emite UNVERIFIED_SHELTER_WARNING y prioriza el verificado."""
        res = self.engine.compute_evacuation_plan(
            request_payload={
                "origin_lat": -33.1800,
                "origin_lon": -65.9400,
                "target_shelter_id": "SHL-SL-099",  # Puesto Rural No Verificado
                "safety_buffer_km": 1.0,
                "custom_fires": [],
            },
            active_fires=[],
            weather=self.default_weather,
        )
        codes = [w["code"] for w in res["global_warnings"]]
        self.assertIn("UNVERIFIED_SHELTER_WARNING", codes)
        # La ruta recomendada debe apuntar al refugio verificado incluido automáticamente como alternativa segura
        self.assertTrue(res["recommended_route"]["target_shelter"]["is_verified_reliable"])


if __name__ == "__main__":
    unittest.main()
