import { describe, expect, it } from 'vitest';
import { loadContent, loadMap } from '@ninjarena/content';
import { GameSimulation } from '@ninjarena/core';
import type { MatchState, PlayerState } from '@ninjarena/core';
import { buildHudView } from './hudView';

const content = loadContent();

const makePlayer = (): PlayerState => {
  const sim = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: content.matchModes.get('duel'),
  });
  return sim.addPlayer({ id: 'me', teamId: 'team-0', characterId: 'ninja' });
};

const match: MatchState = {
  phase: 'IN_ROUND',
  phaseEndsAt: 600,
  round: 2,
  scores: { 'team-0': 1, 'team-1': 0 },
  lastRoundWinner: 'team-0',
  winner: null,
};

describe('buildHudView', () => {
  it('maps the local player, the match state and the round trip time', () => {
    const player = makePlayer();
    player.health = 60;
    player.energy = 30;
    const view = buildHudView({
      localPlayer: player,
      abilities: content.abilities,
      match,
      tick: 100,
      tickDurationMs: 1000 / 60,
      status: '2/2 ready',
      rttMs: 23,
    });
    expect(view).toMatchObject({
      health: 60,
      maxHealth: 100,
      energy: 30,
      maxEnergy: 100,
      matchPhase: 'IN_ROUND',
      round: 2,
      scores: { 'team-0': 1, 'team-1': 0 },
      status: '2/2 ready',
      rttMs: 23,
    });
  });

  it('computes the remaining cooldown from the ready tick', () => {
    const player = makePlayer();
    const slot = player.abilities[0];
    if (slot === undefined) throw new Error('the ninja has no ability');
    slot.readyAt = 130;
    const view = buildHudView({
      localPlayer: player,
      abilities: content.abilities,
      match,
      tick: 100,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
    });
    expect(view.abilities[0]?.name).toBe(content.abilities.get('shuriken').name);
    expect(view.abilities[0]?.cooldownMs).toBe(content.abilities.get('shuriken').cooldownMs);
    expect(view.abilities[0]?.remainingMs).toBeCloseTo(500);
    expect(view.abilities[1]?.remainingMs).toBe(0);
  });

  it('falls back to an empty waiting view before the local player exists', () => {
    const view = buildHudView({
      localPlayer: undefined,
      abilities: content.abilities,
      match: null,
      tick: 0,
      tickDurationMs: 1000 / 60,
      status: 'connecting',
      rttMs: null,
    });
    expect(view).toMatchObject({ health: 0, maxHealth: 0, matchPhase: 'WAITING', round: 0 });
    expect(view.abilities).toEqual([]);
    expect(view.scores).toEqual({});
  });
});
