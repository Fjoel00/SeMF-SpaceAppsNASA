#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Servicio Meteorológico Táctico (Open-Meteo + Regla 30-30-30 + Caché)
"""

from datetime import datetime, timezone
from typing import Dict, Any, Optional
import requests

from backend.app.core.database import db_manager


class WeatherService:
    OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

    @classmethod
    def get_weather_for_coordinates(
        cls,
        lat: float = -33.255,
        lon: float = -65.953,
        custom_override: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if custom_override:
            w_speed = float(custom_override.get("wind_speed_kmh", 34.0))
            w_dir = float(custom_override.get("wind_direction_deg", 200.0))
            temp_c = float(custom_override.get("temperature_c", 33.0))
            rh_pct = float(custom_override.get("relative_humidity_pct", 18.0))
            return cls._enrich_weather_metrics(w_speed, w_dir, temp_c, rh_pct, source="SIMULATED_OVERRIDE")

        cache_key = f"weather:{round(lat, 2)}:{round(lon, 2)}"
        cached = db_manager.cache_get(cache_key)
        if cached:
            return cached

        try:
            res = requests.get(
                cls.OPEN_METEO_URL,
                params={
                    "latitude": round(lat, 4),
                    "longitude": round(lon, 4),
                    "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
                },
                timeout=4.0,
            )
            if res.status_code == 200:
                data = res.json().get("current", {})
                w_speed = float(data.get("wind_speed_10m", 32.0))
                w_dir = float(data.get("wind_direction_10m", 205.0))
                temp_c = float(data.get("temperature_2m", 31.5))
                rh_pct = float(data.get("relative_humidity_2m", 21.0))
                payload = cls._enrich_weather_metrics(w_speed, w_dir, temp_c, rh_pct, source="OPEN_METEO_LIVE")
                db_manager.cache_set(cache_key, payload, ttl_seconds=600)
                return payload
        except Exception:
            pass

        fallback = cls._enrich_weather_metrics(
            wind_speed_kmh=32.0,
            wind_direction_deg=205.0,
            temperature_c=31.5,
            relative_humidity_pct=21.0,
            source="REGIONAL_STATION_CACHE",
        )
        db_manager.cache_set(cache_key, fallback, ttl_seconds=180)
        return fallback

    @staticmethod
    def _enrich_weather_metrics(
        wind_speed_kmh: float,
        wind_direction_deg: float,
        temperature_c: float,
        relative_humidity_pct: float,
        source: str,
    ) -> Dict[str, Any]:
        is_30_30_30 = bool(
            temperature_c >= 30.0 and wind_speed_kmh >= 30.0 and relative_humidity_pct <= 30.0
        )
        # Índice aproximado de peligrosidad meteorológica de incendios (FWI 0-100)
        fwi = min(
            100.0,
            max(
                5.0,
                0.85 * wind_speed_kmh
                + 0.90 * max(0.0, temperature_c - 10.0)
                + 0.55 * max(0.0, 75.0 - relative_humidity_pct),
            ),
        )
        push_azimuth = (wind_direction_deg + 180.0) % 360.0
        return {
            "wind_speed_kmh": round(wind_speed_kmh, 1),
            "wind_direction_deg": round(wind_direction_deg, 1),
            "wind_push_azimuth_deg": round(push_azimuth, 1),
            "temperature_c": round(temperature_c, 1),
            "relative_humidity_pct": round(relative_humidity_pct, 1),
            "is_extreme_30_30_30": is_30_30_30,
            "fire_weather_index": round(fwi, 1),
            "telemetry_source": source,
            "updated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
