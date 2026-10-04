/**
 * 1-D constant-velocity Kalman filter. State is [position, velocity]; only
 * position is measured. Times are in milliseconds.
 */
export class Kalman1D {
  private x = 0;
  private v = 0;
  // Covariance [[p00, p01], [p01, p11]].
  private p00 = 1e3;
  private p01 = 0;
  private p11 = 1e3;
  private t = 0;
  private initialised = false;

  /**
   * @param q process noise: acceleration variance in px²/ms⁴
   * @param r measurement noise variance in px²
   * @param gate innovation (px) above which the target is treated as
   *   manoeuvring and the filter trusts the measurement more
   */
  constructor(
    private q = 1e-9,
    private r = 4,
    private gate = 12,
  ) {}

  get position() {
    return this.x;
  }

  get velocity() {
    return this.v;
  }

  reset(x: number, t: number) {
    this.x = x;
    this.v = 0;
    this.p00 = this.r;
    this.p01 = 0;
    // A document usually enters nearly still: σv ≈ 0.03 px/ms (2 px/frame).
    this.p11 = 1e-3;
    this.t = t;
    this.initialised = true;
  }

  private predict(t: number) {
    const dt = Math.max(0, t - this.t);
    this.t = t;
    this.x += this.v * dt;
    // P = F P Fᵀ + Q, F = [[1, dt], [0, 1]], Q from white-noise acceleration.
    const dt2 = dt * dt;
    const q = this.q;
    const p00 = this.p00 + 2 * dt * this.p01 + dt2 * this.p11 + (q * dt2 * dt2) / 4;
    const p01 = this.p01 + dt * this.p11 + (q * dt2 * dt) / 2;
    const p11 = this.p11 + q * dt2;
    this.p00 = p00;
    this.p01 = p01;
    this.p11 = p11;
  }

  update(z: number, t: number): number {
    if (!this.initialised) {
      this.reset(z, t);
      return z;
    }
    const dt = Math.max(1, t - this.t);
    this.predict(t);
    const y = z - this.x;
    if (Math.abs(y) > this.gate) {
      // Real movement, not noise: widen the uncertainty so the filter catches up.
      this.p00 += y * y;
      this.p11 += (y / dt) ** 2;
    }
    const s = this.p00 + this.r;
    const k0 = this.p00 / s;
    const k1 = this.p01 / s;
    this.x += k0 * y;
    this.v += k1 * y;
    const p00 = (1 - k0) * this.p00;
    const p01 = (1 - k0) * this.p01;
    const p11 = this.p11 - k1 * this.p01;
    this.p00 = p00;
    this.p01 = p01;
    this.p11 = p11;
    return this.x;
  }

  /** Position extrapolated to time `t` without changing the state. */
  positionAt(t: number, maxLookaheadMs = 100): number {
    const dt = Math.min(maxLookaheadMs, Math.max(0, t - this.t));
    return this.x + this.v * dt;
  }
}
