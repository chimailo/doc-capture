/**
 * On-device document and ID capture for the web.
 *
 * @packageDocumentation
 */
export type {
  CaptureResult,
  Detection,
  DocumentType,
  GuidanceState,
  OcrPlugin,
  OcrResult,
  OutputFormat,
  Point,
  Quad,
  QualityCheck,
  QualityIssue,
  QualityReport,
  QualityScores,
  Size,
} from './types';
export {
  DocumentCaptureError,
  InsecureContext,
  NoCamera,
  PermissionDenied,
  RemotePluginNotAllowed,
  Unsupported,
  WasmLoadFailed,
} from './errors';
export type { ErrorCode } from './errors';
export { DOCUMENT_SPECS } from './document-types';
export type { DocumentSpec } from './document-types';
export { DEFAULT_THRESHOLDS } from './quality/thresholds';
export type { QualityThresholds } from './quality/thresholds';
export type { Detector, DetectorInput, ImageDataLike } from './detection/detector';
export type { IntegrityMap, OpenCvConfig } from './opencv/loader';
export { DEFAULT_THEME as DEFAULT_OVERLAY_THEME } from './overlay/overlay';
export type { OverlayTheme } from './overlay/overlay';
export { createDocumentCapture, prewarm } from './create-document-capture';
export type {
  CaptureStatus,
  DetectionEvent,
  DocumentCapture,
  DocumentCaptureEvents,
  DocumentCaptureOptions,
} from './create-document-capture';
export type { CameraOptions } from './camera/camera';
export type { EnhanceOptions } from './worker/protocol';
export type { CaptureMetrics } from './metrics';
export { BUILT_IN_LOCALES, resolveMessages } from './guidance/messages';
export type { GuidanceMessages } from './guidance/messages';
export { coverTransform } from './overlay/overlay';
export type { Clock } from './clock';
export type { WorkerLike } from './worker/client';
