import path from 'node:path';
import { loadConfig } from '../apps/server/src/config';
import { createContainer } from '../apps/server/src/container';
import { createApp } from '../apps/server/src/http/app';

let handler: ReturnType<typeof createApp> | undefined;

// Migrations are copied to `api/migrations` beside this bundle; point the server at them.
process.env.MIGRATIONS_DIR ??= path.join(__dirname, 'migrations');

/**
 * Builds the Express app once per warm function instance.
 * Serverless functions have no long-lived process, so `app.listen()` and the
 * in-process scheduler are intentionally never started here.
 */
export function getServerlessApp() {
  if (handler) return handler;
  const config = loadConfig({ host: '127.0.0.1', trustProxyHops: 1 });
  const container = createContainer(config);
  container.services.locations.refreshAll();
  container.services.outages.evaluateAll();
  container.services.insights.refreshAll();
  handler = createApp(container, { webDist: 'apps/web/dist' });
  return handler;
}

const EVENT_STREAMING_UNAVAILABLE = {
  error: { code: 'NOT_SUPPORTED', message: 'Live event streaming is unavailable in this disposable demo deployment. Refresh the page to load current data.' },
};

/** Serverless function handlers answer `/api/events` directly: SSE needs a long-lived request. */
export function sendUnsupportedEvents(res: { setHeader(name: string, value: string): void; status(code: number): { json(body: unknown): void } }) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(501).json(EVENT_STREAMING_UNAVAILABLE);
}

export function isEventsRequest(url: string | undefined) {
  return url === '/api/events' || url?.startsWith('/api/events?') === true;
}