import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type {
  EvaluatedRouteOption,
  FireFrontEvent,
  SafeShelter,
  ThermalDetectionPoint,
} from '../../types/semf';

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
  defaultBasemap?: 'satellite' | 'dark' | 'streets';
}

export const TacticalMapCanvas: React.FC<TacticalMapCanvasProps> = ({
  events,
  points = [],
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
  const [activeBasemap, setActiveBasemap] = useState<'satellite' | 'dark' | 'streets'>(defaultBasemap);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Fuentes 100% Libres y Públicas (Zero API Key)
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          esriSatellite: {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: '&copy; ESRI & NASA World Imagery',
          },
          esriDark: {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: '&copy; ESRI Dark Canvas',
          },
          osmStreets: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'basemap-satellite',
            type: 'raster',
            source: 'esriSatellite',
            layout: { visibility: defaultBasemap === 'satellite' ? 'visible' : 'none' },
          },
          {
            id: 'basemap-dark',
            type: 'raster',
            source: 'esriDark',
            layout: { visibility: defaultBasemap === 'dark' ? 'visible' : 'none' },
          },
          {
            id: 'basemap-streets',
            type: 'raster',
            source: 'osmStreets',
            layout: { visibility: defaultBasemap === 'streets' ? 'visible' : 'none' },
          },
        ],
      },
      center: [-65.45, -32.35],
      zoom: 7.4,
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

  // Conmutador interactivo de capas base libres (Zero API Key)
  const switchBasemap = (type: 'satellite' | 'dark' | 'streets') => {
    setActiveBasemap(type);
    const map = mapRef.current;
    if (!map) return;
    map.setLayoutProperty('basemap-satellite', 'visibility', type === 'satellite' ? 'visible' : 'none');
    map.setLayoutProperty('basemap-dark', 'visibility', type === 'dark' ? 'visible' : 'none');
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
    <div className={`relative w-full ${heightClass} bg-[#18181B] rounded-3xl overflow-hidden border border-[#333338] shadow-2xl`}>
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* SELECTOR EN CÁPSULA DE CAPA BASE (ZERO API KEY) */}
      <div className="absolute top-3 right-3 z-20 flex items-center bg-[#252525]/90 backdrop-blur-md p-1 rounded-full border border-[#38383E] shadow-lg">
        <button
          onClick={() => switchBasemap('satellite')}
          className={`px-3 py-1 rounded-full text-[11px] font-semibold transition ${
            activeBasemap === 'satellite'
              ? 'bg-[#FF6117] text-white shadow-md'
              : 'text-[#EAEAEA] hover:text-white'
          }`}
        >
          🛰️ Satélite
        </button>
        <button
          onClick={() => switchBasemap('dark')}
          className={`px-3 py-1 rounded-full text-[11px] font-semibold transition ${
            activeBasemap === 'dark'
              ? 'bg-[#FF6117] text-white shadow-md'
              : 'text-[#EAEAEA] hover:text-white'
          }`}
        >
          🌑 Oscuro
        </button>
        <button
          onClick={() => switchBasemap('streets')}
          className={`px-3 py-1 rounded-full text-[11px] font-semibold transition ${
            activeBasemap === 'streets'
              ? 'bg-[#FF6117] text-white shadow-md'
              : 'text-[#EAEAEA] hover:text-white'
          }`}
        >
          🗺️ Calles
        </button>
      </div>

      {/* LEYENDA TÁCTICA FLOTANTE EN CÁPSULA MODERNA */}
      <div className="absolute bottom-3 left-3 z-10 bg-[#252525]/95 backdrop-blur-md border border-[#38383E] rounded-2xl px-4 py-2.5 text-[11px] font-mono shadow-xl space-y-1">
        <div className="text-[#EAEAEA] font-bold uppercase text-[10px] tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#FF6117] animate-ping" />
          Telemetría Espacial y Vial Activa
        </div>
        <div className="flex items-center gap-3.5 flex-wrap">
          <span className="flex items-center gap-1 text-[#FF6117] font-semibold">
            ● VIIRS 375m ({points.filter((p) => p.sensor_family === 'VIIRS').length})
          </span>
          <span className="flex items-center gap-1 text-red-400 font-semibold">
            ● MODIS 1km ({points.filter((p) => p.sensor_family === 'MODIS').length})
          </span>
          <span className="flex items-center gap-1 text-amber-300 font-semibold">
            ▲ Frentes ({events.length})
          </span>
          {shelters.length > 0 && (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              ■ Refugios ({shelters.length})
            </span>
          )}
          {routes.length > 0 && (
            <span className="flex items-center gap-1 text-cyan-300 font-semibold">
              ━ Rutas ({routes.length})
            </span>
          )}
          {conservativeCorridor && (
            <span className="flex items-center gap-1 text-orange-300 font-semibold">
              ⇢ Escape Flanco
            </span>
          )}
        </div>
      </div>

      {/* SELECTOR RÁPIDO DE FRENTES EN PÍLDORAS REDONDEADAS */}
      {events.length > 0 && onSelectEvent && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 overflow-x-auto pb-1 max-w-[calc(100%-250px)]">
          {events.slice(0, 5).map((ev) => {
            const isSel = ev.event_id === selectedEventId;
            return (
              <button
                key={ev.event_id}
                onClick={() => onSelectEvent(ev)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-mono font-semibold whitespace-nowrap border transition shadow-md ${
                  isSel
                    ? 'bg-[#FF6117] text-white border-[#FF6117]'
                    : 'bg-[#252525]/90 text-[#EAEAEA] border-[#38383E] hover:border-[#FF6117]/60'
                }`}
              >
                {ev.event_id} • {ev.frp_peak_mw} MW
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
