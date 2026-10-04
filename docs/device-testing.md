# Real-device testing

The bench and e2e suites run in headless Chromium with a fake camera. Real phones need separate testing because of camera stacks, autofocus, `ImageCapture` support, WASM compile time and thermal throttling. Those tests run on BrowserStack (or physical devices) against a deployed build of `apps/demo`.

## Device matrix (to confirm with the team)

| Platform | Browser         | Devices                                                         |
| -------- | --------------- | --------------------------------------------------------------- |
| Android  | Chrome 100+     | Pixel 7, Samsung Galaxy A51 (2020 mid-range floor), Galaxy S23  |
| iOS      | Safari 15, 16.3 | iPhone 8 (iOS 15), iPhone 11 (iOS 16.3, no worker OffscreenCanvas) |
| iOS      | Safari 17+      | iPhone 13, iPhone 15                                            |
| Desktop  | Chrome, Edge, Firefox, Safari (current) | Built-in or USB webcam                  |

## Automated smoke test (BrowserStack Automate)

`apps/bench/browserstack.yml` runs `e2e/device-smoke.spec.ts` on the matrix. It opens `bench.html` and checks that OpenCV loads within 3 s, frames are processed and the worker's p50 is within budget. Camera image injection on BrowserStack can only show a static image, so this test checks loading and throughput, not KPIs.

```sh
export BROWSERSTACK_USERNAME=… BROWSERSTACK_ACCESS_KEY=…
DEMO_URL=https://capture-demo.example.com pnpm --filter @doc-capture/bench exec browserstack-node-sdk playwright test e2e/device-smoke.spec.ts
```

## Manual protocol (per device, about 10 minutes)

Use a real ID-1 card, a passport and an A4 page, with a dark table, a light table and a patterned surface.

1. Open the demo, allow the camera, and capture each document on each surface. Record the time from opening the camera to capture (the demo shows it).
2. Hold a laminated card under a ceiling light. The SDK must say "Tilt slightly to reduce glare" and must not capture while the glare covers text.
3. Cover the lens partially or move the card quickly. There should be no capture.
4. Wait 8 s without a document. The shutter button must become highlighted.
5. Deny camera permission. The friendly error and the "Try again" button must appear.
6. Turn on VoiceOver or TalkBack. Guidance must be announced, and the shutter must be reachable and labelled.
7. Capture 20 times in a row, then check the browser's memory panel (Safari Web Inspector, `chrome://inspect`) for growth.

Record the results in the release checklist (`docs/release-checklist.md`).
