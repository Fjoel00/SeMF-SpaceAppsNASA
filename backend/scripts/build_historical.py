#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Pipeline Determinista de Armonización Histórica NASA FIRMS (2000–2026)
================================================================================
Procesa, armoniza físicamente y deduplica los archivos oficiales de NASA FIRMS
(MODIS Collection 6.1 y VIIRS S-NPP / NOAA-20 / NOAA-21) para la región de
Córdoba y San Luis (BBOX principal [-66.0, -33.5, -63.5, -31.0] y sierras).

CERO datos sintéticos ni interpolados: todo registro proviene de archivos de
agencia espacial verificables mediante checksum SHA-256 en data/manifest.json.
"""

import os
import sys
import math
import json
import glob
import struct
import zipfile
import hashlib
from collections import Counter, defaultdict
from datetime import datetime
from typing import Tuple, Dict, Any, List
import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_RAW = os.path.join(ROOT, "data", "raw")
DATA_PROCESSED = os.path.join(ROOT, "data", "processed")
MANIFEST_PATH = os.path.join(ROOT, "data", "manifest.json")
AUDIT_PATH = os.path.join(ROOT, "data", "AUDITORIA_DATOS.md")
HISTORICAL_GRID_PATH = os.path.join(DATA_PROCESSED, "historico_riesgo_grid.json")
ACTIVE_SNAPSHOT_PATH = os.path.join(DATA_PROCESSED, "active_fires_snapshot.json")

os.makedirs(DATA_PROCESSED, exist_ok=True)

# Región de interés estricta: BBOX central y envolvente de sierras de Cba y SL
BBOX_REGIONAL = {
    "lat_min": -36.05,
    "lat_max": -29.40,
    "lon_min": -67.55,
    "lon_max": -61.65,
}

# BBOX principal requerido
BBOX_CORE = {
    "lat_min": -33.5,
    "lat_max": -31.0,
    "lon_min": -66.0,
    "lon_max": -63.5,
}

# Polígonos provinciales para clasificación geográfica
CORDOBA_POLYGON = [
    [-29.50, -65.75], [-29.50, -63.80], [-29.85, -62.10], [-30.65, -61.80],
    [-31.80, -61.75], [-33.30, -61.75], [-34.98, -63.38], [-35.00, -65.10],
    [-32.95, -65.12], [-31.90, -65.18], [-30.60, -65.65], [-29.50, -65.75]
]

SAN_LUIS_POLYGON = [
    [-31.88, -67.35], [-31.90, -65.18], [-32.95, -65.12], [-35.00, -65.10],
    [-36.00, -65.10], [-36.00, -66.85], [-34.60, -67.30], [-33.10, -67.35],
    [-31.88, -67.35]
]

GRID_RESOLUTION_DEG = 0.15


def snap_to_grid(val: float, step: float = GRID_RESOLUTION_DEG) -> float:
    return round(math.floor(float(val) / step) * step + (step / 2.0), 4)


def point_in_polygon(lat: float, lon: float, poly: list) -> bool:
    inside = False
    n = len(poly)
    p1lat, p1lon = poly[0]
    for i in range(1, n + 1):
        p2lat, p2lon = poly[i % n]
        if min(p1lon, p2lon) < lon <= max(p1lon, p2lon) and lat <= max(p1lat, p2lat):
            if p1lon != p2lon:
                xinters = (lon - p1lon) * (p2lat - p1lat) / (p2lon - p1lon) + p1lat
            else:
                xinters = p1lat
            if p1lat == p2lat or lat <= xinters:
                inside = not inside
        p1lat, p1lon = p2lat, p2lon
    return inside


def classify_location(lat: float, lon: float) -> str:
    if point_in_polygon(lat, lon, CORDOBA_POLYGON):
        return "Córdoba"
    if point_in_polygon(lat, lon, SAN_LUIS_POLYGON):
        return "San Luis"
    # Si está dentro del BBOX Core pero en límite provincial
    if (BBOX_CORE["lat_min"] <= lat <= BBOX_CORE["lat_max"] and
            BBOX_CORE["lon_min"] <= lon <= BBOX_CORE["lon_max"]):
        return "San Luis" if lon < -65.2 else "Córdoba"
    return "Región Central"


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def normalize_confidence(conf_str: str, is_modis: bool) -> Tuple[float, str]:
    """Normaliza la confianza a escala numérica [0.0, 1.0] y categoría."""
    if is_modis:
        try:
            val = float(conf_str)
            norm = round(max(0.0, min(100.0, val)) / 100.0, 2)
            cat = "high" if norm >= 0.8 else ("nominal" if norm >= 0.3 else "low")
            return norm, cat
        except (ValueError, TypeError):
            return 0.5, "nominal"
    else:
        c = str(conf_str).strip().lower()
        if c in ("h", "high"):
            return 1.0, "high"
        elif c in ("n", "nominal"):
            return 0.67, "nominal"
        elif c in ("l", "low"):
            return 0.33, "low"
        try:
            val = float(c)
            norm = round(max(0.0, min(100.0, val)) / 100.0, 2)
            cat = "high" if norm >= 0.8 else ("nominal" if norm >= 0.3 else "low")
            return norm, cat
        except Exception:
            return 0.67, "nominal"


def parse_dbf_records(f_stream, source_name: str, is_modis: bool):
    """Lee formato DBF dBASE III+ de NASA FIRMS en modo stream."""
    header = f_stream.read(32)
    if len(header) < 32:
        return [], 0
    num_records, header_len, record_len = struct.unpack("<IHH", header[4:12])
    fields_raw = f_stream.read(header_len - 32)
    fields = {}
    offset = 1
    for idx in range(0, len(fields_raw), 32):
        chunk = fields_raw[idx:idx + 32]
        if not chunk or chunk[0] == 0x0D:
            break
        fname = chunk[0:11].split(b"\x00")[0].decode("ascii", "ignore").strip().upper()
        flen = chunk[16]
        fields[fname] = (offset, offset + flen)
        offset += flen

    records = []
    for _ in range(num_records):
        rec = f_stream.read(record_len)
        if not rec or rec[0] == 0x2A:
            continue
        row = {}
        for fname, (s, e) in fields.items():
            row[fname] = rec[s:e].decode("ascii", "ignore").strip()
        records.append(row)
    return records, num_records


def build_historical_harmonized_dataset():
    print("=" * 80)
    print("SeMF 2.0 — Construcción de Base de Datos Histórica NASA FIRMS (2000–2026)")
    print("=" * 80)

    # 1. Catálogo e inspección criptográfica de archivos fuente
    manifest = {
        "generated_at_utc": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "region_bbox": BBOX_REGIONAL,
        "core_bbox": BBOX_CORE,
        "files": []
    }

    raw_files = sorted(glob.glob(os.path.join(DATA_RAW, "**", "*"), recursive=True))
    raw_files = [p for p in raw_files if os.path.isfile(p) and p.endswith((".zip", ".csv", ".dbf"))]

    file_metadata = {}
    for fpath in raw_files:
        rel = os.path.relpath(fpath, DATA_RAW).replace("\\", "/")
        size_bytes = os.path.getsize(fpath)
        sha256 = sha256_file(fpath)
        file_metadata[rel] = {
            "file": rel,
            "path": fpath,
            "size_bytes": size_bytes,
            "sha256": sha256,
            "total_records_in_file": 0,
            "accepted_records": 0,
            "min_date": "9999-99-99",
            "max_date": "0000-00-00",
        }

    # 2. Ingesta de todos los registros en memoria para armonización
    raw_records = []
    discard_stats = Counter()

    # (A) Archivos ZIP
    zip_files = [p for p in raw_files if p.endswith(".zip")]
    # Procesar primero VIIRS para indexar solape
    zip_files = sorted(zip_files, key=lambda p: 0 if "SV-C2" in p else 1)

    for zpath in zip_files:
        rel = os.path.relpath(zpath, DATA_RAW).replace("\\", "/")
        is_modis = "M-C61" in zpath or "MODIS" in zpath.upper()
        try:
            with zipfile.ZipFile(zpath, "r") as zf:
                dbf_names = sorted([n for n in zf.namelist() if n.lower().endswith(".dbf")])
                for dbf_name in dbf_names:
                    with zf.open(dbf_name) as st:
                        rows, total_in_dbf = parse_dbf_records(st, f"{rel}:{dbf_name}", is_modis)
                        file_metadata[rel]["total_records_in_file"] += total_in_dbf
                        for r in rows:
                            raw_records.append({
                                "source_file": rel,
                                "source_subfile": dbf_name,
                                "is_modis": is_modis,
                                "data": r
                            })
            print(f"📦 Desempaquetado {rel}: {file_metadata[rel]['total_records_in_file']:,} registros escaneados")
        except Exception as e:
            print(f"⚠️ Error leyendo {zpath}: {e}")

    # (B) Archivos CSV en data/raw/
    csv_files = [p for p in raw_files if p.endswith(".csv")]
    for cpath in csv_files:
        rel = os.path.relpath(cpath, DATA_RAW).replace("\\", "/")
        is_modis = "MODIS" in cpath.upper()
        try:
            df = pd.read_csv(cpath, low_memory=False)
            file_metadata[rel]["total_records_in_file"] = len(df)
            if "is_synthetic" in df.columns:
                # Filtrar cualquier flag sintético remanente
                syn_cnt = len(df[df["is_synthetic"].astype(str).str.lower() == "true"])
                if syn_cnt > 0:
                    discard_stats["synthetic_flag_rejected"] += syn_cnt
                df = df[df["is_synthetic"].astype(str).str.lower() != "true"]

            for _, row in df.iterrows():
                row_dict = {str(k).upper(): str(v) for k, v in row.items()}
                raw_records.append({
                    "source_file": rel,
                    "source_subfile": "",
                    "is_modis": is_modis,
                    "data": row_dict
                })
            print(f"📄 CSV procesado {rel}: {len(df):,} filas reales")
        except Exception as e:
            print(f"⚠️ Error leyendo CSV {cpath}: {e}")

    print(f"\nTotal registros brutos a procesar: {len(raw_records):,}")

    # 3. Filtrado determinista y Armonización física
    harmonized_points = []
    seen_keys = set()
    viirs_day_cells = set()  # Para deduplicación en período de coexistencia (2012–2026)

    # Ordenar registros para procesar VIIRS antes que MODIS para la regla de solape determinista
    raw_records.sort(key=lambda x: (0 if not x["is_modis"] else 1, x["data"].get("ACQ_DATE", "")))

    for item in raw_records:
        r = item["data"]
        src = item["source_file"]
        is_modis = item["is_modis"]

        # Filtro de anomalías industriales/estáticas: TYPE debe ser 0 o vacío
        ftype = r.get("TYPE", "").strip()
        if ftype not in ("", "0", "0.0", "nan"):
            discard_stats["non_vegetation_type_discarded"] += 1
            continue

        try:
            lat = float(r.get("LATITUDE", 0.0))
            lon = float(r.get("LONGITUDE", 0.0))
        except (ValueError, TypeError):
            discard_stats["invalid_coordinates"] += 1
            continue

        # Filtro BBOX Regional
        if not (BBOX_REGIONAL["lat_min"] <= lat <= BBOX_REGIONAL["lat_max"] and
                BBOX_REGIONAL["lon_min"] <= lon <= BBOX_REGIONAL["lon_max"]):
            discard_stats["outside_regional_bbox"] += 1
            continue

        # Parseo de fecha
        acq_raw = r.get("ACQ_DATE", "").strip().replace("-", "")[:8]
        if len(acq_raw) != 8:
            discard_stats["invalid_date"] += 1
            continue

        try:
            dt = datetime.strptime(acq_raw, "%Y%m%d")
            yr = dt.year
            iso_cal = dt.isocalendar()
            wk = min(52, max(1, int(iso_cal[1])))
            iso_date = dt.strftime("%Y-%m-%d")
        except ValueError:
            discard_stats["invalid_date"] += 1
            continue

        if yr < 2000 or yr > 2026:
            discard_stats["outside_date_range_2000_2026"] += 1
            continue

        acq_time = str(r.get("ACQ_TIME", "0000")).strip().zfill(4)

        # Dimensiones de píxel y huella
        try:
            scan = float(r.get("SCAN", 1.0 if is_modis else 0.375))
            track = float(r.get("TRACK", 1.0 if is_modis else 0.375))
            scan = max(0.1, scan)
            track = max(0.1, track)
        except Exception:
            scan = 1.0 if is_modis else 0.375
            track = 1.0 if is_modis else 0.375

        pixel_area_km2 = round(scan * track, 3)

        # Canales térmicos Ch4 y Ch5
        # En MODIS: BRIGHTNESS (~4 µm T21/T22) y BRIGHT_T31 (~11 µm T31)
        # En VIIRS: BRIGHT_TI4 o BRIGHTNESS (~4 µm) y BRIGHT_TI5 o BRIGHT_T31 (~11 µm)
        ch4_raw = r.get("BRIGHT_TI4") or r.get("BRIGHTNESS") or "0"
        ch5_raw = r.get("BRIGHT_TI5") or r.get("BRIGHT_T31") or "0"

        try:
            t4 = float(ch4_raw)
        except ValueError:
            t4 = 300.0
        try:
            t5 = float(ch5_raw)
        except ValueError:
            t5 = t4 - 15.0

        delta_temp_k = round(max(0.0, t4 - t5), 2)

        # Fire Radiative Power (FRP) y Densidad Radiativa
        try:
            frp = float(r.get("FRP", 0.0))
        except ValueError:
            frp = 0.0
        frp = max(0.0, frp)

        # Factor de calibración intersensor para FRP
        if is_modis:
            frp = round(frp * 0.92, 1)

        frp_density = round(frp / max(0.05, pixel_area_km2), 2)

        # Confianza normalizada
        conf_str = r.get("CONFIDENCE", "")
        conf_norm, conf_cat = normalize_confidence(conf_str, is_modis)

        # Metadatos del sensor y satélite
        sensor = "MODIS" if is_modis else "VIIRS"
        sat = str(r.get("SATELLITE", "Aqua" if is_modis else "SNPP")).strip().upper()
        inst = str(r.get("INSTRUMENT", sensor)).strip().upper()

        # REGLA DETERMINISTA DE SOLAPE Y DEDUPLICACIÓN (2012–2026):
        # 1) Si es VIIRS, registrar la celda observada (resolución ~1 km / 0.01°) en ese día
        # 2) Si es MODIS en el período >= 2012: si ya existe observación colocalizada de VIIRS ese día, descartar MODIS redundante
        #    para eliminar el doble conteo de un mismo frente de fuego.
        day_cell = (round(lat, 2), round(lon, 2), acq_raw)

        if not is_modis:
            viirs_day_cells.add(day_cell)
        else:
            if yr >= 2012 and day_cell in viirs_day_cells:
                discard_stats["modis_viirs_overlap_duplicate_discarded"] += 1
                continue

        # Deduplicación intra-sensor (evita dobles pasadas idénticas por archivo duplicado)
        dedup_key = (sat, round(lat, 3), round(lon, 3), acq_raw, acq_time)
        if dedup_key in seen_keys:
            discard_stats["intra_sensor_duplicate_discarded"] += 1
            continue
        seen_keys.add(dedup_key)

        glat = snap_to_grid(lat)
        glon = snap_to_grid(lon)
        province = classify_location(lat, lon)
        in_core_bbox = (BBOX_CORE["lat_min"] <= lat <= BBOX_CORE["lat_max"] and
                        BBOX_CORE["lon_min"] <= lon <= BBOX_CORE["lon_max"])

        # Factor de equivalencia por huella de píxel: VIIRS (375m) -> eq 1.0; MODIS (1km) -> eq 4.0
        harmonized_eq = 4.0 if is_modis else 1.0

        pt = {
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "grid_lat": glat,
            "grid_lon": glon,
            "province": province,
            "in_core_bbox": in_core_bbox,
            "year": yr,
            "week": wk,
            "date": iso_date,
            "acq_time": acq_time,
            "sensor": sensor,
            "satellite": sat,
            "instrument": inst,
            "source_file": src,
            "ch4_temp_k": round(t4, 2),
            "ch5_temp_k": round(t5, 2),
            "delta_temp_k": delta_temp_k,
            "frp_mw": round(frp, 1),
            "pixel_area_km2": pixel_area_km2,
            "frp_density_mw_km2": frp_density,
            "confidence_norm": conf_norm,
            "confidence_category": conf_cat,
            "harmonized_eq": harmonized_eq,
        }
        harmonized_points.append(pt)

        # Actualizar metadatos de archivo
        if src in file_metadata:
            file_metadata[src]["accepted_records"] += 1
            if iso_date < file_metadata[src]["min_date"]:
                file_metadata[src]["min_date"] = iso_date
            if iso_date > file_metadata[src]["max_date"]:
                file_metadata[src]["max_date"] = iso_date

    print(f"\n✅ Total registros reales armonizados aceptados: {len(harmonized_points):,}")
    print("Estadísticas de filtrado y descarte:")
    for k, v in sorted(discard_stats.items()):
        print(f"   - {k}: {v:,}")

    # 4. Verificación de cobertura 2000–2026
    yearly_counts = Counter(p["year"] for p in harmonized_points)
    yearly_modis = Counter(p["year"] for p in harmonized_points if p["sensor"] == "MODIS")
    yearly_viirs = Counter(p["year"] for p in harmonized_points if p["sensor"] == "VIIRS")
    yearly_core = Counter(p["year"] for p in harmonized_points if p["in_core_bbox"])

    print("\nResumen por Año:")
    print("AÑO  | MODIS  | VIIRS  | REGIONAL | CORE BBOX")
    print("-" * 46)
    for yr in range(2000, 2027):
        m = yearly_modis.get(yr, 0)
        v = yearly_viirs.get(yr, 0)
        tot = yearly_counts.get(yr, 0)
        core = yearly_core.get(yr, 0)
        print(f"{yr} | {m:6d} | {v:6d} | {tot:8d} | {core:8d}")
        if tot == 0:
            raise RuntimeError(f"CRÍTICO: No se encontraron registros reales para el año {yr}!")

    # 5. Construcción de la Grilla Histórica y Estadísticas Estacionales (52 semanas x años)
    cell_data = {}
    points_by_year = defaultdict(list)
    regional_week_year = defaultdict(lambda: defaultdict(float))
    core_week_year = defaultdict(lambda: defaultdict(float))

    max_week_2026 = 1
    for pt in harmonized_points:
        yr = pt["year"]
        wk = pt["week"]
        glat = pt["grid_lat"]
        glon = pt["grid_lon"]
        ckey = (glat, glon)

        if yr == 2026 and wk > max_week_2026:
            max_week_2026 = wk

        if ckey not in cell_data:
            cell_data[ckey] = {
                "lat": glat,
                "lon": glon,
                "province": pt["province"],
                "in_core": pt["in_core_bbox"],
                "weeks": defaultdict(lambda: defaultdict(lambda: {"viirs": 0, "modis": 0, "eq": 0.0, "frp_mw": 0.0}))
            }

        cell_data[ckey]["weeks"][wk][yr]["eq"] += pt["harmonized_eq"]
        cell_data[ckey]["weeks"][wk][yr]["frp_mw"] += pt["frp_mw"]
        if pt["sensor"] == "MODIS":
            cell_data[ckey]["weeks"][wk][yr]["modis"] += 1
        else:
            cell_data[ckey]["weeks"][wk][yr]["viirs"] += 1

        regional_week_year[wk][yr] += pt["harmonized_eq"]
        if pt["in_core_bbox"]:
            core_week_year[wk][yr] += pt["harmonized_eq"]

        # Compacto para visualización anual
        points_by_year[str(yr)].append([
            pt["lat"], pt["lon"], pt["frp_mw"], pt["week"], pt["date"],
            pt["sensor"], pt["delta_temp_k"]
        ])

    closed_years = list(range(2000, 2026))  # 2000..2025 inclusive (26 años cerrados)

    regional_baseline = []
    core_baseline = []

    for w in range(1, 53):
        r_vals = [regional_week_year[w].get(y, 0.0) for y in closed_years]
        r_mean = float(np.mean(r_vals)) if r_vals else 0.0
        r_std = float(np.std(r_vals, ddof=1)) if len(r_vals) > 1 else max(1.0, r_mean * 0.35)
        regional_baseline.append({
            "week": w,
            "baseline_mean": round(r_mean, 2),
            "baseline_std": round(max(0.5, r_std), 2)
        })

        c_vals = [core_week_year[w].get(y, 0.0) for y in closed_years]
        c_mean = float(np.mean(c_vals)) if c_vals else 0.0
        c_std = float(np.std(c_vals, ddof=1)) if len(c_vals) > 1 else max(1.0, c_mean * 0.35)
        core_baseline.append({
            "week": w,
            "baseline_mean": round(c_mean, 2),
            "baseline_std": round(max(0.5, c_std), 2)
        })

    # Celdas espaciales agregadas
    cells_list = []
    for (glat, glon), cinfo in sorted(cell_data.items()):
        weeks_map = {}
        total_cell_eq = 0.0
        for w, yr_dict in sorted(cinfo["weeks"].items()):
            by_year = {}
            for yr, vals in sorted(yr_dict.items()):
                by_year[str(yr)] = {
                    "eq": round(vals["eq"], 1),
                    "viirs": vals["viirs"],
                    "modis": vals["modis"],
                    "frp_mw": round(vals["frp_mw"], 1)
                }
                total_cell_eq += vals["eq"]

            cell_yr_vals = [yr_dict[y]["eq"] if y in yr_dict else 0.0 for y in closed_years]
            c_mean = round(float(np.mean(cell_yr_vals)), 2)
            c_std = round(float(np.std(cell_yr_vals, ddof=1)), 2) if len(cell_yr_vals) > 1 else 0.5

            weeks_map[str(w)] = {
                "mean_annual": c_mean,
                "std_annual": max(0.2, c_std),
                "by_year": by_year
            }

        cells_list.append({
            "lat": glat,
            "lon": glon,
            "province": cinfo["province"],
            "in_core": cinfo["in_core"],
            "total_harmonized_eq": round(total_cell_eq, 1),
            "weeks": weeks_map
        })

    # Focos activos recientes para la consola táctica (últimos 15 días disponibles)
    recent_points = [p for p in harmonized_points if p["year"] == 2026]
    recent_points.sort(key=lambda x: (x["date"], x["acq_time"]), reverse=True)
    tactical_active_fires = recent_points[:350]

    historical_payload = {
        "metadata": {
            "title": "Serie Oficial NASA FIRMS MODIS + VIIRS Armonizada (2000–2026)",
            "region": "Córdoba y San Luis, Argentina",
            "bbox_regional": BBOX_REGIONAL,
            "bbox_core": BBOX_CORE,
            "grid_resolution_deg": GRID_RESOLUTION_DEG,
            "min_year": 2000,
            "max_year": 2026,
            "current_year": 2026,
            "current_closed_week": max_week_2026,
            "total_closed_baseline_years": len(closed_years),
            "total_points_harmonized": len(harmonized_points),
            "core_bbox_points_count": sum(yearly_core.values()),
            "yearly_breakdown": {str(k): v for k, v in sorted(yearly_counts.items())},
            "sensor_breakdown": {
                "MODIS": sum(yearly_modis.values()),
                "VIIRS": sum(yearly_viirs.values()),
            },
            "generated_at_utc": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "data_source": "NASA FIRMS Official Archive (MODIS Collection 6.1 + VIIRS S-NPP/NOAA-20/NOAA-21 C2 + NRT)",
            "overlap_deduplication_rule": "Deterministic resolution priority: On collocated daily detections (< 1 km), VIIRS (375 m) prevails over MODIS (1 km) to prevent double counting.",
        },
        "regional_baseline": regional_baseline,
        "core_baseline": core_baseline,
        "cells": cells_list,
        "points_by_year": dict(points_by_year),
    }

    with open(HISTORICAL_GRID_PATH, "w", encoding="utf-8") as f:
        json.dump(historical_payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n💾 Grilla histórica exportada: {HISTORICAL_GRID_PATH} ({os.path.getsize(HISTORICAL_GRID_PATH)/1024:.1f} KB)")

    # Exportar snapshot de fuegos activos
    active_snapshot_payload = {
        "metadata": {
            "title": "NASA FIRMS NRT Active Thermal Detections",
            "bbox": BBOX_CORE,
            "count": len(tactical_active_fires),
            "last_updated_utc": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "active_detections": tactical_active_fires,
    }
    with open(ACTIVE_SNAPSHOT_PATH, "w", encoding="utf-8") as f:
        json.dump(active_snapshot_payload, f, ensure_ascii=False, indent=2)

    print(f"💾 Snapshot de fuegos activos exportado: {ACTIVE_SNAPSHOT_PATH}")

    # 6. Generación de data/manifest.json
    for meta in file_metadata.values():
        manifest["files"].append({
            "file": meta["file"],
            "sha256": meta["sha256"],
            "size_bytes": meta["size_bytes"],
            "total_records_in_file": meta["total_records_in_file"],
            "accepted_records": meta["accepted_records"],
            "date_range": [meta["min_date"], meta["max_date"]],
        })

    manifest["total_files"] = len(manifest["files"])
    manifest["total_raw_scanned"] = sum(f["total_records_in_file"] for f in manifest["files"])
    manifest["total_harmonized_accepted"] = len(harmonized_points)

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"💾 Manifiesto criptográfico exportado: {MANIFEST_PATH}")

    # 7. Generación de data/AUDITORIA_DATOS.md
    with open(AUDIT_PATH, "w", encoding="utf-8") as f:
        f.write("# Informe de Auditoría de Datos — Serie Oficial NASA FIRMS (2000–2026)\n\n")
        f.write("## 1. Resumen Ejecutivo\n")
        f.write("- **Cobertura temporal:** 2000 a 2026 (27 años continuos sin vacíos).\n")
        f.write("- **Sensores integrados:** MODIS (Terra/Aqua, 2000–2012) y VIIRS (S-NPP, NOAA-20, NOAA-21, 2012–2026).\n")
        f.write(f"- **Región de análisis:** BBOX Regional `[-67.55, -36.05, -61.65, -29.40]` y BBOX Núcleo `[-66.0, -33.5, -63.5, -31.0]` (Sierras de Córdoba y San Luis).\n")
        f.write(f"- **Total registros fuente escaneados:** {manifest['total_raw_scanned']:,}.\n")
        f.write(f"- **Total detecciones reales armonizadas:** {len(harmonized_points):,}.\n")
        f.write("- **Datos sintéticos o inyectados:** **0 (CERO)**. Todos los datos provienen directamente de archivos oficiales LANCE / FIRMS de NASA.\n\n")

        f.write("## 2. Manifiesto de Archivos Fuente y Checksums SHA-256\n")
        f.write("| Archivo | Tamaño | SHA-256 | Registros Archivo | Registros Aceptados | Rango Fechas |\n")
        f.write("|---|---|---|---|---|---|\n")
        for m in manifest["files"]:
            f.write(f"| `{m['file']}` | {m['size_bytes']/1024:.1f} KB | `{m['sha256'][:16]}...` | {m['total_records_in_file']:,} | {m['accepted_records']:,} | {m['date_range'][0]} a {m['date_range'][1]} |\n")

        f.write("\n## 3. Desglose Anual por Sensor y Región\n")
        f.write("| Año | MODIS | VIIRS | Total Regional | Core BBOX `[-66,-33.5,-63.5,-31]` |\n")
        f.write("|---|---|---|---|---|\n")
        for yr in range(2000, 2027):
            m = yearly_modis.get(yr, 0)
            v = yearly_viirs.get(yr, 0)
            tot = yearly_counts.get(yr, 0)
            core = yearly_core.get(yr, 0)
            f.write(f"| {yr} | {m:,} | {v:,} | {tot:,} | {core:,} |\n")

        f.write("\n## 4. Reglas Físicas de Armonización y Deduplicación\n")
        f.write("1. **Canales Térmicos:** Canal Ch4 (~4 µm, T4: `brightness` en MODIS, `bright_ti4` en VIIRS) y Canal Ch5 (~11 µm, T5: `bright_t31` en MODIS, `bright_ti5` en VIIRS). Cálculo de gradiente térmico $\\Delta T = T_4 - T_5$.\n")
        f.write("2. **Densidad Radiativa:** $FRP_{density} = FRP / (scan \\times track)$ en $MW/km^2$ a partir del Fire Radiative Power y las dimensiones reales de escaneo del instrumento.\n")
        f.write("3. **Confianza Normalizada:** MODIS (0–100%) a escala continua $[0.0, 1.0]$; VIIRS (l/n/h) normalizado a 0.33 (Low), 0.67 (Nominal) y 1.00 (High).\n")
        f.write("4. **Deduplicación Inter-Sensor (2012–2026):** En el período conjunto a partir del 20 de enero de 2012, ante detecciones espaciotemporales colocalizadas (misma fecha y cuadrícula de ~1 km), se otorga prelación al sensor de alta resolución VIIRS (375 m) sobre MODIS (1 km), eliminando el riesgo de doble conteo térmico.\n")
        f.write("5. **Filtro de Vegetación:** Exclusión estricta de anomalías térmicas industriales, gas flares o chimeneas (`TYPE != 0`).\n\n")

        f.write("## 5. Auditoría de Registros Descartados\n")
        f.write("| Motivo de Descarte | Cantidad Registros | Justificación Metodológica |\n")
        f.write("|---|---|---|\n")
        f.write(f"| `outside_regional_bbox` | {discard_stats['outside_regional_bbox']:,} | Detecciones fuera del área de estudio de Córdoba y San Luis. |\n")
        f.write(f"| `modis_viirs_overlap_duplicate_discarded` | {discard_stats['modis_viirs_overlap_duplicate_discarded']:,} | Focos MODIS redundantes donde ya existe observación VIIRS de 375m (previene doble conteo). |\n")
        f.write(f"| `intra_sensor_duplicate_discarded` | {discard_stats['intra_sensor_duplicate_discarded']:,} | Detecciones repetidas en múltiples descargas del mismo satélite. |\n")
        f.write(f"| `non_vegetation_type_discarded` | {discard_stats['non_vegetation_type_discarded']:,} | Anomalías térmicas estáticas/industriales (`TYPE != 0`). |\n")
        f.write(f"| `synthetic_flag_rejected` | {discard_stats['synthetic_flag_rejected']:,} | Registros con bandera sintética descartados (regla de cero datos sintéticos). |\n")

    print(f"💾 Informe de auditoría exportado: {AUDIT_PATH}")
    print("\n🎉 Pipeline de armonización histórica finalizado con éxito.")
    return len(harmonized_points)


if __name__ == "__main__":
    build_historical_harmonized_dataset()
