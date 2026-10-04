# Quality thresholds

Each frame gets seven scores. Auto-capture waits until every check passes continuously for `stableMs` (500 ms by default). The defaults come from tuning against the bench suite. Change them only with bench data to back the change (`pnpm --filter @doc-capture/bench tune`).

| Threshold          | Default | Check                                                                                 | Guidance when failing |
| ------------------ | ------- | ------------------------------------------------------------------------------------- | --------------------- |
| `minSharpness`     | 0.8     | Laplacian variance ÷ intensity variance on the straightened document                  | Hold still            |
| `maxGlareFraction` | 0.015   | Share of saturated pixels (≥ 250) on the document; skipped for near-white pages       | Tilt to reduce glare  |
| `maxGlareBlob`     | 0.008   | Largest saturated patch, as a share of the document                                    | Tilt to reduce glare  |
| `minBrightness`    | 70      | Mean brightness of the document                                                       | Find better light     |
| `minContrast`      | 22      | Standard deviation of the document's brightness                                        | Find better light     |
| `minFill`          | 0.25    | Document area ÷ frame area                                                             | Move closer           |
| `maxFill`          | 0.88    | Document area ÷ frame area                                                             | Move back             |
| `maxTiltDegrees`   | 12      | Largest corner deviation from 90°                                                      | Align                 |
| `maxFrameDiff`     | 7       | Mean absolute difference from the previous frame                                       | Hold still            |
| `maxCornerShift`   | 0.012   | Corner movement per detection, as a share of the frame diagonal                        | Hold still            |
| `minEdgeMargin`    | 0.015   | Distance of the closest corner to the frame edge, as a share of the short side         | Move back / Align     |

When several checks fail, the message shown is the first in this order: more light, move closer, move back, align, reduce glare, hold still.

```ts
createDocumentCapture({ thresholds: { minFill: 0.3, maxTiltDegrees: 8 } });
```

## Full-resolution re-check

When auto-capture fires, the SDK takes a full-resolution frame. It uses `ImageCapture.takePhoto()` when available, otherwise the sharpest of the last 8 good frames. It detects the document again and requires an IoU of at least 0.85 with the live outline. Then it checks sharpness, glare and cropping again. If a check fails, the capture is dropped silently and guidance continues. Manual captures skip these checks.
