import type { Quad, Size } from '../types';

export interface FrameCandidate<T> {
  /** Payload kept for the best-frame choice, e.g. a full-resolution bitmap. */
  frame: T;
  /** Quad in preview coordinates. */
  quad: Quad;
  preview: Size;
  sharpness: number;
  at: number;
}

export interface AutoCaptureOptions<T> {
  /** All checks must pass continuously for this long. Default 500 ms. */
  stableMs?: number;
  /** How many recent good frames to keep. Default 8. */
  bufferSize?: number;
  /** Called when a buffered frame is dropped, to free it. */
  release?: (frame: T) => void;
}

/**
 * Decides when to auto-capture and keeps the last few good frames so the
 * sharpest one can be used.
 */
export class AutoCapture<T> {
  private goodSince: number | null = null;
  private buffer: FrameCandidate<T>[] = [];
  private stableMs: number;
  private bufferSize: number;
  private release: (frame: T) => void;

  constructor(opts: AutoCaptureOptions<T> = {}) {
    this.stableMs = opts.stableMs ?? 500;
    this.bufferSize = opts.bufferSize ?? 8;
    this.release = opts.release ?? (() => {});
  }

  /**
   * Feeds one processed frame. Returns `true` when capture should fire.
   * A failing frame resets the stability window and drops the buffer. A
   * passing frame without a candidate still counts towards stability.
   */
  update(now: number, passed: boolean, candidate: FrameCandidate<T> | null): boolean {
    if (!passed) {
      if (candidate) this.release(candidate.frame);
      this.clear();
      return false;
    }
    this.goodSince ??= now;
    if (candidate) {
      this.buffer.push(candidate);
      while (this.buffer.length > this.bufferSize) this.release(this.buffer.shift()!.frame);
    }
    return now - this.goodSince >= this.stableMs;
  }

  /** How far through the stability window we are, 0–1. */
  progress(now: number): number {
    return this.goodSince === null ? 0 : Math.min(1, (now - this.goodSince) / this.stableMs);
  }

  /** Removes and returns buffered frames, sharpest first. The caller owns them. */
  takeBest(): FrameCandidate<T>[] {
    const out = [...this.buffer].sort((a, b) => b.sharpness - a.sharpness);
    this.buffer = [];
    this.goodSince = null;
    return out;
  }

  clear(): void {
    for (const c of this.buffer) this.release(c.frame);
    this.buffer = [];
    this.goodSince = null;
  }
}
