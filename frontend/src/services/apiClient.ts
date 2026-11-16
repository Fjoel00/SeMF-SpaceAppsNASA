/**
 * SeMF 2.0 — Cliente HTTP Tipado hacia la API Backend (/api/v1/*)
 */

import type {
  ActiveFiresPayload,
  EvacuationPlanResponse,
  HistoricalCalendarPayload,
  MLModelMetadata,
  SafeShelter,
} from '../types/semf';

const API_BASE = '/api/v1';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || data.error || `Error HTTP ${response.status}`);
  }
  return data as T;
}

export const apiClient = {
  getHealth: () => requestJson<Record<string, unknown>>(`${API_BASE}/health`),

  getDashboardSummary: () =>
    requestJson<Record<string, unknown>>(`${API_BASE}/dashboard/summary`),

  getActiveFires: () => requestJson<ActiveFiresPayload>(`${API_BASE}/fires/active`),

  triggerIngestion: (mode: 'real' | 'synthetic', bbox?: string) =>
    requestJson<Record<string, unknown>>(`${API_BASE}/fires/ingest`, {
      method: 'POST',
      body: JSON.stringify({ mode, bbox }),
    }),

  simulateScenario: (payload: {
    injected_fires: Array<{ lat: number; lon: number; severity: string }>;
    weather: Record<string, number>;
  }) =>
    requestJson<{
      simulation_active: boolean;
      weather: ActiveFiresPayload['weather'];
      events: ActiveFiresPayload['events'];
    }>(`${API_BASE}/fires/simulate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getHistoricalCalendar: (params: {
    mode: 'annual' | 'interval';
    year: number;
    range_from: number;
    range_to: number;
    week: number;
    bbox?: string | null;
  }) => {
    const q = new URLSearchParams({
      mode: params.mode,
      year: String(params.year),
      range_from: String(params.range_from),
      range_to: String(params.range_to),
      week: String(params.week),
    });
    if (params.bbox) {
      q.set('bbox', params.bbox);
    }
    return requestJson<HistoricalCalendarPayload>(
      `${API_BASE}/historical/calendar?${q.toString()}`
    );
  },

  calculateEvacuationPlan: (payload: {
    origin_lat: number;
    origin_lon: number;
    target_shelter_id?: string | null;
    safety_buffer_km: number;
    max_alternatives?: number;
    allow_unverified_shelters?: boolean;
    simulated_data_age_hours?: number | null;
    custom_fires?: ActiveFiresPayload['events'] | null;
  }) =>
    requestJson<EvacuationPlanResponse>(`${API_BASE}/routing/evacuate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getShelters: () =>
    requestJson<{
      total_shelters: number;
      operational_safe_count: number;
      compromised_count: number;
      verified_count: number;
      shelters: SafeShelter[];
    }>(`${API_BASE}/shelters`),

  getMLModels: () =>
    requestJson<{ status: string; models: MLModelMetadata[] }>(
      `${API_BASE}/ml/models`
    ),

  predictMLRisk: (payload: {
    spread_features: Record<string, number>;
    segment_features: Record<string, number>;
  }) =>
    requestJson<Record<string, unknown>>(`${API_BASE}/ml/predict-risk`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSettings: () => requestJson<Record<string, unknown>>(`${API_BASE}/settings`),

  updateSettings: (payload: Record<string, unknown>) =>
    requestJson<Record<string, unknown>>(`${API_BASE}/settings`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
