import type { DocumentType, OcrPlugin, OcrResult } from '@doc-capture/ocr-types';

export type { DocumentType, OcrPlugin, OcrResult };

export interface Point {
  x: number;
  y: number;
}

/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export interface Size {
  width: number;
  height: number;
}

/** Each score is 0–1, higher is better. */
export interface QualityScores {
  sharpness: number;
  glare: number;
  lighting: number;
  distance: number;
  tilt: number;
  motion: number;
  cropping: number;
}

export type QualityCheck = keyof QualityScores;

/** What a failing check tells the user to do. */
export type QualityIssue =
  | 'MOVE_CLOSER'
  | 'MOVE_BACK'
  | 'ALIGN'
  | 'REDUCE_GLARE'
  | 'MORE_LIGHT'
  | 'HOLD_STILL';

export interface QualityReport {
  scores: QualityScores;
  /** Failing checks, most important first. Empty when the frame is good. */
  issues: QualityIssue[];
  passed: boolean;
}

export interface Detection {
  quad: Quad;
  /** 0–1 candidate score. */
  confidence: number;
  documentType: DocumentType;
  strategy: 'contours' | 'hough' | 'model';
}

export type GuidanceState =
  | 'INIT'
  | 'SEARCHING'
  | QualityIssue
  | 'CAPTURING'
  | 'REVIEW';

export interface CaptureResult {
  /** Perspective-corrected image. */
  image: Blob;
  width: number;
  height: number;
  documentType: DocumentType;
  /** Corner positions in the full-resolution source frame. */
  corners: Quad;
  quality: QualityScores;
  captureMode: 'auto' | 'manual';
  timings: { startedAt: number; capturedAt: number };
  /** Full source frame. Only present with `includeOriginal: true`. */
  original?: Blob;
  ocr?: Record<string, OcrResult>;
}

export type OutputFormat = 'jpeg' | 'webp' | 'png';
