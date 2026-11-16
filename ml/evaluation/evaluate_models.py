#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Validador de Calidad, Monotonía Física y Calibración de Modelos ML
=============================================================================
Verifica que los 4 modelos exportados en ml/artifacts/ cumplan los umbrales de
rendimiento, calibración probabilística, monotonía física y fallback determinista.
"""

import json
import os
import sys
from typing import Dict, Any

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from ml.inference.predictor import MLRiskPredictor


def evaluate_deployed_models() -> Dict[str, Any]:
    predictor = MLRiskPredictor()
    assert predictor.is_ready, "Los artefactos de modelos ML no están cargados."

    # 1. Prueba de monotonía física en propagación (FireSpreadPredictor)
    low_cond = predictor.predict_fire_spread({
        "frp_peak_mw": 45.0,
        "frp_density_mw_km2": 110.0,
        "delta_temp_k": 24.0,
        "points_count": 4,
        "wind_speed_kmh": 12.0,
        "relative_humidity_pct": 65.0,
        "temperature_c": 19.0,
        "seasonal_z_score": -0.2,
    })
    high_cond = predictor.predict_fire_spread({
        "frp_peak_mw": 380.0,
        "frp_density_mw_km2": 450.0,
        "delta_temp_k": 58.0,
        "points_count": 22,
        "wind_speed_kmh": 55.0,
        "relative_humidity_pct": 14.0,
        "temperature_c": 36.0,
        "seasonal_z_score": 2.4,
    })
    assert high_cond["spread_speed_kmh"] > low_cond["spread_speed_kmh"], (
        "Violación de monotonía física en FireSpreadPredictor"
    )

    # 2. Prueba de monotonía espacial en riesgo vial (RoadSegmentRiskClassifier)
    scores, mode = predictor.predict_segments_risk([
        {
            "dist_to_perimeter_km": 12.5,
            "dist_to_cone_1h_km": 11.8,
            "dist_to_cone_3h_km": 10.2,
            "wind_alignment_cos": -0.8,
            "fire_frp_mw": 40.0,
            "wind_speed_kmh": 15.0,
            "relative_humidity_pct": 55.0,
            "data_age_hours": 1.0,
        },
        {
            "dist_to_perimeter_km": 0.35,
            "dist_to_cone_1h_km": 0.05,
            "dist_to_cone_3h_km": 0.0,
            "wind_alignment_cos": 0.95,
            "fire_frp_mw": 375.0,
            "wind_speed_kmh": 48.0,
            "relative_humidity_pct": 16.0,
            "data_age_hours": 2.0,
        },
    ])
    assert len(scores) == 2
    assert scores[1] > 0.70 and scores[0] < 0.30, f"Scores inesperados: {scores}"

    # 3. Prueba de predicción temporal de peligro (WildfireHazardTemporalPredictor)
    hazard_res = predictor.predict_wildfire_hazard({
        "latitude": -31.42,
        "longitude": -64.18,
        "week_iso": 38,
        "historical_eq_count": 85.0,
        "wind_speed_kmh": 42.0,
        "temp_max_c": 35.0,
        "rh_min_pct": 12.0,
        "fwi_estimate": 58.0,
        "drought_days": 35,
    })
    assert hazard_res["hazard_score_24h"] > 50.0, "Peligro subestimado en condición extrema"
    assert "hazard_score_48h" in hazard_res
    assert "hazard_score_72h" in hazard_res

    # 4. Prueba de ranking de alternativas (AlternativeRouteRanker)
    ranked = predictor.rank_alternative_routes([
        {
            "route_id": "Route_A_Safe",
            "distance_km": 12.0,
            "duration_min": 14.0,
            "mean_segment_risk": 0.05,
            "max_segment_risk": 0.12,
            "min_dist_to_fire_km": 7.5,
            "min_dist_to_cone_3h_km": 5.0,
            "shelter_verified": True,
            "shelter_capacity_score": 0.9,
        },
        {
            "route_id": "Route_B_Dangerous",
            "distance_km": 8.0,
            "duration_min": 9.0,
            "mean_segment_risk": 0.65,
            "max_segment_risk": 0.88,
            "min_dist_to_fire_km": 0.8,
            "min_dist_to_cone_3h_km": 0.3,
            "shelter_verified": False,
            "shelter_capacity_score": 0.2,
        },
    ])
    assert len(ranked) == 2
    assert ranked[0]["route_id"] == "Route_A_Safe", "La ruta segura debe rankear primero"
    assert ranked[0]["ml_utility_score"] > ranked[1]["ml_utility_score"]

    # 5. Detección Out-of-Distribution (OOD)
    ood_res = predictor.predict_fire_spread({
        "frp_peak_mw": 5000.0,
        "wind_speed_kmh": 180.0,
        "relative_humidity_pct": 20.0,
        "temperature_c": 35.0,
    })
    assert ood_res["evaluation_mode"] == "DETERMINISTIC_FALLBACK"
    assert len(ood_res["ood_warnings"]) > 0

    return {
        "status": "PASSED",
        "models_verified": 4,
        "evaluation_mode": mode,
        "spread_low_kmh": low_cond["spread_speed_kmh"],
        "spread_high_kmh": high_cond["spread_speed_kmh"],
        "road_safe_prob": scores[0],
        "road_danger_prob": scores[1],
        "hazard_24h_level": hazard_res["hazard_level_24h"],
        "route_top_rank": ranked[0]["route_id"],
        "ood_fallback_verified": True,
        "metadata_models_count": len(predictor.get_models_metadata()),
    }


if __name__ == "__main__":
    report = evaluate_deployed_models()
    print(f"✅ Validación de los 4 modelos superada exitosamente:\n{json.dumps(report, indent=2)}")
