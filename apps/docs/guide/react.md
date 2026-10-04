# React

## `<DocumentCapture>`

The complete UI: camera view, outline, guidance banner, auto-capture countdown, shutter button, review screen and error screen.

| Prop                      | Default             | Description                                                                 |
| ------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `documentType`            | `'id-card'`         | `'id-card'`, `'passport'` or `'a4'`. Use `documentTypes` to accept several. |
| `onCapture(result)`       |                     | Called with the accepted capture (after review).                            |
| `onError(error)`          |                     | Typed errors: `PERMISSION_DENIED`, `NO_CAMERA`, `INSECURE_CONTEXT`, `WASM_LOAD_FAILED`, `UNSUPPORTED`. |
| `review`                  | `true`              | Show Retake / Use photo before calling `onCapture`.                         |
| `autoCapture`             | `true`              | Turn off to rely on the shutter button only.                                |
| `wasmUrl` / `opencv`      | `/opencv/`          | Where the OpenCV files live. See [CSP and self-hosting](./csp).             |
| `output`                  | jpeg, 0.92          | `{ format: 'jpeg' \| 'webp' \| 'png', quality, size? }`                     |
| `enhance`                 | none                | `{ whiteBalance, contrast, autoRotate }`                                    |
| `includeOriginal`         | `false`             | Also return the uncropped frame.                                            |
| `locale`, `messages`      | browser language    | See [Theming and i18n](./theming-i18n).                                     |
| `thresholds`              | defaults            | See [Quality thresholds](./thresholds).                                     |
| `plugins`                 | `[]`                | [OCR plugins](./ocr-plugins).                                               |
| `renderError`             |                     | Replace the default error screen.                                           |

Options are read when the component mounts. To change them, change the component's `key`.

## `useDocumentCapture()`

Build your own UI. The hook returns state and actions, and you attach `container` to the element the camera should fill.

```tsx
import { useDocumentCapture } from '@doc-capture/react';

function CustomCapture() {
  const { container, guidance, progress, state, captureNow, result } = useDocumentCapture({
    documentTypes: ['passport'],
    overlay: { strokeReady: '#0a84ff' },
  });
  return (
    <div style={{ position: 'relative', height: '100dvh' }}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      <p role="status">{guidance.message}</p>
      <button disabled={state !== 'running'} onClick={captureNow}>
        Capture {progress > 0 && `(${Math.round(progress * 100)}%)`}
      </button>
      {result && <img src={URL.createObjectURL(result.image)} alt="" />}
    </div>
  );
}
```
