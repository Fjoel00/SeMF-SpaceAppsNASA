import React, { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
  Navigation, AlertTriangle, ShieldCheck, MapPin, Compass, 
  ExternalLink, Phone, ShieldAlert, ArrowRight, RefreshCw, X, Wind 
} from 'lucide-react';
import { useWakeLock } from '../hooks/useWakeLock';
import { useGeolocation } from '../hooks/useGeolocation';
import { 
  generateFireBuffers, extractAvoidPolygonsCoordinates, 
  findTopCandidateShelters, requestEvacuationRoute, 
  buildExternalNavigationDeepLinks, calculatePerpendicularEscapeBearing 
} from '../services/escapeRoutingService';
import { ShelterCollection, ShelterFeature, EvacuationRoute } from '../types';

interface EscapeViewProps {
  onTriggerSOS?: () => void;
}

export const EscapeView: React.FC<EscapeViewProps> = ({ onTriggerSOS }) => {
  // Keep screen awake during escape navigation
  useWakeLock(true);

  const { location, permissionStatus, requestSinglePosition, setManualLocation } = useGeolocation(true);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [shelters, setShelters] = useState<ShelterFeature[]>([]);
  const [activeFires, setActiveFires] = useState<any[]>([]);
  const [weather, setWeather] = useState<any>(null);
  const [computedRoutes, setComputedRoutes] = useState<EvacuationRoute[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [showManualPickerTip, setShowManualPickerTip] = useState<boolean>(false);
  const [escapeGuide, setEscapeGuide] = useState<any>(null);

  // 1. Fetch Shelters and Fires data
  useEffect(() => {
    fetch('/api/shelters')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ShelterCollection) => {
        if (data?.features) setShelters(data.features);
      })
      .catch((err) => console.error('Error cargando refugios:', err));

    fetch('/api/fires')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.events) setActiveFires(data.events);
        if (data?.weather) setWeather(data.weather);
      })
      .catch((err) => console.error('Error cargando focos activos:', err));
  }, []);

  // 2. Initialize MapLibre GL Map (Dark Style, zero external proprietary tokens needed)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const darkStyle: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: darkStyle,
      center: [location.lon, location.lat],
      zoom: 11,
      pitch: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      // Add source and layer for fire 3km buffer
      map.addSource('fire-buffer-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'fire-buffer-fill',
        type: 'fill',
        source: 'fire-buffer-source',
        paint: {
          'fill-color': '#FF2D55',
          'fill-opacity': 0.22,
        },
      });

      map.addLayer({
        id: 'fire-buffer-stroke',
        type: 'line',
        source: 'fire-buffer-source',
        paint: {
          'line-color': '#FF2D55',
          'line-width': 1.5,
          'line-dasharray': [2, 2],
        },
      });

      // Add source and layer for evacuation routes
      map.addSource('route-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#22D3EE',
          'line-width': 5,
          'line-opacity': 0.9,
        },
      });

      // Click to pick manual location if enabled
      map.on('click', (e) => {
        setManualLocation(e.lngLat.lat, e.lngLat.lng);
        setShowManualPickerTip(false);
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 3. Update User Marker and Fire Buffers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Update User Marker
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'w-6 h-6 rounded-full bg-cyan-400 border-2 border-white shadow-lg flex items-center justify-center animate-pulse';
      const inner = document.createElement('div');
      inner.className = 'w-2 h-2 rounded-full bg-white';
      el.appendChild(inner);

      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([location.lon, location.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([location.lon, location.lat]);
    }

    // Render Fire Buffers
    if (activeFires.length > 0 && map.isStyleLoaded()) {
      const buffers = generateFireBuffers(activeFires, 3.0);
      const source = map.getSource('fire-buffer-source') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(buffers as any);
      }
    }
  }, [location, activeFires]);

  // 4. Render Shelter Markers
  useEffect(() => {
    if (!mapRef.current || shelters.length === 0) return;
    const map = mapRef.current;

    shelters.forEach((shelter) => {
      const [lon, lat] = shelter.geometry.coordinates;
      const el = document.createElement('div');
      el.className = 'w-7 h-7 rounded-lg bg-[#101722] border border-emerald-400 shadow-md flex items-center justify-center cursor-pointer text-emerald-400 text-xs font-bold';
      el.innerHTML = '🛡️';

      const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
        <div style="color: #fff; font-family: sans-serif; font-size: 12px; padding: 4px;">
          <strong style="color: #10B981;">${shelter.properties.name}</strong><br/>
          <span style="color: #94A3B8;">${shelter.properties.locality} • Tel: ${shelter.properties.contact_phone}</span>
        </div>
      `);

      new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(map);
    });
  }, [shelters]);

  // 5. Action: SALIR AHORA (Calculates 2 best evacuation routes avoiding fire buffers)
  const handleSalirAhora = async () => {
    setIsCalculating(true);
    setEscapeGuide(null);

    // Refresh GPS or use cached
    const currentPos = await requestSinglePosition(5000);
    const userCoords: [number, number] = [currentPos.lon, currentPos.lat];

    // Center map on user
    mapRef.current?.flyTo({ center: userCoords, zoom: 12 });

    // Generate 3km buffer polygons
    const fireBuffers = generateFireBuffers(activeFires, 3.0);
    const avoidPolys = extractAvoidPolygonsCoordinates(fireBuffers);

    // Select 2 nearest verified shelters
    const candidates = findTopCandidateShelters(currentPos.lat, currentPos.lon, shelters, 2);

    if (candidates.length === 0) {
      setIsCalculating(false);
      // Activate conservative guide
      const pushAzimuth = weather?.wind_push_azimuth_deg || 45;
      setEscapeGuide(calculatePerpendicularEscapeBearing(pushAzimuth));
      return;
    }

    const routes: EvacuationRoute[] = [];
    for (const shelter of candidates) {
      const r = await requestEvacuationRoute(userCoords, shelter, avoidPolys);
      routes.push(r);
    }

    setComputedRoutes(routes);
    setSelectedRouteIndex(0);
    setIsCalculating(false);

    // Draw primary route on map
    if (routes.length > 0 && mapRef.current) {
      drawRouteOnMap(routes[0]);
    }
  };

  const drawRouteOnMap = (route: EvacuationRoute) => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('route-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: route.coordinates,
            },
            properties: {},
          },
        ],
      });

      // Fit bounds to show route
      const bounds = route.coordinates.reduce(
        (b, coord) => b.extend(coord as [number, number]),
        new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0])
      );
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }
  };

  const activeRoute = computedRoutes[selectedRouteIndex];

  return (
    <div className="relative w-full h-[calc(100vh-60px)] overflow-hidden">
      {/* Fullscreen Map Container */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Floating GPS / Recenter & Manual Pick Button */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => {
            mapRef.current?.flyTo({ center: [location.lon, location.lat], zoom: 13 });
          }}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-cyan-info shadow-lg active:scale-95 transition"
          aria-label="Centrar en mi ubicación"
        >
          <Compass className="w-5 h-5" />
        </button>

        {permissionStatus === 'denied' && (
          <button
            onClick={() => setShowLocationModal(true)}
            className="px-3 py-1.5 rounded-full bg-amber-500/90 text-white font-bold text-[10px] shadow-lg flex items-center gap-1"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>GPS Denegado</span>
          </button>
        )}
      </div>

      {/* Manual Picker Notification */}
      {showManualPickerTip && (
        <div className="absolute top-4 left-16 right-16 z-20 p-2.5 rounded-xl bg-black/85 border border-cyan-info/50 text-cyan-300 text-xs text-center shadow-lg">
          Tocá cualquier punto en el mapa para fijar tu ubicación de salida.
        </div>
      )}

      {/* Primary Action Sheet at Bottom */}
      <div className="absolute bottom-4 left-4 right-4 z-30 max-w-md mx-auto space-y-3">
        {/* If no route calculated yet, prominent SALIR AHORA button */}
        {computedRoutes.length === 0 && !escapeGuide && (
          <div className="glass-panel rounded-2xl p-4 space-y-3 shadow-2xl bg-[#0A0E14]/90 backdrop-blur-xl border-fire/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-fire animate-ping"></span>
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Ruta Segura de Escape
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Evita buffer de fuego 3 km
              </span>
            </div>

            <button
              id="btn-salir-ahora"
              onClick={handleSalirAhora}
              disabled={isCalculating}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-fire to-amber-alert hover:from-fire-dark hover:to-orange-500 text-white font-display font-black text-lg tracking-wide uppercase shadow-fire-glow transition transform active:scale-98 flex items-center justify-center gap-3"
            >
              {isCalculating ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <span>Calculando Escape...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-6 h-6 text-white" />
                  <span>SALIR AHORA</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* If conservative escape guide triggered (no road route available) */}
        {escapeGuide && (
          <div className="glass-panel rounded-2xl p-4 bg-red-950/80 border border-red-500/50 text-white space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
                <span className="font-bold text-xs uppercase tracking-wider">Sin Ruta Vial Despejada</span>
              </div>
              <button
                onClick={() => setEscapeGuide(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cerrar
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-200">
              {escapeGuide.advice}
            </p>

            <div className="pt-1 flex items-center gap-2">
              <button
                onClick={onTriggerSOS}
                className="flex-1 py-3 rounded-xl bg-danger text-white font-bold text-xs uppercase tracking-wider shadow-sos-glow active:scale-95 transition"
              >
                ACTIVAR SOS DE PÁNICO
              </button>
            </div>
          </div>
        )}

        {/* Active Route Details Card */}
        {activeRoute && (
          <div className="glass-panel rounded-2xl p-4 space-y-3 shadow-2xl bg-[#0A0E14]/95 backdrop-blur-xl border-cyan-info/40 animate-slide-up">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div>
                <span className="text-[10px] font-mono text-cyan-info uppercase font-bold tracking-wider">
                  Ruta {selectedRouteIndex + 1} de {computedRoutes.length}
                </span>
                <h3 className="font-bold text-sm text-white truncate max-w-[240px]">
                  {activeRoute.shelterName}
                </h3>
              </div>
              <button
                onClick={() => {
                  setComputedRoutes([]);
                }}
                className="p-1 rounded-full bg-surface-glass text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ETA & Distance Metrics */}
            <div className="grid grid-cols-2 gap-2 text-center font-mono">
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-400 block">Tiempo Estimado</span>
                <span className="text-2xl font-black text-cyan-info tabular-nums">
                  {activeRoute.durationMin} min
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-400 block">Distancia por Ruta</span>
                <span className="text-2xl font-black text-white tabular-nums">
                  {activeRoute.distanceKm} km
                </span>
              </div>
            </div>

            {/* Warning if Static Fallback */}
            {activeRoute.isFallback && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Ruta de respaldo estática (no verificada en tiempo real).</span>
              </div>
            )}

            {/* Deep Links External Navigation */}
            {(() => {
              const deepLinks = buildExternalNavigationDeepLinks(
                location.lat,
                location.lon,
                activeRoute.destinationCoords[1],
                activeRoute.destinationCoords[0],
                activeRoute.shelterName
              );

              return (
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                    Abrir en Navegador GPS del Celular:
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <a
                      href={deepLinks.googleMaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2.5 px-2 rounded-xl bg-[#1E293B] hover:bg-[#334155] text-white font-bold text-xs flex flex-col items-center justify-center gap-0.5 border border-white/10 active:scale-95 transition"
                    >
                      <span>Google Maps</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>

                    <a
                      href={deepLinks.waze}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2.5 px-2 rounded-xl bg-[#1E293B] hover:bg-[#334155] text-white font-bold text-xs flex flex-col items-center justify-center gap-0.5 border border-white/10 active:scale-95 transition"
                    >
                      <span>Waze</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>

                    <a
                      href={deepLinks.appleMaps}
                      className="py-2.5 px-2 rounded-xl bg-[#1E293B] hover:bg-[#334155] text-white font-bold text-xs flex flex-col items-center justify-center gap-0.5 border border-white/10 active:scale-95 transition"
                    >
                      <span>Apple Maps</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* Alternative Route Toggle if 2 routes available */}
            {computedRoutes.length > 1 && (
              <div className="flex justify-between items-center pt-1 border-t border-white/10 text-xs">
                <button
                  onClick={() => {
                    const nextIdx = (selectedRouteIndex + 1) % computedRoutes.length;
                    setSelectedRouteIndex(nextIdx);
                    drawRouteOnMap(computedRoutes[nextIdx]);
                  }}
                  className="text-cyan-info font-bold hover:underline flex items-center gap-1"
                >
                  <span>Ver ruta alternativa a {computedRoutes[(selectedRouteIndex + 1) % computedRoutes.length].shelterName}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* GPS Permission Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl p-5 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500 text-amber-400 flex items-center justify-center mx-auto">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-white">Permiso de Ubicación GPS</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                Para trazar tu ruta de escape con evitación de fuego en tiempo real necesitamos tu ubicación.
                Si tu navegador bloqueó el permiso, podés elegir tu ubicación manualmente en el mapa.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  setShowLocationModal(false);
                  setShowManualPickerTip(true);
                }}
                className="w-full py-2.5 rounded-xl bg-fire text-white font-bold text-xs"
              >
                Elegir Ubicación en el Mapa
              </button>
              <button
                onClick={() => setShowLocationModal(false)}
                className="w-full py-2.5 rounded-xl bg-surface-glass text-slate-400 text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
