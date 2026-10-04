import type { GuidanceState, QualityReport } from '../types';

export interface GuidanceInput {
  now: number;
  /** Camera running and first frame processed. */
  started: boolean;
  /** Smoothed outline currently shown. */
  documentVisible: boolean;
  quality: QualityReport | null;
  capturing: boolean;
  reviewing: boolean;
}

/** Target state for the current input, before dwell-time smoothing. */
export function targetState(i: GuidanceInput): GuidanceState {
  if (i.reviewing) return 'REVIEW';
  if (i.capturing) return 'CAPTURING';
  if (!i.started) return 'INIT';
  if (!i.documentVisible || !i.quality) return 'SEARCHING';
  // All checks passing: auto-capture is counting down, so keep still.
  return i.quality.issues[0] ?? 'HOLD_STILL';
}

const IMMEDIATE: ReadonlySet<GuidanceState> = new Set(['INIT', 'CAPTURING', 'REVIEW']);

/**
 * Shows one guidance message at a time. A message stays up for at least
 * `minDwellMs` so the text does not flicker; capture and review states are
 * shown immediately.
 */
export class GuidanceMachine {
  private current: GuidanceState = 'INIT';
  private since = -Infinity;

  constructor(private minDwellMs = 800) {}

  get state(): GuidanceState {
    return this.current;
  }

  /** Returns the new state if it changed, otherwise `null`. */
  update(input: GuidanceInput): GuidanceState | null {
    const target = targetState(input);
    if (target === this.current) return null;
    const leavingImmediate = IMMEDIATE.has(this.current) && this.current !== 'INIT';
    if (
      !IMMEDIATE.has(target) &&
      !leavingImmediate &&
      input.now - this.since < this.minDwellMs
    ) {
      return null;
    }
    this.current = target;
    this.since = input.now;
    return target;
  }

  reset(now: number): void {
    this.current = 'INIT';
    this.since = now;
  }
}
