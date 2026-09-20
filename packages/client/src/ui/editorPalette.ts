import type { TilesetDefinition } from '@ninjarena/core';
import { PALETTE_CATEGORIES, paletteOf } from '../editor/editorModel';
import type { EditorTool, PaletteCategory } from '../editor/editorModel';
import { button, element } from './editorToolbar';

export const SPAWN_TEAM_COUNT = 4;
const THUMB_SIZE = 48;
const SPAWN_FILL = '#f4f4f8';
const SPAWN_TEXT = '#14141a';

export type PaletteTab = PaletteCategory | 'spawns';

const TAB_LABELS: Record<PaletteTab, string> = {
  ground: 'Sol',
  walls: 'Murs',
  decor: 'Décor',
  spawns: 'Apparitions',
};

// Les noms du tileset sont des clés de rendu: l'étal les traduit sans les renommer.
const TILE_LABELS: Record<string, string> = {
  ground: 'terre',
  grass: 'herbe',
  water: 'eau',
  wall: 'mur',
  tree: 'arbre',
  building: 'bâtiment',
  paving: 'dallage',
  bridge: 'pont',
  bush: 'buisson',
  path: 'chemin',
  flowers: 'fleurs',
  lantern: 'lanterne',
  rock: 'rocher',
  fence: 'clôture',
  well: 'puits',
  crate: 'caisse',
  torii: 'torii',
  sand: 'sable',
  snow: 'neige',
  gravel: 'gravier',
  tatami: 'tatami',
  basalt: 'basalte',
  mud: 'boue',
  'sandstone-wall': 'mur de grès',
  palisade: 'palissade',
  'ice-wall': 'mur de glace',
  dojo: 'dojo',
  'tea-house': 'maison de thé',
  warehouse: 'entrepôt',
  bamboo: 'bambou',
  pine: 'pin',
  barrel: 'tonneau',
  statue: 'statue',
};

const TABS: readonly PaletteTab[] = [...PALETTE_CATEGORIES, 'spawns'];

interface PaletteItem {
  tool: EditorTool;
  tab: PaletteTab;
  label: string;
  node: HTMLButtonElement;
  thumb: HTMLCanvasElement;
}

// Le tiroir range les éléments par onglet et possède la sélection: l'écran ne garde que l'outil rendu.
export class EditorPalette {
  readonly root: HTMLElement;
  private readonly tabs = new Map<PaletteTab, HTMLButtonElement>();
  private readonly grid: HTMLElement;
  private readonly items: PaletteItem[] = [];
  private current: PaletteItem;
  private tab: PaletteTab = 'ground';

  constructor(
    parent: HTMLElement,
    tileset: TilesetDefinition,
    thumbnail: (id: number) => HTMLCanvasElement,
    onSelect: (tool: EditorTool) => void,
  ) {
    this.root = element('div', 'editor-drawer', parent);
    const tabBar = element('div', 'editor-tabs', this.root);
    for (const tab of TABS) {
      const node = button(TAB_LABELS[tab], 'editor-tab', tabBar, () => {
        this.showTab(tab);
      });
      this.tabs.set(tab, node);
    }
    this.grid = element('div', 'editor-items', this.root);
    for (const entry of paletteOf(tileset)) {
      const tool: EditorTool = { kind: 'tile', id: entry.id, layer: entry.layer };
      const label = TILE_LABELS[entry.name] ?? entry.name;
      this.add(entry.category, label, tool, fitThumb(thumbnail(entry.id)), onSelect);
    }
    this.add('spawns', 'Toute équipe', { kind: 'spawn', team: null }, spawnThumb('*'), onSelect);
    for (let team = 0; team < SPAWN_TEAM_COUNT; team++) {
      const label = `Équipe ${String(team + 1)}`;
      this.add('spawns', label, { kind: 'spawn', team }, spawnThumb(String(team + 1)), onSelect);
    }
    const first = this.items[0];
    if (first === undefined) throw new Error('the tileset has no tile to paint with');
    this.current = first;
    this.select(first.tool);
    this.showTab('ground');
  }

  get tool(): EditorTool {
    return this.current.tool;
  }

  get label(): string {
    return this.current.label;
  }

  get thumbnail(): HTMLCanvasElement {
    return this.current.thumb;
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
  }

  select(tool: EditorTool): void {
    for (const item of this.items) {
      const active = sameTool(item.tool, tool);
      item.node.classList.toggle('active', active);
      if (active) this.current = item;
    }
  }

  // L'onglet suit l'élément choisi: rouvrir le tiroir montre toujours la sélection courante.
  showTab(tab: PaletteTab): void {
    this.tab = tab;
    for (const [candidate, node] of this.tabs) node.classList.toggle('active', candidate === tab);
    for (const item of this.items) item.node.hidden = item.tab !== tab;
  }

  private add(
    tab: PaletteTab,
    label: string,
    tool: EditorTool,
    thumb: HTMLCanvasElement,
    onSelect: (tool: EditorTool) => void,
  ): void {
    const node = button('', 'editor-item', this.grid, () => {
      this.select(tool);
      onSelect(tool);
    });
    node.title = label;
    node.appendChild(thumb);
    element('span', 'editor-item-label', node).textContent = label;
    this.items.push({ tool, tab, label, node, thumb });
  }
}

export function sameTool(a: EditorTool, b: EditorTool): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'tile' && b.kind === 'tile') return a.id === b.id;
  if (a.kind === 'spawn' && b.kind === 'spawn') return a.team === b.team;
  return true;
}

// Les recettes ne font pas toutes 32 px de côté: la vignette les cadre sans les déformer.
function fitThumb(image: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = thumbCanvas();
  const context = canvas.getContext('2d');
  if (context === null) return canvas;
  context.imageSmoothingEnabled = false;
  const scale = Math.min(THUMB_SIZE / image.width, THUMB_SIZE / image.height);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  context.drawImage(image, (THUMB_SIZE - width) / 2, THUMB_SIZE - height, width, height);
  return canvas;
}

function spawnThumb(text: string): HTMLCanvasElement {
  const canvas = thumbCanvas();
  const context = canvas.getContext('2d');
  if (context === null) return canvas;
  const center = THUMB_SIZE / 2;
  context.fillStyle = SPAWN_FILL;
  context.beginPath();
  context.arc(center, center, THUMB_SIZE * 0.36, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = SPAWN_TEXT;
  context.font = `bold ${String(Math.round(THUMB_SIZE * 0.5))}px monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, center, center + 1);
  return canvas;
}

function thumbCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  canvas.className = 'editor-item-thumb';
  return canvas;
}
