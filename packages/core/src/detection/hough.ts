import { isConvex, lineIntersection, orderCorners } from '../geometry';
import type { MatScope } from '../opencv/mat-scope';
import type { CV, Mat } from '../opencv/types';
import type { Point, Quad } from '../types';

interface Segment {
  a: Point;
  b: Point;
  length: number;
  /** Midpoint coordinate across the line: y for horizontal, x for vertical. */
  offset: number;
}

interface Group {
  offset: number;
  length: number;
  segments: Segment[];
}

function group(segments: Segment[], tolerance: number): Group[] {
  const groups: Group[] = [];
  for (const s of [...segments].sort((x, y) => x.offset - y.offset)) {
    const last = groups[groups.length - 1];
    if (last && s.offset - last.offset <= tolerance) {
      last.segments.push(s);
      last.length += s.length;
      last.offset = last.segments.reduce((t, g) => t + g.offset * g.length, 0) / last.length;
    } else {
      groups.push({ offset: s.offset, length: s.length, segments: [s] });
    }
  }
  return groups;
}

/** The longest segment of a group, extended to stand for the whole side. */
function representative(g: Group): [Point, Point] {
  const s = g.segments.reduce((best, x) => (x.length > best.length ? x : best));
  return [s.a, s.b];
}

/**
 * Fallback for low-contrast scenes: finds straight lines, keeps the outermost
 * well-supported horizontal and vertical ones, and intersects them.
 */
export function houghQuad(cv: CV, scope: MatScope, edges: Mat): Quad | null {
  const w = edges.cols;
  const h = edges.rows;
  const minDim = Math.min(w, h);
  const lines = scope.track(new cv.Mat());
  cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 40, minDim * 0.12, 12);

  const horizontal: Segment[] = [];
  const vertical: Segment[] = [];
  const d = lines.data32S;
  for (let i = 0; i < lines.rows; i++) {
    const a = { x: d[i * 4]!, y: d[i * 4 + 1]! };
    const b = { x: d[i * 4 + 2]!, y: d[i * 4 + 3]! };
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    if (angle < 30 || angle > 150) horizontal.push({ a, b, length, offset: (a.y + b.y) / 2 });
    else if (angle > 60 && angle < 120) vertical.push({ a, b, length, offset: (a.x + b.x) / 2 });
  }

  const minSupport = minDim * 0.2;
  const hGroups = group(horizontal, minDim * 0.03).filter((g) => g.length >= minSupport);
  const vGroups = group(vertical, minDim * 0.03).filter((g) => g.length >= minSupport);
  if (hGroups.length < 2 || vGroups.length < 2) return null;

  const top = hGroups[0]!;
  const bottom = hGroups[hGroups.length - 1]!;
  const left = vGroups[0]!;
  const right = vGroups[vGroups.length - 1]!;
  if (bottom.offset - top.offset < h * 0.15 || right.offset - left.offset < w * 0.15) return null;

  const [t, b, l, r] = [top, bottom, left, right].map(representative) as [Point, Point][];
  const corners = [
    lineIntersection(...t!, ...l!),
    lineIntersection(...t!, ...r!),
    lineIntersection(...b!, ...r!),
    lineIntersection(...b!, ...l!),
  ];
  if (corners.some((c) => !c)) return null;
  const pts = corners as Point[];
  const margin = minDim * 0.05;
  if (pts.some((p) => p.x < -margin || p.y < -margin || p.x > w + margin || p.y > h + margin)) {
    return null;
  }
  const quad = orderCorners(pts);
  return isConvex(quad) ? quad : null;
}
