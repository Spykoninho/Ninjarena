import { applyAreaHit } from '../../abilities/effects/areaHit';
import type { EffectContext } from '../../abilities/effects/executor';
import { affectablePlayers, executeList } from '../../abilities/effects/executor';
import { distance } from '../../math/vec2';
import type { SimulationContext } from '../context';
import type { PendingEffect } from '../entities/pendingEffect';

export function pendingEffectSystem(ctx: SimulationContext): void {
  for (const pending of Object.values(ctx.world.pending)) {
    const context = contextOf(ctx, pending);
    if (pending.fireAt > ctx.now && !tripped(context, pending)) continue;
    fire(context, pending);
  }
}

// Une mine part au passage: une cible qu'elle peut toucher entre dans son rayon de déclenchement.
function tripped(context: EffectContext, pending: PendingEffect): boolean {
  if (pending.triggerRadius <= 0) return false;
  return affectablePlayers(context).some(
    (player) => distance(pending.position, player.position) <= pending.triggerRadius,
  );
}

function contextOf(ctx: SimulationContext, pending: PendingEffect): EffectContext {
  return {
    ctx,
    casterId: pending.ownerId,
    teamId: pending.teamId,
    origin: { x: pending.position.x, y: pending.position.y },
    direction: { x: pending.direction.x, y: pending.direction.y },
    source: pending.source,
  };
}

function fire(context: EffectContext, pending: PendingEffect): void {
  const ctx = context.ctx;
  const ability = ctx.abilities.get(pending.source.abilityId);
  delete ctx.world.pending[pending.id];
  ctx.events.push({
    type: 'zoneTriggered',
    tick: ctx.now,
    id: pending.id,
    position: { x: pending.position.x, y: pending.position.y },
  });
  if (pending.radius === null) {
    executeList(ability, pending.source.path, 'effects', context);
    return;
  }
  applyAreaHit(
    context,
    ability,
    pending.source.path,
    pending.position,
    pending.radius,
    pending.visual,
  );
}
