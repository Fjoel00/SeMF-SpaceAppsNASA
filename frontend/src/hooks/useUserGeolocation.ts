/**
 * SeMF 2.0 — Hook Reactivo de Geolocalización Automática y Tiempo Real
 * ====================================================================
 * Soporte multiplataforma (Android, iOS Safari, macOS, Windows, Linux).
 * Implementa obtención inicial rápida, seguimiento continuo controlado
 * con umbral métrico antijitter, verificación de permisos y cálculo de desplazamiento.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSeMFStore, GeolocationStatus } from '../stores/useSeMFStore';

// Cálculo Haversine de distancia entre dos coordenadas en metros
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

interface UseUserGeolocationOptions {
  autoStart?: boolean;
  enableWatch?: boolean;
  displacementThresholdMeters?: number; // Desplazamiento mínimo para actualizar
}

export function useUserGeolocation(options: UseUserGeolocationOptions = {}) {
  const {
    autoStart = true,
    enableWatch = true,
    displacementThresholdMeters = 8, // Evitar ruidos GPS menores a 8 metros
  } = options;

  const {
    userOrigin,
    userAccuracyMeters,
    geolocationStatus,
    geolocationError,
    isRealGps,
    lastCalculatedOrigin,
    setUserOrigin,
    setGeolocationStatus,
  } = useSeMFStore();

  const watchIdRef = useRef<number | null>(null);
  const lastRecordedPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);

  // Detener el seguimiento activo
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Manejador común de nueva posición
  const handlePositionSuccess = useCallback(
    (pos: GeolocationPosition, isWatchUpdate = false) => {
      const lat = Number(pos.coords.latitude.toFixed(5));
      const lon = Number(pos.coords.longitude.toFixed(5));
      const accuracy = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;

      if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
        setHeading(pos.coords.heading);
      }
      if (pos.coords.speed !== null && !isNaN(pos.coords.speed)) {
        setSpeed(pos.coords.speed);
      }

      // Si es una actualización del watcher, verificar umbral de movimiento
      if (isWatchUpdate && lastRecordedPosRef.current) {
        const dist = calculateDistanceMeters(
          lastRecordedPosRef.current.lat,
          lastRecordedPosRef.current.lon,
          lat,
          lon
        );
        if (dist < displacementThresholdMeters) {
          // No actualizar si el movimiento es menor al umbral para evitar saltos
          return;
        }
      }

      lastRecordedPosRef.current = { lat, lon };
      setUserOrigin(lat, lon, accuracy, true);
      setGeolocationStatus('AVAILABLE', null);
    },
    [displacementThresholdMeters, setUserOrigin, setGeolocationStatus]
  );

  // Manejador común de errores
  const handlePositionError = useCallback(
    (err: GeolocationPositionError) => {
      let status: GeolocationStatus = 'ERROR';
      let message = 'Error al obtener la ubicación del dispositivo.';

      switch (err.code) {
        case err.PERMISSION_DENIED:
          status = 'DENIED';
          message =
            'Permiso de ubicación denegado. Habilita los permisos de ubicación en tu navegador o selecciona tu posición en el mapa.';
          break;
        case err.POSITION_UNAVAILABLE:
          status = 'UNAVAILABLE';
          message =
            'Ubicación no disponible. Verifica que el GPS o los servicios de ubicación estén activados.';
          break;
        case err.TIMEOUT:
          status = 'ERROR';
          message = 'Tiempo de espera agotado al consultar el GPS. Pulsa reintentar.';
          break;
      }

      setGeolocationStatus(status, message);
    },
    [setGeolocationStatus]
  );

  // Iniciar detección de ubicación
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeolocationStatus(
        'UNAVAILABLE',
        'Tu navegador o dispositivo no dispone de API de geolocalización.'
      );
      return;
    }

    setGeolocationStatus('DETECTING', null);

    // 1. Obtención inicial rápida con getCurrentPosition
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handlePositionSuccess(pos, false);

        // 2. Si el seguimiento continuo está activado, registrar watchPosition
        if (enableWatch && watchIdRef.current === null) {
          try {
            watchIdRef.current = navigator.geolocation.watchPosition(
              (watchPos) => handlePositionSuccess(watchPos, true),
              (watchErr) => {
                // Silenciosamente conservar última posición si falla el watcher temporalmente
                console.warn('[SeMF GPS Watcher]', watchErr.message);
              },
              {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 10000,
              }
            );
          } catch (e) {
            console.warn('[SeMF] No se pudo inicializar watchPosition:', e);
          }
        }
      },
      (err) => {
        handlePositionError(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      }
    );
  }, [enableWatch, handlePositionSuccess, handlePositionError, setGeolocationStatus]);

  // Ejecución automática al montar si autoStart es true
  useEffect(() => {
    if (autoStart) {
      requestLocation();
    }

    return () => {
      stopTracking();
    };
  }, [autoStart, requestLocation, stopTracking]);

  // Calcular desplazamiento respecto a la ruta previamente calculada (en metros)
  const displacementSinceRouteCalculated = lastCalculatedOrigin
    ? calculateDistanceMeters(
        userOrigin.lat,
        userOrigin.lon,
        lastCalculatedOrigin.lat,
        lastCalculatedOrigin.lon
      )
    : 0;

  return {
    userOrigin,
    userAccuracyMeters,
    geolocationStatus,
    geolocationError,
    isRealGps,
    heading,
    speed,
    displacementSinceRouteCalculated,
    requestLocation,
    stopTracking,
  };
}
