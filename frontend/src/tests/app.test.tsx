import { describe, expect, it } from 'vitest';
import { useSeMFStore } from '../stores/useSeMFStore';

describe('SeMF 2.0 Store & State Contracts', () => {
  it('initializes in historical calendar view with default safety buffer 1.2 km', () => {
    const state = useSeMFStore.getState();
    expect(state.activeView).toBe('historical');
    expect(state.safetyBufferKm).toBe(1.2);
    expect(state.layers.viirsPoints).toBe(true);
    expect(state.layers.modisPoints).toBe(true);
  });

  it('switches navigation across the 3 main views', () => {
    const store = useSeMFStore.getState();
    store.setActiveView('tactical');
    expect(useSeMFStore.getState().activeView).toBe('tactical');
    store.setActiveView('intelligence');
    expect(useSeMFStore.getState().activeView).toBe('intelligence');
    store.setActiveView('historical');
    expect(useSeMFStore.getState().activeView).toBe('historical');
  });
});
