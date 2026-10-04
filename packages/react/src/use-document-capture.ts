import { createDocumentCapture } from '@doc-capture/core';
import type {
  CaptureResult,
  CaptureStatus,
  DocumentCapture,
  DocumentCaptureError,
  DocumentCaptureOptions,
  GuidanceState,
  Quad,
  QualityReport,
  Size,
} from '@doc-capture/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseDocumentCaptureOptions extends Omit<DocumentCaptureOptions, 'container'> {
  /** Start the camera as soon as the container mounts. Default `true`. */
  autoStart?: boolean;
  onCapture?: (result: CaptureResult) => void;
  onError?: (error: DocumentCaptureError) => void;
}

export interface UseDocumentCaptureResult {
  /** Callback ref: attach to the element the camera view should fill. */
  container: (el: HTMLElement | null) => void;
  /** Lifecycle status. */
  state: CaptureStatus;
  guidance: { state: GuidanceState; message: string };
  /** Smoothed outline in `frame` coordinates. */
  quad: Quad | null;
  frame: Size;
  quality: QualityReport | null;
  /** Auto-capture countdown, 0–1. */
  progress: number;
  result: CaptureResult | null;
  error: DocumentCaptureError | null;
  /** True once the shutter button should be made more visible. */
  shutterHint: boolean;
  start: () => Promise<void>;
  stop: () => void;
  captureNow: () => Promise<CaptureResult | null>;
  retake: () => void;
  /** The underlying core instance, once created. */
  capture: DocumentCapture | null;
}

/**
 * Creates a capture session bound to a container element. Options are read
 * when the container mounts; change the component `key` to apply new ones.
 */
export function useDocumentCapture(options: UseDocumentCaptureOptions = {}): UseDocumentCaptureResult {
  // Latest options for callbacks, without re-creating the session.
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [capture, setCapture] = useState<DocumentCapture | null>(null);
  const [state, setState] = useState<CaptureStatus>('idle');
  const [guidance, setGuidance] = useState<{ state: GuidanceState; message: string }>({
    state: 'INIT',
    message: '',
  });
  const [detection, setDetection] = useState<{
    quad: Quad | null;
    frame: Size;
    quality: QualityReport | null;
    progress: number;
  }>({ quad: null, frame: { width: 0, height: 0 }, quality: null, progress: 0 });
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<DocumentCaptureError | null>(null);
  const [shutterHint, setShutterHint] = useState(false);

  useEffect(() => {
    if (!container) return;
    const { autoStart = true, onCapture: _c, onError: _e, ...coreOptions } = optsRef.current;
    let instance: DocumentCapture;
    try {
      instance = createDocumentCapture({ ...coreOptions, container });
    } catch (e) {
      const err = e as DocumentCaptureError;
      // Syncing from an external system (the core session) on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(err);
      optsRef.current.onError?.(err);
      return;
    }
    const offs = [
      instance.on('status', setState),
      instance.on('guidance', setGuidance),
      instance.on('detection', (d) => setDetection(d)),
      instance.on('capture', (r) => {
        setResult(r);
        optsRef.current.onCapture?.(r);
      }),
      instance.on('error', (e) => {
        setError(e);
        optsRef.current.onError?.(e);
      }),
      instance.on('shutterHint', () => setShutterHint(true)),
    ];
    setCapture(instance);
    setGuidance({ state: instance.guidance, message: instance.messages[instance.guidance] });
    if (autoStart) instance.start().catch(() => {});
    return () => {
      offs.forEach((off) => off());
      void instance.destroy();
      setCapture(null);
    };
  }, [container]);

  const attach = useCallback((el: HTMLElement | null) => setContainer(el), []);
  const start = useCallback(async () => {
    setError(null);
    setResult(null);
    setShutterHint(false);
    await capture?.start();
  }, [capture]);
  const stop = useCallback(() => capture?.stop(), [capture]);
  const captureNow = useCallback(async () => (capture ? capture.captureNow() : null), [capture]);
  const retake = useCallback(() => {
    setResult(null);
    setShutterHint(false);
    capture?.retake();
  }, [capture]);

  return {
    container: attach,
    state,
    guidance,
    quad: detection.quad,
    frame: detection.frame,
    quality: detection.quality,
    progress: detection.progress,
    result,
    error,
    shutterHint,
    start,
    stop,
    captureNow,
    retake,
    capture,
  };
}
