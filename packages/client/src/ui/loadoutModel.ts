import type {
  AbilityDefinition,
  AttributeId,
  Build,
  DefinitionCatalog,
  Loadout,
  StatRulesDefinition,
} from '@ninjarena/core';
import { ATTRIBUTE_IDS, buildPointsSpent, emptyBuild } from '@ninjarena/core';
import type { ClientConfig } from '../config/clientConfig';

// L'état que le panneau du salon manipule: le nom vit sur l'écran d'accueil.
export interface LoadoutState {
  build: Build;
  basicAttackId: string | null;
  techniqueIds: (string | null)[];
}

export interface BasicOption {
  id: string;
  name: string;
}

export interface TechniqueOption {
  id: string;
  name: string;
  chakraCost: number;
  cooldownMs: number;
}

export function createLoadoutState(
  config: ClientConfig,
  rules: StatRulesDefinition,
  techniques: TechniqueOption[],
  basics: BasicOption[],
  budget: number,
): LoadoutState {
  const build = emptyBuild();
  for (const id of ATTRIBUTE_IDS) {
    const range = rules.attributes[id];
    const requested = config.build[id] ?? range.min;
    build[id] = clamp(requested, range.min, range.max);
  }
  reduceToBudget(build, rules, budget);
  return {
    build,
    basicAttackId: pickBasic(config.basicAttackId, basics),
    techniqueIds: fillTechniques(config.techniqueIds, techniques, rules.techniqueSlots),
  };
}

export function toLoadout(state: LoadoutState): Loadout | null {
  const { basicAttackId } = state;
  if (basicAttackId === null) return null;
  const techniqueIds: string[] = [];
  for (const id of state.techniqueIds) {
    if (id === null) return null;
    techniqueIds.push(id);
  }
  return { build: { ...state.build }, basicAttackId, techniqueIds };
}

export function pointsLeft(state: LoadoutState, budget: number): number {
  return budget - buildPointsSpent(state.build);
}

export function setAttribute(
  state: LoadoutState,
  attribute: AttributeId,
  value: number,
  rules: StatRulesDefinition,
  budget: number,
): LoadoutState {
  const range = rules.attributes[attribute];
  const requested = clamp(Math.round(value), range.min, range.max);
  const spentByOthers = buildPointsSpent(state.build) - state.build[attribute];
  const maxByBudget = budget - spentByOthers;
  const finalValue = Math.max(range.min, Math.min(requested, maxByBudget));
  return { ...state, build: { ...state.build, [attribute]: finalValue } };
}

export function setTechnique(
  state: LoadoutState,
  slot: number,
  id: string,
  options: TechniqueOption[],
): LoadoutState {
  if (!options.some((option) => option.id === id)) return state;
  const techniqueIds = [...state.techniqueIds];
  const existingSlot = techniqueIds.indexOf(id);
  if (existingSlot !== -1 && existingSlot !== slot) {
    techniqueIds[existingSlot] = techniqueIds[slot] ?? null;
  }
  techniqueIds[slot] = id;
  return { ...state, techniqueIds };
}

export function loadoutErrors(
  state: LoadoutState,
  rules: StatRulesDefinition,
  budget: number,
  options: TechniqueOption[],
): string[] {
  const errors: string[] = [];
  const spent = buildPointsSpent(state.build);
  if (spent > budget) {
    errors.push(`build spends ${spent} points, budget is ${budget}`);
  }
  if (state.basicAttackId === null) {
    errors.push('a basic attack must be selected');
  }
  if (state.techniqueIds.length !== rules.techniqueSlots) {
    errors.push(`exactly ${rules.techniqueSlots} techniques are required`);
  }
  const validIds = new Set(options.map((option) => option.id));
  if (state.techniqueIds.some((id) => id === null || !validIds.has(id))) {
    errors.push('every technique slot must have a technique selected');
  } else if (new Set(state.techniqueIds).size !== state.techniqueIds.length) {
    errors.push('techniques must be distinct');
  }
  return errors;
}

export function techniqueOptions(
  abilities: DefinitionCatalog<AbilityDefinition>,
): TechniqueOption[] {
  return abilities
    .all()
    .filter((ability) => ability.kind === 'technique')
    .map((ability) => ({
      id: ability.id,
      name: ability.name,
      chakraCost: ability.chakraCost,
      cooldownMs: ability.cooldownMs,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function basicOptions(abilities: DefinitionCatalog<AbilityDefinition>): BasicOption[] {
  return abilities
    .all()
    .filter((ability) => ability.kind === 'basic')
    .map((ability) => ({ id: ability.id, name: ability.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function pickBasic(requested: string | null, basics: BasicOption[]): string | null {
  if (requested !== null && basics.some((basic) => basic.id === requested)) return requested;
  return basics[0]?.id ?? null;
}

function fillTechniques(
  requested: string[],
  options: TechniqueOption[],
  slots: number,
): (string | null)[] {
  const ids = options.map((option) => option.id);
  const used = new Set<string>();
  const result: (string | null)[] = [];
  for (let slot = 0; slot < slots; slot++) {
    const candidate = requested[slot];
    if (candidate !== undefined && ids.includes(candidate) && !used.has(candidate)) {
      result.push(candidate);
      used.add(candidate);
    } else {
      result.push(null);
    }
  }
  for (let slot = 0; slot < slots; slot++) {
    if (result[slot] !== null) continue;
    const next = ids.find((id) => !used.has(id));
    if (next === undefined) continue;
    result[slot] = next;
    used.add(next);
  }
  return result;
}

// Un dépassement de budget réduit les attributs en partant du dernier, jusqu'à retomber dans l'enveloppe.
function reduceToBudget(build: Build, rules: StatRulesDefinition, budget: number): void {
  let spent = buildPointsSpent(build);
  for (let i = ATTRIBUTE_IDS.length - 1; i >= 0 && spent > budget; i--) {
    const id = ATTRIBUTE_IDS[i];
    if (id === undefined) continue;
    const range = rules.attributes[id];
    const overBudget = spent - budget;
    const reducible = build[id] - range.min;
    const reduceBy = Math.min(reducible, overBudget);
    build[id] -= reduceBy;
    spent -= reduceBy;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
