import type { DocumentType, Quad } from '@doc-capture/core';
import type { CV } from './cv';
import type { Effects, Pose, Scenario } from './scenarios';

export const FRAME = { width: 960, height: 540 };
export const FPS = 12;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/** Synthetic document artwork: card, passport data page or A4 letter. */
export function documentArt(cv: CV, type: DocumentType, seed = 1) {
  const r = rng(seed);
  const size =
    type === 'id-card' ? { w: 856, h: 540 } : type === 'passport' ? { w: 1000, h: 704 } : { w: 630, h: 891 };
  const base = type === 'a4' ? [250, 250, 248] : type === 'passport' ? [226, 222, 205] : [230, 236, 242];
  const art = new cv.Mat(size.h, size.w, cv.CV_8UC4, new cv.Scalar(...base, 255));
  const rect = (x: number, y: number, w: number, h: number, c: number[]) =>
    cv.rectangle(art, new cv.Point(x, y), new cv.Point(x + w, y + h), new cv.Scalar(...c, 255), -1);
  const text = (x: number, y: number, maxW: number, lines: number, gap: number, h: number) => {
    for (let i = 0; i < lines; i++) rect(x, y + i * gap, Math.round(maxW * (0.5 + r() * 0.5)), h, [40, 40, 50]);
  };
  if (type === 'a4') {
    rect(60, 60, 260, 30, [30, 30, 40]);
    text(60, 140, 510, 26, 26, 9);
  } else {
    rect(0, 0, size.w, Math.round(size.h * 0.14), type === 'passport' ? [120, 30, 40] : [30, 70, 140]);
    rect(Math.round(size.w * 0.05), Math.round(size.h * 0.22), Math.round(size.w * 0.26), Math.round(size.h * 0.5), [150, 135, 120]);
    text(Math.round(size.w * 0.36), Math.round(size.h * 0.24), Math.round(size.w * 0.55), 6, Math.round(size.h * 0.075), 12);
    if (type === 'passport') {
      // Two MRZ lines.
      for (let i = 0; i < 2; i++) rect(40, size.h - 120 + i * 50, size.w - 80, 22, [35, 35, 35]);
    }
  }
  return art;
}

export function background(cv: CV, kind: Scenario['background'], seed = 1) {
  const { width: w, height: h } = FRAME;
  const r = rng(seed);
  const m = new cv.Mat(h, w, cv.CV_8UC4);
  const d = m.data as Uint8Array;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let v: [number, number, number];
      if (kind === 'dark') v = [45 + y / 40, 42 + y / 40, 40 + y / 40];
      else if (kind === 'light') v = [205 + x / 60, 203 + x / 60, 198 + x / 60];
      else if (kind === 'texture') {
        const g = 95 + 35 * Math.sin(y / 9 + Math.sin(x / 55) * 2.2) + r() * 14;
        v = [g + 35, g + 5, g - 25];
      } else v = [70, 72, 78];
      d[i] = v[0];
      d[i + 1] = v[1];
      d[i + 2] = v[2];
      d[i + 3] = 255;
    }
  }
  if (kind === 'clutter') {
    for (let k = 0; k < 14; k++) {
      const x = Math.round(r() * w);
      const y = Math.round(r() * h);
      const c = [r() * 200 + 30, r() * 200 + 30, r() * 200 + 30, 255];
      cv.rectangle(m, new cv.Point(x, y), new cv.Point(x + r() * 160 + 20, y + r() * 90 + 10), new cv.Scalar(...c), -1);
    }
  }
  return m;
}

/**
 * Corner positions of a document with this pose, from a pinhole camera with a
 * typical phone focal length. `scale` sets the distance so the long side spans
 * that share of the frame width when frontal; `tilt` is pitch in degrees.
 */
export function poseQuad(pose: Pose, type: DocumentType): Quad {
  const { width: W, height: H } = FRAME;
  const f = 0.8 * W;
  const [u0, v0] = [W / 2, H / 2];
  const [longMm, shortMm] = type === 'id-card' ? [85.6, 53.98] : type === 'passport' ? [125, 88] : [297, 210];
  const [w, h] = type === 'a4' ? [shortMm, longMm] : [longMm, shortMm];
  const z = (f * longMm) / (pose.scale * W);
  const X = ((pose.cx * W - u0) * z) / f;
  const Y = ((pose.cy * H - v0) * z) / f;
  const roll = (pose.rotation * Math.PI) / 180;
  const pitch = (pose.tilt * Math.PI) / 180;
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => {
    // Roll in the document plane, then pitch about the horizontal axis.
    const xr = x! * Math.cos(roll) - y! * Math.sin(roll);
    const yr = x! * Math.sin(roll) + y! * Math.cos(roll);
    const yp = yr * Math.cos(pitch);
    const zp = yr * Math.sin(pitch);
    const Z = z + zp;
    return { x: u0 + (f * (X + xr)) / Z, y: v0 + (f * (Y + yp)) / Z };
  }) as Quad;
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = t * t * (3 - 2 * t); // ease in-out
  return {
    cx: a.cx + (b.cx - a.cx) * k,
    cy: a.cy + (b.cy - a.cy) * k,
    scale: a.scale + (b.scale - a.scale) * k,
    rotation: a.rotation + (b.rotation - a.rotation) * k,
    tilt: a.tilt + (b.tilt - a.tilt) * k,
  };
}

/** Renders one RGBA frame. Returns the pixel data. */
export function renderFrame(
  cv: CV,
  bg: CV,
  art: CV,
  quad: Quad | null,
  fx: Effects,
  rand: () => number,
): Uint8Array {
  const scene = bg.clone();
  if (quad) {
    const q = fx.shake
      ? quad.map((p) => ({ x: p.x + (rand() - 0.5) * 2 * fx.shake!, y: p.y + (rand() - 0.5) * 2 * fx.shake! }))
      : quad;
    const src = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, art.cols, 0, art.cols, art.rows, 0, art.rows]);
    const dst = cv.matFromArray(4, 1, cv.CV_32FC2, q.flatMap((p) => [p.x, p.y]));
    const m = cv.getPerspectiveTransform(src, dst);
    cv.warpPerspective(art, scene, m, new cv.Size(scene.cols, scene.rows), cv.INTER_LINEAR, cv.BORDER_TRANSPARENT);
    [src, dst, m].forEach((x) => x.delete());
    if (fx.glare) {
      const c = q.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
      const rad = Math.hypot(q[1]!.x - q[0]!.x, q[1]!.y - q[0]!.y) * fx.glare;
      cv.circle(scene, new cv.Point(Math.round(c.x - rad * 0.4), Math.round(c.y)), Math.round(rad), new cv.Scalar(255, 255, 255, 255), -1);
    }
  }
  if (fx.blur) cv.GaussianBlur(scene, scene, new cv.Size(0, 0), fx.blur);
  if (fx.brightness !== undefined) scene.convertTo(scene, -1, fx.brightness, 0);
  const out = new Uint8Array(scene.data);
  scene.delete();
  if (fx.noise) {
    for (let i = 0; i < out.length; i++) {
      if (i % 4 !== 3) out[i] = Math.max(0, Math.min(255, out[i]! + (rand() - 0.5) * 2 * fx.noise));
    }
  }
  return out;
}

export { rng };
