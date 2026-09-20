import type { AbilityDefinition } from '@ninjarena/core';

// La famille dit la forme: elle choisit l'icône de repli, le télégraphe et l'accessoire tenu.
export function abilityFamily(ability: AbilityDefinition): string {
  const first = ability.effects[0];
  if (ability.kind === 'basic') return first?.type === 'projectile' ? 'projectile' : 'melee';
  if (first?.type === 'shield') return 'defense';
  if (first?.type === 'heal') return 'support';
  if (first?.type === 'applyStatus' && first.target === 'self') {
    return first.status === 'INVISIBLE' ? 'stealth' : 'haste';
  }
  if (first?.type === 'teleport') return 'teleport';
  if (first?.type === 'dash') return 'dash';
  if (first?.type === 'melee') return 'melee';
  if (first?.type === 'delayedTrigger') return 'trap';
  if (first?.type === 'spawnEntity') return 'wall';
  if (first?.type === 'area') return first.triggerRadius > 0 ? 'trap' : 'area';
  if (ability.tags.includes('control')) return 'control';
  return first?.type ?? 'projectile';
}
