import { describe, expect, it } from 'vitest';
import { cardinalMask, isDecorFloor, isDecorObject, toriiSpan } from './decorArt';

// Les recettes de canevas ne sont pas testées: l'environnement node n'a pas de contexte 2D.
describe('decor placement', () => {
  it('names the tiles the placer owns and leaves the rest to the base renderer', () => {
    for (const name of ['lantern', 'rock', 'fence', 'well', 'crate', 'torii'])
      expect(isDecorObject(name)).toBe(true);
    for (const name of ['wall', 'tree', 'building', 'bush'])
      expect(isDecorObject(name)).toBe(false);
    expect(isDecorFloor('path')).toBe(true);
    expect(isDecorFloor('flowers')).toBe(true);
    expect(isDecorFloor('paving')).toBe(false);
  });

  it('reads fence neighbours as north, east, south then west', () => {
    expect(cardinalMask(() => false, 4, 4)).toBe(0);
    expect(cardinalMask(() => true, 4, 4)).toBe(15);
    expect(cardinalMask((x, y) => x === 4 && y === 3, 4, 4)).toBe(1);
    expect(cardinalMask((x, y) => x === 5 && y === 4, 4, 4)).toBe(2);
    expect(cardinalMask((x, y) => x === 4 && y === 5, 4, 4)).toBe(4);
    expect(cardinalMask((x, y) => x === 3 && y === 4, 4, 4)).toBe(8);
  });

  it('pairs a torii run two tiles at a time and leaves the odd one as a lone pillar', () => {
    const run = (length: number) => (x: number, y: number) => y === 0 && x >= 0 && x < length;
    expect([0].map((x) => toriiSpan(run(1), x, 0))).toEqual([1]);
    expect([0, 1].map((x) => toriiSpan(run(2), x, 0))).toEqual([2, 0]);
    expect([0, 1, 2].map((x) => toriiSpan(run(3), x, 0))).toEqual([2, 0, 1]);
    expect([0, 1, 2, 3].map((x) => toriiSpan(run(4), x, 0))).toEqual([2, 0, 2, 0]);
  });

  it('keeps two gates on the same row independent when a gap separates them', () => {
    const cells = new Set(['2:5', '3:5', '6:5', '7:5']);
    const isTorii = (x: number, y: number) => cells.has(`${x}:${y}`);
    expect([2, 3, 6, 7].map((x) => toriiSpan(isTorii, x, 5))).toEqual([2, 0, 2, 0]);
  });
});
