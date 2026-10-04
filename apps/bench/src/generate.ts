// Generates the synthetic fixture videos and their labels:
//   pnpm --filter @doc-capture/bench fixtures [scenario-id ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCv } from './cv';
import { FIXTURE_DIR } from './paths';
import type { VideoLabels } from './labels';
import { FPS, FRAME, background, documentArt, lerpPose, poseQuad, renderFrame, rng } from './render';
import { SCENARIOS } from './scenarios';
import { Y4mWriter } from './y4m';


async function main() {
  const only = process.argv.slice(2);
  const cv = await loadCv();
  mkdirSync(FIXTURE_DIR, { recursive: true });

  for (const sc of SCENARIOS.filter((s) => !only.length || only.includes(s.id))) {
    const t0 = Date.now();
    const bg = background(cv, sc.background, sc.id.length);
    const art = documentArt(cv, sc.documentType, 7);
    const rand = rng(42);
    const writer = new Y4mWriter(join(FIXTURE_DIR, `${sc.id}.y4m`), FRAME.width, FRAME.height, FPS);
    const frames: NonNullable<VideoLabels['frames']> = [];
    const labels: VideoLabels = {
      id: sc.id,
      documentType: sc.documentType,
      fps: FPS,
      width: FRAME.width,
      height: FRAME.height,
      expectCapture: sc.expectCapture,
      stillness: sc.stillness ?? false,
      frames,
    };
    let t = 0;
    for (const seg of sc.segments) {
      const n = Math.round(seg.duration * FPS);
      for (let i = 0; i < n; i++) {
        const pose = seg.from && (seg.to ? lerpPose(seg.from, seg.to, n > 1 ? i / (n - 1) : 1) : seg.from);
        const quad = pose ? poseQuad(pose, sc.documentType) : null;
        writer.write(renderFrame(cv, bg, art, quad, seg.effects ?? {}, rand));
        const inFrame =
          quad && quad.every((p) => p.x >= 0 && p.y >= 0 && p.x < FRAME.width && p.y < FRAME.height);
        frames.push({ t, quad: inFrame ? quad : null, label: seg.label });
        t += 1 / FPS;
      }
    }
    writer.close();
    bg.delete();
    art.delete();
    writeFileSync(join(FIXTURE_DIR, `${sc.id}.json`), JSON.stringify(labels));
    console.log(`${sc.id.padEnd(20)} ${frames.length} frames  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
