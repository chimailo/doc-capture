// Replays every fixture video through the SDK in headless Chromium and
// scores the KPIs. Exits non-zero if a KPI misses its target or regresses
// against baseline.json.
//
//   pnpm bench                     # all scenarios
//   pnpm bench -- white-on-white   # some scenarios
//   pnpm bench -- --update-baseline
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { events, openBench } from './browser';
import { FIXTURE_DIR } from './paths';
import { LATENCY_BUDGET_MS, TARGETS, latency, regressions, scoreRun, summarise } from './kpi';
import type { RunResult, Targets } from './kpi';
import { denseFrames } from './labels';
import type { VideoLabels } from './labels';
import { SCENARIOS } from './scenarios';
import { startPreview } from './server';
import { openCvVariant } from './server';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, '../baseline.json');
const REPORTS = join(HERE, '../reports');

type Run = RunResult & { cspViolations: string[]; workerMs: number[] };

async function runOne(dir: string, id: string, thresholds?: string): Promise<Run> {
  const labels: VideoLabels = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
  const video = join(dir, `${id}.y4m`);
  const duration = denseFrames(labels).length / labels.fps;
  const query: Record<string, string> = { type: labels.documentType, auto: labels.stillness ? '0' : '1' };
  if (thresholds) query.thresholds = thresholds;
  const session = await openBench(video, query);
  try {
    const { page } = session;
    // Wait for a capture, or one full play-through of the video plus loading time.
    const limit = Date.now() + (duration + 8) * 1000;
    while (Date.now() < limit) {
      const done = await page.evaluate(() =>
        window.__bench.events.some((e) => (e as { type: string }).type === 'capture'),
      );
      if (done) break;
      await page.waitForTimeout(200);
    }
    const ev = await events(page);
    const workerMs = await page.evaluate(() => (window.__bench as unknown as { frames: { workerMs: number[] } }).frames.workerMs);
    return { ...scoreRun(labels, ev), cspViolations: session.cspViolations, workerMs };
  } finally {
    await session.browser.close();
  }
}

function table(runs: RunResult[]) {
  const rows = runs.map(
    (r) =>
      `| ${r.id} | ${r.expectCapture ? 'yes' : 'no'} | ${r.success ? '✅' : r.expectCapture ? '❌' : '–'} | ${
        r.falseCapture ? '❌' : '–'
      } | ${r.timeToCaptureMs?.toFixed(0) ?? '–'} | ${r.captureIoU?.toFixed(3) ?? '–'} | ${r.captureLabel ?? '–'} | ${
        r.jitterRmsPx?.toFixed(2) ?? '–'
      } | ${r.errors.join(', ') || '–'} |`,
  );
  return [
    '| Scenario | Expect | Success | False | TTC ms | IoU | Label | Jitter px | Errors |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export interface BenchOptions {
  /** Directory with `<id>.y4m` + `<id>.json`; default: synthetic fixtures. */
  dir?: string;
  ids?: string[];
  /** JSON-encoded `Partial<QualityThresholds>`. */
  thresholds?: string;
  quiet?: boolean;
}

/** Runs the given videos and returns the scored report (no exit codes). */
export async function bench(o: BenchOptions = {}) {
  const dir = o.dir ?? FIXTURE_DIR;
  const ids =
    o.ids && o.ids.length
      ? o.ids
      : o.dir
        ? (JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { videos: string[] }).videos
        : SCENARIOS.map((sc) => sc.id);
  for (const id of ids) {
    if (!existsSync(join(dir, `${id}.y4m`)) || !existsSync(join(dir, `${id}.json`))) {
      throw new Error(`Missing ${id}.y4m/.json in ${dir}. Run \`pnpm --filter @doc-capture/bench fixtures\`.`);
    }
  }
  const server = await startPreview();
  const runs: Run[] = [];
  try {
    for (const id of ids) {
      const r = await runOne(dir, id, o.thresholds);
      runs.push(r);
      if (!o.quiet) {
        console.log(
          `${id.padEnd(20)} success=${r.success} false=${r.falseCapture} ttc=${r.timeToCaptureMs?.toFixed(0) ?? '-'} iou=${
            r.captureIoU?.toFixed(3) ?? '-'
          } label=${r.captureLabel ?? '-'} jitter=${r.jitterRmsPx?.toFixed(2) ?? '-'} flicker=${
            r.flickerRate?.toFixed(3) ?? '-'
          } ${r.errors.length ? 'errors=' + r.errors.join(',') : ''}`,
        );
      }
    }
  } finally {
    server.kill();
  }
  return {
    report: summarise(runs),
    runs,
    latency: latency(runs.flatMap((r) => r.workerMs)),
    csp: runs.flatMap((r) => r.cspViolations),
  };
}

function argValue(args: string[], name: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const update = args.includes('--update-baseline');
  const dataset = argValue(args, '--dataset');
  const thresholds = argValue(args, '--thresholds');
  const only = args.filter((a, i) => !a.startsWith('--') && !['--dataset', '--thresholds'].includes(args[i - 1] ?? ''));

  const { report, runs, latency: lat, csp } = await bench({ dir: dataset, ids: only, thresholds });
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(join(REPORTS, 'report.json'), JSON.stringify({ ...report, latency: lat, csp }, null, 2));
  const md = [
    '# Bench report',
    '',
    '| KPI | Value | Target | Pass |',
    '| --- | --- | --- | --- |',
    ...(Object.keys(TARGETS) as (keyof Targets)[]).map(
      (k) => `| ${k} | ${report.kpis[k].toFixed(3)} | ${TARGETS[k]} | ${report.pass[k] ? '✅' : '❌'} |`,
    ),
    `| detection p50 / p95 (ms) | ${lat.p50.toFixed(1)} / ${lat.p95.toFixed(1)} | ≤ ${LATENCY_BUDGET_MS} (p50) | ${
      lat.p50 <= LATENCY_BUDGET_MS ? '✅' : '❌'
    } |`,
    '',
    table(runs),
    '',
    csp.length ? `CSP violations:\n\n${csp.map((c) => `- ${c}`).join('\n')}` : 'No CSP violations.',
    openCvVariant() === 'custom'
      ? 'OpenCV: custom build, strict CSP.'
      : "⚠ OpenCV: stock build, CSP relaxed with 'unsafe-eval'. Strict-CSP compliance NOT verified.",
  ].join('\n');
  writeFileSync(join(REPORTS, 'report.md'), md);
  console.log('\n' + md.split('\n').slice(2, 10).join('\n'));

  if (update) {
    writeFileSync(BASELINE, JSON.stringify(report.kpis, null, 2) + '\n');
    console.log('Baseline updated.');
    return;
  }
  const failures = (Object.keys(report.pass) as (keyof Targets)[])
    .filter((k) => !report.pass[k])
    .map((k) => `${k} misses target`);
  if (lat.p50 > LATENCY_BUDGET_MS) failures.push(`detection p50 ${lat.p50.toFixed(1)} ms > ${LATENCY_BUDGET_MS} ms`);
  if (existsSync(BASELINE) && !only.length && !dataset && !thresholds) {
    failures.push(...regressions(report.kpis, JSON.parse(readFileSync(BASELINE, 'utf8'))));
  }
  if (csp.length) failures.push(`${csp.length} CSP violation(s)`);
  if (failures.length) {
    console.error('\nBench failed:\n- ' + failures.join('\n- '));
    process.exit(1);
  }
  console.log('\nBench passed.');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((e) => {
  console.error(e);
  process.exit(1);
});
}
