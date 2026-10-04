export type ErrorCode =
  | 'PERMISSION_DENIED'
  | 'NO_CAMERA'
  | 'INSECURE_CONTEXT'
  | 'WASM_LOAD_FAILED'
  | 'UNSUPPORTED'
  | 'REMOTE_PLUGIN_NOT_ALLOWED'
  | 'INTERNAL';

export class DocumentCaptureError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class PermissionDenied extends DocumentCaptureError {
  constructor(cause?: unknown) {
    super('PERMISSION_DENIED', 'Camera permission was denied.', { cause });
  }
}

export class NoCamera extends DocumentCaptureError {
  constructor(cause?: unknown) {
    super('NO_CAMERA', 'No camera is available on this device.', { cause });
  }
}

export class InsecureContext extends DocumentCaptureError {
  constructor() {
    super('INSECURE_CONTEXT', 'The camera needs a secure context (HTTPS or localhost).');
  }
}

export class WasmLoadFailed extends DocumentCaptureError {
  constructor(message = 'OpenCV failed to load.', cause?: unknown) {
    super('WASM_LOAD_FAILED', message, { cause });
  }
}

export class Unsupported extends DocumentCaptureError {
  constructor(feature: string) {
    super('UNSUPPORTED', `This browser does not support ${feature}.`);
  }
}

export class RemotePluginNotAllowed extends DocumentCaptureError {
  constructor(pluginId: string) {
    super(
      'REMOTE_PLUGIN_NOT_ALLOWED',
      `Plugin "${pluginId}" sends data off the device. Set allowRemoteProcessing: true to use it.`,
    );
  }
}

/** Errors crossing the worker boundary lose their class; this restores it. */
export function errorFromCode(code: ErrorCode, message: string): DocumentCaptureError {
  switch (code) {
    case 'WASM_LOAD_FAILED':
      return new WasmLoadFailed(message);
    default:
      return new DocumentCaptureError(code, message);
  }
}
