export interface RoutingRequestBody {
  origin: [number, number]; // [lon, lat]
  destination: [number, number]; // [lon, lat]
  avoid_polygons?: [number, number][][][]; // MultiPolygon coordinates
  shelterId?: string;
  shelterName?: string;
}

export interface RouteResponse {
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][]; // [lon, lat]
  isFallback: boolean;
  isVerified: boolean;
  provider: string;
  warning?: string;
}

export async function handleRoutingRequest(body: RoutingRequestBody): Promise<{ status: number; data: RouteResponse }> {
  const { origin, destination, avoid_polygons, shelterName } = body;

  if (!origin || !destination || origin.length !== 2 || destination.length !== 2) {
    return {
      status: 400,
      data: {
        distanceKm: 0,
        durationMin: 0,
        coordinates: [],
        isFallback: true,
        isVerified: false,
        provider: 'none',
        warning: 'Coordenadas de origen o destino inválidas',
      },
    };
  }

  const orsKey = process.env.ORS_API_KEY?.trim();

  // 1. Try OpenRouteService if key is available
  if (orsKey) {
    try {
      const orsUrl = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const requestPayload: any = {
        coordinates: [origin, destination],
      };

      if (avoid_polygons && avoid_polygons.length > 0) {
        requestPayload.options = {
          avoid_polygons: {
            type: 'MultiPolygon',
            coordinates: avoid_polygons,
          },
        };
      }

      const resp = await fetch(orsUrl, {
        method: 'POST',
        headers: {
          'Authorization': orsKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json, application/geo+json',
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const json = await resp.json();
        const feature = json.features?.[0];
        if (feature) {
          const coords = feature.geometry?.coordinates || [];
          const summary = feature.properties?.summary || {};
          const distanceKm = Math.round(((summary.distance || 0) / 1000) * 10) / 10;
          const durationMin = Math.round((summary.duration || 0) / 60);

          return {
            status: 200,
            data: {
              distanceKm,
              durationMin,
              coordinates: coords,
              isFallback: false,
              isVerified: true,
              provider: 'OpenRouteService',
            },
          };
        }
      }
    } catch (err) {
      console.warn('[RoutingHandler] Error llamando a OpenRouteService, activando fallback estático:', (err as any).message);
    }
  }

  // 2. Deterministic Fallback Route (No API Key or Call Failed)
  const [oLon, oLat] = origin;
  const [dLon, dLat] = destination;

  // Approximate Haversine distance
  const dLatRad = ((dLat - oLat) * Math.PI) / 180;
  const dLonRad = ((dLon - oLon) * Math.PI) / 180;
  const a =
    Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
    Math.cos((oLat * Math.PI) / 180) * Math.cos((dLat * Math.PI) / 180) * Math.sin(dLonRad / 2) * Math.sin(dLonRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const rawDistKm = 6371 * c;

  // Real road factor ~1.35x crow flies in mountain terrain
  const distanceKm = Math.round(rawDistKm * 1.35 * 10) / 10;
  // Estimated driving speed 48 km/h in mountain roads
  const durationMin = Math.max(5, Math.round((distanceKm / 48) * 60));

  // Build intermediate waypoints to simulate road corridor
  const waypoints: [number, number][] = [
    [oLon, oLat],
    [oLon + (dLon - oLon) * 0.33, oLat + (dLat - oLat) * 0.25],
    [oLon + (dLon - oLon) * 0.66, oLat + (dLat - oLat) * 0.75],
    [dLon, dLat],
  ];

  return {
    status: 200,
    data: {
      distanceKm,
      durationMin,
      coordinates: waypoints,
      isFallback: true,
      isVerified: false,
      provider: 'StaticFallback',
      warning: 'Ruta de respaldo estática calculada localmente (no verificada con servicio vial en tiempo real).',
    },
  };
}
