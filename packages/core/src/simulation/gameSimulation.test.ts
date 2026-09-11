import { describe, expect, it } from 'vitest';
import type { GameSimulation } from './gameSimulation';
import type { PlayerInputs } from './input';
import { abilityMask } from './input';
import { createTestSimulation } from '../testing/fixtures';

const inputsAt = (tick: number): PlayerInputs => ({
  p1: {
    move: { x: Math.sin(tick / 9), y: Math.cos(tick / 7) },
    aim: { x: 1, y: 0 },
    abilityHeld: tick % 20 < 2 ? abilityMask([0]) : 0,
  },
  p2: {
    move: { x: -Math.cos(tick / 5), y: Math.sin(tick / 11) },
    aim: { x: -1, y: 0 },
    abilityHeld: tick % 15 < 2 ? abilityMask([1, 3]) : 0,
  },
});

const duelOf = (): GameSimulation => {
  const sim = createTestSimulation();
  sim.startMatch();
  sim.addPlayer({ id: 'p1', teamId: 'team-0', characterId: 'ninja', position: { x: 80, y: 120 } });
  sim.addPlayer({ id: 'p2', teamId: 'team-1', characterId: 'ninja', position: { x: 140, y: 120 } });
  return sim;
};

describe('GameSimulation', () => {
  it('advances the tick once per step', () => {
    const sim = createTestSimulation();
    sim.step({});
    sim.step({});
    expect(sim.world.tick).toBe(2);
  });

  it('reaches the same world from the same inputs', () => {
    const one = duelOf();
    const other = duelOf();
    for (let tick = 0; tick < 120; tick++) {
      one.step(inputsAt(tick));
      other.step(inputsAt(tick));
    }
    expect(one.world.tick).toBe(120);
    expect(one.snapshot()).toEqual(other.snapshot());
  });

  it('snapshot and restore round-trip the world without sharing references', () => {
    const sim = createTestSimulation();
    sim.addPlayer({ id: 'p1', teamId: 'team-0', characterId: 'ninja', position: { x: 40, y: 40 } });
    const snapshot = sim.snapshot();
    sim.world.players['p1']!.position.x = 999;
    expect(snapshot.players['p1']!.position.x).toBe(40);
    sim.restore(snapshot);
    expect(sim.world.players['p1']!.position.x).toBe(40);
    expect(sim.world).not.toBe(snapshot);
  });
});
