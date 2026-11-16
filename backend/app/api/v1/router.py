#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Enrutador de Endpoints REST API v1 y Especificación OpenAPI 3.1
"""

from datetime import datetime, timezone
from typing import Dict, Any, Tuple
from urllib.parse import parse_qs, urlparse

from backend.app.core.config import settings
from backend.app.core.database import db_manager
from backend.app.schemas.api_schemas import SchemaValidationError
from backend.app.services.historical_service import historical_service
from backend.app.services.platform_orchestrator import orchestrator


def build_openapi_spec() -> Dict[str, Any]:
    return {
        "openapi": "3.1.0",
        "info": {
            "title": settings.app_name,
            "version": settings.app_version,
            "description": (
                "API Geoespacial, Científica y de Machine Learning para Monitoreo de Incendios "
                "Forestales (NASA FIRMS MODIS & VIIRS) y Rutas de Evacuación Inteligentes."
            ),
        },
        "paths": {
            "/api/v1/health": {"get": {"summary": "Estado de salud de servicios e infraestructura"}},
            "/api/v1/dashboard/summary": {"get": {"summary": "Resumen ejecutivo y KPIs operativos"}},
            "/api/v1/fires/active": {"get": {"summary": "Frentes activos DBSCAN, píxeles MODIS/VIIRS e isócronas"}},
            "/api/v1/fires/geojson": {"get": {"summary": "Exportación OGC GeoJSON de perímetros activos"}},
            "/api/v1/fires/simulate": {"post": {"summary": "Simulador táctico de inyección operativa"}},
            "/api/v1/fires/ingest": {"post": {"summary": "Sincronización bajo demanda del pipeline NASA FIRMS"}},
            "/api/v1/historical/calendar": {"get": {"summary": "Calendario climatológico histórico 2000-2026 (52 semanas y BBox)"}},
            "/api/v1/routing/evacuate": {"post": {"summary": "Cálculo de rutas de escape inteligentes con validación determinista y ML"}},
            "/api/v1/shelters": {"get": {"summary": "Catálogo auditado de refugios, bomberos y hospitales"}},
            "/api/v1/ml/models": {"get": {"summary": "Model Cards, métricas e importancia de variables ML"}},
            "/api/v1/ml/predict-risk": {"post": {"summary": "Inferencia directa de propagación y riesgo vial"}},
            "/api/v1/ml/predict-hazard": {"post": {"summary": "Predicción temporal de peligro regional (24h/48h/72h)"}},
            "/api/v1/settings": {
                "get": {"summary": "Lectura de parámetros científicos"},
                "put": {"summary": "Actualización de parámetros científicos"},
            },
        },
    }


def dispatch_api_request(
    method: str, path_with_query: str, body: Dict[str, Any]
) -> Tuple[int, Dict[str, Any]]:
    """
    Despachador central de solicitudes HTTP hacia los servicios de dominio.
    Retorna (status_code, response_dict).
    """
    parsed = urlparse(path_with_query)
    path = parsed.path.rstrip("/") or "/"
    query = {k: v[0] for k, v in parse_qs(parsed.query).items()}

    try:
        if method == "GET" and path in ("/openapi.json", "/api/v1/openapi.json"):
            return 200, build_openapi_spec()

        if method == "GET" and path in ("/api/v1/health", "/api/health", "/health"):
            infra = db_manager.get_health_status()
            return 200, {
                "status": "healthy",
                "service": settings.app_name,
                "version": settings.app_version,
                "timestamp_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "components": {
                    **infra,
                    "ml_engine": {
                        "status": "READY" if orchestrator.ml_predictor.is_ready else "FALLBACK_MODE",
                        "models_loaded": len(orchestrator.ml_predictor.get_models_metadata()),
                        "healthy": True,
                    },
                    "routing_engine": {
                        "status": "READY",
                        "engine": "OSRM + Serrano Graph + Deterministic SafetyValidator",
                        "healthy": True,
                    },
                },
            }

        if method == "GET" and path == "/api/v1/dashboard/summary":
            return 200, orchestrator.get_dashboard_summary()

        if method == "GET" and path == "/api/v1/fires/active":
            return 200, orchestrator.get_active_fires()

        if method == "GET" and path == "/api/v1/fires/geojson":
            return 200, orchestrator.export_active_geojson()

        if method == "POST" and path == "/api/v1/fires/ingest":
            mode = str(body.get("mode", "real")).lower()
            force_synth = mode == "synthetic"
            bbox = body.get("bbox")
            data = orchestrator.refresh_active_fires(bbox=bbox, force_synthetic=force_synth)
            return 200, {
                "status": "synchronized",
                "mode": "synthetic" if force_synth else "firms_real_cache",
                "metadata": data["metadata"],
                "kpis": data["kpis"],
            }

        if method == "GET" and path == "/api/v1/historical/grid":
            return 200, historical_service.get_raw_grid()

        if method == "POST" and path == "/api/v1/fires/simulate":
            return 403, {
                "error": "Simulador deshabilitado",
                "detail": "Regla de cero datos inyectados activada: Prohibida la inyección de incendios simulados en la plataforma operativa.",
            }

        if method == "GET" and path == "/api/v1/historical/calendar":
            mode = query.get("mode", "annual")
            year = int(query.get("year", "2025"))
            range_from = int(query.get("range_from", "2000"))
            range_to = int(query.get("range_to", "2025"))
            bbox = query.get("bbox")
            week = int(query.get("week", "36"))
            sensor = query.get("sensor", "all")
            return 200, historical_service.query_calendar(
                mode=mode,
                year=year,
                range_from=range_from,
                range_to=range_to,
                bbox=bbox,
                selected_week=week,
                sensor=sensor,
            )

        if method == "POST" and path == "/api/v1/routing/evacuate":
            active = orchestrator.get_active_fires()
            plan = orchestrator.routing_engine.compute_evacuation_plan(
                request_payload=body,
                active_fires=active.get("events", []),
                weather=active.get("weather", {}),
                try_osrm_network=bool(body.get("try_osrm_network", False)),
            )
            return 200, plan

        if method == "GET" and path == "/api/v1/shelters":
            return 200, orchestrator.get_shelters_with_threat_audit()

        if method == "GET" and path == "/api/v1/ml/models":
            return 200, {
                "status": "READY" if orchestrator.ml_predictor.is_ready else "DETERMINISTIC_FALLBACK",
                "models": orchestrator.ml_predictor.get_models_metadata(),
            }

        if method == "POST" and path == "/api/v1/ml/predict-hazard":
            hazard_pred = orchestrator.ml_predictor.predict_wildfire_hazard(body)
            return 200, hazard_pred

        if method == "POST" and path == "/api/v1/ml/predict-risk":
            spread_features = body.get("spread_features", {})
            segment_features = body.get("segment_features", {})
            spread_pred = orchestrator.ml_predictor.predict_fire_spread(spread_features)
            seg_probs, seg_mode = orchestrator.ml_predictor.predict_segments_risk([segment_features])
            return 200, {
                "spread_prediction": spread_pred,
                "segment_risk_prediction": {
                    "risk_probability": seg_probs[0] if seg_probs else 0.0,
                    "risk_percentage": round((seg_probs[0] if seg_probs else 0.0) * 100.0, 1),
                    "evaluation_mode": seg_mode,
                },
            }

        if method == "GET" and path == "/api/v1/settings":
            return 200, settings.to_dict()

        if method in ("PUT", "POST") and path == "/api/v1/settings":
            updated = settings.update_parameters(body)
            orchestrator.refresh_active_fires(force_synthetic=settings.use_synthetic_data)
            return 200, updated

        return 404, {"error": "Endpoint no encontrado", "path": path}

    except SchemaValidationError as val_err:
        return 422, {
            "error": "Unprocessable Entity — Error de validación de esquema",
            "detail": str(val_err),
        }
    except Exception as exc:
        return 500, {
            "error": "Internal Server Error",
            "detail": str(exc),
        }
