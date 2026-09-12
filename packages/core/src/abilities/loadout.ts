import type { AbilityDefinition, CharacterDefinition, StatRulesDefinition } from '../definitions';
import type { DefinitionCatalog } from '../simulation/catalog';
import type { Build } from '../stats';
import { validateBuild } from '../stats';

export interface Loadout {
  build: Build;
  basicAttackId: string;
  techniqueIds: string[];
}

export type LoadoutValidation = { ok: true; loadout: Loadout } | { ok: false; reason: string };

export function validateLoadout(
  raw: unknown,
  abilities: DefinitionCatalog<AbilityDefinition>,
  rules: StatRulesDefinition,
  budget: number,
): LoadoutValidation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'loadout must be an object' };
  }
  const entries = raw as Record<string, unknown>;
  const keys = Object.keys(entries).sort();
  const expectedKeys = ['basicAttackId', 'build', 'techniqueIds'];
  if (keys.length !== expectedKeys.length || keys.some((key, i) => key !== expectedKeys[i])) {
    return { ok: false, reason: 'loadout must have build, basicAttackId and techniqueIds' };
  }

  const build = validateBuild(entries.build, rules, budget);
  if (!build.ok) return { ok: false, reason: build.reason };

  const basicAttackId = entries.basicAttackId;
  if (typeof basicAttackId !== 'string') {
    return { ok: false, reason: 'basicAttackId must be an id' };
  }
  if (!abilities.has(basicAttackId)) {
    return { ok: false, reason: `unknown ability "${basicAttackId}"` };
  }
  if (abilities.get(basicAttackId).kind !== 'basic') {
    return { ok: false, reason: `"${basicAttackId}" is not a basic attack` };
  }

  const rawTechniqueIds = entries.techniqueIds;
  if (!Array.isArray(rawTechniqueIds)) {
    return { ok: false, reason: 'techniqueIds must be a list of ability ids' };
  }
  if (rawTechniqueIds.length !== rules.techniqueSlots) {
    return { ok: false, reason: `loadout must hold exactly ${rules.techniqueSlots} techniques` };
  }
  const techniqueIds: string[] = [];
  for (const entry of rawTechniqueIds as readonly unknown[]) {
    if (typeof entry !== 'string') return { ok: false, reason: 'every technique must be an id' };
    if (techniqueIds.includes(entry)) return { ok: false, reason: `"${entry}" is picked twice` };
    if (!abilities.has(entry)) return { ok: false, reason: `unknown ability "${entry}"` };
    if (abilities.get(entry).kind !== 'technique') {
      return { ok: false, reason: `"${entry}" is not a technique` };
    }
    techniqueIds.push(entry);
  }

  return { ok: true, loadout: { build: build.build, basicAttackId, techniqueIds } };
}

export function loadoutAbilityIds(
  character: CharacterDefinition,
  loadout: Pick<Loadout, 'basicAttackId' | 'techniqueIds'>,
): string[] {
  // L'ordre des slots est figé: attaque de base, esquive, puis les techniques choisies.
  return [loadout.basicAttackId, character.dashId, ...loadout.techniqueIds];
}
