#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Motor Central de Optimización y Validación de Rutas de Evacuación
============================================================================
Orquesta:
1) Validación estricta de coordenadas e inputs.
2) Selección y auditoría de refugios y estaciones de bomberos (capacidad,
   estado operativo, distancia a incendios y flag de confiabilidad verificada).
3) Generación de rutas viales alternativas (OSRM + Grafo Vial Serrano).
4) Validación geométrica determinista (perímetros, conos 1h/3h, buffer de
   seguridad y expansión por antigüedad de datos).
5) Evaluación de riesgo por segmento mediante Machine Learning (ONNX/Joblib).
6) Activación del Corredor Conservador de Escape por Flanco cuando todas las
   rutas viales se encuentran comprometidas.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from backend.app.core.config import settings
from backend.app.core.database import db_manager
from backend.app.geospatial.zones import (
    bearing_degrees,
    degrees_to_cardinal,
    haversine_km,
    point_in_polygon,
)
from backend.app.routing.ml_risk_scorer import MLRiskScorer
from backend.app.routing.osrm_client import OSRMClient
from backend.app.routing.safety_validator import SafetyValidator
from backend.app.schemas.api_schemas import validate_routing_request
from ml.inference.predictor import MLRiskPredictor


class IntelligentEvacuationEngine:
    def __init__(self, ml_predictor: Optional[MLRiskPredictor] = None):
        self.ml_predictor = ml_predictor or MLRiskPredictor()
        self.osrm_client = OSRMClient()
        self.ml_scorer = MLRiskScorer(self.ml_predictor)

    @staticmethod
    def is_shelter_compromised(
        shelter: Dict[str, Any], fires: List[Dict[str, Any]], safety_buffer_km: float
    ) -> Tuple[bool, float, Optional[str]]:
        s_lat = float(shelter["lat"])
        s_lon = float(shelter["lon"])
        min_d = 999.0
        nearest_id = None

        for ev in fires:
            f_id = str(ev.get("event_id", "FIRE"))
            poly = ev.get("polygon_coords") or []
            cone1 = ev.get("cone_1h_coords") or poly
            cone3 = ev.get("cone_3h_coords") or cone1
            f_lat = float(ev.get("centroid_lat", s_lat))
            f_lon = float(ev.get("centroid_lon", s_lon))

            d = haversine_km(s_lat, s_lon, f_lat, f_lon)
            if d < min_d:
                min_d = d
                nearest_id = f_id

            if poly and point_in_polygon(s_lat, s_lon, poly):
                return True, 0.0, f_id
            if cone1 and point_in_polygon(s_lat, s_lon, cone1):
                return True, round(d, 2), f_id
            if cone3 and point_in_polygon(s_lat, s_lon, cone3):
                return True, round(d, 2), f_id
            if d < max(1.5, safety_buffer_km * 1.25):
                return True, round(d, 2), f_id

        return False, round(min_d, 2), nearest_id

    def compute_evacuation_plan(
        self,
        request_payload: Dict[str, Any],
        active_fires: List[Dict[str, Any]],
        weather: Dict[str, Any],
        try_osrm_network: bool = False,
    ) -> Dict[str, Any]:
        req = validate_routing_request(request_payload)
        o_lat = req["origin_lat"]
        o_lon = req["origin_lon"]
        safety_buffer_km = req["safety_buffer_km"]

        fires = req["custom_fires"] if req["custom_fires"] is not None else active_fires
        eff_weather = req["custom_weather"] if req["custom_weather"] is not None else weather

        data_age_hours, is_stale_data = SafetyValidator.compute_data_staleness_hours(
            fires, simulated_age_override=req.get("simulated_data_age_hours")
        )

        global_warnings: List[Dict[str, str]] = []
        if is_stale_data:
            global_warnings.append({
                "code": "STALE_FIRE_DATA",
                "severity": "WARNING",
                "message": (
                    f"Los datos satelitales tienen una antigüedad de {data_age_hours:.1f} h "
                    f"(umbral: {settings.staleness_threshold_hours:.1f} h). Se amplió automáticamente "
                    f"el buffer de exclusión por incertidumbre de propagación."
                ),
            })

        all_shelters = db_manager.load_shelters()
        candidate_shelters: List[Dict[str, Any]] = []

        # Si el usuario especificó coordenadas destino manuales
        if req["dest_lat"] is not None and req["dest_lon"] is not None:
            custom_shelter = {
                "id": "CUSTOM_DEST",
                "name": "Destino Seguro Seleccionado en Mapa",
                "category": "CUSTOM_POINT",
                "province": "Córdoba / San Luis",
                "locality": "Coordenada Manual",
                "access_road": "Red Vial Principal",
                "lat": req["dest_lat"],
                "lon": req["dest_lon"],
                "capacity_persons": 100,
                "has_medical_support": False,
                "has_water_supply": True,
                "is_verified_reliable": True,
                "operational_status": "OPEN",
            }
            candidate_shelters.append(custom_shelter)
        elif req["target_shelter_id"]:
            matched = next((s for s in all_shelters if s["id"] == req["target_shelter_id"]), None)
            if matched:
                candidate_shelters.append(matched)
                if not matched.get("is_verified_reliable", True):
                    global_warnings.append({
                        "code": "UNVERIFIED_SHELTER_WARNING",
                        "severity": "WARNING",
                        "message": (
                            f"El refugio seleccionado ('{matched['name']}') NO cuenta con verificación oficial "
                            f"de infraestructura médica o hídrica. Se incluye además un refugio verificado alternativo."
                        ),
                    })
                    # Agregar también el refugio verificado más cercano para comparación segura
                    verified_others = [
                        s for s in all_shelters
                        if s.get("is_verified_reliable", True) and s["id"] != matched["id"]
                    ]
                    verified_others.sort(key=lambda s: haversine_km(o_lat, o_lon, float(s["lat"]), float(s["lon"])))
                    if verified_others:
                        candidate_shelters.append(verified_others[0])

        if not candidate_shelters:
            # Selección inteligente de los 2 mejores refugios verificados fuera de peligro
            scored_shelters = []
            for sh in all_shelters:
                compromised, min_fire_d, _ = self.is_shelter_compromised(sh, fires, safety_buffer_km)
                if compromised:
                    continue
                if not sh.get("is_verified_reliable", True) and not req["allow_unverified_shelters"]:
                    continue
                dist_user = haversine_km(o_lat, o_lon, float(sh["lat"]), float(sh["lon"]))
                scored_shelters.append((dist_user, sh))

            scored_shelters.sort(key=lambda x: x[0])
            candidate_shelters = [x[1] for x in scored_shelters[:2]]
            if not candidate_shelters and all_shelters:
                candidate_shelters = [all_shelters[0]]

        # Evaluar todas las rutas candidatas hacia los refugios seleccionados
        evaluated_routes: List[Dict[str, Any]] = []
        route_counter = 1

        for sh in candidate_shelters:
            raw_routes = self.osrm_client.fetch_candidate_routes(
                origin_lat=o_lat,
                origin_lon=o_lon,
                dest_lat=float(sh["lat"]),
                dest_lon=float(sh["lon"]),
                road_hint=str(sh.get("access_road", "Red Vial Serrana")),
                try_osrm_network=try_osrm_network,
            )

            for cand in raw_routes:
                geom_eval = SafetyValidator.evaluate_route_geometry(
                    coords_latlon=cand["coordinates"],
                    fires=fires,
                    weather=eff_weather,
                    safety_buffer_km=safety_buffer_km,
                    data_age_hours=data_age_hours,
                    is_stale_data=is_stale_data,
                )
                ml_eval = self.ml_scorer.score_route_segments(cand, geom_eval, sh)

                route_warnings = list(geom_eval["warning_reasons"])
                if not sh.get("is_verified_reliable", True):
                    route_warnings.append(
                        f"Destino '{sh['name']}' sin información oficial verificada (sin soporte médico confirmado)."
                    )
                if is_stale_data:
                    route_warnings.append(
                        f"Evaluada con buffer expandido ({geom_eval['effective_safety_buffer_km']} km) por antigüedad de datos ({data_age_hours} h)."
                    )

                det_status = geom_eval["deterministic_status"]
                if det_status == "SAFE" and ml_eval["max_ml_risk_score"] >= 0.55:
                    det_status = "WARNING"
                    route_warnings.append(
                        "El modelo predictivo ML detecta susceptibilidad moderada de avance por viento hacia un tramo de la ruta."
                    )
                if det_status == "SAFE" and not sh.get("is_verified_reliable", True):
                    det_status = "WARNING"

                bearing_gen = bearing_degrees(o_lat, o_lon, float(sh["lat"]), float(sh["lon"]))
                evaluated_routes.append({
                    "route_id": f"ROUTE_{route_counter:02d}",
                    "corridor_name": cand["corridor_name"],
                    "source_engine": cand["source_engine"],
                    "target_shelter": sh,
                    "distance_km": cand["distance_km"],
                    "estimated_time_min": cand["base_duration_min"],
                    "effective_cost_score": ml_eval["effective_penalized_minutes"],
                    "safety_status": det_status,
                    "is_passable": geom_eval["is_passable"],
                    "is_recommended": False,
                    "general_bearing_deg": round(bearing_gen, 1),
                    "general_cardinal": degrees_to_cardinal(bearing_gen),
                    "min_distance_to_fire_km": geom_eval["min_distance_to_fire_km"],
                    "effective_safety_buffer_km": geom_eval["effective_safety_buffer_km"],
                    "ml_risk_score": ml_eval["mean_ml_risk_score"],
                    "max_segment_ml_risk": ml_eval["max_ml_risk_score"],
                    "ml_evaluation_mode": ml_eval["ml_evaluation_mode"],
                    "dangerous_segments_count": ml_eval["dangerous_segments_count"],
                    "dangerous_segments": ml_eval["dangerous_segments"],
                    "blocked_reasons": geom_eval["blocked_reasons"],
                    "warnings": route_warnings,
                    "coordinates": cand["coordinates"],
                    "proximity_profile": ml_eval["proximity_profile"],
                    "segments": ml_eval["enriched_segments"],
                })
                route_counter += 1

        passable_routes = [r for r in evaluated_routes if r["is_passable"]]
        blocked_routes = [r for r in evaluated_routes if not r["is_passable"]]

        # Priorización con Modelo ML (AlternativeRouteRanker)
        if passable_routes and hasattr(self.ml_predictor, "rank_alternative_routes"):
            try:
                passable_routes = self.ml_predictor.rank_alternative_routes(passable_routes)
            except Exception:
                pass

        # Ordenar rutas transitables respetando jerarquía de seguridad:
        # 1. Estado de seguridad (SAFE antes de WARNING)
        # 2. Refugios verificados oficialmente antes de no verificados
        # 3. Score de conveniencia ML (AlternativeRouteRanker) en orden descendente
        # 4. Costo compuesto efectivo
        status_rank = {"SAFE": 0, "WARNING": 1, "BLOCKED": 2}
        passable_routes.sort(
            key=lambda r: (
                status_rank.get(r["safety_status"], 2),
                0 if r["target_shelter"].get("is_verified_reliable", True) else 1,
                -float(r.get("ml_utility_score", 0.5)),
                r["effective_cost_score"],
            )
        )
        evaluated_routes = passable_routes + blocked_routes

        conservative_fallback = None
        if passable_routes:
            passable_routes[0]["is_recommended"] = True
            recommended_route = passable_routes[0]
            if recommended_route["safety_status"] == "SAFE":
                overall_status = "SAFE_ROUTE_VERIFIED"
            else:
                overall_status = "ROUTE_WITH_CAUTION_WARNINGS"
            if blocked_routes:
                global_warnings.append({
                    "code": "DIRECT_ROAD_BLOCKED_REROUTED",
                    "severity": "HIGH",
                    "message": (
                        f"Se descartaron {len(blocked_routes)} trazado(s) viales por intersectar "
                        f"perímetros activos o buffers de exclusión. Se recomienda desvío alternativo verificado."
                    ),
                })
        else:
            recommended_route = None
            overall_status = "NO_SAFE_ROAD_AVAILABLE"
            conservative_fallback = SafetyValidator.compute_conservative_flank_escape(
                o_lat, o_lon, fires, eff_weather
            )
            global_warnings.append({
                "code": "ALL_ROADS_BLOCKED_EMERGENCY_FLANK",
                "severity": "CRITICAL",
                "message": conservative_fallback["instruction"],
            })

        return {
            "overall_status": overall_status,
            "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "origin": {"lat": o_lat, "lon": o_lon},
            "safety_parameters": {
                "requested_buffer_km": safety_buffer_km,
                "data_age_hours": data_age_hours,
                "is_stale_fire_data": is_stale_data,
                "active_fires_evaluated": len(fires),
            },
            "global_warnings": global_warnings,
            "recommended_route": recommended_route,
            "alternative_routes": evaluated_routes[: max(3, req["max_alternatives"])],
            "passable_routes_count": len(passable_routes),
            "blocked_routes_count": len(blocked_routes),
            "conservative_escape_corridor": conservative_fallback,
        }
