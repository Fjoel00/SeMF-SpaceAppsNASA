#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Configuración Centralizada del Sistema y Parámetros Científicos
"""

import os
from dataclasses import dataclass, asdict
from typing import Dict, Any


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DATA_DIR = os.path.join(ROOT_DIR, "data")
ML_ARTIFACTS_DIR = os.path.join(ROOT_DIR, "ml", "artifacts")


@dataclass
class Settings:
    app_name: str = "SeMF 2.0 — Tactical Wildfire & Multi-Sensor Intelligence API"
    app_version: str = "2.0.0"
    app_env: str = os.getenv("APP_ENV", "production")
    host: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    port: int = int(os.getenv("BACKEND_PORT", "8000"))
    public_port: int = int(os.getenv("PUBLIC_PORT", "8090"))

    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://semf_user:semf_secure_pass@semf-db:5432/semf_geodb",
    )
    redis_url: str = os.getenv("REDIS_URL", "redis://semf-redis:6379/0")

    firms_map_key: str = os.getenv("FIRMS_MAP_KEY", "")
    use_synthetic_data: bool = os.getenv("USE_SYNTHETIC_DATA", "false").lower() == "true"
    default_bbox: str = os.getenv("DEFAULT_BBOX", "-66.0,-33.5,-63.5,-31.0")
    default_day_range: int = int(os.getenv("DEFAULT_DAY_RANGE", "5"))

    # Parámetros científicos y de seguridad configurables en caliente
    dbscan_eps_km: float = float(os.getenv("DBSCAN_EPS_KM", "2.5"))
    dbscan_min_samples: int = int(os.getenv("DBSCAN_MIN_SAMPLES", "2"))
    default_safety_buffer_km: float = float(os.getenv("DEFAULT_SAFETY_BUFFER_KM", "1.2"))
    staleness_threshold_hours: float = float(os.getenv("STALENESS_THRESHOLD_HOURS", "12.0"))

    osrm_base_url: str = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["firms_key_configured"] = bool(self.firms_map_key and len(self.firms_map_key.strip()) >= 8)
        d.pop("firms_map_key", None)
        d.pop("database_url", None)
        return d

    def update_parameters(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if "dbscan_eps_km" in payload:
            val = float(payload["dbscan_eps_km"])
            if 0.3 <= val <= 15.0:
                self.dbscan_eps_km = round(val, 2)
        if "dbscan_min_samples" in payload:
            val = int(payload["dbscan_min_samples"])
            if 1 <= val <= 20:
                self.dbscan_min_samples = val
        if "default_safety_buffer_km" in payload:
            val = float(payload["default_safety_buffer_km"])
            if 0.2 <= val <= 10.0:
                self.default_safety_buffer_km = round(val, 2)
        if "staleness_threshold_hours" in payload:
            val = float(payload["staleness_threshold_hours"])
            if 1.0 <= val <= 72.0:
                self.staleness_threshold_hours = round(val, 1)
        if "use_synthetic_data" in payload:
            self.use_synthetic_data = bool(payload["use_synthetic_data"])
        if "firms_map_key" in payload and isinstance(payload["firms_map_key"], str):
            self.firms_map_key = payload["firms_map_key"].strip()
        return self.to_dict()


settings = Settings()
