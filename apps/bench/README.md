# @doc-capture/bench

This package replays recorded or synthetic videos through the SDK in headless Chromium, using them as a fake camera, and scores the KPIs in plan §8. CI fails when a KPI misses its target or regresses against `baseline.json`.

## Commands

```sh
pnpm --filter @doc-capture/demo build          # the bench drives the built demo (bench.html)
pnpm --filter @doc-capture/bench fixtures      # render synthetic videos (~870 MB, gitignored)
pnpm bench                                     # all synthetic scenarios → reports/report.md
pnpm bench -- white-on-white passport          # some scenarios
pnpm bench -- --dataset /data/capture-v1       # recorded dataset
pnpm bench -- --update-baseline                # accept the current KPIs as the new baseline
pnpm --filter @doc-capture/bench e2e           # Playwright: privacy, CSP, a11y, soak
SOAK_FRAMES=5000 pnpm --filter @doc-capture/bench e2e soak   # nightly soak
pnpm --filter @doc-capture/bench tune          # threshold sweep → reports/tune.json
```

## KPIs

| KPI                    | Definition                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| successRate            | Videos with a correct auto-capture within 15 s of the first document frame ÷ videos where a capture is expected                             |
| medianTimeToCaptureMs  | Median time from the first frame with a document to the capture event (the SDK's `timeToCaptureMs` metric)                                  |
| falseCaptureRate       | Auto-captures whose corner IoU with ground truth is below 0.9, or that happen while the label is not `good` (blurry, glare, cropped, moving) |
| jitterRmsPx            | RMS corner deviation from the mean on the `stillness` videos, after a 1 s settle, in video pixels                                           |
| flickerRate            | Outline show/hide toggles ÷ detections on the `stillness` videos                                                                            |
| detection p50          | Worker time per frame. Budget ≤ 35 ms on a mid-range phone. CI checks the same limit as a regression guard.                                 |

Captures are matched to labels by video time. The bench page logs when the `<video>` starts playing, and the closest labelled frames within ±0.35 s are compared.

## Synthetic scenarios

`src/scenarios.ts` defines 12 scenarios: still, enter-and-settle, a textured background with 25° pitch, white-on-white, glare then clear, shake then still, far then close, dim light, cropped, passport, A4, and no document. They are rendered with OpenCV.js through a pinhole camera model (`src/render.ts`) into limited-range Y4M, which is what Chrome's fake camera expects.

## Recorded dataset

The plan calls for 300+ real videos covering each document type, background, lighting, glare and hand shake. They are not stored in git. Put them in a directory like this:

```
capture-v1/
  manifest.json            {"videos": ["idcard-desk-001", ...]}
  idcard-desk-001.y4m
  idcard-desk-001.json     labels, see below
```

Convert phone recordings to Y4M at the bench resolution:

```sh
ffmpeg -i in.mp4 -vf "scale=960:540,fps=12" -pix_fmt yuv420p -color_range tv out.y4m
```

Label key frames. Corners are interpolated linearly between them.

```json
{
  "id": "idcard-desk-001",
  "documentType": "id-card",
  "fps": 12, "width": 960, "height": 540, "duration": 9.5,
  "expectCapture": true,
  "stillness": false,
  "keyframes": [
    { "t": 0.0, "quad": null, "label": "absent" },
    { "t": 1.2, "quad": [{"x":210,"y":120},{"x":720,"y":96},{"x":742,"y":420},{"x":205,"y":440}], "label": "moving" },
    { "t": 2.5, "quad": [...], "label": "good" }
  ]
}
```

Labels are `good` (a capture here is correct), `bad` (a capture here is a false capture: blur, glare, cropped), `moving` and `absent`. Mark segments with heavy blur or glare as `bad`, so a capture during them counts as false.
