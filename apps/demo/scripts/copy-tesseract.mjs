// Self-hosts Tesseract.js for the sample MRZ plugin: worker, WASM core and
// English traineddata go to public/tesseract. The traineddata is downloaded
// once at build time; at runtime nothing is fetched from third parties.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../public/tesseract');
mkdirSync(out, { recursive: true });

const tjs = dirname(require.resolve('tesseract.js/package.json'));
copyFileSync(join(tjs, 'dist/worker.min.js'), join(out, 'worker.min.js'));

const core = dirname(require.resolve('tesseract.js-core/package.json'));
for (const f of readdirSync(core)) {
  if (/^tesseract-core.*\.(js|wasm)$/.test(f)) copyFileSync(join(core, f), join(out, f));
}

const lang = join(out, 'eng.traineddata');
if (!existsSync(lang)) {
  const url = 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata';
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  writeFileSync(lang, Buffer.from(await res.arrayBuffer()));
}
console.log('Tesseract copied to public/tesseract');
