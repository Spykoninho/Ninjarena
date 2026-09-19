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
import type { AbilityOption } from './loadoutModel';
import type { LoadoutPanel } from './loadoutPanel';
import { LobbyRoster } from './lobbyRoster';
import { createSettingsForm, renderBlockers } from './lobbySections';
import type { SettingsForm } from './lobbySections';

export interface LobbyActions {
  updateSettings(patch: RoomSettingsPatch): void;
  setLoadout(loadout: Loadout): void;
  setReady(ready: boolean): void;
  switchTeam(team: number): void;
  startMatch(): void;
  leaveRoom(): void;
}

type LobbyTab = 'roster' | 'match' | 'loadout';

const TABS: { id: LobbyTab; label: string }[] = [
  { id: 'roster', label: 'Salon' },
  { id: 'match', label: 'Réglages de la partie' },
  { id: 'loadout', label: 'Personnage' },
];

const SEND_DEBOUNCE_MS = 300;
const COPIED_LABEL_MS = 2000;
const NO_BUDGET = -1;

export class LobbyScreen implements Screen {
  private readonly actions: LobbyActions;
  private readonly panel: LoadoutPanel;
  private readonly rules: StatRulesDefinition;
  private readonly root: HTMLElement;
  private readonly codeLine: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly linkInput: HTMLInputElement;
  private readonly tabs = new Map<LobbyTab, HTMLButtonElement>();
  private readonly pages = new Map<LobbyTab, HTMLElement>();
  private readonly roster: LobbyRoster;
  private readonly settingsForm: SettingsForm;
  private readonly settingsNote: HTMLElement;
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

  constructor(
    actions: LobbyActions,
    panel: LoadoutPanel,
    rules: StatRulesDefinition,
    options: AbilityOption[],
  ) {
    this.actions = actions;
    this.panel = panel;
    this.rules = rules;
    this.root = document.createElement('div');
    this.root.className = 'screen lobby';

    const header = element('header', 'lobby-header', this.root);
    const title = element('div', 'lobby-title', header);
    element('span', 'lobby-title-label', title).textContent = 'Salle';
    this.codeLine = element('span', 'lobby-code', title);
    this.statusLine = element('span', 'lobby-status', title);
    const headerActions = element('div', 'lobby-header-actions', header);
    this.copyButton = button('Copier le lien d’invitation', 'lobby-copy', headerActions, () => {
      this.onCopyLink();
    });
    button('Quitter', 'lobby-leave', headerActions, () => {
      this.run(() => {
        actions.leaveRoom();
      });
    });
    this.linkInput = document.createElement('input');
    this.linkInput.type = 'text';
    this.linkInput.readOnly = true;
    this.linkInput.className = 'lobby-link';
    this.linkInput.hidden = true;
    header.appendChild(this.linkInput);

    const nav = element('nav', 'lobby-tabs', this.root);
    const body = element('div', 'lobby-body', this.root);
    for (const tab of TABS) {
      const node = button(tab.label, 'lobby-tab', nav, () => {
        this.showTab(tab.id);
      });
      this.tabs.set(tab.id, node);
      this.pages.set(tab.id, element('section', `lobby-page lobby-page-${tab.id}`, body));
    }

    this.roster = new LobbyRoster(
      this.page('roster'),
      new Map(options.map((option) => [option.id, option])),
      (team) => {
        this.run(() => {
          this.actions.switchTeam(team);
        });
      },
    );

    const match = this.page('match');
    this.settingsNote = element('p', 'lobby-settings-note', match);
    this.settingsForm = createSettingsForm((key, raw) => {
      this.onSettingChanged(key, raw);
    });
    match.appendChild(this.settingsForm.root);

    panel.mount(this.page('loadout'));
    panel.onChange((loadout) => {
      this.onLoadoutChanged(loadout);
    });

    const footer = element('footer', 'lobby-footer', this.root);
    const notes = element('div', 'lobby-footer-notes', footer);
    this.blockerList = element('ul', 'lobby-blockers', notes);
    this.errorLine = element('div', 'lobby-errors', notes);
    this.errorLine.setAttribute('aria-live', 'polite');
    const actionsRow = element('div', 'lobby-actions', footer);
    this.readyButton = button('Prêt', 'lobby-ready', actionsRow, () => {
      this.onReadyClicked();
    });
    this.startButton = button('Lancer la partie', 'lobby-start', actionsRow, () => {
      this.run(() => {
        actions.startMatch();
      });
    });
    this.showTab('roster');
  }

  mount(root: HTMLElement): void {
    // Une erreur ne survit pas au remontage de l'écran: elle parlait de la salle précédente.
    this.errorLine.textContent = '';
    // Le budget est oublié pour que la première mise à jour renvoie le loadout à la nouvelle salle.
    this.budget = NO_BUDGET;
    root.appendChild(this.root);
    this.roster.start();
  }

  unmount(): void {
    this.clearTimers();
    this.roster.stop();
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
        local.loadoutValid ? null : 'le serveur n’a pas accepté cet équipement',
      );
      this.tabs.get('loadout')?.classList.toggle('has-alert', !local.loadoutValid);
    }
    this.codeLine.textContent = room.code;
    this.statusLine.textContent = statusText(room);
    this.roster.update(room, sessionId);
    const host = isHost(room, sessionId);
    const editable = host && room.status === 'WAITING';
    this.settingsNote.textContent = host
      ? 'Tu es l’hôte : ces réglages s’appliquent à toute la salle.'
      : 'Seul l’hôte peut modifier les réglages de la partie.';
    this.settingsForm.sync(settingsRows(room.settings, maps, this.rules), editable);
    renderBlockers(this.blockerList, room);
    this.syncActions(room, local, host);
  }

  showError(message: string): void {
    this.errorLine.textContent = message;
    if (isLoadoutError(message)) {
      this.panel.setServerVerdict(false, message);
      this.showTab('loadout');
    }
  }

  private page(tab: LobbyTab): HTMLElement {
    const page = this.pages.get(tab);
    if (page === undefined) throw new Error(`unknown lobby tab ${tab}`);
    return page;
  }

  private showTab(tab: LobbyTab): void {
    for (const [id, node] of this.tabs) node.classList.toggle('active', id === tab);
    for (const [id, page] of this.pages) page.hidden = id !== tab;
  }

  private localPlayer(): RoomPlayerView | null {
    return this.room?.players.find((player) => player.id === this.sessionId) ?? null;
  }

  private syncActions(room: RoomView, local: RoomPlayerView | null, host: boolean): void {
    const waiting = room.status === 'WAITING';
    const ready = local?.ready === true;
    this.readyButton.textContent = ready ? 'Pas prêt' : 'Prêt';
    this.readyButton.classList.toggle('is-ready', ready);
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
    this.copyButton.textContent = 'Lien copié';
    if (this.copyTimer !== null) window.clearTimeout(this.copyTimer);
    this.copyTimer = window.setTimeout(() => {
      this.copyTimer = null;
      this.copyButton.textContent = 'Copier le lien d’invitation';
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

function button(
  label: string,
  className: string,
  parent: HTMLElement,
  onClick: () => void,
): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  node.addEventListener('click', onClick);
  parent.appendChild(node);
  return node;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
