// Copies the OpenCV build (custom or stock) into public/opencv for self-hosting.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../../../packages/opencv-build/dist');
const dst = join(here, '../public/opencv');
if (!existsSync(join(src, 'manifest.json'))) {
  console.error(
    'OpenCV build not found. Run `pnpm build:opencv` (Docker) or `pnpm build:opencv:stock` at the repo root.',
  );
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log('OpenCV copied to public/opencv');
