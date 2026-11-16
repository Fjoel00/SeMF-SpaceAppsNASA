import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleHealthRequest } from '../server/handlers/healthHandler';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const result = handleHealthRequest();
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.status(result.status).json(result.data);
}
