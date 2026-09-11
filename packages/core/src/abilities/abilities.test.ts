import { describe, expect, it } from 'vitest';
import { abilityMask, neutralInput } from '../simulation/input';
import { createTestSimulation } from '../testing/fixtures';

const press = (slot: number, aim = { x: 1, y: 0 }) => ({
  ...neutralInput(),
  aim,
  abilityHeld: abilityMask([slot]),
});
const idle = (aim = { x: 1, y: 0 }) => ({ ...neutralInput(), aim });
// slots: 0 shuriken, 1 slash, 2 dash, 3 seal

describe('ability validation', () => {
  it('starts a cast on press, deducts energy and starts the cooldown', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    sim.step({ p1: press(0) });
    expect(p.phase.kind).toBe('CASTING');
    expect(p.energy).toBe(90);
    expect(p.abilities[0]!.readyAt).toBe(54); // 900 ms at 60 Hz
  });

  it('rejects a press while on cooldown, out of energy, or busy', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    p.abilities[0]!.readyAt = 100;
    let events = sim.step({ p1: press(0) });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'abilityRejected', reason: 'ON_COOLDOWN' }),
    );
    p.abilities[0]!.readyAt = 0;
    p.energy = 5;
    events = sim.step({ p1: idle() }); // release
    events = sim.step({ p1: press(0) });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'abilityRejected', reason: 'NOT_ENOUGH_ENERGY' }),
    );
    p.energy = 100;
    p.phase = { kind: 'STUNNED', endsAt: 1000 };
    sim.step({ p1: idle() });
    events = sim.step({ p1: press(0) });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'abilityRejected', reason: 'BUSY' }),
    );
  });

  it('requires a new press: holding the button does not recast', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    let casts = 0;
    for (let i = 0; i < 120; i++) {
      for (const e of sim.step({ p1: press(0) })) if (e.type === 'abilityCast') casts++;
    }
    expect(casts).toBe(1); // the cooldown ended at tick 54 but the button was never released
  });

  it('follows the timeline startup → activation → recovery → NORMAL', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    sim.step({ p1: press(0) }); // tick 0: cast, activates at 6, ends at 15
    for (let i = 1; i < 6; i++) sim.step({ p1: idle() });
    expect(Object.keys(sim.world.projectiles)).toHaveLength(0);
    sim.step({ p1: idle() }); // tick 6
    expect(Object.keys(sim.world.projectiles)).toHaveLength(1);
    expect(p.phase.kind).toBe('CASTING');
    for (let i = 7; i <= 15; i++) sim.step({ p1: idle() });
    expect(p.phase.kind).toBe('NORMAL');
  });

  it('dash moves the caster along the aim and is stopped by walls', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    const p = sim.addPlayer({
      id: 'p1',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 60, y: 200 },
    });
    sim.step({ p1: press(2) });
    for (let i = 0; i < 6; i++) sim.step({ p1: idle() });
    expect(p.position.x).toBeCloseTo(60 + 64, 1);
    expect(p.phase.kind).toBe('NORMAL');

    const blocked = sim.addPlayer({
      id: 'p2',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 140, y: 100 },
    });
    sim.step({ p2: press(2) });
    for (let i = 0; i < 6; i++) sim.step({ p2: idle() });
    expect(blocked.position.x).toBeCloseTo(160 - 5, 1); // wall at x = 160
  });

  it('melee hits targets inside the arc and applies knockback', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    const inFront = sim.addPlayer({
      id: 'b',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 220, y: 200 },
    });
    const behind = sim.addPlayer({
      id: 'c',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 180, y: 200 },
    });
    sim.step({ a: press(1) }); // startup 100 ms = 6 ticks, activates during tick 6
    for (let i = 0; i < 8; i++) sim.step({ a: idle() });
    expect(inFront.health).toBe(70);
    expect(inFront.phase.kind).toBe('KNOCKBACK');
    expect(behind.health).toBe(100);
  });

  it('does not damage teammates without friendly fire', () => {
    const sim = createTestSimulation();
    sim.startMatch();
    sim.addPlayer({
      id: 'a',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    const mate = sim.addPlayer({
      id: 'b',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 220, y: 200 },
    });
    sim.step({ a: press(1) });
    for (let i = 0; i < 8; i++) sim.step({ a: idle() });
    expect(mate.health).toBe(100);
  });
});
