import { describe, expect, it } from 'vitest';
import {
  area,
  aspectRatio,
  cornerAngles,
  isConvex,
  lineIntersection,
  maxAngleDeviation,
  metricAspectRatio,
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

describe('metricAspectRatio', () => {
  // Project a 1.586:1 rectangle with a pinhole camera (f = 800) after tilting it.
  function project(tiltDeg: number, yawDeg: number): Quad {
    const f = 800;
    const [cx, cy] = [480, 270];
    const w = 0.0856;
    const h = 0.05398;
    const t = (tiltDeg * Math.PI) / 180;
    const y = (yawDeg * Math.PI) / 180;
    const corners = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
    return corners.map(([X, Y]) => {
      // Rotate about x (tilt) then y (yaw), push 0.15 m in front of the camera.
      const y1 = Y! * Math.cos(t);
      const z1 = Y! * Math.sin(t);
      const x2 = X! * Math.cos(y) + z1 * Math.sin(y);
      const z2 = -X! * Math.sin(y) + z1 * Math.cos(y) + 0.15;
      return { x: cx + (f * x2) / z2, y: cy + (f * y1) / z2 };
    }) as Quad;
  }

  it('recovers the true aspect ratio under perspective', () => {
    for (const [tilt, yaw] of [
      [25, 0],
      [0, 25],
      [20, 15],
    ] as const) {
      const q = project(tilt, yaw);
      expect(metricAspectRatio(q, { width: 960, height: 540 })).toBeCloseTo(1.586, 1);
    }
  });

  it('falls back to the side ratio for a fronto-parallel view', () => {
    expect(metricAspectRatio(rectQuad(100, 100, 317.2, 200), { width: 960, height: 540 })).toBeCloseTo(1.586, 2);
  });
});
