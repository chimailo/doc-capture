# Without React

```ts
import { createDocumentCapture } from '@doc-capture/core';

const capture = createDocumentCapture({
  container: document.getElementById('camera')!, // the SDK renders video + outline here
  documentTypes: ['id-card', 'passport'],
  wasmUrl: '/opencv/',
});

capture.on('guidance', ({ message }) => (statusEl.textContent = message));
capture.on('detection', ({ progress }) => (ringEl.style.setProperty('--p', String(progress))));
capture.on('shutterHint', () => shutterEl.classList.add('pulse'));
capture.on('capture', (result) => upload(result.image));
capture.on('error', (e) => showError(e.code));

await capture.start();
shutterEl.onclick = () => capture.captureNow();

// Later:
await capture.destroy(); // stops the camera, terminates the worker, removes elements
```

## Lifecycle

| Method          | Effect                                                                                  |
| --------------- | --------------------------------------------------------------------------------------- |
| `start()`       | Loads OpenCV (unless prewarmed), opens the camera, starts guidance. Rejects with a typed error. |
| `captureNow()`  | Captures immediately without waiting for the quality checks.                            |
| `retake()`      | With `review: true`, leaves the review step and resumes detection.                      |
| `stop()`        | Stops the camera and detection. `start()` can be called again.                          |
| `destroy()`     | Also terminates the worker and removes everything the SDK created.                      |

## Events

| Event         | Payload                                                         |
| ------------- | --------------------------------------------------------------- |
| `status`      | `'idle' \| 'loading' \| 'running' \| 'capturing' \| 'review' \| 'stopped' \| 'destroyed'` |
| `guidance`    | `{ state, message }`. One message at a time, shown for at least 800 ms.                    |
| `detection`   | `{ quad, frame, quality, progress }` after every processed frame                           |
| `capture`     | `CaptureResult`                                                 |
| `error`       | `DocumentCaptureError` with a `code`                            |
| `shutterHint` | Fired once after 8 s without a capture                          |

## Bring your own video element

Pass `video` (and optionally `overlayCanvas`) instead of `container` to use elements you already render. Pass `overlay: false` and draw the outline yourself with `capture.quadAt(performance.now())` and `coverTransform()`.
