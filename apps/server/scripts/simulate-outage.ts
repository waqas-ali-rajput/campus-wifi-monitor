/** npm run simulate:outage -- --location "Library Floor 2"
 *  4 students report No Internet + 3 unreachable speed tests within a minute → rule R1/R2 opens an outage. */
import { demoContainer, argLocation } from './demo-lib';

const { c, students } = demoContainer();
const loc = argLocation(c);
const texts = [
  'No internet at all, connected to Wi-Fi but nothing opens.',
  'Cannot connect, internet is down on this floor.',
  'No connection since a few minutes, pages time out.',
  'Wi-Fi shows connected but there is no internet.',
];
let opened: any = null;
students.slice(0, 4).forEach((s, i) => {
  const out = c.services.complaints.create({ user_id: s.user_id, role: 'user' }, { location_id: loc.location_id, complaint_type: 'no_internet', description: texts[i]! });
  console.log(`Complaint filed by ${s.name}: "${texts[i]}"`);
  opened ??= out.new_outage;
});
students.slice(4, 7).forEach((s) => {
  const out = c.services.tests.recordFailure(s.user_id, { location_id: loc.location_id, reason: 'unreachable', detail: 'simulated outage' });
  console.log(`Speed test failed for ${s.name} (server unreachable)`);
  opened ??= out.new_outage;
});
const active = c.repos.outages.activeFor(loc.location_id);
console.log(active ? `\n⚠  ${active.message}  (${active.explanation})` : '\nNo outage opened (one may already be active, or a maintenance window covers this location).');
console.log('Run "npm run simulate:recover -- --location \\"' + loc.location_name + '\\"" to bring it back.\n');
c.sse.close();
c.db.close();
