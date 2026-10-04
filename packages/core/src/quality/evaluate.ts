import type { QualityIssue, QualityReport, QualityScores } from '../types';
import type { QualityThresholds } from './thresholds';

/** Raw measurements of one frame. Computed by `measure.ts` in the worker. */
export interface QualityMeasurements {
  /** Laplacian variance ÷ intensity variance on the document patch. */
  sharpness: number;
  overexposedFraction: number;
  largestGlareBlob: number;
  meanBrightness: number;
  contrast: number;
  fill: number;
  tiltDegrees: number;
  /** `null` on the first frame. */
  frameDiff: number | null;
  /** `null` when there is no previous quad. */
  cornerShift: number | null;
  edgeMargin: number;
}

/** Order in which issues are shown when several checks fail. */
export const ISSUE_PRIORITY: readonly QualityIssue[] = [
  'MORE_LIGHT',
  'MOVE_CLOSER',
  'MOVE_BACK',
  'ALIGN',
  'REDUCE_GLARE',
  'HOLD_STILL',
];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** 1 when `value` is at or better than `limit`, falling linearly to 0 at `zeroAt`. */
const ramp = (value: number, limit: number, zeroAt: number) =>
  limit === zeroAt ? (value >= limit ? 1 : 0) : clamp01((value - zeroAt) / (limit - zeroAt));

export function evaluateQuality(m: QualityMeasurements, t: QualityThresholds): QualityReport {
  const glareRatio = Math.max(
    m.overexposedFraction / t.maxGlareFraction,
    m.largestGlareBlob / t.maxGlareBlob,
  );
  const fillScore =
    m.fill < t.minFill
      ? ramp(m.fill, t.minFill, t.minFill / 3)
      : m.fill > t.maxFill
        ? ramp(-m.fill, -t.maxFill, -1)
        : 1;
  const motionRatio = Math.max(
    m.frameDiff === null ? 0 : m.frameDiff / t.maxFrameDiff,
    m.cornerShift === null ? 0 : m.cornerShift / t.maxCornerShift,
  );

  const scores: QualityScores = {
    sharpness: ramp(m.sharpness, t.minSharpness, 0),
    glare: clamp01(1 - (glareRatio - 1) / 2) * (glareRatio <= 1 ? 1 : 0.5),
    lighting: Math.min(
      ramp(m.meanBrightness, t.minBrightness, t.minBrightness / 3),
      ramp(m.contrast, t.minContrast, 0),
    ),
    distance: fillScore,
    tilt: ramp(-m.tiltDegrees, -t.maxTiltDegrees, -35),
    motion: m.frameDiff === null && m.cornerShift === null ? 0 : clamp01(2 - motionRatio),
    cropping: ramp(m.edgeMargin, t.minEdgeMargin, -t.minEdgeMargin),
  };

  const issues = new Set<QualityIssue>();
  if (m.meanBrightness < t.minBrightness || m.contrast < t.minContrast) issues.add('MORE_LIGHT');
  if (m.fill < t.minFill) issues.add('MOVE_CLOSER');
  if (m.fill > t.maxFill) issues.add('MOVE_BACK');
  if (m.edgeMargin < t.minEdgeMargin) issues.add(m.fill > 0.5 ? 'MOVE_BACK' : 'ALIGN');
  if (m.tiltDegrees > t.maxTiltDegrees) issues.add('ALIGN');
  if (glareRatio > 1) issues.add('REDUCE_GLARE');
  // Blur is usually motion or focus hunting: both fixed by holding still.
  if (motionRatio > 1 || m.frameDiff === null || m.sharpness < t.minSharpness) {
    issues.add('HOLD_STILL');
  }

  const ordered = ISSUE_PRIORITY.filter((i) => issues.has(i));
  return { scores, issues: ordered, passed: ordered.length === 0 };
}
