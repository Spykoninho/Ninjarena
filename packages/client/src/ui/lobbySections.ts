import type { RoomSettings } from '@ninjarena/core';
import type { RoomView } from '@ninjarena/protocol';
import { blockerText } from '../lobby/lobbyModel';
import type { SettingsRow, StakeRow } from '../lobby/lobbyModel';
import { rankBadge, ratingText } from './rankBadge';

type SettingsControl = HTMLSelectElement | HTMLInputElement;

export interface SettingsForm {
  readonly root: HTMLElement;
  sync(rows: SettingsRow[], editable: boolean): void;
}

export function createSettingsForm(
  onChange: (key: keyof RoomSettings, raw: string | boolean) => void,
): SettingsForm {
  const root = document.createElement('div');
  root.className = 'lobby-settings';
  const fields = new Map<string, { field: HTMLElement; control: SettingsControl }>();

  return {
    root,
    sync(rows: SettingsRow[], editable: boolean): void {
      for (const row of rows) {
        const entry = fields.get(row.key) ?? create(root, row, onChange);
        fields.set(row.key, entry);
        entry.field.hidden = row.hidden;
        entry.control.disabled = !editable;
        apply(entry.control, row);
      }
    },
  };
}

export function renderBlockers(root: HTMLElement, room: RoomView): void {
  root.replaceChildren();
  for (const blocker of room.startBlockers) {
    element('li', 'lobby-blocker', root).textContent = blockerText(blocker);
  }
}

// La mise de chacun se lit avant de lancer: ce que la victoire rapporte et ce que la défaite coûte.
export function renderStakes(root: HTMLElement, rows: StakeRow[], sessionId: string): void {
  root.replaceChildren();
  element('h3', 'lobby-section-title', root).textContent = 'Mise de la partie classée';
  const list = element('ul', 'lobby-stakes-list', root);
  for (const row of rows) {
    const item = element('li', 'lobby-stake', list);
    if (row.id === sessionId) item.classList.add('is-local');
    const who = element('span', 'lobby-stake-player', item);
    element('span', 'lobby-stake-name', who).textContent = row.name;
    if (row.rating === null) {
      element('span', 'lobby-stake-guest', who).textContent = 'sans compte';
      element('span', 'lobby-stake-values', item).textContent = '—';
      continue;
    }
    who.appendChild(rankBadge(row.rating));
    element('span', 'lobby-stake-rating', who).textContent = ratingText(row.rating);
    const values = element('span', 'lobby-stake-values', item);
    if (row.stakes === null) {
      values.textContent = 'en attente d’un adversaire';
      continue;
    }
    element('span', 'lobby-stake-win', values).textContent = `victoire +${row.stakes.win}`;
    element('span', 'lobby-stake-loss', values).textContent = `défaite ${row.stakes.loss}`;
  }
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

function create(
  root: HTMLElement,
  row: SettingsRow,
  onChange: (key: keyof RoomSettings, raw: string | boolean) => void,
): { field: HTMLElement; control: SettingsControl } {
  const field = element('label', 'lobby-setting', root);
  element('span', 'lobby-setting-label', field).textContent = row.label;
  const control = row.kind === 'select' ? document.createElement('select') : input(row.kind);
  control.className = 'lobby-setting-control';
  field.appendChild(control);
  const read = (): string | boolean =>
    control instanceof HTMLInputElement && row.kind === 'toggle' ? control.checked : control.value;
  // Les nombres ne partent qu'une fois la saisie terminée: un `input` enverrait un patch par frappe.
  control.addEventListener('change', () => {
    onChange(row.key, read());
  });
  return { field, control };
}

function input(kind: 'number' | 'toggle'): HTMLInputElement {
  const node = document.createElement('input');
  node.type = kind === 'toggle' ? 'checkbox' : 'number';
  return node;
}

function apply(control: SettingsControl, row: SettingsRow): void {
  if (control instanceof HTMLSelectElement) {
    syncOptions(control, row);
    control.value = String(row.value);
    return;
  }
  if (row.kind === 'toggle') {
    control.checked = row.value === true;
    return;
  }
  if (row.min !== undefined) control.min = String(row.min);
  if (row.max !== undefined) control.max = String(row.max);
  if (row.step !== undefined) control.step = String(row.step);
  // Une valeur réécrite sous les doigts de l'hôte lui volerait sa saisie en cours.
  if (document.activeElement !== control) control.value = String(row.value);
}

function syncOptions(select: HTMLSelectElement, row: SettingsRow): void {
  const options = row.options ?? [];
  const current = Array.from(select.options).map((option) => `${option.value}|${option.text}`);
  const next = options.map((option) => `${option.value}|${option.label}`);
  if (current.length === next.length && current.every((entry, i) => entry === next[i])) return;
  select.replaceChildren();
  for (const option of options) {
    const entry = document.createElement('option');
    entry.value = option.value;
    entry.textContent = option.label;
    select.appendChild(entry);
  }
}
