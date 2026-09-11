import { describe, expect, it } from 'vitest';
import { GameSimulation } from '@ninjarena/core';
import { loadContent, loadMap } from '@ninjarena/content';
import { SnapshotInterpolator } from './snapshotInterpolator';

describe('SnapshotInterpolator', () => {
  it('interpolates positions between two snapshots', () => {
    const content = loadContent();
    const sim = new GameSimulation({
      map: loadMap(content, 'arena'),
      abilities: content.abilities,
      characters: content.characters,
      matchConfig: content.matchModes.get('duel'),
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
});
