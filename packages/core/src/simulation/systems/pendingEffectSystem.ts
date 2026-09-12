import { applyAreaHit } from '../../abilities/effects/areaHit';
import type { EffectContext } from '../../abilities/effects/executor';
import { executeList } from '../../abilities/effects/executor';
import type { SimulationContext } from '../context';
import type { PendingEffect } from '../entities/pendingEffect';

export function pendingEffectSystem(ctx: SimulationContext): void {
  for (const pending of Object.values(ctx.world.pending)) {
    if (pending.fireAt > ctx.now) continue;
    fire(ctx, pending);
  }
}

function fire(ctx: SimulationContext, pending: PendingEffect): void {
  const ability = ctx.abilities.get(pending.source.abilityId);
  const context: EffectContext = {
    ctx,
    casterId: pending.ownerId,
    teamId: pending.teamId,
    origin: { x: pending.position.x, y: pending.position.y },
    direction: { x: pending.direction.x, y: pending.direction.y },
    source: pending.source,
  };
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
