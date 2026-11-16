# Origen de Datos y Trazabilidad Científica

Este documento registra de manera formal la procedencia, autoría, transformaciones y adaptaciones de todos los datos y lógicas transferidos desde el proyecto de referencia entregado **HackatonNASA** (`github.com/Fjoel00/HackatonNASA`) hacia **SeMF Mobile** (`github.com/Fjoel00/SeMF-SpaceAppsNASA`).

> **Regla de Alcance:** `HackatonNASA` es estrictamente de **SOLO LECTURA**. Todo cambio, partición y optimización mobile-first reside exclusivamente en el árbol de directorios de `SeMF-SpaceAppsNASA/mobile`.

---

## 1. Inventario de Datos Copiados y Transformados

| Archivo en SeMF Mobile | Archivo Original en HackatonNASA | Tipo / Tamaño Original | Transformación / Adaptación en SeMF Mobile |
| :--- | :--- | :--- | :--- |
| `mobile/public/data/calendar/metadata.json` | `output/historico_riesgo_grid.json` | JSON (12,0 MB) | Extracción de metadatos de la serie oficial 2000–2026 (218.518 focos, desglose anual y parámetros). Peso resultante: ~2 KB. |
| `mobile/public/data/calendar/san_luis.json` | `output/historico_riesgo_grid.json` | JSON (12,0 MB) | Agregación espaciotemporal de celdas de la Provincia de San Luis (52 semanas ISO x 27 años, media $\mu$, desvío $\sigma$, z-score y tiers de riesgo). Peso resultante: 80,5 KB (requisito `< 300 KB`). |
| `mobile/public/data/calendar/cordoba.json` | `output/historico_riesgo_grid.json` | JSON (12,0 MB) | Agregación espaciotemporal de celdas de las Sierras de Córdoba (52 semanas ISO x 27 años, media $\mu$, desvío $\sigma$, z-score y tiers de riesgo). Peso resultante: 81,1 KB (requisito `< 300 KB`). |
| `mobile/public/data/calendar/regional.json` | `output/historico_riesgo_grid.json` | JSON (12,0 MB) | Envolvente climatológica unificada para toda la región bioclimática de Córdoba y San Luis. Peso resultante: 82,5 KB. |
| `mobile/data/active_fires_snapshot.json` y `mobile/public/data/active_fires_snapshot.json` | `data/processed/active_fires_snapshot.json` (SeMF) / `output/dashboard_data.json` (Hackaton) | JSON (1,3 MB) | Snapshot satelital NRT de contingencia para funcionamiento autónomo "Modo Demo / Sin conexión" sin requerir clave de NASA FIRMS. |
| `mobile/data/shelters.geojson` y `mobile/public/data/shelters.geojson` | `data/shelters/refugios_bomberos_cba_sl.geojson` (SeMF) | GeoJSON (11,4 KB) | Catálogo auditado de 21 refugios, cuarteles de bomberos y centros de defensa civil de San Luis y Córdoba con teléfonos de emergencia y capacidad. |

---

## 2. Lógica Científica y Algoritmos Adaptados

1. **Lógica Z-Score y Envolvente Climatológica ($\mu \pm 1\sigma$):**
   - *Origen:* `procesar_historico_firms.py` en HackatonNASA.
   - *Adaptación en SeMF:* Reescrito en TypeScript (`mobile/scripts/partition_calendar.cjs` y `mobile/src/views/CalendarView.tsx`) para cálculo instantáneo en cliente sin dependencias pesadas de Python/Pandas.
2. **Buffer de Focos de Calor para Evitación Vial (3 km):**
   - *Origen:* `pipeline_incendios_nasa.py` (buffers geodésicos DBSCAN).
   - *Adaptación en SeMF:* Implementado con `@turf/buffer` sobre focos activos `< 12 h` para alimentar el parámetro `avoid_polygons` hacia OpenRouteService o Valhalla vía proxy backend.
3. **Bounding Box Canónico:**
   - *Origen:* `config.yaml` en HackatonNASA (`-66.0, -33.5, -63.5, -31.0`).
   - *Adaptación en SeMF:* Configurado como encuadre geográfico por defecto en cliente y backend.

---

## 3. Fuentes Oficiales de Datos Espaciales y de Emergencia

- **NASA FIRMS:** NASA LANCE FIRMS (MODIS Terra/Aqua a 1 km y VIIRS S-NPP / NOAA-20 / NOAA-21 a 375 m).
- **Cartografía de Refugios:** Catálogo oficial auditado de cuarteles de Bomberos Voluntarios y Policía de San Luis y Córdoba.
- **Números de Emergencia:**
  - `911`: Central Nacional de Emergencias Policiales y Médicas.
  - `100`: Bomberos de la Policía y Bomberos Voluntarios.
  - `103`: Defensa Civil Provincial (San Luis Solidario y Defensa Civil Córdoba).
  - `0800-888-38346`: Plan Provincial de Manejo del Fuego (Córdoba).
  - `(0266) 4452000`: San Luis Solidario (Comando de Operaciones de Emergencia).
