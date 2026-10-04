import { describe, expect, it } from 'vitest';
import { MatScope, liveMatCount, withScope } from '../src/opencv/mat-scope';

const fake = () => {
  let deleted = false;
  return { delete: () => void (deleted = true), isDeleted: () => deleted };
};

describe('MatScope', () => {
  it('deletes every tracked object when the scope ends', () => {
    const a = fake();
    const b = fake();
    withScope((s) => {
      s.track(a);
      s.track(b);
      expect(liveMatCount()).toBe(2);
    });
    expect(a.isDeleted()).toBe(true);
    expect(b.isDeleted()).toBe(true);
    expect(liveMatCount()).toBe(0);
  });

  it('deletes on exceptions too', () => {
    const a = fake();
    expect(() =>
      withScope((s) => {
        s.track(a);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(a.isDeleted()).toBe(true);
    expect(liveMatCount()).toBe(0);
  });

  it('released objects outlive the scope', () => {
    const a = fake();
    const s = new MatScope();
    s.track(a);
    s.release(a);
    s.dispose();
    expect(a.isDeleted()).toBe(false);
    expect(liveMatCount()).toBe(0);
  });
});
