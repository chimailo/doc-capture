import { DOCUMENT_SPECS } from '../document-types';
import { area, aspectRatio, maxAngleDeviation, quadIoU } from '../geometry';
import type { DocumentType, Quad, Size } from '../types';

export interface ScoreWeights {
  area: number;
  aspect: number;
  angles: number;
  edges: number;
  temporal: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  area: 0.2,
  aspect: 0.25,
  angles: 0.2,
  edges: 0.2,
  temporal: 0.15,
};

export interface CandidateScore {
  total: number;
  documentType: DocumentType;
  parts: Record<keyof ScoreWeights, number>;
}

/** Fraction of points along the quad's sides that sit on an edge pixel. */
export function edgeSupport(edges: { data: Uint8Array; cols: number; rows: number }, q: Quad) {
  const samplesPerSide = 40;
  const radius = 2;
  let hits = 0;
  let total = 0;
  for (let s = 0; s < 4; s++) {
    const a = q[s]!;
    const b = q[(s + 1) % 4]!;
    for (let i = 1; i < samplesPerSide; i++) {
      const t = i / samplesPerSide;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      total++;
      search: for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= edges.cols || yy >= edges.rows) continue;
          if (edges.data[yy * edges.cols + xx]) {
            hits++;
            break search;
          }
        }
      }
    }
  }
  return total ? hits / total : 0;
}

/** Best-matching document type and how close the aspect ratio is (0–1). */
export function aspectMatch(
  q: Quad,
  types: readonly DocumentType[],
): { type: DocumentType; score: number } {
  const ar = aspectRatio(q);
  let best = { type: types[0] ?? 'id-card', score: -1 };
  for (const type of types) {
    const spec = DOCUMENT_SPECS[type];
    const relErr = Math.abs(ar - spec.aspectRatio) / spec.aspectRatio;
    const score = Math.max(0, 1 - relErr / (spec.aspectTolerance * 2));
    if (score > best.score) best = { type, score };
  }
  return best;
}

export function scoreCandidate(
  q: Quad,
  frame: Size,
  types: readonly DocumentType[],
  edgeFraction: number,
  previous: Quad | null,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): CandidateScore | null {
  const fill = area(q) / (frame.width * frame.height);
  if (fill < 0.04 || fill > 0.98) return null;
  const angleDev = maxAngleDeviation(q);
  if (angleDev > 35) return null;
  const aspect = aspectMatch(q, types);
  if (aspect.score <= 0) return null;

  const parts = {
    area: Math.min(1, fill / 0.35),
    aspect: aspect.score,
    angles: 1 - angleDev / 35,
    edges: edgeFraction,
    temporal: previous ? quadIoU(q, previous) : 0.5,
  };
  const total =
    parts.area * weights.area +
    parts.aspect * weights.aspect +
    parts.angles * weights.angles +
    parts.edges * weights.edges +
    parts.temporal * weights.temporal;
  return { total, documentType: aspect.type, parts };
}
