import type { Quad } from '@doc-capture/core';
import { denseFrames } from './labels';
import type { VideoLabels } from './labels';

/** Event recorded by apps/demo/bench.html (`window.__bench.events`). */
export interface BenchEvent {
  t: number;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export interface Targets {
  successRate: number;
  medianTimeToCaptureMs: number;
  falseCaptureRate: number;
  jitterRmsPx: number;
  flickerRate: number;
}

/** Plan §8 targets. */
export const TARGETS: Targets = {
  successRate: 0.95,
  medianTimeToCaptureMs: 4000,
  falseCaptureRate: 0.02,
  jitterRmsPx: 2,
  flickerRate: 0.01,
};

export interface RunResult {
  id: string;
  expectCapture: boolean;
  /** A correct capture within the time limit. */
  success: boolean;
  falseCapture: boolean;
  timeToCaptureMs: number | null;
  captureIoU: number | null;
  captureLabel: string | null;
  jitterRmsPx: number | null;
  flickerRate: number | null;
  errors: string[];
}

export interface Report {
  runs: RunResult[];
  kpis: Targets;
  pass: Record<keyof Targets, boolean>;
}

/** Per-frame detection time in the worker, across all runs. */
export interface Latency {
  frames: number;
  p50: number;
  p95: number;
}

export const LATENCY_BUDGET_MS = 35;

export function latency(samples: number[]): Latency {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : NaN);
  return { frames: s.length, p50: q(0.5), p95: q(0.95) };
}

const area = (q: readonly { x: number; y: number }[]) => {
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
};

/** IoU of two convex quads by rasterising onto a coarse grid (robust, dependency-free). */
export function iou(a: Quad, b: Quad, step = 2): number {
  const inside = (q: Quad, x: number, y: number) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const p = q[i]!;
      const n = q[(i + 1) % 4]!;
      const c = Math.sign((n.x - p.x) * (y - p.y) - (n.y - p.y) * (x - p.x));
      if (c === 0) continue;
      if (sign === 0) sign = c;
      else if (c !== sign) return false;
    }
    return true;
  };
  const xs = [...a, ...b].map((p) => p.x);
  const ys = [...a, ...b].map((p) => p.y);
  let inter = 0;
  let union = 0;
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
      const ia = inside(a, x, y);
      const ib = inside(b, x, y);
      if (ia && ib) inter++;
      if (ia || ib) union++;
    }
  }
  return union ? inter / union : 0;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const scaleQuad = (q: Quad, sx: number, sy: number) => q.map((p) => ({ x: p.x * sx, y: p.y * sy })) as Quad;

/** Max time between the first visible document and a capture that counts as success. */
export const SUCCESS_WINDOW_MS = 15_000;
/** How far either side of the estimated video time to look for the matching label. */
const ALIGN_WINDOW_S = 0.35;

export function scoreRun(video: VideoLabels, events: BenchEvent[]): RunResult {
  const labels = { ...video, frames: denseFrames(video) };
  const duration = labels.frames.length / labels.fps;
  const playing = events.find((e) => e.type === 'playing')?.t ?? 0;
  const videoTime = (t: number) => ((t - playing) / 1000) % duration;
  const framesNear = (vt: number) =>
    labels.frames.filter((f) => Math.abs(f.t - vt) <= ALIGN_WINDOW_S || Math.abs(f.t - vt) >= duration - ALIGN_WINDOW_S);

  const errors = events.filter((e) => e.type === 'error').map((e) => String(e.data?.code ?? e.data?.message));
  const cap = events.find((e) => e.type === 'capture' && e.data?.mode === 'auto');
  const capMetric = events.find((e) => e.type === 'metric' && e.data?.type === 'capture');

  let captureIoU: number | null = null;
  let captureLabel: string | null = null;
  let falseCapture = false;
  let success = false;
  const timeToCaptureMs: number | null = capMetric?.data?.timeToCaptureMs ?? null;

  if (cap) {
    const near = framesNear(videoTime(cap.t));
    const src = cap.data.source ?? { width: labels.width, height: labels.height };
    const corners = scaleQuad(cap.data.corners, labels.width / src.width, labels.height / src.height);
    let best = { iou: 0, label: 'absent' as string };
    for (const f of near) {
      if (!f.quad) continue;
      const v = iou(corners, f.quad);
      if (v > best.iou) best = { iou: v, label: f.label };
    }
    captureIoU = best.iou;
    captureLabel = best.label;
    falseCapture = best.iou < 0.9 || best.label !== 'good';
    success =
      labels.expectCapture && !falseCapture && timeToCaptureMs !== null && timeToCaptureMs <= SUCCESS_WINDOW_MS;
  }

  // Outline stability, measured on the still scenario (auto-capture off).
  let jitterRmsPx: number | null = null;
  let flickerRate: number | null = null;
  if (labels.stillness) {
    const dets = events.filter((e) => e.type === 'detection');
    const firstVisible = dets.findIndex((e) => e.data?.quad);
    if (firstVisible >= 0) {
      const after = dets.slice(firstVisible);
      const quads = after
        .filter((e) => e.data.quad)
        .map((e) => scaleQuad(e.data.quad, labels.width / e.data.frame.width, labels.height / e.data.frame.height));
      // Ignore the first second while the filter settles.
      const settled = quads.slice(Math.min(quads.length - 1, 12));
      const mean = [0, 1, 2, 3].map((i) => ({
        x: settled.reduce((s, q) => s + q[i]!.x, 0) / settled.length,
        y: settled.reduce((s, q) => s + q[i]!.y, 0) / settled.length,
      }));
      let sq = 0;
      for (const q of settled) q.forEach((p, i) => (sq += (p.x - mean[i]!.x) ** 2 + (p.y - mean[i]!.y) ** 2));
      jitterRmsPx = Math.sqrt(sq / (settled.length * 4));
      let flicker = 0;
      for (let i = 1; i < after.length; i++) {
        if (!!after[i]!.data.quad !== !!after[i - 1]!.data.quad) flicker++;
      }
      flickerRate = flicker / after.length;
    }
  }

  return {
    id: labels.id,
    expectCapture: labels.expectCapture,
    success,
    falseCapture: !!cap && falseCapture,
    timeToCaptureMs,
    captureIoU,
    captureLabel,
    jitterRmsPx,
    flickerRate,
    errors,
  };
}

export function summarise(runs: RunResult[], targets: Targets = TARGETS): Report {
  const expected = runs.filter((r) => r.expectCapture);
  const captured = runs.filter((r) => r.captureIoU !== null);
  const still = runs.filter((r) => r.jitterRmsPx !== null);
  const kpis: Targets = {
    successRate: expected.length ? expected.filter((r) => r.success).length / expected.length : 1,
    medianTimeToCaptureMs: median(runs.filter((r) => r.success).map((r) => r.timeToCaptureMs!)),
    falseCaptureRate: captured.length ? captured.filter((r) => r.falseCapture).length / captured.length : 0,
    jitterRmsPx: still.length ? Math.max(...still.map((r) => r.jitterRmsPx!)) : NaN,
    flickerRate: still.length ? Math.max(...still.map((r) => r.flickerRate!)) : NaN,
  };
  return {
    runs,
    kpis,
    pass: {
      successRate: kpis.successRate >= targets.successRate,
      medianTimeToCaptureMs: kpis.medianTimeToCaptureMs <= targets.medianTimeToCaptureMs,
      falseCaptureRate: kpis.falseCaptureRate <= targets.falseCaptureRate,
      jitterRmsPx: !(kpis.jitterRmsPx > targets.jitterRmsPx),
      flickerRate: !(kpis.flickerRate > targets.flickerRate),
    },
  };
}

/** How much worse than the baseline a KPI may get before CI fails (absolute). */
export const REGRESSION_TOLERANCE: Targets = {
  successRate: 0.05,
  medianTimeToCaptureMs: 500,
  falseCaptureRate: 0.01,
  jitterRmsPx: 0.3,
  flickerRate: 0.005,
};

/** KPIs that got worse than the stored baseline by more than the tolerance. */
export function regressions(current: Targets, baseline: Targets, tolerance: Targets = REGRESSION_TOLERANCE): string[] {
  const out: string[] = [];
  for (const k of Object.keys(baseline) as (keyof Targets)[]) {
    const b = baseline[k];
    const c = current[k];
    if (!Number.isFinite(b) || !Number.isFinite(c)) continue;
    const worse = k === 'successRate' ? c < b - tolerance[k] : c > b + tolerance[k];
    if (worse) out.push(`${k}: ${c.toFixed(3)} vs baseline ${b.toFixed(3)}`);
  }
  return out;
}

export { area };
