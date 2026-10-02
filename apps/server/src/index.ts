import pino from 'pino';
import { loadConfig } from './config';
import { createContainer } from './container';
import { createApp } from './http/app';
import { lanUrls } from './http/routes';
import { Scheduler } from './infrastructure/scheduler/Scheduler';

const config = loadConfig();
const log = pino({ level: config.logLevel });
const c = createContainer(config);
const app = createApp(c);
const scheduler = new Scheduler(c, log);

// Bring statuses and insights up to date immediately, then on schedule.
c.services.locations.refreshAll();
c.services.outages.evaluateAll();
c.services.insights.refreshAll();
scheduler.start();

const server = app.listen(config.port, config.host, () => {
  const urls = [`http://localhost:${config.port}`, ...(config.host === '0.0.0.0' ? lanUrls(config.port) : [])];
  console.log('\n  Smart Campus Wi-Fi Monitor is running\n');
  for (const u of [...new Set(urls)]) console.log(`    ➜  ${u}`);
  console.log(`\n  Timezone: ${c.tz}   Database: ${config.dbPath}`);
  console.log('  Open a LAN URL on a phone connected to the campus Wi-Fi to test that device.\n');
});

function shutdown() {
  scheduler.stop();
  c.sse.close();
  server.close(() => {
    c.db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
