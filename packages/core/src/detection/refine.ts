import { DOCUMENT_SPECS } from '../document-types';
import { aspectRatio, dist, isConvex, lineIntersection, metricAspectRatio } from '../geometry';
import type { DocumentType, Point, Quad } from '../types';

/** A blurred 8-bit grayscale image. */
interface GrayView {
  data: Uint8Array;
  cols: number;
  rows: number;
}

/**
 * Mean gradient magnitude along the segment a→b (central differences on the
 * blurred image), ignoring the outer 15% near the corners.
 */
function segmentResponse(g: GrayView, a: Point, b: Point): number {
  const n = 40;
  let sum = 0;
  let count = 0;
  for (let i = 0; i <= n; i++) {
    const t = 0.15 + (0.7 * i) / n;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);
    if (x < 2 || y < 2 || x >= g.cols - 2 || y >= g.rows - 2) continue;
    const at = (xx: number, yy: number) => g.data[yy * g.cols + xx]!;
    // Max over a 3-px band, to tolerate rounding of the line position.
    let best = 0;
    for (let d = -1; d <= 1; d++) {
      const gx = Math.abs(at(x + 1 + d, y) - at(x - 1 + d, y));
      const gy = Math.abs(at(x, y + 1 + d) - at(x, y - 1 + d));
      best = Math.max(best, gx + gy);
    }
    sum += best;
    count++;
  }
  return count > n / 2 ? sum / count : 0;
}

const aspectError = (q: Quad, type: DocumentType, frame: { cols: number; rows: number }) => {
  const target = DOCUMENT_SPECS[type].aspectRatio;
  const metric = metricAspectRatio(q, { width: frame.cols, height: frame.rows });
  return Math.min(Math.abs(aspectRatio(q) - target), Math.abs(metric - target)) / target;
};

/**
 * Moves side `s` of `q` outward by `d` px along its normal, keeping the
 * adjacent sides' directions.
 */
function shiftSide(q: Quad, s: number, d: number): Quad | null {
  const a = q[s]!;
  const b = q[(s + 1) % 4]!;
  const len = dist(a, b);
  if (len === 0) return null;
  // Outward normal for clockwise (screen) ordering.
  const nx = (b.y - a.y) / len;
  const ny = -(b.x - a.x) / len;
  const a2 = { x: a.x + nx * d, y: a.y + ny * d };
  const b2 = { x: b.x + nx * d, y: b.y + ny * d };
  const prev = q[(s + 3) % 4]!;
  const next = q[(s + 2) % 4]!;
  const na = lineIntersection(a2, b2, prev, a);
  const nb = lineIntersection(a2, b2, next, b);
  if (!na || !nb) return null;
  const out = [...q] as Quad;
  out[s] = na;
  out[(s + 1) % 4] = nb;
  return isConvex(out) ? out : null;
}

/**
 * If a quad's aspect ratio is off for the document type, looks for a strong
 * parallel edge just outside one of its sides (e.g. a dark header band on a
 * dark table) and extends the quad to it when that fixes the aspect ratio.
 */
export function refineByAspect(g: GrayView, q: Quad, type: DocumentType): Quad | null {
  const spec = DOCUMENT_SPECS[type];
  const startErr = aspectError(q, type, g);
  if (startErr <= spec.aspectTolerance / 3) return null;

  let best: { quad: Quad; err: number } | null = null;
  for (let s = 0; s < 4; s++) {
    const across = (dist(q[(s + 1) % 4]!, q[(s + 2) % 4]!) + dist(q[(s + 3) % 4]!, q[s]!)) / 2;
    const maxShift = across * 0.4;
    const scan: { d: number; r: number; err: number }[] = [];
    for (let d = 3; d <= maxShift; d += 1) {
      const moved = shiftSide(q, s, d);
      if (!moved) break;
      scan.push({ d, r: segmentResponse(g, moved[s]!, moved[(s + 1) % 4]!), err: aspectError(moved, type, g) });
    }
    // Shape prior: only look where moving this side gives the right aspect ratio,
    // then require an edge that is a clear local peak (not background texture).
    let bestShift: { d: number; r: number; err: number } | null = null;
    for (let i = 0; i < scan.length; i++) {
      const c = scan[i]!;
      if (c.err > spec.aspectTolerance / 3 || c.r < 3) continue;
      const around = scan.filter((x) => Math.abs(x.d - c.d) > 2 && Math.abs(x.d - c.d) <= 10).map((x) => x.r);
      if (around.length < 6) continue;
      around.sort((x, y) => x - y);
      const local = around[around.length >> 1]!;
      if (c.r < local * 1.4 + 1) continue;
      if (!bestShift || c.r > bestShift.r) bestShift = c;
    }
    if (!bestShift) continue;
    const moved = shiftSide(q, s, bestShift.d);
    if (!moved) continue;
    const err = aspectError(moved, type, g);
    if (err < startErr * 0.5 && err < (best?.err ?? Infinity)) best = { quad: moved, err };
  }
  return best?.quad ?? null;
}
