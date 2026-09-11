import { describe, expect, it } from 'vitest';
import { ServerClock } from './serverClock';

describe('ServerClock', () => {
  it('seeds the estimate exactly on the first observation', () => {
    const clock = new ServerClock(50);
    expect(clock.hasEstimate).toBe(false);
    expect(clock.estimateTick(1000)).toBe(0);
    clock.observe(100, 1000);
    expect(clock.hasEstimate).toBe(true);
    expect(clock.estimateTick(1000)).toBeCloseTo(100);
  });

  it('moves a tenth of the way toward a later observation', () => {
    const clock = new ServerClock(50);
    clock.observe(100, 1000);
    // À 1050 l'extrapolation vaut 101, corrigée de 10% de l'écart avec le tick observé.
    clock.observe(110, 1050);
    expect(clock.estimateTick(1050)).toBeCloseTo(101.9);
  });

  it('extrapolates with the tick duration', () => {
    const clock = new ServerClock(50);
    clock.observe(100, 1000);
    expect(clock.estimateTick(1125)).toBeCloseTo(102.5);
  });

  it('refuses a tick duration it cannot extrapolate with', () => {
    expect(() => new ServerClock(0)).toThrow();
    expect(() => new ServerClock(Number.NaN)).toThrow();
  });
});
