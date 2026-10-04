# @doc-capture/opencv-build

A custom OpenCV.js build containing only the `core` and `imgproc` functions the SDK uses (see `opencv_js.config.py`). It is built twice, with and without WASM SIMD.

| Command            | What it does                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm build`       | Builds in Docker (Emscripten 3.1.64, OpenCV 4.10.0), then writes `dist/manifest.json`          |
| `pnpm build:stock` | Copies the stock ~10 MB `opencv.js` instead. Use it for local development without Docker only. |
| `pnpm copy-to DIR` | Copies `dist/` into a host app's static folder for self-hosting                                 |

`dist/manifest.json` lists the SRI hash (`sha384-…`) and gzipped size of every file. The build fails if a `.wasm` file is over 3 MB gzipped.

## Output

```
dist/opencv-simd.js   dist/opencv-simd.wasm   # used when WASM SIMD is supported
dist/opencv.js        dist/opencv.wasm        # fallback
dist/manifest.json
```

Pass the URLs and hashes to the SDK:

```ts
createDocumentCapture({
  opencv: {
    baseUrl: '/opencv/',
    integrity: manifest.files, // optional, recommended
  },
});
```

Serve the files with long-lived caching (`Cache-Control: public, max-age=31536000, immutable`) under a versioned path.

## Adding a function

Add it to `opencv_js.config.py` and to the `CV` type in `packages/core/src/opencv/types.ts`, then rebuild.
