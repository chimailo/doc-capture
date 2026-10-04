# Theming and i18n

## Colours and shapes

The React UI reads CSS custom properties. Set them on any ancestor:

```css
.my-capture {
  --dc-accent: #0a84ff;          /* countdown ring, shutter hint, "Use photo" */
  --dc-background: #000;
  --dc-text: #fff;
  --dc-banner-background: rgba(0, 0, 0, 0.6);
  --dc-radius: 12px;
  --dc-font: 'Inter', system-ui, sans-serif;
}
```

The outline on the camera view is drawn on a canvas. Style it with the `overlay` option:

```ts
overlay: { stroke: '#fff', strokeReady: '#0a84ff', fill: 'rgba(255,255,255,0.08)', lineWidth: 3, dimOutside: 0.35 }
```

All styles are applied through the CSSOM, so they work under `style-src 'self'`.

## Languages

English, French and Spanish are built in. `locale` accepts a tag (`fr-CA` falls back to `fr`, then to English). By default the browser language is used.

```tsx
<DocumentCapture locale="fr" />
```

Override any message:

```tsx
<DocumentCapture messages={{ SEARCHING: 'Show the front of your card', shutter: 'Capture' }} />
```

Message keys are `INIT`, `SEARCHING`, `MOVE_CLOSER`, `MOVE_BACK`, `ALIGN`, `REDUCE_GLARE`, `MORE_LIGHT`, `HOLD_STILL`, `CAPTURING`, `REVIEW`, `shutter`, `retake`, `usePhoto` and `captured`.

## Accessibility

- Guidance is announced through a polite `aria-live` region. Messages change at most every 800 ms, so screen readers are not flooded.
- Every control is a labelled `<button>` with a 44 px or larger target, reachable by keyboard.
- Phones vibrate briefly on capture. Pass `vibrate: false` to turn this off.
- The axe-core suite in `apps/bench/e2e/a11y.spec.ts` runs in CI.
