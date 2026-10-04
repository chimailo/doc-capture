import { area, isConvex, orderCorners } from '../geometry';
import type { MatScope } from '../opencv/mat-scope';
import type { CV, Mat } from '../opencv/types';
import type { Point, Quad } from '../types';

const EPSILONS = [0.02, 0.03, 0.05];

/** Convex four-sided polygons from the edge image, largest first. */
export function contourQuads(
  cv: CV,
  scope: MatScope,
  edges: Mat,
  minAreaFraction = 0.05,
  maxCandidates = 5,
): Quad[] {
  const contours = scope.track(new cv.MatVector());
  const hierarchy = scope.track(new cv.Mat());
  cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const minArea = edges.rows * edges.cols * minAreaFraction;
  const found: { quad: Quad; area: number }[] = [];

  for (let i = 0; i < contours.size(); i++) {
    const contour = scope.track(contours.get(i));
    if (Math.abs(cv.contourArea(contour)) < minArea) continue;

    const hull = scope.track(new cv.Mat());
    cv.convexHull(contour, hull, false, true);
    const perimeter = cv.arcLength(hull, true);

    for (const eps of EPSILONS) {
      const approx = scope.track(new cv.Mat());
      cv.approxPolyDP(hull, approx, eps * perimeter, true);
      if (approx.rows !== 4) continue;
      const ints = approx.data32S;
      const pts: Point[] = [0, 1, 2, 3].map((k) => ({ x: ints[k * 2]!, y: ints[k * 2 + 1]! }));
      if (!isConvex(pts)) continue;
      const quad = orderCorners(pts);
      found.push({ quad, area: area(quad) });
      break;
    }
  }

  found.sort((a, b) => b.area - a.area);
  // Drop near-duplicates (inner and outer edge of the same border).
  const unique: typeof found = [];
  for (const f of found) {
    if (!unique.some((u) => Math.abs(u.area - f.area) / u.area < 0.03)) unique.push(f);
    if (unique.length >= maxCandidates) break;
  }
  return unique.map((u) => u.quad);
}
