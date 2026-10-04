import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const manifestPath = resolve(__dirname, '../../packages/opencv-build/dist/manifest.json');
const variant = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { variant: string }).variant
  : 'missing';

/**
 * The stock OpenCV.js build evaluates strings as code, so it only runs with
 * 'unsafe-eval'. The custom build (DYNAMIC_EXECUTION=0) does not need it.
 */
export const STOCK_OPENCV = variant !== 'custom';
if (STOCK_OPENCV) {
  console.warn(
    "\n⚠  Using the stock OpenCV.js build: the preview CSP is relaxed with 'unsafe-eval'.\n" +
      '   Run `pnpm build:opencv` (Docker) for the custom build that works under the strict policy.\n',
  );
}

/**
 * The strictest policy the SDK needs. Applied to `vite preview` (production
 * build); the dev server needs inline scripts for hot reload, so it is off there.
 */
export const CSP = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval'${STOCK_OPENCV ? " 'unsafe-eval'" : ''}`,
  "worker-src 'self'",
  "connect-src 'self'",
  "img-src 'self' blob:",
  "style-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  // Keep the core un-prebundled so `new URL('./worker.js', import.meta.url)` resolves.
  optimizeDeps: { exclude: ['@doc-capture/core', '@doc-capture/react'] },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        bench: resolve(__dirname, 'bench.html'),
      },
    },
  },
  preview: {
    headers: {
      'Content-Security-Policy': CSP,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(self)',
    },
  },
}));
