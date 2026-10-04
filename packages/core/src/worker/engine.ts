import { DOCUMENT_SPECS } from '../document-types';
import { ClassicDetector } from '../detection/classic-detector';
import type { ImageDataLike } from '../detection/detector';
import { quadIoU, scaleQuad } from '../geometry';
import { withScope } from '../opencv/mat-scope';
import type { MatScope } from '../opencv/mat-scope';
import type { CV, Mat } from '../opencv/types';
import { rotateToSpec, stretchContrast, whiteBalance } from '../output/enhance';
import type { RawImage } from '../output/encode';
import { orientedSize, warpDocument } from '../output/warp';
import { evaluateQuality } from '../quality/evaluate';
import { MotionTracker, measureQuality } from '../quality/measure';
import type { Quad, Size } from '../types';
import type { FinalizeParams, ProcessParams, ProcessResult } from './protocol';

/** Long side used when re-detecting on the full-resolution frame. */
const VERIFY_LONG_SIDE = 960;
/** Minimum IoU between the preview quad and the full-resolution re-detection. */
const VERIFY_MIN_IOU = 0.85;

export type EngineFinalizeResult =
  | {
      ok: true;
      pixels: RawImage;
      corners: Quad;
      quality: ReturnType<typeof evaluateQuality>['scores'];
    }
  | { ok: false; reason: string };

/** Everything that runs in the worker, independent of message passing. */
export class Engine {
  private detector: ClassicDetector;
  private motion: MotionTracker;

  constructor(private cv: CV) {
    this.detector = new ClassicDetector(cv);
    this.motion = new MotionTracker(cv);
  }

  process(image: ImageDataLike, params: ProcessParams): Omit<ProcessResult, 'ms' | 'liveMats'> {
    const frame = { width: image.width, height: image.height };
    return withScope((scope) => {
      const { detection, gray } = this.detector.detectInScope(scope, {
        image,
        documentTypes: params.documentTypes,
        previous: params.previous,
      });
      const frameDiff = this.motion.frameDiff(scope, gray);
      const cornerShift = this.motion.cornerShift(detection?.quad ?? null, frame);
      if (!detection) return { detection: null, quality: null, sharpness: null, frame };
      const m = measureQuality(this.cv, scope, gray, detection.quad, frame, {
        frameDiff,
        cornerShift,
      });
      return {
        detection,
        quality: evaluateQuality(m, params.thresholds),
        sharpness: m.sharpness,
        frame,
      };
    });
  }

  /**
   * Re-checks the document on the full-resolution frame, then warps and
   * optionally enhances it. Pixel buffers in the WASM heap are zeroed before
   * they are released.
   */
  finalize(image: ImageDataLike, params: FinalizeParams): EngineFinalizeResult {
    const cv = this.cv;
    return withScope((scope) => {
      const frame = { width: image.width, height: image.height };
      const rgba = scope.track(cv.matFromImageData(image as ImageData));
      try {
        let corners = params.hint;
        let quality = evaluateQuality(
          { ...this.measureFull(scope, rgba, corners, frame), frameDiff: 0, cornerShift: 0 },
          params.thresholds,
        );

        // Re-detect on a downscaled copy to confirm the shape and refine corners.
        const k = Math.min(1, VERIFY_LONG_SIDE / Math.max(frame.width, frame.height));
        const small = scope.track(new cv.Mat());
        cv.resize(rgba, small, new cv.Size(Math.round(frame.width * k), Math.round(frame.height * k)), 0, 0, cv.INTER_AREA);
        const smallImage = { data: small.data as unknown as Uint8ClampedArray, width: small.cols, height: small.rows };
        const redetected = this.detector.detect({
          image: smallImage,
          documentTypes: [params.documentType],
          previous: scaleQuad(params.hint, k),
        });
        if (redetected) {
          const full = scaleQuad(redetected.quad, 1 / k);
          if (quadIoU(full, params.hint) >= VERIFY_MIN_IOU) {
            corners = full;
            quality = evaluateQuality(
              { ...this.measureFull(scope, rgba, corners, frame), frameDiff: 0, cornerShift: 0 },
              params.thresholds,
            );
          } else if (!params.force) {
            return { ok: false, reason: 'shape-mismatch' };
          }
        } else if (!params.force) {
          return { ok: false, reason: 'not-found' };
        }

        if (!params.force) {
          if (quality.scores.sharpness < 1) return { ok: false, reason: 'blurry' };
          if (quality.issues.includes('REDUCE_GLARE')) return { ok: false, reason: 'glare' };
          if (quality.scores.cropping < 1) return { ok: false, reason: 'cropped' };
        }

        const spec = DOCUMENT_SPECS[params.documentType].output;
        let out = warpDocument(cv, scope, rgba, corners, orientedSize(corners, params.output.size ?? spec));
        if (params.enhance.whiteBalance) whiteBalance(out);
        if (params.enhance.contrast) stretchContrast(cv, scope, out);
        if (params.enhance.autoRotate) out = rotateToSpec(cv, scope, out, spec);

        const pixels: RawImage = {
          data: new Uint8ClampedArray(out.data),
          width: out.cols,
          height: out.rows,
        };
        (out.data as Uint8Array).fill(0);
        return { ok: true, pixels, corners, quality: quality.scores };
      } finally {
        (rgba.data as Uint8Array).fill(0);
      }
    });
  }

  private measureFull(scope: MatScope, rgba: Mat, quad: Quad, frame: Size) {
    const cv = this.cv;
    const gray = scope.track(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const m = measureQuality(cv, scope, gray, quad, frame, { frameDiff: 0, cornerShift: 0 });
    (gray.data as Uint8Array).fill(0);
    return m;
  }

  reset() {
    this.motion.reset();
  }

  dispose() {
    this.motion.reset();
  }
}
