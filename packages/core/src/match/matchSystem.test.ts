import { describe, expect, it } from 'vitest';
import { createTestSimulation, contextOf } from '../testing/fixtures';
import { applyDamage } from '../combat/damage';
import { neutralInput } from '../simulation/input';
import { pickTeamForNewPlayer } from './teams';

const duelWith = (overrides = {}) => createTestSimulation({ matchConfig: overrides });

describe('match rules', () => {
  it('freezes gameplay until the match starts', () => {
    const sim = duelWith();
    const p = sim.addPlayer({ id: 'a', teamId: 'team-0', characterId: 'ninja' });
    sim.step({ a: { ...neutralInput(), move: { x: 1, y: 0 } } });
    expect(p.velocity).toEqual({ x: 0, y: 0 });
    sim.startMatch();
    sim.step({ a: { ...neutralInput(), move: { x: 1, y: 0 } } });
    expect(p.velocity.x).toBeGreaterThan(0);
  });

  it('ends the round when one team remains and scores it', () => {
    const sim = duelWith();
    sim.addPlayer({ id: 'a', teamId: 'team-0', characterId: 'ninja' });
    const b = sim.addPlayer({ id: 'b', teamId: 'team-1', characterId: 'ninja' });
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
    sim.addPlayer({ id: 'a', teamId: 'team-0', characterId: 'ninja' });
    const b = sim.addPlayer({ id: 'b', teamId: 'team-1', characterId: 'ninja' });
    sim.startMatch();
    sim.step({});
    applyDamage(contextOf(sim), b, 999, 'a');
    sim.step({}); // round ends
    sim.step({}); // next round starts
    expect(sim.world.match.round).toBe(2);
    expect(sim.world.match.phase).toBe('IN_ROUND');
    expect(b.health).toBe(100);
    expect(b.phase.kind).toBe('NORMAL');
  });

  it('ends the match when a team reaches roundsToWin', () => {
    const sim = duelWith({ roundsToWin: 1 });
    sim.addPlayer({ id: 'a', teamId: 'team-0', characterId: 'ninja' });
    const b = sim.addPlayer({ id: 'b', teamId: 'team-1', characterId: 'ninja' });
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
    sim.addPlayer({ id: 'a', teamId: 'team-0', characterId: 'ninja' });
    sim.addPlayer({ id: 'b', teamId: 'team-1', characterId: 'ninja' });
    sim.startMatch();
    const all = [];
    for (let i = 0; i < 10; i++) all.push(...sim.step({}));
    expect(all).toContainEqual(expect.objectContaining({ type: 'roundEnded', winnerTeamId: null }));
  });

  it('treats free-for-all as one team per player', () => {
    const sim = createTestSimulation({
      matchConfig: { id: 'ffa-3', mode: 'ffa', teamCount: 3, playersPerTeam: 1 },
    });
    sim.addPlayer({ id: 'a', teamId: 'a', characterId: 'ninja' });
    const b = sim.addPlayer({ id: 'b', teamId: 'b', characterId: 'ninja' });
    const c = sim.addPlayer({ id: 'c', teamId: 'c', characterId: 'ninja' });
    sim.startMatch();
    sim.step({});
    applyDamage(contextOf(sim), b, 999, 'a');
    expect(sim.step({}).some((e) => e.type === 'roundEnded')).toBe(false);
    applyDamage(contextOf(sim), c, 999, 'a');
    expect(sim.step({})).toContainEqual(
      expect.objectContaining({ type: 'roundEnded', winnerTeamId: 'a' }),
    );
  });

  it('fills the least populated team and gives ties to the lowest index', () => {
    const sim = createTestSimulation({ matchConfig: { teamCount: 2, playersPerTeam: 2 } });
    expect(pickTeamForNewPlayer(sim.matchConfig, sim.world, 'a')).toBe('team-0');
    sim.addPlayer({ id: 'a', teamId: 'team-0', characterId: 'ninja' });
    expect(pickTeamForNewPlayer(sim.matchConfig, sim.world, 'b')).toBe('team-1');
    sim.addPlayer({ id: 'b', teamId: 'team-1', characterId: 'ninja' });
    expect(pickTeamForNewPlayer(sim.matchConfig, sim.world, 'c')).toBe('team-0');

    const ffa = createTestSimulation({ matchConfig: { mode: 'ffa', playersPerTeam: 1 } });
    expect(pickTeamForNewPlayer(ffa.matchConfig, ffa.world, 'solo')).toBe('solo');
  });

  it('spawns players on the points their format reserves for them', () => {
    const sim = createTestSimulation({ matchConfig: { teamCount: 2, playersPerTeam: 2 } });
    const a = sim.addPlayer({ id: 'a', teamId: 'team-0', characterId: 'ninja' });
    const b = sim.addPlayer({ id: 'b', teamId: 'team-1', characterId: 'ninja' });
    const mate = sim.addPlayer({ id: 'mate', teamId: 'team-0', characterId: 'ninja' });
    expect(a.position).toEqual({ x: 48, y: 120 });
    expect(b.position).toEqual({ x: 432, y: 120 });
    expect(mate.position).toEqual({ x: 48, y: 120 }); // une seule base par équipe: on y revient

    const ffa = createTestSimulation({ matchConfig: { mode: 'ffa', playersPerTeam: 1 } });
    const x = ffa.addPlayer({ id: 'x', teamId: 'x', characterId: 'ninja' });
    const y = ffa.addPlayer({ id: 'y', teamId: 'y', characterId: 'ninja' });
    expect(x.position).toEqual({ x: 240, y: 40 });
    expect(y.position).toEqual({ x: 240, y: 200 });
  });
});
