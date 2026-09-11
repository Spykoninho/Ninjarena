import { describe, expect, it } from 'vitest';
import { contextOf, createTestSimulation } from '../testing/fixtures';
import { applyDamage } from './damage';
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

  it('ignores INVULNERABLE targets', () => {
    const { p, ctx } = setup();
    applyStatusEffect(ctx, p, 'INVULNERABLE', 1000);
    expect(applyDamage(ctx, p, 30, null)).toBe(0);
    expect(p.health).toBe(100);
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
      endsAt: 15,
      activated: false,
    };
    applyStun(ctx, p, 100); // 6 ticks: stunned through tick 5, back to NORMAL during tick 6
    expect(p.phase.kind).toBe('STUNNED');
    for (let i = 0; i < 7; i++) sim.step({});
    expect(p.phase.kind).toBe('NORMAL');
  });

  it('knockback moves the player along the direction then stops', () => {
    const { sim, p, ctx } = setup();
    applyKnockback(ctx, p, { x: 1, y: 0 }, 300, 100);
    for (let i = 0; i < 7; i++) sim.step({}); // 6 ticks of knockback, then the phase expires
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
