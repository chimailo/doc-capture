import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { PREVIEW_URL } from './server';
import type { BenchEvent } from './kpi';

export interface Session {
  browser: Browser;
  page: Page;
  cspViolations: string[];
  consoleErrors: string[];
}

/** Launches Chromium with a Y4M file as its camera and opens the bench page. */
export async function openBench(videoPath: string, query: Record<string, string>): Promise<Session> {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${videoPath}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();
  const cspViolations: string[] = [];
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
    if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(`${PREVIEW_URL}/bench.html?${new URLSearchParams(query)}`);
  return { browser, page, cspViolations, consoleErrors };
}

export const events = (page: Page) => page.evaluate(() => window.__bench.events as BenchEvent[]);

declare global {
  interface Window {
    __bench: { events: unknown[]; status(): string; captureNow(): Promise<unknown>; destroy(): Promise<void> };
  }
}
