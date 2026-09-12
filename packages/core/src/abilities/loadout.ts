import type { AbilityDefinition, CharacterDefinition, StatRulesDefinition } from '../definitions';
import type { DefinitionCatalog } from '../simulation/catalog';

export type LoadoutValidation =
  { ok: true; techniqueIds: string[] } | { ok: false; reason: string };

export function validateLoadout(
  raw: unknown,
  abilities: DefinitionCatalog<AbilityDefinition>,
  rules: StatRulesDefinition,
): LoadoutValidation {
  if (!Array.isArray(raw)) return { ok: false, reason: 'loadout must be a list of ability ids' };
  if (raw.length !== rules.techniqueSlots) {
    return { ok: false, reason: `loadout must hold exactly ${rules.techniqueSlots} techniques` };
  }
  const techniqueIds: string[] = [];
  for (const entry of raw as readonly unknown[]) {
    if (typeof entry !== 'string') return { ok: false, reason: 'every technique must be an id' };
    if (techniqueIds.includes(entry)) return { ok: false, reason: `"${entry}" is picked twice` };
    if (!abilities.has(entry)) return { ok: false, reason: `unknown ability "${entry}"` };
    if (abilities.get(entry).kind !== 'technique') {
      return { ok: false, reason: `"${entry}" is not a technique` };
    }
    techniqueIds.push(entry);
  }
  return { ok: true, techniqueIds };
}

export function loadoutAbilityIds(
  character: CharacterDefinition,
  techniqueIds: readonly string[],
): string[] {
  // L'ordre des slots est figé: attaque de base, esquive, puis les techniques choisies.
  return [character.basicAttackId, character.dashId, ...techniqueIds];
}
