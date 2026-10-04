import { beforeAll, describe, expect, it } from 'vitest';
import { ClassicDetector } from '../src/detection/classic-detector';
import { quadIoU } from '../src/geometry';
import { liveMatCount } from '../src/opencv/mat-scope';
import type { CV } from '../src/opencv/types';
import type { Quad } from '../src/types';
import { loadCv } from './helpers/opencv';
import { rectQuad, renderScene } from './helpers/synth';

let cv: CV;
beforeAll(async () => {
  cv = await loadCv();
});

const tilted: Quad = [
  { x: 140, y: 110 },
  { x: 500, y: 90 },
  { x: 520, y: 330 },
  { x: 120, y: 350 },
];

const cases: { name: string; quad: Quad; background?: number | 'texture'; card?: number; noise?: number }[] = [
  { name: 'card on a dark table', quad: rectQuad(120, 110, 400, 252) },
  { name: 'perspective-tilted card', quad: tilted },
  { name: 'card on a textured background', quad: rectQuad(110, 100, 420, 265), background: 'texture' },
  { name: 'noisy frame', quad: rectQuad(130, 120, 380, 240), noise: 12 },
  { name: 'white card on a light table', quad: rectQuad(120, 110, 400, 252), background: 200, card: 240 },
];

describe('ClassicDetector', () => {
  for (const c of cases) {
    it(`finds the ${c.name}`, () => {
      const image = renderScene(cv, { ...c, seed: 5 });
      const d = new ClassicDetector(cv).detect({ image, documentTypes: ['id-card'], previous: null });
      expect(d, 'no detection').not.toBeNull();
      expect(quadIoU(d!.quad, c.quad)).toBeGreaterThan(0.9);
      expect(d!.documentType).toBe('id-card');
    });
  }

  it('returns null for an empty scene', () => {
    const image = renderScene(cv, { quad: rectQuad(-2000, -2000, 10, 10) });
    const d = new ClassicDetector(cv).detect({ image, documentTypes: ['id-card'], previous: null });
    expect(d).toBeNull();
  });

  it('picks the closest document type by aspect ratio', () => {
    // A4 portrait: 210 × 297.
    const quad = rectQuad(220, 40, 200, 283);
    const image = renderScene(cv, { quad });
    const d = new ClassicDetector(cv).detect({
      image,
      documentTypes: ['id-card', 'a4'],
      previous: null,
    });
    expect(d?.documentType).toBe('a4');
  });

  it('releases every Mat', () => {
    const image = renderScene(cv, { quad: tilted });
    const det = new ClassicDetector(cv);
    for (let i = 0; i < 20; i++) det.detect({ image, documentTypes: ['id-card'], previous: null });
    expect(liveMatCount()).toBe(0);
  });

  it('runs within the per-frame budget at 640 px', () => {
    const image = renderScene(cv, { quad: tilted, background: 'texture' });
    const det = new ClassicDetector(cv);
    det.detect({ image, documentTypes: ['id-card'], previous: null });
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) det.detect({ image, documentTypes: ['id-card'], previous: null });
    const ms = (performance.now() - t0) / 10;
    // 35 ms is the mid-range phone budget; a dev machine should be well under it.
    expect(ms).toBeLessThan(35);
  });
});
