// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentCapture } from '../src/create-document-capture';
import type { WorkerLike } from '../src/worker/client';

class InstantWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  messages: { type: string; id: number }[] = [];
  terminated = false;
  constructor(private failInit = false) {}
  postMessage(msg: { type: string; id: number }) {
    this.messages.push(msg);
    queueMicrotask(() => {
      if (msg.type === 'init' && this.failInit) {
        this.onmessage?.({ data: { type: 'error', id: msg.id, code: 'WASM_LOAD_FAILED', message: 'x' } } as MessageEvent);
        return;
      }
      const result = msg.type === 'init' ? { simd: true, offscreenCanvas: false, loadMs: 1 } : null;
      this.onmessage?.({ data: { type: 'result', id: msg.id, result } } as MessageEvent);
    });
  }
  terminate() {
    this.terminated = true;
  }
}

function fakeCamera(error?: { name: string }) {
  const track = { stop: vi.fn(), readyState: 'live', applyConstraints: vi.fn(async () => {}) };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        if (error) throw Object.assign(new Error(error.name), error);
        return stream;
      }),
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
  HTMLMediaElement.prototype.pause = vi.fn();
  return track;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createDocumentCapture', () => {
  it('refuses remote OCR plugins without opt-in', () => {
    expect(() =>
      createDocumentCapture({
        plugins: [
          { id: 'cloud', runsOnDevice: false, init: async () => {}, recognize: async () => ({ fields: [], text: '' }), dispose: () => {} },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'REMOTE_PLUGIN_NOT_ALLOWED' }));
  });

  it('starts, renders its elements and cleans everything up on destroy', async () => {
    const track = fakeCamera();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const worker = new InstantWorker();
    const statuses: string[] = [];
    const cap = createDocumentCapture({ container, createWorker: () => worker, overlay: false });
    cap.on('status', (s) => statuses.push(s));
    await cap.start();
    expect(cap.status).toBe('running');
    expect(container.querySelector('video')).not.toBeNull();
    expect(container.querySelector('[aria-live]')!.textContent).toBe('Starting camera…');

    await cap.destroy();
    expect(track.stop).toHaveBeenCalled();
    expect(worker.terminated).toBe(true);
    expect(worker.messages.map((m) => m.type)).toContain('dispose');
    expect(container.children.length).toBe(0);
    expect(statuses).toEqual(['loading', 'running', 'stopped', 'destroyed']);
  });

  it('reports a typed error when the camera permission is denied', async () => {
    fakeCamera({ name: 'NotAllowedError' });
    const container = document.createElement('div');
    const cap = createDocumentCapture({ container, createWorker: () => new InstantWorker() });
    const errors: string[] = [];
    cap.on('error', (e) => errors.push(e.code));
    await expect(cap.start()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(errors).toEqual(['PERMISSION_DENIED']);
    expect(cap.status).toBe('stopped');
  });

  it('reports WASM load failures', async () => {
    fakeCamera();
    const container = document.createElement('div');
    const cap = createDocumentCapture({ container, createWorker: () => new InstantWorker(true) });
    await expect(cap.start()).rejects.toMatchObject({ code: 'WASM_LOAD_FAILED' });
  });

  it('only calls fetch-free APIs: no network or storage during a session', async () => {
    fakeCamera();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cap = createDocumentCapture({ container: document.createElement('div'), createWorker: () => new InstantWorker() });
    await cap.start();
    await cap.destroy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
