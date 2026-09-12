import type { AbilityDefinition, Effect } from '../definitions';

export type EffectListName = 'onHit' | 'onExpire' | 'onContact' | 'effects';

export interface EffectRef {
  abilityId: string;
  path: string;
}

export function rootPath(index: number): string {
  return `${index}`;
}

export function childPath(parent: string, list: EffectListName, index: number): string {
  // Un effet de premier niveau s'adresse par son seul index: il n'a pas de liste parente.
  if (parent === '') throw new Error('a top-level effect has no parent list');
  return `${parent}.${list}.${index}`;
}

export function resolveEffect(ability: AbilityDefinition, path: string): Effect {
  const segments = path.split('.');
  if (segments.length % 2 === 0)
    throw new Error(`malformed effect path "${path}" in "${ability.id}"`);
  let current = itemAt(ability.effects, segments[0], ability, path);
  for (let i = 1; i < segments.length; i += 2) {
    const list = namedList(current, listNameOf(segments[i], ability, path));
    if (list === undefined)
      throw new Error(`effect path "${path}" in "${ability.id}" has no such list`);
    current = itemAt(list, segments[i + 1], ability, path);
  }
  return current;
}

export function effectList(
  ability: AbilityDefinition,
  path: string,
  list: EffectListName,
): readonly Effect[] {
  // Une brique sans cette liste ne déclenche rien: le monde peut référencer un effet remanié.
  return namedList(resolveEffect(ability, path), list) ?? [];
}

function namedList(effect: Effect, list: EffectListName): readonly Effect[] | undefined {
  switch (list) {
    case 'onHit':
      return 'onHit' in effect ? effect.onHit : undefined;
    case 'onExpire':
      return effect.type === 'projectile' ? effect.onExpire : undefined;
    case 'onContact':
      return effect.type === 'dash' ? effect.onContact : undefined;
    case 'effects':
      return effect.type === 'delayedTrigger' ? effect.effects : undefined;
  }
}

const LIST_NAMES: readonly EffectListName[] = ['onHit', 'onExpire', 'onContact', 'effects'];

function listNameOf(
  segment: string | undefined,
  ability: AbilityDefinition,
  path: string,
): EffectListName {
  const name = LIST_NAMES.find((candidate) => candidate === segment);
  if (name === undefined) throw new Error(`effect path "${path}" in "${ability.id}" names no list`);
  return name;
}

function itemAt(
  effects: readonly Effect[],
  segment: string | undefined,
  ability: AbilityDefinition,
  path: string,
): Effect {
  const index = segment === undefined ? Number.NaN : Number(segment);
  const effect = Number.isInteger(index) ? effects[index] : undefined;
  if (effect === undefined)
    throw new Error(`effect path "${path}" in "${ability.id}" resolves to nothing`);
  return effect;
}
