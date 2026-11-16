import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { handleHealthRequest } from './handlers/healthHandler';
import { handleFiresRequest } from './handlers/firesHandler';
import { handleRoutingRequest } from './handlers/routingHandler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '8090', 10);

app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/health', (_req, res) => {
  const result = handleHealthRequest();
  res.status(result.status).json(result.data);
});

app.get('/api/fires', async (req, res) => {
  const bbox = typeof req.query.bbox === 'string' ? req.query.bbox : undefined;
  const days = typeof req.query.days === 'string' ? parseInt(req.query.days, 10) : undefined;
  const result = await handleFiresRequest({ bbox, days });
  res.status(result.status).json(result.data);
});

app.post('/api/routing', async (req, res) => {
  const result = await handleRoutingRequest(req.body);
  res.status(result.status).json(result.data);
});

app.get('/api/shelters', (_req, res) => {
  const candidates = [
    path.join(__dirname, '../data/shelters.geojson'),
    path.join(__dirname, '../../data/shelters.geojson'),
    path.join(process.cwd(), 'mobile/data/shelters.geojson'),
    path.join(process.cwd(), 'data/shelters/refugios_bomberos_cba_sl.geojson'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const data = fs.readFileSync(p, 'utf-8');
        return res.setHeader('Content-Type', 'application/json').send(data);
      } catch (e) {
        console.error('Error reading shelters geojson:', e);
      }
    }
  }

  return res.status(404).json({ error: 'Shelters GeoJSON not found' });
});

// Serve frontend static build
const distPath = path.resolve(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send('SeMF Mobile Backend running. Client build not found at dist.');
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 SeMF Mobile Server listening on http://0.0.0.0:${port}`);
  console.log(`Mode: ${process.env.FIRMS_MAP_KEY ? 'LIVE (FIRMS Map Key set)' : 'DEMO (Using local data)'}`);
});
