import { describe, expect, it } from 'vitest';
import { mergeSolidTiles } from './tileMerge';

describe('mergeSolidTiles', () => {
  it('merges a horizontal run into one rectangle', () => {
    const solid = [false, true, true, true, false];
    expect(mergeSolidTiles(solid, 5, 1, 16)).toEqual([
      { type: 'rect', x: 16, y: 0, width: 48, height: 16 },
    ]);
  });

  it('merges identical runs on consecutive rows vertically', () => {
    const solid = [true, true, false, true, true, false, false, false, false];
    expect(mergeSolidTiles(solid, 3, 3, 16)).toEqual([
      { type: 'rect', x: 0, y: 0, width: 32, height: 32 },
    ]);
  });

  it('keeps runs of different extent separate', () => {
    const solid = [true, true, true, true, true, false];
    const rects = mergeSolidTiles(solid, 3, 2, 16);
    expect(rects).toHaveLength(2);
  });
});
