import { expect, test } from '@playwright/test';

/**
 * Memory soak: runs detection on the looping fixture for SOAK_FRAMES frames
 * (default 600; nightly CI uses 5000) and checks for leaks.
 */
const FRAMES = Number(process.env.SOAK_FRAMES ?? 600);

test('no OpenCV leaks and a bounded WASM heap over many frames', async ({ page }) => {
  test.setTimeout(Math.max(60_000, FRAMES * 250));
  await page.goto('/bench.html?type=id-card&auto=0');
  await expect.poll(() => page.evaluate(() => window.__bench.status()), { timeout: 20_000 }).toBe('running');

  await expect
    .poll(() => page.evaluate(() => window.__bench.frames.count), { timeout: FRAMES * 250, intervals: [1000] })
    .toBeGreaterThanOrEqual(FRAMES);

  const f = await page.evaluate(() => window.__bench.frames);
  expect(f.maxLiveMats).toBe(0);
  // After warm-up the heap must stop growing.
  const settled = f.heapBytes.slice(2);
  expect(settled.length).toBeGreaterThan(0);
  expect(Math.max(...settled)).toBe(Math.min(...settled));

  const jsHeap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
  expect(jsHeap).toBeLessThan(200 * 1024 * 1024);
});
