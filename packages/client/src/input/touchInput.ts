import { distance, isZero, length, normalize, sub } from '@ninjarena/core';
import type {
  AbilityDefinition,
  DefinitionCatalog,
  PlayerId,
  PlayerInput,
  Vec2,
  WorldState,
} from '@ninjarena/core';
import type { AimShape } from './touchAim';
import { SELF_AIM, assistRange } from './touchAim';

export interface TouchSlot {
  shape: AimShape;
  startupMs: number;
}

export interface AimDrag {
  direction: Vec2 | null;
  // Part du rayon de visée parcourue hors de la zone morte, de 0 à 1.
  reach: number;
}

// Un bouton tenu ou relâché: sans direction, c'est une frappe sèche que le jeu vise lui-même.
export interface TouchAim extends AimDrag {
  slot: number;
}

interface PendingFire extends TouchAim {
  waitedTicks: number;
}

// Un tir en cours d'envoi: un tick pour se tourner, l'appui, puis la visée tenue jusqu'au départ du coup.
interface TouchCast {
  slot: number;
  aim: Vec2;
  aimDistance: number | undefined;
  tick: number;
  lockTicks: number;
}

export interface TouchState {
  move: Vec2;
  aiming: TouchAim | null;
  fire: PendingFire | null;
  slots: TouchSlot[];
  facing: Vec2;
  cast: TouchCast | null;
}

export interface TouchContext {
  position: Vec2;
  enemies: readonly Vec2[];
  // Masque des emplacements que la simulation accepterait au prochain tick.
  ready: number;
  tickMs: number;
}

// L'appui dure quelques ticks: une entrée perdue en route ne fait pas perdre le coup.
const PRESS_TICKS = 3;
const LOCK_MARGIN_TICKS = 2;
// Un tir demandé pendant une autre action attend qu'elle finisse, pas plus longtemps.
const BUFFER_MS = 250;

export function createTouchState(): TouchState {
  return {
    move: { x: 0, y: 0 },
    aiming: null,
    fire: null,
    slots: [],
    facing: { x: 1, y: 0 },
    cast: null,
  };
}

export function resetTouchState(state: TouchState): void {
  state.move = { x: 0, y: 0 };
  state.aiming = null;
  state.fire = null;
  state.cast = null;
}

export function queueFire(state: TouchState, fire: TouchAim): void {
  state.fire = { ...fire, waitedTicks: 0 };
}

export function stickVector(offset: Vec2, deadZone: number): Vec2 {
  return length(offset) < deadZone ? { x: 0, y: 0 } : normalize(offset);
}

export function aimDrag(offset: Vec2, radius: number, deadZone: number): AimDrag {
  const dragged = length(offset);
  if (dragged < deadZone) return { direction: null, reach: 0 };
  return {
    direction: normalize(offset),
    reach: clamp01((dragged - deadZone) / Math.max(1, radius - deadZone)),
  };
}

export function touchPlayerInput(state: TouchState, context: TouchContext): PlayerInput {
  startPendingFire(state, context);
  const cast = state.cast;
  const { aim, aimDistance } = cast ?? freeAim(state);
  let abilityHeld = 0;
  if (cast !== null) {
    // Le premier tick ne fait que tourner le joueur: le coup part ensuite dans la bonne direction.
    if (cast.tick >= 1 && cast.tick <= PRESS_TICKS) abilityHeld = 1 << cast.slot;
    cast.tick += 1;
    if (cast.tick > cast.lockTicks) state.cast = null;
  }
  state.facing = aim;
  return {
    move: { ...state.move },
    aim,
    ...(aimDistance === undefined ? {} : { aimDistance }),
    abilityHeld,
  };
}

export function readySlots(
  world: WorldState,
  playerId: PlayerId,
  abilities: DefinitionCatalog<AbilityDefinition>,
): number {
  const player = world.players[playerId];
  if (player === undefined || world.match.phase !== 'IN_ROUND') return 0;
  if (player.phase.kind !== 'NORMAL') return 0;
  let mask = 0;
  player.abilities.forEach((slot, index) => {
    const ability = abilities.get(slot.abilityId);
    if (slot.readyAt <= world.tick && player.chakra >= ability.chakraCost) mask |= 1 << index;
  });
  return mask;
}

function startPendingFire(state: TouchState, context: TouchContext): void {
  const fire = state.fire;
  if (fire === null) return;
  // Une visée tenue jusqu'au départ du coup précédent ne se laisse pas détourner.
  if (state.cast === null && (context.ready & (1 << fire.slot)) !== 0) {
    state.fire = null;
    state.cast = castOf(fire, state, context);
    return;
  }
  fire.waitedTicks += 1;
  if (fire.waitedTicks * context.tickMs > BUFFER_MS) state.fire = null;
}

function castOf(fire: TouchAim, state: TouchState, context: TouchContext): TouchCast {
  const slot = state.slots[fire.slot];
  const shape = slot?.shape ?? SELF_AIM;
  const startupTicks = Math.ceil((slot?.startupMs ?? 0) / context.tickMs);
  const cast = {
    slot: fire.slot,
    tick: 0,
    lockTicks: PRESS_TICKS + startupTicks + LOCK_MARGIN_TICKS,
  };
  if (fire.direction !== null) {
    return { ...cast, aim: fire.direction, aimDistance: dragDistance(shape, fire.reach) };
  }
  const target = nearestEnemy(context, assistRange(shape));
  const toward = target === null ? null : sub(target, context.position);
  if (toward === null || isZero(toward)) {
    return { ...cast, aim: restingAim(state), aimDistance: undefined };
  }
  return { ...cast, aim: normalize(toward), aimDistance: targetDistance(shape, length(toward)) };
}

function freeAim(state: TouchState): { aim: Vec2; aimDistance: number | undefined } {
  const aiming = state.aiming;
  if (aiming === null || aiming.direction === null) {
    return { aim: restingAim(state), aimDistance: undefined };
  }
  const shape = state.slots[aiming.slot]?.shape ?? SELF_AIM;
  return { aim: aiming.direction, aimDistance: dragDistance(shape, aiming.reach) };
}

function restingAim(state: TouchState): Vec2 {
  return isZero(state.move) ? state.facing : normalize(state.move);
}

// Seule une zone posée sous le doigt a besoin d'une distance; sans elle, le coup part à pleine portée.
function dragDistance(shape: AimShape, reach: number): number | undefined {
  return shape.kind === 'area' && shape.free ? reach * shape.range : undefined;
}

function targetDistance(shape: AimShape, toTarget: number): number | undefined {
  return shape.kind === 'area' && shape.free ? Math.min(shape.range, toTarget) : undefined;
}

function nearestEnemy(context: TouchContext, range: number | null): Vec2 | null {
  if (range === null) return null;
  let nearest: Vec2 | null = null;
  let nearestDistance = range;
  for (const enemy of context.enemies) {
    const away = distance(enemy, context.position);
    if (away > nearestDistance) continue;
    nearest = enemy;
    nearestDistance = away;
  }
  return nearest;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
