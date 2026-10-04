import { WasmLoadFailed } from '../errors';
import type { CV } from './types';

/** Per-file SRI hashes, as written to `manifest.json` by @doc-capture/opencv-build. */
export type IntegrityMap = Record<string, { integrity: string } | string>;

export interface OpenCvConfig {
  /** Directory URL holding the OpenCV files, e.g. `/opencv/`. */
  baseUrl: string;
  /**
   * `custom` loads `opencv[-simd].js` + `.wasm`; `stock` loads a single
   * `opencv.js` with embedded WASM. Default: `custom`.
   */
  variant?: 'custom' | 'stock';
  /** Expected hashes. When given, every fetched file is checked. */
  integrity?: IntegrityMap;
  /** Force SIMD on or off. Default: detected. */
  simd?: boolean;
}

// Smallest module using a v128 instruction (same probe as wasm-feature-detect).
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

export function supportsWasmSimd(): boolean {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
}

export function resolveFiles(config: OpenCvConfig): { js: string; wasm?: string } {
  if (config.variant === 'stock') return { js: 'opencv.js' };
  const simd = config.simd ?? supportsWasmSimd();
  const stem = simd ? 'opencv-simd' : 'opencv';
  return { js: `${stem}.js`, wasm: `${stem}.wasm` };
}

function integrityFor(config: OpenCvConfig, file: string): string | undefined {
  const entry = config.integrity?.[file];
  return typeof entry === 'string' ? entry : entry?.integrity;
}

function joinUrl(base: string, file: string): string {
  return new URL(file, new URL(base.endsWith('/') ? base : base + '/', self.location.href)).href;
}

async function fetchChecked(url: string, integrity: string | undefined): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(url, { integrity, credentials: 'same-origin' });
  } catch (e) {
    throw new WasmLoadFailed(`Could not fetch ${url} (network error or integrity mismatch).`, e);
  }
  if (!res.ok) throw new WasmLoadFailed(`Could not fetch ${url}: HTTP ${res.status}.`);
  return res.arrayBuffer();
}

type EmscriptenModule = CV & { then?: unknown; onRuntimeInitialized?: () => void };
type Factory = (opts: Record<string, unknown>) => Promise<EmscriptenModule> | EmscriptenModule;

/** Waits for a module object, which may be a factory, thenable, or plain module. */
function settle(mod: EmscriptenModule): Promise<CV> {
  return new Promise((resolve) => {
    if ('Mat' in mod && typeof mod.Mat === 'function' && !mod.then) return resolve(mod);
    if (typeof mod.then === 'function') {
      // Emscripten modules resolve to themselves; drop `then` to avoid a loop.
      (mod.then as (cb: (m: EmscriptenModule) => void) => void).call(mod, (m) => {
        delete m.then;
        resolve(m);
      });
      return;
    }
    mod.onRuntimeInitialized = () => resolve(mod);
  });
}

/**
 * Loads OpenCV.js inside a classic worker.
 *
 * The WASM binary is fetched with SRI. The JS glue is fetched with SRI as
 * well, then executed by `importScripts`, which reads it from the HTTP cache.
 */
export async function loadOpenCv(config: OpenCvConfig): Promise<CV> {
  const files = resolveFiles(config);
  const jsUrl = joinUrl(config.baseUrl, files.js);

  const [, wasmBinary] = await Promise.all([
    integrityFor(config, files.js) ? fetchChecked(jsUrl, integrityFor(config, files.js)) : null,
    files.wasm
      ? fetchChecked(joinUrl(config.baseUrl, files.wasm), integrityFor(config, files.wasm))
      : null,
  ]);

  const scope = self as unknown as { cv?: unknown; importScripts(url: string): void };
  try {
    scope.importScripts(jsUrl);
  } catch (e) {
    throw new WasmLoadFailed(`Could not run ${jsUrl}: ${e instanceof Error ? e.message : e}`, e);
  }
  const exported = scope.cv;
  if (!exported) throw new WasmLoadFailed(`${jsUrl} did not define cv.`);

  try {
    if (typeof exported === 'function') {
      const opts: Record<string, unknown> = {};
      if (wasmBinary) opts.wasmBinary = wasmBinary;
      return await settle(await (exported as Factory)(opts));
    }
    return await settle(exported as EmscriptenModule);
  } catch (e) {
    throw new WasmLoadFailed(`OpenCV failed to initialise: ${e instanceof Error ? e.message : e}`, e);
  }
}
