# Content Security Policy and self-hosting

The SDK runs under a strict CSP. Compared with a policy that allows nothing inline and no `eval`, the only extra source it needs is `'wasm-unsafe-eval'`, which lets the browser compile WebAssembly.

## Required policy

```
script-src 'self' 'wasm-unsafe-eval';
worker-src 'self';
connect-src 'self';
img-src 'self' blob:;
```

| Directive                         | Why                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-src 'wasm-unsafe-eval'`   | Compiles the OpenCV WebAssembly module.                                                                                                                         |
| `worker-src 'self'`               | The detection worker is a same-origin file (`worker.js`). It never uses a `blob:` URL.                                                                          |
| `connect-src 'self'`              | Fetches the OpenCV `.wasm` and checks the `.js` with SRI. If OpenCV lives on another origin, add that origin here and to `script-src`.                           |
| `img-src blob:`                   | Only for the React review screen, which shows the captured image from an object URL. Leave it out if you render the result yourself.                           |

Styles are applied through the CSSOM (`element.style`), so the SDK works under `style-src 'self'` without `'unsafe-inline'`.

The demo serves exactly this policy from `vite preview`; see `apps/demo/vite.config.ts`. `apps/bench/e2e/csp.spec.ts` checks it in CI.

## Use the custom OpenCV build

The stock `opencv.js` from npm or the OpenCV docs evaluates strings as code (`new Function`), so it fails under this policy unless you add `'unsafe-eval'`. The custom build in `packages/opencv-build` is compiled with `-s DYNAMIC_EXECUTION=0` and does not need it.

```sh
pnpm build:opencv                    # Docker: emits dist/opencv{,-simd}.{js,wasm} + manifest.json
pnpm --filter @doc-capture/opencv-build copy-to ./public/opencv
```

## Self-hosting

1. Copy `dist/` to a static path, e.g. `/opencv/v4.10.0/`.
2. Serve it with `Cache-Control: public, max-age=31536000, immutable`. Put the version in the path so it can be cached forever.
3. Serve `.wasm` as `application/wasm`.
4. Pass the path and the integrity hashes from `manifest.json`:

   ```ts
   import manifest from '@doc-capture/opencv-build/manifest.json';

   createDocumentCapture({
     opencv: { baseUrl: '/opencv/v4.10.0/', integrity: manifest.files },
   });
   ```

With `integrity` set, the worker fetches the `.wasm` with Subresource Integrity and refuses a mismatching file (`WasmLoadFailed`). The JS glue is fetched with SRI too, then run with `importScripts`, which normally reads it back from the HTTP cache. For the strongest guarantee, serve the glue from your own origin.

## Bundlers

The core starts its worker with `new Worker(new URL('./worker.js', import.meta.url))`. Vite, webpack 5, Rollup and esbuild handle this pattern. With Vite, exclude the package from dependency pre-bundling:

```ts
optimizeDeps: { exclude: ['@doc-capture/core', '@doc-capture/react'] }
```

If your bundler cannot handle it, copy `@doc-capture/core/dist/worker.js` to your static files and pass `workerUrl`.
