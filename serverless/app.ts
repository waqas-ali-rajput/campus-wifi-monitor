import { loadConfig } from '../apps/server/src/config';
import { createContainer, warmUp } from '../apps/server/src/container';
import { createApp } from '../apps/server/src/http/app';

let handler: Promise<ReturnType<typeof createApp>> | undefined;

/**
 * Builds the Express app once per warm function instance, against the shared Neon database.
 * Migrations are embedded in the bundle (build-function.mjs) and applied idempotently.
 * Serverless functions have no long-lived process, so `app.listen()` and the in-process
 * scheduler are never started here; statuses are refreshed on each cold start instead.
 */
export function getServerlessApp() {
  handler ??= (async () => {
    // Many concurrent function instances share one database: keep each instance's pool small.
    // Vercel functions are short-lived and cannot hold an SSE request open, so live updates
    // are switched off here structurally rather than relying on someone setting an env var.
    const config = loadConfig({
      host: '127.0.0.1',
      trustProxyHops: 1,
      pgPoolMax: Number(process.env.PG_POOL_MAX ?? 3),
      disableEventStream: true,
    });
    const container = await createContainer(config);
    await warmUp(container);
    return createApp(container, { webDist: 'apps/web/dist' });
  })().catch((err) => {
    handler = undefined; // let the next request retry instead of caching the failure
    throw err;
  });
  return handler;
}

const EVENT_STREAMING_UNAVAILABLE = {
  error: { code: 'NOT_SUPPORTED', message: 'Live event streaming is unavailable in this serverless deployment. Refresh the page to load current data.' },
};

/** Serverless function handlers answer `/api/events` directly: SSE needs a long-lived request. */
export function sendUnsupportedEvents(res: { setHeader(name: string, value: string): void; status(code: number): { json(body: unknown): void } }) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(501).json(EVENT_STREAMING_UNAVAILABLE);
}

export function isEventsRequest(url: string | undefined) {
  return url === '/api/events' || url?.startsWith('/api/events?') === true;
}