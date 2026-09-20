import { describe, expect, it } from 'vitest';
import type { MapDocument } from '@ninjarena/core';
import { drawRoundMaps } from './roomMap';

const docs = (...ids: string[]): MapDocument[] => ids.map((id) => ({ id }) as MapDocument);

describe('drawRoundMaps', () => {
  it('never plays the same map twice in a row when it has a choice', () => {
    const pool = docs('a', 'b', 'c');
    const drawn = drawRoundMaps(pool, 7, () => 0);
    expect(drawn.map((map) => map.id)).toEqual(['a', 'b', 'a', 'b', 'a', 'b', 'a']);
  });

  it('repeats the only map when the pool holds one, and draws nothing from an empty pool', () => {
    expect(drawRoundMaps(docs('solo'), 3, () => 0).map((map) => map.id)).toEqual([
      'solo',
      'solo',
      'solo',
    ]);
    expect(drawRoundMaps([], 3, () => 0)).toEqual([]);
  });
});
