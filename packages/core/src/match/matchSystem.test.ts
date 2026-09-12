import { describe, expect, it } from 'vitest';
import { addTestPlayer, createTestSimulation, contextOf } from '../testing/fixtures';
import { applyDamage } from '../combat/damage';
import { abilityMask, neutralInput } from '../simulation/input';
import { pickTeamForNewPlayer } from './teams';

const duelWith = (overrides = {}) => createTestSimulation({ matchConfig: overrides });
const moveRight = () => ({ ...neutralInput(), move: { x: 1, y: 0 } });

describe('match rules', () => {
  it('freezes gameplay until the match starts', () => {
    const sim = duelWith();
    const p = addTestPlayer(sim, { id: 'a', teamId: 'team-0', characterId: 'ninja' });
    sim.step({ a: { ...neutralInput(), move: { x: 1, y: 0 } } });
    expect(p.velocity).toEqual({ x: 0, y: 0 });
    sim.startMatch();
    sim.step({ a: { ...neutralInput(), move: { x: 1, y: 0 } } });
    expect(p.velocity.x).toBeGreaterThan(0);
  });

  it('ends the round when one team remains and scores it', () => {
    const sim = duelWith();
    addTestPlayer(sim, { id: 'a', teamId: 'team-0', characterId: 'ninja' });
    const b = addTestPlayer(sim, { id: 'b', teamId: 'team-1', characterId: 'ninja' });
    sim.startMatch();
    sim.step({});
    applyDamage(contextOf(sim), b, 999, 'a');
    const events = sim.step({});
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'roundEnded', winnerTeamId: 'team-0' }),
    );
    expect(sim.world.match.scores['team-0']).toBe(1);
  });

  it('respawns everyone for the next round', () => {
    const sim = duelWith({ roundsToWin: 2, roundEndDelayMs: 0, countdownMs: 0 });
    addTestPlayer(sim, { id: 'a', teamId: 'team-0', characterId: 'ninja' });
    const b = addTestPlayer(sim, { id: 'b', teamId: 'team-1', characterId: 'ninja' });
    sim.startMatch();
    sim.step({});
    applyDamage(contextOf(sim), b, 999, 'a');
    sim.step({}); // fin de la manche
    sim.step({}); // début de la manche suivante
    expect(sim.world.match.round).toBe(2);
    expect(sim.world.match.phase).toBe('IN_ROUND');
    expect(b.health).toBe(100);
    expect(b.phase.kind).toBe('NORMAL');
  });

  it('ends the match when a team reaches roundsToWin', () => {
    const sim = duelWith({ roundsToWin: 1 });
    addTestPlayer(sim, { id: 'a', teamId: 'team-0', characterId: 'ninja' });
    const b = addTestPlayer(sim, { id: 'b', teamId: 'team-1', characterId: 'ninja' });
    sim.startMatch();
    sim.step({});
    applyDamage(contextOf(sim), b, 999, 'a');
    const events = sim.step({});
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'matchEnded', winnerTeamId: 'team-0' }),
    );
    expect(sim.world.match.phase).toBe('MATCH_END');
  });

  it('declares a draw when the round timer expires', () => {
    const sim = duelWith({ roundDurationMs: 100 });
    addTestPlayer(sim, { id: 'a', teamId: 'team-0', characterId: 'ninja' });
    addTestPlayer(sim, { id: 'b', teamId: 'team-1', characterId: 'ninja' });
    sim.startMatch();
    const all = [];
    for (let i = 0; i < 10; i++) all.push(...sim.step({}));
    expect(all).toContainEqual(expect.objectContaining({ type: 'roundEnded', winnerTeamId: null }));
  });

  it('treats free-for-all as one team per player', () => {
    const sim = createTestSimulation({
      matchConfig: { id: 'ffa-3', mode: 'ffa', teamCount: 3, playersPerTeam: 1 },
    });
    addTestPlayer(sim, { id: 'a', teamId: 'a', characterId: 'ninja' });
    const b = addTestPlayer(sim, { id: 'b', teamId: 'b', characterId: 'ninja' });
    const c = addTestPlayer(sim, { id: 'c', teamId: 'c', characterId: 'ninja' });
    sim.startMatch();
    sim.step({});
    applyDamage(contextOf(sim), b, 999, 'a');
    expect(sim.step({}).some((e) => e.type === 'roundEnded')).toBe(false);
    applyDamage(contextOf(sim), c, 999, 'a');
    expect(sim.step({})).toContainEqual(
      expect.objectContaining({ type: 'roundEnded', winnerTeamId: 'a' }),
    );
  });

  it('holds the countdown and the round-end delay when they are not instant', () => {
    const sim = duelWith({ countdownMs: 500, roundEndDelayMs: 500 }); // 30 ticks chacun
    const a = addTestPlayer(sim, { id: 'a', teamId: 'team-0', characterId: 'ninja' });
    const b = addTestPlayer(sim, { id: 'b', teamId: 'team-1', characterId: 'ninja' });
    sim.startMatch();
    expect(sim.world.match.phase).toBe('COUNTDOWN');

    // Ticks 0 à 29: le compte à rebours gèle le gameplay.
    for (let i = 0; i < 30; i++) {
      sim.step({ a: moveRight() });
      expect(sim.world.match.phase).toBe('COUNTDOWN');
    }
    expect(a.velocity).toEqual({ x: 0, y: 0 });
    expect(a.position).toEqual({ x: 56, y: 120 });

    // Tick 30: la manche 1 s'ouvre et le gameplay reprend.
    expect(sim.step({})).toContainEqual(
      expect.objectContaining({ type: 'roundStarted', round: 1 }),
    );
    expect(sim.world.match.phase).toBe('IN_ROUND');
    sim.step({ a: moveRight() });
    expect(a.velocity.x).toBeGreaterThan(0);

    sim.step({ a: { ...neutralInput(), abilityHeld: abilityMask([3]) } });
    expect(Object.keys(sim.world.projectiles)).toHaveLength(1);
    applyDamage(contextOf(sim), b, 999, 'a');
    const ended = sim.step({});
    expect(ended).toContainEqual(
      expect.objectContaining({ type: 'roundEnded', winnerTeamId: 'team-0' }),
    );
    expect(ended).toContainEqual(
      expect.objectContaining({ type: 'projectileDestroyed', reason: 'expired' }),
    );
    expect(sim.world.projectiles).toEqual({});
    expect(sim.world.match.phase).toBe('ROUND_END');

    // 30 ticks de délai de fin de manche, gameplay gelé.
    const held = a.position.x;
    for (let i = 0; i < 29; i++) {
      sim.step({ a: moveRight() });
      expect(sim.world.match.phase).toBe('ROUND_END');
    }
    expect(a.position.x).toBe(held);
    sim.step({});
    expect(sim.world.match.phase).toBe('COUNTDOWN');
    expect(sim.world.match.round).toBe(2);
    expect(b.health).toBe(100);
    expect(b.phase.kind).toBe('NORMAL');

    // 30 ticks de compte à rebours avant la manche 2.
    for (let i = 0; i < 29; i++) {
      sim.step({});
      expect(sim.world.match.phase).toBe('COUNTDOWN');
    }
    const round2 = sim.step({});
    expect(sim.world.match.phase).toBe('IN_ROUND');
    expect(round2.filter((e) => e.type === 'roundStarted')).toEqual([
      expect.objectContaining({ round: 2 }),
    ]);
  });

  it('clears pending zones and walls when the round ends', () => {
    const sim = duelWith();
    sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      techniqueIds: ['quake', 'wall', 'blink'],
    });
    const b = addTestPlayer(sim, { id: 'b', teamId: 'team-1', characterId: 'ninja' });
    sim.startMatch();
    sim.step({ a: { ...neutralInput(), abilityHeld: abilityMask([2]) } });
    sim.step({ a: { ...neutralInput(), abilityHeld: abilityMask([3]) } });
    expect(Object.keys(sim.world.pending)).toHaveLength(1);
    expect(Object.keys(sim.world.obstacles)).toHaveLength(1);

    applyDamage(contextOf(sim), b, 999, 'a');
    const events = sim.step({});
    expect(events).toContainEqual(expect.objectContaining({ type: 'roundEnded' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'obstacleRemoved' }));
    expect(events.some((e) => e.type === 'zoneTriggered')).toBe(false);
    expect(sim.world.pending).toEqual({});
    expect(sim.world.obstacles).toEqual({});
  });

  it('fills the least populated team and gives ties to the lowest index', () => {
    const sim = createTestSimulation({ matchConfig: { teamCount: 2, playersPerTeam: 2 } });
    expect(pickTeamForNewPlayer(sim.matchConfig, sim.world, 'a')).toBe('team-0');
    addTestPlayer(sim, { id: 'a', teamId: 'team-0', characterId: 'ninja' });
    expect(pickTeamForNewPlayer(sim.matchConfig, sim.world, 'b')).toBe('team-1');
    addTestPlayer(sim, { id: 'b', teamId: 'team-1', characterId: 'ninja' });
    expect(pickTeamForNewPlayer(sim.matchConfig, sim.world, 'c')).toBe('team-0');

    const ffa = createTestSimulation({ matchConfig: { mode: 'ffa', playersPerTeam: 1 } });
    expect(pickTeamForNewPlayer(ffa.matchConfig, ffa.world, 'solo')).toBe('solo');
  });

  it('spawns players on the points their format reserves for them', () => {
    const sim = createTestSimulation({ matchConfig: { teamCount: 2, playersPerTeam: 2 } });
    const a = addTestPlayer(sim, { id: 'a', teamId: 'team-0', characterId: 'ninja' });
    const b = addTestPlayer(sim, { id: 'b', teamId: 'team-1', characterId: 'ninja' });
    const mate = addTestPlayer(sim, { id: 'mate', teamId: 'team-0', characterId: 'ninja' });
    expect(a.position).toEqual({ x: 56, y: 120 });
    expect(b.position).toEqual({ x: 440, y: 120 });
    expect(mate.position).toEqual({ x: 56, y: 120 }); // une seule base par équipe: on y revient

    const ffa = createTestSimulation({ matchConfig: { mode: 'ffa', playersPerTeam: 1 } });
    const x = addTestPlayer(ffa, { id: 'x', teamId: 'x', characterId: 'ninja' });
    const y = addTestPlayer(ffa, { id: 'y', teamId: 'y', characterId: 'ninja' });
    expect(x.position).toEqual({ x: 248, y: 40 });
    expect(y.position).toEqual({ x: 248, y: 200 });
  });
});
