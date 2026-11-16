export type ActiveTab = 'calendar' | 'escape' | 'panic';

export type ZoneId = 'san_luis' | 'cordoba' | 'regional';

export interface ZoneConfig {
  id: ZoneId;
  label: string;
  shortLabel: string;
  province: string;
  center: [number, number]; // [lon, lat]
  defaultZoom: number;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

export interface ShelterProperties {
  id: string;
  name: string;
  category: 'FIRE_STATION' | 'CIVIL_DEFENSE' | 'HOSPITAL' | 'EVAC_CENTER';
  province: string;
  locality: string;
  access_road?: string;
  capacity_persons?: number;
  has_medical_support: boolean;
  has_water_supply: boolean;
  is_verified_reliable: boolean;
  operational_status: 'OPEN' | 'STANDBY' | 'CLOSED';
  contact_phone: string;
}

export interface ShelterFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: ShelterProperties;
}

export interface ShelterCollection {
  type: 'FeatureCollection';
  name?: string;
  features: ShelterFeature[];
}

export interface ActiveHotspot {
  lat: number;
  lon: number;
  frp: number;
  confidence: string | number;
  satellite: string;
  acq_datetime: string;
  sensor: 'VIIRS' | 'MODIS';
}

export interface FireEventCluster {
  event_id: string;
  event_type: string;
  location_name: string;
  province: string;
  centroid_lat: number;
  centroid_lon: number;
  points_count: number;
  frp_peak_mw: number;
  frp_total_mw: number;
  detection_area_ha: number;
  severity_level: string;
  polygon_coords?: [number, number][]; // [lat, lon]
}

export interface EvacuationRoute {
  id: string;
  shelterId: string;
  shelterName: string;
  shelterPhone: string;
  shelterCategory: string;
  distanceKm: number;
  durationMin: number;
  safetyScore: number; // 0 to 100
  isVerified: boolean;
  isFallback: boolean;
  coordinates: [number, number][]; // [lon, lat] for MapLibre LineString
  destinationCoords: [number, number]; // [lon, lat]
  startCoords: [number, number]; // [lon, lat]
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export interface SOSPayload {
  userLocation: {
    lat: number;
    lon: number;
    accuracyMeters: number;
    timestamp: number;
  };
  nearestFire: {
    distanceKm: number;
    bearingCardinal: string;
    bearingDeg: number;
    locationName: string;
  } | null;
  targetShelter: {
    name: string;
    phone: string;
    locality: string;
  } | null;
  generatedAt: string;
  fullMessageText: string;
}

export interface AppHealthState {
  status: 'healthy' | 'degraded';
  service: string;
  mode: 'demo' | 'live';
  routingProvider: 'openrouteservice' | 'static_fallback';
  firmsLive: boolean;
  lastUpdatedUtc?: string;
}
