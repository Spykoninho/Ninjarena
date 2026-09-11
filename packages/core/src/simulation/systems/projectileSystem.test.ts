import { describe, expect, it } from 'vitest';
import { abilityMask, neutralInput } from '../input';
import { createTestSimulation } from '../../testing/fixtures';

const shoot = { ...neutralInput(), aim: { x: 1, y: 0 }, abilityHeld: abilityMask([3]) }; // seal: no startup
const idle = { ...neutralInput(), aim: { x: 1, y: 0 } };

describe('projectileSystem', () => {
  it('hits an enemy in its path, applies hit effects and disappears', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    sim.addPlayer({ id: 'a', teamId: 'team-0', characterId: 'ninja', position: { x: 60, y: 200 } });
    const target = sim.addPlayer({
      id: 'b',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 120, y: 200 },
    });
    sim.step({ a: shoot });
    expect(Object.keys(sim.world.projectiles)).toHaveLength(1);
    for (let i = 0; i < 20; i++) sim.step({ a: idle });
    expect(target.phase.kind).toBe('STUNNED');
    expect(target.statuses.some((s) => s.type === 'SLOWED')).toBe(true);
    expect(Object.keys(sim.world.projectiles)).toHaveLength(0);
  });

  it('is destroyed by walls', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 120, y: 100 },
    }); // wall at x = 160
    const events: string[] = [];
    sim.step({ a: shoot });
    for (let i = 0; i < 20; i++) {
      for (const e of sim.step({ a: idle }))
        if (e.type === 'projectileDestroyed') events.push(e.reason);
    }
    expect(events).toEqual(['wall']);
  });

  it('expires at the end of its lifetime', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    // Row 2 is open from x=16 to x=464: 300 units/s for 1000 ms never reaches a wall.
    sim.addPlayer({ id: 'a', teamId: 'team-0', characterId: 'ninja', position: { x: 40, y: 40 } });
    sim.step({ a: shoot });
    let reason: string | undefined;
    for (let i = 0; i < 70 && !reason; i++) {
      for (const e of sim.step({ a: idle }))
        if (e.type === 'projectileDestroyed') reason = e.reason;
    }
    expect(reason).toBe('expired');
    expect(sim.world.tick).toBeGreaterThanOrEqual(60);
  });

  it('never hits its owner', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const a = sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    sim.step({ a: shoot });
    for (let i = 0; i < 5; i++) sim.step({ a: idle });
    expect(a.phase.kind).toBe('NORMAL');
  });
});
