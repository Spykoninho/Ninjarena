import { describe, expect, it } from 'vitest';
import { loadContent, loadMap } from '@ninjarena/content';
import { GameSimulation } from '@ninjarena/core';
import type { WorldState } from '@ninjarena/core';
import { nextSpectateTarget, spectatorCandidates } from './spectator';

const content = loadContent();

const makeWorld = (
  matchModeId: string,
  players: ReadonlyArray<{ id: string; teamId: string }>,
): WorldState => {
  const sim = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: content.matchModes.get(matchModeId),
    rules: content.statRules,
  });
  for (const player of players) {
    sim.addPlayer({ id: player.id, teamId: player.teamId, characterId: 'ninja' });
  }
  return sim.world;
};

const kill = (world: WorldState, id: string): void => {
  const player = world.players[id];
  if (player === undefined) throw new Error(`missing player ${id}`);
  player.phase = { kind: 'DEAD', diedAt: 0 };
};

describe('spectatorCandidates', () => {
  it('only lists living teammates in team mode', () => {
    const world = makeWorld('2v2', [
      { id: 'me', teamId: 'team-0' },
      { id: 'ally', teamId: 'team-0' },
      { id: 'enemy1', teamId: 'team-1' },
      { id: 'enemy2', teamId: 'team-1' },
    ]);
    kill(world, 'me');
    expect(spectatorCandidates(world, 'me', false)).toEqual(['ally']);
  });

  it('excludes dead teammates', () => {
    const world = makeWorld('2v2', [
      { id: 'me', teamId: 'team-0' },
      { id: 'ally', teamId: 'team-0' },
      { id: 'enemy1', teamId: 'team-1' },
    ]);
    kill(world, 'me');
    kill(world, 'ally');
    expect(spectatorCandidates(world, 'me', false)).toEqual([]);
  });

  it('lists every living player in free-for-all', () => {
    const world = makeWorld('ffa-4', [
      { id: 'me', teamId: 'team-0' },
      { id: 'p1', teamId: 'team-1' },
      { id: 'p2', teamId: 'team-2' },
      { id: 'p3', teamId: 'team-3' },
    ]);
    kill(world, 'me');
    kill(world, 'p2');
    expect(spectatorCandidates(world, 'me', true)).toEqual(['p1', 'p3']);
  });

  it('returns nothing when no candidate is left', () => {
    const world = makeWorld('2v2', [{ id: 'me', teamId: 'team-0' }]);
    kill(world, 'me');
    expect(spectatorCandidates(world, 'me', false)).toEqual([]);
  });
});

describe('nextSpectateTarget', () => {
  it('returns null when there are no candidates', () => {
    expect(nextSpectateTarget([], null, false)).toBeNull();
    expect(nextSpectateTarget([], 'a', true)).toBeNull();
  });

  it('picks the first candidate when there is no current target', () => {
    expect(nextSpectateTarget(['a', 'b'], null, false)).toBe('a');
  });

  it('keeps the current target when not cycling', () => {
    expect(nextSpectateTarget(['a', 'b'], 'b', false)).toBe('b');
  });

  it('advances to the next candidate when cycling', () => {
    expect(nextSpectateTarget(['a', 'b', 'c'], 'a', true)).toBe('b');
  });

  it('wraps around when cycling past the last candidate', () => {
    expect(nextSpectateTarget(['a', 'b', 'c'], 'c', true)).toBe('a');
  });

  it('replaces a dead or departed current target with the first candidate', () => {
    expect(nextSpectateTarget(['a', 'b'], 'gone', false)).toBe('a');
    expect(nextSpectateTarget(['a', 'b'], 'gone', true)).toBe('a');
  });
});
