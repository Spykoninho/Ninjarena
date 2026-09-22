import type { TournamentView } from '@ninjarena/protocol';
import type { HudExitAction } from './hud';
import type { KeyBindingsPanel } from './keyBindingsPanel';
import { PixelText } from './pixelText';
import { renderBracket } from './tournamentBracket';

type PauseSection = 'tournament' | 'keys' | null;

// Le menu d'Échap: reprendre, voir le tournoi, régler les touches ou quitter la partie.
export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly keys: KeyBindingsPanel;
  private readonly tournamentButton: HTMLButtonElement;
  private readonly exitButton: HTMLButtonElement;
  private readonly sectionRoot: HTMLElement;
  private readonly bracket: HTMLElement;
  private readonly title = new PixelText({ scale: 3 });
  private section: PauseSection = null;
  private tournament: TournamentView | null = null;
  private localId = '';
  private exitAction: HudExitAction | null = null;
  private opened = false;

  constructor(parent: HTMLElement, keys: KeyBindingsPanel) {
    this.keys = keys;
    this.root = element('div', 'hud-pause', parent);
    this.root.hidden = true;
    const panel = element('div', 'hud-pause-panel hud-ink', this.root);
    const head = element('div', 'hud-pause-head', panel);
    this.title.set('PAUSE');
    head.appendChild(this.title.canvas);
    const actions = element('div', 'hud-pause-actions', panel);
    button('Reprendre', actions, () => this.hide());
    this.tournamentButton = button('Tournoi', actions, () => this.showSection('tournament'));
    button('Touches', actions, () => this.showSection('keys'));
    this.exitButton = button('Quitter la partie', actions, () => this.exitAction?.run());
    this.exitButton.classList.add('is-exit');
    this.sectionRoot = element('div', 'hud-pause-section', panel);
    this.bracket = document.createElement('div');
    this.bracket.className = 'bracket';
    element('p', 'hud-pause-hint', panel).textContent = 'Échap pour reprendre';
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

  show(): void {
    this.opened = true;
    this.root.hidden = false;
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

  private render(): void {
    this.tournamentButton.hidden = this.tournament === null;
    this.tournamentButton.classList.toggle('is-active', this.section === 'tournament');
    // Le salon affiche le même panneau: le menu ne retire que celui qu'il montre lui-même.
    if (this.section !== 'keys' && this.sectionRoot.contains(this.keys.root)) this.keys.unmount();
    this.sectionRoot.replaceChildren();
    this.sectionRoot.hidden = this.section === null;
    if (this.section === 'keys') this.keys.mount(this.sectionRoot);
    if (this.section === 'tournament' && this.tournament !== null) {
      renderBracket(this.bracket, this.tournament, this.localId);
      this.sectionRoot.appendChild(this.bracket);
    }
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
