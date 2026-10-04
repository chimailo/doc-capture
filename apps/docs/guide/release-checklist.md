# Release checklist

Run through this list for every minor or major release. Patch releases need only the automated checks.

## Automated (CI must be green)

- [ ] Lint, typecheck and unit tests (`pnpm lint && pnpm typecheck && pnpm test`)
- [ ] API reports unchanged, or the change is reviewed (`pnpm api:check`; `etc/*.api.md` in the PR diff)
- [ ] Bundle within 60 KB gzip (`pnpm size`)
- [ ] Custom OpenCV build within 3 MB gzip (`manifest.json` check)
- [ ] E2E: privacy, strict CSP, accessibility, soak
- [ ] Bench KPIs meet their targets with no regression against `baseline.json`
- [ ] Nightly: 5000-frame soak and the recorded-dataset bench pass

## Manual

- [ ] [Real-device protocol](./device-testing) on the device matrix, with results recorded below
- [ ] Security and privacy review of changes to loading, the worker protocol, plugins and output
- [ ] Docs updated (options, events, thresholds, troubleshooting)
- [ ] A changeset describes every user-facing change

## Results

| Device | Browser | Time to capture (ID / passport / A4) | Glare guidance | No false capture | Screen reader | Notes |
| ------ | ------- | ------------------------------------ | -------------- | ---------------- | ------------- | ----- |
|        |         |                                      |                |                  |               |       |
