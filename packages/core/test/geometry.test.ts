import { describe, expect, it } from 'vitest';
import {
  area,
  aspectRatio,
  cornerAngles,
  isConvex,
  lineIntersection,
  maxAngleDeviation,
  minEdgeMargin,
  orderCorners,
  quadIoU,
  scaleQuad,
} from '../src/geometry';
import type { Quad } from '../src/types';
import { rectQuad } from './helpers/synth';

describe('geometry', () => {
  it('orders shuffled corners as TL, TR, BR, BL', () => {
    const q = orderCorners([
      { x: 100, y: 90 },
      { x: 10, y: 10 },
      { x: 5, y: 95 },
      { x: 110, y: 5 },
    ]);
    expect(q).toEqual([
      { x: 10, y: 10 },
      { x: 110, y: 5 },
      { x: 100, y: 90 },
      { x: 5, y: 95 },
    ]);
  });

  it('computes area, angles and aspect ratio of a rectangle', () => {
    const r = rectQuad(0, 0, 158.6, 100);
    expect(area(r)).toBeCloseTo(15860);
    expect(cornerAngles(r).every((a) => Math.abs(a - 90) < 1e-9)).toBe(true);
    expect(aspectRatio(r)).toBeCloseTo(1.586);
    expect(maxAngleDeviation(r)).toBeCloseTo(0);
  });

  it('detects concave polygons', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 3, y: 3 },
      { x: 0, y: 10 },
    ];
    expect(isConvex(concave)).toBe(false);
    expect(isConvex(rectQuad(0, 0, 5, 5))).toBe(true);
  });

  it('computes IoU of quads', () => {
    const a = rectQuad(0, 0, 10, 10);
    expect(quadIoU(a, a)).toBeCloseTo(1);
    expect(quadIoU(a, rectQuad(5, 0, 10, 10))).toBeCloseTo(50 / 150);
    expect(quadIoU(a, rectQuad(20, 20, 5, 5))).toBe(0);
    const tilted: Quad = [
      { x: 5, y: -2 },
      { x: 12, y: 5 },
      { x: 5, y: 12 },
      { x: -2, y: 5 },
    ];
    const iou = quadIoU(a, tilted);
    expect(iou).toBeGreaterThan(0.5);
    expect(iou).toBeLessThan(1);
    expect(quadIoU(tilted, a)).toBeCloseTo(iou);
  });

  it('intersects lines and scales quads', () => {
    expect(lineIntersection({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 })).toEqual({
      x: 1,
      y: 1,
    });
    expect(lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBeNull();
    expect(scaleQuad(rectQuad(1, 2, 3, 4), 2)[2]).toEqual({ x: 8, y: 12 });
  });

  it('measures the margin to the frame edge', () => {
    expect(minEdgeMargin(rectQuad(10, 20, 50, 50), { width: 100, height: 100 })).toBe(10);
    expect(minEdgeMargin(rectQuad(-1, 20, 50, 50), { width: 100, height: 100 })).toBe(-1);
  });
});
