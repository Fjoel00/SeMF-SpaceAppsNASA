# REGISTRO DE DECISIONES TÉCNICAS (ADR) — SeMF 2.0

## ADR-001: Separación Física Absoluta del Repositorio Original
- **Contexto:** El repositorio `c:/Users/Usuario/Documents/HackatonNASA` contiene la entrega oficial del NASA Space Apps Challenge y no debe sufrir ninguna alteración.
- **Decisión:** Crear toda la arquitectura de SeMF 2.0 en un árbol de directorios físicamente separado (`c:/Users/Usuario/Documents/SeMF-SpaceAppsNASA/SeMF-2.0/`), operando el sandbox con permisos de escritura restringidos exclusivamente al nuevo workspace.
- **Consecuencias:** Riesgo cero de contaminación de commits, ramas o archivos del repositorio original.

---

## ADR-002: Migración de Generador HTML Monolítico a SPA React + TypeScript + MapLibre GL JS
- **Contexto:** En la versión 1.0, `generar_app_tactica.py` concatenaba código HTML/JS e incrustaba ~13 MB de JSON dentro de `output/index.html`, dificultando el mantenimiento, el tipado, las pruebas y la escalabilidad visual.
- **Decisión:** Adoptar una Single Page Application (SPA) en **React 18 + TypeScript estricto + Vite + Tailwind CSS** y utilizar **MapLibre GL JS** (WebGL vectorial) en lugar de Leaflet para el renderizado cartográfico.
- **Consecuencias:** Carga inicial inmediata (< 500 KB de bundle JS comprimido), renderizado fluido a 60 FPS de decenas de miles de focos satelitales e isócronas, y arquitectura modular de 8 vistas independientes.

---

## ADR-003: Proyección Cartográfica Métrica (`EPSG:32720`) para Operaciones Geométricas de Seguridad
- **Contexto:** Realizar buffers de seguridad o áreas de envolventes directamente en grados geográficos (`EPSG:4326`) introduce distorsiones significativas en latitudes medias ($\sim 31^\circ\text{–}34^\circ\text{ S}$ en Córdoba y San Luis, donde $1^\circ\text{ lon} \approx 93\text{ km}$ mientras $1^\circ\text{ lat} \approx 111.3\text{ km}$).
- **Decisión:** Utilizar `PyProj` y `Shapely 2.0` en el backend para proyectar todas las geometrías a **UTM Zona 20S (`EPSG:32720`)** antes de calcular áreas en hectáreas, distancias de proximidad vial y buffers de exclusión térmica, reproyectando el resultado final a `EPSG:4326` (GeoJSON).
- **Consecuencias:** Precisión métrica exacta en la validación de intersecciones entre carreteras y perímetros de incendio.

---

## ADR-004: Arquitectura Híbrida Determinista + Machine Learning en el Motor de Rutas
- **Contexto:** Un modelo de Machine Learning tiene incertidumbre inherente y nunca debe ser el único filtro para declarar segura una ruta de evacuación en una emergencia real. Además, el servicio público de OSRM puede experimentar latencia o caídas.
- **Decisión:**
  1. Implementar un **Validador Geométrico Determinista (`SafetyValidator`)** como barrera dura innegociable: cualquier ruta que cruce un perímetro activo o su buffer de seguridad ($d_{\text{seg}} + \text{expansión por antigüedad}$) se clasifica como `BLOCKED`.
  2. Utilizar el modelo **`RoadSegmentRiskClassifier` (LightGBM/ONNX)** exclusivamente para puntuar el riesgo de exposición ($\hat{p}_i \in [0,1]$) de los segmentos que ya superaron la barrera determinista y ordenar las rutas alternativas.
  3. Incorporar en el cliente de ruteo tanto la integración HTTP con **OSRM** como un **Grafo Vial Topológico Regional Residente en Memoria/PostGIS** de las rutas nacionales y provinciales de Córdoba y San Luis, garantizando el cálculo de rutas alternativas reales incluso en entornos 100% desconectados.
- **Consecuencias:** Seguridad determinista verificable, explicabilidad tramo por tramo y tolerancia total a fallos de red.

---

## ADR-005: Serialización Dual de Modelos ML (`.onnx` + `.joblib`) con `metadata.json`
- **Contexto:** Los modelos deben entrenarse y exportarse de forma independiente del frontend, manteniendo trazabilidad científica completa.
- **Decisión:** Exportar cada modelo entrenado tanto en formato estándar **ONNX (`.onnx`)** para inferencia ligera con `onnxruntime` como en **Joblib (`.joblib`)**, acompañados de un archivo manifiesto `metadata.json` auditable desde la API y desde la vista `/ml-analytics`.
- **Consecuencias:** Portabilidad inter-plataforma, baja latencia de inferencia (< 5 ms) y transparencia sobre las métricas reales y limitaciones de cada versión del modelo.

---

## ADR-006: Exposición Local en Puerto `8090`
- **Contexto:** El proyecto original utiliza el puerto `8080`. Se requiere evitar colisiones de puertos y exponer toda la plataforma de forma unificada.
- **Decisión:** Configurar el contenedor `semf-frontend` (Nginx) en el puerto público `8090` (`http://localhost:8090`), enrutando internamente `/api/v1/*` hacia `semf-backend:8000` dentro de la red privada de Docker Compose.
- **Consecuencias:** Un único punto de entrada limpio, sin problemas de CORS en despliegue Docker y sin conflicto con el puerto `8080`.
