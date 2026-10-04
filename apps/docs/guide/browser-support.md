# Browser support

| Browser                 | Status    | Notes                                                                                           |
| ----------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Chrome Android 100+     | Supported | `ImageCapture.takePhoto()` gives full-sensor captures.                                          |
| Safari iOS 15–16.3      | Supported | No `OffscreenCanvas` in workers: frames are sent as pixels, and encoding runs on the main thread. |
| Safari iOS 16.4+        | Supported | Frames are sent as `ImageBitmap`s.                                                              |
| Desktop Chrome, Edge, Firefox, Safari (current) | Supported | Uses the webcam. Rear-camera preference is ignored.                  |

## Requirements

- A secure context (HTTPS or `localhost`). Otherwise `start()` rejects with `INSECURE_CONTEXT`.
- `getUserMedia` (`UNSUPPORTED` otherwise) and WebAssembly. SIMD is used when available.
- Light of about 100 lux or more. Below that, guidance asks for better light.

## Performance targets (mid-range 2020 Android phone)

| Metric                 | Budget       |
| ---------------------- | ------------ |
| Detection per frame    | ≤ 35 ms      |
| JS (core + React)      | ≤ 60 KB gzip (currently ~12 KB) |
| Worker JS              | ~8 KB gzip   |
| OpenCV WASM            | ≤ 3 MB gzip, loaded lazily and cacheable forever |
| Cold load on 4G        | ≤ 3 s        |

On slow devices the detection rate drops automatically: one frame is processed at a time, and the interval adapts to the measured round-trip time.
