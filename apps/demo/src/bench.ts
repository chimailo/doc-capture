// Bench entry: runs the SDK headless against the (fake) camera and records
// every event with timestamps for apps/bench to score. Query parameters:
//   ?type=id-card|passport|a4   ?auto=0   ?thresholds=<json>
import { createDocumentCapture } from '@doc-capture/core';
import type { CaptureResult, DocumentType } from '@doc-capture/core';
import { opencv } from './opencv';

interface BenchEvent {
  t: number;
  type: string;
  data?: unknown;
}

const params = new URLSearchParams(location.search);
const events: BenchEvent[] = [];
const t0 = performance.now();
const log = (type: string, data?: unknown) => events.push({ t: performance.now() - t0, type, data });
let source: { width: number; height: number } | null = null;

const capture = createDocumentCapture({
  container: document.getElementById('capture')!,
  documentTypes: [(params.get('type') ?? 'id-card') as DocumentType],
  autoCapture: params.get('auto') !== '0',
  opencv,
  thresholds: params.get('thresholds') ? JSON.parse(params.get('thresholds')!) : undefined,
  onMetrics: (m) => {
    if (m.type === 'capture') source = { width: m.sourceWidth, height: m.sourceHeight };
    if (m.type !== 'frame') log('metric', m);
  },
});

capture.on('detection', (d) => log('detection', { quad: d.quad, frame: d.frame, passed: d.quality?.passed ?? false }));
capture.on('guidance', (g) => log('guidance', g.state));
capture.on('error', (e) => log('error', { code: e.code, message: e.message }));
capture.on('capture', (r: CaptureResult) =>
  log('capture', {
    corners: r.corners,
    width: r.width,
    height: r.height,
    mode: r.captureMode,
    source,
    quality: r.quality,
    bytes: r.image.size,
  }),
);

declare global {
  interface Window {
    __bench: {
      events: BenchEvent[];
      status: () => string;
      captureNow: () => Promise<unknown>;
      destroy: () => Promise<void>;
    };
  }
}

window.__bench = {
  events,
  status: () => capture.status,
  captureNow: () => capture.captureNow(),
  destroy: () => capture.destroy(),
};

capture.on('status', (s) => log('status', s));

// Video time zero for aligning events with the fixture's labels.
new MutationObserver((_, obs) => {
  const video = document.querySelector('video');
  if (!video) return;
  obs.disconnect();
  video.addEventListener('playing', () => log('playing'), { once: true });
}).observe(document.body, { childList: true, subtree: true });

capture.start().catch((e) => log('error', { message: String(e) }));
