import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { hasPermission, type Permission, type Role } from '@campus/shared';
import { AppError } from '../../shared/errors';
import type { JwtService } from '../../infrastructure/security/security';
import type { UserRepo } from '../../modules/users/infrastructure/UserRepo';

export const COOKIE = 'cw_session';

export interface AuthedUser {
  user_id: string;
  name: string;
  email: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthedUser;
  }
}

/** Wrap async/sync handlers so thrown errors reach the central error handler. */
export const h =
  (fn: (req: Request, res: Response) => unknown): RequestHandler =>
  (req, res, next) => {
    try {
      const out = fn(req, res);
      if (out instanceof Promise) out.catch(next);
    } catch (e) {
      next(e);
    }
  };

export function requireAuth(jwt: JwtService, users: UserRepo): RequestHandler {
  return (req, _res, next) => {
    const token = req.cookies?.[COOKIE];
    const payload = token ? jwt.verify(token) : null;
    if (!payload) return next(new AppError('UNAUTHENTICATED', 'Please sign in to continue.'));
    const u = users.byId(payload.sub);
    if (!u) return next(new AppError('UNAUTHENTICATED', 'Please sign in to continue.'));
    if (u.account_status !== 'active') return next(new AppError('FORBIDDEN', 'This account is suspended.'));
    req.user = { user_id: u.user_id, name: u.name, email: u.email, role: u.role };
    next();
  };
}

/** RBAC (§7.2): role → capability table lives in @campus/shared ROLE_PERMISSIONS. */
export const requirePermission =
  (...perms: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError('UNAUTHENTICATED', 'Please sign in to continue.'));
    if (!perms.every((p) => hasPermission(req.user!.role, p))) return next(new AppError('FORBIDDEN', 'You do not have permission to do this.'));
    next();
  };

/** Simple CSRF defence on top of SameSite=Lax: state-changing requests must carry this header. */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'campus-wifi')
    return next(new AppError('FORBIDDEN', 'Missing X-Requested-With header.'));
  next();
};

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export function makeLimiter(enabled: boolean, opts: { windowMs: number; limit: number; byUser?: boolean; message: string }): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => (opts.byUser && req.user ? `u:${req.user.user_id}` : `ip:${req.ip}`),
    handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', opts.message)),
    validate: false,
  });
}

export function errorHandler(log: { error: (o: unknown, m?: string) => void }) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      const flat = err.flatten();
      const details: Record<string, string[]> = { ...(flat.fieldErrors as Record<string, string[]>) };
      if (flat.formErrors.length) details._ = flat.formErrors;
      const first = Object.values(details)[0]?.[0] ?? 'Invalid input';
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: first, details } });
    }
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if ((err as any)?.type === 'entity.parse.failed')
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body.' } });
    const requestId = (req as any).id ?? Math.random().toString(36).slice(2);
    log.error({ err, requestId }, 'Unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: `Something went wrong on the server (request ${requestId}).` } });
  };
}
