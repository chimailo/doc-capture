// Writes dist/manifest.json with SRI hashes and gzipped sizes, and fails if a
// WASM file goes over the size budget.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_GZIP_BYTES = 3 * 1024 * 1024;

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!existsSync(dist)) {
  console.error('dist/ not found. Run `pnpm build` (Docker) or `pnpm build:stock` first.');
  process.exit(1);
}

const files = {};
let failed = false;
for (const name of readdirSync(dist).sort()) {
  if (!/\.(js|wasm)$/.test(name)) continue;
  const buf = readFileSync(join(dist, name));
  const gzip = gzipSync(buf, { level: 9 }).length;
  files[name] = {
    integrity: 'sha384-' + createHash('sha384').update(buf).digest('base64'),
    bytes: buf.length,
    gzipBytes: gzip,
  };
  // The stock build embeds WASM in JS, so it is exempt from the budget.
  const budgeted = name.endsWith('.wasm');
  const status = budgeted && gzip > BUDGET_GZIP_BYTES ? 'OVER BUDGET' : 'ok';
  if (status !== 'ok') failed = true;
  console.log(`${name.padEnd(22)} ${(gzip / 1024).toFixed(0).padStart(6)} KB gz  ${status}`);
}

const variant = files['opencv-simd.wasm'] ? 'custom' : 'stock';
writeFileSync(
  join(dist, 'manifest.json'),
  JSON.stringify({ variant, budgetGzipBytes: BUDGET_GZIP_BYTES, files }, null, 2) + '\n',
);
if (failed) {
  console.error(`A WASM file is over the ${BUDGET_GZIP_BYTES / 1024 / 1024} MB gzip budget.`);
  process.exit(1);
}
