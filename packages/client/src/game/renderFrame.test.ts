import { describe, expect, it } from 'vitest';
import { loadContent, loadMap } from '@ninjarena/content';
import { GameSimulation } from '@ninjarena/core';
import type { PlayerState } from '@ninjarena/core';
import type { InterpolatedWorld } from '../netcode/snapshotInterpolator';
import { buildRenderFrame } from './renderFrame';

const content = loadContent();

const makePlayers = (): { me: PlayerState; other: PlayerState } => {
  const sim = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: content.matchModes.get('duel'),
    rules: content.statRules,
  });
  const me = sim.addPlayer({ id: 'me', teamId: 'team-0', characterId: 'ninja' });
  const other = sim.addPlayer({ id: 'other', teamId: 'team-1', characterId: 'ninja' });
  return { me, other };
};

const remotesOf = (other: PlayerState): InterpolatedWorld => ({
  players: { other: { ...other, renderPosition: { x: 50, y: 60 } } },
  projectiles: {
    p1: {
      id: 'p1',
      ownerId: 'other',
      teamId: 'team-1',
      position: { x: 0, y: 0 },
      velocity: { x: 1, y: 0 },
      radius: 3,
      expiresAt: 10,
      source: { abilityId: 'shuriken', effectIndex: 0 },
      renderPosition: { x: 12, y: 34 },
    },
  },
});

describe('buildRenderFrame', () => {
  it('draws the local player at its interpolated position and centres the camera on it', () => {
    const { me } = makePlayers();
    const frame = buildRenderFrame({
      localPlayerId: 'me',
      localPlayer: me,
      localPosition: { x: 10, y: 20 },
      remotes: null,
      isFfa: false,
    });
    expect(frame.camera).toEqual({ x: 10, y: 20 });
    expect(frame.players).toHaveLength(1);
    expect(frame.players[0]).toMatchObject({ id: 'me', isLocal: true, position: { x: 10, y: 20 } });
  });

  it('takes remote players and projectiles from the interpolated world', () => {
    const { me, other } = makePlayers();
    const frame = buildRenderFrame({
      localPlayerId: 'me',
      localPlayer: me,
      localPosition: { x: 10, y: 20 },
      remotes: remotesOf(other),
      isFfa: false,
    });
    const remote = frame.players.find((player) => !player.isLocal);
    expect(remote).toMatchObject({ id: 'other', position: { x: 50, y: 60 }, visible: true });
    expect(frame.projectiles).toEqual([{ id: 'p1', position: { x: 12, y: 34 }, radius: 3 }]);
  });

  it('ignores the local player found in the interpolated world', () => {
    const { me } = makePlayers();
    const frame = buildRenderFrame({
      localPlayerId: 'me',
      localPlayer: me,
      localPosition: { x: 10, y: 20 },
      remotes: { players: { me: { ...me, renderPosition: { x: 99, y: 99 } } }, projectiles: {} },
      isFfa: false,
    });
    expect(frame.players).toHaveLength(1);
    expect(frame.players[0]?.position).toEqual({ x: 10, y: 20 });
  });

  it('hides a remote player made invisible to the local one', () => {
    const { me, other } = makePlayers();
    const hidden = { ...other, statuses: [{ type: 'INVISIBLE' as const, expiresAt: 100 }] };
    const frame = buildRenderFrame({
      localPlayerId: 'me',
      localPlayer: me,
      localPosition: { x: 0, y: 0 },
      remotes: {
        players: { other: { ...hidden, renderPosition: { x: 5, y: 5 } } },
        projectiles: {},
      },
      isFfa: false,
    });
    expect(frame.players.find((player) => !player.isLocal)?.visible).toBe(false);
  });
});
