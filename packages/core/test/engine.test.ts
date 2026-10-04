import { beforeAll, describe, expect, it } from 'vitest';
import { quadIoU, scaleQuad } from '../src/geometry';
import { liveMatCount } from '../src/opencv/mat-scope';
import type { CV } from '../src/opencv/types';
import { DEFAULT_THRESHOLDS } from '../src/quality/thresholds';
import { Engine } from '../src/worker/engine';
import type { FinalizeParams } from '../src/worker/protocol';
import type { Quad } from '../src/types';
import { loadCv } from './helpers/opencv';
import { rectQuad, renderScene } from './helpers/synth';

let cv: CV;
beforeAll(async () => {
  cv = await loadCv();
});

const params = (hint: Quad, over: Partial<FinalizeParams> = {}): FinalizeParams => ({
  hint,
  documentType: 'id-card',
  documentTypes: ['id-card'],
  force: false,
  thresholds: DEFAULT_THRESHOLDS,
  output: { format: 'jpeg', quality: 0.9 },
  enhance: {},
  includeOriginal: false,
  ...over,
});

describe('Engine.process', () => {
  it('returns a detection and quality report, with motion from the second frame', () => {
    const quad = rectQuad(120, 110, 400, 252);
    const image = renderScene(cv, { quad, seed: 1 });
    const engine = new Engine(cv);
    const p = { documentTypes: ['id-card' as const], previous: null, thresholds: DEFAULT_THRESHOLDS };
    const first = engine.process(image, p);
    expect(first.detection).not.toBeNull();
    expect(first.quality!.issues).toContain('HOLD_STILL');
    const second = engine.process(image, { ...p, previous: first.detection!.quad });
    expect(second.quality!.passed).toBe(true);
    engine.dispose();
  });
});

describe('Engine.finalize', () => {
  const truth: Quad = [
    { x: 300, y: 250 },
    { x: 1550, y: 220 },
    { x: 1600, y: 1000 },
    { x: 280, y: 1020 },
  ];
  let full: ReturnType<typeof renderScene>;
  beforeAll(() => {
    full = renderScene(cv, { quad: truth, width: 1920, height: 1080, seed: 3 });
  });

  it('re-detects at full resolution and warps to 1011×638', () => {
    const hint = truth.map((p) => ({ x: p.x + 6, y: p.y - 5 })) as Quad;
    const r = new Engine(cv).finalize(full, params(hint));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.pixels.width, r.pixels.height]).toEqual([1011, 638]);
    expect(quadIoU(r.corners, truth)).toBeGreaterThan(0.97);
    expect(liveMatCount()).toBe(0);
  });

  it('rejects a capture whose hint does not match the document', () => {
    const wrong = scaleQuad(rectQuad(100, 100, 300, 190), 1);
    const r = new Engine(cv).finalize(full, params(wrong));
    expect(r.ok).toBe(false);
  });

  it('rejects a blurry full-resolution frame', () => {
    const blurry = renderScene(cv, { quad: truth, width: 1920, height: 1080, seed: 3, blur: 6 });
    const r = new Engine(cv).finalize(blurry, params(truth));
    expect(r).toMatchObject({ ok: false });
  });

  it('manual capture (force) always produces an image', () => {
    const blurry = renderScene(cv, { quad: truth, width: 1920, height: 1080, seed: 3, blur: 6 });
    const r = new Engine(cv).finalize(blurry, params(truth, { force: true }));
    expect(r.ok).toBe(true);
  });

  it('honours an output size override and rotation for upright cards', () => {
    const upright = rectQuad(700, 150, 500, 793);
    const img = renderScene(cv, { quad: [upright[3], upright[0], upright[1], upright[2]], width: 1920, height: 1080 });
    const r = new Engine(cv).finalize(
      img,
      params(upright, { force: true, enhance: { autoRotate: true }, output: { format: 'png', quality: 1, size: { width: 856, height: 540 } } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect([r.pixels.width, r.pixels.height]).toEqual([856, 540]);
  });
});
