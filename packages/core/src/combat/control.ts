import type { StatusEffectType } from '../definitions';
import type { Vec2 } from '../math/vec2';
import { normalize, scale } from '../math/vec2';
import { setPhase } from '../player/phaseTransitions';
import type { PlayerState } from '../player/state';
import { upsertStatus } from '../player/status';
import type { SimulationContext } from '../simulation/context';
import type { Tick } from '../simulation/ids';

export function applyStun(ctx: SimulationContext, target: PlayerState, durationMs: number): void {
  setPhase(ctx, target, { kind: 'STUNNED', endsAt: endOf(ctx, durationMs) });
}

export function applyKnockback(
  ctx: SimulationContext,
  target: PlayerState,
  direction: Vec2,
  speed: number,
  durationMs: number,
): void {
  setPhase(ctx, target, {
    kind: 'KNOCKBACK',
    velocity: scale(normalize(direction), speed),
    endsAt: endOf(ctx, durationMs),
  });
}

export function applyStatusEffect(
  ctx: SimulationContext,
  target: PlayerState,
  type: StatusEffectType,
  durationMs: number,
  magnitude?: number,
): void {
  const expiresAt = endOf(ctx, durationMs);
  upsertStatus(
    target,
    magnitude === undefined ? { type, expiresAt } : { type, expiresAt, magnitude },
  );
  ctx.events.push({
    type: 'statusApplied',
    tick: ctx.now,
    playerId: target.id,
    status: type,
    expiresAt,
  });
}

function endOf(ctx: SimulationContext, durationMs: number): Tick {
  // Un effet dure toujours au moins un tick, sinon il expirerait avant d'être vu.
  return ctx.now + Math.max(1, ctx.ticks(durationMs));
}
