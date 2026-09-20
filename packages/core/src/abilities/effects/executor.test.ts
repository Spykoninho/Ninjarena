import { describe, expect, it } from 'vitest';
import { abilityMask, neutralInput } from '../../simulation/input';
import { TEST_ABILITIES, createTestSimulation } from '../../testing/fixtures';
import { childPath, resolveEffect, rootPath } from '../effectRef';

const press = (slot: number) => ({ ...neutralInput(), abilityHeld: abilityMask([slot]) });
const idle = () => neutralInput();
const BACKWARD = { x: -1, y: 0 };

const twoPlayers = (techniqueIds = ['shuriken', 'seal', 'blink']) => {
  const sim = createTestSimulation();
  sim.startMatch();
  const a = sim.addPlayer({
    id: 'a',
    teamId: 'team-0',
    characterId: 'ninja',
    position: { x: 200, y: 200 },
    techniqueIds,
  });
  const b = sim.addPlayer({
    id: 'b',
    teamId: 'team-1',
    characterId: 'ninja',
    position: { x: 224, y: 200 },
  });
  return { sim, a, b };
};

describe('effect paths', () => {
  it('resolves nested effects by dotted path', () => {
    const seal = TEST_ABILITIES.find((x) => x.id === 'seal')!;
    expect(resolveEffect(seal, rootPath(0)).type).toBe('projectile');
    expect(resolveEffect(seal, childPath(rootPath(0), 'onHit', 1)).type).toBe('applyStatus');
    expect(() => resolveEffect(seal, '0.onHit.9')).toThrow();
  });
});

describe('dash with contact effects', () => {
  it('hits each player crossed at most once', () => {
    const { sim, b } = twoPlayers(['spark-dash', 'seal', 'blink']);
    sim.step({ a: press(2) });
    for (let i = 0; i < 8; i++) sim.step({ a: idle() });
    expect(b.health).toBe(90);
  });

  it('grants invulnerability ticks only when configured', () => {
    const { sim, a } = twoPlayers();
    sim.step({ a: press(1) }); // l'esquive universelle: invulnerableTicks 0
    expect(a.statuses.some((s) => s.type === 'INVULNERABLE')).toBe(false);
  });
});

describe('teleport', () => {
  it('moves along the aim and stops before a wall', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const a = sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 120, y: 100 },
      techniqueIds: ['blink', 'seal', 'shuriken'],
    });
    sim.step({ a: { ...press(2), aim: { x: 1, y: 0 } } }); // blink sans armement dans la fixture
    expect(a.position.x).toBeLessThanOrEqual(160 - 5);
    expect(a.position.x).toBeGreaterThan(120);
  });
});

describe('shield', () => {
  it('absorbs damage before health and breaks when empty', () => {
    const { sim, a } = twoPlayers(['chakra-shield-test', 'seal', 'blink']);
    sim.step({ a: press(2) });
    expect(a.statuses.find((s) => s.type === 'SHIELDED')?.magnitude).toBe(25);
    // b frappe a une fois (30 physique, defense 0): 25 absorbés, 5 sur les points de vie
    sim.step({ b: { ...press(0), aim: BACKWARD } });
    for (let i = 0; i < 8; i++) sim.step({ b: { ...idle(), aim: BACKWARD } });
    expect(a.health).toBe(95);
    expect(a.statuses.some((s) => s.type === 'SHIELDED')).toBe(false);
  });
});

describe('damage scaling', () => {
  it('applies strength to physical hits and defense to the target', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const strong = sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
      build: {
        vitality: 0,
        strength: 5,
        power: 0,
        speed: 0,
        maxChakra: 0,
        chakraRegen: 0,
        defense: 0,
      },
    });
    const tank = sim.addPlayer({
      id: 'b',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 216, y: 200 },
      build: {
        vitality: 0,
        strength: 0,
        power: 0,
        speed: 0,
        maxChakra: 0,
        chakraRegen: 0,
        defense: 5,
      },
    });
    sim.step({ a: press(0) });
    for (let i = 0; i < 8; i++) sim.step({});
    // slash 30 × 1,30 = 39 bruts, × 100/140 → 27,9
    expect(tank.health).toBeCloseTo(100 - 27.9, 1);
    expect(strong.health).toBe(100);
  });
});

describe('heal', () => {
  it('restores health up to the maximum and reports what was really healed', () => {
    const { sim, a, b } = twoPlayers(['mend', 'seal', 'blink']);
    a.health = 90;
    sim.step({ a: press(2) });
    expect(a.health).toBe(100);
    const healed = sim.step({ a: idle() });
    expect(healed.some((e) => e.type === 'healed')).toBe(false);
    expect(b.health).toBe(100);
  });

  it('heals the caster by the amount when there is room', () => {
    const { sim, a } = twoPlayers(['mend', 'seal', 'blink']);
    a.health = 50;
    const events = sim.step({ a: press(2) });
    expect(a.health).toBe(70);
    expect(events.find((e) => e.type === 'healed')).toMatchObject({
      targetId: 'a',
      sourceId: 'a',
      amount: 20,
      remainingHealth: 70,
    });
  });
});

describe('status on self', () => {
  it('applies the status to the caster instead of a hit target', () => {
    const { sim, a, b } = twoPlayers(['haste', 'seal', 'blink']);
    sim.step({ a: press(2) });
    expect(a.statuses.find((s) => s.type === 'HASTED')?.magnitude).toBe(1.5);
    expect(b.statuses.some((s) => s.type === 'HASTED')).toBe(false);
  });

  it('makes a hasted player move faster', () => {
    const { sim, a } = twoPlayers(['haste', 'seal', 'blink']);
    sim.step({ a: press(2) });
    for (let i = 0; i < 4; i++) sim.step({ a: idle() });
    const before = a.position.x;
    sim.step({ a: { ...idle(), move: { x: 1, y: 0 } } });
    // 140 × 1,5 sur un tick de 1/60 s: 3,5 unités au lieu de 2,33.
    expect(a.position.x - before).toBeCloseTo(3.5, 2);
  });
});

describe('projectile fan', () => {
  it('spawns every projectile of the fan around the aim', () => {
    const { sim } = twoPlayers(['fan', 'seal', 'blink']);
    // La visée d'un tick sert au cast du suivant: les capacités partent avant le mouvement.
    sim.step({ a: { ...idle(), aim: { x: 0, y: 1 } } });
    sim.step({ a: { ...press(2), aim: { x: 0, y: 1 } } });
    const projectiles = Object.values(sim.world.projectiles);
    expect(projectiles).toHaveLength(3);
    const angles = projectiles
      .map((p) => (Math.atan2(p.velocity.y, p.velocity.x) * 180) / Math.PI)
      .sort((x, y) => x - y);
    expect(angles.map((a) => Math.round(a))).toEqual([60, 90, 120]);
  });
});
