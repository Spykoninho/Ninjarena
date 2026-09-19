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
};

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
      return `tire un projectile${onHit(effect.onHit)}${expiry(effect.onExpire)}`;
    case 'area':
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
  if (effect.status === 'SLOWED') {
    const ratio =
      effect.magnitude === undefined ? '' : `de ${Math.round(effect.magnitude * PERCENT)} % `;
    return `ralentit ${ratio}pendant ${duration}`;
  }
  return `${STATUS_NAMES[effect.status]} pendant ${duration}`;
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
