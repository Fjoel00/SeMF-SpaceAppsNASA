/**
 * SeMF 2.0 — Store Global Reactivo (Zustand)
 * Gestiona la vista activa, frente seleccionado, capas del mapa, ubicación de
 * evacuación y estado del simulador táctico.
 */

import { create } from 'zustand';
import type {
  FireFrontEvent,
  NavigationViewId,
  ThermalDetectionPoint,
} from '../types/semf';

interface LayerVisibilityState {
  viirsPoints: boolean;
  modisPoints: boolean;
  pixelFootprints: boolean;
  firePerimeters: boolean;
  cones1h: boolean;
  cones3h: boolean;
  cones6h: boolean;
  shelters: boolean;
}

interface SimulationState {
  enabled: boolean;
  windSpeedKmh: number;
  windDirectionDeg: number;
  temperatureC: number;
  relativeHumidityPct: number;
  injectedFires: Array<{ id: string; lat: number; lon: number; severity: string }>;
}

interface SeMFStore {
  activeView: NavigationViewId;
  setActiveView: (view: NavigationViewId) => void;

  selectedEvent: FireFrontEvent | null;
  setSelectedEvent: (ev: FireFrontEvent | null) => void;

  selectedPixel: ThermalDetectionPoint | null;
  setSelectedPixel: (pt: ThermalDetectionPoint | null) => void;

  userOrigin: { lat: number; lon: number };
  setUserOrigin: (lat: number, lon: number) => void;

  targetShelterId: string | null;
  setTargetShelterId: (id: string | null) => void;

  safetyBufferKm: number;
  setSafetyBufferKm: (km: number) => void;

  layers: LayerVisibilityState;
  toggleLayer: (key: keyof LayerVisibilityState) => void;

  simulation: SimulationState;
  setSimulationEnabled: (enabled: boolean) => void;
  updateSimulationWeather: (partial: Partial<SimulationState>) => void;
  addInjectedFire: (lat: number, lon: number, severity: string) => void;
  clearInjectedFires: () => void;
}

export const useSeMFStore = create<SeMFStore>((set) => ({
  activeView: 'historical',
  setActiveView: (view) => set({ activeView: view }),

  selectedEvent: null,
  setSelectedEvent: (ev) => set({ selectedEvent: ev }),

  selectedPixel: null,
  setSelectedPixel: (pt) => set({ selectedPixel: pt }),

  // Posición inicial táctica cercana a El Trapiche / La Florida (San Luis)
  userOrigin: { lat: -33.195, lon: -66.035 },
  setUserOrigin: (lat, lon) => set({ userOrigin: { lat, lon } }),

  targetShelterId: null,
  setTargetShelterId: (id) => set({ targetShelterId: id }),

  safetyBufferKm: 1.2,
  setSafetyBufferKm: (km) => set({ safetyBufferKm: km }),

  layers: {
    viirsPoints: true,
    modisPoints: true,
    pixelFootprints: true,
    firePerimeters: true,
    cones1h: true,
    cones3h: true,
    cones6h: false,
    shelters: true,
  },
  toggleLayer: (key) =>
    set((state) => ({
      layers: { ...state.layers, [key]: !state.layers[key] },
    })),

  simulation: {
    enabled: false,
    windSpeedKmh: 38,
    windDirectionDeg: 200,
    temperatureC: 34,
    relativeHumidityPct: 17,
    injectedFires: [],
  },
  setSimulationEnabled: (enabled) =>
    set((state) => ({
      simulation: { ...state.simulation, enabled },
    })),
  updateSimulationWeather: (partial) =>
    set((state) => ({
      simulation: { ...state.simulation, ...partial },
    })),
  addInjectedFire: (lat, lon, severity) =>
    set((state) => ({
      simulation: {
        ...state.simulation,
        injectedFires: [
          ...state.simulation.injectedFires,
          {
            id: `INJ_${Date.now()}`,
            lat: Number(lat.toFixed(5)),
            lon: Number(lon.toFixed(5)),
            severity,
          },
        ],
      },
    })),
  clearInjectedFires: () =>
    set((state) => ({
      simulation: { ...state.simulation, injectedFires: [] },
    })),
}));
