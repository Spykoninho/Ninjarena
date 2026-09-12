import { describe, expect, it } from 'vitest';
import { CorrectionSmoother } from './correctionSmoother';

describe('CorrectionSmoother', () => {
  it('decays a small correction to zero over its duration', () => {
    const smoother = new CorrectionSmoother();
    smoother.absorb({ x: 4, y: -2 });
    expect(smoother.offset).toEqual({ x: 4, y: -2 });
    expect(smoother.advance(50)).toEqual({ x: 2, y: -1 });
    expect(smoother.advance(50)).toEqual({ x: 0, y: 0 });
    expect(smoother.advance(16)).toEqual({ x: 0, y: 0 });
  });

  it('ignores a correction at or beyond the threshold', () => {
    const smoother = new CorrectionSmoother();
    smoother.absorb({ x: 24, y: 0 });
    expect(smoother.offset).toEqual({ x: 0, y: 0 });
    smoother.absorb({ x: 20, y: 20 });
    expect(smoother.offset).toEqual({ x: 0, y: 0 });
  });

  it('adds a new correction to the offset still in flight', () => {
    const smoother = new CorrectionSmoother();
    smoother.absorb({ x: 4, y: 0 });
    smoother.advance(50);
    smoother.absorb({ x: 1, y: 0 });
    expect(smoother.offset).toEqual({ x: 3, y: 0 });
    expect(smoother.advance(100)).toEqual({ x: 0, y: 0 });
  });

  it('honours a custom threshold and duration', () => {
    const smoother = new CorrectionSmoother(2, 200);
    smoother.absorb({ x: 3, y: 0 });
    expect(smoother.offset).toEqual({ x: 0, y: 0 });
    smoother.absorb({ x: 1, y: 0 });
    expect(smoother.advance(100)).toEqual({ x: 0.5, y: 0 });
    expect(smoother.advance(100)).toEqual({ x: 0, y: 0 });
  });
});
