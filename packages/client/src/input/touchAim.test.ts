import { describe, expect, it } from 'vitest';
import { AbilityDefinitionSchema } from '@ninjarena/core';
import { aimShapeOf, assistRange } from './touchAim';

const visual = { color: '#ffffff', size: 4 };

function shapeOf(...effects: unknown[]) {
  return aimShapeOf(
    AbilityDefinitionSchema.parse({
      id: 'test',
      name: 'Test',
      kind: 'technique',
      cooldownMs: 1000,
      chakraCost: 10,
      startupMs: 100,
      recoveryMs: 100,
      effects,
    }),
  );
}

describe('aimShapeOf', () => {
  it('aims a projectile along its whole flight, fans included', () => {
    const fan = { type: 'projectile', speed: 400, radius: 3, lifetimeMs: 500, visual, onHit: [] };
    expect(shapeOf({ ...fan, count: 3, spreadDegrees: 10 })).toEqual({
      kind: 'line',
      reach: 200,
      spreadDegrees: 20,
      offensive: true,
    });
  });

  it('casts a whirlwind, a mine cluster or a self buff on the spot', () => {
    expect(shapeOf({ type: 'melee', range: 30, arcDegrees: 360, onHit: [] })).toEqual({
      kind: 'self',
    });
    expect(shapeOf({ type: 'area', origin: 'caster', radius: 16, visual, onHit: [] })).toEqual({
      kind: 'self',
    });
    expect(
      shapeOf({ type: 'applyStatus', status: 'HASTED', durationMs: 1000, target: 'self' }),
    ).toEqual({ kind: 'self' });
  });

  it('tells a hitting dash from an escape', () => {
    const dash = { type: 'dash', distance: 100, durationMs: 150 };
    expect(shapeOf(dash)).toMatchObject({ kind: 'line', reach: 100, offensive: false });
    expect(shapeOf({ ...dash, onContact: [{ type: 'stun', durationMs: 500 }] })).toMatchObject({
      offensive: true,
    });
    expect(shapeOf({ type: 'teleport', distance: 120 })).toMatchObject({ offensive: false });
  });

  it('puts a strike under the finger, a blast at full range and a wall ahead', () => {
    const area = { type: 'area', range: 180, radius: 36, visual, onHit: [] };
    expect(shapeOf({ ...area, origin: 'cursor' })).toEqual({
      kind: 'area',
      range: 180,
      radius: 36,
      free: true,
    });
    expect(shapeOf({ ...area, origin: 'aim' })).toMatchObject({ free: false });
    expect(
      shapeOf({
        type: 'spawnEntity',
        entity: 'wall',
        width: 48,
        thickness: 8,
        offset: 32,
        lifetimeMs: 4000,
        visual,
      }),
    ).toEqual({ kind: 'wall', offset: 32, width: 48 });
  });

  it('lets the first effect that leaves in a direction decide', () => {
    const buff = { type: 'applyStatus', status: 'HASTED', durationMs: 1000, target: 'self' };
    const melee = { type: 'melee', range: 20, arcDegrees: 90, onHit: [] };
    expect(shapeOf(buff, melee)).toEqual({ kind: 'cone', reach: 20, arcDegrees: 90 });
    expect(shapeOf({ type: 'delayedTrigger', delayMs: 200, effects: [melee] })).toMatchObject({
      kind: 'cone',
    });
  });
});

describe('assistRange', () => {
  it('only looks for an enemy with a shape that hits one', () => {
    expect(assistRange({ kind: 'self' })).toBeNull();
    expect(assistRange({ kind: 'line', reach: 96, spreadDegrees: 0, offensive: false })).toBeNull();
  });

  it('looks further than a short swing and as far as a strike can land', () => {
    expect(assistRange({ kind: 'cone', reach: 20, arcDegrees: 90 })).toBeGreaterThan(20);
    expect(assistRange({ kind: 'area', range: 180, radius: 36, free: true })).toBe(216);
  });
});
