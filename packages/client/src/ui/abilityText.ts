import type { AbilityDefinition, DamageScaling, Effect, StatusEffectType } from '@ninjarena/core';

const MS_PER_SECOND = 1000;
const UNITS_PER_TILE = 16;
const PERCENT = 100;

const TERRAIN_NAMES: Record<string, string> = { grass: 'l’herbe', water: 'l’eau' };
const STATUS_NAMES: Record<StatusEffectType, string> = {
  ROOTED: 'immobilise',
  SLOWED: 'ralentit',
  INVISIBLE: 'rend invisible',
  INVULNERABLE: 'rend invulnérable',
  SHIELDED: 'protège',
  HASTED: 'accélère',
};
const SELF_STATUS_NAMES: Record<StatusEffectType, string> = {
  ROOTED: 't’immobilise',
  SLOWED: 'te ralentit',
  INVISIBLE: 'te rend invisible',
  INVULNERABLE: 'te rend invulnérable',
  SHIELDED: 'te protège',
  HASTED: 't’accélère',
};

export type DamageContext = 'hit' | 'area' | 'contact' | 'delayed';

export interface DamageEntry {
  amount: number;
  scaling: DamageScaling;
  context: DamageContext;
}

export interface DamageMultipliers {
  physical: number;
  technique: number;
}

const CONTEXT_LABELS: Record<DamageContext, string> = {
  hit: 'à l’impact',
  area: 'en zone',
  contact: 'au passage',
  delayed: 'à retardement',
};

export const BASE_MULTIPLIERS: DamageMultipliers = { physical: 1, technique: 1 };

// Les dégâts d'un seul coup réussi: la fin de course d'un projectile ne compte que s'il ne touche rien.
export function damageProfile(ability: AbilityDefinition): DamageEntry[] {
  const entries: DamageEntry[] = [];
  for (const effect of ability.effects) collectDamage(effect, 'hit', entries);
  return entries;
}

// Les soins d'un lancer: ils suivent la puissance comme les dégâts de technique.
export function healProfile(ability: AbilityDefinition): DamageEntry[] {
  const entries: DamageEntry[] = [];
  for (const effect of ability.effects) collectHeal(effect, entries);
  return entries;
}

export function damageTotal(entries: DamageEntry[], multipliers: DamageMultipliers): number {
  const total = entries.reduce(
    (sum, entry) => sum + entry.amount * multiplierOf(entry, multipliers),
    0,
  );
  return Math.round(total * 10) / 10;
}

// `34 (22 à l’impact + 12 en zone)`: le total scellé par la répartition, puis d'où il vient.
export function damageDetail(entries: DamageEntry[], multipliers: DamageMultipliers): string {
  if (entries.length === 0) return '';
  const total = damageTotal(entries, multipliers);
  if (entries.length === 1) return String(total);
  const parts = entries.map(
    (entry) =>
      `${tenth(entry.amount * multiplierOf(entry, multipliers))} ${CONTEXT_LABELS[entry.context]}`,
  );
  return `${total} (${parts.join(' + ')})`;
}

function tenth(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function multiplierOf(entry: DamageEntry, multipliers: DamageMultipliers): number {
  if (entry.scaling === 'physical') return multipliers.physical;
  return entry.scaling === 'technique' ? multipliers.technique : 1;
}

function collectDamage(effect: Effect, context: DamageContext, entries: DamageEntry[]): void {
  switch (effect.type) {
    case 'damage':
      entries.push({ amount: effect.amount, scaling: effect.scaling, context });
      return;
    case 'projectile': {
      const before = entries.length;
      for (const child of effect.onHit) collectDamage(child, 'hit', entries);
      if (entries.length === before)
        for (const child of effect.onExpire) collectDamage(child, 'area', entries);
      return;
    }
    case 'area':
      for (const child of effect.onHit) collectDamage(child, 'area', entries);
      return;
    case 'melee':
      for (const child of effect.onHit) collectDamage(child, 'hit', entries);
      return;
    case 'dash':
      for (const child of effect.onContact) collectDamage(child, 'contact', entries);
      return;
    case 'delayedTrigger':
      for (const child of effect.effects) collectDamage(child, 'delayed', entries);
      return;
    default:
      return;
  }
}

function collectHeal(effect: Effect, entries: DamageEntry[]): void {
  switch (effect.type) {
    case 'heal':
      entries.push({ amount: effect.amount, scaling: effect.scaling, context: 'hit' });
      return;
    case 'projectile':
      for (const child of effect.onHit) collectHeal(child, entries);
      return;
    case 'area':
    case 'melee':
      for (const child of effect.onHit) collectHeal(child, entries);
      return;
    case 'dash':
      for (const child of effect.onContact) collectHeal(child, entries);
      return;
    case 'delayedTrigger':
      for (const child of effect.effects) collectHeal(child, entries);
      return;
    default:
      return;
  }
}

// Un texte rédigé dans le fichier de la technique prime; sinon l'arbre d'effets se raconte lui-même.
export function describeAbility(ability: AbilityDefinition): string {
  if (ability.description !== undefined) return ability.description;
  const sentences = ability.effects.map((effect) => capitalize(describeEffect(effect)));
  return `${sentences.join('. ')}.`;
}

export function abilityFacts(ability: AbilityDefinition): string {
  const cost = ability.chakraCost > 0 ? `${ability.chakraCost} chakra` : 'sans chakra';
  const facts = [cost, `${seconds(ability.cooldownMs)} s de recharge`];
  if (ability.startupMs > 0) facts.push(`${seconds(ability.startupMs)} s d’incantation`);
  return facts.join(' · ');
}

function describeEffect(effect: Effect): string {
  switch (effect.type) {
    case 'projectile':
      return `tire ${projectiles(effect.count)}${onHit(effect.onHit)}${expiry(effect.onExpire)}`;
    case 'area':
      if (effect.triggerRadius > 0) {
        return `arme une mine${where(effect)} qui explose au passage d’un ennemi ou après ${seconds(effect.delayMs)} s sur ${tiles(effect.radius)} cases${onHit(effect.onHit)}`;
      }
      return `${delay(effect.delayMs)}frappe une zone de ${tiles(effect.radius)} cases${where(effect)}${onHit(effect.onHit)}`;
    case 'dash':
      return `fonce sur ${tiles(effect.distance)} cases${contact(effect.onContact)}`;
    case 'melee':
      return `frappe à ${tiles(effect.range)} cases devant, sur un arc de ${effect.arcDegrees}°${onHit(effect.onHit)}`;
    case 'teleport':
      return `te téléporte de ${tiles(effect.distance)} cases vers la visée`;
    case 'spawnEntity':
      return `dresse un mur de ${tiles(effect.width)} cases de large pendant ${seconds(effect.lifetimeMs)} s`;
    case 'shield':
      return `absorbe ${effect.amount} dégâts pendant ${seconds(effect.durationMs)} s`;
    case 'heal':
      return `rend ${effect.amount} points de vie${effect.scaling === 'technique' ? ' (renforcés par la puissance)' : ''}`;
    case 'delayedTrigger':
      return `après ${seconds(effect.delayMs)} s, ${list(effect.effects)}`;
    case 'damage':
      return `${effect.amount} dégâts${scalingLabel(effect.scaling)}${terrain(effect.terrain)}`;
    case 'knockback':
      return 'repousse';
    case 'stun':
      return `étourdit ${seconds(effect.durationMs)} s`;
    case 'applyStatus':
      return status(effect);
  }
}

function onHit(effects: Effect[]): string {
  return effects.length === 0 ? '' : ` ; à l’impact, ${list(effects)}`;
}

function contact(effects: Effect[]): string {
  return effects.length === 0 ? '' : ` ; quiconque est traversé subit ${list(effects)}`;
}

function expiry(effects: Effect[]): string {
  return effects.length === 0 ? '' : ` ; en fin de course, ${list(effects)}`;
}

function where(effect: Extract<Effect, { type: 'area' }>): string {
  if (effect.origin === 'aim') return ` à la visée (jusqu’à ${tiles(effect.range)} cases)`;
  return effect.origin === 'caster' ? ' autour de toi' : '';
}

function delay(delayMs: number): string {
  return delayMs > 0 ? `après ${seconds(delayMs)} s, ` : '';
}

function terrain(rules: { tag: string; damageMultiplier?: number }[]): string {
  const notes = rules
    .filter((rule) => rule.damageMultiplier !== undefined)
    .map((rule) => `×${rule.damageMultiplier} sur ${terrainName(rule.tag)}`);
  return notes.length === 0 ? '' : ` (${notes.join(', ')})`;
}

function status(effect: Extract<Effect, { type: 'applyStatus' }>): string {
  const duration = `${seconds(effect.durationMs)} s`;
  const self = effect.target === 'self';
  if (effect.status === 'SLOWED') {
    const ratio =
      effect.magnitude === undefined ? '' : `de ${Math.round(effect.magnitude * PERCENT)} % `;
    return `${self ? 'te ralentit' : 'ralentit'} ${ratio}pendant ${duration}`;
  }
  if (effect.status === 'HASTED') {
    const ratio =
      effect.magnitude === undefined ? '' : `de ${Math.round((effect.magnitude - 1) * PERCENT)} % `;
    return `${self ? 't’accélère' : 'accélère'} ${ratio}pendant ${duration}`;
  }
  return `${self ? SELF_STATUS_NAMES[effect.status] : STATUS_NAMES[effect.status]} pendant ${duration}`;
}

function projectiles(count: number): string {
  return count > 1 ? `${count} projectiles en éventail` : 'un projectile';
}

function scalingLabel(scaling: DamageScaling): string {
  if (scaling === 'physical') return ' physiques';
  return scaling === 'technique' ? ' de technique' : '';
}

function terrainName(tag: string): string {
  return TERRAIN_NAMES[tag] ?? tag;
}

function list(effects: Effect[]): string {
  return effects.map(describeEffect).join(', ');
}

function tiles(units: number): string {
  return trim(units / UNITS_PER_TILE);
}

function seconds(ms: number): string {
  return trim(ms / MS_PER_SECOND);
}

// `4` plutôt que `4.00`, mais `0.25` reste entier de sens: deux décimales au plus.
function trim(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
