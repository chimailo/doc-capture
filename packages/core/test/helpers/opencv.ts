import { createRequire } from 'node:module';
import type { CV } from '../../src/opencv/types';

let cached: Promise<CV> | null = null;

/** Loads the stock OpenCV.js build in Node, once per test file. */
export function loadCv(): Promise<CV> {
  cached ??= new Promise((resolve) => {
    const require = createRequire(import.meta.url);
    const mod = require('@techstark/opencv-js') as CV & {
      then?: (cb: (m: CV) => void) => void;
      onRuntimeInitialized?: () => void;
    };
    if (typeof mod.Mat === 'function' && !mod.then) return resolve(mod);
    if (mod.then) {
      mod.then.call(mod, (m) => {
        delete (m as { then?: unknown }).then;
        resolve(m);
      });
      return;
    }
    mod.onRuntimeInitialized = () => resolve(mod);
  });
  return cached;
}
