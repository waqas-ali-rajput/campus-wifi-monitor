import { Router } from 'express';
import { randomBytes } from 'node:crypto';

const MiB = 1024 * 1024;
const CHUNK = randomBytes(MiB); // incompressible, generated once and reused

/** §5.1 probe endpoints. Mounted before body parsers and excluded from compression. */
export function speedtestRouter(): Router {
  const r = Router();
  r.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    next();
  });

  r.get('/ping', (_req, res) => {
    res.status(204).end();
  });

  r.get('/download', (req, res) => {
    const n = Math.max(1024, Math.min(32 * MiB, Number(req.query.bytes) || 8 * MiB));
    res.status(200);
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Length': String(n), 'Content-Encoding': 'identity' });
    let sent = 0;
    let closed = false;
    req.on('close', () => (closed = true));
    const pump = () => {
      while (sent < n && !closed) {
        const size = Math.min(CHUNK.length, n - sent);
        const ok = res.write(size === CHUNK.length ? CHUNK : CHUNK.subarray(0, size));
        sent += size;
        if (!ok) {
          res.once('drain', pump);
          return;
        }
      }
      if (!closed) res.end();
    };
    pump();
  });

  r.post('/upload', (req, res) => {
    let received = 0;
    const LIMIT = 64 * MiB;
    req.on('data', (c: Buffer) => {
      received += c.length;
      if (received > LIMIT) req.destroy();
    });
    req.on('end', () => res.json({ received }));
    req.on('error', () => res.status(400).end());
  });
  return r;
}
