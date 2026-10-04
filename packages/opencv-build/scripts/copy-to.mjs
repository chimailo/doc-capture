// Copies the built files into a host app's static folder for self-hosting.
// Usage: pnpm --filter @doc-capture/opencv-build copy-to ../../apps/demo/public/opencv
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) {
  console.error('Usage: copy-to <directory>');
  process.exit(1);
}
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
mkdirSync(resolve(target), { recursive: true });
cpSync(dist, resolve(target), { recursive: true });
console.log(`Copied OpenCV files to ${resolve(target)}`);
