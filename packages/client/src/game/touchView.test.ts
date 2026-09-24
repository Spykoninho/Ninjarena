import { describe, expect, it } from 'vitest';
import { loadContent, loadMap } from '@ninjarena/content';
import { GameSimulation } from '@ninjarena/core';
import type { PlayerState } from '@ninjarena/core';
import type { InterpolatedWorld } from '../netcode/snapshotInterpolator';
import { duelConfig } from '../testing/matchConfig';
import { touchSlots, visibleEnemies } from './touchView';

const content = loadContent();

const makeSim = (): GameSimulation =>
  new GameSimulation({
    maps: [loadMap(content, 'arena')],
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: duelConfig(content),
    rules: content.statRules,
  });

const addPlayer = (sim: GameSimulation, id: string, teamId: string, x: number): PlayerState =>
  sim.addPlayer({
    id,
    teamId,
    characterId: 'ninja',
    techniqueIds: ['fireball', 'smoke-veil', 'earth-wall'],
    position: { x, y: 100 },
  });

const remotesOf = (players: PlayerState[]): InterpolatedWorld => ({
  tick: 0,
  players: Object.fromEntries(
    players.map((player) => [player.id, { ...player, renderPosition: { ...player.position } }]),
  ),
  projectiles: {},
  pending: {},
  obstacles: {},
});

describe('touchSlots', () => {
  it('gives every slot of the loadout its aim shape and its startup', () => {
    const me = addPlayer(makeSim(), 'me', 'team-0', 100);
    const slots = touchSlots(me, content.abilities);
    expect(slots).toHaveLength(5);
    expect(slots[2]).toEqual({
      shape: expect.objectContaining({ kind: 'line', offensive: true }),
      startupMs: content.abilities.get('fireball').startupMs,
    });
    expect(slots[3]?.shape).toEqual({ kind: 'self' });
    expect(touchSlots(undefined, content.abilities)).toEqual([]);
  });
});

describe('visibleEnemies', () => {
  it('keeps the living, visible players of the other teams', () => {
    const sim = makeSim();
    const me = addPlayer(sim, 'me', 'team-0', 100);
    const ally = addPlayer(sim, 'ally', 'team-0', 120);
    const foe = addPlayer(sim, 'foe', 'team-1', 200);
    const dead = addPlayer(sim, 'dead', 'team-1', 220);
    dead.phase = { kind: 'DEAD', diedAt: 0 };
    const hidden = addPlayer(sim, 'hidden', 'team-1', 240);
    hidden.statuses = [{ type: 'INVISIBLE', expiresAt: 100 }];
    const enemies = visibleEnemies(me, remotesOf([me, ally, foe, dead, hidden]));
    expect(enemies).toEqual([{ x: 200, y: 100 }]);
  });

  it('knows no enemy before the first snapshot or without a local player', () => {
    const me = addPlayer(makeSim(), 'me', 'team-0', 100);
    expect(visibleEnemies(me, null)).toEqual([]);
    expect(visibleEnemies(undefined, remotesOf([me]))).toEqual([]);
  });
});
