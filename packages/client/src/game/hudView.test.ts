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
    rules: content.statRules,
  });
  return sim.addPlayer({
    id: 'me',
    teamId: 'team-0',
    characterId: 'ninja',
    techniqueIds: ['fireball', 'seismic-slam', 'earth-wall'],
  });
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
    player.chakra = 30;
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
      chakra: 30,
      maxChakra: 100,
      shield: 0,
      matchPhase: 'IN_ROUND',
      round: 2,
      scores: { 'team-0': 1, 'team-1': 0 },
      status: '2/2 ready',
      rttMs: 23,
    });
    expect(view.abilities).toHaveLength(5);
  });

  it('computes the remaining cooldown and the chakra cost of every slot', () => {
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
    // Le slot 0 est l'attaque de base du personnage, le slot 1 son esquive.
    const basic = content.abilities.get(content.characters.get('ninja').basicAttackId);
    expect(view.abilities[0]?.name).toBe(basic.name);
    expect(view.abilities[0]?.cooldownMs).toBe(basic.cooldownMs);
    expect(view.abilities[0]?.chakraCost).toBe(basic.chakraCost);
    expect(view.abilities[0]?.remainingMs).toBeCloseTo(500);
    expect(view.abilities[1]?.remainingMs).toBe(0);
    expect(view.abilities[2]?.chakraCost).toBe(content.abilities.get('fireball').chakraCost);
  });

  it('reports the remaining absorb of an active shield', () => {
    const player = makePlayer();
    player.statuses = [{ type: 'SHIELDED', expiresAt: 400, magnitude: 18 }];
    const view = buildHudView({
      localPlayer: player,
      abilities: content.abilities,
      match,
      tick: 100,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
    });
    expect(view.shield).toBe(18);
  });

  it('counts the round down as mm:ss and only while it runs', () => {
    const player = makePlayer();
    const base = {
      localPlayer: player,
      abilities: content.abilities,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
    };
    expect(buildHudView({ ...base, match, tick: 100 }).roundTimer).toBe('00:09');
    expect(
      buildHudView({ ...base, match: { ...match, phaseEndsAt: 6000 }, tick: 600 }).roundTimer,
    ).toBe('01:30');
    expect(buildHudView({ ...base, match, tick: 900 }).roundTimer).toBe('00:00');
    expect(
      buildHudView({ ...base, match: { ...match, phase: 'ROUND_END' }, tick: 100 }).roundTimer,
    ).toBeNull();
  });

  it('summarises the build on a single line', () => {
    const player = makePlayer();
    player.build = { ...player.build, vitality: 2, power: 3 };
    const view = buildHudView({
      localPlayer: player,
      abilities: content.abilities,
      match,
      tick: 0,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
    });
    expect(view.buildSummary).toBe('VIT 2 · STR 0 · POW 3 · SPD 0 · CHK 0 · REG 0 · DEF 0');
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
    expect(view.roundTimer).toBeNull();
    expect(view.buildSummary).toBe('');
  });
});
