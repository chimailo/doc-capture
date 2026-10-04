import type { Quad } from '@doc-capture/core';
import type { Scenario, Segment } from './scenarios';

/** Ground truth for one video, stored next to it as `<id>.json`. */
export interface VideoLabels {
  id: string;
  documentType: Scenario['documentType'];
  fps: number;
  width: number;
  height: number;
  expectCapture: boolean;
  stillness: boolean;
  frames: { t: number; quad: Quad | null; label: Segment['label'] }[];
}
