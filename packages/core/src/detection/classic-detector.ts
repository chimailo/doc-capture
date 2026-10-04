import { area } from '../geometry';
import { withScope } from '../opencv/mat-scope';
import type { MatScope } from '../opencv/mat-scope';
import type { CV, Mat } from '../opencv/types';
import type { Detection, Quad, Size } from '../types';
import { contourQuads } from './contours';
import type { Detector, DetectorInput } from './detector';
import { houghQuad } from './hough';
import { LOW_CONTRAST_THRESHOLDS, autoThresholds, edgeMap, preprocess } from './preprocess';
import { edgeSupport, scoreCandidate } from './scoring';

export interface ClassicDetectorOptions {
  /** Candidates scoring below this are ignored. Default 0.55. */
  minScore?: number;
  /** Run the Hough fallback. Default true. */
  houghFallback?: boolean;
  /**
   * If the best result covers less than this share of the frame, a
   * low-threshold pass also runs. Default 0.15.
   */
  secondPassBelowFill?: number;
}

export interface DetectionWithMats {
  detection: Detection | null;
  gray: Mat;
  edges: Mat;
}

/**
 * Contour detector. Runs a second, low-contrast pass (contours and Hough
 * lines) when the first pass finds nothing or only something small.
 */
export class ClassicDetector implements Detector {
  readonly id = 'classic';
  private opts: Required<ClassicDetectorOptions>;

  constructor(
    private cv: CV,
    options: ClassicDetectorOptions = {},
  ) {
    this.opts = { minScore: 0.55, houghFallback: true, secondPassBelowFill: 0.15, ...options };
  }

  detect(input: DetectorInput): Detection | null {
    return withScope((scope) => this.detectInScope(scope, input).detection);
  }

  /** Like `detect`, but leaves the intermediate Mats in `scope` for the quality checks. */
  detectInScope(scope: MatScope, input: DetectorInput): DetectionWithMats {
    const cv = this.cv;
    const rgba = scope.track(cv.matFromImageData(input.image as ImageData));
    const { gray, blurred, median } = preprocess(cv, scope, rgba);
    const frame: Size = { width: input.image.width, height: input.image.height };
    const frameArea = frame.width * frame.height;

    const pick = (edges: Mat, quads: Quad[], strategy: Detection['strategy']) => {
      const view = { data: edges.data as Uint8Array, cols: edges.cols, rows: edges.rows };
      let best: Detection | null = null;
      for (const quad of quads) {
        const s = scoreCandidate(
          quad,
          frame,
          input.documentTypes,
          edgeSupport(view, quad),
          input.previous,
        );
        if (s && s.total >= this.opts.minScore && (!best || s.total > best.confidence)) {
          best = { quad, confidence: s.total, documentType: s.documentType, strategy };
        }
      }
      return best;
    };
    const better = (a: Detection | null, b: Detection | null) =>
      !a ? b : !b ? a : b.confidence > a.confidence ? b : a;
    const small = (d: Detection | null) =>
      !d || area(d.quad) / frameArea < this.opts.secondPassBelowFill;

    let edges = edgeMap(cv, scope, blurred, autoThresholds(median));
    let detection = pick(edges, contourQuads(cv, scope, edges), 'contours');

    if (small(detection)) {
      const lowEdges = edgeMap(cv, scope, blurred, LOW_CONTRAST_THRESHOLDS);
      let low = pick(lowEdges, contourQuads(cv, scope, lowEdges), 'contours');
      if (small(low) && this.opts.houghFallback) {
        const q = houghQuad(cv, scope, lowEdges);
        low = better(low, q ? pick(lowEdges, [q], 'hough') : null);
      }
      // Prefer the larger document when the first pass only found an inner box.
      if (low && (!detection || area(low.quad) > area(detection.quad) * 1.5)) {
        detection = low;
        edges = lowEdges;
      } else {
        detection = better(detection, low);
      }
    }
    return { detection, gray, edges };
  }
}
