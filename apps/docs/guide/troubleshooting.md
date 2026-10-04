# Troubleshooting

### `WASM_LOAD_FAILED: … violates the following Content Security Policy directive`

You are serving the stock OpenCV.js, which needs `'unsafe-eval'`. Use the custom build from `@doc-capture/opencv-build` (`pnpm build:opencv`). See [CSP and self-hosting](./csp).

### `WASM_LOAD_FAILED: Could not fetch … (network error or integrity mismatch)`

Check one of these:

- `wasmUrl` points at the folder that contains `opencv.wasm`.
- `.wasm` is served as `application/wasm`.
- The `integrity` hashes match the deployed files. Regenerate them with `pnpm --filter @doc-capture/opencv-build manifest`.

### The worker fails to start or 404s on `worker.js`

Your bundler did not emit the worker. With Vite, exclude the packages from `optimizeDeps`. Otherwise, copy `node_modules/@doc-capture/core/dist/worker.js` to your static files and pass `workerUrl`.

### `PERMISSION_DENIED`

The user or a browser policy blocked the camera. The React UI shows instructions and a **Try again** button. In an iframe, add `allow="camera"`, and if you send a `Permissions-Policy` header, include `camera=(self)`.

### `INSECURE_CONTEXT`

Serve the page over HTTPS. To test on a phone, run `pnpm --filter @doc-capture/demo dev:https` and open the LAN address.

### Guidance stays on "Place your document in the frame"

- Use a darker, plain surface. Low-contrast backgrounds are the hardest case.
- Check that `documentTypes` includes the document. Its aspect ratio is checked.
- Look at `detection` events. If `quad` stays `null`, the document is not being found.

### Auto-capture never fires, but the outline is green

A check fails at full resolution, usually sharpness when autofocus is hunting. Look for `capture-rejected` in `onMetrics` and its `reason`. Users can always press the shutter.

### The outline lags behind fast movements

The tracker ignores a single-frame jump until the next detection confirms it, which suppresses flicker. A real move is followed within about 130 ms.
