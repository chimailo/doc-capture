import { createRequire } from 'node:module';

// Loose typing: the bench only needs a handful of calls.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CV = any;

let cached: Promise<CV> | null = null;

export function loadCv(): Promise<CV> {
  cached ??= new Promise((resolve) => {
    const require = createRequire(import.meta.url);
    const mod = require('@techstark/opencv-js');
    if (typeof mod.Mat === 'function' && !mod.then) return resolve(mod);
    if (mod.then) {
      mod.then.call(mod, (m: CV) => {
        delete m.then;
        resolve(m);
      });
      return;
    }
    mod.onRuntimeInitialized = () => resolve(mod);
  });
  return cached;
}
