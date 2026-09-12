import { describe, expect, it } from 'vitest';
import { HitStop } from './hitStop';

describe('HitStop', () => {
  it('is not frozen by default', () => {
    expect(new HitStop().advance(16)).toBe(false);
  });

  it('freezes for exactly its duration', () => {
    const stop = new HitStop();
    stop.trigger(40);
    expect(stop.advance(20)).toBe(true);
    expect(stop.advance(20)).toBe(true);
    expect(stop.advance(20)).toBe(false);
  });

  it('keeps the longest pending freeze', () => {
    const stop = new HitStop();
    stop.trigger(40);
    expect(stop.advance(30)).toBe(true);
    stop.trigger(40);
    expect(stop.advance(30)).toBe(true);
    expect(stop.advance(30)).toBe(true);
    expect(stop.advance(30)).toBe(false);
  });
});
