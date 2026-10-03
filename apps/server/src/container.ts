import type { AppConfig } from './config';
import { openDatabase, type Db } from './infrastructure/db/connection';
import { asCompat } from './infrastructure/db/compat';
import { migrate } from './infrastructure/db/migrate';
import { hashPassword, JwtService, resolveJwtSecret, verifyPassword } from './infrastructure/security/security';
import { SseHub } from './infrastructure/sse/SseHub';
import { NoopLlmProvider, OllamaProvider } from './infrastructure/llm/llm';
import { systemClock, type Clock } from './shared/time';
import type { LlmProvider } from './shared/ports';

import { SettingsRepo } from './modules/settings/infrastructure/SettingsRepo';
import { SettingsService } from './modules/settings/application/SettingsService';
import { ActivityRepo } from './modules/activity/infrastructure/ActivityRepo';
import { UserRepo } from './modules/users/infrastructure/UserRepo';
import { UserService } from './modules/users/application/UserService';
import { AuthService } from './modules/auth/application/AuthService';
import { NotificationRepo } from './modules/notifications/infrastructure/NotificationRepo';
import { Notifier } from './modules/notifications/application/Notifier';
import { LocationRepo } from './modules/locations/infrastructure/LocationRepo';
import { LocationService } from './modules/locations/application/LocationService';
import { MaintenanceRepo } from './modules/maintenance/infrastructure/MaintenanceRepo';
import { MaintenanceService } from './modules/maintenance/application/MaintenanceService';
import { OutageRepo } from './modules/outages/infrastructure/OutageRepo';
import { OutageService } from './modules/outages/application/OutageService';
import { TestRepo } from './modules/tests/infrastructure/TestRepo';
import { TestService } from './modules/tests/application/TestService';
import { InsightRepo } from './modules/insights/infrastructure/InsightRepo';
import { InsightsService } from './modules/insights/application/InsightsService';
import { ComplaintRepo } from './modules/complaints/infrastructure/ComplaintRepo';
import { ComplaintService } from './modules/complaints/application/ComplaintService';
import { AnalyticsRepo } from './modules/analytics/infrastructure/AnalyticsRepo';
import { AnalyticsService } from './modules/analytics/application/AnalyticsService';
import { InternetTestRepo } from './modules/internet-tests/infrastructure/InternetTestRepo';
import { InternetTestService } from './modules/internet-tests/application/InternetTestService';

/**
 * Manual dependency injection (composition root).
 * Opens the Postgres pool and brings the schema up to date before anything uses it.
 */
export async function createContainer(
  config: AppConfig,
  opts: { clock?: Clock; db?: Db; llm?: LlmProvider; ephemeralSecret?: boolean; skipMigrate?: boolean } = {},
) {
  const db = opts.db ?? openDatabase(config.databaseUrl, { max: config.pgPoolMax });
  if (!opts.skipMigrate) await migrate(db);
  const sql = asCompat(db);
  const clock = opts.clock ?? systemClock;
  const tz = config.tz;
  const sse = new SseHub();
  const jwt = new JwtService(resolveJwtSecret(config.jwtSecret, opts.ephemeralSecret ? null : config.dataDir));
  const hasher = { hash: hashPassword, verify: verifyPassword };
  const tx = { tx: <T>(fn: () => Promise<T>): Promise<T> => db.transaction(fn) };
  const llm =
    opts.llm ??
    (config.llm.provider === 'ollama' && config.llm.model ? new OllamaProvider(config.llm.url, config.llm.model) : new NoopLlmProvider());

  const repos = {
    settings: new SettingsRepo(sql),
    activity: new ActivityRepo(sql),
    users: new UserRepo(sql),
    notifications: new NotificationRepo(sql),
    locations: new LocationRepo(sql),
    maintenance: new MaintenanceRepo(sql),
    outages: new OutageRepo(sql),
    tests: new TestRepo(sql),
    insights: new InsightRepo(sql),
    complaints: new ComplaintRepo(sql),
    analytics: new AnalyticsRepo(sql),
    internetTests: new InternetTestRepo(sql),
  };

  const settings = new SettingsService(repos.settings, repos.activity, clock);
  const users = new UserService(repos.users, repos.activity, hasher, clock);
  const auth = new AuthService(repos.users, users, hasher, jwt, repos.activity, clock);
  const notifier = new Notifier(repos.notifications, repos.users, sse, clock);
  const locations = new LocationService(repos.locations, settings, repos.activity, notifier, repos.maintenance, repos.outages, sse, clock, tz);
  const maintenance = new MaintenanceService(repos.maintenance, repos.locations, repos.activity, notifier, sse, clock);
  const outages = new OutageService(repos.outages, repos.locations, repos.maintenance, settings, notifier, repos.activity, sse, clock);
  const insights = new InsightsService(repos.insights, repos.tests, repos.locations, repos.outages, settings, llm, sse, clock, tz);
  const tests = new TestService(repos.tests, repos.locations, locations, settings, outages, maintenance, insights, sse, tx, clock);
  const complaints = new ComplaintService(repos.complaints, repos.tests, repos.users, locations, outages, notifier, repos.activity, sse, tx, clock);
  const analytics = new AnalyticsService(repos.analytics, repos.tests, repos.locations, locations, repos.outages, clock, tz);
  const internetTests = new InternetTestService(repos.internetTests, clock);

  return {
    config,
    db,
    clock,
    tz,
    sse,
    jwt,
    llm,
    repos,
    services: { settings, users, auth, notifier, locations, maintenance, outages, insights, tests, complaints, analytics, internetTests },
  };
}

export type Container = Awaited<ReturnType<typeof createContainer>>;

/** Brings location statuses, outages and insights up to date (startup / cold start). */
export async function warmUp(c: Container) {
  await c.services.locations.refreshAll();
  await c.services.outages.evaluateAll();
  await c.services.insights.refreshAll();
}
