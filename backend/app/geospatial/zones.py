#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Motor Geodésico, Proyección Métrica UTM 20S (EPSG:32720) y Topología
===============================================================================
Proporciona:
1) Transformación bidireccional WGS84 (EPSG:4326) <-> UTM Zona 20S (EPSG:32720)
   usando PyProj cuando está instalado o las ecuaciones exactas de Transverse
   Mercator del elipsoide WGS84.
2) Operaciones geométricas métricas exactas (área en hectáreas, buffers de
   seguridad en metros, intersección de líneas viales con polígonos y distancia
   mínima segmento-polígono).
3) Geocodificación inversa de toponimia serrana para Córdoba y San Luis.
"""

import math
from typing import List, Tuple, Optional

try:
    from pyproj import Transformer
    _TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32720", always_xy=True)
    _TO_WGS = Transformer.from_crs("EPSG:32720", "EPSG:4326", always_xy=True)
    PYPROJ_AVAILABLE = True
except ImportError:
    PYPROJ_AVAILABLE = False

EARTH_RADIUS_KM = 6371.0088

# Polígonos provinciales de referencia (Córdoba y San Luis)
CORDOBA_POLYGON = [
    [-29.50, -65.75], [-29.50, -63.80], [-29.85, -62.10], [-30.65, -61.80],
    [-31.80, -61.75], [-33.30, -61.75], [-34.98, -63.38], [-35.00, -65.10],
    [-32.95, -65.12], [-31.90, -65.18], [-30.60, -65.65], [-29.50, -65.75],
]

SAN_LUIS_POLYGON = [
    [-31.88, -67.35], [-31.90, -65.18], [-32.95, -65.12], [-35.00, -65.10],
    [-36.00, -65.10], [-36.00, -66.85], [-34.60, -67.30], [-33.10, -67.35],
    [-31.88, -67.35],
]

SIERRAS_LANDMARKS = [
    (-33.255, -65.953, "Sierras de San Luis (El Trapiche / La Florida)", "San Luis"),
    (-33.225, -66.230, "Potrero de los Funes / Las Chacras (San Luis)", "San Luis"),
    (-32.910, -65.428, "Valle del Conlara / El Morro (San Luis)", "San Luis"),
    (-32.342, -65.012, "Sierra de los Comechingones (Villa de Merlo, San Luis)", "San Luis"),
    (-32.117, -65.742, "Norte Puntano (Quines / Candelaria, San Luis)", "San Luis"),
    (-32.187, -65.659, "Sierra de las Quijadas / Luján (San Luis)", "San Luis"),
    (-32.052, -65.169, "Traslasierra Sur (San Javier / Yacanto, Córdoba)", "Córdoba"),
    (-31.855, -65.551, "Reserva Chancaní / Oeste Traslasierra (Córdoba)", "Córdoba"),
    (-31.725, -65.031, "Valle de Traslasierra (Mina Clavero / Cura Brochero, Córdoba)", "Córdoba"),
    (-31.663, -63.833, "Pilar / Río Segundo (Córdoba)", "Córdoba"),
    (-31.402, -64.117, "Sierras Chicas / Gran Córdoba (Córdoba)", "Córdoba"),
    (-31.980, -64.560, "Valle de Calamuchita / Santa Rosa (Córdoba)", "Córdoba"),
    (-31.150, -64.480, "Valle de Punilla / Cosquín (Córdoba)", "Córdoba"),
    (-30.850, -64.520, "Capilla del Monte / Cerro Uritorco (Córdoba)", "Córdoba"),
    (-31.652, -64.428, "Valle de Paravachasca / Alta Gracia (Córdoba)", "Córdoba"),
]


def wgs84_to_utm20s(lat: float, lon: float) -> Tuple[float, float]:
    """Convierte (lat, lon) en grados WGS84 a (x_m, y_m) en metros (EPSG:32720 UTM 20S)."""
    if PYPROJ_AVAILABLE:
        x, y = _TO_UTM.transform(lon, lat)
        return float(x), float(y)

    # Ecuación analítica Transverse Mercator para UTM Zona 20S (meridiano central -63°)
    lon0 = -63.0
    k0 = 0.9996
    a = 6378137.0
    e2 = 0.00669437999014
    ep2 = e2 / (1.0 - e2)

    phi = math.radians(lat)
    lam = math.radians(lon - lon0)
    sin_phi = math.sin(phi)
    cos_phi = math.cos(phi)
    tan_phi = math.tan(phi)

    N = a / math.sqrt(1.0 - e2 * sin_phi * sin_phi)
    T = tan_phi * tan_phi
    C = ep2 * cos_phi * cos_phi
    A = cos_phi * lam

    M = a * (
        (1.0 - e2 / 4.0 - 3.0 * e2 * e2 / 64.0) * phi
        - (3.0 * e2 / 8.0 + 3.0 * e2 * e2 / 32.0) * math.sin(2.0 * phi)
        + (15.0 * e2 * e2 / 256.0) * math.sin(4.0 * phi)
    )

    x = 500000.0 + k0 * N * (
        A + (1.0 - T + C) * (A ** 3) / 6.0
        + (5.0 - 18.0 * T + T * T + 72.0 * C - 58.0 * ep2) * (A ** 5) / 120.0
    )
    y = 10000000.0 + k0 * (
        M + N * tan_phi * (
            (A ** 2) / 2.0
            + (5.0 - T + 9.0 * C + 4.0 * C * C) * (A ** 4) / 24.0
        )
    )
    return float(x), float(y)


def utm20s_to_wgs84(x_m: float, y_m: float) -> Tuple[float, float]:
    """Convierte (x_m, y_m) en metros (EPSG:32720 UTM 20S) a (lat, lon) WGS84."""
    if PYPROJ_AVAILABLE:
        lon, lat = _TO_WGS.transform(x_m, y_m)
        return round(float(lat), 6), round(float(lon), 6)

    lon0 = -63.0
    k0 = 0.9996
    a = 6378137.0
    e2 = 0.00669437999014
    ep2 = e2 / (1.0 - e2)
    e1 = (1.0 - math.sqrt(1.0 - e2)) / (1.0 + math.sqrt(1.0 - e2))

    x = x_m - 500000.0
    y = y_m - 10000000.0
    M = y / k0
    mu = M / (a * (1.0 - e2 / 4.0 - 3.0 * e2 * e2 / 64.0))

    phi1 = (
        mu
        + (3.0 * e1 / 2.0 - 27.0 * (e1 ** 3) / 32.0) * math.sin(2.0 * mu)
        + (21.0 * e1 * e1 / 16.0) * math.sin(4.0 * mu)
    )
    sin_p1 = math.sin(phi1)
    cos_p1 = math.cos(phi1)
    tan_p1 = math.tan(phi1)
    N1 = a / math.sqrt(1.0 - e2 * sin_p1 * sin_p1)
    R1 = a * (1.0 - e2) / ((1.0 - e2 * sin_p1 * sin_p1) ** 1.5)
    T1 = tan_p1 * tan_p1
    C1 = ep2 * cos_p1 * cos_p1
    D = x / (N1 * k0)

    lat = phi1 - (N1 * tan_p1 / R1) * (
        (D ** 2) / 2.0 - (5.0 + 3.0 * T1 + 10.0 * C1 - 4.0 * C1 * C1 - 9.0 * ep2) * (D ** 4) / 24.0
    )
    lon = math.radians(lon0) + (
        D - (1.0 + 2.0 * T1 + C1) * (D ** 3) / 6.0
    ) / max(1e-9, cos_p1)
    return round(math.degrees(lat), 6), round(math.degrees(lon), 6)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia geodésica Haversine exacta en kilómetros."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * (math.sin(dl / 2.0) ** 2)
    return 2.0 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def bearing_degrees(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Azimut inicial en grados [0, 360) desde (lat1, lon1) hacia (lat2, lon2)."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def translate_point(lat: float, lon: float, distance_km: float, azimuth_deg: float) -> Tuple[float, float]:
    """Desplaza una coordenada (lat, lon) una distancia en km según el azimut indicado."""
    x, y = wgs84_to_utm20s(lat, lon)
    rad = math.radians(azimuth_deg)
    nx = x + (distance_km * 1000.0) * math.sin(rad)
    ny = y + (distance_km * 1000.0) * math.cos(rad)
    return utm20s_to_wgs84(nx, ny)


def degrees_to_cardinal(azimuth: Optional[float]) -> str:
    if azimuth is None:
        return "Estacionario"
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    idx = int(((azimuth + 22.5) % 360.0) // 45)
    return dirs[idx]


def polygon_area_km2_utm(poly_latlon: List[List[float]]) -> float:
    """Calcula el área métrica exacta de un polígono [[lat, lon], ...] en km² usando UTM 20S."""
    if not poly_latlon or len(poly_latlon) < 3:
        return 0.0
    pts_utm = [wgs84_to_utm20s(p[0], p[1]) for p in poly_latlon]
    area_m2 = 0.0
    n = len(pts_utm)
    for i in range(n):
        x1, y1 = pts_utm[i]
        x2, y2 = pts_utm[(i + 1) % n]
        area_m2 += (x1 * y2) - (x2 * y1)
    return round(abs(area_m2) * 0.5 / 1e6, 4)


def point_in_polygon(lat: float, lon: float, poly_latlon: List[List[float]]) -> bool:
    """Algoritmo Ray-Casting para determinar si (lat, lon) está dentro de poly_latlon."""
    if not poly_latlon or len(poly_latlon) < 3:
        return False
    inside = False
    n = len(poly_latlon)
    p1lat, p1lon = poly_latlon[0][0], poly_latlon[0][1]
    for i in range(1, n + 1):
        p2lat, p2lon = poly_latlon[i % n][0], poly_latlon[i % n][1]
        if min(p1lon, p2lon) < lon <= max(p1lon, p2lon) and lat <= max(p1lat, p2lat):
            if p1lon != p2lon:
                xinters = (lon - p1lon) * (p2lat - p1lat) / (p2lon - p1lon) + p1lat
            else:
                xinters = p1lat
            if p1lat == p2lat or lat <= xinters:
                inside = not inside
        p1lat, p1lon = p2lat, p2lon
    return inside


def _ccw(ax: float, ay: float, bx: float, by: float, cx: float, cy: float) -> float:
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)


def segments_intersect_utm(
    a1: Tuple[float, float],
    a2: Tuple[float, float],
    b1: Tuple[float, float],
    b2: Tuple[float, float],
) -> bool:
    """Verifica intersección exacta entre dos segmentos en coordenadas métricas UTM."""
    d1 = _ccw(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1])
    d2 = _ccw(a1[0], a1[1], a2[0], a2[1], b2[0], b2[1])
    d3 = _ccw(b1[0], b1[1], b2[0], b2[1], a1[0], a1[1])
    d4 = _ccw(b1[0], b1[1], b2[0], b2[1], a2[0], a2[1])
    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True
    return False


def point_to_segment_distance_m(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float
) -> float:
    """Distancia mínima en metros desde un punto (px, py) a un segmento (x1,y1)-(x2,y2)."""
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0.0 and dy == 0.0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)


def segment_to_polygon_distance_km(
    lat1: float, lon1: float, lat2: float, lon2: float, poly_latlon: List[List[float]]
) -> Tuple[float, bool]:
    """
    Calcula la distancia mínima métrica en km entre un segmento vial (lat1,lon1)-(lat2,lon2)
    y un polígono [[lat, lon], ...], e indica si el segmento intersecta o está dentro del polígono.
    """
    if not poly_latlon or len(poly_latlon) < 3:
        return 999.0, False

    if point_in_polygon(lat1, lon1, poly_latlon) or point_in_polygon(lat2, lon2, poly_latlon):
        return 0.0, True

    mid_lat = 0.5 * (lat1 + lat2)
    mid_lon = 0.5 * (lon1 + lon2)
    if point_in_polygon(mid_lat, mid_lon, poly_latlon):
        return 0.0, True

    s1 = wgs84_to_utm20s(lat1, lon1)
    s2 = wgs84_to_utm20s(lat2, lon2)
    poly_utm = [wgs84_to_utm20s(p[0], p[1]) for p in poly_latlon]

    min_dist_m = float("inf")
    n = len(poly_utm)
    for i in range(n):
        p1 = poly_utm[i]
        p2 = poly_utm[(i + 1) % n]
        if segments_intersect_utm(s1, s2, p1, p2):
            return 0.0, True
        d_a = point_to_segment_distance_m(s1[0], s1[1], p1[0], p1[1], p2[0], p2[1])
        d_b = point_to_segment_distance_m(s2[0], s2[1], p1[0], p1[1], p2[0], p2[1])
        d_c = point_to_segment_distance_m(p1[0], p1[1], s1[0], s1[1], s2[0], s2[1])
        min_dist_m = min(min_dist_m, d_a, d_b, d_c)

    return round(min_dist_m / 1000.0, 4), False


def buffer_polygon_metric(poly_latlon: List[List[float]], buffer_km: float) -> List[List[float]]:
    """
    Expande radialmente un polígono en coordenadas métricas UTM (EPSG:32720)
    en `buffer_km` kilómetros alrededor de su envolvente.
    """
    if not poly_latlon or len(poly_latlon) < 3 or buffer_km <= 0.0:
        return poly_latlon

    pts_utm = [wgs84_to_utm20s(p[0], p[1]) for p in poly_latlon]
    cx = sum(p[0] for p in pts_utm) / len(pts_utm)
    cy = sum(p[1] for p in pts_utm) / len(pts_utm)
    buf_m = buffer_km * 1000.0

    expanded = []
    for x, y in pts_utm:
        dx = x - cx
        dy = y - cy
        norm = math.hypot(dx, dy)
        if norm < 1e-3:
            nx, ny = x + buf_m, y
        else:
            nx = x + (dx / norm) * buf_m
            ny = y + (dy / norm) * buf_m
        lat, lon = utm20s_to_wgs84(nx, ny)
        expanded.append([round(lat, 5), round(lon, 5)])

    if expanded and expanded[0] != expanded[-1]:
        expanded.append(expanded[0])
    return expanded


def resolve_toponym_and_province(lat: float, lon: float) -> Tuple[str, str]:
    """Resuelve la localidad serrana y provincia más cercana en Córdoba y San Luis."""
    best_name = "Región Serrana (Córdoba / San Luis)"
    best_prov = "Córdoba" if lon >= -65.12 else "San Luis"
    best_dist = float("inf")

    for ref_lat, ref_lon, name, prov in SIERRAS_LANDMARKS:
        d = haversine_km(lat, lon, ref_lat, ref_lon)
        if d < best_dist:
            best_dist = d
            best_name = name
            best_prov = prov

    if point_in_polygon(lat, lon, SAN_LUIS_POLYGON):
        best_prov = "San Luis"
    elif point_in_polygon(lat, lon, CORDOBA_POLYGON):
        best_prov = "Córdoba"

    return best_name, best_prov
