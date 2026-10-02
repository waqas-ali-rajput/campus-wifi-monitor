import { Router } from 'express';
import os from 'node:os';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  analyticsQuerySchema,
  changePasswordSchema,
  classifySchema,
  complaintCreateSchema,
  complaintQuerySchema,
  createUserSchema,
  locationCreateSchema,
  locationPatchSchema,
  locationQuerySchema,
  loginSchema,
  maintenanceSchema,
  noteSchema,
  patchUserSchema,
  registerSchema,
  submitFailureSchema,
  submitTestSchema,
  internetTestSchema,
  testsQuerySchema,
  transitionSchema,
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_STATUS_LABELS,
  STATUS_LABELS,
} from '@campus/shared';
import type { Container } from '../container';
import { COOKIE, h, makeLimiter, parse, requireAuth, requirePermission as can } from './middleware';
import { AppError } from '../shared/errors';
import { toCsv } from './csv';

/** Mounts every module router under /api. Public routes first; everything after `requireAuth` is default-deny. */
export function apiRouter(c: Container): Router {
  const api = Router();
  const S = c.services;
  const rl = c.config.rateLimit;
  const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: c.config.production, maxAge: 8 * 3600 * 1000, path: '/' };

  // ---------- public ----------
  api.get('/health', (_req, res) => res.json({ status: 'ok', time: c.clock.now().toISOString() }));
  const loginLimiter = makeLimiter(rl, { windowMs: 60000, limit: 10, message: 'Too many sign-in attempts. Wait a minute and try again.' });
  api.post('/auth/login', loginLimiter, h((req, res) => {
    const b = parse(loginSchema, req.body);
    const out = S.auth.login(b.email, b.password);
    res.cookie(COOKIE, out.token, cookieOpts).json({ user: out.user });
  }));
  const registerLimiter = makeLimiter(rl, { windowMs: 3600000, limit: 5, message: 'Too many account registrations. Try again later.' });
  api.post('/auth/register', registerLimiter, h((req, res) => {
    const b = parse(registerSchema, req.body);
    const out = S.auth.register(b);
    res.status(201).cookie(COOKIE, out.token, cookieOpts).json({ user: out.user });
  }));
  // Public session probe: 200 with { user: null } when signed out (avoids a 401 on first page load).
  api.get('/auth/session', (req, res) => {
    const payload = req.cookies?.[COOKIE] ? c.jwt.verify(req.cookies[COOKIE]) : null;
    const u = payload ? c.repos.users.publicById(payload.sub) : undefined;
    res.json({ user: u && u.account_status === 'active' ? { user_id: u.user_id, name: u.name, email: u.email, role: u.role } : null });
  });
  api.post('/auth/logout', (_req, res) => res.clearCookie(COOKIE, cookieOpts).json({ ok: true }));

  // ---------- everything below requires a session ----------
  api.use(requireAuth(c.jwt, c.repos.users));

  api.get('/auth/me', (req, res) => res.json({ user: req.user }));
  api.post('/auth/change-password', h((req, res) => {
    const b = parse(changePasswordSchema, req.body);
    S.auth.changePassword(req.user!.user_id, b.oldPassword, b.newPassword);
    res.json({ ok: true });
  }));
  api.get('/config', (_req, res) =>
    res.json({ speedtestQuick: c.config.speedtestQuick, tz: c.tz, llm: c.llm.enabled, production: c.config.production, disableEventStream: c.config.disableEventStream }),
  );

  // ---------- locations ----------
  api.get('/locations', can('status.view'), h((req, res) => {
    res.json({ items: S.locations.list(parse(locationQuerySchema, req.query)), buildings: c.repos.locations.buildings() });
  }));
  api.get('/locations/:id', can('status.view'), h((req, res) => {
    const loc = S.locations.get(req.params.id!);
    const staff = req.user!.role !== 'user';
    res.json({
      location: loc,
      ...S.analytics.locationSeries(loc.location_id),
      latest_tests: c.repos.tests.list({ location_id: loc.location_id, page: 1, pageSize: staff ? 15 : 5 }).items,
      ...(staff
        ? {
            open_complaints: c.repos.complaints.list({ location_id: loc.location_id, status: 'open', page: 1, pageSize: 20 }).items,
            outages: c.repos.outages.list(undefined, 200).filter((o) => o.location_id === loc.location_id).slice(0, 10),
            maintenance: S.maintenance.list(loc.location_id),
            insights: S.insights.list(loc.location_id),
          }
        : {}),
    });
  }));
  api.post('/locations', can('locations.manage'), h((req, res) => {
    res.status(201).json(S.locations.create(parse(locationCreateSchema, req.body), req.user!.user_id));
  }));
  api.patch('/locations/:id', can('locations.manage'), h((req, res) => {
    res.json(S.locations.update(req.params.id!, parse(locationPatchSchema, req.body), req.user!.user_id));
  }));
  api.delete('/locations/:id', can('locations.manage'), h((req, res) => {
    S.locations.remove(req.params.id!, req.user!.user_id);
    res.json({ ok: true });
  }));

  // ---------- test results ----------
  const testLimiter = makeLimiter(rl, { windowMs: 15000, limit: 1, byUser: true, message: 'Please wait 15 seconds between speed tests.' });
  api.post('/tests', can('tests.run'), testLimiter, h((req, res) => {
    res.status(201).json(S.tests.submit(req.user!.user_id, parse(submitTestSchema, req.body)));
  }));
  const internetTestLimiter = makeLimiter(rl, { windowMs: 60000, limit: 1, byUser: true, message: 'Please wait 60 seconds between internet speed tests.' });
  api.post('/internet-tests', can('tests.run'), internetTestLimiter, h((req, res) => {
    res.status(201).json(S.internetTests.submit(req.user!.user_id, parse(internetTestSchema, req.body)));
  }));
  api.get('/internet-tests', can('tests.run'), h((req, res) => {
    const limit = z.coerce.number().int().min(1).max(100).default(10).parse(req.query.limit);
    res.json({ items: S.internetTests.list(req.user!.user_id, limit) });
  }));
  api.post('/tests/failures', can('tests.run'), h((req, res) => {
    res.status(201).json(S.tests.recordFailure(req.user!.user_id, parse(submitFailureSchema, req.body)));
  }));
  api.get('/tests', can('tests.run'), h((req, res) => {
    const q = parse(testsQuerySchema, req.query);
    res.json(S.tests.list(req.user!, { ...q, from: iso(q.from), to: iso(q.to) }));
  }));
  api.get('/tests/:id', can('tests.run'), h((req, res) => res.json(S.tests.get(req.user!, req.params.id!))));

  // ---------- complaints ----------
  api.post('/complaints/classify', can('complaints.create'), h((req, res) => {
    res.json(S.complaints.classify(parse(classifySchema, req.body).description));
  }));
  api.get('/complaints/attachable', can('complaints.create'), h((req, res) => {
    res.json({ test: S.complaints.latestAttachable(req.user!.user_id, String(req.query.location_id ?? '')) });
  }));
  const complaintLimiter = makeLimiter(rl, { windowMs: 3600000, limit: 10, byUser: true, message: 'You can submit up to 10 complaints per hour.' });
  api.post('/complaints', can('complaints.create'), complaintLimiter, h((req, res) => {
    res.status(201).json(S.complaints.create(req.user!, parse(complaintCreateSchema, req.body)));
  }));
  api.get('/complaints', can('complaints.create'), h((req, res) => {
    const q = parse(complaintQuerySchema, req.query);
    res.json(S.complaints.list(req.user!, { ...q, from: iso(q.from), to: iso(q.to) }));
  }));
  api.get('/complaints/:id', can('complaints.create'), h((req, res) => res.json(S.complaints.detail(req.user!, req.params.id!))));
  api.post('/complaints/:id/transition', can('complaints.transition'), h((req, res) => {
    res.json(S.complaints.transition(req.user!, req.params.id!, parse(transitionSchema, req.body)));
  }));
  api.post('/complaints/:id/notes', can('complaints.note'), h((req, res) => {
    res.json(S.complaints.addNote(req.user!, req.params.id!, parse(noteSchema, req.body).note));
  }));

  // ---------- outages & maintenance ----------
  api.get('/outages', can('status.view'), h((req, res) => {
    const status = z.enum(['active', 'resolved']).optional().parse(req.query.status || undefined);
    res.json({ items: S.outages.list(status, req.user!.role) });
  }));
  api.post('/outages/:id/resolve', can('outages.resolve'), h((req, res) => res.json(S.outages.resolveManually(req.params.id!, req.user!.user_id))));
  api.get('/maintenance', can('status.view'), h((req, res) => res.json({ items: S.maintenance.list(req.query.location_id as string | undefined) })));
  api.post('/maintenance', can('maintenance.manage'), h((req, res) => {
    res.status(201).json(S.maintenance.create(parse(maintenanceSchema, req.body), req.user!.user_id));
  }));
  api.patch('/maintenance/:id', can('maintenance.manage'), h((req, res) => {
    res.json(S.maintenance.update(req.params.id!, req.body ?? {}, req.user!.user_id, req.user!.role));
  }));
  api.delete('/maintenance/:id', can('maintenance.manage'), h((req, res) => {
    S.maintenance.remove(req.params.id!, req.user!.user_id, req.user!.role);
    res.json({ ok: true });
  }));

  // ---------- dashboards ----------
  api.get('/dashboard/campus-status', can('status.view'), h((_req, res) => res.json(S.analytics.campusStatus())));
  api.get('/dashboard/heatmap', can('status.view'), h((_req, res) => res.json({ items: S.analytics.heatmap() })));
  api.get('/dashboard/summary', can('dashboard.view'), h((_req, res) => res.json(S.analytics.summary())));

  // ---------- analytics ----------
  const range = (q: unknown) => S.analytics.range(parse(analyticsQuerySchema, q));
  api.get('/analytics/by-location', can('analytics.view'), h((req, res) => res.json({ items: S.analytics.byLocation(range(req.query)) })));
  api.get('/analytics/by-hour', can('analytics.view'), h((req, res) => res.json({ items: S.analytics.byHour(range(req.query)) })));
  api.get('/analytics/by-day', can('analytics.view'), h((req, res) => res.json({ items: S.analytics.byDay(range(req.query)) })));
  api.get('/analytics/peak-periods', can('analytics.view'), h((req, res) => res.json(S.analytics.peakPeriods(range(req.query)))));
  api.get('/analytics/complaints-by-building', can('analytics.view'), h((req, res) => res.json(S.analytics.complaintsByBuilding(range(req.query)))));
  api.get('/analytics/problem-locations', can('analytics.view'), h((_req, res) => res.json({ items: S.insights.recommendations() })));
  api.get('/analytics/trends', can('analytics.view'), h((req, res) => {
    const q = parse(analyticsQuerySchema, req.query);
    res.json(S.analytics.trends(q.location_id, q.days ?? 14));
  }));
  api.get('/analytics/compare-buildings', can('analytics.compare'), h((req, res) => res.json({ items: S.analytics.compareBuildings(range(req.query)) })));
  api.get('/analytics/recurring-problems', can('analytics.compare'), h((req, res) => res.json({ items: S.analytics.recurringProblems(range(req.query)) })));
  api.get('/analytics/staff-activity', can('analytics.staffActivity'), h((req, res) => res.json({ items: S.analytics.staffActivity(range(req.query)) })));

  // ---------- insights (AI) ----------
  api.get('/insights', can('insights.view'), h((req, res) => res.json({ items: S.insights.list(req.query.location_id as string | undefined) })));
  api.get('/insights/summary', can('insights.view'), h(async (_req, res) => res.json(await S.insights.summary())));
  api.get('/insights/recommendations', can('insights.view'), h((_req, res) => res.json({ items: S.insights.recommendations() })));
  api.get('/insights/predictions', can('insights.view'), h((req, res) => res.json(S.insights.predictions(req.query.location_id as string | undefined))));

  // ---------- notifications & realtime ----------
  api.get('/notifications', h((req, res) => {
    const unread = req.query.unread === '1';
    const limit = Math.min(100, Number(req.query.limit) || 30);
    const page = Math.max(1, Number(req.query.page) || 1);
    res.json(c.repos.notifications.list(req.user!.user_id, unread, limit, (page - 1) * limit));
  }));
  api.post('/notifications/read-all', h((req, res) => res.json({ updated: c.repos.notifications.markAll(req.user!.user_id) })));
  api.post('/notifications/:id/read', h((req, res) => res.json({ updated: c.repos.notifications.markRead(req.params.id!, req.user!.user_id) })));
  api.get('/events', (req, res) => {
    if (c.config.disableEventStream) {
      res.status(501).json({ error: { code: 'NOT_SUPPORTED', message: 'Live event streaming is unavailable in this demo deployment. Refresh the page to load current data.' } });
      return;
    }
    const remove = c.sse.add(req.user!.user_id, req.user!.role, res);
    req.on('close', remove);
  });

  // ---------- admin ----------
  api.get('/admin/users', can('users.manage'), h((req, res) => {
    res.json({ items: c.repos.users.list({ q: req.query.q as string, role: req.query.role as string }) });
  }));
  api.get('/staff', can('complaints.transition'), h((_req, res) => res.json({ items: c.repos.users.staff() })));
  api.post('/admin/users', can('users.manage'), h((req, res) => {
    res.status(201).json(S.users.create(parse(createUserSchema, req.body), req.user!.user_id));
  }));
  api.patch('/admin/users/:id', can('users.manage'), h((req, res) => {
    res.json(S.users.update(req.params.id!, parse(patchUserSchema, req.body), req.user!.user_id));
  }));
  api.get('/admin/activity-logs', can('activity.view'), h((req, res) => {
    const q = z
      .object({
        actor_id: z.string().optional(),
        entity_type: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);
    res.json(c.repos.activity.list({ ...q, from: iso(q.from), to: iso(q.to) }));
  }));
  api.get('/admin/settings', can('settings.read'), h((_req, res) => res.json(S.settings.list())));
  api.put('/admin/settings/:key', can('settings.write'), h((req, res) => {
    const value = S.settings.update(req.params.key!, req.body, req.user!.user_id);
    c.services.locations.refreshAll();
    res.json({ key: req.params.key, value });
  }));
  api.get('/admin/server-info', can('server.info'), h(async (_req, res) => {
    const urls = lanUrls(c.config.port);
    const qr = await Promise.all(urls.map((u) => QRCode.toDataURL(u, { margin: 1, width: 220 })));
    res.json({ urls: urls.map((u, i) => ({ url: u, qr: qr[i] })), tz: c.tz, sseClients: c.sse.size, llm: c.llm.enabled });
  }));

  // ---------- reports (CSV) ----------
  api.get('/reports/tests.csv', can('reports.view'), h((req, res) => {
    const q = parse(testsQuerySchema, { ...req.query, pageSize: 200 });
    const rows: any[] = [];
    for (let page = 1; page <= 100; page++) {
      const r = c.repos.tests.list({ ...q, from: iso(q.from), to: iso(q.to), page, pageSize: 200 });
      rows.push(...r.items);
      if (r.items.length < 200) break;
    }
    sendCsv(res, 'speed-tests.csv', rows, [
      ['tested_at', 'Tested at (UTC)'], ['location_name', 'Location'], ['building', 'Building'], ['user_name', 'User'],
      ['download_speed', 'Download (Mbps)'], ['upload_speed', 'Upload (Mbps)'], ['ping', 'Ping (ms)'], ['jitter', 'Jitter (ms)'],
      ['packet_loss', 'Packet loss (%)'], ['health_score', 'Health score'], ['health_status', 'Status'],
    ]);
  }));
  api.get('/reports/complaints.csv', can('reports.view'), h((req, res) => {
    const q = parse(complaintQuerySchema, { ...req.query, pageSize: 200 });
    const rows: any[] = [];
    for (let page = 1; page <= 100; page++) {
      const r = c.repos.complaints.list({ ...q, from: iso(q.from), to: iso(q.to), page, pageSize: 200 });
      rows.push(...r.items.map((x) => ({ ...x, complaint_type: COMPLAINT_TYPE_LABELS[x.complaint_type], status: COMPLAINT_STATUS_LABELS[x.status] })));
      if (r.items.length < 200) break;
    }
    sendCsv(res, 'complaints.csv', rows, [
      ['created_at', 'Created (UTC)'], ['location_name', 'Location'], ['building', 'Building'], ['user_name', 'Reporter'],
      ['complaint_type', 'Category'], ['description', 'Description'], ['status', 'Status'], ['assigned_name', 'Assigned to'], ['resolved_at', 'Resolved (UTC)'],
    ]);
  }));
  api.get('/reports/summary.csv', can('reports.view'), h((req, res) => {
    const rows = S.analytics.byLocation(range(req.query)).map((r: any) => ({ ...r, current_status: STATUS_LABELS[r.current_status as keyof typeof STATUS_LABELS] }));
    sendCsv(res, 'location-summary.csv', rows, [
      ['location_name', 'Location'], ['building', 'Building'], ['current_status', 'Current status'], ['current_score', 'Current score'],
      ['tests', 'Tests'], ['avg_download', 'Avg download (Mbps)'], ['avg_upload', 'Avg upload (Mbps)'], ['avg_ping', 'Avg ping (ms)'],
      ['avg_loss', 'Avg loss (%)'], ['avg_score', 'Avg score'], ['complaints', 'Complaints'],
    ]);
  }));

  api.use((_req, _res, next) => next(new AppError('NOT_FOUND', 'API route not found.')));
  return api;
}

const iso = (s?: string) => (s ? new Date(s).toISOString() : undefined);

function sendCsv(res: any, name: string, rows: any[], cols: Array<[string, string]>) {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.send(toCsv(rows, cols));
}

export function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${port}`);
  return out.length ? out : [`http://localhost:${port}`];
}
