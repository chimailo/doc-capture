import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
export const PREVIEW_URL = 'http://localhost:4173';

/** Starts `vite preview` for the built demo (strict CSP headers included). */
export async function startPreview(): Promise<ChildProcess> {
  const child = spawn('pnpm', ['--filter', '@doc-capture/demo', 'preview'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(PREVIEW_URL + '/bench.html');
      if (res.ok) return child;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('vite preview did not start. Run `pnpm --filter @doc-capture/demo build` first.');
}

/** Which OpenCV build the demo is serving. */
export function openCvVariant(): string {
  const m = join(ROOT, 'packages/opencv-build/dist/manifest.json');
  return existsSync(m) ? (JSON.parse(readFileSync(m, 'utf8')) as { variant: string }).variant : 'missing';
}
