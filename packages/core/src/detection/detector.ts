import type { Detection, DocumentType, Quad } from '../types';

/** Pixel data in RGBA order, as in `ImageData`. */
export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface DetectorInput {
  image: ImageDataLike;
  documentTypes: readonly DocumentType[];
  /** Last accepted detection in the same coordinates, for temporal scoring. */
  previous: Quad | null;
}

/**
 * Finds a document in a frame. The classic OpenCV detector implements this;
 * an ML segmentation model can implement it too and be swapped in.
 */
export interface Detector {
  readonly id: string;
  detect(input: DetectorInput): Detection | null;
  dispose?(): void;
}
