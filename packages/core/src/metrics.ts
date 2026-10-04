import type { GuidanceState, QualityScores } from './types';

/**
 * Numbers-only telemetry passed to `onMetrics`. Never contains images,
 * text, or anything that identifies the user or device.
 */
export type CaptureMetrics =
  | { type: 'init'; loadMs: number; simd: boolean }
  | { type: 'frame'; workerMs: number; roundTripMs: number; detected: boolean; liveMats: number }
  | { type: 'guidance'; state: GuidanceState; at: number }
  | {
      type: 'capture';
      mode: 'auto' | 'manual';
      /** From `start()` to capture. */
      totalMs: number;
      /** From the first frame with a document to capture. */
      timeToCaptureMs: number | null;
      finalizeMs: number;
      quality: QualityScores;
      /** Size of the frame the document was cut from. */
      sourceWidth: number;
      sourceHeight: number;
    }
  | { type: 'capture-rejected'; reason: string; finalizeMs: number };
