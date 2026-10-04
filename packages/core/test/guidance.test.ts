import { describe, expect, it } from 'vitest';
import { AutoCapture } from '../src/capture/auto-capture';
import { resolveMessages } from '../src/guidance/messages';
import { GuidanceMachine, targetState } from '../src/guidance/state-machine';
import type { GuidanceInput } from '../src/guidance/state-machine';
import { assertPluginsAllowed } from '../src/plugins';
import type { QualityReport } from '../src/types';
import { rectQuad } from './helpers/synth';

const report = (issues: QualityReport['issues']): QualityReport => ({
  issues,
  passed: issues.length === 0,
  scores: { sharpness: 1, glare: 1, lighting: 1, distance: 1, tilt: 1, motion: 1, cropping: 1 },
});
const input = (over: Partial<GuidanceInput>): GuidanceInput => ({
  now: 0,
  started: true,
  documentVisible: true,
  quality: report([]),
  capturing: false,
  reviewing: false,
  ...over,
});

describe('targetState', () => {
  it('maps the situation to one state', () => {
    expect(targetState(input({ started: false }))).toBe('INIT');
    expect(targetState(input({ documentVisible: false }))).toBe('SEARCHING');
    expect(targetState(input({ quality: report(['MOVE_CLOSER', 'HOLD_STILL']) }))).toBe('MOVE_CLOSER');
    expect(targetState(input({}))).toBe('HOLD_STILL');
    expect(targetState(input({ capturing: true }))).toBe('CAPTURING');
    expect(targetState(input({ reviewing: true, capturing: true }))).toBe('REVIEW');
  });
});

describe('GuidanceMachine', () => {
  it('keeps each message up for the minimum time', () => {
    const g = new GuidanceMachine(800);
    expect(g.update(input({ now: 0, documentVisible: false }))).toBe('SEARCHING');
    expect(g.update(input({ now: 100, quality: report(['MOVE_CLOSER']) }))).toBeNull();
    expect(g.state).toBe('SEARCHING');
    expect(g.update(input({ now: 820, quality: report(['MOVE_CLOSER']) }))).toBe('MOVE_CLOSER');
  });

  it('switches to capturing immediately', () => {
    const g = new GuidanceMachine(800);
    g.update(input({ now: 0, documentVisible: false }));
    expect(g.update(input({ now: 10, capturing: true }))).toBe('CAPTURING');
  });

  it('does not flicker under alternating input', () => {
    const g = new GuidanceMachine(800);
    let changes = 0;
    for (let t = 0; t < 4000; t += 66) {
      const issues: QualityReport['issues'] = (t / 66) % 2 ? ['ALIGN'] : ['HOLD_STILL'];
      if (g.update(input({ now: t, quality: report(issues) }))) changes++;
    }
    expect(changes).toBeLessThanOrEqual(Math.ceil(4000 / 800) + 1);
  });
});

describe('AutoCapture', () => {
  const quad = rectQuad(0, 0, 10, 10);
  const cand = (sharpness: number, at: number) => ({
    frame: { id: sharpness, closed: false },
    quad,
    preview: { width: 100, height: 100 },
    sharpness,
    at,
  });

  it('fires after the stable window and returns the sharpest frames', () => {
    const released: number[] = [];
    const a = new AutoCapture<{ id: number; closed: boolean }>({
      stableMs: 500,
      bufferSize: 3,
      release: (f) => released.push(f.id),
    });
    expect(a.update(0, true, cand(1, 0))).toBe(false);
    expect(a.update(200, true, cand(5, 200))).toBe(false);
    expect(a.update(300, true, null)).toBe(false);
    expect(a.update(400, true, cand(3, 400))).toBe(false);
    expect(a.update(520, true, cand(2, 520))).toBe(true);
    expect(released).toEqual([1]); // buffer of 3 dropped the oldest
    expect(a.takeBest().map((c) => c.sharpness)).toEqual([5, 3, 2]);
  });

  it('resets on a failing frame and releases the buffer', () => {
    const released: number[] = [];
    const a = new AutoCapture<{ id: number; closed: boolean }>({ release: (f) => released.push(f.id) });
    a.update(0, true, cand(1, 0));
    a.update(400, false, null);
    expect(released).toEqual([1]);
    expect(a.update(600, true, cand(2, 600))).toBe(false);
    expect(a.progress(850)).toBeCloseTo(0.5);
  });
});

describe('messages', () => {
  it('resolves locales with fallback and overrides', () => {
    expect(resolveMessages('fr-CA').MOVE_CLOSER).toBe('Rapprochez-vous');
    expect(resolveMessages('xx').MOVE_CLOSER).toBe('Move closer');
    expect(resolveMessages('en', { MOVE_CLOSER: 'Closer!' }).MOVE_CLOSER).toBe('Closer!');
  });
});

describe('plugin policy', () => {
  const plugin = (runsOnDevice: boolean) => ({
    id: 'x',
    runsOnDevice,
    init: async () => {},
    recognize: async () => ({ fields: [], text: '' }),
    dispose: () => {},
  });

  it('refuses remote plugins unless allowed', () => {
    expect(() => assertPluginsAllowed([plugin(false)], false)).toThrowError(/allowRemoteProcessing/);
    expect(() => assertPluginsAllowed([plugin(false)], true)).not.toThrow();
    expect(() => assertPluginsAllowed([plugin(true)], false)).not.toThrow();
  });
});
