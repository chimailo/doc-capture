import type { Quad, Size } from '../types';

export interface OverlayTheme {
  /** Outline colour while guiding. */
  stroke: string;
  /** Outline colour once every check passes. */
  strokeReady: string;
  fill: string;
  lineWidth: number;
  /** Dim the area outside the document. 0 disables. */
  dimOutside: number;
}

export const DEFAULT_THEME: OverlayTheme = {
  stroke: 'rgba(255,255,255,0.95)',
  strokeReady: 'rgba(52,199,89,1)',
  fill: 'rgba(255,255,255,0.08)',
  lineWidth: 3,
  dimOutside: 0.35,
};

/** Maps video-frame coordinates to CSS pixels for `object-fit: cover`. */
export function coverTransform(frame: Size, view: Size) {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  return {
    scale,
    dx: (view.width - frame.width * scale) / 2,
    dy: (view.height - frame.height * scale) / 2,
  };
}

export interface OverlayState {
  quad: Quad | null;
  /** Frame size the quad's coordinates are in. */
  frame: Size;
  ready: boolean;
}

/**
 * Draws the document outline on a canvas laid over the video at display
 * refresh rate. `getState` is polled each animation frame.
 */
export class Overlay {
  private raf = 0;
  private ctx: CanvasRenderingContext2D | null;

  constructor(
    private canvas: HTMLCanvasElement,
    private getState: (now: number) => OverlayState,
    private theme: OverlayTheme = DEFAULT_THEME,
  ) {
    this.ctx = canvas.getContext('2d');
  }

  start(): void {
    const loop = (now: number) => {
      this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clear();
  }

  private fitCanvas(ctx: CanvasRenderingContext2D): Size {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  draw(now: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const view = this.fitCanvas(ctx);
    ctx.clearRect(0, 0, view.width, view.height);
    const { quad, frame, ready } = this.getState(now);
    if (!quad || !frame.width) return;

    const { scale, dx, dy } = coverTransform(frame, view);
    const pts = quad.map((p) => ({ x: p.x * scale + dx, y: p.y * scale + dy }));
    const path = new Path2D();
    pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();

    if (this.theme.dimOutside > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${this.theme.dimOutside})`;
      const outer = new Path2D();
      outer.rect(0, 0, view.width, view.height);
      outer.addPath(path);
      ctx.fill(outer, 'evenodd');
      ctx.restore();
    }

    ctx.fillStyle = this.theme.fill;
    ctx.fill(path);
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.theme.lineWidth;
    ctx.strokeStyle = ready ? this.theme.strokeReady : this.theme.stroke;
    ctx.stroke(path);

    ctx.fillStyle = ctx.strokeStyle;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.theme.lineWidth * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  clear(): void {
    this.ctx?.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
