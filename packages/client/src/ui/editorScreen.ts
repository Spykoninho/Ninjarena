import { MAP_MAX_SPAWNS } from '@ninjarena/core';
import type {
  MapDocument,
  MapIssue,
  MapSummary,
  SpawnRequirement,
  TilesetDefinition,
} from '@ninjarena/core';
import type { Screen } from '../app/screen';
import {
  applyTool,
  loadDocument,
  newMapDocument,
  removeAt,
  renameDocument,
  withDocumentId,
  withIssues,
} from '../editor/editorModel';
import type { EditorState, EditorTool } from '../editor/editorModel';
import { centerOn, fitView, panBy, wheelZoomFactor, zoomAt } from '../editor/editorViewport';
import type { ViewTransform } from '../editor/editorViewport';
import { MapCanvas } from '../editor/mapCanvas';
import type { TileCoordinates } from '../editor/mapCanvas';
import { parseMapFile, serializeMap } from '../editor/mapFile';
import { EditorFilePanel } from './editorFilePanel';
import { EditorIssues } from './editorIssues';
import { EditorPalette } from './editorPalette';
import { button, element } from './editorToolbar';

export interface EditorActions {
  saveMap(document: MapDocument): void;
  listMaps(): void;
  getMap(id: string): void;
  testMap(document: MapDocument): void;
  back(): void;
}

export type EditorMode = 'paint' | 'erase' | 'pan';

const PIXELS_PER_TILE = 32;
const DEFAULT_WIDTH = 24;
const DEFAULT_HEIGHT = 18;
// Le nom de la carte suit la même borne que le schéma protocole/coeur (non exportée de core).
const MAP_NAME_MAX_LENGTH = 40;
// L'éditeur ignore le format de la future salle: la validation rappelle celui par défaut.
const DEFAULT_REQUIREMENT: SpawnRequirement = { mode: 'team', teamCount: 2, playersPerTeam: 1 };
const TOAST_DURATION_MS = 2500;
// Hauteurs des barres en surimpression, tiroir ouvert ou fermé: le cadrage les évite.
const TOP_INSET = 48;
const BOTTOM_INSET = 48;
const DRAWER_INSET = 160;
const MODE_LABELS: Record<EditorMode, string> = {
  paint: 'Peindre',
  erase: 'Effacer',
  pan: 'Déplacer',
};
const MODE_KEYS: Record<string, EditorMode> = { b: 'paint', e: 'erase', h: 'pan' };

export class EditorScreen implements Screen {
  private readonly actions: EditorActions;
  private readonly tileset: TilesetDefinition;
  private readonly root: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly cursor: HTMLElement;
  private readonly canvas: MapCanvas;
  private readonly nameInput: HTMLInputElement;
  private readonly dirtyMark: HTMLElement;
  private readonly sizeLabel: HTMLElement;
  private readonly filePanel: EditorFilePanel;
  private readonly issues: EditorIssues;
  private readonly palette: EditorPalette;
  private readonly modeButtons = new Map<EditorMode, HTMLButtonElement>();
  private readonly drawerToggle: HTMLButtonElement;
  private readonly drawerThumb: HTMLElement;
  private readonly drawerLabel: HTMLElement;
  private readonly zoomLabel: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onKeyUp: (event: KeyboardEvent) => void;
  private state: EditorState;
  private view: ViewTransform = { zoom: 1, x: 0, y: 0 };
  private mode: EditorMode = 'paint';
  private spaceHeld = false;
  private gesture: 'paint' | 'pan' | null = null;
  private lastPointer = { x: 0, y: 0 };
  private lastTile: TileCoordinates | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(actions: EditorActions, tileset: TilesetDefinition, initialName: string) {
    this.actions = actions;
    this.tileset = tileset;
    this.state = loadDocument(
      newMapDocument(initialName, DEFAULT_WIDTH, DEFAULT_HEIGHT, this.tileset),
    );
    this.root = document.createElement('div');
    this.root.className = 'screen editor';

    this.viewport = element('div', 'editor-viewport', this.root);
    this.stage = element('div', 'editor-stage', this.viewport);
    const canvasNode = document.createElement('canvas');
    canvasNode.className = 'editor-canvas';
    this.stage.appendChild(canvasNode);
    this.cursor = element('div', 'editor-cursor', this.stage);
    this.cursor.hidden = true;
    this.canvas = new MapCanvas(canvasNode, tileset, PIXELS_PER_TILE);

    const top = element('div', 'editor-top', this.root);
    const left = element('div', 'editor-group', top);
    button('‹ Menu', 'editor-button', left, () => {
      this.onBack();
    });
    const nameBox = element('label', 'editor-namebox', left);
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.className = 'editor-input editor-name';
    this.nameInput.maxLength = MAP_NAME_MAX_LENGTH;
    this.nameInput.placeholder = 'Nom de la carte';
    this.nameInput.value = initialName;
    this.nameInput.addEventListener('input', () => {
      this.update(renameDocument(this.state, this.nameInput.value));
    });
    nameBox.appendChild(this.nameInput);
    this.dirtyMark = element('span', 'editor-dirty', nameBox);
    this.dirtyMark.title = 'Modifications non enregistrées';
    this.sizeLabel = element('span', 'editor-sizelabel', left);

    const right = element('div', 'editor-group', top);
    this.issues = new EditorIssues(this.root, right, (issue) => {
      this.focusIssue(issue);
    });
    const fileButton = button('Fichier', 'editor-button', right, () => {
      this.filePanel.toggle();
      if (this.filePanel.open) this.actions.listMaps();
    });
    this.filePanel = new EditorFilePanel(
      this.root,
      fileButton,
      {
        createMap: (width, height) => {
          this.onNew(width, height);
        },
        openMap: (id) => {
          this.onOpen(id);
        },
        importFile: (file) => {
          this.onImport(file);
        },
        exportFile: () => {
          this.onExport();
        },
      },
      { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
    );
    button('Enregistrer', 'editor-button', right, () => {
      this.onSave();
    });
    button('▶ Tester', 'editor-button editor-primary', right, () => {
      this.actions.testMap(this.state.document);
    });

    const bottom = element('div', 'editor-bottom', this.root);
    const tools = element('div', 'editor-tools', bottom);
    for (const mode of ['paint', 'erase', 'pan'] as const) {
      const node = button(MODE_LABELS[mode], 'editor-tool', tools, () => {
        this.setMode(mode);
      });
      node.title = `${MODE_LABELS[mode]} (${keyFor(mode).toUpperCase()})`;
      this.modeButtons.set(mode, node);
    }
    element('span', 'editor-separator', tools);
    button('Ajuster', 'editor-tool', tools, () => {
      this.fit();
    }).title = 'Ajuster la carte à la fenêtre (F)';
    this.zoomLabel = element('span', 'editor-zoom', tools);
    this.toast = element('div', 'editor-toast', bottom);
    this.toast.setAttribute('aria-live', 'polite');
    this.toast.hidden = true;
    this.drawerToggle = button('', 'editor-drawer-toggle', bottom, () => {
      this.setDrawerOpen(!this.palette.open);
    });
    this.drawerThumb = element('span', 'editor-drawer-thumb', this.drawerToggle);
    this.drawerLabel = element('span', 'editor-drawer-label', this.drawerToggle);
    element('span', 'editor-drawer-caret', this.drawerToggle);

    this.palette = new EditorPalette(
      this.root,
      tileset,
      (id) => this.canvas.thumbnail(id),
      () => {
        this.setMode('paint');
      },
    );
    this.setDrawerOpen(true);
    this.setMode('paint');

    element('div', 'editor-hint', this.root).textContent =
      'Clic gauche : peindre · Clic droit : effacer · Molette : zoom · Glisser au clic molette ou Espace : déplacer';

    this.onKeyDown = (event) => {
      this.handleKeyDown(event);
    };
    this.onKeyUp = (event) => {
      if (event.code === 'Space') this.setSpaceHeld(false);
    };
    this.bindPointer();
    this.update(this.state);
  }

  mount(root: HTMLElement): void {
    root.appendChild(this.root);
    this.hideToast();
    this.update(this.state);
    this.fit();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  unmount(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.setSpaceHeld(false);
    this.filePanel.setOpen(false);
    this.issues.setOpen(false);
    this.root.remove();
  }

  setMaps(maps: MapSummary[]): void {
    this.filePanel.setMaps(maps);
  }

  showDocument(document: MapDocument): void {
    this.nameInput.value = document.name;
    this.filePanel.setSize(document.width, document.height);
    this.canvas.setHighlight(null);
    this.update(loadDocument(document));
    this.fit();
    this.setStatus(`« ${document.name} » ouverte`);
  }

  showSaved(id: string): void {
    this.update(withDocumentId(this.state, id));
    this.setStatus(`Enregistrée sous ${id}`);
  }

  setStatus(status: string): void {
    this.showToast(status, false);
  }

  showError(message: string): void {
    this.showToast(message, true);
  }

  private bindPointer(): void {
    this.viewport.addEventListener('pointerdown', (event) => {
      if (this.gesture !== null) return;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      const pans = event.button === 1 || (event.button === 0 && this.panning());
      if (pans) {
        event.preventDefault();
        this.gesture = 'pan';
        this.viewport.setPointerCapture(event.pointerId);
        this.viewport.classList.add('is-dragging');
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      this.gesture = 'paint';
      this.lastTile = null;
      this.viewport.setPointerCapture(event.pointerId);
      this.paintAt(event);
    });
    this.viewport.addEventListener('pointermove', (event) => {
      if (this.gesture === 'pan') {
        const dx = event.clientX - this.lastPointer.x;
        const dy = event.clientY - this.lastPointer.y;
        this.lastPointer = { x: event.clientX, y: event.clientY };
        this.setView(panBy(this.view, dx, dy));
      } else if (this.gesture === 'paint') {
        this.paintAt(event);
      }
      this.hover(this.canvas.tileAt(event.clientX, event.clientY));
    });
    const end = (event: PointerEvent) => {
      if (this.gesture === null) return;
      this.gesture = null;
      this.lastTile = null;
      this.viewport.classList.remove('is-dragging');
      if (this.viewport.hasPointerCapture(event.pointerId)) {
        this.viewport.releasePointerCapture(event.pointerId);
      }
    };
    this.viewport.addEventListener('pointerup', end);
    this.viewport.addEventListener('pointercancel', end);
    this.viewport.addEventListener('pointerleave', () => {
      if (this.gesture === null) this.hover(null);
    });
    this.viewport.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const tile = this.canvas.tileAt(event.clientX, event.clientY);
      if (tile !== null) this.update(removeAt(this.state, tile.x, tile.y));
    });
    // Le défilement zoome la carte: la page ne doit pas bouger derrière.
    this.viewport.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const rect = this.viewport.getBoundingClientRect();
        const factor = wheelZoomFactor(event.deltaY);
        this.setView(
          zoomAt(this.view, factor, event.clientX - rect.left, event.clientY - rect.top),
        );
      },
      { passive: false },
    );
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;
    if (event.code === 'Space') {
      event.preventDefault();
      this.setSpaceHeld(true);
      return;
    }
    if (event.key === 'Escape') {
      this.filePanel.setOpen(false);
      this.issues.setOpen(false);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const mode = MODE_KEYS[key];
    if (mode !== undefined) this.setMode(mode);
    else if (key === 'f') this.fit();
  }

  private panning(): boolean {
    return this.mode === 'pan' || this.spaceHeld;
  }

  private setSpaceHeld(held: boolean): void {
    this.spaceHeld = held;
    this.viewport.classList.toggle('is-panning', this.panning());
  }

  private setMode(mode: EditorMode): void {
    this.mode = mode;
    for (const [candidate, node] of this.modeButtons) {
      node.classList.toggle('active', candidate === mode);
    }
    this.viewport.classList.toggle('is-panning', this.panning());
    this.viewport.classList.toggle('is-erasing', mode === 'erase');
    this.drawerThumb.replaceChildren(copyCanvas(this.palette.thumbnail));
    this.drawerLabel.textContent = this.palette.label;
    this.update(this.state);
  }

  private setDrawerOpen(open: boolean): void {
    this.palette.setOpen(open);
    this.drawerToggle.classList.toggle('active', open);
    this.root.classList.toggle('has-drawer', open);
  }

  private activeTool(): EditorTool {
    return this.mode === 'erase' ? { kind: 'erase' } : this.palette.tool;
  }

  private hover(tile: TileCoordinates | null): void {
    this.cursor.hidden = tile === null;
    if (tile === null) return;
    this.cursor.style.left = `${String(tile.x * PIXELS_PER_TILE)}px`;
    this.cursor.style.top = `${String(tile.y * PIXELS_PER_TILE)}px`;
  }

  // Une même case ne se repeint pas pendant le trait: le survol la traverserait des dizaines de fois.
  private paintAt(event: PointerEvent): void {
    const tile = this.canvas.tileAt(event.clientX, event.clientY);
    if (tile === null) return;
    if (this.lastTile !== null && this.lastTile.x === tile.x && this.lastTile.y === tile.y) return;
    this.lastTile = tile;
    const next = applyTool(this.state, tile.x, tile.y);
    // Une trame de spawn inchangée alors que l'outil "spawn" est actif signale le plafond atteint.
    if (next === this.state && this.state.tool.kind === 'spawn') {
      this.showError(`The map already has the maximum of ${String(MAP_MAX_SPAWNS)} spawns`);
      return;
    }
    this.update(next);
  }

  private viewportSize(): { width: number; height: number } {
    const rect = this.viewport.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  private fit(): void {
    const { width, height } = this.state.document;
    const inset = { top: TOP_INSET, bottom: this.palette.open ? DRAWER_INSET : BOTTOM_INSET };
    this.setView(
      fitView(this.viewportSize(), width * PIXELS_PER_TILE, height * PIXELS_PER_TILE, inset),
    );
  }

  private setView(view: ViewTransform): void {
    this.view = view;
    this.stage.style.transform = `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.zoom)})`;
    this.stage.style.setProperty('--editor-zoom', String(view.zoom));
    this.zoomLabel.textContent = `${String(Math.round(view.zoom * 100))}%`;
  }

  private confirmDiscard(): boolean {
    return (
      !this.state.dirty ||
      window.confirm('Abandonner les modifications non enregistrées de cette carte ?')
    );
  }

  private onBack(): void {
    if (!this.confirmDiscard()) return;
    this.actions.back();
  }

  private onNew(width: number, height: number): void {
    if (!this.confirmDiscard()) return;
    const name = this.nameInput.value.trim().length === 0 ? 'Nouvelle carte' : this.nameInput.value;
    const doc = newMapDocument(name, width, height, this.tileset);
    this.nameInput.value = doc.name;
    this.filePanel.setSize(doc.width, doc.height);
    this.canvas.setHighlight(null);
    this.update(loadDocument(doc));
    this.fit();
    this.setStatus(`Nouvelle carte ${String(doc.width)}×${String(doc.height)}`);
  }

  private onOpen(id: string): void {
    if (id.length === 0) {
      this.showError('Aucune carte enregistrée à ouvrir');
      return;
    }
    if (!this.confirmDiscard()) return;
    this.actions.getMap(id);
  }

  private onSave(): void {
    this.setStatus('Enregistrement…');
    this.actions.saveMap(this.state.document);
  }

  private onExport(): void {
    const { document: doc } = this.state;
    const blob = new Blob([serializeMap(doc)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${doc.id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Le téléchargement lit l'URL après le clic: la révoquer tout de suite le viderait.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }

  private onImport(file: File): void {
    if (!this.confirmDiscard()) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        this.showDocument(parseMapFile(String(reader.result)));
      } catch (error) {
        this.showError(error instanceof Error ? error.message : String(error));
      }
    });
    reader.addEventListener('error', () => {
      this.showError(`Could not read ${file.name}`);
    });
    reader.readAsText(file);
  }

  // Une modification périme le repère d'anomalie: il désignait une case qui a pu changer.
  private update(next: EditorState): void {
    this.state = withIssues(
      { ...next, tool: this.activeTool() },
      this.tileset,
      DEFAULT_REQUIREMENT,
    );
    this.canvas.setHighlight(null);
    this.canvas.draw(this.state);
    this.issues.setIssues(this.state.issues);
    this.dirtyMark.hidden = !this.state.dirty;
    const { width, height } = this.state.document;
    this.sizeLabel.textContent = `${String(width)}×${String(height)}`;
  }

  private focusIssue(issue: MapIssue): void {
    if (issue.x === undefined || issue.y === undefined) return;
    this.canvas.setHighlight({ x: issue.x, y: issue.y });
    this.canvas.draw(this.state);
    this.setView(
      centerOn(
        this.view,
        this.viewportSize(),
        (issue.x + 0.5) * PIXELS_PER_TILE,
        (issue.y + 0.5) * PIXELS_PER_TILE,
      ),
    );
  }

  private showToast(message: string, error: boolean): void {
    this.toast.textContent = message;
    this.toast.hidden = false;
    this.toast.classList.toggle('is-error', error);
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    // Une erreur reste affichée: elle attend une action, un statut s'efface seul.
    this.toastTimer = error
      ? null
      : setTimeout(() => {
          this.hideToast();
        }, TOAST_DURATION_MS);
  }

  private hideToast(): void {
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.toast.hidden = true;
  }
}

// Cloner un canevas ne copie pas son image: la vignette du bouton se redessine.
function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext('2d')?.drawImage(source, 0, 0);
  return copy;
}

function keyFor(mode: EditorMode): string {
  return Object.entries(MODE_KEYS).find(([, candidate]) => candidate === mode)?.[0] ?? '';
}
