import type { ErrorCode } from '../errors';
import type { OpenCvConfig } from '../opencv/loader';
import type { RawImage } from '../output/encode';
import type { QualityThresholds } from '../quality/thresholds';
import type {
  Detection,
  DocumentType,
  OutputFormat,
  Quad,
  QualityReport,
  QualityScores,
  Size,
} from '../types';

/** A frame sent to the worker. Its buffer or bitmap is transferred, not copied. */
export type FramePayload =
  | { kind: 'bitmap'; bitmap: ImageBitmap; width: number; height: number }
  | { kind: 'pixels'; data: Uint8ClampedArray; width: number; height: number };

export interface ProcessParams {
  documentTypes: DocumentType[];
  /** Last smoothed quad in this frame's coordinates. */
  previous: Quad | null;
  thresholds: QualityThresholds;
}

export interface EnhanceOptions {
  whiteBalance?: boolean;
  contrast?: boolean;
  /** Rotate so the long side is horizontal for cards / vertical for A4. */
  autoRotate?: boolean;
}

export interface FinalizeParams {
  /** Quad from the live preview, scaled to this frame's coordinates. */
  hint: Quad;
  documentType: DocumentType;
  documentTypes: DocumentType[];
  /** Skip re-verification (manual capture). */
  force: boolean;
  thresholds: QualityThresholds;
  /** `size` overrides the document type's default output size. */
  output: { format: OutputFormat; quality: number; size?: Size };
  enhance: EnhanceOptions;
  includeOriginal: boolean;
}

export type ToWorker =
  | { type: 'init'; id: number; opencv: OpenCvConfig }
  | { type: 'process'; id: number; frame: FramePayload; params: ProcessParams }
  | { type: 'finalize'; id: number; frame: FramePayload; params: FinalizeParams }
  | { type: 'reset'; id: number }
  | { type: 'dispose'; id: number };

export interface ProcessResult {
  detection: Detection | null;
  quality: QualityReport | null;
  frame: Size;
  /** Worker-side processing time in ms. */
  ms: number;
}

export type FinalizeResult =
  | {
      ok: true;
      /** Raw pixels when the worker has no OffscreenCanvas to encode with. */
      image: Blob | RawImage;
      width: number;
      height: number;
      corners: Quad;
      quality: QualityScores;
      original?: Blob | RawImage;
      ms: number;
    }
  | { ok: false; reason: string; ms: number };

export interface InitResult {
  simd: boolean;
  offscreenCanvas: boolean;
  loadMs: number;
}

export type FromWorker =
  | { type: 'result'; id: number; result: unknown }
  | { type: 'error'; id: number; code: ErrorCode; message: string };
