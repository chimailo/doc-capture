import type { DocumentType } from '@doc-capture/core';

/** Document pose: centre and size as a share of the frame, rotation and tilt in degrees. */
export interface Pose {
  cx: number;
  cy: number;
  /** Width of the document's long side as a share of frame width. */
  scale: number;
  rotation: number;
  /** Perspective tilt: positive pulls the top edge in. */
  tilt: number;
}

export interface Effects {
  blur?: number;
  /** Glare spot radius as a share of document width. */
  glare?: number;
  brightness?: number;
  noise?: number;
  /** Random corner jitter amplitude in px (hand shake). */
  shake?: number;
}

export interface Segment {
  /** Seconds. */
  duration: number;
  /** `null` means no document in view. */
  from: Pose | null;
  to?: Pose | null;
  effects?: Effects;
  /**
   * `good`: a capture here is correct. `bad`: a capture here is a false
   * capture (blur, glare, cropped). `moving`/`absent`: no capture expected.
   */
  label: 'good' | 'bad' | 'moving' | 'absent';
}

export interface Scenario {
  id: string;
  documentType: DocumentType;
  background: 'dark' | 'texture' | 'light' | 'clutter';
  segments: Segment[];
  /** Whether a correct capture is expected at all. */
  expectCapture: boolean;
  /** Used for the jitter KPI: auto-capture off, document held still throughout. */
  stillness?: boolean;
}

const centred = (scale: number, extra: Partial<Pose> = {}): Pose => ({
  cx: 0.5,
  cy: 0.5,
  scale,
  rotation: 0,
  tilt: 0,
  ...extra,
});
const offscreen: Pose = { cx: 1.6, cy: 0.5, scale: 0.55, rotation: 10, tilt: 0 };

/** Synthetic CI suite. The real dataset follows the same format (see dataset/README.md). */
export const SCENARIOS: Scenario[] = [
  {
    id: 'still-dark',
    documentType: 'id-card',
    background: 'dark',
    stillness: true,
    expectCapture: false,
    segments: [{ duration: 8, from: centred(0.55, { rotation: 3 }), label: 'good', effects: { noise: 3 } }],
  },
  {
    id: 'enter-settle-dark',
    documentType: 'id-card',
    background: 'dark',
    expectCapture: true,
    segments: [
      { duration: 1, from: null, label: 'absent' },
      { duration: 1.5, from: offscreen, to: centred(0.55, { rotation: 4 }), label: 'moving', effects: { blur: 2 } },
      { duration: 6, from: centred(0.55, { rotation: 4 }), label: 'good', effects: { noise: 3, shake: 0.6 } },
    ],
  },
  {
    id: 'texture-tilted',
    documentType: 'id-card',
    background: 'texture',
    expectCapture: true,
    segments: [
      { duration: 1.5, from: offscreen, to: centred(0.6, { rotation: -6, tilt: 6 }), label: 'moving', effects: { blur: 2 } },
      { duration: 6, from: centred(0.6, { rotation: -6, tilt: 6 }), label: 'good', effects: { noise: 4, shake: 0.6 } },
    ],
  },
  {
    id: 'white-on-white',
    documentType: 'id-card',
    background: 'light',
    expectCapture: true,
    segments: [
      { duration: 1, from: null, label: 'absent' },
      { duration: 7, from: centred(0.55, { rotation: 2 }), label: 'good', effects: { noise: 2, shake: 0.5 } },
    ],
  },
  {
    id: 'glare-then-clear',
    documentType: 'id-card',
    background: 'dark',
    expectCapture: true,
    segments: [
      { duration: 4, from: centred(0.55), label: 'bad', effects: { glare: 0.14, noise: 3 } },
      { duration: 5, from: centred(0.55, { rotation: 3 }), label: 'good', effects: { noise: 3, shake: 0.5 } },
    ],
  },
  {
    id: 'shaky-then-still',
    documentType: 'id-card',
    background: 'texture',
    expectCapture: true,
    segments: [
      { duration: 3.5, from: centred(0.55), label: 'bad', effects: { blur: 2.6, shake: 6 } },
      { duration: 5, from: centred(0.55, { rotation: 2 }), label: 'good', effects: { noise: 3, shake: 0.5 } },
    ],
  },
  {
    id: 'far-then-close',
    documentType: 'id-card',
    background: 'dark',
    expectCapture: true,
    segments: [
      { duration: 3, from: centred(0.28), label: 'moving', effects: { noise: 3 } },
      { duration: 1.5, from: centred(0.28), to: centred(0.6), label: 'moving' },
      { duration: 5, from: centred(0.6, { rotation: -3 }), label: 'good', effects: { noise: 3, shake: 0.5 } },
    ],
  },
  {
    id: 'dim-light',
    documentType: 'id-card',
    background: 'clutter',
    expectCapture: true,
    segments: [{ duration: 8, from: centred(0.58, { rotation: 5 }), label: 'good', effects: { brightness: 0.6, noise: 5, shake: 0.5 } }],
  },
  {
    id: 'cropped',
    documentType: 'id-card',
    background: 'dark',
    expectCapture: true,
    segments: [
      { duration: 3, from: { cx: 0.25, cy: 0.5, scale: 0.6, rotation: 0, tilt: 0 }, label: 'bad', effects: { noise: 3 } },
      { duration: 5, from: centred(0.55), label: 'good', effects: { noise: 3, shake: 0.5 } },
    ],
  },
  {
    id: 'passport',
    documentType: 'passport',
    background: 'texture',
    expectCapture: true,
    segments: [
      { duration: 1.5, from: offscreen, to: centred(0.65, { rotation: 3 }), label: 'moving', effects: { blur: 2 } },
      { duration: 6, from: centred(0.65, { rotation: 3 }), label: 'good', effects: { noise: 3, shake: 0.5 } },
    ],
  },
  {
    id: 'a4',
    documentType: 'a4',
    background: 'dark',
    expectCapture: true,
    segments: [{ duration: 7, from: centred(0.5, { rotation: 2 }), label: 'good', effects: { noise: 3, shake: 0.5 } }],
  },
  {
    id: 'no-document',
    documentType: 'id-card',
    background: 'clutter',
    expectCapture: false,
    segments: [{ duration: 8, from: null, label: 'absent', effects: { noise: 4 } }],
  },
];
