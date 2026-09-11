import { describe, expect, it } from 'vitest';
import { cueForEvent } from './eventCues';

describe('cueForEvent', () => {
  it('maps a death to its cue', () => {
    expect(cueForEvent({ type: 'playerDied', tick: 12, playerId: 'a', killerId: 'b' })).toBe(
      'death',
    );
  });

  it('ignores events without a cue', () => {
    expect(cueForEvent({ type: 'phaseChanged', tick: 3, playerId: 'a', phase: 'NORMAL' })).toBe(
      null,
    );
  });
});
