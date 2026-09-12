import type { Loadout, MapSummary, RoomSettingsPatch } from '@ninjarena/core';
import type { RoomView } from '@ninjarena/protocol';
import type { Screen } from '../app/screen';

export interface LobbyActions {
  updateSettings(patch: RoomSettingsPatch): void;
  setLoadout(loadout: Loadout): void;
  setReady(ready: boolean): void;
  switchTeam(team: number): void;
  startMatch(): void;
  leaveRoom(): void;
}

// Placeholder: la Task 9 remplace cet écran par les équipes, les réglages et le panneau de loadout.
export class LobbyScreen implements Screen {
  private readonly root: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly errorLine: HTMLElement;

  constructor(actions: LobbyActions) {
    this.root = document.createElement('div');
    this.root.className = 'screen lobby';
    element('h1', 'lobby-title', this.root).textContent = 'Lobby';
    this.summary = element('div', 'lobby-summary', this.root);
    this.errorLine = element('div', 'lobby-errors', this.root);
    this.errorLine.setAttribute('aria-live', 'polite');
    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'lobby-leave';
    leave.textContent = 'Leave';
    leave.addEventListener('click', () => {
      actions.leaveRoom();
    });
    this.root.appendChild(leave);
  }

  mount(root: HTMLElement): void {
    root.appendChild(this.root);
  }

  unmount(): void {
    this.root.remove();
  }

  update(room: RoomView, maps: MapSummary[], sessionId: string): void {
    const role = room.hostId === sessionId ? 'host' : 'guest';
    this.summary.textContent = `${room.code} · ${room.status} · ${String(room.players.length)} player(s) · ${role} · ${String(maps.length)} map(s)`;
    this.errorLine.textContent = '';
  }

  showError(message: string): void {
    this.errorLine.textContent = message;
  }
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
