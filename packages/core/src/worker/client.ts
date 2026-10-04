import { errorFromCode } from '../errors';
import type { OpenCvConfig } from '../opencv/loader';
import type {
  FinalizeParams,
  FinalizeResult,
  FramePayload,
  FromWorker,
  InitResult,
  ProcessParams,
  ProcessResult,
  ToWorker,
} from './protocol';

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

/** Minimal Worker surface, so tests can pass a fake. */
export interface WorkerLike {
  postMessage(msg: unknown, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export function defaultWorker(url?: string | URL): WorkerLike {
  // Classic worker: bundlers recognise this pattern and emit worker.js.
  return url ? new Worker(url) : new Worker(new URL('./worker.js', import.meta.url));
}

function transferablesOf(frame: FramePayload): Transferable[] {
  return frame.kind === 'bitmap' ? [frame.bitmap] : [frame.data.buffer];
}

/**
 * Main-thread side of the detection worker. Allows one frame in flight at a
 * time and adapts the detection rate to how fast the device is.
 */
export class WorkerClient {
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private inFlight = false;
  private lastSentAt = -Infinity;
  /** Exponential moving average of round-trip time, ms. */
  private avgMs = 0;
  private terminated = false;

  constructor(
    private worker: WorkerLike,
    /** Target detections per second; lowered automatically on slow devices. */
    private targetRate = 15,
  ) {
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    worker.onerror = (e: ErrorEvent) => {
      const err = errorFromCode('INTERNAL', e.message || 'Worker error');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  private onMessage(msg: FromWorker) {
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.type === 'error') p.reject(errorFromCode(msg.code, msg.message));
    else p.resolve(msg.result);
  }

  private send<T>(msg: Omit<ToWorker, 'id'>, transfer: Transferable[] = []): Promise<T> {
    if (this.terminated) return Promise.reject(errorFromCode('INTERNAL', 'Worker terminated.'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...msg, id }, transfer);
    });
  }

  init(opencv: OpenCvConfig): Promise<InitResult> {
    return this.send({ type: 'init', opencv } as Omit<ToWorker, 'id'>);
  }

  /** Minimum gap between frames, ms. Grows when the device can't keep up. */
  get interval(): number {
    return Math.max(1000 / this.targetRate, this.avgMs * 1.2);
  }

  get averageMs(): number {
    return this.avgMs;
  }

  /** Whether a new frame should be sent now. */
  ready(now: number): boolean {
    return !this.inFlight && !this.terminated && now - this.lastSentAt >= this.interval;
  }

  async process(frame: FramePayload, params: ProcessParams, now: number): Promise<ProcessResult> {
    this.inFlight = true;
    this.lastSentAt = now;
    const t0 = performance.now();
    try {
      return await this.send<ProcessResult>(
        { type: 'process', frame, params } as Omit<ToWorker, 'id'>,
        transferablesOf(frame),
      );
    } finally {
      const rtt = performance.now() - t0;
      this.avgMs = this.avgMs === 0 ? rtt : this.avgMs * 0.8 + rtt * 0.2;
      this.inFlight = false;
    }
  }

  finalize(frame: FramePayload, params: FinalizeParams): Promise<FinalizeResult> {
    return this.send({ type: 'finalize', frame, params } as Omit<ToWorker, 'id'>, transferablesOf(frame));
  }

  reset(): Promise<void> {
    return this.send({ type: 'reset' } as Omit<ToWorker, 'id'>);
  }

  async dispose(): Promise<void> {
    if (this.terminated) return;
    try {
      await Promise.race([
        this.send({ type: 'dispose' } as Omit<ToWorker, 'id'>),
        new Promise((r) => setTimeout(r, 200)),
      ]);
    } catch {
      // Terminating anyway.
    }
    this.terminate();
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.worker.terminate();
    const err = errorFromCode('INTERNAL', 'Worker terminated.');
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
