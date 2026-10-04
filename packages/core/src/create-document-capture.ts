import type { OcrPlugin, OcrResult } from '@doc-capture/ocr-types';
import { openCamera } from './camera/camera';
import type { Camera, CameraOptions } from './camera/camera';
import { FrameGrabber, startFrameLoop } from './camera/frames';
import { AutoCapture } from './capture/auto-capture';
import type { FrameCandidate } from './capture/auto-capture';
import { performanceClock } from './clock';
import type { Clock } from './clock';
import { DocumentCaptureError } from './errors';
import { Emitter } from './emitter';
import { scaleQuad } from './geometry';
import { Announcer } from './guidance/announcer';
import { resolveMessages } from './guidance/messages';
import type { GuidanceMessages } from './guidance/messages';
import { GuidanceMachine } from './guidance/state-machine';
import type { CaptureMetrics } from './metrics';
import type { OpenCvConfig } from './opencv/loader';
import { encodePixels } from './output/encode';
import type { RawImage } from './output/encode';
import { DEFAULT_THEME, Overlay } from './overlay/overlay';
import type { OverlayTheme } from './overlay/overlay';
import { assertPluginsAllowed } from './plugins';
import { DEFAULT_THRESHOLDS } from './quality/thresholds';
import type { QualityThresholds } from './quality/thresholds';
import { QuadTracker } from './tracking/quad-tracker';
import type {
  CaptureResult,
  DocumentType,
  GuidanceState,
  OutputFormat,
  Quad,
  QualityReport,
  Size,
} from './types';
import { WorkerClient, defaultWorker } from './worker/client';
import type { WorkerLike } from './worker/client';
import type { EnhanceOptions, FramePayload, InitResult, ProcessResult } from './worker/protocol';

export interface DocumentCaptureOptions {
  /**
   * Element the SDK renders into (video, overlay, live region). Leave out
   * and pass `video` (and optionally `overlayCanvas`) to bring your own.
   */
  container?: HTMLElement;
  video?: HTMLVideoElement;
  overlayCanvas?: HTMLCanvasElement;
  /** Accepted document types. Default `['id-card']`. */
  documentTypes?: DocumentType[];
  /** Capture automatically once every check passes. Default `true`. */
  autoCapture?: boolean;
  /** Pause on a review step after capture instead of stopping. Default `false`. */
  review?: boolean;
  output?: { format?: OutputFormat; quality?: number; size?: Size };
  enhance?: EnhanceOptions;
  /** Also return the full, uncropped frame. Default `false`. */
  includeOriginal?: boolean;
  /** Directory URL holding the OpenCV files. Default `/opencv/`. */
  wasmUrl?: string;
  /** Advanced OpenCV loading options (integrity hashes, variant, SIMD). */
  opencv?: Partial<OpenCvConfig>;
  /** URL of `worker.js` if your bundler does not handle `new URL(..., import.meta.url)`. */
  workerUrl?: string | URL;
  /** Locale tag, e.g. `fr`. Default: the browser language. */
  locale?: string;
  /** Override individual messages. */
  messages?: Partial<GuidanceMessages>;
  plugins?: OcrPlugin[];
  /** Required to use plugins with `runsOnDevice: false`. Default `false`. */
  allowRemoteProcessing?: boolean;
  thresholds?: Partial<QualityThresholds>;
  /** How long every check must pass before auto-capture. Default 500 ms. */
  stableMs?: number;
  /** Good frames kept for the best-frame choice. Default 8. */
  bestFrameBuffer?: number;
  /** Minimum time a guidance message stays up. Default 800 ms. */
  minMessageMs?: number;
  /** After this long without a capture, emit `shutterHint`. Default 8000 ms. */
  shutterHintMs?: number;
  /** Target detections per second. Default 15. */
  detectionRate?: number;
  /** Long side of frames used for detection. Default 640. */
  workingResolution?: number;
  /** Use `ImageCapture.takePhoto()` for auto-capture when available. Default `true`. */
  preferPhoto?: boolean;
  vibrate?: boolean;
  camera?: CameraOptions;
  /** Overlay colours, or `false` to draw nothing (custom UI). */
  overlay?: Partial<OverlayTheme> | false;
  /** Numbers-only telemetry. Never receives images. */
  onMetrics?: (m: CaptureMetrics) => void;
  /** @internal For tests. */
  clock?: Clock;
  /** @internal For tests. */
  createWorker?: () => WorkerLike;
}

export type CaptureStatus =
  | 'idle'
  | 'loading'
  | 'running'
  | 'capturing'
  | 'review'
  | 'stopped'
  | 'destroyed';

export interface DetectionEvent {
  /** Smoothed outline in `frame` coordinates, or null when hidden. */
  quad: Quad | null;
  frame: Size;
  quality: QualityReport | null;
  /** Auto-capture countdown, 0–1. */
  progress: number;
}

export interface DocumentCaptureEvents extends Record<string, unknown> {
  guidance: { state: GuidanceState; message: string };
  detection: DetectionEvent;
  capture: CaptureResult;
  error: DocumentCaptureError;
  status: CaptureStatus;
  /** Time to make the manual shutter button more visible. */
  shutterHint: { afterMs: number };
}

export interface DocumentCapture {
  readonly status: CaptureStatus;
  readonly guidance: GuidanceState;
  readonly messages: GuidanceMessages;
  on<K extends keyof DocumentCaptureEvents>(
    event: K,
    handler: (payload: DocumentCaptureEvents[K]) => void,
  ): () => void;
  off<K extends keyof DocumentCaptureEvents>(
    event: K,
    handler: (payload: DocumentCaptureEvents[K]) => void,
  ): void;
  /** Loads OpenCV (unless prewarmed), opens the camera and starts guiding. */
  start(): Promise<void>;
  /** Captures immediately, skipping the quality gate. */
  captureNow(): Promise<CaptureResult | null>;
  /** Leaves the review step and resumes detection. */
  retake(): void;
  /** Stops the camera and detection. `start()` can be called again. */
  stop(): void;
  /** Stops everything, terminates the worker and removes created elements. */
  destroy(): Promise<void>;
  /** Smoothed outline predicted at `now`, for custom overlays. */
  quadAt(now: number): Quad | null;
}

// ---------------------------------------------------------------------------
// Worker pool for prewarm()

interface WorkerHandle {
  client: WorkerClient;
  init: InitResult;
}

const pool = new Map<string, Promise<WorkerHandle>>();

function openCvConfig(o: Pick<DocumentCaptureOptions, 'wasmUrl' | 'opencv'>): OpenCvConfig {
  return { ...o.opencv, baseUrl: o.wasmUrl ?? o.opencv?.baseUrl ?? '/opencv/' };
}

function poolKey(o: Pick<DocumentCaptureOptions, 'wasmUrl' | 'opencv' | 'workerUrl'>) {
  return JSON.stringify([openCvConfig(o), String(o.workerUrl ?? '')]);
}

async function spawn(
  o: Pick<DocumentCaptureOptions, 'wasmUrl' | 'opencv' | 'workerUrl' | 'detectionRate' | 'createWorker'>,
): Promise<WorkerHandle> {
  const worker = o.createWorker ? o.createWorker() : defaultWorker(o.workerUrl);
  const client = new WorkerClient(worker, o.detectionRate ?? 15);
  try {
    return { client, init: await client.init(openCvConfig(o)) };
  } catch (e) {
    client.terminate();
    throw e;
  }
}

/**
 * Starts the worker and loads OpenCV ahead of time, e.g. on the screen before
 * the capture screen. The next `createDocumentCapture` with the same
 * `wasmUrl`, `opencv` and `workerUrl` options reuses it.
 */
export function prewarm(
  options: Pick<DocumentCaptureOptions, 'wasmUrl' | 'opencv' | 'workerUrl'> = {},
): Promise<void> {
  const key = poolKey(options);
  if (!pool.has(key)) {
    const p = spawn(options);
    p.catch(() => pool.delete(key));
    pool.set(key, p);
  }
  return pool.get(key)!.then(() => undefined);
}

function acquire(o: DocumentCaptureOptions): Promise<WorkerHandle> {
  if (!o.createWorker) {
    const key = poolKey(o);
    const p = pool.get(key);
    if (p) {
      pool.delete(key);
      return p;
    }
  }
  return spawn(o);
}

// ---------------------------------------------------------------------------

const fullFrameQuad = (s: Size): Quad => [
  { x: 0, y: 0 },
  { x: s.width, y: 0 },
  { x: s.width, y: s.height },
  { x: 0, y: s.height },
];

async function toBlob(img: Blob | RawImage, format: OutputFormat, quality: number) {
  if (img instanceof Blob) return img;
  const blob = await encodePixels(img, format, quality);
  img.data.fill(0);
  return blob;
}

const STATUS_FATAL = new Set(['PERMISSION_DENIED', 'NO_CAMERA', 'INSECURE_CONTEXT', 'WASM_LOAD_FAILED', 'UNSUPPORTED']);

class DocumentCaptureImpl implements DocumentCapture {
  private emitter = new Emitter<DocumentCaptureEvents>();
  private _status: CaptureStatus = 'idle';
  readonly messages: GuidanceMessages;

  private readonly clock: Clock;
  private readonly types: DocumentType[];
  private readonly thresholds: QualityThresholds;
  private readonly format: OutputFormat;
  private readonly quality: number;

  private worker: WorkerHandle | null = null;
  private camera: Camera | null = null;
  private grabber: FrameGrabber;
  private tracker = new QuadTracker();
  private guidanceMachine: GuidanceMachine;
  private auto: AutoCapture<ImageBitmap>;
  private announcer: Announcer | null = null;
  private overlay: Overlay | null = null;
  private stopLoop: (() => void) | null = null;

  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private createdRoot: HTMLElement | null = null;

  private lastFrame: Size = { width: 0, height: 0 };
  private lastQuality: QualityReport | null = null;
  private lastPassed = false;
  private startedAt = 0;
  private firstDocumentAt: number | null = null;
  private lastDetectedType: DocumentType | null = null;
  private shutterHinted = false;
  private pluginsReady: Promise<void> | null = null;
  private generation = 0;

  constructor(private o: DocumentCaptureOptions) {
    assertPluginsAllowed(o.plugins ?? [], o.allowRemoteProcessing ?? false);
    this.clock = o.clock ?? performanceClock;
    this.types = o.documentTypes?.length ? o.documentTypes : ['id-card'];
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...o.thresholds };
    this.format = o.output?.format ?? 'jpeg';
    this.quality = o.output?.quality ?? 0.92;
    this.messages = resolveMessages(o.locale, o.messages);
    this.grabber = new FrameGrabber(o.workingResolution ?? 640);
    this.guidanceMachine = new GuidanceMachine(o.minMessageMs ?? 800);
    this.auto = new AutoCapture<ImageBitmap>({
      stableMs: o.stableMs ?? 500,
      bufferSize: o.bestFrameBuffer ?? 8,
      release: (b) => b.close(),
    });
  }

  get status() {
    return this._status;
  }

  get guidance() {
    return this.guidanceMachine.state;
  }

  on: DocumentCapture['on'] = (event, handler) => this.emitter.on(event, handler);
  off: DocumentCapture['off'] = (event, handler) => this.emitter.off(event, handler);

  private setStatus(s: CaptureStatus) {
    if (this._status === s) return;
    this._status = s;
    this.emitter.emit('status', s);
  }

  private metric(m: CaptureMetrics) {
    try {
      this.o.onMetrics?.(m);
    } catch {
      // Host callback errors must not break capture.
    }
  }

  private fail(e: unknown) {
    const err =
      e instanceof DocumentCaptureError
        ? e
        : new DocumentCaptureError('INTERNAL', e instanceof Error ? e.message : String(e), { cause: e });
    this.emitter.emit('error', err);
    if (STATUS_FATAL.has(err.code)) this.stop();
  }

  private mountDom() {
    if (this.video) return;
    if (this.o.video) {
      this.video = this.o.video;
      this.canvas = this.o.overlayCanvas ?? null;
      this.announcer = new Announcer(this.o.container ?? this.video.parentElement, this.o.vibrate ?? true);
      return;
    }
    if (!this.o.container) {
      throw new DocumentCaptureError('INTERNAL', 'Pass either `container` or `video`.');
    }
    const root = document.createElement('div');
    root.className = 'dc-root';
    root.style.cssText = 'position:relative;overflow:hidden;width:100%;height:100%;background:#000';
    const video = document.createElement('video');
    video.className = 'dc-video';
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
    video.setAttribute('aria-hidden', 'true');
    root.appendChild(video);
    if (this.o.overlay !== false) {
      const canvas = document.createElement('canvas');
      canvas.className = 'dc-overlay';
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      root.appendChild(canvas);
      this.canvas = canvas;
    }
    this.o.container.appendChild(root);
    this.createdRoot = root;
    this.video = video;
    this.announcer = new Announcer(root, this.o.vibrate ?? true);
  }

  async start(): Promise<void> {
    if (this._status === 'destroyed') throw new DocumentCaptureError('INTERNAL', 'Destroyed.');
    if (this._status === 'running' || this._status === 'loading') return;
    const gen = ++this.generation;
    this.setStatus('loading');
    try {
      this.mountDom();
      this.emitGuidance(this.guidanceMachine.state);
      const [handle, camera] = await Promise.all([
        this.worker ? Promise.resolve(this.worker) : acquire(this.o),
        openCamera(this.video!, this.o.camera),
      ]);
      if (gen !== this.generation) {
        camera.stop();
        if (!this.worker) handle.client.terminate();
        return;
      }
      if (!this.worker) {
        this.worker = handle;
        this.metric({ type: 'init', loadMs: handle.init.loadMs, simd: handle.init.simd });
      }
      this.camera = camera;
      this.grabber = new FrameGrabber(this.o.workingResolution ?? 640, handle.init.offscreenCanvas);
      this.pluginsReady ??= Promise.all((this.o.plugins ?? []).map((p) => p.init())).then(() => {});
      this.resetSession();
      this.setStatus('running');
      this.stopLoop = startFrameLoop(this.video!, this.onFrame);
      if (this.canvas && this.o.overlay !== false) {
        this.overlay = new Overlay(
          this.canvas,
          (now) => ({ quad: this.tracker.quadAt(now), frame: this.lastFrame, ready: this.lastPassed }),
          { ...DEFAULT_THEME, ...(this.o.overlay || {}) },
        );
        this.overlay.start();
      }
    } catch (e) {
      if (gen === this.generation) {
        this.setStatus('stopped');
        this.fail(e);
      }
      throw e;
    }
  }

  private resetSession() {
    const now = this.clock();
    this.startedAt = now;
    this.firstDocumentAt = null;
    this.lastDetectedType = null;
    this.shutterHinted = false;
    this.tracker.reset();
    this.auto.clear();
    this.lastQuality = null;
    this.lastPassed = false;
    this.guidanceMachine.reset(now);
  }

  private onFrame = (now: number) => {
    const w = this.worker;
    const video = this.video;
    if (this._status !== 'running' || !w || !video || !w.client.ready(now)) return;
    const frame = this.grabber.grabPreview(video);
    if (!frame) return;
    const preview = { width: frame.width, height: frame.height };
    // Snapshot the full-resolution frame while things look good, for best-frame choice.
    const snapshot =
      (this.o.autoCapture ?? true) && this.lastPassed && typeof createImageBitmap === 'function'
        ? createImageBitmap(video).catch(() => null)
        : null;
    const gen = this.generation;
    const sentAt = this.clock();
    w.client
      .process(frame, { documentTypes: this.types, previous: this.tracker.quad, thresholds: this.thresholds }, now)
      .then(async (res) => {
        const snap = snapshot ? await snapshot : null;
        if (gen !== this.generation || this._status !== 'running') {
          snap?.close();
          return;
        }
        this.metric({
          type: 'frame',
          workerMs: res.ms,
          roundTripMs: this.clock() - sentAt,
          detected: !!res.detection,
          liveMats: res.liveMats,
        });
        this.onResult(res, now, snap, preview);
      })
      .catch((e) => {
        if (gen === this.generation) this.fail(e);
      });
  };

  private onResult(res: ProcessResult, frameTime: number, snap: ImageBitmap | null, preview: Size) {
    const t = this.clock();
    if (res.detection && this.firstDocumentAt === null) this.firstDocumentAt = t;
    if (res.detection) this.lastDetectedType = res.detection.documentType;
    this.tracker.update(res.detection?.quad ?? null, frameTime);
    this.lastFrame = res.frame;
    this.lastQuality = res.detection ? res.quality : null;
    const passed = !!(res.quality?.passed && this.tracker.isVisible);
    this.lastPassed = passed;

    let trigger = false;
    if (this.o.autoCapture ?? true) {
      const candidate: FrameCandidate<ImageBitmap> | null =
        passed && snap && res.detection
          ? { frame: snap, quad: res.detection.quad, preview, sharpness: res.sharpness ?? 0, at: t }
          : null;
      if (!candidate) snap?.close();
      trigger = this.auto.update(t, passed, candidate);
    } else {
      snap?.close();
    }

    this.emitter.emit('detection', {
      quad: this.tracker.quad,
      frame: res.frame,
      quality: this.lastQuality,
      progress: this.auto.progress(t),
    });
    this.updateGuidance(t);

    if (!this.shutterHinted && t - this.startedAt >= (this.o.shutterHintMs ?? 8000)) {
      this.shutterHinted = true;
      this.emitter.emit('shutterHint', { afterMs: t - this.startedAt });
    }
    if (trigger) void this.capture('auto');
  }

  private updateGuidance(now: number) {
    const s = this.guidanceMachine.update({
      now,
      started: this._status !== 'loading',
      documentVisible: this.tracker.isVisible,
      quality: this.lastQuality,
      capturing: this._status === 'capturing',
      reviewing: this._status === 'review',
    });
    if (s) {
      this.emitGuidance(s);
      this.metric({ type: 'guidance', state: s, at: now - this.startedAt });
    }
  }

  private emitGuidance(state: GuidanceState) {
    const message = this.messages[state];
    this.emitter.emit('guidance', { state, message });
    this.announcer?.announce(message);
  }

  captureNow(): Promise<CaptureResult | null> {
    return this.capture('manual');
  }

  private async capture(mode: 'auto' | 'manual'): Promise<CaptureResult | null> {
    const w = this.worker;
    const video = this.video;
    if (this._status !== 'running' || !w || !video) return null;
    this.setStatus('capturing');
    this.updateGuidance(this.clock());
    this.announcer?.buzz(40);
    const gen = this.generation;

    const candidates = mode === 'auto' ? this.auto.takeBest() : [];
    const preview = this.grabber.previewSize(video);
    const liveQuad = this.tracker.quad;
    const sources: (() => Promise<{ payload: FramePayload; hint: Quad | null; previewSize: Size }>)[] = [];
    const usePhoto = mode === 'manual' || (this.o.preferPhoto ?? true);
    if (usePhoto) {
      sources.push(async () => ({
        payload: await this.grabber.grabFull(video, this.camera?.track ?? null),
        hint: liveQuad,
        previewSize: preview,
      }));
    }
    for (const c of candidates.slice(0, 2)) {
      sources.push(async () => ({ payload: this.grabber.fromBitmap(c.frame), hint: c.quad, previewSize: c.preview }));
    }
    const unused = candidates.slice(2);
    unused.forEach((c) => c.frame.close());

    try {
      for (const next of sources) {
        const { payload, hint, previewSize } = await next();
        const full = { width: payload.width, height: payload.height };
        const scaledHint = hint
          ? scaleQuad(hint, full.width / previewSize.width, full.height / previewSize.height)
          : fullFrameQuad(full);
        const result = await w.client.finalize(payload, {
          hint: scaledHint,
          documentType: this.bestType(),
          documentTypes: this.types,
          force: mode === 'manual',
          thresholds: this.thresholds,
          output: { format: this.format, quality: this.quality, size: this.o.output?.size },
          enhance: this.o.enhance ?? {},
          includeOriginal: this.o.includeOriginal ?? false,
        });
        if (gen !== this.generation) return null;
        if (!result.ok) {
          this.metric({ type: 'capture-rejected', reason: result.reason, finalizeMs: result.ms });
          continue;
        }
        const capturedAt = this.clock();
        const out: CaptureResult = {
          image: await toBlob(result.image, this.format, this.quality),
          width: result.width,
          height: result.height,
          documentType: this.bestType(),
          corners: result.corners,
          quality: result.quality,
          captureMode: mode,
          timings: { startedAt: this.startedAt, capturedAt },
        };
        if (result.original) out.original = await toBlob(result.original, this.format, this.quality);
        const ocr = await this.runPlugins(out);
        if (ocr) out.ocr = ocr;
        if (gen !== this.generation) return null;

        this.metric({
          type: 'capture',
          mode,
          totalMs: capturedAt - this.startedAt,
          timeToCaptureMs: this.firstDocumentAt === null ? null : capturedAt - this.firstDocumentAt,
          finalizeMs: result.ms,
          quality: result.quality,
          sourceWidth: full.width,
          sourceHeight: full.height,
        });
        this.announcer?.announce(this.messages.captured);
        this.announcer?.buzz([30, 60, 30]);
        if (this.o.review) {
          this.pauseDetection();
          this.setStatus('review');
          this.updateGuidance(this.clock());
        } else {
          this.stop();
        }
        this.emitter.emit('capture', out);
        return out;
      }
      // Every source failed the full-resolution checks: silently carry on.
      if ((this._status as CaptureStatus) === 'capturing') {
        this.setStatus('running');
        this.tracker.reset();
        this.updateGuidance(this.clock());
      }
      return null;
    } catch (e) {
      if ((this._status as CaptureStatus) === 'capturing') this.setStatus('running');
      this.fail(e);
      return null;
    } finally {
      candidates.slice(0, 2).forEach((c) => c.frame.close());
    }
  }

  private bestType(): DocumentType {
    return this.lastDetectedType ?? this.types[0]!;
  }

  private async runPlugins(result: CaptureResult): Promise<Record<string, OcrResult> | null> {
    const plugins = this.o.plugins ?? [];
    if (!plugins.length) return null;
    await this.pluginsReady;
    const bitmap = await createImageBitmap(result.image);
    try {
      const out: Record<string, OcrResult> = {};
      for (const p of plugins) {
        try {
          out[p.id] = await p.recognize(bitmap, { documentType: result.documentType });
        } catch (e) {
          this.emitter.emit(
            'error',
            new DocumentCaptureError('INTERNAL', `OCR plugin "${p.id}" failed.`, { cause: e }),
          );
        }
      }
      return out;
    } finally {
      bitmap.close();
    }
  }

  retake(): void {
    if (this._status !== 'review' || !this.video || !this.worker) return;
    this.resetSession();
    void this.worker.client.reset().catch(() => {});
    this.setStatus('running');
    this.updateGuidance(this.clock());
    this.stopLoop = startFrameLoop(this.video, this.onFrame);
    this.overlay?.start();
  }

  quadAt(now: number): Quad | null {
    return this.tracker.quadAt(now);
  }

  private pauseDetection() {
    this.stopLoop?.();
    this.stopLoop = null;
    this.overlay?.stop();
    this.auto.clear();
  }

  stop(): void {
    if (this._status === 'destroyed' || this._status === 'idle' || this._status === 'stopped') return;
    this.generation++;
    this.pauseDetection();
    this.overlay = null;
    this.camera?.stop();
    this.camera = null;
    this.grabber.dispose();
    this.tracker.reset();
    void this.worker?.client.reset().catch(() => {});
    this.setStatus('stopped');
  }

  async destroy(): Promise<void> {
    if (this._status === 'destroyed') return;
    this.stop();
    this.setStatus('destroyed');
    await this.worker?.client.dispose();
    this.worker = null;
    for (const p of this.o.plugins ?? []) {
      try {
        p.dispose();
      } catch {
        // Ignore plugin cleanup errors.
      }
    }
    this.announcer?.dispose();
    this.announcer = null;
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.createdRoot?.remove();
    this.createdRoot = null;
    this.video = null;
    this.canvas = null;
    this.emitter.clear();
  }
}

/** Creates a capture session. Call `start()` to open the camera. */
export function createDocumentCapture(options: DocumentCaptureOptions = {}): DocumentCapture {
  return new DocumentCaptureImpl(options);
}
