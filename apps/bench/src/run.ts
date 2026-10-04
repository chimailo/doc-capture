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
import { TARGETS, regressions, scoreRun, summarise } from './kpi';
import type { RunResult, Targets } from './kpi';
import type { VideoLabels } from './labels';
import { SCENARIOS } from './scenarios';
import { startPreview } from './server';
import { openCvVariant } from './server';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, '../baseline.json');
const REPORTS = join(HERE, '../reports');

async function runOne(id: string): Promise<RunResult & { cspViolations: string[] }> {
  const labels: VideoLabels = JSON.parse(readFileSync(join(FIXTURE_DIR, `${id}.json`), 'utf8'));
  const video = join(FIXTURE_DIR, `${id}.y4m`);
  const duration = labels.frames.length / labels.fps;
  const session = await openBench(video, {
    type: labels.documentType,
    auto: labels.stillness ? '0' : '1',
  });
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
    return { ...scoreRun(labels, ev), cspViolations: session.cspViolations };
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

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const update = args.includes('--update-baseline');
  const only = args.filter((a) => !a.startsWith('--'));
  const ids = SCENARIOS.map((s) => s.id).filter((id) => !only.length || only.includes(id));
  for (const id of ids) {
    if (!existsSync(join(FIXTURE_DIR, `${id}.y4m`))) {
      console.error(`Missing fixture ${id}. Run \`pnpm --filter @doc-capture/bench fixtures\`.`);
      process.exit(1);
    }
  }

  const server = await startPreview();
  const runs: (RunResult & { cspViolations: string[] })[] = [];
  try {
    for (const id of ids) {
      const r = await runOne(id);
      runs.push(r);
      console.log(
        `${id.padEnd(20)} success=${r.success} false=${r.falseCapture} ttc=${r.timeToCaptureMs?.toFixed(0) ?? '-'} iou=${
          r.captureIoU?.toFixed(3) ?? '-'
        } label=${r.captureLabel ?? '-'} jitter=${r.jitterRmsPx?.toFixed(2) ?? '-'} flicker=${
          r.flickerRate?.toFixed(3) ?? '-'
        } ${r.errors.length ? 'errors=' + r.errors.join(',') : ''}`,
      );
    }
  } finally {
    server.kill();
  }

  const report = summarise(runs);
  const csp = runs.flatMap((r) => r.cspViolations);
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(join(REPORTS, 'report.json'), JSON.stringify({ ...report, csp }, null, 2));
  const md = [
    '# Bench report',
    '',
    '| KPI | Value | Target | Pass |',
    '| --- | --- | --- | --- |',
    ...(Object.keys(TARGETS) as (keyof Targets)[]).map(
      (k) => `| ${k} | ${report.kpis[k].toFixed(3)} | ${TARGETS[k]} | ${report.pass[k] ? '✅' : '❌'} |`,
    ),
    '',
    table(runs),
    '',
    csp.length ? `CSP violations:\n\n${csp.map((c) => `- ${c}`).join('\n')}` : 'No CSP violations.',
    openCvVariant() === 'custom'
      ? 'OpenCV: custom build, strict CSP.'
      : "⚠ OpenCV: stock build, CSP relaxed with 'unsafe-eval'. Strict-CSP compliance NOT verified.",
  ].join('\n');
  writeFileSync(join(REPORTS, 'report.md'), md);
  console.log('\n' + md.split('\n').slice(2, 9).join('\n'));

  if (update) {
    writeFileSync(BASELINE, JSON.stringify(report.kpis, null, 2) + '\n');
    console.log('Baseline updated.');
    return;
  }
  const failures = (Object.keys(report.pass) as (keyof Targets)[]).filter((k) => !report.pass[k]).map((k) => `${k} misses target`);
  if (existsSync(BASELINE) && !only.length) {
    failures.push(...regressions(report.kpis, JSON.parse(readFileSync(BASELINE, 'utf8'))));
  }
  if (csp.length) failures.push(`${csp.length} CSP violation(s)`);
  if (failures.length) {
    console.error('\nBench failed:\n- ' + failures.join('\n- '));
    process.exit(1);
  }
  console.log('\nBench passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
