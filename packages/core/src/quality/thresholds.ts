/** Tunable limits for the quality checks. Tuned against the bench dataset. */
export interface QualityThresholds {
  /** Minimum Laplacian variance ÷ intensity variance on the document patch. */
  minSharpness: number;
  /** Maximum share of overexposed (≥ 250) pixels on the document. */
  maxGlareFraction: number;
  /** Maximum share of the document covered by the largest bright patch. */
  maxGlareBlob: number;
  /** Minimum mean brightness (0–255) of the document. */
  minBrightness: number;
  /** Minimum standard deviation of brightness (contrast). */
  minContrast: number;
  /** Document must cover at least this share of the frame. */
  minFill: number;
  /** …and at most this share. */
  maxFill: number;
  /** Largest corner deviation from 90°, in degrees. */
  maxTiltDegrees: number;
  /** Mean absolute frame difference (0–255) above which the scene is moving. */
  maxFrameDiff: number;
  /** Mean corner movement per detection, as a share of the frame diagonal. */
  maxCornerShift: number;
  /** Minimum margin between any corner and the frame edge, as a share of the short side. */
  minEdgeMargin: number;
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  minSharpness: 0.8,
  maxGlareFraction: 0.015,
  maxGlareBlob: 0.008,
  minBrightness: 70,
  minContrast: 22,
  minFill: 0.25,
  maxFill: 0.88,
  maxTiltDegrees: 12,
  maxFrameDiff: 7,
  maxCornerShift: 0.012,
  minEdgeMargin: 0.015,
};
