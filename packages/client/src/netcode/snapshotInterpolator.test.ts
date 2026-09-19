import { describe, expect, it } from 'vitest';
import { GameSimulation } from '@ninjarena/core';
import type { ObstacleState, PendingEffect, ProjectileState, WorldState } from '@ninjarena/core';
import { loadContent, loadMap } from '@ninjarena/content';
import { duelConfig } from '../testing/matchConfig';
import { SnapshotInterpolator } from './snapshotInterpolator';

const makeSim = () => {
  const content = loadContent();
  const sim = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: duelConfig(content),
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
  visual: { color: '#d0d0d0', size: 4, trail: false },
  source: { abilityId: 'shuriken', path: '0' },
});

const pendingAt = (id: string, x: number): PendingEffect => ({
  id,
  ownerId: 'a',
  triggerRadius: 0,
  teamId: 'team-0',
  position: { x, y: 0 },
  direction: { x: 1, y: 0 },
  createdAt: 0,
  fireAt: 36,
  source: { abilityId: 'seismic-slam', path: '0' },
  radius: 40,
  visual: { color: '#c9a26b', size: 40, trail: false },
});

const obstacleAt = (id: string, x: number): ObstacleState => ({
  id,
  ownerId: 'a',
  teamId: 'team-0',
  shape: {
    type: 'polygon',
    points: [
      { x, y: 0 },
      { x: x + 8, y: 0 },
      { x: x + 8, y: 48 },
      { x, y: 48 },
    ],
  },
  expiresAt: 240,
  visual: { color: '#8a6a4b', size: 8, trail: false },
  source: { abilityId: 'earth-wall', path: '0' },
});

describe('SnapshotInterpolator', () => {
  it('interpolates positions between two snapshots', () => {
    const content = loadContent();
    const sim = new GameSimulation({
      map: loadMap(content, 'arena'),
      abilities: content.abilities,
      characters: content.characters,
      matchConfig: duelConfig(content),
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

  it('reads pending zones and obstacles from the newer snapshot', () => {
    const sim = makeSim();
    const from = worldAt(sim, 0, 100);
    from.pending['z1'] = pendingAt('z1', 10);
    from.obstacles['o1'] = obstacleAt('o1', 0);
    const to = worldAt(sim, 2, 120);
    to.pending['z1'] = pendingAt('z1', 10);
    to.pending['z2'] = pendingAt('z2', 50);
    to.obstacles['o2'] = obstacleAt('o2', 30);
    const interpolator = new SnapshotInterpolator();
    interpolator.push(from);
    interpolator.push(to);
    const sampled = interpolator.sample(1)!;
    // Zones et murs sont statiques: le rendu prend l'état le plus récent, sans interpolation.
    expect(Object.keys(sampled.pending).sort()).toEqual(['z1', 'z2']);
    expect(sampled.pending['z2']!.position).toEqual({ x: 50, y: 0 });
    expect(Object.keys(sampled.obstacles)).toEqual(['o2']);
    expect(sampled.obstacles['o2']!.shape.points[0]).toEqual({ x: 30, y: 0 });
  });

  it('carries the sampled tick, clamped to the snapshots it holds', () => {
    const sim = makeSim();
    const interpolator = new SnapshotInterpolator();
    interpolator.push(worldAt(sim, 10, 100));
    interpolator.push(worldAt(sim, 14, 120));
    expect(interpolator.sample(12)!.tick).toBe(12);
    expect(interpolator.sample(3)!.tick).toBe(10);
    expect(interpolator.sample(90)!.tick).toBe(14);
  });

  it('has nothing to sample before the first snapshot', () => {
    const interpolator = new SnapshotInterpolator();
    expect(interpolator.latest).toBeNull();
    expect(interpolator.sample(0)).toBeNull();
  });
});
