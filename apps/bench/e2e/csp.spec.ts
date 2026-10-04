import { expect, test } from '@playwright/test';
import { openCvVariant } from '../src/server';

test('runs under the strict CSP (custom OpenCV build)', async ({ page }) => {
  test.skip(
    openCvVariant() !== 'custom',
    "Stock OpenCV build needs 'unsafe-eval'. Run `pnpm build:opencv` to verify the strict policy.",
  );
  const violations: string[] = [];
  page.on('console', (m) => /Content Security Policy/i.test(m.text()) && violations.push(m.text()));

  const res = await page.goto('/bench.html?type=id-card');
  const policy = res!.headers()['content-security-policy'] ?? '';
  expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).not.toContain("'unsafe-inline'");

  await expect
    .poll(() => page.evaluate(() => window.__bench.status()), { timeout: 20_000 })
    .toBe('running');
  await page.waitForTimeout(1500);
  const detections = await page.evaluate(
    () => window.__bench.events.filter((e) => (e as { type: string }).type === 'detection').length,
  );
  expect(detections).toBeGreaterThan(5);
  expect(violations).toEqual([]);
});
