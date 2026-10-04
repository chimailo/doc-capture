# Writing an OCR plugin

The SDK does not include OCR. A plugin runs on the straightened image after capture, and its result is attached to `CaptureResult.ocr[plugin.id]`.

```ts
import type { OcrPlugin } from '@doc-capture/ocr-types';

export const myPlugin: OcrPlugin = {
  id: 'my-ocr',
  runsOnDevice: true, // false if any image data leaves the device
  async init() {
    // Load models. Called once, when capture starts.
  },
  async recognize(image, { documentType }) {
    // image: ImageBitmap of the perspective-corrected document
    return { text: '…', fields: [{ name: 'documentNumber', value: 'L898902C3', confidence: 0.98 }] };
  },
  dispose() {
    // Release workers and models. Called from destroy().
  },
};

createDocumentCapture({ plugins: [myPlugin] });
```

## Remote processing needs an explicit opt-in

A plugin with `runsOnDevice: false` is refused with `RemotePluginNotAllowed` unless the host passes `allowRemoteProcessing: true`. This keeps any upload visible in code review.

## Sample: passport MRZ with Tesseract.js

`apps/demo/src/ocr/` contains an on-device plugin that reads the two-line MRZ of a passport data page and validates the ICAO 9303 check digits. Tesseract's worker, WASM core and `eng.traineddata` are self-hosted (`apps/demo/scripts/copy-tesseract.mjs`), so nothing goes to a third party.

Tips:

- Crop to the region you need. The MRZ is the bottom ~22% of the page, and cropping makes recognition several times faster.
- Restrict the character set (`tessedit_char_whitelist`) for structured fields.
- Load the OCR engine lazily (`await import(...)`) so it does not add to your main bundle.
- Check results with check digits, or ask the user to confirm. Do not trust raw OCR.
