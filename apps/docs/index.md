---
layout: home
hero:
  name: Document Capture SDK
  tagline: Find, guide, auto-capture and straighten ID cards, passports and pages. Everything runs in the browser, and nothing is uploaded.
  actions:
    - theme: brand
      text: Quick start
      link: /guide/quick-start
    - theme: alt
      text: API reference
      link: /api/
features:
  - title: Stable live outline
    details: Contour and Hough-line detection in a Web Worker, smoothed with per-corner Kalman filters. Under 2 px of jitter when the phone is still.
  - title: Guidance and auto-capture
    details: Sharpness, glare, lighting, distance, tilt, motion and cropping checks. One clear message at a time, then capture once every check passes.
  - title: Ready-to-use output
    details: Perspective-corrected to the document's size at 300 DPI, encoded with no EXIF data, with quality scores attached.
  - title: Private by default
    details: Processing stays on the device, with no telemetry and no storage. Works under a strict CSP with only 'wasm-unsafe-eval' added.
---
