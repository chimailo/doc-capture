# Phase 0 spike notes

## OpenCV size

| Build                                       | Size (gzip) | Notes                                                                                      |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| Stock `@techstark/opencv-js` 4.10           | 3,287 KB    | WASM embedded as base64 in JS. Development fallback only (`pnpm build:opencv:stock`).      |
| Custom `core`+`imgproc` (Docker build)      | _not yet measured_ | Needs Docker running. `pnpm build:opencv` prints the sizes and fails above 3 MB gzip. |

Stock build initialisation in Node 22 on an Apple Silicon Mac: ~145 ms.

## Loading decisions

- **Classic worker, not module worker.** `importScripts()` runs both the stock UMD build and the custom `MODULARIZE` build with no `eval` and no `blob:` URLs, so a strict CSP only needs `'wasm-unsafe-eval'`.
- **SRI.** The `.wasm` file is fetched with `fetch(url, { integrity })` and passed to Emscripten as `wasmBinary`, so the executable code is always verified. The JS glue is pre-fetched with `integrity` and then executed by `importScripts`, which normally reads it from the HTTP cache. Self-host the glue on the same origin for full guarantees.
- **SIMD** is detected with `WebAssembly.validate` on a 31-byte probe module and falls back to the non-SIMD build.
- **Stock module quirk.** The Emscripten module is a thenable that resolves to itself. Awaiting it directly can loop forever, so the loader removes `then` before resolving.

## Still to verify on real devices

These need physical phones or BrowserStack and are tracked for Phase 4:

- iOS 15–16.3 without `OffscreenCanvas` in workers. The worker falls back to receiving `ImageData` instead of `ImageBitmap`.
- `ImageCapture` is missing on iOS Safari. Full-resolution capture uses the video track at its native resolution.
- Rear camera choice on multi-camera Android phones (`facingMode: environment` sometimes picks the ultra-wide lens).
- The time needed to compile the WASM on a 2020 mid-range Android phone.
