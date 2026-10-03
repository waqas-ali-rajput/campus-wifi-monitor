/** npm run simulate:outage -- --location "Library Floor 2"
 *  4 students report No Internet + 3 unreachable speed tests within a minute → rule R1/R2 opens an outage. */
import { argLocation, demoContainer, runDemo } from './demo-lib';

runDemo(async () => {
  const { c, students } = await demoContainer();
  const loc = await argLocation(c);
  const texts = [
    'No internet at all, connected to Wi-Fi but nothing opens.',
    'Cannot connect, internet is down on this floor.',
    'No connection since a few minutes, pages time out.',
    'Wi-Fi shows connected but there is no internet.',
  ];
  for (const [i, s] of students.slice(0, 4).entries()) {
    await c.services.complaints.create({ user_id: s.user_id, role: 'user' }, { location_id: loc.location_id, complaint_type: 'no_internet', description: texts[i]! });
    console.log(`Complaint filed by ${s.name}: "${texts[i]}"`);
  }
  for (const s of students.slice(4, 7)) {
    await c.services.tests.recordFailure(s.user_id, { location_id: loc.location_id, reason: 'unreachable', detail: 'simulated outage' });
    console.log(`Speed test failed for ${s.name} (server unreachable)`);
  }
  const active = await c.repos.outages.activeFor(loc.location_id);
  console.log(active ? `\n⚠  ${active.message}  (${active.explanation})` : '\nNo outage opened (one may already be active, or a maintenance window covers this location).');
  console.log('Run "npm run simulate:recover -- --location \\"' + loc.location_name + '\\"" to bring it back.\n');
  c.sse.close();
  await c.db.close();
});
