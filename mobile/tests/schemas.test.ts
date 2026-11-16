import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Data Schemas & Integrity Tests', () => {
  it('validates shelters.geojson structure and coordinates', () => {
    const filePath = path.resolve(__dirname, '../public/data/shelters.geojson');
    expect(fs.existsSync(filePath)).toBe(true);

    const raw = fs.readFileSync(filePath, 'utf-8');
    const geojson = JSON.parse(raw);

    expect(geojson.type).toBe('FeatureCollection');
    expect(Array.isArray(geojson.features)).toBe(true);
    expect(geojson.features.length).toBeGreaterThanOrEqual(15);

    geojson.features.forEach((f: any) => {
      expect(f.type).toBe('Feature');
      expect(f.geometry.type).toBe('Point');
      const [lon, lat] = f.geometry.coordinates;
      expect(typeof lon).toBe('number');
      expect(typeof lat).toBe('number');
      // Must be within Córdoba / San Luis broader region
      expect(lat).toBeGreaterThanOrEqual(-36.5);
      expect(lat).toBeLessThanOrEqual(-29.0);
      expect(lon).toBeGreaterThanOrEqual(-68.0);
      expect(lon).toBeLessThanOrEqual(-61.0);

      // Properties check
      expect(f.properties.id).toBeDefined();
      expect(f.properties.name).toBeDefined();
      expect(f.properties.contact_phone).toBeDefined();
      expect(['FIRE_STATION', 'CIVIL_DEFENSE', 'HOSPITAL', 'EVAC_CENTER']).toContain(
        f.properties.category
      );
    });
  });

  it('validates partitioned calendar files are < 300 KB each', () => {
    const calendarDir = path.resolve(__dirname, '../public/data/calendar');
    const files = ['san_luis.json', 'cordoba.json', 'regional.json', 'metadata.json'];

    files.forEach((file) => {
      const fullPath = path.join(calendarDir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
      const stat = fs.statSync(fullPath);
      const sizeKb = stat.size / 1024;
      // Strict requirement: < 300 KB
      expect(sizeKb).toBeLessThan(300);

      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      if (file !== 'metadata.json') {
        expect(parsed.baseline).toBeDefined();
        expect(parsed.baseline.length).toBe(52);
        expect(parsed.matrix).toBeDefined();
        expect(parsed.matrix['2025']).toBeDefined();
        expect(parsed.matrix['2025'].length).toBe(52);
      }
    });
  });

  it('validates static_routes.json fallback routes', () => {
    const filePath = path.resolve(__dirname, '../public/data/static_routes.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(Array.isArray(parsed.routes)).toBe(true);
    expect(parsed.routes.length).toBeGreaterThan(0);

    parsed.routes.forEach((r: any) => {
      expect(r.id).toBeDefined();
      expect(r.distanceKm).toBeGreaterThan(0);
      expect(r.durationMin).toBeGreaterThan(0);
      expect(r.coordinates.length).toBeGreaterThanOrEqual(2);
    });
  });
});
