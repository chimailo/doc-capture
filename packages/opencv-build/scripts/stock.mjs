// Fallback for machines without Docker: copies the stock OpenCV.js build
// (WASM embedded in the JS file, ~10 MB) into dist/ so the demo and e2e tests
// can run. Not for production: it misses the size budget.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const src = require.resolve('@techstark/opencv-js/dist/opencv.js');
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
mkdirSync(dist, { recursive: true });
copyFileSync(src, join(dist, 'opencv.js'));
console.log('Copied stock opencv.js to dist/ (no separate .wasm).');
