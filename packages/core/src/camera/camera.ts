import { InsecureContext, NoCamera, PermissionDenied, Unsupported } from '../errors';

export interface CameraOptions {
  /** Default `environment` (rear camera). */
  facingMode?: 'environment' | 'user';
  /** Ideal capture width. Default 1920. */
  idealWidth?: number;
  /** Ideal capture height. Default 1080. */
  idealHeight?: number;
  /** Use a specific camera. */
  deviceId?: string;
}

export interface Camera {
  stream: MediaStream;
  track: MediaStreamTrack;
  video: HTMLVideoElement;
  stop(): void;
}

function mapError(e: unknown): Error {
  const name = (e as { name?: string })?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return new PermissionDenied(e);
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'NotReadableError':
    case 'TrackStartError':
      return new NoCamera(e);
    default:
      return e instanceof Error ? e : new NoCamera(e);
  }
}

/** Opens the camera and attaches it to a muted, inline video element. */
export async function openCamera(video: HTMLVideoElement, opts: CameraOptions = {}): Promise<Camera> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) throw new InsecureContext();
  if (!navigator.mediaDevices?.getUserMedia) throw new Unsupported('camera access (getUserMedia)');

  const constraints: MediaTrackConstraints = {
    width: { ideal: opts.idealWidth ?? 1920 },
    height: { ideal: opts.idealHeight ?? 1080 },
    ...(opts.deviceId
      ? { deviceId: { exact: opts.deviceId } }
      : { facingMode: { ideal: opts.facingMode ?? 'environment' } }),
  };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
  } catch (e) {
    if ((e as { name?: string })?.name !== 'OverconstrainedError') throw mapError(e);
    // Retry with only the facing mode.
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: opts.facingMode ?? 'environment' },
        audio: false,
      });
    } catch (e2) {
      throw mapError(e2);
    }
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach((t) => t.stop());
    throw new NoCamera();
  }
  // Ask for continuous autofocus where supported; ignored elsewhere.
  track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});

  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.srcObject = stream;
  await new Promise<void>((resolve) => {
    if (video.readyState >= 1) return resolve();
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });
  await video.play().catch(() => {});

  return {
    stream,
    track,
    video,
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      video.pause();
      video.srcObject = null;
    },
  };
}
