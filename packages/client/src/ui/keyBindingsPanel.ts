import { bindingLabel } from '../input/bindings';
import type { BindingsStore } from '../input/bindingsStore';

const SLOT_LABELS = ['Attaque de base', 'Esquive', 'Technique 1', 'Technique 2', 'Technique 3'];
const LISTENING_LABEL = 'Appuie sur une touche…';
const CANCEL_KEY = 'Escape';

// Le panneau des touches: une ligne par emplacement, un clic puis une touche ou un bouton de souris.
export class KeyBindingsPanel {
  readonly root: HTMLElement;
  private readonly store: BindingsStore;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly hint: HTMLElement;
  private listening: number | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(store: BindingsStore) {
    this.store = store;
    this.root = document.createElement('div');
    this.root.className = 'keys';
    element('h3', 'keys-title', this.root).textContent = 'Touches d’attaque';
    const list = element('div', 'keys-list', this.root);
    for (let slot = 0; slot < store.slotCount; slot++) {
      const row = element('div', 'keys-row', list);
      element('span', 'keys-label', row).textContent = SLOT_LABELS[slot] ?? `Emplacement ${slot}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'keys-button';
      button.addEventListener('click', () => this.listen(slot));
      row.appendChild(button);
      this.buttons.push(button);
    }
    this.hint = element('p', 'keys-hint', this.root);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'keys-reset';
    reset.textContent = 'Touches par défaut';
    reset.addEventListener('click', () => {
      this.stopListening();
      store.reset();
    });
    this.root.appendChild(reset);
    this.render();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.unsubscribe ??= this.store.subscribe(() => this.render());
    this.render();
  }

  unmount(): void {
    this.stopListening();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.root.remove();
  }

  private listen(slot: number): void {
    this.stopListening();
    this.listening = slot;
    // La capture précède les écouteurs du jeu: la touche choisie ne déclenche rien d'autre.
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('mousedown', this.onMouseDown, { capture: true });
    this.render();
  }

  private stopListening(): void {
    if (this.listening === null) return;
    this.listening = null;
    window.removeEventListener('keydown', this.onKeyDown, { capture: true });
    window.removeEventListener('mousedown', this.onMouseDown, { capture: true });
    this.render();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const slot = this.listening;
    if (slot === null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code !== CANCEL_KEY) this.store.setAbility(slot, event.code);
    this.stopListening();
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const slot = this.listening;
    if (slot === null) return;
    // Le clic sur le bouton en écoute ne compte pas: il serait pris pour un bouton gauche.
    if (event.target instanceof Node && this.buttons[slot]?.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.store.setAbility(slot, `Mouse${event.button}`);
    this.stopListening();
  };

  private render(): void {
    this.buttons.forEach((button, slot) => {
      const listening = this.listening === slot;
      button.classList.toggle('is-listening', listening);
      button.textContent = listening
        ? LISTENING_LABEL
        : bindingLabel(this.store.current.abilities[slot] ?? '');
    });
    this.hint.textContent =
      this.listening === null
        ? 'Clique sur une touche pour la changer. Une touche déjà prise échange sa place.'
        : 'Échap pour annuler.';
  }
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
