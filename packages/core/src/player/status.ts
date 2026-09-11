import type { StatusEffectType } from '../definitions';
import type { Tick } from '../simulation/ids';
import type { PlayerState } from './state';

export interface StatusEffect {
  type: StatusEffectType;
  expiresAt: Tick;
  magnitude?: number;
}

export function hasStatus(player: PlayerState, type: StatusEffectType): boolean {
  return getStatus(player, type) !== undefined;
}

export function getStatus(player: PlayerState, type: StatusEffectType): StatusEffect | undefined {
  return player.statuses.find((status) => status.type === type);
}

export function upsertStatus(player: PlayerState, effect: StatusEffect): void {
  const existing = getStatus(player, effect.type);
  if (existing === undefined) {
    const created: StatusEffect = { type: effect.type, expiresAt: effect.expiresAt };
    if (effect.magnitude !== undefined) created.magnitude = effect.magnitude;
    player.statuses.push(created);
    return;
  }
  // Le refresh garde la fin la plus lointaine mais adopte la magnitude de la nouvelle application.
  existing.expiresAt = Math.max(existing.expiresAt, effect.expiresAt);
  if (effect.magnitude === undefined) delete existing.magnitude;
  else existing.magnitude = effect.magnitude;
}

export function removeExpiredStatuses(player: PlayerState, now: Tick): StatusEffectType[] {
  const expired: StatusEffectType[] = [];
  const kept: StatusEffect[] = [];
  for (const status of player.statuses) {
    if (status.expiresAt <= now) expired.push(status.type);
    else kept.push(status);
  }
  if (expired.length > 0) player.statuses = kept;
  return expired;
}
