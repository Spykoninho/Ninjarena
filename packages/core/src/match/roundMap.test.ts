import { describe, expect, it } from 'vitest';
import { mapForRound } from './roundMap';

describe('mapForRound', () => {
  it('walks the list round by round and wraps around', () => {
    expect([1, 2, 3, 4].map((round) => mapForRound(['a', 'b', 'c'], round))).toEqual([
      'a',
      'b',
      'c',
      'a',
    ]);
  });

  it('uses the first map before the match starts and refuses an empty list', () => {
    expect(mapForRound(['a', 'b'], 0)).toBe('a');
    expect(() => mapForRound([], 1)).toThrow('at least one map');
  });
});
