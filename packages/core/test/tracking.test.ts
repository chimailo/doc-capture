import { describe, expect, it } from 'vitest';
import { Kalman1D } from '../src/tracking/kalman';
import { QuadTracker } from '../src/tracking/quad-tracker';
import type { Quad } from '../src/types';
import { rectQuad } from './helpers/synth';

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
/** Approximately normal noise (Irwin–Hall). */
const gauss = (r: () => number) => r() + r() + r() + r() + r() + r() - 3;

describe('Kalman1D', () => {
  it('reduces measurement noise on a still target', () => {
    const k = new Kalman1D();
    const r = rng(7);
    const raw: number[] = [];
    const filtered: number[] = [];
    for (let i = 0; i < 200; i++) {
      const z = 100 + gauss(r) * 3;
      raw.push(z);
      filtered.push(k.update(z, i * 66));
    }
    const rms = (xs: number[]) =>
      Math.sqrt(xs.slice(50).reduce((s, x) => s + (x - 100) ** 2, 0) / (xs.length - 50));
    expect(rms(filtered)).toBeLessThan(rms(raw) * 0.65);
  });

  it('tracks constant motion and extrapolates', () => {
    const k = new Kalman1D(1e-3, 1);
    for (let i = 0; i <= 60; i++) k.update(i * 6.6, i * 66); // 0.1 px/ms
    expect(k.velocity).toBeCloseTo(0.1, 1);
    expect(Math.abs(k.positionAt(60 * 66 + 33) - (60 * 6.6 + 3.3))).toBeLessThan(1);
    // Extrapolation is capped at 100 ms.
    expect(Math.abs(k.positionAt(60 * 66 + 10_000) - (60 * 6.6 + 10))).toBeLessThan(1.5);
  });
});

describe('QuadTracker', () => {
  const q = rectQuad(100, 100, 300, 190);

  it('shows the outline only after several consecutive detections', () => {
    const t = new QuadTracker({ showAfter: 3, hideAfter: 2 });
    expect(t.update(q, 0)).toBeNull();
    expect(t.update(q, 66)).toBeNull();
    expect(t.update(q, 133)).not.toBeNull();
  });

  it('hides it only after several consecutive misses', () => {
    const t = new QuadTracker({ showAfter: 1, hideAfter: 3 });
    t.update(q, 0);
    expect(t.update(null, 66)).not.toBeNull();
    expect(t.update(null, 133)).not.toBeNull();
    expect(t.update(null, 200)).toBeNull();
  });

  it('keeps corner jitter under 2 px RMS for a still document with noisy detections', () => {
    const t = new QuadTracker({ showAfter: 1 });
    const r = rng(3);
    let sq = 0;
    let n = 0;
    for (let i = 0; i < 150; i++) {
      const noisy = q.map((p) => ({ x: p.x + gauss(r) * 2.5, y: p.y + gauss(r) * 2.5 })) as Quad;
      const out = t.update(noisy, i * 66)!;
      if (i >= 20) {
        out.forEach((p, j) => {
          sq += (p.x - q[j]!.x) ** 2 + (p.y - q[j]!.y) ** 2;
          n++;
        });
      }
    }
    expect(Math.sqrt(sq / n)).toBeLessThan(2);
  });

  it('restarts when the document jumps', () => {
    const t = new QuadTracker({ showAfter: 1 });
    for (let i = 0; i < 10; i++) t.update(q, i * 66);
    const moved = rectQuad(400, 300, 100, 60);
    const out = t.update(moved, 700)!;
    expect(out[0]!.x).toBeCloseTo(400);
  });
});
