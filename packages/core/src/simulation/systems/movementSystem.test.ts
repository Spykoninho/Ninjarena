import { describe, expect, it } from 'vitest';
import { upsertStatus } from '../../player/status';
import { neutralInput } from '../input';
import { createTestSimulation } from '../../testing/fixtures';

const moveRight = () => ({ ...neutralInput(), move: { x: 1, y: 0 } });

describe('movementSystem', () => {
  it('moves at moveSpeed units per second regardless of how steps are grouped', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 40, y: 40 },
    });
    for (let i = 0; i < 60; i++) sim.step({ p1: moveRight() });
    expect(p.position.x).toBeCloseTo(40 + 140, 3);
  });

  it('normalizes diagonal movement', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    sim.step({ p1: { ...neutralInput(), move: { x: 1, y: 1 } } });
    const moved = Math.hypot(p.position.x - 200, p.position.y - 200);
    expect(moved).toBeCloseTo(140 / 60, 3);
  });

  it('is stopped by a wall and slides along it', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    // wall column 10 → x in [160, 176); rows 3-8 → y in [48, 144)
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 150, y: 100 },
    });
    for (let i = 0; i < 30; i++) sim.step({ p1: { ...neutralInput(), move: { x: 1, y: 0.5 } } });
    expect(p.position.x).toBeCloseTo(160 - 5, 3);
    expect(p.position.y).toBeGreaterThan(100);
  });

  it('is slowed by water', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    // water rows 10-12, columns 3-6 → x in [48, 112), y in [160, 208)
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 60, y: 184 },
    });
    sim.step({ p1: moveRight() });
    expect(p.position.x - 60).toBeCloseTo((140 * 0.5) / 60, 3);
  });

  it('does not move while ROOTED, STUNNED or DEAD', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    // Un coéquipier vivant garde la manche ouverte quand p1 meurt: aucune équipe n'est éliminée.
    sim.addPlayer({
      id: 'p2',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 400, y: 200 },
    });
    upsertStatus(p, { type: 'ROOTED', expiresAt: 1000 });
    sim.step({ p1: moveRight() });
    expect(p.position.x).toBe(200);
    p.statuses = [];
    p.phase = { kind: 'STUNNED', endsAt: 1000 };
    sim.step({ p1: moveRight() });
    expect(p.position.x).toBe(200);
    p.phase = { kind: 'DEAD', diedAt: 0 };
    sim.step({ p1: moveRight() });
    expect(p.position.x).toBe(200);
    expect(sim.world.match.phase).toBe('IN_ROUND');
  });

  it('keeps players from overlapping each other', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const a = sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    const b = sim.addPlayer({
      id: 'b',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 206, y: 200 },
    });
    sim.step({});
    expect(Math.abs(b.position.x - a.position.x)).toBeGreaterThanOrEqual(10 - 1e-6);
  });
});
