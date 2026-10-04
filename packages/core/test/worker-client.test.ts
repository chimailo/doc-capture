import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../src/quality/thresholds';
import { WorkerClient } from '../src/worker/client';
import type { WorkerLike } from '../src/worker/client';
import { coverTransform } from '../src/overlay/overlay';

class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  sent: { msg: { id: number; type: string }; transfer: Transferable[] }[] = [];
  terminated = false;
  postMessage(msg: { id: number; type: string }, transfer: Transferable[]) {
    this.sent.push({ msg, transfer });
  }
  respond(id: number, result: unknown) {
    this.onmessage?.({ data: { type: 'result', id, result } } as MessageEvent);
  }
  fail(id: number, code: string, message: string) {
    this.onmessage?.({ data: { type: 'error', id, code, message } } as MessageEvent);
  }
  terminate() {
    this.terminated = true;
  }
}

const frame = () => ({
  kind: 'pixels' as const,
  data: new Uint8ClampedArray(16),
  width: 2,
  height: 2,
});
const params = { documentTypes: ['id-card' as const], previous: null, thresholds: DEFAULT_THRESHOLDS };

describe('WorkerClient', () => {
  it('keeps at most one frame in flight and transfers its buffer', async () => {
    const w = new FakeWorker();
    const c = new WorkerClient(w, 15);
    expect(c.ready(0)).toBe(true);
    const f = frame();
    const p = c.process(f, params, 0);
    expect(c.ready(1000)).toBe(false);
    expect(w.sent[0]!.transfer).toEqual([f.data.buffer]);
    w.respond(w.sent[0]!.msg.id, { detection: null, quality: null, frame: { width: 2, height: 2 }, ms: 1 });
    await p;
    expect(c.ready(1000)).toBe(true);
  });

  it('respects the target rate', async () => {
    const w = new FakeWorker();
    const c = new WorkerClient(w, 10);
    const p = c.process(frame(), params, 0);
    w.respond(1, null);
    await p;
    expect(c.ready(50)).toBe(false);
    expect(c.ready(101)).toBe(true);
  });

  it('maps worker errors to typed errors', async () => {
    const w = new FakeWorker();
    const c = new WorkerClient(w);
    const p = c.init({ baseUrl: '/opencv/' });
    w.fail(1, 'WASM_LOAD_FAILED', 'nope');
    await expect(p).rejects.toMatchObject({ code: 'WASM_LOAD_FAILED', name: 'WasmLoadFailed' });
  });

  it('rejects pending calls on terminate', async () => {
    const w = new FakeWorker();
    const c = new WorkerClient(w);
    const p = c.reset();
    c.terminate();
    await expect(p).rejects.toThrow('terminated');
    expect(w.terminated).toBe(true);
  });
});

describe('coverTransform', () => {
  it('maps frame coordinates for object-fit: cover', () => {
    // 16:9 video in a 9:16 portrait view: scaled to height, cropped at the sides.
    const t = coverTransform({ width: 1280, height: 720 }, { width: 360, height: 640 });
    expect(t.scale).toBeCloseTo(640 / 720);
    expect(t.dy).toBeCloseTo(0);
    expect(t.dx).toBeCloseTo((360 - 1280 * (640 / 720)) / 2);
  });
});
