import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type {
  EvaluatedRouteOption,
  FireFrontEvent,
  SafeShelter,
  ThermalDetectionPoint,
} from '../../types/semf';
import {
  BasemapMode,
  createMapLibreStyle,
  ESRI_ATTRIBUTION,
  OSM_ATTRIBUTION,
} from '../../map/mapStyle';

interface TacticalMapCanvasProps {
  events: FireFrontEvent[];
  points?: ThermalDetectionPoint[];
  shelters?: SafeShelter[];
  routes?: EvaluatedRouteOption[];
  conservativeCorridor?: [number, number][] | null;
  userOrigin?: { lat: number; lon: number } | null;
  selectedEventId?: string | null;
  onSelectEvent?: (ev: FireFrontEvent) => void;
  onMapClickCoordinates?: (lat: number, lon: number) => void;
  heightClass?: string;
  defaultBasemap?: BasemapMode;
}

export const TacticalMapCanvas: React.FC<TacticalMapCanvasProps> = ({
  events,
  points: _points = [],
  shelters = [],
  routes = [],
  conservativeCorridor = null,
  userOrigin = null,
  selectedEventId = null,
  onSelectEvent,
  onMapClickCoordinates,
  heightClass = 'h-full',
  defaultBasemap = 'satellite',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [activeBasemap, setActiveBasemap] = useState<BasemapMode>(defaultBasemap);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Fuentes 100% Libres y Públicas (Zero API Key)
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createMapLibreStyle(defaultBasemap),
      center: [-65.45, -32.35],
      zoom: 7.4,
      attributionControl: false, // Control manual estilizado abajo
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.on('click', (e) => {
      if (onMapClickCoordinates) {
        onMapClickCoordinates(
          Number(e.lngLat.lat.toFixed(5)),
          Number(e.lngLat.lng.toFixed(5))
        );
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onMapClickCoordinates, defaultBasemap]);

  // Marcador de ubicación del usuario
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userOrigin) {
      if (!userMarkerRef.current) {
        const el = document.createElement('div');
        el.className =
          'w-5 h-5 rounded-full bg-cyan-400 border-2 border-white shadow-lg shadow-cyan-400/50 animate-pulse';
        userMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([userOrigin.lon, userOrigin.lat])
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat([userOrigin.lon, userOrigin.lat]);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, [userOrigin]);

  // Conmutador interactivo de capas base libres (Zero API Key)
  const switchBasemap = (type: BasemapMode) => {
    setActiveBasemap(type);
    const map = mapRef.current;
    if (!map) return;
    map.setLayoutProperty('basemap-satellite', 'visibility', type === 'satellite' ? 'visible' : 'none');
    map.setLayoutProperty('basemap-streets', 'visibility', type === 'streets' ? 'visible' : 'none');
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedEventId) return;
    const found = events.find((e) => e.event_id === selectedEventId);
    if (found) {
      map.flyTo({
        center: [found.centroid_lon, found.centroid_lat],
        zoom: 11.2,
        duration: 900,
      });
    }
  }, [selectedEventId, events]);

  return (
    <div className={`relative w-full ${heightClass} bg-[#10121A] rounded-2xl overflow-hidden border border-[#252A36] shadow-xl`}>
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* CONMUTADOR CALLE / SATÉLITE (ZERO API KEY) */}
      <div
        className="absolute top-3 right-3 z-20 flex items-center bg-[#161922]/90 backdrop-blur-md p-1 rounded-xl border border-[#2B3242] shadow-lg"
        role="group"
        aria-label="Selector de mapa base"
      >
        <button
          onClick={() => switchBasemap('streets')}
          aria-pressed={activeBasemap === 'streets'}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
            activeBasemap === 'streets'
              ? 'bg-[#FF6117] text-white shadow-md'
              : 'text-[#9BA3AF] hover:text-white'
          }`}
        >
          🗺️ Calle
        </button>
        <button
          onClick={() => switchBasemap('satellite')}
          aria-pressed={activeBasemap === 'satellite'}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
            activeBasemap === 'satellite'
              ? 'bg-[#FF6117] text-white shadow-md'
              : 'text-[#9BA3AF] hover:text-white'
          }`}
        >
          🛰️ Satélite
        </button>
      </div>

      {/* LEYENDA TÁCTICA Y ATRIBUCIÓN SIEMPRE VISIBLE */}
      <div className="absolute bottom-3 left-3 z-10 bg-[#161922]/95 backdrop-blur-md border border-[#2B3242] rounded-xl px-3.5 py-2 text-[11px] font-mono shadow-xl space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#FF6117] animate-ping" />
          <span className="text-white font-bold">Frentes activos: {events.length}</span>
          <span className="text-slate-500">•</span>
          <span className="text-emerald-400">Refugios: {shelters.length}</span>
          {routes.length > 0 && (
            <>
              <span className="text-slate-500">•</span>
              <span className="text-cyan-400">Rutas: {routes.length}</span>
            </>
          )}
          {conservativeCorridor && (
            <>
              <span className="text-slate-500">•</span>
              <span className="text-orange-400">Escape de flanco activo</span>
            </>
          )}
        </div>
        <div className="text-[10px] text-[#9BA3AF] pt-0.5 border-t border-[#252A36]">
          Atribución: {activeBasemap === 'satellite' ? ESRI_ATTRIBUTION : OSM_ATTRIBUTION}
        </div>
      </div>

      {/* SELECTOR RÁPIDO DE FRENTES */}
      {events.length > 0 && onSelectEvent && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 overflow-x-auto pb-1 max-w-[calc(100%-240px)]">
          {events.slice(0, 6).map((ev) => {
            const isSel = ev.event_id === selectedEventId;
            return (
              <button
                key={ev.event_id}
                onClick={() => onSelectEvent(ev)}
                aria-label={`Seleccionar frente ${ev.event_id}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold whitespace-nowrap border transition shadow-md ${
                  isSel
                    ? 'bg-[#FF6117] text-white border-[#FF6117]'
                    : 'bg-[#161922]/90 text-[#EAEAEA] border-[#2B3242] hover:border-[#FF6117]/60'
                }`}
              >
                {ev.location_name} • {Math.round(ev.frp_peak_mw)} MW
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
