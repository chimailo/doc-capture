# Quick start

## 1. Install

```sh
npm install @doc-capture/react @doc-capture/opencv-build
# without React: npm install @doc-capture/core @doc-capture/opencv-build
```

## 2. Host the OpenCV files

Copy the WebAssembly build into your static files. It is served from your own origin, and that is the only download the SDK makes.

```sh
cp -r node_modules/@doc-capture/opencv-build/dist public/opencv
```

See [CSP and self-hosting](./csp) for caching headers and integrity hashes.

## 3. Render the capture screen

```tsx
import { DocumentCapture } from '@doc-capture/react';

export function ScanId({ onDone }: { onDone: (image: Blob) => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <DocumentCapture
        documentType="id-card"
        wasmUrl="/opencv/"
        onCapture={(result) => onDone(result.image)}
        onError={(error) => console.warn(error.code)}
      />
    </div>
  );
}
```

The component:

1. Asks for the rear camera.
2. Outlines the document live.
3. Shows one guidance message at a time ("Move closer", "Hold still" and so on).
4. Captures automatically once every quality check has passed for half a second.
5. Shows a review screen with **Retake** and **Use photo**.

`onCapture` receives a [`CaptureResult`](/api/): a perspective-corrected JPEG at 1011×638 for ID cards, plus the corners and quality scores.

## 4. Load OpenCV early (optional)

Loading OpenCV takes about a second on 4G. Start it on the screen before the capture screen:

```ts
import { prewarm } from '@doc-capture/react';

prewarm({ wasmUrl: '/opencv/' });
```

## Bundler notes

The SDK starts its worker with `new Worker(new URL('./worker.js', import.meta.url))`, which Vite, webpack 5, Rollup and esbuild all support. With Vite, keep the packages out of dependency pre-bundling:

```ts
// vite.config.ts
export default { optimizeDeps: { exclude: ['@doc-capture/core', '@doc-capture/react'] } };
```
