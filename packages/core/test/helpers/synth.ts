import type { ImageDataLike } from '../../src/detection/detector';
import type { CV } from '../../src/opencv/types';
import type { Quad } from '../../src/types';

export interface SceneOptions {
  width?: number;
  height?: number;
  /** Corners of the document in the scene. */
  quad: Quad;
  /** Background grey level, or 'texture' for a busy wood-like pattern. */
  background?: number | 'texture';
  /** Card base grey level. */
  card?: number;
  /** Gaussian blur sigma applied to the whole scene. */
  blur?: number;
  /** Add a saturated blob over the card (glare) at this fraction of card width. */
  glare?: number;
  /** Multiply the whole scene by this (darkness). */
  brightness?: number;
  /** Noise std-dev. */
  noise?: number;
  seed?: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * Renders an ID-card-like image (light card, dark text lines, photo box) and
 * warps it onto a background at `quad`. Returns RGBA pixel data.
 */
export function renderScene(cv: CV, o: SceneOptions): ImageDataLike {
  const width = o.width ?? 640;
  const height = o.height ?? 480;
  const rand = rng(o.seed ?? 1);
  const cardW = 856;
  const cardH = 540;

  const card = new cv.Mat(cardH, cardW, cv.CV_8UC4, new cv.Scalar(o.card ?? 235, o.card ?? 235, (o.card ?? 235) - 5, 255));
  cv.rectangle(card, new cv.Point(40, 120), new cv.Point(260, 420), new cv.Scalar(120, 110, 100, 255), -1);
  for (let i = 0; i < 7; i++) {
    const y = 130 + i * 42;
    const w = 300 + Math.floor(rand() * 200);
    cv.rectangle(card, new cv.Point(300, y), new cv.Point(300 + w, y + 14), new cv.Scalar(40, 40, 50, 255), -1);
  }
  cv.rectangle(card, new cv.Point(40, 40), new cv.Point(500, 80), new cv.Scalar(30, 60, 120, 255), -1);

  const scene = new cv.Mat(height, width, cv.CV_8UC4);
  if (o.background === 'texture') {
    const d = scene.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = 90 + 40 * Math.sin(y / 7 + Math.sin(x / 40) * 2) + rand() * 20;
        const i = (y * width + x) * 4;
        d[i] = v + 30;
        d[i + 1] = v;
        d[i + 2] = v - 30;
        d[i + 3] = 255;
      }
    }
  } else {
    const g = o.background ?? 40;
    scene.setTo(new cv.Scalar(g, g, g, 255));
  }

  const src = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, cardW, 0, cardW, cardH, 0, cardH]);
  const dst = cv.matFromArray(4, 1, cv.CV_32FC2, o.quad.flatMap((p) => [p.x, p.y]));
  const m = cv.getPerspectiveTransform(src, dst);
  cv.warpPerspective(card, scene, m, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_TRANSPARENT);

  if (o.glare) {
    const c = o.quad.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
    const r = Math.round(Math.hypot(o.quad[1].x - o.quad[0].x, o.quad[1].y - o.quad[0].y) * o.glare);
    cv.circle(scene, new cv.Point(Math.round(c.x), Math.round(c.y)), r, new cv.Scalar(255, 255, 255, 255), -1);
  }
  if (o.blur) cv.GaussianBlur(scene, scene, new cv.Size(0, 0), o.blur);
  if (o.brightness !== undefined) scene.convertTo(scene, -1, o.brightness, 0);
  if (o.noise) {
    const d = scene.data;
    for (let i = 0; i < d.length; i++) {
      if (i % 4 !== 3) d[i] = Math.max(0, Math.min(255, d[i]! + (rand() - 0.5) * 2 * o.noise));
    }
  }

  const out = {
    data: new Uint8ClampedArray(scene.data),
    width,
    height,
  };
  [card, scene, src, dst, m].forEach((x) => x.delete());
  return out;
}

export const rectQuad = (x: number, y: number, w: number, h: number): Quad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
