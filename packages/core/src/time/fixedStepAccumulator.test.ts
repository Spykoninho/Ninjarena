import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator } from './fixedStepAccumulator';

const STEP = 1000 / 60;

describe('FixedStepAccumulator', () => {
  it('produces exactly 60 steps per second regardless of frame rate', () => {
    for (const fps of [60, 120, 144, 240]) {
      const accumulator = new FixedStepAccumulator(STEP);
      const frameMs = 1000 / fps;
      let steps = 0;
      for (let i = 0; i < fps; i++) steps += accumulator.advance(frameMs);
      expect(steps).toBe(60);
    }
  });

  it('exposes the interpolation alpha of the partial step', () => {
    const accumulator = new FixedStepAccumulator(STEP);
    expect(accumulator.advance(STEP / 2)).toBe(0);
    expect(accumulator.alpha).toBeCloseTo(0.5);
  });

  it('caps the number of steps after a long stall', () => {
    const accumulator = new FixedStepAccumulator(STEP, 5);
    expect(accumulator.advance(2000)).toBe(5);
    expect(accumulator.alpha).toBe(0);
  });

  it('ignores negative or non-finite elapsed time', () => {
    const accumulator = new FixedStepAccumulator(STEP);
    expect(accumulator.advance(-10)).toBe(0);
    expect(accumulator.advance(Number.NaN)).toBe(0);
  });
});
