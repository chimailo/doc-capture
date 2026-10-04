# Privacy

The SDK processes the camera feed and the captured image only on the user's device.

## What the SDK does

- **All processing is on the device.** Detection, quality checks, perspective correction and encoding run in the browser, in a Web Worker.
- **One kind of network request.** The SDK fetches the OpenCV files (`.js` and `.wasm`) from the `wasmUrl` you configure, and nothing else. Host them yourself so these requests stay on your own origin.
- **No telemetry by default.** `onMetrics` is opt-in. Its payload type only allows numbers (timings, scores and counts), never images, text or device identifiers.
- **Nothing is stored.** The SDK never uses `localStorage`, `sessionStorage`, IndexedDB, the Cache API or cookies. An ESLint rule enforces this in the source.
- **No metadata in the output.** Images are encoded with the browser's canvas encoder, which writes no EXIF. The output has no GPS location, device model, serial number or timestamp. The e2e suite checks that captured JPEGs contain no APP1 segment.
- **The original frame is off by default.** `CaptureResult.original` is only included when you pass `includeOriginal: true`.
- **Cleanup.** `stop()` stops every camera track. `destroy()` also terminates the worker, clears and shrinks the canvases, and removes the SDK's DOM elements. Pixel buffers in the worker, including the WASM heap copies of the full-resolution frame, are overwritten with zeros before they are released.

## OCR plugins

A plugin declares `runsOnDevice`. If a plugin declares `runsOnDevice: false`, `createDocumentCapture` throws `RemotePluginNotAllowed` unless you pass `allowRemoteProcessing: true`. The opt-in is explicit and visible in code review.

## What remains your responsibility

- The `CaptureResult` image belongs to your app once `onCapture` fires. Where it goes from there is up to you.
- Serving the page and the OpenCV files over HTTPS.
- Telling users what you do with the captured document.

## How this is tested

| Guarantee                                  | Test                                                    |
| ------------------------------------------ | ------------------------------------------------------- |
| No fetch or storage during a session       | `packages/core/test/facade.test.ts`                     |
| Same-origin requests only, no storage      | `apps/bench/e2e/privacy.spec.ts`                        |
| No EXIF in JPEG output                     | `apps/bench/e2e/privacy.spec.ts`                        |
| Camera tracks ended and DOM removed        | `apps/bench/e2e/privacy.spec.ts`, `facade.test.ts`      |
| Remote plugins refused                     | `packages/core/test/guidance.test.ts`, `facade.test.ts` |
| No storage APIs in source                  | ESLint `no-restricted-globals` (`eslint.config.js`)     |
