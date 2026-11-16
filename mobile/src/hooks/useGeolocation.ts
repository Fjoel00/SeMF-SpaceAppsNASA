import { useState, useEffect, useCallback } from 'react';

export interface GeoLocationState {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
  isFallback: boolean;
  error?: string;
  isWatching: boolean;
}

const STORAGE_KEY = 'semf_last_known_location';

// Default fallback to San Luis center if zero location available
const DEFAULT_SAN_LUIS = {
  lat: -33.2995,
  lon: -66.3356,
  accuracy: 1000,
};

export function useGeolocation(autoWatch: boolean = false) {
  const [location, setLocation] = useState<GeoLocationState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          lat: parsed.lat,
          lon: parsed.lon,
          accuracy: parsed.accuracy || 500,
          timestamp: parsed.timestamp || Date.now(),
          isFallback: true,
          isWatching: false,
        };
      }
    } catch {}
    return {
      lat: DEFAULT_SAN_LUIS.lat,
      lon: DEFAULT_SAN_LUIS.lon,
      accuracy: DEFAULT_SAN_LUIS.accuracy,
      timestamp: Date.now(),
      isFallback: true,
      isWatching: false,
    };
  });

  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  const updateLocation = useCallback((lat: number, lon: number, accuracy: number, isFallback = false) => {
    const nextState: GeoLocationState = {
      lat,
      lon,
      accuracy,
      timestamp: Date.now(),
      isFallback,
      isWatching: true,
    };
    setLocation(nextState);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch {}
  }, []);

  const requestSinglePosition = useCallback(async (timeoutMs = 8000): Promise<GeoLocationState> => {
    if (!('geolocation' in navigator)) {
      return location;
    }

    return new Promise((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Fallback to current cached state
          resolve(location);
        }
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            setPermissionStatus('granted');
            const state: GeoLocationState = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: Math.round(pos.coords.accuracy),
              timestamp: pos.timestamp,
              isFallback: false,
              isWatching: false,
            };
            setLocation(state);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch {}
            resolve(state);
          }
        },
        (err) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            if (err.code === err.PERMISSION_DENIED) {
              setPermissionStatus('denied');
            }
            resolve({
              ...location,
              error: err.message,
              isFallback: true,
            });
          }
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 10000,
        }
      );
    });
  }, [location]);

  useEffect(() => {
    if (!autoWatch || !('geolocation' in navigator)) return;

    let watchId: number;

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPermissionStatus('granted');
        updateLocation(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy), false);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionStatus('denied');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );

    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [autoWatch, updateLocation]);

  return {
    location,
    permissionStatus,
    requestSinglePosition,
    setManualLocation: (lat: number, lon: number) => updateLocation(lat, lon, 25, false),
  };
}
