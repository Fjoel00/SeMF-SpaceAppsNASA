import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface FiresQueryParams {
  bbox?: string;
  days?: number;
}

export async function handleFiresRequest(query: FiresQueryParams = {}): Promise<{ status: number; data: any }> {
  const firmsKey = process.env.FIRMS_MAP_KEY?.trim();
  const defaultBbox = process.env.DEFAULT_BBOX || '-66.0,-33.5,-63.5,-31.0';
  const bbox = query.bbox || defaultBbox;

  // 1. If FIRMS key is provided, try live query with fallback
  if (firmsKey) {
    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/${bbox}/1`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const csvText = await resp.text();
        const hotspots = parseFIRMSCsv(csvText, 'VIIRS');
        if (hotspots.length > 0) {
          return {
            status: 200,
            data: {
              metadata: {
                generated_at_utc: new Date().toISOString(),
                bbox,
                is_demo: false,
                is_synthetic: false,
                total_detections: hotspots.length,
                active_fronts_count: Math.max(1, Math.ceil(hotspots.length / 5)),
              },
              hotspots,
              events: groupHotspotsIntoEvents(hotspots),
              weather: {
                wind_speed_kmh: 22.0,
                wind_direction_deg: 220.0,
                wind_push_azimuth_deg: 40.0,
                relative_humidity_pct: 35.0,
              },
              kpis: {
                viirs_detections: hotspots.length,
                modis_detections: 0,
                peak_pass_frp_mw: Math.max(...hotspots.map((h) => h.frp), 0),
              },
            },
          };
        }
      }
    } catch (err) {
      console.warn('[FIRMS Proxy] Error conectando a NASA FIRMS, usando snapshot local:', (err as any).message);
    }
  }

  // 2. Fallback: Load static snapshot from disk
  const possiblePaths = [
    path.join(process.cwd(), 'data', 'active_fires_snapshot.json'),
    path.join(process.cwd(), 'mobile', 'data', 'active_fires_snapshot.json'),
    path.join(__dirname, '../../data', 'active_fires_snapshot.json'),
    path.join(__dirname, '../data', 'active_fires_snapshot.json'),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const snapshot = JSON.parse(raw);
        // Ensure metadata indicates demo/local mode
        snapshot.metadata = {
          ...snapshot.metadata,
          is_demo: true,
          mode: 'local_snapshot',
        };
        return { status: 200, data: snapshot };
      } catch (err) {
        console.error('[FiresHandler] Error leyendo snapshot:', err);
      }
    }
  }

  // 3. Ultra-fallback if snapshot file wasn't found
  return {
    status: 200,
    data: {
      metadata: {
        generated_at_utc: new Date().toISOString(),
        bbox,
        is_demo: true,
        is_synthetic: true,
        total_detections: 2,
        active_fronts_count: 1,
      },
      events: [
        {
          event_id: 'FALLBACK_FRONT_01',
          event_type: 'Frente Activo (Demo)',
          location_name: 'Sierras Centrales San Luis (El Trapiche)',
          province: 'San Luis',
          centroid_lat: -33.255,
          centroid_lon: -65.953,
          points_count: 8,
          frp_peak_mw: 145.2,
          frp_total_mw: 280.0,
          detection_area_ha: 35.0,
          severity_level: 'Alto',
        },
      ],
      hotspots: [
        {
          lat: -33.255,
          lon: -65.953,
          frp: 85.0,
          confidence: 'h',
          satellite: 'NOAA-20',
          acq_datetime: new Date().toISOString(),
          sensor: 'VIIRS',
        },
      ],
      weather: {
        wind_speed_kmh: 24.0,
        wind_direction_deg: 225.0,
        wind_push_azimuth_deg: 45.0,
        relative_humidity_pct: 30.0,
      },
      kpis: {
        viirs_detections: 8,
        modis_detections: 1,
        peak_pass_frp_mw: 145.2,
      },
    },
  };
}

function parseFIRMSCsv(csvText: string, defaultSensor: 'VIIRS' | 'MODIS') {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const latIdx = headers.indexOf('latitude');
  const lonIdx = headers.indexOf('longitude');
  const frpIdx = headers.indexOf('frp');
  const confIdx = headers.indexOf('confidence');
  const dateIdx = headers.indexOf('acq_date');
  const timeIdx = headers.indexOf('acq_time');
  const satIdx = headers.indexOf('satellite');

  if (latIdx === -1 || lonIdx === -1) return [];

  const hotspots = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < headers.length) continue;

    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;

    const frp = frpIdx !== -1 ? parseFloat(cols[frpIdx]) || 0 : 0;
    const confidence = confIdx !== -1 ? cols[confIdx] : 'nominal';
    const date = dateIdx !== -1 ? cols[dateIdx] : '';
    const time = timeIdx !== -1 ? cols[timeIdx] : '';
    const sat = satIdx !== -1 ? cols[satIdx] : 'VIIRS';

    hotspots.push({
      lat,
      lon,
      frp,
      confidence,
      satellite: sat,
      acq_datetime: `${date} ${time}`.trim(),
      sensor: defaultSensor,
    });
  }
  return hotspots;
}

function groupHotspotsIntoEvents(hotspots: any[]) {
  if (hotspots.length === 0) return [];
  // Simple clustering grouping
  const avgLat = hotspots.reduce((acc, h) => acc + h.lat, 0) / hotspots.length;
  const avgLon = hotspots.reduce((acc, h) => acc + h.lon, 0) / hotspots.length;
  const totalFrp = hotspots.reduce((acc, h) => acc + h.frp, 0);
  const maxFrp = Math.max(...hotspots.map((h) => h.frp), 0);

  return [
    {
      event_id: 'EVENT_LIVE_01',
      event_type: 'Frente Activo Detectado',
      location_name: 'Frente Térmico Detectado en Tiempo Real',
      province: avgLon > -65.1 ? 'Córdoba' : 'San Luis',
      centroid_lat: avgLat,
      centroid_lon: avgLon,
      points_count: hotspots.length,
      frp_peak_mw: maxFrp,
      frp_total_mw: totalFrp,
      detection_area_ha: hotspots.length * 14.0,
      severity_level: maxFrp > 100 ? 'Crítico' : maxFrp > 40 ? 'Alto' : 'Medio',
    },
  ];
}
