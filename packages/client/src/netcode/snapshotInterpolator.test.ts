import { describe, expect, it } from 'vitest';
import { GameSimulation } from '@ninjarena/core';
import type { ProjectileState, WorldState } from '@ninjarena/core';
import { loadContent, loadMap } from '@ninjarena/content';
import { SnapshotInterpolator } from './snapshotInterpolator';

const makeSim = () => {
  const content = loadContent();
  const sim = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: content.matchModes.get('duel'),
    rules: content.statRules,
  });
  sim.addPlayer({ id: 'a', teamId: 'team-0', characterId: 'ninja', position: { x: 100, y: 100 } });
  return sim;
};

// Snapshot dérivé: tick et position du joueur posés à la main pour cadrer l'interpolation.
const worldAt = (sim: GameSimulation, tick: number, x: number): WorldState => {
  const world = sim.snapshot();
  world.tick = tick;
  world.players['a']!.position = { x, y: 100 };
  return world;
};

const projectileAt = (id: string, x: number): ProjectileState => ({
  id,
  ownerId: 'a',
  teamId: 'team-0',
  position: { x, y: 0 },
  velocity: { x: 0, y: 0 },
  radius: 4,
  expiresAt: 100,
  source: { abilityId: 'shuriken', effectIndex: 0 },
});

describe('SnapshotInterpolator', () => {
  it('interpolates positions between two snapshots', () => {
    const content = loadContent();
    const sim = new GameSimulation({
      map: loadMap(content, 'arena'),
      abilities: content.abilities,
      characters: content.characters,
      matchConfig: content.matchModes.get('duel'),
      rules: content.statRules,
    });
    const p = sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 100, y: 100 },
    });
    const interpolator = new SnapshotInterpolator();
    interpolator.push(sim.snapshot()); // tick 0
    sim.step({});
    sim.step({});
    p.position.x = 120;
    interpolator.push(sim.snapshot()); // tick 2
    expect(interpolator.sample(1)!.players['a']!.renderPosition.x).toBeCloseTo(110);
    expect(interpolator.sample(5)!.players['a']!.renderPosition.x).toBeCloseTo(120);
    expect(interpolator.sample(-3)!.players['a']!.renderPosition.x).toBeCloseTo(100);
  });

  it('picks the pair of snapshots surrounding the render tick', () => {
    const sim = makeSim();
    const interpolator = new SnapshotInterpolator();
    interpolator.push(worldAt(sim, 0, 100));
    interpolator.push(worldAt(sim, 2, 120));
    interpolator.push(worldAt(sim, 4, 200));
    expect(interpolator.sample(3)!.players['a']!.renderPosition.x).toBeCloseTo(160);
    expect(interpolator.sample(1)!.players['a']!.renderPosition.x).toBeCloseTo(110);
    expect(interpolator.sample(2)!.players['a']!.renderPosition.x).toBeCloseTo(120);
  });

  it('ignores a snapshot whose tick does not advance', () => {
    const sim = makeSim();
    const interpolator = new SnapshotInterpolator();
    interpolator.push(worldAt(sim, 2, 120));
    interpolator.push(worldAt(sim, 1, 500));
    interpolator.push(worldAt(sim, 2, 999));
    expect(interpolator.latest!.tick).toBe(2);
    expect(interpolator.latest!.players['a']!.position.x).toBe(120);
  });

  it('drops the oldest snapshot beyond its capacity', () => {
    const sim = makeSim();
    const interpolator = new SnapshotInterpolator(2);
    interpolator.push(worldAt(sim, 0, 100));
    interpolator.push(worldAt(sim, 2, 120));
    interpolator.push(worldAt(sim, 4, 200));
    expect(interpolator.latest!.tick).toBe(4);
    // Le snapshot du tick 0 a été évincé: un rendu plus ancien est ramené au plus vieux restant.
    expect(interpolator.sample(0)!.players['a']!.renderPosition.x).toBeCloseTo(120);
    expect(interpolator.sample(3)!.players['a']!.renderPosition.x).toBeCloseTo(160);
  });

  it('interpolates projectiles as well as players', () => {
    const sim = makeSim();
    const from = worldAt(sim, 0, 100);
    from.projectiles['p0'] = projectileAt('p0', 0);
    const to = worldAt(sim, 2, 120);
    to.projectiles['p0'] = projectileAt('p0', 40);
    const interpolator = new SnapshotInterpolator();
    interpolator.push(from);
    interpolator.push(to);
    expect(interpolator.sample(1)!.projectiles['p0']!.renderPosition.x).toBeCloseTo(20);
  });

  it('keeps entities present in only one of the two snapshots', () => {
    const sim = makeSim();
    const from = worldAt(sim, 0, 100);
    from.projectiles['gone'] = projectileAt('gone', 10);
    const to = worldAt(sim, 2, 120);
    to.projectiles['born'] = projectileAt('born', 50);
    delete to.players['a'];
    const interpolator = new SnapshotInterpolator();
    interpolator.push(from);
    interpolator.push(to);
    const sampled = interpolator.sample(1)!;
    expect(sampled.players['a']!.renderPosition.x).toBeCloseTo(100);
    expect(sampled.projectiles['gone']!.renderPosition.x).toBeCloseTo(10);
    expect(sampled.projectiles['born']!.renderPosition.x).toBeCloseTo(50);
  });

  it('reads discrete state from the older snapshot', () => {
    const sim = makeSim();
    const from = worldAt(sim, 0, 100);
    from.players['a']!.health = 80;
    const to = worldAt(sim, 2, 120);
    to.players['a']!.health = 0;
    const interpolator = new SnapshotInterpolator();
    interpolator.push(from);
    interpolator.push(to);
    const sampled = interpolator.sample(1)!;
    expect(sampled.players['a']!.health).toBe(80);
    expect(sampled.players['a']!.renderPosition.x).toBeCloseTo(110);
  });

  it('has nothing to sample before the first snapshot', () => {
    const interpolator = new SnapshotInterpolator();
    expect(interpolator.latest).toBeNull();
    expect(interpolator.sample(0)).toBeNull();
  });
});
