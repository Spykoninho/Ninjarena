import type { MapDocument, MapSummary } from '@ninjarena/core';
import type { Screen } from '../app/screen';

export interface EditorActions {
  saveMap(document: MapDocument): void;
  listMaps(): void;
  getMap(id: string): void;
  testMap(document: MapDocument): void;
  back(): void;
}

// Placeholder: la Task 10 remplace cet écran par la palette, le canevas et la liste d'anomalies.
export class EditorScreen implements Screen {
  private readonly root: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly errorLine: HTMLElement;

  constructor(actions: EditorActions) {
    this.root = document.createElement('div');
    this.root.className = 'screen editor';
    element('h1', 'editor-title', this.root).textContent = 'Map editor';
    this.summary = element('div', 'editor-summary', this.root);
    this.errorLine = element('div', 'editor-errors', this.root);
    this.errorLine.setAttribute('aria-live', 'polite');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'editor-back';
    back.textContent = 'Back';
    back.addEventListener('click', () => {
      actions.back();
    });
    this.root.appendChild(back);
  }

  mount(root: HTMLElement): void {
    root.appendChild(this.root);
  }

  unmount(): void {
    this.root.remove();
  }

  setMaps(maps: MapSummary[]): void {
    this.summary.textContent = `${String(maps.length)} map(s) available`;
  }

  showDocument(document: MapDocument): void {
    this.summary.textContent = `${document.name} (${String(document.width)}×${String(document.height)})`;
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
