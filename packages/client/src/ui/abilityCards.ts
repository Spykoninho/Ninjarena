import { abilityIconCanvas } from '../rendering/art/abilityIcons';
import { BASE_MULTIPLIERS, damageDetail, damageTotal } from './abilityText';
import type { DamageMultipliers } from './abilityText';
import type { AbilityOption } from './loadoutModel';

const ICON_SIZE = 24;
const icons = new Map<string, HTMLCanvasElement>();

export interface AbilityCard {
  root: HTMLElement;
  key: HTMLElement;
  slot: HTMLElement;
  tipKey: HTMLElement;
  meta: HTMLElement;
  hit: HTMLElement;
  damage: HTMLElement;
  option: AbilityOption;
}

// Les icônes sont dessinées une fois par capacité puis recopiées: chaque carte a son propre canvas.
export function abilityIcon(option: AbilityOption, className: string): HTMLCanvasElement {
  let source = icons.get(option.id);
  if (source === undefined) {
    source = abilityIconCanvas(option.id, option.family);
    icons.set(option.id, source);
  }
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.getContext('2d')?.drawImage(source, 0, 0);
  return canvas;
}

// Sans action, la carte est une simple vignette: un bouton inactif avalerait le clic de son parent.
export function abilityCard(
  option: AbilityOption,
  parent: HTMLElement,
  key: string,
  onClick: (() => void) | null,
): AbilityCard {
  const root = onClick === null ? document.createElement('div') : clickable(onClick);
  root.className = 'ability-card';
  root.dataset.id = option.id;
  const frame = element('div', 'ability-card-frame', root);
  frame.appendChild(abilityIcon(option, 'ability-card-icon'));
  const keyBadge = element('span', 'ability-card-key', frame);
  keyBadge.textContent = key;
  keyBadge.hidden = key.length === 0;
  const slot = element('span', 'ability-card-slot', frame);
  slot.hidden = true;
  element('div', 'ability-card-name', root).textContent = option.name;
  const hit = element('div', 'ability-card-hit', root);
  const meta = element('div', 'ability-card-meta', root);
  const { tipKey, damage } = abilityTip(option, key, root);
  parent.appendChild(root);
  const card: AbilityCard = { root, key: keyBadge, slot, tipKey, meta, hit, damage, option };
  updateCardNumbers(card, BASE_MULTIPLIERS);
  return card;
}

// Les dégâts affichés suivent la répartition: la carte se relit à chaque point déplacé.
export function updateCardNumbers(card: AbilityCard, multipliers: DamageMultipliers): void {
  const { option } = card;
  const total = damageTotal(option.damage, multipliers);
  const healed = damageTotal(option.heal, multipliers);
  const cooldown = `${Math.round(option.cooldownMs / 100) / 10} s`;
  card.hit.textContent =
    option.damage.length > 0 ? `${total} dégâts` : option.heal.length > 0 ? `+${healed} PV` : '—';
  card.meta.textContent =
    option.chakraCost > 0 ? `${option.chakraCost} chakra · ${cooldown}` : cooldown;
  const detail = damageDetail(option.damage, multipliers);
  card.damage.textContent =
    detail.length > 0
      ? `Dégâts : ${detail}`
      : option.heal.length > 0
        ? `Soin : ${healed} PV`
        : 'Ne fait pas de dégâts';
}

// La bulle est un enfant de la carte: le survol et le focus clavier la révèlent sans script.
function abilityTip(
  option: AbilityOption,
  key: string,
  parent: HTMLElement,
): { tipKey: HTMLElement; damage: HTMLElement } {
  const tip = element('div', 'ability-tip', parent);
  tip.setAttribute('role', 'tooltip');
  const title = element('div', 'ability-tip-title', tip);
  element('span', 'ability-tip-name', title).textContent = option.name;
  const tipKey = element('span', 'ability-tip-key', title);
  tipKey.textContent = key;
  tipKey.hidden = key.length === 0;
  element('div', 'ability-tip-text', tip).textContent = option.description;
  const damage = element('div', 'ability-tip-damage', tip);
  element('div', 'ability-tip-facts', tip).textContent = option.facts;
  return { tipKey, damage };
}

function clickable(onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
