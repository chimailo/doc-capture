# Document Capture SDK

On-device document and ID capture for the web. It finds an ID card, passport or A4 page in the camera feed, guides the user, captures automatically once the frame is good, and returns a straightened image. Everything runs in the browser, in a Web Worker using OpenCV compiled to WebAssembly.

```tsx
import { DocumentCapture } from '@doc-capture/react';

<DocumentCapture documentType="id-card" wasmUrl="/opencv/" onCapture={(r) => upload(r.image)} />;
```

## Packages

| Package                                                | What it is                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| [`@doc-capture/core`](packages/core)                   | Camera, worker, detection, quality checks, guidance, output. No framework. |
| [`@doc-capture/react`](packages/react)                 | `<DocumentCapture/>` and `useDocumentCapture()`                     |
| [`@doc-capture/ocr-types`](packages/ocr-types)         | OCR plugin interface (types only)                                   |
| [`@doc-capture/opencv-build`](packages/opencv-build)   | Custom OpenCV.js build (core + imgproc, SIMD and non-SIMD)          |
| [`apps/demo`](apps/demo)                               | React + Vite host app with a sample MRZ OCR plugin                   |
| [`apps/bench`](apps/bench)                             | KPI bench and Playwright e2e suite (fake camera from Y4M videos)    |
| [`apps/docs`](apps/docs)                               | VitePress docs site + TypeDoc API reference                          |

## Development

Requires Node 22 and pnpm 10. Building OpenCV also needs Docker.

```sh
pnpm install
pnpm build:opencv            # custom OpenCV build in Docker (or build:opencv:stock for a quick dev copy)
pnpm build                   # libraries
pnpm test                    # unit tests (Vitest; OpenCV.js runs in Node)
pnpm --filter @doc-capture/demo dev          # demo at http://localhost:5173
pnpm --filter @doc-capture/demo dev:https    # same, over HTTPS on your LAN, for phones
```

Browser checks need a built demo:

```sh
pnpm --filter @doc-capture/demo build
pnpm --filter @doc-capture/bench fixtures    # synthetic camera videos (~870 MB)
pnpm --filter @doc-capture/bench e2e         # privacy, strict CSP, a11y, memory soak
pnpm bench                                   # KPIs → apps/bench/reports/report.md
```

Before opening a PR, run `pnpm lint`, `pnpm typecheck`, `pnpm api` (commit any `etc/*.api.md` changes), `pnpm size`, and `pnpm changeset` for user-facing changes.

## Current results (synthetic suite, stock OpenCV build)

| KPI                      | Target  | Result  |
| ------------------------ | ------- | ------- |
| Capture success          | ≥ 95%   | 100%    |
| Median time to capture   | ≤ 4 s   | 1.5 s   |
| False captures           | ≤ 2%    | 0%      |
| Outline jitter (still)   | < 2 px  | 0.43 px |
| Outline flicker          | < 1%    | 0%      |
| Detection p50 per frame  | ≤ 35 ms | 8.6 ms  |
| JS bundle (gzip)         | ≤ 60 KB | 12.2 KB |

These are measured on synthetic videos on a development machine. Before release, the KPIs must be confirmed on the recorded dataset and on real devices (see `apps/docs/guide/release-checklist.md`).

See the [docs](apps/docs/guide/quick-start.md) for usage, [CSP and self-hosting](apps/docs/guide/csp.md) and [privacy](apps/docs/guide/privacy.md).
