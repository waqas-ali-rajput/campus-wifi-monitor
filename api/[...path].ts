import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServerlessApp, isEventsRequest, sendUnsupportedEvents } from '../serverless/app';

export default function apiHandler(req: VercelRequest, res: VercelResponse) {
  if (isEventsRequest(req.url)) return sendUnsupportedEvents(res);
  return getServerlessApp()(req, res);
}
