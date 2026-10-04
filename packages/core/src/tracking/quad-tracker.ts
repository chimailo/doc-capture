import { meanCornerShift, quadIoU } from '../geometry';
import type { Quad } from '../types';
import { Kalman1D } from './kalman';

export interface QuadTrackerOptions {
  /** Consecutive detections needed before the outline is shown. Default 3. */
  showAfter?: number;
  /** Consecutive misses before the outline is hidden. Default 5. */
  hideAfter?: number;
  /** Below this IoU with the current outline, the filters restart. Default 0.4. */
  resetIoU?: number;
  processNoise?: number;
  measurementNoise?: number;
  /**
   * A measurement whose corners move more than this (px, mean) is an outlier
   * until it repeats on the next detection. Default 10.
   */
  outlierPx?: number;
}

/**
 * Smooths the four corners with one Kalman filter per axis per corner, and
 * applies hysteresis so the outline does not flicker in and out.
 */
export class QuadTracker {
  private filters: Kalman1D[];
  private hits = 0;
  private misses = 0;
  private visible = false;
  private current: Quad | null = null;
  private pendingOutlier: Quad | null = null;
  private readonly opts: Required<QuadTrackerOptions>;

  constructor(options: QuadTrackerOptions = {}) {
    this.opts = {
      showAfter: 3,
      hideAfter: 5,
      resetIoU: 0.4,
      processNoise: 1e-9,
      measurementNoise: 4,
      outlierPx: 10,
      ...options,
    };
    this.filters = this.makeFilters();
  }

  private makeFilters() {
    return Array.from(
      { length: 8 },
      () => new Kalman1D(this.opts.processNoise, this.opts.measurementNoise),
    );
  }

  get isVisible() {
    return this.visible;
  }

  /** Smoothed quad as of the last update, or null when hidden. */
  get quad(): Quad | null {
    return this.visible ? this.current : null;
  }

  /** Feeds one detection result (or `null` for no detection). */
  update(measured: Quad | null, t: number): Quad | null {
    if (!measured) {
      this.hits = 0;
      this.misses++;
      if (this.misses >= this.opts.hideAfter) {
        this.visible = false;
        this.current = null;
      }
      return this.quad;
    }

    if (this.current && this.visible && meanCornerShift(this.current, measured) > this.opts.outlierPx) {
      // A one-frame jump is usually the detector picking a different edge.
      // Only follow it if the next detection agrees.
      const confirmed =
        this.pendingOutlier !== null && meanCornerShift(this.pendingOutlier, measured) <= this.opts.outlierPx;
      if (!confirmed) {
        this.pendingOutlier = measured;
        this.misses = 0;
        return this.quad;
      }
    }
    this.pendingOutlier = null;

    if (this.current && quadIoU(this.current, measured) < this.opts.resetIoU) {
      // The document jumped (or a different one appeared): start over.
      this.filters = this.makeFilters();
      this.hits = 0;
    }

    this.misses = 0;
    this.hits++;
    this.current = measured.map((p, i) => ({
      x: this.filters[i * 2]!.update(p.x, t),
      y: this.filters[i * 2 + 1]!.update(p.y, t),
    })) as Quad;
    if (this.hits >= this.opts.showAfter) this.visible = true;
    return this.quad;
  }

  /** Outline predicted at time `t`, for rendering between detections. */
  quadAt(t: number): Quad | null {
    if (!this.visible || !this.current) return null;
    return [0, 1, 2, 3].map((i) => ({
      x: this.filters[i * 2]!.positionAt(t),
      y: this.filters[i * 2 + 1]!.positionAt(t),
    })) as Quad;
  }

  /** Mean corner speed in px/ms. */
  get speed(): number {
    let s = 0;
    for (let i = 0; i < 4; i++) {
      s += Math.hypot(this.filters[i * 2]!.velocity, this.filters[i * 2 + 1]!.velocity);
    }
    return s / 4;
  }

  reset() {
    this.pendingOutlier = null;
    this.filters = this.makeFilters();
    this.hits = 0;
    this.misses = 0;
    this.visible = false;
    this.current = null;
  }
}
