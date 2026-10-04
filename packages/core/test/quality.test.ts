import { beforeAll, describe, expect, it } from 'vitest';
import { ClassicDetector } from '../src/detection/classic-detector';
import { withScope } from '../src/opencv/mat-scope';
import type { CV } from '../src/opencv/types';
import { evaluateQuality } from '../src/quality/evaluate';
import type { QualityMeasurements } from '../src/quality/evaluate';
import { measureQuality } from '../src/quality/measure';
import { DEFAULT_THRESHOLDS } from '../src/quality/thresholds';
import type { SceneOptions } from './helpers/synth';
import { loadCv } from './helpers/opencv';
import { rectQuad, renderScene } from './helpers/synth';

const good: QualityMeasurements = {
  sharpness: 3,
  overexposedFraction: 0,
  largestGlareBlob: 0,
  meanBrightness: 150,
  contrast: 50,
  fill: 0.45,
  tiltDegrees: 3,
  frameDiff: 1,
  cornerShift: 0.001,
  edgeMargin: 0.1,
};

describe('evaluateQuality', () => {
  it('passes a good frame', () => {
    const r = evaluateQuality(good, DEFAULT_THRESHOLDS);
    expect(r.passed).toBe(true);
    expect(r.issues).toEqual([]);
    expect(Object.values(r.scores).every((s) => s === 1)).toBe(true);
  });

  const cases: [Partial<QualityMeasurements>, string][] = [
    [{ fill: 0.1 }, 'MOVE_CLOSER'],
    [{ fill: 0.95 }, 'MOVE_BACK'],
    [{ tiltDegrees: 20 }, 'ALIGN'],
    [{ edgeMargin: 0 }, 'ALIGN'],
    [{ overexposedFraction: 0.05, largestGlareBlob: 0.04 }, 'REDUCE_GLARE'],
    [{ meanBrightness: 30 }, 'MORE_LIGHT'],
    [{ frameDiff: 20 }, 'HOLD_STILL'],
    [{ sharpness: 0.2 }, 'HOLD_STILL'],
    [{ frameDiff: null }, 'HOLD_STILL'],
  ];
  for (const [patch, issue] of cases) {
    it(`reports ${issue} for ${JSON.stringify(patch)}`, () => {
      const r = evaluateQuality({ ...good, ...patch }, DEFAULT_THRESHOLDS);
      expect(r.passed).toBe(false);
      expect(r.issues[0]).toBe(issue);
    });
  }

  it('orders issues by priority', () => {
    const r = evaluateQuality({ ...good, meanBrightness: 20, fill: 0.1, frameDiff: 30 }, DEFAULT_THRESHOLDS);
    expect(r.issues).toEqual(['MORE_LIGHT', 'MOVE_CLOSER', 'HOLD_STILL']);
  });
});

describe('measureQuality on synthetic scenes', () => {
  let cv: CV;
  beforeAll(async () => {
    cv = await loadCv();
  });

  const quad = rectQuad(120, 110, 400, 252);
  function measure(opts: Partial<SceneOptions>) {
    const image = renderScene(cv, { quad, seed: 2, ...opts });
    return withScope((scope) => {
      const det = new ClassicDetector(cv).detectInScope(scope, {
        image,
        documentTypes: ['id-card'],
        previous: null,
      });
      const q = det.detection?.quad ?? quad;
      return measureQuality(cv, scope, det.gray, q, image, { frameDiff: 0, cornerShift: 0 });
    });
  }

  it('sharp scene scores higher than blurred scene', () => {
    const sharp = measure({});
    const blurred = measure({ blur: 3 });
    expect(sharp.sharpness).toBeGreaterThan(DEFAULT_THRESHOLDS.minSharpness);
    expect(blurred.sharpness).toBeLessThan(DEFAULT_THRESHOLDS.minSharpness);
  });

  it('detects glare', () => {
    const m = measure({ glare: 0.12 });
    expect(evaluateQuality(m, DEFAULT_THRESHOLDS).issues).toContain('REDUCE_GLARE');
    expect(evaluateQuality(measure({}), DEFAULT_THRESHOLDS).issues).not.toContain('REDUCE_GLARE');
  });

  it('detects low light', () => {
    const m = measure({ brightness: 0.25 });
    expect(evaluateQuality(m, DEFAULT_THRESHOLDS).issues).toContain('MORE_LIGHT');
  });
});
