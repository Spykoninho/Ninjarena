import { describe, expect, it } from 'vitest';
import { createTestSimulation } from '../../testing/fixtures';
import { abilityMask, neutralInput } from '../input';

const press = (slot: number) => ({ ...neutralInput(), abilityHeld: abilityMask([slot]) });
const aimLeft = { ...neutralInput(), aim: { x: -1, y: 0 } };

describe('obstacleSystem', () => {
  it('a wall blocks projectiles and movement and expires', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const a = sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
      techniqueIds: ['wall', 'shuriken', 'blink'],
    });
    const b = sim.addPlayer({
      id: 'b',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 300, y: 200 },
      techniqueIds: ['shuriken', 'seal', 'blink'],
    });
    const spawned = sim.step({ a: { ...press(2), aim: { x: 1, y: 0 } } }); // mur en x 224, y 176..224
    expect(Object.values(sim.world.obstacles)).toHaveLength(1);
    expect(spawned).toContainEqual(
      expect.objectContaining({ type: 'obstacleSpawned', ownerId: 'a' }),
    );

    sim.step({ b: { ...press(2), aim: { x: -1, y: 0 } } }); // b tire sur a
    const flight = [];
    for (let i = 0; i < 30; i++) flight.push(...sim.step({ b: aimLeft }));
    expect(flight).toContainEqual(expect.objectContaining({ type: 'projectileSpawned' }));
    expect(flight).toContainEqual(
      expect.objectContaining({ type: 'projectileDestroyed', reason: 'wall' }),
    );
    expect(a.health).toBe(100); // le mur a intercepté le shuriken
    expect(b.health).toBe(100);
    expect(Object.keys(sim.world.projectiles)).toHaveLength(0);

    for (let i = 0; i < 20; i++) sim.step({ a: { ...neutralInput(), move: { x: 1, y: 0 } } });
    expect(a.position.x).toBeLessThan(224 - 4 - 5 + 0.5); // arrêté par la face proche du mur

    const removal = [];
    for (let i = 0; i < 60; i++) removal.push(...sim.step({}));
    expect(Object.keys(sim.world.obstacles)).toHaveLength(0); // durée de vie 1000 ms
    expect(removal).toContainEqual(expect.objectContaining({ type: 'obstacleRemoved' }));
  });
});
