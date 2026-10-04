/**
 * OCR plugin contract for `@doc-capture/core`.
 *
 * @packageDocumentation
 */

/** Document kinds the capture SDK understands. */
export type DocumentType = 'id-card' | 'passport' | 'a4';

/** One recognised piece of text. */
export interface OcrField {
  /** Field name, e.g. `surname`, `documentNumber`, or `line` for raw text. */
  name: string;
  value: string;
  /** 0–1. */
  confidence: number;
  /** Bounding box in output-image pixels. */
  box?: { x: number; y: number; width: number; height: number };
}

export interface OcrResult {
  fields: OcrField[];
  /** All recognised text, in reading order. */
  text: string;
  /** Raw machine-readable zone lines, when found. */
  mrz?: string[];
}

export interface OcrContext {
  documentType: DocumentType;
}

/**
 * An OCR engine that runs on the captured, perspective-corrected image.
 *
 * Plugins that send data off the device must set `runsOnDevice: false`. The SDK
 * refuses to load them unless the host passes `allowRemoteProcessing: true`.
 */
export interface OcrPlugin {
  /** Stable identifier, e.g. `tesseract`. */
  id: string;
  /** `true` only if no image data ever leaves the device. */
  runsOnDevice: boolean;
  init(): Promise<void>;
  recognize(img: ImageBitmap, ctx: OcrContext): Promise<OcrResult>;
  dispose(): void;
}
