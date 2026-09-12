import type {
  AbilityDefinition,
  AttributeId,
  Build,
  DefinitionCatalog,
  StatRulesDefinition,
} from '@ninjarena/core';
import { ATTRIBUTE_IDS, buildPointsSpent, emptyBuild } from '@ninjarena/core';
import type { ClientConfig } from '../config/clientConfig';

const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 24;

export interface SetupState {
  name: string;
  build: Build;
  techniqueIds: (string | null)[];
}

export interface TechniqueOption {
  id: string;
  name: string;
  chakraCost: number;
  cooldownMs: number;
}

export function createSetupState(
  config: ClientConfig,
  rules: StatRulesDefinition,
  options: TechniqueOption[],
): SetupState {
  const build = emptyBuild();
  for (const id of ATTRIBUTE_IDS) {
    const range = rules.attributes[id];
    const requested = config.build[id] ?? range.min;
    build[id] = clamp(requested, range.min, range.max);
  }
  reduceToBudget(build, rules, rules.defaultPointBudget);
  return {
    name: config.playerName,
    build,
    techniqueIds: fillTechniques(config.techniqueIds, options, rules.techniqueSlots),
  };
}

export function pointsLeft(state: SetupState, rules: StatRulesDefinition, budget: number): number {
  return budget - buildPointsSpent(state.build);
}

export function setAttribute(
  state: SetupState,
  attribute: AttributeId,
  value: number,
  rules: StatRulesDefinition,
  budget: number,
): SetupState {
  const range = rules.attributes[attribute];
  const requested = clamp(Math.round(value), range.min, range.max);
  const spentByOthers = buildPointsSpent(state.build) - state.build[attribute];
  const maxByBudget = budget - spentByOthers;
  const finalValue = Math.max(range.min, Math.min(requested, maxByBudget));
  return { ...state, build: { ...state.build, [attribute]: finalValue } };
}

export function setTechnique(
  state: SetupState,
  slot: number,
  id: string,
  options: TechniqueOption[],
): SetupState {
  if (!options.some((option) => option.id === id)) return state;
  const techniqueIds = [...state.techniqueIds];
  const existingSlot = techniqueIds.indexOf(id);
  if (existingSlot !== -1 && existingSlot !== slot) {
    techniqueIds[existingSlot] = techniqueIds[slot] ?? null;
  }
  techniqueIds[slot] = id;
  return { ...state, techniqueIds };
}

export function setupErrors(
  state: SetupState,
  rules: StatRulesDefinition,
  budget: number,
  options: TechniqueOption[],
): string[] {
  const errors: string[] = [];
  const trimmedName = state.name.trim();
  if (trimmedName.length < NAME_MIN_LENGTH || trimmedName.length > NAME_MAX_LENGTH) {
    errors.push(`name must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters`);
  }
  const spent = buildPointsSpent(state.build);
  if (spent > budget) {
    errors.push(`build spends ${spent} points, budget is ${budget}`);
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

export interface PlayAvailability {
  errors: string[];
  disabled: boolean;
}

// Le bouton reste verrouillé pendant la poignée de main: un second clic ouvrirait une seconde socket.
export function playAvailability(
  state: SetupState,
  rules: StatRulesDefinition,
  budget: number,
  options: TechniqueOption[],
  connecting: boolean,
): PlayAvailability {
  const errors = setupErrors(state, rules, budget, options);
  return { errors, disabled: connecting || errors.length > 0 };
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
