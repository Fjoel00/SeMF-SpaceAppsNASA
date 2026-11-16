import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const candidates = [
    path.join(process.cwd(), 'mobile', 'data', 'shelters.geojson'),
    path.join(process.cwd(), 'data', 'shelters.geojson'),
    path.join(process.cwd(), 'data', 'shelters', 'refugios_bomberos_cba_sl.geojson'),
    path.join(__dirname, '../data/shelters.geojson'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const data = fs.readFileSync(p, 'utf-8');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
        return res.status(200).send(data);
      } catch (e) {
        console.error('Error reading shelters in api:', e);
      }
    }
  }

  return res.status(404).json({ error: 'Shelters GeoJSON not found' });
}
