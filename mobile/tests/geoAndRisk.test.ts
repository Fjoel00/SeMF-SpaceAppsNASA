import { describe, it, expect } from 'vitest';
import { 
  generateFireBuffers, calculatePerpendicularEscapeBearing 
} from '../src/services/escapeRoutingService';
import { 
  calculateDistanceKm, calculateCardinalBearing 
} from '../src/services/sosMessageBuilder';

describe('Geospatial & Risk Calculations', () => {
  it('generates 3 km Turf buffers around fire hotspots', () => {
    const mockFires = [
      { lat: -33.255, lon: -65.953, frp: 120.0, confidence: 'h', satellite: 'NOAA-20', acq_datetime: '2026-11-16 12:00', sensor: 'VIIRS' as const },
      { centroid_lat: -33.109, centroid_lon: -66.064, frp_peak_mw: 200.0, detection_area_ha: 50.0, event_id: 'F1', event_type: 'Cluster', location_name: 'Trapiche', province: 'San Luis', points_count: 5, frp_total_mw: 300, severity_level: 'Alto' }
    ];

    const bufferGeoJson = generateFireBuffers(mockFires, 3.0);
    expect(bufferGeoJson.type).toBe('FeatureCollection');
    expect(bufferGeoJson.features.length).toBe(2);

    bufferGeoJson.features.forEach((feature) => {
      expect(['Polygon', 'MultiPolygon']).toContain(feature.geometry.type);
      expect(feature.geometry.coordinates.length).toBeGreaterThan(0);
    });
  });

  it('calculates Haversine distance with high accuracy', () => {
    // Distance from San Luis capital (-33.2995, -66.3356) to El Trapiche (-33.1095, -66.0640)
    const dist = calculateDistanceKm(-33.2995, -66.3356, -33.1095, -66.0640);
    expect(dist).toBeGreaterThan(30);
    expect(dist).toBeLessThan(40);
  });

  it('calculates correct cardinal directions', () => {
    // Directly north
    const north = calculateCardinalBearing(0, 0, 1, 0);
    expect(north.cardinal).toBe('N');

    // Directly east
    const east = calculateCardinalBearing(0, 0, 0, 1);
    expect(east.cardinal).toBe('E');

    // Directly south
    const south = calculateCardinalBearing(0, 0, -1, 0);
    expect(south.cardinal).toBe('S');

    // Directly west
    const west = calculateCardinalBearing(0, 0, 0, -1);
    expect(west.cardinal).toBe('O');
  });

  it('computes conservative perpendicular escape vectors', () => {
    // Wind pushing towards NE (45 degrees)
    const escape = calculatePerpendicularEscapeBearing(45);
    expect(escape.windPushCardinal).toBe('NE');
    // Flanks must be perpendicular (315° NW and 135° SE)
    expect(escape.flank1Deg).toBe(315);
    expect(escape.flank1Cardinal).toBe('NO');
    expect(escape.flank2Deg).toBe(135);
    expect(escape.flank2Cardinal).toBe('SE');
    expect(escape.advice).toContain('Evacuá de forma perpendicular');
  });
});
