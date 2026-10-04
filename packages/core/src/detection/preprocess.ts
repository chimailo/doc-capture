import type { MatScope } from '../opencv/mat-scope';
import type { CV, Mat } from '../opencv/types';

/** Median of an 8-bit single-channel Mat, from a 256-bin histogram. */
export function medianOf(gray: Mat): number {
  const data = gray.data as Uint8Array;
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]!]!++;
  const half = data.length / 2;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= half) return v;
  }
  return 255;
}

export interface Preprocessed {
  gray: Mat;
  blurred: Mat;
  median: number;
}

/** Grayscale and blur. */
export function preprocess(cv: CV, scope: MatScope, rgba: Mat): Preprocessed {
  const gray = scope.track(new cv.Mat());
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  const blurred = scope.track(new cv.Mat());
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  return { gray, blurred, median: medianOf(blurred) };
}

/** Canny thresholds from the median brightness ("auto Canny"). */
export function autoThresholds(median: number, sigma = 0.33): [number, number] {
  const lower = Math.max(10, (1 - sigma) * median);
  const upper = Math.min(255, Math.max(lower + 20, (1 + sigma) * median));
  return [lower, upper];
}

/** Fixed low thresholds for low-contrast scenes (e.g. white card on white table). */
export const LOW_CONTRAST_THRESHOLDS: [number, number] = [30, 80];

/** Canny, then a morphological close to join broken edges. */
export function edgeMap(
  cv: CV,
  scope: MatScope,
  blurred: Mat,
  [lower, upper]: [number, number],
): Mat {
  const edges = scope.track(new cv.Mat());
  cv.Canny(blurred, edges, lower, upper);
  const kernel = scope.track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)));
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
  return edges;
}
