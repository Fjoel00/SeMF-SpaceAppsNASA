# Informe de Auditoría de Datos — Serie Oficial NASA FIRMS (2000–2026)

## 1. Resumen Ejecutivo
- **Cobertura temporal:** 2000 a 2026 (27 años continuos sin vacíos).
- **Sensores integrados:** MODIS (Terra/Aqua, 2000–2012) y VIIRS (S-NPP, NOAA-20, NOAA-21, 2012–2026).
- **Región de análisis:** BBOX Regional `[-67.55, -36.05, -61.65, -29.40]` y BBOX Núcleo `[-66.0, -33.5, -63.5, -31.0]` (Sierras de Córdoba y San Luis).
- **Total registros fuente escaneados:** 460,623.
- **Total detecciones reales armonizadas:** 298,101.
- **Datos sintéticos o inyectados:** **0 (CERO)**. Todos los datos provienen directamente de archivos oficiales LANCE / FIRMS de NASA.

## 2. Manifiesto de Archivos Fuente y Checksums SHA-256
| Archivo | Tamaño | SHA-256 | Registros Archivo | Registros Aceptados | Rango Fechas |
|---|---|---|---|---|---|
| `MODIS_NRT_-124_32_-114_42_5d.csv` | 15.3 KB | `2b43c805dd77de3e...` | 157 | 0 | 9999-99-99 a 0000-00-00 |
| `MODIS_NRT_-66.0_-33.5_-63.5_-31.0_5d.csv` | 0.5 KB | `34ecfcb589f93a4a...` | 3 | 2 | 2026-11-12 a 2026-11-13 |
| `VIIRS_NOAA20_NRT_-124_32_-114_42_5d.csv` | 105.6 KB | `985073884337ec4b...` | 1,045 | 0 | 9999-99-99 a 0000-00-00 |
| `VIIRS_NOAA20_NRT_-66.0_-33.5_-63.5_-31.0_5d.csv` | 1.9 KB | `dcb8e2298a906c8c...` | 16 | 16 | 2026-11-11 a 2026-11-13 |
| `VIIRS_NOAA21_NRT_-66.0_-33.5_-63.5_-31.0_5d.csv` | 1.4 KB | `332124fbe388d785...` | 12 | 12 | 2026-11-12 a 2026-11-13 |
| `VIIRS_SNPP_NRT_-124_32_-114_42_5d.csv` | 0.1 KB | `00cbae48e2509f41...` | 0 | 0 | 9999-99-99 a 0000-00-00 |
| `VIIRS_SNPP_NRT_-66.0_-33.5_-63.5_-31.0_5d.csv` | 0.1 KB | `4bfae1d09bc5edf9...` | 0 | 0 | 9999-99-99 a 0000-00-00 |
| `historico/DL_FIRE_M-C61_850396.zip` | 4657.9 KB | `74e462f638b0e287...` | 129,007 | 82,662 | 2000-11-01 a 2012-12-31 |
| `historico/DL_FIRE_SV-C2_850297.zip` | 12234.5 KB | `3ee57538072d2332...` | 330,383 | 215,409 | 2012-01-20 a 2026-11-01 |

## 3. Desglose Anual por Sensor y Región
| Año | MODIS | VIIRS | Total Regional | Core BBOX `[-66,-33.5,-63.5,-31]` |
|---|---|---|---|---|
| 2000 | 1,928 | 0 | 1,928 | 48 |
| 2001 | 4,364 | 0 | 4,364 | 851 |
| 2002 | 11,942 | 0 | 11,942 | 2,518 |
| 2003 | 14,993 | 0 | 14,993 | 3,057 |
| 2004 | 7,553 | 0 | 7,553 | 778 |
| 2005 | 5,846 | 0 | 5,846 | 1,494 |
| 2006 | 6,467 | 0 | 6,467 | 1,078 |
| 2007 | 4,033 | 0 | 4,033 | 1,002 |
| 2008 | 6,621 | 0 | 6,621 | 1,140 |
| 2009 | 8,725 | 0 | 8,725 | 3,716 |
| 2010 | 3,618 | 0 | 3,618 | 493 |
| 2011 | 4,474 | 0 | 4,474 | 1,049 |
| 2012 | 2,098 | 9,313 | 11,411 | 1,711 |
| 2013 | 0 | 20,565 | 20,565 | 7,962 |
| 2014 | 0 | 9,295 | 9,295 | 849 |
| 2015 | 0 | 7,976 | 7,976 | 1,473 |
| 2016 | 0 | 11,108 | 11,108 | 1,946 |
| 2017 | 0 | 18,299 | 18,299 | 4,602 |
| 2018 | 0 | 19,127 | 19,127 | 2,703 |
| 2019 | 0 | 11,095 | 11,095 | 1,953 |
| 2020 | 0 | 33,951 | 33,951 | 14,003 |
| 2021 | 0 | 12,880 | 12,880 | 1,734 |
| 2022 | 0 | 19,082 | 19,082 | 3,594 |
| 2023 | 0 | 10,774 | 10,774 | 1,971 |
| 2024 | 0 | 16,555 | 16,555 | 4,908 |
| 2025 | 0 | 10,940 | 10,940 | 1,094 |
| 2026 | 2 | 4,477 | 4,479 | 423 |

## 4. Reglas Físicas de Armonización y Deduplicación
1. **Canales Térmicos:** Canal Ch4 (~4 µm, T4: `brightness` en MODIS, `bright_ti4` en VIIRS) y Canal Ch5 (~11 µm, T5: `bright_t31` en MODIS, `bright_ti5` en VIIRS). Cálculo de gradiente térmico $\Delta T = T_4 - T_5$.
2. **Densidad Radiativa:** $FRP_{density} = FRP / (scan \times track)$ en $MW/km^2$ a partir del Fire Radiative Power y las dimensiones reales de escaneo del instrumento.
3. **Confianza Normalizada:** MODIS (0–100%) a escala continua $[0.0, 1.0]$; VIIRS (l/n/h) normalizado a 0.33 (Low), 0.67 (Nominal) y 1.00 (High).
4. **Deduplicación Inter-Sensor (2012–2026):** En el período conjunto a partir del 20 de enero de 2012, ante detecciones espaciotemporales colocalizadas (misma fecha y cuadrícula de ~1 km), se otorga prelación al sensor de alta resolución VIIRS (375 m) sobre MODIS (1 km), eliminando el riesgo de doble conteo térmico.
5. **Filtro de Vegetación:** Exclusión estricta de anomalías térmicas industriales, gas flares o chimeneas (`TYPE != 0`).

## 5. Auditoría de Registros Descartados
| Motivo de Descarte | Cantidad Registros | Justificación Metodológica |
|---|---|---|
| `outside_regional_bbox` | 153,461 | Detecciones fuera del área de estudio de Córdoba y San Luis. |
| `modis_viirs_overlap_duplicate_discarded` | 1,042 | Focos MODIS redundantes donde ya existe observación VIIRS de 375m (previene doble conteo). |
| `intra_sensor_duplicate_discarded` | 846 | Detecciones repetidas en múltiples descargas del mismo satélite. |
| `non_vegetation_type_discarded` | 7,173 | Anomalías térmicas estáticas/industriales (`TYPE != 0`). |
| `synthetic_flag_rejected` | 0 | Registros con bandera sintética descartados (regla de cero datos sintéticos). |
