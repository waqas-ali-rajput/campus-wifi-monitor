import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServerlessApp, isEventsRequest, sendUnsupportedEvents } from './app';

/** Vercel exposes the pre-rewrite path in `x-vercel-original-path`. */
function originalPath(req: VercelRequest): string {
  const header = req.headers['x-vercel-original-path'] ?? req.headers['x-now-route-matches'];
  const path = Array.isArray(header) ? header[0] : header;
  if (!path || !path.startsWith('/api')) return req.url ?? '/';
  // The rewrite appends `?path=<original>`, so restore the query the client sent.
  const query = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return path + query;
}

/** Vercel function entry point. Bundled to `api/index.js` by `build-function.mjs`. */
export default async function apiHandler(req: VercelRequest, res: VercelResponse) {
  const target = originalPath(req);
  if (isEventsRequest(target)) return sendUnsupportedEvents(res);
  let app;
  try {
    app = await getServerlessApp();
  } catch (err) {
    console.error('Startup failed:', err);
    res.status(503).json({ error: { code: 'UNAVAILABLE', message: 'The server could not reach its database. Try again shortly.' } });
    return;
  }
  // Express must see the original path/query so routing and JSON parsing match local.
  req.url = target;
  return app(req as never, res as never);
}
