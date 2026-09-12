import type { WorldEvent } from '@ninjarena/core';
import { describe, expect, it } from 'vitest';
import { routeEvents } from './eventRouter';

const cast = (playerId: string): WorldEvent => ({
  type: 'abilityCast',
  tick: 4,
  playerId,
  abilityId: 'fireball',
  slot: 1,
});

const spawn = (ownerId: string): WorldEvent => ({
  type: 'projectileSpawned',
  tick: 4,
  projectileId: 'p1',
  ownerId,
  abilityId: 'fireball',
});

const hit: WorldEvent = {
  type: 'damageDealt',
  tick: 4,
  targetId: 'other',
  sourceId: 'me',
  amount: 8,
  remainingHealth: 20,
  scaling: 'technique',
  position: { x: 5, y: 5 },
};

describe('routeEvents', () => {
  it('keeps the predicted cast and drops the server copy', () => {
    const routed = routeEvents([cast('me')], [cast('me')], 'me');
    expect(routed).toEqual([cast('me')]);
  });

  it('keeps a remote cast coming from the server', () => {
    const routed = routeEvents([], [cast('other')], 'me');
    expect(routed).toEqual([cast('other')]);
  });

  it('deduplicates by owner for entity spawns', () => {
    const routed = routeEvents([spawn('me')], [spawn('me'), spawn('other')], 'me');
    expect(routed).toEqual([spawn('me'), spawn('other')]);
  });

  it('keeps every other server event and drops the predicted ones', () => {
    const routed = routeEvents([hit], [hit], 'me');
    expect(routed).toEqual([hit]);
  });

  it('ignores a predicted event owned by someone else', () => {
    const routed = routeEvents([cast('other')], [], 'me');
    expect(routed).toEqual([]);
  });
});
