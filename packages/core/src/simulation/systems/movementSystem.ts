import { circleBounds, resolveCircleAgainstShapes, separateCircles } from '../../collision';
import type { LoadedMap } from '../../map/loadedMap';
import { collidersNear } from '../colliders';
import type { Vec2 } from '../../math/vec2';
import { clampLength, isZero, scale } from '../../math/vec2';
import type { CombatPhaseState } from '../../player/phase';
import { controlsMovement, isAlive, statusSpeedMultiplier } from '../../player/rules';
import type { PlayerState } from '../../player/state';
import type { SimulationContext } from '../context';
import type { PlayerInput, PlayerInputs } from '../input';
import { playersOf } from '../world';

const ZERO: Vec2 = { x: 0, y: 0 };

interface MovedPlayer {
  player: PlayerState;
  from: Vec2;
}

export function movementSystem(ctx: SimulationContext, inputs: PlayerInputs): void {
  const moved: MovedPlayer[] = [];
  for (const player of playersOf(ctx.world)) {
    if (!isAlive(player)) continue;
    const input = inputs[player.id];
    if (input !== undefined && !isZero(input.aim)) player.aim = { x: input.aim.x, y: input.aim.y };
    const from = { x: player.position.x, y: player.position.y };
    const velocity = velocityOf(ctx, player, input);
    player.position = settle(ctx, moveBy(from, velocity, ctx.dt), player.stats.colliderRadius);
    moved.push({ player, from });
  }
  separatePlayers(ctx, moved);
  // La vitesse publiée est celle réellement parcourue: murs et séparation compris.
  for (const { player, from } of moved) {
    player.velocity = {
      x: (player.position.x - from.x) / ctx.dt,
      y: (player.position.y - from.y) / ctx.dt,
    };
  }
}

function velocityOf(
  ctx: SimulationContext,
  player: PlayerState,
  input: PlayerInput | undefined,
): Vec2 {
  const phase = player.phase;
  switch (phase.kind) {
    case 'DASHING':
      return scale(phase.direction, phase.speed);
    case 'KNOCKBACK':
      return { x: phase.velocity.x, y: phase.velocity.y };
    case 'STUNNED':
      return { ...ZERO };
    default:
      return inputVelocity(ctx, player, input, phase);
  }
}

function inputVelocity(
  ctx: SimulationContext,
  player: PlayerState,
  input: PlayerInput | undefined,
  phase: CombatPhaseState,
): Vec2 {
  const allowedWhileCasting =
    phase.kind === 'CASTING' && ctx.abilities.get(phase.abilityId).canMoveWhileCasting;
  if (input === undefined || !controlsMovement(player, allowedWhileCasting)) return { ...ZERO };
  const direction = clampLength(input.move, 1);
  if (isZero(direction)) return { ...ZERO };
  const speed =
    player.stats.moveSpeed *
    statusSpeedMultiplier(player) *
    ctx.map.terrainAt(player.position).speedMultiplier;
  return scale(direction, speed);
}

function moveBy(position: Vec2, velocity: Vec2, dt: number): Vec2 {
  return { x: position.x + velocity.x * dt, y: position.y + velocity.y * dt };
}

function clampToMap(map: LoadedMap, position: Vec2, radius: number): Vec2 {
  return {
    x: Math.min(map.widthInUnits - radius, Math.max(radius, position.x)),
    y: Math.min(map.heightInUnits - radius, Math.max(radius, position.y)),
  };
}

function settle(ctx: SimulationContext, desired: Vec2, radius: number): Vec2 {
  const inside = clampToMap(ctx.map, desired, radius);
  return resolveCircleAgainstShapes(
    inside,
    radius,
    collidersNear(ctx, circleBounds(inside, radius)),
  );
}

function separatePlayers(ctx: SimulationContext, moved: readonly MovedPlayer[]): void {
  for (let i = 0; i < moved.length; i++) {
    for (let j = i + 1; j < moved.length; j++) {
      const a = moved[i]?.player;
      const b = moved[j]?.player;
      if (a === undefined || b === undefined) continue;
      const separated = separateCircles(
        a.position,
        a.stats.colliderRadius,
        b.position,
        b.stats.colliderRadius,
      );
      if (separated === null) continue;
      a.position = settle(ctx, separated.a, a.stats.colliderRadius);
      b.position = settle(ctx, separated.b, b.stats.colliderRadius);
    }
  }
}
