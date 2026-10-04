import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2020',
  },
  {
    // Classic worker so it can importScripts() any OpenCV.js build.
    entry: { worker: 'src/worker/detector.worker.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    sourcemap: true,
    target: 'es2020',
    minify: true,
  },
]);
