import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', 'Passw0rd!demo');
  await page.click('button[type=submit]');
}

test('student tests and reports; IT resolves; dashboard reflects it', async ({ browser }) => {
  // Student: verify the internet test against a deterministic provider simulation.
  const s = await (await browser.newContext()).newPage();
  await login(s, 'student01@campus.local');
  await s.route('https://speed.cloudflare.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__down') {
      await route.fulfill({ status: 200, body: 'x'.repeat(Number(url.searchParams.get('bytes')) || 100000), headers: { 'Access-Control-Allow-Origin': '*', 'Timing-Allow-Origin': '*', 'Content-Type': 'application/octet-stream' } });
      return;
    }
    if (url.pathname === '/__up') {
      await route.fulfill({ status: 200, body: '', headers: { 'Access-Control-Allow-Origin': '*', 'Timing-Allow-Origin': '*', 'Content-Type': 'application/json' } });
      return;
    }
    await route.fulfill({ status: 200, body: '{}', headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  });
  await s.check('input[type="checkbox"]');
  await s.click('text=Run internet speed test');
  await expect(s.getByText('Completed internet measurement')).toBeVisible({ timeout: 45_000 });
  await expect(s.getByText('Off campus · Campus context: Mehran University of Engineering & Technology')).toBeVisible();
  const saved = await s.request.get('/api/internet-tests');
  expect((await saved.json()).items).toHaveLength(1);

  // Run a separate room-specific campus test before filing a campus complaint.
  await s.goto('/campus-test?location=loc-library-floor-2&quick=1');
  await s.click('text=Run campus Wi-Fi test');
  await expect(s.getByText(/Campus network at Library Floor 2/)).toBeVisible({ timeout: 45_000 });
  await s.goto('/complaints/new?location=loc-library-floor-2');
  await s.fill('#c-desc', 'Wi-Fi disconnects every few minutes near the study rooms');
  await expect(s.getByText('Suggested: Frequent Disconnection')).toBeVisible();
  await s.click('text=Submit complaint');
  await expect(s.getByText('Attached speed test')).toBeVisible();
  const url = s.url();

  // IT: open dashboard, then move the complaint through every state
  const it = await (await browser.newContext()).newPage();
  await login(it, 'it1@campus.local');
  await expect(it.getByText('Tests today')).toBeVisible();
  const openBefore = Number(await it.locator('text=Open complaints >> xpath=following-sibling::div').innerText());
  await it.goto(url.replace(/^https?:\/\/[^/]+/, ''));
  await it.click('text=Mark as reviewed');
  await it.selectOption('#assignee', { label: 'Kamran Javed (me)' });
  await it.click('button:has-text("Assign")');
  await it.click('text=Start investigation');
  await it.fill('#tnote', 'Moved the AP to channel 11.');
  await it.click('text=Mark as resolved');
  await expect(it.getByText(/^Resolved .*reporter has been notified/)).toBeVisible();
  await it.goto('/it');
  const openAfter = Number(await it.locator('text=Open complaints >> xpath=following-sibling::div').innerText());
  expect(openAfter).toBe(openBefore - 1);

  // Student sees the resolution notification
  await s.goto('/notifications');
  await expect(s.getByText('Your complaint at Library Floor 2 was resolved')).toBeVisible();

  // Manager sees analytics
  const m = await (await browser.newContext()).newPage();
  await login(m, 'manager@campus.local');
  await m.goto('/analytics');
  await expect(m.getByText('Speed by location')).toBeVisible();
  await expect(m.getByText('Complaints by building')).toBeVisible();
});
