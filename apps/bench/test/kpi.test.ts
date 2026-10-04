import { describe, expect, it } from 'vitest';
import type { Quad } from '@doc-capture/core';
import { iou, latency, regressions, scoreRun, summarise, TARGETS } from '../src/kpi';
import type { BenchEvent } from '../src/kpi';
import { denseFrames } from '../src/labels';
import type { VideoLabels } from '../src/labels';

const rect = (x: number, y: number, w: number, h: number): Quad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

const truth = rect(200, 100, 500, 315);
const labels = (over: Partial<VideoLabels> = {}): VideoLabels => ({
  id: 'v',
  documentType: 'id-card',
  fps: 10,
  width: 960,
  height: 540,
  expectCapture: true,
  stillness: false,
  frames: [
    ...Array.from({ length: 20 }, (_, i) => ({ t: i / 10, quad: null, label: 'absent' as const })),
    ...Array.from({ length: 40 }, (_, i) => ({ t: 2 + i / 10, quad: truth, label: 'good' as const })),
  ],
  ...over,
});
const capture = (t: number, corners: Quad, ttc = 2500): BenchEvent[] => [
  { t: 100, type: 'playing' },
  { t, type: 'metric', data: { type: 'capture', timeToCaptureMs: ttc } },
  { t, type: 'capture', data: { mode: 'auto', corners, source: { width: 960, height: 540 } } },
];

describe('iou', () => {
  it('matches the analytic value', () => {
    expect(iou(rect(0, 0, 100, 100), rect(50, 0, 100, 100))).toBeCloseTo(1 / 3, 1);
    expect(iou(truth, truth)).toBeCloseTo(1, 2);
  });
});

describe('scoreRun', () => {
  it('counts a correct capture during a good segment', () => {
    const r = scoreRun(labels(), capture(100 + 4500, truth));
    expect(r).toMatchObject({ success: true, falseCapture: false, captureLabel: 'good' });
  });

  it('flags a capture with poor corners as false', () => {
    const r = scoreRun(labels(), capture(100 + 4500, rect(200, 140, 500, 280)));
    expect(r).toMatchObject({ success: false, falseCapture: true });
  });

  it('flags a capture during a bad segment as false', () => {
    const bad = labels();
    bad.frames = bad.frames!.map((f) => (f.t >= 2 && f.t < 3 ? { ...f, label: 'bad' as const } : f));
    expect(scoreRun(bad, capture(100 + 2500, truth)).falseCapture).toBe(true);
  });

  it('does not count a capture after the time limit', () => {
    expect(scoreRun(labels(), capture(100 + 4500, truth, 16_000)).success).toBe(false);
  });

  it('measures jitter and flicker on still videos', () => {
    const ev: BenchEvent[] = [{ t: 0, type: 'playing' }];
    for (let i = 0; i < 40; i++) {
      const d = i % 2 ? 1 : -1;
      ev.push({ t: i * 80, type: 'detection', data: { frame: { width: 960, height: 540 }, quad: rect(200 + d, 100, 500, 315) } });
    }
    const r = scoreRun(labels({ stillness: true, expectCapture: false }), ev);
    expect(r.jitterRmsPx).toBeCloseTo(1, 1);
    expect(r.flickerRate).toBe(0);
  });
});

describe('summarise and regressions', () => {
  it('aggregates KPIs and finds regressions', () => {
    const ok = scoreRun(labels(), capture(4600, truth));
    const miss = scoreRun(labels(), []);
    const rep = summarise([ok, miss]);
    expect(rep.kpis.successRate).toBe(0.5);
    expect(rep.pass.successRate).toBe(false);
    expect(regressions({ ...TARGETS, successRate: 0.8 }, { ...TARGETS, successRate: 1 })).toHaveLength(1);
    expect(regressions(TARGETS, TARGETS)).toEqual([]);
  });

  it('computes latency percentiles', () => {
    expect(latency([5, 1, 3, 2, 4])).toMatchObject({ frames: 5, p50: 3 });
  });
});

describe('denseFrames', () => {
  it('interpolates key frames', () => {
    const v = labels({
      frames: undefined,
      duration: 2,
      keyframes: [
        { t: 0, quad: rect(0, 0, 100, 100), label: 'moving' },
        { t: 2, quad: rect(100, 0, 100, 100), label: 'good' },
      ],
    });
    const f = denseFrames(v);
    expect(f).toHaveLength(21);
    expect(f[10]!.quad![0]!.x).toBeCloseTo(50);
    expect(f[10]!.label).toBe('moving');
    expect(f[20]!.label).toBe('good');
  });
});
