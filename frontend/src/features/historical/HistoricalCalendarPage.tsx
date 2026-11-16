import React, { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { apiClient } from '../../services/apiClient';
import type { HistoricalCalendarPayload, HistoricalWeekCell } from '../../types/semf';
import {
  BasemapMode,
  createMapLibreStyle,
  ESRI_ATTRIBUTION,
  OSM_ATTRIBUTION,
} from '../../map/mapStyle';

// BBOX por defecto (Región Núcleo Sierras de Córdoba y San Luis)
const DEFAULT_BBOX = '-66.0,-33.5,-63.5,-31.0';

export const HistoricalCalendarPage: React.FC = () => {
  const [mode, setMode] = useState<'annual' | 'interval'>('annual');
  const [year, setYear] = useState<number>(2025);
  const [rangeFrom, setRangeFrom] = useState<number>(2000);
  const [rangeTo, setRangeTo] = useState<number>(2025);
  const [selectedWeek, setSelectedWeek] = useState<number>(36);
  const [sensor, setSensor] = useState<'all' | 'viirs' | 'modis'>('all');
  const [bbox, setBbox] = useState<string | null>(DEFAULT_BBOX);
  const [data, setData] = useState<HistoricalCalendarPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados del mapa selector BBOX
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [activeBasemap, setActiveBasemap] = useState<BasemapMode>('satellite');
  const [isDrawingBbox, setIsDrawingBbox] = useState<boolean>(false);
  const [selectedBboxCoords, setSelectedBboxCoords] = useState<{
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  }>({
    minLon: -66.0,
    minLat: -33.5,
    maxLon: -63.5,
    maxLat: -31.0,
  });

  // Tooltip interactivo flotante
  const [hoveredCell, setHoveredCell] = useState<{
    week: number;
    year: number;
    count: number;
    z_score: number;
    viirs: number;
    modis: number;
    frp_mw: number;
    pending: boolean;
    x: number;
    y: number;
  } | null>(null);

  // Carga de datos de la API
  const loadData = () => {
    setIsLoading(true);
    setError(null);
    apiClient
      .getHistoricalCalendar({
        mode,
        year,
        range_from: rangeFrom,
        range_to: rangeTo,
        week: selectedWeek,
        bbox,
        sensor,
      })
      .then((res) => {
        setData(res);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar la serie histórica');
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [mode, year, rangeFrom, rangeTo, selectedWeek, bbox, sensor]);

  // Inicialización del Mapa MapLibre (Sin API Keys)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: createMapLibreStyle('satellite'),
      center: [-64.75, -32.25],
      zoom: 6.8,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.on('load', () => {
      // Fuente del polígono BBOX actual
      map.addSource('selected-bbox-source', {
        type: 'geojson',
        data: getBboxGeoJson(
          selectedBboxCoords.minLon,
          selectedBboxCoords.minLat,
          selectedBboxCoords.maxLon,
          selectedBboxCoords.maxLat
        ),
      });

      // Capa de relleno
      map.addLayer({
        id: 'selected-bbox-fill',
        type: 'fill',
        source: 'selected-bbox-source',
        paint: {
          'fill-color': '#FF6117',
          'fill-opacity': 0.18,
        },
      });

      // Capa de borde
      map.addLayer({
        id: 'selected-bbox-stroke',
        type: 'line',
        source: 'selected-bbox-source',
        paint: {
          'line-color': '#FF6117',
          'line-width': 2.5,
          'line-dasharray': [2, 1],
        },
      });
    });

    // Soporte para dibujar BBOX arrastrando con el ratón
    let startLngLat: maplibregl.LngLat | null = null;

    map.on('mousedown', (e) => {
      if (!isDrawingBbox && !e.originalEvent.shiftKey) return;
      startLngLat = e.lngLat;
      map.dragPan.disable();
    });

    map.on('mousemove', (e) => {
      if (!startLngLat) return;
      const cur = e.lngLat;
      const minLon = Math.min(startLngLat.lng, cur.lng);
      const maxLon = Math.max(startLngLat.lng, cur.lng);
      const minLat = Math.min(startLngLat.lat, cur.lat);
      const maxLat = Math.max(startLngLat.lat, cur.lat);

      const src = map.getSource('selected-bbox-source') as maplibregl.GeoJSONSource;
      if (src) {
        src.setData(getBboxGeoJson(minLon, minLat, maxLon, maxLat));
      }
    });

    map.on('mouseup', (e) => {
      if (!startLngLat) return;
      const cur = e.lngLat;
      map.dragPan.enable();
      const minLon = Number(Math.min(startLngLat.lng, cur.lng).toFixed(4));
      const maxLon = Number(Math.max(startLngLat.lng, cur.lng).toFixed(4));
      const minLat = Number(Math.min(startLngLat.lat, cur.lat).toFixed(4));
      const maxLat = Number(Math.max(startLngLat.lat, cur.lat).toFixed(4));
      startLngLat = null;
      setIsDrawingBbox(false);

      if (Math.abs(maxLon - minLon) > 0.05 && Math.abs(maxLat - minLat) > 0.05) {
        setSelectedBboxCoords({ minLon, minLat, maxLon, maxLat });
        setBbox(`${minLon},${minLat},${maxLon},${maxLat}`);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Actualizar polígono BBOX cuando cambie la selección
  const getBboxGeoJson = (minLon: number, minLat: number, maxLon: number, maxLat: number) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ],
      ],
    },
    properties: {},
  });

  const updateMapBbox = (minLon: number, minLat: number, maxLon: number, maxLat: number) => {
    setSelectedBboxCoords({ minLon, minLat, maxLon, maxLat });
    setBbox(`${minLon},${minLat},${maxLon},${maxLat}`);
    if (mapRef.current) {
      const src = mapRef.current.getSource('selected-bbox-source') as maplibregl.GeoJSONSource;
      if (src) {
        src.setData(getBboxGeoJson(minLon, minLat, maxLon, maxLat));
      }
    }
  };

  const resetBboxToCore = () => {
    updateMapBbox(-66.0, -33.5, -63.5, -31.0);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [-64.75, -32.25], zoom: 6.8 });
    }
  };

  // Conmutador interactivo de capas base libres
  const switchBasemap = (type: BasemapMode) => {
    setActiveBasemap(type);
    const map = mapRef.current;
    if (!map) return;
    map.setLayoutProperty('basemap-satellite', 'visibility', type === 'satellite' ? 'visible' : 'none');
    map.setLayoutProperty('basemap-streets', 'visibility', type === 'streets' ? 'visible' : 'none');
  };

  // Cálculo del área aproximada del BBOX en km²
  const bboxAreaKm2 = useMemo(() => {
    const latSpan = Math.abs(selectedBboxCoords.maxLat - selectedBboxCoords.minLat) * 111.0;
    const midLatRad = (((selectedBboxCoords.minLat + selectedBboxCoords.maxLat) / 2) * Math.PI) / 180;
    const lonSpan = Math.abs(selectedBboxCoords.maxLon - selectedBboxCoords.minLon) * 111.0 * Math.cos(midLatRad);
    return Math.round(latSpan * lonSpan);
  }, [selectedBboxCoords]);

  const weekDetail: HistoricalWeekCell | undefined = data?.kpis.selected_week_detail;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* 1. SECCIÓN SUPERIOR: MAPA INTERACTIVO CON SELECTOR BBOX */}
      <div className="bg-[#161922] border border-[#252A36] rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#252A36] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              <span>📅</span>
              <span>Calendario de Actividad y Régimen Histórico de Incendios (2000–2026)</span>
            </h1>
            <p className="text-xs text-[#9BA3AF] mt-0.5">
              Serie armonizada continua oficial: MODIS (Terra/Aqua 2000–2026) + VIIRS (S-NPP/NOAA-20/NOAA-21 2012–2026)
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsDrawingBbox(!isDrawingBbox)}
              aria-pressed={isDrawingBbox}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                isDrawingBbox
                  ? 'bg-red-600 text-white border-red-500 animate-pulse'
                  : 'bg-[#1F2430] text-white border-[#2B3242] hover:border-[#FF6117]'
              }`}
            >
              <span>✏️</span>
              <span>{isDrawingBbox ? 'Arrastra en el mapa para marcar BBOX' : 'Dibujar Área BBOX'}</span>
            </button>

            <button
              onClick={resetBboxToCore}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#1F2430] hover:bg-[#252A36] text-[#9BA3AF] hover:text-white border border-[#2B3242] transition"
            >
              Restablecer región
            </button>
          </div>
        </div>

        {/* MAPA MAPLIBRE GL DE SELECCIÓN */}
        <div className="relative h-64 sm:h-72 w-full bg-[#10121A]">
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

          {/* CONMUTADOR CALLE / SATÉLITE */}
          <div className="absolute top-3 right-3 z-10 flex items-center bg-[#161922]/90 backdrop-blur-md p-1 rounded-xl border border-[#2B3242] shadow-lg">
            <button
              onClick={() => switchBasemap('streets')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                activeBasemap === 'streets'
                  ? 'bg-[#FF6117] text-white shadow'
                  : 'text-[#9BA3AF] hover:text-white'
              }`}
            >
              🗺️ Calle
            </button>
            <button
              onClick={() => switchBasemap('satellite')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                activeBasemap === 'satellite'
                  ? 'bg-[#FF6117] text-white shadow'
                  : 'text-[#9BA3AF] hover:text-white'
              }`}
            >
              🛰️ Satélite
            </button>
          </div>

          {/* INFORMACIÓN DEL ÁREA SELECCIONADA */}
          <div className="absolute bottom-3 left-3 z-10 bg-[#161922]/95 backdrop-blur-md border border-[#2B3242] rounded-xl px-3.5 py-2 text-xs font-mono shadow-xl">
            <div className="text-white font-bold flex items-center gap-1.5">
              <span>BBOX Seleccionado:</span>
              <span className="text-[#FF6117]">~{bboxAreaKm2.toLocaleString()} km²</span>
            </div>
            <div className="text-[11px] text-[#9BA3AF] mt-0.5">
              [{selectedBboxCoords.minLat.toFixed(2)}, {selectedBboxCoords.minLon.toFixed(2)}] a [
              {selectedBboxCoords.maxLat.toFixed(2)}, {selectedBboxCoords.maxLon.toFixed(2)}]
            </div>
          </div>

          {/* ATRIBUCIÓN OBLIGATORIA */}
          <div className="absolute bottom-1 right-2 z-10 text-[9px] text-white/70 bg-black/50 px-2 py-0.5 rounded font-mono">
            {activeBasemap === 'satellite' ? ESRI_ATTRIBUTION : OSM_ATTRIBUTION}
          </div>
        </div>
      </div>

      {/* 2. PANEL DE FILTROS: MODO, SENSOR, AÑO E INTERVALO */}
      <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        {/* FILTRO POR SENSOR */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#9BA3AF] font-semibold">Sensor:</span>
          <div className="flex bg-[#0F1117] p-1 rounded-xl border border-[#252A36]">
            {(
              [
                { id: 'all', label: 'Todos (Armonizado)' },
                { id: 'viirs', label: 'Solo VIIRS (375m)' },
                { id: 'modis', label: 'Solo MODIS (1km)' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setSensor(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  sensor === s.id
                    ? 'bg-[#FF6117] text-white shadow-md'
                    : 'text-[#9BA3AF] hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* SELECTOR DE AÑO Y MODO ANUAL / INTERVALO */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-[#0F1117] p-1 rounded-xl border border-[#252A36]">
            <button
              onClick={() => setMode('annual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === 'annual'
                  ? 'bg-[#FF6117] text-white shadow-md'
                  : 'text-[#9BA3AF] hover:text-white'
              }`}
            >
              Año Individual
            </button>
            <button
              onClick={() => setMode('interval')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === 'interval'
                  ? 'bg-[#FF6117] text-white shadow-md'
                  : 'text-[#9BA3AF] hover:text-white'
              }`}
            >
              Intervalo de Años
            </button>
          </div>

          {mode === 'annual' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#9BA3AF]">Año:</span>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Seleccionar año"
                className="bg-[#0F1117] border border-[#252A36] rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:border-[#FF6117] outline-none"
              >
                {Array.from({ length: 27 }, (_, i) => 2026 - i).map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} {yr === 2026 ? '(Parcial)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-[#9BA3AF]">Desde:</span>
              <select
                value={rangeFrom}
                onChange={(e) => setRangeFrom(Number(e.target.value))}
                className="bg-[#0F1117] border border-[#252A36] rounded-lg px-2 py-1 text-white font-bold"
              >
                {Array.from({ length: 27 }, (_, i) => 2000 + i).map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
              <span className="text-[#9BA3AF]">Hasta:</span>
              <select
                value={rangeTo}
                onChange={(e) => setRangeTo(Number(e.target.value))}
                className="bg-[#0F1117] border border-[#252A36] rounded-lg px-2 py-1 text-white font-bold"
              >
                {Array.from({ length: 27 }, (_, i) => 2000 + i).map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 3. TARJETAS KPIS DEL PERÍODO Y ANOMALÍA Z-SCORE */}
      {isLoading ? (
        <div className="p-8 text-center text-[#9BA3AF] font-mono text-xs flex items-center justify-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#FF6117] animate-ping" />
          <span>Calculando serie climatológica real para el BBOX seleccionado...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-950/40 border border-red-500/50 rounded-2xl text-center">
          <p className="text-red-300 font-semibold text-sm">{error}</p>
          <button
            onClick={loadData}
            className="mt-3 px-4 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-500 transition"
          >
            Reintentar
          </button>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-4">
              <span className="text-xs text-[#9BA3AF] font-medium">Detecciones en Área</span>
              <div className="text-2xl font-black text-white mt-1">
                {Math.round(data.kpis.total_harmonized_eq).toLocaleString()}
              </div>
              <div className="text-[11px] text-[#9BA3AF] mt-1 font-mono">
                {data.kpis.total_viirs_count.toLocaleString()} VIIRS + {data.kpis.total_modis_count.toLocaleString()} MODIS
              </div>
            </div>

            <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-4">
              <span className="text-xs text-[#9BA3AF] font-medium">Potencia Radiativa (FRP)</span>
              <div className="text-2xl font-black text-[#FF6117] mt-1">
                {Math.round(data.kpis.total_frp_mw).toLocaleString()} MW
              </div>
              <div className="text-[11px] text-[#9BA3AF] mt-1 font-mono">
                {data.metadata.active_cells_count} cuadrículas evaluadas
              </div>
            </div>

            <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-4">
              <span className="text-xs text-[#9BA3AF] font-medium">
                Semana Seleccionada: S{selectedWeek}
              </span>
              <div className="text-2xl font-black text-white mt-1">
                {weekDetail ? Math.round(weekDetail.observed_harmonized) : 0} focos
              </div>
              <div className="text-[11px] text-[#9BA3AF] mt-1 font-mono">
                Media histórica (μ ± 1σ): {weekDetail?.baseline_mean} ± {weekDetail?.baseline_std}
              </div>
            </div>

            <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-4">
              <span className="text-xs text-[#9BA3AF] font-medium">Anomalía Z-Score (vs. Media)</span>
              <div
                className={`text-2xl font-black mt-1 flex items-center gap-2 ${
                  (weekDetail?.z_score || 0) >= 2.0
                    ? 'text-red-400'
                    : (weekDetail?.z_score || 0) >= 1.0
                    ? 'text-[#FF6117]'
                    : (weekDetail?.z_score || 0) <= -2.0
                    ? 'text-cyan-400'
                    : 'text-emerald-400'
                }`}
              >
                <span>
                  {weekDetail && weekDetail.z_score >= 0
                    ? `+${weekDetail.z_score.toFixed(2)}`
                    : weekDetail?.z_score.toFixed(2)}{' '}
                  σ
                </span>
                {Math.abs(weekDetail?.z_score || 0) >= 2.0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500 font-bold uppercase">
                    ¡Anomalía Extrema!
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#9BA3AF] mt-1">{weekDetail?.status}</div>
            </div>
          </div>

          {/* 4. CURVA DE ENVOLVENTE ESTACIONAL (μ ± 1σ) A LO LARGO DE LAS 52 SEMANAS */}
          <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Curva de Expectativa Estacional Climatológica (52 Semanas ISO)
                </h2>
                <p className="text-xs text-[#9BA3AF] mt-0.5">
                  Línea base empírica μ con banda de variabilidad (μ ± 1σ) calculada sobre 26 años cerrados (2000–2025).
                </p>
              </div>
              <span className="text-xs font-mono text-[#FF6117] font-semibold">
                Ventana Crítica: Agosto – Octubre (Semanas 31 a 43)
              </span>
            </div>

            {/* GRÁFICO SVG RESPONSIVE DE LA CURVA ESTACIONAL */}
            <div className="h-44 w-full relative pt-2">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 520 120" preserveAspectRatio="none">
                {/* Ejes y guías */}
                <line x1="0" y1="110" x2="520" y2="110" stroke="#252A36" strokeWidth="1" />
                <line x1="0" y1="60" x2="520" y2="60" stroke="#252A36" strokeDasharray="3 3" strokeWidth="1" />
                <line x1="0" y1="10" x2="520" y2="10" stroke="#252A36" strokeDasharray="3 3" strokeWidth="1" />

                {/* Área de variabilidad (μ ± 1σ) */}
                {(() => {
                  const maxObs = Math.max(
                    1,
                    ...data.weeks.map((w) => Math.max(w.upper_band, w.observed_harmonized))
                  );
                  const scaleY = (val: number) => 110 - (val / maxObs) * 100;

                  // Puntos de la banda superior e inferior
                  const upperPoints = data.weeks.map((w, idx) => `${idx * 10},${scaleY(w.upper_band)}`);
                  const lowerPoints = data.weeks.map((w, idx) => `${idx * 10},${scaleY(w.lower_band)}`).reverse();
                  const bandPath = `M ${upperPoints.join(' L ')} L ${lowerPoints.join(' L ')} Z`;

                  // Puntos de la media μ
                  const meanPath = data.weeks
                    .map((w, idx) => `${idx === 0 ? 'M' : 'L'} ${idx * 10} ${scaleY(w.baseline_mean)}`)
                    .join(' ');

                  // Puntos observados del año actual
                  const obsPath = data.weeks
                    .filter((w) => !w.pending)
                    .map((w, idx) => `${idx === 0 ? 'M' : 'L'} ${idx * 10} ${scaleY(w.observed_harmonized)}`)
                    .join(' ');

                  return (
                    <>
                      {/* Banda sombreada de variabilidad estacional */}
                      <path d={bandPath} fill="#FF6117" fillOpacity="0.12" />

                      {/* Línea de la media histórica μ */}
                      <path d={meanPath} fill="none" stroke="#9BA3AF" strokeWidth="1.8" strokeDasharray="4 2" />

                      {/* Línea del año observado */}
                      <path d={obsPath} fill="none" stroke="#FF6117" strokeWidth="2.5" />

                      {/* Puntos y resaltado de anomalías (|Z| >= 2) */}
                      {data.weeks
                        .filter((w) => !w.pending)
                        .map((w, idx) => {
                          const cx = idx * 10;
                          const cy = scaleY(w.observed_harmonized);
                          const isExtreme = Math.abs(w.z_score) >= 2.0;
                          const isSel = w.week === selectedWeek;
                          return (
                            <circle
                              key={w.week}
                              cx={cx}
                              cy={cy}
                              r={isSel ? 5 : isExtreme ? 4.5 : 2.5}
                              fill={isExtreme ? '#EF4444' : isSel ? '#FFFFFF' : '#FF6117'}
                              stroke={isExtreme ? '#FFFFFF' : '#161922'}
                              strokeWidth={1.5}
                              className="cursor-pointer transition-transform hover:scale-150"
                              onClick={() => setSelectedWeek(w.week)}
                            />
                          );
                        })}
                    </>
                  );
                })()}
              </svg>

              {/* Etiquetas de semanas */}
              <div className="flex justify-between text-[10px] font-mono text-[#9BA3AF] mt-1 px-1">
                <span>Semana 1 (Ene)</span>
                <span>Semana 13 (Abr)</span>
                <span>Semana 26 (Jul)</span>
                <span className="text-[#FF6117] font-bold">Semana 39 (Oct - Pico)</span>
                <span>Semana 52 (Dic)</span>
              </div>
            </div>
          </div>

          {/* 5. HEATMAP INTERACTIVO DE 52 SEMANAS x 27 AÑOS (2000–2026) */}
          <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🔥</span>
                  <span>Matriz Heatmap Multianual (52 Semanas x Años 2000–2026)</span>
                </h2>
                <p className="text-xs text-[#9BA3AF] mt-0.5">
                  Toque o pase el ratón sobre cualquier celda para ver Z-Score, conteo y aporte sensor.
                </p>
              </div>

              <div className="flex items-center gap-3 text-[10px] font-mono">
                <span className="flex items-center gap-1 text-[#9BA3AF]">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500/40" /> Normal
                </span>
                <span className="flex items-center gap-1 text-orange-400">
                  <span className="w-2.5 h-2.5 rounded bg-orange-500/40 border border-orange-500" /> Alta
                </span>
                <span className="flex items-center gap-1 text-red-400 font-bold">
                  <span className="w-2.5 h-2.5 rounded bg-red-600 border border-red-400" /> Extrema (|Z|≥2)
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="w-2.5 h-2.5 rounded bg-slate-800/40 border border-dashed border-slate-600" /> Futura
                </span>
              </div>
            </div>

            {/* TABLA HORIZONTAL HEATMAP */}
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[900px] space-y-1">
                {/* Fila de números de semana */}
                <div className="flex items-center text-[9px] font-mono text-[#9BA3AF] pb-1">
                  <div className="w-14 text-center font-bold">AÑO</div>
                  {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                    <div
                      key={w}
                      className={`flex-1 text-center ${
                        w === selectedWeek ? 'text-[#FF6117] font-black' : ''
                      }`}
                    >
                      {w % 4 === 1 ? `S${w}` : '·'}
                    </div>
                  ))}
                </div>

                {/* Filas de años 2026 down to 2000 */}
                {data.heatmap?.map((hmRow) => {
                  const isCurrentSelectedYear = hmRow.year === year;
                  return (
                    <div
                      key={hmRow.year}
                      className={`flex items-center rounded-lg transition-colors py-0.5 ${
                        isCurrentSelectedYear ? 'bg-[#FF6117]/10 ring-1 ring-[#FF6117]/40' : 'hover:bg-[#1F2430]'
                      }`}
                    >
                      <button
                        onClick={() => setYear(hmRow.year)}
                        className={`w-14 text-left font-mono text-xs font-bold px-1 transition ${
                          isCurrentSelectedYear ? 'text-[#FF6117]' : 'text-[#9BA3AF] hover:text-white'
                        }`}
                      >
                        {hmRow.year} {hmRow.is_partial ? '*' : ''}
                      </button>

                      {hmRow.weeks.map((cell) => {
                        const isPending = cell.pending;
                        const isSelectedCell = hmRow.year === year && cell.week === selectedWeek;
                        const isHighZ = cell.z_score >= 2.0;
                        const isLowZ = cell.z_score <= -2.0;

                        let bgClass = 'bg-[#1F2430]/60 border-transparent text-slate-500';
                        if (isPending) {
                          bgClass = 'bg-[#10121A] border-dashed border-[#252A36] text-transparent';
                        } else if (isHighZ) {
                          bgClass = 'bg-red-600 border-red-400 text-white font-bold animate-pulse';
                        } else if (cell.z_score >= 1.0) {
                          bgClass = 'bg-orange-500/80 border-orange-400 text-white';
                        } else if (cell.count > 0) {
                          bgClass = 'bg-[#FF6117]/40 border-[#FF6117]/50 text-white';
                        } else if (isLowZ) {
                          bgClass = 'bg-cyan-900/40 border-cyan-500/40 text-cyan-200';
                        }

                        return (
                          <div
                            key={cell.week}
                            onClick={() => {
                              if (!isPending) {
                                setYear(hmRow.year);
                                setSelectedWeek(cell.week);
                              }
                            }}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredCell({
                                ...cell,
                                x: rect.left,
                                y: rect.top,
                              });
                            }}
                            onMouseLeave={() => setHoveredCell(null)}
                            className={`flex-1 h-5 mx-0.5 rounded cursor-pointer border flex items-center justify-center text-[9px] font-mono transition-transform hover:scale-125 hover:z-20 ${bgClass} ${
                              isSelectedCell ? 'ring-2 ring-white z-10' : ''
                            }`}
                            title={`Año ${cell.year} - S${cell.week}: ${cell.count >= 0 ? `${cell.count} focos` : 'Semana futura'}`}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TOOLTIP FLOTANTE DINÁMICO */}
          {hoveredCell && (
            <div
              className="fixed z-50 pointer-events-none bg-[#161922] border border-[#FF6117] text-white p-3 rounded-xl shadow-2xl text-xs font-mono space-y-1 w-64 -translate-x-1/2 -translate-y-full mb-2"
              style={{
                left: `${hoveredCell.x}px`,
                top: `${hoveredCell.y - 8}px`,
              }}
            >
              <div className="font-bold text-[#FF6117] flex justify-between">
                <span>
                  Año {hoveredCell.year} • Semana {hoveredCell.week}
                </span>
                {hoveredCell.pending && (
                  <span className="text-[10px] text-slate-400">Pendiente</span>
                )}
              </div>
              {!hoveredCell.pending ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#9BA3AF]">Detecciones:</span>
                    <b className="text-white">{hoveredCell.count} focos</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9BA3AF]">Anomalía Z-Score:</span>
                    <b
                      className={
                        hoveredCell.z_score >= 2.0
                          ? 'text-red-400'
                          : hoveredCell.z_score >= 1.0
                          ? 'text-[#FF6117]'
                          : 'text-emerald-400'
                      }
                    >
                      {hoveredCell.z_score >= 0 ? `+${hoveredCell.z_score}` : hoveredCell.z_score} σ
                    </b>
                  </div>
                  <div className="flex justify-between text-[11px] text-[#9BA3AF] pt-1 border-t border-[#252A36]">
                    <span>VIIRS 375m: <b>{hoveredCell.viirs}</b></span>
                    <span>MODIS 1km: <b>{hoveredCell.modis}</b></span>
                  </div>
                  <div className="flex justify-between text-[11px] text-[#9BA3AF]">
                    <span>Potencia Térmica:</span>
                    <b className="text-[#FF6117]">{hoveredCell.frp_mw} MW</b>
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-slate-400 italic">
                  Semana aún no transcurrida en 2026 (sin proyección artificial).
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
