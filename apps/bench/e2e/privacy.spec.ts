import { expect, test } from '@playwright/test';

test.use({ video: 'off' });

test.describe('privacy', () => {
  test('only same-origin requests, no storage, no EXIF, full cleanup on destroy', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    const csp: string[] = [];
    page.on('console', (m) => /Content Security Policy/i.test(m.text()) && csp.push(m.text()));

    // Count camera tracks and stopped tracks from inside the page.
    await page.addInitScript(() => {
      const w = window as unknown as { __tracks: MediaStreamTrack[] };
      w.__tracks = [];
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => {
        const s = await orig(c);
        w.__tracks.push(...s.getTracks());
        return s;
      };
    });

    await page.goto('/bench.html?type=id-card');
    await expect
      .poll(() => page.evaluate(() => window.__bench.status()), { timeout: 20_000 })
      .toBe('running');

    // Manual capture returns an image even if the scene is not perfect.
    const jpeg = await page.evaluate(async () => {
      const r = (await window.__bench.captureNow()) as { image: Blob } | null;
      if (!r) return null;
      return Array.from(new Uint8Array(await r.image.arrayBuffer()));
    });
    expect(jpeg).not.toBeNull();
    const bytes = jpeg!;
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    // Walk the JPEG segments: there must be no APP1 (EXIF/XMP) segment.
    const markers: number[] = [];
    for (let i = 2; i < bytes.length - 4; ) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1]!;
      markers.push(marker);
      if (marker === 0xda) break; // start of scan
      i += 2 + ((bytes[i + 2]! << 8) | bytes[i + 3]!);
    }
    expect(markers).not.toContain(0xe1);

    await page.evaluate(() => window.__bench.destroy());
    const tracks = await page.evaluate(() =>
      (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.map((t) => t.readyState),
    );
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.every((s) => s === 'ended')).toBe(true);
    expect(await page.locator('video').count()).toBe(0);

    const storage = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      idb: (await indexedDB.databases?.())?.length ?? 0,
      caches: 'caches' in self ? (await caches.keys()).length : 0,
    }));
    expect(storage).toEqual({ local: 0, session: 0, idb: 0, caches: 0 });

    const origin = new URL(page.url()).origin;
    const foreign = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('blob:') && !u.startsWith('data:'));
    expect(foreign).toEqual([]);
    expect(csp).toEqual([]);
  });
});
