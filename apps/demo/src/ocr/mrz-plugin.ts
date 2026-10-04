import type { OcrPlugin, OcrResult } from '@doc-capture/ocr-types';
import { findMrzLines, parseTd3 } from './mrz';

type TesseractWorker = {
  recognize(img: HTMLCanvasElement | OffscreenCanvas): Promise<{ data: { text: string; confidence: number } }>;
  setParameters(p: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
};

/**
 * Sample on-device OCR plugin: reads the passport MRZ with Tesseract.js.
 * All Tesseract files are self-hosted under /tesseract/ (see
 * scripts/copy-tesseract.mjs), so nothing leaves the device.
 */
export function mrzPlugin(base = `${import.meta.env.BASE_URL}tesseract/`): OcrPlugin {
  let worker: TesseractWorker | null = null;

  return {
    id: 'mrz',
    runsOnDevice: true,

    async init() {
      // Loaded only when the plugin is used.
      const { createWorker } = await import('tesseract.js');
      worker = (await createWorker('eng', 1, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base,
        workerBlobURL: false,
        gzip: false,
        cacheMethod: 'none',
      })) as unknown as TesseractWorker;
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
      });
    },

    async recognize(img): Promise<OcrResult> {
      if (!worker) throw new Error('MRZ plugin not initialised');
      // The MRZ is the bottom ~22% of a passport data page.
      const top = Math.round(img.height * 0.76);
      const h = img.height - top;
      const canvas = new OffscreenCanvas(img.width, h);
      canvas.getContext('2d')!.drawImage(img, 0, top, img.width, h, 0, 0, img.width, h);
      const { data } = await worker.recognize(canvas);
      canvas.width = canvas.height = 0;

      const lines = findMrzLines(data.text);
      const td3 = lines.length >= 2 ? parseTd3(lines[lines.length - 2]!, lines[lines.length - 1]!) : null;
      const confidence = data.confidence / 100;
      const fields = td3
        ? Object.entries(td3)
            .filter(([k]) => k !== 'valid')
            .map(([name, value]) => ({ name, value: String(value), confidence }))
            .concat(
              Object.entries(td3.valid).map(([k, ok]) => ({
                name: `${k}CheckDigitValid`,
                value: String(ok),
                confidence: 1,
              })),
            )
        : [];
      return { text: data.text, mrz: lines, fields };
    },

    dispose() {
      void worker?.terminate();
      worker = null;
    },
  };
}
