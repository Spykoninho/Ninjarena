import { describe, expect, it } from 'vitest';
import { upsertStatus } from '../../player/status';
import { createTestSimulation } from '../../testing/fixtures';

describe('playerStateSystem', () => {
  it('regenerates energy up to the maximum', () => {
    const sim = createTestSimulation();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    p.energy = 99.9;
    for (let i = 0; i < 60; i++) sim.step({});
    expect(p.energy).toBe(100);
  });

  it('removes statuses when they expire', () => {
    const sim = createTestSimulation();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    upsertStatus(p, { type: 'SLOWED', expiresAt: 3 });
    sim.step({});
    sim.step({});
    expect(p.statuses).toHaveLength(1);
    sim.step({});
    sim.step({});
    expect(p.statuses).toHaveLength(0);
  });
});
