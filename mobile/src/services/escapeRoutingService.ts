import * as turf from '@turf/turf';
import { 
  ShelterFeature, ActiveHotspot, FireEventCluster, EvacuationRoute 
} from '../types';
import { calculateDistanceKm } from './sosMessageBuilder';

export interface FireBufferGeometry {
  type: 'FeatureCollection';
  features: turf.Feature<turf.Polygon | turf.MultiPolygon>[];
}

export function generateFireBuffers(
  hotspots: (ActiveHotspot | FireEventCluster)[],
  bufferKm = 3.0
): FireBufferGeometry {
  const bufferedFeatures: turf.Feature<turf.Polygon | turf.MultiPolygon>[] = [];

  for (const item of hotspots) {
    const lat = 'centroid_lat' in item ? item.centroid_lat : item.lat;
    const lon = 'centroid_lon' in item ? item.centroid_lon : item.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;

    const pt = turf.point([lon, lat]);
    const buffered = turf.buffer(pt, bufferKm, { units: 'kilometers' });
    if (buffered) {
      bufferedFeatures.push(buffered);
    }
  }

  return {
    type: 'FeatureCollection',
    features: bufferedFeatures,
  };
}

export function extractAvoidPolygonsCoordinates(
  bufferGeoJson: FireBufferGeometry
): [number, number][][][] {
  const polygons: [number, number][][][] = [];

  for (const f of bufferGeoJson.features) {
    if (f.geometry.type === 'Polygon') {
      polygons.push(f.geometry.coordinates as [number, number][][]);
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const poly of f.geometry.coordinates) {
        polygons.push(poly as [number, number][][]);
      }
    }
  }

  return polygons;
}

export function findTopCandidateShelters(
  userLat: number,
  userLon: number,
  shelters: ShelterFeature[],
  count = 2
): ShelterFeature[] {
  return [...shelters]
    .map((s) => {
      const [sLon, sLat] = s.geometry.coordinates;
      const dist = calculateDistanceKm(userLat, userLon, sLat, sLon);
      return { shelter: s, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, count)
    .map((item) => item.shelter);
}

export async function requestEvacuationRoute(
  origin: [number, number], // [lon, lat]
  shelter: ShelterFeature,
  avoidPolygonsCoords: [number, number][][][]
): Promise<EvacuationRoute> {
  const destCoords = shelter.geometry.coordinates; // [lon, lat]
  const [sLon, sLat] = destCoords;
  const [oLon, oLat] = origin;

  try {
    const response = await fetch('/api/routing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin,
        destination: destCoords,
        avoid_polygons: avoidPolygonsCoords,
        shelterId: shelter.properties.id,
        shelterName: shelter.properties.name,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return {
        id: `route_${shelter.properties.id}`,
        shelterId: shelter.properties.id,
        shelterName: shelter.properties.name,
        shelterPhone: shelter.properties.contact_phone,
        shelterCategory: shelter.properties.category,
        distanceKm: result.distanceKm,
        durationMin: result.durationMin,
        safetyScore: result.isFallback ? 85 : 98,
        isVerified: result.isVerified,
        isFallback: result.isFallback,
        coordinates: result.coordinates,
        destinationCoords: destCoords,
        startCoords: origin,
      };
    }
  } catch (err) {
    console.warn('Error solicitando ruta al proxy, utilizando cálculo local:', err);
  }

  // Fallback calculation directly in client
  const dist = calculateDistanceKm(oLat, oLon, sLat, sLon);
  const roadDistKm = Math.round(dist * 1.35 * 10) / 10;
  const durationMin = Math.max(5, Math.round((roadDistKm / 45) * 60));

  return {
    id: `route_fallback_${shelter.properties.id}`,
    shelterId: shelter.properties.id,
    shelterName: shelter.properties.name,
    shelterPhone: shelter.properties.contact_phone,
    shelterCategory: shelter.properties.category,
    distanceKm: roadDistKm,
    durationMin,
    safetyScore: 80,
    isVerified: false,
    isFallback: true,
    coordinates: [
      origin,
      [oLon + (sLon - oLon) * 0.5, oLat + (sLat - oLat) * 0.5],
      destCoords,
    ],
    destinationCoords: destCoords,
    startCoords: origin,
  };
}

export function buildExternalNavigationDeepLinks(
  userLat: number,
  userLon: number,
  destLat: number,
  destLon: number,
  shelterName: string
) {
  const encName = encodeURIComponent(shelterName);
  return {
    googleMaps: `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLon}&destination=${destLat},${destLon}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${destLat},${destLon}&navigate=yes`,
    appleMaps: `maps://?saddr=${userLat},${userLon}&daddr=${destLat},${destLon}&dirflg=d`,
  };
}

export function calculatePerpendicularEscapeBearing(windPushAzimuthDeg: number): {
  windPushCardinal: string;
  flank1Deg: number;
  flank1Cardinal: string;
  flank2Deg: number;
  flank2Cardinal: string;
  advice: string;
} {
  const push = (windPushAzimuthDeg + 360) % 360;
  const flank1 = (push - 90 + 360) % 360;
  const flank2 = (push + 90 + 360) % 360;

  const degToCard = (d: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return directions[Math.round(d / 45) % 8];
  };

  const pushCard = degToCard(push);
  const flank1Card = degToCard(flank1);
  const flank2Card = degToCard(flank2);

  const advice = `El fuego avanza hacia el ${pushCard} empujado por el viento. Evacuá de forma perpendicular hacia el ${flank1Card} o ${flank2Card}, buscando caminos despejados, zonas ya quemadas o terreno sin vegetación.`;

  return {
    windPushCardinal: pushCard,
    flank1Deg: flank1,
    flank1Cardinal: flank1Card,
    flank2Deg: flank2,
    flank2Cardinal: flank2Card,
    advice,
  };
}
