import type { RoomSettings } from '@ninjarena/core';
import type { RoomPlayerView, RoomView } from '@ninjarena/protocol';
import { blockerText, groupPlayers } from '../lobby/lobbyModel';
import type { SettingsRow, TeamGroup } from '../lobby/lobbyModel';

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

export function renderTeams(
  root: HTMLElement,
  room: RoomView,
  sessionId: string,
  onJoin: (team: number) => void,
): void {
  root.replaceChildren();
  const localTeam = room.players.find((player) => player.id === sessionId)?.team ?? null;
  for (const group of groupPlayers(room)) {
    const column = element('div', 'lobby-team', root);
    const header = element('div', 'lobby-team-header', column);
    header.textContent =
      group.capacity === null
        ? group.label
        : `${group.label} ${group.players.length}/${group.capacity}`;
    for (const player of group.players) renderPlayer(column, player, room, sessionId);
    if (joinable(group, room, localTeam)) {
      const join = button('Join', 'lobby-join', () => {
        if (group.team !== null) onJoin(group.team);
      });
      column.appendChild(join);
    }
  }
}

export function renderBlockers(root: HTMLElement, room: RoomView): void {
  root.replaceChildren();
  for (const blocker of room.startBlockers) {
    element('li', 'lobby-blocker', root).textContent = blockerText(blocker);
  }
}

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  node.addEventListener('click', onClick);
  return node;
}

export function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

function renderPlayer(
  column: HTMLElement,
  player: RoomPlayerView,
  room: RoomView,
  sessionId: string,
): void {
  const line = element('div', 'lobby-player', column);
  if (player.id === sessionId) line.classList.add('is-local');
  const suffix = player.id === room.hostId ? ' (host)' : '';
  element('span', 'lobby-player-name', line).textContent = `${player.name}${suffix}`;
  const badge = element('span', player.ready ? 'badge-ready' : 'badge-not-ready', line);
  badge.textContent = player.ready ? 'READY' : 'NOT READY';
  if (!player.loadoutValid) {
    element('span', 'lobby-player-note', line).textContent = '(loadout invalid)';
  }
}

function joinable(group: TeamGroup, room: RoomView, localTeam: number | null): boolean {
  if (group.team === null || group.capacity === null) return false;
  if (room.status !== 'WAITING' || group.team === localTeam) return false;
  return group.players.length < group.capacity;
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
