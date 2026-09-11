import type { PlayerState } from './state';
import { getStatus, hasStatus } from './status';

export const DEFAULT_SLOW_MAGNITUDE = 0.5;

export function isAlive(player: PlayerState): boolean {
  return player.phase.kind !== 'DEAD';
}

export function isDamageable(player: PlayerState): boolean {
  return isAlive(player) && !hasStatus(player, 'INVULNERABLE');
}

export function canAct(player: PlayerState): boolean {
  return player.phase.kind === 'NORMAL';
}

export function controlsMovement(
  player: PlayerState,
  movementAllowedWhileCasting: boolean,
): boolean {
  const phaseAllows =
    player.phase.kind === 'NORMAL' ||
    (player.phase.kind === 'CASTING' && movementAllowedWhileCasting);
  return phaseAllows && !hasStatus(player, 'ROOTED');
}

export function statusSpeedMultiplier(player: PlayerState): number {
  const slowed = getStatus(player, 'SLOWED');
  if (slowed === undefined) return 1;
  return slowed.magnitude ?? DEFAULT_SLOW_MAGNITUDE;
}

export function isVisibleTo(player: PlayerState, viewer: PlayerState): boolean {
  if (!hasStatus(player, 'INVISIBLE')) return true;
  return player.id === viewer.id || player.teamId === viewer.teamId;
}
