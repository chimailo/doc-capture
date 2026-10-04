import { expect, test } from '@playwright/test';

/**
 * Real-device smoke test (BrowserStack). Runs only with DEMO_URL set to a
 * deployed demo; checks loading time and throughput, not KPIs.
 */
const DEMO_URL = process.env.DEMO_URL;

test('loads OpenCV and processes frames on a real device', async ({ page }) => {
  test.skip(!DEMO_URL, 'Set DEMO_URL to a deployed demo to run on real devices.');
  await page.goto(`${DEMO_URL}/bench.html?type=id-card&auto=0`);
  await expect.poll(() => page.evaluate(() => window.__bench.status()), { timeout: 20_000 }).toBe('running');
  const init = await page.evaluate(
    () =>
      (window.__bench.events as { type: string; data?: { type: string; loadMs: number } }[]).find(
        (e) => e.type === 'metric' && e.data?.type === 'init',
      )?.data?.loadMs ?? Infinity,
  );
  expect(init).toBeLessThan(3000);
  await page.waitForTimeout(5000);
  const ms = await page.evaluate(() => [...window.__bench.frames.workerMs].sort((a, b) => a - b));
  expect(ms.length).toBeGreaterThan(20);
  expect(ms[Math.floor(ms.length / 2)]!).toBeLessThan(35);
});
