import { describe, expect, it } from 'vitest';
import { spawnProjectile } from '../../projectile/state';
import { abilityMask, neutralInput } from '../input';
import { addTestPlayer, contextOf, createTestSimulation } from '../../testing/fixtures';
import { projectileSystem } from './projectileSystem';

const shoot = { ...neutralInput(), aim: { x: 1, y: 0 }, abilityHeld: abilityMask([3]) }; // seal: aucun temps d'armement
const idle = { ...neutralInput(), aim: { x: 1, y: 0 } };

describe('projectileSystem', () => {
  it('hits an enemy in its path, applies hit effects and disappears', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    addTestPlayer(sim, {
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 60, y: 200 },
    });
    const target = addTestPlayer(sim, {
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
    addTestPlayer(sim, {
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 120, y: 100 },
    }); // mur à x = 160
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
    // La rangée 2 est libre de x=16 à x=464: 300 unités/s pendant 1000 ms n'atteint aucun mur.
    addTestPlayer(sim, {
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 40, y: 40 },
    });
    sim.step({ a: shoot });
    let reason: string | undefined;
    for (let i = 0; i < 70 && !reason; i++) {
      for (const e of sim.step({ a: idle }))
        if (e.type === 'projectileDestroyed') reason = e.reason;
    }
    expect(reason).toBe('expired');
    expect(sim.world.tick).toBeGreaterThanOrEqual(60);
  });

  it('keeps the friendly-fire rules after its owner leaves the world', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    addTestPlayer(sim, {
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 60, y: 200 },
    });
    const mate = addTestPlayer(sim, {
      id: 'b',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 120, y: 200 },
    });
    const enemy = addTestPlayer(sim, {
      id: 'c',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 180, y: 200 },
    });
    sim.step({ a: shoot });
    sim.removePlayer('a');
    for (let i = 0; i < 30; i++) sim.step({});
    expect(mate.phase.kind).toBe('NORMAL');
    expect(mate.statuses).toHaveLength(0);
    expect(enemy.phase.kind).toBe('STUNNED');
    expect(Object.keys(sim.world.projectiles)).toHaveLength(0);
  });

  it('hits the nearest player in reach rather than the first one added', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const owner = addTestPlayer(sim, {
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    const far = addTestPlayer(sim, {
      id: 'far',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 216, y: 200 },
    });
    const near = addTestPlayer(sim, {
      id: 'near',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 212, y: 200 },
    });
    const ctx = contextOf(sim);
    // Le tir naît à x = 209 et avance d'une unité: les deux cibles sont dans la portée du sous-pas.
    spawnProjectile(ctx, {
      owner,
      direction: { x: 1, y: 0 },
      speed: 60,
      radius: 3,
      lifetimeMs: 1000,
      visual: { color: '#d0d0d0', size: 3, trail: false },
      source: { abilityId: 'shuriken', path: '0' },
    });
    projectileSystem(ctx);
    expect(near.health).toBe(near.stats.maxHealth - 18);
    expect(far.health).toBe(far.stats.maxHealth);
  });

  it('never hits its owner', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const a = addTestPlayer(sim, {
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
