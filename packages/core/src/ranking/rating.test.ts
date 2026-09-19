import { describe, expect, it } from 'vitest';
import {
  INITIAL_RATING,
  RATING_K_FACTOR,
  expectedScore,
  meanRating,
  rankOf,
  ratingAfter,
  ratingStakes,
  settleRatings,
} from './rating';

describe('expectedScore', () => {
  it('gives even odds to equal ratings and sums to one across both sides', () => {
    expect(expectedScore(100, 100)).toBeCloseTo(0.5);
    expect(expectedScore(10, 100) + expectedScore(100, 10)).toBeCloseTo(1);
  });
});

describe('ratingAfter', () => {
  it('rewards an underdog win more than a favourite win', () => {
    const underdog = ratingAfter(10, 100, 'win') - 10;
    const favourite = ratingAfter(100, 10, 'win') - 100;
    expect(underdog).toBeGreaterThan(favourite);
    expect(favourite).toBeGreaterThan(0);
  });

  it('takes as much from the favourite as it gives to the underdog', () => {
    const gained = ratingAfter(10, 100, 'win') - 10;
    const lost = 100 - ratingAfter(100, 10, 'loss');
    expect(gained).toBe(lost);
  });

  it('moves equal players by half the K factor and never below zero', () => {
    expect(ratingAfter(100, 100, 'win')).toBe(100 + RATING_K_FACTOR / 2);
    expect(ratingAfter(100, 100, 'loss')).toBe(100 - RATING_K_FACTOR / 2);
    expect(ratingAfter(100, 100, 'draw')).toBe(100);
    expect(ratingAfter(3, 100, 'loss')).toBe(0);
  });
});

describe('ratingStakes', () => {
  it('shows a positive win and a negative loss bounded by the floor', () => {
    expect(ratingStakes(100, 100)).toEqual({ win: 15, loss: -15 });
    expect(ratingStakes(0, 100)).toEqual({ win: 23, loss: 0 });
  });
});

describe('rankOf', () => {
  it('starts in bronze and climbs through silver to gold', () => {
    expect(rankOf(0)).toBe('bronze');
    expect(rankOf(INITIAL_RATING)).toBe('bronze');
    expect(rankOf(150)).toBe('silver');
    expect(rankOf(299)).toBe('silver');
    expect(rankOf(300)).toBe('gold');
    expect(rankOf(900)).toBe('gold');
  });
});

describe('meanRating', () => {
  it('averages the ratings and has no answer for nobody', () => {
    expect(meanRating([100, 200])).toBe(150);
    expect(meanRating([])).toBeNull();
  });
});

describe('settleRatings', () => {
  it('lifts the winning team and drops the losing one against the opposing average', () => {
    const changes = settleRatings(
      [
        { id: 'a', teamId: 'team-0', rating: 100 },
        { id: 'b', teamId: 'team-0', rating: 200 },
        { id: 'c', teamId: 'team-1', rating: 100 },
        { id: 'd', teamId: 'team-1', rating: 300 },
      ],
      'team-0',
    );
    const after = Object.fromEntries(changes.map((change) => [change.id, change.after]));
    expect(after['a']).toBe(ratingAfter(100, 200, 'win'));
    expect(after['b']).toBe(ratingAfter(200, 200, 'win'));
    expect(after['c']).toBe(ratingAfter(100, 150, 'loss'));
    expect(after['d']).toBe(ratingAfter(300, 150, 'loss'));
  });

  it('treats every other player as an opponent in free-for-all', () => {
    const changes = settleRatings(
      [
        { id: 'a', teamId: 'a', rating: 100 },
        { id: 'b', teamId: 'b', rating: 100 },
        { id: 'c', teamId: 'c', rating: 100 },
      ],
      'b',
    );
    expect(changes).toEqual([
      { id: 'a', before: 100, after: 85 },
      { id: 'b', before: 100, after: 115 },
      { id: 'c', before: 100, after: 85 },
    ]);
  });

  it('changes nothing on a draw between equals and skips a player without opponent', () => {
    expect(
      settleRatings(
        [
          { id: 'a', teamId: 'team-0', rating: 100 },
          { id: 'b', teamId: 'team-1', rating: 100 },
        ],
        null,
      ),
    ).toEqual([
      { id: 'a', before: 100, after: 100 },
      { id: 'b', before: 100, after: 100 },
    ]);
    expect(settleRatings([{ id: 'a', teamId: 'team-0', rating: 100 }], 'team-0')).toEqual([]);
  });
});
