export function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

export function button(
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

export function field(
  parent: HTMLElement,
  label: string,
  type: string,
  className: string,
): HTMLInputElement {
  const wrapper = element('label', 'editor-field', parent);
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.className = className;
  wrapper.appendChild(input);
  return input;
}

// Un panneau flottant se ferme sur Échap et sur un clic hors de lui: l'écran n'a rien à orchestrer.
export class Popover {
  readonly root: HTMLElement;
  private readonly anchor: HTMLElement;
  private readonly onDismiss: (event: MouseEvent) => void;

  constructor(parent: HTMLElement, anchor: HTMLElement, className: string) {
    this.anchor = anchor;
    this.root = element('div', `editor-popover ${className}`, parent);
    this.root.hidden = true;
    this.onDismiss = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (this.root.contains(target) || this.anchor.contains(target)) return;
      this.setOpen(false);
    };
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.root.hidden = !open;
    this.anchor.classList.toggle('active', open);
    if (open) document.addEventListener('pointerdown', this.onDismiss, true);
    else document.removeEventListener('pointerdown', this.onDismiss, true);
  }

  toggle(): void {
    this.setOpen(!this.open);
  }
}
