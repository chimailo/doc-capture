import type {
  CaptureResult,
  DocumentCaptureError,
  DocumentType,
  GuidanceMessages,
} from '@doc-capture/core';
import { resolveMessages } from '@doc-capture/core';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useDocumentCapture } from './use-document-capture';
import type { UseDocumentCaptureOptions } from './use-document-capture';

export interface DocumentCaptureProps
  extends Omit<UseDocumentCaptureOptions, 'documentTypes' | 'onCapture' | 'onError' | 'review'> {
  /** One document type, or use `documentTypes` for several. */
  documentType?: DocumentType;
  documentTypes?: DocumentType[];
  /** Called with the accepted capture (after review, if enabled). */
  onCapture?: (result: CaptureResult) => void;
  onError?: (error: DocumentCaptureError) => void;
  /** Show a review screen with Retake / Use photo. Default `true`. */
  review?: boolean;
  /** Replace the default error view. */
  renderError?: (error: DocumentCaptureError, retry: () => void) => ReactNode;
  className?: string;
  style?: CSSProperties;
}

const v = (name: string, fallback: string) => `var(--dc-${name}, ${fallback})`;

const styles = {
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 320,
    overflow: 'hidden',
    background: v('background', '#000'),
    fontFamily: v('font', 'system-ui, -apple-system, sans-serif'),
    color: v('text', '#fff'),
  },
  view: { position: 'absolute', inset: 0 },
  banner: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    maxWidth: 'calc(100% - 32px)',
    padding: '10px 16px',
    borderRadius: v('radius', '12px'),
    background: v('banner-background', 'rgba(0,0,0,0.6)'),
    fontSize: 16,
    fontWeight: 600,
    textAlign: 'center',
    pointerEvents: 'none',
  },
  shutterWrap: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: `4px solid ${v('text', '#fff')}`,
    background: 'rgba(255,255,255,0.25)',
    cursor: 'pointer',
    transition: 'transform 200ms, background 200ms, box-shadow 200ms',
  },
  shutterHint: {
    background: v('accent', '#34c759'),
    transform: 'scale(1.12)',
    boxShadow: `0 0 0 8px rgba(52,199,89,0.35)`,
  },
  review: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    padding: 16,
    background: v('background', '#000'),
  },
  reviewImage: { maxWidth: '100%', maxHeight: '70%', borderRadius: 8 },
  actions: { display: 'flex', gap: 12 },
  button: {
    minHeight: 44,
    padding: '0 20px',
    borderRadius: v('radius', '12px'),
    border: `1px solid ${v('text', '#fff')}`,
    background: 'transparent',
    color: v('text', '#fff'),
    fontSize: 16,
    cursor: 'pointer',
  },
  primary: { background: v('accent', '#34c759'), borderColor: v('accent', '#34c759'), color: '#000' },
  error: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    textAlign: 'center',
  },
} satisfies Record<string, CSSProperties>;

const ERROR_TEXT: Record<string, string> = {
  PERMISSION_DENIED: 'Camera access was blocked. Allow camera access in your browser settings and try again.',
  NO_CAMERA: 'No camera was found on this device.',
  INSECURE_CONTEXT: 'The camera only works on a secure (HTTPS) page.',
  WASM_LOAD_FAILED: 'The document scanner could not be loaded. Check your connection and try again.',
  UNSUPPORTED: 'This browser does not support document capture.',
};

function ProgressRing({ progress }: { progress: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={88}
      height={88}
      viewBox="0 0 88 88"
      aria-hidden="true"
      style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%) rotate(-90deg)', pointerEvents: 'none' }}
    >
      <circle cx={44} cy={44} r={r} fill="none" stroke={v('accent', '#34c759')} strokeWidth={4} strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
    </svg>
  );
}

function Review({
  result,
  messages,
  onRetake,
  onAccept,
}: {
  result: CaptureResult;
  messages: GuidanceMessages;
  onRetake: () => void;
  onAccept: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(result.image), [result.image]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div style={styles.review} role="dialog" aria-label={messages.REVIEW}>
      <img src={url} alt={messages.REVIEW} style={styles.reviewImage} />
      <div style={styles.actions}>
        <button type="button" style={styles.button} onClick={onRetake}>
          {messages.retake}
        </button>
        <button type="button" style={{ ...styles.button, ...styles.primary }} onClick={onAccept} autoFocus>
          {messages.usePhoto}
        </button>
      </div>
    </div>
  );
}

/** Full capture UI: camera view, outline, guidance, shutter and review. */
export function DocumentCapture(props: DocumentCaptureProps) {
  const {
    documentType,
    documentTypes,
    onCapture,
    onError,
    review = true,
    renderError,
    className,
    style,
    ...options
  } = props;
  const types = documentTypes ?? (documentType ? [documentType] : undefined);
  const [accepted, setAccepted] = useState(false);

  const { container, ...cap } = useDocumentCapture({
    ...options,
    documentTypes: types,
    review,
    onCapture: review ? undefined : onCapture,
    onError,
  });
  const messages = cap.capture?.messages ?? resolveMessages(options.locale, options.messages);

  const showReview = review && cap.result && !accepted;
  const busy = cap.state === 'capturing' || cap.state === 'loading';

  return (
    <div className={className} style={{ ...styles.root, ...style }} data-state={cap.state} data-guidance={cap.guidance.state}>
      <div ref={container} style={styles.view} />

      {cap.error && cap.state !== 'running' ? (
        <div style={styles.error} role="alert">
          {renderError ? (
            renderError(cap.error, () => void cap.start())
          ) : (
            <>
              <p>{ERROR_TEXT[cap.error.code] ?? cap.error.message}</p>
              <button type="button" style={styles.button} onClick={() => void cap.start()}>
                Try again
              </button>
            </>
          )}
        </div>
      ) : showReview ? (
        <Review
          result={cap.result!}
          messages={messages}
          onRetake={() => {
            setAccepted(false);
            cap.retake();
          }}
          onAccept={() => {
            setAccepted(true);
            cap.stop();
            onCapture?.(cap.result!);
          }}
        />
      ) : (
        <>
          {cap.guidance.message && (
            <div style={styles.banner} aria-hidden="true">
              {cap.guidance.message}
            </div>
          )}
          {cap.progress > 0 && <ProgressRing progress={cap.progress} />}
          <div style={styles.shutterWrap}>
            <button
              type="button"
              aria-label={messages.shutter}
              disabled={busy || cap.state !== 'running'}
              onClick={() => void cap.captureNow()}
              style={{ ...styles.shutter, ...(cap.shutterHint ? styles.shutterHint : null) }}
            />
          </div>
        </>
      )}
    </div>
  );
}
