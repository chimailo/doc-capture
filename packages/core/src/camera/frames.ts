import type { FramePayload } from '../worker/protocol';
import type { Size } from '../types';
import { clearCanvas } from '../output/encode';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Calls `cb` once per decoded video frame (or display frame as a fallback). */
export function startFrameLoop(video: HTMLVideoElement, cb: (now: number) => void): () => void {
  let stopped = false;
  type RVFC = (cb: (now: number) => void) => number;
  const rvfc = (video as unknown as { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback;
  const tick = (now: number) => {
    if (stopped) return;
    cb(now);
    schedule();
  };
  const schedule = () => {
    if (rvfc) rvfc.call(video, tick);
    else requestAnimationFrame(tick);
  };
  schedule();
  return () => {
    stopped = true;
  };
}

/** Grabs frames from the video at preview size and at full resolution. */
export class FrameGrabber {
  private small: AnyCanvas | null = null;
  private full: AnyCanvas | null = null;

  constructor(
    /** Long side of preview frames sent for detection. */
    private maxSide = 640,
    /** Send ImageBitmaps (needs OffscreenCanvas in the worker) or raw pixels. */
    private useBitmaps = true,
  ) {}

  previewSize(video: HTMLVideoElement): Size {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const k = Math.min(1, this.maxSide / Math.max(vw, vh));
    return { width: Math.round(vw * k), height: Math.round(vh * k) };
  }

  /** Preview-size frame; its buffer is meant to be transferred. */
  grabPreview(video: HTMLVideoElement): FramePayload | null {
    if (!video.videoWidth) return null;
    const { width, height } = this.previewSize(video);
    if (!this.small || this.small.width !== width || this.small.height !== height) {
      this.small = makeCanvas(width, height);
    }
    const ctx = this.small.getContext('2d', { willReadFrequently: !this.useBitmaps }) as Ctx2D;
    ctx.drawImage(video, 0, 0, width, height);
    if (this.useBitmaps && 'transferToImageBitmap' in this.small) {
      return { kind: 'bitmap', bitmap: this.small.transferToImageBitmap(), width, height };
    }
    const img = ctx.getImageData(0, 0, width, height);
    return { kind: 'pixels', data: img.data, width, height };
  }

  /**
   * Full-resolution frame. Uses `ImageCapture.takePhoto()` when available and
   * its field of view matches the video; otherwise the current video frame.
   */
  async grabFull(video: HTMLVideoElement, track: MediaStreamTrack | null): Promise<FramePayload> {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const IC = (globalThis as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto(): Promise<Blob> } }).ImageCapture;
    if (IC && track && track.readyState === 'live') {
      try {
        const blob = await new IC(track).takePhoto();
        const bitmap = await createImageBitmap(blob);
        const sameAspect = Math.abs(bitmap.width / bitmap.height - vw / vh) < 0.02;
        if (sameAspect && bitmap.width >= vw) {
          return this.fromBitmap(bitmap);
        }
        bitmap.close();
      } catch {
        // Fall through to the video frame.
      }
    }
    if (!this.full || this.full.width !== vw || this.full.height !== vh) {
      this.full = makeCanvas(vw, vh);
    }
    const ctx = this.full.getContext('2d', { willReadFrequently: !this.useBitmaps }) as Ctx2D;
    ctx.drawImage(video, 0, 0, vw, vh);
    if (this.useBitmaps && 'transferToImageBitmap' in this.full) {
      return { kind: 'bitmap', bitmap: this.full.transferToImageBitmap(), width: vw, height: vh };
    }
    const img = ctx.getImageData(0, 0, vw, vh);
    ctx.clearRect(0, 0, vw, vh);
    return { kind: 'pixels', data: img.data, width: vw, height: vh };
  }

  /** Wraps a bitmap as a payload, converting to pixels if the worker needs them. */
  fromBitmap(bitmap: ImageBitmap): FramePayload {
    if (this.useBitmaps) return { kind: 'bitmap', bitmap, width: bitmap.width, height: bitmap.height };
    const c = makeCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d') as Ctx2D;
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
    clearCanvas(c);
    return { kind: 'pixels', data: img.data, width: img.width, height: img.height };
  }

  dispose(): void {
    if (this.small) clearCanvas(this.small);
    if (this.full) clearCanvas(this.full);
    this.small = null;
    this.full = null;
  }
}
