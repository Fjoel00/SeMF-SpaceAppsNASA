import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleRoutingRequest } from '../server/handlers/routingHandler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const result = await handleRoutingRequest(req.body);
  res.setHeader('Cache-Control', 'no-cache');
  return res.status(result.status).json(result.data);
}
