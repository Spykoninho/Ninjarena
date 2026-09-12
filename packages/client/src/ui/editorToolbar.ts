import type { TilesetDefinition } from '@ninjarena/core';
import { paletteOf } from '../editor/editorModel';
import type { EditorTool } from '../editor/editorModel';

export const SPAWN_TEAM_COUNT = 4;

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

interface PaletteButton {
  tool: EditorTool;
  node: HTMLButtonElement;
}

// La palette possède la sélection courante: l'écran ne garde que l'outil qu'elle lui rend.
export class EditorPalette {
  readonly root: HTMLElement;
  private readonly buttons: PaletteButton[] = [];
  private current: EditorTool;

  constructor(
    parent: HTMLElement,
    tileset: TilesetDefinition,
    onSelect: (tool: EditorTool) => void,
  ) {
    this.root = element('div', 'editor-palette', parent);
    for (const entry of paletteOf(tileset)) {
      const tool: EditorTool = { kind: 'tile', id: entry.id, layer: entry.layer };
      const label = `${entry.name} (${entry.layer === 'ground' ? 'g' : 'o'})`;
      const node = this.add(label, tool, onSelect);
      const swatch = document.createElement('span');
      swatch.className = 'editor-swatch';
      swatch.style.background = entry.color;
      node.insertBefore(swatch, node.firstChild);
    }
    this.add('Erase', { kind: 'erase' }, onSelect);
    this.add('Spawn *', { kind: 'spawn', team: null }, onSelect);
    for (let team = 0; team < SPAWN_TEAM_COUNT; team++) {
      this.add(`Spawn ${String(team + 1)}`, { kind: 'spawn', team }, onSelect);
    }
    this.current = this.buttons[0]?.tool ?? { kind: 'erase' };
    this.select(this.current);
  }

  get tool(): EditorTool {
    return this.current;
  }

  select(tool: EditorTool): void {
    this.current = tool;
    for (const candidate of this.buttons) {
      candidate.node.classList.toggle('active', sameTool(candidate.tool, tool));
    }
  }

  private add(
    label: string,
    tool: EditorTool,
    onSelect: (tool: EditorTool) => void,
  ): HTMLButtonElement {
    const node = button(label, 'editor-tool', this.root, () => {
      this.select(tool);
      onSelect(tool);
    });
    this.buttons.push({ tool, node });
    return node;
  }
}

function sameTool(a: EditorTool, b: EditorTool): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'tile' && b.kind === 'tile') return a.id === b.id;
  if (a.kind === 'spawn' && b.kind === 'spawn') return a.team === b.team;
  return true;
}
