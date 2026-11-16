import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Crosshair, Locate } from 'lucide-react';
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

/**
 * Genera un polígono GeoJSON circular para el radio de precisión del GPS
 * sin dependencias externas pesadas o problemas de tipado de módulo.
 */
function createGeoJsonCircle(
  centerLon: number,
  centerLat: number,
  radiusMeters: number,
  points = 32
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const km = radiusMeters / 1000;
  const distanceX = km / (111.32 * Math.cos((centerLat * Math.PI) / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([centerLon + x, centerLat + y]);
  }
  coords.push(coords[0]); // cerrar polígono

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
    properties: {},
  };
}

interface TacticalMapCanvasProps {
  events: FireFrontEvent[];
  points?: ThermalDetectionPoint[];
  shelters?: SafeShelter[];
  routes?: EvaluatedRouteOption[];
  conservativeCorridor?: [number, number][] | null;
  userOrigin?: { lat: number; lon: number } | null;
  userAccuracyMeters?: number | null;
  isRealGps?: boolean;
  selectedEventId?: string | null;
  onSelectEvent?: (ev: FireFrontEvent) => void;
  onMapClickCoordinates?: (lat: number, lon: number) => void;
  onRequestUserGps?: () => void;
  heightClass?: string;
  defaultBasemap?: BasemapMode;
}

export const TacticalMapCanvas: React.FC<TacticalMapCanvasProps> = ({
  events,
  shelters = [],
  routes = [],
  conservativeCorridor = null,
  userOrigin = null,
  userAccuracyMeters = null,
  isRealGps = false,
  selectedEventId = null,
  onSelectEvent,
  onMapClickCoordinates,
  onRequestUserGps,
  heightClass = 'h-full',
  defaultBasemap = 'streets',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const fireMarkersRef = useRef<maplibregl.Marker[]>([]);
  const shelterMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hasAutoCenteredRef = useRef<boolean>(false);
  const [activeBasemap, setActiveBasemap] = useState<BasemapMode>(defaultBasemap);

  // Inicializar mapa MapLibre
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createMapLibreStyle(defaultBasemap),
      center: [-65.1, -32.3],
      zoom: 7.8,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

    map.on('click', (e) => {
      if (onMapClickCoordinates) {
        onMapClickCoordinates(
          Number(e.lngLat.lat.toFixed(5)),
          Number(e.lngLat.lng.toFixed(5))
        );
      }
    });

    map.on('load', () => {
      // 1. Fuente y capas para el Círculo de Precisión GPS del Usuario
      map.addSource('user-accuracy-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      map.addLayer({
        id: 'user-accuracy-fill',
        type: 'fill',
        source: 'user-accuracy-source',
        paint: {
          'fill-color': '#3978D5',
          'fill-opacity': 0.12,
        },
      });

      map.addLayer({
        id: 'user-accuracy-stroke',
        type: 'line',
        source: 'user-accuracy-source',
        paint: {
          'line-color': '#3978D5',
          'line-width': 1.5,
          'line-opacity': 0.45,
        },
      });

      // 2. Fuente y capa para Rutas de Evacuación GeoJSON
      map.addSource('evacuation-routes-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      // Halo de contraste para rutas
      map.addLayer({
        id: 'routes-halo-layer',
        type: 'line',
        source: 'evacuation-routes-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 8,
          'line-opacity': 0.85,
        },
      });

      // Línea principal de ruta coloreada según seguridad
      map.addLayer({
        id: 'routes-line-layer',
        type: 'line',
        source: 'evacuation-routes-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'lineWidth'],
          'line-opacity': 0.95,
        },
      });

      // 3. Fuente y capa para Corredor Conservador de Flanco
      map.addSource('corridor-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      map.addLayer({
        id: 'corridor-line-layer',
        type: 'line',
        source: 'corridor-source',
        paint: {
          'line-color': '#F36B35',
          'line-width': 4,
          'line-dasharray': [3, 2],
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onMapClickCoordinates, defaultBasemap]);

  // Actualizar ubicación del usuario y círculo de precisión
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userOrigin) {
      if (!userMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'relative flex items-center justify-center cursor-pointer';
        el.innerHTML = `
          <div class="w-7 h-7 rounded-full bg-[#3978D5]/25 animate-ping absolute"></div>
          <div class="w-5 h-5 rounded-full bg-[#3978D5] border-2 border-white shadow-md flex items-center justify-center text-white text-[9px] font-bold">
            📍
          </div>
        `;
        userMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([userOrigin.lon, userOrigin.lat])
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat([userOrigin.lon, userOrigin.lat]);
      }

      // Actualizar círculo de precisión si está disponible la capa
      const accSrc = map.getSource('user-accuracy-source') as maplibregl.GeoJSONSource | undefined;
      if (accSrc) {
        const accuracyMeters = userAccuracyMeters ? Math.max(userAccuracyMeters, 30) : 50;
        try {
          const circleFeature = createGeoJsonCircle(userOrigin.lon, userOrigin.lat, accuracyMeters, 32);
          accSrc.setData(circleFeature);
        } catch (e) {
          console.warn('[SeMF] Error generando círculo de precisión:', e);
        }
      }

      // Auto-centrar suavemente la primera vez que se detecta GPS real
      if (isRealGps && !hasAutoCenteredRef.current) {
        hasAutoCenteredRef.current = true;
        map.flyTo({
          center: [userOrigin.lon, userOrigin.lat],
          zoom: 12.5,
          duration: 1000,
        });
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, [userOrigin, userAccuracyMeters, isRealGps]);

  // Centrar manualmente en la ubicación del usuario
  const centerOnUser = () => {
    const map = mapRef.current;
    if (!map || !userOrigin) {
      if (onRequestUserGps) onRequestUserGps();
      return;
    }
    map.flyTo({
      center: [userOrigin.lon, userOrigin.lat],
      zoom: 13,
      duration: 800,
    });
  };

  // Actualizar marcadores de frentes de incendio
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    fireMarkersRef.current.forEach((m) => m.remove());
    fireMarkersRef.current = [];

    events.forEach((ev) => {
      const isSelected = ev.event_id === selectedEventId;
      const el = document.createElement('div');
      el.className = 'cursor-pointer transition-transform hover:scale-125';
      el.innerHTML = `
        <div class="px-2 py-1 rounded-full text-white text-[10px] font-bold shadow-md flex items-center gap-1 ${
          isSelected
            ? 'bg-[#DC4545] border-2 border-white ring-2 ring-[#DC4545]'
            : 'bg-[#F36B35] border border-white'
        }">
          <span>🔥</span>
          <span>${Math.round(ev.frp_peak_mw)} MW</span>
        </div>
      `;

      el.addEventListener('click', () => {
        if (onSelectEvent) onSelectEvent(ev);
      });

      const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
        <div style="font-family: sans-serif; padding: 4px; font-size: 12px; color: #202938;">
          <div style="font-weight: bold; margin-bottom: 2px;">${ev.location_name}</div>
          <div style="color: #687385; font-size: 11px;">Frente ${ev.event_id} • ${ev.province}</div>
          <div style="margin-top: 4px; display: flex; gap: 8px;">
            <span>Potencia: <b>${Math.round(ev.frp_peak_mw)} MW</b></span>
            <span>Velocidad: <b>${ev.projected_speed_kmh} km/h</b></span>
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([ev.centroid_lon, ev.centroid_lat])
        .setPopup(popup)
        .addTo(map);

      fireMarkersRef.current.push(marker);
    });
  }, [events, selectedEventId, onSelectEvent]);

  // Actualizar marcadores de refugios
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    shelterMarkersRef.current.forEach((m) => m.remove());
    shelterMarkersRef.current = [];

    shelters.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'cursor-pointer transition-transform hover:scale-125';
      el.innerHTML = `
        <div class="w-6 h-6 rounded-lg bg-[#16A36A] border-2 border-white shadow-sm flex items-center justify-center text-white text-xs">
          🛡️
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
        <div style="font-family: sans-serif; padding: 4px; font-size: 12px; color: #202938;">
          <div style="font-weight: bold;">${s.name}</div>
          <div style="color: #687385; font-size: 11px;">${s.locality}, ${s.province}</div>
          <div style="margin-top: 4px; color: #16A36A; font-weight: 600;">
            Capacidad: ${s.capacity_persons} personas
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([s.lon, s.lat])
        .setPopup(popup)
        .addTo(map);

      shelterMarkersRef.current.push(marker);
    });
  }, [shelters]);

  // Actualizar geometrías de Rutas de Evacuación GeoJSON
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource('evacuation-routes-source') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const features = routes.map((r, idx) => {
      let color = '#3978D5'; // Azul por defecto
      if (r.safety_status === 'SAFE' || r.is_recommended) {
        color = '#16A36A'; // Verde seguro
      } else if (r.safety_status === 'WARNING') {
        color = '#E5A000'; // Amarillo precaución
      } else if (r.safety_status === 'BLOCKED') {
        color = '#DC4545'; // Rojo bloqueado
      }

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: r.coordinates.map(([lat, lon]: [number, number]) => [lon, lat]),
        },
        properties: {
          route_id: r.route_id,
          color,
          lineWidth: r.is_recommended ? 6 : 4,
          isRecommended: r.is_recommended,
          zIndex: r.is_recommended ? 10 : idx,
        },
      };
    });

    source.setData({
      type: 'FeatureCollection',
      features,
    });

    // Si hay rutas, enfocar el mapa sobre la ruta recomendada o primera
    if (routes.length > 0 && routes[0].coordinates.length > 0) {
      const coords = routes[0].coordinates;
      const bounds = new maplibregl.LngLatBounds();
      coords.forEach(([lat, lon]: [number, number]) => bounds.extend([lon, lat]));
      if (userOrigin) bounds.extend([userOrigin.lon, userOrigin.lat]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 1000 });
    }
  }, [routes, userOrigin]);

  // Actualizar Corredor Conservador de Flanco
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource('corridor-source') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (conservativeCorridor && conservativeCorridor.length > 0) {
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: conservativeCorridor.map(([lat, lon]) => [lon, lat]),
            },
            properties: {},
          },
        ],
      });
    } else {
      src.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  }, [conservativeCorridor]);

  // Conmutador interactivo de capas base libres
  const switchBasemap = (type: BasemapMode) => {
    setActiveBasemap(type);
    const map = mapRef.current;
    if (!map) return;
    map.setLayoutProperty('basemap-satellite', 'visibility', type === 'satellite' ? 'visible' : 'none');
    map.setLayoutProperty('basemap-streets', 'visibility', type === 'streets' ? 'visible' : 'none');
  };

  return (
    <div className={`relative w-full ${heightClass} bg-[#F1F5F9] overflow-hidden`}>
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* BOTONES FLOTANTES SUPERIORES (Capas y Centrar Mi Ubicación) */}
      <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
        {/* Selector Calle / Satélite */}
        <div
          className="flex items-center bg-white/95 backdrop-blur-md p-1 rounded-xl border border-[#E7EAF0] shadow-sm"
          role="group"
          aria-label="Selector de mapa base"
        >
          <button
            onClick={() => switchBasemap('streets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeBasemap === 'streets'
                ? 'bg-[#F36B35] text-white shadow-sm'
                : 'text-[#687385] hover:text-[#202938]'
            }`}
          >
            Calle
          </button>
          <button
            onClick={() => switchBasemap('satellite')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeBasemap === 'satellite'
                ? 'bg-[#F36B35] text-white shadow-sm'
                : 'text-[#687385] hover:text-[#202938]'
            }`}
          >
            Satélite
          </button>
        </div>

        {/* Botón flotante para centrar mapa en la ubicación del usuario */}
        <button
          onClick={centerOnUser}
          aria-label="Centrar en mi ubicación"
          className="p-2.5 rounded-xl bg-white text-[#202938] hover:text-[#3978D5] border border-[#E7EAF0] shadow-sm transition flex items-center justify-center group"
          title="Centrar mapa en mi ubicación"
        >
          <Crosshair className="w-5 h-5 group-hover:scale-110 transition-transform text-[#3978D5]" />
        </button>

        {/* Botón flotante para re-solicitar GPS si está denegado o apagado */}
        {onRequestUserGps && !isRealGps && (
          <button
            onClick={onRequestUserGps}
            aria-label="Activar ubicación GPS"
            className="p-2.5 rounded-xl bg-[#FDF2EC] text-[#F36B35] border border-[#F36B35]/30 shadow-sm transition flex items-center justify-center"
            title="Activar detección GPS"
          >
            <Locate className="w-5 h-5 animate-pulse" />
          </button>
        )}
      </div>

      {/* LEYENDA Y ATRIBUCIÓN INFERIOR */}
      <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-md border border-[#E7EAF0] rounded-xl px-3 py-1.5 text-[11px] text-[#687385] shadow-sm flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#3978D5]" />
          <b>{isRealGps ? 'GPS Activo' : 'Ubicación Manual'}</b>
        </span>
        <span>•</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#F36B35]" />
          <b>{events.length}</b> focos
        </span>
        <span>•</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#16A36A]" />
          <b>{shelters.length}</b> refugios
        </span>
        <span className="hidden sm:inline">•</span>
        <span className="hidden sm:inline text-[10px]">
          {activeBasemap === 'satellite' ? ESRI_ATTRIBUTION : OSM_ATTRIBUTION}
        </span>
      </div>
    </div>
  );
};
