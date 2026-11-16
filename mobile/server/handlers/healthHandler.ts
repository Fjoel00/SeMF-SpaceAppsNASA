export interface HealthResponse {
  status: 'healthy' | 'degraded';
  service: string;
  version: string;
  mode: 'live' | 'demo';
  routingProvider: string;
  firmsLive: boolean;
  timestamp: string;
}

export function handleHealthRequest(): { status: number; data: HealthResponse } {
  const firmsKey = process.env.FIRMS_MAP_KEY?.trim();
  const orsKey = process.env.ORS_API_KEY?.trim();
  const provider = process.env.ROUTING_PROVIDER?.trim() || (orsKey ? 'openrouteservice' : 'static_fallback');

  return {
    status: 200,
    data: {
      status: 'healthy',
      service: 'semf-mobile',
      version: '1.0.0',
      mode: firmsKey ? 'live' : 'demo',
      routingProvider: provider,
      firmsLive: Boolean(firmsKey),
      timestamp: new Date().toISOString(),
    },
  };
}
