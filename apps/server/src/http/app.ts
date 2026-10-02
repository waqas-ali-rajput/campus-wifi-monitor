import express, { type Express } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Container } from '../container';
import { errorHandler, makeLimiter, requireAuth, requireCsrfHeader } from './middleware';
import { apiRouter } from './routes';
import { speedtestRouter } from '../modules/speedtest/http/speedtest.routes';
import { ROOT } from '../config';

/** Express app factory (also used by integration tests). */
export function createApp(c: Container, opts: { webDist?: string; quiet?: boolean } = {}): Express {
  const app = express();
  const log = pino({ level: opts.quiet ? 'silent' : c.config.logLevel });
  app.disable('x-powered-by');
  app.set('trust proxy', c.config.trustProxyHops);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'https://tile.openstreetmap.org'],
          'connect-src': ["'self'", 'https://speed.cloudflare.com'],
          'upgrade-insecure-requests': null, // the app is served over plain HTTP on the LAN
        },
      },
      referrerPolicy: { policy: 'origin-when-cross-origin' },
      hsts: false,
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
    }),
  );
  if (!c.config.production) app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
  app.use(
    compression({
      filter: (req, res) => !/^\/api\/(speedtest|events)/.test(req.originalUrl) && compression.filter(req, res),
    }),
  );
  app.use(
    pinoHttp({
      logger: log,
      autoLogging: { ignore: (req) => !!req.url?.startsWith('/api/speedtest') || !!req.url?.startsWith('/api/events') },
    }),
  );
  app.use(cookieParser());

  // Speed-test probes: authenticated, before any body parser, never compressed
  const probeLimiter = makeLimiter(c.config.rateLimit, { windowMs: 60000, limit: 900, byUser: true, message: 'Too many speed-test requests.' });
  app.use('/api/speedtest', requireAuth(c.jwt, c.repos.users), probeLimiter, requireCsrfHeader, speedtestRouter());

  app.use(express.json({ limit: '100kb' }));
  app.use('/api', requireCsrfHeader, apiRouter(c));
  app.use('/api', errorHandler(log));

  const dist = opts.webDist ?? path.join(ROOT, 'apps/web/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (_req, res) =>
      res.type('text').send('The web app is not built yet. Run "npm run build" (or "npm run dev" and open http://localhost:5173).'),
    );
  }
  app.use(errorHandler(log));
  return app;
}
