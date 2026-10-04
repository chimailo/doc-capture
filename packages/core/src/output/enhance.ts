import type { MatScope } from '../opencv/mat-scope';
import type { CV, Mat } from '../opencv/types';
import type { Size } from '../types';

/** Gray-world white balance on an RGBA image, in place. */
export function whiteBalance(rgba: Mat): void {
  const d = rgba.data as Uint8Array;
  const sums = [0, 0, 0];
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    sums[0]! += d[i]!;
    sums[1]! += d[i + 1]!;
    sums[2]! += d[i + 2]!;
  }
  const means = sums.map((s) => s / n);
  const gray = (means[0]! + means[1]! + means[2]!) / 3;
  // Limit the correction so strongly coloured documents are not washed out.
  const gains = means.map((m) => Math.max(0.7, Math.min(1.4, m > 0 ? gray / m : 1)));
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i]! * gains[0]!);
    d[i + 1] = Math.min(255, d[i + 1]! * gains[1]!);
    d[i + 2] = Math.min(255, d[i + 2]! * gains[2]!);
  }
}

/** Linear stretch so the 1st–99th brightness percentiles span 0–255, in place. */
export function stretchContrast(cv: CV, scope: MatScope, rgba: Mat): void {
  const gray = scope.track(new cv.Mat());
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  const g = gray.data as Uint8Array;
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]!]!++;
  const pct = (p: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v]!;
      if (acc >= g.length * p) return v;
    }
    return 255;
  };
  const lo = pct(0.01);
  const hi = pct(0.99);
  if (hi - lo < 10) return;
  const alpha = 255 / (hi - lo);
  const d = rgba.data as Uint8Array;
  for (let i = 0; i < d.length; i++) {
    if (i % 4 !== 3) d[i] = Math.max(0, Math.min(255, (d[i]! - lo) * alpha));
  }
}

/** Rotates 90° when the image orientation does not match the document spec. */
export function rotateToSpec(cv: CV, scope: MatScope, rgba: Mat, spec: Size): Mat {
  const imgLandscape = rgba.cols >= rgba.rows;
  const specLandscape = spec.width >= spec.height;
  if (imgLandscape === specLandscape) return rgba;
  const out = scope.track(new cv.Mat());
  cv.rotate(rgba, out, cv.ROTATE_90_COUNTERCLOCKWISE);
  return out;
}
