import { describe, expect, it } from 'vitest';
import type { WorldEvent } from '@ninjarena/core';
import { MatchStats } from './matchStats';

const at = { x: 0, y: 0 };

function damage(sourceId: string | null, targetId: string, amount: number): WorldEvent {
  return {
    type: 'damageDealt',
    tick: 1,
    targetId,
    sourceId,
    amount,
    remainingHealth: 10,
    scaling: 'none',
    position: at,
  };
}

describe('MatchStats', () => {
  it('credits damage to its source and debits its target, across several batches', () => {
    const stats = new MatchStats();
    stats.record([damage('a', 'b', 12.5), damage('b', 'a', 4)]);
    stats.record([damage('a', 'b', 7.5)]);
    expect(stats.statsOf('a')).toMatchObject({ damageDealt: 20, damageTaken: 4 });
    expect(stats.statsOf('b')).toMatchObject({ damageDealt: 4, damageTaken: 20 });
  });

  it('counts a kill for the killer and a death for the victim, but neither for a self-kill', () => {
    const stats = new MatchStats();
    stats.record([
      { type: 'playerDied', tick: 1, playerId: 'b', killerId: 'a' },
      { type: 'playerDied', tick: 2, playerId: 'a', killerId: 'a' },
      { type: 'playerDied', tick: 3, playerId: 'a', killerId: null },
    ]);
    expect(stats.statsOf('a')).toEqual({ damageDealt: 0, damageTaken: 0, kills: 1, deaths: 2 });
    expect(stats.statsOf('b')).toEqual({ damageDealt: 0, damageTaken: 0, kills: 0, deaths: 1 });
  });

  it('ignores self-inflicted and environmental damage as damage dealt', () => {
    const stats = new MatchStats();
    stats.record([damage('a', 'a', 5), damage(null, 'a', 3)]);
    expect(stats.statsOf('a')).toMatchObject({ damageDealt: 0, damageTaken: 8 });
    expect(stats.statsOf('nobody')).toEqual({
      damageDealt: 0,
      damageTaken: 0,
      kills: 0,
      deaths: 0,
    });
  });
});
