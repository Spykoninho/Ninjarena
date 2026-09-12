import { describe, expect, it } from 'vitest';
import { contextOf, createTestSimulation } from '../testing/fixtures';
import { applyDamage, canAffect, killPlayer } from './damage';
import { applyKnockback, applyStatusEffect, applyStun } from './control';

const setup = () => {
  const sim = createTestSimulation();
  const p = sim.addPlayer({
    id: 'p1',
    teamId: 'team-0',
    characterId: 'ninja',
    position: { x: 200, y: 200 },
  });
  return { sim, p, ctx: contextOf(sim) };
};

describe('applyDamage', () => {
  it('reduces health and reports the damage', () => {
    const { p, ctx } = setup();
    expect(applyDamage(ctx, p, 30, 'p2')).toBe(30);
    expect(p.health).toBe(70);
    expect(ctx.events.at(-1)).toMatchObject({
      type: 'damageDealt',
      targetId: 'p1',
      amount: 30,
      remainingHealth: 70,
    });
  });

  it('kills at zero health and ignores further damage', () => {
    const { p, ctx } = setup();
    applyDamage(ctx, p, 150, 'p2');
    expect(p.health).toBe(0);
    expect(p.phase.kind).toBe('DEAD');
    expect(ctx.events.some((e) => e.type === 'playerDied' && e.killerId === 'p2')).toBe(true);
    expect(applyDamage(ctx, p, 10, 'p2')).toBe(0);
  });

  it('reports the scaling and the position of the hit', () => {
    const { p, ctx } = setup();
    applyDamage(ctx, p, 12, 'p2', { scaling: 'physical' });
    expect(ctx.events.at(-1)).toMatchObject({
      type: 'damageDealt',
      scaling: 'physical',
      position: { x: 200, y: 200 },
    });
  });

  it('spends a shield before health and breaks it when empty', () => {
    const { p, ctx } = setup();
    applyStatusEffect(ctx, p, 'SHIELDED', 1000, 25);
    expect(applyDamage(ctx, p, 10, 'p2')).toBe(0);
    expect(p.health).toBe(100);
    expect(ctx.events.at(-1)).toMatchObject({ type: 'shieldAbsorbed', amount: 10, remaining: 15 });
    expect(applyDamage(ctx, p, 20, 'p2')).toBe(5);
    expect(p.health).toBe(95);
    expect(p.statuses.some((s) => s.type === 'SHIELDED')).toBe(false);
    expect(ctx.events.some((e) => e.type === 'shieldBroken')).toBe(true);
  });

  it('ignores INVULNERABLE targets', () => {
    const { p, ctx } = setup();
    applyStatusEffect(ctx, p, 'INVULNERABLE', 1000);
    expect(applyDamage(ctx, p, 30, null)).toBe(0);
    expect(p.health).toBe(100);
  });
});

describe('killPlayer', () => {
  it('empties health, clears statuses and reports the death', () => {
    const { p, ctx } = setup();
    applyStatusEffect(ctx, p, 'SLOWED', 1000, 0.5);
    killPlayer(ctx, p, 'p2');
    expect(p.health).toBe(0);
    expect(p.phase.kind).toBe('DEAD');
    expect(p.statuses).toHaveLength(0);
    expect(ctx.events.some((e) => e.type === 'playerDied' && e.killerId === 'p2')).toBe(true);
  });
});

describe('canAffect', () => {
  it('spares allies without friendly fire but not enemies or environment targets', () => {
    const sim = createTestSimulation();
    const source = sim.addPlayer({
      id: 'source',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 200, y: 200 },
    });
    const ally = sim.addPlayer({
      id: 'ally',
      teamId: 'team-0',
      characterId: 'ninja',
      position: { x: 240, y: 200 },
    });
    const enemy = sim.addPlayer({
      id: 'enemy',
      teamId: 'team-1',
      characterId: 'ninja',
      position: { x: 280, y: 200 },
    });
    const ctx = contextOf(sim);
    expect(canAffect(ctx, source, ally)).toBe(false);
    expect(canAffect(ctx, source, enemy)).toBe(true);
    expect(canAffect(ctx, undefined, enemy)).toBe(true);
  });
});

describe('stun and knockback', () => {
  it('stun interrupts a cast and expires back to NORMAL', () => {
    const { sim, p, ctx } = setup();
    p.phase = {
      kind: 'CASTING',
      slot: 0,
      abilityId: 'shuriken',
      startedAt: 0,
      activatesAt: 6,
      activeUntil: 6,
      endsAt: 15,
      activated: false,
    };
    applyStun(ctx, p, 100); // 6 ticks: étourdi jusqu'au tick 5, de retour en NORMAL pendant le tick 6
    expect(p.phase.kind).toBe('STUNNED');
    for (let i = 0; i < 7; i++) sim.step({});
    expect(p.phase.kind).toBe('NORMAL');
  });

  it('knockback moves the player along the direction then stops', () => {
    const { sim, p, ctx } = setup();
    applyKnockback(ctx, p, { x: 1, y: 0 }, 300, 100);
    for (let i = 0; i < 7; i++) sim.step({}); // 6 ticks de recul, puis la phase expire
    expect(p.position.x).toBeCloseTo(200 + 300 * (6 / 60), 3);
    expect(p.phase.kind).toBe('NORMAL');
  });

  it('nothing overrides death', () => {
    const { p, ctx } = setup();
    applyDamage(ctx, p, 999, null);
    applyStun(ctx, p, 100);
    expect(p.phase.kind).toBe('DEAD');
  });
});
