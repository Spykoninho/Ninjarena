import { MAP_MAX_SIZE, MAP_MAX_SPAWNS, MAP_MIN_SIZE, spawnIssues } from '@ninjarena/core';
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
import type { EditorState } from '../editor/editorModel';
import { MapCanvas } from '../editor/mapCanvas';
import type { TileCoordinates } from '../editor/mapCanvas';
import { parseMapFile, serializeMap } from '../editor/mapFile';
import { button, EditorPalette, element, field } from './editorToolbar';

export interface EditorActions {
  saveMap(document: MapDocument): void;
  listMaps(): void;
  getMap(id: string): void;
  testMap(document: MapDocument): void;
  back(): void;
}

const TITLE = 'Map editor';
const PIXELS_PER_TILE = 12;
const DEFAULT_WIDTH = 24;
const DEFAULT_HEIGHT = 18;
// Le nom de la carte suit la même borne que le schéma protocole/coeur (non exportée de core).
const MAP_NAME_MAX_LENGTH = 40;
// L'éditeur ignore le format de la future salle: la validation rappelle celui par défaut.
const DEFAULT_REQUIREMENT: SpawnRequirement = { mode: 'team', teamCount: 2, playersPerTeam: 1 };

export class EditorScreen implements Screen {
  private readonly actions: EditorActions;
  private readonly tileset: TilesetDefinition;
  private readonly root: HTMLElement;
  private readonly titleLine: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly widthInput: HTMLInputElement;
  private readonly heightInput: HTMLInputElement;
  private readonly mapSelect: HTMLSelectElement;
  private readonly importInput: HTMLInputElement;
  private readonly canvasNode: HTMLCanvasElement;
  private readonly canvas: MapCanvas;
  private readonly palette: EditorPalette;
  private readonly issueList: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly formatLine: HTMLElement;
  private readonly errorLine: HTMLElement;
  private state: EditorState;
  private painting = false;
  private lastTile: TileCoordinates | null = null;

  constructor(actions: EditorActions, tileset: TilesetDefinition, initialName: string) {
    this.actions = actions;
    this.tileset = tileset;
    this.root = document.createElement('div');
    this.root.className = 'screen editor';
    this.titleLine = element('h1', 'editor-title', this.root);
    this.titleLine.textContent = TITLE;

    const toolbar = element('div', 'editor-toolbar', this.root);
    this.nameInput = field(toolbar, 'Name', 'text', 'editor-input editor-name');
    this.nameInput.maxLength = MAP_NAME_MAX_LENGTH;
    this.nameInput.value = initialName;
    this.nameInput.addEventListener('input', () => {
      this.update(renameDocument(this.state, this.nameInput.value));
    });
    this.widthInput = sizeField(toolbar, 'W', DEFAULT_WIDTH);
    this.heightInput = sizeField(toolbar, 'H', DEFAULT_HEIGHT);
    button('New', 'editor-button', toolbar, () => {
      this.onNew();
    });
    this.mapSelect = document.createElement('select');
    this.mapSelect.className = 'editor-select';
    toolbar.appendChild(this.mapSelect);
    button('Load', 'editor-button', toolbar, () => {
      this.onLoad();
    });
    button('Save', 'editor-button', toolbar, () => {
      this.onSave();
    });
    button('Export', 'editor-button', toolbar, () => {
      this.onExport();
    });
    this.importInput = field(toolbar, 'Import', 'file', 'editor-import');
    this.importInput.accept = 'application/json,.json';
    this.importInput.addEventListener('change', () => {
      this.onImport();
    });
    button('Validate', 'editor-button', toolbar, () => {
      this.onValidate();
    });
    button('Test', 'editor-button', toolbar, () => {
      this.actions.testMap(this.state.document);
    });
    button('Back', 'editor-back', toolbar, () => {
      this.actions.back();
    });

    const body = element('div', 'editor-body', this.root);
    this.palette = new EditorPalette(body, tileset, () => {
      this.update(this.state);
    });
    this.canvasNode = document.createElement('canvas');
    this.canvasNode.className = 'editor-canvas';
    body.appendChild(this.canvasNode);
    this.canvas = new MapCanvas(this.canvasNode, tileset, PIXELS_PER_TILE);
    this.bindPointer();

    this.issueList = element('ul', 'editor-issues', this.root);
    this.statusLine = element('div', 'editor-status', this.root);
    this.formatLine = element('div', 'editor-status editor-format', this.root);
    this.errorLine = element('div', 'editor-errors', this.root);
    this.errorLine.setAttribute('aria-live', 'polite');

    this.state = loadDocument(
      newMapDocument(initialName, DEFAULT_WIDTH, DEFAULT_HEIGHT, this.tileset),
    );
    this.update(this.state);
  }

  mount(root: HTMLElement): void {
    // Une erreur ne survit pas au remontage de l'écran: elle parlait de la session précédente.
    this.errorLine.textContent = '';
    root.appendChild(this.root);
    this.update(this.state);
  }

  unmount(): void {
    this.root.remove();
  }

  setMaps(maps: MapSummary[]): void {
    const selected = this.mapSelect.value;
    this.mapSelect.replaceChildren();
    for (const map of maps) {
      const option = document.createElement('option');
      option.value = map.id;
      option.textContent = `${map.name} (${String(map.width)}×${String(map.height)})`;
      this.mapSelect.appendChild(option);
    }
    if (maps.some((map) => map.id === selected)) this.mapSelect.value = selected;
  }

  showDocument(document: MapDocument): void {
    this.nameInput.value = document.name;
    this.widthInput.value = String(document.width);
    this.heightInput.value = String(document.height);
    this.canvas.setHighlight(null);
    this.update(loadDocument(document));
    this.setStatus(`loaded "${document.name}" as ${document.id}`);
  }

  showSaved(id: string): void {
    this.update(withDocumentId(this.state, id));
    this.setStatus(`saved as ${id}`);
  }

  setStatus(status: string): void {
    this.statusLine.textContent = status;
  }

  showError(message: string): void {
    this.errorLine.textContent = message;
  }

  private bindPointer(): void {
    this.canvasNode.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.painting = true;
      this.lastTile = null;
      this.paintAt(event);
    });
    this.canvasNode.addEventListener('mousemove', (event) => {
      if (this.painting) this.paintAt(event);
    });
    this.canvasNode.addEventListener('mouseup', () => {
      this.endStroke();
    });
    this.canvasNode.addEventListener('mouseleave', () => {
      this.endStroke();
    });
    this.canvasNode.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const tile = this.canvas.tileAt(event.clientX, event.clientY);
      if (tile !== null) this.update(removeAt(this.state, tile.x, tile.y));
    });
  }

  // Une même case ne se repeint pas pendant le trait: le survol la traverserait des dizaines de fois.
  private paintAt(event: MouseEvent): void {
    const tile = this.canvas.tileAt(event.clientX, event.clientY);
    if (tile === null) return;
    if (this.lastTile !== null && this.lastTile.x === tile.x && this.lastTile.y === tile.y) return;
    this.lastTile = tile;
    const next = applyTool(this.state, tile.x, tile.y);
    // Une trame de spawn inchangée alors que l'outil "spawn" est actif signale le plafond atteint.
    if (next === this.state && this.state.tool.kind === 'spawn') {
      this.setStatus(`the map already has the maximum of ${String(MAP_MAX_SPAWNS)} spawns`);
      return;
    }
    this.update(next);
  }

  private endStroke(): void {
    this.painting = false;
    this.lastTile = null;
  }

  private onNew(): void {
    const name = this.nameInput.value.trim().length === 0 ? 'New map' : this.nameInput.value;
    const doc = newMapDocument(name, size(this.widthInput), size(this.heightInput), this.tileset);
    this.nameInput.value = doc.name;
    this.widthInput.value = String(doc.width);
    this.heightInput.value = String(doc.height);
    this.canvas.setHighlight(null);
    this.update(loadDocument(doc));
    this.setStatus(`new ${String(doc.width)}×${String(doc.height)} map`);
  }

  private onLoad(): void {
    const id = this.mapSelect.value;
    if (id.length === 0) {
      this.showError('no map to load');
      return;
    }
    this.errorLine.textContent = '';
    this.actions.getMap(id);
  }

  private onSave(): void {
    this.errorLine.textContent = '';
    this.setStatus('saving…');
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

  private onImport(): void {
    const file = this.importInput.files?.[0];
    if (file === undefined) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        this.showDocument(parseMapFile(String(reader.result)));
        this.errorLine.textContent = '';
      } catch (error) {
        this.showError(error instanceof Error ? error.message : String(error));
      }
      this.importInput.value = '';
    });
    reader.addEventListener('error', () => {
      this.showError(`could not read ${file.name}`);
      this.importInput.value = '';
    });
    reader.readAsText(file);
  }

  private onValidate(): void {
    this.update(this.state);
    const count = this.state.issues.length;
    this.setStatus(count === 0 ? 'no issue' : `${String(count)} issue(s)`);
    const format = spawnIssues(this.state.document, DEFAULT_REQUIREMENT);
    this.formatLine.textContent =
      format.length === 0
        ? 'team 2×1: enough spawns'
        : `team 2×1: ${format.map((issue) => issue.message).join('; ')}`;
  }

  // Une modification périme le repère d'anomalie: il désignait une case qui a pu changer.
  private update(next: EditorState): void {
    this.state = withIssues({ ...next, tool: this.palette.tool }, this.tileset, null);
    this.canvas.setHighlight(null);
    this.canvas.draw(this.state);
    this.renderIssues();
    this.titleLine.textContent = this.state.dirty ? `${TITLE} *` : TITLE;
  }

  private renderIssues(): void {
    this.issueList.replaceChildren();
    for (const issue of this.state.issues) {
      const item = element('li', 'editor-issue', this.issueList);
      item.textContent = issue.message;
      if (issue.x === undefined || issue.y === undefined) continue;
      item.classList.add('editor-issue-located');
      item.addEventListener('click', () => {
        this.focusIssue(issue);
      });
    }
  }

  private focusIssue(issue: MapIssue): void {
    if (issue.x === undefined || issue.y === undefined) return;
    this.canvas.setHighlight({ x: issue.x, y: issue.y });
    this.canvas.draw(this.state);
  }
}

function sizeField(parent: HTMLElement, label: string, value: number): HTMLInputElement {
  const input = field(parent, label, 'number', 'editor-input editor-size');
  input.min = String(MAP_MIN_SIZE);
  input.max = String(MAP_MAX_SIZE);
  input.value = String(value);
  return input;
}

function size(input: HTMLInputElement): number {
  const parsed = Number.parseInt(input.value, 10);
  return Number.isInteger(parsed) ? parsed : MAP_MIN_SIZE;
}
