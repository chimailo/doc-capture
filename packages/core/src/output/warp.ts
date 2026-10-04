import { dist } from '../geometry';
import type { MatScope } from '../opencv/mat-scope';
import type { CV, Mat } from '../opencv/types';
import type { Quad, Size } from '../types';

/**
 * Output size for a quad: the spec's size, swapped if the document appears
 * in the other orientation (e.g. an ID card held upright).
 */
export function orientedSize(quad: Quad, spec: Size): Size {
  const w = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  const h = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
  const quadLandscape = w >= h;
  const specLandscape = spec.width >= spec.height;
  return quadLandscape === specLandscape ? spec : { width: spec.height, height: spec.width };
}

/** Perspective-corrects `src` so `quad` fills an image of `size`. */
export function warpDocument(cv: CV, scope: MatScope, src: Mat, quad: Quad, size: Size): Mat {
  const { width: w, height: h } = size;
  const from = scope.track(cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y])));
  const to = scope.track(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]));
  const m = scope.track(cv.getPerspectiveTransform(from, to));
  const out = scope.track(new cv.Mat());
  cv.warpPerspective(src, out, m, new cv.Size(w, h), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
  return out;
}
