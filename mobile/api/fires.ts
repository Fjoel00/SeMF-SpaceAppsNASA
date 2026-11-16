import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleFiresRequest } from '../server/handlers/firesHandler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const bbox = typeof req.query.bbox === 'string' ? req.query.bbox : undefined;
  const days = typeof req.query.days === 'string' ? parseInt(req.query.days, 10) : undefined;
  
  const result = await handleFiresRequest({ bbox, days });
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(result.status).json(result.data);
}
