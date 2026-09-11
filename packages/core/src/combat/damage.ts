import { setPhase } from '../player/phaseTransitions';
import { isDamageable } from '../player/rules';
import type { PlayerState } from '../player/state';
import type { SimulationContext } from '../simulation/context';
import type { PlayerId } from '../simulation/ids';

export function applyDamage(
  ctx: SimulationContext,
  target: PlayerState,
  amount: number,
  sourceId: PlayerId | null,
): number {
  if (!isDamageable(target) || amount <= 0) return 0;
  const dealt = Math.min(target.health, amount);
  target.health -= dealt;
  ctx.events.push({
    type: 'damageDealt',
    tick: ctx.now,
    targetId: target.id,
    sourceId,
    amount: dealt,
    remainingHealth: target.health,
  });
  if (target.health <= 0) killPlayer(ctx, target, sourceId);
  return dealt;
}

export function killPlayer(
  ctx: SimulationContext,
  target: PlayerState,
  killerId: PlayerId | null,
): void {
  if (!setPhase(ctx, target, { kind: 'DEAD', diedAt: ctx.now })) return;
  target.velocity = { x: 0, y: 0 };
  target.statuses = [];
  ctx.events.push({ type: 'playerDied', tick: ctx.now, playerId: target.id, killerId });
}

export function canAffect(
  ctx: SimulationContext,
  source: PlayerState | undefined,
  target: PlayerState,
): boolean {
  if (!isDamageable(target)) return false;
  // Une source absente est un effet d'environnement: elle touche tout le monde.
  if (source === undefined) return true;
  if (source.id === target.id) return false;
  return ctx.matchConfig.friendlyFire || source.teamId !== target.teamId;
}
