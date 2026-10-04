import type { Quad } from '@doc-capture/core';
import type { Scenario, Segment } from './scenarios';

export interface LabelFrame {
  /** Seconds from the start of the video. */
  t: number;
  quad: Quad | null;
  label: Segment['label'];
}

/**
 * Ground truth for one video, stored next to it as `<id>.json`.
 * Synthetic fixtures label every frame (`frames`); recorded videos usually
 * label key frames only (`keyframes`), which are interpolated.
 */
export interface VideoLabels {
  id: string;
  documentType: Scenario['documentType'];
  fps: number;
  width: number;
  height: number;
  expectCapture: boolean;
  stillness: boolean;
  /** Video length in seconds (required with `keyframes`). */
  duration?: number;
  frames?: LabelFrame[];
  keyframes?: LabelFrame[];
}

/** Per-frame labels, interpolating corners linearly between key frames. */
export function denseFrames(v: VideoLabels): LabelFrame[] {
  if (v.frames?.length) return v.frames;
  const keys = [...(v.keyframes ?? [])].sort((a, b) => a.t - b.t);
  if (!keys.length) return [];
  const duration = v.duration ?? keys[keys.length - 1]!.t;
  const out: LabelFrame[] = [];
  for (let i = 0; i * (1 / v.fps) <= duration; i++) {
    const t = i / v.fps;
    const next = keys.findIndex((k) => k.t >= t);
    const b = keys[next === -1 ? keys.length - 1 : next]!;
    const a = keys[Math.max(0, (next === -1 ? keys.length : next) - 1)]!;
    // Label of the segment we are in; corners interpolated when both ends have one.
    const label = t >= b.t ? b.label : a.label;
    let quad: Quad | null = null;
    if (a.quad && b.quad && b.t > a.t) {
      const k = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
      quad = a.quad.map((p, j) => ({ x: p.x + (b.quad![j]!.x - p.x) * k, y: p.y + (b.quad![j]!.y - p.y) * k })) as Quad;
    } else {
      quad = (Math.abs(t - a.t) <= Math.abs(t - b.t) ? a : b).quad;
    }
    out.push({ t, quad, label });
  }
  return out;
}
