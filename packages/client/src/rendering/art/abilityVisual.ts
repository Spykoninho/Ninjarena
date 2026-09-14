import type { AbilityDefinition } from '@ninjarena/core';
export function abilityFamily(ability: AbilityDefinition): string {
  const first = ability.effects[0];
  if (ability.kind === 'basic') return first?.type === 'projectile' ? 'projectile' : 'melee';
  if (first?.type === 'shield') return 'defense';
  if (first?.type === 'teleport') return 'teleport';
  if (first?.type === 'dash') return 'dash';
  if (first?.type === 'delayedTrigger') return 'trap';
  if (first?.type === 'spawnEntity') return 'wall';
  if (first?.type === 'area') return 'area';
  if (ability.tags.includes('control')) return 'control';
  return first?.type ?? 'projectile';
}
