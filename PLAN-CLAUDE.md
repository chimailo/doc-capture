# Plan: Document and ID Capture SDK (Web, OpenCV)

## 1. Architecture

**Repo layout** (pnpm workspaces, TypeScript in strict mode)

```
packages/
  core/          # Works with any framework: camera, worker, detection, quality checks, state machine, output
  react/         # <DocumentCapture/> component, useDocumentCapture() hook, default overlay UI
  ocr-types/     # OCR plugin interface only (no OCR code)
  opencv-build/  # Custom OpenCV.js build scripts and the resulting WASM files
apps/
  demo/          # React + Vite host app
  bench/         # Runs recorded videos through the SDK and computes the KPIs
```

**Runtime pipeline**

```
Main thread                                     Web Worker (OpenCV WASM)
getUserMedia (rear camera, 1080p+)
requestVideoFrameCallback ── ImageBitmap ──▶  shrink to ~640px → detect → quality checks
                                                (~15 detections/sec, never queues more than one frame)
Overlay canvas, 60fps, smoothed ◀── quad + scores
Guidance state machine → UI text, aria-live, vibration
Auto-capture trigger ── take full-res frame ─▶  check again at full res → perspective warp → encode
```

- **OpenCV build:** a custom OpenCV.js build with only `core` and `imgproc`, plus SIMD and a non-SIMD fallback. Target size is ≤3 MB gzipped instead of the ~9 MB stock build. It loads lazily, can be self-hosted, and is checked with SRI hashes. A `prewarm()` API lets host apps load it before the capture screen opens.
- **Threading:** all OpenCV work runs in a Web Worker. Frames move between threads by transfer, not copy. `OffscreenCanvas` is used where available, with a fallback for iOS versions before 16.4.
- **Memory:** every `cv.Mat` sits in a scoped allocator and is released on every code path. A soak test catches leaks.

## 2. Detection and stable edge highlighting

1. **Preprocessing:** grayscale, then blur (Gaussian or bilateral), then Canny edge detection. Canny thresholds are set from the image's median brightness rather than fixed. Afterwards, edges are dilated (morphological close) to join gaps.
2. **Finding candidates:** `findContours`, then `approxPolyDP` to reduce each contour to a polygon, keeping convex 4-sided shapes. A fallback strategy runs `HoughLinesP` and intersects the lines. This handles low-contrast cases, such as a white card on a white table.
3. **Scoring:** each candidate is scored on how much of the frame it fills, how close its aspect ratio is to the selected document type (ID-1 card ≈ 1.586, A4 ≈ 1.414, passport), how close its corner angles are to 90°, how strong its edges are, and how well it matches the previous frame (IoU).
4. **Smoothing the outline:** each corner gets a constant-velocity Kalman filter. A shape is only shown after several consecutive frames of agreement and hidden after several frames of absence, so the outline doesn't flicker. The overlay interpolates between detections so it renders at 60fps. Target jitter is under 2 px RMS when the phone is still.
5. **Fallback if the KPIs are missed:** a small segmentation model (ONNX Runtime Web) can plug in through the same `Detector` interface. It is a v1.1 option, not part of the first release.

## 3. Quality checks and user guidance

Each candidate gets these scores:

| Check     | Method                                                                                       |
| --------- | -------------------------------------------------------------------------------------------- |
| Sharpness | Variance of the Laplacian inside the document area, scaled for area                          |
| Glare     | Share of overexposed pixels, plus the size of the largest bright patch                       |
| Lighting  | Mean brightness and contrast                                                                 |
| Distance  | Share of the frame the document fills (too small means move closer, too large means move back) |
| Tilt      | How far the outline is from a rectangle                                                      |
| Motion    | Difference from the previous frame, plus how far the corners moved                           |
| Cropping  | Any corner touching the edge of the frame                                                    |

**Guidance state machine:** `INIT → SEARCHING → {MOVE_CLOSER | MOVE_BACK | ALIGN | REDUCE_GLARE | MORE_LIGHT | HOLD_STILL} → CAPTURING → REVIEW`.

- Only one message shows at a time, chosen in priority order.
- Each message stays up for at least ~800 ms so the text doesn't flicker.
- Messages can be translated (i18n), are announced through `aria-live`, and can trigger vibration where supported.

## 4. Auto-capture (on by default, can be turned off)

- **Trigger:** every check must pass continuously for ~500 ms.
- **Best-frame choice:** the SDK keeps the last ~8 good frames and picks the sharpest.
- **Full-res capture:** it uses `ImageCapture.takePhoto` where supported, otherwise a full-resolution video frame.
- **Avoiding false captures:** the shape and sharpness checks run again on the full-resolution image. If they fail, the capture is silently discarded and detection carries on.
- **Manual capture:** a shutter button is always available. Its prompt becomes more visible after a timeout (~8 s by default).
- **Review screen** (optional): lets the user retake. It is on by default in the React UI.

## 5. Perspective correction and output

- The four corners are scaled up to full-resolution coordinates. Then `getPerspectiveTransform` and `warpPerspective` correct the perspective. Output sizes are set per document type, for example ID-1 at 300 DPI is 1011×638.
- Optional processing steps: white balance, contrast adjustment, and 90° rotation correction.
- **Output object:**

  ```ts
  interface CaptureResult {
    image: Blob;                 // jpeg | webp | png; quality is configurable
    width: number; height: number;
    documentType: DocumentType;
    corners: Quad;               // corner positions in the source frame
    quality: QualityScores;
    captureMode: 'auto' | 'manual';
    timings: { startedAt: number; capturedAt: number };
    original?: Blob;             // only if includeOriginal: true (off by default)
  }
  ```

- No EXIF data is written, so there is no location and no device serial.

## 6. Privacy-first defaults

- **On device only:** all processing happens on the device. The SDK makes no network calls apart from loading the WASM file, and that URL is configurable or self-hosted.
- **No telemetry:** none by default. An optional `onMetrics` callback reports only numbers (timings, scores) and never images.
- **Nothing persisted:** no localStorage or IndexedDB, and no caching of images.
- **Cleanup on stop or unmount:** camera tracks are stopped, canvases are cleared, buffers are zeroed, and the worker is shut down.
- **CSP:** works under a strict Content Security Policy that adds only `wasm-unsafe-eval`. The required policy will be documented.
- **OCR plugins** must declare `runsOnDevice: boolean`. A plugin that sends data off the device needs an explicit `allowRemoteProcessing: true`.

## 7. Public API (stable, typed)

```ts
// core
const capture = createDocumentCapture({
  container, documentTypes: ['id-card', 'passport', 'a4'],
  autoCapture: true, output: { format: 'jpeg', quality: 0.92 },
  wasmUrl, locale, plugins: [ocrPlugin],
});
capture.on('guidance' | 'detection' | 'capture' | 'error', handler);
await capture.start(); capture.captureNow(); capture.stop(); capture.destroy();

// react
<DocumentCapture documentType="id-card" onCapture={r => …} onError={e => …} />
const { state, guidance, quad, start, captureNow } = useDocumentCapture(opts);

// OCR plugin interface
interface OcrPlugin {
  id: string; runsOnDevice: boolean;
  init(): Promise<void>;
  recognize(img: ImageBitmap, ctx: { documentType: DocumentType }): Promise<OcrResult>;
  dispose(): void;
}
```

- **Errors** are typed: `PermissionDenied`, `NoCamera`, `InsecureContext`, `WasmLoadFailed`, `Unsupported`.
- **Versioning:** semantic versioning, with API Extractor reports checked in CI so any API change is caught in review. Changesets generates release notes.
- **Docs:** TypeDoc for the API reference, plus a docs site covering quick start, React and non-React setup, CSP and self-hosting, a privacy statement, theming and i18n, a guide to writing OCR plugins, and troubleshooting.

## 8. Measuring the success criteria

Each target needs an exact definition before work starts.

| KPI                          | Definition                                                                                    | How it's measured                |
| ---------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- |
| ≥95% capture success         | Sessions with a valid capture within 15 s ÷ sessions where a document is shown                | Bench harness and pilot sessions |
| Median time-to-capture ≤4 s  | From first frame with a document to the capture event, in normal light (≥300 lux)             | Bench harness                    |
| False captures ≤2%           | Auto-captures whose corner IoU with ground truth is under 0.9, or that are blurry, glary or cropped | Labelled dataset            |
| Stable outline               | Corner jitter under 2 px RMS when still, and under 1% of frames with flicker                  | Bench harness                    |

- **Dataset:** 300 or more recorded videos covering document types, backgrounds, lighting, glare and hand shake, with corners labelled on key frames.
- **Harness:** replays the videos as fake camera input in headless Chromium (`--use-file-for-fake-video-capture`). It runs in CI and fails if any KPI drops.
- **Supported environments** (to confirm with the team):
  - Chrome Android 100 and later, Safari iOS 15 and later, and current desktop Chrome, Edge, Firefox and Safari.
  - A minimum device tier, for example a mid-range Android phone from 2020.
  - Light of 100 lux or more.
- **Performance budgets** (mid-range device):
  - Detection: ≤35 ms per frame.
  - JavaScript bundle: ≤60 KB gzipped, not counting the WASM.
  - Cold WASM load: ≤3 s on 4G.

## 9. Phases (about 12–14 weeks with 2–3 engineers)

| Phase                         | Weeks | Deliverables                                                                                                   |
| ----------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| 0. Spike                      | 1–2   | Custom OpenCV build and its size, worker pipeline prototype, iOS camera quirks, dataset collection started    |
| 1. Core engine                | 3–5   | Camera layer, detector (contours and Hough), smoothing, overlay, unit tests (Vitest) for geometry             |
| 2. Guidance and auto-capture  | 6–8   | Quality checks, state machine, auto-capture with best-frame choice and full-res re-check, React package, demo app |
| 3. Output, privacy, plugins   | 8–9   | Perspective warp and encoding, cleanup, CSP and self-hosting, OCR plugin interface with a sample plugin       |
| 4. Hardening                  | 10–12 | Bench harness in CI, real-device testing (BrowserStack), threshold tuning against KPIs, accessibility review, memory soak tests |
| 5. Release                    | 13–14 | API freeze, docs site, security and privacy review, pilot with a host app, v1.0.0 published                   |

## 10. Main risks and how they're handled

- **Classic edge detection struggles on low-contrast backgrounds.** Mitigations: a second detection strategy, guidance that tells users to "place on a dark surface", and the ML detector as a fallback through the same interface.
- **OpenCV download size.** Mitigations: the custom build, lazy loading, `prewarm()`, and long-lived caching.
- **iOS Safari limits:** autofocus control, missing `ImageCapture`, older `OffscreenCanvas` support. Mitigations: feature detection with fallbacks, and full-resolution capture from the video track.
- **Glare on laminated IDs.** Mitigations: specific glare guidance (tilt slightly), and rejecting frames where the glare covers text areas.
- **Slow low-end devices.** Mitigation: the detection rate and working resolution scale down to match device speed.

## Open decisions

- The minimum device and browser support matrix.
- Which document types ship in v1.
- Whether a v1.1 ML detector fallback is acceptable if classic CV misses the 95% target.
