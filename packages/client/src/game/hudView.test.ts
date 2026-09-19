import { describe, expect, it } from 'vitest';
import { loadContent, loadMap } from '@ninjarena/content';
import { GameSimulation } from '@ninjarena/core';
import type { MatchState, PlayerState } from '@ninjarena/core';
import { duelConfig } from '../testing/matchConfig';
import { DEFAULT_BINDINGS } from '../input/bindings';
import { buildHudView } from './hudView';

const content = loadContent();
const makePlayer = (): PlayerState => {
  const sim = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: duelConfig(content),
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
      bindings: DEFAULT_BINDINGS,
      match,
      tick: 100,
      tickDurationMs: 1000 / 60,
      status: '2/2 ready',
      rttMs: 23,
      spectating: null,
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
      bindings: DEFAULT_BINDINGS,
      match,
      tick: 100,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
      spectating: null,
    });
    // Le slot 0 est l'attaque de base du personnage, le slot 1 son esquive.
    const basic = content.abilities.get(content.characters.get('ninja').basicAttackId);
    expect(view.abilities[0]?.name).toBe(basic.name);
    expect(view.abilities[0]?.cooldownMs).toBe(basic.cooldownMs);
    expect(view.abilities[0]?.chakraCost).toBe(basic.chakraCost);
    expect(view.abilities[0]?.remainingMs).toBeCloseTo(500);
    expect(view.abilities[1]?.remainingMs).toBe(0);
    expect(view.abilities[2]?.chakraCost).toBe(content.abilities.get('fireball').chakraCost);
    expect(view.abilities.map((ability) => ability.binding)).toEqual([
      'CLG',
      'ESP',
      'CLD',
      'E',
      'R',
    ]);
  });

  it('blames the chakra pool when only the cost is missing', () => {
    const player = makePlayer();
    player.chakra = 0;
    const view = buildHudView({
      localPlayer: player,
      abilities: content.abilities,
      bindings: DEFAULT_BINDINGS,
      match,
      tick: 100,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
      spectating: null,
    });
    const fireball = view.abilities.find((ability) => ability.name === 'Boule de feu');
    expect(fireball?.reason).toBe('chakra');
    expect(fireball?.available).toBe(false);
    // L'attaque de base ne coûte rien: elle reste disponible pendant que les techniques ne le sont plus.
    expect(view.abilities[0]?.reason).toBeNull();
    expect(view.abilities[0]?.available).toBe(true);
  });

  it('blames the control state first, even when the chakra is also missing', () => {
    const player = makePlayer();
    player.chakra = 0;
    player.phase = { kind: 'STUNNED', endsAt: 1000 };
    const view = buildHudView({
      localPlayer: player,
      abilities: content.abilities,
      bindings: DEFAULT_BINDINGS,
      match,
      tick: 100,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
      spectating: null,
    });
    expect(view.abilities.map((ability) => ability.reason)).toEqual([
      'control',
      'control',
      'control',
      'control',
      'control',
    ]);
    expect(view.abilities.every((ability) => ability.available === false)).toBe(true);
  });

  it('carries the portrait skin and the team code of the local player', () => {
    const player = makePlayer();
    const view = buildHudView({
      localPlayer: player,
      abilities: content.abilities,
      bindings: DEFAULT_BINDINGS,
      match,
      tick: 100,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
      spectating: null,
    });
    expect(view.teamId).toBe('team-0');
    // Les codes suivent les équipes triées du match, pas un hash: `team-0` est le premier.
    expect(view.teamCode).toBe(0);
    expect(view.skin).toBeGreaterThanOrEqual(0);
    expect(view.skin).toBeLessThan(4);
  });

  it('reports the remaining absorb of an active shield', () => {
    const player = makePlayer();
    player.statuses = [{ type: 'SHIELDED', expiresAt: 400, magnitude: 18 }];
    const view = buildHudView({
      localPlayer: player,
      abilities: content.abilities,
      bindings: DEFAULT_BINDINGS,
      match,
      tick: 100,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
      spectating: null,
    });
    expect(view.shield).toBe(18);
  });

  it('counts the round down as mm:ss and only while it runs', () => {
    const player = makePlayer();
    const base = {
      localPlayer: player,
      abilities: content.abilities,
      bindings: DEFAULT_BINDINGS,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
      spectating: null,
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
      bindings: DEFAULT_BINDINGS,
      match,
      tick: 0,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
      spectating: null,
    });
    expect(view.buildSummary).toBe('PV 2 · FOR 0 · PUI 3 · VIT 0 · CHA 0 · RÉG 0 · DÉF 0');
  });

  it('falls back to an empty waiting view before the local player exists', () => {
    const view = buildHudView({
      localPlayer: undefined,
      abilities: content.abilities,
      bindings: DEFAULT_BINDINGS,
      match: null,
      tick: 0,
      tickDurationMs: 1000 / 60,
      status: 'connecting',
      rttMs: null,
      spectating: null,
    });
    expect(view).toMatchObject({ health: 0, maxHealth: 0, matchPhase: 'WAITING', round: 0 });
    expect(view.abilities).toEqual([]);
    expect(view.scores).toEqual({});
    expect(view.roundTimer).toBeNull();
    expect(view.buildSummary).toBe('');
    expect(view.spectating).toBeNull();
    expect(view.teamId).toBeNull();
    expect(view.teamCode).toBe(0);
  });

  it('carries the spectated player name through to the view', () => {
    const player = makePlayer();
    const view = buildHudView({
      localPlayer: player,
      abilities: content.abilities,
      bindings: DEFAULT_BINDINGS,
      match,
      tick: 100,
      tickDurationMs: 1000 / 60,
      status: '',
      rttMs: null,
      spectating: 'Ally',
    });
    expect(view.spectating).toBe('Ally');
  });
});
