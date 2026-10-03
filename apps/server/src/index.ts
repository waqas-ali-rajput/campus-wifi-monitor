import pino from 'pino';
import { loadConfig } from './config';
import { createContainer, warmUp } from './container';
import { createApp } from './http/app';
import { lanUrls } from './http/routes';
import { Scheduler } from './infrastructure/scheduler/Scheduler';

async function main() {
  const config = loadConfig();
  const log = pino({ level: config.logLevel });
  const c = await createContainer(config);
  const app = createApp(c);
  const scheduler = new Scheduler(c, log);

  // Bring statuses and insights up to date immediately, then on schedule.
  await warmUp(c);
  scheduler.start();

  const server = app.listen(config.port, config.host, () => {
    const urls = [
      `http://localhost:${config.port}`,
      ...(config.host === '0.0.0.0' ? lanUrls(config.port) : []),
    ];
    console.log('\n  Smart Campus Wi-Fi Monitor is running\n');
    for (const u of [...new Set(urls)]) console.log(`    ➜  ${u}`);
    console.log(`\n  Timezone: ${c.tz}   Database: ${describeDb(config.databaseUrl)}`);
    console.log('  Open a LAN URL on a phone connected to the campus Wi-Fi to test that device.\n');
  });

  function shutdown() {
    scheduler.stop();
    c.sse.close();
    server.close(() => {
      void c.db.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 2000).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/** Host + database name only; never print the password. */
function describeDb(url?: string) {
  try {
    const u = new URL(url ?? '');
    return `${u.hostname}${u.pathname}`;
  } catch {
    return 'not configured';
  }
}

main().catch((err) => {
  console.error('Failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
