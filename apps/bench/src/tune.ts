// Sweeps quality thresholds over the bench videos and ranks the settings.
//   pnpm --filter @doc-capture/bench tune                  # synthetic fixtures
//   pnpm --filter @doc-capture/bench tune -- --dataset DIR # recorded dataset
// Edit GRID to choose what to sweep. Each setting is a full bench run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QualityThresholds } from '@doc-capture/core';
import { DEFAULT_THRESHOLDS } from '@doc-capture/core';
import type { TARGETS } from './kpi';
import { bench } from './run';

const GRID: Partial<Record<keyof QualityThresholds, number[]>> = {
  minSharpness: [0.6, 0.8, 1.0],
  maxFrameDiff: [5, 7, 9],
};

function* combinations(grid: typeof GRID): Generator<Partial<QualityThresholds>> {
  const keys = Object.keys(grid) as (keyof QualityThresholds)[];
  const walk = function* (i: number, acc: Partial<QualityThresholds>): Generator<Partial<QualityThresholds>> {
    if (i === keys.length) return yield { ...acc };
    for (const v of grid[keys[i]!]!) yield* walk(i + 1, { ...acc, [keys[i]!]: v });
  };
  yield* walk(0, {});
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const i = args.indexOf('--dataset');
  const dir = i >= 0 ? args[i + 1] : undefined;
  const rows: { setting: Partial<QualityThresholds>; score: number; kpis: typeof TARGETS }[] = [];
  for (const setting of combinations(GRID)) {
    const { report } = await bench({ dir, thresholds: JSON.stringify(setting), quiet: true });
    const k = report.kpis;
    // False captures are the costliest failure, then misses, then slowness.
    const score =
      k.successRate - 5 * k.falseCaptureRate - 0.05 * (k.medianTimeToCaptureMs / 1000 || 99);
    rows.push({ setting, score, kpis: k });
    console.log(JSON.stringify(setting), JSON.stringify(k));
  }
  rows.sort((a, b) => b.score - a.score);
  mkdirSync(join(import.meta.dirname, '../reports'), { recursive: true });
  writeFileSync(join(import.meta.dirname, '../reports/tune.json'), JSON.stringify(rows, null, 2));
  console.log('\nBest:', JSON.stringify({ ...DEFAULT_THRESHOLDS, ...rows[0]!.setting }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
