import { describe, expect, it } from 'vitest';
import { DEFAULT_SIMULATION_CONFIG, msToTicks, tickDurationMs } from './simulationConfig';

describe('simulationConfig', () => {
  it('runs at 60 ticks per second by default', () => {
    expect(tickDurationMs(DEFAULT_SIMULATION_CONFIG)).toBeCloseTo(16.6667, 3);
  });

  it('converts milliseconds to whole ticks', () => {
    expect(msToTicks(100, DEFAULT_SIMULATION_CONFIG)).toBe(6);
    expect(msToTicks(0, DEFAULT_SIMULATION_CONFIG)).toBe(0);
    expect(msToTicks(-50, DEFAULT_SIMULATION_CONFIG)).toBe(0);
  });
});
