import { ShelterFeature, FireEventCluster, ActiveHotspot, SOSPayload } from '../types';

export const OFFICIAL_EMERGENCY_NUMBERS = [
  {
    number: '911',
    name: 'Emergencias 911',
    role: 'Central Policial y Coordinación General de Catástrofes',
    jurisdiction: 'Nacional / Córdoba / San Luis',
    source: 'Ministerio de Seguridad de la Nación Argentina',
    primary: true,
  },
  {
    number: '100',
    name: 'Bomberos 100',
    role: 'Cuarteles de Bomberos de la Policía y Bomberos Voluntarios',
    jurisdiction: 'Nacional',
    source: 'Consejo Nacional de Bomberos Voluntarios de la R.A.',
    primary: true,
  },
  {
    number: '103',
    name: 'Defensa Civil 103',
    role: 'Protección Ciudadana, Evacuaciones y San Luis Solidario',
    jurisdiction: 'Córdoba y San Luis',
    source: 'Secretaría de Gestión de Riesgo Climático y San Luis Solidario',
    primary: true,
  },
  {
    number: '080088838346',
    display: '0800-888-FUEGO',
    name: 'Plan Provincial de Manejo del Fuego',
    role: 'Denuncia y alerta temprana de columnas de humo en Córdoba',
    jurisdiction: 'Provincia de Córdoba',
    source: 'Gobierno de la Provincia de Córdoba',
    primary: false,
  },
  {
    number: '+542664452000',
    display: '(0266) 4452000',
    name: 'San Luis Solidario (Central)',
    role: 'Comando de Emergencias Ambientales e Incendios Forestales',
    jurisdiction: 'Provincia de San Luis',
    source: 'Ministerio de Seguridad de San Luis',
    primary: false,
  },
];

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function calculateCardinalBearing(lat1: number, lon1: number, lat2: number, lon2: number): { deg: number; cardinal: string } {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  let theta = Math.atan2(y, x);
  let deg = ((theta * 180) / Math.PI + 360) % 360;

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(deg / 45) % 8;

  return {
    deg: Math.round(deg),
    cardinal: directions[index],
  };
}

export function buildEmergencySOSMessage(
  userLat: number,
  userLon: number,
  accuracyMeters: number,
  fires: (FireEventCluster | ActiveHotspot)[],
  shelters: ShelterFeature[]
): SOSPayload {
  // 1. Locate nearest active fire
  let nearestFire = null;
  let minFireDist = Infinity;

  for (const f of fires) {
    const fLat = 'centroid_lat' in f ? f.centroid_lat : f.lat;
    const fLon = 'centroid_lon' in f ? f.centroid_lon : f.lon;
    const dist = calculateDistanceKm(userLat, userLon, fLat, fLon);
    if (dist < minFireDist) {
      minFireDist = dist;
      const bearing = calculateCardinalBearing(userLat, userLon, fLat, fLon);
      const name = 'location_name' in f ? f.location_name : `Foco térmico (${dist} km)`;
      nearestFire = {
        distanceKm: dist,
        bearingCardinal: bearing.cardinal,
        bearingDeg: bearing.deg,
        locationName: name,
      };
    }
  }

  // 2. Locate nearest verified shelter
  let nearestShelter = null;
  let minShelterDist = Infinity;

  for (const s of shelters) {
    const [sLon, sLat] = s.geometry.coordinates;
    const dist = calculateDistanceKm(userLat, userLon, sLat, sLon);
    if (dist < minShelterDist) {
      minShelterDist = dist;
      nearestShelter = {
        name: s.properties.name,
        phone: s.properties.contact_phone,
        locality: s.properties.locality,
      };
    }
  }

  const roundedLat = Math.round(userLat * 100000) / 100000;
  const roundedLon = Math.round(userLon * 100000) / 100000;
  const mapsLink = `https://maps.google.com/?q=${roundedLat},${roundedLon}`;

  const fireText = nearestFire
    ? `${nearestFire.distanceKm} km al ${nearestFire.bearingCardinal}`
    : 'no detectado en 15 km';

  const shelterText = nearestShelter
    ? `${nearestShelter.name} (${nearestShelter.locality})`
    : 'zona segura más próxima';

  const fullMessageText = `EMERGENCIA INCENDIO. Mi ubicación: ${mapsLink} (±${Math.round(accuracyMeters)}m). Foco activo más cercano: ${fireText}. Destino: ${shelterText}.`;

  return {
    userLocation: {
      lat: userLat,
      lon: userLon,
      accuracyMeters,
      timestamp: Date.now(),
    },
    nearestFire,
    targetShelter: nearestShelter,
    generatedAt: new Date().toISOString(),
    fullMessageText,
  };
}

export function buildWhatsAppLink(phone: string, text: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const encodedText = encodeURIComponent(text);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

export function buildSmsLink(phone: string, text: string): string {
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const encodedText = encodeURIComponent(text);
  // Multi-platform format: sms:<phone>?body=<text> (standard)
  return `sms:${cleanPhone}?body=${encodedText}`;
}
