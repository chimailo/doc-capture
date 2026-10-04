/// <reference lib="webworker" />
import type { ImageDataLike } from '../detection/detector';
import { DocumentCaptureError } from '../errors';
import { encodePixels } from '../output/encode';
import { loadOpenCv, supportsWasmSimd } from '../opencv/loader';
import { liveMatCount } from '../opencv/mat-scope';
import { Engine } from './engine';
import type { FinalizeResult, FramePayload, FromWorker, InitResult, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let engine: Engine | null = null;
let readCanvas: OffscreenCanvas | null = null;

/** Turns a transferred frame into RGBA pixels and releases the source. */
function toPixels(frame: FramePayload): ImageDataLike {
  if (frame.kind === 'pixels') return frame;
  const { bitmap, width, height } = frame;
  if (!readCanvas || readCanvas.width !== width || readCanvas.height !== height) {
    readCanvas = new OffscreenCanvas(width, height);
  }
  const ctx = readCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, width, height);
  return img;
}

function wipe(img: ImageDataLike) {
  img.data.fill(0);
}

function reply(msg: FromWorker, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

async function handle(msg: ToWorker): Promise<void> {
  switch (msg.type) {
    case 'init': {
      const t0 = performance.now();
      const cv = await loadOpenCv(msg.opencv);
      engine = new Engine(cv);
      const result: InitResult = {
        simd: msg.opencv.variant !== 'stock' && (msg.opencv.simd ?? supportsWasmSimd()),
        offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
        loadMs: performance.now() - t0,
      };
      return reply({ type: 'result', id: msg.id, result });
    }
    case 'process': {
      if (!engine) throw new DocumentCaptureError('INTERNAL', 'Worker not initialised.');
      const t0 = performance.now();
      const img = toPixels(msg.frame);
      const out = engine.process(img, msg.params);
      wipe(img);
      const result = { ...out, ms: performance.now() - t0, liveMats: liveMatCount() };
      return reply({ type: 'result', id: msg.id, result });
    }
    case 'finalize': {
      if (!engine) throw new DocumentCaptureError('INTERNAL', 'Worker not initialised.');
      const t0 = performance.now();
      const img = toPixels(msg.frame);
      const { params } = msg;
      try {
        const r = engine.finalize(img, params);
        if (!r.ok) {
          const result: FinalizeResult = { ok: false, reason: r.reason, ms: performance.now() - t0 };
          return reply({ type: 'result', id: msg.id, result });
        }
        const canEncode = typeof OffscreenCanvas !== 'undefined';
        const image = canEncode
          ? await encodePixels(r.pixels, params.output.format, params.output.quality)
          : r.pixels;
        const original =
          params.includeOriginal && canEncode
            ? await encodePixels(
                { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height },
                params.output.format,
                params.output.quality,
              )
            : params.includeOriginal
              ? { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height }
              : undefined;
        if (canEncode) wipe(r.pixels);
        const result = {
          ok: true,
          image,
          original,
          width: r.pixels.width,
          height: r.pixels.height,
          corners: r.corners,
          quality: r.quality,
          ms: performance.now() - t0,
        };
        const transfer: Transferable[] = [];
        if (!(image instanceof Blob)) transfer.push(image.data.buffer);
        if (original && !(original instanceof Blob)) transfer.push(original.data.buffer);
        return reply({ type: 'result', id: msg.id, result }, transfer);
      } finally {
        wipe(img);
      }
    }
    case 'reset': {
      engine?.reset();
      return reply({ type: 'result', id: msg.id, result: null });
    }
    case 'dispose': {
      engine?.dispose();
      engine = null;
      if (readCanvas) {
        readCanvas.width = 0;
        readCanvas.height = 0;
        readCanvas = null;
      }
      reply({ type: 'result', id: msg.id, result: null });
      self.close();
      return;
    }
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  handle(e.data).catch((err: unknown) => {
    const code = err instanceof DocumentCaptureError ? err.code : 'INTERNAL';
    const message = err instanceof Error ? err.message : String(err);
    reply({ type: 'error', id: e.data.id, code, message });
  });
};
