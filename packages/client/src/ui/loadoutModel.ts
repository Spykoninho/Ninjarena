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
import type { InputBindings } from '../input/bindings';
import { bindingLabel } from '../input/bindings';
import { abilityFamily } from '../rendering/art/abilityVisual';
import { abilityFacts, describeAbility } from './abilityText';

// L'état que le panneau du salon manipule: le nom vit sur l'écran d'accueil.
export interface LoadoutState {
  build: Build;
  basicAttackId: string | null;
  techniqueIds: (string | null)[];
}

// Tout ce qu'une carte d'attaque affiche, calculé une fois à partir de la définition.
export interface AbilityOption {
  id: string;
  name: string;
  family: string;
  chakraCost: number;
  cooldownMs: number;
  description: string;
  facts: string;
}

export type BasicOption = AbilityOption;
export type TechniqueOption = AbilityOption;

// Les touches que le salon affiche sur les cartes: l'attaque de base, l'esquive, puis une par technique.
export interface SlotBindings {
  basic: string;
  dash: string;
  techniques: string[];
}

const FIXED_SLOTS = 2;

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
    errors.push(`la répartition dépense ${spent} points pour un budget de ${budget}`);
  }
  if (state.basicAttackId === null) {
    errors.push('une attaque de base doit être choisie');
  }
  if (state.techniqueIds.length !== rules.techniqueSlots) {
    errors.push(`il faut exactement ${rules.techniqueSlots} techniques`);
  }
  const validIds = new Set(options.map((option) => option.id));
  if (state.techniqueIds.some((id) => id === null || !validIds.has(id))) {
    errors.push('chaque emplacement de technique doit être rempli');
  } else if (new Set(state.techniqueIds).size !== state.techniqueIds.length) {
    errors.push('chaque technique ne peut être choisie qu’une fois');
  }
  return errors;
}

export function techniqueOptions(
  abilities: DefinitionCatalog<AbilityDefinition>,
): TechniqueOption[] {
  return optionsOfKind(abilities, 'technique');
}

export function basicOptions(abilities: DefinitionCatalog<AbilityDefinition>): BasicOption[] {
  return optionsOfKind(abilities, 'basic');
}

export function abilityOption(ability: AbilityDefinition): AbilityOption {
  return {
    id: ability.id,
    name: ability.name,
    family: abilityFamily(ability),
    chakraCost: ability.chakraCost,
    cooldownMs: ability.cooldownMs,
    description: describeAbility(ability),
    facts: abilityFacts(ability),
  };
}

export function slotBindings(bindings: InputBindings, techniqueSlots: number): SlotBindings {
  const [basic, dash, ...rest] = bindings.abilities;
  const techniques: string[] = [];
  for (let slot = 0; slot < techniqueSlots; slot++) {
    const binding = rest[slot];
    techniques.push(binding === undefined ? `${slot + FIXED_SLOTS + 1}` : bindingLabel(binding));
  }
  return { basic: bindingLabel(basic), dash: bindingLabel(dash), techniques };
}

function optionsOfKind(
  abilities: DefinitionCatalog<AbilityDefinition>,
  kind: AbilityDefinition['kind'],
): AbilityOption[] {
  return abilities
    .all()
    .filter((ability) => ability.kind === kind)
    .map(abilityOption)
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
