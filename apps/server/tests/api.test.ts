import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadConfig } from '../src/config';
import { createContainer, type Container } from '../src/container';
import { createApp } from '../src/http/app';
import { FixedClock } from '../src/shared/time';
import { seed } from '../scripts/seed';

let c: Container;
let app: ReturnType<typeof createApp>;
const clock = new FixedClock(new Date());
const X = { 'X-Requested-With': 'campus-wifi' };

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set(X).send({ email, password: 'Passw0rd!demo' });
  expect(res.status).toBe(200);
  return agent;
}
const loc = (name: string) => c.repos.locations.byName(name)!.location_id;

beforeAll(() => {
  c = createContainer(loadConfig({ dbPath: ':memory:', rateLimit: false, tz: 'Asia/Karachi' }), { clock });
  seed(c, { quiet: true });
  app = createApp(c, { quiet: true, webDist: '/nonexistent' });
});

describe('auth & RBAC', () => {
  it('login ok / bad / suspended', async () => {
    await login('student01@campus.local');
    const bad = await request(app).post('/api/auth/login').set(X).send({ email: 'student01@campus.local', password: 'nope' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('UNAUTHENTICATED');
  });
  it('protects routes (401/403) and enforces CSRF header', async () => {
    expect((await request(app).get('/api/locations')).status).toBe(401);
    const student = await login('student02@campus.local');
    expect((await student.get('/api/dashboard/summary')).status).toBe(403);
    expect((await student.get('/api/admin/users')).status).toBe(403);
    const noHeader = await student.post('/api/complaints/classify').send({ description: 'slow' });
    expect(noHeader.status).toBe(403);
  });
  it('excludes synthetic seed tests from a user’s personal history', async () => {
    const student = await login('student01@campus.local');
    const id = c.repos.users.byEmail('student01@campus.local')!.user_id;
    expect((await student.get('/api/tests?pageSize=200')).body.items).toHaveLength(0);
    expect(c.repos.tests.list({ user_id: id, page: 1, pageSize: 200 }).total).toBe(0);
  });
  it('protects the last admin and suspends accounts', async () => {
    const admin = await login('admin@campus.local');
    const me = (await admin.get('/api/auth/me')).body.user;
    expect((await admin.patch(`/api/admin/users/${me.user_id}`).set(X).send({ role: 'user' })).status).toBe(403);
    const created = await admin.post('/api/admin/users').set(X).send({ name: 'New Tech', email: 'tech3@campus.local', password: 'Passw0rd!x', role: 'it_staff' });
    expect(created.status).toBe(201);
    await admin.patch(`/api/admin/users/${created.body.user_id}`).set(X).send({ account_status: 'suspended' }).expect(200);
    const s = await request(app).post('/api/auth/login').set(X).send({ email: 'tech3@campus.local', password: 'Passw0rd!x' });
    expect(s.status).toBe(403);
  });
});

describe('location coordinates', () => {
  it('allows OSM map tiles while retaining a usable Referer policy', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['content-security-policy']).toContain('https://tile.openstreetmap.org');
    expect(response.headers['referrer-policy']).toBe('origin-when-cross-origin');
  });

  it('stores exact verified coordinates and rejects invalid or partial pairs', async () => {
    const admin = await login('admin@campus.local');
    const locationId = loc('Computer Lab 1');
    await admin.patch(`/api/locations/${locationId}`).set(X).send({ latitude: 25.408123, longitude: 68.260345 }).expect(200);
    expect(c.services.locations.get(locationId)).toMatchObject({ latitude: 25.408123, longitude: 68.260345 });
    await admin.patch(`/api/locations/${locationId}`).set(X).send({ latitude: null }).expect(400);
    await admin.patch(`/api/locations/${locationId}`).set(X).send({ latitude: 91, longitude: 68 }).expect(400);
    await admin.patch(`/api/locations/${locationId}`).set(X).send({ latitude: -90, longitude: 180 }).expect(200);
    expect(c.services.locations.get(locationId)).toMatchObject({ latitude: -90, longitude: 180 });
  });
});

describe('speed test probes', () => {
  it('download returns exactly N uncompressed bytes; upload counts bytes; ping 204', async () => {
    const a = await login('student03@campus.local');
    const d = await a.get('/api/speedtest/download?bytes=1048576').buffer(true).parse((res, cb) => {
      let n = 0;
      res.on('data', (ch: Buffer) => (n += ch.length));
      res.on('end', () => cb(null, n));
    });
    expect(d.body).toBe(1048576);
    expect(d.headers['content-encoding']).toBe('identity');
    const u = await a.post('/api/speedtest/upload').set(X).set('Content-Type', 'application/octet-stream').send(Buffer.alloc(300000));
    expect(u.body.received).toBe(300000);
    expect((await a.get('/api/speedtest/ping')).status).toBe(204);
  });

  it('rejects a state-changing upload without the CSRF header', async () => {
    const a = await login('student03@campus.local');
    const res = await a.post('/api/speedtest/upload').set('Content-Type', 'application/octet-stream').send(Buffer.alloc(1024));
    expect(res.status).toBe(403);
  });
});

describe('off-campus internet tests', () => {
  it('stores provider measurements as personal MUET-context data without affecting campus health', async () => {
    const a = await login('student08@campus.local');
    const locationId = loc('Computer Lab 1');
    const beforeTests = (await a.get('/api/tests?pageSize=1')).body.total;
    const beforeHealth = c.repos.locations.byId(locationId)!.current_score;
    const result = await a.post('/api/internet-tests').set(X).send({
      provider: 'cloudflare', download_mbps: 85.75, upload_mbps: 17.5, ping_ms: 42.25, jitter_ms: 3.1,
    }).expect(201);
    expect(result.body).toMatchObject({ provider: 'cloudflare', campus_name: 'Mehran University of Engineering & Technology', scope: 'off_campus' });
    expect(result.body).not.toHaveProperty('location_id');
    expect((await a.get('/api/internet-tests')).body.items[0].test_id).toBe(result.body.test_id);
    expect((await a.get('/api/tests?pageSize=1')).body.total).toBe(beforeTests);
    expect(c.repos.locations.byId(locationId)!.current_score).toBe(beforeHealth);
  });

  it('rejects invalid provider data and isolates internet-test history by account', async () => {
    const a = await login('student09@campus.local');
    const b = await login('student10@campus.local');
    await a.post('/api/internet-tests').set(X).send({ provider: 'unknown', download_mbps: 20, upload_mbps: 4, ping_ms: 30, jitter_ms: 1 }).expect(400);
    await a.post('/api/internet-tests').set(X).send({ provider: 'cloudflare', download_mbps: 20, upload_mbps: 4, ping_ms: 30, jitter_ms: 1 }).expect(201);
    expect((await b.get('/api/internet-tests')).body.items).toHaveLength(0);
  });
});

describe('test ingestion pipeline', () => {
  it('scores the brief examples and rejects failed results', async () => {
    const a = await login('student04@campus.local');
    const good = await a.post('/api/tests').set(X).send({ location_id: loc('Computer Lab 2'), download_mbps: 36, upload_mbps: 14, ping_ms: 28, packet_loss_pct: 1 });
    expect(good.status).toBe(201);
    expect(good.body.health_status).toBe('good');
    const b = await login('student05@campus.local');
    const poor = await b.post('/api/tests').set(X).send({ location_id: loc('Library Floor 2'), download_mbps: 5.2, upload_mbps: 1.8, ping_ms: 190, packet_loss_pct: 10 });
    expect(['poor', 'critical']).toContain(poor.body.health_status);
    const zero = await b.post('/api/tests').set(X).send({ location_id: loc('Library Floor 2'), download_mbps: 0, upload_mbps: 0, ping_ms: 20 });
    expect(zero.status).toBe(400);
    const before = (await a.get('/api/tests?pageSize=1')).body.total;
    const f = await a.post('/api/tests/failures').set(X).send({ location_id: loc('Cafeteria'), reason: 'unreachable' });
    expect(f.status).toBe(201);
    expect((await a.get('/api/tests?pageSize=1')).body.total).toBe(before);
  });
});

describe('complaints workflow', () => {
  it('runs submitted → resolved with the right roles', async () => {
    const s = await login('student06@campus.local');
    const t = await s.post('/api/tests').set(X).send({ location_id: loc('Computer Lab 3'), download_mbps: 12, upload_mbps: 4, ping_ms: 80, packet_loss_pct: 2 });
    const created = await s.post('/api/complaints').set(X).send({ location_id: loc('Computer Lab 3'), complaint_type: 'other', description: 'Wi-Fi disconnects every few minutes in Lab 3', related_test_id: t.body.test_id });
    expect(created.status).toBe(201);
    expect(created.body.ai_category).toBe('frequent_disconnection');
    const id = created.body.complaint_id;
    const other = await login('student07@campus.local');
    expect((await other.get(`/api/complaints/${id}`)).status).toBe(403);
    expect((await other.post('/api/complaints').set(X).send({ location_id: loc('Computer Lab 3'), complaint_type: 'slow_internet', description: 'slow here', related_test_id: t.body.test_id })).status).toBe(400);

    const it2 = await login('it2@campus.local');
    expect((await it2.post(`/api/complaints/${id}/transition`).set(X).send({ to: 'assigned' })).status).toBe(409);
    await it2.post(`/api/complaints/${id}/transition`).set(X).send({ to: 'reviewed' }).expect(200);
    const it1user = c.repos.users.byEmail('it1@campus.local')!;
    await it2.post(`/api/complaints/${id}/transition`).set(X).send({ to: 'assigned', assigned_staff: it1user.user_id }).expect(200);
    expect((await it2.post(`/api/complaints/${id}/transition`).set(X).send({ to: 'in_progress' })).status).toBe(403);
    const it1 = await login('it1@campus.local');
    await it1.post(`/api/complaints/${id}/transition`).set(X).send({ to: 'in_progress', note: 'Checking AP' }).expect(200);
    await it1.post(`/api/complaints/${id}/notes`).set(X).send({ note: 'Channel changed' }).expect(200);
    const done = await it1.post(`/api/complaints/${id}/transition`).set(X).send({ to: 'resolved' });
    expect(done.body.status).toBe('resolved');
    expect(done.body.events.length).toBeGreaterThanOrEqual(6);
    const notes = (await s.get('/api/notifications')).body.items.map((n: any) => n.type);
    expect(notes).toContain('complaint_resolved');
    expect((await s.post(`/api/complaints/${id}/transition`).set(X).send({ to: 'resolved' })).status).toBe(403);
  });
});

describe('outages', () => {
  it('3 users × same category in 30 min → exactly one outage; recovery after good tests', async () => {
    const id = loc('Administration Block');
    for (const n of ['08', '09', '10', '11']) {
      const a = await login(`student${n}@campus.local`);
      await a.post('/api/complaints').set(X).send({ location_id: id, complaint_type: 'no_internet', description: 'No internet at all here' }).expect(201);
    }
    const active = c.repos.outages.list('active').filter((o) => o.location_id === id);
    expect(active).toHaveLength(1);
    expect(active[0]!.message).toBe('Possible Wi-Fi outage detected in Administration.');
    for (const n of ['01', '02']) {
      clock.advance(20000);
      const a = await login(`student${n}@campus.local`);
      await a.post('/api/tests').set(X).send({ location_id: id, download_mbps: 40, upload_mbps: 18, ping_ms: 22, packet_loss_pct: 0 }).expect(201);
    }
    expect(c.repos.outages.activeFor(id)).toBeUndefined();
  });
  it('maintenance suppresses new outages', async () => {
    const it1 = await login('it1@campus.local');
    const id = loc('Department Building');
    const now = clock.now();
    await it1.post('/api/maintenance').set(X).send({ location_id: id, title: 'Switch replacement', starts_at: new Date(now.getTime() - 60000).toISOString(), ends_at: new Date(now.getTime() + 3600000).toISOString() }).expect(201);
    for (const n of ['03', '04', '05']) {
      const a = await login(`student${n}@campus.local`);
      await a.post('/api/complaints').set(X).send({ location_id: id, complaint_type: 'no_internet', description: 'No internet at all here' }).expect(201);
    }
    expect(c.repos.outages.activeFor(id)).toBeUndefined();
  });
});

describe('dashboard, analytics, insights, reports', () => {
  it('serves KPIs and analytics', async () => {
    const m = await login('manager@campus.local');
    const s = (await m.get('/api/dashboard/summary')).body;
    expect(s.testsToday).toBeGreaterThan(0);
    expect(s.openComplaints).toBeGreaterThan(0);
    for (const p of ['by-location', 'by-hour', 'by-day', 'complaints-by-building', 'problem-locations', 'trends', 'compare-buildings', 'recurring-problems', 'staff-activity', 'peak-periods'])
      expect((await m.get(`/api/analytics/${p}`)).status).toBe(200);
    const csv = await m.get('/api/reports/tests.csv');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const it1 = await login('it1@campus.local');
    expect((await it1.get('/api/analytics/staff-activity')).status).toBe(403);
  });
  it('produces the brief’s AI outputs on seeded data', async () => {
    const m = await login('it1@campus.local');
    const rec = (await m.get('/api/insights/recommendations')).body.items;
    expect(rec[0].locationName).toBe('Library Floor 2');
    const sum = (await m.get('/api/insights/summary')).body;
    expect(sum.sentences.join(' ')).toMatch(/Library Floor 2 experienced .* between 12 PM and 2 PM/);
    const ins = (await m.get('/api/insights')).body.items.map((i: any) => i.message);
    expect(ins).toContain('Possible network problem detected in Library Floor 2.');
    const pred = (await m.get('/api/insights/predictions')).body;
    expect(pred.campus.rows).toHaveLength(24);
  });
  it('anomaly fires for a very low test at a normally good location', async () => {
    const a = await login('student12@campus.local');
    clock.advance(20000);
    const r = await a.post('/api/tests').set(X).send({ location_id: loc('Computer Lab 1'), download_mbps: 3, upload_mbps: 1, ping_ms: 30, packet_loss_pct: 0.5 });
    expect(r.body.new_insights.join(' ')).toMatch(/below its usual/);
  });
});
