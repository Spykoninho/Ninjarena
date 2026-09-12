import { describe, expect, it } from 'vitest';
import { createTestSimulation } from '../../testing/fixtures';
import { abilityMask, neutralInput } from '../input';

const press = (slot: number) => ({ ...neutralInput(), abilityHeld: abilityMask([slot]) });

describe('delayed area', () => {
  it('shows a pending zone during the delay and hits only players inside when it fires', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
      techniqueIds: ['quake', 'seal', 'blink'],
    });
    const inside = sim.addPlayer({
      id: 'b',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 270, y: 200 },
    });
    const outside = sim.addPlayer({
      id: 'c',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 340, y: 200 },
    });
    sim.step({ a: { ...press(2), aim: { x: 1, y: 0 } } }); // zone centrée en 264, rayon 30
    expect(Object.values(sim.world.pending)).toHaveLength(1);
    expect(Object.values(sim.world.pending)[0]!.radius).toBe(30);
    for (let i = 0; i < 29; i++) sim.step({});
    expect(inside.health).toBe(100);
    const events = sim.step({});
    expect(events.some((e) => e.type === 'zoneTriggered')).toBe(true);
    expect(inside.health).toBe(80);
    expect(outside.health).toBe(100);
    expect(Object.keys(sim.world.pending)).toHaveLength(0);
  });

  it('announces the zone with its centre, radius and firing tick', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
      techniqueIds: ['quake', 'seal', 'blink'],
    });
    const events = sim.step({ a: { ...press(2), aim: { x: 1, y: 0 } } });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'zoneCreated',
        ownerId: 'a',
        position: { x: 264, y: 200 },
        radius: 30,
        fireAt: 30,
      }),
    );
  });

  it('applies a terrain radius multiplier at the zone position', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 80, y: 120 },
      techniqueIds: ['quake-water', 'seal', 'blink'],
    });
    // La zone tombe dans la mare (x 80, y 184): 30 × 2 = 60 de portée.
    const near = sim.addPlayer({
      id: 'b',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 35, y: 184 },
    });
    const far = sim.addPlayer({
      id: 'c',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 145, y: 184 },
    });
    // La visée du tick de l'appui n'est lue qu'au mouvement: elle descend un tick plus tôt.
    const down = { ...neutralInput(), aim: { x: 0, y: 1 } };
    sim.step({ a: down });
    sim.step({ a: { ...down, abilityHeld: abilityMask([2]) } });
    expect(Object.values(sim.world.pending)[0]!.radius).toBe(60);
    for (let i = 0; i < 30; i++) sim.step({ a: down });
    expect(near.health).toBe(80);
    expect(far.health).toBe(100);
  });
});

describe('delayed trigger', () => {
  it('stays invisible and runs its own effects where it was armed', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
      techniqueIds: ['fuse', 'seal', 'blink'],
    });
    const near = sim.addPlayer({
      id: 'b',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 218, y: 200 },
    });
    const far = sim.addPlayer({
      id: 'c',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 240, y: 200 },
    });
    const armed = sim.step({ a: press(2) });
    expect(armed.some((e) => e.type === 'zoneCreated')).toBe(false);
    expect(Object.values(sim.world.pending)[0]!.radius).toBeNull();
    for (let i = 0; i < 29; i++) sim.step({});
    expect(near.health).toBe(100);
    const fired = sim.step({});
    expect(fired).toContainEqual(
      expect.objectContaining({ type: 'zoneTriggered', position: { x: 200, y: 200 } }),
    );
    expect(near.health).toBe(85);
    expect(far.health).toBe(100);
    expect(Object.keys(sim.world.pending)).toHaveLength(0);
  });
});

describe('projectile explosion', () => {
  it('damages a bystander next to the impact', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
      techniqueIds: ['boom', 'seal', 'blink'],
    });
    const hit = sim.addPlayer({
      id: 'b',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 240, y: 200 },
    });
    const bystander = sim.addPlayer({
      id: 'c',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 260, y: 200 },
    });
    sim.step({ a: { ...press(2), aim: { x: 1, y: 0 } } });
    for (let i = 0; i < 10; i++) sim.step({});
    expect(Object.keys(sim.world.projectiles)).toHaveLength(0);
    expect(hit.health).toBe(85);
    expect(bystander.health).toBe(95);
    expect(Object.keys(sim.world.pending)).toHaveLength(0);
  });
});
