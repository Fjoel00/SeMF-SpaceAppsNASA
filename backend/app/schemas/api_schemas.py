#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Validadores de Esquemas de Entrada y Contratos de API
"""

from typing import Dict, Any, Tuple, Optional


class SchemaValidationError(ValueError):
    """Excepción lanzada cuando los parámetros de entrada son inválidos (HTTP 422)."""


def validate_coordinates(lat: Any, lon: Any, field_prefix: str = "origin") -> Tuple[float, float]:
    """
    Valida estrictamente que las coordenadas sean numéricas finitas y estén
    dentro del rango geográfico válido [-90, 90] y [-180, 180].
    """
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError) as exc:
        raise SchemaValidationError(
            f"Coordenadas inválidas en '{field_prefix}': lat={lat}, lon={lon} deben ser numéricas."
        ) from exc

    if not (-90.0 <= lat_f <= 90.0) or not (-180.0 <= lon_f <= 180.0):
        raise SchemaValidationError(
            f"Coordenadas fuera de rango geográfico válido en '{field_prefix}': ({lat_f}, {lon_f})."
        )
    if lat_f != lat_f or lon_f != lon_f:  # NaN check
        raise SchemaValidationError(f"Coordenadas NaN no permitidas en '{field_prefix}'.")

    return round(lat_f, 6), round(lon_f, 6)


def validate_routing_request(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise SchemaValidationError("El cuerpo de la solicitud debe ser un objeto JSON válido.")

    if "origin_lat" not in payload or "origin_lon" not in payload:
        raise SchemaValidationError("Se requieren 'origin_lat' y 'origin_lon'.")

    o_lat, o_lon = validate_coordinates(payload["origin_lat"], payload["origin_lon"], "origin")

    target_shelter_id: Optional[str] = payload.get("target_shelter_id")
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None

    if payload.get("dest_lat") is not None and payload.get("dest_lon") is not None:
        dest_lat, dest_lon = validate_coordinates(payload["dest_lat"], payload["dest_lon"], "destination")

    safety_buffer_km = float(payload.get("safety_buffer_km", 1.2))
    if not (0.1 <= safety_buffer_km <= 15.0):
        raise SchemaValidationError("El parámetro 'safety_buffer_km' debe estar entre 0.1 y 15.0 km.")

    max_alternatives = int(payload.get("max_alternatives", 3))
    max_alternatives = max(1, min(6, max_alternatives))

    return {
        "origin_lat": o_lat,
        "origin_lon": o_lon,
        "target_shelter_id": target_shelter_id,
        "dest_lat": dest_lat,
        "dest_lon": dest_lon,
        "safety_buffer_km": round(safety_buffer_km, 2),
        "max_alternatives": max_alternatives,
        "allow_unverified_shelters": bool(payload.get("allow_unverified_shelters", False)),
        "custom_fires": payload.get("custom_fires"),
        "custom_weather": payload.get("custom_weather"),
        "simulated_data_age_hours": payload.get("simulated_data_age_hours"),
    }
