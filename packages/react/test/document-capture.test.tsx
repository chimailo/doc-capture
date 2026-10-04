import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@doc-capture/core';

type Handler = (p: unknown) => void;

const fake = vi.hoisted(() => {
  const state = {
    handlers: new Map<string, Set<(p: unknown) => void>>(),
    instance: null as null | Record<string, unknown>,
    options: null as null | Record<string, unknown>,
  };
  const emit = (event: string, payload: unknown) =>
    state.handlers.get(event)?.forEach((h) => h(payload));
  return { state, emit };
});

vi.mock('@doc-capture/core', async () => {
  const actual = await vi.importActual<typeof Core>('@doc-capture/core');
  return {
    ...actual,
    createDocumentCapture: (options: Record<string, unknown>) => {
      fake.state.options = options;
      const instance = {
        guidance: 'INIT',
        messages: actual.resolveMessages('en'),
        on: (event: string, h: Handler) => {
          if (!fake.state.handlers.has(event)) fake.state.handlers.set(event, new Set());
          fake.state.handlers.get(event)!.add(h);
          return () => fake.state.handlers.get(event)!.delete(h);
        },
        start: vi.fn(async () => fake.emit('status', 'running')),
        stop: vi.fn(),
        retake: vi.fn(),
        captureNow: vi.fn(async () => null),
        destroy: vi.fn(async () => {}),
      };
      fake.state.instance = instance;
      return instance;
    },
  };
});

import { DocumentCapture } from '../src';

beforeEach(() => {
  fake.state.handlers.clear();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const result = {
  image: new Blob(['x'], { type: 'image/jpeg' }),
  width: 1011,
  height: 638,
  documentType: 'id-card',
  corners: [],
  quality: {},
  captureMode: 'auto',
  timings: { startedAt: 0, capturedAt: 1 },
};

describe('<DocumentCapture>', () => {
  it('passes options to the core and starts automatically', async () => {
    render(<DocumentCapture documentType="passport" wasmUrl="/cv/" />);
    await act(async () => {});
    expect(fake.state.options).toMatchObject({ documentTypes: ['passport'], wasmUrl: '/cv/', review: true });
    expect(fake.state.instance!.start).toHaveBeenCalled();
  });

  it('shows guidance and the shutter, and captures on click', async () => {
    render(<DocumentCapture />);
    await act(async () => {});
    act(() => fake.emit('guidance', { state: 'MOVE_CLOSER', message: 'Move closer' }));
    expect(screen.getByText('Move closer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    expect(fake.state.instance!.captureNow).toHaveBeenCalled();
  });

  it('emphasises the shutter after the hint', async () => {
    render(<DocumentCapture />);
    await act(async () => {});
    const before = screen.getByRole('button', { name: 'Take photo' }).getAttribute('style');
    act(() => fake.emit('shutterHint', { afterMs: 8000 }));
    expect(screen.getByRole('button', { name: 'Take photo' }).getAttribute('style')).not.toBe(before);
  });

  it('reviews before calling onCapture; retake resumes', async () => {
    const onCapture = vi.fn();
    render(<DocumentCapture onCapture={onCapture} />);
    await act(async () => {});
    act(() => fake.emit('capture', result));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(onCapture).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Retake'));
    expect(fake.state.instance!.retake).toHaveBeenCalled();

    act(() => fake.emit('capture', result));
    fireEvent.click(screen.getByText('Use photo'));
    expect(onCapture).toHaveBeenCalledWith(result);
  });

  it('calls onCapture directly when review is off', async () => {
    const onCapture = vi.fn();
    render(<DocumentCapture review={false} onCapture={onCapture} />);
    await act(async () => {});
    act(() => fake.emit('capture', result));
    expect(onCapture).toHaveBeenCalledWith(result);
  });

  it('shows a friendly error with retry', async () => {
    const onError = vi.fn();
    render(<DocumentCapture onError={onError} />);
    await act(async () => {});
    const err = Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' });
    act(() => {
      fake.emit('error', err);
      fake.emit('status', 'stopped');
    });
    expect(screen.getByRole('alert').textContent).toMatch(/Camera access was blocked/);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('destroys the session on unmount', async () => {
    const { unmount } = render(<DocumentCapture />);
    await act(async () => {});
    unmount();
    expect(fake.state.instance!.destroy).toHaveBeenCalled();
  });
});
