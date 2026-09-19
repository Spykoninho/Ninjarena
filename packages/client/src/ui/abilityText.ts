import type { AbilityDefinition, Effect } from '@ninjarena/core';

const MS_PER_SECOND = 1000;
const UNITS_PER_TILE = 16;
const PERCENT = 100;

// Un texte rédigé dans le fichier de la technique prime; sinon l'arbre d'effets se raconte lui-même.
export function describeAbility(ability: AbilityDefinition): string {
  if (ability.description !== undefined) return ability.description;
  const sentences = ability.effects.map((effect) => capitalize(describeEffect(effect)));
  return `${sentences.join('. ')}.`;
}

export function abilityFacts(ability: AbilityDefinition): string {
  const cost = ability.chakraCost > 0 ? `${ability.chakraCost} chakra` : 'no chakra';
  const facts = [cost, `${seconds(ability.cooldownMs)}s cooldown`];
  if (ability.startupMs > 0) facts.push(`${seconds(ability.startupMs)}s cast`);
  return facts.join(' · ');
}

function describeEffect(effect: Effect): string {
  switch (effect.type) {
    case 'projectile':
      return `fires a projectile${onHit(effect.onHit)}${expiry(effect.onExpire)}`;
    case 'area':
      return `${delay(effect.delayMs)}blasts a ${tiles(effect.radius)}-tile area${where(effect)}${onHit(effect.onHit)}`;
    case 'dash':
      return `dashes ${tiles(effect.distance)} tiles${contact(effect.onContact)}`;
    case 'melee':
      return `slashes ${tiles(effect.range)} tiles ahead in a ${effect.arcDegrees}° arc${onHit(effect.onHit)}`;
    case 'teleport':
      return `teleports ${tiles(effect.distance)} tiles toward the aim`;
    case 'spawnEntity':
      return `raises a ${tiles(effect.width)}-tile wide wall for ${seconds(effect.lifetimeMs)}s`;
    case 'shield':
      return `absorbs ${effect.amount} damage for ${seconds(effect.durationMs)}s`;
    case 'delayedTrigger':
      return `after ${seconds(effect.delayMs)}s, ${list(effect.effects)}`;
    case 'damage':
      return `${effect.amount} ${effect.scaling === 'none' ? '' : `${effect.scaling} `}damage${terrain(effect.terrain)}`;
    case 'knockback':
      return 'knocks back';
    case 'stun':
      return `stuns for ${seconds(effect.durationMs)}s`;
    case 'applyStatus':
      return status(effect);
  }
}

function onHit(effects: Effect[]): string {
  return effects.length === 0 ? '' : `; on hit, ${list(effects)}`;
}

function contact(effects: Effect[]): string {
  return effects.length === 0 ? '' : `; anyone crossed takes ${list(effects)}`;
}

function expiry(effects: Effect[]): string {
  return effects.length === 0 ? '' : `; at the end of its flight, ${list(effects)}`;
}

function where(effect: Extract<Effect, { type: 'area' }>): string {
  if (effect.origin === 'aim') return ` at the aim (up to ${tiles(effect.range)} tiles away)`;
  return effect.origin === 'caster' ? ' around you' : '';
}

function delay(delayMs: number): string {
  return delayMs > 0 ? `after ${seconds(delayMs)}s, ` : '';
}

function terrain(rules: { tag: string; damageMultiplier?: number }[]): string {
  const notes = rules
    .filter((rule) => rule.damageMultiplier !== undefined)
    .map((rule) => `x${rule.damageMultiplier} on ${rule.tag}`);
  return notes.length === 0 ? '' : ` (${notes.join(', ')})`;
}

function status(effect: Extract<Effect, { type: 'applyStatus' }>): string {
  const duration = `${seconds(effect.durationMs)}s`;
  if (effect.status === 'SLOWED') {
    const ratio =
      effect.magnitude === undefined ? '' : `by ${Math.round(effect.magnitude * PERCENT)}% `;
    return `slows ${ratio}for ${duration}`;
  }
  return `${effect.status.toLowerCase()} for ${duration}`;
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
