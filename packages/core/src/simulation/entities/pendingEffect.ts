import type { EffectRef } from '../../abilities/effectRef';
import { applyAreaHit } from '../../abilities/effects/areaHit';
import type { EffectContext } from '../../abilities/effects/executor';
import { executeList } from '../../abilities/effects/executor';
import type { Visual } from '../../definitions';
import type { Vec2 } from '../../math/vec2';
import type { SimulationContext } from '../context';
import type { EntityId, PlayerId, TeamId, Tick } from '../ids';

export interface PendingEffect {
  id: EntityId;
  ownerId: PlayerId;
  teamId: TeamId;
  position: Vec2;
  direction: Vec2;
  createdAt: Tick;
  fireAt: Tick;
  source: EffectRef;
  radius: number | null;
  triggerRadius: number;
  visual: Visual | null;
  group: string | null;
  fragile: boolean;
}

export type SchedulePendingParams = Omit<PendingEffect, 'id' | 'createdAt'>;

export function schedulePending(
  ctx: SimulationContext,
  params: SchedulePendingParams,
): PendingEffect {
  const id: EntityId = `z${ctx.world.nextEntityId++}`;
  const pending: PendingEffect = {
    id,
    ownerId: params.ownerId,
    teamId: params.teamId,
    position: { x: params.position.x, y: params.position.y },
    direction: { x: params.direction.x, y: params.direction.y },
    createdAt: ctx.now,
    fireAt: params.fireAt,
    source: { abilityId: params.source.abilityId, path: params.source.path },
    radius: params.radius,
    triggerRadius: params.triggerRadius,
    visual: params.visual === null ? null : { ...params.visual },
    group: params.group,
    fragile: params.fragile,
  };
  ctx.world.pending[id] = pending;
  // Un déclencheur sans rayon est invisible: seule une zone s'annonce au client.
  if (pending.radius !== null) {
    ctx.events.push({
      type: 'zoneCreated',
      tick: ctx.now,
      id,
      ownerId: pending.ownerId,
      position: { x: pending.position.x, y: pending.position.y },
      radius: pending.radius,
      fireAt: pending.fireAt,
    });
  }
  return pending;
}

export function pendingContextOf(ctx: SimulationContext, pending: PendingEffect): EffectContext {
  return {
    ctx,
    casterId: pending.ownerId,
    teamId: pending.teamId,
    origin: { x: pending.position.x, y: pending.position.y },
    direction: { x: pending.direction.x, y: pending.direction.y },
    source: pending.source,
  };
}

// Une zone qui part entraîne toute sa grappe: une mine touchée fait sauter les autres.
export function firePending(ctx: SimulationContext, pending: PendingEffect): void {
  if (ctx.world.pending[pending.id] === undefined) return;
  delete ctx.world.pending[pending.id];
  const context = pendingContextOf(ctx, pending);
  const ability = ctx.abilities.get(pending.source.abilityId);
  ctx.events.push({
    type: 'zoneTriggered',
    tick: ctx.now,
    id: pending.id,
    position: { x: pending.position.x, y: pending.position.y },
  });
  if (pending.radius === null) {
    executeList(ability, pending.source.path, 'effects', context);
  } else {
    applyAreaHit(
      context,
      ability,
      pending.source.path,
      pending.position,
      pending.radius,
      pending.visual,
    );
  }
  if (pending.group === null) return;
  for (const other of Object.values(ctx.world.pending)) {
    if (other.group === pending.group) firePending(ctx, other);
  }
}

// Une attaque adverse qui touche une zone fragile la fait partir sur-le-champ.
export function fragilePendingHit(
  ctx: SimulationContext,
  attackerTeamId: TeamId,
  position: Vec2,
  reach: number,
): PendingEffect | undefined {
  for (const pending of Object.values(ctx.world.pending)) {
    if (!pending.fragile) continue;
    if (!ctx.matchConfig.friendlyFire && pending.teamId === attackerTeamId) continue;
    const dx = pending.position.x - position.x;
    const dy = pending.position.y - position.y;
    const limit = reach + pending.triggerRadius;
    if (dx * dx + dy * dy <= limit * limit) return pending;
  }
  return undefined;
}
