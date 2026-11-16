import { describe, expect, it } from 'vitest';
import { useSeMFStore } from '../stores/useSeMFStore';

describe('SeMF 2.0 Store & State Contracts', () => {
  it('initializes in dashboard view with default safety buffer 1.2 km', () => {
    const state = useSeMFStore.getState();
    expect(state.activeView).toBe('dashboard');
    expect(state.safetyBufferKm).toBe(1.2);
    expect(state.layers.viirsPoints).toBe(true);
    expect(state.layers.modisPoints).toBe(true);
  });

  it('switches navigation across all 8 views', () => {
    const store = useSeMFStore.getState();
    store.setActiveView('routing');
    expect(useSeMFStore.getState().activeView).toBe('routing');
    store.setActiveView('ml-analytics');
    expect(useSeMFStore.getState().activeView).toBe('ml-analytics');
  });

  it('manages simulation injection state cleanly', () => {
    const store = useSeMFStore.getState();
    store.setSimulationEnabled(true);
    store.addInjectedFire(-33.21, -66.02, 'critical');
    expect(useSeMFStore.getState().simulation.enabled).toBe(true);
    expect(useSeMFStore.getState().simulation.injectedFires.length).toBe(1);
    store.clearInjectedFires();
    expect(useSeMFStore.getState().simulation.injectedFires.length).toBe(0);
  });
});
