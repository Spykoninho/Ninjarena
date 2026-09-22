import { describe, expect, it } from 'vitest';
import type { Loadout } from '../abilities/loadout';
import { hasStatus } from '../player/status';
import { emptyBuild } from '../stats/build';
import type { WorldEvent } from './events';
import type { GameSimulation } from './gameSimulation';
import type { PlayerInputs } from './input';
import { abilityMask, neutralInput } from './input';
import { addTestPlayer, createTestSimulation } from '../testing/fixtures';

const inputsAt = (tick: number): PlayerInputs => ({
  p1: {
    move: { x: Math.sin(tick / 9), y: Math.cos(tick / 7) },
    aim: { x: 1, y: 0 },
    abilityHeld: tick % 20 < 2 ? abilityMask([2]) : 0,
  },
  p2: {
    move: { x: -Math.cos(tick / 5), y: Math.sin(tick / 11) },
    aim: { x: -1, y: 0 },
    abilityHeld: tick % 15 < 2 ? abilityMask([0, 3]) : 0,
  },
});

const duelOf = (): GameSimulation => {
  const sim = createTestSimulation();
  sim.startMatch();
  addTestPlayer(sim, {
    id: 'p1',
    teamId: 'team-0',
    characterId: 'ninja',
    position: { x: 80, y: 120 },
  });
  addTestPlayer(sim, {
    id: 'p2',
    teamId: 'team-1',
    characterId: 'ninja',
    position: { x: 140, y: 120 },
  });
  return sim;
};

describe('GameSimulation', () => {
  it('advances the tick once per step', () => {
    const sim = createTestSimulation();
    sim.step({});
    sim.step({});
    expect(sim.world.tick).toBe(2);
  });

  it('reaches the same world from the same inputs', () => {
    const one = duelOf();
    const other = duelOf();
    for (let tick = 0; tick < 120; tick++) {
      one.step(inputsAt(tick));
      other.step(inputsAt(tick));
    }
    expect(one.world.tick).toBe(120);
    expect(one.snapshot()).toEqual(other.snapshot());
  });

  it('snapshot and restore round-trip the world without sharing references', () => {
    const sim = createTestSimulation();
    addTestPlayer(sim, {
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 40, y: 40 },
    });
    const snapshot = sim.snapshot();
    sim.world.players['p1']!.position.x = 999;
    expect(snapshot.players['p1']!.position.x).toBe(40);
    sim.restore(snapshot);
    expect(sim.world.players['p1']!.position.x).toBe(40);
    expect(sim.world).not.toBe(snapshot);
  });
});

describe('GameSimulation.equipPlayer', () => {
  const sturdy: Loadout = {
    build: { ...emptyBuild(), vitality: 5 },
    basicAttackId: 'slash',
    techniqueIds: ['haste', 'mend', 'blink'],
  };
  const pressing = (slot: number): PlayerInputs => ({
    p1: { ...neutralInput(), abilityHeld: abilityMask([slot]) },
  });

  it('hands a living player the new kit where they stand, gauges full and every slot ready', () => {
    const sim = duelOf();
    const p1 = sim.world.players['p1']!;
    sim.step(pressing(2));
    expect(p1.phase.kind).toBe('CASTING');
    const position = { ...p1.position };

    sim.equipPlayer('p1', sturdy);

    expect(p1.abilities.map((slot) => slot.abilityId)).toEqual([
      'slash',
      'dash',
      'haste',
      'mend',
      'blink',
    ]);
    expect(p1.abilities.every((slot) => slot.readyAt === 0)).toBe(true);
    expect(p1.health).toBe(160);
    expect(p1.stats.maxHealth).toBe(160);
    expect(p1.chakra).toBe(p1.stats.maxChakra);
    expect(p1.phase.kind).toBe('NORMAL');
    expect(p1.position).toEqual(position);
    // Le shuriken lancé avant le changement ne part jamais; la nouvelle technique répond tout de suite.
    const events: WorldEvent[] = [];
    for (let tick = 0; tick < 20; tick++) events.push(...sim.step({}));
    expect(events.filter((event) => event.type === 'abilityActivated')).toEqual([]);
    sim.step(pressing(2));
    expect(hasStatus(p1, 'HASTED')).toBe(true);
  });

  it('keeps a dead player down until the next round, which brings them back with the new build', () => {
    const sim = duelOf();
    const p1 = sim.world.players['p1']!;
    p1.health = 0;
    p1.phase = { kind: 'DEAD', diedAt: sim.world.tick };

    sim.equipPlayer('p1', sturdy);
    expect(p1.phase.kind).toBe('DEAD');
    expect(p1.health).toBe(0);

    sim.step({});
    sim.step({});
    expect(sim.world.match.round).toBe(2);
    expect(p1.phase.kind).toBe('NORMAL');
    expect(p1.health).toBe(160);
    expect(p1.abilities[2]?.abilityId).toBe('haste');
  });
});
