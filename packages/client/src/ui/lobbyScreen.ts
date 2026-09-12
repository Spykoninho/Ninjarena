import type {
  Loadout,
  MapSummary,
  RoomSettings,
  RoomSettingsPatch,
  StatRulesDefinition,
} from '@ninjarena/core';
import type { RoomPlayerView, RoomView } from '@ninjarena/protocol';
import type { Screen } from '../app/screen';
import {
  canStart,
  isHost,
  isLoadoutError,
  roomLink,
  settingsPatch,
  settingsRows,
  statusText,
} from '../lobby/lobbyModel';
import type { LoadoutPanel } from './loadoutPanel';
import { createSettingsForm, renderBlockers, renderTeams } from './lobbySections';
import type { SettingsForm } from './lobbySections';

export interface LobbyActions {
  updateSettings(patch: RoomSettingsPatch): void;
  setLoadout(loadout: Loadout): void;
  setReady(ready: boolean): void;
  switchTeam(team: number): void;
  startMatch(): void;
  leaveRoom(): void;
}

const SEND_DEBOUNCE_MS = 300;
const COPIED_LABEL_MS = 2000;
const NO_BUDGET = -1;

export class LobbyScreen implements Screen {
  private readonly actions: LobbyActions;
  private readonly panel: LoadoutPanel;
  private readonly rules: StatRulesDefinition;
  private readonly root: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly linkInput: HTMLInputElement;
  private readonly teamsRoot: HTMLElement;
  private readonly settingsForm: SettingsForm;
  private readonly blockerList: HTMLElement;
  private readonly readyButton: HTMLButtonElement;
  private readonly startButton: HTMLButtonElement;
  private readonly errorLine: HTMLElement;
  private room: RoomView | null = null;
  private sessionId = '';
  private loadout: Loadout | null = null;
  private budget = NO_BUDGET;
  private sendTimer: number | null = null;
  private copyTimer: number | null = null;

  constructor(actions: LobbyActions, panel: LoadoutPanel, rules: StatRulesDefinition) {
    this.actions = actions;
    this.panel = panel;
    this.rules = rules;
    this.root = document.createElement('div');
    this.root.className = 'screen lobby';

    const header = element('div', 'lobby-header', this.root);
    this.statusLine = element('span', 'lobby-status', header);
    this.copyButton = button('Copy link', 'lobby-copy', () => {
      this.onCopyLink();
    });
    header.appendChild(this.copyButton);
    this.linkInput = document.createElement('input');
    this.linkInput.type = 'text';
    this.linkInput.readOnly = true;
    this.linkInput.className = 'lobby-link';
    this.linkInput.hidden = true;
    header.appendChild(this.linkInput);

    this.teamsRoot = element('div', 'lobby-teams', this.root);
    this.settingsForm = createSettingsForm((key, raw) => {
      this.onSettingChanged(key, raw);
    });
    this.root.appendChild(this.settingsForm.root);
    panel.mount(this.root);
    panel.onChange((loadout) => {
      this.onLoadoutChanged(loadout);
    });

    this.blockerList = element('ul', 'lobby-blockers', this.root);
    const actionsRow = element('div', 'lobby-actions', this.root);
    this.readyButton = button('Ready', 'lobby-ready', () => {
      this.onReadyClicked();
    });
    this.startButton = button('Start', 'lobby-start', () => {
      this.run(() => {
        actions.startMatch();
      });
    });
    const leave = button('Leave', 'lobby-leave', () => {
      this.run(() => {
        actions.leaveRoom();
      });
    });
    actionsRow.append(this.readyButton, this.startButton, leave);
    this.errorLine = element('div', 'lobby-errors', this.root);
    this.errorLine.setAttribute('aria-live', 'polite');
  }

  mount(root: HTMLElement): void {
    // Une erreur ne survit pas au remontage de l'écran: elle parlait de la salle précédente.
    this.errorLine.textContent = '';
    // Le budget est oublié pour que la première mise à jour renvoie le loadout à la nouvelle salle.
    this.budget = NO_BUDGET;
    root.appendChild(this.root);
  }

  unmount(): void {
    this.clearTimers();
    this.room = null;
    this.root.remove();
  }

  update(room: RoomView, maps: MapSummary[], sessionId: string): void {
    this.room = room;
    this.sessionId = sessionId;
    const local = this.localPlayer();
    if (room.settings.buildPoints !== this.budget) {
      this.budget = room.settings.buildPoints;
      this.panel.setBudget(this.budget);
      this.sendLoadout();
    }
    if (local !== null) {
      this.panel.setServerVerdict(
        local.loadoutValid,
        local.loadoutValid ? null : 'the server has not accepted this loadout',
      );
    }
    this.statusLine.textContent = statusText(room);
    renderTeams(this.teamsRoot, room, sessionId, (team) => {
      this.run(() => {
        this.actions.switchTeam(team);
      });
    });
    const host = isHost(room, sessionId);
    this.settingsForm.sync(
      settingsRows(room.settings, maps, this.rules),
      host && room.status === 'WAITING',
    );
    renderBlockers(this.blockerList, room);
    this.syncActions(room, local, host);
  }

  showError(message: string): void {
    this.errorLine.textContent = message;
    if (isLoadoutError(message)) this.panel.setServerVerdict(false, message);
  }

  private localPlayer(): RoomPlayerView | null {
    return this.room?.players.find((player) => player.id === this.sessionId) ?? null;
  }

  private syncActions(room: RoomView, local: RoomPlayerView | null, host: boolean): void {
    const waiting = room.status === 'WAITING';
    this.readyButton.textContent = local?.ready === true ? 'Not ready' : 'Ready';
    this.readyButton.disabled = local === null || !local.loadoutValid || !waiting;
    this.startButton.hidden = !host;
    this.startButton.disabled = !canStart(room, this.sessionId);
  }

  private onReadyClicked(): void {
    const local = this.localPlayer();
    this.run(() => {
      this.actions.setReady(local?.ready !== true);
    });
  }

  private onSettingChanged(key: keyof RoomSettings, raw: string | boolean): void {
    const patch = settingsPatch(key, raw);
    if (patch === null) return;
    this.run(() => {
      this.actions.updateSettings(patch);
    });
  }

  private onLoadoutChanged(loadout: Loadout | null): void {
    this.loadout = loadout;
    if (loadout === null || this.room === null) return;
    if (this.sendTimer !== null) window.clearTimeout(this.sendTimer);
    // Les curseurs génèrent une rafale de changements: seul le dernier part au serveur.
    this.sendTimer = window.setTimeout(() => {
      this.sendTimer = null;
      this.sendLoadout();
    }, SEND_DEBOUNCE_MS);
  }

  private sendLoadout(): void {
    const loadout = this.loadout;
    if (loadout === null) return;
    this.actions.setLoadout(loadout);
  }

  private onCopyLink(): void {
    const room = this.room;
    if (room === null) return;
    const link = roomLink(window.location.origin, window.location.pathname, room.code);
    this.linkInput.value = link;
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (clipboard === undefined) {
      this.revealLink();
      return;
    }
    clipboard.writeText(link).then(
      () => {
        this.confirmCopy();
      },
      () => {
        this.revealLink();
      },
    );
  }

  private confirmCopy(): void {
    this.copyButton.textContent = 'Copied';
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    this.copyTimer = window.setTimeout(() => {
      this.copyTimer = null;
      this.copyButton.textContent = 'Copy link';
    }, COPIED_LABEL_MS);
  }

  // Sans presse-papier accessible, le lien s'affiche sélectionné pour une copie manuelle.
  private revealLink(): void {
    this.linkInput.hidden = false;
    this.linkInput.select();
  }

  private clearTimers(): void {
    if (this.sendTimer !== null) window.clearTimeout(this.sendTimer);
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    this.sendTimer = null;
    this.copyTimer = null;
  }

  // Toute action de l'utilisateur repart d'une ligne d'erreur vide.
  private run(action: () => void): void {
    this.errorLine.textContent = '';
    action();
  }
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  node.addEventListener('click', onClick);
  return node;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
