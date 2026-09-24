import { isVisibleTo } from '@ninjarena/core';
import type { AbilityDefinition, DefinitionCatalog, PlayerState, Vec2 } from '@ninjarena/core';
import { aimShapeOf } from '../input/touchAim';
import type { TouchSlot } from '../input/touchInput';
import type { InterpolatedWorld } from '../netcode/snapshotInterpolator';

export function touchSlots(
  player: PlayerState | undefined,
  abilities: DefinitionCatalog<AbilityDefinition>,
): TouchSlot[] {
  return (player?.abilities ?? []).map((slot) => {
    const ability = abilities.get(slot.abilityId);
    return { shape: aimShapeOf(ability), startupMs: ability.startupMs };
  });
}

// La visée assistée ne connaît que les ennemis dessinés: vivants, et visibles pour le joueur local.
export function visibleEnemies(
  local: PlayerState | undefined,
  remotes: InterpolatedWorld | null,
): Vec2[] {
  if (local === undefined) return [];
  const enemies: Vec2[] = [];
  for (const remote of Object.values(remotes?.players ?? {})) {
    if (remote.id === local.id || remote.teamId === local.teamId) continue;
    if (remote.phase.kind === 'DEAD' || !isVisibleTo(remote, local)) continue;
    enemies.push(remote.renderPosition);
  }
  return enemies;
}
