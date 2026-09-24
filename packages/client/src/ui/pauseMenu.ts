import type { Loadout } from '@ninjarena/core';
import type { TournamentView } from '@ninjarena/protocol';
import type { HudExitAction, HudLoadoutAction } from './hud';
import type { KeyBindingsPanel } from './keyBindingsPanel';
import type { LoadoutPanel } from './loadoutPanel';
import { PixelText } from './pixelText';
import { renderBracket } from './tournamentBracket';

type PauseSection = 'tournament' | 'loadout' | 'keys' | null;

const EQUIP_DEBOUNCE_MS = 300;

// Le menu d'Échap: reprendre, voir le tournoi, changer de personnage, régler les touches ou quitter.
export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly keys: KeyBindingsPanel;
  private readonly loadout: LoadoutPanel;
  private readonly tournamentButton: HTMLButtonElement;
  private readonly loadoutButton: HTMLButtonElement;
  private readonly exitButton: HTMLButtonElement;
  private readonly sectionRoot: HTMLElement;
  private readonly bracket: HTMLElement;
  private readonly title = new PixelText({ scale: 3 });
  private section: PauseSection = null;
  private shown: PauseSection = null;
  private tournament: TournamentView | null = null;
  private localId = '';
  private exitAction: HudExitAction | null = null;
  private loadoutAction: HudLoadoutAction | null = null;
  private equipTimer: number | null = null;
  private opened = false;

  constructor(parent: HTMLElement, keys: KeyBindingsPanel, loadout: LoadoutPanel) {
    this.keys = keys;
    this.loadout = loadout;
    this.root = element('div', 'hud-pause', parent);
    this.root.hidden = true;
    this.panel = element('div', 'hud-pause-panel hud-ink', this.root);
    const head = element('div', 'hud-pause-head', this.panel);
    this.title.set('PAUSE');
    head.appendChild(this.title.canvas);
    const actions = element('div', 'hud-pause-actions', this.panel);
    button('Reprendre', actions, () => this.hide());
    this.tournamentButton = button('Tournoi', actions, () => this.showSection('tournament'));
    this.loadoutButton = button('Personnage', actions, () => this.showSection('loadout'));
    button('Touches', actions, () => this.showSection('keys')).classList.add('is-keys');
    this.exitButton = button('Quitter la partie', actions, () => this.exitAction?.run());
    this.exitButton.classList.add('is-exit');
    this.sectionRoot = element('div', 'hud-pause-section', this.panel);
    this.bracket = document.createElement('div');
    this.bracket.className = 'bracket';
    element('p', 'hud-pause-hint', this.panel).textContent = 'Échap pour reprendre';
    loadout.onChange((next) => this.onLoadoutChanged(next));
    this.setExitAction(null);
    this.render();
  }

  get open(): boolean {
    return this.opened;
  }

  toggle(): void {
    if (this.opened) this.hide();
    else this.show();
  }

  show(section: PauseSection = null): void {
    this.opened = true;
    this.root.hidden = false;
    this.section = section;
    this.render();
  }

  hide(): void {
    this.opened = false;
    this.root.hidden = true;
    this.showSection(null);
  }

  setExitAction(action: HudExitAction | null): void {
    this.exitAction = action;
    this.exitButton.hidden = action === null;
    if (action !== null) this.exitButton.textContent = action.label;
  }

  setLoadoutAction(action: HudLoadoutAction | null): void {
    this.loadoutAction = action;
    this.cancelEquip();
    if (action !== null) this.loadout.setBudget(action.budget);
    else if (this.section === 'loadout') this.section = null;
    this.render();
  }

  setTournament(view: TournamentView | null, localId: string): void {
    this.tournament = view;
    this.localId = localId;
    if (view === null && this.section === 'tournament') this.section = null;
    this.render();
  }

  private showSection(section: PauseSection): void {
    this.section = this.section === section ? null : section;
    this.render();
  }

  // Le salon écoute le même panneau: seul un changement fait ici rééquipe le ninja en jeu.
  private onLoadoutChanged(loadout: Loadout | null): void {
    const action = this.loadoutAction;
    if (action === null || loadout === null || this.section !== 'loadout') return;
    this.cancelEquip();
    // Les curseurs génèrent une rafale de changements: seul le dernier part au serveur.
    this.equipTimer = window.setTimeout(() => {
      this.equipTimer = null;
      action.equip(loadout);
    }, EQUIP_DEBOUNCE_MS);
  }

  private cancelEquip(): void {
    if (this.equipTimer !== null) window.clearTimeout(this.equipTimer);
    this.equipTimer = null;
  }

  private render(): void {
    this.tournamentButton.hidden = this.tournament === null;
    this.tournamentButton.classList.toggle('is-active', this.section === 'tournament');
    this.loadoutButton.hidden = this.loadoutAction === null;
    this.loadoutButton.classList.toggle('is-active', this.section === 'loadout');
    this.panel.classList.toggle('has-loadout', this.section === 'loadout');
    this.sectionRoot.hidden = this.section === null;
    if (this.section === 'tournament' && this.tournament !== null) {
      renderBracket(this.bracket, this.tournament, this.localId);
    }
    // Chaque état de salle repasse ici: une section déjà affichée reste en place, curseurs compris.
    if (this.section === this.shown) return;
    // Le salon affiche le même panneau: le menu ne retire que celui qu'il montre lui-même.
    if (this.sectionRoot.contains(this.keys.root)) this.keys.unmount();
    this.sectionRoot.replaceChildren();
    this.shown = this.section;
    if (this.section === 'keys') this.keys.mount(this.sectionRoot);
    if (this.section === 'loadout') this.loadout.mount(this.sectionRoot);
    if (this.section === 'tournament') this.sectionRoot.appendChild(this.bracket);
  }
}

function button(label: string, parent: HTMLElement, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'hud-pause-button';
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
