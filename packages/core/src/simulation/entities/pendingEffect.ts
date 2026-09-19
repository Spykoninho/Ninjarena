import type { EffectRef } from '../../abilities/effectRef';
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
