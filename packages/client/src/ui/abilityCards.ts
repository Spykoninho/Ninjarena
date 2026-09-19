import { iconCanvas } from '../rendering/art/spriteArt';
import type { AbilityOption } from './loadoutModel';

const ICON_SIZE = 24;
const icons = new Map<string, HTMLCanvasElement>();

export interface AbilityCard {
  root: HTMLElement;
  key: HTMLElement;
  slot: HTMLElement;
  tipKey: HTMLElement;
}

// Les icônes sont dessinées une fois par famille puis recopiées: chaque carte a son propre canvas.
export function abilityIcon(family: string, className: string): HTMLCanvasElement {
  let source = icons.get(family);
  if (source === undefined) {
    source = iconCanvas(family);
    icons.set(family, source);
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
  frame.appendChild(abilityIcon(option.family, 'ability-card-icon'));
  const keyBadge = element('span', 'ability-card-key', frame);
  keyBadge.textContent = key;
  keyBadge.hidden = key.length === 0;
  const slot = element('span', 'ability-card-slot', frame);
  slot.hidden = true;
  element('div', 'ability-card-name', root).textContent = option.name;
  element('div', 'ability-card-meta', root).textContent = meta(option);
  const tipKey = abilityTip(option, key, root);
  parent.appendChild(root);
  return { root, key: keyBadge, slot, tipKey };
}

// La bulle est un enfant de la carte: le survol et le focus clavier la révèlent sans script.
function abilityTip(option: AbilityOption, key: string, parent: HTMLElement): HTMLElement {
  const tip = element('div', 'ability-tip', parent);
  tip.setAttribute('role', 'tooltip');
  const title = element('div', 'ability-tip-title', tip);
  element('span', 'ability-tip-name', title).textContent = option.name;
  const tipKey = element('span', 'ability-tip-key', title);
  tipKey.textContent = key;
  tipKey.hidden = key.length === 0;
  element('div', 'ability-tip-text', tip).textContent = option.description;
  element('div', 'ability-tip-facts', tip).textContent = option.facts;
  return tipKey;
}

function clickable(onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function meta(option: AbilityOption): string {
  const cooldown = `${Math.round(option.cooldownMs / 100) / 10}s`;
  return option.chakraCost > 0 ? `${option.chakraCost} chakra · ${cooldown}` : cooldown;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
