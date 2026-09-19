import { describe, expect, it } from 'vitest';
import { isFullscreenShortcut, toggleFullscreen } from './fullscreen';

function key(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    code: 'KeyF',
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: null,
    ...overrides,
  } as KeyboardEvent;
}

describe('isFullscreenShortcut', () => {
  it('matches the bound key alone, pressed once', () => {
    expect(isFullscreenShortcut(key(), 'KeyF')).toBe(true);
    expect(isFullscreenShortcut(key({ code: 'KeyG' }), 'KeyF')).toBe(false);
    expect(isFullscreenShortcut(key({ repeat: true }), 'KeyF')).toBe(false);
    expect(isFullscreenShortcut(key({ ctrlKey: true }), 'KeyF')).toBe(false);
  });
});

describe('toggleFullscreen', () => {
  it('requests fullscreen when none is active and exits it otherwise', async () => {
    const calls: string[] = [];
    const target = {
      requestFullscreen: () => {
        calls.push('request');
        return Promise.resolve();
      },
    };
    const doc = {
      fullscreenElement: null as Element | null,
      exitFullscreen: () => {
        calls.push('exit');
        return Promise.resolve();
      },
    };
    await toggleFullscreen(doc, target);
    doc.fullscreenElement = {} as Element;
    await toggleFullscreen(doc, target);
    expect(calls).toEqual(['request', 'exit']);
  });

  it('swallows a refused request rather than breaking the key handler', async () => {
    const doc = { fullscreenElement: null, exitFullscreen: () => Promise.resolve() };
    const target = { requestFullscreen: () => Promise.reject(new Error('not allowed')) };
    await expect(toggleFullscreen(doc, target)).resolves.toBeUndefined();
  });
});
