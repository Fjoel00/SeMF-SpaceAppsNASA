import { describe, expect, it } from 'vitest';
import { useSeMFStore } from '../stores/useSeMFStore';
import { calculateDistanceMeters } from '../hooks/useUserGeolocation';

describe('Geolocation & Displacement Tracking', () => {
  it('calculates accurate Haversine distances in meters', () => {
    // Merlo, San Luis coords
    const origin = { lat: -32.3411, lon: -65.0125 };
    // Point ~111m north
    const moved = { lat: -32.3401, lon: -65.0125 };

    const distance = calculateDistanceMeters(origin.lat, origin.lon, moved.lat, moved.lon);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(125);
  });

  it('updates store geolocation state properly', () => {
    const store = useSeMFStore.getState();
    store.setUserOrigin(-32.3411, -65.0125, 12, true);
    store.setGeolocationStatus('AVAILABLE');

    const updated = useSeMFStore.getState();
    expect(updated.userOrigin).toEqual({ lat: -32.3411, lon: -65.0125 });
    expect(updated.userAccuracyMeters).toBe(12);
    expect(updated.isRealGps).toBe(true);
    expect(updated.geolocationStatus).toBe('AVAILABLE');
  });

  it('tracks last calculated origin and displacement', () => {
    const store = useSeMFStore.getState();
    store.setLastCalculatedOrigin({ lat: -32.3411, lon: -65.0125 });

    expect(useSeMFStore.getState().lastCalculatedOrigin).toEqual({
      lat: -32.3411,
      lon: -65.0125,
    });
  });
});
