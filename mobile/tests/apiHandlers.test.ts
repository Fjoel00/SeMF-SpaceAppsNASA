import { describe, it, expect } from 'vitest';
import { handleHealthRequest } from '../server/handlers/healthHandler';
import { handleFiresRequest } from '../server/handlers/firesHandler';
import { handleRoutingRequest } from '../server/handlers/routingHandler';

describe('Serverless & Docker Handlers Integration Tests', () => {
  it('returns 200 and healthy status on handleHealthRequest', () => {
    const res = handleHealthRequest();
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('healthy');
    expect(res.data.service).toBe('semf-mobile');
    expect(res.data.version).toBe('1.0.0');
    expect(['demo', 'live']).toContain(res.data.mode);
  });

  it('serves active fires snapshot on handleFiresRequest', async () => {
    const res = await handleFiresRequest();
    expect(res.status).toBe(200);
    expect(res.data.metadata).toBeDefined();
    expect(res.data.events).toBeDefined();
    expect(Array.isArray(res.data.events)).toBe(true);
    expect(res.data.events.length).toBeGreaterThan(0);
    expect(res.data.weather).toBeDefined();
    expect(res.data.kpis).toBeDefined();
  });

  it('calculates deterministic fallback route on handleRoutingRequest', async () => {
    const origin: [number, number] = [-66.0640, -33.1095];
    const destination: [number, number] = [-65.9870, -33.1180];

    const res = await handleRoutingRequest({
      origin,
      destination,
      shelterId: 'SHL-01',
    });

    expect(res.status).toBe(200);
    expect(res.data.distanceKm).toBeGreaterThan(0);
    expect(res.data.durationMin).toBeGreaterThan(0);
    expect(res.data.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(res.data.coordinates[0]).toEqual(origin);
    expect(res.data.coordinates[res.data.coordinates.length - 1]).toEqual(destination);
  });

  it('handles invalid coordinates gracefully', async () => {
    const res = await handleRoutingRequest({
      origin: [0] as any,
      destination: [] as any,
    });
    expect(res.status).toBe(400);
    expect(res.data.warning).toBeDefined();
  });
});
