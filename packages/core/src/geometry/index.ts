import type { Point, Quad, Size } from '../types';

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Shoelace area; positive for clockwise points in screen coordinates. */
export function signedArea(pts: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const area = (pts: readonly Point[]) => Math.abs(signedArea(pts));

/** Orders four points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts: readonly Point[]): Quad {
  if (pts.length !== 4) throw new Error('orderCorners needs exactly 4 points');
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  // Sort clockwise by angle around the centroid (screen y points down).
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  // Start from the corner with the smallest x + y (top-left).
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (sorted[i]!.x + sorted[i]!.y < sorted[start]!.x + sorted[start]!.y) start = i;
  }
  return [0, 1, 2, 3].map((i) => ({ ...sorted[(start + i) % 4]! })) as Quad;
}

export function isConvex(q: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const c = q[(i + 2) % q.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) {
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

/** Interior angle at each corner, in degrees. */
export function cornerAngles(q: Quad): [number, number, number, number] {
  return q.map((p, i) => {
    const prev = q[(i + 3) % 4]!;
    const next = q[(i + 1) % 4]!;
    const v1 = { x: prev.x - p.x, y: prev.y - p.y };
    const v2 = { x: next.x - p.x, y: next.y - p.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  }) as [number, number, number, number];
}

/** Largest deviation from 90° across the corners, in degrees. */
export const maxAngleDeviation = (q: Quad) =>
  Math.max(...cornerAngles(q).map((a) => Math.abs(a - 90)));

/** Mean side lengths: long ÷ short, always ≥ 1. */
export function aspectRatio(q: Quad): number {
  const [tl, tr, br, bl] = q;
  const w = (dist(tl, tr) + dist(bl, br)) / 2;
  const h = (dist(tl, bl) + dist(tr, br)) / 2;
  if (w === 0 || h === 0) return Infinity;
  return Math.max(w, h) / Math.min(w, h);
}

/** Mean width and height of the quad. */
export function quadSize(q: Quad): Size {
  const [tl, tr, br, bl] = q;
  return {
    width: (dist(tl, tr) + dist(bl, br)) / 2,
    height: (dist(tl, bl) + dist(tr, br)) / 2,
  };
}

// Sutherland–Hodgman clipping of `subject` by convex `clip`.
function clipPolygon(subject: Point[], clip: readonly Point[]): Point[] {
  let output = subject;
  const orientation = Math.sign(signedArea(clip)) || 1;
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    const inside = (p: Point) =>
      orientation * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= 0;
    const intersect = (p: Point, q: Point): Point => {
      const a1 = b.y - a.y;
      const b1 = a.x - b.x;
      const c1 = a1 * a.x + b1 * a.y;
      const a2 = q.y - p.y;
      const b2 = p.x - q.x;
      const c2 = a2 * p.x + b2 * p.y;
      const det = a1 * b2 - a2 * b1;
      if (det === 0) return p;
      return { x: (b2 * c1 - b1 * c2) / det, y: (a1 * c2 - a2 * c1) / det };
    };
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j]!;
      const prev = input[(j + input.length - 1) % input.length]!;
      if (inside(cur)) {
        if (!inside(prev)) output.push(intersect(prev, cur));
        output.push(cur);
      } else if (inside(prev)) {
        output.push(intersect(prev, cur));
      }
    }
  }
  return output;
}

/** Intersection over union of two convex quads. */
export function quadIoU(a: Quad, b: Quad): number {
  const inter = clipPolygon([...a], b);
  const i = inter.length >= 3 ? area(inter) : 0;
  const u = area(a) + area(b) - i;
  return u > 0 ? i / u : 0;
}

export const scaleQuad = (q: Quad, sx: number, sy = sx): Quad =>
  q.map((p) => ({ x: p.x * sx, y: p.y * sy })) as Quad;

/** Mean distance moved by the corners between two quads. */
export const meanCornerShift = (a: Quad, b: Quad) =>
  a.reduce((s, p, i) => s + dist(p, b[i]!), 0) / 4;

/** Intersection of the infinite lines through (p1,p2) and (p3,p4). */
export function lineIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9) return null;
  const a = p1.x * p2.y - p1.y * p2.x;
  const b = p3.x * p4.y - p3.y * p4.x;
  return {
    x: (a * (p3.x - p4.x) - (p1.x - p2.x) * b) / d,
    y: (a * (p3.y - p4.y) - (p1.y - p2.y) * b) / d,
  };
}

/** Smallest distance from any corner to the frame edge, in pixels. */
export function minEdgeMargin(q: Quad, frame: Size): number {
  return Math.min(
    ...q.map((p) => Math.min(p.x, p.y, frame.width - 1 - p.x, frame.height - 1 - p.y)),
  );
}
