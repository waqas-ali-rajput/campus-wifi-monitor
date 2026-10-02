/** npm run simulate — posts a realistic speed test for a random location every 3 s (service layer). */
import { localParts } from '../src/shared/time';
import { demoContainer } from './demo-lib';
import { PROFILES, rng, sampleMetrics } from './profiles';

const { c, students } = demoContainer();
const r = rng(Date.now() % 100000);
console.log('Simulating live speed tests every 3 s. Press Ctrl+C to stop.\n');

const tick = () => {
  const loc = r.pick(c.repos.locations.all());
  const profile = PROFILES.find((p) => p.name === loc.location_name) ?? { ...PROFILES[0]!, name: loc.location_name };
  const student = r.pick(students);
  const m = sampleMetrics(profile, localParts(new Date(), c.tz).hour, r);
  try {
    const t = c.services.tests.submit(student.user_id, { location_id: loc.location_id, ...m, client_meta: { simulated: true } });
    console.log(
      `${new Date().toLocaleTimeString()}  ${loc.location_name.padEnd(22)} ${String(m.download_mbps).padStart(6)} Mbps ↓  ${String(m.upload_mbps).padStart(6)} ↑  ${String(Math.round(m.ping_ms)).padStart(4)} ms  → ${t.health_score} ${t.health_status}`,
    );
  } catch (e) {
    console.error('Failed:', (e as Error).message);
  }
};
tick();
const timer = setInterval(tick, 3000);
process.on('SIGINT', () => {
  clearInterval(timer);
  c.sse.close();
  c.db.close();
  process.exit(0);
});
