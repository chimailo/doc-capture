import { area, maxAngleDeviation, minEdgeMargin } from '../geometry';
import type { MatScope } from '../opencv/mat-scope';
import type { CV, Mat } from '../opencv/types';
import type { Quad, Size } from '../types';
import type { QualityMeasurements } from './evaluate';

/** Size of the normalised document patch used for sharpness, glare and lighting. */
export const PATCH: Size = { width: 400, height: 252 };

/** Warps the document region of `gray` to a fixed-size patch. */
export function warpPatch(cv: CV, scope: MatScope, gray: Mat, quad: Quad, size: Size = PATCH): Mat {
  const landscape =
    Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y) >=
    Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
  const w = landscape ? size.width : size.height;
  const h = landscape ? size.height : size.width;
  const src = scope.track(cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y])));
  const dst = scope.track(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]));
  const m = scope.track(cv.getPerspectiveTransform(src, dst));
  const patch = scope.track(new cv.Mat());
  cv.warpPerspective(gray, patch, m, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  return patch;
}

export function laplacianVariance(cv: CV, scope: MatScope, patch: Mat): number {
  const lap = scope.track(new cv.Mat());
  cv.Laplacian(patch, lap, cv.CV_64F, 3);
  const mean = scope.track(new cv.Mat());
  const std = scope.track(new cv.Mat());
  cv.meanStdDev(lap, mean, std);
  return (std.data64F[0] ?? 0) ** 2;
}

/**
 * Laplacian variance divided by the patch's intensity variance, so the score
 * does not depend on how much contrast the document has. The contrast floor
 * keeps nearly blank patches from producing huge values.
 */
export function normalisedSharpness(laplacianVar: number, contrast: number): number {
  return laplacianVar / Math.max(10, contrast) ** 2;
}

export function glare(cv: CV, scope: MatScope, patch: Mat) {
  const bright = scope.track(new cv.Mat());
  cv.threshold(patch, bright, 249, 255, cv.THRESH_BINARY);
  const total = patch.rows * patch.cols;
  const overexposed = cv.countNonZero(bright);
  let largest = 0;
  if (overexposed > 0) {
    const labels = scope.track(new cv.Mat());
    const stats = scope.track(new cv.Mat());
    const centroids = scope.track(new cv.Mat());
    const n = cv.connectedComponentsWithStats(bright, labels, stats, centroids, 8, cv.CV_32S);
    const s = stats.data32S;
    // Row 0 is the background; column 4 is the area.
    for (let i = 1; i < n; i++) largest = Math.max(largest, s[i * 5 + 4]!);
  }
  return { overexposedFraction: overexposed / total, largestGlareBlob: largest / total };
}

export function brightness(cv: CV, scope: MatScope, patch: Mat) {
  const mean = scope.track(new cv.Mat());
  const std = scope.track(new cv.Mat());
  cv.meanStdDev(patch, mean, std);
  return { meanBrightness: mean.data64F[0] ?? 0, contrast: std.data64F[0] ?? 0 };
}

/**
 * Keeps a small copy of the previous frame to measure motion between frames.
 * Lives in the worker for the whole session.
 */
export class MotionTracker {
  private previous: Mat | null = null;
  private previousQuad: Quad | null = null;

  constructor(
    private cv: CV,
    private width = 160,
  ) {}

  /** Mean absolute difference from the previous frame, 0–255. */
  frameDiff(scope: MatScope, gray: Mat): number | null {
    const cv = this.cv;
    const h = Math.max(1, Math.round((gray.rows * this.width) / gray.cols));
    const small = new cv.Mat();
    cv.resize(gray, small, new cv.Size(this.width, h), 0, 0, cv.INTER_AREA);
    let diff: number | null = null;
    if (this.previous && this.previous.rows === small.rows && this.previous.cols === small.cols) {
      const d = scope.track(new cv.Mat());
      cv.absdiff(small, this.previous, d);
      diff = cv.mean(d)[0] ?? 0;
    }
    this.previous?.delete();
    this.previous = small;
    return diff;
  }

  /** Mean corner movement since the last detection, as a share of the diagonal. */
  cornerShift(quad: Quad | null, frame: Size): number | null {
    const prev = this.previousQuad;
    this.previousQuad = quad;
    if (!quad || !prev) return null;
    const diag = Math.hypot(frame.width, frame.height);
    return quad.reduce((s, p, i) => s + Math.hypot(p.x - prev[i]!.x, p.y - prev[i]!.y), 0) / 4 / diag;
  }

  reset() {
    this.previous?.delete();
    this.previous = null;
    this.previousQuad = null;
  }
}

export function measureQuality(
  cv: CV,
  scope: MatScope,
  gray: Mat,
  quad: Quad,
  frame: Size,
  motion: { frameDiff: number | null; cornerShift: number | null },
): QualityMeasurements {
  const patch = warpPatch(cv, scope, gray, quad);
  const light = brightness(cv, scope, patch);
  return {
    sharpness: normalisedSharpness(laplacianVariance(cv, scope, patch), light.contrast),
    ...glare(cv, scope, patch),
    ...light,
    fill: area(quad) / (frame.width * frame.height),
    tiltDegrees: maxAngleDeviation(quad),
    edgeMargin: minEdgeMargin(quad, frame) / Math.min(frame.width, frame.height),
    ...motion,
  };
}
