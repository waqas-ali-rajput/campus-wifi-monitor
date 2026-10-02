/**
 * Demo data seeder (§12). Everything created here is flagged is_seed = 1 (tests, complaints).
 * Scores are computed with the real domain function (computeHealth) — never hard-coded.
 * Usage: npm run seed                (refuses if users already exist)
 *        npm run seed -- --force     (wipes all data first)
 *        npm run seed -- --accounts  (skip user creation; add demo history to existing accounts)
 *
 * On a real deployment, create the demo accounts first with `npm run bootstrap-admin`,
 * then run `npm run seed -- --accounts` to fill the dashboards without shipping the
 * publicly known demo password.
 */
import { classifyComplaint, computeHealth, type ComplaintStatus, type ComplaintType } from '@campus/shared';
import { loadConfig } from '../src/config';
import { createContainer, type Container } from '../src/container';
import { hashPassword } from '../src/infrastructure/security/security';
import { localParts } from '../src/shared/time';
import { COMPLAINT_TEXT, PROFILES, STUDENT_NAMES, rng, sampleMetrics } from './profiles';

const PASSWORD = 'Passw0rd!demo';
const r = rng();
const uuid = () => crypto.randomUUID();

export function seed(c: Container, opts: { force?: boolean; quiet?: boolean; accounts?: boolean } = {}) {
  const db = c.db;
  const userCount = (db.prepare('SELECT COUNT(*) n FROM users').get() as any).n;
  if (opts.accounts) {
    if (userCount === 0) {
      if (!opts.quiet) console.error('Seed stopped: no users exist. Run "npm run bootstrap-admin" (or "npm run seed") first.');
      return false;
    }
  } else if (userCount > 0 && !opts.force) {
    if (!opts.quiet) console.log('Seed skipped: users already exist. Use "npm run seed -- --force", "npm run seed -- --accounts", or "npm run reset" to start over.');
    return false;
  }
  const now = c.clock.now();
  const nowIso = now.toISOString();
  const tz = c.tz;
  const hourOf = (d: Date) => localParts(d, tz).hour;

  db.transaction(() => {
    if (opts.force) {
      for (const t of ['complaint_events', 'notifications', 'insights', 'activity_logs', 'complaints', 'test_failures', 'speed_tests', 'outages', 'maintenance_windows', 'locations', 'users'])
        db.prepare(`DELETE FROM ${t}`).run();
    }

    // ---- users (§12.1) ----
    // With --accounts the demo accounts already exist (bootstrap-admin), so reuse them.
    const hash = hashPassword(PASSWORD);
    const addUser = (id: string, name: string, email: string, role: string) => {
      if (opts.accounts && c.repos.users.byId(id)) return;
      db.prepare('INSERT INTO users(user_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)').run(id, name, email, hash, role, new Date(now.getTime() - 30 * 864e5).toISOString());
    };
    addUser('u-admin', 'Imran Qureshi', 'admin@campus.local', 'admin');
    addUser('u-manager', 'Nadia Hussain', 'manager@campus.local', 'manager');
    addUser('u-it1', 'Kamran Javed', 'it1@campus.local', 'it_staff');
    addUser('u-it2', 'Saima Akhtar', 'it2@campus.local', 'it_staff');
    const students = STUDENT_NAMES.map((name, i) => {
      const id = `u-student${String(i + 1).padStart(2, '0')}`;
      addUser(id, name, `student${String(i + 1).padStart(2, '0')}@campus.local`, 'user');
      return id;
    });

    // ---- locations (§12.2) ----
    const locId = new Map<string, string>();
    for (const p of PROFILES) {
      const id = 'loc-' + p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      locId.set(p.name, id);
      if (opts.accounts && c.repos.locations.byId(id)) continue;
      c.repos.locations.insert({
        location_id: id, location_name: p.name, building: p.building, floor: p.floor, description: p.description,
        map_x: p.map[0], map_y: p.map[1], latitude: null, longitude: null, created_at: new Date(now.getTime() - 30 * 864e5).toISOString(),
      });
    }

    // ---- 14 days of speed tests (§12.3) ----
    const tests: Array<{ id: string; user: string; loc: string; at: string; status: string }> = [];
    const insertTest = (p: (typeof PROFILES)[number], at: Date, user: string, extra?: Parameters<typeof sampleMetrics>[3]) => {
      const m = sampleMetrics(p, hourOf(at), r, extra);
      const h = computeHealth({ downloadMbps: m.download_mbps, uploadMbps: m.upload_mbps, pingMs: m.ping_ms, lossPct: m.packet_loss_pct }, {}, c.services.settings.health());
      const id = uuid();
      c.repos.tests.insert({
        test_id: id, user_id: user, location_id: locId.get(p.name)!, download_speed: m.download_mbps, upload_speed: m.upload_mbps,
        ping: m.ping_ms, jitter: m.jitter_ms, packet_loss: m.packet_loss_pct, base_score: h.baseScore, health_score: h.healthScore,
        health_status: h.status, during_maintenance: 0, is_seed: 1, client_meta: '{"seed":true}', tested_at: at.toISOString(),
      });
      tests.push({ id, user, loc: p.name, at: at.toISOString(), status: h.status });
    };
    const startHour = new Date(now.getTime() - 14 * 864e5);
    startHour.setUTCMinutes(0, 0, 0);
    const recentCutoff = now.getTime() - 100 * 60000; // the last 100 min are filled by the "current activity" block
    for (let t = startHour.getTime(); t < recentCutoff; t += 3600000) {
      const hour = hourOf(new Date(t));
      const daysBack = (now.getTime() - t) / 864e5;
      for (const p of PROFILES) {
        let n = r.poisson(p.popularity * p.hourWeight(hour) * 1.25);
        // guarantee enough samples for the brief's recurring windows in the last week
        if (daysBack < 7 && p.name === 'Library Floor 2' && hour >= 12 && hour < 14) n = Math.max(n, 4);
        if (daysBack < 7 && p.name === 'Hostel Block' && hour >= 19 && hour <= 23) n = Math.max(n, 3);
        for (let k = 0; k < n; k++) {
          const at = new Date(t + Math.floor(r.next() * 3600000));
          if (at.getTime() >= recentCutoff) continue;
          insertTest(p, at, r.pick(students));
        }
      }
    }
    // current activity: every location has fresh results; Library Floor 2 is degraded right now
    for (const p of PROFILES) {
      const n = p.name === 'Library Floor 2' ? 6 : 2 + Math.floor(r.next() * 3);
      for (let k = 0; k < n; k++) {
        const at = new Date(now.getTime() - (5 + r.next() * 90) * 60000);
        if (p.name === 'Library Floor 2') {
          const m = sampleMetrics({ ...p, factor: () => ({ down: 0.85, up: 0.85, ping: 1.15, loss: 1.2 }) }, 13, r);
          const h = computeHealth({ downloadMbps: m.download_mbps, uploadMbps: m.upload_mbps, pingMs: m.ping_ms, lossPct: m.packet_loss_pct });
          const id = uuid();
          c.repos.tests.insert({
            test_id: id, user_id: r.pick(students), location_id: locId.get(p.name)!, download_speed: m.download_mbps, upload_speed: m.upload_mbps,
            ping: m.ping_ms, jitter: m.jitter_ms, packet_loss: m.packet_loss_pct, base_score: h.baseScore, health_score: h.healthScore,
            health_status: h.status, during_maintenance: 0, is_seed: 1, client_meta: '{"seed":true}', tested_at: at.toISOString(),
          });
          tests.push({ id, user: students[0]!, loc: p.name, at: at.toISOString(), status: h.status });
        } else insertTest(p, at, r.pick(students));
      }
    }

    // ---- complaints (§12.3): ~60 total, ~18 open ----
    const weights: Array<[string, number, ComplaintType[]]> = [
      ['Library Floor 2', 0.3, ['slow_internet', 'high_ping', 'slow_internet', 'frequent_disconnection']],
      ['Hostel Block', 0.22, ['slow_internet', 'weak_signal', 'no_internet', 'high_ping']],
      ['Computer Lab 3', 0.12, ['frequent_disconnection', 'frequent_disconnection', 'slow_internet']],
      ['Cafeteria', 0.1, ['weak_signal', 'slow_internet']],
      ['Library Floor 1', 0.08, ['slow_internet', 'high_ping']],
      ['Department Building', 0.07, ['website_service_unavailable', 'weak_signal', 'other']],
      ['Computer Lab 2', 0.05, ['website_service_unavailable', 'slow_internet']],
      ['Computer Lab 1', 0.03, ['website_service_unavailable']],
      ['Administration Block', 0.03, ['website_service_unavailable', 'no_internet']],
    ];
    const pickLoc = () => {
      let x = r.next();
      for (const w of weights) if ((x -= w[1]) <= 0) return w;
      return weights[0]!;
    };
    const badHour: Record<string, number[]> = {
      'Library Floor 2': [12, 13], 'Hostel Block': [19, 20, 21, 22], Cafeteria: [13], 'Library Floor 1': [12, 13],
    };
    const staff = ['u-it1', 'u-it2'];
    const ORDER: ComplaintStatus[] = ['submitted', 'reviewed', 'assigned', 'in_progress', 'resolved'];
    const addComplaint = (locName: string, type: ComplaintType, createdAt: Date, finalStatus: ComplaintStatus, user: string, text?: string) => {
      const description = text ?? r.pick(COMPLAINT_TEXT[type]!);
      const ai = classifyComplaint(description);
      const id = uuid();
      const created = createdAt.toISOString();
      const myTest = tests
        .filter((t) => t.user === user && t.loc === locName && t.at <= created && Date.parse(created) - Date.parse(t.at) < 6 * 3600000)
        .at(-1);
      const assignee = r.pick(staff);
      const steps = ORDER.slice(1, ORDER.indexOf(finalStatus) + 1);
      let t = createdAt.getTime();
      const events: Array<{ to: ComplaintStatus; at: string; actor: string; note: string }> = [];
      for (const to of steps) {
        t += (15 + r.next() * (to === 'resolved' ? 600 : 120)) * 60000;
        if (t > now.getTime() - 5 * 60000) t = now.getTime() - 5 * 60000;
        const actor = to === 'reviewed' ? r.pick([...staff, 'u-manager']) : to === 'assigned' ? 'u-manager' : assignee;
        const note =
          to === 'assigned' ? `Assigned to ${assignee === 'u-it1' ? 'Kamran Javed' : 'Saima Akhtar'}`
          : to === 'in_progress' ? r.pick(['Checking AP logs and channel utilisation.', 'Under investigation: possible interference on 2.4 GHz.', 'Visiting the location to measure signal.'])
          : to === 'resolved' ? r.pick(['Rebooted the access point and moved it to a cleaner channel.', 'Replaced a faulty PoE switch port.', 'Added a second AP to cover the area.', 'Load-balancing enabled; speeds back to normal.'])
          : '';
        events.push({ to, at: new Date(t).toISOString(), actor, note });
      }
      const last = events.at(-1);
      c.repos.complaints.insert({
        complaint_id: id, user_id: user, location_id: locId.get(locName)!, complaint_type: type, description,
        related_test_id: myTest?.id ?? null, status: finalStatus, assigned_staff: ORDER.indexOf(finalStatus) >= 2 ? assignee : null,
        ai_category: ai.category, ai_confidence: ai.confidence, is_seed: 1, created_at: created, updated_at: last?.at ?? created,
        resolved_at: finalStatus === 'resolved' ? last!.at : null,
      });
      c.repos.complaints.addEvent({ event_id: uuid(), complaint_id: id, actor_id: user, kind: 'created', from_status: null, to_status: 'submitted', note: '', created_at: created });
      let prev: ComplaintStatus = 'submitted';
      for (const e of events) {
        c.repos.complaints.addEvent({ event_id: uuid(), complaint_id: id, actor_id: e.actor, kind: e.to === 'assigned' ? 'assignment' : 'status_change', from_status: prev, to_status: e.to, note: e.note, created_at: e.at });
        c.repos.activity.log(e.actor, `complaint.${e.to}`, 'complaint', id, { from: prev, to: e.to, seed: true }, e.at);
        prev = e.to;
      }
      if (finalStatus === 'resolved' && Date.parse(last!.at) > now.getTime() - 3 * 864e5)
        c.repos.notifications.insert({ notification_id: uuid(), user_id: user, type: 'complaint_resolved', title: `Your complaint at ${locName} was resolved`, body: last!.note, entity_type: 'complaint', entity_id: id, is_read: 0, created_at: last!.at });
      if (finalStatus !== 'resolved' && Date.parse(created) > now.getTime() - 2 * 864e5)
        for (const s of ['u-it1', 'u-it2', 'u-manager'])
          c.repos.notifications.insert({ notification_id: uuid(), user_id: s, type: 'complaint_submitted', title: `New complaint: ${type.replace(/_/g, ' ')} at ${locName}`, body: description.slice(0, 140), entity_type: 'complaint', entity_id: id, is_read: 0, created_at: created });
      return id;
    };
    const atBadHour = (locName: string, daysBack: number) => {
      const hours = badHour[locName] ?? [9, 10, 11, 14, 15, 16];
      const d = new Date(now.getTime() - daysBack * 864e5);
      const lp = localParts(d, tz);
      const target = r.pick(hours);
      return new Date(d.getTime() + (target - lp.hour) * 3600000 + Math.floor(r.next() * 50) * 60000);
    };
    // 42 resolved (older) + 18 open (last ~2.5 days)
    for (let i = 0; i < 42; i++) {
      const [loc, , types] = pickLoc();
      let at = atBadHour(loc, 3 + r.next() * 11);
      if (at.getTime() > now.getTime() - 3 * 864e5) at = new Date(now.getTime() - 3 * 864e5);
      addComplaint(loc, r.pick(types), at, 'resolved', r.pick(students));
    }
    const openStatuses: ComplaintStatus[] = ['submitted', 'submitted', 'submitted', 'submitted', 'submitted', 'reviewed', 'reviewed', 'reviewed', 'reviewed', 'assigned', 'assigned', 'assigned', 'assigned', 'in_progress', 'in_progress', 'in_progress', 'in_progress', 'submitted'];
    openStatuses.forEach((st, i) => {
      const [loc, , types] = i < 6 ? weights[0]! : i < 10 ? weights[1]! : pickLoc();
      let at = atBadHour(loc, r.next() * 2.4);
      if (at.getTime() > now.getTime() - 45 * 60000) at = new Date(now.getTime() - (45 + r.next() * 120) * 60000);
      addComplaint(loc, i === 0 ? 'frequent_disconnection' : r.pick(types), at, st, r.pick(students), i === 0 ? 'Wi-Fi disconnects every few minutes in Lab 3.' : undefined);
    });
    // the brief's own example complaint belongs to Lab 3
    db.prepare(`UPDATE complaints SET location_id = ? WHERE description = 'Wi-Fi disconnects every few minutes in Lab 3.'`).run(locId.get('Computer Lab 3'));

    // ---- a few failures ----
    for (let i = 0; i < 10; i++) {
      const p = r.pick(PROFILES.filter((x) => ['Hostel Block', 'Library Floor 2', 'Cafeteria'].includes(x.name)));
      c.repos.tests.insertFailure({ failure_id: uuid(), user_id: r.pick(students), location_id: locId.get(p.name)!, reason: r.pick(['unreachable', 'timeout', 'download_failed'] as const), detail: 'seed', occurred_at: new Date(now.getTime() - (1.2 + r.next() * 12) * 864e5).toISOString() });
    }

    // ---- one resolved past outage ----
    const oAt = atBadHour('Library Floor 2', 5);
    const oid = uuid();
    c.repos.outages.insert({ outage_id: oid, location_id: locId.get('Library Floor 2')!, cause_rule: 'R1', message: 'Possible Wi-Fi outage detected in Library Block.', complaint_count: 4, failure_count: 0, explanation: '4 users reported No Internet in Library Block in 30 minutes', category: 'no_internet', detected_at: oAt.toISOString() });
    c.repos.outages.resolve(oid, new Date(oAt.getTime() + 95 * 60000).toISOString(), 'u-it1');
    c.repos.activity.log(null, 'outage.detected', 'outage', oid, { rule: 'R1', seed: true }, oAt.toISOString());
    c.repos.activity.log('u-it1', 'outage.resolve', 'outage', oid, { seed: true }, new Date(oAt.getTime() + 95 * 60000).toISOString());

    // ---- one future maintenance window (tomorrow 02:00–04:00 local) ----
    const tomorrow = new Date(now.getTime() + 864e5);
    const lp = localParts(tomorrow, tz);
    const start = new Date(tomorrow.getTime() + (2 - lp.hour) * 3600000 - lp.minute * 60000);
    c.repos.maintenance.insert({ maintenance_id: uuid(), location_id: locId.get('Hostel Block')!, title: 'Access point firmware upgrade', notes: 'All hostel APs will restart. Expect short disconnections.', starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 2 * 3600000).toISOString(), created_by: 'u-it2', announced: 0, created_at: nowIso });
  })();

  // Same services the running app uses → statuses, outages and insights are populated.
  c.services.locations.refreshAll();
  c.services.maintenance.announcePending();
  for (const l of c.repos.locations.all()) {
    const latest = c.repos.tests.list({ location_id: l.location_id, page: 1, pageSize: 1 }).items[0];
    if (latest) c.services.insights.onNewTest(latest);
  }
  c.services.outages.evaluateAll();
  c.services.insights.refreshAll();
  const counts = db.prepare(`SELECT (SELECT COUNT(*) FROM speed_tests) tests, (SELECT COUNT(*) FROM complaints) complaints,
    (SELECT COUNT(*) FROM complaints WHERE status <> 'resolved') open, (SELECT COUNT(*) FROM insights WHERE is_active = 1) insights`).get() as any;
  if (!opts.quiet) {
    console.log(`\nSeeded ${counts.tests} speed tests, ${counts.complaints} complaints (${counts.open} open), ${counts.insights} active insights.`);
    if (opts.accounts) {
      console.log('\nDemo history added to the existing accounts. Their passwords are the ones you set with bootstrap-admin.');
    } else {
      console.log('\nDemo accounts (password for all: Passw0rd!demo) — change these before any real use:');
      console.log('  admin@campus.local      Administrator');
      console.log('  manager@campus.local    Network / IT Manager');
      console.log('  it1@campus.local        IT Support Staff (Kamran Javed)');
      console.log('  it2@campus.local        IT Support Staff (Saima Akhtar)');
      console.log('  student01@campus.local … student12@campus.local   Students\n');
    }
  }
  return true;
}

if (require.main === module) {
  const c = createContainer(loadConfig());
  seed(c, { force: process.argv.includes('--force'), accounts: process.argv.includes('--accounts') });
  c.sse.close();
  c.db.close();
}
