import React, { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import {
  Calendar,
  Layers,
  MapPin,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import type { HistoricalCalendarPayload, HistoricalWeekCell } from '../../types/semf';

type HeatmapCellDetail = {
  week: number;
  year: number;
  count: number;
  z_score: number;
  viirs: number;
  modis: number;
  frp_mw: number;
  pending: boolean;
};
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

  // Estados del mapa selector BBOX y responsive accordion
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isMapExpandedMobile, setIsMapExpandedMobile] = useState<boolean>(false);
  const [activeBasemap, setActiveBasemap] = useState<BasemapMode>('streets');
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

  // Celda seleccionada para detalle táctil en móvil / desktop
  const [activeCellDetail, setActiveCellDetail] = useState<HeatmapCellDetail | null>(null);

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
      style: createMapLibreStyle('streets'),
      center: [-64.75, -32.25],
      zoom: 6.8,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.on('load', () => {
      map.addSource('selected-bbox-source', {
        type: 'geojson',
        data: getBboxGeoJson(
          selectedBboxCoords.minLon,
          selectedBboxCoords.minLat,
          selectedBboxCoords.maxLon,
          selectedBboxCoords.maxLat
        ),
      });

      map.addLayer({
        id: 'selected-bbox-fill',
        type: 'fill',
        source: 'selected-bbox-source',
        paint: {
          'fill-color': '#F36B35',
          'fill-opacity': 0.15,
        },
      });

      map.addLayer({
        id: 'selected-bbox-stroke',
        type: 'line',
        source: 'selected-bbox-source',
        paint: {
          'line-color': '#F36B35',
          'line-width': 2.5,
          'line-dasharray': [2, 1],
        },
      });
    });

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

  const switchBasemap = (type: BasemapMode) => {
    setActiveBasemap(type);
    const map = mapRef.current;
    if (!map) return;
    map.setLayoutProperty('basemap-satellite', 'visibility', type === 'satellite' ? 'visible' : 'none');
    map.setLayoutProperty('basemap-streets', 'visibility', type === 'streets' ? 'visible' : 'none');
  };

  const bboxAreaKm2 = useMemo(() => {
    const latSpan = Math.abs(selectedBboxCoords.maxLat - selectedBboxCoords.minLat) * 111.0;
    const midLatRad = (((selectedBboxCoords.minLat + selectedBboxCoords.maxLat) / 2) * Math.PI) / 180;
    const lonSpan = Math.abs(selectedBboxCoords.maxLon - selectedBboxCoords.minLon) * 111.0 * Math.cos(midLatRad);
    return Math.round(latSpan * lonSpan);
  }, [selectedBboxCoords]);

  const weekDetail: HistoricalWeekCell | undefined = data?.kpis.selected_week_detail;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* 1. ENCABEZADO HUMANIZADO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-[#E7EAF0] shadow-subtle">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#FDF2EC] text-[#F36B35]">
              <Calendar className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-[#202938] tracking-tight">
              Historial de incendios
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#687385] mt-1.5">
            Analiza la actividad de incendios en Córdoba y San Luis entre 2000 y 2026.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0] text-xs font-medium text-[#202938]">
            {mode === 'annual' ? `Año ${year}` : `${rangeFrom} – ${rangeTo}`} • Semana S{selectedWeek}
          </span>
          <span className="text-xs text-[#16A36A] font-semibold flex items-center gap-1 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            NASA Real
          </span>
        </div>
      </div>

      {/* 2. SELECCIÓN GEOGRÁFICA (COMPACTA Y ADAPTABLE) */}
      <div className="bg-white border border-[#E7EAF0] rounded-2xl overflow-hidden shadow-subtle">
        <div className="p-4 border-b border-[#E7EAF0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#F36B35]" />
            <h2 className="text-sm font-bold text-[#202938]">
              Área de análisis regional
            </h2>
            <span className="text-xs text-[#687385] hidden sm:inline">
              (~{bboxAreaKm2.toLocaleString()} km²)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={resetBboxToCore}
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#687385] hover:text-[#202938] hover:bg-[#F7F8FA] border border-[#E7EAF0] transition flex items-center gap-1"
              title="Restablecer a la región núcleo"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restablecer región</span>
            </button>

            {/* Botón para expandir/colapsar mapa en móviles */}
            <button
              onClick={() => setIsMapExpandedMobile(!isMapExpandedMobile)}
              className="sm:hidden px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#FDF2EC] text-[#F36B35] border border-[#F36B35]/20 flex items-center gap-1"
            >
              <span>{isMapExpandedMobile ? 'Contraer' : 'Ampliar mapa'}</span>
              {isMapExpandedMobile ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* CONTENEDOR DEL MAPA (Responsive: oculto o visible en móvil según toggle, siempre visible en desktop) */}
        <div
          className={`relative w-full transition-all duration-300 bg-[#F1F5F9] ${
            isMapExpandedMobile ? 'h-64' : 'hidden sm:block sm:h-56'
          }`}
        >
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

          {/* Selector de capa Calle / Satélite */}
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center bg-white/95 backdrop-blur-md p-1 rounded-xl border border-[#E7EAF0] shadow-sm">
            <button
              onClick={() => switchBasemap('streets')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                activeBasemap === 'streets'
                  ? 'bg-[#F36B35] text-white shadow-sm'
                  : 'text-[#687385] hover:text-[#202938]'
              }`}
            >
              Calle
            </button>
            <button
              onClick={() => switchBasemap('satellite')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                activeBasemap === 'satellite'
                  ? 'bg-[#F36B35] text-white shadow-sm'
                  : 'text-[#687385] hover:text-[#202938]'
              }`}
            >
              Satélite
            </button>
          </div>

          {/* Atribución obligatoria */}
          <div className="absolute bottom-1 right-2 z-10 text-[9px] text-[#687385] bg-white/90 px-2 py-0.5 rounded font-mono shadow-sm">
            {activeBasemap === 'satellite' ? ESRI_ATTRIBUTION : OSM_ATTRIBUTION}
          </div>
        </div>
      </div>

      {/* 3. FILTROS SIMPLIFICADOS */}
      <div className="bg-white border border-[#E7EAF0] rounded-2xl p-4 sm:p-5 shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* FILTRO DE SENSOR */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#687385] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#F36B35]" />
            <span>Sensor satelital</span>
          </label>
          <div className="flex bg-[#F7F8FA] p-1 rounded-xl border border-[#E7EAF0]">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'viirs', label: 'VIIRS (375m)' },
                { id: 'modis', label: 'MODIS (1km)' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setSensor(s.id)}
                className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  sensor === s.id
                    ? 'bg-white text-[#202938] shadow-sm border border-[#E7EAF0]'
                    : 'text-[#687385] hover:text-[#202938]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* SELECTOR DE PERÍODO Y AÑO */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#687385] flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#F36B35]" />
            <span>Período temporal</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-[#F7F8FA] p-1 rounded-xl border border-[#E7EAF0]">
              <button
                onClick={() => setMode('annual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mode === 'annual'
                    ? 'bg-white text-[#202938] shadow-sm border border-[#E7EAF0]'
                    : 'text-[#687385] hover:text-[#202938]'
                }`}
              >
                Año individual
              </button>
              <button
                onClick={() => setMode('interval')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mode === 'interval'
                    ? 'bg-white text-[#202938] shadow-sm border border-[#E7EAF0]'
                    : 'text-[#687385] hover:text-[#202938]'
                }`}
              >
                Intervalo
              </button>
            </div>

            {mode === 'annual' ? (
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Seleccionar año"
                className="bg-[#F7F8FA] border border-[#E7EAF0] rounded-xl px-3 py-1.5 text-xs text-[#202938] font-bold focus:border-[#F36B35] outline-none"
              >
                {Array.from({ length: 27 }, (_, i) => 2026 - i).map((yr) => (
                  <option key={yr} value={yr}>
                    Año {yr} {yr === 2026 ? '(Parcial)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <select
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(Number(e.target.value))}
                  aria-label="Año desde"
                  className="bg-[#F7F8FA] border border-[#E7EAF0] rounded-xl px-2.5 py-1.5 text-[#202938] font-bold"
                >
                  {Array.from({ length: 27 }, (_, i) => 2000 + i).map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
                <span className="text-[#687385]">a</span>
                <select
                  value={rangeTo}
                  onChange={(e) => setRangeTo(Number(e.target.value))}
                  aria-label="Año hasta"
                  className="bg-[#F7F8FA] border border-[#E7EAF0] rounded-xl px-2.5 py-1.5 text-[#202938] font-bold"
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
      </div>

      {/* 4. ESTADÍSTICAS EN TARJETAS LIMPIAS */}
      {isLoading ? (
        <div className="bg-white border border-[#E7EAF0] rounded-2xl p-10 text-center text-[#687385] text-xs flex flex-col items-center justify-center gap-3 shadow-subtle">
          <span className="w-4 h-4 rounded-full bg-[#F36B35] animate-ping" />
          <p className="font-medium">Cargando serie climatológica real para el área...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-[#DC4545]">
          <p className="text-sm font-semibold">{error}</p>
          <button
            onClick={loadData}
            className="mt-3 px-4 py-2 rounded-xl bg-[#DC4545] text-white text-xs font-semibold hover:bg-[#DC4545]/90 transition"
          >
            Reintentar consulta
          </button>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-[#E7EAF0] rounded-2xl p-4 shadow-subtle">
              <span className="text-xs font-medium text-[#687385]">Detecciones en área</span>
              <div className="text-2xl font-black text-[#202938] mt-1">
                {Math.round(data.kpis.total_harmonized_eq).toLocaleString()}
              </div>
              <p className="text-[11px] text-[#687385] mt-0.5">
                {data.kpis.total_viirs_count.toLocaleString()} VIIRS + {data.kpis.total_modis_count.toLocaleString()} MODIS
              </p>
            </div>

            <div className="bg-white border border-[#E7EAF0] rounded-2xl p-4 shadow-subtle">
              <span className="text-xs font-medium text-[#687385]">Potencia radiativa</span>
              <div className="text-2xl font-black text-[#F36B35] mt-1">
                {Math.round(data.kpis.total_frp_mw).toLocaleString()} MW
              </div>
              <p className="text-[11px] text-[#687385] mt-0.5">
                {data.metadata.active_cells_count} celdas evaluadas
              </p>
            </div>

            <div className="bg-white border border-[#E7EAF0] rounded-2xl p-4 shadow-subtle">
              <span className="text-xs font-medium text-[#687385]">Semana S{selectedWeek}</span>
              <div className="text-2xl font-black text-[#202938] mt-1">
                {weekDetail ? Math.round(weekDetail.observed_harmonized) : 0} focos
              </div>
              <p className="text-[11px] text-[#687385] mt-0.5">
                Media histórica: {weekDetail?.baseline_mean} ± {weekDetail?.baseline_std}
              </p>
            </div>

            <div className="bg-white border border-[#E7EAF0] rounded-2xl p-4 shadow-subtle">
              <span className="text-xs font-medium text-[#687385]">Anomalía Z-Score</span>
              <div
                className={`text-2xl font-black mt-1 flex items-center gap-1.5 ${
                  (weekDetail?.z_score || 0) >= 2.0
                    ? 'text-[#DC4545]'
                    : (weekDetail?.z_score || 0) >= 1.0
                    ? 'text-[#F36B35]'
                    : (weekDetail?.z_score || 0) <= -2.0
                    ? 'text-[#3978D5]'
                    : 'text-[#16A36A]'
                }`}
              >
                <span>
                  {weekDetail && weekDetail.z_score >= 0
                    ? `+${weekDetail.z_score.toFixed(2)}`
                    : weekDetail?.z_score.toFixed(2)}{' '}
                  σ
                </span>
              </div>
              <p className="text-[11px] font-medium text-[#687385] mt-0.5">
                {weekDetail?.status || 'Actividad Normal'}
              </p>
            </div>
          </div>

          {/* 5. CURVA DE ENVOLVENTE ESTACIONAL (μ ± 1σ) */}
          <div className="bg-white border border-[#E7EAF0] rounded-2xl p-5 space-y-4 shadow-subtle">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#202938]">
                  Curva de Expectativa Estacional Climatológica (52 Semanas ISO)
                </h3>
                <p className="text-xs text-[#687385]">
                  Línea base empírica μ con banda de variabilidad (μ ± 1σ) sobre 26 años.
                </p>
              </div>
              <span className="text-xs font-medium text-[#F36B35] bg-[#FDF2EC] px-3 py-1 rounded-xl self-start sm:self-auto border border-[#F36B35]/20">
                Pico estacional: Semanas 31 a 43 (Ago – Oct)
              </span>
            </div>

            <div className="h-44 w-full relative pt-2">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 520 120" preserveAspectRatio="none">
                <line x1="0" y1="110" x2="520" y2="110" stroke="#E7EAF0" strokeWidth="1" />
                <line x1="0" y1="60" x2="520" y2="60" stroke="#E7EAF0" strokeDasharray="3 3" strokeWidth="1" />
                <line x1="0" y1="10" x2="520" y2="10" stroke="#E7EAF0" strokeDasharray="3 3" strokeWidth="1" />

                {(() => {
                  const maxObs = Math.max(
                    1,
                    ...data.weeks.map((w) => Math.max(w.upper_band, w.observed_harmonized))
                  );
                  const scaleY = (val: number) => 110 - (val / maxObs) * 100;

                  const upperPoints = data.weeks.map((w, idx) => `${idx * 10},${scaleY(w.upper_band)}`);
                  const lowerPoints = data.weeks.map((w, idx) => `${idx * 10},${scaleY(w.lower_band)}`).reverse();
                  const bandPath = `M ${upperPoints.join(' L ')} L ${lowerPoints.join(' L ')} Z`;

                  const meanPath = data.weeks
                    .map((w, idx) => `${idx === 0 ? 'M' : 'L'} ${idx * 10} ${scaleY(w.baseline_mean)}`)
                    .join(' ');

                  const obsPath = data.weeks
                    .filter((w) => !w.pending)
                    .map((w, idx) => `${idx === 0 ? 'M' : 'L'} ${idx * 10} ${scaleY(w.observed_harmonized)}`)
                    .join(' ');

                  return (
                    <>
                      <path d={bandPath} fill="#F36B35" fillOpacity="0.12" />
                      <path d={meanPath} fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeDasharray="4 2" />
                      <path d={obsPath} fill="none" stroke="#F36B35" strokeWidth="2.5" />

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
                              fill={isExtreme ? '#DC4545' : isSel ? '#202938' : '#F36B35'}
                              stroke={isExtreme || isSel ? '#FFFFFF' : 'none'}
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

              <div className="flex justify-between text-[10px] text-[#687385] mt-1.5 px-1 font-mono">
                <span>S1 (Ene)</span>
                <span>S13 (Abr)</span>
                <span>S26 (Jul)</span>
                <span className="text-[#F36B35] font-bold">S39 (Oct - Pico)</span>
                <span>S52 (Dic)</span>
              </div>
            </div>
          </div>

          {/* 6. HEATMAP MULTIANUAL 52 SEMANAS x 27 AÑOS */}
          <div className="bg-white border border-[#E7EAF0] rounded-2xl p-5 space-y-4 shadow-subtle">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#202938]">
                  Matriz Histórica de Actividad (52 Semanas x Años 2000–2026)
                </h3>
                <p className="text-xs text-[#687385]">
                  Toca una celda para ver foco, Z-Score y potencia radiativa.
                </p>
              </div>

              {/* LEYENDA CLARA */}
              <div className="flex items-center gap-3 text-[11px] font-medium text-[#687385] flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#F1F5F9] border border-[#E7EAF0]" /> Normal
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#FED7AA]" /> Media
                </span>
                <span className="flex items-center gap-1.5 text-[#F36B35]">
                  <span className="w-3 h-3 rounded bg-[#FB923C]" /> Alta
                </span>
                <span className="flex items-center gap-1.5 text-[#DC4545] font-bold">
                  <span className="w-3 h-3 rounded bg-[#DC4545]" /> Extrema (|Z|≥2)
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-3 h-3 rounded bg-slate-100 border border-dashed border-slate-300" /> Futura
                </span>
              </div>
            </div>

            {/* TABLA HEATMAP CON SCROLL HORIZONTAL */}
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[840px] space-y-1">
                <div className="flex items-center text-[10px] text-[#687385] pb-1 font-mono">
                  <div className="w-14 text-center font-bold">AÑO</div>
                  {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                    <div
                      key={w}
                      className={`flex-1 text-center ${
                        w === selectedWeek ? 'text-[#F36B35] font-black' : ''
                      }`}
                    >
                      {w % 4 === 1 ? `S${w}` : '·'}
                    </div>
                  ))}
                </div>

                {data.heatmap?.map((hmRow) => {
                  const isCurrentSelectedYear = hmRow.year === year;
                  return (
                    <div
                      key={hmRow.year}
                      className={`flex items-center rounded-lg transition-colors py-0.5 ${
                        isCurrentSelectedYear
                          ? 'bg-[#FDF2EC] ring-1 ring-[#F36B35]/40'
                          : 'hover:bg-[#F7F8FA]'
                      }`}
                    >
                      <button
                        onClick={() => setYear(hmRow.year)}
                        className={`w-14 text-left font-mono text-xs font-bold px-1 transition ${
                          isCurrentSelectedYear ? 'text-[#F36B35]' : 'text-[#687385] hover:text-[#202938]'
                        }`}
                      >
                        {hmRow.year} {hmRow.is_partial ? '*' : ''}
                      </button>

                      {hmRow.weeks.map((cell) => {
                        const isPending = cell.pending;
                        const isSelectedCell = hmRow.year === year && cell.week === selectedWeek;
                        const isHighZ = cell.z_score >= 2.0;

                        let bgClass = 'bg-[#F1F5F9] border-[#E7EAF0]';
                        if (isPending) {
                          bgClass = 'bg-slate-50 border-dashed border-slate-200';
                        } else if (isHighZ) {
                          bgClass = 'bg-[#DC4545] border-[#DC4545] text-white';
                        } else if (cell.z_score >= 1.0) {
                          bgClass = 'bg-[#FB923C] border-[#FB923C] text-white';
                        } else if (cell.count > 0) {
                          bgClass = 'bg-[#FED7AA] border-[#FDBA74]';
                        }

                        return (
                          <button
                            key={cell.week}
                            type="button"
                            onClick={() => {
                              if (!isPending) {
                                setYear(hmRow.year);
                                setSelectedWeek(cell.week);
                                setActiveCellDetail(cell);
                              }
                            }}
                            className={`flex-1 h-5 mx-0.5 rounded cursor-pointer border transition-transform hover:scale-125 focus:outline-none ${bgClass} ${
                              isSelectedCell ? 'ring-2 ring-[#202938] z-10' : ''
                            }`}
                            title={`Año ${cell.year} - S${cell.week}: ${
                              cell.count >= 0 ? `${cell.count} focos` : 'Semana futura'
                            }`}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* DETALLE TÁCTIL DE LA SEMANA SELECCIONADA */}
            {activeCellDetail && (
              <div className="bg-[#F7F8FA] border border-[#E7EAF0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white border border-[#E7EAF0] text-[#F36B35]">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#202938]">
                      Año {activeCellDetail.year} • Semana {activeCellDetail.week}
                    </div>
                    <div className="text-xs text-[#687385] mt-0.5">
                      {activeCellDetail.count} detecciones registradas • {activeCellDetail.frp_mw} MW potencia
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div>
                    <span className="text-[#687385] block">Anomalía Z-Score</span>
                    <b
                      className={
                        activeCellDetail.z_score >= 2.0
                          ? 'text-[#DC4545]'
                          : activeCellDetail.z_score >= 1.0
                          ? 'text-[#F36B35]'
                          : 'text-[#16A36A]'
                      }
                    >
                      {activeCellDetail.z_score >= 0
                        ? `+${activeCellDetail.z_score.toFixed(2)}`
                        : activeCellDetail.z_score.toFixed(2)}{' '}
                      σ
                    </b>
                  </div>
                  <div>
                    <span className="text-[#687385] block">Aporte sensores</span>
                    <span className="text-[#202938]">
                      <b>{activeCellDetail.viirs}</b> VIIRS / <b>{activeCellDetail.modis}</b> MODIS
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveCellDetail(null)}
                    className="text-xs text-[#687385] hover:text-[#202938] px-2 py-1 rounded-lg border border-[#E7EAF0] bg-white"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
