import { describe, expect, it } from 'vitest';
import { createTestSimulation } from '../testing/fixtures';

describe('GameSimulation', () => {
  it('advances the tick once per step', () => {
    const sim = createTestSimulation();
    sim.step({});
    sim.step({});
    expect(sim.world.tick).toBe(2);
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
