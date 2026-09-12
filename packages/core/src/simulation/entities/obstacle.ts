import type { EffectRef } from '../../abilities/effectRef';
import type { ConvexPolygon } from '../../collision';
import type { Visual } from '../../definitions';
import type { LoadedMap } from '../../map/loadedMap';
import type { Vec2 } from '../../math/vec2';
import { add, normalize, scale } from '../../math/vec2';
import type { PlayerState } from '../../player/state';
import type { SimulationContext } from '../context';
import type { EntityId, PlayerId, TeamId, Tick } from '../ids';

export interface ObstacleState {
  id: EntityId;
  ownerId: PlayerId;
  teamId: TeamId;
  shape: ConvexPolygon;
  expiresAt: Tick;
  visual: Visual;
  source: EffectRef;
}

export interface SpawnWallParams {
  owner: PlayerState;
  direction: Vec2;
  width: number;
  thickness: number;
  offset: number;
  lifetimeMs: number;
  visual: Visual;
  source: EffectRef;
}

const FALLBACK_DIRECTION: Vec2 = { x: 1, y: 0 };

export function wallPolygon(
  center: Vec2,
  direction: Vec2,
  width: number,
  thickness: number,
): ConvexPolygon {
  const forward = directionOf(direction);
  const across = { x: -forward.y, y: forward.x };
  const halfWidth = width / 2;
  const halfThickness = thickness / 2;
  const corner = (alongSign: number, acrossSign: number): Vec2 =>
    add(
      add(center, scale(forward, alongSign * halfThickness)),
      scale(across, acrossSign * halfWidth),
    );
  return { type: 'polygon', points: [corner(-1, -1), corner(-1, 1), corner(1, 1), corner(1, -1)] };
}

export function spawnWall(ctx: SimulationContext, params: SpawnWallParams): ObstacleState {
  const direction = directionOf(params.direction);
  const center = clampInsideMap(
    ctx.map,
    add(params.owner.position, scale(direction, params.offset)),
    direction,
    params.width,
    params.thickness,
  );
  const id: EntityId = `o${ctx.world.nextEntityId++}`;
  const obstacle: ObstacleState = {
    id,
    ownerId: params.owner.id,
    teamId: params.owner.teamId,
    shape: wallPolygon(center, direction, params.width, params.thickness),
    expiresAt: ctx.now + ctx.ticks(params.lifetimeMs),
    visual: { ...params.visual },
    source: { abilityId: params.source.abilityId, path: params.source.path },
  };
  ctx.world.obstacles[id] = obstacle;
  ctx.events.push({ type: 'obstacleSpawned', tick: ctx.now, id, ownerId: obstacle.ownerId });
  return obstacle;
}

export function removeObstacle(ctx: SimulationContext, obstacle: ObstacleState): void {
  delete ctx.world.obstacles[obstacle.id];
  ctx.events.push({ type: 'obstacleRemoved', tick: ctx.now, id: obstacle.id });
}

function directionOf(direction: Vec2): Vec2 {
  const normalized = normalize(direction);
  return normalized.x === 0 && normalized.y === 0 ? FALLBACK_DIRECTION : normalized;
}

function clampInsideMap(
  map: LoadedMap,
  center: Vec2,
  direction: Vec2,
  width: number,
  thickness: number,
): Vec2 {
  // Le mur tourne avec la visée: ses demi-étendues sur les axes dépendent de l'orientation.
  const halfX = Math.abs(direction.x) * (thickness / 2) + Math.abs(direction.y) * (width / 2);
  const halfY = Math.abs(direction.y) * (thickness / 2) + Math.abs(direction.x) * (width / 2);
  return {
    x: clamp(center.x, halfX, map.widthInUnits - halfX),
    y: clamp(center.y, halfY, map.heightInUnits - halfY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value));
}
