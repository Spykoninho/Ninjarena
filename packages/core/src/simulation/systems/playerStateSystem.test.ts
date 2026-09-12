import { describe, expect, it } from 'vitest';
import { upsertStatus } from '../../player/status';
import { createTestSimulation } from '../../testing/fixtures';

describe('playerStateSystem', () => {
  it('regenerates chakra up to the maximum', () => {
    const sim = createTestSimulation();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    p.chakra = 99.9;
    for (let i = 0; i < 60; i++) sim.step({});
    expect(p.chakra).toBe(100);
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

  it('announces a shield that runs out on its timer', () => {
    const sim = createTestSimulation();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    upsertStatus(p, { type: 'SHIELDED', expiresAt: 1, magnitude: 40 });
    upsertStatus(p, { type: 'SLOWED', expiresAt: 1 });
    expect(sim.step({})).not.toContainEqual(
      expect.objectContaining({ type: 'shieldBroken', playerId: 'p1' }),
    );
    const expiry = sim.step({});
    expect(expiry).toContainEqual({ type: 'shieldBroken', tick: 1, playerId: 'p1' });
    expect(expiry.filter((event) => event.type === 'shieldBroken')).toHaveLength(1);
  });
});
