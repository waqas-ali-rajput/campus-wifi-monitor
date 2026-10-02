/** npm run simulate:recover -- --location "Library Floor 2" — posts 3 good tests → "Network returns to normal". */
import { demoContainer, argLocation } from './demo-lib';

const { c, students } = demoContainer();
const loc = argLocation(c);
const good = [
  { download_mbps: 38.4, upload_mbps: 15.2, ping_ms: 26, jitter_ms: 3.1, packet_loss_pct: 0 },
  { download_mbps: 41.9, upload_mbps: 16.8, ping_ms: 22, jitter_ms: 2.4, packet_loss_pct: 0 },
  { download_mbps: 36.7, upload_mbps: 14.1, ping_ms: 29, jitter_ms: 3.8, packet_loss_pct: 0.5 },
];
good.forEach((m, i) => {
  const s = students[(i + 7) % students.length]!;
  const t = c.services.tests.submit(s.user_id, { location_id: loc.location_id, ...m, client_meta: { simulated: 'recover' } });
  console.log(`Good test by ${s.name}: ${m.download_mbps} Mbps, ${m.ping_ms} ms → ${t.health_score} (${t.health_status})`);
});
const active = c.repos.outages.activeFor(loc.location_id);
console.log(active ? '\nOutage still active.' : `\n✓ Network returns to normal at ${loc.location_name}.\n`);
c.sse.close();
c.db.close();
